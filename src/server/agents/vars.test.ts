import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseHarnessConfig } from "@harness/core/configuration/harness-config.mjs";
import { DEFAULT_SCOUT_QUESTION, buildVars, buildWorkspaceVars } from "@harness/core/templates/vars.mjs";

import { serverVars, type WorkspaceRow } from "./vars";

const cfg = parseHarnessConfig(readFileSync(new URL("../../../examples/apch/harness.json", import.meta.url), "utf8"));
const project = { owner: cfg.project.owner, repo: cfg.project.repo, branch: cfg.project.branch, name: cfg.project.name };
type Ws = (typeof cfg.workspaces)[number];
const rows: WorkspaceRow[] = cfg.workspaces.map((w: Ws) => ({
  wsId: w.id, path: w.path, agent: w.agent, verify: w.verify, knowledge: w.knowledge ?? null, readOnly: w.readOnly ?? [],
}));

describe("serverVars", () => {
  it("a workspace agent gets buildWorkspaceVars for its row", () => {
    for (const ws of cfg.workspaces) {
      const expected = { ...buildWorkspaceVars(cfg, ws), scout: { question: DEFAULT_SCOUT_QUESTION }, release: { baseUrl: "", auth: "none" } };
      assert.deepEqual(serverVars(project, rows, ws.agent), expected, ws.agent);
    }
  });
  it("a report agent gets buildVars — roster from the rows, scout and release at their defaults", () => {
    const expected = { ...buildVars(cfg), scout: { question: DEFAULT_SCOUT_QUESTION }, release: { baseUrl: "", auth: "none" } };
    assert.deepEqual(serverVars(project, rows, "pm"), expected);
    assert.equal("ws" in serverVars(project, rows, "plan-verifier"), false);
  });
});
