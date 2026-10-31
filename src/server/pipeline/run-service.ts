import { randomUUID } from "node:crypto";
import { BOUNDARY, SLOT_FORMAT, PROJECT_AGENTS, slotAgent, dispatcherFor, isItemNode, cursorForStatus, defaultGraph, isGateId, sequence, expand, validateGraph, itemGraph, DEFAULT_SELECTION_POLICY } from "@harness/core/pipeline/pipeline.mjs";
import { validateExecutionGraph } from "@harness/core/pipeline/run-input.mjs";
import { qaEntryResult } from "./qa-query";
import { implVerifyEntryResult } from "./impl-verify-query";
import { readProjectUsageCapIn } from "@/server/usage/api";
import { Prisma, type PrismaClient, type PipelineVersion } from "@/generated/prisma/client";
import { readProjectPlanIn, READ_OPTIONS } from "@/server/projects/api";
import { decideNext, handoffIsLive, type PipelineNext } from "./run-rules";

import { projectWorkNext, type WorkNext } from "./work-run";

import { PipelineRejection, withPipelineWrite } from "./lock-pipeline";

type Db = PrismaClient | Prisma.TransactionClient;
export type Graph = { nodes: string[]; gates: string[] };
export type PipelineEntry = { runId: string; entryId: string; slotId: string };
export type GateEntry = { runId: string; entryId: string };
export type PipelineRunRow = { id: string; node: string; entryId: string | null; enteredAt: Date; closedAt: Date | null; version: { id: string; version: number; format: string | null; nodes: string[]; gates: string[] } };
export type PipelineFacts = { status: string; validation: string | null; accepted: boolean; approvedGates: string[]; closedAgents: string[]; format: string | null; slotComplete: boolean; implementationComplete: boolean; qaComplete?: boolean; implVerifyComplete?: boolean };

export const DEFAULT_PIPELINE_NAME = "Default";
export const PIPELINE_CANNOT_RUN_ITEMS = "This pipeline needs existing work as input. Use Run to choose a compatible task.";
export const PIPELINE_NOT_FOUND = "Pipeline not found.";
export const PIPELINE_VERSION_LIMIT = 2_147_483_647;
export const defaultPipelineIdOf = (projectId: string): string => `default_${projectId}`;

export type PipelineView = {
  id: string; name: string; isDefault: boolean;
  definition: { steps: string[]; gates: string[]; selectionPolicy?: string };
  saved: { version: number; createdAt: Date } | null;
  runnable: { nodes: string[]; gates: string[]; format: string | null; selectionPolicy?: string | null } | null;
};
export type PipelinesView = { pipelines: PipelineView[]; rules: Record<string, string>; autoProposeEnabled: boolean };
export type PipelineChangeView = { fromName: string; toName: string };
export type ItemPipelineView = { pipelineId: string | null; name: string; canChange: boolean; runState: "running" | "completed" | "closed" | null };

export async function ensureDefaultPipeline(tx: Prisma.TransactionClient, projectId: string): Promise<string> {
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { defaultPipelineId: true } });
  const id = project.defaultPipelineId ?? defaultPipelineIdOf(projectId);
  if (project.defaultPipelineId === null) {
    await tx.$executeRaw`INSERT INTO "Pipeline" ("id", "projectId", "name", "createdBy")
      VALUES (${id}, ${projectId}, ${DEFAULT_PIPELINE_NAME}, 'pipeline') ON CONFLICT ("id") DO NOTHING`;
  }
  const pipeline = await tx.pipeline.findFirst({ where: { id, projectId, archivedAt: null }, select: { id: true } });
  if (!pipeline) throw new PipelineRejection(PIPELINE_NOT_FOUND);
  if (project.defaultPipelineId === null) await tx.project.update({ where: { id: projectId }, data: { defaultPipelineId: id } });
  return id;
}

export async function nextPipelineVersion(tx: Prisma.TransactionClient, projectId: string, count = 1): Promise<number> {
  const latest = await tx.pipelineVersion.aggregate({ where: { projectId }, _max: { version: true } });
  const current = latest._max.version ?? 0;
  if (current + count > PIPELINE_VERSION_LIMIT) throw new PipelineRejection("Pipeline version limit reached.");
  return current + 1;
}

export async function ensureRunnableVersion(tx: Prisma.TransactionClient, projectId: string, pipelineId?: string): Promise<PipelineVersion> {
  const defaultId = await ensureDefaultPipeline(tx, projectId);
  const id = pipelineId ?? defaultId;
  const pipeline = await tx.pipeline.findFirst({ where: { id, projectId, archivedAt: null }, select: { id: true } });
  if (!pipeline) throw new PipelineRejection(PIPELINE_NOT_FOUND);
  const existing = await tx.pipelineVersion.findFirst({ where: { projectId, pipelineId: id }, orderBy: { version: "desc" } });
  if (existing) {
    if (existing.format !== null && existing.format !== SLOT_FORMAT) throw new Error("Unsupported pipeline format; update the compatible bundle.");
    return existing;
  }
  if (id !== defaultId) throw new PipelineRejection(PIPELINE_CANNOT_RUN_ITEMS);
  const definition = await tx.pipelineDefinition.findFirst({ where: { pipelineId: id }, select: { id: true } });
  if (definition) throw new Error("Default pipeline has a definition without a runnable version.");
  const flags = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { autoScoutEnabled: true, autoProposeEnabled: true } });
  const graph = initialGraph(await readProjectPlanIn(tx, projectId), flags);
  const version = await nextPipelineVersion(tx, projectId);
  const definitionId = randomUUID(), versionId = randomUUID();
  const definitions = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "PipelineDefinition" ("id", "pipelineId", "version", "steps", "gates", "createdBy")
    VALUES (${definitionId}, ${id}, 1, ARRAY[${Prisma.join(graph.nodes)}]::text[], ARRAY[${Prisma.join(graph.gates)}]::text[], 'pipeline')
    ON CONFLICT ("pipelineId", "version") DO NOTHING RETURNING "id"`;
  const versions = await tx.$queryRaw<{ id: string }[]>`INSERT INTO "PipelineVersion" ("id", "projectId", "pipelineId", "version", "nodes", "gates", "createdBy", "format")
    VALUES (${versionId}, ${projectId}, ${id}, ${version}, ARRAY[${Prisma.join(graph.nodes)}]::text[], ARRAY[${Prisma.join(graph.gates)}]::text[], 'pipeline', ${SLOT_FORMAT})
    ON CONFLICT ("projectId", "version") DO NOTHING RETURNING "id"`;
  if (definitions.length !== 1 || versions.length !== 1) throw new Error("Default pipeline materialization conflicted.");
  return tx.pipelineVersion.findUniqueOrThrow({ where: { id: versionId } });
}

export async function loadPipelinesViewIn(tx: Prisma.TransactionClient, projectId: string): Promise<PipelinesView> {
  const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { defaultPipelineId: true, autoProposeEnabled: true, autoScoutEnabled: true } });
  const defaultId = project.defaultPipelineId ?? defaultPipelineIdOf(projectId);
  const rows = await tx.pipeline.findMany({ where: { projectId, archivedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { definitions: { orderBy: { version: "desc" }, take: 1 } } });
  const versions = await tx.pipelineVersion.findMany({
    where: { projectId, pipelineId: { in: rows.map(row => row.id) } },
    orderBy: { version: "desc" }, distinct: ["pipelineId"],
    select: { pipelineId: true, nodes: true, gates: true, format: true, selectionPolicy: true },
  });
  const versionByPipeline = new Map(versions.map(version => [version.pipelineId, version]));
  const rules = await tx.pipelineRule.findMany({ where: { projectId }, select: { type: true, pipelineId: true } });
  const plan = await readProjectPlanIn(tx, projectId);
  if (project.defaultPipelineId !== null && !rows.some(row => row.id === defaultId)) throw new Error("Default pipeline is missing or archived.");
  const virtual = (): PipelineView => {
    const graph = initialGraph(plan, project);
    return { id: defaultId, name: DEFAULT_PIPELINE_NAME, isDefault: true, definition: { steps: graph.nodes, gates: graph.gates }, saved: null, runnable: { ...graph, format: SLOT_FORMAT } };
  };
  const pipelines: PipelineView[] = rows.map(row => {
    const definition = row.definitions[0], version = versionByPipeline.get(row.id);
    if (!definition) {
      if (row.id !== defaultId || version) throw new Error("Pipeline definition is missing.");
      return { ...virtual(), name: row.name };
    }
    if (row.id === defaultId && !version) throw new Error("Default pipeline has no runnable version.");
    if (version && version.format !== null && version.format !== SLOT_FORMAT) throw new Error("Unsupported pipeline format; update the compatible bundle.");
    return { id: row.id, name: row.name, isDefault: row.id === defaultId,
      definition: { steps: definition.steps, gates: definition.gates, ...(definition.selectionPolicy ? { selectionPolicy: definition.selectionPolicy } : {}) }, saved: { version: definition.version, createdAt: definition.createdAt },
      runnable: version && validateGraph(version, plan).ok ? { nodes: version.nodes, gates: version.gates, format: version.format, selectionPolicy: version.selectionPolicy } : null };
  });
  if (!pipelines.some(row => row.id === defaultId)) pipelines.unshift(virtual());
  const definitions = Object.fromEntries(pipelines.map(pipeline => [pipeline.id, pipeline.definition]));
  for (const pipeline of pipelines) {
    const expanded = expand(pipeline.id, definitions);
    if (!expanded.ok || !validateGraph(expanded.graph, plan).ok) pipeline.runnable = null;
  }
  pipelines.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return { pipelines, rules: Object.fromEntries(rules.map(rule => [rule.type, rule.pipelineId])), autoProposeEnabled: project.autoProposeEnabled };
}

export async function loadPipelinesView(client: PrismaClient, projectId: string): Promise<PipelinesView> {
  return client.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return loadPipelinesViewIn(tx, projectId);
  }, READ_OPTIONS);
}

export async function loadItemPipelineView(client: PrismaClient, projectId: string, boardItemId: string): Promise<ItemPipelineView> {
  const row = await client.boardItem.findFirst({ where: { id: boardItemId, projectId }, select: {
    status: true, discardedAt: true,
    run: { select: { id: true, enteredAt: true, closedAt: true, version: { select: { pipelineId: true, format: true, pipeline: { select: { name: true } } } }, agentRuns: { take: 1, select: { id: true } } } },
    events: { where: { note: { startsWith: "pipeline-completed:" } }, orderBy: { at: "desc" }, take: 1, select: { note: true, at: true } },
  } });
  const run = row?.run;
  const completed = !!run && row?.events.some(event => event.note === `pipeline-completed:${run.id}` && event.at >= run.enteredAt);
  return { pipelineId: run?.version.pipelineId ?? null, name: run?.version.pipeline?.name ?? DEFAULT_PIPELINE_NAME,
    runState: run ? (run.closedAt ? (completed ? "completed" : "closed") : "running") : null,
    canChange: !!row && row.discardedAt === null && row.status === "proposed" && !!run && run.closedAt === null && run.version.format === SLOT_FORMAT && run.agentRuns.length === 0 };
}

export async function loadPipelineChanges(client: PrismaClient, projectId: string, notes: readonly (string | null)[]): Promise<Record<string, PipelineChangeView>> {
  const parsed = notes.flatMap(note => {
    const match = note?.match(/^pipeline-changed:([^:]+):([^:]+)$/);
    return match ? [{ note: match[0], from: match[1], to: match[2] }] : [];
  });
  const result: Record<string, PipelineChangeView> = Object.create(null);
  if (parsed.length === 0) return result;
  const versions = await client.pipelineVersion.findMany({ where: { projectId, id: { in: [...new Set(parsed.flatMap(row => [row.from, row.to]))] } },
    select: { id: true, pipeline: { select: { name: true } } } });
  const names = new Map(versions.map(version => [version.id, version.pipeline?.name ?? DEFAULT_PIPELINE_NAME]));
  for (const row of parsed) {
    const fromName = names.get(row.from), toName = names.get(row.to);
    if (fromName !== undefined && toName !== undefined) result[row.note] = { fromName, toName };
  }
  return result;
}

export async function ensureRunIn(tx: Prisma.TransactionClient, projectId: string, boardItemId: string, status: string, fresh: boolean, pipelineId?: string): Promise<PipelineRunRow> {
  const item = await tx.boardItem.findFirst({ where: { id: boardItemId, projectId }, select: { id: true, currentRunId: true, updatedAt: true } });
  if (!item) throw new PipelineRejection("Board item not found.");
  const found = item.currentRunId
    ? await tx.pipelineRun.findUnique({ where: { id: item.currentRunId, boardItemId }, include: { version: true } })
    : await tx.pipelineRun.findFirst({ where: { boardItemId }, orderBy: { createdAt: "desc" }, include: { version: true } });
  if (found) {
    if (!item.currentRunId) await tx.boardItem.update({ where: { id: boardItemId }, data: { currentRunId: found.id, updatedAt: item.updatedAt } });
    return found;
  }
  const version = pipelineId ? await ensureExecutionVersion(tx, projectId, pipelineId) : await ensureRunnableVersion(tx, projectId);
  const graph: Graph = itemGraph(version);
  const node = (fresh ? sequence(graph)[0] : cursorForStatus(graph, status)) ?? sequence(graph)[0];
  const run = await tx.pipelineRun.create({ data: { boardItemId, versionId: version.id, node, entryId: version.format === SLOT_FORMAT ? randomUUID() : null }, include: { version: true } });
  await tx.boardItem.update({ where: { id: boardItemId }, data: { currentRunId: run.id, updatedAt: item.updatedAt } });
  return run;
}

export async function ensureExecutionVersion(tx: Prisma.TransactionClient, projectId: string, pipelineId: string): Promise<PipelineVersion> {
  const view = await loadPipelinesViewIn(tx, projectId);
  const pipeline = view.pipelines.find(candidate => candidate.id === pipelineId);
  if (!pipeline) throw new PipelineRejection(PIPELINE_NOT_FOUND);
  const composed = expand(pipelineId, Object.fromEntries(view.pipelines.map(candidate => [candidate.id, candidate.definition])));
  if (!composed.ok) throw new PipelineRejection(composed.reason);
  const valid = validateExecutionGraph(composed.graph, await readProjectPlanIn(tx, projectId));
  if (!valid.ok) throw new PipelineRejection(valid.reason);
  if (!pipeline.saved && pipeline.isDefault) return ensureRunnableVersion(tx, projectId, pipelineId);
  const latest = await tx.pipelineVersion.findFirst({ where: { projectId, pipelineId }, orderBy: { version: "desc" } });
  if (latest?.format === SLOT_FORMAT && JSON.stringify(latest.nodes) === JSON.stringify(composed.graph.nodes)
    && JSON.stringify([...latest.gates].sort()) === JSON.stringify([...composed.graph.gates].sort())
    && (latest.selectionPolicy ?? DEFAULT_SELECTION_POLICY) === (composed.graph.selectionPolicy ?? DEFAULT_SELECTION_POLICY)) return latest;
  return tx.pipelineVersion.create({ data: { projectId, pipelineId, version: await nextPipelineVersion(tx, projectId),
    ...composed.graph, format: SLOT_FORMAT, createdBy: "pipeline" } });
}

export async function ensureRun(client: PrismaClient, projectId: string, boardItemId: string, status: string, fresh: boolean, pipelineId?: string): Promise<PipelineRunRow> {
  return withPipelineWrite(client, projectId, undefined, ({ tx }) => ensureRunIn(tx, projectId, boardItemId, status, fresh, pipelineId));
}



type RowFacts = { id: string; status: string; validation: string | null; acceptedAt: Date | null; agent?: string; backlogItem?: { key: string } };
const NODE_AGENTS = ["doc-auditor", "feature-scout"];

export async function readFacts(db: Db, projectId: string, row: RowFacts, run: PipelineRunRow): Promise<PipelineFacts> {
  if (run.version.format !== null && run.version.format !== SLOT_FORMAT) throw new Error("Unsupported pipeline format; update the compatible bundle.");
  if (run.version.format === SLOT_FORMAT && !run.entryId) throw new Error("Missing pipeline entry; refresh pipeline_next.");
  const bound = run.version.format === SLOT_FORMAT;
  if (run.node === "impl-verify") {
    if (!bound || !run.entryId) throw new Error("impl-verify requires a bound pipeline entry");
    const item = await db.boardItem.findUniqueOrThrow({ where: { id: row.id }, select: { agent: true } });
    const result = await implVerifyEntryResult(db, projectId, row.id, item.agent, run.id, run.entryId);
    return { status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, format: run.version.format, approvedGates: [], closedAgents: [], implementationComplete: false, slotComplete: false, implVerifyComplete: result.complete };
  }
  if (run.node === "qa") {
    if (!bound || !run.entryId) throw new Error("QA requires a bound pipeline entry");
    const item = await db.boardItem.findUniqueOrThrow({ where: { id: row.id }, select: { agent: true } });
    const qa = await qaEntryResult(db, projectId, row.id, item.agent, run.id, run.entryId);
    return { status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, format: run.version.format, approvedGates: [], closedAgents: [], implementationComplete: false, slotComplete: false, qaComplete: qa.complete };
  }
  if (bound && run.node !== "implement") {
    const agent = slotAgent(run.node);
    const slotComplete = agent !== null && PROJECT_AGENTS.includes(agent)
      ? await db.agentRun.findFirst({ where: { projectId, agent, key: null, pipelineRunId: run.id, pipelineEntryId: run.entryId, closedAt: { not: null } }, select: { id: true } }) !== null
      : false;
    return { status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, format: run.version.format, approvedGates: [], closedAgents: [], implementationComplete: false, slotComplete };
  }
  const completed = await db.agentRun.findMany({
    where: { projectId, closedAt: { not: null }, ...(bound
      ? { pipelineRunId: run.id, pipelineEntryId: run.entryId }
      : { pipelineRunId: null, openedAt: { gte: run.enteredAt } }) },
    include: { steps: { where: { OR: [{ accepted: true }, { accepted: null }] }, select: { stepId: true, outcome: true } }, reports: { where: { boardItemId: row.id } } },
  });
  const item = row.agent && row.backlogItem ? { agent: row.agent, backlogItem: row.backlogItem }
    : await db.boardItem.findUniqueOrThrow({ where: { id: row.id }, select: { agent: true, backlogItem: { select: { key: true } } } });
  const developer = completed.filter((r) => r.agent === item.agent && r.key === item.backlogItem.key);
  const successful = developer.filter((r) => r.stepId === "report" && r.steps.some((s) => s.stepId === "verify" && s.outcome === "ok") && r.steps.some((s) => s.stepId === "report" && s.outcome === "ok"));
  let implementationComplete = successful.some((r) => r.reports.some((report) => report.actor === item.agent));
  if (!bound && !implementationComplete && developer.length === 1 && successful.length === 1) {
    const candidate = successful[0];
    implementationComplete = await db.report.count({ where: { boardItemId: row.id, actor: item.agent, agentRunId: null, at: { gte: candidate.openedAt, lte: candidate.closedAt! } } }) > 0;
  }
  const completion = { format: run.version.format, implementationComplete, slotComplete: completed.some((r) => r.agent === dispatcherFor(run.node, item.agent)) };
  if (bound) return { ...completion, status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, approvedGates: [], closedAgents: [] };
  const events = await db.transitionEvent.findMany({
    where: { boardItemId: row.id, at: { gte: run.enteredAt } },
    select: { from: true, to: true, actor: true, note: true },
  });
  const approvedGates = events.flatMap((e) => {
    if (e.note?.startsWith("gate:")) return [e.note.slice("gate:".length)];
    if (e.actor !== "human") return [];
    const hit = Object.entries(BOUNDARY as Record<string, { from: string; to: string }>).find(([, b]) => b.from === e.from && b.to === e.to);
    return hit ? [hit[0]] : [];
  });
  const closed = await db.agentRun.findMany({
    where: { projectId, agent: { in: NODE_AGENTS }, key: null, openedAt: { gte: run.enteredAt }, closedAt: { not: null } },
    select: { agent: true },
  });
  return { ...completion, status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, approvedGates, closedAgents: closed.map((r) => r.agent) };
}

export async function nextFor(db: PrismaClient, projectId: string, key: string): Promise<PipelineNext> {
  const row = await db.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" } });
  if (!row) throw new Error(`no such board item: ${key}`);
  const run = await ensureRun(db, projectId, row.id, row.status, false);
  if (run.version.format !== null && (run.version.format !== SLOT_FORMAT || !run.entryId)) throw new Error("Unsupported pipeline format or missing entry; update the compatible bundle.");
  const node = run.closedAt ? null : run.node;
  const open = node === null || isGateId(node) || node === "accept"
    ? null
    : await db.agentRun.findFirst({ where: { projectId, agent: dispatcherFor(node, row.agent) ?? "", key: isItemNode(node) ? key : null, closedAt: null,
      pipelineRunId: run.version.format === SLOT_FORMAT ? run.id : null, pipelineEntryId: run.version.format === SLOT_FORMAT ? run.entryId : null }, orderBy: { openedAt: "desc" }, include: { steps: { where: { OR: [{ accepted: true }, { accepted: null }] }, orderBy: { at: "desc" }, take: 1 } } });
  const last = open?.steps[0];
  const handoff = last?.outcome === "handoff" && handoffIsLive(last.at, row.updatedAt) ? { note: last.note } : null;
  const dispatches = node !== null && dispatcherFor(node, row.agent) !== null;
  const acceptanceFailure = node === "accept"
    ? await db.acceptanceFailure.findFirst({ where: { boardItemId: row.id, clearedAt: null }, select: { checks: true, note: true } })
    : null;
  const cap = dispatches ? await readProjectUsageCapIn(db, projectId) : null;
  const qaFailure = node === "qa" && run.entryId && !open ? (await qaEntryResult(db, projectId, row.id, row.agent, run.id, run.entryId)).failure : null;
  const implVerifyFailure = node === "impl-verify" && run.entryId && !open ? (await implVerifyEntryResult(db, projectId, row.id, row.agent, run.id, run.entryId)).failure : null;
  return decideNext({
    key, version: run.version.version, node, status: row.status, planCommit: row.planCommit, agent: row.agent, handoff, hasResumableRun: open !== null,
    format: run.version.format, entry: run.entryId ? { runId: run.id, entryId: run.entryId, slotId: run.node } : undefined,
    cap, acceptanceFailure, qaFailure, implVerifyFailure,
  });
}

export async function headFor(db: PrismaClient, projectId: string): Promise<WorkNext> {
  return projectWorkNext(db, projectId);
}

function initialGraph(plan: string, flags: { autoScoutEnabled: boolean; autoProposeEnabled: boolean }): Graph {
  const graph = defaultGraph(plan);
  const nodes = graph.nodes.filter(node => node !== "assign-work" || flags.autoProposeEnabled).filter(node => node !== "discover-work" || flags.autoScoutEnabled);
  return { nodes, gates: graph.gates };
}
