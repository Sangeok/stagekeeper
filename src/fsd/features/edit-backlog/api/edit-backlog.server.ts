"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { latestBoard } from "@/server/pipeline/board";
import { BACKLOG_KEY_RE, type BacklogFormState } from "../model/backlog-form-state";

// 백로그는 상태 기계 밖이다(스펙 1.9 Step 3) — 150자 규칙도 없다. Prisma를 직접 쓴다.
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function addBacklogItem(slug: string, _prev: BacklogFormState, form: FormData): Promise<BacklogFormState> {
  const { projectId } = await requireMember(slug);
  const key = field(form, "key");
  const title = field(form, "title");
  if (!BACKLOG_KEY_RE.test(key)) return { error: "key: 대문자-숫자 형식이어야 한다 (예: FEAT-01)" };
  if (!title) return { error: "제목은 필수" };
  if (await prisma.backlogItem.findUnique({ where: { projectId_key: { projectId, key } } })) {
    return { error: `이미 있는 key: ${key}` };
  }
  await prisma.backlogItem.create({
    data: { projectId, key, title, area: field(form, "area"), source: field(form, "source") },
  });
  revalidatePath(`/p/${slug}/backlog`);
  return { done: true };
}

export async function updateBacklogItem(
  slug: string, key: string, _prev: BacklogFormState, form: FormData,
): Promise<BacklogFormState> {
  const { projectId } = await requireMember(slug);
  const title = field(form, "title");
  if (!title) return { error: "제목은 필수" };
  const updated = await prisma.backlogItem.updateMany({
    where: { projectId, key },
    data: { title, area: field(form, "area"), source: field(form, "source") },
  });
  if (updated.count === 0) return { error: `없는 항목: ${key}` };
  revalidatePath(`/p/${slug}/backlog`);
  return { done: true };
}

// 제거는 removedAt 표기다 — 행은 남는다. 미결 보드 항목이 있으면 거부한다.
export async function removeBacklogItem(slug: string, key: string): Promise<BacklogFormState> {
  const { projectId } = await requireMember(slug);
  const open = await latestBoard(projectId, true);
  if (open.some((row) => row.backlogItem.key === key)) {
    return { error: "보드에 미결 행이 있어 제거할 수 없다" };
  }
  const removed = await prisma.backlogItem.updateMany({
    where: { projectId, key, removedAt: null },
    data: { removedAt: new Date() },
  });
  if (removed.count === 0) return { error: `없는 항목: ${key}` };
  revalidatePath(`/p/${slug}/backlog`);
  return { done: true };
}
