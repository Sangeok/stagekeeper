// next.ts — agent_next의 규칙. DB·프레임워크 없음: 사실을 묻고 기록하는 일은 NextDeps로 받는다(runs.ts가 Prisma로 채운다).
//
// 에이전트는 템플릿 본문을 파일로 받지 않는다. 스텁(파일)이 "첫 호출은 agent_next"라고만 말하고, 여기가 단계를
// 한 번에 하나씩 준다. 커서는 AgentRun(project, agent, key)이고, outcome을 실은 호출마다 AgentRunStep 한 줄을 남긴다.
//
//   outcome 없음  → 지금 단계를 다시 준다(컴팩션·재시작 복구). run이 없으면 첫 단계로 새 run을 연다
//   outcome 있음  → 템플릿 지시어대로 전진한다. ok = next: 후보 순서, failed = on failed:, blocked = on blocked:
//                   후보의 requires가 전부 맞아야 열린다. 하나도 안 열리면 거부(문구 고정)하고 자리에 머문다
//                   목적지가 done이면 run을 닫고 {done: true}. 열린 run이 없는데 outcome이 오면 {done: true}
//                   (dev의 report·hold는 board_transition으로 항목을 옮긴 뒤 ok를 보낸다 — 그 사이 서버가 run을 닫았다)
//
// 지키는 것: 단계 본문은 커서가 가리키는 그것만 렌더한다. 전진은 CAS(stepId가 그대로일 때만)라 같은 호출이
// 두 번 와도 두 단계를 넘지 않는다. 열리지 않은 단계를 거듭 두드리면 refused가 쌓여 경고하고, 원장 행 수가
// 토큰당 호출 제한에 걸린다 — 보드 상태를 바꿔가며 본문을 긁어 모으는 값이 비싸진다.
import { REPORT_AGENTS, allowsAgent } from "@harness/core/entitlement.mjs";
import { renderTemplate } from "@harness/core/render.mjs";
import { STATUSES, canPropose } from "@harness/core/transitions.mjs";
import type { ProjectAccess } from "@/server/entitlement";
import type { ServerResult } from "@/server/result";
import { DONE, TemplateFormatError, findStep, splitTemplate, type ParsedTemplate, type Step } from "./steps";

export const OUTCOMES = ["ok", "blocked", "failed"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const NOTE_MAX = 500;
export const RATE_LIMIT = { calls: 60, windowMs: 10 * 60_000 }; // 토큰당, 원장 행(outcome 실은 호출) 기준
export const REFUSAL_WARN_AT = 10; // 한 run에서 이만큼 거부되면 console.warn — 상태를 바꿔가며 본문을 캐는 신호
const MAX_OPEN = 2; // transitions.mjs canPropose의 상한. 거부 문구에만 쓴다

export type NextInput = { agent: string; key?: string; outcome?: Outcome; note?: string };
export type NextOutput = { step: string; instruction: string; done: false } | { done: true };
export type Scope = { projectId: string; tokenId: string };
export type RunRow = { id: string; stepId: string };

export type NextDeps = {
  access(projectId: string): Promise<ProjectAccess>;
  roster(projectId: string): Promise<string[]>; // Workspace.agent[] — wsId 순
  template(projectId: string, path: string): Promise<string | null>; // 프로젝트 언어의 템플릿 본문(없으면 en)
  vars(projectId: string, agent: string): Promise<Record<string, unknown>>;
  recentSteps(tokenId: string, since: Date): Promise<number>;
  openRun(projectId: string, agent: string, key: string | null): Promise<RunRow | null>;
  createRun(scope: Scope, agent: string, key: string | null, stepId: string): Promise<RunRow>;
  boardStatus(projectId: string, key: string): Promise<string | null>; // 폐기되지 않은 최신 행의 상태
  itemAgent(projectId: string, key: string): Promise<string | null>; // 그 행에 배정된 에이전트. 행이 없으면 null
  openCount(projectId: string): Promise<number>;
  verifyOk(projectId: string, agent: string, key: string | null): Promise<boolean>; // 같은 (project, agent, key)의 어느 run이든 verify/ok 기록
  record(runId: string, step: { stepId: string; outcome: Outcome; note: string | null }): Promise<void>;
  advance(runId: string, from: string, to: string | null): Promise<boolean>; // CAS. to === null 이면 닫는다. 어긋나면 false
  refused(runId: string): Promise<number>; // 거부 횟수를 올리고 그 값을 준다
};

const fail = (reason: string): ServerResult<never> => ({ ok: false, reason });
const ok = <T>(item: T): ServerResult<T> => ({ ok: true, item });

// 템플릿이 보드 상태로 단계를 가르면 항목에 묶인 에이전트다 — key가 있어야 그 상태를 볼 수 있다.
const needsKey = (parsed: ParsedTemplate) =>
  parsed.steps.some((s) => s.requires.some((r) => STATUSES.includes(r) || r === "verify-ok"));

// 새 run이 시작할 수 있는 단계. **실패 분기 전용 단계는 뺀다** — hold처럼 `on failed:`/`on blocked:`로만
// 닿는 단계는 보통 requires가 없어서, 순서 훑기에 그냥 두면 어떤 보드 상태에서도 열리는 만능 입구가
// 된다(항목이 proposed인데 hold로 run이 열린다). 실패 분기는 그 실패를 겪은 run만 들어가는 곳이다.
// `next:`로도 닿는 단계는 정상 경로의 일부이므로 남는다(pm의 report가 그렇다).
const entrySteps = (parsed: ParsedTemplate): Step[] => {
  const viaNext = new Set(parsed.steps.flatMap((s) => s.next));
  const viaFailure = new Set(parsed.steps.flatMap((s) => [s.onFailed, s.onBlocked].filter((x) => x !== undefined)));
  return parsed.steps.filter((s) => !(viaFailure.has(s.id) && !viaNext.has(s.id)));
};

export async function agentNext(deps: NextDeps, scope: Scope, input: NextInput): Promise<ServerResult<NextOutput>> {
  const { projectId, tokenId } = scope;
  const { agent } = input;
  const key = input.key ?? null;

  const access = await deps.access(projectId);
  if (access.locked) return fail(access.reason);
  const roster = await deps.roster(projectId);
  if (!REPORT_AGENTS.includes(agent) && !roster.includes(agent)) return fail(`unknown agent: ${agent}`);
  if (!allowsAgent(access.plan, agent, roster)) return fail(`agent \`${agent}\` is not on the ${access.plan} plan`);
  // 항목 소유 검사. 예전에는 dev 템플릿의 라우터 단계가 board_get으로 보고 스스로 확인했다 —
  // 프롬프트가 아니라 서버가 강제한다(불변식 4와 같은 방향). 행이 없으면 여기서 말하지 않는다:
  // requires 판정이 `not open`으로 더 정확히 설명한다.
  if (key !== null) {
    const owner = await deps.itemAgent(projectId, key);
    if (owner !== null && owner !== agent) return fail(`item ${key} belongs to \`${owner}\`, not \`${agent}\``);
  }
  if ((await deps.recentSteps(tokenId, new Date(Date.now() - RATE_LIMIT.windowMs))) >= RATE_LIMIT.calls) {
    return fail(`rate limit: ${RATE_LIMIT.calls} calls per ${RATE_LIMIT.windowMs / 60_000} minutes per token`);
  }

  const path = roster.includes(agent) ? "agents/dev.md" : `agents/${agent}.md`;
  const body = await deps.template(projectId, path);
  if (body === null) return fail(`no template for agent \`${agent}\``);
  let parsed: ParsedTemplate;
  try {
    parsed = splitTemplate(body);
  } catch (e) {
    if (e instanceof TemplateFormatError) return fail(`template for agent \`${agent}\` is malformed: ${e.message}`);
    throw e;
  }
  if (parsed.steps.length === 0) return fail(`template for agent \`${agent}\` has no steps`);
  if (needsKey(parsed) && key === null) return fail(`agent \`${agent}\` needs a key`);
  if (!needsKey(parsed) && key !== null) return fail(`agent \`${agent}\` takes no key`);

  const serve = async (step: Step, prefix = ""): Promise<ServerResult<NextOutput>> => {
    const vars = await deps.vars(projectId, agent);
    return ok({ step: step.id, instruction: prefix + renderTemplate(step.body, vars), done: false });
  };

  const run = await deps.openRun(projectId, agent, key);
  if (!run) {
    if (input.outcome) return ok({ done: true });
    // **열리는 첫 단계**로 연다. 예전에는 언제나 steps[0]이라, 보드 상태로 갈라지는 에이전트(dev)는
    // 상태를 읽고 스스로 분기하는 라우터 단계를 따로 둬야 했다 — 그 단계는 일을 하나도 하지 않으면서
    // 왕복 하나(약 63,000 토큰, G1 실측)를 썼다. 판정은 전진 때 쓰는 것과 같은 requires다.
    // 첫 단계에 requires가 없는 템플릿(pm·plan-verifier·doc-auditor·feature-scout)은 동작이 같다.
    const facts = new Facts(deps, projectId, agent, key, false);
    const unmet: string[] = [];
    for (const candidate of entrySteps(parsed)) {
      const missing = await facts.unmet(candidate.requires);
      if (missing.length === 0) {
        await deps.createRun(scope, agent, key, candidate.id);
        return serve(candidate);
      }
      unmet.push(`step \`${candidate.id}\` opens when ${missing.join(" and ")}`);
    }
    // 열린 단계가 없으면 **run을 만들지 않는다** — 커서를 남기면 다음 호출이 그 자리에 갇힌다.
    return fail(`not open: ${unmet.join("; ")}`);
  }

  const current = findStep(parsed, run.stepId);
  if (!current) {
    // 템플릿이 run 도중에 바뀌었다(시드). 커서가 가리킬 곳이 없으니 닫고 처음부터 다시 걷게 한다.
    await deps.advance(run.id, run.stepId, null);
    return fail(`the template changed under this run; call again without outcome to start over`);
  }
  if (!input.outcome) return serve(current);

  const outcome = input.outcome;
  const note = input.note ?? null;
  await deps.record(run.id, { stepId: current.id, outcome, note });

  const candidates = outcome === "ok" ? current.next : outcome === "failed" ? [current.onFailed] : [current.onBlocked];
  const routed = candidates.filter((c): c is string => c !== undefined);
  if (routed.length === 0) {
    return serve(current, `(${outcome} recorded; this step has no \`on ${outcome}:\` route — you are still on \`${current.id}\`)\n\n`);
  }

  // requires 판정. 지금 보고하는 단계도 사실로 친다 — verify를 ok로 보내는 그 호출에서 report의 verify-ok가 선다.
  const facts = new Facts(deps, projectId, agent, key, current.id === "verify" && outcome === "ok");
  const unmet: string[] = [];
  for (const id of routed) {
    if (id === DONE) {
      if (!(await deps.advance(run.id, current.id, null))) return stale();
      return ok({ done: true });
    }
    const target = findStep(parsed, id)!; // splitTemplate이 참조를 검증했다
    const missing = await facts.unmet(target.requires);
    if (missing.length === 0) {
      if (!(await deps.advance(run.id, current.id, target.id))) return stale();
      return serve(target);
    }
    unmet.push(`step \`${target.id}\` opens when ${missing.join(" and ")}`);
  }
  const count = await deps.refused(run.id);
  if (count === REFUSAL_WARN_AT) {
    console.warn(`agent_next: run ${run.id} (${projectId} ${agent}${key ? " " + key : ""}) hit ${count} refusals at step \`${current.id}\``);
  }
  return fail(`not open: ${unmet.join("; ")}`);
}

const stale = () => fail("stale: the run moved under this call — call again without outcome to see the current step");

// requires 한 항목을 사실과 견주고, 안 맞으면 고정 문구를 돌려준다. 사실은 물을 때만 한 번 읽는다.
class Facts {
  private status?: Promise<string | null>;
  private open?: Promise<number>;
  private verified?: Promise<boolean>;
  constructor(
    private readonly deps: NextDeps, private readonly projectId: string, private readonly agent: string,
    private readonly key: string | null, private readonly verifyingNow: boolean,
  ) {}
  async unmet(requires: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const r of requires) {
      const why = await this.check(r);
      if (why) out.push(why);
    }
    return out;
  }
  private async check(r: string): Promise<string | null> {
    if (r === "verify-ok") {
      this.verified ??= this.verifyingNow ? Promise.resolve(true) : this.deps.verifyOk(this.projectId, this.agent, this.key);
      return (await this.verified) ? null : "a `verify` step is recorded `ok` (none yet)";
    }
    if (r === "can-propose") {
      this.open ??= this.deps.openCount(this.projectId);
      const n = await this.open;
      return canPropose(n) ? null : `fewer than ${MAX_OPEN} items are open (now ${n})`;
    }
    // 보드 상태. key 없는 에이전트의 템플릿에는 오지 않는다(needsKey가 먼저 막는다)
    this.status ??= this.deps.boardStatus(this.projectId, this.key ?? "");
    const now = await this.status;
    return now === r ? null : `the item is \`${r}\` (now \`${now ?? "not on the board"}\`)`;
  }
}
