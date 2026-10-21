import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { gateTooltip } from "./gate-copy";

const PLAN = "The item waits here until you press Request plan in the Inbox. Requesting lets dev write a plan. Then continue in your coding client. Nothing changes in the code yet.";
const IMPLEMENT = "The item waits here until you press Approve implementation in the Inbox. Approving lets dev change code. Then continue in your coding client.";
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

  it("names the implementation check and QA gates by their Inbox buttons", () => {
    assert.equal(gateTooltip("before-impl-verify"), "The item waits here until you press Continue to implementation check in the Inbox. impl-verifier re-reads the change in a fresh context and checks that the tests catch it.");
    assert.equal(gateTooltip("before-qa"), "The item waits here until you press Continue to QA in the Inbox. qa-verifier tests the implemented user flows in the configured test environment.");
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
