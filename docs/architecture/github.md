# GitHub URL 공통 모듈

`packages/github`는 웹·서버·플러그인이 사용하는 GitHub 저장소 주소 해석과 파일 URL
생성을 소유한다. 별도 npm workspace, 독립 빌드 또는 버전은 만들지 않는다.

| 모듈 | 공개 계약 |
| --- | --- |
| `repo-url.mjs` | `parseRepoUrl`은 지원하는 주소에서 `{ owner, repo }`를 반환하고 실패하면 `null`을 반환한다. `SEGMENT`는 기존 등록 입력의 허용 문자 규칙이다 |
| `blob-url.mjs` | `blobHref`는 owner·repo·ref·path를 인코딩하여 GitHub 파일 URL을 만든다. ref가 없으면 전달받은 branch를 사용한다 |

주소 입력의 허용 범위, 대소문자 보존, ref 선택과 경로 인코딩 동작을 유지한다.
`SEGMENT`를 GitHub 서비스의 모든 이름 제약을 검증하는 규칙으로 확대 해석하지 않는다.
테스트는 구현 옆의 `.test.mjs`로 둔다.

## 의존성과 소비

- 생산 모듈은 같은 디렉터리의 모듈만 참조한다. Node 내장 모듈, npm package,
  `src`, `packages/core`에 의존하지 않아 브라우저와 Node에서 함께 실행할 수 있다.
- `.test.mjs`의 Node 내장 모듈 참조는 테스트 실행에 허용한다.
- core와 GitHub 모듈은 서로 참조하지 않는다. 제품 규칙과 URL 규칙이 모두 필요한
  웹·서버·플러그인 소비자가 조합한다.
- 웹·서버는 `@harness/github/repo-url.mjs`, `@harness/github/blob-url.mjs`를 직접
  import한다. 전체 barrel은 만들지 않는다.
- create-project의 입력·slug 파생, board-item의 보고서 표시 규칙과 공개 API는
  각 FSD slice에 유지한다. `blobHref`의 기존 entity export는 공유 구현을 재수출한다.
- GitHub API 호출, OAuth, credential 저장·갱신, 연결 상태와 webhook 처리는
  `src/server/github`에 유지한다.

## 배포와 검증

`npm run sync:plugin-lib`는 `packages/github`의 생산 `.mjs`를 `plugin/lib/github`에
같은 상대 경로와 내용으로 복사한다. core는 기존 `plugin/lib` 경로를 유지한다.
두 원본 디렉터리가 모두 있어야 하며 배포 경로 충돌은 쓰기 전에 거부한다.
테스트·타입 선언은 복사하지 않고 원본이 없는 `.mjs` 복사본은 제거한다.

`verify:fsd`는 GitHub 모듈의 의존성 경계와 core의 역참조를 검사한다.
`npm test`와 macOS runtime contracts는 `packages/github/**/*.test.mjs`를 실행한다.
`npm run check`는 복사본 일치, 웹·서버 타입과 아키텍처 검사를 포함한다.
URL 계약·소비자 회귀 시험과 production build로 이동 전후의 동작을 확인한다.

선택 배경은 [ADR-0007](../ADR/0007-share-github-url-modules.md)에 기록한다.
