"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { refStep } from "@harness/core/pipeline/pipeline.mjs";
import type { ActionResult } from "@/fsd/shared/api/result";
import { agoLabel } from "@/fsd/shared/lib/relative-time";
import { Button } from "@/fsd/shared/ui/button";
import { PipelineRail, type SavePipelineAction } from "./pipeline-rail";
import { PipelineRulesPanel } from "./pipeline-rules-panel";
import { PipelineRunPanel } from "./pipeline-run-panel";
import type { PipelineSnapshot } from "../model/rail-state";
import type { PipelineRunActions } from "../model/run-pipeline-input";

export type PipelineSettingsActions = {
  archive: (id: string) => Promise<ActionResult<null>>;
  rename: (id: string, name: string) => Promise<ActionResult<null>>;
  setDefault: (id: string) => Promise<ActionResult<null>>;
  setRule: (type: string, id: string | null) => Promise<ActionResult<null>>;
  setAutomaticPick: (enabled: boolean) => Promise<ActionResult<null>>;
};
type Props = {
  projectId: string; pipelines: PipelineSnapshot[]; rules: Record<string, string>; autoProposeEnabled: boolean;
  now: Date; plan: string; roster: string[]; editable: boolean; unavailableReason?: string;
  save: SavePipelineAction; actions: PipelineSettingsActions; runActions?: PipelineRunActions; canRun?: boolean;
  automationControls?: ReactNode; targetKey?: string;
};
type Panel = { kind: "closed" } | { kind: "rules" } | { kind: "run"; pipelineId: string; name: string };

export function PipelineList({ projectId, pipelines, rules, autoProposeEnabled, now, plan, roster, editable, unavailableReason, save, actions, runActions, canRun = editable, automationControls, targetKey }: Props) {
  const router = useRouter();
  const defaultPipeline = pipelines.find(pipeline => pipeline.isDefault)!;
  const [selected, setSelected] = useState<string | null>(defaultPipeline.id);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [dirty, setDirty] = useState(false), [railBusy, setRailBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null), [unknown, setUnknown] = useState(false);
  const [panel, setPanel] = useState<Panel>({ kind: "closed" });
  const working = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const busy = pending || railBusy;
  const current = pipelines.find(pipeline => pipeline.id === selected);
  if (selected !== null && !current && waitingFor !== selected) setSelected(defaultPipeline.id);
  if (waitingFor !== null && pipelines.some(pipeline => pipeline.id === waitingFor)) setWaitingFor(null);
  const select = (id: string | null): void => {
    if (busy || working.current) return;
    if ((dirty || (selected === null && draftName.length > 0)) && !window.confirm("Discard changes and open another pipeline?")) return;
    setSelected(id); setDirty(false); setDraftName(""); setRename(null); setError(null);
  };
  const mutate = (action: () => Promise<ActionResult<null>>, after?: () => void): void => {
    if (!editable || busy || working.current || unknown) return;
    working.current = true; setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!alive.current) return;
        if (!result.success) { setError(result.error); return; }
        after?.(); router.refresh();
      } catch {
        if (!alive.current) return;
        setUnknown(true); setError("The setting may have changed. Refresh to check before trying again.");
      } finally { working.current = false; }
    });
  };
  const users = current ? pipelines.filter(pipeline => pipeline.definition.steps.includes(refStep(current.id))) : [];
  const ruleCount = Object.keys(rules).length;
  return <div className="flex min-w-0 flex-col gap-6">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-4">
      <p className="text-sm text-quiet">Default selection: <span className="font-medium text-ink">{defaultPipeline.name}</span> · {ruleCount ? `${ruleCount} type override${ruleCount === 1 ? "" : "s"}` : "All types"}</p>
      <Button size="sm" variant="quiet" disabled={busy} onClick={() => setPanel({ kind: "rules" })}>Run rules</Button>
    </div>
    <section className="flex flex-col gap-3" aria-label="Pipelines">
      {targetKey ? <p className="text-sm">Choose a pipeline to run on <strong>{targetKey}</strong>.</p> : null}
      <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-medium">Pipelines</h2>
        {editable ? <Button size="sm" variant="quiet" disabled={busy || unknown} onClick={() => select(null)}>New pipeline</Button> : null}</div>
      <div className="flex flex-wrap gap-2" aria-label="Choose a pipeline to edit">{pipelines.map(pipeline => <button key={pipeline.id} type="button" aria-pressed={selected === pipeline.id} disabled={busy}
        className="max-w-full break-words rounded-md border border-edge px-3 py-2 text-left text-sm aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper disabled:opacity-50"
        onClick={() => select(pipeline.id)}>{pipeline.name}</button>)}</div>
      <p className="text-xs text-quiet">Open a pipeline to edit it, run it on work, or reuse it in another pipeline.</p>
    </section>
    <section className="flex min-w-0 flex-col gap-4" aria-label="Pipeline editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 break-words text-lg font-semibold">{selected === null ? "New pipeline" : current?.name}</h2>
        {current ? <div className="flex items-center gap-3"><Button size="sm" variant="mine" disabled={!canRun || !runActions || dirty || busy || unknown}
          onClick={() => setPanel({ kind: "run", pipelineId: current.id, name: current.name })}>Run</Button>
          {editable ? <details className="relative"><summary className="cursor-pointer rounded-md px-2 py-1 text-sm" aria-label={`More actions for ${current.name}`}>More</summary>
            <div className="absolute right-0 z-10 mt-2 flex min-w-32 flex-col rounded-md border border-edge bg-paper p-2 shadow-sm">
              <button type="button" className="px-3 py-2 text-left text-sm" disabled={busy || unknown} onClick={() => setRename({ id: current.id, name: current.name })}>Rename</button>
              <button type="button" className="px-3 py-2 text-left text-sm" disabled={busy || unknown} onClick={() => {
                if (dirty && !window.confirm("Discard changes and archive this pipeline?")) return;
                mutate(() => actions.archive(current.id), () => { setSelected(defaultPipeline.id); setDirty(false); });
              }}>Archive</button>
            </div></details> : null}</div> : null}
      </div>
      {dirty && current ? <p className="text-xs text-quiet">Save your changes before starting a run.</p> : null}
      {selected === null ? <input aria-label="New pipeline name" placeholder="Pipeline name" maxLength={40} disabled={!editable || busy} className="max-w-sm rounded border border-edge bg-paper px-3 py-2 text-sm" value={draftName} onChange={event => setDraftName(event.target.value)} /> : null}
      {rename && editable ? <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); mutate(() => actions.rename(rename.id, rename.name), () => setRename(null)); }}>
        <input aria-label="Pipeline name" className="min-w-0 rounded border border-edge bg-paper px-2 py-1 text-sm" value={rename.name} maxLength={40} disabled={busy || unknown} onChange={event => setRename({ ...rename, name: event.target.value })} />
        <Button size="sm" disabled={busy || unknown} type="submit">Save name</Button><button type="button" disabled={busy} onClick={() => setRename(null)}>Cancel</button>
      </form> : null}
      <p className="text-xs text-quiet">{selected === null ? "Not saved yet" : current?.saved ? `Version ${current.saved.version} · saved ${agoLabel(current.saved.createdAt, now)} · changes apply to future runs.` : "Initial configuration · changes apply to future runs."}</p>
      {users.length ? <p className="text-xs text-quiet">Used in: {users.map((pipeline, index) => <span key={pipeline.id}>{index ? ", " : ""}<button type="button" className="underline underline-offset-2" disabled={busy} onClick={() => select(pipeline.id)}>{pipeline.name}</button></span>)}</p> : null}
      {current || selected === null ? <PipelineRail key={`${projectId}:${selected ?? "new"}`} pipelineId={selected} name={draftName}
        definition={current?.definition ?? { steps: [], gates: [] }} expectedVersion={current?.saved?.version ?? 0}
        pipelines={pipelines} rules={rules} plan={plan} roster={roster} editable={editable && !pending && !unknown}
        unavailableReason={unavailableReason} save={save} onSelect={select} onDirtyChange={setDirty} onBusyChange={setRailBusy}
        onSaved={id => { setDirty(false); if (selected === null) { setWaitingFor(id); setSelected(id); } router.refresh(); }} /> : <p className="text-sm text-quiet">Loading saved pipeline…</p>}
    </section>
    {error ? <p role="alert" className="text-xs text-risk">{error}</p> : null}
    {unknown ? <Button size="sm" onClick={() => window.location.reload()}>Refresh</Button> : null}
    {panel.kind === "rules" ? <PipelineRulesPanel pipelines={pipelines} rules={rules} autoProposeEnabled={autoProposeEnabled} editable={editable && !unknown} busy={busy}
      error={error} unavailableReason={unavailableReason} actions={actions} change={mutate} automationControls={automationControls} onClose={() => setPanel({ kind: "closed" })} /> : null}
    {panel.kind === "run" && runActions ? <PipelineRunPanel key={panel.pipelineId} pipelineId={panel.pipelineId} name={panel.name} actions={runActions} targetKey={targetKey} onClose={() => setPanel({ kind: "closed" })} /> : null}
  </div>;
}
