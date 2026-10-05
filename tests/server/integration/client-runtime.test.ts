import assert from "node:assert/strict";
import { it } from "node:test";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { COMMON_DOCS, RUNTIME_MARKER } from "@harness/core/client-runtime.mjs";
import { codexRunbookVersion } from "@harness/core/runbook.mjs";
import { createToolDeps } from "../../../src/server/mcp/deps";
import { createBoardService } from "../../../src/server/pipeline/board";
import { seedTemplates, snapshotTemplates, restoreTemplates } from "../../../scripts/lib/template-seed-query";
import { cleanup, connections, fixture } from "./support";

const role = `${RUNTIME_MARKER}\nFixture role.\n## step:implement requires: implementing\nRead {{runtime.runbook_path}}.\nnext: verify\n## step:verify requires: implementing\nVerify current artifacts.\nnext: done\n`;
const runbook = `${RUNTIME_MARKER}\nCodex fixture source.\n`;
const pipelineAnswer = z.object({ action: z.enum(["dispatch", "wait", "accept", "done"]), entry: z.object({ runId: z.string(), entryId: z.string(), slotId: z.string() }).nullable().optional() }).passthrough();
const bundle = (lang: string) => [
  ...["dev", "pm", "feature-scout", "doc-auditor", "plan-verifier", "qa-verifier"].map(agent => ({ lang, path: `agents/${agent}.md`, body: role })),
  ...COMMON_DOCS.map(path => ({ lang, path, body: "Common fixture documentation." })),
  { lang, path: "CLAUDE.runbook.md", body: "Claude fixture source." }, { lang, path: "CODEX.runbook.md", body: runbook },
];

// 실제 DB 계약 시험이다. CLI 모델·브라우저 인수로 취급하지 않는다.
for (const format of [null, "slots-v1"] as const) for (const [first, second] of [["claude", "codex"], ["codex", "claude"]] as const) {
  it(`${format ?? "legacy"}: ${first} → ${second} preserves approval, pipeline, open run, receipt and usage`, async () => {
    const { all: [db], disconnect } = connections(1);
    let userId: string | undefined, lang: string | undefined;
    try {
      const f = await fixture(db, { plan: "max", status: "in_review", planPath: "docs/plans/K-1.md", planCommit: "a".repeat(40) });
      userId = f.userId; lang = `dual-${f.id}`;
      await db.project.update({ where: { id: f.projectId }, data: { language: lang } });
      await db.template.createMany({ data: bundle(lang) });
      const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, format, nodes: ["plan", "implement", "accept"], gates: ["before-implement"], createdBy: f.userId } });
      const pipeline = await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "before-implement", entryId: format ? "original-entry" : null } });
      const deps = createToolDeps(db), hash = codexRunbookVersion(runbook);
      const waiting = await deps.pipelineNext(f.projectId, f.key, hash, first);
      assert.ok(waiting.ok); assert.equal(pipelineAnswer.parse(waiting.item).action, "wait");
      assert.equal(await db.agentRun.count({ where: { projectId: f.projectId } }), 0);
      const approved = await createBoardService(db).gate(f.projectId, { key: f.key, gate: "before-implement", planCommit: "a".repeat(40), ...(format ? { gateEntry: { runId: pipeline.id, entryId: "original-entry" } } : {}) }, { actor: "human", actorRef: f.userId, channel: "web", expectedUpdatedAt: f.updatedAt });
      assert.ok(approved.ok, approved.ok ? undefined : approved.reason);
      const hint = await deps.pipelineNext(f.projectId, f.key, hash, first);
      assert.ok(hint.ok);
      const answer = pipelineAnswer.parse(hint.item); assert.equal(answer.action, "dispatch");
      const binding = { agent: "dev", key: f.key, ...(answer.entry ? { entry: answer.entry } : {}) };
      const opened = await deps.agentNext(f.projectId, "first-caller", { ...binding, client: first });
      assert.ok(opened.ok && !opened.item.done);
      const before = await db.user.findUniqueOrThrow({ where: { id: f.userId }, select: { usageRunCount: true } });
      const resumed = await deps.agentNext(f.projectId, "second-caller", { ...binding, client: second });
      assert.ok(resumed.ok && !resumed.item.done);
      assert.deepEqual(resumed.item.receipt, opened.item.receipt);
      const outcome = await deps.agentNext(f.projectId, "second-caller", { ...binding, client: second, outcome: "ok", receipt: resumed.item.receipt, ...(format ? { agentRunId: resumed.item.agentRunId, stepId: resumed.item.step } : {}) });
      assert.ok(outcome.ok && !outcome.item.done);
      assert.equal(outcome.item.receipt.runId, opened.item.receipt.runId);
      assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: f.userId }, select: { usageRunCount: true } }), before);
      assert.equal(await db.agentRun.count({ where: { projectId: f.projectId } }), 1);
      const saved = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId }, include: { run: true } });
      assert.equal(saved.planCommit, "a".repeat(40)); assert.equal(saved.run?.id, pipeline.id);
      const ledger = await db.agentRunStep.findMany({ where: { runId: opened.item.receipt.runId } });
      assert.equal(ledger.length, 1); assert.equal(ledger[0].callerTokenId, "second-caller"); assert.equal(ledger[0].accepted, true);
    } finally {
      if (lang) await db.template.deleteMany({ where: { lang } });
      await cleanup(db, userId); await disconnect();
    }
  });
}

it("Codex bundle failure precedes lazy pipeline mutation in the actual DB adapter", async () => {
  const { all: [db], disconnect } = connections(1);
  let userId: string | undefined, lang: string | undefined;
  try {
    const f = await fixture(db, { plan: "max", status: "implementing" }); userId = f.userId; lang = `dual-${f.id}`;
    await db.project.update({ where: { id: f.projectId }, data: { language: lang } });
    await db.template.createMany({ data: bundle(lang).map(row => row.path === "CODEX.runbook.md" ? { ...row, body: "Missing marker" } : row) });
    const before = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    const result = await createToolDeps(db).pipelineNext(f.projectId, f.key, codexRunbookVersion(runbook), "codex");
    assert.equal(result.ok, false); assert.equal(await db.pipelineRun.count({ where: { boardItemId: f.boardItemId } }), 0);
    assert.deepEqual(await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } }), before);
  } finally {
    if (lang) await db.template.deleteMany({ where: { lang } });
    await cleanup(db, userId); await disconnect();
  }
});

it("actual DB seed rollback and bounded restore preserve unrelated templates", async () => {
  const { all: [db], disconnect } = connections(1), lang = `dual-seed-${randomUUID()}`;
  const rows = bundle(lang), legacy = rows.filter(row => row.path !== "CODEX.runbook.md");
  try {
    await db.template.createMany({ data: legacy });
    const changed = rows.map(row => ({ ...row, body: row.body + "\nNew revision." }));
    const snapshot = await db.$transaction(tx => snapshotTemplates(tx.template, changed, "a".repeat(40)), { isolationLevel: "Serializable" });
    await assert.rejects(db.$transaction(async tx => { await seedTemplates(tx.template, changed); throw new Error("fixture rollback"); }, { isolationLevel: "Serializable" }), /fixture rollback/);
    assert.equal(await db.template.count({ where: { lang, path: "CODEX.runbook.md" } }), 0);
    assert.equal((await db.template.findUniqueOrThrow({ where: { lang_path: { lang, path: "agents/dev.md" } } })).body, role);
    await db.$transaction(tx => seedTemplates(tx.template, changed), { isolationLevel: "Serializable" });
    await db.template.create({ data: { lang, path: "foreign.md", body: "outside whitelist" } });
    await db.$transaction(tx => restoreTemplates(tx.template, snapshot), { isolationLevel: "Serializable" });
    assert.equal(await db.template.count({ where: { lang, path: "CODEX.runbook.md" } }), 0);
    assert.equal((await db.template.findUniqueOrThrow({ where: { lang_path: { lang, path: "foreign.md" } } })).body, "outside whitelist");
    assert.equal((await db.template.findUniqueOrThrow({ where: { lang_path: { lang, path: "agents/dev.md" } } })).body, role);
  } finally { await db.template.deleteMany({ where: { lang } }); await disconnect(); }
});
