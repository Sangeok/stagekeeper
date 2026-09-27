"use server";
import { toItemType } from "@harness/core/backlog.mjs";
import { revalidatePath } from "next/cache";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectWrite } from "@/server/auth/guard";
import { addBacklog, updateBacklog, removeBacklog } from "@/server/pipeline/board";
import type { BacklogFormState } from "../model/backlog-form-state";

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function addBacklogItem(slug: string, _prev: BacklogFormState, form: FormData): Promise<BacklogFormState> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return { status: "error", error: access.reason };
  const added = await addBacklog(access.projectId, {
    title: field(form, "title"), area: field(form, "area"), source: field(form, "source"),
    type: toItemType(field(form, "type")), addedBy: "owner", addedByRunId: null,
  });
  if (!added.ok) return { status: "error", error: added.reason };
  revalidatePath(projectPath(slug, "/backlog"));
  return { status: "saved" };
}

export async function updateBacklogItem(slug: string, key: string, _prev: BacklogFormState, form: FormData): Promise<BacklogFormState> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return { status: "error", error: access.reason };
  const updated = await updateBacklog(access.projectId, key, {
    title: field(form, "title"), area: field(form, "area"), source: field(form, "source"),
    type: field(form, "type"), typeBefore: field(form, "typeBefore"),
  });
  if (!updated.ok) return { status: "error", error: updated.reason };
  revalidatePath(projectPath(slug, "/backlog"));
  return { status: "saved" };
}

export async function removeBacklogItem(slug: string, key: string): Promise<BacklogFormState> {
  const access = await requireProjectWrite(slug);
  if (!access.ok) return { status: "error", error: access.reason };
  const removed = await removeBacklog(access.projectId, key);
  if (!removed.ok) return { status: "error", error: removed.reason };
  revalidatePath(projectPath(slug, "/backlog"));
  return { status: "saved" };
}
