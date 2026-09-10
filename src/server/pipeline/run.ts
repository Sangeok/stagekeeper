// src/server/pipeline/run.ts — 파이프라인 런의 저장과 사실 읽기. 판정은 packages/core/pipeline.mjs. board.ts를 import하지 않는다.
import "server-only";
import { BOUNDARY, NODE_AGENT, cursorForStatus, defaultGraph, isGateId, sequence } from "@harness/core/pipeline.mjs";
import { DISPATCH_WINDOW_DAYS, capError, dispatchCutoff } from "@harness/core/entitlement.mjs";
import { Prisma, type PrismaClient } from "@/generated/prisma/client"; // Prisma는 값 — P2002 검사에 쓴다(edit-backlog.server.ts와 같은 import)
import { planForProject } from "@/server/entitlement";
import { decideHead, decideNext, handoffIsLive, type HeadNext, type PipelineNext } from "./run-rules";

type Db = PrismaClient | Prisma.TransactionClient;
// 유니크 충돌 — 동시 생성의 진 쪽. create-project.server.ts·edit-backlog.server.ts의 같은 검사와 같은 모양.
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
export type Graph = { nodes: string[]; gates: string[] }; // core는 JS라 타입을 주지 않는다 — 여기가 서버 쪽 정의
export type RunRow = { id: string; node: string; enteredAt: Date; closedAt: Date | null; version: { id: string; version: number; nodes: string[]; gates: string[] } };
// advance()에 넣는 사실. 읽는 곳은 readFacts 하나(§C.2의 표).
export type Facts = { status: string; validation: string | null; accepted: boolean; approvedGates: string[]; closedAgents: string[] };

// 현재 버전 = 프로젝트의 최대 version. 없으면 기본 그래프를 version 1로 물질화한다. 두 호출자가 동시에 처음 만나면
// @@unique([projectId, version])가 한쪽을 P2002로 막는다 — 그쪽은 다시 읽는다(§C.8).
export async function currentVersion(db: Db, projectId: string) {
  const row = await db.pipelineVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
  if (row) return row;
  const graph = defaultGraph(await planForProject(projectId));
  try {
    return await db.pipelineVersion.create({ data: { projectId, version: 1, nodes: graph.nodes, gates: graph.gates, createdBy: "pipeline" } });
  } catch (e) {
    if (isUniqueViolation(e)) return db.pipelineVersion.findFirstOrThrow({ where: { projectId }, orderBy: { version: "desc" } });
    throw e;
  }
}

// 항목의 런. 없으면 만든다 — 새 항목(status proposed, 이벤트 1건)은 머리에서, 마이그레이션 전 항목은 상태가 말하는 자리에서.
// boardItemId @unique라 동시 생성은 한쪽만 이긴다 — 진 쪽은 다시 읽는다.
export async function ensureRun(db: Db, projectId: string, boardItemId: string, status: string, fresh: boolean): Promise<RunRow> {
  const found = await db.pipelineRun.findUnique({ where: { boardItemId }, include: { version: true } });
  if (found) return found;
  const version = await currentVersion(db, projectId);
  const graph: Graph = { nodes: version.nodes, gates: version.gates };
  const node = (fresh ? sequence(graph)[0] : cursorForStatus(graph, status)) ?? sequence(graph)[0];
  try {
    return await db.pipelineRun.create({ data: { boardItemId, versionId: version.id, node }, include: { version: true } });
  } catch (e) {
    if (isUniqueViolation(e)) return db.pipelineRun.findUniqueOrThrow({ where: { boardItemId }, include: { version: true } });
    throw e;
  }
}

// 사실 읽기와 답. 판정은 run-rules.ts가 하고 여기는 질의만 한다(§C.2의 표, §D.1의 판정 순서).

type RowFacts = { id: string; status: string; validation: string | null; acceptedAt: Date | null };
const NODE_AGENTS = ["doc-auditor", "feature-scout"];

export async function readFacts(db: Db, projectId: string, row: RowFacts, run: RunRow): Promise<Facts> {
  const events = await db.transitionEvent.findMany({
    where: { boardItemId: row.id, at: { gte: run.enteredAt } },
    select: { from: true, to: true, actor: true, note: true },
  });
  const approvedGates = events.flatMap((e) => {
    if (e.note?.startsWith("gate:")) return [e.note.slice("gate:".length)];
    if (e.actor !== "human") return [];
    const hit = Object.entries(BOUNDARY as Record<string, { from: string; to: string }>).find(([, b]) => b.from === e.from && b.to === e.to);
    return hit ? [hit[0]] : [];
  });
  const closed = await db.agentRun.findMany({
    where: { projectId, agent: { in: NODE_AGENTS }, key: null, openedAt: { gte: run.enteredAt }, closedAt: { not: null } },
    select: { agent: true },
  });
  return { status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, approvedGates, closedAgents: closed.map((r) => r.agent) };
}

async function recentRuns(db: Db, projectId: string, since: Date) {
  const owner = await db.projectMember.findFirst({ where: { projectId, role: "owner" }, select: { userId: true } });
  if (!owner) return 0;
  return db.agentRun.count({ where: { openedAt: { gte: since }, project: { members: { some: { userId: owner.userId, role: "owner" } } } } });
}

export async function nextFor(db: Db, projectId: string, key: string): Promise<PipelineNext> {
  const row = await db.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" } });
  if (!row) throw new Error(`no such board item: ${key}`); // 도구 층이 먼저 거른다(D.1 "key 있음: 그 항목의 PipelineNext")
  const run = await ensureRun(db, projectId, row.id, row.status, false);
  const node = run.closedAt ? null : run.node;
  // 열린 dev run의 마지막 원장 행 — turn-data.server.ts의 agentRun.findMany와 같은 판정을 서버가 따로 갖는다(§D.1)
  const open = node === null || isGateId(node) || node === "accept"
    ? null
    : await db.agentRun.findFirst({ where: { projectId, key, closedAt: null }, orderBy: { openedAt: "desc" }, include: { steps: { orderBy: { at: "desc" }, take: 1 } } });
  const last = open?.steps[0];
  const handoff = last?.outcome === "handoff" && handoffIsLive(last.at, row.updatedAt) ? { note: last.note } : null;
  const dispatches = node !== null && (node === "plan" || node === "implement" || (NODE_AGENT as Record<string, string | undefined>)[node] !== undefined);
  const capMsg = dispatches ? capError(await planForProject(projectId), "dispatches", await recentRuns(db, projectId, dispatchCutoff(new Date()))) : null;
  return decideNext({
    key, version: run.version.version, node, status: row.status, planCommit: row.planCommit, agent: row.agent, handoff,
    capReason: capMsg ? `${capMsg} — counted over the last ${DISPATCH_WINDOW_DAYS} days` : null,
  });
}

// key 없는 호출의 머리 — 미결 수는 deps.ts가 latestBoard로 세어 넘긴다(§D.1; run.ts는 board.ts를 import하지 않는다)
export async function headFor(db: Db, projectId: string, openCount: number, availableBacklog: number): Promise<HeadNext> {
  const version = await currentVersion(db, projectId);
  const capMsg = capError(await planForProject(projectId), "dispatches", await recentRuns(db, projectId, dispatchCutoff(new Date())));
  return decideHead({
    hasPropose: version.nodes.includes("propose"),
    openCount,
    availableBacklog,
    capReason: capMsg ? `${capMsg} — counted over the last ${DISPATCH_WINDOW_DAYS} days` : null,
  });
}
