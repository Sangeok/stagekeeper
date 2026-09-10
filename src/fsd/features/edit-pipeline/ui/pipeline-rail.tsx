"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { BOUNDARY, NODE_KINDS, REQUIRED_NODES, TAIL_NODES, gateId } from "@harness/core/pipeline.mjs";
import { gateLabel, nodeAgentLabel, nodeLabel } from "@/fsd/entities/pipeline";
import type { ActionResult } from "@/fsd/shared/api/result";
import { Button } from "@/fsd/shared/ui/button";
import { Chip } from "@/fsd/shared/ui/chip";
import { addNode, insertGate, removeGate, removeNode, swapTail, type Graph, type Step } from "../model/rail-state";

export type SavePipelineAction = (graph: Graph) => Promise<ActionResult<void>>;

type Props = {
  graph: Graph;
  plan: string;
  roster: string[];
  editable: boolean;
  save: SavePipelineAction;
};

const BOUNDARIES = BOUNDARY as Record<string, { from: string; to: string } | undefined>;
const KINDS = NODE_KINDS as string[];
const REQUIRED = REQUIRED_NODES as string[];
const TAIL = TAIL_NODES as string[];

// 조작 하나 = 결과 그래프이거나 사유다. 사유는 core의 validateGraph가 쓴 문장 그대로라 저장 실패와 같은 말을 한다.
type Move = { label: string; step: Step };

// 레일. 노드 카드 한 줄, 노드 앞 간선마다 게이트 카드나 "+", 카드에 Remove·Swap.
// 국소 상태는 { nodes, gates } 하나뿐이고 저장 전에는 서버에 아무것도 가지 않는다(§E.6).
export function PipelineRail({ graph, plan, roster, editable, save }: Props) {
  const [state, setState] = useState<Graph>(graph);
  const [confirmingNoGate, setConfirmingNoGate] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(state) !== JSON.stringify(graph);
  const missing = KINDS.filter((k) => !state.nodes.includes(k));

  const apply = (step: Step) => {
    if (!step.ok) return;
    setState(step.graph);
    setConfirmingNoGate(false);
  };

  const onSave = () => {
    // 게이트 0개는 허용한다 — 다만 한 번은 무엇을 포기하는지 읽고 누르게 한다.
    if (state.gates.length === 0 && !confirmingNoGate) {
      setConfirmingNoGate(true);
      return;
    }
    startTransition(async () => {
      const result = await save(state);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setConfirmingNoGate(false);
      toast.success("Pipeline saved");
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-stretch gap-2">
        {state.nodes.map((kind, index) => (
          <div key={kind} className="flex items-stretch gap-2">
            <EdgeSlot
              gate={state.gates.includes(gateId(kind)) ? gateId(kind) : null}
              boundary={BOUNDARIES[gateId(kind)] ?? null}
              editable={editable}
              moves={[
                { label: "Add gate", step: insertGate(state, gateId(kind), plan) },
                ...missing.map((k) => ({ label: `Add ${nodeLabel(k)}`, step: addNode(state, k, plan) })),
              ]}
              onRemoveGate={() => apply(removeGate(state, gateId(kind), plan))}
              onPick={apply}
            />
            <NodeCard
              kind={kind}
              roster={roster}
              editable={editable}
              first={index === 0}
              removable={!REQUIRED.includes(kind)}
              swappable={TAIL.includes(kind) && state.nodes.filter((k) => TAIL.includes(k)).length === 2}
              onRemove={() => apply(removeNode(state, kind, plan))}
              onSwap={() => apply(swapTail(state, plan))}
            />
          </div>
        ))}
      </div>

      {state.gates.length === 0 ? (
        <p className="text-xs text-risk">
          No gate: agents run this item end to end without you. Reopen and discard stay on the web.
        </p>
      ) : null}
      {editable ? null : (
        <p className="text-xs text-quiet">Pipeline editing opens on Pro. The default pipeline stays as is.</p>
      )}
      {state.nodes.includes("scout") ? null : (
        <p className="text-xs text-quiet">Scout runs only with harness.json.scout — add it here when that is set.</p>
      )}

      <div className="flex items-center gap-3">
        <Button variant="mine" disabled={!editable || !dirty || pending} onClick={onSave}>
          {pending ? "Saving…" : confirmingNoGate ? "Save without a gate" : "Save"}
        </Button>
        {dirty ? (
          <button
            type="button"
            className="text-xs text-quiet underline underline-offset-2"
            onClick={() => {
              setState(graph);
              setConfirmingNoGate(false);
            }}
          >
            Discard changes
          </button>
        ) : null}
      </div>
    </div>
  );
}

// 노드 앞 간선. 게이트가 있으면 그 카드, 없으면 자동 경계 안내와 "+".
function EdgeSlot({
  gate,
  boundary,
  editable,
  moves,
  onRemoveGate,
  onPick,
}: {
  gate: string | null;
  boundary: { from: string; to: string } | null;
  editable: boolean;
  moves: Move[];
  onRemoveGate: () => void;
  onPick: (step: Step) => void;
}) {
  if (gate !== null) {
    return (
      <div className="flex min-w-[132px] flex-col justify-between gap-2 rounded-lg border border-edge bg-mine-soft px-3 py-2.5">
        <div className="flex flex-col items-start gap-1">
          <Chip tone="mine">Gate · you</Chip>
          <span className="text-sm font-medium">{gateLabel(gate)}</span>
        </div>
        <button
          type="button"
          disabled={!editable}
          className="self-start text-xs text-quiet underline underline-offset-2 disabled:opacity-50"
          onClick={onRemoveGate}
        >
          Remove
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      {boundary ? <span className="text-[11px] text-quiet">auto → {boundary.to}</span> : null}
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-md border border-rule px-2 py-1 text-xs text-quiet">+</summary>
        <div className="absolute left-0 z-10 mt-1 flex w-64 flex-col gap-1 rounded-md border border-edge bg-paper p-2">
          {moves.map((move) => (
            <div key={move.label} className="flex flex-col">
              <button
                type="button"
                disabled={!editable || !move.step.ok}
                className="rounded px-1.5 py-1 text-left text-xs hover:bg-field disabled:opacity-50"
                onClick={() => onPick(move.step)}
              >
                {move.label}
              </button>
              {move.step.ok ? null : <span className="px-1.5 text-[11px] text-quiet">{move.step.reason}</span>}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// 노드 카드. 누가 그 노드를 도는지 한 줄로 — plan·implement는 항목의 dev(roster), 그 밖은 노드의 에이전트.
function NodeCard({
  kind,
  roster,
  editable,
  first,
  removable,
  swappable,
  onRemove,
  onSwap,
}: {
  kind: string;
  roster: string[];
  editable: boolean;
  first: boolean;
  removable: boolean;
  swappable: boolean;
  onRemove: () => void;
  onSwap: () => void;
}) {
  const agent = nodeAgentLabel(kind, roster);
  return (
    <div className="flex min-w-[132px] flex-col justify-between gap-2 rounded-lg border border-rule bg-paper px-3 py-2.5">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{nodeLabel(kind)}</span>
        <span className="text-[11px] text-quiet">{kind === "accept" ? "the main loop" : agent === "" ? "nobody yet" : agent}</span>
      </div>
      {removable || swappable ? (
        <div className="flex gap-2">
          {removable ? (
            <button
              type="button"
              disabled={!editable}
              className="text-xs text-quiet underline underline-offset-2 disabled:opacity-50"
              onClick={onRemove}
            >
              Remove
            </button>
          ) : null}
          {swappable ? (
            <button
              type="button"
              disabled={!editable}
              className="text-xs text-quiet underline underline-offset-2 disabled:opacity-50"
              onClick={onSwap}
            >
              Swap
            </button>
          ) : null}
        </div>
      ) : (
        <span className="text-[11px] text-quiet">{first ? "start" : "required"}</span>
      )}
    </div>
  );
}
