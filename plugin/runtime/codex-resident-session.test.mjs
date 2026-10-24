import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { connectionInput } from "./mcp-client.mjs";
import { atomicWrite, readState, startSession, stateFiles } from "./local-session.mjs";

it("checks Codex resident ownership through the actual CLI without a legacy 404 fallback and stops with the stored client", async () => {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "codex-resident-session-")), token = "hu_" + "x".repeat(43), previous = process.env.HARNESS_TOKEN;
  const helper = fileURLToPath(new URL("../bin/harness-session.mjs", import.meta.url)), requests = [];
  let status = 200, body = {};
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString())); response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    execFileSync("git", ["init", "-q", "--initial-branch=fixture"], { cwd: root, windowsHide: true });
    writeFileSync(path.join(root, "harness.json"), JSON.stringify({ version: 1, project: { owner: "test", repo: "test", branch: "fixture", slug: "test" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] }));
    mkdirSync(path.join(root, "docs/harness"), { recursive: true });
    writeFileSync(path.join(root, "docs/harness/codex-package.json"), JSON.stringify({ client: "codex", protocol: "harness-runtime-v1", runbook: "a".repeat(12) }));
    process.env.HARNESS_TOKEN = token;
    const input = connectionInput(root, { client: "codex", server: `http://127.0.0.1:${server.address().port}` });
    const files = stateFiles(path.join(root, ".git/harness")), started = await startSession(files, input.binding, { client: "codex", commit: true, propose: false });
    const state = readState(files); state.lock.mode = "resident"; state.lock.runnerLease = true; atomicWrite(files.lock, state.lock);
    const run = async op => {
      const result = await promisify(execFile)(process.execPath, [helper, "--" + op, "--root", root, "--session", started.session,
        ...(op === "check" ? ["--server", input.server] : [])], { windowsHide: true, env: { ...process.env, HARNESS_TOKEN: token } }).catch(error => error);
      return JSON.parse(result.stdout.trim());
    };
    for (const code of [200, 404, 409]) {
      status = code; body = code === 409 ? { code: "RUNNER_REPLACED" } : { ok: true };
      assert.equal((await run("check")).code, "resident-lease-unconfirmed");
    }
    status = 200; body = { ok: true, paused: true, binding: { session: started.session, client: "codex", mode: "resident", permission: "scoped" } };
    const current = await run("check"); assert.equal(current.event, "owned"); assert.equal(current.paused, true);
    assert.equal((await run("stop")).event, "stopping"); assert.equal((await run("release")).event, "released");
    assert.equal(requests.length, 5); assert.ok(requests.every(value => value.client === "codex" && value.session === started.session));
    assert.equal(requests.at(-1).op, "stop"); assert.equal(readState(files), null);
  } finally {
    if (previous === undefined) delete process.env.HARNESS_TOKEN; else process.env.HARNESS_TOKEN = previous;
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true });
  }
});
