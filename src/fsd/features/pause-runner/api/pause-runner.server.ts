"use server";
import { revalidatePath } from "next/cache";
import { failure, success, type ActionResult } from "@/fsd/shared/api/result";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { setRunnerPaused } from "@/server/runners/api";

// 웹의 실행기 일시 정지. 규칙(멱등·잠금 순서·사용 가능 여부)은 서버 서비스에 있다 — Action은 시험에서 부를 수 없다.
export async function saveRunnerPaused(slug: string, paused: boolean): Promise<ActionResult<boolean>> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return failure(access.reason);
  const result = await setRunnerPaused(prisma, { projectId: access.projectId, userId: access.userId, paused });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug), "layout");
  return success(result.item);
}
