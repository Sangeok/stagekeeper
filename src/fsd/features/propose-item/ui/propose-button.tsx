"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";

export type ProposeAction = (input: { key: string; agent: string; reason: string }) => Promise<ActionResult<void>>;

const REASON_MAX = 150;

// 백로그 행에서 항목을 직접 보드에 올린다 — pm을 부르지 않고. 사유 문구는 서버의 것을 그대로 보여 준다
// ("open items: 2 (max 2)" 등). 실패를 이 행 아래에 붙이는 것은 RemoveBacklogButton과 같은 이유다(§E.7).
export function ProposeButton({ itemKey, roster, propose }: { itemKey: string; roster: string[]; propose: ProposeAction }) {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState(roster[0] ?? "");
  const [reason, setReason] = useState("owner");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button size="sm" variant="mine-outline" onClick={() => setOpen(true)}>
        Put on the board
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 py-1 text-left">
      <Field label="Assignee" className="w-40">
        <select
          value={agent}
          disabled={pending}
          onChange={(e) => setAgent(e.target.value)}
          className="w-full rounded-md border border-edge bg-paper px-2.5 py-[7px] text-sm leading-5 text-ink disabled:opacity-50"
        >
          {roster.length === 0 ? <option value="">No workspace yet</option> : null}
          {roster.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Evidence" className="w-56" hint="Why this one, now.">
        <Input value={reason} maxLength={REASON_MAX} disabled={pending} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="mine"
          disabled={pending || agent === ""}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await propose({ key: itemKey, agent, reason });
                if (!result.success) {
                  setError(result.error);
                  return;
                }
                setError(null);
                setOpen(false);
                toast.success(`Put on the board · ${itemKey}`);
              } catch {
                setError("Couldn't put it on the board. Try again.");
              }
            })
          }
        >
          {pending ? "Putting…" : "Put on the board"}
        </Button>
        <Button size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-xs text-risk">{error}</p> : null}
    </div>
  );
}
