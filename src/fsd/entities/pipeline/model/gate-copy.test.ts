// 레일의 게이트 카드 툴팁이 그 게이트의 Inbox 버튼 이름과 힌트를 그대로 말하는지 본다(product-copy.md §18).
// 매핑이 빠지면 "Move past before-…" 같은 대체 문구가 사용자에게 보인다 — 반복 슬롯이 가장 빠지기 쉽다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gateTooltip } from "./gate-copy";

const PLAN = "The item waits here until you press Request plan in the Inbox. dev writes a plan. Nothing changes in the code yet.";
const IMPLEMENT = "The item waits here until you press Approve implementation in the Inbox. Approving lets dev change code. Then you run dev in Claude Code.";
const VERIFY = "The item waits here until you press Continue to verification in the Inbox. The main loop verifies the plan; plan-verifier runs an independent pass.";
const ACCEPT = "The item waits here until you press Continue to acceptance in the Inbox. The main loop reproduces the five acceptance checks.";
const DOC_AUDIT = "The item waits here until you press Continue to doc audit in the Inbox. doc-auditor checks whether the docs still match the code.";
const SCOUT = "The item waits here until you press Continue to scouting in the Inbox. feature-scout researches outside and proposes features.";

describe("gateTooltip", () => {
  it("names the gate's own Inbox button and what pressing it does", () => {
    const cases: [string, string][] = [
      ["before-plan", PLAN],
      ["before-implement", IMPLEMENT],
      ["before-verify", VERIFY],
      ["before-accept", ACCEPT],
    ];
    for (const [gate, want] of cases) assert.equal(gateTooltip(gate), want, gate);
  });

  it("gives a repeated or renamed project-agent slot its original slot's words", () => {
    const cases: [string, string][] = [
      ["before-doc-audit", DOC_AUDIT],
      ["before-doc-auditor", DOC_AUDIT],
      ["before-doc-auditor#2", DOC_AUDIT],
      ["before-scout", SCOUT],
      ["before-feature-scout", SCOUT],
      ["before-feature-scout#3", SCOUT],
    ];
    for (const [gate, want] of cases) assert.equal(gateTooltip(gate), want, gate);
  });
});
