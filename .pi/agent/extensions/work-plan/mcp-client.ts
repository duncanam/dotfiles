/**
 * Minimal stdio MCP (Model Context Protocol) client.
 *
 * Speaks JSON-RPC 2.0 over a child process's stdin/stdout using the
 * MCP stdio framing (one JSON message per line). Supports just the
 * three operations we need:
 *
 *   - initialize        (handshake)
 *   - tools/list        (discovery)
 *   - tools/call        (invocation)
 *
 * Inbound server-initiated requests (sampling, roots, etc.) get a
 * polite `method not found` reply so the connection stays alive.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { appendFileSync } from "node:fs";

export interface McpToolDef {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

export interface McpToolResult {
	content: Array<
		| { type: "text"; text: string }
		| { type: "image"; data: string; mimeType?: string }
		| { type: string; [k: string]: unknown }
	>;
	structuredContent?: unknown;
	isError?: boolean;
}

export class McpError extends Error {
	constructor(message: string, public readonly code?: number, public readonly data?: unknown) {
		super(message);
		this.name = "McpError";
	}
}

interface PendingCall {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
	timer?: NodeJS.Timeout;
}

export interface McpClientOptions {
	command: string;
	args: string[];
	env?: Record<string, string>;
	/** Where to tee stderr. If omitted, stderr is discarded. */
	stderrLogPath?: string;
	/** ms to wait for `initialize`. Default 120000 (room for first-time OAuth). */
	initializeTimeoutMs?: number;
	/** ms to wait for any subsequent request. Default 60000. */
	requestTimeoutMs?: number;
	/** Called once for each line of subprocess stderr. Useful for surfacing OAuth URLs. */
	onStderr?: (line: string) => void;
}

export class McpClient {
	private child: ChildProcessWithoutNullStreams | null = null;
	private nextId = 1;
	private pending = new Map<number, PendingCall>();
	private buffer = "";
	private closed = false;
	private initializeTimeoutMs: number;
	private requestTimeoutMs: number;

	constructor(private readonly opts: McpClientOptions) {
		this.initializeTimeoutMs = opts.initializeTimeoutMs ?? 120_000;
		this.requestTimeoutMs = opts.requestTimeoutMs ?? 60_000;
	}

	async start(): Promise<{ serverInfo: { name: string; version: string }; protocolVersion: string }> {
		if (this.child) throw new McpError("McpClient already started");

		this.child = spawn(this.opts.command, this.opts.args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, ...(this.opts.env ?? {}) },
		});

		this.child.on("error", (err) => this.failAll(err));
		this.child.on("exit", (code, signal) => {
			this.closed = true;
			const reason = `mcp-remote exited (code=${code ?? "null"} signal=${signal ?? "null"})`;
			this.failAll(new McpError(reason));
		});

		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => this.onStdout(chunk));

		this.child.stderr.setEncoding("utf8");
		this.child.stderr.on("data", (chunk: string) => {
			const lines = chunk.split(/\r?\n/).filter((l) => l.length > 0);
			for (const line of lines) {
				if (this.opts.stderrLogPath) {
					try {
						appendFileSync(this.opts.stderrLogPath, `[${new Date().toISOString()}] ${line}\n`);
					} catch {
						// ignore log failures
					}
				}
				this.opts.onStderr?.(line);
			}
		});

		const result = (await this.request(
			"initialize",
			{
				protocolVersion: "2025-06-18",
				capabilities: {},
				clientInfo: { name: "pi-work-plan", version: "0.1.0" },
			},
			this.initializeTimeoutMs,
		)) as { serverInfo: { name: string; version: string }; protocolVersion: string };

		this.notify("notifications/initialized", {});
		return result;
	}

	async listTools(): Promise<McpToolDef[]> {
		const res = (await this.request("tools/list", {})) as { tools: McpToolDef[] };
		return res.tools ?? [];
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
		const res = (await this.request("tools/call", { name, arguments: args })) as McpToolResult;
		return res;
	}

	close(): void {
		if (!this.child || this.closed) return;
		this.closed = true;
		try {
			this.child.stdin.end();
		} catch {
			// ignore
		}
		try {
			this.child.kill("SIGTERM");
		} catch {
			// ignore
		}
		this.failAll(new McpError("McpClient closed"));
	}

	// ─── internals ────────────────────────────────────────────────────────────

	private request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
		if (!this.child || this.closed) {
			return Promise.reject(new McpError("MCP client is not running"));
		}
		const id = this.nextId++;
		const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
		return new Promise((resolve, reject) => {
			const t = setTimeout(() => {
				this.pending.delete(id);
				reject(new McpError(`MCP request '${method}' timed out after ${timeoutMs ?? this.requestTimeoutMs}ms`));
			}, timeoutMs ?? this.requestTimeoutMs);
			this.pending.set(id, { resolve, reject, timer: t });
			try {
				this.child!.stdin.write(payload + "\n");
			} catch (err) {
				clearTimeout(t);
				this.pending.delete(id);
				reject(err as Error);
			}
		});
	}

	private notify(method: string, params: unknown): void {
		if (!this.child || this.closed) return;
		const payload = JSON.stringify({ jsonrpc: "2.0", method, params });
		try {
			this.child.stdin.write(payload + "\n");
		} catch {
			// ignore
		}
	}

	private onStdout(chunk: string): void {
		this.buffer += chunk;
		let nl: number;
		while ((nl = this.buffer.indexOf("\n")) !== -1) {
			const line = this.buffer.slice(0, nl).trim();
			this.buffer = this.buffer.slice(nl + 1);
			if (!line) continue;
			this.handleLine(line);
		}
	}

	private handleLine(line: string): void {
		let msg: {
			jsonrpc?: string;
			id?: number | string | null;
			method?: string;
			params?: unknown;
			result?: unknown;
			error?: { code: number; message: string; data?: unknown };
		};
		try {
			msg = JSON.parse(line);
		} catch {
			return; // not JSON-RPC; ignore (some bridges chatter on stdout)
		}
		// Response to one of our requests
		if ((msg.result !== undefined || msg.error) && typeof msg.id === "number") {
			const pending = this.pending.get(msg.id);
			if (!pending) return;
			this.pending.delete(msg.id);
			if (pending.timer) clearTimeout(pending.timer);
			if (msg.error) {
				pending.reject(new McpError(msg.error.message, msg.error.code, msg.error.data));
			} else {
				pending.resolve(msg.result);
			}
			return;
		}
		// Server-initiated request → reply method-not-found
		if (msg.method && msg.id !== undefined && msg.id !== null) {
			const reply = JSON.stringify({
				jsonrpc: "2.0",
				id: msg.id,
				error: { code: -32601, message: `Method not found: ${msg.method}` },
			});
			try {
				this.child?.stdin.write(reply + "\n");
			} catch {
				// ignore
			}
			return;
		}
		// Notification from server → ignore
	}

	private failAll(err: Error): void {
		for (const [id, p] of this.pending) {
			if (p.timer) clearTimeout(p.timer);
			p.reject(err);
			this.pending.delete(id);
		}
	}
}
