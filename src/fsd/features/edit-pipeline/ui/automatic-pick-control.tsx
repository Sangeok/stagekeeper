"use client";
import { AUTO_PROPOSE_DISABLED_REASON, PIPELINE_EDIT_PLAN_GATE } from "@harness/core/pipeline/pipeline.mjs";
import { Button } from "@/fsd/shared/ui/button";

type Props = { enabled: boolean; writable: boolean; pending: boolean; onToggle: () => void; unavailableReason?: string };
export function AutomaticPickControl({ enabled, writable, pending, onToggle, unavailableReason }: Props) {
  return <section aria-label="Automatic picking" className="flex flex-col gap-3 rounded-lg border border-rule bg-paper p-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1"><span className="text-[11px] uppercase tracking-[0.06em] text-quiet">Before starting an item</span>
        <h2 className="text-sm font-medium">Automatic picking <span className="ml-2 font-mono text-xs font-normal text-quiet">pm</span></h2></div>
      <Button size="sm" variant={enabled ? "mine-outline" : "quiet"} role="switch" aria-label="Automatic picking" aria-checked={enabled}
        disabled={!writable || pending} onClick={onToggle}>{pending ? "Saving…" : enabled ? "On" : "Off"}</Button>
    </div>
    <p className="text-sm">Let pm pick available backlog items when there is room on the board.</p>
    <p className="text-xs text-quiet">{enabled ? "New work follows the default selection and type overrides in Run rules." : AUTO_PROPOSE_DISABLED_REASON}</p>
    {!writable ? <p className="text-xs text-quiet">{unavailableReason ?? PIPELINE_EDIT_PLAN_GATE}</p> : null}
  </section>;
}
