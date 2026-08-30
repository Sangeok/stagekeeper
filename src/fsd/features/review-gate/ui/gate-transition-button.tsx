"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ActionResult } from "@/fsd/shared/api/result";
import { gateActionLabel, gateLockLabel, gateNextActionHint, gatePendingLabel, gateToast } from "../model/gate-text";
import { LockedChip, useGateCardLock } from "./gate-card-lock";

// 게이트 버튼. 라벨은 목적지 status에서 온다(Request plan / Approve implementation).
// 다음에 무슨 일이 생기는지는 누르기 전에 버튼 옆에서 말한다 — 토스트는 이미 누른 뒤다.
const BUTTON_CLASS =
  "rounded-sm border-2 border-amber-700 bg-amber-50 px-2.5 py-1 text-xs font-medium " +
  "tracking-wide text-amber-800 shadow-[1px_1px_0_0_theme(colors.amber.700)] transition-transform " +
  "hover:-translate-y-px active:translate-y-0 active:shadow-none disabled:opacity-60";

export function GateTransitionButton({
  to,
  itemKey,
  commit,
}: {
  to: string;
  itemKey: string;
  commit: () => Promise<ActionResult<void>>;
}) {
  const router = useRouter();
  const { lock, setLock } = useGateCardLock();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await commit();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(gateToast(to, itemKey));
      setLock({ label: gateLockLabel(to), marker: "bg-amber-700" });
      router.refresh();
    });
  };

  if (lock !== null) return <LockedChip lock={lock} />;
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={isPending} onClick={handleClick} className={BUTTON_CLASS}>
        {isPending ? gatePendingLabel(to) : gateActionLabel(to)}
      </button>
      <span className="text-right text-xs text-zinc-500">{gateNextActionHint(to)}</span>
    </span>
  );
}
