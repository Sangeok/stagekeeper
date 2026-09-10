import { allowsPipelineEdit } from "@harness/core/pipeline.mjs";
import { savePipeline } from "@/fsd/features/edit-pipeline/index.server";
import { ProjectPipelinePage } from "@/fsd/pages/project-pipeline";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForProject } from "@/server/entitlement";
import { currentVersion } from "@/server/pipeline/run";
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);
  const [version, plan] = await Promise.all([currentVersion(prisma, projectId), planForProject(projectId)]);
  return <ProjectPipelinePage graph={{ nodes: version.nodes, gates: version.gates }} version={version.version} plan={plan} editable={allowsPipelineEdit(plan)} save={savePipeline.bind(null, slug)} />;
}
