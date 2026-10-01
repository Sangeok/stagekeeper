// Real Next HTTP acceptance. Use a fresh build and an isolated test database.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import { validateTestDatabase } from "./test-server-integration.mjs";

async function main(): Promise<void> {
  config({ quiet: true });
  const url = validateTestDatabase(process.env);
  process.env.DATABASE_URL = url;
  const { connections, fixture, cleanup } = await import("../tests/server/integration/support");
  const pool = connections(1); const [db] = pool.all;
  const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
  const secret = randomBytes(32).toString("hex");
  const origin = "http://127.0.0.1:55440";
  const cookieName = "authjs.session-token";
  let server: ChildProcess | undefined;

  try {
    const owner = await fixture(db); fixtures.push(owner);
    const foreign = await fixture(db); fixtures.push(foreign);
    const session = async (userId: string) => `${cookieName}=${await encode({ token: { uid: userId, name: "fixture" }, secret, salt: cookieName, maxAge: 3600 })}`;
    const ownedCookie = await session(owner.userId); const foreignCookie = await session(foreign.userId);
    const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { filename?: string; exportedName?: string }> };
    const action = Object.entries(manifest.node).find(([, entry]) => entry.filename === "src/fsd/features/edit-pipeline/api/automatic-scout.server.ts" && entry.exportedName === "saveAutomaticScout")?.[0];
    assert.ok(action, "Build the current source before running acceptance");
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "55440"], {
      env: { ...process.env, DATABASE_URL: url, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true" }, stdio: "ignore", windowsHide: true,
    });
    let started = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Local Next server exited before startup");
      try { if ((await fetch(`${origin}/login`, { redirect: "manual" })).status === 200) { started = true; break; } } catch { /* Listener is still starting. */ }
      await delay(100);
    }
    assert.ok(started, "Local Next server did not start");
    const path = `${origin}/p/${owner.id}/pipeline`;
    const get = async () => {
      const response = await fetch(path, { headers: { cookie: ownedCookie } });
      assert.equal(response.status, 200); return response.text();
    };
    const post = async (enabled: unknown, cookie?: string) => {
      const response = await fetch(path, { method: "POST", redirect: "manual", headers: {
        origin, "next-action": action, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component",
        ...(cookie ? { cookie } : {}),
      }, body: JSON.stringify([owner.id, enabled]) });
      return { status: response.status, text: await response.text() };
    };
    const state = () => db.project.findUniqueOrThrow({ where: { id: owner.projectId }, select: { autoScoutEnabled: true } });
    const initial = await get();
    assert.match(initial, /Before picking an item/); assert.match(initial, /role="switch".*aria-checked="true"/);
    assert.match(initial, /Pipeline editing opens on Pro/);
    const disabled = await post(false, ownedCookie);
    assert.equal(disabled.status, 200); assert.match(disabled.text, /"success":true,"data":false/);
    assert.equal((await state()).autoScoutEnabled, false);
    const reloaded = await get();
    assert.match(reloaded, /role="switch".*aria-checked="false"/); assert.match(reloaded, /Add an item on the Backlog tab to continue/);
    assert.equal(await db.pipelineVersion.count({ where: { projectId: owner.projectId } }), 0, "The switch never creates a graph version");
    const invalid = await post("false", ownedCookie);
    assert.equal(invalid.status, 200); assert.match(invalid.text, /Choose whether automatic scouting is on or off/);
    const forbidden = await post(true, foreignCookie);
    assert.ok(forbidden.status === 404 || forbidden.text.includes("NEXT_HTTP_ERROR_FALLBACK;404"));
    assert.equal((await state()).autoScoutEnabled, false);
    const guest = await post(true);
    assert.ok([303, 307].includes(guest.status) || guest.text.includes("/login"));
    assert.equal((await state()).autoScoutEnabled, false);
    const enabled = await post(true, ownedCookie);
    assert.equal(enabled.status, 200); assert.equal((await state()).autoScoutEnabled, true);
    await db.project.update({ where: { id: owner.projectId }, data: { available: false } });
    const unavailable = await post(false, ownedCookie);
    assert.equal(unavailable.status, 200); assert.match(unavailable.text, /not selected for use/);
    assert.equal((await state()).autoScoutEnabled, true);
    console.log("Automatic scout HTTP acceptance passed: Free switch, reload, invalid input, owner scope, guest and unavailable-project guards.");
  } finally {
    if (server && server.exitCode === null) {
      const stopped = new Promise<void>((resolve) => server!.once("exit", () => resolve()));
      server.kill(); await stopped;
    }
    for (const f of fixtures) await cleanup(db, f.userId);
    await pool.disconnect();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
