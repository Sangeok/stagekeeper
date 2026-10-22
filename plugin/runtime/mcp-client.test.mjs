import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "node:http";
import { callTool, McpDomainError } from "./mcp-client.mjs";

async function fixture(t) {
  let reply = {}, lastRequest;
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    lastRequest = JSON.parse(Buffer.concat(chunks));
    const message = JSON.stringify({ jsonrpc: "2.0", id: lastRequest.id, result: { isError: reply.isError ?? false, content: [{ type: "text", text: JSON.stringify(reply.value) }] } });
    response.writeHead(200, { "Content-Type": reply.sse ? "text/event-stream" : "application/json" });
    response.end(reply.sse ? `data: ${message}\n\n` : message);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return { input: { server: `http://127.0.0.1:${server.address().port}`, token: "fixture-token", config: { project: { slug: "fixture" } }, client: "codex" },
    respond(value, options = {}) { reply = { value, ...options }; }, request: () => lastRequest };
}

it("reads empty and populated backlog/board arrays over JSON and SSE with project scope", async t => {
  const f = await fixture(t);
  for (const name of ["backlog_list", "board_list"]) for (const sse of [false, true]) for (const value of [[], [{ key: "A" }]]) {
    f.respond(value, { sse });
    assert.deepEqual(await callTool(f.input, name), value);
    assert.deepEqual(f.request().params, { name, arguments: { project: "fixture" } });
  }
});

it("rejects malformed lists and preserves object-only runtime and domain failure contracts", async t => {
  const f = await fixture(t);
  for (const value of [{}, [null], [[]], ["A"]]) {
    f.respond(value); await assert.rejects(callTool(f.input, "backlog_list"), /protocol-error/);
  }
  f.respond([]); await assert.rejects(callTool(f.input, "agent_next"), /protocol-error/);
  f.respond({ error: "unavailable" }, { isError: true });
  await assert.rejects(callTool(f.input, "backlog_list"), error => error instanceof McpDomainError && error.body.error === "unavailable");
});
