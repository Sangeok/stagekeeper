// 결재함 자격 — "이 항목이 사람의 결정을 기다리는가". 배너(widgets/turn-banner)와 결재함(features/review-gate)이
// 같은 답을 쓰도록 가장 아래 레이어에 둔다: 배너가 review-gate 배럴(클라이언트 트리)을 끌어오지 않게.
// 재개 여부는 packages/core의 상태 기계 하나에서 파생한다 — 화이트리스트를 두 벌로 만들지 않는다.
import { STATUSES, findRule } from "@harness/core/transitions.mjs";

// 카드의 판정 재료 — 상태와, 런이 서 있는 게이트(없으면 null). 게이트 여부는 상태 기계가 아니라 그래프(런)가 말한다.
export type GateRow = { status: string; gate: string | null };

// 이 항목이 게이트에서 기다리는가. 상태 기반 판정을 대체한다 — 상태만으로는 "게이트를 뺐다"를 알 수 없다.
export function isAtGate(row: GateRow): boolean {
  return row.gate !== null;
}

// 결재함에 오르는 항목 = 런이 게이트에 서 있거나(승인 대기) 재개할 수 있는 것.
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
  return STATUSES.filter((to: string) => findRule("human", status, to)?.kind === "resume");
}
