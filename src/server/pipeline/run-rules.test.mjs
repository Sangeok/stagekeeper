import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HINT, decideHead, decideNext, handoffIsLive } from "./run-rules.ts";

const base = { key: "FEAT-01", version: 2, status: "planning", planCommit: null, agent: "web-dev", handoff: null, capReason: null };

describe("decideNext (H.4)", () => {
  it("a closed run is done", () => {
    assert.deepEqual(decideNext({ ...base, node: null }), { key: "FEAT-01", node: null, version: 2, action: "done" });
  });
  it("a gate waits — boundary gates carry the boundary, others null", () => {
    assert.deepEqual(decideNext({ ...base, node: "before-plan", status: "proposed" }),
      { key: "FEAT-01", node: "before-plan", version: 2, action: "wait", on: "gate", gate: "before-plan", boundary: { from: "proposed", to: "planning" }, planCommit: null });
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
    const r = decideNext({ ...base, node: "plan", capReason: "dispatch cap reached on the free plan (60) — counted over the last 30 days" });
    assert.equal(r.action, "wait");
    assert.equal(r.on, "cap");
    assert.match(r.reason, /last 30 days/);
  });
  it("plan and implement dispatch the item's dev; doc-audit dispatches doc-auditor; hint comes from HINT", () => {
    assert.deepEqual(decideNext({ ...base, node: "plan" }), { key: "FEAT-01", node: "plan", version: 2, action: "dispatch", agent: "web-dev", hint: HINT.plan });
    assert.equal(decideNext({ ...base, node: "implement", status: "implementing" }).agent, "web-dev");
    assert.equal(decideNext({ ...base, node: "doc-audit", status: "done" }).agent, "doc-auditor");
    assert.equal(decideNext({ ...base, node: "propose", status: "proposed" }).agent, "pm");
  });
  it("HINT covers every node the pipeline can stop on, accept included", () => {
    // accept만 빠져 있었다 — 메인 루프가 에이전트 없이 직접 하는 유일한 동작인데 안내가 없었다(실측).
    assert.deepEqual(Object.keys(HINT).sort(), ["accept", "doc-audit", "implement", "plan", "propose", "scout", "verify"]);
    assert.match(HINT.verify, /validation_record/);
    // 경로 목록을 어디에 남기라는 말이 없어서 다섯 사이클 동안 한 번도 안 남았다(F6 실측).
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
    const r = decideHead({ hasPropose: false, openCount: 0, availableBacklog: 3, capReason: null });
    assert.equal(r.action, "none");
    assert.match(r.reason, /Backlog tab/);
  });
  it("two open items → none with the pm sentence", () => {
    assert.deepEqual(decideHead({ hasPropose: true, openCount: 2, availableBacklog: 3, capReason: null }), { action: "none", reason: "open items: 2 (max 2)" });
  });
  it("the cap → none with its sentence; otherwise dispatch pm with HINT.propose", () => {
    assert.equal(decideHead({ hasPropose: true, openCount: 1, availableBacklog: 3, capReason: "dispatch cap reached on the free plan (60)" }).reason, "dispatch cap reached on the free plan (60)");
    assert.deepEqual(decideHead({ hasPropose: true, openCount: 1, availableBacklog: 3, capReason: null }), { action: "dispatch", agent: "pm", hint: HINT.propose });
  });

  it("an empty backlog rests instead of dispatching pm at nothing", () => {
    // 예전에는 백로그가 비어도 계속 "dispatch pm"이었다. 고를 것이 없다는 걸 알자고 디스패치를 하나 썼고,
    // 그 디스패치는 월 상한에 계수된다(실측).
    const r = decideHead({ hasPropose: true, openCount: 0, availableBacklog: 0, capReason: null });
    assert.equal(r.action, "none");
    assert.match(r.reason, /backlog has nothing to pick/);
  });

  it("the open-items rule still wins over an empty backlog — the owner clears one first", () => {
    const r = decideHead({ hasPropose: true, openCount: 2, availableBacklog: 0, capReason: null });
    assert.equal(r.reason, "open items: 2 (max 2)");
  });
});

// 실측에서 나온 것: dev가 멈춘 뒤 소유자가 커밋하고 에이전트가 계획서를 제출했는데도
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
