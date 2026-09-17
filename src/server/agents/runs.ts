// runs.ts — NextDeps의 Prisma 구현. 규칙은 next.ts, 저장은 여기. 항목이 쉬거나 폐기될 때 run을 닫는 쪽은
// board.ts(closeRuns)다 — 보드 트랜잭션 안에서 일어나야 하므로.
import "server-only";
import { prisma } from "@/server/db";
import type { PrismaClient } from "@/generated/prisma/client";
import { readProjectAccess } from "../project-access-query";
import { latestBoard } from "@/server/pipeline/board";
import type { NextDeps } from "./next";
import { repositoryOwner } from "../project-access-query";
import { serverVars } from "./vars";
import { cursorTransaction, commitRunOutcome } from "./run-query";

const TEMPLATE_FALLBACK_LANG = "en"; // 시드된 언어. Project.language(기본 "ko")에 템플릿이 없으면 여기로

export function createNextDeps(db: PrismaClient): NextDeps {
  const deps: NextDeps = {
    access: (projectId) => readProjectAccess(db, projectId),
    roster: async (projectId) =>
      (await db.workspace.findMany({ where: { projectId }, orderBy: { wsId: "asc" }, select: { agent: true } })).map((w) => w.agent),
    template: async (projectId, path) => {
      const { language } = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { language: true } });
      const find = (lang: string) => db.template.findUnique({ where: { lang_path: { lang, path } }, select: { body: true } });
      const row = (await find(language)) ?? (language === TEMPLATE_FALLBACK_LANG ? null : await find(TEMPLATE_FALLBACK_LANG));
      return row?.body ?? null;
    },
    vars: async (projectId, agent) => {
      const project = await db.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { repoOwner: true, repo: true, branch: true, name: true, workspaces: { orderBy: { wsId: "asc" } } },
      });
      return serverVars({ ...project, owner: repositoryOwner(project.repoOwner) }, project.workspaces, agent);
    },
    recentSteps: (tokenId, since) => db.agentRunStep.count({ where: { at: { gte: since }, OR: [{ callerTokenId: tokenId }, { callerTokenId: null, run: { tokenId } }] } }),
    recentRuns: async (projectId, since) => {
      const owner = await db.project.findUnique({ where: { id: projectId }, select: { ownerUserId: true } });
      if (!owner?.ownerUserId) return 0;
      return db.agentRun.count({ where: { openedAt: { gte: since }, project: { ownerUserId: owner.ownerUserId } } });
    },
    // 같은 (project, agent, key)에 열린 run이 둘일 수는 있다(부분 유니크 인덱스 없음) — 최신 것을 커서로 본다.
    openRun: (projectId, agent, key) => db.agentRun.findFirst({
      where: { projectId, agent, key, closedAt: null }, orderBy: { openedAt: "desc" }, select: { id: true, stepId: true, revision: true, closedAt: true },
    }),
    createRun: async () => { throw new Error("Run creation requires cursorTransaction"); },
    boardStatus: async (projectId, key) => {
      const row = await db.boardItem.findFirst({
        where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" }, select: { status: true },
      });
      return row?.status ?? null;
    },
    // 소유 검사용. boardStatus와 같은 행(폐기 안 된 최신 행)을 본다 — 두 판정이 다른 행을 보면 안 된다.
    itemAgent: async (projectId, key) => {
      const row = await db.boardItem.findFirst({
        where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" }, select: { agent: true },
      });
      return row?.agent ?? null;
    },
    openCount: async (projectId) => (await latestBoard(projectId, true, db)).length,
    verifyOk: async (projectId, agent, key) =>
      (await db.agentRunStep.findFirst({ where: { OR: [{ accepted: true }, { accepted: null }], stepId: "verify", outcome: "ok", run: { projectId, agent, key } }, select: { id: true } })) !== null,
    // 원장을 쓰기 전에 project/agent/key를 모두 확인한다. 존재 여부를 다른 스코프에 노출하지 않는다.
    runByReceipt: (projectId, agent, key, runId) => db.agentRun.findFirst({
      where: { id: runId, projectId, agent, key }, select: { id: true, stepId: true, revision: true, closedAt: true },
    }),
    closeRun: async (run) => {
      await db.agentRun.updateMany({ where: { id: run.id, revision: run.revision, stepId: run.stepId, closedAt: null }, data: { closedAt: new Date() } });
    },
    commitOutcome: (input) => db.$transaction((tx) => commitRunOutcome(tx, input)),
  };
  deps.withCursor = cursorTransaction(db, deps);
  return deps;
}

export const prismaNextDeps = createNextDeps(prisma);
