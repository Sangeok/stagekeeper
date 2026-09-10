import { sequence } from "@harness/core/pipeline.mjs";
import { gateLabel, nodeLabel } from "@/fsd/entities/pipeline";
import { PipelineRail, type Graph } from "@/fsd/features/edit-pipeline";
import type { ActionResult } from "@/fsd/shared/api/result";
export function ProjectPipelinePage({ graph, version, plan, editable, save }: { graph: Graph; version: number; plan: string; editable: boolean; save: (g: Graph) => Promise<ActionResult<void>> }) {
  return <section><h1>Pipeline</h1><p>Version {version}</p><PipelineRail graph={graph} plan={plan} editable={editable} save={save} />
    <details><summary>Read as text</summary><ol>{(sequence(graph) as string[]).map((id) => <li key={id}>{id.startsWith("before-") ? gateLabel(id) : nodeLabel(id)}</li>)}</ol></details></section>;
}
