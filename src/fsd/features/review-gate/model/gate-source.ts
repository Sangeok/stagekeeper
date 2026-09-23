// 어떤 사람 전이가 열려 있는지는 packages/core의 상태 기계 하나로만 판정한다.
// ApcH의 GATE_TRANSITIONS·rejectActionsFor 화이트리스트를 대체한다 — 표가 두 벌이 되지 않게.
import { STATUSES, canDiscard, findRule } from "@harness/core/transitions.mjs";
import type { RejectAction } from "./gate-text";

// 결재함 자격(게이트·재개·뱃지 수)은 배너도 쓰므로 entities/board-item이 소유한다. 이 슬라이스 소비자를 위해 다시 내보낸다.
export { isAtGate, needsHumanDecision, pendingInboxCount, resumeTargetsFor, type GateRow } from "@/fsd/entities/board-item";

// 규칙의 kind 어휘. 값의 출처는 packages/core/transitions.mjs의 RULES 표이고, 서버 쪽 쌍둥이는
// src/server/pipeline/board-rules.ts의 RuleKind다 — FSD는 @/server를, 서버는 FSD를 import할 수
// 없어 타입을 한 곳에 둘 수 없다. 대신 두 목록이 RULES와 어긋나면 gate-source.test.ts가 깨진다.
// 이 형이 없으면 아래 비교가 그냥 string 비교라, 오타가 컴파일을 통과하고 분류만 조용히 어긋난다.
export type RuleKind = "gate" | "bounce" | "hold" | "resume" | "plan" | "done" | "reopen" | "auto";

const ruleKind = (actor: string, from: string, to: string): RuleKind | null =>
  (findRule(actor, from, to)?.kind ?? null) as RuleKind | null;

// 되돌리기(reopen)로 갈 수 있는 status들 — done에서 돌아가는 사람 전이. 항목 상세만 쓴다:
// 결재함 자격(needsHumanDecision)에는 세지 않는다 — 세면 모든 done이 영원히 결재함에 남는다.
export function reopenTargetsFor(status: string): string[] {
  return STATUSES.filter((to: string) => ruleKind("human", status, to) === "reopen");
}

export function rejectActionsFor(status: string): RejectAction[] {
  const actions: RejectAction[] = [];
  if (ruleKind("human", status, "planning") === "bounce") actions.push("bounce");
  if (findRule("human", status, "on_hold") !== null) actions.push("hold");
  if (canDiscard(status)) actions.push("discard");
  return actions;
}
