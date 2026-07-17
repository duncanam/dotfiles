/**
 * Docker daemon tools — info and generic inspect.
 *
 * Read-only tools for discovering Docker daemon state and inspecting any
 * Docker object (container, image, network, volume, node, service, task).
 * Every tool shells out through dockerCli().
 *
 * Tools:
 *   docker_info    — Daemon summary (container/image counts, storage, swarm).
 *   docker_inspect — Full low-level detail for any Docker object.
 */

import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  dockerCli,
  resolveDockerEnv,
  dockerCommonFields,
  truncateOutput,
  dockerInspect,
  MAX_LOG_BYTES,
  type DockerEnv,
} from "./transport.js";
import type { DockerInfo } from "./types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format bytes to a human-readable string. */
function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / 1_048_576)} MB`;
}

/** Format a DockerInfo object as a readable summary. */
function formatDockerInfo(info: DockerInfo): string {
  const lines: string[] = [];

  lines.push(
    `Docker ${info.ServerVersion ?? "?"} on ${info.OSType ?? "?"}/${info.Architecture ?? "?"} (${info.OperatingSystem ?? "?"})`,
  );

  const running = info.ContainersRunning ?? 0;
  const paused = info.ContainersPaused ?? 0;
  const stopped = info.ContainersStopped ?? 0;
  const total = info.Containers ?? running + paused + stopped;
  lines.push(
    `Containers: ${total} (running=${running} paused=${paused} stopped=${stopped}), Images: ${info.Images ?? 0}`,
  );

  lines.push(
    `Storage driver: ${info.Driver ?? "?"}, Docker root: ${info.DockerRootDir ?? "?"}`,
  );

  if (info.NCPU !== undefined || info.MemTotal !== undefined) {
    const cpu = info.NCPU !== undefined ? `CPUs: ${info.NCPU}` : "";
    const mem = info.MemTotal !== undefined
      ? `Memory: ${formatBytes(info.MemTotal)}`
      : "";
    lines.push([cpu, mem].filter(Boolean).join(", "));
  }

  if (info.Swarm) {
    const swarm = info.Swarm;
    const control = swarm.ControlAvailable !== undefined
      ? `control available: ${swarm.ControlAvailable}`
      : "";
    const nodes = swarm.Nodes !== undefined ? `nodes: ${swarm.Nodes}` : "";
    const swarmExtra = [control, nodes].filter(Boolean).join(", ");
    lines.push(
      `Swarm: ${swarm.LocalNodeState ?? "?"}${swarmExtra ? ` (${swarmExtra})` : ""}`,
    );
  }

  return truncateOutput(lines.join("\n"));
}

// ─── Tool: docker_info ───────────────────────────────────────────────────────

const dockerInfoParams = Type.Object({
  ...dockerCommonFields,
});

const dockerInfoTool = defineTool<typeof dockerInfoParams, Record<string, unknown>>({
  name: "docker_info",
  label: "Docker Info",
  description: [
    "Show Docker daemon summary: server version, container/image counts,",
    "storage driver, CPU/memory, and Swarm status.",
    "The Docker analog of nomad_nodes — use it to discover what's available",
    "before planning container work.",
  ].join(" "),
  promptSnippet: "Daemon info: containers, images, storage, swarm",
  promptGuidelines: [
    "Use docker_info to see the Docker daemon's state (container/image counts, storage driver, swarm status) before planning work.",
    "It's the Docker analog of nomad_nodes — use it to discover what resources are available.",
  ],
  parameters: dockerInfoParams,
  async execute(
    _toolCallId: string,
    params: { context?: string },
    signal?: AbortSignal,
  ) {
    const dockerEnv = resolveDockerEnv(params.context);

    const result = await dockerCli(
      ["info", "--format", "{{json .}}"],
      dockerEnv,
      signal,
    );

    if (result.exitCode !== 0 && !result.aborted) {
      const errText = result.stderr || result.stdout || "unknown error";
      throw new Error(
        `docker info failed (exit ${result.exitCode}): ${errText}`,
      );
    }

    let info: DockerInfo;
    try {
      info = JSON.parse(result.stdout) as DockerInfo;
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse docker info output: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const text = formatDockerInfo(info);

    return {
      content: [{ type: "text", text }],
      details: info as unknown as Record<string, unknown>,
    };
  },
});

// ─── Tool: docker_inspect ────────────────────────────────────────────────────

const dockerInspectParams = Type.Object({
  ...dockerCommonFields,
  object: Type.Union([
    Type.String({ description: "Single name or ID to inspect" }),
    Type.Array(Type.String(), {
      description: "One or more names/IDs to inspect",
    }),
  ]),
  type: Type.Optional(
    Type.String({
      description:
        "Docker object type to disambiguate (--type): container, image, network, volume, node, service, task. Omit for auto-detect.",
    }),
  ),
});

const dockerInspectTool = defineTool<typeof dockerInspectParams, Record<string, unknown>>({
  name: "docker_inspect",
  label: "Docker Inspect",
  description: [
    "Return full low-level detail for any Docker object (container, image,",
    "network, volume, node, service, task) by name or ID.",
    "Pretty-prints the JSON, truncated to ~50KB.",
    "Use `type=` to disambiguate when a name could match multiple kinds.",
  ].join(" "),
  promptSnippet: "Full low-level detail for any Docker object",
  promptGuidelines: [
    "Use docker_inspect for the complete JSON of a container, image, network, or volume — it subsumes per-type detail tools.",
    "Pass type= to disambiguate when a name could match multiple kinds (e.g. 'container' vs 'image').",
    "This is the read-only analog of nomad_get for ad-hoc Docker object detail.",
    "For containers specifically, prefer docker_inspect over parsing docker ps output.",
  ],
  parameters: dockerInspectParams,
  async execute(
    _toolCallId: string,
    params: {
      object: string | string[];
      type?: string;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const dockerEnv = resolveDockerEnv(params.context);
    const objects = Array.isArray(params.object)
      ? params.object
      : [params.object];

    // Build args: docker inspect [--type <t>] <objects...>
    const args = ["inspect"];
    if (params.type) {
      args.push("--type", params.type);
    }
    args.push(...objects);

    const result = await dockerCli(args, dockerEnv, signal);

    if (result.exitCode !== 0 && !result.aborted) {
      const errMsg = (result.stderr || result.stdout || "").trim();
      const lower = errMsg.toLowerCase();
      // Not-found: return placeholder instead of throwing
      if (
        lower.includes("no such object") ||
        lower.includes("no such container") ||
        lower.includes("no such image") ||
        lower.includes("no such network") ||
        lower.includes("no such volume") ||
        lower.includes("no such node") ||
        lower.includes("no such service") ||
        lower.includes("no such task") ||
        lower.includes("not found")
      ) {
        return {
          content: [
            { type: "text", text: `[No such object: ${objects.join(", ")}]` },
          ],
          details: {
            object: objects,
            type: params.type ?? null,
            exists: false,
            count: objects.length,
          },
        };
      }
      // Other fatal errors
      throw new Error(
        `docker inspect failed (exit ${result.exitCode}): ${errMsg}`,
      );
    }

    if (!result.stdout.trim()) {
      return {
        content: [
          { type: "text", text: `[No such object: ${objects.join(", ")}]` },
        ],
        details: {
          object: objects,
          type: params.type ?? null,
          exists: false,
          count: objects.length,
        },
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (err: unknown) {
      throw new Error(
        `Failed to parse docker inspect output: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const pretty = JSON.stringify(parsed, null, 2);
    const text = truncateOutput(pretty);

    return {
      content: [{ type: "text", text }],
      details: {
        object: objects,
        type: params.type ?? null,
        count: Array.isArray(parsed) ? (parsed as unknown[]).length : 1,
      },
    };
  },
});

// ─── Tool collection ─────────────────────────────────────────────────────────

export const tools = [dockerInfoTool, dockerInspectTool];
