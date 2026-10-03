import { slotAgent, dispatcherFor, PROJECT_AGENTS } from "@harness/core/pipeline.mjs";
import { clientRuntime } from "@harness/core/client-runtime.mjs";
// 순수. 보드의 최신 행들로 "지금 누구 차례인가"를 정한다 — 모든 프로젝트 탭 위에 놓이는 배너의 유일한 출처.
// 문구는 docs/conventions/product-copy.md §5. 판정은 packages/core의 상태 기계에서 파생한다.
import { canPropose, isOpen } from "@harness/core/transitions.mjs";
import { isAwaitingAcceptance, pendingInboxCount } from "@/fsd/entities/board-item";
import { gateLabel } from "@/fsd/entities/pipeline";

// 열린 run의 마지막 원장 행이 handoff — dev가 커밋을 기다리며 멈춰 있다. note는 dev가 적은 파일 경로(에이전트 텍스트).
export type TurnHandoff = { step: string; note: string | null };

export type TurnItem = {
  key: string;
  status: string;
  agent: string;
  acceptanceFailed: boolean;
  accepted: boolean; // done이고 acceptedAt이 있다
  handoff: TurnHandoff | null;
  gate: string | null; // 런이 서 있는 게이트 id
  node: string | null; // 런이 서 있는 노드
  dispatched: boolean; // 이 항목으로 열린 에이전트 run이 있는가 — 없으면 아무도 아직 시작하지 않았다
};

// 첫 방문 체크리스트의 재료. 보드에 행이 하나도 없을 때만 쓰인다.
export type SetupState = { tokenIssued: boolean; rosterSynced: boolean; autoScoutEnabled?: boolean };

export type SetupStep = {
  key: "token" | "connect" | "run";
  title: string;
  detail: string;
  done: boolean;
};

// 터미널에서 이어서 할 일 — 사람이 Claude Code 세션에 그대로 건네는 한 줄.
export type NextStep = { kind: "continue"; key: string; line: string } | { kind: "handoff"; key: string; line: string; note: string | null };

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
      done: setup.tokenIssued,
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
        : "feature-scout reads the code and adds up to three backlog items; pm puts up to two on the board for your approval. With no Propose node, put one on the board from the Backlog tab.",
      // 이 목록은 보드가 비어 있을 때만 만들어진다 — 그래서 마지막 단계는 아직 끝날 수 없다.
      done: false,
    },
  ];
}

// 여럿이면 세고, 하나면 이름을 부른다(§5 규칙). 수가 아니라 문구를 돌려준다.
function countPhrase(n: number, one: string, many: string): string {
  return n === 1 ? one : many.replace("{n}", String(n));
}

// 부류 순서는 §5: 승인 준비 → 계획 요청 → 그 밖의 게이트 → 인수 → 커밋.
// 게이트 부류는 **게이트 id**로 나눈다 — 그래프가 게이트를 어디든 놓을 수 있어서 상태만으로는 무슨 결정을 기다리는지 모른다.
// 이름 없는 게이트가 한 부류도 없으면 배너가 빈 상세 줄을 낸다 — 그래서 elsewhere가 남은 것을 전부 말한다.
function mineDetail(pending: TurnItem[]): string {
  const gated = pending.filter((i) => i.gate !== null);
  // 검증 기록 유무로 나누지 않는다 — 검증은 사용자가 파이프라인으로 고르는 것이라 부재가 따로 할 일을 만들지 않는다(design.md 규칙 2).
  const approvals = gated.filter((i) => i.gate === "before-implement" && i.status === "in_review");
  const proposed = gated.filter((i) => i.gate === "before-plan");
  const named = new Set<TurnItem>([...approvals, ...proposed]);
  const elsewhere = gated.filter((i) => !named.has(i));
  // 게이트에 선 항목은 그 게이트로 말한다 — before-accept에서 "인수 필요"를 거듭 말하지 않는다.
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

// "에이전트 차례" 배너의 항목 한 줄. 디스패치 전이면 누구를 기다리는지, 디스패치 뒤면 누가 무엇을 하는지.
function workingLine(w: TurnItem): string {
  if (w.node === "accept") return `${w.key} is waiting for acceptance`;
  if (!w.dispatched) return `${w.key} is waiting for ${w.node === "verify" ? "verification" : dispatcherFor(w.node, w.agent)}`;
  switch (w.node) {
    case "plan": return `${w.agent} is writing the plan for ${w.key}`;
    case "verify": return `the plan for ${w.key} is being verified`;
    case "implement": return `${w.agent} is implementing ${w.key}`;
    default: return `${slotAgent(w.node)} is working on ${w.key}`;
  }
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
  if (item.acceptanceFailed) return null;
  // 핸드오프가 상태보다 먼저다 — planning/implementing이어도 지금 움직일 사람은 소유자다.
  // note는 dev가 적은 경로(에이전트 텍스트)라 이 줄(mono 박스)에만 들어가고 산문에는 섞이지 않는다.
  if (item.handoff !== null) {
    return `Commit ${item.handoff.note ?? "the prepared file"}, then continue the pipeline for ${item.key}.`;
  }
  if (item.gate !== null || item.node === null) return null; // 게이트는 터미널 줄이 없다 — 결정은 Inbox나 세션의 것
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

// Ready terminal work must remain visible while the owner handles a gate or commit.
export const WATCH_LINE = `Or leave ${clientRuntime("claude").resume_command} running in that session — it continues ready steps and waits for your gates and commits.`;

export function deriveTurn(items: readonly TurnItem[], setup: SetupState): Turn {
  if (items.length === 0) {
    const steps = setupSteps(setup);
    const firstOpen = steps.findIndex((s) => !s.done);
    return { kind: "setup", steps, current: (firstOpen === -1 ? steps.length - 1 : firstOpen) + 1 };
  }

  // 당신 차례 = 게이트가 열린 것 + 인수 실패 + 커밋을 기다리는 것. on_hold는 여전히 배너를 소유하지 않는다.
  const pending = items.filter((i) => i.gate !== null || i.acceptanceFailed || i.handoff !== null);
  // 보류한 항목은 커서를 멈춘 자리에 둔 채 런이 열려 있다(board-query.ts resetRun) — 재개가 그 자리를 이어받기
  // 위해서다. 그래서 노드만 보면 "작업 중"이 된다.
  // pipeline_next는 walkingKeys에서 같은 규칙으로 거른다(board-query.ts walkingKeys) — 그 주석이 말하는 "배너와 같은 규칙"이 여기다.
  const isProjectSlot = (node: string | null) => {
    const agent = slotAgent(node);
    return agent !== null && PROJECT_AGENTS.includes(agent);
  };
  const working = items.filter((i) => !pending.includes(i) && i.status !== "on_hold" && i.gate === null
    && (i.node === "plan" || i.node === "verify" || i.node === "implement" || isProjectSlot(i.node) || (i.node === "accept" && isAwaitingAcceptance(i.status, i.accepted))));
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
      next: nextSteps([...pending, ...working]),
      open,
    };
  }

  if (working.length > 0) {
    return {
      kind: "theirs",
      // 디스패치되지 않은 항목을 "하고 있다"고 말하면 사실이 아니다. 게이트를 열자마자 그 상태가 된다 —
      // 사람이 세션을 돌리기 전까지는 아무도 그 일을 하고 있지 않다. 아래 "Next, in Claude Code" 줄이 할 일을 준다.
      detail: working.map(workingLine).join(" · "),
      next: nextSteps(working),
    };
  }

  return { kind: "none", detail: setup.autoScoutEnabled === false ? SCOUT_OFF_DETAIL : NONE_DETAIL };
}
