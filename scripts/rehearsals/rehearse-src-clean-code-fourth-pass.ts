import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { defaultGraph, PIPELINE_EDIT_PLAN_GATE, SLOT_FORMAT } from "../../packages/core/pipeline/pipeline.mjs";
import { validateTestDatabase } from "../test-server-integration.mjs";

type Support = typeof import("../../tests/server/integration/support");
type Pool = ReturnType<Support["connections"]>;
type Fixture = Awaited<ReturnType<Support["fixture"]>>;
type Reply = { status: number; body: string; redirect: string | null };
type Loss = { mode: "before" | "after"; forwarded: number; completed: number; successful: boolean; failed: boolean };

const origin = "http://127.0.0.1:55449";
const lossOrigin = "http://127.0.0.1:55450";
const requestTimeoutMs = 20_000;
const startupTimeoutMs = 10_000;
const shutdownTimeoutMs = 5_000;
const actionSources = {
  savePipeline: { filename: "src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts", tab: "pipeline" },
  updateBacklogItem: { filename: "src/fsd/features/edit-backlog/api/edit-backlog.server.ts", tab: "backlog" },
  removeBacklogItem: { filename: "src/fsd/features/edit-backlog/api/edit-backlog.server.ts", tab: "backlog" },
} as const;
type Action = keyof typeof actionSources;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
let currentCase = "preflight";

function readActionIds(): Map<Action, string> {
  assert.ok(readFileSync(".next/BUILD_ID", "utf8").trim(), "Fresh production build required");
  const manifest: unknown = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  assert.ok(isRecord(manifest) && isRecord(manifest.node), "Node action registry required");
  return new Map((Object.keys(actionSources) as Action[]).map(name => {
    const matches = Object.entries(manifest.node as Record<string, unknown>).filter(([, entry]) =>
      isRecord(entry) && entry.exportedName === name && typeof entry.filename === "string"
      && entry.filename.replaceAll("\\", "/").endsWith(actionSources[name].filename));
    assert.equal(matches.length, 1, "Unique action registration: " + name);
    const [id, entry] = matches[0];
    assert.ok(isRecord(entry) && isRecord(entry.workers) && Object.keys(entry.workers).length > 0, "Action workers required");
    for (const worker of Object.values(entry.workers)) {
      assert.ok(isRecord(worker) && (typeof worker.moduleId === "string" || typeof worker.moduleId === "number") && typeof worker.async === "boolean", "Invalid action worker");
    }
    return [name, id];
  }));
}

async function within<T>(work: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(label + " timed out")), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function listen(server: Server, port: number): Promise<void> {
  await within(new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => { server.off("listening", ready); reject(error); };
    const ready = () => { server.off("error", failed); resolve(); };
    server.once("error", failed);
    server.once("listening", ready);
    server.listen(port, "127.0.0.1");
  }), startupTimeoutMs, "Listener startup");
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  if (!server.listening) return;
  await within(new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }), shutdownTimeoutMs, "Listener shutdown");
}

async function ensurePortsAvailable(): Promise<void> {
  for (const port of [55449, 55450]) {
    const reservation = createServer();
    try { await listen(reservation, port); }
    finally { await closeServer(reservation); }
  }
}

async function waitForExit(child: ChildProcess): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise(resolve => {
    const exited = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.off("exit", exited); resolve(false); }, shutdownTimeoutMs);
    child.once("exit", exited);
  });
}

async function stopNext(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child)) return;
  child.kill("SIGKILL");
  assert.ok(await waitForExit(child), "Owned Next child did not stop");
}

function assertResult(reply: Reply, status: "saved" | "success" | "stale"): void {
  assert.equal(reply.status, 200, "Action HTTP status");
  assert.equal(reply.redirect, null, "Unexpected action redirect");
  assert.ok(reply.body.includes('"status":"' + status + '"'), "Expected action result: " + status);
}

function assertRejected(reply: Reply, reason: string): void {
  assert.equal(reply.status, 200, "Rejected action HTTP status");
  assert.equal(reply.redirect, null, "Unexpected rejection redirect");
  assert.ok(reply.body.includes('"status":"error"') && reply.body.includes(reason), "Expected rejection reason");
}

function assertAccessDenied(reply: Reply, identity: "foreign" | "anonymous"): void {
  if (identity === "foreign") {
    assert.ok(reply.status < 500 && (reply.status === 404 || reply.body.includes("NEXT_HTTP_ERROR_FALLBACK;404")), "Foreign action must be denied");
    return;
  }
  assert.ok([200, 303, 307].includes(reply.status) && reply.redirect, "Anonymous action must redirect");
  const target = new URL(reply.redirect.split(";")[0], origin);
  assert.equal(target.origin, origin, "Login redirect origin");
  assert.equal(target.pathname, "/login", "Login redirect destination");
}

async function main(): Promise<void> {
  const previousDatabase = process.env.DATABASE_URL;
  const users = new Set<string>();
  const requests = new AbortController();
  const proxyWork = new Set<Promise<void>>();
  let pool: Pool | undefined;
  let next: ChildProcess | undefined;
  let proxy: Server | undefined;
  let executionError: unknown;
  const cleanupFailures: string[] = [];

  try {
    config({ quiet: true });
    const url = validateTestDatabase(process.env);
    const actions = readActionIds();
    await ensurePortsAvailable();
    const require = createRequire(import.meta.url);
    const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node") as {
      encodeReply: (args: unknown[]) => Promise<string | FormData>;
    };
    process.env.DATABASE_URL = url;
    const support = await import("../../tests/server/integration/support");
    pool = support.connections(1);
    const db = pool.all[0];
    const makeFixture = async () => {
      const result = await db.$transaction(tx => support.fixture(tx as Parameters<Support["fixture"]>[0], { plan: "pro" }));
      users.add(result.userId);
      return result;
    };

    currentCase = "transactional fixtures";
    const owner = await makeFixture();
    const foreign = await makeFixture();
    const fixtures = [owner, foreign];
    for (const fixture of fixtures) {
      await db.pipeline.create({ data: {
        id: "sentinel_" + fixture.projectId, projectId: fixture.projectId, name: "Independent fragment", createdBy: fixture.userId,
        definitions: { create: { version: 1, steps: ["doc-auditor"], gates: [], createdBy: fixture.userId } },
      } });
    }
    const snapshot = async (fixture: Fixture) => ({
      pipeline: await support.pipelineState(db, fixture.projectId),
      project: await db.project.findUniqueOrThrow({ where: { id: fixture.projectId } }),
      backlog: await db.backlogItem.findMany({ where: { projectId: fixture.projectId }, orderBy: { id: "asc" } }),
      reports: await db.report.findMany({ where: { boardItem: { projectId: fixture.projectId } }, orderBy: { id: "asc" } }),
    });
    const snapshotAll = () => Promise.all(fixtures.map(snapshot));
    const unchanged = async (work: () => Promise<void>) => {
      const before = await snapshotAll();
      await work();
      assert.deepEqual(await snapshotAll(), before, "Rejected request changed fixture state");
    };

    const secret = randomBytes(32).toString("hex");
    const cookieName = "authjs.session-token";
    const session = async (userId: string) => cookieName + "=" + await encode({
      token: { uid: userId, name: "backlog pipeline fixture" }, secret, salt: cookieName, maxAge: 3600,
    });
    const ownerCookie = await session(owner.userId);
    const foreignCookie = await session(foreign.userId);
    const fetchReply = async (url: string, options: RequestInit = {}): Promise<Reply> => {
      const response = await fetch(url, {
        ...options, redirect: "manual",
        signal: AbortSignal.any([requests.signal, AbortSignal.timeout(requestTimeoutMs)]),
      });
      return { status: response.status, body: await response.text(), redirect: response.headers.get("x-action-redirect") ?? response.headers.get("location") };
    };
    const post = async (input: { action: Action; args: unknown[]; cookie?: string; target?: string }): Promise<Reply> => {
      const body = await encodeReply([owner.id, ...input.args]);
      return fetchReply((input.target ?? origin) + "/p/" + owner.id + "/" + actionSources[input.action].tab, {
        method: "POST", headers: {
          origin, "next-action": actions.get(input.action)!, accept: "text/x-component",
          cookie: input.cookie ?? ownerCookie,
          ...(typeof body === "string" ? { "content-type": "text/plain;charset=UTF-8" } : {}),
        }, body,
      });
    };

    currentCase = "Next startup";
    let spawnFailed = false;
    let childReady = false;
    let startupOutput = "";
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "55449"], {
      env: { ...process.env, NODE_ENV: "production", DATABASE_URL: url, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true" },
      windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
    });
    next.once("error", () => { spawnFailed = true; });
    next.stdout?.on("data", (chunk: Buffer) => {
      startupOutput = (startupOutput + chunk.toString()).slice(-512);
      if (startupOutput.includes("Ready in")) childReady = true;
    });
    const startupDeadline = Date.now() + startupTimeoutMs;
    while (!childReady && Date.now() < startupDeadline) {
      assert.ok(!spawnFailed && next.exitCode === null && next.signalCode === null, "Owned Next startup failed");
      await delay(100);
    }
    assert.ok(childReady && next.exitCode === null, "Owned Next startup timed out");
    assert.equal((await fetchReply(origin + "/login")).status, 200, "Next login readiness");

    let loss: Loss = { mode: "before", forwarded: 0, completed: 0, successful: false, failed: false };
    proxy = createServer((request, response) => {
      const observation = loss;
      const forward = async () => {
        try {
          if (observation.mode === "before") { request.socket.destroy(); return; }
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          const headers = new Headers();
          for (const [name, value] of Object.entries(request.headers)) {
            if (value && !["host", "connection", "transfer-encoding", "content-length", "x-forwarded-host"].includes(name)) {
              headers.set(name, Array.isArray(value) ? value.join(",") : value);
            }
          }
          headers.set("host", new URL(origin).host);
          headers.set("origin", origin);
          observation.forwarded++;
          const upstream = await fetchReply(origin + request.url, { method: request.method, headers, body: Buffer.concat(chunks) });
          observation.completed++;
          observation.successful = upstream.status === 200 && upstream.body.includes('"status":"success"');
          request.socket.destroy();
        } catch {
          observation.failed = true;
          response.destroy();
        }
      };
      const task = forward();
      proxyWork.add(task);
      void task.finally(() => proxyWork.delete(task));
    });
    await listen(proxy, 55450);

    currentCase = "backlog malformed and access";
    const backlog = await db.backlogItem.create({ data: {
      projectId: owner.projectId, key: "HTTP-1", title: "Original HTTP backlog", area: "web", source: "fixture",
    } });
    const form = new FormData();
    for (const [key, value] of Object.entries({ title: "Changed HTTP backlog", area: "web", source: "fixture", type: "feature", typeBefore: "feature" })) form.set(key, value);
    const editArgs = (key: unknown) => [key, { status: "idle" }, form];
    for (const key of [undefined, null, "", " \t", {}, []]) {
      await unchanged(async () => {
        assertRejected(await post({ action: "updateBacklogItem", args: editArgs(key) }), "Invalid backlog key");
        assertRejected(await post({ action: "removeBacklogItem", args: [key] }), "Invalid backlog key");
      });
    }
    for (const [identity, cookie] of [["foreign", foreignCookie], ["anonymous", ""]] as const) {
      await unchanged(async () => {
        assertAccessDenied(await post({ action: "updateBacklogItem", args: editArgs(backlog.key), cookie }), identity);
        assertAccessDenied(await post({ action: "removeBacklogItem", args: [backlog.key], cookie }), identity);
      });
    }

    currentCase = "backlog single target and open protection";
    const beforeEdit = await snapshotAll();
    assertResult(await post({ action: "updateBacklogItem", args: editArgs(backlog.key) }), "saved");
    const expectedEdit = structuredClone(beforeEdit);
    expectedEdit[0].backlog = expectedEdit[0].backlog.map(row => row.id === backlog.id ? { ...row, title: "Changed HTTP backlog" } : row);
    assert.deepEqual(await snapshotAll(), expectedEdit, "Backlog edit affected another target");
    await unchanged(async () => {
      assertRejected(await post({ action: "removeBacklogItem", args: [owner.key] }), "open on the board");
    });
    assertResult(await post({ action: "removeBacklogItem", args: [backlog.key] }), "saved");
    const removed = await db.backlogItem.findUniqueOrThrow({ where: { id: backlog.id } });
    assert.ok(removed.removedAt, "Soft removal timestamp");
    const expectedRemoval = structuredClone(expectedEdit);
    expectedRemoval[0].backlog = expectedRemoval[0].backlog.map(row => row.id === backlog.id ? { ...row, removedAt: removed.removedAt, removedReason: "owner" } : row);
    assert.deepEqual(await snapshotAll(), expectedRemoval, "Backlog removal affected another target");

    const pipelineId = "default_" + owner.projectId;
    const graph = defaultGraph("pro");
    const input = { pipelineId, definition: { steps: graph.nodes, gates: graph.gates }, expectedVersion: 0 };
    const definitions = () => db.pipelineDefinition.findMany({ where: { pipelineId }, orderBy: { version: "asc" } });
    const versions = () => db.pipelineVersion.findMany({ where: { projectId: owner.projectId, pipelineId }, orderBy: { version: "asc" } });
    const sentinels = () => db.pipeline.findMany({
      where: { id: { in: fixtures.map(fixture => "sentinel_" + fixture.projectId) } },
      orderBy: { id: "asc" }, include: { definitions: { orderBy: { version: "asc" } }, versions: { orderBy: { version: "asc" } } },
    });
    const preservedSentinels = await sentinels();
    const preservedForeign = await snapshot(foreign);
    const save = (value: unknown, cookie?: string, target?: string) => post({ action: "savePipeline", args: [value], cookie, target });
    const assertSave = (reply: Reply, version: number) => {
      assertResult(reply, "success");
      assert.ok(reply.body.includes(JSON.stringify({ status: "success", pipelineId, version })), "Saved definition identity");
    };

    currentCase = "pipeline independent malformed fields";
    assert.equal((await definitions()).length, 0, "Virtual default has no saved definition");
    assert.equal((await versions()).length, 0, "Virtual default has no executable version");
    const invalidInputs: unknown[] = [
      null, {},
      ...[undefined, 7].map(pipelineId => ({ ...input, pipelineId })),
      ...[undefined, null].map(definition => ({ ...input, definition })),
      ...[undefined, null, "steps", [7]].map(steps => ({ ...input, definition: { ...input.definition, steps } })),
      ...[undefined, null, "gates", [7]].map(gates => ({ ...input, definition: { ...input.definition, gates } })),
      ...[undefined, null, "0", -1, 1.5, 2_147_483_647].map(expectedVersion => ({ ...input, expectedVersion })),
    ];
    for (const invalid of invalidInputs) {
      await unchanged(async () => { assertRejected(await save(invalid), "Invalid pipeline save request."); });
    }
    await unchanged(async () => {
      assertRejected(await save({ ...input, definition: { steps: [], gates: [] } }), "a pipeline needs at least one step");
      assertRejected(await save({ ...input, pipelineId: "absent_" + owner.projectId }), "Pipeline not found.");
    });

    currentCase = "pipeline initial save and executable reuse";
    assertSave(await save(input), 1);
    assert.equal((await definitions()).length, 1);
    const firstVersions = await versions();
    assert.equal(firstVersions.length, 1);
    assert.deepEqual(firstVersions[0].nodes, graph.nodes);
    assert.deepEqual(firstVersions[0].gates, graph.gates);
    assert.equal(firstVersions[0].format, SLOT_FORMAT);
    await unchanged(async () => { assertResult(await save(input), "stale"); });
    assertSave(await save({ ...input, expectedVersion: 1 }), 2);
    assert.equal((await definitions()).length, 2);
    assert.deepEqual(await versions(), firstVersions, "Same graph must reuse executable version");

    currentCase = "pipeline concurrent stale";
    const contenders = [
      { ...input, expectedVersion: 2 },
      { ...input, definition: { ...input.definition, gates: [] }, expectedVersion: 2 },
    ];
    const replies = await Promise.all(contenders.map(value => save(value)));
    for (const reply of replies) assert.equal(reply.status, 200);
    const winner = replies.findIndex(reply => reply.body.includes('"status":"success"'));
    assert.ok(winner >= 0);
    assert.equal(replies.filter(reply => reply.body.includes('"status":"success"')).length, 1);
    assertSave(replies[winner], 3);
    assertResult(replies[1 - winner], "stale");
    const committedDefinitions = await definitions();
    assert.equal(committedDefinitions.length, 3);
    const winningDefinition = contenders[winner].definition;
    assert.deepEqual(committedDefinitions[2].steps, winningDefinition.steps);
    assert.deepEqual(committedDefinitions[2].gates, winningDefinition.gates);
    const committedVersions = await versions();
    assert.equal(committedVersions.length, winner === 0 ? 1 : 2);
    assert.deepEqual(committedVersions.at(-1)!.nodes, winningDefinition.steps);
    assert.deepEqual(committedVersions.at(-1)!.gates, winningDefinition.gates);
    assert.deepEqual(committedVersions.slice(0, 1), firstVersions);

    currentCase = "pipeline response loss before commit";
    const lossInput = { ...input, definition: winningDefinition, expectedVersion: 3 };
    loss = { mode: "before", forwarded: 0, completed: 0, successful: false, failed: false };
    await unchanged(async () => { await assert.rejects(save(lossInput, ownerCookie, lossOrigin)); });
    assert.deepEqual(loss, { mode: "before", forwarded: 0, completed: 0, successful: false, failed: false });

    currentCase = "pipeline response loss after commit";
    loss = { mode: "after", forwarded: 0, completed: 0, successful: false, failed: false };
    await assert.rejects(save(lossInput, ownerCookie, lossOrigin));
    assert.deepEqual(loss, { mode: "after", forwarded: 1, completed: 1, successful: true, failed: false });
    const afterLoss = await definitions();
    assert.equal(afterLoss.length, 4);
    assert.deepEqual(afterLoss.slice(0, 3), committedDefinitions);
    assert.deepEqual(afterLoss[3].steps, winningDefinition.steps);
    assert.deepEqual(afterLoss[3].gates, winningDefinition.gates);
    assert.deepEqual(await versions(), committedVersions, "Lost response cannot duplicate executable versions");

    currentCase = "pipeline access and plan guards";
    const valid = { ...lossInput, expectedVersion: 4 };
    for (const [identity, cookie] of [["foreign", foreignCookie], ["anonymous", ""]] as const) {
      await unchanged(async () => { assertAccessDenied(await save(valid, cookie), identity); });
    }
    for (const [data, reason] of [
      [{ available: false, disconnectedAt: null }, "not selected for use"],
      [{ available: false, disconnectedAt: new Date() }, "disconnected"],
    ] as const) {
      await db.project.update({ where: { id: owner.projectId }, data });
      await unchanged(async () => {
        assertRejected(await save(valid), reason);
        assertRejected(await post({ action: "updateBacklogItem", args: editArgs(owner.key) }), reason);
      });
    }
    await db.project.update({ where: { id: owner.projectId }, data: { available: true, disconnectedAt: null } });
    await db.subscription.update({ where: { userId: owner.userId }, data: { plan: "free" } });
    await unchanged(async () => { assertRejected(await save(valid), PIPELINE_EDIT_PLAN_GATE); });
    await db.subscription.update({ where: { userId: owner.userId }, data: { plan: "pro" } });
    assert.deepEqual(await sentinels(), preservedSentinels, "Independent pipelines changed");
    assert.deepEqual(await snapshot(foreign), preservedForeign, "Foreign project changed");

    currentCase = "read-only page bodies and report links";
    await db.transitionEvent.create({ data: { boardItemId: owner.boardItemId, actor: "human", from: "planning", to: "in_review", note: "HTTP history evidence" } });
    await db.report.create({ data: { boardItemId: owner.boardItemId, actor: "dev", path: "docs/fixture-report.md", commit: "abcdef123456" } });
    const get = async (path: string) => {
      const before = await snapshotAll();
      const reply = await fetchReply(origin + path, { headers: { cookie: ownerCookie } });
      assert.equal(reply.status, 200, "Page HTTP status");
      assert.deepEqual(await snapshotAll(), before, "GET changed fixture state");
      return reply.body.replace(/<!--[\s\S]*?-->/g, "");
    };
    const board = await get("/p/" + owner.id);
    assert.ok(board.includes("Activity") && board.includes(owner.key) && board.includes('href="/p/' + owner.id + "/items/" + owner.key + '"'));
    const history = await get("/p/" + owner.id + "/history?item=" + encodeURIComponent(owner.key));
    const events = await get("/p/" + owner.id + "/history?mode=events&view=all");
    const project = await db.project.findUniqueOrThrow({ where: { id: owner.projectId } });
    const reportHref = "https://github.com/" + encodeURIComponent(project.repoOwner) + "/" + encodeURIComponent(project.repo) + "/blob/abcdef123456/docs/fixture-report.md";
    for (const body of [history, events]) {
      assert.ok(body.includes(owner.key) && body.includes("HTTP history evidence"));
      assert.ok(body.includes('href="' + reportHref + '"'), "History must render the complete report href");
    }
    const pipeline = await get("/p/" + owner.id + "/pipeline");
    assert.ok(pipeline.includes("Pipeline") && pipeline.includes("Automatic scouting") && pipeline.includes("Default"));
    assert.ok(pipeline.includes("Plan") && pipeline.includes("Implement") && pipeline.includes("Accept"), "Saved pipeline body");
    currentCase = "completed";
  } catch (error) {
    executionError = error;
  } finally {
    requests.abort();
    const clean = async (label: string, work: () => Promise<unknown>) => {
      try { await within(Promise.resolve().then(work), shutdownTimeoutMs * 3, label); }
      catch { cleanupFailures.push(label); }
    };
    try {
      if (proxy) await clean("proxy", () => closeServer(proxy!));
      await clean("proxy requests", () => Promise.allSettled([...proxyWork]));
      if (next) await clean("Next child", () => stopNext(next!));
      if (pool) {
        for (const userId of users) {
          await clean("fixture " + userId, async () => {
            await pool!.all[0].user.delete({ where: { id: userId } });
            users.delete(userId);
          });
        }
        await clean("database connections", () => pool!.disconnect());
      }
    } finally {
      if (previousDatabase === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabase;
    }
  }

  if (executionError !== undefined || cleanupFailures.length > 0) {
    console.error(JSON.stringify({
      case: currentCase,
      failure: executionError instanceof Error ? executionError.name : executionError === undefined ? null : "unknown",
      location: executionError instanceof Error ? executionError.stack?.match(/rehearse-src-clean-code-fourth-pass\.ts:\d+:\d+/)?.[0] : undefined,
      cleanupFailures,
      remainingFixtureUserIds: [...users],
      environmentRestored: process.env.DATABASE_URL === previousDatabase,
    }));
    throw new Error("Backlog/pipeline HTTP acceptance failed");
  }
  console.log("Backlog/pipeline HTTP acceptance passed: malformed and access guards, single-target writes, definition/executable versions, concurrent stale, both response-loss boundaries, four read-only pages, report links and owned-resource cleanup.");
}

void main().catch(() => {
  process.exitCode = 1;
  setTimeout(() => process.exit(1), shutdownTimeoutMs).unref();
});
