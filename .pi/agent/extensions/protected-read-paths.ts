/**
 * Protected Read Paths Extension
 *
 * Blocks read operations against protected paths.
 * Useful for preventing accidental exposure of secrets (e.g. .env files).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const protectedPaths = [".env"];

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "read") {
			return undefined;
		}

		const path = event.input.path as string;
		const isProtected = protectedPaths.some((p) => path.includes(p));

		if (isProtected) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked read of protected path: ${path}`, "warning");
			}
			return { block: true, reason: `Path "${path}" is protected` };
		}

		return undefined;
	});
}
