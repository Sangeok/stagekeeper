import "server-only";
import { isOpen } from "@harness/core/transitions.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { decideDiscard, decidePlanSubmit, decidePropose, decideTransition, decideValidation, type Actor } from "./board-rules";

export type BoardResult<T> = { ok: true; item: T } | { ok: false; reason: string };
const fail = (reason: string): BoardResult<never> => ({ ok: false, reason });
type Db = PrismaClient | Prisma.TransactionClient;

// 항목별 최신 행 = backlogItemId마다 proposedOn 최대. 폐기 행은 없는 것으로 친다.
export async function latestBoard(projectId: string, openOnly = false, db: Db = prisma) {
  const rows = await db.boardItem.findMany({
    where: { projectId, discardedAt: null },
    orderBy: { proposedOn: "desc" },
    distinct: ["backlogItemId"],
    include: { backlogItem: { select: { key: true, title: true, area: true } } },
  });
  return openOnly ? rows.filter((r) => isOpen(r.status)) : rows;
}

async function latestRow(db: Db, projectId: string, key: string) {
  return db.boardItem.findFirst({
    where: { projectId, discardedAt: null, backlogItem: { key } },
    orderBy: { proposedOn: "desc" },
    include: { backlogItem: true, _count: { select: { reports: true } } },
  });
}

export async function backlogWithStatus(projectId: string, includeRemoved: boolean) {
  const [items, board] = await Promise.all([
    prisma.backlogItem.findMany({ where: { projectId, ...(includeRemoved ? {} : { removedAt: null }) }, orderBy: { createdAt: "asc" } }),
    latestBoard(projectId),
  ]);
  const status = new Map(board.map((b) => [b.backlogItemId, b.status]));
  return items.map((i) => ({ ...i, status: status.get(i.id) ?? null }));
}

export async function getWithHistory(projectId: string, key: string) {
  return prisma.boardItem.findFirst({
    where: { projectId, discardedAt: null, backlogItem: { key } },
    orderBy: { proposedOn: "desc" },
    include: { backlogItem: true, events: { orderBy: { at: "asc" } }, reports: { orderBy: { at: "asc" } } },
  });
}

// 미결 상한(2)은 "세고 나서 만든다" — READ COMMITTED에서는 두 호출자가 같은 수를 읽고 둘 다 만들 수 있다.
// 스펙이 이 상한을 서버 강제로 규정하므로(불변식·pm 규칙) 이 트랜잭션만 Serializable로 올린다.
// 충돌 시 Postgres가 40001로 실패시키고, 도구는 그 오류를 그대로 반환한다(에이전트는 다시 부르면 된다).
export async function propose(projectId: string, input: { key: string; agent: string; reason: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const backlog = await tx.backlogItem.findUnique({ where: { projectId_key: { projectId, key: input.key } } });
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const open = await latestBoard(projectId, true, tx);
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: !!backlog && open.some((r) => r.backlogItemId === backlog.id),
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
    if (!d.ok || !backlog) return fail(d.ok ? "no such backlog item" : d.reason);
    const item = await tx.boardItem.create({
      data: { projectId, backlogItemId: backlog.id, agent: input.agent, status: "승인대기", reason: input.reason,
        events: { create: { from: null, to: "승인대기", actor: "agent", actorId: actorRef } } },
    });
    return { ok: true as const, item };
  }, { isolationLevel: "Serializable" });
}

export async function transition(
  projectId: string, input: { key: string; to: string; result?: string; expectedUpdatedAt?: Date }, actor: Actor, actorRef: string,
) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideTransition(
      { status: row.status, planPath: row.planPath, reportCount: row._count.reports, results: row.results, validation: row.validation },
      actor, input.to, input.result,
    );
    if (!d.ok) return fail(d.reason);
    // 낙관적 잠금(ApcH sha 잠금의 대응물). 화면은 자기가 읽은 updatedAt을 보내고, 화면이 없는 호출자
    // (MCP 에이전트)는 이 트랜잭션에서 방금 읽은 row.updatedAt으로 CAS한다 — 가드를 비우면 두 에이전트가
    // 같은 행을 동시에 읽고 둘 다 전이해 이벤트가 둘, `결과:`가 두 번 누적된다.
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: input.expectedUpdatedAt ?? row.updatedAt },
      data: { status: d.value.status, results: d.value.results, validation: d.value.validation },
    });
    if (u.count === 0) return fail("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: d.value.status, actor, actorId: actorRef } });
    if (d.value.completes) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date() } });
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
  });
}

export async function discard(projectId: string, key: string, userId: string, expectedUpdatedAt?: Date) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, key);
    if (!row) return fail(`no such board item: ${key}`);
    const d = decideDiscard(row.status);
    if (!d.ok) return fail(d.reason);
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: expectedUpdatedAt ?? row.updatedAt },
      data: { discardedAt: new Date() },
    });
    if (u.count === 0) return fail("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: null, actor: "human", actorId: userId, note: "discard" } });
    return { ok: true as const, item: null };
  });
}

export async function recordValidation(projectId: string, input: { key: string; text: string }) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideValidation(row.status, input.text);
    if (!d.ok) return fail(d.reason);
    const item = await tx.boardItem.update({ where: { id: row.id }, data: { validation: input.text } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", note: "validation" } });
    return { ok: true as const, item };
  });
}

export async function submitPlan(projectId: string, input: { key: string; path: string; commit: string }) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decidePlanSubmit(row.status);
    if (!d.ok) return fail(d.reason);
    const item = await tx.boardItem.update({ where: { id: row.id }, data: { planPath: input.path, planCommit: input.commit } });
    return { ok: true as const, item };
  });
}

export async function submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string }) {
  const row = await latestRow(prisma, projectId, input.key);
  if (!row) return fail(`no such board item: ${input.key}`);
  const report = await prisma.report.create({ data: { boardItemId: row.id, actor: input.actor, path: input.path, commit: input.commit } });
  return { ok: true as const, item: report };
}
