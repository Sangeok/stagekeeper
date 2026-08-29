// 결재함 카드의 계약. Client Component가 *.server를 import할 수 없어서
// 액션 형도 여기 둔다 — route가 slug를 bind해서 prop으로 넘긴다(fsd.md 「Server와 Client 경계」).
import type { ActionResult } from "@/fsd/shared/api/result";

export type InboxItem = {
  key: string;
  title: string;
  agent: string;
  status: string;
  reason: string;
  results: string[];
  validation: string | null;
  planPath: string | null;
  planUrl: string | null;
  updatedAt: string; // ISO. 낙관적 잠금(CAS)에 그대로 돌려보낸다
};

export type TransitionAction = (
  key: string,
  to: string,
  result: string | undefined,
  expectedUpdatedAt: string,
) => Promise<ActionResult<void>>;

export type DiscardAction = (key: string, expectedUpdatedAt: string) => Promise<ActionResult<void>>;
