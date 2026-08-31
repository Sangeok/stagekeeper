"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ActionResult } from "@/fsd/shared/api/result";
import { cn } from "@/fsd/shared/lib/class-name";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";
import { NOTE_LIMIT, rejectLabel, rejectLockLabel, rejectPendingLabel, rejectToast, type RejectAction } from "../model/gate-text";
import { useGateCardLock } from "./gate-card-lock";

// 보조 동작: 토글 링크 → 가로 텍스트 줄(Send back · Put on hold · Discard). Discard만 risk 색.
// Send back·Put on hold는 아래로 노트 칸을 편다 — 안내는 placeholder가 아니라 도움말에 둔다.
const LOCK_TONE: Record<RejectAction, "mine" | "risk" | "done"> = {
  bounce: "done",
  hold: "done",
  discard: "risk",
};

const NOTE_COPY: Record<"bounce" | "hold", { label: string; hint: string }> = {
  bounce: { label: "Note to dev", hint: `dev reads this before rewriting the plan. Up to ${NOTE_LIMIT.bounce} characters.` },
  hold: { label: "Note", hint: `Why it's parked. Shows on the card until you resume. Up to ${NOTE_LIMIT.hold} characters.` },
};

export function RejectActions({
  id,
  actions,
  reject,
}: {
  id: string;
  actions: RejectAction[];
  reject: (action: RejectAction, note: string) => Promise<ActionResult<void>>;
}) {
  const router = useRouter();
  const { lock, setLock } = useGateCardLock();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [panel, setPanel] = useState<RejectAction | null>(null);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  if (lock !== null) return null;
  if (actions.length === 0) return null;

  const run = (action: RejectAction) => {
    startTransition(async () => {
      const result = await reject(action, note);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(rejectToast(action, id));
      setLock({ label: rejectLockLabel(action), tone: LOCK_TONE[action] });
      router.refresh();
    });
  };

  const toggle = () => {
    setIsPanelOpen((value) => !value);
    setPanel(null);
    setNote("");
  };

  const choose = (action: RejectAction) => {
    setPanel((current) => (current === action ? null : action));
    setNote("");
  };

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={toggle} className="self-start text-xs text-quiet underline underline-offset-2">
        {isPanelOpen ? "Hide actions" : "More actions"}
      </button>
      {isPanelOpen ? (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={isPending}
                aria-expanded={panel === action}
                onClick={() => choose(action)}
                className={cn(
                  "text-xs underline underline-offset-2 disabled:opacity-50",
                  action === "discard" ? "text-risk" : "text-ink",
                  panel === action && "font-medium no-underline",
                )}
              >
                {rejectLabel(action)}
              </button>
            ))}
          </div>
          {panel === "bounce" || panel === "hold" ? (
            <div className="border-l-2 border-rule pl-3">
              <Field label={NOTE_COPY[panel].label} optional hint={NOTE_COPY[panel].hint}>
                <div className="flex gap-2">
                  <Input
                    value={note}
                    maxLength={NOTE_LIMIT[panel]}
                    onChange={(event) => setNote(event.target.value)}
                    className="flex-1"
                  />
                  <Button variant="quiet" disabled={isPending} onClick={() => run(panel)}>
                    {isPending ? rejectPendingLabel(panel) : rejectLabel(panel)}
                  </Button>
                </div>
              </Field>
            </div>
          ) : null}
          {panel === "discard" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-rule pl-3 text-xs">
              <span className="text-risk">This can&apos;t be undone. Discard {id}?</span>
              <span className="flex shrink-0 gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setPanel(null)}
                  className="text-quiet underline underline-offset-2 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run("discard")}
                  className="font-medium text-risk underline underline-offset-2 disabled:opacity-50"
                >
                  {isPending ? rejectPendingLabel("discard") : "Discard"}
                </button>
              </span>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
