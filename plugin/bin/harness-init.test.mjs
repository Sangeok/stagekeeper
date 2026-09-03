import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deliverable } from "../lib/deliver.mjs";
import { REPORT_AGENTS } from "../lib/entitlement.mjs";

const BIN = fileURLToPath(new URL("./harness-init.mjs", import.meta.url));
const APCH = readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8");

// 템플릿 원문은 저장소에 없다 — 서버가 인증된 요청에만 내려준다. 여기서 검증하는 것은 생성기의 동작
// (무엇을 쓰고·건너뛰고·거부하는가)이지 템플릿 내용이 아니므로, 최소 픽스처를 로컬 우회로로 물린다.
// 에이전트 픽스처는 단계 형식(`## step:`)을 따른다 — 파일로 나가는 것은 첫 단계 앞의 스텁뿐이어야 한다.
const FIXTURES = {
  "docs/plans/README.md": "# Plans — {{project.name}}\n",
  "docs/plans/template.md": "# Plan\n",
  "docs/plans/verification-paths.md": "# Verification paths\n",
  "docs/agents/README.md": "# Agents\n{{roster_table}}\n",
  "agents/pm.md": "---\nname: pm\n---\nroster {{roster_names}}\n\n## step:start\npm step body\nnext: done\n",
  "agents/plan-verifier.md": "---\nname: plan-verifier\n---\n\n## step:start\nverifier step body\n",
  "agents/doc-auditor.md": "---\nname: doc-auditor\n---\n\n## step:start\nauditor step body\n",
  "agents/feature-scout.md": "---\nname: feature-scout\n---\n{{scout.question}}\n\n## step:start\nscout step body\n",
  "agents/dev.md": "---\nname: {{ws.agent}}\n---\nowns {{ws.path}}\n{{ws.verify_block}}\n\n## step:implement requires: implementing\ndev step body\n",
  "CLAUDE.runbook.md": "## Harness\nbranch {{board_branch}}\nfull pipeline\n",
  "CLAUDE.runbook.free.md": "## Harness\nbranch {{board_branch}}\nfree pipeline\n",
};
const TPL_DIR = mkdtempSync(join(tmpdir(), "harness-tpl-"));
for (const [rel, body] of Object.entries(FIXTURES)) {
  const full = join(TPL_DIR, "en", rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}
const ROWS = Object.entries(FIXTURES).map(([path, body]) => ({ path, body }));

// 부모 셸의 HARNESS_* 는 지운다 — 테스트가 고른 경로(우회로 / 가짜 서버)만 보게.
const BASE_ENV = { ...process.env };
for (const k of ["HARNESS_TEMPLATES_DIR", "HARNESS_TOKEN", "HARNESS_PLAN", "HARNESS_SERVER"]) delete BASE_ENV[k];
const argv = (root, server, args) => [BIN, "--root", root, "--server", server, ...args];
const runWith = (env, root, server, ...args) => {
  try { return { code: 0, out: execFileSync("node", argv(root, server, args), { encoding: "utf8", env: { ...BASE_ENV, ...env } }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
// 가짜 서버가 같은 프로세스에 있으면 동기 spawn은 교착이다(응답을 줄 이벤트 루프가 막힌다) — 그 경우만 비동기로.
const runAsync = (env, root, server, ...args) => new Promise((resolve) =>
  execFile("node", argv(root, server, args), { encoding: "utf8", env: { ...BASE_ENV, ...env } },
    (e, stdout, stderr) => resolve({ code: e ? e.code : 0, out: String(stdout) + String(stderr) })));
const run = (root, ...args) => runWith({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root, "https://h.example", ...args);
const runFree = (root, ...args) => runWith({ HARNESS_TEMPLATES_DIR: TPL_DIR, HARNESS_PLAN: "free" }, root, "https://h.example", ...args);
const fresh = (cfg = APCH) => { const root = mkdtempSync(join(tmpdir(), "harness-")); writeFileSync(join(root, "harness.json"), cfg); return root; };
const ONE_WS = JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }], scout: { question: "q" } });

// 가짜 /api/templates — 응답 본문 하나를 정해 두고 받은 요청을 기록한다.
const withServer = async (body, fn) => {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, authorization: req.headers.authorization });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`, seen); }
  finally { server.close(); }
};

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
    assert.match(r.out, /^plan: max$/m); // 우회로의 기본 플랜
  });
  it("agent files are stubs — no step body reaches disk", () => {
    const root = fresh();
    assert.equal(run(root).code, 0);
    for (const a of ["pm", "plan-verifier", "doc-auditor", "feature-scout", "web-dev", "admin-dev", "backend-dev"]) {
      const body = readFileSync(join(root, `.claude/agents/${a}.md`), "utf8");
      assert.doesNotMatch(body, /## step:/, a);
      assert.doesNotMatch(body, /step body/, a);
    }
    assert.match(readFileSync(join(root, ".claude/agents/web-dev.md"), "utf8"), /^name: web-dev$/m);
    assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /full pipeline/);
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

  describe("plan", () => {
    it("free: report agents outside the plan are skipped, the free runbook lands in CLAUDE.md", () => {
      const root = fresh(ONE_WS);
      const r = runFree(root);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /^plan: free$/m);
      for (const a of ["pm", "feature-scout", "dev"]) assert.ok(existsSync(join(root, `.claude/agents/${a}.md`)), a);
      for (const a of ["plan-verifier", "doc-auditor"]) {
        assert.ok(!existsSync(join(root, `.claude/agents/${a}.md`)), a);
        assert.match(r.out, new RegExp(`^skip\\(plan\\): \\.claude/agents/${a}\\.md \\(not on the free plan\\)$`, "m"));
      }
      const runbook = readFileSync(join(root, "CLAUDE.md"), "utf8");
      assert.match(runbook, /free pipeline/);
      assert.doesNotMatch(runbook, /full pipeline/);
      const lock = JSON.parse(readFileSync(join(root, "harness.lock.json"), "utf8"));
      assert.ok(!(".claude/agents/plan-verifier.md" in lock.files));
    });
    it("free: refuses before writing when harness.json has more workspaces than the plan allows", () => {
      const root = fresh(); // APCH: 3 workspaces
      const r = runFree(root);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /workspace cap reached on the free plan \(1\): harness\.json has 3 workspaces/);
      assert.ok(!existsSync(join(root, "harness.lock.json")));
      assert.ok(!existsSync(join(root, ".claude")));
    });
    it("unknown HARNESS_PLAN is a config error", () => {
      const r = runWith({ HARNESS_TEMPLATES_DIR: TPL_DIR, HARNESS_PLAN: "gold" }, fresh(ONE_WS), "https://h.example");
      assert.equal(r.code, 1); assert.match(r.out, /HARNESS_PLAN/);
    });
  });

  describe("/api/templates", () => {
    it("uses the fetched templates and entitlement; sends the token and language", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const root = fresh(ONE_WS);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
        assert.equal(r.code, 0, r.out);
        assert.deepEqual(seen, [{ url: "/api/templates?lang=en", authorization: "Bearer t-test" }]);
        assert.match(r.out, /^plan: pro$/m);
        for (const a of REPORT_AGENTS) assert.ok(existsSync(join(root, `.claude/agents/${a}.md`)), a);
        assert.doesNotMatch(readFileSync(join(root, ".claude/agents/pm.md"), "utf8"), /## step:/);
        assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /full pipeline/);
      });
    });
    it("refuses the pre-Phase-4 flat response — plugin and server out of step", async () => {
      const flat = Object.fromEntries(ROWS.map(({ path, body }) => [path, body]));
      await withServer(flat, async (server) => {
        const root = fresh(ONE_WS);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
        assert.equal(r.code, 1, r.out);
        assert.match(r.out, /out of step/);
        assert.ok(!existsSync(join(root, ".claude")));
      });
    });
  });
});
