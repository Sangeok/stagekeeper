import type { Graph } from "./rail-state";

export type SavePipelineInput = { graph: Graph; expectedVersion: number };
export type SavePipelineResult =
  | { status: "success"; version: number }
  | { status: "stale" }
  | { status: "error"; reason: string };

export const PIPELINE_STALE = "The pipeline changed. Your draft is still here. Discard changes and reload to edit the latest version.";
export const PIPELINE_UNKNOWN = "Couldn't confirm whether the pipeline was saved. Your draft is still here. Discard changes and reload to check the latest version.";

export function isSavePipelineInput(value: unknown): value is SavePipelineInput {
  if (typeof value !== "object" || value === null || !("graph" in value) || !("expectedVersion" in value)) return false;
  const { graph, expectedVersion } = value;
  return typeof expectedVersion === "number" && Number.isInteger(expectedVersion)
    && expectedVersion >= 0 && expectedVersion <= 2_147_483_646
    && typeof graph === "object" && graph !== null && "nodes" in graph && "gates" in graph
    && Array.isArray(graph.nodes) && graph.nodes.every(node => typeof node === "string")
    && Array.isArray(graph.gates) && graph.gates.every(gate => typeof gate === "string");
}
