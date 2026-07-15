import assert from "node:assert/strict";
import test from "node:test";
import { findSourceControlViolation } from "./shell-policy.ts";

const ALLOWED_COMMANDS = [
	"git status --short",
	"git --no-pager -C '/tmp/a repo' diff --stat",
	"git -c color.ui=false log -5",
	"/usr/bin/git show HEAD:README.md",
	'"git" rev-parse --show-toplevel',
	"git status 2>/dev/null | head -20",
	"printf '%s' \"$(git rev-parse HEAD)\"",
	"if git status --short; then git diff --stat; fi",
	"gh status",
	"gh pr view 123 --json title,state",
	"gh -R owner/repo pr checks 123",
	"gh issue list --limit 10",
	"gh run watch 123",
	"git status && gh repo view owner/repo",
	"echo 'git reset --hard'",
	"printf '%s\\n' gh pr merge",
	"rg 'git push|gh api' .",
	"echo ok # git reset --hard",
	"command -v git",
];

const BLOCKED_COMMANDS: Array<[string, "git" | "gh", string]> = [
	["git reset --hard", "git", "git reset"],
	["git -C /tmp/repo checkout main", "git", "git checkout"],
	["/usr/bin/git push origin main", "git", "git push"],
	['"git" clean -fdx', "git", "git clean"],
	["command git commit -m test", "git", "git commit"],
	["env FOO=bar git stash", "git", "git stash"],
	["sudo -u root git branch -D old", "git", "git branch"],
	["echo \"$(git cherry-pick HEAD)\"", "git", "git cherry-pick"],
	["bash -lc 'git restore .'", "git", "git restore"],
	["git made-up-command", "git", "git made-up-command"],
	["git $(printf reset) --hard", "git", "git <dynamic>"],
	["gh pr merge 123", "gh", "gh pr merge"],
	["gh -R owner/repo pr checkout 123", "gh", "gh pr checkout"],
	["gh repo sync owner/repo", "gh", "gh repo sync"],
	["gh api repos/owner/repo", "gh", "gh api repos/owner/repo"],
	["gh auth status --show-token", "gh", "gh auth status --show-token"],
	["gh auth status -t", "gh", "gh auth status --show-token"],
	["gh co 123", "gh", "gh co 123"],
	["git status && gh issue close 123", "gh", "gh issue close"],
	["find . -exec git reset --hard {} \\;", "git", "git reset"],
];

test("allows audited read-only source-control commands without matching quoted prose", async (t) => {
	for (const command of ALLOWED_COMMANDS) {
		await t.test(command, () => {
			assert.equal(findSourceControlViolation(command), undefined);
		});
	}
});

test("blocks mutating, unknown, nested, and token-revealing commands", async (t) => {
	for (const [command, program, expectedCommand] of BLOCKED_COMMANDS) {
		await t.test(command, () => {
			const violation = findSourceControlViolation(command);
			assert.ok(violation, `expected a violation for: ${command}`);
			assert.equal(violation.program, program);
			assert.equal(violation.command, expectedCommand);
		});
	}
});
