"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FIELD_BUDGET } from "@/fsd/entities/board-item";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Field, Input } from "@/fsd/shared/ui/field";
import type { ProposeInput } from "../model/propose-input";

export type ProposeAction = (input: ProposeInput) => Promise<ActionResult<void> & { resetPipeline?: boolean }>;

export function ProposeButton({ itemKey, roster, propose, pipelines, preselected }: { itemKey: string; roster: string[]; propose: ProposeAction; pipelines: { id: string; name: string }[]; preselected: string }) {
  const [open, setOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const agent = selectedAgent !== null && roster.includes(selectedAgent) ? selectedAgent : roster[0] ?? "";
  const [reason, setReason] = useState("owner");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [pipelineId, setPipelineId] = useState(preselected);
  const fingerprint = JSON.stringify({ itemKey, preselected, pipelines });
  const [seen, setSeen] = useState(fingerprint);
  const [selectionSource, setSelectionSource] = useState({ itemKey, preselected });
  const submitting = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  if (!pending && seen !== fingerprint) {
    setSeen(fingerprint);
    if (selectionSource.itemKey !== itemKey || selectionSource.preselected !== preselected || !pipelines.some(pipeline => pipeline.id === pipelineId)) setPipelineId(preselected);
    setSelectionSource({ itemKey, preselected });
  }

  if (!open) {
    return (
      <Button size="sm" variant="mine-outline" onClick={() => setOpen(true)}>
        Put on the board
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 py-1 text-left">
      <Field label="Pipeline" className="w-56">
        <select aria-label="Pipeline" value={pipelineId} disabled={pending} onChange={event => setPipelineId(event.target.value)} className="w-full rounded-md border border-edge bg-paper px-2.5 py-[7px] text-sm">
          {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
        </select>
      </Field>
      <Field label="Assignee" className="w-40">
        <select
          value={agent}
          disabled={pending}
          onChange={(e) => setSelectedAgent(e.target.value)}
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
        <Input value={reason} maxLength={FIELD_BUDGET} disabled={pending} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="mine"
          disabled={pending || agent === ""}
          onClick={() => {
            if (submitting.current) return;
            submitting.current = true;
            const input = { key: itemKey, agent, reason, pipelineId };
            startTransition(async () => {
              try {
                const result = await propose(input);
                if (!alive.current) return;
                if (!result.success) {
                  setError(result.error);
                  if (result.resetPipeline) setPipelineId(preselected);
                  return;
                }
                setError(null);
                setOpen(false);
                toast.success(`Put on the board · ${itemKey}`);
              } catch {
                if (!alive.current) return;
                setError("Couldn't put it on the board. Try again.");
              } finally { submitting.current = false; }
            });
          }}
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
