import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { RUNTIME_MARKER, COMMON_DOCS } from "../lib/client-runtime.mjs";
import { deliverable, stubOf } from "../lib/deliver.mjs";
import { codexRunbookVersion } from "../lib/runbook.mjs";
import { ROLE_TOOLS, ROLE_FILE_TOOLS, readCodexRole } from "../runtime/codex-agent.mjs";
import { renderTemplate } from "../lib/render.mjs";
import { hashOf } from "../lib/manifest.mjs";
import { newToken } from "../lib/token.mjs";
import { QA_BROWSER_TOOLS } from "../lib/qa.mjs";

const BIN = fileURLToPath(new URL("harness-init.mjs", import.meta.url));
const roles = Object.entries(ROLE_TOOLS).map(([role, tools]) => ({ path: `agents/${role}.md`, body: `---\nname: ${role === "dev" ? "{{ws.agent}}" : role}\ndescription: Test ${role}\ntools: ${[...ROLE_FILE_TOOLS[role], ...tools.map(tool => `mcp__harness__${tool}`), ...(role === "qa-verifier" ? QA_BROWSER_TOOLS.map(tool => `mcp__harness_qa_browser__${tool}`) : [])].join(", ")}\n---\n${RUNTIME_MARKER}\nStub only.\n## step:start\nPRIVATE STEP\nnext: done\n` }));
const rows = [...roles, ...COMMON_DOCS.map(path => ({ path, body: "shared {{project.name}}\n" })), { path: "CLAUDE.runbook.md", body: "Claude version {{runbook_version}}\n" }, { path: "CODEX.runbook.md", body: `${RUNTIME_MARKER}\nCodex source {{runbook_version}}\n` }];
const config = { version: 1, project: { owner: "o", repo: "r", branch: "main", slug: "o-r" }, workspaces: [{ id: "web", path: "src", agent: "web-dev", verify: ["npm test"] }] };

for (const newline of ["\n", "\r\n"]) it(`generates one-marker Codex role instructions and the entire runbook: ${JSON.stringify(newline)}`, async t => {
  const raw = rows.map(row => ({ ...row, body: row.body.replace("Stub only.\n", "## step: start\nStub only.\n").replaceAll("\n", newline) }));
  const f = await fixture(t, (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(request.url.startsWith("/api/templates") ? JSON.stringify(deliverable(raw, "max", "codex")) : "{}");
  });
  const result = await f.run("codex"); assert.equal(result.code, 0, result.output);
  const rolePath = ".codex/agents/web-dev.toml", roleBody = readFileSync(join(f.root, rolePath), "utf8");
  const decoded = readCodexRole(roleBody, "dev", "web-dev");
  assert.equal((decoded.developer_instructions.match(/<!-- harness-runtime:[^>]+ -->/g) ?? []).length, 1);
  assert.match(decoded.developer_instructions, /## step: start\nStub only\./);
  assert.doesNotMatch(decoded.developer_instructions, /PRIVATE STEP|^## step:\S/m);
  assert.equal(decoded.sandbox_mode, "workspace-write");
  assert.equal(decoded["agents.enabled"], false);
  assert.equal(decoded["mcp_servers.harness_owner.enabled"], false);
  assert.deepEqual(decoded["mcp_servers.harness.enabled_tools"], ROLE_TOOLS.dev);
  const source = raw.find(row => row.path === "CODEX.runbook.md").body;
  const version = codexRunbookVersion(source), runbook = readFileSync(join(f.root, "docs/harness/codex-runbook.md"), "utf8");
  assert.equal(runbook, renderTemplate(source, { runbook_version: version }));
  const metadata = JSON.parse(readFileSync(join(f.root, "docs/harness/codex-package.json"), "utf8"));
  assert.equal(metadata.client, "codex"); assert.equal(metadata.protocol, "harness-runtime-v1");
  assert.equal(metadata.runbook, version); assert.equal(metadata.language, "en");
  assert.equal(metadata.verifier.path, join(f.skill, "SKILL.md")); assert.equal(metadata.verifier.files, 2); assert.match(metadata.verifier.checksum, /^[a-f0-9]{64}$/);
  const lock = JSON.parse(readFileSync(join(f.root, "harness.lock.json"), "utf8"));
  assert.equal(lock.files[rolePath].hash, hashOf(roleBody));
  assert.equal(lock.files["docs/harness/codex-runbook.md"].hash, hashOf(runbook));
  for (const path of COMMON_DOCS) {
    const body = readFileSync(join(f.root, path), "utf8");
    assert.equal(body, `shared r${newline}`); assert.equal(lock.files[path].hash, hashOf(body));
  }
  assert.equal(existsSync(join(f.root, "CLAUDE.md")), false);
  assert.equal(existsSync(join(f.root, ".claude")), false);
});

it("rejects a duplicate-marker delivered dev stub before writing roles, runbook, package or lock", async t => {
  const payload = deliverable(rows, "max", "codex");
  const original = rows.find(row => row.path === "agents/dev.md").body;
  payload.templates["agents/dev.md"] = stubOf(original.replace("Stub only.\n", "Stub only.\n## step: start\n" + RUNTIME_MARKER + "\n"));
  const f = await fixture(t, (_request, response) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(payload)); });
  const result = await f.run("codex"); assert.notEqual(result.code, 0);
  assert.match(result.output, /protocol mismatch/);
  for (const name of [".codex", ".claude", "docs", "harness.lock.json", "harness.init.guard"]) assert.equal(existsSync(join(f.root, name)), false);
});

async function fixture(t, respond = null) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "harness-init-dual-")), skill = join(root, "verifier");
  mkdirSync(skill); writeFileSync(join(skill, "SKILL.md"), "---\nname: reconciling-proposals-with-codebase\n---\nRead [gates](./gates.md).\n"); writeFileSync(join(skill, "gates.md"), "Fixture only: INV-1 INV-2 INV-3 INV-4 INV-5 INV-6 INV-7\n");
  writeFileSync(join(root, "harness.json"), JSON.stringify(config));
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://localhost"); requests.push(url.pathname + url.search);
    if (respond) { respond(request, response); return; }
    response.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/templates") response.end(JSON.stringify(deliverable(rows, "max", url.searchParams.get("client") ?? "claude")));
    else if (url.pathname === "/api/runbook") response.end("{}");
    else { response.writeHead(404); response.end("{}"); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const env = { ...process.env, HARNESS_TOKEN: newToken().plain, HARNESS_VERIFIER_SKILL_DIR: skill };
  delete env.HARNESS_TEMPLATES_DIR; delete env.HARNESS_PLAN; delete env.HARNESS_OWNER_TOKEN;
  const run = (client, ...args) => new Promise(resolve => execFile(process.execPath, [BIN, "--root", root, "--server", `http://127.0.0.1:${server.address().port}`, "--client", client, ...args], { env, windowsHide: true, timeout: 35000 }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, output: stdout + stderr })));
  return { root, run, requests, skill, env };
}

it("bounds local Codex remote preflight headers, body and error body before any output writes", { timeout: 65000 }, async t => {
  await Promise.all(["headers", "body", "error-body"].map(async mode => {
    const timers = [];
    const f = await fixture(t, (_request, response) => {
      if (mode === "headers") return;
      response.writeHead(mode === "error-body" ? 429 : 200, { "Content-Type": "application/json" }); response.write('{"unfinished":');
      const timer = setInterval(() => { if (!response.destroyed) response.write(" "); }, 250); timers.push(timer);
      response.once("close", () => clearInterval(timer));
    });
    t.after(() => timers.forEach(clearInterval));
    const directory = join(f.root, "local-templates");
    for (const row of rows) {
      const file = join(directory, "en", row.path); mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, row.body);
    }
    f.env.HARNESS_TEMPLATES_DIR = directory; f.env.HARNESS_PLAN = "max";
    const started = Date.now(), result = await f.run("codex");
    assert.equal(result.code, 1, result.output); assert.ok(Date.now() - started >= 18000);
    assert.equal(f.requests.length, 1, "preflight must not retry");
    for (const name of ["harness.lock.json", "harness.init.guard", ".codex", "docs/harness/codex-runbook.md"]) assert.equal(existsSync(join(f.root, name)), false);
  }));
});

for (const dry of [false, true]) it(`Codex ignores a CLAUDE.md directory including invalid markers during init; dry-run=${dry}`, async t => {
  const f = await fixture(t), legacy = join(f.root, "CLAUDE.md");
  mkdirSync(legacy); writeFileSync(join(legacy, "canary"), "<!-- harness:runbook:start --> unrelated broken legacy file");
  const result = await f.run("codex", ...(dry ? ["--dry-run"] : []));
  assert.equal(result.code, 0, result.output);
  assert.equal(readFileSync(join(legacy, "canary"), "utf8"), "<!-- harness:runbook:start --> unrelated broken legacy file");
  assert.equal(existsSync(join(f.root, "harness.lock.json")), !dry);
  assert.equal(existsSync(join(f.root, "docs/harness/codex-runbook.md")), !dry);
  assert.equal(existsSync(join(f.root, "harness.init.guard")), false);
});

for (const order of [["claude", "codex"], ["codex", "claude"]]) it(`initializes ${order.join(" then ")} without damaging the other client or lock`, async t => {
  const f = await fixture(t);
  for (const client of order) { const result = await f.run(client); assert.equal(result.code, 0, result.output); }
  const claude = readFileSync(join(f.root, ".claude/agents/web-dev.md"), "utf8"), codex = readFileSync(join(f.root, ".codex/agents/web-dev.toml"), "utf8");
  assert.doesNotMatch(claude + codex, /PRIVATE STEP|## step:/);
  const version = codexRunbookVersion(rows.find(row => row.path === "CODEX.runbook.md").body);
  assert.match(readFileSync(join(f.root, "docs/harness/codex-runbook.md"), "utf8"), new RegExp(version));
  const lock = JSON.parse(readFileSync(join(f.root, "harness.lock.json"), "utf8"));
  assert.equal(lock.version, 1); assert.ok(lock.files[".claude/agents/web-dev.md"]); assert.ok(lock.files[".codex/agents/web-dev.toml"]);
  const originalClaude = readFileSync(join(f.root, "CLAUDE.md"), "utf8");
  writeFileSync(join(f.root, ".mcp.json"), "broken unrelated legacy file");
  assert.equal((await f.run("codex")).code, 0); assert.equal(readFileSync(join(f.root, "CLAUDE.md"), "utf8"), originalClaude); assert.equal(readFileSync(join(f.root, ".mcp.json"), "utf8"), "broken unrelated legacy file");
  assert.equal(f.requests.filter(request => request.startsWith("/api/runbook")).length, 1);
});

it("dry-run leaves no guard, role, lock or package output and rejects dry-run registration", async t => {
  const f = await fixture(t), result = await f.run("codex", "--dry-run");
  assert.equal(result.code, 0, result.output); assert.match(result.output, /planned:/); assert.doesNotMatch(result.output, /ready:/);
  for (const name of ["harness.lock.json", "harness.init.guard", ".codex", "docs/harness/codex-runbook.md"]) assert.equal(existsSync(join(f.root, name)), false);
  assert.notEqual((await f.run("codex", "--dry-run", "--register")).code, 0);
});

it("preserves modified Codex file and its prior lock hash, and serializes concurrent init", async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.run("claude"), f.run("codex")]);
  for (const result of results) assert.equal(result.code, 0, result.output);
  const file = ".codex/agents/web-dev.toml", previous = JSON.parse(readFileSync(join(f.root, "harness.lock.json"), "utf8")).files[file];
  writeFileSync(join(f.root, file), "user changed\n");
  assert.equal((await f.run("codex")).code, 0); assert.equal(readFileSync(join(f.root, file), "utf8"), "user changed\n");
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, "harness.lock.json"), "utf8")).files[file], previous);
  assert.equal(existsSync(join(f.root, "harness.init.guard")), false);
});

it("rejects incomplete verifier resources before generated writes", async t => {
  const f = await fixture(t); writeFileSync(join(f.skill, "SKILL.md"), "---\nname: reconciling-proposals-with-codebase\n---\nRead [missing](./missing.md).\n");
  assert.notEqual((await f.run("codex")).code, 0); assert.equal(existsSync(join(f.root, "harness.lock.json")), false); assert.equal(existsSync(join(f.root, ".codex")), false);
});
