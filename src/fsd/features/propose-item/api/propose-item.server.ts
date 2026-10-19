"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { PROJECT_LAYOUT_REVALIDATE_PATH } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import * as board from "@/server/pipeline/api.server";
import { PIPELINE_NOT_FOUND, PIPELINE_CANNOT_RUN_ITEMS } from "@/server/pipeline/api";
import { proposeInputSchema, type ProposeInput } from "../model/propose-input";

export async function proposeItem(slug: string, input: ProposeInput): Promise<ActionResult<void> & { resetPipeline?: boolean }> {
  if (typeof slug !== "string" || slug.length === 0) return failure("Couldn't put it on the board. Try again.");
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(w.reason);
  const parsed = proposeInputSchema.safeParse(input);
  if (!parsed.success) return failure("Couldn't put it on the board. Try again.");
  const r = await board.propose(w.projectId, parsed.data, { actor: "human", actorRef: w.userId, channel: "web" });
  if (!r.ok) {
    if (r.reason === PIPELINE_NOT_FOUND || r.reason === PIPELINE_CANNOT_RUN_ITEMS) return { ...failure(r.reason), resetPipeline: true };
    return failure(r.reason);
  }
  revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout");
  return success();
}
