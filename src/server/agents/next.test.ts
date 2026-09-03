import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RATE_LIMIT, REFUSAL_WARN_AT, agentNext, type NextDeps, type NextInput, type Outcome } from "./next";

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

const VARS: Record<string, Record<string, unknown>> = {
  "web-dev": { ws: { agent: "web-dev", knowledge: "apps/web/CLAUDE.md", verify_block: "```bash\nnpm test\n```" }, roster_table: "| web-dev |" },
  pm: { roster_table: "| web-dev |" },
  "plan-verifier": { roster_table: "| web-dev |" },
};

type Run = { id: string; agent: string; key: string | null; stepId: string; closedAt: Date | null; refused: number; tokenId: string };
type Rec = { runId: string; stepId: string; outcome: Outcome; note: string | null };
type Opts = {
  plan?: "free" | "pro" | "max"; locked?: string; roster?: string[]; templates?: Record<string, string>;
  board?: Record<string, string>; openCount?: number; recent?: number; verifiedElsewhere?: boolean;
};

const SCOPE = { projectId: "p1", tokenId: "t1" };

function harness(opts: Opts = {}) {
  const runs: Run[] = [];
  const records: Rec[] = [];
  const board = opts.board ?? {};
  const templates = opts.templates ?? { "agents/dev.md": DEV, "agents/pm.md": PM };
  let seq = 0;
  const plan = opts.plan ?? "pro";
  const deps: NextDeps = {
    access: async () => (opts.locked ? { plan, locked: true, reason: opts.locked } : { plan, locked: false }),
    roster: async () => opts.roster ?? ["web-dev"],
    template: async (_p, path) => templates[path] ?? null,
    vars: async (_p, agent) => VARS[agent],
    recentSteps: async () => opts.recent ?? records.length,
    openRun: async (_p, agent, key) => runs.filter((r) => r.agent === agent && r.key === key && !r.closedAt).at(-1) ?? null,
    createRun: async (scope, agent, key, stepId) => {
      const r: Run = { id: `run${++seq}`, agent, key, stepId, closedAt: null, refused: 0, tokenId: scope.tokenId };
      runs.push(r);
      return r;
    },
    boardStatus: async (_p, key) => board[key] ?? null,
    openCount: async () => opts.openCount ?? 0,
    verifyOk: async (_p, agent, key) => opts.verifiedElsewhere === true
      || records.some((rec) => rec.stepId === "verify" && rec.outcome === "ok"
        && runs.some((r) => r.id === rec.runId && r.agent === agent && r.key === key)),
    record: async (runId, step) => { records.push({ runId, ...step }); },
    advance: async (runId, from, to) => {
      const r = runs.find((x) => x.id === runId);
      if (!r || r.stepId !== from || r.closedAt) return false;
      if (to === null) r.closedAt = new Date(); else r.stepId = to;
      return true;
    },
    refused: async (runId) => ++runs.find((x) => x.id === runId)!.refused,
  };
  const call = (input: NextInput) => agentNext(deps, SCOPE, input);
  return { call, runs, records, board, deps };
}

const dev = (extra: Partial<NextInput> = {}): NextInput => ({ agent: "web-dev", key: "FEAT-1", ...extra });

function step(r: Awaited<ReturnType<typeof agentNext>>) {
  assert.ok(r.ok, r.ok ? "" : r.reason);
  assert.equal(r.item.done, false);
  return r.item as { step: string; instruction: string; done: false };
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

describe("agentNext — run lifecycle", () => {
  it("after done: a call without outcome opens a fresh run; a call with outcome gets {done: true} and opens nothing", async () => {
    const h = harness({ board: { "FEAT-1": "planning" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));                                  // start → plan
    assert.deepEqual(await h.call(dev({ outcome: "ok" })), { ok: true, item: { done: true } });
    // dev의 report·hold는 board_transition 뒤에 ok를 보낸다 — 그 호출이 run을 열면 start로 되돌아간다
    assert.deepEqual(await h.call(dev({ outcome: "ok" })), { ok: true, item: { done: true } });
    assert.equal(h.runs.length, 1);
    assert.equal(step(await h.call(dev())).step, "start");
    assert.equal(h.runs.length, 2);
  });
  it("a run closed by the server (item moved) behaves the same: outcome → done, no outcome → new run", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" } });
    await h.call(dev());
    step(await h.call(dev({ outcome: "ok" })));
    h.runs[0].closedAt = new Date();                                           // board.transition이 닫은 것과 같다
    assert.deepEqual(await h.call(dev({ outcome: "ok" })), { ok: true, item: { done: true } });
    assert.equal(step(await h.call(dev())).step, "start");
  });
  it("a concurrent advance loses the CAS and is told to re-read", async () => {
    const h = harness({ board: { "FEAT-1": "implementing" } });
    await h.call(dev());
    const advance = h.deps.advance;
    h.deps.advance = async (runId, from, to) => { await advance(runId, from, to); return false; };
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
