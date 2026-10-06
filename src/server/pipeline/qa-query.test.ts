import assert from "node:assert/strict";
import { it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { qaEntryResult } from "./qa-query";

it("QA completion needs the current entry, target commit, successful verification and normal report closure", async () => {
  const qa = { verdict: "pass", targetCommit: "a".repeat(40), baseUrl: "http://localhost:3000", scenarios: [{ id: "reload", status: "pass", expected: "persist", actual: "persist", evidence: ["snapshot"] }] };
  for (const variant of ["pass", "fail", "blocked", "stale", "no-verify", "no-report-close", "no-report"]) {
    const evidence = variant === "fail" || variant === "blocked" ? { ...qa, verdict: variant, scenarios: [{ ...qa.scenarios[0], status: variant }] } : qa;
    let filter: unknown;
    const db = { agentRun: { findFirst: async (args: { where: unknown }) => { filter = args.where; return { stepId: variant === "pass" ? "report" : variant === "fail" ? "failed-report" : "report", reports: variant === "no-report" ? [] : [{ path: "docs/agents/qa-verifier/K.md", commit: "b".repeat(40), qa: evidence }], steps: [{ stepId: "verify", outcome: variant === "no-verify" ? "blocked" : "ok" }, { stepId: "report", outcome: variant === "no-report-close" ? "handoff" : "ok" }] }; } }, report: { findFirst: async () => ({ commit: variant === "stale" ? "c".repeat(40) : qa.targetCommit }) } } as unknown as PrismaClient;
    const result = await qaEntryResult(db, "project", "item", "dev", "pipeline", "entry");
    assert.equal(result.complete, variant === "pass", variant);
    assert.deepEqual(filter, { projectId: "project", agent: "qa-verifier", pipelineRunId: "pipeline", pipelineEntryId: "entry", closedAt: { not: null } });
    if (["fail", "blocked", "stale"].includes(variant)) assert.ok(result.failure);
  }
});
