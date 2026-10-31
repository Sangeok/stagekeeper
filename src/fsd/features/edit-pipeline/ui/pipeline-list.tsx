"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/fsd/shared/api/result";
import { agoLabel } from "@/fsd/shared/lib/relative-time";
import { Button } from "@/fsd/shared/ui/button";
import { Chip } from "@/fsd/shared/ui/chip";
import { PipelineRail, type SavePipelineAction } from "./pipeline-rail";
import { AutomaticPickControl } from "./automatic-pick-control";
import type { PipelineSnapshot } from "../model/rail-state";

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
  save: SavePipelineAction; actions: PipelineSettingsActions;
};
export function PipelineList({ projectId, pipelines, rules, autoProposeEnabled, now, plan, roster, editable, unavailableReason, save, actions }: Props) {
  const router = useRouter();
  const defaultId = pipelines.find(pipeline => pipeline.isDefault)!.id;
  const [selected, setSelected] = useState<string | null>(defaultId);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [dirty, setDirty] = useState(false), [railBusy, setRailBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null), [unknown, setUnknown] = useState(false);
  const working = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const busy = pending || railBusy;
  const current = pipelines.find(pipeline => pipeline.id === selected);
  if (selected !== null && !current && waitingFor !== selected) setSelected(defaultId);
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
  return <div className="flex flex-col gap-6">
    <AutomaticPickControl enabled={autoProposeEnabled} writable={editable} pending={busy || unknown}
      unavailableReason={unavailableReason} onToggle={() => mutate(() => actions.setAutomaticPick(!autoProposeEnabled))} />
    <section className="flex flex-col gap-3" aria-label="Pipelines">
      <div className="flex items-center justify-between"><h2 className="text-sm font-medium">Pipelines</h2>
        {editable ? <Button size="sm" variant="quiet" disabled={busy || unknown} onClick={() => select(null)}>New pipeline</Button> : null}</div>
      <div className="flex flex-wrap gap-2">{pipelines.map(pipeline => <div key={pipeline.id} className="flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-edge p-3">
        <button type="button" aria-pressed={selected === pipeline.id} disabled={busy} className="min-w-0 max-w-full break-words text-left text-sm font-medium underline-offset-4 aria-pressed:underline" onClick={() => select(pipeline.id)}>{pipeline.name}</button>
        {pipeline.isDefault ? <Chip tone="mine">Default</Chip> : null}<span className="text-xs text-quiet">{pipeline.runnable ? "Runs items" : "Used inside"}</span>
        {editable ? <>
          <button type="button" disabled={busy || unknown} className="text-xs underline" onClick={() => setRename({ id: pipeline.id, name: pipeline.name })}>Rename</button>
          <button type="button" disabled={busy || unknown} className="text-xs underline" onClick={() => {
            if (selected === pipeline.id && dirty && !window.confirm("Discard changes and archive this pipeline?")) return;
            mutate(() => actions.archive(pipeline.id), () => { if (selected === pipeline.id) { setSelected(defaultId); setDirty(false); } });
          }}>Archive</button>
        </> : null}
      </div>)}</div>
      {rename && editable ? <form className="flex gap-2" onSubmit={event => { event.preventDefault(); mutate(() => actions.rename(rename.id, rename.name), () => setRename(null)); }}>
        <input aria-label="Pipeline name" className="rounded border border-edge bg-paper px-2 py-1 text-sm" value={rename.name} maxLength={40} disabled={busy || unknown} onChange={event => setRename({ ...rename, name: event.target.value })} />
        <Button size="sm" disabled={busy || unknown} type="submit">Save name</Button><button type="button" disabled={busy} onClick={() => setRename(null)}>Cancel</button>
      </form> : null}
      {error ? <p role="alert" className="text-xs text-risk">{error}</p> : null}
      {unknown ? <Button size="sm" onClick={() => window.location.reload()}>Refresh</Button> : null}
    </section>
    <section className="flex flex-col gap-4" aria-label="Pipeline editor">
      <h2 className="break-words text-sm font-medium">{selected === null ? "New pipeline" : current?.name}</h2>
      {selected === null ? <input aria-label="New pipeline name" placeholder="Pipeline name" maxLength={40} disabled={!editable || busy} className="max-w-sm rounded border border-edge bg-paper px-3 py-2 text-sm" value={draftName} onChange={event => setDraftName(event.target.value)} /> : null}
      <p className="text-xs text-quiet">{selected === null ? "New pipeline · not saved yet" : current?.saved ? `Version ${current.saved.version} · saved ${agoLabel(current.saved.createdAt, now)} · applies to items proposed from now on.` : "Default pipeline · not saved yet"}</p>
      {current || selected === null ? <PipelineRail key={`${projectId}:${selected ?? "new"}`} pipelineId={selected} name={draftName}
        definition={current?.definition ?? { steps: [], gates: [] }} expectedVersion={current?.saved?.version ?? 0}
        pipelines={pipelines} rules={rules} plan={plan} roster={roster} editable={editable && !pending && !unknown}
        unavailableReason={unavailableReason} save={save} onSelect={select} onDirtyChange={setDirty} onBusyChange={setRailBusy}
        onSaved={id => { setDirty(false); if (selected === null) { setWaitingFor(id); setSelected(id); } router.refresh(); }} /> : <p className="text-sm text-quiet">Loading saved pipeline…</p>}
    </section>
  </div>;
}
