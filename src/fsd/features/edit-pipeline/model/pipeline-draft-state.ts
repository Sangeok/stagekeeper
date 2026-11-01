import type { SavePipelineInput, SavePipelineResult } from "./pipeline-save-state";
import type { Definition } from "./rail-state";

export type PipelineSnapshot = { definition: Definition; version: number };
type RequestState =
  | { status: "idle" }
  | { status: "saving"; submitted: Pick<SavePipelineInput, "definition" | "expectedVersion"> }
  | { status: "stale" }
  | { status: "unknown" };
export type PipelineDraftState = {
  definition: Definition;
  baseline: PipelineSnapshot;
  latest: PipelineSnapshot;
  request: RequestState;
};

function copyDefinition(definition: Definition): Definition {
  return { ...definition, steps: [...definition.steps], gates: [...definition.gates] };
}

function sameDefinition(left: Definition, right: Definition): boolean {
  return JSON.stringify(left.steps) === JSON.stringify(right.steps)
    && JSON.stringify(left.gates) === JSON.stringify(right.gates)
    && (left.selectionPolicy ?? null) === (right.selectionPolicy ?? null);
}

export function createPipelineDraft(snapshot: PipelineSnapshot): PipelineDraftState {
  const baseline = { version: snapshot.version, definition: copyDefinition(snapshot.definition) };
  return { definition: copyDefinition(snapshot.definition), baseline, latest: baseline, request: { status: "idle" } };
}

export function isPipelineDirty(state: PipelineDraftState): boolean {
  return !sameDefinition(state.definition, state.baseline.definition);
}

function reconcileLatest(state: PipelineDraftState): PipelineDraftState {
  if (state.request.status !== "idle") return state;
  if (isPipelineDirty(state)) {
    return state.latest.version > state.baseline.version
      ? { ...state, request: { status: "stale" } }
      : state;
  }
  return { ...state, definition: copyDefinition(state.latest.definition), baseline: state.latest };
}

export function receivePipelineSnapshot(state: PipelineDraftState, snapshot: PipelineSnapshot): PipelineDraftState {
  if (snapshot.version < state.latest.version || snapshot.version < state.baseline.version) return state;
  if (snapshot.version === state.latest.version) {
    if (snapshot.version !== 0 || sameDefinition(snapshot.definition, state.latest.definition)) return state;
  }
  return reconcileLatest({ ...state, latest: { version: snapshot.version, definition: copyDefinition(snapshot.definition) } });
}

export function editPipelineDraft(state: PipelineDraftState, definition: Definition): PipelineDraftState {
  if (state.request.status === "saving") return state;
  return reconcileLatest({ ...state, definition: copyDefinition(definition) });
}

export function beginPipelineSave(state: PipelineDraftState): PipelineDraftState {
  if (state.request.status !== "idle" || !isPipelineDirty(state)) return state;
  return {
    ...state,
    request: { status: "saving", submitted: { definition: copyDefinition(state.definition), expectedVersion: state.baseline.version } },
  };
}

export function finishPipelineSave(state: PipelineDraftState, result: SavePipelineResult | { status: "unknown" }): PipelineDraftState {
  if (state.request.status !== "saving") return state;
  switch (result.status) {
    case "success": {
      const baseline = { definition: copyDefinition(state.request.submitted.definition), version: result.version };
      const latest = state.latest.version > baseline.version ? state.latest : baseline;
      return reconcileLatest({ definition: copyDefinition(baseline.definition), baseline, latest, request: { status: "idle" } });
    }
    case "error":
      return reconcileLatest({ ...state, request: { status: "idle" } });
    case "stale":
    case "unknown":
      return { ...state, request: { status: result.status } };
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

export function discardPipelineDraft(state: PipelineDraftState): PipelineDraftState {
  return state.request.status === "idle" ? createPipelineDraft(state.latest) : state;
}
