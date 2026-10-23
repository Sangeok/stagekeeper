import "server-only";
import { buildBriefing, type Briefing } from "../model/briefing";
import { prisma } from "@/server/db";
import { loadProjectRoster } from "@/server/projects/api";
import { latestBoard } from "@/server/pipeline/api.server";
import { loadExecutionFacts, loadPipelinesView } from "@/server/pipeline/api";
import { isGateId } from "@harness/core/pipeline/pipeline.mjs";

export async function loadProjectBoard(projectId: string, now: Date): Promise<Briefing> {
  const board = latestBoard(projectId);
  const executions = board.then(rows => loadExecutionFacts(prisma, projectId, rows.map(row => ({
    id: row.id, key: row.backlogItem.key, agent: row.agent, updatedAt: row.updatedAt,
  }))));
  const [rows, facts, roster, view, names] = await Promise.all([
    board,
    executions,
    loadProjectRoster(prisma, projectId),
    loadPipelinesView(prisma, projectId),
    prisma.pipelineRun.findMany({ where: { boardItem: { projectId } }, select: { boardItemId: true, version: { select: { pipeline: { select: { name: true } } } } } }),
  ]);
  const pipelineNames = new Map(names.map(run => [run.boardItemId, run.version.pipeline?.name ?? "Default"]));
  const executionByItem = new Map(facts.map(fact => [fact.boardItemId, fact]));

  const briefing = buildBriefing(
    rows.map((r) => {
      const execution = executionByItem.get(r.id);
      const at = execution?.cursorNode ?? null;
      const node = at !== null && !isGateId(at) ? at : null;
      return { ...r, pipelineName: pipelineNames.get(r.id) ?? "Default", gate: at !== null && isGateId(at) ? at : null, node, dispatched: execution?.activityDispatched ?? false };
    }),
    now, roster, view.pipelines.flatMap(pipeline => pipeline.runnable?.nodes ?? []), view.autoProposeEnabled,
  );

  return briefing;
}
