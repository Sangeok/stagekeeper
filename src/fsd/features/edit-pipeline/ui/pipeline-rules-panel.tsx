"use client";
import { useState, type ReactNode } from "react";
import { ITEM_TYPES } from "@harness/core/pipeline/backlog.mjs";
import { Button } from "@/fsd/shared/ui/button";
import type { PipelineSnapshot } from "../model/rail-state";
import type { PipelineSettingsActions } from "./pipeline-list";
import { PipelinePanel } from "./pipeline-panel";
import { AutomaticPickControl } from "./automatic-pick-control";

type Props = {
  pipelines: PipelineSnapshot[]; rules: Record<string, string>; autoProposeEnabled: boolean;
  editable: boolean; busy: boolean; error: string | null; unavailableReason?: string;
  actions: PipelineSettingsActions; change: (action: () => ReturnType<PipelineSettingsActions["setDefault"]>) => void;
  automationControls?: ReactNode; onClose: () => void;
};
export function PipelineRulesPanel({ pipelines, rules, autoProposeEnabled, editable, busy, error, unavailableReason, actions, change, automationControls, onClose }: Props) {
  const defaultId = pipelines.find(pipeline => pipeline.isDefault)!.id;
  const availableTypes = ITEM_TYPES.filter(type => !Object.hasOwn(rules, type));
  const [addingType, setAddingType] = useState<string>("");
  const typeToAdd = availableTypes.find(type => type === addingType) ?? availableTypes[0] ?? "";
  const options = pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id} disabled={!pipeline.runnable}>
    {pipeline.name}{pipeline.runnable ? "" : " · Requires existing work"}</option>);
  return <PipelinePanel title="Run rules" busy={busy} onClose={onClose}>
    <div className="flex flex-col gap-6">
      <p className="text-sm text-quiet">Choose which pipeline is selected when new work starts. You can choose a different pipeline when starting work yourself.</p>
      <label className="flex flex-col gap-2 text-sm">Default selection<select aria-label="Default selection" value={defaultId} disabled={!editable || busy}
        onChange={event => change(() => actions.setDefault(event.target.value))} className="rounded-md border border-edge bg-paper p-2">{options}</select></label>
      <section className="flex flex-col gap-3" aria-label="Type overrides">
        <h3 className="text-sm font-medium">Type overrides</h3>
        {!Object.keys(rules).length ? <p className="text-xs text-quiet">All types use the default selection.</p> : null}
        {ITEM_TYPES.filter(type => Object.hasOwn(rules, type)).map(type => <div key={type} className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">{type}<select aria-label={`${type} pipeline rule`} value={rules[type]} disabled={!editable || busy}
            onChange={event => change(() => actions.setRule(type, event.target.value))} className="min-w-0 flex-1 rounded-md border border-edge bg-paper p-2">{options}</select></label>
          {editable ? <Button size="sm" variant="quiet" disabled={busy} aria-label={`Remove ${type} override`} onClick={() => change(() => actions.setRule(type, null))}>Remove</Button> : null}
        </div>)}
        {editable && typeToAdd ? <div className="flex flex-wrap items-center gap-2"><select aria-label="Type to override" value={typeToAdd} disabled={busy} onChange={event => setAddingType(event.target.value)} className="rounded-md border border-edge bg-paper p-2 text-sm">
          {availableTypes.map(type => <option key={type} value={type}>{type}</option>)}</select>
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => change(() => actions.setRule(typeToAdd, defaultId))}>Add type override</Button></div> : null}
        <p className="text-xs text-quiet">New work needs a complete development flow. Pipelines that need a plan or implementation can run directly on compatible existing work.</p>
      </section>
      <AutomaticPickControl enabled={autoProposeEnabled} writable={editable} pending={busy} unavailableReason={unavailableReason} onToggle={() => change(() => actions.setAutomaticPick(!autoProposeEnabled))} />
      {automationControls}
      {error ? <p role="alert" className="text-sm text-risk">{error}</p> : null}
      <p className="text-xs text-quiet">Changes save immediately and apply to new work. Running pipelines keep their saved configuration.</p>
    </div>
  </PipelinePanel>;
}
