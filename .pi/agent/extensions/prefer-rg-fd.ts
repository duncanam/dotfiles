/**
 * Prefer rg/fd Extension
 *
 * Enforces the AGENTS.md "Finding" policy on bash tool calls:
 *
 * 1. Hard-blocks `grep` (and grep-family) and `find` invocations,
 *    returning feedback that points the agent at `rg` / `fd` instead.
 * 2. Blocks ANY use of shell-level `timeout`/`gtimeout` wrappers: neither
 *    binary is installed on this macOS machine, and a missing binary fails
 *    silently (exit 127) when the agent redirects stderr — yielding a
 *    wrong empty result instead of an error.
 * 3. Requires `rg` / `fd` invocations to be time-bounded via the bash
 *    tool's own `timeout` parameter.
 *
 * Detection notes:
 * - The command is split into pipeline/compound segments (|, ||, &&, ;,
 *   newlines, $(...), backticks) and each segment's leading command word
 *   is checked, so `rg foo | grep bar` is still caught.
 * - Leading env assignments (FOO=1) and wrappers (sudo, command, env,
 *   time, nice) are skipped; `xargs grep` checks the second word.
 * - `timeout`/`gtimeout` wrappers are unwrapped for the blocked-tool check
 *   (so `timeout 30 grep x` is still blocked) and rejected outright for
 *   any command (this machine has neither binary).
 * - Paths are basenamed, so `/usr/bin/grep` and `./fd` are caught too.
 * - `git grep` is intentionally allowed (leading word is `git`), as a
 *   deliberate escape hatch for git-aware searches.
 * - Quoted text containing separators may cause rare false positives;
 *   toggle with /search-policy if one bites.
 *
 * Toggle at runtime with the /search-policy command.
 */

import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BLOCKED: Record<string, { tool: string; hint: string; examples: string }> = {
	grep: {
		tool: "rg",
		hint: "`rg PATTERN [PATH...]` (recursive by default)",
		examples:
			"`rg 'pattern'` · `rg -i 'pattern' path/` · `rg -l 'pattern'` (files only) · `rg -n 'pattern'` (line numbers) · `rg -t ts 'pattern'` (by file type)",
	},
	egrep: {
		tool: "rg",
		hint: "`rg PATTERN [PATH...]` (rg uses extended regex syntax by default, no -E needed)",
		examples: "`rg 'foo|bar' path/` · `rg -i 'foo|bar'`",
	},
	fgrep: {
		tool: "rg",
		hint: "`rg -F PATTERN [PATH...]` (-F for fixed strings)",
		examples: "`rg -F 'literal (string)' path/`",
	},
	rgrep: {
		tool: "rg",
		hint: "`rg PATTERN [PATH...]` (recursive by default)",
		examples: "`rg 'pattern' path/`",
	},
	find: {
		tool: "fd",
		hint: "`fd [PATTERN] [PATH...]` (regex on file names, recursive by default)",
		examples:
			"`fd pattern` · `fd -e ts` (by extension) · `fd -t f pattern` (files) / `fd -t d pattern` (dirs) · `fd pattern --exec cmd {}` (like find -exec) · `fd -H pattern` (include hidden)",
	},
};

// Search tools that must be time-bounded.
const SEARCH_TOOLS = new Set(["rg", "fd"]);

// Separators that start a new command segment: pipes, &&, ||, ;, newline,
// command substitution, backticks.
const SEGMENT_SEP = /\|\||&&|[|;\n]|\$\(|`/;

const WRAPPER_WORDS = new Set(["sudo", "command", "builtin", "env", "time", "nice"]);
const TIMEOUT_WORDS = new Set(["timeout", "gtimeout"]);

interface ResolvedSegment {
	/** Leading command word (basename), or null for empty segments. */
	word: string | null;
	/** True if the segment runs under a shell-level timeout wrapper. */
	bounded: boolean;
}

function resolveSegment(segment: string): ResolvedSegment {
	const tokens = segment.trim().split(/\s+/);
	let bounded = false;
	while (tokens.length > 0) {
		const t = tokens[0];
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) {
			tokens.shift(); // FOO=bar env assignment prefix
			continue;
		}
		if (TIMEOUT_WORDS.has(t)) {
			bounded = true;
			tokens.shift();
			// Skip timeout's own options (some take values), then the duration.
			while (tokens.length > 0 && tokens[0].startsWith("-")) {
				const opt = tokens.shift()!;
				if (opt === "-k" || opt === "-s" || opt === "--kill-after" || opt === "--signal") {
					tokens.shift(); // option value
				}
			}
			if (tokens.length > 0 && /^\d/.test(tokens[0])) tokens.shift(); // duration
			continue;
		}
		if (WRAPPER_WORDS.has(t)) {
			tokens.shift();
			continue;
		}
		break;
	}
	if (tokens.length === 0) return { word: null, bounded };
	// `xargs grep ...` — the real command is the argument to xargs
	const word = tokens[0] === "xargs" && tokens[1] ? tokens[1] : tokens[0];
	// Strip any path prefix: /usr/bin/grep -> grep, ./find -> find
	return { word: word.split("/").pop() ?? word, bounded };
}

export default function (pi: ExtensionAPI) {
	let enabled = true;

	pi.registerCommand("search-policy", {
		description: "Toggle enforcement of the rg/fd search policy (blocks grep/find, requires timeouts on rg/fd)",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			ctx.ui.notify(`search-policy ${enabled ? "enabled" : "disabled"} — grep/find ${enabled ? "blocked" : "allowed"}`, "info");
		},
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!enabled) return undefined;
		if (!isToolCallEventType("bash", event)) return undefined;

		const command = event.input.command;
		if (!command) return undefined;

		const segments = command.split(SEGMENT_SEP).map(resolveSegment);

		// 1. Blocked tools (grep family, find) — always blocked, timeout or not.
		for (const { word } of segments) {
			if (!word) continue;
			const alt = BLOCKED[word];
			if (!alt) continue;

			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked \`${word}\` — use ${alt.tool} instead`, "warning");
			}

			return {
				block: true,
				reason: [
					`BLOCKED by the search-policy extension: \`${word}\` is not allowed in this environment.`,
					`Use ${alt.tool} instead: ${alt.hint}.`,
					`Examples: ${alt.examples}`,
					`Do not retry with ${word} (or grep/find variants, including inside pipes, xargs, or timeout wrappers). Rewrite the command with ${alt.tool} and re-run.`,
					`Remember: ${alt.tool} commands must be time-bounded — set the bash tool's \`timeout\` parameter on the call (a shell \`timeout\` wrapper does not count and does not exist on this machine).`,
				].join("\n"),
			};
		}

		// 2. Shell timeout wrappers are never valid on this machine — block
		//    them outright so agents learn to use the tool parameter instead
		//    of producing silently-empty results.
		for (const { word, bounded } of segments) {
			if (!bounded || !word) continue;

			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked shell \`timeout\` wrapper — use the bash tool timeout parameter`, "warning");
			}

			return {
				block: true,
				reason: [
					`BLOCKED by the search-policy extension: the shell \`timeout\`/\`gtimeout\` wrapper is not allowed here — GNU \`timeout\` is NOT installed on this macOS machine, so this command would never actually run. Worse, it fails silently (exit 127) when stderr is redirected, producing a wrong empty result instead of an error.`,
					`Drop the wrapper. If the command needs a time bound, set the bash tool's \`timeout\` parameter on the call itself (e.g. timeout: 60) — it is a tool parameter, not a shell flag.`,
				].join("\n"),
			};
		}

		// 3. rg/fd must be time-bounded via the bash tool's own `timeout`
		//    parameter, which bounds the entire command.
		if (event.input.timeout != null) return undefined;

		for (const { word } of segments) {
			if (!word || !SEARCH_TOOLS.has(word)) continue;

			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked unbounded \`${word}\` — set the bash tool timeout parameter`, "warning");
			}

			return {
				block: true,
				reason: [
					`BLOCKED by the search-policy extension: \`${word}\` commands must be time-bounded via the bash tool's \`timeout\` parameter.`,
					`Re-run the same command with the tool's \`timeout\` parameter set (e.g. timeout: 60). Do NOT add it as a shell flag or \`timeout\` wrapper — it is a parameter of the bash tool call itself.`,
				].join("\n"),
			};
		}

		return undefined;
	});
}
