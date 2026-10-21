import { REPORT_AGENTS } from "@harness/core/entitlement.mjs";
import { boundaryOf, gateId, isGateId } from "@harness/core/pipeline.mjs";
import { canDiscard, canPropose, canRecordValidation, checkText, findRule, isOpen, type RuleKind } from "@harness/core/transitions.mjs";

export type Actor = "human" | "agent" | "pipeline";
export type Decision<T> = { ok: true; value: T } | { ok: false; reason: string };

export type RowSnapshot = { status: string; planPath: string | null; reportCount: number; results: string[]; validation: string | null };

export type ProposeInput = {
  backlogExists: boolean;
  hasOpenRow: boolean;
  onHold: boolean;
  openCount: number;
  roster: readonly string[];
  agent: string;
  reason: string;
};

export function decidePropose(i: ProposeInput): Decision<null> {
  if (!i.backlogExists) return { ok: false, reason: "no such backlog item (or removed)" };
  if (i.hasOpenRow) return { ok: false, reason: "already open" };
  if (i.onHold) return { ok: false, reason: "on hold — only the owner resumes it, on the web" };
  if (!canPropose(i.openCount)) return { ok: false, reason: `open items: ${i.openCount} (max 2)` };
  if (!i.roster.includes(i.agent)) return { ok: false, reason: `agent not in roster: ${i.agent}` };
  const bad = checkText("reason", i.reason);
  return bad ? { ok: false, reason: bad } : { ok: true, value: null };
}

export function countPickable(backlogIds: readonly string[], latest: readonly { backlogItemId: string; status: string }[]): number {
  const taken = new Set(latest.filter((r) => isOpen(r.status) || r.status === "on_hold").map((r) => r.backlogItemId));
  return backlogIds.filter((id) => !taken.has(id)).length;
}

export type TransitionPatch = { status: string; results: string[]; validation: string | null; completes: boolean; reopens: boolean; kind: RuleKind };

export function decideTransition(row: RowSnapshot, actor: Actor, to: string, result: string | undefined): Decision<TransitionPatch> {
  const rule = findRule(actor, row.status, to);
  if (!rule) return { ok: false, reason: `not allowed: ${actor} ${row.status} → ${to}` };
  if (rule.requiresResult || result !== undefined) { const bad = checkText("result", result); if (bad) return { ok: false, reason: bad }; }
  if (rule.requiresPlan && !row.planPath) return { ok: false, reason: "plan_submit first" };
  if (rule.requiresReport && row.reportCount === 0) return { ok: false, reason: "report_submit first" };
  return { ok: true, value: {
    status: to,
    results: result ? [...row.results, result] : row.results,
    validation: rule.clearsValidation ? null : row.validation,
    completes: to === "done",
    reopens: rule.kind === "reopen",
    kind: rule.kind,
  } };
}

export function decideDiscard(status: string): Decision<null> {
  return canDiscard(status) ? { ok: true, value: null } : { ok: false, reason: `cannot discard from ${status}` };
}

export const PLAN_VERIFIER = "plan-verifier";

export type ValidationInput = {
  status: string;
  text: string;
  verifierPassedAfterPlan: boolean;
};

export function decideValidation(i: ValidationInput): Decision<null> {
  if (!canRecordValidation(i.status)) return { ok: false, reason: `validation only in in_review (now ${i.status})` };
  const bad = checkText("validation", i.text);
  if (bad) return { ok: false, reason: bad };
  if (!i.verifierPassedAfterPlan) {
    return { ok: false, reason: "no plan-verifier pass recorded after the last plan_submit — dispatch plan-verifier, then record the validation" };
  }
  return { ok: true, value: null };
}

const PLAN_SUBMIT_STATUSES = new Set(["planning", "in_review"]);
export function isNoopTransition(status: string, to: string, result?: string): boolean {
  return status === to && result === undefined;
}

export function decidePlanSubmit(status: string): Decision<null> {
  return PLAN_SUBMIT_STATUSES.has(status)
    ? { ok: true, value: null }
    : { ok: false, reason: `plan_submit only in planning or in_review (now ${status})` };
}

const REPORT_SUBMIT_STATUSES = new Set(["in_review", "implementing", "done"]);

export const MAIN_LOOP = "main-loop";
const knownReporter = (actor: string, roster: readonly string[]) =>
  actor === MAIN_LOOP || REPORT_AGENTS.includes(actor) || roster.includes(actor);

export type ReportSubmitInput = {
  status: string;
  actor: string;
  roster: readonly string[];
  hasVerifyStep: boolean;
  acceptanceFailed: boolean;
};

export type ReportSubmitPatch = { accepts: boolean };

export function decideReportSubmit(i: ReportSubmitInput): Decision<ReportSubmitPatch> {
  if (!REPORT_SUBMIT_STATUSES.has(i.status)) {
    return { ok: false, reason: `report_submit only in in_review, implementing, or done (now ${i.status})` };
  }
  if (!knownReporter(i.actor, i.roster)) return { ok: false, reason: `unknown reporter: ${i.actor}` };
  if (i.status === "implementing" && !i.hasVerifyStep) {
    if (i.actor === MAIN_LOOP) {
      return {
        ok: false,
        reason: "main-loop reports in in_review (the round log, before validation_record moves the item on) or in done (the acceptance) — this item is implementing",
      };
    }
    return {
      ok: false,
      reason:
        `verify step not recorded for \`${i.actor}\` on this item` +
        " — record the verify step through agent_next before reporting." +
        " If the agent files still carry full step bodies, rerun /harness:init to get stubs.",
    };
  }
  if (i.status === "done" && i.actor === MAIN_LOOP && i.acceptanceFailed) {
    return { ok: false, reason: "acceptance failed on this item — the owner runs acceptance again or reopens it on the item page" };
  }
  return { ok: true, value: { accepts: i.status === "done" && i.actor === MAIN_LOOP } };
}

export const ACCEPTANCE_CHECKS = [1, 2, 3, 4, 5] as const;
type AcceptanceState = { status: string; cursor: string | null; accepted: boolean; failed: boolean };
export type AcceptanceFailInput = AcceptanceState & {
  checks: readonly number[]; note: string; path?: string; commit?: string;
};

export function decideAcceptanceFail(i: AcceptanceFailInput): Decision<null> {
  if (i.status !== "done" || i.cursor !== "accept" || i.accepted) {
    return { ok: false, reason: "acceptance_fail only while the item waits at the accept node" };
  }
  if (i.failed) return { ok: false, reason: "acceptance already failed — the owner runs acceptance again or reopens the item" };
  if (!Array.isArray(i.checks) || i.checks.length < 1 || i.checks.length > ACCEPTANCE_CHECKS.length
    || new Set(i.checks).size !== i.checks.length
    || i.checks.some(check => !Number.isInteger(check) || check < 1 || check > ACCEPTANCE_CHECKS.length)) {
    return { ok: false, reason: "checks: name the failed acceptance checks, 1 to 5, each once" };
  }
  const bad = checkText("note", i.note);
  if (bad) return { ok: false, reason: bad };
  const absentPair = i.path === undefined && i.commit === undefined;
  if (!absentPair && !(typeof i.path === "string" && i.path.trim() && typeof i.commit === "string" && i.commit.trim())) {
    return { ok: false, reason: "path and commit go together" };
  }
  return { ok: true, value: null };
}

export function decideAcceptanceRetry(i: AcceptanceState): Decision<null> {
  return i.status === "done" && i.cursor === "accept" && !i.accepted && i.failed
    ? { ok: true, value: null }
    : { ok: false, reason: "no failed acceptance to run again" };
}

export type GateInput = {
  gate: string;
  cursor: string | null;
  status: string;
  validation: string | null;
  planCommit: string | null;
  claimedPlanCommit: string | undefined;
  channel: "web" | "session";
};
export type GatePatch = { boundary: { from: string; to: string } | null };

export function decideGate(i: GateInput): Decision<GatePatch> {
  if (!isGateId(i.gate)) return { ok: false, reason: `not a gate: ${i.gate}` };
  if (i.cursor !== i.gate) {
    return { ok: false, reason: `not waiting at ${i.gate} — the item is at ${i.cursor ?? "the end of the pipeline"}` };
  }
  const boundary = boundaryOf(i.gate);
  if (boundary !== null) {
    const rule = findRule("human", i.status, boundary.to);
    if (!rule || rule.kind !== "gate" || i.status !== boundary.from) return { ok: false, reason: `not allowed: human ${i.status} → ${boundary.to}` };
  }
  if (i.channel === "session" && i.gate === gateId("implement")) {
    if (i.validation === null) {
      return { ok: false, reason: "no validation record — a session approves implementation only after plan-verifier's pass is recorded; approve in the Inbox to override" };
    }
    if (i.claimedPlanCommit === undefined) return { ok: false, reason: "planCommit required — state the commit you are approving (board_get shows it)" };
    if (i.planCommit === null || i.claimedPlanCommit !== i.planCommit) {
      return { ok: false, reason: `planCommit mismatch: the board records ${i.planCommit ?? "none"}` };
    }
  }
  return { ok: true, value: { boundary } };
}
