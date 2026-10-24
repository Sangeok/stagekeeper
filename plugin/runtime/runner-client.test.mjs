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
