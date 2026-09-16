import { DISPATCH_WINDOW_DAYS, REPORT_AGENTS, allowsAgent, capError, dispatchCutoff } from "@harness/core/entitlement.mjs";
import { renderTemplate } from "@harness/core/render.mjs";
import { STATUSES, canPropose } from "@harness/core/transitions.mjs";
import type { ProjectAccess } from "@/server/entitlement";
import type { ServerResult } from "@/server/result";
import { DONE, TemplateFormatError, findStep, splitTemplate, type ParsedTemplate, type Step } from "./steps";

// handoff: 커밋 권한이 없어 멈췄다 — 전진·분기 없이 원장에 남고 자리에 머문다. 배너가 이 행을 읽는다.
export const OUTCOMES = ["ok", "blocked", "failed", "handoff"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const NOTE_MAX = 500;
export const RATE_LIMIT = { calls: 60, windowMs: 10 * 60_000 }; // 토큰당, 원장 행(outcome 실은 호출) 기준
export const REFUSAL_WARN_AT = 10; // 한 run에서 이만큼 거부되면 console.warn — 상태를 바꿔가며 본문을 캐는 신호
const MAX_OPEN = 2; // transitions.mjs canPropose의 상한. 거부 문구에만 쓴다

export type Receipt = { runId: string; revision: number; stepId: string };
export type NextInput = { agent: string; key?: string; outcome?: Outcome; note?: string; receipt?: Receipt };
export type NextOutput = { step: string; instruction: string; receipt: Receipt; done: false } | { done: true; note?: string };
export type Scope = { projectId: string; tokenId: string };
export type RunRow = { id: string; stepId: string; revision: number; closedAt: Date | null };
export type OutcomeCommit = {
  scope: Scope; agent: string; key: string | null; receipt: Receipt; outcome: Outcome; note: string | null;
  destination: { kind: "stay"; refused: boolean } | { kind: "step"; stepId: string } | { kind: "done" } | { kind: "closed"; allowTerminal: boolean } | { kind: "retired"; run: RunRow };
};
export type CommitResult = { kind: "accepted"; run: RunRow; refused: number } | { kind: "stale" } | { kind: "closed" };

export type NextDeps = {
  access(projectId: string): Promise<ProjectAccess>;
  roster(projectId: string): Promise<string[]>; // Workspace.agent[] — wsId 순
  template(projectId: string, path: string): Promise<string | null>; // 프로젝트 언어의 템플릿 본문(없으면 en)
  vars(projectId: string, agent: string): Promise<Record<string, unknown>>;
  recentSteps(tokenId: string, since: Date): Promise<number>;
  recentRuns(projectId: string, since: Date): Promise<number>;
  openRun(projectId: string, agent: string, key: string | null): Promise<RunRow | null>;
  createRun(scope: Scope, agent: string, key: string | null, stepId: string): Promise<RunRow>;
  boardStatus(projectId: string, key: string): Promise<string | null>; // 폐기되지 않은 최신 행의 상태
  itemAgent(projectId: string, key: string): Promise<string | null>; // 그 행에 배정된 에이전트. 행이 없으면 null
  openCount(projectId: string): Promise<number>;
  verifyOk(projectId: string, agent: string, key: string | null): Promise<boolean>; // 같은 (project, agent, key)의 어느 run이든 verify/ok 기록
  runByReceipt(projectId: string, agent: string, key: string | null, runId: string): Promise<RunRow | null>;
  commitOutcome(input: OutcomeCommit): Promise<CommitResult>;
  closeRun(run: RunRow): Promise<void>;
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
  if (!access.available) return fail(access.reason);
  const roster = await deps.roster(projectId);
  if (!REPORT_AGENTS.includes(agent) && !roster.includes(agent)) return fail(`unknown agent: ${agent}`);
  if (!allowsAgent(access.plan, agent, roster)) return fail(`agent \`${agent}\` is not on the ${access.plan} plan`);
  // 항목 소유 검사. 예전에는 dev 템플릿의 라우터 단계가 board_get으로 보고 스스로 확인했다 —
  // 프롬프트가 아니라 서버가 강제한다(불변식 4와 같은 방향). 행이 없으면 여기서 말하지 않는다:
  // requires 판정이 `not open`으로 더 정확히 설명한다.
  //
  // **roster의 워크스페이스 에이전트에만 건다.** 보드 행의 agent는 언제나 dev이고, 보고 에이전트는
  // 그 항목을 **검사하러** key를 들고 온다(plan-verifier의 단계가 requires: in_review라 key가 필수다).
  // 모든 key 호출에 걸면 검증자가 통째로 막힌다 — 소유는 "누가 이 일을 하느냐"이지 "누가 볼 수 있느냐"가 아니다.
  if (key !== null && roster.includes(agent)) {
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

  const serve = async (run: RunRow, step: Step, prefix = ""): Promise<ServerResult<NextOutput>> => {
    const vars = await deps.vars(projectId, agent);
    const missing = await new Facts(deps, projectId, agent, key, false).unmet(step.requires);
    if (missing.length) return fail(`not open: step \`${step.id}\` opens when ${missing.join(" and ")}`);
    return ok({ step: step.id, instruction: prefix + renderTemplate(step.body, vars), done: false,
      receipt: { runId: run.id, revision: run.revision, stepId: run.stepId } });
  };
  const finished = (): ServerResult<NextOutput> => ok({ done: true, note: `no open run for ${agent}${key ? ` on ${key}` : ""} — this run is finished, not necessarily the item. Call again without outcome to start the next step, or ask pipeline_next what is left.` });
  if (input.outcome && (!input.receipt || typeof input.receipt.runId !== "string" || !input.receipt.runId
      || typeof input.receipt.stepId !== "string" || !input.receipt.stepId || !Number.isInteger(input.receipt.revision)
      || input.receipt.revision < 0 || input.receipt.revision > 2147483647)) {
    return fail("receipt required: call again without outcome and send the returned receipt. If your stub is outdated, run /harness:init again.");
  }
  const run = input.outcome
    ? await deps.runByReceipt(projectId, agent, key, input.receipt!.runId)
    : await deps.openRun(projectId, agent, key);
  if (!run) {
    if (input.outcome) return fail("this receipt does not belong to this call's run; call again without outcome");
    const used = await deps.recentRuns(projectId, dispatchCutoff(new Date()));
    const capMsg = capError(access.plan, "dispatches", used);
    if (capMsg) return fail(`${capMsg} Counted over the last ${DISPATCH_WINDOW_DAYS} days; pipeline_next shows the same cap, and it frees as older runs drop out of the window.`);
    const facts = new Facts(deps, projectId, agent, key, false);
    const unmet: string[] = [];
    for (const candidate of entrySteps(parsed)) {
      const missing = await facts.unmet(candidate.requires);
      if (!missing.length) return serve(await deps.createRun(scope, agent, key, candidate.id), candidate);
      unmet.push(`step \`${candidate.id}\` opens when ${missing.join(" and ")}`);
    }
    return fail(`not open: ${unmet.join("; ")}`);
  }
  const current = findStep(parsed, run.stepId);
  if (!input.outcome) {
    if (!current) {
      await deps.closeRun(run);
      return fail("the template changed under this run; call again without outcome to start over");
    }
    return serve(run, current);
  }
  const receipt = input.receipt!;
  let destination: OutcomeCommit["destination"] = { kind: "stay", refused: false };
  let target = current;
  let refusal: string | undefined;
  if (!current && !run.closedAt) {
    destination = { kind: "retired", run };
  } else if (run.closedAt) {
    destination = { kind: "closed", allowTerminal: !!current && input.outcome !== "handoff" };
  } else if (current && input.outcome !== "handoff") {
    const candidates = input.outcome === "ok" ? current.next
      : input.outcome === "failed" ? [current.onFailed] : [current.onBlocked];
    const routed = candidates.filter((id): id is string => id !== undefined);
    const facts = new Facts(deps, projectId, agent, key, current.id === "verify" && input.outcome === "ok");
    const unmet: string[] = [];
    for (const id of routed) {
      if (id === DONE) { destination = { kind: "done" }; break; }
      const candidate = findStep(parsed, id)!;
      const missing = await facts.unmet(candidate.requires);
      if (!missing.length) { target = candidate; destination = { kind: "step", stepId: id }; break; }
      unmet.push(`step \`${id}\` opens when ${missing.join(" and ")}`);
    }
    if (routed.length && destination.kind === "stay") {
      destination = { kind: "stay", refused: true };
      refusal = `not open: ${unmet.join("; ")}`;
    }
  }
  let committed: CommitResult;
  try {
    committed = await deps.commitOutcome({ scope, agent, key, receipt, outcome: input.outcome, note: input.note ?? null, destination });
  } catch {
    console.error("agent_next: outcome transaction failed", { runId: run.id, stepId: receipt.stepId });
    return fail("could not record the outcome; call again without outcome to see the current step");
  }
  if (committed.kind === "stale") return stale();
  if (committed.kind === "closed" || destination.kind === "closed" || destination.kind === "retired") return finished();
  if (committed.refused === REFUSAL_WARN_AT && destination.kind === "stay" && destination.refused) {
    console.warn(`agent_next: run ${run.id} (${projectId} ${agent}${key ? " " + key : ""}) hit ${committed.refused} refusals at step \`${run.stepId}\``);
  }
  if (refusal) return fail(refusal);
  if (destination.kind === "done") return ok({ done: true });
  const prefix = input.outcome === "handoff"
    ? `(handoff recorded — you are still on \`${target!.id}\`; after the commit, call again without outcome)\n\n`
    : destination.kind === "stay" ? `(${input.outcome} recorded; this step has no \`on ${input.outcome}:\` route — you are still on \`${target!.id}\`)\n\n` : "";
  return serve(committed.run, target!, prefix);
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
