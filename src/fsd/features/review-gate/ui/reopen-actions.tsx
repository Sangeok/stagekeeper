"use client";

import { useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";
import { SectionLabel } from "@/fsd/shared/ui/section-label";
import { reopenTargetsFor } from "../model/gate-source";
import {
  NOTE_LIMIT,
  REOPEN_NOTE_REQUIRED,
  reopenHint,
  reopenLabel,
  reopenPendingLabel,
  reopenPrimaryFor,
  reopenResultLine,
  reopenToast,
} from "../model/gate-text";
import type { TransitionAction } from "../model/inbox-item";
import { ReopenActionsBoundary } from "./reopen-actions-boundary";

const NOTE_HINT = `Which acceptance check failed. dev reads this before picking the item back up. Up to ${NOTE_LIMIT.reopen} characters.`;

type Props = {
  itemKey: string;
  status: string;
  updatedAt: string;
  transition: TransitionAction;
};

export function ReopenActions(props: Props): ReactElement {
  return <ReopenActionsBoundary><ReopenControls {...props} /></ReopenActionsBoundary>;
}

function ReopenControls({
  itemKey,
  status,
  updatedAt,
  transition: moveItem,
}: Props) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isNoteMissing, setIsNoteMissing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const targets = reopenTargetsFor(status);
  if (targets.length === 0) return null;
  const primary = reopenPrimaryFor(targets);
  const secondary = targets.find((to) => to !== primary);

  const choose = (to: string) => {
    setChosen(to);
    setNote("");
    setIsNoteMissing(false);
  };
  const run = (to: string) => {
    const result = reopenResultLine(note);
    if (result === null) {
      setIsNoteMissing(true);
      return;
    }
    startTransition(async () => {
      const outcome = await moveItem({ key: itemKey, to, result, expectedUpdatedAt: updatedAt });
      if (!outcome.success) {
        toast.error(outcome.error);
        return;
      }
      toast.success(reopenToast(to, itemKey));
      setChosen(null);
      router.refresh();
    });
  };

  return (
    <section>
      <SectionLabel>Reopen</SectionLabel>
      <div className="flex flex-col gap-2">
        {chosen === null ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button variant="mine-outline" onClick={() => choose(primary)}>
              {reopenLabel(primary)}
            </Button>
            {secondary !== undefined ? (
              <button type="button" onClick={() => choose(secondary)} className="text-sm text-ink underline underline-offset-2">
                {reopenLabel(secondary)} instead
              </button>
            ) : null}
          </div>
        ) : (
          <div className="border-l-2 border-rule pl-3">
            <Field label="Note to dev" hint={NOTE_HINT}>
              <Input
                value={note}
                maxLength={NOTE_LIMIT.reopen}
                onChange={(event) => {
                  setNote(event.target.value);
                  setIsNoteMissing(false);
                }}
              />
            </Field>
            {isNoteMissing ? <p className="mt-1 text-xs text-risk">{REOPEN_NOTE_REQUIRED}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button variant="mine-outline" disabled={isPending} onClick={() => run(chosen)}>
                {isPending ? reopenPendingLabel() : reopenLabel(chosen)}
              </Button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setChosen(null);
                  setNote("");
                  setIsNoteMissing(false);
                }}
                className="text-xs text-quiet underline underline-offset-2 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <p className="text-xs text-quiet">{reopenHint(chosen ?? primary)}</p>
      </div>
    </section>
  );
}
