"use server";
import { revalidatePath } from "next/cache";
import { failure, success, type ActionResult } from "@/fsd/shared/api/result";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { setAutomaticScout } from "@/server/automatic-scout";

export async function saveAutomaticScout(slug: string, enabled: boolean): Promise<ActionResult<boolean>> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return failure(access.reason);
  const result = await setAutomaticScout(prisma, { projectId: access.projectId, userId: access.userId, enabled });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug), "layout");
  return success(result.item);
}
