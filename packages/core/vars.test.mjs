import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseHarnessConfig } from "./config.mjs";
import { buildVars, buildWorkspaceVars } from "./vars.mjs";

const cfg = parseHarnessConfig(readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8"));

describe("vars", () => {
  it("roster table has one row per workspace in order", () => {
    const v = buildVars(cfg);
    assert.match(v.roster_table, /^\| agent \| owns \|\n\| --- \| --- \|\n/);
    assert.match(v.roster_table, /\| `web-dev` \| `apps\/web\/\*\*` \|\n\| `admin-dev` \| `apps\/admin\/\*\*` \|\n\| `backend-dev` \| `apps\/backend\/\*\*` \|$/);
    assert.equal(v.roster_names, "`web-dev`·`admin-dev`·`backend-dev`");
    assert.equal(v.board_branch, "dev");
  });
  it("workspace vars: verify block, result line, read-only and out-of-scope lists", () => {
    const v = buildWorkspaceVars(cfg, cfg.workspaces[2]);
    assert.equal(v.ws.agent, "backend-dev");
    assert.equal(v.ws.verify_block, "```bash\npython -m unittest discover -s apps/backend -p \"test_*.py\"\npython -m py_compile apps/backend/main.py\n```");
    assert.equal(v.ws.verify_result_line, "Verification: python -m unittest discover -s apps/backend -p \"test_*.py\" <result> / python -m py_compile apps/backend/main.py <result>");
    assert.equal(v.ws.read_only_list, "- `apps/backend/asd/**`\n- `apps/backend/requirements.txt`");
    assert.equal(v.ws.out_of_scope_list, "- `apps/web/**`\n- `apps/admin/**`");
    assert.equal(v.ws.knowledge, "apps/backend/CLAUDE.md");
  });
  it("empty lists render as 'none'", () => {
    const one = parseHarnessConfig({ version: 1, project: { owner: "o", repo: "r", branch: "main" },
      workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] });
    const v = buildWorkspaceVars(one, one.workspaces[0]);
    assert.equal(v.ws.read_only_list, "none"); assert.equal(v.ws.out_of_scope_list, "none");
    assert.equal(v.ws.knowledge, "(none — this workspace has no knowledge doc yet. Say so in the plan)");
  });
});
