---
status: "proposed"
date: "2026-10-19"
applies-to: ["src/server", "src/app", "src/fsd", "scripts", "tests"]
decision-makers: ["repository owner"]
consulted: []
informed: ["contributors and coding agents"]
supersedes: []
superseded-by: null
---

# 얕은 서버 기능 모듈과 명시적 공개 진입점 채택

## Context and Problem Statement

서버 루트의 파일 접두사만으로 소유권을 구분하던 구조는 등록·템플릿·토큰 책임을
여러 호출부로 흩뜨렸다. DB 주입형 로직을 runtime 바인딩과 함께 재수출하면 독립 시험과
seed까지 singleton 초기화에 의존할 수 있다. 기능 소유권과 초기화 경계를 함께 표현해야 한다.

## Scope

- 서버 아홉 기능 모듈, 공개 API·타입 계약·조립부와 import 방향
- 웹·REST·MCP 소비자, 서버 시험·리허설의 내부 참조

DB schema·상품 정책·인증 방식·외부 응답·프런트엔드 FSD 배치·새 패키지는 바꾸지 않는다.

## Decision Drivers

- 함께 바뀌는 업무 로직을 가까이 두고 작은 모듈에 계층을 강제하지 않는다.
- 기존 잠금·transaction·재시도·credential·외부 응답을 보존한다.
- 주입형 서비스는 실제 연결 없이 검사하고 소비자는 공개 계약만 알아야 한다.
- 테스트를 위해 운영 API를 넓히지 않는다(ADR-0002).

## Considered Options

- 루트 접두사 구조 유지
- 서버 전체에 repository/service 계층 또는 FSD layer 도입
- 얕은 기능 모듈과 주입형/runtime 공개 진입점 분리

## Decision Outcome

Chosen option: "얕은 기능 모듈과 주입형/runtime 공개 진입점 분리", because 소유 위치와
초기화 경계를 표현하면서 기존 transaction의 책임을 그대로 유지할 수 있다.
현행 규칙과 파일 단위 시험 목록의 단일 기준은 [server.md](../architecture/server.md)다.

### Acceptance

저장소 소유자가 2026-10-19 대화에서 검증된 server-module-reorganization 제안서에 따른
실제 코드 수정을 요청했다. 이는 제안 범위 구현의 승인이다. 이 ADR과 목록은 PR 검토 후
함께 `accepted`로 전환한다. 운영 DB·seed·배포 승인은 포함하지 않는다.

### Consequences

Positive:

- 변경할 규칙의 소유 모듈과 소비 계약을 경로로 식별한다.
- API 집계가 singleton 초기화를 숨기지 않고 주입형 시험을 유지한다.
- 방향·순환·비공개 참조와 시험 목록을 자동 검사한다.

Negative / trade-offs:

- 공개 export와 기존 VM mock 지정자를 함께 유지해야 한다.
- DB 회귀와 binding 시험에는 파일 단위 내부 참조 목록이 필요하다.
- 큰 보드 구현은 이 결정만으로 재분해하지 않는다.

### Confirmation

`verify:server`·`test:architecture`와 기존 FSD 검사, 단위·binding·seed·격리 DB·실제 Next
인수를 실행한다. Action 전체 등록 tuple과 외부 응답 본문을 변경 전후 대조한다.

## Pros and Cons of the Options

### 루트 접두사 구조 유지

- Good, because 이동 비용이 없다.
- Bad, because 혼합 책임·내부 조립 의존·초기화 누출을 경로로 드러내지 못한다.

### 서버 전체에 공통 계층 도입

- Good, because 기술 역할을 통일할 수 있다.
- Bad, because 작은 기능에도 계층을 추가하고 기존 원자적 쓰기를 흩뜨릴 수 있다.

### 얕은 기능 모듈과 공개 진입점 분리

- Good, because 기존 구현 단위와 주입형 테스트를 유지한다.
- Bad, because 공개 계약과 경계 검사·내부 참조 목록을 관리해야 한다.

## More Information

[구현 기록](../proposals/completed/2026-10-19-server-module-reorganization.md),
[테스트 배치 결정](./0002-test-code-organization.md)을 따른다.
독립 배포·공유 타입 소비·실제 모듈 의존이 달라질 때 새 결정으로 재검토한다.

## Review Checklist

- [x] 범위·대안·trade-off와 검증 목적지가 있다.
- [x] 구현 승인과 PR 채택·운영 승인을 구분했다.
- [x] supersedes는 비어 있고 기존 ADR의 reasoning은 변경하지 않았다.
