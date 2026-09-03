// deps.ts — ToolDeps의 Prisma 구현 + 토큰 검증 바인딩. 도구 본문은 tools.ts, 저장 규칙은 pipeline/board.ts.
import "server-only";
import { agentNext } from "@/server/agents/next";
import { prismaNextDeps } from "@/server/agents/runs";
import { prisma } from "@/server/db";
import * as board from "@/server/pipeline/board";
import { makeVerifyToken } from "./auth";
import type { ToolDeps } from "./tools";

export const prismaToolDeps: ToolDeps = {
  projectGet: (projectId) => prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { workspaces: true } }),
  projectSync: async (projectId, workspaces) => {
    await prisma.$transaction(workspaces.map((w) => prisma.workspace.upsert({
      where: { projectId_agent: { projectId, agent: w.agent } },
      create: { projectId, wsId: w.id, path: w.path, agent: w.agent, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly },
      update: { wsId: w.id, path: w.path, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly },
    })));
    return workspaces.length;
  },
  backlogList: (projectId, includeRemoved) => board.backlogWithStatus(projectId, includeRemoved),
  backlogGet: (projectId, key) => prisma.backlogItem.findUnique({ where: { projectId_key: { projectId, key } } }),
  boardList: (projectId, open) => board.latestBoard(projectId, open),
  boardGet: (projectId, key) => board.getWithHistory(projectId, key),
  propose: (projectId, input, actorRef) => board.propose(projectId, input, actorRef),
  // 에이전트에는 화면이 없다 — CAS 토큰은 board.transition이 트랜잭션 안에서 방금 읽은
  // row.updatedAt으로 채운다. Caller 유니온이 그 사실을 타입으로 못박는다.
  transition: (projectId, input, actorRef) => board.transition(projectId, input, { actor: "agent", actorRef }),
  submitPlan: (projectId, input, actorRef) => board.submitPlan(projectId, input, actorRef),
  submitReport: (projectId, input, actorRef) => board.submitReport(projectId, input, actorRef),
  recordValidation: (projectId, input, actorRef) => board.recordValidation(projectId, input, actorRef),
  agentNext: (projectId, tokenId, input) => agentNext(prismaNextDeps, { projectId, tokenId }, input),
};

// 토큰 조회도 여기 둔다 — route.ts가 Prisma를 직접 부르면 adapter가 데이터 접근을 떠안는다.
export const verifyProjectToken = makeVerifyToken((hash) =>
  prisma.projectToken.findUnique({ where: { hash }, select: { id: true, projectId: true, revokedAt: true } }),
);
