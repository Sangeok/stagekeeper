// Fresh production build, real sessions/Server Actions, and disposable test DB only.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { defaultGraph } from "../packages/core/pipeline.mjs";
import { validateTestDatabase } from "./test-server-integration.mjs";

const require = createRequire(import.meta.url);
// Use the installed Flight encoder, including FormData and undefined wire values.
const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node") as {
  encodeReply: (args: unknown[]) => Promise<string | FormData>;
};

async function main() {
  config({ quiet: true });
  const url = validateTestDatabase(process.env); const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const { connections, fixture, cleanup } = await import("../tests/server/integration/support");
  const pool = connections(1); const db = pool.all[0]; const users: string[] = [];
  const origin = "http://127.0.0.1:55449", lossOrigin = "http://127.0.0.1:55450";
  const secret = randomBytes(32).toString("hex"), cookieName = "authjs.session-token";
  let next: ChildProcess | undefined; let loss: "before" | "after" = "before";
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as {
    node: Record<string, { filename?: string; exportedName?: string; workers: unknown }>;
  };
  const actionId = (name: string) => {
    const entries = Object.entries(manifest.node).filter(([, entry]) => entry.exportedName === name);
    assert.equal(entries.length, 1, `fresh action ${name}`); assert.ok(entries[0][1].workers); return entries[0][0];
  };
  const session = async (userId: string) => `${cookieName}=${await encode({ token: { uid: userId, name: "fourth pass" }, secret, salt: cookieName, maxAge: 3600 })}`;
  async function post(name: string, args: unknown[], cookie: string, target = origin) {
    const body = await encodeReply(args);
    const response = await fetch(target + "/settings/tokens", { method: "POST", redirect: "manual", headers: {
      origin, "next-action": actionId(name), accept: "text/x-component", cookie,
      ...(typeof body === "string" ? { "content-type": "text/plain;charset=UTF-8" } : {}),
    }, body });
    return { status: response.status, body: await response.text() };
  }
  async function get(path: string, cookie: string) {
    const response = await fetch(origin + path, { headers: { cookie } }); assert.equal(response.status, 200);
    return (await response.text()).replace(/<!--[\s\S]*?-->/g, "");
  }
  const proxy = createServer(async (req, res) => {
    try {
      if (loss === "before") { req.socket.destroy(); return; }
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (value && !["host", "connection"].includes(name)) headers.set(name, Array.isArray(value) ? value.join(",") : value);
      headers.set("host", new URL(origin).host);
      const response = await fetch(origin + req.url, { method: req.method, headers, body: Buffer.concat(chunks) });
      await response.arrayBuffer(); req.socket.destroy();
    } catch { res.destroy(); }
  });
  try {
    const owner = await fixture(db, { plan: "pro" }), foreign = await fixture(db, { plan: "pro" });
    users.push(owner.userId, foreign.userId);
    const cookie = await session(owner.userId), foreignCookie = await session(foreign.userId);
    next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "55449"], {
      env: { ...process.env, DATABASE_URL: url, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true" }, windowsHide: true, stdio: "ignore",
    });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (next.exitCode !== null) throw new Error("Next server exited before acceptance");
      try { ready = (await fetch(origin + "/login")).status === 200; } catch { /* bounded startup */ }
      if (ready) break; await delay(100);
    }
    assert.ok(ready); await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(55450, "127.0.0.1", resolve); });
    const backlog = await db.backlogItem.create({ data: { projectId: owner.projectId, key: "HTTP-1", title: "Original HTTP backlog", area: "web", source: "fixture" } });
    const form = new FormData(); for (const [key, value] of Object.entries({ title: "Changed HTTP backlog", area: "web", source: "fixture", type: "feature", typeBefore: "feature" })) form.set(key, value);
    const snapshot = () => Promise.all([
      db.backlogItem.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
      db.boardItem.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }),
    ]);
    const before = await snapshot();
    for (const key of [undefined, null, "", " \t", {}, []]) {
      for (const [name, args] of [["updateBacklogItem", [owner.id, key, { status: "idle" }, form]], ["removeBacklogItem", [owner.id, key]]] as const) {
        assert.ok((await post(name, [...args], cookie)).body.includes("Invalid backlog key"));
        assert.deepEqual(await snapshot(), before);
      }
    }
    for (const sessionCookie of [foreignCookie, ""]) {
      await post("updateBacklogItem", [owner.id, backlog.key, { status: "idle" }, form], sessionCookie);
      await post("removeBacklogItem", [owner.id, backlog.key], sessionCookie);
      assert.deepEqual(await snapshot(), before);
    }
    assert.ok((await post("updateBacklogItem", [owner.id, backlog.key, { status: "idle" }, form], cookie)).body.includes('"status":"saved"'));
    assert.equal((await db.backlogItem.findUniqueOrThrow({ where: { id: backlog.id } })).title, "Changed HTTP backlog");
    assert.deepEqual(await db.boardItem.findMany({ where: { projectId: owner.projectId }, orderBy: { id: "asc" } }), before[1]);
    const withOpen = await snapshot();
    assert.ok((await post("removeBacklogItem", [owner.id, owner.key], cookie)).body.includes("open")); assert.deepEqual(await snapshot(), withOpen);
    assert.ok((await post("removeBacklogItem", [owner.id, backlog.key], cookie)).body.includes('"status":"saved"'));
    assert.equal(await db.backlogItem.count({ where: { projectId: owner.projectId, removedAt: null } }), 1);
    assert.ok((await db.backlogItem.findUniqueOrThrow({ where: { id: backlog.id } })).removedAt);
    console.log("Pass: multipart backlog actions, invalid/foreign/anonymous zero-write, normal single target and open protection.");

    const graph = defaultGraph("pro"); const versions = () => db.pipelineVersion.findMany({ where: { projectId: owner.projectId }, orderBy: { version: "asc" } });
    assert.equal((await versions()).length, 0);
    for (const input of [null, {}, { graph }, ...[undefined, null, -1, 1.5, 2_147_483_647, "0"].map(expectedVersion => ({ graph, expectedVersion })), { graph: { nodes: [], gates: [] }, expectedVersion: 0 }]) {
      assert.ok((await post("savePipeline", [owner.id, input], cookie)).body.includes('"status":"error"')); assert.equal((await versions()).length, 0);
    }
    assert.ok((await post("savePipeline", [owner.id, { graph, expectedVersion: 0 }], cookie)).body.includes('"version":1'));
    const first = await versions();
    assert.ok((await post("savePipeline", [owner.id, { graph, expectedVersion: 0 }], cookie)).body.includes('"status":"stale"')); assert.deepEqual(await versions(), first);
    assert.ok((await post("savePipeline", [owner.id, { graph, expectedVersion: 1 }], cookie)).body.includes('"version":2'));
    const replies = await Promise.all([post("savePipeline", [owner.id, { graph, expectedVersion: 2 }], cookie), post("savePipeline", [owner.id, { graph: { ...graph, gates: [] }, expectedVersion: 2 }], cookie)]);
    assert.equal(replies.filter(reply => reply.body.includes('"status":"success"')).length, 1);
    assert.equal(replies.filter(reply => reply.body.includes('"status":"stale"')).length, 1); assert.equal((await versions()).length, 3);
    const committed = await versions();
    loss = "before"; await assert.rejects(post("savePipeline", [owner.id, { graph, expectedVersion: 3 }], cookie, lossOrigin)); assert.deepEqual(await versions(), committed);
    loss = "after"; await assert.rejects(post("savePipeline", [owner.id, { graph, expectedVersion: 3 }], cookie, lossOrigin));
    assert.equal((await versions()).length, 4); assert.deepEqual((await versions()).slice(0, 3), committed);
    for (const data of [{ available: false }, { available: false, disconnectedAt: new Date() }]) {
      await db.project.update({ where: { id: owner.projectId }, data });
      const preserved = await snapshot();
      assert.ok((await post("savePipeline", [owner.id, { graph, expectedVersion: 4 }], cookie)).body.includes('"status":"error"'));
      await post("updateBacklogItem", [owner.id, owner.key, { status: "idle" }, form], cookie);
      assert.deepEqual(await snapshot(), preserved); assert.equal((await versions()).length, 4);
    }
    await db.project.update({ where: { id: owner.projectId }, data: { available: true, disconnectedAt: null } });
    await db.subscription.update({ where: { userId: owner.userId }, data: { plan: "free" } });
    assert.ok((await post("savePipeline", [owner.id, { graph, expectedVersion: 4 }], cookie)).body.includes('"status":"error"')); assert.equal((await versions()).length, 4);
    await db.subscription.update({ where: { userId: owner.userId }, data: { plan: "pro" } });
    console.log("Pass: built pipeline action input/plan/access guards, sequential/concurrent stale, transport loss before and after commit.");

    await db.transitionEvent.create({ data: { boardItemId: owner.boardItemId, actor: "human", from: "planning", to: "in_review", note: "HTTP history evidence" } });
    await db.report.create({ data: { boardItemId: owner.boardItemId, actor: "dev", path: "docs/fixture-report.md", commit: "abcdef123456" } });
    const board = await get(`/p/${owner.id}`, cookie); assert.ok(board.includes(owner.key) && board.includes(owner.id));
    const history = await get(`/p/${owner.id}/history?item=${encodeURIComponent(owner.key)}`, cookie); assert.ok(history.includes(owner.key) && history.includes("fixture-report.md"));
    const events = await get(`/p/${owner.id}/history?mode=events&view=all`, cookie); assert.ok(events.includes("HTTP history evidence") && events.includes("fixture-report.md"));
    const pipeline = await get(`/p/${owner.id}/pipeline`, cookie); assert.ok(pipeline.includes("Pipeline") && pipeline.includes("Automatic scouting"));
    assert.ok(history.includes(`/blob/abcdef123456/docs/fixture-report.md`) || events.includes(`/blob/abcdef123456/docs/fixture-report.md`));
    console.log("Pass: actual Board/History Items/Events/pipeline GET bodies and GitHub report destination.");
  } finally {
    proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve()));
    if (next && next.exitCode === null) { const stopped = new Promise<void>(resolve => next!.once("exit", () => resolve())); next.kill(); await stopped; }
    for (const userId of users) await cleanup(db, userId);
    await pool.disconnect(); if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
  }
}
void main().catch(error => { console.error("Fourth-pass HTTP acceptance failed", error instanceof Error ? error.stack?.split("\n").find(line => line.includes("rehearse-src-clean-code-fourth-pass.ts:"))?.trim() : "unknown error"); process.exitCode = 1; });
