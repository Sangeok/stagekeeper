"use server";
import { revalidatePath } from "next/cache";
import { newToken } from "@harness/core/token.mjs";
import { parseTokenExpiry } from "@harness/core/token-validity.mjs";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { userTokensPath } from "@/fsd/shared/routes/user-tokens";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { renameUserToken as renameUserTokenIn } from "@/server/tokens/api";

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
