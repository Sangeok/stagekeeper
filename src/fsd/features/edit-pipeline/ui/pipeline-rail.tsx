"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { STEP_KINDS, REQUIRED_NODES, TAIL_NODES, PROJECT_AGENTS, gateId, refId, expand, sequence, usersOf, type Definition } from "@harness/core/pipeline/pipeline.mjs";
import { autoEdgeLabel, gateLabel, gateTooltip, nodeAgentLabel, nodeLabel } from "@/fsd/entities/pipeline";
import { cn } from "@/fsd/shared/lib/class-name";
import { Button } from "@/fsd/shared/ui/button";
import { Chip } from "@/fsd/shared/ui/chip";
import { PIPELINE_EDIT_PLAN_GATE } from "../model/plan-gate";
import { PIPELINE_STALE, PIPELINE_UNKNOWN, type SavePipelineInput, type SavePipelineResult } from "../model/pipeline-save-state";
import { beginPipelineSave, createPipelineDraft, discardPipelineDraft, finishPipelineSave, isPipelineDirty, receivePipelineSnapshot, editPipelineDraft } from "../model/pipeline-draft-state";
import { addNode, addSlot, check, hasUngatedRunnable, insertRef, isProjectSlot, moveSlot, insertGate, removeGate, removeNode, preview, swapTail, type CompositionContext, type PipelineSnapshot, type Step } from "../model/rail-state";
import { findInsertionConflicts, type InsertionConflicts } from "../model/insertion-conflicts";

export type SavePipelineAction = (input: SavePipelineInput) => Promise<SavePipelineResult>;
type Props = {
  pipelineId: string | null; name?: string; definition: Definition; expectedVersion?: number;
  pipelines: PipelineSnapshot[]; rules: Record<string, string>; plan: string; roster: string[];
  editable: boolean; save: SavePipelineAction; unavailableReason?: string;
  onSelect?: (id: string) => void; onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void; onSaved?: (id: string) => void;
};
type Move = {
  label: string;
  step: Step;
  reference?: { id: string; name: string; conflicts: InsertionConflicts | null };
};
type EdgeMenuState = { kind: "closed" } | { kind: "open"; before: string | null; inspectedPipelineId?: string };

export function PipelineRail({ pipelineId, name, definition, expectedVersion = 0, pipelines, rules, plan, roster, editable, save, unavailableReason, onSelect, onDirtyChange, onBusyChange, onSaved }: Props) {
  const [editor, setEditor] = useState(() => createPipelineDraft({ definition, version: expectedVersion }));
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenuState>({ kind: "closed" });
  const [expanded, setExpanded] = useState(false);
  const [confirmingNoGate, setConfirmingNoGate] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const [pending, startTransition] = useTransition();
  const conflictDescriptionId = useId();
  const stepElements = useRef(new Map<string, HTMLDivElement>());
  const saving = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const draftDefinition = editor.definition, baseline = editor.baseline;
  const busy = editor.request.status === "saving";
  const recoveryMessage = editor.request.status === "stale" ? PIPELINE_STALE
    : editor.request.status === "unknown" ? PIPELINE_UNKNOWN : null;
  const dirty = isPipelineDirty(editor);
  const fingerprint = JSON.stringify({ pipelines, rules });
  const inputKey = JSON.stringify([fingerprint, definition, expectedVersion, plan, editable, roster]);
  const [seen, setSeen] = useState({ fingerprint, inputKey });
  if (seen.inputKey !== inputKey) {
    setSeen({ fingerprint, inputKey });
    setEditor(current => receivePipelineSnapshot(current, { definition, version: expectedVersion }));
    setEdgeMenu({ kind: "closed" });
    setConfirmingNoGate(false);
    if (dirty && seen.fingerprint !== fingerprint) setExternalChange(true);
  }
  const id = pipelineId ?? "draft:new";
  const definitions: Record<string, Definition> = Object.create(null);
  for (const pipeline of pipelines) definitions[pipeline.id] = pipeline.definition;
  const context: CompositionContext = { pipelineId: id, definitions,
    mustRun: pipelines.filter(pipeline => pipeline.isDefault || Object.values(rules).includes(pipeline.id)).map(pipeline => pipeline.id) };
  const draftComposition = preview(draftDefinition, plan, context);
  const validation = check(draftDefinition, plan, context);
  const ungated = hasUngatedRunnable(draftComposition);
  const draftDefinitions = Object.assign(Object.create(null), definitions, { [id]: draftDefinition });
  const expandedDraft = expand(id, draftDefinitions);
  const savedDefinitions = Object.assign(Object.create(null), definitions, { [id]: definition });
  const savedGraph = expand(id, savedDefinitions);
  const names = (target: string): string => pipelines.find(pipeline => pipeline.id === target)?.name ?? target;
  const affected = usersOf(id, draftDefinitions);
  const canEdit = editable && !busy && !pending;
  const missing = STEP_KINDS.filter(kind => !isProjectSlot(kind) && !draftDefinition.steps.includes(kind));
  const movesFor = (before: string | null): Move[] => [
    ...(before === null ? [] : [{ label: "Add gate", step: insertGate(draftDefinition, gateId(before), plan, context) }]),
    ...PROJECT_AGENTS.map(agent => ({ label: `Add ${agent} here`, step: addSlot(draftDefinition, agent, before, plan, context) })),
    ...draftDefinition.steps.filter(isProjectSlot).map(slot => ({ label: `Move ${slot} here`, step: moveSlot(draftDefinition, slot, before, plan, context) })),
    ...missing.map(kind => ({ label: `Add ${nodeLabel(kind)}`, step: addNode(draftDefinition, kind, plan, context) })),
    ...pipelines.filter(pipeline => pipeline.id !== id).map(pipeline => {
      const step = insertRef(draftDefinition, pipeline.id, before, plan, context);
      const hasDuplicates = !step.ok && (step.reason === "a node appears twice" || step.reason === "a step appears twice");
      return {
        label: `Insert pipeline: ${pipeline.name}`, step,
        reference: {
          id: pipeline.id, name: pipeline.name,
          conflicts: hasDuplicates ? findInsertionConflicts(draftDefinition, pipeline.id, draftDefinitions) : null,
        },
      };
    }),
  ];
  const moves = edgeMenu.kind === "open" ? movesFor(edgeMenu.before) : [];
  const inspectedPipelineId = edgeMenu.kind === "open" ? edgeMenu.inspectedPipelineId : undefined;
  const inspectedReference = moves.find(move => move.reference !== undefined && move.reference.id === inspectedPipelineId)?.reference;
  const conflictingSteps = new Set(inspectedReference?.conflicts?.stepIds ?? []);
  const conflictingNodes = new Set(inspectedReference?.conflicts?.nodes ?? []);
  const registerStep = (step: string, element: HTMLDivElement | null): void => {
    if (element) stepElements.current.set(step, element);
    else stepElements.current.delete(step);
  };
  const showConflicts = (move: Move): void => {
    const reference = move.reference;
    if (edgeMenu.kind !== "open" || !reference?.conflicts) return;
    setEdgeMenu({ ...edgeMenu, inspectedPipelineId: reference.id });
    stepElements.current.get(reference.conflicts.stepIds[0])?.scrollIntoView({ block: "nearest", inline: "center" });
  };
  const applyIfValid = (step: Step): void => {
    if (!editable || saving.current || !step.ok) return;
    setEditor(current => editPipelineDraft(current, step.definition)); setEdgeMenu({ kind: "closed" }); setConfirmingNoGate(false);
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
    const block = expand(target, draftDefinitions);
    return block.ok ? gateTooltip(gateId(block.graph.nodes[0])) : block.reason;
  };
  return <div className="flex flex-col gap-4">
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={expanded} onChange={event => setExpanded(event.target.checked)} />Show expanded</label>
    <div className="flex items-stretch gap-2 overflow-x-auto p-1">
      {draftDefinition.steps.map(kind => {
        const target = refId(kind);
        const block = target === null ? null : expand(target, draftDefinitions);
        const hasConflict = conflictingSteps.has(kind);
        if (expanded) {
          const nodes = block?.ok ? block.graph.nodes : target === null ? [kind] : [];
          return <div key={kind} ref={element => registerStep(kind, element)}
            className={cn("flex shrink-0 gap-2 rounded-lg border border-edge p-3", hasConflict && "border-risk bg-risk-soft")}
            role="group" aria-label={target === null ? nodeLabel(kind) : names(target)} aria-describedby={hasConflict ? conflictDescriptionId : undefined}>
            {target !== null ? <span className="text-xs text-quiet">{names(target)}</span> : null}
            {nodes.map(node => <div key={node} className={cn("flex gap-2 text-sm", conflictingNodes.has(node) && "text-risk")}>{expandedDraft.ok && expandedDraft.graph.gates.includes(gateId(node)) ? <Chip tone="mine">{gateLabel(gateId(node))}</Chip> : null}<span>{nodeLabel(node)}</span>{conflictingNodes.has(node) ? <span className="text-xs">Already used</span> : null}</div>)}
            {block && !block.ok ? <span className="text-xs text-risk">{block.reason}</span> : null}
          </div>;
        }
        return <div key={kind} className="flex shrink-0 items-stretch gap-2">
          <EdgeSlot gate={draftDefinition.gates.includes(gateId(kind)) ? gateId(kind) : null} autoLabel={target === null ? autoEdgeLabel(kind) : null}
            label={labelForGate(gateId(kind))} tooltip={tooltipForGate(kind)} editable={canEdit} open={edgeMenu.kind === "open" && edgeMenu.before === kind}
            onToggle={() => { if (canEdit && !saving.current) setEdgeMenu(edgeMenu.kind === "open" && edgeMenu.before === kind ? { kind: "closed" } : { kind: "open", before: kind }); }}
            removeGateStep={removeGate(draftDefinition, gateId(kind), plan, context)} onApply={applyIfValid} />
          <div ref={element => registerStep(kind, element)} role="group" aria-label={target === null ? nodeLabel(kind) : names(target)}
            aria-describedby={hasConflict ? conflictDescriptionId : undefined}
            className={cn("flex flex-col gap-1 rounded-lg", hasConflict && "outline-2 outline-offset-2 outline-risk")}>
          {target === null ? <NodeCard kind={kind} roster={roster} editable={canEdit}
            removable={!context.mustRun.includes(id) || !REQUIRED_NODES.includes(kind)}
            swappable={TAIL_NODES.includes(kind) && draftDefinition.steps.filter(step => TAIL_NODES.includes(step)).length === 2}
            removeStep={removeNode(draftDefinition, kind, plan, context)} swapStep={swapTail(draftDefinition, plan, context)} onApply={applyIfValid} />
            : <div className="flex min-w-40 flex-col gap-3 rounded-lg border border-edge bg-field p-3">
              <span className="text-sm font-medium">{names(target)}</span>
              <details><summary className="cursor-pointer text-xs text-quiet">{block?.ok ? block.graph.nodes.length : "?"} steps</summary>
                {block?.ok ? <ol className="mt-2 flex flex-col gap-2 text-xs">{block.graph.nodes.map(node => <li key={node}>{block.graph.gates.includes(gateId(node)) ? `${gateLabel(gateId(node))} · ` : ""}{nodeLabel(node)}</li>)}</ol> : <p className="mt-2 text-xs text-risk">{block && !block.ok ? block.reason : "Pipeline not found"}</p>}
              </details>
              <button type="button" className="text-left text-xs underline" disabled={busy || pending} onClick={() => onSelect?.(target)}>Open pipeline</button>
              {canEdit ? <button type="button" className="text-left text-xs underline" disabled={!removeNode(draftDefinition, kind, plan, context).ok} onClick={() => applyIfValid(removeNode(draftDefinition, kind, plan, context))}>Remove</button> : null}
            </div>}
          {hasConflict ? <span className="max-w-48 px-1 text-xs text-risk">Already used{target !== null && block?.ok ? `: ${block.graph.nodes.filter(node => conflictingNodes.has(node)).map(nodeLabel).join(", ")}` : ""}</span> : null}
          </div>
        </div>;
      })}
    </div>
    {inspectedReference?.conflicts ? <p id={conflictDescriptionId} role="status" className="rounded-lg border border-risk bg-risk-soft px-3 py-2 text-sm text-risk">
      Cannot add {inspectedReference.name} here. Already used: {inspectedReference.conflicts.nodes.map(nodeLabel).join(", ")}. The same step cannot appear twice in one pipeline.
    </p> : null}
    {editable && !expanded ? <button type="button" className="self-start text-xs underline" disabled={!canEdit} onClick={() => setEdgeMenu(edgeMenu.kind === "open" && edgeMenu.before === null ? { kind: "closed" } : { kind: "open", before: null })}>{draftDefinition.steps.length ? "Add at end" : "Add first step"}</button> : null}
    {edgeMenu.kind === "open" && !expanded ? <div className="flex w-72 max-w-full flex-col gap-1 rounded-md border border-edge bg-paper p-2">
      <p className="px-1.5 pb-1 text-xs text-quiet">{edgeMenu.before === null ? "At end" : labelForGate(gateId(edgeMenu.before))}</p>
      {([false, true] as const).map(references => <section key={String(references)} className="flex flex-col gap-1" aria-label={references ? "Insert pipeline" : "Add step"}>
      <h3 className="mt-2 px-1.5 text-xs font-medium">{references ? "Insert pipeline" : "Add step"}</h3>
      {moves.filter(move => !!move.reference === references).map(move => <div key={move.label} className="flex flex-col">
        <button type="button" disabled={!canEdit || !move.step.ok} className="rounded px-1.5 py-1 text-left text-xs hover:bg-field disabled:opacity-50" onClick={() => applyIfValid(move.step)}>{move.label}</button>
        {move.step.ok ? null : <p className="px-1.5 text-xs text-quiet">{move.reference?.conflicts
          ? `Cannot add here. Already used: ${move.reference.conflicts.nodes.map(nodeLabel).join(", ")}. The same step cannot appear twice in one pipeline.`
          : move.step.reason}</p>}
        {move.reference?.conflicts ? <button type="button" disabled={!canEdit} aria-pressed={move.reference.id === inspectedPipelineId}
          aria-label={`Show conflicting steps for ${move.reference.name}`}
          className="self-start px-1.5 py-1 text-xs underline underline-offset-2 disabled:opacity-50"
          onClick={() => showConflicts(move)}>Show conflicting steps</button> : null}
      </div>)}</section>)}
    </div> : null}
    {affected.length ? <p className="text-xs text-quiet">Also changes: {affected.map(names).join(", ")}</p> : null}
    {!validation.ok ? <p className="text-xs text-risk">{validation.reason}</p> : null}
    {ungated ? <p className="text-xs text-risk">No approval gates: these steps continue automatically once the run starts.</p> : null}
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
      {savedGraph.ok ? <ol className="mt-2 flex flex-col gap-1">{sequence(savedGraph.graph).map((node, index) => <li key={node}>{index + 1}. {node.startsWith("before-") ? `${gateLabel(node)} — you` : nodeLabel(node)}</li>)}</ol> : <p>{savedGraph.reason}</p>}
    </details>
  </div>;
}

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
        aria-label={label === undefined ? "Insert step" : `Insert ${label}`}
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
