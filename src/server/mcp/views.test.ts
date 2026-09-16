import assert from "node:assert/strict";
import { it } from "node:test";
import { backlogView, backlogWithStatusView } from "./views";

it("preserves the public backlog JSON fields while excluding future database fields", () => {
  const item = { id: "i", projectId: "p", key: "K", title: "title", area: "web", source: "test", createdAt: new Date(0), removedAt: null };
  const row = { ...item, internal: "private", status: "planning" };
  assert.deepEqual(backlogView(row), item);
  assert.deepEqual(backlogWithStatusView(row), { ...item, status: "planning" });
});
