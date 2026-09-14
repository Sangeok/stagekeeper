// guard.ts — DAL. page·서버 액션이 각자 부른다(레이아웃 한 번으로 대신하지 않는다 — T1.10 주석).
import "server-only";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { auth } from "./index";

export async function requireUser(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return { userId: session.user.id };
}

// 다른 사용자의 프로젝트와 없는 프로젝트는 같은 not-found를 반환한다.
export async function requireProjectOwner(slug: string): Promise<{ userId: string; projectId: string }> {
  const { userId } = await requireUser();
  const project = await prisma.project.findFirst({ where: { ownerUserId: userId, slug }, select: { id: true } });
  if (!project) notFound();
  return { userId, projectId: project.id };
}

// 읽기는 남겨 두고 쓰기만 사유와 함께 거부한다.
export type ProjectWrite = { ok: true; userId: string; projectId: string } | { ok: false; reason: string };
export async function requireProjectWrite(slug: string): Promise<ProjectWrite> {
  const { userId, projectId } = await requireProjectOwner(slug);
  const access = await projectAccess(projectId);
  return access.available ? { ok: true, userId, projectId } : { ok: false, reason: access.reason };
}
