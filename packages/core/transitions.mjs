export const STATUSES = ["proposed", "planning", "in_review", "implementing", "done", "on_hold"];
const STATUS_SET = new Set(STATUSES);
export const TEXT_LIMIT = 150;

const RULES = [
  { from: "proposed", to: "planning", actor: "human", kind: "gate" },
  { from: "in_review", to: "implementing", actor: "human", kind: "gate" },
  { from: "proposed", to: "planning", actor: "pipeline", kind: "auto" },
  { from: "in_review", to: "implementing", actor: "pipeline", kind: "auto" },
  { from: "in_review", to: "planning", actor: "human", kind: "bounce", clearsValidation: true },
  { from: "proposed", to: "on_hold", actor: "human", kind: "hold", requiresResult: true },
  { from: "in_review", to: "on_hold", actor: "human", kind: "hold", requiresResult: true },
  { from: "on_hold", to: "planning", actor: "human", kind: "resume", clearsValidation: true },
  { from: "on_hold", to: "implementing", actor: "human", kind: "resume" },
  { from: "done", to: "implementing", actor: "human", kind: "reopen", requiresResult: true },
  { from: "done", to: "planning", actor: "human", kind: "reopen", requiresResult: true, clearsValidation: true },
  { from: "planning", to: "in_review", actor: "agent", kind: "plan", requiresPlan: true },
  { from: "planning", to: "on_hold", actor: "agent", kind: "hold", requiresResult: true },
  { from: "implementing", to: "done", actor: "pipeline", kind: "auto", requiresResult: true, requiresReport: true },
  { from: "implementing", to: "on_hold", actor: "agent", kind: "hold", requiresResult: true },
];

export function findRule(actor, from, to) {
  if (!STATUS_SET.has(from) || !STATUS_SET.has(to)) return null;
  return RULES.find((r) => r.actor === actor && r.from === from && r.to === to) ?? null;
}
const DISCARD_FROM = new Set(["proposed", "in_review"]);
export function canDiscard(status) { return DISCARD_FROM.has(status); }
export function isOpen(status) { return STATUS_SET.has(status) && status !== "done" && status !== "on_hold"; }
export function canPropose(openCount) { return openCount < 2; }
export function canRecordValidation(status) { return status === "in_review"; }
export function checkText(field, text) {
  if (typeof text !== "string" || text.trim() === "") return `${field}: must not be empty`;
  if (text.length > TEXT_LIMIT) return `${field}: must be ${TEXT_LIMIT} characters or fewer (got ${text.length})`;
  return null;
}
