import assert from "node:assert/strict";
import { it } from "node:test";
import { activeProjectTab, itemPath, PROJECT_TABS, projectPath } from "./project";

it("places History between Pipeline and Tokens and resolves every tab", () => {
  assert.deepEqual(PROJECT_TABS.map(t => t.label), ["Board", "Inbox", "Backlog", "Pipeline", "History", "Tokens"]);
  for (const tab of PROJECT_TABS) assert.equal(activeProjectTab(projectPath("sample", tab.segment), "sample"), tab.id);
  assert.equal(projectPath("sample", "/history"), "/p/sample/history");
  assert.equal(activeProjectTab(itemPath("sample", "K-1"), "sample"), null);
  assert.equal(activeProjectTab("/p/other/history", "sample"), null);
});
