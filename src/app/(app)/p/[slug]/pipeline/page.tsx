import { allowsPipelineEdit } from "@harness/core/pipeline.mjs";
import { saveAutomaticScout, savePipeline, archivePipelineAction, renamePipelineAction, setDefaultPipelineAction, setPipelineRuleAction, setAutomaticPickAction } from "@/fsd/features/edit-pipeline/index.server";
import { ProjectPipelinePage } from "@/fsd/pages/project-pipeline";
import { requireProjectOwner } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/projects/api.server";
import { loadProjectRoster } from "@/server/projects/api";
import { loadPipelinesView } from "@/server/pipeline/api";

export default async function Page({ params }: PageProps<"/p/[slug]/pipeline">) {
  const { slug } = await params;
  const { projectId } = await requireProjectOwner(slug);

  const [view, access, roster, project] = await Promise.all([
    loadPipelinesView(prisma, projectId),
    projectAccess(projectId),
    loadProjectRoster(prisma, projectId),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { autoScoutEnabled: true } }),
  ]);

  return (
    <ProjectPipelinePage
      projectId={projectId}
      {...view}
      actions={{ archive: archivePipelineAction.bind(null, slug), rename: renamePipelineAction.bind(null, slug), setDefault: setDefaultPipelineAction.bind(null, slug), setRule: setPipelineRuleAction.bind(null, slug), setAutomaticPick: setAutomaticPickAction.bind(null, slug) }}
      now={new Date()}
      plan={access.plan}
      roster={roster}
      editable={access.available && allowsPipelineEdit(access.plan)}
      unavailableReason={access.available ? undefined : access.reason}
      save={savePipeline.bind(null, slug)}
      autoScoutEnabled={project.autoScoutEnabled}
      canChangeAutoScout={access.available}
      saveAutoScout={saveAutomaticScout.bind(null, slug)}
    />
  );
}
