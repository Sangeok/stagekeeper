// src/server/pipeline/run.ts — 파이프라인 런의 저장과 사실 읽기. 판정은 packages/core/pipeline.mjs. board.ts를 import하지 않는다.
import { randomUUID } from "node:crypto";
import { BOUNDARY, SLOT_FORMAT, PROJECT_AGENTS, slotAgent, dispatcherFor, cursorForStatus, defaultGraph, isGateId, sequence } from "@harness/core/pipeline.mjs";
import { DISPATCH_WINDOW_DAYS, capError, dispatchCutoff } from "@harness/core/entitlement.mjs";
import { Prisma, type PrismaClient } from "@/generated/prisma/client"; // Prisma는 값 — P2002 검사에 쓴다(edit-backlog.server.ts와 같은 import)
import { readProjectPlanIn } from "@/server/project-access-query";
import { decideHead, decideNext, handoffIsLive, type HeadNext, type PipelineNext } from "./run-rules";

type Db = PrismaClient | Prisma.TransactionClient;
export type Graph = { nodes: string[]; gates: string[] }; // core는 JS라 타입을 주지 않는다 — 여기가 서버 쪽 정의
export type PipelineEntry = { runId: string; entryId: string; slotId: string };
export type GateEntry = { runId: string; entryId: string };
export type RunRow = { id: string; node: string; entryId: string | null; enteredAt: Date; closedAt: Date | null; version: { id: string; version: number; format: string | null; nodes: string[]; gates: string[] } };
// advance()에 넣는 사실. 읽는 곳은 readFacts 하나(§C.2의 표).
export type Facts = { status: string; validation: string | null; accepted: boolean; approvedGates: string[]; closedAgents: string[]; format: string | null; slotComplete: boolean; implementationComplete: boolean };

// 현재 버전 = 프로젝트의 최대 version. 없으면 기본 그래프를 version 1로 물질화한다. 두 호출자가 동시에 처음 만나면
// @@unique([projectId, version])가 한쪽을 P2002로 막는다 — 그쪽은 다시 읽는다(§C.8).
export async function ensureCurrentVersion(db: Db, projectId: string) {
  const row = await db.pipelineVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
  if (row) {
    if (row.format !== null && row.format !== SLOT_FORMAT) throw new Error("Unsupported pipeline format; update the compatible bundle.");
    return row;
  }
  const graph = defaultGraph(await readProjectPlanIn(db, projectId));
  // A caught unique violation leaves PostgreSQL's enclosing transaction aborted.
  // ON CONFLICT keeps the transaction usable for the losing materializer.
  await db.$executeRaw`INSERT INTO "PipelineVersion" ("id", "projectId", "version", "nodes", "gates", "createdBy", "format")
    VALUES (${randomUUID()}, ${projectId}, 1, ARRAY[${Prisma.join(graph.nodes)}]::text[], ARRAY[${Prisma.join(graph.gates)}]::text[], 'pipeline', ${SLOT_FORMAT})
    ON CONFLICT ("projectId", "version") DO NOTHING`;
  return db.pipelineVersion.findFirstOrThrow({ where: { projectId }, orderBy: { version: "desc" } });
}

export async function loadCurrentVersionView(db: Db, projectId: string): Promise<{ format: string | null; graph: Graph; persisted: { id: string; version: number; createdAt: Date } | null }> {
  const row = await db.pipelineVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
  if (row) return { format: row.format, graph: { nodes: row.nodes, gates: row.gates }, persisted: { id: row.id, version: row.version, createdAt: row.createdAt } };
  return { format: SLOT_FORMAT, graph: defaultGraph(await readProjectPlanIn(db, projectId)), persisted: null };
}

// 항목의 런. 없으면 만든다 — 새 항목(status proposed, 이벤트 1건)은 머리에서, 마이그레이션 전 항목은 상태가 말하는 자리에서.
// boardItemId @unique라 동시 생성은 한쪽만 이긴다 — 진 쪽은 다시 읽는다.
export async function ensureRun(db: Db, projectId: string, boardItemId: string, status: string, fresh: boolean): Promise<RunRow> {
  const found = await db.pipelineRun.findUnique({ where: { boardItemId }, include: { version: true } });
  if (found) return found;
  const version = await ensureCurrentVersion(db, projectId);
  const graph: Graph = { nodes: version.nodes, gates: version.gates };
  const node = (fresh ? sequence(graph)[0] : cursorForStatus(graph, status)) ?? sequence(graph)[0];
  await db.$executeRaw`INSERT INTO "PipelineRun" ("id", "boardItemId", "versionId", "node", "entryId")
    VALUES (${randomUUID()}, ${boardItemId}, ${version.id}, ${node}, ${version.format === SLOT_FORMAT ? randomUUID() : null})
    ON CONFLICT ("boardItemId") DO NOTHING`;
  return db.pipelineRun.findUniqueOrThrow({ where: { boardItemId }, include: { version: true } });
}

// 사실 읽기와 답. 판정은 run-rules.ts가 하고 여기는 질의만 한다(§C.2의 표, §D.1의 판정 순서).

type RowFacts = { id: string; status: string; validation: string | null; acceptedAt: Date | null; agent?: string; backlogItem?: { key: string } };
const NODE_AGENTS = ["doc-auditor", "feature-scout"];

export async function readFacts(db: Db, projectId: string, row: RowFacts, run: RunRow): Promise<Facts> {
  if (run.version.format !== null && run.version.format !== SLOT_FORMAT) throw new Error("Unsupported pipeline format; update the compatible bundle.");
  if (run.version.format === SLOT_FORMAT && !run.entryId) throw new Error("Missing pipeline entry; refresh pipeline_next.");
  const bound = run.version.format === SLOT_FORMAT;
  if (bound && run.node !== "implement") {
    const agent = slotAgent(run.node);
    const slotComplete = agent !== null && PROJECT_AGENTS.includes(agent)
      ? await db.agentRun.findFirst({ where: { projectId, agent, key: null, pipelineRunId: run.id, pipelineEntryId: run.entryId, closedAt: { not: null } }, select: { id: true } }) !== null
      : false;
    // Gate/plan/validation/accept facts are already on the locked BoardItem.
    return { status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, format: run.version.format, approvedGates: [], closedAgents: [], implementationComplete: false, slotComplete };
  }
  const completed = await db.agentRun.findMany({
    where: { projectId, closedAt: { not: null }, ...(bound
      ? { pipelineRunId: run.id, pipelineEntryId: run.entryId }
      : { pipelineRunId: null, openedAt: { gte: run.enteredAt } }) },
    include: { steps: { select: { stepId: true, outcome: true } }, reports: { where: { boardItemId: row.id } } },
  });
  const item = row.agent && row.backlogItem ? { agent: row.agent, backlogItem: row.backlogItem }
    : await db.boardItem.findUniqueOrThrow({ where: { id: row.id }, select: { agent: true, backlogItem: { select: { key: true } } } });
  const developer = completed.filter((r) => r.agent === item.agent && r.key === item.backlogItem.key);
  const successful = developer.filter((r) => r.stepId === "report" && r.steps.some((s) => s.stepId === "verify" && s.outcome === "ok") && r.steps.some((s) => s.stepId === "report" && s.outcome === "ok"));
  let implementationComplete = successful.some((r) => r.reports.some((report) => report.actor === item.agent));
  if (!bound && !implementationComplete && developer.length === 1 && successful.length === 1) {
    const candidate = successful[0];
    implementationComplete = await db.report.count({ where: { boardItemId: row.id, actor: item.agent, agentRunId: null, at: { gte: candidate.openedAt, lte: candidate.closedAt! } } }) > 0;
  }
  const completion = { format: run.version.format, implementationComplete, slotComplete: completed.some((r) => r.agent === dispatcherFor(run.node, item.agent)) };
  if (bound) return { ...completion, status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, approvedGates: [], closedAgents: [] };
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
  return { ...completion, status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, approvedGates, closedAgents: closed.map((r) => r.agent) };
}

async function recentRuns(db: Db, projectId: string, since: Date) {
  const owner = await db.project.findUnique({ where: { id: projectId }, select: { ownerUserId: true } });
  if (!owner?.ownerUserId) return 0;
  return db.agentRun.count({ where: { openedAt: { gte: since }, project: { ownerUserId: owner.ownerUserId } } });
}

export async function nextFor(db: Db, projectId: string, key: string): Promise<PipelineNext> {
  const row = await db.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" } });
  if (!row) throw new Error(`no such board item: ${key}`); // 도구 층이 먼저 거른다(D.1 "key 있음: 그 항목의 PipelineNext")
  const run = await ensureRun(db, projectId, row.id, row.status, false);
  if (run.version.format !== null && (run.version.format !== SLOT_FORMAT || !run.entryId)) throw new Error("Unsupported pipeline format or missing entry; update the compatible bundle.");
  const node = run.closedAt ? null : run.node;
  // 열린 dev run의 마지막 원장 행 — turn-data.server.ts의 agentRun.findMany와 같은 판정을 서버가 따로 갖는다(§D.1)
  const open = node === null || isGateId(node) || node === "accept"
    ? null
    : await db.agentRun.findFirst({ where: { projectId, agent: dispatcherFor(node, row.agent) ?? "", key: ["plan", "implement", "verify"].includes(node) ? key : null, closedAt: null,
      pipelineRunId: run.version.format === SLOT_FORMAT ? run.id : null, pipelineEntryId: run.version.format === SLOT_FORMAT ? run.entryId : null }, orderBy: { openedAt: "desc" }, include: { steps: { orderBy: { at: "desc" }, take: 1 } } });
  const last = open?.steps[0];
  const handoff = last?.outcome === "handoff" && handoffIsLive(last.at, row.updatedAt) ? { note: last.note } : null;
  const dispatches = node !== null && dispatcherFor(node, row.agent) !== null;
  const capMsg = dispatches ? capError(await readProjectPlanIn(db, projectId), "dispatches", await recentRuns(db, projectId, dispatchCutoff(new Date()))) : null;
  return decideNext({
    key, version: run.version.version, node, status: row.status, planCommit: row.planCommit, agent: row.agent, handoff, hasResumableRun: open !== null,
    format: run.version.format, entry: run.entryId ? { runId: run.id, entryId: run.entryId, slotId: run.node } : undefined,
    capReason: capMsg ? `${capMsg} — counted over the last ${DISPATCH_WINDOW_DAYS} days` : null,
  });
}

// key 없는 호출의 머리 — 미결 수는 deps.ts가 latestBoard로 세어 넘긴다(§D.1; run.ts는 board.ts를 import하지 않는다)
export async function headFor(db: Db, projectId: string, openCount: number, availableBacklog: number): Promise<HeadNext> {
  const version = await ensureCurrentVersion(db, projectId);
  const capMsg = capError(await readProjectPlanIn(db, projectId), "dispatches", await recentRuns(db, projectId, dispatchCutoff(new Date())));
  return decideHead({
    hasPropose: version.nodes.includes("propose"),
    openCount,
    availableBacklog,
    hasResumablePmRun: await db.agentRun.findFirst({ where: { projectId, agent: "pm", key: null, pipelineRunId: null, pipelineEntryId: null, closedAt: null }, select: { id: true } }) !== null,
    capReason: capMsg ? `${capMsg} — counted over the last ${DISPATCH_WINDOW_DAYS} days` : null,
  });
}
