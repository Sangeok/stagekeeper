"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { STEP_KINDS, REQUIRED_NODES, TAIL_NODES, PROJECT_AGENTS, gateId, refId, expand, sequence, usersOf, type Definition } from "@harness/core/pipeline.mjs";
import { autoEdgeLabel, gateLabel, gateTooltip, nodeAgentLabel, nodeLabel } from "@/fsd/entities/pipeline";
import { cn } from "@/fsd/shared/lib/class-name";
import { Button } from "@/fsd/shared/ui/button";
import { Chip } from "@/fsd/shared/ui/chip";
import { PIPELINE_EDIT_PLAN_GATE } from "../model/plan-gate";
import { PIPELINE_STALE, PIPELINE_UNKNOWN, type SavePipelineInput, type SavePipelineResult } from "../model/pipeline-save-state";
import { beginPipelineSave, createPipelineDraft, discardPipelineDraft, finishPipelineSave, isPipelineDirty, receivePipelineSnapshot, editPipelineDraft } from "../model/pipeline-draft-state";
import { addNode, addSlot, check, hasUngatedRunnable, insertRef, isProjectSlot, moveSlot, insertGate, removeGate, removeNode, preview, swapTail, type CompositionContext, type PipelineSnapshot, type Step } from "../model/rail-state";

export type SavePipelineAction = (input: SavePipelineInput) => Promise<SavePipelineResult>;
type Props = {
  pipelineId: string | null; name?: string; definition: Definition; expectedVersion?: number;
  pipelines: PipelineSnapshot[]; rules: Record<string, string>; plan: string; roster: string[];
  editable: boolean; save: SavePipelineAction; unavailableReason?: string;
  onSelect?: (id: string) => void; onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void; onSaved?: (id: string) => void;
};
type Move = { label: string; step: Step };

export function PipelineRail({ pipelineId, name, definition, expectedVersion = 0, pipelines, rules, plan, roster, editable, save, unavailableReason, onSelect, onDirtyChange, onBusyChange, onSaved }: Props) {
  const [editor, setEditor] = useState(() => createPipelineDraft({ definition, version: expectedVersion }));
  const [openEdge, setOpenEdge] = useState<string | null | false>(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmingNoGate, setConfirmingNoGate] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const [pending, startTransition] = useTransition();
  const saving = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const state = editor.definition, baseline = editor.baseline;
  const busy = editor.request.status === "saving";
  const recoveryMessage = editor.request.status === "stale" ? PIPELINE_STALE
    : editor.request.status === "unknown" ? PIPELINE_UNKNOWN : null;
  const dirty = isPipelineDirty(editor);
  // Includes dependency definitions and execution graphs: a child save does not increment its parent's definition version.
  const fingerprint = JSON.stringify({ pipelines, rules });
  const inputKey = JSON.stringify([fingerprint, definition, expectedVersion, plan, editable, roster]);
  const [seen, setSeen] = useState({ fingerprint, inputKey });
  if (seen.inputKey !== inputKey) {
    setSeen({ fingerprint, inputKey });
    setEditor(current => receivePipelineSnapshot(current, { definition, version: expectedVersion }));
    setOpenEdge(false);
    setConfirmingNoGate(false);
    if (dirty && seen.fingerprint !== fingerprint) setExternalChange(true);
  }
  const id = pipelineId ?? "draft:new";
  const definitions: Record<string, Definition> = Object.create(null);
  for (const pipeline of pipelines) definitions[pipeline.id] = pipeline.definition;
  const context: CompositionContext = { pipelineId: id, definitions,
    mustRun: pipelines.filter(pipeline => pipeline.isDefault || pipeline.runnable !== null || Object.values(rules).includes(pipeline.id)).map(pipeline => pipeline.id) };
  const composed = preview(state, plan, context);
  const validation = check(state, plan, context);
  const ungated = hasUngatedRunnable(composed);
  const activeDefinitions = Object.assign(Object.create(null), definitions, { [id]: state });
  const flat = expand(id, activeDefinitions);
  const names = (target: string): string => pipelines.find(pipeline => pipeline.id === target)?.name ?? target;
  const affected = usersOf(id, activeDefinitions);
  const canEdit = editable && !busy && !pending;
  const missing = STEP_KINDS.filter(kind => !isProjectSlot(kind) && !state.steps.includes(kind));
  const movesFor = (before: string | null): Move[] => [
    ...(before === null ? [] : [{ label: "Add gate", step: insertGate(state, gateId(before), plan, context) }]),
    ...PROJECT_AGENTS.map(agent => ({ label: `Add ${agent} here`, step: addSlot(state, agent, before, plan, context) })),
    ...state.steps.filter(isProjectSlot).map(slot => ({ label: `Move ${slot} here`, step: moveSlot(state, slot, before, plan, context) })),
    ...missing.map(kind => ({ label: `Add ${nodeLabel(kind)}`, step: addNode(state, kind, plan, context) })),
    ...pipelines.filter(pipeline => pipeline.id !== id).map(pipeline => ({ label: `Use ${pipeline.name} here`, step: insertRef(state, pipeline.id, before, plan, context) })),
  ];
  const applyIfValid = (step: Step): void => {
    if (!editable || saving.current || !step.ok) return;
    setEditor(current => editPipelineDraft(current, step.definition)); setOpenEdge(false); setConfirmingNoGate(false);
    onDirtyChange?.(JSON.stringify(step.definition) !== JSON.stringify(baseline.definition));
  };
  const onSave = (): void => {
    if (!canEdit || !dirty || !validation.ok || saving.current || editor.request.status !== "idle") return;
    if (ungated && !confirmingNoGate) { setConfirmingNoGate(true); return; }
    const started = beginPipelineSave(editor);
    if (started.request.status !== "saving") return;
    const input = { pipelineId, name, ...started.request.submitted };
    saving.current = true; setEditor(started); onBusyChange?.(true);
    startTransition(async () => {
      try {
        const result = await save(input);
        if (!alive.current) return;
        setEditor(current => finishPipelineSave(current, result));
        if (result.status === "error") toast.error(result.reason);
        else if (result.status === "success") {
          setConfirmingNoGate(false); setExternalChange(false);
          onDirtyChange?.(false); onSaved?.(result.pipelineId); toast.success("Pipeline saved");
        }
      } catch {
        if (!alive.current) return;
        setEditor(current => finishPipelineSave(current, { status: "unknown" }));
      } finally {
        saving.current = false;
        if (alive.current) onBusyChange?.(false);
      }
    });
  };
  const labelForGate = (gate: string): string => gateLabel(gate, names);
  const tooltipForGate = (step: string): string => {
    const target = refId(step);
    if (target === null) return gateTooltip(gateId(step));
    const block = expand(target, activeDefinitions);
    return block.ok ? gateTooltip(gateId(block.graph.nodes[0])) : block.reason;
  };
  return <div className="flex flex-col gap-4">
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={expanded} onChange={event => setExpanded(event.target.checked)} />Show expanded</label>
    <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
      {state.steps.map(kind => {
        const target = refId(kind);
        const block = target === null ? null : expand(target, activeDefinitions);
        if (expanded) {
          const nodes = block?.ok ? block.graph.nodes : target === null ? [kind] : [];
          return <div key={kind} className="flex shrink-0 gap-2 rounded-lg border border-edge p-3" aria-label={target === null ? nodeLabel(kind) : names(target)}>
            {target !== null ? <span className="text-xs text-quiet">{names(target)}</span> : null}
            {nodes.map(node => <div key={node} className="flex gap-2 text-sm">{flat.ok && flat.graph.gates.includes(gateId(node)) ? <Chip tone="mine">{gateLabel(gateId(node))}</Chip> : null}<span>{nodeLabel(node)}</span></div>)}
            {block && !block.ok ? <span className="text-xs text-risk">{block.reason}</span> : null}
          </div>;
        }
        return <div key={kind} className="flex shrink-0 items-stretch gap-2">
          <EdgeSlot gate={state.gates.includes(gateId(kind)) ? gateId(kind) : null} autoLabel={target === null ? autoEdgeLabel(kind) : null}
            label={labelForGate(gateId(kind))} tooltip={tooltipForGate(kind)} editable={canEdit} open={openEdge === kind}
            onToggle={() => { if (canEdit && !saving.current) setOpenEdge(openEdge === kind ? false : kind); }}
            removeGateStep={removeGate(state, gateId(kind), plan, context)} onApply={applyIfValid} />
          {target === null ? <NodeCard kind={kind} roster={roster} editable={canEdit}
            removable={!context.mustRun.includes(id) || !REQUIRED_NODES.includes(kind)}
            swappable={TAIL_NODES.includes(kind) && state.steps.filter(step => TAIL_NODES.includes(step)).length === 2}
            removeStep={removeNode(state, kind, plan, context)} swapStep={swapTail(state, plan, context)} onApply={applyIfValid} />
            : <div className="flex min-w-40 flex-col gap-3 rounded-lg border border-edge bg-field p-3">
              <span className="text-sm font-medium">{names(target)} · {block?.ok ? block.graph.nodes.length : "?"} nodes</span>
              <button type="button" className="text-left text-xs underline" disabled={busy || pending} onClick={() => onSelect?.(target)}>Edit {names(target)}</button>
              {canEdit ? <button type="button" className="text-left text-xs underline" disabled={!removeNode(state, kind, plan, context).ok} onClick={() => applyIfValid(removeNode(state, kind, plan, context))}>Remove</button> : null}
            </div>}
        </div>;
      })}
    </div>
    {editable && !expanded ? <button type="button" className="self-start text-xs underline" disabled={!canEdit} onClick={() => setOpenEdge(openEdge === null ? false : null)}>{state.steps.length ? "Add at end" : "Add first step"}</button> : null}
    {openEdge !== false && !expanded ? <div className="flex w-72 flex-col gap-1 rounded-md border border-edge bg-paper p-2">
      <p className="px-1.5 pb-1 text-xs text-quiet">{openEdge === null ? "At end" : labelForGate(gateId(openEdge))}</p>
      {movesFor(openEdge).map(move => <div key={move.label} className="flex flex-col">
        <button type="button" disabled={!canEdit || !move.step.ok} className="rounded px-1.5 py-1 text-left text-xs hover:bg-field disabled:opacity-50" onClick={() => applyIfValid(move.step)}>{move.label}</button>
        {move.step.ok ? null : <span className="px-1.5 text-[11px] text-quiet">{move.step.reason}</span>}
      </div>)}
    </div> : null}
    {affected.length ? <p className="text-xs text-quiet">Also changes: {affected.map(names).join(", ")}</p> : null}
    {!validation.ok ? <p className="text-xs text-risk">{validation.reason}</p> : null}
    {ungated ? <p className="text-xs text-risk">No gate: plan and implementation start without your approval. Acceptance is still required. Reopen and discard stay on the web.</p> : null}
    {!editable ? <p className="text-xs text-quiet">{unavailableReason ?? PIPELINE_EDIT_PLAN_GATE}</p> : null}
    {editable || dirty || recoveryMessage !== null || externalChange ? <div className="flex items-center gap-3">
      {editable ? <Button variant="mine" disabled={!dirty || !canEdit || !validation.ok || recoveryMessage !== null} onClick={onSave}>{busy || pending ? "Saving…" : confirmingNoGate ? "Save without a gate" : "Save"}</Button> : null}
      {dirty || recoveryMessage !== null || externalChange ? <button type="button" className="text-xs text-quiet underline" disabled={busy || pending} onClick={() => {
        if (saving.current) return;
        if (recoveryMessage !== null || externalChange) { window.location.reload(); return; }
        setEditor(discardPipelineDraft); setConfirmingNoGate(false); onDirtyChange?.(false);
      }}>{recoveryMessage !== null || externalChange ? "Discard changes and reload" : "Discard changes"}</button> : null}
    </div> : null}
    {recoveryMessage ? <p role="alert" className="text-xs text-risk">{recoveryMessage}</p> : null}
    {externalChange ? <p role="alert" className="text-xs text-risk">The saved pipelines changed. Your draft is still here. The preview uses the latest references. Discard changes and reload to edit the latest saved definition.</p> : null}
    <details className="text-sm"><summary className="cursor-pointer text-xs text-quiet underline">Read as text</summary>
      {flat.ok ? <ol className="mt-2 flex flex-col gap-1">{sequence(flat.graph).map((node, index) => <li key={node}>{index + 1}. {node.startsWith("before-") ? `${gateLabel(node)} — you` : nodeLabel(node)}</li>)}</ol> : <p>{flat.reason}</p>}
    </details>
  </div>;
}

// 노드 앞 간선. 게이트가 있으면 그 카드, 없으면 자동 경계 안내와 "+".
// "+"는 여는 스위치일 뿐이고 메뉴 자체는 레일 밖에 있다 — 그래서 이 칸의 너비는 열려도 그대로다.
function EdgeSlot({
  gate,
  label,
  tooltip,
  autoLabel,
  editable,
  open,
  onToggle,
  removeGateStep,
  onApply,
}: {
  gate: string | null;
  label?: string;
  tooltip?: string;
  autoLabel: string | null;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  removeGateStep: Step;
  onApply: (step: Step) => void;
}) {
  // 툴팁은 칩이 아니라 카드 전체에 건다 — 무엇을 뜻하는지 묻는 곳은 카드다. 비활성 Remove는 자기 사유가 우선한다(§18).
  if (gate !== null) {
    return (
      <div title={tooltip ?? gateTooltip(gate)} className="flex min-w-[132px] flex-col justify-between gap-2 rounded-lg border border-edge bg-mine-soft px-3 py-2.5">
        <div className="flex flex-col items-start gap-1">
          <Chip tone="mine">Gate · you</Chip>
          <span className="text-sm font-medium">{label ?? gateLabel(gate)}</span>
        </div>
        {editable ? <div className="flex items-center justify-between gap-3"><button
          type="button"
          disabled={!removeGateStep.ok}
          title={removeGateStep.ok ? undefined : removeGateStep.reason}
          className="self-start text-xs text-quiet underline underline-offset-2 disabled:opacity-50"
          onClick={() => onApply(removeGateStep)}
        >
          Remove
        </button><button type="button" aria-label={`Insert ${label ?? gateLabel(gate)}`} aria-expanded={open}
          className={cn("rounded-md border px-2 py-1 text-xs", open ? "border-mine bg-mine-soft text-mine" : "border-rule text-quiet")}
          onClick={onToggle}>+</button></div> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      {autoLabel ? <span className="text-[11px] text-quiet">{autoLabel}</span> : null}
      {editable ? <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "rounded-md border px-2 py-1 text-center text-xs",
          open ? "border-mine bg-mine-soft text-mine" : "border-rule text-quiet",
        )}
      >
        +
      </button> : null}
    </div>
  );
}

// 노드 카드. 누가 그 노드를 도는지 한 줄로 — plan·implement는 항목의 dev(roster), 그 밖은 노드의 에이전트.
function NodeCard({
  kind,
  roster,
  editable,
  removable,
  swappable,
  removeStep,
  swapStep,
  onApply,
}: {
  kind: string;
  roster: string[];
  editable: boolean;
  removable: boolean;
  swappable: boolean;
  removeStep: Step;
  swapStep: Step;
  onApply: (step: Step) => void;
}) {
  const agent = nodeAgentLabel(kind, roster);
  return (
    <div className="flex min-w-[132px] flex-col justify-between gap-2 rounded-lg border border-rule bg-paper px-3 py-2.5">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{nodeLabel(kind)}</span>
        <span className="text-[11px] text-quiet">{kind === "accept" ? "the main loop" : agent === "" ? "nobody yet" : agent}</span>
      </div>
      {editable && (removable || swappable) ? (
        <div className="flex gap-2">
          {removable ? (
            <button
              type="button"
              disabled={!removeStep.ok}
              title={removeStep.ok ? undefined : removeStep.reason}
              className="text-xs text-quiet underline underline-offset-2 disabled:opacity-50"
              onClick={() => onApply(removeStep)}
            >
              Remove
            </button>
          ) : null}
          {swappable ? (
            <button
              type="button"
              disabled={!swapStep.ok}
              title={swapStep.ok ? undefined : swapStep.reason}
              className="text-xs text-quiet underline underline-offset-2 disabled:opacity-50"
              onClick={() => onApply(swapStep)}
            >
              Swap
            </button>
          ) : null}
        </div>
      ) : null}
      {!removable && !swappable ? <span className="text-[11px] text-quiet">required</span> : null}
    </div>
  );
}
