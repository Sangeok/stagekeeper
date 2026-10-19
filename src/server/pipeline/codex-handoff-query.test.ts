import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { codexHandoffView } from "./codex-handoff-query";

const item = { action: "wait" as const, on: "handoff" as const, key: "A", node: "plan", version: 1, note: "docs/plans/A.md" };
it("projects existing handoff identity without creating a run or changing the old item", async () => {
  for (const format of [null, "slots-v1"]) {
    const reads: unknown[] = [];
    const db = { boardItem: { findFirst: async () => ({ agent: "web-dev", run: { id: "p", entryId: "e", node: "plan", closedAt: null, version: { format } } }) }, agentRun: { findFirst: async (args: unknown) => { reads.push(args); return { id: "r" }; } } } as unknown as PrismaClient;
    const result = await codexHandoffView(db, "project", item);
    assert.ok("resume" in result); assert.equal(result.resume.agentRunId, "r"); assert.equal(result.resume.format, format);
    assert.deepEqual(result.resume.entry, format === null ? undefined : { runId: "p", entryId: "e", slotId: "plan" });
    assert.equal("resume" in item, false); assert.equal(reads.length, 1);
  }
});
it("refuses missing or replaced handoff binding and does not touch non-handoff results", async () => {
  for (const node of ["plan", "implement"]) {
    const db = { boardItem: { findFirst: async () => ({ agent: "web-dev", run: { id: "p", entryId: "e", node, closedAt: null, version: { format: "slots-v1" } } }) }, agentRun: { findFirst: async () => null } } as unknown as PrismaClient;
    await assert.rejects(() => codexHandoffView(db, "project", item));
  }
  const done = { action: "done" as const, key: "A", node: null, version: 1 };
  assert.equal(await codexHandoffView({} as PrismaClient, "project", done), done);
});
