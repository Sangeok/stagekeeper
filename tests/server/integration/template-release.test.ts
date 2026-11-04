import assert from "node:assert/strict";
import { it } from "node:test";
import { publishTemplateRelease, activateTemplateRelease, readTemplateDeployment, readTemplateRelease } from "../../../src/server/templates/api";
import { releaseRows, releaseAudit, withReleaseDatabase } from "./template-release-support";

const source = { kind: "git" as const, repository: "Sangeok/harness-templates" as const, commit: "c".repeat(40) };
const input = (requestId: string) => ({ requestId, source, rows: releaseRows(), audit: releaseAudit });

it("concurrent identical imports with different request IDs seal one release and preserve both results", { timeout: 15000 }, async () => {
  await withReleaseDatabase(async ([a, b]) => {
    const results = await Promise.all([publishTemplateRelease(a, input("first")), publishTemplateRelease(b, input("second"))]);
    assert.ok(results[0].ok && results[1].ok);
    assert.equal(results[0].item.releaseId, results[1].item.releaseId);
    assert.equal(await a.templateRelease.count(), 1);
    assert.equal(await a.templateReleaseEntry.count(), 13);
    assert.equal(await a.templateDeployment.count(), 2);
    assert.equal((await a.templateChannel.findUniqueOrThrow({ where: { id: "default" } })).activeReleaseId, null);
    assert.deepEqual(await publishTemplateRelease(a, input("first")), results[0]);
    const changed = { ...input("first"), rows: releaseRows("Different instruction") };
    assert.equal((await publishTemplateRelease(a, changed)).ok, false);
    assert.equal((await publishTemplateRelease(a, { ...changed, requestId: "third" })).ok, false);
    assert.equal(await a.templateRelease.count(), 1);
  });
});

it("sealed entries and metadata reject insert, update and delete in the database", async () => {
  await withReleaseDatabase(async ([db]) => {
    const result = await publishTemplateRelease(db, input("seal"));
    assert.ok(result.ok);
    const id = result.item.releaseId;
    await assert.rejects(db.templateRelease.update({ where: { id }, data: { contentHash: "d".repeat(64) } }));
    await assert.rejects(db.templateReleaseEntry.create({ data: { releaseId: id, lang: "en", path: "docs/plans/extra.md", body: "Extra" } }));
    await assert.rejects(db.templateReleaseEntry.update({ where: { releaseId_lang_path: { releaseId: id, lang: "en", path: "agents/dev.md" } }, data: { body: "Changed" } }));
    await assert.rejects(db.templateReleaseEntry.deleteMany({ where: { releaseId: id } }));
    await assert.rejects(db.templateRelease.delete({ where: { id } }));
    await assert.rejects(db.templateDeployment.deleteMany());
    assert.equal(await db.templateReleaseEntry.count(), 13);
  });
});

it("a failure after entry insertion rolls back release, entries and request result", async () => {
  await withReleaseDatabase(async ([db]) => {
    const failing = db.$extends({ query: { templateReleaseEntry: { async createMany({ args, query }) {
      await query(args);
      throw new Error("Injected post-insert fault");
    } } } });
    await assert.rejects(publishTemplateRelease(failing as typeof db, input("failed")), /Injected post-insert fault/);
    assert.equal(await db.templateRelease.count(), 0);
    assert.equal(await db.templateReleaseEntry.count(), 0);
    assert.equal(await readTemplateDeployment(db, "import", "failed"), null);
    const invalid = input("invalid");
    invalid.rows[6].body = "## step:start\nDo it\nnext: missing\n";
    assert.equal((await publishTemplateRelease(db, invalid)).ok, false);
    assert.equal((await publishTemplateRelease(db, { ...input("bad-render"), rows: releaseRows("{{unknown.variable}}") })).ok, false);
    assert.equal(await db.templateRelease.count(), 0);
  });
});

it("activation requires cutover, uses CAS across connections and replays a lost result without reverting the channel", { timeout: 15000 }, async () => {
  await withReleaseDatabase(async ([a, b]) => {
    const r1 = await publishTemplateRelease(a, input("r1"));
    const r2 = await publishTemplateRelease(a, { ...input("r2"), source: { ...source, commit: "d".repeat(40) }, rows: releaseRows("New steps") });
    assert.ok(r1.ok && r2.ok);
    const activation = { requestId: "a1", releaseId: r2.item.releaseId, expectedRevision: 1, audit: releaseAudit };
    assert.equal((await activateTemplateRelease(a, activation)).ok, false);
    await a.templateChannel.update({ where: { id: "default" }, data: { mode: "versioned", legacyWritesBlocked: true, activeReleaseId: r1.item.releaseId, revision: 1 } });
    let arrivals = 0;
    const gate = Promise.withResolvers<void>();
    const synchronize = (db: typeof a) => db.$extends({ query: { templateDeployment: { async findUnique({ args, query }) {
      const result = await query(args);
      if (++arrivals >= 2) gate.resolve();
      await gate.promise;
      return result;
    } } } }) as typeof a;
    const competing = { ...activation, requestId: "a2", releaseId: r1.item.releaseId };
    const results = await Promise.all([activateTemplateRelease(synchronize(a), activation), activateTemplateRelease(synchronize(b), competing)]);
    assert.equal(results.filter(result => result.ok).length, 1);
    assert.equal(await a.templateDeployment.count({ where: { operation: "activate" } }), 1);
    const winnerIndex = results.findIndex(result => result.ok);
    const winnerInput = winnerIndex === 0 ? activation : competing;
    assert.equal((await activateTemplateRelease(a, { ...activation, requestId: "new", expectedRevision: 2 })).ok, true);
    assert.deepEqual(await activateTemplateRelease(a, winnerInput), results[winnerIndex]);
    assert.equal((await a.templateChannel.findUniqueOrThrow({ where: { id: "default" } })).revision, 3);
    const bundle = await readTemplateRelease(a, { releaseId: r1.item.releaseId, language: "ko" });
    assert.ok(bundle.ok);
    assert.equal(bundle.item.language, "en");
    assert.equal(bundle.item.release.id, r1.item.releaseId);
    await assert.rejects(a.template.create({ data: { lang: "en", path: "agents/dev.md", body: "Old writer" } }));
    await assert.rejects(a.templateChannel.update({ where: { id: "default" }, data: { mode: "legacy" } }));
  });
});

it("versioned runs require a sealed selection and known pins cannot be rewritten", async () => {
  await withReleaseDatabase(async ([db]) => {
    const release = await publishTemplateRelease(db, input("pin"));
    assert.ok(release.ok);
    const user = await db.user.create({ data: { login: "pin-user", githubId: 1 } });
    const project = await db.project.create({ data: { slug: "pin-project", name: "Pin", repoOwner: "fixture", repo: "fixture", branch: "dev", ownerUserId: user.id } });
    const unpinned = await db.agentRun.create({ data: { projectId: project.id, agent: "pm", tokenId: "fixture", stepId: "start", closedAt: new Date() } });
    await db.templateChannel.update({ where: { id: "default" }, data: { mode: "versioned", legacyWritesBlocked: true, activeReleaseId: release.item.releaseId, revision: 1 } });
    const data = { projectId: project.id, agent: "pm", tokenId: "fixture", stepId: "start" };
    await assert.rejects(db.agentRun.create({ data }));
    const pin = { templateReleaseId: release.item.releaseId, templateLanguage: "en", templatePinnedAt: new Date(), templatePinOrigin: "run-start" };
    const run = await db.agentRun.create({ data: { ...data, ...pin } });
    await assert.rejects(db.agentRun.update({ where: { id: run.id }, data: { templateReleaseId: null } }));
    await assert.rejects(db.agentRun.update({ where: { id: unpinned.id }, data: pin }));
    await assert.rejects(db.agentRun.update({ where: { id: unpinned.id }, data: { closedAt: null } }));
    await assert.rejects(db.agentRun.create({ data: { ...data, ...pin, templateLanguage: "ko" } }));
    await db.user.delete({ where: { id: user.id } });
    assert.equal(await db.agentRun.count(), 0);
  });
});

it("parent pins enforce the same project and release while owner deletion still cascades the execution family", async () => {
  await withReleaseDatabase(async ([db]) => {
    const first = await publishTemplateRelease(db, input("parent"));
    const second = await publishTemplateRelease(db, { ...input("other-release"), source: { ...source, commit: "e".repeat(40) } });
    assert.ok(first.ok && second.ok);
    const user = await db.user.create({ data: { login: "parent-user", githubId: 2 } });
    const project = await db.project.create({ data: { slug: "parent", name: "Parent", repoOwner: "fixture", repo: "parent", branch: "dev", ownerUserId: user.id } });
    const other = await db.project.create({ data: { slug: "other", name: "Other", repoOwner: "fixture", repo: "other", branch: "dev", ownerUserId: user.id } });
    const pipeline = await db.pipeline.create({ data: { projectId: project.id, name: "Pipeline", createdBy: "fixture" } });
    const version = await db.pipelineVersion.create({ data: { projectId: project.id, pipelineId: pipeline.id, version: 1, nodes: ["plan", "implement", "accept"], gates: [], createdBy: "fixture" } });
    await db.templateChannel.update({ where: { id: "default" }, data: { mode: "versioned", legacyWritesBlocked: true, activeReleaseId: first.item.releaseId, revision: 1 } });
    const pin = { templateReleaseId: first.item.releaseId, templateLanguage: "en", templatePinnedAt: new Date(), templatePinOrigin: "run-start" };
    const work = await db.pipelineWorkRun.create({ data: { projectId: project.id, versionId: version.id, node: "assign-work", entryId: "entry", inputKey: "", ...pin } });
    const agent = { projectId: project.id, agent: "work-assigner", tokenId: "fixture", stepId: "start", workRunId: work.id, workEntryId: work.entryId, ...pin };
    await assert.rejects(db.agentRun.create({ data: { ...agent, projectId: other.id } }));
    await assert.rejects(db.agentRun.create({ data: { ...agent, templateReleaseId: second.item.releaseId } }));
    await db.agentRun.create({ data: agent });
    const backlog = await db.backlogItem.create({ data: { projectId: project.id, key: "K-1", title: "Task", area: "app", source: "test" } });
    const board = await db.boardItem.create({ data: { projectId: project.id, backlogItemId: backlog.id, agent: "app-dev", status: "planning", reason: "test" } });
    const run = await db.pipelineRun.create({ data: { boardItemId: board.id, versionId: version.id, sourceWorkRunId: work.id, node: "plan", ...pin } });
    await db.pipelineRun.create({ data: { boardItemId: board.id, versionId: version.id, continuedFromRunId: run.id, node: "plan", ...pin } });
    const legacyAgent = { projectId: project.id, agent: "app-dev", tokenId: "fixture", key: "K-1", stepId: "plan", pipelineRunId: run.id, ...pin };
    await assert.rejects(db.agentRun.create({ data: legacyAgent }));
    await db.agentRun.create({ data: { ...legacyAgent, pipelineNode: "plan" } });
    await db.user.delete({ where: { id: user.id } });
    assert.equal(await db.pipelineWorkRun.count(), 0);
    assert.equal(await db.pipelineRun.count(), 0);
    assert.equal(await db.agentRun.count(), 0);
  });
});
