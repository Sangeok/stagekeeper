---
status: "accepted"
date: "2026-10-23"
applies-to: ["packages/core", "plugin/lib", "scripts/plugin-lib.mjs", "package.json"]
decision-makers: ["repository owner"]
consulted: []
informed: ["contributors and coding agents"]
supersedes: []
superseded-by: null
---

# Core 모듈의 책임별 배치

## Context and Problem Statement

공유 규칙의 구현·타입 선언·테스트가 core 루트에 놓여 템플릿 설치, 실행 감시,
플랜 권한과 보드 규칙의 관계를 찾기 어려웠다. 최신 dev에는 구현 22개를 포함한
47개 파일이 있으며, 플러그인 동기화와 테스트 명령은 루트 파일만 탐색한다.

## Considered Options

- 이름과 목록 문서만 개선하고 평평한 구조 유지
- 템플릿·토큰만 먼저 이동
- 전체 파일의 책임을 정하고 관련 모듈은 한 단계로 묶되 독립 규칙은 루트에 유지

## Decision Outcome

세 번째 안을 선택한다. 일부만 옮겨도 동기화·테스트 탐색 수정은 필요하므로,
소비 경로를 한 번에 정리하고 기능별 탐색 기준을 일관되게 만든다.
현재 책임과 경로는 [core.md](../architecture/core.md)가 소유한다.

테스트·타입 선언은 구현 옆에 둔다. Codex 번들 검증과 배포 파일 목록은
클라이언트 실행 계약에서 템플릿 책임으로 옮겨 책임 사이 순환을 피한다.
동작과 함수 이름·입출력은 유지하며, 호환용 루트 재수출이나 전체 barrel은 만들지 않는다.
Node 의존성을 가진 모듈을 브라우저용 모듈과 합치지 않는다.

### Acceptance

저장소 소유자는 2026-10-23 대화에서 책임별 한 단계 분류, 독립 규칙 유지와
동작 보존을 검토한 뒤 수정과 검증을 요청했다. 승인 범위는 이 정리이며
운영 배포나 PR 병합은 포함하지 않는다.

### Consequences

- 기능별 탐색 경로가 생기고 구현·타입·시험의 근접성을 유지한다.
- 웹·서버·플러그인·스크립트의 소비 경로를 함께 수정해야 한다.
- 플러그인 복사본은 하위 경로를 보존하고, 고아 모듈 검사도 재귀적으로 수행한다.
- npm package 분리, FSD layer 도입과 정책 함수의 광범위한 재작성은 하지 않는다.

### Confirmation

이동 전후 모듈과 테스트를 대조하고, 중첩 배포 경로의 복사·drift·고아 정리를
회귀 시험으로 확인한다. `verify:fsd`, `verify:server`, `test:architecture`,
`check`, core·plugin·web·server 테스트와 production build를 실행한다.
실제 DB·native Windows 검증 여부는 로컬 통과와 구분하여 보고한다.
