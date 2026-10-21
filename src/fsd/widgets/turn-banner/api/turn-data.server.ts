import "server-only";

import { dispatcherFor, isGateId, SLOT_FORMAT } from "@harness/core/pipeline.mjs";
import { pendingInboxCount } from "@/fsd/entities/board-item";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/api.server";
import { handoffIsLive } from "@/server/pipeline/api";
import { readRunnerState } from "@/server/runners/api.server";
import type { RunnerView } from "@/server/runners/contracts";
import type { RunnerFacts } from "../model/runner";
import { deriveTurn, type Turn } from "../model/turn";

export type TurnData = { turn: Turn; inboxCount: number; runner: RunnerFacts };

export function runnerFacts(view: RunnerView): RunnerFacts {
  const row = view.runner;
  return {
    runner: row === null ? null : {
      mode: row.mode, host: row.host, branch: row.branch, permission: row.permission, autostart: row.autostart, state: row.state,
      waitReason: row.waitReason, stopReason: row.stopReason, seenAt: row.seenAt.toISOString(), lastActivity: view.lastActivity?.toISOString() ?? null,
    },
    paused: view.pausedAt !== null,
    renderedAt: view.renderedAt.toISOString(),
  };
}

export async function loadTurn(projectId: string): Promise<TurnData> {
  const [rows, tokenCount, workspaceCount, openRuns, pipelineRuns, project, failures, runner] = await Promise.all([
    latestBoard(projectId),
    prisma.projectToken.count({ where: { projectId, revokedAt: null } }),
    prisma.workspace.count({ where: { projectId } }),
    prisma.agentRun.findMany({
      where: { projectId, closedAt: null },
      select: { pipelineRunId: true, pipelineEntryId: true, key: true, agent: true, stepId: true, steps: { where: { OR: [{ accepted: true }, { accepted: null }] }, orderBy: { at: "desc" }, take: 1, select: { outcome: true, note: true, at: true } } },
    }),
    prisma.pipelineRun.findMany({ where: { closedAt: null, boardItem: { projectId } }, select: { id: true, entryId: true, version: { select: { format: true } }, boardItemId: true, node: true } }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { autoScoutEnabled: true } }),
    prisma.acceptanceFailure.findMany({ where: { clearedAt: null, boardItem: { projectId } }, select: { boardItemId: true } }),
    readRunnerState(projectId),
  ]);

  const updatedAt = new Map(rows.map((r) => [r.backlogItem.key, r.updatedAt]));
  const handoffs = new Map<string, { step: string; note: string | null }>();
  for (const run of openRuns) {
    const last = run.steps[0];
    if (run.key === null || last?.outcome !== "handoff") continue;
    const since = updatedAt.get(run.key);
    if (since === undefined || !handoffIsLive(last.at, since)) continue;
    handoffs.set(run.key, { step: run.stepId, note: last.note });
  }
  const running = new Set(openRuns.filter((r) => r.key !== null).map((r) => `${r.key}\u0000${r.agent}`));
  const cursor = new Map(pipelineRuns.map((r) => [r.boardItemId, r.node]));
  const failedIds = new Set(failures.map((f) => f.boardItemId));
  const items = rows.map((r) => {
    const at = cursor.get(r.id) ?? null;
    const node = at !== null && !isGateId(at) ? at : null;
    const pipeline = pipelineRuns.find((p) => p.boardItemId === r.id);
    const isSlotRun = pipeline?.version.format === SLOT_FORMAT;
    const boundRun = isSlotRun ? openRuns.find((a) => a.pipelineRunId === pipeline.id && a.pipelineEntryId === pipeline.entryId && a.agent === dispatcherFor(at, r.agent)) : undefined;
    const last = boundRun?.steps[0];
    const slotHandoff = boundRun && last?.outcome === "handoff" && handoffIsLive(last.at, r.updatedAt) ? { step: boundRun.stepId, note: last.note } : null;
    const who = node === null ? null : dispatcherFor(node, r.agent);
    return {
      key: r.backlogItem.key,
      status: r.status,
      agent: r.agent,
      accepted: r.acceptedAt !== null,
      acceptanceFailed: r.status === "done" && r.acceptedAt === null && node === "accept" && failedIds.has(r.id),
      handoff: isSlotRun ? slotHandoff : handoffs.get(r.backlogItem.key) ?? null,
      gate: at !== null && isGateId(at) ? at : null,
      node,
      dispatched: isSlotRun ? boundRun !== undefined : who !== null && running.has(`${r.backlogItem.key}\u0000${who}`),
    };
  });

  return {
    turn: deriveTurn(items, { tokenIssued: tokenCount > 0, rosterSynced: workspaceCount > 0, autoScoutEnabled: project.autoScoutEnabled }),
    inboxCount: pendingInboxCount(items.map((i) => ({ status: i.status, gate: i.gate }))),
    runner: runnerFacts(runner),
  };
}
