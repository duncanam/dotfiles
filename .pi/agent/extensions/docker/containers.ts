/**
 * Docker container-lifecycle tools — create, wait, stop.
 *
 * Each tool shells out to the `docker` CLI via the shared transport layer.
 * Abort signals (Escape) kill the child process and return partial results.
 * Name-based idempotency in docker_run prevents duplicate containers.
 *
 * Tools:
 *   docker_run   — Create+start a container (one-off), name-idempotent.
 *   docker_wait  — Block until a container stops, return exit code + logs.
 *   docker_stop  — Stop and optionally remove containers.
 *
 * Exported helpers for agent-manager and other extensions:
 *   dockerRun, dockerWait, dockerStop
 */

import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  dockerCli,
  resolveDockerEnv,
  dockerCommonFields,
  MAX_LOG_BYTES,
  DEFAULT_LOG_TAIL,
  truncateOutput,
  dockerInspect,
  type DockerEnv,
} from "./transport.js";
import type { ContainerInspect } from "./types.js";

// ─── Helpers (exported for other extensions) ─────────────────────────────────

export interface DockerRunOpts {
  image: string;
  command?: string;
  name?: string;
  env?: Record<string, string>;
  ports?: string[];
  volumes?: string[];
  workdir?: string;
  user?: string;
  network?: string;
  labels?: Record<string, string>;
  restart?: string;
  detach?: boolean;
  rm?: boolean;
}

export interface DockerRunResult {
  containerId: string;
  created: boolean;
  started: boolean;
  exitCode?: number;
  output?: string;
  detached: boolean;
}

/**
 * Create+start a container, with name-based idempotency.
 *
 * - If `name` is given and a container with that name exists and is running,
 *   returns it without recreating.
 * - If it exists but is stopped, `docker start`s it.
 * - Otherwise creates and starts a new container.
 */
export async function dockerRun(
  opts: DockerRunOpts,
  env: DockerEnv,
  signal?: AbortSignal,
): Promise<DockerRunResult> {
  const detach = opts.detach !== false; // default true
  const rm = opts.rm ?? (detach ? false : true);

  // ── Name-based idempotency ──
  if (opts.name) {
    try {
      const existing = await dockerInspect([opts.name], env, signal);
      if (existing.length > 0) {
        const c = existing[0];
        if (c.State?.Running) {
          return {
            containerId: c.Id,
            created: false,
            started: false,
            detached: true,
          };
        }
        // Stopped — start it
        const startResult = await dockerCli(["start", opts.name], env, signal);
        if (startResult.exitCode !== 0) {
          throw new Error(
            `docker start ${opts.name} failed: ${startResult.stderr || startResult.stdout}`,
          );
        }
        return {
          containerId: c.Id,
          created: false,
          started: true,
          detached: true,
        };
      }
    } catch {
      // Not found — proceed to create
    }
  }

  // ── Build docker run args ──
  const args = ["run"];

  if (opts.name) {
    args.push("--name", opts.name);
  }

  if (detach) {
    args.push("-d");
  }

  if (rm) {
    args.push("--rm");
  }

  if (opts.env) {
    for (const [k, v] of Object.entries(opts.env)) {
      args.push("-e", `${k}=${v}`);
    }
  }

  if (opts.ports) {
    for (const p of opts.ports) {
      args.push("-p", p);
    }
  }

  if (opts.volumes) {
    for (const v of opts.volumes) {
      args.push("-v", v);
    }
  }

  if (opts.workdir) {
    args.push("-w", opts.workdir);
  }

  if (opts.user) {
    args.push("-u", opts.user);
  }

  if (opts.network) {
    args.push("--network", opts.network);
  }

  if (opts.labels) {
    for (const [k, v] of Object.entries(opts.labels)) {
      args.push("--label", `${k}=${v}`);
    }
  }

  if (opts.restart) {
    args.push("--restart", opts.restart);
  }

  args.push(opts.image);

  // Command and its args — split on whitespace
  if (opts.command) {
    args.push(...opts.command.split(/\s+/).filter(Boolean));
  }

  const result = await dockerCli(args, env, signal);

  if (result.aborted) {
    return {
      containerId: "",
      created: false,
      started: false,
      detached: detach,
      output: result.stdout + result.stderr,
    };
  }

  if (result.exitCode !== 0) {
    throw new Error(
      `docker run failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    );
  }

  const containerId = result.stdout.trim();

  if (!detach) {
    // Attached mode: captured stdout+stderr is the command's output
    return {
      containerId,
      created: true,
      started: true,
      exitCode: result.exitCode,
      output: result.stdout + result.stderr,
      detached: false,
    };
  }

  return {
    containerId,
    created: true,
    started: true,
    detached: true,
  };
}

export interface DockerWaitResult {
  exitCode: number;
  state: ContainerInspect;
}

/**
 * Block until a container stops, return exit code and final container state.
 * Uses `docker wait` which blocks efficiently (analogous to nomad's blocking queries).
 */
export async function dockerWait(
  container: string,
  env: DockerEnv,
  signal?: AbortSignal,
): Promise<DockerWaitResult> {
  const result = await dockerCli(["wait", container], env, signal);

  // docker wait prints the exit code integer to stdout
  const exitCode = result.aborted
    ? -1
    : parseInt(result.stdout.trim(), 10) || 0;

  // Fetch final container state
  let state: ContainerInspect;
  try {
    const inspected = await dockerInspect([container], env, signal);
    state = inspected[0];
  } catch {
    state = {
      Id: "",
      Name: container,
      State: { Status: "unknown", Running: false, ExitCode: exitCode },
    } as ContainerInspect;
  }

  return { exitCode, state };
}

export interface DockerStopResult {
  name: string;
  exitCode: number;
  removed: boolean;
}

/**
 * Stop and optionally remove containers.
 */
export async function dockerStop(
  containers: string[],
  remove: boolean,
  time: number,
  env: DockerEnv,
  signal?: AbortSignal,
): Promise<DockerStopResult[]> {
  const results: DockerStopResult[] = [];

  for (const name of containers) {
    let exitCode = 0;
    let removed = false;

    const stopArgs = ["stop", "-t", String(time), name];
    const stopResult = await dockerCli(stopArgs, env, signal);
    exitCode = stopResult.exitCode;

    if (remove && !stopResult.aborted) {
      const rmResult = await dockerCli(["rm", "-f", name], env, signal);
      removed = rmResult.exitCode === 0;
    }

    results.push({ name, exitCode, removed });
  }

  return results;
}

// ─── Tool: docker_run ────────────────────────────────────────────────────────

const dockerRunParams = Type.Object({
  ...dockerCommonFields,
  image: Type.String({ description: "Docker image to run (e.g. 'python:3.12', 'alpine')" }),
  command: Type.Optional(
    Type.String({ description: "Command and arguments to run inside the container, split on whitespace" }),
  ),
  name: Type.Optional(
    Type.String({
      description:
        "Container name — enables idempotency: reuses running, starts stopped, creates if absent",
    }),
  ),
  env: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description: "Environment variables (KEY=value), passed via -e",
    }),
  ),
  ports: Type.Optional(
    Type.Array(Type.String(), {
      description: "Port mappings in docker -p format, e.g. '8080:8080' or '127.0.0.1:5432:5432'",
    }),
  ),
  volumes: Type.Optional(
    Type.Array(Type.String(), {
      description: "Volume/bind mounts in docker -v format, e.g. '/host/path:/container/path'",
    }),
  ),
  workdir: Type.Optional(
    Type.String({ description: "Working directory inside the container (-w)" }),
  ),
  user: Type.Optional(
    Type.String({ description: "User to run as (-u), e.g. '1000:1000' or 'root'" }),
  ),
  network: Type.Optional(
    Type.String({ description: "Docker network to connect to (--network)" }),
  ),
  labels: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description: "Labels to apply (--label KEY=VALUE)",
    }),
  ),
  restart: Type.Optional(
    Type.String({
      description: "Restart policy (--restart), e.g. 'no', 'always', 'on-failure', 'unless-stopped'",
    }),
  ),
  detach: Type.Optional(
    Type.Boolean({
      description:
        "Run in background and return container ID (default: true). Set false to block until exit.",
      default: true,
    }),
  ),
  rm: Type.Optional(
    Type.Boolean({
      description:
        "Auto-remove container on exit (--rm). Default: true when detach=false, false when detach=true.",
    }),
  ),
});

const dockerRunTool = defineTool<typeof dockerRunParams, Record<string, unknown>>({
  name: "docker_run",
  label: "Docker Run",
  description: [
    "Create and start a container (one-off), with name-based idempotency.",
    "If a container with the same name exists and is running, returns it without changes.",
    "If it exists but is stopped, starts it. Otherwise creates and starts a new container.",
    "By default runs in detached mode (−d); pass detach=false to block and capture output.",
  ].join(" "),
  promptSnippet: "Run a container from an image (idempotent by name)",
  promptGuidelines: [
    "Use docker_run for one-off containers.",
    "Pass name= for idempotency (reuse running container, start stopped one).",
    "Use detach=false to block and capture output of a one-off command like `docker_run image=alpine command='echo hello' detach=false`.",
    "Pair with docker_wait to block on a detached container and fetch its exit code + logs.",
    "Use docker_stop remove=true to clean up afterward.",
  ],
  parameters: dockerRunParams,
  async execute(
    _toolCallId: string,
    params: {
      image: string;
      command?: string;
      name?: string;
      env?: Record<string, string>;
      ports?: string[];
      volumes?: string[];
      workdir?: string;
      user?: string;
      network?: string;
      labels?: Record<string, string>;
      restart?: string;
      detach?: boolean;
      rm?: boolean;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const dockerEnv = resolveDockerEnv(params.context);

    const result = await dockerRun(
      {
        image: params.image,
        command: params.command,
        name: params.name,
        env: params.env,
        ports: params.ports,
        volumes: params.volumes,
        workdir: params.workdir,
        user: params.user,
        network: params.network,
        labels: params.labels,
        restart: params.restart,
        detach: params.detach,
        rm: params.rm,
      },
      dockerEnv,
      signal,
    );

    let text: string;
    if (result.detached) {
      if (!result.created && !result.started) {
        text = `Container ${result.containerId} (name=${params.name ?? "—"}) already running`;
      } else if (!result.created && result.started) {
        text = `Container ${result.containerId} (name=${params.name ?? "—"}) restarted`;
      } else {
        text = `Container ${result.containerId} (name=${params.name ?? "—"}) started`;
      }
    } else {
      const outputSnippet = truncateOutput(result.output ?? "");
      text = outputSnippet
        ? `${outputSnippet}\n\nExit code: ${result.exitCode ?? "—"}`
        : `Exit code: ${result.exitCode ?? "—"}`;
    }

    return {
      content: [{ type: "text", text }],
      details: {
        containerId: result.containerId,
        created: result.created,
        started: result.started,
        exitCode: result.exitCode,
        detached: result.detached,
        aborted: signal?.aborted ?? false,
      },
    };
  },
});

// ─── Tool: docker_wait ───────────────────────────────────────────────────────

const dockerWaitParams = Type.Object({
  ...dockerCommonFields,
  container: Type.String({
    description: "Container name or ID",
  }),
  logs: Type.Optional(
    Type.Boolean({
      description:
        "If true, fetch stdout+stderr via `docker logs` after the container stops",
    }),
  ),
  tail: Type.Optional(
    Type.Number({
      description:
        `Number of log lines to fetch when logs=true (default: ${DEFAULT_LOG_TAIL})`,
    }),
  ),
});

const dockerWaitTool = defineTool<typeof dockerWaitParams, Record<string, unknown>>({
  name: "docker_wait",
  label: "Docker Wait",
  description: [
    "Block until a container stops, then return its exit code and optionally its logs.",
    "Uses `docker wait` which blocks efficiently until the container exits.",
    "Press Escape to abort and return whatever was accumulated so far.",
  ].join(" "),
  promptSnippet: "Wait for a container to exit and get its exit code",
  promptGuidelines: [
    "Use docker_wait after docker_run (with detach=true) to block until it finishes.",
    "Pass logs=true to fetch the container's stdout+stderr once it stops.",
    "This is the Docker analog of nomad_watch — it blocks until terminal state.",
  ],
  parameters: dockerWaitParams,
  async execute(
    _toolCallId: string,
    params: {
      container: string;
      logs?: boolean;
      tail?: number;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const dockerEnv = resolveDockerEnv(params.context);
    const waitResult = await dockerWait(params.container, dockerEnv, signal);

    let text = `Container ${params.container} exited with code ${waitResult.exitCode}`;
    const details: Record<string, unknown> = {
      container: params.container,
      exitCode: waitResult.exitCode,
      status: waitResult.state.State?.Status ?? "unknown",
      aborted: signal?.aborted ?? false,
    };

    if (params.logs) {
      const tail = params.tail ?? DEFAULT_LOG_TAIL;
      try {
        const logResult = await dockerCli(
          ["logs", "--tail", String(tail), params.container],
          dockerEnv,
          signal,
        );
        const rawLogs = logResult.stdout;
        const rawErr = logResult.stderr;
        const combined = [rawLogs, rawErr ? `\n[stderr]\n${rawErr}` : ""]
          .filter(Boolean)
          .join("");
        const logsText = truncateOutput(combined.trim() || "[no output]");
        text += `\n\n── logs (last ${tail} lines) ──\n${logsText}`;
        details.logsBytes = logResult.stdout.length + logResult.stderr.length;
      } catch (err: unknown) {
        text += `\n\n[logs unavailable: ${err instanceof Error ? err.message : String(err)}]`;
        details.logsError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      content: [{ type: "text", text }],
      details,
    };
  },
});

// ─── Tool: docker_stop ───────────────────────────────────────────────────────

const dockerStopParams = Type.Object({
  ...dockerCommonFields,
  containers: Type.Union([
    Type.String({ description: "Single container name or ID" }),
    Type.Array(Type.String(), { description: "One or more container names/IDs" }),
  ]),
  remove: Type.Optional(
    Type.Boolean({
      description: "Also remove the container(s) after stopping (docker rm -f)",
      default: false,
    }),
  ),
  time: Type.Optional(
    Type.Number({
      description: "Grace period in seconds before killing (docker stop -t, default: 10)",
    }),
  ),
});

const dockerStopTool = defineTool<typeof dockerStopParams, Record<string, unknown>>({
  name: "docker_stop",
  label: "Docker Stop",
  description: [
    "Stop and optionally remove one or more containers.",
    "Sends SIGTERM, waits for the grace period, then SIGKILL if still running.",
  ].join(" "),
  promptSnippet: "Stop and optionally remove containers",
  promptGuidelines: [
    "Use docker_stop remove=true to clean up a one-off container after docker_wait.",
    "Pass time=<seconds> to set a custom grace period.",
    "Pass a single string or an array of container names/IDs.",
  ],
  parameters: dockerStopParams,
  async execute(
    _toolCallId: string,
    params: {
      containers: string | string[];
      remove?: boolean;
      time?: number;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const dockerEnv = resolveDockerEnv(params.context);
    const containers = Array.isArray(params.containers)
      ? params.containers
      : [params.containers];
    const time = params.time ?? 10;
    const remove = params.remove ?? false;

    const results = await dockerStop(containers, remove, time, dockerEnv, signal);

    const lines = results.map(
      (r) =>
        `${r.name}: stopped (exit ${r.exitCode})${r.removed ? " removed" : ""}`,
    );
    const text = lines.join("\n") || "(no containers)";

    return {
      content: [{ type: "text", text }],
      details: {
        results,
        aborted: signal?.aborted ?? false,
      },
    };
  },
});

// ─── Tool collection ─────────────────────────────────────────────────────────

export const tools = [dockerRunTool, dockerWaitTool, dockerStopTool];
