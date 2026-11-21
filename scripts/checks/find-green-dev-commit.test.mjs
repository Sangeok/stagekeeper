import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, find, originRepository, parse, render } from "./find-green-dev-commit.mjs";

const run = (file, conclusion, overrides = {}) => ({ path: `.github/workflows/${file}`, status: conclusion === null ? "in_progress" : "completed", conclusion, run_number: 1, run_attempt: 1, ...overrides });
const all = conclusion => ["check.yml", "windows-role-runtime.yml", "macos-runtime-contracts.yml"].map(file => run(file, conclusion));

test("a commit is green only when every post-merge workflow finished in success", () => {
  assert.deepEqual(classify(all("success")), { state: "green", detail: "" });
  assert.deepEqual(classify([...all("success").slice(0, 2), run("macos-runtime-contracts.yml", "failure")]), { state: "failed", detail: "macos-runtime-contracts.yml failure" });
  assert.deepEqual(classify([...all("success").slice(0, 2), run("macos-runtime-contracts.yml", null)]), { state: "pending", detail: "macos-runtime-contracts.yml" });
  assert.deepEqual(classify(all("success").slice(0, 2)), { state: "missing", detail: "macos-runtime-contracts.yml" });
  assert.equal(classify([...all("success"), run("agent-eval.yml", "failure")]).state, "green");
});

test("the latest attempt of a workflow decides, so a rerun that passed makes the commit green", () => {
  assert.equal(classify([...all("success").slice(1), run("check.yml", "failure"), run("check.yml", "success", { run_attempt: 2 })]).state, "green");
  assert.equal(classify([...all("success").slice(1), run("check.yml", "success"), run("check.yml", "failure", { run_number: 2 })]).state, "failed");
});

test("returns the newest green commit and the newer commits it leaves out, and asks no further", async () => {
  const commits = ["c", "b", "a"].map(letter => ({ sha: letter.repeat(40), subject: `commit ${letter}` }));
  const asked = [];
  const runs = { c: all("failure"), b: all("success"), a: all("success") };
  const result = await find(commits, async sha => { asked.push(sha[0]); return runs[sha[0]]; });
  assert.equal(result.green.sha, "b".repeat(40));
  assert.deepEqual(result.skipped.map(commit => [commit.sha[0], commit.state]), [["c", "failed"]]);
  assert.deepEqual(asked, ["c", "b"]);
  const text = render(result, 30);
  assert.ok(text.startsWith("b".repeat(40)) && text.includes("ccccccc failed"));
  assert.equal((await find(commits.slice(0, 1), async () => all("failure"))).green, null);
});

test("accepts only its documented arguments and reads the repository from a GitHub origin", () => {
  assert.deepEqual(parse(["--limit", "5", "--json"]), { limit: 5, json: true });
  for (const argv of [["--limit"], ["--limit", "0"], ["--unknown"]]) assert.throws(() => parse(argv), /Usage/);
  assert.equal(originRepository("https://github.com/owner/name.git"), "owner/name");
  assert.equal(originRepository("git@github.com:owner/name"), "owner/name");
  assert.throws(() => originRepository("https://example.test/owner/name.git"));
});
