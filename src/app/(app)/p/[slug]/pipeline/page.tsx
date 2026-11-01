import { allowsPipelineEdit } from "@harness/core/pipeline/pipeline.mjs";
import { savePipeline, archivePipelineAction, renamePipelineAction, setDefaultPipelineAction, setPipelineRuleAction, setAutomaticPickAction, prepareRunAction, startRunAction, startProjectRunAction, stopProjectRunAction, approveProjectGateAction } from "@/fsd/features/edit-pipeline/index.server";
import { ProjectPipelinePage } from "@/fsd/pages/project-pipeline";
import { requireProjectOwner } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { projectAccess } from "@/server/projects/api.server";
import { loadProjectRoster } from "@/server/projects/api";
import { loadPipelinesView } from "@/server/pipeline/api";

export default async function Page({ params, searchParams }: PageProps<"/p/[slug]/pipeline">) {
  const { slug } = await params;
  const { work } = await searchParams;
  const { projectId } = await requireProjectOwner(slug);

  const [view, access, roster] = await Promise.all([
    loadPipelinesView(prisma, projectId),
    projectAccess(projectId),
    loadProjectRoster(prisma, projectId),
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
      canRun={access.available}
      targetKey={typeof work === "string" && work.length <= 100 ? work : undefined}
      runActions={{ prepare: prepareRunAction.bind(null, slug), start: startRunAction.bind(null, slug), startProject: startProjectRunAction.bind(null, slug), stopProject: stopProjectRunAction.bind(null, slug), approveProjectGate: approveProjectGateAction.bind(null, slug) }}
    />
  );
}
