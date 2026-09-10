import "server-only";
import { advance, cursorForStatus } from "@harness/core/pipeline.mjs";
import { isOpen } from "@harness/core/transitions.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import type { ServerResult } from "@/server/result";
import { ensureRun, nextFor, readFacts, type Graph } from "./run";
import { PLAN_VERIFIER, decideDiscard, decidePlanSubmit, decidePropose, decideGate, decideReportSubmit, decideTransition, decideValidation } from "./board-rules";

export type { ServerResult } from "@/server/result";
const fail = (reason: string): ServerResult<never> => ({ ok: false, reason });
type Db = PrismaClient | Prisma.TransactionClient;

// 낙관적 잠금(CAS) 토큰을 누가 들고 있는지는 행위자에 달려 있다. 화면은 자기가 읽은
// updatedAt을 반드시 보내야 하고, 화면이 없는 MCP 에이전트는 이 트랜잭션에서 방금 읽은
// row.updatedAt으로 CAS한다. 예전에는 expectedUpdatedAt이 actor와 무관하게 optional이라,
// 사람 경로를 새로 만들면서 빼먹어도 컴파일이 통과하고 잠금만 조용히 꺼졌다.
// channel: 사람이 어디서 눌렀나. 규칙에는 영향이 없고 원장·화면 표시에만 쓴다. 웹 액션은 "web", 소유자 토큰 MCP는 "session".
export type Channel = "web" | "session";
export type Caller =
  | { actor: "human"; actorRef: string; channel: Channel; expectedUpdatedAt: Date }
  | { actor: "agent"; actorRef: string }
  // 그래프에 게이트가 없는 경계를 서버가 넘을 때. CAS는 agent처럼 방금 읽은 row.updatedAt. actorRef = "pipeline:<versionId>".
  | { actor: "pipeline"; actorRef: string };

// 누가 올렸나 — pm(agent 토큰) 또는 소유자(웹 "Put on the board"). 행·이벤트 모양은 같고 actor·channel만 다르다.
export type Proposer = { actor: "agent"; actorRef: string } | { actor: "human"; actorRef: string; channel: Channel };

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
// 파이프라인이 아직 걷고 있는 항목의 key. 미결(isOpen)과 다르다 — 인수까지 끝난 done 항목도 꼬리 노드
// (doc-audit·scout)를 남겨 두고 런이 열려 있다. 개요(pipeline_next({}))가 미결만 훑으면 그 꼬리는 영영 디스패치되지 않는다(실측).
// latestBoard는 board_list의 JSON이기도 해서 include를 더하지 않고 따로 읽는다(§E.3과 같은 이유).
export async function walkingKeys(projectId: string): Promise<string[]> {
  const runs = await prisma.pipelineRun.findMany({
    where: { closedAt: null, boardItem: { projectId, discardedAt: null } },
    select: { boardItem: { select: { status: true, backlogItem: { select: { key: true } } } } },
  });
  // on_hold는 커서가 잠든다 — 깨우지 않는다(배너와 같은 규칙).
  return runs.filter((r) => r.boardItem.status !== "on_hold").map((r) => r.boardItem.backlogItem.key);
}

export async function latestBoardWithEvents(projectId: string) {
  return prisma.boardItem.findMany({
    where: { projectId, discardedAt: null },
    orderBy: { proposedOn: "desc" },
    distinct: ["backlogItemId"],
    include: {
      backlogItem: { select: { key: true, title: true, area: true } },
      events: { where: { note: null }, orderBy: { at: "desc" }, take: 8, select: { from: true, to: true, at: true, actor: true } },
      run: { select: { node: true, closedAt: true } },
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

// 세션 채널이 CAS 토큰으로 쓸 updatedAt을 읽는다 — 지금 세션 게이트가 트랜잭션 밖에서 하던 일이고,
// owner-deps.ts가 board.gate를 부르기 직전에 쓴다(§D.2).
export function latestRowFor(projectId: string, key: string) {
  return latestRow(prisma, projectId, key);
}

export async function backlogWithStatus(projectId: string, includeRemoved: boolean) {
  const [items, board] = await Promise.all([
    prisma.backlogItem.findMany({ where: { projectId, ...(includeRemoved ? {} : { removedAt: null }) }, orderBy: { createdAt: "asc" } }),
    latestBoard(projectId),
  ]);
  const status = new Map(board.map((b) => [b.backlogItemId, b.status]));
  return items.map((i) => ({ ...i, status: status.get(i.id) ?? null }));
}

// since는 **조회 창**이다 — 저장은 언제나 전부 한다(historyCutoff의 계약). null/undefined면 창이 없다.
// 창을 넘기는 곳은 항목 화면과 board_get 둘뿐이다. **결재함(latestBoardWithEvents)은 창을 받지 않는다** —
// 게이트 판단이 검증 기록의 유무로 갈리는데 창에 가려지면 조용히 틀린 판단이 된다. 그래서 그쪽에는
// 인자 자체를 두지 않는다(넘기지 않는 규율보다 못 넘기는 형이 세다).
export async function getWithHistory(projectId: string, key: string, since?: Date | null) {
  const at = since ? { gte: since } : undefined;
  return prisma.boardItem.findFirst({
    where: { projectId, discardedAt: null, backlogItem: { key } },
    orderBy: { proposedOn: "desc" },
    include: {
      backlogItem: true,
      events: { where: at && { at }, orderBy: { at: "asc" } },
      reports: { where: at && { at }, orderBy: { at: "asc" } },
    },
  });
}

// 창 밖으로 밀려난 이력이 실제로 있는가 — 항목 화면의 "잘렸다" 한 줄은 이게 true일 때만 뜬다.
export async function hasHistoryBefore(projectId: string, key: string, since: Date): Promise<boolean> {
  const older = await prisma.transitionEvent.findFirst({
    where: { at: { lt: since }, boardItem: { projectId, discardedAt: null, backlogItem: { key } } },
    select: { id: true },
  });
  return older !== null;
}

// 미결 상한(2)은 "세고 나서 만든다" — READ COMMITTED에서는 두 호출자가 같은 수를 읽고 둘 다 만들 수 있다.
// 스펙이 이 상한을 서버 강제로 규정하므로(불변식·pm 규칙) 이 트랜잭션만 Serializable로 올린다.
// 충돌 시 Postgres가 40001로 실패시키고, 도구는 그 오류를 그대로 반환한다(에이전트는 다시 부르면 된다).
export async function propose(projectId: string, input: { key: string; agent: string; reason: string }, by: Proposer) {
  return prisma.$transaction(async (tx) => {
    const backlog = await tx.backlogItem.findUnique({ where: { projectId_key: { projectId, key: input.key } } });
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const openOnly = true;
    const open = await latestBoard(projectId, openOnly, tx);
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: !!backlog && open.some((r) => r.backlogItemId === backlog.id),
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
    if (!d.ok || !backlog) return fail(d.ok ? "no such backlog item" : d.reason);
    const item = await tx.boardItem.create({
      data: { projectId, backlogItemId: backlog.id, agent: input.agent, status: "proposed", reason: input.reason,
        events: { create: { from: null, to: "proposed", actor: by.actor, actorId: by.actorRef, channel: by.actor === "human" ? by.channel : null } } },
    });
    // 런은 항목과 같은 트랜잭션에서 머리에 선다. 게이트 없는 before-plan이면 여기서 바로 planning으로 넘는다.
    await ensureRun(tx, projectId, item.id, "proposed", true);
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: item.id } }) };
  }, { isolationLevel: "Serializable" });
}

export async function transitionIn(
  tx: Db, projectId: string, input: { key: string; to: string; result?: string }, caller: Caller, opts: { viaGate: boolean } = { viaGate: false },
) {
  const row = await latestRow(tx, projectId, input.key);
  if (!row) return fail(`no such board item: ${input.key}`);
  const d = decideTransition(
    { status: row.status, planPath: row.planPath, reportCount: row._count.reports, results: row.results, validation: row.validation },
    caller.actor, input.to, input.result,
  );
  if (!d.ok) return fail(d.reason);
  // 사람 게이트 행은 board.gate를 거쳐야 한다(런 커서·decideGate의 전제) — §C.7 viaGate
  if (d.value.kind === "gate" && !opts.viaGate) return fail(`gates open through board.gate, not a transition: ${row.status} → ${input.to}`);
  // 낙관적 잠금(ApcH sha 잠금의 대응물). 가드를 비우면 두 에이전트가 같은 행을 동시에 읽고
  // 둘 다 전이해 이벤트가 둘, `결과:`가 두 번 누적된다. 어느 값을 쓰는지는 Caller가 정한다.
  const expected = caller.actor === "human" ? caller.expectedUpdatedAt : row.updatedAt;
  const u = await tx.boardItem.updateMany({
    where: { id: row.id, updatedAt: expected },
    // reopen이면 인수 표시를 지운다 — 돌아간 항목은 다시 인수돼야 한다. 다른 전이는 이 열을 건드리지 않는다(undefined).
    data: { status: d.value.status, results: d.value.results, validation: d.value.validation, acceptedAt: d.value.reopens ? null : undefined },
  });
  if (u.count === 0) return fail("stale");
  // 채널은 사람 행에만 — 웹인지 세션인지. 에이전트 행은 null(이전 행과 같은 모양).
  await tx.transitionEvent.create({ data: {
    boardItemId: row.id, from: row.status, to: d.value.status, actor: caller.actor, actorId: caller.actorRef,
    channel: caller.actor === "human" ? caller.channel : null,
  } });
  if (d.value.completes) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date() } });
  // completes의 역 — 백로그로 되돌린다. 상한(backlog 축)은 세지 않는다: 추가가 아니라 복원이고, 자리는 done 직전까지 이 항목의 것이었다.
  if (d.value.reopens) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: null } });
  if (!isOpen(d.value.status)) await closeRuns(tx, projectId, input.key);
  // 파이프라인 커서 — 사람의 되돌리기·보류·재개·reopen은 자리를 다시 잡고, 나머지는 앞으로 간다. pipeline 자신의 전이는
  // advanceRun 안에서 왔으므로 재귀하지 않는다(caller.actor === "pipeline"이면 건너뛴다).
  if (caller.actor !== "pipeline") {
    if (["bounce", "hold", "resume", "reopen"].includes(d.value.kind)) await resetRun(tx, projectId, input.key, d.value.status);
    else await advanceRun(tx, projectId, input.key);
  }
  return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
}

export async function transition(
  projectId: string, input: { key: string; to: string; result?: string }, caller: Caller,
) {
  return prisma.$transaction((tx) => transitionIn(tx, projectId, input, caller));
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
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: null, actor: "human", actorId: input.userId, channel: "web", note: "discard" } });
    await closeRuns(tx, projectId, input.key);
    await closeRun(tx, row.id);
    return { ok: true as const, item: null };
  });
}

// 게이트 하나를 연다. 경계 게이트면 사람 전이(transition)가 원장이고, 아니면 같은 상태의 이벤트(note "gate:<id>")가 원장이다.
// 둘 다 뒤에 advanceRun — 다음 노드(대개 dispatch)로 커서가 간다. 응답의 next는 pipeline_next와 같은 모양(§D.1).
export async function gate(
  projectId: string, input: { key: string; gate: string; planCommit?: string }, caller: Extract<Caller, { actor: "human" }>,
) {
  const written = await prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const run = await ensureRun(tx, projectId, row.id, row.status, false);
    const d = decideGate({
      gate: input.gate, cursor: run.closedAt ? null : run.node, status: row.status, validation: row.validation,
      planCommit: row.planCommit, claimedPlanCommit: input.planCommit, channel: caller.channel,
    });
    if (!d.ok) return fail(d.reason);
    if (d.value.boundary !== null) {
      const t = await transitionIn(tx, projectId, { key: input.key, to: d.value.boundary.to }, caller, { viaGate: true }); // transition의 tx 판 — 같은 CAS·같은 이벤트. 게이트 행은 여기서만 지난다
      if (!t.ok) return t;
    } else {
      const u = await tx.boardItem.updateMany({ where: { id: row.id, updatedAt: caller.expectedUpdatedAt }, data: { updatedAt: new Date() } }); // CAS + 토큰 갱신을 명시한다(빈 data의 @updatedAt 자동 갱신에 기대지 않는다)
      if (u.count === 0) return fail("stale");
      await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "human", actorId: caller.actorRef, channel: caller.channel, note: `gate:${input.gate}` } });
      await advanceRun(tx, projectId, input.key);
    }
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
  });
  if (!written.ok) return written;
  // next는 **커밋 뒤에** 읽는다. 조언이지 쓰기의 일부가 아니라 원자성이 필요 없고, 트랜잭션 안에 두면
  // nextFor의 질의 예닐곱이 쓰기 뒤에 붙어 원격 DB에서 Prisma의 5초 대화형 트랜잭션 한도를 넘긴다
  // (실측 5450ms — 게이트가 통째로 롤백돼 소유자가 웹에서 게이트를 못 열었다).
  // 응답은 ServerResult<{ item, next }>다. next를 ok 가지에 나란히 얹으면 fail()의 ServerResult<never>와
  // 합쳐져 호출처가 r.next를 좁혀 읽지 못한다(tsc: "Property 'next' does not exist on type '{ ok: true; item: never; }'").
  return { ok: true as const, item: { item: written.item, next: await nextFor(prisma, projectId, input.key) } };
}

// 항목이 쉬거나(done·on_hold) 폐기되면 그 항목을 걷던 agent_next 커서(AgentRun)는 같은 트랜잭션에서 닫힌다.
// 남겨 두면 dev가 report·hold 뒤에 보내는 ok가 옛 커서를 계속 밀고, 되살아난 항목을 옛 단계에서 이어 걷는다.
function closeRuns(tx: Db, projectId: string, key: string) {
  return tx.agentRun.updateMany({ where: { projectId, key, closedAt: null }, data: { closedAt: new Date() } });
}

// 증거 제출 3종(validation·plan·report)은 전부 same-status 이벤트(note로 구분, actorId = 호출 토큰)를
// 원장에 남긴다 — 원장 = 감사 로그(불변식 8). 클린 사이클의 이벤트는 정확히 8건이 된다.
export async function recordValidation(projectId: string, input: { key: string; text: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    // 벽의 재료: 마지막 plan_submit 시각과, 그 뒤의 plan-verifier verify ok. 조회는 in_review일 때만 한다 — 다른 상태는 첫 검사가 거부한다.
    const lastPlan = row.status === "in_review"
      ? await tx.transitionEvent.findFirst({ where: { boardItemId: row.id, note: "plan" }, orderBy: { at: "desc" }, select: { at: true } })
      : null;
    const verifierPassedAfterPlan =
      row.status === "in_review" &&
      (await tx.agentRunStep.findFirst({
        where: { stepId: "verify", outcome: "ok", ...(lastPlan ? { at: { gt: lastPlan.at } } : {}), run: { projectId, agent: PLAN_VERIFIER, key: input.key } },
        select: { id: true },
      })) !== null;
    const d = decideValidation({ status: row.status, text: input.text, verifierPassedAfterPlan });
    if (!d.ok) return fail(d.reason);
    const item = await tx.boardItem.update({ where: { id: row.id }, data: { validation: input.text } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "validation" } });
    await advanceRun(tx, projectId, input.key);
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
    // 벽에 필요한 사실 둘. roster는 이름 검사에, verify 원장은 implementing의 선행 검사에 쓴다.
    // verify 조회는 status가 implementing일 때만 한다 — 나머지 상태에선 결과를 쓰지 않으므로 왕복을 아낀다.
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const hasVerifyStep =
      row.status === "implementing" &&
      (await tx.agentRunStep.findFirst({
        where: { stepId: "verify", run: { projectId, agent: input.actor, key: input.key } },
        select: { id: true },
      })) !== null;
    const d = decideReportSubmit({ status: row.status, actor: input.actor, roster, hasVerifyStep });
    if (!d.ok) return fail(d.reason);
    const report = await tx.report.create({ data: { boardItemId: row.id, actor: input.actor, path: input.path, commit: input.commit } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "report" } });
    // 인수 기록이면 항목에 표시한다 — 배너·항목 상세·journey가 이 열 하나로 "인수됐나"를 읽는다.
    if (d.value.accepts) await tx.boardItem.update({ where: { id: row.id }, data: { acceptedAt: report.at } });
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: report };
  });
}

// 파이프라인 커서를 옮기는 자리. 판정은 packages/core/pipeline.mjs의 advance·cursorForStatus이고
// 여기는 그 결과를 같은 트랜잭션 안에서 쓴다(§C.2·§C.3).
export async function advanceRun(tx: Db, projectId: string, key: string) {
  const row = await latestRow(tx, projectId, key);
  if (!row) return;
  const run = await ensureRun(tx, projectId, row.id, row.status, false);
  if (run.closedAt) return;
  const graph: Graph = { nodes: run.version.nodes, gates: run.version.gates };
  const facts = await readFacts(tx, projectId, row, run);
  const a = advance(graph, run.node, facts) as { cursor: string | null; entered: string[]; transitions: { from: string; to: string }[] };
  for (const bd of a.transitions) {
    const t = await transitionIn(tx, projectId, { key, to: bd.to }, { actor: "pipeline", actorRef: `pipeline:${run.version.id}` });
    if (!t.ok) return; // updatedAt CAS에 진 쪽 — 다음 호출이 다시 읽는다(§C.8)
  }
  if (a.cursor === run.node && a.entered.length === 0) return;
  await tx.pipelineRun.updateMany({
    where: { id: run.id, node: run.node },
    data: { node: a.cursor ?? run.node, enteredAt: new Date(), closedAt: a.cursor === null ? new Date() : undefined },
  });
}

export async function resetRun(tx: Db, projectId: string, key: string, status: string) {
  const row = await latestRow(tx, projectId, key);
  if (!row) return;
  const run = await ensureRun(tx, projectId, row.id, row.status, false);
  const graph: Graph = { nodes: run.version.nodes, gates: run.version.gates };
  const node = cursorForStatus(graph, status) as string | null;
  await tx.pipelineRun.update({ where: { id: run.id }, data: { node: node ?? run.node, enteredAt: new Date(), closedAt: null } });
}

export function advancePipeline(projectId: string, key: string) {
  return prisma.$transaction((tx) => advanceRun(tx, projectId, key));
}

function closeRun(tx: Db, boardItemId: string) {
  return tx.pipelineRun.updateMany({ where: { boardItemId, closedAt: null }, data: { closedAt: new Date() } });
}
