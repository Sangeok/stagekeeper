---
status: "completed"
stage: null
proposal-size: "small"
created-at: "2026-10-13"
approved-by: "user"
approved-at: "2026-10-13"
approval-scope: "두 Task 구현·검증·commit·push 및 main 대상 PR 생성"
completed-at: "2026-10-13"
verification-summary: "Node 22.23.3에서 집중 13개, 웹 590개, 서버 55개, 코어·플러그인 333개, 아키텍처 44개 및 check·build 통과. 기존 환경 선택 테스트 13개 skip."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/protocol.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
---

# Billing 사용량 조회의 동작 보존과 가독성 개선

## Summary

사용량 조회의 트랜잭션 설정을 검증하도록 테스트를 보강하고, DB 시각 선택과 사용량 계산을 지역 변수로 나눴다. 실제 수정 대상은 `src/server/account-usage-query.ts`와 `src/server/account-usage-query.test.ts`, 총 두 파일이다. 페이지의 조회 순서, 실패 처리, 계산 결과, 쿼리 횟수와 공개 계약은 유지한다. 조회 통합·병렬화·단일 SQL 전환은 이번 작업에 포함하지 않는다.

## Goal

- 같은 스냅샷을 읽기 위한 설정의 누락·변경을 기존 테스트가 감지하게 한다.
- 함수 인자 안에 들어 있는 조건부 DB 조회를 꺼내 실행 순서와 시각의 출처를 쉽게 읽게 한다.
- 유지보수와 가독성을 개선하면서 기존 동작을 보존한다. 성능 향상을 이 작업의 완료 기준으로 삼지 않는다.

## Proposal Size

`proposal-size: small`, 계획 분류는 `PHASE_PLAN / LIGHT`다. 두 파일의 국소 수정이며 함수 시그니처, 반환 타입, SQL, 격리 수준, 데이터 구조와 런타임 부수효과를 변경하지 않는다. DB 마이그레이션이나 새 의존성이 없고, 이번 변경분만 되돌리면 복구된다.

## Current State — 구현 전 근거

이 절과 Task 설명은 승인된 계획의 근거다. 실제 구현·검증 결과는 아래 Completion Notes에 기록한다.

초안 기준은 커밋 `c2356f8555fba28010a65c6431ada319ca9e0309`였으며, 2026-10-13 최종 대조 기준은 `013d1ceba5fe208336e1cfa4f61670bfd4548c05`, 브랜치 `harness/seo-metadata`다. 검토 중 반영된 차이는 `loadHeaderUser()`의 반환을 `{ login: user.login, plan }`으로 명시한 변경이며, 이 문서가 보존하는 반환 계약과 일치한다. 최초 문서 작성 전 작업 트리는 깨끗했지만, 이번 대조 검토 시에는 아래의 별도 변경과 이 미추적 제안서가 존재한다. 구현 시에는 최신 브랜치·커밋·작업 트리를 다시 확인하고 [AGENTS.md](../../../AGENTS.md)의 분기 규칙을 따른다.

문서 검증 시 별도 SEO 작업의 변경이 확인됐다. 해당 변경은 이 제안의 범위 밖이며 수정하지 않았다. FSD·검증 문서의 추가 변경은 landing 자산·metadata에 관한 내용으로, 이 제안의 사용량 조회 계약과 충돌하지 않는다. 이번 대조 검토는 이 제안서만 수정한다.

권위 있는 근거는 사용자의 **기존 동작을 유지하는 두 가지 작은 개선** 요청과 [현재 아키텍처](../../architecture/README.md), [FSD 규칙](../../architecture/fsd.md), [사용량 계약](../../architecture/protocol.md), [검증 규칙](../../architecture/verification.md)이다. 이 문서는 기존 계약을 변경하지 않는다.

| 항목 | 현재 근거 | 판단 | 남은 작업 |
| --- | --- | --- | --- |
| 플랜·사용량의 동일 스냅샷 | `protocol.md`의 제품 사용량 절, `readAccountUsage()` | Contracted / 이미 구현됨 | 기존 설정과 결과를 보존하고 설정 전달을 검증한다. |
| 트랜잭션 테스트 | `account-usage-query.test.ts`의 첫 테스트 | Observed / 검증이 일부 부족함 | `$transaction` 옵션과 `$executeRaw` SQL을 확인한다. |
| 시각 선택·계산 | `readAccountUsageIn()`의 마지막 반환 표현식 | Observed / 동작은 구현됨 | 조건부 DB 조회와 계산을 지역 변수로 나눈다. |
| 페이지 실패 경계 | `billing/page.tsx`, `account-usage-bindings.test.ts` | Observed / 이미 구현·테스트됨 | 변경 없이 기존 바인딩 테스트를 실행한다. |

현재 테스트의 `$transaction` 더블은 옵션 인자를 무시한다. `$executeRaw` 더블도 실제 SQL을 확인하지 않고 항상 `read-only`라는 문자열을 기록한다. 따라서 격리 수준이나 읽기 전용 SQL이 바뀌어도 테스트가 통과할 수 있다.

`readAccountUsageIn()`은 billing 외에 에이전트 실행 한도 검사에서도 사용된다. 특히 [실행 생성 경로](../../../src/server/agents/run-query.ts)는 먼저 읽은 DB 시각을 `at`으로 전달하고, 같은 시각으로 사용량 판정·카운터 갱신·실행 생성을 수행한다. 추가 시각 조회를 도입해서는 안 된다.

읽기 전용 트랜잭션을 여는 함수는 `readAccountUsage()`다. `readAccountUsageIn()` 자체는 전달받은 트랜잭션을 사용하며, 에이전트의 쓰기 트랜잭션 안에서도 호출된다. 읽기 전용 설정이나 새 트랜잭션을 공용 내부 함수로 옮기지 않는다.

## Scope

포함 범위:

- 기존 테스트의 트랜잭션 옵션·읽기 전용 SQL·DB 시각 호출 검증 보강.
- 전달된 `at`의 재사용, 사용자 조회 실패와 시각 조회 실패의 작은 회귀 테스트 추가.
- `readAccountUsageIn()` 내부 표현식의 지역 변수 분리.

제외 범위:

- `src/app/(app)/billing/page.tsx`, Billing UI, 공용 헤더와 사용량 정책의 변경.
- 조회 통합, `Promise.all` 병렬화, fallback 재설계, 새 loader나 공용 추상화 추가.
- SQL·트랜잭션 옵션·타임아웃·캐시·인증·에이전트 제한 집행의 변경.
- 성능 측정 프로젝트, 운영 DB 접근, 마이그레이션, 의존성 변경.

## Acceptance Criteria

아래 요구사항은 새 제품 기능이 아니라 이번 정리에서 보존할 기존 동작이다.

### REQ-BILLING-MIN-001: 전달된 시각 재사용

WHEN 호출자가 `readAccountUsageIn()`에 `at`을 전달하면, 시스템은 해당 시각으로 사용량을 계산하고 DB 시각을 추가 조회하지 않아야 한다.

### REQ-BILLING-MIN-002: DB 시각 사용과 실패 전파

WHEN 호출자가 `at`을 생략하면, 시스템은 사용자 조회 뒤 DB 시각을 한 번 읽어 사용량을 계산해야 한다. IF 사용자·DB 시각·트랜잭션 조회가 실패하면, THEN 조회 함수는 기존처럼 실패를 호출자에게 전달해야 한다.

### REQ-BILLING-MIN-003: 성공 결과 보존

WHEN billing 사용량 조회가 성공하면, 시스템은 기존 `plan`, `usage.kind`, 퍼센트와 리셋 시각을 반환하고 헤더와 본문에 같은 snapshot의 플랜을 전달해야 한다. 응답에 원시 카운터·quota·`Infinity`를 추가해서는 안 된다.

### REQ-BILLING-MIN-004: 페이지 실패 동작 보존

IF 인증이나 헤더 조회가 실패하면, THEN 페이지는 기존 실패를 전파하고 사용량 조회를 시작하지 않아야 한다. IF 사용량 조회만 실패하면, THEN 페이지는 이미 읽은 플랜과 `usage: { kind: "unavailable" }`을 사용해야 한다.

### INV-BILLING-MIN-001: 일관된 사용량 기준

billing의 `readAccountUsage()`는 기존 읽기 전용 `RepeatableRead` 트랜잭션에서 플랜과 사용량 데이터를 함께 읽는다. 공용 `readAccountUsageIn()`은 호출자가 소유한 트랜잭션을 그대로 사용한다. 사용량 정책의 한도·5시간 구간·만료 판정과 에이전트의 쓰기 트랜잭션 경계는 유지한다.

### CON-BILLING-MIN-001: 변경 경계

구현 시 수정할 소스 파일은 아래 두 파일뿐이다. 운영 코드의 함수 입력·출력·import/export, 기존 사용자 `select`, DB 시각 SQL, `READ_OPTIONS`와 페이지의 실패 경계는 유지한다. 테스트 파일에서는 기존 `./account-usage-query` import에 이미 공개된 `readAccountUsageIn`을 추가할 수 있다. 새 운영 export는 만들지 않는다. 승인 범위와 다른 변경이 필요하면 작업을 확대하지 않고 그 이유를 보고한다.

## Proposal

### TASK-BILLING-MIN-01: 기존 계약을 테스트로 보호

- satisfies: REQ-BILLING-MIN-001, REQ-BILLING-MIN-002, REQ-BILLING-MIN-003
- preserves: INV-BILLING-MIN-001
- governed-by: CON-BILLING-MIN-001
- verified-by: VFY-BILLING-MIN-01, VFY-BILLING-MIN-02
- 대상: `src/server/account-usage-query.test.ts`.

수정 방법:

1. 첫 테스트의 `$transaction` 더블이 두 번째 인자인 옵션을 받도록 하고, 호출된 옵션을 기록한다. 기대값은 `{ isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30000 }`으로 검증한다. 기대값에 `READ_OPTIONS` 자체를 사용하면 해당 상수의 변경을 놓칠 수 있으므로 사용하지 않는다.
2. `$executeRaw` 더블은 tagged template로 받은 실제 SQL을 기록하고 `SET TRANSACTION READ ONLY`인지 검증한다. 공백·줄바꿈은 정규화하되 문장의 의미는 완화하지 않는다. 고정된 `read-only` 문자열 기록만으로 검증을 대신하지 않는다.
3. 기존 첫 테스트의 `$queryRaw` 더블에 DB 시각 호출 기록을 추가한다. `transaction → read-only → session-user → database-clock` 순서와 시각 호출 한 번을 확인한다. 기존 결과·원시 quota 비노출 assertion은 유지한다.
4. 테스트의 기존 import에 `readAccountUsageIn`을 추가하고 직접 호출하는 테스트 한 개를 작성한다. `at = new Date("2026-10-02T01:00:00Z")`, 구간 시작은 같은 날 `00:00:00Z`, Pro 카운터는 `40`으로 둔다. DB 시각 더블은 호출되면 실패하도록 만든다. `percent: 40`, `used: 40`, `resetAt?.toISOString() === "2026-10-02T05:00:00.000Z"`를 확인한다. 내부 함수의 `resetAt`은 `Date | null`이며 문자열 변환은 assertion에서만 한다. 실제 ISO 문자열 반환은 기존 `readAccountUsage()`의 책임이다.
5. 기존 트랜잭션 실패 전파 테스트를 유지한다. 사용자 조회 실패와 시각 조회 실패를 각각 같은 파일의 작은 사례로 확인한다. 사용자 더블이 오류를 던지면 같은 오류 객체가 전파되고 DB 시각 호출은 0회여야 한다. 시각 더블이 오류를 던지면 사용자 조회 뒤 시각 호출이 한 번 발생하고 같은 오류 객체가 전파되어야 한다. 두 실패에서 성공 값이나 0%를 만들어 반환하지 않는다.

테스트 더블은 기존 파일 안에서만 수정한다. 새 테스트 프레임워크나 범용 fixture 계층은 만들지 않는다. 이 단위 테스트는 트랜잭션 설정의 **전달**과 계산 분기를 검증하며, 실제 PostgreSQL의 격리 동작을 증명하는 테스트로 설명하지 않는다.

### TASK-BILLING-MIN-02: 시각 조회와 계산 표현식 분리

- satisfies: REQ-BILLING-MIN-001, REQ-BILLING-MIN-002, REQ-BILLING-MIN-003, REQ-BILLING-MIN-004
- preserves: INV-BILLING-MIN-001
- governed-by: CON-BILLING-MIN-001
- verified-by: VFY-BILLING-MIN-01, VFY-BILLING-MIN-02, VFY-BILLING-MIN-03
- 대상: `src/server/account-usage-query.ts`의 `readAccountUsageIn()`.

사용자 조회와 `normalizePlan()` 뒤에 있는 마지막 반환 표현식만 아래 형태로 정리한다.

```ts
const now = at ?? await readDatabaseClockIn(tx);
const snapshot = usageSnapshot(
  plan,
  user.usageWindowStartedAt,
  user.usageRunCount,
  now,
);
return { ...snapshot, plan };
```

`??`의 단락 평가를 유지하므로 `at`이 있으면 DB 시각을 읽지 않는다. `at`이 없으면 기존 위치에서 같은 함수를 한 번 기다린다. 조회 순서·계산 입력·객체 병합 순서가 동일하며 새 `catch`, 상태, 부수효과를 추가하지 않는다. 다른 함수와 에이전트 호출부는 수정하지 않는다.

## Affected Files

| 경로 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `src/server/account-usage-query.test.ts` | update | 트랜잭션 설정과 시각 선택 계약을 검증한다. | low — 테스트 더블의 의미와 검증 한계를 명확히 해야 한다. |
| `src/server/account-usage-query.ts` | update | `readAccountUsageIn()`의 마지막 표현식만 정리한다. | low — 전달 시각 재사용을 보존해야 한다. |
| `src/app/(app)/billing/page.tsx`, `tests/server/account-usage-bindings.test.ts` | keep | 기존 조합·실패 동작은 이미 명확하다. 기존 테스트를 재실행한다. | 변경 없음 |
| `src/server/account-usage.ts`, `src/server/project-access-query.ts`, `src/server/database-clock.ts` | keep | 서비스 연결·트랜잭션 옵션·DB 시각 SQL을 유지한다. | 변경 없음 |
| `src/server/agents/run-query.ts`, `src/server/agents/runs.ts`, `src/server/pipeline/run-query.ts` | keep | `readAccountUsageIn`과 `readProjectUsageCapIn`의 모든 직접 운영 호출처. 호출자 트랜잭션과 시간 전달을 유지한다. | 변경 없음 |
| `src/fsd/pages/billing/index.ts`, `src/fsd/pages/billing/ui/billing-page.tsx`, `src/fsd/pages/billing/ui/billing-page.test.ts` | keep | public API와 최종 화면 표현을 유지하고 기존 렌더 테스트를 재실행한다. | 변경 없음 |
| `src/fsd/widgets/app-header/index.ts`, `src/fsd/widgets/app-header/index.server.ts`, `src/fsd/widgets/app-header/api/app-header.server.ts`, `src/fsd/widgets/app-header/ui/app-header.tsx` | keep | 헤더의 public API·조회·플랜 표기를 유지한다. | 변경 없음 |
| `packages/core/usage-window.mjs`, `packages/core/usage-window.test.mjs`, `packages/core/entitlement.mjs`, `src/fsd/shared/lib/entitlement-copy.ts` | keep | 계산 정책과 표시 문구의 실제 소유자. 기존 시간 경계·상한 테스트를 재실행한다. | 변경 없음 |

관련 읽기 근거는 `src/server/auth/guard.ts`, `src/server/auth/index.ts`, `src/server/entitlement.ts`, `src/server/db.ts`, `prisma/schema.prisma`, `tests/server/integration/account-usage.test.ts`다. DB 통합 테스트는 호출자의 잠금·쓰기 경계를 확인하기 위해 읽으며 이번 작은 정리의 실행 게이트로 추가하지 않는다.

검증 환경의 근거는 `package.json`, `package-lock.json`, `tsconfig.json`, `.github/workflows/check.yml`, `scripts/build.mjs`, `tests/server/register-server-only.mjs`다. 생성된 Prisma 타입은 `src/generated/prisma/client.ts`와 `src/generated/prisma/internal/prismaNamespace.ts`, `src/generated/prisma/models/User.ts`에서 확인하며 직접 수정하지 않는다. 위 목록은 두 변경 파일의 영향을 확인할 읽기 범위이고, 추가 수정 대상이 아니다.

테스트 import 경로는 `account-usage-query.ts`의 기존 named export → `account-usage-query.test.ts`의 `./account-usage-query` 직접 import다. 현재 경로를 유지하므로 이동·삭제·신규 모듈의 부재/존재 검사는 필요하지 않다.

## Runtime and Output Checks

| 조건 | 유지할 실행과 결과 | 확인 위치 |
| --- | --- | --- |
| `at` 전달 | 사용자 조회 → 전달된 시각으로 계산. DB 시각 추가 조회 없음. | VFY-BILLING-MIN-02 |
| `at` 생략 | 사용자 조회 → DB 시각 한 번 → 같은 입력으로 계산. | VFY-BILLING-MIN-02 |
| 사용자·시각·트랜잭션 실패 | 원래 오류 전파. 사용자 실패 뒤 시각 조회 없음. | VFY-BILLING-MIN-01, VFY-BILLING-MIN-02 |
| billing 조회 성공 | snapshot의 `plan`이 헤더와 본문에 함께 전달됨. | VFY-BILLING-MIN-03 |
| usage만 실패 | 먼저 읽은 플랜과 `unavailable` 유지. | VFY-BILLING-MIN-03 |
| 인증·헤더 실패 | 기존 실패 전파, usage 미호출. | VFY-BILLING-MIN-03 |
| 에이전트 신규 실행 | 호출자가 읽은 `at`과 쓰기 트랜잭션 유지. | VFY-BILLING-MIN-02와 `agents/run-query.ts`의 변경 없음 확인 |

최종 결과물과 검증 대상:

| 결과물 | 최종 값의 소유자·의존성 | 검증 대상 |
| --- | --- | --- |
| 내부 계산 결과 | `readAccountUsageIn` → `usageSnapshot`·`limitsFor`. `resetAt`은 `Date | null`. | 전달 시각 테스트와 기존 `usage-window.test.mjs` |
| billing 전달 데이터 | `readAccountUsage`가 `limited`/`unlimited`를 구성하고 리셋 시각을 ISO 문자열로 바꾼다. | 쿼리 응답 테스트, DTO 구성 코드가 수정되지 않았는지 diff 확인 |
| `/billing` 화면 | 페이지가 성공 snapshot 또는 실패 fallback을 선택하고 `BillingPage`가 퍼센트·리셋 시각·무제한·조회 불가를 렌더한다. 헤더의 플랜 표기는 `planLabel`에 의존한다. | 기존 페이지 바인딩 테스트와 `billing-page.test.ts`의 실제 HTML assertion |

새 상태·재시도·타이머·리스너·캐시·렌더링 경계를 도입하지 않는다. 화면 재진입은 기존 서버 페이지 조회를 따른다. 프레임워크 규칙은 설치된 Next 문서 `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`로 확인했다. 새 생성 파일·설정 우선순위·라우팅 산출물은 없으며, 전역 레이아웃·SEO 산출물은 이 변경의 입력이나 변경 대상이 아니다.

## Safety Analysis

- [x] 입력·출력 타입과 공개 export를 확인했다. 변경 계획에 계약 변경이 없다.
- [x] `readAccountUsageIn()`과 `readProjectUsageCapIn()`의 에이전트·파이프라인 호출처를 확인했다. 전달 시각과 한도 판정은 보존한다.
- [x] 인증·헤더 실패 시 사용량 조회 미실행, 사용량 실패 시 `unavailable`인 기존 바인딩 테스트를 확인했다.
- [x] SQL·트랜잭션 옵션·읽기 전용 설정을 유지하는 범위를 지정했다.

위 체크 항목은 코드·문서 읽기 결과다. 구현 전후의 실제 테스트·빌드 결과는 Verification Results에 구분해 기록한다. 실제 DB 검증 결과는 아니다.

## Approval

사용자의 구현·commit·push·main 대상 PR 요청을 근거로 실행한다. PR의 대상은 이번 명시적 요청에 따라 main이며, 작업 브랜치는 최신 dev에서 분기한다. 승인 기록은 front matter를 따른다.

## Execution Plan

1. 최신 저장소 상태와 이 문서의 변경 경계를 확인한다. 별도 작업의 변경과 이번 구현의 기준 커밋을 기록한다. `.github/workflows/check.yml`과 같은 Node 22 환경·의존성·생성 Prisma 타입을 준비한다. 새 checkout에서 준비가 필요하면 기존 `npm ci`, `npm run db:generate` 절차를 따른다.
2. TASK-BILLING-MIN-01을 수행하고, 기존 구현에서 강화된 테스트가 통과하는지 확인한다. 실패하면 기존 결함인지 테스트 더블의 문제인지 먼저 구분한다.
3. TASK-BILLING-MIN-02의 지역 변수 분리를 적용한다.
4. 아래 검증을 수행하고 전후 결과를 기록한다. 작업 시작 시 기록한 diff와 비교하여 이번 소스 변경이 두 파일에만 있는지 확인한다. 운영 파일의 diff는 제시한 지역 변수 추출에 한정되고, SQL·`select`·트랜잭션 설정·타입·export·호출부가 바뀌지 않아야 한다. 빌드의 무시된 생성물과 별도 작업의 기존 변경은 구현 변경과 구분한다.

## Verification Plan

### VFY-BILLING-MIN-01: 트랜잭션 설정과 기존 응답

- verifies: REQ-BILLING-MIN-002, REQ-BILLING-MIN-003
- 대상: `src/server/account-usage-query.test.ts`의 기존 성공·실패 테스트.
- 기준: 기대한 트랜잭션 옵션과 읽기 전용 SQL을 전달하고, 기존 성공 응답·원시 quota 비노출·실패 전파를 유지한다.
- 실행 상태: Executed — Verification Results 참조.

### VFY-BILLING-MIN-02: 시각 선택의 두 분기

- verifies: REQ-BILLING-MIN-001, REQ-BILLING-MIN-002
- 대상: 같은 테스트 파일의 강화된 DB 시각 검증과 전달 시각·사용자 실패·시각 실패 사례, 기존 `packages/core/usage-window.test.mjs`.
- 기준: `at` 생략 시 DB 시각 한 번, 전달 시 추가 시각 조회 없음, 고정 fixture의 계산 결과 동일. 사용자 실패 시 같은 오류 전파와 시각 호출 0회, 시각 실패 시 같은 오류 전파와 시각 호출 1회. 기존 정책 테스트의 정확한 5시간 경계·상한·잘못된 카운터/시각 거부도 통과한다.
- 실행 상태: Executed — Verification Results 참조.

### VFY-BILLING-MIN-03: 페이지 조합과 실패 경계

- verifies: REQ-BILLING-MIN-003, REQ-BILLING-MIN-004
- 대상: 기존 `tests/server/account-usage-bindings.test.ts`, `src/fsd/pages/billing/ui/billing-page.test.ts`.
- 기준: 헤더·본문의 snapshot 플랜 일치, 세션 사용자별 사용량 분리, usage 실패의 fallback, 인증·헤더 실패 전파와 usage 미호출을 유지한다. 실제 HTML의 0/37/100% 표기·progress·100%일 때 리셋 시각, `unlimited`/`unavailable`에서 0%·progress 미표시를 확인한다.
- 실행 상태: Executed — Verification Results 참조.

먼저 실행할 집중 검증:

```bash
node --import tsx --test src/server/account-usage-query.test.ts packages/core/usage-window.test.mjs src/fsd/pages/billing/ui/billing-page.test.ts
node --import ./tests/server/register-server-only.mjs --import tsx --test tests/server/account-usage-bindings.test.ts
```

코드 변경 완료 전에 실행할 저장소 검증:

```bash
npm run verify:fsd
npm run test:architecture
npm run check
npm run test:web
npm run test:server
npm test
npm run build
```

`check`는 lint·타입·아키텍처 검사를 포함한다. 설정·SQL·정책을 바꾸지 않는 이번 범위에서는 실제 DB 통합 테스트를 필수 증거로 삼지 않으며, 단위 테스트 결과를 실제 DB 격리 검증으로 보고하지 않는다. 기존 실패와 신규 실패를 구분하고, 새 실패를 검사 억제나 범위 밖 수정으로 해소하지 않는다.

## Verification Results

구현 기준은 `origin/dev`의 `e12449b0135bcc67e5eb09224e7ecc345cef1a7d`, 작업 브랜치는 `harness/billing-usage-minor-cleanup`이다. 기존 SEO 작업과 분리한 작업트리에서 Node `v22.23.3`, Prisma `7.10.0`, Next `16.3.3`으로 검증했다.

| 명령 / 항목 | 결과 | 실제 확인 |
| --- | --- | --- |
| 강화된 쿼리 테스트를 기존 구현에서 실행 | Passed | 5개. 표현식 분리 전부터 기존 동작을 보호하는지 확인. |
| 쿼리·정책·렌더 집중 테스트 | Passed | 11개. VFY-BILLING-MIN-01·02와 렌더 검증. |
| 페이지 바인딩 집중 테스트 | Passed | 2개. VFY-BILLING-MIN-03의 동일 플랜·오류 경계 유지. |
| `npm run verify:fsd` | Passed | import·계층 경계 정상. |
| `npm run test:architecture` | Passed | 44개 통과, 실제 Windows 환경을 요구하는 기존 2개 skip. |
| `npm run check` | Passed | 복사본 동기화·lint·타입·아키텍처·프로젝트 가용성 검사 통과. |
| `npm run test:web` | Passed | 590개 통과. |
| `npm run test:server` | Passed | 55개 통과, 빌드 후 명시적으로 실행하는 기존 manifest 검사 1개 skip. |
| `npm test` | Passed | 333개 통과, Windows 전용 기존 10개 skip. |
| `npm run build` | Passed | Prisma 생성·Turbopack 빌드·타입 검사·페이지 생성 완료. `/billing` 동적 라우트 유지. |
| `git diff --check` | Passed | 공백 오류 없음. |

최초 실행의 환경 문제도 구분했다. macOS 기본 임시 경로의 별칭(`/var` → `/private/var`) 때문에 경로 보안 테스트가 실패해, 재실행 시 실제 경로인 `TMPDIR=/private/tmp`를 지정했다. 로컬 fixture 서버 포트와 Prisma 캐시 접근이 샌드박스에서 차단된 명령은 승인된 실행 권한으로 재실행했다. 테스트나 보안 검사를 억제하지 않았다.

DB 통합 테스트는 계획대로 실행하지 않았다. 단위 테스트 통과를 실제 PostgreSQL 격리나 Windows LPAC 인수 결과로 해석하지 않는다.

## Risks and Rollback

잔여 리스크는 시각 변수 추출 과정에서 `at`이 있어도 DB 조회를 실행하는 실수, 설정 검증을 구현 상수와 비교하여 변경을 놓치는 실수다. 두 경우를 TASK-BILLING-MIN-01에서 보강한 테스트로 보호했다. 실제 PostgreSQL 격리 동작과 조회 지연시간은 이번 계획의 검증 범위 밖이다.

문제가 생기면 이번 작업으로 수정한 두 파일의 변경분만 되돌린다. DB·설정·API·데이터 구조 변경이 없으므로 데이터 복구나 마이그레이션 롤백은 필요 없다. 다른 작업의 변경분은 유지한다.

## Completion Notes

- 테스트 보강 결과(TASK-BILLING-MIN-01): 실제 트랜잭션 옵션과 읽기 전용 SQL을 확인하고, 전달 시각 재사용·사용자 조회 실패·DB 시각 실패 테스트를 추가했다. 테스트 fixture는 같은 파일의 작은 함수로만 공유한다.
- 표현식 정리 결과(TASK-BILLING-MIN-02): `readAccountUsageIn()`의 마지막 표현식을 `now`, `snapshot`, 반환문으로 나눴다. 사용자 select·SQL·트랜잭션 옵션·운영 import/export·호출부의 diff는 없다.
- 변경된 운영·테스트 소스는 승인한 두 파일뿐이다. 이 완료 문서는 같은 구현 커밋에 포함한다.
- PR 대상은 사용자의 명시적 요청에 따라 `main`이다. 최신 `dev`에서 분기했으므로 `main`에 아직 반영되지 않은 선행 커밋 10개도 PR 비교에 포함된다. 이번 구현의 변경 범위는 위 두 소스 파일과 이 완료 기록이다.
- 수정 후 필수 검증을 완료했으며, 완료 문서를 `completed/`로 이동했다. 구현 커밋은 이 문서의 Git 이력에서 확인할 수 있다.
- 중복 조회 비용 측정이나 billing 전용 조회 통합은 이번 작업에 포함하지 않았다.
