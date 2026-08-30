"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { gateActionLabel, gateLockLabel, gatePendingLabel, gateToast } from "../model/gate-text";
import { LockedChip, useGateCardLock } from "./gate-card-lock";

// 게이트 버튼. 라벨은 목적지 status에서 온다(Request plan / Approve implementation).
// 검증 기록이 없으면 채움에서 윤곽으로 물러선다(variant) — 결과 문장은 카드가 버튼 아래에서 말한다.
export function GateTransitionButton({
  to,
  itemKey,
  commit,
  variant = "mine",
}: {
  to: string;
  itemKey: string;
  commit: () => Promise<ActionResult<void>>;
  variant?: "mine" | "mine-outline";
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
      setLock({ label: gateLockLabel(to), tone: "mine" });
      router.refresh();
    });
  };

  if (lock !== null) return <LockedChip lock={lock} />;
  return (
    <Button variant={variant} disabled={isPending} onClick={handleClick}>
      {isPending ? gatePendingLabel(to) : gateActionLabel(to)}
    </Button>
  );
}
