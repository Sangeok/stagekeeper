import { it } from "node:test";

import assert from "node:assert/strict";

import { availabilityAfterPlanChange, availabilityBasis } from "./availability-policy";

import { availableProjectIds } from "./availability-policy";

const a = { id: "a", lastSelectedAt: null, lastAgentActivityAt: new Date(0), lastSyncedAt: null, createdAt: new Date(0) };

const b = { ...a, id: "b", lastAgentActivityAt: null, createdAt: new Date(10) };

const date = (day: number) => new Date(`2026-01-${String(day).padStart(2, "0")}T00:00:00Z`);

const candidate = (id: string, overrides = {}) => ({
      id,
      lastSelectedAt: null,
      lastAgentActivityAt: null,
      lastSyncedAt: null,
      createdAt: date(1),
      ...overrides,
    });

it("trims only the supplied current set, with activity before registration", () => {
    const result = availabilityAfterPlanChange({ fromPlan: "pro", toPlan: "free", currentIds: ["b", "a"], candidates: [b, a] });
    assert.deepEqual(result, { changed: true, addedProjectIds: [], removedProjectIds: ["b"], availableProjectIds: ["a"], basis: "recent-agent-activity" });
  });

it("keeps the exact set on upgrade and under-cap downgrade", () => {
    for (const [fromPlan, toPlan] of [["free", "max"], ["max", "pro"], ["pro", "pro"]]) {
      assert.deepEqual(availabilityAfterPlanChange({ fromPlan, toPlan, currentIds: ["a"], candidates: [a] }).availableProjectIds, ["a"]);
    }
    assert.equal(availabilityBasis([a], new Set(["a"]), false), null);
  });

it("rejects mismatched candidates even for an upgrade without mutating inputs", () => {
    const candidates = [a, b]; const before = structuredClone(candidates);
    assert.throws(() => availabilityAfterPlanChange({ fromPlan: "free", toPlan: "max", currentIds: ["a"], candidates }), /match/);
    assert.deepEqual(candidates, before);
  });

it("orders candidates by selection, agent activity, sync, creation, then id", () => {
      const candidates = [
        candidate("create", { createdAt: date(5) }),
        candidate("sync", { lastSyncedAt: date(2) }),
        candidate("agent", { lastAgentActivityAt: date(3) }),
        candidate("selected", { lastSelectedAt: date(4) }),
      ];
      assert.deepEqual(availableProjectIds(candidates, 3), new Set(["selected", "agent", "sync"]));
    });

it("treats epoch zero as a real timestamp and null as missing", () => {
      const candidates = [candidate("missing"), candidate("epoch", { lastSyncedAt: new Date(0) })];
      assert.deepEqual(availableProjectIds(candidates, 1), new Set(["epoch"]));
    });

it("returns empty for zero, all candidates for Infinity, and does not mutate inputs", () => {
      const candidates = [candidate("b", { createdAt: date(2) }), candidate("a")];
      const before = candidates.map((item) => ({ ...item }));
      assert.deepEqual(availableProjectIds(candidates, 0), new Set());
      assert.deepEqual(availableProjectIds(candidates, Infinity), new Set(["b", "a"]));
      assert.deepEqual(candidates, before);
    });

it("rejects duplicate ids, invalid dates, and invalid limits", () => {
      assert.throws(() => availableProjectIds([candidate("same"), candidate("same")], 1), /duplicate candidate id/);
      assert.throws(() => availableProjectIds([candidate("bad", { createdAt: new Date("invalid") })], 1), /createdAt/);
      assert.throws(() => availableProjectIds([candidate("bad", { lastSelectedAt: undefined })], 1), /lastSelectedAt/);
      assert.throws(() => availableProjectIds([], -1), /limit/);
      assert.throws(() => availableProjectIds([], 1.5), /limit/);
      assert.throws(() => availableProjectIds(null as unknown as Parameters<typeof availableProjectIds>[0], 1), /candidates/);
      assert.throws(() => availableProjectIds([null] as unknown as Parameters<typeof availableProjectIds>[0], 1), /candidate must be an object/);
    });
