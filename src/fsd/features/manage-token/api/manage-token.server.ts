"use server";
import { revalidatePath } from "next/cache";
import { allowsSessionApprovals } from "@harness/core/entitlement.mjs";
import { newToken } from "@harness/core/token.mjs";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireMember, requireProjectWrite } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForProject } from "@/server/entitlement";

// 평문은 이 반환값에만 존재한다. 서비스는 sha256 해시만 저장한다.
// 실패는 review-gate와 같은 ActionResult로 돌려준다 — 같은 layer에서 실패 규약이 두 벌이 되지 않게.
export async function issueToken(slug: string, label: string): Promise<ActionResult<{ token: string }>> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(w.reason);
  const { projectId } = w;
  const { plain, hash } = newToken();
  await prisma.projectToken.create({ data: { projectId, hash, label: label.trim() || "token" } });
  revalidatePath(projectPath(slug, "/tokens"));
  return success({ token: plain });
}

// 폼 action으로 직접 쓰여 반환값을 버린다 — 그래서 ActionResult가 아니다.
export async function revokeToken(slug: string, tokenId: string): Promise<void> {
  const { projectId } = await requireMember(slug);
  await prisma.projectToken.updateMany({ where: { id: tokenId, projectId }, data: { revokedAt: new Date() } });
  revalidatePath(projectPath(slug, "/tokens"));
}

// 소유자 토큰은 **발급한 사람**에게 묶인다 — 게이트 이벤트의 actorId가 이 userId다. 플랜 판정은 gate_approve와 같은 함수.
export async function issueOwnerToken(slug: string, label: string): Promise<ActionResult<{ token: string }>> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return failure(w.reason);
  const { projectId, userId } = w;
  if (!allowsSessionApprovals(await planForProject(projectId))) return failure("Owner tokens open on Pro. Approve in the Inbox for now.");
  const { plain, hash } = newToken("owner");
  await prisma.ownerToken.create({ data: { projectId, userId, hash, label: label.trim() || "session" } });
  revalidatePath(projectPath(slug, "/tokens"));
  return success({ token: plain });
}

// 자기 것만 폐기한다 — where에 userId가 들어간다.
export async function revokeOwnerToken(slug: string, tokenId: string): Promise<void> {
  const { projectId, userId } = await requireMember(slug);
  await prisma.ownerToken.updateMany({ where: { id: tokenId, projectId, userId }, data: { revokedAt: new Date() } });
  revalidatePath(projectPath(slug, "/tokens"));
}
