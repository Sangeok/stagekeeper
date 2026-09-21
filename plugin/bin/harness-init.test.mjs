import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deliverable } from "../lib/deliver.mjs";
import { REPORT_AGENTS } from "../lib/entitlement.mjs";
import { runbookVersion } from "../lib/runbook.mjs";

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
  try { return { code: 0, out: execFileSync("node", argv(root, server, args), { encoding: "utf8", stdio: "pipe", env: { ...BASE_ENV, ...env } }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
// 가짜 서버가 같은 프로세스에 있으면 동기 spawn은 교착이다(응답을 줄 이벤트 루프가 막힌다) — 그 경우만 비동기로.
const runAsync = (env, root, server, ...args) => new Promise((resolve) =>
  execFile("node", argv(root, server, args), { encoding: "utf8", env: { ...BASE_ENV, ...env } },
    (e, stdout, stderr) => resolve({ code: e ? e.code : 0, out: String(stdout) + String(stderr) })));
// --server를 아예 주지 않는 실행. 서버 URL 출처 순서를 시험하려면 argv에서 그 인자가 빠져야 한다.
const runBare = (env, root, ...args) => {
  try { return { code: 0, out: execFileSync("node", [BIN, "--root", root, ...args], { encoding: "utf8", stdio: "pipe", env: { ...BASE_ENV, ...env } }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
const run = (root, ...args) => runWith({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root, "https://h.example", ...args);
const runFree = (root, ...args) => runWith({ HARNESS_TEMPLATES_DIR: TPL_DIR, HARNESS_PLAN: "free" }, root, "https://h.example", ...args);
const fresh = (cfg = APCH) => { const root = mkdtempSync(join(tmpdir(), "harness-")); writeFileSync(join(root, "harness.json"), cfg); return root; };
const ONE_WS = JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }], scout: { question: "q" } });

// 오류 뒤의 새 파일과 기존 내용 변경을 모두 잡도록 테스트 저장소 전체를 비교한다.
const snapshot = (root) => Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const fullPath = join(entry.parentPath ?? entry.path, entry.name);
    return [relative(root, fullPath), readFileSync(fullPath, "utf8")];
  }));

// 가짜 /api/templates — 응답 본문 하나를 정해 두고 받은 요청을 기록한다.
// postStatus: 런북 보고(POST /api/runbook)에 돌려줄 상태. 기본 200.
// project: GET /api/project가 줄 정체. projectStatus 404는 그 경로가 없는 구버전 서버다.
// registered/registerStatus: POST /api/projects(C의 등록)가 줄 응답. 201 = 새로 만듦, 200 = 기존 것.
const withServer = async (body, fn, { postStatus = 200, project = null, projectStatus = 200, registered = null, registerStatus = 201 } = {}) => {
  const seen = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      seen.push({ url: req.url, method: req.method, authorization: req.headers.authorization, body: raw || null });
      res.setHeader("content-type", "application/json");
      // **/api/projects가 /api/project보다 먼저다.** startsWith("/api/project")는 "/api/projects"도
      // 삼키므로, 순서를 뒤집으면 등록 호출이 정체 스텁을 받아 시험이 녹색인 채 아무것도 증명하지 않는다.
      if (req.url?.startsWith("/api/projects")) {
        res.statusCode = registerStatus;
        res.end(JSON.stringify(registerStatus < 400 ? { project: registered } : { error: "registration refused" }));
        return;
      }
      // 엔드포인트가 둘이 됐다 — url로 가르지 않으면 --print-project가 템플릿 본문을 받는다.
      if (req.url?.startsWith("/api/project")) {
        res.statusCode = projectStatus;
        res.end(JSON.stringify(projectStatus === 200 ? { project } : { error: "not found" }));
        return;
      }
      if (req.method === "POST") { res.statusCode = postStatus; res.end(JSON.stringify({ ok: postStatus < 400 })); return; }
      res.end(JSON.stringify(body));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`, seen); }
  finally { server.close(); }
};

describe("harness-init (v2)", () => {
  // .mcp.json은 더 이상 생성물이 아니다(B-1 선택지 3) — 서버는 사용자 범위에 머신당 1회 등록된다.
  // 그래서 "없어야 할 것" 쪽으로 옮겼고, 해석된 주소는 stdout의 `server:` 줄이 알려 준다.
  it("materializes agents, docs, runbook, lock — no state files and no .mcp.json", () => {
    const root = fresh();
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    for (const p of ["CLAUDE.md", "harness.lock.json", "docs/plans/README.md", "docs/plans/template.md", "docs/plans/verification-paths.md",
      "docs/agents/README.md", ".claude/agents/pm.md", ".claude/agents/plan-verifier.md", ".claude/agents/doc-auditor.md", ".claude/agents/feature-scout.md",
      ".claude/agents/web-dev.md", ".claude/agents/admin-dev.md", ".claude/agents/backend-dev.md"]) assert.ok(existsSync(join(root, p)), `missing ${p}`);
    for (const p of ["PROJECT_BOARD.md", "TASK_BACKLOG.md", "docs/release-checks.md", "scripts", ".mcp.json"]) assert.ok(!existsSync(join(root, p)), `unexpected ${p}`);
    assert.match(r.out, /^server: https:\/\/h\.example$/m); // 스킬이 claude mcp add에 넘길 주소
    assert.doesNotMatch(r.out, /write: \.mcp\.json/); // 걷어낼 게 없으면 손대지 않는다
    assert.doesNotMatch(readFileSync(join(root, ".claude/agents/backend-dev.md"), "utf8"), /\{\{/);
    const lock = JSON.parse(readFileSync(join(root, "harness.lock.json"), "utf8"));
    assert.equal(lock.version, 1);
    assert.ok(!(".mcp.json" in lock.files) && !("CLAUDE.md" in lock.files)); // 병합 파일은 잠그지 않는다
    assert.match(r.out, /^plan: max$/m); // 우회로의 기본 플랜
  });
  // --owner는 생성기에서 사라졌다(3-g). 조용히 무시하면 옛 스킬이 계속 넘길 때 사용자가 소유자
  // 서버를 잃고도 모르므로, 어디로 옮겼는지 알리고 파일은 만들지 않는다.
  it("--owner no longer writes a server: it says where the owner server moved, and writes no .mcp.json", () => {
    const withOwner = fresh();
    const r = run(withOwner, "--owner");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^note: --owner no longer writes a server here/m);
    assert.match(r.out, /harness_owner at user scope when HARNESS_OWNER_TOKEN is set/);
    assert.ok(!existsSync(join(withOwner, ".mcp.json")), "unexpected .mcp.json");
    const plain = fresh();
    const p = run(plain);
    assert.equal(p.code, 0, p.out);
    assert.doesNotMatch(p.out, /--owner no longer writes/); // 플래그를 안 주면 안내도 없다
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
  // 범위 우선순위가 local > project > user라, 저장소 항목을 남겨 두면 사용자 범위를 계속 이긴다.
  // 그래서 우리 항목만 걷어내고 남의 서버는 보존한다.
  it("removes our entries from .mcp.json, preserving other servers", () => {
    const root = fresh();
    writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: {
      notion: { url: "https://mcp.notion.com/mcp" },
      harness: { type: "http", url: "https://h.example/api/mcp" },
      harness_owner: { type: "http", url: "https://h.example/api/mcp/owner" },
    } }));
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /write: \.mcp\.json \(removed harness, harness_owner —/); // 복수형 경로
    const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers.notion.url, "https://mcp.notion.com/mcp");
    assert.equal(mcp.mcpServers.harness, undefined);
    assert.equal(mcp.mcpServers.harness_owner, undefined);
    // --server를 줬으므로 폴백 파괴 경고는 뜨지 않는다.
    assert.doesNotMatch(r.out, /only record of the server URL/);
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

  for (const agent of ["pm", "plan-verifier", "doc-auditor", "feature-scout"]) {
    it(`rejects reserved workspace agent ${agent} without writing`, () => {
      const config = JSON.parse(ONE_WS);
      config.workspaces[0].agent = agent;
      const root = fresh(JSON.stringify(config));
      const before = snapshot(root);
      const result = run(root);
      assert.equal(result.code, 1, result.out);
      assert.match(result.out, /workspaces\[0\]\.agent: reserved report agent/);
      assert.deepEqual(snapshot(root), before);
    });
  }
  it("rejects a readOnly typo without dropping the restriction or writing files", () => {
    const config = JSON.parse(ONE_WS);
    config.workspaces[0].readOnly = "src/generated/**";
    const root = fresh(JSON.stringify(config));
    const before = snapshot(root);
    const result = run(root);
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /workspaces\[0\]\.readOnly/);
    assert.deepEqual(snapshot(root), before);
  });

  describe("prepare before writing", () => {
    for (const content of ["{", "null", "[]", '{"mcpServers":[]}', '{"mcpServers":null}']) {
      it(`leaves the repository untouched for malformed MCP input ${content}`, () => {
        const root = fresh(ONE_WS);
        writeFileSync(join(root, ".mcp.json"), content);
        writeFileSync(join(root, "CLAUDE.md"), "Owner instructions\n");
        const before = snapshot(root);
        const result = run(root);
        assert.equal(result.code, 1, result.out);
        assert.match(result.out, /Initialization error:.*\.mcp\.json/);
        assert.doesNotMatch(result.out, /^write:/m);
        assert.deepEqual(snapshot(root), before);
        writeFileSync(join(root, ".mcp.json"), "{}");
        assert.equal(run(root).code, 0); // 입력 수정 후 adopt 없이 재실행할 수 있다.
      });
    }
    it("preserves generated files and the old lock when an update cannot prepare MCP", () => {
      const root = fresh(ONE_WS);
      assert.equal(run(root).code, 0);
      const config = JSON.parse(ONE_WS);
      config.project.name = "Changed name";
      writeFileSync(join(root, "harness.json"), JSON.stringify(config));
      writeFileSync(join(root, ".mcp.json"), "{");
      const before = snapshot(root);
      assert.equal(run(root).code, 1);
      assert.deepEqual(snapshot(root), before);
      writeFileSync(join(root, ".mcp.json"), "{}");
      const result = run(root);
      assert.equal(result.code, 0, result.out);
      assert.doesNotMatch(result.out, /skip\(modified\)|refuse:/);
      assert.match(readFileSync(join(root, "docs/plans/README.md"), "utf8"), /Changed name/);
    });
    it("rejects a malformed lock before changing generated files", () => {
      const root = fresh(ONE_WS);
      writeFileSync(join(root, "harness.lock.json"), '{"version":1,"files":[]}');
      const before = snapshot(root);
      const result = run(root);
      assert.equal(result.code, 1, result.out);
      assert.match(result.out, /harness\.lock\.json/);
      assert.deepEqual(snapshot(root), before);
    });
    for (const [label, runbook] of [["missing", undefined], ["unresolved variable", "{{unknown.value}}"]]) {
      it(`does not write any targets for a ${label} runbook`, async () => {
        const body = deliverable(ROWS, "pro");
        body.templates["CLAUDE.runbook.md"] = runbook;
        await withServer(body, async (server) => {
          const root = fresh(ONE_WS);
          const before = snapshot(root);
          const result = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
          assert.equal(result.code, 1, result.out);
          assert.match(result.out, /Template missing|template var missing/);
          assert.doesNotMatch(result.out, /^write:/m);
          assert.deepEqual(snapshot(root), before);
        });
      });
    }
  });

  describe("runbook dry-run", () => {
    const start = "<!-- harness:runbook:start -->";
    const end = "<!-- harness:runbook:end -->";
    for (const [label, existing, operation] of [
      ["no markers", "Owner rules\n", "inserted"],
      ["both markers", `Owner rules\n${start}\nold block\n${end}\nTail\n`, "replaced"],
      ["start only", `Owner rules\n${start}\nold block\n`, "inserted"],
    ]) {
      it(`previews the same merge it applies with ${label}`, () => {
        const root = fresh(ONE_WS);
        writeFileSync(join(root, "CLAUDE.md"), existing);
        const before = snapshot(root);
        const preview = run(root, "--dry-run");
        assert.equal(preview.code, 0, preview.out);
        assert.deepEqual(snapshot(root), before);
        assert.ok(preview.out.includes(`write: CLAUDE.md (runbook ${operation})`));
        const applied = run(root);
        assert.equal(applied.code, 0, applied.out);
        assert.equal(applied.out, preview.out);
        const merged = readFileSync(join(root, "CLAUDE.md"), "utf8");
        assert.match(merged, /^Owner rules/);
        assert.match(merged, /full pipeline/);
        if (operation === "replaced") {
          assert.doesNotMatch(merged, /old block/);
          assert.match(merged, /Tail\n$/);
        } else {
          assert.ok(merged.startsWith(existing));
        }
      });
    }
  });

  describe("plan", () => {
    it("free: report agents outside the plan are skipped, the same runbook lands in CLAUDE.md", () => {
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
      assert.match(runbook, /full pipeline/); // 런북은 한 판이다 — 플랜 차이는 그래프가 진다(deliver.mjs)
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

  describe("서버 URL 출처", () => {
    // C11: 기본값은 없다. 세 출처가 모두 비면 지금까지와 같은 문장으로 멈추고 아무것도 쓰지 않는다.
    // 이 분기는 그동안 자동 테스트가 없었다(모든 실행이 --server를 넘겼다).
    it("exits 1 and writes nothing when no source supplies a server URL", () => {
      const root = fresh(ONE_WS);
      const before = snapshot(root);
      const r = runBare({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /Server URL required/);
      assert.deepEqual(snapshot(root), before);
    });

    // 회수는 그대로지만 같은 실행에서 그 항목을 지운다 — 즉 이 저장소의 마지막 URL 기록이 사라진다.
    // 생성기는 사용자 범위 설정을 읽지 않으므로(3-a) 보완하지 않고 **알린다**.
    it("recovers the server from an existing .mcp.json, then removes that entry and says so", () => {
      const root = fresh(ONE_WS);
      writeFileSync(join(root, ".mcp.json"), JSON.stringify({
        mcpServers: { harness: { type: "http", url: "https://recovered.example/api/mcp" } },
      }));
      const r = runBare({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /^server: https:\/\/recovered\.example$/m); // 지워질 파일에서 읽어 정규화했다
      assert.match(r.out, /only record of the server URL — make sure HARNESS_SERVER is set \(https:\/\/recovered\.example\)/);
      const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
      assert.equal(mcp.mcpServers.harness, undefined);
    });

    // 토큰 페이지는 `<base>/api/mcp`를 보여 준다. 그대로 넘겨도 꼬리가 겹치지 않아야 한다.
    // 관측 지점이 `.mcp.json`에서 stdout의 `server:` 줄로 옮겨졌다(B-1 선택지 3) — 그 값이 이제
    // 스킬을 거쳐 `claude mcp add`에 그대로 들어가므로, 꼬리가 남으면 `/api/mcp/api/mcp`가 된다.
    for (const given of ["https://h.example/api/mcp", "https://h.example/api/mcp/", "https://h.example/api/mcp/owner"]) {
      it(`normalizes ${given} to the base URL`, () => {
        const root = fresh(ONE_WS);
        const r = runWith({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root, given);
        assert.equal(r.code, 0, r.out);
        assert.match(r.out, /^server: https:\/\/h\.example$/m);
      });
    }

    // 깨진 .mcp.json은 회수에 실패해도 던지지 않는다 — 그래도 URL이 없으면 멈춘다.
    it("does not throw on an unreadable .mcp.json while recovering, and says so", () => {
      const root = fresh(ONE_WS);
      writeFileSync(join(root, ".mcp.json"), "{");
      const r = runBare({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /Server URL required/);
      assert.match(r.out, /\.mcp\.json could not be read/);
      assert.doesNotMatch(r.out, /Initialization error/);
    });
  });

  describe("--print-project", () => {
    // slug까지 싣는다 — 스킬이 harness.json 초안의 project.slug를 이 값으로 채운다(A-8).
    const identity = { owner: "Sangeok", repo: "stagekeeper", branch: "dev", name: "stagekeeper", slug: "stagekeeper" };
    // harness.json이 없는 첫 연결에서 쓰는 모드다 — 설정을 읽지 않고, 아무것도 쓰지 않는다.
    const emptyRoot = () => mkdtempSync(join(tmpdir(), "harness-empty-"));

    it("prints the identity without harness.json and writes nothing", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server) => {
        const root = emptyRoot();
        const before = snapshot(root);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server, "--print-project");
        assert.equal(r.code, 0, r.out);
        assert.deepEqual(JSON.parse(r.out.trim()), identity);
        assert.deepEqual(snapshot(root), before);
        assert.ok(!existsSync(join(root, ".mcp.json")));
      }, { project: identity });
    });

    // language를 실으면 harness.json이 ?lang=ko를 만들어 첫 연결이 404가 된다.
    it("carries no language key", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server) => {
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, emptyRoot(), server, "--print-project");
        assert.equal(r.code, 0, r.out);
        assert.ok(!("language" in JSON.parse(r.out.trim())));
      }, { project: identity });
    });

    // 구버전 서버에는 이 경로가 없다. 그 사실을 말하고 실패하면 스킬이 지금까지처럼 물어서 진행한다(D-4).
    it("says the server has no /api/project when it answers 404", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server) => {
        const root = emptyRoot();
        const before = snapshot(root);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server, "--print-project");
        assert.equal(r.code, 1, r.out);
        assert.match(r.out, /no \/api\/project/);
        assert.deepEqual(snapshot(root), before);
      }, { projectStatus: 404 });
    });
  });

  // C — 첫 연결에서 git이 아는 것으로 프로젝트를 등록한다. 사용자 토큰(hu_) 전용 모드다.
  describe("--register", () => {
    const identity = { owner: "Sangeok", repo: "stagekeeper", branch: "main", name: "stagekeeper", slug: "stagekeeper" };
    // 진짜 git 저장소를 만든다 — 테스트 전용 우회 플래그를 두면 정작 git을 읽는 경로가 검증되지 않는다.
    //
    // **`-b main`을 반드시 준다.** 기본 브랜치 이름은 환경마다 다르다: 이 저장소를 개발한 머신은
    // `init.defaultBranch=main`이라 `main`이 나왔지만 CI 러너는 그 설정이 없어 `master`가 나왔고,
    // 그래서 아래 branch 단언이 CI에서만 깨졌다(2026-09-20). 기대값을 "실제로 읽은 값"으로 바꾸는
    // 방식은 쓰지 않는다 — 그러면 시험이 자기가 만든 값을 자기가 확인하는 꼴이라 branch가 실제로
    // 서버에 전달되는지를 증명하지 못한다.
    //
    // 커밋이 없어도 `git branch --show-current`는 그 이름을 낸다. 그래서 이 픽스처는
    // **분리된 HEAD 분기(branch 생략)를 타지 않는다** — 그쪽은 미검증으로 남는다.
    const gitRoot = (remote = "git@github.com:Sangeok/stagekeeper.git") => {
      const root = mkdtempSync(join(tmpdir(), "harness-git-"));
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root, stdio: "ignore" });
      if (remote) execFileSync("git", ["remote", "add", "origin", remote], { cwd: root, stdio: "ignore" });
      return root;
    };

    it("registers what git knows, prints the identity, and writes nothing", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const root = gitRoot();
        const before = snapshot(root);
        const r = await runAsync({ HARNESS_TOKEN: "hu_test" }, root, server, "--register");
        assert.equal(r.code, 0, r.out);
        // --print-project와 같은 모양이어야 스킬의 초안 경로가 하나로 유지된다.
        assert.deepEqual(JSON.parse(r.out.trim()), identity);
        const call = seen.find((s) => s.url?.startsWith("/api/projects"));
        assert.ok(call, "must POST to /api/projects");
        assert.equal(call.method, "POST");
        assert.equal(call.authorization, "Bearer hu_test");
        assert.deepEqual(JSON.parse(call.body), { owner: "Sangeok", repo: "stagekeeper", branch: "main" });
        assert.deepEqual(snapshot(root), before, "--register must not write files");
      }, { registered: identity });
    });

    // 재실행이 정상 흐름이다. 서버가 (owner, repo)로 멱등 처리해 200을 주면 새 프로젝트가 아니다 —
    // 이게 깨지면 init을 다시 돌릴 때마다 <repo>-2가 생긴다.
    it("accepts the 200 that means the repository was already registered", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server) => {
        const root = gitRoot();
        const before = snapshot(root);
        const r = await runAsync({ HARNESS_TOKEN: "hu_test" }, root, server, "--register");
        assert.equal(r.code, 0, r.out);
        assert.deepEqual(JSON.parse(r.out.trim()), identity);
        assert.deepEqual(snapshot(root), before);
      }, { registered: identity, registerStatus: 200 });
    });

    // 401은 대개 프로젝트 토큰을 쓴 경우다 — 그 토큰은 이 경로를 지나지 않는다.
    it("points an hs_ token at --print-project when the server refuses with 401", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server) => {
        const r = await runAsync({ HARNESS_TOKEN: "hs_test" }, gitRoot(), server, "--register");
        assert.equal(r.code, 1, r.out);
        assert.match(r.out, /user token/);
        assert.match(r.out, /--print-project/);
      }, { registerStatus: 401 });
    });

    it("says the server has no /api/projects when it answers 404", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server) => {
        const r = await runAsync({ HARNESS_TOKEN: "hu_test" }, gitRoot(), server, "--register");
        assert.equal(r.code, 1, r.out);
        assert.match(r.out, /no \/api\/projects/);
      }, { registerStatus: 404 });
    });

    // git이 답을 못 주면 서버를 부르지 않는다 — 스킬이 사용자에게 물어서 진행한다.
    it("stops before calling the server when there is no origin remote", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const r = await runAsync({ HARNESS_TOKEN: "hu_test" }, gitRoot(null), server, "--register");
        assert.equal(r.code, 1, r.out);
        assert.match(r.out, /No git remote 'origin'/);
        assert.equal(seen.filter((s) => s.url?.startsWith("/api/projects")).length, 0);
      }, { registered: identity });
    });

    it("stops when the origin remote is not a GitHub repository", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const r = await runAsync({ HARNESS_TOKEN: "hu_test" }, gitRoot("https://gitlab.com/a/b.git"), server, "--register");
        assert.equal(r.code, 1, r.out);
        assert.match(r.out, /Could not read owner\/repo/);
        assert.equal(seen.filter((s) => s.url?.startsWith("/api/projects")).length, 0);
      }, { registered: identity });
    });
  });

  describe("/api/templates", () => {
    const invalidResponses = [
      ["missing agents", (body) => { delete body.entitlement.agents; }],
      ["string agents", (body) => { body.entitlement.agents = "pm"; }],
      ["non-string agent", (body) => { body.entitlement.agents = [null]; }],
      ["unknown plan", (body) => { body.entitlement.plan = "gold"; }],
      ["array templates", (body) => { body.templates = []; }],
      ["non-string template", (body) => { body.templates["docs/plans/README.md"] = {}; }],
      ["null runbook", (body) => { body.templates["CLAUDE.runbook.md"] = null; }],
    ];
    for (const [label, invalidate] of invalidResponses) {
      it(`rejects ${label} with a clear response error and no writes`, async () => {
        const body = deliverable(ROWS, "pro");
        invalidate(body);
        await withServer(body, async (server) => {
          const root = fresh(ONE_WS);
          const before = snapshot(root);
          const result = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
          assert.equal(result.code, 1, result.out);
          assert.match(result.out, /Unexpected .*response|Unexpected template body/);
          assert.doesNotMatch(result.out, /TypeError|^write:/m);
          assert.deepEqual(snapshot(root), before);
        });
      });
    }
    it("accepts unconsumed extension fields, roles, and templates", async () => {
      const body = deliverable(ROWS, "pro");
      body.entitlement.agents = [...body.entitlement.agents, "future-reporter"];
      body.entitlement.future = { value: 1 };
      body.templates["future-format"] = { value: 1 };
      body.future = true;
      await withServer(body, async (server) => {
        const result = await runAsync({ HARNESS_TOKEN: "t-test" }, fresh(ONE_WS), server);
        assert.equal(result.code, 0, result.out);
      });
    });
    it("uses the fetched templates and entitlement; sends the token and language", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const root = fresh(ONE_WS);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
        assert.equal(r.code, 0, r.out);
        assert.deepEqual(seen.map(({ url, method }) => ({ url, method })), [
          { url: "/api/templates?lang=en", method: "GET" },
          { url: "/api/runbook", method: "POST" },
        ]);
        assert.deepEqual(new Set(seen.map((r) => r.authorization)), new Set(["Bearer t-test"]));
        assert.match(r.out, /^plan: pro$/m);
        for (const a of REPORT_AGENTS) assert.ok(existsSync(join(root, `.claude/agents/${a}.md`)), a);
        assert.doesNotMatch(readFileSync(join(root, ".claude/agents/pm.md"), "utf8"), /## step:/);
        assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /full pipeline/);
      });
    });
    // 저장소에 심은 런북이 어느 판인지 서버가 알아야 pipeline_next가 표류를 말할 수 있다.
    it("reports the runbook version it just planted, with the same token", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, fresh(ONE_WS), server);
        assert.equal(r.code, 0, r.out);
        const post = seen.find((row) => row.method === "POST");
        assert.ok(post, "no report was sent");
        assert.equal(post.url, "/api/runbook");
        assert.equal(post.authorization, "Bearer t-test");
        assert.deepEqual(JSON.parse(post.body), { version: runbookVersion(FIXTURES["CLAUDE.runbook.md"]) });
        assert.doesNotMatch(r.out, /not recorded/);
      });
    });
    // 보고가 실패해도 파일은 이미 옳다. 판정이 "낡음"으로 기울 뿐이라 중단할 이유가 없다.
    it("a refused report leaves init successful and says so in one line", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const root = fresh(ONE_WS);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
        assert.equal(r.code, 0, r.out);
        assert.match(r.out, /^note: runbook version not recorded \(500\)/m);
        assert.ok(seen.some((row) => row.method === "POST"));
        assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /full pipeline/);
      }, { postStatus: 500 });
    });
    it("--dry-run writes nothing and reports nothing", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const root = fresh(ONE_WS);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server, "--dry-run");
        assert.equal(r.code, 0, r.out);
        assert.deepEqual(seen.filter((row) => row.method === "POST"), []);
        assert.ok(!existsSync(join(root, "CLAUDE.md")));
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
