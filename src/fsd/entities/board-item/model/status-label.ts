// 상태 식별자(DB·MCP 값) → 화면 라벨. 식별자의 출처는 packages/core/transitions.mjs, 라벨은 product-copy.md §3.
// 여기가 라벨의 유일한 자리다 — 화면마다 다르게 부르면 규약이 흔들린다.
export const STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  planning: "Planning",
  in_review: "In review",
  implementing: "Implementing",
  done: "Done",
  on_hold: "On hold",
};

// 보드에 없는 백로그 항목은 null이다. 모르는 식별자는 그대로 보여 준다 — 숨기면 디버깅이 늦어진다.
export function statusLabel(status: string | null): string {
  if (status === null) return "Not on board";
  return STATUS_LABEL[status] ?? status;
}
