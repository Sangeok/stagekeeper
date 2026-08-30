// 순수. import 없음. 보드 상태 기계 — "누가 어떤 전이를 할 수 있나"의 단일 출처.
// 서버(MCP·웹 액션)가 이 표로 판정한다. 여기 없는 전이는 존재하지 않는다.
// 식별자는 DB에 저장되고 MCP가 돌려주고 템플릿이 참조하는 값이다. 화면 라벨은 별도(status-label.ts).
export const STATUSES = ["proposed", "planning", "in_review", "implementing", "done", "on_hold"];
const STATUS_SET = new Set(STATUSES);
export const TEXT_LIMIT = 150;

const RULES = [
  // 사람(웹 로그인)만 — 게이트
  { from: "proposed", to: "planning", actor: "human", kind: "gate" },
  { from: "in_review", to: "implementing", actor: "human", kind: "gate" },
  // 사람 — 되돌리기·보류·재개 (ApcH REJECT_TRANSITIONS + 보드 안내 블록 재개 규칙)
  { from: "in_review", to: "planning", actor: "human", kind: "bounce", clearsValidation: true },
  { from: "proposed", to: "on_hold", actor: "human", kind: "hold", requiresResult: true },
  { from: "in_review", to: "on_hold", actor: "human", kind: "hold", requiresResult: true },
  { from: "on_hold", to: "planning", actor: "human", kind: "resume", clearsValidation: true },
  { from: "on_hold", to: "implementing", actor: "human", kind: "resume" },
  // 에이전트(MCP 토큰) — dev A-4·B-6
  { from: "planning", to: "in_review", actor: "agent", kind: "plan", requiresPlan: true },
  { from: "planning", to: "on_hold", actor: "agent", kind: "hold", requiresResult: true },
  { from: "implementing", to: "done", actor: "agent", kind: "done", requiresResult: true, requiresReport: true },
  { from: "implementing", to: "on_hold", actor: "agent", kind: "hold", requiresResult: true },
];

export function findRule(actor, from, to) {
  if (!STATUS_SET.has(from) || !STATUS_SET.has(to)) return null;
  return RULES.find((r) => r.actor === actor && r.from === from && r.to === to) ?? null;
}
const DISCARD_FROM = new Set(["proposed", "in_review"]);
export function canDiscard(status) { return DISCARD_FROM.has(status); }
export function isOpen(status) { return STATUS_SET.has(status) && status !== "done" && status !== "on_hold"; }
export function canPropose(openCount) { return openCount < 2; } // pm 규칙: 미결 2건이면 새로 올리지 않는다
export function canRecordValidation(status) { return status === "in_review"; }
export function checkText(field, text) {
  if (typeof text !== "string" || text.trim() === "") return `${field}: must not be empty`;
  if (text.length > TEXT_LIMIT) return `${field}: must be ${TEXT_LIMIT} characters or fewer (got ${text.length})`;
  return null;
}
