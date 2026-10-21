import "server-only";

import { isGateId } from "@harness/core/pipeline.mjs";
import { pendingInboxCount } from "@/fsd/entities/board-item";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/api.server";
import { loadExecutionFacts } from "@/server/pipeline/api";
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
  const board = latestBoard(projectId);
  const executions = board.then(rows => loadExecutionFacts(prisma, projectId, rows.map(row => ({
    id: row.id, key: row.backlogItem.key, agent: row.agent, updatedAt: row.updatedAt,
  }))));
  const [rows, facts, tokenCount, workspaceCount, project, failures, runner] = await Promise.all([
    board,
    executions,
    prisma.projectToken.count({ where: { projectId, revokedAt: null } }),
    prisma.workspace.count({ where: { projectId } }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { autoScoutEnabled: true } }),
    prisma.acceptanceFailure.findMany({ where: { clearedAt: null, boardItem: { projectId } }, select: { boardItemId: true } }),
    readRunnerState(projectId),
  ]);

  const executionByItem = new Map(facts.map(fact => [fact.boardItemId, fact]));
  const failedIds = new Set(failures.map((f) => f.boardItemId));
  const items = rows.map((r) => {
    const execution = executionByItem.get(r.id);
    const at = execution?.cursorNode ?? null;
    const node = at !== null && !isGateId(at) ? at : null;
    return {
      key: r.backlogItem.key,
      status: r.status,
      agent: r.agent,
      accepted: r.acceptedAt !== null,
      acceptanceFailed: r.status === "done" && r.acceptedAt === null && node === "accept" && failedIds.has(r.id),
      handoff: execution?.handoff ?? null,
      gate: at !== null && isGateId(at) ? at : null,
      node,
      dispatched: execution?.turnDispatched ?? false,
    };
  });

  return {
    turn: deriveTurn(items, { tokenIssued: tokenCount > 0, rosterSynced: workspaceCount > 0, autoScoutEnabled: project.autoScoutEnabled }),
    inboxCount: pendingInboxCount(items.map((i) => ({ status: i.status, gate: i.gate }))),
    runner: runnerFacts(runner),
  };
}
