import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fixture } from "./testing/closeout-fixture.mjs";
import { context } from "./git-workspace.mjs";
import { inspectReadiness } from "./github-merge.mjs";

test("GraphQL required-check discovery distinguishes no requirements from malformed or incomplete responses", async t => {
  const f = fixture(t), ctx = await context(f.root);
  const make = (nodes, hasNextPage = false, endCursor = null) => ({ status: 200, data: { data: { repository: { pullRequest: { number: 1, headRefOid: f.base,
    mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", reviewDecision: null,
    commits: { nodes: [{ commit: { oid: f.base, statusCheckRollup: { contexts: { nodes, pageInfo: { hasNextPage, endCursor } } } } }] } } } } } });
  let calls = 0;
  ctx.ports.github = { request: async (method, route, body) => {
    assert.equal(method, "POST"); assert.equal(route, "graphql"); assert.equal(body.variables.number, 1); calls++;
    return make([{ __typename: "CheckRun", id: "one", isRequired: false, status: "COMPLETED", conclusion: "SUCCESS" }]);
  } };
  const none = await inspectReadiness(ctx, 1, f.base); assert.deepEqual(none.required, []); assert.equal(calls, 1);
  ctx.ports.github.request = async () => make([{ __typename: "CheckRun", id: "one", status: "COMPLETED", conclusion: "SUCCESS" }]);
  await assert.rejects(() => inspectReadiness(ctx, 1, f.base), { code: "required-checks-unverified" });
  calls = 0;
  ctx.ports.github.request = async () => { calls++; return make([{ __typename: "StatusContext", id: "id-" + calls, isRequired: true, state: "SUCCESS" }], true, "same-cursor"); };
  await assert.rejects(() => inspectReadiness(ctx, 1, f.base), { code: "required-checks-pagination" }); assert.equal(calls, 2);
  calls = 0;
  ctx.ports.github.request = async () => ++calls === 1
    ? make([{ __typename: "CheckRun", id: "a", isRequired: true, status: "COMPLETED", conclusion: "SUCCESS" }], true, "next")
    : make([{ __typename: "StatusContext", id: "b", isRequired: true, state: "PENDING" }]);
  const paginated = await inspectReadiness(ctx, 1, f.base);
  assert.deepEqual(paginated.required, [{ bucket: "pass" }, { bucket: "fail" }]); assert.equal(calls, 2);
});


test("PR binding, latest check failure, and non-clean readiness all forbid PUT", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  const original = structuredClone(f.state.pr), ready = structuredClone(f.state.readiness);
  const cases = [
    () => { f.state.pr.head.repo.id = 99; },
    () => { f.state.pr.base.ref = "main"; },
    () => { f.state.pr.head.sha = f.base; },
    () => { f.state.pr.draft = true; },
    () => { delete f.state.pr.merged; },
    () => { f.state.readiness.mergeStateStatus = "BLOCKED"; },
    () => { f.state.readiness.reviewDecision = "REVIEW_REQUIRED"; },
    () => { f.state.readiness.required = [{ bucket: "pending" }]; },
  ];
  for (const setup of cases) {
    f.state.pr = structuredClone(original); f.state.readiness = structuredClone(ready); setup();
    const result = await f.run(f.effect(a, head)); assert.equal(result.exitCode, 2, JSON.stringify(result));
    assert.equal(f.state.puts, 0); assert.equal(fs.existsSync(a.path), true);
  }
  f.state.pr = original; f.state.readiness = ready;
  const good = { id: 5, run_number: 1, run_attempt: 1, head_sha: head, head_branch: a.branchName, head_repository: { id: 42 },
    path: ".github/workflows/check.yml", event: "pull_request", status: "completed", conclusion: "success",
    pull_requests: [{ number: 1, head: { sha: head, ref: a.branchName }, base: { ref: "dev" } }] };
  for (const bad of [{ ...good, id: 6, run_attempt: 2, conclusion: "failure" }, { ...good, id: 6, run_number: 2, status: "in_progress" },
    { ...good, id: 6, run_number: 2, pull_requests: [] }]) {
    f.state.checks = [good, bad];
    assert.equal((await f.run(f.effect(a, head))).exitCode, 2); assert.equal(f.state.puts, 0);
  }
});

test("lost merge response is recovered from exact PR and dev proof without a second PUT", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head); f.state.mode = "lost";
  const input = f.effect(a, head), result = await f.run(input);
  assert.equal(result.phase, "cleanup-pending", JSON.stringify(result)); assert.equal(f.state.puts, 1); assert.equal(result.merge.head, head);
  const again = await f.run(input); assert.equal(again.phase, "cleanup-pending"); assert.equal(f.state.puts, 1);
});

test("unknown PUT outcome stays pending on OPEN and recovery never retries it", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head); f.state.mode = "unknown";
  const input = f.effect(a, head), result = await f.run(input);
  assert.equal(result.phase, "merge-requested"); assert.equal(result.exitCode, 2); assert.equal(f.state.puts, 1);
  assert.equal((await f.run(input)).exitCode, 2); assert.equal(f.state.puts, 1);
  assert.equal((await f.run(f.effect(result, head))).exitCode, 2); assert.equal(f.state.puts, 1);
  const recovered = await f.run({ operation: "recover", task: a.task, owner: a.owner, expectedState: result.state });
  assert.equal(recovered.phase, "merge-requested"); assert.equal(f.state.puts, 1);
  f.mergeRemote();
  const merged = await f.run({ operation: "recover", task: a.task, owner: a.owner, expectedState: recovered.state });
  assert.equal(merged.phase, "merged", JSON.stringify(merged)); assert.equal(f.state.puts, 1); assert.equal(fs.existsSync(a.path), true);
});

test("definitive rejection permits only a fresh request ID with unchanged sealed head", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head); f.state.mode = "reject";
  const input = f.effect(a, head), rejected = await f.run(input);
  assert.deepEqual(rejected.reasons, ["merge-rejected"]); assert.equal(f.state.puts, 1);
  assert.equal((await f.run(input)).exitCode, 2); assert.equal(f.state.puts, 1);
  const resumed = await f.run({ operation: "resume", task: a.task, owner: a.owner, expectedState: rejected.state });
  assert.deepEqual(resumed.reasons, ["resume-not-authorized"]);
  f.state.mode = "merge";
  const retried = await f.run(f.effect(rejected, head)); assert.equal(retried.phase, "cleanup-pending", JSON.stringify(retried));
  assert.equal(f.state.puts, 2);
});

test("already merged PR bypasses readiness, closed-unmerged PR preserves task, and wrong dev proof preserves folder", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  f.state.pr.state = "closed";
  assert.deepEqual((await f.run(f.effect(a, head))).reasons, ["closed-unmerged"]); assert.equal(f.state.puts, 0);
  f.state.pr.merged = true; f.state.pr.merge_commit_sha = head; f.state.readiness.mergeStateStatus = "UNKNOWN";
  const wrong = await f.run(f.effect(a, head)); assert.equal(wrong.exitCode, 2); assert.equal(fs.existsSync(a.path), true); assert.equal(f.state.puts, 0);
  f.mergeRemote();
  const recovered = await f.run(f.effect(wrong, head)); assert.equal(recovered.phase, "cleanup-pending", JSON.stringify(recovered)); assert.equal(f.state.puts, 0);
});

test("changes between readiness and request cannot merge stale source", async t => {
  const f = fixture(t); await f.bootstrap(); const a = await f.create(), head = f.commit(a); f.pr(a, head);
  let reads = 0;
  f.state.mutate = () => { if (++reads === 2) fs.writeFileSync(path.join(a.path, "README.md"), "changed during readiness"); };
  const result = await f.run(f.effect(a, head));
  assert.equal(f.state.puts, 0, JSON.stringify(result));
  assert.equal(fs.readFileSync(path.join(a.path, "README.md"), "utf8"), "changed during readiness");
});
