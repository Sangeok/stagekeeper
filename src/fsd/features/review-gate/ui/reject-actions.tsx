"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ActionResult } from "@/fsd/shared/api/result";
import { rejectLabel, rejectLockLabel, rejectPendingLabel, rejectToast, type RejectAction } from "../model/gate-text";
import { useGateCardLock } from "./gate-card-lock";

// 라벨은 근검정, 뜻은 낱말 + 작은 색 마커(비텍스트). 색은 Phase D에서 토큰으로 바뀐다.
const MARKER: Record<RejectAction, string> = {
  bounce: "bg-sky-600",
  hold: "bg-zinc-400",
  discard: "bg-red-600",
};

export function RejectActions({
  id,
  actions,
  reject,
}: {
  id: string;
  actions: RejectAction[];
  reject: (action: RejectAction) => Promise<ActionResult<void>>;
}) {
  const router = useRouter();
  const { lock, setLock } = useGateCardLock();
  const [open, setOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (lock !== null) return null;
  if (actions.length === 0) return null;

  const run = (action: RejectAction) => {
    startTransition(async () => {
      const result = await reject(action);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(rejectToast(action, id));
      setLock({ label: rejectLockLabel(action), marker: MARKER[action] });
      router.refresh();
    });
  };

  const close = () => {
    setOpen(false);
    setConfirmingDiscard(false);
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="text-xs text-zinc-500 underline-offset-2 hover:underline"
      >
        {open ? "Hide actions" : "More actions"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1 border-l-2 border-zinc-200 pl-3">
          {actions.map((action) => {
            if (action === "discard" && confirmingDiscard) {
              return (
                <div key={action} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-xs text-red-700">This can&apos;t be undone. Discard {id}?</span>
                  <span className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setConfirmingDiscard(false)}
                      className="text-xs text-zinc-500 hover:underline disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run("discard")}
                      className="text-xs font-medium text-red-700 hover:underline disabled:opacity-60"
                    >
                      {isPending ? rejectPendingLabel("discard") : "Discard"}
                    </button>
                  </span>
                </div>
              );
            }
            return (
              <button
                key={action}
                type="button"
                disabled={isPending}
                onClick={() => (action === "discard" ? setConfirmingDiscard(true) : run(action))}
                className="flex items-center gap-2 py-0.5 text-left text-sm hover:underline disabled:opacity-60"
              >
                <span aria-hidden="true" className={`inline-block size-2 rounded-[1px] ${MARKER[action]}`} />
                {isPending && action !== "discard" ? rejectPendingLabel(action) : rejectLabel(action)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
