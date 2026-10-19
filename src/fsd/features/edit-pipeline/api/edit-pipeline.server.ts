"use server";
import { revalidatePath } from "next/cache";
import { allowsPipelineEdit } from "@harness/core/pipeline.mjs";
import { PROJECT_LAYOUT_REVALIDATE_PATH } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForProject } from "@/server/projects/api.server";
import { savePipelineDefinition } from "@/server/pipeline/api";
import { PIPELINE_EDIT_PLAN_GATE } from "../model/plan-gate";
import type { SavePipelineInput, SavePipelineResult } from "../model/pipeline-save-state";
import { savePipelineInputSchema } from "../model/save-pipeline-input";

export async function savePipeline(slug: string, input: SavePipelineInput): Promise<SavePipelineResult> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return { status: "error", reason: w.reason };
  const plan = await planForProject(w.projectId);
  if (!allowsPipelineEdit(plan)) return { status: "error", reason: PIPELINE_EDIT_PLAN_GATE };
  const parsed = savePipelineInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", reason: "Invalid pipeline save request." };
  const result = await savePipelineDefinition(prisma, { ...parsed.data, projectId: w.projectId, userId: w.userId });
  if (result.status === "success") revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return result;
}
