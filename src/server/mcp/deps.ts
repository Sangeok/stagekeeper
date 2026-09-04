// deps.ts — ToolDeps의 Prisma 구현 + 토큰 검증 바인딩. 도구 본문은 tools.ts, 저장 규칙은 pipeline/board.ts.
import { capReason, historyCutoff, withinLimit } from "@harness/core/entitlement.mjs";
import "server-only";
import { agentNext } from "@/server/agents/next";
import { prismaNextDeps } from "@/server/agents/runs";
import { prisma } from "@/server/db";
import { planForProject, projectAccess } from "@/server/entitlement";
import * as board from "@/server/pipeline/board";
import { makeVerifyToken } from "./auth";
import type { ToolDeps } from "./tools";

export const prismaToolDeps: ToolDeps = {
  projectGet: (projectId) => prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { workspaces: true } }),
  // language는 harness.json의 값 — Project.language는 스키마 기본값이 ko라 웹에서 쓰는 곳이 없다.
  // 여기서 받아 두어야 agent_next가 스텁과 같은 언어의 단계를 찾는다(runs.ts의 ko→en 되돌림은 그때까지의 안전망).
  projectSync: async (projectId, workspaces, language) => {
    // "N개로 맞춘다"는 동기화라 추가 전 검사(capError)가 아니라 목표 수를 그대로 잰다.
    // 거부는 도구 응답에 사유를 싣는다 — 생성기는 파일을 쓰기 전에 같은 문장으로 이미 멈추지만,
    // 손으로 harness.json을 고쳐 부르는 경로가 서버를 지나칠 수 있다.
    const plan = await planForProject(projectId);
    if (!withinLimit(plan, "workspaces", workspaces.length)) {
      return { ok: false as const, reason: `${capReason(plan, "workspaces")}: harness.json has ${workspaces.length} workspaces. Drop workspaces or upgrade the plan.` };
    }
    await prisma.$transaction([
      ...(language === undefined ? [] : [prisma.project.update({ where: { id: projectId }, data: { language } })]),
      ...workspaces.map((w) => prisma.workspace.upsert({
      where: { projectId_agent: { projectId, agent: w.agent } },
      create: { projectId, wsId: w.id, path: w.path, agent: w.agent, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly },
      update: { wsId: w.id, path: w.path, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly },
    })),
    ]);
    return { ok: true as const, item: workspaces.length };
  },
  backlogList: (projectId, includeRemoved) => board.backlogWithStatus(projectId, includeRemoved),
  backlogGet: (projectId, key) => prisma.backlogItem.findUnique({ where: { projectId_key: { projectId, key } } }),
  boardList: (projectId, open) => board.latestBoard(projectId, open),
  boardGet: async (projectId, key) =>
    board.getWithHistory(projectId, key, historyCutoff(await planForProject(projectId), new Date())),
  propose: (projectId, input, actorRef) => board.propose(projectId, input, actorRef),
  // 에이전트에는 화면이 없다 — CAS 토큰은 board.transition이 트랜잭션 안에서 방금 읽은
  // row.updatedAt으로 채운다. Caller 유니온이 그 사실을 타입으로 못박는다.
  transition: (projectId, input, actorRef) => board.transition(projectId, input, { actor: "agent", actorRef }),
  submitPlan: (projectId, input, actorRef) => board.submitPlan(projectId, input, actorRef),
  submitReport: (projectId, input, actorRef) => board.submitReport(projectId, input, actorRef),
  recordValidation: (projectId, input, actorRef) => board.recordValidation(projectId, input, actorRef),
  agentNext: (projectId, tokenId, input) => agentNext(prismaNextDeps, { projectId, tokenId }, input),
  access: (projectId) => projectAccess(projectId),
};

// 토큰 조회도 여기 둔다 — route.ts가 Prisma를 직접 부르면 adapter가 데이터 접근을 떠안는다.
export const verifyProjectToken = makeVerifyToken((hash) =>
  prisma.projectToken.findUnique({ where: { hash }, select: { id: true, projectId: true, revokedAt: true } }),
);
