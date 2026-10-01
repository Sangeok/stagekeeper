export type BoardStatus = "proposed" | "planning" | "in_review" | "implementing" | "done" | "on_hold";
export type TransitionActor = "human" | "agent" | "pipeline";
export type RuleKind = "gate" | "auto" | "bounce" | "hold" | "resume" | "plan" | "reopen";

export type TransitionRule = {
  from: BoardStatus;
  to: BoardStatus;
  actor: TransitionActor;
  kind: RuleKind;
  requiresResult?: boolean;
  requiresPlan?: boolean;
  requiresReport?: boolean;
  clearsValidation?: boolean;
};

export const STATUSES: BoardStatus[];
export const TEXT_LIMIT: number;
export function findRule(actor: string, from: string, to: string): TransitionRule | null;
export function canDiscard(status: string): boolean;
export function isOpen(status: string): boolean;
export function canPropose(openCount: number): boolean;
export function canRecordValidation(status: string): boolean;
export function checkText(field: string, text: unknown): string | null;
