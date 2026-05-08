/**
 * stream-watchdog
 *
 * Adds a per-event inactivity timeout to the Anthropic provider stream.
 *
 * Why: pi-ai's Anthropic streaming reads SSE events with a plain
 * `await reader.read()` and no inactivity timeout. If the underlying TCP
 * socket dies silently (NAT/proxy/wifi), the await blocks until the OS
 * notices the dead socket — sometimes 15+ minutes — during which the TUI
 * shows "Working..." with no way to recover except ESC.
 *
 * What this does: wrap streamSimpleAnthropic. Race each iter.next() against
 * a timeout. If no event for INACTIVITY_MS, abort the underlying request
 * and surface the failure as a retryable "Stream inactivity timeout" error
 * so pi-coding-agent's built-in auto-retry handles it.
 *
 * The error message intentionally contains "timeout", which matches
 * agent-session.js' _isRetryableError() regex (timed?.out|timeout|terminated).
 *
 * Tunables below. Real user aborts (ESC) are passed through as "aborted",
 * not rewritten — those should NOT trigger auto-retry.
 */

import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	type SimpleStreamOptions,
	streamSimpleAnthropic,
} from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Generous default: extended-thinking on opus can be silent for ~60s before the
// first event. Bumping past that avoids false positives during normal slow
// thinking. Tune if you see spurious retries.
const INACTIVITY_MS = 90_000;

// Optional: print to stderr whenever the watchdog fires, so you can confirm
// it's actually doing something instead of pi just being slow.
const LOG_WATCHDOG = true;

function makePartial(model: Model<Api>): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "error",
		timestamp: Date.now(),
	};
}

function streamAnthropicWithWatchdog(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const wrapped = createAssistantMessageEventStream();

	// Child controller wraps the user signal so we can abort independently
	// (watchdog) without making it look like a user abort.
	const childController = new AbortController();
	const userSignal = options?.signal;
	let watchdogFired = false;
	let watchdogReason = "";

	const onUserAbort = () => childController.abort();
	if (userSignal) {
		if (userSignal.aborted) childController.abort();
		else userSignal.addEventListener("abort", onUserAbort, { once: true });
	}

	const source = streamSimpleAnthropic(model, context, {
		...options,
		signal: childController.signal,
	});

	(async () => {
		const iter = source[Symbol.asyncIterator]();
		try {
			while (true) {
				let timer: ReturnType<typeof setTimeout> | undefined;
				const timeoutPromise = new Promise<never>((_, reject) => {
					timer = setTimeout(() => {
						watchdogFired = true;
						watchdogReason = `Stream inactivity timeout (no event for ${Math.round(
							INACTIVITY_MS / 1000,
						)}s)`;
						if (LOG_WATCHDOG) {
							// eslint-disable-next-line no-console
							console.error(`[stream-watchdog] ${watchdogReason}; aborting request`);
						}
						childController.abort();
						reject(new Error(watchdogReason));
					}, INACTIVITY_MS);
				});

				let result: IteratorResult<AssistantMessageEvent>;
				try {
					result = await Promise.race([iter.next(), timeoutPromise]);
				} finally {
					if (timer) clearTimeout(timer);
				}
				if (result.done) break;

				const ev = result.value;
				// When the watchdog fires it aborts the child controller. The underlying
				// streamSimpleAnthropic reacts by emitting an "error" event with
				// reason="aborted" (because childController.signal.aborted is true).
				// We rewrite that to reason="error" with our own message so the agent's
				// _isRetryableError() picks it up and auto-retry kicks in. (Pure
				// "aborted" is treated as user-initiated and is NOT retried.)
				if (watchdogFired && ev.type === "error") {
					const original = ev.error as AssistantMessage;
					const rewritten: AssistantMessage = {
						...original,
						stopReason: "error",
						errorMessage: watchdogReason,
					};
					wrapped.push({ type: "error", reason: "error", error: rewritten });
					continue;
				}
				wrapped.push(ev);
			}
			wrapped.end();
		} catch (err) {
			// We got here because Promise.race rejected. That's the watchdog's
			// timeoutPromise (or, less likely, iter.next() throwing synchronously).
			// In either case the source stream may not have pushed its own terminal
			// event yet, so synthesize one.
			const isUserAbort = userSignal?.aborted === true && !watchdogFired;
			const errorMsg = watchdogFired
				? watchdogReason
				: err instanceof Error
					? err.message
					: String(err);
			const partial = makePartial(model);
			partial.stopReason = isUserAbort ? "aborted" : "error";
			partial.errorMessage = errorMsg;
			wrapped.push({
				type: "error",
				reason: isUserAbort ? "aborted" : "error",
				error: partial,
			});
			wrapped.end();
		} finally {
			if (userSignal) userSignal.removeEventListener("abort", onUserAbort);
		}
	})();

	return wrapped;
}

export default function (pi: ExtensionAPI) {
	// Override the API-level provider for "anthropic-messages". This affects all
	// models with api: "anthropic-messages" (including built-in claude-opus-4-7,
	// claude-sonnet-4-*, etc.). Models, baseUrl, headers, and auth config are
	// untouched because we only pass `api` and `streamSimple`.
	pi.registerProvider("anthropic", {
		api: "anthropic-messages",
		streamSimple: streamAnthropicWithWatchdog,
	});
}
