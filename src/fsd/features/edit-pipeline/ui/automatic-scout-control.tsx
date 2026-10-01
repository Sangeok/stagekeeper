"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";

export type SaveAutomaticScoutAction = (enabled: boolean) => Promise<ActionResult<boolean>>;
type Props = { enabled: boolean; writable: boolean; save: SaveAutomaticScoutAction; unavailableReason?: string };

export function AutomaticScoutControl({ enabled, writable, save, unavailableReason }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toggle = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await save(!enabled);
        if (!result.success) { setError(result.error); return; }
        toast.success(result.data ? "Automatic scouting on" : "Automatic scouting off");
      } catch {
        setError("The setting may have changed. Refresh to check before trying again.");
        startTransition(() => router.refresh());
      }
    });
  };

  return (
    <section aria-label="Automatic scouting" className="flex flex-col gap-3 rounded-lg border border-rule bg-paper p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.06em] text-quiet">Before picking an item</span>
          <h2 className="text-sm font-medium">Scout <span className="ml-2 font-mono text-xs font-normal text-quiet">feature-scout</span></h2>
        </div>
        <Button size="sm" variant={enabled ? "mine-outline" : "quiet"} role="switch" aria-label="Automatic scouting" aria-checked={enabled}
          disabled={!writable || pending} onClick={toggle}>
          {pending ? "Saving…" : enabled ? "On" : "Off"}
        </Button>
      </div>
      <p className="text-sm">When no backlog items are available, feature-scout looks for up to three items to add before pm picks work.</p>
      <p className="text-xs text-quiet">{enabled
        ? "Runs once after the backlog changes, when there is room on the board. Turning it off stops the current automatic scout run and further additions."
        : "Automatic scouting is off. Add an item on the Backlog tab to continue."}</p>
      <p className="text-xs text-quiet">Changes take effect immediately. Scout slots in the item pipeline below follow their saved order.</p>
      {!writable && unavailableReason ? <p className="text-xs text-quiet">{unavailableReason}</p> : null}
      {error ? <p role="alert" className="text-xs text-risk">{error}</p> : null}
    </section>
  );
}
