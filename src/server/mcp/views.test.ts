import assert from "node:assert/strict";
import { it } from "node:test";
import { backlogView, backlogWithStatusView, boardWithBacklogView } from "./views";

it("preserves the public backlog JSON fields while excluding future database fields", () => {
  const item = { id: "i", projectId: "p", key: "K", title: "title", area: "web", source: "test", type: "fix", addedBy: "feature-scout", removedReason: null, createdAt: new Date(0), removedAt: null };
  const row = { ...item, internal: "private", addedByRunId: "private-run", typeSetBy: "feature-scout", status: "planning" };
  assert.deepEqual(backlogView(row), item);
  assert.deepEqual(boardWithBacklogView({ id: "b", backlogItem: row, events: ["history"], reports: ["report"] }),
    { id: "b", backlogItem: item, events: ["history"], reports: ["report"] });
  assert.deepEqual(backlogWithStatusView(row), { ...item, status: "planning" });
});
