---
status: "accepted"
date: "2026-11-16"
applies-to: ["packages/shared", "packages/app-core", "src/server", "src/fsd", "plugin/runtime", "plugin/lib", "plugin distribution"]
decision-makers: ["repository maintainer"]
consulted: ["Codex"]
informed: []
supersedes: ["0005", "0007"]
superseded-by: null
---

# 공유 코드의 소유권과 플러그인 배포 범위 분리

## Context and Problem Statement

현재 core/github의 생산 모듈 27개를 plugin/lib에 모두 복사한다. 앱의 slug·파이프라인 규칙과
서버의 토큰 발급·프로젝트 가용성·release 제작까지 플러그인 배포에 결합되어 있다.
실제 import만 추적해도 혼합 모듈 안의 서버 구현까지 따라가므로 파일 선별만으로는 해결되지 않는다.
코드의 책임과 독립 설치되는 플러그인의 공개 계약을 어떻게 분리할 것인가?

## Scope

공통 계약, 앱 전용 정책, 서버·플러그인 구현의 소유권과 공개 경로, shared의 실행 환경,
생성 lib·동기화·양 OS 패키징 경계에 적용한다. 제품 권한·토큰·데이터·프로토콜 의미,
새 OS 지원, npm 독립 출시, 별도 패키지 버전 체계, 번들러 도입은 다루지 않는다.

## Decision Drivers

- 앱 전용 변경 때문에 플러그인 배포물이 불필요하게 달라지지 않아야 한다.
- 실제 제품 책임에 따라 코드를 배치하고 같은 정책의 복제 구현을 피해야 한다.
- 공개·배포 의도와 브라우저/Node 경계가 자동 검사 가능한 계약이어야 한다.
- 서버와 설치 플러그인의 갱신 시차, 기존 해시와 오류, native 자원을 보존해야 한다.
- 현재 저장소 규모에서 workspace 패키지 출시·버전 운영 비용을 새로 만들지 않아야 한다.

## Considered Options

- 현행 core/github 전체 복사를 유지한다.
- 현행 파일을 유지하고 플러그인 import의 전이 의존성만 복사한다.
- 소비자마다 별도 패키지·독립 버전을 만든다.
- 책임별 소유 영역을 분리하고 명시적 공개·배포 계약과 제한된 의존성 검사를 둔다.

## Decision Outcome

Chosen option: "책임별 소유 영역 분리와 명시적 공개·배포 계약".
플러그인에도 제공하는 공통 계약은 packages/shared, 앱의 공통 순수 정책은 packages/app-core,
서버 전용은 src/server, 플러그인 전용은 plugin/runtime으로 나눈다. plugin/lib에는
선언한 shared entry와 내부 실행 의존성만 원본 경로·바이트 그대로 복사한다.
폴더 분리와 공개 명세가 의도를 정하고 검사기가 의존·배포의 완전성을 확인한다.

공개 목록과 실행 환경의 단일 기준은 [shared-modules.md](../architecture/shared-modules.md)다.
구체적인 이동·분리·소비자와 검증은 [전환 SDD](../proposals/active/shared-modules-and-plugin-distribution.md)를 따른다.

### Acceptance

사용자는 ARCH 후 MIGRATE 상세 계획을 바탕으로 실제 수정을 진행하도록 명시적으로 요청했다.
소스·명세·공개 경로·검사·패키징을 함께 전환하는 변경에서 이 결정을 accepted로 활성화한다.
ADR-0005/0007의 역사와 단일 원본 원칙을 보존하고 전체 복사 경계만 superseded 처리한다.
구현 및 검증 기록은 [MIGRATE 계획](../proposals/completed/2026-11-17-shared-modules-and-plugin-distribution-phase-migrate.md)이 소유한다.
실제 설치·운영 승격 승인은 이 결정에 포함되지 않는다.

### Consequences

Positive:

- app-core/server 변경과 플러그인 출하 범위를 분리할 수 있다.
- 새 모듈의 소유자·공개 여부·실행 환경을 명시적으로 검토할 수 있다.
- 공통 정책의 단일 원본을 유지하면서 설치에 필요한 내부 의존성을 빠짐없이 복사한다.
- FSD shared와 배포용 shared의 책임을 구분한다.

Negative / trade-offs:

- 혼합 파일을 함수·타입·helper·시험 단위로 나누고 모든 소비자를 한 전환에서 연결해야 한다.
- 공개 명세·경계 검사·시험 탐색을 유지하는 비용이 생긴다.
- runner 날짜 검증과 QA 텍스트/URL 검증 등 실제 영역 간 helper가 공개 계약으로 추가된다.
- 디렉터리 분리만으로 설치 호환성을 보장하지 못하며 양 OS·기존 설치본 인수가 계속 필요하다.

### Confirmation

ARCH에서는 현재 27개 원본과 export·타입·helper·소비자의 전환 목록, 공개 표와 JSON 예시,
문서 상태·링크와 현행 검사 입력 보존을 대조한다. MIGRATE에서는 금지 의존·runtime 유입·
배포 누락/고아·읽기 전용 check·재실행을 검사하고 이전 동작과 시험 발견을 보존한다.
ACCEPT에서는 외부 템플릿과 출시 reader, 기존 설치본, 양 OS bundle·설치·실행을 확인한다.
구체적 verifier는 SDD가 소유하며 문서 통과를 제품 인수로 확대하지 않는다.

## Pros and Cons of the Options

### 현행 전체 복사

- Good, because 구현과 동기화가 단순하고 현재 경로를 그대로 유지한다.
- Bad, because 책임이 다른 변경과 불필요한 코드를 계속 플러그인 배포에 결합한다.

### 실제 import만 따라 복사

- Good, because 현재 미사용 파일을 제외할 수 있고 수동 파일 목록을 줄인다.
- Bad, because 혼합 모듈의 불필요한 함수도 배포되고 import 하나가 공개 범위를 암묵적으로 넓힌다.

### 소비자별 독립 패키지와 버전

- Good, because 배포 단위를 도구 수준에서 분명하게 할 수 있다.
- Bad, because 현재 단일 저장소·플러그인 복사 방식에 release 순서와 패키지 버전 관리 부담을 더한다.

### 책임별 분리와 명시적 공개 계약

- Good, because 소유권·배포 의도·실행 환경을 각각 표현하며 현재 native 설치 방식을 유지한다.
- Bad, because 최초 전환과 경계 검사 유지 비용을 받아들여야 한다.

## More Information

[ADR-0005](0005-organize-core-modules.md)의 책임별 배치·단일 원본 원칙과
[ADR-0007](0007-share-github-url-modules.md)의 URL 규칙 단일화는 보존한다.
대체하는 것은 core/github 전체를 공통 배포 영역으로 보는 경계와 전체 복사 방식이다.
독립 패키지 출시가 실제로 필요해지거나 공통 entry의 소비자가 달라지면 이 결정을 재검토한다.

## Review Checklist

- [x] 실제 문제·범위·대안·비용과 확인 방법을 기록했다.
- [x] ARCH와 MIGRATE의 승인 및 실제 설치 인수 범위를 구분했다.
- [x] 영구 규칙과 전환 목록의 소유 문서를 연결했다.
- [x] 대체한 ADR 번호와 accepted 상태를 기록했다.
