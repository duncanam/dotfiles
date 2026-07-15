/**
 * Protected Read Paths Extension
 *
 * Blocks read operations against protected paths.
 *
 * Any file matching *.env* (*.env, .env.local, .env.example, etc.)
 * is ONLY protected when it lives DIRECTLY in the home directory
 * (e.g. ~/.env, ~/.env.local). Subdirectories under ~ are not affected,
 * so project files like ~/git/project/.env are free to read.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

export default function (pi: ExtensionAPI) {
	const home = homedir();
	const resolveInputPath = (input: string, cwd: string) => {
		const normalized = input.startsWith("@") ? input.slice(1) : input;
		if (normalized === "~") return home;
		if (normalized.startsWith("~/")) return resolve(home, normalized.slice(2));
		return resolve(cwd, normalized);
	};

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "read") {
			return undefined;
		}

		const path = resolveInputPath(event.input.path as string, ctx.cwd);
		const isEnvInHomeRoot =
			dirname(path) === home && basename(path).includes(".env");

		if (isEnvInHomeRoot) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked read of protected path: ${path}`, "warning");
			}
			return { block: true, reason: `Path "${path}" is protected` };
		}

		return undefined;
	});
}
