"use server";
import { revalidatePath } from "next/cache";
import { allowsPipelineEdit, PIPELINE_EDIT_PLAN_GATE } from "@harness/core/pipeline.mjs";
import { ITEM_TYPES } from "@harness/core/backlog.mjs";
import { failure, success, type ActionResult } from "@/fsd/shared/api/result";
import { PROJECT_LAYOUT_REVALIDATE_PATH } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForProject } from "@/server/entitlement";
import { archivePipeline, renamePipeline, setDefaultPipeline, setPipelineRule, setAutomaticPick } from "@/server/pipeline/pipeline-settings-query";
import type { ServerResult } from "@/server/result";

async function change(slug: string, valid: boolean, work: (identity: { projectId: string; userId: string }) => Promise<ServerResult<null>>): Promise<ActionResult<null>> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return failure(access.reason);
  if (!allowsPipelineEdit(await planForProject(access.projectId))) return failure(PIPELINE_EDIT_PLAN_GATE);
  if (!valid) return failure("Invalid pipeline settings request.");
  const result = await work({ projectId: access.projectId, userId: access.userId });
  if (!result.ok) return failure(result.reason);
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return success(null);
}
export async function archivePipelineAction(slug: string, pipelineId: string): Promise<ActionResult<null>> {
  return change(slug, typeof pipelineId === "string", identity => archivePipeline(prisma, { pipelineId, ...identity }));
}
export async function renamePipelineAction(slug: string, pipelineId: string, name: string): Promise<ActionResult<null>> {
  return change(slug, typeof pipelineId === "string" && typeof name === "string", identity => renamePipeline(prisma, { pipelineId, name, ...identity }));
}
export async function setDefaultPipelineAction(slug: string, pipelineId: string): Promise<ActionResult<null>> {
  return change(slug, typeof pipelineId === "string", identity => setDefaultPipeline(prisma, { pipelineId, ...identity }));
}
export async function setPipelineRuleAction(slug: string, type: string, pipelineId: string | null): Promise<ActionResult<null>> {
  return change(slug, ITEM_TYPES.some(value => value === type) && (pipelineId === null || typeof pipelineId === "string"), identity => setPipelineRule(prisma, { type, pipelineId, ...identity }));
}
export async function setAutomaticPickAction(slug: string, enabled: boolean): Promise<ActionResult<null>> {
  return change(slug, typeof enabled === "boolean", identity => setAutomaticPick(prisma, { enabled, ...identity }));
}
