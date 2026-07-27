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

	if (top === "api") {
		return evaluateGhApiCommand(argv, topResult.next);
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

/**
 * `gh api` is permitted only for read-only GET requests against an explicit
 * endpoint allowlist. gh api defaults to GET but auto-switches to POST when
 * any -f/--raw-field or -F/--field parameter is added, and -X/--method or
 * --input can change the method or attach a body directly. Those flags are
 * blocked, so every permitted invocation is a GET that cannot mutate state.
 */
const GH_API_VALUE_OPTIONS = new Set([
	"--cache",
	"-F",
	"--field",
	"-H",
	"--header",
	"--hostname",
	"--input",
	"-q",
	"--jq",
	"-X",
	"--method",
	"-p",
	"--preview",
	"-R",
	"--repo",
	"-f",
	"--raw-field",
	"-t",
	"--template",
]);

const GH_API_ATTACHED_VALUE_PREFIXES = [
	"--cache=",
	"--field=",
	"--header=",
	"--hostname=",
	"--input=",
	"--jq=",
	"--method=",
	"--preview=",
	"--repo=",
	"--raw-field=",
	"--template=",
];

const GH_API_BOOLEAN_OPTIONS = new Set([
	"-h",
	"--help",
	"-i",
	"--include",
	"--paginate",
	"--silent",
	"--slurp",
	"--verbose",
]);

/** Flags that change the HTTP method or attach a request body or parameters. */
const GH_API_FORBIDDEN_VALUE_OPTIONS = new Set([
	"-X",
	"--method",
	"-f",
	"--raw-field",
	"-F",
	"--field",
	"--input",
]);

const GH_API_FORBIDDEN_ATTACHED_PREFIXES = ["--method=", "--raw-field=", "--field=", "--input="];

/**
 * Endpoint path patterns permitted for `gh api` GET requests. `:name` slots
 * match any single non-empty path segment.
 */
const GH_API_ENDPOINT_PATTERNS: ReadonlyArray<ReadonlyArray<string>> = [
	["repos", ":owner", ":repo", "commits", ":ref"],
	["repos", ":owner", ":repo", "tags"],
	["repos", ":owner", ":repo", "pulls", ":pull", "comments"],
];

function isAllowedGhApiEndpoint(rawEndpoint: string): boolean {
	const queryIndex = rawEndpoint.indexOf("?");
	const path = queryIndex < 0 ? rawEndpoint : rawEndpoint.slice(0, queryIndex);
	const segments = path.split("/");
	return GH_API_ENDPOINT_PATTERNS.some((pattern) => {
		if (segments.length !== pattern.length) return false;
		return segments.every((segment, index) => {
			const slot = pattern[index];
			return slot.startsWith(":") ? segment.length > 0 : segment === slot;
		});
	});
}

function evaluateGhApiCommand(argv: readonly ShellWord[], start: number): ProgramPolicyDecision {
	let index = start;
	let endpoint: ShellWord | undefined;
	let helpRequested = false;

	while (index < argv.length) {
		const word = argv[index];
		if (word.dynamic) {
			return blocked("gh api <dynamic>", "The gh api endpoint or flag could not be determined statically.");
		}
		const arg = word.value;

		if (arg === "--") {
			index += 1;
			while (index < argv.length) {
				const positional = argv[index];
				if (positional.dynamic) {
					return blocked("gh api <dynamic>", "The gh api endpoint could not be determined statically.");
				}
				if (endpoint) {
					return blocked("gh api <extra-arg>", "Only a single endpoint may be passed to gh api.");
				}
				endpoint = positional;
				index += 1;
			}
			break;
		}

		if (arg.startsWith("-")) {
			const attachedPrefix = GH_API_ATTACHED_VALUE_PREFIXES.find((prefix) => arg.startsWith(prefix));
			if (attachedPrefix) {
				if (GH_API_FORBIDDEN_ATTACHED_PREFIXES.includes(attachedPrefix)) {
					return blocked(
						`gh api ${arg}`,
						`gh api flag ${attachedPrefix.slice(0, -1)} can change the HTTP method or attach a request body; only read-only GET requests are permitted.`,
					);
				}
				index += 1;
				continue;
			}
			if (GH_API_VALUE_OPTIONS.has(arg)) {
				if (GH_API_FORBIDDEN_VALUE_OPTIONS.has(arg)) {
					return blocked(
						`gh api ${arg}`,
						`gh api flag ${arg} can change the HTTP method or attach a request body; only read-only GET requests are permitted.`,
					);
				}
				if (index + 1 >= argv.length) {
					return blocked(`gh api ${arg}`, `gh api flag ${arg} is missing its value.`);
				}
				index += 2;
				continue;
			}
			if (GH_API_BOOLEAN_OPTIONS.has(arg)) {
				if (arg === "-h" || arg === "--help") helpRequested = true;
				index += 1;
				continue;
			}
			return blocked(
				`gh api ${arg}`,
				`Unrecognized gh api option ${arg}; source-control policy fails closed when parsing is uncertain.`,
			);
		}

		if (endpoint) {
			return blocked("gh api <extra-arg>", "Only a single endpoint may be passed to gh api.");
		}
		endpoint = word;
		index += 1;
	}

	if (helpRequested) {
		return { allowed: true, command: "gh api --help" };
	}
	if (!endpoint) {
		return blocked("gh api <missing-endpoint>", "A read-only GET endpoint is required for gh api.");
	}
	if (!isAllowedGhApiEndpoint(endpoint.value)) {
		return blocked(`gh api ${endpoint.value}`, "The gh api endpoint is not on the read-only allowlist.");
	}
	return { allowed: true, command: "gh api" };
}
