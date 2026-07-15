import { evaluateGhCommand } from "./gh-policy.ts";
import { evaluateGitCommand } from "./git-policy.ts";
import type { ShellWord, SourceControlViolation } from "./types.ts";

interface WordToken extends ShellWord {
	kind: "word";
}

interface SyntaxToken {
	kind: "control" | "redirect";
	value: string;
	start: number;
	end: number;
}

type ShellToken = WordToken | SyntaxToken;

interface LexResult {
	tokens: ShellToken[];
	nestedCommands: string[];
}

const CONTROL_OPERATORS = [";;&", "&&", "||", "|&", ";;", ";&", ";", "|", "&", "(", ")"];
const REDIRECT_OPERATORS = ["&>>", "<<<", "<<-", "&>", ">>", "<<", "<>", ">&", "<&", ">|", ">", "<"];
const DYNAMIC_MARKER = "\uFFFD";
const MAX_NESTING_DEPTH = 12;

function operatorAt(source: string, index: number, operators: readonly string[]): string | undefined {
	return operators.find((operator) => source.startsWith(operator, index));
}

function findClosingBacktick(source: string, openIndex: number): { inner: string; end: number; closed: boolean } {
	let index = openIndex + 1;
	while (index < source.length) {
		if (source[index] === "\\") {
			index += 2;
			continue;
		}
		if (source[index] === "`") {
			return { inner: source.slice(openIndex + 1, index), end: index + 1, closed: true };
		}
		index += 1;
	}
	return { inner: source.slice(openIndex + 1), end: source.length, closed: false };
}

function findClosingParenthesis(source: string, openIndex: number): { inner: string; end: number; closed: boolean } {
	let depth = 1;
	let index = openIndex + 1;

	while (index < source.length) {
		const char = source[index];
		if (char === "\\") {
			index += 2;
			continue;
		}
		if (char === "'") {
			const close = source.indexOf("'", index + 1);
			if (close < 0) return { inner: source.slice(openIndex + 1), end: source.length, closed: false };
			index = close + 1;
			continue;
		}
		if (char === '"') {
			index += 1;
			while (index < source.length) {
				if (source[index] === "\\") {
					index += 2;
					continue;
				}
				if (source.startsWith("$(", index) && !source.startsWith("$((", index)) {
					const nested = findClosingParenthesis(source, index + 1);
					index = nested.end;
					continue;
				}
				if (source[index] === "`") {
					index = findClosingBacktick(source, index).end;
					continue;
				}
				if (source[index] === '"') {
					index += 1;
					break;
				}
				index += 1;
			}
			continue;
		}
		if (char === "`") {
			index = findClosingBacktick(source, index).end;
			continue;
		}
		if (
			char === "#" &&
			(index === openIndex + 1 || /[\s;&|()]/.test(source[index - 1] ?? ""))
		) {
			const newline = source.indexOf("\n", index + 1);
			index = newline < 0 ? source.length : newline + 1;
			continue;
		}
		if (char === "(") {
			depth += 1;
			index += 1;
			continue;
		}
		if (char === ")") {
			depth -= 1;
			if (depth === 0) {
				return { inner: source.slice(openIndex + 1, index), end: index + 1, closed: true };
			}
		}
		index += 1;
	}

	return { inner: source.slice(openIndex + 1), end: source.length, closed: false };
}

function lexShell(source: string): LexResult {
	const tokens: ShellToken[] = [];
	const nestedCommands: string[] = [];
	let index = 0;

	const parseWord = (): WordToken => {
		const start = index;
		let value = "";
		let dynamic = false;

		const appendDynamic = (): void => {
			dynamic = true;
			value += DYNAMIC_MARKER;
		};

		const parseDoubleQuoted = (): void => {
			index += 1;
			while (index < source.length) {
				const char = source[index];
				if (char === '"') {
					index += 1;
					return;
				}
				if (char === "\\") {
					const next = source[index + 1];
					if (next === "$" || next === "`" || next === '"' || next === "\\") {
						value += next;
						index += 2;
						continue;
					}
					if (next === "\n") {
						index += 2;
						continue;
					}
					value += "\\";
					index += 1;
					continue;
				}
				if (source.startsWith("$(", index)) {
					if (source.startsWith("$((", index)) {
						const arithmetic = findClosingParenthesis(source, index + 1);
						appendDynamic();
						index = arithmetic.end;
						continue;
					}
					const nested = findClosingParenthesis(source, index + 1);
					nestedCommands.push(nested.inner);
					appendDynamic();
					index = nested.end;
					continue;
				}
				if (char === "`") {
					const nested = findClosingBacktick(source, index);
					nestedCommands.push(nested.inner);
					appendDynamic();
					index = nested.end;
					continue;
				}
				if (char === "$") {
					appendDynamic();
					index += 1;
					if (source[index] === "{") {
						let depth = 1;
						index += 1;
						while (index < source.length && depth > 0) {
							if (source[index] === "{") depth += 1;
							else if (source[index] === "}") depth -= 1;
							index += 1;
						}
					} else {
						while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
					}
					continue;
				}
				value += char;
				index += 1;
			}
		};

		while (index < source.length) {
			const char = source[index];
			if (/\s/.test(char)) break;
			if (operatorAt(source, index, CONTROL_OPERATORS) || operatorAt(source, index, REDIRECT_OPERATORS)) {
				if (!((char === "<" || char === ">") && source[index + 1] === "(")) break;
			}

			if (char === "'") {
				const close = source.indexOf("'", index + 1);
				if (close < 0) {
					value += source.slice(index + 1);
					index = source.length;
					break;
				}
				value += source.slice(index + 1, close);
				index = close + 1;
				continue;
			}
			if (char === '"') {
				parseDoubleQuoted();
				continue;
			}
			if (char === "\\") {
				if (source[index + 1] === "\n") {
					index += 2;
					continue;
				}
				if (index + 1 < source.length) {
					value += source[index + 1];
					index += 2;
					continue;
				}
				value += char;
				index += 1;
				continue;
			}
			if (source.startsWith("$(", index)) {
				if (source.startsWith("$((", index)) {
					const arithmetic = findClosingParenthesis(source, index + 1);
					appendDynamic();
					index = arithmetic.end;
					continue;
				}
				const nested = findClosingParenthesis(source, index + 1);
				nestedCommands.push(nested.inner);
				appendDynamic();
				index = nested.end;
				continue;
			}
			if ((char === "<" || char === ">") && source[index + 1] === "(") {
				const nested = findClosingParenthesis(source, index + 1);
				nestedCommands.push(nested.inner);
				appendDynamic();
				index = nested.end;
				continue;
			}
			if (char === "`") {
				const nested = findClosingBacktick(source, index);
				nestedCommands.push(nested.inner);
				appendDynamic();
				index = nested.end;
				continue;
			}
			if (char === "$" && (source[index + 1] === "'" || source[index + 1] === '"')) {
				appendDynamic();
				index += 1;
				if (source[index] === '"') parseDoubleQuoted();
				else {
					const close = source.indexOf("'", index + 1);
					index = close < 0 ? source.length : close + 1;
				}
				continue;
			}
			if (char === "$") {
				appendDynamic();
				index += 1;
				if (source[index] === "{") {
					let depth = 1;
					index += 1;
					while (index < source.length && depth > 0) {
						if (source[index] === "{") depth += 1;
						else if (source[index] === "}") depth -= 1;
						index += 1;
					}
				} else {
					while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
				}
				continue;
			}

			value += char;
			index += 1;
		}

		return { kind: "word", value, dynamic, start, end: index };
	};

	while (index < source.length) {
		if (source[index] === "\n") {
			tokens.push({ kind: "control", value: "\n", start: index, end: index + 1 });
			index += 1;
			continue;
		}
		if (/\s/.test(source[index])) {
			index += 1;
			continue;
		}
		if (source[index] === "#") {
			const newline = source.indexOf("\n", index + 1);
			index = newline < 0 ? source.length : newline;
			continue;
		}
		if ((source[index] === "<" || source[index] === ">") && source[index + 1] === "(") {
			tokens.push(parseWord());
			continue;
		}

		const redirect = operatorAt(source, index, REDIRECT_OPERATORS);
		if (redirect) {
			tokens.push({ kind: "redirect", value: redirect, start: index, end: index + redirect.length });
			index += redirect.length;
			continue;
		}
		const control = operatorAt(source, index, CONTROL_OPERATORS);
		if (control) {
			tokens.push({ kind: "control", value: control, start: index, end: index + control.length });
			index += control.length;
			continue;
		}

		tokens.push(parseWord());
	}

	return { tokens, nestedCommands };
}

function removeRedirections(tokens: readonly ShellToken[]): ShellWord[] {
	const words: ShellWord[] = [];
	let index = 0;
	while (index < tokens.length) {
		const token = tokens[index];
		if (
			token.kind === "word" &&
			/^\d+$/.test(token.value) &&
			tokens[index + 1]?.kind === "redirect" &&
			token.end === tokens[index + 1].start
		) {
			index += 2;
			if (tokens[index]?.kind === "word") index += 1;
			continue;
		}
		if (token.kind === "redirect") {
			index += 1;
			if (tokens[index]?.kind === "word") index += 1;
			continue;
		}
		if (token.kind === "word") words.push(token);
		index += 1;
	}
	return words;
}

function isAssignment(word: ShellWord): boolean {
	return /^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(word.value);
}

function executableName(word: ShellWord | undefined): string | undefined {
	if (!word || word.dynamic) return undefined;
	const normalized = word.value.replace(/\\/g, "/");
	const basename = normalized.slice(normalized.lastIndexOf("/") + 1).toLowerCase();
	return basename.endsWith(".exe") ? basename.slice(0, -4) : basename;
}

function directViolation(words: readonly ShellWord[]): SourceControlViolation | undefined {
	const program = executableName(words[0]);
	if (program !== "git" && program !== "gh") return undefined;
	const decision = program === "git" ? evaluateGitCommand(words.slice(1)) : evaluateGhCommand(words.slice(1));
	if (decision.allowed) return undefined;
	return {
		program,
		command: decision.command,
		reason: decision.reason ?? `${program} command is not allowed.`,
	};
}

function skipAssignments(words: readonly ShellWord[], start = 0): number {
	let index = start;
	while (index < words.length && isAssignment(words[index])) index += 1;
	return index;
}

function inspectCommandWrapper(words: readonly ShellWord[], depth: number): SourceControlViolation | undefined {
	let index = 1;
	let queryOnly = false;
	while (index < words.length) {
		const arg = words[index];
		if (arg.dynamic || !arg.value.startsWith("-")) break;
		if (arg.value === "--") {
			index += 1;
			break;
		}
		if (arg.value.includes("v") || arg.value.includes("V")) queryOnly = true;
		index += 1;
	}
	if (queryOnly) return undefined;
	return inspectWords(words.slice(index), depth);
}

function inspectEnvWrapper(words: readonly ShellWord[], depth: number): SourceControlViolation | undefined {
	let index = 1;
	while (index < words.length) {
		const arg = words[index];
		if (isAssignment(arg)) {
			index += 1;
			continue;
		}
		if (arg.dynamic) return undefined;
		if (arg.value === "--") {
			index += 1;
			break;
		}
		if (arg.value === "-S" || arg.value === "--split-string") {
			return words[index + 1] ? inspectShellInternal(words[index + 1].value, depth + 1) : undefined;
		}
		if (arg.value.startsWith("--split-string=")) {
			return inspectShellInternal(arg.value.slice("--split-string=".length), depth + 1);
		}
		if (["-u", "--unset", "-C", "--chdir", "--argv0"].includes(arg.value)) {
			index += 2;
			continue;
		}
		if (["--unset=", "--chdir=", "--argv0="].some((prefix) => arg.value.startsWith(prefix))) {
			index += 1;
			continue;
		}
		if (arg.value.startsWith("-")) {
			index += 1;
			continue;
		}
		break;
	}
	return inspectWords(words.slice(index), depth);
}

function inspectOptionWrapper(
	words: readonly ShellWord[],
	depth: number,
	optionsWithValue: ReadonlySet<string>,
	attachedValuePrefixes: readonly string[] = [],
): SourceControlViolation | undefined {
	let index = 1;
	while (index < words.length) {
		const arg = words[index];
		if (arg.dynamic) return undefined;
		if (arg.value === "--") {
			index += 1;
			break;
		}
		if (optionsWithValue.has(arg.value)) {
			index += 2;
			continue;
		}
		if (attachedValuePrefixes.some((prefix) => arg.value.startsWith(prefix))) {
			index += 1;
			continue;
		}
		if (arg.value.startsWith("-")) {
			index += 1;
			continue;
		}
		break;
	}
	return inspectWords(words.slice(index), depth);
}

function inspectShellWrapper(words: readonly ShellWord[], depth: number): SourceControlViolation | undefined {
	for (let index = 1; index < words.length; index += 1) {
		const arg = words[index];
		if (arg.dynamic || !arg.value.startsWith("-") || arg.value === "--") return undefined;
		if (arg.value.slice(1).includes("c")) {
			const script = words[index + 1];
			return script ? inspectShellInternal(script.value, depth + 1) : undefined;
		}
	}
	return undefined;
}

function inspectWords(inputWords: readonly ShellWord[], depth: number): SourceControlViolation | undefined {
	const start = skipAssignments(inputWords);
	if (start >= inputWords.length) return undefined;
	const words = inputWords.slice(start);

	const direct = directViolation(words);
	if (direct) return direct;
	const executable = executableName(words[0]);
	if (!executable) return undefined;

	if (["!", "do", "elif", "else", "if", "then", "until", "while", "{"].includes(executable)) {
		return inspectWords(words.slice(1), depth);
	}
	if (executable === "command") return inspectCommandWrapper(words, depth);
	if (executable === "env") return inspectEnvWrapper(words, depth);
	if (["bash", "dash", "ksh", "sh", "zsh"].includes(executable)) return inspectShellWrapper(words, depth);
	if (executable === "eval") {
		return inspectShellInternal(words.slice(1).map((word) => word.value).join(" "), depth + 1);
	}
	if (executable === "exec") {
		return inspectOptionWrapper(words, depth, new Set(["-a"]));
	}
	if (executable === "nohup") {
		return inspectOptionWrapper(words, depth, new Set());
	}
	if (executable === "time") {
		return inspectOptionWrapper(words, depth, new Set(["-f", "-o", "--format", "--output"]), ["--format=", "--output="]);
	}
	if (executable === "nice") {
		return inspectOptionWrapper(words, depth, new Set(["-n", "--adjustment"]), ["--adjustment="]);
	}
	if (executable === "sudo") {
		return inspectOptionWrapper(
			words,
			depth,
			new Set([
				"-C", "-D", "-g", "-h", "-p", "-R", "-r", "-T", "-t", "-U", "-u",
				"--chdir", "--close-from", "--group", "--host", "--other-user", "--prompt",
				"--role", "--type", "--user",
			]),
			[
				"--chdir=", "--close-from=", "--group=", "--host=", "--other-user=", "--prompt=",
				"--role=", "--type=", "--user=",
			],
		);
	}
	if (executable === "xargs") {
		return inspectOptionWrapper(
			words,
			depth,
			new Set([
				"-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s", "--arg-file", "--delimiter",
				"--eof", "--max-args", "--max-chars", "--max-lines", "--max-procs", "--replace",
			]),
			[
				"--arg-file=", "--delimiter=", "--eof=", "--max-args=", "--max-chars=",
				"--max-lines=", "--max-procs=", "--replace=",
			],
		);
	}
	if (executable === "find") {
		for (let index = 1; index < words.length; index += 1) {
			if (!words[index].dynamic && (words[index].value === "-exec" || words[index].value === "-execdir")) {
				return inspectWords(words.slice(index + 1), depth);
			}
		}
	}

	return undefined;
}

function inspectShellInternal(command: string, depth: number): SourceControlViolation | undefined {
	if (depth > MAX_NESTING_DEPTH) return undefined;
	const lexed = lexShell(command);
	let simpleCommand: ShellToken[] = [];

	for (const token of lexed.tokens) {
		if (token.kind === "control") {
			const violation = inspectWords(removeRedirections(simpleCommand), depth);
			if (violation) return violation;
			simpleCommand = [];
		} else {
			simpleCommand.push(token);
		}
	}

	const trailingViolation = inspectWords(removeRedirections(simpleCommand), depth);
	if (trailingViolation) return trailingViolation;

	for (const nested of lexed.nestedCommands) {
		const violation = inspectShellInternal(nested, depth + 1);
		if (violation) return violation;
	}
	return undefined;
}

/** Return the first disallowed Git or GitHub CLI invocation in a shell command. */
export function findSourceControlViolation(command: string): SourceControlViolation | undefined {
	return inspectShellInternal(command, 0);
}
