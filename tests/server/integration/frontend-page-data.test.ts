import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";
import { loadBoardItemPage } from "@/fsd/pages/board-item/index.server";
import { loadProjectBacklogPage } from "@/fsd/pages/project-backlog/index.server";
import { loadTurn } from "@/fsd/widgets/turn-banner/index.server";
import { cleanup, connections, fixture, seedPipelineVersion, type Fixture } from "./support";

it("page loaders preserve isolated stored evidence and never materialize or mutate data while reading", async () => {
  const pool = connections(1);
  const db = pool.all[0];
  const owned: Fixture[] = [];
  try {
    const owner = await fixture(db, { plan: "pro", status: "done", planPath: "docs/plan.md", planCommit: "plan-commit" }); owned.push(owner);
    const other = await fixture(db, { plan: "pro", status: "done" }); owned.push(other);
    const ids = owned.map(value => value.projectId);
    const project = { projectId: { in: ids } };
    const throughItem = { boardItem: project };
    const snapshot = async () => Promise.all([
      db.project.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } }),
      db.backlogItem.findMany({ where: project, orderBy: { id: "asc" } }),
      db.boardItem.findMany({ where: project, orderBy: { id: "asc" } }),
      db.pipeline.findMany({ where: project, orderBy: { id: "asc" } }),
      db.pipelineDefinition.findMany({ where: { pipeline: project }, orderBy: { id: "asc" } }),
      db.pipelineVersion.findMany({ where: project, orderBy: { id: "asc" } }),
      db.pipelineRule.findMany({ where: project, orderBy: [{ projectId: "asc" }, { type: "asc" }] }),
      db.pipelineRun.findMany({ where: throughItem, orderBy: { id: "asc" } }),
      db.transitionEvent.findMany({ where: throughItem, orderBy: { id: "asc" } }),
      db.report.findMany({ where: throughItem, orderBy: { id: "asc" } }),
      db.acceptanceFailure.findMany({ where: throughItem, orderBy: { id: "asc" } }),
    ]);
    const beforeVirtual = await snapshot();
    assert.ok(await loadBoardItemPage(owner.projectId, owner.key));
    await loadProjectBacklogPage(owner.projectId, { includeRemoved: false, editKey: undefined });
    await loadTurn(owner.projectId);
    assert.deepEqual(await snapshot(), beforeVirtual);
    assert.equal(await db.pipeline.count({ where: project }), 0);

    const at = new Date();
    const decision = { contextKey: "fixture", policy: "Oldest first", criterion: "Own source", readiness: "Ready", assignmentReason: "Owns web", evidence: [{ key: owner.key, quote: "Owner evidence" }], comparisons: [], uncertainties: [] };
    const version = await seedPipelineVersion(db, { projectId: owner.projectId, version: 1, nodes: ["plan", "implement", "accept"], gates: ["before-plan"], createdBy: "fixture", format: "slots-v1" });
    const alternative = await db.pipeline.create({ data: { projectId: owner.projectId, name: "Alternative", createdBy: "fixture", definitions: { create: { version: 1, steps: ["plan", "implement", "accept"], gates: [], createdBy: "fixture" } } } });
    const nextVersion = await db.pipelineVersion.create({ data: { projectId: owner.projectId, pipelineId: alternative.id, version: 2, nodes: ["plan", "implement", "accept"], gates: [], createdBy: "fixture", format: "slots-v1" } });
    await db.pipelineRule.create({ data: { projectId: owner.projectId, type: "fix", pipelineId: alternative.id } });
    const run = await db.pipelineRun.create({ data: { boardItemId: owner.boardItemId, versionId: version.id, node: "accept", entryId: randomUUID() } });
    await db.boardItem.update({ where: { id: owner.boardItemId }, data: { selectionDecision: decision, currentRunId: run.id, reason: "Owner evidence", results: ["Owner result"] } });
    await db.backlogItem.update({ where: { id: owner.backlogItemId }, data: { title: "Owned item", type: "fix", addedBy: "work-discoverer", removedAt: at, removedReason: "done" } });
    await db.backlogItem.create({ data: { projectId: owner.projectId, key: "K-2", title: "Unassigned", area: "api", source: "Next", type: null } });
    await db.backlogItem.create({ data: { projectId: other.projectId, key: "FOREIGN", title: "Foreign item", area: "api", source: "Private" } });
    await db.report.create({ data: { boardItemId: owner.boardItemId, actor: "dev", path: "docs/report.md", commit: "report-commit", isAcceptance: false, at } });
    await db.report.create({ data: { boardItemId: other.boardItemId, actor: "dev", path: "private.md", commit: "private", at } });
    await db.transitionEvent.create({ data: { boardItemId: owner.boardItemId, actor: "human", from: "planning", to: "in_review", note: `pipeline-changed:${version.id}:${nextVersion.id}`, at } });
    const failure = await db.acceptanceFailure.create({ data: { boardItemId: owner.boardItemId, checks: [3], note: "Acceptance evidence", at } });

    const before = await snapshot();
    const detail = await loadBoardItemPage(owner.projectId, owner.key);
    assert.ok(detail);
    assert.equal(detail.canWrite, true);
    assert.equal(detail.item.title, "Owned item");
    assert.deepEqual(detail.item.selectionDecision, decision);
    assert.equal(detail.item.pipeline.pipelineId, version.pipelineId);
    assert.equal(detail.item.acceptanceFailure?.id, failure.id);
    assert.deepEqual(detail.item.acceptanceFailure?.checks, [3]);
    assert.deepEqual(detail.item.events[0].pipelineChange, { fromName: "Default", toName: "Alternative" });
    assert.equal(detail.item.reports.length, 1);
    assert.equal(detail.item.reports[0].path, "docs/report.md");
    assert.equal(detail.item.docs.length, 2);
    assert.equal(detail.item.repo.owner, owner.id);
    assert.deepEqual(detail.pipelineChoices, [{ id: alternative.id, name: "Alternative" }]);
    assert.equal(await loadBoardItemPage(owner.projectId, "FOREIGN"), null);
    const backlog = await loadProjectBacklogPage(owner.projectId, { includeRemoved: true, editKey: owner.key });
    assert.deepEqual(backlog.rows.map(value => value.key), [owner.key, "K-2"]);
    assert.equal(backlog.rows[0].addedBy, "work-discoverer");
    assert.equal(backlog.rows[0].removedAt?.toISOString(), at.toISOString());
    assert.equal(backlog.editingItem?.title, "Owned item");
    assert.equal(backlog.preselected[owner.key], alternative.id);
    assert.equal(backlog.preselected["K-2"], version.pipelineId);
    const active = await loadProjectBacklogPage(owner.projectId, { includeRemoved: false, editKey: owner.key });
    assert.deepEqual(active.rows.map(value => value.key), ["K-2"]);
    assert.equal(active.editingItem, undefined);
    await loadTurn(owner.projectId);
    assert.deepEqual(await snapshot(), before);

    await db.project.update({ where: { id: owner.projectId }, data: { available: false } });
    const readOnly = await snapshot();
    assert.equal((await loadBoardItemPage(owner.projectId, owner.key))?.canWrite, false);
    assert.equal((await loadProjectBacklogPage(owner.projectId, { includeRemoved: true, editKey: undefined })).canWrite, false);
    assert.deepEqual(await snapshot(), readOnly);
    await db.project.delete({ where: { id: owner.projectId } });
    await assert.rejects(loadTurn(owner.projectId));
  } finally {
    try { await Promise.all(owned.map(value => cleanup(db, value.userId))); }
    finally { await pool.disconnect(); }
  }
});
