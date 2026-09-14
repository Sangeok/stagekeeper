import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadProjectView, PROJECT_GET_SELECT, type ProjectFinder, type ProjectQueryView } from "./project-query";

const project: ProjectQueryView = {
  id: "project-1",
  slug: "stagekeeper",
  name: "Stagekeeper",
  repoOwner: "octocat",
  repo: "stagekeeper",
  branch: "main",
  language: "ko",
  executorKind: "local",
  commandIssue: null,
  runbookVersion: null,
  createdAt: new Date("2026-09-13T00:00:00Z"),
  workspaces: [{
    id: "workspace-1",
    projectId: "project-1",
    wsId: "web",
    path: "apps/web",
    agent: "dev",
    verify: ["npm test", "npm run build"],
    knowledge: null,
    readOnly: ["docs/**"],
  }],
};

describe("loadProjectView", () => {
  it("uses the explicit legacy Project and Workspace projection", async () => {
    const calls: unknown[] = [];
    const finder: ProjectFinder = async (args) => {
      calls.push(args);
      return project;
    };

    const result = await loadProjectView(finder, "project-1");

    assert.deepEqual(calls, [{ where: { id: "project-1" }, select: PROJECT_GET_SELECT }]);
    const { repoOwner, ...rest } = project;
    assert.deepEqual(result, { ...rest, owner: repoOwner });
    assert.equal("ownerUserId" in result, false);
    assert.equal("repoOwner" in result, false);
    assert.equal("available" in result, false);
  });
});
