import { loadProjectSelection, selectProject } from "../api/select-project-for-use.server";
import { availabilityLabel, selectionControlKey } from "../model/select-project-state";
import { UseProjectControl } from "./use-project-control";

export async function LockedProjectBanner({ userId, projectId, reason }: { userId: string; projectId: string; reason: string }) {
  const selection = await loadProjectSelection(userId);
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-rule bg-field px-3.5 py-2 text-sm">
      <p>{reason}</p>
      <p>{availabilityLabel(selection)}</p>
      <UseProjectControl key={selectionControlKey(projectId, selection)} targetId={projectId} model={selection} action={selectProject} />
    </section>
  );
}
