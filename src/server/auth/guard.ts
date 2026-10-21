import "server-only";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/projects/api.server";
import { auth } from "./index";

export async function requireUser(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return { userId: session.user.id };
}

export async function requireProjectOwner(slug: string): Promise<{ userId: string; projectId: string }> {
  const { userId } = await requireUser();
  if (typeof slug !== "string" || slug.trim().length === 0) notFound();
  const project = await prisma.project.findFirst({ where: { ownerUserId: userId, slug }, select: { id: true } });
  if (!project) notFound();
  return { userId, projectId: project.id };
}

export type ProjectWrite = { ok: true; userId: string; projectId: string } | { ok: false; reason: string };
export async function requireProjectWrite(slug: string): Promise<ProjectWrite> {
  const { userId, projectId } = await requireProjectOwner(slug);
  const access = await projectAccess(projectId);
  return access.available ? { ok: true, userId, projectId } : { ok: false, reason: access.reason };
}
