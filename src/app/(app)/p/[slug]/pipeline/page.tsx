import { allowsPipelineEdit } from "@harness/core/pipeline.mjs";
import { savePipeline } from "@/fsd/features/edit-pipeline/index.server";
import { ProjectPipelinePage } from "@/fsd/pages/project-pipeline";
import { requireProjectOwner } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/entitlement";
import { loadProjectRoster } from "@/server/project";
import { loadCurrentVersionView } from "@/server/pipeline/run";

export default async function Page({ params }: PageProps<"/p/[slug]/pipeline">) {
  const { slug } = await params;
  const { projectId } = await requireProjectOwner(slug);

  const [version, access, roster] = await Promise.all([
    loadCurrentVersionView(prisma, projectId),
    projectAccess(projectId),
    loadProjectRoster(prisma, projectId),
  ]);

  return (
    <ProjectPipelinePage
      graph={version.graph}
      format={version.format}
      saved={version.persisted ? { version: version.persisted.version, at: version.persisted.createdAt } : undefined}
      now={new Date()}
      plan={access.plan}
      roster={roster}
      editable={access.available && allowsPipelineEdit(access.plan)}
      unavailableReason={access.available ? undefined : access.reason}
      save={savePipeline.bind(null, slug)}
    />
  );
}
