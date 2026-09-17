import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { createBoardQueries } from "./board-query";

it("failed approval rolls back lazy PipelineRun materialization", async () => {
  let materialized: unknown = null;
  let creates = 0;
  const version = { id: "version", version: 1, nodes: ["plan", "implement", "accept"], gates: ["before-plan"], format: "slots-v1" };
  const tx = {
    $queryRaw: async () => [],
    $executeRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      creates++;
      materialized = { id: values[0], boardItemId: values[1], versionId: values[2], node: values[3], entryId: values[4], version, closedAt: null };
      return 1;
    },
    boardItem: { findFirst: async () => ({ id: "item", status: "proposed", validation: null, planCommit: null, updatedAt: new Date(0) }) },
    project: {
      findUnique: async () => ({ ownerUserId: "owner", repoOwner: "repo", available: true, ownerUser: { subscription: { plan: "pro" } } }),
      findUniqueOrThrow: async () => ({ ownerUserId: "owner" }),
    },
    pipelineVersion: { findFirst: async () => version },
    pipelineRun: {
      findUnique: async () => materialized,
      findUniqueOrThrow: async () => materialized,
    },
  };
  const client = { $transaction: async (work: (db: typeof tx) => Promise<unknown>) => {
    const before = materialized;
    try { return await work(tx); } catch (error) { materialized = before; throw error; }
  } } as unknown as PrismaClient;
  const result = await createBoardQueries(client).gate("project", { key: "KEY", gate: "before-plan", gateEntry: { runId: "old", entryId: "old" } }, { actor: "human", actorRef: "owner", channel: "web", expectedUpdatedAt: new Date(0) });
  assert.equal(result.ok, false);
  assert.equal(creates, 1, "exercise the actual materializing path");
  assert.equal(materialized, null, "rejection must escape the transaction before mapping to ServerResult");
});
