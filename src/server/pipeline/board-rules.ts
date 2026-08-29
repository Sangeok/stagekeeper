// 순수. DB·프레임워크 없음. transitions.mjs의 규칙을 "이 행에 이 요청을 적용해도 되는가"로 번역한다.
// MCP 도구와 웹 액션이 같은 함수를 부르므로 판정이 한 곳에만 있다.
import { canDiscard, canPropose, canRecordValidation, checkText, findRule } from "@harness/core/transitions.mjs";

export type Actor = "human" | "agent";
export type Decision<T> = { ok: true; value: T } | { ok: false; reason: string };

type Rule = {
  from: string; to: string; actor: Actor; kind: string;
  requiresResult?: boolean; requiresPlan?: boolean; requiresReport?: boolean; clearsValidation?: boolean;
};

export type RowSnapshot = { status: string; planPath: string | null; reportCount: number; results: string[]; validation: string | null };

export type ProposeInput = {
  backlogExists: boolean;       // 항목이 있고 removedAt === null
  hasOpenRow: boolean;          // 이 key의 최신 행이 미결
  openCount: number;            // 프로젝트 전체 미결 수
  roster: readonly string[];    // Workspace.agent 집합
  agent: string;
  reason: string;
};

export function decidePropose(i: ProposeInput): Decision<null> {
  if (!i.backlogExists) return { ok: false, reason: "no such backlog item (or removed)" };
  if (i.hasOpenRow) return { ok: false, reason: "already open" };
  if (!canPropose(i.openCount)) return { ok: false, reason: `open items: ${i.openCount} (max 2)` };
  if (!i.roster.includes(i.agent)) return { ok: false, reason: `agent not in roster: ${i.agent}` };
  const bad = checkText("reason", i.reason);
  return bad ? { ok: false, reason: bad } : { ok: true, value: null };
}

export type TransitionPatch = { status: string; results: string[]; validation: string | null; completes: boolean };

export function decideTransition(row: RowSnapshot, actor: Actor, to: string, result: string | undefined): Decision<TransitionPatch> {
  const rule = findRule(actor, row.status, to) as Rule | null;
  if (!rule) return { ok: false, reason: `not allowed: ${actor} ${row.status} → ${to}` };
  if (rule.requiresResult) { const bad = checkText("result", result); if (bad) return { ok: false, reason: bad }; }
  if (rule.requiresPlan && !row.planPath) return { ok: false, reason: "plan_submit first" };
  if (rule.requiresReport && row.reportCount === 0) return { ok: false, reason: "report_submit first" };
  return { ok: true, value: {
    status: to,
    results: result ? [...row.results, result] : row.results,
    validation: rule.clearsValidation ? null : row.validation,
    completes: to === "완료",
  } };
}

export function decideDiscard(status: string): Decision<null> {
  return canDiscard(status) ? { ok: true, value: null } : { ok: false, reason: `cannot discard from ${status}` };
}

export function decideValidation(status: string, text: string): Decision<null> {
  if (!canRecordValidation(status)) return { ok: false, reason: `validation only in 검토대기 (now ${status})` };
  const bad = checkText("validation", text);
  return bad ? { ok: false, reason: bad } : { ok: true, value: null };
}

export function decidePlanSubmit(status: string): Decision<null> {
  return status === "계획지시" ? { ok: true, value: null } : { ok: false, reason: `plan_submit only in 계획지시 (now ${status})` };
}
