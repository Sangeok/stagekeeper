"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ActionResult } from "@/fsd/shared/api/result";
import { rejectLockLabel, type RejectAction } from "../model/gate-text";
import { useGateCardLock } from "./gate-card-lock";

// 여백 펜 메모: 라벨은 근검정, 뜻은 낱말 + 작은 색 마커(비텍스트).
const ACTION_META: Record<RejectAction, { label: string; marker: string; toast: string }> = {
  bounce: { label: "계획 다시 쓰기", marker: "bg-sky-600", toast: "계획지시로 되돌렸습니다" },
  hold: { label: "지금은 보류", marker: "bg-zinc-400", toast: "보류했습니다" },
  discard: { label: "폐기", marker: "bg-red-600", toast: "" }, // 폐기 토스트는 아래서 특수 처리
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
      toast.success(
        action === "discard" ? `${id}를 폐기했습니다. 되돌릴 수 없습니다.` : ACTION_META[action].toast,
      );
      setLock({ label: rejectLockLabel(action), marker: ACTION_META[action].marker });
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
        {open ? "반려 닫기" : "반려"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1 border-l-2 border-zinc-200 pl-3">
          {actions.map((action) => {
            if (action === "discard" && confirmingDiscard) {
              return (
                <div key={action} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-xs text-red-700">되돌릴 수 없습니다. 폐기할까요?</span>
                  <span className="flex shrink-0 gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setConfirmingDiscard(false)}
                      className="text-xs text-zinc-500 hover:underline disabled:opacity-60"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run("discard")}
                      className="text-xs font-medium text-red-700 hover:underline disabled:opacity-60"
                    >
                      {isPending ? "폐기 중..." : "폐기 확인"}
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
                <span aria-hidden="true" className={`inline-block size-2 rounded-[1px] ${ACTION_META[action].marker}`} />
                {ACTION_META[action].label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
