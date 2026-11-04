import { z } from "zod";
import { manifestHash, prepareTemplateRelease, selectTemplateLanguage } from "@harness/core/templates/release-manifest.mjs";
import { dispatcherFor, isItemNode, slotAgent } from "@harness/core/pipeline/pipeline.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { splitTemplate } from "./steps";
import { previousResult, reject, storeTemplateReleaseIn, transact, validateRenderContract, validateRequest } from "./release-service";
import type { DeploymentAudit } from "./release-service";

const id = z.string().min(1).max(200);
export const templateCutoverEvidenceSchema = z.object({
  schemaVersion: z.literal(1), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetIdentityHash: z.string().regex(/^[a-f0-9]{64}$/), codeSha: z.string().regex(/^[a-f0-9]{40}$/),
  maintenanceReference: id, writersDrained: z.literal(true),
  readers: z.array(z.object({ identity: id, codeSha: z.string().regex(/^[a-f0-9]{40}$/), protocol: z.literal("template-release-v1") }).strict()).min(1),
  inventory: z.array(z.object({ lang: id, path: id }).strict()).min(1),
  excluded: z.array(z.object({ lang: id, path: id, reason: id }).strict()),
  unboundRuns: z.array(z.discriminatedUnion("kind", [
    z.object({ id, kind: z.literal("standalone"), evidence: id }).strict(),
    z.object({ id, kind: z.literal("legacy"), runId: id, node: id, evidence: id }).strict(),
  ])),
}).strict();
export type TemplateCutoverEvidence = z.infer<typeof templateCutoverEvidenceSchema>;

async function snapshotIn(tx: Prisma.TransactionClient) {
  const orderBy = { id: "asc" } as const;
  const templates = await tx.template.findMany({ orderBy: [{ lang: "asc" }, { path: "asc" }] });
  const projects = await tx.project.findMany({ orderBy, select: { id: true, language: true } });
  const workspaces = await tx.workspace.findMany({ orderBy });
  const pipelines = await tx.pipelineRun.findMany({ orderBy, include: { version: true, boardItem: { include: { backlogItem: true } } } });
  const workRuns = await tx.pipelineWorkRun.findMany({ orderBy, include: { version: true } });
  const agents = await tx.agentRun.findMany({ orderBy, include: { steps: { orderBy }, reports: { orderBy } } });
  const reports = await tx.report.findMany({ orderBy });
  const events = await tx.transitionEvent.findMany({ orderBy });
  const channel = await tx.templateChannel.findUniqueOrThrow({ where: { id: "default" } });
  const data = { templates, projects, workspaces, pipelines, workRuns, agents, reports, events, channel };
  return { data, hash: manifestHash(JSON.parse(JSON.stringify(data))) };
}

export async function snapshotTemplateCutover(db: PrismaClient) {
  const snapshot = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return snapshotIn(tx);
  }, { isolationLevel: "RepeatableRead", timeout: 60_000 });
  return { schemaVersion: 1 as const, capturedAt: new Date().toISOString(), ...snapshot };
}

type Snapshot = Awaited<ReturnType<typeof snapshotIn>>["data"];
function captureLegacyEvidence(snapshot: Snapshot, run: Snapshot["pipelines"][number], capturedAt: string) {
  const item = run.boardItem, key = item.backlogItem.key;
  const afterEntry = snapshot.agents.filter(agent => agent.projectId === item.projectId && agent.openedAt >= run.enteredAt && agent.closedAt !== null);
  const lastPlan = snapshot.events.filter(event => event.boardItemId === item.id && event.note === "plan").sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  const validationSteps = snapshot.agents.filter(agent => agent.projectId === item.projectId && agent.agent === "plan-verifier" && agent.key === key && agent.pipelineRunId === null)
    .flatMap(agent => agent.steps.filter(step => step.accepted !== false && step.stepId === "verify" && step.outcome === "ok" && (!lastPlan || step.at > lastPlan.at)));
  const reportSteps = snapshot.agents.filter(agent => agent.projectId === item.projectId && agent.key === key).flatMap(agent => agent.steps.filter(step => step.accepted !== false && step.stepId === "verify"));
  const ids = (rows: { id: string }[]) => [...new Set(rows.map(row => row.id))].sort();
  return { version: 1, capturedAt, node: run.node, enteredAt: run.enteredAt.toISOString(),
    completedRunIds: ids(afterEntry.filter(agent => agent.pipelineRunId === null)),
    projectClosedRunIds: ids(afterEntry.filter(agent => agent.key === null && ["doc-auditor", "feature-scout"].includes(agent.agent))),
    unlinkedReportIds: ids(snapshot.reports.filter(report => report.boardItemId === item.id && report.agentRunId === null)),
    validationStepIds: ids(validationSteps), reportVerifyStepIds: ids(reportSteps) };
}

export async function bootstrapTemplateReleases(db: PrismaClient, command: { requestId: string; audit: DeploymentAudit; evidence: TemplateCutoverEvidence }) {
  const input = structuredClone(command);
  let evidence: TemplateCutoverEvidence;
  try {
    validateRequest(input.requestId, input.audit);
    evidence = templateCutoverEvidenceSchema.parse(input.evidence);
    if (evidence.codeSha !== input.audit.codeSha || evidence.targetIdentityHash !== input.audit.targetIdentityHash
      || evidence.readers.some(reader => reader.codeSha !== evidence.codeSha)) reject("Cutover evidence differs from the approved readers or target");
  } catch { return { ok: false as const, reason: "Complete maintenance, reader and snapshot evidence is required" }; }
  const inputHash = manifestHash({ audit: input.audit, evidence });
  return transact(db, async tx => {
    const previous = await previousResult(tx, "bootstrap", input.requestId, inputHash);
    if (previous) return previous;
    await tx.$executeRaw`LOCK TABLE "Template", "Project", "Workspace", "PipelineVersion", "PipelineWorkRun", "PipelineRun", "AgentRun", "AgentRunStep", "BoardItem", "BacklogItem", "Report", "TransitionEvent" IN SHARE ROW EXCLUSIVE MODE`;
    await tx.$queryRaw`SELECT id FROM "TemplateChannel" WHERE id = 'default' FOR UPDATE`;
    const snapshot = await snapshotIn(tx), data = snapshot.data;
    if (snapshot.hash !== evidence.snapshotHash) reject("Snapshot drift; capture and approve a new private snapshot");
    if (data.channel.mode !== "legacy" || data.channel.legacyWritesBlocked || data.channel.activeReleaseId !== null) reject("Cutover requires the untouched legacy channel");
    const keyOf = (row: { lang: string; path: string }) => `${row.lang}/${row.path}`;
    const included = new Set(evidence.inventory.map(keyOf)), excluded = new Set(evidence.excluded.map(keyOf));
    if (included.size !== evidence.inventory.length || excluded.size !== evidence.excluded.length
      || [...included].some(key => excluded.has(key)) || included.size + excluded.size !== data.templates.length
      || data.templates.some(row => !included.has(keyOf(row)) && !excluded.has(keyOf(row)))) reject("Every legacy template must have one explicit inventory disposition");
    const source = { kind: "legacy-snapshot" as const, snapshotHash: snapshot.hash };
    let prepared;
    try {
      prepared = prepareTemplateRelease(data.templates.filter(row => included.has(keyOf(row))).map(({ lang, path, body }) => ({ lang, path, body })), source);
      validateRenderContract(prepared.rows);
      for (const row of prepared.rows.filter(row => row.path.startsWith("agents/"))) if (!splitTemplate(row.body).steps.length) reject("Agent steps are required");
    } catch { return reject("Approved legacy runtime inventory is not a complete valid release"); }
    const release = await storeTemplateReleaseIn(tx, prepared, source);
    await tx.templateChannel.update({ where: { id: "default" }, data: { legacyWritesBlocked: true } });
    const pinnedAt = new Date();
    const pinFor = (projectId: string) => {
      const project = data.projects.find(row => row.id === projectId);
      const language = project && selectTemplateLanguage(prepared.manifest.languages, project.language);
      if (!language) return reject("An open execution has no complete release language");
      return { templateReleaseId: release.id, templateLanguage: language, templatePinnedAt: pinnedAt, templatePinOrigin: "cutover" };
    };
    const openWork = data.workRuns.filter(run => !run.closedAt), openPipelines = data.pipelines.filter(run => !run.closedAt);
    for (const run of openWork) {
      if (run.templateReleaseId || run.version.format !== "slots-v1") reject("Unsupported or already pinned work execution");
      await tx.pipelineWorkRun.update({ where: { id: run.id }, data: pinFor(run.projectId) });
    }
    for (const run of openPipelines) {
      if (run.templateReleaseId || run.sourceWorkRunId || run.continuedFromRunId || ![null, "slots-v1"].includes(run.version.format)
        || run.boardItem.currentRunId !== run.id || run.boardItem.discardedAt || (run.version.format === "slots-v1" && !run.entryId)) reject("Open pipeline lineage requires maintenance repair before cutover");
      await tx.pipelineRun.update({ where: { id: run.id }, data: { ...pinFor(run.boardItem.projectId),
        ...(run.version.format === null ? { legacyEvidence: captureLegacyEvidence(data, run, pinnedAt.toISOString()) } : {}) } });
    }
    const unbound = new Map(evidence.unboundRuns.map(run => [run.id, run]));
    if (unbound.size !== evidence.unboundRuns.length) reject("Duplicate cutover run disposition");
    for (const run of data.agents.filter(run => !run.closedAt)) {
      if (run.templateReleaseId || run.revision >= 2_147_483_647) reject("Open role cannot receive a cutover revision");
      const pin = pinFor(run.projectId);
      const logical = data.workspaces.some(ws => ws.projectId === run.projectId && ws.agent === run.agent) ? "dev"
        : run.agent === "work-assigner" ? "pm" : run.agent === "work-discoverer" ? "feature-scout" : run.agent;
      const body = prepared.rows.find(row => row.lang === pin.templateLanguage && row.path === `agents/${logical}.md`)?.body;
      if (!body || !splitTemplate(body).steps.some(step => step.id === run.stepId)) reject("An open role cursor is absent from the approved R0 instructions");
      let binding = {};
      if (run.pipelineRunId) {
        const parent = openPipelines.find(parent => parent.id === run.pipelineRunId && parent.boardItem.projectId === run.projectId);
        if (!parent || parent.version.format !== "slots-v1" || parent.entryId !== run.pipelineEntryId || dispatcherFor(parent.node, parent.boardItem.agent) !== run.agent
          || run.key !== (isItemNode(parent.node) ? parent.boardItem.backlogItem.key : null)) reject("Existing role binding is not the current open parent");
      } else if (run.workRunId) {
        const parent = openWork.find(parent => parent.id === run.workRunId && parent.projectId === run.projectId);
        if (!parent || parent.entryId !== run.workEntryId || slotAgent(parent.node) !== run.agent || run.key !== null) reject("Existing work role binding is not current");
      } else {
        const disposition = unbound.get(run.id);
        if (!disposition) reject("Every unbound open role needs explicit verified cutover evidence");
        unbound.delete(run.id);
        const candidates = openPipelines.filter(parent => parent.version.format === null && parent.boardItem.projectId === run.projectId
          && dispatcherFor(parent.node, parent.boardItem.agent) === run.agent && run.key === (isItemNode(parent.node) ? parent.boardItem.backlogItem.key : null) && run.openedAt >= parent.enteredAt);
        if (disposition.kind === "legacy") {
          if (candidates.length !== 1 || candidates[0].id !== disposition.runId || candidates[0].node !== disposition.node) reject("Legacy role parent is not uniquely proven");
          binding = { pipelineRunId: disposition.runId, pipelineEntryId: null, pipelineNode: disposition.node };
        } else if (candidates.length || run.key !== null || !["doc-auditor", "feature-scout", "pm", "work-discoverer", "work-assigner"].includes(run.agent)) reject("Independent role identity is not proven");
      }
      await tx.agentRun.update({ where: { id: run.id }, data: { ...pin, ...binding, revision: { increment: 1 } } });
    }
    if (unbound.size) reject("Cutover evidence names a closed or already bound role");
    const result = { releaseId: release.id, previousReleaseId: null, revision: data.channel.revision + 1 };
    await tx.templateChannel.update({ where: { id: "default" }, data: { mode: "versioned", activeReleaseId: release.id, revision: result.revision } });
    await tx.templateDeployment.create({ data: { operation: "bootstrap", requestId: input.requestId, inputHash, releaseId: release.id, ...input.audit,
      result: { ...result, snapshotHash: snapshot.hash, evidence, revisedAgentRunIds: data.agents.filter(run => !run.closedAt).map(run => run.id) } } });
    return result;
  });
}
