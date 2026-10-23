import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { it } from "node:test";
import { realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { QA_BROWSER_TOOLS } from "../lib/qa.mjs";
import { createQaBrowser, withQaBrowser } from "../runtime/qa-browser.mjs";

const config = { environment: "test", baseUrl: "http://127.0.0.1:3000", mcpUrl: "http://127.0.0.1:8931/mcp", scenariosPath: "docs/qa/scenarios.md" };
it("deletes an initialized QA session when inventory validation fails", async () => {
  const f = fixture(), deletes = [];
  await assert.rejects(createQaBrowser(config, async (url, options) => {
    if (options.method === "DELETE") { deletes.push(options.headers["Mcp-Session-Id"]); return f.fetcher(url, options); }
    const message = JSON.parse(options.body);
    if (message.method === "tools/list") return Response.json({ jsonrpc: "2.0", id: message.id, result: { tools: [] } });
    return f.fetcher(url, options);
  }), /inventory incomplete/);
  assert.deepEqual(deletes, ["qa-session"]);
});
for (const failClose of [false, true]) it(`QA cleanup deletes the session and closes files even when browser close fails: ${failClose}`, async () => {
  const f = fixture(), cleanup = [];
  const browser = await createQaBrowser(config, async (url, options) => {
    if (options.method === "DELETE") { cleanup.push("delete"); return f.fetcher(url, options); }
    const message = JSON.parse(options.body);
    if (message.params?.name === "browser_close") { cleanup.push("browser"); if (failClose) throw new Error("close transport failed"); }
    return f.fetcher(url, options);
  });
  await browser.call("browser_navigate", { url: config.baseUrl });
  const broker = withQaBrowser({ tools: [], close: async () => { cleanup.push("files"); } }, browser);
  if (failClose) await assert.rejects(broker.close(), /close transport failed/); else await broker.close();
  await browser.close(); assert.deepEqual(cleanup, ["browser", "delete", "files"]);
});
function fixture(snapshot = "- textbox [ref=e1]") {
  const calls = []; let failed = false, origin = config.baseUrl;
  const fetcher = async (_url, options) => {
    assert.equal(options.headers.Authorization, undefined);
    if (options.method === "DELETE") return new Response(null, { status: 204 });
    const message = JSON.parse(options.body); calls.push(message);
    if (!message.id) return new Response(null, { status: 202 });
    if (message.method !== "initialize") assert.equal(options.headers["Mcp-Session-Id"], "qa-session");
    const result = message.method === "tools/list" ? { tools: QA_BROWSER_TOOLS.map(name => ({ name, inputSchema: { type: "object" } })) }
      : message.method === "initialize" ? { protocolVersion: "2025-03-26" }
      : { content: [{ type: "text", text: `### Page\n- Page URL: ${origin}/settings\n### Snapshot\n${snapshot}` }], isError: failed };
    return Response.json({ jsonrpc: "2.0", id: message.id, result }, { headers: { "Mcp-Session-Id": "qa-session" } });
  };
  return { calls, fetcher, fail: () => { failed = true; }, leave: () => { origin = "https://production.example"; } };
}
it("the browser bridge retains its isolated session, narrows tools and requires actual observations", async () => {
  const f = fixture(), browser = await createQaBrowser(config, f.fetcher);
  assert.equal(browser.verified(), false);
  await assert.rejects(browser.call("browser_run_code_unsafe", {}), /refused/);
  await assert.rejects(browser.call("browser_navigate", { url: "https://production.example" }), /outside test origin/);
  await assert.rejects(browser.call("browser_snapshot", { filename: "../owner-file" }), /output directory/);
  for (const name of ["browser_navigate", "browser_snapshot", "browser_console_messages", "browser_network_requests"]) await browser.call(name, name === "browser_navigate" ? { url: config.baseUrl } : {});
  assert.equal(browser.verified(), true);
  assert.equal(f.calls.filter(call => call.method === "initialize").length, 1);
  f.leave(); await assert.rejects(browser.call("browser_click", { ref: "e1" }), /left the configured test origin/);
  await browser.close();
});
it("tool failures remain failures and never count as completed browser verification", async () => {
  const f = fixture(), browser = await createQaBrowser(config, f.fetcher); f.fail();
  assert.equal((await browser.call("browser_navigate", { url: config.baseUrl })).mcpResult.isError, true);
  assert.equal(browser.verified(), false); await browser.close();
});
it("current MCP file snapshots expose observed refs only from the explicit artifact directory", async () => {
  const artifactsDir = await mkdtemp(path.join(realpathSync(tmpdir()), "harness-qa-artifacts-"));
  await writeFile(path.join(artifactsDir, "page-2026-10-05.yml"), '- button "Save" [ref=e2]');
  const f = fixture("- [Snapshot](output/page-2026-10-05.yml)"), browser = await createQaBrowser({ ...config, artifactsDir }, f.fetcher);
  try {
    const result = await browser.call("browser_navigate", { url: config.baseUrl });
    assert.match(result.mcpResult.content.map(item => item.text).join("\n"), /Observed snapshot\n- button "Save" \[ref=e2\]/);
  } finally { await browser.close(); }
  const unconfigured = await createQaBrowser(config, f.fetcher);
  try { await assert.rejects(unconfigured.call("browser_navigate", { url: config.baseUrl }), /artifactsDir/); }
  finally { await unconfigured.close(); }
});
it("unrecognized or oversized snapshot files cannot become QA observations", async () => {
  const artifactsDir = await mkdtemp(path.join(realpathSync(tmpdir()), "harness-qa-artifacts-"));
  await writeFile(path.join(artifactsDir, "page-2026.yml"), "x".repeat(256 * 1024 + 1));
  for (const filename of ["../secret.env", "page-2026.yml"]) {
    const f = fixture(`- [Snapshot](${filename})`), browser = await createQaBrowser({ ...config, artifactsDir }, f.fetcher);
    try {
      await assert.rejects(browser.call("browser_navigate", { url: config.baseUrl }), /Unexpected QA snapshot filename|exceeded its bound/);
      assert.equal(browser.verified(), false);
    } finally { await browser.close(); }
  }
});

const execFileAsync = promisify(execFile);
const rehearsalPath = fileURLToPath(new URL("../../tests/browser/qa-browser.rehearsal.mjs", import.meta.url));

async function runRehearsal(t, cliSource) {
  const directory = await mkdtemp(path.join(realpathSync(tmpdir()), "qa-rehearsal-test-"));
  const cliPath = path.join(directory, "mcp.mjs");
  const statePath = path.join(directory, "state.json");
  let output = "";
  t.after(async () => {
    try {
      const state = JSON.parse(await readFile(statePath, "utf8"));
      try {
        process.kill(state.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
      const artifacts = /QA browser rehearsal artifacts: (.+)/.exec(output)?.[1];
      if (artifacts) {
        assert.equal(path.dirname(artifacts), realpathSync(tmpdir()));
        assert.ok(path.basename(artifacts).startsWith("stagekeeper-qa-browser-"));
        await rm(artifacts, { recursive: true, force: true });
      }
    }
  });
  if (cliSource) await writeFile(cliPath, cliSource(statePath));
  try {
    const result = await execFileAsync(process.execPath, [rehearsalPath, cliPath], {
      timeout: 15000,
      killSignal: "SIGKILL",
    });
    output = result.stderr;
    return { ...result, code: 0, statePath, cliPath };
  } catch (error) {
    output = error.stderr ?? "";
    assert.equal(error.killed, false, "Rehearsal must finish its own cleanup before the test timeout");
    return { stdout: error.stdout, stderr: output, code: error.code, statePath, cliPath };
  }
}

it("the browser rehearsal reports a missing MCP entrypoint instead of hiding it behind a connection error", async t => {
  const result = await runRehearsal(t);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Playwright MCP stopped \(code 1\)/);
  assert.match(result.stderr, /MODULE_NOT_FOUND/);
  assert.ok(result.stderr.includes(result.cliPath));
  assert.equal(result.stdout, "");
});

it("the browser rehearsal retains the MCP startup exit code and diagnostic output", async t => {
  const result = await runRehearsal(t, () => 'console.error("MCP_STARTUP_FAILURE"); process.exit(7);');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Playwright MCP stopped \(code 7\)/);
  assert.match(result.stderr, /MCP_STARTUP_FAILURE/);
  assert.equal(result.stdout, "");
});

function failingBrowserMcp(statePath, mode) {
  return `
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
const state = { pid: process.pid, port, browserCloseRequested: false };
const saveState = () => writeFileSync(${JSON.stringify(statePath)}, JSON.stringify(state));
if (${JSON.stringify(mode)} === "ignore-stop") process.on("SIGTERM", () => {});

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (request.method === "DELETE") {
    response.writeHead(204).end();
    return;
  }
  const message = JSON.parse(Buffer.concat(chunks).toString());
  if (!message.id) {
    response.writeHead(202).end();
    return;
  }
  let result = {};
  if (message.method === "tools/list") {
    result = { tools: ${JSON.stringify(QA_BROWSER_TOOLS)}.map(name => ({ name, inputSchema: { properties: { ref: {} } } })) };
  }
  if (message.method === "tools/call") {
    if (message.params.name === "browser_close") {
      state.browserCloseRequested = true;
      saveState();
      if (${JSON.stringify(mode)} === "hang-close") return;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "CLOSE_FAILURE" } }));
      return;
    }
    state.baseUrl = message.params.arguments.url;
    saveState();
    result = { content: [{ type: "text", text: "- Page URL: " + state.baseUrl + "\\nWrong fixture identity" }] };
  }
  response.writeHead(200, { "Content-Type": "application/json", "Mcp-Session-Id": "rehearsal-test" });
  response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
});
server.listen(port, "127.0.0.1", saveState);
`;
}

for (const mode of ["ignore-stop", "hang-close"]) {
  it(`the browser rehearsal preserves its assertion failure and releases resources when cleanup fails: ${mode}`, async t => {
    const result = await runRehearsal(t, statePath => failingBrowserMcp(statePath, mode));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /AssertionError/);
    assert.match(result.stderr, /Disposable test environment/);
    assert.match(result.stderr, /QA browser rehearsal cleanup failed/);
    assert.match(result.stderr, /Failed to close QA browser/);
    if (mode === "hang-close") assert.match(result.stderr, /QA browser close timed out/);
    assert.equal(result.stdout, "");

    const state = JSON.parse(await readFile(result.statePath, "utf8"));
    assert.equal(state.browserCloseRequested, true);
    assert.throws(() => process.kill(state.pid, 0), { code: "ESRCH" });
    await assert.rejects(fetch(state.baseUrl, { signal: AbortSignal.timeout(1000) }));
    await assert.rejects(fetch(`http://127.0.0.1:${state.port}`, { signal: AbortSignal.timeout(1000) }));
  });
}
