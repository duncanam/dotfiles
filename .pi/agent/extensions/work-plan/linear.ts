/**
 * Linear integration via the official remote MCP server.
 *
 * We avoid Linear's GraphQL personal-API-key requirement (which is
 * gated to workspace admins in many orgs) by going through Linear's
 * OAuth-based MCP server at https://mcp.linear.app/sse. The OAuth
 * dance, token caching, and SSE↔stdio bridging are delegated to
 * `mcp-remote` (run via `npx -y mcp-remote@latest <url>`).
 *
 * First `/wp-upload` opens a browser for OAuth; tokens get cached in
 * `~/.mcp-auth/`, so subsequent uploads are non-interactive.
 *
 * Public API matches the previous GraphQL implementation so
 * `index.ts` doesn't need to know how the sausage is made.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { McpClient, McpError, type McpToolDef, type McpToolResult } from "./mcp-client.js";
import { PRIORITY_NAMES, type PlanMeta } from "./template.js";

export interface CreatedTicket {
	id: string;
	identifier: string;
	title: string;
	url: string;
	priority: number;
	priorityLabel: string;
	stateName: string;
	assigneeName: string | null;
	projectName: string | null;
	teamKey: string;
	teamName: string;
	labelNames: string[];
	/** Markdown body. Populated by `getIssue`; usually undefined for tickets that came back from `save_issue`. */
	description?: string;
}

export class LinearError extends Error {
	constructor(message: string, public readonly cause?: unknown) {
		super(message);
		this.name = "LinearError";
	}
}

const DEFAULT_MCP_URL = "https://mcp.linear.app/sse";
const STDERR_LOG = join(homedir(), ".pi", "agent", "work-plans", "mcp.log");

let cachedClient: McpClient | null = null;
let cachedTools: McpToolDef[] | null = null;

/**
 * stderr lines that look like errors but are actually `mcp-remote`'s normal
 * recovery chatter. The Linear SSE pipe gets killed by undici's body
 * timeout (~5 minutes idle) and `mcp-remote` immediately reconnects on
 * its own — we just need to (a) not surface them to the user as if the
 * upload failed, and (b) drop our cached client so the next call rebuilds
 * cleanly instead of writing into a half-dead stdio pipe.
 */
const RECOVERABLE_STDERR = [
	/Body Timeout Error/i,
	/SseError/i,
	/Error from remote server/i,
	/Recursively reconnecting/i,
	/falling-back-to-alternate-transport/i,
	/Streamable HTTP error/i,
];

function looksRecoverable(line: string): boolean {
	return RECOVERABLE_STDERR.some((re) => re.test(line));
}

function looksLikeTransportError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const m = err.message;
	return (
		/timed out/i.test(m) ||
		/not running/i.test(m) ||
		/exited/i.test(m) ||
		/EPIPE|ECONN|ENOTFOUND|ETIMEDOUT/i.test(m) ||
		/SseError|Body Timeout/i.test(m)
	);
}

export interface ConnectOptions {
	onStatus?: (msg: string) => void;
}

/**
 * Lazy-start the MCP client. Re-uses the connection across calls within
 * the same pi session.
 */
export async function getLinearClient(opts: ConnectOptions = {}): Promise<McpClient> {
	if (cachedClient) return cachedClient;

	const url = process.env.LINEAR_MCP_URL || DEFAULT_MCP_URL;
	opts.onStatus?.(`Connecting to Linear MCP (${url})…`);

	let startedClient: McpClient | null = null;
	const client = new McpClient({
		command: "npx",
		args: ["-y", "mcp-remote@latest", url],
		stderrLogPath: STDERR_LOG,
		onStderr: (line) => {
			// Surface OAuth URLs (the user must click through these on first run).
			if (/https?:\/\/\S+/.test(line) && /(oauth|authorize|callback|browser)/i.test(line)) {
				opts.onStatus?.(`Linear OAuth: ${line.trim()}`);
				return;
			}
			// Auto-recoverable: log silently and invalidate the cache so the
			// next call rebuilds (rather than writing into a stdio pipe whose
			// upstream SSE just died).
			if (looksRecoverable(line)) {
				if (cachedClient && cachedClient === startedClient) {
					const staleClient = cachedClient;
					cachedClient = null;
					cachedTools = null;
					staleClient.close();
				}
				return;
			}
			// Anything else that looks like a real failure we still surface.
			if (/error|fail|denied/i.test(line)) {
				opts.onStatus?.(`mcp-remote: ${line.trim()}`);
			}
		},
		initializeTimeoutMs: 5 * 60_000, // first run does OAuth in a browser
		requestTimeoutMs: 60_000,
	});
	startedClient = client;

	try {
		await client.start();
	} catch (err) {
		client.close();
		throw new LinearError(
			`Could not connect to Linear MCP. See ${STDERR_LOG} for details. (${(err as Error).message})`,
			err,
		);
	}

	cachedClient = client;
	return client;
}

/**
 * Run `fn`, and if it fails with what looks like a transport error
 * (timeout, broken pipe, child exited, SSE blip), tear down the cached
 * client and try once more. Most often this catches the case where the
 * user runs `/wp-upload` while `mcp-remote` is mid-reconnect after Linear's
 * SSE pipe got body-timed-out by undici.
 */
async function withReconnect<T>(opts: ConnectOptions, fn: () => Promise<T>): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (!looksLikeTransportError(err)) throw err;
		opts.onStatus?.("Linear MCP transport hiccup — reconnecting and retrying…");
		disconnectLinearClient();
		return await fn();
	}
}

export function disconnectLinearClient(): void {
	if (cachedClient) {
		cachedClient.close();
		cachedClient = null;
		cachedTools = null;
	}
}

async function getTools(client: McpClient): Promise<McpToolDef[]> {
	if (cachedTools) return cachedTools;
	cachedTools = await client.listTools();
	return cachedTools;
}

/**
 * Find a tool whose name matches any of the given candidates (first
 * match wins). Throws if none of them are present so the user gets a
 * useful error instead of a silent miss.
 */
function findTool(tools: McpToolDef[], candidates: string[]): McpToolDef {
	for (const c of candidates) {
		const t = tools.find((tool) => tool.name === c);
		if (t) return t;
	}
	const known = tools.map((t) => t.name).join(", ");
	throw new LinearError(
		`Linear MCP server doesn't expose any of [${candidates.join(", ")}]. Available tools: ${known}`,
	);
}

/**
 * MCP results come back as `content[]`. Linear's tools usually put a
 * JSON blob in `content[0].text` and/or in `structuredContent`. We try
 * both.
 */
function parseToolResult(result: McpToolResult): unknown {
	if (result.isError) {
		const txt = result.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n");
		throw new LinearError(`Linear MCP tool error: ${txt || "(no message)"}`);
	}
	if (result.structuredContent !== undefined) return result.structuredContent;
	const text = result.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		// Some tools return a human-readable string. Pass it through so
		// callers can inspect.
		return text;
	}
}

/**
 * Map Linear MCP's flat issue payload to our CreatedTicket shape.
 *
 * Linear's MCP returns denormalized data:
 *   {
 *     id: "PLAT-522",                    // human identifier, NOT a UUID
 *     title, description, url,
 *     priority: { value: 4, name: "Low" },
 *     status: "Backlog", statusType: "backlog",
 *     labels: ["Feature", "Bug"],          // strings, not objects
 *     assignee: "Duncan McGough",
 *     project: "Savage - …",
 *     team: "Platform",                    // team NAME, not key
 *     teamId, projectId, assigneeId
 *   }
 *
 * The team key (e.g., "PLAT") is parsed from the identifier prefix.
 * We also keep nested-shape fallbacks in case Linear ever changes
 * the response.
 */
function extractTicket(raw: unknown): CreatedTicket {
	const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
	// Some MCP servers wrap the issue. Handle both wrapped and bare.
	const issue = (r.issue ??
		(r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>).issue : undefined) ??
		r) as Record<string, unknown>;

	const id = String(issue.id ?? issue.identifier ?? "");
	const identifier = String(issue.identifier ?? (id.includes("-") ? id : ""));
	const displayIdentifier = identifier || id || "?";
	const teamKey = displayIdentifier.includes("-") ? displayIdentifier.split("-")[0] : "";

	// priority: object {value,name} OR plain number OR missing
	let priority = 0;
	let priorityLabel = PRIORITY_NAMES[0];
	const pRaw = issue.priority;
	if (typeof pRaw === "number") {
		priority = pRaw;
		priorityLabel = PRIORITY_NAMES[pRaw] ?? PRIORITY_NAMES[0];
	} else if (pRaw && typeof pRaw === "object") {
		const p = pRaw as { value?: number; name?: string };
		priority = typeof p.value === "number" ? p.value : 0;
		priorityLabel = p.name ?? PRIORITY_NAMES[priority] ?? PRIORITY_NAMES[0];
	}
	if (typeof issue.priorityLabel === "string" && issue.priorityLabel) {
		priorityLabel = issue.priorityLabel as string;
	}

	// state: flat "status" string OR nested { name }
	const stateName =
		typeof issue.status === "string"
			? (issue.status as string)
			: typeof issue.state === "string"
				? (issue.state as string)
				: ((issue.state as { name?: string } | undefined)?.name ?? "—");

	const stringOrNested = (val: unknown): string | null => {
		if (val === null || val === undefined) return null;
		if (typeof val === "string") return val || null;
		if (typeof val === "object") {
			const o = val as { name?: string; displayName?: string };
			return (o.name ?? o.displayName ?? null) || null;
		}
		return null;
	};

	// labels: string[] OR { nodes: [{name}] } OR [{name}]
	let labelNames: string[] = [];
	const lRaw = issue.labels;
	if (Array.isArray(lRaw)) {
		labelNames = (lRaw as Array<unknown>)
			.map((l) => (typeof l === "string" ? l : ((l as { name?: string } | null)?.name ?? "")))
			.filter(Boolean);
	} else if (lRaw && typeof lRaw === "object" && Array.isArray((lRaw as { nodes?: unknown[] }).nodes)) {
		labelNames = ((lRaw as { nodes: Array<{ name?: string }> }).nodes ?? [])
			.map((n) => n.name ?? "")
			.filter(Boolean);
	}

	const teamName = stringOrNested(issue.team) ?? "";

	return {
		id: id || displayIdentifier,
		identifier: displayIdentifier,
		title: String(issue.title ?? ""),
		url: String(issue.url ?? ""),
		priority,
		priorityLabel,
		stateName,
		assigneeName: stringOrNested(issue.assignee),
		projectName: stringOrNested(issue.project),
		teamKey: teamKey || (typeof issue.team === "object" ? String((issue.team as { key?: string }).key ?? "") : ""),
		teamName,
		labelNames,
		description: typeof issue.description === "string" ? (issue.description as string) : undefined,
	};
}

/**
 * High-level: take parsed plan metadata + body, call the MCP
 * `save_issue` tool, and return a normalized ticket.
 */
export async function uploadPlan(
	meta: PlanMeta,
	body: string,
	opts: ConnectOptions = {},
): Promise<CreatedTicket> {
	if (!meta.title) throw new LinearError("Plan is missing a title.");
	if (!meta.team) throw new LinearError("Plan is missing a team.");

	return withReconnect(opts, () => uploadPlanOnce(meta, body, opts));
}

async function uploadPlanOnce(meta: PlanMeta, body: string, opts: ConnectOptions): Promise<CreatedTicket> {
	const client = await getLinearClient(opts);
	const tools = await getTools(client);
	// Linear's MCP names this `save_issue` (it's an upsert: pass `id` to
	// update, omit it to create). The other names are speculative fallbacks.
	const tool = findTool(tools, ["save_issue", "create_issue", "linear_create_issue", "createIssue"]);

	// Build the tool args. The Linear MCP server resolves names and keys
	// internally, so we pass through whatever the user wrote in
	// frontmatter without re-implementing the lookup chain we used to
	// have for the GraphQL flow.
	const args: Record<string, unknown> = {
		team: meta.team,
		title: meta.title,
		description: body.trim(),
	};
	if (meta.project) args.project = meta.project;
	if (meta.assignee !== undefined) args.assignee = meta.assignee; // null = unassigned
	if (meta.priority !== undefined) args.priority = meta.priority;
	if (meta.labels && meta.labels.length > 0) args.labels = meta.labels;
	if (meta.state) args.state = meta.state;

	opts.onStatus?.(`Calling Linear MCP tool '${tool.name}'…`);
	let result: McpToolResult;
	try {
		result = await client.callTool(tool.name, args);
	} catch (err) {
		if (err instanceof McpError) {
			throw new LinearError(
				`Linear MCP '${tool.name}' failed: ${err.message}\n` +
					`Tool input schema: ${JSON.stringify(tool.inputSchema ?? {}, null, 2)}\n` +
					`We sent: ${JSON.stringify(args, null, 2)}`,
				err,
			);
		}
		throw err;
	}

	return extractTicket(parseToolResult(result));
}

/**
 * Diagnostic: list the tools the connected Linear MCP exposes.
 * Useful from `/wp-mcp-tools` for debugging schema mismatches.
 */
export async function describeTools(opts: ConnectOptions = {}): Promise<McpToolDef[]> {
	return withReconnect(opts, async () => {
		const client = await getLinearClient(opts);
		return getTools(client);
	});
}

/**
 * Fetch a Linear issue by identifier (e.g. "PLAT-456"). Returns the
 * same shape as a freshly-created ticket, plus the issue's markdown
 * description in `.description`.
 */
export async function getIssue(idOrIdentifier: string, opts: ConnectOptions = {}): Promise<CreatedTicket> {
	return withReconnect(opts, () => getIssueOnce(idOrIdentifier, opts));
}

async function getIssueOnce(idOrIdentifier: string, opts: ConnectOptions): Promise<CreatedTicket> {
	const client = await getLinearClient(opts);
	const tools = await getTools(client);
	const tool = findTool(tools, ["get_issue", "linear_get_issue", "getIssue"]);
	opts.onStatus?.(`Fetching ${idOrIdentifier}…`);
	let result: McpToolResult;
	try {
		result = await client.callTool(tool.name, { id: idOrIdentifier });
	} catch (err) {
		if (err instanceof McpError) {
			throw new LinearError(`Linear MCP '${tool.name}' failed: ${err.message}`, err);
		}
		throw err;
	}
	return extractTicket(parseToolResult(result));
}
