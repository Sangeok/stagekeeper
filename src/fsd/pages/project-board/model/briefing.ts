import type { BoardItem, BoardSection } from "@/fsd/entities/board-item";
import { isGateSource } from "@/fsd/features/review-gate";
import { daysBetween } from "@/fsd/shared/lib/relative-time";
import {
  identityFor,
  rosterOrder,
  type AgentIdentity,
} from "./known-agents";

export type Tone = "pending" | "active" | "done" | "hold" | "muted";

export type SpeechItem = {
  key: string;
  id: string;
  title: string;
  status: string | null;
  validation: string | null;
  speaker: AgentIdentity;
  line: string;
  detail: string | null;
  /** 보드 필드가 150자 예산을 넘었나. 넘치면 화면이 표시한다(보드 안내 블록의 기록 규칙). */
  overBudget: boolean;
  tone: Tone;
};
export type TeamMember = {
  identity: AgentIdentity;
  state: string;
  heldId: string | null; // 팀 줄이 들고 있는 항목 ID(칩 표시용). 없으면 null
  tone: Tone;
};
export type Briefing = {
  today: string;
  inbox: SpeechItem[];
  team: TeamMember[];
  feed: SpeechItem[];
};

type DatedItem = BoardItem & { sectionDate: string };

function flatten(sections: BoardSection[]): DatedItem[] {
  // 보드는 최신 섹션이 위다. 같은 ID가 여러 섹션에 있으면 **가장 위(최신) 행만
  // 유효**하고 아래 행은 이력이다(보드·pm 공유 규칙). 이력 행이 계산에 끼면
  // 끝난 항목의 옛 proposed 행이 결재 목록에 유령으로 되살아나므로 첫 등장만 남긴다.
  const seen = new Set<string>();
  const out: DatedItem[] = [];
  for (const s of sections) {
    for (const it of s.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push({ ...it, sectionDate: s.heading });
    }
  }
  return out;
}

// 섹션 제목(YYYY-MM-DD)만 해석하고, 날짜 차이는 shared의 daysBetween에 맡긴다 —
// 예전에는 UTC 자정 계산과 음수 절단을 여기서 다시 구현하고 86_400_000을 손으로 적었다.
export function daysOnBoard(sectionDate: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sectionDate);
  if (!m) return null;
  const y = m[1],
    mo = m[2],
    d = m[3]; // 방어적: 정규식이 매치했으므로 세 그룹은 항상 존재한다
  if (y === undefined || mo === undefined || d === undefined) return null;
  return daysBetween(new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))), today);
}

// "1 day" / "N days". 오늘 올라온 것(0일)과 날짜를 못 읽는 섹션은 빈 문자열 — 문장에 붙이지 않는다.
function dayTag(sectionDate: string, today: Date): string {
  const days = daysOnBoard(sectionDate, today);
  if (days === null || days === 0) return "";
  return days === 1 ? "1 day" : `${days} days`;
}

export function firstSentence(text: string): string {
  const trimmed = text.trim();
  // 종결부호(. ! ?) 뒤에 공백/문자열끝이 오는 첫 지점까지.
  // "board.ts"처럼 토큰 내부 마침표는 뒤가 공백이 아니라 걸리지 않는다.
  const m = /^([\s\S]*?[.!?])(\s|$)/.exec(trimmed);
  return m?.[1] ?? trimmed; // m[1]은 string | undefined → ?? 로 보정
}

function summarize(item: BoardItem): string | null {
  const src = item.result ?? item.reason;
  return src === null ? null : firstSentence(src);
}

// 줄 조각을 " · "로 잇는다. 빈 조각은 빠진다 — 날짜 태그가 없을 때 " · " 가 남지 않게.
const join = (...parts: string[]) => parts.filter((p) => p !== "").join(" · ");

function inboxSpeech(
  item: DatedItem,
  today: Date,
  roster: readonly string[],
): SpeechItem {
  const days = dayTag(item.sectionDate, today);
  if (item.status === "proposed") {
    return {
      key: item.id,
      id: item.id,
      title: item.title,
      status: item.status,
      validation: null,
      speaker: identityFor("pm", roster),
      line: join(item.id, "waiting for a plan request", days),
      detail: item.reason,
      overBudget: item.overBudget,
      tone: "pending",
    };
  }
  return {
    // in_review
    key: item.id,
    id: item.id,
    title: item.title,
    status: item.status,
    validation: item.validation,
    speaker: identityFor(item.agent, roster),
    line: join(item.id, "plan submitted", days === "" ? "in review" : `in review for ${days}`),
    detail: item.result ?? item.reason,
    overBudget: item.overBudget,
    tone: "pending",
  };
}

const FEED_TONE: Record<string, Tone> = {
  planning: "active",
  implementing: "active",
  done: "done",
  on_hold: "hold",
};

function feedSpeech(
  item: DatedItem,
  roster: readonly string[],
): SpeechItem {
  const speaker = identityFor(item.agent, roster);
  const tone: Tone =
    item.status === null ? "muted" : (FEED_TONE[item.status] ?? "muted");
  let line: string;
  switch (item.status) {
    case "planning":
      line = join(item.id, "writing the plan");
      break;
    case "implementing":
      line = join(item.id, "implementing");
      break;
    case "done":
      line = join(item.id, summarize(item) ?? "Done");
      break;
    case "on_hold":
      line = join(item.id, summarize(item) ?? "On hold");
      break;
    default:
      line = join(item.id, summarize(item) ?? item.title);
  }
  const detail =
    item.status === "planning" || item.status === "implementing"
      ? item.reason
      : (item.result ?? item.reason);
  return {
    key: item.id,
    id: item.id,
    title: item.title,
    status: item.status,
    validation: null,
    speaker,
    line,
    detail,
    overBudget: item.overBudget,
    tone,
  };
}

type TeamState = { state: string; heldId: string | null; tone: Tone };

// pm은 보드에서 일하지 않는다 — 올려둔 제안이 몇 건 대기 중인지로 말한다.
function pmState(items: DatedItem[]): TeamState {
  const pending = items.filter((it) => it.status === "proposed").length;
  return pending > 0
    ? { state: `${pending} awaiting your approval`, heldId: null, tone: "pending" }
    : { state: "No new proposals", heldId: null, tone: "muted" };
}

// plan-verifier는 보드 `agent:` 필드에 등장하지 않는다(런북 4단계에서 메인 루프가
// 디스패치하는 독립 검증자). 그래서 pm처럼 보드에서 파생하는 특별 분기가 필요하다.
// 파생 규칙: in_review 항목 = 검증 대상 계획서. 하나라도 있으면 "Verifying"(그 계획서가 heldId),
// 없으면 "Idle". items는 이미 dedupe된 최신 행이며 find는 보드 순서(최신 섹션 우선) 첫 in_review를 준다.
function verifierState(items: DatedItem[]): TeamState {
  const review = items.find((it) => it.status === "in_review");
  return review !== undefined
    ? { state: `Verifying ${review.id}`, heldId: review.id, tone: "active" }
    : { state: "Idle", heldId: null, tone: "muted" };
}

// 일반 에이전트는 자기 항목만 본다. 우선순위: 검토 대기 → 작업 중 → 보류 → 최근 완료 → 유휴.
function workerState(agentId: string, items: DatedItem[]): TeamState {
  const mine = items.filter((it) => it.agent === agentId);
  const review = mine.find((it) => it.status === "in_review");
  if (review !== undefined)
    return { state: "Awaiting review", heldId: review.id, tone: "pending" };
  const working = mine.find(
    (it) => it.status === "planning" || it.status === "implementing",
  );
  if (working !== undefined)
    return { state: `Working on ${working.id}`, heldId: working.id, tone: "active" };
  const held = mine.find((it) => it.status === "on_hold");
  if (held !== undefined) return { state: "On hold", heldId: held.id, tone: "hold" };
  const done = mine.find((it) => it.status === "done");
  if (done !== undefined)
    return { state: "Recently done", heldId: done.id, tone: "done" };
  return { state: "Idle", heldId: null, tone: "muted" };
}

function teamState(agentId: string, items: DatedItem[]): TeamState {
  if (agentId === "pm") return pmState(items);
  if (agentId === "plan-verifier") return verifierState(items);
  return workerState(agentId, items);
}

// "Aug 15" — UTC 기준(daysOnBoard와 같은 시계).
function formatToday(today: Date): string {
  return today.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function buildBriefing(
  sections: BoardSection[],
  today: Date,
  roster: readonly string[],
): Briefing {
  const items = flatten(sections);
  const inbox = items
    .filter((it) => it.status !== null && isGateSource(it.status))
    .map((it) => inboxSpeech(it, today, roster));
  const feed = items
    .filter((it) => it.status === null || !isGateSource(it.status))
    .map((it) => feedSpeech(it, roster));
  const team = rosterOrder(roster).map((id) => {
    const { state, heldId, tone } = teamState(id, items);
    return { identity: identityFor(id, roster), state, heldId, tone };
  });
  return {
    today: formatToday(today),
    inbox,
    team,
    feed,
  };
}
