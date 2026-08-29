"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { requireMember } from "@/server/auth/guard";
import * as board from "@/server/pipeline/board";

const REASON_MESSAGE: Record<string, string> = { stale: "보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요" };
const message = (reason: string) => REASON_MESSAGE[reason] ?? reason;

export async function humanTransition(slug: string, key: string, to: string, result: string | undefined, expectedUpdatedAt: string): Promise<ActionResult<void>> {
  const { userId, projectId } = await requireMember(slug);
  const r = await board.transition(projectId, { key, to, result, expectedUpdatedAt: new Date(expectedUpdatedAt) }, "human", userId);
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(`/p/${slug}`); revalidatePath(`/p/${slug}/inbox`);
  return success(); // ApcH result.ts의 무인자 오버로드 = ActionResult<void>
}

export async function discardItem(slug: string, key: string, expectedUpdatedAt: string): Promise<ActionResult<void>> {
  const { userId, projectId } = await requireMember(slug);
  const r = await board.discard(projectId, key, userId, new Date(expectedUpdatedAt));
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(`/p/${slug}`); revalidatePath(`/p/${slug}/inbox`);
  return success(); // ApcH result.ts의 무인자 오버로드 = ActionResult<void>
}
