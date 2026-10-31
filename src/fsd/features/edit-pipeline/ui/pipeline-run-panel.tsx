"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { nodeLabel, gateLabel } from "@/fsd/entities/pipeline";
import { Button } from "@/fsd/shared/ui/button";
import type { PipelineRunActions, RunPreparation } from "../model/run-pipeline-input";
import { PipelinePanel } from "./pipeline-panel";

type Preparation = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: RunPreparation };
export function PipelineRunPanel({ pipelineId, name, actions, targetKey, onClose }: { pipelineId: string; name: string; actions: PipelineRunActions; targetKey?: string; onClose: () => void }) {
  const router = useRouter();
  const [preparation, setPreparation] = useState<Preparation>({ status: "loading" });
  const [selected, setSelected] = useState("");
  const [agent, setAgent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const submitting = useRef(false), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    actions.prepare(pipelineId).then(result => {
      if (cancelled) return;
      if (!result.success) { setPreparation({ status: "error", message: result.error }); return; }
      setPreparation({ status: "ready", data: result.data });
      setAgent(result.data.agents[0] ?? "");
      const initial = result.data.targets.find(target => target.kind === "board" && target.key === targetKey);
      if (initial) setSelected(`board:${initial.id}`);
    }).catch(() => { if (!cancelled) setPreparation({ status: "error", message: "Couldn't load available work. Close and reopen Run to try again." }); });
    return () => { cancelled = true; alive.current = false; };
  }, [actions, pipelineId, targetKey]);
  const data = preparation.status === "ready" ? preparation.data : null;
  const target = data?.targets.find(candidate => `${candidate.kind}:${candidate.id}` === selected);
  const canStart = !!target && !target.reason && (target.kind === "board" || !!agent) && !pending && !unknown;
  async function start(): Promise<void> {
    if (!data || !target || !canStart || submitting.current) return;
    submitting.current = true; setPending(true); setError(null);
    try {
      const result = await actions.start({ pipelineId, graphKey: data.graphKey, targetId: target.id, targetKind: target.kind,
        agent: target.agent ?? agent, expectedUpdatedAt: target.updatedAt });
      if (!alive.current) return;
      if (!result.success) { setError(result.error); return; }
      router.push(result.data.href); router.refresh(); onClose();
    } catch {
      if (alive.current) { setUnknown(true); setError("The run may have started. Close this panel and check the work before trying again."); }
    } finally {
      submitting.current = false;
      if (alive.current) setPending(false);
    }
  }
  return <PipelinePanel title={`Run ${name}`} busy={pending} onClose={onClose}>
    {preparation.status === "loading" ? <p role="status" className="text-sm">Checking available work…</p> : null}
    {preparation.status === "error" ? <p role="alert" className="text-sm text-risk">{preparation.message}</p> : null}
    {data ? <div className="flex flex-col gap-6">
      <div><p className="text-xs text-quiet">Saved configuration</p><ol className="mt-2 flex flex-wrap items-center gap-2 text-sm">{data.nodes.map((node, index) => <li key={node}>
        {index > 0 ? <span aria-hidden="true" className="mr-2 text-quiet">→</span> : null}
        {data.gates.includes(`before-${node}`) ? <span className="mr-1 text-quiet">{gateLabel(`before-${node}`)} · </span> : null}{nodeLabel(node)}</li>)}</ol></div>
      <label className="flex flex-col gap-2 text-sm">Work to run on
        <select value={selected} disabled={pending || unknown} onChange={event => { setSelected(event.target.value); setError(null); }} className="w-full min-w-0 rounded-md border border-edge bg-paper p-2">
          <option value="">Choose work…</option>
          {(["backlog", "board"] as const).map(kind => <optgroup key={kind} label={kind === "backlog" ? "Start new work" : "Existing work"}>
            {data.targets.filter(candidate => candidate.kind === kind).map(candidate => <option key={candidate.id} value={`${kind}:${candidate.id}`}>{candidate.key} · {candidate.title}{candidate.reason ? " · Needs attention" : ""}</option>)}
          </optgroup>)}
        </select>
      </label>
      {!data.targets.length ? <p className="text-sm text-quiet">No work is available yet. Scout supplies backlog candidates; saved work will appear here.</p> : null}
      {target?.reason ? <p role="status" className="text-sm text-risk">{target.reason}</p> : null}
      {target?.kind === "backlog" ? <label className="flex flex-col gap-2 text-sm">Assignee<select value={agent} disabled={pending || unknown} onChange={event => setAgent(event.target.value)} className="rounded-md border border-edge bg-paper p-2">
        {!data.agents.length ? <option value="">Connect a workspace first</option> : null}{data.agents.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
      <p className="text-xs text-quiet">Your connected runner carries out these steps and waits at approval gates.{!data.nodes.includes("accept") ? " Completing this run does not accept the work." : " Work is accepted only after the Accept step passes."}</p>
      {error ? <p role="alert" className="text-sm text-risk">{error}</p> : null}
      <Button variant="mine" disabled={!canStart} onClick={() => void start()}>{pending ? "Starting…" : "Start run"}</Button>
    </div> : null}
  </PipelinePanel>;
}
