import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseHarnessConfig } from "@harness/core/config.mjs";
import { buildVars, buildWorkspaceVars } from "@harness/core/vars.mjs";

import { serverVars, type WorkspaceRow } from "./vars";

// DB 행(Project + Workspace[])에서 만든 vars가 harness.json에서 만든 vars와 같아야 한다 — 스텁(클라이언트 렌더)과
// 단계 본문(서버 렌더)이 같은 값을 본다. scout·release는 DB에 없으므로 기본값으로 떨어지는 것만 다르다.
const cfg = parseHarnessConfig(readFileSync(new URL("../../../examples/apch/harness.json", import.meta.url), "utf8"));
const project = { owner: cfg.project.owner, repo: cfg.project.repo, branch: cfg.project.branch, name: cfg.project.name };
type Ws = (typeof cfg.workspaces)[number];
const rows: WorkspaceRow[] = cfg.workspaces.map((w: Ws) => ({
  wsId: w.id, path: w.path, agent: w.agent, verify: w.verify, knowledge: w.knowledge ?? null, readOnly: w.readOnly ?? [],
}));

describe("serverVars", () => {
  it("a workspace agent gets buildWorkspaceVars for its row", () => {
    for (const ws of cfg.workspaces) {
      const expected = { ...buildWorkspaceVars(cfg, ws), scout: { question: "" }, release: { baseUrl: "", auth: "none" } };
      assert.deepEqual(serverVars(project, rows, ws.agent), expected, ws.agent);
    }
  });
  it("a report agent gets buildVars — roster from the rows, scout and release at their defaults", () => {
    const expected = { ...buildVars(cfg), scout: { question: "" }, release: { baseUrl: "", auth: "none" } };
    assert.deepEqual(serverVars(project, rows, "pm"), expected);
    assert.equal("ws" in serverVars(project, rows, "plan-verifier"), false);
  });
});
