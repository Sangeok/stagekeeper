import assert from "node:assert/strict";
import { it } from "node:test";
import { makeRecordTokenUsage, tryRecordTokenUsage, type TokenUsageKind } from "./token-usage-query";

it("routes each kind to an atomic, non-revoked, 60-second monotonic update without secrets", async () => {
  for (const kind of ["agent", "owner", "user"] as const) {
    const calls: { kind: TokenUsageKind; args: unknown }[] = [];
    const delegate = (kind: TokenUsageKind) => ({ updateMany: async (args: unknown) => { calls.push({ kind, args }); return { count: 1 }; } });
    const record = makeRecordTokenUsage({ projectToken: delegate("agent"), ownerToken: delegate("owner"), userToken: delegate("user") });
    const at = new Date("2026-10-02T03:04:05.678Z");
    await record(kind, "internal-id", at);
    assert.deepEqual(calls, [{ kind, args: {
      where: { id: "internal-id", revokedAt: null, AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: at } }] },
        { OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: new Date("2026-10-02T03:03:05.678Z") } }] },
      ] },
      data: { lastUsedAt: at },
    } }]);
  }
});

it("awaits delayed failure, emits only fixed diagnostics, and survives logger failure", async () => {
  const original = console.warn;
  const diagnostics: unknown[][] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let settled = false;
  try {
    console.warn = (...args: unknown[]) => { diagnostics.push(args); };
    const pending = tryRecordTokenUsage(async () => { await gate; throw new Error("secret raw database error"); }, "agent", "private-id", new Date()).then(() => { settled = true; });
    await Promise.resolve(); assert.equal(settled, false);
    release(); await pending;
    assert.deepEqual(diagnostics, [["Token usage recording failed", { kind: "agent" }]]);
    console.warn = () => { throw new Error("diagnostic unavailable"); };
    await tryRecordTokenUsage(async () => { throw new Error("storage unavailable"); }, "user", "private-id", new Date());
    await tryRecordTokenUsage(undefined, "owner", "private-id", new Date());
  } finally { release(); console.warn = original; }
});
