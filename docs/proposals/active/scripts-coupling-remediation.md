---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-11-16"
approved-by: "user"
approved-at: "2026-11-17"
approval-scope: "세 Phase 구현·검증과 후속 요청에 따른 최신 dev 통합, 커밋·푸시·dev 대상 PR, CI 및 격리 설치·실제 모델 인수. 필수 검증 통과 후 dev 병합. main 승격·운영 배포·개인 전역 설치 변경은 제외."
completed-at: null
verification-summary: "세 Phase 구현 및 macOS 격리 검증 완료. 전체 check·architecture·web·server·DB·HTTP·브라우저 검증 통과. Windows native와 trusted 설치·실제 모델 인수는 미실행."
closed-at: null
closed-by: null
closed-reason: null
owners: ["codex-scripts-coupling-20261116"]
related:
  - "docs/investigations/active/scripts-coupling-investigation.md"
  - "docs/proposals/active/shared-modules-and-plugin-distribution.md"
  - "docs/proposals/completed/2026-11-16-shared-modules-and-plugin-distribution-phase-arch.md"
  - "docs/proposals/active/ci-os-coverage.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/repository-disconnection.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
---

# scripts 결합도와 실행 격리 개선

## Summary

[조사 문서](../../investigations/active/scripts-coupling-investigation.md)의 다섯 문제를 해결한다.
출하 파일 판정을 OS 패키징에서 분리하고, 리허설의 Action 식별을 안정화하며,
직접 사용하는 라이브러리를 명시한다. smoke 서버는 실행별 주소와 자식의 실제 listen
확인으로 격리하고, 게이트 기록은 새 출력 디렉터리에만 작성한다.

작성 모드는 `WHOLE_SDD`, 설계 위험도는 `STANDARD`다. 이 문서는 요구사항·설계·단계별
완료 조건의 단일 원본이다. 2026-11-16 후속 요청으로 세 Phase 구현과 격리 검증이 승인됐다.
기존 조사서와 다른 제안서의 과거 기록은 유지한다.
정합성 검토는 인증을 가진 Action 이동, 생성 manifest, IPC와 파일 산출물을 다루므로
`High-Risk` profile로 수행한다. 이는 proposal-size와 별도의 검토 깊이 분류다.

## Goal and Proposal Size

- 버전 검사와 OS 패키징의 변경 영향을 분리하고 출하 판정의 사본을 없앤다.
- 제품 기능을 바꾸지 않는 함수 재배치가 잘못된 Action 호출로 이어지지 않게 한다.
- 설치 도구의 간접 의존성 배치에 기대는 실행 조건을 제거한다.
- 다른 실행의 서버·결과 파일을 현재 실행의 것으로 사용하지 않게 한다.

`proposal-size: standard`. 여러 모듈·실행 경계와 테스트를 함께 바꾸며, H2의 Action 노출
경계와 H4의 프로세스 생명주기를 검증해야 한다. 제품 권한·DB schema·플랜·파이프라인 규칙은
변경하지 않는다. 구현 담당자는 `owners`에 기록했다.

## Current State and Evidence Baseline

### 관측 기준

- 작성일의 HEAD: `eabd1381169a2692e9b29317c31047bbb4027c7d`.
- 작업 브랜치: `harness/plugin-skill-contract-plan`; 열린 PR 조회 결과 0건.
- 조사서와 공유 모듈 제안서 두 개는 미추적 상태다. architecture·proposal·test-report에는
  다른 작업의 변경·이동이 있으며 그대로 보존한다.
- 단일 npm 프로젝트이며 Node test runner·TypeScript·ESLint·Next production build를 사용한다.
  검사 명령과 발견 패턴은 [package.json](../../../package.json)에서 확인했다.
- 로컬 Next는 16.4.2다. 설치된 `node_modules/next/dist/docs/`의 `use-server.md`,
  `server-actions.md`와 현재 Action 구현을 근거로 프레임워크 경계를 검토했다.

### 문제와 확인 범위

| ID | Observed: 현재 구현 | 확보한 근거 | 해결 대상 |
| --- | --- | --- | --- |
| H1 | 버전 검사기가 Windows packager의 파일 필터를 import | Windows C# 파일 제거 시 import 실패, 복원 시 성공하는 임시 사본 대조 | OS 중립 파일 판정과 단일 소유권 |
| H2 | 여러 manifest reader, 연결 해제 시험의 생성 번호 `0/1` 고정 | 코드 대조. 조사서 작성 후 대화의 추가 확인에서 실제 Next SWC로 두 함수 순서만 바꾸자 번호의 의미가 뒤바뀜 | 공통 해석과 의미가 있는 Action 이름 |
| H3 | esbuild·pg를 직접 사용하지만 package.json에 미선언 | lockfile 경로와 임시 설치 배치에서 Node 모듈 해석 대조 | 직접 의존성 선언 |
| H4 | 세 리허설이 포트 45438과 `/login` 성공 응답을 공유 | 원본 helper와 서버 대역으로 기존 서버 오인·새 자식 EADDRINUSE 재현 | 실행별 주소와 소유 자식 확인 |
| H5 | gate-record가 기존 폴더의 일부 파일만 덮어씀 | 실제 main의 연속 호출에서 오래된 실패 파일·이슈 번호 잔존 | 새 디렉터리의 배타적 소유 |

위 실행은 이전 조사·재검토에서 수행한 근거다. 최초 SDD 작성은 코드 읽기와 설계 검증으로
끝냈다. 이후 정합성 검토의 기준 소스 실행과 임시 prototype 대조는 아래 Reconciliation
Record에 별도로 기록하며, 변경 후 제품 구현·모델·설치 인수와 구분한다.
H3의 대조는 실제 패키지 metadata·entry를 배치한 새 Node 프로세스의 resolution 시험이며
패키지 매니저를 바꾼 전체 설치 시험은 아니다. H4는 실제 Next 대신 서버 대역을 사용했다.

### 코드와 계약의 조정

| 경계 | 근거와 상태 | 이 제안의 처리 |
| --- | --- | --- |
| scripts 배치 | Contracted: verification.md는 책임별 하위 폴더와 실제 공용 helper를 허용 | 기존 폴더를 유지하고 필요한 작은 모듈만 추가 |
| 출하 파일 선택 | Observed: 두 packager에 동일 predicate, version checker는 Windows 구현에 의존 | predicate의 의미를 유지한 채 소유 위치만 변경 |
| 공유 모듈 재설계 | 다른 active 제안이 원본·배포 범위·패키징을 다룸 | 이 제안은 원본 이동·lib 생성 규칙을 바꾸지 않음. 이미 반영된 공통 판정이 있으면 재사용 |
| 연결 해제 Action | Contracted: repository-disconnection.md와 기존 시험은 혼합 파일의 두 inline mutation을 명시 | 두 mutation 전용 파일과 ordinary loader를 분리하는 변경을 Phase SCPACTION에서 문서·시험과 함께 반영 |
| loader 공개 범위 | Observed: 현재 index.server.ts는 mutation 둘과 배너만 공개하며 loader는 slice 내부 사용 | loader를 새 public API나 원격 Action으로 추가하지 않음 |
| CI OS 범위 | Contracted: OS 의존 검사는 Windows·macOS 각각 필요. active CI 제안과 workflow가 겹침 | 기존 두 OS job에 모델 없는 서버 검사를 연결하고 coverage 표·path filter를 함께 조정 |

## Scope

포함: H1~H5의 국소 수정, 해당 소비자와 회귀 검사, H2의 좁은 Action 파일 분리,
H4의 세 리허설 연결과 OS별 검사, 관련 현행 문서 갱신.

제외: scripts 전체 재배치, 범용 CLI/프로세스 프레임워크, 제품 정책 변경, DB migration,
새 인증 방식, 플러그인 런타임·배포 사본 수정, 모델 실행 방식 변경, 기존 조사 기록의
일괄 개정, 자동 커밋·PR·병합·출시·운영 DB/API 호출.

H4의 주소 분리는 smoke 서버 간 격리를 보장한다. Claude의 전역 설치·로그인·MCP 설정이나
공유 DB를 사용하는 전체 인수 작업을 병렬 실행해도 된다는 의미는 아니다.

## Requirements and Constraints

### REQ-SCP-001: 독립적인 출하 파일 판정

WHEN 동일한 파일 목록을 버전 검사와 두 OS packager에 제공하면, 세 소비자는 동일한
출하 파일 집합을 선택해야 한다(SHALL). 버전 판정 함수는 Windows·macOS 실행 코드나
native 보조 파일을 로드하지 않고 실행할 수 있어야 한다(SHALL).

### REQ-SCP-002: Action 의미에 따른 식별

WHEN fresh build의 Action을 파일 경로·export 이름·실행 runtime으로 선택하면, 리허설은
그 함수의 현재 Action ID를 사용해야 한다(SHALL). 함수 순서 변경은 선택의 의미를 바꾸면
안 된다(SHALL NOT). 대상 누락·모호함·잘못된 manifest는 요청 전에 실패해야 한다(SHALL).

### REQ-SCP-003: 연결 해제·재연결 경계 보존

WHEN 연결 해제 또는 재연결을 요청하면, 기존 웹 세션 인증·입력 검증·소유자 주입·결과·
재검증 경로를 유지해야 한다(SHALL). 원격 노출은 두 mutation만 허용하고 ordinary loader와
테스트 helper는 노출하지 않아야 한다(SHALL NOT).

### REQ-SCP-004: 명시적인 도구 의존성

WHEN 프로젝트의 선언된 개발 의존성을 깨끗하게 설치하면, 직접 사용하는 esbuild와 pg는
소비 스크립트에서 해석·사용 가능해야 한다(SHALL). 다른 도구의 의존성이 우연히 최상위에
배치된다는 조건을 요구하면 안 된다(SHALL NOT).

### REQ-SCP-005: 자신이 시작한 서버만 준비 완료로 인정

WHEN smoke 서버 시작이 성공을 반환하면, 반환 주소는 해당 실행의 자식이 실제로 listen한
loopback 주소여야 하며 HTTP 준비 검사도 통과해야 한다(SHALL). 기존 서버의 200 응답만으로
성공하면 안 된다(SHALL NOT). 포트 경합·자식 종료·잘못된 소유 확인은 시작 실패여야 한다(SHALL).

### REQ-SCP-006: 서버 자원의 종료와 실패 전달

IF 시작 실패·취소·시간 초과가 발생하거나 소유자가 서버 종료를 요청하면, helper는 자신이
만든 자식·listener·타이머·로그 descriptor를 정리하고 종료 확인 또는 정리 실패를 반환해야
한다(SHALL). 정리 실패를 성공으로 보고하거나 다른 실행의 서버를 종료하면 안 된다(SHALL NOT).

### REQ-SCP-007: 실행별 게이트 기록 산출물

WHEN gate-record가 성공하면, 출력 파일은 해당 호출이 새로 소유한 디렉터리에 그 호출의
결과만 포함해야 한다(SHALL). IF 출력 경로가 이미 존재하면, 기존 바이트를 바꾸지 않고
0이 아닌 코드로 거부해야 한다(SHALL). 작성 실패 뒤에는 후속 이슈 작업이 실행되면 안 된다(SHALL NOT).

### INV-SCP-001: 제품 의미와 외부 데이터 보존

플랜·토큰·프로젝트 소유권·연결 상태·파이프라인 판정·DB transaction은 기존 서버 서비스가
계속 소유한다. 이 작업으로 요청의 권한이나 결과를 바꾸지 않는다. 테스트 데이터와 임시
자원 외에 새로운 업무 데이터 쓰기·프로세스 종료를 추가하지 않는다.
기존 client-init/pipeline smoke가 CI 또는 명시적 `--allow-machine-changes` 조건에서 수행하는
HARNESS_SERVER 저장·사용자 범위 MCP 등록은 보존 대상이다. 새 origin을 이 기존 경로에
전달하되 허용 조건을 넓히거나 사용자 설정을 임의 초기화·삭제하지 않는다.
정합성 검토 자체는 그 전역 설정 경로를 실행하지 않고 임시 환경만 사용한다.

### CON-SCP-001: 한정된 쓰기와 변경 영향

후속 구현 요청은 아래 Affected Files의 소스·테스트·의존성·CI·문서 수정을 허용한다.
구현은 최신 dev에서 기존 작업을 보존한 격리 worktree로 시작한다. 관련 제안의 선행 변경을
확인하며 삭제된·이동된 모듈을 옛 경로로 다시 만들지 않는다.

### CON-SCP-002: 프레임워크와 설치 호환성

생성 Action 번호·stdout 문구를 새 식별 계약으로 만들지 않는다. H2는 같은 FSD slice의
공개 이름을 유지한다. H4는 기존 production `next start` 실행을 유지하며 앱에 시험용
HTTP route를 추가하지 않는다. 새 runtime 의존성을 plugin에 넣지 않는다.

### CON-SCP-003: 검증 근거와 환경

새 검사는 기존 node:test와 발견 패턴을 사용한다. DB는 검증된 격리 TEST_DATABASE_URL만
사용한다. 모델 없는 대역 검사·실제 Next·실제 DB·OS 인수를 구분하며 skip과 미실행을
통과로 세지 않는다. CI의 OS 범위 변경은 coverage 표와 함께 반영한다.

### CON-SCP-004: 기존 출력·보안 경계 보존

사용자 token·private template·원문 전사를 새 로그나 공개 결과에 추가하지 않는다.
게이트의 JSON schema·허용 필드·이슈 제목·정상 내용은 유지한다. 기존 gate 실행·출시 승인
규칙을 이 제안으로 우회하지 않는다.

## Proposal

아래 `신규` 표시는 설계 당시 추가 대상으로 지정한 파일이다. 구현 상태와 실행 증거는 Implementation Record를 따른다.

### H1 — 출하 파일 판정의 단일 소유자

신규 `scripts/lib/plugin-payload.mjs`에 부수효과 없는 `isShippedPluginFile(name)`을 둔다.
현재의 `plugin/` prefix, `templates/`·`evals/`·`.test.mjs` 제외 의미를 그대로 옮긴다.
버전 검사와 두 packager가 이 모듈을 직접 import하고 기존 사본·Windows 경유 import를
제거한다. 해당 파일은 node:fs, native runtime, verifier package를 import하지 않는다.

두 OS의 inventory·권한·런처 변환·패키징은 각 모듈에 유지한다. `plugin/lib`의 실제
파일 포함 여부를 바꾸는 작업은 공유 모듈 제안의 소유 범위다. 이 필터를 옮기면서
공유 모듈의 새 폴더·manifest·export 정책을 선행 구현하지 않는다.

### H3 — 이미 사용하는 라이브러리를 직접 선언

esbuild·pg를 root `devDependencies`에 직접 선언한다. 구현 시작 때 lockfile의 현재
resolved version을 사용해 불필요한 업그레이드를 피한다. 관측 값은 각각 0.28.2와
8.23.0이며, 그때까지 버전이 변경됐으면 이 숫자로 되돌리지 않는다.

일반 npm lock 갱신과 깨끗한 `npm ci`로 해석·호출을 확인한다. unrelated dependency의
대량 변경, npm 교체 또는 install strategy 전환은 포함하지 않는다. esbuild는 작은
fixture를 번들링하고 pg는 클래스 로드·인스턴스 생성까지 DB 연결 없이 확인할 수 있다.

### H5 — 새 출력 디렉터리와 후속 소비의 연결

`gate-record.mjs:main`은 입력·summary·댓글·이슈 내용 계산을 먼저 끝낸 뒤,
기존 parent 아래 새 `--out` 디렉터리를 비재귀 mkdir로 배타적으로 생성한다.
기존 directory·file·symlink는 모두 거부하고 내부를 정리하거나 덮어쓰지 않는다.
동시 호출은 mkdir를 획득한 한 호출만 쓴다. parent는 호출자가 준비한다.

출력 파일은 `wx`로 작성한다. finding이 있을 때만 그 파일들을 쓰고 `comment.md`를
마지막에 쓴다. 모든 쓰기가 끝났을 때만 0을 반환한다. 중간 IO 실패는 1이며 부분 디렉터리는
진단을 위해 남기고 같은 경로 재시도를 거부한다. 파일 존재만으로 성공을 판정하지 않는다.

`.github/actions/gate-record/action.yml`은 호출마다 `mktemp -d`로 작업 parent를 만들고,
open-issues 목록과 `result` 경로를 그 안에 둔다. Node 도구에는 아직 없는 `result`를
넘긴다. 성공한 생성 단계의 output으로 결과 경로를 후속 단계에 전달한다.
이슈 단계에 `always()`를 추가하지 않고 생성 실패 시 그대로 중단한다.
같은 job에서 composite action을 다시 호출해도 이전 파일을 읽지 않는다.

새 준비 step의 id는 `workspace`, output은 `parent`로 한다. 기존 목록 단계는 그 parent의
`open-issues.ndjson`에 쓰고, 생성 단계의 id는 `files`, 성공 output은 `directory`로 한다.
목록·생성 단계의 `GATE_WORK_DIR` env는 `steps.workspace.outputs.parent`에 바인딩한다.
생성 단계는 `--out "$GATE_WORK_DIR/result"`로 실행한 Node 명령의 종료 코드가 0인 뒤에만
directory를 GITHUB_OUTPUT에 기록한다. 두 후속 쓰기 단계는
`RECORD_DIRECTORY` env를 `steps.files.outputs.directory`에 바인딩해 사용하고 고정 경로
fallback을 두지 않는다. 필요한 경로 output이 비어 있으면 gh 쓰기 전에 실패한다.
이전 단계 실패를 무시하는 `continue-on-error`도 추가하지 않는다.

### H2 — manifest 해석과 안정된 mutation export

**공통 reader.** 기존 `tests/server/fixtures/action-manifest.ts`를 확장한다.
`manifestEntries()`·`assertActions()`의 기존 소비는 유지하고, ID와 runtime을 보존한
registry 읽기 및 `(sourcePath, exportName, runtime)`으로 유일한 ID를 얻는 기능을 추가한다.
경로는 slash를 정규화하고 전체 상대 경로의 경계를 비교한다. basename만으로 선택하지 않는다.
node와 edge를 명시적으로 구분하며 HTTP 리허설은 자신이 사용하는 runtime을 지정한다.
누락·중복·잘못된 worker/entry는 오류로 반환하고 첫 후보를 임의 선택하지 않는다.
registry는 실행별로 fresh build에서 읽고 프로세스 전역 캐시로 재사용하지 않는다.

새 `readActionRegistry(manifestPath)`는 명시한 파일을 읽어 `id`, `runtime`(`node` 또는
`edge`), 정규화된 `filename`, `exportedName`, 검증한 `workers`를 보존한 entries를 반환한다.
`resolveActionId(entries, { sourcePath, exportName, runtime })`는 정확히 한 entry만 허용한다.
기존 두 함수는 이 reader를 사용하되 인자·반환값의 기존 필드를 유지한다. 기존 assertion
helper를 새 strict resolver로 무조건 바꿔 node/edge 전체 관찰을 줄이지 않는다.

서로 다른 파일의 같은 export를 합치거나 suffix가 겹치는 경로를 같은 것으로 취급하지 않는다.
sourcePath는 저장소 상대 경로이며 entry의 절대 경로와 비교할 때도 전체 경로 segment의
경계가 일치해야 한다. runtime은 호출부가 선택한다. 해당 runtime이 비어 있거나 요청한
Action을 찾지 못하면 다른 runtime·생성 번호로 fallback하지 않는다.

여섯 리허설의 중복 JSON 해석·Action lookup을 연결한다: `rehearse-backlog-pipeline.ts`,
`rehearse-multiple-pipelines.ts`, `rehearse-account-usage-and-tokens.ts`,
`rehearse-src-clean-code.ts`, `rehearse-acceptance-failure.ts`,
`rehearse-repository-disconnection.ts`. 시나리오가 요구하는 source/export 목록과
금지한 Action의 비노출 검사는 각 소비자에 유지한다. node/edge ID 집합을 관찰하는
기존 프록시 검사는 그 범위를 축소하지 않는다. `rehearse-web-http-contracts.ts`의
Flight decoder와 실제 route loader 검증은 이 reader 변경으로 대체하지 않는다.

| 소비 리허설 | 현재 lookup | 전환 후 입력·보존 검사 |
| --- | --- | --- |
| `rehearse-backlog-pipeline.ts` | `readActionIds`와 `actionSources` | `actionSources`의 세 source/export 쌍과 node runtime; 유일한 Action entry·비어 있지 않은 workers·각 worker 구조 검증 보존 |
| `rehearse-multiple-pipelines.ts` | 이름과 features prefix로 7개 선택 | `savePipeline`은 edit-pipeline/api/edit-pipeline.server.ts, 네 설정 Action은 pipeline-settings.server.ts, `proposeItem`은 propose-item/api/propose-item.server.ts, `changeItemPipeline`은 change-item-pipeline/api/change-item-pipeline.server.ts. 모두 `src/fsd/features/` 아래 전체 경로·node runtime |
| `rehearse-account-usage-and-tokens.ts` | 이름과 manage-token 정규식 | 프로젝트/owner token Action은 manage-token/api/manage-token.server.ts, user token Action은 manage-user-token/api/manage-user-token.server.ts의 전체 경로·node runtime |
| `rehearse-src-clean-code.ts` | node+edge에서 `humanTransition`, `savePipeline` ID 집합 | 두 원본 파일과 export로 registry를 선택하되 node+edge 집합·프록시의 잘못된 Action 거부 범위 보존 |
| `rehearse-acceptance-failure.ts` | `retryAcceptance` lookup | review-gate/api/review-gate.server.ts의 전체 경로·node runtime |
| `rehearse-repository-disconnection.ts` | 같은 파일의 생성 번호 0/1 | 신규 project-connection-actions.server.ts의 두 명시적 export·node runtime |

이 표의 source/export 목록과 기존 비노출 검사는 소비자가 소유한다. reader에는 제품별
Action 목록을 넣지 않는다. 토큰의 세 사용자 종류나 7개 pipeline Action을 대표 한 개로
줄여 검증하지 않는다.

**기존 검증 실패의 최소 정비.** 기준 소스의 `test:acceptance:backlog-pipeline`는 마지막
pipeline 페이지 검사에서 현재 화면에 없는 `Automatic scouting` 문구를 요구해 실패했다
(`rehearse-backlog-pipeline.ts:428`). 현재 화면은 `Default selection:`, `Run rules`,
`All pipelines`를 제공한다. 임시 사본에서 이 단언만 현재 표시 내용으로 바꾸면 같은
fresh build·DB의 전체 HTTP 리허설이 통과했고, 사본은 원복했다.
Phase SCPACTION에서 이 한 단언을 바로잡되 앞선 쓰기·권한·경합·응답 유실·이력 검사와
뒤의 Plan/Implement/Accept 확인은 유지한다. 시험을 통과시키려고 제품 UI를 바꾸지 않는다.

**연결 해제 feature.** 신규
`src/fsd/features/manage-project-connection/api/project-connection-actions.server.ts`에
module-level `"use server"`와 `disconnectRepository`, `reconnectRepository` 두 async export만 둔다.
두 함수의 본문·시그니처·세션 인증·입력 schema·재검증은 보존한다.
기존 `manage-project-connection.server.ts`는 `server-only`와 ordinary loader만 유지한다.
`index.server.ts`는 새 파일에서 기존 mutation 이름을 재수출한다. slice 내부 배너는
loader와 mutation을 각각의 소유 파일에서 import한다. loader는 public API에 추가하지 않는다.

이 방식은 기존 `review-gate.server.ts` 등의 module-level Action 패턴을 따른다.
리허설은 새 파일의 명시적 export 이름을 조회해 생성 번호를 제거한다. 기존의
inline 배치를 고정한 시험과 repository-disconnection.md의 해당 설명을 같은 변경에서
갱신하되, **원격 mutation 두 개·ordinary loader 비노출·세션 소유자 주입** 검증은 유지한다.

새 Action 파일의 의존성은 `revalidatePath`, 두 route builder, `requireUser`,
`disconnectProject`·`reconnectProject`의 기존 `@/server/projects/api.server` 공개 경로,
`inputSchema`, `reconnectCapReason`와 Action/State 타입이다. loader 파일에는
`server-only`, `loadProjectConnection as loadConnection`, Target/Summary 타입만 남긴다.
새 파일에서 옛 혼합 adapter를 다시 import하지 않으며, 옛 파일에서 mutation을 호환 재수출하지 않는다.
외부 소비자는 기존 `index.server.ts`를 계속 사용한다.

인증·재실행 의미도 이동 후 유지한다. 무세션은 입력 검증보다 먼저 거부하고, userId는
세션에서만 가져온다. 동일한 최신 version의 반복은 기존 서비스의 no-op, 오래된 version은
stale이다. 다른 두 호출자가 같은 소유자의 선택 집합을 바꾸는 경쟁은 기존 Serializable
transaction·User 잠금·CAS가 계속 처리한다. 실패한 transaction의 일부 상태·token·event를
Action wrapper에서 성공으로 바꾸지 않는다. 응답 유실 뒤에는 기존 refresh/재확인 흐름을 유지한다.

공개 TypeScript 함수 이름과 제품 의미는 보존하지만 Next가 생성하는 wire Action ID는
새 build에서 달라질 수 있다. 구 build의 ID를 고정·재등록하지 않는다. fresh build와
배포 후 새 페이지로 검증하며, 오래 열린 페이지의 재시도는 기존 Next 갱신 동작을 따른다.

### H4 — 서버 소유 확인과 실행별 주소

신규 `scripts/rehearsals/smoke-server.mjs`가 서버 시작·준비·종료를 소유한다.
`startSmokeServer({ databaseUrl, log, env, signal, port? })`는
`{ child, origin, stop }`을 반환한다. 별도 port가 없으면 loopback의 임시 listener로
빈 포트 후보를 얻고 닫은 후 그 포트로 production Next CLI를 시작한다.
예약 해제와 자식 bind 사이의 경쟁은 성공으로 숨기지 않고 시작 실패로 처리한다.
후보 선택만으로 포트 소유를 증명했다고 판단하지 않는다.

helper의 production root는 자기 모듈 위치로 계산한다. CLI에서 임의 실행 명령을 받지 않는다.
시험은 두 번째 내부 dependency 인자의 자식 launch 경계만 대체할 수 있게 해, 실제 Node
fixture 자식·IPC·HTTP를 사용한다. 세 production caller는 첫 인자만 사용한다.
시험을 위해 Next 설치 파일을 덮어쓰거나 공통 helper 자체를 VM 가짜 구현으로 바꾸지 않는다.

**소유 확인.** 신규 `smoke-server-listener.cjs`를 해당 자식의 Node `--require`로 로드한다.
이 preload는 http.Server의 listen 호출에서 실제 `listening` 이벤트를 관찰해,
예상 loopback 주소·포트로 bind됐을 때 IPC로 버전 1 메시지를 한 번 보낸다.
메시지는 version, event, 실행별 runId, pid, host, port만 담는다. runId는 parent가 생성해
이 자식의 환경에만 넣으며 인증 credential로 쓰지 않는다.

메시지는 `{ version: 1, event: "stagekeeper-smoke-listening", runId, pid, host, port }`다.
parent가 fresh UUID를 `STAGEKEEPER_SMOKE_RUN_ID`, 선택한 정수 포트를
`STAGEKEEPER_SMOKE_PORT`로 자식 환경에 덮어써 전달한다. 이는 내부 일회성 값이며
`.env.example`·사용자 설정·설치 bundle의 공개 옵션으로 추가하지 않는다.
parent PID도 `STAGEKEEPER_SMOKE_PARENT_PID`로 전달한다. Node fork는 execArgv와 환경을
상속할 수 있으므로 preload가 Next의 후손 프로세스에서 다시 로드되는 경우까지 처리한다.
유효한 parent PID가 있고 현재 process.ppid가 다르면 이 preload는 아무 변경·메시지도 없이
끝난다. 직접 자식에서는 runId·port·parent PID와 IPC 채널이 없거나 유효하지 않으면
prototype을 변경하기 전에 실패한다. 후손에게 root helper의 소유 증명을 대신 보내게 하지 않는다.
`host`는 `127.0.0.1`, `pid`는 직접 소유한 child.pid와 같아야 한다. 이 event의 잘못된 shape,
버전·runId·pid·host·port 불일치는 거부한다. 관련 없는 IPC 메시지를 성공 신호로 세지 않는다.
preload 경로는 helper의 import.meta.url에서 얻은 절대 파일 경로를 Node 인자로 넘긴다.

listen wrapper는 원래 인자·this·반환값·예외를 그대로 전달하고, 예상 listener를
확인한 후 자신의 wrapper를 해제한다. app의 HTTP handler나 응답을 바꾸지 않는다.
실제 host/port를 확인할 수 없으면 성공 메시지를 보내지 않는다. 이 instrumentation은
공통 runner나 plugin 런타임으로 확장하지 않는다.

parent는 `stdio`의 별도 IPC 채널에서 자신의 child.pid·runId·host·port가 일치하는 메시지를
받은 뒤에만 `/login`을 요청한다. `spawn error`, `exit`·`close`, IPC 오류를 함께 관찰한다.
잘못된 소유 메시지·bind 실패·전체 120초 초과는 실패다. HTTP 요청에도 남은 시간 안의
timeout을 적용하고, HTTP 200 후에도 자식 종료 여부를 확인한 뒤 handle을 반환한다.
Next의 로그 문구나 기존 서버의 200 응답을 소유 확인으로 사용하지 않는다.

`signal`은 handle을 반환하기 전 시작 작업의 취소를 담당한다. 이미 취소됐으면 자식을
만들지 않고, 시작 중 취소됐으면 helper가 자신이 만든 자식을 정리한 뒤 거부한다.
호출자는 실행별 취소 신호와 SIGINT/SIGTERM 처리를 연결하고 끝날 때 listener를 해제한다.
기존 Codex 중단 처리는 이 연결에 통합한다. 준비 완료 이후에는 기존 runner 종료·소유권
확인 순서를 거친 caller가 stop을 요청하며, signal만으로 사용 중인 서버를 먼저 죽이지 않는다.

**환경 전달.** 전역 PORT·ORIGIN을 제거한다. 선택 주소를 AUTH_URL·HARNESS_PUBLIC_URL에
넣어 자식을 시작하고, 반환 origin을 HARNESS_SERVER·Smoke·dry-run 검사·MCP 등록·
`persistServer`에 명시적으로 전달한다. client-init, pipeline, Codex macOS 세 호출부는
서버가 준비된 뒤 그 주소로 helper 환경을 완성한다. 기존 token 제거·DB 선택·
사용자 직접 실행 조건은 보존한다. CLI에 임의 실행 명령 옵션을 추가하지 않는다.

**종료.** stop은 idempotent promise다. 성공/실패/취소 경로에서 소유 자식의 실제 종료를
기다리고 listener·timer·IPC·parent 로그 descriptor를 정리한다. 정상 종료 요청 후 5초,
직접 소유한 자식에 대한 강제 종료 후 추가 5초를 한도로 두고 미종료는 오류로 반환한다.
포트 점유자를 PID 탐색으로 죽이거나 이름으로 프로세스를 일괄 종료하지 않는다.

caller는 서버 정리 오류를 최종 실패에 반영한다. pipeline의 기존 cleanup wrapper가
로그만 남기는 경로도 서버 정리 실패만큼은 `server-cleanup`으로 결과에 반영한다.
Codex의 `runnerStopped` 확인 전 서버·fixture를 보존하는 기존 조건은 유지한다.
모델 실행 소유권을 확인하지 못한 상태에서 정리를 강행하도록 바꾸지 않는다.

`stop`은 종료 요청만 보낸 상태와 `exit`/`close`를 확인한 상태를 구별한다. 시작 실패 시
handle이 caller에 전달되지 않았더라도 helper가 소유 자원을 정리한다. 자식의 종료를
확인하지 못하면 fixture user 삭제도 보류하고 실패 결과에 남긴다. client-init은
`Run.failure`, pipeline은 기존 failure 필드, Codex는 `summary.result/error`에
`server-start` 또는 `server-cleanup`을 반영한다. 기존 실패 사유가 있으면 보존하고 정리
실패를 별도로 기록한다. finally 안의 예외 때문에 summary 저장·listener 정리가 생략되지 않게 한다.

| 상태·사건 | 소유자·결과 | 복구·정리 |
| --- | --- | --- |
| 시작 전 취소/잘못된 인자 | parent, 자식 생성 없음 | 기존 listener/파일 무변경 |
| 후보 포트 선택 → spawn | helper, AUTH_URL·HARNESS_PUBLIC_URL과 expected IPC를 같은 주소로 생성 | 경쟁으로 bind 실패하면 새 실행으로 재시도 |
| 일치하는 listen IPC → HTTP 200 | helper, 자식 종료 여부까지 확인한 뒤 handle 반환 | 미래의 생존을 보장하는 상태로 해석하지 않음 |
| spawn/IPC/HTTP 실패·시작 중 취소 | helper, 시작 실패 | 소유 자식·FD·타이머 정리, 타인 서버에는 HTTP 요청·signal 없음 |
| 준비 완료 후 중단 | caller, 기존 runner 중단 확인을 먼저 수행 | 확인된 소유권 범위에서 handle.stop 실행 |
| 반복 stop | 같은 종료 promise | 중복 kill·listener 등록 없음 |
| 종료 미확인 | caller, 최종 실패 | fixture 보존 및 진단, 성공이나 자동 재사용 금지 |

## Affected Files

| 영역 | 생성·수정 대상과 책임 |
| --- | --- |
| H1 공통 판정 | 신규 `scripts/lib/plugin-payload.mjs`, `scripts/lib/plugin-payload.test.mjs`; 기존 `scripts/checks/verify-plugin-version.mjs`, `scripts/checks/verify-plugin-version.test.mjs`, `scripts/windows/package-windows-plugin.mjs`, `scripts/windows/package-windows-plugin.test.mjs`, `scripts/macos/package-plugin.mjs`, `scripts/macos/package-plugin.test.mjs` |
| H3 직접 의존성 | `package.json`, `package-lock.json` |
| H5 산출물 | `scripts/rehearsals/gate-record.mjs`, `scripts/rehearsals/gate-record.test.mjs`, `.github/actions/gate-record/action.yml` |
| H2 공통 reader | `tests/server/fixtures/action-manifest.ts`; 신규 `tests/server/action-manifest.test.ts`; 위에 열거한 여섯 리허설 |
| H2 feature 경계 | 신규 `api/project-connection-actions.server.ts`; 기존 `api/manage-project-connection.server.ts`, `index.server.ts`, `ui/disconnected-project-banner.tsx` — 모두 기존 manage-project-connection slice 안 |
| H2 계약 검증 | `tests/server/project-connection-bindings.test.ts`; 공통 helper의 기존 소비 시험은 필요할 때만 호환 수정하며 비노출 검사를 약화하지 않음 |
| H4 프로세스 | 신규 `scripts/rehearsals/smoke-server.mjs`, `scripts/rehearsals/smoke-server-listener.cjs`, `scripts/rehearsals/smoke-server.test.mjs`; 기존 `scripts/rehearsals/rehearse-client-init-smoke.ts`, `scripts/rehearsals/rehearse-client-init-smoke.test.ts`, `scripts/rehearsals/rehearse-pipeline-smoke.ts`, `scripts/rehearsals/rehearse-pipeline-smoke.test.ts`, `scripts/rehearsals/rehearse-codex-macos.mjs`, `scripts/rehearsals/rehearse-codex-macos.test.mjs`, `scripts/rehearsals/pipeline-smoke-steps.test.mjs` |
| 문서·CI | `docs/architecture/verification.md`, `docs/architecture/repository-disconnection.md`, 이 제안서; `.github/workflows/macos-runtime-contracts.yml`, `.github/workflows/windows-role-runtime.yml`, `.github/workflows/client-init-smoke.yml`; `AGENTS.md`의 기존 pipeline-smoke 변경 감지 목록에 신규 helper 두 경로 추가만 허용 |

위 표 밖의 제품 서비스·DB·plugin 파일은 변경하지 않는다. source 이동으로 추가 파일이
필요해지면 먼저 해당 필요성과 허용 범위를 이 문서에 반영한다. 기존 조사서에는 후속
구현 시 추적 링크를 남길 수 있지만, 과거 관측을 새 구현 기준으로 덮어쓰지 않는다.

정합성 검토에서 구현·계약의 기존 수정 대상 35개와 신규 목적지 7개를 열거했다
(이 제안서 자체는 제외). 신규 파일의 parent는 모두 존재하며 현재 충돌 파일은 없다.
실행 시작 시 같은 목록을 다시 확인한다. 실제 consumer가 추가됐으면 그 소비자까지
전환 목록을 갱신하고 확인한 수와 결과를 남긴다.

### 변경하지 않는 소비자·보존 경계

manifest helper의 호환성 확인 대상은 `tests/server/` 아래 다음 아홉 파일이다:
`project-guard.test.ts`, `pipeline-settings.test.ts`, `frontend-page-data.test.ts`,
`mutation-identifiers.test.ts`, `pipeline-change.test.ts`, `github-action-manifest.test.ts`,
`project-page-loaders.test.ts`, `pipeline-save.test.ts`, `inbox-card-boundary.test.ts`.
`scripts/rehearsals/rehearse-web-http-contracts.ts`도 기존 `manifestEntries()` 소비를 유지한다.
이 열 파일의 기대 동작을 바꿔 새 reader를 통과시키지 않는다.
`scripts/rehearsals/pipeline-smoke-steps.mjs:smokeTriggerPaths`의 목록 파싱 방식도 유지한다.
그 함수의 기존 시험에서 새 helper 경로를 검증하며 parser 자체를 바꿀 필요는 없다.

인증·제품 의미의 보존 대상은 같은 feature의 `model/project-connection-input.ts`,
`model/project-connection-state.ts`, `ui/project-connection-control.tsx`,
`src/fsd/pages/project-list/ui/project-list-page.tsx`, `src/server/projects/api.server.ts`,
`src/server/projects/connection.ts`, `src/server/projects/connection-service.ts`와
`tests/server/integration/project-connection.test.ts`다. Action 이동은 facade의 두 이름을
유지하므로 프로젝트 목록의 import는 바꾸지 않는다.
백로그 시험의 기대 화면을 확인할 때만
`src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx`와
`src/fsd/features/edit-pipeline/ui/pipeline-list.tsx`를 읽으며 두 제품 파일은 수정하지 않는다.

### 핵심 심볼의 이동과 검증 목적지

| 심볼·값 | 현재 소유·소비 | 변경 후 소유·소비 | 확인 |
| --- | --- | --- | --- |
| `isShippedPluginFile`, macOS의 `isShipped` 사본 | Windows packager → version checker; macOS local 사본 | `scripts/lib/plugin-payload.mjs` → 세 소비자 direct import | VFY-SCP-01, 옛 predicate 사본·Windows 경유 import 부재 |
| `manifestEntries`, `assertActions` | tests/server/fixtures/action-manifest.ts → 열 기존 소비자 | 같은 파일·기존 호출 형태 유지 | VFY-SCP-02, 기존 필드·node/edge 관찰 유지 |
| `readActionRegistry`, `resolveActionId` | 현재 여섯 리허설의 local parser/lookup | 위 fixture helper의 신규 API → 여섯 리허설 | VFY-SCP-02, 원본 JSON 해석·생성 번호 lookup 제거 |
| 두 connection mutation | 혼합 adapter → index.server·배너 | 신규 actions 파일 → 같은 facade 이름과 배너의 direct import | VFY-SCP-03, 원래 adapter의 mutation 정의·재수출 부재 |
| `loadProjectConnection` | 혼합 adapter → 배너 | 기존 adapter에 잔류 → 배너 | VFY-SCP-03, 기존/신규 어느 Action registry에도 loader 부재 |
| `PORT`, `ORIGIN`, `startServer`, `stopServer` | client-init 파일 → 세 리허설 | `smoke-server.mjs:startSmokeServer`와 handle → 세 리허설 | VFY-SCP-05·06, 고정 45438·옛 서버 helper import 제거 |
| 승격 시 pipeline-smoke 변경 감지 | AGENTS.md의 기존 `git diff` 목록에 옛 helper 소유 파일 포함 | 기존 목록 보존 + 신규 두 helper 파일의 정확한 경로 | VFY-SCP-06, 각 신규 helper만 바뀌어도 기존 gate 조건이 성립 |
| gate 결과 경로 | 고정 RUNNER_TEMP/gate-record → 세 소비 단계 | 실행별 parent/result → 성공 단계 output | VFY-SCP-07, 고정 경로 재사용 부재 |

## Safety Analysis

| 위험 경계 | 보존·거부 기준 |
| --- | --- |
| Action 노출 | 두 mutation만 노출. loader는 server-only이며 manifest에 없어야 함. 인증 선행·위조 userId 무시·거부 시 무변경 확인 |
| API·데이터 | 함수 시그니처, 결과 상태, revalidate 경로, 서버 transaction·토큰 폐기·이벤트를 보존. migration 없음 |
| 프로세스·취소 | 자식 소유 증명 뒤 HTTP 확인. 실패·취소 시 소유 자식만 종료. 다른 listener와 모델 runner 소유권 보존 |
| 파일·재실행 | 새 디렉터리 생성 권한을 획득한 호출만 씀. 기존·동시 호출의 파일 보존. IO 실패는 소비 단계로 전달 |
| 공급 의존성 | 현재 resolved version을 직접 선언하며 무관한 upgrade·plugin 배포 의존 추가 없음 |
| 출시·설치 | 출하되는 plugin 바이트를 바꾸지 않음. H1은 파일 판정 의미 보존. 실제 출시 단계는 기존 gate 규칙을 별도로 따름 |

새 상태는 임시 server handle과 gate 작업 디렉터리뿐이다. 실행 후 재개할 영구 세션·DB
상태를 추가하지 않는다. 서버 재시도는 새 실행 handle로, 게이트 재시도는 새 디렉터리로
시작한다. 실제 모델 사용·전역 클라이언트 설정 변경은 기존 명시적 실행 조건을 유지한다.

## Approval

2026-11-16 사용자가 “해당 문서를 바탕으로 실제 수정을 진행하라”고 요청하여 세 Phase의
구현과 격리 로컬 검증을 승인했다. 원래 작업 공간의 다른 변경을 보존하기 위해 최신
`origin/dev`인 `51111ed3300ee558788ab2829169b3f66253b36f`에서 별도 worktree를 생성했다.
공유 모듈 ARCH PR #347이 이 기준에 포함되어 있으나 MIGRATE는 진행하지 않는다.
커밋·PR·병합·출시와 실제 모델·전역 설치 인수는 이 실행에 포함하지 않는다.

## Execution Plan

### Phase SCPTOOLS: 제품 실행과 분리된 도구 경계 정리

- satisfies: REQ-SCP-001, REQ-SCP-004, REQ-SCP-007
- preserves: INV-SCP-001
- governed-by: CON-SCP-001, CON-SCP-003, CON-SCP-004
- verified-by: VFY-SCP-01, VFY-SCP-04, VFY-SCP-07

선행 Phase는 없다. 세 국소 변경은 제품 Action·프로세스 실행을 바꾸지 않고 각각 검증할
수 있으므로 먼저 완료한다. 진입 시 최신 소스와 관련 공유 모듈 제안의 반영 여부를 확인한다.
종료 시 세 요구사항과 기존 정상 출력이 검증돼야 한다. 이후 Phase 없이도 유효한 상태다.

#### TASK-SCPTOOLS-01: 출하 predicate 분리

- satisfies: REQ-SCP-001
- verified-by: VFY-SCP-01

H1의 신규 공통 모듈을 만들고 세 소비자·기존 시험을 연결한다. 패키징 구현과 출하 집합은
보존한다. 이미 같은 책임의 공통 모듈이 있으면 이중 소유자를 만들지 않고 그 소유자에 합류한다.

#### TASK-SCPTOOLS-02: 직접 의존성 선언

- satisfies: REQ-SCP-004
- verified-by: VFY-SCP-04

H3의 두 개발 의존성과 lock을 함께 갱신한다. 깨끗한 사본에서 현재 소비 경로를 확인하고,
버전이 불필요하게 바뀌면 계속 진행하지 않고 lock 변경 원인을 먼저 확인한다.

#### TASK-SCPTOOLS-03: gate 출력 소유권과 Action 연결

- satisfies: REQ-SCP-007
- verified-by: VFY-SCP-07

H5의 exclusive 디렉터리 생성·파일 쓰기·실패 반환과 composite action의 실행별 경로를
같은 변경에서 연결한다. 기존 JSON·댓글 내용은 유지하며 실제 GitHub 쓰기로 검사하지 않는다.

### Phase SCPACTION: 빌드 정보와 웹 mutation 경계 안정화

- satisfies: REQ-SCP-002, REQ-SCP-003
- preserves: INV-SCP-001
- governed-by: CON-SCP-001, CON-SCP-002, CON-SCP-003
- verified-by: VFY-SCP-02, VFY-SCP-03

SCPTOOLS 이후의 명시적 개발 의존성을 입력으로 사용한다. Action 노출 경계는 도구 변경과
별도로 검증할 필요가 있어 독립 Phase로 둔다. 진입 시 관련 feature·시험·현재 계약을 다시
읽는다. 종료 시 정적 경계뿐 아니라 fresh build와 실제 HTTP·격리 DB 인수를 통과해야 한다.
SCPSERVER가 없어도 기존 리허설 시작 방식으로 검증할 수 있다.

#### TASK-SCPACTION-01: reader·mutation 분리·소비자 전환

- satisfies: REQ-SCP-002, REQ-SCP-003
- verified-by: VFY-SCP-02, VFY-SCP-03

H2 설계의 reader, feature 분리, public API·배너 import, 여섯 리허설을 전환한다.
같은 변경에서 기존 inline 구조 단언을 새 노출 경계에 맞추고 architecture 설명을 갱신한다.
위에 기록한 백로그 시험의 오래된 화면 단언을 먼저 바로잡아 기준 통과를 확보하고,
그다음 reader 전환 전후를 비교한다. 그 외의 기존 실패가 발견되면 원인·범위를 기록하며
이번 변경의 통과로 숨기거나 관계없는 제품 수정을 포함하지 않는다.
계획된 두 mutation 외의 Action이 생기거나 loader가 원격 노출되면 Phase를 완료하지 않는다.

### Phase SCPSERVER: smoke 실행별 서버 소유권과 OS 검증

- satisfies: REQ-SCP-005, REQ-SCP-006
- preserves: INV-SCP-001
- governed-by: CON-SCP-001, CON-SCP-002, CON-SCP-003, CON-SCP-004
- verified-by: VFY-SCP-05, VFY-SCP-06

앞 단계가 끝난 소스·build를 사용한다. 프로세스·IPC·취소와 OS별 동작을 별도 경계에서
검증하기 위해 마지막 Phase로 둔다. 세 caller를 한 번에 전환해 고정 ORIGIN과 새 handle이
혼재하는 중간 상태를 병합하지 않는다. 종료 조건은 모델 없는 두 OS 검사, 실제 Next 시작
확인과 세 caller의 주소·정리 연결 검증이다. 전체 모델 인수와 출시의 승인은 별도다.

#### TASK-SCPSERVER-01: 소유 확인 helper와 세 caller 전환

- satisfies: REQ-SCP-005, REQ-SCP-006
- verified-by: VFY-SCP-05, VFY-SCP-06

H4의 helper·preload·handle을 만들고 환경 전달·MCP 등록·dry-run 비교·종료 처리까지 연결한다.
Run 클래스와 제품 시나리오 전체를 공통 프레임워크로 옮기지 않는다.

#### TASK-SCPSERVER-02: OS·승격 검증 경로와 문서 연결

- satisfies: REQ-SCP-005, REQ-SCP-006
- verified-by: VFY-SCP-05, VFY-SCP-06

기존 `macos-runtime-contracts/contracts`, `windows-role-runtime/native-runtime`의 의존성
설치 뒤에 `node --test scripts/rehearsals/smoke-server.test.mjs`를 추가한다. 두 workflow의
PR path filter에 `scripts/rehearsals/smoke-server*`, 세 consumer와 관련 시험을 포함한다.
verification.md에 이 검사를 OS별로 분류해 두 job과 같은 명령을 연결한다.
새 job·모델 gate는 만들지 않으며 진행 중인 CI OS 제안의 변경을 보존한다.
실제 Next·init 연결 검사도 새 helper 변경을 놓치지 않도록
`.github/workflows/client-init-smoke.yml`의 PR path filter에
`scripts/rehearsals/smoke-server*`를 추가한다. 기존 new-user/update·두 OS matrix와
record job 출력은 그대로 유지한다. 모델 없는 contract 시험의 통과를 이 init gate의
통과로 대신하지 않는다.

승격 검증도 이동한 구현을 계속 감지해야 한다. 신규 helper를 만들고 소비자를 전환하는
같은 변경에서 `AGENTS.md`의 기존 pipeline-smoke용 `git diff --name-only origin/main origin/dev -- ...`
목록에 `scripts/rehearsals/smoke-server.mjs`와 `scripts/rehearsals/smoke-server-listener.cjs`를
각각 추가한다. 기존 항목을 제거하거나 wildcard로 넓히지 않는다.
`scripts/rehearsals/pipeline-smoke-steps.test.mjs`의 trigger-path 시험에는 이 두 정확한 경로의
포함·존재 확인을 추가한다. 새 모델 gate를 만드는 것이 아니라 기존 helper에 적용되던
검증 조건을 새 소유 파일에도 유지하는 변경이다. 실행 순서·재사용·승격 승인·보호 브랜치
정책은 바꾸지 않으며 이 문서 검토 중 gate를 dispatch하지 않는다.

## Verification Plan

아래 VFY는 모두 **계획**이다. 기존 재현 근거와 구현 후 통과 증거를 구분한다.

### VFY-SCP-01: 파일 선택과 로드 독립성

- verifies: REQ-SCP-001
- 종류·위치: 신규 `scripts/lib/plugin-payload.test.mjs`, 기존 버전 검사·두 packager 시험.
- 판정: 포함/제외 경계의 독립 예시가 세 소비자에서 일치한다. 임시 사본에서 native runtime과
  보조 파일 없이 버전 판정이 실행된다. 정상 packager의 inventory·런처 결과는 유지된다.

### VFY-SCP-02: manifest 해석과 Action 식별의 변화 내성

- verifies: REQ-SCP-002
- 종류·위치: 신규 `tests/server/action-manifest.test.ts`, 기존 manifest 소비 시험.
- 판정: Windows/POSIX 경로, node/edge 구분, ID 변경·entry 순서 변경·추가 Action을 처리한다.
  누락·동일 runtime의 복수 일치·잘못된 worker는 요청 전에 거부한다.
  같은 Action entry가 여러 route worker를 가진 정상 사례도 통과해야 한다.
  Action entry의 유일성과 workers 개수를 혼동해 worker 하나만 허용하지 않는다.
  연결 해제 두 함수의 순서만 바꾼 임시 소스를 설치된 Next SWC로 변환해도 명시적 export가
  올바른 함수에 연결된다. 생성 번호를 바꿔 고정하는 테스트로 대체하지 않는다.

### VFY-SCP-03: 웹 권한·원격 노출·실제 연결 동작

- verifies: REQ-SCP-002, REQ-SCP-003
- 종류·위치: `tests/server/project-connection-bindings.test.ts`, 기존 manifest 시험,
  `scripts/rehearsals/rehearse-repository-disconnection.ts`와 변경된 HTTP 리허설.
- 판정: fresh build에서 mutation 두 개의 이름으로 ID를 찾고 loader는 없다. 무세션·위조
  userId·외부 소유자·stale 입력의 거부와 무변경, 소유자의 성공 결과·revalidate 경로를 유지한다.
  실제 HTTP 인수에서 해제는 해제를, 재연결은 재연결을 수행하며 기존 프로젝트·이력·토큰
  보존/폐기 조건을 만족한다. 정적 단언만으로 이 VFY를 완료하지 않는다.
  실제 DB의 동일 최신 version 반복, stale version, 다른 두 호출자의 동일 owner 경쟁과
  transaction 실패 후 rollback은 기존 `tests/server/integration/project-connection.test.ts`
  및 소유권·선택 집합 통합 시험으로 보존을 확인한다. 새 Action은 같은 서비스로 전달해야 한다.

### VFY-SCP-04: 깨끗한 설치의 직접 의존성

- verifies: REQ-SCP-004
- 종류·위치: 격리 checkout의 npm ci, 소비 스크립트와 같은 위치에서 resolve·API 호출.
- 판정: esbuild·pg가 root 선언과 lock에 있고 해석된다. 작은 TS fixture 번들링과 pg 생성자를
  DB 연결 없이 실행한다. 기존 resolved version 유지 여부와 unrelated lock 변경을 대조한다.
  실제 모듈을 사용하며 빈 stub 파일을 배치한 resolution만으로 완료하지 않는다.

### VFY-SCP-05: 소유 자식과 실제 OS의 프로세스 격리

- verifies: REQ-SCP-005, REQ-SCP-006
- 종류·위치: 신규 `scripts/rehearsals/smoke-server.test.mjs`, 두 OS의 기존 runtime job.
- 판정: 실제 Node 자식·socket·IPC로 정상 시작, 동시 두 실행, 외부 서버가 점유한 port,
  잘못된 runId/port, HTTP 전·후 자식 종료, spawn 실패, 요청 시간 초과, 준비 중 취소,
  반복 stop과 종료 거부를 검사한다. 외부 서버의 요청 수는 0이고 프로세스·응답은 보존한다.
  소유 자식과 parent FD·listener·타이머가 종료되거나 정리 실패가 명시적으로 보고돼야 한다.
  경합은 barrier/IPC로 제어하며 성공을 기대하는 임의 sleep으로 맞추지 않는다.
  preload는 원래 listen의 this·인자·반환·동기 예외를 보존하고 종료/성공 후 자신의
  listener·wrapper를 해제하는지 확인한다. 소유 증명 전에는 타인 서버의 `/login`을 호출하지 않는다.
  실제 fork 후손이 preload를 상속해도 listen을 감싸거나 소유 메시지를 보내지 않는 대조군을 포함한다.

### VFY-SCP-06: 실제 Next와 세 consumer의 연결

- verifies: REQ-SCP-005, REQ-SCP-006
- 종류·위치: fresh production build의 Next 시작 검증, 기존 client-init/pipeline/Codex macOS 시험.
- 판정: preload를 통한 IPC 확인 뒤 실제 `/login` 준비가 완료된다. 반환 origin이 각 caller의
  HARNESS_SERVER·AUTH_URL·MCP URL·dry-run 기대값으로 연결되고 종료 실패가 결과에 반영된다.
  실제 Windows/macOS init 인수는 기존 `client-init-smoke`의 new-user/update 경로를 사용한다.
  Codex는 기존 macOS `--phase init`의 모델 없는 경로를 사용한다. 설치·인증 환경이 준비되지
  않았으면 그 부분은 미실행으로 남기고 전체 인수를 통과로 보고하지 않는다.
  주소 전달 확인은 HARNESS_SERVER뿐 아니라 `Smoke.sync`의 자식 인자, `Smoke.dryRun`,
  `firstConnection`의 MCP URL, `persistServer`의 저장·재조회까지 포함한다. 서버 정리 실패에도
  최종 summary가 실패로 저장되며 fixture 보존 조건과 SIGINT/SIGTERM listener 해제가 유지돼야 한다.
  `node --test scripts/rehearsals/pipeline-smoke-steps.test.mjs`로 기존 trigger 계약을 확인한다.
  `smokeTriggerPaths`가 읽은 목록에 기존 경로와 신규 두 helper가 모두 있고 각 경로가 존재해야 한다.
  신규 helper 각각만 변경된 파일 목록도 기존 gate 대상으로 분류되는지 확인한다.
  이 검사는 변경 감지의 정합성을 증명하며 실제 모델 gate의 통과 증거로 사용하지 않는다.

### VFY-SCP-07: 게이트 파일 재사용·경합·부분 실패

- verifies: REQ-SCP-007
- 종류·위치: `scripts/rehearsals/gate-record.test.mjs`, composite action의 경로 전달 대조.
- 판정: 새 경로의 정상 JSON·댓글이 기존과 같다. 실패→성공·다른 커밋·기존 이슈 유무의
  연속 호출에서 같은 경로는 거부되고 기존 파일 hash가 유지된다. 같은 경로 경합은 한 호출만
  성공한다. IO 실패는 1을 반환하고 소비가 실행되지 않는다. 서로 다른 경로를 쓰는 반복
  호출은 파일·이슈 번호를 공유하지 않는다. GitHub 호출은 대역으로 기록하고 외부로 보내지 않는다.

### 실행 명령과 환경

모든 명령은 구현용 격리 checkout의 루트에서 실행한다. 작업 중인 다른 checkout의
`.next`·node_modules·생성 Prisma client를 쓰기 대상으로 공유하지 않는다. 정합성 검토용
기준 사본은 현재 source와 관련 dirty/untracked 문서까지 복사해 별도로 보존한다.
새 문서는 검사 inventory에 포함하며, 삭제된 옛 문서 경로를 강제로 되살리지 않는다.

개발 의존성을 포함한 설치와 Prisma 생성을 먼저 수행한다. baseline의 기존 실패와
개선 후 회귀를 구분하며, 다음 명령의 성공으로 앞 명령의 실패를 가리지 않는다.

```sh
npm ci --include=dev
npm run db:generate
```

다음은 DB·모델·로그인 없이 실행할 수 있는 검사다. 패키지 cache가 필요하면 npm의
`--cache`로 별도 임시 경로를 지정할 수 있다. 네트워크·로컬 port 사용이 제한된 sandbox에서는
권한 범위를 확인하고 같은 명령을 실행 가능한 환경에서 검증한다.

```sh
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:server
npm run build
RDC_CHECK_ACTION_MANIFEST=true SRC_CHECK_INBOX_MANIFEST=true GITHUB_CHECK_ACTION_MANIFEST=true npm run test:server
```

`check`는 lint·타입·scripts 시험을 포함한다. fresh build 다음 manifest 검사를 실행한다.
세 flag는 `.github/workflows/check.yml`의 fresh manifest 검사와 일치한다.
위 인라인 환경 변수는 POSIX shell 표기다. PowerShell에서는 같은 세 `$env:` 값을 설정해
명령을 실행한 뒤 제거한다. build와 check의 typegen을 같은 `.next`에서 동시에 실행하지 않는다.
이전 실패한 Turbopack cache를 재사용해 판단하지 않고, 격리 사본의 `.next`를 보존해 옮긴 뒤
fresh build로 다시 확인한다. 사용자 checkout의 생성물을 정리하지 않는다.

**실제 DB 전제.** 별도 PostgreSQL 18 테스트 클러스터에 이번 실행용 새
`stagekeeper_test_*` DB를 준비하고 TEST_DATABASE_URL로만 전달한다. 현재 저장소의 CI
`check/server-integration` service가 같은 종류의 격리 DB를 준비하는 예다. 로컬에서는
소유한 테스트 클러스터의 data_directory와 loopback 주소를 확인한 뒤 새 DB를 만든다.
운영 URL·기존 일반 DB·사용자 `.env`를 테스트 설정으로 복사하지 않는다.
`scripts/lib/test-database.mjs:validateTestDatabase(process.env)`의 분리 검사를 먼저 통과시킨다.
DB provision은 각 실행 환경이 소유하고, 이 작업에 새 일반 DB provision 도구를 추가하지 않는다.

검증된 테스트 URL을 migration 프로세스에만 DATABASE_URL로 전달한다. 부모 환경의
DATABASE_URL을 TEST_DATABASE_URL과 같게 export하면 리허설의 분리 검사가 거부하므로 하지 않는다.

```sh
DATABASE_URL="$TEST_DATABASE_URL" node node_modules/prisma/build/index.js migrate deploy
npm run test:server:integration
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-repository-disconnection.ts --transport-loss
npm run test:acceptance:backlog-pipeline
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-multiple-pipelines.ts
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-account-usage-and-tokens.ts
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-acceptance-failure.ts
```

이 명령들은 같은 격리 DB에서 순서대로 실행하고 각 fixture 정리 결과를 확인한다.
`--transport-loss`는 자동 전송 유실 대조까지 수행한다. private templates나 실제 모델은
사용하지 않는다. 해당 옵션 없는 기본 HTTP 경로만 실행했으면 전송 유실까지 통과했다고 쓰지 않는다.

`rehearse-src-clean-code.ts`는 자동 종료하는 CLI가 아니라 브라우저 인수를 기다리는
로컬 서버다. `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-src-clean-code.ts`
로 시작해 ready 출력과 실제 owner/fixture 화면을 확인한다. verification.md의
FSD 파이프라인 초안 인수 절에 있는 mutation·pending·오류·취소 시나리오를 실행하고
`http://127.0.0.1:55452/finish`로 종료한다. 정합성 단계에서 시작·준비·정리만 확인한 결과와
브라우저 assertion을 완료한 결과를 구분한다. `--render-faults`가 필요한 별도 렌더 결함
시험은 이번 manifest 이동으로 새로 추가하지 않으며 기존 동작을 변경하지 않는다.

HTTP·DB 검증 종료 후 fixture 사용자·token·연결을 정리하고 이번 검증이 만든 PostgreSQL
클러스터만 종료한다. 정리 실패나 잔존 실행은 기록하고 다음 실행에서 재사용하지 않는다.

새 .mjs 시험은 `test:architecture`·`test:scripts`, 새 `tests/server/*.test.ts`는
`test:server`에 발견된다. H4의 OS별 명령은 Phase SCPSERVER에서 명시적으로 추가한다.
실제 모델을 쓰는 pipeline gate·private 설치 인수와 운영 승격은 기존 승인·재사용 규칙에
따라 별도로 실행하며, 이 문서 작성에서는 dispatch하지 않는다.

### 최종 산출물과 검증 위치

| 산출물 | 최종 소유·입력 | 실제 확인 대상 |
| --- | --- | --- |
| 출하 파일 집합 | 공통 predicate → version checker·두 packager | 독립 포함/제외 예시와 실제 inventory 선택; native 모듈 없는 checker import |
| Action registry·호출 대상 | 새 mutation 파일·기존 loader·Next compiler·fresh build | `.next/server/server-reference-manifest.json`의 filename/export/runtime/worker와 실제 HTTP mutation 결과 |
| 직접 의존성 설치 | package.json + lockfile + npm ci | 실제 esbuild 번들 bytes와 pg Client/Pool 생성, 해석 경로 |
| 서버 handle·IPC | preload의 실제 listen → parent의 검증 → HTTP 준비 | version/event/runId/pid/host/port 전부, 반환 origin의 본문 및 child 종료 결과 |
| client 연결 설정 | 같은 origin → AUTH_URL/HARNESS_PUBLIC_URL/HARNESS_SERVER·MCP 등록·저장 | dry-run의 server 줄, MCP URL과 persisted server 재조회, 비밀 값 비노출 |
| 승격 검증 대상 | AGENTS.md의 기존 diff 목록·새 helper 경로 | smokeTriggerPaths와 기존 trigger-path 시험, 각 helper만 바뀌는 대조군 |
| 게이트 기록 | summary 필터·기존 issue 목록 → 새 result 디렉터리 → Action step output | comment.md·finding 파일의 실제 내용·부재·issue 번호, 생성 실패 시 후속 호출 0회 |

## Reconciliation Record

2026-11-16 첫 정합성 pass에서는 개선할 점이 있었다. 포괄적으로 적힌 변경·보존 inventory,
Action helper의 API·소비별 lookup, 서버 IPC/환경/정리 실패 전달, 실제 init workflow의
새 helper 감지, 검증 명령의 설치·DB·브라우저 전제를 구체화했다. 이후 runtime 대조에서
Node fork의 preload 상속을 확인해 직접 자식만 계측하는 parent PID 경계도 명시했다. 다섯 문제의 해결 범위나
제품 권한은 바꾸지 않았다. 이 편집 pass 자체를 clean pass로 기록하지 않으며 최종 판정은
최신 저장본을 다시 읽는 별도의 no-edit pass에서 확인한다.

기준 소스에서 boundary·check·단위/서버/웹·fresh build·세 flag의 manifest 검사를 실행했다.
격리 PostgreSQL에서 통합 시험 180개와 연결 해제의 전송 유실·multiple-pipelines·account-usage·
acceptance-failure HTTP 리허설은 통과했다. backlog는 위의 기존 문구 단언에서 실패했고
임시 보정 대조군은 통과했다. 브라우저 리허설은 준비·fixture 본문·finish 정리까지만 확인했다.
원본 검증 스크립트와 제품 코드는 보존했다.

추가 정합성 검토에서는 helper 이동 후 승격 gate의 변경 감지가 빠지는 한 곳을 보완했다.
AGENTS의 기존 감지 목록과 해당 시험을 구현 inventory·Task·VFY·최종 산출물에 연결했다.
또한 H2 표의 `unique worker`는 실제 코드와 다르므로 유일한 Action entry와 복수 workers의
구조 검사로 바로잡았다. 기존 검증 정책·원격 Action 노출·다섯 문제의 범위는 유지한다.

실제 Next 16.4.2를 임시 preload와 함께 시작한 대조에서 소유 IPC가 일치하고 `/login`의
`Continue with GitHub` 본문이 반환됨을 확인했다. 이는 제안의 listen 계측 방식이 현재
framework에서 가능한지 확인한 prototype 증거이며 완성될 helper의 모든 오류·취소·OS 인수는 아니다.

검증 명령은 baseline의 실행 가능성과 개선 후의 통과를 구분한다. 새 시험 파일의 baseline
부재는 예상 결과이며, 구현 후 검증을 대신하지 않는다. 실제 Windows·trusted 설치·모델 gate는
외부 환경 인수로 남기고 로컬 대역 통과와 구별한다. 정합성 실행 결과와 최종 source identity는
해당 검토 응답에 남긴다.

## Blockers and Readiness

전체 설계는 위 범위에서 완료했다. Phase SCPTOOLS는 현재 소스 기준 `READY`이며 실제
구현 승인은 별도다. SCPACTION·SCPSERVER는 아래 검증 환경 조건이 있는 `CONDITIONALLY READY`다.

### BLK-SCP-01: 실제 프레임워크·OS 인수 환경

- 분류: downstream. 최초 영향은 Phase SCPACTION의 종료 인수다.
- 근거: 정합성 검토에서 기준 소스용 격리 DB·fresh build와 macOS Next 대조는 준비·실행했다.
  변경 후 fresh build·격리 DB·실제 HTTP·macOS Next/IPC·브라우저 검증은 완료했다.
  Windows native 실행과 Windows/macOS trusted 설치·실제 모델 인수는 아직 수행하지 않았다.
- 영향: REQ-SCP-005·REQ-SCP-006의 Windows 및 trusted 설치 경로 완료 증거가 남아 있다.
  REQ-SCP-002·REQ-SCP-003의 fresh build·실제 HTTP 검증은 아래 기록으로 확인했다.
- 해소: 구현 시 격리 DB와 fresh build, Windows/macOS 실행 환경 및 필요한 trusted init
  설치 환경에서 VFY-SCP-05·VFY-SCP-06의 남은 OS·설치 인수를 실행한다. 로컬 담당자는 `owners`에 기록했다.
- 중단 조건: 대역만 통과했거나 필요한 OS/설치 경로가 미실행이면 해당 Phase의 전체 인수와
  배포 준비 완료를 선언하지 않는다. 선행 도구 수정·문서 설계를 막는 조건으로 확대하지 않는다.

공유 모듈·CI 제안과의 파일 겹침은 작업 순서 조정 사항이며 현재 설계를 막는 미확정 요구는
아니다. 실행 시 두 문서가 상충하는 소유권·배포 정책을 이미 승인받았다면 그 충돌을 먼저
해결하고, 이 문서의 오래된 경로를 기준으로 구현하지 않는다.

## Verification Results

| 대상 | 상태 | 범위 |
| --- | --- | --- |
| 기존 조사·추가 재검토 근거 | 확인 | Current State의 관측과 과거 재현 결과. 제품 코드 수정 없음 |
| 요구사항·Task·VFY 추적성 | PASS | 설치된 write-sdd-spec validator 일반 모드. 요구사항 7개, Task 6개, VFY 7개; 요구사항의 작업·검증 연결 각각 7/7, 오류·경고 0개 |
| 의미 검토·상대 링크·metadata | PASS | 쓰기 범위, Phase별 완료 소유권, Action 노출, 서버 시작·취소·종료, 새 gate 경로 및 검증 환경 조건 대조. front matter·상대 링크·줄 끝 공백 검사 통과 |
| 기준 소스 명령·임시 대조 검증 | 실행 | 위 Reconciliation Record. baseline의 기존 실패·대역 범위와 변경 후 통과를 구분 |
| 변경 후 구현·시험·build·실제 인수 | 로컬 PASS / 외부 인수 미실행 | 아래 Implementation Record. Windows native·trusted 설치·실제 모델 인수를 로컬 통과로 대체하지 않음 |

검증 입력은 이 문서 한 파일이며 canonical ID는 모두 이 문서가 소유한다. 관련 조사서와
다른 제안서는 근거 링크이며 요구사항 정의를 상속하지 않는다. 설계와 구현 승인은 front matter에
기록했으며 후속 환경 조건이 있어 전체 인수 완료를 선언하지 않는다. 문서 검사의 통과는 구현·인수의
통과를 뜻하지 않는다.

## Risks and Rollback

- H2의 노출 구조를 잘못 옮기면 loader가 원격 실행될 수 있다. exact mutation 집합과 인증
  거부의 무변경을 확인하기 전 완료하지 않는다. rollback은 Action·reader·소비자·문서·시험을
  같은 변경 단위로 되돌리고 새 production build를 만드는 것이다.
- H4의 preload는 Node HTTP 이벤트와 실제 Next 시작 경로를 관찰한다. Node/Next 변경 시
  실제 두 OS 검사로 확인하고, listen 확인을 잃으면 실패해야 한다. 새 helper와 세 caller를
  함께 되돌리며 기존 45438 설정과 새 origin 전달을 섞지 않는다.
- H5의 기존 경로 거부는 의도한 오류 처리다. 재실행은 새 경로를 사용한다. rollback을 위해
  이전 결과 폴더를 지우거나 임의 파일을 새 실행의 결과로 복구하지 않는다.
- H1·H3은 predicate 연결과 package.json/lock을 각각 함께 되돌릴 수 있다. 되돌림 자체가
  알려진 문제를 다시 가져온다는 점을 작업 결과에 기록한다.
- 이 작업에는 DB migration·영구 데이터 복구가 없다. branch/PR/출시 조작은 실제 승인 범위에서만 한다.

## Completion or Closure Notes

세 Phase의 구현과 로컬 검증을 마쳤다. 아래 실행 기록과 후속 PR·CI 기록에서
검증 환경·skip·미실행을 구분한다. 남은 환경 인수를 확인한 뒤 문서 생명주기를 갱신한다.

## Review Checklist

- [x] 다섯 조사 항목을 요구사항과 구체적인 변경 책임에 연결했다.
- [x] 현재 구현·계약·새 설계·과거 실행 근거를 구분했다.
- [x] 새 파일을 신규 목적지로 표시하고 쓰기 범위를 한정했다.
- [x] Action 노출·세션 검증·ordinary loader 보존을 별도 검증 대상으로 삼았다.
- [x] 서버 소유 확인·포트 경합·취소·종료 실패·기존 파일 보존을 설계했다.
- [x] 기존 정상 경로와 제한된 재현을 실제 인수 완료로 확대하지 않았다.
- [x] 후속 환경 조건과 Phase별 중간 유효성·완료 소유권을 정했다.

## Implementation Record — 2026-11-17

### 변경과 보존 범위

기준 commit은 `51111ed3300ee558788ab2829169b3f66253b36f`, 작업 브랜치는
`harness/scripts-coupling-remediation`다. 작업 폴더는
`/private/tmp/stagekeeper-scripts-coupling-20261116`이며 원래 checkout의 다른 변경은 보존했다.
관리 task ID는 `823a80a0-d19e-4ad8-a717-e577ef518360`다.

| Phase | 구현 상태 | 검증 및 남은 범위 |
| --- | --- | --- |
| SCPTOOLS | 세 Task 구현 | OS 중립 payload 판정, esbuild 0.28.2·pg 8.23.0 직접 선언, 배타적 gate 출력 및 성공 output 소비 검증 완료 |
| SCPACTION | 구현 | 공통 reader의 runtime·전체 경로·단일 Action 선택, 여섯 리허설 전환, 두 named mutation·ordinary loader 분리. fresh manifest·인증·HTTP·브라우저 검증 완료 |
| SCPSERVER | 두 Task 구현 | 세 caller 주소 전달·시작 취소·종료 확인·실패 전파와 CI 연결 완료. macOS 실프로세스·실제 Next 검증 완료. Windows native·trusted 설치·실제 모델 인수 미실행 |

제품 서비스·DB schema·plugin payload는 수정하지 않았다. `AGENTS.md`는 기존
pipeline-smoke 감지 목록에 helper 두 경로만 추가했다. CI의 모델 없는 검사는 기존
Windows·macOS runtime job에 연결했다. 작업 도중 최신 dev에는 별도 macOS pipeline CI
변경이 들어왔으므로 병합 시 그 CI·현행 문서 변경을 유지해야 한다.

### 실행 증거

환경은 macOS arm64, Node 26.4.0, Next 16.4.2다. CI에 설정된 Node 22 및 Windows에서의
실행 결과와 구분한다. 아래 수치는 이 구현 worktree에서 실행한 결과다.

| 검증 | 결과 |
| --- | --- |
| `npm ci --include=dev` | 새 worktree에서 깨끗한 설치 성공. 설치한 esbuild로 번들을 만들고 실행값 42 확인, pg Client·Pool 생성/종료 확인. lockfile은 직접 의존성 두 항목만 변경 |
| `npm run verify:fsd`, `npm run verify:server` | PASS |
| `npm run check` | PASS. lint·문서·CI coverage·Next typegen·tsc 포함, 스크립트 535 pass / 3 skip |
| `npm run test:architecture` | 426 pass / 3 skip |
| `npm test` | 641 pass / 42 skip. 기존 OS/native runtime 조건에 따른 skip을 통과에 포함하지 않음 |
| `npm run test:web` | 815 pass |
| fresh manifest flags 세 개를 활성화한 `npm run test:server` | 197 pass. `RDC_CHECK_ACTION_MANIFEST`, `SRC_CHECK_INBOX_MANIFEST`, `GITHUB_CHECK_ACTION_MANIFEST` 모두 true |
| `npm run build` | fresh production build PASS |
| `npm run test:server:integration` | 새 격리 PostgreSQL DB에 기존 migration 적용 후 185 pass |
| 다섯 HTTP 리허설 | connection `--transport-loss`, backlog/pipeline, multiple-pipelines, account-usage-and-tokens, acceptance-failure 모두 exit 0 |
| `node --test scripts/rehearsals/smoke-server.test.mjs` | 18 pass. 실제 Node 자식·IPC·소켓, 포트 충돌 시 타인 서버 요청 0, 잘못된 식별·종료·취소·timeout·반복 stop·종료 실패·후손 preload 검증 |
| 세 smoke caller의 관련 시험 | 35 pass. 모델/설치 경계는 대역이며, 시작·종료 실패에 따른 원래 failure 보존·fixture 보존·summary 기록·listener 해제를 실제 호출부에서 확인 |
| 실제 Next 두 서버 | 새 helper로 서로 다른 주소에서 시작, login 본문 확인, 한 서버 stop 후 다른 서버의 200 응답 확인, 둘 모두 종료 |
| clean-code 브라우저 fixture | Chromium에서 146 pass / 0 fail. pending·오류·취소·늦은 응답·프로젝트 교체 포함 |
| 실제 Next 파이프라인 브라우저 | 두 탭의 저장/stale, 초안 보존, 명시적 reload, 저장 전/후 응답 유실을 확인. version 1→2→3, save 호출 4회, stale·저장 전 유실·reload의 추가 version 0. 최종 rail·Read as text·DB graph 일치 |
| 문서·추적성 | untracked 문서를 포함한 검사에서 226 Markdown / 1,183 링크 오류 0. SDD REQ 7개–Task 6개–VFY 7개 연결 오류·경고 0 |

원시 로그는 `/private/tmp/stagekeeper-scp-*.log`에 보존한다. 브라우저 fixture를
`/finish`로 종료하고 시험 DB의 User가 0명임을 확인했다. 시작 실패 시험의 초기 정리
대기 문제는 테스트 소유 자식의 exit 확인으로 수정하고 최종 suite를 재실행했다.
초기 샌드박스 소켓 거부나 CI path assertion 실패는 위 최종 통과 결과에 포함하지 않았다.

커밋·PR·병합·승격·전역 클라이언트 설치·실제 모델 gate는 수행하지 않았다.
전체 인수의 미실행 범위는 BLK-SCP-01로 유지하고 문서를 active에 둔다.
작업 브랜치와 worktree는 미커밋 결과를 보존하기 위해 유지한다.

### 후속 진행 승인 — 2026-11-17

사용자가 최신 dev 대조, 커밋·푸시·PR, 남은 환경 검증과 통과 후 dev 병합 순서에
“진행”을 요청했다. 기존 작업을 같은 브랜치에서 이어가며 위 미커밋 상태 설명은
로컬 구현 종료 시점의 기록이다. main 승격과 개인 설치 환경 변경은 수행하지 않는다.
