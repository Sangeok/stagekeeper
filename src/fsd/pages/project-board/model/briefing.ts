import { isOverBudget } from "@/fsd/entities/board-item";
import { isGateSource } from "@/fsd/features/review-gate";
import { daysBetween } from "@/fsd/shared/lib/relative-time";

type BoardRow = {
  agent: string;
  status: string;
  reason: string;
  results: readonly string[];
  proposedOn: Date;
  backlogItem: { key: string };
};
type Tone = "pending" | "active" | "done" | "hold" | "muted";

export type ActivityItem = {
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
  // board.ts 내부의 마침표는 문장 끝이 아니다 — 뒤에 공백이나 문자열 끝이 있어야 한다.
  const match = /^([\s\S]*?[.!?])(\s|$)/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function summaryLine(row: BoardRow): string {
  const source = row.results.length > 0 ? row.results.join(" ") : row.reason;
  // 빈 요약은 기존 화면처럼 key를 본문에도 표시한다.
  return firstSentence(source) || row.backlogItem.key;
}

function activityItem(row: BoardRow, today: Date): ActivityItem {
  const item = {
    key: row.backlogItem.key,
    status: row.status,
    // 합치거나 첫 문장으로 줄이기 전에 건별 원문 길이를 잰다.
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
        line: days === "" ? "plan submitted · in review" : `plan submitted · in review for ${days}`,
        tone: "pending",
      };
    }
    case "planning":
      return { ...item, line: "writing the plan", tone: "active" };
    case "implementing":
      return { ...item, line: "implementing", tone: "active" };
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

// 검증자는 보드의 담당 agent가 아니므로 프로젝트 전체의 첫 검토 항목을 본다.
function verifierState(rows: readonly BoardRow[]): string {
  const review = rows.find((row) => row.status === "in_review");
  return review ? `Verifying ${review.backlogItem.key}` : "Idle";
}

// 같은 우선순위 안에서는 서버가 반환한 최신 순서를 따른다.
function workerState(agent: string, rows: readonly BoardRow[]): string {
  const mine = rows.filter((row) => row.agent === agent);
  if (mine.some((row) => row.status === "in_review")) return "Awaiting review";
  const working = mine.find((row) => row.status === "planning" || row.status === "implementing");
  if (working) return `Working on ${working.backlogItem.key}`;
  if (mine.some((row) => row.status === "on_hold")) return "On hold";
  if (mine.some((row) => row.status === "done")) return "Recently done";
  return "Idle";
}

function teamState(agent: string, rows: readonly BoardRow[]): string {
  if (agent === "pm") return pmState(rows);
  if (agent === "plan-verifier") return verifierState(rows);
  return workerState(agent, rows);
}

// rows는 latestBoard가 고른 최신 행들이다. Activity만 gate 우선으로 배치하고,
// Team은 원래 서버 순서를 유지해야 같은 우선순위의 최신 항목을 선택한다.
export function buildBriefing(
  rows: readonly BoardRow[],
  today: Date,
  roster: readonly string[],
): Briefing {
  const gateItems: ActivityItem[] = [];
  const otherItems: ActivityItem[] = [];
  for (const row of rows) {
    const item = activityItem(row, today);
    if (isGateSource(row.status)) gateItems.push(item);
    else otherItems.push(item);
  }
  const team = ["pm", ...roster, "plan-verifier", "doc-auditor", "feature-scout"]
    .map((agent) => ({ agent, state: teamState(agent, rows) }));
  return { activity: [...gateItems, ...otherItems], team };
}
