import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "../../src/generated/prisma/client";
import { createBoardService } from "../../src/server/pipeline/board";

it("history truncation queries the displayed row and includes report-only history; no query without cutoff", async () => {
  const calls: unknown[] = [];
  const db = { boardItem: { findFirst: async (args: unknown) => { calls.push(args); return { id: "row" }; } } } as unknown as PrismaClient;
  const board = createBoardService(db);
  assert.equal(await board.hasHistoryBefore("project", "row", null), false);
  assert.equal(calls.length, 0);
  const cutoff = new Date("2026-01-01T00:00:00Z");
  assert.equal(await board.hasHistoryBefore("project", "row", cutoff), true);
  assert.deepEqual(calls, [{ where: { id: "row", projectId: "project", discardedAt: null, OR: [
    { events: { some: { at: { lt: cutoff } } } }, { reports: { some: { at: { lt: cutoff } } } },
  ] }, select: { id: true } }]);
});
