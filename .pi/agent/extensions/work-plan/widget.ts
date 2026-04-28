/**
 * Renders the post-upload ticket card that lives above the editor.
 *
 * Compact 5-line layout:
 *   ╭─ 🛠 implementing ──────────────────────────────────────────────╮
 *   │ PLAT-524  Fix CI publish-dry-run guard on release-plz merges   │
 *   │ Savage · Duncan McGough · High · Infrastructure, Bug · Backlog │
 *   │ https://linear.app/atomic-industries/issue/PLAT-524/...        │
 *   ╰────────────────────────────────────────────────────────────────╯
 *
 * Uses visibleWidth / truncateToWidth from @mariozechner/pi-tui so that
 * emoji (🛠) are measured correctly and all lines fit within the terminal
 * width passed in via render(width).
 */

import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { CreatedTicket } from "./linear.js";
import { PRIORITY_NAMES } from "./template.js";

type ThemeToken = "accent" | "success" | "error" | "warning" | "muted";

interface ThemeLike {
	fg: (token: ThemeToken, text: string) => string;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;
/** Visual column width, stripping ANSI codes first. */
const vw = (s: string): number => visibleWidth(s.replace(ANSI_RE, ""));

const padRight = (s: string, width: number): string => {
	const pad = width - vw(s);
	return pad > 0 ? s + " ".repeat(pad) : s;
};

export interface TicketBoxOptions {
	/** Header label shown in the top-left of the box. Defaults to a green "✓ uploaded". */
	modeLabel?: { text: string; token?: ThemeToken };
}

/**
 * @param maxWidth - terminal column width from render(width); box is capped to fit.
 */
export function renderTicketBox(
	ticket: CreatedTicket,
	theme: ThemeLike,
	options: TicketBoxOptions = {},
	maxWidth = 220,
): string[] {
	const modeText = options.modeLabel?.text ?? "✓ uploaded";
	const modeToken = options.modeLabel?.token ?? "success";
	const priorityToken =
		ticket.priority === 1 ? "error" : ticket.priority === 2 ? "warning" : "accent";

	// Row 1: identifier  title
	const header = `${theme.fg("accent", ticket.identifier)}  ${ticket.title}`;

	// Row 2: compact metadata separated by dim dots
	const dot = theme.fg("muted", " · ");
	const metaParts: string[] = [];
	if (ticket.projectName) metaParts.push(ticket.projectName);
	if (ticket.assigneeName) metaParts.push(ticket.assigneeName);
	const priorityLabel = ticket.priorityLabel || PRIORITY_NAMES[ticket.priority] || "";
	if (priorityLabel) metaParts.push(theme.fg(priorityToken, priorityLabel));
	if (ticket.labelNames.length) metaParts.push(ticket.labelNames.join(", "));
	if (ticket.stateName) metaParts.push(ticket.stateName);
	const meta = metaParts.join(dot);

	// Row 3: URL
	const urlRow = theme.fg("accent", ticket.url);

	// Natural inner width, then capped to the terminal width.
	// maxWidth is the full column count; subtract 2 for the │ │ border chars.
	const naturalInner = Math.max(vw(header), vw(meta), vw(urlRow)) + 2;
	const innerWidth = Math.min(naturalInner, maxWidth - 2);

	// Content width available inside the box
	const contentW = innerWidth - 2;

	// Wrap a line into │ <content padded to contentW> │, truncating if needed
	const wrap = (line: string): string =>
		`│ ${padRight(truncateToWidth(line, contentW), contentW)} │`;

	// Top border: ╭─ <modeText> ─────╮
	const topFill = Math.max(0, innerWidth - vw("─ " + modeText + " "));
	const top = "╭─ " + theme.fg(modeToken, modeText) + " " + "─".repeat(topFill) + "╮";

	// Plain bottom border
	const bot = "╰" + "─".repeat(innerWidth) + "╯";

	const out = [top, wrap(header)];
	if (vw(meta) > 0) out.push(wrap(meta));
	out.push(wrap(urlRow), bot);
	return out;
}
