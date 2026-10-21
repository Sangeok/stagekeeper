import { randomUUID } from "node:crypto";
import { allowsSessionApprovals, capError } from "@harness/core/entitlement.mjs";
import { nextItemKey, SCOUT_ITEMS_PER_RUN, toItemType } from "@harness/core/backlog.mjs";
import { readProjectAccessIn, readProjectPlanIn } from "@/server/projects/api";
import { advance, sequence, routePipeline, cursorForStatus, gateId, SLOT_FORMAT, AUTO_SCOUT_DISABLED_REASON } from "@harness/core/pipeline.mjs";
import { hasActiveLegacyScoutSlot } from "./automatic-scout";
import { isOpen } from "@harness/core/transitions.mjs";
import { Prisma, type PrismaClient, type BoardItem, type BacklogItem, type AcceptanceFailure } from "@/generated/prisma/client";
import type { ServerResult } from "@/server/result";
import { ensureRunIn, ensureDefaultPipeline, ensureRunnableVersion, PIPELINE_CANNOT_RUN_ITEMS, PIPELINE_NOT_FOUND, readFacts, type Graph, type GateEntry } from "./run-service";
import { countPickable, decideAcceptanceFail, decideAcceptanceRetry, decideDiscard, decideGate, decidePlanSubmit, decidePropose, decideReportSubmit, decideTransition, decideValidation, isNoopTransition, MAIN_LOOP, PLAN_VERIFIER } from "./board-rules";
import { afterCursor, eventWhere, mergeHistoryPage, type HistoryCursor, type HistoryRecord, type HistoryView } from "./history-page";
import { historyItemsQuery, type HistoryItemRecord, type HistoryItemsOptions } from "./history-items";
import { parseQaReport } from "@harness/core/qa.mjs";
import { implementationReport } from "./qa-query";
import { IMPL_VERIFIER, IMPL_VERIFY_PENDING, implVerifierReportPath } from "./impl-verify-query";

import { PipelineRejection, rethrowPipelineConflict } from "./lock-pipeline";

export type { ServerResult } from "@/server/result";
const fail = (reason: string): ServerResult<never> => ({ ok: false, reason });
type Db = PrismaClient | Prisma.TransactionClient;
const BOARD_TRANSACTION_TIMEOUT_MS = 15_000;
class BoardRejection extends Error {}
function reportFailure<Args extends unknown[], Result>(action: (...args: Args) => Promise<Result>) {
  return async (...args: Args): Promise<Result | ServerResult<never>> => {
    try { return await action(...args); }
    catch (error) {
      if (error instanceof BoardRejection || error instanceof PipelineRejection) return fail(error.message);
      throw error;
    }
  };
}

export type Channel = "web" | "session";
export type Caller =
  | { actor: "human"; actorRef: string; channel: Channel; expectedUpdatedAt: Date }
  | { actor: "agent"; actorRef: string }
  | { actor: "pipeline"; actorRef: string };

export type Proposer = { actor: "agent"; actorRef: string } | { actor: "human"; actorRef: string; channel: Channel };

export const PIPELINE_CHANGE_UNAVAILABLE = "The pipeline can change only while the item is proposed and nothing has run on it yet.";


export function createBoardQueries(prisma: PrismaClient) {
async function inProjectTransaction<Result>(projectId: string, work: (tx: Prisma.TransactionClient) => Promise<Result>, options?: { isolationLevel: "Serializable" }) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerUserId: true } });
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${project.ownerUserId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
    const access = await readProjectAccessIn(tx, projectId);
    if (!access.available) throw new BoardRejection(access.reason);
    const result = await work(tx);
    if (isRejection(result)) throw new BoardRejection(result.reason);
    return result;
  }, { timeout: BOARD_TRANSACTION_TIMEOUT_MS, ...options }).catch(rethrowPipelineConflict);
}
async function addBacklog(projectId: string, input: {
  title: string; area: string; source: string; type: string | null;
  addedBy: "owner" | "feature-scout"; addedByRunId: string | null;
}): Promise<ServerResult<{ key: string }>> {
  if (!input.title.trim()) return fail("Title is required.");
  return inProjectTransaction(projectId, async (tx) => {
    if (input.addedByRunId !== null) {
      const run = await tx.agentRun.findFirst({ where: {
        id: input.addedByRunId, projectId, agent: "feature-scout", closedAt: null,
      }, select: { id: true, pipelineRunId: true, pipelineEntryId: true, project: { select: { autoScoutEnabled: true } } } });
      if (!run) return fail("backlog_add needs an open feature-scout run");
      if (run.pipelineRunId === null && run.pipelineEntryId === null && !run.project.autoScoutEnabled
        && !await hasActiveLegacyScoutSlot(tx, projectId)) return fail(AUTO_SCOUT_DISABLED_REASON);
    }
    const plan = await readProjectPlanIn(tx, projectId);
    const live = await tx.backlogItem.count({ where: { projectId, removedAt: null } });
    const capMsg = capError(plan, "backlog", live);
    if (capMsg) return fail(capMsg);
    if (input.addedByRunId !== null) {
      const written = await tx.backlogItem.count({ where: { projectId, addedByRunId: input.addedByRunId } });
      if (written >= SCOUT_ITEMS_PER_RUN) return fail("this run already added 3 items");
    }
    const keys = await tx.backlogItem.findMany({ where: { projectId }, select: { key: true } });
    const key = nextItemKey(keys.map((row) => row.key));
    const type = toItemType(input.type);
    await tx.backlogItem.create({ data: {
      ...input, title: input.title.trim(), projectId, key, type, typeSetBy: type === null ? null : input.addedBy,
    } });
    return { ok: true, item: { key } };
  });
}

async function updateBacklog(projectId: string, key: string, input: {
  title: string; area: string; source: string; type: string | null; typeBefore: string | null;
}): Promise<ServerResult<null>> {
  if (typeof key !== "string" || !key.trim()) return fail("Invalid backlog key.");
  if (!input.title.trim()) return fail("Title is required.");
  const type = toItemType(input.type);
  const typeBefore = toItemType(input.typeBefore);
  const changed = type !== typeBefore;
  const updated = await prisma.backlogItem.updateMany({
    where: { projectId, key, ...(changed ? { type: typeBefore } : {}) },
    data: { title: input.title.trim(), area: input.area, source: input.source,
      ...(changed ? { type, typeSetBy: type === null ? null : "owner" } : {}) },
  });
  if (updated.count === 0) {
    const exists = await prisma.backlogItem.findUnique({ where: { projectId_key: { projectId, key } }, select: { id: true } });
    return fail(exists ? "The item changed. Refresh and try again." : `${key} doesn't exist.`);
  }
  return { ok: true, item: null };
}

async function removeBacklog(projectId: string, key: string): Promise<ServerResult<null>> {
  if (typeof key !== "string" || !key.trim()) return fail("Invalid backlog key.");
  try {
    return await inProjectTransaction(projectId, async (tx) => {
      const open = await latestBoard(projectId, true, tx);
      if (open.some((row) => row.backlogItem.key === key)) {
        return fail(`${key} is open on the board. Finish or discard it before removing.`);
      }
      const removed = await tx.backlogItem.updateMany({ where: { projectId, key, removedAt: null },
        data: { removedAt: new Date(), removedReason: "owner" } });
      if (removed.count === 0) return fail(`${key} doesn't exist.`);
      return { ok: true, item: null };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return fail("The item changed. Refresh and try again.");
    }
    throw error;
  }
}

async function changePipeline(projectId: string, input: { key: string; pipelineId: string; userId: string; expectedUpdatedAt: Date }): Promise<ServerResult<null>> {
  return inProjectTransaction(projectId, async (tx) => {
    const owner = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerUserId: true } });
    if (owner.ownerUserId !== input.userId) throw new BoardRejection("pipeline change access denied");
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    if (row.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new BoardRejection("stale");
    if (row.status !== "proposed") throw new BoardRejection(PIPELINE_CHANGE_UNAVAILABLE);
    const run = await tx.pipelineRun.findUnique({ where: { boardItemId: row.id }, include: { version: true } });
    if (!run) throw new BoardRejection(PIPELINE_CHANGE_UNAVAILABLE);
    if (run.closedAt || run.version.format !== SLOT_FORMAT) throw new BoardRejection(PIPELINE_CHANGE_UNAVAILABLE);
    if (await tx.agentRun.findFirst({ where: { pipelineRunId: run.id }, select: { id: true } })) throw new BoardRejection(PIPELINE_CHANGE_UNAVAILABLE);
    const unrunnable = await runnableReason(tx, projectId, input.pipelineId);
    if (unrunnable !== null) throw new BoardRejection(unrunnable);
    const version = await ensureRunnableVersion(tx, projectId, input.pipelineId);
    if (version.id === run.version.id) return { ok: true as const, item: null };
    const claimed = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: input.expectedUpdatedAt, status: row.status, discardedAt: null },
      data: { updatedAt: nextTimestamp(row.updatedAt) },
    });
    if (claimed.count !== 1) throw new BoardRejection("stale");
    const graph: Graph = { nodes: version.nodes, gates: version.gates };
    await tx.pipelineRun.update({ where: { id: run.id }, data: {
      versionId: version.id, node: sequence(graph)[0], entryId: version.format === SLOT_FORMAT ? randomUUID() : null, enteredAt: new Date(), closedAt: null,
    } });
    await tx.transitionEvent.create({ data: {
      boardItemId: row.id, from: row.status, to: row.status, actor: "human", actorId: input.userId, channel: "web",
      note: `pipeline-changed:${run.version.id}:${version.id}`,
    } });
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: null };
  });
}

async function latestBoard(projectId: string, openOnly = false, db: Db = prisma) {
  const rows = await db.boardItem.findMany({
    where: { projectId, discardedAt: null },
    orderBy: { proposedOn: "desc" },
    distinct: ["backlogItemId"],
    include: { backlogItem: { select: { key: true, title: true, area: true, type: true } } },
  });
  return openOnly ? rows.filter((r) => isOpen(r.status)) : rows;
}

async function walkingKeys(projectId: string): Promise<string[]> {
  const runs = await prisma.pipelineRun.findMany({
    where: { closedAt: null, boardItem: { projectId, discardedAt: null } },
    select: { boardItem: { select: { status: true, backlogItem: { select: { key: true } } } } },
  });
  return runs.filter((r) => r.boardItem.status !== "on_hold").map((r) => r.boardItem.backlogItem.key);
}

async function latestBoardWithEvents(projectId: string) {
  return prisma.boardItem.findMany({
    where: { projectId, discardedAt: null },
    orderBy: { proposedOn: "desc" },
    distinct: ["backlogItemId"],
    include: {
      backlogItem: { select: { key: true, title: true, area: true, type: true } },
      events: { where: { note: null }, orderBy: { at: "desc" }, take: 8, select: { from: true, to: true, at: true, actor: true } },
      run: { select: { id: true, entryId: true, node: true, closedAt: true, version: { select: { format: true } } } },
    },
  });
}

async function latestRow(db: Db, projectId: string, key: string) {
  if (db !== prisma) await db.$queryRaw`SELECT p."id" FROM "PipelineRun" p JOIN "BoardItem" b ON b."id" = p."boardItemId" JOIN "BacklogItem" k ON k."id" = b."backlogItemId" WHERE b."projectId" = ${projectId} AND k."key" = ${key} AND b."discardedAt" IS NULL ORDER BY b."proposedOn" DESC LIMIT 1 FOR UPDATE OF p`;
  return db.boardItem.findFirst({
    where: { projectId, discardedAt: null, backlogItem: { key } },
    orderBy: { proposedOn: "desc" },
    include: { backlogItem: true, _count: { select: { reports: true } } },
  });
}

function latestRowFor(projectId: string, key: string) {
  return latestRow(prisma, projectId, key);
}

async function availableBacklogCount(projectId: string): Promise<number> {
  const [items, board] = await Promise.all([
    prisma.backlogItem.findMany({ where: { projectId, removedAt: null }, select: { id: true } }),
    latestBoard(projectId),
  ]);
  return countPickable(items.map((i) => i.id), board);
}

async function backlogWithStatus(projectId: string, includeRemoved: boolean) {
  const [items, board] = await Promise.all([
    prisma.backlogItem.findMany({ where: { projectId, ...(includeRemoved ? {} : { removedAt: null }) }, orderBy: { createdAt: "asc" } }),
    latestBoard(projectId),
  ]);
  const status = new Map(board.map((b) => [b.backlogItemId, b.status]));
  return items.map((i) => ({ ...i, status: status.get(i.id) ?? null }));
}

async function getWithHistory(projectId: string, key: string, since?: Date | null) {
  const at = since ? { gte: since } : undefined;
  return prisma.boardItem.findFirst({
    where: { projectId, discardedAt: null, backlogItem: { key } },
    orderBy: { proposedOn: "desc" },
    include: {
      backlogItem: true,
      events: { where: at && { at }, orderBy: { at: "asc" } },
      reports: { where: at && { at }, orderBy: { at: "asc" } },
      acceptanceFailures: { where: { clearedAt: null }, orderBy: { at: "desc" }, take: 1 },
    },
  });
}

  async function hasHistoryBefore(projectId: string, boardItemId: string, since: Date | null): Promise<boolean> {
    if (since === null) return false;
    const row = await prisma.boardItem.findFirst({
      where: { id: boardItemId, projectId, discardedAt: null, OR: [
        { events: { some: { at: { lt: since } } } }, { reports: { some: { at: { lt: since } } } },
      ] }, select: { id: true },
    });
    return row !== null;
  }

async function projectHistory(projectId: string, options: {
  view: HistoryView; since: Date | null; before: HistoryCursor | null; limit?: number; key?: string;
}): Promise<{ rows: HistoryRecord[]; next: HistoryCursor | null }> {
  const { view, since, before, limit = 50 } = options;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("History limit must be a positive safe integer.");
  const window = since === null ? {} : { at: { gte: since } };
  const boardItem = { projectId, ...(options.key === undefined ? {} : { backlogItem: { key: options.key } }) };
  const [events, reports] = await Promise.all([
    prisma.transitionEvent.findMany({
      where: { boardItem, AND: [eventWhere(view), window, afterCursor("event", before)] },
      orderBy: [{ at: "desc" }, { id: "desc" }], take: limit + 1,
      select: { id: true, at: true, boardItemId: true, actor: true, channel: true, from: true, to: true, note: true,
        boardItem: { select: { backlogItem: { select: { key: true } } } } },
    }),
    prisma.report.findMany({
      where: { boardItem, AND: [window, afterCursor("report", before)] },
      orderBy: [{ at: "desc" }, { id: "desc" }], take: limit + 1,
      select: { id: true, at: true, boardItemId: true, actor: true, path: true, commit: true, isAcceptance: true,
        boardItem: { select: { acceptedAt: true, backlogItem: { select: { key: true } } } } },
    }),
  ]);
  return mergeHistoryPage(
    events.map(({ boardItem, ...event }) => ({ ...event, source: "event", key: boardItem.backlogItem.key })),
    reports.map(({ boardItem, ...report }) => ({ ...report, source: "report", key: boardItem.backlogItem.key, acceptedAt: boardItem.acceptedAt })),
    limit,
  );
}

async function projectHistoryItems(projectId: string, options: HistoryItemsOptions) {
  const limit = options.limit ?? 50;
  const records = await prisma.$queryRaw<HistoryItemRecord[]>(historyItemsQuery(projectId, options));
  const rows = records.slice(0, limit);
  const last = rows.at(-1);
  return { rows, next: records.length > limit && last ? { at: last.at, id: last.id } : null };
}

async function hasProjectHistoryBefore(projectId: string, view: HistoryView, since: Date | null): Promise<boolean> {
  if (since === null) return false;
  const [event, report] = await Promise.all([
    prisma.transitionEvent.findFirst({
      where: { boardItem: { projectId }, at: { lt: since }, AND: [eventWhere(view)] }, select: { id: true },
    }),
    prisma.report.findFirst({ where: { boardItem: { projectId }, at: { lt: since } }, select: { id: true } }),
  ]);
  return event !== null || report !== null;
}

async function currentRoundIds(projectId: string, keys: readonly string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const rows = await prisma.boardItem.findMany({
    where: { projectId, discardedAt: null, backlogItem: { key: { in: [...new Set(keys)] } } },
    orderBy: { proposedOn: "desc" },
    select: { id: true, backlogItem: { select: { key: true } } },
  });
  const current = new Map<string, string>();
  for (const row of rows) if (!current.has(row.backlogItem.key)) current.set(row.backlogItem.key, row.id);
  return current;
}

async function propose(projectId: string, input: { key: string; agent: string; reason: string; pipelineId?: string }, by: Proposer) {
  return inProjectTransaction(projectId, async (tx) => {
    const backlog = await tx.backlogItem.findUnique({ where: { projectId_key: { projectId, key: input.key } } });
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const latest = await latestBoard(projectId, false, tx);
    const open = latest.filter((r) => isOpen(r.status));
    const mine = backlog ? latest.find((r) => r.backlogItemId === backlog.id) : undefined;
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: mine !== undefined && isOpen(mine.status),
      onHold: mine?.status === "on_hold",
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
    if (!d.ok || !backlog) return fail(d.ok ? "no such backlog item" : d.reason);
    await ensureDefaultPipeline(tx, projectId);
    const pipelineId = by.actor === "human" && input.pipelineId !== undefined
      ? input.pipelineId : await routedPipelineId(tx, projectId, backlog.type);
    const unrunnable = await runnableReason(tx, projectId, pipelineId);
    if (unrunnable !== null) return fail(unrunnable);
    const item = await tx.boardItem.create({
      data: { projectId, backlogItemId: backlog.id, agent: input.agent, status: "proposed", reason: input.reason,
        events: { create: { from: null, to: "proposed", actor: by.actor, actorId: by.actorRef, channel: by.actor === "human" ? by.channel : null } } },
    });
    await ensureRunIn(tx, projectId, item.id, "proposed", true, pipelineId);
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: item.id } }) };
  }, { isolationLevel: "Serializable" });
}

async function routedPipelineId(tx: Prisma.TransactionClient, projectId: string, type: string | null): Promise<string> {
  const defaultId = await ensureDefaultPipeline(tx, projectId);
  const rules = await tx.pipelineRule.findMany({ where: { projectId }, select: { type: true, pipelineId: true } });
  return routePipeline(type, Object.fromEntries(rules.map((r) => [r.type, r.pipelineId])), defaultId);
}

async function runnableReason(tx: Prisma.TransactionClient, projectId: string, pipelineId: string): Promise<string | null> {
  const pipeline = await tx.pipeline.findFirst({ where: { id: pipelineId, projectId, archivedAt: null },
    select: { versions: { select: { id: true }, take: 1 }, defaultOf: { where: { id: projectId }, select: { id: true } } } });
  if (pipeline === null) return PIPELINE_NOT_FOUND;
  return pipeline.versions.length > 0 || pipeline.defaultOf.length > 0 ? null : PIPELINE_CANNOT_RUN_ITEMS;
}

async function transitionIn(
  tx: Db, projectId: string, input: { key: string; to: string; result?: string }, caller: Caller, opts: { viaGate: boolean; gateEntry?: GateEntry } = { viaGate: false },
): Promise<ServerResult<BoardItem & { backlogItem?: BacklogItem }>> {
  const row = await latestRow(tx, projectId, input.key);
  if (!row) return fail(`no such board item: ${input.key}`);
  if (isNoopTransition(row.status, input.to, input.result)) return { ok: true as const, item: row };
  if (caller.actor === "pipeline" && input.to === "done") {
    const run = await ensureRunIn(tx, projectId, row.id, row.status, false);
    const walked = advance(run.version, run.node, await readFacts(tx, projectId, row, run));
    if (run.closedAt || caller.actorRef !== `pipeline:${run.version.id}` || input.result !== "Implementation span completed." || !walked.transitions.some((t: { to: string }) => t.to === "done")) return fail("implementation span is not complete");
  }
  const d = decideTransition(
    { status: row.status, planPath: row.planPath, reportCount: row._count.reports, results: row.results, validation: row.validation },
    caller.actor, input.to, input.result,
  );
  if (!d.ok) throw new BoardRejection(d.reason);
  if (d.value.kind === "gate" && !opts.viaGate) return fail(`gates open through board.gate, not a transition: ${row.status} → ${input.to}`);
  const expected = caller.actor === "human" ? caller.expectedUpdatedAt : row.updatedAt;
  const u = await tx.boardItem.updateMany({
    where: { id: row.id, updatedAt: expected, status: row.status, discardedAt: null },
    data: { updatedAt: nextTimestamp(row.updatedAt), status: d.value.status, results: d.value.results, validation: d.value.validation, acceptedAt: d.value.reopens ? null : undefined },
  });
  if (u.count === 0) throw new BoardRejection("stale");
  const transitionEvent = await tx.transitionEvent.create({ data: {
    boardItemId: row.id, from: row.status, to: d.value.status, actor: caller.actor, actorId: caller.actorRef,
    channel: caller.actor === "human" ? caller.channel : null,
  } });
  if (d.value.completes) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date(), removedReason: "done" } });
  if (d.value.reopens) {
    await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: null, removedReason: null } });
    await tx.acceptanceFailure.updateMany({ where: { boardItemId: row.id, clearedAt: null }, data: { clearedAt: transitionEvent.at } });
  }
  await closeRuns(tx, projectId, input.key, transitionEvent.at);
  if (caller.actor !== "pipeline") {
    if (["bounce", "hold", "resume", "reopen"].includes(d.value.kind)) await resetRun(tx, projectId, input.key, d.value.status);
    else await advanceRun(tx, projectId, input.key, opts.gateEntry);
  }
  return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
}

async function transition(
  projectId: string, input: { key: string; to: string; result?: string }, caller: Caller,
) {
  return inProjectTransaction(projectId, (tx) => transitionIn(tx, projectId, input, caller));
}

async function discard(projectId: string, input: { key: string; userId: string; expectedUpdatedAt: Date }) {
  return inProjectTransaction(projectId, async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideDiscard(row.status);
    if (!d.ok) throw new BoardRejection(d.reason);
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: input.expectedUpdatedAt, status: row.status, discardedAt: null },
      data: { discardedAt: new Date(), updatedAt: nextTimestamp(row.updatedAt) },
    });
    if (u.count === 0) throw new BoardRejection("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: null, actor: "human", actorId: input.userId, channel: "web", note: "discard" } });
    await closeRuns(tx, projectId, input.key);
    await closeRun(tx, row.id);
    if (row.status === "proposed") await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date(), removedReason: "discarded" } });
    return { ok: true as const, item: null };
  });
}

async function gate(
  projectId: string, input: { key: string; gate: string; planCommit?: string; gateEntry?: GateEntry }, caller: Extract<Caller, { actor: "human" }>,
): Promise<ServerResult<BoardItem>> {
  return inProjectTransaction(projectId, async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const run = await ensureRunIn(tx, projectId, row.id, row.status, false);
    const access = await readProjectAccessIn(tx, projectId);
    const owner = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerUserId: true } });
    if (!access.available || owner.ownerUserId !== caller.actorRef || (caller.channel === "session" && !allowsSessionApprovals(access.plan))) throw new BoardRejection("gate access denied");
    if (run.version.format !== null && (run.version.format !== SLOT_FORMAT || input.gateEntry?.runId !== run.id || input.gateEntry.entryId !== run.entryId)) throw new BoardRejection("stale gate entry; reread and approve again");
    const d = decideGate({
      gate: input.gate, cursor: run.closedAt ? null : run.node, status: row.status, validation: row.validation,
      planCommit: row.planCommit, claimedPlanCommit: input.planCommit, channel: caller.channel,
    });
    if (!d.ok) throw new BoardRejection(d.reason);
    if (d.value.boundary !== null) {
      const t = await transitionIn(tx, projectId, { key: input.key, to: d.value.boundary.to }, caller, { viaGate: true, gateEntry: input.gateEntry });
      if (!t.ok) throw new BoardRejection(t.reason);
    } else {
      const u = await tx.boardItem.updateMany({ where: { id: row.id, updatedAt: caller.expectedUpdatedAt, status: row.status, discardedAt: null }, data: { updatedAt: nextTimestamp(row.updatedAt) } });
      if (u.count === 0) throw new BoardRejection("stale");
      await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "human", actorId: caller.actorRef, channel: caller.channel, note: `gate:${input.gate}` } });
      await advanceRun(tx, projectId, input.key, input.gateEntry);
    }
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
  });
}

async function closeRuns(tx: Db, projectId: string, key: string, closedAt = new Date()) {
  const row = await tx.boardItem.findFirst({ where: { projectId, backlogItem: { key } }, orderBy: { proposedOn: "desc" }, select: { id: true } });
  const run = row ? await tx.pipelineRun.findUnique({ where: { boardItemId: row.id }, select: { id: true } }) : null;
  return tx.agentRun.updateMany({ where: { projectId, OR: [{ key }, ...(run ? [{ pipelineRunId: run.id }] : [])], closedAt: null }, data: { closedAt } });
}

async function recordValidation(projectId: string, input: { key: string; text: string }, actorRef: string) {
  return inProjectTransaction(projectId, async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const pipeline = await ensureRunIn(tx, projectId, row.id, row.status, false);
    const verifierBinding = pipeline.version.format === SLOT_FORMAT ? { pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId } : { pipelineRunId: null };
    const lastPlan = row.status === "in_review"
      ? await tx.transitionEvent.findFirst({ where: { boardItemId: row.id, note: "plan" }, orderBy: { at: "desc" }, select: { at: true } })
      : null;
    const verifierPassedAfterPlan =
      row.status === "in_review" &&
      (await tx.agentRunStep.findFirst({
        where: { OR: [{ accepted: true }, { accepted: null }], stepId: "verify", outcome: "ok", ...(lastPlan ? { at: { gt: lastPlan.at } } : {}), run: { projectId, agent: PLAN_VERIFIER, key: input.key, ...verifierBinding } },
        select: { id: true },
      })) !== null;
    const d = decideValidation({ status: row.status, text: input.text, verifierPassedAfterPlan });
    if (!d.ok) throw new BoardRejection(d.reason);
    await claim(tx, row, { validation: input.text });
    const item = await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "validation" } });
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item };
  });
}

async function submitPlan(projectId: string, input: { key: string; path: string; commit: string; type?: string }, actorRef: string) {
  return inProjectTransaction(projectId, async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decidePlanSubmit(row.status);
    if (!d.ok) throw new BoardRejection(d.reason);
    const type = toItemType(input.type);
    let typeKept: "owner" | undefined;
    if (type !== null) {
      const updated = await tx.backlogItem.updateMany({ where: { id: row.backlogItemId, AND: [
        { OR: [{ typeSetBy: null }, { typeSetBy: { not: "owner" } }] },
        { OR: [{ type: null }, { type: { not: type } }] },
      ] }, data: { type, typeSetBy: "dev" } });
      if (updated.count === 0) {
        const current = await tx.backlogItem.findUniqueOrThrow({ where: { id: row.backlogItemId } });
        if (current.typeSetBy === "owner" && current.type !== type) typeKept = "owner";
      }
    }
    await claim(tx, row, { planPath: input.path, planCommit: input.commit });
    const item = await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "plan" } });
    if (row.status === "planning") {
      const t = await transitionIn(tx, projectId, { key: input.key, to: "in_review" }, { actor: "agent", actorRef });
      if (!t.ok) throw new BoardRejection(t.reason);
      return { ok: true as const, item: { ...t.item, ...(typeKept ? { typeKept } : {}) } };
    }
    return { ok: true as const, item: { ...item, ...(typeKept ? { typeKept } : {}) } };
  });
}

async function submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string; runId?: string; qa?: unknown }, actorRef: string) {
  return inProjectTransaction(projectId, async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const hasVerifyStep =
      row.status === "implementing" &&
      (await tx.agentRunStep.findFirst({
        where: { OR: [{ accepted: true }, { accepted: null }], stepId: "verify", run: { projectId, agent: input.actor, key: input.key } },
        select: { id: true },
      })) !== null;
    const acceptanceFailed = row.status === "done" && input.actor === MAIN_LOOP
      && await tx.acceptanceFailure.findFirst({ where: { boardItemId: row.id, clearedAt: null }, select: { id: true } }) !== null;
    const d = decideReportSubmit({ status: row.status, actor: input.actor, roster, hasVerifyStep, acceptanceFailed });
    if (!d.ok) throw new BoardRejection(d.reason);
    const pipeline = await ensureRunIn(tx, projectId, row.id, row.status, false);
    if (d.value.accepts && !pipeline.closedAt && ["impl-verify", gateId("impl-verify")].includes(pipeline.node)) throw new BoardRejection(IMPL_VERIFY_PENDING);
    if (d.value.accepts && pipeline.version.nodes.includes("qa") && (pipeline.node !== "accept" || pipeline.closedAt)) throw new BoardRejection("QA has not completed; acceptance is only available at accept");
    if (d.value.accepts && pipeline.version.nodes.includes("impl-verify") && (pipeline.node !== "accept" || pipeline.closedAt)) throw new BoardRejection(IMPL_VERIFY_PENDING);
    if (input.actor !== "qa-verifier" && input.qa !== undefined) throw new BoardRejection("QA evidence belongs to qa-verifier");
    let qa: ReturnType<typeof parseQaReport> | undefined;
    if (input.actor === "qa-verifier") {
      try { qa = parseQaReport(input.qa); } catch (error) { throw new BoardRejection(error instanceof Error ? error.message : "Invalid QA report"); }
      if (!input.runId || input.path !== `docs/agents/qa-verifier/${input.key}.md`) throw new BoardRejection("QA report requires its bound AgentRun and report path");
      if (pipeline.version.format !== SLOT_FORMAT || pipeline.node !== "qa" || pipeline.closedAt || row.status !== "done") throw new BoardRejection("QA report requires the current qa entry");
      const target = await implementationReport(tx, row.id, row.agent, pipeline.id);
      if (!target || target.commit !== qa.targetCommit) throw new BoardRejection("QA target does not match the implementation report commit");
      const qaRun = await tx.agentRun.findFirst({ where: { id: input.runId, projectId, agent: "qa-verifier", key: input.key, pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId, closedAt: null }, include: { steps: { where: { accepted: true } } } });
      if (!qaRun || !(qa.verdict === "pass" ? qaRun.stepId === "report" && qaRun.steps.some(step => step.stepId === "verify" && step.outcome === "ok") : qaRun.stepId === `${qa.verdict === "fail" ? "failed" : "blocked"}-report`)) throw new BoardRejection("QA verdict does not match the current run's verification outcome");
    }
    if (input.actor === IMPL_VERIFIER) {
      if (!input.runId || input.path !== implVerifierReportPath(input.key)) throw new BoardRejection("Implementation verification report requires its bound AgentRun and report path");
      if (!/^[0-9a-f]{7,40}$/.test(input.commit)) throw new BoardRejection("Implementation verification report requires a commit SHA");
      if (pipeline.version.format !== SLOT_FORMAT || pipeline.node !== "impl-verify" || pipeline.closedAt || row.status !== "done") throw new BoardRejection("Implementation verification report requires the current impl-verify entry");
      if (!await implementationReport(tx, row.id, row.agent, pipeline.id)) throw new BoardRejection("Implementation verification needs a completed implementation report");
      const verifierRun = await tx.agentRun.findFirst({ where: { id: input.runId, projectId, agent: IMPL_VERIFIER, key: input.key, pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId, closedAt: null }, include: { steps: { where: { accepted: true } } } });
      if (!verifierRun || !(verifierRun.stepId === "report" ? verifierRun.steps.some(step => step.stepId === "verify" && step.outcome === "ok") : ["failed-report", "blocked-report"].includes(verifierRun.stepId))) throw new BoardRejection("Implementation verification report does not match the current run's outcome");
    }
    if (input.runId) {
      const agentRun = await tx.agentRun.findUnique({ where: { id: input.runId }, include: { pipelineRun: true } });
      if (!agentRun || agentRun.projectId !== projectId || agentRun.agent !== input.actor || agentRun.key !== input.key || agentRun.closedAt || (agentRun.pipelineRun && (agentRun.pipelineRun.boardItemId !== row.id || agentRun.pipelineRun.closedAt || agentRun.pipelineRun.entryId !== agentRun.pipelineEntryId))) throw new BoardRejection("stale report run");
    }
    await claim(tx, row, {});
    const report = await tx.report.create({ data: { boardItemId: row.id, actor: input.actor, path: input.path, commit: input.commit, agentRunId: input.runId, isAcceptance: d.value.accepts, ...(qa ? { qa } : {}) } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "report" } });
    if (d.value.accepts) {
      const claimed = await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } });
      await claim(tx, claimed, { acceptedAt: report.at });
    }
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: report };
  });
}

async function acceptanceState(tx: Prisma.TransactionClient, projectId: string, row: BoardItem) {
  const run = await ensureRunIn(tx, projectId, row.id, row.status, false);
  if (run.version.format !== null && (run.version.format !== SLOT_FORMAT || !run.entryId)) {
    throw new BoardRejection("Unsupported pipeline format or missing entry; update the compatible bundle.");
  }
  const failure = await tx.acceptanceFailure.findFirst({ where: { boardItemId: row.id, clearedAt: null }, select: { id: true } });
  return { status: row.status, cursor: run.closedAt ? null : run.node, accepted: row.acceptedAt !== null, failed: failure !== null };
}

async function failAcceptance(projectId: string,
  input: { key: string; checks: number[]; note: string; path?: string; commit?: string },
  actorRef: string,
): Promise<ServerResult<AcceptanceFailure>> {
  return inProjectTransaction(projectId, async tx => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const decision = decideAcceptanceFail({ ...input, ...await acceptanceState(tx, projectId, row) });
    if (!decision.ok) throw new BoardRejection(decision.reason);
    await claim(tx, row, {});
    const item = await tx.acceptanceFailure.create({ data: {
      boardItemId: row.id, checks: input.checks, note: input.note, path: input.path, commit: input.commit, actorId: actorRef,
    } });
    await tx.transitionEvent.create({ data: {
      boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, channel: null, note: "acceptance-failed",
    } });
    return { ok: true, item };
  });
}

async function retryAcceptance(projectId: string,
  input: { key: string; userId: string; expectedUpdatedAt: Date },
): Promise<ServerResult<null>> {
  return inProjectTransaction(projectId, async tx => {
    const owner = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerUserId: true } });
    if (owner.ownerUserId !== input.userId) throw new BoardRejection("acceptance retry access denied");
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const decision = decideAcceptanceRetry(await acceptanceState(tx, projectId, row));
    if (!decision.ok) throw new BoardRejection(decision.reason);
    const claimed = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: input.expectedUpdatedAt, status: row.status, discardedAt: null },
      data: { updatedAt: nextTimestamp(row.updatedAt) },
    });
    if (claimed.count !== 1) throw new BoardRejection("stale");
    const event = await tx.transitionEvent.create({ data: {
      boardItemId: row.id, from: row.status, to: row.status, actor: "human", actorId: input.userId, channel: "web", note: "acceptance-retry",
    } });
    await tx.acceptanceFailure.updateMany({ where: { boardItemId: row.id, clearedAt: null }, data: { clearedAt: event.at } });
    return { ok: true, item: null };
  });
}

async function advanceRun(tx: Db, projectId: string, key: string, approval?: GateEntry) {
  const row = await latestRow(tx, projectId, key);
  if (!row) return;
  const run = await ensureRunIn(tx, projectId, row.id, row.status, false);
  if (run.closedAt || row.status === "on_hold") return;
  const graph: Graph = { nodes: run.version.nodes, gates: run.version.gates };
  const facts = await readFacts(tx, projectId, row, run);
  if (approval && approval.runId === run.id && approval.entryId === run.entryId) facts.approvedGates = [run.node];
  const a = advance(graph, run.node, facts);
  for (const bd of a.transitions) {
    const t = await transitionIn(tx, projectId, { key, to: bd.to, ...(bd.to === "done" ? { result: "Implementation span completed." } : {}) }, { actor: "pipeline", actorRef: `pipeline:${run.version.id}` });
    if (!t.ok) throw new BoardRejection(t.reason);
  }
  if (a.cursor === run.node && a.entered.length === 0) return;
  const moved = await tx.pipelineRun.updateMany({
    where: { id: run.id, node: run.node, entryId: run.entryId, closedAt: null },
    data: { node: a.cursor ?? run.node, entryId: run.version.format === SLOT_FORMAT ? randomUUID() : null, enteredAt: new Date(), closedAt: a.cursor === null ? new Date() : undefined },
  });
  if (!moved.count) throw new BoardRejection("stale pipeline entry");
}

async function resetRun(tx: Db, projectId: string, key: string, status: string) {
  const row = await latestRow(tx, projectId, key);
  if (!row) return;
  const run = await ensureRunIn(tx, projectId, row.id, row.status, false);
  const graph: Graph = { nodes: run.version.nodes, gates: run.version.gates };
  const node = cursorForStatus(graph, status);
  await tx.pipelineRun.update({ where: { id: run.id }, data: { node: node ?? run.node, entryId: run.version.format === SLOT_FORMAT ? randomUUID() : null, enteredAt: new Date(), closedAt: null } });
}

function advancePipeline(projectId: string, key: string) {
  return inProjectTransaction(projectId, (tx) => advanceRun(tx, projectId, key));
}

function closeRun(tx: Db, boardItemId: string) {
  return tx.pipelineRun.updateMany({ where: { boardItemId, closedAt: null }, data: { closedAt: new Date() } });
}

return { addBacklog: reportFailure(addBacklog), updateBacklog: reportFailure(updateBacklog), removeBacklog: reportFailure(removeBacklog), transitionIn, advanceRun, resetRun, latestBoard, walkingKeys, latestBoardWithEvents, latestRowFor, availableBacklogCount, backlogWithStatus, getWithHistory, hasHistoryBefore, projectHistory, projectHistoryItems, hasProjectHistoryBefore, currentRoundIds, propose: reportFailure(propose), changePipeline: reportFailure(changePipeline), transition: reportFailure(transition), discard: reportFailure(discard), gate: reportFailure(gate), recordValidation: reportFailure(recordValidation), submitPlan: reportFailure(submitPlan), submitReport: reportFailure(submitReport), failAcceptance: reportFailure(failAcceptance), retryAcceptance: reportFailure(retryAcceptance), advancePipeline: reportFailure(advancePipeline) };
}

function isRejection(value: unknown): value is { ok: false; reason: string } {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === false && "reason" in value && typeof value.reason === "string";
}
function nextTimestamp(previous: Date): Date { return new Date(Math.max(Date.now(), previous.getTime() + 1)); }
async function claim(tx: Db, row: { id: string; status: string; updatedAt: Date }, data: Prisma.BoardItemUpdateManyMutationInput): Promise<void> {
  const result = await tx.boardItem.updateMany({
    where: { id: row.id, updatedAt: row.updatedAt, status: row.status, discardedAt: null },
    data: { ...data, updatedAt: nextTimestamp(row.updatedAt) },
  });
  if (result.count !== 1) throw new BoardRejection("stale");
}
