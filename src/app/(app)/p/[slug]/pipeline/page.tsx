import { allowsPipelineEdit } from "@harness/core/pipeline.mjs";
import { savePipeline } from "@/fsd/features/edit-pipeline/index.server";
import { ProjectPipelinePage } from "@/fsd/pages/project-pipeline";
import { requireMember } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { planForProject } from "@/server/entitlement";
import { currentVersion } from "@/server/pipeline/run";

export default async function Page({ params }: PageProps<"/p/[slug]/pipeline">) {
  const { slug } = await params;
  const { projectId } = await requireMember(slug);

  // 현재 버전은 없으면 여기서 물질화된다 — 첫 방문이 곧 version 1이다(§C.1).
  const [version, plan, workspaces] = await Promise.all([
    currentVersion(prisma, projectId),
    planForProject(projectId),
    prisma.workspace.findMany({ where: { projectId }, orderBy: { wsId: "asc" }, select: { agent: true } }),
  ]);

  return (
    <ProjectPipelinePage
      graph={{ nodes: version.nodes, gates: version.gates }}
      version={version.version}
      savedAt={version.createdAt}
      now={new Date()}
      plan={plan}
      roster={workspaces.map((w) => w.agent)}
      editable={allowsPipelineEdit(plan)}
      save={savePipeline.bind(null, slug)}
    />
  );
}
