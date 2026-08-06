/**
 * Loop Guard — detects and breaks exact-repeat assistant loops.
 *
 * Some failures are deterministic two-party loops: an extension (or a queued
 * follow-up) sends the same trigger, the model replies with the same message
 * (same text, same tool calls), nothing changes, repeat forever. See e.g. a
 * session where a scheduled TODO cycle prompt was answered 25+ times with a
 * byte-identical "already complete, no action required" no-op.
 *
 * This extension fingerprints every assistant turn (text + tool call
 * name/arguments; thinking excluded since it may vary) and tracks how many
 * consecutive turns were identical:
 *
 *   - streak >= WARN_AT: append a cache-safe anti-loop warning to the TAIL
 *     of the context for subsequent LLM calls (append-only, never persisted),
 *     instructing the model to diverge, and notify the user once.
 *   - streak >= ABORT_AT: hard-abort the run and notify. If a driver re-arms
 *     the loop anyway, each further identical turn is aborted immediately.
 *
 * State resets on session start and on interactive user input (a human
 * stepping in breaks the pattern by definition). Errored/aborted turns are
 * not counted. Trivially short messages (< MIN_FP_LEN) are ignored.
 *
 * No configuration, no commands; load and forget.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WARN_AT = 3; // inject warning once this many consecutive identical turns
const ABORT_AT = 5; // hard-abort the run at this streak
const MIN_FP_LEN = 12; // ignore trivially short messages ("ok", "done")

interface ContentPart {
	type?: string;
	text?: string;
	name?: string;
	arguments?: unknown;
}

function normalize(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

/** Fingerprint an assistant message; null if there's too little to judge. */
function fingerprint(message: { content?: unknown }): string | null {
	const content = message.content;
	if (!Array.isArray(content)) return null;
	const parts: string[] = [];
	for (const part of content as ContentPart[]) {
		if (part?.type === "text" && typeof part.text === "string") {
			parts.push(`t:${normalize(part.text)}`);
		} else if (part?.type === "toolCall") {
			let args = "";
			try {
				args = JSON.stringify(part.arguments ?? null);
			} catch {
				args = "?";
			}
			parts.push(`c:${part.name}:${args}`);
		}
		// thinking parts excluded: may legitimately vary between identical acts
	}
	const fp = parts.join("\n");
	return fp.length >= MIN_FP_LEN ? fp : null;
}

export default function (pi: ExtensionAPI) {
	let lastFp: string | null = null;
	let streak = 0;
	let warned = false;

	function reset(): void {
		lastFp = null;
		streak = 0;
		warned = false;
	}

	pi.on("session_start", () => reset());

	// A human typing breaks any loop pattern; extension/scheduled input does not.
	pi.on("input", (event) => {
		if (event.source === "interactive") reset();
	});

	pi.on("turn_end", (event, ctx) => {
		const msg = event.message as
			| { role?: string; stopReason?: string; content?: unknown }
			| undefined;
		if (!msg || msg.role !== "assistant") return;
		if (msg.stopReason === "error" || msg.stopReason === "aborted") return;

		const fp = fingerprint(msg);
		if (!fp) return; // too short to judge; neither match nor reset

		if (fp === lastFp) {
			streak++;
		} else {
			streak = 1;
			lastFp = fp;
			warned = false;
		}

		if (streak === WARN_AT && !warned) {
			warned = true;
			if (ctx.hasUI) {
				ctx.ui.notify(
					`Loop guard: ${streak} consecutive identical responses — injecting anti-loop warning`,
					"warning",
				);
			}
		}

		if (streak >= ABORT_AT) {
			if (!ctx.isIdle()) ctx.abort();
			if (ctx.hasUI) {
				ctx.ui.notify(
					`Loop guard: aborted run after ${streak} identical responses. Check what is re-triggering the agent (scheduled TODO cycle, follow-up queue, ...).`,
					"error",
				);
			}
		}
	});

	// Cache-safe warning: appended fresh at the tail of each LLM call while a
	// repeat streak is active. Never persisted, leaves the prefix byte-identical.
	pi.on("context", (event) => {
		if (streak < WARN_AT) return;
		const warning = {
			role: "custom" as const,
			customType: "loop-guard-warning",
			content:
				`[LOOP GUARD — AUTOMATED ANTI-REPETITION WARNING] Your last ${streak} consecutive responses were identical (same text, same tool calls). ` +
				"You are in a repetition loop, burning tokens without progress. Do NOT produce that response again. Choose exactly one: " +
				"(a) take a concrete action you have not tried yet (read the file, make the edit, run the command); " +
				"(b) if you are certain the work is already complete, prove it with a fresh tool call (re-read the file, re-run the test) instead of re-asserting it; " +
				"(c) if you are blocked, state the blocker in one sentence and stop. " +
				"Repeating the identical message again is never correct.",
			display: false,
			timestamp: Date.now(),
		};
		return { messages: [...event.messages, warning] } as {
			messages: typeof event.messages;
		};
	});
}
