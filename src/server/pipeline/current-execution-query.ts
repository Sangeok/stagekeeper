import { dispatcherFor, isGateId, PROJECT_AGENTS, SLOT_FORMAT, slotAgent } from "@harness/core/pipeline/pipeline.mjs";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ExecutionFacts, ExecutionItem } from "./contracts";
import { handoffIsLive } from "./run-rules";

export async function loadExecutionFacts(db: PrismaClient, projectId: string, items: readonly ExecutionItem[]): Promise<ExecutionFacts[]> {
  const [pipelineRuns, openRuns] = await Promise.all([
    db.pipelineRun.findMany({
      where: { closedAt: null, boardItem: { projectId } },
      select: { id: true, entryId: true, version: { select: { format: true } }, boardItemId: true, node: true },
    }),
    db.agentRun.findMany({
      where: { projectId, closedAt: null },
      select: {
        pipelineRunId: true, pipelineEntryId: true, key: true, agent: true, stepId: true,
        steps: { where: { OR: [{ accepted: true }, { accepted: null }] }, orderBy: { at: "desc" }, take: 1, select: { outcome: true, note: true, at: true } },
      },
    }),
  ]);
  const cursor = new Map(pipelineRuns.map(run => [run.boardItemId, run]));
  const running = new Set(openRuns.filter(run => run.key !== null).map(run => [run.key, run.agent].join("\u0000")));
  const updatedAt = new Map(items.map(item => [item.key, item.updatedAt]));
  const handoffs = new Map<string, NonNullable<ExecutionFacts["handoff"]>>();
  for (const run of openRuns) {
    const last = run.steps[0];
    if (run.key === null || last?.outcome !== "handoff") continue;
    const since = updatedAt.get(run.key);
    if (since === undefined || !handoffIsLive(last.at, since)) continue;
    handoffs.set(run.key, { step: run.stepId, note: last.note });
  }

  return items.map(item => {
    const pipeline = cursor.get(item.id);
    const at = pipeline?.node ?? null;
    const node = at !== null && !isGateId(at) ? at : null;
    const who = node === null ? null : dispatcherFor(node, item.agent);
    const keyedMatch = who !== null && running.has([item.key, who].join("\u0000"));
    const agent = node === null ? null : slotAgent(node);
    const isSlotRun = pipeline?.version.format === SLOT_FORMAT;
    const boundRun = isSlotRun ? openRuns.find(run => run.pipelineRunId === pipeline.id && run.pipelineEntryId === pipeline.entryId && run.agent === dispatcherFor(at, item.agent)) : undefined;
    const nullKeyBoundMatch = agent !== null && PROJECT_AGENTS.includes(agent) && isSlotRun && pipeline.entryId !== null
      && openRuns.some(run => run.key === null && run.agent === who && run.pipelineRunId === pipeline.id && run.pipelineEntryId === pipeline.entryId);
    const last = boundRun?.steps[0];
    const slotHandoff = boundRun && last?.outcome === "handoff" && handoffIsLive(last.at, item.updatedAt)
      ? { step: boundRun.stepId, note: last.note } : null;
    return {
      boardItemId: item.id,
      cursorNode: at,
      activityDispatched: keyedMatch || nullKeyBoundMatch,
      turnDispatched: isSlotRun ? boundRun !== undefined : keyedMatch,
      handoff: isSlotRun ? slotHandoff : handoffs.get(item.key) ?? null,
    };
  });
}
