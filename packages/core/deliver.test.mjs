import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REPORT_AGENTS } from "./entitlement.mjs";
import { STEP_HEADING, deliverable, stubOf } from "./deliver.mjs";

const AGENT = "---\nname: pm\ntools: mcp__harness__agent_next\n---\nRole line.\n\n## step:start\nOrientation.\nnext: done\n";
const ROWS = [
  { path: "agents/pm.md", body: AGENT },
  { path: "agents/plan-verifier.md", body: AGENT.replace("pm", "plan-verifier") },
  { path: "agents/doc-auditor.md", body: AGENT.replace("pm", "doc-auditor") },
  { path: "agents/feature-scout.md", body: AGENT.replace("pm", "feature-scout") },
  { path: "agents/dev.md", body: AGENT.replace("pm", "{{ws.agent}}") },
  { path: "CLAUDE.runbook.md", body: "## Harness\nfull pipeline\n" },
  { path: "CLAUDE.runbook.free.md", body: "## Harness\nfree pipeline\n" },
  { path: "docs/plans/README.md", body: "# Plans\n" },
];
const keys = (d) => Object.keys(d.templates).sort();

describe("stubOf", () => {
  it("cuts at the first step heading, keeping frontmatter, ending with one newline", () => {
    assert.equal(stubOf(AGENT), "---\nname: pm\ntools: mcp__harness__agent_next\n---\nRole line.\n");
  });
  it("returns a step-less body unchanged", () => {
    assert.equal(stubOf("# Plans\n"), "# Plans\n");
  });
  it("uses the same heading as the parser (id after the colon, no space)", () => {
    assert.ok(STEP_HEADING.test("## step:start   requires: planning"));
    assert.ok(!STEP_HEADING.test("## step: start"));
    assert.ok(!STEP_HEADING.test("### step:start"));
  });
});

describe("deliverable", () => {
  it("max: every agent as a stub, the full runbook, docs as they are; the free runbook key is never a template", () => {
    const d = deliverable(ROWS, "max");
    assert.deepEqual(keys(d), ["CLAUDE.runbook.md", "agents/dev.md", "agents/doc-auditor.md", "agents/feature-scout.md", "agents/plan-verifier.md", "agents/pm.md", "docs/plans/README.md"]);
    for (const a of ["pm", "plan-verifier", "doc-auditor", "feature-scout", "dev"]) assert.doesNotMatch(d.templates[`agents/${a}.md`], /## step:/, a);
    assert.match(d.templates["agents/dev.md"], /\{\{ws\.agent\}\}/); // 스텁은 클라이언트가 렌더한다
    assert.equal(d.templates["CLAUDE.runbook.md"], "## Harness\nfull pipeline\n");
    assert.equal(d.templates["docs/plans/README.md"], "# Plans\n");
    assert.deepEqual(d.entitlement, { plan: "max", agents: REPORT_AGENTS });
  });
  it("free: plan-verifier and doc-auditor stubs are left out, the runbook is the free variant under the normal key", () => {
    const d = deliverable(ROWS, "free");
    assert.deepEqual(keys(d), ["CLAUDE.runbook.md", "agents/dev.md", "agents/feature-scout.md", "agents/pm.md", "docs/plans/README.md"]);
    assert.equal(d.templates["CLAUDE.runbook.md"], "## Harness\nfree pipeline\n");
    assert.deepEqual(d.entitlement, { plan: "free", agents: ["pm", "feature-scout"] });
  });
  it("free without a free runbook seeded: the normal runbook stays (a seed problem, not a user error)", () => {
    const d = deliverable(ROWS.filter((r) => r.path !== "CLAUDE.runbook.free.md"), "free");
    assert.equal(d.templates["CLAUDE.runbook.md"], "## Harness\nfull pipeline\n");
  });
  it("pro: same agents as max", () => {
    assert.deepEqual(deliverable(ROWS, "pro").entitlement.agents, REPORT_AGENTS);
  });
  it("rejects an unknown plan", () => {
    assert.throws(() => deliverable(ROWS, "gold"), /unknown plan/);
  });
});
