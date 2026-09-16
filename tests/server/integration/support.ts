// 통합 시험의 공통 바탕. 두 연결과 barrier로 읽기·쓰기 순서를 통제한다 — Promise.all만으로는 누가 이길지
// 정해지지 않아 "양방향 승패"와 "패자 부수효과 없음"을 시험할 수 없다. query 결과나 CAS count는 만들지 않는다:
// 실제 SQL을 그대로 실행하고 사이에 대기만 끼운다.
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { prisma as singleton } from "../../../src/server/db";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !decodeURIComponent(new URL(url).pathname).startsWith("/stagekeeper_test_")) {
    throw new Error("Run via test:server:integration");
  }
  return url;
}

// 경쟁 연결은 READ COMMITTED다(Prisma 기본). project_sync처럼 Serializable이 필요한 경계는 그 함수가 직접 건다.
// 기존 default 바인딩(@/server/db의 싱글턴)도 함께 끊는다 — route·owner-deps가 그 연결을 쓴다.
export function connections(count = 2) {
  const url = testDatabaseUrl();
  const all = Array.from({ length: count }, () => new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }));
  return {
    all,
    disconnect: () => Promise.all([...all.map((client) => client.$disconnect()), singleton.$disconnect()]).then(() => undefined),
  };
}

export type Fixture = {
  id: string; key: string; userId: string; projectId: string; backlogItemId: string; boardItemId: string; updatedAt: Date;
};

export type FixtureOptions = {
  status?: string; agent?: string; plan?: "pro" | "max";
  validation?: string; planPath?: string; planCommit?: string;
};

// updatedAt을 앞세워 만든다. nextTimestamp가 max(now, prev+1)이므로 이 상태에서는 언제나 prev+1이 되어
// "같은 ms 안의 연속 갱신"이 실제로 재현되고, @updatedAt의 현재 시각이 끼어들지 않음을 확인할 수 있다.
export async function fixture(db: PrismaClient, options: FixtureOptions = {}): Promise<Fixture> {
  const id = randomUUID();
  const agent = options.agent ?? "dev";
  const user = await db.user.create({ data: { login: id, githubId: -Math.floor(Math.random() * 2_000_000_000) } });
  if (options.plan) await db.subscription.create({ data: { userId: user.id, plan: options.plan } });
  const project = await db.project.create({ data: { slug: id, name: id, repoOwner: id, repo: id, branch: "main", ownerUserId: user.id } });
  await db.workspace.create({ data: { projectId: project.id, wsId: "app", path: ".", agent, verify: ["npm test"], readOnly: [] } });
  const backlog = await db.backlogItem.create({ data: { projectId: project.id, key: "K-1", title: id, area: "web", source: "test" } });
  const board = await db.boardItem.create({ data: {
    projectId: project.id, backlogItemId: backlog.id, agent, status: options.status ?? "in_review", reason: "test",
    updatedAt: new Date(Date.now() + 60_000),
    validation: options.validation ?? null, planPath: options.planPath ?? null, planCommit: options.planCommit ?? null,
  } });
  return { id, key: backlog.key, userId: user.id, projectId: project.id, backlogItemId: backlog.id, boardItemId: board.id, updatedAt: board.updatedAt };
}

// 이 시험이 만든 것만 지운다 — 사용자 한 행에서 프로젝트·항목·원장이 캐스케이드로 따라간다.
export const cleanup = async (db: PrismaClient, userId: string | undefined) => {
  if (userId) await db.user.delete({ where: { id: userId } });
};

export type Hook = () => Promise<void>;

// 승패를 고정한다: 둘 다 같은 행을 읽은 뒤에야 이긴 쪽이 CAS를 하고, 진 쪽은 이긴 쪽이 커밋을 끝낼 때까지 기다린다.
// finish()는 이긴 쪽 호출을 await한 다음에 부른다. 두 번째 이후의 읽기는 이미 열린 관문을 그대로 지난다.
export function ordered() {
  let arrived = 0;
  let bothRead!: () => void;
  const read = new Promise<void>((resolve) => { bothRead = resolve; });
  let winnerCommitted!: () => void;
  const committed = new Promise<void>((resolve) => { winnerCommitted = resolve; });
  const meet = async () => { if (++arrived === 2) bothRead(); await read; };
  return {
    winner: meet as Hook,
    loser: (async () => { await meet(); await committed; }) as Hook,
    finish: () => winnerCommitted(),
  };
}

// 모든 보드 writer는 latestRow(boardItem.findFirst)로 읽고 그 값으로 CAS한다 — 읽은 직후가 순서를 끼울 자리다.
export const afterBoardRead = (db: PrismaClient, hook: Hook): PrismaClient =>
  db.$extends({ query: { boardItem: { async findFirst({ args, query }) {
    const row = await query(args);
    await hook();
    return row;
  } } } }) as unknown as PrismaClient;

// project_sync는 저장 roster를 workspace.findMany로 읽고 그 뒤에 합집합을 쓴다 — Serializable 경계를 끼울 자리다.
export const afterWorkspaceRead = (db: PrismaClient, hook: Hook): PrismaClient =>
  db.$extends({ query: { workspace: { async findMany({ args, query }) {
    const rows = await query(args);
    await hook();
    return rows;
  } } } }) as unknown as PrismaClient;

// commitOutcome은 읽지 않고 곧장 agentRun.updateMany로 CAS한다 — 그 앞이 순서를 끼울 자리다.
export const beforeRunClaim = (db: PrismaClient, hook: Hook): PrismaClient =>
  db.$extends({ query: { agentRun: { async updateMany({ args, query }) {
    await hook();
    return query(args);
  } } } }) as unknown as PrismaClient;

export const failingEvent = (db: PrismaClient, message: string): PrismaClient =>
  db.$extends({ query: { transitionEvent: { create() { throw new Error(message); } } } }) as unknown as PrismaClient;

export const failingAudit = (db: PrismaClient, message: string): PrismaClient =>
  db.$extends({ query: { agentRunStep: { create() { throw new Error(message); } } } }) as unknown as PrismaClient;
