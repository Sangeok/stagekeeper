// 사람 동작의 낱말. 버튼은 동사, 성공 뒤 칩은 결과, 토스트는 같은 낱말을 잇는다(product-copy.md §3).
// ApcH transition-pipeline-gate/model/transitions.ts(de25a1c)에서 문구·칩 재료만 옮겼고 은유(도장)는 버렸다.

// 카드 잠금 표식: 도장·반려 성공 뒤 버튼 자리를 대신하는 비상호작용 칩의 재료.
export type CardLock = { label: string; marker: string };

export type RejectAction = "bounce" | "hold" | "discard";

// 게이트 — 목적지 status가 키다(gateTargetFor가 돌려주는 값).
const GATE_ACTION: Record<string, { label: string; pending: string; lock: string; toast: string; hint: string }> = {
  planning: {
    label: "Request plan",
    pending: "Requesting…",
    lock: "Plan requested",
    toast: "Plan requested",
    hint: "Then run dev in Claude Code. It writes the plan.",
  },
  implementing: {
    label: "Approve implementation",
    pending: "Approving…",
    lock: "Approved",
    toast: "Implementation approved",
    hint: "Then run dev in Claude Code. It changes the code.",
  },
};

export function gateActionLabel(to: string): string {
  return GATE_ACTION[to]?.label ?? `Move to ${to}`;
}
export function gatePendingLabel(to: string): string {
  return GATE_ACTION[to]?.pending ?? "Moving…";
}
export function gateLockLabel(to: string): string {
  return GATE_ACTION[to]?.lock ?? "Done";
}
export function gateToast(to: string, key: string): string {
  return `${GATE_ACTION[to]?.toast ?? "Moved"} · ${key}`;
}
// 누르기 전에 보여 준다 — 누른 뒤 토스트로 말하면 이미 늦다.
export function gateNextActionHint(to: string): string {
  return GATE_ACTION[to]?.hint ?? "Then continue in Claude Code.";
}

// 재개 — on_hold에서 돌아가는 두 목적지.
const RESUME: Record<string, string> = {
  planning: "Resume planning",
  implementing: "Resume implementation",
};
export function resumeLabel(to: string): string {
  return RESUME[to] ?? `Resume as ${to}`;
}
export function resumeToast(to: string, key: string): string {
  return `Resumed · ${key} is ${to === "planning" ? "planning" : "implementing"}`;
}

// 되돌리기·보류·폐기.
const REJECT: Record<RejectAction, { label: string; pending: string; lock: string }> = {
  bounce: { label: "Send back", pending: "Sending back…", lock: "Sent back" },
  hold: { label: "Put on hold", pending: "Putting on hold…", lock: "On hold" },
  discard: { label: "Discard", pending: "Discarding…", lock: "Discarded" },
};
export function rejectLabel(action: RejectAction): string {
  return REJECT[action].label;
}
export function rejectPendingLabel(action: RejectAction): string {
  return REJECT[action].pending;
}
export function rejectLockLabel(action: RejectAction): string {
  return REJECT[action].lock;
}
export function rejectToast(action: RejectAction, key: string): string {
  if (action === "discard") return `Discarded ${key}. This can't be undone.`;
  if (action === "hold") return `Put on hold · ${key}`;
  return `Sent back to planning · ${key}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 보류할 때 result에 남기는 고정 문구(≤150자). 결정론적: 호출자가 Date를 넘긴다.
export function holdResultLine(today: Date): string {
  const date = `${today.getUTCFullYear()}-${pad2(today.getUTCMonth() + 1)}-${pad2(today.getUTCDate())}`;
  return `On hold by owner (${date}). Not discarded — still in the backlog. Resume to Planning or Implementing.`;
}
