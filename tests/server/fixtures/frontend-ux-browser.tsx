import { useEffect, useState, type ComponentType, type ReactElement } from "react";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { ProjectPipelinePage } from "@/fsd/pages/project-pipeline";
import type { PipelineRunActions, PipelineSettingsActions, PipelineSnapshot, SavePipelineAction } from "@/fsd/features/edit-pipeline";
import type { Definition } from "@harness/core/pipeline/pipeline.mjs";
import type { ActionResult } from "@/fsd/shared/api/result";

export type FrontendUxMode = "ux-pipeline" | "ux-rail";
export type FrontendUxOutcome = "success" | "error" | "stale" | "unknown";
type RailProps = {
  pipelineId: string; definition: Definition; expectedVersion: number; pipelines: PipelineSnapshot[];
  rules: Record<string, string>; plan: string; roster: string[]; editable: boolean;
  unavailableReason: string; save: SavePipelineAction; onSelect: (id: string) => void;
};

const initial: PipelineSnapshot[] = [
  { id: "default", name: "Default", isDefault: true, definition: { steps: ["plan", "verify", "implement", "accept"], gates: ["before-plan"] }, saved: { version: 1, createdAt: new Date(0) }, runnable: { nodes: ["plan", "verify", "implement", "accept"], gates: ["before-plan"], format: "slots-v1" } },
  { id: "check", name: "Check", isDefault: false, definition: { steps: ["qa"], gates: ["before-qa"] }, saved: { version: 1, createdAt: new Date(0) }, runnable: null },
  { id: "delivery", name: "Delivery", isDefault: false, definition: { steps: ["plan", "implement", "pipeline:check", "accept"], gates: ["before-plan"] }, saved: { version: 1, createdAt: new Date(0) }, runnable: { nodes: ["plan", "implement", "qa", "accept"], gates: ["before-plan", "before-qa"], format: "slots-v1" } },
];

const pending = new Set<(outcome: FrontendUxOutcome) => void>();
const originalUrl = location.href;
const originalHistory = history.state;

export const frontendUx = {
  calls: [] as { kind: string; input: unknown }[],
  refreshes: 0,
  pushes: [] as string[],
  projectRun: false,
  prepares: 0,
  finish: (outcome: FrontendUxOutcome): void => { void outcome; },
  receive: (version: number, missing = false): void => { void version; void missing; },
  access: (editable: boolean): void => { void editable; },
  identity: (projectId: string): void => { void projectId; },
  hide: (): void => {},
};

function request<T>(kind: string, input: unknown, outcomes: Record<Exclude<FrontendUxOutcome, "unknown">, T>): Promise<T> {
  frontendUx.calls.push({ kind, input });
  return new Promise((resolve, reject) => {
    const finish = (outcome: FrontendUxOutcome): void => {
      pending.delete(finish);
      if (outcome === "unknown") reject(new Error("Fixture response lost"));
      else resolve(outcomes[outcome]);
    };
    pending.add(finish);
    frontendUx.finish = finish;
  });
}

const router: AppRouterInstance = {
  bfcacheId: "frontend-ux",
  back: () => history.back(),
  forward: () => history.forward(),
  refresh: () => { frontendUx.refreshes++; },
  push: href => { frontendUx.pushes.push(href); },
  replace: href => history.replaceState(history.state, "", href),
  prefetch: () => {},
};

function setting(kind: string, input: unknown): Promise<ActionResult<null>> {
  return request(kind, input, {
    success: { success: true, data: null },
    error: { success: false, error: "Fixture refusal" },
    stale: { success: false, error: "Fixture stale" },
  });
}

const settings: PipelineSettingsActions = {
  archive: id => setting("archive", id),
  rename: (id, name) => setting("rename", { id, name }),
  setDefault: id => setting("default", id),
  setRule: (type, id) => setting("rule", { type, id }),
};

const save: SavePipelineAction = input => request("save", input, {
  success: { status: "success", pipelineId: input.pipelineId ?? "created", version: input.expectedVersion + 1 },
  error: { status: "error", reason: "Fixture refusal" },
  stale: { status: "stale" },
});

const runActions: PipelineRunActions = {
  prepare: async pipelineId => {
    frontendUx.prepares++;
    return { success: true, data: {
    pipelineId, name: "Delivery", graphKey: "a".repeat(64), nodes: ["plan", "implement", "qa", "accept"], gates: ["before-plan"], agents: ["dev"],
    targets: [{ id: "work", kind: "backlog", key: "K-1", title: "Known work", agent: null, updatedAt: null, reason: null }],
    canStartWithoutWork: frontendUx.projectRun,
    ...(frontendUx.projectRun ? { projectRun: { id: "run", pipelineName: "Delivery", entryId: "entry", node: "before-plan", reason: null, closed: false } } : {}),
    } };
  },
  start: input => request("start", input, {
    success: { success: true, data: { href: "/p/fixture/items/K-1" } },
    error: { success: false, error: "Fixture refusal" },
    stale: { success: false, error: "Fixture stale" },
  }),
  startProject: (pipelineId, graphKey) => request("start-project", { pipelineId, graphKey }, {
    success: { success: true, data: { href: "/p/fixture" } },
    error: { success: false, error: "Fixture refusal" },
    stale: { success: false, error: "Fixture stale" },
  }),
  stopProject: id => setting("stop", id),
  approveProjectGate: input => setting("approve", input),
};

export function FrontendUxFixture({ mode, Rail }: { mode: FrontendUxMode; Rail: ComponentType<RailProps> }): ReactElement {
  const [pipelines, setPipelines] = useState(() => structuredClone(initial));
  const [editable, setEditable] = useState(true);
  const [projectId, setProjectId] = useState("one");
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const previous = Reflect.get(window, "frontendUx");
    Reflect.set(window, "frontendUx", frontendUx);
    frontendUx.receive = (version, missing = false) => setPipelines(current => current
      .filter(row => !missing || row.id !== "check")
      .map(row => row.id === "delivery" ? { ...row, saved: { version, createdAt: new Date(version) } } : row));
    frontendUx.access = setEditable;
    frontendUx.identity = setProjectId;
    frontendUx.hide = () => setVisible(false);
    return () => {
      if (previous === undefined) Reflect.deleteProperty(window, "frontendUx");
      else Reflect.set(window, "frontendUx", previous);
      frontendUx.receive = () => {};
      frontendUx.access = () => {};
      frontendUx.identity = () => {};
      frontendUx.hide = () => {};
    };
  }, []);
  const delivery = pipelines.find(row => row.id === "delivery")!;
  return <AppRouterContext.Provider value={router}>
    <SearchParamsContext.Provider value={new URLSearchParams(location.search)}>
      <div id="frontend-ux" data-project={projectId}>
        {!visible ? <p>Fixture target unmounted</p> : mode === "ux-rail" ? <Rail
          key={projectId} pipelineId="delivery" definition={delivery.definition} expectedVersion={delivery.saved!.version}
          pipelines={pipelines} rules={{}} plan="pro" roster={["dev"]} editable={editable}
          unavailableReason="Not selected" save={save} onSelect={id => { frontendUx.calls.push({ kind: "open", input: id }); }} />
          : <ProjectPipelinePage projectId={projectId} pipelines={pipelines} rules={{}}
            now={new Date(0)} plan="pro" roster={["dev"]} editable={editable} unavailableReason="Not selected"
            save={save} actions={settings} runActions={runActions} canRun={editable} />}
      </div>
    </SearchParamsContext.Provider>
  </AppRouterContext.Provider>;
}

export function cleanupFrontendUx(): void {
  for (const finish of pending) finish("error");
  pending.clear();
  frontendUx.calls.length = 0;
  frontendUx.pushes.length = 0;
  frontendUx.refreshes = 0;
  frontendUx.projectRun = false;
  frontendUx.prepares = 0;
  frontendUx.finish = () => {};
  history.replaceState(originalHistory, "", originalUrl);
}
