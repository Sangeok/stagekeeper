import assert from "node:assert/strict";
import { it } from "node:test";
import { agentNext, createNextDeps } from "../../../src/server/agents/api";
import { publishTemplateRelease, activateTemplateRelease } from "../../../src/server/templates/api";
import { ensureRun, readFacts } from "../../../src/server/pipeline/run-service";
import { createBoardService } from "../../../src/server/pipeline/api";
import { installationFor } from "../../../packages/core/templates/release-manifest.mjs";
import { releaseRows, releaseAudit, withReleaseDatabase } from "./template-release-support";
import { createToolDeps } from "../../../src/server/mcp/deps";

const source = { kind: "git" as const, repository: "Sangeok/harness-templates" as const, commit: "a".repeat(40) };
const rows = (instruction: string) => releaseRows(instruction).map(row => row.path === "agents/dev.md"
  ? { ...row, body: row.body.replace("## step:start", "## step:start requires: planning") } : row);

it("an existing legacy execution keeps its source and receipt while a later root selects the new release", { timeout: 15000 }, async () => {
  await withReleaseDatabase(async ([db]) => {
    const firstRows = rows("Pinned original instruction.");
    const first = await publishTemplateRelease(db, { requestId: "r1", source, rows: firstRows, audit: releaseAudit });
    const second = await publishTemplateRelease(db, { requestId: "r2", source: { ...source, commit: "b".repeat(40) }, rows: rows("New release instruction."), audit: releaseAudit });
    assert.ok(first.ok && second.ok);
    await db.templateChannel.update({ where: { id: "default" }, data: { mode: "versioned", legacyWritesBlocked: true, activeReleaseId: first.item.releaseId, revision: 1 } });
    const user = await db.user.create({ data: { login: "execution-owner", githubId: 10, subscription: { create: { plan: "max" } } } });
    const project = await db.project.create({ data: { slug: "execution", name: "Execution", repoOwner: "test", repo: "test", branch: "dev", ownerUserId: user.id,
      workspaces: { create: { wsId: "app", agent: "app-dev", path: ".", verify: ["npm test"], readOnly: [] } } } });
    const pipeline = await db.pipeline.create({ data: { projectId: project.id, name: "Legacy", createdBy: "fixture" } });
    await db.project.update({ where: { id: project.id }, data: { defaultPipelineId: pipeline.id } });
    await db.pipelineVersion.create({ data: { projectId: project.id, pipelineId: pipeline.id, version: 1, nodes: ["plan", "implement", "accept", "doc-audit"], gates: [], createdBy: "fixture" } });
    const makeBoard = async (key: string, status = "planning") => {
      const backlog = await db.backlogItem.create({ data: { projectId: project.id, key, title: key, area: "app", source: "fixture" } });
      return db.boardItem.create({ data: { projectId: project.id, backlogItemId: backlog.id, agent: "app-dev", status, reason: "test", ...(status === "done" ? { acceptedAt: new Date() } : {}) } });
    };
    const board = await makeBoard("A");
    const run = await ensureRun(db, project.id, board.id, board.status, false);
    const auditBoard = await makeBoard("C", "done");
    const auditRoot = await ensureRun(db, project.id, auditBoard.id, auditBoard.status, false);
    const release = await db.templateRelease.findUniqueOrThrow({ where: { id: first.item.releaseId } });
    const installation = installationFor({ releaseId: release.id, rows: firstRows, language: "en", plan: "max", client: "claude", contractHash: release.contractHash });
    const execution = { kind: "legacy" as const, runId: run.id, node: "plan" };
    const deps = createNextDeps(db), scope = { projectId: project.id, tokenId: "fixture" };
    const opened = await agentNext(deps, scope, { agent: "app-dev", key: "A", execution, installation });
    assert.ok(opened.ok && !opened.item.done);
    assert.match(opened.item.instruction, /Pinned original instruction/);
    assert.equal(opened.item.templateRelease?.id, first.item.releaseId);
    assert.equal((await activateTemplateRelease(db, { requestId: "activate", releaseId: second.item.releaseId, expectedRevision: 1, audit: releaseAudit })).ok, true);
    await db.project.update({ where: { id: project.id }, data: { language: "ko" } });
    const resumed = await agentNext(deps, scope, { agent: "app-dev", key: "A", execution, installation });
    assert.ok(resumed.ok && !resumed.item.done);
    assert.equal(resumed.item.instruction, opened.item.instruction);
    assert.deepEqual(resumed.item.receipt, opened.item.receipt);
    const otherBoard = await makeBoard("B");
    const later = await ensureRun(db, project.id, otherBoard.id, otherBoard.status, false);
    assert.equal(later.templateReleaseId, second.item.releaseId);
    const newStep = await agentNext(deps, scope, { agent: "app-dev", key: "B", execution: { kind: "legacy", runId: later.id, node: "plan" }, installation });
    assert.ok(newStep.ok && !newStep.item.done);
    assert.match(newStep.item.instruction, /New release instruction/);
    assert.equal((await agentNext(deps, scope, { agent: "app-dev", key: "A", execution, installation: { ...installation, clientSurfaceHash: "0".repeat(64) }, outcome: "ok", receipt: opened.item.receipt })).ok, false);
    assert.equal(await db.agentRunStep.count(), 0);
    assert.equal(await db.agentRun.count(), 2);
    const pipelineService = createBoardService(db, { installation, requireInstallation: true });
    await pipelineService.advancePipeline(project.id, "C");
    const auditRun = await db.pipelineRun.findUniqueOrThrow({ where: { id: auditRoot.id }, include: { version: true } });
    assert.equal(auditRun.node, "doc-audit");
    const standalone = await agentNext(deps, scope, { agent: "doc-auditor", execution: { kind: "standalone" }, installation });
    assert.ok(standalone.ok && !standalone.item.done);
    assert.equal(standalone.item.templateRelease?.id, second.item.releaseId);
    assert.equal((await agentNext(deps, scope, { agent: "doc-auditor", execution: { kind: "standalone" }, installation, outcome: "ok", receipt: standalone.item.receipt })).ok, true);
    const facts = await readFacts(db, project.id, auditBoard, auditRun);
    assert.deepEqual(facts.closedAgents, []);
    await pipelineService.advancePipeline(project.id, "C");
    assert.equal((await db.pipelineRun.findUniqueOrThrow({ where: { id: auditRoot.id } })).closedAt, null);
    const auditExecution = { kind: "legacy" as const, runId: auditRoot.id, node: "doc-audit" };
    const own = await agentNext(deps, scope, { agent: "doc-auditor", execution: auditExecution, installation });
    assert.ok(own.ok && !own.item.done);
    assert.equal(own.item.templateRelease?.id, first.item.releaseId);
    assert.equal((await agentNext(deps, scope, { agent: "doc-auditor", execution: auditExecution, installation, outcome: "ok", receipt: own.item.receipt })).ok, true);
    await pipelineService.advancePipeline(project.id, "C");
    assert.ok((await db.pipelineRun.findUniqueOrThrow({ where: { id: auditRoot.id } })).closedAt);
  });
});

it("cutover refuses an unpinned open execution and automatic start rejects incompatible installation before materialization", async () => {
  await withReleaseDatabase(async ([db]) => {
    const release = await publishTemplateRelease(db, { requestId: "cutover", source, rows: rows("Instruction"), audit: releaseAudit });
    assert.ok(release.ok);
    const user = await db.user.create({ data: { login: "cutover-owner", githubId: 11 } });
    const project = await db.project.create({ data: { slug: "cutover", name: "Cutover", repoOwner: "test", repo: "test", branch: "dev", ownerUserId: user.id } });
    const old = await db.agentRun.create({ data: { projectId: project.id, agent: "pm", tokenId: "fixture", stepId: "start" } });
    const cutover = { mode: "versioned", legacyWritesBlocked: true, activeReleaseId: release.item.releaseId, revision: 1 };
    await assert.rejects(db.templateChannel.update({ where: { id: "default" }, data: cutover }));
    await db.agentRun.update({ where: { id: old.id }, data: { closedAt: new Date() } });
    await db.templateChannel.update({ where: { id: "default" }, data: cutover });
    const backlog = await db.backlogItem.create({ data: { projectId: project.id, key: "A", title: "A", area: "app", source: "test" } });
    const board = await db.boardItem.create({ data: { projectId: project.id, backlogItemId: backlog.id, agent: "app-dev", status: "planning", reason: "test" } });
    await assert.rejects(ensureRun(db, project.id, board.id, board.status, false, undefined, { requireInstallation: true }), /Update the installation/);
    assert.equal(await db.pipelineRun.count(), 0);
    assert.equal(await db.pipelineVersion.count(), 0);
    assert.equal(await db.pipeline.count(), 0);
    assert.equal((await db.boardItem.findUniqueOrThrow({ where: { id: board.id } })).currentRunId, null);
  });
});

it("a real MCP overview keeps compatible work runnable and pauses a different pinned surface without advancing it", async () => {
  await withReleaseDatabase(async ([db]) => {
    const firstRows = rows("First instruction");
    const first = await publishTemplateRelease(db, { requestId: "overview-r1", source, rows: firstRows, audit: releaseAudit });
    const secondRows = rows("Second instruction").map(row => ({ ...row, body: row.body.replace("Stub", "Different public stub") }));
    const second = await publishTemplateRelease(db, { requestId: "overview-r2", source: { ...source, commit: "d".repeat(40) }, rows: secondRows, audit: releaseAudit });
    assert.ok(first.ok && second.ok);
    await db.templateChannel.update({ where: { id: "default" }, data: { mode: "versioned", activeReleaseId: first.item.releaseId, legacyWritesBlocked: true, revision: 1 } });
    const user = await db.user.create({ data: { login: "overview", githubId: 73, subscription: { create: { plan: "max" } } } });
    const project = await db.project.create({ data: { slug: "overview", name: "Overview", repoOwner: "test", repo: "test", branch: "main", ownerUserId: user.id, workAutomationPaused: true,
      workspaces: { create: { wsId: "app", path: ".", agent: "app-dev", verify: ["npm test"], readOnly: [] } } } });
    const pipeline = await db.pipeline.create({ data: { projectId: project.id, name: "Legacy", createdBy: "test" } });
    await db.project.update({ where: { id: project.id }, data: { defaultPipelineId: pipeline.id } });
    await db.pipelineVersion.create({ data: { projectId: project.id, pipelineId: pipeline.id, version: 1, nodes: ["plan", "implement", "accept"], gates: [], createdBy: "test" } });
    const create = async (key: string) => {
      const backlog = await db.backlogItem.create({ data: { projectId: project.id, key, title: key, area: "app", source: "test" } });
      const item = await db.boardItem.create({ data: { projectId: project.id, backlogItemId: backlog.id, agent: "app-dev", status: "planning", reason: "test" } });
      return ensureRun(db, project.id, item.id, item.status, false);
    };
    await create("A");
    assert.ok((await activateTemplateRelease(db, { requestId: "overview-activate", releaseId: second.item.releaseId, expectedRevision: 1, audit: releaseAudit })).ok);
    const secondRun = await create("B");
    const release = await db.templateRelease.findUniqueOrThrow({ where: { id: first.item.releaseId } });
    const installation = installationFor({ releaseId: release.id, rows: firstRows, language: "en", plan: "max", client: "claude", contractHash: release.contractHash });
    const before = await db.pipelineRun.findUniqueOrThrow({ where: { id: secondRun.id } });
    const result = await createToolDeps(db).pipelineNext(project.id, undefined, undefined, "claude", installation);
    assert.ok(result.ok);
    assert.ok(result.item && typeof result.item === "object" && "items" in result.item && Array.isArray(result.item.items));
    assert.equal(result.item.items.find(item => item.key === "A")?.action, "dispatch");
    const wait = result.item.items.find(item => item.key === "B");
    assert.ok(wait?.action === "wait" && wait.on === "template");
    assert.equal(wait.templateRelease?.id, second.item.releaseId);
    assert.deepEqual(await db.pipelineRun.findUniqueOrThrow({ where: { id: secondRun.id } }), before);
    assert.equal(await db.agentRun.count(), 0);
  });
});
