/**
 * Nomad Extension — Watch jobs/allocations and fetch logs.
 *
 * Uses Nomad's blocking-query API (?index=&wait=) for long-polling instead of
 * arbitrary bash timeouts. Tools block until the job/allocation reaches a
 * terminal state, then return results immediately to the LLM.
 *
 * Requires:
 *   - NOMAD_ADDR environment variable (or pass addr param per call)
 *   - NOMAD_TOKEN environment variable (or pass token param per call)
 *
 * Tools:
 *   nomad_watch   — Watch a job or allocation until terminal state,
 *                   using Nomad blocking queries (no polling).
 *   nomad_logs    — Fetch logs from a finished allocation task.
 *   nomad_submit  — Submit a job spec (HCL or JSON) and optionally watch it.
 *
 * Workflow:
 *   1. Write job spec .hcl file     (write tool)
 *   2. bash: nomad run spec.hcl     (or use nomad_submit)
 *   3. nomad_watch job=<name>       (blocks until terminal, returns immediately)
 *   4. nomad_logs alloc=<id> task=<task>  (get output)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─── Nomad API helpers ───────────────────────────────────────────────────────

interface NomadOpts {
  addr: string;
  token?: string;
}

function headers(opts: NomadOpts): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) {
    h["X-Nomad-Token"] = opts.token;
  }
  return h;
}

function nomadAddr(): string {
  return process.env.NOMAD_ADDR ?? "";
}

function nomadToken(): string {
  return process.env.NOMAD_TOKEN ?? "";
}

/**
 * Perform a blocking-query GET against the Nomad API.
 * The server holds the connection until the resource changes or wait expires.
 * Returns { data, nomadIndex } for the next polling cycle.
 */
async function nomadGet<T>(
  path: string,
  opts: NomadOpts,
  options?: { index?: number; wait?: string; signal?: AbortSignal },
): Promise<{ data: T; nomadIndex: number }> {
  const base = opts.addr.replace(/\/+$/, "");
  const url = new URL(path, base);
  if (options?.index !== undefined) url.searchParams.set("index", String(options.index));
  if (options?.wait) url.searchParams.set("wait", options.wait);

  const resp = await fetch(url.toString(), {
    headers: headers(opts),
    signal: options?.signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "(no body)");
    throw new Error(`Nomad API error ${resp.status} ${resp.statusText}: ${body}`);
  }

  const nomadIndex = Number(resp.headers.get("X-Nomad-Index") ?? "0");
  const data = (await resp.json()) as T;
  return { data, nomadIndex };
}

/**
 * POST to the Nomad API.
 */
async function nomadPost<T>(
  path: string,
  body: unknown,
  opts: NomadOpts,
  signal?: AbortSignal,
): Promise<T> {
  const base = opts.addr.replace(/\/+$/, "");
  const url = new URL(path, base);
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: headers(opts),
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "(no body)");
    throw new Error(`Nomad API error ${resp.status}: ${errBody}`);
  }
  return resp.json() as Promise<T>;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface NomadAllocTaskEvent {
  Type: string;
  Time: number;
  Message?: string;
  ExitCode?: number;
  Signal?: number;
  DriverError?: string;
  KillError?: string;
}

interface NomadAllocTaskState {
  State: string;        // "running" | "pending" | "dead"
  Failed: boolean;
  Restarts: number;
  StartedAt: string;
  FinishedAt?: string;
  Events?: NomadAllocTaskEvent[];
}

interface NomadAlloc {
  ID: string;
  Name: string;
  Namespace: string;
  JobID: string;
  TaskGroup: string;
  ClientStatus: string;   // "pending" | "running" | "complete" | "failed" | "lost" | "unknown"
  DesiredStatus: string;  // "run" | "stop" | "evict"
  CreateTime: number;
  ModifyTime: number;
  TaskStates?: Record<string, NomadAllocTaskState>;
}

interface NomadJob {
  ID: string;
  Name: string;
  Namespace: string;
  Type: string;           // "service" | "batch" | "system"
  Status: string;         // "pending" | "running" | "dead"
  StatusDescription?: string;
  CreateIndex: number;
  ModifyIndex: number;
}

interface NomadDeployment {
  ID: string;
  JobID: string;
  JobVersion: number;
  Status: string;           // "running" | "successful" | "failed" | "cancelled"
  StatusDescription?: string;
  TaskGroups?: Record<string, {
    Desired: number;
    Placed: number;
    Healthy: number;
    Unhealthy: number;
    ProgressDeadline?: number;
  }>;
}

interface NomadSubmitResult {
  ID?: string;
  Name?: string;
  EvalID?: string;
  EvalCreateIndex?: number;
  JobModifyIndex?: number;
  Warnings?: string;
  NextToken?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_WAIT = "5m";
const SHORT_WAIT = "30s";
const TERMINAL_ALLOC_STATUSES = new Set(["complete", "failed", "lost"]);
const TERMINAL_JOB_STATUS = "dead";
const TERMINAL_DEPLOY_STATUSES = new Set(["successful", "failed", "cancelled"]);
const MAX_WATCH_ATTEMPTS = 360; // 360 * ~30s min effective = ~3hr worst case
const MAX_LOG_BYTES = 50 * 1024; // keep log output from blowing context

// ─── Parameter schemas ───────────────────────────────────────────────────────

const addrTokenFields = {
  addr: Type.Optional(Type.String({
    description: "Nomad HTTP API address (default: $NOMAD_ADDR)",
  })),
  token: Type.Optional(Type.String({
    description: "Nomad ACL token (default: $NOMAD_TOKEN)",
  })),
} as const;

const nomadWatchParams = Type.Object({
  ...addrTokenFields,
  job: Type.Optional(Type.String({
    description: "Job ID or name to watch (e.g. 'my-job' or 'my-job/my-namespace')",
  })),
  alloc: Type.Optional(Type.String({
    description: "Allocation ID to watch (alternative to job)",
  })),
  task: Type.Optional(Type.String({
    description: "Task name to check exit code (default: first task in allocation)",
  })),
  wait: Type.Optional(Type.String({
    description: "Blocking query max wait duration (default: '10m', e.g. '5m', '30s')",
  })),
  logs: Type.Optional(Type.Boolean({
    description: "If true, fetch task logs once the allocation is terminal (no 404 race). Requires task=.",
  })),
});

const nomadLogsParams = Type.Object({
  ...addrTokenFields,
  alloc: Type.String({ description: "Allocation ID (e.g. '9779b4c1-...')" }),
  task: Type.String({ description: "Task name (e.g. 'docker-build')" }),
  type: Type.Optional(Type.String({
    description: "Log stream: 'stdout' (default) or 'stderr'",
  })),
  origin: Type.Optional(Type.String({
    description: "Read position: 'start' (default, beginning) or 'end' (last 50KB)",
  })),
});

const nomadSubmitParams = Type.Object({
  ...addrTokenFields,
  spec: Type.String({
    description: "Path to Nomad job spec file (.hcl or .json)",
  }),
  watch: Type.Optional(Type.Boolean({
    description: "If true (default), block until job reaches terminal state",
  })),
  wait: Type.Optional(Type.String({
    description: "Blocking query max wait duration (default: '10m')",
  })),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveOpts(params: { addr?: string; token?: string }): NomadOpts {
  const addr = params.addr || nomadAddr();
  if (!addr) {
    throw new Error(
      "Nomad address not set. Set NOMAD_ADDR env var or pass addr=<url> parameter.",
    );
  }
  return { addr, token: params.token || nomadToken() || undefined };
}

function isAllocTerminal(alloc: NomadAlloc): boolean {
  return TERMINAL_ALLOC_STATUSES.has(alloc.ClientStatus);
}

/**
 * Fetch a log stream for a task in an allocation. Returns trimmed, tail-truncated
 * text. Never throws for the common "not ready" / "unavailable" cases — returns a
 * short placeholder instead, so callers can chain safely.
 */
async function fetchLogs(
  allocId: string,
  task: string,
  type: "stdout" | "stderr",
  opts: NomadOpts,
  signal?: AbortSignal,
): Promise<string> {
  const base = opts.addr.replace(/\/+$/, "");
  const url = new URL(`/v1/client/fs/logs/${allocId}`, base);
  url.searchParams.set("task", task);
  url.searchParams.set("type", type);
  url.searchParams.set("origin", "end");
  url.searchParams.set("offset", String(MAX_LOG_BYTES));
  url.searchParams.set("plain", "true");

  const resp = await fetch(url.toString(), { headers: headers(opts), signal });
  if (!resp.ok) {
    if (resp.status === 404) return `[no ${type} for task "${task}"]`;
    if (resp.status >= 500) return `[${type} unavailable for task "${task}" (client down?)]`;
    const body = await resp.text().catch(() => "(no body)");
    throw new Error(`Nomad logs API error ${resp.status}: ${body}`);
  }

  const text = (await resp.text()).trim();
  if (!text) return `[no ${type} output]`;
  if (text.length > MAX_LOG_BYTES) {
    return `[…truncated to last ${MAX_LOG_BYTES / 1024}KB…]\n${text.slice(-MAX_LOG_BYTES)}`;
  }
  return text;
}

/**
 * Describe a single allocation's state.
 */
function formatAlloc(alloc: NomadAlloc): string {
  const lines: string[] = [
    `Alloc ${alloc.ID} (${alloc.TaskGroup}): ${alloc.ClientStatus}` +
    ` (desired: ${alloc.DesiredStatus})`,
  ];

  if (alloc.TaskStates) {
    for (const [name, ts] of Object.entries(alloc.TaskStates)) {
      let desc = `  ${name}: ${ts.State}`;
      if (ts.State === "dead") {
        const lastEvent = ts.Events?.slice().reverse()
          .find(e => e.ExitCode !== undefined || e.Type === "terminated");
        if (lastEvent) {
          if (lastEvent.ExitCode !== undefined) desc += ` exit=${lastEvent.ExitCode}`;
          if (lastEvent.Signal !== undefined) desc += ` signal=${lastEvent.Signal}`;
          if (lastEvent.Message) desc += ` (${lastEvent.Message})`;
        }
        if (ts.Failed) desc += " FAILED";
      }
      desc += ` restarts=${ts.Restarts}`;
      lines.push(desc);
    }
  }

  return lines.join("\n");
}

/**
 * Block (via Nomad blocking queries) until an allocation reaches terminal
 * state or the signal fires.
 */
async function watchAlloc(
  allocId: string,
  taskFilter: string | undefined,
  opts: NomadOpts,
  signal?: AbortSignal,
  wait?: string,
): Promise<{
  status: string;
  allocations: NomadAlloc[];
  summary: string;
  exitCode?: number;
}> {
  let index: number | undefined;
  const path = `/v1/allocation/${allocId}`;

  for (let attempt = 0; attempt < MAX_WATCH_ATTEMPTS; attempt++) {
    const { data: alloc, nomadIndex } = await nomadGet<NomadAlloc>(
      path, opts, { index, wait: wait ?? DEFAULT_WAIT, signal },
    );
    index = nomadIndex;

    if (signal?.aborted) {
      return {
        status: alloc.ClientStatus,
        allocations: [alloc],
        summary: formatAlloc(alloc),
        exitCode: extractExitCode(alloc, taskFilter),
      };
    }

    if (isAllocTerminal(alloc)) {
      return {
        status: alloc.ClientStatus,
        allocations: [alloc],
        summary: formatAlloc(alloc),
        exitCode: extractExitCode(alloc, taskFilter),
      };
    }
  }

  // Shouldn't normally happen — user would Escape first
  throw new Error("Watch reached maximum attempts without completion");
}

function extractExitCode(alloc: NomadAlloc, taskFilter?: string): number | undefined {
  if (!alloc.TaskStates) return undefined;
  const entries = Object.entries(alloc.TaskStates);
  const candidate = taskFilter
    ? entries.find(([n]) => n === taskFilter)
    : entries[0];
  if (!candidate) return undefined;
  const [, ts] = candidate;
  const lastEvent = ts.Events?.slice().reverse()
    .find(e => e.ExitCode !== undefined);
  return lastEvent?.ExitCode;
}

/**
 * Block (via Nomad blocking queries) until a job reaches terminal state
 * (all allocations complete/fail or job status is "dead").
 */
/**
 * Fetch the latest deployment for a job (if any).
 */
async function fetchLatestDeployment(
  jobId: string,
  opts: NomadOpts,
  signal?: AbortSignal,
): Promise<NomadDeployment | undefined> {
  const path = `/v1/job/${encodeURIComponent(jobId)}/deployments`;
  try {
    const { data: deployments } = await nomadGet<NomadDeployment[]>(path, opts, { signal });
    return deployments?.[0];
  } catch {
    return undefined;
  }
}

/**
 * Watch a service job by following its latest deployment.
 * Blocks until the deployment reaches a terminal state or the signal fires.
 */
async function watchDeployment(
  jobId: string,
  taskFilter: string | undefined,
  opts: NomadOpts,
  signal?: AbortSignal,
  wait?: string,
): Promise<{
  status: string;
  job: NomadJob | null;
  allocations: NomadAlloc[];
  summary: string;
  exitCode?: number;
}> {
  const jobPath = `/v1/job/${encodeURIComponent(jobId)}`;
  const allocsPath = `/v1/job/${encodeURIComponent(jobId)}/allocations`;
  let job: NomadJob | null = null;
  let deploymentIndex: number | undefined;
  let jobIndex: number | undefined;

  for (let attempt = 0; attempt < MAX_WATCH_ATTEMPTS; attempt++) {
    // Fetch job info (with blocking query)
    try {
      const r = await nomadGet<NomadJob>(jobPath, opts, {
        index: jobIndex,
        wait: wait ?? DEFAULT_WAIT,
        signal,
      });
      job = r.data;
      jobIndex = r.nomadIndex;
    } catch (err: unknown) {
      if (attempt < 5 && err instanceof Error && err.message.includes("404")) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }

    if (signal?.aborted) {
      const { data: allocs } = await nomadGet<NomadAlloc[]>(allocsPath, opts, { signal });
      return formatJobResult(job, allocs, taskFilter, signal, "deployment-aborted");
    }

    // Fetch the latest deployment (non-blocking first, then with index)
    const deployPath = `/v1/job/${encodeURIComponent(jobId)}/deployments`;
    let deployments: NomadDeployment[];
    try {
      const r = await nomadGet<NomadDeployment[]>(deployPath, opts, {
        index: deploymentIndex,
        wait: SHORT_WAIT,
        signal,
      });
      deployments = r.data;
      deploymentIndex = r.nomadIndex;
    } catch {
      // Fallback: just check allocs
      const { data: allocs } = await nomadGet<NomadAlloc[]>(allocsPath, opts, { signal });
      return formatJobResult(job, allocs, taskFilter, signal, "deployment-unavailable");
    }

    const deployment = deployments?.[0];

    // Fetch current allocs
    const { data: allocs } = await nomadGet<NomadAlloc[]>(allocsPath, opts, { signal });

    // Terminal if deployment is done, or job is stopped
    if (deployment && TERMINAL_DEPLOY_STATUSES.has(deployment.Status)) {
      return formatJobResult(job, allocs, taskFilter, signal, deployment.Status);
    }
    if (job.Status === TERMINAL_JOB_STATUS) {
      return formatJobResult(job, allocs, taskFilter, signal, "job-stopped");
    }
  }

  throw new Error("Watch reached maximum attempts without completion");
}

/**
 * Block (via Nomad blocking queries) until a job reaches a terminal state.
 *
 * For batch jobs: waits until all allocations are complete/failed/lost.
 * For service jobs: waits until the latest deployment completes successfully
 *   or the job is stopped.
 */
async function watchJob(
  jobId: string,
  taskFilter: string | undefined,
  opts: NomadOpts,
  signal?: AbortSignal,
  wait?: string,
): Promise<{
  status: string;
  job: NomadJob | null;
  allocations: NomadAlloc[];
  summary: string;
  exitCode?: number;
}> {
  const jobPath = `/v1/job/${encodeURIComponent(jobId)}`;
  const allocsPath = `/v1/job/${encodeURIComponent(jobId)}/allocations`;
  let job: NomadJob | null = null;
  let allocIndex: number | undefined;

  // First, fetch the job to determine its type
  try {
    const r = await nomadGet<NomadJob>(jobPath, opts, { signal });
    job = r.data;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("404")) {
      // Job doesn't exist yet — will retry below
    } else {
      throw err;
    }
  }

  // Service jobs: delegate to deployment watcher
  if (job && (job.Type === "service" || job.Type === "system")) {
    return watchDeployment(jobId, taskFilter, opts, signal, wait);
  }

  // Batch jobs: watch allocations with blocking queries
  for (let attempt = 0; attempt < MAX_WATCH_ATTEMPTS; attempt++) {
    // Fetch job (non-blocking after first call — we block on allocs instead)
    if (!job || attempt > 0) {
      try {
        const r = await nomadGet<NomadJob>(jobPath, opts, {
          index: allocIndex, // use allocIndex as proxy; nominal, not the job index
          wait: DEFAULT_WAIT,
          signal,
        });
        job = r.data;
      } catch (err: unknown) {
        if (attempt < 5 && err instanceof Error && err.message.includes("404")) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    }

    // Block/wait on allocations endpoint — this detects alloc state changes
    let allocs: NomadAlloc[];
    try {
      const r = await nomadGet<NomadAlloc[]>(allocsPath, opts, {
        index: allocIndex,
        wait: wait ?? DEFAULT_WAIT,
        signal,
      });
      allocs = r.data;
      allocIndex = r.nomadIndex;
    } catch (err: unknown) {
      if (attempt < 5 && err instanceof Error && err.message.includes("404")) {
        // Job not yet visible — retry
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }

    if (signal?.aborted) {
      return formatJobResult(job, allocs, taskFilter, signal, "aborted");
    }

    // Terminal if job is dead or all allocations are terminal
    if (job.Status === TERMINAL_JOB_STATUS) {
      return formatJobResult(job, allocs, taskFilter, signal, "dead");
    }
    if (allocs.length > 0 && allocs.every(a => isAllocTerminal(a))) {
      return formatJobResult(job, allocs, taskFilter, signal, "all-terminal");
    }
  }

  throw new Error("Watch reached maximum attempts without completion");
}

function formatJobResult(
  job: NomadJob | null,
  allocs: NomadAlloc[],
  taskFilter?: string,
  signal?: AbortSignal,
  reason?: string,
): {
  status: string;
  job: NomadJob | null;
  allocations: NomadAlloc[];
  summary: string;
  exitCode?: number;
} {
  const lines: string[] = [];
  const aborted = signal?.aborted ?? false;
  const terminalAllocs = allocs.filter(a => isAllocTerminal(a));
  const nonTerminalAllocs = allocs.filter(a => !isAllocTerminal(a));

  if (job) {
    lines.push(
      `Job ${job.Name} (${job.Type}): ${job.Status}` +
      (job.StatusDescription ? ` — ${job.StatusDescription}` : ""),
    );
  }

  // Explain why the watch ended
  if (aborted) {
    lines.push("(Watching aborted by user — results are partial)");
  } else if (reason === "successful") {
    lines.push("(Deployment completed successfully)");
  } else if (reason === "failed") {
    lines.push("(Deployment FAILED)");
  } else if (reason === "cancelled") {
    lines.push("(Deployment cancelled)");
  } else if (reason === "job-stopped") {
    lines.push("(Job was stopped)");
  } else if (reason === "deployment-aborted" || reason === "aborted") {
    lines.push("(Watch interrupted)");
  }

  if (terminalAllocs.length > 0) {
    lines.push(...terminalAllocs.map(formatAlloc));
  }
  if (nonTerminalAllocs.length > 0) {
    lines.push(`\n${nonTerminalAllocs.length} allocation(s) still running:`);
    lines.push(...nonTerminalAllocs.map(formatAlloc));
  }

  const exitCode = terminalAllocs.length > 0
    ? extractExitCode(terminalAllocs[0], taskFilter)
    : undefined;

  return {
    status: job?.Status ?? "unknown",
    job,
    allocations: allocs,
    summary: lines.join("\n"),
    exitCode,
  };
}

// ─── Tool: nomad_watch ───────────────────────────────────────────────────────

const toolNomadWatch = {
  name: "nomad_watch",
  label: "Nomad Watch",
  description: [
    "Watch a Nomad job or allocation until it reaches a terminal state",
    "(complete, failed, or lost) or until a service deployment completes.",
    "Uses Nomad's blocking-query API — the server holds the connection",
    "until the resource changes, so there is no polling and no arbitrary",
    "timeout.",
    "Press Escape to abort and return partial results.",
  ].join(" "),
  promptSnippet: "Watch a Nomad job or allocation until it finishes",
  promptGuidelines: [
    "Use nomad_watch after submitting or dispatching a batch job to wait for it to complete.",
    "For service jobs, nomad_watch follows the deployment — it returns when the deployment succeeds or fails.",
    "Pass job=<name> to watch by job name (dispatched job IDs work too), or alloc=<id> for a specific allocation.",
    "The tool blocks efficiently using Nomad's long-poll API — no timeout needed and no arbitrary bash timeouts.",
    "Pass logs=true with task=<name> to fetch that task's stdout+stderr automatically once the job is terminal (avoids the log 404 race). Otherwise call nomad_logs afterward with the full alloc ID from the result.",
  ],
  parameters: nomadWatchParams,
  async execute(
    _toolCallId: string,
    params: {
      job?: string;
      alloc?: string;
      task?: string;
      addr?: string;
      token?: string;
      wait?: string;
      logs?: boolean;
    },
    signal?: AbortSignal,
  ) {
    const opts = resolveOpts(params);

    if (!params.job && !params.alloc) {
      return {
        content: [{ type: "text", text: "Provide either job=<name> or alloc=<id>" }],
        details: {},
      };
    }

    const result = params.alloc
      ? await watchAlloc(params.alloc, params.task, opts, signal, params.wait)
      : await watchJob(params.job!, params.task, opts, signal, params.wait);

    let text = result.exitCode !== undefined
      ? `${result.summary}\n\nExit code: ${result.exitCode}`
      : result.summary;

    // Optionally fetch logs once terminal — no 404 race since the task has finished.
    if (params.logs) {
      if (!params.task) {
        text += "\n\n[logs=true requires task=<name>; skipping log fetch]";
      } else {
        const terminal = result.allocations.filter(isAllocTerminal);
        const target = terminal[0] ?? result.allocations[0];
        if (target) {
          const [out, err] = await Promise.all([
            fetchLogs(target.ID, params.task, "stdout", opts, signal),
            fetchLogs(target.ID, params.task, "stderr", opts, signal),
          ]);
          text += `\n\n── ${params.task} stdout ──\n${out}\n\n── ${params.task} stderr ──\n${err}`;
        }
      }
    }

    return {
      content: [{ type: "text", text }],
      details: {
        status: result.status,
        jobStatus: params.alloc ? undefined : (result as { job?: NomadJob | null }).job?.Status,
        exitCode: result.exitCode,
        allocIds: result.allocations.map((a) => a.ID),
        partial: signal?.aborted ?? false,
      },
    };
  },
};

// ─── Tool: nomad_logs ────────────────────────────────────────────────────────

const toolNomadLogs = {
  name: "nomad_logs",
  label: "Nomad Logs",
  description: [
    "Fetch logs from a Nomad allocation task.",
    "Returns stdout (default) or stderr output.",
    "Use origin='start' (default) for full logs, 'end' for last ~50KB.",
  ].join(" "),
  promptSnippet: "Fetch logs from a Nomad allocation task",
  promptGuidelines: [
    "Use nomad_logs after nomad_watch completes to get the task output.",
    "Specify alloc=<id> and task=<name>. Use type='stderr' for error output.",
  ],
  parameters: nomadLogsParams,
  async execute(
    _toolCallId: string,
    params: {
      alloc: string;
      task: string;
      type?: string;
      origin?: string;
      addr?: string;
      token?: string;
    },
    signal?: AbortSignal,
  ) {
    const opts = resolveOpts(params);
    const logType = params.type ?? "stdout";
    const origin = params.origin ?? "start";

    const base = opts.addr.replace(/\/+$/, "");
    const url = new URL(`/v1/client/fs/logs/${params.alloc}`, base);
    url.searchParams.set("task", params.task);
    url.searchParams.set("type", logType);
    url.searchParams.set("origin", origin);

    // When origin=end, we want the tail. When origin=start, start from 0.
    if (origin === "start") {
      url.searchParams.set("offset", "0");
    }

    const resp = await fetch(url.toString(), {
      headers: headers(opts),
      signal,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "(no body)");
      // Common case: task hasn't produced output yet
      if (resp.status === 404) {
        return {
          content: [{ type: "text", text: `[No logs yet for task "${params.task}" — it may not have started or produced output]` }],
          details: { alloc: params.alloc, task: params.task, type: logType, exists: false },
        };
      }
      // Logs might not be available if the client is down
      if (resp.status === 500 || resp.status === 502) {
        return {
          content: [{ type: "text", text: `[Logs unavailable for task "${params.task}" (Nomad client may be unavailable)]` }],
          details: { alloc: params.alloc, task: params.task, type: logType, exists: false, error: body },
        };
      }
      throw new Error(`Nomad logs API error ${resp.status}: ${body}`);
    }

    const text = await resp.text();
    const trimmed = text.trim();

    return {
      content: [{ type: "text", text: trimmed || `[No ${logType} output from task "${params.task}"]` }],
      details: {
        alloc: params.alloc,
        task: params.task,
        type: logType,
        bytes: text.length,
      },
    };
  },
};

// ─── Tool: nomad_submit ──────────────────────────────────────────────────────

const toolNomadSubmit = {
  name: "nomad_submit",
  label: "Nomad Submit",
  description: [
    "Submit a Nomad job spec file (HCL or JSON) and optionally watch it.",
    "By default blocks until the job reaches terminal state using Nomad blocking queries.",
    "Set watch=false to submit and return immediately (then use nomad_watch separately).",
  ].join(" "),
  promptSnippet: "Submit a Nomad job spec and wait for it to finish",
  promptGuidelines: [
    "Use nomad_submit when you have a job spec file ready.",
    "It reads the file, submits via the Nomad HTTP API, and waits for completion.",
    "Alternatively, write the spec with the write tool, submit with bash 'nomad run',",
    "then use nomad_watch to monitor — that gives more control.",
  ],
  parameters: nomadSubmitParams,
  async execute(
    _toolCallId: string,
    params: {
      spec: string;
      watch?: boolean;
      addr?: string;
      token?: string;
      wait?: string;
    },
    signal?: AbortSignal,
  ) {
    const opts = resolveOpts(params);
    const shouldWatch = params.watch !== false;

    // Read the job spec file
    let specContent: string;
    try {
      const fs = await import("node:fs/promises");
      specContent = await fs.readFile(params.spec, "utf-8");
    } catch (err: any) {
      throw new Error(`Cannot read job spec "${params.spec}": ${err.message}`);
    }

    // Detect format: HCL or JSON
    const trimmed = specContent.trim();
    const isJson = trimmed.startsWith("{") || trimmed.startsWith("[");

    let submitResult: NomadSubmitResult;
    if (isJson) {
      // Submit as JSON job spec
      submitResult = await nomadPost<NomadSubmitResult>(
        "/v1/jobs", JSON.parse(specContent), opts, signal,
      );
    } else {
      // Submit as HCL via JobHCL field
      submitResult = await nomadPost<NomadSubmitResult>(
        "/v1/jobs", { JobHCL: specContent, Canonicalize: true }, opts, signal,
      );
    }

    const jobId = submitResult.Name ?? submitResult.ID ?? "(unknown)";
    const evalId = submitResult.EvalID ?? "";

    if (!shouldWatch) {
      const lines = [`Submitted job "${jobId}"`];
      if (evalId) lines.push(`Eval ID: ${evalId}`);
      if (submitResult.Warnings) lines.push(`\nWarnings:\n${submitResult.Warnings}`);
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { jobId, evalId, warnings: submitResult.Warnings },
      };
    }

    // Watch for completion
    const result = await watchJob(jobId, undefined, opts, signal, params.wait);
    const lines = [
      `Submitted job "${jobId}"` + (evalId ? `, eval ${evalId}` : ""),
      submitResult.Warnings ? `\nWarnings:\n${submitResult.Warnings}` : "",
      "",
      result.summary,
    ];
    if (result.exitCode !== undefined) {
      lines.push(`\nExit code: ${result.exitCode}`);
    }

    return {
      content: [{ type: "text", text: lines.filter(Boolean).join("\n") }],
      details: {
        jobId,
        evalId,
        status: result.status,
        exitCode: result.exitCode,
        partial: signal?.aborted ?? false,
      },
    };
  },
};

// ─── Extension entry point ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool(toolNomadWatch);
  pi.registerTool(toolNomadLogs);
  pi.registerTool(toolNomadSubmit);

  // (No UI chrome — tools speak for themselves)
}
