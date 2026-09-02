import "server-only";

import { loadRepoRef } from "@/server/project";
import { latestBoardWithEvents } from "@/server/pipeline/board";
import { toInboxItems, type InboxItem } from "../model/inbox-item";

// 결재함 카드의 읽기도 이 slice가 소유한다. latestBoardWithEvents는 InboxItem 전용으로 맞춘
// 쿼리이고(note 없는 전이만, take 8), toInboxItems가 그 보장 위에서 statusSince·heldFrom을
// 파생한다 — 둘이 다른 트리에 있으면 한쪽만 고쳐도 컴파일은 통과하고 화면만 조용히 어긋난다.
// 형제 위젯(turn-banner·app-header)도 각자 api/*.server.ts로 자기 읽기를 들고 있다.
export async function loadInboxItems(projectId: string): Promise<InboxItem[]> {
  const [repo, rows] = await Promise.all([loadRepoRef(projectId), latestBoardWithEvents(projectId)]);
  return toInboxItems(rows, repo);
}
