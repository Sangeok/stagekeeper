import { TEXT_LIMIT } from "@harness/core/pipeline/transitions.mjs";
import { clientRuntime } from "@harness/core/execution/client-runtime.mjs";
import { gateCopyId } from "@/fsd/entities/pipeline";

export { gateActionLabel, gateActionHint as gateNextActionHint } from "@/fsd/entities/pipeline";

export type CardLock = { label: string; tone: "mine" | "risk" | "done" };

export type RejectAction = "bounce" | "hold" | "discard";

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
export function holdNoteLabel(heldBy: "human" | "agent" | null, agent: string): string {
  return heldBy === "agent" ? `${agent}'s note` : "Your note";
}

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
export const REOPEN_NOTE_REQUIRED = "Add a note — which check failed.";

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

const BOUNCE_PREFIX = "Sent back: ";
const holdPrefix = (date: string) => `On hold by owner (${date}): `;
const HOLD_PREFIX_LENGTH = holdPrefix("2026-01-01").length;
const REOPEN_PREFIX = "Reopened: ";
export const NOTE_LIMIT: Record<"bounce" | "hold" | "reopen", number> = {
  bounce: TEXT_LIMIT - BOUNCE_PREFIX.length,
  hold: TEXT_LIMIT - HOLD_PREFIX_LENGTH,
  reopen: TEXT_LIMIT - REOPEN_PREFIX.length,
};

export function reopenResultLine(note: string): string | null {
  const text = note.trim();
  return text === "" ? null : `${REOPEN_PREFIX}${text}`;
}

export function bounceResultLine(note: string): string | undefined {
  const text = note.trim();
  return text === "" ? undefined : `${BOUNCE_PREFIX}${text}`;
}

export function holdResultLine(today: Date, note = ""): string {
  const text = note.trim();
  const date = isoDay(today);
  if (text === "") {
    return `On hold by owner (${date}). Not discarded — still in the backlog. Resume to Planning or Implementing.`;
  }
  return `${holdPrefix(date)}${text}`;
}
