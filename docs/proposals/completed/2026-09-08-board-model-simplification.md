---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-07"
approved-by: "Sangeok"
approved-at: "2026-09-07"
approval-scope: "QG-01·QG-02·QG-03과 명시된 연관 문서·테스트 수정, 검증 후 commit·push 및 check 통과 뒤 dev PR 병합"
completed-at: "2026-09-08"
verification-summary: "QG-01·02·03 구현 완료. verify:fsd·check(architecture 19/19)·npm test(112/112)·test:web(147/147)·Turbopack build 통과. 보드 테스트 30/30, 변경 전후 HTML 112개 동일, 목록 HTML·삭제/타입 구조·범위 검사 통과. 초기 sandbox 포트 차단은 권한 확장 및 Turbopack 캐시 재생성으로 해소."
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-09-07-dead-code-removal-candidates.md"
---

# 보드 모델과 프로젝트 목록 플랜 조회 간소화

## Summary

보드 화면의 날짜 섹션 변환 왕복과 현재 화면에서 사용하지 않는 출력·계산을 제거한다.
프로젝트 목록은 헤더 로더가 이미 반환한 사용자 플랜을 재사용한다.
Activity·Team의 표시 순서, 문구, 링크, 색상, 글자 수 초과 표시와 프로젝트 잠금 표시는 유지한다.
새 기능·새 추상화·DB 변경 없이 기존 구현을 줄이는 제안이다.

이 문서는 앞선 리뷰에서 채택된 QG-01·QG-02·QG-03을 구현 가능한 단일 범위로 구체화한다.
세 finding을 구현하고 로컬 필수 검증을 마쳤다. 구현 커밋은 `eab1f4c`다.
아래 Proposal·Tasks·Verification Plan은 승인된 실행 계획 기록이며, 실제 수행 결과는 Verification Results와
Completion or Closure Notes에 남긴다. PR 병합은 원격 check가 통과한 뒤 진행한다.

## Goal

- 보드 입력을 서버가 반환한 최신 행 형태로 받고, 날짜를 문자열 섹션으로 바꾸는 중간 계약을 없앤다.
- 화면에서 읽는 출력만 만들고, 미사용 출력 전용 테스트와 발화·아바타 모델을 함께 정리한다.
- 프로젝트 목록에서 같은 사용자 플랜을 두 번 조회하는 경로를 하나로 줄인다.
- 기존 제품 동작을 유지한다. 개선 여부는 줄 수보다 제거된 변환·계산과 회귀 검증으로 판단한다.

## Proposal Size

`STANDARD` / `proposal-size: standard`.
파일 삭제, slice public API 변경, 두 라우트 및 5개 이상 파일 변경이 포함된다.
영속 데이터·외부 API·인가 규칙은 바꾸지 않아 DB 마이그레이션이나 단계적 배포는 필요 없다.
Reconciliation 검토 profile은 `High-Risk`로 적용했다. 잠금 표시가 entitlement를 소비하므로
플랜 값의 출처·인가 보존·최종 표시까지 확인하는 검토 깊이이며, 변경 범위나 제품 구현 위험도를 확대하는 분류는 아니다.

## Current State

### 조사 기준과 명령 환경

- 기준 커밋: `115f235903803bb4df1eddc7fca7df20f0a3a156` (`dev`, PR #19 병합 직후).
- 구현용 브랜치: `harness/board-model-simplification`.
- `git fetch origin dev` 후 `git rev-list --left-right --count dev...origin/dev` 결과는 `0 0`이었다.
- 시작 작업 트리는 깨끗했다. 현재 문서 외 사용자 변경을 포함하는 작업은 없다.
- 단일 Next.js package: Next `16.3.3`, React `19.2.8`, TypeScript strict/allowJs, npm.
- 테스트는 Node test runner와 `tsx`를 사용한다. `react-dom/server`의 `renderToStaticMarkup`도
  기존 의존성으로 실행 가능하다. 별도 브라우저 테스트 패키지를 추가하지 않는다.
- 대조 시 로컬 Node는 `v26.4.0`, `.github/workflows/check.yml`의 CI Node는 `22`였다.
  로컬 통과를 Node 22 실행 결과로 간주하지 않으며 최종 PR은 기존 CI까지 확인한다.
- 관련 하위 `AGENTS.md`는 발견되지 않았으며 루트 지침을 따른다.
- 파일 위치의 기준은 [현재 아키텍처](../../architecture/README.md)와 [FSD 규칙](../../architecture/fsd.md)이다.
- 설치된 Next 문서의 `01-app/03-api-reference/03-file-conventions/page.md`와
  `01-app/01-getting-started/05-server-and-client-components.md`를 확인했다.
  `await params`, `PageProps`, Server Component 경계를 그대로 유지한다.

아래 `경로:줄`은 기준 커밋의 위치다. 구현 때 줄 번호가 움직이면 심볼로 다시 찾는다.

### 발견 사항과 계약 대조

| 항목 | Observed: 현재 코드 | Contracted: 계약/판정 | 조치 |
| --- | --- | --- | --- |
| QG-01 / Should | 보드 route `src/app/(app)/p/[slug]/page.tsx:17`이 `buildBriefing(toBoardSections(rows), ...)`를 호출한다. entity `model/board-item.ts:21`에서 재정렬·날짜별 그룹화, page `model/briefing.ts:40,58`에서 평탄화·중복 제거·날짜 재해석을 한다 | `src/server/pipeline/board.ts:21`의 `latestBoard`가 이미 `proposedOn desc`와 `distinct: ["backlogItemId"]`를 적용한다. `prisma/schema.prisma:93`에 프로젝트별 key 유일 제약이 있다. 현재 Board는 날짜 섹션을 표시하지 않는다 | 날짜가 있는 평평한 최신 행을 page 모델에 직접 전달 |
| QG-02 / Should | `briefing.ts:12,25,31`의 출력이 실제 소비자인 `project-board-page.tsx:11`보다 크다. `known-agents.ts:57`의 `initialOf`는 테스트에서만 호출한다 | [제품 문구 §6](../../conventions/product-copy.md)은 Board를 Activity·Team으로 정의하고 Team에 아바타가 없다고 명시한다 | 미사용 출력·전용 계산·전용 테스트 제거 |
| QG-02 추가 | 모델이 `line`에 `KEY · `를 붙이고 UI `project-board-page.tsx:36`이 이를 제거한다 | 화면은 key를 별도 `<span>`으로 렌더한다 | key와 본문을 별도 값으로 전달 |
| QG-03 / Consider | `src/app/(app)/projects/page.tsx:11,18`에서 `loadHeaderUser`와 `planForUser`를 함께 호출한다 | `src/fsd/widgets/app-header/api/app-header.server.ts:9`가 이미 `{ login, plan }`을 반환한다 | 목록의 별도 플랜 조회 제거 |
| 보드 요약 문구의 명세 차이 | `briefing.ts:83`은 `result ?? reason`의 첫 문장을 사용한다. 실제 DB 입력은 reason이 non-null이다 | 제품 문구 표는 result 또는 `Done`/`On hold`만 적어 reason fallback을 생략했다 | 이 제안은 **현재 코드의 result → reason 우선순위를 보존**한다. 구현과 함께 해당 문구 표·설명만 명확히 고친다 |

**Inferred:** QG-01의 중간 형식과 QG-02의 미사용 값은 ApcH 이식 당시 모델의 잔재이며,
현재 화면에 필요한 계약으로 축소할 수 있다. 이는 위 실행 소비 경로와 전역 참조 검색에 근거한 판단이다.

**제한:** 운영 DB나 private 템플릿 저장소를 이번 작업에서 조회하지 않았다. 이 변경 대상은 웹 보드의
내부 모델이며, 확인된 서버·core·플러그인 소비자는 없다. 영속 상태와 외부 MCP 계약을 수정하지 않는다.

## Scope

포함:

- QG-01: `BoardSection`·날짜 그룹화·프런트엔드 중복 제거·날짜 재파싱 제거.
- QG-02: 보드 입력/출력 타입 축소, 미사용 identity 데이터 제거, ID 접두어 왕복 제거, 기존 테스트 개편.
- QG-03: 프로젝트 목록에서 `user.plan` 재사용.
- 위 삭제로 직접 낡아지는 문서 예시·출처 매핑·주석과 현재 요약 문구 설명의 국소 갱신.

제외:

- 승인 게이트, 카드 잠금/오류 경계, `requireMember`/`requireProjectWrite`, CAS, 감사 원장.
- `latestBoard`의 DB 조회·정렬·distinct, Prisma 스키마·migration, 플랜 판정·상한·과금 정책.
- Inbox·TurnBanner의 validation·상태 파생 로직. **보드 출력의 validation을 제거해도 실제 검증 기록은 유지한다.**
- UI 스타일 변경, 표시 순서 재설계, 문구 개선, 새 에이전트 역할·필터·페이지네이션.
- core/플러그인/서버/의존성/tsconfig/검사기 변경과 이전 제거 제안서의 후속 export 정리.
- Phase 3 예약 스키마 및 `plugin/lib` 전체 복사 정책.

## Behavioral Requirements

### REQ-BSIM-001: Activity 목록과 화면 표현 보존

WHEN 사용자가 프로젝트 Board를 열면, THE SYSTEM SHALL 같은 최신 항목들을
`proposed`·`in_review` 그룹부터 보여주고 그 뒤에 나머지 상태를 보여준다.
각 그룹 안에서는 `latestBoard`의 입력 순서를 유지한다. key·항목 링크·상태 라벨·문구·명암은
아래 Proposal의 표시 규칙을 따른다. 항목이 없으면 `No activity yet.`을 유지한다.

### REQ-BSIM-002: 날짜 문구와 요약 예산 보존

WHEN Activity 문구에 경과일을 표시하면, THE SYSTEM SHALL 제안 시각과 현재 시각의
UTC 달력일 차이를 사용하고 미래는 0으로 처리한다. 0일 태그는 생략하고 1일은 `1 day`,
2일 이상은 `N days`로 표시한다. WHEN reason 또는 개별 result 하나가 150자를 넘으면,
THE SYSTEM SHALL `Over 150 characters` 표시를 유지한다. 합친 결과 문자열의 길이로 판정하지 않는다.

### REQ-BSIM-003: Team의 순서와 상태 문구 보존

WHEN Board가 Team을 표시하면, THE SYSTEM SHALL `pm → 입력 roster 순서 → plan-verifier →
doc-auditor → feature-scout` 순서와 아래 상태 우선순위를 유지한다. 화면에는 agent 문자열과 state만 표시한다.

### REQ-BSIM-004: 프로젝트 목록의 플랜 표시 일관성 보존

WHEN 프로젝트 목록을 렌더하면, THE SYSTEM SHALL 같은 사용자 플랜 값으로 헤더 배지와
소유 프로젝트의 잠금 표시를 계산한다. 생성 순서에 따른 활성 프로젝트 선정과 소유자가 아닌 멤버 행의
처리는 현재 `activeProjectIds` 및 `role === "owner"` 조건을 유지한다.

### INV-BSIM-001: 최신 행과 원장 소유권

항목별 최신 행 선정은 `src/server/pipeline/board.ts`의 책임이다. 프런트엔드 변환 삭제는
이력 삭제가 아니다. DB `BoardItem`, `TransitionEvent`, `Report`, `AgentRun`·`AgentRunStep`은 변경하지 않는다.

### CON-BSIM-001: FSD와 서버 경계

page 전용 입력 타입·가공은 `src/fsd/pages/project-board/model/briefing.ts`가 소유한다.
Prisma 타입이나 `src/server` import를 page 모델에 추가하지 않는다. route는 기존 server 조회와
page public API를 조합한다. 새 shared module, hook, store, cache, 범용 mapper는 만들지 않는다.

### CON-BSIM-002: 삭제 범위와 순수성

아래 Affected Files만 수정한다. `buildBriefing`은 DB 접근·시계 읽기·부수효과 없이 전달된 값만
사용하고 입력 배열을 변경하지 않는다. 오늘 날짜는 기존처럼 route의 `new Date()`에서 전달한다.
확인된 다른 소비자나 계약이 생겼으면 그 근거를 문서에 반영한 뒤 삭제 범위를 재검토한다.

## Proposal

### 1. 보드 입력과 출력의 최종 계약

다음은 **제안하는 최종 타입**이다. 기존 파일 `model/briefing.ts`에 둔다.
`BoardRow`·`Tone`은 파일 내부 타입으로, UI가 가져가는 `ActivityItem`·`TeamMember`·`Briefing`만
**타입으로** 모듈 export한다. 함수 `buildBriefing`과 기존 테스트가 직접 가져가는 `firstSentence`의
모듈 export는 유지한다. page barrel에는 기존 `ProjectBoardPage`·`buildBriefing`만 남긴다.
route는 호출의 구조적 타입 검사에 맡기므로 새 barrel type export는 불필요하다.
아래 블록은 타입과 함수 시그니처를 정한 **부분 계약**이다. 함수 선언 뒤의 `;`를 구현으로 복사하지 말고
실제 함수 본문을 작성한다. ambient 선언이나 임시 예외를 던지는 함수로 대체하지 않는다.

```ts
type BoardRow = {
  agent: string;
  status: string;
  reason: string;
  results: readonly string[];
  proposedOn: Date;
  backlogItem: { key: string };
};
type Tone = "pending" | "active" | "done" | "hold" | "muted";
export type ActivityItem = {
  key: string;
  status: string;
  line: string;
  overBudget: boolean;
  tone: Tone;
};
export type TeamMember = { agent: string; state: string };
export type Briefing = { activity: ActivityItem[]; team: TeamMember[] };

export function buildBriefing(
  rows: readonly BoardRow[],
  today: Date,
  roster: readonly string[],
): Briefing;
```

- `status`는 non-null `string`으로 둔다. DB가 enum이 아니므로 알려진 6상태라고 `as` 단언하지 않는다.
  알 수 없는 문자열 상태의 muted 표현과 `statusLabel`의 원문 표시는 보존한다.
- `agent`·`reason`·날짜는 실제 DB 행의 non-null 계약을 유지한다. `results: []`는 유효하다.
- `backlogItem.title/area`, `validation`, `checked`, 합쳐 놓은 `result`, 별도 `id`는 새 입력/출력에 필요 없다.
  서버 반환 행에는 더 많은 필드가 있어도 구조적 타입으로 그대로 전달할 수 있다.
- `activity`는 gate 그룹과 나머지 그룹을 **안정적으로 분할한 후 연결**한다. 날짜 재정렬, key dedupe,
  `Map<day, ...>`, `heading`, `sectionDate`는 만들지 않는다. Team은 재배치 전 원본 `rows`를 읽는다.
- gate 분류는 기존 `isGateSource`를 계속 호출한다. 이 화면에서 별도 상태 화이트리스트를 만들지 않는다.
- 새 모델의 중복·비날짜 입력 지원을 위해 옛 `BoardSection` 호환 overload를 남기지 않는다.

최종 호출 경로:

```text
latestBoard(projectId) + workspace roster
  → buildBriefing(rows, new Date(), roster)
  → ProjectBoardPage({ slug, briefing })
```

### 2. 표시 규칙과 보존할 경계 사례

Activity의 `key`는 React key·별도 key span·`itemPath(slug, key)`에 사용한다.
`line`에는 모델이 추가한 `KEY · ` 접두어가 없다. 기존 `lineWithoutKey`를 삭제하고 그대로 렌더한다.
사용자가 결과 본문에 직접 쓴 `KEY · ...`는 일반 텍스트이므로 제거하지 않는다.

| 상태 | `line` | `tone` |
| --- | --- | --- |
| proposed | `waiting for a plan request` + 경과일이 있으면 ` · N days` | pending |
| in_review | 0일이면 `plan submitted · in review`, 그 외 `plan submitted · in review for N days` | pending |
| planning | `writing the plan` | active |
| implementing | `implementing` | active |
| done | 아래 요약 규칙 | done |
| on_hold | 아래 요약 규칙 | hold |
| 그 외 문자열 | 아래 요약 규칙, 상태 라벨은 기존 `statusLabel` 사용 | muted |

요약은 `results.length > 0 ? results.join(" ") : reason`에 기존 `firstSentence`를 적용한다.
빈 배열일 때 reason으로 돌아가며 결과들을 다시 정렬하거나 개별 trim/filter하지 않는다.
`firstSentence`는 공백·문자열 끝 앞의 `. ! ?`에서 자르고 `board.ts` 내부 마침표를 보존한다.

빈 요약의 호환 경계도 명시한다. 기존 `join(key, "")`는 key만 만들고 `lineWithoutKey`는 이를 그대로
돌려주므로 화면에 key가 두 번 나온다. 새 모델도 **빈 요약이면 `line = key`**로 유지한다.
이 이상 동작을 이번에 임의로 `Done`이나 빈 본문으로 고치지 않는다. 반면 `reason: null`이나
`status: null`은 새 DB 입력 계약이 아니므로 옛 테스트의 인공 null fallback을 유지할 필요는 없다.

`overBudget`은 **합치기 전에** `isOverBudget([row.reason, ...row.results])`로 계산한다.
UI의 현재 `tone` 판정, `Chip tone="done"`, 링크·CSS·빈 상태 구조는 그대로 둔다.

Team 상태 판정은 다음과 같다. 입력은 원본 최신 행 순서이며, 같은 우선순위에서는 첫 항목을 선택한다.

| agent | 조건 우선순위와 state |
| --- | --- |
| pm | proposed 수 > 0이면 `${count} awaiting your approval`, 아니면 `No new proposals` |
| plan-verifier | 첫 in_review가 있으면 `Verifying ${key}`, 없으면 `Idle`. validation 유무에 따라 새로 분기하지 않는다 |
| 나머지 | 자기 in_review → `Awaiting review`; 자기 planning 또는 implementing → `Working on ${key}`; 자기 on_hold → `On hold`; 자기 done → `Recently done`; 없으면 `Idle` |

`pmState`·`verifierState`·`workerState`·`teamState`는 state 문자열만 반환하도록 줄인다.
`heldId`·팀 `tone`·`AgentIdentity`·`ROSTER`·`identityFor`·`initialOf`는 제거한다.
`rosterOrder`의 단순 배열 조립은 `briefing.ts` 안으로 옮기고 `known-agents.ts`를 삭제한다.
새로운 역할 등록 체계나 중복 roster 정리 로직은 추가하지 않는다.

### 3. 프로젝트 목록의 플랜 조회

`src/app/(app)/projects/page.tsx`에서 다음 세 부분만 바꾼다.

1. `planForUser` import와 `Promise.all`의 별도 `planForUser(userId)` 항목을 제거한다.
2. 구조 분해를 `[user, members]`로 줄인다.
3. `activeProjectIds(owned, plan)`을 `activeProjectIds(owned, user.plan)`으로 바꾼다.

`loadHeaderUser`, `planForUser` 함수 자체, `requireUser`, 멤버십 조회, owner 필터, 잠긴 프로젝트 링크는
변경하지 않는다. 플랜을 캐시하거나 layout의 인가로 page 인가를 대체하지 않는다.

## Affected Files

아래 경로는 저장소 루트 기준이다. 모두 기존 파일이며 새 제품/테스트 파일은 필요 없다.

| 경로 | 작업 | 구체적 변경 / 리스크 |
| --- | --- | --- |
| `src/fsd/pages/project-board/model/briefing.ts` | update | 위 입력/출력 계약, Activity·Team 계산. `flatten`, `DatedItem`, `daysOnBoard`, `formatToday`, speech 상세 계산 제거. 순서·날짜·문구 회귀 주의 |
| `src/fsd/pages/project-board/model/known-agents.ts` | delete | roster 배열 조립을 briefing에 옮긴 뒤 미사용 identity 모듈 제거 |
| `src/fsd/pages/project-board/model/briefing.test.mjs` | update | 실제 DB 형태 fixture와 표시 결과 검증으로 전환. 상세 목록은 VFY-BSIM-01 |
| `src/fsd/pages/project-board/ui/project-board-page.tsx` | update | `briefing.activity`, `ActivityItem`, `item.key`, `member.agent/state` 소비. `lineWithoutKey` 삭제. DOM·CSS 유지 |
| `src/app/(app)/p/[slug]/page.tsx` | update | entity 변환 import 제거, `buildBriefing(rows, new Date(), roster)` 호출 |
| `src/fsd/entities/board-item/model/board-item.ts` | delete | `toBoardItem`·`toBoardSections`·화면 전용 BoardItem/BoardSection 제거. Prisma의 동명 모델은 대상 아님 |
| `src/fsd/entities/board-item/index.ts` | update | 위 변환·타입의 re-export 두 줄만 삭제. 예산·문서 링크·상태·검증 public API 보존 |
| `src/app/(app)/projects/page.tsx` | update | 별도 플랜 조회 제거 |
| `src/fsd/shared/lib/relative-time.ts` | update, 주석만 | 첫 주석의 삭제된 `daysOnBoard` 이름을 `보드의 경과일 표시`로 바꾼다. 날짜 함수 구현·테스트는 유지 |
| `docs/architecture/fsd.md` | update, 예시만 | §Import 규칙의 나쁜 deep-import 예시에서 삭제되는 `toBoardItem` 경로를 기존 `statusLabel`의 `@/fsd/entities/board-item/model/status-label`로 바꾼다. 규칙 자체는 유지 |
| `docs/architecture/sources.md` | update, 한 행 | pipeline model 이식 행의 도착지를 `src/fsd/pages/project-board/`로 맞추고 날짜 섹션·미사용 발화/아바타 모델 제거 사실을 기록. 과거 journey 제거 기록은 보존 |
| `docs/conventions/product-copy.md` | update, §6만 | 요약의 result → reason 및 빈 요약 호환 동작을 명시. `Roles` 목록은 역할 용어이며 Team에 렌더하는 필드가 아니라는 점을 명시. 새 문구/역할 추가 없음 |
| 이 제안서 | update | 실제 검증·편차·완료 기록 작성. 구현 전에는 active에 유지 |

`src/fsd/pages/project-board/index.ts`는 현행 `ProjectBoardPage`·`buildBriefing` export만 유지하면 되어
변경할 필요가 없다. 삭제되는 entity 파일 외 `entities/board-item` slice를 통째로 옮기거나 없애지 않는다.

### 심볼 이동·import/export 확인표

표의 기존 소유자와 공개 경로를 기준으로 구현하고, 단축된 파일명은 Affected Files의 해당 경로를 뜻한다.
검증은 삭제된 곳의 부재뿐 아니라 **변경 후 소비 위치의 연결**까지 확인한다.

| 필요한 심볼 | 현재 소유자 → 공개 경로 | 변경 후 소비 위치·import | 검증 |
| --- | --- | --- | --- |
| `buildBriefing`, `ProjectBoardPage` | `pages/project-board/model/briefing.ts`, `ui/project-board-page.tsx` → `@/fsd/pages/project-board` | 보드 route의 기존 page public API import 유지 | 타입·빌드, VFY-BSIM-03 |
| `ActivityItem`, `TeamMember`, `Briefing` | 새 ActivityItem 및 기존 briefing의 타입 | 보드 UI가 `../model/briefing`에서 type import. 새 타입 barrel 추가 없음 | 아래 구조 검사, VFY-BSIM-01 |
| `firstSentence` | `model/briefing.ts`의 모듈 export | 같은 모델 내부 및 `briefing.test.mjs`의 `./briefing.ts` import 유지 | 기존 문장 분리 테스트 |
| `rosterOrder`의 배열 조립 | `model/known-agents.ts` → `./known-agents` | briefing 내부 함수/표현식으로 이동. 외부 export 불필요 | Team 순서 테스트 및 옛 파일 부재 |
| `isOverBudget` | `entities/board-item/model/text-budget.ts` → `@/fsd/entities/board-item` | briefing에서 entity public API로 import | 건별 예산 테스트 |
| `isGateSource` | `features/review-gate/model/gate-source.ts` → `@/fsd/features/review-gate` | briefing의 기존 import 유지 | gate 우선 순서 테스트 |
| `daysBetween` | `shared/lib/relative-time.ts` → `@/fsd/shared/lib/relative-time` | briefing의 기존 import 유지, Date로 직접 호출 | UTC 날짜 태그 테스트 |
| `OverBudgetChip`, `statusLabel` | entity의 `ui/over-budget-chip.tsx`, `model/status-label.ts` → `@/fsd/entities/board-item` | 보드 UI의 기존 import 유지 | 최종 HTML의 초과 표시·상태 라벨 |
| `itemPath`, `cn`, `Chip`, `SectionLabel` | `shared/routes/project.ts`, `shared/lib/class-name.ts`, `shared/ui/chip.tsx`, `shared/ui/section-label.tsx` | 보드 UI의 동일 shared 단위 import 유지 | HTML의 href·클래스·제목 |
| `activeProjectIds` | `packages/core/entitlement.mjs` → `@harness/core/entitlement.mjs` | 목록 route의 기존 import, 인자만 `user.plan`으로 | VFY-BSIM-02 및 기존 entitlement 테스트 |
| `loadHeaderUser`, `AppHeader`, `ProjectListPage` | app-header의 server/client public API, project-list public API | 목록 route의 기존 3개 slice import 유지 | 플랜 배선 검토 및 목록 HTML |
| `requireUser`, `requireMember`, `prisma`, `latestBoard` | `src/server/auth/guard.ts`, `db.ts`, `pipeline/board.ts` | 두 route에서 기존 server import 유지. UI/model로 이동 금지 | route diff·FSD·빌드 |
| `createElement`, `renderToStaticMarkup` | 기존 `react`, `react-dom/server` 의존성 | `briefing.test.mjs`의 보드 렌더링 검증에서 사용 | VFY-BSIM-01, 아래 일회성 목록 렌더 명령 |

삭제할 두 파일은 현재 존재한다. 새 코드 파일/이동 대상 경로는 없으므로 부모 디렉터리 생성·경로 충돌은 없다.
문서 완료 이동은 기존 `docs/proposals/completed/`가 대상이며, 완료 당일 같은 이름이 이미 있으면 덮어쓰지 않는다.

### 유지하는 런타임과 최종 출력

| 표면·진입 | 실제 소유자와 실행/합성 규칙 | 변경 후 결과와 의존성 | 검증·제외 근거 |
| --- | --- | --- | --- |
| `/p/[slug]` 성공 | `src/app/(app)/p/[slug]/page.tsx`의 `await params → requireMember → latestBoard` | page 모델 → 보드 UI가 Activity·Team 본문 생성. entity 라벨/예산, shared 링크/칩/클래스 함수에 의존 | 순수 fixture → **ProjectBoardPage HTML** 검증. route는 모델 결과를 그대로 넘기는지 diff 확인 |
| `/projects` 성공 | `src/app/(app)/projects/page.tsx`의 `requireUser → loadHeaderUser/members` | 헤더 배지와 소유 프로젝트 잠금은 `user.plan` 한 값. AppHeader의 `planLabel`·`billingPath`, ProjectListPage의 `projectPath`·ButtonLink가 최종 링크/문구 생성 | 플랜 배선·core 판정 및 **AppHeader + ProjectListPage HTML** 검증 |
| 공통 셸 | `src/app/layout.tsx` → `(app)/layout.tsx`, 보드에는 `p/[slug]/layout.tsx` 추가 | root의 글꼴·globals.css·Toaster, app 인증 셸, 프로젝트 헤더·탭·TurnBanner가 children을 감싼다. page 본문을 별도 파일이 덮어쓰지 않는다 | 셸·CSS·폰트 설정은 scope guard로 불변 확인. 빌드는 합성/타입 확인, 픽셀 확인은 별도 |
| 미인증·비멤버·실패 | `src/proxy.ts`, `src/server/auth/{config.base,config,index,guard}.ts`; `requireUser`는 `/login`, `requireMember`는 비멤버 `notFound()` | 기존 `src/app/(app)/{error,not-found}.tsx`, `p/[slug]/{error,not-found}.tsx`가 오류/404를 처리한다 | 해당 파일과 route 인가 순서의 불변 diff 확인. OAuth·DB 실패를 재현했다는 주장은 하지 않는다. 새 흐름 없음 |
| 재진입·플랜 변경 | 기존 Server Component route의 새 실행이 DB 값을 다시 읽음 | 새 전역 cache·client state·effect·취소/재시도 루틴 없음. 다른 렌더/요청 사이의 플랜 불변이나 트랜잭션 snapshot을 보장하지 않는다 | 같은 렌더의 값 공유만 요구. 인가·쓰기 잠금은 기존 서버가 처리하며 이번 변경으로 대체하지 않음 |
| 생성 타입·빌드 | `prisma/schema.prisma` + `prisma.config.ts` → `src/generated/prisma`; `next typegen`/build → `.next/types` | TypeScript가 route의 실제 Prisma 반환값과 새 BoardRow의 구조적 호환성을 확인 | 기존 `db:generate`, `check`, `build`. 생성물은 커밋/직접 수정하지 않음. 런타임 진입점은 `.next`의 옛 결과가 아니라 현재 `src/app` |

완성될 본문은 아직 구현하지 않았다. 위 표는 실제 소유권과 실행 경로를 대조한 **구현 계약**이며,
현재 코드의 HTML 렌더 확인과 구현 후 HTML 검증을 구분한다. 루트 `app/`은 없고 `next.config.ts`에는
해당 route를 덮어쓰는 설정이 없다. 글꼴은 `next/font/google`이 빌드에서 처리하므로
DB 접속이 필요 없다는 설명을 외부 네트워크도 전혀 필요 없다는 뜻으로 해석하지 않는다.

## Safety Analysis

- [x] 진입점: `/p/[slug]`·`/projects` 파일명과 URL은 유지한다. default export·`await params`·인가 호출도 유지한다.
- [x] 정적 import/barrel: 보드 변환 실행 소비자는 보드 route와 briefing뿐이다. identity 소비자는 briefing과 같은 slice 테스트뿐이다.
- [x] 동적 로딩: 확인한 `src`·`scripts`·`packages`·공개 `plugin` 코드에 삭제 모듈을 동적으로 로드하는 경로는 없다.
- [x] 테스트/스크립트: `briefing.test.mjs`가 직접 가져가는 함수·타입 계약을 같은 작업에서 정리한다. 파일 단위 미사용만 보고 테스트를 통째로 지우지 않는다.
- [x] 타입 경계: 삭제되는 프런트엔드 `BoardItem`은 Prisma `BoardItem`과 다르다. 생성 타입·ambient declaration은 수정하지 않는다.
- [x] 부수효과: 삭제 모델은 순수 계산이며 초기화·구독·브라우저 저장소를 소유하지 않는다.
- [x] 외부 경계: API payload, OAuth, 토큰, 외부 SDK, 정적 자산 URL, localStorage/sessionStorage 변경이 없다.

재조회·재진입 때도 기존 route가 최신 행을 읽어 순수 모델을 다시 만든다. 취소·부분 성공·재시도 정책을
추가할 비동기 쓰기는 없다. 인증 만료·비멤버·DB 실패는 기존 guard/error 경계가 처리한다.
다른 요청과의 동시성·CAS·감사 이벤트는 서버가 계속 소유하며 별도 변경이나 테스트 체계를 추가하지 않는다.

private 템플릿 내용은 이번에 재검증하지 않았다. [직전 제거 기록](../completed/2026-09-07-dead-code-removal-candidates.md)의
private 템플릿 import 목록에도 이번 웹 모델은 없지만, 이를 새로 실행한 검증으로 기록하지 않는다.
구현 도중 외부 소비자 증거가 발견되면 CON-BSIM-002의 중단 조건을 적용한다.

## Approval

사용자가 이 문서를 바탕으로 실제 코드 수정, 검증 후 commit·push와 dev 병합까지 요청했다.
세 finding과 Affected Files의 직접 연관 정리를 함께 수행하며 check 통과 후 dev 대상 PR을 병합한다.
같은 승인 범위 안의 아래 Tasks 사이에는 별도 사용자 확인을 반복하지 않는다.

## Execution Plan

### Phase BSIM: 화면 동작을 유지하는 간소화

- status: Complete
- satisfies: REQ-BSIM-001, REQ-BSIM-002, REQ-BSIM-003, REQ-BSIM-004
- preserves: INV-BSIM-001
- governed-by: CON-BSIM-001, CON-BSIM-002
- verified-by: VFY-BSIM-01, VFY-BSIM-02, VFY-BSIM-03
- 시작: 승인 범위·현재 브랜치·작업 트리와 소비자를 재확인하고 기준선 검증을 기록한다.
- 종료: 세 Tasks 완료, 모델·최종 HTML·삭제 부재/새 계약 존재·범위 guard 검증 통과,
  실제 결과 및 테스트 삭제 이유 기록, 범위 밖 변경 없음.

### TASK-BSIM-01: 보드 입력·출력과 소비자·테스트를 한 변경으로 정리

- satisfies: REQ-BSIM-001, REQ-BSIM-002, REQ-BSIM-003
- preserves: INV-BSIM-001
- governed-by: CON-BSIM-001, CON-BSIM-002
- verified-by: VFY-BSIM-01, VFY-BSIM-03
- 대상: Affected Files의 보드 모델·UI·보드 route·entity 변환·barrel·날짜 주석.

1. 기존 테스트와 Proposal의 표시 규칙을 기준으로, 아래 fixture 기대값을 먼저 고정한다.
2. `briefing.ts`에 최종 타입을 적용하고 `rows`에서 직접 Activity·Team을 만든다.
   `isOverBudget`은 entity public API에서 가져오고 `daysBetween`을 Date에 직접 적용한다.
3. 보드 route와 UI를 새 반환형으로 연결한다. 날짜 정렬·gate 분류를 UI에 다시 구현하지 않는다.
4. 소비자가 없어졌음을 검색한 뒤 `board-item/model/board-item.ts`, `known-agents.ts`를 삭제하고 import·barrel을 정리한다.
5. 기존 `briefing.test.mjs`를 VFY-BSIM-01대로 개편한다. 중간 계약에 맞추려고 새 호환 adapter를 만들지 않는다.
   같은 파일에서 `ProjectBoardPage`를 직접 렌더해 모델 다음의 HTML 소비 단계까지 검증한다.
6. 보드 테스트와 타입 검사를 통과하기 전에는 부분적으로 깨진 계약을 커밋하지 않는다.

### TASK-BSIM-02: 프로젝트 목록의 플랜 조회를 하나로 합치기

- satisfies: REQ-BSIM-004
- governed-by: CON-BSIM-001, CON-BSIM-002
- verified-by: VFY-BSIM-02
- 대상: `src/app/(app)/projects/page.tsx`.

Proposal §3의 세 부분만 수정한다. TASK-BSIM-01과 코드 의존은 없으며 같은 브랜치에서 수행한다.
이 작은 변경을 위해 DB mock·전용 query-count 테스트·공통 로더를 새로 만들지 않는다.

### TASK-BSIM-03: 문서 계약·최종 검증·수행 기록 마무리

- satisfies: REQ-BSIM-001, REQ-BSIM-002, REQ-BSIM-003, REQ-BSIM-004
- preserves: INV-BSIM-001
- governed-by: CON-BSIM-001, CON-BSIM-002
- verified-by: VFY-BSIM-01, VFY-BSIM-02, VFY-BSIM-03
- 대상: Affected Files의 문서와 이 제안서. TASK-BSIM-01·TASK-BSIM-02 이후 수행한다.

관련 문서의 지정 부분만 갱신하고 아래 검증을 실행한다. 심볼 확인표·런타임/출력 표의 변경 후 목적지,
삭제/계약 구조 검사 및 scope guard도 완료 조건이다. 실패는 기준선과 비교해 기존/신규를 구분하며,
실행하지 못한 검증을 통과로 적지 않는다. 구현 코드·테스트·직접 연관 문서를 함께 리뷰 가능한 상태로 만든다.
PR을 만들 때 base는 `dev`다. 체크가 초록이 되기 전 병합하지 않으며 이 문서 작성만으로 병합·배포하지 않는다.

## Verification Plan

### VFY-BSIM-01: 보드의 실제 표시 동작 회귀 검증

- category: unit / rendered component body
- verifies: REQ-BSIM-001, REQ-BSIM-002, REQ-BSIM-003
- destination: 기존 `src/fsd/pages/project-board/model/briefing.test.mjs` 개편.
- state: Executed. 보드 테스트 30/30 및 변경 전후 HTML 112개 비교 통과. 대조 중 실행한 변경 전 결과와 구분한다.

fixture를 `heading/items` 대신 `BoardRow[]`로 바꾼다. key별 최신 행 하나만 두고 명시적인
`Date`·`reason`·`results[]`·`agent`·문자열 status를 사용한다. 생산자와 마찬가지로 날짜 내림차순으로 둔다.
예산 기대값을 새 구현 함수로 다시 계산해 검증하지 말고 아래 경계의 true/false를 직접 단언한다.

| 검증 항목 | 고정할 기대 결과 |
| --- | --- |
| 목록 순서 | 입력 `FEAT-05(proposed), FEAT-04(in_review), FEAT-06(planning), FEAT-07(implementing), FEAT-02(done), FEAT-03(on_hold), FEAT-01(proposed, 오래됨)` → Activity key 순서 `05,04,01,06,07,02,03` |
| 같은 날짜·같은 상태 | 시간 또는 날짜가 같은 행의 입력 순서를 임의로 바꾸지 않음. Team 선택도 원본 순서 유지 |
| 여섯 상태 문구 | Proposal의 `line`·tone 표와 일치. 본문에 모델이 key 접두어를 붙이지 않음 |
| UTC 경계 | `2026-08-14T23:59:00Z`에서 `2026-08-15T00:01:00Z`는 1일. 같은 UTC 날짜는 0일, 미래도 0일 |
| 날짜 태그 | proposed 0일은 태그 없음, in_review 0일은 `plan submitted · in review`. 1일/13일의 단복수와 연결 문구 보존 |
| 요약 출처 | results가 있으면 누적 순서대로 한 칸으로 이어 첫 문장, 없으면 reason 첫 문장. 문장 안 `board.ts`와 사용자 본문 `KEY · ...` 보존 |
| 빈 요약·미지 상태 | 결과·근거의 선택된 요약이 비면 `line = key`로 기존 화면 보존. 미지 문자열 status는 muted와 원래 요약을 유지 |
| 건별 예산 | 150자 한 건 false, 151자 한 건 true. 100자 결과 두 건은 false. 긴 문장 뒤를 firstSentence로 잘라도 전체 원문이 151자면 true |
| Team 순서/역할 | pm·roster·고정 보고 agent 순서. pm proposed 개수, verifier 첫 in_review, worker review→working→hold→done→idle 우선순위 |
| 비어 있는 보드/roster | activity 빈 배열, Team은 고정 네 역할을 기존 순서로 표시. pm `No new proposals`, 그 외 `Idle` |
| 순수성 | 호출 전후 rows·각 results·roster의 내용과 순서가 바뀌지 않음 |

같은 테스트 파일에서 React `createElement`, `react-dom/server`의 `renderToStaticMarkup`,
같은 slice UI의 `../ui/project-board-page.tsx`를 가져온다. 새 모델로 만든 briefing을 실제
`ProjectBoardPage`에 전달하여 HTML을 검증한다. DB·Next route·server adapter를 import하거나 mock하지 않는다.
전체 HTML snapshot 대신 항목별 anchor의 href와 출력 순서, key span과 본문, 상태 라벨,
`Over 150 characters`와 tooltip, quiet 클래스, Team agent/state, 빈 Activity 문구를 단언한다.
특히 사용자 본문에 포함된 key가 사라지지 않는지와 빈 요약의 기존 key 이중 표시를 확인한다.
이 검증은 순수 모델 값이 맞아도 UI가 새 props를 잘못 소비하는 회귀를 잡는다.

기존 테스트의 조치:

- `firstSentence` 테스트와 상태 문구·Team 우선순위·건별 예산 테스트는 유지·수정한다.
- inbox/feed 별도 배열 단언은 단일 activity의 **gate 우선 순서** 단언으로 대체한다.
- `daysOnBoard` 단위 테스트는 삭제하되 날짜 태그의 통합 사례를 위 표대로 보존한다.
  기존 `shared/lib/relative-time.test.ts`의 UTC 테스트를 복제하거나 삭제하지 않는다.
- 중복된 옛 섹션 이력, 비날짜 heading, null status/agent/reason fixture를 지원하는 테스트는 제거한다.
  해당 입력은 새 계약이 아니다. 최신 행 선정을 프런트엔드 테스트로 대신 증명하지 않는다.
- today 출력, validation 전달, speaker/detail, heldId/팀 tone, emoji/role, `identityFor/initialOf` 전용 단언은 제거한다.
  테스트 개수 감소는 이유와 함께 실제 결과에 적으며, 감소분을 채우기 위한 테스트를 만들지 않는다.

### VFY-BSIM-02: 프로젝트 목록의 플랜 배선 확인

- category: source/contract review
- verifies: REQ-BSIM-004
- destination: `projects/page.tsx`, `app-header.server.ts`, `src/server/entitlement.ts` 및 기존 core entitlement 테스트.
- state: Executed. user.plan 배선·owner 조건·정책 코드 불변 확인, core 테스트 및 목록 HTML 검증 통과.

페이지 diff에서 별도 플랜 호출/import/변수가 없어졌고, 헤더와 `activeProjectIds`가 둘 다 `user.plan`을
쓰는지 확인한다. owner 필터·생성 순서·잠김 배지·잠긴 프로젝트 링크가 동일해야 한다.
기존 `packages/core/entitlement.test.mjs`로 상한·활성 프로젝트 판정 회귀를 확인한다.
조회 횟수 감소는 호출 경로로 확인한 사실로 기록하고, 운영 성능이나 동시 플랜 변경 문제를 재현했다고 적지 않는다.
확인할 분기는 free(두 owner 중 오래된 하나 활성), pro(여섯 번째 owner 잠김), max(상한 없음),
createdAt 동률(id 순), 비소유 멤버(목록에서 자신의 플랜으로 잠그지 않음)다.
Subscription 없음/알 수 없는 plan은 기존 `planForUser`의 free fallback을 유지하는지 source diff로 확인한다.
마지막 fallback과 비소유 조건을 검증하기 위해 정책을 복제한 새 함수나 DB mock을 만들지 않는다.

### VFY-BSIM-03: UI 연결·아키텍처·타입·빌드 검증

- category: rendered body / source review / architecture / type / lint / build
- verifies: REQ-BSIM-001, REQ-BSIM-002, REQ-BSIM-003, REQ-BSIM-004
- destination: 기존 npm 게이트 및 두 route·보드 UI diff.
- state: Executed. FSD·lint·type·아키텍처·build, 최종 HTML, 삭제/타입 구조 및 scope guard 통과.

UI diff에서 빈 상태, key span, 링크, statusLabel, OverBudgetChip, tone 명암과 Team agent/state가 유지되는지
확인한다. `tone`을 없애거나 `Chip tone="done"`을 교정하는 변경을 섞지 않는다.
보드 HTML은 VFY-BSIM-01에서 필수 검증한다. 목록의 헤더 배지·Locked 링크도 아래 DB 없는
렌더 명령으로 필수 검증한다. 브라우저가 없어도 두 최종 본문 검증을 생략하지 않는다.
이는 CSS의 계산 결과·클릭 후 내비게이션·OAuth를 실행한 검증은 아니다.
기존 인증된 개발 화면이 있으면 변경 전후 픽셀·링크 이동을 추가 비교하고 그 여부를 따로 기록한다.
문서 대조나 정적 렌더를 위해 DB fixture나 새 프로젝트를 생성하지 않는다.

다음 명령은 **완전한 실행 예시**이며 저장소 루트의 zsh/bash에서 실행한다.
프로젝트 목록 라우트의 DB 배선은 VFY-BSIM-02가, 이 명령은 변경되지 않는 두 UI의 최종 본문을 각각 확인한다.
다른 page slice 안의 테스트가 project-list slice를 import하는 경계 위반을 만들지 않도록 일회성 명령으로 둔다.

```bash
TSX_DISABLE_CACHE=1 node --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppHeader } from './src/fsd/widgets/app-header/index.ts';
import { ProjectListPage } from './src/fsd/pages/project-list/index.ts';
for (const [plan, label] of [['free', 'Free'], ['pro', 'Pro'], ['max', 'Max']]) {
  const html = renderToStaticMarkup(createElement(Fragment, null,
    createElement(AppHeader, { login: 'example', plan }),
    createElement(ProjectListPage, { projects: [
      { slug: 'active', name: 'Active project', owner: 'example', repo: 'one', locked: false },
      { slug: 'locked', name: 'Locked project', owner: 'example', repo: 'two', locked: true },
    ] }),
  ));
  assert.match(html, new RegExp('href="/billing"[^>]*>' + label + '</a>'));
  assert.match(html, /href="\/p\/active"/);
  assert.match(html, /href="\/p\/locked"/);
  assert.equal((html.match(/>Locked<\/span>/g) ?? []).length, 1);
}
console.log('Projects header and list body checks passed');
JS
```

기준선에서 아래 명령을 한 번 실행해 실패 유무를 기록한다. 코드 변경 후 같은 게이트를 실행한다.
명령은 저장소 루트 기준이며 이미 설치된 로컬 도구를 사용한다.

```bash
(
set -eu
# CI의 비접속용 값. 실제 DB를 쓰거나 migration/seed를 실행하지 않는다.
export DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci
npm run db:generate
node --import tsx --test src/fsd/pages/project-board/model/briefing.test.mjs
node --test packages/core/entitlement.test.mjs
npm run verify:fsd
npm run check
npm test
npm run test:web
npm run build
git diff --check
)
```

괄호 안의 subshell이 DATABASE_URL 변경을 가두고 `set -eu`가 첫 실패에서 멈춘다.
실패 이후 마지막 명령의 exit 0만 보고 전체 통과로 판단하지 않는다. 타입/생성/빌드는 산출물을 만들므로
구현 검증 때 실행하고, 이 문서 대조의 실행 기록에 섞지 않는다.

`npm run check`에 lint, Next typegen, `tsc --noEmit`, `test:architecture`가 포함된다.
따라서 동일 소스에서 이 세 명령을 추가 반복할 필요는 없다. 실패 원인을 좁힐 때만 개별 실행한다.
기준선부터 실패한 게이트가 있으면 원인·범위를 분리해 보고하고 이번 변경의 성공으로 덮지 않는다.

삭제 후 참조 검색(발견된 import·주석·문서 예시를 포함하므로 구현 코드와 지정 문서 갱신 후 실행):

```bash
rg -n '\b(BoardSection|toBoardSections|toBoardItem|DatedItem|SpeechItem|daysOnBoard|formatToday|identityFor|initialOf|AgentIdentity|lineWithoutKey)\b' src scripts packages plugin docs/architecture docs/conventions --glob '!**/generated/**' --glob '!plugin/templates/**'
```

기대 결과는 0건이다(`rg` exit 1은 일치 없음). `docs/proposals`의 과거 기록은 지우지 않는다.
`BoardItem` 전체 검색은 Prisma 동명 모델이 정상적으로 남으므로 0건을 요구하지 않는다.
위 11개 심볼은 지정 검색 범위에서 모두 금지다. `flatten`·`ROSTER`는 다른 기능/테스트에 있을 수 있어
전역 금지하지 않고, 아래 검사에서 변경되는 보드 런타임 파일에만 적용한다.
`BoardItem`은 두 삭제 파일 및 보드 page 모델에서만 제거하며 Prisma에는 유지한다.
출력 필드가 타입에만 없는 척하면서 런타임에서 계속 계산되지 않는지도 생산자 diff로 확인한다.

다음은 **구현 후** 실행할 파일 부재·구조적 타입·제거 심볼 검사다. 새 출력 계약은 프로퍼티 이름을
TypeScript AST로 읽으므로 댓글이나 다른 모델의 동명 필드 검색으로 대체하지 않는다.
변경 전 코드에서는 의도적으로 실패하며, 임시 빈 파일을 남겨 통과시키지 않는다.

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
const base = 'src/fsd/pages/project-board/';
for (const path of [base + 'model/known-agents.ts', 'src/fsd/entities/board-item/model/board-item.ts']) {
  assert.equal(existsSync(path), false, 'must be removed: ' + path);
}
const parse = (path) => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
const model = parse(base + 'model/briefing.ts');
for (const [name, expected] of Object.entries({
  ActivityItem: ['key', 'status', 'line', 'overBudget', 'tone'],
  TeamMember: ['agent', 'state'],
  Briefing: ['activity', 'team'],
  BoardRow: ['agent', 'status', 'reason', 'results', 'proposedOn', 'backlogItem'],
})) {
  const alias = model.statements.find((n) => ts.isTypeAliasDeclaration(n) && n.name.text === name);
  assert.ok(alias && ts.isTypeLiteralNode(alias.type), name + ': expected declared literal contract');
  assert.deepEqual(alias.type.members.map((m) => m.name.getText(model)).sort(), [...expected].sort(), name);
}
const forbidden = new Set(['BoardItem', 'BoardSection', 'toBoardItem', 'toBoardSections', 'DatedItem',
  'SpeechItem', 'daysOnBoard', 'formatToday', 'AgentIdentity', 'identityFor', 'initialOf',
  'lineWithoutKey', 'flatten', 'ROSTER']);
for (const path of [base + 'model/briefing.ts', base + 'ui/project-board-page.tsx',
  'src/app/(app)/p/[slug]/page.tsx', 'src/fsd/entities/board-item/index.ts']) {
  const source = parse(path);
  const visit = (node) => {
    if (ts.isIdentifier(node)) assert.equal(forbidden.has(node.text), false, path + ': stale ' + node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
}
console.log('Removal and final type contracts passed');
JS
```

문서·범위 guard도 완료 전에 확인한다.

- `git diff <기준 커밋> --name-only`와 `git ls-files --others --exclude-standard`를 함께 확인한다.
  Affected Files 밖 변경·새 파일이 있으면 사용자 기존 변경인지 이번 작업인지 구분한다. 이를 자동 삭제하지 않는다.
- 기존 `src/fsd/pages/project-board/index.ts`, `src/fsd/widgets/app-header/api/app-header.server.ts`,
  `src/server`, `packages/core`, `prisma`, `plugin`, `package.json`, lockfile, Next/TS 설정,
  루트/프로젝트 layout, 오류·404 파일 및 `globals.css`는 이번 변경 diff가 없어야 한다.
- `relative-time.ts`는 첫 주석만, entity barrel은 제거 대상 두 줄만 달라졌는지 확인한다.
- `docs/architecture/fsd.md`의 대체 deep-import 예시가 실제 status-label 파일을 가리키고,
  `sources.md`의 목적지가 실제 보드 slice이며, 제품 문구 §6의 표와 설명 양쪽에 result → reason·빈 요약·역할 용어 결정이 반영됐는지 읽는다.
- 승인 metadata는 구현 승인 전 null로 유지한다. 문서 완료 이동 때 기존 파일 충돌과 active/완료 상태를 함께 확인한다.

## Verification Results

아래는 **문서 작성·대조 시 수행한 확인**이다. 구현 검증 결과와 구분한다.

| 명령/확인 | 상태 | 결과 |
| --- | --- | --- |
| `git fetch origin dev` 및 dev/origin 비교 | Executed | dev와 origin/dev 차이 0/0 |
| `git switch -c harness/board-model-simplification dev` | Executed | 브랜치 생성·전환 완료 |
| 관련 소스·소비자·스키마·문서·CI 읽기 및 `rg` | Executed | 세 후보의 현재 근거와 변경 목적지 확인 |
| 앞선 같은 기준 커밋의 `npm run verify:fsd` | Executed, 앞선 리뷰 | 통과. 이번 구현의 통과 결과는 아님 |
| 앞선 같은 기준 커밋의 `node scripts/plugin-lib.mjs --check` | Executed, 앞선 리뷰 | in sync. 이번 구현의 통과 결과는 아님 |
| `validate_sdd_traceability.py --strict` | Executed | PASS. REQ 4, INV 1, CON 2, Task 3, VFY 3. 요구사항의 Task/VFY 연결 모두 4/4 |
| 링크·영향 경로·metadata·Markdown 검사 | Executed | 링크 4개·기존 영향 경로 12개 존재 확인. pending/승인 전 metadata, 코드 펜스, 끝 공백 검사 통과 |
| 최초 SDD 의미 검토 | Executed, 작성 당시 | 이후 INV-1~7 대조에서 발견한 검증·import 계약 보완은 아래 Reconciliation 기록 참고 |
| 기존 보드·날짜 테스트 / 기존 entitlement 테스트 | Executed, 변경 전 | `TSX_DISABLE_CACHE=1 node --import tsx --test --test-reporter=dot src/fsd/pages/project-board/model/briefing.test.mjs src/fsd/shared/lib/relative-time.test.ts` 및 `node --test --test-reporter=dot packages/core/entitlement.test.mjs` exit 0 |
| 기존 보드·목록의 정적 HTML 렌더 | Executed, 변경 전 | DB 없이 react-dom/server로 href·문구·gate 우선·빈 요약의 key 이중 표시·Free 배지·Locked 링크를 단언. 제안한 최종 코드의 통과 결과는 아님 |
| VFY-BSIM-01 / VFY-BSIM-02 / VFY-BSIM-03의 구현 후 검증 | Executed | 아래 구현 검증 결과 참조 |

구현 검증(2026-09-08, 코드 `eab1f4c`, 로컬 Node `v26.4.0`):

| 검증 | 기준선 | 구현 후 |
| --- | --- | --- |
| `npm run db:generate` | 통과 | build에서 재생성 통과 |
| `npm run verify:fsd` | 통과 | 통과 |
| `npm run check` | 통과, architecture 19/19 | 통과, architecture 19/19. lint·Next typegen·tsc 포함 |
| `npm test` | 112/112 통과 | 112/112 통과 |
| `npm run test:web` | 142/142 통과 | 147/147 통과 |
| 보드 `briefing.test.mjs` | 25개 기존 테스트 | 30/30 통과, 그중 실제 UI HTML 검증 6개 |
| `npm run build` | sandbox 포트 차단으로 초기 실패 | 캐시 분리 후 기본 Turbopack 빌드 통과. 정적 페이지 10/10 및 모든 route 수집 |
| VFY-BSIM-03의 목록 HTML 명령 | 대조 단계 통과 | Free/Pro/Max 배지·활성/잠긴 프로젝트 링크 통과 |
| VFY-BSIM-03의 AST/파일 부재 검사·삭제 심볼 검색 | 변경 전에는 삭제 대상 존재 | 파일 2개 부재, 새 입력/출력 타입 구조 통과, 제거 심볼 참조 0건 |
| 변경 전후 보드 HTML 비교 | 변경 전 112개 사례를 임시 JSON에 보관 | 6개 상태+unknown × 날짜 4개 × 결과 형태 4개의 HTML이 바이트 동일 |
| 범위·공백 검사 | 사용자 변경 없음 | 지정 12개 경로와 제안서만 변경, `git diff --check` 통과 |

초기 환경 실패와 해소: sandbox 안의 `npm test`는 로컬 테스트 서버 12건에서 `listen EPERM`이 발생했다.
권한 확장 후 112/112로 통과했다. Turbopack도 PostCSS 평가 포트에서 같은 오류를 냈고,
권한 확장만으로는 실패가 남았다. 실행 중인 Next 서버/빌드가 없음을 확인한 뒤 생성 캐시
`.next/cache/turbopack`을 임시 디렉터리로 옮겨 새 캐시로 재빌드하자 기본 `npm run build`가 통과했다.
애플리케이션 설정·의존성 변경이나 Webpack 대체는 하지 않았다.

브라우저 픽셀/실제 OAuth·DB 검증은 실행하지 않았다. 이번 변경은 DB 없는 실제 컴포넌트 HTML과
원래 HTML의 바이트 비교로 표시 보존을 확인했고, 변경되지 않는 서버·정책·layout은 scope guard로 확인했다.
원격 Node 22 검증은 push 후 PR의 check로 확인하며, 녹색이 되기 전에는 dev에 병합하지 않는다.

## Risks and Rollback

주요 리스크는 gate 우선 순서를 날짜순으로 바꾸는 것, Team에 재배치된 Activity 순서를 넘기는 것,
UTC 달력일 대신 24시간 차이를 쓰는 것, 결과를 합친 뒤 예산을 재는 것이다. VFY-BSIM-01의 고정 사례로 검증한다.
요약의 reason fallback·빈 문자열 처리도 명시한 현재 동작을 유지하며 기능 개선을 섞지 않는다.

준비도는 추적성 검사만으로 판정하지 않는다. 이 저장본의 source bundle·구체 inventory·runtime·최종 본문·
검증 목적지를 **무편집 INV-1~7 최종 패스**로 대조한 결과를 최종 응답의 기록과 함께 판정한다.
문서가 다시 바뀌면 이전 clean-pass 결과는 현재 저장본의 증거가 아니다.
실행 권한은 front matter와 사용자의 구현 요청으로 확인한다. 문서 검증 자체가 구현 권한을 추가하지 않는다.

중단 조건:

- 삭제 대상의 다른 실행 소비자가 발견되거나 기준 커밋과 달라진 변경이 예정 파일과 충돌한다.
- 서버 조회·인가·상태 기계·플랜 정책 변경 또는 새로운 패키지가 필요해진다.
- 필수 게이트를 실행할 수 없거나 신규 실패가 남아 있다. 완료로 기록하지 않고 원인과 범위를 보고한다.

롤백은 이번 구현 커밋의 `git revert`로 수행한다. 보드 계약을 바꾸는 모델·UI·route·barrel·테스트는
함께 되돌린다. DB·외부 API 변경이 없어 데이터 복구나 구버전 adapter는 필요 없다.
기준 소스는 위 기준 커밋에서 복구 가능하며 사용자 작업을 `reset --hard`나 전체 checkout으로 덮지 않는다.

## Completion or Closure Notes

완료일은 front matter에 기록했다. 구현 커밋 `eab1f4c`는 승인된 제안서, 보드 입력·출력과 UI·route,
중복 플랜 조회, 직접 연관 문서 변경을 포함한다. 브랜치는 `harness/board-model-simplification`, PR base는 `dev`다.

- `briefing.ts`는 248줄에서 122줄로 줄었다. 날짜 섹션 adapter 31줄과 identity 모듈 60줄을 삭제했다.
- 렌더링에 쓰지 않던 출력·계산을 없애고 key와 본문을 분리했다. 화면의 순서·문구·클래스·링크·예산 판정은 유지했다.
- `firstSentence` 4개 테스트를 유지했다. 옛 섹션/null 입력, 발화자·identity·미사용 필드 단언은 제거하거나
  실제 DB 형태의 동작 검증으로 대체했다. 모델 20개와 실제 UI HTML 6개를 포함해 보드 테스트는 25→30개,
  전체 웹 테스트는 142→147개가 됐다. 수를 맞추기 위한 보충 테스트는 만들지 않았다.
- 정책·인가·CAS·감사 원장·스키마·의존성·전역 스타일·layout은 변경하지 않았다.
- 승인 범위에서 기능적 편차나 미해결 신규 실패는 없다. 환경 실패와 실제 실행하지 않은 검증은 위 결과에 구분했다.
- 이 문서는 `completed/2026-09-08-board-model-simplification.md`로 이동해 수행 기록으로 보존한다.

## Reconciliation 기록

2026-09-07의 첫 INV-1~6 대조에서 아래 세 보완이 필요했다. 제품 범위나 표시 결정을 새로 고르지 않고
기존 보존 요구를 구현·검증 목적지에 연결하는 방식으로 한 번에 반영했다.

| 구분 | 첫 저장본의 부족한 점 | 반영 위치 |
| --- | --- | --- |
| RC-01 | HTML 결과 검증이 선택적 브라우저 확인뿐이어서 새 모델을 UI가 잘못 소비해도 필수 모델 테스트·타입만 통과할 수 있었음 | 최종 출력 표, TASK-BSIM-01/03, VFY-BSIM-01/03에 DB 없는 실제 컴포넌트 렌더 검증 필수화 |
| RC-02 | 삭제 검색에서 formatToday가 빠지고 실제 파일 부재·새 출력 타입·필드 계산 제거·보존 범위의 검증이 불완전했음 | 심볼 출처 표, 삭제/AST 구조 검사, 문서·범위 guard, 종료 조건 |
| RC-03 | firstSentence의 test-facing export 보존이 모호하고 시그니처가 완성 코드로 복사될 여지가 있었음. 명령 묶음은 중간 실패를 종료 상태로 강제하지 않았음 | 부분 계약 설명·심볼 표, subshell의 set -eu, 기존 도구/Node 버전·실행 증거 구분 |

이 절은 **편집 패스의 수행 기록**이다. 이 절을 저장한 것 자체가 무편집 clean pass를 뜻하지 않는다.
최종 재검토는 저장 후 다시 읽어 수행하며, 변경 없이 끝난 마지막 패스의 source identity와
bounded evidence를 응답의 Minimal Replay Anchor / Durable Receipt로 남긴다.

## Review Checklist

- [x] 현재 코드·허용된 아키텍처·제품 문구의 차이를 구분했고, 직접 필요한 문서 갱신 범위를 명시했다.
- [x] 세 finding을 실제 변경 파일·최종 타입·표시 규칙·Tasks·VFY로 연결했다.
- [x] 날짜·순서·개별 예산·요약·Team 우선순위·목록 잠금 보존 기준을 고정했다.
- [x] 현재 문서 작성과 미래 제품 코드 구현의 승인·검증 상태를 구분했다.
- [x] 동명 Prisma 모델, 인가, CAS, 감사 이력, private 템플릿 경계를 삭제 범위와 구분했다.
- [x] 삭제/보존 심볼의 현재 소유자·공개 경로·변경 후 소비자·검증 목적지를 정했다.
- [x] 필수 검증이 순수 모델뿐 아니라 최종 보드/목록 HTML과 이전 파일 부재·새 계약 존재까지 확인하도록 보완했다.
- [x] 문서 추적성 strict 검사와 최초 의미 검토 결과를 현재 구현의 검증 결과와 구분했다.
- [x] 제품 구현·로컬 회귀 검증·완료 기록을 마쳤다. dev 병합은 원격 check 통과 뒤 수행한다.
