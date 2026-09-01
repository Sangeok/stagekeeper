---
status: "accepted"
date: "2026-08-29"
applies-to: ["src/app", "src/fsd", "src/server", "packages/core"]
decision-makers: ["repository owner"]
consulted: []
informed: ["contributors and coding agents"]
supersedes: []
superseded-by: null
---

# Next.js 경계에 맞춘 Feature-Sliced Design 채택

## Context and Problem Statement

Stagekeeper는 화면, 사람 전용 게이트, MCP, 인증, DB 규칙이 함께 성장할
예정이다. Next.js App Router의 파일 규약을 지키면서 제품 코드가 기술 종류별
전역 폴더로 흩어지거나 UI와 서버가 서로 의존하지 않게 할 구조가 필요하다.

## Scope

이 ADR이 적용되는 범위:

- Next.js route와 프런트엔드 제품 코드의 배치
- FSD layer·slice import 방향과 public API
- FSD, 서버 application service, 순수 core의 경계

이 ADR이 다루지 않는 범위:

- DB schema와 MCP 도구의 구체 계약
- 배포 topology와 monorepo 전환 여부

## Decision Drivers

- 함께 바뀌는 UI, 상태, schema, 테스트를 제품 의미 단위로 모아야 한다.
- 한 기능 변경이 다른 기능의 테스트 범위로 불필요하게 퍼지지 않아야 한다.
- Next.js App Router와 Server/Client module graph를 명시적으로 보호해야 한다.
- 웹과 MCP가 공유하는 규칙은 UI 구조와 독립적으로 재사용할 수 있어야 한다.
- 사람과 자동화가 같은 import 규칙을 확인할 수 있어야 한다.

## Considered Options

- Next.js route 내부 코로케이션만 사용
- 표준 FSD를 Next.js 예약 폴더와 함께 사용
- `src/fsd`를 별도 root로 둔 Next.js 맞춤 FSD

## Decision Outcome

Chosen option: "`src/fsd`를 별도 root로 둔 Next.js 맞춤 FSD", because Next.js
`src/app`을 routing/composition root로 보존하면서 FSD의 단방향 layer와 slice
격리를 명확히 적용할 수 있고, 기존 Phase 0·1의 `src/fsd` 경로 계획과도
호환된다. backend는 프런트엔드 중심인 FSD에 억지로 넣지 않고 `src/server`,
순수 규칙은 `packages/core`에 둔다.

### Acceptance

저장소 소유자가 2026-08-29 요청에서 FSD를 프로젝트 아키텍처로 사용하고 이후
코드가 이를 참조하도록 명시했다. 이 ADR과 자동 경계 검사가 그 승인 기록이다.

### Consequences

Positive:

- 제품 의미별 코로케이션과 slice 격리로 변경 영향 범위가 작아진다.
- `src/app`, `src/fsd`, `src/server`, `packages/core`의 책임이 구분된다.
- import 방향과 public API를 자동 검사할 수 있다.

Negative / trade-offs:

- 공식 FSD 예시와 달리 layer가 `src/fsd` 아래 한 단계 더 깊다.
- 작은 초기 프로젝트에도 public API와 경계 검사 유지 비용이 생긴다.
- Server Action은 FSD `api`와 `src/server` 사이의 제한된 예외 경계를 이해해야
  한다.

### Confirmation

`npm run verify:fsd`가 import 방향, slice public API, server/client 경계를
검사하며 `npm run lint`에 포함된다. 코드 리뷰는
`docs/architecture/verification.md` 체크리스트를 사용한다.

## Pros and Cons of the Options

### Next.js route 내부 코로케이션만 사용

- Good, because framework 규약 외에 배울 구조가 거의 없다.
- Neutral, because 작은 route 단위 기능에는 충분할 수 있다.
- Bad, because 여러 route가 공유하는 도메인 기능과 서버 경계가 성장할수록 소유권이
  흐려진다.

### 표준 FSD를 Next.js 예약 폴더와 함께 사용

- Good, because 공식 layer 이름과 tooling을 가장 직접적으로 따른다.
- Neutral, because `_app`, `_pages`처럼 이름을 바꾸면 충돌을 피할 수 있다.
- Bad, because 이 저장소의 `src/app` 전환 계획과 `src/fsd` 이식 경로를 크게
  바꾸고 Next app과 FSD app의 의미를 계속 구분해야 한다.

### `src/fsd`를 별도 root로 둔 Next.js 맞춤 FSD

- Good, because framework, frontend, backend, pure core의 경계가 경로에 드러난다.
- Neutral, because 표준 layer 의미와 import 규칙은 그대로 유지한다.
- Bad, because 일부 FSD 전용 도구는 root 설정이 필요하고 공식 예시를 그대로
  복사할 수 없다.

## More Information

- 현재 규칙: `docs/architecture/README.md`, `docs/architecture/fsd.md`
- 제품 설계: `docs/investigations/active/harness-platform.md`
- 실행 제안서: `docs/proposals/completed/2026-09-01-harness-platform-phase-0-1.md`
- 재검토 trigger: backend가 독립 배포되어야 하거나, FSD root가 둘 이상 필요해질
  때 새 ADR로 이 결정을 재검토한다.

## Review Checklist

- [x] 모든 placeholder를 실제 내용으로 바꿨다.
- [x] 선택한 option과 선택하지 않은 option의 trade-off가 드러난다.
- [x] `status`, `date`, `applies-to`, 승인 기록이 현재 상태와 맞다.
- [x] 결정의 적용 범위와 비범위가 명확하다.
- [x] 결정 준수 여부를 확인하는 방법이 적혀 있다.
- [x] `supersedes`, `superseded-by` 값 형식이 맞다.
