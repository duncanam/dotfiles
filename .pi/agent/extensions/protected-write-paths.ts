/**
 * Protected Write Paths Extension
 *
 * Blocks write and edit operations to protected paths.
 *
 * - .git/ and node_modules/ are globally protected (anywhere on disk).
 * - Any file matching *.env* (*.env, .env.local, .env.example, etc.)
 *   is ONLY protected when it lives DIRECTLY in the home directory
 *   (e.g. ~/.env, ~/.env.local). Subdirectories under ~ are not affected,
 *   so project files like ~/git/project/config.env.example are free to write.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { basename, dirname, resolve, sep } from "node:path";

export default function (pi: ExtensionAPI) {
	const home = homedir();
	const globalProtectedComponents = new Set([".git", "node_modules"]);

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") {
			return undefined;
		}

		const path = resolve(ctx.cwd, event.input.path as string);
		const isGloballyProtected = path
			.split(sep)
			.some((component) => globalProtectedComponents.has(component));

		const isEnvInHomeRoot =
			dirname(path) === home && basename(path).includes(".env");

		if (isGloballyProtected || isEnvInHomeRoot) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
			}
			return { block: true, reason: `Path "${path}" is protected` };
		}

		return undefined;
	});
}
