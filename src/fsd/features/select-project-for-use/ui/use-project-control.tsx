"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/fsd/shared/ui/button";
import { replacementSummary, selectionIsFull, STALE_SELECTION_MESSAGE, type ProjectSelectionModel, type SelectProjectAction } from "../model/select-project-state";

type Props = { targetId: string; model: ProjectSelectionModel; action: SelectProjectAction };

export function UseProjectControl({ targetId, model, action }: Props) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, submit] = useTransition();
  const [isRefreshing, refresh] = useTransition();
  const isPending = isSubmitting || isRefreshing;
  const availableProjects = model.projects.filter((p) => p.available);
  const target = model.projects.find((p) => p.id === targetId);
  const isSelectionFull = selectionIsFull(model);
  const replacement = model.plan === "free" ? availableProjects[0] : availableProjects.find((p) => p.id === replacementId);
  if (!target || target.available) return null;

  const reset = () => { setIsConfirming(false); setReplacementId(""); setError(null); };
  const send = () => {
    setError(null);
    submit(async () => {
      try {
        const result = await action({ targetProjectId: targetId, expectedVersion: model.version,
          ...(isSelectionFull && replacement ? { replacementProjectId: replacement.id } : {}),
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

  // 조각으로 돌려준다 — 목록 행(flex-wrap)에서는 버튼이 행 끝에, 확인 창(order-last w-full)이 행 아래에 놓이고,
  // 잠금 배너(flex-col)에서는 위에서 아래로 쌓인다. self-start: 배너 안에서 버튼이 배너 폭으로 늘어나지 않게.
  return (
    <>
      {!isConfirming ? <Button size="sm" variant="mine-outline" className="self-start" disabled={isPending} onClick={() => isSelectionFull ? setIsConfirming(true) : send()}>
        {isPending ? "Updating…" : "Use this project"}
      </Button> : (
        <div className="order-last flex w-full flex-col gap-3 rounded-lg border border-rule bg-paper p-3 text-sm">
          {model.plan === "pro" ? <label className="flex flex-col gap-1">Replace a project
            <select className="rounded border border-edge bg-paper p-2" value={replacementId} disabled={isPending} onChange={(e) => setReplacementId(e.target.value)}>
              <option value="">Choose a project</option>
              {availableProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label> : null}
          {replacement ? <p>{`${replacementSummary(replacement)} Data, tokens, and run cursors are kept. Requests already approved may finish; new agent requests and web changes will stop.`}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" variant="mine" disabled={isPending || !replacement} onClick={send}>{isPending ? "Updating…" : `Use ${target.name} instead`}</Button>
            <Button size="sm" disabled={isPending} onClick={reset}>Cancel</Button>
          </div>
          {error ? <p role="alert" className="text-risk">{error}</p> : null}
        </div>
      )}
      {error && !isConfirming ? <p role="alert" className="order-last w-full text-sm text-risk">{error}</p> : null}
    </>
  );
}
