// 순수. import 없음. 보드 상태 기계 — "누가 어떤 전이를 할 수 있나"의 단일 출처.
// 서버(MCP·웹 액션)가 이 표로 판정한다. 여기 없는 전이는 존재하지 않는다.
export const STATUSES = ["승인대기", "계획지시", "검토대기", "구현승인", "완료", "보류"];
const STATUS_SET = new Set(STATUSES);
export const TEXT_LIMIT = 150;

const RULES = [
  // 사람(웹 로그인)만 — 게이트
  { from: "승인대기", to: "계획지시", actor: "human", kind: "gate" },
  { from: "검토대기", to: "구현승인", actor: "human", kind: "gate" },
  // 사람 — 반려·재개 (ApcH REJECT_TRANSITIONS + 보드 안내 블록 재개 규칙)
  { from: "검토대기", to: "계획지시", actor: "human", kind: "bounce", clearsValidation: true },
  { from: "승인대기", to: "보류", actor: "human", kind: "hold", requiresResult: true },
  { from: "검토대기", to: "보류", actor: "human", kind: "hold", requiresResult: true },
  { from: "보류", to: "계획지시", actor: "human", kind: "resume", clearsValidation: true },
  { from: "보류", to: "구현승인", actor: "human", kind: "resume" },
  // 에이전트(MCP 토큰) — dev A-4·B-6
  { from: "계획지시", to: "검토대기", actor: "agent", kind: "plan", requiresPlan: true },
  { from: "계획지시", to: "보류", actor: "agent", kind: "hold", requiresResult: true },
  { from: "구현승인", to: "완료", actor: "agent", kind: "done", requiresResult: true, requiresReport: true },
  { from: "구현승인", to: "보류", actor: "agent", kind: "hold", requiresResult: true },
];

export function findRule(actor, from, to) {
  if (!STATUS_SET.has(from) || !STATUS_SET.has(to)) return null;
  return RULES.find((r) => r.actor === actor && r.from === from && r.to === to) ?? null;
}
const DISCARD_FROM = new Set(["승인대기", "검토대기"]);
export function canDiscard(status) { return DISCARD_FROM.has(status); }
export function isOpen(status) { return STATUS_SET.has(status) && status !== "완료" && status !== "보류"; }
export function canPropose(openCount) { return openCount < 2; } // pm 규칙: 미결 2건이면 새로 올리지 않는다
export function canRecordValidation(status) { return status === "검토대기"; }
export function checkText(field, text) {
  if (typeof text !== "string" || text.trim() === "") return `${field}: 비어 있을 수 없다`;
  if (text.length > TEXT_LIMIT) return `${field}: ${TEXT_LIMIT}자 이내여야 한다 (${text.length})`;
  return null;
}
