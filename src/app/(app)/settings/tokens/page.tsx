import { issueUserToken, revokeUserToken } from "@/fsd/features/manage-user-token/index.server";
import { UserTokensPage } from "@/fsd/pages/user-tokens";
import { AppHeader } from "@/fsd/widgets/app-header";
import { loadHeaderUser } from "@/fsd/widgets/app-header/index.server";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { mcpUrl } from "@/server/public-url";

// 계정 단위 화면이라 프로젝트 탭 셸을 쓰지 않고 머리만 얹는다(/billing과 같은 모양).
// 인가는 requireUser 하나다 — 이 자격에는 대조할 프로젝트가 없다.
export default async function Page() {
  const { userId } = await requireUser();
  const [user, tokens] = await Promise.all([
    loadHeaderUser(userId),
    prisma.userToken.findMany({
      where: { userId },
      select: { id: true, label: true, createdAt: true, revokedAt: true },
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
      />
    </>
  );
}
