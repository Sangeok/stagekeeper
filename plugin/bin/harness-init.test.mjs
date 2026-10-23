import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deliverable } from "../lib/templates/deliver.mjs";
import { DEFAULT_SCOUT_QUESTION } from "../lib/templates/vars.mjs";
import { REPORT_AGENTS } from "../lib/plans/entitlement.mjs";
import { runbookVersion } from "../lib/templates/runbook.mjs";

const BIN = fileURLToPath(new URL("./harness-init.mjs", import.meta.url));
const APCH = readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8");

const FIXTURES = {
  "docs/plans/README.md": "# Plans — {{project.name}}\n",
  "docs/plans/template.md": "# Plan\n",
  "docs/plans/verification-paths.md": "# Verification paths\n",
  "docs/agents/README.md": "# Agents\n{{roster_table}}\n",
  "agents/pm.md": "---\nname: pm\ndescription: Picks work.\n---\nroster {{roster_names}}\n\n## step:start\npm step body\nnext: done\n",
  "agents/qa-verifier.md": "---\nname: qa-verifier\ndescription: Tests user flows.\n---\n\n## step:start requires: done\nqa step body\nnext: done\n",
  "agents/impl-verifier.md": "---\nname: impl-verifier\ndescription: Verifies implementations.\n---\n\n## step:start requires: done\nimpl-verifier step body\nnext: done\n",
  "agents/plan-verifier.md": "---\nname: plan-verifier\ndescription: Verifies plans.\n---\n\n## step:start\nverifier step body\n",
  "agents/doc-auditor.md": "---\nname: doc-auditor\ndescription: Audits docs.\n---\n\n## step:start\nauditor step body\n",
  "agents/feature-scout.md": "---\nname: feature-scout\ndescription: Scouts features.\n---\n{{scout.question}}\n\n## step:start\nscout step body\n",
  "agents/dev.md": "---\nname: {{ws.agent}}\n---\nowns {{ws.path}}\n{{ws.verify_block}}\n\n## step:implement requires: implementing\ndev step body\n",
  "CLAUDE.runbook.md": "## Harness\nbranch {{board_branch}}\nversion {{runbook_version}}\nfull pipeline\n\nReport only:\n\n{{report_table}}\n",
};
const TPL_DIR = mkdtempSync(join(realpathSync(tmpdir()),"harness-tpl-"));
for (const [rel, body] of Object.entries(FIXTURES)) {
  const full = join(TPL_DIR, "en", rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}
const ROWS = Object.entries(FIXTURES).map(([path, body]) => ({ path, body }));

const BASE_ENV = { ...process.env };
for (const k of ["HARNESS_TEMPLATES_DIR", "HARNESS_TOKEN", "HARNESS_PLAN", "HARNESS_SERVER"]) delete BASE_ENV[k];
const argv = (root, server, args) => [BIN, "--root", root, "--server", server, ...args];
const runWith = (env, root, server, ...args) => {
  try { return { code: 0, out: execFileSync("node", argv(root, server, args), { encoding: "utf8", stdio: "pipe", env: { ...BASE_ENV, ...env } }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
const runAsync = (env, root, server, ...args) => new Promise((resolve) =>
  execFile("node", argv(root, server, args), { encoding: "utf8", env: { ...BASE_ENV, ...env } },
    (e, stdout, stderr) => resolve({ code: e ? e.code : 0, out: String(stdout) + String(stderr) })));
const runBare = (env, root, ...args) => {
  try { return { code: 0, out: execFileSync("node", [BIN, "--root", root, ...args], { encoding: "utf8", stdio: "pipe", env: { ...BASE_ENV, ...env } }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
const run = (root, ...args) => runWith({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root, "https://h.example", ...args);
const runFree = (root, ...args) => runWith({ HARNESS_TEMPLATES_DIR: TPL_DIR, HARNESS_PLAN: "free" }, root, "https://h.example", ...args);
const fresh = (cfg = APCH) => { const root = mkdtempSync(join(realpathSync(tmpdir()),"harness-")); writeFileSync(join(root, "harness.json"), cfg); return root; };
const ONE_WS = JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }], scout: { question: "q" } });

for (const field of ["project", "executor", "release", "scout"]) it(`reports null ${field} as a field-path config error without generating files`, () => {
  const invalid = { ...JSON.parse(ONE_WS), [field]: null }, root = fresh(JSON.stringify(invalid));
  const before = snapshot(root), result = run(root);
  assert.notEqual(result.code, 0);
  assert.match(result.out, new RegExp(`Config error: harness\\.json ${field}: must be an object`));
  assert.deepEqual(snapshot(root), before);
});

it("bounds identity, registration, templates and reporting across delayed headers and streaming bodies", { timeout: 65000 }, async t => {
  const cases = ["/api/project", "/api/projects", "/api/templates", "/api/runbook"].flatMap(endpoint => ["headers", "body", "error-body"].map(mode => ({ endpoint, mode })));
  await Promise.all(cases.map(async ({ endpoint, mode }) => {
    const root = fresh(ONE_WS);
    if (endpoint === "/api/projects") {
      execFileSync("git", ["init", root], { stdio: "ignore" });
      execFileSync("git", ["-C", root, "remote", "add", "origin", "https://github.com/o/r.git"]);
      execFileSync("git", ["-C", root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    }
    const before = snapshot(root), observed = [], timers = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url, "http://localhost"); observed.push(url.pathname);
      if (url.pathname !== endpoint) { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(deliverable(ROWS, "pro"))); return; }
      if (endpoint === "/api/runbook") assert.equal(existsSync(join(root, "harness.init.guard")), false, "init guard must be released before reporting");
      if (mode === "headers") return;
      response.writeHead(mode === "error-body" ? 429 : 200, { "Content-Type": "application/json" }); response.write('{"unfinished":');
      const timer = setInterval(() => { if (!response.destroyed) response.write(" "); }, 250); timers.push(timer);
      response.once("close", () => clearInterval(timer));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => { timers.forEach(clearInterval); server.closeAllConnections(); server.close(); });
    const env = { ...BASE_ENV, HARNESS_TOKEN: "hu_fixture" };
    const flags = endpoint === "/api/project" ? ["--print-project"] : endpoint === "/api/projects" ? ["--register"] : [];
    if (!flags.length) { const config = JSON.parse(ONE_WS); config.project.slug = "fixture"; writeFileSync(join(root, "harness.json"), JSON.stringify(config)); }
    const started = Date.now();
    const result = await new Promise(resolve => execFile(process.execPath, argv(root, `http://127.0.0.1:${server.address().port}`, flags),
      { env, windowsHide: true, timeout: 45000 }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, out: stdout + stderr })));
    const elapsed = Date.now() - started, label = `${endpoint}/${mode}: ${result.out}`;
    const discardedSuccessBody = endpoint === "/api/runbook" && mode === "body";
    assert.ok(elapsed < 40000, label); if (!discardedSuccessBody) assert.ok(elapsed >= 18000, label);
    assert.equal(observed.filter(path => path === endpoint).length, 1, "no automatic retry");
    if (endpoint === "/api/runbook") {
      assert.equal(result.code, mode === "error-body" ? 1 : 0, label);
      assert.ok(existsSync(join(root, "CLAUDE.md"))); assert.ok(existsSync(join(root, "harness.lock.json")));
      if (!discardedSuccessBody) assert.match(result.out, /note: runbook version not recorded/);
      if (mode === "error-body") assert.match(result.out, /Wait before retrying|stated wait/);
    } else {
      assert.equal(result.code, 1, label);
      assert.equal(existsSync(join(root, "harness.lock.json")), false); assert.equal(existsSync(join(root, ".claude")), false);
      if (flags.length) assert.deepEqual(snapshot(root), before);
      if (endpoint === "/api/projects" && mode !== "error-body") assert.match(result.out, /Registration result unknown.*server may have saved.*No automatic retry or rollback/s);
    }
    assert.equal(existsSync(join(root, "harness.init.guard")), false);
  }));
});

const snapshot = (root) => Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => {
    const fullPath = join(entry.parentPath ?? entry.path, entry.name);
    return [relative(root, fullPath), readFileSync(fullPath, "utf8")];
  }));

const withServer = async (body, fn, { postStatus = 200, postError = null, project = null, projectStatus = 200, registered = null, registerStatus = 201, registerError = null, templateStatus = 200, rateAt = () => null } = {}) => {
  const seen = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      seen.push({ url: req.url, method: req.method, authorization: req.headers.authorization, body: raw || null });
      res.setHeader("content-type", "application/json");
      if (req.url?.split("?")[0] === rateAt()) {
        res.statusCode = 429; res.setHeader("Retry-After", "23");
        res.end(JSON.stringify({ error: "Request limit reached.", code: "RATE_LIMITED", retryAfterSec: 23 })); return;
      }
      if (req.url?.startsWith("/api/projects")) {
        res.statusCode = registerStatus;
        res.end(JSON.stringify(registerStatus < 400 ? { project: registered } : registerError ?? { error: "registration refused" }));
        return;
      }
      if (req.url?.startsWith("/api/project")) {
        res.statusCode = projectStatus;
        res.end(JSON.stringify(projectStatus === 200 ? { project } : { error: "not found" }));
        return;
      }
      if (req.method === "POST") { res.statusCode = postStatus; res.end(JSON.stringify(postError ?? { ok: postStatus < 400 })); return; }
      res.statusCode = templateStatus;
      res.end(JSON.stringify(body));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try { return await fn(`http://127.0.0.1:${server.address().port}`, seen); }
  finally { server.close(); }
};

describe("harness-init (v2)", () => {
  it("materializes agents, docs, runbook, lock — no state files and no .mcp.json", () => {
    const root = fresh();
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    for (const p of ["CLAUDE.md", "harness.lock.json", "docs/plans/README.md", "docs/plans/template.md", "docs/plans/verification-paths.md",
      "docs/agents/README.md", ".claude/agents/pm.md", ".claude/agents/plan-verifier.md", ".claude/agents/doc-auditor.md", ".claude/agents/feature-scout.md",
      ".claude/agents/web-dev.md", ".claude/agents/admin-dev.md", ".claude/agents/backend-dev.md"]) assert.ok(existsSync(join(root, p)), `missing ${p}`);
    for (const p of ["PROJECT_BOARD.md", "TASK_BACKLOG.md", "docs/release-checks.md", "scripts", ".mcp.json"]) assert.ok(!existsSync(join(root, p)), `unexpected ${p}`);
    assert.match(r.out, /^server: https:\/\/h\.example$/m);
    assert.doesNotMatch(r.out, /write: \.mcp\.json/);
    assert.doesNotMatch(readFileSync(join(root, ".claude/agents/backend-dev.md"), "utf8"), /\{\{/);
    const lock = JSON.parse(readFileSync(join(root, "harness.lock.json"), "utf8"));
    assert.equal(lock.version, 1);
    assert.ok(!(".mcp.json" in lock.files) && !("CLAUDE.md" in lock.files));
    assert.match(r.out, /^plan: max$/m);
  });
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
    assert.doesNotMatch(p.out, /--owner no longer writes/);
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
  it("removes our entries from .mcp.json, preserving other servers", () => {
    const root = fresh();
    writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: {
      notion: { url: "https://mcp.notion.com/mcp" },
      harness: { type: "http", url: "https://h.example/api/mcp" },
      harness_owner: { type: "http", url: "https://h.example/api/mcp/owner" },
    } }));
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /write: \.mcp\.json \(removed harness, harness_owner —/);
    const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers.notion.url, "https://mcp.notion.com/mcp");
    assert.equal(mcp.mcpServers.harness, undefined);
    assert.equal(mcp.mcpServers.harness_owner, undefined);
    assert.doesNotMatch(r.out, /only record of the server URL/);
  });
  it("QA configuration installs its dedicated local browser entry and preserves conflicting user configuration", () => {
    const qa = { environment: "test", baseUrl: "http://127.0.0.1:3000", mcpUrl: "http://127.0.0.1:8931/mcp", scenariosPath: "docs/qa/scenarios.md" };
    const root = fresh(JSON.stringify({ ...JSON.parse(APCH), qa }));
    const result = run(root);
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8")).mcpServers.harness_qa_browser, { type: "http", url: qa.mcpUrl });
    assert.ok(existsSync(join(root, ".claude/agents/qa-verifier.md")));
    const conflicting = { mcpServers: { harness_qa_browser: { type: "http", url: "http://127.0.0.1:9999/mcp" }, other: { url: "https://example.com/mcp" } } };
    writeFileSync(join(root, ".mcp.json"), JSON.stringify(conflicting));
    const before = snapshot(root), refused = run(root);
    assert.notEqual(refused.code, 0);
    assert.match(refused.out, /Existing harness_qa_browser differs/);
    assert.deepEqual(snapshot(root), before);
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
  it("writes feature-scout with the default question when config has no scout", () => {
    const root = fresh(JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] }));
    assert.equal(run(root).code, 0);
    assert.ok(existsSync(join(root, ".claude/agents/feature-scout.md")));
    assert.ok(readFileSync(join(root, ".claude/agents/feature-scout.md"), "utf8").includes(DEFAULT_SCOUT_QUESTION));
    assert.ok(existsSync(join(root, ".claude/agents/dev.md")));
    assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /feature-scout/);
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
        assert.equal(run(root).code, 0);
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
    it("does not write any targets when a delivered report agent has no frontmatter description", async () => {
      const body = deliverable(ROWS, "pro");
      const stub = body.templates["agents/doc-auditor.md"];
      assert.match(stub, /description: Audits docs\./);
      body.templates["agents/doc-auditor.md"] = stub.replace("description: Audits docs.\n", "");
      await withServer(body, async (server) => {
        const root = fresh(ONE_WS);
        const before = snapshot(root);
        const result = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
        assert.equal(result.code, 1, result.out);
        assert.match(result.out, /agents\/doc-auditor\.md: no description in frontmatter/);
        assert.doesNotMatch(result.out, /^write:/m);
        assert.deepEqual(snapshot(root), before);
      });
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
    it("pro: the runbook's report table lists every delivered report agent in the generator's order, with its own description", () => {
      const root = fresh();
      assert.equal(run(root).code, 0);
      assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"),
        /\| agent \| does \|\n\| --- \| --- \|\n\| `pm` \| Picks work\. \|\n\| `plan-verifier` \| Verifies plans\. \|\n\| `doc-auditor` \| Audits docs\. \|\n\| `feature-scout` \| Scouts features\. \|\n/);
    });
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
      assert.match(runbook, /full pipeline/);
      assert.match(runbook, /\| `pm` \| Picks work\. \|\n\| `feature-scout` \| Scouts features\. \|/);
      assert.doesNotMatch(runbook, /plan-verifier|doc-auditor/);
      const lock = JSON.parse(readFileSync(join(root, "harness.lock.json"), "utf8"));
      assert.ok(!(".claude/agents/plan-verifier.md" in lock.files));
    });
    it("free: refuses before writing when harness.json has more workspaces than the plan allows", () => {
      const root = fresh();
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
    it("exits 1 and writes nothing when no source supplies a server URL", () => {
      const root = fresh(ONE_WS);
      const before = snapshot(root);
      const r = runBare({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, /Server URL required/);
      assert.deepEqual(snapshot(root), before);
    });

    it("recovers the server from an existing .mcp.json, then removes that entry and says so", () => {
      const root = fresh(ONE_WS);
      writeFileSync(join(root, ".mcp.json"), JSON.stringify({
        mcpServers: { harness: { type: "http", url: "https://recovered.example/api/mcp" } },
      }));
      const r = runBare({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root);
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /^server: https:\/\/recovered\.example$/m);
      assert.match(r.out, /only record of the server URL — make sure HARNESS_SERVER is set \(https:\/\/recovered\.example\)/);
      const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
      assert.equal(mcp.mcpServers.harness, undefined);
    });

    for (const given of ["https://h.example/api/mcp", "https://h.example/api/mcp/", "https://h.example/api/mcp/owner"]) {
      it(`normalizes ${given} to the base URL`, () => {
        const root = fresh(ONE_WS);
        const r = runWith({ HARNESS_TEMPLATES_DIR: TPL_DIR }, root, given);
        assert.equal(r.code, 0, r.out);
        assert.match(r.out, /^server: https:\/\/h\.example$/m);
      });
    }

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
    const identity = { owner: "Sangeok", repo: "stagekeeper", branch: "dev", name: "stagekeeper", slug: "stagekeeper" };
    const emptyRoot = () => mkdtempSync(join(realpathSync(tmpdir()),"harness-empty-"));

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

    it("carries no language key", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server) => {
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, emptyRoot(), server, "--print-project");
        assert.equal(r.code, 0, r.out);
        assert.ok(!("language" in JSON.parse(r.out.trim())));
      }, { project: identity });
    });

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

  describe("--register", () => {
    const identity = { owner: "Sangeok", repo: "stagekeeper", branch: "main", name: "stagekeeper", slug: "stagekeeper" };
    const IDENTITY = ["-c", "user.name=harness-test", "-c", "user.email=harness-test@example.invalid"];
    const gitRoot = (remote = "git@github.com:Sangeok/stagekeeper.git", { symref = "main" } = {}) => {
      const root = mkdtempSync(join(realpathSync(tmpdir()),"harness-git-"));
      execFileSync("git", ["init", "-q", "-b", "feature"], { cwd: root, stdio: "ignore" });
      if (remote) execFileSync("git", ["remote", "add", "origin", remote], { cwd: root, stdio: "ignore" });
      if (remote && symref) execFileSync("git", ["symbolic-ref", "refs/remotes/origin/HEAD", `refs/remotes/origin/${symref}`], { cwd: root, stdio: "ignore" });
      return root;
    };
    const bareOrigin = (root, defaultBranch) => {
      const seed = mkdtempSync(join(realpathSync(tmpdir()),"harness-seed-"));
      execFileSync("git", ["init", "-q", "-b", defaultBranch], { cwd: seed, stdio: "ignore" });
      execFileSync("git", [...IDENTITY, "commit", "-q", "--allow-empty", "-m", "init"], { cwd: seed, stdio: "ignore" });
      execFileSync("git", ["clone", "-q", "--bare", seed, join(root, "fixture", "stagekeeper.git")], { stdio: "ignore" });
    };

    it("registers what git knows, prints the identity, and writes nothing", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const root = gitRoot();
        const before = snapshot(root);
        const r = await runAsync({ HARNESS_TOKEN: "hu_test" }, root, server, "--register");
        assert.equal(r.code, 0, r.out);
        assert.deepEqual(JSON.parse(r.out.trim()), identity);
        const call = seen.find((s) => s.url?.startsWith("/api/projects"));
        assert.ok(call, "must POST to /api/projects");
        assert.equal(call.method, "POST");
        assert.equal(call.authorization, "Bearer hu_test");
        assert.deepEqual(JSON.parse(call.body), { owner: "Sangeok", repo: "stagekeeper", branch: "main" });
        assert.deepEqual(snapshot(root), before, "--register must not write files");
      }, { registered: identity });
    });

    it("registration 429 states the wait, writes nothing and never retries immediately", async () => {
      await withServer({}, async (server, seen) => {
        const root = gitRoot(); const before = snapshot(root);
        const result = await runAsync({ HARNESS_TOKEN: "hu_test" }, root, server, "--register");
        assert.equal(result.code, 1); assert.match(result.out, /Wait 23 seconds/);
        assert.equal(seen.length, 1); assert.deepEqual(snapshot(root), before); assert.ok(!result.out.includes("hu_test"));
      }, { rateAt: () => "/api/projects" });
    });

    const registerBody = async (root) => {
      let body;
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const r = await runAsync({ HARNESS_TOKEN: "hu_test" }, root, server, "--register");
        assert.equal(r.code, 0, r.out);
        assert.deepEqual(JSON.parse(r.out.trim()), identity);
        body = JSON.parse(seen.find((s) => s.url?.startsWith("/api/projects")).body);
      }, { registered: identity });
      return body;
    };
    it("asks origin for its default branch when there is no local symref", async () => {
      const root = gitRoot("fixture/stagekeeper.git", { symref: null });
      bareOrigin(root, "master");
      const before = snapshot(root);
      assert.deepEqual(await registerBody(root), { owner: "fixture", repo: "stagekeeper", branch: "master" });
      assert.deepEqual(snapshot(root), before, "--register must not write files");
    });
    it("falls back to the current branch when origin cannot answer", async () => {
      const root = gitRoot("missing/stagekeeper.git", { symref: null });
      assert.deepEqual(await registerBody(root), { owner: "missing", repo: "stagekeeper", branch: "feature" });
    });
    it("sends no branch from a detached HEAD when nothing else answers — the server picks its default", async () => {
      const root = gitRoot("missing/stagekeeper.git", { symref: null });
      execFileSync("git", [...IDENTITY, "commit", "-q", "--allow-empty", "-m", "init"], { cwd: root, stdio: "ignore" });
      execFileSync("git", ["checkout", "-q", "--detach"], { cwd: root, stdio: "ignore" });
      assert.deepEqual(await registerBody(root), { owner: "missing", repo: "stagekeeper" });
    });

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

    it("preserves the disconnected registration reason and owned reconnect URL without generating files", async () => {
      const root = gitRoot(); const before = snapshot(root);
      await withServer({}, async (server) => {
        const r = await runAsync({ HARNESS_TOKEN: "hu_test" }, root, server, "--register");
        assert.equal(r.code, 1); assert.match(r.out, /This repository is disconnected/);
        assert.ok(r.out.includes(`${server}/p/preserved`)); assert.doesNotMatch(r.out, /ask for owner\/repo/);
        assert.deepEqual(snapshot(root), before);
      }, { registerStatus: 409, registerError: { error: "This repository is disconnected. Open Stagekeeper → Projects and choose Reconnect repository.", reconnectPath: "/p/preserved" } });
    });

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

    for (const [path, args] of [["/api/project", ["--print-project"]], ["/api/templates", []]]) {
      it(`${path} 429 states the wait without retries or file writes`, async () => {
        await withServer({}, async (server, seen) => {
          const root = fresh(ONE_WS); const before = snapshot(root);
          const result = await runAsync({ HARNESS_TOKEN: "hs_test" }, root, server, ...args);
          assert.equal(result.code, 1); assert.match(result.out, /Wait 23 seconds/);
          assert.equal(seen.length, 1); assert.deepEqual(snapshot(root), before); assert.ok(!result.out.includes("hs_test"));
        }, { rateAt: () => path });
      });
    }
    it("runbook 429 preserves every generated byte, leaves the version unrecorded and exits unsuccessfully", async () => {
      let rateAt = null;
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const root = fresh(ONE_WS); const env = { HARNESS_TOKEN: "hs_test" };
        assert.equal((await runAsync(env, root, server)).code, 0);
        const before = snapshot(root); rateAt = "/api/runbook";
        const result = await runAsync(env, root, server);
        assert.equal(result.code, 1); assert.match(result.out, /runbook version not recorded.*Wait 23 seconds/);
        assert.match(result.out, /Keep the generated files/); assert.deepEqual(snapshot(root), before);
        assert.deepEqual(seen.slice(2).map((row) => row.url.split("?")[0]), ["/api/templates", "/api/runbook"]);
        assert.ok(!result.out.includes("hs_test"));
      }, { rateAt: () => rateAt });
    });
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
    it("reports the runbook version it just planted, with the same token, and writes it into the runbook", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const root = fresh(ONE_WS);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
        assert.equal(r.code, 0, r.out);
        const post = seen.find((row) => row.method === "POST");
        assert.ok(post, "no report was sent");
        assert.equal(post.url, "/api/runbook");
        assert.equal(post.authorization, "Bearer t-test");
        const version = runbookVersion(FIXTURES["CLAUDE.runbook.md"]);
        assert.deepEqual(JSON.parse(post.body), { version });
        const planted = readFileSync(join(root, "CLAUDE.md"), "utf8");
        assert.match(planted, new RegExp(`^version ${version}$`, "m"));
        assert.doesNotMatch(planted, /\{\{runbook_version\}\}/);
        assert.doesNotMatch(r.out, /not recorded/);
      });
    });
    it("versions a CRLF runbook body as its LF form, in the report and in the planted runbook", async () => {
      const body = deliverable(ROWS, "pro");
      body.templates["CLAUDE.runbook.md"] = FIXTURES["CLAUDE.runbook.md"].replace(/\n/g, "\r\n");
      await withServer(body, async (server, seen) => {
        const root = fresh(ONE_WS);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
        assert.equal(r.code, 0, r.out);
        const version = runbookVersion(FIXTURES["CLAUDE.runbook.md"]);
        assert.deepEqual(JSON.parse(seen.find((row) => row.method === "POST").body), { version });
        assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), new RegExp(`^version ${version}\\r?$`, "m"));
      });
    });
    it("a refused report leaves init successful and says so in one line", async () => {
      await withServer(deliverable(ROWS, "pro"), async (server, seen) => {
        const root = fresh(ONE_WS);
        const r = await runAsync({ HARNESS_TOKEN: "t-test" }, root, server);
        assert.equal(r.code, 0, r.out);
        assert.match(r.out, /^note: runbook version not recorded \(500: Internal Server Error\)/m);
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
