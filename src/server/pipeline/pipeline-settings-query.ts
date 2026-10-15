import type { PrismaClient } from "@/generated/prisma/client";
import { ITEM_TYPES } from "@harness/core/backlog.mjs";
import { refStep } from "@harness/core/pipeline.mjs";
import type { ServerResult } from "../result";
import { PipelineRejection, requirePipelineEdit, withPipelineWrite, type PipelineWriteContext } from "./lock-query";
import { ensureRunnableVersion, loadPipelinesViewIn, PIPELINE_CANNOT_RUN_ITEMS, PIPELINE_NOT_FOUND, type PipelineView, type PipelinesView } from "./run-query";

type Identity = { projectId: string; userId: string };
type Target = Identity & { pipelineId: string };
const invalid = (): ServerResult<never> => ({ ok: false, reason: "Invalid pipeline settings request." });
function validIdentity(input: Identity): boolean {
  return !!input && typeof input.projectId === "string" && typeof input.userId === "string";
}
function targetOf(view: PipelinesView, pipelineId: string): PipelineView {
  const pipeline = view.pipelines.find(row => row.id === pipelineId);
  if (!pipeline) throw new PipelineRejection(PIPELINE_NOT_FOUND);
  return pipeline;
}
async function change(
  client: PrismaClient, input: Identity,
  work: (context: PipelineWriteContext, view: PipelinesView) => Promise<void>,
): Promise<ServerResult<null>> {
  try {
    return await withPipelineWrite(client, input.projectId, input.userId, async context => {
      requirePipelineEdit(context.plan);
      const view = await loadPipelinesViewIn(context.tx, input.projectId);
      // Preserve the original default before any successful settings write, including a swap.
      await ensureRunnableVersion(context.tx, input.projectId);
      await work(context, view);
      return { ok: true, item: null };
    });
  } catch (error) {
    if (error instanceof PipelineRejection) return { ok: false, reason: error.message };
    throw error;
  }
}

export async function archivePipeline(client: PrismaClient, input: Target): Promise<ServerResult<null>> {
  if (!validIdentity(input) || typeof input.pipelineId !== "string") return invalid();
  return change(client, input, async ({ tx }, view) => {
    const pipeline = targetOf(view, input.pipelineId);
    if (pipeline.isDefault) throw new PipelineRejection(`Can't archive ${pipeline.name}: it's the default pipeline.`);
    const users = view.pipelines.filter(row => row.definition.steps.includes(refStep(pipeline.id)));
    if (users.length) throw new PipelineRejection(`Can't archive ${pipeline.name}: ${users.map(row => row.name).join(", ")} use it.`);
    const rule = Object.entries(view.rules).find(([, id]) => id === pipeline.id);
    if (rule) throw new PipelineRejection(`Can't archive ${pipeline.name}: the ${rule[0]} rule points to it.`);
    await tx.pipeline.update({ where: { id: pipeline.id }, data: { archivedAt: new Date() } });
  });
}

export async function renamePipeline(client: PrismaClient, input: Target & { name: string }): Promise<ServerResult<null>> {
  if (!validIdentity(input) || typeof input.pipelineId !== "string" || typeof input.name !== "string") return invalid();
  return change(client, input, async ({ tx }, view) => {
    const pipeline = targetOf(view, input.pipelineId), name = input.name.trim();
    if (name.length < 1 || name.length > 40) throw new PipelineRejection("Use 1 to 40 characters for the pipeline name.");
    if (view.pipelines.some(row => row.id !== pipeline.id && row.name === name)) throw new PipelineRejection("Another pipeline already uses this name. Choose a different one.");
    await tx.pipeline.update({ where: { id: pipeline.id }, data: { name } });
  });
}

export async function setDefaultPipeline(client: PrismaClient, input: Target): Promise<ServerResult<null>> {
  if (!validIdentity(input) || typeof input.pipelineId !== "string") return invalid();
  return change(client, input, async ({ tx }, view) => {
    if (!targetOf(view, input.pipelineId).runnable) throw new PipelineRejection(PIPELINE_CANNOT_RUN_ITEMS);
    await tx.project.update({ where: { id: input.projectId }, data: { defaultPipelineId: input.pipelineId } });
  });
}

export async function setPipelineRule(client: PrismaClient, input: Identity & { type: string; pipelineId: string | null }): Promise<ServerResult<null>> {
  if (!validIdentity(input) || typeof input.type !== "string" || !ITEM_TYPES.some(type => type === input.type)
    || (input.pipelineId !== null && typeof input.pipelineId !== "string")) return invalid();
  return change(client, input, async ({ tx }, view) => {
    if (input.pipelineId === null) {
      await tx.pipelineRule.deleteMany({ where: { projectId: input.projectId, type: input.type } });
      return;
    }
    if (!targetOf(view, input.pipelineId).runnable) throw new PipelineRejection(PIPELINE_CANNOT_RUN_ITEMS);
    await tx.pipelineRule.upsert({ where: { projectId_type: { projectId: input.projectId, type: input.type } },
      create: { projectId: input.projectId, type: input.type, pipelineId: input.pipelineId }, update: { pipelineId: input.pipelineId } });
  });
}

export async function setAutomaticPick(client: PrismaClient, input: Identity & { enabled: boolean }): Promise<ServerResult<null>> {
  if (!validIdentity(input) || typeof input.enabled !== "boolean") return invalid();
  return change(client, input, async ({ tx }) => {
    await tx.project.update({ where: { id: input.projectId }, data: { autoProposeEnabled: input.enabled } });
  });
}
