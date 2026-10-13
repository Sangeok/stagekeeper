import type { Graph } from "./rail-state";

export type SavePipelineInput = { graph: Graph; expectedVersion: number };
export type SavePipelineResult =
  | { status: "success"; version: number }
  | { status: "stale" }
  | { status: "error"; reason: string };

export const PIPELINE_STALE = "The pipeline changed. Your draft is still here. Discard changes and reload to edit the latest version.";
export const PIPELINE_UNKNOWN = "Couldn't confirm whether the pipeline was saved. Your draft is still here. Discard changes and reload to check the latest version.";
