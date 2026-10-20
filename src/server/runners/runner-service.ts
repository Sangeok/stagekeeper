// 실행기 lease·상태·일시 정지. 판정은 packages/core/runner.mjs의 순수 함수이고, 여기는 잠금·저장·DB 시계를 맡는다.
// 모든 쓰기는 한 트랜잭션 안에서 User → Project 순서로 FOR UPDATE를 잡는다(pipeline/automatic-scout.ts와 같은 순서).
// 격리 수준은 기본(READ COMMITTED)이다: 잠금 뒤의 각 문장이 새 스냅숏을 봐야 앞선 실행기가 쓴 행을 본다.
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { limitsFor, RESIDENT_RUNNER_PLAN_GATE } from "@harness/core/entitlement.mjs";
import { BEAT_WRITE_INTERVAL_MS, holdsRunnerLease, needsAgentActivity } from "@harness/core/runner.mjs";
import { readDatabaseClockIn } from "@/server/database-clock";
import { lockProjectOwnerIn, READ_OPTIONS, readProjectAccessIn } from "@/server/projects/api";
import type { ServerResult } from "@/server/result";
import type { RunnerOp, RunnerOpResult, RunnerRecord, RunnerView } from "./contracts";

type Client = Pick<PrismaClient, "$transaction">;
type Tx = Prisma.TransactionClient;

const WRITE_OPTIONS = { maxWait: 5000, timeout: 15_000 } as const;
export const RUNNER_REPLACED_REASON = "Another runner took over this project. This one stops.";
export const PAUSE_CHOICE_REASON = "Choose whether the runner is paused.";
const NOT_FOUND = "Project not found.";

const utcMinute = (at: Date) => at.toISOString().slice(0, 16).replace("T", " ");
export function runnerBusyReason(holder: { host: string; seenAt: Date }): string {
  return `A runner is already running for this project on ${holder.host} (last signal ${utcMinute(holder.seenAt)} UTC). Stop it there, or take it over.`;
}

const RUNNER_SELECT = {
  session: true, mode: true, host: true, branch: true, permission: true, autostart: true, state: true,
  waitReason: true, lastResult: true, lastLog: true, stopReason: true, startedAt: true, seenAt: true,
} as const satisfies Prisma.RunnerSelect;
type RunnerRow = Prisma.RunnerGetPayload<{ select: typeof RUNNER_SELECT }>;

// 문자열 열의 값 목록은 마이그레이션의 CHECK가 지킨다(20261020000000_runner).
const toRecord = (row: RunnerRow): RunnerRecord => row as RunnerRecord;

// 프로젝트의 마지막 에이전트 활동. 1단계 세션이 일하는 동안의 생존 판정에만 쓴다(core runner.mjs).
// 플랜 변경의 사용 목록 판정(projects/availability-service.ts)과 같은 값이지만, 모든 탭이 부르는 자리라
// run과 step을 다 읽지 않고 두 집계로 읽는다.
async function readLastAgentActivityIn(tx: Tx, projectId: string): Promise<Date | null> {
  const run = await tx.agentRun.aggregate({ where: { projectId }, _max: { openedAt: true } });
  const step = await tx.agentRunStep.aggregate({ where: { run: { projectId } }, _max: { at: true } });
  const opened = run._max.openedAt, at = step._max.at;
  if (opened === null) return at;
  if (at === null) return opened;
  return at > opened ? at : opened;
}

// 소유자 → 프로젝트 순서로 잠근다. 잠근 뒤에 다시 읽은 값만 판정에 쓴다.
async function lockProjectIn(tx: Tx, projectId: string, userId?: string): Promise<{ runnerPausedAt: Date | null } | null> {
  const before = await tx.project.findUnique({ where: { id: projectId }, select: { ownerUserId: true } });
  if (!before || (userId !== undefined && before.ownerUserId !== userId)) return null;
  await lockProjectOwnerIn(tx, before.ownerUserId);
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { ownerUserId: true, runnerPausedAt: true } });
  return project?.ownerUserId === before.ownerUserId ? project : null;
}

const replaced = (): RunnerOpResult => ({ ok: false, status: 409, reason: RUNNER_REPLACED_REASON, code: "RUNNER_REPLACED" });

async function startIn(tx: Tx, projectId: string, tokenId: string, request: Extract<RunnerOp, { op: "start" }>, paused: boolean): Promise<RunnerOpResult> {
  const access = await readProjectAccessIn(tx, projectId);
  if (!access.available) return { ok: false, status: 403, reason: access.reason };
  if (request.mode === "resident" && !limitsFor(access.plan).residentRunner) {
    return { ok: false, status: 403, reason: RESIDENT_RUNNER_PLAN_GATE, code: "PLAN_REQUIRED" };
  }
  const now = await readDatabaseClockIn(tx);
  const row = await tx.runner.findUnique({ where: { projectId }, select: RUNNER_SELECT });
  // 응답을 잃은 CLI가 같은 세션으로 다시 보냈다. 자기 자신에게 BUSY를 주지 않는다.
  if (row && row.session === request.session) {
    await tx.runner.update({ where: { projectId }, data: { seenAt: now } });
    return { ok: true, body: { ok: true, paused } };
  }
  if (row && !request.takeover) {
    const record = toRecord(row);
    const lastActivity = needsAgentActivity(record) ? await readLastAgentActivityIn(tx, projectId) : null;
    if (holdsRunnerLease(record, lastActivity, now)) {
      return {
        ok: false, status: 409, code: "RUNNER_BUSY", reason: runnerBusyReason(record),
        holder: { mode: record.mode, host: record.host, seenAt: record.seenAt.toISOString() },
      };
    }
  }
  const resident = request.mode === "resident";
  const data = {
    session: request.session, tokenId, mode: request.mode, host: request.host,
    branch: resident ? request.branch : null, permission: resident ? request.permission : null, autostart: resident && request.autostart,
    state: "idle", waitReason: null, lastResult: null, lastLog: null, stopReason: null, startedAt: now, seenAt: now,
  };
  await tx.runner.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
  return { ok: true, body: { ok: true, paused } };
}

async function beatIn(tx: Tx, projectId: string, request: Extract<RunnerOp, { op: "beat" }>, paused: boolean): Promise<RunnerOpResult> {
  const access = await readProjectAccessIn(tx, projectId);
  if (!access.available) return { ok: false, status: 403, reason: access.reason };
  const now = await readDatabaseClockIn(tx);
  const row = await tx.runner.findUnique({ where: { projectId }, select: RUNNER_SELECT });
  // 행이 없거나(소유자 정지로 지워짐), 다른 세션이 덮어썼거나, 이미 정지해 lease를 놓은 경우다.
  if (!row || row.session !== request.session || row.state === "stopped") return replaced();
  const state = request.state ?? row.state;
  const next = {
    state,
    waitReason: state === "waiting" ? request.waitReason ?? row.waitReason : null,
    lastResult: request.lastResult ?? row.lastResult,
    lastLog: request.lastLog ?? row.lastLog,
  };
  const changed = next.state !== row.state || next.waitReason !== row.waitReason || next.lastResult !== row.lastResult || next.lastLog !== row.lastLog;
  if (changed || now.getTime() - row.seenAt.getTime() >= BEAT_WRITE_INTERVAL_MS) {
    await tx.runner.update({ where: { projectId }, data: { ...next, seenAt: now } });
  }
  // 플랜이 내려간 상주 실행기는 거절하지 않는다. 진행 중인 실행을 끝낸 뒤 스스로 멈추게 한다(결정 2).
  const stop = row.mode === "resident" && !limitsFor(access.plan).residentRunner;
  return { ok: true, body: { ok: true, paused, ...(stop ? { stop: "plan" as const } : {}) } };
}

async function stopIn(tx: Tx, projectId: string, request: Extract<RunnerOp, { op: "stop" }>): Promise<RunnerOpResult> {
  const row = await tx.runner.findUnique({ where: { projectId }, select: { session: true } });
  if (!row) return { ok: true, body: { ok: true } };
  if (row.session !== request.session) return replaced();
  if (request.reason === "owner") {
    await tx.runner.delete({ where: { projectId } });
    return { ok: true, body: { ok: true } };
  }
  const now = await readDatabaseClockIn(tx);
  await tx.runner.update({ where: { projectId }, data: { state: "stopped", stopReason: request.reason, waitReason: null, seenAt: now } });
  return { ok: true, body: { ok: true } };
}

export async function runRunnerOp(client: Client, input: { projectId: string; tokenId: string; request: RunnerOp }): Promise<RunnerOpResult> {
  return client.$transaction(async (tx) => {
    const project = await lockProjectIn(tx, input.projectId);
    if (!project) return { ok: false, status: 403, reason: NOT_FOUND };
    const paused = project.runnerPausedAt !== null;
    const { request } = input;
    if (request.op === "start") return startIn(tx, input.projectId, input.tokenId, request, paused);
    if (request.op === "beat") return beatIn(tx, input.projectId, request, paused);
    return stopIn(tx, input.projectId, request);
  }, WRITE_OPTIONS);
}

// 웹의 일시 정지 스위치. 새 실행만 막는다 — 진행 중인 실행은 실행기가 끝까지 둔다. 같은 값이면 쓰지 않는다.
export async function setRunnerPaused(client: Client, input: { projectId: string; userId: string; paused: boolean }): Promise<ServerResult<boolean>> {
  if (typeof input.paused !== "boolean") return { ok: false, reason: PAUSE_CHOICE_REASON };
  return client.$transaction(async (tx) => {
    const project = await lockProjectIn(tx, input.projectId, input.userId);
    if (!project) return { ok: false, reason: NOT_FOUND };
    const access = await readProjectAccessIn(tx, input.projectId);
    if (!access.available) return { ok: false, reason: access.reason };
    if (input.paused && project.runnerPausedAt === null) {
      await tx.project.update({ where: { id: input.projectId }, data: { runnerPausedAt: await readDatabaseClockIn(tx) } });
    } else if (!input.paused && project.runnerPausedAt !== null) {
      await tx.project.update({ where: { id: input.projectId }, data: { runnerPausedAt: null } });
    }
    return { ok: true, item: input.paused };
  }, WRITE_OPTIONS);
}

async function readViewIn(tx: Tx, project: { id: string; runnerPausedAt: Date | null; runner: RunnerRow | null }, renderedAt: Date): Promise<RunnerView> {
  const runner = project.runner ? toRecord(project.runner) : null;
  const lastActivity = runner && needsAgentActivity(runner) ? await readLastAgentActivityIn(tx, project.id) : null;
  return { runner, pausedAt: project.runnerPausedAt, lastActivity, renderedAt };
}

// 배너가 읽는 한 프로젝트의 실행기 사실. 잠그지 않는다.
export async function readRunnerState(client: Client, projectId: string): Promise<RunnerView> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, runnerPausedAt: true, runner: { select: RUNNER_SELECT } } });
    return readViewIn(tx, project, await readDatabaseClockIn(tx));
  }, READ_OPTIONS);
}

// 프로젝트 목록 카드가 읽는다. 목록의 프로젝트마다 한 번이 아니라 한 조회로 읽는다.
export async function readRunnerSummaries(client: Client, projectIds: readonly string[]): Promise<Map<string, RunnerView>> {
  if (projectIds.length === 0) return new Map();
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const projects = await tx.project.findMany({ where: { id: { in: [...projectIds] } }, select: { id: true, runnerPausedAt: true, runner: { select: RUNNER_SELECT } } });
    const renderedAt = await readDatabaseClockIn(tx);
    const views = new Map<string, RunnerView>();
    for (const project of projects) views.set(project.id, await readViewIn(tx, project, renderedAt));
    return views;
  }, READ_OPTIONS);
}
