// 순수. DB·프레임워크 없음. transitions.mjs의 규칙을 "이 행에 이 요청을 적용해도 되는가"로 번역한다.
// MCP 도구와 웹 액션이 같은 함수를 부르므로 판정이 한 곳에만 있다.
import { REPORT_AGENTS } from "@harness/core/entitlement.mjs";
import { canDiscard, canPropose, canRecordValidation, checkText, findRule } from "@harness/core/transitions.mjs";

export type Actor = "human" | "agent";
export type Decision<T> = { ok: true; value: T } | { ok: false; reason: string };

// kind는 화면이 읽는 어휘다 — review-gate/model/gate-source.ts가 "gate"·"resume"·"bounce"로
// 무엇을 보여줄지 정한다. string으로 두면 그쪽 비교가 오타여도 컴파일이 통과하고 분류만 조용히
// 어긋난다. 값의 출처는 packages/core/transitions.mjs의 RULES 표다.
export type RuleKind = "gate" | "bounce" | "hold" | "resume" | "plan" | "done";

type Rule = {
  from: string; to: string; actor: Actor; kind: RuleKind;
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
  // 필수든 선택이든, 온 result는 150자 예산을 지킨다(되돌리기 노트가 선택 result로 들어온다).
  if (rule.requiresResult || result !== undefined) { const bad = checkText("result", result); if (bad) return { ok: false, reason: bad }; }
  if (rule.requiresPlan && !row.planPath) return { ok: false, reason: "plan_submit first" };
  if (rule.requiresReport && row.reportCount === 0) return { ok: false, reason: "report_submit first" };
  return { ok: true, value: {
    status: to,
    results: result ? [...row.results, result] : row.results,
    validation: rule.clearsValidation ? null : row.validation,
    completes: to === "done",
  } };
}

export function decideDiscard(status: string): Decision<null> {
  return canDiscard(status) ? { ok: true, value: null } : { ok: false, reason: `cannot discard from ${status}` };
}

export function decideValidation(status: string, text: string): Decision<null> {
  if (!canRecordValidation(status)) return { ok: false, reason: `validation only in in_review (now ${status})` };
  const bad = checkText("validation", text);
  return bad ? { ok: false, reason: bad } : { ok: true, value: null };
}

// in_review 재제출 = 검증 라운드가 고친 계획서의 커밋 갱신 — planCommit이 승인 대상(HEAD)을 가리키게 한다(F3).
const PLAN_SUBMIT_STATUSES = new Set(["planning", "in_review"]);
export function decidePlanSubmit(status: string): Decision<null> {
  return PLAN_SUBMIT_STATUSES.has(status)
    ? { ok: true, value: null }
    : { ok: false, reason: `plan_submit only in planning or in_review (now ${status})` };
}

// 보고는 실제 작업이 있는 상태에서만: 검증 라운드 기록(in_review) · 구현 보고(implementing) · 인수 기록(done).
// proposed·planning은 아직 보고할 일이 없고, on_hold 제출은 결재함의 보류 전 상태 판독(heldFrom)을 흐린다.
const REPORT_SUBMIT_STATUSES = new Set(["in_review", "implementing", "done"]);

// main-loop은 .claude/agents 정의가 없는 디스패처지만 **보고 행위자다** — 검증 라운드 기록과 인수 기록을
// 낸다(protocol.md의 report_submit 행, 템플릿 docs/agents/README.md의 행위자 표). roster(Workspace.agent)에도
// REPORT_AGENTS에도 없으므로 여기서 따로 더한다. 빼면 런북 7단계의 인수 등록이 막힌다.
export const MAIN_LOOP = "main-loop";
const knownReporter = (actor: string, roster: readonly string[]) =>
  actor === MAIN_LOOP || REPORT_AGENTS.includes(actor) || roster.includes(actor);

export type ReportSubmitInput = {
  status: string;
  actor: string;
  roster: readonly string[]; // Workspace.agent[]
  // 같은 (project, actor, key)에 stepId "verify" 원장 행이 있는가 — **outcome은 묻지 않는다**.
  hasVerifyStep: boolean;
};

// 불변식 8의 벽. 두 가지를 건다.
//  ① 행위자: 아무 이름이나 보고 파일을 심을 수 없다. 고정 4종 + 워크스페이스 dev + main-loop만.
//  ② 검증 선행: implementing(구현 보고)에서만 verify 기록을 요구한다. in_review(검증 라운드 기록)와
//     done(인수 기록)은 요구하지 않는다 — 예외를 **상태**로 걸어야 이름 위장으로 못 지나간다.
// verify를 outcome 불문으로 보는 이유(후보 (a), G1에서 hold 사례가 0건이라 설계 근거로 택함):
// dev의 hold 보고는 verify가 failed/blocked로 끝난 뒤 implementing에서 나온다. outcome을 ok로 좁히면
// 그 보고가 막힌다. 불변식의 뜻은 "보고 전에 검증을 시도했다"이고, 그건 커서(AgentRun.stepId)에
// 결합하지 않고도 원장 한 줄로 표현된다.
export function decideReportSubmit(i: ReportSubmitInput): Decision<null> {
  if (!REPORT_SUBMIT_STATUSES.has(i.status)) {
    return { ok: false, reason: `report_submit only in in_review, implementing, or done (now ${i.status})` };
  }
  if (!knownReporter(i.actor, i.roster)) return { ok: false, reason: `unknown reporter: ${i.actor}` };
  // 문구가 원인까지 말한다. 이 벽에 걸리는 흔한 경우는 "검증을 건너뛴 에이전트"가 아니라
  // **Phase 4 이전에 init한 프로젝트**다 — 통짜 본문 파일을 그대로 들고 있으면 agent_next를 부르지 않아
  // 원장에 verify가 남지 않는다. 그 사용자에게 필요한 다음 행동은 재검증이 아니라 /harness:init 재실행이다.
  if (i.status === "implementing" && !i.hasVerifyStep) {
    return {
      ok: false,
      reason:
        `verify step not recorded for \`${i.actor}\` on this item` +
        " — record the verify step through agent_next before reporting." +
        " If the agent files still carry full step bodies, rerun /harness:init to get stubs.",
    };
  }
  return { ok: true, value: null };
}
