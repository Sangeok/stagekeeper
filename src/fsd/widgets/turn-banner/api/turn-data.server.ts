import "server-only";

import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";
import { deriveTurn, type Turn } from "../model/turn";

// 배너가 무엇을 근거로 판정하는지는 이 위젯이 안다 — 읽기도 여기서 한다.
// 체크리스트 단계를 더하거나 바꿀 때 model/turn.ts와 이 파일만 함께 고치면 된다.
export async function loadTurn(projectId: string): Promise<Turn> {
  const [rows, tokenCount, workspaceCount, backlogCount] = await Promise.all([
    latestBoard(projectId),
    prisma.projectToken.count({ where: { projectId, revokedAt: null } }),
    prisma.workspace.count({ where: { projectId } }),
    prisma.backlogItem.count({ where: { projectId, removedAt: null } }),
  ]);

  return deriveTurn(
    rows.map((r) => ({ key: r.backlogItem.key, status: r.status, agent: r.agent, validation: r.validation })),
    { tokenIssued: tokenCount > 0, rosterSynced: workspaceCount > 0, backlogCount },
  );
}
