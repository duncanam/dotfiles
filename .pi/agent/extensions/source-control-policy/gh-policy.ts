import type { ProgramPolicyDecision, ShellWord } from "./types.ts";

/** Complete gh command paths that only inspect GitHub state. */
export const ALLOWED_GH_COMMANDS = new Set([
	"auth status",
	"issue list",
	"issue status",
	"issue view",
	"pr checks",
	"pr diff",
	"pr list",
	"pr status",
	"pr view",
	"release list",
	"release view",
	"repo view",
	"run list",
	"run view",
	"run watch",
	"search code",
	"search commits",
	"search issues",
	"search prs",
	"search repos",
	"workflow list",
	"workflow view",
]);

const ALLOWED_TOP_LEVEL_COMMANDS = new Set(["help", "status", "version"]);
const CONTEXT_OPTIONS_WITH_VALUE = new Set(["-R", "--hostname", "--repo"]);
const CONTEXT_OPTIONS_WITH_ATTACHED_VALUE = ["--hostname=", "--repo="];

function blocked(command: string, reason: string): ProgramPolicyDecision {
	return { allowed: false, command, reason };
}

function skipContextOption(argv: readonly ShellWord[], index: number): number | undefined {
	const word = argv[index];
	if (word.dynamic) return undefined;
	const arg = word.value;

	if (CONTEXT_OPTIONS_WITH_VALUE.has(arg)) {
		return index + 1 < argv.length ? index + 2 : undefined;
	}
	if (CONTEXT_OPTIONS_WITH_ATTACHED_VALUE.some((prefix) => arg.startsWith(prefix))) {
		return index + 1;
	}
	if (arg.startsWith("-R") && arg.length > 2) {
		return index + 1;
	}
	return undefined;
}

function nextCommandWord(
	argv: readonly ShellWord[],
	start: number,
): { word: ShellWord; next: number } | ProgramPolicyDecision {
	let index = start;
	while (index < argv.length) {
		const skipped = skipContextOption(argv, index);
		if (skipped !== undefined) {
			index = skipped;
			continue;
		}

		const word = argv[index];
		if (word.dynamic) {
			return blocked("gh <dynamic>", "The GitHub CLI command could not be determined statically.");
		}
		if (word.value.startsWith("-")) {
			return blocked(
				`gh ${word.value}`,
				`Unrecognized gh global option ${word.value}; source-control policy fails closed when parsing is uncertain.`,
			);
		}
		return { word, next: index + 1 };
	}

	return blocked("gh <missing-command>", "A read-only GitHub CLI command is required.");
}

function isDecision(value: { word: ShellWord; next: number } | ProgramPolicyDecision): value is ProgramPolicyDecision {
	return "allowed" in value;
}

/** Evaluate argv following a statically identified `gh` executable. */
export function evaluateGhCommand(argv: readonly ShellWord[]): ProgramPolicyDecision {
	if (argv.length === 1 && !argv[0].dynamic && (argv[0].value === "--help" || argv[0].value === "--version")) {
		return { allowed: true, command: `gh ${argv[0].value}` };
	}

	const topResult = nextCommandWord(argv, 0);
	if (isDecision(topResult)) return topResult;
	const top = topResult.word.value;

	if (ALLOWED_TOP_LEVEL_COMMANDS.has(top)) {
		return { allowed: true, command: `gh ${top}` };
	}

	const subResult = nextCommandWord(argv, topResult.next);
	if (isDecision(subResult)) return subResult;
	const command = `${top} ${subResult.word.value}`;

	if (!ALLOWED_GH_COMMANDS.has(command)) {
		return blocked(`gh ${command}`, `GitHub CLI command ${command} is not on the read-only allowlist.`);
	}

	if (
		command === "auth status" &&
		argv.some(
			(word) =>
				!word.dynamic &&
				(word.value === "--show-token" ||
					(word.value.startsWith("-") && !word.value.startsWith("--") && word.value.includes("t"))),
		)
	) {
		return blocked("gh auth status --show-token", "Displaying authentication tokens is not permitted.");
	}

	return { allowed: true, command: `gh ${command}` };
}
