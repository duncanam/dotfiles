/**
 * Plan-file template + minimal YAML-frontmatter parser/serializer.
 *
 * We deliberately don't pull in a YAML lib so the extension has zero
 * runtime deps. The schema is small and well-defined, so a hand-rolled
 * parser is fine here.
 */

export interface PlanMeta {
	title?: string;
	team?: string; // UUID, key, or name
	project?: string; // UUID or name
	assignee?: string | null; // "me", email, name, or null for unassigned
	priority?: number; // 0 none, 1 urgent, 2 high, 3 medium, 4 low
	labels?: string[]; // UUIDs or names
	state?: string; // UUID or name
}

// Defaults pulled from ~/.claude/commands/ticket.md (Platform team, Savage project).
// The Linear MCP `save_issue` tool resolves names/IDs/keys internally, so we
// only need the IDs to seed a fresh plan file — no name→ID label table required.
const DEFAULT_TEAM = "96e7d2a4-db27-4b30-acb8-d12068210f1d"; // Platform (PLAT)
const DEFAULT_PROJECT = "84f220b8-846e-4848-8e74-ce0b2f0a6aea"; // Savage

// Matches Linear's UI labels (the MCP `save_issue` schema says
// "0=None, 1=Urgent, 2=High, 3=Normal, 4=Low").
export const PRIORITY_NAMES: Record<number, string> = {
	0: "No priority",
	1: "Urgent",
	2: "High",
	3: "Normal",
	4: "Low",
};

export function defaultPlanText(seed: string): string {
	const trimmed = seed.trim();
	// Always seed the title with a placeholder. The seed string is *context*
	// for the agent (what the user said when they ran `/work-plan ...`); the
	// agent should distill it into a short imperative title rather than
	// pasting the user's raw phrasing verbatim. Validation will refuse to
	// upload while the title is still a placeholder, so this can't sneak
	// through.
	const contextHint = trimmed
		? `User's seed input (refine into a real Context paragraph; do NOT paste verbatim):\n\n> ${trimmed}`
		: "Why this work matters. Reference the Savage project goal (rapid mold-design quoting) if relevant.";

	return `---
title: <short imperative title>
team: ${DEFAULT_TEAM}    # Platform (PLAT)
project: ${DEFAULT_PROJECT}    # Savage
assignee: me           # "me", email, name, or null for unassigned
priority: 4            # 0 none, 1 urgent, 2 high, 3 normal, 4 low
labels:                # one or more from: Feature, Bug, Improvement, Refactor, Tech Debt, Infrastructure, Operations UI, Discussion
  - Feature
state: Backlog         # Backlog, Todo, In Progress, ...
---

## Context

${contextHint}

## Requirements

1. <concrete, testable requirement>
2. <...>

## Acceptance Criteria

- [ ] <verifiable condition>
- [ ] <...>

## Notes / Constraints

<technical constraints, edge cases, or out-of-scope items — delete this section if not needed>
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frontmatter parsing
// ─────────────────────────────────────────────────────────────────────────────

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parsePlan(text: string): { meta: PlanMeta; body: string; rawMeta: string } {
	const match = text.match(FRONTMATTER_RE);
	if (!match) {
		return { meta: {}, body: text, rawMeta: "" };
	}
	const rawMeta = match[1];
	const body = match[2].replace(/^\s*\n/, "");
	return { meta: parseYamlSubset(rawMeta), body, rawMeta };
}

/**
 * Parses the small YAML subset we use for frontmatter:
 *   - `key: scalar`
 *   - `key: "quoted scalar"` / `key: 'scalar'`
 *   - `key: [a, b, c]`           (inline array)
 *   - `key:\n  - a\n  - b`       (block array)
 *   - trailing `# comment` on scalar lines
 *   - `null` / `~` / empty value → null
 *   - integers
 *
 * Anything else falls back to the raw string.
 */
function parseYamlSubset(src: string): PlanMeta {
	const out: Record<string, unknown> = {};
	const lines = src.split(/\r?\n/);
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (!line.trim() || line.trim().startsWith("#")) {
			i++;
			continue;
		}
		const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
		if (!m) {
			i++;
			continue;
		}
		const key = m[1];
		let value = stripComment(m[2]).trim();

		if (value === "" || value === "null" || value === "~") {
			// look ahead for a block list
			const list: string[] = [];
			let j = i + 1;
			while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
				list.push(stripComment(lines[j].replace(/^\s*-\s+/, "")).trim().replace(/^["']|["']$/g, ""));
				j++;
			}
			if (list.length > 0) {
				out[key] = list;
				i = j;
				continue;
			}
			out[key] = null;
		} else if (value.startsWith("[") && value.endsWith("]")) {
			out[key] = value
				.slice(1, -1)
				.split(",")
				.map((s) => s.trim().replace(/^["']|["']$/g, ""))
				.filter((s) => s.length > 0);
		} else if (/^-?\d+$/.test(value)) {
			out[key] = parseInt(value, 10);
		} else {
			value = value.replace(/^["']|["']$/g, "");
			out[key] = value;
		}
		i++;
	}
	return normalizeMeta(out);
}

function stripComment(s: string): string {
	// Strip `# comment` but not `#` inside quotes. Naive but good enough here.
	let inSingle = false;
	let inDouble = false;
	for (let k = 0; k < s.length; k++) {
		const c = s[k];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (c === "#" && !inSingle && !inDouble) return s.slice(0, k);
	}
	return s;
}

function normalizeMeta(raw: Record<string, unknown>): PlanMeta {
	const meta: PlanMeta = {};
	if (typeof raw.title === "string") meta.title = raw.title;
	if (typeof raw.team === "string") meta.team = raw.team;
	if (typeof raw.project === "string") meta.project = raw.project;
	if (raw.assignee === null || typeof raw.assignee === "string") meta.assignee = raw.assignee as string | null;
	if (typeof raw.priority === "number") meta.priority = raw.priority;
	if (Array.isArray(raw.labels)) meta.labels = raw.labels.map((x) => String(x));
	else if (typeof raw.labels === "string" && raw.labels.trim()) meta.labels = [raw.labels.trim()];
	if (typeof raw.state === "string") meta.state = raw.state;
	return meta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanValidation {
	ok: boolean;
	errors: string[];
	warnings: string[];
}

const TEMPLATE_PLACEHOLDER_RE =
	/<(?:short imperative title|concrete, testable requirement|\.\.\.|verifiable condition|technical constraints[^>]*)>/i;
const PLACEHOLDER_LINE_RE = /^\s*(?:[-*]\s*(?:\[[ xX]\]\s*)?|\d+[.)]\s*)?<[^>\n]+>\s*$/m;

function findSections(body: string): Array<{ name: string; start: number; end: number }> {
	const headings: Array<{ name: string; start: number }> = [];
	const re = /^##\s+(.+?)\s*$/gim;
	let match: RegExpExecArray | null;
	while ((match = re.exec(body))) {
		headings.push({ name: match[1].trim(), start: match.index });
	}
	return headings.map((heading, i) => ({
		name: heading.name,
		start: heading.start,
		end: i + 1 < headings.length ? headings[i + 1].start : body.length,
	}));
}

function sectionContent(body: string, sectionName: string): string | undefined {
	const sections = findSections(body);
	const found = sections.find((s) => s.name.toLowerCase() === sectionName.toLowerCase());
	if (!found) return undefined;
	const nextHeading = body.indexOf("\n", found.start);
	const contentStart = nextHeading === -1 ? found.end : nextHeading + 1;
	return body.slice(contentStart, found.end).trim();
}

function hasRealSectionContent(content: string): boolean {
	const withoutPlaceholders = content
		.split(/\r?\n/)
		.filter((line) => !PLACEHOLDER_LINE_RE.test(line))
		.join("\n")
		.replace(/[-*]\s*(?:\[[ xX]\]\s*)?/g, "")
		.replace(/\d+[.)]\s*/g, "")
		.trim();
	return withoutPlaceholders.length >= 15;
}

export function validatePlan(meta: PlanMeta, body: string): PlanValidation {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!meta.title || meta.title.trim() === "" || /^<.*>$/.test(meta.title.trim())) {
		errors.push("Frontmatter `title` is required and must not be a placeholder.");
	}
	if (!meta.team) errors.push("Frontmatter `team` is required.");
	if (meta.priority !== undefined && (meta.priority < 0 || meta.priority > 4)) {
		errors.push(`priority must be 0–4, got ${meta.priority}.`);
	}
	if (!meta.labels || meta.labels.length === 0) {
		warnings.push("No labels set. The Claude ticket convention requires at least one.");
	}

	const bodyTrim = body.trim();
	if (bodyTrim.length < 40) errors.push("Plan body is too short to upload.");
	if (TEMPLATE_PLACEHOLDER_RE.test(body) || PLACEHOLDER_LINE_RE.test(body)) {
		errors.push("Plan still contains template placeholders; replace them before uploading.");
	}

	const requiredSections = ["Context", "Requirements", "Acceptance Criteria"];
	const sections = findSections(body);
	let previousIndex = -1;
	for (const section of requiredSections) {
		const idx = sections.findIndex((s) => s.name.toLowerCase() === section.toLowerCase());
		if (idx === -1) {
			errors.push(`Body is missing a \`## ${section}\` section.`);
			continue;
		}
		if (idx < previousIndex) {
			errors.push("Body sections must appear in this order: Context, Requirements, Acceptance Criteria.");
			break;
		}
		previousIndex = idx;

		const content = sectionContent(body, section) ?? "";
		if (!hasRealSectionContent(content)) {
			errors.push(`\`## ${section}\` needs concrete, non-placeholder content.`);
		}
	}

	const requirements = sectionContent(body, "Requirements");
	if (requirements && !/^\s*(?:\d+[.)]|[-*])\s+\S/m.test(requirements)) {
		warnings.push("`## Requirements` should contain numbered or bulleted items.");
	}
	const acceptance = sectionContent(body, "Acceptance Criteria");
	if (acceptance && !/^\s*[-*]\s+(?:\[[ xX]\]\s*)?\S/m.test(acceptance)) {
		warnings.push("`## Acceptance Criteria` should contain bulleted checklist-style items.");
	}

	return { ok: errors.length === 0, errors, warnings };
}
