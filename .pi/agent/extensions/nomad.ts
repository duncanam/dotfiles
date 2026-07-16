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
 *   nomad_watch    — Watch a job or allocation until terminal state, using
 *                    Nomad blocking queries (no polling).
 *   nomad_logs     — Fetch logs from a finished allocation task.
 *   nomad_dispatch — Dispatch a pre-registered parameterized job.
 *   nomad_submit   — Submit a job spec (HCL or JSON) and optionally watch it.
 *   nomad_nodes    — List nodes or inspect one node's GPU/CPU/memory
 *                    fingerprint.
 *   nomad_jobs     — List jobs or read one job's full spec.
 *   nomad_allocs   — List allocations for a node or job.
 *   nomad_get      — Read-only generic GET for any other Nomad API endpoint.
 *
 * Discovery workflow (read-only, before writing a job spec):
 *   1. nomad_nodes                       (find a node name/ID + GPU fingerprint)
 *   2. nomad_allocs node=<name>          (see what already consumes that node)
 *   3. nomad_jobs job=<existing-job>     (copy port/service/device conventions)
 *
 * Run workflow (mutating):
 *   1. Write job spec .hcl file           (write tool)
 *   2. nomad_submit spec=<path>          (submit and optionally watch)
 *   3. nomad_watch job=<name>            (blocks until terminal, returns immediately)
 *   4. nomad_logs alloc=<id> task=<task> (get output)
 *
 * Agent-manager leads use a coordinated parameterized-job dispatch interface
 * built on the exported helpers below. Direct Nomad CLI calls are intentionally
 * banned so ownership, idempotency, and concurrency limits cannot be bypassed.
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─── Nomad API helpers ───────────────────────────────────────────────────────

export interface NomadOpts {
  addr: string;
  token?: string;
  namespace?: string;
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
export async function nomadGet<T>(
  path: string,
  opts: NomadOpts,
  options?: { index?: number; wait?: string; signal?: AbortSignal },
): Promise<{ data: T; nomadIndex: number }> {
  const base = opts.addr.replace(/\/+$/, "");
  const url = new URL(path, base);
  if (opts.namespace && !url.searchParams.has("namespace")) {
    url.searchParams.set("namespace", opts.namespace);
  }
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
export async function nomadPost<T>(
  path: string,
  body: unknown,
  opts: NomadOpts,
  signal?: AbortSignal,
): Promise<T> {
  const base = opts.addr.replace(/\/+$/, "");
  const url = new URL(path, base);
  if (opts.namespace && !url.searchParams.has("namespace")) {
    url.searchParams.set("namespace", opts.namespace);
  }
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

export async function nomadDelete<T>(
  path: string,
  opts: NomadOpts,
  signal?: AbortSignal,
): Promise<T> {
  const base = opts.addr.replace(/\/+$/, "");
  const url = new URL(path, base);
  if (opts.namespace && !url.searchParams.has("namespace")) {
    url.searchParams.set("namespace", opts.namespace);
  }
  const resp = await fetch(url.toString(), {
    method: "DELETE",
    headers: headers(opts),
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

export interface NomadAlloc {
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

export interface NomadJob {
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

const nomadDispatchParams = Type.Object({
  ...addrTokenFields,
  job: Type.String({ description: "Pre-registered parameterized Nomad job ID" }),
  payload: Type.Optional(Type.String({ description: "UTF-8 dispatch payload (maximum 16KiB)" })),
  meta: Type.Optional(Type.Record(Type.String(), Type.String(), {
    description: "Metadata required or accepted by the parameterized job",
  })),
  idPrefixTemplate: Type.Optional(Type.String({ description: "Prefix added to the dispatched job ID" })),
  idempotencyToken: Type.Optional(Type.String({
    description: "Stable token preventing duplicate dispatch; defaults to the Pi tool-call ID",
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
  return {
    addr,
    token: params.token || nomadToken() || undefined,
    namespace: process.env.NOMAD_NAMESPACE || undefined,
  };
}

/** Resolve the process-owned Nomad connection for coordinated agent tools. */
export function defaultNomadOpts(): NomadOpts {
  return resolveOpts({});
}

export interface NomadDispatchResult {
  Index?: number;
  JobCreateIndex?: number;
  EvalCreateIndex?: number;
  EvalID?: string;
  DispatchedJobID: string;
}

export interface NomadStopResult {
  EvalID?: string;
  EvalCreateIndex?: number;
  JobModifyIndex?: number;
}

/** Stop and purge one coordinator-owned dispatched job. */
export async function stopNomadJob(
  jobId: string,
  opts: NomadOpts,
  signal?: AbortSignal,
): Promise<NomadStopResult> {
  const normalized = jobId.trim();
  if (!normalized) throw new Error("Nomad job ID is required");
  return nomadDelete<NomadStopResult>(
    `/v1/job/${encodeURIComponent(normalized)}?purge=true`,
    opts,
    signal,
  );
}

/** Dispatch one trusted, pre-registered parameterized job. */
export async function dispatchNomadJob(
  request: {
    jobId: string;
    payload?: string;
    meta?: Record<string, string>;
    idPrefixTemplate?: string;
    idempotencyToken: string;
  },
  opts: NomadOpts,
  signal?: AbortSignal,
): Promise<NomadDispatchResult> {
  const jobId = request.jobId.trim();
  if (!jobId) throw new Error("Parameterized Nomad job ID is required");

  const body: Record<string, unknown> = {};
  if (request.payload !== undefined) {
    const payload = Buffer.from(request.payload, "utf8");
    if (payload.byteLength > 16 * 1024) {
      throw new Error(`Nomad dispatch payload exceeds 16KiB (${payload.byteLength} bytes)`);
    }
    body.Payload = payload.toString("base64");
  }
  if (request.meta && Object.keys(request.meta).length > 0) body.Meta = request.meta;
  if (request.idPrefixTemplate) body.IdPrefixTemplate = request.idPrefixTemplate;

  const path = `/v1/job/${encodeURIComponent(jobId)}/dispatch?idempotency_token=${encodeURIComponent(request.idempotencyToken)}`;
  return nomadPost<NomadDispatchResult>(path, body, opts, signal);
}

function isAllocTerminal(alloc: NomadAlloc): boolean {
  return TERMINAL_ALLOC_STATUSES.has(alloc.ClientStatus);
}

/**
 * Fetch a log stream for a task in an allocation. Returns trimmed, tail-truncated
 * text. Never throws for the common "not ready" / "unavailable" cases — returns a
 * short placeholder instead, so callers can chain safely.
 */
export async function fetchLogs(
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
export async function watchJob(
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

const toolNomadWatch = defineTool<typeof nomadWatchParams, Record<string, unknown>>({
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
});

// ─── Tool: nomad_logs ────────────────────────────────────────────────────────

const toolNomadLogs = defineTool<typeof nomadLogsParams, Record<string, unknown>>({
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
});

// ─── Tool: nomad_dispatch ────────────────────────────────────────────────────

const toolNomadDispatch = defineTool<typeof nomadDispatchParams, Record<string, unknown>>({
  name: "nomad_dispatch",
  label: "Nomad Dispatch",
  description:
    "Dispatch one pre-registered parameterized Nomad job with optional payload and metadata. Uses the Pi tool-call ID as the default idempotency token to prevent duplicate retries.",
  promptSnippet: "Dispatch a pre-registered parameterized Nomad job idempotently",
  promptGuidelines: [
    "Use nomad_dispatch instead of the Nomad CLI for parameterized jobs.",
    "Use nomad_watch with the returned dispatched job ID to wait for completion.",
  ],
  parameters: nomadDispatchParams,
  async execute(
    toolCallId: string,
    params: {
      job: string;
      payload?: string;
      meta?: Record<string, string>;
      idPrefixTemplate?: string;
      idempotencyToken?: string;
      addr?: string;
      token?: string;
    },
    signal?: AbortSignal,
  ) {
    const result = await dispatchNomadJob(
      {
        jobId: params.job,
        payload: params.payload,
        meta: params.meta,
        idPrefixTemplate: params.idPrefixTemplate,
        idempotencyToken: params.idempotencyToken?.trim() || toolCallId,
      },
      resolveOpts(params),
      signal,
    );
    return {
      content: [{
        type: "text",
        text: `Dispatched job "${result.DispatchedJobID}"${result.EvalID ? `\nEval ID: ${result.EvalID}` : ""}`,
      }],
      details: {
        jobId: result.DispatchedJobID,
        evalId: result.EvalID,
        idempotencyToken: params.idempotencyToken?.trim() || toolCallId,
      },
    };
  },
});

// ─── Tool: nomad_submit ──────────────────────────────────────────────────────

const toolNomadSubmit = defineTool<typeof nomadSubmitParams, Record<string, unknown>>({
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
    "Use nomad_watch separately when watch=false; do not bypass this tool with the Nomad CLI.",
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
});

// ─── Read tools: nodes, jobs, allocations, generic GET ───────────────────────
//
// The write/run/observe tools above intentionally cover only mutating and
// long-poll operations so ownership, idempotency, and concurrency can be
// enforced. These read-only tools close the discovery gap that otherwise sent
// the agent to `curl` against the HTTP API (which is neither banned nor
// blessed, and which the bash ban regex can false-positive on). All four are
// plain GETs — they cannot submit, dispatch, stop, or mutate anything.

interface NomadNodeStub {
  ID: string;
  Name: string;
  Datacenter: string;
  NodePool?: string;
  Status: string;
  StatusDescription?: string;
  Address?: string;
}

interface NomadNodeDetail {
  ID: string;
  Name: string;
  Datacenter: string;
  NodePool?: string;
  Status: string;
  Address?: string;
  Attributes?: Record<string, string>;
  NodeResources?: Record<string, unknown>;
  ReservedResources?: Record<string, unknown>;
  Devices?: unknown;
  Meta?: Record<string, string>;
}

interface NomadJobStub {
  ID: string;
  Name?: string;
  Type?: string;
  Status?: string;
  StatusDescription?: string;
  NodePool?: string;
  Priority?: number;
  SubmitTime?: number;
}

interface NomadJobDetail {
  ID: string;
  Name: string;
  Type: string;
  Status: string;
  StatusDescription?: string;
  Datacenters?: string[];
  NodePool?: string;
  Priority?: number;
  TaskGroups?: Array<{
    Name: string;
    Count?: number;
    Constraints?: Array<{ LTarget: string; Operand: string; RTarget: string }>;
    Networks?: Array<{
      ReservedPorts?: Array<{ Label: string; To: number; Value: number }>;
      DynamicPorts?: Array<{ Label: string }>;
    }>;
    Services?: Array<{ Name: string; PortLabel?: string; Tags?: string[] }>;
    Tasks?: Array<{
      Name: string;
      Driver: string;
      Config?: Record<string, unknown>;
      Resources?: {
        CPU?: number;
        MemoryMB?: number;
        MemoryMaxMB?: number;
        Devices?: Array<{ Name?: string; Count?: number }> | null;
      };
      Constraints?: Array<{ LTarget: string; Operand: string; RTarget: string }>;
    }>;
  }>;
}

const RELEVANT_ATTR_KEYS = [
  "gpu", "cuda", "nvidia", "driver", "kernel", "os.name",
  "cpu.arch", "memory", "nomad.version", "consul.version",
  "vault.version", "unique.name", "unique.storage",
];

/** Resolve a node name (or ID prefix) to a full node UUID via /v1/nodes. */
async function resolveNodeId(
  nameOrId: string,
  opts: NomadOpts,
  signal?: AbortSignal,
): Promise<string> {
  const trimmed = nameOrId.trim();
  if (!trimmed) throw new Error("Node ID or name is required");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed;
  }
  const { data: nodes } = await nomadGet<NomadNodeStub[]>("/v1/nodes", opts, { signal });
  const match = nodes.find(n => n.Name === trimmed) ?? nodes.find(n => n.ID.startsWith(trimmed));
  if (!match) throw new Error(`No Nomad node found matching "${trimmed}"`);
  return match.ID;
}

function formatNodeStub(n: NomadNodeStub): string {
  return [
    n.ID, n.Name, n.NodePool ?? "-", n.Datacenter ?? "-", n.Status, n.Address ?? "",
  ].join(" | ");
}

function formatNodeDetail(n: NomadNodeDetail): string {
  const lines: string[] = [
    `Node ${n.Name} (${n.ID})`,
    `  pool=${n.NodePool ?? "-"} dc=${n.Datacenter ?? "-"} status=${n.Status} address=${n.Address ?? "-"}`,
  ];
  const attrs = n.Attributes ?? {};
  const relevant = Object.entries(attrs)
    .filter(([k]) => RELEVANT_ATTR_KEYS.some(s => k.toLowerCase().includes(s)))
    .map(([k, v]) => `  ${k} = ${v}`)
    .sort();
  if (relevant.length) {
    lines.push("Attributes (gpu/cuda/driver/kernel/os/cpu/memory/nomad):");
    lines.push(...relevant);
  }
  if (n.NodeResources) lines.push(`NodeResources: ${JSON.stringify(n.NodeResources)}`);
  if (n.ReservedResources) lines.push(`ReservedResources: ${JSON.stringify(n.ReservedResources)}`);
  if (n.Devices != null) lines.push(`Devices: ${JSON.stringify(n.Devices)}`);
  return lines.join("\n");
}

function formatJobStub(j: NomadJobStub): string {
  return [j.ID, j.Name ?? "-", j.Type ?? "-", j.Status ?? "-", j.NodePool ?? "-"].join(" | ");
}

function formatJobSpec(j: NomadJobDetail): string {
  const lines: string[] = [
    `Job ${j.Name} (${j.ID}): ${j.Type} / ${j.Status}` +
      (j.StatusDescription ? ` — ${j.StatusDescription}` : ""),
    `  datacenters=${(j.Datacenters ?? []).join(",") || "-"} node_pool=${j.NodePool ?? "-"} priority=${j.Priority ?? "-"}`,
  ];
  for (const g of j.TaskGroups ?? []) {
    lines.push(`GROUP ${g.Name} (count=${g.Count ?? 1})`);
    for (const c of g.Constraints ?? []) {
      lines.push(`  constraint: ${c.LTarget} ${c.Operand} ${c.RTarget}`);
    }
    if (g.Networks?.length) {
      const nets = g.Networks.map(net => {
        const reserved = (net.ReservedPorts ?? []).map(p => `${p.Label}:${p.Value}`).join(",");
        const dyn = (net.DynamicPorts ?? []).map(p => p.Label).join(",");
        return `reserved=[${reserved}] dynamic=[${dyn}]`;
      });
      lines.push(`  network: ${nets.join(" | ")}`);
    }
    for (const s of g.Services ?? []) {
      lines.push(`  service: ${s.Name} (port=${s.PortLabel ?? "-"}) tags=[${(s.Tags ?? []).join(",")}]`);
    }
    for (const t of g.Tasks ?? []) {
      const img = t.Config?.image;
      const res = t.Resources;
      const dev = res?.Devices?.map(d => `${d.Name ?? "?"}(x${d.Count ?? 1})`).join(",") ?? "none";
      lines.push(
        `  TASK ${t.Name} driver=${t.Driver} image=${img ?? "-"}` +
          ` cpu=${res?.CPU ?? "-"} mem=${res?.MemoryMB ?? "-"} mem_max=${res?.MemoryMaxMB ?? "-"} devices=${dev}`,
      );
      for (const c of t.Constraints ?? []) {
        lines.push(`    constraint: ${c.LTarget} ${c.Operand} ${c.RTarget}`);
      }
    }
  }
  return lines.join("\n");
}

function formatAllocStub(a: NomadAlloc): string {
  let line = `${a.ID} | ${a.JobID} | ${a.TaskGroup} | client=${a.ClientStatus} desired=${a.DesiredStatus}`;
  if (a.TaskStates) {
    const tasks = Object.entries(a.TaskStates).map(
      ([n, ts]) => `${n}:${ts.State}${ts.Failed ? "!" : ""}(r${ts.Restarts})`,
    );
    line += ` | ${tasks.join(",")}`;
  }
  return line;
}

// ─── Tool: nomad_nodes ───────────────────────────────────────────────────────

const nomadNodesParams = Type.Object({
  ...addrTokenFields,
  node: Type.Optional(Type.String({
    description:
      "Node ID or name. If omitted, lists all nodes; if given, returns full detail for that node (names like 'slim-2' are resolved to UUIDs automatically).",
  })),
  pool: Type.Optional(Type.String({
    description: "Filter list by node pool (e.g. 'batch-compute'). Only applies when 'node' is omitted.",
  })),
});

const toolNomadNodes = defineTool<typeof nomadNodesParams, Record<string, unknown>>({
  name: "nomad_nodes",
  label: "Nomad Nodes",
  description: [
    "List Nomad nodes or inspect one node in detail.",
    "With no 'node' param: compact table of all nodes (ID, name, pool, datacenter, status, address).",
    "With 'node=<id-or-name>': full detail — attributes (GPU/CUDA/driver/kernel/os/cpu/memory), NodeResources, ReservedResources, and Devices fingerprint. Names resolve to UUIDs automatically.",
  ].join(" "),
  promptSnippet: "List Nomad nodes or inspect one node's GPU/CPU/memory fingerprint",
  promptGuidelines: [
    "Use nomad_nodes to discover nodes and their GPU resources before writing job specs or pinning with a node-name constraint.",
    "Call the list form (no 'node' arg) first to find a node's name/ID, then nomad_nodes node=<name> to read its GPU device fingerprint and available resources.",
    "To see what is currently consuming a node's resources, use nomad_allocs node=<name>.",
  ],
  parameters: nomadNodesParams,
  async execute(
    _toolCallId: string,
    params: { node?: string; pool?: string; addr?: string; token?: string },
    signal?: AbortSignal,
  ) {
    const opts = resolveOpts(params);

    if (params.node) {
      const id = await resolveNodeId(params.node, opts, signal);
      const { data } = await nomadGet<unknown>(`/v1/node/${encodeURIComponent(id)}`, opts, { signal });
      const node = ((data as { Node?: NomadNodeDetail }).Node ?? data) as NomadNodeDetail;
      return {
        content: [{ type: "text", text: formatNodeDetail(node) }],
        details: {
          id: node.ID,
          name: node.Name,
          pool: node.NodePool,
          status: node.Status,
          attributes: node.Attributes,
          nodeResources: node.NodeResources,
          reservedResources: node.ReservedResources,
          devices: node.Devices,
        },
      };
    }

    const { data: nodes } = await nomadGet<NomadNodeStub[]>("/v1/nodes", opts, { signal });
    const filtered = params.pool ? nodes.filter(n => n.NodePool === params.pool) : nodes;
    const lines = filtered.map(formatNodeStub);
    return {
      content: [{ type: "text", text: lines.length ? lines.join("\n") : "(no nodes)" }],
      details: { count: filtered.length, pool: params.pool ?? null },
    };
  },
});

// ─── Tool: nomad_jobs ────────────────────────────────────────────────────────

const nomadJobsParams = Type.Object({
  ...addrTokenFields,
  job: Type.Optional(Type.String({
    description:
      "Job ID. If omitted, lists all jobs; if given, returns the full spec (task groups, tasks, driver/image, resources, devices, networks, services, constraints).",
  })),
  type: Type.Optional(Type.String({
    description: "Filter list by job type: 'service', 'batch', or 'system'. Only applies when 'job' is omitted.",
  })),
  status: Type.Optional(Type.String({
    description: "Filter list by status: 'running', 'pending', or 'dead'. Only applies when 'job' is omitted.",
  })),
});

const toolNomadJobs = defineTool<typeof nomadJobsParams, Record<string, unknown>>({
  name: "nomad_jobs",
  label: "Nomad Jobs",
  description: [
    "List Nomad jobs or inspect one job's full spec.",
    "With no 'job' param: compact list (ID, name, type, status, node pool).",
    "With 'job=<id>': full spec — task groups, per-task driver/image/resources/devices, networks, services, and constraints — useful for copying conventions when writing a new job spec.",
  ].join(" "),
  promptSnippet: "List Nomad jobs or read one job's full spec",
  promptGuidelines: [
    "Use nomad_jobs job=<id> to read an existing job's spec (network ports, service registration, device requests, constraints) before writing a similar job, instead of curl-ing the HTTP API.",
    "Use the list form to discover job IDs.",
  ],
  parameters: nomadJobsParams,
  async execute(
    _toolCallId: string,
    params: { job?: string; type?: string; status?: string; addr?: string; token?: string },
    signal?: AbortSignal,
  ) {
    const opts = resolveOpts(params);

    if (params.job) {
      const { data } = await nomadGet<unknown>(`/v1/job/${encodeURIComponent(params.job)}`, opts, { signal });
      const job = ((data as { Job?: NomadJobDetail }).Job ?? data) as NomadJobDetail;
      return {
        content: [{ type: "text", text: formatJobSpec(job) }],
        details: {
          id: job.ID, name: job.Name, type: job.Type, status: job.Status,
          spec: job as unknown as Record<string, unknown>,
        },
      };
    }

    const { data: jobs } = await nomadGet<NomadJobStub[]>("/v1/jobs", opts, { signal });
    let filtered = jobs;
    if (params.type) filtered = filtered.filter(j => j.Type === params.type);
    if (params.status) filtered = filtered.filter(j => j.Status === params.status);
    const lines = filtered.map(formatJobStub);
    return {
      content: [{ type: "text", text: lines.length ? lines.join("\n") : "(no jobs)" }],
      details: { count: filtered.length, type: params.type ?? null, status: params.status ?? null },
    };
  },
});

// ─── Tool: nomad_allocs ──────────────────────────────────────────────────────

const nomadAllocsParams = Type.Object({
  ...addrTokenFields,
  node: Type.Optional(Type.String({
    description: "Node ID or name — list allocations placed on this node. Names resolve to UUIDs automatically.",
  })),
  job: Type.Optional(Type.String({
    description: "Job ID — list allocations for this job.",
  })),
  status: Type.Optional(Type.String({
    description: "Filter by client status: 'running', 'pending', 'complete', 'failed', 'lost'.",
  })),
});

const toolNomadAllocs = defineTool<typeof nomadAllocsParams, Record<string, unknown>>({
  name: "nomad_allocs",
  label: "Nomad Allocations",
  description: [
    "List Nomad allocations for a node or a job, with per-task state.",
    "Provide exactly one of 'node=<id-or-name>' or 'job=<id>'. Names like 'slim-2' resolve to UUIDs automatically.",
    "Each allocation shows ID, job, task group, client/desired status, and per-task state + restarts.",
  ].join(" "),
  promptSnippet: "List allocations for a Nomad node or job",
  promptGuidelines: [
    "Use nomad_allocs node=<name> to see what is currently running on a node and consuming its resources (useful before placing a new GPU job).",
    "Use nomad_allocs job=<id> to inspect a job's allocations and task states instead of curl-ing the HTTP API.",
  ],
  parameters: nomadAllocsParams,
  async execute(
    _toolCallId: string,
    params: { node?: string; job?: string; status?: string; addr?: string; token?: string },
    signal?: AbortSignal,
  ) {
    const opts = resolveOpts(params);

    if (!params.node && !params.job) {
      return {
        content: [{ type: "text", text: "Provide either node=<id-or-name> or job=<id>" }],
        details: {},
      };
    }

    const path = params.node
      ? `/v1/node/${encodeURIComponent(await resolveNodeId(params.node, opts, signal))}/allocations`
      : `/v1/job/${encodeURIComponent(params.job!)}/allocations`;

    const { data: allocs } = await nomadGet<NomadAlloc[]>(path, opts, { signal });
    const filtered = params.status ? allocs.filter(a => a.ClientStatus === params.status) : allocs;
    const lines = filtered.map(formatAllocStub);
    return {
      content: [{ type: "text", text: lines.length ? lines.join("\n") : "(no allocations)" }],
      details: { count: filtered.length, status: params.status ?? null },
    };
  },
});

// ─── Tool: nomad_get ─────────────────────────────────────────────────────────

const nomadGetToolParams = Type.Object({
  ...addrTokenFields,
  path: Type.String({
    description:
      "Nomad HTTP API path to GET, e.g. '/v1/node/<id>/devices', '/v1/job/<id>/deployments', '/v1/job/<id>/services'. Read-only, non-blocking.",
  }),
});

const toolNomadGet = defineTool<typeof nomadGetToolParams, Record<string, unknown>>({
  name: "nomad_get",
  label: "Nomad GET",
  description: [
    "Read-only generic GET against the Nomad HTTP API, for endpoints not covered by the dedicated read tools.",
    "Returns the raw JSON response (pretty-printed, truncated to ~50KB).",
    "Use this instead of curl for any ad-hoc Nomad read (deployments, services, devices, scales, evaluations, etc.).",
  ].join(" "),
  promptSnippet: "Read any Nomad HTTP API endpoint (GET only)",
  promptGuidelines: [
    "Use nomad_get path=<api-path> for any Nomad read endpoint not covered by nomad_nodes/nomad_jobs/nomad_allocs (e.g. /v1/job/<id>/deployments, /v1/node/<id>/devices, /v1/job/<id>/services).",
    "This is a read-only GET; it cannot submit, dispatch, or mutate jobs. Use nomad_submit/nomad_dispatch for writes.",
  ],
  parameters: nomadGetToolParams,
  async execute(
    _toolCallId: string,
    params: { path: string; addr?: string; token?: string },
    signal?: AbortSignal,
  ) {
    const opts = resolveOpts(params);
    let p = params.path.trim();
    if (!p) throw new Error("path is required");
    if (!p.startsWith("/")) p = "/" + p;

    const { data, nomadIndex } = await nomadGet<unknown>(p, opts, { signal });
    let text = JSON.stringify(data, null, 2);
    if (text.length > MAX_LOG_BYTES) {
      text = `[…truncated to last ${MAX_LOG_BYTES / 1024}KB…]\n${text.slice(-MAX_LOG_BYTES)}`;
    }
    return {
      content: [{ type: "text", text: text || "(empty response)" }],
      details: { path: p, nomadIndex },
    };
  },
});

// ─── Extension entry point ───────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool(toolNomadWatch);
  pi.registerTool(toolNomadLogs);
  pi.registerTool(toolNomadDispatch);
  pi.registerTool(toolNomadSubmit);
  // Read-only discovery tools (close the gap that sent the agent to curl).
  pi.registerTool(toolNomadNodes);
  pi.registerTool(toolNomadJobs);
  pi.registerTool(toolNomadAllocs);
  pi.registerTool(toolNomadGet);

  // (No UI chrome — tools speak for themselves)
}
