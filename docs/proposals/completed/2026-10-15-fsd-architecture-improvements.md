---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-15"
approved-by: "requesting-user"
approved-at: "2026-10-15"
approval-scope: "사용자의 실제 코드 수정 요청에 따라 FSD-A01~04 전체 구현과 명시된 검증을 수행한다."
completed-at: "2026-10-15"
verification-summary: "FSD-A01~04 구현 완료; check·웹 606·fresh manifest 포함 서버 139·production build·정적 렌더 20건 및 공개 경로 검증 통과"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/completed/2026-10-15-fsd-frontend-clean-code-review.md"
---

# src/fsd의 책임 배치와 공개 경계 개선 제안

## Summary

`src/fsd`를 현재 [FSD 규칙](../../architecture/fsd.md)에 대조한 결과, layer 방향과 slice 간 import 경계는 대체로 잘 유지된다.
우선 개선점은 **일부 Server Action의 프로젝트 `slug` 런타임 검증 누락**이다.
그다음으로 제품 플랜 표시의 소유권과 백로그 화면·표의 공동 소유를 정리할 수 있다.
최종 채택은 **본문 3건: Should 1·Consider 2**, **외부 소비 테스트 부록 1건: Consider 1**이다. Must는 없다.
FSD-A01~04 전체를 구현하고 검증했다. 아래 Current State·Proposal·Execution Plan은 구현 전 판단과 계획을 보존한 기록이다.
구현 완료 여부의 기준은 front matter, Verification Results의 구현 후 결과, Completion or Closure Notes다.

## Goal

- 제품 도메인의 표시 계약과 범용 기반 코드를 FSD 책임에 맞게 배치한다.
- 한 화면과 함께 변경되는 UI·타입·테스트를 같은 page slice에서 찾을 수 있게 한다.
- 기존 동작·인가·Server Action 전달을 보존하며 public API를 필요한 계약으로 좁힌다.
- 잘못된 프로젝트 식별자가 DB 조회 조건으로 전달되기 전에 입력 경계에서 거부한다.

## Proposal Size

`standard`: 제안에는 서버 guard의 입력 경계 보강, 파일 이동·삭제, public API export 변경,
네 소비처의 import 변경 및 관련 테스트 정리가 포함된다. 새 의존성, DB schema 변경, URL 변경은 필요하지 않다.

## Current State

**관측 기준:** 2026-10-15, `harness/fsd-documentation`, HEAD `087a8bedddae1e36aa4ffbd8046ed799386ee598`.
최초 검토 시작 시 작업 트리는 깨끗했다. 아래 행 번호는 이 소스 기준이다.
후속 정합성 검토도 같은 HEAD에서 수행했으며, 시작 시 미추적 파일은 이 제안서 하나였다.
최초 검토 결과와 후속 검증 결과는 아래에서 구분한다.

| Layer | 파일 수 | 줄 수 | Slice 수 |
| --- | ---: | ---: | ---: |
| pages | 51 | 2,475 | 11 |
| widgets | 25 | 1,437 | 3 |
| features | 102 | 4,139 | 9 |
| entities | 29 | 1,000 | 3 |
| shared | 29 | 690 | slice 없음, segment 5개 |
| 합계 | **236** | **9,741** | **26** |

테스트 63개를 포함한 전체 파일을 검토했다. `src/app`의 소비처, 관련 서버 코드·테스트와 검사 설정을 보조 근거로 확인했다.
환경은 Next.js 16.3.3, React 19.2.8, TypeScript strict이며, 프레임워크 경계는 설치된 Next 문서를 기준으로 확인했다.

### 유지할 구조

- `pages → widgets → features → entities → shared` 방향과 public API 경로에 대한 `verify:fsd`가 통과한다.
- Server Action은 서버 조합 지점에서 bind하여 Client UI에 전달한다. `review-gate`의 잠금 provider에 의존하는 내부 컨트롤을 public API로 넓힐 이유가 없다.
- 폼 입력 schema와 상태 모델, 국소 UI 상태 및 인접 테스트는 이미 대부분 소유 slice에 모여 있다.
- `shared/ui`·`shared/lib`의 unit 경로와 `src/app`·`src/server`·`packages/core`의 별도 경계를 유지한다.
- [이전 개선 완료 기록](../completed/2026-10-15-fsd-frontend-clean-code-review.md)의 Team 우선순위, 입력 타입 파생, Reopen 오류 격리, 토큰 결과 미확인, Documents 식별자, Billing 표 이동, 고정 export 수 검사, radio 그룹 분리는 재구현하지 않는다.

자동 검사 통과는 책임 배치의 적절성이나 전체 런타임 동작을 증명하지 않는다.
[검증 문서](../../architecture/verification.md#fsd-규칙의-검증)가 명시하듯 slice 책임·공개 symbol의 적절성·간접 모듈 의존은 별도 리뷰 대상이다.

## Scope

검토 중심은 `src/fsd` 전체다. 후속 구현은 아래 개선 항목과 직접 연결된 소비처·테스트만 대상으로 한다.
`src/app`의 URL·인증 조합, 서버 권한·트랜잭션 정책, core의 플랜·파이프라인 규칙, 제품 문구는 보존한다.
FSD-A04에 한해 직접 의존하는 `src/server/auth/guard.ts`와 서버 시험을 지원 변경 범위로 명시한다.
이는 Action 입력 계약을 충족하는 보강이며 소유권·쓰기 권한 정책을 재설계하는 작업은 아니다.
운영 DB 검증, 배포, 전역 상태 도입, 토큰 폼의 일괄 공통화, 새로운 E2E runner 도입은 범위에 포함하지 않는다.

### 실행 단위와 기준 문서

| 단위 | 분류 | 실행 경계 |
| --- | --- | --- |
| FSD-A04 | Core | 먼저 처리할 입력 경계 보강. guard와 새 서버 시험만 수정한다 |
| FSD-A01·A02 | Phase 2 | 독립적으로 선택 가능한 소유권 개선. 각 항목의 파일 이동·소비처·검증을 함께 완료한다 |
| FSD-A03 | Phase 2 | 별도로 선택 가능한 외부 테스트 정리. 다른 항목의 선행 조건이 아니다 |
| 배포·실제 DB 변경·새 제품/인가 정책 | Out of scope | 이 문서로 실행하지 않는다 |

분류는 기존의 우선순위와 독립 선택 원칙을 명확히 한 것이며 구현 승인을 뜻하지 않는다.
실행할 단위는 front matter의 `approval-scope`에 기록한다. Core 완료만으로 미결정 Phase 2를 포함한 제안 전체를 완료 처리하지 않는다.
별도의 외부 승인 작업을 이 계획에 넣지 않으므로 `Approval-after` 항목은 없다.

구현 기준 묶음은 이 문서, `AGENTS.md`, `docs/architecture/README.md`·`fsd.md`·`test-organization.md`·`verification.md`,
`docs/proposals/README.md`·`template.md`, 아래 명시한 소스·fixture·명령이다.
과거 completed 제안서는 기존 개선을 재구현하지 않기 위한 배경이며 이번 실행 범위를 위임받지 않는다.
정합성 검토 프로필은 공통 인가 경계의 영향 때문에 **High-Risk**다. 이는 proposal 크기인 `standard` 및 지적 심각도와 별개다.

## Proposal

다섯 독립 렌즈의 원시 지적을 중립 품질 게이트가 소스와 대조하여 채택했다.
Should는 의미 있는 정확성·변경 위험, Consider는 근거가 있는 낮은 우선순위 개선이다.
규칙과 코드의 관측 사실, 영향의 추론, 검증하지 않은 런타임 결과를 구분한다.

| 우선순위 | ID | 내용 | 기여 관점 |
| --- | --- | --- | --- |
| Should | FSD-A04 | Action의 프로젝트 slug 런타임 검증 경계 보강 | TypeScript generalist |
| Consider | FSD-A01 | 제품 플랜 표시를 entity에서 소유 | Cohesion |
| Consider | FSD-A02 | BacklogTable과 테스트를 page에 배치 | Cohesion |
| Consider · 부록 | FSD-A03 | 외부 서버 테스트의 private schema 참조 정리 | Coupling |

### FSD-A04 — 프로젝트 slug의 런타임 입력 경계 보강

**분류:** Should / Action 입력 검증 계약의 공백. 기여 관점: TypeScript generalist.

**관측:** 다음 네 adapter 파일의 Action은 `slug: string`을 런타임 형태 검사 없이 프로젝트 guard에 전달한다.

- [manage-token.server.ts:12](../../../src/fsd/features/manage-token/api/manage-token.server.ts#L12)
- [edit-backlog.server.ts:11](../../../src/fsd/features/edit-backlog/api/edit-backlog.server.ts#L11)
- [edit-pipeline.server.ts:13](../../../src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts#L13)
- [automatic-scout.server.ts:9](../../../src/fsd/features/edit-pipeline/api/automatic-scout.server.ts#L9)

공통 [requireProjectOwner:15](../../../src/server/auth/guard.ts#L15)도 로그인 확인 뒤 원값을 `findFirst`의 `where.slug`에 넣는다.
생성된 Prisma `ProjectWhereInput.slug` 계약은 문자열과 `StringFilter`를 모두 허용한다.
반면 `review-gate`·`propose-item` Action에는 문자열·빈 값 검사가 이미 있다.

**규칙과 영향:** [Server와 Client 경계](../../architecture/fsd.md#server와-client-경계)는 각 Action의 입력 검증·인가를 요구하고,
`bind`가 이를 대신하지 않는다고 명시한다. TypeScript의 `string` 표기만으로는 런타임 값의 형태를 강제하지 못한다.
따라서 현재 공통 경계는 “특정 프로젝트의 문자열 식별자”라는 계약을 직접 보장하지 않는다.

**확인 범위:** 실제 `guard.ts`를 메모리에서 평가하고 인증·DB를 대역으로 바꾸어,
`undefined`, `null`, 숫자, 배열, `{ not: "other" }`, 빈 문자열 모두가 변환 없이 DB delegate까지 전달되는 것을 확인했다.
실제 SQL 실행, Action HTTP 전송, 잘못된 프로젝트 변경, 타인 프로젝트 권한 우회는 검증하지 않았다.
소유자 필터가 사라지는 문제로 해석하거나 입증된 보안 사고로 보고하지 않는다.

**제안:** 공통 `src/server/auth/guard.ts`의 `requireUser()` 다음, 프로젝트 조회 전에
`typeof slug === "string" && slug.trim().length > 0`을 확인하고 잘못된 값은 기존 `notFound()` 계약으로 거부한다.
정상 slug를 새 값으로 정규화하지 않고, Action의 공개 인자·반환형과 기존 인증 순서를 유지한다.
이는 FSD 내부에 서버 정책을 복제하지 않고 그 정책을 소유한 서버 경계에서 보완하는 지원 변경이다.
새 slice·공통 mutation hook을 만들거나 각 UI에 검증 책임을 넘길 필요는 없다.

**기존 시험의 한계:** [mutation-identifiers.test.ts:32](../../../tests/server/mutation-identifiers.test.ts#L32)는 tokenId·backlog key를 바꾸지만
slug를 항상 `"mine"`으로 넘기고 guard도 대역으로 교체한다. 이 시험 통과는 slug 경계의 증거가 아니다.

**완료 기준:** 실제 guard를 평가하는 새 `tests/server/project-guard.test.ts`가 아래 소비 목록과 동작 표를 모두 검증한다.
`requireUser()`·`requireProjectWrite()`의 구현과 여섯 adapter 파일은 변경하지 않는다.
`requireProjectOwner()`에 입력 거부 조건만 추가하며 `catch`로 Next 제어 흐름을 일반 오류나 `ActionResult`로 바꾸지 않는다.
소유자의 읽기·토큰 폐기는 읽기 전용 프로젝트에서도 유지한다. 발급·이름 변경의 가용성 판정은 기존 서버 서비스가 계속 담당한다.
새 테스트 경로는 제안이며 아직 존재하지 않는다.

#### 공통 guard의 전체 소비 목록

`src`의 import AST와 symbol 검색을 대조했을 때 외부 소비 파일은 **14개: adapter 6개·route 8개**다.
앞의 네 파일은 검증 누락의 근거이며, 공통 guard 변경의 전체 영향 범위와 같지 않다.

| `src/fsd/features/` 기준 adapter | 공개 Action — 전부 회귀 대상 |
| --- | --- |
| `manage-token/api/manage-token.server.ts` | `issueToken`, `issueOwnerToken`, `revokeToken`, `revokeOwnerToken`, `renameToken`, `renameOwnerToken` |
| `edit-backlog/api/edit-backlog.server.ts` | `addBacklogItem`, `updateBacklogItem`, `removeBacklogItem` |
| `edit-pipeline/api/edit-pipeline.server.ts` | `savePipeline` |
| `edit-pipeline/api/automatic-scout.server.ts` | `saveAutomaticScout` |
| `review-gate/api/review-gate.server.ts` | `retryAcceptance`, `humanTransition`, `approveGate`, `discardItem` |
| `propose-item/api/propose-item.server.ts` | `proposeItem` |

route 대상은 `src/app/(app)/p/[slug]/` 아래의 **8개 파일**인 `layout.tsx`, `page.tsx`, `backlog/page.tsx`, `history/page.tsx`,
`inbox/page.tsx`, `items/[key]/page.tsx`, `pipeline/page.tsx`, `tokens/page.tsx`다.
각 파일은 수정하지 않고 guard 거부 시 후속 데이터 조회·렌더 본문으로 진행하지 않는지 검증한다.
`requireUser()`만 소비하는 계정 화면·Action은 이 변경에서 로직이 달라지지 않는다.

#### 입력·인증·부수효과 검증 표

| 시작 조건 | 보존하거나 보강할 결과 | 검증 도착점 |
| --- | --- | --- |
| 로그인, `undefined`·`null`·숫자·배열·filter 객체·빈 문자열·공백 문자열 | guard는 프로젝트 조회 전에 `notFound()`; 프로젝트 조회·가용성 조회·mutation·revalidation 0회 | 새 guard 시험, 앞의 Action 11개와 route 8개 연결 |
| 미로그인, 어떤 slug든 guard를 호출함 | 기존 `/login` redirect가 입력 판정보다 우선; 프로젝트 조회 0회 | `requireProjectOwner`·`requireProjectWrite` 직접 호출 및 연결 시험 |
| review-gate 4개·propose 1개에 비문자열 또는 길이 0 slug | 기존 Action 선검증의 failure 반환·guard 호출 0회 유지. 공통 guard 기준으로 일괄 재작성하지 않음 | 동일 새 시험 + 기존 `review-gate-actions.test.ts` |
| 위 다섯 Action에 공백만 있는 slug | 선검증을 통과하므로 guard의 인증 다음 새 not-found 판정 적용 | 새 연결 시험 |
| 정상 문자열·소유 프로젝트 | `where`의 `ownerUserId`와 원래 slug 유지, 각 Action의 기존 성공 결과·무효화 경로 유지 | 새 시험 + 기존 Action 회귀 |
| 앞뒤 공백을 포함하지만 비어 있지 않은 문자열 | `trim()`은 빈 값 판정에만 사용; 조회 인자 자체는 정규화하지 않음 | 새 guard 시험에서 원값 비교 |
| 타인 또는 없는 프로젝트 | 동일 not-found, 후속 변경·가용성 조회·재검증 없음 | 실제 guard + DB 대역의 owner-scoped 조회 검사 |
| 미선택·연결 해제 프로젝트 | owner guard는 읽기·토큰 폐기를 허용; write guard는 기존 사유로 거부. 발급·이름 변경은 기존 서비스 가용성 검사 유지 | 새 owner/write 분기 시험, 두 revoke 연결, 기존 서비스 회귀 |
| auth·프로젝트 조회·가용성 조회의 예외 | 원래 예외를 전달, 후속 변경·revalidation 없음 | 새 guard 시험에서 주입한 예외 identity 비교 |

새 시험은 `tests/server/fixtures/load-module.ts`로 **실제 guard를 먼저 평가**하고 그 export를 실제 Action/route에 주입한다.
인증 provider·DB·서비스·cache IO만 사례별 대역으로 격리한다. Action에 무조건 성공하는 guard 대역을 넣은 기존 시험만으로 완료 처리하지 않는다.
타입 참조는 기존 slice public API를 사용하며, 시험을 위해 schema·guard를 FSD public API에 추가하지 않는다.
fixture/spy는 사례마다 새로 만들고 서버 bootstrap은 해당 Node test process에서만 사용한다. 운영 DB·전역 환경·실제 로그인 상태를 수정하지 않는다.
발급의 기존 서비스 정책은 `src/server/project-token-service.test.ts`가 연결 해제·미선택·타인·플랜 제한을 검증하며 `test:web`에 포함된다.
이름 변경의 `src/server/token-management-query.ts`는 수정하지 않고, 새 Action 연결 시험에서 서비스에 전달되는 소유 ID와 거부 결과 전파를 보존한다.
실제 DB를 쓰는 `tests/server/integration/token-management.test.ts`의 트랜잭션 인수는 이번 범위 밖이다. schema·서비스·트랜잭션을 바꾸게 되면 범위를 재검토해야 한다.

### FSD-A01 — 제품 플랜 표시를 entity에서 소유

**분류:** Consider / 책임 배치 정합성. 기여 관점: Cohesion.

**관측:** 이동 전 `entitlement-copy.ts`([현재 plan-label.ts:2](../../../src/fsd/entities/account-plan/model/plan-label.ts#L2))는 core의 `Plan` 타입에 의존하며,
같은 파일 4행에서 `free/pro/max`의 표시 이름을 정의한다. 실제 소비자는 다음 네 곳이다.

- [BillingPage:3](../../../src/fsd/pages/billing/ui/billing-page.tsx#L3)
- [project-list-copy:3](../../../src/fsd/pages/project-list/model/project-list-copy.ts#L3)
- [AppHeader:4](../../../src/fsd/widgets/app-header/ui/app-header.tsx#L4)
- [project-connection-state:3](../../../src/fsd/features/manage-project-connection/model/project-connection-state.ts#L3)

**규칙과 판단:** [Layer 책임](../../architecture/fsd.md#layer와-프로젝트-slice)은 도메인 명사·표시·안정적 모델을 entities에,
제품 도메인을 모르는 기반을 shared에 둔다. 현재 함수는 범용 문자열 포매터가 아니라 Stagekeeper 플랜의 표시 계약이다.
값 오류나 중복은 없지만, 이를 기반 layer에 남겨 두면 이후 제품 플랜 표현도 shared에 쌓일 수 있다.

**제안:** 새 `entities/account-plan/model/plan-label.ts`와 인접 `plan-label.test.ts`로 구현·테스트를 옮긴다.
`entities/account-plan/index.ts`는 `planLabel`만 명시적으로 공개하고, 네 소비처는 `@/fsd/entities/account-plan`을 사용한다.
모든 소비처가 더 높은 layer이므로 같은 layer 의존을 새로 만들지 않는다.
새 slice 이름은 이 제안의 실행 경로로 `account-plan`을 사용한다. 현재 존재하지 않으므로 `entities/account-plan/model/`을 먼저 만든다.

기존 `shared/lib/entitlement-copy.ts`·테스트를 제거한다. shared에서 새 entity를 재수출하는 호환 barrel은 상향 의존이므로 만들지 않는다.
Billing 전용 `planMatrix`·안내·테스트는 Billing에 유지하고, `Plan`·한도·정책의 원본은 core에 유지한다.

**함께 바꿀 검사:** [plan-matrix.test.ts:10](../../../src/fsd/pages/billing/model/plan-matrix.test.ts#L10)은 옛 파일을 읽고,
22행은 옛 `planLabel` import 경로를 고정한다. 새 위치와 공개 API에 맞게 갱신하되 Billing 표의 로컬 소유·실제 값 검증은 유지한다.
옛 파일을 계속 읽는 검사 대신 옛 파일 부재와 새 entity public API를 확인한다.
이동한 `plan-label.test.ts`는 `./plan-label`을 import하고 기존 세 플랜 표시·표 모델 미노출 검증을 유지한다.

**완료 기준:** 네 소비처가 새 public API를 사용하고 `Free/Pro/Max` 표시가 동일하다. 옛 경로와 상향 import가 없고 관련 모델·렌더 테스트가 통과한다.

**이전 작업과의 관계:** 과거 제안은 Billing 전용 표를 이동하면서 공용 라벨 경로를 유지했다.
이번은 이미 이동한 표를 다시 옮기는 작업이 아니라, 남은 표시 계약을 현재 아키텍처의 shared 책임 기준으로 재검토하는 후속 제안이다.

### FSD-A02 — BacklogTable과 테스트를 project-backlog page에 배치

**분류:** Consider / 화면 응집도 개선. 기여 관점: Cohesion.

**관측:** 이동 전 feature의 `BacklogTable`([현재 page 소유 파일:32](../../../src/fsd/pages/project-backlog/ui/backlog-table.tsx#L32))은 목록의 열·빈 상태·Source 펼침·작성자·상태·제거 사유를 표시한다.
실제 변경 동작은 [ProjectBacklogPage:31](../../../src/fsd/pages/project-backlog/ui/project-backlog-page.tsx#L31)가 `renderRowActions`로 조합한다.
운영 소비처는 이 page 하나다. `BacklogRow`도 현재 편집 feature의 public API에 노출된다.

**규칙과 판단:** [코드 배치와 추출 판단](../../architecture/fsd.md#코드-배치와-추출-판단)은 한 화면의 주된 내용이며 함께 변경되는 UI를 page에 유지한다.
사용처 수만이 근거는 아니다. 표의 주 책임이 화면 전체 목록 표현이고, 추가·제거·보드 올리기 동작은 별도 컴포넌트가 소유하기 때문이다.
현재 화면 표현을 수정하려면 page와 편집 feature를 함께 탐색해야 한다.

**제안:** `features/edit-backlog/ui/backlog-table.tsx`와 `backlog-table.test.mjs`를
`pages/project-backlog/ui/`로 함께 이동한다. `BacklogRow`는 표 파일에 유지하고 page에서 상대 경로로 참조한다.
`features/edit-backlog/index.ts`의 `BacklogTable`·`BacklogRow` export를 제거한다.
폼·제거 버튼·Action은 기존 feature에 유지한다. 새 widget·entity를 만들거나 표 전체에 `"use client"`를 추가하지 않는다.

**완료 기준:** 표는 page 내부 상대 import로 연결된다. 기존 서버 조합과 행별 Action 연결,
읽기 전용 Source 표시, 제거 사유, 쓰기 불가 시 mutation slot 미호출이 그대로다.
표 테스트는 새 위치에서도 `npm run test:web` 탐색에 포함된다.

## Appendix — 외부 소비처의 경계 보완

### FSD-A03 — 외부 서버 테스트의 private schema 참조 정리

**분류:** Consider / 외부 소비처의 경계 보완. 기여 관점: Coupling.
변경 위치가 `src/fsd` 밖이므로 내부 개선과 별도 작업으로 취급한다.

**관측:** [review-gate-actions.test.ts:9](../../../tests/server/review-gate-actions.test.ts#L9)의 두 Action 타입 import와 11행의 schema 값 import는 slice 내부 경로를 직접 참조한다.
109·140행은 VM mock에 `../model/review-gate-input` 경로까지 고정한다.
Action 공개 계약이 같아도 내부 schema 파일을 분리·이동하면 외부 시험을 함께 고쳐야 한다.

**규칙:** [Public API](../../architecture/fsd.md#public-api)와 [테스트 의존성 경계](../../architecture/test-organization.md#의존성-경계)는
외부 import가 public API를 사용하도록 하고, 테스트 편의를 위한 공개 symbol 추가를 금지한다.

**제안:** 타입은 기존 `review-gate/index.server.ts`의 공개 Action에서 가져온다.
두 수동 VM 시험은 같은 파일 앞부분이 이미 사용하는 [loadModule](../../../tests/server/fixtures/load-module.ts#L8)로 정리하여
private schema import와 수동 mock 항목을 제거한다. schema를 public API에 추가하지 않는다.
Action adapter를 시험 대상으로 읽는 기존 fixture 경로와 모든 인증·검증·재검증·예외 assertion은 보존한다.
두 타입은 `import type`으로 `@/fsd/features/review-gate/index.server`에서 참조한다.
기존 두 VM 블록의 결과 객체를 `loadModule` 반환값으로 바꾸고 불필요해진 `readFileSync`·`createRequire`·`runInNewContext`·`typescript` import를 제거한다.
`loadModule` 구현, `reviewFile`, 앞부분의 Action 목록, `../model/review-gate-input` 원본 schema는 변경하지 않는다.

**완료 기준:** 외부 시험에 private schema import·mock 경로가 없고, 원래 Action 호출 계약 검증이 유지된다.
이 변경만으로 외부 테스트 전체의 public API 준수를 보장한다고 주장하지 않는다.

## Affected Files

| 항목 | 영향 파일·영역 | 작업 및 리스크 |
| --- | --- | --- |
| FSD-A04 · Core | `src/server/auth/guard.ts`, 새 `tests/server/project-guard.test.ts` | guard 조건 추가와 전체 소비 연결 시험. 기존 Action·route·회귀 파일은 읽기/실행 대상이며 수정하지 않음 |
| FSD-A01 | `src/fsd/shared/lib/entitlement-copy.ts`·`.test.ts` → 새 `entities/account-plan/model/plan-label.ts`·`.test.ts`, 새 slice `index.ts` | 표시 모델·테스트 이동, 기존 경로 제거. 공개 경로와 네 소비처를 함께 변경해야 함 |
| FSD-A01 | 앞서 열거한 네 소비처, `pages/billing/model/plan-matrix.test.ts` | import·기존 소유권 검사 갱신. Billing 표와 core 정책 보존 |
| FSD-A02 | `features/edit-backlog/ui/backlog-table.tsx`·`.test.mjs` → `pages/project-backlog/ui/`, 두 slice의 기존 소비·export 파일 | UI·테스트 공동 이동, page 상대 import와 feature export 축소. Server Component 조합 보존 |
| FSD-A03 | `tests/server/review-gate-actions.test.ts` | 기존 fixture 사용으로 private schema 결합 제거. 제품 구현·schema 변경 없음 |

표의 `src/fsd` 생략 경로는 해당 root 기준이다. 새 파일은 명시한 것만 제안한다.
`src/app`·core·DB·패키지 설정은 보존하고, 서버 구현 변경은 명시한 guard의 입력 검사에 한정한다.

### 이동과 공개 API의 도착점

| symbol/파일 | 현재 소유·공개 | 변경 후 참조 | 확인할 도착점 |
| --- | --- | --- | --- |
| `planLabel`·비공개 `PLAN_LABEL` | `shared/lib/entitlement-copy.ts` unit | `entities/account-plan/model/plan-label.ts`; 새 `index.ts`는 `planLabel`만 명시 export | 네 소비처의 `@/fsd/entities/account-plan` import; `PLAN_LABEL`·Billing 표·테스트 helper는 public API에서 미노출 |
| `Plan` | `@harness/core/entitlement.mjs` 타입 | 새 모델과 기존 소비처의 type import 유지 | core 정의·한도 파일 불변, entity에 정책 복제 없음 |
| `planMatrix`·`PlanRow`·`BILLING_NOTE` | `pages/billing/model/plan-matrix.ts` | Billing 내부 상대 import 유지 | 새 entity/shared에서 재export하지 않음; Billing 표 8행과 안내 동일 |
| `BacklogTable`·`BacklogRow` | feature UI → `features/edit-backlog/index.ts` | `pages/project-backlog/ui/backlog-table.tsx`; page는 `./backlog-table` 상대 import | feature export 두 개 제거, page index에는 기존 `ProjectBacklogPage`만 유지 |
| 표의 하위 의존 | `statusLabel`, `Chip`, `backlogHref`, `Table/Td/Th/Tr`, `Link`, `ReactNode` | 기존 절대 public import 유지 | 새 위치에서도 모두 하위 layer/외부 package로 해석; 일반 row callback은 서버 내부에 유지 |
| `BacklogForm`·`RemoveBacklogButton`·두 Action 타입 | `features/edit-backlog/index.ts` | page의 기존 feature public import 유지 | 폼·제거 동작 export 불변; 표 이동 때문에 feature의 다른 API 제거 금지 |
| `ApproveGate`·`RetryAcceptance` 테스트 타입 | `review-gate/api/review-gate.server` 직접 참조 | 기존 `index.server.ts`의 `approveGate`·`retryAcceptance`를 type-only import | runtime server barrel import 없음; schema public export 추가 없음 |

파일 사전 점검에서 이동 원본 네 파일과 모든 소비처는 존재했다. 새 모델 두 파일·entity index·이동한 표 두 파일·새 guard 시험의 **6개 도착 파일은 모두 없었다**.
`pages/project-backlog/ui`와 `tests/server`는 이미 존재하며 `entities/account-plan/model`만 먼저 생성해야 한다.
이동 후 옛 `shared/lib/entitlement-copy.ts`·`.test.ts`, `features/edit-backlog/ui/backlog-table.tsx`·`.test.mjs`는 남기지 않는다.
문서의 과거 경로 기록과 옛 경로 **부재를 검사하는 테스트 문자열**은 삭제 대상 import로 오인하지 않는다.

## Safety Analysis

- 정적 import·export와 실제 route 소비처를 확인했다. 제안하는 두 이동 대상에 dynamic import 소비는 발견하지 못했다.
- FSD-A01은 네 기존 소비처가 동일 표시 계약을 사용하는 경우다. FSD-A02는 상위 page에 화면 표현을 돌려놓으므로 새 교차 slice 의존이 필요 없다.
- 실제 action 참조와 서버 안에서 생성한 `renderRowActions`를 기존 서버 조합 안에 유지한다. 일반 콜백을 Client 경계로 넘기는 변경은 하지 않는다.
- 파일 이동 시 테스트도 함께 옮긴다. public API에 테스트 helper나 schema를 추가하지 않는다.
- FSD-A04는 로그인 확인 후 malformed 식별자만 조회 전에 거부한다. owner guard와 write guard의 차이, 기존 다섯 Action의 선검증 순서도 보존한다.
- 공개 자산 URL·localStorage·외부 SDK·DB 데이터 변경은 없다. 실제 원격 취약점의 재현·해결을 주장하지 않는다.

## Approval

사용자의 후속 구현 요청으로 네 항목 전체가 선택되었다. 승인 기록은 front matter에서만 관리한다.
배포·실제 DB 변경은 포함하지 않는다.

## Execution Plan

1. 구현 시점의 소스·소비처·작업 트리를 다시 확인하고 `dev` 기준 `harness/<topic>` 브랜치에서 진행한다.
2. Core가 승인되면 FSD-A04의 새 guard 시험에 16개 Action·8개 route와 동작 표를 연결하고 입력 조건을 보강한다. 다른 구조 이동 없이 독립적으로 완료한다.
3. FSD-A01이 승인되면 새 부모 디렉터리 생성 → 모델·테스트 이동과 index 생성 → 네 소비처·Billing 구조 검사 갱신 → 옛 파일 부재 검증 순서로 처리한다.
4. FSD-A02가 승인되면 표·테스트 이동, page 상대 import, feature export 두 개 제거를 함께 수행한다. 슬롯·폼·route 조합은 유지한다.
5. FSD-A03이 승인되면 type-only public import와 기존 fixture로 두 VM 블록을 정리하고 private schema mock 및 불필요한 import를 제거한다.
6. 선택한 항목의 검증과 저장소 공통 게이트를 통과시킨다. PR을 만들 경우 base는 `dev`이며 `check`가 green이어야 병합할 수 있다.

## Verification Plan

다음은 **후속 구현 시 실행할 계획**이며 이번 문서 작성에서 통과한 것으로 취급하지 않는다.

| 항목 | 관련 검증 | 통과 기준 |
| --- | --- | --- |
| FSD-A04 · Core | 새 `tests/server/project-guard.test.ts`; 기존 서버 회귀 6개는 아래 명령에 명시 | 앞의 전체 입력·인증·부수효과 표 통과. 정상 slug의 16개 Action, 거부되는 8개 route, 두 revoke의 읽기 전용 허용까지 포함 |
| FSD-A01 · Phase 2 | 새 `entities/account-plan/model/plan-label.test.ts`, Billing `model/plan-matrix.test.ts`·`ui/billing-page.test.ts`, project-list `model/project-list-copy.test.ts`·`ui/project-list-page.test.mjs`, 연결 관리 `model/project-connection-state.test.ts` | 세 플랜 라벨·네 소비처 결과 동일, 공개 API 명시 export, 옛 두 파일 부재. 기존 구조 검사의 옛 파일 읽기는 제거 |
| FSD-A02 · Phase 2 | 이동한 `pages/project-backlog/ui/backlog-table.test.mjs`와 아래 화면 본문 확인 | Source·제거 사유·읽기 전용 동작·빈 목록·편집 링크·Action 슬롯 보존, 옛 두 파일 및 feature의 표/행 타입 export 부재 |
| FSD-A03 | `node --import ./tests/server/register-server-only.mjs --import tsx --test tests/server/review-gate-actions.test.ts` | 기존 인가 순서·잘못된 입력 거부·재검증·예외 identity assertion 유지 |
| 선택한 전체 변경 | 아래 공통 명령 | FSD·lint·타입·관련 회귀·빌드 통과. 기준선 실패와 신규 실패 구분 |

```bash
npm run verify:fsd
env TMPDIR=/private/tmp npm run test:architecture
env TMPDIR=/private/tmp npm run check
npm run test:web
npm run test:server
npm run build
env RDC_CHECK_ACTION_MANIFEST=true npm run test:server
```

위 명령은 현재 macOS/zsh 기준이며 Linux CI에서는 두 `TMPDIR` 지정 없이 기존 npm script를 사용한다.
`check`에는 lint·타입·architecture 검사가 포함된다. 새 checkout에서는 lockfile 기준 의존성과 `npm run db:generate`로 준비한 Prisma client가 선행 조건이다.
`build`도 `scripts/build.mjs`에서 Prisma generate를 먼저 실행하며 DB 연결은 필요하지 않는다.
생성 파일을 손으로 수정하지 않는다. 마지막 manifest 검사는 **직전 성공한 fresh build**에만 실행한다.

현재/수정 후 같은 경로에서 실행하는 서버 회귀 6개는 다음과 같다. 새 guard 시험은 Core 구현 후 여기에 추가하고 `npm run test:server`에서도 탐색되는지 확인한다.

```bash
node --import ./tests/server/register-server-only.mjs --import tsx --test \
  tests/server/review-gate-actions.test.ts \
  tests/server/mutation-identifiers.test.ts \
  tests/server/automatic-scout-actions.test.ts \
  tests/server/pipeline-save.test.ts \
  tests/server/token-issuance-bindings.test.ts \
  tests/server/project-page-loaders.test.ts
```

새 guard 시험의 manifest 조건부 검사는 기존 `tests/server/fixtures/action-manifest.ts`를 사용한다.
여섯 adapter의 표에 열거한 16개 Action 등록을 확인하고, `src/server/auth/guard.ts`는 원격 Action으로 등록되지 않아야 한다.
`.next/server/server-reference-manifest.json`의 node/edge/worker 구조를 파싱하는 기존 fixture를 유지하며 ID 문자열을 고정하지 않는다.
새 registry·listener·timer는 만들지 않는다. stale `.next`나 정적 텍스트 검색을 등록 증거로 삼지 않는다.

### 실제 본문과 변경 후 경로 확인

| 최종 표면 | 소유자와 본문 의존 | 확인할 내용·도착점 |
| --- | --- | --- |
| `/billing` 플랜 문장·표, `/projects` 연결/선택 안내 | 새 entity의 `planLabel`; Billing 표는 기존 `plan-matrix`; core 한도 유지 | 세 라벨, `(current)`, Billing 8행·안내, 연결/미선택 문장. 위 기존 모델·렌더 시험에서 확인 |
| `/projects` 재연결 제한 문장 | `ProjectConnectionControl` → `reconnectBlock` → 새 entity | Free/Pro의 가득 찬 슬롯 문장과 Max 허용; 연결 모델 시험 유지 |
| AppHeader 플랜 배지 | `widgets/app-header/ui/app-header.tsx` → 새 entity | `/billing`, `/projects`, `/p/new`, `/settings/tokens` 및 `/p/[slug]/layout.tsx`의 동일 헤더. 세 플랜 배지·billing 링크를 실제 AppHeader 정적 렌더로 비교; `plan` 미지정이면 배지 없음 |
| `/p/[slug]/backlog` 표와 조작 | route → 기존 page API → 이동한 표; row callback은 서버 조합, 버튼은 기존 feature | 쓰기 가능/불가 × 빈/활성/제거 행, `?edit=` 링크·Source·제거 사유, canWrite=false 시 slot 미호출. 활성 행의 status=null일 때만 Propose 표시, Remove는 유지. 기존 표 시험과 실제 page 조합의 정적 렌더/화면 확인 |
| 거부된 프로젝트 요청 | 공통 guard → Next `notFound`/`redirect`; 기존 `(app)/not-found.tsx`, `p/[slug]/not-found.tsx`, `/login` | 기존 interrupt를 유지. 외부 프로젝트 존재 여부를 추가 노출하지 않으며 HTTP 상태만으로 본문을 판정하지 않음 |
| Action registry·생성 타입 | Next fresh build와 Prisma generator; `next.config.mjs`, `prisma/schema.prisma`, `prisma.config.ts`는 불변 | 구조화 manifest와 동일 Action export 집합, `ProjectWhereInput` 생성 원본 보존. schema·config·generator 변경 없음 |

구조 확인은 새 여섯 도착 파일의 존재와 옛 네 파일의 부재를 함께 검사한다.
TypeScript AST의 import/export declaration 기준으로 네 `planLabel` 소비처, page의 `./backlog-table`, feature의 표 export 제거,
두 테스트 타입의 `index.server` 연결, 새 entity의 명시 `planLabel` export를 확인한다. wildcard/re-export로 옛 API를 다시 노출하지 않는다.
FSD-A03에서는 해당 시험 파일의 schema import와 두 mock key만 없어야 하며 시험 대상 소스를 읽는 `reviewFile`은 남아야 한다.
정적 렌더는 이벤트·HTTP 전송을 증명하지 않는다. 위 조합을 변경하게 된다면 해당 화면의 실제 동작을 추가 검증하고 범위 변경을 기록한다.

## Verification Results

### 구현 후 결과

구현 기준은 최신 원격 `dev`의 `e3bf99f3ec12df08748bdef5af7266229a0f330d`이며 작업 브랜치는 `harness/fsd-architecture-improvements`다.
최초 정합성 검토 HEAD와의 차이는 아키텍처 설명 정리뿐이며 대상 소스·테스트·설정에는 차이가 없었다.

| 검증 | 실제 결과 |
| --- | --- |
| 신규 malformed slug 회귀 | guard 수정 전에는 거부되지 않아 실패, 수정 후 통과 |
| `npm run verify:fsd` | PASS |
| `env TMPDIR=/private/tmp npm run check` | PASS: 복사본 검사·ESLint·Next typegen·TypeScript·아키텍처 44 pass/2 Windows 전용 skip·가용성 검사 18 pass |
| `env TMPDIR=/private/tmp npm run test:web` | 606 pass, 0 fail |
| `env TMPDIR=/private/tmp npm run test:server` | 132 pass, 0 fail, 1 manifest 조건부 skip |
| `npm run build` | PASS: Prisma generate, Turbopack production compile, TypeScript, 정적 페이지 18개 생성 |
| `env TMPDIR=/private/tmp RDC_CHECK_ACTION_MANIFEST=true SRC_CHECK_INBOX_MANIFEST=true npm run test:server` | 139 pass, 0 fail, 0 skip. 16 Action 등록·guard 비공개 및 기존 Client/Server manifest 검증 포함 |
| 실제 `AppHeader`·`ProjectBacklogPage` 정적 렌더 | 플랜 배지 4종 + 백로그 16조합 통과. 읽기/쓰기·빈/미제안/보드 등록/제거 행·추가/편집 폼을 확인했고 렌더 중 Action 호출 없음 |
| 파일·공개 API 구조 검사 | 새 도착 파일 6개 존재, 옛 파일 4개 부재, 네 라벨 소비처와 page 상대 import, feature export 축소, review-gate type-only public import 확인 |

검증 환경의 실패도 구분했다. sandbox 안의 전체 web 시험은 loopback `listen EPERM` 때문에 실패했고,
권한 제한 없이 실행하되 macOS 별칭이 없는 `TMPDIR=/private/tmp`를 지정해 전체 통과했다.
기본 build도 PostCSS worker의 포트 권한 오류가 발생했다. 기존 `.next/cache/turbopack`을 저장소 밖 임시 경로에 보존하여 분리한 뒤,
권한 제한 없이 같은 `npm run build`를 실행해 통과했다. Next 설정이나 빌드 스크립트는 변경하지 않았다.
manifest 시험은 이 성공한 production build 직후 실행했다. 실제 DB·HTTP 인수·브라우저 이벤트·배포는 이 변경의 검증 범위에 포함하지 않았다.

### 최초 검토 기준선

아래는 **최초 제안 작성 때의 코드 변경 전 기준선**이다. 후속 정합성 검토에서 재실행한 기록이나 구현 완료 증거가 아니다.

| 실행 | 결과 | 해석 |
| --- | --- | --- |
| `npm run verify:fsd` | PASS | 검사기가 지원하는 현재 소스 경계 통과 |
| `npm run test:architecture` | 최초 실패: 29 pass, 15 fail, 2 skip | macOS 기본 임시 디렉터리의 `/var`와 realpath `/private/var` 차이가 Windows runtime-cache 시험의 alias 검사·CLI 진입 판정에 영향 |
| `TMPDIR=/private/tmp npm run test:architecture` | PASS: 44 pass, 0 fail, 2 skip | canonical 임시 경로로 동일 suite 재실행. Windows 실제 LPAC 전용 두 시험은 이 환경에서 미실행 |
| `node --input-type=module` 메모리 VM 확인 | 입력 7종 모두 DB 대역 호출 1회, 원값 보존 | 실제 `guard.ts`를 `typescript.transpileModule`로 평가. 정상 문자열 대조군 1종과 malformed 6종. 인증·DB는 fixture이며 실제 DB·HTTP 호출 없음 |
| 문서 링크·metadata·ID·공백 검사 | PASS | 로컬 링크 24개와 행·절 참조, 고유 개선 ID 4개, pending 위치·승인 metadata 확인 |
| SDD traceability validator, standard mode | PASS, 정의·관계 0개 | 개선 제안서의 형식 검사만 수행. REQ 기반 SDD나 확정 구현 계획의 완전성을 검증한 결과는 아니며 strict는 적용하지 않음 |
| `npm run check`, `npm run test:web`, `npm run build`, 관련 서버 시험 | Not run | 문서만 추가한 작업이며 구현 검증 계획으로 남김 |

기존 실패 때문에 검사기를 수정하거나 예외를 추가하지 않았다. 향후 macOS 실행에서도 같은 임시 경로 조건을 구분해 기록한다.

### 후속 정합성 검토에서 실행한 확인

| 확인 | 결과 | 한계 |
| --- | --- | --- |
| 위 서버 회귀 6개 명령 | 26 pass, 0 fail | 현재 코드의 기존 시험이며 새 guard 시험은 아직 없음 |
| 현재 위치의 라벨·Billing·프로젝트 목록·연결 모델·표 시험 7개 파일 | 28 pass, 0 fail | 이동 전 기준선. 이동 후 새 도착 경로로 다시 실행해야 함 |
| 실제 guard에 제안 조건을 메모리에서만 삽입, 실제 16개 Action과 조합 | 192개 검증 사례 통과 | Next의 실제 notFound/redirect interrupt 사용. 인증·DB·서비스는 대역; 파일·실제 DB·HTTP 변경 없음 |
| 메모리 guard와 route 8개 연결 | malformed·guest·foreign 각 1건, 총 24건 통과 | 후속 데이터 함수 미호출을 확인. 실제 HTTP·브라우저 검증 아님 |
| 실제 AppHeader·BacklogTable의 정적 본문 확인 | 플랜 배지 4종·표 6종, 총 10건 통과 | 현재 소스의 HTML·링크·slot 호출 조건 확인. 이동 후 구현·브라우저 이벤트 증거는 아님 |
| import AST와 symbol 검색 교차 확인 | guard 외부 소비 14파일, namespace 우회 import 없음 | 현재 source 기준; 구현 직전 다시 확인 |
| 이동 원본·부모·충돌 점검 | 원본 존재, 신규 6파일 충돌 없음 | 새 account-plan/model 부모는 구현 때 먼저 생성 |

메모리 후보 검증의 192건은 16개 Action × (malformed 7종 + 미로그인·타인·정상 3종) 160건,
두 guard의 원값·없는 프로젝트·읽기 전용 및 미로그인 분기 20건, write Action 10개 읽기 전용 거부와 revoke 2개 허용 12건이다.
새 정합성 검토를 이유로 기존 `check`·전체 web/server·build·fresh manifest가 통과했다고 갱신하지 않는다.

## Definition of Done

- 승인된 단위의 변경 파일만 수정하고, public API·상태·인가 정책·route 보존 범위를 지킨다.
- Core 완료는 새 시험이 전체 소비 목록과 입력·인증 표를 검증하고 기존 회귀를 유지한 경우에만 기록한다.
- Phase 2 이동 완료는 새 파일 존재·옛 파일 부재·전체 import/export 연결·기존 본문 보존이 모두 확인된 경우에만 기록한다.
- FSD-A03 완료는 두 테스트 타입과 schema mock 결합이 정리되고 기존 assertion이 유지된 경우다. 내부 소스 경로를 모두 제거했다고 보고하지 않는다.
- 관련 시험, FSD·lint·타입·architecture·web·server·fresh build/manifest의 실제 결과와 기존 환경 실패를 분리해 기록한다.
- 미실행 Phase 2가 남으면 이 제안은 active에 유지한다. 전체를 수행·검증했거나 남은 항목의 미실행 결정이 명시된 뒤 저장소 완료/닫힘 규칙을 적용한다.

## Review Coverage

**Full applicable-lens review** — 독립 렌즈 다섯 개가 전체 대상을 검토했다.
중립 게이트는 네 지적의 근거·소비처·규칙을 재확인했다. 게이트가 전체 파일을 다시 검토한 것으로 집계하지 않는다.

| 렌즈 | 결과 | 원시 ID → 최종 ID |
| --- | --- | --- |
| Cohesion | Completed, Consider 2건 | COH-01 → FSD-A01, COH-02 → FSD-A02 |
| Coupling | 대상 내부 No supported findings, 외부 소비 부록 Consider 1건 | CPL-01 → FSD-A03 |
| Predictability | No supported findings | 없음 |
| Readability | No supported findings | 없음 |
| TypeScript generalist | Completed, Should 1건 | TS-01 → FSD-A04 |

원시 지적 네 건은 모두 `accept`다. 중복 병합·기각·보류·미완료·Skipped·Unavailable·N/A는 없다.
검토 중 수행한 VM 확인은 FSD-A04의 입력 전달 근거만 보강한다. 후속 구현의 회귀 검증과 구분한다.
현재 slot 조합에 결합도 문제가 없다는 판단과, 표의 소유 위치를 page로 옮길 수 있다는 판단은 서로 다른 관점이다.

## Risks and Rollback

- FSD-A04는 먼저 처리할 입력 경계 공백이다. 실제 원격 변경까지의 영향은 미검증이며, 수정 후에도 입력·인증·Action 연결 시험을 생략하면 안 된다.
- 나머지 개선의 주효과는 유지보수와 책임 구분이다. 현재 기능 장애·성능 저하가 입증된 것은 아니므로 관련 기능 작업과 함께 반영해도 된다.
- FSD-A01의 작은 새 entity가 추가하는 탐색 비용과 도메인 소유권의 명확함을 함께 판단한다. 이동하더라도 정책까지 entity로 복제하지 않는다.
- 이동·export 축소 중 일부만 반영하면 import와 기존 구조 검사 테스트가 깨질 수 있다. 소비처·테스트를 같은 변경에서 처리한다.
- 구현 시 근거 파일·소비 관계가 달라졌다면 이 계획을 그대로 적용하지 않고 해당 항목을 재검토한다.
- 롤백은 항목별 코드·테스트·소비 import를 함께 revert한다. DB나 외부 상태 복구는 필요하지 않다.

## Completion or Closure Notes

네 항목 모두 구현·검증 완료했다. 미실행 Phase 2는 없다.

- FSD-A04: `src/server/auth/guard.ts`에 인증 이후 slug 형태 검사를 추가했다. 새 `tests/server/project-guard.test.ts`는 실제 guard를 평가하여 16개 Action·8개 route, 인증 우선순위·소유자 범위·예외·읽기 전용 정책·fresh manifest를 검증한다.
- FSD-A01: 플랜 표시·인접 시험을 `entities/account-plan/model/plan-label.ts`·`.test.ts`로 이동하고 `index.ts`의 `planLabel`을 네 소비처에 연결했다. Billing의 기존 구조 검사를 새 소유권에 맞게 갱신했다.
- FSD-A02: 표·시험을 `pages/project-backlog/ui/`로 이동하고 page의 상대 import로 연결했다. 편집 feature의 표·행 타입 export만 제거했다.
- FSD-A03: 외부 서버 시험의 두 Action 타입을 public server API에서 type-only로 참조하고, 두 수동 VM 블록을 기존 `loadModule` 사용으로 정리했다. 원본 schema·fixture·Action 구현과 기존 assertion은 보존했다.
- 서버의 소유권·가용성·트랜잭션 정책, route 파일, core·DB schema·패키지/Next 설정은 변경하지 않았다.
- 실행 결과는 위 구현 후 결과가 소유한다. 배포는 수행하지 않았다.

## Reconciliation Notes

후속 검토를 시작했을 때 개선할 점이 있었다. 원래 네 지적은 유지하고 다음 실행 계획의 공백을 보완했다.

1. 공통 guard의 전체 소비자 16 Action·8 route, 기존 선검증 순서와 읽기 전용 토큰 폐기 허용을 구체화했다.
2. 실제 guard를 경유하는 새 시험의 책임을 정하고 기존 회귀 실행과 구분했다. 예외·가용성·인가 실패의 중단 지점을 추가했다.
3. 파일 생성 부모, 충돌 여부, symbol의 공개·소비 경로, 옛 파일·export 부재 및 최종 화면 본문 검증을 연결했다.
4. 선택적 후속 항목, 완료 처리 조건, macOS 명령과 fresh manifest 검증 순서를 명시했다.

위 내용은 구현 전 정합성 검토 기록이다. 이후 사용자의 구현 요청으로 네 항목 전체가 승인되었고, 실제 수행 결과는 완료 기록에 반영했다.
