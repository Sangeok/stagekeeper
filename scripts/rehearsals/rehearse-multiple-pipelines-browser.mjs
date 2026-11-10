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
  page.setDefaultTimeout(10_000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin); await page.getByRole("heading", { name: "All pipelines", exact: true }).waitFor();
  const button = label => page.getByRole("button", { name: label, exact: true });
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const mount = async (mode, editable = true) => {
    const instance = await page.evaluate(({ mode, editable }) => window.fixture.mount(mode, editable), { mode, editable });
    await page.waitForFunction(instance => window.fixture.ready === instance, instance);
  };
  const finish = async outcome => { await page.evaluate(outcome => window.fixture.finish(outcome), outcome); await frame(); };
  const writes = () => page.evaluate(() => window.fixture.writes);
  const add = async name => { await button("Add at end").click(); await button(name).click(); };
  const run = async (name, work) => { await work(); results.push(name); };
  const savedText = () => page.locator("details").filter({ has: page.getByText("Read as text", { exact: true }) });
  const textNodes = () => savedText().locator("ol li").allTextContents();
  const rail = () => page.locator(".overflow-x-auto").first();

  await run("unsaved node and gate edits leave the saved text and version unchanged", async () => {
    await mount("list"); await button("Delivery").click();
    await page.getByText("Read as text", { exact: true }).click();
    const saved = await textNodes();
    await add("Add Doc audit here");
    await button("Insert before Plan").click(); await button("Add gate").click();
    assert.deepEqual(await textNodes(), saved);
    assert.match(await page.getByRole("region", { name: "Pipeline editor" }).innerText(), /Version 1/);
    await page.getByLabel("Show expanded").check();
    assert.match(await rail().innerText(), /Doc audit/); assert.match(await rail().innerText(), /before Plan/);
    assert.deepEqual(await textNodes(), saved); assert.equal((await writes()).length, 0);
  });
  await run("a newer saved graph updates text while retaining a stale draft and its original CAS", async () => {
    await mount("list"); await button("Delivery").click(); await add("Add Doc audit here");
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map(row => row.id === "delivery"
      ? { ...row, definition: { steps: ["plan", "implement", "accept", "feature-scout"], gates: ["before-accept"] }, saved: { version: 2, createdAt: new Date(1) } } : row)));
    await button("Discard changes and reload").waitFor();
    assert.match(await rail().innerText(), /Doc audit/);
    assert.deepEqual(await textNodes(), ["1. Plan", "2. Implement", "3. before Accept — you", "4. Accept", "5. Discover work"]);
    assert.match(await page.getByRole("region", { name: "Pipeline editor" }).innerText(), /Version 2/);
    assert.equal(await button("Save").isDisabled(), true); assert.equal((await writes()).length, 0);
  });
  await run("dependency-only updates expand saved and draft graphs separately", async () => {
    await mount("list"); await button("Delivery").click(); await add("Add Doc audit here");
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map(row => row.id === "check"
      ? { ...row, definition: { steps: ["impl-verify"], gates: ["before-impl-verify"] }, saved: { version: 2, createdAt: new Date(1) } } : row)));
    await page.getByRole("alert").waitFor();
    assert.deepEqual(await textNodes(), ["1. Plan", "2. Implement", "3. before Implementation check — you", "4. Implementation check", "5. Accept"]);
    await page.getByLabel("Show expanded").check();
    assert.match(await rail().innerText(), /Implementation check/); assert.match(await rail().innerText(), /Doc audit/);
    assert.equal((await writes()).length, 0);
  });
  await run("clean snapshots and post-save refreshes advance both descriptions", async () => {
    await mount("list"); await button("Delivery").click(); await add("Add Doc audit here"); await button("Save").click();
    const submitted = (await writes())[0].input; assert.equal(submitted.expectedVersion, 1);
    await finish("success"); assert.ok(!(await textNodes()).some(node => node.includes("Doc audit")));
    await page.evaluate(definition => window.fixture.update(window.fixture.initial.map(row => row.id === "delivery"
      ? { ...row, definition, saved: { version: 2, createdAt: new Date(1) } } : row)), submitted.definition);
    await frame();
    assert.ok((await textNodes()).some(node => node.includes("Doc audit")));
    assert.match(await page.getByRole("region", { name: "Pipeline editor" }).innerText(), /Version 2/);
    await add("Add Doc audit here"); await button("Save").click();
    assert.equal((await writes())[1].input.expectedVersion, 2); await finish("error");
  });
  for (const outcome of ["error", "stale", "unknown"]) await run(`save ${outcome} preserves saved text and the edited rail`, async () => {
    await mount("list"); await button("Delivery").click(); const saved = await textNodes();
    await add("Add Doc audit here"); await button("Save").click();
    assert.deepEqual(await textNodes(), saved); await finish(outcome);
    assert.deepEqual(await textNodes(), saved); assert.match(await rail().innerText(), /Doc audit/);
    assert.equal(await button("Save").isDisabled(), outcome !== "error"); assert.equal((await writes()).length, 1);
  });
  await run("new pipeline text stays empty until its created snapshot arrives", async () => {
    await mount("list"); await button("New pipeline").click(); await page.getByLabel("New pipeline name").fill("Review");
    await button("Add first step").click(); await button("Add QA").click(); assert.deepEqual(await textNodes(), []);
    await button("Save").click(); assert.equal((await writes())[0].input.expectedVersion, 0); await finish("success");
    assert.equal(await page.getByText("Loading saved pipeline…", { exact: true }).count(), 1);
    await page.evaluate(() => window.fixture.update([...window.fixture.initial, { id: "created", name: "Review", isDefault: false,
      definition: { steps: ["qa"], gates: [] }, saved: { version: 1, createdAt: new Date(1) }, runnable: null }]));
    await frame(); assert.deepEqual(await textNodes(), ["1. QA"]);
    assert.match(await page.getByRole("region", { name: "Pipeline editor" }).innerText(), /Version 1/);
  });
  for (const dirty of [false, true]) await run(`version-zero default text follows server props with dirty=${dirty}`, async () => {
    await mount("unsaved-default"); if (dirty) await add("Add Doc audit here");
    await page.evaluate(() => {
      window.fixture.update(window.fixture.initial.map(row => row.id === "default" ? { ...row, saved: null } : row));
      window.fixture.plan("free"); window.fixture.access(false);
    });
    await button("Save").waitFor({ state: "hidden" });
    assert.deepEqual(await textNodes(), ["1. before Plan — you", "2. Plan", "3. Implement", "4. Accept"]);
    assert.equal((await rail().innerText()).includes("Verify"), dirty);
    assert.equal((await rail().innerText()).includes("Doc audit"), dirty);
    assert.match(await page.getByRole("region", { name: "Pipeline editor" }).innerText(), /Initial configuration · changes apply to future runs/);
    assert.equal((await writes()).length, 0);
  });
  await run("saved fragments render text without requiring a runnable graph", async () => {
    await mount("list"); await button("Check").click();
    assert.deepEqual(await textNodes(), ["1. before QA — you", "2. QA"]);
  });
  for (const [label, steps, reason] of [["missing", ["pipeline:missing"], /archived or missing/], ["loop", ["pipeline:delivery"], /loop/], ["duplicate", ["implement"], /appears twice/]]) {
    await run(`invalid saved ${label} composition shows its expansion error`, async () => {
      await mount("list"); await button("Delivery").click();
      await page.evaluate(steps => window.fixture.update(window.fixture.initial.map(row => row.id === "check"
        ? { ...row, definition: { steps, gates: [] }, saved: { version: 2, createdAt: new Date(1) } } : row)), steps);
      await page.getByText("Read as text", { exact: true }).click(); assert.match(await savedText().locator("p").innerText(), reason);
      assert.deepEqual(await textNodes(), []); assert.equal((await writes()).length, 0);
    });
  }

  await run("Free routing values remain visible without editing or legacy automation controls", async () => {
    await mount("list", false);
    assert.equal(await button("New pipeline").count(), 0);
    await button("Run rules").click();
    assert.equal(await page.getByLabel("Default selection", { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("fix pipeline rule", { exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("Default selection", { exact: true }).inputValue(), "default");
    assert.equal(await page.getByRole("switch").count(), 0);
    assert.equal(await button("Add type override").count(), 0);
    assert.equal((await writes()).length, 0);
  });
  await run("empty drafts add first steps and trailing references; fragment saves need no no-gate confirmation and open the created pipeline", async () => {
    await mount("list"); await button("New pipeline").click(); await page.getByLabel("New pipeline name").fill("Review");
    assert.equal(await button("Save").isDisabled(), true); await button("Add first step").click(); await button("Add QA").click();
    await button("Save").click(); assert.equal((await writes()).length, 1);
    assert.deepEqual((await writes())[0].input.definition, { steps: ["qa"], gates: [] });
    assert.equal(await button("New pipeline").isDisabled(), true); assert.equal(await button("Switch pipeline").isDisabled(), true);
    await finish("success");
    await page.evaluate(() => window.fixture.update([...window.fixture.initial, { id: "created", name: "Review", isDefault: false, definition: { steps: ["qa"], gates: [] }, saved: { version: 1, createdAt: new Date(0) }, runnable: null }]));
    await page.getByRole("heading", { name: "Review", exact: true }).waitFor(); assert.equal(new URL(page.url()).searchParams.get("pipeline"), "created");
    await button("New pipeline").click(); await button("Add first step").click(); await button("Add Plan").click();
    await add("Add Implement"); await add("Insert pipeline: Check"); await add("Add Accept");
    assert.equal(await page.getByRole("group", { name: "Check", exact: true }).getByRole("button", { name: "Open pipeline", exact: true }).count(), 1);
  });
  await run("dirty switching prompts, archive returns to the catalog, and unknown settings do not duplicate", async () => {
    await mount("list"); await button("Delivery").click(); await add("Add Doc audit here");
    await button("Switch pipeline").click();
    page.once("dialog", dialog => dialog.dismiss()); await button("Default").click();
    assert.equal(new URL(page.url()).searchParams.get("pipeline"), "delivery");
    page.once("dialog", dialog => dialog.accept()); await button("Default").click();
    await page.getByRole("heading", { name: "Default", exact: true }).waitFor();
    await button("Switch pipeline").click(); await button("Delivery").click();
    await page.getByLabel("More actions for Delivery", { exact: true }).click(); await button("Archive").click();
    assert.equal(await button("Switch pipeline").isDisabled(), true); await finish("success");
    await page.evaluate(() => window.fixture.update(window.fixture.initial.filter(row => row.id !== "delivery")));
    await page.getByRole("heading", { name: "All pipelines", exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.has("pipeline"), false);
    await button("Run rules").click();
    await page.getByLabel("Remove fix override", { exact: true }).click();
    assert.equal(await button("Close").isDisabled(), true); await finish("unknown");
    assert.match(await page.getByRole("dialog").getByRole("alert").innerText(), /setting may have changed/);
    assert.equal((await writes()).length, 2);
    await button("Close").click(); assert.equal(await button("New pipeline").isDisabled(), true);
  });
  for (const outcome of ["stale", "unknown"]) await run(`rail ${outcome} retains draft and requires explicit reload`, async () => {
    await mount("rail"); await add("Add Doc audit here"); await button("Save").click();
    assert.equal((await writes()).length, 1); await finish(outcome);
    assert.match(await page.getByRole("alert").innerText(), outcome === "stale" ? /pipeline changed/ : /confirm whether the pipeline was saved/);
    assert.equal(await button("Save").isDisabled(), true); assert.equal(await button("Discard changes and reload").count(), 1);
    assert.ok((await page.locator("body").innerText()).includes("Doc audit"));
  });
  await run("plan and read-only changes preserve the draft and its original save version", async () => {
    await mount("list"); await button("Delivery").click(); await add("Add Doc audit here");
    await page.evaluate(() => { window.fixture.plan("max"); window.fixture.access(false); });
    await button("Save").waitFor({ state: "hidden" }); await button("Discard changes").waitFor();
    assert.ok((await page.locator("body").innerText()).includes("Doc audit"));
    await page.evaluate(() => window.fixture.access(true)); await button("Save").click();
    assert.equal((await writes())[0].input.expectedVersion, 1);
    assert.ok((await writes())[0].input.definition.steps.includes("doc-auditor"));
    await finish("success");
  });
  await run("a newer own snapshot remains recoverable after access becomes read-only", async () => {
    await mount("rail"); await add("Add Doc audit here");
    await page.evaluate(() => { window.fixture.update(window.fixture.initial.map(row => row.id === "delivery" ? { ...row, saved: { version: 2, createdAt: new Date(1) } } : row)); window.fixture.access(false); });
    await button("Discard changes and reload").waitFor(); assert.equal(await button("Save").count(), 0);
    assert.match(await page.getByRole("alert").first().innerText(), /pipeline changed/);
    assert.ok((await page.locator("body").innerText()).includes("Doc audit"));
    assert.equal((await writes()).length, 0);
  });
  await run("a pending save adopts a newer received snapshot without regressing its version", async () => {
    await mount("rail"); await add("Add Doc audit here"); await button("Save").click();
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map(row => row.id === "delivery" ? { ...row, definition: { steps: ["plan", "implement", "pipeline:check", "accept", "feature-scout"], gates: [] }, saved: { version: 3, createdAt: new Date(2) } } : row)));
    await finish("success"); await add("Add Doc audit here"); await button("Save").click();
    assert.equal((await writes())[1].input.expectedVersion, 3);
    assert.ok((await writes())[1].input.definition.steps.includes("feature-scout"));
    await finish("success");
  });
  await run("dependency-only snapshots retain dirty drafts, refresh preview and invalidate prior no-gate confirmation", async () => {
    await mount("rail"); await add("Add Doc audit here");
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
    await page.evaluate(() => window.fixture.identity("ITEM-02")); await frame();
    assert.equal(await page.getByLabel("Change pipeline", { exact: true }).inputValue(), ""); assert.equal(await page.getByRole("alert").count(), 0);
  });
  await run("unmounted responses cannot refresh another identity", async () => {
    await mount("change"); await page.getByLabel("Change pipeline", { exact: true }).selectOption("delivery"); await button("Change pipeline").click();
    await page.evaluate(() => window.fixture.identity("ITEM-02")); await frame(); await finish("success");
    assert.equal(await page.evaluate(() => window.fixture.refreshes), 0);
  });
  await run("propose captures one request and updates routing only after pending settles", async () => {
    await mount("propose"); await button("Put on the board").click(); await page.getByLabel("Pipeline", { exact: true }).selectOption("delivery");
    await button("Put on the board").click(); await page.evaluate(() => window.fixture.preset("delivery"));
    assert.equal((await writes()).length, 1); assert.equal((await writes())[0].input.pipelineId, "delivery");
    await finish("error"); await page.evaluate(() => window.fixture.preset("default")); await frame();
    assert.equal(await page.getByLabel("Pipeline", { exact: true }).inputValue(), "default");
  });
  await run("new slots reserve ids inside referenced definitions without modifying them", async () => {
    await mount("rail");
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map(row => row.id === "check"
      ? { ...row, definition: { steps: ["doc-auditor", "doc-auditor#2"], gates: ["before-doc-auditor"] }, saved: { version: 2, createdAt: new Date(1) } }
      : row.id === "delivery" ? { ...row, definition: { steps: ["pipeline:check", "plan", "implement", "accept", "doc-auditor#3"], gates: [] }, saved: { version: 2, createdAt: new Date(1) }, runnable: { nodes: ["doc-auditor", "doc-auditor#2", "plan", "implement", "accept", "doc-auditor#3"], gates: ["before-doc-auditor"], format: "slots-v1" } } : row)));
    await frame(); await add("Add Doc audit here"); await button("Save").click();
    assert.deepEqual((await writes())[0].input.definition.steps, ["pipeline:check", "plan", "implement", "accept", "doc-auditor#3", "doc-auditor#4"]);
    await finish("success");
  });
  await run("forty-character names stay inside the mobile page", async () => {
    await mount("list"); await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.fixture.update(window.fixture.initial.map((row, index) => ({ ...row, name: "W".repeat(39) + index }))));
    await frame();
    const bounds = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll("p")].filter(element => element.getBoundingClientRect().right > innerWidth)
        .map(element => ({ text: element.textContent, right: element.getBoundingClientRect().right })) }));
    if (bounds.width > bounds.viewport) {
      writeFileSync(join(artifacts, "mobile-overflow.json"), JSON.stringify(bounds, null, 2));
      await page.screenshot({ path: join(artifacts, "pipeline-mobile-overflow.png"), fullPage: true });
    }
    assert.equal(bounds.width <= bounds.viewport, true);
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
