// 순수. 보드의 최신 행들로 "지금 누구 차례인가"를 정한다 — 모든 프로젝트 탭 위에 놓이는 배너의 유일한 출처.
// 문구는 docs/conventions/product-copy.md §5. 판정은 packages/core의 상태 기계에서 파생한다.
import { canPropose, isOpen } from "@harness/core/transitions.mjs";
import { isGateSource } from "@/fsd/features/review-gate";

export type TurnItem = { key: string; status: string; agent: string; validation: string | null };

// 첫 방문 체크리스트의 재료. 보드에 행이 하나도 없을 때만 쓰인다.
export type SetupState = { tokenIssued: boolean; rosterSynced: boolean; backlogCount: number };

export type SetupStep = {
  key: "token" | "connect" | "backlog" | "pm";
  title: string;
  detail: string;
  done: boolean;
};

// 터미널에서 이어서 할 일 — 사람이 Claude Code 세션에 그대로 건네는 한 줄.
export type NextStep = { key: string; line: string };

export type Turn =
  // current는 1-based다 — steps[current - 1]이 지금 단계.
  | { kind: "setup"; steps: SetupStep[]; current: number }
  | { kind: "mine"; count: number; detail: string; why: string | null; next: NextStep[] }
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

function mineDetail(pending: TurnItem[]): string {
  const verified = pending.filter((i) => i.status === "in_review" && i.validation !== null);
  const unverified = pending.filter((i) => i.status === "in_review" && i.validation === null);
  const proposed = pending.filter((i) => i.status === "proposed");
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
  return parts.join(" · ");
}

// 런북(CLAUDE.runbook.md)의 단계 번호로 말한다 — 세션은 그 문서를 이미 읽고 있다.
export function nextStepLine(item: TurnItem): string | null {
  switch (item.status) {
    case "planning":
      return `Continue the runbook for ${item.key}: step 3 — ${item.agent} writes the plan.`;
    case "in_review":
      return item.validation === null ? `Continue the runbook for ${item.key}: step 4 — verify the plan.` : null;
    case "implementing":
      return `Continue the runbook for ${item.key}: step 6 — ${item.agent} implements.`;
    default:
      return null;
  }
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

  const pending = items.filter((i) => isGateSource(i.status));
  if (pending.length > 0) {
    const openCount = items.filter((i) => isOpen(i.status)).length;
    return {
      kind: "mine",
      count: pending.length,
      detail: mineDetail(pending),
      why: canPropose(openCount) ? null : BLOCKED_WHY,
      next: nextSteps(pending),
    };
  }

  const working = items.filter((i) => i.status === "planning" || i.status === "implementing");
  if (working.length > 0) {
    return {
      kind: "theirs",
      detail: working
        .map((w) => (w.status === "planning" ? `${w.agent} is writing the plan for ${w.key}` : `${w.agent} is implementing ${w.key}`))
        .join(" · "),
      next: nextSteps(working),
    };
  }

  return { kind: "none", detail: NONE_DETAIL };
}
