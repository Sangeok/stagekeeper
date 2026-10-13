---
# Metadata. status value는 proposals/README.md의 세 상태만 사용합니다.
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-13"
approved-by: "user:Sangeok"
approved-at: "2026-10-13"
approval-scope: "Proposal 1–7 전체(Open Question 1은 제안대로 보류만 남으면 scout 분기) — 대화 승인. PR 머지·운영 시드·main 승격은 단계마다 따로 확인"
completed-at: "2026-10-13"
verification-summary: "check·test 341·web 586·CI build 녹색, 통합 106/106(기준선 103)·templates 53/53, 운영 pm 행 시드(9a292eaae9e5 = 356ce8d)와 main 승격(69dcc11) 뒤 harness-smoke ITEM-05의 board_propose가 새 사유로 거부됨"
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/architecture/protocol.md"
  - "docs/architecture/invariants.md"
  - "docs/conventions/product-copy.md"
  - "docs/test-reports/completed/2026-10-12-impl-verifier-model-rehearsal-report.md"
---

# 보류 항목은 소유자가 재개할 때까지 보류로 둔다

## Summary

지금은 pm이 보류(`on_hold`) 항목을 "retrying after hold"라는 사유로 보드에 다시 올릴 수 있다. 그래서
소유자가 건 보류가 다음 pm 실행에서 풀린다(리허설 보고서의 F7). 이 제안은 최신 행이 보류인 항목을 pm
후보에서 빼고, `board_propose`가 그 항목을 거부하게 한다. 보류된 항목을 다시 진행시키는 길은 소유자의
재개(Resume) 하나만 남는다. 그만두려면 지금처럼 백로그 탭에서 제거한다. 상태 전이 규칙(`transitions.mjs`)과
플러그인은 바꾸지 않는다.

바꾸는 것은 다음과 같다.

- 서버 판정 두 곳
- pm 템플릿 문구 세 줄
- 문서와 주석
- 시험

## Goal

- 소유자가 보류한 항목은 소유자가 재개할 때까지 보드에 다시 오르지 않는다.
- 에이전트(dev)가 막혀서 건 보류도 같다. 소유자가 결재함(Inbox)의 재개 카드로 잇는다.
- 작업 유형: 서버 판정 변경, 에이전트 템플릿 문구 변경, 문서 정합.

## Proposal Size

`proposal-size`: standard

선택 근거:

- MCP 도구 `board_propose`의 거부 조건이 하나 늘어난다(API 계약 변경).
- 이 저장소 파일 11개와 템플릿 저장소 파일 1개를 바꾼다(Affected Files).
- 롤백이 두 갈래다: 서버는 revert, 템플릿은 재시드.

## Current State

### 관측: harness-smoke run8 (2026-10-09, 운영 DB 읽기)

ITEM-05에는 보드 행이 두 개 있다.

| 행 | 사건 | 시각 (UTC) |
| --- | --- | --- |
| 첫째 | `proposed → planning` (human, web) | 2026-10-09 15:46:23 |
| 첫째 | `planning → on_hold` (agent). result "Parked by the owner until ITEM-03 is accepted; …" | 2026-10-09 16:10:24 |
| 둘째 | `→ proposed` (agent, pm). reason "Retrying after hold: …" | 2026-10-09 16:11:06 |
| 둘째 | `proposed → on_hold` (human, web) | 2026-10-12 22:56:39 |

보류 42초 뒤에 pm이 같은 백로그 항목을 새 행으로 올렸다. 첫째 행이 보류될 때 항목은 계획 단계였다. 그
단계의 보류는 에이전트 전이(`planning → on_hold`, agent)뿐이라 소유자가 직접 걸 수 없다. 그래서 dev가
소유자의 뜻을 받아 보류했다.

2026-10-13 운영 DB 전체를 읽었다. 보드 행이 있는 프로젝트는 2개이고, 보류 행은 위 두 개뿐이다. 보류 뒤
다시 올라온 항목도 ITEM-05 하나다.

### 원인: 계약끼리 어긋난다

보류 항목을 다시 올리게 하는 쪽:

- pm 템플릿 `en/agents/pm.md:99`(템플릿 저장소 `405ca54`): "`on_hold` = blocked. To propose it again,
  write "retrying after hold" in the reason". 같은 파일 `:91`의 상태 표는 보류를 거는 쪽을 "Assigned
  agent"로만 적는다. 소유자의 보류(`proposed`·`in_review → on_hold`, human)는 표에 없다.
- `src/server/pipeline/board-query.ts:192` `availableBacklogCount`는 최신 행이 미결인 항목만 뺀다. 보류는
  미결이 아니므로(`packages/core/transitions.mjs:38` `isOpen`) pm이 고를 수 있는 수에 들어간다. head는
  미결이 2건 미만이고 이 수가 1 이상이면, 그래프에 propose 노드가 있고 사용량 상한에 걸리지 않는 한 pm을
  디스패치한다(`src/server/pipeline/run-rules.ts:113`).
- `board-query.ts:301` `propose` → `src/server/pipeline/board-rules.ts:21` `decidePropose`는 최신 행이
  미결일 때만 거부한다(`:23` "already open"). 보류는 막지 않는다.
- 스키마 주석 `prisma/schema.prisma:180`: "같은 backlog 항목이 여러 번 올라올 수 있다(보류 후 재선정)".

보류를 "멈춤"으로 보는 쪽:

- `CONTEXT.md:87`: `on_hold` = "멈춰 있다. 재개하면 이어진다". 동작은 Resume planning · Resume
  implementation뿐이다.
- `docs/conventions/product-copy.md:71`: "Parked. Resume to continue". 웹 보류의 기본 노트(`:104`)도
  "Not discarded — still in the backlog. Resume to Planning or Implementing."이다.
- 웹 백로그 탭은 보드 상태가 없는 항목에만 "Put on the board"를 보인다
  (`src/fsd/pages/project-backlog/ui/project-backlog-page.tsx:38`, `row.status === null`). 상태는 폐기하지 않은
  최신 행에서 오므로, 보드에 오른 적이 없거나 폐기한 행만 있는 항목이다. 소유자는 웹에서 보류 항목을 다시
  올릴 수 없고 재개만 할 수 있다.
- 보류 항목은 결재함에 재개 카드로 뜬다(`src/fsd/entities/board-item/model/inbox-gate.ts:16`).
- 소유자가 보류 항목을 그만두려면 백로그 탭에서 제거한다. 제거 버튼은 모든 행에 있고
  (`project-backlog-page.tsx:39`), 서버는 최신 행이 미결일 때만 제거를 거부한다
  (`src/server/pipeline/board-query.ts:120`–`:122`). 보류에서 폐기(Discard)는 안 된다. 폐기는 `proposed`·
  `in_review`에서만 된다(`docs/architecture/protocol.md:261`).

pm은 보류 노트를 볼 수 없다. `backlog_list`는 상태만 돌려주고(`src/server/mcp/views.ts:14`), pm이 부르는
`board_list({ open: true })`는 보류 행을 뺀다(`board-query.ts:144`). 그래서 "노트를 존중하라"는 템플릿
규칙만으로는 고칠 수 없다.

### 다시 올리면 남는 것

다시 올리면 새 행이 생긴다. 옛 보류 행은 `on_hold`로 남고, 그 런 커서도 열린 채(`closedAt` null) 남는다.
판정과 화면은 최신 행만 보므로 당장 틀리지는 않는다. 다만 같은 항목의 계획과 보고가 두 행으로 갈라진다.

## Scope

포함 범위:

- 최신 행이 `on_hold`인 백로그 항목을 pm 후보 수에서 뺀다.
- 최신 행이 보류인 key는 `board.propose`가 거부한다. 이 함수는 MCP `board_propose`(agent)와 웹의 "Put on
  the board"(human)가 함께 부른다. 웹은 보류 항목에 그 버튼을 이미 보이지 않으므로 사람 쪽 동작은 바뀌지
  않는다.
- pm 템플릿의 보류 문구, MCP 도구 설명, protocol·invariants 문서, product-copy의 거부 사유 표(§12)와 도구
  설명 표(§13), 스키마 주석과 코드 주석.
- 순수 판정 시험과 도구 설명 고정 시험(CI), 통합 시험(로컬).

제외 범위:

- 상태 전이 규칙(`packages/core/transitions.mjs`의 `RULES`)과 그 플러그인 미러. 전이는 그대로이므로
  플러그인 판을 올리지 않는다.
- 기존 데이터 정리. harness-smoke ITEM-05의 첫째 보류 행(런 커서 `plan`, 열림)은 그대로 둔다. 최신 행이
  둘째라서 판정에 쓰이지 않는다.
- 계획·구현 중인 항목을 소유자가 웹에서 직접 보류하는 기능. Open Questions 2.
- 결재함과 배너 문구. 배너의 정적 문구(`src/fsd/widgets/turn-banner/model/turn.ts:55`)는 후보 수를 읽지
  않는다.
- 웹 백로그 탭. "Put on the board"는 보드 상태가 없는 항목에만 보이고(보류 항목에는 없다), 제거 버튼은
  그대로다.
- 검토 중(`in_review`) 폐기 뒤의 재제안. 폐기한 행은 최신 행 판정에서 빠지므로(`board-query.ts:137`
  `latestBoard`의 `discardedAt: null`) 지금처럼 다시 올릴 수 있다. 예외는 이 변경 전에 보류 뒤 다시 올린
  옛 데이터다. 그 아래에 남은 보류 행이 다시 최신 행이 되므로, 항목은 보류로 돌아가고 소유자가 그 행을
  재개하거나 백로그에서 제거해야 한다. 운영에서 이런 항목은 harness-smoke ITEM-05 하나다.

## Proposal

### 1. 순수 판정 (`src/server/pipeline/board-rules.ts`)

`ProposeInput`에 `onHold`를 더한다. 후보 수 계산은 순수 함수 `countPickable`로 옮긴다. 이 파일의 시험은
CI의 `npm run test:web`이 돌린다.

Before (`:12`–`:28`):

```ts
export type ProposeInput = {
  backlogExists: boolean;       // 항목이 있고 removedAt === null
  hasOpenRow: boolean;          // 이 key의 최신 행이 미결
  openCount: number;            // 프로젝트 전체 미결 수
  roster: readonly string[];    // Workspace.agent 집합
  agent: string;
  reason: string;
};

export function decidePropose(i: ProposeInput): Decision<null> {
  if (!i.backlogExists) return { ok: false, reason: "no such backlog item (or removed)" };
  if (i.hasOpenRow) return { ok: false, reason: "already open" };
  if (!canPropose(i.openCount)) return { ok: false, reason: `open items: ${i.openCount} (max 2)` };
  if (!i.roster.includes(i.agent)) return { ok: false, reason: `agent not in roster: ${i.agent}` };
  const bad = checkText("reason", i.reason);
  return bad ? { ok: false, reason: bad } : { ok: true, value: null };
}
```

After:

```ts
export type ProposeInput = {
  backlogExists: boolean;       // 항목이 있고 removedAt === null
  hasOpenRow: boolean;          // 이 key의 최신 행이 미결
  onHold: boolean;              // 이 key의 최신 행이 on_hold — 소유자만 재개로 잇는다
  openCount: number;            // 프로젝트 전체 미결 수
  roster: readonly string[];    // Workspace.agent 집합
  agent: string;
  reason: string;
};

export function decidePropose(i: ProposeInput): Decision<null> {
  if (!i.backlogExists) return { ok: false, reason: "no such backlog item (or removed)" };
  if (i.hasOpenRow) return { ok: false, reason: "already open" };
  if (i.onHold) return { ok: false, reason: "on hold — only the owner resumes it, on the web" };
  if (!canPropose(i.openCount)) return { ok: false, reason: `open items: ${i.openCount} (max 2)` };
  if (!i.roster.includes(i.agent)) return { ok: false, reason: `agent not in roster: ${i.agent}` };
  const bad = checkText("reason", i.reason);
  return bad ? { ok: false, reason: bad } : { ok: true, value: null };
}

// pm이 고를 수 있는 백로그 항목 수. latest는 항목별 최신 행이다(latestBoard) — 최신 행이 미결이거나
// 보류면 뺀다. 보류는 소유자의 재개로만 이어진다.
export function countPickable(backlogIds: readonly string[], latest: readonly { backlogItemId: string; status: string }[]): number {
  const taken = new Set(latest.filter((r) => isOpen(r.status) || r.status === "on_hold").map((r) => r.backlogItemId));
  return backlogIds.filter((id) => !taken.has(id)).length;
}
```

`:5`의 `@harness/core/transitions.mjs` import에 `isOpen`을 더한다. `isOpen`은 이미 내보내져 있고 타입
선언도 있다(`packages/core/transitions.d.mts:20`).

### 2. 서버 조회 (`src/server/pipeline/board-query.ts`)

Before (`:190`–`:199`):

```ts
// pm이 지금 고를 수 있는 백로그 항목 수. 제거되지 않았고, 지금 보드에 미결로 올라 있지도 않은 것.
// 후보가 없으면 head는 scout의 마지막 보고와 백로그 변화 시각으로 새 정찰 여부를 정한다.
async function availableBacklogCount(projectId: string): Promise<number> {
  const [items, board] = await Promise.all([
    prisma.backlogItem.findMany({ where: { projectId, removedAt: null }, select: { id: true } }),
    latestBoard(projectId, true),
  ]);
  const onBoard = new Set(board.map((r) => r.backlogItemId));
  return items.filter((i) => !onBoard.has(i.id)).length;
}
```

After:

```ts
// pm이 지금 고를 수 있는 백로그 항목 수. 제거되지 않았고, 최신 행이 미결도 보류도 아닌 것(countPickable).
// 후보가 없으면 head는 scout의 마지막 보고와 백로그 변화 시각으로 새 정찰 여부를 정한다.
async function availableBacklogCount(projectId: string): Promise<number> {
  const [items, board] = await Promise.all([
    prisma.backlogItem.findMany({ where: { projectId, removedAt: null }, select: { id: true } }),
    latestBoard(projectId),
  ]);
  return countPickable(items.map((i) => i.id), board);
}
```

Before (`:305`–`:311`, `propose` 안):

```ts
    const openOnly = true;
    const open = await latestBoard(projectId, openOnly, tx);
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: !!backlog && open.some((r) => r.backlogItemId === backlog.id),
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
```

After:

```ts
    const latest = await latestBoard(projectId, false, tx);
    const open = latest.filter((r) => isOpen(r.status));
    const mine = backlog ? latest.find((r) => r.backlogItemId === backlog.id) : undefined;
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: mine !== undefined && isOpen(mine.status),
      onHold: mine?.status === "on_hold",
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
```

`latestBoard`의 `openOnly`는 조회한 뒤 JS에서 거르는 인자다(`:144`). 그래서 두 판이 DB에 보내는 SQL은
같다. `Serializable` 트랜잭션이 읽는 범위도 같으므로, 상한 경합 방어(`:298`–`:300` 주석)는 그대로다.

`:11`의 `./board-rules` import에 `countPickable`을 더한다. `isOpen`은 이미 import돼 있다(`:7`).

### 3. 주석과 도구 설명

- `src/server/pipeline/run-rules.ts:104` 주석. Before "아직 보드에 안 올라간 백로그 항목 수 — pm이 고를 수
  있는 것". After "최신 행이 미결도 보류도 아닌 백로그 항목 수(countPickable) — pm이 고를 수 있는 것".
  Before는 지금도 틀리다. 보류 항목은 보드에 올라가 있는데도 이 수에 들어간다.
- `board_propose` 도구 설명. 단일 출처는 `docs/conventions/product-copy.md` §13 표의 행(`:784`)이고,
  코드는 `src/server/mcp/tools.ts:183`이다. 두 곳을 같은 문장으로 바꾼다. 설명 끝 Before "…, or the key is
  already open.". After "…, the key is already open, or the key is on hold (only the owner resumes it, on the
  web).". product-copy 쪽은 표 서식대로 `proposed`에 백틱을 유지한다.
- `src/server/mcp/tools.test.mjs:90`의 고정 목록(설명이 product-copy §13과 글자 그대로 같아야 하는 도구)에
  `"board_propose"`를 더한다. 비교는 백틱과 굵은글을 뗀 뒤 하므로(`:11`–`:15`) 두 곳이 어긋나면 CI의
  `npm run test:web`이 실패한다. 지금 이 목록에는 `board_propose`가 없어서, 설명을 한쪽만 바꿔도 잡히지 않는다.
- `prisma/schema.prisma:180` 주석. Before "(보류 후 재선정)". After "(in_review 폐기 뒤 재선정. 보류는
  재선정하지 않고 재개한다)". 주석만 바뀌었다는 것은 `prisma migrate diff`가 빈 마이그레이션(`-- This is an
  empty migration.`)을 내는지로 확인한다(Verification Plan).

### 4. 문서

- `docs/architecture/protocol.md:149` `board_propose` 행의 **거부** 목록에 "최신 행이 `on_hold`인 key"를
  더한다.
- `protocol.md:262` 부수 규칙에 한 문장을 더한다: "최신 행이 `on_hold`인 항목은 다시 올리지 않는다(서버가
  거부한다). 소유자가 재개로 잇는다."
- `protocol.md:360`의 `on_hold` 재개 절 첫머리에 같은 뜻을 한 문장 넣는다.
- `protocol.md:394`의 head 절에 "후보"의 뜻을 적는다: "후보는 제거되지 않았고 최신 행이 미결도 보류도 아닌
  백로그 항목이다." 이 절은 후보가 없을 때 scout로 가는 순서를 적고 있는데(`:394`–`:398`), 후보가 무엇인지는
  적지 않는다. 이번 변경이 그 뜻을 바꾸므로(Proposal 7) 여기에 적는다.
- `docs/architecture/invariants.md:97`의 pm 상한 항목 뒤에 한 줄을 더한다: "보류 항목도 `board_propose`가
  거부한다(재개는 소유자만)."
- `docs/conventions/product-copy.md` §12의 거부 사유 표에서 `already open` 행(`:704`) 바로 뒤에 행을 더한다:
  `` | `on hold — only the owner resumes it, on the web` | — | ``. 웹 메시지 칸이 "—"인 것은 `already open`과
  같다. 웹 propose 액션은 사유를 그대로 보여 준다(`src/fsd/features/propose-item/api/propose-item.server.ts:16`).
  보드에 없던 때 열어 둔 백로그 화면에서 누르면 이 사유가 보일 수 있다.
- `CONTEXT.md:87`과 `product-copy.md`의 상태 설명(`:71`), 보류 노트(`:104`)는 이미 이 뜻이라 바꾸지 않는다.

### 5. pm 템플릿 (템플릿 저장소 `en/agents/pm.md`)

Before (`:91`, `:99`, `:110`):

```md
| `on_hold` | Assigned agent | Blocked during planning or implementation. Stays in the backlog |
- `on_hold` = blocked. To propose it again, write "retrying after hold" in the reason
chose). Two or more open, nothing assignable, or today's proposal already open → `blocked`
```

After:

```md
| `on_hold` | Assigned agent or owner | Held — the agent was blocked, or the owner parked it. Stays in the backlog; only the owner resumes it |
- `on_hold` = held. Don't pick it: only the owner resumes it, on the web, and the server refuses to propose it
chose). Two or more open, nothing assignable (held items can't be picked), or today's proposal already open → `blocked`
```

세 줄 모두 `## step:start`(`:52`–`:115`) 안에 있다. 단계 본문은 `agent_next`가 부를 때마다 DB의
Template 행에서 읽어 나눈다(`src/server/agents/next.ts:106`). 사용자 저장소에 설치된 역할 파일에는 단계가
없다(`templates.test.mjs`가 stub에 `## step:`이 없음을 단언하고, harness-smoke의 `.claude/agents/pm.md`에도
없다). 그래서 이 행을 다시 시드하면 바로 적용되고, 재설치(`/harness:init`)는 필요 없다. Codex 역할도 같은
`agent_next` 단계를 받는다.

2026-10-13 운영 DB의 `en/agents/pm.md` 행은 `405ca54`의 파일과 같다(LF 정규화 sha256 앞 12자
`b0727c3177b5`, 양쪽 동일). 위 Before는 지금 에이전트가 받는 본문이다.

새 `{{변수}}`가 없으므로 플러그인이 먼저 나갈 필요가 없다. 이 행 하나만 부분 시드한다. 바뀐 세 줄은
`templates.test.mjs`의 단계 문구 규칙도 지킨다. 그 시험은 단계 본문이 `` `blocked` ``·`` `failed` ``를 말하는지와
`on blocked:`·`on failed:` 지시어가 1:1인지 본다(`templates.test.mjs:387`–`:389`). 바뀐 뒤에도 start 단계는
`` `blocked` ``를 말하고(pm.md `:110`, `on blocked: report` 있음) `` `failed` ``를 새로 말하지 않는다. "web
inbox"도 쓰지 않는다(`templates.test.mjs:256`).

### 6. 배포 순서

어느 순서로 나가도 보류는 지켜진다. 두 단계 사이에 생길 수 있는 일은 다음과 같다.

- 서버가 먼저 나가면: 보류 항목과 다른 후보가 함께 있는 프로젝트에서, 옛 pm 템플릿은 보류 항목을 고를 수
  있다. 그러면 `board_propose`가 거부하고, pm은 템플릿대로 서버 사유를 그대로 붙여 `failed`로 보고한다. 다음
  pm 실행에서 같은 일이 되풀이될 수 있다.
- 템플릿이 먼저 나가면: 새 pm은 보류 항목을 고르지 않는다. 다만 백로그가 모두 보류인 프로젝트에서는 옛
  서버가 pm을 계속 디스패치하고, 새 pm은 고를 것이 없어 매번 `blocked`로 끝난다. 로컬 감시기는 같은
  디스패치가 세 번 되풀이되면 멈춘다(`packages/core/watch.mjs:1` `STUCK_AFTER`).

권장 순서는 템플릿 시드 → 서버 승격이고, 두 단계를 같은 날 잇는다. 2026-10-13 운영 데이터에서 보류 항목이
있는 프로젝트는 harness-smoke 하나다. 그 프로젝트에는 보류가 아닌 후보(ITEM-04)가 있으므로, 템플릿을 먼저
내면 위의 어느 경우도 생기지 않는다.

### 7. 보류만 남았을 때 head

살아 있는 백로그가 모두 보류면 `availableBacklog`가 0이 된다. 그러면 head는 지금의 "고를 백로그가 없는"
분기로 간다(`run-rules.ts:115`–`:120`). 그 분기는 다음 순서로 판정한다.

1. Scout 노드가 이미 디스패치 중이면 `none`.
2. 자동 정찰이 꺼져 있으면 `none`.
3. 마지막 정찰 뒤 백로그가 바뀌지 않았으면 `none`.
4. 사용량 상한에 걸렸고 이어받을 scout run이 없으면 `none`.
5. 그 밖에는 feature-scout를 디스패치한다.

이 제안은 그 분기를 그대로 쓴다. pm이 고를 것이 없다는 점에서 빈 백로그와 같기 때문이다. 대안은 Open
Questions 1에 적었다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `src/server/pipeline/board-rules.ts` | update | `decidePropose`에 보류 거부, `countPickable` 추가 | low: 순수 함수이고 CI 시험이 있다 |
| `src/server/pipeline/board-rules.test.mjs` | update | 보류 거부와 후보 수 시험 | none |
| `src/server/pipeline/board-query.ts` | update | `propose` 입력과 `availableBacklogCount` | medium: `Serializable` 트랜잭션 안의 읽기. SQL은 같다 |
| `src/server/pipeline/run-rules.ts` | update (주석) | 틀린 주석 | none |
| `src/server/mcp/tools.ts` | update (설명) | 에이전트가 읽는 거부 조건 | low |
| `src/server/mcp/tools.test.mjs` | update | `board_propose` 설명을 product-copy §13에 고정 | none |
| `docs/conventions/product-copy.md` | update | §12 거부 사유 행 추가, §13 `board_propose` 설명 | low: 도구 설명의 단일 출처 |
| `prisma/schema.prisma` | update (주석) | 재선정 경로 설명 | low: 생성 클라이언트의 inlineSchema만 바뀐다 |
| `docs/architecture/protocol.md` | update | 계약 | none |
| `docs/architecture/invariants.md` | update | 서버가 강제하는 규칙 목록 | none |
| `tests/server/integration/hold-propose.test.ts` | add | 실제 DB에서 거부, 후보 수, head | none (로컬 전용) |
| 템플릿 저장소 `en/agents/pm.md` | update | 보류 문구 세 줄 | low: 시드하면 바로 적용된다 |

## Safety Analysis

확인한 항목:

- [x] `board.propose` 호출자 전수(`rg "\.propose\("`): MCP `src/server/mcp/deps.ts:44`(agent), 웹
  `src/fsd/features/propose-item/api/propose-item.server.ts:15`(human), 통합 시험. 다른 호출자는 없다.
- [x] `availableBacklogCount` 호출자: `deps.ts:85` 하나.
- [x] `decidePropose` 호출자: `board-query.ts:307` 하나. 입력 타입에 필수 필드를 더하므로, 빠진 호출이
  있으면 `tsc`가 잡는다.
- [x] 웹 화면: 보류 항목에는 "Put on the board"가 없다(`project-backlog-page.tsx:38`). 재개 카드는 그대로다.
- [x] 전이 규칙과 플러그인 미러: `transitions.mjs`를 바꾸지 않는다. `plugin/` 아래 변경은 0이다.
- [x] 마이그레이션: 없다. 스키마는 주석만 바뀐다.
- [x] 기존 시험: `tests/server/integration/backlog-add.test.ts:130`(검토 중 폐기 뒤 재제안 성공)은 그대로
  통과해야 한다. 폐기 행이 최신 판정에서 빠지기 때문이다. 같은 파일의 제거·제안 경합 시험(`:165`)은
  프로젝트 읽기 뒤에 끼어드는 훅을 쓰고, `propose`가 `latestBoard`를 부르는 횟수(한 번)는 바뀌지 않는다.
  `run-rules.test.mjs`는 `decideHead`의 입력이 숫자라서 바뀌지 않는다.
- [x] 도구 설명 문구: product-copy §13과 대조하는 시험(`tools.test.mjs:88`–`:95`)은 지금 `board_propose`를
  고정하지 않는다. 이번에 목록에 더하므로(Proposal 3), product-copy와 코드가 어긋나면 CI가 잡는다.
- [x] 금지 문구 시험(`scripts/retired-copy.test.mjs`)은 웹 소스, 스킬, product-copy의 copy-lock 블록만 본다.
  §12(`:685`)부터 §13 표 끝까지 copy-lock 표지가 없다(`rg -n "copy-lock" docs/conventions/product-copy.md`의
  줄 번호가 이 구간을 건너뛴다).
- [x] 동시성과 재실행: `propose`는 지금처럼 `Serializable` 트랜잭션 하나에서 최신 행을 한 번 읽고 판정한다.
  보류·재개 전이와 경합해도 `propose`가 보는 최신 행은 `on_hold`(보류 사유로 거부)이거나 미결("already
  open"으로 거부)이다. 그래서 보류 항목에 새 행이 생기는 순서가 없다. 거부는 아무것도 쓰지 않으므로 같은
  호출을 되풀이해도 같은 거부가 나온다. 부분 실패도 없다. 미결 상한 경합(두 pm이 동시에 제안)은 지금의
  `Serializable` 방어 그대로다(`board-query.ts:298`–`:300`). `availableBacklogCount`는 트랜잭션 밖의 읽기라
  head 판정 직후 보류가 걸릴 수 있다. 그때 pm은 디스패치되지만 `board_propose`가 거부하므로 보류는 지켜진다.
- [x] 템플릿 시험(정적 확인): `templates.test.mjs`는 pm.md의 도구 목록(`:28`), 단계 이름(`:42`), start 단계
  문구(`:278`–`:283`), 단계 문구와 지시어의 1:1(`:387`–`:389`), "web inbox" 금지(`:256`)를 본다. 바뀌는 세 줄은
  이 단언이 찾는 문구를 지우거나 새로 만들지 않는다. 실행은 Execution Plan 5에서 한다.

## Approval

승인 메모:

- 2026-10-13 대화에서 "해당 문서를 바탕으로 실제 코드 수정을 진행하라"로 승인됐다. 커밋·PR·머지, 운영 DB 시드,
  main 승격은 외부에 닿는 단계라 그때마다 따로 확인한다.
- 같은 날 단계마다 확인을 받았다. 두 PR은 소유자가 머지했다. 운영 시드는 소유자가 권한 모드를 수동으로 바꾸고
  명령마다 승인했다. main 승격과 운영 거부 확인은 대화에서 확인받았다.

## Execution Plan

1. 승인을 받으면 front matter에 기록한다.
2. 준비. 이 제안서 브랜치 `harness/hold-stays-until-resume`(origin/dev `3d6270c` 기준)의 worktree 루트에서
   Git Bash로 한다. 본 checkout은 다른 작업의 미커밋 변경이 있으므로 그 작업 트리를 건드리지 않는다.

   ```bash
   MAIN=C:/Users/hamso/OneDrive/Desktop/git/stagekeeper   # 본 checkout: node_modules와 .env, 템플릿 저장소 clone이 있다
   WT=$(git rev-parse --show-toplevel)
   MSYS_NO_PATHCONV=1 cmd /c mklink /J "$(cygpath -w "$WT/node_modules")" "$(cygpath -w "$MAIN/node_modules")"
   npx prisma generate   # src/generated는 gitignore. DB 연결 없음
   git -C "$MAIN/plugin/templates" fetch origin
   git -C "$MAIN/plugin/templates" worktree add "$WT/plugin/templates" -b harness/hold-stays-until-resume origin/main
   ```

   통합 시험에는 로컬 격리 PostgreSQL의 `stagekeeper_test_*` DB가 필요하고, `TEST_DATABASE_URL`은 `.env`에
   없다. 이 머신의 포터블 PostgreSQL 18로 버리는 DB를 띄운다. 운영과 공유하는 `.env`의 DB에는 시험 DB를 만들지
   않는다.

   ```bash
   PGBIN="$LOCALAPPDATA/Temp/stagekeeper-backlog-postgres/package/native/bin"
   PGDIR=$(mktemp -d)
   "$PGBIN/initdb.exe" -D "$(cygpath -w "$PGDIR/data")" -U postgres --auth=trust -E UTF8 --no-locale > "$PGDIR/initdb.log" 2>&1
   # 출력을 파이프로 받지 않는다. 서버가 파이프를 쥐고 있어 명령이 끝나지 않는다
   "$PGBIN/pg_ctl.exe" -D "$(cygpath -w "$PGDIR/data")" -o "-p 55432 -c listen_addresses=127.0.0.1" -l "$(cygpath -w "$PGDIR/server.log")" -w start > /dev/null 2>&1
   node -e 'const { Client } = require("pg"); const c = new Client({ connectionString: "postgresql://postgres@127.0.0.1:55432/postgres" }); c.connect().then(() => c.query("CREATE DATABASE stagekeeper_test_hold")).then(() => c.end())'
   export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/stagekeeper_test_hold   # 로컬 trust DB라 비밀이 아니다
   ```
3. 구현 worktree에서 Proposal 1~4를 구현하고, 시험 두 가지를 더한다.
   - `board-rules.test.mjs`:
     - `base`(`:5`)에 `onHold: false`를 더한다.
     - `decidePropose`가 `onHold: true`를 거부하고 사유가 `on hold — only the owner resumes it, on the web`과
       같은지 확인한다.
     - `countPickable`이 최신 행이 미결이거나 보류인 항목은 빼고, 보드에 없는 항목은 센다는 것을 확인한다.
   - `tests/server/integration/hold-propose.test.ts`(새 파일). `support.ts`의 `fixture(db, { status:
     "on_hold" })`로 만들고, `finally`에서 `cleanup(db, f?.userId)`로 지운다(같은 디렉터리 시험의 방식).
     - `createBoardService(db).propose`가 agent(`{ actor: "agent", actorRef: "pm" }`)와 human(`{ actor:
       "human", actorRef: f.userId, channel: "web" }`) 모두 보류 사유로 거부된다.
     - `availableBacklogCount`가 0이다.
     - `createToolDeps(db).pipelineNext(f.projectId, undefined)`의 `head`가 pm 디스패치가 아니다.
     - 백로그 항목을 하나 더하면 후보 수가 1이 되고, head가 pm을 디스패치한다.
     - 같은 백로그 항목에 `proposedOn`이 더 늦은 보류 행을 하나 더 만든 옛 데이터 모양에서도 위 결과가 같다.
     - 소유자가 재개하면(`service.transition(f.projectId, { key: f.key, to: "planning" }, { actor: "human",
       actorRef: f.userId, channel: "web", expectedUpdatedAt: f.updatedAt })`, Caller 모양은
       `board-query.ts:40`–`:41`) 그 key의 `propose`는 "already open"으로 거부된다.
4. Verification Plan의 "저장소 검사"를 모두 돌린다. 그 뒤 `gh pr create --base dev`로 PR을 열고, `check`의
   네 부분(static·test·test-web·build)이 모두 녹색이면 머지한다. 빌드는 이 CI 결과로만 확인한다(Verification
   Plan).
5. 템플릿을 바꾼다.
   - 2에서 만든 `$WT/plugin/templates`(템플릿 저장소 worktree)에서 `en/agents/pm.md`의 세 줄을 Proposal 5대로
     고친다. `templates.test.mjs`가 `../../packages/core`를 import하므로 이 위치여야 한다.
   - 구현 worktree 루트에서 Verification Plan의 "템플릿 검사"를 돌린다.
   - 템플릿 저장소에서 `harness/hold-stays-until-resume` → `main` PR을 열고 머지한다. 머지 커밋을 `M`이라 한다.
6. pm 행 하나를 부분 시드한다. 명령은 구현 worktree 루트에서 돌린다.

   ```bash
   SEED=$(mktemp -d)/seed
   git -C "$MAIN/plugin/templates" fetch origin
   M=$(git -C "$MAIN/plugin/templates" rev-parse origin/main)   # 5에서 머지한 커밋이어야 한다
   git -C "$MAIN/plugin/templates" log -1 --oneline "$M"         # 제목이 5의 머지인지 눈으로 확인한다
   git -C "$MAIN/plugin/templates" worktree add --detach "$SEED" "$M"
   mkdir -p "$SEED/.seed-pm/en/agents" && cp "$SEED/en/agents/pm.md" "$SEED/.seed-pm/en/agents/pm.md"
   # DB 없는 사전 검사. 1이 나와야 한다
   node --import tsx -e "import('./scripts/lib/template-seed-query.ts').then((m) => console.log((m.readTemplateSources ?? m.default.readTemplateSources)(process.argv[1]).length))" "$SEED/.seed-pm"
   # 운영 DB 쓰기. 소유자가 직접(`!`) 실행한다
   DOTENV_CONFIG_PATH="$MAIN/.env" npm run seed:templates -- --dir "$SEED/.seed-pm"
   # 기대 출력: done: 1 templates atomically seeded from $M의 전체 해시
   # 운영 pm 행과 M의 파일 대조(읽기). 두 줄이 같아야 한다
   DOTENV_CONFIG_PATH="$MAIN/.env" node --import tsx -e "Promise.all([import('node:crypto'), import('./scripts/lib/prisma.ts')]).then(([c, m]) => (m.withPrisma ?? m.default.withPrisma)((p) => p.template.findUnique({ where: { lang_path: { lang: 'en', path: 'agents/pm.md' } }, select: { body: true } })).then((r) => console.log(c.createHash('sha256').update(r.body.replace(/\r/g, '')).digest('hex').slice(0, 12))))"
   git -C "$SEED" show HEAD:en/agents/pm.md | tr -d '\r' | sha256sum | cut -c1-12
   ```

   - 5의 머지 뒤 템플릿 저장소 `main`에 다른 머지가 들어왔다면 `M`에 5의 머지 커밋을 직접 넣는다. `.seed-pm`은
     점으로 시작하므로 전체 시드가 건너뛰고, Git 작업 트리 안이므로 시드 스크립트의 `git -C <dir> rev-parse
     HEAD`가 `M`을 기록한다(`scripts/seed-templates.ts:22`).
   - `done:` 줄이 없으면 멈춘다. 시드 스크립트는 실패 원인을 숨긴다(`scripts/seed-templates.ts:30`).
   - Codex 런북이 시드에 없으므로 `--snapshot`은 필요 없다(`scripts/seed-templates.ts:16`).
7. dev를 main으로 승격한다. 본 checkout에서 `git switch main`을 하면 미커밋 변경이 따라오므로, 깨끗한
   worktree에서 같은 ff 승격을 한다.

   ```bash
   git -C "$MAIN" fetch origin
   git -C "$MAIN" diff --stat origin/main origin/dev -- prisma/migrations   # 출력 없음 = 이 승격에 마이그레이션 없음
   P=$(mktemp -d)/promote
   git -C "$MAIN" worktree add "$P" main
   git -C "$P" merge --ff-only origin/dev && git -C "$P" push origin main
   git -C "$MAIN" worktree remove "$P"
   ```

   AGENTS.md의 `git switch main && git merge --ff-only dev && git push origin main`과 같은 결과다. 운영 배포는
   main push에서 바로 일어난다.
8. 운영에서 확인한다.

   ```bash
   gh api "repos/Sangeok/stagekeeper/deployments?environment=Production&per_page=1" --jq '.[0].sha'   # 7에서 올린 커밋
   ID=$(gh api "repos/Sangeok/stagekeeper/deployments?environment=Production&per_page=1" --jq '.[0].id')
   gh api "repos/Sangeok/stagekeeper/deployments/$ID/statuses" --jq '.[0].state'                    # success
   ```

   - 두 값이 맞은 뒤에만, harness-smoke 디렉터리에서 연 Claude Code 세션(그 프로젝트 토큰의 harness MCP,
     `HARNESS_SERVER=https://stagekeeper.dev`)에서 `mcp__harness__board_propose({ project: "harness-smoke",
     key: "ITEM-05", agent: "dev", reason: "Post-deploy hold check" })`를 한 번 부른다. 기대는 오류
     `on hold — only the owner resumes it, on the web`이다.
   - 이 호출이 성공하면 새 `proposed` 행이 생긴 것이다. 그 행은 웹에서 보류한다. 폐기하지 않는다. `proposed`
     폐기는 백로그 항목까지 제거한다(`docs/architecture/protocol.md:392`).
9. 정리한다. 2의 시험 DB는 `"$PGBIN/pg_ctl.exe" -D "$(cygpath -w "$PGDIR/data")" -m fast -w stop > /dev/null 2>&1`로
   끄고 `rm -rf "$PGDIR"`로 지운다. 6의 `$SEED` worktree는 `git -C "$MAIN/plugin/templates" worktree remove --force "$SEED"`로
   지운다(`.seed-pm`이 추적되지 않는 파일이라 `--force`가 필요하다). 2의 템플릿 worktree는 PR 머지 뒤
   `git -C "$MAIN/plugin/templates" worktree remove "$WT/plugin/templates"`로 지운다. 구현 worktree를 지우기
   전에는 정션을 먼저 끊는다:
   `MSYS_NO_PATHCONV=1 cmd /c rmdir "$(cygpath -w "$WT/node_modules")"`. 정션을 둔 채 지우면 본 checkout의
   `node_modules`가 지워질 수 있다.

## Verification Plan

실행할 검증(구현 worktree 루트, Git Bash, Execution Plan 2의 준비 뒤). 저장소 검사는 Execution Plan 4에서,
템플릿 검사는 pm.md를 고친 뒤인 Execution Plan 5에서 돌린다.

```bash
# ── 저장소 검사 ──
# CI의 check 네 부분 중 셋. 넷째인 build는 아래 설명대로 PR의 CI에서 확인한다
npm run check            # plugin-lib 검사, lint(verify:fsd 포함), typegen, tsc, test:architecture, test:project-availability
npm test
npm run test:web         # board-rules.test.mjs와 tools.test.mjs 포함

# 로컬 전용 통합 시험
npm run test:server:integration   # TEST_DATABASE_URL 필요. hold-propose.test.ts와 backlog-add.test.ts 포함

# 스키마 주석만 바뀌었는지(DB 연결 없음)
BASE=$(mktemp --suffix=.prisma)
git show origin/dev:prisma/schema.prisma > "$BASE"
npx prisma migrate diff --from-schema "$BASE" --to-schema prisma/schema.prisma --script   # 빈 줄을 빼면 마지막 줄: -- This is an empty migration.

# 옛 것 없음(출력 없음이 기대)
rg -n "or the key is already open\." src/server/mcp/tools.ts docs/conventions/product-copy.md
rg -n "보류 후 재선정" prisma/schema.prisma
rg -n "const openOnly = true" src/server/pipeline/board-query.ts
git diff --stat origin/dev -- plugin/

# 새 것 있음(두 파일 모두에서 나와야 한다)
rg -n "countPickable" src/server/pipeline/board-query.ts src/server/pipeline/board-rules.ts
rg -n "on hold — only the owner resumes it, on the web" src/server/pipeline/board-rules.ts docs/conventions/product-copy.md

# ── 템플릿 검사(Execution Plan 5) ──
npm run test:templates                               # 템플릿 worktree를 plugin/templates에 둔 상태
rg -n -i "retrying after hold" plugin/templates/en   # 출력 없음이 기대
```

`npm run build`는 이 worktree에서 돌리지 않는다. Execution Plan 2의 `node_modules`는 본 checkout을 가리키는
정션인데, Turbopack이 이를 거부한다(`Symlink [project]/node_modules is invalid, it points out of the filesystem
root`, 2026-10-13 실측, 이 제안의 변경과 무관). 빌드는 PR의 CI `check (build)` 부분이 같은 `npm run build`로
돌리므로(`.github/workflows/check.yml:28`–`:29`), Execution Plan 4에서 그 결과로 확인한다.

요구 사항과 그것을 잡는 시험:

| 요구 | 틀리면 실패하는 시험 | 실행 위치 |
| --- | --- | --- |
| R1 최신 행이 보류인 key는 propose가 거부된다 | `board-rules.test.mjs`의 보류 거부; `hold-propose.test.ts`의 agent·human 거부 | CI / 로컬 |
| R2 보류 항목은 pm 후보 수에서 빠진다 | `board-rules.test.mjs`의 `countPickable`; `hold-propose.test.ts`의 후보 수 0 → 항목 추가 뒤 1 | CI / 로컬 |
| R3 보류만 남으면 head가 pm을 부르지 않는다 | `hold-propose.test.ts`의 `pipelineNext` head | 로컬 |
| R4 보류 행이 둘인 옛 데이터도 최신 행으로 판정한다 | `hold-propose.test.ts`의 보류 행 둘 | 로컬 |
| R5 검토 중 폐기 뒤 재제안은 그대로 된다 | `backlog-add.test.ts:130`(기존) | 로컬 |
| R6 재개하면 정상 흐름으로 돌아간다 | `hold-propose.test.ts`의 재개 뒤 "already open" | 로컬 |
| R7 pm이 보류 항목을 고르지 않는다 | 자동 시험 없음. 모델이 어겨도 R1이 막는다 | — |
| R8 `board_propose` 설명이 product-copy §13과 같다 | `tools.test.mjs`의 고정 목록(Proposal 3) | CI |
| R9 플러그인 파일은 바뀌지 않는다 | `git diff --stat origin/dev -- plugin/`의 빈 출력 | 로컬 |
| R10 운영 pm 행이 머지 커밋 `M`의 판이다 | Execution Plan 6의 해시 대조 | 운영(읽기) |
| R11 배포된 서버가 보류 항목을 거부한다 | Execution Plan 8 | 운영 |

검증 기준:

- 위 명령이 모두 통과한다. "옛 것 없음" 줄은 출력이 없어야 하고, "새 것 있음" 줄은 두 파일 모두에서 나와야
  한다. `migrate diff`는 빈 줄을 빼면 `-- This is an empty migration.`으로 끝나야 한다(그 앞에 `Loaded Prisma
  config from prisma.config.ts.`가 나온다).
- 기존 실패와 신규 실패를 가르기 위해, 같은 저장소 명령을 origin/dev(`3d6270c`)에서 한 번 돌려 기준선으로 둔다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | 통과 (2026-10-13) | test:architecture 44 통과·2 건너뜀, test:project-availability 18/18 |
| `npm test` | 통과 (2026-10-13) | 341 통과·2 건너뜀·실패 0 |
| `npm run test:web` | 통과 (2026-10-13) | 586/586 (판정 시험 2건과 `board_propose` 고정 포함) |
| `npm run build` | 통과 (2026-10-13) | 로컬에서는 돌리지 않음. PR #139의 CI `check (build)` 녹색. dev push(`69dcc11`)의 `check`·`windows-role-runtime`도 success |
| `npm run test:server:integration` | 통과 (2026-10-13) | 106/106. origin/dev 기준선은 103/103. 옛 `board-query.ts`로 되돌리면 새 시험 2건이 실패한다 |
| `npm run test:templates` | 통과 (2026-10-13) | 53/53 (변경 전에도 53/53) |
| `prisma migrate diff` | 통과 (2026-10-13) | `-- This is an empty migration.` |
| "옛 것 없음"·"새 것 있음" 검사 | 통과 (2026-10-13) | 옛 것 출력 없음 3건·`plugin/` 변경 0, 새 것은 두 파일 모두 |
| 부분 시드와 해시 대조(Execution Plan 6) | 통과 (2026-10-13) | 사전 검사 1행. `done: 1 templates atomically seeded from 356ce8dc…`. 운영 pm 행 `9a292eaae9e5`는 `M`=`356ce8d`의 파일과 같다(시드 전 `b0727c3177b5`). 첫 시도는 실패했다(Completion Notes) |
| 배포 확인과 거부 확인(Execution Plan 8) | 통과 (2026-10-13) | Production 배포 `69dcc11` success(03:14Z). ITEM-05 `board_propose` → `on hold — only the owner resumes it, on the web`. 다시 읽은 최신 행은 2026-10-12의 보류 행 그대로였다 |

## Risks and Rollback

잔여 리스크:

- 에이전트가 막혀서 건 보류를 pm이 더는 자동으로 다시 시도하지 않는다. 소유자가 결재함에서 재개해야
  이어진다. 보류 항목은 결재함 카드와 뱃지로 보이지만, 배너는 차지하지 않는다(`product-copy.md:187`).
- 살아 있는 백로그가 모두 보류면 자동 정찰이 새 항목을 찾아 올 수 있다(Proposal 7).
- 모델이 새 템플릿 문구를 어길 수 있다. 그래도 서버가 거부하고, pm은 `failed`로 끝난다.
- 템플릿 시드와 서버 승격 사이에는 Proposal 6의 일이 생길 수 있다. 실제 간격은 시드(03:06Z)에서 배포(03:14Z)까지
  약 7분이었다. 배포 뒤 harness-smoke 보드에는 새 행이 없었다(ITEM-04는 보드에 오른 적 없음, ITEM-05는 보류 그대로).
- 보류 항목을 백로그에서 제거해도 그 보드 행은 `on_hold`로, 런 커서는 열린 채 남는다. 지금 동작과 같고, 이
  제안은 바꾸지 않는다.
- 보류 행이 둘인 옛 데이터(harness-smoke ITEM-05)에서 새 행을 재개했다가 검토 중에 폐기하면, 옛 보류 행이
  다시 최신 행이 되어 항목이 보류로 돌아간다(Scope의 제외 범위). 옛 행은 계획 단계에서 보류됐으므로(런 커서
  `plan`) 화면의 주 버튼은 계획 재개다(`docs/architecture/protocol.md:363`).

롤백 방법:

- 서버: 구현 PR을 되돌리는 revert PR을 dev에 넣고 Execution Plan 7과 같은 방식으로 main에 ff 승격한다.
- 템플릿: Execution Plan 6과 같은 절차로 `405ca54`의 `en/agents/pm.md`를 부분 재시드한다(`M=405ca54`로 두고
  `rev-parse` 줄은 건너뛴다). 해시 대조 기대값은 `b0727c3177b5`다.
- 데이터 변경이 없으므로 DB 복구는 필요 없다.

## Completion or Closure Notes

완료 기록:

- completed-at: 2026-10-13
- verification-summary: front matter와 같다. 명령별 결과는 *Verification Results*에 있다.
- implementation PR/commit
  - 구현과 제안서: #139(`harness/hold-stays-until-resume` → dev, 머지 `69dcc11`). 커밋은 `641550f`(서버 판정·조회,
    시험, 도구 설명, product-copy, 스키마 주석), `d961594`(protocol·invariants), `0c60780`(승인된 제안서와 검증 결과).
  - 템플릿: harness-templates #12(`5559d09`, 머지 `356ce8d`).
  - 운영 템플릿의 `en/agents/pm.md` 한 행을 `356ce8d`로 시드했다. 이어 `main`을 `6d16410`에서 `69dcc11`로
    fast-forward 승격했다. 이 승격에는 #138(impl-verifier 완료 문서)도 함께 들어갔다.
- changed files summary
  - 공개 저장소 12개 파일: `board-rules.ts`(보류 거부, `countPickable`), `board-query.ts`(`propose` 입력과 후보 수),
    `run-rules.ts`·`schema.prisma` 주석, `tools.ts` 설명과 `tools.test.mjs` 고정 목록, `product-copy.md` §12·§13,
    `protocol.md`, `invariants.md`, 판정 시험, 새 통합 시험 `hold-propose.test.ts`, 이 제안서.
  - private 템플릿: `en/agents/pm.md` 세 줄(상태 표, 보류 규칙, pick 단계의 blocked 결과).
- 계획과 달라진 실행
  - Execution Plan 6: `DOTENV_CONFIG_PATH=… npm run seed:templates`는 PowerShell에서 돌지 않는다. 그래서 같은
    효과의 `node --env-file="$MAIN/.env" --import tsx scripts/seed-templates.ts --dir …`로 실행했다. 먼저 같은
    형태로 읽기 질의를 돌려 같은 운영 DB에 닿는지 확인했다. 시드 디렉터리는 `mktemp -d` 대신 세션 scratchpad에 두었다.
  - 운영 시드는 자동 권한 모드가 공유 자원 변경으로 거부했다. 소유자가 수동 모드로 바꾸고 명령마다 승인했다.
  - 첫 시드 시도는 원인을 숨긴 채 exit 1로 끝났다(`scripts/seed-templates.ts`가 오류를 출력하지 않는다). 같은
    단계를 밟고 커밋 전에 throw로 롤백하는 진단을 두 번 돌렸다. 스냅숏 읽기와 upsert는 정상이었고, 운영 행은
    `b0727c3177b5` 그대로였다. 재시도는 성공했다. 첫 실패의 원인은 확인하지 못했고, 커밋 시점의 일시적 오류로 본다.
  - Execution Plan 8의 `board_propose`는 harness-smoke 디렉터리의 세션 대신, 같은 운영 서버
    (`https://stagekeeper.dev/api/mcp`)에 user 토큰으로 붙은 세션에서 `project: "harness-smoke"`로 불렀다.
    판정은 같은 `decidePropose`를 지난다.
- remaining follow-up
  - Open Questions 1·2. 보류만 남았을 때 정찰 대신 "재개하라"는 사유를 낼지와, 계획·구현 중인 항목을 소유자가
    웹에서 직접 보류할 수 있게 할지다.
  - 시드 스크립트가 실패 원인을 숨기는 문제(리허설 보고서 F5)가 이번 시드에서도 진단 비용을 키웠다.
  - harness-smoke ITEM-05의 첫째 보류 행(런 커서 `plan`, 열림)은 그대로 두었다(Scope의 제외 범위).

## Review Checklist

- [x] 모든 `{placeholder}`와 `TBD`를 처리했고, 완료 상태에 맞게 갱신했다.
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
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. 시험의 새 실패는 없다. 첫 시드 시도의 실패는 재시도로
  풀렸고 Completion Notes에 적었다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [x] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.

## Open Questions

1. **보류만 남았을 때 자동 정찰을 돌릴지.** 이 제안은 돌린다(Proposal 7, 빈 백로그와 같은 분기). 대안은
   head가 `none`과 함께 "Resume a held item on the web" 같은 사유를 내는 것이다. 그러려면 새 사유 문구와
   배너 처리가 필요해서 이번 범위에서 뺐다.
2. **계획·구현 중인 항목을 소유자가 웹에서 직접 보류할 수 있어야 하는지.** run8에서는 이 길이 없어서 dev가
   대신 보류했다. 이번 변경으로 그렇게 건 보류도 지켜지므로 급하지 않다. 필요하면 별도 제안서로 다룬다.
