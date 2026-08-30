// 렌더 스냅샷: ApcH 예시로 전 템플릿을 렌더해 (1) 미치환 없음 (2) tools: 집합이 역할별 계약과 같음 (3) 상태 파일 참조 없음.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseHarnessConfig } from "../../packages/core/config.mjs";
import { renderTemplate } from "../../packages/core/render.mjs";
import { buildVars, buildWorkspaceVars } from "../../packages/core/vars.mjs";

const cfg = parseHarnessConfig(readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8"));
const tpl = (rel) => readFileSync(new URL(`./en/${rel}`, import.meta.url), "utf8");
const tools = (md) => (/^tools:\s*(.+)$/m.exec(md)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean).sort();
const MCP = (...t) => t.map((x) => `mcp__harness__${x}`);

const EXPECTED = {
  "agents/pm.md": MCP("backlog_list", "board_list", "board_propose"),
  "agents/plan-verifier.md": ["Bash", "Glob", "Grep", "Read", "Skill", ...MCP("board_get")],
  "agents/doc-auditor.md": ["Glob", "Grep", "Read", ...MCP("backlog_list")],
};
const DEV = ["Bash", "Edit", "Glob", "Grep", "Read", "Write", ...MCP("backlog_get", "board_get", "board_transition", "plan_submit", "report_submit")];
const ALL = ["CLAUDE.runbook.md", "agents/pm.md", "agents/plan-verifier.md", "agents/doc-auditor.md", "agents/feature-scout.md",
  "docs/plans/README.md", "docs/plans/template.md", "docs/plans/verification-paths.md", "docs/agents/README.md"];

describe("templates", () => {
  const vars = buildVars(cfg);
  it("render with no leftover {{ }} and no state-file references", () => {
    for (const rel of ALL) {
      const out = renderTemplate(tpl(rel), vars);
      assert.doesNotMatch(out, /\{\{/, rel);
      assert.doesNotMatch(out, /PROJECT_BOARD\.md|TASK_BACKLOG\.md|release-checks\.md/, rel);
    }
    for (const ws of cfg.workspaces) assert.doesNotMatch(renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(cfg, ws)), /\{\{/);
  });
  it("tools: lines match the per-role contract exactly", () => {
    for (const [rel, expected] of Object.entries(EXPECTED)) assert.deepEqual(tools(renderTemplate(tpl(rel), vars)), [...expected].sort(), rel);
    assert.deepEqual(tools(renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(cfg, cfg.workspaces[0]))), [...DEV].sort());
    const scout = tools(renderTemplate(tpl("agents/feature-scout.md"), vars));
    assert.ok(scout.every((t) => !t.startsWith("mcp__harness__") && t !== "Write" && t !== "Edit"), scout.join(","));
  });
  it("dev template carries workspace verify commands and roster", () => {
    const out = renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(cfg, cfg.workspaces[2]));
    assert.match(out, /python -m unittest discover/);
    assert.match(out, /`web-dev`/);
  });
});
