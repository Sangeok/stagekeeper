"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ActionResult } from "@/fsd/shared/api/result";
import { GATE_LOCK_LABEL, gateNextActionHint } from "../model/gate-text";
import { LockedChip, useGateCardLock } from "./gate-card-lock";

// 도장. ApcH의 shadcn Button과 테마 토큰은 이 저장소에 없으므로 평범한 button + Tailwind로 옮겼다.
const STAMP_BUTTON_CLASS =
  "rounded-sm border-2 border-amber-700 bg-amber-50 px-2.5 py-1 text-xs font-medium " +
  "tracking-wide text-amber-800 shadow-[1px_1px_0_0_theme(colors.amber.700)] transition-transform " +
  "hover:-translate-y-px active:translate-y-0 active:shadow-none disabled:opacity-60";

export function GateTransitionButton({
  label,
  commit,
}: {
  label: string;
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
      toast.success(`${label}로 넘겼습니다. ${gateNextActionHint(label)}`);
      setLock({ label: GATE_LOCK_LABEL, marker: "bg-amber-700" });
      router.refresh();
    });
  };

  if (lock !== null) return <LockedChip lock={lock} />;
  return (
    <button type="button" disabled={isPending} onClick={handleClick} className={STAMP_BUTTON_CLASS}>
      {isPending ? "찍는 중..." : label}
    </button>
  );
}
