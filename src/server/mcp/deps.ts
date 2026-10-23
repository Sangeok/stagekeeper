import { historyCutoff } from "@harness/core/plans/entitlement.mjs";
import "server-only";
import { recordTokenUsage } from "@/server/tokens/api.server";
import { consumeProjectRequestBudget } from "@/server/usage/api";
import { agentNext } from "@/server/agents/api";
import { createNextDeps } from "@/server/agents/api";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultDb } from "@/server/db";
import { readProjectAccess } from "@/server/projects/api";
import { createBoardService } from "@/server/pipeline/api";
import { RUNBOOK_STALE_NOTE, scoutNodePending } from "@/server/pipeline/api";
import { headFor, nextFor } from "@/server/pipeline/api";
import { runbookStale, resolveCodexBundle } from "@/server/templates/api";
import { checkCodexRunbook } from "@/server/templates/api";
import { codexHandoffView } from "@/server/pipeline/api";
import { findUserTokenByHash } from "@/server/tokens/api";
import { projectForUser } from "@/server/projects/api";
import { makeVerifyToken } from "./auth";
import { loadProjectView } from "@/server/projects/api";
import { syncProject } from "@/server/projects/api";
import { backlogView, backlogWithStatusView, boardWithBacklogView } from "./views";
import type { ToolDeps } from "./tools";

export function createToolDeps(prisma: PrismaClient): ToolDeps {
  const board = createBoardService(prisma);
  const prismaNextDeps = createNextDeps(prisma);
  return {
    requestLimit: (projectId) => consumeProjectRequestBudget(prisma, projectId),
    projectGet: (projectId) => loadProjectView((args) => prisma.project.findUniqueOrThrow(args), projectId),
    projectSync: (projectId, workspaces, language) => syncProject(prisma, { projectId, workspaces, language }),
    backlogAdd: (projectId, input) => board.addBacklog(projectId, { title: input.title, area: input.area, source: input.source,
      type: input.type, addedBy: "feature-scout", addedByRunId: input.runId }),
    backlogList: async (projectId, includeRemoved) => (await board.backlogWithStatus(projectId, includeRemoved)).map(backlogWithStatusView),
    backlogGet: async (projectId, key) => {
      const row = await prisma.backlogItem.findUnique({ where: { projectId_key: { projectId, key } } });
      return row === null ? null : backlogView(row);
    },
    boardList: (projectId, open) => board.latestBoard(projectId, open),
    boardGet: async (projectId, key) => {
      const row = await board.getWithHistory(projectId, key, historyCutoff((await readProjectAccess(prisma, projectId)).plan, new Date()));
      return row === null ? null : boardWithBacklogView(row);
    },
    propose: (projectId, input, actorRef) => board.propose(projectId, input, { actor: "agent", actorRef }),
    transition: async (projectId, input, actorRef) => {
      const result = await board.transition(projectId, input, { actor: "agent", actorRef });
      return result.ok && result.item.backlogItem !== undefined
        ? { ok: true, item: boardWithBacklogView({ ...result.item, backlogItem: result.item.backlogItem }) } : result;
    },
    submitPlan: (projectId, input, actorRef) => board.submitPlan(projectId, input, actorRef),
    submitReport: (projectId, input, actorRef) => board.submitReport(projectId, input, actorRef),
    failAcceptance: (projectId, input, actorRef) => board.failAcceptance(projectId, input, actorRef),
    recordValidation: (projectId, input, actorRef) => board.recordValidation(projectId, input, actorRef),
    agentNext: (projectId, tokenId, input) => agentNext(prismaNextDeps, { projectId, tokenId }, input),
    pipelineNext: async (projectId, key, runbook, client) => {
      let runtime;
      if (client === "codex") {
        const bundle = await resolveCodexBundle(projectId, prisma);
        if (!bundle.ok) return bundle;
        const error = checkCodexRunbook(bundle.item, runbook);
        if (error) return { ok: false, reason: error };
        runtime = bundle.item.runtime;
      }
      if (key !== undefined) {
        await board.advancePipeline(projectId, key);
        const next = await nextFor(prisma, projectId, key);
        const item = client === "codex" ? await codexHandoffView(prisma, projectId, next) : next;
        return { ok: true as const, item: { ...item, ...(runtime ? { runtime } : {}) } };
      }
      const openOnly = true;
      const open = await board.latestBoard(projectId, openOnly);
      const keys = [...new Set([...open.map((r) => r.backlogItem.key), ...(await board.walkingKeys(projectId))])];
      const items = [];
      for (const key of keys) {
        await board.advancePipeline(projectId, key);
        const next = await nextFor(prisma, projectId, key);
        items.push(client === "codex" ? await codexHandoffView(prisma, projectId, next) : next);
      }
      const head = await headFor(prisma, projectId, open.length, await board.availableBacklogCount(projectId), scoutNodePending(items));
      const stale = client === "codex" ? false : await runbookStale(projectId, prisma, runbook);
      return { ok: true as const, item: { head, items, ...(runtime ? { runtime } : {}), ...(stale ? { runbook: { stale: true as const, note: RUNBOOK_STALE_NOTE } } : {}) } };
    },
    access: (projectId) => readProjectAccess(prisma, projectId),
    projectFor: (slug, userId) => projectForUser(slug, userId, prisma),
  };
}
export const prismaToolDeps = createToolDeps(defaultDb);

export const verifyProjectToken = makeVerifyToken(
  (hash) => defaultDb.projectToken.findUnique({ where: { hash }, select: { id: true, projectId: true, revokedAt: true, expiresAt: true } }),
  (hash) => findUserTokenByHash(hash, defaultDb),
  recordTokenUsage,
);
