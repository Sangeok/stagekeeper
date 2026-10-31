"use server";
import { revalidatePath } from "next/cache";
import { requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { createBoardService, preparePipelineRun, startProjectWork, stopProjectWork, approveWorkGate } from "@/server/pipeline/api";
import { z } from "zod";
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

export async function startProjectRunAction(slug: string, pipelineId: string, graphKey: string): Promise<ActionResult<{ href: string }>> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return failure(access.reason);
  const parsed = z.object({ pipelineId: z.string().min(1).max(200), graphKey: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse({ pipelineId, graphKey });
  if (!parsed.success) return failure("Choose a saved pipeline.");
  const result = await startProjectWork(prisma, access.projectId, access.userId, pipelineId, graphKey);
  if (!result.ok) return failure(result.reason);
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return success({ href: `/p/${slug}/pipeline?pipeline=${encodeURIComponent(pipelineId)}` });
}

export async function approveProjectGateAction(slug: string, entry: { runId: string; entryId: string; slotId: string }): Promise<ActionResult<null>> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return failure(access.reason);
  const parsed = z.object({ runId: z.string().min(1).max(200), entryId: z.string().min(1).max(200), slotId: z.string().min(1).max(200) }).safeParse(entry);
  if (!parsed.success) return failure("Reopen Run to check the current gate.");
  const result = await approveWorkGate(prisma, access.projectId, access.userId, parsed.data);
  if (!result.ok) return failure(result.reason);
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return success(null);
}

export async function stopProjectRunAction(slug: string, runId: string): Promise<ActionResult<null>> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return failure(access.reason);
  if (typeof runId !== "string" || !runId || runId.length > 200) return failure("Reopen Run to check the active run.");
  const result = await stopProjectWork(prisma, access.projectId, access.userId, runId);
  if (!result.ok) return failure(result.reason);
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return success(null);
}
