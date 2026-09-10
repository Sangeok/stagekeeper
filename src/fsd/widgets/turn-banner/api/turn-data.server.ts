import "server-only";

import { isGateId } from "@harness/core/pipeline.mjs";
import { pendingInboxCount } from "@/fsd/features/review-gate";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";
import { currentVersion } from "@/server/pipeline/run";
import { deriveTurn, type Turn } from "../model/turn";

export type TurnData = { turn: Turn; inboxCount: number };

// §E.3: latestBoard는 바꾸지 않고(board_list의 JSON) 열린 런을 함께 읽어 key → node/gate 맵을 만든다. hasPropose는 현재 버전의 nodes에서.
export async function loadTurn(projectId: string): Promise<TurnData> {
  const [rows, tokenCount, workspaceCount, backlogCount, openRuns, pipelineRuns, version] = await Promise.all([
    latestBoard(projectId),
    prisma.projectToken.count({ where: { projectId, revokedAt: null } }),
    prisma.workspace.count({ where: { projectId } }),
    prisma.backlogItem.count({ where: { projectId, removedAt: null } }),
    prisma.agentRun.findMany({
      where: { projectId, closedAt: null, key: { not: null } },
      select: { key: true, stepId: true, steps: { orderBy: { at: "desc" }, take: 1, select: { outcome: true, note: true } } },
    }),
    prisma.pipelineRun.findMany({ where: { closedAt: null, boardItem: { projectId } }, select: { boardItemId: true, node: true } }),
    currentVersion(prisma, projectId),
  ]);

  const handoffs = new Map<string, { step: string; note: string | null }>();
  for (const run of openRuns) {
    const last = run.steps[0];
    if (run.key !== null && last?.outcome === "handoff") handoffs.set(run.key, { step: run.stepId, note: last.note });
  }
  const cursor = new Map(pipelineRuns.map((r) => [r.boardItemId, r.node]));
  const items = rows.map((r) => {
    const at = cursor.get(r.id) ?? null;
    return {
      key: r.backlogItem.key,
      status: r.status,
      agent: r.agent,
      validation: r.validation,
      accepted: r.acceptedAt !== null,
      handoff: handoffs.get(r.backlogItem.key) ?? null,
      gate: at !== null && isGateId(at) ? at : null,
      node: at !== null && !isGateId(at) ? at : null,
    };
  });

  return {
    turn: deriveTurn(items, { tokenIssued: tokenCount > 0, rosterSynced: workspaceCount > 0, backlogCount, hasPropose: version.nodes.includes("propose") }),
    inboxCount: pendingInboxCount(items.map((i) => ({ status: i.status, gate: i.gate }))),
  };
}
