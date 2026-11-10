import assert from "node:assert/strict";
import { createServer } from "node:http";
import { it } from "node:test";
import { runnerCall } from "./runner-client.mjs";

it("requires a matching Codex binding from actual HTTP start and beat responses", async () => {
  const session = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const binding = { session, client: "codex", mode: "resident", permission: "scoped" };
  let body = {}, status = 200;
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const target = { server: `http://127.0.0.1:${server.address().port}`, token: "test-only", project: "fixture" };
  try {
    for (const op of ["start", "beat"]) {
      const payload = { op, client: "codex", session };
      for (const wrong of [undefined, null, {}, { ...binding, session: "other" }, { ...binding, client: "claude" },
        { ...binding, mode: "session" }, { ...binding, permission: "auto" }]) {
        body = { ok: true, binding: wrong };
        assert.equal((await runnerCall(target, payload)).kind, "refused");
      }
      body = { ok: true, paused: true, stop: "plan", binding };
      assert.deepEqual(await runnerCall(target, payload), { kind: "ok", paused: true, stop: "plan", binding });
    }
    body = { ok: true };
    assert.deepEqual(await runnerCall(target, { op: "start", session }), { kind: "ok", paused: false, stop: null });
    assert.deepEqual(await runnerCall(target, { op: "stop", client: "codex", session }), { kind: "ok", paused: false, stop: null });
    for (const code of [400, 404]) {
      status = code;
      assert.equal((await runnerCall(target, { op: "start", client: "codex", session })).kind, code === 404 ? "missing" : "refused");
    }
    assert.ok(requests.every(request => request.project === "fixture"));
    assert.equal(requests.filter(request => request.client === "claude").length, 0);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

it("reads the server's next-beat seconds within one minute and one hour, and drops anything else", async () => {
  const session = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let body = {};
  const server = createServer(async (request, response) => {
    for await (const chunk of request) void chunk;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const target = { server: `http://127.0.0.1:${server.address().port}`, token: "test-only", project: "fixture" };
  try {
    const cases = [[900, 900_000], [60, 60_000], [5, 60_000], [7200, 3_600_000], [1.5, undefined], [0, undefined], ["900", undefined], [null, undefined]];
    for (const [nextBeatIn, expected] of cases) {
      body = { ok: true, paused: false, nextBeatIn };
      const result = await runnerCall(target, { op: "beat", session, state: "idle" });
      assert.equal(result.kind, "ok");
      assert.equal(result.nextBeatMs, expected, `nextBeatIn ${JSON.stringify(nextBeatIn)}`);
    }
    body = { ok: true, paused: false };
    assert.deepEqual(await runnerCall(target, { op: "beat", session, state: "idle" }), { kind: "ok", paused: false, stop: null });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
