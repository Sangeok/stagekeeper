import assert from "node:assert/strict";
import { it } from "node:test";
import { connectionControlKey, reconnectBlock, reconnectCapReason, type ProjectConnectionSummary } from "./project-connection-state";

it("blocks reconnect without a free slot and permits it below the plan limit", () => {
  const model: ProjectConnectionSummary = { plan: "free", limit: 1, version: 2, connectedCount: 1 };
  assert.equal(reconnectBlock(model), "No free slot. The Free plan allows 1 connected repository.");
  assert.equal(reconnectBlock({ ...model, plan: "pro", limit: 5, connectedCount: 6 }), "No free slot. The Pro plan allows 5 connected repositories.");
  assert.equal(reconnectBlock({ ...model, connectedCount: 0 }), null);
  assert.equal(reconnectBlock({ ...model, plan: "max", limit: null, connectedCount: 40 }), null);
});

it("explains a server-side reconnect cap with the same slot sentence", () => {
  assert.equal(reconnectCapReason("free", 1), "No free slot. The Free plan allows 1 connected repository. Disconnect another repository first.");
  assert.equal(reconnectCapReason("pro", 5), "No free slot. The Pro plan allows 5 connected repositories. Disconnect another repository first.");
});

it("invalidates a confirmation when its target, version or plan changes", () => {
  const model: ProjectConnectionSummary = { plan: "free", limit: 1, version: 2, connectedCount: 0 };
  const key = connectionControlKey("a", model);
  for (const changed of [{ ...model, version: 3 }, { ...model, plan: "pro" as const }]) assert.notEqual(connectionControlKey("a", changed), key);
  assert.notEqual(connectionControlKey("b", model), key);
});
