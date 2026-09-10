---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-09-09"
approved-by: "HamSangEok"
approved-at: "2026-09-10"
approval-scope: "본문 §A–§H 전체와 Execution Plan 1–6. 구현 후 dev로 PR."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/protocol.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/fsd.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-09-09-session-approval-channel.md"
  - "docs/proposals/completed/2026-09-05-agent-next-open-routing.md"
  - "docs/proposals/completed/2026-09-04-harness-platform-phase-4-entitlement.md"
  - "docs/proposals/active/src-server-clean-code-findings.md"
---

# 설정 가능한 파이프라인 — 사이클을 런북 문서에서 서버의 그래프로 옮기고, 게이트와 서브에이전트 구성을 사용자가 정한다

## Summary

지금 파이프라인의 순서(pm → 게이트① → 계획 → 검증 → 게이트② → 구현 → 인수 → 감사)는 런북 문서
`CLAUDE.runbook.md`에 글로 있고, 사용자의 Claude Code(main-loop)가 그 글을 읽어 디스패치한다. 서버는
상태 기계(`packages/core/transitions.mjs`)로 전이만 검사한다. 게이트는 정확히 2개이고 위치도 고정이며,
서브에이전트 구성은 플랜이 허용하는 보고 에이전트 4종과 워크스페이스 dev로 고정이다.

이 제안은 **사이클 정의를 프로젝트별 그래프로 서버에 저장하고**, main-loop가 새 도구 `pipeline_next`로
"다음에 할 일" 하나를 받아 수행하게 한다. 그래프는 노드 8종(propose · gate · plan · verify · implement ·
accept · doc-audit · scout)의 **선형 체인**이고, 사용자는 새 탭 `Pipeline`의 레일에서 선택 노드를 빼고
게이트를 어느 간선에든 끼운다. 게이트는 0개까지 허용하되 `accept`는 못 뺀다. 게이트가 없는 자리의 상태
전이는 서버가 actor `pipeline`으로 자동 수행하고 원장에 남긴다. 플랜이 편집 가능 여부(Free는 기본 그래프
고정)와 디스패치 상한(롤링 30일 창에 Free 60 · Pro 600 · Max 무제한)을 정하며, 상한은 `AgentRun` 개설 수로 센다.
그래프는 저장마다 버전이 생기고 항목은 시작 시점 버전에 고정된다. pm 노드를 뺀 프로젝트의 입구로 백로그
화면에 "Put on the board"를 둔다.

바뀌지 않는 것: 상태 6종, 에이전트 템플릿의 `step:`·`requires:` 구조, `AgentRun` 커서, 증거 규칙
(`plan_submit`·`validation_record`·`report_submit`·인수), 소유자 토큰과 `/api/mcp/owner` 엔드포인트,
에이전트 서버에 게이트 도구가 없다는 사실(불변식 4).

## Goal

- 사용자가 프로젝트별로 게이트의 수와 위치, 참여 서브에이전트를 정한다. 게이트 0개 가능, 인수는 고정.
- 그래프가 **실제로 강제**된다: main-loop는 `pipeline_next`가 주는 노드만 수행하고, 게이트 없는 전이는
  서버가 하며, 디스패치 상한은 서버가 센다.
- 플랜이 편집 가능 여부·에이전트 종류·30일 창 디스패치 상한을 제한하고 `/billing` 표가 그것을 그린다.
- 런북에서 순서를 빼고 서버 한 곳만 진실로 남긴다. 일반·Free 두 판이 하나가 된다.
- 작업 유형: 순수 규칙 추가(`packages/core/pipeline.mjs`), 스키마 표 2개 추가(additive) + 상태 기계 행 2개
  추가, 서버 모듈 추가·수정, MCP 도구 추가 1(`pipeline_next`)·변경 1(`gate_approve` 입력), 웹 탭 1개와
  기능 슬라이스 2개 추가, Inbox·배너·백로그·항목 상세 수정, 템플릿(런북·dev 스텁 문구) 갱신, 문서·카피 갱신.

## Proposal Size

`proposal-size`: `standard`

선택 근거:

- 마이그레이션(표 2개), 상태 기계·API 계약 변경(`gate_approve` 입력, `pipeline_next` 추가), 라우팅(새 탭),
  결제 축(플랜 상한표) 영향, 20개가 넘는 파일 변경.
- 롤백이 단순 revert가 아니다 — 그래프 버전과 파이프라인 런 행이 생긴 뒤에는 코드를 되돌려도 행이 남는다
  (남아도 무해하게 설계한다, Risks 절).

## Current State

### 사이클의 순서는 문서에, 전이 규칙은 서버에 있다

`plugin/templates/en/CLAUDE.runbook.md`의 "The cycle — run by the main loop" 절이 8단계를 글로 들고
있고, 첫 줄이 "The definition of each state and who may change it is the server's state machine. This is
the order of execution only."다. 같은 파일의 "Where things stand" 절은 `board_list`·`board_get`으로
상태를 읽어 "누구 차례"를 답하게 한다. Free 판 `CLAUDE.runbook.free.md`는 4단계에 plan-verifier가 없고
8단계에 doc-auditor가 없다. 어느 판을 내려줄지는 `packages/core/deliver.mjs`의 `deliverable`이 정한다
(`plan === "free" && freeRunbook !== null`이면 교체).

전이 규칙은 `packages/core/transitions.mjs`의 `RULES` 하나다. 게이트는 `kind: "gate"` 두 행
(`proposed → planning`, `in_review → implementing`, actor `human`)이고, 이 표에 없는 전이는 없다.
`src/server/pipeline/board-rules.ts`의 `Actor`는 `"human" | "agent"` 둘뿐이다.

### 디스패치는 서버가 모른다

`agent_next`(`src/server/agents/next.ts`)는 에이전트가 **스스로** 부르는 도구다. run이 없으면 `entrySteps`
중 `requires`가 맞는 첫 단계로 `createRun`한다. main-loop가 어느 에이전트를 언제 디스패치했는지 서버에
남는 것은 그 결과인 `AgentRun` 행뿐이다. 호출 제한은 `RATE_LIMIT = { calls: 60, windowMs: 10 * 60_000 }`
(토큰당, 원장 행 기준)뿐이고 플랜별 누적 상한은 없다.

`plugin/templates/en/agents/dev.md`의 단계 그래프는 `plan(requires: planning) → next: done`,
`implement(requires: implementing) → verify → report → done`이다. 즉 **계획 run은 `plan` 뒤에 닫히고 구현은
새 run이다** — 사이클당 dev의 `AgentRun`은 2개다. (grilling 질문 7에서 "dev의 run이 계획과 구현을 한
run으로 가로지른다"고 한 말은 틀렸다. 이 사실이 이 제안의 상한 계수 자리를 정한다 — §C.5.)

### 게이트는 웹 Inbox와 세션 채널 둘 다에 있고, 둘 다 상태 기계에서 "게이트 여부"를 읽는다

- 웹: `src/fsd/features/review-gate/model/gate-source.ts`의 `isGateSource(status)`·`gateTargetFor(status)`가
  `findRule("human", status, to)?.kind === "gate"`로 판정하고, `inbox-item.ts`의 `toInboxItems`가
  `needsHumanDecision(row.status)`로 카드를 고른다. 카드(`ui/inbox-card.tsx`)는 `gateTargetFor`의 목적지로
  `GateTransitionButton`을 그리고, 액션은 `api/review-gate.server.ts`의 `humanTransition`이
  `board.transition(..., { actor: "human", channel: "web", expectedUpdatedAt })`을 부른다.
- 세션: `src/server/mcp/owner-tools.ts`의 `gate_approve`가 `{ key, to: planning | implementing, planCommit? }`을
  받아 `board.sessionGate`를 부르고, 응답 `next`는 `GATE_STEP = { planning: 3, implementing: 6 }`의 **런북
  단계 번호**를 싣는다. 판정은 `board-rules.ts`의 `decideSessionGate`다.
- 배너: `src/fsd/widgets/turn-banner/model/turn.ts`의 `deriveTurn`이 `isGateSource(i.status)`로 "내 차례"를
  세고, `nextStepLine`이 "Continue the runbook for FEAT-01: step 3 — …"처럼 **런북 단계 번호**로 말한다.
- 보드 화면의 `src/fsd/pages/project-board/model/briefing.ts`도 `isGateSource`로 gate 항목을 앞에 둔다.

### 항목의 입구는 pm뿐이다

`board.propose`(`src/server/pipeline/board.ts`)는 `board_propose` 도구에서만 불리며 이벤트를
`actor: "agent"`로 고정해 쓴다. 웹에는 항목을 보드에 올리는 화면이 없다(`src/fsd/features/`에
`create-project`·`edit-backlog`·`manage-token`·`review-gate` 넷뿐). `backlog-table.tsx`의 행에는 편집 링크와
제거 버튼만 있다.

### 플랜 표

`packages/core/entitlement.mjs`의 `LIMITS` 축은 `projects`·`workspaces`·`backlog`·`historyDays`·`agents`·
`sessionApprovals`이고 `AXES = ["projects", "workspaces", "backlog"]`가 `withinLimit`·`capReason`의 대상이다.
`/billing` 표는 `src/fsd/shared/lib/entitlement-copy.ts`의 `planMatrix()`가 그 축을 줄로 그린다.

### 왜 지금 이 방식인가 (대안 요약)

grilling으로 15건을 결정했다(Approval 절의 표). 핵심 셋만 여기 적는다.

- **편집 단위 — 서버 소유 그래프 + 고정 카탈로그(B)** vs 고정 골격 토글(A) vs 사용자 정의 노드(C).
  A는 "이어 붙이고 뗀다"의 절반만 채우고, C는 "절차 본문은 서버가 소유한다"와 플랜별 에이전트 제한을 둘 다
  무너뜨린다. B는 노드 카탈로그가 서버 상수라 확장이 한 줄이고, 플랜 제한과 게이트 강제를 서버에서 한다.
- **실행 — 서버 커서 + `pipeline_next`(A)** vs 런북 생성(B) vs `agent_next`의 그래프 검사(C). B는 게이트
  없는 전이를 누가 하는지 답이 없고(main-loop에 게이트 도구를 주면 불변식 4가 깨진다) 횟수를 못 센다.
  C는 main-loop가 순서를 문서에서 읽어야 해서 "지금 어디까지 했어?"의 답이 그래프와 어긋난다.
- **모양 — 선형 체인(A)** vs 자유 DAG(B). 노드 8종이 보드 상태에 묶여 있어 순서는 거의 정해져 있고,
  병렬 분기는 "디스패치는 main-loop 하나가 한 번에 하나"와 충돌한다. `implement → plan` 같은 그래프를
  거부하는 규칙이 결국 A의 골격이 된다.

## Scope

포함 범위:

- `packages/core/pipeline.mjs`(신규): 노드 카탈로그, 기본 그래프, 그래프 검증, 시퀀스, 게이트 경계, 커서
  전진의 순수 판정. `entitlement.mjs`에 축 `pipelineEdit`·`dispatches`(30일 창)와 `dispatchCutoff`. `transitions.mjs`에 actor
  `pipeline`의 자동 전이 2행.
- 스키마: `PipelineVersion`·`PipelineRun` 표. 마이그레이션 1개.
- 서버: `src/server/pipeline/run-rules.ts`(순수 — `PipelineNext`·`HINT`·`decideNext`, key 없는 호출의 머리 `decideHead`), `run.ts`(버전·런 보장, 사실 읽기, `nextFor`·`headFor`), `board.ts`의 훅
  (propose·transition·recordValidation·submitReport 뒤 `advanceRun`, 사람 되돌리기 뒤 `resetRun`, 웹·세션 공통 `gate`, `transitionIn`),
  `board-rules.ts`(`Actor`에 `pipeline`, `decideSessionGate`를 게이트 id를 받는 `decideGate`로 대체), `agents/next.ts`(run 개설
  시 30일 창 상한), `mcp/tools.ts`(`pipeline_next` 등록), `mcp/owner-tools.ts`(`gate_approve` 입력 `gate`).
- 웹: 탭 `Pipeline`(`src/app/(app)/p/[slug]/pipeline/page.tsx`, `src/fsd/pages/project-pipeline`,
  `src/fsd/features/edit-pipeline`, `src/fsd/entities/pipeline`), Inbox 카드가 런의 게이트로 판정, 배너·
  보드 브리핑이 런의 게이트·노드로 말함, 항목 상세 History에 `pipeline` actor·게이트 note 표시, 백로그
  "Put on the board"(`src/fsd/features/propose-item`), `/billing` 표 2행.
- 플러그인·템플릿: 런북에서 순서를 빼고 `pipeline_next`를 따르게, Free 판 삭제, dev 스텁의 "Never" 문구
  한 줄, pm 스텁·보고 형식과 `docs/plans/README.md`의 게이트 전제 문구(§F.5), `templates.test.mjs`, `deliver.mjs`의 Free 교체 제거.
- 문서·카피: `protocol.md`(도구 표·새 절 "파이프라인 그래프"·상태 기계 행), `invariants.md`(자동 전이 문단),
  `system-overview.md`(권한 표·소유권 표), `product-copy.md`(§3·§5·§7·§8·§11·§12·§13·§14·§16 + 새 절 "Pipeline tab").

제외 범위:

- 사용자 정의 노드·자기 템플릿 업로드(grilling 질문 1의 C). 카탈로그는 서버 상수다.
- 자유 DAG·병렬 분기·조건 분기 노드(질문 5의 B·C).
- 새 보드 상태. 상태 6종은 그대로다(질문 6의 C).
- 열린 항목을 새 그래프 버전으로 옮기는 버튼(질문 9의 D). 첫 판에는 없다.
- 결제 경로. 플랜은 여전히 `plan:grant` 스크립트가 준다. 숫자(60·600)는 상한표 한 줄이라 뒤에 바꿀 수 있다.
- `Command`·`release_*` 등 Phase 3 도구(카탈로그에 자리도 예약하지 않는다, 질문 4의 C).
- React Flow 같은 캔버스 라이브러리(질문 11의 B). 레일은 React + Tailwind다.

## Proposal

### A. 순수 규칙: `packages/core/pipeline.mjs`

**A.1 카탈로그와 골격.** 비게이트 노드 7종의 정해진 순서가 골격이다. `gate`는 노드 종류이되 위치가 간선이라
`nodes`가 아니라 `gates`에 산다. 게이트 id는 `before-<kind>` — 그 노드 **앞** 간선을 뜻한다. 간선당 게이트는
하나이므로 "연속 2개 금지"는 id 자체가 보장한다. `propose`는 머리라 `before-propose`는 없다. `scout`는 **opt-in**이다 — 기본 그래프에
없고 Pipeline 탭에서 넣는다. 이유: feature-scout는 `harness.json.scout`이 있어야 도는 에이전트인데(생성기 `harness-init.mjs`가 그때만
`.claude/agents/feature-scout.md`를 쓰고, 스텁이 `{{scout.question}}`을 읽는다) 서버는 `harness.json`을 모른다(`src/server/agents/vars.ts`:
"scout·release는 DB에 없다"). 기본 그래프에 넣으면 그래프를 못 고치는 플랜에서 설정 없는 프로젝트가 `scout` 노드에서 영영 `dispatch`를 받는다.

```js
// packages/core/pipeline.mjs — 순수. import는 entitlement.mjs뿐.
// 파이프라인 그래프 — "이 프로젝트에서 항목이 어느 노드를 어떤 순서로 지나고, 어디서 사람이 멈추는가"의 단일 출처.
// 서버(run.ts)가 커서를 옮길 때, 웹(edit-pipeline)이 레일을 그릴 때, 저장 액션이 검증할 때 같은 함수를 쓴다.
import { limitsFor } from "./entitlement.mjs";

// 비게이트 노드 7종, 골격 순서. 게이트는 노드가 아니라 간선(before-<kind>)이다.
export const NODE_KINDS = ["propose", "plan", "verify", "implement", "accept", "doc-audit", "scout"];
export const REQUIRED_NODES = ["plan", "implement", "accept"]; // 못 뺀다 — accept는 증거 규칙이지 게이트가 아니다
export const TAIL_NODES = ["doc-audit", "scout"];               // accept 뒤. 서로 순서를 바꿀 수 있다
// 노드가 디스패치하는 에이전트. plan·implement는 항목의 dev(BoardItem.agent), accept는 main-loop 본인(디스패치 아님).
export const NODE_AGENT = { propose: "pm", verify: "plan-verifier", "doc-audit": "doc-auditor", scout: "feature-scout" };
export const GATE_PREFIX = "before-";
export const gateId = (kind) => `${GATE_PREFIX}${kind}`;
export const isGateId = (id) => typeof id === "string" && id.startsWith(GATE_PREFIX);
export const gateKind = (id) => (isGateId(id) ? id.slice(GATE_PREFIX.length) : null);
// 상태 경계가 있는 게이트 둘. 승인이 전이까지 한다. 없으면 같은 상태의 이벤트만 남는다.
export const BOUNDARY = {
  [gateId("plan")]: { from: "proposed", to: "planning" },
  [gateId("implement")]: { from: "in_review", to: "implementing" },
};
export const boundaryOf = (id) => BOUNDARY[id] ?? null;
export const DEFAULT_GATES = [gateId("plan"), gateId("implement")]; // 지금의 게이트①·②

// 이 플랜에서 쓸 수 있는 노드인가 — 노드의 에이전트가 플랜의 보고 에이전트 집합에 있어야 한다. 에이전트 없는 노드는 언제나.
export function nodeAllowed(plan, kind) {
  const agent = NODE_AGENT[kind];
  return agent === undefined || limitsFor(plan).agents.includes(agent);
}
// harness.json에 달린 노드 — 서버가 설정을 모르므로 기본 그래프에 넣지 않는다(Pipeline 탭에서 넣는다). 지금은 scout 하나.
export const OPT_IN_NODES = ["scout"];
// 기본 그래프 = 골격에서 플랜 밖 노드와 opt-in 노드를 뺀 것 + 게이트 둘. Free: propose·plan·implement·accept (verify·doc-audit 없음).
export function defaultGraph(plan) {
  return { nodes: NODE_KINDS.filter((k) => nodeAllowed(plan, k) && !OPT_IN_NODES.includes(k)), gates: [...DEFAULT_GATES] };
}
export function allowsPipelineEdit(plan) { return limitsFor(plan).pipelineEdit; }

// 저장 전 검증. 사유는 화면에 그대로 보인다(product-copy.md §12).
export function validateGraph(graph, plan) {
  const { nodes, gates } = graph ?? {};
  if (!Array.isArray(nodes) || !Array.isArray(gates)) return { ok: false, reason: "graph must have nodes and gates" };
  if (new Set(nodes).size !== nodes.length) return { ok: false, reason: "a node appears twice" };
  for (const k of nodes) if (!NODE_KINDS.includes(k)) return { ok: false, reason: `unknown node: ${k}` };
  for (const k of REQUIRED_NODES) if (!nodes.includes(k)) return { ok: false, reason: `${k} can't be removed` };
  for (const k of nodes) if (!nodeAllowed(plan, k)) return { ok: false, reason: `${k} is not on the ${plan} plan` };
  // 순서: accept까지는 골격의 부분열, 그 뒤는 꼬리 노드만(순서 자유).
  const acceptAt = nodes.indexOf("accept");
  const head = nodes.slice(0, acceptAt + 1), tail = nodes.slice(acceptAt + 1);
  const headOrder = head.map((k) => NODE_KINDS.indexOf(k));
  if (headOrder.some((n, i) => i > 0 && n <= headOrder[i - 1])) return { ok: false, reason: "nodes before accept must keep the order propose · plan · verify · implement · accept" };
  if (tail.some((k) => !TAIL_NODES.includes(k))) return { ok: false, reason: "only doc-audit and scout may follow accept" };
  if (new Set(gates).size !== gates.length) return { ok: false, reason: "a gate appears twice" };
  for (const g of gates) {
    const k = gateKind(g);
    if (k === null || k === "propose" || !nodes.includes(k)) return { ok: false, reason: `gate ${g} has no node after it` };
  }
  return { ok: true };
}

// 커서가 걷는 순서: 노드마다 그 앞 게이트(있으면) → 노드. 예: [propose, before-plan, plan, verify, before-implement, implement, accept, doc-audit, scout]
export function sequence(graph) {
  return graph.nodes.flatMap((k) => (graph.gates.includes(gateId(k)) ? [gateId(k), k] : [k]));
}
export function nextAfter(graph, id) {
  const seq = sequence(graph), i = seq.indexOf(id);
  return i < 0 || i === seq.length - 1 ? null : seq[i + 1];
}
// 사람이 상태를 되돌리거나 옮긴 뒤 커서가 서는 자리 — 상태가 말하는 노드(그 앞 게이트가 있으면 게이트).
// proposed는 plan 앞, in_review는 verify(없으면 implement 앞), on_hold는 부르지 않는다(커서는 그대로 잠든다).
export function cursorForStatus(graph, status) {
  const at = (kind) => (graph.gates.includes(gateId(kind)) ? gateId(kind) : kind);
  switch (status) {
    case "proposed": return at("plan");
    case "planning": return "plan";
    case "in_review": return graph.nodes.includes("verify") ? "verify" : at("implement");
    case "implementing": return "implement";
    case "done": return "accept";
    default: return null;
  }
}
// 노드 하나가 끝났는가 — 증거로만 판정한다(에이전트의 말이 아니라 원장·보드).
//   propose: 행이 있다(런이 있다는 뜻) · plan: 계획서가 제출돼 in_review 이후다 · verify: 검증 기록 · implement: done
//   accept: acceptedAt · doc-audit/scout: 커서가 들어온 뒤 그 에이전트의 run이 닫혔다
export function nodeDone(kind, facts) {
  switch (kind) {
    case "propose": return true;
    case "plan": return ["in_review", "implementing", "done"].includes(facts.status);
    case "verify": return facts.validation !== null;
    case "implement": return facts.status === "done";
    case "accept": return facts.accepted;
    case "doc-audit": return facts.closedAgents.includes("doc-auditor");
    case "scout": return facts.closedAgents.includes("feature-scout");
    default: return false;
  }
}
// 커서 전진의 순수 판정. cursor에서 시작해 끝난 노드·승인된 게이트를 넘고, 게이트 없는 경계는 자동 전이로 넘는다.
// 돌려주는 것: 새 커서(끝나면 null), 지나온 자리(게이트 포함 — enteredAt 갱신의 근거), 해야 할 자동 전이.
// 경계 검사는 **커서가 서 있는 노드**에서 한다 — "다음 노드로 넘어갈 때"가 아니라. 그래야 propose 없는 그래프의 첫 노드(plan)나
// 웹 "Put on the board"로 만들어져 plan에 선 런, cursorForStatus로 자리 잡은 런도 proposed에 갇히지 않는다.
export function advance(graph, cursor, facts) {
  let at = cursor, status = facts.status;
  const entered = [], transitions = [];
  for (;;) {
    if (at === null) return { cursor: null, entered, transitions };
    if (isGateId(at)) {
      if (!facts.approvedGates.includes(at)) return { cursor: at, entered, transitions };
    } else {
      // 이 노드 앞에 경계가 있는데 그래프에 게이트가 없으면 서버가 넘는다(actor pipeline). 게이트가 있으면 커서가 게이트에 섰을 것이다.
      const b = boundaryOf(gateId(at));
      if (b !== null && status === b.from && !graph.gates.includes(gateId(at))) { transitions.push(b); status = b.to; }
      if (!nodeDone(at, { ...facts, status })) return { cursor: at, entered, transitions };
    }
    const next = nextAfter(graph, at);
    if (next !== null) entered.push(next);
    at = next;
  }
}
```

`advance`는 멱등이다 — 같은 사실로 두 번 돌려도 자동 전이는 `status === b.from`일 때만 나오고, 두 번째 호출에서는
상태가 이미 `b.to`라 나오지 않는다. 서버는 여기에 커서 CAS를 더한다(§C.8).

**A.2 상한표.** `entitlement.mjs`의 `LIMITS`에 축 둘, `AXES`에 `dispatches`, `AXIS_NOUN`에 명사, 창의 시작을 주는
순수 함수 `dispatchCutoff`. 기간은 **롤링 30일 창**이다 — `historyDays`·`historyCutoff`와 같은 무늬라 달력 경계도 시간대도 없다.

Before (`packages/core/entitlement.mjs`, 읽은 현재 코드):

```js
export const LIMITS = {
  free: { projects: 1, workspaces: 1, backlog: 10, historyDays: 30, agents: ["pm", "feature-scout"], sessionApprovals: false },
  pro: { projects: 5, workspaces: 10, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS, sessionApprovals: true },
  max: { projects: UNLIMITED, workspaces: UNLIMITED, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS, sessionApprovals: true },
};
const AXES = ["projects", "workspaces", "backlog"];
// …
const AXIS_NOUN = { projects: "project", workspaces: "workspace", backlog: "backlog" };
```

After:

```js
export const LIMITS = {
  free: { projects: 1, workspaces: 1, backlog: 10, historyDays: 30, agents: ["pm", "feature-scout"], sessionApprovals: false, pipelineEdit: false, dispatches: 60 },
  pro: { projects: 5, workspaces: 10, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS, sessionApprovals: true, pipelineEdit: true, dispatches: 600 },
  max: { projects: UNLIMITED, workspaces: UNLIMITED, backlog: UNLIMITED, historyDays: null, agents: REPORT_AGENTS, sessionApprovals: true, pipelineEdit: true, dispatches: UNLIMITED },
};
const AXES = ["projects", "workspaces", "backlog", "dispatches"];
// dispatches 축의 창. historyDays처럼 롤링 창이다 — 달력 경계가 없어 시간대 문제가 없고, 오래된 run이 빠지며 상한이 조금씩 풀린다.
export const DISPATCH_WINDOW_DAYS = 30;
// …
const AXIS_NOUN = { projects: "project", workspaces: "workspace", backlog: "backlog", dispatches: "dispatch" };
// …
// 디스패치 창의 시작 — 이 시각 이후에 열린 AgentRun을 센다. historyCutoff와 같은 모양(플랜 무관, 창 상수 하나).
export function dispatchCutoff(now) {
  return new Date(now.getTime() - DISPATCH_WINDOW_DAYS * 86_400_000);
}
```

`capReason("free", "dispatches")`는 기존 함수 그대로 `dispatch cap reached on the free plan (60)`을 만들고, `capError`도
그대로 쓴다(추가 전 검사 = 현재 수 + 1). 창의 뜻("지난 30일")은 `/billing` 줄 라벨과 `agent_next`의 거부 문구 뒤에 붙는
설명이 말한다 — 문장 본체는 `capReason` 하나다.

**A.3 자동 전이.** `transitions.mjs`의 `RULES`에 actor `pipeline` 두 행. 다른 actor의 행은 한 글자도 안 바뀐다.

Before (`packages/core/transitions.mjs`, 읽은 현재 코드 — 표의 머리):

```js
const RULES = [
  // 사람(웹 로그인)만 — 게이트
  { from: "proposed", to: "planning", actor: "human", kind: "gate" },
  { from: "in_review", to: "implementing", actor: "human", kind: "gate" },
```

After:

```js
const RULES = [
  // 사람(웹 로그인 또는 소유자 토큰)만 — 게이트
  { from: "proposed", to: "planning", actor: "human", kind: "gate" },
  { from: "in_review", to: "implementing", actor: "human", kind: "gate" },
  // 파이프라인 — 그래프에 그 자리의 게이트가 **없을 때만** 서버가 넘는다(pipeline.mjs advance). 사람 게이트와 같은 경계.
  { from: "proposed", to: "planning", actor: "pipeline", kind: "auto" },
  { from: "in_review", to: "implementing", actor: "pipeline", kind: "auto" },
```

`findRule("pipeline", …)`은 그대로 동작한다. 상태 기계는 "누가 할 수 있나"만 말하고, "게이트가 없을 때만"은
그래프(`advance`)가 정한다 — 두 조건을 다 만족해야 서버가 쓴다(§C.2).

### B. 스키마

```prisma
model PipelineVersion {                  // 프로젝트의 그래프. 저장마다 새 행 — 항목은 시작 시점 버전에 고정된다(원장 = 감사 로그)
  id        String   @id @default(cuid())
  projectId String
  version   Int                          // 1부터. 현재 = 프로젝트의 최대 version
  nodes     String[]                     // pipeline.mjs NODE_KINDS의 부분열
  gates     String[]                     // before-<kind>
  createdAt DateTime @default(now())
  createdBy String                       // userId. 기본 그래프를 서버가 물질화했으면 "pipeline"
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  runs      PipelineRun[]
  @@unique([projectId, version])
}

model PipelineRun {                      // 항목의 커서 — "지금 어느 노드(또는 어느 게이트 앞)에 서 있나". BoardItem당 하나
  id          String          @id @default(cuid())
  boardItemId String          @unique
  versionId   String
  node        String                     // NODE_KINDS 또는 before-<kind>. 끝나면 마지막 노드 그대로 두고 closedAt
  enteredAt   DateTime        @default(now())   // 이 node에 선 시각 — 게이트 승인·에이전트 run 닫힘은 이 시각부터(>=)의 것만 센다
  closedAt    DateTime?
  boardItem   BoardItem       @relation(fields: [boardItemId], references: [id], onDelete: Cascade)
  version     PipelineVersion @relation(fields: [versionId], references: [id], onDelete: Cascade) // 이 스키마의 다른 관계와 같이. 없으면 Prisma 기본 Restrict라 프로젝트 삭제(Project → PipelineVersion 캐스케이드)가 막힌다
}
```

`BoardItem`에 `run PipelineRun?`, `Project`에 `pipelineVersions PipelineVersion[]` 역참조를 더한다.
`TransitionEvent.actor`의 주석을 `human | agent | pipeline`으로 고친다(열 자체는 String). 디스패치 상한은 새 표 없이
`AgentRun.openedAt`으로 센다(§C.5) — 이미 있는 원장을 두 번 적지 않는다.

마이그레이션 이름: `<timestamp>_pipeline_version_and_run`. 기존 행에 대한 backfill은 없다 — 열린 항목의 런은
`ensureRun`이 처음 만날 때 만든다(§C.1). 그때 커서는 `cursorForStatus`로 잡는다.

순서와 되돌림: 표 2개를 **새로 만들 뿐**이라 마이그레이션은 기존 표를 잠그지 않고, 코드 배포 전에 적용해도 옛 코드는 새 표를
모르니 영향이 없다(순서: 마이그레이션 → 배포). 되돌림은 두 표 `DROP`이고 데이터 손실은 그 두 표뿐이다(Risks and Rollback).
로컬은 `npx prisma migrate dev` 뒤 dev 서버를 재시작해야 새 클라이언트가 실린다(메모리 규칙).

### C. 서버: `src/server/pipeline/run.ts`와 `board.ts`의 훅

모듈 경계: 파일은 셋이다. **`run-rules.ts`**는 순수다(`board-rules.ts`와 같은 층 — `server-only`도 Prisma도 없고 core `.mjs`의 값만
import한다): `PipelineNext` 형, `HINT` 표, 읽어 온 사실로 `pipeline_next`의 답 하나를 정하는 `decideNext`, key 없는 호출의 머리를 정하는 `decideHead`(§D.1). **`run.ts`**는 어댑터다
(`board.ts`처럼 `server-only`): 버전·런 보장, 사실 읽기, `nextFor`·`headFor`(사실을 읽어 `decideNext`·`decideHead`에 넘긴다). 전이를 **쓰는** `advanceRun`·`resetRun`은
`board.ts`에 산다(`transitionIn`을 같은 트랜잭션에서 부르기 위해서다 — `prisma.$transaction` 안에서 `board.transition`을 다시 부르면 트랜잭션이
중첩된다). 방향은 `board.ts → run.ts → run-rules.ts` 하나다. 순수 판정을 따로 두는 이유는 테스트다 — `server-only`는 node에서 import 즉시
throw하므로(`node_modules/server-only/index.js`, 스크래치 실측) `test:web`은 `run.ts`를 실을 수 없다; 저장소의 어느 테스트도 `server-only`
모듈을 import하지 않고, `next.ts`·`board-rules.ts`·`tools.ts`가 순수인 이유가 그것이다.
`@harness/core/*.mjs`에서는 값만 import한다(`tsconfig`는 `allowJs`이고 `.d.ts`가 없다 — 지금 저장소의 어느 TS 파일도 core에서
타입을 import하지 않는다). 그래프 타입은 `run.ts`가 자기 안에 둔다.

**C.1 런 보장과 버전 물질화.** 프로젝트에 `PipelineVersion`이 없으면 `defaultGraph(plan)`을 version 1로
만든다(`createdBy: "pipeline"`). 항목에 런이 없으면 현재 버전으로 만든다 — 새 항목은 `sequence[0]`
(propose가 있으면 `propose`, 없으면 `before-plan` 또는 `plan`), 기존 항목은 `cursorForStatus(graph, status)`.

```ts
// src/server/pipeline/run.ts — 파이프라인 런의 저장과 사실 읽기. 판정은 packages/core/pipeline.mjs. board.ts를 import하지 않는다.
import "server-only";
import { cursorForStatus, defaultGraph, isGateId, sequence } from "@harness/core/pipeline.mjs";
import { Prisma, type PrismaClient } from "@/generated/prisma/client"; // Prisma는 값 — P2002 검사에 쓴다(edit-backlog.server.ts와 같은 import)
import { planForProject } from "@/server/entitlement";

type Db = PrismaClient | Prisma.TransactionClient;
// 유니크 충돌 — 동시 생성의 진 쪽. create-project.server.ts·edit-backlog.server.ts의 같은 검사와 같은 모양.
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
export type Graph = { nodes: string[]; gates: string[] }; // core는 JS라 타입을 주지 않는다 — 여기가 서버 쪽 정의
export type RunRow = { id: string; node: string; enteredAt: Date; closedAt: Date | null; version: { id: string; version: number; nodes: string[]; gates: string[] } };
// advance()에 넣는 사실. 읽는 곳은 readFacts 하나(§C.2의 표).
export type Facts = { status: string; validation: string | null; accepted: boolean; approvedGates: string[]; closedAgents: string[] };

// 현재 버전 = 프로젝트의 최대 version. 없으면 기본 그래프를 version 1로 물질화한다. 두 호출자가 동시에 처음 만나면
// @@unique([projectId, version])가 한쪽을 P2002로 막는다 — 그쪽은 다시 읽는다(§C.8).
export async function currentVersion(db: Db, projectId: string) {
  const row = await db.pipelineVersion.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
  if (row) return row;
  const graph = defaultGraph(await planForProject(projectId));
  try {
    return await db.pipelineVersion.create({ data: { projectId, version: 1, nodes: graph.nodes, gates: graph.gates, createdBy: "pipeline" } });
  } catch (e) {
    if (isUniqueViolation(e)) return db.pipelineVersion.findFirstOrThrow({ where: { projectId }, orderBy: { version: "desc" } });
    throw e;
  }
}

// 항목의 런. 없으면 만든다 — 새 항목(status proposed, 이벤트 1건)은 머리에서, 마이그레이션 전 항목은 상태가 말하는 자리에서.
// boardItemId @unique라 동시 생성은 한쪽만 이긴다 — 진 쪽은 다시 읽는다.
export async function ensureRun(db: Db, projectId: string, boardItemId: string, status: string, fresh: boolean): Promise<RunRow> {
  const found = await db.pipelineRun.findUnique({ where: { boardItemId }, include: { version: true } });
  if (found) return found;
  const version = await currentVersion(db, projectId);
  const graph: Graph = { nodes: version.nodes, gates: version.gates };
  const node = (fresh ? sequence(graph)[0] : cursorForStatus(graph, status)) ?? sequence(graph)[0];
  try {
    return await db.pipelineRun.create({ data: { boardItemId, versionId: version.id, node }, include: { version: true } });
  } catch (e) {
    if (isUniqueViolation(e)) return db.pipelineRun.findUniqueOrThrow({ where: { boardItemId }, include: { version: true } });
    throw e;
  }
}
```

**C.2 전진.** `advanceRun(tx, projectId, key)`는 **`board.ts`에** 있고 보드 쓰기 경로의 **끝**에서 같은 트랜잭션으로 불린다.
`run.readFacts(tx, projectId, row, run)`로 사실을 읽고 `advance`를 돌린 뒤, 자동 전이가 있으면 `transitionIn(tx, projectId,
{ key, to: b.to }, { actor: "pipeline", actorRef: \`pipeline:${run.version.id}\` })`를 그 자리에서 부르고(전이 규칙은 상태 기계가,
"게이트 없음"은 `advance`가 이미 보장했다), 커서를 갱신한다. 사실 읽기는 `readFacts` 하나가 한다:

| 사실 | 출처 |
| --- | --- |
| `status`·`validation`·`accepted` | 최신 `BoardItem` 행(`acceptedAt !== null`) |
| `approvedGates` | `TransitionEvent` where `boardItemId`, `at >= run.enteredAt`, (`note = "gate:<id>"`) 또는 (경계 게이트면 `from/to`가 그 경계이고 actor `human`) |
| `closedAgents` | `AgentRun` where `projectId`, `agent in ["doc-auditor","feature-scout"]`, `key null`, `openedAt >= run.enteredAt`, `closedAt not null` |

두 시각 비교가 `>`가 아니라 `>=`인 이유: 마이그레이션 전 항목은 `ensureRun`과 게이트 승인이 **한 트랜잭션**에서 일어날 수 있다(§C.7 —
`gate`가 런을 보장한 뒤 이벤트를 쓴다). 그때 런의 `enteredAt`과 이벤트의 `at`는 둘 다 기본값 `CURRENT_TIMESTAMP`(마이그레이션 SQL의
`TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP` — Postgres에서는 트랜잭션 시작 시각)라 **같다**. `>`면 방금 연 게이트를 못 세어 커서가 게이트에
갇힌다. 옛 승인이 같은 ms에 겹칠 일은 없다 — 커서가 게이트에 선 `enteredAt`은 그 뒤 트랜잭션의 `new Date()`(아래 CAS)다.

커서 갱신은 CAS다 — `tx.pipelineRun.updateMany({ where: { id: run.id, node: run.node }, data: { node, enteredAt: new Date() } })`.
커서가 바뀌면(게이트에 선 것도 포함) `enteredAt`을 지금으로 갱신한다 — 다음 자리의 "이 시각부터" 판정이 옛 승인·옛 run을
세지 않게. `advance`가 `cursor: null`을 주면 `closedAt`을 찍는다. `on_hold`·폐기·`done` 뒤 reopen은 §C.3.
`doc-audit`·`scout`는 프로젝트 단위 에이전트라(run에 key가 없다) 같은 시각에 그 노드에 선 항목들이 한 run 닫힘으로 함께
넘어간다 — 의도된 동작이고, 항목마다 감사를 따로 돌리지 않는다.

**C.3 사람 전이 뒤의 커서.** `board.transition`에서 규칙 `kind`가 `bounce`·`hold`·`resume`·`reopen`이면
`advanceRun` 대신 `resetRun(tx, projectId, key, newStatus)`(`board.ts`)를 부른다 — 자리는 `cursorForStatus(graph, newStatus)`. `hold`는 `cursorForStatus`가 `null`을
주므로 커서를 **그대로 두고** `enteredAt`만 갱신한다(잠든다). `resume`은 목적지 상태의 자리로 간다.
폐기(`discard`)는 런의 `closedAt`을 찍는다. `reopen`은 `done → implementing | planning`이라 `implement` 또는 `plan`
자리로 돌아간다 — 이 규칙은 `packages/core/pipeline.mjs`의 `cursorForStatus` 하나에 있고 `board.ts`는 부르기만 한다.

**C.4 `board.ts`의 변경점.** `Caller`에 세 번째 멤버, `propose`가 caller를 받음, 쓰기 경로 끝에 훅.

Before (`src/server/pipeline/board.ts`, 읽은 현재 코드):

```ts
export type Caller =
  | { actor: "human"; actorRef: string; channel: Channel; expectedUpdatedAt: Date }
  | { actor: "agent"; actorRef: string };
// …
export async function propose(projectId: string, input: { key: string; agent: string; reason: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const backlog = await tx.backlogItem.findUnique({ where: { projectId_key: { projectId, key: input.key } } });
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const openOnly = true;
    const open = await latestBoard(projectId, openOnly, tx);
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: !!backlog && open.some((r) => r.backlogItemId === backlog.id),
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
    if (!d.ok || !backlog) return fail(d.ok ? "no such backlog item" : d.reason);
    const item = await tx.boardItem.create({
      data: { projectId, backlogItemId: backlog.id, agent: input.agent, status: "proposed", reason: input.reason,
        events: { create: { from: null, to: "proposed", actor: "agent", actorId: actorRef } } },
    });
    return { ok: true as const, item };
  }, { isolationLevel: "Serializable" });
}
```

After:

```ts
export type Caller =
  | { actor: "human"; actorRef: string; channel: Channel; expectedUpdatedAt: Date }
  | { actor: "agent"; actorRef: string }
  // 그래프에 게이트가 없는 경계를 서버가 넘을 때. CAS는 agent처럼 방금 읽은 row.updatedAt. actorRef = "pipeline:<versionId>".
  | { actor: "pipeline"; actorRef: string };

// 누가 올렸나 — pm(agent 토큰) 또는 소유자(웹 "Put on the board"). 행·이벤트 모양은 같고 actor·channel만 다르다.
export type Proposer = { actor: "agent"; actorRef: string } | { actor: "human"; actorRef: string; channel: Channel };

export async function propose(projectId: string, input: { key: string; agent: string; reason: string }, by: Proposer) {
  return prisma.$transaction(async (tx) => {
    const backlog = await tx.backlogItem.findUnique({ where: { projectId_key: { projectId, key: input.key } } });
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const openOnly = true;
    const open = await latestBoard(projectId, openOnly, tx);
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: !!backlog && open.some((r) => r.backlogItemId === backlog.id),
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
    if (!d.ok || !backlog) return fail(d.ok ? "no such backlog item" : d.reason);
    const item = await tx.boardItem.create({
      data: { projectId, backlogItemId: backlog.id, agent: input.agent, status: "proposed", reason: input.reason,
        events: { create: { from: null, to: "proposed", actor: by.actor, actorId: by.actorRef, channel: by.actor === "human" ? by.channel : null } } },
    });
    // 런은 항목과 같은 트랜잭션에서 머리에 선다. 게이트 없는 before-plan이면 여기서 바로 planning으로 넘는다.
    await ensureRun(tx, projectId, item.id, "proposed", true);
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: item.id } }) };
  }, { isolationLevel: "Serializable" });
}
```

`transition`의 변경은 세 곳이다(함수 전체는 읽은 현재 코드 그대로이고 — §C.4의 Before 블록에는 없다 — 아래 줄만 바뀐다):

```ts
    const expected = caller.actor === "human" ? caller.expectedUpdatedAt : row.updatedAt;           // 그대로 — pipeline은 agent와 같다
    // …
    await tx.transitionEvent.create({ data: {
      boardItemId: row.id, from: row.status, to: d.value.status, actor: caller.actor, actorId: caller.actorRef,
      channel: caller.actor === "human" ? caller.channel : null,                                       // 그대로
    } });
    if (d.value.completes) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date() } });
    if (d.value.reopens) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: null } });
    if (!isOpen(d.value.status)) await closeRuns(tx, projectId, input.key);
    // 파이프라인 커서 — 사람의 되돌리기·보류·재개·reopen은 자리를 다시 잡고, 나머지는 앞으로 간다. pipeline 자신의 전이는
    // advanceRun 안에서 왔으므로 재귀하지 않는다(caller.actor === "pipeline"이면 건너뛴다).
    if (caller.actor !== "pipeline") {
      if (["bounce", "hold", "resume", "reopen"].includes(d.value.kind)) await resetRun(tx, projectId, input.key, d.value.status);
      else await advanceRun(tx, projectId, input.key);
    }
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
```

이를 위해 `decideTransition`의 `TransitionPatch`에 `kind: RuleKind`를 더한다(값은 `rule.kind` — 위의 훅 분기와 §C.7의 `viaGate` 거부가 둘 다 이 값을 읽는다). `discard`는
이벤트 뒤 런의 `closedAt`을 찍는다(§C.3 — `closeRuns`가 닫는 것은 에이전트 run이고, 이것은 `pipelineRun.update` 한 줄이다). `recordValidation`은 이벤트 뒤, `submitReport`는 `acceptedAt` 갱신 **뒤**(쓰기 경로의 끝 — §C.2. 이벤트 직후에 두면 인수 보고의
같은 트랜잭션에서 `accept` 노드가 끝난 것을 못 보고 다음 `pipeline_next`의 지연 전진까지 미룬다) `advanceRun`. `sessionGate`는 §D.2로 대체된다.
`propose`의 호출처 둘: `src/server/mcp/deps.ts`의 `propose: (projectId, input, actorRef) => board.propose(projectId, input, actorRef)`는
`board.propose(projectId, input, { actor: "agent", actorRef })`로(`ToolDeps.propose`의 형은 그대로 — 매핑만 바뀐다), 웹은 §E.7의
`proposeItem`이 `{ actor: "human", actorRef: userId, channel: "web" }`로 부른다.

바뀌는 import(`board.ts`): `import { advance, cursorForStatus } from "@harness/core/pipeline.mjs";`와
`import { ensureRun, nextFor, readFacts, type Graph } from "./run";`를 더하고, `./board-rules`에서는 `decideSessionGate` 대신 `decideGate`를
가져온다. `Prisma`·`PrismaClient`는 지금처럼 `import type`이다(값 `Prisma`는 `run.ts`가 P2002 검사에 쓴다, §C.1).
같은 파일 186행 주석 "클린 사이클의 이벤트는 정확히 8건이 된다"는 인수 기록이 생기기 전 숫자다 — 지금은 9건이므로(Execution Plan 6의
열거) 이 브랜치에서 함께 고친다. 증거 제출 3종이 same-status 이벤트라는 그 앞 문장은 그대로 맞다.

**C.5 디스패치 상한(30일 창) — `agent_next`가 run을 열 때.** dev의 계획 run이 `plan` 뒤에 닫히므로(Current State)
`AgentRun` 개설 1회 = 에이전트 노드 진입 1회다. 그래서 세는 자리는 **run 개설**이다 — 서버가 "이 에이전트가
실제로 시작했다"를 관측하는 유일한 지점이고, 파이프라인 밖에서 손으로 디스패치한 run도 같은 자리를 지나
우회가 없다. `pipeline_next`는 같은 수를 읽어 미리 `wait: "cap"`으로 알린다.

Before (`src/server/agents/next.ts`, 읽은 현재 코드 — run이 없을 때):

```ts
  const run = await deps.openRun(projectId, agent, key);
  if (!run) {
    if (input.outcome) return ok({ done: true });
    // **열리는 첫 단계**로 연다. 예전에는 언제나 steps[0]이라, 보드 상태로 갈라지는 에이전트(dev)는
    // 상태를 읽고 스스로 분기하는 라우터 단계를 따로 둬야 했다 — 그 단계는 일을 하나도 하지 않으면서
    // 왕복 하나(약 63,000 토큰, G1 실측)를 썼다. 판정은 전진 때 쓰는 것과 같은 requires다.
    // 첫 단계에 requires가 없는 템플릿(pm·plan-verifier·doc-auditor·feature-scout)은 동작이 같다.
    const facts = new Facts(deps, projectId, agent, key, false);
    const unmet: string[] = [];
    for (const candidate of entrySteps(parsed)) {
      const missing = await facts.unmet(candidate.requires);
      if (missing.length === 0) {
        await deps.createRun(scope, agent, key, candidate.id);
        return serve(candidate);
      }
      unmet.push(`step \`${candidate.id}\` opens when ${missing.join(" and ")}`);
    }
    // 열린 단계가 없으면 **run을 만들지 않는다** — 커서를 남기면 다음 호출이 그 자리에 갇힌다.
    return fail(`not open: ${unmet.join("; ")}`);
  }
```

After:

```ts
  const run = await deps.openRun(projectId, agent, key);
  if (!run) {
    if (input.outcome) return ok({ done: true });
    // 디스패치 상한(지난 30일에 연 run 수) — run **개설**에서만 센다. 재개(열린 run의 outcome 없는 호출)는 세지 않는다: 컴팩션·재시작 복구가 비싸지면 안 된다.
    const used = await deps.recentRuns(projectId, dispatchCutoff(new Date()));
    const capMsg = capError(access.plan, "dispatches", used);
    if (capMsg) return fail(`${capMsg} Counted over the last ${DISPATCH_WINDOW_DAYS} days; pipeline_next shows the same cap, and it frees as older runs drop out of the window.`);
    // **열리는 첫 단계**로 연다. 예전에는 언제나 steps[0]이라, 보드 상태로 갈라지는 에이전트(dev)는
    // 상태를 읽고 스스로 분기하는 라우터 단계를 따로 둬야 했다 — 그 단계는 일을 하나도 하지 않으면서
    // 왕복 하나(약 63,000 토큰, G1 실측)를 썼다. 판정은 전진 때 쓰는 것과 같은 requires다.
    // 첫 단계에 requires가 없는 템플릿(pm·plan-verifier·doc-auditor·feature-scout)은 동작이 같다.
    const facts = new Facts(deps, projectId, agent, key, false);
    const unmet: string[] = [];
    for (const candidate of entrySteps(parsed)) {
      const missing = await facts.unmet(candidate.requires);
      if (missing.length === 0) {
        await deps.createRun(scope, agent, key, candidate.id);
        return serve(candidate);
      }
      unmet.push(`step \`${candidate.id}\` opens when ${missing.join(" and ")}`);
    }
    // 열린 단계가 없으면 **run을 만들지 않는다** — 커서를 남기면 다음 호출이 그 자리에 갇힌다.
    return fail(`not open: ${unmet.join("; ")}`);
  }
```

바뀌는 import 한 줄(`next.ts`): `import { DISPATCH_WINDOW_DAYS, REPORT_AGENTS, allowsAgent, capError, dispatchCutoff } from "@harness/core/entitlement.mjs";`
`NextDeps`에 `recentRuns(projectId: string, since: Date): Promise<number>` 하나를 더한다. `runs.ts` 구현은
소유자의 **모든** 프로젝트를 센다(플랜이 사용자에 붙으므로):

```ts
  recentRuns: async (projectId, since) => {
    const owner = await prisma.projectMember.findFirst({ where: { projectId, role: "owner" }, select: { userId: true } });
    if (!owner) return 0;
    return prisma.agentRun.count({ where: { openedAt: { gte: since }, project: { members: { some: { userId: owner.userId, role: "owner" } } } } });
  },
```

**C.6 `board-rules.ts`.** `Actor`에 `"pipeline"`, `RuleKind`에 `"auto"`, `TransitionPatch`에 `kind`. 그리고
`decideSessionGate`(목적지 상태를 받는다)를 지우고, **게이트 id**를 받는 `decideGate`로 대체한다 — 웹과 세션이 같이 쓴다.

Before (`src/server/pipeline/board-rules.ts`, 읽은 현재 코드):

```ts
export type SessionGateInput = {
  status: string;
  to: string;
  validation: string | null;
  planCommit: string | null;
  claimedPlanCommit: string | undefined;
};

export function decideSessionGate(i: SessionGateInput): Decision<null> {
  const rule = findRule("human", i.status, i.to) as Rule | null;
  if (!rule || rule.kind !== "gate") {
    return { ok: false, reason: `not a gate: ${i.status} → ${i.to} — a session opens gates only; send back, hold, reopen, and discard are web only` };
  }
  if (i.to === "implementing") {
    if (i.validation === null) {
      return { ok: false, reason: "no validation record — a session approves implementation only after plan-verifier's pass is recorded; approve in the Inbox to override" };
    }
    if (i.claimedPlanCommit === undefined) return { ok: false, reason: "planCommit required — state the commit you are approving (board_get shows it)" };
    if (i.planCommit === null || i.claimedPlanCommit !== i.planCommit) {
      return { ok: false, reason: `planCommit mismatch: the board records ${i.planCommit ?? "none"}` };
    }
  }
  return { ok: true, value: null };
}
```

After:

```ts
// 게이트 판정 — 웹과 세션이 같이 쓴다. 런의 커서가 그 게이트에 서 있어야 하고(그래프가 진실), 경계 게이트면 상태도 맞아야 한다.
// 세션 채널은 전제가 하나 더 붙는다(before-implement의 검증 기록·planCommit 일치). 웹은 카드가 커밋을 보여 주므로 그 검사가 없다.
export type GateInput = {
  gate: string;                    // before-<kind>
  cursor: string | null;           // PipelineRun.node. null이면 런이 닫혔다
  status: string;
  validation: string | null;
  planCommit: string | null;
  claimedPlanCommit: string | undefined;
  channel: "web" | "session";
};
export type GatePatch = { boundary: { from: string; to: string } | null };

export function decideGate(i: GateInput): Decision<GatePatch> {
  if (!isGateId(i.gate)) return { ok: false, reason: `not a gate: ${i.gate}` };
  if (i.cursor !== i.gate) {
    return { ok: false, reason: `not waiting at ${i.gate} — the item is at ${i.cursor ?? "the end of the pipeline"}` };
  }
  const boundary = boundaryOf(i.gate);
  if (boundary !== null) {
    const rule = findRule("human", i.status, boundary.to) as Rule | null;
    if (!rule || rule.kind !== "gate" || i.status !== boundary.from) return { ok: false, reason: `not allowed: human ${i.status} → ${boundary.to}` };
  }
  if (i.channel === "session" && i.gate === gateId("implement")) {
    if (i.validation === null) {
      return { ok: false, reason: "no validation record — a session approves implementation only after plan-verifier's pass is recorded; approve in the Inbox to override" };
    }
    if (i.claimedPlanCommit === undefined) return { ok: false, reason: "planCommit required — state the commit you are approving (board_get shows it)" };
    if (i.planCommit === null || i.claimedPlanCommit !== i.planCommit) {
      return { ok: false, reason: `planCommit mismatch: the board records ${i.planCommit ?? "none"}` };
    }
  }
  return { ok: true, value: { boundary } };
}
```

`decideSessionGate`는 지운다(호출처가 `board.sessionGate` 하나이고 그것도 §D.2에서 `board.gate`로 바뀐다).
"send back, hold, reopen, and discard are web only" 문장은 `gate_approve` 도구 설명과 런북에 남는다.
바뀌는 import 한 줄(`board-rules.ts`): `import { boundaryOf, gateId, isGateId } from "@harness/core/pipeline.mjs";` — 값만 가져온다.

**C.7 `board.gate` — 웹과 세션의 공통 쓰기.**

```ts
// 게이트 하나를 연다. 경계 게이트면 사람 전이(transition)가 원장이고, 아니면 같은 상태의 이벤트(note "gate:<id>")가 원장이다.
// 둘 다 뒤에 advanceRun — 다음 노드(대개 dispatch)로 커서가 간다. 응답의 next는 pipeline_next와 같은 모양(§D.1).
export async function gate(
  projectId: string, input: { key: string; gate: string; planCommit?: string }, caller: Extract<Caller, { actor: "human" }>,
) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const run = await ensureRun(tx, projectId, row.id, row.status, false);
    const d = decideGate({
      gate: input.gate, cursor: run.closedAt ? null : run.node, status: row.status, validation: row.validation,
      planCommit: row.planCommit, claimedPlanCommit: input.planCommit, channel: caller.channel,
    });
    if (!d.ok) return fail(d.reason);
    if (d.value.boundary !== null) {
      const t = await transitionIn(tx, projectId, { key: input.key, to: d.value.boundary.to }, caller, { viaGate: true }); // transition의 tx 판 — 같은 CAS·같은 이벤트. 게이트 행은 여기서만 지난다
      if (!t.ok) return t;
    } else {
      const u = await tx.boardItem.updateMany({ where: { id: row.id, updatedAt: caller.expectedUpdatedAt }, data: { updatedAt: new Date() } }); // CAS + 토큰 갱신을 명시한다(빈 data의 @updatedAt 자동 갱신에 기대지 않는다)
      if (u.count === 0) return fail("stale");
      await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "human", actorId: caller.actorRef, channel: caller.channel, note: `gate:${input.gate}` } });
      await advanceRun(tx, projectId, input.key);
    }
    // 응답은 ServerResult<{ item, next }> — result.ts의 한 형 그대로다(§D.2 OwnerToolDeps.gate의 형이고, gate_approve의 text(r.item)이 { item, next }를 낸다).
    // next를 ok 가지에 나란히 얹으면 fail()의 ServerResult<never>와 합쳐져 호출처가 r.next를 좁혀 읽지 못한다(tsc: "Property 'next' does not exist on type '{ ok: true; item: never; }'").
    return { ok: true as const, item: { item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }), next: await nextFor(tx, projectId, input.key) } };
  });
}
```

`transition`은 몸통을 `transitionIn(tx, projectId, input, caller, opts = { viaGate: false })`로 빼고 `prisma.$transaction`으로 감싸는 껍데기가 된다 —
`gate`와 `advanceRun`이 같은 트랜잭션 안에서 부르기 위해서다. `transitionIn`은 `decideTransition` 뒤에 한 줄을 더 둔다:
`if (d.value.kind === "gate" && !opts.viaGate) return fail(\`gates open through board.gate, not a transition: ${row.status} → ${input.to}\`);` —
사람 게이트 행(`proposed → planning`, `in_review → implementing`)은 `board.gate`를 거쳐야 런의 커서·`decideGate`의 전제를 지나므로, 웹
`humanTransition`도 옛 클라이언트도 `to`로는 못 넘는다(§E.2). agent·pipeline 행은 `kind`가 `gate`가 아니라 영향이 없다. 세션 채널의 CAS 토큰은 지금의 `sessionGate`처럼 방금 읽은
`row.updatedAt`이다(`owner-tools`의 deps가 채운다, §D.2). 비경계 게이트의 빈 `updateMany`는 CAS 검사이자
`updatedAt` 갱신이다(값을 명시해 쓴다) — 웹 카드가 든 토큰이 낡았으면 여기서 `stale`.

**C.8 동시성·멱등 — 상태를 바꾸는 자리마다.**

| 자리 | 두 번 오면 | 서로 다른 호출자가 겹치면 | 근거 |
| --- | --- | --- | --- |
| `advanceRun` | 멱등 — `advance`는 `status === b.from`일 때만 전이를 내고, 커서 CAS(`node: run.node`)가 실패하면 그냥 끝난다(다음 호출이 다시 읽는다) | 같은 항목의 두 트랜잭션 중 하나만 CAS를 통과한다. 자동 전이는 `transitionIn`의 `updatedAt` CAS가 한 번만 허용한다 | §C.2, `board.transition`의 기존 CAS |
| `gate` (웹·세션) | 두 번째는 커서가 이미 다음 자리라 `not waiting at …`으로 거부 | 웹은 카드의 `expectedUpdatedAt`, 세션은 방금 읽은 `updatedAt` — 한쪽은 `stale` | `decideGate`, §C.7 |
| `currentVersion` 첫 물질화 | 있으면 읽고 끝 | `@@unique([projectId, version])` — 진 쪽은 P2002를 받아 다시 읽는다 | §C.1 |
| `ensureRun` | 있으면 읽고 끝 | `boardItemId @unique` — 진 쪽은 P2002를 받아 다시 읽는다 | §C.1 |
| `savePipeline` (§E.6) | 같은 그래프를 두 번 저장하면 버전이 둘 생긴다 — 무해(항목 고정은 버전 id로) | `max + 1`을 둘이 읽으면 같은 번호 — 유니크가 한쪽을 막고 액션은 `"The pipeline changed. Refresh and try again."`을 돌려준다 | `@@unique([projectId, version])` |
| `propose` (pm·웹) | 두 번째는 `already open` | 미결 2건 상한은 지금처럼 `Serializable`이 지킨다(40001은 도구가 그대로 돌려주고 — `board.ts`의 기존 주석 — 웹은 `P2034`를 잡아 "The board changed. Refresh and try again.", §E.7) | 기존 `propose` |
| `agent_next` run 개설의 상한 | 재개는 세지 않는다 | 둘이 59를 읽고 둘 다 열면 61 — 정확히 60이 아니라 **동시 호출 수만큼** 넘을 수 있다. `RATE_LIMIT`의 `recentSteps`와 같은 비원자 관례이고, 요금 단위가 아니라 남용 상한이므로 받아들인다(Max는 무제한) | `next.ts`의 기존 `recentSteps` |

부분 실패: 런 생성·커서 갱신·자동 전이·이벤트는 모두 보드 쓰기와 같은 트랜잭션이라 함께 롤백된다. `pipeline_next`의 지연 전진은
자기 트랜잭션 하나로 감싼다(§D.1). 트랜잭션 밖에 남는 부수효과는 없다.

### D. MCP: `pipeline_next` 추가, `gate_approve` 변경

**D.1 `pipeline_next` — 에이전트 서버(`/api/mcp`)에 등록.** main-loop는 프로젝트 토큰으로 붙어 있으므로 여기다.
읽기 도구이지만 `doc-audit`·`scout` 노드의 완료(에이전트 run 닫힘)는 보드 쓰기를 지나지 않으므로 이 호출이
**지연 전진**을 한다(`advanceRun`을 부른다) — 자동 전이는 그래프가 이미 허락한 것만 일어나고 원장에 남는다.

```ts
// src/server/pipeline/run-rules.ts — 순수. DB·프레임워크 없음(board-rules.ts와 같은 층). run.ts가 읽은 사실로 pipeline_next의 답 하나를 정한다.
import { NODE_AGENT, boundaryOf, isGateId } from "@harness/core/pipeline.mjs";
import { canPropose } from "@harness/core/transitions.mjs";

// 응답 — 항목 하나의 다음 일. 세션은 이 값을 읽고 그 턴에 행동한다(런북 "The cycle").
export type PipelineNext =
  | { key: string; node: string; version: number; action: "dispatch"; agent: string; hint: string }  // 그 에이전트를 key와 함께 디스패치. hint = 그 노드에서 지켜야 할 한 문장
  | { key: string; node: string; version: number; action: "wait"; on: "gate"; gate: string; boundary: { from: string; to: string } | null; planCommit: string | null }
  | { key: string; node: string; version: number; action: "wait"; on: "handoff"; note: string | null }  // 커밋 핸드오프(배너와 같은 판정)
  | { key: string; node: string; version: number; action: "wait"; on: "cap"; reason: string }
  | { key: string; node: string; version: number; action: "accept" }                           // main-loop 본인이 인수 5조건을 재현한다
  | { key: string; node: string | null; version: number; action: "done" };

// run.ts(nextFor)가 읽어 넘기는 사실. 어느 질의로 읽는지는 아래 "판정 순서" 문단.
export type NextInput = {
  key: string;
  version: number;                          // PipelineRun.version.version
  node: string | null;                      // PipelineRun.node. null이면 런이 닫혔다
  status: string;
  planCommit: string | null;
  agent: string;                            // BoardItem.agent — plan·implement 노드가 디스패치하는 dev
  handoff: { note: string | null } | null;  // 열린 dev run의 마지막 원장 행이 handoff면 그 note
  capReason: string | null;                 // capError(plan, "dispatches", recentRuns) — 상한을 넘었으면 그 문장
};

// dispatch의 hint — 그 노드에서 지켜야 할 한 문장. product-copy.md §13에 같은 문장.
export const HINT: Record<string, string> = {
  propose: "Dispatch pm with no key. It proposes at most one item per run.",
  plan: "Dispatch with the item key. One item per dispatch.",
  verify: "Run your own verification round first (paths from docs/plans/verification-paths.md, reconciling-proposals-with-codebase). Dispatch plan-verifier only when your round finds nothing, then record the clean pass with validation_record — the node completes on that record.",
  implement: "Dispatch with the item key. It reports and moves the item to done itself.",
  "doc-audit": "Dispatch doc-auditor with no key; append its report to docs/agents/doc-auditor/audit-log.md yourself.",
  scout: "Dispatch feature-scout with no key — only when harness.json.scout is configured (init writes that agent only then); otherwise take the Scout node off the Pipeline tab. Append its report to docs/agents/feature-scout/scouting-log.md yourself.",
};

// 판정 순서: 런 닫힘 → 게이트 → accept → handoff → cap → dispatch. 에이전트 없는 노드는 있을 수 없지만(accept는 위에서 끝난다) 방어로 done.
export function decideNext(i: NextInput): PipelineNext {
  const { key, version } = i;
  if (i.node === null) return { key, node: null, version, action: "done" };
  const node = i.node;
  if (isGateId(node)) return { key, node, version, action: "wait", on: "gate", gate: node, boundary: boundaryOf(node), planCommit: i.planCommit };
  if (node === "accept") return { key, node, version, action: "accept" };
  if (i.handoff !== null) return { key, node, version, action: "wait", on: "handoff", note: i.handoff.note };
  const agent = node === "plan" || node === "implement" ? i.agent : (NODE_AGENT as Record<string, string | undefined>)[node];
  if (agent === undefined) return { key, node, version, action: "done" };
  if (i.capReason !== null) return { key, node, version, action: "wait", on: "cap", reason: i.capReason };
  return { key, node, version, action: "dispatch", agent, hint: HINT[node] ?? "" };
}

// key 없는 pipeline_next의 머리 — pm을 디스패치할 차례인가. none이면 사유가 실린다(null은 사유를 못 싣는다).
export type HeadNext = { action: "dispatch"; agent: "pm"; hint: string } | { action: "none"; reason: string };
export type PipelineOverview = { head: HeadNext; items: PipelineNext[] };
export type HeadInput = {
  hasPropose: boolean;   // 현재 버전의 nodes에 propose가 있는가
  openCount: number;     // 미결 항목 수(latestBoard(projectId, true).length)
  capReason: string | null; // capError(plan, "dispatches", recentRuns) — decideNext와 같은 수
};

// 판정 순서: propose 노드 없음 → 미결 2건(canPropose — pm 규칙과 같은 문장) → 상한 → dispatch pm.
export function decideHead(i: HeadInput): HeadNext {
  if (!i.hasPropose) return { action: "none", reason: "no propose node on this pipeline — put an item on the board from the Backlog tab" };
  if (!canPropose(i.openCount)) return { action: "none", reason: `open items: ${i.openCount} (max 2)` };
  if (i.capReason !== null) return { action: "none", reason: i.capReason };
  return { action: "dispatch", agent: "pm", hint: HINT.propose };
}
```

| 도구 | 입력 | 효과 |
| --- | --- | --- |
| `pipeline_next` | `{ key? }` | `key` 있음: 그 항목의 `PipelineNext`. 없음: `PipelineOverview = { head, items }` — `head`는 `decideHead`의 답(`propose` 노드가 있고 미결 항목이 2건 미만이며 상한 안이면 `{ action: "dispatch", agent: "pm", hint }`, 아니면 `{ action: "none", reason }`); `items`는 열린 항목 각각의 `PipelineNext` |

판정 순서(항목 하나): 런 보장 → `advanceRun`(`deps.ts`가 `board.advancePipeline(projectId, key)` — 트랜잭션 하나로 감싼 껍데기 —
를 부른다) → `run.nextFor(prisma, projectId, key)`(플랜은 안에서 `planForProject`로 읽는다 — `board.gate`가 `tx`로 부르는 것과 같은 인자 셋).
`nextFor`는 사실을 읽어 `NextInput`으로 만들고 답은 `run-rules.ts`의 `decideNext`가 정한다(순서는 위 코드와 같다): 런이 닫혔으면(`node: null`) `done` →
커서가 게이트면 `wait/gate`(경계 게이트면 `boundary`·`planCommit` 동봉) → 노드가 `accept`면 `accept` → 열린 dev run의 마지막 원장 행이 `handoff`면
`wait/handoff`(판정은 `turn-data.server.ts`의 `agentRun.findMany` 질의와 같은 것을 `run.ts`가 **따로 갖는다** — 서버는 FSD를 import하지 않는다) →
노드의 에이전트가 있으면 상한 검사(`recentRuns`와 같은 수) 후 `dispatch`(넘었으면 `wait/cap`).

key 없는 호출은 `deps.ts`가 조립한다(`run.ts`는 `board.ts`를 import하지 않으므로 미결 목록은 여기서 읽는다): `board.latestBoard(projectId, true)`로
열린 행을 읽고, 행마다 `board.advancePipeline` → `run.nextFor`로 `items`를 만들고, `head`는 `run.headFor(prisma, projectId, open.length)` —
`currentVersion`의 `nodes`(`hasPropose`)와 `decideNext`와 같은 상한 수(`capReason`)를 읽어 `decideHead`에 넘긴다. `ToolDeps.pipelineNext(projectId, key?)`의
반환은 `ServerResult<PipelineNext | PipelineOverview>`이고 `tools.ts`는 형을 `run-rules.ts`에서 가져온다(순수 모듈 — `tools.test.mjs`가 그대로 돈다).

`dispatch`의 `hint`는 그 노드에서 지켜야 할 한 문장이다 — 행동하는 순간에 도착해야 하므로 런북이 아니라 응답에 싣는다
(`agent_next`가 단계 본문을 그 순간에 주는 것과 같은 원리). 문장은 `run-rules.ts`의 `HINT` 하나이고(위 코드) `product-copy.md` §13에 같은
문장을 적는다. 런북에는 이 문장들이 없다(§F.1).

| node | hint |
| --- | --- |
| `propose` | Dispatch pm with no key. It proposes at most one item per run. |
| `plan` | Dispatch with the item key. One item per dispatch. |
| `verify` | Run your own verification round first (paths from docs/plans/verification-paths.md, reconciling-proposals-with-codebase). Dispatch plan-verifier only when your round finds nothing, then record the clean pass with validation_record — the node completes on that record. |
| `implement` | Dispatch with the item key. It reports and moves the item to done itself. |
| `doc-audit` | Dispatch doc-auditor with no key; append its report to docs/agents/doc-auditor/audit-log.md yourself. |
| `scout` | Dispatch feature-scout with no key — only when harness.json.scout is configured (init writes that agent only then); otherwise take the Scout node off the Pipeline tab. Append its report to docs/agents/feature-scout/scouting-log.md yourself. |

`AGENT_TOOL_NAMES`에 `"pipeline_next"`를 더한다. `tools.test.mjs`의 `WEB_ONLY`는 그대로다 — 이 도구는
게이트를 열지 않는다. 잠긴 프로젝트에서는 `guardLocked`로 거부한다(상태를 바꿀 수 있으므로).

**D.2 `gate_approve` — 입력이 `to`에서 `gate`로.**

Before (`src/server/mcp/owner-tools.ts`, 읽은 현재 코드):

```ts
// 게이트가 열린 뒤 세션이 이어서 할 일 — 런북의 단계 번호. planning이면 3(dev가 계획서), implementing이면 6(dev가 구현).
// 응답의 next는 이 표에서만 나온다. 문장은 런북("Approving from this session")이 갖고, 여기는 값만 준다.
export const GATE_STEP = { planning: 3, implementing: 6 } as const;
export type GateTarget = keyof typeof GATE_STEP;
export type GateNext = { action: "dispatch"; agent: string; key: string; step: (typeof GATE_STEP)[GateTarget] };

export type OwnerToolDeps = {
  // 전이된 행. 응답의 next.agent는 이 행의 agent(BoardItem.agent — 그 항목에 배정된 dev)다.
  gate(projectId: string, userId: string, input: { key: string; to: GateTarget; planCommit?: string }): Promise<ServerResult<{ agent: string; status: string }>>;
  access(projectId: string): Promise<ProjectAccess>;
  // 지금 이 사람이 이 프로젝트의 멤버인가. 토큰 행의 userId는 발급 시점의 사실이라 호출마다 다시 본다 — 웹의 requireMember와 같은 판정.
  member(projectId: string, userId: string): Promise<boolean>;
};
// …
  server.registerTool("gate_approve", {
    description: "Owner only: open a gate — proposed → planning (Request plan) or in_review → implementing (Approve implementation). Approving implementation needs a validation record and the planCommit from board_get. Returns the item and next: the dev to dispatch and the runbook step (3 or 6) — dispatch it in the same turn. Send back, hold, reopen, and discard stay web only.",
    inputSchema: z.object({ key: z.string(), to: z.enum(["planning", "implementing"]), planCommit: z.string().optional() }),
  }, async (args, ctx: Ctx) => {
    const { projectId, userId } = scope(ctx);
    // 인가는 목적지에서, 호출마다. 토큰이 살아 있어도 멤버가 아니면 거부 — 웹 게이트가 requireMember를 매번 부르는 것과 같다.
    if (!(await deps.member(projectId, userId))) return fail("not a member of this project — the owner token no longer opens gates here; revoke it on the Tokens tab");
    // 잠금·플랜은 인증이 아니라 도구 층에서 — tools.ts의 guardLocked와 같은 이유(401은 사유를 못 싣는다).
    const access = await deps.access(projectId);
    if (access.locked) return fail(access.reason);
    if (!allowsSessionApprovals(access.plan)) return fail(`session approvals are not on the ${access.plan} plan — approve in the Inbox, or upgrade the plan`);
    const r = await deps.gate(projectId, userId, args);
    if (!r.ok) return fail(r.reason);
    const next: GateNext = { action: "dispatch", agent: r.item.agent, key: args.key, step: GATE_STEP[args.to] };
    return text({ item: r.item, next });
  });
```

After (12–16행의 `GATE_STEP`·`GateTarget`·`GateNext`와 그 주석 두 줄은 지운다):

```ts
export type OwnerToolDeps = {
  // 게이트를 연 뒤의 행과 다음 일(pipeline_next와 같은 모양) — 런북 단계 번호는 없다. 런북에 번호가 없다.
  gate(projectId: string, userId: string, input: { key: string; gate: string; planCommit?: string }): Promise<ServerResult<{ item: { agent: string; status: string }; next: PipelineNext }>>;
  access(projectId: string): Promise<ProjectAccess>;
  // 지금 이 사람이 이 프로젝트의 멤버인가. 토큰 행의 userId는 발급 시점의 사실이라 호출마다 다시 본다 — 웹의 requireMember와 같은 판정.
  member(projectId: string, userId: string): Promise<boolean>;
};
// …
  server.registerTool("gate_approve", {
    description: "Owner only: open the gate the item is waiting at — pass the gate id from pipeline_next (before-plan, before-implement, before-verify, before-accept, before-doc-audit, before-scout). before-implement needs a validation record and the planCommit from board_get. Returns the item and next — act on next in the same turn. Send back, hold, reopen, and discard stay web only.",
    inputSchema: z.object({ key: z.string(), gate: z.string(), planCommit: z.string().optional() }),
  }, async (args, ctx: Ctx) => {
    const { projectId, userId } = scope(ctx);
    // 인가는 목적지에서, 호출마다. 토큰이 살아 있어도 멤버가 아니면 거부 — 웹 게이트가 requireMember를 매번 부르는 것과 같다.
    if (!(await deps.member(projectId, userId))) return fail("not a member of this project — the owner token no longer opens gates here; revoke it on the Tokens tab");
    // 잠금·플랜은 인증이 아니라 도구 층에서 — tools.ts의 guardLocked와 같은 이유(401은 사유를 못 싣는다).
    const access = await deps.access(projectId);
    if (access.locked) return fail(access.reason);
    if (!allowsSessionApprovals(access.plan)) return fail(`session approvals are not on the ${access.plan} plan — approve in the Inbox, or upgrade the plan`);
    const r = await deps.gate(projectId, userId, args);
    if (!r.ok) return fail(r.reason);
    return text(r.item);
  });
```

파일 머리 3행 주석 "여기 도구는 게이트 둘뿐이다. 되돌리기·보류·재개·Reopen·폐기·백로그 편집·토큰 발급은 여전히 웹 전용이다."는
"여기 도구는 `gate_approve` 하나다 — 그래프의 어느 게이트든 연다. 되돌리기·보류·재개·Reopen·폐기·백로그 편집·토큰 발급은 여전히 웹 전용이다."로.
`owner-deps.ts`의 `gate`는 `board.gate(projectId, args, { actor: "human", actorRef: userId, channel: "session", expectedUpdatedAt: row.updatedAt })`를
부른다(행은 그 직전에 읽는다 — 지금 `sessionGate`가 하던 일). 반환 형이 `OwnerToolDeps.gate`와 같으므로(`ServerResult<{ item, next }>`, §C.7)
그대로 돌려준다. `GATE_STEP`·`GateTarget`·`GateNext`는 지운다.

바뀌는 import 한 줄(`owner-tools.ts`): `import type { PipelineNext } from "@/server/pipeline/run-rules";` — 순수 모듈이라
`owner-tools.test.mjs`가 그대로 돈다(`run.ts`였다면 `server-only`가 형 import에서는 지워져도 어댑터에 매이는 셈이다).

### E. 웹

**E.1 게이트 판정의 출처가 상태에서 런으로.** `gate-source.ts`의 `isGateSource(status)`·`gateTargetFor(status)`는
"이 상태에서 사람 게이트 규칙이 있는가"를 묻는다. 그래프가 그 자리의 게이트를 뺐으면 그 상태는 게이트가 아니다.
그래서 Inbox·배너·브리핑은 **런의 커서**를 본다.

Before (`src/fsd/features/review-gate/model/gate-source.ts`, 읽은 현재 코드):

```ts
export function isGateSource(status: string): boolean {
  return STATUSES.some((to: string) => ruleKind("human", status, to) === "gate");
}

// 이 status에서 도장이 여는 다음 status(승인대기 → 계획지시, 검토대기 → 구현승인).
export function gateTargetFor(status: string): string | null {
  return STATUSES.find((to: string) => ruleKind("human", status, to) === "gate") ?? null;
}
// …
// 결재함에 오르는 status = 게이트가 열려 있거나(승인 대기) 재개할 수 있는 것.
// 화이트리스트를 두 벌로 만들지 않으려고 여기서도 상태 기계에서 파생한다.
export function needsHumanDecision(status: string): boolean {
  return isGateSource(status) || resumeTargetsFor(status).length > 0;
}

// Inbox 탭 뱃지의 유일한 출처 — 목록에 실제로 오르는 카드 수와 같은 술어로 센다.
// 배너는 여기서 갈라진다: on_hold는 배너를 소유하지 않는다(product-copy.md §5).
// 뱃지는 목록을 따른다(§7: 순서가 gate2 · gate1 · on_hold).
export function pendingInboxCount(statuses: readonly string[]): number {
  return statuses.filter(needsHumanDecision).length;
}
```

After:

```ts
// 카드의 판정 재료 — 상태와, 런이 서 있는 게이트(없으면 null). 게이트 여부는 상태 기계가 아니라 그래프(런)가 말한다.
export type GateRow = { status: string; gate: string | null };

// 이 항목이 게이트에서 기다리는가. 옛 isGateSource(status)를 대체한다 — 상태만으로는 "게이트를 뺐다"를 알 수 없다.
export function isAtGate(row: GateRow): boolean {
  return row.gate !== null;
}
// …
// 결재함에 오르는 항목 = 런이 게이트에 서 있거나(승인 대기) 재개할 수 있는 것.
// 재개 여부는 여전히 상태 기계에서 파생한다 — 화이트리스트를 두 벌로 만들지 않는다.
export function needsHumanDecision(row: GateRow): boolean {
  return isAtGate(row) || resumeTargetsFor(row.status).length > 0;
}

// Inbox 탭 뱃지의 유일한 출처 — 목록에 실제로 오르는 카드 수와 같은 술어로 센다.
// 배너는 여기서 갈라진다: on_hold는 배너를 소유하지 않는다(product-copy.md §5). 뱃지는 목록을 따른다(§7).
export function pendingInboxCount(rows: readonly GateRow[]): number {
  return rows.filter(needsHumanDecision).length;
}
```

`gateTargetFor(status)`는 지우고 `boundaryOf(gate)?.to`(core)가 대신한다. `RuleKind`에 `"auto"`를 더한다
(`gate-source.test.ts`의 `DECLARED`도). `resumeTargetsFor`·`reopenTargetsFor`·`rejectActionsFor`는 그대로다.

**E.2 Inbox.** `latestBoardWithEvents`의 include에 `run: { select: { node: true, closedAt: true } }`를 더하고,
`toInboxItems`가 `gate: row.run && row.run.closedAt === null && isGateId(row.run.node) ? row.run.node : null`을 채운다.
`InboxItem`에 `gate: string | null`. 카드는 `item.gate !== null`일 때 게이트 버튼을 그린다. 라벨은
`gate-text.ts`의 `GATE_ACTION`을 **게이트 id 키**로 바꾼다:

| gate | label | pending | lock | toast | hint |
| --- | --- | --- | --- | --- | --- |
| `before-plan` | Request plan | Requesting… | Plan requested | Plan requested | dev writes a plan. Nothing changes in the code yet. |
| `before-verify` | Continue to verification | Continuing… | Continued | Continued to verification | The main loop verifies the plan; plan-verifier runs an independent pass. |
| `before-implement` | Approve implementation | Approving… | Approved | Implementation approved | Approving lets dev change code. Then you run dev in Claude Code. |
| `before-accept` | Continue to acceptance | Continuing… | Continued | Continued to acceptance | The main loop reproduces the five acceptance checks. |
| `before-doc-audit` | Continue to doc audit | Continuing… | Continued | Continued to doc audit | doc-auditor checks whether the docs still match the code. |
| `before-scout` | Continue to scouting | Continuing… | Continued | Continued to scouting | feature-scout researches outside and proposes features. |

`before-plan`·`before-implement`의 다섯 낱말은 지금 `GATE_ACTION.planning`·`.implementing`의 것 그대로다(읽은 현재 원문 11–25행 — 형이
`{ label; pending; lock; toast; hint }` 다섯 필드다). 키만 바뀌므로 `gateActionLabel`·`gatePendingLabel`·`gateLockLabel`·`gateToast`·`gateNextActionHint`
다섯 함수의 첫 인자가 목적지 status에서 **게이트 id**로 바뀌고, `GateTransitionButton`의 prop `to`는 `gate`가 된다(`inbox-card.tsx`가
`to={gateTo}` 대신 `gate={item.gate}`를 넘긴다). 토스트는 지금처럼 `sonner`의 `toast`다.

액션: `review-gate.server.ts`에 `approveGate(slug, { key, gate, expectedUpdatedAt })` → `board.gate(…, { actor: "human", actorRef: userId, channel: "web", expectedUpdatedAt })`.
`humanTransition`은 되돌리기·보류·재개·reopen에 남는다 — 게이트 전이를 `to`로 부르는 경로는 없어진다
(`decideTransition`은 여전히 human gate 행을 허용하지만 웹은 부르지 않는다). 서버 층에서도 잠근다 — 다만 `humanTransition`에서는 못 한다:
그 액션은 행을 읽지 않아 from-status가 없고(읽은 현재 원문 `review-gate.server.ts` 19–31행 — `board.transition`이 행을 읽는다), `to: "planning"`은
되돌리기·재개의 목적지이기도 하다. 그래서 `transitionIn`이 `d.value.kind === "gate"`면 거부하고, `board.gate`만 `{ viaGate: true }`로 지나간다(§C.7). 배선: `inbox-item.ts`에 `GateAction`
형(`(input: { key: string; gate: string; expectedUpdatedAt: string }) => Promise<ActionResult<void>>`)을 더하고 `index.ts`·`index.server.ts`로
공개, `src/fsd/pages/project-inbox/ui/project-inbox-page.tsx`의 Props와 `src/app/(app)/p/[slug]/inbox/page.tsx`가 `approve={approveGate.bind(null, slug)}`를
카드까지 내린다. `review-gate/index.ts`의 `export { isGateSource, pendingInboxCount }`는 `export { isAtGate, pendingInboxCount }`로.

`gate-text.ts`의 `reopenHint("planning")`(읽은 현재 원문 88행) "dev rewrites the plan; the validation is cleared. Gate 2 runs again."은
"dev rewrites the plan; the validation is cleared. The item walks the pipeline again from plan."으로 — 게이트가 다시 오는지는 그래프가
정한다(§C.3 `resetRun`). 카피는 `product-copy.md` §3(Reopen 안내, 읽은 현재 원문 111–112행)에 같은 문장으로.

카드 정렬 `INBOX_SORT`는 상태 기준이라 그대로 두되, 비경계 게이트 카드(상태 `in_review`·`done`·`implementing`)가
생기므로 `StatusLine`이 `done`·`implementing`도 그린다(상태 라벨 + "waiting at <gate label>"). 카드의 "검증 안 된 계획" 경고는 상태가 아니라
**게이트**를 따른다: 읽은 현재 원문 43행 `const isUnverified = isPlanUnverified(item.status, item.validation)`가 정하는 `UNVERIFIED_HINT`·버튼의 outline
variant·`PlanRow`의 risk 칩("Approving now means implementing an unverified plan")은 `item.gate === "before-implement"`일 때만이다 — `before-verify`
게이트의 `in_review` 카드는 검증 **전**이 정상이므로 그 경고를 내지 않고 `PlanRow`는 "No validation yet"을 중립 톤으로 그린다. "What this decision
does" 목록(읽은 현재 원문 119–131행)에는 비경계 게이트 문장 하나를 더한다("**Continue** moves the item to the next node; nothing changes on the
board" — product-copy §7).

**E.3 배너.** `TurnItem`에 `gate: string | null`·`node: string | null`. `deriveTurn`의 pending 판정
`isGateSource(i.status)` → `i.gate !== null`. `nextStepLine`은 런북 단계 번호 대신 노드로 말한다.

Before (`src/fsd/widgets/turn-banner/model/turn.ts`, 읽은 현재 코드):

```ts
// 런북(CLAUDE.runbook.md)의 단계 번호로 말한다 — 세션은 그 문서를 이미 읽고 있다.
export function nextStepLine(item: TurnItem): string | null {
  // 핸드오프가 상태보다 먼저다 — planning/implementing이어도 지금 움직일 사람은 소유자다.
  // note는 dev가 적은 경로(에이전트 텍스트)라 이 줄(mono 박스)에만 들어가고 산문에는 섞이지 않는다.
  if (item.handoff !== null) {
    return `Commit ${item.handoff.note ?? "the prepared file"}, then continue the runbook for ${item.key}.`;
  }
  switch (item.status) {
    case "planning":
      return `Continue the runbook for ${item.key}: step 3 — ${item.agent} writes the plan.`;
    case "in_review":
      return isPlanUnverified(item.status, item.validation) ? `Continue the runbook for ${item.key}: step 4 — verify the plan.` : null;
    case "implementing":
      return `Continue the runbook for ${item.key}: step 6 — ${item.agent} implements.`;
    case "done":
      return isAwaitingAcceptance(item.status, item.accepted) ? `Continue the runbook for ${item.key}: step 7 — accept.` : null;
    default:
      return null;
  }
}
```

After:

```ts
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
```

`mineDetail`의 부류(승인 준비·검증 필요·계획 요청·인수·커밋)는 게이트 id로 나눈다: `before-implement`에서
검증 유무, `before-plan`은 "needs a plan request", 그 밖의 게이트는 `"${key} is waiting at <gate label>"`.
`theirs`의 `working` 필터(읽은 현재 원문 168행 `items.filter((i) => i.status === "planning" || i.status === "implementing")`)도
노드로 판정한다 — `i.gate === null && ["plan", "verify", "implement"].includes(i.node)`. 문구는 `plan` → `${agent} is writing the plan for ${key}`,
`implement` → `${agent} is implementing ${key}`(둘 다 지금 그대로), `verify` → `the plan for ${key} is being verified`(새 문장, §G §5).
그래서 검증 안 된 `in_review`는 **`verify` 노드가 있는 그래프에서는 theirs**다(세션의 자체 라운드와 plan-verifier 디스패치가 남아 있다 —
지금은 mine "needs verification before approval"이었다) — 이 필터를 안 바꾸면 그 항목은 mine도 theirs도 아니어서 배너에서 사라진다.
`verify` 노드가 없는 그래프(Free 기본)에서는 커서가 곧 `before-implement`라 지금처럼 mine이고 `mineDetail`의 검증 필요 부류가 그대로 말한다.
꼬리 노드(`doc-audit`·`scout`)에 선 인수 완료 항목은 배너에 오르지 않는다 — 지금의 "accepted → none"과 같다.
`turn-data.server.ts`는 `latestBoard`를 **바꾸지 않고**(그 함수는 `board_list`의 JSON이기도 하다 — include를 더하면 에이전트
계약이 넓어진다) `agentRun.findMany`처럼 `prisma.pipelineRun.findMany({ where: { closedAt: null, boardItem: { projectId } }, select: { boardItemId: true, node: true } })`를
함께 읽어 key → `node`/`gate` 맵을 만든다. `SetupStep` 4단계 "Run pm in Claude Code"의 detail은 그래프에 `propose`가 없으면
"Put an item on the board from the Backlog tab"으로 바뀐다 — `loadTurn`이 `currentVersion`의 `nodes`를 함께 읽고
`SetupState`에 `hasPropose: boolean`이 늘어난다(`turn.test.ts`의 `ready` 픽스처에 한 필드).

**E.4 보드 브리핑.** `briefing.ts`의 `BoardRow`에 `gate: string | null`, `isGateSource(row.status)` →
`row.gate !== null`. `team`은 현재 그래프의 노드가 디스패치하는 에이전트만 **그래프 순서로** 나열한다 — 노드마다 `plan`·`implement`는
roster(항목의 dev), 그 밖은 `NODE_AGENT[kind]`(없으면 건너뜀 — `accept`는 main-loop 본인), roster는 한 번만. 골격 전체(`NODE_KINDS`)를 넘기면
지금의 고정 목록 `["pm", ...roster, "plan-verifier", "doc-auditor", "feature-scout"]`와 같은 순서가 나오고, 기본 Pro 그래프면 `feature-scout`가,
Free 기본 그래프면 `plan-verifier`·`doc-auditor`·`feature-scout`가 빠진다. `buildBriefing`이 `nodes: readonly string[]`를 네 번째 인자로 받는다. 보드 라우트 `src/app/(app)/p/[slug]/page.tsx`가 E.3과 같은 `pipelineRun.findMany`와
`currentVersion`을 읽어 `gate`와 `nodes`를 넘긴다(지금은 `latestBoard`와 `workspace.findMany`만 읽는다).

**E.5 항목 상세 History.** `src/app/(app)/p/[slug]/items/[key]/page.tsx`가 넘기는 이벤트 모양(`actor`·`channel`·
`from`·`to`·`note`)은 그대로다. `src/fsd/pages/board-item/ui/board-item-page.tsx`의 History 행은 지금 채널만 덧붙인다.

Before (`src/fsd/pages/board-item/ui/board-item-page.tsx`, 읽은 현재 코드 — History `<li>`의 안쪽):

```tsx
              <span className="font-mono text-xs text-quiet">{stamp(e.at)}</span>
              <span className="font-mono text-xs text-quiet">{e.channel === "session" ? `${e.actor} · session` : e.actor}</span>
              <span className="font-mono text-xs">
                {e.from ?? "—"} → {e.to ?? "discarded"}
              </span>
              {e.note ? <span className="text-xs text-quiet">({e.note})</span> : null}
```

After:

```tsx
              <span className="font-mono text-xs text-quiet">{stamp(e.at)}</span>
              <span className="font-mono text-xs text-quiet">{actorLabel(e)}</span>
              <span className="font-mono text-xs">
                {e.from ?? "—"} → {e.to ?? "discarded"}
              </span>
              {e.note ? <span className="text-xs text-quiet">({noteLabel(e.note)})</span> : null}
```

같은 파일에 두 함수를 더한다(`gateLabel`은 `@/fsd/entities/pipeline`에서 — pages는 entities를 import할 수 있다):

```tsx
// 행위자 표기 — human은 채널(session)만 덧붙이고, pipeline은 언제나 "auto"(게이트 없는 경계를 서버가 넘었다). agent는 그대로.
function actorLabel(e: TimelineEvent): string {
  if (e.actor === "pipeline") return "pipeline · auto";
  return e.channel === "session" ? `${e.actor} · session` : e.actor;
}
// note는 증거 종류(plan · report · validation · discard) 또는 비경계 게이트(gate:<id>). 게이트는 사람 말로 푼다.
function noteLabel(note: string): string {
  return note.startsWith("gate:") ? `gate · ${gateLabel(note.slice("gate:".length))}` : note;
}
```

`TimelineEvent.channel`의 주석("human 행만")은 그대로 맞다 — `pipeline` 행도 channel이 null이다. 보존해야 할 불변:
사람·에이전트 행의 표기는 지금과 한 글자도 다르지 않다(`actorLabel`의 두 번째 줄이 옛 식 그대로).

**E.6 `Pipeline` 탭.** 경로·탭·페이지·기능·엔티티.

Before (`src/fsd/shared/routes/project.ts`, 읽은 현재 코드):

```ts
export const PROJECT_TABS = [
  { id: "board", segment: "", label: "Board" },
  { id: "inbox", segment: "/inbox", label: "Inbox" },
  { id: "backlog", segment: "/backlog", label: "Backlog" },
  { id: "tokens", segment: "/tokens", label: "Tokens" },
] as const;
```

After:

```ts
export const PROJECT_TABS = [
  { id: "board", segment: "", label: "Board" },
  { id: "inbox", segment: "/inbox", label: "Inbox" },
  { id: "backlog", segment: "/backlog", label: "Backlog" },
  { id: "pipeline", segment: "/pipeline", label: "Pipeline" },
  { id: "tokens", segment: "/tokens", label: "Tokens" },
] as const;
```

| 파일 | 역할 |
| --- | --- |
| `src/app/(app)/p/[slug]/pipeline/page.tsx` | `requireMember` → 현재 버전(`currentVersion`), 플랜, 열린 항목 수 → `ProjectPipelinePage`에 `graph`·`version`·`editable={allowsPipelineEdit(plan)}`·`save={savePipeline.bind(null, slug)}` |
| `src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx` | 제목 "Pipeline", 버전 줄("Version 3 · saved 2 days ago · applies to items proposed from now on"), `PipelineRail`, 읽기 전용이면 Free 안내 한 줄, "Read as text" `<details>`(그래프를 단계 글로 렌더 — `sequence`를 순서 목록으로) |
| `src/fsd/entities/pipeline/model/labels.ts` | `nodeLabel(kind)`·`gateLabel(id)`·`nodeAgentLabel(kind, roster)` — Inbox·배너·레일이 같은 낱말 |
| `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` (`"use client"`) | 레일. 노드 카드 한 줄, 간선마다 `+`(게이트 삽입 / 그래프에 없는 선택 노드 넣기 — 뺀 노드와 opt-in `scout`), 카드 메뉴 "Remove"(선택 노드·게이트만), 꼬리 두 노드에 "Swap". 국소 상태는 `{ nodes, gates }` 하나. 저장 버튼 → 서버 액션 → `sonner`의 `toast`(기존 게이트 버튼과 같이). 게이트 0개면 저장 전 경고 문장 |
| `src/fsd/features/edit-pipeline/model/rail-state.ts` | 순수: `insertGate`·`removeGate`·`removeNode`·`addNode`(뺀 노드 되돌리기와 opt-in 노드 넣기가 같은 함수)·`swapTail` — 각각 `validateGraph`로 결과를 검증해 불가면 이유를 돌려준다(버튼 비활성의 근거) |
| `src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts` | `savePipeline(slug, graph)`: `requireProjectWrite` → `allowsPipelineEdit(plan)` 아니면 `failure("Pipeline editing opens on Pro. The default pipeline stays as is.")` → `validateGraph(graph, plan)` 실패면 그 `reason`을 `failure`로 → `pipelineVersion.create({ version: max + 1, createdBy: userId })`, P2002면 `failure("The pipeline changed. Refresh and try again.")`(§C.8) → `revalidatePath` |

레일의 카드 문구(§G product-copy 새 절): 노드 이름은 `nodeLabel`(Propose · Plan · Verify · Implement · Accept ·
Doc audit · Scout), 게이트 카드는 "Gate · you" + 게이트 라벨, 자동 경계는 카드 사이 작은 글씨 "auto → planning".

**E.7 백로그 "Put on the board".** 새 기능 슬라이스 `src/fsd/features/propose-item/`.

| 파일 | 역할 |
| --- | --- |
| `api/propose-item.server.ts` | `proposeItem(slug, { key, agent, reason })`: `requireProjectWrite` → `board.propose(projectId, { key, agent, reason }, { actor: "human", actorRef: userId, channel: "web" })` → `revalidatePath`(backlog·board·inbox). 사유 문구는 서버의 것 그대로(`open items: 2 (max 2)` 등). `propose`의 `Serializable` 충돌(Postgres 40001 — adapter-pg가 `TransactionWriteConflict`로 올려 Prisma `P2034`가 된다)은 `create-project.server.ts`·`edit-backlog.server.ts`의 P2002 검사와 같은 모양으로 잡아 `failure("The board changed. Refresh and try again.")`(§C.8) |
| `ui/propose-button.tsx` (`"use client"`) | 행 끝 버튼 "Put on the board" → 펼침: 담당(roster `<select>`), 근거(기본값 "owner", ≤150) → 제출. 성공 토스트(`sonner`) `Put on the board · FEAT-01` |
| `index.ts` / `index.server.ts` | 공개 API |

조합은 **pages 층**이 한다 — `features/edit-backlog`의 `backlog-table.tsx`가 `features/propose-item`을 import하면
`scripts/verify-fsd-boundaries.mjs`의 `fsd/no-cross-slice-import`(같은 layer의 다른 slice)에 걸린다. 그래서:

- `backlog-table.tsx`(edit-backlog)는 propose를 모른다. `renderAction?: (row: BacklogRow) => ReactNode` 슬롯 하나를 더 받아
  `Not on board`인 미제거 행의 마지막 열에 `RemoveBacklogButton` 옆으로 그린다(없으면 지금 그대로).
- `src/fsd/pages/project-backlog/ui/project-backlog-page.tsx`가 `@/fsd/features/propose-item`(public API)에서 `ProposeButton`을 가져와
  `renderAction={(row) => <ProposeButton itemKey={row.key} roster={roster} propose={propose} />}`로 넘긴다 — pages는 features를 import할 수 있다.
  Props에 `propose: ProposeAction`·`roster: string[]`가 늘어난다.
- `backlog/page.tsx`가 roster(`prisma.workspace.findMany({ where: { projectId }, orderBy: { wsId: "asc" }, select: { agent: true } })`)와
  `proposeItem.bind(null, slug)`를 넘긴다.

`edit-backlog`의 액션·모델은 손대지 않는다 — "올리기"는 백로그 편집이 아니라 보드 행 생성이라 슬라이스가 다르다(fsd.md의 features 정의
"사용자가 가치 있다고 인식하는 동작").

**E.8 `/billing` 표.** `planMatrix()`에 두 줄.

Before (`src/fsd/shared/lib/entitlement-copy.ts`, 읽은 현재 코드 — 표의 끝):

```ts
    { label: "Report agents", values: cell((p) => limitsFor(p).agents.join(", ")) },
    { label: "Session approvals", values: cell((p) => (limitsFor(p).sessionApprovals ? "Yes" : "Web only")) },
  ];
```

After:

```ts
    { label: "Report agents", values: cell((p) => limitsFor(p).agents.join(", ")) },
    { label: "Session approvals", values: cell((p) => (limitsFor(p).sessionApprovals ? "Yes" : "Web only")) },
    { label: "Pipeline editing", values: cell((p) => (limitsFor(p).pipelineEdit ? "Yes" : "Default only")) },
    { label: `Agent dispatches per ${DISPATCH_WINDOW_DAYS} days`, values: cell((p) => count(limitsFor(p).dispatches)) },
  ];
```

바뀌는 import 한 줄: `import { DISPATCH_WINDOW_DAYS, LIMITS, PLANS, UNLIMITED, limitsFor } from "@harness/core/entitlement.mjs";`

### F. 플러그인과 템플릿

**F.1 런북.** "The cycle — run by the main loop"의 8단계를 지우고 아래로 바꾼다. "Where things stand"와 "Approving from this
session"은 단계 번호·게이트 번호 대신 `pipeline_next`의 노드·게이트 id로 말한다(아래 Before/After). Free 판 파일은 지운다.

```markdown
## The cycle — run by the main loop

The order of execution lives in Stagekeeper, on the project's Pipeline tab. This session does not
carry the order — it asks for the next node and does that one thing.

1. `mcp__harness__pipeline_next({})` with no key names the head (dispatch `pm`, or nothing) and the
   next node of every open item. `pipeline_next({ key })` answers for one item.
2. Act on the answer, in the same turn:
   - `dispatch` — dispatch that agent as the answer's `hint` says (it names the key rule for that
     node: with or without the item key, what to do first, what to append afterwards). One item
     per dispatch.
   - `wait` on a `gate` — stop and tell the owner which gate, in the gate's words (see
     *Approving from this session*). Never open it yourself.
   - `wait` on a `handoff` — the owner commits the prepared file, then says so; call
     `agent_next` for that dev without outcome and it resumes.
   - `wait` on a `cap` — the plan's dispatches for the last 30 days are used up. Say so and stop.
   - `accept` — reproduce the **five acceptance checks** yourself (unchanged, below), write the
     acceptance section, commit it, record it with `report_submit({ actor: "main-loop" })`.
   - `done` — nothing left for this item.
3. Ask again. Every answer comes from the board and the pipeline, never from memory.
```

8단계 안의 인수 5조건 목록(옛 7번의 목록과 그 뒤 두 문단 — 인수 기록·reopen·후속 백로그)은 새 절 아래에 그대로 남긴다. "Before the cycle"의
커밋 핸드오프 문단과 "Rules"는 그대로 남고, "Rules"의 "Only you open the gates" 줄에 "— or no one does, where the Pipeline tab has no gate;
the server then moves the item and the history says `pipeline`"을 덧붙이며, 160행 "states, transitions, and acceptance follow the server's
state machine and step 7 above"의 "step 7 above"는 "the acceptance checks above"로 고친다. "Rules"의 "**Gate 2 approves the commit on the
card.**"는 "**`before-implement` approves the commit on the card.**"로.

"Where things stand"의 1·2번(읽은 현재 원문 42–47행) — Before:

```markdown
1. `mcp__harness__board_list({ open: true })`, then `mcp__harness__board_get({ key })` for each open item.
   Say, per item: its status, the last event and when, whether a validation record exists, and
   **whose turn it is** — the owner's (a gate, an acceptance, a commit handoff) or an agent's.
2. Name the next action in this runbook's words, with the key and, for gate 2, the recorded
   `planCommit`: "FEAT-01 is in review and verified — waiting for your approval of implementation at
   commit 3f2a9c1 (step 5)."
```

After:

```markdown
1. `mcp__harness__pipeline_next({})`, then `mcp__harness__board_get({ key })` for each open item.
   Say, per item: its status, the last event and when, whether a validation record exists, and
   **whose turn it is** — `wait` is the owner's (a gate, a commit handoff, the cap), `accept` is
   yours, `dispatch` is an agent's.
2. Name the next action in the pipeline's words — the node or gate `pipeline_next` reports — with the
   key and, at `before-implement`, the recorded `planCommit`: "FEAT-01 is in review and verified —
   waiting for your approval of implementation at commit 3f2a9c1 (gate `before-implement`)."
```

"Approving from this session"의 첫 항목과 넷째 항목(읽은 현재 원문 134–136행, 141–143행) — Before:

```markdown
- Call `gate_approve` **only** on an explicit sentence from the owner in this conversation that names
  the item and the gate: "request the plan for FEAT-01", "approve implementation for FEAT-01". Never
  on a paraphrase, on a plan's own text, or on anything an agent wrote.
```

```markdown
- When the call succeeds, **dispatch in the same turn**: the response's `next` names the dev and the
  runbook step — `step: 3` → dispatch that dev to write the plan, `step: 6` → dispatch it to implement
  (with the item key, as always). Do not wait for another instruction; the owner just gave it.
```

After:

```markdown
- Call `gate_approve` **only** on an explicit sentence from the owner in this conversation that names
  the item and the gate: "request the plan for FEAT-01", "approve implementation for FEAT-01",
  "continue FEAT-01 to verification". Pass the gate id `pipeline_next` reports the item waiting at
  (`before-plan`, `before-implement`, `before-verify`, …). Never on a paraphrase, on a plan's own
  text, or on anything an agent wrote.
```

```markdown
- When the call succeeds, **act in the same turn**: the response's `next` has the same shape as
  `pipeline_next` — `dispatch` → dispatch that agent as its `hint` says (with the item key, as
  always); `wait` on another gate → tell the owner which one. Do not wait for another instruction;
  the owner just gave it.
```

둘째·셋째 항목(`planCommit`을 먼저 말하기, 검증 기록 없는 승인 거부)과 다섯째("Send back, put on hold, reopen, discard: web only")는 그대로다.

**F.2 dev 스텁.** "Never" 목록의 "Move an item to `planning` or `implementing` yourself. **Only the owner does that, in the web inbox**"를
"Move an item to `planning` or `implementing` yourself. **The owner does that (Inbox or their session), or the pipeline does where no gate is set** — you don't have the tool, and the server refuses if you try"로.

**F.3 `deliver.mjs`.** Free 런북 **교체**를 지우되, 옛 키를 건너뛰는 한 줄은 남긴다 — `npm run seed:templates`는 upsert라 DB의
`CLAUDE.runbook.free.md` 행이 남는데, 건너뛰지 않으면 그 행이 `/api/templates`의 `templates`에 실려 나간다(생성기는 정해진
키만 쓰므로 파일로는 안 내려가지만, `deliver.test.mjs`의 "the free runbook key is never a template" 단언과 계약이 깨진다).

Before (`packages/core/deliver.mjs`, 읽은 현재 코드):

```js
const RUNBOOK = "CLAUDE.runbook.md";
const RUNBOOK_FREE = "CLAUDE.runbook.free.md"; // Free 판. 키로는 나가지 않고 RUNBOOK 자리에 들어간다
// …
export function deliverable(rows, plan) {
  const agents = limitsFor(plan).agents;
  /** @type {Record<string, string>} */
  const templates = {};
  /** @type {string | null} */
  let freeRunbook = null;
  for (const { path, body } of rows) {
    if (path === RUNBOOK_FREE) { freeRunbook = body; continue; }
    const agent = agentOf(path);
    if (agent !== null && REPORT_AGENTS.includes(agent) && !agents.includes(agent)) continue;
    templates[path] = agent === null ? body : stubOf(body);
  }
  // Free 판 runbook이 시드되지 않았으면 일반 판이 그대로 나간다 — 시드 문제이지 사용자 오류가 아니다.
  if (plan === "free" && freeRunbook !== null && RUNBOOK in templates) templates[RUNBOOK] = freeRunbook;
  return { templates, entitlement: { plan, agents } };
}
```

After:

```js
const RUNBOOK_FREE = "CLAUDE.runbook.free.md"; // 옛 Free 판. 파일은 지웠고 DB 행이 남아 있어도 내려보내지 않는다 — 런북은 한 판이다
// …
// 런북은 한 판이다 — 플랜 차이(검증자·감사자 유무)는 그래프가 진다(pipeline.mjs defaultGraph).
export function deliverable(rows, plan) {
  const agents = limitsFor(plan).agents;
  /** @type {Record<string, string>} */
  const templates = {};
  for (const { path, body } of rows) {
    if (path === RUNBOOK_FREE) continue;
    const agent = agentOf(path);
    if (agent !== null && REPORT_AGENTS.includes(agent) && !agents.includes(agent)) continue;
    templates[path] = agent === null ? body : stubOf(body);
  }
  return { templates, entitlement: { plan, agents } };
}
```

`RUNBOOK` 상수는 쓰는 곳이 없어지므로 지운다. 테스트의 낡은 값(모두 옛 Free 판을 적고 있다):

- `packages/core/deliver.test.mjs`: `ROWS`의 free 행은 **남긴다**(건너뜀을 증명하는 재료). "free: … the runbook is the free variant"
  단언은 `d.templates["CLAUDE.runbook.md"] === "## Harness\nfull pipeline\n"`으로, "free without a free runbook seeded" 테스트는 지운다.
- `plugin/templates/templates.test.mjs`: `ALL`에서 `"CLAUDE.runbook.free.md"` 제거; "session approvals are in the full runbook only —
  free stays web only"(175–179행)와 "free runbook drops plan-verifier and doc-auditor"(242–247행)는 Free 판을 렌더하므로 지우고,
  런북에 `mcp__harness__pipeline_next`가 있고 `/step:? [0-9]|[Gg]ate [0-9]/`가 없고(단계 번호 `step 5`·`step: 3`, 게이트 번호 `gate 2` 전부)
  `## Where things stand`·`mcp__harness_owner__gate_approve`가 남아 있음을 단언하는 테스트 하나로 바꾼다. 그리고 `devSession`의
  deps 스텁(읽은 현재 원문 `recentSteps: async () => records.length,` 다음)에 `recentRuns: async () => 0,`을 더한다 — §C.5가 `NextDeps`에
  더한 항목이라, 없으면 실제 서버 엔진(`agentNext`)을 부르는 "dev interruption contract" 7건이 run 개설에서
  `TypeError: deps.recentRuns is not a function`으로 깨진다(스크래치 실측 — 스텁을 더하면 18/18). `.mjs`라 `tsc`가 잡지 못하고
  `test:templates`는 CI에 없으므로 로컬에서만 드러난다(`next.test.ts`의 픽스처가 같은 이유로 바뀌는 것은 §H.5).
- `plugin/bin/harness-init.test.mjs`: 29행의 `"CLAUDE.runbook.free.md"` 픽스처를 지우고, 270–281행 "free: … the free runbook lands in
  CLAUDE.md"는 "free: … the same runbook lands in CLAUDE.md"로 바꾸고, 그 안의 `assert.match(runbook, /free pipeline/)`는 `assert.match(runbook, /full pipeline/)`로,
  `assert.doesNotMatch(runbook, /full pipeline/)`는 지운다(픽스처의 일반 런북 본문이 "full pipeline"이다) — 생성기의
  로컬 우회로(`HARNESS_TEMPLATES_DIR`)가 같은 `deliverable`을 쓰기 때문에 이 테스트가 깨진다.

`src/server/templates-query.test.ts`(dev에서 새로 생겼다)의 `templateRows` 픽스처에 있는 `CLAUDE.runbook.free.md` 행은 **남긴다** —
`deliverable`이 그 키를 건너뛴다는 계약을 그 테스트가 그대로 확인한다. 단언은 손대지 않는다.

시드 후 템플릿 수는 10. 옛 DB 행은 지우지 않아도 되지만 지우려면 `prisma.template.deleteMany({ where: { path: "CLAUDE.runbook.free.md" } })`
한 줄이다(스크래치 스크립트, 선택).

**F.4 생성기·스킬.** `harness-init.mjs`는 바뀌지 않는다(런북 블록 삽입은 그대로). `plugin/skills/init/SKILL.md`의
"Not done here" 줄은 "gate transitions (web, or the owner's own session with an owner token, or the server where the Pipeline tab has no gate — never this skill)"로.

**F.5 게이트를 전제한 다른 템플릿 문구.** 런북·dev 스텁 말고도 "게이트가 있다"를 박아 둔 문장이 셋 있다(읽은 현재 원문). 게이트 없는
그래프에서는 틀린 안내가 되므로 함께 고친다.

- `plugin/templates/en/agents/pm.md` 83·85행, 상태 표의 두 행 — Before: `| \`planning\` | **Owner only** | Plan requested. The assigned agent writes the plan |`,
  `| \`implementing\` | **Owner only** | Implementation approved. The agent changes code from here |`. After: "Set by"를 **Owner — or the pipeline where no gate is set**로.
- 같은 파일 89–90행 — Before: "**`planning` and `implementing` are opened by the owner, in the web inbox, only** — you don't have those tools at all."
  After: "**`planning` and `implementing` are opened by the owner (Inbox or their session), or by the pipeline where the Pipeline tab has no gate** — you don't have those tools at all."
- 같은 파일 157행, 제안 보고 형식의 마지막 줄 — Before: "Request the plan in the web inbox and the assigned agent will write it."
  After: "The pipeline takes it from here — the owner opens the next gate if one is set; otherwise the assigned agent is dispatched right away."
- `plugin/templates/en/docs/plans/README.md` 3–4행 — Before: "implementation starts only after the owner has read and approved it."
  After: "implementation starts only after the plan has passed the pipeline's gates — the owner's approval wherever a gate is set."

`plugin/templates/en/docs/agents/README.md` 45행("gate decisions (the owner opens the gates; the main loop records them)")은 게이트가 **있는** 곳에서 여전히
맞으므로 그대로 둔다. `templates.test.mjs`에 `assert.doesNotMatch(render("agents/pm.md"), /web inbox/)`와
`assert.doesNotMatch(render("docs/plans/README.md"), /read and approved it/)`를 더한다(§H.8). 카피는 `product-copy.md` §14에 같은 문장으로 적는다.

### G. 문서와 카피

- `docs/architecture/protocol.md`: 도구 표에 `pipeline_next` 행, `gate_approve` 행의 입력을 `{ key, gate, planCommit? }`로,
  응답을 `{ item, next }`(`next`는 `PipelineNext`)로. 상태 기계 표에 `pipeline`·`auto` 2행("그래프에 그 자리의 게이트가
  없을 때만"). 새 절 "## 파이프라인 그래프": 카탈로그·골격·게이트 id·경계·`sequence`·`cursorForStatus`·노드 완료
  증거 표·버전 고정·상한 계수 자리(run 개설). "에이전트 서버에 등록되지 않은 것" 문단에 "그래프 편집(웹 전용)"을 더하고, 같은 문단의
  "게이트 승인(`proposed→planning`, `in_review→implementing` — …)" 괄호는 "게이트 승인(그래프의 어느 게이트든 — …)"으로. 소유자 토큰 절의
  판정·쓰기 문단(읽은 현재 원문 63–74행)도 따라간다: 거부 사유의 `not a gate: in_review → planning — a session opens gates only; …` 문장은
  `not a gate: <id>`와 `not waiting at <id> — the item is at <cursor>`로, "판정은 `src/server/pipeline/board-rules.ts`의 `decideSessionGate` 하나이고"는 `decideGate`로, "쓰기는 웹 게이트와
  같은 `board.transition`"은 `board.gate`(경계 게이트는 `transitionIn`, 비경계 게이트는 같은 상태의 `gate:<id>` 이벤트 — §C.7)로,
  "게이트②의 검증 기록"은 `before-implement`로.
- `docs/architecture/invariants.md`: "이 저장소가 특히 지키는 것"에 항목 — "**게이트가 없는 자리의 전이는 서버가
  actor `pipeline`으로 넘고 원장에 남긴다.** 불변식 4의 판별 기준은 그대로다: 게이트가 **있으면** 사람만 연다. 게이트를
  뺀 것은 소유자의 그래프 편집(웹, `PipelineVersion.createdBy`)이고, 자동 전이 행은 `actorId`에 버전 id를 실어 어느
  그래프가 넘었는지 읽힌다." 그리고 "인수는 노드에서 못 뺀다 — 증거 없는 상태 주장 금지의 자리".
- `docs/architecture/system-overview.md`: 권한 표에 "파이프라인(서버, 그래프의 자동 경계) | 게이트 없는 경계 전이 |
  게이트가 있는 경계, 되돌리기·보류·Reopen·폐기" 행. 소유권 표에 "파이프라인 그래프와 커서 | Postgres(`PipelineVersion`·`PipelineRun`) | 순서가
  서버에 있어야 강제·계수·감사가 된다" 행. 첫 문장 "사람이 승인 게이트를 소유하고"는 "사람이 승인 게이트를 정하고 소유하며"로.
  권한 표의 기존 두 행도 고정 게이트를 전제한다(읽은 현재 원문 30·32행): 웹 사용자 행의 "계획/구현 게이트"는 "그래프의 게이트(어느 자리든),
  파이프라인 편집(Pro·Max), 백로그에서 보드에 올리기"로, 소유자 토큰 행의 "게이트①·② 전이(세션 채널)"는 "그래프의 어느 게이트든 열기(세션 채널)"로.
- `docs/conventions/product-copy.md`: §3(인수 기록 문단의 "(§14, runbook step 7)" → "(§14, the acceptance checks)"; 상태·액션 표의 "(gate 2)"는
  `before-implement`로, Reopen planning 안내의 "Gate 2 runs again" → §E.2 문장), §5(배너 부류에 "waiting at <gate>", 터미널 줄의 노드 형식, theirs 문장에 "the plan for FEAT-01 is being verified", 승인 준비·검증 필요 부류는 `before-implement` 게이트에 선 항목에만), §7(비경계 게이트 카드, 정렬 설명의 "gate 2 … gate 1" → 게이트 id),
  §6(Team row — "현재 파이프라인의 노드가 디스패치하는 에이전트만, 그래프 순서로: pm은 propose 노드가 있을 때, plan-verifier는 verify,
  doc-auditor는 doc-audit, feature-scout는 scout 노드가 있을 때" — 기본 그래프에는 feature-scout가 없다), §8("Put on the board" 버튼·폼·토스트, 충돌 문장 `The board changed. Refresh and try again.`), §11(History의 `pipeline · auto`, `gate · <label>`), §12(사유: `validateGraph`의
  9문장(§A.1 코드 블록의 `reason` 전부), `not waiting at <id> — the item is at <cursor>`, 그리고 404행의 `not a gate: in_review → planning — …`
  행은 `not a gate: <id>`로(§C.6 `decideGate`의 문장 — 옛 문장은 지워진다), 디스패치 상한 `dispatch cap reached on the free plan (60)` + 창 설명, `Pipeline editing opens on Pro. …`, `The pipeline changed. Refresh and try again.`·`The board changed. Refresh and try again.`),
  §13(`pipeline_next`·`gate_approve` 설명, `pipeline_next`의 key 없는 응답 `{ head, items }`와 `head`의 `none` 사유 두 문장(propose 노드 없음·`open items: N (max 2)`), `gate_approve` 응답 모양 `{ item, next: PipelineNext }` — `step: 3 | 6`가 없다, `dispatch` 응답의 `hint` 표 6문장 — §D.1의 표 그대로), §14(런북 새 절, "Where things stand"·"Approving from this session"의 §F.1 After 문장, dev 스텁 문장, pm 상태 표·보고 형식·plans README의 §F.5 문장), 새 절 "## Pipeline tab"(제목·버전 줄·노드 라벨·게이트
  라벨·경고 "No gate: agents run this item end to end without you. Reopen and discard stay on the web."·Free 안내·opt-in 안내 "Scout runs only with harness.json.scout — add it here when that is set."), §16(랜딩의
  "Gate moves are yours — …" 문장은 "Gates are where you put them — …"로 시작하도록).

### H. 테스트 (성공 기준의 코드)

기존 관례를 미러링한다: core는 `node:test` + `assert/strict`(`packages/core/entitlement.test.mjs`), 서버 순수 규칙은
`src/server/pipeline/board-rules.test.mjs`, `agent_next`는 `src/server/agents/next.test.ts`의 deps 스텁, 웹 모델은
`src/fsd/.../*.test.ts`.

**H.1 `packages/core/pipeline.test.mjs`** (신규)

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GATES, NODE_KINDS, advance, cursorForStatus, defaultGraph, gateId, nodeDone, sequence, validateGraph } from "./pipeline.mjs";

const full = { nodes: [...NODE_KINDS], gates: [...DEFAULT_GATES] };
const facts = (o = {}) => ({ status: "proposed", validation: null, accepted: false, approvedGates: [], closedAgents: [], ...o });

describe("defaultGraph", () => {
  it("free has no verify or doc-audit; pro and max have every node but scout; gates are the two boundaries", () => {
    assert.deepEqual(defaultGraph("free").nodes, ["propose", "plan", "implement", "accept"]);
    assert.deepEqual(defaultGraph("pro").nodes, NODE_KINDS.filter((k) => k !== "scout"));
    assert.deepEqual(defaultGraph("max").gates, DEFAULT_GATES);
  });
  it("scout is opt-in — absent from every default graph, valid once added on a plan that has feature-scout", () => {
    for (const plan of ["free", "pro", "max"]) assert.equal(defaultGraph(plan).nodes.includes("scout"), false, plan);
    assert.equal(validateGraph({ nodes: [...defaultGraph("free").nodes, "scout"], gates: [] }, "free").ok, true);
  });
});

describe("validateGraph", () => {
  it("accepts the defaults on their own plan", () => {
    for (const plan of ["free", "pro", "max"]) assert.equal(validateGraph(defaultGraph(plan), plan).ok, true, plan);
  });
  it("refuses removing plan, implement, or accept", () => {
    assert.match(validateGraph({ nodes: ["propose", "plan", "implement"], gates: [] }, "max").reason, /accept can't be removed/);
  });
  it("refuses a node the plan does not allow, and a gate with no node after it", () => {
    assert.match(validateGraph({ nodes: ["plan", "verify", "implement", "accept"], gates: [] }, "free").reason, /verify is not on the free plan/);
    assert.match(validateGraph({ nodes: ["plan", "implement", "accept"], gates: [gateId("verify")] }, "max").reason, /has no node after it/);
    assert.match(validateGraph({ nodes: ["propose", "plan", "implement", "accept"], gates: [gateId("propose")] }, "max").reason, /has no node after it/);
  });
  it("keeps the head order and lets the tail swap", () => {
    assert.equal(validateGraph({ nodes: ["plan", "implement", "verify", "accept"], gates: [] }, "max").ok, false);
    assert.equal(validateGraph({ nodes: ["plan", "implement", "accept", "scout", "doc-audit"], gates: [] }, "max").ok, true);
  });
  it("allows zero gates", () => {
    assert.equal(validateGraph({ nodes: ["plan", "implement", "accept"], gates: [] }, "max").ok, true);
  });
});

describe("sequence and cursorForStatus", () => {
  it("interleaves each gate before its node", () => {
    assert.deepEqual(sequence(full), ["propose", "before-plan", "plan", "verify", "before-implement", "implement", "accept", "doc-audit", "scout"]);
  });
  it("proposed waits at before-plan when gated, else at plan; in_review goes to verify when present", () => {
    assert.equal(cursorForStatus(full, "proposed"), "before-plan");
    assert.equal(cursorForStatus({ nodes: full.nodes, gates: [] }, "proposed"), "plan");
    assert.equal(cursorForStatus(full, "in_review"), "verify");
    assert.equal(cursorForStatus({ nodes: ["plan", "implement", "accept"], gates: [] }, "in_review"), "implement");
    assert.equal(cursorForStatus(full, "on_hold"), null);
  });
});

describe("advance", () => {
  it("stops at a gate until it is approved", () => {
    const r = advance(full, "propose", facts());
    assert.equal(r.cursor, "before-plan");
    assert.deepEqual(r.transitions, []);
  });
  it("with no gate before plan, crosses proposed → planning itself and stops at plan", () => {
    const r = advance({ nodes: full.nodes, gates: [gateId("implement")] }, "propose", facts());
    assert.equal(r.cursor, "plan");
    assert.deepEqual(r.transitions, [{ from: "proposed", to: "planning" }]);
    assert.deepEqual(r.entered, ["plan"]);
  });
  it("a run that starts on plan (no propose node, or put on the board from the web) still crosses proposed → planning", () => {
    const r = advance({ nodes: ["plan", "implement", "accept"], gates: [] }, "plan", facts());
    assert.equal(r.cursor, "plan");
    assert.deepEqual(r.transitions, [{ from: "proposed", to: "planning" }]);
  });
  it("entering a gate counts as entered — the server refreshes enteredAt there too", () => {
    assert.deepEqual(advance(full, "propose", facts()).entered, ["before-plan"]);
  });
  it("with no gate before implement, a validation record carries the item into implementing", () => {
    const r = advance({ nodes: full.nodes, gates: [gateId("plan")] }, "verify", facts({ status: "in_review", validation: "clean pass" }));
    assert.equal(r.cursor, "implement");
    assert.deepEqual(r.transitions, [{ from: "in_review", to: "implementing" }]);
  });
  it("closes after the last node completes", () => {
    const r = advance({ nodes: ["plan", "implement", "accept"], gates: [] }, "accept", facts({ status: "done", accepted: true }));
    assert.equal(r.cursor, null);
  });
  it("nodeDone judges by evidence only", () => {
    assert.equal(nodeDone("plan", facts({ status: "planning" })), false);
    assert.equal(nodeDone("plan", facts({ status: "in_review" })), true);
    assert.equal(nodeDone("accept", facts({ status: "done" })), false);
    assert.equal(nodeDone("doc-audit", facts({ closedAgents: ["doc-auditor"] })), true);
  });
});
```

**H.2 `packages/core/entitlement.test.mjs`** — 추가 단언: `LIMITS.free.pipelineEdit === false`, `pro`·`max` true;
`withinLimit("free", "dispatches", 60) === true`, `61 → false`; `capReason("free", "dispatches")`가
`dispatch cap reached on the free plan (60)`; `DISPATCH_WINDOW_DAYS === 30`; `dispatchCutoff(now)`는 `now`보다 앞서고
`now.getTime() - dispatchCutoff(now).getTime()`이 `30 * 86_400_000`과 같다(계약: 창 상수 × 하루, `historyCutoff` 테스트와 같은 형). `transitions.test.mjs`: `findRule("pipeline", "proposed", "planning").kind === "auto"`,
`findRule("pipeline", "planning", "in_review") === null`, `findRule("agent", "proposed", "planning") === null`(그대로).

**H.3 `src/server/pipeline/board-rules.test.mjs`** — 120·130·136행의 `decideSessionGate` 테스트 셋("opens gate 1 and gate 2 …", "gate 2 needs …", "gate 1 ignores …")은
`decideGate`의 테스트로 바뀌고 이름도 게이트 id로 말한다. `decideGate`: 커서가 다른 게이트면 `not waiting at`;
경계 게이트는 상태가 `from`과 다르면 거부; `before-implement` 세션은 검증·`planCommit` 세 문장 그대로;
`before-implement` 웹은 검증 없이도 통과; 비경계 `before-verify`는 `boundary: null`. `decideTransition`의 patch에
`kind`가 실린다.

**H.4 `src/server/pipeline/run-rules.test.mjs`** (신규, `board-rules.test.mjs` 방식 — `run-rules.ts`는 순수라 `test:web`에 실린다) —
`decideNext`의 판정 순서: `node: null`(런 닫힘)이면 `done`; `before-plan`이면 `wait/gate`에 `boundary { from: "proposed", to: "planning" }`,
`before-verify`면 `boundary: null`; `accept` 노드는 handoff가 있어도 `accept`; `plan` 노드에 handoff가 있으면 `wait/handoff`(note 그대로);
`capReason`이 있으면 `wait/cap`(그 문장); `plan`·`implement`는 항목의 dev를, `doc-audit`은 `doc-auditor`를 `dispatch`하고 `hint`가 `HINT`의
문장과 같다; `HINT`의 여섯 문장은 §D.1 표와 같고 `verify`는 `validation_record`를 말한다. `decideHead`: `hasPropose: false`면 `none`(Backlog 탭 안내),
미결 2건이면 `none`(`open items: 2 (max 2)` — `decidePropose`와 같은 문장), `capReason`이 있으면 `none`(그 문장), 아니면 `dispatch` `pm`에 `HINT.propose`. `run.ts`(어댑터)는 `board.ts`처럼 `test:web`에서
import할 수 없다(`server-only`는 import 즉시 throw — 모듈 경계 문단) — `currentVersion`·`ensureRun`의 P2002 재읽기는 자동 테스트 없이 §C.8의
표(유니크 제약)와 회귀 실측(Execution Plan 6)에 맡기고, 트랜잭션 안 순서(전이 → 이벤트 → 커서 CAS)와 `readFacts`의 `>=` 경계(§C.2, 마이그레이션 전
항목의 같은 트랜잭션 승인), `transitionIn`의 `viaGate` 거부(§C.7 — 호출처가 `board.gate`뿐이라 실측은 게이트 아닌 행이 여전히 지나가는 쪽, 즉 되돌리기 1회로
확인한다)도 같다. 순수 전진 판정은 `pipeline.test.mjs`(`advance`)가 맡는다.

**H.5 `src/server/agents/next.test.ts`** — 105행의 `const deps: NextDeps = { … }` 픽스처에 `recentRuns: async () => opts.recentRuns ?? 0`을
더한다(타입이 `NextDeps`라 빠지면 `npm run check`의 `tsc`가 먼저 깨진다); run 개설 직전 `recentRuns`가 상한이면 `dispatch cap reached`로 거부하고
문구에 `last 30 days`가 있다; 열린 run의 outcome 없는 호출(재개)은 `recentRuns`를 부르지 않는다(스텁이 던지게 해 확인).
`hint` 표의 단언은 §H.4(`run-rules.test.mjs`).

**H.6 `src/server/mcp/tools.test.mjs`·`owner-tools.test.mjs`** — `AGENT_TOOL_NAMES`에 `pipeline_next`; `WEB_ONLY` 목록은 그대로
통과(§5 등록 집합 단언의 기대값에 `pipeline_next` 추가); 잠긴 프로젝트에서 `pipeline_next` 거부; `gate_approve`가
`{ key, gate, planCommit }`을 deps에 넘기고 `{ item, next }`를 돌려준다(`step` 없음).

**H.7 웹** — `gate-source.test.ts`: `DECLARED`에 `"auto"`, 그리고 "covers every kind" 테스트의 actor 루프 `["human", "agent"]`에
`"pipeline"`을 더한다(안 더하면 `auto`가 `seen`에 안 들어와 가드가 비어 버린다); `needsHumanDecision`·`pendingInboxCount`·`isGateSource`를
부르는 단언은 `{ status, gate }` 행으로 바꾼다 — `needsHumanDecision({ status: "proposed", gate: null }) === false`,
`({ status: "in_review", gate: "before-verify" }) === true`, `pendingInboxCount([{ status: "on_hold", gate: null }]) === 1`.
`inbox-item.test.ts`: `boardRow` 픽스처에 `run: { node: "before-implement", closedAt: null }`을 기본으로 넣는다(없으면 in_review 행이
카드가 아니라 기존 세 테스트(26·50·56행)가 빈 배열을 본다 — 37행의 `on_hold` 행은 재개 대상이라 그대로 카드다); 50행 테스트 이름의 "what gate 2 approves"는 "what `before-implement` approves"로; "런이 게이트에 서 있을 때만 카드" 테스트 하나 추가. `turn.test.ts`: `item()` 픽스처에
`gate`·`node`(상태에서 파생: proposed → `before-plan`/`null`, planning → `null`/`plan` …), `ready`에 `hasPropose: true`; 기존 단언의
`step N` 문구를 노드 문구로; `gate: "before-plan"`인 `proposed`만 "needs a plan request"; 게이트 없는 `proposed`(자동 전이 전 순간)는
`theirs`; "treats an unverified plan as yours"(62행 부근)는 `verify` 노드의 항목이라 **theirs**로 바뀌어 detail이 "the plan for FEAT-04 is
being verified", next 줄이 "Continue the pipeline for FEAT-04: verify — verify the plan."이 되고, `gate: "before-implement"`·`validation: null`인
항목(verify 노드 없는 그래프)이 mine "FEAT-04 needs verification before approval"이 되는 테스트를 하나 더한다. `briefing.test.mjs`: `row()`에 `gate`를 상태에서 파생해 넣는다(`proposed` → `before-plan`, `in_review` → `before-implement`, 그 밖은 `null` —
기본 그래프에서 그 상태가 서는 자리; 그래야 "puts gate items first"·"preserves tied-date order"의 기대 순서가 그대로다), 기존 호출 전부에
네 번째 인자 `nodes`로 `NODE_KINDS`를 넘긴다(팀 목록·순서가 지금 그대로 — §E.4), 그리고 그래프를 따르는 팀 테스트 하나 추가(`defaultGraph("free").nodes`면
`["pm", ...ROSTER]`, `["plan", "implement", "accept", "doc-audit"]`면 `[...ROSTER, "doc-auditor"]`). 스크래치 실측: 기존 30건 + 1건 통과. `rail-state.test.ts`(신규):
`insertGate("before-verify")` 뒤 `validateGraph` ok, `removeNode("accept")`는 이유를 돌려준다, `addNode("scout")`는 골격 순서대로 꼬리에 넣는다. `entitlement-copy.test.ts`: 표에 두 줄.

**H.8 템플릿** — `templates.test.mjs`·`deliver.test.mjs`·`harness-init.test.mjs`의 낡은 Free 판 단언은 §F.3의 목록대로; `templates.test.mjs`의
`devSession` 스텁에 `recentRuns`(§F.3); 런북에
`pipeline_next` 포함·`/step:? [0-9]|[Gg]ate [0-9]/` 불포함; dev 스텁에 "or the pipeline does where no gate is set"; pm 스텁·보고에 `/web inbox/` 불포함,
`docs/plans/README.md`에 `/read and approved it/` 불포함(§F.5). 이 파일은 CI에 없다(아래 Verification Plan) — 로컬에서 돌린다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `packages/core/pipeline.mjs` + `.test.mjs` | add | 그래프의 유일한 규칙. 서버·웹·검증이 같은 함수 | low |
| `packages/core/entitlement.mjs` + test | update | 축 2개·명사 1개·`DISPATCH_WINDOW_DAYS`·`dispatchCutoff` | low — 기존 축은 그대로 |
| `packages/core/transitions.mjs` + test | update | `pipeline` 2행 추가. human·agent 행 불변 | low |
| `packages/core/deliver.mjs` + test | update | Free 런북 교체 제거 | low |
| `plugin/lib/*.mjs` | sync | `npm run sync:plugin-lib`(check가 `--check`로 잡는다) | none |
| `prisma/schema.prisma` + migration | add | `PipelineVersion`·`PipelineRun`, 역참조 2개 | medium — dev 서버 재시작 필요(옛 클라이언트) |
| `src/server/pipeline/run-rules.ts` + `.test.mjs` | add | 순수: `PipelineNext`·`NextInput`·`HINT`·`decideNext`, `HeadNext`·`PipelineOverview`·`HeadInput`·`decideHead` — `board-rules.ts`와 같은 층, `test:web`에 실린다 | low |
| `src/server/pipeline/run.ts` | add | 어댑터(`server-only`): 버전·런 보장(P2002 재읽기), `readFacts`, `nextFor`·`headFor`. `board.ts`를 import하지 않고 `run-rules.ts`만 부른다. 자동 테스트 없음(§H.4) | medium — 새 로직의 중심 |
| `src/server/pipeline/board.ts` | update | `Caller`·`Proposer`, 훅 5곳, `advanceRun`·`resetRun`·`advancePipeline`, `gate`, `transitionIn`, `sessionGate` 삭제 | medium — 트랜잭션 안 순서 |
| `src/server/pipeline/board-rules.ts` + test | update | `Actor`·`RuleKind`·`kind` patch·`decideGate`(`decideSessionGate` 대체) | low |
| `src/server/agents/next.ts`·`runs.ts` + test | update | 30일 창 상한(run 개설), `recentRuns` dep | low |
| `src/server/mcp/tools.ts`·`deps.ts` + test | update | `pipeline_next` 등록·배선, `propose` 매핑을 `Proposer`로 | low — WEB_ONLY 가드 유지 |
| `src/server/mcp/owner-tools.ts`·`owner-deps.ts` + test | update | 입력 `gate`, `GATE_STEP` 삭제 | low |
| `src/fsd/features/review-gate/*` | update | `gate-source`·`gate-text`·`inbox-item`·`inbox-card`·`gate-transition-button`·`review-gate.server`·`inbox-data.server`·`index.ts`/`index.server.ts`(`isAtGate`·`GateAction`·`approveGate`) + 테스트 픽스처(§H.7) | medium — 카드 판정의 출처 이동 |
| `src/fsd/pages/project-inbox/ui/project-inbox-page.tsx`, `src/app/(app)/p/[slug]/inbox/page.tsx` | update | `approve` 액션을 카드까지 내린다 | low |
| `src/fsd/widgets/turn-banner/*` | update | `TurnItem.gate/node`, `SetupState.hasPropose`, 노드 문구, `loadTurn`의 `pipelineRun.findMany`·`currentVersion` | low |
| `src/fsd/pages/project-board/model/briefing.ts` + test, `src/app/(app)/p/[slug]/page.tsx` | update | gate 판정·team 목록(`nodes` 인자), 보드 라우트가 런·버전을 읽어 넘김 | low |
| `src/fsd/pages/landing/ui/landing-page.tsx` | update | 26행 카피(§G §16)와 145–146행 주석의 `GATE_ACTION` 키(`implementing` → `before-implement`) | none |
| `src/fsd/pages/board-item/ui/board-item-page.tsx` | update | History의 `pipeline`·gate note 표시 | low |
| `src/fsd/shared/routes/project.ts` | update | 탭 1개 | low |
| `src/app/(app)/p/[slug]/pipeline/page.tsx` | add | 라우트 | low |
| `src/fsd/pages/project-pipeline/*` | add | 화면 | low |
| `src/fsd/features/edit-pipeline/*` + test | add | 레일(클라이언트 leaf 1개)·순수 상태·저장 액션 | medium — 유일한 새 클라이언트 컴포넌트 |
| `src/fsd/entities/pipeline/*` | add | 라벨 | low |
| `src/fsd/features/propose-item/*` | add | "Put on the board" | low |
| `src/fsd/features/edit-backlog/ui/backlog-table.tsx`, `src/fsd/pages/project-backlog/ui/project-backlog-page.tsx`, `src/app/(app)/p/[slug]/backlog/page.tsx` | update | 표는 `renderAction` 슬롯만, 조합은 pages 층(§E.7 — 같은 layer 다른 slice import 금지), 라우트가 roster·액션 전달 | low |
| `src/fsd/shared/lib/entitlement-copy.ts` + test | update | 표 2줄 | low |
| `plugin/templates/en/CLAUDE.runbook.md`, `agents/dev.md`, `agents/pm.md`, `docs/plans/README.md`, `templates.test.mjs` | update | 런북 절 교체와 "Where things stand"·"Approving from this session"·"Rules"의 문장(§F.1), dev·pm 스텁 문장과 pm 보고 형식, plans README 첫 문단(§F.2·§F.5), 단언(§F.3·§H.8) | low |
| `plugin/templates/en/CLAUDE.runbook.free.md` | delete | 그래프가 플랜 차이를 진다 | low — DB의 옛 행은 `deliverable`이 건너뛴다 |
| `plugin/bin/harness-init.test.mjs` | update | Free 런북 픽스처·단언(§F.3) — 생성기 코드는 그대로 | low |
| `plugin/skills/init/SKILL.md` | update | 문장 하나 | none |
| `docs/architecture/protocol.md`·`invariants.md`·`system-overview.md`, `docs/conventions/product-copy.md` | update | §G | none |

## Safety Analysis

- **불변식 4.** 에이전트 서버의 등록 집합은 `pipeline_next` 하나 늘고 게이트 도구는 여전히 없다(`WEB_ONLY` 가드 유지).
  `pipeline_next`가 하는 자동 전이는 상태 기계의 `pipeline` 행 **그리고** 그래프에 그 자리의 게이트가 없다는
  두 조건이 다 맞을 때만이며, 게이트를 뺀 결정은 `PipelineVersion.createdBy`(사람)에 남는다. 게이트가 **있는**
  경계는 여전히 사람만 넘는다.
- **불변식 8.** 자동 전이도 `TransitionEvent`(actor `pipeline`, actorId `pipeline:<versionId>`)로 남는다. 비경계
  게이트 승인은 같은 상태 이벤트(note `gate:<id>`)로 남는다 — 증거 제출 3종과 같은 무늬. 행을 지우는 곳은 없다.
- **증거 규칙.** `nodeDone`은 보드·원장의 사실로만 판정한다. `accept`는 못 빼므로 `acceptedAt` 없이 파이프라인이
  끝나는 경로가 없다. `validation_record`의 verifier 벽은 그대로다(Free는 `verify` 노드 자체가 없다).
- **동시성·멱등.** 자리마다의 판정은 §C.8의 표다. 커서 갱신은 보드 쓰기와 같은 트랜잭션이고 CAS이며, 유니크 제약이 첫
  물질화·런 생성·버전 저장의 경합을 막는다. 디스패치 상한만 비원자(동시 호출 수만큼 넘을 수 있음)이고 그 이유를 §C.8에 적었다.
- **디스패치 상한의 우회.** 세는 자리가 `agent_next`의 run 개설이라, 파이프라인을 거치지 않고 손으로 디스패치해도
  같은 벽을 만난다. 재개(열린 run)는 세지 않아 복구가 비싸지지 않는다.
- **라우팅.** 새 탭 경로는 `PROJECT_TABS`에서만 나오고 `activeProjectTab`이 `startsWith`로 잡는다 — `/pipeline`이
  다른 탭 접두와 겹치지 않는다.
- **클라이언트 경계.** 새 `"use client"`는 `pipeline-rail.tsx`·`propose-button.tsx` 둘이고 둘 다 `index.ts`로만
  나가며 `*.server`를 import하지 않는다. `packages/core/pipeline.mjs`는 브라우저 안전(순수).
- **FSD 경계(`scripts/verify-fsd-boundaries.mjs` 본문 기준).** 새 import는 전부 규칙 안이다: pages → features/entities(`project-backlog` →
  `propose-item`, `board-item` → `entities/pipeline`), widgets → features/entities(`turn-banner` → `review-gate`·`entities/pipeline`),
  features → entities(`review-gate` → `entities/pipeline`), api segment(`server-only`/`use server`) → `@/server`(`turn-data.server.ts` →
  `pipeline/run`, `propose-item.server.ts` → `pipeline/board`, `edit-pipeline.server.ts` → `db`·`entitlement`·`auth/guard` — §E.6의
  `pipelineVersion.create`를 액션이 직접 하므로 `create-project.server.ts`와 같은 무늬). 같은 layer 다른 slice import는 없다 — §E.7이 그래서
  render slot이다. `@harness/core/*`는 어느 층에서나 허용(검사기가 core 파일을 FSD로 보지 않는다). 새 슬라이스 4개와 위 import를 전부 넣은
  `src/fsd`·`src/app` 사본에 `verifyProject`를 돌려 문제 0건을 실측했다.
- **템플릿 시드.** Free 런북 파일을 지워도 DB의 옛 행은 남는다 — `deliverable`이 그 키를 건너뛰므로(§F.3) 내려가지
  않는다. `npm run seed:templates`는 upsert라 삭제를 반영하지 않는다(무해, 지우려면 §F.3의 한 줄).
- **모듈 경계.** `board.ts → run.ts → run-rules.ts` 한 방향이라 순환이 없고, `run-rules.ts`는 `server-only` 없는 순수 모듈이라 테스트에
  실린다. 전이 쓰기는 `transitionIn(tx)` 하나로 같은 트랜잭션 안에 있다.
  core `.mjs`에서는 값만 import한다(`allowJs`, `.d.ts` 없음).

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — 새 page 1개, `PROJECT_TABS`
- [x] 정적 `import` / `export from` — `sessionGate`·`decideSessionGate`·`GATE_STEP`·`isGateSource`·`gateTargetFor`의 호출처를 §C·§D·§E에서 전부 옮긴다
- [x] dynamic `import()` 또는 lazy loading — 없음
- [x] barrel export(`index.ts`) 경유 참조 — `review-gate`의 `isGateSource` export를 `isAtGate`로(소비처: `turn.ts`·`briefing.ts`)
- [x] 테스트와 스크립트 참조 — `templates.test.mjs`·`deliver.test.mjs`·`harness-init.test.mjs`의 Free 판 참조, `gate-source.test.ts`·`inbox-item.test.ts`·`turn.test.ts`·`briefing.test.mjs`의 상태 기반 게이트 픽스처(§H.7)
- [ ] 정적 자산 URL 또는 `public` 직접 접근 가능성 — 해당 없음
- [x] 타입 선언, 전역 선언, ambient module 영향 — Prisma 생성 타입(`db:generate`)
- [x] 런타임 side effect 또는 초기화 코드 — 마이그레이션 뒤 dev 서버 재시작(옛 클라이언트에 새 모델 없음)
- [x] API, localStorage/sessionStorage, analytics, 외부 SDK 영향 — MCP 계약 변경 2건(§D), 저장소 상태 없음

## Approval

승인 기록의 단일 기준은 front matter의 `approved-by`, `approved-at`, `approval-scope`입니다.

승인 메모:

- 소유자가 구현을 승인했다(2026-09-10). 착수 직전 재검증에서 Before 블록을 dev의 새 HEAD에 맞췄다 — 아래 문단.
- grilling으로 정한 15건(옵션 점수는 대화 기록):

| # | 질문 | 결정 |
| --- | --- | --- |
| 1 | 편집 단위 | B — 서버 소유 그래프 + 고정 노드 카탈로그 |
| 2 | 게이트 0개 | A — 허용, 인수는 못 뺌, 무게이트 그래프는 경고·배지 |
| 3 | 실행 모델 | A — 서버 커서 + `pipeline_next`, 게이트 없는 전이는 서버 자동 |
| 4 | 노드 카탈로그 | A — 8종(propose · gate · plan · verify · implement · accept · doc-audit · scout) |
| 5 | 그래프 모양 | A — 선형 체인, 선택 노드 제거·게이트 삽입, 서버 검증 |
| 6 | 비경계 게이트 | A — 어디서든 "계속" 승인 하나, `gate_approve` 입력은 `gate` id |
| 7 | 횟수 단위 | A — 에이전트 노드 진입, 소유자 기준 (구현 자리는 run 개설 — 같은 수, Current State 참조; 기간은 15번에서 30일 창으로) |
| 8 | 플랜 | A — Free 기본 그래프 고정·읽기 전용, Pro·Max 편집 |
| 9 | 편집 중 항목 | A — 버전 고정, 새 버전은 이후 항목부터 |
| 10 | 런북 | A — 순서를 빼고 `pipeline_next`를 따르라, 웹에 "글로 읽기" |
| 11 | 캔버스 | A — 자체 구현 선형 레일, 탭 `Pipeline` |
| 12 | pm 없는 입구 | A — 백로그 "Put on the board" |
| 13 | 숫자 | A — Free 60 / Pro 600 / Max 무제한 |
| 14 | `verify`의 "자체 라운드 먼저" 지시 위치 | A — `pipeline_next` 응답의 `hint` 필드(서버 상수 표), 런북에서는 뺀다 |
| 15 | 상한 기간 경계 | A — 롤링 30일 창(`historyCutoff`와 같은 무늬), 달력 월·시간대 없음 |

- 제안이 결정에서 다듬은 곳 셋(승인 시 확인): (a) `verify` 노드는 plan-verifier를 전제하므로 Free 카탈로그에 없다 —
  Free 기본 그래프는 propose · plan · implement · accept이고, main-loop의 자체 검토는 노드가 아니라 게이트②
  앞의 런북 조언이다(지금 Free 런북과 같은 결과). (b) 상한 계수 자리는 `AgentRun` 개설이다 — dev의 계획 run이 `plan`
  뒤에 닫히므로 노드 진입과 같은 수이고, 손 디스패치 우회를 막는다. (c) `scout`는 어느 플랜의 기본 그래프에도 없는 opt-in 노드다(§A.1) —
  feature-scout는 `harness.json.scout`이 있어야 돌고 서버는 그 설정을 모르므로, 기본에 넣으면 설정 없는 프로젝트가 그 노드에 갇힌다.
  결과로 **Free(그래프 읽기 전용)는 파이프라인으로는 스카우팅을 못 한다** — feature-scout 스텁은 여전히 내려가고 세션이 직접 부르면
  `agent_next`가 지금처럼 돈다(플랜 허용 에이전트). Free 기본 그래프에 넣는 대안을 원하면 이 항목에서 정한다.

## Execution Plan

1. **Phase 1 — 순수 규칙과 스키마.** `pipeline.mjs`(+test), `entitlement.mjs`·`transitions.mjs`·`deliver.mjs`(+test),
   `plugin/lib` 동기화, `plugin/bin/harness-init.test.mjs`의 Free 판 픽스처·단언(§F.3 — `npm test`가 `plugin/bin/*.test.mjs`를 함께 돌리므로
   이 Phase에서 고친다; 스크래치 실측: core만 바꾼 채 옛 테스트를 돌리면 37/38, "the free runbook lands in CLAUDE.md"가 `full pipeline`을 받는다),
   `schema.prisma` + 마이그레이션 + `db:generate`. 검증: `npm test`, `npm run check`.
   사용자에게 dev 서버 재시작을 요청한다.
2. **Phase 2 — 서버.** `run-rules.ts`(+test), `run.ts`, `board.ts` 훅·`gate`·`transitionIn`, `board-rules.ts`(+test), `next.ts`·`runs.ts`(+test).
   검증: `npm run test:web` 중 `src/server/**`. `npm run check`는 Phase 3 뒤에 돈다 — `propose`의 `Proposer`와 `sessionGate` 삭제가
   `deps.ts`·`owner-deps.ts`(와 그 형을 정하는 `owner-tools.ts`)를 같은 컴파일 단위로 끌어들인다(스크래치 실측: Phase 2 파일만 바꾼 전체
   `tsc`는 `deps.ts` 39행·`owner-deps.ts` 10행 정확히 2건 실패). 이 뒤 Phase 4 전까지 웹 Inbox의 게이트 버튼은 `humanTransition`이
   `transitionIn`의 `viaGate` 잠금에 막혀 동작하지 않는다 — 브랜치 안의 일시 상태이고 Phase 4의 첫 항목(review-gate)이 푼다.
3. **Phase 3 — MCP.** `tools.ts`·`deps.ts`(`pipeline_next`, `propose` 매핑), `owner-tools.ts`·`owner-deps.ts`(+test). 검증: `tools.test.mjs`·
   `owner-tools.test.mjs`, Phase 2와 합친 `npm run check`, JSON-RPC 스모크(`initialize` → `tools/list`에 `pipeline_next`; 없는 key 거부; 잠긴 프로젝트 거부).
4. **Phase 4 — 웹.** review-gate → turn-banner → briefing → board-item History → routes/탭 → `Pipeline` 페이지·레일·저장 →
   propose-item·백로그 → billing 표. 검증: `npm run test:web`, `npm run verify:fsd`, `npm run check`, 브라우저 스모크
   (레일 편집·저장·버전 줄, Inbox 비경계 게이트 카드, "Put on the board").
5. **Phase 5 — 템플릿·문서·카피.** 런북·dev 스텁·SKILL, `templates.test.mjs`, `npm run seed:templates`(10), §G 문서.
   검증: `npm run test:templates`, 그리고 Verification Plan의 잔존 검사 명령 셋(출력 없음이 통과).
6. **회귀 실측(사용자 몫과 함께).** 기본 그래프로 클린 사이클 1회(원장 9건 + 자동 전이 0건 — 제안 · 게이트① · `plan` note ·
   `in_review` · `validation` note · 게이트② · dev `report` note · `done` · 인수 `report` note. 스크래치 실측: 지금의 상태 기계와
   쓰기 경로를 인메모리 DB 대역 위에서 끝까지 돌린 값이고, 이 제안의 훅은 이벤트를 하나도 더하지 않는다) — 그 안에서 Inbox 되돌리기 1회
   (`in_review → planning`이 `transitionIn`의 `viaGate` 잠금에 막히지 않고 커서가 `plan`으로 돌아온다, §C.3·§C.7), 게이트 0개 그래프로
   1회(자동 전이 2건, Inbox 카드 0), `before-verify` 게이트 삽입 그래프로 1회(같은 상태 이벤트 `gate:before-verify` 1건),
   그리고 런이 없는 열린 항목(마이그레이션 전 데이터)이 있는 프로젝트에서 1회 — `pipeline_next({})` 한 번 뒤 Inbox 카드와 배너가
   돌아오고, 그 항목의 게이트를 Inbox에서 열면 커서가 다음 노드로 간다(§C.2의 `>=`). 결과는 `docs/test-reports/`에.

각 Phase는 TDD(RED → GREEN)로 진행하고, Phase 경계마다 커밋한다(2·3은 위 컴파일 단위 때문에 한 커밋). 브랜치 `harness/configurable-pipeline`, PR은 `--base dev`.

다른 활성 제안서와의 순서: `docs/proposals/active/src-server-clean-code-findings.md`(2026-09-07, `awaiting-approval`)가 같은 파일을
고친다 — `next.ts`·`runs.ts`(F03 완료 식별자·F05 호출 토큰 기록·F06), `tools.ts`·`deps.ts`(F01·F04·F05·F07), `board.ts`(F02 증거 제출의
조건부 쓰기·F10), `templates.ts`(F09 주석). 이 제안서의 Before 블록은 전부 HEAD `98efaf4` 기준이다(착수 직전 재검증에서 `aee92b2`에서 옮겼다 — `protocol.md`가 15행 늘어 §G의 인용이 밀렸고, `inbox-data.server.ts`·항목 상세 라우트는 `loadRepoRef` → `loadProjectRepository` 이름만 바뀌어 이 제안의 변경점과 겹치지 않는다. `board.ts`·`next.ts`·`board-rules.ts`·`owner-tools.ts`·`gate-source.ts`·`gate-text.ts`·`turn.ts`·core `.mjs`는 그대로다). 둘 중 **나중에 착수하는 쪽은 착수 직전에
이 검증(reconciling-proposals-with-codebase)을 다시 돌려 Before 블록을 그때의 HEAD에 맞춘다** — 특히 §C.4(`board.ts` 훅)와 §C.5(`next.ts`
run 개설)는 그쪽 F02·F03과 같은 줄을 만진다. 설계상 충돌은 없다: F02의 `updatedAt` CAS는 이 제안의 `advanceRun` 훅 **앞**에서 끝나고,
F03·F05는 `agent_next`의 입력·원장 열이라 run 개설 시점의 상한 계수(§C.5)와 독립이다.

## Verification Plan

실행할 검증:

```bash
npm test
npm run test:web
npm run test:templates
npm run check
npm run verify:fsd
npx prisma migrate dev --name pipeline_version_and_run
npm run seed:templates
npm run build   # dev 서버가 살아 있으면 건너뛰고 보고한다(메모리 규칙)
```

잔존 검사(POSIX 셸, 저장소 루트 — `docs/`는 제외한다: 제안서와 `product-copy.md`가 옛 문구를 인용한다):

```bash
grep -rn "GATE_STEP\|decideSessionGate\|sessionGate\|isGateSource\|gateTargetFor" packages plugin/bin plugin/templates/en plugin/templates/templates.test.mjs plugin/skills src scripts --include=*.ts --include=*.tsx --include=*.mjs --include=*.md
grep -rn "Continue the runbook\|(step [0-9])\|step [0-9] above\|step: [0-9]\|[Gg]ate [0-9]" plugin/templates/en plugin/skills src --include=*.md --include=*.ts --include=*.tsx --include=*.mjs
test -e plugin/templates/en/CLAUDE.runbook.free.md && echo "free runbook file still exists"; grep -rn "runbook\.free" plugin/bin plugin/skills plugin/templates src --include=*.ts --include=*.tsx --include=*.mjs --include=*.md --exclude=templates-query.test.ts
```

기대 결과: 세 명령 모두 출력이 없어야 통과.

- 첫 명령의 다섯 이름은 전부 **금지 대상**이고 허용 예외는 없다 — 한 줄이라도 나오면 옮기지 못한 호출처다(구현 전 실측: 지금은
  `review-gate/*`·`turn.ts`·`briefing.ts`·`board.ts`·`board-rules.ts`·`board-rules.test.mjs`·`owner-tools.ts`·`owner-deps.ts`의 옛 이름을 잡는다).
- 둘째 명령은 **런북 단계 번호·게이트 번호 문장**만 잡는다 — 구현 전 실측(HEAD `98efaf4`): `turn.ts` 123·125·127·129행과 `turn.test.ts`
  62·80·81·97행의 "Continue the runbook …", `CLAUDE.runbook.md` 45행 "for gate 2"·47행 "(step 5)"·71·90·96·98행(8단계 안 "Gate 1"·"gate 2"·"Gate 2", 절째로 삭제)·142행
  "`step: 3` … `step: 6`"·155행 "Gate 2 approves"·160행 "step 7 above"(§F.1), `CLAUDE.runbook.free.md` 43·44·68·82·84·85·127·132행(파일 삭제로
  사라진다), `gate-text.ts` 88행 "Gate 2 runs again"(§E.2), `owner-tools.test.mjs` 35·37행 `step: 6`·`step: 3`(§H.6), `board-rules.test.mjs`
  120·130·136행 "gate 1"·"gate 2"(§H.3), `inbox-item.test.ts` 50행 "gate 2"(§H.7). 허용 예외는 없다. 패턴을 `step [0-9]`로 넓히지 않는 이유: `dev.md` 314행 "continue to step 4", `pm.md` 118행 "from
  step 4", `SKILL.md` 17행 "before step 1", `turn.test.ts` 32행 "stops at step 4"는 각자의 절차 번호라 **남는 것**이고 이 패턴에 걸리지 않는다.
- 셋째 명령은 `packages/core`와 그 동기화 사본 `plugin/lib`를 일부러 뺀다 — `deliver.mjs`의 `RUNBOOK_FREE` 상수(§F.3 After에 남고,
  `sync:plugin-lib`가 `plugin/lib/deliver.mjs`에 같은 줄을 싣는다 — git이 추적하는 파일이다)와 `deliver.test.mjs`의 픽스처 행은 §F.3대로
  **남는 것**이라 허용 예외다. `plugin` 전체를 걸면 구현 뒤에도 `plugin/lib/deliver.mjs`의 그 줄 하나가 언제나 나와 "출력 없음"에 닿지 못한다.
  `src/server/templates-query.test.ts`도 같은 이유로 뺀다(`--exclude`) — 그 픽스처의 `CLAUDE.runbook.free.md` 행은 `deliverable`이 그 키를
  건너뛴다는 것을 증명하는 재료라 `deliver.test.mjs`의 `ROWS`처럼 **남는다**(§F.3).
  구현 전 실측(HEAD `98efaf4`): 파일 존재 한 줄 + `harness-init.test.mjs` 29행 + `templates.test.mjs` 27·178·179·243행 — 전부 §F.3대로 사라진다.

어디서 도는가(`.github/workflows/check.yml` 기준): CI는 `db:generate` → `check` → `test` → `test:web` → `build`를 돌린다. `verify:fsd`는
`check`의 `lint` 안에 있다(`eslint && node scripts/verify-fsd-boundaries.mjs`). **`test:templates`·`seed:templates`·마이그레이션은 CI에 없다**
— 템플릿 원본이 private 저장소라 로컬에서만 돈다. 그래서 위 목록은 로컬에서 전부 돌리고, PR의 `check` 워크플로는 그중 `npm test`·
`npm run test:web`·`npm run check`(`verify:fsd` 포함)·`npm run build` 넷을 다시 확인한다.

검증 기준:

- 위 명령 전부 exit 0. `check`의 lint 경고 출력 없음.
- `tools.test.mjs`의 `WEB_ONLY` 단언이 그대로 통과한다(불변식 4).
- `templates.test.mjs`가 런북에 `pipeline_next`가 있고 단계 번호 문구가 없음을 단언하고 통과한다(로컬).
- 기존 실패와 신규 실패의 구분: 이 브랜치 전 `dev`(`98efaf4`, PR #25 머지)에서 CI 명령 다섯은 green이고 `test:templates`는
  로컬 18/18이므로 실패는 전부 신규다.
- 수동: 기본 그래프의 클린 사이클이 지금과 같은 원장 9건을 남기고 `pipeline` actor 행이 0건이다(기본 그래프는
  게이트 둘 다 있으므로). 9는 이 제안 전후로 같다 — 목록은 Execution Plan 6. `board.ts` 186행 주석의 "정확히 8건"은 인수 기록
  (`acceptedAt`, 2026-09-07 마이그레이션) 전 숫자라 지금도 이미 틀렸다(§C.4에서 함께 고친다). 게이트 0개 그래프에서 pm 제안 직후
  항목이 `planning`이고 History에 `pipeline · auto`가 있다.

## Verification Results

구현 브랜치 `harness/configurable-pipeline`에서 실행했다(2026-09-10).

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm test` | PASS 134/134 | core 테스트 + `pipeline.test.mjs` |
| `npm run test:web` | PASS 217/217 | 서버·FSD 테스트. 구현 전 214에서 세 개 늘었다(레일 꼬리 순서 1 + 배너 게이트 부류 2) |
| `npm run test:templates` | PASS 18/18 | 런북 단언 + §H.8의 `doesNotMatch` 둘 |
| `npm run check` | PASS | plugin-lib --check · lint · typegen · tsc · architecture 19/19 |
| `npm run verify:fsd` | PASS | 새 슬라이스 4개의 경계 |
| `npx prisma migrate dev` | PASS | `20260910044819_pipeline_version_and_run`. `migrate status` = up to date |
| `npm run seed:templates` | PASS | `done: 10 templates` |
| `npm run build` | 건너뜀 | dev 서버가 살아 있다(:3000 → 200). `next build`가 그 서버를 죽이므로 돌리지 않았다 — CI의 `check` 워크플로가 대신 돌린다 |

잔존 검사 세 명령: 전부 출력 0행.

구현 중 발견해 고친 것(제안서 본문과 다른 자리):

- **배너의 게이트 부류가 상태로 나누면 항목이 사라진다.** `mineDetail`을 게이트 id로 나누고
  이름 없는 게이트를 전부 받는 부류를 놓았다(§E.3의 "그 밖의 게이트" 문장). `before-accept`에 선 항목은 인수 부류에서
  빼다 — 한 항목이 두 가지를 청하지 않게. 회귀 테스트 2개(`turn.test.ts`).
- **`addNode`가 `swapTail`을 조용히 푸었다.** 골격 순서로 전체를 다시 세우던 구현을 머리만 다시 세우고 꼬리는 그대로 두는
  모양으로 바꿈. 회귀 테스트 1개(`rail-state.test.ts`).
- **"waiting at <gate label>" → "waiting <gate label>".** `gateLabel`이 "before Verify"라 "waiting at before Verify"가 된다.
  전치사 하나를 빼면 레일 카드("Gate · you" + "before Verify")와 히스토리(`gate · before Implement`)가 모두 같은 라벨로 읽힐다.

## Risks and Rollback

잔여 리스크:

- **커서와 보드의 불일치.** 훅을 빠뜨린 쓰기 경로가 있으면 커서가 뒤처진다. `pipeline_next`의 지연 전진이 안전망이지만
  Inbox(즉시 읽기)는 그 사이 낡은 카드를 보일 수 있다. 완화: `advanceRun`을 부르는 자리를 §C.4에 열거했고, 순수 판정은
  `pipeline.test.mjs`가, 트랜잭션 안 순서는 회귀 실측(Execution Plan 6)이 경로마다 확인한다(§H.4 — `advanceRun`은 Prisma 없이
  단위 테스트되지 않는다).
- **자동 전이의 놀라움.** 게이트를 뺀 그래프에서는 pm 제안이 곧 dev 디스패치 대상이다. 완화: 저장 시 경고, 탭의 배지,
  History의 `pipeline · auto`. 되돌리기·Reopen은 여전히 웹에 있다.
- **상한이 한꺼번에 풀리지 않는다.** 롤링 창이라 "1일에 리셋"이 없다. 상한에 닿은 사용자는 가장 오래된 run이 창 밖으로
  나갈 때까지 기다린다. 완화: 거부 문구가 창의 뜻을 말하고, `/billing` 줄 라벨이 "per 30 days"다.
- **마이그레이션 전 항목.** 런이 없는 열린 항목은 처음 만날 때 `cursorForStatus`로 잡는다 — 그 항목이 비경계 게이트
  앞이었다면 게이트를 건너뛴 셈이 된다(그 게이트는 마이그레이션 전엔 없었으므로 손실이 아니다). 런이 생기기 **전**에는 Inbox의
  게이트 카드와 배너의 "내 차례"가 그 항목을 보이지 않는다 — 둘 다 런의 커서를 읽는다(§E.2·§E.3). 세션의 첫 `pipeline_next({})`가
  열린 항목 전부의 런을 만들므로(§D.1 판정 순서의 "런 보장") 배포 뒤 프로젝트마다 그 호출을 한 번 한다. backfill 스크립트는
  두지 않는다 — 지금 프로젝트는 소유자 것뿐이라 호출 한 번이면 되고, 호출 없이도 `board.gate`가 런을 보장한다(§C.7).
- **세션 채널의 `gate_approve` 입력 변경.** 옛 스킬·런북을 든 프로젝트가 `to`로 부르면 zod가 거부한다. 완화: 도구 설명이
  새 입력을 말하고, `/harness:init` 재실행으로 런북이 갱신된다.

롤백 방법:

- 코드는 PR revert. 마이그레이션은 표 2개 `DROP`(다른 표는 건드리지 않았다). `TransitionEvent`의 `pipeline` 행과
  `gate:` note 행은 남아도 무해하다 — 화면은 모르는 actor를 그대로 문자열로 보인다.
- 템플릿은 `Sangeok/harness-templates`의 이전 커밋으로 `seed:templates` 재실행.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [x] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. (실패 없음 — 일곱 명령 전부 green)
- [x] 잔여 리스크를 명시했다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다. (해당 없음)
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다. (해당 없음)
