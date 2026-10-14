---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-14"
approved-by: "user:Sangeok"
approved-at: "2026-10-14"
approval-scope: "FSD-001~008 실제 코드 수정 및 문서에 명시된 검증 — 대화의 구현 요청"
completed-at: "2026-10-15"
verification-summary: "FSD-001~008 구현 완료; check·web 606·core/plugin·fresh manifest 62·DB 통합·브라우저 production/development 각 42건 및 실제 응답 유실 인수 통과"
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/test-reports/completed/2026-10-15-fsd-clean-code-acceptance.md"
---

# src/fsd 프런트엔드 클린코드 검증 및 개선 제안

## Summary

`frontend-clean-code-orchestrator`의 독립적인 다섯 관점과 중립 품질 게이트로 `src/fsd` 전체를 검토했다.
우선 수정할 문제는 **보드의 Team 상태가 실행 중인 항목을 대기로 표시하는 계산 오류**다.
최종 채택은 **8건: Must 1건·Should 5건·Consider 2건**이다.
입력 계약의 중복 선언, Reopen 오류의 전파 범위, 토큰 발급 결과 미확인 처리, Documents의 목록 식별성,
클라이언트 선택기의 키보드 탐색 범위도 개선 대상으로 채택했다.
대규모 폴더 재편보다 현재 slice 안에서 작은 변경으로 해결하는 방향을 제안한다.

이 문서는 검토·제안과 그 구현 완료 기록이다. FSD-001~008을 `harness/fsd-clean-code` 작업 트리에 적용했고 검증을 마쳤다.
최종 증거와 실행 범위는 [인수 보고서](../../test-reports/completed/2026-10-15-fsd-clean-code-acceptance.md)에 보존한다.
아래 문제 근거·계획·preflight는 구현 전 기록이며, 완료 여부의 기준은 front matter·Definition of Done·Completion Notes다.
2026-10-14 정합성 검토에서 지적 8건은 유지하고, 스키마 이동과 기존 시험의 충돌·복구 흐름·변경 파일·검증 도착점의 누락을 보완했다.

## Goal

- 실제 실행 상태와 화면의 상태 표시를 일치시킨다.
- 요청 결과를 받지 못한 경우에도 사용자가 현재 상태를 확인하고 복구할 수 있게 한다.
- 입력 계약과 목록 식별자를 타입으로 연결해 변경 누락 위험을 줄인다.
- 단일 화면의 모델·테스트 소유권과 불필요한 테스트 결합을 정리한다.

## Proposal Size

`proposal-size: standard` — 후속 구현은 5개 이상 파일, 액션 입력 타입, 토큰 발급 안내 및 React 오류 처리에 걸친다.
DB schema 변경, 서버 권한 정책 변경, 새 의존성 추가는 제안하지 않는다.

## Current State

최초 클린코드 검토 기준은 **2026-10-14, HEAD `320590de6a084dc8a277618277470f6d55741b41`**, 당시 시작 시 변경 사항이 없는 `harness/public-docs` 작업 트리다.
행 번호는 이 기준의 소스를 가리킨다. 기존 공개 문서 제안서의 향후 변경은 구현된 사실로 취급하지 않았다.
후속 정합성 검토도 같은 HEAD에서 수행했으며 변경 대상은 이 미추적 제안서 하나다. 아래 시험 통과 기록은 최초 검토의 기록이며 정합성 검토에서 재실행한 결과로 바꾸지 않는다.

| 영역 | 파일 수 | 줄 수 |
| --- | ---: | ---: |
| entities | 29 | 1,000 |
| features | 96 | 3,997 |
| pages | 49 | 2,341 |
| shared | 28 | 739 |
| widgets | 25 | 1,437 |
| 합계 | **227** | **9,514** |

각 렌즈는 테스트·fixture·public API를 포함한 전체 파일을 읽었다. 중립 게이트는 원시 지적과 소스 근거를 재확인했다.
검토 환경은 Next.js **16.3.3**, React/React DOM **19.2.8**, TypeScript strict, Zod 4 계열이다.
프레임워크 동작은 설치된 `node_modules/next/dist/docs/`와 React 소스로 확인했다.

현재 FSD 의존 방향, public API, Action 주입, slice별 모델·테스트 배치, Inbox의 카드별 오류 경계는 대체로 잘 유지된다.
FSD 경계·린트·타입 검사와 기존 테스트는 통과했다. 이 통과가 아래 실패 경로의 검증을 대신하지는 않는다.

## Scope

검토 대상은 `src/fsd` 전체다. `src/app`, `src/server`, `packages/core`, Prisma 및 제품 문구 문서는 호출 계약과 영향 범위를 확인하는 보조 근거로 읽었다.
후속 변경 대상은 아래 채택 항목의 UI·모델·테스트와 직접 연결된 타입·문구에 한정한다.
배포, 운영 DB 검증, 실제 인증 화면의 전체 인수 시험, 아키텍처 전면 재설계는 이번 검토에 포함하지 않았다.

구현한 **Core는 FSD-001~008 전부**다. Consider 두 건도 포함했다.
Phase 2·Approval-after로 분리한 항목은 없다. 사용자의 후속 구현 요청을 front matter에 승인 기록으로 남겼다.
서버 권한·트랜잭션·토큰 저장 정책, 외부 API, DB schema, Next 설정·의존성은 보존 대상이다.

구현 지침 묶음은 이 문서, `docs/architecture/README.md`·`fsd.md`·`verification.md`,
`docs/proposals/README.md`·`template.md`, `docs/conventions/product-copy.md`의 §9·§11·계정 토큰 안내,
아래 명시한 검증 스크립트·fixture다. `public-docs-pages.md`는 충돌 확인용이며 그 구현이나 승인을 이 문서에 위임하지 않는다.
정합성 검토 프로필은 **High-Risk**다. 토큰 결과 복구·권한 보존, Server Action 등록, 모델 이동의 검증 도착점을 확인해야 하기 때문이다.
이는 저장소의 문서 크기 metadata인 `proposal-size: standard`와 별개다.

## Proposal

### 우선순위

Must는 실제 기능 오류 또는 병합을 막을 정도의 위험, Should는 의미 있는 유지보수·복구·정확성 비용,
Consider는 근거가 있는 낮은 우선순위 개선을 뜻한다. 스킬 내부 HARD/DEFAULT 규칙이나 여러 렌즈의 동의 수로 심각도를 올리지 않았다.

| ID | 심각도 | 개선 항목 | 기여 렌즈 |
| --- | --- | --- | --- |
| FSD-001 | Must | Team에서 실행 중 항목을 대기 항목보다 우선 선택 | TypeScript generalist |
| FSD-002 | Should | 입력 스키마와 액션 입력 타입의 단일 출처 확보 | Cohesion |
| FSD-003 | Should | Reopen 예외 복구를 해당 영역에 제한 | Coupling |
| FSD-004 | Should | 토큰 발급의 결과 미확인을 확정 실패와 구분 | Predictability |
| FSD-005 | Should | Documents에 안정적인 보고서 식별자 보존 | TypeScript generalist |
| FSD-008 | Should | 독립적인 Coding client 선택기의 방향키 탐색 범위 분리 | TypeScript generalist |
| FSD-006 | Consider | Billing 전용 모델·안내·테스트를 화면 slice로 이동 | Cohesion |
| FSD-007 | Consider | core export의 고정 개수 검사 제거 | Coupling |

### FSD-001 — Team의 실행 상태 우선순위 수정

**근거:** [briefing.ts:119](../../../src/fsd/pages/project-board/model/briefing.ts#L119)의 project agent·qa-verifier·impl-verifier 분기는
첫 적격 행을 고른 뒤 그 행의 `dispatched`만 검사한다. [서버 목록:137](../../../src/server/pipeline/board-query.ts#L137)은 최신 제안순이다.
따라서 최신 대기 항목 Q 뒤에 실행 중인 W가 있어도 Team은 `Ready for Q`가 된다.
동일 파일의 [plan-verifier 판정:96](../../../src/fsd/pages/project-board/model/briefing.ts#L96)은 이미 실행 행을 우선한다.

**재현:** 원본 `buildBriefing`과 기존 fixture를 메모리에서 실행했다.
`qa`, `impl-verify`, `doc-auditor` 각각 `[Q: dispatched=false, W: dispatched=true]` 입력에서 Team은 `Ready for Q`, Activity의 active 항목은 W였다.
이 Must는 상태 계산 오류를 뜻하며 데이터 손실이나 운영 장애가 발생했다는 주장은 아니다.

**변경:** 적격 행 중 첫 dispatched 항목을 먼저 선택하고, 없을 때 첫 대기 항목으로 돌아간다.
같은 우선순위 내에서는 기존 서버 순서를 보존한다. 서버의 dispatched 계산이나 전체 목록 정렬을 변경할 필요는 없다.

**완료 기준:** qa·impl-verify·project-agent 분기 전체에서 위 조합이 `Working on W`를 반환한다. project-agent는 doc-auditor·feature-scout와 허용된 번호 slot을 포함한다. 모두 대기·모두 실행·on_hold 제외·동일 우선순위의 기존 선택 순서도 보존한다.

### FSD-002 — 스키마에서 액션 입력 타입 파생

**근거:** propose의 `{ key, agent, reason }`은 [스키마:3](../../../src/fsd/features/propose-item/model/propose-input.ts#L3),
[UI 액션 타입:10](../../../src/fsd/features/propose-item/ui/propose-button.tsx#L10),
[서버 인자:9](../../../src/fsd/features/propose-item/api/propose-item.server.ts#L9)에 반복 선언된다.
review-gate도 [입력 스키마:7](../../../src/fsd/features/review-gate/model/review-gate-input.ts#L7)와
[TransitionInput·액션 타입:41](../../../src/fsd/features/review-gate/model/inbox-item.ts#L41),
[approveGate 인자:42](../../../src/fsd/features/review-gate/api/review-gate.server.ts#L42)가 분리되어 있다.
`safeParse` 자체는 별도로 작성한 호출자 타입과 스키마의 일치를 강제하지 않는다.

**영향:** 필수 필드나 optional 여부 변경 시 한쪽을 놓쳐, 타입 검사를 통과한 UI 요청이 서버 검증에서 거부될 수 있다.
현재 계약이 이미 불일치한다는 지적은 아니다.

**변경:** 각 feature의 schema 파일에서 입력 타입을 파생하고 액션 계약·서버 인자가 이를 참조하게 한다.
클라이언트에서는 `import type`을 사용한다. 입력 변환이 생길 수 있으므로 호출자 입력에는 `z.input` 의미를 기준으로 삼는다.
feature 간 공용 스키마나 전역 타입 폴더는 만들지 않고, `DiscardAction`의 기존 positional 호출 형태를 유지한다.
`GateEntry`는 `NonNullable<ApproveGateInput["gateEntry"]>`로 파생하여 기존 필수 runId/entryId 구조를 보존한다.

같은 변경 범위에 `manage-project-connection`과 `select-project-for-use`의 모델 입력 계약도 포함한다.
단, [selectProject 서버 인자:17](../../../src/fsd/features/select-project-for-use/api/select-project-for-use.server.ts#L17)는 이미 `z.input`을 사용한다.
이를 서버 인자까지 모두 수기로 선언한 사례로 확대하지 않는다.

연결 관리의 `inputSchema`는 새 `model/project-connection-input.ts`로, 사용 선택의 `inputSchema`는
새 `model/select-project-input.ts`로 옮긴다. 각 파일은 기존 이름 `inputSchema`와 각각 `ProjectConnectionInput`·`SelectProjectInput` 타입을 소유한다.
서버 adapter는 schema를 값으로, 상태 모델은 파생 타입만 import한다. 버전 상한·정수·optional 검증과 인증 우선순서는 그대로다.
두 adapter의 `server-only` 및 함수 내부 `use server` 구조를 유지한다. loader를 원격 Action으로 등록하면 안 된다.

**함께 고칠 기존 시험:** `tests/server/project-connection-bindings.test.ts:37`은 현재 adapter 본문에
`expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)`가 있다는 사실까지 검사한다.
이 검사를 새 schema 소유 파일/실제 validator로 옮기고, adapter의 import·인증 선행·허용된 두 mutation 검사는 유지한다.
검사를 삭제해 이동을 통과시키지 않는다. `tests/server/inbox-card-boundary.test.ts`도 새 schema 두 개를 포함한 서버 전용 값 의존·Action 등록 금지를 확인한다.

**완료 기준:** 스키마의 필수 입력 변경이 소비자의 타입 검사에도 반영된다. 기존 런타임 validation·권한 검사·오류 응답은 유지한다.

### FSD-003 — Reopen 실패의 화면 영향 범위 축소

**근거:** [ReopenActions:62](../../../src/fsd/features/review-gate/ui/reopen-actions.tsx#L62)는 transition 결과의 실패만 toast로 처리하고
Promise reject는 처리하지 않는다. [BoardItemPage:107](../../../src/fsd/pages/board-item/ui/board-item-page.tsx#L107)에는 국소 경계가 없다.
가장 가까운 [프로젝트 오류 경계:18](../../../src/app/(app)/p/[slug]/error.tsx#L18)로 전파되면 상세 본문이 대체될 수 있다.
Next 16.3.3의 `10-error-handling.md:372`가 이 `useTransition` 전파 동작을 명시한다.

**영향:** Reopen 하나의 오류 때문에 사용자가 보던 Evidence·Documents·History도 사라질 수 있다.
프로젝트 layout의 헤더·탭까지 제거된다는 주장은 아니다. 실제 브라우저 오류 주입은 이번에 하지 않았다.

**변경:** [기존 Inbox 경계](../../../src/fsd/features/review-gate/ui/inbox-card.tsx#L25)와 같은 `catchError` 방식을 사용한다.
새 `ui/reopen-actions-boundary.tsx`의 `ReopenActionsBoundary`를 공개 wrapper `ReopenActions` 안에 두고,
기존 상태·transition 로직은 같은 파일의 비공개 자식 `ReopenControls`로 옮긴다. 경계가 오류를 던지는 자식보다 위에 있어야 한다.
외부 `ReopenActions` props와 feature의 공개 API는 유지하며, Documents·History·AcceptanceFailure는 이 경계 밖이다.

fallback은 저장 결과를 단정하지 않는 `This section couldn't be loaded. Try again to check the latest item state.`와 `Try again` 버튼을 사용한다.
버튼은 `ErrorInfo.retry()`만 호출한다. 이 API는 현재 page를 다시 조회·렌더하며 원래 mutation을 재전송하지 않는다.
다시 조회한 항목이 done이 아니면 Reopen은 사라지고, 여전히 done이면 사용자가 동작과 노트를 다시 선택한다.
confirmed failure의 기존 toast와 성공 후 refresh는 유지한다. `redirect()`·`notFound()`는 Next 경계가 처리하게 두고 일반 실패로 삼키지 않는다.
새 fallback 문구는 `product-copy.md` §11과 함께 반영한다. 범용 mutation hook은 만들지 않는다.

**완료 기준:** reject 시 Reopen 영역만 복구 안내로 바뀐다. 커밋 후 응답 유실에서도 성공·실패를 단정하지 않고 최신 상태를 확인할 수 있다.

### FSD-004 — 토큰 발급 결과 미확인 안내

**근거:** [프로젝트 토큰 폼:44](../../../src/fsd/features/manage-token/ui/new-token-form.tsx#L44),
[소유자 토큰 폼:43](../../../src/fsd/features/manage-token/ui/new-owner-token-form.tsx#L43),
[사용자 토큰 폼:48](../../../src/fsd/features/manage-user-token/ui/new-user-token-form.tsx#L48)은 모든 예외를
`Couldn't issue the token. Try again.`으로 표시한다.
[프로젝트 발급:34](../../../src/server/project-token-service.ts#L34)와
[사용자 발급:26](../../../src/fsd/features/manage-user-token/api/manage-user-token.server.ts#L26)은 저장 후 평문을 반환한다.

**영향:** 저장이 끝나고 응답만 유실되어도 확정 실패처럼 안내한다. 수동 재시도는 별개 활성 토큰을 추가한다.
평문을 받지 못한 토큰은 해시만 저장되어 복구할 수 없으므로 목록 확인과 폐기 안내가 필요하다.
이전 성공 평문도 상태에 남을 수 있으며 `router.refresh()`는 해당 Client state를 자동으로 초기화하지 않는다.

**변경:** 각 폼에서 마지막 성공 결과와 현재 요청의 `idle / pending / rejected / unknown / succeeded` 의미를 분리한다.
마지막 성공 평문·그 발급의 만료값은 후속 요청 실패로 지우지 않고, 후속 시도 중·실패 후에는 `Previous token`으로 표시한다.
새 성공 응답을 받은 때에만 해당 평문과 만료값을 교체한다. `router.refresh()`가 이 구분을 초기화한다고 가정하지 않는다.
평문을 state 밖에 영속화하거나 로그·fixture 결과에 포함하지 않는다.

정상 `success:false`와 로컬 만료 검증 실패는 기존 오류를 표시한다. 일반 예외의 unknown 경로는
`Couldn't confirm whether the token was issued. Refresh the list before trying again. If you identify a token whose value you did not receive, revoke it before issuing another.`로 안내하고 기존처럼 목록을 refresh한다.
unknown 상태에 `Refresh list` 버튼을 제공하되 이 버튼은 `router.refresh()`만 호출하고 안내와 이전 결과를 유지한다.
폼의 재제출은 사용자 동작으로만 가능하다. 자동 재발급·자동 폐기·일괄 폐기·새 idempotency 계약은 도입하지 않는다.
이름은 중복 가능하므로 이름/발급 시각만으로 미확인 토큰 ID를 자동 특정하지 않는다. 사용자가 식별할 수 있는 개별 Reference의 기존 Revoke를 사용한다.
목록을 가져오지 못하면 정리 완료를 주장하지 않고 다음 refresh/재방문을 허용한다. 서버 저장 방식이나 공통 훅 도입은 필요하지 않다.

현재 [제품 문구:409](../../conventions/product-copy.md#L409), [소유자 문구:508](../../conventions/product-copy.md#L508),
[사용자 문구:568](../../conventions/product-copy.md#L568)도 동일한 실패 안내를 규정한다.
따라서 문구 계약과 UI를 함께 개선한다. 문서와 현재 코드의 불일치로 분류하지 않는다.
`scripts/retired-copy.test.mjs`에는 옛 확정 실패 문장의 web 회귀 금지를 추가하고, 세 폼의 unknown 화면과 위 문구의 일치는 브라우저 fixture에서 검증한다.
현재 `token-names.test.ts`·`token-name.test.ts`는 초기 정적 렌더만 검사하므로 비동기 상태 검증을 대신할 수 없다.

**완료 기준:** 세 종류 각각 커밋 후 응답 유실과 정상 거부를 구분한다.
[기존 리허설:208](../../../scripts/rehearse-account-usage-and-tokens.ts#L208)의 `/lose-next-action`을 격리 테스트 DB에서 사용하고,
미확인 토큰 정리와 이전 성공 결과 표시까지 확인한다. 이번 검토에서는 DB 리허설을 실행하지 않았다.

### FSD-005 — Documents의 stable identity 보존

**근거:** [toItemDocs:5](../../../src/fsd/pages/board-item/model/item-docs.ts#L5)는 보고서 ID를 결과에서 버리지만 여러 보고는 모두 보존한다.
[문서 목록:80](../../../src/fsd/pages/board-item/ui/board-item-page.tsx#L80)는 `doc.href`를 React key로 사용한다.
[Report 모델:232](../../../prisma/schema.prisma#L232)은 path·commit의 고유성을 보장하지 않고,
[제출 처리:558](../../../src/server/pipeline/board-query.ts#L558)는 매번 보고를 추가한다.

**재현:** 서로 다른 ID의 보고 두 개에 같은 actor/path/commit을 주면 문서는 두 개, 고유 href는 하나이며 반환 필드는 label/path/href뿐이었다.
설치된 React DOM의 `react-dom-client.development.js:6605`는 중복 key를 지원하지 않는 재조정 조건으로 취급한다.
실제 UI 갱신에서 행이 누락되는 현상까지 재현한 것은 아니다.

**변경:** 현재 `ui/board-item-page.tsx`의 `ItemDoc`에 `id: string`을 추가하고 model의 `ReportRow`에도 원본 `id: string`을 요구한다.
plan의 ID는 `plan`, report는 `report:${report.id}`로 구분하고 `<li key={doc.id}>`를 사용한다.
`toItemDocs`의 공개 경로(`pages/board-item/index.ts`)와 route의 `toItemDocs(row, project)` 호출은 유지한다.
`getWithHistory`가 이미 report 전체 행의 ID를 반환하므로 서버 query나 DB 변경은 없다.
`item-docs.test.ts`의 report factory에는 서로 다른 안정적인 ID를 부여하고, `board-item-page.test.ts`의 기존 report ID도 재사용한다.
URL 변경이나 보고서 중복 제거로 해결하지 않는다.

**완료 기준:** 같은 URL의 별개 보고 두 개가 서로 다른 identity로 유지된다. 실제 React 목록 갱신에서도 duplicate-key 경고가 없다.

### FSD-008 — Coding client 선택기별 키보드 탐색 범위 분리

**근거:** [RuntimeClientChoice:9](../../../src/fsd/shared/ui/runtime-client-choice.tsx#L9)의 radio에는 `name`이 없다.
컴포넌트별 React 상태와 fieldset은 분리되어 있지만 native radio 그룹 이름은 인스턴스별로 지정하지 않는다.
이 컴포넌트는 토큰 안내·소유자 토큰 안내·turn banner·next step에 사용된다.

**재현:** 수정하지 않은 원본 컴포넌트와 설치된 React 19.2.8을 메모리에서 번들하고,
독립적인 상태를 가진 두 선택기를 Chrome 153/macOS 임시 화면에 렌더했다.
첫 선택기의 Codex에서 ArrowRight를 누르면 두 번째 선택기의 Claude로 포커스가 넘어갔으며,
반대 ArrowLeft도 첫 선택기로 돌아왔다. 선택값은 `[codex, claude]`로 유지됐다.
독립적인 선택 영역과 방향키 탐색 범위가 달라 조작 대상을 혼동할 수 있다.

**변경:** 인스턴스마다 `useId()`로 고유 이름을 만들고 그 인스턴스의 모든 radio에 같은 `name`을 준다.
다른 인스턴스에는 다른 이름을 사용한다. 전역 고정 name은 사용하지 않는다.

**완료 기준:** 두 인스턴스의 ArrowLeft·ArrowRight가 각 선택기 내부에서 순환하고 다른 선택기의 상태·포커스에 영향을 주지 않는다.
이번 검증은 원본 컴포넌트 fixture에 한정된다. 실제 인증 화면·표시 명령·복사 결과·다른 브라우저·수정 효과는 검증하지 않았다.
최초 후보의 “방향키 선택 자체가 실패한다”는 주장은 재현에서 반증되어 철회했다. 별도 탭 정지나 명령 오류도 주장하지 않는다.

### FSD-006 — Billing 전용 표현의 소유권 정리

**근거:** [entitlement-copy.ts:13](../../../src/fsd/shared/lib/entitlement-copy.ts#L13)의 `PlanRow`, `planMatrix`, `BILLING_NOTE`는
[BillingPage](../../../src/fsd/pages/billing/ui/billing-page.tsx#L3)에서만 화면에 사용한다. 표 모델 테스트는 shared, 사용량 UI 테스트는 Billing에 있다.

**변경:** 먼저 없는 `pages/billing/model/` 디렉터리를 만들고 `plan-matrix.ts`·`plan-matrix.test.ts`로 표 모델·전용 helper·시험과 안내 문구를 옮긴다.
옮기는 symbol은 `PlanRow`, `planMatrix`, 내부 `count`·`UNLIMITED_TEXT`·`cell`, `BILLING_NOTE`이며 `PLANS`·`UNLIMITED`·`limitsFor`·`Plan`의 core import도 새 소유 파일에 둔다.
`billing-page.tsx`는 `planMatrix`·`BILLING_NOTE`를 `../model/plan-matrix`에서 가져온다.
`shared/lib/entitlement-copy.ts`에는 `PLAN_LABEL`·`planLabel`과 필요한 `Plan` type import만 남기고 기존 공용 경로를 유지한다.
`entitlement-copy.test.ts`의 planLabel 시험은 그 자리에 남기고 표 시험만 새 위치로 옮긴다. 옛 파일을 삭제하거나 새 모델을 shared에서 재export하지 않는다.
새 entitlement entity나 Billing public API 확대는 필요하지 않다.
기능 결함이 아닌 낮은 우선순위의 변경 소유권 개선이다.

**완료 기준:** 새 파일의 표 시험과 Billing 렌더 시험·타입/FSD 검사를 통과한다.
구 shared 파일의 표 symbol/export와 UI의 옛 표 import가 없어야 하며, `planLabel`의 프로젝트 목록·연결 관리·앱 헤더·Billing 소비는 유지한다.

### FSD-007 — 고정 export 개수에 대한 테스트 결합 제거

**근거:** [gate-source.test.ts:24](../../../src/fsd/features/review-gate/model/gate-source.test.ts#L24)는 선언/runtime export 집합 일치와 별도로
`names.length === 8`을 요구한다. 호환 가능한 core export 추가도 frontend 시험의 숫자를 수정하게 만든다.

**변경:** 고정 숫자 검사만 제거한다. 선언/runtime 집합 일치와 실제 `RuleKind` 실행 집합 검증은 유지한다.
빈 수집 방어가 필요하면 개수의 양수 여부만 검사한다.

**완료 기준:** 기존 불일치 검출을 유지하며, core API를 실제로 추가할 필요 없이 해당 시험이 통과한다.

## Affected Files

아래 표의 FSD 경로는 `src/fsd/` 기준이며 구현·회귀 확인 대상을 기록한다. `추가` 이외는 기존 파일이다.
기존 propose/review-gate 입력 시험은 그대로 재사용했다. 나머지 실제 수정·추가는 작업 트리 diff에 대응하며 표 밖의 앱 기능·라우트·DB 정책 변경은 없다.

| ID | 실제 수정·추가 파일 | 책임 |
| --- | --- | --- |
| FSD-001 | `pages/project-board/model/briefing.ts`, `pages/project-board/model/briefing.test.mjs` | 실행 우선순위와 경계 사례 |
| FSD-002 | `features/propose-item/model/propose-input.ts`, `features/propose-item/ui/propose-button.tsx`, `features/propose-item/api/propose-item.server.ts`, `features/propose-item/model/propose-input.test.ts` | `ProposeInput` 파생, 기존 `ProposeAction` 공개 위치 유지 |
| FSD-002 | `features/review-gate/model/review-gate-input.ts`, `features/review-gate/model/inbox-item.ts`, `features/review-gate/api/review-gate.server.ts`, `features/review-gate/model/review-gate-input.test.ts` | `TransitionInput`·`RetryAcceptanceInput`·`ApproveGateInput`·`DiscardInput` 파생, `GateEntry`는 승인 입력에서 파생 |
| FSD-002 | `features/manage-project-connection/model/project-connection-input.ts`·`project-connection-input.test.ts`(같은 model 디렉터리에 추가), `features/manage-project-connection/model/project-connection-state.ts`, `features/manage-project-connection/api/manage-project-connection.server.ts` | schema 이동 및 `ProjectConnectionInput` 연결 |
| FSD-002 | `features/select-project-for-use/model/select-project-input.ts`·`select-project-input.test.ts`(같은 model 디렉터리에 추가), `features/select-project-for-use/model/select-project-state.ts`, `features/select-project-for-use/api/select-project-for-use.server.ts` | schema 이동 및 `SelectProjectInput` 연결 |
| FSD-003 | `features/review-gate/ui/reopen-actions.tsx`, `features/review-gate/ui/reopen-actions-boundary.tsx`·`reopen-actions-boundary.test.ts`(같은 ui 디렉터리에 추가) | 기존 props를 유지하는 wrapper와 국소 fallback |
| FSD-004 | `features/manage-token/ui/new-token-form.tsx`, `features/manage-token/ui/new-owner-token-form.tsx`, `features/manage-user-token/ui/new-user-token-form.tsx` | 현재 요청 상태·이전 성공 평문 구분과 refresh |
| FSD-005 | `pages/board-item/model/item-docs.ts`, `pages/board-item/model/item-docs.test.ts`, `pages/board-item/ui/board-item-page.tsx`, `pages/board-item/ui/board-item-page.test.ts` | ID 전달·고유 key·동일 URL의 별개 보고 보존 |
| FSD-006 | `shared/lib/entitlement-copy.ts`, `shared/lib/entitlement-copy.test.ts`, `pages/billing/ui/billing-page.tsx`, `pages/billing/ui/billing-page.test.ts`, `pages/billing/model/plan-matrix.ts`·`plan-matrix.test.ts`(같은 model 디렉터리에 추가) | Billing 전용 모델 이동 및 행·문구 렌더 검증 |
| FSD-007 | `features/review-gate/model/gate-source.test.ts` | 숫자 8 제거, export/RuleKind 집합 검증 유지 |
| FSD-008 | `shared/ui/runtime-client-choice.tsx`, `shared/ui/runtime-client-choice.test.ts`(추가) | `useId` 기반 그룹 분리; 정적 시험은 name 관계만 검증 |

보조 파일도 구현 범위에 포함한다. 다음은 저장소 루트 기준이다.

| 파일 | 변경 이유 |
| --- | --- |
| `tests/server/project-connection-bindings.test.ts` | 이동한 schema를 새 위치에서 검사, 인증/재검증/inline Action 경계 보존 |
| `tests/server/inbox-card-boundary.test.ts` | 기존 검사 방식에 새 schema와 Reopen 경계의 import·manifest 금지 조건 추가 |
| `tests/server/fixtures/src-clean-code-browser.tsx` | 세 토큰 폼의 제어 가능한 비동기 응답, 두 radio 인스턴스, Documents 갱신 fixture 추가 |
| `tests/server/fixtures/src-clean-code-acceptance.ts` | 토큰/문서의 동작·문구·정리 검증 추가. 실제 키 이벤트 검증을 synthetic `dispatchEvent`로 대체하지 않음 |
| `scripts/rehearse-src-clean-code.ts` | 기존 Inbox fixture를 보존하며 done 항목·`/owner-item`·1회 응답 유실 제어 추가. `--ui-only --fixture-development`를 추가해 Documents 경고 시험용 브라우저 번들만 development로 실행 |
| `scripts/rehearse-account-usage-and-tokens.ts` | interactive fixture에 요청별 토큰 수/Reference를 확인하는 읽기 전용 `/state` 추가. 평문·해시·쿠키를 결과에서 제외 |
| `scripts/retired-copy.test.mjs` | 토큰 발급의 옛 확정 실패 문구 재등장 금지 |
| `docs/conventions/product-copy.md` | §9의 세 발급 폼 문구·이전 결과·refresh, §11의 Reopen fallback 갱신 |
| `docs/architecture/verification.md` | 새 fixture 진입점·검증 범위·정리 방법 기록 |

### Public API와 이동 경로

| symbol | 현재 소유 / 외부 공개 | 변경 후 연결 | 도착점 검사 |
| --- | --- | --- | --- |
| `ProposeAction` | `ui/propose-button.tsx` → `features/propose-item/index.ts` | 공개 위치 유지, 입력만 `model/propose-input.ts`의 `ProposeInput` type import | backlog page의 기존 public import + typecheck |
| `TransitionInput` | `model/inbox-item.ts`, slice 내부 소비 | `review-gate-input.ts`에서 정의, inbox-item에서 type 재export하여 내부 호환 유지 | 서버 인자·기존 액션 타입 검사 |
| `RetryAcceptanceAction`, `GateAction`, `DiscardAction`, `TransitionAction` | `model/inbox-item.ts` → `features/review-gate/index.ts` | 각각 schema 입력 타입 참조. Discard positional 인자는 `DiscardInput`의 필드 타입 사용 | Inbox·상세 page의 동일 public API, `tests/server/review-gate-actions.test.ts` |
| `ProjectConnectionAction`, `SelectProjectAction` | 각 feature의 `model/*-state.ts` → `index.ts` | 새 입력 타입만 type import, UI 소비 경로 유지 | 프로젝트 목록/컨트롤·서버 binding 시험 |
| 모든 입력 schema 값 | 기존 model 또는 서버 adapter 내부 | 해당 feature model만 소유, 서버 api만 runtime import | public barrel·Client runtime import·Action registry에 schema가 없어야 함 |
| `ReopenActions` | `ui/reopen-actions.tsx` → `features/review-gate/index.ts` | 같은 공개 wrapper 아래 비공개 controls·boundary | `BoardItemPage` 기존 호출과 실제 상세 fallback |
| `toItemDocs`, `ItemDoc` | model 함수 → `pages/board-item/index.ts`; ItemDoc은 ui type | 함수 공개 경로·type 소유 유지, report ID를 UI까지 전달 | route가 전달한 reports와 문서 목록 key |
| `planMatrix`, `PlanRow`, `BILLING_NOTE` | `shared/lib/entitlement-copy.ts` unit | `pages/billing/model/plan-matrix.ts`, UI는 상대 경로 import | 새 소유/시험 존재, 옛 선언·export·import 부재 |
| `planLabel` | `shared/lib/entitlement-copy.ts` unit | 경로·값 유지 | Billing·project-list/model/project-list-copy.ts·manage-project-connection/model/project-connection-state.ts·app-header/ui/app-header.tsx |
| `RuntimeClientChoice` | `shared/ui/runtime-client-choice.tsx` unit | props/API 유지, React `useId`만 추가 | TokenReveal·OwnerTokenReveal·TurnBanner·NextStepContent 소비 유지 |

구현 전 2026-10-14 preflight에서 신규 파일 9개는 모두 없고 이름 충돌이 없었다. `pages/billing/model` 부모와 신규 파일을 계획대로 생성했다.
기존 slice `index.ts`·`index.server.ts`의 runtime export 이름과 route import는 변경하지 않는다. 새 schema 값은 public API로 내보내지 않는다.
파일 이동 후 옛 파일을 남길지 지울지 미정인 항목은 없다: Billing은 부분 이동, 두 adapter는 schema 선언만 이동한다.

### 유지할 호출·검증 경로

라우트는 다음 8개이며 현재 파일을 수정할 필요는 없다.

- `src/app/(app)/p/[slug]/page.tsx`
- `src/app/(app)/p/[slug]/items/[key]/page.tsx`
- `src/app/(app)/p/[slug]/inbox/page.tsx`
- `src/app/(app)/p/[slug]/backlog/page.tsx`
- `src/app/(app)/p/[slug]/tokens/page.tsx`
- `src/app/(app)/projects/page.tsx`
- `src/app/(app)/settings/tokens/page.tsx`
- `src/app/(app)/billing/page.tsx`

프로젝트 상세 layout과 `p/[slug]/error.tsx`, 서버 auth guard, `project-token-service.ts`, `pipeline/board-query.ts`, Prisma Report 모델은 읽기 근거·보존 대상이다.
새 URL·권한·토큰 목록 필드·schema migration을 만들지 않는다.

기존 회귀 목적지는 다음과 같다. 유지하며 새 async·키보드 사례는 아래 fixture에 더한다.

- `tests/server/review-gate-actions.test.ts`
- `tests/server/token-issuance-bindings.test.ts`
- `tests/server/mutation-identifiers.test.ts`
- `src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts`
- `src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts`
- `src/fsd/features/manage-token/ui/token-names.test.ts`
- `src/fsd/features/manage-user-token/ui/token-name.test.ts`
- `src/fsd/entities/project-token/ui/token-reveal.test.ts`
- `src/fsd/widgets/turn-banner/ui/turn-banner.test.ts`
- `src/fsd/widgets/turn-banner/ui/next-step.test.mjs`

## Runtime and Final Artifacts

| ID / 시작 상태 | 성공·실패·재진입·정리 | 최종 화면/산출물과 검증 도착점 |
| --- | --- | --- |
| FSD-001 / loader가 최신순 rows 제공 | render마다 실행 우선 판정; 순서·on_hold 제외·빈 배열 보존. 새 effect/store 없음 | `/p/[slug]`의 Team state와 Activity; `briefing.test.mjs`에서 qa·impl-verify·doc-auditor·feature-scout 및 번호 붙은 slot 포함 |
| FSD-002 / 기존 action payload | 인증→동일 safeParse→서비스/CAS→성공 시 기존 경로 revalidate 유지. malformed·비소유자·stale에 쓰기 없음. 날짜 문자열·0~MAX_SAFE_INTEGER 경계 보존 | 각 schema의 입력 타입/validator, `index.ts` 소비 및 build의 `.next/server/server-reference-manifest.json`; 새 schema/loader는 remote action 아님 |
| FSD-003 / writable·done의 Reopen | confirm→기존 transition. confirmed refusal은 toast; reject는 국소 fallback. retry는 최신 GET/render만 수행하고 mutation 재전송 금지. route 이동 시 boundary 초기화; note 재입력은 done일 때만 | `/p/[slug]/items/[key]`의 Reopen fallback. Evidence/Documents/AcceptanceFailure/History 유지, header·tabs 보존. Next `catchError.md`의 retry·redirect/notFound 의미 사용 |
| FSD-004 / 발급 폼과 마지막 성공 결과 | 입력 오류는 요청 없음; pending 중 입력 잠금 유지; success만 평문 교체; rejected/unknown은 이전 성공 평문을 Previous token으로 유지. unknown에서 refresh는 read만 하고 미확인 표시 유지. 재발급·폐기는 사용자 명시 동작뿐 | `/p/[slug]/tokens`의 hs_/ho_와 `/settings/tokens`의 hu_; HTML/RSC 목록의 Reference와 alert, 이전 결과/만료값. `router.refresh()` client state 보존을 전제로 검증 |
| FSD-005 / route의 원본 reports | ID/라벨/commit 링크를 보존하며 순서 변경·추가·삭제 때 같은 report의 key 유지. plan/report 같은 URL도 다른 ID. 날짜/actor/legacy acceptance 해석 유지 | 상세 Documents의 모든 행·href·React identity, 모델 시험 + development 브라우저 Documents fixture. History와 query는 변경 없음 |
| FSD-006 / core entitlement 값 | 같은 8행·계획별 값·무제한·안내. core 정책이 계속 유일한 값 출처, `planLabel` 소비는 유지 | `/billing` 본문의 표/안내; 새 model 시험·기존 Billing 렌더 시험. shared에서 새 모델을 역import하지 않음 |
| FSD-007 / 선언과 runtime exports | 양쪽 집합·RuleKind 실행 집합 일치 검사 유지; 고정 숫자만 제거. empty collector 방어는 양수 검사 | 기존 `gate-source.test.ts`; core export를 실제 추가하는 작업 없음 |
| FSD-008 / 독립적인 선택기 두 개 | 인스턴스별 name 고정, 내부 옵션은 같은 name. 방향키는 해당 그룹에서 순환. 선택/입력/props 바뀌어도 기존 토큰·배너 identity reset 규약 유지 | 네 소비 컴포넌트의 radio checked/name 및 실제 명령 표시·Copy 값. 신뢰된 브라우저 키 입력으로 확인; 합성 KeyboardEvent만으로 통과 판정하지 않음 |

이 화면들의 승자는 기존 route가 public API로 조합한 FSD 컴포넌트다. 제품 문구 문서는 빌드 입력이 아니므로 문서만 고쳐서는 화면이 바뀌지 않는다.
Billing 값은 core, 문서 링크는 RepoRef·path·commit, 토큰 노출은 직전 성공 응답만을 사용한다.
새 asset·폰트·metadata·정적 URL·번역 파일은 없으며 기존 `src/app` layout/config가 계속 적용된다.
생성 파일은 직접 수정하지 않는다. `npm run build`가 Prisma client와 Next 산출물을 만들고, fresh manifest의 등록 구조는 JSON을 파싱해 확인한다.

## Safety Analysis

- 현재 `pages → widgets → features → entities → shared` 의존 방향과 slice public API를 유지한다.
- 서버 인증·인가·CAS·토큰 저장·폐기 정책은 유지한다. 클라이언트 오류 처리로 서버 검증을 대체하지 않는다.
- 입력 타입의 재사용은 각 feature 안에서 수행하고, UI가 서버 전용 모듈이나 Zod 런타임을 불필요하게 import하지 않도록 확인한다.
- Documents의 같은 URL은 같은 보고를 뜻하지 않는다. 원본 제출 기록을 유지한다.
- 토큰 UI를 수정할 때 평문을 로그·스토리지·오류 메시지에 넣지 않는다. 이전 성공 결과를 제거할 경우 사용자의 미복사 평문을 잃을 수 있어 명시적으로 다룬다.
- 문구 변경은 `docs/conventions/product-copy.md`와 같은 변경에서 반영하고, 아키텍처 verification의 문구 변경 규칙을 따른다.
- 공개 문서 제안과의 병행 작업 시 `entities/pipeline`, 설치 안내·문구 변경의 최신 상태를 재확인한다. 해당 제안 자체를 이번 문서로 변경하지 않는다.

## Approval

사용자의 후속 구현 요청에 따라 FSD-001~008 구현과 검증을 마쳤다. 승인 기록은 front matter에 있다.

## Execution Plan

1. 최신 `dev`를 기준으로 변경 대상이 그대로인지 확인하고 `harness/<topic>` 브랜치에서 작업한다.
2. FSD-001을 작은 변경으로 수정하고 모든 대상 역할·반복 slot의 순수 계산 회귀를 고정한다.
3. FSD-005의 보고서 identity와 FSD-003의 wrapper/boundary를 각각 적용한다. 새 boundary의 정적 렌더 시험뿐 아니라 기존 리허설에 실제 상세 페이지 진입점·응답 유실 검증을 추가한다.
4. FSD-004의 세 폼·제품 문구·폐기 문구 시험을 같은 변경에 반영한다. 기존 성공값을 유지한 unknown 상태와 요청/폐기 수를 fixture로 확인한다.
5. FSD-008의 name 관계 시험과 실제 방향키 검증을 적용한다. FSD-002는 네 feature를 대상으로 입력 타입과 새 schema를 연결하고, 옛 위치를 검사하던 서버 시험을 함께 바꾼다.
6. FSD-006의 부모 디렉터리 생성→모델/시험 부분 이동→UI import 변경→옛 노출 부재 검증 순서로 정리한다. FSD-007의 집합 보장은 유지한다.
7. 아래 공통 게이트와 항목별 검증, Definition of Done을 모두 충족한다. 현재 코드와 같은 fresh build에서 manifest·리허설을 실행하고, 계측 산출물을 사용했다면 재빌드 후 manifest를 다시 확인한다.
8. 구현이 승인된 작업에서만 `dev` 대상 PR을 만들고 `check` 통과를 확인한다. 이 문서 정합성 검토는 커밋·PR·병합·배포를 수행하지 않는다.

## Verification Plan

아래 명령은 **저장소 루트의 zsh/bash** 기준이며, 코드 구현 후 실행한다.
의존성이 없다면 저장소 지침대로 `npm ci`가 선행한다. 깨끗한 checkout은 `src/generated/prisma`가 없으므로 타입 검사 전에 `npm run db:generate`가 필요하다.
macOS의 `/var` 별칭 환경에서는 이 셸의 테스트용 `TMPDIR`만 실제 쓰기 가능한 `/private/tmp`로 지정한다. 다른 플랫폼에서는 해당 export 줄을 생략한다.

```bash
export TMPDIR=/private/tmp
npm run db:generate
npm run verify:fsd
npm run test:architecture
npm run lint
npm run check
npm test
npm run test:web
npm run test:server
npm run build
SRC_CHECK_INBOX_MANIFEST=true RDC_CHECK_ACTION_MANIFEST=true npm run test:server
```

검사기를 우회하거나 alias 보호 규칙을 끄지 않는다. `npm run test:web`은 `tests/server`를 실행하지 않으므로 별도 `test:server`를 생략할 수 없다.
manifest 검사는 새 build 뒤에만 수행한다. JSON의 node/edge registry에서 review-gate 4개 Action과 proposeItem은 유지,
연결 관리 adapter의 inline mutation 두 개 유지, schema·loader·boundary의 원격 Action 등록 없음이 기대 결과다.
사용 선택도 `selectProject` inline Action만 등록되고 `loadProjectSelection`은 등록되지 않는지 기존 manifest 검사에 포함한다.
검증 파일은 `tests/server/inbox-card-boundary.test.ts`, `tests/server/project-connection-bindings.test.ts`, helper `tests/server/fixtures/action-manifest.ts`다.

DB 리허설은 이미 준비한 `stagekeeper_test_*` 이름의 `TEST_DATABASE_URL`이 필요하다. `scripts/test-server-integration.mjs`가
부모 `DATABASE_URL`과 host/port/database가 다른지 검사하므로 실제 운영 URL을 넣거나 이 검사를 끄지 않는다.
환경값 자체는 문서·로그에 남기지 않는다. 아래 integration은 기존 migration을 테스트 DB에 적용하는 작업이며 새 migration을 추가하지 않는다.

```bash
npm run test:server:integration
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-src-clean-code.ts
```

첫 리허설이 `/finish`로 종료된 다음 아래 토큰 리허설을 실행한다. 두 명령은 브라우저 확인을 기다리므로 순차적으로 수행한다.

```bash
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-account-usage-and-tokens.ts --interactive
```

토큰 리허설 종료 후 Documents의 duplicate-key 경고 검증은 다음 **추가할 옵션**으로 실행한다.
현재 스크립트는 production 번들을 고정하므로 `--fixture-development`를 구현하기 전에는 이 명령을 검증 성공 근거로 쓰지 않는다.
옵션은 `--ui-only`의 browser esbuild `process.env.NODE_ENV`만 development로 바꾸며 배포 Next 빌드에는 영향을 주지 않는다.

```bash
node --import tsx scripts/rehearse-src-clean-code.ts --ui-only --fixture-development
```

`http://127.0.0.1:55452/fixture?mode=documents`에서 실제 `BoardItemPage`를 렌더한다. report 추가·삭제·순서 변경 컨트롤을 제공하며
모델이 반환한 모든 행과 href, 콘솔 duplicate-key 경고를 검사한다. fixture 종료 시 캡처한 console handler도 원래 값으로 복원한다.
production UI fixture와 development 경고 fixture 모두에서 행 보존을 확인한다.

**FSD-003의 후속 리허설 확장:** `rehearse-src-clean-code.ts`의 기존 A~D Inbox fixture를 유지하고,
같은 격리 프로젝트에 문서·이력이 있는 done 항목 `R-1`을 추가한다. 새 `/owner-item`은 같은 fixture 세션으로 그 상세 경로에 진입한다.
새 `/arm/reopen-after-once`는 fresh manifest에서 읽은 humanTransition ID의 다음 POST 한 건만 실제 서버 응답 수신 뒤 잘린 RSC 본문으로 대체하고 즉시 해제한다.
원래 `/arm/after`의 socket 종료를 이 시험의 유일한 증거로 쓰지 않는다(브라우저 재전송과 혼동 가능).
새 `/arm/reopen-before-once`는 같은 대상 한 건을 upstream 호출 없이 실패시킨 뒤 해제한다.
`/state`로 전이 수·status·updatedAt만 확인하고, fallback의 Try again 이후 **추가 mutation 없이 최신 상태가 표시**되는지 대조한다.
비소유자·미로그인·read-only·stale 및 confirmed success/refusal은 기존 서버 action 시험과 실제 route에서 보존 여부를 확인한다.

**FSD-004의 검증 구분:** UI doubles는 `src-clean-code-browser.tsx`의 별도 token-issuance mode와
`src-clean-code-acceptance.ts`에서 세 종류를 순서대로 검증한다. 현재 CopyFixture의 항상 성공하는 issue 함수를 그대로 실패 경로 검증으로 세지 않는다.
실제 저장 후 유실은 `http://127.0.0.1:55477/user` 또는 `/project`로 들어간 뒤 `/lose-next-action`을 한 번 arm하고 수행한다.
새 읽기 전용 `/state`에서 해당 fixture 소유자의 종류별 개수·Reference·revoked 여부만 확인한다.
기준값 대비 **한 번의 발급으로 +1, refresh로 증가 없음, 사용자 Revoke 후 해당 ID만 종료**를 확인한다. 정상 서버 거부는 +0이어야 한다.
동일 이름의 기존 토큰도 두어 이름만으로 자동 폐기하지 않는지 확인한다.

**fixture 정리:** 브라우저 fixture 변경 시 기존 cleanup에서 React root·보류 Promise·clipboard 대체·pagehide handler를 모두 해제한다.
새 process listener가 필요하면 finally에서 제거한다. `/finish` 후 loopback listener와 자식 Next·DB 연결을 닫고 fixture 사용자 cascade로 데이터를 지운다.
`rehearse-src-clean-code`의 fixture는 반환한 전체 결과의 Fail 0을 확인하며, 실패 중 종료도 정리 시험에 포함한다.
평문을 관측해야 하는 UI 시험은 고정 가짜 토큰만 사용하고, 실제 토큰 리허설 결과에는 평문·hash·세션을 기록하지 않는다.

| 항목 | 구현 후 검증 도착점과 기대 결과 |
| --- | --- |
| FSD-001 | `node --import tsx --test src/fsd/pages/project-board/model/briefing.test.mjs`: qa·impl-verify·doc-auditor·feature-scout·번호 slot에서 working 우선, 동일 우선순위 순서/보류 제외 유지 |
| FSD-002 | `test:web`의 입력 schema 시험, `test:server`의 review-gate/project-connection binding 시험, `check`의 typecheck. 연결/선택 두 새 validator에 빈 ID·optional replacement·음수/소수/MAX_SAFE_INTEGER 경계 추가. 새 model에 schema 존재, 옛 adapter 선언 없음, public barrel·Client runtime 값 import 없음 |
| FSD-003 | 실제 `/owner-item`의 국소 fallback 및 retry 후 DOM 본문/상태, precommit +0·postcommit +1·retry 추가 0. 기존 Documents/History/권한 경계 유지 |
| FSD-004 | 세 폼의 최초 성공→후속 pending→거부/unknown→refresh→명시적 재시도. Previous token·그 만료값 유지, 새 성공만 교체, 후속 요청 결과와 혼동 없음. fixture/실제 저장 증거를 분리 |
| FSD-005 | `node --import tsx --test src/fsd/pages/board-item/model/item-docs.test.ts src/fsd/pages/board-item/ui/board-item-page.test.ts`: plan/report 같은 URL과 별개 report 같은 URL 모두 ID 구분. 브라우저 Documents fixture에서 추가·삭제·순서 변경 후 모든 행 보존/duplicate-key 경고 0. 경고 검사는 React development 번들 사용 |
| FSD-008 | 새 `runtime-client-choice.test.ts`는 두 인스턴스 name의 내부 일치/외부 차이를 검사. `/fixture?mode=copy`와 `mode=turn`에서 실제 브라우저 ArrowLeft/Right·Tab/Shift+Tab으로 그룹 내부 순환·그룹 간 Tab 이동 확인. 기존 표시=Copy·token/URL/slug 변경 reset 시험 유지 |
| FSD-006 | `node --import tsx --test src/fsd/pages/billing/model/plan-matrix.test.ts src/fsd/pages/billing/ui/billing-page.test.ts src/fsd/shared/lib/entitlement-copy.test.ts`: 새 위치의 값·8행·안내 검사, 옛 위치의 표 export/선언/import 없음. 공용 planLabel 유지 |
| FSD-007 | `node --import tsx --test src/fsd/features/review-gate/model/gate-source.test.ts`: 고정 8은 없어도 선언/runtime 집합과 RuleKind 전체 대조는 그대로 |

이동의 부재 검사는 실행 코드의 import/export AST를 기준으로 `planMatrix`, `PlanRow`, `BILLING_NOTE`와 두 `inputSchema` 선언 전부를 다룬다.
주석이나 다른 기능의 동명 `PlanRow`까지 제거하지 않는다. Billing 시험에는 새 모델 출력 검사와 옛 shared export 부재를 함께,
서버 binding 시험에는 새 schema 소유와 adapter import 및 원격 등록 금지를 함께 둔다.
schema의 runtime import 허용은 symbol 이름만으로 검사하지 않고 소유 모듈과 함께 검사한다.
대상은 `propose-input.ts`의 `proposeInputSchema`, `review-gate-input.ts`의 `retryAcceptanceInputSchema`·`transitionInputSchema`·`approveGateInputSchema`·`discardInputSchema`,
새 `project-connection-input.ts`와 `select-project-input.ts` 각각의 `inputSchema`다. 해당 feature의 server api와 테스트만 값 import를 허용하고 type-only 입력 타입은 허용한다.
문구 금지 검사는 `retired-copy.test.mjs`의 기존 web 범위(비-test `src/fsd`·`src/app`)에서 옛 token 실패 문장만 금지한다.

## Verification Results

### 구현 후 결과

`npm run verify:fsd`, `npm run check`, 전체 web/core·plugin/server 시험, clean production build,
fresh Action manifest, 격리 PostgreSQL 통합, production/development 브라우저 fixture와 실제 Next 응답 유실 인수를 통과했다.
숫자·실제 전이/토큰 read-back·환경 조정·정리 상태는 [인수 보고서](../../test-reports/completed/2026-10-15-fsd-clean-code-acceptance.md)가 단일 기록이다.

### 구현 전 기준선과 정합성 검토 기록

다음은 **최초 클린코드 검토 때 수행한 변경 전 기준선 검사**다. 후속 정합성 검토의 신규 실행 결과나 애플리케이션 수정 후의 회귀 검사 결과가 아니다.

| 실행 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run verify:fsd` | 통과 | FSD 경계 |
| `npm run lint` | 통과 | ESLint + FSD |
| `node_modules/.bin/tsc --noEmit --incremental false` | 통과 | 타입 산출물 생성 없이 검사 |
| `node --import tsx --test 'src/fsd/**/*.test.mjs' 'src/fsd/**/*.test.ts'` | **263/263 통과** | 대상 전체의 기존 시험 |
| `npm run test:architecture` | 최초 29 통과·15 실패·2 skip | macOS `/var` → `/private/var` 별칭을 runtime-cache 보호가 거부 |
| `TMPDIR=/private/tmp npm run test:architecture` | **44 통과·2 skip** | Windows 전용 2개 제외, 코드 변경 없이 해결 |
| `npm run test:web` | 최초 환경 실패 | sandbox의 localhost listen EPERM; 제한 밖 재실행에서도 임시 경로 별칭으로 9개 실패 |
| `TMPDIR=/private/tmp npm run test:web` | **593/593 통과** | localhost 실행 허용 후 실제 임시 경로 사용 |
| `npm run build`, DB integration·전체 인증 화면 인수 | 미실행 | 코드 변경 없는 검토 범위. 후속 구현 검증에 포함 |

**리뷰 중 근거 확인:** 원본 함수만 불러온 메모리 실행(`TSX_DISABLE_CACHE=1 node --import tsx --input-type=module`)으로
FSD-001의 잘못된 Team 결과와 FSD-005의 두 문서/한 href 결과를 확인했다.
이것은 후속 수정의 성공 시험이 아니며, 운영 데이터나 React 화면 누락을 재현했다는 뜻도 아니다.

**게이트 요청에 따른 리뷰 중 근거 확인:** FSD-008은 `esbuild`의 `write:false`로 원본 컴포넌트를 메모리에서 번들한 후,
React `useState` wrapper 두 개와 선택값 output을 임시 브라우저 탭에 렌더했다.
Playwright의 실제 키 입력과 DOM 상태 관찰로 인스턴스 간 방향키 포커스 이동을 확인했다.
앱 소스·DB·빌드 파일을 바꾸지 않았고 임시 탭은 닫았다. 인증 화면 전체의 인수 시험은 아니다.

**후속 정합성 검토의 추가 확인(2026-10-14):** 아래 기존 서버 계약 시험 **21개 통과**.
실제 DB 연결 없이 auth 우선순위·malformed 입력·CAS 거부·예외 전달·토큰 scope/해시 저장·목록 read-only 계약을 확인했다.
문서의 수정 계획을 실행한 시험이 아니라 현재 코드의 보존 기준 확인이다.

```bash
TSX_DISABLE_CACHE=1 node --import ./tests/server/register-server-only.mjs --import tsx --test tests/server/review-gate-actions.test.ts tests/server/project-connection-bindings.test.ts tests/server/token-issuance-bindings.test.ts
```

TypeScript AST로 원본 adapter에서 `inputSchema` 선언만 메모리상 제거한 결과, 기존 `project-connection-bindings`의 schema 문장 검사는 false가 됐다.
따라서 시험 소유권 이동은 단순 권고가 아니라 FSD-002 구현 시 필요한 동반 변경이다. 문서 front matter도 YAML parser로 검증했다.

## Review Coverage

**Full applicable-lens review — 5개 관점 전체 완료, N/A 0, Unavailable 0, Skipped 0.**
각 렌즈는 독립 context로 수행했고, 중립 게이트가 지적마다 판정했다. 가독성에 채택 항목이 없다는 사실을 N/A로 바꾸지 않았다.

| 렌즈 | 상태 | 채택 결과 |
| --- | --- | --- |
| Cohesion | Completed | FSD-002, FSD-006 |
| Coupling | Completed | FSD-003, FSD-007 |
| Predictability | Completed | FSD-004 |
| Readability | No supported findings | 전체 검토 완료, 근거 충분한 지적 없음 |
| TypeScript generalist | Completed | FSD-001, FSD-005, FSD-008 |

중립 게이트는 3차까지 수행했다. TS-003은 1차 검증 보류 → 2차 원 작성자 수정 → 3차 Should 채택으로 확정했다.
그 외 7건은 1차 채택을 유지했다. 서로 같은 근본 원인의 지적은 없어 중복 병합하지 않았다.

| 원시 ID | 최종 ID | 최종 판정 | 심각도 |
| --- | --- | --- | --- |
| TS-001 | FSD-001 | accept | Must |
| COH-001 | FSD-002 | accept | Should |
| CPL-001 | FSD-003 | accept | Should |
| PRD-001 | FSD-004 | accept | Should |
| TS-002 | FSD-005 | accept | Should |
| TS-003 수정본 | FSD-008 | accept | Should |
| COH-002 | FSD-006 | accept | Consider |
| CPL-002 | FSD-007 | accept | Consider |

최종 기각·검증 보류·수정 요청·Needs human judgment는 없다.
채택은 개선 필요성에 대한 판정이며 후속 구현이나 인수 시험이 완료되었다는 뜻은 아니다.

## Definition of Done

아래 구현 완료 조건을 인수 보고서의 증거로 확인했다.

- [x] FSD-001~008 전부와 Consider 두 건의 구현·완료 기준을 확인했다.
- [x] Affected Files와 Public API 연결, 신규 파일 9개·Billing 부모 생성, 부분 이동의 새 존재/옛 부재를 확인했다.
- [x] 입력 검증·auth/CAS·기존 Action export/inline 등록·route props를 보존했다. schema를 옮기면서 기존 검사기를 약화하지 않았다.
- [x] Reopen retry와 토큰 Refresh list는 mutation을 자동 재실행하지 않는다. 이전 성공 평문·미확인 토큰·같은 이름의 기존 토큰을 구분했다.
- [x] Documents의 모든 보고·링크·라벨, Billing 값/행, radio 실제 방향키·표시/Copy·identity reset을 확인했다.
- [x] 기존 시험·새 실패/경계 시험·fresh registry·실제 Next/격리 DB 증거를 구분했다.
- [x] fixture listener·pending 작업·DB 데이터·임시 자격 정보를 정리했고 보고서에 비밀을 남기지 않았다.
- [x] 제품 문구·UI·폐기 문구 시험·verification 지침을 함께 반영했다.

## Reconciliation Notes

2026-10-14 `reconciling-proposals-with-codebase`로 최초 문서를 코드에 대조했을 때 개선할 점이 있었다.
다섯 렌즈의 8건 채택 자체를 새 리뷰로 재선언한 것이 아니라 **구현 제안의 정합성**을 검토했다.

| 누락/충돌 | 본문에 반영한 해결 |
| --- | --- |
| schema 이동 범위·파생 타입 출처 및 옛 schema 위치를 검사하는 서버 시험 누락 | 네 feature의 정확한 파일·type/public 경로, project-connection binding 시험의 새 도착점 및 manifest 보존 명시 |
| Reopen 복구 대안이 미정이고 기존 리허설은 Inbox 전용 | catchError wrapper로 확정, retry의 read-only 의미·done 재진입·권한 보존, done fixture/일회성 유실 경로 추가 |
| 토큰의 이전 평문·unknown 이후 refresh/retry·동명 토큰 식별 기준 불명확 | 이전 결과 보존/라벨·명시적 refresh·자동 mutation 금지·개별 Reference 기반 수동 폐기 및 검증 정의 |
| Documents ID의 필드/소유/소비 연결이 불완전 | `ItemDoc.id`, `ReportRow.id`, plan/report namespace, 원본 query·route 보존, model/UI fixture 갱신 명시 |
| Billing 이동 목적지·시험 분리·옛 표 노출 부재 검증 누락 | 새 파일/부모 preflight, planLabel 잔류, 새 표/시험과 상대 import, AST 기반 이동 검증 명시 |
| 공통 게이트가 서버 시험·fresh registry·동작 fixture·정리·완료 조건을 빠뜨림 | 준비 순서·실행 가능한 명령·입력/출력 기대값·runtime/artifact 표·DoD로 전파 |

보완본의 재검토에서도 Documents의 경고 검증에는 현재 production 고정 fixture와 다른 실행 경로가 필요함을 확인했다.
따라서 development 전용 UI 옵션·실행 명령·cleanup을 같은 스크립트의 후속 변경으로 명시했고, 축약된 route/시험 경로도 전체 경로로 풀었다.

정합성 검토 중 앱 코드·제품 문구 원본·검증 스크립트는 수정하지 않았다. 이 문서의 새 경로와 endpoint는 **후속 구현 대상**이며 현재 존재하거나 통과한 것으로 취급하지 않는다.

## Risks and Rollback

Reopen 예외 전파·토큰 응답 유실은 실제 Next와 격리 DB로 검증했다. 다른 브라우저·운영 배포·Windows 실제 역할 실행은 이 인수 범위 밖이다.
다른 브랜치와 통합할 때 충돌과 변경된 소비처를 확인해야 한다. 테스트 통과를 모든 런타임 경로나 보안·접근성의 보장으로 해석하지 않는다.

후속 변경은 항목별 커밋으로 나누고, 문제가 생기면 해당 구현·시험·문구를 함께 revert한다.
FSD-006 이동은 기존 파일·import를 함께 복원한다. 새 schema/boundary와 그 소비자·시험, 추가 fixture/endpoint도 같은 변경으로 복원한다.
DB migration은 없으므로 schema rollback은 없다. 되돌릴 때 대응하는 시험·문구·검증 fixture도 함께 복원한다.

## Completion or Closure Notes

구현 기준은 `origin/dev`의 `c60a906498964ee2d72234b114319ddbc98a1bce`다. 최초 검토 기준과 앱 코드 차이가 없음을 확인하고
`harness/fsd-clean-code`를 만들었다. 작업 결과는 현재 작업 트리에 있으며 커밋·PR·배포는 이 작업에 포함하지 않았다.
기능·모델·시험·문구 변경과 인수가 완료되어 이 문서를 `completed/`로 이동했다.
원래 공개 문서 제안은 별도 브랜치의 문맥으로만 검토했고 이번 구현에 포함하지 않았다.
