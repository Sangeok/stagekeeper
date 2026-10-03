// Real Next action + lost response and browser lifetime fixtures, only on a validated test DB.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { build } from "esbuild";
import { validateTestDatabase } from "./test-server-integration.mjs";
import { parseHarnessConfig } from "../packages/core/config.mjs";
import { deliverable } from "../packages/core/deliver.mjs";
import { renderTemplate } from "../packages/core/render.mjs";
import { runbookIsStale, runbookVersion } from "../packages/core/runbook.mjs";
import { newToken } from "../packages/core/token.mjs";
import { buildReportTable, buildVars, templateDescription } from "../packages/core/vars.mjs";

const browserFixture = String.raw`
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Toaster} from 'sonner';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {AcceptanceFailure} from './src/fsd/features/review-gate/ui/acceptance-failure';
const initial={id:'A',checks:[3,5],note:'Missing push',path:null,href:null,at:'2026-10-03 01:02'};
const waiting=[];
function Fixture(){
 const [failure,setFailure]=useState(initial),[item,setItem]=useState('K-1'),[epoch,setEpoch]=useState(0);
 const [requests,setRequests]=useState(0),[refreshes,setRefreshes]=useState(0),[at,setAt]=useState('2026-10-03T01:02:00Z');
 const router={refresh:()=>setRefreshes(n=>n+1)};
 const action=async()=>{setRequests(n=>n+1);return new Promise((resolve,reject)=>waiting.push({resolve,reject}));};
 return <AppRouterContext.Provider value={router}>
  <h1>Acceptance response lifetime fixture</h1>
  <p id="counts">Requests: {requests} · Refreshes: {refreshes}</p>
  <button onClick={()=>setFailure({...initial,id:'B',note:'New failure B'})}>Replace with B</button>
  <button onClick={()=>setFailure(null)}>Clear record</button>
  <button onClick={()=>{setItem('K-2');setFailure(null)}}>Navigate away</button>
  <button onClick={()=>setAt('2026-10-03T01:03:00Z')}>Change update token</button>
  <button onClick={()=>waiting.shift()?.resolve({success:true,data:undefined})}>Resolve success</button>
  <button onClick={()=>waiting.shift()?.resolve({success:false,error:'The board changed. Refresh and try again.'})}>Resolve refusal</button>
  <button onClick={()=>waiting.shift()?.reject(new Error('lost response'))}>Reject response</button>
  <button onClick={()=>{setEpoch(n=>n+1);setFailure(initial);setItem('K-1');setRequests(0);setRefreshes(0)}}>Reset fixture</button>
  <AcceptanceFailure key={JSON.stringify([epoch,item])} itemKey={item} failure={failure} canWrite updatedAt={at} retryAcceptance={action}/>
  <Toaster/>
 </AppRouterContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;

async function main(): Promise<void> {
  config({ quiet: true });
  const database = validateTestDatabase(process.env);
  const parentDatabase = process.env.DATABASE_URL;
  process.env.DATABASE_URL = database;
  const { connections, fixture, cleanup } = await import("../tests/server/integration/support");
  const { createBoardService } = await import("../src/server/pipeline/board");
  const pool = connections(1); const [db] = pool.all;
  const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
  const templateLanguage = `acceptance-${randomBytes(8).toString("hex")}`;
  const secret = randomBytes(32).toString("hex");
  const origin = "http://127.0.0.1:55464", browserOrigin = "http://127.0.0.1:55465";
  const cookieName = "authjs.session-token";
  let next: ChildProcess | undefined, proxy: Server | undefined, loseNext = false, corruptResponse = false;
  let finish!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const onStop = () => finish();
  process.once("SIGINT", onStop); process.once("SIGTERM", onStop);
  try {
    const f = await fixture(db, { status: "done", plan: "pro", planPath: "docs/plan.md", validation: "pass" }); fixtures.push(f);
    const foreign = await fixture(db); fixtures.push(foreign);
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, format: "slots-v1", nodes: ["plan", "implement", "accept"], gates: [], createdBy: f.userId } });
    await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "accept", entryId: "entry" } });
    await db.backlogItem.update({ where: { id: f.backlogItemId }, data: { removedAt: new Date(), removedReason: "done" } });
    const board = createBoardService(db);
    const failed = () => board.failAcceptance(f.projectId, { key: f.key, checks: [3, 5], note: "Verify command could not run" }, "fixture");
    const current = () => db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    const state = async () => ({ row: await current(), failures: await db.acceptanceFailure.findMany({ where: { boardItemId: f.boardItemId }, orderBy: { at: "asc" } }), events: await db.transitionEvent.findMany({ where: { boardItemId: f.boardItemId }, orderBy: { at: "asc" } }) });
    const session = async (userId: string) => `${cookieName}=${await encode({ token: { uid: userId, name: "fixture" }, secret, salt: cookieName, maxAge: 3600 })}`;
    const ownerCookie = await session(f.userId), foreignCookie = await session(foreign.userId);
    const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { filename?: string; exportedName?: string }> };
    const action = Object.entries(manifest.node).find(([, e]) => e.filename === "src/fsd/features/review-gate/api/review-gate.server.ts" && e.exportedName === "retryAcceptance")?.[0];
    assert.ok(action, "Fresh acceptance-failure build required");
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "55464"], { env: { ...process.env, DATABASE_URL: database, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true" }, stdio: "ignore", windowsHide: true });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (next.exitCode !== null) throw new Error("Local Next exited before startup");
      try { if ((await fetch(`${origin}/login`, { redirect: "manual" })).status === 200) { ready = true; break; } } catch { /* Listener starting. */ }
      await delay(100);
    }
    assert.ok(ready);
    const itemPath = `/p/${f.id}/items/${f.key}`;
    const get = async () => {
      const res = await fetch(origin + itemPath, { headers: { cookie: ownerCookie } }); assert.equal(res.status, 200); return res.text();
    };
    const post = async (expected: string, cookie?: string, base = origin) => {
      const res = await fetch(base + itemPath, { method: "POST", redirect: "manual", headers: { origin: base, "next-action": action, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", ...(cookie ? { cookie } : {}) }, body: JSON.stringify([f.id, { key: f.key, expectedUpdatedAt: expected }]) });
      return { status: res.status, text: await res.text() };
    };
    assert.ok((await failed()).ok);
    const before = await state(); const expected = before.row.updatedAt.toISOString();
    const html = await get(); assert.match(html, /Acceptance failed/); assert.match(html, /Run acceptance again/); assert.match(html, /failed acceptance/);
    for (const input of ["bad-date", f.updatedAt.toISOString()]) { const res = await post(input, ownerCookie); assert.match(res.text, /The board changed/); assert.deepEqual(await state(), before); }
    const forbidden = await post(expected, foreignCookie); assert.ok(forbidden.status === 404 || forbidden.text.includes("NEXT_HTTP_ERROR_FALLBACK;404")); assert.deepEqual(await state(), before);
    const guest = await post(expected); assert.ok([303, 307].includes(guest.status) || guest.text.includes("/login")); assert.deepEqual(await state(), before);
    await db.project.update({ where: { id: f.projectId }, data: { available: false } });
    assert.match((await post(expected, ownerCookie)).text, /not selected for use/); assert.deepEqual(await state(), before);
    const readonly = await get(); assert.match(readonly, /Acceptance failed/); assert.ok(!readonly.includes('>Run acceptance again<'));
    await db.project.update({ where: { id: f.projectId }, data: { available: true } });
    const success = await post(expected, ownerCookie); assert.equal(success.status, 200); assert.match(success.text, /"success":true/);
    assert.equal((await current()).status, "done"); assert.equal((await current()).acceptedAt, null);
    assert.ok((await state()).failures[0].clearedAt); assert.match(await get(), /is waiting for acceptance/);
    assert.ok((await failed()).ok);
    const bundle = await build({ stdin: { contents: browserFixture, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
    proxy = createServer(async (req, res) => {
      try {
        const path = req.url ?? "/";
        if (path === "/finish") { res.end("finished"); finish(); return; }
        if (path === "/arm-loss") { loseNext = true; corruptResponse = true; res.end("One committed action response will be unreadable"); return; }
        if (path === "/new-failure") { assert.ok((await failed()).ok); res.end("New fixture failure recorded"); return; }
        if (path === "/facts") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(await state())); return; }
        if (path === "/item") { res.writeHead(302, { location: itemPath }).end(); return; }
        if (path === "/fixture.js") { res.setHeader("content-type", "text/javascript"); res.end(bundle.outputFiles[0].contents); return; }
        if (path === "/fixture") { res.setHeader("content-type", "text/html"); res.end('<div id="root"></div><script>window.process={env:{}}</script><script src="/fixture.js"></script>'); return; }
        const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const headers = new Headers(); for (const [name, value] of Object.entries(req.headers)) if (value && !["host", "connection", "content-length", "accept-encoding"].includes(name)) headers.set(name, Array.isArray(value) ? value.join(",") : value);
        headers.set("origin", origin); headers.set("host", new URL(origin).host); headers.set("cookie", ownerCookie);
        const isAction = req.method === "POST" && Boolean(req.headers["next-action"]);
        const response = await fetch(origin + path, { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks), redirect: "manual" });
        const body = Buffer.from(await response.arrayBuffer());
        if (loseNext && isAction) {
          loseNext = false;
          // Browsers can replay a POST after a closed connection. Exercise both that safe
          // server refusal (the automatic HTTP test) and a response the action cannot decode.
          if (corruptResponse) { corruptResponse = false; res.writeHead(502, { "content-type": "text/plain" }).end("Committed fixture response unavailable"); }
          else res.destroy();
          return;
        }
        res.statusCode = response.status; response.headers.forEach((value, name) => { if (!["content-encoding", "content-length", "transfer-encoding"].includes(name)) res.setHeader(name, value); }); res.end(body);
      } catch { if (!res.destroyed) res.writeHead(502).end("Fixture proxy failed"); }
    });
    await new Promise<void>(resolve => proxy!.listen(55465, "127.0.0.1", resolve));
    const lostBefore = await state(); loseNext = true;
    await assert.rejects(post(lostBefore.row.updatedAt.toISOString(), ownerCookie, browserOrigin), /fetch failed/);
    const afterLoss = await state(); assert.equal(afterLoss.events.length, lostBefore.events.length + 1); assert.ok(afterLoss.failures.at(-1)?.clearedAt);
    const fresh = await get(); assert.ok(!fresh.includes('>Run acceptance again<')); assert.match(fresh, /is waiting for acceptance/);
    assert.equal((await post(lostBefore.row.updatedAt.toISOString(), ownerCookie)).text.includes('"success":true'), false);
    assert.deepEqual(await state(), afterLoss);
    console.log("Real Next acceptance HTTP checks passed: valid owner control, invalid/stale, foreign/guest, read-only, committed response loss, fresh GET and no duplicate retry.");
    if (process.argv.includes("--templates")) {
      const rows: { lang: string; path: string; body: string }[] = [];
      const readTemplates = (directory: string, prefix = "") => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = prefix + entry.name;
          if (entry.isDirectory()) readTemplates(join(directory, entry.name), path + "/");
          else if (entry.name.endsWith(".md")) rows.push({ lang: templateLanguage, path, body: readFileSync(join(directory, entry.name), "utf8").replace(/\r\n/g, "\n") });
        }
      };
      readTemplates("plugin/templates/en");
      assert.equal(rows.length, 10);
      await db.template.createMany({ data: rows });
      await db.project.update({ where: { id: f.projectId }, data: { language: templateLanguage } });
      const token = newToken();
      await db.projectToken.create({ data: { projectId: f.projectId, hash: token.hash, label: "isolated acceptance rehearsal" } });
      const response = await fetch(`${origin}/api/templates?lang=${templateLanguage}`, { headers: { authorization: `Bearer ${token.plain}` } });
      assert.equal(response.status, 200);
      const body = await response.json() as { templates: Record<string, string>; entitlement: { plan: string; agents: string[] } };
      assert.deepEqual(body, deliverable(rows, "pro"));
      const raw = body.templates["CLAUDE.runbook.md"], version = runbookVersion(raw);
      const generatedRoot = mkdtempSync(join(tmpdir(), "stagekeeper-acceptance-generated-"));
      const rawConfig = { version: 1, project: { owner: f.id, repo: f.id, branch: "main", name: f.id, slug: f.id }, language: templateLanguage, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] };
      writeFileSync(join(generatedRoot, "harness.json"), JSON.stringify(rawConfig));
      const { HARNESS_TEMPLATES_DIR: localTemplates, ...childEnv } = process.env;
      void localTemplates;
      const init = spawn(process.execPath, ["plugin/bin/harness-init.mjs", "--root", generatedRoot, "--server", origin], { env: { ...childEnv, HARNESS_TOKEN: token.plain }, stdio: "ignore", windowsHide: true });
      const code = await new Promise<number | null>((resolve, reject) => { init.once("error", reject); init.once("exit", resolve); });
      assert.equal(code, 0, "Fixture init must fetch the real HTTP body");
      const cfg = parseHarnessConfig(rawConfig);
      const vars = { ...buildVars(cfg), report_table: buildReportTable(body.entitlement.agents.map(agent => ({ name: agent, description: templateDescription(body.templates[`agents/${agent}.md`], `agents/${agent}.md`) }))), runbook_version: version };
      const generated = readFileSync(join(generatedRoot, "CLAUDE.md"), "utf8");
      const start = "<!-- harness:runbook:start -->", end = "<!-- harness:runbook:end -->";
      assert.equal(generated.slice(generated.indexOf(start), generated.indexOf(end) + end.length), `${start}\n${renderTemplate(raw, vars)}\n${end}`);
      assert.equal(readFileSync(join(generatedRoot, "docs/agents/README.md"), "utf8"), renderTemplate(body.templates["docs/agents/README.md"], vars));
      assert.match(generated, /acceptance_fail\(\{ project, key, checks, note \}\)/);
      assert.match(generated, /wait.*acceptance/);
      assert.equal((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).runbookVersion, version);
      const versions = rows.filter(row => row.path === "CLAUDE.runbook.md").map(row => row.body);
      assert.equal(runbookIsStale(version, versions), false);
      assert.equal(runbookIsStale("old-template", versions), true);
      console.log("Private LF source → test Template → authenticated HTTP body → actual init marker/rendered reports/hash and stale checks passed. Generated fixture files remain in Temp.");
    }
    if (process.argv.includes("--browser") || process.argv.includes("--interactive")) {
      assert.ok((await failed()).ok);
      console.log("Browser fixtures: http://127.0.0.1:55465/fixture (lifetime), /item (actual Next), /arm-loss, /finish. Loopback only.");
      await finished;
    }
  } finally {
    if (proxy) await new Promise<void>(resolve => proxy!.close(() => resolve()));
    if (next && next.exitCode === null) { const stopped = new Promise<void>(resolve => next!.once("exit", () => resolve())); next.kill(); await stopped; }
    for (const f of fixtures) await cleanup(db, f.userId);
    await db.template.deleteMany({ where: { lang: templateLanguage } });
    await pool.disconnect();
    process.env.DATABASE_URL = parentDatabase;
    process.removeListener("SIGINT", onStop); process.removeListener("SIGTERM", onStop);
  }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Acceptance rehearsal failed"); process.exitCode = 1; });
