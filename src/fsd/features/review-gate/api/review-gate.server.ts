"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { itemPath, projectPath } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import * as board from "@/server/pipeline/board";
import type { RetryAcceptanceAction, TransitionInput } from "../model/inbox-item";
import { retryAcceptanceInputSchema, transitionInputSchema, approveGateInputSchema, discardInputSchema } from "../model/review-gate-input";

const REASON_MESSAGE: Record<string, string> = { stale: "The board changed. Refresh and try again." };
const message = (reason: string) => REASON_MESSAGE[reason] ?? reason;

export async function retryAcceptance(slug: string, input: Parameters<RetryAcceptanceAction>[0]): Promise<ActionResult<void>> {
  if (typeof slug !== "string" || slug.length === 0) return failure(message("stale"));
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(message(w.reason));
  const parsed = retryAcceptanceInputSchema.safeParse(input);
  if (!parsed.success) return failure(message("stale"));
  const { key, expectedUpdatedAt } = parsed.data;
  const r = await board.retryAcceptance(w.projectId, { key, userId: w.userId, expectedUpdatedAt: new Date(expectedUpdatedAt) });
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(projectPath(slug)); revalidatePath(projectPath(slug, "/inbox")); revalidatePath(itemPath(slug, key));
  return success();
}

export async function humanTransition(slug: string, input: TransitionInput): Promise<ActionResult<void>> {
  if (typeof slug !== "string" || slug.length === 0) return failure(message("stale"));
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(message(w.reason));
  const parsed = transitionInputSchema.safeParse(input);
  if (!parsed.success) return failure(message("stale"));
  const { key, to, result, expectedUpdatedAt } = parsed.data;
  const { userId, projectId } = w;
  const r = await board.transition(projectId, { key, to, result }, { actor: "human", actorRef: userId, channel: "web", expectedUpdatedAt: new Date(expectedUpdatedAt) });
  if (!r.ok) return failure(message(r.reason));
  // 되돌리기(reopen)는 항목 상세에서 오므로 그 경로도 새로 그린다.
  revalidatePath(projectPath(slug)); revalidatePath(projectPath(slug, "/inbox")); revalidatePath(itemPath(slug, key));
  return success();
}

// 게이트 승인 — 게이트 id로. 서버 층의 잠금은 board.transitionIn의 viaGate 거부가 맡는다.
export async function approveGate(slug: string, input: { key: string; gate: string; gateEntry?: { runId: string; entryId: string }; expectedUpdatedAt: string }): Promise<ActionResult<void>> {
  if (typeof slug !== "string" || slug.length === 0) return failure(message("stale"));
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(message(w.reason));
  const parsed = approveGateInputSchema.safeParse(input);
  if (!parsed.success) return failure(message("stale"));
  const { key, gate, gateEntry, expectedUpdatedAt } = parsed.data;
  const r = await board.gate(w.projectId, { key, gate, gateEntry }, { actor: "human", actorRef: w.userId, channel: "web", expectedUpdatedAt: new Date(expectedUpdatedAt) });
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(projectPath(slug)); revalidatePath(projectPath(slug, "/inbox")); revalidatePath(itemPath(slug, key));
  return success();
}

export async function discardItem(slug: string, key: string, expectedUpdatedAt: string): Promise<ActionResult<void>> {
  if (typeof slug !== "string" || slug.length === 0) return failure(message("stale"));
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(message(w.reason));
  const parsed = discardInputSchema.safeParse({ key, expectedUpdatedAt });
  if (!parsed.success) return failure(message("stale"));
  const { userId, projectId } = w;
  const r = await board.discard(projectId, { key: parsed.data.key, userId, expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt) });
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(projectPath(slug)); revalidatePath(projectPath(slug, "/inbox"));
  return success();
}
