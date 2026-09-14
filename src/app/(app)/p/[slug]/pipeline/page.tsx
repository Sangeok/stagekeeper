import { allowsPipelineEdit } from "@harness/core/pipeline.mjs";
import { savePipeline } from "@/fsd/features/edit-pipeline/index.server";
import { ProjectPipelinePage } from "@/fsd/pages/project-pipeline";
import { requireProjectOwner } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { loadCurrentVersionView } from "@/server/pipeline/run";

export default async function Page({ params }: PageProps<"/p/[slug]/pipeline">) {
  const { slug } = await params;
  const { projectId } = await requireProjectOwner(slug);

  const [version, access, workspaces] = await Promise.all([
    loadCurrentVersionView(prisma, projectId),
    projectAccess(projectId),
    prisma.workspace.findMany({ where: { projectId }, orderBy: { wsId: "asc" }, select: { agent: true } }),
  ]);

  return (
    <ProjectPipelinePage
      graph={version.graph}
      version={version.persisted?.version ?? null}
      savedAt={version.persisted?.createdAt ?? null}
      now={new Date()}
      plan={access.plan}
      roster={workspaces.map((w) => w.agent)}
      editable={access.available && allowsPipelineEdit(access.plan)}
      unavailableReason={access.available ? undefined : access.reason}
      save={savePipeline.bind(null, slug)}
    />
  );
}
