export const URL = "https://github.com/acme/widgets/pull/42";
export const HEAD = "a".repeat(40);
export const NEXT_HEAD = "b".repeat(40);
export function comment(id = "c1", body = "Please add a regression test") {
	return { id, body, url: `${URL}#issuecomment-${id}`, author: { login: "reviewer" } };
}
export function check(conclusion = "FAILURE", run = 1) {
	return { __typename: "CheckRun", status: "COMPLETED", conclusion, name: "unit tests", workflowName: "CI", startedAt: `start-${run}`, completedAt: `end-${run}`, detailsUrl: `https://github.com/acme/widgets/actions/runs/${run}/job/100` };
}
export function pr(overrides: Record<string, any> = {}): Record<string, any> {
	return { number: 42, url: URL, state: "OPEN", headRefName: "fix-tests", headRefOid: HEAD, comments: [], reviews: [], statusCheckRollup: [], ...overrides };
}
