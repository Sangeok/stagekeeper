"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { projectPath } from "@/fsd/shared/routes/project";
import { requireProjectOwner } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { issueProjectToken, issueProjectOwnerToken } from "@/server/project-token";
import { renameProjectToken } from "@/server/token-management-query";

// 평문은 이 반환값에만 존재한다. 서비스는 sha256 해시만 저장한다.
// 실패는 review-gate와 같은 ActionResult로 돌려준다 — 같은 layer에서 실패 규약이 두 벌이 되지 않게.
export async function issueToken(slug: string, label: string, expiresAt: string | null = null): Promise<ActionResult<{ token: string }>> {
  const { projectId, userId } = await requireProjectOwner(slug);
  const result = await issueProjectToken({ projectId, userId, label, expiresAt });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug, "/tokens"));
  return success(result.item);
}

// 폼 action으로 직접 쓰여 반환값을 버린다 — 그래서 ActionResult가 아니다.
export async function revokeToken(slug: string, tokenId: string): Promise<void> {
  const { projectId } = await requireProjectOwner(slug);
  await prisma.projectToken.updateMany({ where: { id: tokenId, projectId }, data: { revokedAt: new Date() } });
  revalidatePath(projectPath(slug, "/tokens"));
}

// 소유자 토큰은 **발급한 사람**에게 묶인다 — 게이트 이벤트의 actorId가 이 userId다. 플랜 판정은 gate_approve와 같은 함수.
export async function issueOwnerToken(slug: string, label: string, expiresAt: string | null = null): Promise<ActionResult<{ token: string }>> {
  const { projectId, userId } = await requireProjectOwner(slug);
  const result = await issueProjectOwnerToken({ projectId, userId, label, expiresAt });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug, "/tokens"));
  return success(result.item);
}

// 자기 것만 폐기한다 — where에 userId가 들어간다.
export async function revokeOwnerToken(slug: string, tokenId: string): Promise<void> {
  const { projectId, userId } = await requireProjectOwner(slug);
  await prisma.ownerToken.updateMany({ where: { id: tokenId, projectId, userId }, data: { revokedAt: new Date() } });
  revalidatePath(projectPath(slug, "/tokens"));
}

export async function renameToken(slug: string, tokenId: string, label: string): Promise<ActionResult<null>> {
  const { projectId, userId } = await requireProjectOwner(slug);
  const result = await renameProjectToken(prisma, { userId, projectId, tokenId, label, kind: "agent" });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug, "/tokens"));
  return success(null);
}

export async function renameOwnerToken(slug: string, tokenId: string, label: string): Promise<ActionResult<null>> {
  const { projectId, userId } = await requireProjectOwner(slug);
  const result = await renameProjectToken(prisma, { userId, projectId, tokenId, label, kind: "owner" });
  if (!result.ok) return failure(result.reason);
  revalidatePath(projectPath(slug, "/tokens"));
  return success(null);
}
