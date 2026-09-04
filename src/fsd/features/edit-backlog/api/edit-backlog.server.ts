"use server";
import { capError } from "@harness/core/entitlement.mjs";
import { revalidatePath } from "next/cache";
import { projectPath } from "@/fsd/shared/routes/project";
import { Prisma } from "@/generated/prisma/client";
import { requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForProject } from "@/server/entitlement";
import { latestBoard } from "@/server/pipeline/board";
import { BACKLOG_KEY_RE, type BacklogFormState } from "../model/backlog-form-state";

// 백로그는 상태 기계 밖이다(스펙 1.9 Step 3) — 150자 규칙도 없다. Prisma를 직접 쓴다.
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function addBacklogItem(slug: string, _prev: BacklogFormState, form: FormData): Promise<BacklogFormState> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return { error: w.reason };
  const { projectId } = w;
  const key = field(form, "key");
  const title = field(form, "title");
  if (!BACKLOG_KEY_RE.test(key)) return { error: "Key must look like FEAT-01: capital letters, a dash, a number." };
  if (!title) return { error: "Title is required." };
  if (await prisma.backlogItem.findUnique({ where: { projectId_key: { projectId, key } } })) {
    return { error: `${key} already exists.` };
  }
  const plan = await planForProject(projectId);
  try {
    // 상한은 **미제거** 항목 수로 센다 — removedAt이 찍힌 행은 자리를 차지하지 않는다.
    // 검사와 생성이 한 트랜잭션인 이유는 createProject와 같다.
    const capped = await prisma.$transaction(async (tx) => {
      const live = await tx.backlogItem.count({ where: { projectId, removedAt: null } });
      const capMsg = capError(plan, "backlog", live);
      if (capMsg) return capMsg;
      await tx.backlogItem.create({
        data: { projectId, key, title, area: field(form, "area"), source: field(form, "source") },
      });
      return null;
    });
    if (capped) return { error: capped };
  } catch (error) {
    // 위 findUnique 이후에 같은 key가 먼저 들어갔을 때 — 같은 답을 준다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: `${key} already exists.` };
    }
    throw error;
  }
  revalidatePath(projectPath(slug, "/backlog"));
  return {};
}

export async function updateBacklogItem(
  slug: string, key: string, _prev: BacklogFormState, form: FormData,
): Promise<BacklogFormState> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return { error: w.reason };
  const { projectId } = w;
  const title = field(form, "title");
  if (!title) return { error: "Title is required." };
  const updated = await prisma.backlogItem.updateMany({
    where: { projectId, key },
    data: { title, area: field(form, "area"), source: field(form, "source") },
  });
  if (updated.count === 0) return { error: `${key} doesn't exist.` };
  revalidatePath(projectPath(slug, "/backlog"));
  return {};
}

// 제거는 removedAt 표기다 — 행은 남는다. 미결 보드 항목이 있으면 거부한다.
export async function removeBacklogItem(slug: string, key: string): Promise<BacklogFormState> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return { error: w.reason };
  const { projectId } = w;
  const openOnly = true;
  const open = await latestBoard(projectId, openOnly);
  if (open.some((row) => row.backlogItem.key === key)) {
    return { error: `${key} is open on the board. Finish or discard it before removing.` };
  }
  const removed = await prisma.backlogItem.updateMany({
    where: { projectId, key, removedAt: null },
    data: { removedAt: new Date() },
  });
  if (removed.count === 0) return { error: `${key} doesn't exist.` };
  revalidatePath(projectPath(slug, "/backlog"));
  return {};
}
