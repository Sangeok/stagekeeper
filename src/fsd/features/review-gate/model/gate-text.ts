// 사람 동작의 낱말. 버튼은 동사, 성공 뒤 칩은 결과, 토스트는 같은 낱말을 잇는다(product-copy.md §3).
// ApcH transition-pipeline-gate/model/transitions.ts(de25a1c)에서 문구·칩 재료만 옮겼고 은유(도장)는 버렸다.
import { TEXT_LIMIT } from "@harness/core/transitions.mjs";

// 카드 잠금 표식: 게이트·되돌리기 성공 뒤 버튼 자리를 대신하는 비상호작용 칩의 재료.
export type CardLock = { label: string; tone: "mine" | "risk" | "done" };

export type RejectAction = "bounce" | "hold" | "discard";

// 게이트 — 목적지 status가 키다(gateTargetFor가 돌려주는 값). hint는 누르기 전에 버튼 아래서 결과를 말한다.
const GATE_ACTION: Record<string, { label: string; pending: string; lock: string; toast: string; hint: string }> = {
  planning: {
    label: "Request plan",
    pending: "Requesting…",
    lock: "Plan requested",
    toast: "Plan requested",
    hint: "dev writes a plan. Nothing changes in the code yet.",
  },
  implementing: {
    label: "Approve implementation",
    pending: "Approving…",
    lock: "Approved",
    toast: "Implementation approved",
    hint: "Approving lets dev change code. Then you run dev in Claude Code.",
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
// 검증 기록이 없는 in_review를 승인하려 할 때. 버튼은 윤곽으로 물러서고 이 문장이 빨갛다.
export const UNVERIFIED_HINT = "This approves an unverified plan. Run plan-verifier in Claude Code first.";

// 재개 — on_hold에서 돌아가는 두 목적지. 주 버튼은 멈춘 자리(heldFrom)로 돌아가는 쪽이다.
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
export function resumePrimaryFor(heldFrom: string | null): string {
  return heldFrom === "implementing" ? "implementing" : "planning";
}
export function resumeHint(primary: string, heldFrom: string | null): string {
  if (primary === "implementing") {
    return "Picks up where it stopped. Resuming planning instead clears the validation and dev rewrites the plan.";
  }
  if (heldFrom === "proposed") return "dev writes the plan. Resuming implementation instead skips the approval gate.";
  return "dev rewrites the plan; the validation is cleared. Resuming implementation instead skips the approval gate.";
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
function isoDay(today: Date): string {
  return `${today.getUTCFullYear()}-${pad2(today.getUTCMonth() + 1)}-${pad2(today.getUTCDate())}`;
}

// 노트는 result 줄에 접두어와 함께 들어가므로(≤TEXT_LIMIT) 입력 상한은 접두어만큼 줄어든다.
// 접두어는 holdResultLine이 실제로 만드는 것에서 파생한다 — 문구를 고쳐도 상한이 따라온다.
const BOUNCE_PREFIX = "Sent back: ";
const holdPrefix = (date: string) => `On hold by owner (${date}): `;
const HOLD_PREFIX_LENGTH = holdPrefix("2026-01-01").length;
export const NOTE_LIMIT: Record<"bounce" | "hold", number> = {
  bounce: TEXT_LIMIT - BOUNCE_PREFIX.length,
  hold: TEXT_LIMIT - HOLD_PREFIX_LENGTH,
};

// 되돌릴 때 dev가 읽을 노트. 비어 있으면 result를 남기지 않는다.
export function bounceResultLine(note: string): string | undefined {
  const text = note.trim();
  return text === "" ? undefined : `${BOUNCE_PREFIX}${text}`;
}

// 보류할 때 result에 남기는 줄(≤150자). 노트가 없으면 고정 문구. 결정론적: 호출자가 Date를 넘긴다.
export function holdResultLine(today: Date, note = ""): string {
  const text = note.trim();
  const date = isoDay(today);
  if (text === "") {
    return `On hold by owner (${date}). Not discarded — still in the backlog. Resume to Planning or Implementing.`;
  }
  return `${holdPrefix(date)}${text}`;
}
