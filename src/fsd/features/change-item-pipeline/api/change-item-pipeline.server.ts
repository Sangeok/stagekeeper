"use server";
import { revalidatePath } from "next/cache";
import { failure, success, type ActionResult } from "@/fsd/shared/api/result";
import { PROJECT_LAYOUT_REVALIDATE_PATH } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import { changePipeline } from "@/server/pipeline/board";
import { changePipelineInputSchema } from "../model/change-input";

export async function changeItemPipeline(slug: string, input: { key: string; pipelineId: string; expectedUpdatedAt: string }): Promise<ActionResult<null>> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return failure(access.reason);
  const parsed = changePipelineInputSchema.safeParse(input);
  if (!parsed.success) return failure("Invalid pipeline change request.");
  const result = await changePipeline(access.projectId, { ...parsed.data, expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt), userId: access.userId });
  if (!result.ok) return failure(result.reason === "stale" ? "The board changed. Refresh and try again." : result.reason);
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return success(null);
}
