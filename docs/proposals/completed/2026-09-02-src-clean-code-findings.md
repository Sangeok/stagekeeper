---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-02"
approved-by: "Sangeok"
approved-at: "2026-09-03"
approval-scope: "전체(묶음 1~5, 30건). 제품 결정 4건은 착수 시 확인 완료"
completed-at: "2026-09-02"
verification-summary: "PR #7(2026-09-02 머지, 61파일 +1230/-349)이 30건 중 29건을 반영했다. 남은 F24는 권고문이 "세 번째 소비자가 생기면 추출"로 조건을 달아 둔 Consider라 조건 미충족으로 보류된 상태다. 2026-09-05 코드 대조로 확인했다."
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related:
  - "docs/architecture/fsd.md"
  - "docs/architecture/protocol.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-09-01-harness-platform-phase-0-1.md"
  - "ee25352 (PR #3) — 1차 5-lens 클린코드 패스"
  - "299ddd9 (PR #4) — 원장 일관성"
---

# src 전역 클린코드 리뷰 — 채택된 30건

## Summary

`src` 전체(122파일·5,046 LOC)를 다섯 개의 독립 렌즈(응집도·결합도·예측가능성·가독성·TypeScript
일반)로 검토하고, 중립 게이트가 판정한 결과다. 원시 발견 33건이 병합을 거쳐 **채택 30건**이
됐고, **Must는 없다** — 병합을 막아야 할 결함은 나오지 않았다. 심각도는 Should 17, Consider 13이다.

이 문서는 **발견 등록부이자 실행 제안서**다. 이번 패스에서 코드는 한 줄도 바꾸지 않았다.
30건을 성격별 5개 묶음으로 나눴으니, 묶음 단위로 승인하거나 잘라내면 된다.

가장 값이 큰 부분은 **`src/server`가 이번에 처음 검토됐다는 점**이다. 1차 패스(`ee25352`)는
`src/app`·`src/fsd`만 대상이었고, 그 뒤 `299ddd9`가 `src/server`를 크게 바꿨다. 채택 30건 중
10건이 이 미검토 영역에서 나왔다.

## Goal

- `src` 전역의 클린코드 결함을 근거(파일:줄) 있는 형태로 등록하고, 실행 순서를 정한다.
- 1차 패스가 다루지 않은 `src/server`의 검토 공백을 닫는다.
- 실행은 묶음 단위로 분리해, 승인자가 전부/일부/보류를 선택할 수 있게 한다.

## Proposal Size

`proposal-size`: standard

선택 근거: 라우팅(`not-found.tsx` 신설), 인증(`config.ts`의 GitHub `id` 검증), barrel export,
MCP 도구의 API 계약(`ToolDeps` 타입), 5개를 훨씬 넘는 파일이 대상이다. 강제 조건 다수에 해당한다.

## Current State

### 리뷰가 돌아간 방식

다섯 개 렌즈 에이전트가 **서로의 출력을 보지 못한 채** 같은 대상과 같은 프로젝트 컨텍스트만
받고 `src` 전체를 읽었다. 이후 중립 게이트가 다섯 원본을 받아 33건 각각에 채택·병합·수정요청·
기각·검증대기 중 하나를 발부했다. 게이트에는 렌즈 스킬을 주지 않았다.

| 렌즈 | 원시 건수 | 상태 |
| --- | --- | --- |
| 응집도 (`frontend-cohesion`) | 12 | Completed |
| 결합도 (`frontend-coupling`) | 3 | Completed |
| 예측가능성 (`frontend-predictability`) | 5 | Completed |
| 가독성 (`frontend-readability`) | 5 | Completed |
| TypeScript 일반 (`typescript-clean-code`) | 8 | Completed |

전 렌즈 Applicable·완주 — **Full applicable-lens review**(부분 리뷰 아님).

원시 33건 → 채택 30건. 병합은 셋뿐이다.

- `F20` ← COH-8 · CPL-2 · RDB-4 (`deriveJourney`의 배치·죽은 export)
- `F27` ← PRD-5 · TS-4 (`latestBoard(projectId, true)`의 무명 불리언)
- 나머지 27건은 렌즈 하나씩만 짚었다.

렌즈 간 겹침이 3건뿐이라는 사실 자체가 결과다 — 다섯 관점이 대체로 **서로 다른 지점**을 봤다는
뜻이고, 렌즈를 나눈 설계가 값을 했다는 증거다. 다만 합의는 커버리지 신뢰도일 뿐 심각도를
올리지 않는다는 규칙을 그대로 적용했다.

### 판정의 한계 (읽는 사람이 알아야 할 것)

1. **게이트가 33건 중 하나도 기각하지 않았다.** 이례적이라, 문서로 옮기기 전에 값싼 대조를
   직접 돌렸다: `as Ctx` 11개(F13), `validation !== null` 6개소(F7), `src/app`에 `not-found.tsx`
   부재(F5), `deriveJourney` 소비자 0(F20), `DAY_MS` 미export(F11의 근거 정정), over-budget 술어
   두 벌 실재(F3), 뱃지·인박스 술어 불일치 실재(F6). **전부 코드와 일치했다.** 대조하지 않은
   나머지 항목은 게이트의 검증을 신뢰한 것이다.
2. **게이트 산출물의 집계가 틀렸다** — 심각도별 개수를 Should 13 / Consider 17로 적었으나 실제
   목록은 Should 17 / Consider 13이다. 이 문서는 정정된 수치를 쓴다.
3. **실행 이탈:** 1차 렌즈 4개가 API 세션 한도로 죽어 다른 모델로 재실행했다(응집도만 최초
   모델). 스킬이 허용하는 기술적 재시도이며 품질 게이트 라운드로 치지 않았다. 다만 렌즈별
   모델이 균일하지 않았다는 사실은 남긴다.
4. **검증대기 0건.** 게이트가 렌즈들이 요청한 확인(Next.js `notFound()` 동작, `packages/core`의
   `kind` 어휘, `@modelcontextprotocol/server`의 `ServerContext` 형태, FSD 경계 검사기)을 설치된
   문서·타입·소스를 직접 읽어 해소했다. 따라서 이 제안서에는 **실행 전 미해결 근거가 없다**.

## Scope

포함 범위:

- `src/app`, `src/fsd`, `src/server` 전체 (생성물 `src/generated/` 제외)
- 위 코드가 참조하는 타입·계약의 형태 변경

제외 범위:

- `packages/core` — 리뷰 대상 밖. 근거로 읽기만 했고 어떤 발견도 이 패키지 변경을 요구하지 않는다.
- 사용자 노출 문구의 재작성 — `docs/conventions/product-copy.md`가 계약이다. F21은 문구를 바꾸자는
  게 아니라 **출처를 하나로 만들자**는 것이다.
- `plugin/`, `scripts/`, `prisma/` — F23이 검사기 확장을 후보로 언급하지만 이번 범위 밖이다.
- 성능·번들 튜닝, 폴더 구조 재설계, 프레임워크 선택.

## Proposal

30건을 성격별 5묶음으로 나눈다. 묶음 번호는 권장 실행 순서다.

### 묶음 1 — 지금 화면이 어긋나 있는 것 (Should ×4)

사용자가 **현재 코드에서 관측 가능한** 불일치다. 앞으로의 유지비가 아니라 지금의 정확성 문제라
가장 먼저 다룬다.

**F6 — 결재함 탭 뱃지가 실제 결재함보다 적게 센다** · 응집도
`src/fsd/widgets/turn-banner/model/turn.ts:120,147-148` · `src/fsd/features/review-gate/model/gate-source.ts:6-24` · `src/app/(app)/p/[slug]/layout.tsx:25` · `src/fsd/widgets/app-header/ui/project-tabs.tsx:10`
결재함 목록은 `needsHumanDecision`(게이트 원천 ∨ 재개 가능)로 거르고, 탭 뱃지는 `isGateSource`만
쓴다. 재개 가능한 `on_hold` 항목만 남은 프로젝트는 **뱃지 0인데 카드가 보인다.** `project-tabs.tsx:10`
주석은 이 불일치를 해소하지 않고 "다를 수 있다"고 승인해 둔 상태다. `briefing.ts:286,297`에 아무도
읽지 않는 세 번째 파생까지 있다.
→ `review-gate`에서 `pendingInboxCount`를 내보내 뱃지가 같은 술어를 쓰게 한다. 의도적으로 좁은
거라면 이름을 `gateCount`로 바꿔 다른 개념임을 드러낸다. 죽은 `Briefing.pendingCount`는 지운다.
*(게이트가 렌즈의 Consider를 Should로 올렸다 — 미래 드리프트가 아니라 현재 재현되는 부정확성이라는 판단.)*

**F10 — 새 프로젝트 폼에서 지워지지 않는 오류 문구** · 가독성
`src/fsd/features/create-project/ui/new-project-form.tsx:24-33,45-68,102-129,131`
재현: 수동 입력 → 잘못된 URL 붙여넣기(`pasteError` 설정) → "Pick from my repositories" 클릭(`:114`,
`isManualEntry`만 해제) → **picker 화면인데 붙여넣기 오류 문구가 그대로 남는다.** `:131`의 오류
블록이 모드 분기의 형제라 모드와 무관하게 렌더된다. `reset()`도 `query`를 안 지운다. 한 폼의
상태를 `useState` 9개로 쪼갠 결과다.
→ 모드가 바뀌는 지점에서 `pasteError`·`query`를 지우거나, 세 값을 한 객체/리듀서로 묶는다.

**F3 — "글자수 초과" 판정이 두 벌이고 서로 다르다** · 응집도
`src/fsd/features/review-gate/ui/inbox-card.tsx:42,65-67` · `src/fsd/pages/project-board/model/briefing.ts:145-150` · `src/fsd/pages/project-board/ui/project-board-page.tsx:54-56`
보드는 **합쳐진** `item.result` 길이로 재고(`isOverBudget`), 결재함은 **개별** `results[]` 각각을
잰다. 100자짜리 결과 3개를 가진 항목은 보드에선 초과 표시가 뜨고 결재함에선 안 뜬다. 칩 마크업과
문구는 두 파일에 그대로 복제돼 있다. 단일 출처인 건 상수 `TEXT_LIMIT`뿐이다.
→ 술어와 칩을 두 소비자가 닿을 수 있는 `entities/board-item`으로 내리고, 개별/합산 중 어느 쪽이
맞는지 이참에 결정한다.

**F2 — 항목 상세의 문서 목록이 자기 엔티티의 라벨 규칙을 우회한다** · 응집도
`src/app/(app)/p/[slug]/items/[key]/page.tsx:17-22` · `src/fsd/entities/board-item/model/doc-link.ts:22-51` · `src/fsd/entities/report/model/report.ts`
라우트가 라벨(`"Plan"`, `` `${report.actor} report` ``)을 직접 지어내고 정렬도 없다. `doc-link.ts`가
product-copy.md §11을 근거로 `REPORT_LABEL`·`reportOrder`를 이미 소유하지만, 유일한 소비자
(`briefing.ts`의 `docResolver`)가 `docs` 인자 없이 호출돼 **작동하지 않는다.** 그래서 화면은
main-loop의 검증 기록을 "main-loop report"로 부르고, 라벨 주인은 "Validation record"라고 부른다.
`entities/report`의 `toReportDoc`·`AgentReport`는 호출자가 0이다.
→ 문서 목록 조립을 `pages/board-item`으로 옮기고 `doc-link.ts`의 라벨·정렬을 재사용한다.
`entities/report`를 유지할지 지울지는 별도로 결정한다.

### 묶음 2 — 실패 경로와 입력 경계 (Should ×4, Consider ×1)

**F5 — `src/app` 어디에도 `not-found.tsx`가 없다** · 응집도
`src/server/auth/guard.ts:17` · `src/app/(app)/p/[slug]/items/[key]/page.tsx:15`
`notFound()`는 예외가 아니라 **예상되는 결과**다(잘못된 slug, 멤버십 해제, 삭제된 항목). 그런데
전 계층에 `not-found.tsx`가 없어 프레임워크 기본 404로 떨어진다 — 헤더·탭이 사라지고 돌아갈 길이
없다. 반면 더 드문 예외 경로에는 `error.tsx`가 두 개, 배치 근거 주석까지 달려 있다.
→ `(app)/p/[slug]/not-found.tsx`(프로젝트 레이아웃 안 — 탭·헤더 유지)와 `(app)/not-found.tsx`
(알 수 없는 slug)를 형제 `error.tsx` 옆에 만든다.

**F17 — 백로그 삭제에만 오류 경계가 없다** · TypeScript
`src/fsd/features/edit-backlog/ui/backlog-table.tsx:64-76`
`remove(row.key)`에 try/catch가 없다. `removeBacklogItem`은 `requireMember`를 부르고 그건 throw할
수 있다. 같은 저장소가 이 위험에 대해 **두 가지 대응을 이미 갖고 있다** — `NewTokenForm`은
try/catch("requireMember는 여전히 throw하므로 try/catch는 남긴다"), `InboxCard`는 전용
`InboxCardBoundary`("카드 하나의 실패가 결재함 전체를 지우지 않게"). 백로그 탭만 둘 다 없어서,
행 하나의 실패가 탭 전체를 오류 화면으로 바꾼다.
→ `NewTokenForm`과 같은 `try { … } catch { setError(…) }`를 두른다.

**F14 — GitHub `id`를 검증 없이 유니크 키로 쓴다** · TypeScript
`src/server/auth/config.ts:12-19`
`Number(raw.id)`에 존재·타입 검사가 없고, 결과가 `githubId Int @unique`(non-null) upsert로
직행한다. 같은 저장소의 `github.ts:24-29`는 동일한 "외부 JSON을 캐스팅 후 필드별 `typeof` 검사"
패턴을 제대로 하고 있다. 프로필 payload가 바뀌면 `NaN`이 Prisma에서 거부돼 **로그인 자체가** 원시
프레임워크 오류로 깨진다.
→ upsert 전에 `raw.id`를 `github.ts`와 같은 방식으로 검증한다.

**F16 — `createProject`가 `owner`/`repo`/`branch` 형식을 서버에서 검증하지 않는다** · TypeScript
`src/fsd/features/create-project/api/create-project.server.ts:14-20` · `src/fsd/features/create-project/model/repo-url.ts:11`
`slug`는 `SLUG_RE`로 검증하면서 `owner`/`repo`는 비어 있는지만 보고 `branch`는 아예 안 본다.
형식 정규식 `SEGMENT`가 이미 있지만 "URL 붙여넣기" 경로에서만 쓰인다. 수동 입력 필드는 제약 없이
서버 액션으로 직행한다. 주입 위험은 없지만(React 이스케이프, 접두사 고정) 앱 전역의 `blobHref`가
영구히 깨진 링크를 만들 수 있고, 같은 함수가 `slug`에 대해 선언한 원칙과 어긋난다.
→ `SEGMENT`를 내보내 `createProject`에서 `owner`/`repo`를 검증한다.

**F29 — GitHub 저장소 목록 실패를 조용히 삼킨다** · TypeScript · Consider
`src/server/github.ts:31-35`
catch가 모든 실패를 먹고 `[]`를 반환하며 로그가 없다. 실제 장애나 rate-limit이 나면 picker가
"Couldn't load your repositories"로 조용히 퇴화하고 추적 흔적이 0이다. 같은 저장소의 `error.tsx`
둘은 이런 경우 `console.error`를 남긴다.
→ `return []` 앞에 `console.error(error)`를 넣는다.

### 묶음 3 — 계약을 타입으로 고정 (Should ×4, Consider ×2)

**F9 — 낙관적 잠금이 `actor`와 무관하게 optional** · 예측가능성
`src/server/pipeline/board.ts:84-107`(`transition`), `:109`(`discard`)
`expectedUpdatedAt?: Date`가 사람/에이전트 구분 없이 선택적이다. 파일 주석은 생략이 UI 없는
에이전트 경로에서만 안전하다고 설명하지만, **타입은 그 결합을 표현하지 않는다.** 오늘 두 호출자는
일관되지만 그건 관례일 뿐이다. 사람 경로를 새로 만들며 빠뜨리면 CAS 검사가 조용히 꺼진다.
→ `{actor:"human"; expectedUpdatedAt: Date} | {actor:"agent"}`로 결합을 타입에 넣거나, 항상 필수로
만들고 에이전트 경로가 방금 읽은 `row.updatedAt`을 명시적으로 넘기게 한다.

**F12 — `Rule.kind`가 맨 `string`이고, 비교는 다른 slice에서 문자열 리터럴로 한다** · 가독성
`src/server/pipeline/board-rules.ts:8-11` · `src/fsd/features/review-gate/model/gate-source.ts:7,12,17,28`
타입 선언부가 어휘를 하나도 알려주지 않는다. 게이트가 `packages/core/transitions.mjs`를 직접 읽어
실제 어휘가 정확히 `"gate" | "bounce" | "hold" | "resume" | "plan" | "done"` 임을 확인했다.
오타나 이름 변경이 컴파일을 통과하면서 게이트/재개/반려 분류를 조용히 깬다.
→ `kind`를 위 리터럴 유니온으로 좁히고 `gate-source.ts`가 같은 유니온을 쓰게 한다.

**F13 — MCP 인가 경계에서 불필요한 `as Ctx` 캐스팅 11회** · TypeScript
`src/server/mcp/tools.ts:45,49,53,57,62,66,71,75,79,83,87` (헬퍼 `:33-38`)
설치된 `@modelcontextprotocol/server` 타입 확인 결과 `ServerContext.http?.authInfo`는 `AuthInfo`이고
`extra?: Record<string, unknown>`를 가진다 — **손으로 만든 `Ctx`를 구조적으로 이미 만족한다.**
즉 캐스팅은 컴파일에 필요 없고, 오직 검증을 끄는 역할만 한다. 이곳은 모든 에이전트 도구의 인가
범위를 뽑아내는 지점이라, SDK 업그레이드로 형태가 바뀌어도 `tsc`가 11곳 어디서도 안 잡는다.
→ 캐스팅 대신 콜백 매개변수에 타입을 단다: `async (_a, ctx: Ctx) => { const { projectId } = scope(ctx); … }`.

**F15 — `discard`의 인접한 같은 타입 문자열 인자 3개** · TypeScript
`src/server/pipeline/board.ts:109` · 호출부 `src/fsd/features/review-gate/api/review-gate.server.ts:34`
`discard(projectId, key, userId, expectedUpdatedAt?)`. 같은 저장소의 `inbox-item.ts:25-26`이 바로 이
위험을 명시하며("인자 넷이 모두 string이면 순서를 바꿔도 컴파일된다") `TransitionInput`을 객체로
만들었는데, 동일한 형태의 `discard`만 그 처리를 못 받았다. 순서가 바뀌면 **엉뚱한 항목을 엉뚱한
행위자 이름으로 폐기**하면서 컴파일은 통과한다.
→ `TransitionInput`·`ProposeInput`처럼 이름 있는 입력 객체 하나로 받는다.

**F26 — `ToolDeps`의 반환 타입이 전부 `unknown`** · 예측가능성 · Consider
`src/server/mcp/tools.ts:14-26`
읽기 5개가 `Promise<unknown>`, 쓰기 5개가 `ToolResult<unknown>`이고 핸들러는 `JSON.stringify`로
그대로 흘린다. `board.ts`의 Prisma select가 바뀌어 에이전트 프로토콜이 의존하는 필드가 빠져도
`tools.ts`·`deps.ts` 어디서도 타입 오류가 안 난다 — 런타임 계약 파손으로만 드러난다. 같은 제약
("Prisma 타입을 import하지 않는다")을 `inbox-item.ts`는 구조적 행 타입으로 풀었다.
→ `BoardRow`처럼 구조적 반환 타입을 준다.

**F30 — `BoardResult<T>`와 `ToolResult<T>`가 같은 모양의 별개 선언** · TypeScript · Consider
`src/server/pipeline/board.ts:7` · `src/server/mcp/tools.ts:11`
둘 다 `{ok:true; item:T} | {ok:false; reason:string}`이고 `deps.ts`는 구조적 호환에만 기댄다. 범위
안에 유사한 결과 타입이 셋 더 있다(`Decision<T>`, `ActionResult<T>`, `TemplateResult`) — 필드
이름도 제각각(`ok`/`success`, `item`/`data`/`value`, `reason`/`error`).
→ `tools.ts`가 `BoardResult`를 재사용하거나, 서버 전용 모듈에서 정본 `Result<T>` 하나를 내보낸다.

### 묶음 4 — 단일 출처 복구 (Should ×4, Consider ×4)

**F1 — 결재함 라우트가 slice의 읽기를 대신하고 있다** · 응집도
`src/app/(app)/p/[slug]/inbox/page.tsx:12-17` · `src/server/pipeline/board.ts:22-35` · `src/fsd/features/review-gate/model/inbox-item.ts:42-56`
`latestBoardWithEvents`는 `InboxItem` 전용으로 튜닝된 쿼리(`note: null`, `take: 8`)인데, 그 가정을
소비하는 코드는 세 디렉터리 밖에 있다. `inbox-item.ts:42`는 "라우트가 아니라 이 slice가 카드
모델을 소유한다"고 선언하지만 정작 읽기가 slice에 없다. 형제 위젯(`turn-banner`·`app-header`)은
각자 `api/*.server.ts`로 자기 읽기를 소유한다.
→ `review-gate/api/inbox-data.server.ts`에 `loadInboxItems(projectId)`를 만든다. FSD 검사기는
`api` 세그먼트에서의 `@/server` import를 허용한다(확인함).

**F7 — "계획 검증됨"(`validation !== null`)이 3개 레이어 6곳에 흩어져 있다** · 결합도
`turn.ts:74-75,96` · `journey.ts:61` · `inbox-card.tsx:40,170`
사람의 승인(게이트②)을 좌우하는 술어다. 정의가 바뀌면 세 레이어를 다 찾아야 하고, 하나를 놓치면
배너는 "승인 준비됨"이라 하는데 카드는 "No validation yet"이라고 하는 상태가 된다. 같은 저장소가
구조적으로 동일한 `isGateSource`/`needsHumanDecision`은 이미 한 곳에 모아 두었다.
→ `gate-source.ts`에 `isPlanVerified(status, validation)`를 만들어 셋이 부르게 한다.

**F11 — `daysOnBoard`가 `daysBetween`의 알고리즘을 다시 구현한다** · 가독성
`src/fsd/pages/project-board/model/briefing.ts:65-80` · `src/fsd/shared/lib/relative-time.ts:1-13`
둘 다 UTC 자정 기준 일수 차를 계산하고 음수를 0으로 막는다. `briefing.ts:78`은 상수 이름 대신 맨
`86_400_000`을 쓴다.
*근거 정정:* 렌즈는 `DAY_MS`가 "이미 export돼 있다"고 했으나 실제로는 모듈 내부 `const`다(게이트가
정정, 본 검토에서 재확인). 권장 조치는 `DAY_MS` import가 아니라 **이미 export된 `daysBetween`에
차이 계산 전체를 위임**하는 것이므로 결론은 그대로다.
→ `daysOnBoard`가 파싱한 값으로 `Date`를 만들어 `daysBetween`에 넘긴다(pages → shared는 허용 방향).

**F4 — 백로그 URL 질의 키(`edit`, `removed`)에 공유 계약이 없다** · 응집도
`src/app/(app)/p/[slug]/backlog/page.tsx:11,13` · `backlog-table.tsx:54` · `project-backlog-page.tsx:21`
`edit`은 feature slice가 쓰고 `src/app`이 읽는다. `removed`의 `"1"` 인코딩은 읽는 쪽에만 있다.
`searchParams`는 타입이 없어 어느 쪽을 바꿔도 컴파일 오류 없이 조용히 깨지고, 테스트도 없다.
→ `shared/routes/project.ts`에 `backlogHref(slug, {edit?, includeRemoved?})`와 `readBacklogQuery()`를
추가한다.

**F19 — `projectPath`를 우회하는 하드코딩 링크 8곳** · 응집도 · Consider
`project-board-page.tsx:45` · `project-backlog-page.tsx:21` · `project-list-page.tsx:22` · `app-header.tsx:48` · `backlog-table.tsx:54` · `new-project-form.tsx:75` · `turn-banner.tsx:43,50,71,78`
`shared/routes/project.ts`는 스스로를 "유일한 출처"라 선언하고, `revalidatePath` 7곳과 탭 내비는
실제로 이걸 쓴다. 세그먼트 이름을 바꾸면 캐시 무효화와 탭은 따라가는데 **이 링크 8개만 죽은
URL로 남는다.**
→ 리터럴을 `projectPath(slug, segment)`로 돌리고, 탭이 아닌 항목 상세 경로는 같은 모듈에 이름 있는
빌더로 추가한다.

**F18 — `RepoRef` Prisma 읽기가 두 라우트에 복제** · 응집도 · Consider
`inbox/page.tsx:13` · `items/[key]/page.tsx:12`
바이트 단위로 동일한 쿼리다. 타입은 단일 출처인데 그걸 만드는 읽기는 아니다.
→ `loadRepoRef(projectId)` 하나를 두 곳이 쓴다.

**F21 — 랜딩 페이지가 4개 모듈의 문구를 그대로 복제** · 응집도 · Consider
`src/fsd/pages/landing/ui/landing-page.tsx:141-168`
`"Waiting on you"`(=`HEADLINE.mine`), `"In review"`(=`STATUS_LABEL.in_review`), `"Approve
implementation"`·승인 힌트 문장(=`gate-text.ts:20,24`), 탭 라벨(=`PROJECT_TABS`)이 모두 바이트
일치한다. 각 모듈은 자기가 그 문구의 유일한 출처라고 주석에 적어 두었지만 랜딩을 볼 수 없다.
문구를 바꾸면 제품은 바뀌고 랜딩은 조용히 낡는다.
→ 이미 공개된 것(`HEADLINE.mine`, `statusLabel("in_review")`, `PROJECT_TABS`)은 그대로 가져다 쓰고,
`gate-text` 두 줄은 공개 API를 좁게 넓히거나 최소한 출처를 주석으로 명시한다.

**F24 — 토큰 유효성 검사가 두 파일에 복제** · 결합도 · Consider
`src/server/templates.ts:11-19` · `src/server/mcp/auth.ts:7-14`
`templates.ts:2`가 의도적 중복임을 명시해 뒀고 2곳뿐이라 지금은 조치 불필요. 다만 보안 관련
규칙이 컴파일러·테스트의 연결 없이 두 벌 존재한다는 사실은 남는다.
→ 세 번째 소비자가 생기면 그때 `findValidToken`으로 뽑는다.

### 묶음 5 — 표면 정리 (Should ×1, Consider ×6)

**F8 — `CreateProjectState`가 불가능한 조합을 허용** · 예측가능성 · **Should**
`src/fsd/features/create-project/model/create-project-state.ts:2`
`{error?, slug?, token?}` 셋이 독립적으로 optional이라 셋 다 채워진 상태가 타입상 가능하다.
소비자는 `state.token && state.slug`를 먼저 보므로 그 경우 오류를 버리고 성공 화면을 그린다.
→ 판별 유니온으로 바꾼다.

**F20 — `deriveJourney`가 소비자에게 줄 수 없는 slice에서 죽은 채 export된다** · 응집도·결합도·가독성 · Consider
`src/fsd/pages/project-board/index.ts:3-4` · `model/journey.ts`(전체)
소비자로 지정된 `pages/board-item`은 **같은 layer라 import가 금지**돼 있고 검사기가 막는다(확인함).
호출자는 자기 테스트뿐이다. 배선하려면 이동 + import 재작성 + 공개 API 변경이 필요하다 — 미뤄진
게 아니라 쌓인 것이다.
→ `entities/board-item/model/journey.ts`로 내리거나(같은 문제를 푼 `status-label.ts` 옆), 배선
전까지 공개 API에서 뺀다.
*(기여 렌즈 3개 중 결합도만 Should를 제안했으나, 실패가 빌드 시점에 시끄럽게 잡히므로 게이트가
Consider로 확정했다.)*

**F22 — `BacklogTable`의 `"use client"` 경계가 필요보다 넓다** · 응집도 · Consider
`src/fsd/features/edit-backlog/ui/backlog-table.tsx:1`
상호작용은 Remove 버튼과 공유 오류 줄뿐인데 테이블 원시 컴포넌트·칩·링크가 함께 클라이언트로 간다.
fsd.md:143의 자체 규칙("가장 작은 leaf만 Client Component")과 어긋나고, 같은 저장소의
`copy-button.tsx`·`gate-transition-button.tsx`는 규칙을 지킨다.
→ `remove-backlog-button.tsx`를 떼어낸다. 공유 오류 줄의 위치는 UX 결정이 필요하다.

**F23 — "어디가 공개 경로인가"가 두 곳에 따로 적혀 있다** · 응집도 · Consider
`src/server/auth/config.base.ts:4-5` · `src/app/page.tsx`, `src/app/login/page.tsx`, `src/app/(app)/layout.tsx:6`
하나는 데이터(`PUBLIC_EXACT`/`PUBLIC_PREFIXES`), 하나는 디렉터리 구조(`(app)` 라우트 그룹). 라우트
그룹은 URL에 안 나타나므로 proxy가 구조를 읽을 수 없다 — **깔끔한 코로케이션이 존재하지 않는다.**
공개 페이지를 추가하며 목록을 잊으면 전원 `/login`으로 튕기고, 반대로 접두사가 잘못 겹치면 인증
경로가 proxy에서 열린다. (`proxy.ts`의 matcher가 `/api/*`를 제외하므로 `/api/mcp`·`/api/templates`는
자체 토큰 검사에만 의존한다 — 확인함.)
→ 코로케이션 대신 **드리프트를 검출 가능하게** 만든다: `(app)` 밖 라우트 파일과 공개 목록이 서로
대응하는지 검사하는 테스트 또는 검사기 확장.

**F25 — `BacklogFormState.done`을 모든 생산자가 설정하고 아무도 읽지 않는다** · 예측가능성 · Consider
`backlog-form-state.ts:2` · `backlog-form.tsx:16-41`
타입에 `done`이 있으면 UI가 반응한다고 읽히지만 실제로는 `error`만 읽는다. Add 모드 입력은
비제어라 성공 후에도 값이 남고, 다음 클릭이 `already exists.` 오류를 내면 사용자는 이유를 모른다.
→ `done`을 소비하거나(폼 초기화) 필드를 지운다.

**F27 — `latestBoard(projectId, true)` — 이름 없는 불리언 2곳** · 예측가능성·TypeScript · Consider
`board.ts:12,69` · `edit-backlog.server.ts:55`
같은 파일 두 줄 위의 `includeRemoved`는 변수로 묶여 있는데 이것만 리터럴이다.
→ 호출부에서 `const openOnly = true;`로 묶거나 옵션 객체를 받는다.

**F28 — `cardClass(true, …)` — 이름 없는 불리언** · 가독성 · Consider
`src/fsd/shared/ui/card.tsx:7` · `landing-page.tsx:151`
→ 지역 상수로 묶거나 옵션 객체를 받는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `src/app/(app)/**` (라우트 4개 + `not-found.tsx` 2개 신설) | update/create | F1·F2·F5·F18: 라우트가 데이터 조립·라벨 생성을 떠안고 있고, 404 fallback이 없다 | medium — 라우팅 경계 변경. `not-found.tsx` 배치가 잘못되면 셸이 사라진다 |
| `src/fsd/features/review-gate/**` | update/create | F1·F3·F6·F7: 결재함 자격·검증 술어의 소유자. `api/inbox-data.server.ts` 신설 | low — 공개 API 확장 위주 |
| `src/fsd/features/create-project/**` | update | F8·F10·F16: 상태 모델·모드 전환·서버 검증 | medium — 사용자 진입 흐름. 회귀 시 프로젝트 생성 불가 |
| `src/fsd/features/edit-backlog/**` | update | F4·F17·F22·F25·F27: 오류 경계, `use client` 경계, 질의 키 | low |
| `src/fsd/entities/board-item/**` | update/create | F3·F7·F11·F20의 수용처(공유 술어·모델이 내려올 곳) | low — 하위 레이어라 의존 방향 안전 |
| `src/fsd/entities/report/**` | 결정 필요 | F2: 호출자 0. 배선할지 삭제할지 미정 | low |
| `src/fsd/pages/project-board/**` | update/move | F3·F6·F11·F20: `journey.ts` 이동, 죽은 `pendingCount` 제거 | low — 이동 시 배럴 갱신 필요 |
| `src/fsd/pages/landing/**` | update | F21: 문구 출처를 실제 모듈로 | low — 문구 값은 불변, 출처만 변경 |
| `src/fsd/shared/routes/project.ts` | update | F4·F19: 질의 키와 항목 상세 경로 추가 | low |
| `src/fsd/widgets/turn-banner/**` | update | F6·F7: 뱃지 술어 통일 | low |
| `src/server/pipeline/board.ts`·`board-rules.ts` | update | F9·F12·F15·F27·F30: 서명·유니온·결과 타입 | medium — MCP 도구와 서버 액션이 공유하는 계약 |
| `src/server/mcp/tools.ts`·`deps.ts` | update | F13·F26·F30: 캐스팅 제거, 구조적 타입 | medium — 에이전트 프로토콜 계약. 회귀 시 도구 전체가 인증 실패 |
| `src/server/auth/config.ts`·`config.base.ts` | update | F14·F23: 프로필 검증, 공개 경로 드리프트 | high — 로그인 경로. 회귀 시 전원 로그인 불가 |
| `src/server/github.ts`·`templates.ts` | update | F29(로깅)·F24(기록만, 조치 없음) | none/low |

## Safety Analysis

이 제안서는 **실행 전 문서**이므로 아래는 실행 시 확인해야 할 경계다. 이번 리뷰에서 이미
근거로 확인한 항목은 그렇게 표시한다.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — `src/app` 전 경로를 렌즈가 읽었고, `not-found.tsx` 부재를 직접
      확인했다. `proxy.ts`의 matcher가 `/api/*`를 제외한다는 점도 확인했다.
- [x] 정적 `import` / `export from` — 다섯 렌즈가 전수로 읽었고, `deriveJourney`·`toReportDoc`·
      `AgentReport`·`initialOf`의 호출자 0을 grep으로 재확인했다.
- [x] barrel export(`index.ts`) 경유 참조 — F20·F21이 공개 API 변경을 포함한다. FSD 검사기가
      같은 layer import를 막는다는 사실을 검사기 소스로 확인했다.
- [x] 타입 선언, 전역 선언, ambient module 영향 — `@modelcontextprotocol/server`의 `ServerContext`·
      `AuthInfo` 실제 형태를 설치된 `.d.mts`로 확인(F13). `packages/core`의 `kind` 어휘 확인(F12).
- [x] 테스트와 스크립트 참조 — `src` 내 테스트 11개(87 케이스)를 렌즈가 범위에 포함했다.
      `journey.test.mjs`는 F20의 이동 대상과 함께 움직여야 한다.
- [x] dynamic `import()` 또는 lazy loading — 해당 없음(실행 후 재확인).
- [x] 정적 자산 URL 또는 `public` 직접 접근 가능성 — 해당 없음.
- [x] 런타임 side effect 또는 초기화 코드 — F14는 Auth.js `jwt` 콜백 내부, F13은 MCP 도구 등록
      시점이다. 둘 다 요청 경로에서 실행되므로 실행 시 실계정 로그인과 도구 호출로 확인해야 한다.
- [x] API, 외부 SDK 영향 — F13·F26·F30이 MCP 계약을 건드린다. **계약이 바뀌면 스모크 판정이
      낡는다**(`docs/test-reports/completed/2026-09-01-…`) — 실행 시 이 점을 반드시 고려한다.

오탐 경계로 남는 것:

- F13의 "캐스팅이 불필요하다"는 주장은 타입 선언 파일 독해에 근거한다. 실행 시 캐스팅을 제거하고
  `tsc --noEmit`이 통과하는지가 최종 근거다.
- F6·F3의 "지금 어긋난다"는 코드 독해로 확인했으나 **실제 화면으로는 재현하지 않았다**(dev 서버
  기동은 소유자 권한). 실행 전 화면 재현을 권한다.

## Approval

승인 메모:

- **2026-09-03 전체 승인**(묶음 1~5, 30건). 제품 결정 4건은 착수 시 확인했다(front matter의
  `approval-scope`). 실행은 PR #7 하나로 묶여 2026-09-02에 머지됐다.
- ~~묶음 3을 승인하면 MCP 계약이 바뀐다~~ — **작성 시점의 오판이었다.** 도구 핸들러는 `text()`로
  `JSON.stringify`할 뿐이라 `ToolDeps`·`ServerResult`·`Caller`·`RuleKind`는 전부 컴파일 타임 전용이다.
  에이전트가 받는 JSON은 같은 쿼리에서 나오므로 **와이어 계약은 바뀌지 않고 스모크 판정도 낡지 않는다.**
- F2의 `entities/report` 존치/삭제, F3의 개별-대-합산 판정, F6의 뱃지 의미(넓게 vs `gateCount`로
  개명), F22의 공유 오류 줄 위치는 **제품 결정**이라 실행자가 임의로 정하면 안 된다.

## Execution Plan

1. 묶음 1(F6·F10·F3·F2) — 지금 어긋난 화면. 각 건마다 수정 전 화면 재현 → 수정 → 재현 불가 확인.
2. 묶음 2(F5·F17·F14·F16·F29) — 실패 경로. `not-found.tsx`는 두 위치 모두 실제 404로 확인.
3. 묶음 3(F9·F12·F13·F15·F26·F30) — 타입 계약. **MCP 계약 변경 포함** — 승인 시 스모크 재실행
   필요 여부를 함께 결정한다.
4. 묶음 4(F1·F7·F11·F4·F19·F18·F21·F24) — 단일 출처 복구. 이동·배럴 변경이 있어 `verify:fsd`를
   각 단계마다 돌린다.
5. 묶음 5(F8·F20·F22·F23·F25·F27·F28) — 표면 정리. F23은 검사 추가라 별도 판단.

묶음마다 별도 PR을 권한다(현재 흐름: `harness/* → dev → main`, `--base dev`).

## Verification Plan

실행할 검증:

```bash
npm run check       # eslint + FSD 경계 + next typegen + tsc --noEmit + 아키텍처 13종 + plugin-lib 동기
npm test            # packages/core + plugin/bin (50)
npm run test:web    # src 전역 (87)
npm run verify:fsd  # 이동·배럴 변경이 있는 묶음 4·5에서 단계마다
```

검증 기준:

- 위 네 명령이 전부 통과. 기준선은 이 문서 작성 시점의 `dev`(`8da3837`)에서 측정한
  `check` 통과 · `50 pass / 0 fail` · `87 pass / 0 fail`이다.
- 신규 실패와 기존 실패 구분: 기준선이 전부 통과이므로 **어떤 실패든 신규**다.
- F13은 캐스팅 제거 후 `tsc --noEmit` 통과가 곧 주장의 증명이다.
- F6·F3·F10·F2는 타입·테스트로 잡히지 않는다 — 화면 재현으로만 확인 가능하다.
- 묶음 3 실행 시 MCP 도구 11종의 응답 형태를 실제 호출로 확인해야 한다(계약 변경이므로).

## Verification Results

실행 완료(PR #7, 2026-09-02 머지). 아래 표의 앞 네 줄은 **리뷰 시점의 기준선**이고,
마지막 줄이 실행 결과다. 문서가 오래 `active`에 남아 있었으나 코드는 그때 이미 바뀌어 있었다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | 통과 (2026-09-02, `dev` = `8da3837`) | 기준선 측정 — 아키텍처 13/13, plugin/lib in sync |
| `npm test` | 50 pass / 0 fail | 기준선 |
| `npm run test:web` | 87 pass / 0 fail | 기준선 |
| 근거 대조 (grep) | 일치 | `as Ctx` 11 · `validation` 6개소 · `not-found.tsx` 부재 · `deriveJourney` 소비자 0 · `DAY_MS` 미export · over-budget 술어 2벌 · 뱃지/인박스 술어 불일치 |
| 제안 변경 검증 | **반영 확인 (2026-09-05)** | 30건을 코드에 직접 대조: 반영 29 · 보류 1(F24) · 미반영 0. 대조 시점 `main` = `be2066c` |

## Risks and Rollback

잔여 리스크:

- ~~묶음 3은 MCP 계약을 바꾼다~~ — 정정: 타입 전용 변경이라 와이어 계약과 스모크 판정에 영향이 없다.
- **F14는 로그인 경로다.** 회귀하면 전원 로그인 불가다. 검증은 실계정 로그인으로만 가능하다.
- **F5의 `not-found.tsx` 배치**가 틀리면 404에서 셸이 사라지거나, 반대로 레이아웃이 렌더될 수 없는
  경로에서 오류가 난다. 두 위치 모두 실제 404로 확인해야 한다.
- F6·F3·F10·F2는 **타입·테스트가 잡아주지 않는다.** 화면 재현이 유일한 검증이다.
- 이 리뷰는 게이트가 33건 중 0건을 기각했다. 표본 대조는 전부 일치했지만, 대조하지 않은 항목은
  게이트 검증을 신뢰한 것이다. 실행자는 각 건을 고치기 전에 근거를 다시 읽는 것을 권한다.

롤백 방법:

- 묶음별 PR이므로 `git revert <merge-commit>` 단위로 되돌린다.
- 파일 이동(F20·F11·F3의 수용처)은 되돌릴 때 배럴(`index.ts`)도 함께 복원해야 한다 — 이동만
  되돌리면 `verify:fsd`가 잡는다.
- DB 스키마 변경은 없다. 마이그레이션 롤백 불필요.

## Completion or Closure Notes

- completed-at: 2026-09-02 (실행일. **문서 종결은 2026-09-05**로 늦었다 — 아래 참조)
- verification-summary: PR #7(2026-09-02 머지, 61파일 +1230/-349)이 30건 중 29건을 반영했다. 남은 F24는 권고문이 "세 번째 소비자가 생기면 추출"로 조건을 달아 둔 Consider라 조건 미충족으로 보류된 상태다. 2026-09-05 코드 대조로 확인했다.
- implementation PR/commit: PR #7 `refactor(web,server): the accepted five-lens findings, all 30`,
  2026-09-02 머지. 61파일 +1230/-349.
- changed files summary: `src/app` 라우트 4개 + `not-found.tsx` 2개 신설 · `src/fsd`의
  `review-gate`·`board-item`·`shared/routes`·`shared/lib` · `src/server`의 `board.ts`·
  `board-rules.ts`·`mcp/tools.ts`·`mcp/deps.ts`·`result.ts`.

**대조 결과(2026-09-05).** 30건을 코드에 하나씩 맞춰 봤다.

- **반영 29건.** 근거 표본: `as Ctx` 캐스팅 11→0(F13·F26), `not-found.tsx` 2개 신설(F5),
  `journey.ts`가 `entities/board-item/model/`로 이동(F20), `ServerResult<T>` 단일 정본(F30).
- **보류 1건 — F24(토큰 검증 복제).** 미반영이 아니라 **조건 미충족**이다. 권고문이
  "세 번째 소비자가 생기면 그때 추출"로 조건을 달았고 소비자는 아직 둘(`templates.ts`·
  `mcp/auth.ts`)이다. 세 번째가 생기면 `findValidToken`을 뽑는다.
- **권고와 다르게 간 2건(문제는 해소).** F7은 술어를 권고한 `gate-source.ts`가 아니라 더 하위인
  `entities/board-item`에 뒀다 — 세 레이어가 다 닿아 오히려 낫다. F21은 안전하게 import되는 것만
  가져오고 Client 배럴을 끌어와야 하는 문구는 권고가 허용한 대체안(출처 주석)을 택했다.

**이 문서가 늦게 닫힌 것 자체가 기록할 만한 일이다.** 코드는 2026-09-02에 바뀌었는데 문서는
2026-09-05까지 `active/`에 `pending`으로, 본문에 "아직 실행 전이다"라고 적힌 채 남았다.
그동안 남은 작업을 셀 때마다 미착수로 집계됐고, 새로 읽는 사람이 **이미 고친 30건을 다시 고치려
들 위험**이 있었다. 원인은 실행을 별도 PR로 내면서 문서 갱신이 그 PR에 들어가지 않은 것이다.
Phase 4 제안서는 배치마다 체크박스와 Verification Results를 같이 갱신해 이 문제가 없었다 —
**실행 PR에 문서 갱신을 같이 담는 것**이 이 저장소에서 통하는 방식이다.

- remaining follow-up: F24(세 번째 토큰 소비자가 생기면 `findValidToken` 추출). 그 외 없음.

## Review Checklist

- [x] 모든 placeholder를 처리했고, 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`을 사용했다.
- [x] 문서 위치(`active/`)와 `status`(`pending`)가 일치한다.
- [x] `stage`는 pending 문서에서만 사용했다(`draft`).
- [x] `stage`가 `approved`가 아니므로 승인 3필드는 `null`이다.
- [x] `proposal-size`는 `standard`이며 강제 조건(라우팅·인증·barrel export·API 계약·5개 이상 파일)에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 쓰고, 본문에는 조건과 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, barrel, 타입, 런타임 side effect, 외부 SDK를 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 기준선이 전부 통과이므로 신규 실패 판별 기준을 명시했다.
- [x] 잔여 리스크를 명시했다.
- [x] 완료 문서 항목 — 갱신 완료(2026-09-05).
