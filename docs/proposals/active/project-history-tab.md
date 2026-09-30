---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-09-29"
approved-by: "요청자 (현재 대화)"
approved-at: "2026-09-30"
approval-scope: "Core와 §G 구현 및 2026-09-30 후속 요청: Items 기본 보기, ITEM별 요약/펼침, 독립 페이지네이션"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/conventions/product-copy.md"
  - "docs/conventions/design.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/completed/2026-09-04-harness-platform-phase-4-entitlement.md"
---

# 프로젝트 History 탭 — 감사 로그를 프로젝트 단위로 읽는다

## 2026-09-30 후속 승인 — 항목별 보기

요청자가 ITEM별 한 행 요약과 상세 펼침을 승인하고 실제 코드 수정을 요청했다.
이 절은 아래 최초 이벤트 피드 설계의 기본 보기·라우팅·페이지 UI에 대한 후속 변경 계약이다.
기존 Events의 필터·행·커서·인가·30일 창은 유지한다. 현재 문구는 `product-copy.md` §19에 반영했다.

- `/history` 기본은 **Items**: 이력이 있는 ITEM마다 한 행, 제목·최신 회차 상태(폐기 포함)·최근 활동 UTC.
- DB에서 전체 회차의 이벤트/보고서를 ITEM별로 묶은 다음 최신 활동순·항목 id 동률 순으로 50개를 조회한다.
  `history-items.ts`의 매개변수 SQL과 `.i.` 커서는 이벤트 커서와 독립이며, 51번째 항목은 다음 페이지 판정용이다.
- 펼치기는 `item=<key>`로 현재 목록의 항목만 읽는다. 해당 키의 모든 회차 이벤트/보고서를 기존 조회로 50개씩 읽는다.
  `itemBefore`는 이력 커서, `before`는 항목 목록 커서다. 펼치기/접기는 목록 페이지를 유지한다.
- **Events**는 `?mode=events`; 그 안의 Key events/All은 기존 계약을 따른다. 옛 `?view=key|all` 주소도 Events로 열린다.
- Items/Events·이벤트 필터 변경은 커서와 펼친 항목을 초기화한다. 목록 Older/Newest는 상세를 닫는다.
- 신규 public query는 `projectHistoryItems`이며 factory와 서버 facade 모두 공개한다. 기존 `projectHistory`는 선택적 key 범위를 받는다.
- 요약·상세 모두 기존 요금제 cutoff를 적용한다. 오래된 이력만 있는 항목은 Free 목록에 나타나지 않으며 잘림 안내는 남긴다.
- 신규 및 기존 실제 PostgreSQL 통합 시험 37개, 프로덕션 앱의 합성 시험 세션·DB 브라우저 탐색을 통과했다.
  상세 결과·화면·정리는 [후속 검증 보고서](../../test-reports/completed/2026-09-30-history-items-regression.md)를 따른다.
  실제 GitHub OAuth 로그인과 원래 V7의 전체 오류/retry 인수는 이번 검증 범위에 포함하지 않았으므로 최초 제안서 상태는 pending이다.

## Summary

이력은 지금 항목 상세 페이지에서 **그 항목의 현재 회차만** 보인다. "승인한 것이 실제 구현으로
이어졌나"를 보려면 항목마다 들어가야 하고, 폐기된 항목과 지난 회차의 이력은 어디서도 볼 수 없다.
기록(`TransitionEvent`·`Report`)은 전부 쌓여 있으므로, 새 탭 **History**가 그것을 프로젝트 단위로
최신순으로 읽는다. 기본 보기 **Key events**는 사람의 결정·보고서·검증 기록·구현 완료·멈춤만 남기고,
**All**은 전부 보인다. 행 모양은 항목 상세 History와 한 위젯으로 공유한다. 조회 전용이며 스키마·MCP·요금제
계약은 바꾸지 않는다.

## Goal

- 프로젝트의 모든 항목 이력을 한 화면에서 최신순으로 본다(새 탭, 새 라우트).
- 승인 → 구현 보고 → 인수가 한 보기(Key events)에서 이어져 읽힌다.
- 항목 상세 History와 History 탭이 같은 이벤트를 같은 모양으로 보인다(행 위젯 공유).
- 작업 유형: 기능 추가 + 기존 화면(항목 상세 History) 행 표시 정리.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 새 라우트(`/p/[slug]/history`)와 탭 목록(`PROJECT_TABS`) 변경 — 라우팅 영향.
- 5개 이상 파일 변경(서버 조회, 위젯, 두 페이지, 라우트, 탭, 규약, 시험).
- 기존 화면(항목 상세 History)의 행 표시가 바뀐다.
- 요금제 축(이력 창)을 새 경로에 적용한다 — 검증은 High-Risk 깊이로 한다.

## Decisions

2026-09-29 grill 세션에서 소유자와 합의한 결정. 이 문서의 설계는 이 표를 따른다.

| # | 결정 |
| --- | --- |
| D1 | **이벤트 피드** — 모든 항목의 이력 행을 한 목록에 최신순으로, 행 앞에 항목 키 |
| D2 | **새 탭 History** — Board · Inbox · Backlog · Pipeline · History · Tokens. 배너는 한 줄 스트립 |
| D3 | 보고서 행은 **종류·제출자·커밋 링크** — 라벨은 Documents와 같다 |
| D3-1 | **행 위젯 하나를 두 화면이 공유** — 항목 상세의 report 행도 같은 모양. Documents 섹션은 그대로 |
| D4 | 행위자는 **기록된 그대로** — 전이는 `human`·`human · session`·`agent`·`pipeline · auto`, 보고서만 `Report.actor` |
| D5 | **Key events / All** — Key events의 경계는 §B의 표가 계약 |
| D5-1 | 기본 보기 **Key events**, All은 `?view=all` |
| D6 | Free **30일 조회 창**을 기존 계약대로 — 잘린 행이 있을 때만 알림 |
| D7 | 폐기·지난 회차 행도 **보여 준다** — 키 링크는 현재 회차만, 나머지는 회색 글자 |
| D8 | **50행 + "Older →"** — 서버에서 그리는 커서 페이지 |

범위 밖(합의): MCP 프로젝트 이력 도구, 에이전트 이름 기록, 항목 상세에서 지난 회차 열기, 날짜·항목 필터.

## Current State

- **이력은 항목 상세뿐이다.** `src/app`의 페이지 12개 중 이력을 그리는 곳은
  `src/fsd/pages/board-item/ui/board-item-page.tsx:114`의 History 섹션 하나다. Board의 Activity는 항목마다
  현재 상태 한 줄이다(`src/fsd/pages/project-board/model/briefing.ts:47`).
- **항목 상세는 현재 회차만 읽는다.** `getWithHistory`(`src/server/pipeline/board-query.ts:205`)는
  `discardedAt: null`인 같은 키의 최신 보드 행 하나를 events·reports와 함께 읽는다. 폐기된 항목은
  `notFound()`이고(`src/app/(app)/p/[slug]/items/[key]/page.tsx:17`), 다시 선정된 키의 지난 회차 이력은 볼 곳이 없다.
- **항목 상세 History는 전이 이벤트만 그린다.** 라우트가 `row.events`만 넘기고(`items/[key]/page.tsx:36`)
  보고서는 그 위 Documents에만 있다(`board-item-page.tsx:93-108`). report 이벤트는
  `implementing → implementing (report)`로 보인다(`noteLabel`, `board-item-page.tsx:44`).
- **이벤트 종류** — 쓰는 곳(`src/server/pipeline/board-query.ts`):

  | 행 | actor | note | 쓰는 곳 |
  | --- | --- | --- | --- |
  | `— → proposed` | human(Put on the board) 또는 agent(pm) | null | `:246` |
  | 상태 전이(Request plan·Approve·Send back·hold·resume·reopen·dev의 in_review·done) | human·agent·pipeline | null | `:286` |
  | 폐기 `→ null` | human | `discard` | `:326` |
  | 비경계 게이트 `X → X` | human | `gate:<id>` | `:358` |
  | 검증 기록 `in_review → in_review` | agent | `validation` | `:407` |
  | 계획 제출 `planning → planning` | agent | `plan` | `:433` |
  | 보고 `X → X` + `Report` 행 | agent | `report` | `:467-468` |
  | 게이트 없는 경계·슬롯 구간 끝의 `implementing → done` | pipeline | null | `:491` |

- **행위자에 에이전트 이름이 없다.** `TransitionEvent.actor`는 `human | agent | pipeline`이고 `actorId`는
  userId·tokenId 또는 `pipeline:<versionId>`다(`model TransitionEvent`, `board-query.ts`의 advanceRun).
  이름은 `Report.actor`에만 있다.
- **이력 창** — Phase 4가 "전이 이벤트·보고 **조회** 창, Free 30일"로 정했다
  (`docs/proposals/completed/2026-09-04-harness-platform-phase-4-entitlement.md:87,93`). 판정은
  `historyCutoff`(`packages/core/entitlement.mjs:145`), 잘림 알림은 `hasHistoryBefore`(`board-query.ts:219`)가
  실제로 밀린 행이 있을 때만 true.
- **시각 표기** — `stamp`(`board-item-page.tsx:36`, 파일 안 비공개 함수)는 `YYYY-MM-DD HH:MM`(UTC)이다. 머리의
  Proposed·Accepted 시각과 History 행이 같이 쓴다.
- **보고서 인수 여부** — `isAcceptance`가 null인 옛 행은 `acceptedAt`과 시각을 비교해 판정한다
  (`src/fsd/pages/board-item/model/item-docs.ts:28`, pages slice 안).
- **같은 시각의 행** — `at`은 `DEFAULT CURRENT_TIMESTAMP`(`prisma/migrations/20260829143353_init/migration.sql:107,119`)
  이고 한 트랜잭션이 여러 행을 쓰는 경로가 있다(예: 제안 + 게이트 없는 경계의 자동 전이). 같은 `at`이
  실제로 생길 수 있다 — 페이지 커서가 시각만 쓰면 행을 건너뛴다.
- **인덱스** — `TransitionEvent`에는 `boardItemId`·`at` 인덱스가 없다(`Report`는 `agentRunId`뿐).
- **클라이언트 캐시** — Next 16.3.3(`node_modules/next/package.json`), `next.config.ts`에 `staleTimes` 없음,
  상위 라우트 트리에도 `loading` 파일 없음. 설치된 문서 `node_modules/next/dist/docs/01-app/02-guides/prefetching.md`와
  `01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md` 기준 일반 `Link`로 다른 페이지에서 들어오면
  동적 page를 새로 요청한다. 다만 **뒤로/앞으로 이동은 이전 page를 재사용할 수 있고 공유 layout도 유지된다**.
  같은 URL 탭 클릭이나 브라우저 히스토리 이동을 새로고침으로 간주하지 않는다. `searchParams`는 Promise이며
  사용하면 동적 렌더다(`01-app/03-api-reference/03-file-conventions/page.md`).
- **규약 drift(이번에 같이 고친다)** — `product-copy.md:165`의 탭 목록이 "Board · Inbox · Backlog · Tokens"로
  Pipeline이 빠져 있다. `product-copy.md:553`은 History 시각을 `01:49:14`로 적지만 코드는 `2026-08-30 01:49`다.
  §11 Documents 예시도 옛 `dev report`·`main-loop report`를 쓰고, 라벨 표의 기본값 `Report`는 현재
  `reportDocLabel`의 `Implementation report`와 다르다. D3의 기존 Documents 동작 보존에 맞춰 같은 절을 정리한다.

검증 기준은 2026-09-30 작업 트리, `HEAD 53817b0ab8cdd025c9d6f14e1bd9c53360db8e6c`다.
Phase 4 문서는 **30일 조회 창·저장 보존·웹 읽기 유지**의 근거로만 참조한다. 그 문서의 옛
`ProjectMember`·프로젝트 선택 방식은 현재 `docs/architecture/README.md`와 `invariants.md`,
`src/server/auth/guard.ts`·`project-access-query.ts`의 직접 소유 모델을 대체하지 않는다.

## Scope

포함 범위(Core):

- 서버 조회: 프로젝트 이력 한 페이지(두 원천 병합, 보기 필터, 커서, 창), 현재 회차 판정, 창 밖 행 유무.
- 위젯 `history-feed`: 행 모델과 목록 UI. 항목 상세와 History 탭이 공유한다.
- 항목 상세 History를 위젯으로 교체(보고서 행 포함, 같은 상태 행은 라벨로).
- 새 페이지 slice `project-history`, 라우트 `/p/[slug]/history`, 탭 추가.
- 공용화: `stamp` → `shared/lib`, 옛 보고 행의 인수 판정 → `entities/board-item`.
- 규약: `product-copy.md` §4 탭 목록·§5 스트립 대상, §11 History·Documents 라벨, 새 §19 History tab(copy-lock `history-tab`),
  `docs/architecture/verification.md` 잠금 표.
- 시험: 조건·병합·커서 단위 시험, 실제 DB 조회·인가·창·렌더 검증, 두 화면 회귀·copy-lock 시험.
- 여섯 탭의 좁은 화면 가독성: 앱 탭 줄·랜딩 데모 탭 줄의 국소적인 가로 넘침 처리.

제외 범위:

- 스키마 변경·마이그레이션(인덱스 포함 — Risks 참조), MCP 도구, 에이전트 이름 기록.
- 항목 상세에서 지난 회차 열기, 날짜·항목 필터, 실시간 갱신.
- Board의 Activity, Inbox, 배너 판정, 서버 액션의 `revalidatePath` 목록(§A의 갱신 범위 유지).
- 기존 `getWithHistory`·`hasHistoryBefore`·MCP 응답·보고서 라벨 판정의 의미 변경, 새 의존성·인증 우회 경로.

## Proposal

### A. 라우트와 탭

- `PROJECT_TABS`(`src/fsd/shared/routes/project.ts:5`)에 `{ id: "history", segment: "/history", label: "History" }`를
  pipeline과 tokens 사이에 넣는다. 탭 렌더(`src/fsd/widgets/app-header/ui/project-tabs.tsx:17`)·활성 탭 판정
  (`activeProjectTab`, `project.ts:58`)·랜딩 데모 탭 줄(`src/fsd/pages/landing/ui/landing-page.tsx:153`)은 이 목록을
  읽으므로 따라온다. 배너는 `isFullBanner`(`src/fsd/widgets/turn-banner/ui/turn-banner.tsx:21`)가 board·inbox만
  크게 그리므로 History는 한 줄 스트립이다(D2).
  앱 탭 줄과 랜딩 데모 탭 줄은 좁은 폭에서 마지막 Tokens까지 읽히게 가로 스크롤을 허용한다.
  탭/라벨은 줄바꿈·축소로 잘리지 않게 하고 앱의 현재 탭 `aria-current`·키보드 포커스를 유지한다.
- 라우트 `src/app/(app)/p/[slug]/history/page.tsx`(`PageProps<"/p/[slug]/history">`):
  1. `const { slug } = await params` 후 `requireProjectOwner(slug)` → `projectId`.
     **프로젝트 데이터 조회 전에** 소유자를 확인한다(첫 await 자체는 params). 미로그인은 `/login`,
     타인·없는 프로젝트는 기존 guard의 `notFound()` 경로다. layout 검사만으로 대체하지 않는다.
  2. `historyCutoff(await planForProject(projectId), new Date())`.
  3. `await searchParams` — `view`가 `"all"`이면 All, 그 밖(없음·다른 값)은 Key events. `before`는
     `parseHistoryCursor`로 읽고 실패하면 첫 페이지. Next의 값은 `string | string[] | undefined`이므로
     `before`가 문자열일 때만 파서에 전달한다. 중복 `view`는 Key events, 중복 `before`는 첫 페이지다.
  4. 병렬: `projectHistory`, `hasProjectHistoryBefore`(창이 있을 때만), `loadProjectRepository(projectId)`.
  5. 페이지에 나온 키로 `currentRoundIds` → `ProjectHistoryPage`.
- 잠긴 프로젝트도 읽기는 연다. 기존 layout이 잠금 배너를 그리고 TurnBanner를 숨기므로 **잠긴 경우에는
  한 줄 턴 스트립도 없다**. 새 서버 액션은 없다.
- `revalidatePath`는 더하지 않는다. 다른 페이지에서 일반 링크로 진입하거나 브라우저를 새로고침하면
  요청 시점의 데이터를 읽는다. 열린 화면·브라우저 뒤로/앞으로 이동의 즉시 갱신은 보장하지 않는다.
  실시간 갱신 제외와 같은 범위이며, 이력 창도 각 서버 요청에서 새로 계산한다.

### B. Key events 계약(D5)

한 행이 Key event인 조건. 이 표가 계약이고 `product-copy.md` §19에 같은 표를 둔다.

| 원천 | 조건 | 들어가는 행 |
| --- | --- | --- |
| `Report` | 전부 | Implementation report · Validation record · Acceptance record · Audit report · Scouting report |
| `TransitionEvent` | `actor = human` | Put on the board · Request plan · Approve · Continue(게이트) · Send back · hold · resume · Discard · Reopen |
| `TransitionEvent` | `note = validation` | 검증 기록 |
| `TransitionEvent` | `to ∈ {done, on_hold}` | 구현 완료(agent·pipeline 모두) · 에이전트의 멈춤 |

빠지는 행: pm의 제안(agent `— → proposed`), 계획 제출(`plan`), agent의 `planning → in_review`,
`to`가 done·on_hold가 아닌 pipeline 행. 위 표의 OR 조건이 우선하며 human 행은 상태와 무관하게 포함한다.
`note = report` 이벤트는 **두 보기 모두, 두 화면 모두에서** 빼고 `Report` 행이 대신한다(같은 제출이 두 번 보이지 않게).

**NULL 함정** — Prisma에서 `NOT: { note: "report" }`와 `note: { not: "report" }`는 SQL `note <> 'report'`가
되어 `note`가 NULL인 행(대부분의 전이)까지 뺀다. 조건은 `OR: [{ note: null }, { note: { not: "report" } }]`로 쓴다.
단위 시험이 조건 객체의 모양을, 생성 SQL 확인이 실제 SQL을 본다(Verification Plan V2·V3).

### C. 서버 조회

순수 부분은 `src/server/pipeline/history-page.ts`(신규, `server-only` 없음 — `test:web`이 import한다), DB 부분은
`src/server/pipeline/board-query.ts`에 두고 `src/server/pipeline/board.ts:8`의 공개 목록에 더한다.

```ts
// 설명용 — 이름과 모양이 계약이고 본문은 구현이 정한다.
// history-page.ts (순수)
export type HistoryView = "key" | "all";
export type HistoryCursor = { at: Date; source: "report" | "event"; id: string };
export type HistoryEventRecord = { source: "event"; id: string; at: Date; boardItemId: string; key: string;
  actor: string; channel: string | null; from: string | null; to: string | null; note: string | null };
export type HistoryReportRecord = { source: "report"; id: string; at: Date; boardItemId: string; key: string;
  actor: string; path: string; commit: string; isAcceptance: boolean | null; acceptedAt: Date | null };
export type HistoryRecord = HistoryEventRecord | HistoryReportRecord;
export function eventWhere(view: HistoryView): Prisma.TransitionEventWhereInput;   // §B + report 제외
export function afterCursor(source: "report" | "event", c: HistoryCursor | null):
  { OR?: Array<{ at: { lt: Date } } | { at: Date; id?: { lt: string } }> };
export function mergeHistoryPage(events: readonly HistoryEventRecord[], reports: readonly HistoryReportRecord[], limit: number):
  { rows: HistoryRecord[]; next: HistoryCursor | null };
export function parseHistoryCursor(raw: string | undefined): HistoryCursor | null;   // "<ISO>.<r|e>.<id>"
export function formatHistoryCursor(c: HistoryCursor): string;
// board-query.ts (DB)
projectHistory(projectId: string, options: { view: HistoryView; since: Date | null; before: HistoryCursor | null; limit?: number }): Promise<{ rows: HistoryRecord[]; next: HistoryCursor | null }>
hasProjectHistoryBefore(projectId: string, view: HistoryView, since: Date | null): Promise<boolean>
currentRoundIds(projectId: string, keys: readonly string[]): Promise<Map<string, string>>
```

위 블록은 본문 없는 계약 표기다. `Prisma`는 `@/generated/prisma/client`에서 **type-only** import한다.
DB 함수의 기본 `limit`은 50, 내부 호출은 양의 정수만 허용한다(위반 시 RangeError). URL에서 limit을 받지 않는다.
세 메서드를 `createBoardQueries`의 반환 객체와 `board.ts`의 destructuring 공개 목록 **양쪽**에 추가한다.
History 타입·파서는 순수 `history-page.ts`에서 라우트로 직접 import하고 FSD에서는 서버 모듈을 import하지 않는다.

- **범위(인가)** 세 조회 모두 `boardItem: { projectId }`(보고서·이벤트) 또는 `projectId`(보드 행)로 거른다 —
  라우트의 `requireProjectOwner`가 준 id만 쓴다.
- **투영** 이벤트는 §C의 필드와 `boardItem.backlogItem.key`, 보고서는 그에 더해
  `boardItem.acceptedAt`을 select해 평탄화한다. `actorId`·tokenId는 UI 입력에 넣지 않는다.
  이력 원천에는 `discardedAt: null`·`removedAt: null`·최신 회차 조건을 걸지 않는다(D7).
- **정렬** `(at desc, source rank desc, id desc)` — 같은 시각이면 보고서(rank 1)가 이벤트(rank 0) 위.
  두 DB 조회는 각각 `orderBy: [{ at: "desc" }, { id: "desc" }]`. id는 결정적인 동률 해소자이며 실제 생성 순서나
  인과관계를 보증하지 않는다. 병합은 정렬된 두 입력의 원천 내부 순서를 보존한다.
- **커서** 마지막으로 보인 행의 `(at, source, id)`. 원천마다 `afterCursor` 조건을 걸고 각각 `limit + 1`개를 읽어
  `mergeHistoryPage`가 병합·자르기·다음 커서를 정한다(병합 결과가 `limit`보다 많을 때만 `next`). URL 표기
  `before=<ISO>.<r|e>.<id>`, 파싱 실패는 null(첫 페이지). ISO는 `toISOString()`의 밀리초 포함 UTC 형식이다.
  ISO 자체의 `.` 때문에 단순 `split(".")`를 쓰지 않는다. 전체 문자열 형식·유효 날짜·ISO 왕복 일치·
  source(r/e)·비어 있지 않은 소문자 영숫자 id를 검증한다. 존재하지 않는 id도 정렬 경계일 뿐이며 조회 권한이 아니다.
- **커서 조건** `c === null`이면 `{}`. 그 외 항상 `at < c.at`을 포함하고, 동일 시각 분기는 아래처럼 OR로 더한다.
  이 OR, `eventWhere(view)`의 OR, `since` 조건은 별도의 `AND` 항목으로 결합해 덮어쓰지 않는다.

  | 조회 원천 | 커서 원천 | 동일 시각에 더 읽는 행 |
  | --- | --- | --- |
  | report | report | `id < c.id` |
  | event | report | 전부(id 조건 없음) |
  | report | event | 없음 |
  | event | event | `id < c.id` |

- **창** `since`가 있으면 두 원천 모두 `at >= since`(D6). 잘림 알림은 `hasProjectHistoryBefore`가 **같은 보기 조건**으로
  `at < since`인 행이 있을 때만 true. before·limit에는 영향받지 않는다. since가 null이면 false이며 DB를 읽지 않는다.
- **현재 회차**(D7) 페이지에 나온 키들 중 `projectId`가 같고 `discardedAt: null`인 최신(`proposedOn desc`) 보드 행 id —
  `getWithHistory`와 같은 규칙. `backlogItem: { key: { in: keys } }`로 한 번에 읽어 키별 첫 행을 Map에 둔다.
  keys가 비면 빈 Map을 반환하고 DB를 읽지 않는다. 행의 `boardItemId`가 그 id와 같을 때만 링크다.
- **요청 간 일관성** 고정 데이터에서 페이지 누락·중복이 없어야 한다. 탐색 중 새 기록·폐기·요금제 변경까지 묶는
  snapshot은 만들지 않는다. 새 기록은 Newest/새로고침에서 읽고, 과거 트랜잭션의 지연 커밋 등은 새 탐색에서 반영된다.
  링크 판정 뒤 폐기된 항목은 기존 상세 404로 갈 수 있으며 탭으로 돌아온다. 조회 전용이어도 이 경합은 존재한다.

### D. 위젯 `history-feed`(D3·D3-1·D4)

`src/fsd/widgets/history-feed/` — 두 페이지(board-item, project-history)가 쓰므로 widget이다. 게이트 라벨
(`@/fsd/entities/pipeline`의 `gateLabel`)과 보고서 라벨(`@/fsd/entities/board-item`)을 함께 읽어야 해서 entity 하나에
둘 수 없다(같은 layer 금지, `docs/architecture/fsd.md`).

- 공개 API(`index.ts`): `HistoryList`, `toHistoryRows`, `HISTORY_TRUNCATED_NOTE`, 타입 `HistoryEventInput`·
  `HistoryReportInput`·`HistoryRowView`. 지금 `board-item-page.tsx:7`의 `TimelineEvent` 타입은 이 입력 타입으로
  대체한다(다른 참조 없음). `HISTORY_TRUNCATED_NOTE`는 지금 `board-item-page.tsx:128`에 인라인인
  "History older than 30 days opens on Pro."를 옮긴 상수로, 두 페이지가 이것을 그린다.
- `model/history-row.ts`(순수) — `toHistoryRows(events, reports, { repo, order, keyLinks? })`: 원천 행 → 표시 행.
  이벤트·보고 입력 모두 `id`·`at` 필수다. 이벤트는 actor/channel/from/to/note, 보고는
  actor/path/commit/isAcceptance/acceptedAt을 갖는다. `isAcceptance`는 기존 Documents 입력과 호환되게
  `boolean | null | undefined`를 받는다. `acceptedAt`은 **그 보고서의 보드 회차 값**이다.
  입력 행은 `boardItemId`·`key`를 가질 수 있다. `keyLinks: { slug, currentRounds: ReadonlyMap<key, boardItemId> }`를
  주면(History 탭) 각 표시 행에 `key`와 `keyHref`가 붙는다 — `currentRounds.get(key) === boardItemId`일 때만
  `itemPath(slug, key)`, 아니면 null(D7). 주지 않으면(항목 상세) 키 칸이 없다.
  - 이벤트: 행위자 `actorLabel`(`board-item-page.tsx:39`에서 옮김). 상태가 바뀐 행은 `from → to`(`to`가 null이면
    `→ discarded`, `from`이 null이면 `—`). **같은 상태 행은 화살표 대신 라벨**: `plan` → "Plan submitted",
    `validation` → "Validation recorded", `gate:<id>` → `gate · <gateLabel>`(지금 `noteLabel`). 알 수 없는 note나
    note 없는 같은 상태 행은 기존 `from → to`와 note(있으면)를 유지해 기록을 버리지 않는다. `report` 이벤트는 행을 만들지 않는다.
  - 보고서: 행위자 `Report.actor`, 본문 `<reportDocLabel(actor, reportIsAcceptance(...))> · <commit 7자>`, 링크
    `blobHref(repo, path, commit)`.
  - 정렬: `order: "desc"`(History 탭)는 §C와 같은 키, `"asc"`(항목 상세)는 그 역순. id 비교는 localeCompare가 아닌
    문자열 비교를 쓰며 DB 순서와의 일치는 V3에서 확인한다. React 행 key는 `event:<id>`/`report:<id>`로 원천을 구분한다.
  - 시각: `utcMinute`(아래).
- `ui/history-list.tsx` — 서버 컴포넌트(`"use client"` 없음, `next/link`의 `Link`). 행에 `key`가 있으면 키 칸을
  그린다 — `keyHref`가 있으면 링크, null이면 `text-quiet` 글자(D7).
  `HistoryList`는 `toHistoryRows`가 만든 rows를 받는 동기 표시 컴포넌트다. DB·server-only import가 없어
  현재 동기 page들과 같은 `index.ts` 공개가 가능하다. 보고서 외부 링크는 기존 Documents처럼 새 탭·`rel="noreferrer"`.
  보고 행이 있을 때 `DOC_LINK_NOTE`를 목록 아래 한 번 표시한다. 항목 상세는 Documents에 이미 있으므로
  `showReportNote={false}`로 중복을 막는다. `HistoryRowView`의 표시 문자열·href만 렌더하고 HTML을 직접 삽입하지 않는다.
- 공용화(import 출처):
  - `utcMinute(date)` — `src/fsd/shared/lib/relative-time.ts`에 추가(지금 `stamp`와 같은 본문). `board-item-page.tsx`의
    머리 시각과 위젯이 import한다. `stamp`는 지운다.
  - `reportIsAcceptance(report, acceptedAt)` — `src/fsd/entities/board-item/model/doc-link.ts`에 추가하고
    `src/fsd/entities/board-item/index.ts`로 공개. `item-docs.ts:28`의 식을 이 함수 호출로 바꾼다(동작 동일,
    `item-docs.test.ts:39,69,78`이 그대로 지킨다). 함수 입력은 `{ at: Date; isAcceptance?: boolean | null }`,
    두 번째 인자는 `Date | null`; `false`도 보존하는 `??` 판정이다. 새 `doc-link.test.ts`에서 직접 검증한다.

### E. 항목 상세

- 라우트의 현재 events 변환이 버리는 `e.id`를 보존한다. `BoardItemView`에는 reports(각 id 포함, 해당
  `row.acceptedAt`을 붙임)·repo를 더한다. `row.reports`는 이미 `getWithHistory`가 창 안에서 읽는다.
  repo는 기존 `loadProjectRepository` 결과이고 원천 입력은 필요한 필드만 매핑한다.
- `BoardItemPage`의 History 섹션을 `toHistoryRows`(`order: "asc"`, `keyLinks` 없음) + `HistoryList`로 바꾼다.
  Documents·Reopen은 그대로고, 잘림 한 줄은 `HISTORY_TRUNCATED_NOTE`를 그린다(문장 동일).

### F. History 탭 페이지

`src/fsd/pages/project-history/` — `ui/project-history-page.tsx`, `index.ts`. 보기 토글(Key events · All), 목록
(`toHistoryRows`에 `order: "desc"`·`keyLinks: { slug, currentRounds }`를 주고 결과를 `HistoryList`에 전달),
페이지 링크("Older →"; 유효 before가 있으면 "← Newest"),
빈 상태, 잘림 한 줄(`HISTORY_TRUNCATED_NOTE`).
라우트가 서버 rows를 source별로 나눠 구조적으로 호환되는 위젯 입력으로 page에 전달한다. page/위젯은
서버 타입을 import하지 않는다. `repo`·`currentRounds`도 서버 렌더 내부 props로만 전달한다.
라우트가 `formatHistoryCursor(next)`를 호출해 `nextCursor: string | null`로 전달하고,
`hasBefore: boolean`·`view: "key" | "all"`·`historyTruncated: boolean`·`slug`를 page props로 준다.
page는 서버 파서/포매터 없이 이 props로 링크를 만든다.
토글과 페이지 링크는 `Link`이며 URLSearchParams로 인코딩한다. Older는 현재 보기를 유지하고 next를 before로,
Newest는 현재 보기를 유지하고 before를 제거한다. **보기 토글·Show all은 before를 제거하고 새 보기의 첫 페이지**로 간다.
key 보기는 view를 생략한다. 유효하게 파싱된 before가 있을 때만 Newest를 표시한다(잘못된 before는 첫 페이지).
행이 없는 유효한 과거 페이지에서도 Newest는 남는다. next가 null이면 Older는 없다. 클라이언트 상태는 없다.

### G. 문구(§19 — 구현 요청에 따라 적용)

copy-lock `history-tab`으로 잠그는 줄:

- 토글 **Key events** · **All**
- 빈 상태 — Key events: "No key events yet." + 링크 "Show all" · All: "Nothing has happened yet."
- 페이지: "Older →" · "← Newest"
- 잘림: "History older than 30 days opens on Pro."(항목 상세와 같은 문장 — `HISTORY_TRUNCATED_NOTE` 하나로 공유)
- 보고 링크 안내: "Opens the recorded commit on GitHub. If it 404s, that commit is not pushed yet."(기존 `DOC_LINK_NOTE`)

잠그지 않고 §19·§11에 적는 것: 탭 이름 **History**, 같은 상태 행 라벨 "Plan submitted" · "Validation recorded" ·
`gate · <gate label>`, 보고서 행 `<label> · <commit>`.
copy-lock은 key 빈 화면·all 빈 화면·보고서가 있는 중간 페이지(Older/Newest/잘림)를 각각 렌더한 HTML을 합쳐 검사한다.
동시에 보일 수 없는 두 빈 문구를 한 화면에서 찾지 않는다. 분기별 부재·링크 목적지는 별도 단언한다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `src/server/pipeline/history-page.ts` + `history-page.test.ts` | create | §B 조건·커서·병합(순수) | low |
| `src/server/pipeline/board-query.ts`, `board.ts` | update | `projectHistory`·`hasProjectHistoryBefore`·`currentRoundIds` 추가·공개 | medium — NULL 조건·커서 |
| `src/fsd/widgets/history-feed/index.ts`, `model/history-row.ts`, `model/history-row.test.ts`, `ui/history-list.tsx`, `ui/history-list.test.ts` | create | 모두 `history-feed/` 아래. 두 페이지 공유 행 | low |
| `src/fsd/shared/lib/relative-time.ts`, `relative-time.test.ts` | update | `utcMinute` 공용화 | low |
| `src/fsd/entities/board-item/model/doc-link.ts`, `src/fsd/entities/board-item/index.ts`; `model/doc-link.test.ts` | update; 시험 create | `reportIsAcceptance` 공용화, 기존 라벨 보존 | low |
| `src/fsd/pages/board-item/model/item-docs.ts` | update | 공용 판정 호출(동작 동일) | low |
| `src/fsd/pages/board-item/ui/board-item-page.tsx`; `ui/board-item-page.test.ts` | update; 시험 create | History → 위젯, `stamp`·`actorLabel`·`noteLabel`·`TimelineEvent` 제거 | medium — 기존 화면 표시 변경 |
| `src/app/(app)/p/[slug]/items/[key]/page.tsx` | update | reports·acceptedAt을 위젯 입력으로 | low |
| `src/fsd/pages/project-history/index.ts`, `ui/project-history-page.tsx`, `ui/project-history-page.test.ts` | create | 모두 `project-history/` 아래. History 탭 화면 | low |
| `src/app/(app)/p/[slug]/history/page.tsx` | create | 라우트(소유자 인가·창·파라미터) | medium — 인가·창 |
| `src/fsd/shared/routes/project.ts`; `project.test.ts` | update; 시험 create | 탭 목록·경로·활성 탭 회귀 | low |
| `src/fsd/widgets/app-header/ui/project-tabs.tsx`, `src/fsd/pages/landing/ui/landing-page.tsx` | update | 여섯 탭의 좁은 화면 넘침 처리만 | low |
| `tests/server/project-history.test.ts`, `tests/server/integration/project-history.test.ts` | create | 묶음 1에서 조회 조합·실제 DB 결과·SQL·회차·창, 묶음 2에서 위젯과의 순서 비교 추가 | medium |
| `docs/conventions/product-copy.md` | update | §4·§5 탭/스트립, §11 History·라벨 drift, §19 신설 + `history-tab` 잠금 | low |
| `docs/architecture/verification.md` | update | 문구 잠금 표에 `history-tab` 행 | low |

파일 작업 사전 확인(2026-09-30): 기존 수정 대상은 모두 존재한다. 신규 세 slice/route 디렉터리
(`widgets/history-feed`, `pages/project-history`, `[slug]/history`)와 신규 시험 파일은 없으며 상위 디렉터리는 존재한다.
해당 디렉터리를 먼저 만든다. 기존 root `app/`·같은 URL의 page·새 public API와 충돌하는 구현은 없다.
착수 시 이 목록을 다시 확인하고 이미 만들어진 대상이 있으면 덮어쓰기 전에 재대조한다.

유지·검증 대상은 별도다: `src/fsd/pages/board-item/model/item-docs.test.ts`, `pages/board-item/index.ts`,
`entities/pipeline/index.ts`·`model/labels.ts`, `shared/lib/copy-lock.ts`, `widgets/turn-banner/ui/turn-banner.tsx`,
`src/app/layout.tsx`·`globals.css`, `(app)/p/[slug]/layout.tsx`·`error.tsx`·`not-found.tsx`,
`(app)/error.tsx`·`not-found.tsx`, `src/server/auth/guard.ts`·`config.ts`·`index.ts`, `src/server/db.ts`·`entitlement.ts`·`project-access-query.ts`·`project.ts`,
`packages/core/entitlement.mjs`·`entitlement.test.mjs`, `prisma/schema.prisma`와 생성된 Prisma 타입,
`tests/server/board-history.test.ts`·`integration/support.ts`·`register-server-only.mjs`,
`scripts/test-server-integration.mjs`·`test-server-integration.test.mjs`·`verify-fsd-boundaries.mjs`·`retired-copy.test.mjs`,
`package.json`·`prisma.config.ts`·`tsconfig.json`·`next.config.ts`·`.github/workflows/check.yml`. 이 파일들은 위 표에 없는 변경을 요구하지 않는다.

공개 API와 옮기는 동작의 검증 경로:

| 현재 소유 / symbol | 구현 후 공개 경로 → 소비자 | 검증 |
| --- | --- | --- |
| `board-item-page.tsx`의 `stamp` | `@/fsd/shared/lib/relative-time`의 `utcMinute` → 항목 머리·history-row | V5·V8, UTC·날짜 경계 동일 |
| `item-docs.ts`의 인수 식 | `@/fsd/entities/board-item`의 `reportIsAcceptance` → item-docs·history-row | V5·V8, true/false/null/undefined·reopen·재인수 |
| `TimelineEvent`·actorLabel·noteLabel·잘림 문장 | `@/fsd/widgets/history-feed`의 입력 타입·toHistoryRows·HistoryList·HISTORY_TRUNCATED_NOTE → 두 page | V5·V8, 로컬 helper/타입/인라인 문장 제거 |
| `reportDocLabel`·`blobHref`·`RepoRef`·`DOC_LINK_NOTE` | 기존 `@/fsd/entities/board-item` → 위젯·item-docs | V5, 라벨·href·안내 본문 |
| `gateLabel` / itemPath·projectPath | 기존 `@/fsd/entities/pipeline` / `@/fsd/shared/routes/project` → 위젯·History page | V5·V7, 실제 라벨·키와 페이지 href |
| 신규 DB 3개 메서드 / 파서·포매터 | `@/server/pipeline/board` / `@/server/pipeline/history-page` → history 라우트 | V1·V2·V3·V6, factory 반환·공개 export·props 연결 |

## Safety Analysis

- **조회 전용** — 새 코드는 `findMany`·`findFirst`·렌더뿐이고 서버 액션·쓰기가 없다. 중복 제출·쓰기 롤백은 해당 없음.
  여러 읽기 사이의 변경은 §C의 요청 간 일관성 범위를 따른다. DB 실패를 빈 이력으로 삼키지 않는다.
- **인가** — params 해석 다음, 데이터 조회 전에 page 자체가 `requireProjectOwner(slug)`를 호출한다.
  세 조회의 프로젝트 격리를 객체·실제 DB 결과·직접 URL 접근으로 각각 검증한다(V3·V6).
- **요금제 창** — 같은 요청의 cutoff를 두 원천과 알림에 전달한다. 파서가 받은 before는 cutoff를 대체하지 않는다.
  `at === cutoff`는 포함, 그 직전은 제외한다. 창 밖 데이터는 HTML/RSC에도 전달하지 않는다(V4·V7).
- **캐시** — §A의 새 요청에서만 최신 값을 보장한다. 브라우저 복원·이미 열린 화면은 새로고침으로 갱신한다.
- **FSD** — widget(history-feed) → entities(board-item·pipeline)·shared. pages 둘이 widget을 쓴다. `verify:fsd`로 확인.
- **기존 화면** — 행 표시만 바뀌고 Documents 순서·라벨·링크·reopen 조건·머리 시각·상세의 조회 창은 보존한다.
  기존 item-docs 시험과 새 전체 상세 렌더 시험으로 확인한다(V5).

런타임·최종 출력의 검증 대상:

| 흐름 / 출력 | 동작과 최종 소유자 | 검증 |
| --- | --- | --- |
| 최초 진입·보기 변경·Older·Newest | `history/page.tsx`가 인가·창·파라미터 처리 → ProjectHistoryPage → HistoryList. 보기 변경은 커서 초기화 | V2·V5·V7 |
| 미로그인·타인·없는 slug | requireUser의 login redirect / page와 layout의 owner guard. layout 실패는 `(app)/not-found.tsx`; 프로젝트 내용 미노출 | V6·V7 |
| 선택되지 않은 프로젝트 | 기존 layout의 LockedProjectBanner와 읽기 본문. 턴 스트립·새 쓰기 UI 없음 | V6·V7 |
| 빈 목록·창 밖만 존재·범위를 지난 커서 | 빈 상태와 필요한 잘림 안내만; 유효 before이면 Newest로 복귀 가능 | V2·V4·V5·V7 |
| 조회 오류·재시도 | page 오류는 `[slug]/error.tsx`, layout 오류는 `(app)/error.tsx`. 이 Next 버전의 `retry()`가 재조회; 빈 성공 화면으로 변환 금지 | V7 |
| 항목 상세 | 기존 route의 현재 회차·창 → BoardItemPage → 공용 위젯. Documents·Reopen 위치 유지 | V5·V7 |
| 셸·공개 랜딩 | PROJECT_TABS의 여섯 탭; app-header/landing이 소비. TurnBanner는 available 프로젝트만 compact. 좁은 화면 전 탭 노출 | V5·V7 |
| 스타일·문구·외부 링크 | 기존 globals.css·root layout의 두 next/font 서체; §G/기존 라벨 함수; GitHub blob은 보고 당시 commit. 새 자산·metadata override 없음 | V1 build·V5·V7의 실제 본문/href·라이트/다크 |
| 생성 타입·빌드 | `next typegen`/build가 src/app에서 PageProps·route를 생성. Prisma는 기존 schema에서 생성; 산출물 직접 편집 금지 | V1, 새 route 수집·경계 확인 |

프런트에서 새 timer·listener·polling·구독을 등록하지 않으므로 cleanup은 없다. DB 시험은 자기 fixture만 정리하고
연결을 finally에서 끊는다. V7은 앱의 DB 연결·OAuth 사용자·fixture 수명까지 별도로 격리하며 아래 렌더 절차에 따라 복원한다.
인증 시뮬레이션이나 process 모킹을 쓰는 시험은 각각 격리하고 종료 시 복원한다.

## Approval

승인 메모:

- 문서 검증 이후 요청자가 "해당 문서를 바탕으로 실제 코드 구현을 진행"하도록 명시적으로 요청했다.
  이 요청을 Core·§G 문구의 구현 승인으로 반영했으며 별도 mock 승인을 다시 요청하지 않았다.
- 구현 컴포넌트의 정적 fixture 렌더로 두 보기·빈 상태·잘림·회차 링크·보고 행·모바일 탭을 검토했다.
  [검증 보고서와 화면 증거](../../test-reports/completed/2026-09-30-project-history-tab-regression.md)에 기록한다.
  정적 렌더는 실제 인증·DB 인수 검증을 대신하지 않는다.

## Execution Plan

1. **묶음 0 — 검토 산출물**: 이 제안서 + 문구 덱(§G) + 정적 화면. 현재 구현 승인은 Approval과 front matter를 따른다.
2. **기준선**: 착수 시 `git ls-remote --heads origin`으로 dev 존재 확인 → dev 기반 `harness/<topic>` 작업.
   V1 환경 준비 후 기준선 결과와 신규 파일 충돌 여부를 기록한다. 기존 실패를 신규 기능의 통과로 간주하지 않는다.
3. **묶음 1 — 서버**: 순수 조건·커서(V2) → DB 메서드·factory 반환·공개 export → DB 없는 조회 시험과 격리 DB 검증(V3·V4).
   이때 DB 순서는 fixture에서 독립적으로 정한 기대 tuple과 비교한다. 아직 없는 위젯을 import하지 않는다.
4. **묶음 2 — 위젯과 항목 상세**: 공용 함수·export → history-feed → id/reports/repo props 연결 → 상세 회귀·이동 확인(V5·V8).
   위젯 생성 뒤 V3 통합 시험에 공개 `toHistoryRows`의 desc 결과 비교를 추가하고 V3·V4를 다시 통과한다.
5. **묶음 3 — History 탭**: 탭·라우트·페이지·좁은 탭 줄 + `product-copy.md` §4·§5·§11·§19 + `verification.md`.
   copy-lock·링크(V5) → 직접 접근 인가·렌더·실제 탐색(V6·V7). 과거 문구와 캐시 가정을 남기지 않는다.
6. 전체 게이트(V1)와 Definition of Done → `gh pr create --base dev`. `check` green 뒤에만 병합한다.

## Verification Plan

| # | 무엇을 | 어떻게 | 기대 결과 |
| --- | --- | --- | --- |
| V1 | 전체 게이트 | PowerShell에서 `npm.cmd run verify:fsd`, `npm.cmd run test:architecture`, `npm.cmd run check`, `npm.cmd test`, `npm.cmd run test:web`, `npm.cmd run test:server`, `npm.cmd run build`를 개별 실행·종료 코드 기록 | 모두 0. check가 lint·next typegen·tsc를 포함한다. build는 사용자 dev 서버를 임의로 끄지 않고 별도 checkout 또는 CI에서 실행 |
| V2 | 순수 조건·커서 | `src/server/pipeline/history-page.test.ts`(`test:web`) | §B 포함/제외 전 종류·두 보기 NULL 보존; 커서 4조합; 같은 at의 report/event 각각 여러 id, 원천별 단독/빈 입력, 0/49/50/51행과 여러 페이지, round-trip·잘못된 날짜/소스/id/빈 값. 입력 불변·결정적 순서·next 유무 |
| V3 | 실제 조회·SQL | `tests/server/project-history.test.ts`(`test:server`)로 spy DB의 최종 where/orderBy/take/select·factory export를 확인. `tests/server/integration/project-history.test.ts`를 `npm.cmd run test:server:integration`으로 실행 | 실제 DB에서 key/all·NULL 전이·report 중복 제거·타 프로젝트 격리·지난/폐기 회차 포함. 같은 at에 양 원천 각각 51개 이상을 두고 모든 페이지의 id 집합·순서가 fixture의 기대 tuple과 일치. 묶음 2부터 위젯 desc와도 비교. before OR가 필터·since를 덮지 않음. 최신 회차 Map과 기존 getWithHistory가 같은 id, empty keys/no cutoff는 쿼리 0 |
| V4 | Free/Pro/Max 조회 창 | V3 두 시험에서 고정 now + 실제 `historyCutoff`를 사용. at가 cutoff−1ms/동일/+1ms인 event/report와 오래된 행만 있는 fixture | Free 양 원천 `>=`, Pro/Max 전체; before로 우회 불가. 창 밖 key 대상만 알림, key에서 제외되는 옛 event만 있으면 false/all이면 true, report-only면 true, 창 없는 플랜 false. 잘림은 pagination 여부와 독립 |
| V5 | 모델·렌더·보존 | 위젯의 `history-row.test.ts`·`history-list.test.ts`, 새 `board-item-page.test.ts`·`project-history-page.test.ts`, `doc-link.test.ts`·기존 `item-docs.test.ts`·`relative-time.test.ts`, 새 `shared/routes/project.test.ts`, 기존 landing copy-lock(`test:web`) | actor/channel·같은 상태 라벨/fallback·report 라벨/커밋/href·source:id 키·asc/desc·현재/과거/폐기 링크; UTC·인수 판정 보존; 상세 Documents/Reopen/머리 유지; 탭 순서·활성화; §G 분기별 문구·부재·URL·copy-lock(합친 HTML) 누락 0 |
| V6 | 인가·데이터 격리 | 새 라우트의 guard-before-read와 props 매핑을 리뷰하고, V3 실제 다른 owner/project fixture + V7 직접 GET·브라우저 탐색을 함께 확인 | 미로그인 login, 타인/없는 slug 같은 not-found 본문·프로젝트 데이터 미노출, 소유자 성공·선택되지 않은 프로젝트도 읽기 성공. 임의 before에 타 프로젝트 id를 넣어도 권한·창 우회 없음 |
| V7 | 최종 화면·실제 탐색 | 아래 렌더 절차로 `/p/<fixture-slug>/history`·`?view=all`·Older/Newest·현재 항목 상세·`/`를 확인 | 50행·표의 필터·다음/최신 링크·토글 초기화·빈 상태·잘림·GitHub href·현재 회차 링크가 실제 DOM에 맞음. 선택됨: compact strip / 선택 안 됨: lock banner만. 360/800px·라이트/다크에서 여섯 탭이 잘리지 않고 앱 탭은 키보드로 접근 가능. 랜딩의 장식용 데모는 기존 aria-hidden 유지. 새 요청·새로고침 최신성, 오류 후 retry 회복 |
| V8 | 이동·범위 guard | 아래 검색 명령과 구현 diff를 함께 리뷰. 신규 public API import는 V1 typecheck·V5가 검증 | 옛 helper·타입·인라인 문장/식 없음, 새 위치에 존재. getWithHistory/hasHistoryBefore 의미·MCP·schema·요금제·배너 판정·revalidatePath 목록·Documents 동작 불변 |

**V1 환경 준비.** 새 checkout은 lockfile에 맞춰 `npm.cmd ci` 후 `npm.cmd run db:generate`를 먼저 실행한다.
`check`는 Prisma Client를 생성하지 않으며 생성 파일은 Git에 없다. `prisma.config.ts`가 읽을 `DATABASE_URL`도 필요하다.
DB 없는 기준선 검사에는 기존 CI의 비연결용 설정을 따르고, 실제 DB·브라우저 시험에는 각각 아래 격리 절차를 따른다.

**V3 DB 전제와 정리.** 기존 runner의 `validateTestDatabase`가 허용하는 별도 `stagekeeper_test_*` PostgreSQL을
미리 마련하고 `TEST_DATABASE_URL`로 지정한다. runner는 migration deploy 후 직렬 시험을 실행하며 운영 URL로
fallback하지 않는다. `DATABASE_URL`을 시험 URL로 바꾸는 것은 runner의 **자식 프로세스 안에서만** 일어난다.
따라서 이 명령을 실행해도 기존 웹 서버의 DB는 바뀌지 않으며, finally에서 지운 V3 fixture도 V7에 남지 않는다.
`integration/support.ts`의 fixture/cleanup·connections를 재사용하고 추가한 소유자 fixture를
각각 finally에서 정리한다. 실제 DB가 없으면 Not run으로 남긴다(단위 시험으로 대체해 통과 처리 금지).
SQL 보조 확인은 시험 전용 PrismaClient에 query event log를 켜서 생성된 SELECT와 바인딩을 **메모리에서** 검사한다.
note의 `IS NULL OR <>`, 프로젝트 join/조건, at·id 비교와 take를 확인하되 alias·공백·placeholder 번호에 결합하지 않는다.
추가 연결은 finally에서 disconnect하고 URL·쿠키·토큰·query params를 출력하지 않는다. 빈 DB의 SQL 텍스트만으로
결과 정확성을 판정하지 않는다. 현재 CI check는 DB 통합 시험과 test:server를 실행하지 않으므로 그 결과는 별도 첨부한다.

**V7 렌더 환경과 fixture.** V3·V5를 통과한 뒤 기존 GitHub 로그인 흐름을 쓰는 별도 로컬 시험 서버에서 수행한다.
`mathgic`·`ITEM-02` 같은 실데이터 존재를 전제하지 않는다. 다음 준비·정리 결과를 렌더 증거에 함께 남긴다.

1. V3와 같은 URL 안전 검사와 migration deploy를 마친 격리 DB를 쓴다. 환경 덮어쓰기 **전에** 원래 `DATABASE_URL`과
   `TEST_DATABASE_URL`을 `validateTestDatabase`로 비교한다. 검사 뒤 별도 앱 프로세스의 `DATABASE_URL`에 검증된 URL을 전달하고
   새로 시작한다. `src/server/db.ts`는 `TEST_DATABASE_URL`을 읽지 않으며, 이미 초기화된 singleton은 env 변경으로 교체되지 않는다.
   기존 사용자 서버·공유 `.env`는 바꾸지 않는다. 별도 checkout/포트와 그 주소에 맞는 기존 OAuth callback 설정을 준비한다.
2. 격리 브라우저 컨텍스트에서 GitHub로 로그인해 **그 DB에** 생성된 시험 사용자 A의 `User.id`를 얻고, 그 id를
   fixture 프로젝트의 `ownerUserId`로 쓴다. `integration/support.ts`의 가상 사용자(음수 githubId)로 실제 로그인하려 하지 않는다.
   타인 접근은 별도 가상 소유자 B의 프로젝트를 A로 열어 확인하고, 미로그인은 별도 익명 컨텍스트에서 확인한다.
3. V3와 별도로 §B 각 행, 50개 넘는 이력, 지난/폐기 회차, `available: false`인 프로젝트를 만들고
   기대 id/라벨/href 목록을 기록한다. A의 시험용 Subscription을 Free/Pro/Max로 차례로 설정해 재요청한다.
   원래 Subscription 유무·값을 보관하고, fixture와 플랜은 렌더 검증이 끝날 때까지 유지한다.
4. finally에서 이 검증이 만든 프로젝트·가상 B만 삭제하고 A의 Subscription을 원상 복원하며 연결·브라우저·시험 서버를 종료한다.
   `cleanup(db, A.id)`는 A와 그 소유 데이터를 모두 지우므로 호출하지 않는다. 실패·중단 시에도 생성 id와 복원할 상태를 추적한다.

해당 시험 서버·DB·OAuth 세션을 준비할 수 없으면 인가 렌더는 Not run으로 기록한다.
운영 데이터 수정·production 인증 우회·쿠키 로그를 검증 수단으로 쓰지 않는다.
브라우저에서 토글→Older→토글(첫 페이지)→Older→Newest, 빈 과거 페이지 복귀,
상세 링크와 새로고침을 확인한다. Free에서 제외된 행은 숨긴 DOM이 아니라 응답 HTML/RSC에도 없어야 한다.
뒤로/앞으로 복원은 최신성 보장 대상이 아님을 구분한다. 격리 환경에서 page 조회 실패와 layout 실패를 각각 유도해
기존 오류 본문과 Try again 재조회를 확인하고 복원한다. DOM 단언과 스크린샷을 함께 남기며 보고서 GitHub 링크는
기록된 href를 검증한다(미푸시 커밋의 원격 404는 안내된 동작).

**V8 PowerShell 검색.** 구현 후 아래 명령을 각각 실행한다. 첫 검색은 **제품 .tsx만** 보아 테스트의 회귀 문자열은
허용하며 0건/exit 1이 기대 결과다. 뒤 검색들은 새 구현·소비자의 양성 근거(1건 이상/exit 0)다.

```powershell
rg -n --glob '*.tsx' 'const stamp|function actorLabel|function noteLabel|TimelineEvent|History older than 30 days' src/fsd/pages/board-item
rg -n 'utcMinute' src/fsd/shared/lib/relative-time.ts src/fsd/pages/board-item/ui/board-item-page.tsx src/fsd/widgets/history-feed/model/history-row.ts
rg -n 'reportIsAcceptance' src/fsd/entities/board-item src/fsd/pages/board-item/model/item-docs.ts src/fsd/widgets/history-feed/model/history-row.ts
rg -n 'HistoryList|toHistoryRows|HISTORY_TRUNCATED_NOTE|HistoryEventInput|HistoryReportInput|HistoryRowView' src/fsd/widgets/history-feed src/fsd/pages/board-item src/fsd/pages/project-history
```

검색만으로 export·로컬 인수 식 제거·의미 보존을 증명하지 않는다. 위 공개 API 표와 V5 시험·diff로 함께 확인한다.
이 문서의 `TBD`는 완료/닫힘 후 기록란에만 남긴다. 문구·화면의 구현 승인과 검토 기록은 Approval에 둔다.

## Definition of Done

- D1–D8을 위 서버·두 화면·실제 링크/본문에서 확인하고 V1–V8의 결과·fixture·렌더 증거를 기록했다.
- report 이벤트 중복 없음, NULL 전이 보존, 고정 데이터의 커서 누락·중복 없음, 현재 회차에만 키 링크가 있다.
- 소유자 인가와 Free 창을 DB 및 응답 본문에서 검증했고 선택되지 않은 프로젝트의 읽기를 유지했다.
- 위젯 생성 뒤 V3·V4 재검증과 V7의 앱 DB·OAuth 소유자 일치, 별도 fixture 준비·정리·플랜 복원을 확인했다.
- 공용 함수·위젯의 공개 export/소비자·옛 구현 제거와 Documents·Reopen·MCP·스키마 불변을 확인했다.
- 탭·규약·copy-lock을 함께 반영했고 좁은 화면에서도 전 탭에 접근한다. 묶음 0 승인 내용을 반영했다.
- DB·브라우저 시험 미실행을 완료로 표시하지 않는다. pending 상태는 실제 구현·검증 완료 전까지 유지한다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| V1 | Pass | check(lint·typegen·tsc·아키텍처), verify:fsd, test 187개, test:web 437개, test:server 10개, production build |
| V2·V5·V8 | Pass | 순수 커서·행 모델·두 화면 렌더·공개 API·문구 잠금·옛 구현 제거. 모바일 탭 스크롤의 세로 넘침과 랜딩 grid 폭도 렌더 후 수정 |
| V3·V4 | Partial / DB Not run | DB 없는 조회 조합과 실제 cutoff 시험 통과. 격리 PostgreSQL 통합 시험은 작성·타입 검사 완료, TEST_DATABASE_URL 없음 |
| V6 | Partial | 실제 route 본문을 격리 실행해 guard 실패 시 조회 중단·owner id 전달·검색값 처리 검증. 실제 서버 미로그인 redirect 확인. 로그인 owner/타인/선택 제외 접근은 미실행 |
| V7 | Partial / authenticated E2E Not run | 실제 컴포넌트와 build CSS의 정적 fixture를 360/800px·라이트/다크로 검토. 실제 DB·OAuth 세션·HTML/RSC 조회 창·오류 retry는 미실행 |

이번 요청에서 사용자는 시험 환경이 없으며 가능한 자동 검증을 진행하도록 답했다.
자세한 실행 근거·정리·잔여 항목은 [검증 보고서](../../test-reports/completed/2026-09-30-project-history-tab-regression.md)에 있다.
Core 코드는 구현했으나 V3·V4·V6·V7의 실제 환경 인수가 남아 있으므로 `completed`로 바꾸지 않는다.

## Risks and Rollback

잔여 리스크:

- **인덱스 없음** — 프로젝트 이력은 `BoardItem.projectId`로 거른 뒤 `TransitionEvent.boardItemId`로 잇는데 그 열에
  인덱스가 없다. 현재 운영 데이터 크기·성능은 이번 문서 대조에서 측정하지 않았다. V3에서 충분한 회차/행 수의
  fixture로 실행 시간·조회 계획을 기록하고, 문제가 있으면 인덱스와 정렬 키를 별도 제안한다.
  이 제안서는 마이그레이션을 하지 않는다. 메모리는 원천당 51행으로 제한하지만 DB 스캔 비용까지 제한되는 것은 아니다.
- **에이전트 이름 부재** — `agent` 행은 누가 했는지 말하지 못한다(D4, 범위 밖).
- **항목 상세 표시 변경** — 같은 상태 행이 화살표에서 라벨로, 보고서 행이 추가된다. 묶음 0에서 확인한다.
- **옛 인수 보고 판정** — isAcceptance가 null이고 reopen으로 acceptedAt도 지워졌다면 원래 목적을 복원할 수 없다.
  기존 Documents의 fallback을 그대로 공유한다. 사실을 추정해 DB를 보정하지 않는다(V5).
- **탐색 중 변경** — §C의 snapshot 없는 조회·회차 링크 경합과 §A의 브라우저 복원 한계가 있다. 새로고침/V7로 확인한다.

롤백 방법:

- 조회 전용·스키마 불변이라 커밋 revert로 되돌린다. 탭 목록과 규약도 같은 커밋에 있다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD
