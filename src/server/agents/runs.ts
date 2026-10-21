import type { PrismaClient } from "@/generated/prisma/client";
import { readProjectAccess } from "@/server/projects/api";
import { createBoardService } from "@/server/pipeline/api";
import type { NextDeps } from "./next";
import { repositoryOwner } from "@/server/projects/api";
import { loadProjectRoster } from "@/server/projects/api";
import { serverVars } from "./vars";
import { cursorTransaction, commitRunOutcome } from "./run-service";
import { readProjectUsageCapIn } from "@/server/usage/api";
import { resolveCodexBundle } from "@/server/templates/api";

const TEMPLATE_FALLBACK_LANG = "en";

export function createNextDeps(db: PrismaClient): NextDeps {
  const board = createBoardService(db);
  const deps: NextDeps = {
    access: (projectId) => readProjectAccess(db, projectId),
    roster: (projectId) => loadProjectRoster(db, projectId),
    template: async (projectId, path, client) => {
      if (client === "codex") {
        const bundle = await resolveCodexBundle(projectId, db);
        if (!bundle.ok) throw new Error(bundle.reason);
        return bundle.item.templates[path] ?? null;
      }
      const { language } = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { language: true } });
      const find = (lang: string) => db.template.findUnique({ where: { lang_path: { lang, path } }, select: { body: true } });
      const row = (await find(language)) ?? (language === TEMPLATE_FALLBACK_LANG ? null : await find(TEMPLATE_FALLBACK_LANG));
      return row?.body ?? null;
    },
    vars: async (projectId, agent, client) => {
      const project = await db.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { repoOwner: true, repo: true, branch: true, name: true, workspaces: { orderBy: { wsId: "asc" } } },
      });
      return serverVars({ ...project, owner: repositoryOwner(project.repoOwner) }, project.workspaces, agent, client);
    },
    usageCap: (projectId) => db.$transaction((tx) => readProjectUsageCapIn(tx, projectId)),
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
    itemAgent: async (projectId, key) => {
      const row = await db.boardItem.findFirst({
        where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" }, select: { agent: true },
      });
      return row?.agent ?? null;
    },
    openCount: async (projectId) => (await board.latestBoard(projectId, true)).length,
    verifyOk: async (projectId, agent, key) =>
      (await db.agentRunStep.findFirst({ where: { OR: [{ accepted: true }, { accepted: null }], stepId: "verify", outcome: "ok", run: { projectId, agent, key } }, select: { id: true } })) !== null,
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
