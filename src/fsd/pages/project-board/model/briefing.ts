import {
  docLinksForItem,
  type BoardItem,
  type BoardSection,
  type DocLink,
} from "@/fsd/entities/board-item";
import type { ReportDoc } from "@/fsd/entities/report";
import { isGateSource } from "@/fsd/features/review-gate";
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
  /** 이 항목의 실재하는 문서 링크(계획서·행위자 기록). docs 인자를 안 주면 빈 배열. */
  docs: DocLink[];
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
  pendingCount: number;
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

export function daysOnBoard(sectionDate: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sectionDate);
  if (!m) return null;
  const y = m[1],
    mo = m[2],
    d = m[3]; // 각각 string | undefined
  if (y === undefined || mo === undefined || d === undefined) return null;
  const start = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const diff = Math.floor((now - start) / 86_400_000);
  return diff < 0 ? 0 : diff;
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
  resolveDocs: (id: string) => DocLink[],
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
      overBudget: isOverBudget(item.reason),
      docs: resolveDocs(item.id),
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
    overBudget: isOverBudget(item.result) || isOverBudget(item.reason),
    docs: resolveDocs(item.id),
    tone: "pending",
  };
}

/** 보드 evidence·result 요약 예산. 상세는 docs/agents/<행위자>/ 로 간다. */
export const FIELD_BUDGET = 150;

/** 필드 전체 길이로 잰다 — 첫 문장이 아니다. */
export function isOverBudget(text: string | null): boolean {
  return text !== null && text.length > FIELD_BUDGET;
}

const FEED_TONE: Record<string, Tone> = {
  planning: "active",
  implementing: "active",
  done: "done",
  on_hold: "hold",
};

function feedSpeech(
  item: DatedItem,
  resolveDocs: (id: string) => DocLink[],
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
    overBudget: isOverBudget(item.reason) || isOverBudget(item.result),
    docs: resolveDocs(item.id),
    tone,
  };
}

function teamState(
  agentId: string,
  items: DatedItem[],
): { state: string; heldId: string | null; tone: Tone } {
  if (agentId === "pm") {
    const pending = items.filter((it) => it.status === "proposed").length;
    return pending > 0
      ? { state: `${pending} awaiting your approval`, heldId: null, tone: "pending" }
      : { state: "No new proposals", heldId: null, tone: "muted" };
  }
  if (agentId === "plan-verifier") {
    // plan-verifier는 보드 `agent:` 필드에 등장하지 않는다(런북 4단계에서 메인 루프가
    // 디스패치하는 독립 검증자). 그래서 pm처럼 보드에서 파생하는 특별 분기가 필요하다.
    // 파생 규칙: in_review 항목 = 검증 대상 계획서. 하나라도 있으면 "Verifying"(그 계획서가 heldId),
    // 없으면 "Idle". items는 이미 dedupe된 최신 행이며 find는 보드 순서(최신 섹션 우선) 첫 in_review를 준다.
    const review = items.find((it) => it.status === "in_review");
    return review !== undefined
      ? { state: `Verifying ${review.id}`, heldId: review.id, tone: "active" }
      : { state: "Idle", heldId: null, tone: "muted" };
  }
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

// "Aug 15" — UTC 기준(daysOnBoard와 같은 시계).
function formatToday(today: Date): string {
  return today.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// 항목 ID → 실재하는 문서 링크. docs 인자가 없으면(뷰어 밖 호출) 항상 빈 배열이라
// 기존 소비자와 SpeechItem 단언이 깨지지 않는다. 카드별 추가 요청은 없다 — reports·planDocIds는
// page-load당 한 번씩만 읽고, 이 리졸버는 이미 받은 인메모리 집합만 조회한다.
function docResolver(
  docs?: {
    planDocIds: ReadonlySet<string>;
    reports: ReadonlyMap<string, ReportDoc[]>;
  },
): (id: string) => DocLink[] {
  if (docs === undefined) return () => [];
  return (id) => {
    const agentsWithDoc = new Set(
      [...docs.reports]
        .filter(([, l]) => l.some((r) => r.name === `${id}.md`))
        .map(([a]) => a),
    );
    return docLinksForItem(id, docs.planDocIds.has(id), agentsWithDoc);
  };
}

export function buildBriefing(
  sections: BoardSection[],
  today: Date,
  roster: readonly string[],
  docs?: {
    planDocIds: ReadonlySet<string>;
    reports: ReadonlyMap<string, ReportDoc[]>;
  },
): Briefing {
  const items = flatten(sections);
  const resolveDocs = docResolver(docs);
  const inbox = items
    .filter((it) => it.status !== null && isGateSource(it.status))
    .map((it) => inboxSpeech(it, today, resolveDocs, roster));
  const feed = items
    .filter((it) => it.status === null || !isGateSource(it.status))
    .map((it) => feedSpeech(it, resolveDocs, roster));
  const team = rosterOrder(roster).map((id) => {
    const { state, heldId, tone } = teamState(id, items);
    return { identity: identityFor(id, roster), state, heldId, tone };
  });
  return {
    today: formatToday(today),
    pendingCount: inbox.length,
    inbox,
    team,
    feed,
  };
}
