// 순수. 보드의 최신 행들로 "지금 누구 차례인가"를 정한다 — 모든 프로젝트 탭 위에 놓이는 배너의 유일한 출처.
// 문구는 docs/conventions/product-copy.md §5. 판정은 packages/core의 상태 기계에서 파생한다.
import { canPropose, isOpen } from "@harness/core/transitions.mjs";
import { isAwaitingAcceptance, isPlanUnverified, isPlanVerified } from "@/fsd/entities/board-item";
import { pendingInboxCount } from "@/fsd/features/review-gate";

// 열린 run의 마지막 원장 행이 handoff — dev가 커밋을 기다리며 멈춰 있다. note는 dev가 적은 파일 경로(에이전트 텍스트).
export type TurnHandoff = { step: string; note: string | null };

export type TurnItem = {
  key: string;
  status: string;
  agent: string;
  validation: string | null;
  accepted: boolean; // done이고 acceptedAt이 있다
  handoff: TurnHandoff | null;
  gate: string | null; // 런이 서 있는 게이트 id
  node: string | null; // 런이 서 있는 노드
};

// 첫 방문 체크리스트의 재료. 보드에 행이 하나도 없을 때만 쓰인다.
export type SetupState = { tokenIssued: boolean; rosterSynced: boolean; backlogCount: number; hasPropose: boolean }; // §E.3

export type SetupStep = {
  key: "token" | "connect" | "backlog" | "pm";
  title: string;
  detail: string;
  done: boolean;
};

// 터미널에서 이어서 할 일 — 사람이 Claude Code 세션에 그대로 건네는 한 줄.
export type NextStep = { key: string; line: string };

// "내 차례" 버튼이 여는 곳. 결재함에 카드가 있으면 Inbox, 인수·핸드오프뿐이면 그 항목 페이지(§5) —
// done과 핸드오프는 카드가 되지 않아서, Inbox로 보내면 "Nothing to decide."가 된다.
export type TurnTarget = { kind: "inbox" } | { kind: "item"; key: string };

export type Turn =
  // current는 1-based다 — steps[current - 1]이 지금 단계.
  | { kind: "setup"; steps: SetupStep[]; current: number }
  | { kind: "mine"; count: number; detail: string; why: string | null; next: NextStep[]; open: TurnTarget }
  | { kind: "theirs"; detail: string; next: NextStep[] }
  | { kind: "none"; detail: string };

export const HEADLINE: Record<Turn["kind"], string> = {
  setup: "Set up in four steps",
  mine: "Waiting on you",
  theirs: "Agents are working",
  none: "Nothing open",
};

const NONE_DETAIL = "Pick the next item from the backlog, or run pm in Claude Code to pick for you.";
const BLOCKED_WHY = "pm can't propose anything new until you clear one.";

function setupSteps(setup: SetupState): SetupStep[] {
  return [
    {
      key: "token",
      title: "Token issued",
      detail: "Shown once when you created the project. Issue another on the Tokens tab.",
      done: setup.tokenIssued,
    },
    {
      key: "connect",
      title: "Connect the repository",
      detail: "Open it in Claude Code with the token set, run /harness:init, restart, approve the server.",
      done: setup.rosterSynced,
    },
    {
      key: "backlog",
      title: "Add a backlog item",
      detail: "Key, title, area, and the evidence — what you observed and what you confirmed in the code.",
      done: setup.backlogCount > 0,
    },
    {
      key: "pm",
      title: "Run pm in Claude Code",
      detail: "It picks up to two items from the backlog and puts them here for your approval.",
      // 이 목록은 보드가 비어 있을 때만 만들어진다 — 그래서 마지막 단계는 아직 끝날 수 없다.
      done: false,
    },
  ];
}

// 여럿이면 세고, 하나면 이름을 부른다(§5 규칙). 수가 아니라 문구를 돌려준다.
function countPhrase(n: number, one: string, many: string): string {
  return n === 1 ? one : many.replace("{n}", String(n));
}

// 부류 순서는 §5: 승인 준비 → 검증 필요 → 계획 요청 → 인수 → 커밋. 한 항목이 두 부류에 들 수 있다(있는 그대로 센다).
function mineDetail(pending: TurnItem[]): string {
  const verified = pending.filter((i) => isPlanVerified(i.status, i.validation));
  const unverified = pending.filter((i) => isPlanUnverified(i.status, i.validation));
  const proposed = pending.filter((i) => i.status === "proposed");
  const accepting = pending.filter((i) => isAwaitingAcceptance(i.status, i.accepted));
  const handoffs = pending.filter((i) => i.handoff !== null);
  const parts: string[] = [];
  if (verified.length > 0) {
    parts.push(countPhrase(verified.length, `${verified[0]?.key} is ready for your approval`, "{n} plans are ready for your approval"));
  }
  if (unverified.length > 0) {
    parts.push(countPhrase(unverified.length, `${unverified[0]?.key} needs verification before approval`, "{n} plans need verification"));
  }
  if (proposed.length > 0) {
    parts.push(countPhrase(proposed.length, `${proposed[0]?.key} needs a plan request`, "{n} items need a plan request"));
  }
  if (accepting.length > 0) {
    parts.push(countPhrase(accepting.length, `${accepting[0]?.key} needs acceptance`, "{n} items need acceptance"));
  }
  if (handoffs.length > 0) {
    parts.push(countPhrase(handoffs.length, `${handoffs[0]?.key} is waiting for your commit`, "{n} items are waiting for your commit"));
  }
  return parts.join(" · ");
}

// 터미널 줄은 노드로 말한다 — 런북에 단계 번호가 없다. 세션은 pipeline_next로 같은 노드를 받는다.
const NODE_LINE: Record<string, (item: TurnItem) => string> = {
  plan: (i) => `${i.agent} writes the plan`,
  verify: () => "verify the plan",
  implement: (i) => `${i.agent} implements`,
  accept: () => "accept",
  "doc-audit": () => "doc-auditor audits",
  scout: () => "feature-scout scouts",
};
export function nextStepLine(item: TurnItem): string | null {
  // 핸드오프가 상태보다 먼저다 — planning/implementing이어도 지금 움직일 사람은 소유자다.
  // note는 dev가 적은 경로(에이전트 텍스트)라 이 줄(mono 박스)에만 들어가고 산문에는 섞이지 않는다.
  if (item.handoff !== null) {
    return `Commit ${item.handoff.note ?? "the prepared file"}, then continue the pipeline for ${item.key}.`;
  }
  if (item.gate !== null || item.node === null) return null; // 게이트는 터미널 줄이 없다 — 결정은 Inbox나 세션의 것
  const line = NODE_LINE[item.node];
  return line === undefined ? null : `Continue the pipeline for ${item.key}: ${item.node} — ${line(item)}.`;
}

function nextSteps(items: TurnItem[]): NextStep[] {
  const out: NextStep[] = [];
  for (const item of items) {
    const line = nextStepLine(item);
    if (line !== null) out.push({ key: item.key, line });
  }
  return out;
}

export function deriveTurn(items: readonly TurnItem[], setup: SetupState): Turn {
  if (items.length === 0) {
    const steps = setupSteps(setup);
    const firstOpen = steps.findIndex((s) => !s.done);
    return { kind: "setup", steps, current: (firstOpen === -1 ? steps.length - 1 : firstOpen) + 1 };
  }

  // 당신 차례 = 게이트가 열린 것 + 인수를 기다리는 것 + 커밋을 기다리는 것. on_hold는 여전히 배너를 소유하지 않는다.
  const pending = items.filter((i) => i.gate !== null || isAwaitingAcceptance(i.status, i.accepted) || i.handoff !== null);
  const first = pending[0];
  if (first !== undefined) {
    const openCount = items.filter((i) => isOpen(i.status)).length;
    // 결재함 자격은 review-gate가 센다(gate·resume) — 카드가 하나라도 있으면 Inbox, 없으면 첫 항목의 페이지.
    const open: TurnTarget = pendingInboxCount(items.map((i) => ({ status: i.status, gate: i.gate }))) > 0 ? { kind: "inbox" } : { kind: "item", key: first.key };
    return {
      kind: "mine",
      count: pending.length,
      detail: mineDetail(pending),
      why: canPropose(openCount) ? null : BLOCKED_WHY,
      next: nextSteps(pending),
      open,
    };
  }

  const working = items.filter((i) => i.gate === null && (i.node === "plan" || i.node === "verify" || i.node === "implement"));
  if (working.length > 0) {
    return {
      kind: "theirs",
      detail: working
        .map((w) => (w.node === "plan" ? `${w.agent} is writing the plan for ${w.key}` : w.node === "verify" ? `the plan for ${w.key} is being verified` : `${w.agent} is implementing ${w.key}`))
        .join(" · "),
      next: nextSteps(working),
    };
  }

  return { kind: "none", detail: NONE_DETAIL };
}
