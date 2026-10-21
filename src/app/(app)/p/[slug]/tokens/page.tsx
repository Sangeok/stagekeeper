import { allowsSessionApprovals } from "@harness/core/entitlement.mjs";
import { ProjectTokensPage } from "@/fsd/pages/project-tokens/index.server";
import { issueOwnerToken, issueToken, revokeOwnerToken, revokeToken, renameToken, renameOwnerToken } from "@/fsd/features/manage-token/index.server";
import { requireProjectOwner } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/projects/api.server";
import { mcpUrl, ownerMcpUrl } from "@/server/public-url";

export default async function Page({ params }: PageProps<"/p/[slug]/tokens">) {
  const { slug } = await params;
  const { projectId, userId } = await requireProjectOwner(slug);
  const select = { id: true, label: true, createdAt: true, revokedAt: true, expiresAt: true, lastUsedAt: true, usageTrackingStartedAt: true };
  const [tokens, ownerTokens, access] = await Promise.all([
    prisma.projectToken.findMany({ where: { projectId }, select, orderBy: { createdAt: "desc" } }),
    prisma.ownerToken.findMany({ where: { projectId, userId }, select, orderBy: { createdAt: "desc" } }),
    projectAccess(projectId),
  ]);
  return (
    <ProjectTokensPage
      mcpUrl={mcpUrl()}
      tokens={tokens}
      issue={issueToken.bind(null, slug)}
      revoke={revokeToken.bind(null, slug)}
      rename={renameToken.bind(null, slug)}
      ownerMcpUrl={ownerMcpUrl()}
      ownerTokens={ownerTokens}
      ownerAllowed={access.available && allowsSessionApprovals(access.plan)}
      issueAllowed={access.available}
      issueOwner={issueOwnerToken.bind(null, slug)}
      revokeOwner={revokeOwnerToken.bind(null, slug)}
      renameOwner={renameOwnerToken.bind(null, slug)}
      at={new Date()}
    />
  );
}
