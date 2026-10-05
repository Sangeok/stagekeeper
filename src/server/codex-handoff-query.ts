import type { PrismaClient } from "@/generated/prisma/client";
import type { PipelineNext } from "./pipeline/run-rules";
import { dispatcherFor, isItemNode } from "@harness/core/pipeline.mjs";

export async function codexHandoffView(db: PrismaClient, projectId: string, item: PipelineNext) {
  if (item.action !== "wait" || item.on !== "handoff") return item;
  const board = await db.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key: item.key } }, orderBy: { proposedOn: "desc" }, include: { run: { include: { version: true } } } });
  const pipeline = board?.run;
  if (!board || !pipeline || pipeline.closedAt || pipeline.node !== item.node || ![null, "slots-v1"].includes(pipeline.version.format)) throw new Error("Handoff pipeline binding unavailable");
  const entry = pipeline.version.format === "slots-v1" ? { runId: pipeline.id, entryId: pipeline.entryId, slotId: pipeline.node } : undefined;
  if (entry && !entry.entryId) throw new Error("Handoff entry missing");
  const agent = dispatcherFor(pipeline.node, board.agent);
  if (!agent) throw new Error("Handoff role missing");
  const run = await db.agentRun.findFirst({ where: { projectId, agent, key: isItemNode(pipeline.node) ? item.key : null, closedAt: null, pipelineRunId: entry?.runId ?? null, pipelineEntryId: entry?.entryId ?? null }, orderBy: { openedAt: "desc" }, select: { id: true } });
  if (!run) throw new Error("Open handoff AgentRun missing");
  return { ...item, resume: { agent, key: item.key, format: pipeline.version.format, ...(entry ? { entry } : {}), agentRunId: run.id } };
}
