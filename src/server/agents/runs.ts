// runs.ts — NextDeps의 Prisma 구현. 규칙은 next.ts, 저장은 여기. 항목이 쉬거나 폐기될 때 run을 닫는 쪽은
// board.ts(closeRuns)다 — 보드 트랜잭션 안에서 일어나야 하므로.
import "server-only";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { latestBoard } from "@/server/pipeline/board";
import type { NextDeps } from "./next";
import { repositoryOwner } from "../project-access-query";
import { serverVars } from "./vars";
import { cursorTransaction } from "./run-query";

const cursorOnly = async (): Promise<never> => { throw new Error("Run writes require cursorTransaction"); };

const TEMPLATE_FALLBACK_LANG = "en"; // 시드된 언어. Project.language(기본 "ko")에 템플릿이 없으면 여기로

export const prismaNextDeps: NextDeps = {
  access: projectAccess,
  roster: async (projectId) =>
    (await prisma.workspace.findMany({ where: { projectId }, orderBy: { wsId: "asc" }, select: { agent: true } })).map((w) => w.agent),
  template: async (projectId, path) => {
    const { language } = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { language: true } });
    const find = (lang: string) => prisma.template.findUnique({ where: { lang_path: { lang, path } }, select: { body: true } });
    const row = (await find(language)) ?? (language === TEMPLATE_FALLBACK_LANG ? null : await find(TEMPLATE_FALLBACK_LANG));
    return row?.body ?? null;
  },
  vars: async (projectId, agent) => {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { repoOwner: true, repo: true, branch: true, name: true, workspaces: { orderBy: { wsId: "asc" } } },
    });
    return serverVars({ ...project, owner: repositoryOwner(project.repoOwner) }, project.workspaces, agent);
  },
  recentSteps: (tokenId, since) => prisma.agentRunStep.count({ where: { at: { gte: since }, run: { tokenId } } }),
  recentRuns: async (projectId, since) => {
    const owner = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerUserId: true } });
    if (!owner?.ownerUserId) return 0;
    return prisma.agentRun.count({ where: { openedAt: { gte: since }, project: { ownerUserId: owner.ownerUserId } } });
  },
  // 같은 (project, agent, key)에 열린 run이 둘일 수는 있다(부분 유니크 인덱스 없음) — 최신 것을 커서로 본다.
  openRun: (projectId, agent, key) => prisma.agentRun.findFirst({
    where: { projectId, agent, key, closedAt: null }, orderBy: { openedAt: "desc" }, select: { id: true, stepId: true },
  }),
  createRun: cursorOnly,
  boardStatus: async (projectId, key) => {
    const row = await prisma.boardItem.findFirst({
      where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" }, select: { status: true },
    });
    return row?.status ?? null;
  },
  // 소유 검사용. boardStatus와 같은 행(폐기 안 된 최신 행)을 본다 — 두 판정이 다른 행을 보면 안 된다.
  itemAgent: async (projectId, key) => {
    const row = await prisma.boardItem.findFirst({
      where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" }, select: { agent: true },
    });
    return row?.agent ?? null;
  },
  openCount: async (projectId) => (await latestBoard(projectId, true)).length,
  verifyOk: async (projectId, agent, key) =>
    (await prisma.agentRunStep.findFirst({ where: { stepId: "verify", outcome: "ok", run: { projectId, agent, key } }, select: { id: true } })) !== null,
  // 닫힌 run의 마지막 한 줄을 위해서만 읽는다 — 그 run이 선 단계에 이미 종료 outcome이 있으면 next.ts가 거른다.
  lastClosedRun: async (projectId, agent, key) => {
    const run = await prisma.agentRun.findFirst({
      where: { projectId, agent, key, closedAt: { not: null } },
      orderBy: { closedAt: "desc" },
      select: { id: true, stepId: true },
    });
    if (!run) return null;
    const steps = await prisma.agentRunStep.findMany({
      where: { runId: run.id, stepId: run.stepId }, select: { outcome: true },
    });
    return { ...run, stepOutcomes: steps.map((s) => s.outcome) };
  },
  record: cursorOnly,
  advance: cursorOnly,
  refused: cursorOnly,
};
prismaNextDeps.withCursor = cursorTransaction(prisma, prismaNextDeps);
