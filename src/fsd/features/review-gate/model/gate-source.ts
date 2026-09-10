// 어떤 사람 전이가 열려 있는지는 packages/core의 상태 기계 하나로만 판정한다.
// ApcH의 GATE_TRANSITIONS·rejectActionsFor 화이트리스트를 대체한다 — 표가 두 벌이 되지 않게.
import { STATUSES, canDiscard, findRule } from "@harness/core/transitions.mjs";
import type { RejectAction } from "./gate-text";

// 규칙의 kind 어휘. 값의 출처는 packages/core/transitions.mjs의 RULES 표이고, 서버 쪽 쌍둥이는
// src/server/pipeline/board-rules.ts의 RuleKind다 — FSD는 @/server를, 서버는 FSD를 import할 수
// 없어 타입을 한 곳에 둘 수 없다. 대신 두 목록이 RULES와 어긋나면 gate-source.test.ts가 깨진다.
// 이 형이 없으면 아래 비교가 그냥 string 비교라, 오타가 컴파일을 통과하고 분류만 조용히 어긋난다.
export type RuleKind = "gate" | "bounce" | "hold" | "resume" | "plan" | "done" | "reopen" | "auto";

const ruleKind = (actor: string, from: string, to: string): RuleKind | null =>
  (findRule(actor, from, to)?.kind ?? null) as RuleKind | null;

// 카드의 판정 재료 — 상태와, 런이 서 있는 게이트(없으면 null). 게이트 여부는 상태 기계가 아니라 그래프(런)가 말한다.
export type GateRow = { status: string; gate: string | null };

// 이 항목이 게이트에서 기다리는가. 옛 isGateSource(status)를 대체한다 — 상태만으로는 "게이트를 뺐다"를 알 수 없다.
export function isAtGate(row: GateRow): boolean {
  return row.gate !== null;
}
// …
// 결재함에 오르는 항목 = 런이 게이트에 서 있거나(승인 대기) 재개할 수 있는 것.
// 재개 여부는 여전히 상태 기계에서 파생한다 — 화이트리스트를 두 벌로 만들지 않는다.
export function needsHumanDecision(row: GateRow): boolean {
  return isAtGate(row) || resumeTargetsFor(row.status).length > 0;
}

// Inbox 탭 뱃지의 유일한 출처 — 목록에 실제로 오르는 카드 수와 같은 술어로 센다.
// 배너는 여기서 갈라진다: on_hold는 배너를 소유하지 않는다(product-copy.md §5). 뱃지는 목록을 따른다(§7).
export function pendingInboxCount(rows: readonly GateRow[]): number {
  return rows.filter(needsHumanDecision).length;
}

// 재개(보류에서 돌아가기)로 갈 수 있는 status들.
export function resumeTargetsFor(status: string): string[] {
  return STATUSES.filter((to: string) => ruleKind("human", status, to) === "resume");
}

// 되돌리기(reopen)로 갈 수 있는 status들 — done에서 돌아가는 사람 전이. 항목 상세만 쓴다:
// 결재함 자격(needsHumanDecision)에는 세지 않는다 — 세면 모든 done이 영원히 결재함에 남는다.
export function reopenTargetsFor(status: string): string[] {
  return STATUSES.filter((to: string) => ruleKind("human", status, to) === "reopen");
}

// 결재함에 오르는 status = 게이트가 열려 있거나(승인 대기) 재개할 수 있는 것.
// 화이트리스트를 두 벌로 만들지 않으려고 여기서도 상태 기계에서 파생한다.


// Inbox 탭 뱃지의 유일한 출처 — 목록에 실제로 오르는 카드 수와 같은 술어로 센다.
// 배너는 여기서 갈라진다: on_hold는 배너를 소유하지 않는다(product-copy.md §5).
// 뱃지는 목록을 따른다(§7: 순서가 gate2 · gate1 · on_hold).


export function rejectActionsFor(status: string): RejectAction[] {
  const actions: RejectAction[] = [];
  if (ruleKind("human", status, "planning") === "bounce") actions.push("bounce");
  if (findRule("human", status, "on_hold") !== null) actions.push("hold");
  if (canDiscard(status)) actions.push("discard");
  return actions;
}
