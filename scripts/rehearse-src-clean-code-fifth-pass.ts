// Actual Next acceptance uses only a validated, disposable TEST_DATABASE_URL.
import assert from "node:assert/strict";
import { fork, spawn, type ChildProcess, type ForkOptions } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, relative, dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { SLOT_FORMAT } from "../packages/core/pipeline.mjs";
import { validateTestDatabase } from "./test-server-integration.mjs";
import { manifestEntries } from "../tests/server/fixtures/action-manifest";
import type { Fixture } from "../tests/server/integration/support";

const require = createRequire(import.meta.url);
const script = fileURLToPath(import.meta.url);
const timeout = 20_000;
const reportPath = "docs/test-reports/active/2026-10-04-src-clean-code-fifth-pass.md";
type Result = { case: string; expected: string; observed: string; status: "Pass" | "Fail" | "Not run" };
type Decoder = { encodeReply: (args: unknown[]) => Promise<string | FormData>; createFromFetch: (response: Promise<Response>, options: object) => PromiseLike<unknown> };
type Loader = { require: (id: unknown) => unknown; loadChunk: (id: unknown) => unknown };
type Reply = { id: number; ok: boolean; result?: unknown; diagnostics?: object };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const decoder = (): Decoder => require("next/dist/compiled/react-server-dom-webpack/client.node") as Decoder;

async function consume(bytes: Buffer, manifest: object, loader?: Loader): Promise<{ action: unknown; chunkCalls: number; moduleCalls: number }> {
  const globals = globalThis as typeof globalThis & { __next_require__?: Loader["require"]; __webpack_chunk_load__?: Loader["loadChunk"] };
  const beforeRequire = globals.__next_require__, beforeChunk = globals.__webpack_chunk_load__;
  const pending: Promise<unknown>[] = []; const errors: unknown[] = [];
  let chunkCalls = 0, moduleCalls = 0;
  if (loader) {
    globals.__next_require__ = id => {
      moduleCalls++;
      try { return loader.require(id); } catch (error) { errors.push(error); throw error; }
    };
    globals.__webpack_chunk_load__ = id => {
      chunkCalls++;
      let task: Promise<unknown>;
      try { task = Promise.resolve(loader.loadChunk(id)); }
      catch (error) { errors.push(error); throw error; }
      pending.push(task);
      void task.catch(error => { errors.push(error); });
      return task;
    };
  } else { delete globals.__next_require__; delete globals.__webpack_chunk_load__; }
  const visited = new WeakSet<object>();
  const settle = async (value: unknown): Promise<void> => {
    if (value === null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if ("then" in value && typeof value.then === "function") { await settle(await (value as PromiseLike<unknown>)); return; }
    if ("$$typeof" in value && value.$$typeof === Symbol.for("react.lazy")) {
      assert.ok("_init" in value && typeof value._init === "function" && "_payload" in value, "fifth-pass assertion 1");
      let resolved: unknown;
      for (;;) {
        try { resolved = value._init(value._payload); break; }
        catch (error) {
          if (isRecord(error) && typeof error.then === "function") await (error as unknown as PromiseLike<unknown>);
          else throw error;
        }
      }
      await settle(resolved); return;
    }
    for (const child of Object.values(value)) await settle(child);
  };
  try {
    const root = await decoder().createFromFetch(Promise.resolve(new Response(new Uint8Array(bytes))), { serverConsumerManifest: manifest });
    assert.ok(isRecord(root) && "a" in root, "action root required");
    const action = await root.a;
    await settle(root);
    await Promise.allSettled(pending);
    assert.equal(errors.length, 0, "all route loaders must settle successfully");
    return { action, chunkCalls, moduleCalls };
  } finally {
    // No component or decoded Server Function is invoked. The parent kills timed-out workers.
    await Promise.allSettled(pending);
    if (beforeRequire === undefined) delete globals.__next_require__; else globals.__next_require__ = beforeRequire;
    if (beforeChunk === undefined) delete globals.__webpack_chunk_load__; else globals.__webpack_chunk_load__ = beforeChunk;
  }
}

function routeConsumer(route: string): { loader: Loader; manifest: object } {
  assert.equal(process.env.NODE_ENV, "production");
  assert.equal(process.env.DATABASE_URL, validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL }));
  const routes = JSON.parse(readFileSync(".next/server/app-paths-manifest.json", "utf8"));
  assert.ok(isRecord(routes) && typeof routes[route] === "string", "fifth-pass assertion 2");
  const root = resolve(".next/server"), entry = resolve(root, routes[route]);
  assert.ok(!relative(root, entry).startsWith("..") && !relative(root, entry).includes(":"), "fifth-pass assertion 3");
  const bundle: unknown = require(entry);
  assert.ok(isRecord(bundle) && isRecord(bundle.__next_app__), "fifth-pass assertion 4");
  const app = bundle.__next_app__;
  assert.equal(typeof app.require, "function"); assert.equal(typeof app.loadChunk, "function");
  const context = { globalThis: {} as { __RSC_MANIFEST?: Record<string, Record<string, unknown>> } };
  runInNewContext(readFileSync(join(dirname(entry), "page_client-reference-manifest.js"), "utf8"), context);
  const manifest = context.globalThis.__RSC_MANIFEST?.[route];
  assert.ok(manifest && isRecord(manifest.ssrModuleMapping) && Object.keys(manifest.ssrModuleMapping).length > 0, "fifth-pass assertion 5");
  assert.ok("moduleLoading" in manifest, "fifth-pass assertion 6");
  const turbopack = readFileSync(entry, "utf8").includes("[turbopack]_runtime.js");
  return { loader: { require: (app.require as Loader["require"]).bind(app), loadChunk: (app.loadChunk as Loader["loadChunk"]).bind(app) }, manifest: { moduleMap: consumerMapping(manifest.ssrModuleMapping, turbopack), moduleLoading: manifest.moduleLoading, serverModuleMap: null } };
}

function consumerMapping(mapping: Record<string, unknown>, turbopack: boolean): object {
  if (!turbopack) return mapping;
  // Turbopack emits one path per chunk; the installed webpack Node decoder reads
  // alternating chunk ID/filename pairs. Preserve every fresh path and module ID.
  return Object.fromEntries(Object.entries(mapping).map(([id, exports]) => {
    assert.ok(isRecord(exports), "fifth-pass assertion 7");
    return [id, Object.fromEntries(Object.entries(exports).map(([name, reference]) => {
      assert.ok(isRecord(reference) && Array.isArray(reference.chunks) && reference.chunks.every(chunk => typeof chunk === "string"), "fifth-pass assertion 8");
      return [name, { ...reference, chunks: reference.chunks.flatMap(chunk => [chunk, chunk]) }];
    }))];
  }));
}

async function flightWorker(route: string): Promise<void> {
  const { loader, manifest } = routeConsumer(route);
  let busy = false;
  process.on("message", async (message: unknown) => {
    if (!isRecord(message)) return;
    if (message.stop === true) { assert.equal(busy, false); process.disconnect(); return; }
    assert.ok(typeof message.id === "number" && typeof message.bytes === "string" && !busy, "fifth-pass assertion 9");
    busy = true;
    try {
      const result = await consume(Buffer.from(message.bytes, "base64"), manifest, loader);
      process.send?.({ id: message.id, ok: true, result: result.action, diagnostics: { EOF: true, referencesResolved: true, loadersSettled: true, chunkCalls: result.chunkCalls, moduleCalls: result.moduleCalls } } satisfies Reply);
    } catch (error) {
      const category = error instanceof Error && /manifest/i.test(error.message) ? "reference manifest" : error instanceof Error && /Server Function|Server Action/i.test(error.message) ? "server reference" : "decoder/loader";
      const detail = error instanceof Error && /^Module .* was instantiated/.test(error.message) ? error.message.slice(0,700) : undefined;
      process.send?.({ id: message.id, ok: false, diagnostics: { category, exception: error instanceof Error ? error.name : "unknown", detail } } satisfies Reply);
    } finally { busy = false; }
  });
  process.send?.({ ready: true });
}

const probeCases = ["positive", "turbopack-chunks", "missing-loader", "missing-mapping", "chunk-reject", "module-throw", "truncated-reference"];
async function probeWorker(kind: string): Promise<void> {
  assert.ok(probeCases.includes(kind), "fifth-pass assertion 10");
  let componentCalls = 0;
  const loaded = new Set<unknown>();
  const component = () => { componentCalls++; };
  const mapping = kind === "missing-mapping" ? {} : { "fixture-module": { Fixture: { id: "fixture-ssr", chunks: ["fixture-server-chunk", "server.js"], name: "Fixture" } } };
  const before = structuredClone(mapping);
  const loader: Loader = { loadChunk: id => { loaded.add(id); return kind === "chunk-reject" ? Promise.reject(new Error("fixture chunk rejected")) : Promise.resolve(); }, require: () => { if (kind === "module-throw") throw new Error("fixture module rejected"); if (kind === "turbopack-chunks") assert.equal(loaded.size, 2); return { Fixture: component }; } };
  const prefix = kind === "truncated-reference" ? "" : '2:I["fixture-module",["fixture-chunk","fixture.js"],"Fixture"]\n';
  const wire = prefix + '0:{"a":"$@1","f":[["$","$L2",null,{}]],"b":"fixture"}\n1:{"success":true}\n';
  let passed = false, calls: object = {};
  try { const result = await consume(Buffer.from(wire), { moduleMap: consumerMapping(mapping, kind === "turbopack-chunks"), moduleLoading: null, serverModuleMap: null }, kind === "missing-loader" ? undefined : loader); passed = true; calls = { chunks: result.chunkCalls, modules: result.moduleCalls }; }
  catch { /* Each negative fixture must be rejected by the actual installed decoder. */ }
  assert.equal(componentCalls, 0);
  assert.deepEqual(mapping, before);
  assert.equal(passed, kind === "positive" || kind === "turbopack-chunks");
  process.send?.({ probe: kind, passed, componentCalls, calls });
  process.disconnect();
}

async function closeChild(child: ChildProcess, requestStop = true): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error("child cleanup timeout")); }, 5000);
    child.once("exit", code => { clearTimeout(timer); if (code === 0) resolvePromise(); else reject(new Error("child cleanup failed")); });
    child.once("error", () => { clearTimeout(timer); reject(new Error("child cleanup failed")); });
    if (requestStop && child.connected) child.send({ stop: true });
  });
}

function spawnWorker(args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const options: ForkOptions & { windowsHide: boolean } = { env: { ...env, NODE_ENV: "production" }, execArgv: ["--import", "./tests/server/register-server-only.mjs", "--import", "tsx"], windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"], serialization: "advanced" };
  return fork(script, args, options);
}
function messageFrom(child: ChildProcess, predicate: (message: unknown) => boolean): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const finish = () => { clearTimeout(timer); child.removeListener("message", received); child.removeListener("exit", exited); child.removeListener("error", failed); };
    const received = (message: unknown) => { if (predicate(message)) { finish(); resolvePromise(message); } };
    const exited = () => { finish(); reject(new Error("worker exited before result")); };
    const failed = () => { finish(); reject(new Error("worker could not start")); };
    const timer = setTimeout(() => { finish(); child.kill(); reject(new Error("worker result timeout")); }, timeout);
    child.on("message", received); child.once("exit", exited); child.once("error", failed);
  });
}
async function consumerSelfTest(results: Result[]): Promise<void> {
  for (const kind of probeCases) {
    const child = spawnWorker(["--flight-probe-worker", kind], process.env);
    try {
      const message = await messageFrom(child, message => isRecord(message) && message.probe === kind);
      const positive = kind === "positive" || kind === "turbopack-chunks";
      assert.ok(isRecord(message), "fifth-pass assertion 11"); assert.equal(message.passed, positive); assert.equal(message.componentCalls, 0);
      if (positive) { assert.ok(isRecord(message.calls), "fifth-pass assertion 12"); assert.equal(message.calls.chunks, kind === "turbopack-chunks" ? 2 : 1); assert.equal(message.calls.modules, 1); }
      results.push({ case: `Flight ${kind}`, expected: positive ? "real decoder restores action and every chunk/reference without component invocation or mapping mutation" : "real decoder rejects full consumption", observed: "expected decoder outcome; zero component calls", status: "Pass" });
    } finally { await closeChild(child, false); }
  }
}

function report(results: Result[], build: string, cleanup: boolean): void {
  const safe = (text: string) => text.replace(/[|\r\n]/g, " ");
  writeFileSync(reportPath, `---\nstatus: "${results.every(row => row.status === "Pass") && cleanup ? "passed" : "incomplete"}"\ncreated-at: "2026-10-04"\n---\n\n# src clean-code fifth-pass HTTP acceptance\n\nBuild identity: ${safe(build)}. No sessions, credentials, tokens or raw responses are recorded.\n\n| Case | Expected | Observed | Status |\n| --- | --- | --- | --- |\n${results.map(row => `| ${safe(row.case)} | ${safe(row.expected)} | ${safe(row.observed)} | ${row.status} |`).join("\n")}\n\nCleanup: ${cleanup ? "Pass" : "Not completed"}. Browser DOM, repository commands and DB integration are separate required gates and are not inferred from HTTP results.\n`);
}

function productSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.name === "generated") return [];
    return entry.isDirectory() ? productSources(path) : /\.(ts|tsx|mjs|css)$/.test(path) && !/\.test\./.test(path) ? [path] : [];
  });
}

async function main(): Promise<void> {
  const results: Result[] = [];
  try { await consumerSelfTest(results); }
  catch (error) {
    results.push({ case: "Flight consumer preparation", expected: "all positive and negative real-decoder controls plus child cleanup", observed: "consumer preparation failed before DB writes or product workers", status: "Fail" });
    if (!process.argv.includes("--consumer-self-test")) report(results, "Not run", false);
    throw error;
  }
  if (process.argv.includes("--consumer-self-test")) { console.log(JSON.stringify(results)); return; }
  config({ quiet: true });
  let url: string;
  try { url = validateTestDatabase(process.env); }
  catch { results.push({ case: "DB/Next acceptance", expected: "validated separate TEST_DATABASE_URL before writes or product workers", observed: "TEST_DATABASE_URL not prepared; zero DB writes and zero product workers", status: "Not run" }); report(results, "Not run", true); throw new Error("isolated test database required"); }
  const previousDatabase = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  let stopNext: ChildProcess | undefined, worker: ChildProcess | undefined;
  let requestId = 0, cleaned = false, buildIdentity = "Not run";
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  const users: string[] = [];
  let cleanup: (() => Promise<void>) | undefined;
  try {
    const buildPath = ".next/server/server-reference-manifest.json";
    assert.ok(statSync(buildPath).mtimeMs >= Math.max(...productSources("src").map(path => statSync(path).mtimeMs)), "fresh build required after all product edits");
    buildIdentity = `${readFileSync(".next/BUILD_ID", "utf8").trim()} / action manifest sha256 ${createHash("sha256").update(readFileSync(buildPath)).digest("hex")}`;
    const support = await import("../tests/server/integration/support");
    const pool = support.connections(1), db = pool.all[0];
    cleanup = async () => {
      try {
        await db.user.deleteMany({ where: { id: { in: users } } });
        assert.equal(await db.user.count({ where: { id: { in: users } } }), 0);
      } finally { await pool.disconnect(); }
    };
    const service = (await import("../src/server/pipeline/board")).createBoardService(db);
    const origin = "http://127.0.0.1:55455", secret = randomBytes(32).toString("hex"), cookieName = "authjs.session-token";
    const session = async (userId: string) => `${cookieName}=${await encode({ token: { uid: userId, name: "fifth-pass fixture" }, secret, salt: cookieName, maxAge: 3600 })}`;
    const nodeManifest = JSON.parse(readFileSync(buildPath, "utf8")).node as Record<string, { filename?: string; exportedName?: string }>;
    manifestEntries();
    const actionId = (name: string, filename: string) => {
      const matches = Object.entries(nodeManifest).filter(([, entry]) => entry.exportedName === name && entry.filename?.replaceAll("\\", "/").endsWith(filename));
      assert.equal(matches.length, 1, `exact fresh Action registration: ${name}`); return matches[0][0];
    };
    const fixture = async (options: Parameters<typeof support.fixture>[1] = { plan: "pro" }) => {
      const id = randomUUID(), userId = randomUUID();
      // IDs are known before the first write, including partial/unknown fixture commits.
      users.push(userId);
      return db.$transaction(async tx => {
        await tx.user.create({ data: { id: userId, login: `fifth-${id}`, githubId: -1 - randomBytes(4).readUInt32BE() % 2_000_000_000 } });
        if (options?.plan) await tx.subscription.create({ data: { userId, plan: options.plan } });
        const project = await tx.project.create({ data: { slug: id, name: id, repoOwner: "fixture-owner", repo: "fixture-repo", branch: "main", ownerUserId: userId } });
        await tx.workspace.create({ data: { projectId: project.id, wsId: "app", path: ".", agent: options?.agent ?? "dev", verify: ["npm test"], readOnly: [] } });
        const backlog = await tx.backlogItem.create({ data: { projectId: project.id, key: "K-1", title: "Fifth-pass fixture", area: "web", source: "fixture" } });
        const board = await tx.boardItem.create({ data: { projectId: project.id, backlogItemId: backlog.id, agent: options?.agent ?? "dev", status: options?.status ?? "in_review", reason: "fixture evidence", updatedAt: new Date(Date.now() + 60_000), validation: options?.validation ?? null, planPath: options?.planPath ?? null, planCommit: options?.planCommit ?? null } });
        return { id, userId, projectId: project.id, key: backlog.key, backlogItemId: backlog.id, boardItemId: board.id, updatedAt: board.updatedAt };
      });
    };
    const run = async (name: string, expected: string, check: () => Promise<void>) => {
      try { await check(); results.push({ case: name, expected, observed: expected, status: "Pass" }); }
      catch (error) {
        const diagnostic = error instanceof Error && /^fifth-pass assertion \d+$/.test(error.message) ? error.message : error instanceof Error ? error.name : "runtime failure";
        results.push({ case: name, expected, observed: `${diagnostic}; sensitive details omitted`, status: "Fail" });
        throw new Error(`acceptance case failed: ${name}`);
      }
    };
    const request = (path: string, options: RequestInit = {}) => fetch(origin + path, { ...options, redirect: "manual", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]) });
    const snapshot = async (f: Fixture) => JSON.stringify(await Promise.all([
      db.backlogItem.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }), db.boardItem.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }),
      db.transitionEvent.findMany({ where: { boardItem: { projectId: f.projectId } }, orderBy: { id: "asc" } }), db.pipelineRun.findMany({ where: { boardItem: { projectId: f.projectId } }, orderBy: { id: "asc" } }),
      db.agentRun.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }), db.acceptanceFailure.findMany({ where: { boardItem: { projectId: f.projectId } }, orderBy: { id: "asc" } }),
      db.projectToken.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }), db.ownerToken.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }), db.userToken.findMany({ where: { userId: f.userId }, orderBy: { id: "asc" } }),
      db.report.findMany({ where: { boardItem: { projectId: f.projectId } }, orderBy: { id: "asc" } }), db.agentRunStep.findMany({ where: { run: { projectId: f.projectId } }, orderBy: { id: "asc" } }),
    ]));
    let lastDiagnostics: Record<string, unknown> = {};
    const decode = async (route: string, bytes: Buffer) => {
      // A fresh route-scoped worker for each response also prevents a warm
      // decoder chunk cache from masking the normal owner's loader control.
      if (worker) await closeChild(worker);
      worker = spawnWorker(["--flight-worker", route], { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url });
      await messageFrom(worker, message => isRecord(message) && message.ready === true);
      const id = ++requestId;
      const pending = messageFrom(worker!, message => isRecord(message) && message.id === id);
      worker!.send({ id, bytes: bytes.toString("base64") });
      const reply = await pending;
      if (isRecord(reply) && reply.ok !== true) console.error(JSON.stringify(reply.diagnostics));
      assert.ok(isRecord(reply) && reply.ok === true && isRecord(reply.diagnostics), "full Flight consumption required");
      assert.equal(reply.diagnostics.EOF, true);
      assert.equal(reply.diagnostics.referencesResolved, true);
      assert.equal(reply.diagnostics.loadersSettled, true);
      lastDiagnostics = reply.diagnostics;
      return reply.result;
    };
    const post = async (name: string, args: unknown[], cookie: string, path: string, route: string, decodeResult = true) => {
      const filename = name === "proposeItem" ? "src/fsd/features/propose-item/api/propose-item.server.ts" : name === "createProject" ? "src/fsd/features/create-project/api/create-project.server.ts" : "src/fsd/features/review-gate/api/review-gate.server.ts";
      const body = await decoder().encodeReply(args);
      const response = await request(path, { method: "POST", headers: { origin, cookie, "next-action": actionId(name, filename), accept: "text/x-component", ...(typeof body === "string" ? { "content-type": "text/plain;charset=UTF-8" } : {}) }, body });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!decodeResult) return { status: response.status, redirect: response.headers.get("x-action-redirect") ?? response.headers.get("location") };
      assert.equal(response.status, 200); assert.ok(response.headers.get("content-type")?.includes("text/x-component"), "fifth-pass assertion 13");
      const result = await decode(route, bytes);
      if (name !== "createProject" && isRecord(result) && result.success === true) {
        assert.ok(typeof lastDiagnostics.moduleCalls === "number" && lastDiagnostics.moduleCalls > 0, "fifth-pass assertion 14");
        assert.ok(typeof lastDiagnostics.chunkCalls === "number" && lastDiagnostics.chunkCalls > 0, "fifth-pass assertion 15");
        results.push({ case: `${name} Flight loaders`, expected: "EOF, all references and loaders settled with real chunk/module calls in a fresh route worker", observed: `chunks=${lastDiagnostics.chunkCalls}, modules=${lastDiagnostics.moduleCalls}; EOF/references/settlement confirmed`, status: "Pass" });
      }
      return result;
    };
    const get = async (path: string, cookie: string) => { const response = await request(path, { headers: { cookie } }); assert.equal(response.status, 200); return (await response.text()).replace(/<!--[\s\S]*?-->/g, ""); };
    stopNext = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "55455"], { env: { ...process.env, NODE_ENV: "production", DATABASE_URL: url, TEST_DATABASE_URL: url, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true" }, windowsHide: true, stdio: "ignore" });
    let startError = false; stopNext.once("error", () => { startError = true; });
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt++) { assert.ok(!startError && stopNext.exitCode === null && !controller.signal.aborted, "fifth-pass assertion 16"); try { ready = (await request("/login")).status === 200; } catch { /* bounded startup, no writes */ } if (!ready) await delay(100); }
    assert.ok(ready, "Next startup timeout");
    // HTTP cases below use independent fixture users/projects and current timestamps.
    await acceptanceCases({ db, service, fixture, session, post, get, snapshot, run });
  } catch (error) {
    if (!results.some(row => row.status !== "Pass")) results.push({ case: "preparation/runtime", expected: "fresh artifacts, isolated fixtures and real route loaders", observed: error instanceof Error ? error.name : "runtime error", status: "Fail" });
    throw error;
  } finally {
    controller.abort();
    const failures: unknown[] = [];
    try { if (worker) await closeChild(worker); } catch (error) { failures.push(error); }
    try { if (stopNext && stopNext.exitCode === null && stopNext.signalCode === null) { const exited = new Promise<void>(resolvePromise => stopNext!.once("exit", () => resolvePromise())); stopNext.kill(); await Promise.race([exited, delay(5000).then(() => { throw new Error("Next shutdown timeout"); })]); } } catch (error) { failures.push(error); }
    try { if (cleanup) await cleanup(); } catch (error) { failures.push(error); }
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
    process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
    cleaned = failures.length === 0;
    results.push({ case: "cleanup", expected: "own fixture IDs, worker, Next process, pools and parent env settled", observed: cleaned ? "all owned resources closed/restored" : "cleanup failed", status: cleaned ? "Pass" : "Fail" });
    report(results, buildIdentity, cleaned);
    if (!cleaned) throw new Error("acceptance cleanup failed");
  }
}

type AcceptanceContext = {
  db: import("../src/generated/prisma/client").PrismaClient;
  service: ReturnType<typeof import("../src/server/pipeline/board").createBoardService>;
  fixture: (options?: Parameters<typeof import("../tests/server/integration/support").fixture>[1]) => Promise<Fixture>;
  session: (id: string) => Promise<string>;
  post: (name: string, args: unknown[], cookie: string, path: string, route: string, decode?: boolean) => Promise<unknown>;
  get: (path: string, cookie: string) => Promise<string>;
  snapshot: (f: Fixture) => Promise<string>;
  run: (name: string, expected: string, check: () => Promise<void>) => Promise<void>;
};

async function acceptanceCases(context: AcceptanceContext): Promise<void> {
  const { db, service, fixture, session, post, get, snapshot, run } = context;
  const reviewFile = "The board changed. Refresh and try again.", proposeError = "Couldn't put it on the board. Try again.";
  // Flight's JSON reviver removes the undefined data field; the Action seam
  // separately checks the original { success: true, data: undefined } object.
  const success = { success: true }, failure = (error: string) => ({ success: false, error });
  const specs = [
    { name: "retryAcceptance", page: "items/K-1", route: "items/[key]", status: "done" },
    { name: "humanTransition", page: "inbox", route: "inbox", status: "in_review" },
    { name: "approveGate", page: "inbox", route: "inbox", status: "in_review" },
    { name: "discardItem", page: "inbox", route: "inbox", status: "proposed" },
    { name: "proposeItem", page: "backlog", route: "backlog", status: "implementing" },
  ];
  const installRun = async (f: Fixture, node: string, format: string | null = SLOT_FORMAT, nodes = ["plan", "verify", "implement", "accept"], gates = ["before-implement"]) => {
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, format, nodes, gates, createdBy: f.userId } });
    return db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node, entryId: format === SLOT_FORMAT ? randomUUID() : null } });
  };
  const prepare = async (name: string, format: string | null = SLOT_FORMAT) => {
    const spec = specs.find(spec => spec.name === name)!;
    const f = await fixture({ status: spec.status, plan: "pro", validation: "pass", planPath: "docs/plan.md", planCommit: "plan-commit" });
    const node = name === "approveGate" || name === "humanTransition" ? "before-implement" : name === "retryAcceptance" ? "accept" : name === "discardItem" ? "plan" : "implement";
    const pipeline = await installRun(f, node, format);
    if (name === "retryAcceptance") {
      assert.ok((await service.failAcceptance(f.projectId, { key: f.key, checks: [3], note: "fixture failure" }, "fixture-agent")).ok, "fifth-pass assertion 17");
    }
    const row = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    let input: Record<string, unknown> = { key: f.key, expectedUpdatedAt: row.updatedAt.toISOString() };
    if (name === "humanTransition") input = { ...input, to: "on_hold", result: "owner hold" };
    if (name === "approveGate") input = { ...input, gate: "before-implement", ...(format === SLOT_FORMAT ? { gateEntry: { runId: pipeline.id, entryId: pipeline.entryId } } : {}) };
    if (name === "proposeItem") {
      await db.backlogItem.create({ data: { projectId: f.projectId, key: "NEW", title: "New proposal", area: "web", source: "fixture" } });
      input = { key: "NEW", agent: "dev", reason: "owner proposal" };
    }
    return { f, input, path: `/p/${f.id}/${spec.page}`, route: `/(app)/p/[slug]/${spec.route}/page`, cookie: await session(f.userId) };
  };
  const argumentsFor = (name: string, slug: unknown, input: unknown): unknown[] => name === "discardItem" ? [slug, isRecord(input) ? input.key : input, isRecord(input) ? input.expectedUpdatedAt : input] : [slug, input];
  for (const spec of specs) {
    const owner = await prepare(spec.name);
    await run(`${spec.name} owner transport`, "same-origin actual Action succeeds and the full fresh-route Flight response resolves", async () => {
      const result = await post(spec.name, argumentsFor(spec.name, owner.f.id, { ...owner.input, actor: "forged", actorRef: "foreign", userId: "foreign", projectId: "foreign" }), owner.cookie, owner.path, owner.route);
      assert.deepEqual(result, success);
      const events = await db.transitionEvent.findMany({ where: { boardItem: { projectId: owner.f.projectId }, actor: "human" } });
      assert.ok(events.length > 0 && events.every(event => event.actorId === owner.f.userId), "fifth-pass assertion 18");
    });
    await run(`${spec.name} malformed transport`, "exact expected failure object; every fixture row/count unchanged", async () => {
      const before = await snapshot(owner.f);
      const bad: unknown[] = [null, {}, { ...owner.input, key: undefined }, { ...owner.input, key: 0 }, { ...owner.input, key: {} }];
      if ("expectedUpdatedAt" in owner.input) for (const value of [0, null, "invalid"]) bad.push({ ...owner.input, expectedUpdatedAt: value });
      if (spec.name === "approveGate") for (const value of [null, [], { runId: 0, entryId: "entry" }, { runId: "run", entryId: {} }]) bad.push({ ...owner.input, gateEntry: value });
      if (spec.name === "humanTransition") bad.push({ ...owner.input, result: 0 }, { ...owner.input, to: null });
      if (spec.name === "proposeItem") bad.push({ ...owner.input, agent: 0 }, { ...owner.input, agent: null }, { ...owner.input, reason: {} });
      for (const input of bad) {
        assert.deepEqual(await post(spec.name, argumentsFor(spec.name, owner.f.id, input), owner.cookie, owner.path, owner.route), failure(spec.name === "proposeItem" ? proposeError : reviewFile));
        assert.equal(await snapshot(owner.f), before);
      }
      for (const slug of [null, 0, ""]) {
        assert.deepEqual(await post(spec.name, argumentsFor(spec.name, slug, owner.input), owner.cookie, owner.path, owner.route), failure(spec.name === "proposeItem" ? proposeError : reviewFile));
        assert.equal(await snapshot(owner.f), before);
      }
    });
    for (const kind of ["read-only", "foreign", "guest"]) {
      const control = await prepare(spec.name);
      await run(`${spec.name} ${kind} priority`, "auth/access outcome precedes malformed payload with zero fixture mutation", async () => {
        let cookie = control.cookie;
        if (kind === "read-only") await db.project.update({ where: { id: control.f.projectId }, data: { available: false } });
        if (kind === "foreign") cookie = await session((await fixture({ plan: "pro" })).userId);
        if (kind === "guest") cookie = "";
        const before = await snapshot(control.f);
        const result = await post(spec.name, argumentsFor(spec.name, control.f.id, null), cookie, control.path, control.route, kind === "read-only");
        if (kind === "read-only") {
          const access = await (await import("../src/server/project-access-query")).readProjectAccessIn(db, control.f.projectId);
          assert.equal(access.available, false);
          assert.ok("reason" in access, "fifth-pass assertion 19");
          assert.deepEqual(result, failure(access.reason));
          assert.notEqual(access.reason, reviewFile); assert.notEqual(access.reason, proposeError);
        } else { assert.ok(isRecord(result), "fifth-pass assertion 20"); if (kind === "foreign") assert.equal(result.status, 404); else assert.ok(typeof result.redirect === "string" && result.redirect.includes("/login"), "fifth-pass assertion 21"); }
        assert.equal(await snapshot(control.f), before);
      });
    }
    if (spec.name !== "proposeItem") {
      const control = await prepare(spec.name);
      await run(`${spec.name} stale CAS`, "valid transport retains the existing stale failure and all DB state", async () => {
        const before = await snapshot(control.f);
        const input = { ...control.input, expectedUpdatedAt: new Date(new Date(String(control.input.expectedUpdatedAt)).getTime() - 1).toISOString() };
        assert.deepEqual(await post(spec.name, argumentsFor(spec.name, control.f.id, input), control.cookie, control.path, control.route), failure(reviewFile));
        assert.equal(await snapshot(control.f), before);
      });
    }
  }
  for (const [status, to] of [["in_review", "on_hold"], ["on_hold", "planning"], ["on_hold", "implementing"], ["done", "planning"], ["done", "implementing"]]) await run(`transition ${status} to ${to}`, "normal hold/resume/reopen preserves service destination and owner event", async () => {
    const f = await fixture({ status, plan: "pro", validation: "pass", planPath: "docs/plan.md" });
    await installRun(f, status === "done" ? "accept" : status === "in_review" ? "before-implement" : "implement");
    if (status === "on_hold") await db.transitionEvent.create({ data: { boardItemId: f.boardItemId, from: "implementing", to: "on_hold", actor: "human", actorId: f.userId, channel: "web" } });
    const result = await post("humanTransition", [f.id, { key: f.key, to, result: "owner evidence", expectedUpdatedAt: f.updatedAt.toISOString() }], await session(f.userId), `/p/${f.id}/inbox`, "/(app)/p/[slug]/inbox/page");
    assert.deepEqual(result, success); assert.equal((await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).status, to);
  });
  await run("legacy gate", "legacy gate remains approvable without a slot entry", async () => {
    const control = await prepare("approveGate", null);
    assert.deepEqual(await post("approveGate", [control.f.id, control.input], control.cookie, control.path, control.route), success);
  });
  for (const mismatch of ["absent", "different"]) await run(`slots gate entry ${mismatch}`, "shape-valid missing/mismatched entry remains a service refusal with DB unchanged", async () => {
    const control = await prepare("approveGate"); const before = await snapshot(control.f);
    const result = await post("approveGate", [control.f.id, { ...control.input, gateEntry: mismatch === "absent" ? undefined : { runId: "other", entryId: "other" } }], control.cookie, control.path, control.route);
    assert.deepEqual(result, failure("stale gate entry; reread and approve again")); assert.equal(await snapshot(control.f), before);
  });
  const markup = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const hrefs = (html: string) => [...markup(html).matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&").replaceAll("&#x27;", "'")).filter(href => href.startsWith("https://github.com/"));
  await run("Landing body", "headline and demo show the entity's current gate label/hint", async () => {
    const html = markup(await get("/", ""));
    for (const text of ["Your agents build.", "You set the rules.", "Approve implementation", "Approving lets dev change code. Then continue in your coding client."]) assert.ok(html.includes(text), "fifth-pass assertion 22");
  });
  await run("Board slot/hold/age bodies", "bound null-key Working, closed Ready, held-only verifier Idle and proposal age; GET never writes", async () => {
    const f = await fixture({ plan: "pro", status: "done" }), cookie = await session(f.userId);
    const pipeline = await installRun(f, "doc-auditor#2", SLOT_FORMAT, ["plan", "verify", "implement", "accept", "doc-auditor#2"]);
    const agent = await db.agentRun.create({ data: { projectId: f.projectId, agent: "doc-auditor", key: null, stepId: "work", tokenId: "fixture-token", pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId } });
    let before = await snapshot(f); let html = markup(await get(`/p/${f.id}`, cookie));
    assert.ok(html.includes("Working on K-1") && html.includes("working: doc-auditor"), "fifth-pass assertion 23"); assert.equal(await snapshot(f), before);
    await db.agentRun.update({ where: { id: agent.id }, data: { closedAt: new Date() } });
    before = await snapshot(f); html = markup(await get(`/p/${f.id}`, cookie));
    assert.ok(html.includes("Ready for K-1") && html.includes("waiting for doc-auditor"), "fifth-pass assertion 24"); assert.equal(await snapshot(f), before);
    await db.pipelineRun.update({ where: { id: pipeline.id }, data: { node: "verify" } });
    await db.boardItem.update({ where: { id: f.boardItemId }, data: { status: "on_hold" } });
    before = await snapshot(f); html = markup(await get(`/p/${f.id}`, cookie));
    assert.ok(/plan-verifier[\s\S]*?Idle/.test(html), "fifth-pass assertion 25"); assert.ok(!html.includes("Ready for K-1"), "fifth-pass assertion 26"); assert.equal(await snapshot(f), before);
    const now = new Date(), proposed = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2)), reviewed = new Date(now.getTime() - 60_000);
    const backlog = await db.backlogItem.create({ data: { projectId: f.projectId, key: "AGE", title: "Proposal age", area: "web", source: "fixture" } });
    const row = await db.boardItem.create({ data: { projectId: f.projectId, backlogItemId: backlog.id, agent: "dev", status: "in_review", reason: "age", proposedOn: proposed, updatedAt: reviewed } });
    await db.transitionEvent.create({ data: { boardItemId: row.id, from: "planning", to: "in_review", actor: "agent", at: reviewed } });
    before = await snapshot(f); html = markup(await get(`/p/${f.id}`, cookie));
    assert.ok(html.includes("plan submitted") && html.includes("proposed 2 days ago"), "fifth-pass assertion 27"); assert.ok(!html.includes("in review for"), "fifth-pass assertion 28"); assert.equal(await snapshot(f), before);
  });
  await run("token bodies and unchanged usage", "three references, UTC usage, active/ended columns, headings, Free/unavailable rename/revoke and empty copy", async () => {
    const f = await fixture({ plan: "pro" }), cookie = await session(f.userId), at = new Date();
    let before = await snapshot(f);
    const emptyProject = markup(await get(`/p/${f.id}/tokens`, cookie)), emptyUser = markup(await get("/settings/tokens", cookie));
    assert.ok(emptyProject.includes("No tokens yet. Issue one above.") && emptyProject.includes("No owner tokens yet. Issue one above."), "fifth-pass assertion 29");
    assert.ok(emptyUser.includes("No tokens yet. Issue one above."), "fifth-pass assertion 30"); assert.equal(await snapshot(f), before);
    const groups: Record<string, string[]> = { token: [], owner: [], user: [] };
    for (const reference of Object.keys(groups)) for (const kind of ["unknown", "never", "expired", "revoked"]) {
      const data = { label: `${reference}-${kind}`, hash: randomBytes(32).toString("hex"), usageTrackingStartedAt: kind === "unknown" ? null : at, expiresAt: kind === "expired" ? new Date(at.getTime() - 1) : null, revokedAt: kind === "revoked" ? at : null, lastUsedAt: kind === "revoked" ? at : null };
      const token = reference === "token" ? await db.projectToken.create({ data: { ...data, projectId: f.projectId } }) : reference === "owner" ? await db.ownerToken.create({ data: { ...data, projectId: f.projectId, userId: f.userId } }) : await db.userToken.create({ data: { ...data, userId: f.userId } });
      groups[reference].push(token.id);
    }
    before = await snapshot(f);
    const project = markup(await get(`/p/${f.id}/tokens`, cookie)), user = markup(await get("/settings/tokens", cookie));
    assert.equal((project.match(/<th(?:\s|>)/g) ?? []).length, 28); assert.equal((user.match(/<th(?:\s|>)/g) ?? []).length, 14);
    assert.equal((project.match(/<h3 /g) ?? []).length, 4); assert.ok((user.match(/<h2 /g) ?? []).length >= 2, "fifth-pass assertion 31");
    for (const reference of Object.keys(groups)) for (const id of groups[reference]) assert.ok((reference === "user" ? user : project).includes(`${reference}:${id}`), "fifth-pass assertion 32");
    for (const body of [project, user]) for (const text of ["Unknown", "Never used", "Expired", "Revoked", "UTC", "Save name"]) assert.ok(body.includes(text), "fifth-pass assertion 33");
    assert.equal((project.match(/>Revoke</g) ?? []).length, 6); assert.equal((user.match(/>Revoke</g) ?? []).length, 3); assert.equal(await snapshot(f), before);
    await db.subscription.delete({ where: { userId: f.userId } });
    before = await snapshot(f); const free = markup(await get(`/p/${f.id}/tokens`, cookie));
    assert.ok(!free.includes("Issue owner token") && free.includes("Save name"), "fifth-pass assertion 34"); assert.equal((free.match(/>Revoke</g) ?? []).length, 6); assert.equal(await snapshot(f), before);
    await db.project.update({ where: { id: f.projectId }, data: { available: false } });
    before = await snapshot(f); const unavailable = markup(await get(`/p/${f.id}/tokens`, cookie));
    assert.ok(!unavailable.includes("Save name") && !unavailable.includes("Issue token"), "fifth-pass assertion 35"); assert.equal((unavailable.match(/>Revoke</g) ?? []).length, 6); assert.equal(await snapshot(f), before);
  });
  await run("Inbox, Documents, History and Failure record bodies", "all rendered hrefs preserve raw reserved filenames and recorded commits; cards/empty composition retained", async () => {
    const control = await prepare("approveGate"), rawPath = "docs/#?% 한글.md";
    await db.boardItem.update({ where: { id: control.f.boardItemId }, data: { planPath: rawPath, planCommit: "plan-commit" } });
    let before = await snapshot(control.f); const inbox = markup(await get(`/p/${control.f.id}/inbox`, control.cookie));
    assert.ok(inbox.includes("Approve implementation"), "fifth-pass assertion 36");
    const planLinks = hrefs(inbox).filter(href => decodeURIComponent(new URL(href).pathname).endsWith(rawPath)); assert.ok(planLinks.length > 0, "fifth-pass assertion 37");
    for (const href of planLinks) { const url = new URL(href); assert.equal(url.hash, ""); assert.equal(url.search, ""); assert.ok(decodeURIComponent(url.pathname).includes("/blob/plan-commit/"), "fifth-pass assertion 38"); }
    assert.equal(await snapshot(control.f), before);
    const done = await prepare("retryAcceptance");
    await db.boardItem.update({ where: { id: done.f.boardItemId }, data: { planPath: rawPath, planCommit: "plan-commit" } });
    await db.report.create({ data: { boardItemId: done.f.boardItemId, actor: "dev", path: rawPath, commit: "report-commit", isAcceptance: false } });
    await db.acceptanceFailure.updateMany({ where: { boardItemId: done.f.boardItemId, clearedAt: null }, data: { path: rawPath, commit: "fail-commit" } });
    before = await snapshot(done.f); const item = markup(await get(`/p/${done.f.id}/items/${done.f.key}`, done.cookie));
    assert.ok(item.includes("Documents") && item.includes("History") && item.includes("Failure record"), "fifth-pass assertion 39");
    const links = hrefs(item).filter(href => decodeURIComponent(new URL(href).pathname).endsWith(rawPath)); assert.equal(links.length, 4);
    for (const href of links) { const url = new URL(href); assert.equal(url.hash, ""); assert.equal(url.search, ""); assert.equal(decodeURIComponent(url.pathname).split("/blob/")[1].split("/").slice(1).join("/"), rawPath); }
    assert.equal(await snapshot(done.f), before);
    const empty = await fixture({ plan: "pro", status: "done" }); const emptyCookie = await session(empty.userId);
    before = await snapshot(empty); const emptyInbox = markup(await get(`/p/${empty.id}/inbox`, emptyCookie));
    assert.ok(emptyInbox.includes("Inbox") && !emptyInbox.includes("Approve implementation"), "fifth-pass assertion 40"); assert.equal(await snapshot(empty), before);
  });
  await run("Backlog and registration bodies/default name", "actual routes retain controls/default owner/manual recovery and empty name creates the slug fallback", async () => {
    const control = await prepare("proposeItem");
    const before = await snapshot(control.f); const backlog = markup(await get(control.path, control.cookie));
    assert.ok(backlog.includes("Backlog") && backlog.includes("Put on the board"), "fifth-pass assertion 41"); assert.equal(await snapshot(control.f), before);
    const form = markup(await get("/p/new", control.cookie));
    assert.ok(form.includes("New project") && form.includes("Create project"), "fifth-pass assertion 42");
    assert.ok(form.includes("Repository URL") || form.includes("Paste a URL instead"), "fifth-pass assertion 43");
    assert.ok(form.includes(`fifth-${control.f.id}`), "fifth-pass assertion 44");
    const slug = `fifth-${randomBytes(12).toString("hex")}`, data = new FormData();
    for (const [key, value] of Object.entries({ slug, owner: "fixture-owner", repo: `fixture-${randomUUID()}`, branch: "Feature/branch", name: "" })) data.set(key, value);
    const result = await post("createProject", [{ status: "idle" }, data], control.cookie, "/p/new", "/(app)/p/new/page");
    assert.ok(isRecord(result) && result.status === "created", "fifth-pass assertion 45");
    assert.equal((await db.project.findUniqueOrThrow({ where: { slug } })).name, slug);
  });
}

const mode = process.argv[2];
const work = mode === "--flight-worker" ? flightWorker(process.argv[3]) : mode === "--flight-probe-worker" ? probeWorker(process.argv[3]) : main();
void work.catch(error => {
  if (mode === "--flight-probe-worker" && process.connected) process.send?.({ probe: process.argv[3], diagnostic: error instanceof Error ? error.message : "probe failed" });
  if (process.argv.includes("--consumer-self-test")) console.error(error instanceof Error ? error.message : "consumer self-test failed");
  else console.error("Fifth-pass acceptance failed; no credentials or response body logged.");
  process.exitCode = 1; if (process.connected) process.disconnect();
});
