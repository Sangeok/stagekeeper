import assert from "node:assert/strict";
import { it } from "node:test";
import type { BoardItem } from "../../src/generated/prisma/client";
import { APPROVED_ADVICE_FAILURE, createOwnerGate } from "../../src/server/mcp/owner-gate";
import type { PipelineNext } from "../../src/server/pipeline/run-rules";

const item: BoardItem = { id: "item", projectId: "p", backlogItemId: "b", agent: "dev", status: "done", reason: "evidence", results: ["result"],
  validation: null, acceptedAt: null, planPath: "docs/plan.md", planCommit: "abcdef1", proposedOn: new Date(0), updatedAt: new Date(1), discardedAt: null };
const input = { key: "KEY", gate: "before-accept", gateEntry: { runId: "run", entryId: "entry" } };
const next: PipelineNext = { key: "KEY", node: "accept", version: 1, action: "accept", hint: "Accept" };

it("preserves the entire saved row and real next after a single confirmed mutation", async () => {
  const calls: unknown[] = [];
  const gate = createOwnerGate({ latestRow: async () => ({ updatedAt: item.updatedAt }),
    gate: async (...args) => { calls.push(args); return { ok: true, item }; },
    advice: async (...args) => { assert.equal(calls.length, 1); calls.push(args); return next; } });
  assert.deepEqual(await gate("p", "owner", input), { ok: true, item: { item, next } });
  assert.deepEqual(calls, [["p", input, { actor: "human", actorRef: "owner", channel: "session", expectedUpdatedAt: item.updatedAt }], ["p", "KEY"]]);
});

it("does not read advice after a missing row, expected gate refusal or mutation exception", async () => {
  for (const outcome of ["missing", "refused", "precommit", "commit-unknown"] as const) {
    let writes = 0; let advice = 0;
    const original = new Error(outcome);
    const gate = createOwnerGate({ latestRow: async () => outcome === "missing" ? null : item,
      gate: async () => { writes++; if (outcome === "refused") return { ok: false, reason: "stale" }; throw original; },
      advice: async () => { advice++; return next; } });
    if (outcome === "missing") assert.deepEqual(await gate("p", "owner", input), { ok: false, reason: "no such board item: KEY" });
    else if (outcome === "refused") assert.deepEqual(await gate("p", "owner", input), { ok: false, reason: "stale" });
    else await assert.rejects(gate("p", "owner", input), error => error === original);
    assert.equal(writes, outcome === "missing" ? 0 : 1); assert.equal(advice, 0);
  }
});

it("reports a saved approval only when advice alone fails, without retrying the mutation", async () => {
  let writes = 0; let advice = 0;
  const gate = createOwnerGate({ latestRow: async () => item, gate: async () => { writes++; return { ok: true, item }; },
    advice: async () => { advice++; throw new Error("secret database exception"); } });
  assert.deepEqual(await gate("p", "owner", input), { ok: false, reason: APPROVED_ADVICE_FAILURE });
  assert.equal(writes, 1); assert.equal(advice, 1);
});
