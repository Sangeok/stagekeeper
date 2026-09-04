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

// 비멤버는 404 — 프로젝트의 존재를 드러내지 않는다(ApcH guard 관례).
export async function requireMember(slug: string): Promise<{ userId: string; projectId: string }> {
  const { userId } = await requireUser();
  const member = await prisma.projectMember.findFirst({ where: { userId, project: { slug } }, select: { projectId: true } });
  if (!member) notFound();
  return { userId, projectId: member.projectId };
}

// 쓰기 액션의 DAL. 잠긴 프로젝트는 **리다이렉트하지 않고 사유를 돌려준다** — 화면은 읽기 상태로
// 남아야 하고(사용자는 자기 데이터를 계속 본다), 폼은 그 문장을 오류로 띄운다.
// 읽기 경로는 requireMember 그대로다 — 잠금은 쓰기만 막는다.
export type ProjectWrite = { ok: true; userId: string; projectId: string } | { ok: false; reason: string };
export async function requireProjectWrite(slug: string): Promise<ProjectWrite> {
  const { userId, projectId } = await requireMember(slug);
  const access = await projectAccess(projectId);
  return access.locked ? { ok: false, reason: access.reason } : { ok: true, userId, projectId };
}
