import type { SavePipelineInput, SavePipelineResult } from "./pipeline-save-state";
import type { Graph } from "./rail-state";

export type PipelineSnapshot = { graph: Graph; version: number };
type RequestState =
  | { status: "idle" }
  | { status: "saving"; submitted: SavePipelineInput }
  | { status: "stale" }
  | { status: "unknown" };
export type PipelineDraftState = {
  graph: Graph;
  baseline: PipelineSnapshot;
  latest: PipelineSnapshot;
  request: RequestState;
};

function copyGraph(graph: Graph): Graph {
  return { nodes: [...graph.nodes], gates: [...graph.gates] };
}

function sameGraph(left: Graph, right: Graph): boolean {
  return JSON.stringify(left.nodes) === JSON.stringify(right.nodes)
    && JSON.stringify(left.gates) === JSON.stringify(right.gates);
}

export function createPipelineDraft(snapshot: PipelineSnapshot): PipelineDraftState {
  const baseline = { version: snapshot.version, graph: copyGraph(snapshot.graph) };
  return { graph: copyGraph(snapshot.graph), baseline, latest: baseline, request: { status: "idle" } };
}

export function isPipelineDirty(state: PipelineDraftState): boolean {
  return !sameGraph(state.graph, state.baseline.graph);
}

function reconcileLatest(state: PipelineDraftState): PipelineDraftState {
  if (state.request.status !== "idle") return state;
  if (isPipelineDirty(state)) {
    return state.latest.version > state.baseline.version
      ? { ...state, request: { status: "stale" } }
      : state;
  }
  return { ...state, graph: copyGraph(state.latest.graph), baseline: state.latest };
}

export function receivePipelineSnapshot(state: PipelineDraftState, snapshot: PipelineSnapshot): PipelineDraftState {
  if (snapshot.version < state.latest.version || snapshot.version < state.baseline.version) return state;
  if (snapshot.version === state.latest.version) {
    // Persisted versions are immutable. Only the unsaved default can change with the plan.
    if (snapshot.version !== 0 || sameGraph(snapshot.graph, state.latest.graph)) return state;
  }
  return reconcileLatest({ ...state, latest: { version: snapshot.version, graph: copyGraph(snapshot.graph) } });
}

export function editPipelineDraft(state: PipelineDraftState, graph: Graph): PipelineDraftState {
  if (state.request.status === "saving") return state;
  return reconcileLatest({ ...state, graph: copyGraph(graph) });
}

export function beginPipelineSave(state: PipelineDraftState): PipelineDraftState {
  if (state.request.status !== "idle" || !isPipelineDirty(state)) return state;
  return {
    ...state,
    request: { status: "saving", submitted: { graph: copyGraph(state.graph), expectedVersion: state.baseline.version } },
  };
}

export function finishPipelineSave(state: PipelineDraftState, result: SavePipelineResult | { status: "unknown" }): PipelineDraftState {
  if (state.request.status !== "saving") return state;
  switch (result.status) {
    case "success": {
      const baseline = { graph: copyGraph(state.request.submitted.graph), version: result.version };
      const latest = state.latest.version > baseline.version ? state.latest : baseline;
      return reconcileLatest({ graph: copyGraph(baseline.graph), baseline, latest, request: { status: "idle" } });
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
  // Recovery requires a fresh route read, not a locally observed success guess.
  return state.request.status === "idle" ? createPipelineDraft(state.latest) : state;
}
