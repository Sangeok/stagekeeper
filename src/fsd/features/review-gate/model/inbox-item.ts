// 결재함 카드의 계약. Client Component가 *.server를 import할 수 없어서
// 액션 형도 여기 둔다 — route가 slug를 bind해서 prop으로 넘긴다(fsd.md 「Server와 Client 경계」).
import { blobHref, type RepoRef } from "@/fsd/entities/board-item";
import type { ActionResult } from "@/fsd/shared/api/result";
import { needsHumanDecision } from "./gate-source";

export type InboxItem = {
  key: string;
  title: string;
  area: string;
  agent: string;
  status: string;
  reason: string;
  results: string[];
  validation: string | null;
  planPath: string | null;
  planUrl: string | null;
  planCommit: string | null;
  proposedOn: string; // ISO
  statusSince: string; // ISO. 지금 status로 바뀐 전이 이벤트의 시각(없으면 updatedAt)
  heldFrom: string | null; // on_hold 직전 status — 주 Resume 버튼이 여기서 정해진다
  updatedAt: string; // ISO. 낙관적 잠금(CAS)에 그대로 돌려보낸다
};

// 인자 넷이 모두 string이면 순서를 바꿔도 컴파일된다. expectedUpdatedAt은 낙관적 잠금 토큰이라
// key와 뒤바뀌면 런타임에야 "stale"로 드러난다 — 이름 있는 객체 하나로 받는다.
export type TransitionInput = {
  key: string;
  to: string;
  result?: string;
  expectedUpdatedAt: string;
};

export type TransitionAction = (input: TransitionInput) => Promise<ActionResult<void>>;

export type DiscardAction = (key: string, expectedUpdatedAt: string) => Promise<ActionResult<void>>;

// 표시 순서: 파이프라인 깊은 것부터 — 게이트②(in_review) → 게이트①(proposed) → 보류.
// 결재함에 오를 자격(needsHumanDecision)과 달리 이건 순수한 표시 규칙이다.
const INBOX_SORT: Record<string, number> = { in_review: 0, proposed: 1, on_hold: 2 };

// 라우트가 아니라 이 slice가 카드 모델을 소유한다 — InboxItem이 바뀔 때 한 파일만 본다.
// Prisma를 import하지 않도록 행의 형만 구조적으로 선언한다(client-safe 유지).
type BoardRow = {
  status: string;
  agent: string;
  reason: string;
  results: string[];
  validation: string | null;
  planPath: string | null;
  planCommit: string | null;
  proposedOn: Date;
  updatedAt: Date;
  backlogItem: { key: string; title: string; area: string };
  events: { at: Date; from: string | null; to: string | null }[];
};

export function toInboxItems(rows: readonly BoardRow[], repo: RepoRef): InboxItem[] {
  return rows
    .filter((row) => needsHumanDecision(row.status))
    .sort((a, b) => (INBOX_SORT[a.status] ?? 9) - (INBOX_SORT[b.status] ?? 9))
    .map((row) => {
      // 이벤트는 최신순. 지금 status로 바뀐 전이(검증·plan·report 같은 same-status 이벤트는 제외)의 시각.
      // 쿼리(latestBoardWithEvents)가 note 없는 전이만 주지만, 여기서도 같은 가드를 둔다 — 모델이 쿼리 형에 매이지 않게.
      const became = row.events.find((e) => e.to === row.status && e.from !== e.to);
      const held = row.status === "on_hold" ? row.events.find((e) => e.to === "on_hold" && e.from !== e.to) : undefined;
      return {
        key: row.backlogItem.key,
        title: row.backlogItem.title,
        area: row.backlogItem.area,
        agent: row.agent,
        status: row.status,
        reason: row.reason,
        results: row.results,
        validation: row.validation,
        planPath: row.planPath,
        planUrl: row.planPath === null ? null : blobHref(repo, row.planPath),
        planCommit: row.planCommit,
        proposedOn: row.proposedOn.toISOString(),
        statusSince: (became?.at ?? row.updatedAt).toISOString(),
        heldFrom: held?.from ?? null,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
}
