import { createHash } from "node:crypto";
import { DEFAULT_SELECTION_POLICY, expand, workPrefix, type GraphInput } from "@harness/core/pipeline/pipeline.mjs";
import { pipelineInputReason, validateExecutionGraph } from "@harness/core/pipeline/run-input.mjs";
import { readProjectAccessIn, READ_OPTIONS } from "@/server/projects/api";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ServerResult } from "@/server/result";
import { loadPipelinesViewIn, PIPELINE_NOT_FOUND } from "./run-service";
import { PipelineRejection } from "./lock-pipeline";

export type RunTarget = { id: string; kind: "backlog" | "board"; key: string; title: string; agent: string | null; updatedAt: string | null; reason: string | null };
export type RunPreparation = { pipelineId: string; name: string; graphKey: string; nodes: string[]; gates: string[]; agents: string[]; targets: RunTarget[]; projectRun?: { id: string; pipelineName: string; entryId: string; node: string; reason: string | null; closed: boolean }; canStartWithoutWork: boolean };
export type StartPipelineInput = { pipelineId: string; graphKey: string; targetId: string; targetKind: "backlog" | "board"; agent: string; expectedUpdatedAt: string | null };

export function executionKey(graph: GraphInput): string {
  return createHash("sha256").update(JSON.stringify([graph.nodes, [...graph.gates].sort(), graph.nodes.includes("assign-work") ? graph.selectionPolicy ?? DEFAULT_SELECTION_POLICY : null])).digest("hex");
}

export async function readExecutionGraph(tx: Prisma.TransactionClient, projectId: string, pipelineId: string, plan: string): Promise<{ name: string; nodes: string[]; gates: string[]; selectionPolicy?: string }> {
  const view = await loadPipelinesViewIn(tx, projectId);
  const pipeline = view.pipelines.find(candidate => candidate.id === pipelineId);
  if (!pipeline) throw new PipelineRejection(PIPELINE_NOT_FOUND);
  const expanded = expand(pipelineId, Object.fromEntries(view.pipelines.map(candidate => [candidate.id, candidate.definition])));
  if (!expanded.ok) throw new PipelineRejection(expanded.reason);
  const valid = validateExecutionGraph(expanded.graph, plan);
  if (!valid.ok) throw new PipelineRejection(valid.reason);
  return { name: pipeline.name, ...expanded.graph };
}

export async function preparePipelineRun(db: PrismaClient, projectId: string, userId: string, pipelineId: string): Promise<ServerResult<RunPreparation>> {
  try {
    return await db.$transaction(async tx => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const project = await tx.project.findFirst({ where: { id: projectId, ownerUserId: userId }, select: { id: true } });
      if (!project) throw new PipelineRejection("Project not found.");
      const access = await readProjectAccessIn(tx, projectId);
      if (!access.available) throw new PipelineRejection(access.reason);
      const graph = await readExecutionGraph(tx, projectId, pipelineId, access.plan);
      const board = await tx.boardItem.findMany({ where: { projectId, discardedAt: null }, distinct: ["backlogItemId"], orderBy: { proposedOn: "desc" },
        include: { backlogItem: true, run: { select: { closedAt: true } }, reports: { where: { agentRun: { stepId: "report", closedAt: { not: null }, steps: { some: { stepId: "report", outcome: "ok", accepted: true } } } }, select: { actor: true } } } });
      const backlog = await tx.backlogItem.findMany({ where: { projectId, removedAt: null }, orderBy: { createdAt: "desc" } });
      const agents = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map(workspace => workspace.agent);
      const targets: RunTarget[] = board.map(item => ({ id: item.id, kind: "board", key: item.backlogItem.key, title: item.backlogItem.title,
        agent: item.agent, updatedAt: item.updatedAt.toISOString(), reason: pipelineInputReason(graph, {
          status: item.status, active: !!item.run && !item.run.closedAt, hasPlan: !!item.planPath && !!item.planCommit,
          hasValidation: !!item.validation, hasImplementation: item.reports.some(report => report.actor === item.agent),
        }) ?? (graph.nodes.includes("accept") && item.acceptedAt ? "This work is already accepted. Choose a pipeline without Accept to check it again." : null) }));
      for (const item of backlog) {
        if (board.some(row => row.backlogItemId === item.id && (row.status !== "done" || (row.run !== null && row.run.closedAt === null)))) continue;
        targets.push({ id: item.id, kind: "backlog", key: item.key, title: item.title, agent: null, updatedAt: null,
          reason: pipelineInputReason(graph, { status: "proposed", active: false, hasPlan: false, hasValidation: false, hasImplementation: false }) });
      }
      const workRun = await tx.pipelineWorkRun.findFirst({ where: { projectId, OR: [{ closedAt: null }, { version: { pipelineId } }] }, orderBy: [{ closedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }], include: { version: { select: { pipeline: { select: { name: true } } } } } });
      return { ok: true, item: { canStartWithoutWork: workPrefix(graph).nodes.length > 0, ...(workRun ? { projectRun: { id: workRun.id, pipelineName: workRun.version.pipeline.name, entryId: workRun.entryId, node: workRun.node, reason: workRun.waitReason, closed: workRun.closedAt !== null } } : {}), pipelineId, name: graph.name, graphKey: executionKey(graph), nodes: graph.nodes, gates: graph.gates, agents, targets } };
    }, READ_OPTIONS);
  } catch (error) {
    if (error instanceof PipelineRejection) return { ok: false, reason: error.message };
    throw error;
  }
}
