import { ProjectBoardPage, buildBriefing } from "@/fsd/pages/project-board";
import { requireProjectOwner } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { loadProjectRoster } from "@/server/project";
import { latestBoard } from "@/server/pipeline/board";
import { loadCurrentVersionView } from "@/server/pipeline/run";
import { dispatcherFor, isGateId } from "@harness/core/pipeline.mjs";

export default async function Page({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const { projectId } = await requireProjectOwner(slug);

  const [rows, roster, runs, agentRuns, version] = await Promise.all([
    latestBoard(projectId),
    loadProjectRoster(prisma, projectId),
    prisma.pipelineRun.findMany({ where: { closedAt: null, boardItem: { projectId } }, select: { boardItemId: true, node: true } }),
    // 열린 에이전트 run이 없으면 아무도 그 일을 하고 있지 않다. 배너(turn-data.server.ts)와 다른 점: 배너는
    // slots-v1 버전에서 run이 이 파이프라인 항목(pipelineRunId·pipelineEntryId·agent)에 묶여 있어야 "하고 있다"로
    // 보고, 보드는 모든 버전을 key·agent로만 본다 — 느슨한 쪽이다. 이 차이는 의도로 남겨 둔다.
    prisma.agentRun.findMany({ where: { projectId, closedAt: null, key: { not: null } }, select: { key: true, agent: true } }),
    loadCurrentVersionView(prisma, projectId),
  ]);
  const cursor = new Map(runs.map((r) => [r.boardItemId, r.node]));
  // key와 agent를 잇는 구분자는 NUL(\u0000)이다 — turn-data.server.ts의 배너 파생과 같은 값이어야 한다.
  const running = new Set(agentRuns.filter((r) => r.key !== null).map((r) => `${r.key}\u0000${r.agent}`));

  const briefing = buildBriefing(
    rows.map((r) => {
      const at = cursor.get(r.id) ?? null;
      const node = at !== null && !isGateId(at) ? at : null;
      const who = node === null ? null : dispatcherFor(node, r.agent);
      return { ...r, gate: at !== null && isGateId(at) ? at : null, node, dispatched: who !== null && running.has(`${r.backlogItem.key}\u0000${who}`) };
    }),
    new Date(), roster, version.graph.nodes,
  );

  return <ProjectBoardPage slug={slug} briefing={briefing} />;
}
