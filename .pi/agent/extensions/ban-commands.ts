/**
 * Ban Commands Extension
 *
 * Blocks bash tool calls that invoke specific commands or operations.
 * Add rules to the BANNED_PATTERNS array to restrict any command.
 *
 * Current banned categories:
 *
 *   Nomad CLI: any direct nomad command (use Nomad tools)
 *
 * Git and GitHub CLI commands are governed separately by the default-deny
 * source-control-policy extension.
 *
 * Bans are deterministic: agent tool calls are blocked outright in every mode.
 * There is no interactive approval path. If a legitimate workflow is missing,
 * add a structured Pi tool rather than bypassing the policy ad hoc.
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
  // ── Nomad CLI ────────────────────────────────────────────────────────────
  // Route all agent-driven Nomad operations through structured extensions so
  // concurrency, ownership, idempotency, and cleanup policies are enforced.

  {
    pattern: /(?:^|[;&|()\s])["']?(?:[^\s;&|()"']+\/)?nomad["']?(?=\s|$)/i,
    label: "direct Nomad CLI (use the Nomad extension tools)",
  },
];

/** Returns the first matching BanRule, or undefined if the command is allowed. */
function findMatchingRule(command: string): BanRule | undefined {
  return BANNED_PATTERNS.find((rule) => rule.pattern.test(command));
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", (event) => {
    if (event.toolName !== "bash") return;

    const command = event.input.command as string;
    const rule = findMatchingRule(command);
    if (!rule) return;

    return {
      block: true,
      reason:
        `Blocked banned operation: ${rule.label}. ` +
        "This policy has no interactive override; use an approved structured tool or report the missing capability.",
    };
  });
}
