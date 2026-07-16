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

  // Match the `nomad` binary only when it appears in command position, so the
  // bare word inside arguments, quoted strings, comments, grep patterns, or
  // heredoc bodies does NOT trip the ban (previously it did — e.g. a Python
  // heredoc containing `if 'nomad' in k:` was blocked because the old regex
  // matched the quoted word followed by whitespace anywhere in the command).
  //
  // Command position = at the start of the command, or after a shell separator
  // (`; & | ( ) ` newline backtick), or after a command-prefix word
  // (sudo/exec/nohup/nice/ionice/time/xargs/env, each with optional flags or
  // VAR=val assignments). The binary may be path-prefixed (/usr/bin/nomad,
  // ./nomad) and/or quoted. The trailing (?=\s|$) matches only the standalone
  // token, never substrings like `nomad.service.consul` or `NOMAD_ADDR`.
  //
  // The prefix chain is anchored: it may only appear after a command-position
  // separator/start, so a quoted string like `echo "exec nomad"` does NOT
  // match (exec inside a string is not in command position).
  //
  // Residual limitations (this is a tripwire, not a security boundary):
  //   - a heredoc body with "nomad" at the start of a line (after \n) matches;
  //     distinguishing heredoc bodies from real commands needs shell lexing.
  //   - `sudo -u root nomad` (positional arg after sudo) and `FOO=bar nomad`
  //     (env-assignment prefix) are NOT caught — the binary is not adjacent to
  //     a separator or a consumed prefix token.
  //   - indirect invocation (e.g. `python -c "subprocess.run(['nomad',...])"`)
  //     is inherently unbannable by a command-text regex.
  // The common false positives from the old regex (grep / echo / python-string
  // literals containing the bare word) are fixed.
  {
    pattern: /(?:^\s*|\n\s*|[;|&()`]\s*)(?:(?:sudo|exec|nohup|nice|ionice|time|xargs|env)\b(?:\s+(?:-[A-Za-z]+|[A-Za-z_][A-Za-z0-9_]*=\S*))*\s+)*(?:[^\s;&|()"']+\/)?["']?nomad["']?(?=\s|$)/i,
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
