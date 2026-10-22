import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

if (!process.argv[2]) throw new Error("Pass an installed playwright-core/index.mjs; no dependency is installed by this rehearsal.");
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const require = createRequire(import.meta.url), { build } = require("esbuild");
const artifacts = mkdtempSync(join(realpathSync(tmpdir()), "multiple-pipelines-browser-"));
const built = await build({ entryPoints: ["tests/server/fixtures/multiple-pipelines-browser.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, banner: { js: 'var process = { env: { NODE_ENV: "development" } };' } });
let css = "";
try { for (const name of readdirSync(".next/static/chunks")) if (name.endsWith(".css")) css += readFileSync(join(".next/static/chunks", name), "utf8"); } catch {   }
const app = createServer((request, response) => {
  if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(built.outputFiles[0].text); }
  else { response.setHeader("Content-Type", "text/html"); response.end(`<!doctype html><html><head><title>Multiple pipelines fixture</title><style>${css}</style></head><body style="padding:32px"><main id="root"></main><script src="/fixture.js"></script></body></html>`); }
});
await new Promise(resolve => app.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${app.address().port}`;
let browser;
const results = [], errors = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin); await page.getByRole("heading", { name: "Pipelines", exact: true }).waitFor();
  const button = label => page.getByRole("button", { name: label, exact: true });
  const mount = async (mode, editable = true) => { await page.evaluate(({ mode, editable }) => window.fixture.mount(mode, editable), { mode, editable }); await page.waitForTimeout(60); };
  const finish = async outcome => { await page.evaluate(outcome => window.fixture.finish(outcome), outcome); await page.waitForTimeout(60); };
  const writes = () => page.evaluate(() => window.fixture.writes);
  const add = async name => { await button("Add at end").click(); await button(name).click(); };
  const run = async (name, work) => { await work(); results.push(name); };

  await run("Free values are visible but all editing and picking mutations are unavailable", async () => {
    await mount("list", false); assert.equal(await button("New pipeline").count(), 0); assert.equal(await button("Rename").count(), 0); assert.equal(await button("Archive").count(), 0);
    assert.equal(await page.locator("select:disabled").count(), 5); assert.equal(await page.getByRole("switch", { name: "Automatic picking" }).isDisabled(), true);
  });
  await run("empty drafts add first steps and trailing references; fragment saves need no no-gate confirmation and open the created pipeline", async () => {
    await mount("list"); await button("New pipeline").click(); await page.getByLabel("New pipeline name").fill("Review");
    assert.equal(await button("Save").isDisabled(), true); await button("Add first step").click(); await button("Add QA").click();
    await button("Save").click(); assert.equal((await writes()).length, 1);
    assert.deepEqual((await writes())[0].input.definition, { steps: ["qa"], gates: [] });
    assert.equal(await button("New pipeline").isDisabled(), true); assert.equal(await button("Default").isDisabled(), true);
    await finish("success");
    await page.evaluate(() => window.fixture.update([...window.fixture.initial, { id: "created", name: "Review", isDefault: false, definition: { steps: ["qa"], gates: [] }, saved: { version: 1, createdAt: new Date(0) }, runnable: null }]));
    await page.getByRole("heading", { name: "Review", exact: true }).waitFor(); assert.equal(await button("Review").getAttribute("aria-pressed"), "true");
    await button("New pipeline").click(); await button("Add first step").click(); await button("Add Plan").click();
    await add("Add Implement"); await add("Use Check here"); await add("Add Accept");
    assert.ok((await page.locator("body").innerText()).includes("Check · 1 nodes"));
  });
  await run("dirty selection prompts, archive returns to default, pending/unknown settings never duplicate", async () => {
    await mount("list"); await button("Delivery").click(); await add("Add doc-auditor here");
    page.once("dialog", dialog => dialog.dismiss()); await button("Default").click(); assert.equal(await button("Delivery").getAttribute("aria-pressed"), "true");
    page.once("dialog", dialog => dialog.accept()); await button("Default").click(); assert.equal(await button("Default").getAttribute("aria-pressed"), "true");
    await button("Delivery").click(); await button("Delivery").locator("..").getByRole("button", { name: "Archive", exact: true }).click();
    assert.equal(await button("Default").isDisabled(), true); await finish("success");
    await page.evaluate(() => window.fixture.update(window.fixture.initial.filter(row => row.id !== "delivery")));
    assert.equal(await button("Default").getAttribute("aria-pressed"), "true");
    await page.getByRole("switch", { name: "Automatic picking" }).click();
    assert.equal(await page.getByRole("switch", { name: "Automatic picking" }).isDisabled(), true); await finish("unknown");
    assert.match(await page.getByRole("alert").innerText(), /setting may have changed/); assert.equal((await writes()).length, 2); assert.equal(await button("New pipeline").isDisabled(), true);
  });
  for (const outcome of ["stale", "unknown"]) await run(`rail ${outcome} retains draft and requires explicit reload`, async () => {
    await mount("rail"); await add("Add doc-auditor here"); await button("Save").click();
    assert.equal((await writes()).length, 1); await finish(outcome);
    assert.match(await page.getByRole("alert").innerText(), outcome === "stale" ? /pipeline changed/ : /confirm whether the pipeline was saved/);
    assert.equal(await button("Save").isDisabled(), true); assert.equal(await button("Discard changes and reload").count(), 1);
    assert.ok((await page.locator("body").innerText()).includes("Doc audit"));
  });
  await run("plan and read-only changes preserve the draft and its original save version", async () => {
    await mount("list"); await button("Delivery").click(); await add("Add doc-auditor here");
    await page.evaluate(() => { window.fixture.plan("max"); window.fixture.access(false); });
    await button("Save").waitFor({ state: "hidden" }); await button("Discard changes").waitFor();
    assert.ok((await page.locator("body").innerText()).includes("Doc audit"));
    await page.evaluate(() => window.fixture.access(true)); await button("Save").click();
    assert.equal((await writes())[0].input.expectedVersion, 1);
    assert.ok((await writes())[0].input.definition.steps.includes("doc-auditor"));
    await finish("success");
  });
  await run("a newer own snapshot remains recoverable after access becomes read-only", async () => {
    await mount("rail"); await add("Add doc-auditor here");
    await page.evaluate(() => { window.fixture.update(window.fixture.initial.map(row => row.id === "delivery" ? { ...row, saved: { version: 2, createdAt: new Date(1) } } : row)); window.fixture.access(false); });
    await button("Discard changes and reload").waitFor(); assert.equal(await button("Save").count(), 0);
    assert.match(await page.getByRole("alert").first().innerText(), /pipeline changed/);
    assert.ok((await page.locator("body").innerText()).includes("Doc audit"));
    assert.equal((await writes()).length, 0);
  });
  await run("a pending save adopts a newer received snapshot without regressing its version", async () => {
    await mount("rail"); await add("Add doc-auditor here"); await button("Save").click();
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map(row => row.id === "delivery" ? { ...row, definition: { steps: ["plan", "implement", "pipeline:check", "accept", "feature-scout"], gates: [] }, saved: { version: 3, createdAt: new Date(2) } } : row)));
    await finish("success"); await add("Add doc-auditor here"); await button("Save").click();
    assert.equal((await writes())[1].input.expectedVersion, 3);
    assert.ok((await writes())[1].input.definition.steps.includes("feature-scout"));
    await finish("success");
  });
  await run("dependency-only snapshots retain dirty drafts, refresh preview and invalidate prior no-gate confirmation", async () => {
    await mount("rail"); await add("Add doc-auditor here");
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map(row => row.id === "check" ? { ...row, definition: { steps: ["qa"], gates: [] }, saved: { version: 2, createdAt: new Date(0) } } : row.id === "delivery" ? { ...row, runnable: { ...row.runnable, gates: [] } } : row)));
    await page.getByRole("alert").waitFor(); assert.match(await page.getByRole("alert").innerText(), /saved pipelines changed/);
    await button("Save").click(); assert.equal((await writes()).length, 0); assert.equal(await button("Save without a gate").count(), 1);
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map(row => row.id === "check" ? { ...row, definition: { steps: ["qa"], gates: [] }, saved: { version: 3, createdAt: new Date(1) } } : row.id === "delivery" ? { ...row, runnable: { ...row.runnable, gates: [] } } : row)));
    await button("Save").waitFor(); assert.equal(await button("Save without a gate").count(), 0);
    await page.getByLabel("Show expanded").check(); assert.ok((await page.locator("body").innerText()).includes("Doc audit"));
  });
  for (const outcome of ["stale", "unknown"]) await run(`item change ${outcome} and identity reset`, async () => {
    await mount("change"); await page.getByLabel("Change pipeline", { exact: true }).selectOption("delivery");
    await button("Change pipeline").click(); assert.equal((await writes()).length, 1); assert.equal(await page.getByLabel("Change pipeline", { exact: true }).isDisabled(), true);
    await finish(outcome); assert.match(await page.getByRole("alert").innerText(), outcome === "stale" ? /board changed/ : /confirm whether the pipeline changed/);
    await page.evaluate(() => window.fixture.identity("ITEM-02")); await page.waitForTimeout(60);
    assert.equal(await page.getByLabel("Change pipeline", { exact: true }).inputValue(), ""); assert.equal(await page.getByRole("alert").count(), 0);
  });
  await run("unmounted responses cannot refresh another identity", async () => {
    await mount("change"); await page.getByLabel("Change pipeline", { exact: true }).selectOption("delivery"); await button("Change pipeline").click();
    await page.evaluate(() => window.fixture.identity("ITEM-02")); await page.waitForTimeout(60); await finish("success");
    assert.equal(await page.evaluate(() => window.fixture.refreshes), 0);
  });
  await run("propose captures one request and updates routing only after pending settles", async () => {
    await mount("propose"); await button("Put on the board").click(); await page.getByLabel("Pipeline", { exact: true }).selectOption("delivery");
    await button("Put on the board").click(); await page.evaluate(() => window.fixture.preset("delivery"));
    assert.equal((await writes()).length, 1); assert.equal((await writes())[0].input.pipelineId, "delivery");
    await finish("error"); await page.evaluate(() => window.fixture.preset("default")); await page.waitForTimeout(60);
    assert.equal(await page.getByLabel("Pipeline", { exact: true }).inputValue(), "default");
  });
  await run("new slots reserve ids inside referenced definitions without modifying them", async () => {
    await mount("rail");
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map(row => row.id === "check"
      ? { ...row, definition: { steps: ["doc-auditor", "doc-auditor#2"], gates: ["before-doc-auditor"] }, saved: { version: 2, createdAt: new Date(1) } }
      : row.id === "delivery" ? { ...row, definition: { steps: ["pipeline:check", "plan", "implement", "accept", "doc-auditor#3"], gates: [] }, saved: { version: 2, createdAt: new Date(1) }, runnable: { nodes: ["doc-auditor", "doc-auditor#2", "plan", "implement", "accept", "doc-auditor#3"], gates: ["before-doc-auditor"], format: "slots-v1" } } : row)));
    await page.waitForTimeout(60); await add("Add doc-auditor here"); await button("Save").click();
    assert.deepEqual((await writes())[0].input.definition.steps, ["pipeline:check", "plan", "implement", "accept", "doc-auditor#3", "doc-auditor#4"]);
    await finish("success");
  });
  await run("forty-character names stay inside the mobile page", async () => {
    await mount("list"); await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map(row => ({ ...row, name: "W".repeat(40) }))));
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1440, height: 1050 });
  });
  await mount("list"); await page.screenshot({ path: join(artifacts, "pipeline-list.png"), fullPage: true });
  await button("Delivery").click(); await page.screenshot({ path: join(artifacts, "pipeline-composition.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: join(artifacts, "pipeline-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  writeFileSync(join(artifacts, "results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ passed: results.length, cases: results, artifacts }));
} catch (error) {
  writeFileSync(join(artifacts, "results.json"), JSON.stringify({ results, errors, failure: String(error) }, null, 2));
  console.error(JSON.stringify({ passed: results, errors, artifacts })); throw error;
} finally { await browser?.close(); app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
