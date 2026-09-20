import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RATE_LIMIT, REFUSAL_WARN_AT, agentNext, type NextDeps, type NextInput, type Outcome, type Receipt, type Scope } from "./next";

// dev.md의 축소판 — 그래프는 같고 본문만 짧다. 실제 템플릿은 private 저장소에 있어 CI에는 없다(templates.test.mjs가 따로 본다).
const DEV = `---
name: dev
tools: mcp__harness__agent_next
---
Stub for {{ws.agent}}. First tool call of the session is agent_next.

## step:start
Look at the item. Send \`ok\` or \`blocked\`.
next: implement | plan
on blocked: done

## step:plan   requires: planning
Plan it as {{ws.agent}}.
next: done
on blocked: done

## step:implement   requires: implementing
Implement. Read {{ws.knowledge}}.
next: verify
on blocked: hold

## step:verify   requires: implementing
Run:
{{ws.verify_block}}
next: report
on failed: hold
on blocked: hold

## step:report   requires: implementing, verify-ok
Report.
next: done

## step:hold
Hold.
next: done
`;

const PM = `---
name: pm
---
Stub.

## step:start
Read the board. {{roster_table}}
next: pick

## step:pick
Pick one. Send \`ok\` or \`failed\`.
next: propose

## step:propose   requires: can-propose
Propose it.
next: done
`;

// implement에서 verify 없이 report로 가려는 템플릿 — verify-ok 검사가 그래프가 아니라 서버 규칙임을 본다.
const SHORTCUT = DEV.replace("next: verify\non blocked: hold", "next: report\non blocked: hold");

// 라우터 단계(start)를 지운 dev — 서버가 열리는 첫 단계를 골라야 한다.
const PV = `---
name: plan-verifier
---
Stub.

## step:read   requires: in_review
Read the plan.
next: report

## step:report
Report.
next: done
`;

const DEV_NOSTART = DEV.replace(/## step:start\n[\s\S]*?\n\n(?=## step:plan)/, "");

const VARS: Record<string, Record<string, unknown>> = {
  "web-dev": { ws: { agent: "web-dev", knowledge: "apps/web/CLAUDE.md", verify_block: "```bash\nnpm test\n```" }, roster_table: "| web-dev |" },
  pm: { roster_table: "| web-dev |" },
  "plan-verifier": { roster_table: "| web-dev |" },
};

type Run = { revision: number; id: string; agent: string; key: string | null; stepId: string; closedAt: Date | null; refused: number; tokenId: string };
type Rec = { runId: string; stepId: string; outcome: Outcome; note: string | null };
type Opts = {
  plan?: "free" | "pro" | "max"; locked?: string; roster?: string[]; templates?: Record<string, string>;
  board?: Record<string, string>; openCount?: number; recent?: number; verifiedElsewhere?: boolean;
  itemAgent?: Record<string, string>; recentRuns?: number; scope?: Scope;
};

const SCOPE: Scope = { projectId: "p1", tokenId: "t1" };

function harness(opts: Opts = {}) {
  const runs: Run[] = [];
  const records: Rec[] = [];
  const rejected: Rec[] = [];
  // 한도 집계가 무엇을 분모로 받았는지. hs_는 null, hu_는 프로젝트다(A-10).
  const rateCalls: [string, string | null][] = [];
  const scope = opts.scope ?? SCOPE;
  const board = opts.board ?? {};
  const templates = opts.templates ?? { "agents/dev.md": DEV, "agents/pm.md": PM };
  let seq = 0;
  const plan = opts.plan ?? "pro";
  const deps: NextDeps = {
    access: async () => (opts.locked ? { plan, available: false, code: "not-selected", reason: opts.locked } : { plan, available: true }),
    roster: async () => opts.roster ?? ["web-dev"],
    template: async (_p, path) => templates[path] ?? null,
    vars: async (_p, agent) => VARS[agent],
    recentSteps: async (tokenId, projectId) => { rateCalls.push([tokenId, projectId]); return opts.recent ?? records.length; },
    recentRuns: async () => opts.recentRuns ?? 0,
    openRun: async (_p, agent, key) => runs.filter((r) => r.agent === agent && r.key === key && !r.closedAt).at(-1) ?? null,
    createRun: async (scope, agent, key, stepId) => {
      const r: Run = { revision: 0, id: `run${++seq}`, agent, key, stepId, closedAt: null, refused: 0, tokenId: scope.tokenId };
      runs.push(r);
      return { ok: true, item: r };
    },
    boardStatus: async (_p, key) => board[key] ?? null,
    itemAgent: async (_p, key) => opts.itemAgent?.[key] ?? null,
    openCount: async () => opts.openCount ?? 0,
    verifyOk: async (_p, agent, key) => opts.verifiedElsewhere === true
      || records.some((rec) => rec.stepId === "verify" && rec.outcome === "ok"
        && runs.some((r) => r.id === rec.runId && r.agent === agent && r.key === key)),
    runByReceipt: async (_p, agent, key, id) => { const r = runs.find((r) => r.id === id && r.agent === agent && r.key === key); return r ? { ...r } : null; },
    closeRun: async (run) => { const r = runs.find((r) => r.id === run.id)!; r.closedAt = new Date(); },
    commitOutcome: async ({ receipt, outcome, note, destination }) => {
      const r = runs.find((r) => r.id === receipt.runId)!;
      if (destination.kind === "retired") {
        if (r.revision === destination.run.revision && r.stepId === destination.run.stepId) r.closedAt = new Date();
        rejected.push({ runId: r.id, stepId: receipt.stepId, outcome, note });
        return { kind: r.closedAt ? "closed" : "stale" };
      }
      const accepted = r.revision === receipt.revision && r.stepId === receipt.stepId
        && (destination.kind === "closed" ? !!r.closedAt && destination.allowTerminal
          && !records.some((rec) => rec.runId === r.id && rec.stepId === r.stepId && ["ok", "blocked", "failed"].includes(rec.outcome)) : !r.closedAt);
      if (!accepted) { rejected.push({ runId: r.id, stepId: receipt.stepId, outcome, note }); return { kind: r.closedAt ? "closed" : "stale" }; }
      records.push({ runId: r.id, stepId: receipt.stepId, outcome, note });
      r.revision++;
      if (destination.kind === "step") r.stepId = destination.stepId;
      if (destination.kind === "done") r.closedAt = new Date();
      if (destination.kind === "stay" && destination.refused) r.refused++;
      return { kind: "accepted", run: { ...r }, refused: r.refused };
    },
  };
  const call = (input: NextInput) => {
    const r = runs.filter((r) => r.agent === input.agent && r.key === (input.key ?? null)).at(-1);
    const receipt = input.receipt ?? (r ? { runId: r.id, revision: r.revision, stepId: r.stepId } : undefined);
    return agentNext(deps, scope, { ...input, receipt });
  };
  return { call, runs, records, rejected, board, deps, rateCalls };
}

const dev = (extra: Partial<NextInput> = {}): NextInput => ({ agent: "web-dev", key: "FEAT-1", ...extra });

function step(r: Awaited<ReturnType<typeof agentNext>>) {
  assert.ok(r.ok, r.ok ? "" : r.reason);
  assert.equal(r.item.done, false);
  return r.item as { step: string; instruction: string; done: false; receipt: Receipt };
}
function refused(r: Awaited<ReturnType<typeof agentNext>>) {
  assert.ok(!r.ok, "expected a refusal");
  return r.reason;
}

describe("agentNext — opening and resending", () => {
  it("no open run and no outcome: opens a run at the first step, rendered with the workspace vars", async () => {
    const h = harness();
    const s = step(await h.call(dev()));
    assert.equal(s.step, "start");
    assert.match(s.instruction, /^Look at the item/);
    assert.equal(h.runs.length, 1);
    assert.equal(h.runs[0].stepId, "start");
    assert.equal(h.records.length, 0); // 열기만 했다 — 원장에는 아무것도 없다
  });
  it("the instruction is the step body only, rendered — never the stub, never another step", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" } });
    await h.call(dev());
    const s = step(await h.call(dev({ outcome: "ok" })));
    assert.equal(s.step, "implement");
    assert.equal(s.instruction, "Implement. Read apps/web/CLAUDE.md.");
    assert.doesNotMatch(s.instruction, /Stub for|## step:|next:/);
  });
  it("no outcome with an open run: the current step again, nothing recorded, no advance", async () => {
    const h = harness({ board: { "FEAT-1": "planning" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));
    const before = h.records.length;
    const s = step(await h.call(dev()));
    assert.equal(s.step, "plan");
    assert.equal(s.instruction, "Plan it as web-dev.");
    assert.equal(h.records.length, before);
    assert.equal(h.runs.length, 1);
  });
});

describe("agentNext — routing", () => {
  it("start's candidates follow the board: implementing → implement, planning → plan", async () => {
    const a = harness({ board: { "FEAT-1": "implementing" } });
    await a.call(dev());
    assert.equal(step(await a.call(dev({ outcome: "ok" }))).step, "implement");
    const b = harness({ board: { "FEAT-1": "planning" } });
    await b.call(dev());
    assert.equal(step(await b.call(dev({ outcome: "ok" }))).step, "plan");
  });
  it("no candidate open: fixed wording per candidate, the run stays, the outcome is still recorded", async () => {
    const h = harness({ board: { "FEAT-1": "proposed" } });
    await h.call(dev());
    const reason = refused(await h.call(dev({ outcome: "ok", note: "looked" })));
    assert.equal(reason, "not open: step `implement` opens when the item is `implementing` (now `proposed`); step `plan` opens when the item is `planning` (now `proposed`)");
    assert.equal(h.runs[0].stepId, "start");
    assert.deepEqual(h.records, [{ runId: "run1", stepId: "start", outcome: "ok", note: "looked" }]);
    assert.equal(h.runs[0].refused, 1);
  });
  it("an item that is not on the board reads as `not on the board`", async () => {
    const h = harness();
    await h.call(dev());
    assert.match(refused(await h.call(dev({ outcome: "ok" }))), /now `not on the board`/);
  });
  it("on failed / on blocked route to the fallback; report needs implementing and a verify ok", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));                                  // start → implement
    assert.equal(step(await h.call(dev({ outcome: "ok" }))).step, "verify");    // implement → verify
    assert.equal(step(await h.call(dev({ outcome: "failed", note: "tests red" }))).step, "hold"); // verify failed → hold
    assert.deepEqual(h.records.at(-1), { runId: "run1", stepId: "verify", outcome: "failed", note: "tests red" });
  });
  it("implement blocked → hold; hold ok → done and the run closes", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));
    assert.equal(step(await h.call(dev({ outcome: "blocked" }))).step, "hold");
    assert.deepEqual(await h.call(dev({ outcome: "ok" })), { ok: true, item: { done: true } });
    assert.ok(h.runs[0].closedAt);
  });
  it("the verify ok being reported counts for report's verify-ok in the same call", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));
    step(await h.call(dev({ outcome: "ok" })));
    assert.equal(step(await h.call(dev({ outcome: "ok", note: "npm test green" }))).step, "report");
  });
  it("report without a recorded verify ok is refused even when the template routes there", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" }, templates: { "agents/dev.md": SHORTCUT } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));
    assert.equal(refused(await h.call(dev({ outcome: "ok" }))), "not open: step `report` opens when a `verify` step is recorded `ok` (none yet)");
  });
  it("a verify ok from an earlier run of the same (agent, key) satisfies verify-ok", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" }, templates: { "agents/dev.md": SHORTCUT }, verifiedElsewhere: true });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));
    assert.equal(step(await h.call(dev({ outcome: "ok" }))).step, "report");
  });
  it("an outcome with no route stays on the step, records it, and says so above the body", async () => {
    const h = harness();
    await h.call({ agent: "pm" });
    step(await h.call({ agent: "pm", outcome: "ok" }));                          // start → pick
    const s = step(await h.call({ agent: "pm", outcome: "failed", note: "nothing fits" }));
    assert.equal(s.step, "pick");
    assert.match(s.instruction, /^\(failed recorded; this step has no `on failed:` route — you are still on `pick`\)\n\nPick one/);
    assert.deepEqual(h.records.at(-1), { runId: "run1", stepId: "pick", outcome: "failed", note: "nothing fits" });
  });
  it("can-propose: refused at 2 open items, allowed below", async () => {
    const full = harness({ openCount: 2 });
    await full.call({ agent: "pm" });
    step(await full.call({ agent: "pm", outcome: "ok" }));
    assert.equal(refused(await full.call({ agent: "pm", outcome: "ok" })), "not open: step `propose` opens when fewer than 2 items are open (now 2)");
    const room = harness({ openCount: 1 });
    await room.call({ agent: "pm" });
    step(await room.call({ agent: "pm", outcome: "ok" }));
    assert.equal(step(await room.call({ agent: "pm", outcome: "ok" })).step, "propose");
  });
});

describe("agentNext — handoff", () => {
  it("records the pause, stays on the step, and the next outcome-less call resumes the same step", async () => {
    const h = harness({ board: { "FEAT-1": "planning" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));                                   // start → plan
    const paused = step(await h.call(dev({ outcome: "handoff", note: "docs/plans/FEAT-1.md" })));
    assert.equal(paused.step, "plan");
    assert.equal(paused.instruction, "(handoff recorded — you are still on `plan`; after the commit, call again without outcome)\n\nPlan it as web-dev.");
    assert.deepEqual(h.records.at(-1), { runId: "run1", stepId: "plan", outcome: "handoff", note: "docs/plans/FEAT-1.md" });
    assert.equal(h.runs[0].stepId, "plan");
    assert.equal(h.runs[0].refused, 0);                                            // 거부가 아니다
    const resumed = step(await h.call(dev()));
    assert.equal(resumed.step, "plan");
    assert.equal(resumed.instruction, "Plan it as web-dev.");
  });
});

describe("agentNext — run lifecycle", () => {
  it("after done: a call without outcome opens a fresh run; a call with outcome gets {done: true} and opens nothing", async () => {
    const h = harness({ board: { "FEAT-1": "planning" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));                                  // start → plan
    assert.deepEqual(await h.call(dev({ outcome: "ok" })), { ok: true, item: { done: true } });
    // dev의 report·hold는 board_transition 뒤에 ok를 보낸다 — 그 호출이 run을 열면 start로 되돌아간다.
    // 열린 run이 없는 채 outcome이 오면 done에 note가 붙는다 — 그 done은 "이 run이 끝났다"이지
    // "이 항목이 끝났다"가 아니기 때문이다(실측에서 메인 루프가 항목을 두고 넘어갔다).
    const closed = await h.call(dev({ outcome: "ok" }));
    assert.equal(closed.ok && closed.item.done, true);
    assert.match(closed.ok && "note" in closed.item ? (closed.item.note ?? "") : "", /not necessarily the item/);
    assert.equal(h.runs.length, 1);
    assert.equal(step(await h.call(dev())).step, "start");
    assert.equal(h.runs.length, 2);
  });
  it("a run closed by the server (item moved) behaves the same: outcome → done, no outcome → new run", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));
    h.runs[0].closedAt = new Date();                                           // board.transition이 닫은 것과 같다
    const closed = await h.call(dev({ outcome: "ok" }));
    assert.equal(closed.ok && closed.item.done, true);
    assert.match(closed.ok && "note" in closed.item ? (closed.item.note ?? "") : "", /call again without outcome/i);
    // 런북은 두 dev 단계 모두 마지막 지시가 agent_next(outcome)인데, 그 직전 호출이 이미 run을 닫는다.
    // 그 마지막 말이 한 줄도 안 남으면 plan run의 원장이 통째로 빈다(실측).
    assert.deepEqual(h.records.at(-1), { runId: "run1", stepId: "implement", outcome: "ok", note: null });
    assert.equal(step(await h.call(dev())).step, "start");
  });
  it("the closed run takes that last word once — later outcomes add rejected audit only", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));
    h.runs[0].closedAt = new Date();
    await h.call(dev({ outcome: "ok", note: "first" }));
    const after = h.records.length;
    await h.call(dev({ outcome: "ok", note: "second" }));
    await h.call(dev({ outcome: "failed", note: "third" }));
    assert.equal(h.records.length, after);
    assert.equal(h.records.at(-1)?.note, "first");
    assert.equal(h.rejected.length, 2);
  });
  // handoff는 자리에 머무는 기록이라 단계를 끝내지 않는다 — 그 뒤의 ok가 이 단계의 마지막 말이다.
  it("a handoff already on the step does not count as the last word", async () => {
    const h = harness({ board: { "FEAT-1": "planning" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));                                  // start → plan
    await h.call(dev({ outcome: "handoff", note: "docs/plans/FEAT-1.md" }));     // 자리에 머문다
    h.runs[0].closedAt = new Date();                                             // plan_submit이 닫았다
    await h.call(dev({ outcome: "ok", note: "in_review" }));
    assert.deepEqual(h.records.at(-1), { runId: "run1", stepId: "plan", outcome: "ok", note: "in_review" });
  });
  // 정상 경로로 done에 닿은 run은 그 단계의 ok를 이미 남겼다 — 다시 보낸 ok는 아무것도 더하지 않는다.
  it("a run that reached done takes only rejected audit rows on replay", async () => {
    const h = harness({ board: { "FEAT-1": "planning" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));
    await h.call(dev({ outcome: "ok" }));                                        // plan → done, run 닫힘
    const after = h.records.length;
    await h.call(dev({ outcome: "ok" }));
    assert.equal(h.records.length, after);
  });
  it("a concurrent advance loses the CAS and is told to re-read", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" } });
    await h.call(dev());
    const commit = h.deps.commitOutcome;
    h.deps.commitOutcome = async (input) => { await commit(input); return { kind: "stale" }; };
    assert.match(refused(await h.call(dev({ outcome: "ok" }))), /^stale:/);
  });
  it("runs are keyed by (agent, key): two items, two independent cursors", async () => {
    const h = harness({ board: { "FEAT-1": "implementing", "FEAT-2": "planning" } });
    await h.call(dev({ key: "FEAT-1" }));
    await h.call(dev({ key: "FEAT-2" }));
    assert.equal(step(await h.call(dev({ key: "FEAT-2", outcome: "ok" }))).step, "plan");
    assert.equal(step(await h.call(dev({ key: "FEAT-1" }))).step, "start");
  });
});

describe("agentNext — gates before any step is served", () => {
  it("a locked project is refused with the lock reason", async () => {
    const h = harness({ locked: "project cap reached on the free plan (1); this project is locked" });
    assert.equal(refused(await h.call({ agent: "pm" })), "project cap reached on the free plan (1); this project is locked");
    assert.equal(h.runs.length, 0);
  });
  it("an agent the plan does not include is refused; an unknown agent is refused as unknown", async () => {
    const h = harness({ plan: "free", templates: { "agents/plan-verifier.md": PM } });
    assert.equal(refused(await h.call({ agent: "plan-verifier" })), "agent `plan-verifier` is not on the free plan");
    assert.equal(refused(await h.call({ agent: "nobody" })), "unknown agent: nobody");
  });
  it("a workspace agent beyond the plan's workspace cap is refused like a plan-excluded agent", async () => {
    const h = harness({ plan: "free", roster: ["web-dev", "admin-dev"] });
    assert.equal(refused(await h.call({ agent: "admin-dev", key: "X-1" })), "agent `admin-dev` is not on the free plan");
    step(await h.call(dev()));
  });
  it("key: required when the template gates on board state, refused when it does not", async () => {
    const h = harness();
    assert.equal(refused(await h.call({ agent: "web-dev" })), "agent `web-dev` needs a key");
    assert.equal(refused(await h.call({ agent: "pm", key: "X-1" })), "agent `pm` takes no key");
  });
  it("rate limit: refused once the token has recorded RATE_LIMIT.calls steps in the window", async () => {
    const h = harness({ recent: RATE_LIMIT.calls });
    assert.equal(refused(await h.call({ agent: "pm" })), `rate limit: ${RATE_LIMIT.calls} calls per 10 minutes per token`);
    const ok = harness({ recent: RATE_LIMIT.calls - 1 });
    step(await ok.call({ agent: "pm" }));
  });
  it("a missing or step-less template is refused, not thrown", async () => {
    const none = harness({ templates: {} });
    assert.equal(refused(await none.call({ agent: "pm" })), "no template for agent `pm`");
    const flat = harness({ templates: { "agents/pm.md": "# pm\n\nno steps\n" } });
    assert.equal(refused(await flat.call({ agent: "pm" })), "template for agent `pm` has no steps");
  });
  it("refusals in one run are counted and warned about at REFUSAL_WARN_AT", async () => {
    const h = harness({ board: { "FEAT-1": "proposed" } });
    await h.call(dev());
    const warned: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => { warned.push(a.join(" ")); };
    try {
      for (let i = 0; i < REFUSAL_WARN_AT; i++) refused(await h.call(dev({ outcome: "ok" })));
    } finally { console.warn = orig; }
    assert.equal(warned.length, 1);
    assert.match(warned[0], /run1.*10 refusals/);
  });
});

describe("opening a run picks the first step that is open", () => {
  const noStart = (board: Record<string, string>) => harness({ board, templates: { "agents/dev.md": DEV_NOSTART } });

  it("routes to plan or implement by the board status — no router step needed", async () => {
    assert.equal(step(await noStart({ "FEAT-1": "planning" }).call(dev())).step, "plan");
    assert.equal(step(await noStart({ "FEAT-1": "implementing" }).call(dev())).step, "implement");
  });

  it("refuses and opens no run when nothing is open", async () => {
    const h = noStart({ "FEAT-1": "proposed" });
    const r = await h.call(dev());
    assert.equal(r.ok, false);
    assert.match(r.reason, /not open/);
    // 커서를 남기면 다음 호출이 그 자리에서 다시 판정하지 못한다.
    assert.equal(h.runs.length, 0);
  });

  it("leaves templates whose first step has no requires exactly as they were", async () => {
    assert.equal(step(await harness().call({ agent: "pm" })).step, "start");
    assert.equal(step(await harness({ board: { "FEAT-1": "planning" } }).call(dev())).step, "start");
  });
});

describe("item ownership", () => {
  it("refuses a key that belongs to another agent", async () => {
    const h = harness({ roster: ["web-dev", "api-dev"], board: { "FEAT-1": "planning" }, itemAgent: { "FEAT-1": "api-dev" } });
    const r = await h.call(dev());
    assert.equal(r.ok, false);
    assert.match(r.reason, /api-dev/);
    assert.equal(h.runs.length, 0);
  });

  it("allows the agent the item is assigned to", async () => {
    const h = harness({ board: { "FEAT-1": "planning" }, itemAgent: { "FEAT-1": "web-dev" } });
    assert.equal(step(await h.call(dev())).step, "start");
  });

  it("does not fence report agents out of an item they inspect", async () => {
    // plan-verifier는 key를 쓰지만(단계가 requires: in_review) 항목의 소유자가 아니다 —
    // 소유자는 언제나 워크스페이스 dev다. 소유 검사를 모든 key 호출에 걸면 검증자가 통째로 막힌다.
    const h = harness({ board: { "FEAT-1": "in_review" }, itemAgent: { "FEAT-1": "web-dev" },
      templates: { "agents/dev.md": DEV, "agents/plan-verifier.md": PV } });
    const r = await h.call({ agent: "plan-verifier", key: "FEAT-1" });
    assert.ok(r.ok, r.ok ? "" : r.reason);
  });

  it("says nothing about ownership for a keyless agent", async () => {
    assert.equal(step(await harness({ itemAgent: { "FEAT-1": "api-dev" } }).call({ agent: "pm" })).step, "start");
  });
});

describe("agentNext — dispatch cap (H.5)", () => {
  it("propagates an atomic opener failure without serving an instruction", async () => {
    const h = harness();
    h.deps.createRun = async () => ({ ok: false, reason: "last slot was consumed" });
    assert.deepEqual(await h.call({ agent: "pm" }), { ok: false, reason: "last slot was consumed" });
  });
  it("serves the actual reused run's step rather than the proposed entry step", async () => {
    const h = harness();
    h.deps.createRun = async () => ({ ok: true, item: { id: "reused", stepId: "pick", revision: 0, closedAt: null } });
    assert.equal(step(await h.call({ agent: "pm" })).step, "pick");
  });
  it("refuses to open a run at the plan's 30-day cap, naming the window; opens nothing", async () => {
    const h = harness({ plan: "free", recentRuns: 60 });
    const reason = refused(await h.call({ agent: "pm" }));
    assert.match(reason, /^dispatch cap reached on the free plan \(60\)/);
    assert.match(reason, /last 30 days/);
    assert.equal(h.runs.length, 0);
  });
  it("opens the 60th run on free and never caps max", async () => {
    step(await harness({ plan: "free", recentRuns: 59 }).call({ agent: "pm" }));
    step(await harness({ plan: "max", recentRuns: 10_000 }).call({ agent: "pm" }));
  });
  it("resuming an open run does not consult the cap", async () => {
    const h = harness();
    step(await h.call(dev()));
    h.deps.recentRuns = async () => { throw new Error("recentRuns consulted on resume"); };
    step(await h.call(dev()));
  });
});

it("requires a receipt for every outcome, including handoff", async () => {
  const h = harness();
  await h.call(dev());
  for (const outcome of ["ok", "failed", "blocked", "handoff"] as const) {
    assert.match(refused(await agentNext(h.deps, SCOPE, dev({ outcome }))), /receipt required/);
  }
  assert.equal(h.records.length + h.rejected.length, 0);
});
it("one receipt can advance at most once, including concurrent requests", async () => {
  const h = harness({ board: { "FEAT-1": "implementing" } });
  const { receipt } = step(await h.call(dev()));
  const results = await Promise.all([h.call(dev({ outcome: "ok", receipt })), h.call(dev({ outcome: "ok", receipt }))]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(h.records.length, 1);
  assert.equal(h.rejected.length, 1);
  assert.equal(h.runs[0].revision, 1);
});
it("handoff rotates the receipt and stale retries do not become evidence", async () => {
  const h = harness();
  const first = step(await h.call(dev()));
  const second = step(await h.call(dev({ outcome: "handoff", receipt: first.receipt })));
  assert.equal(second.receipt.revision, first.receipt.revision + 1);
  assert.match(refused(await h.call(dev({ outcome: "ok", receipt: first.receipt }))), /stale/);
  assert.equal(h.records.length, 1);
  assert.equal(h.rejected.length, 1);
});
it("rejects unknown and cross-agent receipts without ledger writes", async () => {
  const h = harness();
  const { receipt } = step(await h.call(dev()));
  const unknown = refused(await h.call(dev({ outcome: "ok", receipt: { ...receipt, runId: "unknown" } })));
  const other = refused(await h.call({ agent: "pm", outcome: "ok", receipt }));
  assert.equal(unknown, other);
  assert.equal(h.records.length + h.rejected.length, 0);
});
it("rechecks can-propose before returning an already open PM step", async () => {
  const h = harness();
  await h.call({ agent: "pm" });
  await h.call({ agent: "pm", outcome: "ok" });
  await h.call({ agent: "pm", outcome: "ok" });
  h.deps.openCount = async () => 2;
  assert.match(refused(await h.call({ agent: "pm" })), /not open/);
  assert.match(refused(await h.call({ agent: "pm", outcome: "handoff" })), /not open/);
});

it("template removal closes the run with rejected audit, never terminal evidence", async () => {
  const h = harness();
  const { receipt } = step(await h.call(dev()));
  h.deps.template = async () => DEV_NOSTART;
  assert.equal((await h.call(dev({ outcome: "ok", receipt }))).ok, true);
  assert.ok(h.runs[0].closedAt);
  assert.equal(h.records.length, 0);
  assert.equal(h.rejected.length, 1);
});
it("a failed retirement transaction does not close the run", async () => {
  const h = harness();
  const { receipt } = step(await h.call(dev()));
  h.deps.template = async () => DEV_NOSTART;
  h.deps.commitOutcome = async () => { throw new Error("failed"); };
  assert.match(refused(await h.call(dev({ outcome: "ok", receipt }))), /could not record/);
  assert.equal(h.runs[0].closedAt, null);
  assert.equal(h.records.length + h.rejected.length, 0);
});

// A-10. hs_는 토큰이 곧 프로젝트라 분모가 사실상 "프로젝트당"이었다. hu_ 하나가 여러 프로젝트에
// 쓰이므로, 분모에 프로젝트를 걸지 않으면 그 의미가 조용히 "사람당"으로 바뀐다.
describe("agentNext — the rate-limit denominator", () => {
  it("(m) an agent-token scope passes no project: the denominator is the whole token, as today", async () => {
    const h = harness();
    step(await h.call({ agent: "pm" }));
    assert.deepEqual(h.rateCalls, [["t1", null]]);
  });

  it("(k) filling the limit in one project leaves the same token's other project open", async () => {
    // 원장을 토큰×프로젝트로 센다 — projectId를 받은 runs.ts가 하는 일과 같은 계산이다.
    const ledger = Array.from({ length: RATE_LIMIT.calls }, () => ({ tokenId: "u1", projectId: "pA" }));
    const counter = async (tokenId: string, projectId: string | null) =>
      ledger.filter((r) => r.tokenId === tokenId && (projectId === null || r.projectId === projectId)).length;

    const full = harness({ scope: { projectId: "pA", tokenId: "u1", userScoped: true } });
    full.deps.recentSteps = counter;
    assert.match(refused(await full.call({ agent: "pm" })), /^rate limit:/);

    const other = harness({ scope: { projectId: "pB", tokenId: "u1", userScoped: true } });
    other.deps.recentSteps = counter;
    step(await other.call({ agent: "pm" })); // 같은 토큰, 다른 프로젝트 — 열려 있어야 한다

    // 프로젝트를 안 걸면(오늘의 집계) 같은 원장이 pB까지 가득 찬 것으로 읽힌다. 그게 A-10이 막는 것이다.
    assert.equal(await counter("u1", null), RATE_LIMIT.calls);
    assert.equal(await counter("u1", "pB"), 0);
  });

  it("(l) the same project over the limit is refused with the wording unchanged", async () => {
    const h = harness({ scope: { projectId: "pA", tokenId: "u1", userScoped: true }, recent: RATE_LIMIT.calls });
    assert.equal(refused(await h.call({ agent: "pm" })), `rate limit: ${RATE_LIMIT.calls} calls per 10 minutes per token`);
    assert.deepEqual(h.rateCalls, [["u1", "pA"]]);
  });
});

it("checks requires after asynchronous render-variable reads", async () => {
  const h = harness({ board: { "FEAT-1": "implementing" }, templates: { "agents/dev.md": DEV_NOSTART } });
  assert.equal(step(await h.call(dev())).step, "implement");
  h.deps.vars = async () => { h.board["FEAT-1"] = "planning"; return VARS["web-dev"]; };
  assert.match(refused(await h.call(dev())), /not open/);
});
