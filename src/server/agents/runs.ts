// runs.ts — NextDeps의 Prisma 구현. 규칙은 next.ts, 저장은 여기. 항목이 쉬거나 폐기될 때 run을 닫는 쪽은
// board.ts(closeRuns)다 — 보드 트랜잭션 안에서 일어나야 하므로.
import "server-only";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { latestBoard } from "@/server/pipeline/board";
import type { NextDeps } from "./next";
import { serverVars } from "./vars";

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
      select: { owner: true, repo: true, branch: true, name: true, workspaces: { orderBy: { wsId: "asc" } } },
    });
    return serverVars(project, project.workspaces, agent);
  },
  recentSteps: (tokenId, since) => prisma.agentRunStep.count({ where: { at: { gte: since }, run: { tokenId } } }),
  // 같은 (project, agent, key)에 열린 run이 둘일 수는 있다(부분 유니크 인덱스 없음) — 최신 것을 커서로 본다.
  openRun: (projectId, agent, key) => prisma.agentRun.findFirst({
    where: { projectId, agent, key, closedAt: null }, orderBy: { openedAt: "desc" }, select: { id: true, stepId: true },
  }),
  createRun: ({ projectId, tokenId }, agent, key, stepId) =>
    prisma.agentRun.create({ data: { projectId, tokenId, agent, key, stepId }, select: { id: true, stepId: true } }),
  boardStatus: async (projectId, key) => {
    const row = await prisma.boardItem.findFirst({
      where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" }, select: { status: true },
    });
    return row?.status ?? null;
  },
  openCount: async (projectId) => (await latestBoard(projectId, true)).length,
  verifyOk: async (projectId, agent, key) =>
    (await prisma.agentRunStep.findFirst({ where: { stepId: "verify", outcome: "ok", run: { projectId, agent, key } }, select: { id: true } })) !== null,
  record: async (runId, step) => { await prisma.agentRunStep.create({ data: { runId, ...step } }); },
  advance: async (runId, from, to) => {
    const u = await prisma.agentRun.updateMany({
      where: { id: runId, stepId: from, closedAt: null },
      data: to === null ? { closedAt: new Date() } : { stepId: to },
    });
    return u.count > 0;
  },
  refused: async (runId) =>
    (await prisma.agentRun.update({ where: { id: runId }, data: { refused: { increment: 1 } }, select: { refused: true } })).refused,
};
