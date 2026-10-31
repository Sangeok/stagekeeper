import { AutomaticScoutControl, PipelineList, type PipelineSnapshot, type PipelineSettingsActions, type SavePipelineAction, type SaveAutomaticScoutAction, type PipelineRunActions } from "@/fsd/features/edit-pipeline";

type Props = {
  projectId: string; pipelines: PipelineSnapshot[]; rules: Record<string, string>; autoProposeEnabled: boolean;
  now: Date; plan: string; roster: string[]; editable: boolean; unavailableReason?: string;
  save: SavePipelineAction; actions: PipelineSettingsActions;
  runActions?: PipelineRunActions; canRun?: boolean; targetKey?: string;
  autoScoutEnabled: boolean; canChangeAutoScout: boolean; saveAutoScout: SaveAutomaticScoutAction;
};
export function ProjectPipelinePage({ autoScoutEnabled, canChangeAutoScout, saveAutoScout, ...props }: Props) {
  return <>
    <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
    <PipelineList key={props.projectId} {...props} automationControls={<AutomaticScoutControl enabled={autoScoutEnabled} writable={canChangeAutoScout} save={saveAutoScout} unavailableReason={props.unavailableReason} />} />
  </>;
}
