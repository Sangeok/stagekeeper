"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import * as board from "@/server/pipeline/board";
import type { TransitionInput } from "../model/inbox-item";

const REASON_MESSAGE: Record<string, string> = { stale: "The board changed. Refresh and try again." };
const message = (reason: string) => REASON_MESSAGE[reason] ?? reason;

// to는 상태 기계가, result는 checkText가 검사한다. expectedUpdatedAt은 클라이언트 문자열이라 여기서 막는다 —
// Invalid Date를 그대로 where에 넘기면 의도한 "stale" 대신 Prisma 예외가 된다.
const parseExpected = (iso: string): Date | null => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function humanTransition(slug: string, input: TransitionInput): Promise<ActionResult<void>> {
  const { key, to, result } = input;
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(message(w.reason));
  const { userId, projectId } = w;
  const expected = parseExpected(input.expectedUpdatedAt);
  if (expected === null) return failure(message("stale"));
  const r = await board.transition(projectId, { key, to, result }, { actor: "human", actorRef: userId, expectedUpdatedAt: expected });
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(projectPath(slug)); revalidatePath(projectPath(slug, "/inbox"));
  return success(); // ApcH result.ts의 무인자 오버로드 = ActionResult<void>
}

export async function discardItem(slug: string, key: string, expectedUpdatedAt: string): Promise<ActionResult<void>> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(message(w.reason));
  const { userId, projectId } = w;
  const expected = parseExpected(expectedUpdatedAt);
  if (expected === null) return failure(message("stale"));
  const r = await board.discard(projectId, { key, userId, expectedUpdatedAt: expected });
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(projectPath(slug)); revalidatePath(projectPath(slug, "/inbox"));
  return success(); // ApcH result.ts의 무인자 오버로드 = ActionResult<void>
}
