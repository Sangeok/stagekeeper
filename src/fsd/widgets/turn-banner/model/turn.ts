import { slotAgent, dispatcherFor, PROJECT_AGENTS } from "@harness/core/pipeline/pipeline.mjs";
import { clientRuntime } from "@harness/core/execution/client-runtime.mjs";
import { canPropose, isOpen } from "@harness/core/pipeline/transitions.mjs";
import { isAwaitingAcceptance, pendingInboxCount } from "@/fsd/entities/board-item";
import { gateLabel } from "@/fsd/entities/pipeline";

export type TurnHandoff = { step: string; note: string | null };

export type TurnItem = {
  key: string;
  status: string;
  agent: string;
  acceptanceFailed: boolean;
  accepted: boolean;
  handoff: TurnHandoff | null;
  gate: string | null;
  node: string | null;
  dispatched: boolean;
};

export type SetupState = { tokenIssued: boolean; rosterSynced: boolean; autoScoutEnabled?: boolean };

export type SetupStep = {
  key: "token" | "connect" | "run";
  title: string;
  detail: string;
  done: boolean;
};

export type NextStep = { kind: "continue"; key: string; line: string } | { kind: "handoff"; key: string; line: string; note: string | null };

export type TurnTarget = { kind: "inbox" } | { kind: "item"; key: string };

export type Turn =
  | { kind: "setup"; steps: SetupStep[]; current: number }
  | { kind: "mine"; count: number; detail: string; why: string | null; next: NextStep[]; open: TurnTarget }
  | { kind: "theirs"; detail: string; next: NextStep[] }
  | { kind: "none"; detail: string };

export const HEADLINE: Record<Turn["kind"], string> = {
  setup: "Set up in three steps",
  mine: "Waiting on you",
  theirs: "Agents are working",
  none: "Nothing open",
};

const NONE_DETAIL = "Pick the next item from the backlog, or run the pipeline in your coding client — when the backlog is empty, feature-scout looks for items to add.";
const SCOUT_OFF_DETAIL = "Automatic scouting is off. Add an item on the Backlog tab, or turn it on in the Pipeline tab.";
const BLOCKED_WHY = "pm can't propose anything new until you clear one.";

function setupSteps(setup: SetupState): SetupStep[] {
  return [
    {
      key: "token",
      title: "Token issued",
      detail: "Shown once when you created the project. Issue another on the Tokens tab.",
      done: setup.tokenIssued || setup.rosterSynced,
    },
    {
      key: "connect",
      title: "Connect the repository",
      detail: `Open the repository in your coding client with the token set. Use ${clientRuntime("claude").init_command} in Claude Code or ${clientRuntime("codex").init_command} in Codex; it connects the repository and tells you the next steps.`,
      done: setup.rosterSynced,
    },
    {
      key: "run",
      title: "Run the pipeline in your coding client",
      detail: setup.autoScoutEnabled === false
        ? `${SCOUT_OFF_DETAIL} Then run the pipeline in your coding client, or put the item on the board from the Backlog tab.`
        : "feature-scout reads the code and adds up to three backlog items; pm puts up to two on the board for your approval. With automatic picking off, put one on the board from the Backlog tab.",
      done: false,
    },
  ];
}

function countPhrase(n: number, one: string, many: string): string {
  return n === 1 ? one : many.replace("{n}", String(n));
}

function mineDetail(pending: TurnItem[]): string {
  const gated = pending.filter((i) => i.gate !== null);
  const approvals = gated.filter((i) => i.gate === "before-implement" && i.status === "in_review");
  const proposed = gated.filter((i) => i.gate === "before-plan");
  const named = new Set<TurnItem>([...approvals, ...proposed]);
  const elsewhere = gated.filter((i) => !named.has(i));
  const accepting = pending.filter((i) => i.gate === null && i.acceptanceFailed);
  const handoffs = pending.filter((i) => !i.acceptanceFailed && i.handoff !== null);
  const parts: string[] = [];
  if (approvals.length > 0) {
    parts.push(countPhrase(approvals.length, `${approvals[0]?.key} is ready for your approval`, "{n} plans are ready for your approval"));
  }
  if (proposed.length > 0) {
    parts.push(countPhrase(proposed.length, `${proposed[0]?.key} needs a plan request`, "{n} items need a plan request"));
  }
  if (elsewhere.length > 0) {
    const first = elsewhere[0];
    parts.push(countPhrase(elsewhere.length, `${first?.key} is waiting ${gateLabel(first?.gate ?? "")}`, "{n} items are waiting at a gate"));
  }
  if (accepting.length > 0) {
    parts.push(countPhrase(accepting.length, `${accepting[0]?.key} failed acceptance`, "{n} items failed acceptance"));
  }
  if (handoffs.length > 0) {
    parts.push(countPhrase(handoffs.length, `${handoffs[0]?.key} is waiting for your commit`, "{n} items are waiting for your commit"));
  }
  return parts.join(" · ");
}

function sessionWorkLine(w: TurnItem): string {
  if (w.node === "accept") return `${w.key} is waiting for acceptance`;
  if (!w.dispatched) return `${w.key} is waiting for ${w.node === "verify" ? "verification" : dispatcherFor(w.node, w.agent)}`;
  switch (w.node) {
    case "plan": return `${w.agent} is writing the plan for ${w.key}`;
    case "verify": return `the plan for ${w.key} is being verified`;
    case "implement": return `${w.agent} is implementing ${w.key}`;
    default: return `${slotAgent(w.node)} is working on ${w.key}`;
  }
}

const NODE_LINE: Record<string, (item: TurnItem) => string> = {
  plan: (i) => `${i.agent} writes the plan`,
  verify: () => "verify the plan",
  implement: (i) => `${i.agent} implements`,
  accept: () => "accept",
  "doc-audit": () => "doc-auditor audits",
  scout: () => "feature-scout scouts",
};
export function nextStepLine(item: TurnItem): string | null {
  if (item.acceptanceFailed) return null;
  if (item.handoff !== null) {
    return `Commit ${item.handoff.note ?? "the prepared file"}, then continue the pipeline for ${item.key}.`;
  }
  if (item.gate !== null || item.node === null) return null;
  const agent = slotAgent(item.node);
  const line = NODE_LINE[item.node] ?? (agent ? () => `${agent} runs ${item.node}` : undefined);
  return line === undefined ? null : `Continue the pipeline for ${item.key}: ${item.node} — ${line(item)}.`;
}

function nextSteps(items: TurnItem[]): NextStep[] {
  const out: NextStep[] = [];
  for (const item of items) {
    const line = nextStepLine(item);
    if (line !== null) out.push(item.handoff === null
      ? { kind: "continue", key: item.key, line }
      : { kind: "handoff", key: item.key, line, note: item.handoff.note });
  }
  return out;
}

export const WATCH_LINE = `Or leave ${clientRuntime("claude").resume_command} running in that session — it continues ready steps and waits for your gates and commits.`;

export function deriveTurn(items: readonly TurnItem[], setup: SetupState): Turn {
  if (items.length === 0) {
    const steps = setupSteps(setup);
    const firstOpen = steps.findIndex((s) => !s.done);
    return { kind: "setup", steps, current: (firstOpen === -1 ? steps.length - 1 : firstOpen) + 1 };
  }

  const pending = items.filter((i) => i.gate !== null || i.acceptanceFailed || i.handoff !== null);
  const isProjectSlot = (node: string | null) => {
    const agent = slotAgent(node);
    return agent !== null && PROJECT_AGENTS.includes(agent);
  };
  const sessionWorkItems = items.filter((i) => !pending.includes(i) && i.status !== "on_hold" && i.gate === null
    && (i.node === "plan" || i.node === "verify" || i.node === "implement" || i.node === "impl-verify" || i.node === "qa" || isProjectSlot(i.node) || (i.node === "accept" && isAwaitingAcceptance(i.status, i.accepted))));
  const first = pending[0];
  if (first !== undefined) {
    const openCount = items.filter((i) => isOpen(i.status)).length;
    const open: TurnTarget = pendingInboxCount(items.map((i) => ({ status: i.status, gate: i.gate }))) > 0 ? { kind: "inbox" } : { kind: "item", key: first.key };
    return {
      kind: "mine",
      count: pending.length,
      detail: mineDetail(pending),
      why: canPropose(openCount) ? null : BLOCKED_WHY,
      next: nextSteps([...pending, ...sessionWorkItems]),
      open,
    };
  }

  if (sessionWorkItems.length > 0) {
    return {
      kind: "theirs",
      detail: sessionWorkItems.map(sessionWorkLine).join(" · "),
      next: nextSteps(sessionWorkItems),
    };
  }

  return { kind: "none", detail: setup.autoScoutEnabled === false ? SCOUT_OFF_DETAIL : NONE_DETAIL };
}
