// Fresh production build + isolated TEST_DATABASE_URL. No production credentials.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { PIPELINE_EDIT_PLAN_GATE } from "@harness/core/pipeline.mjs";
import { validateTestDatabase } from "./test-server-integration.mjs";

async function main(): Promise<void> {
  config({ quiet: true });
  const url = validateTestDatabase(process.env); process.env.DATABASE_URL = url;
  const { connections, fixture, cleanup, pipelineState } = await import("../tests/server/integration/support");
  const pool = connections(1), [db] = pool.all;
  const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
  const secret = randomBytes(32).toString("hex"), cookieName = "authjs.session-token";
  const reservation = createServer();
  await new Promise<void>(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const address = reservation.address(); assert.ok(address && typeof address !== "string");
  const port = address.port; await new Promise<void>(resolve => reservation.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  let server: ChildProcess | undefined;
  try {
    const owner = await fixture(db, { plan: "pro", status: "proposed" }); fixtures.push(owner);
    const foreign = await fixture(db, { plan: "pro" }); fixtures.push(foreign);
    await db.boardItem.delete({ where: { id: owner.boardItemId } });
    const session = async (userId: string) => `${cookieName}=${await encode({ token: { uid: userId, name: "fixture" }, secret, salt: cookieName, maxAge: 3600 })}`;
    const ownedCookie = await session(owner.userId), foreignCookie = await session(foreign.userId);
    const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { filename?: string; exportedName?: string }> };
    const mutations = ["savePipeline", "archivePipelineAction", "renamePipelineAction", "setDefaultPipelineAction", "setPipelineRuleAction", "setAutomaticPickAction", "proposeItem", "changeItemPipeline"];
    const ids = new Map(mutations.map(name => {
      const match = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === name && entry.filename?.startsWith("src/fsd/features/"));
      assert.ok(match, `Build current source: missing ${name}`); return [name, match[0]];
    }));
    assert.ok(!Object.values(manifest.node).some(entry => ["loadPipelinesView", "loadItemPipelineView", "loadPipelineChanges"].includes(entry.exportedName ?? "")));
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      env: { ...process.env, DATABASE_URL: url, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true" }, stdio: "ignore", windowsHide: true,
    });
    let started = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Local Next server exited before startup");
      try { if ((await fetch(`${origin}/login`, { redirect: "manual" })).status === 200) { started = true; break; } } catch { /* Starting. */ }
      await delay(100);
    }
    assert.ok(started, "Local Next server did not start");
    const get = async (tab: string) => {
      const response = await fetch(`${origin}/p/${owner.id}/${tab}`, { headers: { cookie: ownedCookie } });
      assert.equal(response.status, 200, tab); return response.text();
    };
    const post = async (name: string, args: unknown[], cookie: string | undefined = ownedCookie) => {
      const response = await fetch(`${origin}/p/${owner.id}/pipeline`, { method: "POST", redirect: "manual", headers: {
        origin, "next-action": ids.get(name)!, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", ...(cookie ? { cookie } : {}),
      }, body: JSON.stringify([owner.id, ...args]) });
      return { status: response.status, text: await response.text() };
    };
    const accepted = async (name: string, args: unknown[]) => {
      const result = await post(name, args); assert.equal(result.status, 200, name);
      assert.match(result.text, name === "savePipeline" ? /"status":"success"/ : /"success":true/, `${name}: ${result.text.slice(-1000)}`);
    };
    const beforeGet = await pipelineState(db, owner.projectId);
    const initial = await get("pipeline"); assert.match(initial, /Runs items/); assert.match(initial, /Automatic picking/);
    assert.match(await get("backlog"), /Put on the board/); await get(""); await get("history");
    assert.deepEqual(await pipelineState(db, owner.projectId), beforeGet, "GETs must not materialize defaults");
    const save = (name: string, steps: string[], gates: string[] = []) => accepted("savePipeline", [{ pipelineId: null, name, definition: { steps, gates }, expectedVersion: 0 }]);
    await save("Checks", ["qa"]); await save("Hotfix", ["plan", "implement", "accept"], ["before-plan"]);
    const hotfix = await db.pipeline.findFirstOrThrow({ where: { projectId: owner.projectId, name: "Hotfix" } });
    const fragment = await db.pipeline.findFirstOrThrow({ where: { projectId: owner.projectId, name: "Checks" } });
    const defaultId = `default_${owner.projectId}`;
    await accepted("renamePipelineAction", [hotfix.id, "Quick fixes"]);
    await accepted("setDefaultPipelineAction", [hotfix.id]); await accepted("setPipelineRuleAction", ["fix", hotfix.id]);
    await accepted("setAutomaticPickAction", [false]); await accepted("archivePipelineAction", [fragment.id]);
    await accepted("setDefaultPipelineAction", [defaultId]);
    const updated = await get("pipeline"); assert.match(updated, /Quick fixes/); assert.match(updated, /Automatic picking is off/);
    assert.equal((await db.pipeline.findUniqueOrThrow({ where: { id: fragment.id } })).archivedAt !== null, true);
    const configuration: [string, unknown[]][] = [
      ["savePipeline", [{ pipelineId: null, name: "Denied", definition: { steps: ["qa"], gates: [] }, expectedVersion: 0 }]],
      ["archivePipelineAction", [hotfix.id]], ["renamePipelineAction", [hotfix.id, "Denied"]], ["setDefaultPipelineAction", [hotfix.id]],
      ["setPipelineRuleAction", ["fix", null]], ["setAutomaticPickAction", [true]],
    ];
    await db.subscription.update({ where: { userId: owner.userId }, data: { plan: "free" } });
    const freeBefore = await pipelineState(db, owner.projectId);
    for (const [name, args] of configuration) { const result = await post(name, args); assert.equal(result.status, 200); assert.ok(result.text.includes(PIPELINE_EDIT_PLAN_GATE), name); }
    assert.deepEqual(await pipelineState(db, owner.projectId), freeBefore);
    const propose = [{ key: owner.key, pipelineId: hotfix.id, agent: "dev", reason: "owner" }];
    await accepted("proposeItem", propose);
    const item = await db.boardItem.findFirstOrThrow({ where: { projectId: owner.projectId }, include: { run: true } });
    assert.equal(item.status, "proposed"); assert.ok(item.run);
    const change = [{ key: owner.key, pipelineId: defaultId, expectedUpdatedAt: item.updatedAt.toISOString() }];
    await accepted("changeItemPipeline", change);
    const changed = await db.pipelineRun.findUniqueOrThrow({ where: { id: item.run.id }, include: { version: true } });
    assert.equal(changed.version.pipelineId, defaultId); assert.notEqual(changed.entryId, item.run.entryId);
    const stale = await post("changeItemPipeline", change); assert.match(stale.text, /The board changed. Refresh and try again./);
    assert.match(await get(`items/${owner.key}`), /Pipeline changed/); assert.match(await get("history?mode=events"), /Pipeline changed/);
    assert.match(await get(`history?item=${owner.key}`), /Pipeline changed/);
    assert.match(await get(""), /Default/);
    const all = [...configuration, ["proposeItem", propose], ["changeItemPipeline", change]] as [string, unknown[]][];
    await db.subscription.update({ where: { userId: owner.userId }, data: { plan: "pro" } });
    for (const guard of ["foreign", "unavailable", "disconnected"] as const) {
      if (guard !== "foreign") await db.project.update({ where: { id: owner.projectId }, data: { available: false, disconnectedAt: guard === "disconnected" ? new Date() : null } });
      const before = await pipelineState(db, owner.projectId);
      for (const [name, args] of all) {
        const result = await post(name, args, guard === "foreign" ? foreignCookie : ownedCookie);
        if (guard === "foreign") assert.ok(result.status === 404 || result.text.includes("NEXT_HTTP_ERROR_FALLBACK;404"), name);
        else { assert.equal(result.status, 200, name); assert.match(result.text, guard === "unavailable" ? /not selected for use/ : /disconnected/i, name); }
      }
      assert.deepEqual(await pipelineState(db, owner.projectId), before, guard);
    }
    const guest = await post("setAutomaticPickAction", [true], ""); assert.ok([303, 307].includes(guest.status) || guest.text.includes("/login"));
    console.log("Multiple pipelines HTTP acceptance passed: eight real actions, owner/foreign/guest, Free editing refusal and item selection/change, unavailable/disconnected zero-write, five page bodies, stale, fresh manifest and read-only GETs.");
  } finally {
    if (server && server.exitCode === null) { const stopped = new Promise<void>(resolve => server!.once("exit", () => resolve())); server.kill(); await stopped; }
    for (const f of fixtures) await cleanup(db, f.userId); await pool.disconnect();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
