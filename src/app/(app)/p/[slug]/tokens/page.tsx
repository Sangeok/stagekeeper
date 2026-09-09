import { allowsSessionApprovals } from "@harness/core/entitlement.mjs";
import { ProjectTokensPage } from "@/fsd/pages/project-tokens";
import { issueOwnerToken, issueToken, revokeOwnerToken, revokeToken } from "@/fsd/features/manage-token/index.server";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForProject } from "@/server/entitlement";
import { mcpUrl, ownerMcpUrl } from "@/server/public-url";

export default async function Page({ params }: PageProps<"/p/[slug]/tokens">) {
  const { slug } = await params;
  const { projectId, userId } = await requireMember(slug);
  const select = { id: true, label: true, createdAt: true, revokedAt: true };
  const [tokens, ownerTokens, plan] = await Promise.all([
    prisma.projectToken.findMany({ where: { projectId }, select, orderBy: { createdAt: "desc" } }),
    // 소유자 토큰은 보는 사람 자신의 것만 — 다른 멤버의 자격은 목록에도 오르지 않는다.
    prisma.ownerToken.findMany({ where: { projectId, userId }, select, orderBy: { createdAt: "desc" } }),
    planForProject(projectId),
  ]);
  return (
    <ProjectTokensPage
      mcpUrl={mcpUrl()}
      tokens={tokens}
      issue={issueToken.bind(null, slug)}
      revoke={revokeToken.bind(null, slug)}
      ownerMcpUrl={ownerMcpUrl()}
      ownerTokens={ownerTokens}
      ownerAllowed={allowsSessionApprovals(plan)}
      issueOwner={issueOwnerToken.bind(null, slug)}
      revokeOwner={revokeOwnerToken.bind(null, slug)}
    />
  );
}
