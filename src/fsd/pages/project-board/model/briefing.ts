import { isOverBudget } from "@/fsd/entities/board-item";
import { slotAgent, dispatcherFor, PROJECT_AGENTS } from "@harness/core/pipeline/pipeline.mjs";
import { daysBetween } from "@/fsd/shared/lib/relative-time";

type BoardRow = {
  pipelineName?: string;
  agent: string;
  status: string;
  reason: string;
  results: readonly string[];
  proposedOn: Date;
  backlogItem: { key: string };
  gate: string | null;
  node: string | null;
  dispatched: boolean;
};
type Tone = "pending" | "active" | "done" | "hold" | "muted";

export type ActivityItem = {
  pipelineName: string;
  key: string;
  status: string;
  line: string;
  overBudget: boolean;
  tone: Tone;
};
export type TeamMember = { agent: string; state: string };
export type Briefing = { activity: ActivityItem[]; team: TeamMember[] };

function dayTag(proposedOn: Date, today: Date): string {
  const days = daysBetween(proposedOn, today);
  if (days === 0) return "";
  return days === 1 ? "1 day" : `${days} days`;
}

export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = /^([\s\S]*?[.!?])(\s|$)/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function summaryLine(row: BoardRow): string {
  const source = row.results.length > 0 ? row.results.join(" ") : row.reason;
  return firstSentence(source) || row.backlogItem.key;
}

function activityItem(row: BoardRow, today: Date): ActivityItem {
  const slot = slotAgent(row.node);
  if (slot !== null && (PROJECT_AGENTS.includes(slot) || ["qa-verifier", "impl-verifier"].includes(slot)) && row.status !== "on_hold") return { pipelineName: row.pipelineName ?? "Default", key: row.backlogItem.key, status: row.status, line: `${row.dispatched ? "working: " : "waiting for "}${slot} · ${row.node}`, tone: row.dispatched ? "active" : "pending", overBudget: isOverBudget([row.reason, ...row.results]) };
  const item = {
    pipelineName: row.pipelineName ?? "Default",
    key: row.backlogItem.key,
    status: row.status,
    overBudget: isOverBudget([row.reason, ...row.results]),
  };
  switch (row.status) {
    case "proposed": {
      const days = dayTag(row.proposedOn, today);
      return { ...item, line: "waiting for a plan request" + (days === "" ? "" : ` · ${days}`), tone: "pending" };
    }
    case "in_review": {
      const days = dayTag(row.proposedOn, today);
      return {
        ...item,
        line: days === "" ? "plan submitted · in review" : `plan submitted · proposed ${days} ago`,
        tone: "pending",
      };
    }
    case "planning":
      return row.dispatched
        ? { ...item, line: "writing the plan", tone: "active" }
        : { ...item, line: `waiting for ${row.agent}`, tone: "pending" };
    case "implementing":
      return row.dispatched
        ? { ...item, line: "implementing", tone: "active" }
        : { ...item, line: `waiting for ${row.agent}`, tone: "pending" };
    case "done":
      return { ...item, line: summaryLine(row), tone: "done" };
    case "on_hold":
      return { ...item, line: summaryLine(row), tone: "hold" };
    default:
      return { ...item, line: summaryLine(row), tone: "muted" };
  }
}

function pmState(rows: readonly BoardRow[]): string {
  const pending = rows.filter((row) => row.status === "proposed").length;
  return pending > 0 ? `${pending} awaiting your approval` : "No new proposals";
}

function verifierState(rows: readonly BoardRow[]): string {
  const atVerify = rows.filter((row) => row.node === "verify" && row.status !== "on_hold");
  const working = atVerify.find((row) => row.dispatched);
  if (working) return `Verifying ${working.backlogItem.key}`;
  const queued = atVerify[0];
  return queued ? `Ready for ${queued.backlogItem.key}` : "Idle";
}

function workerState(agent: string, rows: readonly BoardRow[]): string {
  const mine = rows.filter((row) => row.agent === agent);
  if (mine.some((row) => row.status === "in_review")) return "Awaiting review";
  const atWorkspaceNode = mine.filter((row) =>
    (row.status === "planning" || row.status === "implementing")
    && (row.node === "plan" || row.node === "implement")
    && dispatcherFor(row.node, row.agent) === agent);
  const working = atWorkspaceNode.find((row) => row.dispatched);
  if (working) return `Working on ${working.backlogItem.key}`;
  const queued = atWorkspaceNode[0];
  if (queued) return `Ready for ${queued.backlogItem.key}`;
  if (mine.some((row) => row.status === "on_hold")) return "On hold";
  if (mine.some((row) => row.status === "done")) return "Recently done";
  return "Idle";
}

function teamState(agent: string, rows: readonly BoardRow[]): string {
  if (PROJECT_AGENTS.includes(agent) || ["qa-verifier", "impl-verifier"].includes(agent)) {
    const eligible = rows.filter((row) => row.node && dispatcherFor(row.node, row.agent) === agent && row.status !== "on_hold");
    const current = eligible.find((row) => row.dispatched) ?? eligible[0];
    return current ? `${current.dispatched ? "Working on" : "Ready for"} ${current.backlogItem.key}` : "Idle";
  }
  if (agent === "pm") return pmState(rows);
  if (agent === "plan-verifier") return verifierState(rows);
  return workerState(agent, rows);
}

export function buildBriefing(
  rows: readonly BoardRow[],
  today: Date,
  roster: readonly string[],
  nodes: readonly string[],
  autoProposeEnabled = true,
): Briefing {
  const gateItems: ActivityItem[] = [];
  const otherItems: ActivityItem[] = [];
  for (const row of rows) {
    const item = activityItem(row, today);
    if (row.gate !== null) gateItems.push(item);
    else otherItems.push(item);
  }
  const agentsOf = (kind: string): readonly string[] => {
    if (kind === "plan" || kind === "implement") return roster;
    const agent = slotAgent(kind);
    return agent !== null ? [agent] : [];
  };
  const team = [...new Set([...(autoProposeEnabled ? ["pm"] : []), ...nodes.filter(kind => kind !== "propose").flatMap(agentsOf)])].map((agent) => ({ agent, state: teamState(agent, rows) }));
  return { activity: [...gateItems, ...otherItems], team };
}
