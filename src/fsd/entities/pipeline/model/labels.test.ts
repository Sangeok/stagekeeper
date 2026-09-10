// 레일 카드의 두 줄(노드 이름 · 그 노드를 도는 사람)이 서로 다른 것을 말하는지 본다 —
// 둘이 같으면 카드가 "Propose / Propose"가 되어 누가 도는지 알려 주지 못한다.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NODE_KINDS } from "@harness/core/pipeline.mjs";
import { gateLabel, nodeAgentLabel, nodeLabel } from "./labels";

const ROSTER = ["dev", "web-dev"];

describe("nodeLabel · gateLabel", () => {
  it("names every node kind in the skeleton", () => {
    assert.deepEqual(
      (NODE_KINDS as string[]).map(nodeLabel),
      ["Propose", "Plan", "Verify", "Implement", "Accept", "Doc audit", "Scout"],
    );
  });

  it("reads as English after 'waiting' — the banner and the inbox card both say it that way", () => {
    assert.equal(gateLabel("before-implement"), "before Implement");
    assert.equal(gateLabel("before-doc-audit"), "before Doc audit");
  });
});

describe("nodeAgentLabel", () => {
  it("names the agent the node dispatches, not the node", () => {
    assert.equal(nodeAgentLabel("propose", ROSTER), "pm");
    assert.equal(nodeAgentLabel("verify", ROSTER), "plan-verifier");
    assert.equal(nodeAgentLabel("doc-audit", ROSTER), "doc-auditor");
    assert.equal(nodeAgentLabel("scout", ROSTER), "feature-scout");
  });

  it("uses the workspace roster where the item's own dev runs the node", () => {
    assert.equal(nodeAgentLabel("plan", ROSTER), "dev, web-dev");
    assert.equal(nodeAgentLabel("implement", ROSTER), "dev, web-dev");
  });

  it("is empty at accept — nobody is dispatched there, the main loop runs it", () => {
    assert.equal(nodeAgentLabel("accept", ROSTER), "");
  });

  it("never repeats the node name back", () => {
    for (const kind of NODE_KINDS as string[]) {
      if (kind === "accept") continue;
      assert.notEqual(nodeAgentLabel(kind, ROSTER), nodeLabel(kind), `${kind}: 카드 두 줄이 같은 말을 한다`);
    }
  });
});
