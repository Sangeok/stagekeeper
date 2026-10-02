// Real Next HTTP/Server Actions against an isolated DB; never print credentials.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { validateTestDatabase } from "./test-server-integration.mjs";
import { newToken } from "../packages/core/token.mjs";

async function main(): Promise<void> {
  config({ quiet: true });
  const url = validateTestDatabase(process.env);
  const previousDatabase = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  const { connections, fixture, cleanup } = await import("../tests/server/integration/support");
  const pool = connections(1); const db = pool.all[0];
  const secret = randomBytes(32).toString("hex");
  const origin = "http://127.0.0.1:55476";
  const browserOrigin = "http://127.0.0.1:55478";
  const cookieName = "authjs.session-token";
  let server: ChildProcess | undefined, bridge: Server | undefined, proxy: Server | undefined;
  let owner: Awaited<ReturnType<typeof fixture>> | undefined, foreign: typeof owner;
  let loseNext = false;
  const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { filename?: string; exportedName?: string }> };
  const actionId = (name: string): string => {
    const match = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === name && /manage-(user-)?token/.test(entry.filename ?? ""));
    assert.ok(match, "Built token action must exist"); return match[0];
  };
  const cookie = async (userId: string) => `${cookieName}=${await encode({ token: { uid: userId, name: "Usage fixture" }, secret, salt: cookieName, maxAge: 3600 })}`;
  async function post(name: string, args: unknown[], session?: string): Promise<{ status: number; text: string }> {
    const response: Response = await fetch(`${origin}/settings/tokens`, { method: "POST", redirect: "manual", headers: {
      origin, "next-action": actionId(name), "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", ...(session ? { cookie: session } : {}),
    }, body: JSON.stringify(args) });
    return { status: response.status, text: await response.text() };
  }
  async function rpc(path: string, token: string, method: string, params: unknown): Promise<Response> {
    return fetch(origin + path, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  }
  async function get(path: string, session: string): Promise<string> {
    const response: Response = await fetch(origin + path, { headers: { cookie: session } }); assert.equal(response.status, 200); return (await response.text()).replace(/<!--[\s\S]*?-->/g, "");
  }
  try {
    owner = await fixture(db, { plan: "pro" }); foreign = await fixture(db);
    const session = await cookie(owner.userId), foreignSession = await cookie(foreign.userId);
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "55476"], {
      env: { ...process.env, DATABASE_URL: url, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true" }, stdio: "ignore", windowsHide: true,
    });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Local Next server exited");
      try { ready = (await fetch(origin + "/login")).status === 200; } catch { /* bounded startup wait */ }
      if (ready) break; await delay(100);
    }
    assert.ok(ready, "Local Next server must start");
    const findToken = (kind: "agent" | "owner" | "user", where: { id?: string; hash?: string }) => kind === "agent" ? db.projectToken.findFirstOrThrow({ where }) : kind === "owner" ? db.ownerToken.findFirstOrThrow({ where }) : db.userToken.findFirstOrThrow({ where });
    // Validate every issuer through the built action/session boundary, then rename,
    // re-read and revoke. A foreign session and an absent session cannot rename.
    for (const kind of ["agent", "owner", "user"] as const) {
      const issue = kind === "agent" ? "issueToken" : kind === "owner" ? "issueOwnerToken" : "issueUserToken";
      const rename = kind === "agent" ? "renameToken" : kind === "owner" ? "renameOwnerToken" : "renameUserToken";
      const revoke = kind === "agent" ? "revokeToken" : kind === "owner" ? "revokeOwnerToken" : "revokeUserToken";
      const prefix = kind === "user" ? [] : [owner.id];
      const countTokens = () => kind === "agent" ? db.projectToken.count({where:{projectId:owner!.projectId}}) : kind === "owner" ? db.ownerToken.count({where:{projectId:owner!.projectId}}) : db.userToken.count({where:{userId:owner!.userId}});
      const label = `${kind} transport fixture`;
      const expiresAt = "2999-01-01T00:00:00.000Z";
      const invalid = await post(issue, [...prefix, label, "2020-01-01T00:00:00.000Z"], session);
      assert.ok(invalid.text.includes("Choose a future expiry")); assert.equal(await countTokens(), 0);
      const issued = await post(issue, [...prefix, label, expiresAt], session);
      assert.equal(issued.status, 200); assert.ok(issued.text.includes('"success":true'));
      const row: Awaited<ReturnType<typeof findToken>> = kind === "agent" ? await db.projectToken.findFirstOrThrow({where:{projectId:owner.projectId}}) : kind === "owner" ? await db.ownerToken.findFirstOrThrow({where:{projectId:owner.projectId}}) : await db.userToken.findFirstOrThrow({where:{userId:owner.userId}}); assert.equal(row.expiresAt?.toISOString(), expiresAt);
      const renamed = await post(rename, [...prefix, row.id, `${kind} renamed`], session);
      assert.ok(renamed.text.includes('"success":true'));
      const read = (): ReturnType<typeof findToken> => findToken(kind, {id:row.id});
      const changed: Awaited<ReturnType<typeof findToken>> = await read(); assert.deepEqual(changed, { ...row, label: `${kind} renamed` });
      await post(rename, [...prefix, row.id, "foreign"], foreignSession); assert.deepEqual(await read(), changed);
      await post(rename, [...prefix, row.id, "anonymous"]); assert.deepEqual(await read(), changed);
      const blank = await post(rename, [...prefix, row.id, " "], session); assert.ok(blank.text.includes("Enter a token name")); assert.deepEqual(await read(), changed);
      await post(revoke, [...prefix, row.id], session); assert.ok((await read()).revokedAt);
      const ended = await post(rename, [...prefix, row.id, `${kind} ended`], session); assert.ok(ended.text.includes('"success":true'));
      const markup = await get(kind === "user" ? "/settings/tokens" : `/p/${owner.id}/tokens`, session);
      assert.ok(markup.includes(`${kind} ended`) && markup.includes("Ended tokens") && markup.includes("Revoked"));
    }
    // All six production authentication paths reject expired credentials. The
    // wrapper performs a fresh lookup even on subsequent requests.
    const tokens = { agent: newToken(), owner: newToken("owner"), user: newToken("user") };
    for (const kind of ["agent", "owner", "user"] as const) {
      const credential = tokens[kind];
      const data = {hash:credential.hash,label:`${kind} browser fixture`,expiresAt:new Date(0),usageTrackingStartedAt:new Date()};
      if(kind === "agent") await db.projectToken.create({data:{...data,projectId:owner.projectId}});
      else if(kind === "owner") await db.ownerToken.create({data:{...data,projectId:owner.projectId,userId:owner.userId}});
      else await db.userToken.create({data:{...data,userId:owner.userId}});
    }
    for (const path of ["/api/project", "/api/templates", "/api/runbook", "/api/projects"]) {
      const response: Response = await fetch(`${origin}${path}?project=${owner.id}`, { method: path === "/api/runbook" || path === "/api/projects" ? "POST" : "GET",
        headers: { authorization: `Bearer ${tokens.user.plain}` }, body: path === "/api/runbook" || path === "/api/projects" ? "{}" : undefined });
      assert.equal(response.status, 401);
    }
    for (const [kind, path] of [["agent", "/api/mcp"], ["user", "/api/mcp"], ["owner", "/api/mcp/owner"]] as const) {
      assert.equal((await rpc(path, tokens[kind].plain, "tools/list", {})).status, 401);
    }
    for (const kind of ["agent", "owner", "user"] as const) {
      const row = await findToken(kind, {hash:tokens[kind].hash}); assert.equal(row.lastUsedAt, null);
      const args = {where:{id:row.id},data:{expiresAt:null}};
      if(kind === "agent") await db.projectToken.updateMany(args);
      else if(kind === "owner") await db.ownerToken.updateMany(args);
      else await db.userToken.updateMany(args);
    }
    const userBefore = await db.user.findUniqueOrThrow({ where: { id: owner.userId } });
    const initial = await rpc("/api/mcp", tokens.user.plain, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "fixture", version: "1" } });
    assert.equal(initial.status, 200);
    assert.equal((await rpc("/api/mcp", tokens.user.plain, "tools/list", {})).status, 200);
    assert.equal((await rpc("/api/mcp", tokens.user.plain, "tools/call", { name: "agent_next", arguments: { project: owner.id } })).status, 200);
    assert.equal(await db.requestRateWindow.count({ where: { ownerUserId: owner.userId } }), 0);
    assert.equal((await rpc("/api/mcp", tokens.user.plain, "tools/call", { name: "project_get", arguments: { project: foreign.id } })).status, 200);
    assert.equal(await db.requestRateWindow.count({ where: { ownerUserId: owner.userId } }), 0);
    const args: Record<string, Record<string, unknown>> = {
      project_get: {}, project_sync: { workspaces: [] }, backlog_list: {}, backlog_get: { key: "missing" },
      backlog_add: { runId: "missing", title: "fixture", area: "web", source: "fixture", type: "feat" },
      board_list: {}, board_get: { key: "missing" }, board_propose: { key: "missing", agent: "dev", reason: "fixture" },
      board_transition: { key: "missing", to: "on_hold", result: "fixture" }, plan_submit: { key: "missing", path: "fixture.md", commit: "fixture" },
      report_submit: { key: "missing", actor: "dev", path: "fixture.md", commit: "fixture" }, validation_record: { key: "missing", text: "fixture" },
      agent_next: { agent: "invalid-fixture-agent" }, pipeline_next: { key: "missing" },
    };
    let calls = 0;
    for (const [name, input] of Object.entries(args)) {
      const response: Response = await rpc("/api/mcp", tokens.user.plain, "tools/call", { name, arguments: { ...input, project: owner.id } });
      assert.equal(response.status, 200);
      calls++;
      const budgets: {scope:string;count:number}[] = await db.requestRateWindow.findMany({ where: { ownerUserId: owner.userId } });
      assert.equal(budgets.length, 2); assert.ok(budgets.every((row) => row.count === calls), name);
    }
    const gateResponse = await rpc("/api/mcp/owner", tokens.owner.plain, "tools/call", { name: "gate_approve", arguments: { key: "missing", gate: "before-implement" } }); assert.equal(gateResponse.status, 200);
    const ownerBudgets = await db.requestRateWindow.findMany({ where: { ownerUserId: owner.userId } }); assert.ok(ownerBudgets.every((row) => row.count === 15));
    const after = await db.user.findUniqueOrThrow({ where: { id: owner.userId } }); assert.equal(after.usageRunCount, userBefore.usageRunCount);
    await db.requestRateWindow.updateMany({ where: { ownerUserId: owner.userId, scope: "account" }, data: { count: 1200 } });
    for (const path of ["/api/project", "/api/templates", "/api/runbook", "/api/projects"]) {
      const response: Response = await fetch(`${origin}${path}?project=${owner.id}`, { method: path === "/api/runbook" || path === "/api/projects" ? "POST" : "GET",
        headers: { authorization: `Bearer ${tokens.user.plain}` }, body: path === "/api/runbook" || path === "/api/projects" ? JSON.stringify({ project: owner.id }) : undefined });
      assert.equal(response.status, 429); const body = await response.json();
      assert.equal(body.code, "RATE_LIMITED"); assert.equal(response.headers.get("Retry-After"), String(body.retryAfterSec));
    }
    for (const [path, token, name, input] of [["/api/mcp", tokens.user.plain, "project_get", { project: owner.id }],
      ["/api/mcp/owner", tokens.owner.plain, "gate_approve", { key: "missing", gate: "before-implement" }]] as const) {
      const response: Response = await rpc(path, token, "tools/call", { name, arguments: input });
      assert.equal(response.status, 200); const text = await response.text();
      const json = response.headers.get("content-type")?.includes("text/event-stream")
        ? JSON.parse(text.split(/\r?\n/).find((line) => line.startsWith("data: "))!.slice(6)) : JSON.parse(text);
      assert.equal(json.result.isError, true); assert.equal(JSON.parse(json.result.content[0].text).code, "RATE_LIMITED");
    }
    assert.ok((await db.requestRateWindow.findMany({ where: { ownerUserId: owner.userId } })).every((row) => row.count === (row.scope === "account" ? 1200 : 15)));
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.userId } })).usageRunCount, after.usageRunCount);
    await db.requestRateWindow.deleteMany({ where: { ownerUserId: owner.userId } });
    const anchor = new Date();
    for (const [plan, count, expected] of [["free", 10, "50% used"], ["pro", 100, "100% used"], ["max", 150, "Unlimited"]] as const) {
      await db.subscription.update({ where: { userId: owner.userId }, data: { plan } });
      await db.user.update({ where: { id: owner.userId }, data: { usageWindowStartedAt: anchor, usageRunCount: count } });
      assert.ok((await get("/billing", session)).includes(expected));
    }
    await db.subscription.update({ where: { userId: owner.userId }, data: { plan: "pro" } });
    await db.user.update({ where: { id: owner.userId }, data: { usageWindowStartedAt: new Date(Date.now() - 5 * 3600_000), usageRunCount: 100 } });
    assert.ok((await get("/billing", session)).includes("0% used"));
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.userId } })).usageRunCount, 100);
    console.log("Next HTTP rehearsal passed: 3 token lifecycles, 6 auth/rate paths, 15 request boundaries, SDK exclusions and plan snapshots.");
    if (process.argv.includes("--interactive")) {
      let finish!: () => void; const finished = new Promise<void>((resolve) => { finish = resolve; });
      proxy = createServer(async (req, res) => {
        try {
          const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value && !["host", "connection", "content-length"].includes(key)) headers.set(key, Array.isArray(value) ? value.join(",") : value);
          headers.set("origin", origin);
          const lose = loseNext && req.method === "POST" && Boolean(req.headers["next-action"]); if (lose) loseNext = false;
          const response: Response = await fetch(origin + req.url, { method: req.method, headers, redirect: "manual", ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
          const body = Buffer.from(await response.arrayBuffer());
          // A truncated RSC frame makes the action outcome unknown without a
          // browser transport-level replay of an unacknowledged POST.
          if (lose) { res.writeHead(200, { "content-type": "text/x-component" }); res.end("0:"); return; }
          res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([key]) => !["content-encoding", "content-length", "transfer-encoding"].includes(key)))); res.end(body);
        } catch { res.writeHead(502).end("Fixture transport unavailable"); }
      });
      await new Promise<void>((resolve, reject) => { proxy!.once("error", reject); proxy!.listen(55478, "127.0.0.1", resolve); });
      bridge = createServer(async (req, res) => {
        if (req.url === "/finish") { res.end("Fixture cleanup started"); finish(); return; }
        if (req.url === "/lose-next-action") { loseNext = true; res.end("Next action response will be lost"); return; }
        const path = req.url === "/project" ? `/p/${owner!.id}/tokens` : req.url === "/billing" ? "/billing" : "/settings/tokens";
        res.writeHead(302, { "set-cookie": `${session}; Path=/; HttpOnly; SameSite=Lax`, location: browserOrigin + path }); res.end();
      });
      await new Promise<void>((resolve, reject) => { bridge!.once("error", reject); bridge!.listen(55477, "127.0.0.1", resolve); });
      console.log("UI fixture ready at http://127.0.0.1:55477/user (/project, /billing, /lose-next-action, /finish). Loopback only.");
      await finished;
    }
  } finally {
    for (const listener of [bridge, proxy]) if (listener) { listener.closeAllConnections(); await new Promise<void>((resolve) => listener.close(() => resolve())); }
    if (server && server.exitCode === null) { const exited = new Promise<void>((resolve) => server!.once("exit", () => resolve())); server.kill(); await exited; }
    await cleanup(db, owner?.userId); await cleanup(db, foreign?.userId); await pool.disconnect(); process.env.DATABASE_URL = previousDatabase;
  }
}
void main().catch((error: unknown) => {
  const location = error instanceof Error ? error.stack?.split("\n").find((line) => line.includes("rehearse-account-usage-and-tokens.ts:")) : undefined;
  console.error("Account usage/token rehearsal failed; no credentials or database details emitted.", location?.trim() ?? "before rehearsal assertion");
  process.exitCode = 1;
});
