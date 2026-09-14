"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/fsd/shared/ui/button";
import { selectionIsFull, STALE_SELECTION_MESSAGE, type ProjectSelectionModel, type SelectProjectAction } from "../model/select-project-state";

type Props = { targetId: string; model: ProjectSelectionModel; action: SelectProjectAction };

export function UseProjectControl({ targetId, model, action }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, submit] = useTransition();
  const [refreshing, refresh] = useTransition();
  const pending = submitting || refreshing;
  const current = model.projects.filter((p) => p.available);
  const target = model.projects.find((p) => p.id === targetId);
  const full = selectionIsFull(model);
  const replacement = model.plan === "free" ? current[0] : current.find((p) => p.id === replacementId);
  if (!target || target.available) return null;

  const reset = () => { setConfirming(false); setReplacementId(""); setError(null); };
  const send = () => {
    setError(null);
    submit(async () => {
      try {
        const result = await action({ targetProjectId: targetId, expectedVersion: model.version,
          ...(full && replacement ? { replacementProjectId: replacement.id } : {}),
        });
        if (result.status === "error") { setError(result.reason); return; }
        reset();
        if (result.status === "stale") {
          toast.error(STALE_SELECTION_MESSAGE);
          refresh(() => router.refresh());
        } else toast.success(`${target.name} is available`);
      } catch {
        reset();
        toast.error("Couldn't confirm the selection. Refresh to check the latest project list.");
        refresh(() => router.refresh());
      }
    });
  };

  return (
    <div className="flex flex-col gap-2 text-sm">
      {!confirming ? <Button size="sm" disabled={pending} onClick={() => full ? setConfirming(true) : send()}>
        {pending ? "Updating…" : "Use this project"}
      </Button> : (
        <div className="flex flex-col gap-3 rounded-lg border border-rule p-3">
          {model.plan === "pro" ? <label className="flex flex-col gap-1">Replace a project
            <select className="rounded border border-rule bg-paper p-2" value={replacementId} disabled={pending} onChange={(e) => setReplacementId(e.target.value)}>
              <option value="">Choose a project</option>
              {current.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label> : null}
          {replacement ? <p>{replacement.name} will no longer be selected. {replacement.openItems} open board items · {replacement.openRuns} open agent runs.
            Data, tokens, and run cursors are kept. Requests already approved may finish; new agent requests and web changes will stop.</p> : null}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !replacement} onClick={send}>{pending ? "Updating…" : `Use ${target.name} instead`}</Button>
            <Button size="sm" disabled={pending} onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}
      {error ? <p role="alert" className="text-risk">{error}</p> : null}
    </div>
  );
}
