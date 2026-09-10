"use client";
import { useState } from "react";
import { toast } from "sonner";
import { gateLabel, nodeLabel } from "@/fsd/entities/pipeline";
import type { ActionResult } from "@/fsd/shared/api/result";
import { insertGate, type Graph } from "../model/rail-state";
export function PipelineRail({ graph, plan, editable, save }: { graph: Graph; plan: string; editable: boolean; save: (g: Graph) => Promise<ActionResult<void>> }) {
  const [state, setState] = useState(graph);
  return <div>{state.nodes.map((k) => <span key={k}>{nodeLabel(k)}</span>)}{state.gates.map((g) => <span key={g}>{gateLabel(g)}</span>)}
    <button disabled={!editable} onClick={() => { const r = insertGate(state, "before-verify", plan); if (r.ok) setState(r.graph); }}>+</button>
    <button onClick={async () => { const r = await save(state); toast(r.success ? "Pipeline saved" : r.error); }}>Save</button></div>;
}
