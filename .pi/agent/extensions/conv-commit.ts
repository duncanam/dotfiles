/**
 * /conv-commit
 *
 * Reads the diff between the current branch and its branch point against the
 * repo's default branch, then asks the active model to produce a single
 * Conventional Commit subject line suitable for a squash-merged PR.
 *
 * - Does NOT commit anything (squash merging happens on GitHub by the user).
 * - Prints only the commit name in the conversation.
 * - Copies the result to the system clipboard on macOS (`pbcopy`) and
 *   Linux (`wl-copy`, `xclip`, or `xsel`, in that order).
 *
 * Usage:
 *   /conv-commit                 # auto-detect default branch
 *   /conv-commit develop         # use `develop` as the base ref
 */

import { spawn } from "node:child_process";
import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const MAX_DIFF_CHARS = 60_000; // keep prompt comfortably within context
const ALLOWED_TYPES = [
	"feat",
	"fix",
	"docs",
	"style",
	"refactor",
	"perf",
	"test",
	"build",
	"ci",
	"chore",
	"revert",
];
const CONV_COMMIT_RE = new RegExp(
	`^(?:${ALLOWED_TYPES.join("|")})(?:\\([^)\\n]+\\))?!?:\\s.+$`,
);

const SYSTEM_PROMPT = [
	"You generate Conventional Commit subject lines for squash-merged pull requests.",
	"",
	"Output rules (STRICT):",
	"- Output EXACTLY one line: the commit subject. No body, no markdown, no quotes, no code fences, no preamble, no trailing newline-separated content.",
	"- Format: <type>(<optional-scope>): <imperative description>",
	'- Append "!" before the colon if there is a breaking change (e.g. "feat(api)!: drop v1 endpoint").',
	`- Allowed types: ${ALLOWED_TYPES.join(", ")}.`,
	"- Description: imperative mood, lowercase first letter, no trailing period, <= 72 characters total including the type/scope prefix.",
	"- Pick the type that best matches the dominant change across all commits and the diff. Use a scope only if there is a clear short module/area name.",
].join("\n");

type ExecResult = { stdout: string; stderr: string; code: number };

function summarizeChanges(commits: string, diffstat: string, diff: string): string {
	const truncatedDiff =
		diff.length > MAX_DIFF_CHARS
			? `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[...diff truncated at ${MAX_DIFF_CHARS} chars...]`
			: diff;

	return [
		"Generate the Conventional Commit subject line for the following PR.",
		"",
		"<commits>",
		commits.trim() || "(no commits)",
		"</commits>",
		"",
		"<diffstat>",
		diffstat.trim() || "(empty)",
		"</diffstat>",
		"",
		"<diff>",
		truncatedDiff.trim() || "(empty)",
		"</diff>",
	].join("\n");
}

function sanitizeCommitLine(raw: string): string {
	let line = raw.trim();
	// Strip code fences entirely if the model wrapped output.
	line = line.replace(/^```[\w-]*\s*/m, "").replace(/```$/m, "").trim();
	// Take only the first non-empty line.
	for (const candidate of line.split(/\r?\n/)) {
		const trimmed = candidate.trim();
		if (trimmed.length > 0) {
			line = trimmed;
			break;
		}
	}
	// Strip surrounding quotes / backticks if present.
	line = line.replace(/^["'`]+|["'`]+$/g, "").trim();
	return line;
}

async function detectDefaultBranch(
	pi: ExtensionAPI,
	cwd: string,
): Promise<string | null> {
	const opts = { cwd } as const;

	// Preferred: whatever origin/HEAD points at.
	const sym = await pi.exec(
		"git",
		["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
		opts,
	);
	if (sym.code === 0) {
		const ref = sym.stdout.trim();
		if (ref) return ref;
	}

	// Fall back to common candidates.
	const candidates = ["origin/main", "origin/master", "main", "master", "develop"];
	for (const ref of candidates) {
		const verify = await pi.exec("git", ["rev-parse", "--verify", "--quiet", ref], opts);
		if (verify.code === 0 && verify.stdout.trim()) return ref;
	}
	return null;
}

async function copyToClipboard(text: string): Promise<string | null> {
	const candidates: Array<[string, string[]]> =
		process.platform === "darwin"
			? [["pbcopy", []]]
			: process.platform === "linux"
				? [
						...(process.env.WAYLAND_DISPLAY ? [["wl-copy", []] as [string, string[]]] : []),
						["xclip", ["-selection", "clipboard"]],
						["xsel", ["--clipboard", "--input"]],
						// wl-copy fallback for Wayland setups without the env var:
						["wl-copy", []],
					]
				: process.platform === "win32"
					? [["clip", []]]
					: [];

	for (const [cmd, args] of candidates) {
		try {
			const ok = await new Promise<boolean>((resolve) => {
				const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
				child.on("error", () => resolve(false));
				child.on("close", (code) => resolve(code === 0));
				child.stdin.end(text);
			});
			if (ok) return cmd;
		} catch {
			// try next candidate
		}
	}
	return null;
}

async function generateCommitMessage(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	overrideBase: string,
): Promise<void> {
	const cwd = ctx.cwd;
	const opts = { cwd } as const;

	// 1. Are we even in a git repo?
	const inside = await pi.exec(
		"git",
		["rev-parse", "--is-inside-work-tree"],
		opts,
	);
	if (inside.code !== 0 || inside.stdout.trim() !== "true") {
		ctx.ui.notify("/conv-commit: not inside a git repository", "error");
		return;
	}

	// 2. Pick a base ref.
	let baseRef = overrideBase.trim();
	if (!baseRef) {
		const detected = await detectDefaultBranch(pi, cwd);
		if (!detected) {
			ctx.ui.notify(
				"/conv-commit: could not detect a default branch (try `/conv-commit <ref>`)",
				"error",
			);
			return;
		}
		baseRef = detected;
	} else {
		const verify = await pi.exec(
			"git",
			["rev-parse", "--verify", "--quiet", baseRef],
			opts,
		);
		if (verify.code !== 0) {
			ctx.ui.notify(`/conv-commit: base ref not found: ${baseRef}`, "error");
			return;
		}
	}

	// 3. Find the merge-base.
	const mb: ExecResult = await pi.exec("git", ["merge-base", baseRef, "HEAD"], opts);
	if (mb.code !== 0 || !mb.stdout.trim()) {
		ctx.ui.notify(
			`/conv-commit: could not compute merge-base with ${baseRef}`,
			"error",
		);
		return;
	}
	const base = mb.stdout.trim();

	// 4. Anything to summarize?
	const headSha = (await pi.exec("git", ["rev-parse", "HEAD"], opts)).stdout.trim();
	if (headSha === base) {
		ctx.ui.notify(
			`/conv-commit: HEAD is at the branch point (${baseRef}); nothing to summarize`,
			"warning",
		);
		return;
	}

	// 5. Gather context (commits, diffstat, full diff).
	const [commits, diffstat, diff] = await Promise.all([
		pi.exec("git", ["log", "--no-merges", "--pretty=%s%n%b%n---", `${base}..HEAD`], opts),
		pi.exec("git", ["diff", "--stat", `${base}...HEAD`], opts),
		pi.exec("git", ["diff", `${base}...HEAD`], opts),
	]);

	if (!diff.stdout.trim() && !commits.stdout.trim()) {
		ctx.ui.notify(`/conv-commit: no diff vs ${baseRef}`, "warning");
		return;
	}

	// 6. Need a model to call.
	if (!ctx.model) {
		ctx.ui.notify("/conv-commit: no model selected", "error");
		return;
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok) {
		ctx.ui.notify(`/conv-commit: ${auth.error}`, "error");
		return;
	}
	if (!auth.apiKey) {
		ctx.ui.notify(
			`/conv-commit: no API key for ${ctx.model.provider}/${ctx.model.id}`,
			"error",
		);
		return;
	}

	ctx.ui.setStatus("conv-commit", `analyzing ${base.slice(0, 7)}..HEAD`);

	// 7. Ask the model.
	let response;
	try {
		response = await complete(
			ctx.model,
			{
				systemPrompt: SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: summarizeChanges(commits.stdout, diffstat.stdout, diff.stdout),
							},
						],
						timestamp: Date.now(),
					},
				],
			},
			{ apiKey: auth.apiKey, headers: auth.headers },
		);
	} catch (err) {
		ctx.ui.setStatus("conv-commit", "");
		ctx.ui.notify(
			`/conv-commit: model call failed: ${(err as Error).message}`,
			"error",
		);
		return;
	} finally {
		ctx.ui.setStatus("conv-commit", "");
	}

	const rawText = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");

	const commitLine = sanitizeCommitLine(rawText);
	if (!commitLine) {
		ctx.ui.notify("/conv-commit: model returned empty output", "error");
		return;
	}
	if (!CONV_COMMIT_RE.test(commitLine)) {
		// Surface it anyway so the user can edit it; flag the problem.
		ctx.ui.notify(
			"/conv-commit: model output did not match Conventional Commit format",
			"warning",
		);
	}

	// 8. Copy to clipboard.
	const clipTool = await copyToClipboard(commitLine);

	// 9. Display only the commit name.
	pi.sendMessage({
		customType: "conv-commit",
		content: commitLine,
		display: true,
		details: {
			base: baseRef,
			mergeBase: base,
			clipboard: clipTool ?? null,
		},
	});

	if (clipTool) {
		ctx.ui.notify(`Copied to clipboard via ${clipTool}`, "info");
	} else {
		ctx.ui.notify(
			"Could not copy to clipboard (install pbcopy, wl-copy, xclip, or xsel)",
			"warning",
		);
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("conv-commit", {
		description:
			"Suggest a Conventional Commit subject for the current branch's PR (diff vs branch point); copies to clipboard, does not commit.",
		handler: async (args, ctx) => {
			await generateCommitMessage(pi, ctx, args ?? "");
		},
	});
}
