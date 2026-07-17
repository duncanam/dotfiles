/**
 * Docker transport layer — spawns the `docker` CLI for every operation.
 *
 * The CLI handles every transport (unix socket, TCP, TLS, SSH, named pipes,
 * Docker contexts) transparently, so this layer is a thin wrapper around
 * `node:child_process` `spawn`. Every tool in this extension shells out through
 * `dockerCli()`.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { Type } from "typebox";
import type { ContainerInspect } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DockerEnv {
  DOCKER_HOST?: string;
  DOCKER_CONTEXT?: string;
  DOCKER_TLS_VERIFY?: string;
  DOCKER_CERT_PATH?: string;
}

export interface DockerCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  aborted: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum log/output bytes before truncation (50KB). */
export const MAX_LOG_BYTES = 50 * 1024;

/** Default number of tail lines for docker logs. */
export const DEFAULT_LOG_TAIL = 500;

// ─── Shared parameter fields ─────────────────────────────────────────────────

/** Spread into every tool's Type.Object so all tools accept an optional `context` override. */
export const dockerCommonFields = {
  context: Type.Optional(
    Type.String({
      description:
        "Docker context name (default: current `docker context` / $DOCKER_CONTEXT)",
    }),
  ),
} as const;

// ─── Env resolution ──────────────────────────────────────────────────────────

/**
 * Read Docker connection env vars from process.env. If contextOverride is given,
 * set DOCKER_CONTEXT to it (overriding the ambient $DOCKER_CONTEXT).
 * Returns an env object to merge with process.env when spawning docker.
 */
export function resolveDockerEnv(contextOverride?: string): DockerEnv {
  const env: DockerEnv = {};
  if (process.env.DOCKER_HOST) env.DOCKER_HOST = process.env.DOCKER_HOST;
  if (process.env.DOCKER_TLS_VERIFY) env.DOCKER_TLS_VERIFY = process.env.DOCKER_TLS_VERIFY;
  if (process.env.DOCKER_CERT_PATH) env.DOCKER_CERT_PATH = process.env.DOCKER_CERT_PATH;
  if (contextOverride) {
    env.DOCKER_CONTEXT = contextOverride;
  } else if (process.env.DOCKER_CONTEXT) {
    env.DOCKER_CONTEXT = process.env.DOCKER_CONTEXT;
  }
  return env;
}

// ─── Core spawn helper ───────────────────────────────────────────────────────

/**
 * Spawn `docker` with `args`, returning accumulated stdout/stderr and exit code.
 *
 * Context override: when `options.context` is set, `--context <ctx>` is prepended
 * before the subcommand. Falls back to `envOverride.DOCKER_CONTEXT` if present.
 *
 * @param args            Docker CLI arguments (after `docker`).
 * @param envOverride     Extra env vars merged on top of process.env.
 * @param signal          AbortSignal — Escape aborts and returns partial results.
 * @param options.context Explicit Docker context (prepends `--context <ctx>`).
 * @param options.cwd     Working directory for the child process.
 * @param options.timeoutMs  Hard timeout (triggers SIGTERM then SIGKILL).
 * @param options.onStdout  Stream stdout chunks in real time.
 * @param options.onStderr  Stream stderr chunks in real time.
 */
export async function dockerCli(
  args: string[],
  envOverride?: DockerEnv,
  signal?: AbortSignal,
  options?: {
    cwd?: string;
    timeoutMs?: number;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    context?: string;
  },
): Promise<DockerCliResult> {
  const finalArgs = [...args];

  // Prefer explicit options.context; fall back to DOCKER_CONTEXT in envOverride.
  // Docker wants --context before the subcommand, e.g. `docker --context ctx ps ...`.
  const ctx = options?.context ?? envOverride?.DOCKER_CONTEXT;
  if (ctx) {
    finalArgs.unshift("--context", ctx);
  }

  const env = { ...process.env, ...envOverride };

  let child: ChildProcess;
  try {
    child = spawn("docker", finalArgs, {
      env,
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err: unknown) {
    throw new Error(
      `Failed to spawn docker: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    stdout += text;
    options?.onStdout?.(text);
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    stderr += text;
    options?.onStderr?.(text);
  });

  let killTimer: ReturnType<typeof setTimeout> | undefined;
  let aborted = false;

  const onAbort = () => {
    aborted = true;
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (child && child.exitCode === null) {
          child.kill("SIGKILL");
        }
      }, 5000);
      if (killTimer.unref) killTimer.unref();
    }
  };

  if (signal) {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  if (options?.timeoutMs && options.timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      onAbort();
    }, options.timeoutMs);
    if (timeoutTimer.unref) timeoutTimer.unref();
  }

  return new Promise<DockerCliResult>((resolve, reject) => {
    child.on("error", (err) => {
      if (killTimer) clearTimeout(killTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(err);
    });

    child.on("close", (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? (aborted ? -1 : 0),
        aborted: aborted || (signal?.aborted ?? false),
      });
    });
  });
}

// ─── Output helpers ──────────────────────────────────────────────────────────

/**
 * Truncate text to the last `max` bytes, prepending a truncation notice.
 * Mirrors nomad's fetchLogs truncation pattern.
 */
export function truncateOutput(text: string, max = MAX_LOG_BYTES): string {
  if (text.length <= max) return text;
  return `[…truncated to last ${max / 1024}KB…]\n${text.slice(-max)}`;
}

/**
 * Parse newline-delimited JSON lines (e.g. `docker ps --format '{{json .}}'` output).
 */
export function parseJsonLines<T>(stdout: string): T[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

// ─── Inspect helper ──────────────────────────────────────────────────────────

/**
 * Run `docker inspect` for one or more container names/IDs.
 * Returns the parsed JSON array. Throws on non-zero exit or empty result.
 *
 * Default type param is ContainerInspect; pass a custom type for other
 * resources (images, networks, etc.).
 */
export async function dockerInspect<T = ContainerInspect>(
  names: string[],
  env: DockerEnv,
  signal?: AbortSignal,
): Promise<T[]> {
  const result = await dockerCli(["inspect", ...names], env, signal);
  if (result.exitCode !== 0) {
    const msg = result.stderr.trim() || result.stdout.trim() || "unknown error";
    throw new Error(`docker inspect failed (exit ${result.exitCode}): ${msg}`);
  }
  if (!result.stdout.trim()) {
    throw new Error(`docker inspect returned empty output for: ${names.join(", ")}`);
  }
  try {
    return JSON.parse(result.stdout) as T[];
  } catch (err: unknown) {
    throw new Error(
      `Failed to parse docker inspect output: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
