import type { ProgramPolicyDecision, ShellWord } from "./types.ts";

/** Git subcommands that only inspect repository state. */
export const ALLOWED_GIT_SUBCOMMANDS = new Set([
	"blame",
	"cat-file",
	"check-attr",
	"check-ignore",
	"describe",
	"diff",
	"for-each-ref",
	"grep",
	"help",
	"log",
	"ls-files",
	"ls-remote",
	"ls-tree",
	"merge-base",
	"name-rev",
	"rev-list",
	"rev-parse",
	"shortlog",
	"show",
	"show-ref",
	"status",
	"version",
]);

const GLOBAL_OPTIONS_WITH_VALUE = new Set([
	"-C",
	"-c",
	"--config-env",
	"--git-dir",
	"--namespace",
	"--work-tree",
]);

const GLOBAL_OPTIONS_WITH_ATTACHED_VALUE = [
	"--config-env=",
	"--exec-path=",
	"--git-dir=",
	"--namespace=",
	"--work-tree=",
];

const GLOBAL_OPTIONS_WITHOUT_VALUE = new Set([
	"-p",
	"-P",
	"--bare",
	"--exec-path",
	"--glob-pathspecs",
	"--html-path",
	"--icase-pathspecs",
	"--info-path",
	"--literal-pathspecs",
	"--man-path",
	"--no-lazy-fetch",
	"--no-optional-locks",
	"--no-pager",
	"--no-replace-objects",
	"--noglob-pathspecs",
	"--paginate",
]);

function blocked(command: string, reason: string): ProgramPolicyDecision {
	return { allowed: false, command, reason };
}

/** Evaluate argv following a statically identified `git` executable. */
export function evaluateGitCommand(argv: readonly ShellWord[]): ProgramPolicyDecision {
	if (argv.length === 1 && !argv[0].dynamic && (argv[0].value === "--help" || argv[0].value === "--version")) {
		return { allowed: true, command: `git ${argv[0].value}` };
	}

	let index = 0;
	while (index < argv.length) {
		const word = argv[index];
		if (word.dynamic) {
			return blocked("git <dynamic>", "The Git subcommand could not be determined statically.");
		}

		const arg = word.value;
		if (GLOBAL_OPTIONS_WITHOUT_VALUE.has(arg)) {
			index += 1;
			continue;
		}

		if (GLOBAL_OPTIONS_WITH_VALUE.has(arg)) {
			if (index + 1 >= argv.length) {
				return blocked(`git ${arg}`, `Git global option ${arg} is missing its value.`);
			}
			index += 2;
			continue;
		}

		if (
			GLOBAL_OPTIONS_WITH_ATTACHED_VALUE.some((prefix) => arg.startsWith(prefix)) ||
			(arg.startsWith("-C") && arg.length > 2) ||
			(arg.startsWith("-c") && arg.length > 2)
		) {
			index += 1;
			continue;
		}

		if (arg.startsWith("-")) {
			return blocked(
				`git ${arg}`,
				`Unrecognized Git global option ${arg}; source-control policy fails closed when parsing is uncertain.`,
			);
		}

		const command = `git ${arg}`;
		if (!ALLOWED_GIT_SUBCOMMANDS.has(arg)) {
			return blocked(command, `Git subcommand ${arg} is not on the read-only allowlist.`);
		}
		return { allowed: true, command };
	}

	return blocked("git <missing-subcommand>", "A read-only Git subcommand is required.");
}
