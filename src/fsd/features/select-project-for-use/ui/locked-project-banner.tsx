import { loadProjectSelection, selectProject } from "../api/select-project-for-use.server";
import { availabilityLabel, selectionControlKey } from "../model/select-project-state";
import { UseProjectControl } from "./use-project-control";

// 잠긴 프로젝트의 배너 한 줄. 선택 모델은 계정 전체를 읽으므로 배너를 그릴 때만 읽는다 —
// 레이아웃은 잠겼을 때만 이 컴포넌트를 그린다. 화면은 읽기 상태로 남고 쓰기만 requireProjectWrite가 막는다.
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
