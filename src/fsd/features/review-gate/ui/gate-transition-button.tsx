"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { gateActionLabel, gateLockLabel, gatePendingLabel, gateToast } from "../model/gate-text";
import { LockedChip, useGateCardLock } from "./gate-card-lock";

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
