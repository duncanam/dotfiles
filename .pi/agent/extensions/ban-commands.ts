/**
 * Ban Commands Extension
 *
 * Blocks bash tool calls that invoke specific commands or operations.
 * Add rules to the BANNED_PATTERNS array to restrict any command.
 *
 * Current banned categories:
 *
 *   Git destructive ops:   git merge, git rebase, git push, git pull, git reset
 *   GitHub CLI equivalents: gh pr merge, gh pr update-branch, gh repo sync
 *
 * Usage:
 *   To add a new ban, add a BanRule to the BANNED_PATTERNS array with
 *   a pattern (regex) and a human-readable label.
 *
 * Place at: ~/.pi/agent/extensions/ban-commands.ts
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Ban rules — add new entries here to block additional commands
// ---------------------------------------------------------------------------

interface BanRule {
  /** Regex tested against the full command string. */
  pattern: RegExp;
  /** Short human-readable label shown in block messages. */
  label: string;
}

const BANNED_PATTERNS: BanRule[] = [
  // ── Git destructive operations ──────────────────────────────────────────
  // The (?![-\w]) suffix guard prevents matching compound commands like
  // git merge-file, git mergetool, etc.

  { pattern: /\bgit\s+merge(?![\-\w])/, label: "git merge" },
  { pattern: /\bgit\s+rebase(?![\-\w])/, label: "git rebase" },
  { pattern: /\bgit\s+push(?![\-\w])/, label: "git push" },
  { pattern: /\bgit\s+pull(?![\-\w])/, label: "git pull" },
  { pattern: /\bgit\s+reset(?![\-\w])/, label: "git reset" },

  // ── GitHub CLI equivalents ──────────────────────────────────────────────

  { pattern: /\bgh\s+pr\s+merge(?![\-\w])/, label: "gh pr merge" },
  { pattern: /\bgh\s+pr\s+update-branch(?![\-\w])/, label: "gh pr update-branch" },
  { pattern: /\bgh\s+repo\s+sync(?![\-\w])/, label: "gh repo sync" },
];

/** Returns the first matching BanRule, or undefined if the command is allowed. */
function findMatchingRule(command: string): BanRule | undefined {
  return BANNED_PATTERNS.find((rule) => rule.pattern.test(command));
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = event.input.command as string;
    const rule = findMatchingRule(command);

    if (!rule) return;

    // In non-interactive modes (JSON, print, RPC without UI) always block.
    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `The operation "${rule.label}" is banned by the ban-commands extension. No UI available for confirmation.`,
      };
    }

    // In interactive mode, warn but let the user override per-invocation.
    const msg =
      `⚠️  **Banned operation detected:** \`${rule.label}\`\n\n` +
      `Command:\n\`\`\`\n${command}\n\`\`\`\n\n` +
      `This operation is restricted by the ban-commands extension. ` +
      `Are you sure you want to allow it?`;

    const choice = await ctx.ui.select(msg, [
      "No, block it",
      "Yes, allow once",
    ]);

    if (choice !== "Yes, allow once") {
      return {
        block: true,
        reason: `Blocked banned operation: ${rule.label}. The agent is not allowed to use ${rule.label}.`,
      };
    }
  });
}
