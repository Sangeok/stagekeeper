// Fresh-build browser acceptance on an isolated TEST_DATABASE_URL. Stop with /finish.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { build } from "esbuild";
import { validateTestDatabase } from "./test-server-integration.mjs";

async function main(): Promise<void> {
  if (process.argv.includes("--ui-only")) { await uiOnly(); return; }
  config({ quiet: true });
  const url = validateTestDatabase(process.env); const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const { connections, fixture, cleanup } = await import("../tests/server/integration/support");
  const { ensureRun } = await import("../src/server/pipeline/run");
  const pool = connections(1); const db = pool.all[0];
  let owner: Awaited<ReturnType<typeof fixture>> | undefined; let next: ChildProcess | undefined;
  let faultChunk: { path: string; original: string } | undefined;
  const loaderMarker = join(tmpdir(), `stagekeeper-src-loader-${randomBytes(8).toString("hex")}`);
  const secret = randomBytes(32).toString("hex"); const upstream = "http://127.0.0.1:55451";
  const browserOrigin = "http://127.0.0.1:55452";
  let actionMode = "normal"; const actions: string[] = []; let results: unknown[] = [];
  let releaseAction = () => {};
  let finish!: () => void; const done = new Promise<void>(resolve => { finish = resolve; });
  const browserBundle = await build({ entryPoints: ["tests/server/fixtures/src-clean-code-browser.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "fixture-links", setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "fixture-link", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'import React from "react"; export default function Link({children,href,...props}) { return React.createElement("a",{...props,href},children) }', resolveDir: process.cwd() }));
    } }],
  });
  const proxy = createServer(async (req, res) => {
    try {
      const path = req.url ?? "/";
      if (path === "/finish") { res.end("finished"); finish(); return; }
      if (path === "/results") {
        if (req.method === "POST") { const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); results = JSON.parse(Buffer.concat(chunks).toString()); console.table(results); }
        res.setHeader("content-type", "application/json"); res.end(JSON.stringify(results)); return;
      }
      if (path === "/fixture.js") { res.setHeader("content-type", "text/javascript"); res.end(browserBundle.outputFiles[0].contents); return; }
      if (path.startsWith("/fixture?")) { res.setHeader("content-type", "text/html"); res.end('<div id="root"></div><script>window.process={env:{}}</script><script src="/fixture.js"></script>'); return; }
      if (path.startsWith("/arm/")) { actionMode = path.slice(5); res.end("armed"); return; }
      if (path.startsWith("/server-fail/")) {
        assert.ok(faultChunk, "start with --render-faults to enable the generated-build fault seam");
        await db.boardItem.update({ where: { id: owner!.boardItemId }, data: { reason: path.endsWith("true") ? "__src_server_failure__" : "test" } });
        res.end("updated"); return;
      }
      if (path.startsWith("/wrapper-fail/")) {
        assert.ok(faultChunk);
        await db.boardItem.update({ where: { id: owner!.boardItemId }, data: { reason: path.endsWith("true") ? "__src_wrapper_failure__" : "test" } });
        res.end("updated"); return;
      }
      if (path.startsWith("/loader-fail/")) {
        assert.ok(faultChunk);
        if (path.endsWith("true")) writeFileSync(loaderMarker, ""); else if (existsSync(loaderMarker)) unlinkSync(loaderMarker);
        res.end("updated"); return;
      }
      if (path.startsWith("/readonly/")) {
        await db.project.update({ where: { id: owner!.projectId }, data: { available: !path.endsWith("true") } });
        res.end("updated"); return;
      }
      if (path === "/release") { releaseAction(); res.end("released"); return; }
      if (path === "/state") {
        res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ actions,
          items: await db.boardItem.findMany({ where: { projectId: owner!.projectId }, select: { status: true, updatedAt: true, backlogItem: { select: { key: true } }, events: { select: { to: true, note: true } } } }),
        })); return;
      }
      if (path === "/owner") {
        const cookieName = "authjs.session-token";
        const token = await encode({ token: { uid: owner!.userId, name: "fixture" }, secret, salt: cookieName, maxAge: 3600 });
        res.setHeader("set-cookie", `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax`);
        res.writeHead(302, { location: `/p/${owner!.id}/inbox` }); res.end(); return;
      }
      const buffers: Buffer[] = []; for await (const chunk of req) buffers.push(Buffer.from(chunk));
      const body = Buffer.concat(buffers); const isAction = !!req.headers["next-action"];
      const mode = isAction ? actionMode : "normal";
      if (isAction) { actions.push(body.toString()); if (mode === "pause") actionMode = "normal"; }
      if (mode === "before") { req.socket.destroy(); return; }
      if (mode === "pause") await new Promise<void>(resolve => { releaseAction = resolve; });
      const headers = new Headers(); for (const [name, value] of Object.entries(req.headers)) if (value !== undefined && name !== "connection") headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      headers.set("x-forwarded-host", new URL(browserOrigin).host);
      const response = await fetch(`${upstream}${path}`, { method: req.method, headers, redirect: "manual", ...(body.length ? { body } : {}) });
      const content = Buffer.from(await response.arrayBuffer());
      if (mode === "after") { req.socket.destroy(); return; }
      res.statusCode = response.status;
      response.headers.forEach((value, name) => { if (!["transfer-encoding", "content-encoding", "content-length"].includes(name)) res.setHeader(name, value); });
      res.end(content);
    } catch { res.writeHead(500); res.end("local acceptance proxy failed"); }
  });
  const interrupt = () => finish(); process.once("SIGINT", interrupt);
  try {
    if (process.argv.includes("--render-faults")) {
      // Instrument only an existing generated build, then restore its exact bytes.
      // The real RSC content function stays a JSX child of the actual boundary.
      const files: string[] = [];
      const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else if (entry.name.endsWith(".js")) files.push(path);
      } };
      walk(".next/server/chunks");
      const candidates = files.map(path => ({ path, original: readFileSync(path, "utf8") }))
        .filter(file => file.original.includes("Evidence and result") && file.original.includes("InboxCard"));
      assert.equal(candidates.length, 1); faultChunk = candidates[0];
      const pattern = /(function \w+\(\{item:(\w+),now:\w+,transition:\w+,approve:\w+,discard:\w+,canWrite:\w+,readOnlyLabel:[^}]+\}\)\{)/;
      assert.ok(pattern.test(faultChunk.original), "locate the actual Inbox server content function");
      const wrapper = /("InboxCard",0,function\((\w+)\)\{)/;
      const loader = /(async function \w+\(\w+\)\{)(?=let\[\w+,\w+\]=await Promise\.all\(\[\(0,\w+\.loadProjectRepository\))/;
      assert.ok(wrapper.test(faultChunk.original)); assert.ok(loader.test(faultChunk.original));
      const instrumented = faultChunk.original
        .replace(pattern, '$1if($2.reason==="__src_server_failure__")throw Error("local server-content failure");')
        .replace(wrapper, '$1if($2.item.reason==="__src_wrapper_failure__")throw Error("local wrapper failure");')
        .replace(loader, `$1if(require("node:fs").existsSync(${JSON.stringify(loaderMarker)}))throw Error("local loader failure");`);
      writeFileSync(faultChunk.path, instrumented);
    }
    owner = await fixture(db, { plan: "pro", status: "proposed" });
    await db.backlogItem.update({ where: { id: owner.backlogItemId }, data: { key: "A-1", title: "Acceptance card A" } });
    await ensureRun(db, owner.projectId, owner.boardItemId, "proposed", false);
    for (const [key, status] of [["B-1", "proposed"], ["C-1", "on_hold"], ["D-1", "in_review"]]) {
      const backlog = await db.backlogItem.create({ data: { projectId: owner.projectId, key, title: `Acceptance card ${key}`, area: "web", source: "fixture" } });
      const board = await db.boardItem.create({ data: { projectId: owner.projectId, backlogItemId: backlog.id, agent: "dev", status, reason: "fixture evidence" } });
      if (status === "on_hold") await db.transitionEvent.create({ data: { boardItemId: board.id, actor: "human", from: "planning", to: "on_hold" } });
      await ensureRun(db, owner.projectId, board.id, status, false);
      if (status === "in_review") {
        await db.boardItem.update({ where: { id: board.id }, data: { planPath: "docs/fixture-plan.md", planCommit: "abcdef123456" } });
        await db.pipelineRun.update({ where: { boardItemId: board.id }, data: { node: "before-implement" } });
      }
    }
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "55451"], {
      env: { ...process.env, DATABASE_URL: url, AUTH_SECRET: secret, AUTH_URL: browserOrigin, AUTH_TRUST_HOST: "true" }, stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
    });
    next.stderr?.on("data", chunk => console.error(String(chunk).replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL]")));
    let started = false;
    for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(`${upstream}/login`)).status === 200) { started = true; break; } } catch { /* Wait for local server. */ } await delay(100); }
    assert.ok(started, "fresh production Next server must start");
    await new Promise<void>(resolve => proxy.listen(55452, "127.0.0.1", resolve));
    console.log(`Browser acceptance ready: ${browserOrigin}/owner and ${browserOrigin}/fixture?mode=form`);
    await done;
  } finally {
    process.removeListener("SIGINT", interrupt);
    releaseAction(); proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve()));
    if (next && next.exitCode === null) { const stopped = new Promise<void>(resolve => next!.once("exit", () => resolve())); next.kill(); await stopped; }
    if (faultChunk) writeFileSync(faultChunk.path, faultChunk.original);
    if (existsSync(loaderMarker)) unlinkSync(loaderMarker);
    await cleanup(db, owner?.userId); await pool.disconnect();
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  }
}
async function uiOnly(): Promise<void> {
  const bundle = await build({ entryPoints: ["tests/server/fixtures/src-clean-code-browser.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "fixture-links", setup(builder) {
      builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "fixture-link", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'import React from "react"; export default function Link({children,href,...props}) { return React.createElement("a",{...props,href},children) }', resolveDir: process.cwd() }));
    } }],
  });
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  let results: unknown[] = [];
  const server = createServer(async (req, res) => {
    try {
      const path = req.url ?? "/";
      if (path === "/finish") { res.end("finished"); finish(); return; }
      if (path === "/results") {
        if (req.method === "POST") { const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); results = JSON.parse(Buffer.concat(chunks).toString()); console.table(results); }
        res.setHeader("content-type", "application/json"); res.end(JSON.stringify(results)); return;
      }
      if (path === "/fixture.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle.outputFiles[0].contents); return; }
      res.setHeader("content-type", "text/html"); res.end('<div id="root"></div><script>window.process={env:{}}</script><script src="/fixture.js"></script>');
    } catch (error) { res.writeHead(500); res.end("fixture request failed"); console.error(error instanceof Error ? error.message : "unknown error"); finish(); }
  });
  const interrupt = () => finish(); process.once("SIGINT", interrupt);
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(55452, "127.0.0.1", resolve); });
    console.log("UI acceptance ready: http://127.0.0.1:55452/fixture?mode=copy (Run acceptance, then Finish)");
    await done;
  } finally { process.removeListener("SIGINT", interrupt); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
void main().catch(error => {
  console.error("Local clean-code acceptance failed", error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL]") : "unknown error");
  process.exitCode = 1;
});
