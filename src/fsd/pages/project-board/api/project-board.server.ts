import "server-only";
import { buildBriefing, type Briefing } from "../model/briefing";
import { prisma } from "@/server/db";
import { loadProjectRoster } from "@/server/project";
import { latestBoard } from "@/server/pipeline/board";
import { loadCurrentVersionView } from "@/server/pipeline/run";
import { dispatcherFor, isGateId, slotAgent, PROJECT_AGENTS, SLOT_FORMAT } from "@harness/core/pipeline.mjs";

export async function loadProjectBoard(projectId: string, now: Date): Promise<Briefing> {
  const [rows, roster, runs, agentRuns, version] = await Promise.all([
    latestBoard(projectId),
    loadProjectRoster(prisma, projectId),
    prisma.pipelineRun.findMany({ where: { closedAt: null, boardItem: { projectId } }, select: { id: true, entryId: true, version: { select: { format: true } }, boardItemId: true, node: true } }),
    // 열린 에이전트 run이 없으면 아무도 그 일을 하고 있지 않다. 배너(turn-data.server.ts)와 다른 점: 배너는
    // slots-v1 버전에서 run이 이 파이프라인 항목(pipelineRunId·pipelineEntryId·agent)에 묶여 있어야 "하고 있다"로
    // 보고, 보드의 keyed 판정은 모든 버전에서 key·agent만 본다. null-key 프로젝트 슬롯만 현재 entry binding을 요구한다.
    prisma.agentRun.findMany({ where: { projectId, closedAt: null }, select: { key: true, agent: true, pipelineRunId: true, pipelineEntryId: true } }),
    loadCurrentVersionView(prisma, projectId),
  ]);
  const cursor = new Map(runs.map((r) => [r.boardItemId, r]));
  // key와 agent를 잇는 구분자는 NUL(\u0000)이다 — turn-data.server.ts의 배너 파생과 같은 값이어야 한다.
  const running = new Set(agentRuns.filter((r) => r.key !== null).map((r) => `${r.key}\u0000${r.agent}`));

  const briefing = buildBriefing(
    rows.map((r) => {
      const run = cursor.get(r.id);
      const at = run?.node ?? null;
      const node = at !== null && !isGateId(at) ? at : null;
      const who = node === null ? null : dispatcherFor(node, r.agent);
      const keyedMatch = who !== null && running.has(`${r.backlogItem.key}\u0000${who}`);
      const agent = node === null ? null : slotAgent(node);
      const nullKeyBoundMatch = agent !== null && PROJECT_AGENTS.includes(agent) && run?.version.format === SLOT_FORMAT && run.entryId !== null
        && agentRuns.some((candidate) => candidate.key === null && candidate.agent === who && candidate.pipelineRunId === run.id && candidate.pipelineEntryId === run.entryId);
      return { ...r, gate: at !== null && isGateId(at) ? at : null, node, dispatched: keyedMatch || nullKeyBoundMatch };
    }),
    now, roster, version.graph.nodes,
  );

  return briefing;
}
