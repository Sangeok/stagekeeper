import assert from "node:assert/strict";
import { it } from "node:test";
import { request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { roleBridge } from "./codex-thread.mjs";
import { ROLE_TOOLS } from "./codex-agent.mjs";

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
