---
status: "accepted"
date: "2026-10-22"
applies-to: ["scripts", "tests/server/integration", "package.json", ".github/workflows"]
decision-makers: ["repository owner"]
consulted: []
informed: ["contributors and coding agents"]
supersedes: []
superseded-by: null
---

# 저장소 스크립트의 책임별 배치

## Context and Problem Statement

스크립트 49개 중 44개가 최상위에 나열되어 빌드·운영·인수 검증의 소유 관계를
찾기 어려웠다. 소유권 복구와 템플릿 배포는 실행 파일·보조 모듈·테스트가 떨어져
있었고, 테스트 검색 패턴은 최상위 경로에 의존했다.

## Scope

스크립트의 위치, 상대 경로, npm·CI 실행 연결과 현재 아키텍처 문서를 정비한다.
리허설 개명·통합·삭제, 제품 동작 변경, 새 테스트 프레임워크와 범용 실행기 도입은
포함하지 않는다. 완료 제안서와 검증 보고서는 당시 경로를 보존한다.

## Decision Drivers

- 함께 변경하는 실행 파일·보조 모듈·SQL·테스트를 함께 탐색한다.
- 기존 명령과 검증 범위를 유지하고 이동에 따른 테스트 누락을 방지한다.
- DB·native Windows·모델이 필요한 인수와 외부 자원 없는 도구 테스트를 구분한다.
- 운영 도구에 서버 내부 접근용 테스트 예외를 부여하지 않는다.

## Considered Options

- 최상위 배치를 유지하고 목록 문서만 추가
- `repo`, `windows`, `ops`, `rehearsals`로 실행 종류별 분리
- 관련 파일을 책임별로 묶고 독립 명령은 최상위에 유지

## Decision Outcome

Chosen option: "책임별 묶음과 독립 명령 유지", because Windows·템플릿·소유권 복구의
변경 단위를 보존하면서 최상위 탐색 부담을 줄일 수 있다.

`checks`, `windows`, `templates`, `project-ownership`, `rehearsals`, `lib`로 배치한다.
Windows 및 D3 리허설은 해당 책임 안에 둔다. 테스트는 대상 옆에 두고 `lib`에는
여러 책임에서 실제 공유하는 코드만 남긴다. 독립적인 다섯 명령과 짝 테스트는
최상위에 유지한다. 현재 적용할 규칙과 명령 목록은
[verification.md](../architecture/verification.md#저장소-스크립트)가 소유한다.

### Acceptance

저장소 소유자는 2026-10-22 대화에서 책임별 배치와 동작 보존을 우선하는 정리안을
검토한 뒤 "좋다. 그럼 방금 이야기한 것을 토대로 작업을 진행해"라고 승인했다.
승인 범위는 해당 정리의 구현이며 리허설 삭제·운영 배포·PR 병합을 포함하지 않는다.

### Consequences

Positive:

- 최상위 파일은 44개에서 8개가 되고 관련 테스트·보조 코드가 가까워진다.
- `test:scripts`는 스크립트의 `.test.mjs`·`.test.ts`를 재귀 검색하여 `check`에서 실행한다.
- 기존 `test:architecture`와 `test:project-availability`는 부분 집합 명령으로 유지한다.

Negative / trade-offs:

- npm·CI·복구 경로·저장소 루트 계산과 서버 내부 참조 목록을 동시에 수정해야 한다.
- Windows 캐시 검증 코드의 변경은 캐시 키를 바꾸므로 첫 실행에서 재빌드할 수 있다.
- 파일 이동 자체는 리허설의 중복이나 작업 차수 기반 이름을 해소하지 않는다.

### Confirmation

`verify:fsd`, `verify:server`, `test:architecture`, `check`, 관련 테스트와 build를 실행한다.
서버 검사기의 회귀 시험은 이동한 리허설의 정확한 등록·미등록·stale 등록 및 같은
폴더의 운영 파일 거부를 확인한다. 이동 전후 파일·테스트 집합과 SQL 바이트를 대조한다.
실제 DB 및 native Windows 인수의 미실행은 로컬 테스트 통과와 구분해 보고한다.

### 후속 정리 — 2026-10-23

2026-10-23 후속 정리에서 구버전 D2 복구 CLI·SQL과 D3 리허설을 폐기했다.
소유권 디렉터리에는 현행 무결성의 읽기 전용 검사와 테스트를 유지하며, 이 ADR의 책임별
배치 원칙과 기존 migration 이력은 보존한다. 아래 비교는 최초 결정의 근거다.

## Pros and Cons of the Options

### 최상위 유지

- Good, because 경로 변경 비용이 없다.
- Bad, because 관련 운영 코드와 보조 모듈의 탐색 문제가 남는다.

### 실행 종류별 분리

- Good, because 파일 목록의 목적을 빠르게 구분할 수 있다.
- Bad, because 한 책임의 운영 도구·리허설·보조 모듈을 다시 분산한다.

### 책임별 묶음과 독립 명령 유지

- Good, because 함께 수정할 파일을 한곳에서 찾을 수 있다.
- Bad, because 독립 명령과 책임별 폴더의 구분을 리뷰에서 유지해야 한다.

## More Information

[ADR-0002](./0002-test-code-organization.md)의 대상 옆 테스트 배치를 유지한다.
파일 수만으로 폴더를 추가하지 않으며, 실제 소유권이나 실행 환경이 달라질 때 재검토한다.

## Review Checklist

- [x] 승인 범위와 현재 배치 규칙을 기록했다.
- [x] 대안과 경로 변경 비용을 명시했다.
- [x] 기존 테스트 배치·서버 내부 접근 원칙을 유지했다.
- [x] 자동 검증과 환경이 필요한 인수를 구분했다.
