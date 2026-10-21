"use client";
import { useState, useTransition } from "react";

import { Button } from "@/fsd/shared/ui/button";
import type { RemoveBacklogAction } from "../model/backlog-form-state";

export function RemoveBacklogButton({ itemKey, remove }: { itemKey: string; remove: RemoveBacklogAction }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const result = await remove(itemKey);
              setError(result.status === "error" ? result.error : null);
            } catch {
              setError("Couldn't remove it. Try again.");
            }
          })
        }
      >
        Remove
      </Button>
      {error ? <p className="text-xs text-risk">{error}</p> : null}
    </div>
  );
}
