"use server";
import { revalidatePath } from "next/cache";
import { allowsPipelineEdit, validateGraph } from "@harness/core/pipeline.mjs";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForProject } from "@/server/entitlement";
import { savePipelineVersion } from "@/server/pipeline/version-save-query";
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
  const v = validateGraph(parsed.data.graph, plan);
  if (!v.ok) return { status: "error", reason: v.reason };
  const result = await savePipelineVersion(prisma, { ...parsed.data, projectId: w.projectId, userId: w.userId });
  if (result.status === "success") revalidatePath(projectPath(slug, "/pipeline"));
  return result;
}
