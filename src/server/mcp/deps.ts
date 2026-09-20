// deps.ts — ToolDeps의 Prisma 구현 + 토큰 검증 바인딩. 도구 본문은 tools.ts, 저장 규칙은 pipeline/board.ts.
import { historyCutoff } from "@harness/core/entitlement.mjs";
import "server-only";
import { agentNext } from "@/server/agents/next";
import { createNextDeps } from "@/server/agents/runs";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma as defaultDb } from "@/server/db";
import { readProjectAccess } from "@/server/project-access-query";
import { createBoardService } from "@/server/pipeline/board";
import { RUNBOOK_STALE_NOTE } from "@/server/pipeline/run-rules";
import { headFor, nextFor } from "@/server/pipeline/run";
import { runbookStale } from "@/server/runbook";
import { findUserTokenByHash, projectForUser } from "@/server/user-scope-query";
import { makeVerifyToken } from "./auth";
import { loadProjectView } from "./project-query";
import { syncProject } from "./project-sync-query";
import { backlogView, backlogWithStatusView } from "./views";
import type { ToolDeps } from "./tools";

export function createToolDeps(prisma: PrismaClient): ToolDeps {
  const board = createBoardService(prisma);
  const prismaNextDeps = createNextDeps(prisma);
  return {
    projectGet: (projectId) => loadProjectView((args) => prisma.project.findUniqueOrThrow(args), projectId),
    projectSync: (projectId, workspaces, language) => syncProject(prisma, { projectId, workspaces, language }),
    backlogList: async (projectId, includeRemoved) => (await board.backlogWithStatus(projectId, includeRemoved)).map(backlogWithStatusView),
    backlogGet: async (projectId, key) => {
      const row = await prisma.backlogItem.findUnique({ where: { projectId_key: { projectId, key } } });
      return row === null ? null : backlogView(row);
    },
    boardList: (projectId, open) => board.latestBoard(projectId, open),
    boardGet: async (projectId, key) =>
      board.getWithHistory(projectId, key, historyCutoff((await readProjectAccess(prisma, projectId)).plan, new Date())),
    // pm은 에이전트 토큰으로 올린다. 웹의 "Put on the board"는 같은 board.propose를 human·web으로 부른다(§E.7).
    propose: (projectId, input, actorRef) => board.propose(projectId, input, { actor: "agent", actorRef }),
    // 에이전트에는 화면이 없다 — CAS 토큰은 board.transition이 트랜잭션 안에서 방금 읽은
    // row.updatedAt으로 채운다. Caller 유니온이 그 사실을 타입으로 못박는다.
    transition: (projectId, input, actorRef) => board.transition(projectId, input, { actor: "agent", actorRef }),
    submitPlan: (projectId, input, actorRef) => board.submitPlan(projectId, input, actorRef),
    submitReport: (projectId, input, actorRef) => board.submitReport(projectId, input, actorRef),
    recordValidation: (projectId, input, actorRef) => board.recordValidation(projectId, input, actorRef),
    agentNext: (projectId, tokenId, input, userScoped) => agentNext(prismaNextDeps, { projectId, tokenId, userScoped }, input),
    // pipeline_next의 조립은 여기다 — run.ts는 board.ts를 import하지 않으므로 미결 목록을 스스로 읽지 못한다(§D.1).
    // 항목마다 지연 전진을 먼저 돌린다: doc-audit·scout의 완료(에이전트 run 닫힘)는 보드 쓰기를 지나지 않는다.
    pipelineNext: async (projectId, key) => {
      if (key !== undefined) {
        await board.advancePipeline(projectId, key);
        return { ok: true as const, item: await nextFor(prisma, projectId, key) };
      }
      const openOnly = true;
      const open = await board.latestBoard(projectId, openOnly);
      // 미결 항목 + 런이 아직 열린 항목. 둘째가 없으면 인수까지 끝난 항목의 꼬리 노드가 개요에 안 잡힌다.
      // head의 수는 여전히 **미결**만 센다 — canPropose는 pm의 미결 2건 규칙이지 꼬리 순회와 무관하다.
      const keys = [...new Set([...open.map((r) => r.backlogItem.key), ...(await board.walkingKeys(projectId))])];
      const items = [];
      for (const key of keys) {
        await board.advancePipeline(projectId, key);
        items.push(await nextFor(prisma, projectId, key));
      }
      const head = await headFor(prisma, projectId, open.length, await board.availableBacklogCount(projectId));
      // 런북 표류는 프로젝트 단위라 key 없는 개요에만 싣는다. 낡지 않았으면 필드 자체를 내지 않는다.
      const stale = await runbookStale(projectId, prisma);
      return { ok: true as const, item: { head, items, ...(stale ? { runbook: { stale: true as const, note: RUNBOOK_STALE_NOTE } } : {}) } };
    },
    access: (projectId) => readProjectAccess(prisma, projectId),
    // 술어는 user-scope-query.ts 한 곳에 있다 — REST 세 경로도 같은 것을 쓴다.
    projectFor: (slug, userId) => projectForUser(slug, userId, prisma),
  };
}
export const prismaToolDeps = createToolDeps(defaultDb);

// 토큰 조회도 여기 둔다 — route.ts가 Prisma를 직접 부르면 adapter가 데이터 접근을 떠안는다.
// 두 번째 인자가 hu_ 경로다. 접두로 먼저 갈리므로 둘 중 하나만 조회한다.
export const verifyProjectToken = makeVerifyToken(
  (hash) => defaultDb.projectToken.findUnique({ where: { hash }, select: { id: true, projectId: true, revokedAt: true } }),
  (hash) => findUserTokenByHash(hash, defaultDb),
);
