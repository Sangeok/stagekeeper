import { runtimeEcho } from "@harness/core/execution/client-runtime.mjs";
import { TemplateInstallationRequired, TemplateExecutionRejection } from "@/server/pipeline/api";
import type { PipelineNext } from "@/server/pipeline/contracts";
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
import { RUNBOOK_STALE_NOTE } from "@/server/pipeline/api";
import { assignmentContext } from "@/server/pipeline/api";
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
      type: input.type, addedBy: "work-discoverer", addedByRunId: input.runId }),
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
    assignmentContext: (projectId, runId) => assignmentContext(prisma, projectId, runId),
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
    pipelineNext: async (projectId, key, runbook, client, installation) => {
      try {
      const mode = (await prisma.templateChannel.findUniqueOrThrow({ where: { id: "default" } })).mode;
      const versioned = mode === "versioned";
      if (mode !== "legacy" && !versioned) return { ok: false, reason: "Unsupported template channel mode" };
      if (versioned && !installation) return { ok: false, reason: "Template installation metadata required; update the plugin and run init" };
      if (!versioned && installation) return { ok: false, reason: "Template release protocol is not active" };
      const context = { client, installation, requireInstallation: true };
      const executionBoard = createBoardService(prisma, context);
      let runtime = client === "codex" && versioned ? runtimeEcho() : undefined;
      if (client === "codex" && !versioned) {
        const bundle = await resolveCodexBundle(projectId, prisma);
        if (!bundle.ok) return bundle;
        const error = checkCodexRunbook(bundle.item, runbook);
        if (error) return { ok: false, reason: error };
        runtime = bundle.item.runtime;
      }
      const itemNext = async (itemKey: string): Promise<PipelineNext> => {
        try {
          const advanced = await executionBoard.advancePipeline(projectId, itemKey);
          if (advanced && !advanced.ok) throw new TemplateExecutionRejection(advanced.reason);
          const next = await nextFor(prisma, projectId, itemKey, context);
          return client === "codex" ? await codexHandoffView(prisma, projectId, next) : next;
        } catch (error) {
          if (!(error instanceof TemplateInstallationRequired)) throw error;
          const current = await prisma.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key: itemKey } }, orderBy: { proposedOn: "desc" }, select: { run: { select: { node: true, version: { select: { version: true } } } } } });
          return { key: itemKey, node: current?.run?.node ?? null, version: current?.run?.version.version ?? null,
            action: "wait", on: "template", reason: error.message, templateRelease: error.templateRelease, templateProtocol: "template-release-v1" };
        }
      };
      if (key !== undefined) return { ok: true, item: { ...await itemNext(key), ...(versioned ? { templateProtocol: "template-release-v1" } : {}), ...(runtime ? { runtime } : {}) } };
      const openOnly = true;
      const open = await board.latestBoard(projectId, openOnly);
      const keys = [...new Set([...open.map((r) => r.backlogItem.key), ...(await board.walkingKeys(projectId))])];
      const items = [];
      for (const key of keys) {
        items.push(await itemNext(key));
      }
      const head = await headFor(prisma, projectId, context);
      const stale = versioned || client === "codex" ? false : await runbookStale(projectId, prisma, runbook);
      return { ok: true as const, item: { head, items, ...(versioned ? { templateProtocol: "template-release-v1" } : {}), ...(runtime ? { runtime } : {}), ...(stale ? { runbook: { stale: true as const, note: RUNBOOK_STALE_NOTE } } : {}) } };
      } catch (error) {
        if (error instanceof TemplateExecutionRejection) return { ok: false, reason: error.message };
        throw error;
      }
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
