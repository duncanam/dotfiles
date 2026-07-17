/**
 * Docker Compose v2 tools — manage multi-container stacks.
 *
 * Uses `docker compose` (v2, space separator) — NEVER `docker-compose` (v1).
 * Every action shells out through dockerCli(). Abort signals (Escape) kill the
 * child process and return partial results.
 *
 * Tools:
 *   docker_compose — Run Docker Compose subcommands (up/down/ps/logs/config).
 */

import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build the common compose prefix args: [-f <file>...] [-p <project>] */
function composePrefixArgs(params: {
  file?: string[];
  project?: string;
}): string[] {
  const args: string[] = [];
  if (params.file) {
    for (const f of params.file) {
      args.push("-f", f);
    }
  }
  if (params.project) {
    args.push("-p", params.project);
  }
  return args;
}

/** Format a single compose ps row as a one-liner. */
function formatComposePsRow(row: Record<string, unknown>): string {
  const service = String(row.Service ?? row.Name ?? "?");
  const state = String(row.State ?? row.Status ?? "?");
  let ports = "";
  const publishers = row.Publishers as
    | Array<{ URL?: string; TargetPort?: number; PublishedPort?: number; Protocol?: string }>
    | undefined;
  if (publishers && publishers.length > 0) {
    ports = publishers
      .map((p) => `${p.URL ?? "0.0.0.0"}:${p.PublishedPort ?? p.TargetPort ?? "?"}`)
      .join(", ");
  } else if (row.Ports) {
    ports = String(row.Ports);
  }
  const image = String(row.Image ?? "?");
  return `${service} | ${state} | ${image} | ${ports || "—"}`;
}

// ─── Tool: docker_compose ────────────────────────────────────────────────────

const composeActions = ["up", "down", "ps", "logs", "config"] as const;

const dockerComposeParams = Type.Object({
  ...dockerCommonFields,
  action: StringEnum(composeActions, {
    description: "Compose subcommand: up, down, ps, logs, or config",
  }),
  file: Type.Optional(
    Type.Union([
      Type.String({ description: "Path to a single compose file (-f)" }),
      Type.Array(Type.String(), { description: "Paths to compose files (-f)" }),
    ]),
  ),
  project: Type.Optional(
    Type.String({ description: "Project name (-p, default: directory name)" }),
  ),
  services: Type.Optional(
    Type.Array(Type.String(), {
      description: "Subset of services (for up, down, logs)",
    }),
  ),
  detach: Type.Optional(
    Type.Boolean({
      description:
        "For 'up': run in background (default: true). Uses -d --wait to block until healthy.",
      default: true,
    }),
  ),
  removeVolumes: Type.Optional(
    Type.Boolean({
      description: "For 'down': also remove named volumes (--volumes)",
      default: false,
    }),
  ),
  removeOrphans: Type.Optional(
    Type.Boolean({
      description:
        "For 'up' and 'down': remove containers for services not in the compose file (--remove-orphans)",
      default: false,
    }),
  ),
  tail: Type.Optional(
    Type.Number({
      description: `For 'logs': number of lines to show (default: ${DEFAULT_LOG_TAIL})`,
    }),
  ),
});

const dockerComposeTool = defineTool<typeof dockerComposeParams, Record<string, unknown>>({
  name: "docker_compose",
  label: "Docker Compose",
  description: [
    "Run Docker Compose v2 subcommands: up, down, ps, logs, config.",
    "By default `up -d --wait` blocks until all services are healthy, then returns service states.",
    "Use `action=config` to validate a compose file before running it.",
    "Press Escape to abort blocking commands and return partial results.",
  ].join(" "),
  promptSnippet: "Run Docker Compose (up/down/ps/logs/config)",
  promptGuidelines: [
    "Use docker_compose action=up to start a stack from a compose file — it blocks until healthy by default (the nomad_submit analog).",
    "Pass file= for a non-default compose file path, or file=[...] for multiple.",
    "Use action=down removeVolumes=true to tear down and clean up volumes.",
    "Use action=config to validate the compose file before action=up.",
    "Use action=ps to inspect running services, action=logs for output.",
  ],
  parameters: dockerComposeParams,
  async execute(
    _toolCallId: string,
    params: {
      action: "up" | "down" | "ps" | "logs" | "config";
      file?: string | string[];
      project?: string;
      services?: string[];
      detach?: boolean;
      removeVolumes?: boolean;
      removeOrphans?: boolean;
      tail?: number;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const dockerEnv = resolveDockerEnv(params.context);
    const action = params.action;
    const files = params.file
      ? Array.isArray(params.file)
        ? params.file
        : [params.file]
      : undefined;
    const detach = params.detach !== false; // default true
    const removeVolumes = params.removeVolumes ?? false;
    const removeOrphans = params.removeOrphans ?? false;
    const project = params.project;

    const prefix = composePrefixArgs({ file: files, project });
    const projectLabel = project ?? "(default)";

    // ── action: up ───────────────────────────────────────────────────
    if (action === "up") {
      if (detach) {
        // up -d --wait — blocks until healthy or one service fails
        const upArgs = [
          ...prefix,
          "up",
          "-d",
          "--wait",
          ...(removeOrphans ? ["--remove-orphans"] : []),
          ...(params.services ?? []),
        ];
        const upResult = await dockerCli(upArgs, dockerEnv, signal);

        if (upResult.exitCode !== 0 && !upResult.aborted) {
          const errText = truncateOutput(
            upResult.stderr || upResult.stdout || "unknown error",
          );
          throw new Error(
            `Compose up --wait failed (exit ${upResult.exitCode}):\n${errText}`,
          );
        }

        // Fetch service states after up --wait
        let serviceLines: string[] = [];
        try {
          const psArgs = [...prefix, "ps", "--format", "json"];
          const psResult = await dockerCli(psArgs, dockerEnv, signal);
          if (psResult.exitCode === 0 && psResult.stdout.trim()) {
            const rows = parseJsonLines<Record<string, unknown>>(psResult.stdout);
            serviceLines = rows.map(formatComposePsRow);
          }
        } catch {
          // ps failed — non-fatal; report up result without service states
        }

        const aborted = upResult.aborted || (signal?.aborted ?? false);
        const header = aborted
          ? `Compose ${projectLabel} up (aborted)`
          : `Compose ${projectLabel} up (waited)`;
        const text =
          serviceLines.length > 0
            ? `${header}\n\n${serviceLines.join("\n")}`
            : header;

        return {
          content: [{ type: "text", text }],
          details: {
            action: "up",
            project: project ?? null,
            services: params.services ?? null,
            exitCode: upResult.exitCode,
            serviceStates: serviceLines,
            aborted,
          },
        };
      } else {
        // up attached — blocks streaming logs until exit or abort
        const upArgs = [
          ...prefix,
          "up",
          ...(removeOrphans ? ["--remove-orphans"] : []),
          ...(params.services ?? []),
        ];
        const upResult = await dockerCli(upArgs, dockerEnv, signal);
        const output = upResult.stdout + upResult.stderr;
        const aborted = upResult.aborted || (signal?.aborted ?? false);

        const text = truncateOutput(output) || "[no output]";
        return {
          content: [{ type: "text", text }],
          details: {
            action: "up",
            project: project ?? null,
            services: params.services ?? null,
            exitCode: upResult.exitCode,
            bytes: output.length,
            aborted,
          },
        };
      }
    }

    // ── action: down ─────────────────────────────────────────────────
    if (action === "down") {
      const downArgs = [
        ...prefix,
        "down",
        ...(removeVolumes ? ["--volumes"] : []),
        ...(removeOrphans ? ["--remove-orphans"] : []),
      ];
      const downResult = await dockerCli(downArgs, dockerEnv, signal);
      const aborted = downResult.aborted || (signal?.aborted ?? false);

      const text = `Compose ${projectLabel} down (exit ${downResult.exitCode})` +
        (aborted ? " — aborted" : "");

      return {
        content: [{ type: "text", text }],
        details: {
          action: "down",
          project: project ?? null,
          exitCode: downResult.exitCode,
          aborted,
        },
      };
    }

    // ── action: ps ───────────────────────────────────────────────────
    if (action === "ps") {
      const psArgs = [...prefix, "ps", "--format", "json"];
      const psResult = await dockerCli(psArgs, dockerEnv, signal);
      const aborted = psResult.aborted || (signal?.aborted ?? false);

      if (psResult.exitCode !== 0 && !aborted) {
        return {
          content: [{ type: "text", text: "(no services)" }],
          details: { action: "ps", project: project ?? null, count: 0, aborted },
        };
      }

      if (!psResult.stdout.trim()) {
        return {
          content: [{ type: "text", text: "(no services)" }],
          details: { action: "ps", project: project ?? null, count: 0, aborted },
        };
      }

      const rows = parseJsonLines<Record<string, unknown>>(psResult.stdout);
      const lines = rows.map(formatComposePsRow);
      const text = lines.join("\n");

      return {
        content: [{ type: "text", text }],
        details: {
          action: "ps",
          project: project ?? null,
          count: rows.length,
          aborted,
        },
      };
    }

    // ── action: logs ─────────────────────────────────────────────────
    if (action === "logs") {
      const tail = params.tail ?? DEFAULT_LOG_TAIL;
      const logArgs = [
        ...prefix,
        "logs",
        "--tail",
        String(tail),
        ...(params.services ?? []),
      ];
      const logResult = await dockerCli(logArgs, dockerEnv, signal);
      const output = logResult.stdout + logResult.stderr;
      const text = truncateOutput(output.trim()) || "[no output]";
      const aborted = logResult.aborted || (signal?.aborted ?? false);

      return {
        content: [{ type: "text", text }],
        details: {
          action: "logs",
          project: project ?? null,
          bytes: output.length,
          aborted,
        },
      };
    }

    // ── action: config ───────────────────────────────────────────────
    if (action === "config") {
      const configArgs = [...prefix, "config"];
      const configResult = await dockerCli(configArgs, dockerEnv, signal);
      const aborted = configResult.aborted || (signal?.aborted ?? false);

      if (configResult.exitCode !== 0 && !aborted) {
        const errText = truncateOutput(
          configResult.stderr || configResult.stdout || "unknown error",
        );
        throw new Error(
          `Compose config validation failed (exit ${configResult.exitCode}):\n${errText}`,
        );
      }

      const output = configResult.stdout;
      const text = truncateOutput(output.trim()) || "[empty config]";

      return {
        content: [{ type: "text", text }],
        details: {
          action: "config",
          project: project ?? null,
          bytes: output.length,
          aborted,
        },
      };
    }

    // Should not reach here — StringEnum constrains action
    throw new Error(`Unknown compose action: ${action}`);
  },
});

// ─── Tool collection ─────────────────────────────────────────────────────────

export const tools = [dockerComposeTool];
