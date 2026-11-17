---
status: "active"
---

# 공유 모듈 소유권과 플러그인 배포

이 문서는 현재 소스·공개 경로·실행 환경·배포 경계를 정의한다.
전환의 원본 대응표와 인수 범위는 [전환 SDD](../proposals/completed/2026-11-17-shared-modules-and-plugin-distribution.md),
선택 이유는 [ADR-0008](../ADR/0008-separate-shared-module-distribution.md)이 소유한다.

## 소유권과 배치

파일의 순수성만으로 위치를 정하지 않는다. 함께 변경되는 제품 책임과 실제 런타임
소비자를 먼저 확인한 뒤, 플러그인에 배포할 공통 계약인지 결정한다.
시험이나 리허설에서만 사용한다는 이유로 생산 공개 API를 늘리지 않는다.

| 영역 | 소유 책임 | 배포 |
| --- | --- | --- |
| `packages/shared` | 앱과 플러그인이 공유하며 플러그인에도 제공할 계약·규칙 | 선언한 공개 entry와 내부 실행 의존성을 `plugin/lib`에 복사 |
| `packages/app-core` | 웹과 서버가 공유하는 앱의 순수 제품 정책 | 플러그인에서 제외 |
| `src/server` | 서버 전용 정책·발급·보고 검증·release 제작·IO·트랜잭션 | 플러그인에서 제외 |
| `plugin/runtime` | 설치·로컬 설정·watch·OS 실행 등 플러그인 전용 구현 | 플러그인 원본으로 패키징 |
| `src/fsd` | 프런트엔드의 표현·기능과 서버 adapter | 플러그인에서 제외 |
| `plugin/lib` | shared 원본의 생성된 실행 복사본 | 직접 편집하지 않음 |

`packages/shared`의 생산 실행 모듈은 모두 공개 entry 또는 그 내부 의존성으로 설명되어야 한다.
테스트·타입 선언·README·배포 명세는 개발 자료이며 lib 복사 대상이 아니다.
FSD의 `src/fsd/shared`는 프런트엔드 기반 layer다. 두 shared는 역할과 의존 방향이 다르다.
`project-slug`처럼 웹·서버만 공유하는 정책은 `app-core/projects/slug.mjs`가 소유한다.
GitHub의 저장소 주소 해석은 `shared/github/repo-url.mjs`, 보드 파일 링크 생성은
기존 FSD `entities/board-item/model/doc-link.ts`가 소유한다.

## 의존 방향과 공개 경로

| 소비자 | 허용 대상 |
| --- | --- |
| shared | 자신의 실행 모듈, node entry의 Node 내장 모듈 |
| app-core | app-core, shared 공개 entry |
| server | 기존 서버 모듈 방향과 공개 API, app-core·shared 공개 entry |
| FSD | 기존 FSD 방향과 public API, app-core·shared 공개 entry. server는 기존 서버 adapter 경계 |
| plugin runtime/bin | plugin 내부, 배포된 shared 공개 entry |

shared는 app-core·src·plugin을 참조하지 않는다. app-core는 server·plugin을 참조하지 않는다.
shared와 app-core는 외부 npm package를 추가하지 않는다. app-core는 브라우저에서 실행할 수
있는 순수 정책으로 한정하고, Node 전용 처리는 server 또는 shared의 명시된 node entry에 둔다.
제품 코드의 테스트·fixture import, 영역 밖에서 shared 내부 helper로의 직접 import도 금지한다.

앱은 `@harness/shared/<path>`와 `@harness/app-core/<path>`를 사용한다. shared 내부는
상대 경로, 플러그인은 `plugin/lib`까지의 상대 경로를 사용한다. alias는 `tsconfig.json`과 검사기에 함께 등록한다. 공개 여부는 alias만으로 강제되지 않는다.
전체 모듈을 다시 모으는 전역 barrel은 만들지 않는다.

### 서버로 옮기는 정책의 진입점

서버 모듈 내부는 같은 모듈의 실제 파일을 상대 import한다. 다른 모듈·FSD 서버 adapter·
운영 도구는 `api.ts` 또는 타입용 `contracts.ts`를 통한다. 기존 `api.server.ts`의 DB 기본
연결과 `api.ts`의 주입형/DB 비초기화 경계를 유지한다. 이동만으로 `server-only` bootstrap이나
DB 연결을 새로 요구하지 않는다.

- `tokens/token-crypto.ts`의 `newToken`, `hashToken`은 `tokens/api.ts`에서 공개한다.
  토큰 형식은 shared를 사용하며 발급·랜덤 생성·해시는 플러그인으로 배포하지 않는다.
- `templates/release-preparation.ts`의 외부 소비 함수는 `templates/api.ts`를 통한다.
  현재 `pipeline/template-selection.ts`의 `installationFor`, `selectTemplateLanguage` 사용을
  위해 **pipeline → templates** 의존을 방향표와 검사기에서 허용한다.
  templates → pipeline은 허용하지 않아 순환을 만들지 않는다.
- `runbookIsStale`은 기존 `templates/runbook-query.ts`의 내부 판정으로 옮긴다.
  기존 공개 `runbookStale` façade를 유지한다. 시험과 acceptance-failure 리허설도 그 façade를
  통해 검증한다. reported가 잘못된 값일 때 저장값으로 fallback하는 의미를 보존하도록 SDD의
  fixture 전환을 따른다. 별도 `templates/api.server.ts`는 만들지 않는다.
- `projects/availability-policy.ts`, `usage/usage-window.ts`, `usage/request-rate-policy.ts`,
  `runners/timing.ts`, `pipeline/input-validation.ts`, `pipeline/qa-report.ts`는 각각 해당
  서버 모듈이 소유한다. 실제 외부 소비가 없는 함수를 공개 façade에 무조건 올리지 않는다.


| 공개 server 값 | 현재 외부 생산 소비자 |
| --- | --- |
| `tokens/api.ts`: newToken | create-project·manage-user-token의 FSD 서버 Action, 기존 발급 리허설(파일별 목록 참조); macOS 리허설은 main 내부 동적 import |
| `tokens/api.ts`: hashToken | mcp/auth, rest/scope |
| `templates/api.ts`: releaseDeliverable | rest/runbook-handler, rest/templates-handler |
| `templates/api.ts`: selectTemplateLanguage | pipeline/template-selection |
| `templates/api.ts`: installationFor | pipeline/template-selection, rest/runbook-handler, rest/templates-handler |

나머지 이동 함수는 현재 생산 소비가 같은 server 모듈 안에 있으므로 새 façade export를 만들지 않는다.
`runbookIsStale`의 리허설 소비는 기존 `runbookStale`로 바꾸며 private helper 자체는 공개하지 않는다.

서버 방향표·공개 symbol·시험 내부 참조의 단일 기준은 [server.md](./server.md)다.

## 공개 entry와 실행 환경

경로는 `packages/shared/` 기준이다. 확정된 초기 목록은 **14개 entry, 값 export 59개**다.
타입은 이 값 개수와 별도로 관리한다. `universal`은 Node 내장 모듈이나 Node entry를
직접·간접으로 참조하지 않아야 한다. `node`는 Node 내장 모듈을 쓸 수 있으며 브라우저의
Client Component 의존 그래프에 들어갈 수 없다. FSD 파일이라는 이유만으로 브라우저 실행으로
분류하지 않고 실제 Client 진입점과 전이 의존을 확인한다.

| shared 기준 공개 경로 | runtime | 공개 값 export |
| --- | --- | --- |
| `configuration/workspaces.mjs` | universal | `validateWorkspaceSemantics` |
| `execution/client-runtime.mjs` | universal | `CLIENTS`, `RUNTIME_PROTOCOL`, `RUNTIME_MARKER`, `parseClient`, `clientRuntime`, `runtimeEcho` |
| `execution/runner-contract.mjs` | universal | `RUNNER_MODES`, `RUNNER_WAIT_REASONS`, `RUNNER_PERMISSIONS`, `RUNNER_STOP_REASONS`, `RUNNER_AUTOSTART_STATES`, `RUNNER_SIGNIN_CODES`, `RUNNER_HOST_MAX`, `RUNNER_BRANCH_MAX`, `RUNNER_RESULT_MAX`, `RUNNER_LOG_MAX`, `limitedResult`, `limitedUntil`, `runnerTimestamp` |
| `github/repo-url.mjs` | universal | `SEGMENT`, `parseRepoUrl` |
| `plans/limits.mjs` | universal | `PLANS`, `DEFAULT_PLAN`, `UNLIMITED`, `RESIDENT_RUNNER_PLAN_GATE`, `CODEX_RESIDENT_RUNNER_PLAN_GATE`, `REPORT_AGENTS`, `LIMITS`, `isPlan`, `limitsFor`, `withinLimit`, `capReason` |
| `qa/validation.mjs` | universal | `qaText`, `qaHttpUrl` |
| `templates/codex-bundle.mjs` | universal | `COMMON_DOCS`, `validateCodexBundle` |
| `templates/deliver.mjs` | universal | `STEP_HEADING`, `stubOf`, `deliverable` |
| `templates/manifest-hash.mjs` | node | `deliverySurfaceHash`, `canonicalJson`, `manifestHash` |
| `templates/release-contract.mjs` | node | `TEMPLATE_PROTOCOL`, `TEMPLATE_CONTRACT`, `installationGuide`, `readTemplateContract`, `compatibleInstallation` |
| `templates/render.mjs` | universal | `renderTemplate` |
| `templates/runbook.mjs` | node | `RUNBOOK_TEMPLATE`, `runbookVersion`, `codexRunbookVersion`, `isRunbookVersion` |
| `templates/vars.mjs` | universal | `DEFAULT_SCOUT_QUESTION`, `buildVars`, `buildWorkspaceVars` |
| `tokens/format.mjs` | universal | `TOKEN_KINDS`, `parseBearer`, `tokenPrefix` |

실제 소비 근거는 다음과 같다. 아래는 책임 설명이며 완전성의 기준은 SDD의 파일별 목록이다.

| 계약 | 앱 소비 | 플러그인 소비 |
| --- | --- | --- |
| workspaces | 프로젝트 등록·동기화 | harness 설정 해석 |
| client-runtime·runner-contract | 서버 runner·REST와 앱 상태 표시 | watch·session·background |
| limits | 앱 플랜 표시·서버 권한/상한 | 템플릿 제공·runner 사용 조건 |
| token format | 서버 인증·발급 | HTTP/MCP helper의 Bearer 형식 |
| QA validation | QA 보고 해석 | QA 설정 해석 |
| release-contract·manifest-hash | release 준비·선택·설치 admission | init·template-installation |
| deliver·codex-bundle·render·runbook·vars | 템플릿 응답·실행 준비·런북 상태 | 생성·검증·설치 |
| repo-url | 저장소 등록과 입력 | init의 origin 해석 |

`templates/template-boundary.mjs`는 deliver/codex-bundle의 **내부 실행 모듈**로 복사한다.
영역 밖에서는 deliver가 재수출하는 `STEP_HEADING`, `stubOf`를 사용한다.
별도의 공개 entry를 추가하거나 같은 구현을 복제하지 않는다.

| shared 모듈 | 실행 의존성 |
| --- | --- |
| configuration/workspaces | plans/limits |
| templates/deliver | plans/limits, execution/client-runtime, templates/codex-bundle, templates/template-boundary |
| templates/codex-bundle | plans/limits, execution/client-runtime, templates/template-boundary |
| templates/vars | execution/client-runtime |
| templates/release-contract | templates/manifest-hash의 canonicalJson·manifestHash |
| templates/manifest-hash, templates/runbook | node:crypto |
| 나머지 공개 entry와 template-boundary | 외부 실행 import 없음; qaHttpUrl은 같은 qa/validation의 qaText 사용 |

이는 현재 실행 의존 계약이다. release-contract는 상수가 포함되어도 해시 의존 때문에 node다.
공개 표·명세와 함께 이 그래프의 폐쇄성과 universal → node 간선 부재를 `verify:shared`에서 검사한다.

### 분리하면서 보존하는 helper와 타입

- `tokenPrefix`는 기존 private `prefixOf`의 공개 이름이다. 발급과 파싱의 kind 검증·오류를 공유한다.
- `runnerTimestamp`는 기존 private `time(value, field)`의 공개 이름이다. shared의
  `limitedResult`와 app-core 상태 판정이 같은 날짜 검증·밀리초 반환·오류를 사용한다.
- `qaText`, `qaHttpUrl`은 기존 QA private `text`, `httpUrl`의 공개 이름이다. server 보고와
  plugin 설정의 trim·길이·HTTP(S) URL·오류 규칙을 그대로 공유한다.

공개 helper의 추가는 위의 실제 영역 간 소비를 위한 것이며 일반 유틸리티 추출이 아니다.
`Plan`, `Client`의 JSDoc과 `TemplateContract`, `Installation`의 `.d.mts`는 shared 소유다.
`RunnerSignal`은 app-core, `AvailabilityCandidate`는 server/projects,
`QaStatus`·`QaReport`와 `TemplateRow`·`TemplateSource`는 각 서버 구현이 소유한다.
`QaConfig`는 plugin 설정 모듈에 기능적 JSDoc으로 둬 추론을 보존한다. 실제 외부 타입 소비가
없는 선언을 새 공개 경로로 만들지 않는다. 타입·함수 선언의 상세 분할은 SDD를 따른다.

## 배포 명세와 복사

[packages/shared/plugin-exports.json](../../packages/shared/plugin-exports.json)이 실제 배포 명세다.
형식은 `{ "version": 1, "entries": [{ "path": "…mjs", "runtime": "universal" | "node" }] }`다.
경로·runtime을 바꿀 때 이 문서의 공개 계약과 명세를 함께 갱신한다.

명세는 공개 경로와 실행 환경을 선언한다. 복사기는 이 entry에서 정적 import·재수출·
문자열 리터럴 dynamic import를 따라 shared 내부 실행 의존성을 계산한다.
계산형 shared import, 없는 원본, shared 밖 참조, 테스트/타입/개발 자료 참조, 잘못된 runtime,
고립 생산 모듈은 실패시킨다. 문자열 리터럴이어도 Node 내장 모듈은 복사 대상이 아니며
node runtime에서만 허용한다. 경로는 shared 루트 안에 있어야 하고 traversal·절대 경로·
symlink·junction·hardlink와 비정규 파일을 허용하지 않는다.

`packages/shared/<path>`를 `plugin/lib/<path>`로 상대 경로와 바이트를 보존하여 복사한다.
공개 14개와 내부 template-boundary 1개가 이 기준의 실행 파일 집합이다. 향후 파일 수 자체를
계약으로 고정하지 않고 명세와 전이 의존으로 산출한다. `.d.mts`, `.test.*`, README와
`plugin-exports.json`은 lib에 복사하지 않는다. 배포 폴더에서 원본을 역추론하지 않는다.

## 동기화의 상태와 실패 처리

1. 명세·경로·모든 원본·전체 의존 그래프·runtime을 먼저 검증하고 기대 파일과 바이트를 계산한다.
   입력 오류가 있으면 lib를 하나도 쓰거나 지우지 않는다.
2. check는 기대 집합과 실제 lib의 내용·누락·고아를 비교하는 읽기 전용 동작이다.
   잘못된 상태를 자동 수정하거나 시간·권한을 바꾸지 않는다.
3. sync는 검증된 집합으로 생성물만 갱신하고 더 이상 배포하지 않는 lib 파일을 제거한다.
   source, plugin/runtime, native assets, 사용자 설치 폴더를 정리 대상으로 삼지 않는다.
4. 동일 입력의 재실행은 동일 경로와 바이트를 만든다. 중간 IO 실패는 비정상 종료하며
   부분 생성물을 성공으로 보고하지 않는다. 재실행 후 check가 통과해야 패키징한다.
5. sync 전체의 원자성을 가정하지 않는다. 한 checkout에서 sync/패키징을 직렬 실행하고,
   서로 다른 작성자의 동시 실행은 별도 checkout으로 분리한다. CI는 검증한 단일 revision에서
   sync 결과·출하 파일을 확인한다.

## 패키징과 호환성

`plugin/lib`의 축소는 플러그인 전체 출하 목록의 축소와 다르다. 기존 양 OS 패키저의
공통 출하 판정과 native Node·verifier·license·mode·hook·skill 자원을 보존한다.
플러그인 내부의 기존 동적 dispatcher와 native asset 선택은 shared 그래프 검사로
대체하지 않고 기존 런타임·패키징 시험으로 확인한다.

새 코드 위치로 인해 wire protocol, token prefix/랜덤 값/해시, plan 의미, runner timing,
QA 오류, 템플릿 본문 경계·정렬·줄바꿈·해시·설치 lock 의미가 바뀌어서는 안 된다.
서버와 설치 플러그인은 독립 갱신되므로 기존 설치본·출시 reader·외부 템플릿 참조는
ACCEPT에서 별도로 확인한다. 정적 목록 대조를 실제 설치 호환성 통과로 보고하지 않는다.
출하 파일 변경의 두 manifest 버전과 release gate는 현행 [검증 규칙](./verification.md)을 따른다.

## 자동 검증과 변경 절차

`scripts/lib/shared-module-graph.mjs`가 명세·원본·전이 의존·경로 안전성을 읽고,
`scripts/checks/verify-shared-boundaries.mjs`가 공개 경로·소유권·Client의 node 유입을 검사한다.
`use server` 파일의 유효한 async Action 참조는 서버 실행 경계로 처리하며 일반 barrel을 통한
node 유입은 거부한다. 타입 참조도 소유권 검사를 받지만 실행 의존으로 복사하지 않는다.
검사 중 shared 소스를 실행하지 않는다. 계산형 shared import와 require는 허용하지 않는다.

- `npm run verify:shared`: shared/app-core/src/plugin/scripts/tests의 first-party 경계를 검사한다.
- `npm run sync:plugin-lib`: 명세 closure로 생성물을 동기화한다.
- `node scripts/plugin-lib.mjs --check`: 읽기 전용 drift·orphan 검사이며 `check`의 첫 단계다.
- `npm test`: shared/app-core와 plugin/runtime의 재귀 시험, plugin/bin 시험을 실행한다.
- `npm run test:policy-contracts`: 서버/FSD로 옮긴 정책의 동일 입력·거부·경계값을 양 OS CI에서 검증한다.

양 OS 패키저는 공통 `scripts/lib/plugin-payload.mjs`의 출하 판정과
`validatePluginModulesForPackaging`을 사용한다. 출력 생성 전에 lib의 집합·바이트,
first-party bin/runtime 모듈의 Git 추적 집합과 안전한 원본을 검증한다. 새 파일은 Git index에도
등록해야 한다. native Node 내부 vendor 모듈은 이 그래프에서 제외하고 기존 runtime 검증이 소유한다.
패키저 시험은 작업 트리의 현재 소스를 임시 저장소로 복사하여 실제 패키지 inventory·바이트·거부를 검증한다.

기존 설치본·외부 템플릿·native 설치 인수는 SDD의 ACCEPT 범위다.
저장소 검사나 fixture 패키징 통과로 실제 설치 호환성을 대신하지 않는다.
