// ApcH transition-pipeline-gate/model/transitions.ts(de25a1c)에서 문구·칩 재료만 옮겼다.
// 마크다운 편집 기계(applyGateTransition 등)는 v2에서 서버가 DB로 대신하므로 가져오지 않는다.

// 카드 잠금 표식(ApcH FEAT-20): 도장·반려 성공 뒤 버튼 자리를 대신하는 비상호작용 칩의 재료.
export type CardLock = { label: string; marker: string };

export type RejectAction = "bounce" | "hold" | "discard";

// 도장(게이트 전진) 성공 뒤 칩 문구. 재클릭 방지용 종결 표식이다.
export const GATE_LOCK_LABEL = "도장 찍음";

const REJECT_LOCK_WORD: Record<RejectAction, string> = {
  bounce: "되돌림",
  hold: "보류함",
  discard: "폐기함",
};
export function rejectLockLabel(action: RejectAction): string {
  return REJECT_LOCK_WORD[action];
}

// ApcH 원본은 "파이프라인 실행을 눌러"라고 안내하지만 그 버튼은 Phase 3(명령 원장)이고
// Phase 1의 실행기는 local이다 — 다음 단계를 미는 것은 웹 버튼이 아니라 사용자의 Claude Code 세션이다.
const GATE_NEXT_HINT: Record<string, string> = {
  계획지시: "이제 Claude Code에서 런북대로 담당 dev를 디스패치하면 계획서를 씁니다.",
  구현승인: "이제 Claude Code에서 담당 dev를 디스패치하면 구현합니다.",
};
export function gateNextActionHint(to: string): string {
  return Object.hasOwn(GATE_NEXT_HINT, to)
    ? (GATE_NEXT_HINT[to] as string)
    : "이제 Claude Code에서 다음 단계를 진행하세요.";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 고정 날짜 보류 문구. 결정론적: 호출자가 Date를 넘긴다. ApcH의 `TASK_BACKLOG.md` → 「백로그」.
export function holdResultLine(today: Date): string {
  const date = `${today.getUTCFullYear()}-${pad2(today.getUTCMonth() + 1)}-${pad2(today.getUTCDate())}`;
  return `사용자 결정(${date}) — 웹에서 보류. 폐기가 아니라 대기이며 백로그에 남는다. 재개하려면 이 행을 계획지시 또는 구현승인으로 되돌린다.`;
}
