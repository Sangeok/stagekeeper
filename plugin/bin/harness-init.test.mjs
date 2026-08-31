import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("./harness-init.mjs", import.meta.url));
const APCH = readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8");

// 템플릿 원문은 저장소에 없다 — 서버가 인증된 요청에만 내려준다. 여기서 검증하는 것은 생성기의 동작
// (무엇을 쓰고·건너뛰고·거부하는가)이지 템플릿 내용이 아니므로, 최소 픽스처를 로컬 우회로로 물린다.
const TPL_DIR = mkdtempSync(join(tmpdir(), "harness-tpl-"));
for (const [rel, body] of Object.entries({
  "docs/plans/README.md": "# Plans — {{project.name}}\n",
  "docs/plans/template.md": "# Plan\n",
  "docs/plans/verification-paths.md": "# Verification paths\n",
  "docs/agents/README.md": "# Agents\n{{roster_table}}\n",
  "agents/pm.md": "---\nname: pm\n---\nroster {{roster_names}}\n",
  "agents/plan-verifier.md": "---\nname: plan-verifier\n---\n",
  "agents/doc-auditor.md": "---\nname: doc-auditor\n---\n",
  "agents/feature-scout.md": "---\nname: feature-scout\n---\n{{scout.question}}\n",
  "agents/dev.md": "---\nname: {{ws.agent}}\n---\nowns {{ws.path}}\n{{ws.verify_block}}\n",
  "CLAUDE.runbook.md": "## Harness\nbranch {{board_branch}}\n",
})) {
  const full = join(TPL_DIR, "en", rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

const run = (root, ...args) => {
  const env = { ...process.env, HARNESS_TEMPLATES_DIR: TPL_DIR };
  try { return { code: 0, out: execFileSync("node", [BIN, "--root", root, "--server", "https://h.example", ...args], { encoding: "utf8", env }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
const fresh = (cfg = APCH) => { const root = mkdtempSync(join(tmpdir(), "harness-")); writeFileSync(join(root, "harness.json"), cfg); return root; };

describe("harness-init (v2)", () => {
  it("materializes agents, docs, runbook, .mcp.json, lock — and no state files", () => {
    const root = fresh();
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    for (const p of ["CLAUDE.md", ".mcp.json", "harness.lock.json", "docs/plans/README.md", "docs/plans/template.md", "docs/plans/verification-paths.md",
      "docs/agents/README.md", ".claude/agents/pm.md", ".claude/agents/plan-verifier.md", ".claude/agents/doc-auditor.md", ".claude/agents/feature-scout.md",
      ".claude/agents/web-dev.md", ".claude/agents/admin-dev.md", ".claude/agents/backend-dev.md"]) assert.ok(existsSync(join(root, p)), `missing ${p}`);
    for (const p of ["PROJECT_BOARD.md", "TASK_BACKLOG.md", "docs/release-checks.md", "scripts"]) assert.ok(!existsSync(join(root, p)), `unexpected ${p}`);
    const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers.harness.url, "https://h.example/api/mcp");
    assert.equal(mcp.mcpServers.harness.headers.Authorization, "Bearer ${HARNESS_TOKEN}");
    assert.doesNotMatch(readFileSync(join(root, ".claude/agents/backend-dev.md"), "utf8"), /\{\{/);
    const lock = JSON.parse(readFileSync(join(root, "harness.lock.json"), "utf8"));
    assert.equal(lock.version, 1);
    assert.ok(!(".mcp.json" in lock.files) && !("CLAUDE.md" in lock.files)); // 병합 파일은 잠그지 않는다
  });
  it("merges .mcp.json, preserving other servers", () => {
    const root = fresh();
    writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { notion: { url: "https://mcp.notion.com/mcp" } } }));
    assert.equal(run(root).code, 0);
    const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers.notion.url, "https://mcp.notion.com/mcp");
    assert.equal(mcp.mcpServers.harness.url, "https://h.example/api/mcp");
  });
  it("second run: unchanged files rewritten, user-edited file skipped", () => {
    const root = fresh();
    assert.equal(run(root).code, 0);
    writeFileSync(join(root, ".claude/agents/pm.md"), "edited by user\n");
    const r = run(root);
    assert.equal(r.code, 0);
    assert.match(r.out, /skip\(modified\): \.claude\/agents\/pm\.md/);
    assert.equal(readFileSync(join(root, ".claude/agents/pm.md"), "utf8"), "edited by user\n");
  });
  it("refuses unknown existing generated-path files without --adopt; adopt replaces", () => {
    const root = fresh();
    mkdirSync(join(root, "docs/agents"), { recursive: true });
    writeFileSync(join(root, "docs/agents/README.md"), "theirs\n");
    const r = run(root);
    assert.equal(r.code, 3);
    assert.match(r.out, /refuse: docs\/agents\/README\.md/);
    assert.ok(!existsSync(join(root, "harness.lock.json")));
    assert.equal(run(root, "--adopt").code, 0);
    assert.notEqual(readFileSync(join(root, "docs/agents/README.md"), "utf8"), "theirs\n");
  });
  it("omits feature-scout when config has no scout", () => {
    const root = fresh(JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] }));
    assert.equal(run(root).code, 0);
    assert.ok(!existsSync(join(root, ".claude/agents/feature-scout.md")));
    assert.ok(existsSync(join(root, ".claude/agents/dev.md")));
  });
  it("exit 1 with the field path on bad config", () => {
    const root = fresh(JSON.stringify({ version: 2 }));
    const r = run(root); assert.equal(r.code, 1); assert.match(r.out, /version/);
  });
});
