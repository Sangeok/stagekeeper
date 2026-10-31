"use server";
import { revalidatePath } from "next/cache";
import { requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { createBoardService, preparePipelineRun } from "@/server/pipeline/api";
import { failure, success, type ActionResult } from "@/fsd/shared/api/result";
import { itemPath, PROJECT_LAYOUT_REVALIDATE_PATH } from "@/fsd/shared/routes/project";
import { startPipelineInputSchema, type StartPipelineInput, type RunPreparation } from "../model/run-pipeline-input";

export async function prepareRunAction(slug: string, pipelineId: string): Promise<ActionResult<RunPreparation>> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return failure(access.reason);
  if (typeof pipelineId !== "string" || !pipelineId || pipelineId.length > 200) return failure("Choose a saved pipeline.");
  const result = await preparePipelineRun(prisma, access.projectId, access.userId, pipelineId);
  return result.ok ? success(result.item) : failure(result.reason);
}

export async function startRunAction(slug: string, input: StartPipelineInput): Promise<ActionResult<{ href: string }>> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return failure(access.reason);
  const parsed = startPipelineInputSchema.safeParse(input);
  if (!parsed.success) return failure("Check the selected work and try again.");
  const result = await createBoardService(prisma).startPipeline(access.projectId, access.userId, parsed.data);
  if (!result.ok) return failure(result.reason);
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return success({ href: itemPath(slug, result.item.key) });
}
