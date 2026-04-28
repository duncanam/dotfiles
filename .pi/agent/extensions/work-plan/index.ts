/**
 * work-plan extension
 *
 * Iterative planning workflow:
 *   /work-plan [seed idea]   – start (or resume) a plan, opens the markdown
 *                              file in the parent Neovim, enters planning mode
 *   /wp-upload               – validate the plan, confirm, upload to Linear
 *   /wp-cancel               – exit planning mode without uploading
 *   /wp-clear                – dismiss the post-upload ticket card
 *   /wp-open                 – re-open the plan file in nvim
 *   /wp-issue <id>           – fetch a Linear issue and start implementing it
 *
 * Status indicator: footer shows `📝 planning` while planning mode is active,
 * `🛠 PLAT-NNN` while implementing. After upload, a unicode box card sits
 * above the editor with ticket details.
 *
 * State persists across `/reload` and session restarts via `pi.appendEntry`.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { describeTools, disconnectLinearClient, getIssue, LinearError, uploadPlan, type CreatedTicket } from "./linear.js";
import { isInsideNvim, openInNvim } from "./nvim.js";
import { defaultPlanText, parsePlan, validatePlan } from "./template.js";
import { renderTicketBox } from "./widget.js";

const PLANS_DIR = join(homedir(), ".pi", "agent", "work-plans");
const STATE_TYPE = "work-plan-state";
const TICKET_TYPE = "work-plan-ticket";

interface PersistedState {
	enabled: boolean;
	planFile: string | null;
	lastTicket: CreatedTicket | null;
	/** Last hash observed while planning. Kept for backward-compatible persisted state. */
	lastPlanHash: string | null;
	/**
	 * Active ticket the agent is implementing (entered via `/wp-issue`).
	 * Mutually exclusive with planning mode.
	 */
	implementingTicket: CreatedTicket | null;
}

export default function workPlanExtension(pi: ExtensionAPI): void {
	let planningEnabled = false;
	let planFile: string | null = null;
	let lastTicket: CreatedTicket | null = null;
	let lastPlanHash: string | null = null;
	let sessionId: string | null = null;
	let implementingTicket: CreatedTicket | null = null;

	// ─── helpers ────────────────────────────────────────────────────────────

	const persist = (): void => {
		pi.appendEntry(STATE_TYPE, {
			enabled: planningEnabled,
			planFile,
			lastTicket,
			lastPlanHash,
			implementingTicket,
		} satisfies PersistedState);
	};

	const hashPlan = (path: string): string | null => {
		try {
			return createHash("sha1").update(readFileSync(path)).digest("hex").slice(0, 12);
		} catch {
			return null;
		}
	};

	const normalizeToolPath = (path: unknown, ctx: ExtensionContext): string | null => {
		if (typeof path !== "string" || !path.trim()) return null;
		const raw = path.trim().replace(/^@/, "");
		return isAbsolute(raw) ? raw : resolve(ctx.cwd, raw);
	};

	const isPlanFileToolTarget = (path: unknown, ctx: ExtensionContext): boolean => {
		if (!planFile) return false;
		return normalizeToolPath(path, ctx) === planFile;
	};

	const containsGitCommand = (command: unknown): boolean => {
		if (typeof command !== "string") return false;
		return /(^|[;&|\n$(`]\s*)git(?:\s|$|[;&|<>)`])/i.test(command);
	};

	const updateStatus = (ctx: ExtensionContext): void => {
		if (planningEnabled) {
			ctx.ui.setStatus("work-plan", ctx.ui.theme.fg("warning", "📝 planning"));
		} else if (implementingTicket) {
			ctx.ui.setStatus(
				"work-plan",
				ctx.ui.theme.fg("accent", `🛠 ${implementingTicket.identifier}`),
			);
		} else {
			ctx.ui.setStatus("work-plan", undefined);
		}

		// Card priority: implementing > uploaded. The two states use the same
		// widget slot but a different mode label so the user can tell at a
		// glance which card they're looking at.
		const card = implementingTicket ?? lastTicket;
		if (card) {
			const modeLabel = implementingTicket
				? ({ text: "🛠 implementing", token: "accent" } as const)
				: ({ text: "✓ uploaded", token: "success" } as const);
			ctx.ui.setWidget(
				"work-plan-ticket",
				(_tui, theme) => ({
					render: (width: number) => renderTicketBox(card, theme, { modeLabel }, width),
					invalidate: () => {},
				}),
				{ placement: "aboveEditor" },
			);
		} else {
			ctx.ui.setWidget("work-plan-ticket", undefined);
		}
	};

	const sessionPlanFile = (ctx: ExtensionContext): string => {
		const sm = ctx.sessionManager as unknown as { getSessionId?: () => string | undefined };
		const id = sessionId ?? sm.getSessionId?.() ?? `default-${process.pid}`;
		sessionId = id;
		mkdirSync(PLANS_DIR, { recursive: true });
		return join(PLANS_DIR, `${id}.md`);
	};

	const ensurePlanFile = (seed: string, ctx: ExtensionContext): string => {
		const path = planFile ?? sessionPlanFile(ctx);
		if (!existsSync(path)) {
			writeFileSync(path, defaultPlanText(seed), "utf8");
		} else if (seed.trim() && readFileSync(path, "utf8").includes("<short imperative title>")) {
			// File exists from a prior run but was never edited — refresh seed.
			writeFileSync(path, defaultPlanText(seed), "utf8");
		}
		return path;
	};

	const enterPlanningMode = async (seed: string, ctx: ExtensionContext): Promise<void> => {
		planFile = ensurePlanFile(seed, ctx);
		planningEnabled = true;
		implementingTicket = null;
		lastPlanHash = null;
		updateStatus(ctx);
		persist();

		if (isInsideNvim()) {
			await openInNvim(planFile);
			ctx.ui.notify(`Plan opened in nvim: ${planFile}`, "info");
		} else {
			ctx.ui.notify(
				`Plan written to ${planFile}\n(Not running inside nvim — open it manually with $EDITOR.)`,
				"info",
			);
		}
	};

	const exitPlanningMode = (ctx: ExtensionContext, reason: "uploaded" | "cancelled"): void => {
		planningEnabled = false;
		updateStatus(ctx);
		persist();
		ctx.ui.notify(
			reason === "uploaded" ? "Planning mode complete — ticket uploaded." : "Planning mode cancelled.",
			"info",
		);
	};

	// ─── flag ───────────────────────────────────────────────────────────────

	pi.registerFlag("work-plan", {
		description: "Start in work-plan mode (opens a plan file)",
		type: "boolean",
		default: false,
	});

	// ─── commands ───────────────────────────────────────────────────────────

	pi.registerCommand("work-plan", {
		description: "Start (or resume) an iterative work plan to upload to Linear",
		handler: async (args, ctx) => {
			if (implementingTicket) {
				const ok = await ctx.ui.confirm(
					"Switch modes?",
					`You are currently implementing ${implementingTicket.identifier}. Exit implementing mode and start planning?`,
				);
				if (!ok) return;
			}
			await enterPlanningMode(args ?? "", ctx);
			// Kick the agent off with a structured instruction so it produces an
			// initial draft on the very first turn. The seed (if any) is
			// *context* the user offered, not a finished title — the agent
			// must distill it into a short imperative title.
			const seed = (args ?? "").trim();
			pi.sendMessage(
				{
					customType: "work-plan-kickoff",
					content:
						`I just entered work-plan mode. The plan file is **${planFile}** ` +
						`(its current contents are already inlined in your hidden planning ` +
						`context — do not call \`read\` for it).\n\n` +
						(seed
							? `User's seed input (treat as raw context, NOT as a finished title): ${seed}\n\n` +
							  `Please write a complete first draft directly with \`edit\`/\`write\`:\n` +
							  `  • Replace the placeholder \`title:\` in frontmatter with a short imperative title you craft from the seed (e.g. 'Cache quote endpoint responses', not the user's raw phrasing).\n` +
							  `  • Fill in ALL frontmatter fields with judgment — do not leave placeholders or defaults:\n` +
							  `      - priority: default 3 (medium) unless urgency is clear from context\n` +
							  `      - labels: choose from the allowed list based on the nature of the work (do not leave <label>)\n` +
							  `      - state: Todo if immediately actionable, Backlog otherwise\n` +
							  `      - team, project, assignee: leave as-is unless the user specifies otherwise\n` +
							  `  • Fill in Context / Requirements / Acceptance Criteria / Notes.\n` +
							  `  • Ask any clarifying questions you need.`
							: "Please ask me what we're working on so we can start drafting."),
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});

	pi.registerCommand("wp-open", {
		description: "Re-open the current plan file in nvim",
		handler: async (_args, ctx) => {
			if (!planFile) {
				ctx.ui.notify("No active plan. Start one with /work-plan", "warning");
				return;
			}
			if (isInsideNvim()) {
				await openInNvim(planFile);
			} else {
				ctx.ui.notify(`Plan file: ${planFile}`, "info");
			}
		},
	});

	pi.registerCommand("wp-cancel", {
		description: "Exit planning mode without uploading (keeps the file on disk)",
		handler: async (_args, ctx) => {
			if (!planningEnabled) {
				ctx.ui.notify("Not in planning mode.", "warning");
				return;
			}
			exitPlanningMode(ctx, "cancelled");
		},
	});

	pi.registerCommand("wp-clear", {
		description: "Dismiss the ticket card and exit implementing mode (if active)",
		handler: async (_args, ctx) => {
			const wasImplementing = implementingTicket !== null;
			implementingTicket = null;
			lastTicket = null;
			updateStatus(ctx);
			persist();
			if (wasImplementing) ctx.ui.notify("Exited implementing mode.", "info");
		},
	});

	pi.registerCommand("wp-issue", {
		description: "Load a Linear issue and start implementing it (case-insensitive ID, e.g. /wp-issue plat-456)",
		handler: async (args, ctx) => {
			const raw = (args ?? "").trim();
			if (!raw) {
				if (implementingTicket) {
					ctx.ui.notify(
						`Currently implementing ${implementingTicket.identifier}: ${implementingTicket.title}\n` +
							`Run /wp-issue <other-id> to swap, or /wp-clear to exit.`,
						"info",
					);
				} else {
					ctx.ui.notify("Usage: /wp-issue <id>  (e.g. /wp-issue plat-456)", "warning");
				}
				return;
			}
			const id = raw.toUpperCase();
			if (!/^[A-Z]+-\d+$/.test(id)) {
				ctx.ui.notify(`Invalid issue ID '${raw}'. Expected something like PLAT-456.`, "error");
				return;
			}

			// Mutual exclusion with planning mode (which has unsaved file state).
			let exitPlanningForTicket = false;
			if (planningEnabled) {
				const ok = await ctx.ui.confirm(
					"Switch modes?",
					`You are currently in planning mode. Exit planning and switch to implementing ${id}?\n` +
						`(The plan file stays on disk; you can return to it later.)`,
				);
				if (!ok) return;
				exitPlanningForTicket = true;
			}

			try {
				ctx.ui.notify(`Fetching ${id}\u2026`, "info");
				const ticket = await getIssue(id, { onStatus: (m) => ctx.ui.notify(m, "info") });
				if (exitPlanningForTicket) {
					planningEnabled = false;
					lastPlanHash = null;
				}
				implementingTicket = ticket;
				updateStatus(ctx);
				persist();

				const meta =
					`Priority: ${ticket.priorityLabel}` +
					(ticket.projectName ? `  ·  Project: ${ticket.projectName}` : "") +
					(ticket.labelNames.length ? `  ·  Labels: ${ticket.labelNames.join(", ")}` : "") +
					`  ·  State: ${ticket.stateName}`;
				const kickoff =
					`**Implementing ${ticket.identifier}: ${ticket.title}**\n` +
					`${ticket.url}\n\n` +
					`${meta}\n\n` +
					`Take it from here. The full description is in your hidden context. ` +
					`Implement per the acceptance criteria; do not touch git. ` +
					`Run /wp-issue with another ID to swap, or /wp-clear to exit.`;

				pi.sendMessage(
					{
						customType: "work-plan-implement-kickoff",
						content: kickoff,
						display: true,
						details: { ticket },
					},
					{ triggerTurn: true },
				);
			} catch (err) {
				const msg = err instanceof LinearError ? err.message : (err as Error).message;
				ctx.ui.notify(`Failed to load ${raw}: ${msg}`, "error");
			}
		},
	});

	pi.registerCommand("wp-mcp-tools", {
		description: "Diagnostic: list tools exposed by the Linear MCP server",
		handler: async (_args, ctx) => {
			try {
				ctx.ui.notify("Connecting to Linear MCP…", "info");
				const tools = await describeTools({ onStatus: (m) => ctx.ui.notify(m, "info") });
				const summary = tools.map((t) => `  • ${t.name}${t.description ? ": " + t.description.split("\n")[0] : ""}`).join("\n");
				ctx.ui.notify(`Linear MCP exposes ${tools.length} tool(s):\n${summary}`, "info");
			} catch (err) {
				ctx.ui.notify((err as Error).message, "error");
			}
		},
	});

	pi.registerCommand("wp-upload", {
		description: "Upload the current plan to Linear as a new issue",
		handler: async (_args, ctx) => {
			if (!planningEnabled || !planFile) {
				ctx.ui.notify("Not in planning mode. Start one with /work-plan", "warning");
				return;
			}
			if (!existsSync(planFile)) {
				ctx.ui.notify(`Plan file is missing: ${planFile}`, "error");
				return;
			}

			const text = readFileSync(planFile, "utf8");
			const { meta, body } = parsePlan(text);
			const validation = validatePlan(meta, body);
			if (!validation.ok) {
				ctx.ui.notify(
					`Plan is not ready to upload:\n${validation.errors.map((e) => `  • ${e}`).join("\n")}`,
					"error",
				);
				return;
			}

			const summary =
				`Title:    ${meta.title}\n` +
				`Team:     ${meta.team}\n` +
				`Project:  ${meta.project ?? "—"}\n` +
				`Assignee: ${meta.assignee ?? "—"}\n` +
				`Priority: ${meta.priority ?? 0}\n` +
				`Labels:   ${(meta.labels ?? []).join(", ") || "—"}\n` +
				`State:    ${meta.state ?? "(default)"}\n` +
				`Body:     ${body.trim().length} chars` +
				(validation.warnings.length
					? `\n\nWarnings:\n${validation.warnings.map((w) => `  • ${w}`).join("\n")}`
					: "");

			const ok = await ctx.ui.confirm("Upload this plan to Linear?", summary);
			if (!ok) {
				ctx.ui.notify("Upload cancelled.", "info");
				return;
			}

			try {
				ctx.ui.notify("Uploading to Linear…", "info");
				const ticket = await uploadPlan(meta, body, {
					onStatus: (m) => ctx.ui.notify(m, "info"),
				});
				lastTicket = ticket;
				exitPlanningMode(ctx, "uploaded");
				updateStatus(ctx);

				pi.sendMessage(
					{
						customType: "work-plan-uploaded",
						content: `Uploaded to Linear: **[${ticket.identifier}](${ticket.url})** — ${ticket.title}`,
						display: true,
						details: { ticket },
					},
					{ triggerTurn: false },
				);
			} catch (err) {
				const msg = err instanceof LinearError ? err.message : String(err);
				ctx.ui.notify(`Linear upload failed: ${msg}`, "error");
			}
		},
	});

	// ─── hard safety gates for planning / implementing modes ───────────────

	pi.on("tool_call", async (event, ctx) => {
		if (implementingTicket && event.toolName === "bash") {
			const command = (event.input as { command?: unknown }).command;
			if (containsGitCommand(command)) {
				return {
					block: true,
					reason:
						`Implementing ${implementingTicket.identifier}: git commands are blocked. ` +
						"Branches, commits, and PRs are handled outside this conversation.",
				};
			}
		}

		if (!planningEnabled) return;

		if (event.toolName === "bash") {
			return {
				block: true,
				reason: "Work-plan mode is drafting-only: bash/execute commands are blocked.",
			};
		}

		if (event.toolName === "edit" || event.toolName === "write") {
			const path = (event.input as { path?: unknown }).path;
			if (!isPlanFileToolTarget(path, ctx)) {
				return {
					block: true,
					reason: `Work-plan mode may only edit the active plan file: ${planFile ?? "(none)"}`,
				};
			}
		}
	});

	// ─── inject per-turn mode context ─────────────────────────────────────
	//
	// Use the system prompt rather than persistent hidden custom messages. That
	// keeps the LLM context authoritative for the current mode without carrying
	// every prior plan/ticket snapshot forward forever.

	pi.on("before_agent_start", async (event, ctx) => {
		let extraContext: string | null = null;

		if (planningEnabled) {
			if (!planFile) planFile = sessionPlanFile(ctx);
			const currentHash = hashPlan(planFile);
			if (currentHash === null) {
				extraContext = planningSystemMessageMissing(planFile);
			} else {
				const contents = readFileSync(planFile, "utf8");
				lastPlanHash = currentHash;
				extraContext = planningSystemMessageWithBody(planFile, currentHash, contents);
			}
		} else if (implementingTicket) {
			extraContext = implementingSystemMessage(implementingTicket);
		}

		if (!extraContext) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${extraContext}` };
	});

	// Strip stale persistent context from older extension versions. Keep kickoff
	// messages only for the first LLM turn they trigger; after an assistant reply
	// they become stale instructions and should not be sent again.
	pi.on("context", async (event) => {
		let assistantSeenAfter = false;
		const assistantAfter: boolean[] = [];
		for (let i = event.messages.length - 1; i >= 0; i--) {
			assistantAfter[i] = assistantSeenAfter;
			if ((event.messages[i] as { role?: string }).role === "assistant") assistantSeenAfter = true;
		}

		return {
			messages: event.messages.filter((m, i) => {
				const ct = (m as { customType?: string }).customType;
				if (ct === "work-plan-context" || ct === "work-plan-implement-context") return false;
				if (ct === "work-plan-kickoff") return planningEnabled && !assistantAfter[i];
				if (ct === "work-plan-implement-kickoff") return implementingTicket !== null && !assistantAfter[i];
				return true;
			}),
		};
	});

	// ─── lifecycle ──────────────────────────────────────────────────────────

	pi.on("session_shutdown", async () => {
		disconnectLinearClient();
	});

	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getBranch();
		const last = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === STATE_TYPE)
			.pop() as { data?: PersistedState } | undefined;
		if (last?.data) {
			planningEnabled = last.data.enabled ?? false;
			planFile = last.data.planFile ?? null;
			lastTicket = last.data.lastTicket ?? null;
			lastPlanHash = last.data.lastPlanHash ?? null;
			implementingTicket = last.data.implementingTicket ?? null;
		}
		// Also restore from older (separate) ticket entries if present.
		if (!lastTicket) {
			const t = entries
				.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === TICKET_TYPE)
				.pop() as { data?: CreatedTicket } | undefined;
			if (t?.data) lastTicket = t.data;
		}

		if (pi.getFlag("work-plan") === true && !planningEnabled) {
			await enterPlanningMode("", ctx);
		}
		updateStatus(ctx);
	});
}

// ─── system message used to steer the agent during planning ────────────────

const RULES_BLOCK = `Each turn:
  1. Apply the user's requested refinements using \`edit\` or \`write\`.
     You do NOT need to call \`read\` first — the current contents are
     inlined above (and if they change out-of-band you'll be re-shown
     the new contents on the next turn automatically).
  2. Keep the YAML frontmatter valid. The schema is:
       title (string, required, no placeholders — distill from the
         user's seed input rather than pasting it verbatim),
       team (UUID/key/name),
       project (UUID/name),
       assignee ("me"|email|name|null),
       priority (0=none, 1=urgent, 2=high, 3=medium, 4=low),
       labels (list, choose from: Feature, Bug, Improvement, Refactor,
         Tech Debt, Infrastructure, Operations UI, Discussion),
       state (Backlog | Todo | In Progress | ...).
  3. The body MUST contain these sections in this order:
       ## Context           — why this matters; reference Savage if relevant
       ## Requirements      — numbered, concrete, testable items
       ## Acceptance Criteria — bulleted done conditions
       ## Notes / Constraints — optional
  4. Do NOT execute, implement, or run any of the plan. Only edit the file.
  5. Be concise. Write so another LLM could pick it up without clarification.

When the user is satisfied they will run \`/wp-upload\` to submit. They
may also \`/wp-cancel\` to bail. Don't try to upload for them.`;

function planningSystemMessageWithBody(planFile: string, hash: string, contents: string): string {
	const { meta, body } = parsePlan(contents);
	const validation = validatePlan(meta, body);
	const validationBlock =
		validation.errors.length > 0
			? `\n⚠️  VALIDATION ERRORS — fix these before /wp-upload will succeed:\n${validation.errors.map((e) => `  • ${e}`).join("\n")}\n`
			: "";

	return `[WORK-PLAN MODE ACTIVE]
You are co-authoring a Linear issue with the user. The plan lives at:
  ${planFile}
Current content hash: ${hash}

Here is the **authoritative current contents** of the plan file. Treat
this as ground truth; do NOT call \`read\` for this file unless this
block disappears or the hash changes on a future turn.

\`\`\`markdown
${contents}\`\`\`
${validationBlock}
${RULES_BLOCK}`;
}

function planningSystemMessageMissing(planFile: string): string {
	return `[WORK-PLAN MODE ACTIVE]
Plan file: ${planFile}
The file is currently missing on disk. Create it with \`write\` using
the schema below before doing anything else.

${RULES_BLOCK}`;
}

// ─── system message used to steer the agent during implementing mode ───

function implementingSystemMessage(t: CreatedTicket): string {
	const meta = [
		`Identifier: ${t.identifier}`,
		`Title: ${t.title}`,
		`URL: ${t.url}`,
		`Priority: ${t.priorityLabel}`,
		t.projectName ? `Project: ${t.projectName}` : null,
		t.labelNames.length ? `Labels: ${t.labelNames.join(", ")}` : null,
		`State: ${t.stateName}`,
	]
		.filter(Boolean)
		.join("\n");

	const body = (t.description ?? "").trim() || "(this ticket has no description — ask the user for clarification)";

	return `[IMPLEMENTING TICKET ${t.identifier}]
You are implementing the following Linear issue. Treat this block as
authoritative — do NOT call any Linear MCP tools to re-fetch it.

${meta}

## Description

${body}

---

This ticket has already been planned (the description above IS the plan).
Your job is to implement it.

Rules:
  1. Do NOT touch git. Never run \`git commit\`, \`git push\`, \`git checkout\`,
     \`git branch\`, \`git merge\`, \`git rebase\`, \`git stash\`, \`git pull\`,
     \`git reset\`, or any related command. Branches, commits, and PRs
     are handled outside this conversation. The ticket transitions to
     Done automatically when the matching commit lands.
  2. Focus on the description's acceptance criteria above.
  3. If you need clarification, ask the user.
  4. Use the full standard tool set (read, write, edit, bash, grep, etc.)
     freely — bash for non-git commands is fine.
  5. The user can swap to a different ticket with /wp-issue <id> or
     clear with /wp-clear.`;
}
