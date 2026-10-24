import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { limitsFor, RESIDENT_RUNNER_PLAN_GATE, CODEX_RESIDENT_RUNNER_PLAN_GATE } from "@harness/core/plans/entitlement.mjs";
import { BEAT_WRITE_INTERVAL_MS, holdsRunnerLease, needsAgentActivity } from "@harness/core/execution/runner.mjs";
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
  client: true, session: true, mode: true, host: true, branch: true, permission: true, autostart: true, state: true,
  waitReason: true, lastResult: true, lastLog: true, stopReason: true, startedAt: true, seenAt: true,
} as const satisfies Prisma.RunnerSelect;
type RunnerRow = Prisma.RunnerGetPayload<{ select: typeof RUNNER_SELECT }>;

const toRecord = (row: RunnerRow): RunnerRecord => row as RunnerRecord;

async function readLastAgentActivityIn(tx: Tx, projectId: string): Promise<Date | null> {
  const run = await tx.agentRun.aggregate({ where: { projectId }, _max: { openedAt: true } });
  const step = await tx.agentRunStep.aggregate({ where: { run: { projectId } }, _max: { at: true } });
  const opened = run._max.openedAt, at = step._max.at;
  if (opened === null) return at;
  if (at === null) return opened;
  return at > opened ? at : opened;
}

async function lockProjectIn(tx: Tx, projectId: string, userId?: string): Promise<{ runnerPausedAt: Date | null } | null> {
  const before = await tx.project.findUnique({ where: { id: projectId }, select: { ownerUserId: true } });
  if (!before || (userId !== undefined && before.ownerUserId !== userId)) return null;
  await lockProjectOwnerIn(tx, before.ownerUserId);
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { ownerUserId: true, runnerPausedAt: true } });
  return project?.ownerUserId === before.ownerUserId ? project : null;
}

const replaced = (): RunnerOpResult => ({ ok: false, status: 409, reason: RUNNER_REPLACED_REASON, code: "RUNNER_REPLACED" });
const codexBinding = (client: string, session: string) => client === "codex"
  ? { binding: { client: "codex" as const, session, mode: "resident" as const, permission: "scoped" as const } } : {};

async function startIn(tx: Tx, projectId: string, tokenId: string, request: Extract<RunnerOp, { op: "start" }>, paused: boolean): Promise<RunnerOpResult> {
  const client = request.client ?? "claude";
  const access = await readProjectAccessIn(tx, projectId);
  if (!access.available) return { ok: false, status: 403, reason: access.reason };
  if (request.mode === "resident" && !limitsFor(access.plan).residentRunner) {
    return { ok: false, status: 403, reason: client === "codex" ? CODEX_RESIDENT_RUNNER_PLAN_GATE : RESIDENT_RUNNER_PLAN_GATE, code: "PLAN_REQUIRED" };
  }
  const now = await readDatabaseClockIn(tx);
  const row = await tx.runner.findUnique({ where: { projectId }, select: RUNNER_SELECT });
  if (row && row.session === request.session) {
    if (row.client !== client || (client === "codex" && (row.state === "stopped" || row.mode !== request.mode
      || row.host !== request.host || row.branch !== request.branch || row.permission !== request.permission))) return replaced();
    await tx.runner.update({ where: { projectId }, data: { seenAt: now } });
    return { ok: true, body: { ok: true, paused, ...codexBinding(client, request.session) } };
  }
  if (row && !request.takeover) {
    const record = toRecord(row);
    const lastActivity = needsAgentActivity(record) ? await readLastAgentActivityIn(tx, projectId) : null;
    if (holdsRunnerLease(record, lastActivity, now)) {
      return {
        ok: false, status: 409, code: "RUNNER_BUSY", reason: runnerBusyReason(record),
        holder: { client: record.client, mode: record.mode, host: record.host, seenAt: record.seenAt.toISOString() },
      };
    }
  }
  const resident = request.mode === "resident";
  const data = {
    client, session: request.session, tokenId, mode: request.mode, host: request.host,
    branch: resident ? request.branch : null, permission: resident ? request.permission : null, autostart: resident && request.autostart,
    state: "idle", waitReason: null, lastResult: null, lastLog: null, stopReason: null, startedAt: now, seenAt: now,
  };
  await tx.runner.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
  return { ok: true, body: { ok: true, paused, ...codexBinding(client, request.session) } };
}

async function beatIn(tx: Tx, projectId: string, request: Extract<RunnerOp, { op: "beat" }>, paused: boolean): Promise<RunnerOpResult> {
  const access = await readProjectAccessIn(tx, projectId);
  if (!access.available) return { ok: false, status: 403, reason: access.reason };
  const now = await readDatabaseClockIn(tx);
  const row = await tx.runner.findUnique({ where: { projectId }, select: RUNNER_SELECT });
  if (!row || row.client !== (request.client ?? "claude") || row.session !== request.session || row.state === "stopped") return replaced();
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
  const stop = row.mode === "resident" && !limitsFor(access.plan).residentRunner;
  return { ok: true, body: { ok: true, paused, ...codexBinding(row.client, row.session), ...(stop ? { stop: "plan" as const } : {}) } };
}

async function stopIn(tx: Tx, projectId: string, request: Extract<RunnerOp, { op: "stop" }>): Promise<RunnerOpResult> {
  const row = await tx.runner.findUnique({ where: { projectId }, select: { client: true, session: true, mode: true, autostart: true } });
  if (!row) return { ok: true, body: { ok: true } };
  if (row.client !== (request.client ?? "claude") || row.session !== request.session) return replaced();
  if (request.reason === "owner" && !(row.mode === "resident" && row.autostart)) {
    await tx.runner.delete({ where: { projectId } });
    return { ok: true, body: { ok: true } };
  }
  const now = await readDatabaseClockIn(tx);
  await tx.runner.update({ where: { projectId }, data: { state: "stopped", stopReason: request.reason, waitReason: null, seenAt: now } });
  return { ok: true, body: { ok: true } };
}

async function autostartIn(tx: Tx, projectId: string, tokenId: string, request: Extract<RunnerOp, { op: "autostart" }>, paused: boolean): Promise<RunnerOpResult> {
  const access = await readProjectAccessIn(tx, projectId);
  if (!access.available) return { ok: false, status: 403, reason: access.reason };
  const row = await tx.runner.findUnique({ where: { projectId }, select: RUNNER_SELECT });
  if (row?.client === "codex") return { ok: true, body: { ok: true, paused } };
  const ours = row !== null && row.client === "claude" && row.mode === "resident" && row.host === request.host;
  if (request.state === "off") {
    if (!ours) return { ok: true, body: { ok: true, paused } };
    if (row.state === "stopped" && (row.stopReason === "owner" || row.stopReason === "signin")) await tx.runner.delete({ where: { projectId } });
    else if (row.autostart) await tx.runner.update({ where: { projectId }, data: { autostart: false } });
    return { ok: true, body: { ok: true, paused } };
  }
  if (!limitsFor(access.plan).residentRunner) return { ok: false, status: 403, reason: RESIDENT_RUNNER_PLAN_GATE, code: "PLAN_REQUIRED" };
  const now = await readDatabaseClockIn(tx);
  if (row) {
    const record = toRecord(row);
    const lastActivity = needsAgentActivity(record) ? await readLastAgentActivityIn(tx, projectId) : null;
    if (request.state === "on" || holdsRunnerLease(record, lastActivity, now)) {
      if (ours && !row.autostart) await tx.runner.update({ where: { projectId }, data: { autostart: true } });
      return { ok: true, body: { ok: true, paused } };
    }
  }
  const refused = request.state === "refused";
  const data = {
    client: "claude", session: request.session, tokenId, mode: "resident", host: request.host, branch: request.branch, permission: null, autostart: true,
    state: "stopped", waitReason: null, lastResult: refused ? request.code : null, lastLog: null, stopReason: refused ? "signin" : "owner",
    startedAt: now, seenAt: now,
  };
  await tx.runner.upsert({ where: { projectId }, create: { projectId, ...data }, update: data });
  return { ok: true, body: { ok: true, paused } };
}

export async function runRunnerOp(client: Client, input: { projectId: string; tokenId: string; request: RunnerOp }): Promise<RunnerOpResult> {
  return client.$transaction(async (tx) => {
    const project = await lockProjectIn(tx, input.projectId);
    if (!project) return { ok: false, status: 403, reason: NOT_FOUND };
    const paused = project.runnerPausedAt !== null;
    const { request } = input;
    if (request.op === "start") return startIn(tx, input.projectId, input.tokenId, request, paused);
    if (request.op === "beat") return beatIn(tx, input.projectId, request, paused);
    if (request.op === "autostart") return autostartIn(tx, input.projectId, input.tokenId, request, paused);
    return stopIn(tx, input.projectId, request);
  }, WRITE_OPTIONS);
}

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

export async function readRunnerState(client: Client, projectId: string): Promise<RunnerView> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, runnerPausedAt: true, runner: { select: RUNNER_SELECT } } });
    return readViewIn(tx, project, await readDatabaseClockIn(tx));
  }, READ_OPTIONS);
}

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
