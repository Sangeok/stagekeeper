// Browser-only acceptance fixture. Real components, explicit controllable action
// responses and snapshots; never imported by an application route.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PipelineList } from "../../../src/fsd/features/edit-pipeline/ui/pipeline-list";
import { PipelineRail } from "../../../src/fsd/features/edit-pipeline/ui/pipeline-rail";
import { ChangePipelineControl } from "../../../src/fsd/features/change-item-pipeline/ui/change-pipeline-control";
import { ProposeButton } from "../../../src/fsd/features/propose-item/ui/propose-button";
import type { PipelineSnapshot } from "../../../src/fsd/features/edit-pipeline/model/rail-state";
import type { SavePipelineInput, SavePipelineResult } from "../../../src/fsd/features/edit-pipeline/model/pipeline-save-state";
import type { ActionResult } from "../../../src/fsd/shared/api/result";

type Outcome = "success" | "error" | "stale" | "unknown";
type Mode = "list" | "rail" | "change" | "propose";
const initial: PipelineSnapshot[] = [
  { id: "default", name: "Default", isDefault: true, saved: { version: 1, createdAt: new Date(0) }, definition: { steps: ["plan", "implement", "accept"], gates: ["before-plan"] }, runnable: { nodes: ["plan", "implement", "accept"], gates: ["before-plan"], format: "slots-v1" } },
  { id: "check", name: "Check", isDefault: false, saved: { version: 1, createdAt: new Date(0) }, definition: { steps: ["qa"], gates: ["before-qa"] }, runnable: null },
  { id: "delivery", name: "Delivery", isDefault: false, saved: { version: 1, createdAt: new Date(0) }, definition: { steps: ["plan", "implement", "pipeline:check", "accept"], gates: [] }, runnable: { nodes: ["plan", "implement", "qa", "accept"], gates: ["before-qa"], format: "slots-v1" } },
];
const fixture = {
  writes: [] as { kind: string; input: unknown }[], refreshes: 0,
  finish: (outcome: Outcome) => { void outcome; },
  update: (pipelines: PipelineSnapshot[]) => { void pipelines; },
  identity: (key: string) => { void key; },
  preset: (id: string) => { void id; },
  access: (editable: boolean) => { void editable; },
  plan: (plan: string) => { void plan; },
  mount: (mode: Mode, editable = true) => { void mode; void editable; },
  initial,
};
const root = createRoot(document.getElementById("root")!);
const router = { refresh() { fixture.refreshes++; } } as React.ContextType<typeof AppRouterContext>;
function pending<T>(kind: string, input: unknown, values: Record<Exclude<Outcome, "unknown">, T>) {
  fixture.writes.push({ kind, input });
  return new Promise<T>((resolve, reject) => { fixture.finish = outcome => outcome === "unknown" ? reject(new Error("response lost")) : resolve(values[outcome]); });
}
function Fixture({ mode, editable }: { mode: Mode; editable: boolean }) {
  const [pipelines, setPipelines] = useState(initial), [identity, setIdentity] = useState("ITEM-01"), [preset, setPreset] = useState("default");
  const [writable, setWritable] = useState(editable), [plan, setPlan] = useState(editable ? "pro" : "free");
  useEffect(() => { fixture.update = setPipelines; fixture.identity = setIdentity; fixture.preset = setPreset; fixture.access = setWritable; fixture.plan = setPlan; }, []);
  const save = (input: SavePipelineInput): Promise<SavePipelineResult> => pending("save", input, {
    success: { status: "success", pipelineId: input.pipelineId ?? "created", version: input.expectedVersion + 1 }, error: { status: "error", reason: "Rejected" }, stale: { status: "stale" },
  });
  const mutate = (kind: string, input: unknown): Promise<ActionResult<null>> => pending(kind, input, { success: { success: true, data: null }, error: { success: false, error: "Rejected" }, stale: { success: false, error: "The board changed. Refresh and try again." } });
  if (mode === "change") return <ChangePipelineControl key={identity} itemKey={identity} updatedAt={new Date(0).toISOString()} pipelines={[{ id: "delivery", name: "Delivery" }]} change={input => mutate("change", input)} />;
  if (mode === "propose") return <ProposeButton itemKey={identity} roster={["dev"]} preselected={preset} pipelines={pipelines.filter(row => row.runnable).map(({ id, name }) => ({ id, name }))} propose={input => pending("propose", input, { success: { success: true, data: undefined }, error: { success: false, error: "Rejected" }, stale: { success: false, error: "Pipeline not found.", resetPipeline: true } })} />;
  if (mode === "rail") {
    const parent = pipelines.find(row => row.id === "delivery")!;
    return <PipelineRail pipelineId={parent.id} definition={parent.definition} expectedVersion={parent.saved!.version} pipelines={pipelines} rules={{}} plan={plan} roster={["dev"]} editable={writable} save={save} />;
  }
  return <PipelineList projectId="p" pipelines={pipelines} rules={{ fix: "delivery" }} autoProposeEnabled
    now={new Date(0)} plan={plan} roster={["dev"]} editable={writable} save={save}
    actions={{ archive: id => mutate("archive", id), rename: (id, name) => mutate("rename", { id, name }), setDefault: id => mutate("default", id), setRule: (type, id) => mutate("rule", { type, id }), setAutomaticPick: enabled => mutate("picking", enabled) }} />;
}
let generation = 0;
fixture.mount = (mode, editable = true) => {
  fixture.writes = []; fixture.refreshes = 0;
  root.render(<AppRouterContext.Provider value={router}><Fixture key={++generation} mode={mode} editable={editable} /></AppRouterContext.Provider>);
};
Object.assign(window, { fixture }); fixture.mount("list");
