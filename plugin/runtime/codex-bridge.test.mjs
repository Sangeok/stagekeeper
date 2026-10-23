import assert from "node:assert/strict";
import { it } from "node:test";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { roleBridge } from "./codex-thread.mjs";
import { ROLE_TOOLS } from "./codex-agent.mjs";
import { createRoleCommands } from "./role-commands.mjs";
import { z } from "zod";

it("distinguishes correctable command parameters from ownership and filesystem refusals", async t => {
  let active = true;
  const receipt = { runId: "r", revision: 0, stepId: "verify" };
  const backend = await createRoleCommands({ root: "", agent: "plan-verifier", runtime: {}, fileBroker: {
    tools: [{ name: "role_file_read", inputSchema: { type: "object" } }],
    call: () => { throw new Error("private filesystem diagnostic"); }, close: () => {},
  } });
  const bridge = await roleBridge({ binding: {} }, {}, "s", { agent: "plan-verifier", project: "p" }, {
    listTools: async () => ROLE_TOOLS["plan-verifier"].map(name => ({ name })),
    checkSession: async () => ({ event: "owned", lifecycle: active ? "active" : "stopping", client: "codex" }),
    callTool: async () => ({ done: false, step: "verify", receipt }),
  }, backend);
  t.after(() => bridge.close());
  const call = (name, args) => fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }).then(response => response.json());
  const malformed = { command: "node verify.cjs", timeoutMs: 120001 };
  assert.equal((await call("role_command_exec", malformed)).error.code, -32000);
  assert.equal((await call("agent_next", {})).error, undefined);
  const corrected = await call("role_command_exec", malformed);
  assert.equal(corrected.error.code, -32602); assert.match(corrected.error.message, /100 through 120000/);
  assert.equal((await call("agent_next", {})).error, undefined);
  assert.equal((await call("role_command_exec", { ...malformed, project: "other" })).error.code, -32000);
  const denied = await call("role_file_read", {});
  assert.equal(denied.error.code, -32000); assert.doesNotMatch(denied.error.message, /private filesystem/);
  active = false;
  assert.equal((await call("role_command_exec", malformed)).error.code, -32000);
});

it("omits absent binding IDs and binds subsequent calls to the server-issued run", async t => {
  const entry = { runId: "pipeline", entryId: "entry", slotId: "verify" };
  const receipt = { runId: "agent-run", revision: 0, stepId: "start" }, calls = [];
  const schema = z.object({ agentRunId: z.string().optional(), entry: z.object({ runId: z.string(), entryId: z.string(), slotId: z.string() }) });
  const bridge = await roleBridge({ binding: {} }, {}, "session", { agent: "plan-verifier", project: "p", agentKey: "K-1", entry }, {
    listTools: async () => ROLE_TOOLS["plan-verifier"].map(name => ({ name })),
    checkSession: async () => ({ event: "owned", lifecycle: "active", client: "codex" }),
    callTool: async (_input, _name, args) => {
      schema.parse(args); calls.push(args);
      return { done: false, step: "start", receipt, entry, agentRunId: receipt.runId };
    },
  });
  t.after(() => bridge.close());
  const call = args => fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "agent_next", arguments: { project: "p", agent: "plan-verifier", key: "K-1", ...args } } }) }).then(response => response.json());
  assert.equal((await call({ entry, agentRunId: null })).error, undefined);
  assert.equal(Object.hasOwn(calls[0], "agentRunId"), false);
  assert.equal((await call({ entry: null, agentRunId: null, outcome: "ok", receipt })).error, undefined);
  assert.equal(calls[1].agentRunId, receipt.runId);
  assert.deepEqual(calls[1].entry, entry);
  assert.ok((await call({ agentRunId: "another-run" })).error);
  assert.ok((await call({ entry: { ...entry, entryId: "another-entry" } })).error);
  assert.equal(calls.length, 2);
});

async function fixture(t, execute = async () => ({ text: "allowed" })) {
  const receipt = { runId: "r", revision: 0, stepId: "audit" }, calls = [];
  const bridge = await roleBridge({ binding: {} }, {}, "session", { agent: "doc-auditor", project: "p" }, {
    listTools: async () => ROLE_TOOLS["doc-auditor"].map(name => ({ name })),
    checkSession: async () => ({ event: "owned", lifecycle: "active", client: "codex" }),
    callTool: async (_input, name, args) => {
      calls.push({ name, args });
      if (name === "agent_next") return args.outcome ? { done: true } : { done: false, step: "audit", receipt };
      return execute(args);
    },
  });
  t.after(() => bridge.close());
  let id = 0;
  const call = (name, args = {}) => fetch(bridge.url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }) }).then(response => response.json());
  await call("agent_next");
  return { bridge, call, calls, receipt };
}

it("accepts overlapping HTTP bodies and serializes legitimate tool calls", async t => {
  let active = 0, peak = 0;
  const f = await fixture(t, async () => { peak = Math.max(peak, ++active); await delay(10); active--; return { text: "allowed" }; });
  const bodies = [];
  const responses = [1, 2, 3].map(id => new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "backlog_list", arguments: {} } });
    const req = request(f.bridge.url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, response => {
      const chunks = []; response.on("data", chunk => chunks.push(chunk)); response.on("end", () => resolve(JSON.parse(Buffer.concat(chunks))));
    });
    req.on("error", reject); req.flushHeaders(); bodies.push(() => req.end(body));
  }));
  await delay(30); bodies.forEach(send => send());
  for (const response of await Promise.all(responses)) assert.equal(response.error, undefined);
  assert.equal(peak, 1);
  assert.equal(f.calls.filter(call => call.name === "backlog_list").length, 3);
});

it("rechecks a queued terminal outcome against the latest completed state", async t => {
  const f = await fixture(t);
  const replies = await Promise.all([f.call("agent_next", { outcome: "ok", receipt: f.receipt }), f.call("agent_next", { outcome: "ok", receipt: f.receipt })]);
  assert.equal(replies.filter(value => value.error).length, 1);
  assert.equal(f.calls.filter(call => call.args.outcome).length, 1);
});

it("cancels queued requests after stop and discards the in-flight result", async t => {
  let enter, finish;
  const entered = new Promise(resolve => { enter = resolve; }), blocked = new Promise(resolve => { finish = resolve; });
  const f = await fixture(t, async () => { enter(); await blocked; return { text: "late" }; });
  const first = f.call("backlog_list"); await entered;
  const second = f.call("backlog_list"); await delay(30);
  f.bridge.abort(); finish();
  for (const reply of await Promise.all([first, second])) assert.ok(reply.error);
  assert.equal(f.calls.filter(call => call.name === "backlog_list").length, 1);
});
