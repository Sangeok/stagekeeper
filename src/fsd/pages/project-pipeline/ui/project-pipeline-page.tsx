import { AutomaticScoutControl, PipelineList, type PipelineSnapshot, type PipelineSettingsActions, type SavePipelineAction, type SaveAutomaticScoutAction } from "@/fsd/features/edit-pipeline";

type Props = {
  projectId: string; pipelines: PipelineSnapshot[]; rules: Record<string, string>; autoProposeEnabled: boolean;
  now: Date; plan: string; roster: string[]; editable: boolean; unavailableReason?: string;
  save: SavePipelineAction; actions: PipelineSettingsActions;
  autoScoutEnabled: boolean; canChangeAutoScout: boolean; saveAutoScout: SaveAutomaticScoutAction;
};
export function ProjectPipelinePage({ autoScoutEnabled, canChangeAutoScout, saveAutoScout, ...props }: Props) {
  return <>
    <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
    <AutomaticScoutControl enabled={autoScoutEnabled} writable={canChangeAutoScout} save={saveAutoScout} unavailableReason={props.unavailableReason} />
    <PipelineList {...props} />
  </>;
}
