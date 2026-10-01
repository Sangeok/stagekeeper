import assert from "node:assert/strict";
import { it } from "node:test";
import { connectionControlKey, reconnectBlock, type ProjectConnectionModel } from "./project-connection-state";

it("blocks reconnect without a free slot or while writes are off, and says which", () => {
  const model: ProjectConnectionModel = { plan: "free", limit: 1, version: 2, connectedCount: 1, writesEnabled: true, projects: [] };
  assert.equal(reconnectBlock(model), "No free slot. The Free plan allows 1 connected repository.");
  assert.equal(reconnectBlock({ ...model, plan: "pro", limit: 5, connectedCount: 6 }), "No free slot. The Pro plan allows 5 connected repositories.");
  assert.equal(reconnectBlock({ ...model, writesEnabled: false }), "Repository connection changes are temporarily unavailable.");
  assert.equal(reconnectBlock({ ...model, connectedCount: 0 }), null);
  assert.equal(reconnectBlock({ ...model, plan: "max", limit: null, connectedCount: 40 }), null);
});

it("invalidates a confirmation when its target, version, plan or write switch changes", () => {
  const model: ProjectConnectionModel = { plan: "free", limit: 1, version: 2, connectedCount: 0, writesEnabled: true, projects: [] };
  const key = connectionControlKey("a", model);
  for (const changed of [{ ...model, version: 3 }, { ...model, plan: "pro" as const }, { ...model, writesEnabled: false }]) assert.notEqual(connectionControlKey("a", changed), key);
  assert.notEqual(connectionControlKey("b", model), key);
});
