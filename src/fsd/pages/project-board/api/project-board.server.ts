import "server-only";
import { buildBriefing, type Briefing } from "../model/briefing";
import { prisma } from "@/server/db";
import { loadProjectRoster } from "@/server/projects/api";
import { latestBoard } from "@/server/pipeline/api.server";
import { loadPipelinesView } from "@/server/pipeline/api";
import { dispatcherFor, isGateId, slotAgent, PROJECT_AGENTS, SLOT_FORMAT } from "@harness/core/pipeline.mjs";

export async function loadProjectBoard(projectId: string, now: Date): Promise<Briefing> {
  const [rows, roster, runs, agentRuns, view, names] = await Promise.all([
    latestBoard(projectId),
    loadProjectRoster(prisma, projectId),
    prisma.pipelineRun.findMany({ where: { closedAt: null, boardItem: { projectId } }, select: { id: true, entryId: true, version: { select: { format: true } }, boardItemId: true, node: true } }),
    prisma.agentRun.findMany({ where: { projectId, closedAt: null }, select: { key: true, agent: true, pipelineRunId: true, pipelineEntryId: true } }),
    loadPipelinesView(prisma, projectId),
    prisma.pipelineRun.findMany({ where: { boardItem: { projectId } }, select: { boardItemId: true, version: { select: { pipeline: { select: { name: true } } } } } }),
  ]);
  const pipelineNames = new Map(names.map(run => [run.boardItemId, run.version.pipeline?.name ?? "Default"]));
  const cursor = new Map(runs.map((r) => [r.boardItemId, r]));
  const running = new Set(agentRuns.filter((r) => r.key !== null).map((r) => `${r.key}\u0000${r.agent}`));

  const briefing = buildBriefing(
    rows.map((r) => {
      const run = cursor.get(r.id);
      const at = run?.node ?? null;
      const node = at !== null && !isGateId(at) ? at : null;
      const who = node === null ? null : dispatcherFor(node, r.agent);
      const keyedMatch = who !== null && running.has(`${r.backlogItem.key}\u0000${who}`);
      const agent = node === null ? null : slotAgent(node);
      const nullKeyBoundMatch = agent !== null && PROJECT_AGENTS.includes(agent) && run?.version.format === SLOT_FORMAT && run.entryId !== null
        && agentRuns.some((candidate) => candidate.key === null && candidate.agent === who && candidate.pipelineRunId === run.id && candidate.pipelineEntryId === run.entryId);
      return { ...r, pipelineName: pipelineNames.get(r.id) ?? "Default", gate: at !== null && isGateId(at) ? at : null, node, dispatched: keyedMatch || nullKeyBoundMatch };
    }),
    now, roster, view.pipelines.flatMap(pipeline => pipeline.runnable?.nodes ?? []), view.autoProposeEnabled,
  );

  return briefing;
}
