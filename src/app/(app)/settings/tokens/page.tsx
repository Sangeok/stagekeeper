import { issueUserToken, revokeUserToken, renameUserToken } from "@/fsd/features/manage-user-token/index.server";
import { UserTokensPage } from "@/fsd/pages/user-tokens/index.server";
import { AppHeader } from "@/fsd/widgets/app-header";
import { loadHeaderUser } from "@/fsd/widgets/app-header/index.server";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { mcpUrl } from "@/server/public-url";

export default async function Page() {
  const { userId } = await requireUser();
  const [user, tokens] = await Promise.all([
    loadHeaderUser(userId),
    prisma.userToken.findMany({
      where: { userId },
      select: { id: true, label: true, createdAt: true, revokedAt: true, expiresAt: true, lastUsedAt: true, usageTrackingStartedAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <>
      <AppHeader login={user.login} plan={user.plan} />
      <UserTokensPage
        mcpUrl={mcpUrl()}
        tokens={tokens}
        issue={issueUserToken}
        revoke={revokeUserToken}
        rename={renameUserToken}
        at={new Date()}
      />
    </>
  );
}
