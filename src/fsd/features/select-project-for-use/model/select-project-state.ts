export type ProjectChoice = { id: string; name: string; available: boolean; openItems: number; openRuns: number };
export type ProjectSelectionModel = { plan: "free" | "pro" | "max"; limit: number | null; version: number; availableCount: number; projects: ProjectChoice[] };
export type SelectProjectState = { status: "success" } | { status: "stale" } | { status: "error"; reason: string };
export type SelectProjectAction = (input: { targetProjectId: string; replacementProjectId?: string; expectedVersion: number }) => Promise<SelectProjectState>;
export const STALE_SELECTION_MESSAGE = "Your project list changed. Review the latest selection and try again.";

export function selectionIsFull(model: ProjectSelectionModel): boolean {
  return model.limit !== null && model.projects.filter((p) => p.available).length >= model.limit;
}

// 수량 한 줄 — 프로젝트 목록과 잠금 배너가 같은 문장을 쓴다(product-copy.md §10).
export function availabilityLabel(model: { availableCount: number; limit: number | null }): string {
  return model.limit === null ? `${model.availableCount} available · unlimited` : `${model.availableCount} / ${model.limit} available`;
}

export function selectionControlKey(targetId: string, model: ProjectSelectionModel): string {
  return `${targetId}:${model.version}:${model.plan}`;
}
