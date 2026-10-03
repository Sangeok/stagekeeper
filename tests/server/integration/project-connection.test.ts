import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../../src/generated/prisma/client";
import { newToken } from "../../../packages/core/token.mjs";
import { runbookVersion } from "../../../packages/core/runbook.mjs";
import { GET as identity } from "../../../src/app/api/project/route";
import { GET as templates } from "../../../src/app/api/templates/route";
import { POST as runbook } from "../../../src/app/api/runbook/route";
import { POST as register } from "../../../src/app/api/projects/route";
import { POST as agentMcp } from "../../../src/app/api/mcp/route";
import { POST as ownerMcp } from "../../../src/app/api/mcp/owner/route";
import { DISCONNECTED_REASON, readProjectAccess, type TransactionHost } from "../../../src/server/project-access-query";
import { disconnectProject, reconnectProject } from "../../../src/server/project-connection-service";
import { issueProjectToken, issueProjectOwnerToken } from "../../../src/server/project-token-service";
import { changeUserPlan, selectProjectForUse, withAvailabilityTransaction } from "../../../src/server/project-availability-service";
import { registerProjectResultIn } from "../../../src/server/project-registration-query";
import { AGENT_TOOL_NAMES } from "../../../src/server/mcp/tools";
import { createBoardService } from "../../../src/server/pipeline/board";
import { ensureRun } from "../../../src/server/pipeline/run";
import { readCleanupFactsIn } from "../../../scripts/lib/project-ownership-cleanup";
import { createNextDeps } from "../../../src/server/agents/runs";
import { makeRecordRunbook } from "../../../src/server/runbook-query";
import { cleanup, connections, fixture, checkpoint, type Fixture, type Hook } from "./support";

async function connectionFixture(db: PrismaClient): Promise<Fixture> {
  const f = await fixture(db, { plan: "pro", status: "proposed" });
  await db.user.update({ where: { id: f.userId }, data: { projectAvailabilityVersion: 1 } });
  await db.projectAvailabilityEvent.create({ data: { ownerUserId: f.userId, version: 1, actor: "user", reason: "registration", toPlan: "pro", addedProjectIds: [f.projectId], removedProjectIds: [], availableProjectIds: [f.projectId] } });
  return f;
}

async function preserved(db: PrismaClient, f: Fixture): Promise<unknown> {
  return Promise.all([
    db.workspace.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }),
    db.backlogItem.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }),
    db.boardItem.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }),
    db.transitionEvent.findMany({ where: { boardItem: { projectId: f.projectId } }, orderBy: { id: "asc" } }),
    db.report.findMany({ where: { boardItem: { projectId: f.projectId } }, orderBy: { id: "asc" } }),
    db.command.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }),
    db.agentRun.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }),
    db.agentRunStep.findMany({ where: { run: { projectId: f.projectId } }, orderBy: { id: "asc" } }),
    db.pipelineVersion.findMany({ where: { projectId: f.projectId }, orderBy: { id: "asc" } }),
    db.pipelineRun.findMany({ where: { boardItem: { projectId: f.projectId } }, orderBy: { id: "asc" } }),
    db.userToken.findMany({ where: { userId: f.userId }, orderBy: { id: "asc" } }),
  ]);
}

function request(path: string, token: string, body?: unknown): Request {
  return new Request(`https://example.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

type ToolResult = { isError?: boolean; content: { type: string; text?: string }[] };
async function callMcp(route: typeof agentMcp, token: string, name: string, args: unknown): Promise<{ status: number; result?: ToolResult; body: string }> {
  const req = request(route === agentMcp ? "/api/mcp" : "/api/mcp/owner", token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  req.headers.set("accept", "application/json, text/event-stream");
  const response = await route(req);
  const body = await response.text();
  if (response.status !== 200) return { status: response.status, body };
  const messages = response.headers.get("content-type")?.includes("text/event-stream")
    ? body.split(/\r?\n/).filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6))) : [JSON.parse(body)];
  const message = messages.find((entry) => entry.id === 1);
  assert.ok(message?.result, `MCP must reach the tool callback: ${body}`);
  return { status: response.status, result: message.result as ToolResult, body };
}

// The real owner SQL lock is held before starting the second operation. A second
// post-lock barrier would deadlock, so only the first writer is paused here.
function afterOwnerLock(db: PrismaClient, hook: Hook): TransactionHost {
  return db.$extends({ query: { async $queryRaw({ args, query }) {
    const result = await query(args);
    if (JSON.stringify(args).includes("FOR UPDATE")) await hook();
    return result;
  } } }) as unknown as TransactionHost;
}

function observeOwnerLock(db: PrismaClient): { client: TransactionHost; attempted: Promise<void> } {
  let signal!: () => void;
  const attempted = new Promise<void>((resolve) => { signal = resolve; });
  const client = db.$extends({ query: { async $queryRaw({ args, query }) {
    if (JSON.stringify(args).includes("FOR UPDATE")) signal();
    return query(args);
  } } }) as unknown as TransactionHost;
  return { client, attempted };
}

it("preserves project identity and every populated child, revokes project credentials, and denies all six transports", async () => {
  const pool = connections(1); const db = pool.all[0]; let f: Fixture | undefined;
  try {
    f = await connectionFixture(db);
    const hs = newToken(); const ho = newToken("owner"); const hu = newToken("user");
    await db.projectToken.create({ data: { projectId: f.projectId, hash: hs.hash, label: "live" } });
    await db.ownerToken.create({ data: { projectId: f.projectId, userId: f.userId, hash: ho.hash, label: "live" } });
    await db.userToken.create({ data: { userId: f.userId, hash: hu.hash, label: "account" } });
    const otherProject = await db.project.create({ data: { ownerUserId: f.userId, slug: `${f.id}-other`, name: "other", repoOwner: f.id, repo: "other", branch: "main", available: false } });
    const oldRevocation = new Date("2026-01-01T00:00:00Z");
    await db.projectToken.createMany({ data: [
      { projectId: f.projectId, hash: newToken().hash, label: "previously revoked", expiresAt: null, revokedAt: oldRevocation },
      { projectId: otherProject.id, hash: newToken().hash, label: "other repository" },
    ] });
    await db.ownerToken.createMany({ data: [
      { projectId: f.projectId, userId: f.userId, hash: newToken("owner").hash, label: "previously revoked", expiresAt: null, revokedAt: oldRevocation },
      { projectId: otherProject.id, userId: f.userId, hash: newToken("owner").hash, label: "other repository" },
    ] });
    const unchangedCredentials = () => Promise.all([
      db.projectToken.findMany({ where: { OR: [{ projectId: otherProject.id }, { projectId: f!.projectId, label: "previously revoked" }] }, orderBy: { id: "asc" } }),
      db.ownerToken.findMany({ where: { OR: [{ projectId: otherProject.id }, { projectId: f!.projectId, label: "previously revoked" }] }, orderBy: { id: "asc" } }),
    ]);
    const credentialsBefore = await unchangedCredentials();
    await db.template.createMany({ data: [{ lang: f.id, path: "docs/plans/README.md", body: "private template" }, { lang: f.id, path: "CLAUDE.runbook.md", body: "private runbook" }] });
    const project = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    const rb = { project: f.id, version: runbookVersion("private runbook") };
    const registration = { owner: f.id.toUpperCase(), repo: f.id.toUpperCase(), branch: "ignored", slug: "ignored" };
    const endpoints = [
      () => identity(request(`/api/project?project=${f!.id}`, hu.plain)),
      () => templates(request(`/api/templates?lang=${f!.id}&project=${f!.id}`, hu.plain)),
      () => runbook(request("/api/runbook", hu.plain, rb)),
      () => register(request("/api/projects", hu.plain, registration)),
    ];
    for (const endpoint of endpoints) assert.equal((await endpoint()).status, 200, "normal control must reach an authorized domain operation");
    const normalAgent = await callMcp(agentMcp, hu.plain, "project_get", { project: f.id });
    assert.equal(normalAgent.result?.isError, undefined);
    await ensureRun(db, f.projectId, f.boardItemId, "proposed", false);
    const gateRun = await db.pipelineRun.findUniqueOrThrow({ where: { boardItemId: f.boardItemId } });
    const normalOwner = await callMcp(ownerMcp, ho.plain, "gate_approve", { key: f.key, gate: "before-plan", gateEntry: { runId: gateRun.id, entryId: gateRun.entryId } });
    assert.ok(!normalOwner.result?.isError, normalOwner.body);
    const pipeline = await db.pipelineRun.findUniqueOrThrow({ where: { boardItemId: f.boardItemId } });
    const run = await db.agentRun.create({ data: { projectId: f.projectId, agent: "dev", key: f.key, tokenId: "preserved", stepId: "start", pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId } });
    await db.agentRunStep.create({ data: { runId: run.id, stepId: "start", outcome: "handoff", note: "preserved", accepted: true, callerTokenId: "old-token", receiptRevision: 0 } });
    await db.report.create({ data: { boardItemId: f.boardItemId, agentRunId: run.id, actor: "dev", path: "preserved.md", commit: "1234567" } });
    await db.command.create({ data: { projectId: f.projectId, kind: "test", body: "preserved command" } });
    const before = await preserved(db, f);
    const identityBefore = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    assert.deepEqual(await disconnectProject(db, { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 1 }), { status: "success", changed: true, version: 2 });
    assert.deepEqual(await preserved(db, f), before);
    assert.deepEqual(await unchangedCredentials(), credentialsBefore);
    const disconnected = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    assert.deepEqual({ ...disconnected, available: identityBefore.available, disconnectedAt: identityBefore.disconnectedAt }, identityBefore);
    for (const [index, endpoint] of endpoints.entries()) {
      const denied = await endpoint(); assert.equal(denied.status, index === 3 ? 409 : 403);
      assert.deepEqual(await denied.json(), index === 3 ? { error: DISCONNECTED_REASON, reconnectPath: `/p/${project.slug}` } : { error: DISCONNECTED_REASON });
    }
    const argumentsByTool: Record<typeof AGENT_TOOL_NAMES[number], object> = {
      acceptance_fail: { key: f.key, checks: [3], note: "failed" },
      project_get: {}, project_sync: { workspaces: [] }, backlog_list: {}, backlog_get: { key: f.key },
      backlog_add: { runId: run.id, title: "title", area: "app", source: "evidence", type: "feat" },
      board_list: {}, board_get: { key: f.key }, board_propose: { key: f.key, agent: "dev", reason: "reason" },
      board_transition: { key: f.key, to: "on_hold", result: "wait" }, plan_submit: { key: f.key, path: "x.md", commit: "1234567" },
      report_submit: { key: f.key, actor: "dev", path: "x.md", commit: "1234567" }, validation_record: { key: f.key, text: "ok" },
      agent_next: { agent: "dev", key: f.key }, pipeline_next: { key: f.key },
    };
    for (const name of AGENT_TOOL_NAMES) {
      const result = await callMcp(agentMcp, hu.plain, name, { project: f.id, ...argumentsByTool[name] });
      assert.equal(result.result?.isError, true, name);
      assert.deepEqual(result.result?.content, [{ type: "text", text: JSON.stringify({ error: DISCONNECTED_REASON }) }], name);
    }
    // Revoked credentials fail authentication without revealing connection state.
    for (const result of [await callMcp(agentMcp, hs.plain, "project_get", {}), await callMcp(ownerMcp, ho.plain, "gate_approve", { key: f.key, gate: "before-plan" })]) {
      assert.equal(result.status, 401); assert.ok(!result.body.includes(DISCONNECTED_REASON));
    }
    for (const endpoint of [() => identity(request("/api/project", hs.plain)), () => templates(request(`/api/templates?lang=${f!.id}`, hs.plain)), () => runbook(request("/api/runbook", hs.plain, rb))]) assert.equal((await endpoint()).status, 401);
    // A historically retained ho_ row cannot bypass the tool's state guard.
    const retainedOwner = newToken("owner");
    await db.ownerToken.create({ data: { projectId: f.projectId, userId: f.userId, hash: retainedOwner.hash, label: "retained guard fixture" } });
    const refusedOwner = await callMcp(ownerMcp, retainedOwner.plain, "gate_approve", { key: f.key, gate: "before-plan" });
    assert.equal(refusedOwner.result?.isError, true); assert.deepEqual(refusedOwner.result?.content, [{ type: "text", text: JSON.stringify({ error: DISCONNECTED_REASON }) }]);
    await db.ownerToken.updateMany({ where: { hash: retainedOwner.hash }, data: { revokedAt: new Date() } });
    const board = createBoardService(db);
    const historyBefore = await board.projectHistory(f.projectId, { view: "all", since: null, before: null });
    assert.ok(historyBefore.rows.length > 0);
    assert.deepEqual(await preserved(db, f), before, "all denied requests and history GETs leave domains unchanged");
    const facts = await db.$transaction((tx) => readCleanupFactsIn(tx, "post"));
    assert.equal(facts.connectionCapability, "complete");
    assert.deepEqual(await reconnectProject(db, { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 2 }), { status: "success", changed: true, version: 3 });
    assert.deepEqual(await preserved(db, f), before);
    assert.deepEqual(await board.projectHistory(f.projectId, { view: "all", since: null, before: null }), historyBefore);
    assert.deepEqual(await unchangedCredentials(), credentialsBefore);
    assert.equal((await callMcp(agentMcp, hs.plain, "project_get", {})).status, 401);
    const issued = await issueProjectToken(db, { userId: f.userId, projectId: f.projectId, label: "replacement" });
    assert.ok(issued.ok); assert.equal((await identity(request("/api/project", issued.item.token))).status, 200);
    const events = await db.projectAvailabilityEvent.findMany({ where: { ownerUserId: f.userId }, orderBy: { version: "asc" } });
    assert.deepEqual(events.slice(1).map((e) => [e.reason, e.targetProjectId, e.addedProjectIds, e.removedProjectIds, e.availableProjectIds]), [
      ["disconnect-project", f.projectId, [], [f.projectId], []], ["reconnect-project", f.projectId, [f.projectId], [], [f.projectId]],
    ]);
    assert.equal((await identity(request(`/api/project?project=${f.id}`, hu.plain))).status, 200);
    // Existing case variants are an integrity error, even on a current-version
    // reconnect no-op. No endpoint may choose one or return its reconnect URL.
    await db.project.create({ data: { ownerUserId: f.userId, slug: `${f.id}-duplicate`, name: "duplicate", repoOwner: f.id.toUpperCase(), repo: f.id.toUpperCase(), branch: "main", available: false } });
    const ambiguous = await register(request("/api/projects", hu.plain, registration));
    assert.equal(ambiguous.status, 409); assert.deepEqual(await ambiguous.json(), { error: "Project ownership is unavailable." });
    for (const change of [disconnectProject, reconnectProject]) {
      const result = await change(db, { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 3 });
      assert.equal(result.status === "error" && result.code, "integrity");
    }
    assert.equal(await db.projectAvailabilityEvent.count({ where: { ownerUserId: f.userId } }), 3);
  } finally { if (f) await db.template.deleteMany({ where: { lang: f.id } }); await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("rolls project, credentials, version and events back when event storage or CAS fails", async () => {
  const pool = connections(1); const db = pool.all[0]; let f: Fixture | undefined;
  try {
    f = await connectionFixture(db); const token = newToken();
    await db.projectToken.create({ data: { projectId: f.projectId, hash: token.hash, label: "original" } });
    const before = await db.project.findUniqueOrThrow({ where: { id: f.projectId } });
    const failure = db.$extends({ query: { projectAvailabilityEvent: { create() { throw new Error("injected availability event failure"); } } } }) as unknown as TransactionHost;
    const input = { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 1 };
    await assert.rejects(disconnectProject(failure, input), /injected availability event failure/);
    const cas = db.$extends({ query: { user: { updateMany() { return Promise.resolve({ count: 0 }); } } } }) as unknown as TransactionHost;
    const exhausted = await disconnectProject(cas, input); assert.equal(exhausted.status === "error" && exhausted.code, "conflict");
    assert.deepEqual(await db.project.findUniqueOrThrow({ where: { id: f.projectId } }), before);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: f.userId } })).projectAvailabilityVersion, 1);
    assert.equal(await db.projectAvailabilityEvent.count({ where: { ownerUserId: f.userId } }), 1);
    assert.equal((await db.projectToken.findUniqueOrThrow({ where: { hash: token.hash } })).revokedAt, null);
    let attempts = 0;
    const retried = db.$extends({ query: { projectAvailabilityEvent: { async create({ args, query }) {
      if (++attempts === 1) throw Object.assign(new Error("injected serialization retry"), { code: "P2034" });
      return query(args);
    } } } }) as unknown as TransactionHost;
    assert.equal((await disconnectProject(retried, input)).status, "success");
    assert.equal(attempts, 2); assert.equal(await db.projectAvailabilityEvent.count({ where: { ownerUserId: f.userId, reason: "disconnect-project" } }), 1);
  } finally { await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("permits zero-connected plan changes/new registration and preserves account dispatch usage and approved in-flight writes", async () => {
  const pool = connections(1); const db = pool.all[0]; let f: Fixture | undefined; const gate = checkpoint(); let pending: Promise<unknown> | undefined;
  try {
    f = await connectionFixture(db); const token = newToken("user");
    await db.userToken.create({ data: { userId: f.userId, hash: token.hash, label: "retained" } });
    await db.agentRun.create({ data: { projectId: f.projectId, tokenId: "audit", agent: "pm", stepId: "start" } });
    const usageAnchor = new Date();
    await db.user.update({ where: { id: f.userId }, data: { usageWindowStartedAt: usageAnchor, usageRunCount: 20 } });
    const record = makeRecordRunbook({
      requestLimit: async () => null,
      findTokenByHash: async () => null,
      findUserTokenByHash: async () => ({ id: "user-token", userId: f!.userId, expiresAt: null, revokedAt: null }),
      projectFor: async () => f!.projectId,
      projectAccess: (id) => readProjectAccess(db, id),
      saveRunbookVersion: async (id, version) => { await gate.hook(); await db.project.update({ where: { id }, data: { runbookVersion: version } }); },
    });
    pending = record(`Bearer ${token.plain}`, { project: f.id, version: runbookVersion("in-flight") });
    await gate.entered();
    assert.equal((await disconnectProject(db, { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 1 })).status, "success");
    gate.release(); assert.deepEqual(await pending, { ok: true });
    const version = runbookVersion("in-flight"); assert.equal((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).runbookVersion, version);
    const denied = await record(`Bearer ${token.plain}`, { project: f.id, version: runbookVersion("denied") });
    assert.deepEqual(denied, { ok: false, status: 403, reason: DISCONNECTED_REASON });
    assert.equal((await db.project.findUniqueOrThrow({ where: { id: f.projectId } })).runbookVersion, version);
    assert.deepEqual((await changeUserPlan(db, { userId: f.userId, plan: "free" })).availableProjectIds, []);
    const result = await withAvailabilityTransaction(db, (tx) => registerProjectResultIn(tx, { userId: f!.userId, owner: f!.id, repo: "second", branch: "main" }));
    assert.equal(result.status, "created"); if (result.status !== "created") throw new Error("missing second project");
    const cap = await createNextDeps(db).usageCap(result.projectId);
    assert.ok(cap?.code === "USAGE_LIMIT_REACHED");
    const retained = await db.user.findUniqueOrThrow({ where: { id: f.userId } });
    assert.equal(retained.usageRunCount, 20);
    assert.equal(retained.usageWindowStartedAt?.getTime(), usageAnchor.getTime());
    assert.equal(await db.agentRun.count({ where: { projectId: f.projectId } }), 1);
    const full = await reconnectProject(db, { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 3 });
    assert.equal(full.status === "error" && full.code, "capped");
  } finally { gate.release(); await Promise.allSettled([pending]); await cleanup(db, f?.userId); await pool.disconnect(); }
});

it("serializes disconnect with both token issuers in either lock order without leaving a usable credential", async () => {
  for (const issue of [issueProjectToken, issueProjectOwnerToken]) for (const disconnectFirst of [true, false]) {
    const pool = connections(2); const [a, b] = pool.all; const gate = checkpoint(); let f: Fixture | undefined;
    let first: Promise<unknown> | undefined; let second: Promise<unknown> | undefined;
    try {
      f = await connectionFixture(a);
      const input = { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 1 };
      const tokenInput = { userId: f.userId, projectId: f.projectId, label: "competing" };
      const held = afterOwnerLock(a, gate.hook);
      first = disconnectFirst ? disconnectProject(held, input) : issue(held, tokenInput);
      await gate.entered();
      const observed = observeOwnerLock(b);
      second = disconnectFirst ? issue(observed.client, tokenInput) : disconnectProject(observed.client, input);
      await observed.attempted;
      gate.release(); const [firstResult, secondResult] = await Promise.all([first, second]);
      const issuance = (disconnectFirst ? secondResult : firstResult) as Awaited<ReturnType<typeof issue>>;
      assert.equal(issuance.ok, !disconnectFirst);
      if (!issuance.ok) assert.equal(issuance.reason, DISCONNECTED_REASON);
      const tokens = issue === issueProjectToken ? await a.projectToken.findMany({ where: { projectId: f.projectId } }) : await a.ownerToken.findMany({ where: { projectId: f.projectId } });
      assert.equal(tokens.length, disconnectFirst ? 0 : 1); assert.ok(tokens.every((token) => token.revokedAt !== null));
      assert.equal(await a.projectAvailabilityEvent.count({ where: { ownerUserId: f.userId, reason: "disconnect-project" } }), 1);
    } finally { gate.release(); await Promise.allSettled([first, second]); await cleanup(a, f?.userId); await pool.disconnect(); }
  }
});

it("serializes registration, plan changes and project selection against disconnect in both orders", async () => {
  for (const operation of ["register", "plan", "select"] as const) for (const disconnectFirst of [true, false]) {
    const pool = connections(2); const [a, b] = pool.all; const gate = checkpoint(); let f: Fixture | undefined;
    let first: Promise<unknown> | undefined; let second: Promise<unknown> | undefined;
    try {
      f = await connectionFixture(a);
      const input = { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 1 };
      const other = (client: TransactionHost) => operation === "register"
        ? withAvailabilityTransaction(client, (tx) => registerProjectResultIn(tx, { userId: f!.userId, owner: f!.id, repo: f!.id, branch: "main" }))
        : operation === "plan" ? changeUserPlan(client, { userId: f!.userId, plan: "max", note: "test" })
        : selectProjectForUse(client, input);
      const held = afterOwnerLock(a, gate.hook);
      first = disconnectFirst ? disconnectProject(held, input) : other(held);
      await gate.entered();
      const observed = observeOwnerLock(b);
      second = disconnectFirst ? other(observed.client) : disconnectProject(observed.client, input);
      await observed.attempted;
      gate.release(); await Promise.all([first, second]);
      assert.equal((await readProjectAccess(a, f.projectId)).available, false);
      assert.equal(await a.project.count({ where: { ownerUserId: f.userId } }), 1);
      assert.equal(await a.projectAvailabilityEvent.count({ where: { ownerUserId: f.userId, reason: "disconnect-project" } }), 1);
    } finally { gate.release(); await Promise.allSettled([first, second]); await cleanup(a, f?.userId); await pool.disconnect(); }
  }
});

it("serializes reconnection and new registration at the Free cap in both orders", async () => {
  for (const reconnectFirst of [true, false]) {
    const pool = connections(2); const [a, b] = pool.all; const gate = checkpoint(); let f: Fixture | undefined;
    let first: Promise<unknown> | undefined; let second: Promise<unknown> | undefined;
    try {
      f = await connectionFixture(a);
      await disconnectProject(a, { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 1 });
      await changeUserPlan(a, { userId: f.userId, plan: "free" });
      const version = (await a.user.findUniqueOrThrow({ where: { id: f.userId } })).projectAvailabilityVersion;
      const input = { userId: f.userId, targetProjectId: f.projectId, expectedVersion: version };
      const registration = (client: TransactionHost) => withAvailabilityTransaction(client, (tx) => registerProjectResultIn(tx, { userId: f!.userId, owner: f!.id, repo: "new", branch: "main" }));
      const held = afterOwnerLock(a, gate.hook);
      first = reconnectFirst ? reconnectProject(held, input) : registration(held);
      await gate.entered();
      const observed = observeOwnerLock(b);
      second = reconnectFirst ? registration(observed.client) : reconnectProject(observed.client, input);
      await observed.attempted; gate.release();
      const results = await Promise.all([first, second]);
      assert.equal((results[0] as { status: string }).status, reconnectFirst ? "success" : "created");
      assert.equal((results[1] as { status: string }).status, reconnectFirst ? "capped" : "stale");
      assert.equal(await a.project.count({ where: { ownerUserId: f.userId, disconnectedAt: null } }), 1);
      assert.equal((await a.user.findUniqueOrThrow({ where: { id: f.userId } })).projectAvailabilityVersion, version + 1);
      assert.equal(await a.projectAvailabilityEvent.count({ where: { ownerUserId: f.userId, version: { gt: version } } }), 1);
    } finally { gate.release(); await Promise.allSettled([first, second]); await cleanup(a, f?.userId); await pool.disconnect(); }
  }
});

it("registers a case-insensitive repository once when two requests compete", async () => {
  const pool = connections(2); const [a, b] = pool.all; const gate = checkpoint(); let f: Fixture | undefined;
  let first: Promise<unknown> | undefined; let second: Promise<unknown> | undefined;
  try {
    f = await connectionFixture(a);
    await disconnectProject(a, { userId: f.userId, targetProjectId: f.projectId, expectedVersion: 1 });
    await changeUserPlan(a, { userId: f.userId, plan: "free" });
    const version = (await a.user.findUniqueOrThrow({ where: { id: f.userId } })).projectAvailabilityVersion;
    const input = { userId: f.userId, owner: f.id, repo: "NewRepo", branch: "main" };
    first = withAvailabilityTransaction(afterOwnerLock(a, gate.hook), (tx) => registerProjectResultIn(tx, input));
    await gate.entered(); const observed = observeOwnerLock(b);
    second = withAvailabilityTransaction(observed.client, (tx) => registerProjectResultIn(tx, { ...input, owner: input.owner.toUpperCase(), repo: input.repo.toLowerCase() }));
    await observed.attempted; gate.release();
    const [created, existing] = await Promise.all([first, second]) as Awaited<ReturnType<typeof registerProjectResultIn>>[];
    assert.equal(created.status, "created"); assert.equal(existing.status, "existing");
    assert.ok("projectId" in created && "projectId" in existing); assert.equal(existing.projectId, created.projectId);
    assert.equal(await a.project.count({ where: { ownerUserId: f.userId, disconnectedAt: null } }), 1);
    assert.equal((await a.user.findUniqueOrThrow({ where: { id: f.userId } })).projectAvailabilityVersion, version + 1);
    assert.equal(await a.projectAvailabilityEvent.count({ where: { ownerUserId: f.userId, version: { gt: version } } }), 1);
  } finally { gate.release(); await Promise.allSettled([first, second]); await cleanup(a, f?.userId); await pool.disconnect(); }
});
