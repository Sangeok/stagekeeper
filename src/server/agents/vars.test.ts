import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clientRuntime } from "@harness/core/execution/client-runtime.mjs";
import { DEFAULT_SCOUT_QUESTION } from "@harness/core/templates/vars.mjs";

import { serverVars, type ProjectRow, type WorkspaceRow } from "./vars";

const project: ProjectRow = { owner: "stored-org", repo: "stored-repo", branch: "stable", name: "Stored project" };
const workspaceRows = (): WorkspaceRow[] => [
  {
    wsId: "queue", path: "workers/queue", agent: "queue-dev", verify: ["npm run check", "npm test"],
    knowledge: "workers/queue/AGENTS.md", readOnly: ["packages/events/**"],
  },
  { wsId: "http", path: "services/http", agent: "http-dev", verify: ["npm test"], knowledge: null, readOnly: [] },
];
const expectedReportVars = {
  runtime: clientRuntime("claude"),
  project,
  board_branch: "stable",
  roster_table: "| agent | owns |\n| --- | --- |\n| `queue-dev` | `workers/queue/**` |\n| `http-dev` | `services/http/**` |",
  roster_names: "`queue-dev`·`http-dev`",
  scout: { question: DEFAULT_SCOUT_QUESTION },
  release: { baseUrl: "", auth: "none" },
};

describe("serverVars", () => {
  for (const [agent, expectedWorkspace] of [
    ["queue-dev", {
      agent: "queue-dev",
      path: "workers/queue",
      knowledge: "workers/queue/AGENTS.md",
      knowledge_line: "Your workspace knowledge doc is `workers/queue/AGENTS.md` — read it before you write.",
      verify_block: "```bash\nnpm run check\nnpm test\n```",
      verify_result_line: "Verification: npm run check <result> / npm test <result>",
      read_only_list: "- `packages/events/**`",
      out_of_scope_list: "- `services/http/**`",
    }],
    ["http-dev", {
      agent: "http-dev",
      path: "services/http",
      knowledge: "(none — this workspace has no knowledge doc yet. Say so in the plan)",
      knowledge_line: "This workspace has no knowledge doc. Say so in the plan rather than inventing its conventions.",
      verify_block: "```bash\nnpm test\n```",
      verify_result_line: "Verification: npm test <result>",
      read_only_list: "none",
      out_of_scope_list: "- `workers/queue/**`",
    }],
  ] as const) {
    it(`maps the stored workspace for ${agent} without leaking the other workspace's fields`, () => {
      assert.deepEqual(serverVars(project, workspaceRows(), agent), { ...expectedReportVars, ws: expectedWorkspace });
    });
  }
  it("gives report agents the stored roster and defaults without workspace fields", () => {
    for (const agent of ["pm", "plan-verifier"]) {
      assert.deepEqual(serverVars(project, workspaceRows(), agent), expectedReportVars);
    }
  });
});
