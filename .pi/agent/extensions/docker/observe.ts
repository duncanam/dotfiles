/**
 * Docker observation tools — list containers, fetch logs, exec commands.
 *
 * Each tool shells out to the `docker` CLI via the shared transport layer.
 * Abort signals (Escape) kill the child process and return partial results.
 *
 * Tools:
 *   docker_ps    — List containers (compact rows).
 *   docker_logs  — Fetch a container's logs (stdout+stderr).
 *   docker_exec  — Run a command in a running container.
 */

import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  dockerCli,
  resolveDockerEnv,
  dockerCommonFields,
  truncateOutput,
  parseJsonLines,
  MAX_LOG_BYTES,
  DEFAULT_LOG_TAIL,
  type DockerEnv,
} from "./transport.js";
import type { ContainerPsRow } from "./types.js";

// ─── Tool: docker_ps ─────────────────────────────────────────────────────────

const dockerPsParams = Type.Object({
  ...dockerCommonFields,
  all: Type.Optional(
    Type.Boolean({
      description: "Include stopped containers (passes -a/--all)",
    }),
  ),
  status: Type.Optional(
    Type.String({
      description: "Filter by status (--filter status=<v>), e.g. 'running', 'exited'",
    }),
  ),
  name: Type.Optional(
    Type.String({
      description: "Filter by name pattern (--filter name=<regex>)",
    }),
  ),
  label: Type.Optional(
    Type.String({
      description: "Filter by label (--filter label=<v>)",
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: "Show last N containers (--last <n>)",
    }),
  ),
});

const dockerPsTool = defineTool<typeof dockerPsParams, Record<string, unknown>>({
  name: "docker_ps",
  label: "Docker Ps",
  description: [
    "List containers in compact row format.",
    "By default shows only running containers; pass all=true to include stopped ones.",
    "Supports filtering by status, name, or label.",
  ].join(" "),
  promptSnippet: "List containers (compact rows)",
  promptGuidelines: [
    "Use docker_ps to see running containers.",
    "Pass all=true to include stopped containers.",
    "Filter with status=, name=, or label= for precise queries.",
    "Use docker_inspect for full detail on a single container.",
  ],
  parameters: dockerPsParams,
  async execute(
    _toolCallId: string,
    params: {
      all?: boolean;
      status?: string;
      name?: string;
      label?: string;
      limit?: number;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const env = resolveDockerEnv(params.context);

    const args = ["ps", "--format", "{{json .}}"];

    if (params.all) {
      args.push("-a");
    }

    if (params.status) {
      args.push("--filter", `status=${params.status}`);
    }

    if (params.name) {
      args.push("--filter", `name=${params.name}`);
    }

    if (params.label) {
      args.push("--filter", `label=${params.label}`);
    }

    if (params.limit !== undefined) {
      args.push("--last", String(params.limit));
    }

    let result;
    try {
      result = await dockerCli(args, env, signal);
    } catch (err: unknown) {
      throw new Error(
        `docker ps failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (result.exitCode !== 0) {
      throw new Error(
        `docker ps failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
      );
    }

    const rows = parseJsonLines<ContainerPsRow>(result.stdout);

    if (rows.length === 0) {
      const filters: Record<string, string | boolean> = {};
      if (params.status) filters.status = params.status;
      if (params.name) filters.name = params.name;
      if (params.label) filters.label = params.label;

      return {
        content: [{ type: "text", text: "(no containers)" }],
        details: {
          count: 0,
          all: params.all ?? false,
          filters,
          aborted: signal?.aborted ?? false,
        },
      };
    }

    const lines = rows.map((row) => {
      const id = row.ID.length > 12 ? row.ID.slice(0, 12) : row.ID;
      const ports = row.Ports ?? "";
      return `${id} | ${row.Names} | ${row.Image} | ${row.Status} | ${ports}`;
    });

    const text = lines.join("\n");

    const filters: Record<string, string | boolean> = {};
    if (params.status) filters.status = params.status;
    if (params.name) filters.name = params.name;
    if (params.label) filters.label = params.label;

    return {
      content: [{ type: "text", text }],
      details: {
        count: rows.length,
        all: params.all ?? false,
        filters,
        aborted: signal?.aborted ?? false,
      },
    };
  },
});

// ─── Tool: docker_logs ───────────────────────────────────────────────────────

const dockerLogsParams = Type.Object({
  ...dockerCommonFields,
  container: Type.String({
    description: "Container name or ID",
  }),
  tail: Type.Optional(
    Type.Number({
      description:
        `Number of lines to fetch from the end (--tail <n>; omit for full logs — then truncated to ${MAX_LOG_BYTES / 1024}KB)`,
    }),
  ),
  since: Type.Optional(
    Type.String({
      description: "Show logs since timestamp (--since <ts>), e.g. '2024-01-01T00:00:00' or '5m'",
    }),
  ),
  until: Type.Optional(
    Type.String({
      description: "Show logs before timestamp (--until <ts>)",
    }),
  ),
  timestamps: Type.Optional(
    Type.Boolean({
      description: "Show timestamps (-t)",
    }),
  ),
});

const dockerLogsTool = defineTool<typeof dockerLogsParams, Record<string, unknown>>({
  name: "docker_logs",
  label: "Docker Logs",
  description: [
    "Fetch stdout and stderr logs from a container.",
    "Returns combined output with stdout first, then any stderr in a [stderr] section.",
    "Pass tail=<n> for the last N lines; omit for full logs (truncated to 50KB).",
  ].join(" "),
  promptSnippet: "Fetch a container's logs (stdout+stderr)",
  promptGuidelines: [
    "Use docker_logs after docker_wait or docker_run(detach=true) to read output.",
    "Pass tail=<n> for the last N lines; omit tail for full logs.",
    "This is one-shot — use docker_wait logs=true to fetch logs exactly when a container exits.",
  ],
  parameters: dockerLogsParams,
  async execute(
    _toolCallId: string,
    params: {
      container: string;
      tail?: number;
      since?: string;
      until?: string;
      timestamps?: boolean;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const env = resolveDockerEnv(params.context);

    const args = ["logs"];

    if (params.tail !== undefined) {
      args.push("--tail", String(params.tail));
    }

    if (params.since) {
      args.push("--since", params.since);
    }

    if (params.until) {
      args.push("--until", params.until);
    }

    if (params.timestamps) {
      args.push("-t");
    }

    args.push(params.container);

    let result;
    try {
      result = await dockerCli(args, env, signal);
    } catch (err: unknown) {
      throw new Error(
        `docker logs failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Check for "No such container" — return placeholder, don't throw
    const combinedErr = result.stderr + result.stdout;
    if (result.exitCode !== 0 && combinedErr.includes("No such container")) {
      return {
        content: [{ type: "text", text: `[No logs — container "${params.container}" not found]` }],
        details: {
          container: params.container,
          bytes: 0,
          exists: false,
          aborted: signal?.aborted ?? false,
        },
      };
    }

    const combined = result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : "");
    const text = combined.trim()
      ? truncateOutput(combined)
      : "[no output]";

    return {
      content: [{ type: "text", text }],
      details: {
        container: params.container,
        bytes: combined.length,
        exists: true,
        aborted: signal?.aborted ?? false,
      },
    };
  },
});

// ─── Tool: docker_exec ───────────────────────────────────────────────────────

const dockerExecParams = Type.Object({
  ...dockerCommonFields,
  container: Type.String({
    description: "Container name or ID (must be running)",
  }),
  command: Type.String({
    description:
      "Command and arguments to run inside the container, split on whitespace",
  }),
  user: Type.Optional(
    Type.String({
      description: "User to run as (-u), e.g. 'root' or '1000:1000'",
    }),
  ),
  workdir: Type.Optional(
    Type.String({
      description: "Working directory inside the container (-w)",
    }),
  ),
  env: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description: "Environment variables (repeated -e KEY=VAL)",
    }),
  ),
});

const dockerExecTool = defineTool<typeof dockerExecParams, Record<string, unknown>>({
  name: "docker_exec",
  label: "Docker Exec",
  description: [
    "Run a command in a running container and capture its output.",
    "The container must already be running; use docker_ps to confirm.",
    "Command is split on whitespace to produce the argv array.",
    "Output shows stdout, then any stderr in a [stderr] section, then exit code.",
  ].join(" "),
  promptSnippet: "Run a command in a running container",
  promptGuidelines: [
    "Use docker_exec to inspect or interact with a running container (e.g. docker_exec container=db command='psql -c \"SELECT 1\"').",
    "The container must be running — use docker_ps first to confirm.",
    "Output is captured non-interactively; long output is truncated.",
  ],
  parameters: dockerExecParams,
  async execute(
    _toolCallId: string,
    params: {
      container: string;
      command: string;
      user?: string;
      workdir?: string;
      env?: Record<string, string>;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const env = resolveDockerEnv(params.context);

    const args = ["exec"];

    if (params.user) {
      args.push("-u", params.user);
    }

    if (params.workdir) {
      args.push("-w", params.workdir);
    }

    if (params.env) {
      for (const [k, v] of Object.entries(params.env)) {
        args.push("-e", `${k}=${v}`);
      }
    }

    args.push(params.container);
    args.push(...params.command.split(/\s+/).filter(Boolean));

    const result = await dockerCli(args, env, signal);

    // Check for "No such container" or "is not running" — return placeholder, don't throw
    const combinedErr = result.stderr + result.stdout;
    if (
      combinedErr.includes("No such container") ||
      combinedErr.includes("is not running")
    ) {
      return {
        content: [{ type: "text", text: combinedErr.trim() }],
        details: {
          container: params.container,
          exitCode: result.exitCode,
          bytes: combinedErr.length,
          running: false,
          aborted: signal?.aborted ?? false,
        },
      };
    }

    const combined = result.stdout + (result.stderr ? `\n[stderr]\n${result.stderr}` : "");
    const outputSnippet = truncateOutput(combined);
    const text = `${outputSnippet}\nExit code: ${result.exitCode}`;

    return {
      content: [{ type: "text", text }],
      details: {
        container: params.container,
        exitCode: result.exitCode,
        bytes: combined.length,
        running: true,
        aborted: signal?.aborted ?? false,
      },
    };
  },
});

// ─── Tool collection ─────────────────────────────────────────────────────────

export const tools = [dockerPsTool, dockerLogsTool, dockerExecTool];
