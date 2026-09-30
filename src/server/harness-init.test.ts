import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { newToken } from "@harness/core/token.mjs";
import { runbookVersion } from "@harness/core/runbook.mjs";
import type { Plan } from "./entitlement";
import { makeTemplatesFor } from "./templates-query";
import { makeRecordRunbook } from "./runbook-query";
import { DISCONNECTED_REASON, NOT_SELECTED_REASON, type ProjectAccess } from "./project-access-query";

const CLI = fileURLToPath(new URL("../../plugin/bin/harness-init.mjs", import.meta.url));
const RUNBOOK = "# Runbook\nversion {{runbook_version}}\n{{report_table}}\n";
// Public fixtures test the wire contract; the private corpus has its own content checks.
const rows = [
  ...["dev", "pm", "plan-verifier", "doc-auditor", "feature-scout"].map((agent) => ({
    path: `agents/${agent}.md`, body: `---\nname: ${agent}\ndescription: Test role.\n---\nStub\n## step:start\nPrivate step\nnext: done\n`,
  })),
  ...["plans/README.md", "plans/template.md", "plans/verification-paths.md", "agents/README.md"].map((path) => ({ path: `docs/${path}`, body: "# Test document\n" })),
  { path: "CLAUDE.runbook.md", body: RUNBOOK },
];

function checkout(t: TestContext, slug?: string): string {
  const root = mkdtempSync(join(tmpdir(), "harness-scope-"));
  t.after(() => {
    assert.equal(dirname(root), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("harness-scope-"));
    rmSync(root, { recursive: true, force: true });
  });
  writeFileSync(join(root, "harness.json"), JSON.stringify({
    version: 1, project: { owner: "owner", repo: "repo", branch: "main", ...(slug === undefined ? {} : { slug }) },
    workspaces: [{ id: "web", path: ".", agent: "web-dev", verify: ["npm test"] }],
  }));
  return root;
}

function run(root: string, server: string, token: string, ...args: string[]): Promise<{ code: number | string; output: string }> {
  const env = { ...process.env };
  for (const name of ["HARNESS_TEMPLATES_DIR", "HARNESS_TOKEN", "HARNESS_SERVER", "HARNESS_PLAN"]) delete env[name];
  env.HARNESS_TOKEN = token;
  return new Promise((done) => execFile(process.execPath, [CLI, "--root", root, "--server", server, ...args], { env },
    (error, stdout, stderr) => done({ code: error?.code ?? 0, output: stdout + stderr })));
}

// Use the real REST services and token parser. Only database IO is replaced: a permissive
// fake endpoint would let the client omit project while all its tests remain green.
async function service(t: TestContext, plan: Plan = "free") {
  const user = newToken("user"), agent = newToken();
  const saved: { projectId: string; version: string }[] = [];
  const requests: { path: string; project: unknown }[] = [];
  const scopes: string[] = [];
  let templateQueries = 0;
  let access: ProjectAccess = { plan, available: true };
  let disconnectAfterTemplates = false;
  let agentRevoked = false;
  const deps = {
    findTokenByHash: async (hash: string) => hash === agent.hash ? { projectId: "legacy", revokedAt: agentRevoked ? new Date() : null } : null,
    findUserTokenByHash: async (hash: string) => hash === user.hash ? { userId: "user", revokedAt: null } : null,
    projectFor: async (slug: string, userId: string) => {
      scopes.push(slug);
      return userId === "user" && ["mathgic", "another"].includes(slug) ? slug : null;
    },
    projectAccess: async () => access,
    findTemplatesByLanguage: async () => { templateQueries++; if (disconnectAfterTemplates) access = { plan, available: false, code: "disconnected", reason: DISCONNECTED_REASON }; return rows; },
    saveRunbookVersion: async (projectId: string, version: string) => { saved.push({ projectId, version }); },
  };
  const templatesFor = makeTemplatesFor(deps), recordRunbook = makeRecordRunbook(deps);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const header = req.headers.authorization ?? null;
      res.setHeader("content-type", "application/json");
      if (url.pathname === "/api/templates" && req.method === "GET") {
        requests.push({ path: url.pathname, project: url.searchParams.get("project") });
        const result = await templatesFor(header, url.searchParams.get("lang") ?? "en", url.searchParams.get("project"));
        res.statusCode = result.ok ? 200 : result.status;
        res.end(JSON.stringify(result.ok ? { templates: result.templates, entitlement: result.entitlement } : { error: result.reason }));
      } else if (url.pathname === "/api/runbook" && req.method === "POST") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        requests.push({ path: url.pathname, project: body.project ?? null });
        const result = await recordRunbook(header, body);
        res.statusCode = result.ok ? 200 : result.status;
        res.end(JSON.stringify(result.ok ? { ok: true } : { error: result.reason }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "unexpected route" }));
      }
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "test server failed" }));
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { url: `http://127.0.0.1:${address.port}`, user: user.plain, agent: agent.plain, saved, requests, scopes, templateQueries: () => templateQueries,
    setAccess: (value: ProjectAccess) => { access = value; }, revokeAgent: () => { agentRevoked = true; },
    disconnectAfterTemplates: () => { disconnectAfterTemplates = true; },
  };
}

describe("init against the REST project-scope contract", () => {
  it("uses the same hu_ across connection, disconnection and reconnection without denied template IO or writes", async (t) => {
    const s = await service(t); const root = checkout(t, "mathgic");
    assert.equal((await run(root, s.url, s.user)).code, 0);
    const saved = s.saved.length; const queries = s.templateQueries();
    s.setAccess({ plan: "free", available: false, code: "disconnected", reason: DISCONNECTED_REASON });
    for (const args of [[], ["--dry-run"]]) {
      const deniedRoot = checkout(t, "mathgic"); const result = await run(deniedRoot, s.url, s.user, ...args);
      assert.equal(result.code, 1); assert.ok(result.output.includes(DISCONNECTED_REASON));
      assert.deepEqual(readdirSync(deniedRoot), ["harness.json"]);
    }
    assert.equal(s.templateQueries(), queries); assert.equal(s.saved.length, saved);
    s.setAccess({ plan: "free", available: true });
    assert.equal((await run(root, s.url, s.user)).code, 0); assert.equal(s.saved.length, saved + 1);
    assert.equal(s.requests.at(-2)?.project, "mathgic"); assert.equal(s.requests.at(-1)?.project, "mathgic");
  });
  it("keeps files already generated when runbook access is refused and tells init to stop", async (t) => {
    const s = await service(t); const root = checkout(t, "mathgic"); s.disconnectAfterTemplates();
    const result = await run(root, s.url, s.user);
    assert.equal(result.code, 0, "runbook reporting remains best effort");
    assert.ok(result.output.includes(DISCONNECTED_REASON)); assert.match(result.output, /stop: server access was refused after file generation/);
    assert.ok(existsSync(join(root, "CLAUDE.md"))); assert.equal(s.saved.length, 0);
    assert.deepEqual(s.requests.map((r) => r.path), ["/api/templates", "/api/runbook"]);
  });
  it("keeps not-selected refusals distinct and offers only conditional guidance on revoked hs_", async (t) => {
    const s = await service(t); const root = checkout(t, "mathgic");
    s.setAccess({ plan: "free", available: false, code: "not-selected", reason: NOT_SELECTED_REASON });
    const locked = await run(root, s.url, s.user); assert.equal(locked.code, 1);
    assert.ok(locked.output.includes(NOT_SELECTED_REASON)); assert.ok(!locked.output.includes(DISCONNECTED_REASON));
    s.revokeAgent(); const revoked = await run(root, s.url, s.agent);
    assert.equal(revoked.code, 1); assert.match(revoked.output, /401.*If this project was disconnected/);
    assert.match(revoked.output, /issue a new project token/); assert.deepEqual(readdirSync(root), ["harness.json"]);
  });
  for (const plan of ["free", "pro", "max"] as const) {
    it(`initializes and refreshes a hu_ checkout on ${plan}, recording its runbook each time`, async (t) => {
      const s = await service(t, plan), root = checkout(t, "mathgic");
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await run(root, s.url, s.user);
        assert.equal(result.code, 0, result.output);
        assert.doesNotMatch(result.output, /not recorded/);
      }
      assert.deepEqual(s.requests, Array.from({ length: 2 }, () => [
        { path: "/api/templates", project: "mathgic" }, { path: "/api/runbook", project: "mathgic" },
      ]).flat());
      assert.deepEqual(s.saved, Array.from({ length: 2 }, () => ({ projectId: "mathgic", version: runbookVersion(RUNBOOK) })));
      assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), new RegExp(runbookVersion(RUNBOOK)));
      assert.equal(existsSync(join(root, ".claude/agents/plan-verifier.md")), plan !== "free");
    });
  }

  it("uses each checkout's slug with the same user token", async (t) => {
    const s = await service(t);
    for (const slug of ["mathgic", "another"]) {
      const result = await run(checkout(t, slug), s.url, s.user);
      assert.equal(result.code, 0, result.output);
    }
    assert.deepEqual(s.saved.map((row) => row.projectId), ["mathgic", "another"]);
  });

  for (const slug of [undefined, "   "]) {
    it(`refuses hu_ with ${slug === undefined ? "no" : "blank"} slug before requests or file writes`, async (t) => {
      const s = await service(t), root = checkout(t, slug);
      const before = readFileSync(join(root, "harness.json"), "utf8");
      const result = await run(root, s.url, s.user);
      assert.equal(result.code, 1);
      assert.match(result.output, /requires harness.json project.slug/);
      assert.deepEqual(s.requests, []);
      assert.deepEqual(readdirSync(root), ["harness.json"]);
      assert.equal(readFileSync(join(root, "harness.json"), "utf8"), before);
    });
  }

  for (const slug of [undefined, "another"]) {
    it(`preserves hs_ token scope with configured slug ${String(slug)}`, async (t) => {
      const s = await service(t);
      const result = await run(checkout(t, slug), s.url, s.agent);
      assert.equal(result.code, 0, result.output);
      assert.deepEqual(s.scopes, []);
      assert.ok(s.requests.every((request) => request.project === null));
      assert.deepEqual(s.saved, [{ projectId: "legacy", version: runbookVersion(RUNBOOK) }]);
    });
  }

  it("dry-run authenticates the requested project but writes and reports nothing", async (t) => {
    const s = await service(t), root = checkout(t, "mathgic");
    const result = await run(root, s.url, s.user, "--dry-run");
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(s.requests, [{ path: "/api/templates", project: "mathgic" }]);
    assert.deepEqual(s.saved, []);
    assert.deepEqual(readdirSync(root), ["harness.json"]);
  });

  it("does not generate files or query templates for a foreign project", async (t) => {
    const s = await service(t), root = checkout(t, "foreign");
    const result = await run(root, s.url, s.user);
    assert.equal(result.code, 1);
    assert.match(result.output, /403.*not the owner/);
    assert.equal(s.templateQueries(), 0);
    assert.deepEqual(s.saved, []);
    assert.deepEqual(readdirSync(root), ["harness.json"]);
  });
});
