import "server-only";

import { dispatcherFor, isGateId, SLOT_FORMAT } from "@harness/core/pipeline.mjs";
import { pendingInboxCount } from "@/fsd/entities/board-item";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";
import { handoffIsLive } from "@/server/pipeline/run-rules";
import { deriveTurn, type Turn } from "../model/turn";

export type TurnData = { turn: Turn; inboxCount: number };

// §E.3: latestBoard는 바꾸지 않고(board_list의 JSON) 열린 런을 함께 읽어 key → node/gate 맵을 만든다.
export async function loadTurn(projectId: string): Promise<TurnData> {
  const [rows, tokenCount, workspaceCount, openRuns, pipelineRuns, project] = await Promise.all([
    latestBoard(projectId),
    prisma.projectToken.count({ where: { projectId, revokedAt: null } }),
    prisma.workspace.count({ where: { projectId } }),
    prisma.agentRun.findMany({
      where: { projectId, closedAt: null },
      select: { pipelineRunId: true, pipelineEntryId: true, key: true, agent: true, stepId: true, steps: { where: { OR: [{ accepted: true }, { accepted: null }] }, orderBy: { at: "desc" }, take: 1, select: { outcome: true, note: true, at: true } } },
    }),
    prisma.pipelineRun.findMany({ where: { closedAt: null, boardItem: { projectId } }, select: { id: true, entryId: true, version: { select: { format: true } }, boardItemId: true, node: true } }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { autoScoutEnabled: true } }),
  ]);

  // 에이전트가 멈췄다는 사실은 원장에 남지만, 소유자가 커밋하고 에이전트가 이어가면 그 행은 그대로 남는다.
  // 보드 행이 그 뒤에 갱신됐으면 커밋은 이미 끝난 것이다 — 그러지 않으면 배너가 "커밋을 기다린다"에서 안 내려온다.
  const updatedAt = new Map(rows.map((r) => [r.backlogItem.key, r.updatedAt]));
  const handoffs = new Map<string, { step: string; note: string | null }>();
  for (const run of openRuns) {
    const last = run.steps[0];
    if (run.key === null || last?.outcome !== "handoff") continue;
    const since = updatedAt.get(run.key);
    if (since === undefined || !handoffIsLive(last.at, since)) continue;
    handoffs.set(run.key, { step: run.stepId, note: last.note });
  }
  // "열린 run이 있다"로는 부족하다. dev가 닫히지 않은 채 항목이 verify로 넘어가면
  // 아무도 검증하지 않는데 "being verified"가 된다(실측). 그 노드를 도는 에이전트로 좁힌다.
  // key와 agent를 잇는 구분자는 NUL(\u0000)이다 — src/app/(app)/p/[slug]/page.tsx의 보드 파생과 같은 값이어야 한다.
  const running = new Set(openRuns.filter((r) => r.key !== null).map((r) => `${r.key}\u0000${r.agent}`));
  const cursor = new Map(pipelineRuns.map((r) => [r.boardItemId, r.node]));
  const items = rows.map((r) => {
    const at = cursor.get(r.id) ?? null;
    const node = at !== null && !isGateId(at) ? at : null;
    const pipeline = pipelineRuns.find((p) => p.boardItemId === r.id);
    // 슬롯 버전은 열린 run이 이 파이프라인 항목에 묶여 있어야 "하고 있다"다. 레거시 버전은 key·agent로만 본다.
    const isSlotRun = pipeline?.version.format === SLOT_FORMAT;
    const boundRun = isSlotRun ? openRuns.find((a) => a.pipelineRunId === pipeline.id && a.pipelineEntryId === pipeline.entryId && a.agent === dispatcherFor(at, r.agent)) : undefined;
    const last = boundRun?.steps[0];
    const slotHandoff = boundRun && last?.outcome === "handoff" && handoffIsLive(last.at, r.updatedAt) ? { step: boundRun.stepId, note: last.note } : null;
    const who = node === null ? null : dispatcherFor(node, r.agent);
    return {
      key: r.backlogItem.key,
      status: r.status,
      agent: r.agent,
      accepted: r.acceptedAt !== null,
      handoff: isSlotRun ? slotHandoff : handoffs.get(r.backlogItem.key) ?? null,
      gate: at !== null && isGateId(at) ? at : null,
      node,
      dispatched: isSlotRun ? boundRun !== undefined : who !== null && running.has(`${r.backlogItem.key}\u0000${who}`),
    };
  });

  return {
    turn: deriveTurn(items, { tokenIssued: tokenCount > 0, rosterSynced: workspaceCount > 0, autoScoutEnabled: project.autoScoutEnabled }),
    inboxCount: pendingInboxCount(items.map((i) => ({ status: i.status, gate: i.gate }))),
  };
}
