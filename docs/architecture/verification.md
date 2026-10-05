# 아키텍처 검증

## 자동 검사

`scripts/verify-fsd-boundaries.mjs`는 외부 package 없이 정적 import를 검사한다.

```powershell
npm run verify:fsd
npm run test:architecture
npm run lint
npm run check      # 위 셋 + 복사본 동기화 검사 + 타입 검사 — CI와 같은 게이트
```

`npm run lint`는 ESLint 뒤에 FSD 검사를 실행하므로 일반적인 품질 게이트에서
아키텍처 경계도 함께 확인한다.

검사 대상:

- FSD layer의 상향 import
- 같은 layer의 다른 slice import
- 다른 slice 내부로 들어가는 deep import
- non-empty slice의 public API 누락
- FSD에서 `src/server`를 호출하는 server adapter의 위치와 directive
- Client Component의 서버 모듈 import
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

## 저장소 스크립트

`scripts/`는 앱 런타임 코드가 아니다. 검사기와 운영 도구만 둔다.

| 스크립트 | 진입점 | 언제 | 하는 일 |
| --- | --- | --- | --- |
| `build-windows-role-node.ps1` | Windows 운영자 build/`windows-role-runtime` CI | native 명령 backend 검증 시 캐시가 없을 때 | SHA-256으로 고정한 공식 Node 22.23.3 source에 libuv #5181의 AppContainer pipe 수정을 backport하고 x64 runtime·원본 npm·license·출처/hash·빌드 스크립트 지문을 artifact로 만든다. 사용자의 compiler/Node 설치나 패키지 공개는 수행하지 않는다. 실제 LPAC 인수와 배포물 전달 완료를 대신하지 않는다 |
| `windows-role-runtime-cache.mjs`, `windows-role-runtime-cache.test.mjs` | `node scripts/windows-role-runtime-cache.mjs key` / `verify --runtime <절대 경로>`; `test:architecture` | Windows CI 런타임 준비 시 | 빌드 스크립트·캐시 검증 계약의 SHA-256으로 정확한 캐시 키를 만들고, runner Node로 고정 출처·빌드 옵션·스크립트 지문·실행 파일 및 전체 패키지 해시를 실행 전에 검사한다. alias/hardlink·파일 종류·크기·개수·깊이를 제한하며 검증 실패는 재사용이나 실행으로 넘어가지 않는다 |
| `package-windows-plugin.mjs` | `node scripts/package-windows-plugin.mjs --output <새 저장소 밖 절대 경로> --runtime <검증된 runtime artifact>` | Windows private 배포물 검토 시 | 추적된 plugin source·runtime·변경하지 않은 완전한 owner verifier를 양쪽 skill 경로에 복사하고 inventory/hash를 남긴다. auth/private templates 복사·업로드·공개는 없다. source-only checkout과 install bundle을 구분한다 |
| `rehearse-windows-project-build.mjs` | `node scripts/rehearse-windows-project-build.mjs --root <npm ci로 준비한 공개 checkout> --runtime <검증된 Windows runtime>` | `windows-role-runtime` CI/전체 프로젝트 빌드 회귀 시 | Prisma 엔진을 포함한 정상 의존성 설치 후, DB URL·환경 파일·network 없는 실제 LPAC snapshot에서 전체 `npm run build`와 원본 source/build ID 불변·산출물 폐기·종료 acknowledgement를 확인한다. 모델·DB·로그인·배포를 실행하지 않는다 |
| `build.mjs`, `windows-role-readlink.cjs` | `npm run build` | 프로젝트 production build | 기본 Next 빌드를 유지하고 Windows 역할 복사본에서만 Webpack·readlink 오류 호환 preload와 TypeScript compiler API 검사를 선택한다. 타입 검사를 생략하지 않으며 API가 없는 TypeScript로의 업그레이드는 실제 native CI에서 검증해야 한다. 일반 파일임을 실제 lstat로 확인할 때만 EPERM/EACCES를 EINVAL로 바꾸며 링크·metadata 거부는 유지한다. owner 프로세스·커널·ACL·network 권한은 변경하지 않는다 |
| `windows-role-readlink.test.mjs` | `STAGEKEEPER_TEST_WINDOWS_RUNTIME` 지정 후 `node --test scripts/windows-role-readlink.test.mjs` | native Windows CI/호환 preload 변경 시 | 실제 LPAC의 sync/callback/promises/ESM readlink·callback validation·외부 metadata/data 거부를 확인한다. 다른 플랫폼/미준비된 runtime의 skip은 전체 Windows 인수 PASS를 대신하지 않는다 |
| `windows-role-spawn-diagnostics.cjs`, `windows-role-spawn-diagnostics.test.mjs` | 기존 단일 preload의 opt-in / `STAGEKEEPER_TEST_WINDOWS_RUNTIME` 지정 후 `node --test scripts/windows-role-spawn-diagnostics.test.mjs` | native Windows CI/child startup 진단 | 역할 빌드의 오류 code·실행 파일 분류·stdio 등 고정 필드만 기록하고 경로·인자·환경·권한·오류를 변경하지 않는다. 실제 silent IPC fork와 외부 실행 파일 거부 및 비공개 인자 미노출을 확인한다. 런타임 컴파일 캐시는 시험 전 저장하고 후속 실패에도 artifact를 보존한다 |
| `verify-fsd-boundaries.mjs` | `npm run verify:fsd`, `npm run lint`, `npm run check` | CI마다 | 위 FSD 경계 검사 |
| `tests/server/register-server-only.mjs` | `npm run test:server` | 서버 변경 시 로컬 | server-only marker만 대체하며 일반 React를 유지하는 교차 모듈 테스트 |
| `test-server-integration.mjs` | `npm run test:server:integration` | 격리 PostgreSQL에서 수동 | `TEST_DATABASE_URL`의 DB명이 `stagekeeper_test_*`이고 운영 URL과 host/port/database가 다른지 검사한 뒤 migrate deploy·직렬 통합 테스트. DB 생성·삭제·reset 없음 |
| `test-server-integration.test.mjs` | `npm run test:architecture` | CI마다 | URL 안전 검사와 migration→test 실행 순서·실패 중단 검사 |
| `rehearse-request-rate-baseline.ts` | `node --import tsx scripts/rehearse-request-rate-baseline.ts` | 수치 결정·템플릿 흐름 변경 시 로컬 | 현재 MCP callback/schema와 private 템플릿 단계에 근거한 정상 흐름·재시도 burst를 집계한다. 도메인 IO는 fixture이며 운영 트래픽 측정이 아니다. credential 없이 subject·시간·시퀀스만 관측 |
| `rehearse-dual-client-runtime.ts` | `node --import tsx scripts/rehearse-dual-client-runtime.ts --phase capability --root <빈 절대 경로> --report docs/test-reports/active/dual-client-runtime-report.md` | Codex C0 선행 검증 시 수동 | 저장소 밖 disposable root·격리 CLI 설정·loopback MCP로 실제 package 로딩과 legacy lock을 확인한다. 모델을 자동 호출하지 않으며 native/strict-profile 시험 인수·prompt를 생성한다. required 미실행은 blocked/exit 2이고 제품 지원 PASS가 아니다. `--validate-report-only --report <동일 보고서>`는 무쓰기 구조 검증만 한다 |
| `rehearse-dual-client-runtime.test.ts` | `node --import tsx --test scripts/rehearse-dual-client-runtime.test.ts` | 위 검사기 변경 시 명시적으로 수동 | report lifecycle·판정·증거/경로·민감정보 검사·atomic writer/경합·side effect 전 거부 및 독립 실행 환경을 검증한다. 현재 `npm test`/`check`의 test glob에 포함되지 않는다 |
| `rehearse-dual-client-runtime.ts --phase acceptance` | 동일 report와 별도 준비된 dual checkout의 `--root` | 보호된 TEST_DATABASE_URL에서 수동 | 실제 test DB migration과 `tests/server/integration/client-runtime.test.ts` 6개만 실행한다. 두 client 순서·legacy/slots 승인·원장/usage·preflight·seed rollback/제한 복구를 검사하며 실제 모델/browser/package gate는 NOT RUN으로 보존한다. 모델 자동 호출·운영 seed 없음 |
| `rehearse-automatic-scout.ts` | `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-automatic-scout.ts` | 격리 TEST_DATABASE_URL·fresh production build에서 수동 | 실제 Next HTTP로 Free 자동 발굴 switch 저장·재조회·잘못된 입력·타인·무세션·사용 불가 프로젝트 거부를 검증한다. 루프백 fixture만 만들고 종료 시 자기 fixture를 정리한다 |
| `rehearse-repository-disconnection.ts` | 아래 실제 Next 리허설 명령 | 격리 PostgreSQL·현재 production build에서 수동 | 별도 기능 설정 없이 동일 유효 action/body로 소유자·타인·무세션·bearer·위조 userId·stale와 상세 GET 7개/History 무쓰기를 검증. `--transport-loss`는 실제 커밋 뒤 응답 유실·추가 이력 pagination을 검증. `--interactive`는 루프백 fixture 로그인·응답 유실 proxy와 화면 검증을 제공하고 Enter 또는 `/finish` 뒤 자기 fixture만 정리 |
| `rehearse-src-clean-code.ts` | 아래 클린코드 인수 명령 | 격리 PostgreSQL·fresh production build에서 수동 | 실제 Next Inbox·등록 폼과 실제 컴포넌트/통제 가능한 clipboard fixture를 제공한다. loopback proxy에서 요청 전 실패·커밋 뒤 응답 유실·대기를 통제한다. `--render-faults`는 generated build의 content/wrapper/loader 함수만 일시 계측하고 종료 시 원본 바이트로 복원한다. `/finish` 뒤 자기 사용자·DB fixture·Next 서버·marker를 정리한다 |
| `verify-fsd-boundaries.test.mjs`, `plugin-lib.test.mjs` | `npm run test:architecture` | CI마다 | 검사기 자체의 테스트 |
| `retired-copy.test.mjs` | `npm run test:architecture` → check | CI마다 | 폐기된 표현 가드 — 웹의 보이는 문구·`SKILL.md`·product-copy.md 잠금 블록에 옛 연결 방식의 문장이 없는지. 규칙은 파일 머리의 `RETIRED`에 손으로 더한다 |
| `plugin-lib.mjs --check` | `npm run check` 첫 단계 | CI마다 | `plugin/lib` 드리프트·고아 판정, 실패 시 exit 1 |
| `plugin-lib.mjs` | `npm run sync:plugin-lib` | `packages/core/*.mjs`를 바꾼 뒤 | 복사본을 원본과 같게(덮어쓰기·삭제) |
| `seed-templates.ts` | `npm run seed:templates [-- --dir <dir> --snapshot <private 경로>]` | private 템플릿 배포 승인 후 수동 | 전체 agent graph·Codex bundle을 쓰기 전에 검증하고 Serializable transaction으로 seed한다. Codex source가 있으면 public 밖의 신규 private snapshot을 먼저 저장한다. 실제 DB 실행은 배포 검증 |
| `restore-dual-client-templates.ts` | `node --import tsx scripts/restore-dual-client-templates.ts --snapshot <private 경로>` | 승인된 template 복구 | snapshot version/hash·현재 body 전체를 먼저 대조하고 whitelist 행만 한 transaction으로 복구한다. 이전에 없던 CODEX.runbook 행만 삭제하며 외부 행을 보존한다 |
| `lib/template-seed-query.ts`, `template-seed-query.test.ts` | `node --import tsx --test scripts/template-seed-query.test.ts` | seed/restore 변경 시 명시적으로 실행 | 전량 검증 후 첫 쓰기·snapshot 범위·현재 판 drift 거부를 IO fixture로 검증. 실제 DB rollback 증거가 아니며 기존 test glob 밖이다 |
| `grant-plan.ts` | `npm run plan:grant -- <login> <free\|pro\|max> [note]` | 플랜을 붙일 때, 로컬에서 | availability service를 통한 plan/set/version/event atomic change |
| `lib/prisma.ts` | (헬퍼) | — | DB 스크립트의 Prisma 부트스트랩. `DATABASE_URL`이 없으면 exit 2 |
| `check-project-ownership-cleanup.ts` | `npm run check:project-ownership:cleanup -- --pre\|--post` | D3 cleanup 전후 | catalog·직접 owner·exact set·event를 read-only snapshot으로 검사 |
| `project-availability-cleanup.test.ts` | `npm run test:project-availability` | CI마다 | cleanup facts, SQL, CLI/receipt와 보존 계약의 DB 없는 회귀 검사 |
| `project-availability-runtime.test.ts` | `npm run test:project-availability` → check | CI마다 | Member/legacy owner/old policy 부재, final schema/generated client와 폐기 script 검사 |
| `rehearse-project-availability-d3.ts` | `npm run test:project-availability:d3:db -- --allow-fixtures --baseline <commit>` | 서로 다른 빈 격리 PostgreSQL 두 개에서 수동 | 고정 D2 artifact → cleanup → D3 등록 → 보상 migration → D2 smoke. 두 전용 URL 필수 |
| `restore-project-ownership-shadow.ts` | `npm run restore:project-ownership:shadow -- [--check\|--apply --backup-receipt <path>]` | 승인된 D3 복구 | 전용 URL·receipt·migration checksum을 검사하고 고정 보상 migration bundle을 적용 |
| `recovery/individual-project-availability-d3/restore-d2-shadow.sql` | 위 복구 CLI | D3 commit 뒤 D2 호환 복구 | 현재 direct owner에서 legacy shadow를 transaction으로 재구성. 일반 migration path에는 없음 |

`plugin/lib/`는 직접 고치지 않는다 — ESLint도 그 폴더를 무시한다(`eslint.config.mjs`). 원본을 고치고 동기화한다.

## Windows CI 런타임 재사용

`windows-role-runtime`은 `dev` push와 관련 경로를 바꾼 PR에서 실행한다. `dev` 실행이
생성한 캐시는 새 PR이 공유할 수 있고, PR 실행이 생성한 캐시는 해당 PR의 재실행만
재사용한다. `dev` push는 경로를 제한하지 않아 유휴 기간의 캐시 만료 후에도 다시
공유 캐시를 준비한다. PR 새 커밋은 같은 workflow·PR의 이전 실행을 취소하지만,
진행 중인 `dev` 런타임 생성은 취소하지 않는다.

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
Next 폰트는 `src/app/fonts/`의 원본·라이선스·출처/hash를 포함하는 로컬 파일로
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
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-repository-disconnection.ts --transport-loss
# 화면 확인은 --interactive. Enter 또는 http://127.0.0.1:55439/finish로 서버/fixture를 정리한다.
```

AST와 새 build manifest는 loader가 원격 action이 아니며 두 mutation만 등록됨을 확인한다.
실제 POST는 같은 action ID·본문·Origin/Host의 소유자 성공 대조군으로 유효한 transport를 먼저 증명한다.
리허설은 부모 DB 분리 검사를 통과한 뒤 child의 DATABASE_URL/TEST_DATABASE_URL만 테스트 DB로 맞춘다.
연결 해제·재연결은 별도 기능 설정 없이 제공한다. 운영 DB·배포의 실제 상태는 로컬 통과로 증명되지 않는다.
현재 배포 절차는 [repository-disconnection.md](./repository-disconnection.md)를 따른다.
[최초 검증 보고서](../test-reports/active/2026-09-27-repository-disconnection.md)의 스위치 검증은 당시 정책의 기록이다.
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
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-src-clean-code.ts --render-faults
```

리허설 중 `http://127.0.0.1:55452/owner`는 fixture 세션으로 실제 Inbox를 연다.
`/fixture?mode=form&picker`, `/fixture?mode=copy`는 실제 컴포넌트의 입력·비동기 상태 시험이다.
이 화면의 action/clipboard는 시험 double이며 실제 DB 등록은 `/p/new`에서 별도 확인한다.
브라우저에서 `/arm/before`, `/arm/after`, `/arm/pause`, `/arm/normal`, `/release`로 transport를 제어한다.
렌더 오류는 `/server-fail/true`, `/wrapper-fail/true`, `/loader-fail/true`로 켜고 각각 `false`로 해제한다.
시험 후 `/finish`를 호출한 뒤 fresh build와 manifest 검사를 다시 실행한다.
생성 산출물의 일시 계측이나 브라우저 응답 계측을 애플리케이션 소스·배포에 포함하지 않는다.
범위·방법·실행 판정은 [3차 인수 보고서](../test-reports/completed/2026-10-01-src-clean-code-third-pass-regression.md)에 기록한다.

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
| `landing-demo` | §16 Landing (데모 카드) | `src/fsd/pages/landing/ui/landing-page.test.ts` | `LandingPage`의 데모 카드가 값으로 적은 제품 문장 셋 |
| `history-tab` | §19 History tab | `src/fsd/pages/project-history/ui/project-history-page.test.ts` | Items 빈 상태·상태별 행·펼친/빈 상세, Events key/all 빈 상태와 중간 페이지. 독립 커서·보기 전환·링크 목적지 검사 |

읽는 법과 블록 규칙(한 줄 = 한 단위, 줄바꿈 금지)은 `src/fsd/shared/lib/copy-lock.ts`와 product-copy.md 머리의
"Copy-lock blocks"에 있다. 화면 잠금은 **포함 검사**다: 블록의 모든 줄이 화면에 있는지만 본다. 그래서

- 문서만 고친 경우, 화면 문장을 고친 경우는 잡는다.
- 화면에 문서에 없는 문장을 **더한** 경우는 못 잡는다.
- 문서와 화면이 **같이 틀린** 경우는 못 잡는다 — `retired-copy.test.mjs`가 그 틈을 맡는데, 옛 표현을 사람이 등록해야 안다.
- `claude`처럼 짧은 단위는 어디서든 맞으므로 지키는 힘이 없다. 지키는 것은 문장이다.

## 변경 전 체크리스트

- [ ] [README.md](./README.md)와 [fsd.md](./fsd.md)를 읽었다.
- [ ] Next.js 파일을 바꾸면 설치된 버전의 관련 문서를 읽었다.
- [ ] 새 코드의 owner layer와 slice를 한 문장으로 설명할 수 있다.
- [ ] 새 slice가 필요하지 않다면 실제 사용처에 코로케이션했다.
- [ ] DB/인증/MCP/보안 경계를 `src/fsd`에 넣지 않았다.
- [ ] 연결 방식·도구 계약처럼 **사용자에게 말해 둔 사실**을 바꾸면, 옛 방식을 말하는 표현을
  `scripts/retired-copy.test.mjs`의 `RETIRED`에 더했다. product-copy.md만 고치는 커밋은 없다 — 잠금 블록을
  고치면 화면이 같은 커밋에 따라온다.

## 리뷰 체크리스트

- [ ] import가 낮은 layer로만 향한다.
- [ ] 같은 layer의 slice들이 서로 독립적이다.
- [ ] slice 외부 import가 public API를 사용한다.
- [ ] public API가 필요한 symbol만 명시적으로 export한다.
- [ ] server/client public API가 섞이지 않았다.
- [ ] 상태, schema, 테스트, loading/error UI가 변경 책임 근처에 있다.
- [ ] 전역 store, 공통 hook, shared 추출이 실제 반복과 같은 변경 방향으로
  정당화된다.
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

계정 사용량·토큰 관리는 `test:server:integration`의 account-usage/token-management/request-rate-limit 시험으로 DB 경합·rollback·migration을 검사한다. `scripts/rehearse-request-rate-baseline.ts`는 fixture IO 기반 호출 가정이며 운영 peak 측정이 아니다. 최신 production build 후 `TEST_DATABASE_URL`을 지정하고 `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-account-usage-and-tokens.ts`로 실제 Next 인증·Server Actions·15개 도구 집계·SDK 제외·플랜 화면을 검증한다. `--interactive`는 loopback 테스트 로그인·응답 유실 proxy를 띄우며 `/finish`로 테스트 fixture와 서버를 정리한다. 실제 운영 DB나 세션을 사용하지 않는다.

라우트 이동은 완료되어 현재 진입점은 `src/app/`이다. 루트 `app/`을 함께 만들면
Next.js가 `src/app/`을 무시하므로 검사기가 즉시 실패시킨다.

활성 Phase 0·1 제안서에는 작성 시점의 deep import 예시가 남아 있을 수 있다.
그 제안서를 구현할 때는 이 문서가 최신 architecture source of truth이며, public
API를 추가하고 import를 정리한 뒤 진행한다. 사용자가 수정 중인 제안서 본문은
이번 작업에서 덮어쓰지 않는다.

## Acceptance failure rehearsal

`node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-acceptance-failure.ts` uses only validated `TEST_DATABASE_URL` (stagekeeper_test_*, distinct from the parent DATABASE_URL). It exercises the actual Next owner action, authentication/read-only/stale controls and lost-response recovery. After a fresh build, `--templates` checks the entire private LF bundle through a unique test Template language, authenticated HTTP and actual init-generated managed marker/report convention/hash; the DB fixture is cleaned and generated files remain in a unique Temp directory. `--interactive` serves isolated browser lifetime fixtures and the actual item page; `/finish` cleans the fixture server and users. New production code requires the additive acceptance migration before rollout; production migration/seeding/watch installation observations are separate from local checks.
