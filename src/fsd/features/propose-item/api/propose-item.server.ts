"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import * as board from "@/server/pipeline/board";
export async function proposeItem(slug: string, input: { key: string; agent: string; reason: string }): Promise<ActionResult<void>> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(w.reason);
  const r = await board.propose(w.projectId, input, { actor: "human", actorRef: w.userId, channel: "web" });
  if (!r.ok) return failure(r.reason);
  revalidatePath(projectPath(slug, "/backlog")); revalidatePath(projectPath(slug)); revalidatePath(projectPath(slug, "/inbox"));
  return success();
}
