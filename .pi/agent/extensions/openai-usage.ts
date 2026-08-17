/**
 * Show OpenAI Codex subscription usage inline in Pi's footer.
 *
 * The usage endpoint is part of the ChatGPT/Codex backend rather than the
 * public OpenAI API. It requires the OAuth credential created by
 * `/login openai-codex` and reports the primary subscription window.
 */

import { Buffer } from "node:buffer";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const OPENAI_CODEX_PROVIDER = "openai-codex";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
const JWT_AUTH_CLAIM = "https://api.openai.com/auth";

type FooterTheme = ExtensionContext["ui"]["theme"];

type FooterData = {
	getGitBranch(): string | null;
	getExtensionStatuses(): ReadonlyMap<string, string>;
	getAvailableProviderCount(): number;
	onBranchChange(callback: () => void): () => void;
};

type UsageResult = {
	configured: boolean;
	percent?: number;
};

type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
};

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
	if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	return `${Math.round(count / 1_000_000)}M`;
}

function formatCwdForFooter(cwd: string, home: string | undefined): string {
	if (!home) return cwd;

	const resolvedCwd = resolve(cwd);
	const resolvedHome = resolve(home);
	const relativeToHome = relative(resolvedHome, resolvedCwd);
	const isInsideHome =
		relativeToHome === "" ||
		(relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

	if (!isInsideHome) return cwd;
	return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function sanitizeStatusText(text: string): string {
	return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function addUsage(totals: UsageTotals, usage: Usage | undefined): void {
	if (!usage) return;
	totals.input += usage.input;
	totals.output += usage.output;
	totals.cacheRead += usage.cacheRead;
	totals.cacheWrite += usage.cacheWrite;
	totals.cost += usage.cost.total;
}

function getUsageTotals(ctx: ExtensionContext): UsageTotals & { latestCacheHitRate?: number } {
	const totals: UsageTotals = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
	};
	let latestCacheHitRate: number | undefined;

	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			addUsage(totals, entry.message.usage);
			const promptTokens = entry.message.usage.input + entry.message.usage.cacheRead + entry.message.usage.cacheWrite;
			latestCacheHitRate = promptTokens > 0 ? (entry.message.usage.cacheRead / promptTokens) * 100 : undefined;
		} else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
			addUsage(totals, entry.message.usage);
		} else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
			addUsage(totals, entry.usage);
		}
	}

	return { ...totals, latestCacheHitRate };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function asPercent(value: unknown): number | undefined {
	const percent = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
	return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : undefined;
}

function parseUsagePercent(payload: unknown): number | undefined {
	const rateLimit = asRecord(asRecord(payload)?.rate_limit);
	if (!rateLimit) return undefined;

	for (const windowName of ["primary_window", "secondary_window"]) {
		const window = asRecord(rateLimit[windowName]);
		const percent = asPercent(window?.used_percent);
		if (percent !== undefined) return percent;
	}

	return undefined;
}

function getAccountId(accessToken: string): string | undefined {
	try {
		const payloadPart = accessToken.split(".")[1];
		if (!payloadPart) return undefined;

		const payload = asRecord(JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")));
		const auth = asRecord(payload?.[JWT_AUTH_CLAIM]);
		const accountId = auth?.chatgpt_account_id;
		return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
	} catch {
		return undefined;
	}
}

async function fetchSubscriptionUsage(ctx: ExtensionContext, signal: AbortSignal): Promise<UsageResult> {
	// getProviderAuth() resolves OAuth and refreshes an expired access token for us.
	const auth = await ctx.modelRegistry.getProviderAuth(OPENAI_CODEX_PROVIDER);
	const accessToken = auth?.auth.apiKey;
	if (!accessToken) return { configured: false };

	const accountId = getAccountId(accessToken);
	if (!accountId) throw new Error("OpenAI Codex access token has no account ID");

	const response = await fetch(USAGE_URL, {
		headers: {
			Accept: "application/json",
			Authorization: `Bearer ${accessToken}`,
			"chatgpt-account-id": accountId,
			originator: "pi",
			"User-Agent": "pi-openai-usage",
		},
		signal,
	});

	if (!response.ok) {
		throw new Error(`OpenAI usage request failed (${response.status})`);
	}

	return { configured: true, percent: parseUsagePercent(await response.json()) };
}

function renderFooter(
	ctx: ExtensionContext,
	theme: FooterTheme,
	footerData: FooterData,
	width: number,
	openAiPercent: number | undefined,
): string[] {
	const totals = getUsageTotals(ctx);
	const contextUsage = ctx.getContextUsage();
	const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
	const contextPercentValue = contextUsage?.percent ?? 0;
	const contextPercent = contextUsage?.percent == null ? "?" : contextUsage.percent.toFixed(1);

	let pwd = formatCwdForFooter(ctx.cwd, process.env.HOME || process.env.USERPROFILE);
	const branch = footerData.getGitBranch();
	if (branch) pwd = `${pwd} (${branch})`;
	const sessionName = ctx.sessionManager.getSessionName();
	if (sessionName) pwd = `${pwd} • ${sessionName}`;

	const statsParts: string[] = [];
	if (totals.input) statsParts.push(`↑${formatTokens(totals.input)}`);
	if (totals.output) statsParts.push(`↓${formatTokens(totals.output)}`);
	if (totals.cacheRead) statsParts.push(`R${formatTokens(totals.cacheRead)}`);
	if (totals.cacheWrite) statsParts.push(`W${formatTokens(totals.cacheWrite)}`);
	if ((totals.cacheRead > 0 || totals.cacheWrite > 0) && totals.latestCacheHitRate !== undefined) {
		statsParts.push(`CH${totals.latestCacheHitRate.toFixed(1)}%`);
	}

	const usingSubscription = ctx.model?.provider === OPENAI_CODEX_PROVIDER;
	if (totals.cost || usingSubscription) {
		statsParts.push(`$${totals.cost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`);
	}

	const autoIndicator = " (auto)";
	const contextPercentDisplay =
		contextPercent === "?"
			? `?/${formatTokens(contextWindow)}${autoIndicator}`
			: `${contextPercent}%/${formatTokens(contextWindow)}${autoIndicator}`;
	const contextColor = contextPercentValue > 90 ? "error" : contextPercentValue > 70 ? "warning" : undefined;
	const contextPercentStr = contextColor ? theme.fg(contextColor, contextPercentDisplay) : contextPercentDisplay;
	statsParts.push(contextPercentStr);

	if (openAiPercent !== undefined) {
		const usageColor = openAiPercent > 90 ? "error" : openAiPercent > 70 ? "warning" : "success";
		statsParts.push(theme.fg("dim", "•"), theme.fg(usageColor, `OpenAI ${Math.round(openAiPercent)}%`));
	}

	let statsLeft = statsParts.join(" ");
	let statsLeftWidth = visibleWidth(statsLeft);
	if (statsLeftWidth > width) {
		statsLeft = truncateToWidth(statsLeft, width, "...");
		statsLeftWidth = visibleWidth(statsLeft);
	}

	const modelName = ctx.model?.id || "no-model";
	let rightSide = modelName;
	if (ctx.model?.reasoning) {
		const thinkingLevel = ctx.thinkingLevel || "off";
		rightSide = thinkingLevel === "off" ? `${modelName} • thinking off` : `${modelName} • ${thinkingLevel}`;
	}
	if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
		const withProvider = `(${ctx.model.provider}) ${rightSide}`;
		if (statsLeftWidth + 2 + visibleWidth(withProvider) <= width) rightSide = withProvider;
	}

	const rightSideWidth = visibleWidth(rightSide);
	const totalNeeded = statsLeftWidth + 2 + rightSideWidth;
	let statsLine: string;
	if (totalNeeded <= width) {
		const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
		statsLine = statsLeft + padding + rightSide;
	} else {
		const availableForRight = width - statsLeftWidth - 2;
		if (availableForRight > 0) {
			const truncatedRight = truncateToWidth(rightSide, availableForRight, "");
			const truncatedRightWidth = visibleWidth(truncatedRight);
			const padding = " ".repeat(Math.max(0, width - statsLeftWidth - truncatedRightWidth));
			statsLine = statsLeft + padding + truncatedRight;
		} else {
			statsLine = statsLeft;
		}
	}

	const dimStatsLeft = theme.fg("dim", statsLeft);
	const remainder = statsLine.slice(statsLeft.length);
	const dimRemainder = theme.fg("dim", remainder);
	const lines = [
		truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")),
		dimStatsLeft + dimRemainder,
	];

	const extensionStatuses = footerData.getExtensionStatuses();
	if (extensionStatuses.size > 0) {
		const statusLine = Array.from(extensionStatuses.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([, text]) => sanitizeStatusText(text))
			.join(" ");
		lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
	}

	return lines;
}

export default function (pi: ExtensionAPI) {
	let openAiPercent: number | undefined;
	let refreshTimer: ReturnType<typeof setInterval> | undefined;
	let requestController: AbortController | undefined;
	let lastAttempt = 0;
	let disposed = false;
	let activeTui: { requestRender(): void } | undefined;

	const requestRender = () => activeTui?.requestRender();

	const refreshUsage = async (ctx: ExtensionContext, force = false): Promise<void> => {
		const now = Date.now();
		if (disposed || requestController || (!force && now - lastAttempt < REFRESH_INTERVAL_MS)) return;

		lastAttempt = now;
		const controller = new AbortController();
		requestController = controller;
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const result = await fetchSubscriptionUsage(ctx, controller.signal);
			if (result.configured) openAiPercent = result.percent;
			else openAiPercent = undefined;
		} catch {
			// Keep the last successful value during transient network/auth failures.
		} finally {
			clearTimeout(timeout);
			if (requestController === controller) requestController = undefined;
			if (!disposed) requestRender();
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		disposed = false;
		openAiPercent = undefined;
		lastAttempt = 0;
		if (refreshTimer) clearInterval(refreshTimer);

		ctx.ui.setFooter((tui, theme, footerData) => {
			activeTui = tui;
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose() {
					unsubscribe();
					if (activeTui === tui) activeTui = undefined;
				},
				invalidate() {},
				render(width: number) {
					return renderFooter(ctx, theme, footerData, width, openAiPercent);
				},
			};
		});

		refreshTimer = setInterval(() => void refreshUsage(ctx), REFRESH_INTERVAL_MS);
		void refreshUsage(ctx, true);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		if (ctx.mode === "tui") void refreshUsage(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		if (ctx.mode === "tui") void refreshUsage(ctx, true);
	});

	pi.on("session_shutdown", async () => {
		disposed = true;
		if (refreshTimer) clearInterval(refreshTimer);
		refreshTimer = undefined;
		requestController?.abort();
		requestController = undefined;
		activeTui = undefined;
	});
}
