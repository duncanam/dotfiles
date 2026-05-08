/**
 * Context7 Extension
 *
 * Lets the agent search up-to-date library documentation via the public
 * Context7 API (https://context7.com). Mirrors the two tools exposed by the
 * Context7 MCP server, but talks to the HTTP API directly so we don't need
 * to spawn or manage an MCP process.
 *
 * Auth: reads CONTEXT7_API_KEY from the environment. Requests still work
 * unauthenticated, but rate limits are higher with a key.
 *
 * Tools:
 *   - context7_resolve_library_id: search for a Context7 library ID by name
 *   - context7_get_library_docs:   fetch docs for a Context7 library ID
 *
 * Command:
 *   - /context7 <query>            convenience search from the editor
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const API_BASE = "https://context7.com/api/v1";
const DEFAULT_TOKENS = 5000;
const MIN_TOKENS = 500;
const MAX_TOKENS = 50000;

// How many lines of result text to show in the TUI by default. The LLM still
// receives the full content; this only affects what is drawn on screen.
const PREVIEW_LINES = 10;

function buildPreview(
	text: string,
	expanded: boolean,
	theme: { fg: (color: string, s: string) => string },
	label = "lines",
): string {
	const lines = text.split("\n");
	if (expanded || lines.length <= PREVIEW_LINES) return text;
	const head = lines.slice(0, PREVIEW_LINES).join("\n");
	const remaining = lines.length - PREVIEW_LINES;
	const hint = keyHint("app.tools.expand", "to expand");
	return `${head}\n${theme.fg("muted", `… ${remaining} more ${label} (${hint})`)}`;
}

interface SearchResult {
	id?: string;
	libraryId?: string;
	title?: string;
	name?: string;
	description?: string;
	branch?: string;
	totalTokens?: number;
	totalSnippets?: number;
	trustScore?: number;
	stars?: number;
	versions?: string[];
}

interface SearchResponse {
	results?: SearchResult[];
	error?: string;
}

function authHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"X-Context7-Source": "pi-coding-agent-extension",
	};
	const key = process.env.CONTEXT7_API_KEY;
	if (key && key.trim()) {
		headers.Authorization = `Bearer ${key.trim()}`;
	}
	return headers;
}

function normalizeLibraryId(raw: string): string {
	const trimmed = raw.trim();
	// Allow users / LLMs to pass either "/vercel/next.js" or "vercel/next.js".
	if (trimmed.startsWith("/")) return trimmed.slice(1);
	return trimmed;
}

async function searchLibraries(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
	const url = `${API_BASE}/search?query=${encodeURIComponent(query)}`;
	const res = await fetch(url, { headers: authHeaders(), signal });
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Context7 search failed: HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
	}
	const data = (await res.json()) as SearchResponse;
	if (data.error) throw new Error(`Context7 search error: ${data.error}`);
	return data.results ?? [];
}

async function fetchDocs(
	libraryId: string,
	topic: string | undefined,
	tokens: number,
	signal?: AbortSignal,
): Promise<string> {
	const id = normalizeLibraryId(libraryId);
	const params = new URLSearchParams({ type: "txt", tokens: String(tokens) });
	if (topic && topic.trim()) params.set("topic", topic.trim());
	const url = `${API_BASE}/${id}?${params.toString()}`;
	const res = await fetch(url, { headers: authHeaders(), signal });
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Context7 docs fetch failed for "${id}": HTTP ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
	}
	return await res.text();
}

function formatSearchResults(results: SearchResult[], query: string): string {
	if (results.length === 0) {
		return `No Context7 libraries matched "${query}". Try a different name or include the org/owner (e.g. "vercel next.js").`;
	}
	const lines: string[] = [`Found ${results.length} Context7 librar${results.length === 1 ? "y" : "ies"} for "${query}":`, ""];
	for (const r of results.slice(0, 20)) {
		const id = r.id ?? r.libraryId ?? "(unknown)";
		const title = r.title ?? r.name ?? id;
		lines.push(`- ${title}`);
		lines.push(`  id: ${id}`);
		if (r.description) lines.push(`  description: ${r.description}`);
		const meta: string[] = [];
		if (typeof r.trustScore === "number") meta.push(`trust=${r.trustScore}`);
		if (typeof r.stars === "number") meta.push(`stars=${r.stars}`);
		if (typeof r.totalSnippets === "number") meta.push(`snippets=${r.totalSnippets}`);
		if (typeof r.totalTokens === "number") meta.push(`tokens=${r.totalTokens}`);
		if (r.branch) meta.push(`branch=${r.branch}`);
		if (meta.length) lines.push(`  ${meta.join(" • ")}`);
		if (r.versions?.length) lines.push(`  versions: ${r.versions.slice(0, 8).join(", ")}${r.versions.length > 8 ? ", …" : ""}`);
		lines.push("");
	}
	lines.push("Pass one of the `id` values to context7_get_library_docs to fetch documentation.");
	return lines.join("\n");
}

export default function context7Extension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "context7_resolve_library_id",
		label: "Context7: Resolve Library",
		description:
			"Search Context7 for a library by name and return its Context7-compatible library ID (e.g. '/vercel/next.js'). Use this before context7_get_library_docs unless the user already gave you an explicit Context7 ID.",
		promptSnippet:
			"Search Context7 for a library by name and return its Context7-compatible library ID for use with context7_get_library_docs",
		promptGuidelines: [
			"Use context7_resolve_library_id to translate a human library name (e.g. 'next.js', 'react router', 'pydantic') into a Context7 library ID before calling context7_get_library_docs.",
			"Skip context7_resolve_library_id only when the user has already given you a Context7-style ID such as '/vercel/next.js' or 'vercel/next.js/v14.3.0'.",
		],
		parameters: Type.Object({
			libraryName: Type.String({
				description: "Library name to search for, e.g. 'next.js', 'react router', 'pydantic'",
			}),
		}),
		async execute(_toolCallId, params, signal) {
			const query = params.libraryName?.trim();
			if (!query) {
				return {
					content: [{ type: "text", text: "libraryName is required" }],
					details: {},
					isError: true,
				};
			}
			const results = await searchLibraries(query, signal);
			return {
				content: [{ type: "text", text: formatSearchResults(results, query) }],
				details: { query, count: results.length, results },
			};
		},

		renderResult(result, { expanded, isPartial }, theme, _context) {
			if (isPartial) return new Text(theme.fg("warning", "Searching Context7…"), 0, 0);
			const content = result.content[0];
			if (!content || content.type !== "text") return new Text("", 0, 0);
			return new Text(buildPreview(content.text, expanded, theme, "lines"), 0, 0);
		},
	});

	pi.registerTool({
		name: "context7_get_library_docs",
		label: "Context7: Get Docs",
		description:
			"Fetch up-to-date documentation for a library from Context7. Requires a Context7-compatible library ID (resolve via context7_resolve_library_id first if you don't have one). Optionally narrow by topic and control how much text you get back via tokens.",
		promptSnippet:
			"Fetch up-to-date library documentation from Context7 for a given Context7 library ID (optionally filtered by topic)",
		promptGuidelines: [
			"Use context7_get_library_docs whenever you need authoritative, current API or usage docs for a library — prefer it over guessing from training data.",
			"Pass a focused `topic` (e.g. 'routing', 'hooks', 'authentication') to context7_get_library_docs when the user's question is scoped; this returns far more relevant snippets.",
			"Increase `tokens` for context7_get_library_docs only when initial results are insufficient; default 5000 is usually enough.",
		],
		parameters: Type.Object({
			context7CompatibleLibraryID: Type.String({
				description:
					"Exact Context7 library ID, e.g. '/vercel/next.js', 'vercel/next.js', or '/vercel/next.js/v14.3.0'",
			}),
			topic: Type.Optional(
				Type.String({
					description:
						"Optional topic to focus the docs on (e.g. 'routing', 'hooks', 'authentication')",
				}),
			),
			tokens: Type.Optional(
				Type.Integer({
					description: `Approximate max tokens of documentation to return (default ${DEFAULT_TOKENS}, min ${MIN_TOKENS}, max ${MAX_TOKENS})`,
					minimum: MIN_TOKENS,
					maximum: MAX_TOKENS,
				}),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const id = params.context7CompatibleLibraryID?.trim();
			if (!id) {
				return {
					content: [{ type: "text", text: "context7CompatibleLibraryID is required" }],
					details: {},
					isError: true,
				};
			}
			const tokens = Math.min(MAX_TOKENS, Math.max(MIN_TOKENS, params.tokens ?? DEFAULT_TOKENS));
			const text = await fetchDocs(id, params.topic, tokens, signal);
			if (!text || !text.trim()) {
				return {
					content: [
						{
							type: "text",
							text: `Context7 returned no documentation for "${id}"${params.topic ? ` (topic: ${params.topic})` : ""}. Try a different library ID, drop the topic filter, or call context7_resolve_library_id again.`,
						},
					],
					details: { libraryId: id, topic: params.topic, tokens, empty: true },
				};
			}
			return {
				content: [{ type: "text", text }],
				details: {
					libraryId: id,
					topic: params.topic,
					tokens,
					bytes: text.length,
				},
			};
		},

		renderResult(result, { expanded, isPartial }, theme, _context) {
			if (isPartial) return new Text(theme.fg("warning", "Fetching docs from Context7…"), 0, 0);
			const content = result.content[0];
			if (!content || content.type !== "text") return new Text("", 0, 0);
			const details = result.details as { libraryId?: string; topic?: string; tokens?: number; bytes?: number } | undefined;
			let body = buildPreview(content.text, expanded, theme, "lines");
			if (expanded && details) {
				const meta: string[] = [];
				if (details.libraryId) meta.push(details.libraryId);
				if (details.topic) meta.push(`topic: ${details.topic}`);
				if (typeof details.bytes === "number") meta.push(`${details.bytes.toLocaleString()} bytes`);
				if (meta.length) body = `${theme.fg("dim", meta.join(" • "))}\n${body}`;
			}
			return new Text(body, 0, 0);
		},
	});

	pi.registerCommand("context7", {
		description: "Search Context7 for a library: /context7 <library name>",
		handler: async (args, ctx) => {
			const query = args.trim();
			if (!query) {
				ctx.ui.notify("Usage: /context7 <library name>", "warning");
				return;
			}
			ctx.ui.setStatus("context7", `searching: ${query}`);
			try {
				const results = await searchLibraries(query, ctx.signal);
				ctx.ui.setStatus("context7", "");
				if (results.length === 0) {
					ctx.ui.notify(`No Context7 libraries matched "${query}"`, "warning");
					return;
				}
				const choice = await ctx.ui.select(
					`Context7 results for "${query}"`,
					results.slice(0, 20).map((r) => {
						const id = r.id ?? r.libraryId ?? "(unknown)";
						const title = r.title ?? r.name ?? id;
						const trust = typeof r.trustScore === "number" ? ` ★${r.trustScore}` : "";
						return `${title}${trust}  —  ${id}`;
					}),
				);
				if (!choice) return;
				const idx = results
					.slice(0, 20)
					.findIndex((r) => choice.endsWith(r.id ?? r.libraryId ?? ""));
				const picked = idx >= 0 ? results[idx] : undefined;
				const libraryId = picked?.id ?? picked?.libraryId;
				if (!libraryId) {
					ctx.ui.notify("Could not parse selection", "error");
					return;
				}
				const topic = await ctx.ui.input(
					"Optional topic filter (blank for full docs)",
					"",
				);
				pi.sendUserMessage(
					`Use the context7_get_library_docs tool to fetch documentation for \`${libraryId}\`${topic?.trim() ? ` on topic "${topic.trim()}"` : ""}, then summarize the most relevant parts for me.`,
				);
			} catch (err) {
				ctx.ui.setStatus("context7", "");
				const msg = err instanceof Error ? err.message : String(err);
				ctx.ui.notify(`Context7 search failed: ${msg}`, "error");
			}
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (!process.env.CONTEXT7_API_KEY) {
			ctx.ui.notify(
				"Context7 extension loaded without CONTEXT7_API_KEY — requests will be rate-limited.",
				"warning",
			);
		}
	});
}
