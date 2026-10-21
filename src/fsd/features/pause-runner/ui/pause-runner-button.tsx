"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";

export type PauseRunnerAction = (paused: boolean) => Promise<ActionResult<boolean>>;

const LOST = "The setting may have changed. Refresh to check before trying again.";

export function PauseRunnerButton({ paused, save }: { paused: boolean; save: PauseRunnerAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toggle = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await save(!paused);
        if (!result.success) setError(result.error);
      } catch {
        setError(LOST);
        startTransition(() => router.refresh());
      }
    });
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="quiet" aria-busy={pending} disabled={pending} onClick={toggle}>
        {paused ? "Resume" : "Pause"}
      </Button>
      {error ? <span role="alert" className="text-xs text-risk">{error}</span> : null}
    </span>
  );
}
