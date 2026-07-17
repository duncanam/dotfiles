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
 * - ~/.ssh/ (and everything under it) is protected from writes/edits.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { basename, dirname, resolve, sep } from "node:path";

export default function (pi: ExtensionAPI) {
	const home = homedir();
	const sshDir = resolve(home, ".ssh");
	const globalProtectedComponents = new Set([".git", "node_modules"]);
	const resolveInputPath = (input: string, cwd: string) => {
		const normalized = input.startsWith("@") ? input.slice(1) : input;
		if (normalized === "~") return home;
		if (normalized.startsWith("~/")) return resolve(home, normalized.slice(2));
		return resolve(cwd, normalized);
	};

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "write" && event.toolName !== "edit") {
			return undefined;
		}

		const path = resolveInputPath(event.input.path as string, ctx.cwd);
		const isGloballyProtected = path
			.split(sep)
			.some((component) => globalProtectedComponents.has(component));

		const isEnvInHomeRoot =
			dirname(path) === home && basename(path).includes(".env");
		const isUnderSsh = path === sshDir || path.startsWith(sshDir + sep);

		if (isGloballyProtected || isEnvInHomeRoot || isUnderSsh) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
			}
			return { block: true, reason: `Path "${path}" is protected` };
		}

		return undefined;
	});
}
