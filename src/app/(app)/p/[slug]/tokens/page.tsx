import { allowsSessionApprovals } from "@harness/core/entitlement.mjs";
import { ProjectTokensPage } from "@/fsd/pages/project-tokens";
import { issueOwnerToken, issueToken, revokeOwnerToken, revokeToken } from "@/fsd/features/manage-token/index.server";
import { requireProjectOwner } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { mcpUrl, ownerMcpUrl, serverUrl } from "@/server/public-url";

export default async function Page({ params }: PageProps<"/p/[slug]/tokens">) {
  const { slug } = await params;
  const { projectId, userId } = await requireProjectOwner(slug);
  const select = { id: true, label: true, createdAt: true, revokedAt: true };
  const [tokens, ownerTokens, access] = await Promise.all([
    prisma.projectToken.findMany({ where: { projectId }, select, orderBy: { createdAt: "desc" } }),
    // 소유자 토큰은 보는 사람 자신의 것만 — 다른 사용자의 자격은 목록에도 오르지 않는다.
    prisma.ownerToken.findMany({ where: { projectId, userId }, select, orderBy: { createdAt: "desc" } }),
    projectAccess(projectId),
  ]);
  return (
    <ProjectTokensPage
      mcpUrl={mcpUrl()}
      serverUrl={serverUrl()}
      tokens={tokens}
      issue={issueToken.bind(null, slug)}
      revoke={revokeToken.bind(null, slug)}
      ownerMcpUrl={ownerMcpUrl()}
      ownerTokens={ownerTokens}
      ownerAllowed={access.available && allowsSessionApprovals(access.plan)}
      issueAllowed={access.available}
      issueOwner={issueOwnerToken.bind(null, slug)}
      revokeOwner={revokeOwnerToken.bind(null, slug)}
    />
  );
}
