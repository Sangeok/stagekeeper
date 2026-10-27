---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-10-27"
approved-by: "user"
approved-at: "2026-10-27"
approval-scope: "SRC-CC-001–007 전체 코드 수정·검증 및 후속 요청에 따른 commit·push·dev 대상 PR 생성. PR 승인·check 통과 후 dev 병합 확인과 작업 브랜치 정리. main 승격·배포는 제외"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/server.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-10-15-fsd-frontend-clean-code-follow-up.md"
  - "docs/proposals/completed/2026-10-22-frontend-clean-code-review.md"
  - "docs/proposals/completed/2026-10-23-fsd-frontend-clean-code-review.md"
---

# src 프런트엔드 클린 코드 개선 제안

## Summary

`frontend-clean-code-orchestrator`의 여섯 독립 렌즈와 별도 품질 게이트로 `src`를 검토했다.
원시 후보 8개를 **Should 2건, Consider 5건**으로 정리했다. Must는 없다.
우선 권고는 저장소 목록의 재시도 대기 정책을 실제 요청 경계에 적용하고,
공개 목록 조회의 외부 지연이 수동 URL 입력까지 기다리게 하는 경로에 제한시간을 두는 것이다.

| 우선순위 | ID | 개선 항목 | 기여 렌즈 | 이력 구분 |
| --- | --- | --- | --- | --- |
| Should | SRC-CC-001 | 저장소 목록의 재시도 대기를 수동·자동 요청에 일관되게 적용 | Predictability | 이번 검토에서 확인 |
| Should | SRC-CC-002 | 공개 목록 조회의 제한시간과 URL 입력 fallback 도달성 | TypeScript generalist | 이번 검토에서 확인 |
| Consider | SRC-CC-003 | 연결 시작·해제의 진행 상태와 안내 구분 | Predictability, Readability | 이번 검토에서 확인 |
| Consider | SRC-CC-004 | 파이프라인 변경 입력 타입을 기존 schema와 연결 | Cohesion | 이번 검토에서 확인 |
| Consider | SRC-CC-005 | Billing 시험의 비공개 파일 경로·로컬 별칭 결합 축소 | Coupling | 기존 잔여 결합의 선택적 후속 |
| Consider | SRC-CC-006 | 저장소 이름 정책을 기존 core export로 연결 | Simplicity | 이전 승인 범위 밖의 선택적 후속 |
| Consider | SRC-CC-007 | 기존 토큰 이름 변경 폼 재사용 | Simplicity | 기존 미선택 FSD-REV-003 재확인 |

2026-10-27 후속 요청으로 **001–007 전체를 구현했다**. 아래 Proposal은 기준 커밋 당시의
검토 근거와 구현 계획을 보존한다. 실제 변경·시험 결과와 남은 검증 제한은 Implementation Results에 기록한다.
최초 지적은 정적 코드와 호출 관계로 확인한 것이며 운영 장애 재현 결과는 아니다.
005–007은 이번에 선택하여 구현한 기존 후속 개선으로, 과거 완료 작업의 누락으로 집계하지 않는다.

## Goal

- 사용자에게 표시하는 재시도·진행 상태와 실제 요청 동작을 일치시킨다.
- 선택적인 외부 조회가 실패할 때 기존 수동 입력 경로에 도달할 수 있게 한다.
- 입력 계약·동일 정책·동일 UI의 수동 동기화와 구현 위치에 민감한 시험 비용을 줄인다.
- 기존 FSD·서버 공개 경계, 인증·인가, 요청 취소·세션 무효화, 문구 계약을 보존한다.

## Proposal Size

`standard`. 전체 `src` 검토이며, 후속 구현을 모두 선택하면 5개 이상 파일과 비동기 동작,
client 공개 export, 테스트 소유권, 중복 파일 삭제에 영향을 준다.
권고 Core는 001·002이고, Phase 2는 003–007 중 선택한 ID만 수행하는 국소 개선이다.
이 분류는 실행 순서를 정할 뿐 구현 승인이 아니다. 현재 승인된 구현 범위는 001–007 전체다.
Core 완료 조건에 미선택 Phase 2의 파일 삭제·문구·시험 변경을 섞지 않는다.

## Current State

### 기준 소스와 환경

- 검토 기준: `a6d6933e8b499446683dc07fc77d9448d602b449`.
- `src` tree: `4b0e841e763f450928635c4518b20d4da4791d04`.
- 아래 파일·줄 근거는 이 기준 소스에 대한 것이다. 구현 시 최신 소스에서 재확인한다.
- Node `v26.4.0`, React `19.2.8`, TypeScript `5.9.3`, `strict: true`.
- `package.json`·lockfile의 Next.js는 `16.4.2`, 로컬 설치본과 내장 문서는 `16.3.3`이다.
  버전 차이는 검토 환경의 제한이며 이 제안서의 별도 소스 결함으로 집계하지 않는다.

| 영역 | 코드 파일 | 그중 테스트 | 코드 줄 | 검토 방식 |
| --- | ---: | ---: | ---: | --- |
| `src/fsd` | 284 | 75 | 11,512 | 전체 구조·AST/검색, 상태·UI·adapter·후보 관련 계약 상세 추적 |
| `src/server` | 157 | 44 | 10,963 | 전체 모듈·공개 경계 탐색, 프런트엔드 소비와 관련 구현 상세 추적 |
| `src/app` | 50 | 0 | 971 | 라우트·framework 조합, 폰트 로더·스타일 소유권 확인 |
| `src/proxy.ts` | 1 | 0 | 7 | 인증 진입 경계 확인 |
| 작성 코드 합계 | **492** | **119** | **23,453** | TS/TSX/MJS 491개와 CSS 1개 |
| `src/generated` | 32 | 0 | 47,600 | 생성 표식·공개 진입점·소비 계약 확인; 직접 수정 대상 아님 |

코드 집계 외에 `src/app/_fonts`의 폰트 3개, 라이선스 2개, README가 있다.
모든 파일과 테스트 본문을 같은 깊이로 행별 검증한 결과는 아니다.
전체 영역의 구조·검색 검토 후 실제 유지보수·동작 영향이 있는 경계를 상세 추적했다.

### 검토 방식과 coverage

각 렌즈를 `fork_turns="none"`인 별도 에이전트로 실행하고 같은 원본 대상·프로젝트 문맥을
제공했다. 실행 용량에 맞춰 두 배치로 진행했으며 다른 렌즈의 결과를 전달하지 않았다.
별도 중립 품질 게이트가 여섯 원시 출력과 원본·소비자·테스트·기존 결정 기록을 대조했다.

**Coverage: Full applicable-lens review — applicable 6, gate-validated N/A 0.**

| 렌즈 | 상태 | 원시 후보 | 채택 기여 |
| --- | --- | ---: | --- |
| Cohesion | Completed | 1 | 004 |
| Coupling | Completed | 1 | 005 |
| Predictability | Completed | 2 | 001·003 |
| Readability | Completed | 1 | 003 |
| Simplicity | Completed | 2 | 006·007 |
| TypeScript generalist | Completed | 1 | 002 |

채택 기여가 없는 렌즈, N/A, Unavailable, Skipped는 없다. 품질 게이트는 1라운드에서
종료됐고 수정 재요청·반려·pending-verification·미해결 충돌은 없다.
완료된 렌즈 coverage는 전 파일 행별 검증이나 전체 서버 도메인·동시성·DB 무결성 감사를 뜻하지 않는다.

## Scope

포함 범위는 `src`의 프런트엔드 클린 코드 위험과 그 직접 소비처·공개 계약이다.
`src/server`에는 서버 모듈 규칙을 적용하며 FSD layer를 강제로 적용하지 않는다.
`packages/core`, 루트 `tests`, 검사 스크립트와 문서는 근거·최소 변경 영향 범위로만 참조했다.

최초 문서 검증에서는 제품 코드를 수정하거나 실제 브라우저·GitHub·DB 인수를 실행하지 않았다.
후속 구현은 001–007의 코드와 아래에 지정한 로컬 브라우저 fixture 검증을 포함한다. 실제 GitHub 승인·폐기,
운영 DB·인증정보를 사용하는 인수, 배포·병합은 구현 범위에도 포함하지 않는다.
생성 코드 직접 편집, 제품·폴더 구조 재설계, 새 의존성·전역 상태·범용 fetch 계층,
전체 서버 보안·DB 감사와 번들/성능 측정도 제외한다.
이미 완료된 토큰 발급 복구·실행 조회 소유권·저장본/초안 분리·slug 공유 개선은 재등록하지 않았다.
기존 미선택 반환 타입·위치 인자·History 병렬화·배너/anchor 명명 후보도 새 발견으로 늘리지 않았다.

## Proposal

### Should — SRC-CC-001: 재시도 대기를 실제 목록 요청 경계에 적용

기여 렌즈: **Predictability**. 근거 확신도: High.

근거는 [use-repository-picker.ts:37](../../../src/fsd/features/create-project/model/use-repository-picker.ts#L37),
[같은 파일:50](../../../src/fsd/features/create-project/model/use-repository-picker.ts#L50),
[:109](../../../src/fsd/features/create-project/model/use-repository-picker.ts#L109),
[:196](../../../src/fsd/features/create-project/model/use-repository-picker.ts#L196)와
[repository-connection-panel.tsx:48](../../../src/fsd/features/create-project/ui/repository-connection-panel.tsx#L48)이다.
[API adapter:19](../../../src/fsd/features/create-project/api/repository-picker.ts#L19)는 응답의 `Retry-After`도 읽는다.

양수 `Retry-After`를 받으면 `retryAt`을 저장하고 `canRetry`로 Reload/Load more를 비활성화한다.
그러나 `load()` 자체는 이 제한을 검사하지 않는다. 연결된 상태에서 focus·pageshow·visibilitychange는
`load()`를 직접 호출하므로, 사용자가 대기 안내를 따르더라도 창 전환으로 목록을 다시 요청할 수 있다.
대기 오류가 loading으로 바뀌는 경로도 존재한다. 실제 발생 빈도·예산 소모량은 측정하지 않았다.

**최소 변경:** 목록 요청 시작 지점에서 대기 시간을 확인해 명시적 재시도와 자동 갱신에 같은 정책을 적용한다.
대기 중에는 기존 요청 abort·generation 증가·loading 전환보다 먼저 반환한다.
요청 판정은 ref에 저장한 절대 deadline을 읽고, 렌더용 `retryAt`과 같은 설정/해제 경로에서 갱신한다.
`load`의 identity를 deadline 변화로 바꾸지 않아 [draft-resume effect:101](../../../src/fsd/features/create-project/model/use-repository-picker.ts#L101)를
재시작하거나 draft를 다시 적용하지 않게 한다. 만료 timer는 버튼 상태만 풀고 목록을 자동 요청하지 않는다.

세션 감지는 목록 요청과 구분한다. 현재 연결되지 않은 상태에서 쓰는
`GET /api/github/connection/draft`(flowId 없음) 확인을 연결된 상태의 cooldown 중에도 재사용한다.
이 경로의 `requestIdentity`는 인증·계정 일치를 rate budget보다 먼저 확인하며 GitHub provider를 호출하지 않는다
(`src/app/api/github/request.ts`, `src/app/api/github/connection/draft/route.ts`).
visible focus·pageshow·visibilitychange에서 목록 대신 이 확인을 수행하고, 최신 요청의 `UNAUTHENTICATED`만
기존 `lostSession()`으로 연결한다. 성공·429·503은 목록 대기 오류와 deadline을 덮어쓰지 않는다.
이 확인도 계정 예산을 사용하므로 **대기 중 모든 HTTP 요청이 0회라는 요구가 아니다**.
중복 이벤트의 이전 확인은 abort하고 effect cleanup·현재 flow generation으로 늦은 응답을 무효화한다.
새 endpoint·인증 예외·background polling은 만들지 않는다.

deadline은 Start over로 우회하지 않는다. `lostSession`·해당 userKey의 unmount에서는 ref·state·timer를 정리한다.
라우트의 `NewProjectForm key={userId}`와 기존 요청 세대·선택 무효화·AbortController 계약은 유지한다.

**완료 기준:** 제한 응답 후 세 이벤트가 대기 중 목록 요청을 추가하지 않고, 만료 뒤 명시적 재시도는
정상적으로 한 번 시작한다. 대기 중 세션 확인은 별도로 집계하고, 계정 변경/만료가 401로 정리되는지 확인한다.
세션 유실·선택 무효화·Start over·늦은 응답 폐기와 수동 URL 입력도 유지한다.
서버 제한 우회나 데이터 손실이 입증된 항목은 아니다.

### Should — SRC-CC-002: 공개 목록 조회의 제한시간과 입력 fallback

기여 렌즈: **TypeScript generalist**. 근거 확신도: High.

[public-repositories.ts:15](../../../src/server/github/public-repositories.ts#L15)와
[:29](../../../src/server/github/public-repositories.ts#L29)는 애플리케이션 제한시간 없이 fetch와 본문 읽기를 기다린다.
[repository-picker.server.ts:9](../../../src/fsd/features/create-project/api/repository-picker.server.ts#L9)의
`Promise.all`을 [신규 프로젝트 라우트:11](../../../src/app/(app)/p/new/page.tsx#L11)가 기다린 뒤 폼을 반환한다.

실패가 반환되면 URL 입력과 “Couldn't load your repositories. Paste a URL.” 안내로 이어지지만,
캐시가 없는 공개 조회의 응답이 지연되는 동안에는 이 복구 UI에도 도달하지 못한다.
이는 [New project 문구 계약](../../conventions/product-copy.md#L743)과 연결된 외부 실패 경계 문제다.
네이티브 fetch나 배포 플랫폼의 최종 종료시간, 실제 무한 대기 또는 운영 장애는 확인하지 않았다.

**최소 변경:** `listPublicRepos` 내부에 헤더·본문 읽기 전체를 포함하는 유한한 제한시간을 둔다.
[기존 provider:34](../../../src/server/github/provider.server.ts#L34)와 같은 **10,000ms**의 `AbortSignal.timeout`을
공개 조회의 fetch에 전달해 본문 읽기까지 같은 signal로 제한한다. HTTP 오류는 `http`,
fetch/헤더 단계 거부는 `request`, 현재 `response.json().catch(() => null)`에서 처리하는 본문 거부·중단은
`shape`로 남긴다. 이 작업에서 새 오류 category나 사용자 문구를 만들지 않는다.
정상 파싱·`next.revalidate: 300`은 유지한다. signal 추가는 단일 render의 요청 memoization에서
opt-out할 수 있으나 persistent cache의 revalidate 설정과는 별개다. 현재 해당 공개 조회의 제품 소비자는
picker loader 하나이며, memoization까지 완전히 동일하다고 주장하지 않는다.

폼 fallback은 기존 분기를 보존한다. 공개 목록이 비고 optional connection이 비연결 상태이면 URL 입력과
실패 문구가 처음부터 표시된다. 연결된 상태이면 기존 picker와 **Paste a repository URL** 경로를 유지하고,
사용자가 paste를 선택했을 때 입력 가능해야 한다. authorized 목록까지 있는 경우 실패 문구를 강제로 노출하지 않는다.
새 fetch 추상화·페이지 streaming 재설계·connection DB 조회의 제한시간 변경은 하지 않는다.

**완료 기준:** 헤더 지연과 본문 지연을 각각 중단하고 기존 실패 결과로 연결한다.
adapter의 `repos: []`, `repoLoadFailed: true`와 위 두 connection 상태의 실제 폼 본문까지 검증한다.
기존 [github.test.ts](../../../tests/server/github.test.ts)의 정상/빈 목록·HTTP·shape·request 실패와 민감 정보 비노출도 보존한다.
임의의 고정 sleep이나 실제 GitHub 장애에 의존하지 않는 제어 가능한 fetch double을 사용한다.
`AbortSignal.timeout`을 시험에서 제어 가능한 controller.signal로 대체해 요청된 10,000ms를 확인하고,
헤더 대기와 응답 body stream을 각각 abort한다. mock·stream·listener는 테스트 종료 시 복구·정리한다.

### Consider — SRC-CC-003: 연결 시작과 해제의 진행 상태 구분

기여 렌즈: **Predictability, Readability**. 근거 확신도: High.

[use-repository-picker.ts:147](../../../src/fsd/features/create-project/model/use-repository-picker.ts#L147)의 연결 시작과
[:181](../../../src/fsd/features/create-project/model/use-repository-picker.ts#L181)의 해제는 모두 `busy = true`를 설정한다.
[new-project-form.tsx:144](../../../src/fsd/features/create-project/ui/new-project-form.tsx#L144)가 이를 패널로 전달하고,
[connectionStatusText:10](../../../src/fsd/features/create-project/ui/repository-connection-panel.tsx#L10)는
busy를 항상 “Opening repository connection…”으로 해석한다.
해제 확인 후 응답을 기다리는 동안 연결 시작 안내가 live status에 표시되는 경로다.

**최소 변경:** 기존 `model/github-connection-state.ts`에 내부 type `RepositoryConnectionOperation`을
`"idle" | "opening" | "disconnecting"`으로 두고 훅·폼·패널이 type-only로 사용한다.
controller와 panel props의 독립 `busy`를 `operation`으로 교체하고 버튼 잠금은 `operation !== "idle"`에서 파생한다.
표시 문구는 opening의 기존 “Opening repository connection…”과 disconnecting의
“Disconnecting repository list…”를 선택한다. idle에서 기존 loading → query 오류 → message 순서를 유지한다.
기존 요청 순서, flow generation 검사, 세션 유실·Start over의 정리와 오류 안내 우선순위는 유지한다.
문구를 구현할 때 제품 문구의 New project 절에도 위 두 진행 안내를 함께 기록한다.
이 타입은 slice public API에 새로 공개하지 않는다. 기존 `setBusy(false)`의 세션 유실·Start over·
현재 generation의 finally 경로를 모두 idle 전환으로 대체하며 늦은 finally가 새 작업을 종료하지 않게 한다.

**완료 기준:** 시작·해제 안내가 구별되고 pending 버튼 잠금이 유지된다.
해제 응답을 보류한 실제 컴포넌트 상태와 기존 `repository-connection-panel.test.ts`를 함께 검증한다.
해제 기능 실패나 권한 결함이 입증되지 않았으므로 국소적인 Consider로 둔다.
Readability의 원시 Should 제안은 품질 게이트에서 Consider로 조정했다.

### Consider — SRC-CC-004: 파이프라인 변경 입력의 단일 타입 근거

기여 렌즈: **Cohesion**. 근거 확신도: High.

[change-input.ts:3](../../../src/fsd/features/change-item-pipeline/model/change-input.ts#L3)의 schema,
[change-pipeline-control.tsx:7](../../../src/fsd/features/change-item-pipeline/ui/change-pipeline-control.tsx#L7)의 Action 타입,
[change-item-pipeline.server.ts:9](../../../src/fsd/features/change-item-pipeline/api/change-item-pipeline.server.ts#L9)의
매개변수가 같은 세 필드를 각각 선언한다. 현재 모양은 같지만 schema만 바뀌면 UI·Action 타입은
서로 일치한 채 런타임 검증에서 거절될 수 있다.

**최소 변경:** 기존 schema 파일에서 `z.input<typeof changePipelineInputSchema>`로 `ChangePipelineInput`을 선언하고,
UI Action 타입과 서버 매개변수가 type-only import로 소비한다.
새 파일·slice·공통 계층·클라이언트 런타임 검증은 필요 없다.

**완료 기준:** public API, 인증·인가, 날짜 변환, stale/unknown 처리와 문구가 유지된다.
기존 `tests/server/pipeline-change.test.ts`, UI 시험과 타입 검사로 검증하며
단순 타입 연결을 그대로 복제하는 새 테스트는 만들지 않는다.
기존 UI 시험은 정적 선택지/disabled만 확인하므로 unknown 응답의 브라우저 검증으로 보고하지 않는다.
이 항목은 타입만 연결하므로 동일 compiler options로 변경 전후 UI·Action을 `ts.transpileModule`한
실행 JavaScript가 같은지도 비교한다. unknown·abort·refresh를 포함한 runtime 변경이 생기면 이 항목의 범위를 벗어난다.

### Consider — SRC-CC-005: Billing 시험의 구현 위치·별칭 의존성 축소

기여 렌즈: **Coupling**. 근거 확신도: High. 기존 잔여 결합의 선택적 후속이다.

[plan-matrix.test.ts:40](../../../src/fsd/pages/billing/model/plan-matrix.test.ts#L40)는 다른 slice의
`entities/account-plan/model/plan-label.ts`를 직접 읽는다.
[:50](../../../src/fsd/pages/billing/model/plan-matrix.test.ts#L50) 이후의 import 검사는 원래 symbol 대신
로컬 binding 이름을 수집한다. 공개 API와 동작을 보존한 내부 파일 이동이나 `planLabel as label` 같은
합법적인 별칭 변경에도 Billing 시험을 수정해야 한다.

**최소 변경:** 기존 [frontend-contract-owners.test.mjs:24](../../../scripts/checks/frontend-contract-owners.test.mjs#L24)의
AST/module-resolution 방식을 활용해 소유권·공개 소비를 확인한다.
private filename과 로컬 alias는 고정하지 않되 필수 `planLabel`, Billing 전용 선언·export 유출 금지,
잘못된 소유자·소비 경로, 과거 파일 부재와 표의 값·문구·렌더 검증은 보존한다.
검사기의 현재 `RULES`에 행만 더하면 충분하지 않다. `PlanRow`는 type alias이며 현재 선언 검사에는
변수만 포함된다. `PlanRow`·`planMatrix`·`BILLING_NOTE` 세 이름의 선언과 account-plan의 값/type export를
명시적으로 검사한다. `planLabel`은 account-plan public API에서 실제 owner로 해석하고,
Billing 내부 세 symbol은 같은 slice의 선언으로 해석한다. Billing 전용 API를 제품에 새로 만들지 않는다.
기존 plugin 설치 상수·acceptance label 검사도 그대로 유지한다.
시험 편의를 위한 제품 export는 추가하지 않는다.

**완료 기준:** 공개 API 뒤 내부 이동·alias·줄바꿈은 허용하고, 필수 symbol 누락·잘못된 소유자·
비공개 소비·Billing symbol 유출은 계속 실패시킨다. 기존 검사 스크립트의 메모리 fixture 패턴을 활용한다.

[10/15 완료 기록:223–233](../completed/2026-10-15-fsd-frontend-clean-code-follow-up.md#L223)은 내부 파일 읽기를
의도적으로 남겼다. 이 항목은 당시 완료 판정을 번복하거나 10/22의 별도 계약 소유권 시험 개선을 재등록하는 것이 아니다.

### Consider — SRC-CC-006: 동일한 저장소 이름 정책을 기존 core에 연결

기여 렌즈: **Simplicity**. 판정: 선택적 개선. 근거 확신도: High.

[slug-rule.ts:5](../../../src/server/projects/slug-rule.ts#L5)의 `REPO_SEGMENT`와
[core/repo-url.mjs:1](../../../packages/core/repo-url.mjs#L1)의 `SEGMENT`는 같은 정규식이다.
[slug-rule-sync.test.ts:6](../../../src/server/projects/slug-rule-sync.test.ts#L6)가 같은 정책임을 명시하고 source/flags를 비교한다.
웹 생성 Action과 REST 등록이 각각의 선언을 소비하므로 정책을 바꾸면 두 선언의 동기화를 고려해야 한다.

**최소 변경:** 서버 파일에서 기존 core `SEGMENT`를 `REPO_SEGMENT`라는 기존 이름으로 명시적으로 재수출한다.
서버 public API·REST 소비 경로·거절 조건·문구를 보존한다.
현상 유지는 정상이며 동기화 시험도 있어 변경하지 않아도 된다. 국소 이름·파일 정리는 중복 소유를 없애지 못하지만,
기존 core 연결은 새 추상화·옵션 없이 선언 지점을 하나로 줄일 수 있다.

**완료 기준:** core와 FSD의 repo-url 시험, 서버의 정책/등록 시험과 공개 export 보장을 유지한다.
동기화 시험을 이유 없이 삭제하거나 core 정책·플러그인 복사본의 동작을 바꾸지 않는다.

[10/23 완료 기록:193](../completed/2026-10-23-fsd-frontend-clean-code-review.md#L193)은 당시 slug 개선에서
`REPO_SEGMENT`와 시험을 남기도록 했다. 기존 승인 범위는 지켜졌으며 이번 제안은 그 밖의 선택적 후속이다.

### Consider — SRC-CC-007: 기존 토큰 이름 변경 폼 재사용

기여 렌즈: **Simplicity**. 판정: 선택적 개선. 근거 확신도: High.
기존 [FSD-REV-003](../completed/2026-10-23-fsd-frontend-clean-code-review.md#L205)의 미선택 후보를 현재 소스로 재확인했다.

[rename-token-form.tsx:8](../../../src/fsd/features/manage-token/ui/rename-token-form.tsx#L8)와
[rename-user-token-form.tsx:8](https://github.com/Sangeok/stagekeeper/blob/a6d6933e8b499446683dc07fc77d9448d602b449/src/fsd/features/manage-user-token/ui/rename-user-token-form.tsx#L8)는
함수 이름 외에 동일하다. 필수 입력·pending·서버 거절·예외·reset/refresh·오류 문구도 같다.

**최소 변경:** [user-tokens-page.tsx:49](../../../src/fsd/pages/user-tokens/ui/user-tokens-page.tsx#L49)가
`manage-token` public API의 기존 `RenameTokenForm`을 사용하고 사용자 `rename.bind(null, row.id)`를 그대로 주입한다.
참조가 사라진 중복 UI와 `manage-user-token/index.ts`만 제거한다.
사용자 Server Action·인증 책임·`index.server.ts`는 보존하고 같은 layer의 feature끼리 import하지 않는다.

현상 유지는 정상이며 이익은 국소적이다. 기존 폼 재사용은 새 옵션 없이 동일 UX의 변경 지점을 줄인다.
전체 token feature·Action 통합은 서로 다른 권한 책임까지 결합하므로 권하지 않는다.

**완료 기준:** 세 token scope의 이름 변경·오류·pending·label 갱신·프로젝트 read-only를 보존한다.
[inbox-card-boundary.test.ts:165](../../../tests/server/inbox-card-boundary.test.ts#L165)의 복제 폼 존재 기대를
재사용 폼 존재·복제 폼 부재로 갱신하고, 서버 page·TokenTable의 client 비유입 검사를 유지한다.
삭제 전 정적·동적·public API·시험·스크립트 참조를 다시 확인한다.
현재 `token-names.test.ts`는 발급 이름 설명만 검사하며 이름 변경의 비동기 시험이 아니다.
기존 브라우저 fixture에 `token-rename` 모드를 추가해 재사용 폼의 pending·거절·예외·label prop 갱신을
검증하고, 두 token page 시험으로 scope별 실제 wiring·readonly를 확인한다.
성공 시 폼이 직접 `router.refresh()`를 부르는 것으로 바꾸지 않는다. 현재 성공은 각 Action의
`revalidatePath`와 새 `label` prop에 의존하고, 거절·예외에서만 form.reset/refresh한다.
실제 RSC 응답 보존은 fixture refresh double만으로 입증됐다고 기록하지 않는다.

## Affected Files

다음은 후속 구현 시의 정확한 수정 목록이다. 검증만 하는 소비처는 뒤의 표와 Verification Plan에서 구분한다.
최초 문서 작성 때는 이 파일만 변경했다. 후속 코드 변경은 아래 목록과 Implementation Results에 따른다.

| 분류·ID | 수정·삭제 파일 | 목적·리스크 |
| --- | --- | --- |
| Core 001 | `src/fsd/features/create-project/model/use-repository-picker.ts`; `tests/server/fixtures/github-picker-browser.ts`; `tests/server/fixtures/src-clean-code-acceptance.ts` | deadline·세션 확인·대기/재시도 사례. medium: effect 수명·늦은 응답 정리 |
| Core 002 | `src/server/github/public-repositories.ts`; `tests/server/github.test.ts`; `src/fsd/features/create-project/ui/new-project-form.test.ts` | 10초 deadline·fetch/본문 중단·loader/route 결과와 폼 분기 시험. medium: 오류 분류·캐시 보존 |
| Phase 2 003 | `src/fsd/features/create-project/model/github-connection-state.ts`; `src/fsd/features/create-project/model/use-repository-picker.ts`; `src/fsd/features/create-project/ui/new-project-form.tsx`; `src/fsd/features/create-project/ui/repository-connection-panel.tsx`; `src/fsd/features/create-project/ui/repository-connection-panel.test.ts`; `tests/server/fixtures/github-picker-browser.ts`; `tests/server/fixtures/src-clean-code-acceptance.ts`; `docs/conventions/product-copy.md` | operation·진행 안내·보류 응답 시험. low: 상태 정리·문구 우선순위 |
| Phase 2 004 | `src/fsd/features/change-item-pipeline/model/change-input.ts`; `src/fsd/features/change-item-pipeline/ui/change-pipeline-control.tsx`; `src/fsd/features/change-item-pipeline/api/change-item-pipeline.server.ts` | schema 기반 type-only 입력 연결. low |
| Phase 2 005 | `src/fsd/pages/billing/model/plan-matrix.test.ts`; `scripts/checks/frontend-contract-owners.test.mjs` | 소유권 검사를 resolver 기반으로 연결하고 부정 사례 보존. low |
| Phase 2 006 | `src/server/projects/slug-rule.ts`; `src/server/projects/slug-rule-sync.test.ts` | 명시적 core 재수출·공개 export와 정책 검증. low |
| Phase 2 007 | `src/fsd/pages/user-tokens/ui/user-tokens-page.tsx`; `src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts`; `src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts`; `tests/server/inbox-card-boundary.test.ts`; `tests/server/fixtures/src-clean-code-browser.tsx`; `tests/server/fixtures/src-clean-code-acceptance.ts`; 삭제: `src/fsd/features/manage-user-token/ui/rename-user-token-form.tsx`, `src/fsd/features/manage-user-token/index.ts` | 기존 폼 재사용·scope별 동작·manifest 시험. low: Action·서버 page 유지 |

002의 loader/route 연결 시험은 기존 `tests/server/github.test.ts`에서
`tests/server/fixtures/load-module.ts`로 cookies·auth·header user·서버 API를 주입하여 추가한다.
실제 `loadRepositoryPickerState`와 `/p/new`의 결과를 읽되 DB·외부 GitHub에는 접속하지 않는다.
기존 helper는 그대로 사용하며 시험을 위해 제품 export를 넓히지 않는다.

### 유지할 symbol과 이동 후 소비 경로

| 항목 | 현재 owner → 공개 경로 | 변경 후 소비·검증 목적지 |
| --- | --- | --- |
| 001의 auth probe | `src/app/api/github/request.ts:requestIdentity` → `src/app/api/github/connection/draft/route.ts:GET` | 기존 `repositoryPickerRequest`로 GET 호출; 서버 route·인증 순서·budget은 수정하지 않음. `tests/server/github-connection.test.ts`와 브라우저 fixture의 401/429 분기 |
| 002 `listPublicRepos` | `src/server/github/public-repositories.ts` → `src/server/github/api.server.ts` | `src/fsd/features/create-project/api/repository-picker.server.ts:loadRepositoryPickerState` → `src/fsd/features/create-project/index.server.ts` → `src/app/(app)/p/new/page.tsx`. 공개 경로·loader·route 유지; 위 VM 연결 시험과 실제 폼 본문 |
| 003 operation | 기존 독립 busy를 같은 slice의 `RepositoryConnectionOperation`으로 표현 | `model/github-connection-state.ts`에서 훅·패널이 type-only 소비, 폼은 controller 값 전달. `src/fsd/features/create-project/index.ts` 확장 없음 |
| 004 입력 | `model/change-input.ts:changePipelineInputSchema` → 새 내부 `ChangePipelineInput` | UI·Action에서 `../model/change-input` type import. 기존 `src/fsd/features/change-item-pipeline/index.ts:ChangePipelineAction`·`index.server.ts:changeItemPipeline` 유지; `src/fsd/pages/board-item/ui/board-item-page.tsx`와 `src/app/(app)/p/[slug]/items/[key]/page.tsx` 연결 유지 |
| 005 Billing 계약 | `src/fsd/entities/account-plan/model/plan-label.ts` → `src/fsd/entities/account-plan/index.ts:planLabel`; `src/fsd/pages/billing/model/plan-matrix.ts:PlanRow, planMatrix, BILLING_NOTE` | `src/fsd/pages/billing/ui/billing-page.tsx`의 entity 공개 소비·slice 내부 소비 유지. 선언 파일명 대신 실제 symbol owner를 검사 |
| 006 저장소 정책 | `packages/core/repo-url.mjs:SEGMENT` → `src/server/projects/slug-rule.ts:REPO_SEGMENT` → `src/server/projects/api.ts` | `src/server/rest/project-registration.ts`의 import 유지. 웹 `src/fsd/features/create-project/api/create-project.server.ts` → `model/repo-url.ts` → core 경로도 유지 |
| 007 이름 변경 UI | `src/fsd/features/manage-token/ui/rename-token-form.tsx` → `src/fsd/features/manage-token/index.ts:RenameTokenForm` | user page가 이 공개 export로 전환. project page의 agent/owner 소비는 그대로. `RenameUserTokenForm` export·소비·생성 client module은 사라져야 함 |
| 007 사용자 Action | `src/fsd/features/manage-user-token/api/manage-user-token.server.ts` → `src/fsd/features/manage-user-token/index.server.ts` | `src/app/(app)/settings/tokens/page.tsx`의 issue/revoke/rename binding 유지. `src/app/(app)/p/[slug]/tokens/page.tsx`의 agent/owner binding도 그대로 |

### 파일 작업 사전 확인

삭제 대상 007의 두 파일과 모든 수정 파일·상위 디렉터리는 현재 존재한다. 새 제품 파일이나 경로 이동은 없다.
`RenameTokenForm`과 공개 export도 이미 있어 신규 대상 충돌이 없다.
기존 사용자 폼의 제품 소비는 user page 하나이고, 알려진 파일명 검증은 inbox client manifest 시험이다.
실행 직전 같은 symbol·파일명으로 `src`, `tests`, `scripts`의 정적·동적·재수출 참조를 다시 열거한다.
삭제 후 두 파일·`RenameUserTokenForm` 소비의 부재와 기존 `RenameTokenForm`·사용자 서버 API의 존재를 함께 확인한다.
과거 문서의 이력 언급은 삭제 대상 참조가 아니다.

## Runtime Behavior Matrix

| ID·시작/입력 | 제안된 전이·실패/복구 | 정리·보존 및 검증 |
| --- | --- | --- |
| 001 연결됨, 목록 429 + Retry-After | deadline 저장; 수동/자동 load는 만료 전 무변경 반환. 만료는 버튼만 해제; 다음 명시적 load 1회 | 기존 request abort·generation보다 먼저 차단. cursor·query·대기 문구 보존. 늦게 실행된 timer에서도 절대 deadline을 판정 |
| 001 대기 중 visible 이벤트 | 목록 대신 기존 draft GET으로 세션 확인. 401이면 parent가 세션 경고로 교체; 2xx/429/503은 대기 상태 유지 | 확인 요청 abort·live/flow guard; Start over로 deadline 우회 금지; userKey unmount·세션 유실 시 모든 timer/request 정리. 새 polling 없음 |
| 002 cache miss·헤더 지연 | 10초 signal로 중단 → request 실패 → loader의 빈 공개 목록·실패 flag | 기존 HTTP/shape/request 구분과 민감 로그 비노출. 정상 응답·300초 revalidate 설정 유지 |
| 002 헤더 성공·본문 지연 | 같은 signal로 body 중단 → 기존 shape 실패 | 빈 정상 목록과 실패를 구별. 비연결은 URL 입력·실패 문구, 연결 상태는 기존 picker·paste 경로. DB 조회 장애 전체를 해결한다는 주장 없음 |
| 003 start/disconnect pending | idle→opening/disconnecting→현재 generation의 성공/거절/예외 후 idle | 지연된 finally가 새 작업을 해제하지 않음. Start over·세션 유실은 idle; 기존 query/message 우선순위와 버튼 잠금 유지 |
| 004 변경 Action | 같은 runtime schema·auth·날짜 변환·stale 처리, 입력 타입만 연결 | UI의 unknown 재제출 차단 유지. 새 Action·client runtime schema 생성 없음 |
| 005·006 | 제품 동작 전이 없음. 소유권 시험과 동일 정규식의 선언 연결만 변경 | Billing 값/문구, REST 거절 body·웹 입력 정책 유지. 검사에서 alias·합법 export를 허용하고 금지 항목은 전부 거부 |
| 007 rename 제출 | 같은 label/action props. 성공은 서버 revalidation과 label prop 반영; 거절/예외는 reset·refresh | key={label}와 pending/required/error 유지. refresh가 모든 client state를 초기화한다고 가정하지 않음. scope별 권한은 서버 Action에 유지 |

React state 보존·Next fetch의 signal/revalidate·Server Function 직렬화는 로컬 Next 문서
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md`,
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`,
`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`와 실제 소비 경로로 대조했다.
선언 버전 설치 후 같은 계약을 재확인하는 것은 구현 전제이며 현재 설치본으로 16.4.2 검증 완료를 주장하지 않는다.

## Final Artifact Map

| 최종 표면 | 실제 소유·우선순위/본문 의존성 | 변경 후 검증 목적지 |
| --- | --- | --- |
| `/p/new` 폼·연결 상태 | route의 auth/user → picker loader → `NewProjectForm`의 connection/목록/실패 flag → panel의 operation/query/message. 제품 문구 MD는 관리 계약이며 TSX를 runtime에서 덮어쓰지 않음 | loader/route VM 결과와 실제 폼 HTML; 브라우저의 URL 입력·status 문구·disabled 상태·요청 payload/횟수 |
| 브라우저 fixture bundle·결과 | `scripts/rehearsals/rehearse-src-clean-code.ts --ui-only`가 `tests/server/fixtures/src-clean-code-browser.tsx`를 memory bundle로 만듦. GitHub mock과 acceptance runner를 import | `/fixture?mode=copy&autorun`의 `#acceptance-results` 및 `/results` JSON 각 case의 status/error. HTML 응답 200만으로 통과 판정하지 않음 |
| `/billing` 표 | `src/app/(app)/billing/page.tsx` → Billing page → 로컬 matrix·account-plan label·core LIMITS | `billing-page.test.ts`의 실제 행 순서·값·문구, owner resolver의 public symbol·금지 export |
| `/settings/tokens`, `/p/[slug]/tokens` 이름 폼 | route별 원래 Server Action 참조 → user/project page → server `TokenTable` renderName → 동일 client `RenameTokenForm` | 두 page의 실제 scope별 HTML/readonly, token-rename fixture의 state·payload. 성공 revalidation은 기존 Action 소스/서버 시험과 실제 label prop 갱신으로 확인 |
| Next client/action/route manifests | `scripts/build.mjs`의 Prisma generate → 현재 source의 fresh Next build. 과거 `.next`는 증거로 쓰지 않음 | `.next/server/app/**/page_client-reference-manifest.js`를 기존 VM 검사로 파싱: 재사용 폼 있음·복제 폼 없음·TokenTable/서버 page 비유입. `.next/server/server-reference-manifest.json`·`app-paths-manifest.json`은 기존 구조 파서로 Action/route 목록 확인 |

폰트·CSS·DB schema·토큰/등록 protocol은 기존 body 의존성이며 변경하지 않는다. 생성 Prisma는 build의 입력 전제이고
수정 산출물이 아니다. 새로운 자산·환경 변수·migration·외부 승인 절차를 추가하지 않는다.

## Safety Analysis

- 앱 진입점·정적 import/export·public API와 실제 소비 경로를 대조했다. 새 라우트나 공개 endpoint는 필요 없다.
- 001·003은 현재 훅 안에서 수정한다. request/flow generation, 취소·restore acknowledgement와 세션 변경 처리는
  필요한 계약이므로 상태 수나 파일 길이만을 이유로 제거하지 않는다.
- 002는 외부 읽기의 종료 경계만 다룬다. 인증·credential·DB transaction·목록 공개 범위를 바꾸지 않는다.
- 004는 같은 slice 내부의 type-only 참조다. 서버 모듈이나 Zod runtime을 UI에 새로 연결하지 않는다.
- 005는 기존 검출 보장을 유지하면서 구현 경로 결합을 줄인다. 검사 삭제로 통과시키지 않는다.
- 006은 이미 존재하는 순수 core 정책을 소비한다. core 자체의 정책 변경이나 plugin 배포 복사본 편집은 필요 없다.
- 007은 page에서 기존 feature를 조합한다. 사용자·프로젝트·owner Action과 권한 판단은 각 소유자에 남긴다.
- 폰트·라이선스·정적 자산 URL·ambient declaration은 채택 항목의 변경 대상이 아니다.
  삭제와 runtime/client manifest의 최종 안전성은 구현 시 최신 참조와 fresh build로 다시 검증한다.

## Approval

전체 문서를 바탕으로 실제 수정하라는 후속 요청과 범위 확인에 따라 001–007을 구현한다.
이 문서의 승인 기록은 현재 작업에만 적용하며 과거 완료 제안서의 기록을 소급 변경하지 않는다.

## Execution Plan

1. 승인된 ID를 확인하고 위 수정·유지 목록을 최신 소스에 대조한다. lockfile 설치와 Prisma 생성으로 검증 환경을 준비한다.
2. Core가 선택되면 001의 deadline·세션 확인/cleanup과 002의 10초 헤더/본문 제한·오류 분류·폼 분기를 구현한다.
3. Phase 2는 선택 ID만 실행한다. 003의 operation 전파, 004의 type-only provenance, 005의 세 Billing symbol 검출을 각각 완료한다.
4. 006은 공개 이름을 유지한 core 재수출만 수행한다. 007은 page 소비를 먼저 전환한 뒤 두 중복 파일을 삭제하고 fixture·manifest 기대를 갱신한다.
5. 아래 ID별 검증과 공통 검증, 해당하는 fresh manifest 검사를 수행한다. 브라우저 fixture를 Finish로 정리하고 결과를 기록한다.
6. Definition of Done에서 선택 범위만 완료 처리한다. 미선택 Phase 2·운영 인수·병합을 완료했다고 기록하지 않는다.

## Verification Plan

후속 구현 전 lockfile에 맞는 의존성과 `npm run db:generate`로 생성 계약을 준비한다.
Next.js를 변경·소비하는 코드는 그때 설치된 버전의 `node_modules/next/dist/docs/`를 다시 읽는다.
코드 변경 후 공통 명령은 다음과 같다.

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run lint
npm run check
npm run test:web
npm run test:server
npm test
npm run build
```

`npm run check`는 문서·typegen·TypeScript·스크립트 검증도 포함한다.
Core의 GitHub 경계, 004의 Action 경계, 007의 client 경계를 검사할 때 fresh build 이후 다음 명령을 사용한다.
해당 ID를 선택하지 않은 flag는 생략할 수 있다. 아래 세 flag를 모두 지정해도 저장소의 기존 보장을 검사하는 것이며
미선택 Phase 2의 구현을 요구하지 않는다. shell은 저장소 환경의 zsh/POSIX 기준이다.

```bash
GITHUB_CHECK_ACTION_MANIFEST=true RDC_CHECK_ACTION_MANIFEST=true SRC_CHECK_INBOX_MANIFEST=true npm run test:server
```

| ID | 핵심 검증 |
| --- | --- |
| 001 | `github-picker-browser.ts`의 429/Retry-After mode와 `src-clean-code-acceptance.ts` 사례: 만료 전 목록 요청 0회·세션 probe 별도, 세 이벤트 각각·연속 이벤트, 만료 후 명시적 재시도, 401 세션 유실·429/503 보존·Start over·unmount 뒤 늦은 응답 |
| 002 | `tests/server/github.test.ts`: 헤더/본문의 제어 가능한 abort·10,000ms·http/request/shape·기존 파싱·revalidate 옵션·loader/route props. `new-project-form.test.ts`: 비연결 실패 본문·빈 정상 목록과 구별·연결 상태의 paste 경로 |
| 003 | `repository-connection-panel.test.ts`의 세 operation·오류 우선순위; GitHub fixture/acceptance의 보류한 start/disconnect·버튼 잠금·세션 유실·Start over·늦은 finally |
| 004 | 타입 검사와 `tests/server/pipeline-change.test.ts`의 payload 무쓰기·권한·stale·날짜 변환, `src/fsd/features/change-item-pipeline/ui/change-pipeline-control.test.ts`의 선택/disabled. UI·Action의 변경 전후 transpile 출력 동일성으로 unknown을 포함한 runtime 불변 확인 |
| 005 | 내부 파일 이동·alias 허용, 소유권·필수 export·금지 export·비공개 소비의 거부 fixture, Billing 값·렌더 |
| 006 | `packages/core/repo-url.test.mjs`, `src/fsd/features/create-project/model/repo-url.test.ts`, `src/server/projects/slug-rule-sync.test.ts`, `tests/server/project-registration.test.ts`, `tests/server/project-connection-bindings.test.ts`, `tests/server/server-public-api.test.ts`: 허용/거절·공개 REPO_SEGMENT·웹/REST 결과 보존 |
| 007 | `user-tokens-page.test.ts`·`project-tokens-page.test.ts`의 세 scope·readonly; `src-clean-code-browser.tsx`의 새 token-rename mode와 `src-clean-code-acceptance.ts`의 성공/거절/예외/pending/label 갱신; `inbox-card-boundary.test.ts`의 fresh client manifest |

001·003·007의 브라우저 검증은 기존 fixture를 다음과 같이 실행한다. 두 실행은 같은 port를 쓰므로 순차 실행한다.

```bash
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only
```

`http://127.0.0.1:55452/fixture?mode=copy&autorun`에서 각 추가 사례와 기존 private/session/restore 사례를 확인하고,
`http://127.0.0.1:55452/results` JSON을 보존한다. **Finish** 버튼으로 React root·fetch·sessionStorage·
visibility/clipboard/console 대체·보류 응답·listener를 먼저 정리하고 `/finish`로 서버 종료를 확인한다.
그 뒤 같은 suite를 development fixture에서도 실행한다.

```bash
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only --fixture-development
```

현재 fixture에는 cooldown·보류한 disconnect·token rename 사례가 없다. 해당 ID 구현과 함께 위 명시 파일에 추가한다.
timer/AbortSignal/fetch를 대체할 때 원본을 저장하고 case 종료·unmount·Finish에서 복원한다.
타이머 제어는 production 훅에 시험 전용 export를 추가하지 않고 fixture 안에서 수행한다.
최소 한 번은 실제 창 focus/visibility 전환으로도 확인하며 synthetic 이벤트 결과와 구분한다.
기존 suite의 baseline 실패가 있다면 동일 환경 변경 전후 결과를 보존하고 신규 실패와 분리한다.
이 UI-only 실행은 실제 GitHub·DB·Next RSC 네트워크 인수의 대체 증거가 아니다.

제품 테스트는 실제 소유자의 `src/fsd`·`src/server`에 두고 server-only/framework 조합 시험은
기존 책임별 `tests/` 경로와 실행 명령을 따른다. `src/`·`src/app/` 바로 아래 시험을 추가하지 않는다.
새 실패가 나오면 같은 환경의 변경 전 기준선과 비교하고, 환경 skip·미실행 인수를 통과로 기록하지 않는다.

### Definition of Done

- 승인된 Core/Phase 2 ID만 수정했고 위 inventory 밖의 제품 동작·권한·schema·배포 범위를 확장하지 않았다.
- 선택 ID의 Runtime Behavior Matrix와 Final Artifact Map을 **최종 목적지**에서 확인했다.
- Core는 cooldown 중 세션 감지, header/body deadline, 기존 오류/폼 분기, 요청·timer·fixture cleanup을 모두 검증했다.
- 003–007은 선택했을 때만 해당 타입/문구·symbol 소유권·정책·삭제 후 부재/재사용 존재 조건을 만족한다.
- fresh build 이후 필요한 manifest flag 검사를 실제 실행했으며 skip을 통과로 세지 않았다.
- 공통 검사·관련 브라우저 결과와 기존 실패·환경 제한을 기록했다. 문서 clean pass와 제품 검증 완료를 구분한다.

## Verification Results

### 최초 클린 코드 검토의 실행 기록

아래 수치와 원시 렌즈 기록은 이 문서의 최초 작성 시점 결과다. 이후 문서 대조의 결과로 덮어쓰지 않는다.

| 명령·확인 | 결과 | 의미 |
| --- | --- | --- |
| `npm run verify:fsd` | Pass | 현재 FSD 구조 기준선 |
| `npm run verify:server` | Pass | 현재 서버 모듈 구조 기준선 |
| `npm run test:architecture` | Pass — 148 passed, 2 skipped, 0 failed | Windows LPAC 관련 2건은 현재 환경에서 skip |
| `npm run docs:check` | Pass — 기존 161 Markdown, 779 상대 링크, 51 test reports | 새 미추적 제안서는 아래 별도 검사에 포함 |
| 새 제안서를 포함한 `inspectDocs`·front matter 검사 | Pass — 162 Markdown, 813 상대 링크, 51 test reports | 미추적 제안서까지 포함; 오류 0개, 상태·승인 metadata·related 경로 확인 |
| 새 파일 whitespace·`git diff --exit-code -- src` | Pass | whitespace 이상 없음; 소스 변경 없음; 작업 트리 변경은 제안서 1개 |

**Review-mode substantiation:** 품질 게이트가 요청한 pending-verification은 없어 별도 재현 검증이 필요하지 않았다.
위 구조 기준선과 소스 대조는 제안 동작을 브라우저에서 재현하거나 수정 결과를 검증한 것이 아니다.

**최초 문서 작업의 구현 회귀:** 당시 제품 코드를 바꾸지 않아 lint·typecheck·web/server 전체 시험·build,
브라우저·실제 DB·외부 GitHub 검증은 실행하지 않았다. 후속 구현 결과는 다음 절에 별도로 기록한다.

### 품질 게이트 추적

| Raw ID | 렌즈 | 제안 → 최종 | 처분 | 정규 ID |
| --- | --- | --- | --- | --- |
| COH-001 | Cohesion | Consider → Consider | accept | SRC-CC-004 |
| CPL-001 | Coupling | Consider → Consider | accept | SRC-CC-005 |
| PRE-001 | Predictability | Should → Should | accept | SRC-CC-001 |
| PRE-002 | Predictability | Consider → Consider | accept | SRC-CC-003 |
| READ-001 | Readability | Should → Consider | merge-accept(SRC-CC-003) | SRC-CC-003 |
| SIM-001 | Simplicity | Consider → Consider | accept | SRC-CC-006 |
| SIM-002 | Simplicity | Consider → Consider | accept | SRC-CC-007 |
| TS-001 | TypeScript generalist | Should → Should | accept | SRC-CC-002 |

003의 중복은 동일한 상태 원인·소비 경로·최소 수정으로 병합했다. 두 렌즈의 기여를 보존하되
동의 수로 심각도를 높이지 않았다. 스킬 내부 규칙의 HARD/DEFAULT/OPTIONAL이나 단순성 판정도
Must/Should/Consider에 자동 대응시키지 않았다.

## Implementation Results

### 구현 범위와 기준

- 사용자 요청에 따라 001–007을 모두 선택했다. 기존 `harness/src-clean-code-review-20261027` 작업을 이어서 수정했다.
- 구현 검증 당시 소스는 기준 `a6d6933e8b499446683dc07fc77d9448d602b449`에 아래 코드 변경을 더한 상태였다.
  `git diff --binary -- src scripts tests docs/conventions/product-copy.md`의 SHA-256은
  `e4d71ed28378d71e93882ca5d24b797b01acb60c38cb2afffd96d1ca56d0e995`다. 커밋 전 기준의 식별자이며 이 문서 자체는 포함하지 않는다.
- `npm ci`로 lockfile의 Next.js 16.4.2를 설치하고 `npm run db:generate`로 Prisma 7.10.1 계약을 생성했다.
  React 19.2.8·TypeScript 5.9.3·Node 26.4.0에서 검증했다. dependency/lockfile·Next 설정은 변경하지 않았다.

| ID | 구현 결과 | 직접 확인 |
| --- | --- | --- |
| 001 | 안정적인 deadline ref와 렌더 상태를 함께 갱신하고 load 시작 전에 차단. visible 이벤트의 세션 probe와 늦은 응답/만료 timer guard 유지 | 대기·세 이벤트·probe 429/503·401·Start over·지연 timer·unmount 사례 통과 |
| 002 | 공개 조회의 헤더·본문에 동일한 10초 signal 적용 | 헤더 request 실패·본문 shape 실패, revalidate 300, 실제 loader/route에서 폼 복구 props 전달 시험 통과 |
| 003 | 내부 operation 타입과 opening/disconnecting 안내, busy 파생 | 보류한 요청·버튼 잠금·오래된 finally·세션 유실 사례와 정적 문구 시험 통과 |
| 004 | schema에서 도출한 입력 타입을 UI·Action이 type-only로 공유 | 변경 전후 두 실행 JavaScript 출력 동일, 기존 Action·UI 시험 통과 |
| 005 | Billing의 파일명/로컬 alias 검사를 실제 symbol owner 검사로 이동 | 이동·alias·추가 export 허용, 세 symbol의 값/type 유출·clone·잘못된 owner·private import·wildcard 거부. 다른 도메인의 동명 PlanRow 컴포넌트는 허용 |
| 006 | 기존 core SEGMENT를 REPO_SEGMENT 이름으로 재수출 | 기존 core/FSD/서버 정책·등록·공개 API 시험 통과 |
| 007 | user page가 기존 RenameTokenForm을 소비하고 중복 UI·client index 삭제 | 세 scope의 이름 변경 9개 브라우저 사례, page HTML/readonly, fresh client manifest의 기존 폼 존재·복제 폼 부재 통과 |

### 자동 검증

| 명령·확인 | 최종 결과 |
| --- | --- |
| `npm run verify:fsd`, `npm run verify:server` | Pass |
| `npm run test:architecture` | 167 pass, 2 platform skip, 0 fail |
| `npm run check` | lint·docs·typegen·TypeScript 통과, scripts 214 pass·2 platform skip·0 fail. 기존 plugin `_key` unused 경고 1개는 유지 |
| `npm run test:web` | 780 pass, 0 fail |
| `npm run test:server` | 158 pass, 2 manifest opt-in skip, 0 fail |
| `npm test` | 531 pass, 20 environment/platform skip, 0 fail |
| `npm run build` | 빈 캐시의 최종 Turbopack production build Pass, 정적 페이지 33개 생성 |
| fresh build 후 세 manifest flag를 지정한 `npm run test:server` | 168 pass, 0 skip, 0 fail |
| 004 변경 전후 동일 compiler options의 `ts.transpileModule` 출력 비교 | UI·Action 모두 동일 |

초기 기본 빌드는 샌드박스의 CSS worker 포트 제한으로 실패했고 승인된 재실행에도 같은 캐시 오류가 남았다.
검증용 `next build --webpack`은 성공했지만 그 manifest는 source 경로에서 `src/`를 생략하므로 기존
Turbopack용 Action manifest 검사 8건과 맞지 않았다. 검사기를 완화하거나 저장소 설정을 바꾸지 않았다.
Webpack 산출물을 임시 보존한 뒤 빈 `.next`에서 기본 `npm run build`를 다시 실행했고,
그 **최종 Turbopack 산출물**로 원래 manifest 검사 전체가 통과했다. 이전 실패를 최종 통과로 혼동하지 않는다.

### 브라우저 회귀와 제한

| 실행 | 변경 전 | 변경 후 | 신규 19개 사례 | 기존 사례의 신규 실패 |
| --- | --- | --- | --- | --- |
| production fixture | 61 pass, 13 fail / 74 | 82 pass, 11 fail / 93 | 19 pass | 0 |
| development fixture | 63 pass, 11 fail / 74 | 82 pass, 11 fail / 93 | 19 pass | 0 |

신규 사례는 세 scope 이름 변경의 성공·거절·응답 미확인 9건과 저장소 cooldown/operation 10건이다.
변경 전 production에서 발생한 owner 발급 2건의 추가 실패는 변경 후 재현되지 않았으며 이번 수정의 해결 항목으로 주장하지 않는다.
공통으로 남은 11건은 기존 pipeline page의 permission/default/pending/project switch와 zero-gate fixture 실패다.
수정하지 않은 기존 파이프라인 UI·fixture의 실패이며 source 변경으로 해결하거나 시험을 건너뛰지 않았다.

화면 버튼으로도 대기 중 Reload 비활성·대기 안내 보존, 만료 후 명시적 목록 요청 1회 증가와 정상 목록 복귀를 확인했다.
focus/pageshow/visibilitychange의 **합성 이벤트** 회귀는 통과했다. 실제 창 활성화·탭 전환에 따른 native 이벤트는
연결된 브라우저가 visibility 제어를 제공하지 않고 native 앱이 다른 사용자 창을 가리켜 검증을 완료하지 못했다.
그 시도에서 요청 수가 변하지 않았다는 사실을 native 이벤트 성공 증거로 사용하지 않는다.
따라서 계획의 실제 창 전환 확인 1건은 남은 수동 검증이며, 이 이유로 문서는 `pending/approved`에 유지한다.

모든 실행 후 Finish로 root·fetch·clock/timer·sessionStorage·보류 응답을 정리하고 로컬 fixture 서버 종료를 확인했다.
실제 GitHub 승인·폐기, 운영 DB, 실제 Next RSC 네트워크 인수, 배포는 수행하지 않았다.
최초 구현 검증 시점에는 커밋·push·PR·병합을 실행하지 않았다. 후속 요청으로 commit·push·dev 대상 PR을 진행한다.
브랜치는 PR 승인만으로 삭제하지 않고, 최종 커밋의 `check` 통과와 `dev` 병합을 확인한 뒤 저장소 cleanup 절차로 정리한다.

## Risks and Rollback

잔여 리스크와 검토 한계:

- 001–003은 로컬 브라우저 fixture의 비동기 회귀를 통과했다. native 창 전환과 운영 발생 빈도는 미검증이다.
- 실제 창 전환 1건과 기존 파이프라인 fixture 실패 11건은 위 결과에서 구분해 남겼다.
- 002의 10초 제한은 기존 provider와 같지만 느린 정상 응답도 실패로 처리할 수 있다.
  헤더·본문 중단과 기존 캐시 설정을 검증한다. 공개 조회 외 DB 대기나 모든 페이지 지연을 해결하는 변경은 아니다.
- 최초 검토의 Next 버전 차이와 Prisma 생성 지연은 해소했다. 최종 타입 검사와 기본 production build는 통과했다.
- 구조 검사 통과는 모든 본문·DB 원자성·인증 흐름의 완전한 검증이 아니다. 선택 항목에 필요한 인수만 추가한다.
- 기존 선택적 후속 005–007은 현상 유지도 가능하다. 서로 다른 token 권한이나 독립적인 정책까지 통합하지 않는다.

롤백은 선택 항목별 구현 커밋을 되돌리는 범위로 유지한다. DB schema·migration 변경은 제안하지 않는다.
007의 UI 삭제를 되돌릴 때는 page import·client index·manifest 시험 기대도 함께 복구한다.
005의 검증 변경은 기존 검출 보장을 확인할 수 있는 fixture를 함께 보존한다.

## Completion or Closure Notes

001–007 코드 구현과 자동 검증·로컬 브라우저 회귀는 완료했다. 실제 native 창 전환 확인은 도구 제약으로 남아
`pending/approved`를 유지한다. 해당 수동 검증까지 닫거나 실행 범위를 명시적으로 조정한 뒤 완료 기록으로 이동한다.
후속 요청에 따라 커밋·PR로 인계한다. 병합 전에는 작업 브랜치를 보존하며 main 승격·배포는 수행하지 않는다.

## Reconciliation Notes

2026-10-27 `reconciling-proposals-with-codebase` 대조에서는 **처음부터 수정할 점이 없었던 것이 아니다**.
일곱 finding의 근거·심각도는 유지했으며 실행 지침의 다음 누락을 보완했다.

| 초기 누락 | 반영한 해소 내용 |
| --- | --- |
| cooldown 차단과 세션 감지를 동시에 보존할 경로가 불명확 | 기존 draft GET의 인증 우선순위로 probe 경로·401/429/503·cleanup·예산 경계를 명시 |
| timeout 시간·본문 중단 category·연결 상태별 fallback이 미정 | 기존 provider와 같은 10초, 현재 request/shape 분류·memoization 차이·두 폼 분기 확정 |
| 선택 범위와 관련 파일/시험이 포괄적으로 표현됨 | Core/Phase 2·정확한 수정/유지 파일·symbol provenance·삭제 preflight로 확장 |
| fixture가 이미 비동기/rename 사례를 검증하는 것처럼 읽힐 수 있음 | 실제 없는 사례를 신규 추가 작업으로 명시; runner·결과 JSON·두 빌드 mode·Finish 정리 경로 지정 |
| Billing type alias·이동 후 export 검출, 최종 generated output 검증이 불명확 | 세 Billing symbol과 값/type export, client/action/route manifests의 구조·본문·부재/존재 기준 명시 |
| 004의 기존 정적 UI 시험과 비동기 unknown 검증을 구분하지 않음 | 정적 시험의 범위를 한정하고 타입만 바뀌었음을 변경 전후 transpile 출력으로 확인하도록 수정 |

검토 프로필은 외부 요청·세션 경계와 생성 client/action manifest를 포함하므로 High-Risk다.
이는 코드 결함의 심각도를 올리는 분류가 아니다. 상세 검증의 기준 source bundle은 이 문서,
현재 아키텍처·문구·명시한 fixture/검사 코드와 Next 내장 문서다. 과거 완료 제안서는 이력 대조 자료이며
그 전체 실행 계획을 현재 구현에 위임하지 않는다.
수정 후 INV-1–INV-6·coverage stability와 INV-7을 다시 통과해야 clean pass라고 할 수 있으며,
그 최종 no-edit 결과·소스 식별자·재검증 anchor는 응답에 남긴다. 문서의 승인 metadata는 변경하지 않는다.

## Review Checklist

- [x] 상태·위치·승인 metadata를 현재 요청 범위와 일치시켰다.
- [x] 여섯 렌즈와 독립 품질 게이트를 수행하고 원시 ID·병합·심각도 조정을 기록했다.
- [x] 정적 근거, 영향, 최소 변경, 기존 계약과 선택적 후속 이력을 구분했다.
- [x] 범위·영향 파일·검증 계획·검토 한계·롤백 방법을 기록했다.
- [x] 구현 승인과 제품 검증 통과를 문서 작성 결과로 대신하지 않았다.
