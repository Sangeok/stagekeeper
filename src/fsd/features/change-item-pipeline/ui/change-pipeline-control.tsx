"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import type { ChangePipelineInput } from "../model/change-input";

export type ChangePipelineAction = (input: ChangePipelineInput) => Promise<ActionResult<null>>;
type Props = { itemKey: string; updatedAt: string; pipelines: { id: string; name: string }[]; change: ChangePipelineAction };
export function ChangePipelineControl({ itemKey, updatedAt, pipelines, change }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null), [unknown, setUnknown] = useState(false);
  const working = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const submit = (): void => {
    if (working.current || unknown || !pipelines.some(pipeline => pipeline.id === selected)) return;
    working.current = true; setError(null);
    const input = { key: itemKey, pipelineId: selected, expectedUpdatedAt: updatedAt };
    startTransition(async () => {
      try {
        const result = await change(input);
        if (!alive.current) return;
        if (!result.success) { setError(result.error); return; }
        router.refresh();
      } catch {
        if (!alive.current) return;
        setUnknown(true); setError("Couldn't confirm whether the pipeline changed. Refresh to check the current state before trying again.");
      } finally { working.current = false; }
    });
  };
  if (pipelines.length === 0) return null;
  return <div className="flex flex-col items-start gap-2">
    <label className="flex items-center gap-3 text-sm">Change pipeline<select aria-label="Change pipeline" value={selected} disabled={pending || unknown} className="rounded border border-edge bg-paper p-1" onChange={event => setSelected(event.target.value)}>
      <option value="">Choose a pipeline</option>{pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
    </select></label>
    <Button size="sm" disabled={pending || unknown || selected === ""} onClick={submit}>{pending ? "Changing…" : "Change pipeline"}</Button>
    {error ? <><p role="alert" className="text-xs text-risk">{error}</p><button type="button" className="text-xs underline" disabled={pending} onClick={() => window.location.reload()}>Refresh</button></> : null}
  </div>;
}
