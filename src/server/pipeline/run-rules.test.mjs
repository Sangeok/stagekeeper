import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HINT, decideHead, decideNext, handoffIsLive, scoutNodePending } from "./run-rules.ts";
import { AUTO_SCOUT_DISABLED_REASON } from "@harness/core/pipeline.mjs";

const base = { key: "FEAT-01", version: 2, status: "planning", planCommit: null, agent: "web-dev", handoff: null, cap: null };

it("failed acceptance waits ahead of handoff/cap while all other cursor decisions stay intact", () => {
  const failure = { checks: [3, 5], note: "missing push" };
  assert.deepEqual(decideNext({ ...base, node: "accept", status: "done", acceptanceFailure: failure, handoff: { note: "old" }, cap: { ok: false, reason: "full" } }),
    { key: "FEAT-01", node: "accept", version: 2, action: "wait", on: "acceptance", ...failure });
  for (const node of [null, "before-accept", "plan", "implement", "doc-auditor#2"]) {
    assert.deepEqual(decideNext({ ...base, node, acceptanceFailure: failure }), decideNext({ ...base, node }));
  }
  assert.equal(decideNext({ ...base, node: "accept", acceptanceFailure: null }).action, "accept");
  assert.match(HINT.accept, /All pass:.*report_submit.*Any fails:.*acceptance_fail.*don't reopen/);
});

it("resumable item and standalone PM runs bypass only the dispatch cap", () => {
  assert.equal(decideNext({ ...base, node: "implement", cap: { ok: false, reason: "full", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" }, hasResumableRun: true }).action, "dispatch");
  assert.equal(decideNext({ ...base, node: "before-implement", cap: { ok: false, reason: "full", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" }, hasResumableRun: true }).on, "gate");
  assert.equal(decideNext({ ...base, node: "implement", cap: { ok: false, reason: "full", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" }, hasResumableRun: true, handoff: { note: "commit" } }).on, "handoff");
  const head = { hasPropose: true, openCount: 1, availableBacklog: 1, cap: { ok: false, reason: "full", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" }, hasResumablePmRun: true };
  assert.equal(decideHead(head).action, "dispatch");
  assert.equal(decideHead({ ...head, availableBacklog: 0 }).action, "none");
  assert.equal(decideHead({ ...head, openCount: 2 }).action, "none");
  assert.equal(decideHead({ ...head, hasPropose: false }).action, "none");
});

it("slots-v1 dispatches and gates preserve the supplied execution identities", () => {
  const entry = { runId: "pipeline", entryId: "epoch", slotId: "doc-auditor#2" };
  const dispatched = decideNext({ ...base, node: entry.slotId, format: "slots-v1", entry });
  assert.equal(dispatched.agent, "doc-auditor");
  assert.deepEqual(dispatched.entry, entry);
  assert.equal(dispatched.hint, HINT["doc-audit"]);
  const gated = decideNext({ ...base, node: "before-doc-auditor#2", format: "slots-v1", entry });
  assert.deepEqual(gated.gateEntry, { runId: entry.runId, entryId: entry.entryId });
});

describe("decideNext (H.4)", () => {
  it("a closed run is done", () => {
    assert.deepEqual(decideNext({ ...base, node: null }), { key: "FEAT-01", node: null, version: 2, action: "done" });
  });
  it("a gate waits — boundary gates carry the boundary, others null", () => {
    assert.deepEqual(decideNext({ ...base, node: "before-plan", status: "proposed" }),
      { key: "FEAT-01", node: "before-plan", version: 2, action: "wait", on: "gate", format: null, gate: "before-plan", boundary: { from: "proposed", to: "planning" }, planCommit: null });
    assert.equal(decideNext({ ...base, node: "before-verify", status: "in_review", planCommit: "3f2a9c1" }).boundary, null);
    assert.equal(decideNext({ ...base, node: "before-verify", status: "in_review", planCommit: "3f2a9c1" }).planCommit, "3f2a9c1");
  });
  it("accept comes before handoff", () => {
    assert.equal(decideNext({ ...base, node: "accept", status: "done", handoff: { note: "x" } }).action, "accept");
  });
  it("a handoff on plan waits with the note", () => {
    assert.deepEqual(decideNext({ ...base, node: "plan", handoff: { note: "docs/plans/FEAT-01.md" } }),
      { key: "FEAT-01", node: "plan", version: 2, action: "wait", on: "handoff", note: "docs/plans/FEAT-01.md" });
  });
  it("the cap waits with its sentence", () => {
    const r = decideNext({ ...base, node: "plan", cap: { ok: false, reason: "Usage limit reached.", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" } });
    assert.equal(r.action, "wait");
    assert.equal(r.on, "cap");
    assert.equal(r.code, "USAGE_LIMIT_REACHED");
    assert.equal(r.resetAt, "2026-10-02T05:00:00.000Z");
  });
  it("plan and implement dispatch the item's dev; doc-audit dispatches doc-auditor; hint comes from HINT", () => {
    assert.deepEqual(decideNext({ ...base, node: "plan" }), { key: "FEAT-01", node: "plan", version: 2, action: "dispatch", format: null, agent: "web-dev", hint: HINT.plan });
    assert.equal(decideNext({ ...base, node: "implement", status: "implementing" }).agent, "web-dev");
    assert.equal(decideNext({ ...base, node: "doc-audit", status: "done" }).agent, "doc-auditor");
    assert.equal(decideNext({ ...base, node: "propose", status: "proposed" }).agent, "pm");
  });
  it("HINT covers every node the pipeline can stop on, accept included", () => {
    // accept는 메인 루프가 에이전트 없이 직접 하는 유일한 동작이라 hint를 따로 단다.
    assert.deepEqual(Object.keys(HINT).sort(), ["accept", "doc-audit", "implement", "plan", "propose", "scout", "scoutHead", "verify"]);
    assert.match(HINT.verify, /validation_record/);
    // verify hint는 경로 목록을 남길 자리를 말한다.
    assert.match(HINT.verify, /verification-paths\.md/);
    assert.match(HINT.verify, /docs\/agents\/main-loop\/<KEY>\.md/);
    assert.match(HINT.accept, /report_submit/);
  });

  it("accept carries its hint like every other answer", () => {
    const r = decideNext({ ...base, node: "accept", status: "done" });
    assert.equal(r.action, "accept");
    assert.equal(r.hint, HINT.accept);
  });
});

describe("decideHead (H.4)", () => {
  it("no propose node → none with the Backlog-tab reason", () => {
    const r = decideHead({ hasPropose: false, openCount: 0, availableBacklog: 3, cap: null });
    assert.equal(r.action, "none");
    assert.match(r.reason, /Backlog tab/);
  });
  it("two open items → none with the pm sentence", () => {
    assert.deepEqual(decideHead({ hasPropose: true, openCount: 2, availableBacklog: 3, cap: null }), { action: "none", reason: "open items: 2 (max 2)" });
  });
  it("the cap → none with its sentence; otherwise dispatch pm with HINT.propose", () => {
    assert.equal(decideHead({ hasPropose: true, openCount: 1, availableBacklog: 3, cap: { ok: false, reason: "Usage limit reached.", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" } }).reason, "Usage limit reached.");
    assert.deepEqual(decideHead({ hasPropose: true, openCount: 1, availableBacklog: 3, cap: null }), { action: "dispatch", agent: "pm", hint: HINT.propose });
  });

  it("the open-items rule still wins over an empty backlog — the owner clears one first", () => {
    const r = decideHead({ hasPropose: true, openCount: 2, availableBacklog: 0, cap: null });
    assert.equal(r.reason, "open items: 2 (max 2)");
  });
});

// dev가 멈춘 뒤 소유자가 커밋하고 에이전트가 계획서를 제출했는데도
// 파이프라인이 "그 파일을 커밋하라"를 계속 답했다. 원장의 마지막 단계만 보면 그렇게 된다.
describe("handoffIsLive", () => {
  const at = (iso) => new Date(iso);

  it("is live while the item has not moved since the agent stopped", () => {
    assert.equal(handoffIsLive(at("2026-09-11T10:00:00Z"), at("2026-09-11T09:59:00Z")), true);
  });

  it("is stale once the item is written after the stop — the commit already happened", () => {
    // plan_submit·report_submit·validation·전이가 전부 보드 행을 갱신한다.
    assert.equal(handoffIsLive(at("2026-09-11T10:00:00Z"), at("2026-09-11T10:00:01Z")), false);
  });

  it("is stale at the same instant — ties go to the board, which is the newer fact", () => {
    assert.equal(handoffIsLive(at("2026-09-11T10:00:00Z"), at("2026-09-11T10:00:00Z")), false);
  });

  it("a stale handoff never reaches decideNext, so the node dispatches instead of waiting", () => {
    const live = decideNext({ ...base, node: "plan", handoff: { note: "docs/plans/FEAT-01.md" } });
    assert.equal(live.action, "wait");
    assert.equal(live.on, "handoff");
    // nextFor가 handoffIsLive로 거른 뒤의 모양 — handoff가 null이면 디스패치로 돌아간다.
    const stale = decideNext({ ...base, node: "plan", handoff: null });
    assert.equal(stale.action, "dispatch");
    assert.equal(stale.agent, "web-dev");
  });
});

it("an empty backlog scouts once per change, with no duplicate graph dispatch and no Propose prerequisite", () => {
  const input = { autoScoutEnabled: true, hasPropose: true, openCount: 0, availableBacklog: 0, scoutedSinceChange: false, scoutNodePending: false, cap: null };
  assert.deepEqual(decideHead(input), { action: "dispatch", agent: "feature-scout", hint: HINT.scoutHead });
  assert.match(decideHead({ ...input, scoutedSinceChange: true }).reason, /already looked/);
  assert.match(decideHead({ ...input, scoutNodePending: true }).reason, /Scout node/);
  assert.equal(decideHead({ ...input, hasPropose: false }).agent, "feature-scout");
  assert.equal(decideHead({ ...input, hasPropose: false, openCount: 2 }).reason, "open items: 2 (max 2)");
  assert.equal(decideHead({ ...input, availableBacklog: 1 }).agent, "pm");
  assert.equal(decideHead({ ...input, cap: { ok: false, reason: "full", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" }, hasResumablePmRun: true }).reason, "full");
  assert.equal(decideHead({ ...input, cap: { ok: false, reason: "full", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" }, hasResumableScoutRun: true }).agent, "feature-scout");
  assert.equal(decideHead({ ...input, cap: { ok: false, reason: "full", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" }, hasResumableScoutRun: true, scoutedSinceChange: true }).action, "none");
  assert.equal(decideHead({ ...input, cap: { ok: false, reason: "full", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" }, availableBacklog: 1, hasResumableScoutRun: true }).reason, "full");
  assert.doesNotMatch(HINT.scout, /only when harness\.json\.scout is configured/);
  assert.match(HINT.scoutHead, /scouting-log/);
});
it("only an actual feature-scout dispatch suppresses a duplicate head dispatch", () => {
  assert.equal(scoutNodePending([]), false);
  assert.equal(scoutNodePending([decideNext({ ...base, node: "feature-scout#2" })]), true);
  assert.equal(scoutNodePending([decideNext({ ...base, node: "scout" })]), true);
  assert.equal(scoutNodePending([decideNext({ ...base, node: "scout", cap: { ok: false, reason: "full", code: "USAGE_LIMIT_REACHED", resetAt: "2026-10-02T05:00:00.000Z" } })]), false);
  assert.equal(scoutNodePending([decideNext({ ...base, node: "plan" })]), false);
});

it("turning automatic scouting off waits for manual backlog input while PM and configured Scout slots keep working", () => {
  const input = { autoScoutEnabled: false, hasPropose: true, openCount: 0, availableBacklog: 0, scoutedSinceChange: false, scoutNodePending: false, cap: null };
  assert.deepEqual(decideHead(input), { action: "none", reason: AUTO_SCOUT_DISABLED_REASON });
  assert.deepEqual(decideHead({ ...input, hasResumableScoutRun: true }), { action: "none", reason: AUTO_SCOUT_DISABLED_REASON });
  assert.equal(decideHead({ ...input, availableBacklog: 1 }).agent, "pm");
  assert.equal(decideNext({ ...base, node: "feature-scout#2" }).agent, "feature-scout");
  assert.match(decideHead({ ...input, scoutNodePending: true }).reason, /Scout node/);
  assert.equal(decideHead({ ...input, autoScoutEnabled: true }).agent, "feature-scout");
});
