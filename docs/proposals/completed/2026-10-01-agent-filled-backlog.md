---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-24"
approved-by: "user (conversation)"
approved-at: "2026-09-26"
approval-scope: "이 문서를 바탕으로 서버·웹·core·plugin·중첩 템플릿 저장소와 문서를 로컬 구현하고 검증. 2026-09-27 후속 요청으로 커밋·푸시와 dev 대상 PR, 독립 템플릿 저장소의 연계 PR까지 포함. 운영 배포·머지는 제외."
completed-at: "2026-10-01"
verification-summary: "Execution Plan 1~8 구현 완료. 본체 PR #83과 템플릿 PR #4는 2026-09-27 병합됨. 2026-09-26 check·build, core/plugin 187·web 391·server 5·DB 통합 25·templates 28개, Edge 폼 10개 통과. 2026-10-01 관련 회귀 시험 166개 재통과. 사용자 요청에 따라 구현 완료 기준으로 completed 처리하며, 운영 배포·설치된 Claude Code 사이클·인증된 앱의 전체 HTTP 검증은 미검증 후속 작업으로 남김."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-09-20-init-fewer-questions.md"
  - "docs/proposals/completed/2026-09-10-configurable-pipeline.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/sources.md"
  - "docs/conventions/product-copy.md"
---

# 에이전트가 백로그를 채운다 — 첫 실행에 사람의 작성이 필요 없는 파이프라인

## Summary

지금은 사람이 웹에서 백로그를 먼저 써야 파이프라인이 움직인다(`decideHead`가 빈 백로그에 "add an item on the Backlog tab"으로 멈춘다). 이 제안은 **feature-scout가 저장소를 읽고 근거가 있는 항목을 최대 3건 백로그에 쓰고, pm이 그중에서 골라 보드에 올리게** 바꾼다. 사람은 **작성자가 아니라 결정자**다 — 게이트(기본 before-plan·before-implement)에서 수행 여부를 정하고, 필요 없는 항목은 백로그에서 지운다. 사람이 쓰는 폼은 Title 하나만 필수로 줄인다(Key는 서버가 `ITEM-01` 형태로 발급, Area·Source·Type은 선택). 항목 종류는 key가 아니라 별도 `type` 필드(`feat`·`fix`·`refactor`·`docs`)로 보인다.

## Goal

- init 직후, 사용자가 백로그를 한 줄도 쓰지 않고 `pipeline_next` → scout → pm → 게이트①까지 도달한다.
- 사람의 통제는 **쓰기가 아니라 결정**으로 옮긴다: 게이트 승인, 백로그 제거, 게이트① 폐기. 게이트를 전부 빼면(기존 Pipeline 탭 편집) 그 자리가 자동 승인이 된다 — 새 토글은 만들지 않는다.
- 사람이 거절한 항목(백로그 제거, 게이트① 폐기)을 에이전트가 다시 가져오지 않는다. 배포 전에 한 폐기는 소급하지 않는다(제외 범위).
- 작업 유형: 기능 추가 + 기존 계약 변경(MCP 도구 추가, 데이터 구조 변경, 에이전트 템플릿 역할 변경).

## Proposal Size

`proposal-size`: standard

선택 근거:

- 데이터 구조 변경(`BacklogItem`에 열 추가, 마이그레이션과 백필).
- API 계약 변경(MCP 도구 `backlog_add` 신설, `pipeline_next` head의 응답 형 확장).
- 5개 이상 파일 변경(서버·웹·core·plugin·템플릿·문서).
- 롤백이 단순 revert 이상(마이그레이션, DB 템플릿 재시드, 플러그인 재배포).

## Current State

이 절과 아래 구현 지침의 줄 번호는 구현 전 기준(`c7f6d31fafd762599468887fb1a3a19a0df59bc2`)이다. 현재 구현 상태와 실행 증거는 Verification Results를 따른다.

### 확인한 사실 (코드)

| 사실 | 근거 |
| --- | --- |
| 빈 백로그면 head가 사람에게 넘긴다 | `src/server/pipeline/run-rules.ts:94` — `"the backlog has nothing to pick — add an item on the Backlog tab"` |
| head가 디스패치하는 에이전트는 pm뿐이다 | `src/server/pipeline/run-rules.ts:65` — `HeadNext = { action: "dispatch"; agent: "pm"; ... }` |
| pm은 백로그에 **이미 있는** key만 보드에 올린다 | `src/server/mcp/tools.ts:162` `board_propose`, `plugin/templates/en/agents/pm.md:117-120` |
| 어떤 에이전트에게도 백로그 쓰기 도구가 없다 | `src/server/mcp/tools.ts:2`(주석 "백로그 편집 … 여기 없다(D8)"), `AGENT_TOOL_NAMES` `:13-16` |
| feature-scout는 백로그 추가를 **명시적으로 금지**한다 | `plugin/templates/en/agents/feature-scout.md:20-21` "deciding what enters the pipeline is the owner's only gate", frontmatter `tools:`에 harness 도구는 `agent_next`뿐(`:4`), `docs/architecture/sources.md:22` |
| feature-scout는 `harness.json.scout`가 있을 때만 생성된다 | `plugin/bin/harness-init.mjs:222` `REPORT_AGENTS.filter((a) => a !== "feature-scout" \|\| config.scout)` |
| init은 `scout`를 묻지 않는다 | `plugin/skills/init/SKILL.md:81`, `docs/proposals/completed/2026-09-20-init-fewer-questions.md` D-1 |
| scout 질문이 비면 scout는 `blocked`로 끝난다 | `plugin/templates/en/agents/feature-scout.md:82-83`, 빈 값은 `plugin/lib/vars.mjs:16` `config.scout ?? { question: "" }` |
| 단계 본문(서버 렌더)은 scout 변수를 모른다 | `src/server/agents/vars.ts:4,14` — `scout: null` |
| Free 플랜도 feature-scout를 쓸 수 있고, 백로그 상한은 10건이다 | `packages/core/entitlement.mjs:11` |
| Free는 그래프를 편집할 수 없다(게이트를 뺄 수 없다) | 같은 줄 `pipelineEdit: false` |
| 웹 폼은 Key 형식과 Title만 검사한다. Area·Source는 빈 문자열로 저장된다 | `src/fsd/features/edit-backlog/api/edit-backlog.server.ts:13,20-22,35` |
| key·title·area·source 열은 모두 non-null `String` | `prisma/schema.prisma:129-140` |
| 사람의 제거와 완료가 같은 표기(`removedAt`)라 구분되지 않는다 | `edit-backlog.server.ts` `removeBacklogItem`, `src/server/pipeline/board-query.ts:219` |
| 게이트①에서 폐기해도 백로그 항목은 살아 있고, pm이 다시 고를 수 있다 | `board-query.ts:244-258` `discard`는 `BoardItem.discardedAt`만 찍는다. `availableBacklogCount`(`:112-119`)는 미결 보드 행만 빼므로 폐기된 항목은 다시 "고를 수 있음"이 된다 |
| 첫 실행 배너 3단계가 "Add a backlog item"이다 | `src/fsd/widgets/turn-banner/model/turn.ts:57-86`, 문구는 `docs/conventions/product-copy.md:220-227` |
| 배너의 단계 수가 하드코딩돼 있다 | `src/fsd/widgets/turn-banner/ui/turn-banner.tsx:95` `Step ${turn.current} of 4`, `turn.ts:48` `"Set up in four steps"` |
| pm은 area로 배정하고, area 밖 항목은 고르지 않는다 | `plugin/templates/en/agents/pm.md:55-61`, 빈 area는 "area needs checking"(`:126-130`) |
| "백로그 편집 도구는 에이전트 서버에 없다"가 불변식 4의 코드 강제 목록에 들어 있고, 시험이 `backlog_add`라는 이름까지 막는다 | `docs/architecture/invariants.md:40-43`, `src/server/mcp/tools.test.mjs:24-25`(`WEB_ONLY`에 `"backlog_add"`), `:36` |

### 문제

1. **첫 실행이 사람의 작성에 막힌다.** init으로 에이전트가 만들어져도 백로그가 비어 있으면 head가 `none`이다. 사용자는 Key 형식(`FEAT-01`)과 area 코드 경로, "관측과 코드 확정 진단"까지 요구받는다.
2. **거절이 기억되지 않는다.** 게이트①에서 폐기한 항목을 pm이 다음 바퀴에 다시 올릴 수 있다. 사람이 지운 항목과 끝난 항목도 구분되지 않는다.

## Scope

포함 범위:

- 서버: `backlog_add` MCP 도구, head 판정(scout/pm), 백로그 key 서버 발급(`ITEM-NN`), 제거 사유 기록, 게이트① 폐기 시 백로그 거절 처리, `plan_submit`의 선택 입력 `type`.
- 데이터: `BacklogItem`에 종류(`type`·`typeSetBy`)·작성자·제거 사유·작성 run 열 추가, 기존 행 백필.
- 웹: 백로그 폼(Key 입력 제거, Type select, Area·Source 선택 표시와 도움말), 백로그 표(Type·Added by 열, 빈 표 안내), 인박스 카드 type 칩과 도움말의 Discard 문장(D8), 첫 실행 배너(3단계), "Nothing open" 안내(`NONE_DETAIL`), Pipeline 탭 Scout 안내, Tokens 탭 안내문, 예시 key `FEAT-01` → `ITEM-01`.
- core/plugin: 기본 scout 질문, init이 feature-scout를 항상 생성, init 스킬의 "Not done here" 줄, 플러그인 판 상승(`0.3.4`, §1 ④).
- 템플릿(`plugin/templates/en`): feature-scout(백로그 쓰기 단계), pm(빈 area 배정), dev(빈 source·area 처리, 계획 뒤 type 확정), 계획서 템플릿(빈 source), 런북(head 설명 등).
- 문서: `invariants.md`(불변식 4의 코드 강제 목록을 "편집·삭제"로 좁힘, 불변식 8 설명의 `removedAt` 문장), `system-overview.md`, `protocol.md`, `sources.md`, `product-copy.md`, `rationale.md`(scout 역할 변경 근거).
- 가드: `scripts/retired-copy.test.mjs`의 `RETIRED`에 폐기되는 표현 추가, `src/server/mcp/tools.test.mjs`의 `WEB_ONLY`에서 `backlog_add` 제거.

제외 범위:

- **Free 플랜의 자동 승인.** Free는 그래프를 편집할 수 없어 게이트를 뺄 수 없다. 이번에는 건드리지 않는다(별도 결정).
- **새 "자동 승인" 토글.** 게이트 제거가 곧 자동 승인이다.
- 삭제 사유 입력(자유 글). 사유는 구분(owner/discarded/done)만 기록한다.
- 백로그 항목 편집 권한을 에이전트에게 주는 것. 에이전트는 **추가만** 한다. 편집·제거는 계속 웹 전용이다.
- 그래프 안 Scout 노드의 opt-in 정책(`OPT_IN_NODES`) 변경. 노드는 계속 opt-in이고, 도는 경우 보고와 함께 백로그에 쓴다.
- 기존 사람 작성 key의 재번호.
- **배포 전에 `proposed`에서 폐기한 항목의 소급 처리.** 그때의 폐기는 항목을 백로그에 남기는 동작이었다(`board-query.ts:244-258`). 백필(§1)은 이미 제거된 행의 사유만 채우고, 이 항목들을 거절로 바꾸지 않는다 — 살아 있는 후보로 남아 pm이 다시 고를 수 있다. 사람이 다시 폐기하거나 백로그에서 제거하면 그때부터 거절로 남는다.

## Proposal

### 합의된 결정 (2026-09-24 grilling)

| # | 결정 |
| --- | --- |
| D1 | 첫 항목은 에이전트가 저장소를 읽고 직접 만든다. |
| D2 | 수행 여부는 게이트에서 사람이 정한다. 게이트를 전부 빼면 자동 승인이다(기존 메커니즘). accept 앵커는 남는다. |
| D3 | 작성자는 feature-scout다. `backlog_add`를 준다. `sources.md:22`와 템플릿의 "백로그 추가 금지"를 뒤집는다. |
| D4 | `scout.question`이 없으면 템플릿 기본 질문을 쓴다. scout는 항상 생성되고, init은 계속 묻지 않는다. |
| D5 | head 규칙은 "보드에 안 올라간 후보가 0건이면 scout, 있으면 pm"이다. 쓰는 쪽(scout)이 읽는 쪽(pm)보다 앞선다. |
| D6 | scout는 **근거가 있는 것만, 한 번에 최대 3건**(플랜 상한의 남은 자리 이내) 쓴다. 근거 세 종류(경쟁 제품+이 사용자에게 필요한 이유 / 사용자 요청 / 우리가 찾은 구멍 `file:line`) 중 무엇을 쓸지는 scout가 판단한다(D18). 근거가 부족하거나 확인하지 못한 것은 보고서에만 남긴다. |
| D6+ | 사람은 백로그 항목을 제거할 수 있다(기존 Remove 그대로). |
| D7 | 사람의 제거와 완료를 구분해 기록한다. scout는 거절된 항목을 다시 가져오지 않는다. |
| D8 | `proposed`에서 폐기하면 백로그에서도 거절로 처리한다. `in_review`에서 폐기하면 항목은 살린다. "나중에"는 Put on hold가 맡는다. |
| D9 | 첫 실행 배너는 3단계다: Token → Connect → Run the pipeline in Claude Code. |
| D10 | 백로그 표에 Added by 열(`feature-scout` / `You`)을 추가한다. |
| D11 | Area는 선택이다. scout는 항상 채운다. 비어 있으면 pm은 워크스페이스가 하나면 그 dev, 여럿이면 추정하고 사유에 밝힌다. |
| D12 | Key는 항상 서버가 발급한다. 사람 폼과 `backlog_add` 모두 key를 받지 않는다. 모양은 D20. |
| D13 | Source는 선택이다. scout는 근거 종류별 형식(D19)을 지키고, 사람은 자유 글로 쓴다. 진단은 plan 단계의 dev가 채운다. |
| D14 | Title은 필수다. 사람 폼의 유일한 필수 칸이다. |
| D15 | Free 자동 승인 불가 상태는 이번에 건드리지 않는다. |
| D16 | propose 노드가 없는 그래프에서도 후보가 0건이면 scout가 채운다. 사람은 Backlog 탭에서 Put on the board로 고른다. |
| D17 | scout는 백로그 변화(추가·사람의 제거·완료) 뒤에만 다시 돈다. 변화 없이 이미 봤으면 head는 `none`이다. 시간 경과로는 다시 돌지 않는다. |
| D18 | 근거 세 종류 모두 백로그에 쓸 수 있고, 판단은 scout가 한다. 게이트를 전부 뺀 프로젝트에서는 scout가 판단한 기능이 사람 확인 없이 구현된다 — 사용자가 선택한 자동 승인의 결과로 받아들인다. |
| D19 | scout의 Source는 첫 줄 `Evidence: competitor \| users ask \| our hole` + 종류별 본문(our hole: `Observed:` / `Confirmed in code: file:line` · competitor: `Competitor: <product, URL>` / `Why these users:` · users ask: `Asked: <source>`) + 공통 `Effect:`·`Cost:`. |
| D20 | Key는 종류와 무관한 `ITEM-` 접두어, 번호는 두 자리 이상(`ITEM-01` … `ITEM-99`, `ITEM-100`). 기존 key(`FEAT-01` 등)는 그대로 둔다. 저장 뒤 key를 따로 알리지 않는다 — 표 맨 아래 새 행으로 보인다. |
| D21 | 항목 종류는 key가 아니라 `type` 필드다. 값은 `feat` · `fix` · `refactor` · `docs`. 백로그 표와 인박스 카드에 칩으로 보인다. key에 넣지 않는 이유: key는 계획서·보고서·커밋이 참조하는 불변 신원이고, 종류는 틀릴 수 있는 판단이다. |
| D22 | `type`은 scout가 항상 채우고, 사람은 선택이며 웹 편집에서 고친다. plan 단계의 dev가 `plan_submit`의 선택 인자 `type`으로 빈 값을 채우거나 scout·dev가 정한 값을 고친다. 사람이 정한 값은 에이전트가 덮어쓰지 않는다(다르다고 보면 계획서에만 적는다). |

### 1. 데이터 — `BacklogItem` 열 추가

**`prisma/schema.prisma`**

Before (`:129-140`):

```prisma
model BacklogItem {
  id        String      @id @default(cuid())
  projectId String
  key       String                       // FEAT-28
  title     String
  area      String
  source    String                       // 관측/진단 분리 규칙은 화면 도움말
  createdAt DateTime    @default(now())
  removedAt DateTime?                    // 완료 시 서버가 채움
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  board     BoardItem[]
  @@unique([projectId, key])
}
```

After:

```prisma
model BacklogItem {
  id            String      @id @default(cuid())
  projectId     String
  key           String                       // ITEM-07 — 서버가 발급한다(nextItemKey, §2). 옛 행은 FEAT-28 등 그대로
  title         String
  area          String                       // 선택. 빈 문자열 = 모름
  source        String                       // 선택. scout는 Evidence 형식(D19), 사람은 자유 글
  type          String?                      // "feat" | "fix" | "refactor" | "docs". null = 아직 모름
  typeSetBy     String?                      // "owner" | "feature-scout" | "dev" — 사람이 정한 값을 에이전트가 덮지 않게(D22)
  addedBy       String      @default("owner") // "owner" | "feature-scout"
  addedByRunId  String?                      // feature-scout가 쓴 행이면 그 AgentRun.id — run당 상한(3)을 센다
  createdAt     DateTime    @default(now())
  removedAt     DateTime?
  removedReason String?                      // "done" | "owner" | "discarded". removedAt과 함께 찍히고 함께 지워진다
  project       Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  board         BoardItem[]
  @@unique([projectId, key])
}
```

불변식: `removedAt === null ⇔ removedReason === null`. 모든 쓰기 지점(완료·재열기·사람 제거·게이트① 폐기)이 두 열을 같이 쓴다. `type === null ⇔ typeSetBy === null`도 같은 방식으로 지킨다.

`type` 값 목록과 key 규칙은 새 순수 모듈 `packages/core/backlog.mjs` 하나에 둔다(core는 순수 공유 정책 자리다, `AGENTS.md`). 내보내는 것: `ITEM_TYPES = ["feat", "fix", "refactor", "docs"]`, `toItemType(value)`(목록 안이면 그 값, 아니면 `null`), `nextItemKey(keys)`(§2), `SCOUT_ITEMS_PER_RUN = 3`(§3). 웹 폼·MCP 스키마·서버 검증이 이 모듈을 같이 쓴다. `npm run sync:plugin-lib`가 `.mjs` 모듈을 `plugin/lib/`로 복사하고(`scripts/plugin-lib.mjs`의 `isDeliverable`), `npm run check`가 그 복사본의 드리프트를 검사한다.

마이그레이션 백필(기존 제거된 행, `removedAt IS NOT NULL`): 그 항목의 **폐기되지 않은**(`discardedAt IS NULL`) 보드 행 중 `proposedOn`이 가장 늦은 행 — `latestBoard`와 같은 기준(`board-query.ts:57-60`) — 의 `status`가 `'done'`이면 `'done'`, 아니면 `'owner'`. 기존 행의 `addedBy`는 기본값 `'owner'`, `type`·`typeSetBy`·`addedByRunId`는 `NULL`이다(지금까지는 사람만 쓸 수 있었고 종류 개념이 없었다). 열 추가와 백필은 한 마이그레이션 파일(`prisma/migrations/<timestamp>_backlog_authorship/migration.sql`)이다. 백필은 아래 `WITH latest … UPDATE`를 쓴다. 빈 사유만 채우면 ①과 ② 사이에 옛 코드가 재열기한 행에는 `removedAt: null`과 `removedReason: "done"`이 함께 남는다. 재열기 → 보류 → 사람 제거 뒤에는 제거된 행에도 옛 `done`이 남는다(`board-query.ts:221`, `edit-backlog.server.ts:78-81`). 따라서 살아 있는 행의 사유를 지우고, 제거된 행의 `done`·`owner`도 최신 비폐기 보드 상태에 맞춰 재계산한다. 새 코드의 `discarded`는 보존한다. `IS DISTINCT FROM`으로 이미 올바른 행은 쓰지 않아 재실행 결과가 같다.

**전환 후 재정합**: ②는 옛 서버의 신규 쓰기 유입과 진행 중인 쓰기가 모두 끝난 뒤 새 서버의 쓰기를 받는 전환을 전제로 한다. 옛 writer와 새 writer가 함께 백로그를 갱신하는 rolling overlap은 이 절차의 지원 범위가 아니다. 새 서버 전환 뒤 아래 잠금과 재정합을 한 트랜잭션으로 실행한다. 기존 writer와 같은 `User → Project` 순서이며, 잠금을 얻은 뒤 READ COMMITTED의 새 스냅숏으로 계산하므로 새 완료·폐기를 오래된 계산값으로 덮지 않는다. 전체 소유자·프로젝트 잠금 동안 쓰기는 대기하므로 격리 DB rehearsal에서 소요 시간을 기록한다. 운영 전환이 이 조건을 지원하지 않으면 별도 배포 계획 없이는 진행하지 않는다. 마이그레이션 파일에는 열 추가와 **CTE UPDATE만** 넣고, 잠금 래퍼는 ②의 재정합에만 쓴다. 롤백 뒤 재배포에는 Risks and Rollback의 기간 정리도 먼저 적용한다.

```sql
BEGIN;
SELECT "id" FROM "User" ORDER BY "id" FOR UPDATE;
SELECT "id" FROM "Project" ORDER BY "id" FOR UPDATE;
WITH latest AS (
  SELECT DISTINCT ON ("backlogItemId") "backlogItemId", "status"
  FROM "BoardItem"
  WHERE "discardedAt" IS NULL
  ORDER BY "backlogItemId", "proposedOn" DESC
), expected AS (
  SELECT b."id", CASE
    WHEN b."removedAt" IS NULL THEN NULL
    WHEN b."removedReason" = 'discarded' THEN 'discarded'
    WHEN l."status" = 'done' THEN 'done'
    ELSE 'owner'
  END AS reason
  FROM "BacklogItem" b
  LEFT JOIN latest l ON l."backlogItemId" = b."id"
)
UPDATE "BacklogItem" b
SET "removedReason" = e.reason
FROM expected e
WHERE b."id" = e."id" AND b."removedReason" IS DISTINCT FROM e.reason;
COMMIT;
```

직후 `SELECT count(*) FROM "BacklogItem" WHERE ("removedAt" IS NULL) <> ("removedReason" IS NULL);`가 0인지 확인한다. 분류는 같은 `latest` 기준으로 검증하고 `discarded` 보존도 확인한다. 이 SQL은 구현 후 배포 절차이며 문서 검토 중 운영 DB에 실행하지 않는다.

만드는 절차는 이 저장소의 관례를 따른다(`docs/proposals/completed/2026-09-15-individual-project-availability-phase-d1.md:227-248`). `prisma.config.ts`는 `DATABASE_URL`을 바로 읽으므로 **격리된 development DB를 가리킨 상태에서만** `npm run db:migrate -- --create-only --name backlog_authorship`로 파일을 만든다(`--create-only`도 dev/shadow DB를 쓴다 — 운영 DB를 가리키면 안 된다). Prisma가 만든 `ALTER TABLE` 뒤에 백필 `UPDATE`를 손으로 덧붙인다(같은 모양의 선례: `prisma/migrations/20260917010000_report_acceptance_purpose/migration.sql` — 열 추가와, `WHERE … IS NULL`이라 다시 돌려도 같은 `WITH … UPDATE` 백필을 한 파일에 담았다. `20260907054533_board_item_accepted_at_backfill`은 열 추가 `20260907050756_board_item_accepted_at`과 파일을 나눈 다른 모양이다). 대상 DB에는 `node node_modules/prisma/build/index.js migrate status` → `migrate deploy` → `npm run db:generate` 순으로 적용한다. 격리 DB가 없으면 같은 SQL을 대상 DB에서 한 트랜잭션으로 돌려 결과를 확인하고 `ROLLBACK`하는 rehearsal로 대신한다(phase-d1 승인 범위의 선례).

배포 순서: 마이그레이션을 새 코드보다 먼저 적용한다. 새 열은 모두 기본값이 있거나 nullable이라 옛 코드가 새 스키마 위에서 그대로 돈다(옛 코드는 새 열을 읽지도 쓰지도 않는다). 반대 순서(새 코드가 옛 스키마)는 Prisma가 없는 열을 읽다 실패하므로 허용하지 않는다.

전체 순서는 네 단계다: ① 마이그레이션 → ② 서버 전환(`backlog_add`, head 판정, `plan_submit`의 `type` — 옛 writer 종료 확인)과 잠금 안의 재정합·불변식 확인(위) → ③ `npm run seed:templates`(새 scout·pm·dev·계획서·런북 템플릿이 DB로 간다, §8) → ④ 플러그인 전달과 사용자 저장소의 `/harness:init` 재실행. 전달은 `plugin/.claude-plugin/plugin.json`의 `version`을 `0.3.3`에서 `0.3.4`로 올리고 `dev` → `main`으로 승격한 뒤 `claude plugin marketplace update stagekeeper-local` → `claude plugin update harness@stagekeeper-local` → Claude Code 재시작이다(설치본은 판을 비교해 갱신되고, 마켓플레이스는 `main`을 받는다 — `docs/proposals/completed/2026-09-22-user-scoped-project-identity.md:761-769`·`:809`, 직전 판 상승은 `2026-09-24-init-any-branch.md:279`). ③을 ②보다 먼저 하면 새 scout 템플릿의 write 단계가 아직 없는 `backlog_add`를 부른다(단계는 `on failed: report`로 끝나지만 항목이 생기지 않는다). ②만 되고 ③이 늦으면 head가 feature-scout를 부르지만 옛 템플릿의 scout는 보고만 하므로 백로그가 비어 있고, 그 run이 닫히면 `scoutedSinceChange`로 head가 `none`에 멈춘다 — 멈출 뿐 디스패치를 헛쓰지 않는다. 이것은 scout를 설정해 `.claude/agents/feature-scout.md`가 있는 저장소의 모양이다. scout를 따로 설정하지 않은 저장소(init은 scout를 묻지 않는다, Current State)에는 그 파일이 없고, 그 세션은 head가 부르는 에이전트를 디스패치하지 못한다. run이 열리지 않으니 디스패치는 쓰지 않지만 head는 부를 때마다 feature-scout를 답한다. 런북 판 판정은 DB의 런북 템플릿과 비교하므로(`src/server/runbook.ts:35`) ③ 전에는 `RUNBOOK_STALE_NOTE`도 실리지 않는다. 그래서 ③은 ② 바로 뒤에 한다. ③ 뒤에 재init하지 않은 저장소는 런북 판이 달라 `RUNBOOK_STALE_NOTE`가 재init을 안내한다(Risks의 "기존 저장소").

### 2. 서버 — key 발급

순수 함수 `nextItemKey(keys)`(`packages/core/backlog.mjs`): 받은 key 중 `^ITEM-(\d+)$`에 맞는 것의 **숫자** 최댓값 + 1을 두 자리 이상으로 채워 돌려준다(`ITEM-01`, …, `ITEM-99`, `ITEM-100`). 문자열 정렬이 아니라 숫자 비교다(`ITEM-100` > `ITEM-99`). 숫자 부분은 `BigInt`로 비교·증가하고 마지막에 십진 문자열로 바꾼다. 현재 `BACKLOG_KEY_RE`는 자릿수 상한이 없어 기존 `ITEM-9007199254740992`도 유효하다 — `Number`로 계산하면 `+ 1`이 같은 수가 되어 유일 제약에서 막힌다. key는 입출력 모두 문자열이므로 JSON에는 `BigInt`를 싣지 않는다. 예전에 사람이 쓴 key(`FEAT-01`, `API-3` 등)는 그대로 두고 번호 계산에서 무시한다. 서버는 §3의 프로젝트 잠금 안에서 그 프로젝트의 모든 행(제거된 행 포함)의 key를 읽어 이 함수에 넘긴다 — 잠금이 동시 발급을 직렬화하므로 같은 번호가 두 번 나오지 않는다. `@@unique([projectId, key])`는 그대로 마지막 방어선이다.

접두어가 종류를 말하지 않는 이유는 D21이다. `#12`처럼 접두어를 빼지 않는 이유: GitHub이 커밋 메시지의 `#12`를 이슈·PR 링크로 바꾸므로 항목 key와 혼동하기 쉽다.

웹 액션과 `backlog_add`가 같은 서버 경로(아래 §3의 `addBacklog`)를 쓴다.

### 3. 서버 — 백로그 추가 서비스 하나로

지금 추가 로직은 웹 액션 안에만 있고(`edit-backlog.server.ts:15-48`), 상한 검사와 생성을 잠금 없는 `prisma.$transaction`으로 묶는다(`:30`). 에이전트 경로가 생기면 **사람과 scout가 동시에** 추가할 수 있다. 잠금 없는 트랜잭션(Postgres 기본 READ COMMITTED)에서는 둘 다 `live = 9`를 읽고 둘 다 만들어 Free 상한 10을 넘는다. 그래서 추가를 보드 서비스(`board-query.ts:44`의 `createBoardQueries` — `board.ts:5`가 `createBoardService`로 내보낸다)로 옮겨 기존 **프로젝트 잠금** `inProjectTransaction`(`board-query.ts:45-56` — `User`·`Project` 행 `FOR UPDATE`, 접근 가능 여부 검사, `fail()` 결과를 롤백)을 쓴다. `board.ts:8`의 구조 분해 export에 `addBacklog`를 더해 웹 액션과 MCP deps가 `@/server/pipeline/board`에서 가져온다.

```ts
// board-query.ts, createBoardQueries 안 — 백로그 추가의 단일 출처. 웹 액션(사람)과 MCP backlog_add(feature-scout)가 부른다.
// 프로젝트 잠금 안에서 run 확인·상한·run당 상한·key 발급·생성을 한다: 두 호출자가 동시에 와도 상한과 번호가 어긋나지 않는다.
type AddBacklogInput = {
  title: string; area: string; source: string;
  type: string | null;                   // ITEM_TYPES 중 하나 또는 null. null이면 typeSetBy도 null
  addedBy: "owner" | "feature-scout";
  addedByRunId: string | null;           // feature-scout일 때 그 AgentRun.id — 잠금 안에서 열린 feature-scout run인지 확인한다
};

// 더할 import: capError(@harness/core/entitlement.mjs — 이미 allowsSessionApprovals를 가져오는 줄),
// readProjectPlanIn(../project-access-query — 이미 readProjectAccessIn을 가져오는 줄), nextItemKey·SCOUT_ITEMS_PER_RUN(@harness/core/backlog.mjs)
async function addBacklog(projectId: string, input: AddBacklogInput) {
  if (!input.title.trim()) return fail("Title is required.");
  return inProjectTransaction(projectId, async (tx) => {
    if (input.addedByRunId !== null) {
      // run 확인도 잠금 안에서 한다. run을 닫는 agent_next(cursorTransaction)도 같은 소유자 User 행을 FOR UPDATE로
      // 잡으므로(src/server/agents/run-query.ts:25) 확인과 쓰기 사이에 run이 닫히지 않는다.
      const run = await tx.agentRun.findFirst({ where: { id: input.addedByRunId, projectId, agent: "feature-scout", closedAt: null }, select: { id: true } });
      if (!run) return fail("backlog_add needs an open feature-scout run");
    }
    // 플랜도 잠금 안에서 읽는다. planForProject(src/server/entitlement.ts)는 server-only이고 전역 prisma를 써서
    // 주입받은 db로 도는 이 서비스(createBoardQueries)에 맞지 않는다 — src/server/pipeline/run-query.ts:125와 같은 읽기다.
    const plan = await readProjectPlanIn(tx, projectId);
    const live = await tx.backlogItem.count({ where: { projectId, removedAt: null } });
    const capMsg = capError(plan, "backlog", live);
    if (capMsg) return fail(capMsg);
    if (input.addedByRunId !== null) {
      const written = await tx.backlogItem.count({ where: { projectId, addedByRunId: input.addedByRunId } });
      if (written >= SCOUT_ITEMS_PER_RUN) return fail(`this run already added ${SCOUT_ITEMS_PER_RUN} items`);
    }
    const keys = await tx.backlogItem.findMany({ where: { projectId }, select: { key: true } });
    const key = nextItemKey(keys.map((k) => k.key));
    const typeSetBy = input.type === null ? null : input.addedBy;
    await tx.backlogItem.create({ data: { projectId, key, ...input, typeSetBy } });
    return { ok: true as const, item: { key } };
  });
}
```

내보낼 때 다른 쓰기와 같이 `reportFailure(addBacklog)`로 감싼다(`board-query.ts:435`) — 잠금이 던지는 `BoardRejection`(프로젝트 사용 불가 등)이 `ServerResult`의 `reason`으로 돌아온다.

유지해야 할 불변식: 상한 검사와 생성이 한 트랜잭션이다(기존 `edit-backlog.server.ts:28-29` 주석). 이제 그 트랜잭션이 프로젝트 잠금 안이다.

동시성·재실행 판단:
- **서로 다른 호출자 경합**(사람 추가 ∥ scout 추가, 상한 10에서 9건): 잠금이 직렬화한다. 둘째 호출은 첫째의 생성을 본 뒤 상한 문장으로 거부된다.
- **같은 run의 동시 호출**(scout가 병렬로 두 번): 잠금이 직렬화하므로 run당 3건도 넘지 않는다.
- **run 닫힘 ∥ `backlog_add`**(scout의 `agent_next`가 run을 닫는 순간과 겹침): run 확인과 쓰기가 같은 잠금 안이다. run을 닫는 `cursorTransaction`도 같은 소유자 User 행을 잠근다(`src/server/agents/run-query.ts:25`, 운영 경로는 `src/server/agents/runs.ts:77`). 그래서 닫힌 run 이름으로 항목이 생기지 않는다. 확인을 잠금 밖(deps)에 두면 이 창이 열린다 — 닫힌 run의 항목은 `createdAt`이 `closedAt`보다 늦어 `scoutedSinceChange`를 거짓으로 돌리고 디스패치 하나를 더 쓴다(§5).
- **같은 요청의 재전송**(응답을 잃고 scout가 다시 부름): 멱등 키가 없으므로 **같은 항목이 두 번 생길 수 있다.** run당 3건이 피해를 묶는다. scout 템플릿은 실패·시간 초과 뒤 재시도 전에 `backlog_list`로 이미 들어갔는지 확인하게 한다(§8). 중복이 생기면 사람이 제거한다.
- **웹 폼의 이중 제출**: 지금은 사람이 쓴 key가 중복을 막는다 — 같은 key의 두 번째 제출은 `findUnique`나 `P2002`에서 "already exists"로 끝난다(`edit-backlog.server.ts:23-25,41-44`). 서버가 key를 발급하면 두 제출은 서로 다른 key로 둘 다 들어간다. 한 폼에서 두 번 누르는 경로는 제출 버튼이 요청이 끝날 때까지 꺼져 있어 막힌다(`backlog-form.tsx:49`의 `disabled={pending}`). 그 밖의 중복(두 탭에서 같은 글을 쓰는 등)은 사람이 제거한다.
- **부분 실패**: 한 트랜잭션이라 반쯤 만든 행이 없다.

**`src/fsd/features/edit-backlog/api/edit-backlog.server.ts` — `addBacklogItem`**

Before (`:15-48`, 요지): `key` 필드를 읽어 `BACKLOG_KEY_RE`로 검사 → `findUnique`로 중복 검사 → 트랜잭션에서 상한 검사와 생성 → `P2002`면 `"${key} already exists."`.

After:

```ts
// import { addBacklog } from "@/server/pipeline/board";
// import { toItemType } from "@harness/core/backlog.mjs";
export async function addBacklogItem(slug: string, _prev: BacklogFormState, form: FormData): Promise<BacklogFormState> {
  const w = await requireProjectWrite(slug);
  if (!w.ok) return { status: "error", error: w.reason };
  const added = await addBacklog(w.projectId, {
    title: field(form, "title"), area: field(form, "area"), source: field(form, "source"),
    type: toItemType(field(form, "type")), // 빈 선택 → null. 목록 밖 값 → null(폼은 select라 정상 경로로는 오지 않는다)
    addedBy: "owner", addedByRunId: null,
  });
  if (!added.ok) return { status: "error", error: added.reason };
  revalidatePath(projectPath(slug, "/backlog"));
  return { status: "saved" };
}
```

`BACKLOG_KEY_RE`(`backlog-form-state.ts:14`)의 호출처는 이 액션(`edit-backlog.server.ts:10,21`) 하나이고 barrel(`index.ts`, `index.server.ts`)로 나가지 않는다 — 지운다. 액션의 `Prisma`(`:5`, P2002 판정용), `capError`(`:2`), `planForProject`(`:8`) import도 쓰임이 `addBacklog`로 옮겨 가므로 남는 쓰임이 없으면 지운다. `latestBoard` import(`:9`)는 제거의 열린 행 검사가 `removeBacklog`로 옮겨 가므로(§6) 지운다. `prisma` import도 세 액션이 모두 보드 서비스에 위임하므로(아래 `updateBacklog`) 지우고, `:12`의 주석("Prisma를 직접 쓴다")도 고친다.

**`updateBacklogItem`**(`:51-66`): 쓰기를 보드 서비스의 `updateBacklog(projectId, key, { title, area, source, type, typeBefore })`로 옮기고, 액션은 `requireProjectWrite`·폼 읽기·`revalidatePath`만 한다. 추가·제거와 같이 옮기는 이유는 아래 규칙과 §6-1의 충돌 처리를 시험이 부를 수 있는 곳에 두려는 것이다 — 웹 액션은 세션(`requireProjectWrite` → `requireUser`의 `auth()`, `src/server/auth/guard.ts:8-12`)과 `revalidatePath`에 묶여 있고, 이 저장소의 시험은 웹 액션을 부르지 않는다(통합 시험은 `createBoardService(db)`를 부른다, `tests/server/integration/board.test.ts:43`). `updateBacklog`는 `inProjectTransaction`을 쓰지 않는다 — 조건부 `updateMany` 한 번이 경합을 막고(§6-1), 사용 가능 여부는 액션의 `requireProjectWrite`가 이미 본다(지금과 같다). `board.ts:8`의 export에 더한다. 폼은 `type`과, 폼이 그려질 때의 값 `typeBefore`(숨은 입력)를 함께 보낸다(비교와 충돌 처리는 §6-1). 사람이 값을 바꾸면 `typeSetBy: "owner"`, 비우면 `type: null, typeSetBy: null`로 쓴다(비운 뒤에는 dev가 다시 채울 수 있다). 값이 그대로면 `typeSetBy`를 건드리지 않는다 — 제목만 고친 저장이 scout·dev의 값을 사람의 값으로 바꾸면 안 된다.

### 4. 서버 — MCP `backlog_add`

**`src/server/mcp/tools.ts`**: `AGENT_TOOL_NAMES`에 `"backlog_add"`를 넣고 등록한다.

```ts
server.registerTool("backlog_add", {
  description: "feature-scout: add one backlog item you have evidence for. The server assigns the key (ITEM-NN). Pass runId = the runId of the receipt your current agent_next step returned. At most 3 per run, and never an item the owner removed or discarded (backlog_list includeRemoved shows them). After a failed or timed-out call, check backlog_list before calling again.",
  inputSchema: z.object({ ...project, runId: z.string().min(1), title: z.string().min(1), area: z.string().min(1), source: z.string().min(1), type: z.enum(ITEM_TYPES) }),
}, async (args, ctx: Ctx) => {
  const s = await scope(args, ctx, deps);
  if (!s.ok) return fail(s.reason);
  const unavailable = await guardUnavailable(deps, s.projectId);
  if (unavailable) return unavailable;
  return unwrap(await deps.backlogAdd(s.projectId, args));
});
```

`runId`는 `agent_next`가 돌려준 영수증의 `runId`다 — 영수증의 `runId`는 `AgentRun.id`다(`src/server/agents/next.ts:127-128` `receipt: { runId: run.id, … }`, run은 `db.agentRun`에서 온다 `runs.ts:48`). key 없이 연 단독 run(head)과 그래프 Scout 슬롯 run 모두 같다. 이름을 `agentRunId`로 하지 않는 이유: `agent_next` 응답의 `agentRunId`는 슬롯 바인딩 run에만 실린다(`next.ts:32`) — 단독 run에는 없다.

`deps.backlogAdd`(`src/server/mcp/deps.ts`)는 `board.addBacklog(projectId, { title, area, source, type, addedBy: "feature-scout", addedByRunId: runId })`를 부른다. `runId`가 **이 프로젝트(`projectId`)의 열린(`closedAt: null`) `agent: "feature-scout"` AgentRun**인지는 `addBacklog`가 잠금 안에서 확인하고, 아니면 `"backlog_add needs an open feature-scout run"`으로 거부한다(§3 — deps에서 잠금 밖에 확인하면 확인과 쓰기 사이에 run이 닫힐 수 있다). 다른 프로젝트의 run id는 `projectId` 조건에서 걸린다(객체 수준 인가). `ToolDeps`(`tools.ts:40-60`)에 `backlogAdd(projectId, input): Promise<ServerResult<{ key: string }>>`를 더한다. 이 검사가 작성자 표기(D10)와 run당 상한(D6)의 근거다. 토큰은 에이전트를 구분하지 않으므로(`scope()`, `tools.ts:86-98`) 에이전트 이름을 인자로 믿지 않는다.

`tools.ts:2`의 주석은 "백로그 편집·삭제는 여기 없다 — 추가만 feature-scout가 한다"로 고친다.

**불변식 4와의 관계.** 불변식 4는 "게이트는 사용자만"이다(`docs/architecture/invariants.md:16`). 원래 결정 D8도 "게이트·반려 도구를 등록하지 않는다"였다(`docs/investigations/active/harness-platform.md:53`). 백로그 추가는 게이트가 아니고, 항목을 실제로 수행할지는 여전히 게이트에서 사람이 연다(D2). 그러니 불변식 4는 그대로다. 다만 이 저장소는 불변식 4를 코드로 강제하면서 **백로그 편집**을 같은 금지 목록에 넣어 두었다(`invariants.md:40-43`). `src/server/mcp/tools.test.mjs:24-25`의 `WEB_ONLY`는 `backlog_add`라는 이름까지 막고, `:36`이 그 목록을 단언한다. 이 제안은 D3에 따라 그 목록을 "백로그 **편집·삭제**"로 좁힌다. `invariants.md:40-43`의 문장을 고치고, `WEB_ONLY`에서 `"backlog_add"`만 뺀다(`backlog_update`·`backlog_remove`는 남긴다). 아키텍처 문서가 제안서보다 우선하므로(`AGENTS.md`), 이 두 곳을 고치지 않고 구현하면 안 된다.

scout의 `type`과 `area`는 필수다(D22·D11 — scout는 항상 채운다. area는 새 기능이라도 에이전트 표에 있는 워크스페이스 경로를 적는다, §8). 사람 폼에서는 둘 다 선택이다. `source`의 첫 줄이 `Evidence:`로 시작하는지는 서버가 검사하지 않는다 — 형식은 템플릿 규칙이고, 서버가 문장 모양을 재기 시작하면 사람 글과 규칙이 갈린다.

`BacklogView`(`src/server/mcp/views.ts:1-10`)에 `type`, `addedBy`, `removedReason`을 싣는다. 이 뷰는 공개 JSON을 필드 단위로 고르는 화이트리스트다 — `addedByRunId`·`typeSetBy`는 내부 필드라 싣지 않는다. `src/server/mcp/views.test.ts:5-10`이 그 목록을 `deepEqual`로 단언하므로 기대값에 세 필드를 더하고, 입력 행에 `addedByRunId`·`typeSetBy`를 넣어 빠지는 것을 함께 단언한다. scout가 `backlog_list({ includeRemoved: true })`로 거절된 항목(`removedReason ∈ {owner, discarded}`)을 읽는다(D7).

**중첩된 백로그 응답도 같은 공개 경계를 지킨다.** 타입만 좁혀도 런타임 JSON의 필드는 제거되지 않는다. `board_get`은 `getWithHistory`의 `backlogItem: true`를 그대로 직렬화하고(`board-query.ts:133-144`, `deps.ts:32-33`), `board_transition`의 무변경 성공도 전체 `backlogItem`을 가진 `row`를 반환한다(`board-query.ts:191`). 두 경로를 빠뜨리면 스키마 추가만으로 `typeSetBy`·`addedByRunId`가 공개된다. `views.ts`에 중첩 `backlogItem`을 `backlogView`로 투영하는 `boardWithBacklogView`를 내보내고, `deps.ts`의 `boardGet`과 성공한 `transition` 결과 중 `backlogItem`이 있는 가지에서 사용한다. 보드의 기존 필드·events·reports는 보존하고, 백로그의 기존 공개 필드와 새 공개 필드 세 개만 남긴다. `board-query.ts`의 내부 include는 웹 상세와 서버 정책이 쓰므로 그대로 둔다. `boardList`는 이미 select여서 새 `type`만 더한다. `views.test.ts`의 중첩 투영 시험과 `tests/server/integration/backlog-add.test.ts`의 실제 `createToolDeps(db).boardGet`·동일 상태 `transition` 응답 직렬화로 두 내부 필드의 **부재** 및 기존 history/source 보존을 단언한다. `backlog_get`·`backlog_list`·`board_list`도 같은 통합 시험에서 공개 계약을 확인한다.

### 5. 서버 — head 판정

**`src/server/pipeline/run-rules.ts`**

Before (`:64-97`):

```ts
export type HeadNext = { action: "dispatch"; agent: "pm"; hint: string } | { action: "none"; reason: string };
// ...
export type HeadInput = {
  hasResumablePmRun?: boolean;
  hasPropose: boolean;   // 현재 버전의 nodes에 propose가 있는가
  openCount: number;     // 미결 항목 수(latestBoard(projectId, true).length)
  availableBacklog: number; // 아직 보드에 안 올라간 백로그 항목 수 — pm이 고를 수 있는 것
  capReason: string | null; // capError(plan, "dispatches", recentRuns) — decideNext와 같은 수
};

// 판정 순서: propose 노드 없음 → 미결 2건(canPropose — pm 규칙과 같은 문장) → 상한 → dispatch pm.
export function decideHead(i: HeadInput): HeadNext {
  if (!i.hasPropose) return { action: "none", reason: "no propose node on this pipeline — put an item on the board from the Backlog tab" };
  if (!canPropose(i.openCount)) return { action: "none", reason: `open items: ${i.openCount} (max 2)` };
  // 백로그가 비었으면 pm을 부를 이유가 없다. 예전에는 계속 "dispatch pm"이라 답해,
  // 고를 것이 없다는 걸 알자고 디스패치를 하나 썼다 — 디스패치는 월 상한에 계수된다(실측).
  if (i.availableBacklog === 0) return { action: "none", reason: "the backlog has nothing to pick — add an item on the Backlog tab" };
  if (i.capReason !== null && !i.hasResumablePmRun) return { action: "none", reason: i.capReason };
  return { action: "dispatch", agent: "pm", hint: HINT.propose };
}
```

After:

```ts
export type HeadNext =
  | { action: "dispatch"; agent: "pm" | "feature-scout"; hint: string }
  | { action: "none"; reason: string };
// ...
export type HeadInput = {
  hasResumablePmRun?: boolean;
  hasResumableScoutRun?: boolean;
  hasPropose: boolean;
  openCount: number;
  availableBacklog: number;
  // 마지막 백로그 변화(추가·제거) 뒤에 feature-scout run이 report 단계까지 마치고 닫혔는가 — 이 백로그를 이미 봤다는 뜻(0건을 썼든, 쓴 항목이 모두 보드에 올라갔든).
  // 이 검사가 없으면 scout가 0건을 쓸 때마다 head가 다시 scout를 불러 디스패치를 헛쓴다(pm의 빈 백로그 사고와 같은 모양).
  scoutedSinceChange: boolean;
  // 같은 개요의 items 중 그래프 Scout 노드가 feature-scout를 디스패치하는가(deps.ts가 scoutNodePending(items)로 계산해 넘긴다).
  // 그러면 head는 scout를 따로 부르지 않는다 — 그 run이 백로그에 쓸 것을 찾는다. 없으면 한 답에 scout 디스패치가 둘이다.
  scoutNodePending: boolean;
  capReason: string | null;
};

// 판정 순서: 미결 2건 → 후보 0건이면 scout(Scout 노드가 이미 부르거나 이미 봤으면 none) → propose 노드 없음 → 상한 → dispatch pm.
// scout가 pm보다 앞이다 — scout는 백로그를 쓰고 pm은 읽는다.
export function decideHead(i: HeadInput): HeadNext {
  if (!canPropose(i.openCount)) return { action: "none", reason: `open items: ${i.openCount} (max 2)` };
  if (i.availableBacklog === 0) {
    if (i.scoutNodePending) return { action: "none", reason: "a Scout node in items dispatches feature-scout — that run looks for items to add" };
    if (i.scoutedSinceChange) return { action: "none", reason: "feature-scout already looked at this backlog — it looks again after the backlog changes; add an item on the Backlog tab" };
    if (i.capReason !== null && !i.hasResumableScoutRun) return { action: "none", reason: i.capReason };
    return { action: "dispatch", agent: "feature-scout", hint: HINT.scoutHead };
  }
  if (!i.hasPropose) return { action: "none", reason: "no propose node on this pipeline — put an item on the board from the Backlog tab" };
  if (i.capReason !== null && !i.hasResumablePmRun) return { action: "none", reason: i.capReason };
  return { action: "dispatch", agent: "pm", hint: HINT.propose };
}
```

새 분기: `scoutNodePending`·`scoutedSinceChange`로 인한 `none`과 scout 디스패치다. 판정 순서도 바뀐다(미결 검사가 propose 검사보다 앞 — D16: propose 노드가 없어도 빈 백로그는 scout가 채운다). `scoutedSinceChange`의 "변화"는 백로그 행의 추가·제거(사람의 제거, 게이트① 폐기, 완료)다. 시간 경과는 변화가 아니다(D17). 이 `none`은 scout가 0건을 쓴 경우만이 아니다 — scout가 쓴 항목을 pm이 모두 보드에 올린 뒤에도(후보 0건, 미결 1건) scout의 추가는 그 run이 닫히기 전이므로 같은 사유로 멈춘다. 그래서 사유는 "찾지 못했다"가 아니라 "이미 봤고, 백로그가 바뀌면 다시 본다"로 쓴다.

`HINT`에 `scoutHead`를 더한다: `"Dispatch feature-scout with no key. It adds up to three backlog items it has evidence for. Append its report to docs/agents/feature-scout/scouting-log.md yourself, then call pipeline_next again."` "pm picks"로 끝내지 않는 이유: propose 노드가 없는 그래프에서도 head가 scout를 부르고(D16) 그때 고르는 것은 사람이다 — 다음 일은 다시 부른 `pipeline_next`가 말한다. 보고서를 로그에 남기는 지시가 빠지면 백로그에 쓰지 않은 제안(D6 "보고서에만 남긴다")이 세션 밖 어디에도 남지 않는다 — `scouting-log.md`는 다음 scout가 중복을 거르는 입력이기도 하다(`plugin/templates/en/docs/agents/README.md:68`). 기존 `HINT.scout`(`:39`)의 "only when harness.json.scout is configured …" 문장은 D4로 더는 참이 아니므로 `"Dispatch feature-scout with no key; it adds up to three items it has evidence for to the backlog. Append its report to docs/agents/feature-scout/scouting-log.md yourself."`로 바꾼다. 두 문장은 product-copy §13에도 같이 적는다(`run-rules.ts:31` 주석).

**`src/server/pipeline/run-query.ts` — `headFor`**(`:134-145`): 두 값을 `db`로 더 읽어 넘기고, 다섯째 인자 `scoutNodePending`을 받아 그대로 넘긴다(`src/server/mcp/deps.ts:60`이 같은 개요의 `items`에서 계산한다, 아래).
- `hasResumableScoutRun`: pm과 같은 조건(`:141`)으로 `{ projectId, agent: "feature-scout", key: null, pipelineRunId: null, pipelineEntryId: null, closedAt: null }`인 run이 있는가. 그래프 Scout 슬롯 run(`pipelineRunId` 있음)은 head가 이어받지 않는다.
- `scoutedSinceChange`: `{ projectId, agent: "feature-scout", key: null, closedAt: { not: null }, steps: { some: { stepId: "report", outcome: "ok", OR: [{ accepted: true }, { accepted: null }] } } }` 중 가장 늦은 `closedAt`이, 그 프로젝트 백로그 행의 `max(createdAt, removedAt)`보다 뒤인가. 슬롯 run도 포함한다 — 그 run도 같은 백로그를 보고 썼다. `report`를 `ok`로 마친 run만 세는 이유: `done`에 닿은 run은 `closedAt`과 그 마지막 단계의 원장 행을 한 트랜잭션에 남기지만(`src/server/agents/run-query.ts:139,143-144`), 슬롯 run은 항목의 상태가 바뀌거나 폐기될 때 `closeRuns`가 도중에 닫는다(`board-query.ts:302-306`, `schema.prisma`의 `AgentRun.closedAt` 주석 "done 도달, 또는 항목이 done/on_hold/폐기될 때 board.ts가 닫는다"). 그렇게 닫힌 run은 백로그를 끝까지 보지 않았으니 "이미 봤다"가 아니다. 수락된 원장 행만 세는 조건은 `pipeline/run-query.ts:75`와 같다. 그런 run이 없으면 `false`. 백로그 행이 하나도 없으면서 그런 run이 있으면 `true`. head가 부른 key 없는 run은 바인딩도 key도 없어 `closeRuns`가 닫지 않는다 — `done`에 닿을 때 닫히고, 도중에 멈춘 run은 열린 채 남아 `hasResumableScoutRun`으로 이어받는다.

head scout run과 그래프 Scout 노드의 관계: slots-v1 그래프(현재 형식, `SLOT_FORMAT`)에서 Scout 노드의 완료는 그 노드에 **바인딩된** run(`pipelineRunId`·`pipelineEntryId`)이 닫혔는가로만 판정한다(`src/server/pipeline/run-query.ts:65-66`). 바인딩 없는 head scout run은 노드를 완료시키지 않는다. 옛 형식(`format: null`) 그래프에서는 노드 완료가 "노드 진입 **뒤에 열린**(`openedAt ≥ enteredAt`) 바인딩 없는 run이 닫혔는가"다(`:71-74`, `:102`). `agent_next`는 바인딩 없는 호출을 열린 같은 run으로 이어받는다(`src/server/agents/run-query.ts:69-71`). 그래서 head scout와 노드 scout는 한 run을 함께 쓴다. head scout run이 노드 진입 뒤에 열렸으면 그 run이 닫힐 때 노드도 완료된다. 노드 진입 전에 열린 head scout run을 노드 디스패치가 이어받으면, 그 run은 노드를 완료시키지 못하고 scout가 한 번 더 돈다(디스패치 하나). 둘 다 같은 일(key 없는 scout 한 번)이라 의도된 공유로 두고 바꾸지 않는다.

한 개요에 둘이 함께 나오는 경우는 막는다. Scout 노드가 인수 뒤에 있는 그래프에서 마지막 후보가 완료되면, 그 항목의 꼬리 노드가 feature-scout를 디스패치하고(`items`는 런이 아직 걷는 항목도 싣는다, `src/server/mcp/deps.ts:52-59`의 `walkingKeys`), 같은 개요의 head도 후보 0건이라 scout를 부른다. 메인 루프는 한 답의 dispatch를 모두 하므로(`plugin/templates/en/CLAUDE.runbook.md:74-77`) scout run이 둘(디스패치 둘, 최대 6건) 생긴다 — slots-v1은 바인딩이 달라서, 옛 형식은 앞 run이 닫힌 뒤 다음 디스패치가 새 run을 열어서다. 그래서 `run-rules.ts`에 순수 함수 `scoutNodePending(items: PipelineNext[]): boolean`(`items.some((n) => n.action === "dispatch" && n.agent === "feature-scout")`)을 두고, `deps.ts`가 `items`를 먼저 만든 뒤(`:55-59`) 그 값을 `headFor`에 넘긴다. head는 그때 `none`이다. 노드가 `wait`(상한 등)이면 `scoutNodePending`은 거짓이고 head는 위 순서대로 판정한다.

**`availableBacklogCount`**(`board-query.ts:112-119`): 로직은 그대로다. D8로 게이트① 폐기 항목이 `removedAt`을 갖게 되므로 자연히 후보에서 빠진다.

### 6. 서버 — 제거 사유

| 쓰기 지점 | 지금 | 바꾼 뒤 |
| --- | --- | --- |
| 완료(`board-query.ts:219`) | `removedAt: new Date()` | `removedAt: new Date(), removedReason: "done"` |
| 재열기(`:221`) | `removedAt: null` | `removedAt: null, removedReason: null` |
| 사람 제거(`removeBacklogItem`) | `removedAt: new Date()`(잠금 없음, 아래) | 보드 서비스의 `removeBacklog`로 옮겨 프로젝트 잠금과 Serializable 안에서 열린 행 검사와 `removedAt: new Date(), removedReason: "owner"`를 함께 한다 |
| 폐기(`discard`, `:244-258`) | `BoardItem.discardedAt`만 | `row.status === "proposed"`이면 같은 트랜잭션에서 백로그에 `removedAt`, `removedReason: "discarded"`를 찍는다. `in_review`면 백로그는 그대로 둔다(D8) |

사람 제거의 경합: 지금 `removeBacklogItem`(`edit-backlog.server.ts:69-85`)은 "보드에 열려 있는가"를 잠금 없이 `latestBoard`로 확인한 뒤 따로 `updateMany`한다. pm의 `propose`(`board-query.ts:161-181`)는 프로젝트 잠금과 Serializable 안에서 "백로그가 살아 있는가"를 본다. 제거의 확인이 끝난 뒤 pm의 제안이 커밋되고 그다음 제거가 `removedAt`을 찍으면, 보드에는 열린 `proposed` 행이 있는데 백로그는 "사람이 거절함"(`owner`)으로 남는다. 이 제안이 제거에 거절 기억의 뜻을 싣고 pm·scout가 사람과 동시에 움직이게 하므로, 제거를 `addBacklog`와 같이 보드 서비스(`createBoardQueries`)의 `inProjectTransaction` 안으로 옮기고, `propose`와 같이 `{ isolationLevel: "Serializable" }`로 연다: 잠금 안에서 `latestBoard(projectId, true, tx)`로 열린 행을 보고, 없을 때만 `removedAt`·`removedReason: "owner"`를 쓴다.

잠금만으로는 모자라다. `inProjectTransaction`의 첫 문장(`project.findUniqueOrThrow`, `board-query.ts:47`)은 잠금보다 먼저 돌고, Serializable인 `propose`의 스냅숏은 그 첫 문장에서 잡힌다. 제거가 잠금을 쥔 동안 `propose`가 시작하면, 잠금을 기다린 뒤에도 제거 전 스냅숏으로 백로그를 "살아 있음"으로 읽는다. 제거가 READ COMMITTED면 Postgres의 직렬화 검사는 Serializable 트랜잭션끼리만 보므로 이 충돌을 놓치고 둘 다 커밋된다. 제거도 Serializable이면 Postgres가 서로의 읽기를 고치는 충돌(제거는 보드 행을 읽고 제안은 보드 행을 만든다, 제안은 백로그 행을 읽고 제거는 그 행을 고친다)을 잡아 늦은 쪽을 40001(Prisma `P2034`)로 실패시킨다. 결과는 두 갈래 중 하나다. 제거가 먼저 커밋하면 제안은 지금처럼 오류로 끝나고(`board-query.ts:158-160`), 에이전트가 다시 부르면 `backlogExists` 거부를 받는다. 제안이 먼저 커밋하면 제거는 열린 행을 보고 "is open on the board"로 거부되거나 `P2034`로 끝난다. `removeBacklog`는 `P2034`를 잡아 "The item changed. Refresh and try again."으로 답한다(선례 `src/server/mcp/project-sync-query.ts:30-32`; 문장은 §6-1이 product-copy §8에 더하는 것과 같다). 그 `try`는 `inProjectTransaction` 호출을 감싸고 `P2034`가 아닌 오류는 다시 던진다. 내보낼 때는 `addBacklog`와 같이 `reportFailure(removeBacklog)`로 감싸고(`board-query.ts:435`) `board.ts:8`의 구조 분해 export에 더한다 — 열린 행·없는 행 거부는 `fail()`로 돌려도 `inProjectTransaction`이 `BoardRejection`으로 던지므로(`board-query.ts:53`) `reportFailure`가 결과로 되돌려야 웹 액션이 그 문장을 받는다. 감싸지 않으면 제거 버튼은 거부 문장 대신 "Couldn't remove it. Try again."을 보인다(`remove-backlog-button.tsx:27-28`의 `catch`). 웹 액션은 `board.removeBacklog`에 위임하고, 거부 문장은 지금 것(`:76`, `:82`)을 그대로 쓴다. 같은 요청을 두 번 보내면 둘째는 `removedAt: null` 조건에 걸려 "doesn't exist"로 끝나거나(지금과 같다), 첫째와 겹치면 `P2034`로 "The item changed. Refresh and try again."으로 끝난다 — 어느 쪽이든 행은 한 번만 바뀐다.

`discard` After:

```ts
async function discard(projectId: string, input: { key: string; userId: string; expectedUpdatedAt: Date }) {
  return inProjectTransaction(projectId, async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideDiscard(row.status);
    if (!d.ok) throw new BoardRejection(d.reason);
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: input.expectedUpdatedAt, status: row.status, discardedAt: null },
      data: { discardedAt: new Date(), updatedAt: nextTimestamp(row.updatedAt) },
    });
    if (u.count === 0) throw new BoardRejection("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: null, actor: "human", actorId: input.userId, channel: "web", note: "discard" } });
    // 게이트①에서의 폐기는 "이건 안 한다"다 — 백로그에서도 거절로 남겨 pm·scout가 다시 가져오지 않게 한다.
    // in_review에서의 폐기는 계획이 틀렸다는 뜻이라 항목은 후보로 남긴다.
    if (row.status === "proposed") {
      await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date(), removedReason: "discarded" } });
    }
    await closeRuns(tx, projectId, input.key);
    await closeRun(tx, row.id);
    return { ok: true as const, item: null };
  });
}
```

유지해야 할 불변식: 폐기의 보드 쪽 동작(CAS, 이벤트, run 닫기)은 그대로다. 추가되는 것은 `proposed`일 때 백로그 한 행의 갱신뿐이다.

### 6-1. 서버 — `plan_submit`의 `type`

`plan_submit`(`tools.ts:178`, `board-query.ts:341-361` `submitPlan`)에 선택 입력 `type`(`ITEM_TYPES` 중 하나)을 더한다. 입력 형은 세 곳이 같이 바뀐다: 도구 `inputSchema`에 `type: z.enum(ITEM_TYPES).optional()`, `ToolDeps.submitPlan`(`tools.ts:49`)과 보드 `submitPlan`의 `input`에 `type?: string`. `deps.ts:39`는 `input`을 그대로 넘기므로 고칠 것이 없다. `submitPlan`은 같은 트랜잭션에서 그 항목의 백로그 행을 이렇게 갱신한다.

| 백로그의 `typeSetBy` | `plan_submit`에 `type`이 있으면 |
| --- | --- |
| `null`(비어 있음) | `type`, `typeSetBy: "dev"`로 쓴다 |
| `"feature-scout"` 또는 `"dev"` | 같은 값이면 아무것도 안 한다. 다르면 덮어쓰고 `typeSetBy: "dev"` |
| `"owner"` | 쓰지 않는다. 제출한 type과 다를 때만 응답에 `typeKept: "owner"`를 싣는다. dev의 판단과 근거는 제출 전 계획서에 이미 기록한다(아래 커밋 순서) |

`plan_submit`은 dev와 main-loop가 부른다(`protocol.md:86`). 어느 쪽이 부르든 `typeSetBy`는 `"dev"`로 적는다 — "계획 단계의 에이전트"라는 뜻이다. 응답은 지금처럼 보드 행이고, 다른 사람 값을 지켰을 때만 `{ ...item, typeKept: "owner" }`로 필드 하나를 더한다. `submitPlan`에는 `planning` 전이 뒤의 `t.item` 반환과 `in_review` 재제출의 `item` 반환이 따로 있다(`board-query.ts:357-361`). 두 성공 분기 모두 이 필드를 붙이며, 거부·롤백에는 type 변경도 남기지 않는다.

동시성: `submitPlan`은 프로젝트 잠금(`inProjectTransaction`, `board-query.ts:342`) 안이지만 사람의 편집(`updateBacklogItem`)은 잠금 없는 `updateMany`다(`edit-backlog.server.ts:59-62`). 그래서 dev가 `typeSetBy`를 읽은 뒤 사람이 값을 바꾸면, 읽은 값으로 판단한 쓰기가 사람 값을 덮을 수 있다. 막는 방법은 **쓰기 자체에 조건을 거는 것**이다 — 위 표를 한 문장으로 쓴 조건: `tx.backlogItem.updateMany({ where: { id: row.backlogItemId, AND: [{ OR: [{ typeSetBy: null }, { typeSetBy: { not: "owner" } }] }, { OR: [{ type: null }, { type: { not: type } }] }] }, data: { type, typeSetBy: "dev" } })`(사람 값이 아니고, 값이 다를 때만 쓴다). `count === 0`이면 행을 다시 읽어 `typeSetBy === "owner"`이고 값이 다를 때만 `typeKept: "owner"`로 답한다 — 같은 값이라 안 쓴 경우는 아무것도 싣지 않는다. 사람 쪽 `updateBacklog`(§3)는 "값이 그대로면 `typeSetBy`를 건드리지 않는다"를 역시 조건부로 쓴다. 비교 기준은 **폼이 그려질 때의 값**이다. 편집 폼이 그때의 `type`을 숨은 입력 `typeBefore`로 함께 보낸다 — 화면이 그린 값으로 CAS하는 저장소 관례다(`src/fsd/features/review-gate/ui/inbox-card.tsx:52`의 `expectedUpdatedAt: item.updatedAt`). 액션 안에서 행을 다시 읽어 비교하면 화면을 그린 뒤 저장 전에 dev가 바꾼 값을 잡지 못한다. 액션은 폼 값(`field(form, "type")`, `field(form, "typeBefore")`)을 그대로 넘기고, `updateBacklog`가 먼저 둘을 `toItemType`으로 고친다: `const type = toItemType(input.type)`, `const typeBefore = toItemType(input.typeBefore)`. 빈 선택은 `""`로 오므로(`field`, `edit-backlog.server.ts:13`) 고치지 않고 쓰면 `type: ""`에 `typeSetBy: "owner"`가 붙어 §1의 불변식 `type === null ⇔ typeSetBy === null`이 깨진다. 서비스 안에서 고치므로 통합 시험이 `type: ""`를 넘겨 이 규칙을 직접 본다(Execution Plan 1). `type !== typeBefore`일 때만 `data`에 `{ type, typeSetBy: type === null ? null : "owner" }`를 더하고 `where`에 `type: typeBefore`를 넣는다. 제목·area·source와 같은 `updateMany` 한 번이므로 충돌이면 아무것도 저장되지 않는다. `count === 0`이면 행이 있는지 다시 읽는다. 없으면 지금 문장 "`${key} doesn't exist.`"(`edit-backlog.server.ts:63`), 있으면 "The item changed. Refresh and try again."(product-copy §8에 문장을 더한다)으로 답한다. 값이 그대로면 `where`에도 `data`에도 type이 없다. 같은 `plan_submit`을 두 번 불러도 결과가 같다(같은 값이면 쓰지 않는다).

커밋 순서: dev는 A-3에서 추론한 type과 근거를 계획서에 먼저 쓴다(예: `Plan classification: fix — <reason>. Any owner-set backlog type remains authoritative.`). 읽어 둔 백로그 type과 다르면 그 차이도 적되, 공개 `backlog_get`에는 `typeSetBy`가 없으므로 사람이 정한 값이라고 단정하지 않는다. A-4에서 그 파일의 실제 커밋을 확보한 뒤 `plan_submit({ key, path, commit, type })`을 한 번 제출한다. `typeKept: "owner"`는 보존 결과이며 제출 후 계획서를 다시 편집하라는 지시가 아니다. 이미 제출한 계획서의 판단을 유지하고 A-5의 Notes에 사람 값이 보존됐음을 보고한다. `plan_submit` 성공은 dev run을 닫고 그래프를 전진시킬 수 있어, 응답 뒤 문서를 고치면 `planCommit`과 디스크가 어긋나거나 게이트 없는 그래프에서 구현이 시작된 뒤 변경되는 문제가 생긴다. 이후 계획 수정이 정말 필요하면 기존 계획 재제출 절차를 따른다.

`type`이 없는 호출은 지금과 똑같다(하위 호환). 기존 계획 제출·전이 흐름(`claim`, `note: "plan"` 이벤트, `planning → in_review`)은 건드리지 않는다. 게이트②에서 사람은 dev가 확정한 종류를 인박스 카드의 칩으로 본다.

### 7. core/plugin — 기본 scout 질문, 항상 생성

- `packages/core/vars.mjs:16`: `scout: config.scout ?? { question: DEFAULT_SCOUT_QUESTION }`. `DEFAULT_SCOUT_QUESTION`은 같은 파일에 `export const`로 둔다(시험이 가져다 쓴다). 기본 질문은 `"What should change next in this repository — a defect you can point to in the code, or a feature its users need — and what is the evidence?"`로 한다(D18의 세 근거를 모두 여는 질문. 영문 — 사용자와 에이전트에게 보이는 문자열이라서, `vars.mjs:2`). `config.scout`(`packages/core/config.mjs:38`)는 그대로 `null`일 수 있고 기본값은 `buildVars`에서만 채운다 — `config.test.mjs:26`의 `scout null` 단언은 유지된다. 반면 서버 렌더 변수는 `buildVars`를 거치므로 기본값이 바뀐다: `src/server/agents/vars.test.ts:22,27`의 기대값 `scout: { question: "" }`를 `scout: { question: DEFAULT_SCOUT_QUESTION }`로 고친다(`src/server/agents/vars.ts:14`는 `scout: null`을 넘긴다). `npm run sync:plugin-lib`로 `plugin/lib/vars.mjs`에 반영한다.
- `plugin/bin/harness-init.mjs:222`: `const wanted = REPORT_AGENTS;` — scout 조건을 없앤다. 주석(`:220-221`)도 고친다.
- `packages/core/vars.mjs:21-23`의 주석("scout 없는 저장소의 feature-scout는 생성기가 쓰지 않는다", 런북의 "Report only" 표)도 고친다 — scout는 항상 내려가고(D4) 런북의 그 문구는 "Report agents"가 된다(§8). `plugin/lib/vars.mjs`는 sync로 따라온다.
- `plugin/skills/init/SKILL.md:162`의 "Not done here: creating backlog items (web), …"는 "creating backlog items (web, or feature-scout when the pipeline runs), …"로 고친다. 이 스킬이 하지 않는 일의 목록이지만 괄호가 백로그 항목이 생기는 자리를 말하므로 D3 뒤로 사실과 다르다. 같은 줄을 게이트 규칙이 바뀔 때도 고쳤다(`docs/proposals/completed/2026-09-10-configurable-pipeline.md:1441`). 플러그인 전달(§1 ④)로 나간다.
- `OPT_IN_NODES`(`packages/core/pipeline.mjs:44`)는 그대로다. 그래프 안 Scout 노드는 계속 opt-in이다. head의 scout는 그래프 노드가 아니다.

### 8. 템플릿 (`plugin/templates/en`, 중첩 저장소)

| 파일 | 변경 |
| --- | --- |
| `agents/feature-scout.md` | frontmatter `description`을 "Reads the repository, adds up to three items it has evidence for to the backlog, reports the rest. Never edits code."로 바꾼다(이 문장은 런북의 보고 에이전트 표 `{{report_table}}`로도 나간다, `vars.mjs:21-31`). `tools:`에 `mcp__harness__backlog_list`, `mcp__harness__backlog_add`를 더한다. Role 절 `:13-15`의 "You change nothing … **Deciding what to build is the owner's call.** You produce options with evidence."를 "You change no code. You add up to three items you have evidence for to the backlog; whether any of them gets built is the owner's call at the gates."로 바꾼다. Never 절(`:17-29`)의 "Add backlog items … You have no backlog tool at all"을 "Add what the owner removed or discarded, or more than three per run"으로, `:19` "Edit files — proposals are reported only. You have no write tool"을 "Edit files — you have no write tool"로 바꾼다. `:23-24` "Rank — what comes first is the owner's decision. You give evidence and cost; leave the order blank"는 두고, step:write가 최대 3건을 고르는 것과 부딪히지 않게 "Choosing up to three for the backlog is not an order — the rest stay in the report, unranked."를 덧붙인다(백로그에서 무엇을 먼저 할지는 여전히 pm과 게이트의 사람이 정한다). How you work의 `:45` `blocked` 설명 "(no question configured, nothing to read)"를 "(nothing to read)"로, `:49`의 "Legacy format:null and standalone PM omit binding metadata"를 "Legacy format:null, standalone PM, and feature-scout dispatched from the head (no entry handed to you) omit binding metadata"로 고친다 — head가 부른 scout는 entry 없이 돌고, 서버도 entry 없는 key 없는 호출을 바인딩 없이 받는다(`src/server/agents/run-query.ts:65-70`). step:start의 `:62-63` "Filling the backlog is entirely on the owner"는 "Without you, filling the backlog is entirely on the owner"로 고친다. `step:start`의 "When you run"(`:67-77`, 사람이 부를 때만 돈다·기록 도구가 없다·이전 결과는 건네받을 때만 거른다)을 "pipeline_next가 부른다 — 고를 후보가 없을 때(head), 또는 그래프에 Scout 노드가 있으면 그 자리에서. 먼저 `backlog_list({ includeRemoved: true })`로 지금 후보와 사람이 거절한 항목(`removedReason` owner·discarded)을 읽고, `docs/agents/feature-scout/scouting-log.md`가 있으면 마지막 절을 읽어 이미 보고한 제안과 겹치는 것을 거른다"로 바꾼다(그 로그는 main-loop가 head 힌트대로 덧붙인다, §5). `:82-83`("Send `ok` (note: whether you were handed a previous result and the backlog). No question configured … → `blocked`.")은 기본 질문(§7)으로 빈 질문이 없어지고 백로그는 scout가 직접 읽으므로 "Send `ok` (note: how many open items and how many removed or discarded items you read, and whether the scouting log had a previous section). `backlog_list` refused → `failed` (note: the server's sentence, as is)."로 바꾸고, 지시어 `:86` `on blocked: report`를 `on failed: report`로 바꾼다. 문장만 지우면 본문에 `` `blocked` ``가 없는데 `on blocked:`가 남아 `plugin/templates/templates.test.mjs:310`("blocked wording vs on blocked:")가 실패한다. `failed`인 이유는 이 템플릿의 outcome 정의가 도구 거부를 `failed`로 둔다는 것이다(`:44`). step:report `:209-210`의 "If you were blocked (no question, no repository to read)"는 "If you stopped early (the backlog couldn't be read, or no repository to read)"로 고친다. `step:research`의 `:99-101`("The owner shows you the backlog … you have no backlog tool")을 "이미 백로그에 있거나 거절된 것은 제안하지 않는다"로 바꾼다. `step:research`와 `step:report` 사이에 `step:write`를 넣는다. 연결: `step:research`의 `next: report`(`:174`)를 `next: write`로 바꾸고 `on blocked: report`는 둔다. `step:write`는 `next: report`, `on failed: report`다. `on failed:`가 없으면 `backlog_add`가 거부될 때(백로그 상한, run당 3건) scout가 이 단계에 머문다 — 엔진은 `on failed:` 없는 실패를 현재 단계에 둔다(`src/server/agents/steps.ts:9`). 본문은 outcome으로 `` `ok` ``(0~3건을 썼다 — 쓸 것이 없어 0건인 경우와 일부가 거부된 경우를 포함한다, note: 발급된 key와 거부가 있었으면 그 서버 문장)와 `` `failed` ``(쓰려던 것이 한 건도 들어가지 못했다, note: 서버 문장 그대로)만 이름 부르고 `` `blocked` ``는 말하지 않는다 — `plugin/templates/templates.test.mjs:304-316`이 본문이 부르는 outcome과 `on …:` 지시어의 1:1을 단언한다. 이 단계의 일: 쓰기 전에 `backlog_list({ includeRemoved: true })`를 다시 읽어, 이미 있거나 사람이 거절한(`removedReason` owner·discarded) 항목과 겹치는 제안은 쓰지 않는다(D7). step:start에서 읽은 것에 기대지 않는 이유: 멈췄던 run은 다른 세션에서 현재 단계부터 이어지므로(`hasResumableScoutRun`, §5 — `agent_next`는 현재 단계를 다시 준다, `feature-scout.md:50-51`) 이 단계에서 시작한 scout는 start의 읽기를 모른다. 그다음 근거 세 종류 중 scout가 필요하다고 판단한 제안을 최대 3건, `backlog_add({ runId, title, area, source, type })`로 쓴다(D18). source는 D19 형식이다. source에는 scout가 확인한 사실을 scout의 문장으로 쓴다 — 외부 페이지의 문장을 옮겨 적지 않고 URL로 가리킨다(Risks "외부 글"). `type`은 our hole이면 대개 `fix`, competitor·users ask면 대개 `feat`이지만 판단은 scout의 몫이다. area는 제안이 떨어질 워크스페이스 경로다(새 기능이라 아직 파일이 없어도 워크스페이스는 적는다). 그 워크스페이스는 에이전트 표(`{{roster_table}}`, step:research `:97`)에 있어야 한다 — 담당이 없는 곳에 떨어지는 제안(보고서의 Cost가 none)은 쓰지 않고 보고서에만 남긴다. pm은 표 밖 area를 고르지 않는데(`pm.md:59-61`) 그런 항목도 후보로 세어져(`availableBacklogCount`는 표를 모른다, `board-query.ts:112-119`) scout가 다시 돌지 못하고 pm 디스패치만 쓰게 된다. `runId`는 현재 단계 영수증의 `runId`다. 호출이 실패하거나 시간이 초과되면 다시 부르기 전에 `backlog_list`로 이미 들어갔는지 확인한다(§3 재전송 판단). 쓰지 않은 제안은 보고서에만 남긴다. 보고서 형식에 `[Added to backlog]` 절(발급된 key, type)을 더한다 |
| `agents/dev.md` | `step:plan`의 A-2(`:115-127`)는 "제목만으로 문제를 정의하면 틀린 문제에 대한 좋은 계획이 된다"고 경고하고, area는 "경로가 없으면"만 다룬다. D13·D14로 사람이 Title만 쓴 항목(source·area 없음)이 정상 경로가 되므로 두 경우를 더한다: source가 비어 있으면 제목과 코드에서 문제를 정의하고 계획서의 `## Problem` 절(`plugin/templates/en/docs/plans/template.md:20`)에 "source empty — problem inferred from title and code"와 가정을 적는다(사람이 게이트②에서 본다). area가 비어 있으면 "경로가 없을 때"와 같이 제목과 실제 호출 경로로 대상을 찾고 "area unset"을 적는다. 대상을 끝내 못 찾을 때만 지금처럼 A-4에서 보류한다. Never 절 `:51`의 "Add backlog items — the backlog is web only."는 규칙(dev는 항목을 추가하지 않는다)은 그대로 두고 이유만 "only feature-scout adds items; problems you find go in your output as notes"로 고친다. 계획 단계의 A-3·A-4·A-5를 §6-1의 커밋 순서로 고친다: 추론 type·근거·현재 백로그 type과의 차이를 A-3 계획서에 기록 → A-4 실제 커밋 확보 → `plan_submit({ key, path, commit, type })` → A-5 결과 보고. `typeKept: "owner"`는 Notes로 보고하고 제출 후 파일을 고치지 않는다. frontmatter `tools:`는 이미 `mcp__harness__plan_submit`을 가진다(`dev.md:4`) |
| `agents/pm.md` | Never `:25`의 area 추정 금지는 저장된 area를 쓰거나 바꾸지 않는다는 뜻으로 명확히 하고, 빈 area에서 담당 agent만 추정하는 D11은 허용한다고 적는다. `:119-120`의 agent 입력 설명도 빈 area 배정 규칙을 가리키게 한다. `:59-61` "Don't pick items outside these areas"와 `:126-130` 빈 area 문단을 고친다. 빈 area이고 워크스페이스가 하나면 그 dev에게 배정한다. 여럿이면 title과 source로 추정해 배정하고 reason에 `area unset — guessed` 를 넣는다. 채워진 area가 표 밖이면 지금처럼 고르지 않는다. frontmatter `tools:`는 그대로다(pm은 쓰지 않는다) |
| `docs/plans/template.md` | `## Problem` 안내(`:22-30`)는 "The requirement comes from the backlog item's evidence (`source`)", "Don't drop the source and rewrite the problem from the code alone", "Rewriting the problem from the title alone produces a good plan for the wrong problem"이다. D13·D14로 Title만 쓴 항목이 정상 경로가 되면, dev.md A-2의 새 지시(source가 비면 제목과 코드에서 문제를 정의)를 dev가 채우는 이 템플릿이 금지하게 된다. source가 있으면 지금 규칙 그대로 두고, source가 비었으면 "source empty — problem inferred from title and code"와 가정을 적어 게이트②에서 사람이 확인하게 한다는 문장을 더한다. init이 사용자 저장소에 쓰는 관리 파일이다(`plugin/bin/harness-init.test.mjs:21` 픽스처) |
| `CLAUDE.runbook.md` | `:11`의 "(web) Backlog · Board · Inbox" 행 "Editing is web only; reading is through `mcp__harness__*` tools"를 "Editing and removing are web only; feature-scout adds items with `backlog_add`; reading is through `mcp__harness__*` tools"로 바꾼다. `:29` "Report only — these write nothing; …"은 feature-scout가 이제 백로그에 쓰므로 "Report agents — these change no code; feature-scout also adds backlog items. Each is exactly the agent file `/harness:init` put in `.claude/agents/`:"로 바꾼다(`harness-init.test.mjs:31`의 런북 픽스처는 이 문장이 아니라 자체 문자열이라 영향이 없다). `:72` "names the head (dispatch `pm`, or nothing)"을 "(dispatch `feature-scout` when nothing is left to pick, else `pm`, or nothing)"으로 바꾼다. `:118-121`의 "**Adding them is the owner's job, in the web backlog** — editing the backlog is web only; neither agents nor the main loop can."은 "Tell the owner; adding them is the owner's call, in the web backlog — the main loop can't add backlog items, and feature-scout adds only what its own run finds."로 문장 전체를 바꾼다(뒤 절 "neither agents … can"만 남기면 거짓이 된다). "feature-scout가 다음 run에 판단한다"고 쓰지 않는 이유: scout에게는 계획서의 범위 밖 목록을 읽으라는 지시가 없다(scout 단계가 가리키는 입력은 백로그, `scouting-log.md`, 워크스페이스의 코드와 knowledge 문서, 바깥 페이지다). 그렇게 쓰면 런북이 없는 동작을 약속한다. 이어지는 "A follow-up that isn't added vanishes from pm's input"은 그대로다. `:167`(Pipeline execution identity)의 "Standalone PM has no entry."는 "Standalone PM and the feature-scout the head dispatches have no entry."로 고친다 — feature-scout는 그래프 Scout 노드로 불릴 때 slots-v1 entry를 받으므로, 메인 루프가 head scout에 entry가 없는 것을 호환성 실패로 읽지 않게 한다(scout 쪽 `:49`를 고치는 것과 같은 이유) |

템플릿은 DB로 배포된다(`plugin/templates/README.md`). `plugin/templates/`는 stagekeeper가 gitignore하는 중첩 저장소다(origin `Sangeok/harness-templates`, private — `.gitignore:50-51`). 그래서 §8의 템플릿과 `plugin/templates/templates.test.mjs` 변경은 이 제안의 stagekeeper PR에 실리지 않는다. 그 저장소에 따로 커밋·푸시하고, stagekeeper PR 본문에 그 커밋을 적는다. 변경 뒤 로컬에서는 `npm run test:templates`를 돌리고, 대상 DB의 `npm run seed:templates`는 §1 배포 순서의 ③(서버 배포 뒤)에서 한다. `test:templates`는 "tools: 계약"과 "단계 본문은 scout 변수를 쓰지 않는다"(`src/server/agents/vars.ts:4`)를 지킨다. 기본 질문은 스텁(Role 절)에서만 쓰이므로 그 계약과 충돌하지 않는다.

### 9. 웹

**백로그 폼**(`src/fsd/features/edit-backlog/ui/backlog-form.tsx:27-55`):
- Key 필드를 지운다(추가와 편집 모두. 편집은 이미 Key를 숨긴다 `:30-34`).
- `Area` 라벨을 "Area (optional)"로 바꾸고, 힌트 "Leave it empty if you don't know — the agents will find it."를 더한다(지금 Area 칸에는 힌트가 없고 placeholder `src/server/pipeline`만 있다, `backlog-form.tsx:38-40`. placeholder는 그대로 둔다).
- `Source` 라벨을 "Source (optional)"로, `SOURCE_HELP`(`backlog-form-state.ts:17`)를 "What you want and why. Leave the code to the agents."로 바꾼다. 그 위 주석(`:16` "증거 작성 규칙(protocol.md). 폼 도움말과 같은 문구를 쓴다.")은 "사람용 source 안내. 관측/진단 규칙은 scout의 source 형식(D19)과 protocol.md가 맡는다"로 고친다. 라벨은 계속 Source다(Evidence와 구분하는 이유는 `backlog-form.tsx:41-43` 주석 그대로).
- `Type (optional)` select를 Title 아래에 둔다. 선택지는 빈 값(`—`)과 `feat` · `fix` · `refactor` · `docs`. 편집 폼에서도 같고, 편집 폼은 초안과 함께 보관한 `typeBefore`를 숨은 입력으로 보낸다(`typeSetBy` 규칙은 §3의 `updateBacklog`, 충돌 판정은 §6-1). 아래 수명 규칙을 따른다.
- 저장 뒤 발급된 key를 따로 알리지 않는다(D20). 표가 `createdAt` 오름차순(`board-query.ts:123`)이라 새 행이 맨 아래에 key와 함께 나타난다.

**편집 초안과 비교 기준의 수명**: `backlog-form.tsx:18`은 `useState(item ?? emptyValues)`이고 페이지는 `key={editing.item.key}`를 쓴다. 같은 항목의 서버 props가 갱신돼도 입력 초안은 남는다. 그러므로 `typeBefore`도 초안과 함께 최초 렌더 값으로 저장하고, 숨은 입력을 최신 `item.type`에 직접 연결하지 않는다. 배경 refresh만으로 비교 기준을 바꾸면 오래된 초안이 새 서버 값을 덮을 수 있다. 성공한 편집에서 사용자가 type을 실제 변경했다면 비교 기준을 방금 제출해 저장한 type으로 갱신한다. type을 변경하지 않은 저장은 비교 기준도 그대로 둔다(그 사이 dev가 바꾼 값을 초안이 읽었다고 간주하지 않는다). 실패하면 초안·비교 기준을 모두 보존하고, 충돌 뒤에는 브라우저 전체 새로고침으로 최신 값을 다시 읽은 다음 편집한다. 같은 항목의 연속 저장은 정상 동작해야 하며, 다른 key의 편집은 기존 React key로 새 초안을 연다. 근거: 설치된 Next.js 16.3.3의 `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`는 refresh가 클라이언트 상태를 보존한다고 명시하고, `revalidatePath.md`는 Server Action에서 현재 화면을 갱신한다고 명시한다. [React useState 문서](https://react.dev/reference/react/useState)도 초기 인자를 이후 렌더에서 다시 적용하지 않는다고 설명한다.

**백로그 표**(`backlog-table.tsx:9-16,33-40,50-68`): `BacklogRow`에 `type`·`addedBy`·`removedReason`을 더한다(`removedReason`은 아래 "Removed" 칸의 사유 표시에 쓴다). 열 순서는 Key · Type · Title · Added by · Area · Board status. Type은 칩(`feat`/`fix`/`refactor`/`docs`, 없으면 `—`), Added by는 `feature-scout` / `You`. 빈 area는 `—`로 표시한다. 제거된 행의 "Removed" 칸은 사유를 보인다: `done` → `Done`, `owner` → `Removed`, `discarded` → `Discarded`. 사유가 없는 행(`removedReason` null — 백필은 모든 제거 행을 채우지만 시험 픽스처처럼 필드가 없는 행)은 지금처럼 `Removed`다. 그래서 `backlog-table.test.mjs:12`의 `>Removed</span>` 단언은 그대로 통과하고, 같은 시험에 `done`·`discarded` 두 행을 더해 사유 표시를 단언한다. `addedBy`가 없는 행은 `You`, `type`이 없는 행은 `—`로 보인다. 열이 둘 늘므로 빈 표 행의 `colSpan={5}`(`backlog-table.tsx:45`)를 7로 고친다. 빈 표 문장(`:46`) "No backlog items yet. Add the first one below."는 사람의 작성을 첫 단계로 안내하므로(Goal과 반대) "No backlog items yet. Run the pipeline in Claude Code and feature-scout adds the ones it has evidence for, or add one below."로 바꾼다("adds some"이라고 하지 않는다 — 근거가 없으면 0건이다, D6. "may"로 흐리지 않는 것은 product-copy §1 "no hedging")(쓰기 권한이 없을 때의 "No backlog items yet."은 그대로). 이 문장을 단언하는 시험은 없다(`rg -a "No backlog items"`는 이 줄과 product-copy §8 `:333`만 찾는다).

**라우트와 페이지 배선**: `src/app/(app)/p/[slug]/backlog/page.tsx`는 행을 필드별로 골라 넘긴다(`rows={items.map(({ key, title, area, source, status, removedAt }) => …)}`, 편집 항목도 `{ key, title, area, source }`). 여기에 `type`·`addedBy`·`removedReason`(행)과 `type`(편집 항목)을 더한다. `src/fsd/pages/project-backlog/ui/project-backlog-page.tsx`의 props와 `backlog-form.tsx:11`의 `item` 형에도 `type`을 더한다. `backlogWithStatus`(`board-query.ts:121-128`)는 전체 행을 돌려주므로 질의는 그대로다.

**인박스 카드**(`src/fsd/features/review-gate/ui/inbox-card.tsx`, 행 모양은 `model/inbox-item.ts`): 카드 머리에 type 칩을 더한다. 보드 행이 이미 `backlogItem`의 `key`·`title`·`area`를 싣고 있으므로(`board-query.ts:62,88` select) `type`을 그 select에 더한다. 받는 쪽은 `inbox-item.ts:63`의 행 형(`backlogItem: { key; title; area }`)과 `:82-84`의 매핑이고, 시험 픽스처는 `inbox-item.test.ts:29`다. `:62`의 select는 MCP `board_list` 응답(`BoardRowView`, `tools.ts:34`)에도 실리므로 에이전트가 보는 JSON에 `type`이 하나 더 생긴다(하위 호환). 칩의 자리와 문구는 구현 시 product-copy §6 "Decision card"의 Header 행(`:262` — key · area, 제목, 상태 줄 순서)에 먼저 적는다. §7 Inbox는 카드가 §6의 decision card라고만 적는다(`:319`). type 칩은 백로그 표(`edit-backlog`)와 인박스 카드(`review-gate`) 두 feature가 각자 shared `Chip`으로 값을 그대로 그린다(둘 다 이미 가져온다, `backlog-table.tsx:5`·`inbox-card.tsx:9`). 같은 층의 다른 slice는 import할 수 없으므로(`docs/architecture/fsd.md:72`) 한쪽 feature에 칩 컴포넌트를 만들어 다른 쪽이 가져다 쓰지 않는다.

**첫 실행 배너**(`src/fsd/widgets/turn-banner/model/turn.ts`):

Before (`:57-86`): 네 단계(`token` · `connect` · `backlog` · `pm`). 세 번째가 `setup.backlogCount > 0`으로 끝난다.

After:

```ts
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
      detail: "Open it in Claude Code with the token set and run /harness:init. It connects the repository and tells you when to restart.",
      done: setup.rosterSynced,
    },
    {
      key: "run",
      title: "Run the pipeline in Claude Code",
      detail: "feature-scout reads the code and adds up to three backlog items; pm puts up to two on the board for your approval. With no Propose node, put one on the board from the Backlog tab.",
      // 이 목록은 보드가 비어 있을 때만 만들어진다 — 그래서 마지막 단계는 아직 끝날 수 없다.
      done: false,
    },
  ];
}
```

- 3단계 문장의 둘째 문장은 Propose 노드가 없는 그래프(D16)를 위한 것이다. product-copy §5에는 "a pipeline with no Propose node says 'Put an item on the board from the Backlog tab' instead"(`:225-226`)라는 분기가 적혀 있지만 코드에는 그 분기가 없다(`setupSteps`는 `SetupState`만 받고 그래프를 모른다, `turn.ts:24,57`). 분기를 새로 만들지 않고 두 경우를 모두 말하는 detail 하나로 쓰며, product-copy의 분기 문장은 지운다.
- `SetupStep["key"]`를 `"token" | "connect" | "run"`으로 바꾼다. `SetupState.backlogCount`와 그 조회(`turn-data.server.ts:14,18,66`)는 쓰는 곳이 없어지면 지운다.
- `HEADLINE.setup`(`turn.ts:48`)을 `"Set up in three steps"`로, `turn-banner.tsx:95`의 하드코딩 `of 4`를 `of ${turn.steps.length}`로 바꾼다.
- 링크: 3단계에는 링크가 없다. `turn-banner.tsx:192`의 `step.key === "backlog"` Backlog 링크 줄을 지운다 — `SetupStep["key"]`에서 `"backlog"`가 빠지면 이 비교는 타입 오류(TS2367)다. 1단계 Tokens 링크(`:191`), 2단계 "Not connected yet" 칩(`:193`)은 그대로다.
- `turn.ts:54` `NONE_DETAIL`("Pick the next item from the backlog, or run pm in Claude Code to pick for you.")은 열린 항목이 없을 때의 안내다(`deriveTurn` `:213`). 백로그가 비면 head가 부르는 것은 pm이 아니라 scout이므로 "run pm … to pick for you"는 틀린 안내가 된다. "Pick the next item from the backlog, or run the pipeline in Claude Code — when the backlog is empty, feature-scout looks for items to add."로 바꾼다("fills"라고 하지 않는다 — 0건일 수 있다, D6. 이미 본 백로그면 돌지 않는데, 그때는 `pipeline_next`의 `none` 사유가 그렇게 말한다, D17). 같은 문장이 product-copy §5 표(`:179`)에 있다. 이 문장을 단언하는 시험은 없다(`turn.test.ts`는 `kind`만 본다 `:125,164,174`). `turn-banner.tsx:107`의 "Open backlog →" 버튼은 그대로다.

**Pipeline 탭**(`src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx:146`): 그래프에 Scout 노드가 없을 때 보이는 "Scout runs only with harness.json.scout — add it here when that is set."은 D4 뒤로 거짓이다(scout는 설정 없이도 생성되고 head로 돈다). "Scout also runs on its own when nothing is left to pick. Add it here to scout after each accepted item."로 바꾼다. 표시 조건도 고친다. 지금 조건은 `state.nodes.includes("scout")`(`:145`)라 옛 별칭 `scout`만 본다. 레일의 "Add feature-scout here"·"at end"는 `addSlot`으로 `feature-scout`·`feature-scout#2` id를 만들고(`rail-state.ts:22-31`), 옛 `scout`도 편집하면 `normalizeSlots`가 `feature-scout`로 바꾼다(`:14-20`, 별칭은 `packages/core/pipeline.mjs:11,18`). 그래서 지금은 Scout 슬롯이 있어도 이 안내가 보인다. 레일이 이미 `@harness/core/pipeline.mjs`를 가져오므로(`pipeline-rail.tsx:5` — 지금은 `slotAgent`가 그 import 목록에 없다) 그 줄에 `slotAgent`를 더하고, `state.nodes.some((id) => slotAgent(id) === "feature-scout")`이면 숨긴다. 같은 문장이 product-copy §18(`:1016`)에 있으므로 거기부터 고친다. 이 문장을 단언하는 시험은 없다(`rg -a "Scout runs only" src`는 이 한 줄만 찾는다). 표시 조건은 렌더 시험 `pipeline-rail.test.mjs`에 `feature-scout` 슬롯이 있는 그래프(안내 없음)와 Scout 노드가 없는 그래프(안내 있음)를 더해 단언한다.

**Tokens 탭**(`src/fsd/pages/project-tokens/ui/project-tokens-page.tsx:74-75`, product-copy §9 Tokens `:353-355`): 안내문 "An agent token can't approve or edit the backlog — approving is yours, in the Inbox or with an owner token below; the backlog is web only."은 `backlog_add` 뒤로 사실이 아니다. "An agent token can't approve gates or edit and remove backlog items — approving is yours, in the Inbox or with an owner token below. feature-scout can add up to three backlog items a run."로 바꾼다. product-copy를 먼저 고치고 화면을 같은 커밋에서 따라 고친다(`verification.md:93-95`).

**인박스 도움말**(`src/fsd/features/review-gate/ui/inbox-card.tsx:138`, product-copy §6 "Decision card"의 "What this decision does" 목록 `:285`): "What this decision does" 목록의 "Discard can't be undone."은 D8로 폐기의 뜻이 상태마다 달라졌는데 그것을 말하지 않는다. "Discard can't be undone. At Proposed it also takes the item out of the backlog, so pm can't pick it again; at In review the item stays in the backlog."로 바꾼다. "agents won't bring it back"이라고 쓰지 않는 이유: pm이 다시 못 고르는 것은 서버가 지키지만(제거된 항목은 `backlogExists`가 거부), scout가 같은 일을 다시 쓰지 않는 것은 템플릿 지시일 뿐이다(Risks "거절 판단은 모델의 판단이다") — 화면은 서버가 지키는 것만 약속한다(product-copy §16 "Claims we don't make"). 확인 문구(`reject-actions.tsx:114` "This can't be undone. Discard {id}?")는 항목 상태를 받지 않으므로 그대로 둔다. 이 문장을 단언하는 시험은 없다.

**Board Team row**(`src/fsd/pages/project-board/model/briefing.ts` `buildBriefing`): Team row는 **그래프 노드**가 디스패치하는 에이전트만 그래프 순서로 보인다. head scout는 노드가 아니므로 나타나지 않는다. 코드는 그대로 두고, product-copy §6(`:299-303`)의 "The default pipeline has no feature-scout"에 "feature-scout also runs outside the graph when nothing is left to pick and the backlog has changed since it last looked; the Team row lists graph nodes only, so it appears there only with a Scout node."를 더해 설명이 사실과 맞게 한다("whenever nothing is left to pick"이라고 쓰지 않는 이유: 변화가 없으면 다시 돌지 않는다, D17).

### 10. 문서

| 문서 | 변경 |
| --- | --- |
| `docs/architecture/protocol.md` | MCP 도구 표(`:78-94`)에 `backlog_add` 행을 추가한다(입력, 효과, 누가 feature-scout, 거부 사유). 프로젝트 사용 상태 절 `:53`의 "나머지 12개 agent 도구"를 13개로, `:66`의 "아래 13개 도구 전부가 선택 입력 `project`를 받는다"를 14개로 고친다(`backlog_add`도 `project`를 받는다, §4). `:94`의 "에이전트 서버에 등록되지 않은 것"은 이미 "백로그 편집·삭제"라 그대로 참이다(추가만 등록된다) — 고치지 않는다. `pipeline_next` 행의 head 설명(`:90`)을 scout/pm으로 바꾼다. `plan_submit` 행(`:86`)에 선택 입력 `type`과 §6-1의 덮어쓰기 규칙을 더한다. 백로그 작성 규칙(`:236-244`)을 작성 주체별로 나눈다(scout: area(에이전트 표에 있는 워크스페이스 경로)·type 필수, D19 Evidence 형식 / 사람: Title만 필수). `:238`의 "웹 백로그 폼 도움말도 같은 규칙을 말한다"는 지운다(§9로 폼 도움말이 자유 글 안내가 된다). key 발급(`ITEM-NN`)과 `type`·`typeSetBy` 규칙을 적는다. 제거 사유(`removedReason`) 규칙과 게이트① 폐기 규칙을 추가한다. `backlog_list` 행(`:80`)의 호출자 "pm·dev·doc-auditor"에 feature-scout를 더한다(§8에서 scout의 `tools:`에 들어간다). 재열기 행(`:144-145`)의 "백로그 `removedAt`을 복원한다"는 "`removedAt`·`removedReason`을 지워 복원한다"로 고친다(§6 재열기). 「실행 결합」(`:166`)의 "항목 생성 전 PM은 결합 없는 실행이다"에 head가 부르는 feature-scout를 더한다 — 런북 `:167`을 고치는 것과 같은 이유다(§8) |
| `docs/architecture/invariants.md:40-43,55-58` | 코드 강제 목록의 "백로그 편집"을 "백로그 편집·삭제(추가는 feature-scout에 한해 `backlog_add`, run당 3건)"로 좁히고, 불변식 4(게이트는 사용자만)는 그대로라는 근거를 한 줄 더한다(§4). 불변식 8의 설명(`:55-58`)에서 "`완료`는 백로그의 `removedAt` 표기다"를 "백로그에서 빠지는 것(완료·사람 제거·게이트① `proposed` 폐기)은 `removedAt`과 사유 `removedReason` 표기다"로, reopen이 "백로그 `removedAt`과 `acceptedAt`을 되돌린다"를 "백로그 `removedAt`·`removedReason`과 `acceptedAt`을 되돌린다"로 고친다(§6) |
| `docs/architecture/system-overview.md:31` | "Claude Code 에이전트" 행의 할 수 있는 일에 "feature-scout의 백로그 추가(run당 3건)"를 더한다. `:32`(소유자 토큰은 백로그 편집 불가)는 그대로다 |
| `docs/architecture/sources.md:22,25` | `:22` "보고만. `backlog_add`는 주지 않는다(제안은 사람이 등록)" → "근거가 있는 제안을 `backlog_add`(run당 3건, 쓸지는 scout 판단). 결정은 게이트에서 사람이 한다". `:25`의 `TASK_BACKLOG.md` 머리말(관측/진단 분리 등)의 새 자리 "웹 백로그 편집 폼의 도움말 + `docs/protocol.md`"는 폼 도움말이 자유 글 안내로 바뀌므로(§9) "feature-scout의 source 형식(D19) + `protocol.md` 백로그 작성 규칙"으로 고친다 |
| `docs/architecture/rationale.md` | scout 역할 변경 근거를 적는다: 통제를 쓰기에서 게이트 결정으로 옮긴 이유, 거절 기억(D7·D8). `:65-66`("범위 밖 의존 후속 등재는 웹 백로그에 사용자가 등재한다 — 백로그 편집이 웹 전용이라 에이전트도 메인 루프도 쓸 수 없기 때문")은 런북 변경(§8, `:118-121`)에 맞춰 고친다. `:84`는 2026-08-30 스모크의 기록이라 그대로 둔다 |
| `docs/investigations/active/harness-platform.md:177,1090` | 고치지 않는다. v2 스펙의 기록("`scout.question` 있을 때만")이고, 현재 구조의 기준은 `docs/architecture/`다(`AGENTS.md`). 스펙과 달라지는 이유는 위 `rationale.md` 행에 적는다 |
| `docs/conventions/product-copy.md` | §5 First run(`:220-227`) 세 단계와 Strip 문구(코드에 없는 no-Propose 분기 문장 `:225-226` 삭제, §9), §5 "Nothing open" 행(`:179`)의 `NONE_DETAIL`과 "first run" 행(`:180`)의 머리글 "Set up in four steps"(→ "Set up in three steps", `turn.ts:48`과 같이), §6 Team row(`:299-303`) head scout 설명, §6 "Decision card"(`:260-286`)의 Header type 칩(`:262`)과 도움말의 Discard 문장(`:285`), §8 Backlog(`:328-`) 폼·표·오류(빈 표 문장 `:333`, Key 관련 오류 두 개 삭제, Type 칸, 편집·제거 충돌 문장 "The item changed. Refresh and try again." 추가), §12 Server messages(`:564`)의 head 사유 행("the backlog has nothing to pick — add an item on the Backlog tab"을 "feature-scout already looked at this backlog — it looks again after the backlog changes; add an item on the Backlog tab"으로)과 새 사유 행 "a Scout node in items dispatches feature-scout — that run looks for items to add", 그리고 `addBacklog`가 MCP `backlog_add`에 돌려주는 새 거부 사유 행 둘("backlog_add needs an open feature-scout run" · "this run already added 3 items" — §12는 보드 서비스가 MCP와 웹에 돌려주는 사유의 목록이다, `:555-556`), §13 MCP tool descriptions(`:611-`)의 HINT 문장과 `backlog_add`·`plan_submit` 설명, 그리고 `pipeline_next` 행(`:626`)의 head 설명("whether it is pm's turn" → pm 또는 feature-scout의 차례, 사유 목록의 옛 사유를 §5의 새 사유 둘로 교체, "pm's own run for the head" → "pm's or feature-scout's own run for the head"), §14 Generated templates(`:650-`)의 `agents/feature-scout.md` 절(`:723-730` — description `:725`의 "Runs when previous proposals are used up or when asked. Never touches code or the backlog."는 §8의 새 frontmatter description으로 바꾸고, `:729` "Don't rank …"는 둔다. Output 줄 `:730`에 `[Added to backlog]`를 더한다. `agents/pm.md` 절 `:657-672`에는 빈 area 규칙을 말하는 문장이 없어 고칠 것이 없다), §14 `CLAUDE.runbook.md` 절 Cycle 요약(`:745` "1 pm proposes") 앞에 head의 feature-scout(고를 후보가 없을 때 백로그에 쓸 것을 찾는다 — "fills"라고 쓰지 않는 이유는 §9. 번호 없이 덧붙이고 1~8은 밀지 않는다 — 같은 절 Where things stand 예시의 "(step 5)"(`:743`)와 §16의 "at 1, 3, 6 and 8"·"at 3, 4, 6 and 7"(`:909-911`)이 이 번호를 가리킨다), §18 Pipeline tab Scout 안내(`:1016`), §9 Tokens 안내문(`:353-355`). **예시 key `FEAT-01`을 `ITEM-01`로** 바꾼다(`rg -a -c FEAT-01`로 36곳) |
| 예시 key가 박힌 그 밖의 곳 | `FEAT-01` → `ITEM-01`: `plugin/templates/en/CLAUDE.runbook.md`, `plugin/templates/en/docs/plans/README.md`, `src/fsd/pages/landing/ui/landing-page.tsx`(`rg -a -l FEAT-01`로 찾은 목록. 저장소 루트에서 돌리면 gitignore된 `plugin/templates`를 건너뛰므로 앞의 두 템플릿 파일은 `--no-ignore`나 그 저장소 안에서 찾는다. 같은 명령이 찾는 `backlog-form.tsx`의 Key placeholder와 `edit-backlog.server.ts:21`의 Key 오류는 Key 칸과 함께 지워진다(§3·§9)). 시험 데이터의 `FEAT-NN`은 바꾸지 않는다 — 옛 key는 기존 프로젝트에 계속 남는 모양이다(D20). `src/fsd/pages/project-board/model/briefing.fixture.mjs`는 `FEAT-01`~`FEAT-07`이 한 보드를 이루고, `briefing.test.mjs:26,48`과 `project-board-page.test.mjs:25`가 그 key를 그대로 단언한다 — `FEAT-01`만 바꾸면 이 시험들이 깨진다. `turn.test.ts`·`inbox-item.test.ts`·`run-rules.test.mjs`·`board-rules.test.mjs`의 `FEAT-01`도 같은 이유로 둔다. copy-lock 블록이 걸린 문장은 product-copy와 코드가 같이 바뀌어야 한다 |

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `prisma/schema.prisma` + `prisma/migrations/<timestamp>_backlog_authorship/migration.sql` | update/create | §1 열 5개(`type`·`typeSetBy`·`addedBy`·`addedByRunId`·`removedReason`) 추가, 백필 | medium — 백필 규칙이 틀리면 거절 기억이 어긋남 |
| `packages/core/backlog.mjs` → `plugin/lib/backlog.mjs`(sync) | create | §1·§2·§3 `ITEM_TYPES`·`toItemType`·`nextItemKey`·`SCOUT_ITEMS_PER_RUN` | low |
| `src/server/pipeline/board.ts` | update | §3 `addBacklog`·`updateBacklog`, §6 `removeBacklog` export | low |
| `src/fsd/features/edit-backlog/api/edit-backlog.server.ts` | update | 추가·편집·제거를 보드 서비스로 위임(§3, §6) | low |
| `src/fsd/features/edit-backlog/model/backlog-form-state.ts` | update | `SOURCE_HELP` 문구 갱신, `BACKLOG_KEY_RE`만 제거 | low |
| `src/fsd/features/edit-backlog/ui/backlog-form.tsx`, `backlog-table.tsx` | update | §9 | low |
| `src/app/(app)/p/[slug]/backlog/page.tsx`, `src/fsd/pages/project-backlog/ui/project-backlog-page.tsx` | update | §9 행·편집 항목에 새 필드 | low |
| `src/server/mcp/tools.ts`, `deps.ts`, `views.ts` | update | §4 `backlog_add`, 뷰 필드·중첩 응답 투영, §6-1 `plan_submit`의 `type` 입력(`ToolDeps.submitPlan` 형 포함), §5 `scoutNodePending` | medium — 새 에이전트 쓰기 경로 |
| `src/server/pipeline/run-rules.ts`, `run-query.ts` | update | §5 head 판정 | medium — 디스패치 루프 위험(아래 리스크) |
| `src/server/pipeline/board-query.ts` | update | §3 `addBacklog`(프로젝트 잠금)·`updateBacklog`(조건부 쓰기, §6-1), §6 `removeBacklog`(프로젝트 잠금 + Serializable, `P2034` 응답)와 완료·재열기·폐기의 사유, §6-1 `submitPlan`의 type, 보드 행 select에 `type` | medium — 폐기·계획 제출 트랜잭션 확장 |
| `src/fsd/features/review-gate/ui/inbox-card.tsx`, `model/inbox-item.ts` | update | §9 type 칩, 도움말의 Discard 문장 | low |
| 예시 key `FEAT-01`이 박힌 파일들 | update | §10 `ITEM-01`로 | low — 문구만. copy-lock 대조 필요 |
| `src/fsd/widgets/turn-banner/model/turn.ts`, `ui/turn-banner.tsx`(`:95`, `:192`), `api/turn-data.server.ts` | update | §9 배너 | low |
| `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx`(`:5` import에 `slotAgent`, `:145-146`) | update | §9 Pipeline 탭 Scout 안내 문구와 표시 조건 | low |
| `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx`(`:74-75`) | update | §9 Tokens 탭 안내문 | low |
| `packages/core/vars.mjs` → `plugin/lib/vars.mjs` | update | §7 기본 질문(sync 스크립트) | low |
| `plugin/bin/harness-init.mjs` | update | §7 scout 항상 생성 | low — 기존 저장소는 재init 때 feature-scout 파일이 생긴다 |
| `plugin/skills/init/SKILL.md`(`:162`) | update | §7 "Not done here" 줄 | low |
| `plugin/.claude-plugin/plugin.json` | update | §1 ④ `version` `0.3.3` → `0.3.4`(설치본이 새 init·`vars.mjs`·`backlog.mjs`를 받게) | low — 올리지 않으면 `plugin update`가 아무것도 가져오지 않는다 |
| `plugin/templates/en/agents/feature-scout.md`, `pm.md`, `dev.md`, `docs/plans/template.md`, `docs/plans/README.md`, `CLAUDE.runbook.md` (중첩 저장소 `Sangeok/harness-templates`, stagekeeper PR 밖) | update | §8 | medium — 에이전트 행동 변경, DB 재시드 필요 |
| `docs/architecture/invariants.md`, `system-overview.md`, `protocol.md`, `sources.md`, `rationale.md`, `docs/conventions/product-copy.md` | update | §10 | low |
| 테스트: `src/server/pipeline/run-rules.test.mjs`, `src/fsd/widgets/turn-banner/model/turn.test.ts`, `src/fsd/features/edit-backlog/ui/backlog-table.test.mjs`, `src/fsd/features/review-gate/model/inbox-item.test.ts`, `src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs`, `src/server/mcp/tools.test.mjs`, `tests/server/integration/board.test.ts`, `tests/server/integration/support.ts`(훅 셋), `tests/server/integration/backlog-add.test.ts`(신규, `createToolDeps`), `tests/server/integration/head.test.ts`(신규, `headFor`), `tests/server/integration/migration.test.ts`, `packages/core/backlog.test.mjs`(신규), `plugin/templates/templates.test.mjs`(중첩 저장소), `plugin/bin/harness-init.test.mjs`, `scripts/retired-copy.test.mjs`, `src/server/agents/vars.test.ts`, `src/server/mcp/views.test.ts` | update/create | 아래 검증 계획 | — |

## Safety Analysis

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — 새 라우트가 없다. 백로그 페이지와 배너의 기존 경로 안에서만 바뀐다.
- [x] 정적 `import` / `export from` — `addBacklog`는 `src/server`에 두고 feature의 `*.server.ts`가 import한다(`edit-backlog.server.ts`가 이미 `@/server/*`를 import한다, `:6-9`). FSD 방향 `features → server`는 기존과 같다.
- [x] dynamic `import()` — `src/server/pipeline`, `src/server/mcp`, `edit-backlog`, `review-gate`, `turn-banner`에 `import(` 없음(`rg -a -n "import\("`, 시험 제외).
- [x] barrel export — `edit-backlog/index.ts`는 `BacklogForm`·`BacklogTable`·`BacklogRow`·`RemoveBacklogButton`·액션 형만, `index.server.ts`는 세 액션만 내보낸다. `BACKLOG_KEY_RE`는 barrel로 나가지 않는다. `BacklogRow`는 `project-backlog-page.tsx:2`가 가져다 쓴다(§9 배선).
- [x] 인가 — `backlog_add`는 외부(MCP)에서 닿는 새 쓰기 경로다. 프로젝트는 `scope()`(`tools.ts:86-98`: `hs_`는 토큰의 프로젝트, `hu_`는 소유자 확인)로 정하고, 사용 불가 프로젝트는 `guardUnavailable`과 `inProjectTransaction`의 접근 검사가 막는다. run은 같은 `projectId`의 열린 feature-scout run이어야 하고, 그 확인은 쓰기와 같은 잠금 안이다(§3·§4). 불변식 4(게이트는 사용자만)는 그대로이고, 코드 강제 목록(`invariants.md:40-43`)과 그 가드(`tools.test.mjs:24-25`)를 "편집·삭제"로 좁힌다.
- [x] 테스트와 스크립트 참조 — 옛 동작을 단언해 의도적으로 바뀌는 시험은 `run-rules.test.mjs:59`(HINT key 목록), `:88-93`(빈 백로그 → `none`), `plugin/templates/templates.test.mjs:37`·`:169-172`(scout 단계·도구), `plugin/bin/harness-init.test.mjs:188-194`(scout 없으면 생략), `src/server/mcp/tools.test.mjs:24-25`(`WEB_ONLY`의 `backlog_add`), `src/server/agents/vars.test.ts:22,27`(scout 기본값), `src/server/mcp/views.test.ts:5-10`(뷰 필드), `turn.test.ts`의 네 단계 단언이다. 폐기되는 표현은 `scripts/retired-copy.test.mjs`에 새로 가둔다. 목록과 고칠 내용은 Verification Plan에 있다.
- [x] 타입 선언 — `HeadNext.agent`를 넓혀도 그 값을 받는 코드는 `headFor`(`run-query.ts:134`)와, 그 결과를 JSON으로 그대로 싣는 `deps.ts:60`뿐이다(`PipelineOverview`, `run-rules.ts:74`는 쓰는 곳이 없다). 컴파일은 `tsc --noEmit`으로 확인한다.
- [x] 런타임 side effect — 새로 생기거나 넓어지는 백로그 쓰기는 다섯 곳이다: `addBacklog`(웹·`backlog_add`, 프로젝트 잠금 §3), `removeBacklog`(사람 제거, 잠금 없는 확인에서 프로젝트 잠금 + Serializable로 옮김 §6), `discard`의 `proposed` 분기(프로젝트 잠금 §6), `submitPlan`의 type(프로젝트 잠금 + 조건부 쓰기 §6-1), `updateBacklog`의 type(웹 편집, 조건부 쓰기 §3·§6-1). 완료·재열기는 기존 쓰기에 `removedReason`만 더한다.
- [x] API 계약 — MCP 도구 추가(하위 호환), head 응답에 `agent: "feature-scout"` 값 추가. 구 런북은 head를 "dispatch pm, or nothing"으로 알고 있다. 구 런북 세션이 `feature-scout` head를 받으면 그 에이전트 파일이 없을 수 있다(scout 미설정 저장소). 런북 판 불일치는 기존 `RUNBOOK_STALE_NOTE`(`run-rules.ts:70-72`)가 알린다 — 템플릿 재시드(§1 배포 순서 ③) 뒤부터다. 그 전(②와 ③ 사이)의 모양은 §1에 적었다.

소비자 영향 범위: `decideHead`·`headFor`·`HeadNext`는 `rg -a`로 역참조를 확인했다(`deps.ts:11,60`, `run.ts:3`, `run-query.ts:7,134`). `availableBacklogCount`는 `deps.ts:60`, `board.ts:8`에서만 쓰인다. 문자열 키로 도는 소비자(에이전트 템플릿, 런북)는 표 §8에 적었다. 동적 참조를 전수 조사하지는 않았다.

## Approval

승인 메모:

- 사용자 요청에 따라 로컬 구현을 진행했고, 본체와 독립 템플릿 저장소의 PR도 병합됐다. 2026-10-01 후속 요청에 따라 Execution Plan 1~8의 구현 완료를 기준으로 `completed/`에 기록한다. 운영 배포와 Execution Plan 9의 실사용 검증, 인증된 앱의 전체 HTTP 검증은 후속 작업으로 남긴다.

## Execution Plan

아래는 구현 당시의 실행 절차다. 1~8은 구현 완료됐고, 9는 후속 실사용 검증으로 남았다. 구현 브랜치는 `harness/agent-filled-backlog`였으며 본체 PR은 `dev`를 대상으로 병합됐다.

product-copy의 문장은 그 문장을 쓰는 코드를 바꾸는 단계에서, 같은 커밋으로 먼저 고친다(§9 Tokens, `docs/architecture/verification.md:93-95`). 특히 3단계는 `plan_submit`의 등록 설명과 product-copy §13 행을 함께 고쳐야 한다 — `tools.test.mjs:42-48`이 두 문장의 글자 일치를 단언하므로, 따로 고치면 3단계에서 그 시험이 실패한다. 아키텍처 문서 가운데 불변식 4의 코드 강제 목록(`invariants.md:40-43` — §4가 `WEB_ONLY`와 함께 "이 두 곳을 고치지 않고 구현하면 안 된다"고 한 곳)과 `protocol.md`의 도구 표는 `WEB_ONLY`에서 `backlog_add`를 빼는 3단계에서 함께 고친다. 나머지 아키텍처 문서와, 코드가 따라오지 않는 product-copy 절은 8단계에서 고친다.

1. **데이터와 서비스**: 스키마(`type`·`typeSetBy` 포함), 마이그레이션(격리 dev DB에서 `--create-only`로 만들고 백필 `UPDATE`를 덧붙인다, §1), 백필. `packages/core/backlog.mjs`(`ITEM_TYPES`·`toItemType`·`nextItemKey`·`SCOUT_ITEMS_PER_RUN`)와 `sync:plugin-lib`. 보드 서비스의 `addBacklog`·`removeBacklog`(프로젝트 잠금, 제거는 Serializable)·`updateBacklog`(type 규칙, §3·§6-1)와 `board.ts` export. 웹 `addBacklogItem`·`updateBacklogItem`·`removeBacklogItem`을 위임으로 바꾼다. 제거·완료·재열기의 사유를 쓴다.
   - 검증: `npm run db:validate`, 통합 시험(웹 액션이 아니라 `createBoardService(db)`를 부른다(추가·편집·제거는 `addBacklog`·`updateBacklog`·`removeBacklog`) — 웹 액션은 세션과 `revalidatePath`에 묶여 시험이 부를 수 없다, §3. 추가 → `ITEM-01`, 기존 `FEAT-05`가 있어도 `ITEM-01`, `ITEM-99` 다음 `ITEM-100`, 사람 추가 ∥ scout 추가가 상한을 넘지 않음과 사람 제거 ∥ pm 제안의 두 순서(둘 다 Verification Plan "새 시험"의 순서 고정 시험), 열린 행이 있는 항목의 제거가 예외가 아니라 결과 `ok: false`와 지금 문장(`edit-backlog.server.ts:76`)으로 끝남, 상한, 제거 사유, 재열기 시 사유 지움, 제목만 고친 편집이 `typeSetBy`를 바꾸지 않음, `type: ""`(빈 선택)으로 들어온 편집은 `type`·`typeSetBy`가 둘 다 `null`). 이 단계의 시험에는 `packages/core/backlog.test.mjs`(`npm test`)와 백필 시험(`migration.test.ts`, Verification Plan "새 시험")도 들어간다. 백필 뒤 옛 재열기·보류·사람 제거를 재현해 재정합이 살아 있는 행의 사유와 남은 잘못된 `done`을 모두 고치는지 확인한다. 배포 rehearsal에서는 옛 writer 종료와 잠금 순서·대기 시간도 확인한다(§1).
2. **폐기와 거절 기억**: `discard`의 `proposed` 분기. `BacklogView` 필드, `boardWithBacklogView`와 `deps.ts`의 `boardGet`·무변경 `transition` 투영(§4).
   - 검증: 통합 시험(proposed 폐기 → `removedReason: "discarded"`, in_review 폐기 → 백로그 유지, `availableBacklogCount` 감소), `views.test.ts`(최상위·중첩 공개 필드와 내부 필드 제외, `npm run test:web`), `backlog-add.test.ts`의 실제 deps 응답 직렬화(§4).
3. **MCP `backlog_add`**와 run 검증. **`plan_submit`의 `type`**(§6-1). 같은 커밋에서 `invariants.md:40-43`, `protocol.md`의 도구 표(`backlog_add`·`plan_submit` 행과 `:66`의 도구 수), product-copy §13의 `backlog_add`·`plan_submit` 행을 고친다.
   - 검증: `tools.test.mjs` — 등록 이름과 `WEB_ONLY`, 그리고 스키마. 핸들러 직접 호출은 zod를 거치지 않으므로 `descriptions().backlog_add.inputSchema.safeParse`로 `type`·`area`가 필수임(빠지면 `success: false`)과, `key`를 넘겨도 파싱 결과에 `key`가 없음을 본다 — `z.object`는 모르는 키를 거부하지 않고 버리므로 `key`는 거부가 아니라 결과로 단언한다(선례 `:240-246`). 통합 시험 — `createToolDeps(db).backlogAdd`(선례 `tests/server/integration/project-sync.test.ts:5,40`)로 열린 scout run이 아니면 거부(닫힌 run 포함), 다른 프로젝트의 run 거부, run당 3건 초과 거부, key 발급(§4). 이 동작은 가짜 deps를 쓰는 `tools.test.mjs`에서는 보이지 않는다. 그리고 통합 시험(§6-1 표의 세 경우, `type` 없는 `plan_submit`은 기존과 같음, `planning` 최초 제출과 `in_review` 재제출 양쪽에서 다른 owner type 보존 시 공개 응답에 `typeKept: "owner"`가 있음(같은 값이면 필드 없음), 사람이 먼저 `owner`로 정한 뒤 들어온 `plan_submit`은 `count === 0` → `typeKept: "owner"`, dev가 먼저 바꾼 뒤 옛 `typeBefore`로 들어온 사람 편집(`updateBacklog`)은 충돌 문장).
4. **head 판정**: `decideHead`, `headFor`, `HINT`, `deps.ts`의 `scoutNodePending`.
   - 검증: `run-rules.test.mjs`(아래 추가 시험 — `decideHead`와 `scoutNodePending`). 새 통합 시험 `tests/server/integration/head.test.ts`(형제 `agent-runs.test.ts`처럼 `fixture`·`cleanup`, `support.ts:39,56`)가 `headFor(db, …)`에 실제 행을 넣어 단언한다: `report` 단계 `ok` 원장 행과 함께 닫힌 feature-scout run의 `closedAt`이 백로그 행의 마지막 `createdAt`·`removedAt`보다 뒤면 `none`, 앞이면 scout 디스패치, 닫힌 run이 없으면 디스패치. `report` 원장 없이 닫힌 바인딩 run(보류·폐기 때 `closeRuns`가 닫은 모양)은 세지 않아 디스패치다. 열린 비바인딩 scout run이 있으면 상한에서도 디스패치(`hasResumableScoutRun`). `ensureCurrentVersion(db, projectId)`(`src/server/pipeline/run-query.ts:19`)의 버전으로 fixture 보드 행에 `PipelineRun`을 만들어, 바인딩된(슬롯) scout run이 `scoutedSinceChange`에는 들어가고 `hasResumableScoutRun`에는 들어가지 않는 것도 본다. `head.test.ts`에서 `createToolDeps(db).pipelineNext(projectId, undefined)`도 직접 부른다. 이 개요 시험은 Pro fixture에 `format: SLOT_FORMAT`, `nodes: ["propose", "plan", "implement", "accept", "feature-scout"]`, `gates: ["before-plan", "before-implement"]`인 전용 `PipelineVersion`을 만든다. 기본 그래프에는 opt-in scout가 없으므로 `ensureCurrentVersion`의 기본 버전을 그대로 쓰지 않는다. 보드는 `status: "done"`과 `acceptedAt`을 채우고, 그 백로그는 `removedAt`·`removedReason: "done"`으로 후보에서 뺀다. 열린 `PipelineRun`은 전용 버전을 참조하며 `node: "feature-scout"`와 비어 있지 않은 `entryId`를 가진다. 실제 응답의 `items`에는 scout 디스패치가 있고 `head`는 `none`이어야 한다. 이어 같은 `pipelineRunId`·`pipelineEntryId`, `key: null`로 묶인 feature-scout `AgentRun`을 report/ok 원장과 함께 닫고 다시 개요를 불러 지연 전진과 `scoutedSinceChange`로 head가 쉬는 것을 본다. `deps.ts`가 `scoutNodePending(items)` 대신 `false`를 넘기면 반드시 실패해야 한다 — 순수 함수 시험과 `tsc`만으로는 이 배선을 증명하지 못한다. fixture의 user/project를 정리하고 연결을 닫으며, 이 시험 때문에 공유 `Template` 행을 바꾸지 않는다(`runbookStale`의 부가 필드는 단언 대상 밖이다).
5. **core/plugin**: 기본 질문, init이 scout를 항상 생성, init 스킬의 "Not done here" 줄, `plugin.json` 판 `0.3.4`(§1 ④).
   - 검증: `npm run sync:plugin-lib`, `node --test "packages/core/*.test.mjs" "plugin/bin/*.test.mjs"`(`harness-init.test.mjs:188-194`를 뒤집은 시험 포함). 서버 렌더 변수의 기본값도 바뀌므로 `src/server/agents/vars.test.ts`(`npm run test:web`)를 이 단계에서 고친다(§7).
6. **템플릿**: feature-scout, pm(빈 area 배정과 Never·입력 설명 일치), dev(A-2의 빈 source·area 처리, A-3의 type 근거 기록과 A-4 커밋 후 제출, Never 이유), 계획서 템플릿(빈 source), 런북. 중첩 저장소 `plugin/templates`(`Sangeok/harness-templates`)에 커밋한다 — stagekeeper PR 밖이다(§8).
   - 검증: `npm run test:templates`. 실제 dev 템플릿의 A-3 → A-4 → A-5를 읽어 type 근거가 커밋 전 본문에 있고 `typeKept`가 제출 후 문서 편집을 지시하지 않는지 확인한다. 실사용에서는 제출된 `planCommit`의 계획서 본문과 디스크가 일치하고 type 근거를 포함하는지 본다. 대상 DB의 `npm run seed:templates`와 플러그인 전달은 §1의 배포 순서(서버 배포 뒤)를 따른다.
7. **웹**: 폼(Type select), 표(Type·Added by, 빈 표 문장과 `colSpan`), 인박스 type 칩과 도움말의 Discard 문장, 배너(`NONE_DETAIL` 포함), Pipeline 탭 Scout 안내 문구와 표시 조건, Tokens 탭 안내문.
   - 검증: `turn.test.ts`, `backlog-table.test.mjs`, `inbox-item.test.ts`, `pipeline-rail.test.mjs`(Scout 안내의 표시 조건), 실화면(백로그 탭, 빈 보드 배너, 인박스 카드). 백로그 탭에서는 편집 폼의 배선을 따로 본다 — `typeBefore` 숨은 입력은 폼 렌더 시험이 없고(`edit-backlog/ui`의 시험은 `backlog-table.test.mjs`뿐이다) 통합 시험은 서비스(`updateBacklog`)만 부르므로, 빠져도 시험이 녹색이다. 빠지면 `typeBefore`가 `null`로 와서 type이 있는 항목의 모든 편집이 "The item changed. Refresh and try again."으로 끝난다. 그래서 type이 채워진 항목(scout 또는 사람)의 제목만 고쳐 저장이 성공하고 `typeSetBy`가 그대로인지, type을 바꾸면 `typeSetBy: "owner"`가 되는지 실화면과 DB로 확인한다. 같은 폼에서 type을 바꿔 성공한 뒤 제목만 다시 저장해도 성공해야 한다. 별도 세션의 dev type 변경 후 클라이언트 refresh로 서버 props만 갱신해도 초안의 `typeBefore`는 그대로여야 하며, 그 초안에서 다른 type으로 저장하면 충돌하고 제목·area·source도 쓰이지 않아야 한다. 충돌 뒤 전체 새로고침으로 최신 값이 보이고 재편집·저장할 수 있어야 한다.
8. **문서와 예시 key**: 앞 단계에서 코드와 함께 고치지 않은 문서 — invariants(불변식 8 설명), system-overview, protocol(나머지 행과 백로그 작성 규칙), sources, rationale, product-copy(§6 Team row처럼 코드가 따라오지 않는 절), `RETIRED` 추가, 그리고 `FEAT-01` → `ITEM-01`.
   - 검증: `npm run test:architecture`(`retired-copy.test.mjs` 포함), copy-lock 블록 대조.
9. **후속 실사용 한 바퀴(미검증)**: 판을 올린 플러그인이 설치된 뒤(scout 설정이 없는 저장소에서 `/harness:init`이 `.claude/agents/feature-scout.md`를 쓰는지로 확인한다), 빈 백로그 프로젝트에서 `/harness:init` → `pipeline_next` → scout 디스패치 → 백로그 1~3건 → pm → 인박스 게이트①.

## Verification Plan

실행할 검증:

```powershell
npm run db:generate
npm run check
npm run verify:fsd
npm run test
npm run test:server
npm run test:server:integration
npm run test:web
npm run test:templates
npm run build
```

CI(`check` 워크플로)는 `npm run db:generate` 뒤에 `npm run check`·`npm test`·`npm run test:web`·`npm run build`만 돌린다(`.github/workflows/check.yml:24-33`). `src/generated/prisma`는 gitignore된 생성물이라(`.gitignore:45`) 스키마를 바꾼 뒤에는 로컬에서도 `npm run check`의 `tsc --noEmit`보다 `npm run db:generate`가 먼저다. `test:server`·`test:server:integration`·`test:templates`는 로컬에서만 돈다. `test:templates`는 러너에 템플릿이 없고(`:34-36`), 통합 시험은 `DATABASE_URL`과 다른 `stagekeeper_test_*` DB를 `TEST_DATABASE_URL`로 요구한다(`scripts/test-server-integration.mjs:14-21`). 이 제안의 동시성 순서 시험·마이그레이션 시험·head 시각 비교 시험(`head.test.ts`)·템플릿 계약은 이 세 묶음에만 있으므로, 결과를 아래 Verification Results와 PR 본문에 적는다. 시험 DB가 없으면 그 시험들은 "실행 못 함"으로 적고 통과로 쓰지 않는다 — PR의 `check`가 녹색이어도 그 보장은 확인되지 않은 것이다.

추가 단위 시험 — `src/server/pipeline/run-rules.test.mjs`(형제 시험 `:1-16`을 따른다). 기대값은 계산값이 아니라 `decideHead`의 분기 계약과 `scoutNodePending`의 정의(§5)다.

```js
// import 줄(:3)에 scoutNodePending을 더한다: import { HINT, decideHead, decideNext, handoffIsLive, scoutNodePending } from "./run-rules.ts";
it("an empty backlog dispatches feature-scout before pm, once per backlog state", () => {
  const head = { hasPropose: true, openCount: 0, availableBacklog: 0, scoutedSinceChange: false, scoutNodePending: false, capReason: null };
  assert.deepEqual(decideHead(head), { action: "dispatch", agent: "feature-scout", hint: HINT.scoutHead });
  assert.equal(decideHead({ ...head, scoutedSinceChange: true }).action, "none");
  // 같은 개요에서 Scout 노드가 이미 scout를 부르면 head는 따로 부르지 않는다.
  assert.equal(decideHead({ ...head, scoutNodePending: true }).action, "none");
  assert.equal(decideHead({ ...head, openCount: 2 }).action, "none");
  // 후보가 있으면 scout가 아니라 pm이다.
  assert.equal(decideHead({ ...head, availableBacklog: 1 }).agent, "pm");
  // propose 노드가 없어도 빈 백로그는 scout가 채운다 — 사람이 Backlog 탭에서 보드에 올린다.
  assert.equal(decideHead({ ...head, hasPropose: false }).agent, "feature-scout");
  assert.equal(decideHead({ ...head, capReason: "full" }).action, "none");
  assert.equal(decideHead({ ...head, capReason: "full", hasResumableScoutRun: true }).agent, "feature-scout");
});

it("a Scout node dispatch in the same overview holds the head's scout", () => {
  const node = { key: "ITEM-01", node: "scout", version: 1, action: "dispatch", agent: "feature-scout", hint: HINT.scout, format: "slots-v1" };
  assert.equal(scoutNodePending([node]), true);
  // 상한에 걸려 기다리는 노드는 scout를 부르지 않는다 — 그때는 head가 평소대로 판정한다.
  assert.equal(scoutNodePending([{ ...node, action: "wait", on: "cap", reason: "full" }]), false);
  assert.equal(scoutNodePending([]), false);
});
```

`run-rules.test.mjs`의 기존 단언:
- `:59` `Object.keys(HINT).sort()`를 정확한 목록으로 단언한다 → `scoutHead`를 넣는다. 같은 시험(`:57-65`)에 `assert.doesNotMatch(HINT.scout, /harness\.json\.scout/)`를 더한다 — 지금 HINT 문장의 글자를 지키는 시험은 없다(`tools.test.mjs:42-48`의 글자 일치는 `board_transition`·`plan_submit`·`agent_next` 세 도구의 등록 설명만 본다).
- `:88-93` "an empty backlog rests instead of dispatching pm at nothing"은 기대값이 뒤집힌다 — `scoutedSinceChange: false`면 feature-scout 디스패치, `true`면 `none`과 새 사유 "feature-scout already looked at this backlog"로 고친다(옛 사유 `/backlog has nothing to pick/`는 없어진다).
- `:13`(`availableBacklog: 0` → `none`)은 입력에 `capReason: "full"`이 있어 새 판정에서도 `none`이지만 이유가 바뀐다(상한). `scoutedSinceChange`를 명시해 의도를 고정한다.
- `:12`·`:14-15`(같은 시험의 나머지 단언), `:75-79`(propose 노드 없음, 후보 3건 → `none`), `:80-82`, `:83-86`(상한 사유와 pm 디스패치), `:96-99`(미결 2건이 빈 백로그보다 먼저)는 그대로 통과한다.

`turn.test.ts`: 보드가 비었을 때 단계가 3개이고 마지막 key가 `"run"`이며 `done: false`임을 단언한다(기존 시험의 네 단계 단언을 고친다: `:45`의 `[true, false, false, false]` → `[true, false, false]`, `:48-51` "stops at step 4 …"의 `current` 4 → 3). `SetupState.backlogCount`를 지우면 `:7,39,228`의 입력도 고친다.

바뀌어야 하는 기존 시험 계약(지금 코드가 옛 값을 단언한다):
- `plugin/templates/templates.test.mjs:37` `STEPS["agents/feature-scout.md"]` → `["start", "research", "write", "report"]`.
- 같은 파일 `:304-316`: 본문이 이름 부르는 outcome과 지시어의 1:1 — scout `step:start`는 `failed`/`on failed: report`로, 새 `step:write`는 `ok`·`failed`/`on failed: report`로 맞춘다(§8). 시험 자체는 고치지 않는다.
- 같은 파일 `:169-172`: scout의 MCP 도구를 `MCP("agent_next")`만으로 단언한다 → `MCP("agent_next", "backlog_add", "backlog_list")`. "쓰기 도구 없음"(`Write`·`Edit`) 단언은 유지한다(scout는 파일을 쓰지 않는다). 주석 "scout는 보드·백로그 도구가 없다"도 고친다.
- `src/server/mcp/tools.test.mjs:24-25`의 `WEB_ONLY`에서 `"backlog_add"`를 뺀다 — 그대로 두면 `:36`이 "web-only tool registered: backlog_add"로 실패한다(§4 불변식 4와의 관계). `:35`의 이름 집합 단언은 `AGENT_TOOL_NAMES`를 따라오므로 따로 고칠 것이 없다. `:42-48`은 `plan_submit`의 등록 설명이 product-copy §13 행과 **글자 그대로 같은지** 단언하므로, `type` 입력을 더한 설명은 두 곳을 같은 문장으로 고친다. `:102-113`의 `ARGS`는 고치지 않아도 된다. 잠긴 프로젝트 시험(`:115-124`)은 핸들러를 직접 불러 zod 스키마를 거치지 않으므로(`ARGS[name] ?? {}`, `:117`), 인자 없는 `backlog_add`도 `scope` → `guardUnavailable`에서 잠금 사유로 끝난다. 이 시험의 전제는 핸들러가 인자를 읽기 전에 `guardUnavailable`을 부르는 순서다(§4 핸들러).
- `src/server/mcp/owner-tools.test.mjs:21`(에이전트 도구가 소유자 서버에 없음)은 그대로 통과해야 한다.
- `src/server/agents/vars.test.ts:22,27`: 기대값의 `scout: { question: "" }`를 `{ question: DEFAULT_SCOUT_QUESTION }`로(§7).
- `src/server/mcp/views.test.ts:5-10`: 공개 필드에 `type`·`addedBy`·`removedReason`을 더하고, 최상위와 `boardWithBacklogView`의 중첩 `backlogItem`에서 `addedByRunId`·`typeSetBy`가 빠지는 것을 단언한다(§4).
- `src/fsd/features/edit-backlog/ui/backlog-table.test.mjs:12`: 그대로 통과한다(사유 없는 제거 행은 `Removed`). `done`·`discarded` 사유 행을 더해 `Done`·`Discarded`를 단언한다(§9).
- `src/fsd/features/review-gate/model/inbox-item.test.ts:29`: 픽스처의 `backlogItem`에 `type`을 더한다(§9).
- `plugin/bin/harness-init.test.mjs:188-194` "omits feature-scout when config has no scout"는 §7로 뒤집힌다 → "writes feature-scout with the default question when config has no scout": `.claude/agents/feature-scout.md`가 생기고 그 본문에 기본 질문이 들어가며, 런북 Report 표에 feature-scout 행이 있다. `:201`(예약된 에이전트 이름 거부)과 `:332-350`(scout 설정이 있는 경우)은 그대로다.

폐기된 표현 가드: `docs/architecture/verification.md:93-95`의 변경 전 체크리스트대로, 사용자에게 말해 둔 사실을 바꾸는 이 변경은 옛 표현을 `scripts/retired-copy.test.mjs`의 `RETIRED`에 더한다. 지금 이 표현들은 바꿀 자리에만 있다(`rg -a -i` 확인).
- `/Scout runs only with harness\.json\.scout/` — where `web` (`pipeline-rail.tsx:146`)
- `/Add a backlog item|Run pm in Claude Code|Set up in four steps/` — where `web` (`turn.ts:48,73,79`)
- `/run pm in Claude Code to pick for you/` — where `web` (`turn.ts:54`)
- `/Key must look like FEAT-01/` — where `web` (`edit-backlog.server.ts:21`)
- `/the backlog is web only/` — where `web` (`project-tokens-page.tsx:75`)

`run-rules.ts:39`의 "only when harness.json.scout is configured"는 서버 문자열이라 `RETIRED`가 보는 범위(`src/fsd`·`src/app`·SKILL.md·잠금 블록, `retired-copy.test.mjs` `surfaces`) 밖이다 — 위에서 `run-rules.test.mjs`의 HINT 시험에 더하는 `doesNotMatch` 단언이 지킨다. product-copy §13은 같은 문장을 고치는 출처일 뿐 시험이 대조하지 않는다.

새 시험:
- `packages/core/backlog.test.mjs`(형제 `packages/core/*.test.mjs`, `node:test`): `nextItemKey([])`는 `"ITEM-01"`(빈 입력, 계산 없음). `nextItemKey(["FEAT-05", "API-3"])`는 `"ITEM-01"`(ITEM 아닌 key는 무시). `nextItemKey(["ITEM-99"])`는 `"ITEM-100"`, `nextItemKey(["ITEM-100", "ITEM-99"])`는 `"ITEM-101"`(숫자 비교). `nextItemKey(["ITEM-9007199254740992"])`는 `"ITEM-9007199254740993"`(기존 key의 자릿수에 상한 없음). `toItemType("fix")`는 `"fix"`, `toItemType("")`와 `toItemType("bug")`는 `null`.
- 사람 제거 ∥ pm 제안(§6). `Promise.all`로 부르지 않는다. 승패가 정해지지 않아 "제안의 스냅숏이 제거 커밋 전에 잡히는" 순서를 거의 만들지 못하고, 그래서 수정 전 코드에서도 통과한다. 저장소 규칙도 같다(`tests/server/integration/support.ts:1-3`: Promise.all만으로는 누가 이길지 정해지지 않는다). `support.ts`의 관문 방식(`ordered()` `:64`, 쿼리 훅 `afterBoardRead` `:79`)으로 두 순서를 고정한다. 훅 둘을 같은 모양으로 더한다: `afterProjectRead`(`project.findUniqueOrThrow` 뒤 — `inProjectTransaction`의 첫 문장이고 Serializable 스냅숏이 잡히는 자리)와 `afterBoardList`(`boardItem.findMany` 뒤 — `latestBoard`가 열린 행을 읽는 자리).
  - 순서 ①: 제거가 잠금을 쥐고 열린 행을 읽은 뒤 멈춘다 → 제안이 첫 읽기를 마친다(스냅숏) → 제거가 커밋한다 → 제안이 잠금을 얻어 이어간다. 기대: 제안 호출은 `P2034` 오류를 던지고(결과 `ok: false`가 아니다 — `reportFailure`는 `BoardRejection`만 결과로 바꾸고 나머지는 다시 던진다, `board-query.ts:18-26`) 보드 행이 생기지 않으며, 백로그는 `removedReason: "owner"`다. 제거를 READ COMMITTED로 둔 코드에서는 제안이 커밋되므로 이 시험이 실패해야 한다 — 수정을 증명하는 시험이다.
  - 순서 ②: 제거가 첫 읽기를 마친 뒤 멈춘다 → 제안이 커밋한다 → 제거가 이어간다. 기대: 제거는 `ok: false`("The item changed. Refresh and try again." 또는 "… is open on the board. …"), 백로그는 살아 있고 열린 `proposed` 행이 하나다.
  - 두 순서 모두 "`removedReason: "owner"` + 열린 `proposed` 행"이 함께 남지 않는다.
- 사람 추가 ∥ scout 추가(§3, 상한 10에서 9건). 이것도 `Promise.all`로 부르지 않는다. `backlogItem.count` 뒤의 훅 `afterBacklogCount`를 위 두 훅과 같은 모양으로 하나 더 두고, A(사람 추가)가 잠금 안에서 9건을 센 뒤 멈추게 한다. B(scout 추가)를 시작해 B의 첫 문장(`afterProjectRead` — 잠금보다 앞의 읽기)이 돌아온 것을 확인한 뒤 A를 푼다. 기대: A가 만들고 커밋한 뒤에야 B가 잠금을 얻어 10건을 세고 상한 문장으로 끝난다(결과 `ok: false`). 행은 10건이다. B가 A의 생성보다 먼저 세는 순서를 잠금이 없앴다는 것을 보는 시험이다.
- 같은 scout run의 추가 경합(`backlog-add.test.ts`): 이미 2건을 쓴 열린 run에서 A의 `afterBacklogCount`로 run당 수를 센 직후 멈추고 B가 잠금 앞 `afterProjectRead`까지 온 뒤 A를 푼다. 하나만 세 번째 항목을 만들고 다른 호출은 run당 상한으로 거부돼야 한다. 제거된 항목도 누적 3건에서 빠지지 않는다. 훅은 질의의 `where.addedByRunId`로 전체 live count와 run count를 구분하고 첫 해당 질의에서만 멈춘다.
- run 닫힘 ∥ 추가(`backlog-add.test.ts`): 기존 `beforeRunClaim`으로 실제 `agentNext(createNextDeps(db), …)`의 report/ok 커밋을 owner 잠금 안에서 멈춘다. 추가가 잠금 앞 첫 읽기를 마치면 닫힘을 풀고, 추가는 열린 run 거부이며 행 수가 불변이어야 한다. 반대 순서는 추가를 run 확인 뒤 count 훅에서 멈추고 닫힘이 `cursorTransaction`의 첫 project 읽기까지 온 뒤 추가를 푼다. 추가 커밋 뒤 닫힘이 성공하며 새 항목과 report/ok 원장이 남아야 한다. 실제 두 연결과 관문을 쓰며 임의 sleep·가짜 count로 대체하지 않는다. 공유 `Template`을 바꾸지 않도록 `createNextDeps(db)`의 template/vars만 시험 전용 본문으로 주입하고 `withCursor`를 그 deps로 다시 바인딩한다(`cursorTransaction(db, deps)`).
- 새 순서 고정 시험은 `try/finally`에서 관문을 풀고 시작한 promise들을 `Promise.allSettled`로 회수한 뒤 fixture 사용자와 연결을 정리한다. 클라이언트별 `$extends` 훅만 쓰고 전역 훅·공유 Template 변경을 남기지 않는다.
- `tests/server/integration/migration.test.ts`의 형제 시험처럼 새 `migration.sql`을 옛 모양 표에 적용해, 완료된 제거 행은 `'done'`, 그 밖의 제거 행은 `'owner'`, 살아 있는 행은 `NULL`인지 단언한다. 같은 `UPDATE`를 두 번 돌려도 결과가 같고, 이미 올바른 사유가 있는 행(특히 `discarded`)은 바뀌지 않는 것도 단언한다. 첫 백필 뒤 옛 재열기(`removedAt`만 NULL) → 재정합은 두 열이 NULL이어야 하고, 재열기 → 보류 → 사람 제거(`removedAt`만 재설정) → 재정합은 남은 `done`을 `owner`로 고쳐야 한다. 기존 `owner` 제거 행을 옛 코드에서 완료한 경우는 `done`으로 고친다. 폐기 보드 행과 더 오래된 비폐기 행을 함께 둬 `latest`의 제외·정렬도 검증한다. 옛 모양 표는 손으로 흉내 내지 않는다. 임시 schema에 실제 `20260829143353_init`을 적용해 만든다(`BacklogItem.removedAt`, `BoardItem.proposedOn`·`discardedAt`이 여기서 생긴다; `migration.test.ts:8` — fixture는 실제 migration이 만든 표여야 한다). 이 시험의 `statementsOf`는 파일을 `;`로 잘라 조각마다 실행하므로(`:9-11`) 백필은 `DO $$ … $$` 블록이 아니라 `;`로 끝나는 보통 SQL 문장으로 쓰고, 주석에도 `;`를 넣지 않는다. 선례처럼 파일을 `BEGIN;`…`COMMIT;`로 감쌌다면(손으로 쓴 `report_acceptance_purpose`·`user_scoped_tokens` 등이 그렇다), 새 시험은 주석을 빼면 `BEGIN`이나 `COMMIT`만 남는 조각을 걸러 내고 나머지를 적용한다 — 기존 `statementsOf`(`:9-11`)에는 이 거름이 없으므로 새 시험에서 더한다(`--create-only`가 만든 파일 그대로면 감싸는 줄이 없어 거를 것도 없다). fixture는 시험의 대화형 트랜잭션 안에서 `SET LOCAL search_path`로 고른 임시 schema다(`migration.test.ts:20-22`). 그 조각을 그대로 돌리면 PostgreSQL이 `COMMIT`으로 그 트랜잭션을 끝내 임시 schema가 시험 DB에 남고, `search_path`가 풀려 뒤 문장(두 번째 `UPDATE`, 단언 쿼리)이 시험 DB의 `public` 표를 친다.

검증 기준:

- 위 명령이 모두 통과한다. §1의 재정합·불변식 검사, §4의 최상위/중첩 MCP 응답 내부 필드 부재, 새 동시성 시험의 run 상한·닫힘 경합 및 정리까지 검증한다.
- 편집 폼의 연속 저장·배경 refresh·충돌 복구(Execution Plan 7), type 판단을 포함한 제출 커밋과 실제 계획서의 일치(6), `pipeline_next` 개요에서 노드/head scout 중복 방지(4)를 각각 확인한다. 서비스 단위 시험이나 컴파일 성공으로 이 최종 화면·응답·파일 검증을 대체하지 않는다.
- 기존 실패와 신규 실패는 `dev`(현재 `c7f6d31`)에서 같은 명령을 먼저 돌려 기준선을 남기고 구분한다.
- 실사용 한 바퀴(Execution Plan 9)에서 사람이 백로그를 쓰지 않고 인박스 게이트① 카드까지 도달한다. 폐기하면 그 항목이 백로그에 `Discarded`로 남고, 다음 `pipeline_next`에서 scout가 같은 항목을 다시 쓰지 않는다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run db:generate` / `npm run db:validate` | PASS | Prisma 7.10 클라이언트 재생성 및 스키마 검증 |
| `npm run check` | PASS | plugin 동기화 검사, lint, FSD, typegen, tsc, architecture 25개, availability 17개 |
| `npm run verify:fsd` | PASS | 독립 실행도 통과 |
| `npm run test` | PASS | core/plugin 187개 |
| `npm run test:server` | PASS | 5개 |
| `npm run test:server:integration` | PASS | 격리 PostgreSQL 18.4의 `stagekeeper_test_backlog`에 migration deploy 후 25개. 같은 테스트 직접 실행도 25/25 |
| `npm run test:web` | PASS | 391개 |
| `npm run test:templates` | PASS | 중첩 저장소 계약 28개 |
| `npm run build` | PASS | 실행 중인 사용자 dev 서버를 보존하고 `%TEMP%/stagekeeper-backlog-build-native`의 동일 소스 사본에서 검증 |
| 실제 BacklogForm의 Edge 검증 | PASS | 격리 컴포넌트와 제어 가능한 action으로 10개 시나리오. 실제 인증·HTTP 서버 액션·DB를 연결한 브라우저 검증은 아님 |
| 루트·`plugin/templates`의 `git diff --check` | PASS | 두 저장소 모두 확인 |

위 전체 검증의 실행 일자: 2026-09-26. 루트와 중첩 템플릿 저장소 모두 `harness/agent-filled-backlog` 브랜치에서 제출했다. 본체 [PR #83](https://github.com/Sangeok/stagekeeper/pull/83)(구현 `75083a8`, 머지 `bad4d58`)은 `dev`를 대상으로 2026-09-27 병합됐다. 템플릿 저장소에는 `dev`가 없어 선행 PR #1의 `harness/server-clean-code`를 base로 제출한 [harness-templates PR #4](https://github.com/Sangeok/harness-templates/pull/4)(구현 `6fb7586`, 머지 `171a1bf`)도 같은 날 병합됐다. 새 마이그레이션은 `20260926134848_backlog_authorship`이다. 위 검증 당시 운영 DB에는 적용하지 않았으며, 이번 완료 정리에서도 운영 적용 여부는 직접 확인하지 않았다.

구현 범위:

- Execution Plan 1~8의 코드·템플릿·문서를 반영했다. `backlog_add`, 자동 key, 작성자·type·제거 사유, type의 사람 우선권, head scout, 기본 scout 생성, 3단계 안내와 검토 화면이 포함된다. 구현 당시 플러그인 버전은 `0.3.4`였다.
- 실제 DB 시험은 두 연결로 추가 상한과 run당 3건을 경쟁시키고, 제거 대 제안 및 run 종료 대 추가의 양쪽 순서를 고정해 검증한다. 폐기·완료·재열기, type CAS와 트랜잭션 롤백, 중첩 응답의 내부 필드 제외, head 보고 시각과 슬롯 scout 중복 방지도 통과했다.
- 백필 시험은 기존 스키마의 8개 fixture 행에서 옛 writer의 재열기·보류 후 제거를 재현하고 재정합 및 멱등성을 확인했다. `User → Project` 잠금 후 재정합은 마지막 실행에서 3.1ms였다. 이는 작은 격리 fixture의 측정치이며 운영 writer 종료·운영 규모 잠금 대기를 검증한 결과가 아니다.
- Edge에서 자동 key 입력 제거, type 연속 저장, 같은 key의 props refresh 시 초안·`typeBefore` 유지, 제목만 저장, 충돌 및 재시도, 전체 재마운트로 최신 값 복구, type 비우기, 추가 후 초기화, 저장 중 비활성화를 확인했다. 최초 실행에서 React의 자동 form reset이 실패 뒤 select를 비우는 결함을 발견해 native reset listener로 고쳤고 10개 모두 재통과했다.
- 새 인박스 렌더 시험의 첫 실행은 테스트용 Next router context 누락으로 실패했다. 기존 테스트 패턴에 맞춰 provider를 넣은 뒤 해당 시험과 `test:web` 전체가 통과했다. 전체 check/build의 구현 전 baseline은 실행하지 않았으므로 이 결과를 기존 실패 해소라고 주장하지 않는다.
- 초기 빌드 사본의 `node_modules` junction은 Turbopack 경로 제한으로 실패했다. 실제 디렉터리와 파일 hardlink로 만든 별도 사본에서 재빌드해 통과했다. 추가 로컬 HTTP smoke 서버 시작은 자동 승인 검토가 구체적인 이유 없이 거절하여 진행하지 않았다.

로그는 `%TEMP%/stagekeeper-backlog-final-{check,web,integration,integration-detail}.log`, `%TEMP%/stagekeeper-backlog-{core,server,templates,build-native}.log`에 남겼다. Edge fixture·실행 스크립트·결과는 `%TEMP%/stagekeeper-backlog-browser/`에 있다. 임시 브라우저 도구는 프로젝트 의존성에 추가하지 않았다.

2026-10-01 완료 확인:

- 현재 코드와 두 저장소의 병합 기록을 대조했다. core의 key·type 정책 및 plugin init 시험 65개, head·MCP·응답 투영·백로그 표·첫 실행 배너·인박스 카드 시험 71개, 템플릿 시험 30개를 다시 실행해 총 166개 모두 통과했다.
- 위 2026-09-26의 전체 check·build·DB 통합·Edge 폼 검증은 이번에 재실행하지 않았다. 운영 환경과 설치된 Claude Code도 직접 확인하지 않았다.

후속 배포·실사용 확인:

1. 두 저장소의 PR 병합은 완료됐다. §1의 순서대로 운영 migration, 서버 전환, 옛 writer 종료 후 재정합, 템플릿 재시드, 플러그인 전달을 확인한다. `plugin/templates`는 루트에서 무시되는 독립 저장소라 루트 커밋만으로 전달되지 않는다.
2. 설치된 새 플러그인으로 `/harness:init` → scout 작성 → pm → 게이트①까지 실제 Claude Code 사이클을 확인한다(Execution Plan 9). dev의 type 근거가 실제 계획 커밋과 제출 본문에 일치하는지도 그 환경에서 확인한다. 템플릿 계약 시험의 통과로 모델의 실제 수행을 대신하지 않는다.
3. 인증된 앱에서 백로그 편집·충돌·재로딩과 인박스·배너의 전체 HTTP 경로를 확인한다. 현재 서비스의 실제 DB 시험과 브라우저 컴포넌트 시험은 각각 통과했지만 두 경로를 연결한 실사용 검증은 남아 있다.

## Risks and Rollback

잔여 리스크:

- **scout 디스패치 루프.** scout가 0건을 쓰면 후보가 0건으로 남는다. `scoutedSinceChange` 판정이 틀리면 매 턴 scout를 불러 디스패치 상한(Free 30일 60회)을 태운다. 판정 기준(`report`까지 마치고 닫힌 run의 `closedAt`과 백로그 변화 시각)을 통합 시험(`tests/server/integration/head.test.ts`, Execution Plan 4)으로 고정한다.
- **디스패치 비용.** head의 scout도 run 하나라 디스패치 상한에 계수된다(`src/server/agents/run-query.ts:88` — run을 열 때 `capError(…, "dispatches", …)`). 후보가 바닥난 뒤 백로그가 바뀔 때마다(완료 포함) 한 번 돌고, 한 번에 최대 3건을 쓰므로 대략 항목 1~3개마다 한 번이다. Free(30일 60회)에서는 항목마다 드는 pm·dev 디스패치에 이만큼이 더해진다. 사람이 백로그를 채워 두면 후보가 있어 scout는 돌지 않는다(D5).
- **배정할 수 없는 후보.** `availableBacklogCount`는 area가 에이전트 표 안인지 모른다(`board-query.ts:112-119`). 후보가 표 밖 area 항목뿐이면 head는 부를 때마다 pm을 디스패치하고 pm은 고를 것이 없다고 끝나며(`pm.md:59-61`), 후보가 있으므로 scout도 돌지 않는다. 사람이 쓴 항목에서는 지금도 같다. scout에게는 표 안 area만 쓰게 한다(§8). 서버는 area를 표와 대조하지 않는다 — 어느 워크스페이스에 속하는지는 pm의 경로 판단이다. 사람이 그 항목의 area를 고치거나 제거하면 풀린다.
- **거절 판단은 모델의 판단이다.** "같은 area, 같은 문제"를 다시 쓰지 않는 것은 scout가 `backlog_list`를 읽고 판단한다. 서버는 문장 유사도를 검사하지 않는다. 다른 문구로 같은 일을 다시 가져올 수 있다. 사용자는 다시 지우면 되고, 그 기록도 쌓인다.
- **외부 글이 백로그를 거쳐 에이전트의 입력이 된다.** 지금까지 scout의 보고서는 사람이 읽고 골라 옮겨야 백로그에 들어갔다. 이제 scout가 `WebFetch`로 읽은 페이지(`feature-scout.md:158-162`)에서 얻은 내용이 사람을 거치지 않고 `source`에 들어가고, dev는 `source`를 요구사항의 근거로 읽는다(`plugin/templates/en/docs/plans/template.md:22-25`). 페이지에 심은 지시문이 이 경로로 흐를 수 있다. 완화: scout는 source를 자기 문장으로 쓰고 외부 문장은 URL로만 가리킨다(§8). dev는 source의 문장을 베끼지 않고 자기가 확인한 `file:line`으로 문제를 다시 세운다(같은 파일 `:23-25`). 세션의 게이트 승인은 에이전트가 쓴 글로 열리지 않는다(`plugin/templates/en/CLAUDE.runbook.md:128-132`). 게이트를 모두 뺀 프로젝트에는 사람의 확인이 없다 — D18과 같은, 받아들인 위험이다.
- **작성자 표기의 신뢰 경계.** 토큰은 에이전트를 구분하지 않는다. `backlog_add`는 "열린 feature-scout run의 id"로 표기를 정하므로, 같은 토큰을 가진 다른 세션이 scout run을 열고 쓰면 막지 못한다. 기존 도구들과 같은 신뢰 수준이다(`agent_next`도 `agent` 인자를 믿는다).
- **에이전트가 스스로 일을 만든다는 기존 우려.** 템플릿이 "If it leaks, agents invent their own work"(`feature-scout.md:20-21`)라고 경고하던 위험을 받아들이는 변경이다. 완화: 근거가 있는 것만, run당 3건, 게이트 결정, 거절 기억, 근거 종류와 type이 표·카드에 보임. **D18에 따라 scout는 결함 수정뿐 아니라 새 기능(competitor·users ask 근거)도 쓸 수 있다.** 게이트를 모두 뺀 Pro 프로젝트에서는 scout가 판단한 기능이 사람 확인 없이 계획·구현까지 간다 — 사용자가 선택한 자동 승인의 결과로 받아들인 위험이다. accept 앵커는 남는다.
- **type 판단 오류.** scout와 dev의 type은 틀릴 수 있다. key에 넣지 않았으므로 고쳐도 참조가 깨지지 않는다. 사람이 정한 값은 에이전트가 덮지 않는다(§6-1).
- **예시 key 교체의 누락.** `FEAT-01`이 문서·템플릿·화면에 흩어져 있다. 교체 뒤 `rg -a FEAT-01`(과 gitignore된 `plugin/templates` 안의 같은 검색)의 남은 결과가 의도한 것(기존 프로젝트 데이터 설명, 시험 데이터, `docs/test-reports`·`docs/proposals/completed` 같은 지난 기록)뿐인지 확인한다(§10).
- **기존 저장소.** 재init 전까지는 옛 feature-scout 스텁 또는 scout 파일 없음 상태다. 단계 본문은 서버가 DB 템플릿에서 주므로(§8) 배포 순서 ③ 뒤의 옛 스텁은 **새 단계 본문에 옛 `tools:`**(`agent_next`뿐)가 붙은 모양이다 — step:start가 부르라는 `backlog_list`를 쓸 수 없어 `failed` → `on failed: report`로 보고만 남기고 끝나며, 그 run이 `report`를 `ok`로 닫으면 `scoutedSinceChange`로 head는 백로그가 바뀔 때까지 `none`이다(디스패치를 거듭 쓰지 않는다). head가 `feature-scout`를 답하면 옛 런북 세션은 그 에이전트를 찾지 못한다. `RUNBOOK_STALE_NOTE`가 재init을 안내하지만, 템플릿 판(`runbookVersion`)이 바뀌어야 그 문장이 실린다. 런북을 바꾸므로 판은 바뀐다. 재init은 사용자가 고친 관리 파일을 건너뛴다(`packages/core/manifest.mjs:13` `skipModified`, `plugin/bin/harness-init.mjs:252`의 `skip(modified)` 출력). 고친 `.claude/agents/feature-scout.md`는 새 `tools:`(`backlog_add`)를 받지 못해 write 단계가 `failed`로 끝나고 항목이 생기지 않는다(보고서는 남는다). 고친 `docs/plans/template.md`에는 옛 Problem 문장이 남는다. 그 저장소는 `skip(modified)`가 알린 파일을 되돌리고 재init한다.

롤백 방법:

- 코드: PR revert. head가 pm만 답하는 이전 판정으로 돌아간다.
- 데이터: 새 열 다섯 개는 추가만 했으므로 revert 뒤에도 남아 있어도 무해하다(기존 코드는 읽지 않는다). 필요하면 열을 지우는 역마이그레이션을 쓴다. 다만 되돌린 뒤 다시 배포하면(재전진) 옛 코드가 돈 동안의 행이 §1의 불변식을 어긴다: 옛 제거·완료는 `removedAt`만 찍어 사유가 비고, 옛 재열기는 `removedAt`만 지워 `removedReason: "done"`이 남는다. 재열기된 행이 옛 코드에서 다시 사람에게 제거되면 `removedAt`이 찍힌 채 옛 `"done"`이 남아, 사람이 거절한 항목이 `done`으로 읽힌다. 그래서 되돌린 시각 `T`와 재전진 서버 배포 시각 `R`을 적어 두고, 배포 직후 `UPDATE "BacklogItem" SET "removedReason" = NULL WHERE ("removedAt" IS NULL OR ("removedAt" >= T AND "removedAt" < R)) AND "removedReason" IS NOT NULL`로 옛 코드가 돈 동안 건드렸을 수 있는 행의 사유를 비운 뒤 §1의 백필 `UPDATE`를 다시 돌린다. 옛 코드의 폐기는 백로그를 건드리지 않으므로 그 창에서 제거된 행의 사유는 백필 규칙의 `done`/`owner`로 다시 정해진다. 기간 정리와 §1 재정합은 한 트랜잭션에서 `User → Project` 잠금을 먼저 얻은 뒤 실행한다. `R`은 배포 명령 시작 시각이 아니라 옛 writer가 전부 종료되고 새 writer를 받기 시작한 전환 시각이다(§1). `T`·`R`은 설명용 변수이며 실행 시 기록한 UTC 시각을 DB 드라이버 매개변수로 바인딩한다. `R`로 창을 닫는 이유: 배포 뒤 새 코드가 찍은 `discarded`를 비우면 백필이 그 행을 `owner`로 바꾼다. 두 문장 모두 여러 번 돌려도 결과가 같다. scout가 만든 항목은 `addedBy = 'feature-scout'`로 찾아 웹에서 제거할 수 있다.
- 템플릿: 중첩 저장소 revert 뒤 `npm run seed:templates`로 DB를 되돌리고, 플러그인 재배포 경로를 다시 탄다. 플러그인은 되돌린 코드에서 판을 한 번 더 올려야(`0.3.5`) 설치본에 간다 — 설치본은 판을 비교해 갱신된다(`2026-09-22-user-scoped-project-identity.md:995-996`).
- 순서: 배포 순서(§1)의 역순이다 — 템플릿 재시드(옛 판) → 서버 revert → 플러그인. 서버를 먼저 되돌리면 DB에 남은 새 scout 템플릿이 사라진 `backlog_add`를 부른다(write 단계가 `failed`로 끝날 뿐 데이터는 망가지지 않는다). 마이그레이션은 되돌리지 않아도 된다(위 "데이터").

## Completion or Closure Notes

완료 기록:

- completed-at: 2026-10-01
- verification-summary: Execution Plan 1~8의 구현 및 로컬 검증 완료. 2026-09-26 전체 검증과 2026-10-01 관련 회귀 시험 166개 통과 기록은 위 Verification Results 참조. 사용자 요청에 따라 구현 완료 기준으로 문서를 완료 처리했다.
- implementation PR/commit: 본체 [PR #83](https://github.com/Sangeok/stagekeeper/pull/83), 구현 `75083a8`, dev 머지 `bad4d58`; 템플릿 [PR #4](https://github.com/Sangeok/harness-templates/pull/4), 구현 `6fb7586`, 머지 `171a1bf`. 두 PR 모두 2026-09-27 병합됐다.
- changed files summary: BacklogItem 스키마와 백필 migration, core/plugin의 자동 key·type·기본 scout, 서버 백로그 서비스·MCP backlog_add·head 판정·제거 사유·type 우선권, 웹 폼·표·인박스·3단계 안내, 독립 scout/pm/dev/계획서/런북 템플릿, 아키텍처·제품 문구 및 회귀 시험.
- remaining follow-up: 운영 migration·서버 전환·재정합·템플릿 재시드·플러그인 전달 확인, 설치된 Claude Code의 init → scout → pm → 게이트① 사이클과 실제 계획 커밋/type 근거 확인, 인증된 앱의 백로그 편집·충돌·재로딩 및 인박스·배너 전체 HTTP 검증. 미검증 항목을 통과로 계산하지 않는다.

닫힘 기록: 해당 없음(구현 완료).

<!-- doc-validation-skip -->
## Open Questions

없음. 초안의 다섯 질문은 2026-09-24 grilling에서 결정됐다 — head 순서는 D16, `scoutedSinceChange`는 D17, scout 근거 범위는 D18·D19, 발급 key 안내와 접두어는 D20, 항목 종류는 D21·D22.

<!-- doc-validation-restore -->

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, 완료 metadata와 수행 기록을 현재 상태에 맞게 갱신했다.
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
- [x] 검증 실패와 수정 후 결과, 환경 제약으로 미실행한 검증을 구분했다.
- [x] 잔여 리스크를 명시했다.
- [x] 완료 문서의 metadata·PR/커밋·변경 요약을 채웠고, 미검증 배포·실사용 항목은 후속 작업으로 명시했다.
- [ ] 닫힌 문서라면 … (해당 없음)
