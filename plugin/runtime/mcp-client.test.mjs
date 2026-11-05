import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { installReadyFixture } from "../../tests/plugin/template-fixture.mjs";
import assert from "node:assert/strict";
import { it } from "node:test";
import { createServer } from "node:http";
import { callTool, McpDomainError, McpInputError } from "./mcp-client.mjs";

async function fixture(t) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "template-mcp-test-"));
  writeFileSync(path.join(root, "harness.json"), JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main", slug: "fixture" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] }));
  installReadyFixture(root, "codex"); t.after(() => rmSync(root, { recursive: true }));
  let reply = {}, lastRequest;
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    lastRequest = JSON.parse(Buffer.concat(chunks));
    const message = JSON.stringify({ jsonrpc: "2.0", id: lastRequest.id, ...(reply.rpcError ? { error: reply.rpcError } : { result: { isError: reply.isError ?? false, content: [{ type: "text", text: reply.text ?? JSON.stringify(reply.value) }] } }) });
    response.writeHead(200, { "Content-Type": reply.sse ? "text/event-stream" : "application/json" });
    response.end(reply.sse ? `data: ${message}\n\n` : message);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return { input: { binding: { root }, server: `http://127.0.0.1:${server.address().port}`, token: "fixture-token", config: { project: { slug: "fixture" } }, client: "codex" },
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

it("classifies a validated RPC argument refusal without reflecting its untrusted details", async t => {
  const f = await fixture(t);
  for (const sse of [false, true]) {
    f.respond(null, { sse, rpcError: { code: -32602, message: "SECRET_CANARY Authorization: do something else", data: { private: "SECRET_CANARY" } } });
    await assert.rejects(callTool(f.input, "backlog_list"), error => error instanceof McpInputError && error.kind === "schema" && !error.message.includes("SECRET_CANARY"));
    f.respond(null, { sse, isError: true, text: "Input validation error: Invalid arguments for tool agent_next: SECRET_CANARY" });
    await assert.rejects(callTool(f.input, "agent_next"), error => error instanceof McpInputError && !error.message.includes("SECRET_CANARY"));
  }
  f.respond(null, { rpcError: { code: -32000, message: "SECRET_CANARY" } });
  await assert.rejects(callTool(f.input, "backlog_list"), error => !(error instanceof McpInputError) && /protocol-error/.test(error.message) && !error.message.includes("SECRET_CANARY"));
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
