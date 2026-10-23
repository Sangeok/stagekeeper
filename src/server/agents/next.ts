import { z } from "zod";
import { REPORT_AGENTS, allowsAgent } from "@harness/core/plans/entitlement.mjs";
import { renderTemplate } from "@harness/core/templates/render.mjs";
import { parseClient, runtimeEcho, type Client } from "@harness/core/execution/client-runtime.mjs";
import { STATUSES, canPropose } from "@harness/core/pipeline/transitions.mjs";
import type { ProjectAccess } from "@/server/projects/contracts";
import type { ServerResult, UsageLimitFailure } from "@/server/result";
import type { PipelineEntry } from "@/server/pipeline/contracts";
import { DONE, TemplateFormatError, findStep, splitTemplate } from "@/server/templates/api";
import { type ParsedTemplate, type Step } from "@/server/templates/contracts";

export const OUTCOMES = ["ok", "blocked", "failed", "handoff"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const NOTE_MAX = 500;
export const REVISION_MAX = 2_147_483_647;
export const REFUSAL_WARN_AT = 10;
const MAX_OPEN = 2;

export const receiptSchema = z.object({ runId: z.string().min(1), revision: z.number().int().min(0).max(REVISION_MAX), stepId: z.string().min(1) });
export type Receipt = z.infer<typeof receiptSchema>;

export function isWellFormedReceipt(receipt: Receipt | undefined): receipt is Receipt {
  return receiptSchema.safeParse(receipt).success;
}
export type NextInput = { agent: string; client?: Client; key?: string; outcome?: Outcome; note?: string; receipt?: Receipt; entry?: PipelineEntry; agentRunId?: string; stepId?: string };
export type NextOutput = ({ step: string; instruction: string; receipt: Receipt; done: false } | { done: true; note?: string }) & { entry?: PipelineEntry; agentRunId?: string; runtime?: ReturnType<typeof runtimeEcho> };
export type Scope = { projectId: string; tokenId: string };
export type RunRow = { id: string; stepId: string; revision: number; closedAt: Date | null };
export type OutcomeCommit = {
  scope: Scope; agent: string; key: string | null; receipt: Receipt; outcome: Outcome; note: string | null;
  destination: { kind: "stay"; refused: boolean } | { kind: "step"; stepId: string } | { kind: "done" } | { kind: "closed"; allowTerminal: boolean } | { kind: "retired"; run: RunRow };
};
export type CommitResult = { kind: "accepted"; run: RunRow; refused: number } | { kind: "stale" } | { kind: "closed" };

export type NextDeps = {
  withCursor?(scope: Scope, input: NextInput, key: string | null, work: (deps: NextDeps) => Promise<ServerResult<NextOutput>>): Promise<ServerResult<NextOutput>>;
  access(projectId: string): Promise<ProjectAccess>;
  roster(projectId: string): Promise<string[]>;
  template(projectId: string, path: string, client?: Client): Promise<string | null>;
  vars(projectId: string, agent: string, client?: Client): Promise<Record<string, unknown>>;
  usageCap(projectId: string): Promise<UsageLimitFailure | null>;
  openRun(projectId: string, agent: string, key: string | null): Promise<RunRow | null>;
  createRun(scope: Scope, agent: string, key: string | null, stepId: string): Promise<ServerResult<RunRow>>;
  boardStatus(projectId: string, key: string): Promise<string | null>;
  itemAgent(projectId: string, key: string): Promise<string | null>;
  openCount(projectId: string): Promise<number>;
  verifyOk(projectId: string, agent: string, key: string | null): Promise<boolean>;
  runByReceipt(projectId: string, agent: string, key: string | null, runId: string): Promise<RunRow | null>;
  commitOutcome(input: OutcomeCommit): Promise<CommitResult>;
  closeRun(run: RunRow): Promise<void>;
};

const fail = (reason: string): ServerResult<never> => ({ ok: false, reason });
const ok = <T>(item: T): ServerResult<T> => ({ ok: true, item });

const needsKey = (parsed: ParsedTemplate) =>
  parsed.steps.some((s) => s.requires.some((r) => STATUSES.some(status => status === r) || r === "verify-ok"));

const entrySteps = (parsed: ParsedTemplate): Step[] => {
  const viaNext = new Set(parsed.steps.flatMap((s) => s.next));
  const viaFailure = new Set(parsed.steps.flatMap((s) => [s.onFailed, s.onBlocked].filter((x) => x !== undefined)));
  return parsed.steps.filter((s) => !(viaFailure.has(s.id) && !viaNext.has(s.id)));
};

export async function agentNext(deps: NextDeps, scope: Scope, input: NextInput): Promise<ServerResult<NextOutput>> {
  const { projectId } = scope;
  const { agent } = input;
  const key = input.key ?? null;
  if (input.entry && !deps.withCursor) return fail("bound execution requires the cursor transaction adapter");

  const access = await deps.access(projectId);
  if (!access.available) return fail(access.reason);
  let client: Client;
  try { client = parseClient(input.client); } catch { return fail("client must be claude or codex"); }
  const roster = await deps.roster(projectId);
  if (!REPORT_AGENTS.includes(agent) && !roster.includes(agent)) return fail(`unknown agent: ${agent}`);
  if (!allowsAgent(access.plan, agent, roster)) return fail(`agent \`${agent}\` is not on the ${access.plan} plan`);
  if (key !== null && roster.includes(agent)) {
    const owner = await deps.itemAgent(projectId, key);
    if (owner !== null && owner !== agent) return fail(`item ${key} belongs to \`${owner}\`, not \`${agent}\``);
  }

  const path = roster.includes(agent) ? "agents/dev.md" : `agents/${agent}.md`;
  let body: string | null;
  try { body = await deps.template(projectId, path, client); }
  catch (error) { return fail(error instanceof Error ? error.message : "client bundle unavailable"); }
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

  const vars = await deps.vars(projectId, agent, client);
  try { parsed = { ...parsed, steps: parsed.steps.map(step => ({ ...step, body: renderTemplate(step.body, vars) })) }; }
  catch (error) { return fail(`template render failed: ${error instanceof Error ? error.message : "invalid variables"}`); }
  const execute = async (deps: NextDeps): Promise<ServerResult<NextOutput>> => {
    const serve = async (run: RunRow, step: Step, prefix = ""): Promise<ServerResult<NextOutput>> => {
      const missing = await new Facts(deps, projectId, agent, key, false).unmet(step.requires);
      if (missing.length) return fail(`not open: step \`${step.id}\` opens when ${missing.join(" and ")}`);
      return ok({ step: step.id, instruction: prefix + step.body, done: false,
        receipt: { runId: run.id, revision: run.revision, stepId: run.stepId } });
    };
    const finished = (): ServerResult<NextOutput> => ok({ done: true, note: `no open run for ${agent}${key ? ` on ${key}` : ""} — this run is finished, not necessarily the item. Call again without outcome to start the next step, or ask pipeline_next what is left.` });
    const { outcome } = input;
    let claim: Receipt | null = null;
    if (outcome) {
      if (!isWellFormedReceipt(input.receipt)) {
        return fail("receipt required: call again without outcome and send the returned receipt. If your stub is outdated, run /harness:init again.");
      }
      claim = input.receipt;
    }
    const run = claim
      ? await deps.runByReceipt(projectId, agent, key, claim.runId)
      : await deps.openRun(projectId, agent, key);
    if (!run) {
      if (claim) return fail("this receipt does not belong to this call's run; call again without outcome");
      const cap = await deps.usageCap(projectId);
      if (cap) return cap;
      const facts = new Facts(deps, projectId, agent, key, false);
      const unmet: string[] = [];
      for (const candidate of entrySteps(parsed)) {
        const missing = await facts.unmet(candidate.requires);
        if (!missing.length) {
          const created = await deps.createRun(scope, agent, key, candidate.id);
          if (!created.ok) return created;
          const actual = findStep(parsed, created.item.stepId);
          if (!actual) return fail("the template changed under this run");
          return serve(created.item, actual);
        }
        unmet.push(`step \`${candidate.id}\` opens when ${missing.join(" and ")}`);
      }
      return fail(`not open: ${unmet.join("; ")}`);
    }
    const current = findStep(parsed, run.stepId);
    if (!outcome || !claim) {
      if (!current) {
        await deps.closeRun(run);
        return fail("the template changed under this run; call again without outcome to start over");
      }
      return serve(run, current);
    }
    const receipt = claim;
    let destination: OutcomeCommit["destination"] = { kind: "stay", refused: false };
    let target = current;
    let refusal: string | undefined;
    if (!current && !run.closedAt) {
      destination = { kind: "retired", run };
    } else if (run.closedAt) {
      destination = { kind: "closed", allowTerminal: !!current && outcome !== "handoff" };
    } else if (current && outcome !== "handoff") {
      const candidates = outcome === "ok" ? current.next
        : outcome === "failed" ? [current.onFailed] : [current.onBlocked];
      const routed = candidates.filter((id): id is string => id !== undefined);
      const facts = new Facts(deps, projectId, agent, key, current.id === "verify" && outcome === "ok");
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
      committed = await deps.commitOutcome({ scope, agent, key, receipt, outcome, note: input.note ?? null, destination });
    } catch (error) {
      console.error("agent_next: outcome transaction failed", { runId: run.id, stepId: receipt.stepId, error });
      return fail("could not record the outcome; call again without outcome to see the current step");
    }
    if (committed.kind === "stale") return stale();
    if (committed.kind === "closed" || destination.kind === "closed" || destination.kind === "retired") return finished();
    if (committed.refused === REFUSAL_WARN_AT && destination.kind === "stay" && destination.refused) {
      console.warn(`agent_next: run ${run.id} (${projectId} ${agent}${key ? " " + key : ""}) hit ${committed.refused} refusals at step \`${run.stepId}\``);
    }
    if (refusal) return fail(refusal);
    if (destination.kind === "done") return ok({ done: true });
    const prefix = outcome === "handoff"
      ? `(handoff recorded — you are still on \`${target!.id}\`; after the commit, call again without outcome)\n\n`
      : destination.kind === "stay" ? `(${outcome} recorded; this step has no \`on ${outcome}:\` route — you are still on \`${target!.id}\`)\n\n` : "";
    return serve(committed.run, target!, prefix);
  };
  const result = await (deps.withCursor ? deps.withCursor(scope, input, key, execute) : execute(deps));
  if (!result.ok && result.code === "USAGE_LIMIT_REACHED") console.info("account-usage:limited");
  if (result.ok && client === "codex") return ok({ ...result.item, runtime: runtimeEcho() });
  return result;
}

const stale = () => fail("stale: the run moved under this call — call again without outcome to see the current step");

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
    this.status ??= this.deps.boardStatus(this.projectId, this.key ?? "");
    const now = await this.status;
    return now === r ? null : `the item is \`${r}\` (now \`${now ?? "not on the board"}\`)`;
  }
}
