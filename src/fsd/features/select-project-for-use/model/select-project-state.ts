import type { Plan } from "@harness/core/plans/entitlement.mjs";
import { countNoun } from "@/fsd/shared/lib/count-noun";
import type { SelectProjectInput } from "./select-project-input";

export type ProjectChoice ={ id: string; name: string; available: boolean; openItems: number; openRuns: number };
export type ProjectSelectionModel = { plan: Plan; limit: number | null; version: number; availableCount: number; projects: ProjectChoice[] };
export type SelectProjectState = { status: "success" } | { status: "stale" } | { status: "error"; reason: string };
export type SelectProjectAction = (input: SelectProjectInput) => Promise<SelectProjectState>;
export const STALE_SELECTION_MESSAGE = "Your project list changed. Review the latest selection and try again.";

export function selectionIsFull(model: ProjectSelectionModel): boolean {
  return model.limit !== null && model.projects.filter((p) => p.available).length >= model.limit;
}

export function availabilityLabel(model: { availableCount: number; limit: number | null }): string {
  return model.limit === null ? `${model.availableCount} available · unlimited` : `${model.availableCount} / ${model.limit} available`;
}

export function replacementSummary(project: Pick<ProjectChoice, "name" | "openItems" | "openRuns">): string {
  return `${project.name} will no longer be selected. ${countNoun(project.openItems, "open board item")} · ${countNoun(project.openRuns, "open agent run")}.`;
}

export function selectionControlKey(targetId: string, model: ProjectSelectionModel): string {
  return `selection:${targetId}:${model.version}:${model.plan}`;
}
