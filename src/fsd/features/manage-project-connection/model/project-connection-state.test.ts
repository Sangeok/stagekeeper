import assert from "node:assert/strict";
import { it } from "node:test";
import { connectionControlKey, type ProjectConnectionModel } from "./project-connection-state";

it("invalidates a confirmation when its target, version, plan or write switch changes", () => {
  const model: ProjectConnectionModel = { plan: "free", limit: 1, version: 2, connectedCount: 0, writesEnabled: true, projects: [] };
  const key = connectionControlKey("a", model);
  for (const changed of [{ ...model, version: 3 }, { ...model, plan: "pro" as const }, { ...model, writesEnabled: false }]) assert.notEqual(connectionControlKey("a", changed), key);
  assert.notEqual(connectionControlKey("b", model), key);
});
