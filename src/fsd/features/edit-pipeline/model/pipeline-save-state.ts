import type { Definition } from "@harness/core/pipeline/pipeline.mjs";

export type SavePipelineInput = { pipelineId: string | null; name?: string; definition: Definition; expectedVersion: number };
export type SavePipelineResult =
  | { status: "success"; pipelineId: string; version: number }
  | { status: "stale" }
  | { status: "error"; reason: string };

export const PIPELINE_STALE = "The pipeline changed. Your draft is still here. Discard changes and reload to edit the latest version.";
export const PIPELINE_UNKNOWN = "Couldn't confirm whether the pipeline was saved. Your draft is still here. Discard changes and reload to check the latest version.";
