# 아키텍처 검증

## 자동 검사

`scripts/checks/verify-fsd-boundaries.mjs`는 외부 package 없이 정적 import를 검사한다.
`scripts/checks/verify-server-boundaries.mjs`는 설치된 TypeScript의 AST·모듈 해석을 사용해
[서버 모듈 계약](./server.md)의 공개 경로·방향·타입 간선·순환·초기화 closure와 시험 목록을 검사한다.

```powershell
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run lint
npm run check      # 위 셋 + 복사본 동기화 검사 + 타입 검사 — CI와 같은 게이트
```

`npm run lint`는 ESLint 뒤에 FSD·서버 검사를 실행하므로 일반적인 품질 게이트에서
아키텍처 경계도 함께 확인한다.

검사 대상:

- FSD layer의 상향 import
- 같은 layer의 다른 slice import
- 다른 slice 내부로 들어가는 deep import
- non-empty slice의 public API 누락
- FSD에서 `src/server`를 호출하는 server adapter의 위치와 directive
- `"use client"` 파일의 직접 import 중 `src/server`, `index.server`, `*.server` 경로
- `src/server → src/fsd` 역방향 의존
- `packages/core`의 `src` 또는 외부 npm package 의존
- `src/components`, `src/hooks`, `src/lib`, `src/utils`, `src/types` 같은 전역
  기술 분류 폴더
- kebab-case가 아닌 layer/slice/segment/file 이름
- 루트 `app/`과 `src/app/`의 동시 존재
- `plugin/lib`가 `packages/core`의 배포 모듈과 바이트 동일한지 — 내용이 다른 것(drift)과
  원본이 사라진 것(orphan) 모두 (`scripts/plugin-lib.mjs --check`, `npm run check`의 첫 단계)

정규식 기반 검사라 계산된 dynamic import, TypeScript path alias의 복잡한 재정의,
런타임 의존성까지 완전히 증명하지는 못한다. 자동 검사를 통과했다는 사실은 아래
리뷰를 생략할 근거가 아니다.

## FSD 규칙의 검증

규칙 본문은 [fsd.md](./fsd.md)가 소유한다. 현재 자동 검사는 파일 경로와 소스의
import·directive를 확인하며, 책임의 적절성이나 전체 모듈 그래프를 판정하지 않는다.

| 확인 사항 | 현재 자동화 | 추가 확인 |
| --- | --- | --- |
| layer 방향·slice 격리·외부 public API 경로 | `verify:fsd`가 인식한 import 경로와 non-empty slice의 진입점 파일 존재를 검사한다 | 실제 export와 소비 계약이 맞는지 확인한다. 다른 slice를 절대 경로로 참조하는 규칙은 별도로 리뷰한다 |
| 공개 symbol과 자기 public API 참조 | 같은 slice의 절대 경로 import는 거부한다 | `export *` 금지, 필요한 symbol만 공개하는지, 상대 경로로 자기 barrel을 참조하지 않는지는 전용 자동 검사가 없다 |
| `shared` 공개 경로 | `shared` 밖에서 segment 또는 unit 경로보다 깊게 들어가는 import를 거부한다 | 단일 파일·폴더형 unit의 실제 진입점과 export를 확인한다. `shared` 내부에는 unit별 접근 금지 규칙이나 전용 검사가 없다 |
| 서버 adapter와 Client 경계 | FSD의 `src/server` 직접 import 위치·directive와 `"use client"` 파일의 서버 경로 직접 import를 검사한다 | 일반 barrel을 경유한 서버 코드 유입, `server-only`와 `"use server"`의 용도, Action 전달·입력 검증·인가는 코드 리뷰와 관련 동작 검증으로 확인한다 |
| slice 책임·공통화·상태 위치 | 전용 자동 검사 없음 | [코드 배치와 추출 판단](./fsd.md#코드-배치와-추출-판단)에 따라 소유권·변경 이유·실제 소비처를 확인한다 |

`npm run test:architecture`는 검사기 등을 포함한 `scripts/**/*.test.mjs`의 회귀
테스트를 실행한다. 문서의 모든 규칙이나 애플리케이션의 Server/Client 연결을
증명하는 명령은 아니다. 코드 변경 시 `npm run check`의 lint·타입 검사와
`npm run build`, 변경 영역의 관련 테스트를 함께 적용한다. 빌드 통과도 Action의
인증·인가나 업무 동작 검증을 대신하지 않는다.

## 테스트 배치 규칙의 검증

규칙 본문은 [test-organization.md](./test-organization.md)가 소유한다.
이 절은 현재 자동화 상태와 변경 작성자·PR 리뷰어가 확인할 항목을 구분한다.

| 확인 사항 | 현재 자동화 | 수동 확인 |
| --- | --- | --- |
| FSD layer·slice·public API·이름 | `verify:fsd`가 `src/`와 `packages/core/`의 코드·테스트를 검사한다 | 루트 `tests/`·`plugin/`·`scripts/`는 이 import 검사 대상이 아니므로 해당 경계는 리뷰한다 |
| `src/`·`src/app/` 바로 아래 테스트 배치 금지 | 전용 자동 검사 없음 | 두 위치에 테스트 파일·테스트 전용 보조 코드·테스트 전용 디렉터리가 없는지 확인한다. 대상 옆 배치 원칙보다 이 금지 규칙을 우선한다 |
| 대상 옆 배치와 테스트 소유권 | 전용 자동 검사 없음 | 대상과 실행 환경에 맞는 위치인지, 하위 폴더 분리가 필요한지 확인한다 |
| 운영 코드 → 테스트·fixture·helper 의존 금지 | 테스트 전용 import·export를 구별하는 전용 검사 없음 | 운영 진입점과 public API가 테스트 전용 코드를 직접 또는 간접 참조하지 않는지 확인한다 |
| 서버 모듈 내부 참조 | `verify:server`가 정적 참조와 실제 VM source 경로의 파일·모듈 등록 및 미사용 행을 검사한다 | mock 키·계산된 loader 경로는 binding 시험과 실제 리허설로 확인한다 |
| 테스트 검색과 실행 | 명령에 지정된 패턴에 일치하는 파일만 실행한다 | 신규·이동 파일이 명령에 포함되고 실행 결과에 나타나는지 확인한다 |

현재 테스트 명령과 CI의 관계는 다음과 같다. 정확한 실행 패턴은
[package.json](../../package.json), CI 연결은
[check.yml](../../.github/workflows/check.yml)을 기준으로 한다.

- `npm run test:web`: `src/**/*.test.ts`와 `src/**/*.test.mjs`를 실행하며 `check` workflow에
  연결되어 있다. `.test.tsx`는 현재 포함하지 않는다. 해당 확장자 도입 시 실행 패턴과
  환경을 같은 변경에서 보완한다.
- `npm test`: `packages/core/*.test.mjs`, `plugin/bin/*.test.mjs`, `plugin/runtime/*.test.mjs`를 실행하며 CI에 연결되어
  있다. 하위 디렉터리로 이동하면 이 패턴에서 빠질 수 있다.
- `npm run test:scripts`: `scripts/**/*.test.mjs`와 `scripts/**/*.test.ts`를 재귀 검색하고
  CI의 `npm run check`에서 실행한다. 외부 DB·모델 호출 없는 도구 테스트를 포함한다.
  Windows native 시험은 기존처럼 플랫폼과 전용 runtime이 필요하며 미준비 시 skip한다.
- `npm run test:architecture`: 같은 트리의 `.test.mjs`만 실행하는 기존 부분 집합 명령이다.
  `npm run test:project-availability`는 `scripts/project-ownership/project-availability*.test.ts`를 실행한다.
  두 부분 집합의 테스트는 `test:scripts`에도 포함되며 `check`에서 중복 실행하지 않는다.
  이 명령들 자체가 테스트 배치 규칙 전체를 검증하는 것은 아니다.
- `npm run test:server`: 서버 전용 bootstrap과 함께 `tests/server/*.test.ts`를 실행하며
  `check` workflow의 `server` 항목으로 연결되어 있다. build 뒤 manifest 검사
  (`RDC_CHECK_ACTION_MANIFEST`·`SRC_CHECK_INBOX_MANIFEST`)는 환경 변수를 지정할 때만
  실행되며 CI는 지정하지 않는다.
- `npm run test:server:integration`: 격리 PostgreSQL과 전용 실행 스크립트를 사용한다.
  `check` workflow의 `server-integration` job이 일회용 PostgreSQL 18 서비스 컨테이너의
  `stagekeeper_test_ci` DB로 실행한다. 운영 DB나 secret을 사용하지 않는다.
  DB 안전 검사와 실행 절차는 아래 저장소 스크립트 설명을 따른다.
- `npm run test:templates`: 별도 private 저장소인 `plugin/templates`의 실제 본문을 검사한다.
  서버 구조 또는 템플릿을 변경하면 Prisma 생성 후 실행하고, 통과 전에는 seed하지 않는다.
  private 원본을 제공하지 않는 공개 CI의 통과가 이 검증을 대신하지 않는다.
- 신규 E2E suite의 위치는 `tests/e2e/`다. 현재 전용 runner·CI job은 없으며, 위치 규칙을
  문서화한 사실만으로 E2E 자동화가 완료된 것으로 보고하지 않는다.

테스트 추가·이동 PR에는 실제 실행 명령과 결과를 남긴다. 설정 변경으로 파일이
탐색 대상에서 빠지거나 테스트 타입 검사가 사라지지 않았는지 확인한다. 전체
아키텍처 규칙의 예외가 필요하면 아래 예외 정책을 따른다.

## 작업 브랜치 정리

실행 시점과 최우선 보호 정책은 루트 [AGENTS.md](../../AGENTS.md)의
`Branching and pull requests`를 따른다. **로컬·원격 `main`과 `dev`는 절대 삭제하지
않는다.** 로컬 정리는 `scripts/cleanup-task-branches.mjs`만 사용하며, 원격 작업
브랜치는 기존 GitHub의 PR 병합 후 자동 삭제 정책으로 관리한다.

```powershell
npm run branches:cleanup
npm run branches:cleanup -- --apply
npm run branches:cleanup -- --apply --branch harness/example
```

기본은 삭제 없는 사전 확인이고 `--apply`로만 로컬 ref를 삭제한다. 확인 과정에서
GitHub API를 조회하고 `origin/dev`의 추적 ref를 fetch한다. 원격 ref를 삭제하거나
prune하지 않으며, checkout·stash·파일 정리·PR 병합은 수행하지 않는다. 작업 시작과
종료 때 에이전트가 실행하며 별도 예약 작업이나 CI의 삭제 job은 없다.

삭제하려면 다음 증거를 모두 확인해야 한다.

1. 대상은 실제 로컬 `harness/<topic>` ref이고 symbolic ref가 아니다.
   `main`·`dev` 또는 ref 별칭을 명시하면 저장소 조회 전에 거부한다.
2. 실행 worktree에 staged·unstaged·untracked 변경이 없고, 대상이 현재 또는 다른
   worktree에서 checkout되어 있지 않다. 다른 worktree에 속한 작업은 그대로 보존한다.
3. 원격 `main`·`dev`가 모두 존재하고, 같은 저장소의 `dev` 대상 PR이 실제 병합되어
   있다. 로컬 끝 커밋은 병합된 PR의 head SHA와 같고, 병합 결과는 fetch한 `origin/dev`
   이력에 포함되어야 한다. PR 생성·단순 종료·원격 브랜치 부재만으로 완료를 판단하지 않는다.
4. 해당 head SHA·PR에 연결된 최신 `check` workflow가 성공했고, 함께 실행된 다른
   workflow의 최신 실행도 모두 완료·성공 상태다. 페이지를 모두 조회하며, 재실행의
   최신 attempt를 확인한다. 누락·실패·대기·불명확한 응답은 삭제 보류다.
   원격 브랜치 삭제 후 Actions 응답의 `pull_requests`가 비어 있으면 실행 저장소,
   head 저장소, head 브랜치와 SHA를 모두 대조한다. 다른 PR 연결이 명시되면 사용하지 않는다.
5. 해당 브랜치를 사용하는 열린 PR 또는 그 브랜치를 base로 하는 열린 PR이 없다.
   원격 작업 브랜치가 남아 있다면 head SHA도 같아야 한다.
6. 삭제 직전에 로컬 변경·worktree·ref SHA를 재검사한다. 원격 `dev`가 검사 도중
   바뀌거나 로컬 ref에 추가 커밋이 생겼으면 보류한다.

검증한 SHA를 expected old value로 지정하고 `git update-ref --no-deref`로 해당
`refs/heads/harness/...` 하나만 삭제한다. SHA가 바뀌면 원자적으로 거부되며 symbolic
ref를 따라 보호 브랜치를 삭제하지 않는다. squash·rebase 병합은 원래 head의 ancestry가
아닌 PR의 병합 결과로 확인한다. 브랜치 설정 정리 실패는 결과의 `note`로 보고한다.

결과 JSON의 `eligible`은 사전 확인 통과, `deleted`는 로컬 삭제 완료,
`skipped`와 `reason`은 보존 이유다. GitHub 인증·네트워크·증거 확인에 실패하면
브랜치를 보존한다. 사용자 변경을 치우거나 강제 삭제로 우회하지 않는다.

원격 보호는 활성 Ruleset
[Keep dev and main](https://github.com/Sangeok/stagekeeper/rules/24972879)이 담당한다.
대상은 `refs/heads/main`·`refs/heads/dev`, 규칙은 `deletion`, bypass actor는 없다.
2026-10-21 API 조회로 확인했으며, 실제 삭제를 시도하는 방식으로 검증하지 않는다.

회귀 검증은 `scripts/cleanup-task-branches.test.mjs`가 임시 Git 저장소·bare origin과
대체 GitHub 응답을 사용해 수행한다. 보호 ref·symbolic ref·추가 변경·worktree·미병합
PR·CI 재실행·조회 실패·squash 병합·동시 커밋 보존을 확인하며,
기존 `npm run test:architecture`와 `npm run check`에 포함된다.

## 저장소 스크립트

`scripts/`는 앱 런타임 코드가 아니다. 저장소 도구·운영 도구·수동 리허설과 그 테스트를 둔다.
배치는 실행 종류보다 함께 변경되는 책임을 기준으로 한다([ADR-0004](../ADR/0004-organize-repository-scripts.md)).

| 위치 | 소유 책임 |
| --- | --- |
| 최상위 | build, 브랜치 정리, plugin-lib 동기화, 서버 통합 시험 실행기, 플랜 부여와 짝 테스트 |
| `checks/` | FSD·서버 경계 검사기, 문구·공개 계약 검사와 테스트 |
| `windows/` | native Node 빌드·캐시·패키징·호환 처리·Windows 리허설과 테스트 |
| `templates/` | 템플릿 seed·restore·쿼리 보조 모듈과 테스트 |
| `project-ownership/` | 소유권 검사·복구·보조 모듈·복구 SQL·D3 리허설과 테스트 |
| `rehearsals/` | 위 책임에 속하지 않는 제품 기능 인수 리허설과 도구 자체의 테스트 |
| `lib/` | 여러 책임이 실제 공유하는 Prisma 연결 등 |

테스트는 도구 옆에 두며, 한 책임의 보조 모듈이나 복구 SQL을 공용 `lib/`로 분산하지 않는다.
Windows·D3 리허설은 해당 책임과 함께 둔다. 독립 명령 하나를 위해 별도 폴더를 만들지 않는다.
리허설의 작업 차수 이름 변경·통합·삭제는 검증 사례와 대체 여부를 대조한 별도 변경으로 다룬다.

새 위치로 이동할 때 npm 명령·CI 경로 필터·상대 import·저장소 루트 계산·fixture 경로를 함께 갱신한다.
서버 검사기는 `scripts/rehearsals/`, `scripts/project-ownership/`, `scripts/windows/` 바로 아래의
`rehearse-*.ts`·`rehearse-*.mjs`만 리허설로 판정한다. 내부 접근은 계속
[서버 내부 참조 목록](./server.md#내부-참조-시험-목록)의 정확한 파일·모듈 등록을 요구한다.
같은 디렉터리의 운영 도구나 helper에 테스트 권한을 부여하지 않는다.

완료 제안서·검증 보고서에 남은 이전 경로는 당시 실행 기록으로 보존한다.
현재 실행 명령은 아래 목록과 `package.json`을 따른다.

| 스크립트 | 진입점 | 언제 | 하는 일 |
| --- | --- | --- | --- |
| `cleanup-task-branches.mjs` | `npm run branches:cleanup -- [--apply] [--branch harness/<topic>]` | 작업 시작·종료 | 병합·CI·로컬 보존 조건을 확인한 작업 브랜치의 로컬 ref만 정리. `main`·`dev`와 원격 ref는 삭제하지 않음 |
| `windows/build-windows-role-node.ps1` | Windows 운영자 build/`windows-role-runtime` CI | native 명령 backend 검증 시 캐시가 없을 때 | SHA-256으로 고정한 공식 Node 22.23.3 source에 libuv #5181의 AppContainer pipe 수정을 backport하고 x64 runtime·원본 npm·license·출처/hash·빌드 스크립트 지문을 artifact로 만든다. 사용자의 compiler/Node 설치나 패키지 공개는 수행하지 않는다. 실제 LPAC 인수와 배포물 전달 완료를 대신하지 않는다 |
| `windows/windows-role-runtime-cache.mjs`, `windows/windows-role-runtime-cache.test.mjs` | `node scripts/windows/windows-role-runtime-cache.mjs key` / `verify --runtime <절대 경로>`; `test:architecture` | Windows CI 런타임 준비 시 | 빌드 스크립트·캐시 검증 계약의 SHA-256으로 정확한 캐시 키를 만들고, runner Node로 고정 출처·빌드 옵션·스크립트 지문·실행 파일 및 전체 패키지 해시를 실행 전에 검사한다. alias/hardlink·파일 종류·크기·개수·깊이를 제한하며 검증 실패는 재사용이나 실행으로 넘어가지 않는다 |
| `windows/package-windows-plugin.mjs` | `node scripts/windows/package-windows-plugin.mjs --output <새 저장소 밖 절대 경로> --runtime <검증된 runtime artifact>` | Windows private 배포물 검토 시 | 추적된 plugin source·runtime·변경하지 않은 완전한 owner verifier를 양쪽 skill 경로에 복사하고 inventory/hash를 남긴다. auth/private templates 복사·업로드·공개는 없다. source-only checkout과 install bundle을 구분한다 |
| `windows/rehearse-windows-project-build.mjs` | `node scripts/windows/rehearse-windows-project-build.mjs --root <npm ci로 준비한 공개 checkout> --runtime <검증된 Windows runtime>` | `windows-role-runtime` CI/전체 프로젝트 빌드 회귀 시 | Prisma 엔진을 포함한 정상 의존성 설치 후, DB URL·환경 파일·network 없는 실제 LPAC snapshot에서 전체 `npm run build`와 원본 source/build ID 불변·산출물 폐기·종료 acknowledgement를 확인한다. 모델·DB·로그인·배포를 실행하지 않는다 |
| `build.mjs`, `windows/windows-role-readlink.cjs` | `npm run build` | 프로젝트 production build | 기본 Next 빌드를 유지하고 Windows 역할 복사본에서만 Webpack·readlink 오류 호환 preload와 TypeScript compiler API 검사를 선택한다. 타입 검사를 생략하지 않으며 API가 없는 TypeScript로의 업그레이드는 실제 native CI에서 검증해야 한다. 일반 파일임을 실제 lstat로 확인할 때만 EPERM/EACCES를 EINVAL로 바꾸며 링크·metadata 거부는 유지한다. owner 프로세스·커널·ACL·network 권한은 변경하지 않는다 |
| `windows/windows-role-readlink.test.mjs` | `STAGEKEEPER_TEST_WINDOWS_RUNTIME` 지정 후 `node --test scripts/windows/windows-role-readlink.test.mjs` | native Windows CI/호환 preload 변경 시 | 실제 LPAC의 sync/callback/promises/ESM readlink·callback validation·외부 metadata/data 거부를 확인한다. 다른 플랫폼/미준비된 runtime의 skip은 전체 Windows 인수 PASS를 대신하지 않는다 |
| `windows/windows-role-spawn-diagnostics.cjs`, `windows/windows-role-spawn-diagnostics.test.mjs` | 기존 단일 preload의 opt-in / `STAGEKEEPER_TEST_WINDOWS_RUNTIME` 지정 후 `node --test scripts/windows/windows-role-spawn-diagnostics.test.mjs` | native Windows CI/child startup 진단 | 역할 빌드의 오류 code·실행 파일 분류·stdio 등 고정 필드만 기록하고 경로·인자·환경·권한·오류를 변경하지 않는다. 실제 silent IPC fork와 외부 실행 파일 거부 및 비공개 인자 미노출을 확인한다. 런타임 컴파일 캐시는 시험 전 저장하고 후속 실패에도 artifact를 보존한다 |
| `checks/verify-fsd-boundaries.mjs` | `npm run verify:fsd`, `npm run lint`, `npm run check` | CI마다 | 위 FSD 경계 검사 |
| `checks/verify-server-boundaries.mjs` | `npm run verify:server`, `npm run lint`, `npm run check` | CI마다 | 서버 공개 API·모듈 방향·runtime 초기화·정확한 내부 시험 목록 검사. 미추적 source도 포함 |
| `checks/verify-docs.mjs`, `checks/verify-docs.test.mjs` | `npm run docs:check`, `npm run check`; `test:scripts` | CI마다 | `docs/test-reports`의 front matter 규칙([보고서 README](../test-reports/README.md)의 Validation 절)과 추적 중인 모든 Markdown 본문의 상대 링크가 추적 파일·디렉터리를 가리키는지 검사한다. 대소문자를 구분하며 외부 URL·anchor는 검사하지 않는다 |
| `checks/verify-plugin-version.mjs`, `checks/verify-plugin-version.test.mjs` | `npm run verify:plugin-version [-- --base <ref> --head <ref>]`; `test:scripts` | `main` 승격 직전 | `origin`의 `main`·`dev`를 fetch한 뒤 기본값 `origin/main`→`origin/dev` 사이에서 출하 대상 `plugin/` 파일(Windows 패키지와 같은 기준: `plugin/templates/`·`*.test.mjs` 제외)이 바뀌었으면 두 plugin manifest의 판이 같고 둘 다 base보다 높은지 검사한다. dev CI에는 넣지 않는다. 판은 배포 때 올리므로 dev는 이 검사에서 실패하는 상태일 수 있다 |
| `tests/server/register-server-only.mjs` | `npm run test:server` | CI마다, 서버 변경 시 로컬 | server-only marker만 대체하며 일반 React를 유지하는 교차 모듈 테스트 |
| `test-server-integration.mjs` | `npm run test:server:integration` | CI마다(일회용 PostgreSQL 18), 격리 PostgreSQL에서 수동 | `TEST_DATABASE_URL`의 DB명이 `stagekeeper_test_*`이고 운영 URL과 host/port/database가 다른지 검사한 뒤 migrate deploy·직렬 통합 테스트. migrate 출력은 숨기고 시험 출력은 그대로 보인다. DB 생성·삭제·reset 없음 |
| `test-server-integration.test.mjs` | `npm run test:architecture` | CI마다 | URL 안전 검사와 migration→test 실행 순서·실패 중단 검사 |
| `rehearsals/rehearse-request-rate-baseline.ts` | `node --import tsx scripts/rehearsals/rehearse-request-rate-baseline.ts` | 수치 결정·템플릿 흐름 변경 시 로컬 | 현재 MCP callback/schema와 private 템플릿 단계에 근거한 정상 흐름·재시도 burst를 집계한다. 도메인 IO는 fixture이며 운영 트래픽 측정이 아니다. credential 없이 subject·시간·시퀀스만 관측 |
| `rehearsals/rehearse-dual-client-runtime.ts` | `node --import tsx scripts/rehearsals/rehearse-dual-client-runtime.ts --phase capability --root <빈 절대 경로> --report docs/test-reports/active/dual-client-runtime-report.md` | Codex C0 선행 검증 시 수동 | 저장소 밖 disposable root·격리 CLI 설정·loopback MCP로 실제 package 로딩과 legacy lock을 확인한다. 모델을 자동 호출하지 않으며 native/strict-profile 시험 인수·prompt를 생성한다. required 미실행은 blocked/exit 2이고 제품 지원 PASS가 아니다. `--validate-report-only --report <동일 보고서>`는 무쓰기 구조 검증만 한다 |
| `rehearsals/rehearse-dual-client-runtime.test.ts` | `node --import tsx --test scripts/rehearsals/rehearse-dual-client-runtime.test.ts` | CI 및 위 검사기 변경 시 | report lifecycle·판정·증거/경로·민감정보 검사·atomic writer/경합·side effect 전 거부 및 독립 실행 환경을 검증한다. `test:scripts`를 통해 `check`에 포함된다 |
| `rehearsals/rehearse-dual-client-runtime.ts --phase acceptance` | 동일 report와 별도 준비된 dual checkout의 `--root` | 보호된 TEST_DATABASE_URL에서 수동 | 실제 test DB migration과 `tests/server/integration/client-runtime.test.ts` 6개만 실행한다. 두 client 순서·legacy/slots 승인·원장/usage·preflight·seed rollback/제한 복구를 검사하며 실제 모델/browser/package gate는 NOT RUN으로 보존한다. 모델 자동 호출·운영 seed 없음 |
| `rehearsals/rehearse-automatic-scout.ts` | `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-automatic-scout.ts` | 격리 TEST_DATABASE_URL·fresh production build에서 수동 | 실제 Next HTTP로 Free 자동 발굴 switch 저장·재조회·잘못된 입력·타인·무세션·사용 불가 프로젝트 거부를 검증한다. 루프백 fixture만 만들고 종료 시 자기 fixture를 정리한다 |
| `rehearsals/rehearse-multiple-pipelines.ts` | `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-multiple-pipelines.ts` | 격리 TEST_DATABASE_URL·fresh production build에서 수동 | 실제 Next action 8종, 소유자·타인·Free·미선택·연결 해제, 다섯 화면과 GET 무쓰기, 항목 선택·변경·감사·stale를 검사한다. 루프백 서버와 자기 fixture만 만들고 종료 시 정리한다. 별도 `multiple-pipelines-browser.tsx` fixture는 실제 컴포넌트의 pending·dirty·응답 유실 회복을 검증한다 |
| `rehearsals/rehearse-repository-disconnection.ts` | 아래 실제 Next 리허설 명령 | 격리 PostgreSQL·현재 production build에서 수동 | 별도 기능 설정 없이 동일 유효 action/body로 소유자·타인·무세션·bearer·위조 userId·stale와 상세 GET 7개/History 무쓰기를 검증. `--transport-loss`는 실제 커밋 뒤 응답 유실·추가 이력 pagination을 검증. `--interactive`는 루프백 fixture 로그인·응답 유실 proxy와 화면 검증을 제공하고 Enter 또는 `/finish` 뒤 자기 fixture만 정리 |
| `rehearsals/rehearse-src-clean-code.ts` | 아래 클린코드 인수 명령 | 격리 PostgreSQL·fresh production build에서 수동 | 실제 Next Inbox·등록 폼과 실제 컴포넌트/통제 가능한 clipboard fixture를 제공한다. loopback proxy에서 요청 전 실패·커밋 뒤 응답 유실·대기를 통제한다. `--render-faults`는 generated build의 content/wrapper/loader 함수만 일시 계측하고 종료 시 원본 바이트로 복원한다. `/finish` 뒤 자기 사용자·DB fixture·Next 서버·marker를 정리한다 |
| `checks/verify-fsd-boundaries.test.mjs`, `checks/verify-server-boundaries.test.mjs`, `plugin-lib.test.mjs` | `npm run test:architecture` | CI마다 | 검사기 자체의 테스트 |
| `checks/retired-copy.test.mjs` | `npm run test:architecture` / `test:scripts` → check | CI마다 | 폐기된 표현 가드 — 웹의 보이는 문구·`SKILL.md`·product-copy.md 잠금 블록에 옛 연결 방식의 문장이 없는지. 규칙은 파일 머리의 `RETIRED`에 손으로 더한다 |
| `plugin-lib.mjs --check` | `npm run check` 첫 단계 | CI마다 | `plugin/lib` 드리프트·고아 판정, 실패 시 exit 1 |
| `plugin-lib.mjs` | `npm run sync:plugin-lib` | `packages/core/*.mjs`를 바꾼 뒤 | 복사본을 원본과 같게(덮어쓰기·삭제) |
| `templates/seed-templates.ts` | `npm run seed:templates [-- --dir <dir> --snapshot <private 경로>]` | private 템플릿 배포 승인 후 수동 | 전체 agent graph·Codex bundle을 쓰기 전에 검증하고 Serializable transaction으로 seed한다. Codex source가 있으면 public 밖의 신규 private snapshot을 먼저 저장한다. 실제 DB 실행은 배포 검증 |
| `templates/restore-dual-client-templates.ts` | `node --import tsx scripts/templates/restore-dual-client-templates.ts --snapshot <private 경로>` | 승인된 template 복구 | snapshot version/hash·현재 body 전체를 먼저 대조하고 whitelist 행만 한 transaction으로 복구한다. 이전에 없던 CODEX.runbook 행만 삭제하며 외부 행을 보존한다 |
| `templates/template-seed-query.ts`, `templates/template-seed-query.test.ts` | `node --import tsx --test scripts/templates/template-seed-query.test.ts` | CI 및 seed/restore 변경 시 | 전량 검증 후 첫 쓰기·snapshot 범위·현재 판 drift 거부를 IO fixture로 검증. `test:scripts`에 포함되며 실제 DB rollback 증거는 아니다 |
| `grant-plan.ts` | `npm run plan:grant -- <login> <free\|pro\|max> [note]` | 플랜을 붙일 때, 로컬에서 | availability service를 통한 plan/set/version/event atomic change |
| `lib/prisma.ts` | (헬퍼) | — | DB 스크립트의 Prisma 부트스트랩. `DATABASE_URL`이 없으면 exit 2 |
| `project-ownership/check-project-ownership-cleanup.ts` | `npm run check:project-ownership:cleanup -- --pre\|--post` | D3 cleanup 전후 | catalog·직접 owner·exact set·event를 read-only snapshot으로 검사 |
| `project-ownership/project-availability-cleanup.test.ts` | `npm run test:project-availability` | CI마다 | cleanup facts, SQL, CLI/receipt와 보존 계약의 DB 없는 회귀 검사 |
| `project-ownership/project-availability-runtime.test.ts` | `npm run test:project-availability` / `test:scripts` → check | CI마다 | Member/legacy owner/old policy 부재, final schema/generated client와 폐기 script 검사 |
| `project-ownership/rehearse-project-availability-d3.ts` | `npm run test:project-availability:d3:db -- --allow-fixtures --baseline <commit>` | 서로 다른 빈 격리 PostgreSQL 두 개에서 수동 | 고정 D2 artifact → cleanup → D3 등록 → 보상 migration → D2 smoke. 두 전용 URL 필수 |
| `project-ownership/restore-project-ownership-shadow.ts` | `npm run restore:project-ownership:shadow -- [--check\|--apply --backup-receipt <path>]` | 승인된 D3 복구 | 전용 URL·receipt·migration checksum을 검사하고 고정 보상 migration bundle을 적용 |
| `project-ownership/recovery/individual-project-availability-d3/restore-d2-shadow.sql` | 위 복구 CLI | D3 commit 뒤 D2 호환 복구 | 현재 direct owner에서 legacy shadow를 transaction으로 재구성. 일반 migration path에는 없음 |

`plugin/lib/`는 직접 고치지 않는다 — ESLint도 그 폴더를 무시한다(`eslint.config.mjs`). 원본을 고치고 동기화한다.

## Windows CI 런타임 재사용

`windows-role-runtime`은 `dev` push와, Windows runtime·역할 인수 시험·오프라인 빌드
입력(`package.json`·lock·`next.config.*`·Prisma 설정·`scripts/build.mjs`·
`src/app/layout.tsx`·`src/app/_fonts/**`)을 바꾼 PR에서 실행한다. 그 밖의 애플리케이션
source만 바꾼 PR에서는 실행하지 않는다. 그런 변경의 LPAC 전용 회귀는 병합 후 경로를
제한하지 않는 `dev` push의 전체 인수에서 드러나고, `main`은 `dev`에서 통과한 커밋만
받는다. `dev` 실행이
생성한 캐시는 새 PR이 공유할 수 있고, PR 실행이 생성한 캐시는 해당 PR의 재실행만
재사용한다. `dev` push는 경로를 제한하지 않아 유휴 기간의 캐시 만료 후에도 다시
공유 캐시를 준비한다. PR 새 커밋은 같은 workflow·PR의 이전 실행을 취소하지만,
진행 중인 `dev` 런타임 생성은 취소하지 않는다. 프로젝트 의존성 설치에는 npm 캐시를 쓰지
않는다. 2026-10-07 측정에서 194MB 캐시 복원(약 6초)이 `npm ci` 단축(약 5초)을 상쇄했다.

캐시에는 `stagekeeper-node-source/runtime`만 저장한다. Node 소스·컴파일 중간 산출물은
저장하지 않는다. 키에는 Windows 2022/x64와 빌드 스크립트·검증 계약 지문을 포함하고,
스크립트의 LF/CRLF 차이는 정규화한다. 다른 버전의 prefix fallback은 사용하지 않는다.
정확한 캐시가 없으면 기존 pinned source 빌드를 수행한다. 부분 키가 복원되면 중단한다.
복원된 캐시는 runner Node로 출처·옵션·빌드 지문·실행 파일 및 패키지 전체를 검증한
후에만 실행한다. 새 빌드는 기존 builder의 해시 계산·smoke 이후 같은 검증을 거쳐
캐시 저장과 실제 역할 인수로 넘어간다. 검증 실패는 중단하며 잘못된 캐시를 조용히
덮어쓰거나 이전 버전으로 대체하지 않는다.
캐시 해시는 파일 일관성 검사이며 서명 인증을 대신하지 않는다. 기존 PR/base branch
범위 격리를 유지하고 `pull_request_target`에서 PR 코드를 실행해 공유 캐시를 만들지 않는다.

검증과 child-process smoke를 통과한 런타임은 후속 프로젝트 테스트 전에 캐시한다.
실제 Windows 역할 명령·파일 격리·readlink·IPC 회귀와 네트워크가 차단된 전체 프로젝트
빌드는 캐시 여부와 관계없이 매번 실행한다. 후속 실패에서도 검증을 통과한 런타임과
provenance artifact를 보존한다. 캐시 준비 성공은 전체 인수 성공을 뜻하지 않는다.
새 캐시 규약의 최초 실행 및 캐시 삭제·만료 시에는 전체 컴파일 시간이 다시 필요하다.
`dev` 공유 재사용은 이 workflow 변경이 `dev`에 병합되고 해당 push가 캐시를 만든 뒤부터
가능하며, 이미 실행 중인 구버전 PR job에는 소급 적용되지 않는다.

## 프로젝트 빌드 의존성

개발자/CI가 먼저 정상 `npm ci`로 프로젝트 의존성을 준비한다. Prisma CLI의
schema engine은 `@prisma/engines`의 postinstall이 내려받으므로 `--ignore-scripts`로
준비한 fixture는 전체 offline build의 선행 조건을 충족하지 않는다. 이 설치는
역할 명령의 network 권한을 늘리는 근거가 아니다. 프로젝트별 의존성 준비와
Stagekeeper 사용자의 최소 플러그인 설치 인수는 별도 범위다.

`prisma.config.ts`는 client generate에 DB URL을 요구하지 않는다. DB 명령은 실제
유효한 `DATABASE_URL`이 필요하며 빈 URL을 사용한 접속은 Prisma가 거부한다.
Next 폰트는 `src/app/_fonts/`의 원본·라이선스·출처/hash를 포함하는 로컬 파일로
빌드한다. 의존성이 준비된 Windows checkout의 전체 빌드는 역할의 network deny,
환경 파일 제외와 원본 무쓰기 경계를 유지한 상태로 검증한다.

이 저장소는 Windows 역할의 `npm run build`에서만 Webpack을 선택한다. Next 설정은
SWC의 TS 설정 변환을 거치지 않는 `next.config.mjs`다. 원본 tsconfig와 Webpack의
경로 별칭 해석은 유지하며, SWC loader의 중복 별칭 변환만 제외한다. native Rust의
DOS 경로 canonicalize 제한을 피하기 위한 현재 Next 16.3.3 호환 경로다. loader 구조는
semver 보장 API가 아니므로 지원한 구조가 없으면 실패하며 CI의 실제 전체 빌드가
업그레이드 회귀를 확인한다. 타입 검사를 생략하지 않는다.

역할 복사본은 산출물을 폐기하므로 Webpack 캐시를 끄고 Next worker를 2개로 제한한다.
빌드 프로세스와 그 Node worker에만 readlink 호환 preload를 전달한다. 일반 파일과
디렉터리의 EINVAL 오류 의미를 복구하며 성공한 링크 target이나 불완전한 metadata를
만들어 내지 않는다. 역할 command의 120초·snapshot의 300초 제한은 유지한다.

## 저장소 연결 해제 검증

`npm run test:server:integration`은 전체 이전 SQL 체인을 격리 schema에서 재생하고 18개 테이블의
채운 데이터를 보존하는 additive migration, catalog capability의 일부 적용 거부, 실제 REST/MCP,
User 잠금 경쟁과 rollback을 검사한다. 경쟁 시험은 첫 writer의 실제 User 잠금을 유지한 채 두 번째가
잠금 SQL을 시도한 것을 확인하고 풀어 준다. raw lock의 P2010/40001·40P01과 delegate P2034는 같은
최대 3회 transaction 재시도 경계를 사용한다.

```powershell
# TEST_DATABASE_URL은 stagekeeper_test_*이며 .env의 DATABASE_URL과 별도인 격리 DB.
npm run test:server:integration
npm run build
$env:RDC_CHECK_ACTION_MANIFEST = 'true'
npm run test:server
Remove-Item Env:RDC_CHECK_ACTION_MANIFEST
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-repository-disconnection.ts --transport-loss
# 화면 확인은 --interactive. Enter 또는 http://127.0.0.1:55439/finish로 서버/fixture를 정리한다.
```

AST와 새 build manifest는 loader가 원격 action이 아니며 두 mutation만 등록됨을 확인한다.
실제 POST는 같은 action ID·본문·Origin/Host의 소유자 성공 대조군으로 유효한 transport를 먼저 증명한다.
리허설은 부모 DB 분리 검사를 통과한 뒤 child의 DATABASE_URL/TEST_DATABASE_URL만 테스트 DB로 맞춘다.
연결 해제·재연결은 별도 기능 설정 없이 제공한다. 운영 DB·배포의 실제 상태는 로컬 통과로 증명되지 않는다.
현재 배포 절차는 [repository-disconnection.md](./repository-disconnection.md)를 따른다.
[최초 검증 보고서](../test-reports/completed/2026-10-23-repository-disconnection.md)의 스위치 검증은 당시 정책의 기록이다.
스위치 제거 이후의 자동·실제 Next·브라우저 검증은 [상시 제공 검증 보고서](../test-reports/completed/2026-10-01-repository-connection-always-enabled.md)에 기록한다.

## src 클린코드 3차 인수

```powershell
# 별도 stagekeeper_test_* DB를 먼저 준비한다. 운영 URL과 다른 DB여야 한다.
npm run test:server:integration
npm run build
$env:SRC_CHECK_INBOX_MANIFEST = 'true'
$env:RDC_CHECK_ACTION_MANIFEST = 'true'
npm run test:server
Remove-Item Env:SRC_CHECK_INBOX_MANIFEST
Remove-Item Env:RDC_CHECK_ACTION_MANIFEST
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --render-faults
```

리허설 중 `http://127.0.0.1:55452/owner`는 fixture 세션으로 실제 Inbox를 연다.
`/fixture?mode=form&picker`, `/fixture?mode=copy`는 실제 컴포넌트의 입력·비동기 상태 시험이다.
이 화면의 action/clipboard는 시험 double이며 실제 DB 등록은 `/p/new`에서 별도 확인한다.
브라우저에서 `/arm/before`, `/arm/after`, `/arm/pause`, `/arm/normal`, `/release`로 transport를 제어한다.
렌더 오류는 `/server-fail/true`, `/wrapper-fail/true`, `/loader-fail/true`로 켜고 각각 `false`로 해제한다.
시험 후 `/finish`를 호출한 뒤 fresh build와 manifest 검사를 다시 실행한다.
생성 산출물의 일시 계측이나 브라우저 응답 계측을 애플리케이션 소스·배포에 포함하지 않는다.
범위·방법·실행 판정은 [3차 인수 보고서](../test-reports/completed/2026-10-01-src-clean-code-third-pass-regression.md)에 기록한다.

### FSD 클린코드 후속 인수

`rehearsals/rehearse-src-clean-code.ts`는 기존 Inbox A~D 외에 done 항목 R-1을 준비한다.
`/owner-item`에서 실제 상세 페이지를 열고 `/arm/reopen-before-once` 또는
`/arm/reopen-after-once`로 **다음 humanTransition 한 건만** 저장 전/후에 응답을 잘라 낸다.
소켓 종료에 따른 POST 재전송과 혼동하지 않도록 정상 HTTP 응답의 RSC frame을 잘라 낸다.
`/state`에서 R-1의 status·updatedAt·전이 수를 대조한다. Reopen의 Try again은 mutation을
다시 보내지 않고 최신 상태를 읽어야 하며, Evidence·Documents·History는 계속 보여야 한다.

DB 없는 실제 컴포넌트 시험은 `--ui-only`로 실행한다. `/fixture?mode=token-issuance`는
세 발급 폼의 성공·거부·응답 미확인과 Previous token/만료값 보존을 제어하고,
`/fixture?mode=documents`는 같은 URL의 별개 보고를 추가·삭제·재정렬한다.
`?mode=copy&autorun` 또는 Run acceptance가 전체 동작 시험 결과를 `/results`에 기록한다.
Documents의 duplicate-key 경고는 `--ui-only --fixture-development`로 별도 확인한다.
이 옵션은 fixture 브라우저 번들만 development로 바꾸며 production build 설정은 바꾸지 않는다.
실제 키보드 ArrowLeft/Right가 각 Coding client 그룹 안에서 순환하는지, Tab/Shift+Tab이
그룹을 벗어나 다음/이전 컨트롤로 이동하는지도 확인한다. 합성 KeyboardEvent만으로 판정하지 않는다.

```bash
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only
# /finish로 앞 실행을 종료한 뒤:
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only --fixture-development
```

브라우저 Finish는 root·보류 작업·clipboard·console 대체를 정리하고, `/finish`는
listener·자식 Next·DB fixture를 정리한다. 실제 DB 리허설은 기존처럼 fresh build와
별도의 `TEST_DATABASE_URL` 검사를 통과해야 한다. schema 이동 뒤에는 아래 fresh registry 검사도 실행한다.

```bash
npm run build
SRC_CHECK_INBOX_MANIFEST=true RDC_CHECK_ACTION_MANIFEST=true npm run test:server
```

`rehearsals/rehearse-account-usage-and-tokens.ts --interactive`의 `http://127.0.0.1:55477/state`는
fixture 소유자의 종류별 토큰 수와 Reference·revoked 여부만 반환한다(평문·hash·세션 제외).
`/lose-next-action`으로 응답을 잃은 발급은 +1, Refresh list는 +0, 수동 Revoke는 지정 Reference만
종료시키는지 확인한다. 동일 이름의 기존 토큰도 보존해야 한다. `/finish`로 종료한다.

### FSD 파이프라인 초안 후속 인수

`rehearsals/rehearse-src-clean-code.ts --ui-only`의 `?mode=pipeline-page`는 실제 ProjectPipelinePage를 렌더한다.
Run acceptance / `?mode=copy&autorun`은 version·plan·roster·readonly·프로젝트 identity 갱신,
version 0 기본값, pending 응답 순서·stale/unknown·이전 프로젝트의 늦은 응답을 검증한다.
같은 검사를 `--ui-only --fixture-development`에서도 실행한다. 기존 rail/scout 단독 모드는 유지한다.
rail의 노드와 숨겨진 Read as text의 노드를 구분하며 제출 graph·expectedVersion·호출 수를 함께 본다.

실제 Next 인수는 fresh build/manifest와 검증된 TEST_DATABASE_URL의 기존 DB fixture에서 수행한다.
서버 모듈을 읽는 실제 DB 모드는 테스트 bootstrap을 포함해 실행한다:

```bash
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-src-clean-code.ts
```

`--ui-only` 모드는 서버 서비스를 import하지 않으므로 기존 명령을 사용한다.
`/owner-pipeline`으로 동일 프로젝트의 두 탭을 열고 A 초안 → B 저장 → A Scout 변경 뒤
A의 초안과 stale 복구가 유지되는지 확인한다. `/pipeline-state`는 version/graph·Scout 설정·두 Action의 호출 수만 반환한다.
`/arm/pipeline-before-once`·`/arm/pipeline-after-once`는 다음 savePipeline POST 한 건의 RSC 응답만
저장 전/후에 잘라 낸다. 각각 DB version +0/+1, 명시적 Discard changes and reload는 +0이어야 한다.
최종 version·rail·Read as text 본문과 DB graph를 대조한다. Scout나 다른 Action에 fault를 적용하지 않는다.
이 시험은 원본 소스나 빌드 chunk를 계측하지 않는다.

시험 후 Finish(`/finish`)로 보류 응답·root·listener·Next 자식·fixture DB와 connection을 정리한다.
manifest 시험은 `tests/server/pipeline-save.test.ts`가 소유하며 두 pipeline Action 등록과 내부 draft 모델 비등록을 검사한다.
`RDC_CHECK_ACTION_MANIFEST=true npm run test:server`는 반드시 해당 fresh build 뒤에 실행한다.

## 프런트엔드 클린 코드 Core 검증

`src/server/pipeline/current-execution-query.test.ts`는 주입형 `loadExecutionFacts`의 프로젝트·열린 실행 격리,
legacy/slot·keyed/null-key·entry 조건과 handoff의 최신 eligible step·시간·선택 순서를 확인한다.
Board의 `activityDispatched`와 배너의 `turnDispatched`는 서로 다른 기존 표시 계약을 보존한다.
실제 adapter 연결은 `tests/server/project-page-loaders.test.ts`와
`src/fsd/widgets/turn-banner/api/turn-data.test.ts`에서 검증한다.

`scripts/checks/frontend-contract-owners.test.mjs`는 `test:scripts`와 `test:architecture`에서 설치 상수 세 개와 인수 확인 label의
공개 경로·실제 선언·소비 binding을 TypeScript AST와 symbol resolution으로 검사한다.
다른 slice의 소스 파일명을 제품 테스트에서 고정하지 않는다. import의 줄바꿈·alias·추가 binding과
공개 API 뒤 내부 이동은 허용하고, 복제·외부 재수출·wildcard·private import는 거부 fixture로 확인한다.
설치 값·다섯 Docs 본문·문구 잠금 검증은 기존 product 테스트에 유지한다.

발급 상태·제출·복구는 `features/manage-token/ui/token-issuance-form.tsx`가 소유한다.
기존 `--ui-only` suite의 `token independent instances` 사례는 hs/ho·hu/ho를 같은 mount에서 요청하고,
응답을 역순으로 정산하여 token·만료·alert 격리와 자동 요청 부재를 검사한다.
기존 scope별 실패·응답 미확인·Previous token·Refresh list와 cleanup 사례도 유지한다.
fixture의 refresh double은 실제 RSC state 보존의 증거가 아니므로, 앞의 실제 Next 토큰 인수 절차도 수행한다.

## 문구 잠금

`docs/conventions/product-copy.md`는 "코드는 이 파일에서 나온다"고 선언하지만 강제가 없어 두 번 어긋났다 —
§13(PR #34)과 §9(2026-09-21: 문서·스킬만 고친 커밋 `a766a0e`·`6871680`이 화면 다섯 군데를 두고 갔다).
아래 시험이 그 절들을 코드에 묶는다. 전부 `npm run test:web`(CI)에서 돈다.

| 잠금 | 문서의 자리 | 시험 | 묶는 대상 |
| --- | --- | --- | --- |
| §13 표의 행 | `board_transition`·`plan_submit`·`agent_next`·`backlog_add` | `src/server/mcp/tools.test.mjs` | MCP 도구 설명(글자 일치) |
| `token-reveal-shared`·`-project`·`-user` | §9 Token reveal | `src/fsd/entities/project-token/ui/token-reveal.test.ts` | `TokenReveal`(hs_·hu_ 각각 렌더) |
| `token-reveal-codex`·`-project`·`-user` | Codex 연결·재개 | 같은 파일 | 실제 Codex install/init 표시·token scope·watch 미표시; Claude 기본 잠금은 유지 |
| `owner-token-reveal`·`-codex` | §9 Owner token reveal | 같은 파일 | Claude 기본 안내·Codex owner endpoint/환경 변수 참조·token-free 등록 명령 |
| `turn-banner-connect` | §5 First run | `src/fsd/widgets/turn-banner/model/turn.test.ts` | 서버 모델의 중립 `detail`(글자 일치) |
| `turn-banner-connect-claude`·`-codex` | §5 First run의 클라이언트 선택 | `src/fsd/widgets/turn-banner/model/setup-detail.test.ts`, `ui/turn-banner.test.ts` | 선택한 init 표시·서버 판정 불변; 브라우저 fixture가 setup/next·탭 유지·slug reset을 검증 |
| `turn-banner-watch` | §5 Next, in Claude Code | `src/fsd/widgets/turn-banner/model/turn.test.ts`, `ui/next-step.test.mjs` | `WATCH_LINE` 글자 일치·실제 본문·명령 Code·빈 상자·Copy payload |
| `turn-banner-runner`·`-reasons`·`-signin`·`-short`·`-none`·`-free` | §5 Runner line | `src/fsd/widgets/turn-banner/model/runner.test.ts`, `ui/turn-banner.test.ts`, `ui/next-step.test.mjs` | 실행기 줄 틀·정지 이유·로그온 시작 거부 이유·짧은 형태·버전 줄·Free 줄의 글자 일치(model 상수). 렌더 시험이 값을 채운 줄, host의 mono, 살아 있는 실행기의 watch 줄 숨김, Board·Inbox에만 Pause/Resume, 상주 실행기 working에만 편집 경고, 행 없음·Free에만 Free 줄을 본다 |
| `landing-demo` | §16 Landing (데모 카드) | `src/fsd/pages/landing/ui/landing-page.test.ts` | `LandingPage`의 데모 카드가 값으로 적은 제품 문장 셋 |
| `landing-meta` | §16 Landing (탭·검색·공유) | 같은 파일 | 문서 제목·설명(`LANDING_TITLE`·`LANDING_DESCRIPTION`, 글자 일치). 본문과 독립적으로 검사 |
| `landing-intro` | §16 Landing (본문) | 같은 파일 | 기존 랜딩 본문(`LANDING_INTRO`) 보존·로그인별 CTA·머리/꼬리 Docs 링크 |
| `docs-meta` | §20 Docs | `src/fsd/pages/docs/ui/docs-copy.test.ts` | 다섯 페이지 제목·설명 10개 단위의 순서와 글자 일치 |
| `docs-shell` | §20 Docs (탐색·공통 버튼) | 같은 파일 | 다섯 실제 페이지 렌더의 공통 탐색·CTA·건너뛰기, 현재 항목·이전/다음 경계와 문서 금지어 검사 |
| `history-tab` | §19 History tab | `src/fsd/pages/project-history/ui/project-history-page.test.ts` | Items 빈 상태·상태별 행·펼친/빈 상세, Events key/all 빈 상태와 중간 페이지. 독립 커서·보기 전환·링크 목적지 검사 |

읽는 법과 블록 규칙(한 줄 = 한 단위, 줄바꿈 금지)은 `src/fsd/shared/lib/copy-lock.ts`와 product-copy.md 머리의
"Copy-lock blocks"에 있다. 화면 잠금은 **포함 검사**다: 블록의 모든 줄이 화면에 있는지만 본다. 그래서

- 문서만 고친 경우, 화면 문장을 고친 경우는 잡는다.
- 화면에 문서에 없는 문장을 **더한** 경우는 못 잡는다.
- 문서와 화면이 **같이 틀린** 경우는 못 잡는다 — `checks/retired-copy.test.mjs`가 그 틈을 맡는데, 옛 표현을 사람이 등록해야 안다.
- `claude`처럼 짧은 단위는 어디서든 맞으므로 지키는 힘이 없다. 지키는 것은 문장이다.

## 공개 문서 검증

공개 문서 본문은 product-copy.md §20의 예외에 따라 TSX에서 관리한다. 메타데이터와 공통 UI는 위 잠금으로,
단계·플랜·설치 명령·인수 이름은 실제 core/entity/config 값과 렌더 결과의 비교로 확인한다.
`src/fsd/pages/docs/model/docs-pages.test.ts`는 registry와 다섯 실제 정적 page.tsx의 경로 집합을 비교한다.
`src/app/sitemap.test.ts`·`robots.test.ts`는 반환 구조를, `src/app/page.test.ts`는 실제 랜딩 라우트를 VM 주입으로 읽어
기존 auth·GitHub action 연결과 JSON-LD의 파싱 값·HTML 이스케이프를 검사한다. DB·실제 인증 모듈을 시험 double로 대체한다.
`src/proxy.test.ts`는 현재 설치 버전의 `unstable_doesMiddlewareMatch`로 sitemap의 정확한 제외와 기존 자산·인증 경계를 검사한다.
Next의 node-environment bootstrap은 그 시험 파일에서만 먼저 읽으며 실험 API는 버전 변경 때 재대조한다.

실행 서버 인수는 `HARNESS_PUBLIC_URL=https://stagekeeper.dev`로 fresh build와 start를 모두 실행한 뒤 수행한다.
다섯 페이지의 본문·h1·탐색·명령, 실제 head의 title/description/canonical/robots·공유 카드·아이콘,
파싱한 sitemap XML의 정확한 URL 여섯 개, robots 본문, JSON.parse한 랜딩 WebSite를 확인한다.
비로그인/로그인 문서 접근, 기존 private 보호·noindex, 끝 `/`의 308, 320/768/1280px·확대·라이트/다크·키보드·Copy 복구도 확인한다.
CSS·로컬 폰트·이미지의 실제 응답과 렌더를 확인하며, 미실행 환경 인수를 자동 시험 통과로 대체하지 않는다.

## 변경 전 체크리스트

- [ ] [README.md](./README.md)와 [fsd.md](./fsd.md)를 읽었다.
- [ ] Next.js 파일을 바꾸면 설치된 버전의 관련 문서를 읽었다.
- [ ] 새 코드의 owner layer와 slice를 한 문장으로 설명할 수 있다.
- [ ] 새 slice가 필요하지 않다면 실제 사용처에 코로케이션했다.
- [ ] DB/인증/MCP/보안 경계를 `src/fsd`에 넣지 않았다.
- [ ] 연결 방식·도구 계약처럼 **사용자에게 말해 둔 사실**을 바꾸면, 옛 방식을 말하는 표현을
  `scripts/checks/retired-copy.test.mjs`의 `RETIRED`에 더했다. product-copy.md만 고치는 커밋은 없다 — 잠금 블록을
  고치면 화면이 같은 커밋에 따라온다.

## 리뷰 체크리스트

- [ ] import가 낮은 layer로만 향한다.
- [ ] 같은 layer의 slice들이 서로 독립적이다.
- [ ] slice 외부 import가 public API를 사용한다.
- [ ] public API가 필요한 symbol만 명시적으로 export한다.
- [ ] server/client public API가 섞이지 않았다.
- [ ] 상태, schema, 테스트, loading/error UI가 변경 책임 근처에 있다.
- [ ] 테스트의 위치·보조 코드·운영 코드 의존성을 [테스트 배치 규칙](./test-organization.md)과 대조했다.
- [ ] 추가·이동한 테스트가 실제 실행 명령의 검색 패턴에 포함되고 실행됐다.
- [ ] 전역 store, 공통 hook, slice·shared 추출의 책임·변경 이유·실제 소비처를
  [FSD 배치 기준](./fsd.md#코드-배치와-추출-판단)과 대조했다.
- [ ] `src/app` route가 composition 이상을 떠안지 않는다.
- [ ] `src/server`가 UI 표현이나 FSD 타입에 의존하지 않는다.
- [ ] `npm run lint`, `npm run test:architecture`, 관련 테스트가 통과한다.

## 예외 정책

영구적인 layer·의존 방향 변경은 ADR이 필요하다. 일시 예외가 불가피하면 이
문서 아래 표에 기록하고 검사기에 **파일 단위**로만 반영한다. 디렉터리 전체 또는
규칙 전체를 끄는 예외는 허용하지 않는다.

| 경로 | 예외 | 소유자 | 제거 조건 |
| --- | --- | --- | --- |
| 현재 없음 | — | — | — |

## 마이그레이션 주의

계정 사용량·토큰 관리는 `test:server:integration`의 account-usage/token-management/request-rate-limit 시험으로 DB 경합·rollback·migration을 검사한다. `scripts/rehearsals/rehearse-request-rate-baseline.ts`는 fixture IO 기반 호출 가정이며 운영 peak 측정이 아니다. 최신 production build 후 `TEST_DATABASE_URL`을 지정하고 `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-account-usage-and-tokens.ts`로 실제 Next 인증·Server Actions·15개 도구 집계·SDK 제외·플랜 화면을 검증한다. `--interactive`는 loopback 테스트 로그인·응답 유실 proxy를 띄우며 `/finish`로 테스트 fixture와 서버를 정리한다. 실제 운영 DB나 세션을 사용하지 않는다.

라우트 이동은 완료되어 현재 진입점은 `src/app/`이다. 루트 `app/`을 함께 만들면
Next.js가 `src/app/`을 무시하므로 검사기가 즉시 실패시킨다.

활성 Phase 0·1 제안서에는 작성 시점의 deep import 예시가 남아 있을 수 있다.
그 제안서를 구현할 때는 이 문서가 최신 architecture source of truth이며, public
API를 추가하고 import를 정리한 뒤 진행한다. 사용자가 수정 중인 제안서 본문은
이번 작업에서 덮어쓰지 않는다.

## Acceptance failure rehearsal

`node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-acceptance-failure.ts` uses only validated `TEST_DATABASE_URL` (stagekeeper_test_*, distinct from the parent DATABASE_URL). It exercises the actual Next owner action, authentication/read-only/stale controls and lost-response recovery. After a fresh build, `--templates` checks the entire private LF bundle through a unique test Template language, authenticated HTTP and actual init-generated managed marker/report convention/hash; the DB fixture is cleaned and generated files remain in a unique Temp directory. `--interactive` serves isolated browser lifetime fixtures and the actual item page; `/finish` cleans the fixture server and users. New production code requires the additive acceptance migration before rollout; production migration/seeding/watch installation observations are separate from local checks.
