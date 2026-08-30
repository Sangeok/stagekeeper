// guard.ts — DAL. page·서버 액션이 각자 부른다(레이아웃 한 번으로 대신하지 않는다 — T1.10 주석).
import "server-only";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
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
