import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { QA_BROWSER_TOOLS } from "../lib/qa.mjs";
import { createQaBrowser } from "../runtime/qa-browser.mjs";

const config = { environment: "test", baseUrl: "http://127.0.0.1:3000", mcpUrl: "http://127.0.0.1:8931/mcp", scenariosPath: "docs/qa/scenarios.md" };
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
  const artifactsDir = await mkdtemp(path.join(tmpdir(), "harness-qa-artifacts-"));
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
  const artifactsDir = await mkdtemp(path.join(tmpdir(), "harness-qa-artifacts-"));
  await writeFile(path.join(artifactsDir, "page-2026.yml"), "x".repeat(256 * 1024 + 1));
  for (const filename of ["../secret.env", "page-2026.yml"]) {
    const f = fixture(`- [Snapshot](${filename})`), browser = await createQaBrowser({ ...config, artifactsDir }, f.fetcher);
    try {
      await assert.rejects(browser.call("browser_navigate", { url: config.baseUrl }), /Unexpected QA snapshot filename|exceeded its bound/);
      assert.equal(browser.verified(), false);
    } finally { await browser.close(); }
  }
});
