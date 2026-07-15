import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findSourceControlViolation } from "./shell-policy.ts";

/**
 * Enforce read-only allowlists for agent-driven Git and GitHub CLI commands.
 * This is a deterministic guardrail with no interactive override.
 */
export default function sourceControlPolicyExtension(pi: ExtensionAPI): void {
	pi.on("tool_call", (event) => {
		if (event.toolName !== "bash") return;

		const command = (event.input as { command?: unknown }).command;
		if (typeof command !== "string") return;

		const violation = findSourceControlViolation(command);
		if (!violation) return;

		return {
			block: true,
			reason:
				`Blocked source-control command: ${violation.command}. ${violation.reason} ` +
				"Direct Git and GitHub CLI access is limited to audited read-only commands; " +
				"use an approved structured tool or report the missing capability.",
		};
	});
}
