// Reproduce the real Next transport against an isolated database and current build.
// Run after test:server:integration; never use this script against production.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { newToken } from "../packages/core/token.mjs";
import { validateTestDatabase } from "./test-server-integration.mjs";

async function main(): Promise<void> {
  config({ quiet: true });
  const url = validateTestDatabase(process.env);
  const previousDatabase = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const secret = randomBytes(32).toString("hex");
  const port = 55438;
  const origin = `http://127.0.0.1:${port}`;
  const cookieName = "authjs.session-token";
  const { connections, fixture, cleanup } = await import("../tests/server/integration/support");
  const pool = connections(1); const db = pool.all[0];
  let owner: Awaited<ReturnType<typeof fixture>> | undefined;
  let foreign: Awaited<ReturnType<typeof fixture>> | undefined;
  let server: ChildProcess | undefined;
  let bridge: Server | undefined;
  let proxy: Server | undefined;

  async function stop(): Promise<void> {
    if (!server || server.exitCode !== null) return;
    const stopped = new Promise<void>((resolve) => server!.once("exit", () => resolve()));
    server.kill(); await stopped; server = undefined;
  }

  async function start(enabled: boolean): Promise<void> {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      env: { ...process.env, DATABASE_URL: url, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true", PROJECT_CONNECTION_WRITES_ENABLED: String(enabled) },
      stdio: "ignore", windowsHide: true,
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Local Next server exited before startup");
      try { if ((await fetch(`${origin}/login`, { redirect: "manual" })).status === 200) return; } catch { /* Wait for the listener. */ }
      await delay(100);
    }
    throw new Error("Local Next server did not start");
  }

  async function cookie(userId: string): Promise<string> {
    return `${cookieName}=${await encode({ token: { uid: userId, name: "fixture" }, secret, salt: cookieName, maxAge: 3600 })}`;
  }

  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { filename?: string; exportedName?: string }> };
  const entries = Object.entries(manifest.node).filter(([, entry]) => entry.filename === "src/fsd/features/manage-project-connection/api/manage-project-connection.server.ts");
  assert.equal(entries.length, 2);
  const disconnectId = entries.find(([, entry]) => entry.exportedName === "$$RSC_SERVER_ACTION_0")?.[0];
  const reconnectId = entries.find(([, entry]) => entry.exportedName === "$$RSC_SERVER_ACTION_1")?.[0];
  assert.ok(disconnectId && reconnectId);

  async function post(id: string, body: string, session?: string, bearer?: string, requestOrigin = origin): Promise<{ status: number; text: string }> {
    const response = await fetch(`${requestOrigin}/projects`, { method: "POST", redirect: "manual", headers: {
      origin: requestOrigin, host: new URL(requestOrigin).host, "next-action": id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component",
      ...(session ? { cookie: session } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    }, body });
    return { status: response.status, text: await response.text() };
  }

  async function state(): Promise<unknown> {
    assert.ok(owner);
    return Promise.all([
      db.user.findUniqueOrThrow({ where: { id: owner.userId } }),
      db.project.findMany({ where: { ownerUserId: owner.userId }, orderBy: { id: "asc" } }),
      db.projectAvailabilityEvent.findMany({ where: { ownerUserId: owner.userId }, orderBy: { version: "asc" } }),
      db.projectToken.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
      db.ownerToken.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
      db.boardItem.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
      db.agentRun.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
      db.pipelineVersion.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
      db.pipelineRun.findMany({ where: { boardItem: { projectId: owner.projectId } }, orderBy: { id: "asc" } }),
      db.workspace.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
      db.backlogItem.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
      db.transitionEvent.findMany({ where: { boardItem: { projectId: owner.projectId } }, orderBy: { id: "asc" } }),
      db.report.findMany({ where: { boardItem: { projectId: owner.projectId } }, orderBy: { id: "asc" } }),
      db.command.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
      db.agentRunStep.findMany({ where: { run: { projectId: owner.projectId } }, orderBy: { id: "asc" } }),
      db.userToken.findMany({ where: { userId: owner.userId }, orderBy: { id: "asc" } }),
    ]);
  }

  try {
    owner = await fixture(db, { plan: "pro" }); foreign = await fixture(db);
    await db.user.update({ where: { id: owner.userId }, data: { projectAvailabilityVersion: 1 } });
    await db.projectAvailabilityEvent.create({ data: { ownerUserId: owner.userId, version: 1, actor: "user", reason: "registration", toPlan: "pro", addedProjectIds: [owner.projectId], removedProjectIds: [], availableProjectIds: [owner.projectId] } });
    const hu = newToken("user"); const hs = newToken();
    await db.userToken.create({ data: { userId: owner.userId, hash: hu.hash, label: "fixture" } });
    await db.projectToken.create({ data: { projectId: owner.projectId, hash: hs.hash, label: "fixture" } });
    await db.transitionEvent.create({ data: { boardItemId: owner.boardItemId, actor: "human", to: "in_review", note: "retained event" } });
    await db.report.create({ data: { boardItemId: owner.boardItemId, actor: "dev", path: "retained.md", commit: "1234567" } });
    const { ensureRun } = await import("../src/server/pipeline/run");
    await ensureRun(db, owner.projectId, owner.boardItemId, "in_review", false);
    await db.pipelineRun.update({ where: { boardItemId: owner.boardItemId }, data: { node: "before-implement" } });
    const ownedCookie = await cookie(owner.userId); const foreignCookie = await cookie(foreign.userId);
    // The same body includes a spoofed client userId. The valid owner's control
    // first proves action ID, argument encoding and CSRF headers are correct.
    const body = JSON.stringify([{ targetProjectId: owner.projectId, expectedVersion: 1, userId: owner.userId }]);
    await start(true);
    const success = await post(disconnectId, body, ownedCookie);
    assert.equal(success.status, 200); assert.match(success.text, /"status":"success"/);
    assert.ok((await db.project.findUniqueOrThrow({ where: { id: owner.projectId } })).disconnectedAt);
    const protectedState = await state();
    const foreignResult = await post(disconnectId, body, foreignCookie);
    assert.equal(foreignResult.status, 200); assert.match(foreignResult.text, /Project not found/);
    assert.deepEqual(await state(), protectedState);
    for (const bearer of [undefined, hu.plain, hs.plain]) {
      const noSession = await post(disconnectId, body, undefined, bearer);
      assert.ok([303, 307].includes(noSession.status) || noSession.text.includes("/login"), "A valid transport without a session must require login");
      assert.deepEqual(await state(), protectedState);
    }
    const stale = await post(disconnectId, body, ownedCookie);
    assert.equal(stale.status, 200); assert.match(stale.text, /"status":"stale"/); assert.deepEqual(await state(), protectedState);
    const root = `/p/${owner.id}`;
    const paths = [root, `${root}/inbox`, `${root}/backlog`, `${root}/items/${owner.key}`, `${root}/pipeline`, `${root}/history`, `${root}/tokens`,
      `${root}/history?item=${owner.key}`, `${root}/history?mode=events&view=all`, `${root}/history?view=key`,
      `${root}/history?before=2020-01-01T00%3A00%3A00.000Z.i.absent&item=${owner.key}`, `${root}/history?item=${owner.key}&itemBefore=2020-01-01T00%3A00%3A00.000Z.e.absent`];
    for (const path of paths) {
      const response = await fetch(`${origin}${path}`, { headers: { cookie: ownedCookie }, redirect: "manual" });
      assert.equal(response.status, 200, path); const html = await response.text();
      assert.ok(html.includes("This repository is disconnected."), path);
      assert.ok(html.includes("Reconnect repository"), path);
      if (path.includes("/inbox")) assert.ok(html.includes("Disconnected"), `Inbox must render its populated readonly card: ${path}; empty=${html.includes("Nothing to decide.")}`);
      if (path.includes("/history") && (path.includes("view=") || (path.includes("item=") && !path.includes("before=") && !path.includes("itemBefore=")))) assert.ok(html.includes("retained"), path);
      assert.deepEqual(await state(), protectedState, `GET must be read-only: ${path}`);
      assert.equal((await fetch(`${origin}${path}`, { headers: { cookie: foreignCookie }, redirect: "manual" })).status, 404);
      assert.ok([303, 307].includes((await fetch(`${origin}${path}`, { redirect: "manual" })).status));
    }
    const reconnectBody = JSON.stringify([{ targetProjectId: owner.projectId, expectedVersion: 2, userId: owner.userId }]);
    const reconnected = await post(reconnectId, reconnectBody, ownedCookie);
    assert.equal(reconnected.status, 200); assert.match(reconnected.text, /"status":"success"/);
    assert.equal((await db.project.findUniqueOrThrow({ where: { id: owner.projectId } })).disconnectedAt, null);
    assert.ok((await db.projectToken.findUniqueOrThrow({ where: { hash: hs.hash } })).revokedAt);
    if (process.argv.includes("--interactive") || process.argv.includes("--transport-loss")) {
      const { withAvailabilityTransaction } = await import("../src/server/project-availability-service");
      const { registerProjectResultIn } = await import("../src/server/project-registration-query");
      await db.project.update({ where: { id: owner.projectId }, data: { name: "RDC Alpha" } });
      await withAvailabilityTransaction(db, (tx) => registerProjectResultIn(tx, { userId: owner!.userId, owner: "rdc-fixture", repo: "beta", name: "RDC Beta", branch: "main" }));
      const now = Date.now();
      for (let index = 0; index < 55; index++) {
        const at = new Date(now - (index + 1) * 1000);
        const item = await db.backlogItem.create({ data: { projectId: owner.projectId, key: `H-${index + 1}`, title: `Preserved history ${index + 1}`, area: "web", source: "fixture evidence", createdAt: at,
          ...(index === 0 ? { removedAt: at, removedReason: "owner" } : {}) } });
        const board = await db.boardItem.create({ data: { projectId: owner.projectId, backlogItemId: item.id, agent: "dev", status: index === 1 ? "on_hold" : "done", reason: "fixture", proposedOn: at,
          ...(index === 2 ? { discardedAt: at } : {}) } });
        await db.transitionEvent.create({ data: { boardItemId: board.id, actor: "human", to: board.status, note: `retained history ${index + 1}`, at } });
        await db.report.create({ data: { boardItemId: owner.boardItemId, actor: "dev", path: `retained-${index + 1}.md`, commit: "1234567", at } });
      }
      let loseNextAction = false;
      // A loopback proxy can discard one committed response to exercise the real
      // browser's uncertain-result path, without changing production application code.
      proxy = createServer(async (req, res) => {
        try {
          const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const headers = new Headers();
          for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
          headers.set("x-forwarded-host", req.headers.host!);
          const upstream = await fetch(`${origin}${req.url}`, { method: req.method, headers, redirect: "manual", ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
          const body = Buffer.from(await upstream.arrayBuffer());
          if (req.headers["next-action"]) {
            await delay(800);
            if (loseNextAction) { loseNextAction = false; req.socket.destroy(); return; }
          }
          res.statusCode = upstream.status;
          upstream.headers.forEach((value, name) => { if (!["content-encoding", "content-length", "transfer-encoding"].includes(name)) res.setHeader(name, value); });
          res.end(body);
        } catch { if (!res.headersSent) res.writeHead(502); res.end("Fixture proxy failed"); }
      });
      await new Promise<void>((resolve) => proxy!.listen(55440, "127.0.0.1", resolve));
      // Loopback-only fixture sign-in; production auth and application routes are
      // unchanged. No cookie/JWT value is logged or included in the navigation URL.
      let finishInteractive!: () => void;
      const finished = new Promise<void>((resolve) => { finishInteractive = resolve; });
      bridge = createServer((req, res) => {
        if (req.url === "/finish") { res.writeHead(200).end("Cleaning up the fixture."); finishInteractive(); return; }
        if (req.url === "/lose-next-action") { loseNextAction = true; res.writeHead(200).end("One committed action response will be discarded."); return; }
        if (req.url !== "/owner" && req.url !== "/foreign") { res.writeHead(404).end(); return; }
        res.writeHead(302, { "set-cookie": `${req.url === "/owner" ? ownedCookie : foreignCookie}; HttpOnly; Path=/; SameSite=Lax`, location: "http://127.0.0.1:55440/projects" }); res.end();
      });
      await new Promise<void>((resolve) => bridge!.listen(55439, "127.0.0.1", resolve));
      if (process.argv.includes("--transport-loss")) {
        const proxyOrigin = "http://127.0.0.1:55440";
        const versionBefore = (await db.user.findUniqueOrThrow({ where: { id: owner.userId } })).projectAvailabilityVersion;
        const mutationBody = JSON.stringify([{ targetProjectId: owner.projectId, expectedVersion: versionBefore }]);
        const beforeNoop = await state();
        assert.match((await post(reconnectId, mutationBody, ownedCookie, undefined, proxyOrigin)).text, /"status":"success"/);
        assert.deepEqual(await state(), beforeNoop, "current-version reconnect no-op changes no persisted state");
        await fetch("http://127.0.0.1:55439/lose-next-action");
        await assert.rejects(post(disconnectId, mutationBody, ownedCookie, undefined, proxyOrigin), /fetch failed/);
        assert.ok((await db.project.findUniqueOrThrow({ where: { id: owner.projectId } })).disconnectedAt);
        assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.userId } })).projectAvailabilityVersion, versionBefore + 1);
        assert.equal(await db.projectAvailabilityEvent.count({ where: { ownerUserId: owner.userId, version: { gt: versionBefore } } }), 1);
        const committed = await state();
        assert.match((await post(disconnectId, mutationBody, ownedCookie, undefined, proxyOrigin)).text, /"status":"stale"/);
        assert.deepEqual(await state(), committed);
        const readonlyGet = async (path: string): Promise<string> => {
          const before = await state();
          const response = await fetch(`${proxyOrigin}${path}`, { headers: { cookie: ownedCookie } });
          assert.equal(response.status, 200, path); const html = await response.text();
          assert.deepEqual(await state(), before, path);
          return html;
        };
        const historyRoot = `${root}/history`;
        const older = (html: string, key: string): string => {
          const href = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"))
            .find((href) => href.startsWith(historyRoot) && new URL(href, proxyOrigin).searchParams.has(key));
          assert.ok(href, `Expected actual ${key} link`); return href;
        };
        const items = await readonlyGet(historyRoot);
        for (const label of ["Preserved history 1", "On hold", "Discarded"]) assert.ok(items.includes(label), label);
        assert.ok((await readonlyGet(older(items, "before"))).includes("Newest"));
        const expanded = await readonlyGet(`${historyRoot}?item=${owner.key}`);
        assert.ok(expanded.includes("retained-"));
        assert.ok((await readonlyGet(older(expanded, "itemBefore"))).includes("retained-"));
        const events = await readonlyGet(`${historyRoot}?mode=events&view=all`);
        assert.ok((await readonlyGet(older(events, "before"))).includes("Newest"));
        assert.ok((await readonlyGet(`${historyRoot}?before=2020-01-01T00%3A00%3A00.000Z.i.absent`)).includes("Newest"));
        const beta = await db.project.findFirstOrThrow({ where: { ownerUserId: owner.userId, name: "RDC Beta" } });
        assert.match((await post(disconnectId, JSON.stringify([{ targetProjectId: beta.id, expectedVersion: versionBefore + 1 }]), ownedCookie, undefined, proxyOrigin)).text, /"status":"success"/);
        const empty = (await readonlyGet("/projects")).replace(/<!--.*?-->/g, "");
        assert.ok(empty.includes("0 / 5 connected")); assert.ok(empty.includes("No connected repositories."));
        assert.match((await post(reconnectId, JSON.stringify([{ targetProjectId: owner.projectId, expectedVersion: versionBefore + 2 }]), ownedCookie, undefined, proxyOrigin)).text, /"status":"success"/);
        assert.equal((await db.project.findUniqueOrThrow({ where: { id: owner.projectId } })).disconnectedAt, null);
        assert.ok((await db.projectToken.findUniqueOrThrow({ where: { hash: hs.hash } })).revokedAt);
        console.log("RDC transport loss: commit/event once, stale replay, read-only populated History Items/expanded/Events pagination, zero-connected and explicit reconnection passed.");
      }
      if (process.argv.includes("--interactive")) {
        console.log("RDC UI fixture ready: http://127.0.0.1:55439/owner. Arm response loss at /lose-next-action. Enter or GET /finish cleans up.");
        process.stdin.once("data", finishInteractive);
        await finished;
        process.stdin.removeListener("data", finishInteractive);
      }
      bridge.closeAllConnections(); await new Promise<void>((resolve) => bridge!.close(() => resolve())); bridge = undefined;
      proxy.closeAllConnections(); await new Promise<void>((resolve) => proxy!.close(() => resolve())); proxy = undefined;
    }
    await stop(); await start(false);
    const beforeDisabled = await state();
    const currentVersion = (await db.user.findUniqueOrThrow({ where: { id: owner.userId } })).projectAvailabilityVersion;
    const disabled = await post(disconnectId, JSON.stringify([{ targetProjectId: owner.projectId, expectedVersion: currentVersion }]), ownedCookie);
    assert.equal(disabled.status, 200); assert.match(disabled.text, /temporarily unavailable/); assert.deepEqual(await state(), beforeDisabled);
    const projects = await fetch(`${origin}/projects`, { headers: { cookie: ownedCookie } });
    assert.ok((await projects.text()).includes("Repository connection changes are temporarily unavailable."));
    console.log("RDC real Next actions: owner/foreign/no-session/bearer/spoof/stale/flag=false passed; 7 owner detail routes + History modes/cursors are read-only and isolated.");
  } finally {
    if (bridge) { bridge.closeAllConnections(); await new Promise<void>((resolve) => bridge!.close(() => resolve())); }
    if (proxy) { proxy.closeAllConnections(); await new Promise<void>((resolve) => proxy!.close(() => resolve())); }
    await stop(); await cleanup(db, owner?.userId); await cleanup(db, foreign?.userId); await pool.disconnect();
    if (previousDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabase;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : "RDC runtime rehearsal failed");
  process.exitCode = 1;
});
