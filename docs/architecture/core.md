# 공유 규칙과 프로토콜

`packages/core`는 웹·서버·플러그인이 공유하는 규칙과 프로토콜의 원본이다.
별도 npm workspace가 아니며 `src`나 외부 npm package에 의존하지 않는다.
Node 내장 모듈은 허용하지만 브라우저에서 쓰는 모듈의 의존 그래프에는 들어가면 안 된다.

## 책임별 배치

| 위치 | 소유하는 규칙 |
| --- | --- |
| `pipeline/` | 파이프라인 그래프·커서, 보드 상태 전이, 백로그 항목 |
| `templates/` | 배포할 템플릿 선택, Codex 번들 검증, 본문 경계·렌더링·변수, 설치 manifest·런북 버전 |
| `configuration/` | `harness.json` 파싱과 워크스페이스 설정 검증 |
| `tokens/` | 토큰 생성·해시·Bearer 파싱과 만료·폐기 판정 |
| `plans/` | 플랜 권한·상한, 플랜 변경 시 프로젝트 선택, 계정 실행 사용량 창 |
| `execution/` | 클라이언트 실행 계약, runner 생존·lease 판정, watch 응답·다음 작업 판정 |
| `qa.mjs` | 설정과 보고 양쪽이 사용하는 브라우저 QA 계약 |
| `repo-url.mjs`, `project-slug.mjs` | 독립적인 저장소 URL 파싱과 프로젝트 slug 규칙 |
| `request-rate.mjs` | 플랜과 독립적인 API 요청 제한 창 |

관련 구현·`.d.mts`·테스트는 같은 폴더에 둔다. 한 책임의 파일은 한 단계로
배치하며, 독립적인 작은 규칙을 담기 위해 한 파일짜리 폴더를 만들지 않는다.
새 규칙은 파일 종류보다 변경 이유와 실제 소비처를 기준으로 위치를 정한다.

## 의존성과 공개 경로

현재 책임 간 의존 방향은 다음과 같다.

- `pipeline` → `plans`
- `configuration` → `plans`, 루트 QA 계약
- `templates` → `plans`, `execution`의 클라이언트 계약
- `execution`, `plans`, `tokens`와 루트의 독립 규칙은 다른 책임에 의존하지 않는다.

`execution/client-runtime.mjs`는 실행 계약만 소유한다. 배포 파일 목록과
`validateCodexBundle`은 `templates/codex-bundle.mjs`가 소유하여 템플릿으로 향하는
역방향 의존을 만들지 않는다. 테스트는 필요한 책임을 함께 검증할 수 있다.

소비자는 `@harness/core/plans/entitlement.mjs`처럼 실제 모듈 경로를 사용한다.
전체 core나 폴더 단위의 barrel을 만들지 않는다. `tokens/token.mjs`,
`templates/manifest.mjs`, `templates/runbook.mjs`는 `node:crypto`를 사용하므로
브라우저에 필요한 순수 판정과 한 진입점으로 합치지 않는다.
이 배치는 FSD layer나 별도 배포 package를 추가하지 않는다.

## 배포와 검증

`plugin/lib`는 `packages/core`의 배포 복사본이며 상대 디렉터리 구조와 파일 내용을
그대로 유지한다. `npm run sync:plugin-lib`는 `.mjs`를 재귀 복사하되 테스트를 제외하고,
원본이 없는 배포 모듈을 제거한다. 복사본을 직접 수정하지 않는다.

`npm test`는 `packages/core/**/*.test.mjs`를 탐색한다. `pipeline-types.test.ts`는
`npm run check`의 TypeScript 검사로 검증한다. 경로를 바꿀 때 소비자의 import,
파일을 읽는 시험, 플러그인 fixture와 현재 아키텍처 문서를 함께 수정한다.
과거 제안서·검증 보고서의 당시 경로는 보존한다.

외부 의존 금지는 `verify:fsd`, 복사본 일치는 `plugin-lib.mjs --check`가 검사한다.
책임 간 의존 방향과 브라우저의 전이 의존은 코드 리뷰와 빌드로 확인한다.
선택의 근거는 [ADR-0005](../ADR/0005-organize-core-modules.md)에 기록한다.
