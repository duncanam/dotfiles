/**
 * Protected Read Paths Extension
 *
 * Blocks read operations against protected paths.
 *
 * Any file matching *.env* (*.env, .env.local, .env.example, etc.)
 * is ONLY protected when it lives DIRECTLY in the home directory
 * (e.g. ~/.env, ~/.env.local). Subdirectories under ~ are not affected,
 * so project files like ~/git/project/.env are free to read.
 *
 * ~/.ssh/ (and everything under it) is protected from reads.
 * ~/obsidian/ (and everything under it) is protected from direct reads.
 * Atomic notes must be accessed through the approved ~/Atomic symlink instead.
 *
 * This is a lexical read-tool guard, not an OS sandbox. It does not inspect
 * the filesystem or resolve symlinks. Other access routes are governed by
 * the privacy instructions in the global AGENTS.md.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { basename, dirname, resolve, sep } from "node:path";

export default function (pi: ExtensionAPI) {
	const home = homedir();
	const sshDir = resolve(home, ".ssh");
	const obsidianDir = resolve(home, "obsidian");
	const isWithin = (path: string, root: string) =>
		path === root || path.startsWith(root + sep);
	// Conservatively deny case aliases on platforms commonly using
	// case-insensitive filesystems.
	const foldForDeny = (path: string) =>
		process.platform === "darwin" || process.platform === "win32"
			? path.toLowerCase()
			: path;
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
		const isUnderSsh = path === sshDir || path.startsWith(sshDir + sep);

		const isUnderObsidian = isWithin(foldForDeny(path), foldForDeny(obsidianDir));

		if (isEnvInHomeRoot || isUnderSsh || isUnderObsidian) {
			if (ctx.hasUI) {
				ctx.ui.notify(`Blocked read of protected path: ${path}`, "warning");
			}
			return { block: true, reason: `Path "${path}" is protected` };
		}

		return undefined;
	});
}
