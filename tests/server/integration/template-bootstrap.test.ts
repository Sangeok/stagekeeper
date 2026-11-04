import assert from "node:assert/strict";
import { it } from "node:test";
import { bootstrapTemplateReleases, snapshotTemplateCutover } from "../../../src/server/templates/api";
import type { TemplateCutoverEvidence } from "../../../src/server/templates/contracts";
import { agentNext, createNextDeps } from "../../../src/server/agents/api";
import { installationFor } from "../../../packages/core/templates/release-manifest.mjs";
import { releaseRows, releaseAudit, withReleaseDatabase } from "./template-release-support";

it("bootstrap preserves history and ledgers, invalidates old receipts once and atomically freezes R0", { timeout: 30000 }, async () => {
  await withReleaseDatabase(async ([db]) => {
    const rows = releaseRows().map(row => row.path === "agents/dev.md" ? { ...row, body: row.body.replace("## step:start", "## step:start requires: planning") } : row);
    await db.template.createMany({ data: rows });
    const user = await db.user.create({ data: { login: "bootstrap", githubId: 25, subscription: { create: { plan: "max" } } } });
    const project = await db.project.create({ data: { slug: "bootstrap", name: "Bootstrap", repoOwner: "test", repo: "test", branch: "main", ownerUserId: user.id,
      workspaces: { create: { wsId: "app", path: ".", agent: "app-dev", verify: ["npm test"], readOnly: [] } } } });
    const pipeline = await db.pipeline.create({ data: { projectId: project.id, name: "Legacy", createdBy: "test" } });
    const version = await db.pipelineVersion.create({ data: { projectId: project.id, pipelineId: pipeline.id, version: 1, nodes: ["plan", "implement", "accept"], gates: [], createdBy: "test" } });
    const backlog = await db.backlogItem.create({ data: { projectId: project.id, key: "A", title: "A", area: "app", source: "test" } });
    const board = await db.boardItem.create({ data: { projectId: project.id, backlogItemId: backlog.id, agent: "app-dev", status: "planning", reason: "test" } });
    const parent = await db.pipelineRun.create({ data: { boardItemId: board.id, versionId: version.id, node: "plan", enteredAt: new Date(Date.now() - 1000) } });
    await db.boardItem.update({ where: { id: board.id }, data: { currentRunId: parent.id } });
    const old = await db.agentRun.create({ data: { projectId: project.id, agent: "app-dev", key: "A", tokenId: "test", stepId: "start", closedAt: new Date() } });
    const role = await db.agentRun.create({ data: { projectId: project.id, agent: "app-dev", key: "A", tokenId: "test", stepId: "start", revision: 7 } });
    const step = await db.agentRunStep.create({ data: { runId: role.id, stepId: "start", outcome: "handoff", note: "preserve", accepted: true, receiptRevision: 6 } });
    const snapshot = await snapshotTemplateCutover(db);
    const evidence: TemplateCutoverEvidence = { schemaVersion: 1, snapshotHash: snapshot.hash, targetIdentityHash: releaseAudit.targetIdentityHash,
      codeSha: releaseAudit.codeSha, maintenanceReference: "test maintenance", writersDrained: true,
      readers: [{ identity: "test-server", codeSha: releaseAudit.codeSha, protocol: "template-release-v1" }],
      inventory: rows.map(({ lang, path }) => ({ lang, path })), excluded: [],
      unboundRuns: [{ id: role.id, kind: "legacy", runId: parent.id, node: "plan", evidence: "confirmed fresh dispatch" }] };
    const command = { requestId: "bootstrap-test", audit: releaseAudit, evidence };
    const wrong = await bootstrapTemplateReleases(db, { ...command, evidence: { ...evidence, unboundRuns: [] } });
    assert.equal(wrong.ok, false);
    assert.equal(await db.templateRelease.count(), 0);
    assert.equal((await db.templateChannel.findUniqueOrThrow({ where: { id: "default" } })).legacyWritesBlocked, false);
    const result = await bootstrapTemplateReleases(db, command);
    assert.ok(result.ok, result.ok ? undefined : result.reason);
    assert.deepEqual(await bootstrapTemplateReleases(db, command), result);
    const pinned = await db.agentRun.findUniqueOrThrow({ where: { id: role.id } });
    assert.equal(pinned.revision, 8); assert.equal(pinned.pipelineRunId, parent.id); assert.equal(pinned.pipelineNode, "plan");
    assert.equal((await db.agentRun.findUniqueOrThrow({ where: { id: old.id } })).templateReleaseId, null);
    assert.deepEqual(await db.agentRunStep.findUniqueOrThrow({ where: { id: step.id } }), step);
    const migrated = await db.pipelineRun.findUniqueOrThrow({ where: { id: parent.id } });
    assert.equal(migrated.enteredAt.getTime(), parent.enteredAt.getTime());
    assert.ok(JSON.stringify(migrated.legacyEvidence).includes(old.id));
    await assert.rejects(db.pipelineRun.update({ where: { id: parent.id }, data: { legacyEvidence: {} } }));
    await assert.rejects(db.template.update({ where: { lang_path: { lang: "en", path: rows[0].path } }, data: { body: "drift" } }));
    const release = await db.templateRelease.findUniqueOrThrow({ where: { id: result.item.releaseId } });
    const installation = installationFor({ releaseId: release.id, rows, language: "en", client: "claude", plan: "max", contractHash: release.contractHash });
    const input = { agent: "app-dev", key: "A", execution: { kind: "legacy" as const, runId: parent.id, node: "plan" }, installation };
    const deps = createNextDeps(db), scope = { projectId: project.id, tokenId: "test" };
    assert.equal((await agentNext(deps, scope, { ...input, outcome: "ok", receipt: { runId: role.id, revision: 7, stepId: "start" } })).ok, false);
    const resumed = await agentNext(deps, scope, input);
    assert.ok(resumed.ok && !resumed.item.done, JSON.stringify(resumed));
    assert.equal(resumed.item.receipt.revision, 8);
  });
});

it("bootstrap detects snapshot drift before any release, pin or writer-barrier mutation", async () => {
  await withReleaseDatabase(async ([db]) => {
    const rows = releaseRows(); await db.template.createMany({ data: rows });
    const snapshot = await snapshotTemplateCutover(db);
    await db.template.update({ where: { lang_path: { lang: "en", path: rows[0].path } }, data: { body: rows[0].body + "Changed\n" } });
    const result = await bootstrapTemplateReleases(db, { requestId: "drift", audit: releaseAudit, evidence: {
      schemaVersion: 1, snapshotHash: snapshot.hash, targetIdentityHash: releaseAudit.targetIdentityHash, codeSha: releaseAudit.codeSha,
      maintenanceReference: "test", writersDrained: true, readers: [{ identity: "server", codeSha: releaseAudit.codeSha, protocol: "template-release-v1" }],
      inventory: rows.map(({ lang, path }) => ({ lang, path })), excluded: [], unboundRuns: [],
    } });
    assert.equal(result.ok, false);
    assert.equal(await db.templateRelease.count(), 0); assert.equal(await db.templateDeployment.count(), 0);
    assert.equal((await db.templateChannel.findUniqueOrThrow({ where: { id: "default" } })).mode, "legacy");
  });
});
