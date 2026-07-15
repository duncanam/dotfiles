/**
 * Persistent configuration for the standalone agent-manager extension.
 *
 * Users can override any field in ~/.pi/agent/agent-manager.json.
 */
import { chmodSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface TierModelConfig {
	provider: string;
	model: string;
	thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

export interface AgentManagerConfig {
	manager: TierModelConfig;
	lead: TierModelConfig;
	worker: TierModelConfig;
	leads: number;
	workersPerLead: number;
	childExtensions: string[];
	managerTools: string[];
	leadTools: string[];
	workerTools: string[];
	modelResponseTimeoutSeconds: number;
	leadTurnTimeoutSeconds: number;
	workerTurnTimeoutSeconds: number;
	workerBashTimeoutSeconds: number;
	leadLogLines: number;
	workerLogLines: number;
}

export const DEFAULT_CONFIG: AgentManagerConfig = {
	manager: { provider: "cursor", model: "opus-4.8@1m", thinkingLevel: "high" },
	lead: { provider: "cursor", model: "sonnet-5@300k", thinkingLevel: "medium" },
	worker: { provider: "cursor", model: "gpt-5.6-luna@272k:fast", thinkingLevel: "low" },
	leads: 3,
	workersPerLead: 5,
	childExtensions: ["protected-read-paths.ts", "protected-write-paths.ts", "context7.ts"],
	managerTools: [
		"read",
		"grep",
		"find",
		"ls",
		"delegate",
		"todo",
		"context7_resolve_library_id",
		"context7_get_library_docs",
	],
	leadTools: ["read", "grep", "find", "ls"],
	workerTools: ["read", "bash", "edit", "write", "grep", "find"],
	modelResponseTimeoutSeconds: 300,
	leadTurnTimeoutSeconds: 1800,
	workerTurnTimeoutSeconds: 900,
	workerBashTimeoutSeconds: 900,
	leadLogLines: 3,
	workerLogLines: 1,
};

export function getConfigPath(): string {
	return join(getAgentDir(), "agent-manager.json");
}

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

function stringArray(value: unknown, name: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error(`${name} must be an array of strings`);
	}
	return [...value];
}

function integer(value: unknown, name: string, min: number, max: number): number {
	if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
		throw new Error(`${name} must be an integer from ${min} to ${max}`);
	}
	return value as number;
}

function tier(value: unknown, fallback: TierModelConfig, name: string): TierModelConfig {
	if (!value || typeof value !== "object") throw new Error(`${name} must be an object`);
	const merged = { ...fallback, ...(value as Partial<TierModelConfig>) };
	if (!merged.provider || typeof merged.provider !== "string") throw new Error(`${name}.provider must be a string`);
	if (!merged.model || typeof merged.model !== "string") throw new Error(`${name}.model must be a string`);
	if (!THINKING_LEVELS.has(merged.thinkingLevel)) {
		throw new Error(`${name}.thinkingLevel must be one of ${[...THINKING_LEVELS].join(", ")}`);
	}
	return merged;
}

export function validateConfig(value: unknown): AgentManagerConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("configuration must be a JSON object");
	}
	const user = value as Partial<AgentManagerConfig>;
	const merged = { ...DEFAULT_CONFIG, ...user };
	return {
		manager: tier(user.manager ?? DEFAULT_CONFIG.manager, DEFAULT_CONFIG.manager, "manager"),
		lead: tier(user.lead ?? DEFAULT_CONFIG.lead, DEFAULT_CONFIG.lead, "lead"),
		worker: tier(user.worker ?? DEFAULT_CONFIG.worker, DEFAULT_CONFIG.worker, "worker"),
		leads: integer(merged.leads, "leads", 1, 10),
		workersPerLead: integer(merged.workersPerLead, "workersPerLead", 1, 20),
		childExtensions: stringArray(merged.childExtensions, "childExtensions"),
		managerTools: stringArray(merged.managerTools, "managerTools"),
		leadTools: stringArray(merged.leadTools, "leadTools"),
		workerTools: stringArray(merged.workerTools, "workerTools"),
		modelResponseTimeoutSeconds: integer(
			merged.modelResponseTimeoutSeconds,
			"modelResponseTimeoutSeconds",
			1,
			86_400,
		),
		leadTurnTimeoutSeconds: integer(merged.leadTurnTimeoutSeconds, "leadTurnTimeoutSeconds", 1, 86_400),
		workerTurnTimeoutSeconds: integer(merged.workerTurnTimeoutSeconds, "workerTurnTimeoutSeconds", 1, 86_400),
		workerBashTimeoutSeconds: integer(merged.workerBashTimeoutSeconds, "workerBashTimeoutSeconds", 1, 86_400),
		leadLogLines: integer(merged.leadLogLines, "leadLogLines", 0, 10),
		workerLogLines: integer(merged.workerLogLines, "workerLogLines", 1, 5),
	};
}

export function loadConfig(): AgentManagerConfig {
	const path = getConfigPath();
	if (!existsSync(path)) return validateConfig(DEFAULT_CONFIG);
	try {
		return validateConfig(JSON.parse(readFileSync(path, "utf8")));
	} catch (error) {
		console.error(`agent-manager: failed to load ${path}, using defaults: ${error}`);
		return validateConfig(DEFAULT_CONFIG);
	}
}

export function saveConfig(value: unknown): AgentManagerConfig {
	const config = validateConfig(value);
	const path = getConfigPath();
	const temporary = `${path}.tmp-${process.pid}`;
	writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
	renameSync(temporary, path);
	chmodSync(path, 0o600);
	return config;
}

export function resetConfig(): void {
	const path = getConfigPath();
	if (existsSync(path)) unlinkSync(path);
}

export function resolveChildExtensionPaths(names: string[]): string[] {
	const base = join(getAgentDir(), "extensions");
	return names.map((name) => join(base, name)).filter((path) => existsSync(path));
}
