import { expand } from "@harness/core/pipeline/pipeline.mjs";
import { nodeLabel } from "@/fsd/entities/pipeline";
import type { PipelineSnapshot } from "./rail-state";

export type PipelineCatalogEntry = { id: string; name: string; steps: string[]; summary: string };

export function catalogEntries(pipelines: PipelineSnapshot[]): PipelineCatalogEntry[] {
  const definitions = Object.fromEntries(pipelines.map(pipeline => [pipeline.id, pipeline.definition]));
  return pipelines.map(pipeline => {
    const expanded = expand(pipeline.id, definitions);
    const steps = expanded.ok ? expanded.graph.nodes.map(nodeLabel) : [];
    const summary = expanded.ok ? steps.slice(0, 4).join(" → ") + (steps.length > 4 ? ` · +${steps.length - 4} more` : "") : "Steps unavailable";
    return { id: pipeline.id, name: pipeline.name, steps, summary: summary || "No steps yet" };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function filterPipelines(entries: PipelineCatalogEntry[], query: string): PipelineCatalogEntry[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter(entry => {
    const text = `${entry.name} ${entry.steps.join(" ")}`.toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
}
