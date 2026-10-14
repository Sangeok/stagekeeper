---
status: "accepted"
date: "2026-10-15"
applies-to: ["src/fsd", "src/server", "packages/core", "plugin", "scripts", "tests"]
decision-makers: ["repository owner"]
consulted: []
informed: ["contributors and coding agents"]
supersedes: []
superseded-by: null
---

# 대상 옆 테스트 배치와 실행 경계별 분리 채택

## Context and Problem Statement

FSD의 모델 디렉터리에 구현과 테스트가 나란히 있는 구조를 장기 규칙으로 유지할지,
테스트 폴더로 분리할지 결정해야 했다. 기존 배치를 그대로 따르는 것보다 기능의
소유권, 변경 시 탐색 비용, 서버·DB·브라우저 실행 환경을 기준으로 대안을 비교했다.

## Scope

이 ADR이 적용되는 범위:

- 프런트엔드·서버·core·plugin·저장소 스크립트의 테스트 배치와 명명
- 테스트 보조 코드의 소유권, 운영 코드와 테스트 코드의 의존성 경계
- 서버 통합 테스트 및 향후 E2E suite의 위치

이 ADR이 다루지 않는 범위:

- 테스트 runner 교체, coverage 목표, 새로운 E2E 환경 구현
- 기존 테스트의 일괄 이동이나 아키텍처 검사기 기능 추가

## Decision Drivers

- 변경할 코드와 그 동작 계약을 검증하는 테스트를 함께 찾을 수 있어야 한다.
- FSD slice의 소유권과 public API 경계를 유지해야 한다.
- 테스트를 위해 운영 API를 넓히거나 운영 코드에 테스트 의존성을 추가하지 않는다.
- DB·서버 bootstrap 등 실행 환경의 책임을 명확하게 나눈다.
- 현재 자동 검사가 보장하는 범위와 수동 리뷰할 규칙을 구분한다.

## Considered Options

- 단위·컴포넌트 테스트는 대상 옆에 두고, 실행 경계에 따라 서버 통합·E2E를 분리
- 모든 단위·컴포넌트 테스트를 소유 segment의 테스트 하위 폴더로 분리
- 모든 테스트를 루트 `tests/` 아래에 모아 소스 디렉터리 구조를 복제

## Decision Outcome

Chosen option: "대상 옆 배치와 실행 경계별 분리", because 기능별 응집도와
테스트 발견 가능성을 유지하면서 서버·DB·전체 사용자 흐름의 실행 책임을
별도로 관리할 수 있다.

한 feature에서 완결되는 동작이나 page/widget이 소유하는 조합 테스트도 해당
코드 가까이에 둔다. 독립 서버 테스트는 원본 옆에 두되, 서버 전용 bootstrap이나
DB가 필요한 경우 별도 실행 환경에 배치한다. 복잡해진 보조 코드는 소유 segment
안에서 묶고, 테스트 본문의 하위 폴더 분리는 실제 탐색 문제에 근거해 판단한다.

이 결정은 ADR-0001의 FSD 채택을 유지하면서 테스트 배치 규칙을 구체화한다.
현재 적용할 상세 규칙의 단일 기준은
[test-organization.md](../architecture/test-organization.md)다.

### Acceptance

저장소 소유자가 2026-10-15 대화에서 제안한 규칙 문서와 ADR 구성에 대해
"좋다 그렇게 하고 완료 시 commit하고 push하고 dev에 pr"이라고 명시적으로
승인했다. 이 승인은 문서 규칙의 채택과 문서 변경 PR 작성 범위이며, 테스트 파일
이동·runner 변경·자동 검사 구현을 수행했다는 뜻은 아니다. 같은 승인 범위를
이 문서를 추가하는 PR 본문에도 기록한다.

### Consequences

Positive:

- 구현과 테스트의 대응 관계가 가까워지고 기능의 이동·삭제 범위를 찾기 쉽다.
- 테스트용 내부 함수를 public API로 노출할 필요가 줄어든다.
- 시스템 통합과 E2E를 소스 파일의 세부 구조에서 독립적으로 구성할 수 있다.

Negative / trade-offs:

- 구현 디렉터리에 테스트가 함께 보여 파일 목록이 길어진다.
- 같은 segment의 테스트 하위 폴더도 응집도를 유지하는 대안이므로, 대상 옆 배치가
  모든 팀에서 항상 우월하다는 보장은 없다.
- 배치만으로 실행 여부나 운영 코드의 테스트 의존성을 보장할 수 없다.
  테스트 검색 패턴과 import 경계는 별도로 확인해야 한다.

### Confirmation

변경 작성자와 PR 리뷰어가
[verification.md](../architecture/verification.md#테스트-배치-규칙의-검증)에 따라
소유 위치, 실행 대상 포함 여부, 운영 코드의 테스트 의존성과 public API를 확인한다.
기존 FSD 검사와 관련 테스트를 실행하되, 아직 구현되지 않은 테스트 전용 import
금지 검사를 자동으로 보장한다고 보고하지 않는다.

## Pros and Cons of the Options

### 대상 옆 배치와 실행 경계별 분리

- Good, because 기능의 구현과 동작 계약을 같은 위치에서 탐색할 수 있다.
- Good, because 실제 DB나 전체 사용자 흐름의 테스트는 독립 실행 환경에 둘 수 있다.
- Bad, because 구현 파일만 훑을 때 테스트와 보조 파일이 시각적 부담을 줄 수 있다.

### 모든 테스트를 소유 segment의 하위 폴더로 분리

- Good, because 같은 slice의 응집도를 유지하면서 구현 파일 목록을 줄인다.
- Neutral, because FSD 자체가 slice 내부의 한 가지 파일 배치를 강제하지는 않는다.
- Bad, because 단순한 대상·테스트 쌍에도 탐색 단계와 대응 경로 관리가 추가된다.

### 루트에 모든 테스트를 모으고 소스 구조 복제

- Good, because 테스트만 모아 탐색하기 쉽다.
- Bad, because 구현과 테스트 사이의 경로 대응을 유지해야 하고 소유권이 멀어진다.
- Bad, because FSD 내부 단위 테스트가 slice 밖에 놓이면 내부 접근 예외나 불필요한
  public API 확장을 유도할 수 있다.

## More Information

2026-10-15 확인한 자료와 이 프로젝트에 대한 판단을 구분한다. 아래 자료는
응집도와 배치 선택의 근거이며, 특정 구조가 보편적 최적해라는 실증 자료는 아니다.

- [FSD Slices and segments](https://feature-sliced.design/docs/reference/slices-segments):
  slice의 응집도와 public API 경계를 정의하고 내부 구성에는 선택 여지를 둔다.
- [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest):
  `__tests__` 예시와 코드 옆 배치를 모두 허용한다. 이 참조가 Vitest 도입 결정은 아니다.
- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation):
  테스트를 검증 대상 가까이에 두고 전체 흐름을 다루는 E2E는 별도로 둘 수 있다는
  유지보수 관점을 제시한다.
- [ADR-0001](./0001-adopt-feature-sliced-design.md): FSD 채택과 소유권 경계.

재검토는 대규모 fixture·snapshot으로 인한 반복적인 탐색 문제, package 배포 경계의
변화, 테스트 실행 환경의 변화처럼 구체적인 비용이 확인될 때 수행한다.

## Review Checklist

- [x] metadata와 승인 범위가 실제 요청과 일치한다.
- [x] 대안과 선택에 따른 비용을 기록했다.
- [x] 현재 규칙과 검증 방법을 별도 기준 문서에 연결했다.
- [x] 규칙 채택과 자동화 구현 상태를 구분했다.
- [x] ADR-0001을 대체하지 않으므로 `supersedes`는 비워 두었다.
