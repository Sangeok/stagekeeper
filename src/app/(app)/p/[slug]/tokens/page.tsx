import { ProjectTokensPage } from "@/fsd/pages/project-tokens";
import { issueToken, revokeToken } from "@/fsd/features/manage-token/index.server";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { mcpUrl } from "@/server/public-url";

export default async function Page({ params }: PageProps<"/p/[slug]/tokens">) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);
  const tokens = await prisma.projectToken.findMany({
    where: { projectId },
    select: { id: true, label: true, createdAt: true, revokedAt: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <ProjectTokensPage
      mcpUrl={mcpUrl()}
      tokens={tokens}
      issue={issueToken.bind(null, slug)}
      revoke={revokeToken.bind(null, slug)}
    />
  );
}
