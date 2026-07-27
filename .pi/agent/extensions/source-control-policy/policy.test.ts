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
	"gh api repos/NVlabs/cuda-oxide/commits/abc123",
	"gh api repos/NVlabs/cuda-oxide/commits/abc123?per_page=1",
	"gh api repos/NVlabs/cuda-oxide/tags",
	"gh api repos/NVlabs/cuda-oxide/tags --paginate",
	"gh api repos/NVlabs/cuda-oxide/tags --jq '.[].name'",
	"gh api repos/NVlabs/cuda-oxide/tags -i",
	"gh api --help",
	"gh -R NVlabs/cuda-oxide api repos/NVlabs/cuda-oxide/tags",
	"gh api -R NVlabs/cuda-oxide repos/NVlabs/cuda-oxide/tags",
	"gh api repos/Atomic-Industries/crab-rave/pulls/201/comments",
	"gh api repos/o/r/pulls/201/comments?per_page=100",
	"gh api repos/o/r/pulls/201/comments --jq '.[].body'",
	"gh api repos/o/r/pulls/201/comments --paginate",
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
	["gh api -X POST repos/o/r/tags", "gh", "gh api -X"],
	["gh api repos/o/r/tags -X POST", "gh", "gh api -X"],
	["gh api --method=DELETE repos/o/r/tags", "gh", "gh api --method=DELETE"],
	["gh api repos/o/r/tags -f key=val", "gh", "gh api -f"],
	["gh api repos/o/r/tags -F key=val", "gh", "gh api -F"],
	["gh api repos/o/r/tags --input body.json", "gh", "gh api --input"],
	["gh api repos/o/r/tags --raw-field=x=1", "gh", "gh api --raw-field=x=1"],
	["gh api repos/o/r/tags --field=x=1", "gh", "gh api --field=x=1"],
	["gh api repos/o/r/tags -XPOST", "gh", "gh api -XPOST"],
	["gh api repos/o/r/contents/secret", "gh", "gh api repos/o/r/contents/secret"],
	["gh api repos/o/r", "gh", "gh api repos/o/r"],
	["gh api repos/o/r/commits/$SHA", "gh", "gh api <dynamic>"],
	["gh api graphql -f query=q", "gh", "gh api -f"],
	["gh api repos/o/r/pulls/201/comments/5/replies", "gh", "gh api repos/o/r/pulls/201/comments/5/replies"],
	["gh api repos/o/r/issues/201/comments", "gh", "gh api repos/o/r/issues/201/comments"],
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
