/**
 * Docker image tools — list, pull, build.
 *
 * Each tool shells out to the `docker` CLI via the shared transport layer.
 * Abort signals (Escape) kill the child process and return partial results.
 *
 * Tools:
 *   docker_images — List images (compact rows).
 *   docker_pull   — Pull an image from a registry.
 *   docker_build  — Build an image from a Dockerfile.
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
  type DockerEnv,
} from "./transport.js";
import type { ImageRow } from "./types.js";

// ─── Tool: docker_images ─────────────────────────────────────────────────────

const dockerImagesParams = Type.Object({
  ...dockerCommonFields,
  all: Type.Optional(
    Type.Boolean({
      description: "Include intermediate image layers (-a/--all)",
    }),
  ),
  dangling: Type.Optional(
    Type.Boolean({
      description: "Show only dangling images (--filter dangling=true)",
    }),
  ),
  reference: Type.Optional(
    Type.String({
      description:
        "Filter by reference pattern (--filter reference=<pat>), e.g. 'ubuntu:*' or 'my-image'",
    }),
  ),
});

const dockerImagesTool = defineTool<
  typeof dockerImagesParams,
  Record<string, unknown>
>({
  name: "docker_images",
  label: "Docker Images",
  description: [
    "List Docker images in compact row format.",
    "By default shows all top-level images; pass all=true to include intermediate layers.",
    "Filters: dangling=true for untagged images, reference=<pattern> to match names/tags.",
  ].join(" "),
  promptSnippet: "List images (compact rows)",
  promptGuidelines: [
    "Use docker_images to see available images.",
    "Filter with reference= for a name pattern (e.g. reference='ubuntu:*').",
    "Use docker_inspect for full detail on one image.",
  ],
  parameters: dockerImagesParams,
  async execute(
    _toolCallId: string,
    params: {
      all?: boolean;
      dangling?: boolean;
      reference?: string;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const env = resolveDockerEnv(params.context);

    const args = ["images", "--format", "{{json .}}"];

    if (params.all) {
      args.push("-a");
    }

    if (params.dangling) {
      args.push("--filter", "dangling=true");
    }

    if (params.reference) {
      args.push("--filter", `reference=${params.reference}`);
    }

    let result;
    try {
      result = await dockerCli(args, env, signal);
    } catch (err: unknown) {
      throw new Error(
        `docker images failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (result.exitCode !== 0) {
      throw new Error(
        `docker images failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
      );
    }

    let rows = parseJsonLines<ImageRow>(result.stdout);

    // Skip <none>:<none> rows unless user explicitly asked for dangling
    if (!params.dangling) {
      rows = rows.filter(
        (r) => !(r.Repository === "<none>" && r.Tag === "<none>"),
      );
    }

    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: "(no images)" }],
        details: {
          count: 0,
          all: params.all ?? false,
          dangling: params.dangling ?? false,
          reference: params.reference,
          aborted: signal?.aborted ?? false,
        },
      };
    }

    const lines = rows.map((row) => {
      const id = row.ID.length > 12 ? row.ID.slice(0, 12) : row.ID;
      const repoTag = `${row.Repository}:${row.Tag}`;
      return `${repoTag} | ${id} | ${row.CreatedSince} | ${row.Size}`;
    });

    const text = lines.join("\n");

    return {
      content: [{ type: "text", text }],
      details: {
        count: rows.length,
        all: params.all ?? false,
        dangling: params.dangling ?? false,
        reference: params.reference,
        aborted: signal?.aborted ?? false,
      },
    };
  },
});

// ─── Tool: docker_pull ───────────────────────────────────────────────────────

const dockerPullParams = Type.Object({
  ...dockerCommonFields,
  image: Type.String({
    description:
      "Image name to pull (e.g. 'ubuntu:24.04', 'python:3.12-slim')",
  }),
  platform: Type.Optional(
    Type.String({
      description:
        "Platform to pull (--platform), e.g. 'linux/amd64', 'linux/arm64'",
    }),
  ),
  allTags: Type.Optional(
    Type.Boolean({
      description: "Pull all tags (-a/--all-tags)",
    }),
  ),
});

const dockerPullTool = defineTool<
  typeof dockerPullParams,
  Record<string, unknown>
>({
  name: "docker_pull",
  label: "Docker Pull",
  description: [
    "Pull a Docker image from a registry.",
    "Returns a summary of what was pulled; long output is truncated to 50KB.",
  ].join(" "),
  promptSnippet: "Pull an image from a registry",
  promptGuidelines: [
    "Use docker_pull to pre-fetch before docker_run.",
    "Pass platform= for multi-arch images (e.g. 'linux/arm64').",
  ],
  parameters: dockerPullParams,
  async execute(
    _toolCallId: string,
    params: {
      image: string;
      platform?: string;
      allTags?: boolean;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const env = resolveDockerEnv(params.context);

    const args = ["pull"];

    if (params.platform) {
      args.push("--platform", params.platform);
    }

    if (params.allTags) {
      args.push("-a");
    }

    args.push(params.image);

    let result;
    try {
      result = await dockerCli(args, env, signal);
    } catch (err: unknown) {
      throw new Error(
        `docker pull failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (result.aborted) {
      const combined = (result.stdout + result.stderr).trim();
      const snippet = combined ? truncateOutput(combined) : "(no output)";
      return {
        content: [
          {
            type: "text",
            text: `Pull aborted for ${params.image}\n${snippet}`,
          },
        ],
        details: {
          image: params.image,
          exitCode: result.exitCode,
          bytes: combined.length,
          aborted: true,
        },
      };
    }

    if (result.exitCode !== 0) {
      const errTail = truncateOutput(result.stderr || result.stdout);
      throw new Error(
        `docker pull failed (exit ${result.exitCode}):\n${errTail}`,
      );
    }

    const combined = (result.stdout + result.stderr).trim();
    const snippet = combined ? truncateOutput(combined) : "(no output)";
    const text = `Pulled ${params.image}\n\n${snippet}`;

    return {
      content: [{ type: "text", text }],
      details: {
        image: params.image,
        exitCode: 0,
        bytes: combined.length,
        aborted: false,
      },
    };
  },
});

// ─── Tool: docker_build ──────────────────────────────────────────────────────

const dockerBuildParams = Type.Object({
  ...dockerCommonFields,
  path: Type.String({
    description:
      "Build context directory or URL (e.g. '.', './app', 'https://...')",
  }),
  dockerfile: Type.Optional(
    Type.String({
      description:
        "Path to Dockerfile (default: 'Dockerfile' relative to context)",
    }),
  ),
  tag: Type.Optional(
    Type.Union([
      Type.String({
        description: "Tag for the built image, e.g. 'my-app:latest'",
      }),
      Type.Array(Type.String(), {
        description:
          "One or more tags for the built image",
      }),
    ]),
  ),
  buildArg: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description:
        "Build arguments (--build-arg KEY=VALUE) for ARG instructions",
    }),
  ),
  noCache: Type.Optional(
    Type.Boolean({
      description: "Do not use cache when building (--no-cache)",
    }),
  ),
  platform: Type.Optional(
    Type.String({
      description:
        "Target platform (--platform), e.g. 'linux/amd64'",
    }),
  ),
  target: Type.Optional(
    Type.String({
      description:
        "Target build stage (--target <stage>) for multi-stage builds",
    }),
  ),
  rm: Type.Optional(
    Type.Boolean({
      description:
        "Remove intermediate containers after build (--rm, default: true)",
    }),
  ),
});

const dockerBuildTool = defineTool<
  typeof dockerBuildParams,
  Record<string, unknown>
>({
  name: "docker_build",
  label: "Docker Build",
  description: [
    "Build a Docker image from a Dockerfile.",
    "Returns a summary with the image ID; long build output is truncated to 50KB.",
  ].join(" "),
  promptSnippet: "Build an image from a Dockerfile",
  promptGuidelines: [
    "Use docker_build to create an image from a context directory + Dockerfile.",
    "Pass tag= to name the image (accepts a single string or array of tags).",
    "Pass buildArg= to provide ARG values (e.g. { VERSION: '1.0', DEBUG: '0' }).",
    "Use target= for a specific stage in a multi-stage build.",
  ],
  parameters: dockerBuildParams,
  async execute(
    _toolCallId: string,
    params: {
      path: string;
      dockerfile?: string;
      tag?: string | string[];
      buildArg?: Record<string, string>;
      noCache?: boolean;
      platform?: string;
      target?: string;
      rm?: boolean;
      context?: string;
    },
    signal?: AbortSignal,
  ) {
    const env = resolveDockerEnv(params.context);

    const args = ["build"];

    if (params.dockerfile) {
      args.push("-f", params.dockerfile);
    }

    const tags = params.tag
      ? Array.isArray(params.tag)
        ? params.tag
        : [params.tag]
      : [];

    for (const t of tags) {
      args.push("-t", t);
    }

    if (params.buildArg) {
      for (const [k, v] of Object.entries(params.buildArg)) {
        args.push("--build-arg", `${k}=${v}`);
      }
    }

    if (params.noCache) {
      args.push("--no-cache");
    }

    if (params.platform) {
      args.push("--platform", params.platform);
    }

    if (params.target) {
      args.push("--target", params.target);
    }

    if (params.rm === false) {
      args.push("--rm=false");
    }

    args.push(params.path);

    let result;
    try {
      result = await dockerCli(args, env, signal);
    } catch (err: unknown) {
      throw new Error(
        `docker build failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (result.aborted) {
      const combined = (result.stdout + result.stderr).trim();
      const snippet = combined ? truncateOutput(combined) : "(no output)";
      return {
        content: [
          {
            type: "text",
            text: `Build aborted for ${params.path}\n${snippet}`,
          },
        ],
        details: {
          buildContext: params.path,
          dockerfile: params.dockerfile ?? "Dockerfile",
          tags,
          exitCode: result.exitCode,
          bytes: combined.length,
          aborted: true,
          context: params.context ?? null,
        },
      };
    }

    if (result.exitCode !== 0) {
      const errTail = truncateOutput(result.stderr || result.stdout);
      throw new Error(
        `docker build failed (exit ${result.exitCode}):\n${errTail}`,
      );
    }

    const combined = (result.stdout + result.stderr).trim();
    const snippet = combined ? truncateOutput(combined) : "(no output)";

    // Try to extract image ID from build output
    const imageIdMatch = combined.match(
      /(?:naming to|\bSuccessfully built\b|writing image sha256:)\s*(\S+)/,
    );
    const imageId = imageIdMatch ? imageIdMatch[1] : undefined;

    const tagSummary = tags.length > 0 ? tags.join(", ") : "(untagged)";
    const text = `Built ${tagSummary}${imageId ? ` (${imageId})` : ""}\n\n${snippet}`;

    return {
      content: [{ type: "text", text }],
      details: {
        buildContext: params.path,
        dockerfile: params.dockerfile ?? "Dockerfile",
        tags,
        exitCode: 0,
        imageId,
        bytes: combined.length,
        aborted: false,
        context: params.context ?? null,
      },
    };
  },
});

// ─── Tool collection ─────────────────────────────────────────────────────────

export const tools = [dockerImagesTool, dockerPullTool, dockerBuildTool];
