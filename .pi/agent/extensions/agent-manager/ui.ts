/**
 * agent-manager — widget UI layer (bordered boxes + cost tickers).
 */
import type { AgentHandle, AgentStatus, Swarm } from "./agents.js";
import type { AgentManagerConfig } from "./config.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[90m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const MAGENTA = "\x1b[35m";

const HEADER_KEY = "agent-manager:header";
const STATUS_KEY = "agent-manager";
const MIN_WORKER_BOX_WIDTH = 20;

export interface WidgetHost {
	setWidget(key: string, content: string[] | undefined, options?: unknown): void;
	setWidget(
		key: string,
		content:
			| ((
					tui: { requestRender(force?: boolean): void },
					theme: unknown,
			  ) => { render(width: number): string[]; invalidate(): void; dispose?(): void })
			| undefined,
		options?: unknown,
	): void;
	setStatus(key: string, text: string | undefined): void;
}

export function fmtCost(cost: number): string {
	if (cost >= 10) return `$${cost.toFixed(2)}`;
	if (cost >= 0.1) return `$${cost.toFixed(3)}`;
	return `$${cost.toFixed(4)}`;
}

function glyph(status: AgentStatus): string {
	switch (status) {
		case "idle": return "○";
		case "working": return "●";
		case "done": return "✓";
		case "error": return "✗";
		case "aborted": return "⊘";
		case "timed_out": return "◷";
	}
}

/** Rough visible column width — double-width for CJK/emoji ranges. */
function visibleWidth(s: string): number {
	let w = 0;
	for (const ch of s) {
		const code = ch.codePointAt(0)!;
		if (
			code >= 0x1100 ||
			(code >= 0x2e80 && code <= 0x4dbf) ||
			(code >= 0x4e00 && code <= 0x9fff) ||
			(code >= 0xa000 && code <= 0xa4cf) ||
			(code >= 0xac00 && code <= 0xd7af) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff01 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6) ||
			(code >= 0x1f000 && code <= 0x1ffff) ||
			(code >= 0x20000 && code <= 0x2ffff) ||
			(code >= 0x30000 && code <= 0x3ffff)
		) {
			w += 2;
		} else {
			w += 1;
		}
	}
	return w;
}

/** Strip ANSI + control chars, clip to visible width with ellipsis. */
function clipPlain(s: string, width: number): string {
	// eslint-disable-next-line no-control-regex
	const clean = s.replace(/\x1b\[[0-9;]*m/g, "").replace(/[\x00-\x08\x0b-\x1f]/g, "");
	if (width <= 0) return "";
	if (visibleWidth(clean) > width) {
		let trimmed = "";
		let tw = 0;
		for (const ch of clean) {
			const cw = visibleWidth(ch);
			if (tw + cw + 1 > width) break; // +1 for ellipsis
			trimmed += ch;
			tw += cw;
		}
		return `${trimmed}…`;
	}
	return clean;
}

function topBorder(title: string, cost: string, width: number): string {
	const right = ` ${cost} ─╮`;
	let left = `╭─ ${title} `;
	const maxTitle = width - right.length - 4;
	if (left.length - 4 > maxTitle) left = `╭─ ${clipPlain(title, maxTitle)} `;
	const fill = Math.max(0, width - left.length - right.length);
	return left + "─".repeat(fill) + right;
}

function bottomBorder(width: number): string {
	return `╰${"─".repeat(Math.max(0, width - 2))}╯`;
}

function duration(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
		: `${minutes}:${String(secs).padStart(2, "0")}`;
}

function timingLabel(agent: AgentHandle, compact: boolean): string {
	if (agent.status !== "working") return "";
	const timing = agent.timing();
	if (timing.phase === "model") {
		const value = `${duration(timing.phaseElapsedSeconds)}/${duration(agent.modelResponseTimeoutSeconds)}`;
		return compact
			? ` · m ${value}`
			: ` · model ${value} · total ${duration(timing.turnElapsedSeconds)}/${duration(agent.turnTimeoutSeconds)}`;
	}
	return compact
		? ` · t ${duration(timing.phaseElapsedSeconds)}`
		: ` · tool ${duration(timing.phaseElapsedSeconds)} · total ${duration(timing.turnElapsedSeconds)}/${duration(agent.turnTimeoutSeconds)}`;
}

function workerBoxLines(worker: AgentHandle, boxWidth: number, logLines: number): string[] {
	const short = (worker.id.split(".")[1] ?? worker.id).replace(/^worker/, "w");
	const contentWidth = boxWidth - 4;
	const lines = [
		topBorder(`${short} ${glyph(worker.status)}${timingLabel(worker, true)}`, fmtCost(worker.cost), boxWidth),
	];
	const tail = worker.tail(logLines);
	for (let index = 0; index < logLines; index += 1) {
		const raw = tail[index] ?? (index === 0 && worker.status === "idle" ? "(idle)" : "");
		const text = clipPlain(raw, contentWidth);
		lines.push(`│ ${text}${" ".repeat(Math.max(0, contentWidth - visibleWidth(text)))} │`);
	}
	lines.push(bottomBorder(boxWidth));
	return lines;
}

class LeadBox {
	constructor(
		private readonly lead: AgentHandle,
		private readonly group: AgentHandle[],
		private readonly config: AgentManagerConfig,
	) {}

	invalidate(): void {}
	dispose(): void {}

	render(width: number): string[] {
		const panelWidth = Math.max(40, width);
		const innerWidth = panelWidth - 4;
		const output: string[] = [];
		const title = `${this.lead.id} · ${this.lead.status} ${glyph(this.lead.status)}${timingLabel(this.lead, false)}`;
		output.push(`${CYAN}${BOLD}${topBorder(title, fmtCost(this.lead.cost), panelWidth)}${RESET}`);

		for (const line of this.lead.tail(this.config.leadLogLines)) {
			const t = clipPlain(line, innerWidth);
			output.push(this.frame(`${DIM}${t}${RESET}`, visibleWidth(t), panelWidth));
		}

		const perRow = Math.max(
			1,
			Math.min(this.group.length, Math.floor((innerWidth + 1) / (MIN_WORKER_BOX_WIDTH + 1))),
		);
		for (let start = 0; start < this.group.length; start += perRow) {
			const chunk = this.group.slice(start, start + perRow);
			const boxWidth = Math.floor((innerWidth - (chunk.length - 1)) / chunk.length);
			const boxes = chunk.map((worker) => workerBoxLines(worker, boxWidth, this.config.workerLogLines));
			for (let row = 0; row < boxes[0].length; row += 1) {
				const joined = boxes.map((box) => box[row]).join(" ");
				// joined contains ANSI codes from the YELLOW coloring added below;
				// strip them for visible-width calculation so the padding is correct.
				const visible = joined.replace(/\x1b\[[0-9;]*m/g, "").length;
				output.push(this.frame(`${YELLOW}${joined}${RESET}`, visible, panelWidth));
			}
		}

		output.push(`${CYAN}${bottomBorder(panelWidth)}${RESET}`);
		return output;
	}

	/** Wrap content in the lead's cyan side borders. Padding uses visible width. */
	private frame(content: string, visibleLen: number, width: number): string {
		const pad = " ".repeat(Math.max(0, width - 4 - visibleLen));
		return `${CYAN}│ ${RESET}${content}${pad}${CYAN} │${RESET}`;
	}
}

export class SwarmUI {
	private dirty = true;
	private timer: ReturnType<typeof setInterval> | undefined;
	private tui: { requestRender(force?: boolean): void } | undefined;
	private lastClockSecond = -1;
	private disposed = false;

	private safeTUI = (): { requestRender(force?: boolean): void } | undefined =>
		this.disposed ? undefined : this.tui;

	constructor(
		private readonly host: WidgetHost,
		private readonly config: AgentManagerConfig,
		private readonly swarm: Swarm,
		private readonly getManagerCost: () => number,
	) {}

	markDirty = (): void => { if (!this.disposed) this.dirty = true; };

	start(): void {
		const workerTotal = this.swarm.workers.reduce((count, group) => count + group.length, 0);
		this.host.setWidget(HEADER_KEY, [
			`${MAGENTA}${BOLD}agent-manager${RESET}${MAGENTA} · ${this.config.manager.model} → ` +
				`${this.swarm.leads.length}× ${this.config.lead.model} → ${workerTotal}× ${this.config.worker.model}` +
				` · /agent-manager-kill to stop${RESET}`,
		]);
		this.swarm.leads.forEach((lead, index) => {
			this.host.setWidget(`agent-manager:${lead.id}`, (tui) => {
				if (!this.disposed) this.tui = tui;
				return new LeadBox(lead, this.swarm.workers[index], this.config);
			});
		});
		this.updateStatus();
		this.timer = setInterval(() => {
			if (this.disposed) return;
			const agents = [...this.swarm.leads, ...this.swarm.workers.flat()];
			const clockSecond = Math.floor(Date.now() / 1000);
			if (agents.some((agent) => agent.status === "working") && clockSecond !== this.lastClockSecond) {
				this.lastClockSecond = clockSecond;
				this.dirty = true;
			}
			if (!this.dirty) return;
			this.dirty = false;
			this.updateStatus();
			this.safeTUI()?.requestRender();
		}, 500);
	}

	stop(): void {
		this.disposed = true;
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
		this.tui = undefined;
		this.host.setWidget(HEADER_KEY, undefined);
		for (const lead of this.swarm.leads) {
			this.host.setWidget(`agent-manager:${lead.id}`, undefined);
		}
		this.host.setStatus(STATUS_KEY, undefined);
	}

	private updateStatus(): void {
		const childCost = [...this.swarm.leads, ...this.swarm.workers.flat()].reduce(
			(total, agent) => total + agent.cost, 0,
		);
		const managerCost = this.getManagerCost();
		this.host.setStatus(
			STATUS_KEY,
			`agent-manager · total ${fmtCost(managerCost + childCost)} (mgr ${fmtCost(managerCost)} + agents ${fmtCost(childCost)})`,
		);
	}
}
