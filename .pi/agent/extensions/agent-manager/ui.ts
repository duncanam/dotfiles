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

function clipPlain(value: string, width: number): string {
	// eslint-disable-next-line no-control-regex
	const clean = value.replace(/\x1b\[[0-9;]*m/g, "").replace(/[\x00-\x08\x0b-\x1f]/g, "");
	if (width <= 0) return "";
	return clean.length > width ? `${clean.slice(0, Math.max(0, width - 1))}…` : clean;
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
		lines.push(`│ ${text}${" ".repeat(Math.max(0, contentWidth - text.length))} │`);
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
			const text = clipPlain(line, innerWidth);
			output.push(this.frame(`${DIM}${text}${RESET}`, text.length, panelWidth));
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
				output.push(this.frame(`${YELLOW}${joined}${RESET}`, joined.length, panelWidth));
			}
		}

		output.push(`${CYAN}${bottomBorder(panelWidth)}${RESET}`);
		return output;
	}

	private frame(content: string, length: number, width: number): string {
		const padding = " ".repeat(Math.max(0, width - 4 - length));
		return `${CYAN}│ ${RESET}${content}${padding}${CYAN} │${RESET}`;
	}
}

export class SwarmUI {
	private dirty = true;
	private timer: ReturnType<typeof setInterval> | undefined;
	private tui: { requestRender(force?: boolean): void } | undefined;
	private lastClockSecond = -1;

	constructor(
		private readonly host: WidgetHost,
		private readonly config: AgentManagerConfig,
		private readonly swarm: Swarm,
		private readonly getManagerCost: () => number,
	) {}

	markDirty = (): void => { this.dirty = true; };

	start(): void {
		const workerTotal = this.swarm.workers.reduce((count, group) => count + group.length, 0);
		this.host.setWidget(HEADER_KEY, [
			`${MAGENTA}${BOLD}agent-manager${RESET}${MAGENTA} · ${this.config.manager.model} → ` +
				`${this.swarm.leads.length}× ${this.config.lead.model} → ${workerTotal}× ${this.config.worker.model}` +
				` · /agent-manager-kill to stop${RESET}`,
		]);
		this.swarm.leads.forEach((lead, index) => {
			this.host.setWidget(`agent-manager:${lead.id}`, (tui) => {
				this.tui = tui;
				return new LeadBox(lead, this.swarm.workers[index], this.config);
			});
		});
		this.updateStatus();
		this.timer = setInterval(() => {
			const agents = [...this.swarm.leads, ...this.swarm.workers.flat()];
			const clockSecond = Math.floor(Date.now() / 1000);
			if (agents.some((agent) => agent.status === "working") && clockSecond !== this.lastClockSecond) {
				this.lastClockSecond = clockSecond;
				this.dirty = true;
			}
			if (!this.dirty) return;
			this.dirty = false;
			this.updateStatus();
			this.tui?.requestRender();
		}, 500);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
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
