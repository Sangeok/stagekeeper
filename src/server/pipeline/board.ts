import "server-only";
import { isOpen } from "@harness/core/transitions.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { ServerResult } from "@/server/result";
import { decideDiscard, decidePlanSubmit, decidePropose, decideReportSubmit, decideTransition, decideValidation } from "./board-rules";

export type { ServerResult } from "@/server/result";
const fail = (reason: string): ServerResult<never> => ({ ok: false, reason });
type Db = PrismaClient | Prisma.TransactionClient;

// 낙관적 잠금(CAS) 토큰을 누가 들고 있는지는 행위자에 달려 있다. 화면은 자기가 읽은
// updatedAt을 반드시 보내야 하고, 화면이 없는 MCP 에이전트는 이 트랜잭션에서 방금 읽은
// row.updatedAt으로 CAS한다. 예전에는 expectedUpdatedAt이 actor와 무관하게 optional이라,
// 사람 경로를 새로 만들면서 빼먹어도 컴파일이 통과하고 잠금만 조용히 꺼졌다.
export type Caller =
  | { actor: "human"; actorRef: string; expectedUpdatedAt: Date }
  | { actor: "agent"; actorRef: string };

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

// 결재함용: 최신 행 + 최근 전이 몇 개. 상태 줄("dev submitted a plan 3 days ago")과 보류 전 상태("was Implementing")를
// 이벤트에서 읽는다 — BoardItem에는 "언제 이 status가 됐나"가 없다. note 있는 이벤트(validation·plan·report·discard)는
// 전이가 아니므로 제외한다 — 증거 제출이 쌓여도 진짜 전이가 take 창 밖으로 밀리지 않는다.
export async function latestBoardWithEvents(projectId: string) {
  return prisma.boardItem.findMany({
    where: { projectId, discardedAt: null },
    orderBy: { proposedOn: "desc" },
    distinct: ["backlogItemId"],
    include: {
      backlogItem: { select: { key: true, title: true, area: true } },
      events: { where: { note: null }, orderBy: { at: "desc" }, take: 8, select: { from: true, to: true, at: true } },
    },
  });
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
      data: { projectId, backlogItemId: backlog.id, agent: input.agent, status: "proposed", reason: input.reason,
        events: { create: { from: null, to: "proposed", actor: "agent", actorId: actorRef } } },
    });
    return { ok: true as const, item };
  }, { isolationLevel: "Serializable" });
}

export async function transition(
  projectId: string, input: { key: string; to: string; result?: string }, caller: Caller,
) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideTransition(
      { status: row.status, planPath: row.planPath, reportCount: row._count.reports, results: row.results, validation: row.validation },
      caller.actor, input.to, input.result,
    );
    if (!d.ok) return fail(d.reason);
    // 낙관적 잠금(ApcH sha 잠금의 대응물). 가드를 비우면 두 에이전트가 같은 행을 동시에 읽고
    // 둘 다 전이해 이벤트가 둘, `결과:`가 두 번 누적된다. 어느 값을 쓰는지는 Caller가 정한다.
    const expected = caller.actor === "human" ? caller.expectedUpdatedAt : row.updatedAt;
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: expected },
      data: { status: d.value.status, results: d.value.results, validation: d.value.validation },
    });
    if (u.count === 0) return fail("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: d.value.status, actor: caller.actor, actorId: caller.actorRef } });
    if (d.value.completes) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date() } });
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
  });
}

// 폐기는 사람 전용이다. key·userId처럼 인접한 string 인자를 나열하면 순서를 바꿔도 컴파일되고
// 런타임에야 엉뚱한 항목을 엉뚱한 행위자 이름으로 지운 것이 드러난다 — TransitionInput이 객체가
// 된 이유와 같다(inbox-item.ts). CAS 토큰도 사람 경로라 필수다.
export async function discard(projectId: string, input: { key: string; userId: string; expectedUpdatedAt: Date }) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideDiscard(row.status);
    if (!d.ok) return fail(d.reason);
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: input.expectedUpdatedAt },
      data: { discardedAt: new Date() },
    });
    if (u.count === 0) return fail("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: null, actor: "human", actorId: input.userId, note: "discard" } });
    return { ok: true as const, item: null };
  });
}

// 증거 제출 3종(validation·plan·report)은 전부 same-status 이벤트(note로 구분, actorId = 호출 토큰)를
// 원장에 남긴다 — 원장 = 감사 로그(불변식 8). 클린 사이클의 이벤트는 정확히 8건이 된다.
export async function recordValidation(projectId: string, input: { key: string; text: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideValidation(row.status, input.text);
    if (!d.ok) return fail(d.reason);
    const item = await tx.boardItem.update({ where: { id: row.id }, data: { validation: input.text } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "validation" } });
    return { ok: true as const, item };
  });
}

export async function submitPlan(projectId: string, input: { key: string; path: string; commit: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decidePlanSubmit(row.status);
    if (!d.ok) return fail(d.reason);
    const item = await tx.boardItem.update({ where: { id: row.id }, data: { planPath: input.path, planCommit: input.commit } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "plan" } });
    return { ok: true as const, item };
  });
}

export async function submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideReportSubmit(row.status);
    if (!d.ok) return fail(d.reason);
    const report = await tx.report.create({ data: { boardItemId: row.id, actor: input.actor, path: input.path, commit: input.commit } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "report" } });
    return { ok: true as const, item: report };
  });
}
