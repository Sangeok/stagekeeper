"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { gateActionLabel, gateLockLabel, gatePendingLabel, gateToast } from "../model/gate-text";
import { LockedChip, useGateCardLock } from "./gate-card-lock";

// 게이트 버튼. 라벨은 현재 커서의 gate ID에서 온다(Request plan / Approve implementation).
// 언제나 채움이다 — 검증 기록 유무로 물러서지 않는다(design.md 규칙 2). 결과 문장은 카드가 버튼 아래에서 말한다.
export function GateTransitionButton({
  gate,
  itemKey,
  commit,
}: {
  gate: string;
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
      toast.success(gateToast(gate, itemKey));
      setLock({ label: gateLockLabel(gate), tone: "mine" });
      router.refresh();
    });
  };

  if (lock !== null) return <LockedChip lock={lock} />;
  return (
    <Button variant="mine" disabled={isPending} onClick={handleClick}>
      {isPending ? gatePendingLabel(gate) : gateActionLabel(gate)}
    </Button>
  );
}
