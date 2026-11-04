---
status: "accepted"
date: "2026-11-04"
applies-to: ["packages/github", "packages/core", "src/fsd", "src/server/projects", "plugin/lib", "scripts/plugin-lib.mjs"]
decision-makers: ["repository owner"]
consulted: []
informed: ["contributors and coding agents"]
supersedes: []
superseded-by: null
---

# GitHub URL 규칙의 독립 공유 영역

## Context and Problem Statement

저장소 주소 파싱은 웹과 플러그인이 core를 통해 공유하고, GitHub 파일 링크 생성은
보드 entity에 있지만 검토·이력 화면에서도 사용한다. 둘은 GitHub 주소 형식에 관한
규칙이며 프로젝트 slug, 보고서 분류와 사용자 연결 상태에 의존하지 않는다.

## Considered Options

- 현재 위치와 배포 경로 유지
- `packages/core/github` 아래에 URL 규칙을 모으기
- `packages/github`에 주소 파싱·파일 URL 생성만 분리하기

## Decision Outcome

세 번째 안을 선택한다. GitHub 주소 규칙의 소유권을 제품 규칙·보드 표시 모델과
분리하고 기존 소비자가 직접 사용한다. 공통 코드는 `repo-url.mjs`와 `blob-url.mjs`로
제한하며, 별도 npm package·빌드·독립 버전은 도입하지 않는다.
현재 경계와 공개 계약은 [github.md](../architecture/github.md)가 소유한다.

GitHub API·OAuth·credential 수명주기는 서버에, 보고서 이름·수락 판정은 entity에
유지한다. URL 파싱과 인코딩 결과, 웹 공개 API와 서버의 등록 입력 검증은 보존한다.
기존 core의 다른 책임과 내부 의존 방향은 ADR-0005를 계속 따른다.

### Acceptance

저장소 소유자는 2026-11-04 대화에서 이 범위를 검토하고 수정·검증·커밋과 dev 대상
PR 생성을 요청했다. PR 병합과 운영 배포는 이 승인에 포함되지 않는다.

### Consequences

- GitHub 주소 규칙의 구현·시험을 같은 영역에서 찾을 수 있다.
- 웹·서버의 import alias, 테스트 탐색, 의존성 검사와 플러그인 동기화를 함께 수정한다.
- core 복사본의 경로는 유지하고 GitHub 복사본에는 `plugin/lib/github`를 사용한다.
  원본 누락과 배포 경로 충돌은 동기화 전에 거부한다.

### Confirmation

주소 파서와 경로 인코딩 시험을 새 소유자 옆으로 옮기고 소비자 회귀 시험을 유지한다.
플러그인 복사·고아 정리·원본 누락·충돌 거부와 의존성 경계를 시험한다.
`verify:fsd`, `verify:server`, `test:architecture`, `check`, core·GitHub·plugin·web·server
테스트와 production build를 실행하며 다른 OS·실제 DB 검증 여부는 따로 보고한다.
