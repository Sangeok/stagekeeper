import { allowsAgent, capError, dispatchCutoff } from "@harness/core/entitlement.mjs";
import { dispatcherFor, SLOT_FORMAT } from "@harness/core/pipeline.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { readProjectAccessIn } from "../project-access-query";
import type { NextDeps, NextInput, NextOutput, Scope, OutcomeCommit, CommitResult } from "./next";
import type { ServerResult } from "../result";

class StaleCursor extends Error {}
class CursorRollback extends Error {
  constructor(readonly result: ServerResult<NextOutput>) { super("Outcome transaction must roll back"); }
}
// Bound execution validates and locks several rows before appending its outcome.
// Give remote DB round trips the same bounded budget as board mutations.
const CURSOR_TRANSACTION_TIMEOUT_MS = 15_000;
const stale = () => ({ ok: false as const, reason: "stale: call pipeline_next and agent_next without outcome; do not resubmit old work with new ids" });

// Every opener (including standalone PM) takes the owner's existing row first.
// Cursor mutation and its ledger append share this transaction; rendering does not.
export function cursorTransaction(client: PrismaClient, base: NextDeps): NonNullable<NextDeps["withCursor"]> {
  return async (scope: Scope, input: NextInput, key, work): Promise<ServerResult<NextOutput>> => {
    try {
      return await client.$transaction(async (tx) => {
        const { projectId, tokenId } = scope;
        const owner = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerUserId: true } });
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${owner.ownerUserId} FOR UPDATE`;
        const access = await readProjectAccessIn(tx, projectId);
        if (!access.available) return { ok: false, reason: access.reason };
        const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((r) => r.agent);
        if (!allowsAgent(access.plan, input.agent, roster)) return { ok: false, reason: `agent is not on the ${access.plan} plan` };
        const entry = input.entry;
        const receipt = input.receipt;
        if (input.outcome && !receipt) throw new StaleCursor();
        let closedTerminal = false;
        if (entry) {
          await tx.$queryRaw`SELECT "id" FROM "PipelineRun" WHERE "id" = ${entry.runId} FOR UPDATE`;
          const pipeline = await tx.pipelineRun.findUnique({ where: { id: entry.runId }, include: { version: true, boardItem: { include: { backlogItem: true } } } });
          if (!pipeline || pipeline.boardItem.projectId !== projectId || pipeline.boardItem.discardedAt || pipeline.version.format !== SLOT_FORMAT) throw new StaleCursor();
          const latest = await tx.boardItem.findFirst({ where: { projectId, backlogItemId: pipeline.boardItem.backlogItemId, discardedAt: null }, orderBy: { proposedOn: "desc" }, select: { id: true } });
          if (latest?.id !== pipeline.boardItemId || dispatcherFor(entry.slotId, pipeline.boardItem.agent) !== input.agent) throw new StaleCursor();
          const expectedKey = ["plan", "implement", "verify"].includes(entry.slotId) ? pipeline.boardItem.backlogItem.key : null;
          if (key !== expectedKey) throw new StaleCursor();
          if (input.outcome && (input.agentRunId !== undefined && input.agentRunId !== receipt!.runId || input.stepId !== undefined && input.stepId !== receipt!.stepId)) throw new StaleCursor();
          if (input.outcome) {
            const prior = await tx.agentRun.findUnique({ where: { id: receipt!.runId } });
            closedTerminal = ["ok", "failed", "blocked"].includes(input.outcome) && !!prior?.closedAt && prior.projectId === projectId && prior.agent === input.agent && prior.key === key
              && prior.pipelineRunId === entry.runId && prior.pipelineEntryId === entry.entryId && prior.stepId === receipt!.stepId && prior.revision === receipt!.revision
              && ((prior.stepId === "plan" && entry.slotId === "plan" && pipeline.boardItem.status === "in_review")
                || (prior.stepId === "hold" && pipeline.boardItem.status === "on_hold"));
            if (closedTerminal && prior?.closedAt) {
              closedTerminal = await tx.transitionEvent.findFirst({ where: {
                boardItemId: pipeline.boardItemId,
                ...(prior.stepId === "plan" ? { from: "planning", to: "in_review" } : { to: "on_hold" }),
                at: prior.closedAt,
              }, select: { id: true } }) !== null;
            }
          }
          if (!closedTerminal && (pipeline.closedAt || pipeline.node !== entry.slotId || pipeline.entryId !== entry.entryId || pipeline.boardItem.status === "on_hold")) throw new StaleCursor();
        } else if (key !== null) {
          const item = await tx.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" }, include: { run: { include: { version: true } } } });
          if (item?.run?.version.format !== null && item?.run?.version.format !== undefined) throw new StaleCursor();
        }
        const binding = { pipelineRunId: entry?.runId ?? null, pipelineEntryId: entry?.entryId ?? null };
        const where = { projectId, agent: input.agent, key, ...binding };
        let open = await tx.agentRun.findFirst({ where: { ...where, closedAt: null }, orderBy: { openedAt: "desc" } });
        const claimedRun = input.outcome ? await tx.agentRun.findFirst({ where: { ...where, id: receipt!.runId } }) : open;
        let selectedId = claimedRun?.id;
        if (selectedId) {
          await tx.$queryRaw`SELECT "id" FROM "AgentRun" WHERE "id" = ${selectedId} FOR UPDATE`;
          if (!closedTerminal) open = await tx.agentRun.findFirst({ where: { ...where, id: selectedId, closedAt: null } });
        }
        if (entry && input.outcome && !closedTerminal && (!open || open.id !== receipt!.runId || open.stepId !== receipt!.stepId || open.revision !== receipt!.revision)) throw new StaleCursor();
        let outcomeRollback = false;
        const deps: NextDeps = {
          ...base,
          withCursor: undefined,
          openRun: async () => closedTerminal ? null : open,
          recentRuns: (_project, since) => tx.agentRun.count({ where: { project: { ownerUserId: owner.ownerUserId }, openedAt: { gte: since } } }),
          createRun: async (_scope, agent, itemKey, stepId) => {
            if (open) return { ok: true, item: open };
            const count = await tx.agentRun.count({ where: { project: { ownerUserId: owner.ownerUserId }, openedAt: { gte: dispatchCutoff(new Date()) } } });
            const reason = capError(access.plan, "dispatches", count);
            if (reason) return { ok: false, reason };
            const item = await tx.agentRun.create({ data: { projectId, tokenId, agent, key: itemKey, stepId, ...binding } });
            selectedId = item.id;
            return { ok: true, item };
          },
          boardStatus: async (_project, itemKey) => (await tx.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key: itemKey } }, orderBy: { proposedOn: "desc" }, select: { status: true } }))?.status ?? null,
          openCount: async () => (await tx.boardItem.findMany({ where: { projectId, discardedAt: null }, distinct: ["backlogItemId"], orderBy: { proposedOn: "desc" }, select: { status: true } })).filter((r) => !["done", "on_hold"].includes(r.status)).length,
          verifyOk: async () => await tx.agentRunStep.findFirst({ where: { OR: [{ accepted: true }, { accepted: null }], stepId: "verify", outcome: "ok", run: entry ? { id: selectedId ?? "" } : where }, select: { id: true } }) !== null,
          runByReceipt: (_project, _agent, _key, runId) => tx.agentRun.findFirst({ where: { ...where, id: runId } }),
          closeRun: async (run) => {
            await tx.agentRun.updateMany({ where: { id: run.id, revision: run.revision, stepId: run.stepId, closedAt: null }, data: { closedAt: new Date() } });
          },
          commitOutcome: async (commit) => {
            try {
              const committed = await commitRunOutcome(tx, commit);
              if (entry && committed.kind !== "accepted") outcomeRollback = true;
              return committed;
            } catch (error) {
              outcomeRollback = true;
              throw error;
            }
          },
        };
        const result = await work(deps);
        if (outcomeRollback) throw new CursorRollback(result.ok ? stale() : result);
        return result.ok && entry ? { ok: true, item: { ...result.item, entry, agentRunId: selectedId } } : result;
      }, { timeout: CURSOR_TRANSACTION_TIMEOUT_MS });
    } catch (error) {
      if (error instanceof CursorRollback) return error.result;
      if (error instanceof StaleCursor) return stale();
      throw error;
    }
  };
}

export async function commitRunOutcome(tx: Prisma.TransactionClient, { scope, agent, key, receipt, outcome, note, destination }: OutcomeCommit): Promise<CommitResult> {
  const closed = destination.kind === "closed";
  const retired = destination.kind === "retired";
  const expected = retired ? destination.run : receipt;
  const terminalAllowed = !closed || destination.allowTerminal;
  const claimed = await tx.agentRun.updateMany({
    where: {
      id: receipt.runId, projectId: scope.projectId, agent, key, revision: expected.revision, stepId: expected.stepId,
      closedAt: closed ? { not: null } : null,
      ...(terminalAllowed ? {} : { id: { in: [] } }),
      ...(closed ? { steps: { none: { stepId: receipt.stepId, outcome: { in: ["ok", "blocked", "failed"] }, OR: [{ accepted: true }, { accepted: null }] } } } : {}),
    },
    data: {
      ...(retired ? { closedAt: new Date() } : { revision: { increment: 1 } }),
      ...(destination.kind === "step" ? { stepId: destination.stepId } : {}),
      ...(destination.kind === "done" ? { closedAt: new Date() } : {}),
      ...(destination.kind === "stay" && destination.refused ? { refused: { increment: 1 } } : {}),
    },
  });
  await tx.agentRunStep.create({ data: { runId: receipt.runId, stepId: receipt.stepId, outcome, note,
    callerTokenId: scope.tokenId, receiptRevision: receipt.revision, accepted: !retired && claimed.count === 1 } });
  const run = await tx.agentRun.findUniqueOrThrow({ where: { id: receipt.runId }, select: { id: true, stepId: true, revision: true, closedAt: true, refused: true } });
  if (!claimed.count || retired) return { kind: run.closedAt ? "closed" : "stale" };
  return { kind: "accepted", run, refused: run.refused };
}
