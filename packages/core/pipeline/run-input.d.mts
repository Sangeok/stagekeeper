import type { GraphInput } from "./pipeline.mjs";
export type PipelineInput = { status: string; active: boolean; hasPlan: boolean; hasValidation: boolean; hasImplementation: boolean };
export function validateExecutionGraph(graph: GraphInput, plan: string): { ok: true } | { ok: false; reason: string };
export function pipelineInputReason(graph: GraphInput, target: PipelineInput): string | null;
