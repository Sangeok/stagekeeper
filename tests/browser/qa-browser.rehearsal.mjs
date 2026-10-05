// Actual Playwright MCP rehearsal. No model, operating DB or real credentials.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createQaBrowser } from "../../plugin/runtime/qa-browser.mjs";

const entry = process.argv[2];
if (!entry) throw new Error("Pass the installed @playwright/mcp cli.js path");
const directory = mkdtempSync(join(tmpdir(), "stagekeeper-qa-browser-"));
const html = `<!doctype html><html><head><title>QA browser fixture</title></head><body>
<h1>Disposable test environment</h1><label>Name <input id="name"></label><button id="save">Save</button><p role="status" id="status"></p>
<script>const input=document.querySelector('#name'), status=document.querySelector('#status'); input.value=localStorage.getItem('name')||'';status.textContent=input.value?'Saved '+input.value:'Empty'; document.querySelector('#save').onclick=()=>{localStorage.setItem('name',input.value);status.textContent='Saved '+input.value};</script></body></html>`;
const app = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(html); });
await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${app.address().port}`;
const reservation = createServer(); await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const child = spawn(process.execPath, [entry, "--host", "127.0.0.1", "--allowed-hosts", `127.0.0.1:${port}`, "--port", String(port), "--isolated", "--headless", "--browser", "msedge", "--output-dir", directory], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.resume(); child.stderr.resume();
const exited = new Promise(resolve => child.once("close", resolve));
let browser;
try {
  const config = { environment: "test", baseUrl, mcpUrl: `http://127.0.0.1:${port}/mcp`, scenariosPath: "fixture-only.md", artifactsDir: directory };
  let failure;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { browser = await createQaBrowser(config); break; } catch (error) { failure = error; await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  if (!browser) throw failure;
  const call = async (name, args = {}) => { const result = (await browser.call(name, args)).mcpResult; assert.ok(!result.isError, JSON.stringify(result)); return result; };
  const text = result => result.content.filter(item => item.type === "text").map(item => item.text).join("\n");
  const ref = (snapshot, label) => { const line = text(snapshot).split("\n").find(line => line.includes(label)); const match = /\[ref=([^\]]+)\]/.exec(line ?? ""); assert.ok(match, `Missing ${label} in actual snapshot`); return match[1]; };
  const target = (name, value) => browser.tools.find(tool => tool.name === name).inputSchema.properties.target ? { target: value } : { ref: value };
  const initial = await call("browser_navigate", { url: baseUrl }); assert.match(text(initial), /Disposable test environment/);
  const snapshot = await call("browser_snapshot");
  await call("browser_type", { element: "Name", ...target("browser_type", ref(snapshot, 'textbox "Name"')), text: "Fixture Alice" });
  const typed = await call("browser_snapshot");
  await call("browser_click", { element: "Save", ...target("browser_click", ref(typed, 'button "Save"')) });
  assert.match(text(await call("browser_snapshot")), /Saved Fixture Alice/);
  const reloaded = await call("browser_navigate", { url: baseUrl }); assert.match(text(reloaded), /Saved Fixture Alice/);
  const screenshot = await call("browser_take_screenshot", { type: "png" }); assert.ok(screenshot.content.some(item => item.type === "image"));
  await call("browser_console_messages"); await call("browser_network_requests");
  assert.equal(browser.verified(), true);
  await assert.rejects(browser.call("browser_navigate", { url: "https://production.example" }), /outside test origin/);
  console.log(JSON.stringify({ passed: ["test identity", "snapshot refs", "form interaction", "save", "persist after reload", "screenshot image", "console", "network", "outside-origin refusal"], artifacts: directory }));
} finally {
  try { await browser?.close(); } finally { child.kill(); await exited; app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
}
