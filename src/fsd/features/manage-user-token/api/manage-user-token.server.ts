"use server";
import { revalidatePath } from "next/cache";
import { newToken } from "@harness/core/token.mjs";
import { parseTokenExpiry } from "@harness/core/token-validity.mjs";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { userTokensPath } from "@/fsd/shared/routes/user-tokens";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { renameUserToken as renameUserTokenIn } from "@/server/token-management-query";

// 사용자 토큰(hu_)은 **사람에게만** 묶인다 — projectId도, 검사할 프로젝트 가용성도 없다.
// 그래서 manage-token.server.ts의 네 액션을 재사용할 수 없다: 그쪽은 requireProjectWrite(slug) →
// projectId → projectPath(slug)로 구조 자체가 프로젝트에 묶여 있다. 여기는 requireUser 하나다.
//
// 프로젝트 인가는 발급 시점이 아니라 **호출 시점**에 한다(tools.ts의 scope()가 호출마다
// ownerUserId를 대조한다) — 이 토큰은 "누구냐"만 말하기 때문이다.
//
// 평문은 이 반환값에만 존재한다. 서비스는 sha256 해시만 저장한다.
export async function issueUserToken(label: string, expiry: string | null = null): Promise<ActionResult<{ token: string }>> {
  const { userId } = await requireUser();
  if (typeof label !== "string") return failure("Enter a token name.");
  const at = new Date();
  let expiresAt: Date | null;
  try { expiresAt = parseTokenExpiry(expiry, at); }
  catch { return failure("Choose a future expiry in UTC, or leave it blank for no expiry."); }
  const { plain, hash } = newToken("user");
  await prisma.userToken.create({ data: { userId, hash, label: label.trim() || "token", usageTrackingStartedAt: at, expiresAt } });
  revalidatePath(userTokensPath());
  return success({ token: plain });
}

// 폼 action으로 직접 쓰여 반환값을 버린다 — 그래서 ActionResult가 아니다(revokeToken과 같은 모양).
// 자기 것만 폐기한다 — where에 userId가 들어간다.
export async function revokeUserToken(tokenId: string): Promise<void> {
  const { userId } = await requireUser();
  if (typeof tokenId !== "string" || !tokenId.trim()) throw new Error("Invalid token ID.");
  await prisma.userToken.updateMany({ where: { id: tokenId, userId }, data: { revokedAt: new Date() } });
  revalidatePath(userTokensPath());
}

export async function renameUserToken(tokenId: string, label: string): Promise<ActionResult<null>> {
  const { userId } = await requireUser();
  if (typeof tokenId !== "string" || !tokenId.trim()) return failure("Token not found.");
  const result = await renameUserTokenIn(prisma, { userId, tokenId, label });
  if (!result.ok) return failure(result.reason);
  revalidatePath(userTokensPath());
  return success(null);
}
