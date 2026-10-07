// 사람 동작의 낱말. 버튼은 동사, 성공 뒤 칩은 결과, 토스트는 같은 낱말을 잇는다(product-copy.md §3).
import { TEXT_LIMIT } from "@harness/core/transitions.mjs";
import { clientRuntime } from "@harness/core/client-runtime.mjs";
import { gateCopyId } from "@/fsd/entities/pipeline";

// 버튼 이름과 누르기 전 힌트는 Pipeline 레일의 게이트 툴팁도 쓰므로 entities/pipeline에 있다. 이름은 그대로 잇는다.
export { gateActionLabel, gateActionHint as gateNextActionHint } from "@/fsd/entities/pipeline";

// 카드 잠금 표식: 게이트·되돌리기 성공 뒤 버튼 자리를 대신하는 비상호작용 칩의 재료.
export type CardLock = { label: string; tone: "mine" | "risk" | "done" };

export type RejectAction = "bounce" | "hold" | "discard";

// 게이트 — **게이트 id**가 키다(런의 커서가 서 있는 자리, pipeline.mjs의 before-<kind>).
// 상태가 아니라 그래프가 게이트를 정하므로 목적지 status로는 카드를 못 그린다.
// 누르는 중·잠금 칩·토스트 — 버튼을 누른 뒤의 낱말이라 이 slice에만 있다.
export const ACCEPTANCE_CHECK_LABELS: Readonly<Record<number, string>> = {
  1: "Changed files", 2: "Diff vs sketch", 3: "Verify command", 4: "Backlog entry", 5: "Report record",
};
export const ACCEPTANCE_RETRY_HINT = `Use this when the checks could not run — the environment, a missing push. When ${clientRuntime("claude").resume_command} is running, the main loop runs all five checks again; otherwise use ${clientRuntime("codex").resume_command} in Codex or continue the pipeline in Claude Code. If the code is wrong, reopen it below.`;
export const ACCEPTANCE_RETRY_UNKNOWN = "Couldn't confirm whether acceptance was reset. Refresh to check the current state before trying again.";

const GATE_FEEDBACK: Record<string, { pending: string; lock: string; toast: string }> = {
  "before-plan": { pending: "Requesting…", lock: "Plan requested", toast: "Plan requested" },
  "before-verify": { pending: "Continuing…", lock: "Continued", toast: "Continued to verification" },
  "before-implement": { pending: "Approving…", lock: "Approved", toast: "Implementation approved" },
  "before-accept": { pending: "Continuing…", lock: "Continued", toast: "Continued to acceptance" },
  "before-impl-verify": { pending: "Continuing…", lock: "Continued", toast: "Continued to implementation check" },
  "before-qa": { pending: "Continuing…", lock: "Continued", toast: "Continued to QA" },
  "before-doc-audit": { pending: "Continuing…", lock: "Continued", toast: "Continued to doc audit" },
  "before-scout": { pending: "Continuing…", lock: "Continued", toast: "Continued to scouting" },
};

const gateFeedback = (gate: string) => GATE_FEEDBACK[gateCopyId(gate)];
export function gatePendingLabel(gate: string): string {
  return gateFeedback(gate)?.pending ?? "Moving…";
}
export function gateLockLabel(gate: string): string {
  return gateFeedback(gate)?.lock ?? "Done";
}
export function gateToast(gate: string, key: string): string {
  return `${gateFeedback(gate)?.toast ?? "Moved"} · ${key}`;
}

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

// 되돌리기(reopen) — done에서 돌아가는 두 목적지. 주 버튼은 구현(계획은 유효하고 코드가 틀린 경우)이다.
// 힌트는 고른 목적지가 무엇을 하는지 말한다(product-copy.md §3).
const REOPEN: Record<string, string> = {
  planning: "Reopen planning",
  implementing: "Reopen implementation",
};
export function reopenLabel(to: string): string {
  return REOPEN[to] ?? `Reopen as ${to}`;
}
export function reopenPendingLabel(): string {
  return "Reopening…";
}
export function reopenToast(to: string, key: string): string {
  return `Reopened · ${key} is ${to === "planning" ? "planning" : "implementing"}`;
}
export function reopenPrimaryFor(targets: readonly string[]): string {
  return targets.includes("implementing") ? "implementing" : (targets[0] ?? "implementing");
}
export function reopenHint(to: string): string {
  if (to === "planning") return "dev rewrites the plan; the validation is cleared. The item walks the pipeline again from plan.";
  return "dev fixes the code against the same plan. Reopening planning instead clears the validation and dev rewrites the plan.";
}
// 노트가 비었을 때 폼이 보이는 문장 — 서버의 "result: must not be empty"는 여기 닿지 않는다(§12).
export const REOPEN_NOTE_REQUIRED = "Add a note — which check failed.";

// 보류·되돌리기·폐기(Inbox의 보조 동작).
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
const REOPEN_PREFIX = "Reopened: ";
export const NOTE_LIMIT: Record<"bounce" | "hold" | "reopen", number> = {
  bounce: TEXT_LIMIT - BOUNCE_PREFIX.length,
  hold: TEXT_LIMIT - HOLD_PREFIX_LENGTH,
  reopen: TEXT_LIMIT - REOPEN_PREFIX.length,
};

// 되돌릴 때 dev가 읽을 노트 — 필수다. 비어 있으면 null이고 폼이 막는다(서버에 닿지 않는다).
export function reopenResultLine(note: string): string | null {
  const text = note.trim();
  return text === "" ? null : `${REOPEN_PREFIX}${text}`;
}

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
