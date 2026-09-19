---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-09-19"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/pipeline-agent-slots.md"
  - "docs/proposals/active/src-server-clean-code-findings.md"
  - "docs/proposals/completed/2026-09-10-configurable-pipeline.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/fsd.md"
  - "docs/conventions/product-copy.md"
---

# 역할 카탈로그 — 사용자가 에이전트를 선언하고, 서버가 그 절차를 소유한다

## Summary

슬롯 파이프라인(`pipeline-agent-slots.md`, Core 1단계)은 앵커 사이에 자유 슬롯을 열었지만,
**그 슬롯에 놓을 수 있는 에이전트는 `doc-auditor`·`feature-scout` 둘뿐이다.** 원인은 두 줄이다 —
roster 에이전트는 예외 없이 `agents/dev.md`를 받고(`src/server/agents/next.ts:91`), 모든
워크스페이스는 `path`와 검증 명령 하나 이상을 반드시 가져야 한다(`packages/core/workspaces.mjs:17,21`).
그래서 코드 경로를 소유하지 않는 리뷰어는 선언조차 되지 않는다.

이 제안은 워크스페이스에 **`role`** 을 더한다. `role: "dev"`(기본, 생략 시)는 지금 그대로이고,
`role: "review"`는 `path`·`verify` 없이 선언되며 `criteria`(판단 기준 문서)와 `scope`(볼 범위)를 갖는다.
서버는 `role`로 대본을 고르고, 그 대본은 "기준 문서를 읽고 적용하라 + 증거·보고 규칙"만 소유한다.
**판단 기준은 사용자 저장소의 문서**에 있고 **단계 본문은 계속 서버가 소유한다** — 2026-09-10
결정 #1이 지키려던 두 가지가 그대로 유지된다.

바뀌지 않는 것: 보드 상태 6종, 게이트는 사람만(불변식 4), 증거 없는 상태 주장 금지, 선형 체인
(결정 #5), 슬롯 id와 게이트 id 체계, `validation_record`가 요구하는 고정 `plan-verifier`.

## Goal

- 사용자가 `harness.json`에 **리뷰어를 선언**하고 파이프라인 슬롯에 놓는다. 코드 리뷰·설계 검토·
  문서 검토를 `criteria`와 `scope`로 가른다.
- 절차 본문은 서버가, 판단 기준은 사용자 저장소가 소유한다는 분리선을 코드로 고정한다.
- 기존 `harness.json`은 한 글자도 바꾸지 않아도 동작한다(`role` 없음 = `dev`).
- 작업 유형: 순수 규칙 확장(`packages/core/workspaces.mjs`), 스키마 열 추가와 `path` nullable 전환,
  MCP 입력·DTO 확장, 서버 분기 변경, 생성기 렌더 루프 변경, 역할 대본 신설, 웹 roster 분리, 문서·카피 갱신.

## Proposal Size

`proposal-size`: `standard`

선택 근거:

- 마이그레이션(열 추가 + `Workspace.path` non-null → nullable), API 계약 변경(`project_sync` 입력,
  `project_get` DTO), 5개 초과 파일 변경, `plugin/lib` 미러 동기화.
- 롤백이 단순 revert가 아니다 — `role: "review"`로 저장된 행이 남으면 구형 코드가 `path`를 non-null로
  기대한다(Risks 절).

## Current State

2026-09-19 기준 `dev` `38dda43`에서 읽은 현재 코드다.

### 리뷰어를 선언할 수 없다

`packages/core/workspaces.mjs`의 `validateWorkspaceSemantics`가 워크스페이스마다 요구하는 것:

```js
if (!Array.isArray(w.verify) || w.verify.length === 0) fail(`${at}.verify`, "at least one verify command");  // :17
// …
id: str(w.id, `${at}.id`), path: str(w.path, `${at}.path`), agent,                                            // :21
```

`path`와 `verify`가 무조건 필수다. `REPORT_AGENTS`(`pm`·`plan-verifier`·`doc-auditor`·`feature-scout`)는
예약어로 거부된다(`:14`). `Workspace` 모델의 `path`도 non-null이다.

### roster에 있으면 무조건 dev 대본이다

`src/server/agents/next.ts:91`:

```ts
const path = roster.includes(agent) ? "agents/dev.md" : `agents/${agent}.md`;
```

`runs.ts:20-25`의 `template()`은 `Template` 테이블을 `(lang, path)`로 조회하고 언어 폴백만 한다 —
**대본을 고르는 분기는 위 한 줄뿐**이다.

### roster 에이전트는 남의 항목을 볼 수 없다

`next.ts:83-86`:

```ts
if (key !== null && roster.includes(agent)) {
  const owner = await deps.itemAgent(projectId, key);
  if (owner !== null && owner !== agent) return fail(`item ${key} belongs to \`${owner}\`, not \`${agent}\``);
}
```

`plan-verifier`가 남의 항목을 검사할 수 있는 이유는 roster 밖이라 이 검사를 건너뛰기 때문이다.

### 항목 단위 여부가 보드 상태 결합에서 파생된다

`next.ts:52-53`:

```ts
const needsKey = (parsed: ParsedTemplate) =>
  parsed.steps.some((s) => s.requires.some((r) => STATUSES.includes(r) || r === "verify-ok"));
```

`steps.ts:21-22`의 어휘는 `[...STATUSES, "verify-ok", "can-propose"]`다. "항목 단위인데 상태는 안 따짐"이
표현 불가능하다.

### roster는 한 종류뿐이다

`Workspace.agent[]`가 그대로 여러 곳에 흘러간다 — `decidePropose`의 배정 검사
(`board-rules.ts:35` `agent not in roster`), 웹 propose 드롭다운(`propose-button.tsx:17,39-40`),
Team 행(`briefing.ts:133,143-145`), 레일의 노드 담당자 표시(`labels.ts:17-18`),
`allowsAgent`의 플랜 검사(`entitlement.mjs:139-142`). **dev 전용 목록과 전체 목록의 구분이 없다.**

### 전달 경로

`harness.json` → 생성기(`harness-init.mjs:115-116`가 워크스페이스마다 `agents/dev.md`를 렌더해
`.claude/agents/<agent>.md`로 쓴다) → `project_sync`(`tools.ts:75`의 zod, `:17`의 `WorkspaceInput`) →
`syncProject`(upsert만, 삭제 없음) → `Workspace` → `project_get`(`project-query.ts`의 `PROJECT_GET_SELECT`) →
`serverVars`(`agents/vars.ts`) → `buildWorkspaceVars`(`vars.mjs:17-37`, `ws.path`·`ws.verify_block`·
`ws.out_of_scope_list`가 전부 경로 중심) → 단계 본문.

### 스텁 경계

`deliver.mjs:16`:

```js
const agentOf = (path) => /^agents\/([^/]+)\.md$/.exec(path)?.[1] ?? null;
```

이 정규식에 걸려야 `stubOf`로 잘린다. `agents/roles/review.md`처럼 슬래시가 하나 더 있으면
**본문 전체가 사용자 저장소로 내려간다** — Phase 4의 "단계 본문은 파일로 나가지 않는다"가 깨진다.

### `docs/reviews/`는 없다

`criteria`가 가리킬 문서는 아직 저장소에 없다. 사용자가 만드는 파일이다.

### 이 제안이 딛는 계약은 아직 인수 전이다

`packages/core/workspaces.mjs`와 `createToolDeps`·`createNextDeps`·`createBoardService`는
`src-server-clean-code-findings.md`(`stage: approved`, 2026-09-16 승인)의 E1~E4가 만든 것이고
그 문서는 아직 `active/`에 있다. 코드는 들어왔지만 **그 제안서의 남은 작업이 검증과 배포 인수**다 —
`npm run test:server:integration` 미실행, D3 복구 리허설 미실행, 배포 인수 A1~A5 미완.

즉 이 제안은 **end-to-end로 인수되지 않은 계약 위에 얹힌다.** 코드 충돌은 없다(겹치는 E4는 구현
완료이고, 이 문서의 Current State는 그 결과물을 읽은 것이다). 남는 것은 순서 의존이다.

## Scope

포함 범위:

- `packages/core/workspaces.mjs` — `role`·`criteria`·`scope` 검증, `path`/`verify`의 role 조건부화.
- `packages/core/vars.mjs` — role별 변수 집합.
- 스키마 — `Workspace`에 `role`·`criteria`·`scope` 추가, `path` nullable 전환. 마이그레이션 1건.
- `src/server/mcp/` — `tools.ts`(zod·`WorkspaceInput`), `project-sync-query.ts`, `project-query.ts`.
- `src/server/agents/` — `next.ts`(대본 경로·소유 검사·`needsKey`), `steps.ts`(`requires: item`), `vars.ts`.
- `src/server/pipeline/board-rules.ts` — `decidePropose`의 dev roster 분리.
- 웹 — `propose-item`(dev roster만), `project-board/model/briefing.ts`(Team), `entities/pipeline/model/labels.ts`.
- 생성기 — `harness-init.mjs`의 워크스페이스 렌더 루프.
- 템플릿 — `agents/review.md` 신설.
- 문서·카피 — `protocol.md`, `invariants.md`, `product-copy.md`, `fsd.md`(필요 시).
- `plugin/lib` 미러 동기화(`npm run sync:plugin-lib`).

제외 범위:

- **쓰는 역할.** 테스트 작성 등 `implementing` 구간에서 코드를 쓰는 역할은 이 제안에 없다 —
  `dev.md` B-4가 이미 테스트를 쓰고, 떼어내면 `report_submit`의 verify 벽(`board-rules.ts:140`)이
  요구하는 "같은 행위자"가 쪼개지며, 인수 조건 #2의 diff 대조 단위를 다시 정의해야 한다.
- **사용자가 단계 대본을 직접 쓰는 것.** 대본은 계속 서버 카탈로그다.
- 새 보드 상태, 자유 DAG, 슬롯/게이트 id 체계 변경.
- `criteria` 문서의 내용 규약. 사용자가 쓰는 문서이고 서버는 경로만 안다.
- 플랜 축 신설. 리뷰어는 `workspaces` 축이 그대로 센다.

## Proposal

### A. `harness.json`의 워크스페이스에 role

```json
{ "id": "web", "agent": "web-dev", "role": "dev",
  "path": "src/web", "verify": ["npm test"], "knowledge": "src/web/CLAUDE.md" }

{ "id": "cr", "agent": "code-reviewer", "role": "review",
  "criteria": "docs/reviews/code.md", "scope": ["src/**"] }
```

- `role` 없음/`null` → `"dev"`. **기존 `harness.json`은 무변경으로 동작한다.**
- `role: "dev"` — `path`·`verify` 필수(지금과 동일).
- `role: "review"` — `path`·`verify`를 **요구하지 않는다**. `criteria` 필수(문자열, 저장소 상대 경로),
  `scope` 선택(문자열 배열, 없으면 저장소 전체).
- 예약어는 넓힌다: `REPORT_AGENTS` + `main-loop` + 앵커 이름(`plan`·`implement`·`accept`·`propose`·
  `verify`) + `before-` 접두. 앵커·게이트 id와 에이전트 이름이 섞이면 슬롯 id가 모호해진다.
- `AGENT_ID_RE`와 중복 검사는 그대로다.

### B. 스키마

```prisma
model Workspace {
  path      String?   // role이 dev일 때만 채워진다
  role      String?   // dev | review. null은 dev로 읽는다(기존 행 호환)
  criteria  String?   // role review의 판단 기준 문서 경로
  scope     String[]  @default([])
}
```

`path`의 non-null → nullable 전환이 이 제안의 유일한 파괴적 스키마 변경이다. 기존 행은 값이 있으므로
backfill이 없다. `role`이 `null`인 행은 `dev`로 읽으므로 의미도 보존된다.

### C. 대본은 role이 고른다 — 경로 모양은 유지한다

`next.ts:91`을 role 기준으로 바꾸되 **`agents/<이름>.md` 모양을 벗어나지 않는다.**

```ts
const path = roleOf(agent) === "review" ? "agents/review.md"
           : roster.includes(agent)     ? "agents/dev.md"
           : `agents/${agent}.md`;
```

`agents/roles/review.md`를 쓰지 않는 이유는 §Current State의 `agentOf` 정규식이다 — 슬래시가 하나
더 붙으면 스텁화를 건너뛰고 본문이 유출된다. `deliver.test.mjs`에 이 경계를 고정하는 테스트를 더한다.

생성기도 같은 규칙을 쓴다. `harness-init.mjs:115-116`의 루프가 워크스페이스의 `role`로 템플릿을
고르고, 목적지는 그대로 `.claude/agents/<ws.agent>.md`다.

### D. 판단 기준은 사용자 저장소에

`agents/review.md`(신설)는 단계 골격과 증거 규칙만 갖고, 무엇을 어떤 기준으로 볼지는 변수로 받는다.

- `{{ws.criteria_line}}` — "Your review criteria are `docs/reviews/code.md` — read it before you judge."
- `{{ws.scope_list}}` — `scope`의 불릿. 비면 "the whole repository".
- 단계: `start`(기준·범위 읽기) → `read`(대상 읽기) → `judge` → `report`.
- 증거 규칙은 `plan-verifier`·`doc-auditor`와 같은 결이다 — **증거 없는 지적 금지**, 인용 전 재독,
  못 본 것은 "못 봤다"고 적기.

선례는 `dev.md`가 워크스페이스 규약을 자기가 들고 있지 않고 `{{ws.knowledge_line}}`로 읽는 방식이다
(`vars.mjs:28`).

`tools:`는 읽기 전용 + 보고로 둔다 — `Read, Glob, Grep, mcp__harness__agent_next,
mcp__harness__board_get, mcp__harness__report_submit`. `Write`·`Edit`·`Bash`는 주지 않는다.
쓰기 권한이 없으면 커밋 핸드오프도 필요 없다.

### E. 항목 단위를 `requires: item`으로 선언한다

`steps.ts`의 `DERIVED_REQUIREMENTS`에 `item`을 더하고, `needsKey`를 **명시 선언 또는 기존 추론**(OR)으로 둔다.

```ts
const needsKey = (parsed) =>
  parsed.steps.some((s) => s.requires.some((r) => r === "item" || STATUSES.includes(r) || r === "verify-ok"));
```

OR 폴백이 핵심이다 — `dev.md`·`plan-verifier.md`를 손대지 않아도 되고, 서버와 템플릿을 같이 배포하지
않아도 된다. `Facts.check("item")`은 **폐기되지 않은 최신 `BoardItem`이 존재하는가**로 판정하고,
없으면 `the item is not on the board`를 돌려준다. `item`을 상태와 비교해 언제나 `not open`이 되는
구현을 금지한다.

### F. 소유 검사는 dev role에만

`next.ts:83`의 조건을 `roster.includes(agent)`에서 **`roleOf(agent) === "dev"`** 로 바꾼다.
주석이 이미 말하는 의도("소유는 *누가 이 일을 하느냐*이지 *누가 볼 수 있느냐*가 아니다")와 맞는다.

리뷰어는 남의 항목을 볼 수 있게 되지만 나머지 검사는 그대로다 — 접근 가능 여부(`access.available`),
플랜(`allowsAgent`), 현재 엔트리 결합(slots-v1의 `entry`·`agentRunId`·`stepId`)은 생략하지 않는다.

### G. roster를 둘로 가른다

전체 roster와 **배정 가능한 dev roster**를 구별한다.

| 자리 | 지금 | 바뀐 뒤 |
| --- | --- | --- |
| `decidePropose`(`board-rules.ts:35`) | 전체 roster | **dev roster** — 리뷰어는 `BoardItem.agent`가 될 수 없다 |
| 웹 propose 드롭다운(`propose-button.tsx`) | 전체 roster | **dev roster** |
| 레일 노드 담당자(`labels.ts:17-18`) | 전체 roster | plan·implement는 **dev roster** |
| Team 행(`briefing.ts:143-145`) | 전체 roster | 슬롯이 부르는 에이전트(역할 무관) |
| `allowsAgent`(`entitlement.mjs:139`) | 전체 roster | 그대로 — 플랜 검사는 에이전트 수의 문제다 |
| `next.ts:74` 존재 검사 | 전체 roster | 그대로 |

### H. 보고와 증거

- 리뷰 보고는 기존 `report_submit`을 쓰고 `runId`로 run/entry에 결합한다(이미 있는 인자).
- **`REPORT_SUBMIT_STATUSES`를 넓힌다.** 지금은 `in_review`·`implementing`·`done`뿐이라
  `proposed`·`planning` 구간의 리뷰 슬롯이 결과를 남길 수 없다. 열린 상태 전체로 넓힌다.
- **verify 벽은 역할 이름으로 뚫지 않는다.** `decideReportSubmit`의 `implementing` 조건
  (`board-rules.ts:140`)은 그대로 둔다. 읽기 전용 리뷰 대본은 `verify` 단계를 갖지 않으므로
  `implementing` 구간에 리뷰 슬롯을 놓으려면 대안 증거가 필요하다 — **이 제안은 리뷰 슬롯을
  `implementing` 구간 밖으로 제한**하고, 구간 안 리뷰는 별도 결정으로 남긴다.
- 임의 리뷰 보고는 `validation_record`를 대신하지 않는다. 그 벽은 고정 `plan-verifier`와 마지막
  `plan_submit` 이후의 `verify/ok`를 그대로 요구한다(`board-query.ts`의 질의).

### I. 플랜

새 축을 만들지 않는다. 리뷰어도 roster로 들어오므로 `workspaces` 축(Free 1 / Pro 10 / Max ∞)이
그대로 센다 — 리뷰어도 디스패치와 토큰을 쓰는 실제 에이전트이므로 같은 축이 맞다.

Free도 `review`를 선언하고 standalone으로 디스패치할 수 있다. 기본 그래프에 자유 슬롯이 없다는
것은 별개다 — 생성기(`harness-init.mjs:87`)와 서버(`syncProject`)가 같은 상한을 검사한다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `packages/core/workspaces.mjs` | update | role 검증, path/verify 조건부, 예약어 확장 | high — 모든 입력의 관문 |
| `packages/core/vars.mjs` | update | role별 변수(`criteria_line`·`scope_list`) | medium |
| `packages/core/deliver.mjs` + `deliver.test.mjs` | update | 스텁 경계 테스트 추가 | medium — 본문 유출 경로 |
| `prisma/schema.prisma` + 마이그레이션 | update | `role`·`criteria`·`scope` 추가, `path` nullable | high — 파괴적 전환 |
| `src/server/mcp/tools.ts` | update | zod·`WorkspaceInput` 확장 | medium — wire 계약 |
| `src/server/mcp/project-sync-query.ts` | update | 새 필드 upsert | medium |
| `src/server/mcp/project-query.ts` | update | `PROJECT_GET_SELECT` 확장 | low |
| `src/server/agents/next.ts` | update | 대본 경로·소유 검사·`needsKey` | high — 에이전트 진입점 |
| `src/server/agents/steps.ts` | update | `requires: item` | medium |
| `src/server/agents/vars.ts` | update | `WorkspaceRow`에 role·criteria·scope | low |
| `src/server/pipeline/board-rules.ts` | update | `decidePropose`의 dev roster, `REPORT_SUBMIT_STATUSES` | high |
| `src/fsd/features/propose-item/**` | update | dev roster만 노출 | low |
| `src/fsd/pages/project-board/model/briefing.ts` | update | Team 행 | low |
| `src/fsd/entities/pipeline/model/labels.ts` | update | plan·implement의 dev roster | low |
| `plugin/bin/harness-init.mjs` | update | 워크스페이스 렌더 루프가 role로 템플릿 선택 | medium |
| `plugin/templates/en/agents/review.md` | create | 역할 대본 v1 | medium — private 저장소 + 재시드 |
| `plugin/lib/*.mjs` | sync | `npm run sync:plugin-lib` (미러 11개, `check`가 드리프트 검사) | low |
| `docs/architecture/protocol.md`·`invariants.md` | update | role·리뷰 보고·소유 검사 | low |
| `docs/conventions/product-copy.md` | update | §12 새 거부 사유, §13 도구 설명, propose 드롭다운 | low |
| 관련 테스트 | update | 아래 Verification Plan | medium |

## Safety Analysis

이 변경의 오탐 경계는 "roster를 읽는 곳"과 "워크스페이스 필드를 읽는 곳"이다. 전자는 grep으로
전수 확인했고(§Current State의 목록), 후자는 `WorkspaceInput`·`PROJECT_GET_SELECT`·`WorkspaceRow`
세 타입이 컴파일에서 잡는다.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — 새 라우트 없음.
- [x] 정적 `import` / `export from` — roster 소비처 전수 grep 완료.
- [ ] dynamic `import()` — 해당 없음.
- [x] barrel export 경유 참조 — `propose-item`·`entities/pipeline`의 `index.ts`가 public API.
- [x] 테스트와 스크립트 참조 — `seed-templates.ts`가 템플릿을 파싱하므로 `review.md`를 먼저 안다.
- [ ] 정적 자산 URL — 해당 없음.
- [x] 타입 선언 — `WorkspaceInput`(tools.ts)·`ProjectQueryView`(project-query.ts)·`WorkspaceRow`(vars.ts)
      셋이 같은 모양을 세 층에서 들고 있다. 하나만 넓히면 나머지가 컴파일에서 걸린다.
- [x] 런타임 side effect — `syncProject`는 upsert만 하고 삭제하지 않는다. role 변경은 upsert로 덮인다.
- [x] API 계약 — `project_sync` 입력과 `project_get` 응답이 넓어진다. 둘 다 추가 필드이므로 구형
      클라이언트는 무시한다. `product-copy.md` §13에 반영한다.

특히 주의할 오탐 셋:

1. **`deliver.mjs`의 스텁 경계** — 대본 경로 모양 하나로 단계 본문이 유출된다(§C). 테스트로 고정한다.
2. **`needsKey`의 OR 폴백** — 없으면 서버 배포와 템플릿 재시드 순서가 어긋나는 순간 기존 두 템플릿이
   "takes no key"로 거부된다.
3. **`path` nullable 전환** — 구형 코드는 `ws.path`를 non-null로 읽는다. `vars.mjs`의
   `out_of_scope_list`·`roster_table`이 `w.path`를 직접 쓰므로 review 행에서 `undefined`가 섞이지
   않게 해야 한다.

## Approval

승인 메모:

- 승인 전. 이 문서는 `pipeline-agent-slots.md` §G–§I를 입력으로 구체화한 것이며, 그 문서의
  Execution Plan 2단계가 요구한 별도 제안서다.
- 2026-09-16 grilling의 결정 2·3·4(roster 1급, 워크스페이스가 role 선언, 기준은 사용자 문서)를
  그대로 구현 계약으로 옮긴다. 결정을 새로 만들지 않는다.
- §H의 "리뷰 슬롯을 `implementing` 구간 밖으로 제한"은 이 문서가 새로 좁힌 부분이다. 승인 시
  이 제한을 받아들이는지 확인이 필요하다.

## Execution Plan

1. 변경 전 기준선 저장 — `npm run check`·`npm test`·`npm run test:web`·`npm run test:templates`의
   현재 출력. `dev`에서 `harness/agent-role-catalog`로 분기.
2. `packages/core/workspaces.mjs`의 role 검증과 `vars.mjs`의 role 변수. `npm run sync:plugin-lib`.
   `config.test.mjs`·`vars.test.mjs`를 먼저 고친다.
3. 스키마·마이그레이션(`role`·`criteria`·`scope` 추가, `path` nullable). `db:validate`·`db:generate`.
4. MCP 계약 — `tools.ts` zod/`WorkspaceInput`, `project-sync-query.ts`, `project-query.ts`.
5. `next.ts`의 대본 경로·소유 검사·`needsKey`, `steps.ts`의 `requires: item`, `agents/vars.ts`.
   `deliver.mjs`의 스텁 경계 테스트.
6. `board-rules.ts`의 dev roster 분리와 `REPORT_SUBMIT_STATUSES` 확장.
7. 웹 — `propose-item`·`briefing.ts`·`labels.ts`.
8. 생성기 렌더 루프, `agents/review.md` 작성, 재시드.
9. `protocol.md`·`invariants.md`·`product-copy.md` 갱신. PR은 `gh pr create --base dev`.

## Verification Plan

실행할 검증:

```bash
npm run check
npm test
npm run test:web
npm run test:templates
npm run sync:plugin-lib
npx prisma migrate dev
npm run seed:templates
npm run test:server:integration   # TEST_DATABASE_URL 필요
```

검증 기준:

- **R1 역호환** — `role` 없는 기존 `harness.json`이 그대로 파싱되고, `role`이 `null`인 기존
  `Workspace` 행이 `dev`로 읽힌다. `config.test.mjs`에 회귀 케이스를 둔다.
- **R2 선언** — `role: "review"`가 `path`·`verify` 없이 통과하고, `criteria` 없으면 거부된다.
  `role: "dev"`가 `path`·`verify` 없이 거부된다.
- **R3 대본** — 리뷰 에이전트가 `agents/review.md`를 받고, `deliverable`이 그것을 **스텁으로** 자른다.
  단계 본문이 생성물에 없다.
- **R4 소유** — 리뷰어가 남의 항목에 `key`를 들고 갈 수 있고, dev는 여전히 거부된다.
- **R5 roster 분리** — `board_propose`와 웹 드롭다운이 리뷰어를 배정 대상으로 내놓지 않는다.
- **R6 상한** — Free에서 리뷰어 선언이 `workspaces` 축에 계수된다. 생성기와 서버가 같은 문장으로 거부한다.
- 기존 실패와 신규 실패의 구분: 1단계에서 저장한 기준선과 대조한다.

## Verification Results

아직 실행 전이다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | Not run yet | |
| `npm test` | Not run yet | `workspaces.test`·`vars.test`·`deliver.test` |
| `npm run test:web` | Not run yet | `next.test`·`steps.test`·`board-rules.test` |
| `npm run test:templates` | Not run yet | `review.md` 추가 반영 |
| `npm run test:server:integration` | Not run yet | 전용 테스트 DB 필요 |

## Risks and Rollback

잔여 리스크:

- **선행 제안서가 아직 인수 전이다.** `workspaces.mjs`의 계약은 `src-server-clean-code-findings.md`가
  만들었고 그 문서의 실DB 검증·배포 인수가 남아 있다. 그 인수에서 `validateWorkspaceSemantics`의
  의미가 바뀌면 이 제안의 §A가 따라 바뀐다. **선행 제안서의 `test:server:integration`이 실제
  PostgreSQL에서 통과한 뒤에 이 제안을 구현하는 것이 안전하다** — 같은 함수를 두 제안이 연달아
  고치면 어느 쪽 회귀인지 가리기 어려워진다.
- **`path` nullable 전환은 되돌리기 어렵다.** `role: "review"` 행이 생긴 뒤 구형 코드로 돌아가면
  `ws.path`가 `null`인 행을 non-null로 읽는다. 롤백 전에 review 행을 지우거나 `path`를 채워야 한다.
- **템플릿과 서버의 배포 순서.** `agents/review.md`가 `Template` 테이블에 없으면 리뷰어 디스패치가
  `no template for agent` 로 거부된다. 재시드가 서버 배포와 같은 창에 들어가야 한다.
- **`REPORT_SUBMIT_STATUSES` 확장의 파급.** `proposed`·`planning`에서 보고가 가능해지면 결재함의
  보류 전 상태 판독(`heldFrom`)과 항목 화면의 보고 목록이 새 행을 본다. 화면 쪽 회귀를 확인한다.
- **`criteria` 문서 부재.** `docs/reviews/`는 지금 없다. 경로가 없으면 리뷰어는 기준 없이 돌게 되므로,
  대본이 "기준 문서를 못 읽었다"를 `blocked`로 보고하도록 쓴다.

롤백 방법:

- 코드는 단순 revert. `role`·`criteria`·`scope`는 nullable/기본값이라 남아도 무해하다.
- `path`의 nullable 전환만 되돌릴 때 주의가 필요하다(위 첫 항목).
- 템플릿은 이전 판 재시드로 되돌린다. `agents/review.md` 행이 남아도 아무도 부르지 않으면 무해하다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`을 사용했다.
- [x] 문서 위치와 `status`가 일치한다(`active/` · `pending`).
- [x] `stage`는 `draft`이고 승인 기록은 비어 있다.
- [x] `proposal-size`는 `standard`이며 마이그레이션·API 계약·5개 초과 파일 조건에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 쓰고 본문에는 조건과 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다. 쓰는 역할과 사용자 정의 대본을 명시적으로 제외했다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 import·타입·런타임 side effect·API 계약을 확인했다.
- [x] 검증 명령과 성공 기준(R1–R6)이 적혀 있다.
- [x] 기존 실패와 신규 실패를 구분하는 방법을 적었다.
- [x] 잔여 리스크와 롤백을 명시했다. `path` nullable 전환의 비대칭성을 따로 적었다.
- [x] Current State의 모든 인용을 2026-09-19 `38dda43`의 실제 파일에서 읽어 확인했다.
- [ ] 구현·배포 합격 조건: 아직 수행하지 않음.
