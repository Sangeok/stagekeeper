"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import * as board from "@/server/pipeline/board";
import { proposeInputSchema } from "../model/propose-input";

export async function proposeItem(slug: string, input: { key: string; agent: string; reason: string }): Promise<ActionResult<void>> {
  if (typeof slug !== "string" || slug.length === 0) return failure("Couldn't put it on the board. Try again.");
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(w.reason);
  const parsed = proposeInputSchema.safeParse(input);
  if (!parsed.success) return failure("Couldn't put it on the board. Try again.");
  const r = await board.propose(w.projectId, parsed.data, { actor: "human", actorRef: w.userId, channel: "web" });
  if (!r.ok) return failure(r.reason);
  revalidatePath(projectPath(slug, "/backlog")); revalidatePath(projectPath(slug)); revalidatePath(projectPath(slug, "/inbox"));
  return success();
}
