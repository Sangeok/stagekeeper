"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/fsd/shared/ui/button";
import { STALE_CONNECTION_MESSAGE, UNKNOWN_CONNECTION_MESSAGE, type ProjectConnectionAction, type ProjectConnectionModel } from "../model/project-connection-state";

type Props = { targetId: string; model: ProjectConnectionModel; disconnect: ProjectConnectionAction; reconnect: ProjectConnectionAction };

export function ProjectConnectionControl({ targetId, model, disconnect, reconnect }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [refreshing, refresh] = useTransition();
  const target = model.projects.find((p) => p.id === targetId);
  if (!target) return null;
  const disconnected = target.disconnectedAt !== null;
  const label = disconnected ? "Reconnect repository" : "Disconnect repository";
  const busy = pending || refreshing;
  const reset = () => { setConfirming(false); setError(null); };
  const refreshState = () => refresh(() => router.refresh());
  const send = () => {
    setError(null);
    start(async () => {
      try {
        const result = await (disconnected ? reconnect : disconnect)({ targetProjectId: targetId, expectedVersion: model.version });
        if (result.status === "error") { setError(result.reason); return; }
        reset();
        if (result.status === "stale") { toast.error(STALE_CONNECTION_MESSAGE); refreshState(); }
        else toast.success(disconnected ? "Repository reconnected" : "Repository disconnected");
      } catch {
        reset();
        toast.error(UNKNOWN_CONNECTION_MESSAGE);
        refreshState();
      }
    });
  };
  return <div className="flex flex-col gap-2 text-sm">
    {!confirming ? <Button size="sm" className="self-start" disabled={busy || !model.writesEnabled} onClick={() => setConfirming(true)}>{label}</Button> : (
      <section aria-label={label} className="flex max-w-md flex-col gap-3 rounded-lg border border-rule p-3">
        <p className="font-medium">{target.repoOwner}/{target.repo}</p>
        {disconnected ? <p>{model.connectedCount} / {model.limit ?? "unlimited"} connected. Reconnect this project with its preserved data and settings. Your user token (hu_) still works; project tokens (hs_/ho_) must be issued again.</p>
          : <><p>{target.openItems} open board items · {target.openRuns} open agent runs.</p>
            <p>Your data stays available to you as read only. Project tokens (hs_/ho_) will be revoked; your user token (hu_) stays valid. New integration requests will stop. Requests already approved may finish, and local Claude Code will keep running.</p></>}
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !model.writesEnabled} onClick={send}>{busy ? "Updating…" : label}</Button>
          <Button size="sm" disabled={busy} onClick={reset}>Cancel</Button>
        </div>
      </section>
    )}
    {!model.writesEnabled ? <p className="text-xs text-quiet">Repository connection changes are temporarily unavailable.</p> : null}
    {error ? <p role="alert" className="text-risk">{error}</p> : null}
  </div>;
}
