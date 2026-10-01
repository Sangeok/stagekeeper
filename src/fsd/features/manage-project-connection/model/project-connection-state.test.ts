import assert from "node:assert/strict";
import { it } from "node:test";
import { connectionControlKey, reconnectBlock, type ProjectConnectionModel } from "./project-connection-state";

it("blocks reconnect without a free slot and permits it below the plan limit", () => {
  const model: ProjectConnectionModel = { plan: "free", limit: 1, version: 2, connectedCount: 1, projects: [] };
  assert.equal(reconnectBlock(model), "No free slot. The Free plan allows 1 connected repository.");
  assert.equal(reconnectBlock({ ...model, plan: "pro", limit: 5, connectedCount: 6 }), "No free slot. The Pro plan allows 5 connected repositories.");
  assert.equal(reconnectBlock({ ...model, connectedCount: 0 }), null);
  assert.equal(reconnectBlock({ ...model, plan: "max", limit: null, connectedCount: 40 }), null);
});

it("invalidates a confirmation when its target, version or plan changes", () => {
  const model: ProjectConnectionModel = { plan: "free", limit: 1, version: 2, connectedCount: 0, projects: [] };
  const key = connectionControlKey("a", model);
  for (const changed of [{ ...model, version: 3 }, { ...model, plan: "pro" as const }]) assert.notEqual(connectionControlKey("a", changed), key);
  assert.notEqual(connectionControlKey("b", model), key);
});
