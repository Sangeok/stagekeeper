import { isRef, validateDefinition } from "@harness/app-core/pipeline/pipeline.mjs";

import type { GraphInput } from "@harness/app-core/pipeline/pipeline.mjs";

export type PipelineInput = { status: string; active: boolean; hasPlan: boolean; hasValidation: boolean; hasImplementation: boolean };

export function validateExecutionGraph(graph: GraphInput, plan: string): { ok: true } | { ok: false; reason: string } {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.gates)) return { ok: false, reason: "Pipeline steps are missing." };
  if (graph.nodes.some(isRef)) return { ok: false, reason: "Expand included pipelines before starting." };
  return validateDefinition({ steps: graph.nodes, gates: graph.gates }, plan);
}

export function pipelineInputReason(graph: GraphInput, target: PipelineInput): string | null {
  const nodes = graph.nodes;
  if (target.status === "on_hold") return "Resume this work before starting a pipeline.";
  if (target.active) return "This work already has a running pipeline. Finish it before starting another.";
  if (nodes.includes("plan")) {
    if (!nodes.includes("implement") && nodes.some(node => ["impl-verify", "qa", "accept"].includes(node))) return "Add Implement before checking newly planned work, or run the checks separately on an existing implementation.";
    return target.status === "proposed" ? null : "Planning starts on new work. Choose a backlog item.";
  }
  if (nodes.some(node => ["verify", "implement"].includes(node))) {
    if (target.status !== "in_review" || !target.hasPlan) return "Choose work with a submitted plan awaiting implementation.";
    if (nodes.includes("implement") && !nodes.includes("verify") && !target.hasValidation) return "This work needs a verified plan before implementation can start.";
  }
  if (nodes.some(node => ["impl-verify", "qa", "accept"].includes(node)) && !nodes.includes("implement")) {
    if (target.status !== "done" || !target.hasImplementation) return "Choose work with a completed implementation to check.";
    if (!target.hasPlan) return "The implementation needs its original plan before it can be checked.";
  }
  return null;
}
