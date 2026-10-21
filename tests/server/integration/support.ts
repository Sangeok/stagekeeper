import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type PipelineVersion, type Prisma } from "../../../src/generated/prisma/client";
import { prisma as singleton } from "../../../src/server/db";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !decodeURIComponent(new URL(url).pathname).startsWith("/stagekeeper_test_")) {
    throw new Error("Run via test:server:integration");
  }
  return url;
}

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

export const cleanup = async (db: PrismaClient, userId: string | undefined) => {
  if (userId) await db.user.delete({ where: { id: userId } });
};

type PipelineFixtureInput = {
  projectId: string; version: number; nodes: string[]; gates: string[]; createdBy: string; format?: string | null;
};

export async function seedPipelineVersion(db: PrismaClient, input: PipelineFixtureInput): Promise<PipelineVersion> {
  return db.$transaction(async tx => {
    const pipelineId = `default_${input.projectId}`;
    await tx.pipeline.create({ data: {
      id: pipelineId, projectId: input.projectId, name: "Default", createdBy: input.createdBy,
      definitions: { create: { version: 1, steps: input.nodes.filter(node => node !== "propose"), gates: input.gates, createdBy: input.createdBy } },
    } });
    await tx.project.update({ where: { id: input.projectId }, data: { defaultPipelineId: pipelineId } });
    return tx.pipelineVersion.create({ data: { ...input, pipelineId } });
  });
}

export async function pipelineState(db: PrismaClient, projectId: string) {
  return {
    project: await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { defaultPipelineId: true, autoProposeEnabled: true } }),
    pipelines: await db.pipeline.findMany({ where: { projectId }, orderBy: { id: "asc" }, include: {
      definitions: { orderBy: { version: "asc" } }, versions: { orderBy: { version: "asc" } }, rules: { orderBy: { type: "asc" } },
    } }),
    board: await db.boardItem.findMany({ where: { projectId }, orderBy: { id: "asc" }, include: { run: true, events: { orderBy: { id: "asc" } } } }),
  };
}

export type Hook = () => Promise<void>;

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

export const afterWorkspaceRead = (db: PrismaClient, hook: Hook): PrismaClient =>
  db.$extends({ query: { workspace: { async findMany({ args, query }) {
    const rows = await query(args);
    await hook();
    return rows;
  } } } }) as unknown as PrismaClient;

export const beforeRunClaim = (db: PrismaClient, hook: Hook): PrismaClient =>
  db.$extends({ query: { agentRun: { async updateMany({ args, query }) {
    await hook();
    return query(args);
  } } } }) as unknown as PrismaClient;

export const failingEvent = (db: PrismaClient, message: string): PrismaClient =>
  db.$extends({ query: { transitionEvent: { create() { throw new Error(message); } } } }) as unknown as PrismaClient;

export const failingAudit = (db: PrismaClient, message: string): PrismaClient =>
  db.$extends({ query: { agentRunStep: { create() { throw new Error(message); } } } }) as unknown as PrismaClient;

export const afterProjectRead = (db: PrismaClient, hook: Hook): PrismaClient =>
  db.$extends({ query: { project: { async findUniqueOrThrow({ args, query }) {
    const row = await query(args);
    await hook();
    return row;
  } } } }) as unknown as PrismaClient;

export const afterBoardList = (db: PrismaClient, hook: Hook): PrismaClient =>
  db.$extends({ query: { boardItem: { async findMany({ args, query }) {
    const rows = await query(args);
    await hook();
    return rows;
  } } } }) as unknown as PrismaClient;

export const afterBacklogCount = (db: PrismaClient, hook: (where: Prisma.BacklogItemWhereInput | undefined) => Promise<void>): PrismaClient =>
  db.$extends({ query: { backlogItem: { async count({ args, query }) {
    const count = await query(args);
    await hook(args.where);
    return count;
  } } } }) as unknown as PrismaClient;

export function checkpoint() {
  let notify!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { notify = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  let first = true;
  return {
    hook: async () => { if (!first) return; first = false; notify(); await released; },
    entered: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([entered, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("query checkpoint did not arrive")), 8000); })]);
      } finally { clearTimeout(timer); }
    },
    release,
  };
}
