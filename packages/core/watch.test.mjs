import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STUCK_AFTER, actionableWork, hasWork, nextWatchState, parseToolResponse, workSignature } from "./watch.mjs";

const policy = { commit: false, propose: false };
const head = { action: "none", reason: "No candidates." };
const dispatch = (extra = {}) => ({ key: "ITEM-01", node: "plan", version: 1, action: "dispatch", agent: "dev", hint: "Plan.", format: null, ...extra });
const overview = (items = [], extra = {}) => ({ head, items, ...extra });
const response = (value, extra = {}) => ({ jsonrpc: "2.0", id: "ours", result: { content: [{ type: "text", text: JSON.stringify(value) }] }, ...extra });
const parse = (value) => parseToolResponse("application/json; charset=utf-8", JSON.stringify(value), "ours");
const freshState = { lastSignature: null, repeats: 0, stuck: false };

describe("watch MCP response parser", () => {
  it("reads the one JSON tool body", () => {
    assert.deepEqual(parse(response(overview())), { ok: true, value: overview() });
  });
  for (const newline of ["\n", "\r\n"]) it(`reads SSE boundaries and multi-line data (${JSON.stringify(newline)}) without selecting the last notification`, () => {
    const body = [": keepalive", "", "data: " + JSON.stringify(response({}, { id: "other" })), "",
      "event: message", 'data: {"jsonrpc":"2.0","id":"ours",',
      'data: "result":{"content":[{"type":"text","text":"{\\"ok\\":true}"}]}}', "",
      'data: {"jsonrpc":"2.0","method":"notifications/message","params":{}}', "", ""].join(newline);
    assert.deepEqual(parseToolResponse("text/event-stream", body, "ours"), { ok: true, value: { ok: true } });
  });
  for (const [name, contentType, body] of [
    ["HTML", "text/html", "<html>"], ["damaged JSON", "application/json", "{"],
    ["missing id", "application/json", JSON.stringify(response({}, { id: "other" }))],
    ["numeric id", "application/json", JSON.stringify(response({}, { id: 1 }))],
    ["wrong JSON-RPC version", "application/json", JSON.stringify(response({}, { jsonrpc: "1.0" }))],
    ["RPC error", "application/json", JSON.stringify({ jsonrpc: "2.0", id: "ours", error: { code: -1, message: "secret" } })],
    ["result plus error", "application/json", JSON.stringify(response({}, { error: {} }))],
    ["missing result", "application/json", '{"jsonrpc":"2.0","id":"ours"}'],
    ["duplicate id", "text/event-stream", `data: ${JSON.stringify(response({}))}\n\ndata: ${JSON.stringify(response({}))}\n\n`],
    ["damaged SSE data", "text/event-stream", "data: {\n\n"],
    ["two text blocks", "application/json", JSON.stringify(response({}, { result: { content: [{ type: "text", text: "{}" }, { type: "text", text: "{}" }] } }))],
    ["damaged tool body", "application/json", JSON.stringify(response({}, { result: { content: [{ type: "text", text: "{" }] } }))],
    ["non-boolean error flag", "application/json", JSON.stringify(response({}, { result: { isError: "false", content: [] } }))],
  ]) it(`rejects ${name}`, () => {
    assert.deepEqual(parseToolResponse(contentType, body, "ours"), { ok: false, error: { code: "protocol-error" } });
  });
  it("preserves a structured tool refusal as data, but rejects a malformed refusal", () => {
    const refusal = response({}, { result: { isError: true, content: [{ type: "text", text: '{"error":"not the owner of this project"}' }] } });
    assert.deepEqual(parse(refusal), { ok: false, error: { code: "access-refused", reason: "not the owner of this project" } });
    refusal.result.content[0].text = "{}";
    assert.equal(parse(refusal).error.code, "protocol-error");
  });
});

describe("watch overview validation and actionable work", () => {
  it("normalizes legacy dispatch and acceptance, preserving ordered items and stale runbook", () => {
    const work = actionableWork(overview([dispatch(), { key: "ITEM-02", node: "accept", version: 2, action: "accept", hint: "Reproduce checks." }],
      { runbook: { stale: true, note: "Run init." } }), policy);
    assert.deepEqual(work, { items: [
      { key: "ITEM-01", node: "plan", version: 1, action: "dispatch", agent: "dev", format: null, entry: null },
      { key: "ITEM-02", node: "accept", version: 2, action: "accept", agent: null, format: null, entry: null },
    ], head: null, runbookStale: true });
    assert.equal(hasWork(work), true);
  });
  it("filters head only: project-level scout slots remain ready with propose:no", () => {
    const entry = { runId: "run", entryId: "entry", slotId: "feature-scout#2" };
    const source = overview([dispatch({ node: "feature-scout#2", agent: "feature-scout", format: "slots-v1", entry })],
      { head: { action: "dispatch", agent: "pm", hint: "Propose." } });
    const work = actionableWork(source, policy);
    assert.deepEqual(work.items[0].entry, entry);
    assert.equal(work.head, null);
    assert.deepEqual(actionableWork(source, { ...policy, propose: true }).head, { agent: "pm" });
    assert.deepEqual(actionableWork(overview([], { head: { action: "dispatch", agent: "feature-scout", hint: "Scout." } }),
      { ...policy, propose: true }).head, { agent: "feature-scout" });
  });
  it("validates each waiting branch and done instead of treating unknown states as idle", () => {
    const work = actionableWork(overview([
      { key: "G", node: "before-plan", version: 1, action: "wait", on: "gate", gate: "before-plan", boundary: { from: "proposed", to: "planning" }, planCommit: null, format: "slots-v1", gateEntry: { runId: "r", entryId: "e" } },
      { key: "H", node: "plan", version: 1, action: "wait", on: "handoff", note: null },
      { key: "C", node: "plan", version: 1, action: "wait", on: "cap", reason: "Rate limited." },
      { key: "D", node: null, version: 1, action: "done" },
    ]), policy);
    assert.equal(hasWork(work), false);
    assert.equal(workSignature(work), null);
  });
  for (const [name, value] of [
    ["missing head", { items: [] }], ["missing items", { head }], ["unknown head agent", overview([], { head: { action: "dispatch", agent: "dev", hint: "x" } })],
    ["unknown action", overview([dispatch({ action: "launch" })])], ["empty key", overview([dispatch({ key: "" })])],
    ["duplicate key", overview([dispatch(), dispatch()])], ["fractional version", overview([dispatch({ version: 1.5 })])],
    ["zero version", overview([dispatch({ version: 0 })])], ["missing dispatch hint", overview([dispatch({ hint: undefined })])],
    ["missing format", overview([dispatch({ format: undefined })])], ["unknown format", overview([dispatch({ format: "slots-v2" })])],
    ["missing slots entry", overview([dispatch({ format: "slots-v1" })])],
    ["wrong slot", overview([dispatch({ format: "slots-v1", entry: { runId: "r", entryId: "e", slotId: "implement" } })])],
    ["broken optional entry", overview([dispatch({ entry: { runId: "r" } })])],
    ["accept without hint", overview([dispatch({ action: "accept", hint: undefined })])],
    ["unknown wait", overview([dispatch({ action: "wait", on: "busy" })])],
    ["handoff without note", overview([dispatch({ action: "wait", on: "handoff" })])],
    ["cap without reason", overview([dispatch({ action: "wait", on: "cap" })])],
    ["gate without boundary", overview([dispatch({ action: "wait", on: "gate", gate: "before-plan", planCommit: null })])],
    ["done without node", overview([dispatch({ action: "done", node: undefined })])],
    ["non-stale runbook payload", overview([], { runbook: { stale: false, note: "x" } })],
  ]) it(`rejects ${name}`, () => assert.throws(() => actionableWork(value, policy), /Invalid pipeline overview/));
});

describe("watch repeat state", () => {
  it("stops only on the third identical returned work set, and resets on empty work", () => {
    assert.equal(STUCK_AFTER, 3);
    const first = nextWatchState(freshState, "a");
    const second = nextWatchState(first, "a");
    const third = nextWatchState(second, "a");
    assert.deepEqual(first, { lastSignature: "a", repeats: 1, stuck: false });
    assert.equal(second.stuck, false);
    assert.deepEqual(third, { lastSignature: "a", repeats: 3, stuck: true });
    assert.deepEqual(nextWatchState(second, null), freshState);
    assert.deepEqual(nextWatchState(second, "b"), { lastSignature: "b", repeats: 1, stuck: false });
  });
  it("signatures are order-independent, include execution identity, and exclude display hints", () => {
    const one = dispatch();
    const two = dispatch({ key: "ITEM-02", node: "implement" });
    const signature = (items, extra = {}) => workSignature(actionableWork(overview(items, extra), { ...policy, propose: true }));
    assert.equal(signature([one, two]), signature([two, one]));
    assert.equal(signature([one]), signature([{ ...one, hint: "Changed display." }], { runbook: { stale: true, note: "x" } }));
    for (const changed of [{ node: "implement" }, { version: 2 }, { agent: "api-dev" },
      { action: "accept" }, { format: "slots-v1", entry: { runId: "r", entryId: "e", slotId: "plan" } }]) {
      assert.notEqual(signature([one]), signature([{ ...one, ...changed }]));
    }
    const slot = dispatch({ format: "slots-v1", entry: { runId: "r", entryId: "e", slotId: "plan" } });
    assert.notEqual(signature([slot]), signature([{ ...slot, entry: { ...slot.entry, runId: "new" } }]));
    assert.notEqual(signature([slot]), signature([{ ...slot, entry: { ...slot.entry, entryId: "new" } }]));
    assert.notEqual(signature([one]), signature([one], { head: { action: "dispatch", agent: "pm", hint: "x" } }));
    assert.notEqual(signature([dispatch({ key: "a|b", node: "c" })]), signature([dispatch({ key: "a", node: "b|c" })]));
  });
});
