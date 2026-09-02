import "server-only";

import { pendingInboxCount } from "@/fsd/features/review-gate";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";
import { deriveTurn, type Turn } from "../model/turn";

// 배너와 탭 뱃지는 같은 행에서 나오지만 같은 수가 아니다 — 뱃지는 review-gate가 소유하는
// 결재함 자격으로 세고(on_hold 포함), 배너는 on_hold를 세지 않는다(product-copy.md §5).
// 두 값을 한 번의 읽기로 내보내 셸이 같은 행을 두 번 읽지 않게 한다.
export type TurnData = { turn: Turn; inboxCount: number };

// 배너가 무엇을 근거로 판정하는지는 이 위젯이 안다 — 읽기도 여기서 한다.
// 체크리스트 단계를 더하거나 바꿀 때 model/turn.ts와 이 파일만 함께 고치면 된다.
export async function loadTurn(projectId: string): Promise<TurnData> {
  const [rows, tokenCount, workspaceCount, backlogCount] = await Promise.all([
    latestBoard(projectId),
    prisma.projectToken.count({ where: { projectId, revokedAt: null } }),
    prisma.workspace.count({ where: { projectId } }),
    prisma.backlogItem.count({ where: { projectId, removedAt: null } }),
  ]);

  const items = rows.map((r) => ({ key: r.backlogItem.key, status: r.status, agent: r.agent, validation: r.validation }));

  return {
    turn: deriveTurn(items, { tokenIssued: tokenCount > 0, rosterSynced: workspaceCount > 0, backlogCount }),
    inboxCount: pendingInboxCount(items.map((i) => i.status)),
  };
}
