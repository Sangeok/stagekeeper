import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReportTable, buildVars, buildWorkspaceVars, templateDescription } from "./vars.mjs";

const project = { owner: "team", repo: "tools", branch: "release", name: "Team tools" };

describe("vars", () => {
  it("roster table has one row per workspace in order", () => {
    const v = buildVars({ project, workspaces: [
      { agent: "jobs-dev", path: "workers/jobs" },
      { agent: "api-dev", path: "services/api" },
    ] });
    assert.equal(v.roster_table, "| agent | owns |\n| --- | --- |\n| `jobs-dev` | `workers/jobs/**` |\n| `api-dev` | `services/api/**` |");
    assert.equal(v.roster_names, "`jobs-dev`·`api-dev`");
    assert.equal(v.board_branch, "release");
    assert.deepEqual(v.project, project);
  });
  it("workspace vars: verify block, result line, read-only and out-of-scope lists", () => {
    const workspace = {
      agent: "api-dev", path: "services/api", verify: ['node --test "test/*.test.mjs"', "npm run lint"],
      readOnly: ["packages/contracts/**", "config/runtime.json"], knowledge: "services/api/AGENTS.md",
    };
    const config = { project, workspaces: [
      { agent: "cli-dev", path: "apps/cli" }, workspace, { agent: "jobs-dev", path: "workers/jobs" },
    ] };
    const v = buildWorkspaceVars(config, workspace);
    assert.equal(v.ws.agent, "api-dev");
    assert.equal(v.ws.path, "services/api");
    assert.equal(v.ws.verify_block, '```bash\nnode --test "test/*.test.mjs"\nnpm run lint\n```');
    assert.equal(v.ws.verify_result_line, 'Verification: node --test "test/*.test.mjs" <result> / npm run lint <result>');
    assert.equal(v.ws.read_only_list, "- `packages/contracts/**`\n- `config/runtime.json`");
    assert.equal(v.ws.out_of_scope_list, "- `apps/cli/**`\n- `workers/jobs/**`");
    assert.equal(v.ws.knowledge, "services/api/AGENTS.md");
    assert.equal(v.ws.knowledge_line, "Your workspace knowledge doc is `services/api/AGENTS.md` — read it before you write.");
  });
  it("empty lists render as 'none'", () => {
    const workspace = { agent: "dev", path: ".", verify: ["npm test"], readOnly: [], knowledge: null };
    const v = buildWorkspaceVars({ project, workspaces: [workspace] }, workspace);
    assert.equal(v.ws.read_only_list, "none"); assert.equal(v.ws.out_of_scope_list, "none");
    assert.equal(v.ws.knowledge, "(none — this workspace has no knowledge doc yet. Say so in the plan)");
    assert.equal(v.ws.knowledge_line, "This workspace has no knowledge doc. Say so in the plan rather than inventing its conventions.");
    assert.doesNotMatch(v.ws.knowledge_line, /`/);
  });
  it("report table has one row per delivered agent, in order, with that agent's own description", () => {
    const table = buildReportTable([{ name: "pm", description: "Picks work." }, { name: "feature-scout", description: "Researches." }]);
    assert.equal(table, "| agent | does |\n| --- | --- |\n| `pm` | Picks work. |\n| `feature-scout` | Researches. |");
    assert.equal(buildReportTable([]), "none");
  });
  it("templateDescription reads the frontmatter line and refuses a template without one", () => {
    assert.equal(templateDescription("---\nname: pm\ndescription: Picks work. Never reads code.\ntools: x\n---\n# Role\n", "en/agents/pm.md"), "Picks work. Never reads code.");
    assert.equal(templateDescription("---\r\nname: pm\r\ndescription: Picks work.\r\n---\r\n", "pm"), "Picks work.");
    assert.throws(() => templateDescription("---\nname: pm\n---\ndescription: not here\n", "en/agents/pm.md"), /^Error: en\/agents\/pm\.md: no description in frontmatter$/);
  });
});
