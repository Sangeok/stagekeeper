// 요약 예산의 유일한 출처. 값도 단위도 서버가 실제로 거부에 쓰는 규칙을 그대로 따른다.
// packages/core transitions.mjs는 **제출 한 건마다** TEXT_LIMIT을 강제한다 — 그래서 화면도
// 건별로 재야 한다. results를 이어붙인 길이로 재면 100자짜리 결과 두 건이 초과로 표시되는데,
// 서버는 그 둘을 거부한 적이 없다(보드에만 있던 거짓 양성).
import { TEXT_LIMIT } from "@harness/core/transitions.mjs";

/** 보드 evidence·result 요약 예산. 상세는 docs/agents/<행위자>/ 로 간다. */
export const FIELD_BUDGET: number = TEXT_LIMIT;

/** 필드 전체 길이로 잰다 — 첫 문장이 아니다. 한 건이라도 넘으면 초과다. */
export function isOverBudget(fields: readonly (string | null)[]): boolean {
  return fields.some((f) => f !== null && f.length > FIELD_BUDGET);
}
