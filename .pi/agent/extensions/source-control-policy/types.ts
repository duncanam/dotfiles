export interface ShellWord {
	value: string;
	dynamic: boolean;
	start: number;
	end: number;
}

export interface ProgramPolicyDecision {
	allowed: boolean;
	command: string;
	reason?: string;
}

export interface SourceControlViolation {
	program: "git" | "gh";
	command: string;
	reason: string;
}
