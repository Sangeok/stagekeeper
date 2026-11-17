---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-16"
approved-by: "user"
approved-at: "2026-11-16"
approval-scope: "Phase MIGRATE의 실제 소스·배포 도구·시험·CI·문서 전환과 검증. ACCEPT·운영 승격 제외"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/shared-modules-and-plugin-distribution.md"
  - "docs/proposals/completed/2026-11-16-shared-modules-and-plugin-distribution-phase-arch.md"
  - "docs/architecture/shared-modules.md"
  - "docs/architecture/server.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/ADR/0008-separate-shared-module-distribution.md"
---

# 공유 모듈·플러그인 배포 경계 — Phase MIGRATE 상세 계획

## Summary

[상위 SDD](./shared-modules-and-plugin-distribution.md)의 MIGRATE를 실행 가능한 작업으로 구체화한다.
ARCH에서 정한 소유권과 공개 계약에 따라 core/github 원본을 shared/app-core/server/FSD/plugin
runtime으로 옮기고, 선언한 shared 모듈만 plugin/lib에 복사하도록 바꾼다. 소비자·타입·시험·
alias·검사·CI·현행 문서를 같은 최종 변경에서 연결한다.

초기 작성·검토 요청은 이 계획 파일에 한정됐다. 이후 사용자가 이 문서를 바탕으로 실제 수정을
진행하도록 요청하여 front matter의 범위로 MIGRATE 구현을 승인했다. 아래 설계·검토 이력은
당시의 근거로 보존하며, 실제 수행 상태는 [MIGRATE Execution Results](#migrate-execution-results)를 따른다.

작성 모드는 `PHASE_PLAN`, 문서 규모는 `standard`, 구현 위험도는 `HIGH-RISK`다.
제품 의미는 유지하지만 잘못된 배포 집합·경로 삭제·실행 환경 연결은 설치 실패나 서버 코드의
브라우저 유입을 만들 수 있다. 이 위험은 새 기능이 아니라 전환의 검증·복구 조건으로 다룬다.

## Source and Evidence Baseline

### 기준과 단일 정의 위치

- 조사일: 2026-11-16. 기준 commit: `51111ed3300ee558788ab2829169b3f66253b36f`.
- 이 commit은 [ARCH PR #347](https://github.com/Sangeok/stagekeeper/pull/347)의 dev 병합 결과다.
- 작성 브랜치: `harness/shared-modules-migrate-plan-20261116`.
  관리 worktree task: `d912de1a-ac0b-442a-9e94-308620363409`.
- 원래 작업 폴더에는 다른 문서 변경과 미추적 입력이 있어 최신 dev의 격리 작업 트리를 사용했다.
  이 계획은 원래 폴더의 오래된 미추적 상위 SDD 대신 **병합된 상위 SDD**를 입력으로 한다.
- 상위 SDD SHA-256: `39f52731f574af2045d064eee44c18acefce64f91a7c721b9cee22d13592f725`.
- shared architecture SHA-256: `36dae1561227ea6de6084d8a613553620ff5d8816cc8850aafad9722da341d66`.
- 생산 코드·package/lock·workflow는 ARCH 조사 기준 `a0993fcc0d94eed25094012e2716abc70774f61a`와 같다.
  현재 source를 다시 열거하여 원본 27개, export 출현 175개, private binding 49개,
  typedef/type 31개, 직접 import·재수출·타입 참조 404건을 확인했다.
- 개발 환경은 npm, ESM `.mjs`, TypeScript 5.9.3, Next 16.4.2, React 19.2.8,
  Prisma 7.10.1, node:test다. CI는 Node 22를 사용한다. 별도 npm workspace나 패키지 출시는 없다.

| 계약 | 단일 정의·근거 | 이 계획의 역할 |
| --- | --- | --- |
| 전체 요구사항·불변식·제약 | 상위 REQ-SMB-001~007, INV-SMB-001, CON-SMB-001~003 | 의미를 바꾸지 않고 구현·검증에 연결 |
| 소유권·공개 목록·runtime | [shared-modules.md](../../architecture/shared-modules.md) | 14개 entry/59개 값과 내부 template-boundary를 구현 |
| 현재 원본과 모든 소비자 | [ARCH Inventory](./shared-modules-and-plugin-distribution.md#arch-inventory) | 목록을 복제하지 않고 변경 순서·새 검사·실행 환경을 보완 |
| 선택 이유·활성화 | [ADR-0008](../../ADR/0008-separate-shared-module-distribution.md) | 구현 완료 시 accepted 전환; 기존 0005/0007의 역사 보존 |
| 기존 Tasks | 상위 TASK-MIGRATE-01~03 | 아래 Change detail에서 상세화하며 재정의하지 않음 |
| 기존 Verifiers | 상위 VFY-SMB-01~04 | 새 목적지·실패 사례·명령 연결을 상세화 |
| 독립 설치 호환성 | 상위 BLK-SMB-01, VFY-SMB-05 | ACCEPT의 인수 조건으로 유지 |

### 동시 작업과 재확인 지점

초안 조사 시작 시에는 [PR #348](https://github.com/Sangeok/stagekeeper/pull/348)이 열려 있었다.
이번 검토에서 확인한 origin/dev는 `e8c212a98335a5e4fb12df915c861a1e2581c43b`이며 #348이 병합됐다.
51111ed와의 차이는 AGENTS·verification의 worktree 운영 문서 두 개뿐이고 제품·검사 코드는 같다.
열린 PR 조회는 0건이다. 선택한 미병합 계획의 후속 검토이므로 같은 worktree에서 이어가며,
구현 착수 때는 그 시점의 최신 규칙을 읽는다. 다른 작업의 변경을 가져오거나 기존 파일을 수정하지 않았다.
현재 active의 `role-command-time-limit.md`, `template-release-acceptance-follow-ups.md`도 확인했다.
이미 반영된 runtime 수정이나 외부 설치 인수를 이 전환에서 다시 구현하지 않는다.

별도 `harness/scripts-coupling-remediation` 작업은 H1에서
`scripts/lib/plugin-payload.mjs#isShippedPluginFile`로 출하 predicate를 분리할 예정이다.
이 파일은 **기준 dev에는 없다**. 원래 작업 폴더의 미추적 `scripts-coupling-remediation.md`를
조정 근거로 읽었으며, 이 작업의 canonical source나 승인된 선행 구현으로 취급하지 않는다.
MIGRATE의 TASK-MIGRATE-02에서 두 패키저·버전 검사를 건드리기 전에 실제 병합 결과를 확인하고
그 predicate를 재사용한다. 미통합 상태라면 해당 파일의 수정은 먼저 소유 작업과 정리하고,
TASK-MIGRATE-01과 독립적인 그래프·복사 설계부터 진행할 수 있다. 상대 작업을 기다린다는
이유로 예전 Windows packager 경유 의존이나 두 번째 predicate를 새로 고정하지 않는다.

다른 작업이 이미 alias·공개 목록·배포 의미를 바꿨으면 최신 코드와 상위 계약을 다시 대조한다.
단순 경로 차이는 이 계획을 갱신하고, 권한·wire·해시·제품 의미 충돌은 상위 결정을 먼저 해결한다.

## Scope and Current Implementation

| 작업 항목 | 현재 근거 | 판정 | 남은 변경 |
| --- | --- | --- | --- |
| 소유권·공개 목록 | ARCH Inventory, shared-modules, ADR-0008 | 문서 충족 | 목록에 맞는 구현과 소비자 전환 |
| shared/app-core 및 명세 | 현재 두 디렉터리와 plugin-exports.json 없음 | 미구현 | 27개 원본 분리·이동과 실제 명세 생성 |
| 복사·drift·orphan | `scripts/plugin-lib.mjs`: SOURCES, sourceModules, diffPluginLib, syncPluginLib | 부분 충족 | 전체 복사를 명세 closure로 교체, 사전 검증·경로 안전성 보강 |
| CLI 무변경 | `scripts/plugin-lib.test.mjs`의 help·오타·check·원본 누락 사례 | 이미 존재 | 같은 관찰 계약을 새 입력에 연결 |
| FSD 검사 | verify-fsd의 regex import·두 alias·직접 Client 검사 | 부분 충족 | 새 alias를 해석하고 새 공유 경계 검사와 책임 분담 |
| server 검사 | verify-server의 TypeScript AST·api 초기화·방향·registry 검사 | 부분 충족 | pipeline → templates와 실제 새 import/registry 연결 |
| shared 공개·전이 runtime 검사 | 현재 전용 검사 없음 | 미구현 | 명세/원본 그래프와 외부 소비자 검사를 추가 |
| 패키징 | 두 package 함수가 Git 추적 plugin 파일을 선택. Windows는 runtime fixture 패키징 시험이 있고 macOS 시험은 현재 hook 변환만 검사 | 부분 충족 | lib 사전 검사와 실제 package 함수의 성공/실패 시험을 두 OS에 연결 |
| 출하 predicate | Windows export를 version checker가 사용, macOS는 로컬 사본 | 동시 작업 접점 | H1의 최종 공통 소유자를 재사용 |
| 시험 발견 | npm test의 core/github 재귀·runtime 단일 깊이 glob | 전환 필요 | 새 mjs glob과 서버/FSD로 이동한 TS 시험의 양 OS 실행 |
| CI 범위 | check, macOS runtime contracts, Windows role runtime | 기반 존재 | 새 소스·검사 path filter, 실행 step·coverage 행을 함께 변경 |

위 판정은 코드·문서 관찰이다. 실제 새 구조의 동작·패키징·CI 통과를 관찰했다는 뜻이 아니다.

포함 범위는 상위 [Source Migration Map](./shared-modules-and-plugin-distribution.md#source-migration-map)과
[Affected Files](./shared-modules-and-plugin-distribution.md#affected-files-and-coupled-changes)의
전환 및 아래에 명시한 그래프·검증 도구다. 새 경로는 모두 **제안 목적지**다.

제외 범위는 제품 정책 재설계, DB schema/data migration, 새로운 인증·권한,
별도 npm release, runtime dependency 추가, 일반 번들러, Next/Node 업그레이드,
기존 native 권한/프로세스 구현 변경, 실제 사용자 설치본·운영 서버 수정이다.
다른 제안의 Action 재설계·의존성 추가·smoke 서버 교체·worktree 도구 수정도 포함하지 않는다.

## Phase MIGRATE: 하나의 일관된 소스·배포 전환

- predecessor artifacts: 병합된 ARCH 계약·전수 대응표·ADR와 착수 시점의 최신 dev.
- satisfies: REQ-SMB-001, REQ-SMB-002, REQ-SMB-003, REQ-SMB-004, REQ-SMB-006, REQ-SMB-007
- preserves: INV-SMB-001
- governed-by: CON-SMB-001, CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-01, VFY-SMB-02, VFY-SMB-03, VFY-SMB-04

이 Phase는 소스·생성물·소비자·검사·문서를 한 PR의 최종 상태에서 일관되게 전환한다.
내부 작업 도중의 호환용 재수출이나 일시적 실패 상태를 독립 배포·병합하지 않는다.
최종 상태에 core/github 생산 원본·옛 alias·불필요한 lib 복사본을 남기지 않는다.
REQ-SMB-004의 저장소 동작 보존은 여기서 검증하며, 기존 설치본과 새 서버의 조합은 ACCEPT가
추가 검증한다. REQ-SMB-005는 이 Phase의 완료 주장에 포함하지 않는다.

### 진입과 작업 순서

1. 구현 요청의 범위, 최신 AGENTS, 원격 dev/main, 열린 PR과 active 문서를 확인한다.
   기존 작업을 보존하고 기록한 source bundle과 실제 시작 revision의 차이를 대조한다.
2. 현행 시험 발견 목록·핵심 고정 입력의 출력·lib 목록을 기록한다. 실패한 baseline과
   이동 때문에 생긴 실패를 분리하며 기존 실패를 무시하는 새 skip을 추가하지 않는다.
3. TASK-MIGRATE-01의 원본·소비자·타입과 인접 시험을 함께 이동한다.
   TASK-MIGRATE-03의 alias·fixture·시험 탐색 변경은 이때 필요한 만큼 동행한다.
4. TASK-MIGRATE-02의 공통 그래프·경계 검사·sync·패키징 사전 검사를 연결하고 lib를 재생성한다.
5. TASK-MIGRATE-03의 양 OS 발견·gate 경로·coverage·현재 문서·ADR 전환을 완료한다.
6. 새 위치 기준의 VFY-SMB-01~04와 CI를 실행한다. 자체 수정분의 최종 tested commit을 고정하고
   ACCEPT에 넘길 source/lib 목록, 환경별 결과, 미실행 외부 인수를 기록한다.

Task 번호 순서가 중간 커밋의 배포 가능성을 뜻하지 않는다. 각 Task의 변경은 로컬에서
중단·재개할 수 있지만, Phase의 종료 지점은 이후 ACCEPT 코드 없이도 자체 검사에 통과해야 한다.

## Change detail for TASK-MIGRATE-01

Canonical Task: [TASK-MIGRATE-01](./shared-modules-and-plugin-distribution.md#task-migrate-01-책임-분리와-소비자-전환).
검증 참조: [VFY-SMB-02](./shared-modules-and-plugin-distribution.md#vfy-smb-02-의존성공개-api실행-환경의-거부-사례),
[VFY-SMB-04](./shared-modules-and-plugin-distribution.md#vfy-smb-04-제품-동작과-시험-발견의-보존).

### 1. 원본과 private closure를 함께 이동

상위의 27개 원본별 표를 실행 목록으로 사용한다. 각 현재 `file#symbol`에 새 소유자·이름,
실제 import·재수출·타입 전용 소비자와 검증 목적지가 있어야 한다. 파일 숫자를 맞추기 위해
export를 삭제하거나 helper 구현을 양쪽에 복사하지 않는다.

| 분리 묶음 | 구현 변경과 보존 조건 |
| --- | --- |
| slug·pipeline·token validity | app-core로 이동. RESERVED_SLUGS·문구·그래프·전이·만료 의미와 FSD public API 유지 |
| entitlement | 공통 limits는 shared, 앱 접근/표시 판정은 app-core, 가용성 선택·정렬 helper는 server/projects. OWNER_TOKEN_PLAN_GATE는 app-core에서 UI와 서버가 계속 공유 |
| runner | 메시지·필드 제한·limited 형식은 shared, 생존·lease 판정은 app-core, 두 서버 갱신 주기는 server/runners. private time을 runnerTimestamp로 한 번만 추출 |
| token | TOKEN_KINDS·parseBearer·tokenPrefix는 shared, randomBytes·hashToken·newToken은 server/tokens. prefixOf의 오류 계약 보존 |
| QA | config·도구 목록은 plugin/runtime/qa, report는 server/pipeline. private text/httpUrl은 shared/qa의 qaText/qaHttpUrl로 추출해 길이·trim·URL·오류 공유 |
| 설정·watch·설치 manifest | 플러그인 전용을 plugin/runtime으로 이동. workspaces는 shared; hashOf의 줄바꿈 정규화·짧은 hash와 lock 병합 의미 유지 |
| release manifest | 공통 계약과 canonical/hash는 shared의 두 node entry, release 준비·선택은 server/templates. schema·정렬·CRLF 처리·hash·installation tuple 보존 |
| template vars·runbook | plugin 전용 metadata와 server 저장 상태 판정을 분리. 공통 render/vars/version만 shared에 유지 |
| GitHub URL | repo-url은 shared, blobHref와 encodePathSegments는 기존 board-item/doc-link에 통합. 이름·ref fallback·인코딩과 entity export 유지 |

shared의 공개 14개/값 59개와 내부 template-boundary의 구분은 architecture 표를 그대로 사용한다.
shared 내부의 template-boundary 직접 import는 허용하고 영역 밖 STEP_HEADING·stubOf 소비는
deliver 공개 경로로 연결한다. Node 전용 release-contract·manifest-hash·runbook을 universal
barrel로 합치지 않는다. 개발용 TypeScript 도구를 shared/plugin 런타임에 넣지 않는다.

### 2. 서버 façade와 호출 시점

| 새 구현 | 외부 공개 경로와 실제 연결 |
| --- | --- |
| tokens/token-crypto.ts | tokens/api.ts에 newToken·hashToken 추가. create-project/manage-user-token 서버 Action, mcp/auth·rest/scope, 기존 발급 리허설 연결 |
| templates/release-preparation.ts | templates/api.ts에 releaseDeliverable·installationFor·selectTemplateLanguage 추가. rest의 두 handler와 pipeline/template-selection 연결 |
| templates/runbook-query.ts | runbookIsStale을 private으로 통합하고 기존 runbookStale API 유지 |
| 나머지 서버 정책 | 해당 모듈 내부 상대 import. 실제 외부 제품 소비가 없는 함수를 시험 편의로 공개하지 않음 |

`verify-server-boundaries.mjs`의 directions와 server.md에 pipeline → templates를 같은 변경에서
추가한다. templates → pipeline은 허용하지 않는다. templates가 사용하는 pipeline의 순수
정책은 app-core 참조이며 server 모듈 역의존으로 바꾸지 않는다.
api.ts의 DB 비초기화와 api.server.ts의 기본 연결 경계, 기존 guard·transaction·revalidate
호출 순서를 보존한다. 새 token façade에 DB singleton이나 server-only import를 끌어들이지 않는다.

`scripts/rehearsals/rehearse-codex-macos.mjs`는 newToken을 기존 main 내부의 TS 동적 import
묶음에서 읽는다. 실제 CLI는 기존 `--import tsx`로 실행하고, plain Node에서 helper만 import하는
시험에 TS façade가 eager-load되지 않아야 한다.
`plugin/bin/harness-init-dual.test.mjs`의 발급 사용은 해당 시험이 소유하는 고정 유효 토큰으로
바꾼다. shared의 parseBearer 시험도 고정 형식 입력을 쓰며 발급→파싱 roundtrip·고유성·hash
사례는 server/token-crypto 시험에서 shared parser와 함께 보존한다.

`rehearse-acceptance-failure.ts`의 runbookIsStale 호출은 templates/api의 runbookStale로 옮긴다.
잘못된 reported 값인 `"old-template"`은 현재 façade에서 저장값으로 fallback하므로 그대로
전달하지 않는다. stale 대조는 과거 본문의 유효한 runbookVersion으로 수행하고,
null·잘못된 저장값·여러 언어·빈 본문 목록은 runbook-stale의 주입 DB 시험에 보존한다.

### 3. 타입·fixture·동적 참조

- 인접 `.d.mts` 여섯 파일의 type와 값 signature를 실제 함수 소유자별로 분할한다.
  shared/app-core의 선언은 구현 옆에, 서버 선언은 `.ts`에 둔다. QaConfig는 plugin의 기능적
  JSDoc으로 보존한다. `.d.mts`를 lib에 배포해 타입 문제를 해결하지 않는다.
- Plan·Client는 shared, RunnerSignal은 app-core, AvailabilityCandidate는 server/projects,
  QaStatus·QaReport는 server/pipeline, TemplateRow·TemplateSource는 server/templates,
  Installation·TemplateContract는 shared에 둔다. 필요할 때만 server/contracts로 타입을 공개한다.
- `tests/server/fixtures/load-module.ts`의 `@harness/core/` resolver를 두 새 alias로 전환하고
  실제 import명이 바뀐 VM dependencies key를 상위 문자열 참조 목록의 파일마다 맞춘다.
  원본을 읽는 시험과 `tests/plugin/template-fixture.mjs`도 새 생산 경로를 읽게 한다.
- `scripts`, `tests`는 해당 새 원본 또는 server façade까지의 상대 import를 사용한다.
  계산형 설치 packageRoot·native dispatcher는 기존 실행 소유자에 남긴다. 문자열 치환만으로
  require·literal dynamic import·재수출·type-only 참조가 모두 전환됐다고 판단하지 않는다.
- 소스·소비자 전환 후 이전 core/github의 생산 파일·선언·시험과 옛 alias를 제거한다.
  과거 completed 문서·출시 reader fixture의 당시 경로는 보존하며 보존 이유를 기록한다.

이 작업은 순수 정책의 새 상태나 DB 수명주기를 만들지 않는다. 실제 변이가 있는 서버 서비스의
인증·권한·중복 요청·잠금·rollback은 기존 구현을 그대로 사용하고 기존 회귀 시험으로 확인한다.

## Change detail for TASK-MIGRATE-02

Canonical Task: [TASK-MIGRATE-02](./shared-modules-and-plugin-distribution.md#task-migrate-02-선언-기반-동기화와-패키징-연결).
검증 참조: VFY-SMB-02, [VFY-SMB-03](./shared-modules-and-plugin-distribution.md#vfy-smb-03-배포-범위완전성무변경복구).

### 1. 명세와 그래프의 단일 소유자

신규 `packages/shared/plugin-exports.json`은 architecture의 전체 예시를 실제 설정으로 만든다.
허용 shape는 `version: 1`, `entries: [{ path, runtime }]`뿐이다. 알 수 없는 key, 누락·중복,
잘못된 runtime, 비정규 상대 경로, 없는 파일, 비생산 `.mjs`는 거부한다.
초기 entry는 14개이며 초기 실행 closure는 내부 template-boundary를 포함한 15개다.
파일 수는 회귀 관측값이고 향후 배포 알고리즘의 하드코딩 상수가 아니다.

신규 `scripts/lib/shared-module-graph.mjs`가 명세 읽기·원본의 literal 의존성 수집·경로 검증·
공개/내부 분류·runtime 전이를 소유한다. 제안 API `readSharedModuleGraph(projectRoot)`는
검증된 entry/runtime, shared 기준 상대 경로별 원본 경로·바이트·의존성 목록을 반환한다.
실패하면 상대 파일·규칙·의존 경로를 가진 오류를 내고 파일을 쓰지 않는다.
source root·명세·최초 destination 검사에서 얻은 snapshot은 해당 호출에만 유효하다.
sync와 새 경계 검사, 패키징 검증이 이 결과를 사용하여 서로 다른 closure를 계산하지 않게 한다.
이 도구는 기존 TypeScript AST 개발 의존성을 사용하며 새 parser/package를 추가하지 않는다.

처리 계약:

1. 명세를 구조적으로 파싱한다. path는 POSIX 형식의 소문자 kebab-case 디렉터리/`.mjs`다.
   절대 경로, `..`, 역슬래시, URL query/hash, 루트 탈출, 목적지 충돌을 거부한다.
2. 실제 shared 생산 파일을 열거하고 entry부터 import·export-from·literal dynamic import를
   따라간다. 댓글·문자열 속 가짜 import는 제외하고 parse 오류는 실패시킨다.
   계산형 import와 ESM shared 생산 코드의 require 우회는 허용하지 않는다.
3. shared 내부 실행 의존은 명시적 `.mjs` 상대 경로만 사용한다. Node 내장 모듈은 실제 builtin
   집합으로 식별하여 복사하지 않으며 node 전이에서만 허용한다. 외부 npm·다른 소유 영역·
   테스트·fixture·선언·문서 참조, closure 밖 고립 생산 파일을 거부한다.
4. visited 집합은 entry/runtime 문맥을 보존하여 공유 helper를 node entry에서 먼저 읽었다는
   이유로 universal entry의 검사를 생략하지 않게 한다. 순환·다중 경로에서는 탐색을 종료하고
   같은 파일을 중복 복사하지 않는다. 서버 모듈의 금지 순환과 일반 ESM closure의 반복 방문을 구분한다.
   내부 helper는 entry로 노출하지 않는다. universal entry에서 node builtin이나 node entry로
   닿는 경로가 있으면 전체 chain을 보고한다. runtime은 entry의 직접 import만으로 판정하지 않는다.
5. 원본·대상 경로의 디렉터리와 파일을 lstat/실경로로 확인한다. 최초 sync의 아직 없는 lib/하위
   경로는 가장 가까운 기존 ancestor를 확인하고 그 안의 새 상대 경로로 계산한다. 없는 경로에
   realpath를 호출해 정상 첫 sync를 거부하지 않는다. symlink·junction을 따라
   복사하거나 삭제하지 않는다. 기존 대상 파일의 hardlink와 비정상 파일 종류도 거부한다.
   복사 대상과 무관한 사용자 파일을 지우는 방식으로 거부를 해소하지 않는다.
6. 경로·의존·오류 목록은 안정된 정렬을 사용하고 비교는 원본 바이트로 한다.
   UTF-8 재인코딩·줄바꿈 정규화·해시 재작성·minify를 복사 과정에 넣지 않는다.

### 2. 소비자·runtime 경계 검사

신규 `scripts/checks/verify-shared-boundaries.mjs`에
`inspectSharedBoundaries(projectRoot, { graph } = {})`를 두고 `{ violations, pluginModules }`를 반환하게 한다.
pluginModules는 시험·vendor를 제외한 first-party plugin/bin·runtime 생산 JS의 저장소 상대 경로와
현재 원본 바이트 map이다. source 탐색 때 수집하여 package 사전 검사에 전달한다.
graph가 없으면 readSharedModuleGraph로 읽고, 있으면 같은 호출에서 검증한 결과를 재사용한다.
sync/check는 graph를 만든 뒤 이 소비자 검사를 호출하여 위반이 없을 때만 diff/쓰기 단계로 간다.
명세 closure만 맞고 plugin이 private helper를 직접 참조한 상태도 쓰기 전 실패해야 한다.
각 위반은 기존 검사와 같은 file/line/rule/message 형식이며, 전이 위반에는 의존 chain을 남긴다.
CLI는 위반·해석 실패에서 1, 정상에서 0이다. package.json의 신규 `verify:shared`로 노출하고
lint에 연결하여 `npm run check`에서도 실행한다.

| 검사 범위 | 구체적인 판정 |
| --- | --- |
| shared 생산 원본 | 앞의 명세·closure·runtime 검사; src/plugin/app-core·외부 package·시험 유입 금지 |
| app-core 생산 원본 | 자신의 모듈과 shared 공개 entry만 참조; Node·server·plugin·npm·시험 의존 금지 |
| 앱·도구·시험의 shared 참조 | alias/상대 경로를 같은 canonical key로 정규화; 공개 entry 여부와 type/runtime 구분 |
| plugin/bin·runtime | shared를 `plugin/lib/<path>`까지의 상대 import로만 소비; packages 원본·app-core·src 직접/간접 유입 금지 |
| 브라우저 graph | 실제 use client 진입점에서 로컬 runtime import·재수출·literal dynamic import를 추적하여 shared node entry 유입 거부 |
| 테스트·fixture | Node 내장 시험 모듈과 기존 시험 의존성을 허용하고 자기 원본 내부를 검증할 수 있음. 생산→시험·외부→shared private 우회는 계속 거부 |

생산 graph와 시험 graph를 먼저 구분한다. `.test.*`, 소유 영역의 `testing/`, 루트 `tests/`는
시험 코드이며 node:test·node:assert/strict 등의 import 때문에 universal 생산 위반으로 분류하지 않는다.
이 예외는 시험의 실행 환경에만 적용한다. 시험 파일을 거쳐 서버 코드를 생산 graph에 끌어들이거나
shared/app-core 테스트를 핑계로 FSD 방향·server 내부 참조 registry를 우회할 수는 없다.
선언 파일도 타입 graph로 다루며 lib의 생산 `.mjs` 목록에 포함하지 않는다.

원본 탐색은 src, packages/shared, packages/app-core, plugin/bin, plugin/runtime,
scripts, tests의 first-party 코드를 대상으로 한다. `.git`, node_modules, `.next`, src/generated와
private templates/evals 외에 **plugin/runtime/macos/node·plugin/runtime/windows/node 전체**를
디렉터리 진입 전에 제외한다. 이 두 트리는 binary뿐 아니라 배포용 npm JavaScript도 포함한다.
그 내부 JS를 프로젝트 모듈로 파싱하거나 위반 수·파일 수에 넣지 않는다. 이 제외는 기존 native
asset 선택의 검사 소유자를 유지하는 것이며, 생산 ESM 코드가 그 경로로 import해 경계 검사를
피할 수 있다는 뜻이 아니다. 설치·asset 선택은 기존 native 계약에서 확인한다.
로컬/alias 참조가 해석되지 않으면 해당 경계 검사를 실패시킨다. shared/app-core 밖의 외부 npm
구현 전체를 재귀 파싱하는 범용 bundler는 만들지 않고 기존 type/build 검증에 맡긴다.
생성 lib는 독립 원본으로 분석하지 않고 shared map에 대응시킨다. lib가 아직 없는 최초 sync에서도
plugin의 `../lib/...` 참조를 원본 key로 검사할 수 있어야 한다.

런타임 `.mjs` 해석은 실제 실행 파일을 사용한다. TypeScript resolver가 인접 `.d.mts`를
돌려주었다고 그것을 실행 원본이나 배포 대상에 넣지 않는다. type-only import/re-export와
import-type은 공개·소유권 검사에는 포함하되 runtime closure나 복사 집합에는 넣지 않는다.
runtime과 type graph를 같은 boolean 추측으로 혼동하지 않는다.

Next의 top-level `use server` 모듈은 Client에서 Server Function reference로 소비될 수 있다.
브라우저 graph가 그 경계 너머의 서버 구현을 브라우저 실행으로 잘못 판정하면 안 된다.
선언된 top-level directive와 실제 import/export 바인딩을 확인한 Server Function 경계에서
브라우저 추적을 멈추고, 서버 graph·기존 FSD 규칙·fresh build의
Action 공개 집합은 별도로 검사한다. 파일명의 `.server`나 임의 함수 내부 directive만으로
모듈 전체를 예외 처리하지 않는다. 단순 상수·hash 함수에 use server를 붙이는 우회도 허용하지 않는다.
근거는 설치된 Next 16.4.2의 `use-client`, `use-server` 문서와 기존 Action/manifest 시험이다.

verify-fsd에는 두 새 alias와 새 원본 탐색 경로를 반영하고 옛 core/github 전용 판정을 제거한다.
FSD layer·slice·서버 adapter 규칙은 계속 그 검사기가 소유한다. verify-server는 서버 façade·
초기화·방향·registry를 계속 소유한다. 전체 검사기를 새 범용 분석 프레임워크로 재작성하지 않는다.

### 3. sync와 check의 실패·복구

`diffPluginLib(projectRoot)`, `syncPluginLib(projectRoot)`의 동기 API와 `{ drift, orphan }` 형태,
기존 CLI 옵션·성공/실패 exit code를 유지한다. 내부 SOURCES/sourceModules는 검증된 shared map으로
교체한다. 실행 전에 필요한 개발 도구는 구현 checkout의 `npm ci`로 준비하며 설치 플러그인은
이 도구를 import하지 않는다.

| 상태·입력 | 관찰할 결과와 쓰기 경계 |
| --- | --- |
| --help·잘못된 옵션 | project 원본 없이 help 가능; 오타·추가 인자는 2. lib 생성·변경·삭제 없음 |
| 명세·원본·소비자·runtime·대상 경로 오류 | 전체 preflight 실패. 기존 lib와 orphan 바이트·경로·mtime 유지 |
| --check | 기대 집합과 실제 `.mjs`를 비교. drift/orphan이면 1, 같으면 0. 어떠한 쓰기·정리도 하지 않음 |
| 첫 sync, lib 없음 | 모든 입력 검증 후 디렉터리와 파일 생성. 생성 lib를 의존성 탐색의 입력으로 요구하지 않음 |
| 정상 sync | 달라진/빠진 파일만 바이트 복사, 기대 집합 밖의 관리 대상 생산 `.mjs`만 제거 |
| 두 번째 sync | 같은 입력에서 drift/orphan 빈 목록. 내용·경로·변경 없는 파일의 mtime 유지 |
| IO 실패·중단 | 비정상 종료. 부분 생성물은 성공으로 보고하지 않으며 패키징 금지. 새 프로세스의 check로 차이를 확인하고 sync 재실행 |
| 동시 실행 | 단일 checkout에서 source 편집·sync·package를 직렬화. 별도 작성자는 격리 checkout 사용; 전체 sync의 원자성·공유 checkout 동시 쓰기 지원을 주장하지 않음 |

source·plugin/runtime·native resource·사용자 설치본은 sync의 쓰기 대상이 아니다.
기존 `.gitkeep` 같은 비생성 파일은 보존한다. 예상치 못한 개발 자료가 lib에 있더라도
무차별 삭제하지 않는다. 실제 출하 후보에 그런 파일이 포함되면 아래 패키징 검사가 거부한다.
partial failure 시험은 복사 도중의 제어 가능한 실패로 재현하고 POSIX chmod만으로 Windows의
같은 실패를 가정하지 않는다. 테스트를 위해 plugin 제품 API에 fault injection 옵션을 넣지 않는다.

### 4. 패키징·출하 판정과 추적 파일

H1의 공통 predicate가 반영됐으면 두 패키저·version checker가 그 소유자를 계속 참조한다.
predicate의 templates/evals/test 제외 의미나 native 의존성을 이 계획 때문에 넓히지 않는다.
현재 전체 plugin 출하 판정과 shared 실행 closure는 서로 다른 책임이다.

두 패키저가 사용할 신규 `validatePluginModulesForPackaging(projectRoot, trackedFiles)`는
`scripts/plugin-lib.mjs`가 소유한다. 원본/소비자 검증·diff와 추적 집합 대조를 한곳에서 수행하고
성공 시 `{ libModules, pluginModules }`의 두 경로/바이트 map을 반환하며 파일을 쓰지 않는다.
검사 범위는 생성 lib와 plugin/bin·runtime의 직접 소유 모듈까지다. 이것은 두 실제 build 소비자를
위한 API이며 새 파일 위치 목록을 패키저별로 수동 복제하지 않는다.
`packageMacosPlugin`, `packageWindowsPlugin`은 기존 출력 경로·runtime·verifier 검증을 보존하고,
**출력 디렉터리를 만들기 전** 다음을 추가한다.

1. shared graph와 경계 검사를 성공시키고 같은 snapshot의 내부 diff에서 drift/orphan이 0인지 확인한다.
2. 기존 `git ls-files -- plugin`과 공통 predicate가 선택한 `plugin/lib/` 하위 집합이
   기대 shared closure와 정확히 같은지 확인한다. untracked 생성 파일, staged 삭제 누락,
   불필요한 tracked lib metadata·타입·README·시험은 성공 후보에 포함하지 않는다.
3. 경계 검사에서 열거한 first-party plugin/bin·runtime의 생산 JS map과 추적된 출하 후보의
   같은 분류 집합은 양방향으로 같아야 한다. 추적 목록에만 남은 삭제 파일도 preflight에서 거부한다. 새로 이동할 harness-config·watch·QA config·install-manifest·metadata의
   원본이 작업 트리에만 있고 Git 추적에서 빠진 경우도 output 생성 전에 실패한다. 이 목록은
   소스 탐색 결과에서 얻고 native Node/npm·시험·fixture는 앞의 분류에 따라 제외한다.
4. 실제 선택된 파일의 바이트와 경로를 기대 map과 대조한다. 패키저가 sync를 몰래 실행해서
   잘못된 저장소 상태를 고치거나, 누락 파일을 건너뛰고 성공하도록 하지 않는다.
5. 검증된 lib와 직접 소유 모듈을 기존 plugin 자원과 함께 패키징한다. native Node·license·mode·hook 변환·
   verifier의 두 위치 복사와 checksum, sourceRevision과 inventory 계산은 그대로 유지한다.

패키저가 공통 검사기를 사용할 때 OS별 native 준비 모듈을 범용 graph/predicate에 역으로
끌어들이지 않는다. 최종 package inventory의 lib 행은 source map과 비교하며, source map 외의
plugin 파일은 기존 출하 계약으로 비교한다. 검사기가 스스로 계산한 수만 다시 읽는 시험으로 끝내지 않는다.
미추적 모듈의 검증은 이 파일들을 자동 stage하라는 기능이 아니다. 누락 경로와 필요한 조치를
보고하고 종료한다. 직접 소유 runtime 모듈은 lib로 복사하거나 sync에서 삭제하지 않는다.
개발 중에는 이번 작업의 새/이동 파일을 추적 후보로 반영한 뒤 검증하고, 최종 산출물은
깨끗한 tested commit에서 만든다. dirty HEAD에 sourceRevision만 찍힌 번들을 출시 증거로 쓰지 않는다.

한 호출 안에서 그래프·AST·원본 바이트를 한 번 읽고 소비자 검사·diff·추적 집합 대조가 재사용한다.
패키징 사전 검사에서 public diffPluginLib을 다시 호출해 전체 그래프를 재구축하지 않고,
검증된 snapshot을 받는 내부 diff를 사용한다. 이는 파일·함수의 내부 구현 세부화이며 새 공개
API나 영구 cache가 아니다. 별도 sync/check/package 호출은 항상 새 입력을 읽는다.

새 lib/runtime 출하는 양 plugin manifest의 동일한 높은 버전을 필요로 한다.
버전 숫자는 지금 정하지 않고 구현 때 origin/main·origin/dev와 실제 변경을 대조한다.
`verify:plugin-version`의 검사는 최종 commit 기준으로 하며 이 문서 작성에서 실행하지 않는다.

## Change detail for TASK-MIGRATE-03

Canonical Task: [TASK-MIGRATE-03](./shared-modules-and-plugin-distribution.md#task-migrate-03-시험-탐색과-현재-규칙-전환).
검증 참조: [VFY-SMB-01](./shared-modules-and-plugin-distribution.md#vfy-smb-01-영구-문서공개-목록의-의미-대조), VFY-SMB-04.

### 1. 시험 위치와 실제 실행을 함께 변경

기존 순수 동작 사례를 새 소유자 옆으로 옮기고 혼합 시험만 분할한다.
구현 파일마다 새 시험을 만들거나 이전/새 함수의 같은 계산을 시험 안에 복제하지 않는다.
새 helper는 기존 정상·거부 사례가 실제 소비자를 거쳐 계속 검사되는지 확인한다.

| 현재 시험 | 이동 후 실행 목적지·환경 |
| --- | --- |
| core의 유지되는 공통·앱 순수 `.test.mjs`와 repo-url | shared/app-core의 인접 `.test.mjs`, npm test 및 양 OS 제품 suite |
| harness-config·watch·manifest와 vars의 plugin 부분 | plugin/runtime의 configuration/execution/templates/qa 인접 `.test.mjs`; 재귀 glob |
| pipeline/run-input.test.mjs | `src/server/pipeline/input-validation.test.ts` |
| plans/entitlement.test.mjs의 가용성 부분 | `src/server/projects/availability-policy.test.ts`; shared limits/app-core 권한 부분은 각 인접 mjs 시험 |
| plans/usage-window.test.mjs | `src/server/usage/usage-window.test.ts` |
| tokens/token.test.mjs의 발급·해시·roundtrip | `src/server/tokens/token-crypto.test.ts`; parser는 shared의 인접 mjs 시험 |
| qa.test.mjs의 보고 부분 | `src/server/pipeline/qa-report.test.ts`; 설정 부분은 plugin runtime |
| templates/release-manifest.test.mjs의 제작·선택 부분 | `src/server/templates/release-preparation.test.ts`; 공통 계약·hash는 shared의 인접 mjs 시험 |
| templates/runbook.test.mjs의 저장 stale 사례 | 기존 `tests/server/runbook-stale.test.ts`에 주입 DB 사례 통합; hash/version은 shared mjs 시험 |
| github/blob-url.test.mjs | 기존 `src/fsd/entities/board-item/model/doc-link.test.ts`에 인코딩·ref 사례 통합 |
| pipeline/pipeline-types.test.ts | `packages/app-core/pipeline/pipeline-types.test.ts`; tsc의 타입 전용 검사로 유지 |

원본 request-rate에는 인접 시험이 없고 runner의 서버 timing 상수만을 위한 독립 사례도 없다.
이를 파일 수 맞추기용 새 시험으로 만들지 않고 기존 request-rate-service·runner-service와 DB
통합 시험을 유지한다. server 내부 참조가 늘어난 시험·리허설은 server.md registry의 정확한
파일/모듈/이유로 등록하고 사용하지 않게 된 행을 제거한다.

`npm test`의 대상은 `packages/shared/**/*.test.mjs`, `packages/app-core/**/*.test.mjs`,
기존 `plugin/bin/*.test.mjs`, `plugin/runtime/**/*.test.mjs`로 전환한다.
plugin/bin의 현재 단일 깊이는 유지한다. test:web의 src 재귀, test:server의 bootstrap,
test:scripts의 scripts 재귀와 TypeScript 타입 검사는 기존 책임을 유지한다.

서버/FSD로 옮긴 `.ts` 시험은 기존의 양 OS npm test 대상에서 빠지므로 별도로 보존한다.
신규 npm 명령 `test:policy-contracts`는 아래 **8개 목적지**를 기존 server-only bootstrap과 tsx로
실행한다. 일반 plugin mjs 시험 프로세스에 bootstrap/tsx를 강제로 추가하지 않는다.

```text
src/server/pipeline/input-validation.test.ts
src/server/projects/availability-policy.test.ts
src/server/usage/usage-window.test.ts
src/server/tokens/token-crypto.test.ts
src/server/pipeline/qa-report.test.ts
src/server/templates/release-preparation.test.ts
src/fsd/entities/board-item/model/doc-link.test.ts
tests/server/runbook-stale.test.ts
```

이 alias의 실행 형식은 기존 `node --import ./tests/server/register-server-only.mjs --import tsx
--test`에 위 경로를 인자로 전달하는 것이다. DB 연결은 필요하지 않다. 필요한 개발 의존성과
Prisma client는 해당 checkout의 npm ci·db:generate로 준비한다. 같은 façade가 참조하는
projects/registration-service는 Prisma 값을 runtime에서 읽으므로 타입 import만 있다고 가정하지 않는다.
Linux에서는 기존
test:web/test:server가 같은 파일을 발견하며, Windows/macOS에서는 이 alias를 명시적으로 실행한다.
새 또는 합쳐진 목적지의 발견·실행·skip을 이전 사례에 대응시켜 파일 이동으로 빠진 사례가 0인지 확인한다.

### 2. CI와 gate 감지

기존 job을 재사용한다. 새 OS job·실제 모델 gate를 추가하는 계획은 아니다.

| 위치 | 변경할 내용 |
| --- | --- |
| macos-runtime-contracts/contracts | 기존 arm64/x64 matrix 유지. product mjs glob 전환; npm ci·db:generate 뒤 policy-contracts와 아래 공유 도구 시험 실행 |
| windows-role-runtime/native-runtime | 기존 native runtime·전체 제품 시험 유지. npm ci·db:generate 뒤 같은 policy-contracts와 공유 도구 시험 실행 |
| check/check | 새 lint/verify:shared·scripts 시험은 static, 이동 TS 시험은 test-web/server, 나머지 새 mjs는 test에 발견. 기존 fresh build step 유지 |
| check/server-integration | 기존 격리 PostgreSQL 18과 전체 통합 시험 유지. 새 schema migration 없음 |
| 두 runtime workflow의 paths | core/github를 shared/app-core로 교체. 새 graph/checker·plugin-lib와 위 8개 정책 시험/해당 구현 경로의 변경도 잡음 |
| verification CI coverage | 기존 제품 코드 시험 행의 새 glob을 맞추고, policy-contracts·공유 도구 시험의 OS별 행을 같은 변경에서 기록 |
| verify-ci-coverage와 시험 | 새로운 문자열·실행 alias가 실제 양 OS job에서 발견되는지 양성/누락 사례로 확인. 단순 문서 행 추가로 통과시키지 않음 |
| AGENTS·pipeline-smoke-steps.test.mjs | 아래 gate 대응표의 모든 새 소유 경로를 반영. app-core/pipeline·shared/templates뿐 아니라 server/templates로 분리되는 생산 파일과 이동 시험도 포함하고 옛 경로 제거. 나머지 기존 trigger는 보존 |

양 OS에 추가할 도구 시험은 `scripts/plugin-lib.test.mjs`, 신규
`scripts/lib/shared-module-graph.test.mjs`, 신규 `scripts/checks/verify-shared-boundaries.test.mjs`,
`scripts/macos/package-plugin.test.mjs`, `scripts/windows/package-windows-plugin.test.mjs`다.
Node 내장 시험 실행기와 기존 개발 의존성만 사용한다. Linux에서는 test:scripts가 실행한다.
경로·link·실제 파일 복사를 다루므로 공통 세 시험은 OS별로 분류한다.
macOS package 함수 시험은 darwin에서 실제로 실행하고 다른 OS의 skip 이유를 명시한다.
Windows package fixture는 기존 실행 범위를 유지하며 Windows 실행 결과를 따로 확인한다.
package 시험까지 실제 job에서 발견되도록 coverage 확인 문자열에 두 경로를 포함한다.
`test:policy-contracts`도 기존 OS별 제품 정책 사례를 보존하는 행으로 기록한다.
두 행의 확인 문자열은 실제 명령 또는 파일명을 사용하고 두 OS를 비워 두지 않는다.

양 OS workflow는 moved server/FSD 구현과 검사 파일이 **각각 단독 변경**돼도 필요한 job이
실행되게 필터를 구성한다. 새 graph/checker를 추가하면서 기존 plugin/native trigger를 빼지 않는다.
AGENTS의 pipeline-smoke 감지는 전체 gate를 실행하는 대신 기존 `smokeTriggerPaths` 계약 시험에
새 경로 단독 변경 사례로 확인한다. 실제 gate dispatch는 이 Phase의 로컬 검증과 별개다.

기존 `packages/core/pipeline`·`packages/core/templates`에 속한 원본/시험/선언의 변경 감지를
새 소유자로 연결한다. 디렉터리 이름 두 개만 바꾸면 서버로 분리한 함수가 감지에서 빠진다.

| 기존 gate 대상 | 전환 뒤 보존할 경로 |
| --- | --- |
| core/pipeline의 앱 정책·타입·시험 | `packages/app-core/pipeline` |
| core/pipeline/run-input | 기존 `src/server/pipeline`이 새 input-validation.ts와 시험을 포함하므로 유지 |
| core/templates의 공통 계약·타입·시험 | `packages/shared/templates` |
| core/templates의 plugin 전용 구현·시험 | 기존 `plugin/runtime`이 새 templates 하위 경로를 포함하므로 유지 |
| core/templates/release-manifest의 서버 부분 | `src/server/templates/release-preparation.ts`, `src/server/templates/release-preparation.test.ts`를 명시적으로 추가 |
| core/templates/runbook의 저장 stale 부분 | `src/server/templates/runbook-query.ts`, `tests/server/runbook-stale.test.ts`를 명시적으로 추가 |

이 표의 마지막 네 파일은 shared/templates나 기존 server/pipeline prefix로 포함되지 않는다.
상위 inventory에서 기존 gate에 해당하는 생산 원본 13개를 새 생산 목적지 17개와 시험 목적지
18개로 대조한다. 선언이 `.ts`에 합쳐지거나 새 패키지의 인접 `.d.mts`로 옮겨지는 경우도 해당
파일/디렉터리 감지로 보존한다. 다른 기존 trigger와 동시 작업이 추가한 helper 경로는 제거하지 않는다.

계약 시험은 경로 문자열의 존재만 확인하지 않는다. AGENTS에서 읽은 실제 pathspec을 사용하여
자기 임시 Git fixture에서 각 새 대상 파일만 바꾼 `git diff --name-only` 결과가 비어 있지 않은지
확인한다. docs/proposals 아래 문서만 바꾼 대조는 이 소스 감지 목록에 걸리지 않아야 한다. 마지막 네 경로 중 하나를
빠뜨린 대조에서는 그 파일의 단독 변경 감지가 실패해야 한다. 새 제품 API나 gate dispatch는 필요 없다.

### 3. 현행 문서·ADR 활성화

소스·검사·시험 전환이 성립한 최종 변경에서 다음을 함께 처리한다.

- shared-modules의 planned/activates-after 표기와 예정 안내를 제거하여 실제 현행 구조로 쓴다.
  공개 표·runtime·JSON 예시는 실제 명세와 같은지 검사한다.
- core.md/github.md는 오래된 계약을 현행처럼 남기지 않고 새 소유 문서로 안내한다.
  과거 문서의 링크가 깨지지 않도록 문서 경로는 유지한다.
- architecture README·fsd·server·verification·test-organization·protocol·macos-runtime의
  예정 안내를 실제 규칙·경로로 전환한다. pipeline-execution·system-overview·test-writing의
  현행 경로 예시도 필요한 부분만 맞춘다. 도메인 glossary와 역사적 본문은 일괄 치환하지 않는다.
- ADR-0008은 accepted, 0005/0007은 superseded 및 superseded-by 0008로 바꾸고 index를 맞춘다.
  이전 ADR의 결정 이유·당시 사실은 보존한다.
- AGENTS, 루트/plugin/packages README, watch/init skill의 실행 경로를 실제 결과에 맞춘다.
  제거되는 packages/core README 대신 새 소유 영역의 README는 architecture 안내를 소유하며
  공개 목록을 다시 복제하지 않는다. 빈 옛 디렉터리를 README만으로 남기지 않는다.
- 상위 SDD와 이 계획에 실제 commit·환경별 검증·미실행 ACCEPT 항목을 기록한다.
  MIGRATE 완료 후 이 상세 계획만 completed로 이동하고 상위 SDD는 ACCEPT까지 active로 둔다.

## Verification Detail

이 절은 상위 VFY를 구체화한다. 새 VFY 정의나 같은 REQ의 별도 정의를 만들지 않는다.
아래 모든 **구현 후 검증은 Planned / Not executed**다.

| 이번 Phase의 완료 범위 | Task·구현 목적지 | 관찰할 VFY |
| --- | --- | --- |
| REQ-SMB-001 | TASK-MIGRATE-02, plugin-lib와 shared map | VFY-SMB-03: 앱 전용 입력 변경 후 lib 경로·바이트 동일 |
| REQ-SMB-002 | TASK-MIGRATE-02, manifest/graph/sync | VFY-SMB-03: closure 완전성·무변경·쓰기 전 거부·복구 |
| REQ-SMB-003 | TASK-MIGRATE-01/02, 새 소유자·공개 API·경계 검사 | VFY-SMB-02/03: 금지·private·시험·node 유입 거부와 원인 경로 |
| REQ-SMB-004의 저장소 동작 보존 | TASK-MIGRATE-01, 이동한 정책·실제 호출부 | VFY-SMB-02/04: façade·build·정상/거부·hash·권한·부수효과. 독립 설치 조합은 ACCEPT |
| REQ-SMB-006 | TASK-MIGRATE-03, 현행 architecture·ADR·원본 명세 | VFY-SMB-01: 실제 코드와 문서·registry·coverage 일치 |
| REQ-SMB-007 | TASK-MIGRATE-03, npm scripts·양 OS workflow·이동 시험 | VFY-SMB-04: 발견·타입·실행·skip의 이전 사례 대응 |

INV-SMB-001과 CON-SMB-001~003의 보존은 같은 실행 결과와 변경 범위 대조에서 확인한다.
관찰 요구사항을 늘리거나 규칙 검사를 별도 제품 요구사항으로 재정의하지 않는다.

### VFY-SMB-01의 적용: 현행 문서와 소유권

문서·JSON·실제 export·소비자·시험을 대조한다. 신규 manifest는 구조적으로 파싱하고
공개 표와 path/runtime 집합이 정확히 같아야 한다. 이전 alias/원본 실행 참조가 0이며,
보존한 역사·fixture 참조는 파일별 이유가 있어야 한다. ADR metadata·index, 링크·anchor,
server registry·CI coverage와 실제 구현을 함께 검사한다. pipeline-smoke pathspec은 Task의 gate 대응표와 대조하여 서버로 이동한 템플릿 정책·시험까지 포함하는지 확인한다.

### VFY-SMB-02의 적용: 허용·거부와 최종 실행 경계

신규 graph/checker 시험 및 기존 FSD/server 경계 시험에서 다음 대조를 만든다.

| 입력·경로 | 기대 관찰 |
| --- | --- |
| 정상 public import, 내부 helper closure, node entry의 builtin | 정상; helper는 외부 public 목록에 추가되지 않음 |
| shared→app-core/src/plugin/npm, app-core→server/plugin/Node | 실패하며 최초 import부터 위반까지의 경로 표시 |
| plugin→packages 원본·src 또는 shared private | lib가 없어도 같은 위반 검출 |
| universal→node entry/builtin 직접·다단계 참조 | 실패; 일부 상수가 순수해도 module runtime을 우회하지 않음 |
| use client→중간 local module→shared node | 실패; 단순 direct-import 검사만 통과한 상태를 정상으로 보지 않음 |
| Client→유효한 Server Function, type-only node 선언 | 브라우저 runtime 유입으로 오판하지 않음; 공개·서버 경계와 타입/build는 계속 검사 |
| 댓글·일반 문자열의 import 예시, type reexport | 가짜 실행 edge를 만들지 않음 |
| app-core/shared의 Node 기반 인접 시험과 같은 import를 한 생산 파일 | 시험은 허용, 생산은 거부; 생산→그 시험 경유도 거부 |
| native Node/npm 제외 트리의 큰 JS fixture와 first-party 위반 대조 | vendor는 미탐색, 제외 트리 밖의 실제 위반은 계속 검출 |
| `.mjs`와 인접 `.d.mts`, literal dynamic import | runtime 원본/타입 표면을 구분하고 실제 runtime closure 확인 |
| 계산형 shared import, missing source, forbidden test helper | 실패; unknown 해석을 조용히 통과시키지 않음 |
| tokens/api·templates/api의 간접 DB singleton 추가 | 기존 verify:server 초기화 검사가 실패 |

fresh build 뒤 기존 `github-action-manifest`, `project-connection-bindings`, `mutation-identifiers`,
`pipeline-save`, `pipeline-settings`, `project-page-loaders`, `project-guard` 등의 실제 manifest 시험을
기존 flags로 실행한다. 새 node hash·발급 함수가 Action export로 등록되지 않고, 기존 guard·
서버 loader의 공개 집합이 유지되어야 한다. 상위의 DB 비초기화 계약과 plain Node 리허설 helper
import도 실제 새 경로에서 확인한다. 정적 import 표의 존재를 빌드 산출물 검증으로 대신하지 않는다.

### VFY-SMB-03의 적용: 배포 집합과 무변경·복구

`scripts/plugin-lib.test.mjs`는 작은 격리 fixture로 전체 사전 검증과 쓰기 결과를 본다.
원본과 명세만으로 생성, 내부 helper 누락 방지, 제거된 entry의 orphan 정리, 정확한 byte/path,
두 번 실행의 무변경, app-core/server 파일 변경 시 lib hash 불변을 확인한다.
명세 shape·runtime·중복·경로 탈출·원본 누락·computed import·생산→시험·symlink/junction·
대상 hardlink를 각각 거부하고 **기존 lib/orphan 및 바깥 sentinel의 바이트·mtime**을 비교한다.
IO 실패 뒤 새 프로세스의 check가 불일치를 찾고 재실행이 회복하는 순서를 검사한다.

공통 validatePluginModulesForPackaging 시험은 임시 원본·명세·추적 파일 목록으로 집합 오류를 대조한다.
lib가 완전히 일치해도 plugin/runtime/qa/config.mjs 같은 직접 소유 모듈 하나를 추적 목록에서
누락시키면 실패해야 한다. 그 모듈을 올바르게 추적한 대조는 통과하고, output은 거부 전후 없다.
두 package 함수의 시험은 자기 임시 Git fixture 또는 격리 source 사본에서 호출하여 lib가 없거나
drift/orphan·추적 누락이 있을 때 output 생성 전 실패하는지 확인한다. 실제 작업 checkout의
lib·manifest를 바꾸고 원복하는 시험으로 만들지 않는다. macOS의 현재 hook-only 시험에는
실제 packageMacosPlugin 호출 사례를 추가한다. runtime의 provenance·mode·checksum fixture는
기존 macos-runtime/Windows package 시험 방식을 따르고, fixture binary를 실행하지 않는다.
두 package 함수의 repository 상수는 import.meta.url에서 계산되므로 cwd만 임시 폴더로
바꾸는 방식은 격리가 아니다. 시험은 필요한 first-party 소스·명세·설정·완전한 verifier 자료를
작업 트리의 **현재 바이트**로 자기 임시 사본에 두고, 그 사본의 scripts/macos 또는 scripts/windows
위치에서 package 모듈을 로드한다. Git fixture도 그 사본 안에 만들고 후보/누락 파일을 명시적으로
추적한다. HEAD archive만 사용하여 아직 커밋하지 않은 새 구현을 빠뜨리지 않는다.
필요한 TypeScript 개발 도구는 이미 설치된 동일 판의 자료를 시험 소유 사본에 준비한다.
새 npm 설치나 원래 node_modules의 디렉터리 링크에 의존하지 않으며, 원본 설치 자료를 정리하지 않는다.
각 실패 사례는 fixture 안의 새 output을 사용하고 t.after/finally에서 자기 자료만 정리한다.
테스트를 위해 package 함수에 sourceRoot 우회 옵션을 추가하거나 원래 checkout을 손상시키지 않는다.
정상 fixture는 독립적으로 정한 기대 경로/내용과 package inventory를 대조한다. 개발 metadata는
없고, native Node·verifier·license·mode·hook은 기존 계약대로 있어야 한다.
Windows의 파일 종류와 macOS의 실행 권한은 각각 실제 OS 결과로 기록한다.
지원되지 않는 링크 생성 환경의 skip을 그 거부 계약 통과로 세지 않는다.

앱 전용 변경 무영향은 shared/lib/plugin 원본 입력이 같은 상태에서 기대 집합과 바이트가
같은지를 뜻한다. package의 sourceRevision 같은 의도적 provenance 필드는 코드 revision을
기록하므로 전체 archive hash가 무조건 같아야 한다는 잘못된 assertion을 만들지 않는다.

### VFY-SMB-04의 적용: 제품 계약과 발견 보존

기존 fixture를 새 소유자로 연결하여 slug·URL, token 형식/발급/만료, plan/가용성, pipeline
입력/전이, QA 거부, template canonical/hash/installation, runner 상태/limited 문자열을 확인한다.
request-rate·가용성·token·pipeline·template의 기존 서버 및 PostgreSQL 통합 시험을 유지한다.
호출자의 인증·소유자·scope 거부에 허용하지 않은 DB 쓰기가 없고, 기존 transaction 결과가 같아야 한다.
랜덤 토큰 값 자체의 동일성을 요구하지 않고 형식·고유성·hash/parse 관계를 확인한다.

이동 전 시험 파일/사례 → 새 목적지 → 실제 npm/CI 명령 → pass/fail/skip 결과를 기록한다.
타입 전용 pipeline-types는 tsc로, `.mjs`는 Node로, 이동 `.ts`는 tsx와 필요한 bootstrap으로
계속 발견된다. 통합된 blob/runbook 사례는 파일 감소를 시험 삭제로 착각하지 않도록 연결한다.
Windows/macOS의 실제 실행과 Linux의 통과를 구분한다.
원본 13개에서 나온 gate 대상의 새 생산 17개·시험 18개를 단독 변경 대조에 연결한다.
특히 server/templates의 두 생산 파일과 두 시험 경로가 빠지면 이 전환 검증을 실패로 처리한다.
이는 변경 감지의 보존 증거이며 실제 모델 pipeline-smoke 통과 증거가 아니다.

## Planned Commands and Environments

구현용 checkout의 루트에서 실행한다. 의존성·생성물은 그 checkout이 소유하며 다른 작업의
node_modules·.next·Prisma client에 쓰기를 공유하지 않는다. 아래 구현 명령은 이번 문서 작성에서
실행하지 않았다. `verify:shared`, `test:policy-contracts`는 위 Task가 추가할 명령이다.

### 개발 도구·새 구조와 기본 회귀

POSIX shell 예시이며 각 블록의 실패를 즉시 전달한다.

```bash
set -e
npm ci --include=dev
npm run db:generate
npm run sync:plugin-lib
node scripts/plugin-lib.mjs --check
npm run verify:shared
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:server
npm run test:policy-contracts
npm run build
RDC_CHECK_ACTION_MANIFEST=true SRC_CHECK_INBOX_MANIFEST=true GITHUB_CHECK_ACTION_MANIFEST=true node --import ./tests/server/register-server-only.mjs --import tsx --test --test-name-pattern='\bfresh\b' 'tests/server/*.test.ts'
```

check의 typegen과 build를 같은 `.next`에서 동시에 실행하지 않는다. Windows에서는 같은 명령을
각각 실행하고 `$LASTEXITCODE`가 0인지 확인한다. manifest 검사의 세 flag는 PowerShell의
`$env:`로 설정한 뒤 종료 시 제거한다. 실제 양 OS workflow의 기존 오류 전달 방식을 유지한다.
여기서 새 구조 이후의 시험을 baseline에서 없는 파일 때문에 실패시킨 결과는 인수 증거가 아니다.

### 격리 DB와 실제 호출 회귀

기존 `scripts/lib/test-database.mjs`가 허용하는 별도 PostgreSQL 18 테스트 DB를 준비하고
TEST_DATABASE_URL로 전달한다. 운영/개발 DB URL을 복사하지 않는다.
`npm run test:server:integration`은 자체 안전 검사 뒤 자식 프로세스에만 DATABASE_URL을 전달하고
migrate deploy를 수행하므로 부모 DATABASE_URL을 테스트 URL과 같게 export하지 않는다.

```bash
set -e
npm run test:server:integration
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-account-usage-and-tokens.ts
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-acceptance-failure.ts
```

두 리허설은 기존의 모델 없는 HTTP/DB 경로로만 실행하고 private template·browser·machine-change
옵션을 추가하지 않는다. acceptance-failure의 runbook/install 비교는 `--templates` 분기 안이므로
기본 실행으로 그 분기까지 통과했다고 기록하지 않는다. 이동한 stale 판정은 앞의 주입 DB 시험으로
MIGRATE에서 보존하고 실제 private template→init→hash/installation의 경로는 ACCEPT에서
해당 source와 환경을 고정해 검증한다. main 진입 전 환경 조건과 기존 fixture 정리 계약을 읽는다.
acceptance-failure는 기준 코드에서 esbuild를 전이 의존성으로 읽는다. scripts-coupling H3가
직접 의존성을 반영했는지 확인하고 현재 lockfile로 해석되는지 먼저 검사한다. 이를 위해
MIGRATE에서 무관한 dependency 업그레이드를 수행하지 않는다.
본 전환과 무관한 baseline 실패가 있으면 증거를 분리하고 영향받는 계약의 검증을 생략하지 않는다.

### OS·패키징과 최종 commit

위 두 runtime workflow에서 새 mjs glob, policy-contracts, 공유 도구 시험과 기존 native 검사가
통과해야 MIGRATE의 OS 발견/파일 동작 검증을 완료한다. 패키저 시험이 실제 native bundle을
실행하지 않은 경우 그 부분은 ACCEPT에 남긴다. 최종 commit을 만든 뒤
다음과 같이 HEAD를 고정하여 버전을 확인한다.

```bash
set -e
SMB_MIGRATE_HEAD="$(git rev-parse HEAD)"
npm run verify:plugin-version -- --head "$SMB_MIGRATE_HEAD"
```

이 값은 실제 검사가 통과한 최종 commit이어야 한다.
각 환경의 runtime 위치·output·기존 설치 revision이 필요한 실제 package/init 명령은 ACCEPT가
대상을 고정한 후 실행한다. 이 계획에 임의의 사용자 설치 경로나 운영 값을 채워 넣지 않는다.

`check` 및 필요한 양 OS CI가 green인 tested commit을 인계한다. production 승격,
agent-eval/client-init-smoke/pipeline-smoke의 실제 모델·설치 gate는 최신 AGENTS의 별도 출시
절차와 기존 승인 범위에 따른다. 이 문서의 명령 목록을 자동 dispatch 권한으로 읽지 않는다.

## Allowed Changes and Completion

| 구분 | 후속 구현에서 허용할 변경 |
| --- | --- |
| 원본·소비자 | 상위 ARCH Inventory의 모든 source/symbol/type/helper/import·문자열 참조와 그 새 소유 위치 |
| 신규 도구 | scripts/lib/shared-module-graph.mjs와 시험, scripts/checks/verify-shared-boundaries.mjs와 시험 |
| 기존 도구 | plugin-lib 및 시험, 두 package 및 시험, version checker 및 시험, FSD/server/CI coverage 검사와 관련 시험 |
| 설정·CI | tsconfig/package scripts, 두 runtime workflow의 path/실행 step, 실제 변경에 필요한 최소 check 연결 |
| 문서·출하 | 위 현행 전환 문서·ADR metadata/index·README·AGENTS·skill 경로·양 plugin manifest 버전 |

공통 predicate의 선행 H1은 실제 통합된 결과만 재사용한다. package-lock이나 새 dependency,
무관한 app/runtime 구현, DB schema, private templates, 사용자 캐시와 다른 worktree는 이 목록에
자동으로 포함되지 않는다. 변경 파일은 승인된 source map에 연결하며 새로운 소비자가 발견되면
계약·검증의 영향부터 기록한다.

종료 조건:

- 상위 symbol/type/helper/소비자의 미할당·중복 구현·설명 없는 제거가 0건이다.
- shared 공개/내부/runtime과 실제 명세·원본·lib가 일치하고 옛 생산 원본/alias/불필요한 복사본이 없다.
- CLI preflight/check 무변경, 반복 실행, IO 실패·복구, lib와 직접 소유 plugin 모듈의 추적 집합 검증을 통과했다.
- 생산/시험의 runtime 규칙이 구분되고 native Node/npm 제외 트리가 source graph를 바꾸지 않는다.
- 이동 시험의 발견·타입·실행 환경이 보존되고 필요한 Windows/macOS 증거가 있다.
- 현행 문서·ADR·registry·coverage·gate 경로가 실제 코드와 일치한다. 기존 gate 대상의 새 생산/시험 경로 중 감지에서 빠진 항목은 0건이다.
- 결과에는 tested commit, 요구사항별 VFY, 명령/환경, pass/fail/skip/미실행과 남은 ACCEPT 조건을 남긴다.

## Readiness, Conditions, and Downstream Boundaries

판정은 **CONDITIONALLY READY**다. 기준 코드와 ARCH의 소유권·API 결정은 일치하고
TASK-MIGRATE-01의 전환을 시작할 수 있는 수준으로 정리했다. 실제 구현은 별도 요청 범위에서
진행하며 다음 조건을 해당 지점에서 충족해야 한다.

| 조건 | 집행 지점과 중단 기준 |
| --- | --- |
| 최신 dev와 원본/소비자 재대조 | 첫 소스 수정 전. 승인된 소유권·제품 의미가 달라졌으면 해당 변경을 멈추고 상위 결정부터 정리 |
| H1의 공통 predicate 소유권 정리 | TASK-MIGRATE-02의 packager/version 수정 전. 미통합 소유 작업과 충돌한 상태에서 중복 모듈을 만들지 않음 |
| 격리 DB와 양 OS CI 실행 환경 | VFY-SMB-03/04 종료 전. 해당 환경이 미실행이면 MIGRATE 전체 완료/green을 주장하지 않음 |

현재 아키텍처 결정을 새로 선택해야 하는 미해결 충돌은 발견하지 않았다.
앞의 조건은 아직 수행하지 않은 구현·검증의 실제 진입/종료 조건이며 이미 통과한 증거가 아니다.
외부 템플릿·기존 설치본·출시 reader 조합은 상위 BLK-SMB-01이 소유하는 ACCEPT 조건이다.
그 사실로 독립적인 소스 전환을 막거나, 소스 검사의 통과로 그 조건이 해소됐다고 하지 않는다.

## Risks and Rollback

- 부분 이동은 import·타입·generator를 깨뜨릴 수 있다. 최종 PR을 일관된 단위로 검증하고
  Task 사이의 부분 상태를 배포하지 않는다. 실패 시 작업 범위를 보존하여 이어서 고치거나
  해당 전환 commit을 단위로 되돌린다. 원래 사용자의 dirty 파일을 reset하지 않는다.
- sync는 전체 트리 원자 작업이 아니다. 실패한 lib로 패키징하지 않고 원본·명세를 고정한 뒤
  재실행과 check로 회복한다. 사용자 설치본이나 plugin/runtime을 생성물 정리 대상으로 삼지 않는다.
- 새 server import의 초기화·브라우저/Action 노출은 타입 통과만으로 보장되지 않는다.
  실제 façade graph·fresh build·권한/발급/템플릿 회귀를 함께 확인한다.
- OS별 시험 목록의 누락은 조용한 검증 축소다. 새 TS 목적지와 재귀 runtime 시험을 별도 실행
  증거로 확인하며 skip을 pass로 바꾸지 않는다.
- 배포 전 rollback은 원본·명세·lib·소비자·검사·문서를 같이 되돌린다. 이미 출시한 뒤라면
  plugin 버전을 낮추거나 설치 캐시를 덮어쓰지 않고 별도 release/rollback 절차를 따른다.

## Verification Results for This Document

이 절은 **계획서 작성**의 검증이다. 위 VFY의 제품·배포 구현 인수와 구분한다.

| 확인 | 상태 | 범위 |
| --- | --- | --- |
| source·consumer·기존 검사·패키저·타입·CI·문서 재조사 | 확인 | 기준 51111ed와 상위 ARCH inventory를 대조. 원본 27개/값 export 175개/private 49개/type 31개/직접 참조 404건 |
| 작성 전 docs:check | PASS | Markdown 224개·상대 링크 1159개·시험 보고서 59개 |
| 작성 전 plugin-lib --check | PASS | 현재 core/github 복사본 일치. 새 명세 구현의 통과는 아님 |
| 작성 전 verify-ci-coverage | PASS | 현재 13 jobs·11 rows. 새 step과 coverage의 통과는 아님 |
| Next 경계 근거 | 확인 | 설치된 Next 16.4.2의 use-client/use-server 문서와 기존 fresh manifest 시험을 읽음 |
| 부모+이 계획의 traceability | PASS | standard bundle: canonical REQ 7개, Task 4개, VFY 5개 유지. 요구사항의 작업/Phase·VFY 연결 각각 7/7, 오류·경고 0개 |
| 새 계획의 metadata·링크·anchor | PASS | 상대 링크/anchor 13개, related 9개, 마지막 개행·줄 끝 공백 확인 |
| 신규 계획을 포함한 전체 문서 검사 | PASS | 추적 파일+이 미추적 파일을 inspectDocs에 전달: Markdown 225개·상대 링크 1172개·보고서 59개, 문제 0개 |
| 명령의 셸 구문 | PASS | bash/zsh -n으로 구현용 bash 블록 3개 검사. 명령 자체를 실행하거나 새 구조의 성공을 검증한 결과는 아님 |
| 선택 Phase 의미 검토 | 확인 | 부모 정의의 단일 소유, 세 Task의 목적지·순서, VFY별 정상/거부·복구, Server Function·type/runtime 경계, 양 OS 시험 발견과 종료 조건 대조 |
| 쓰기 범위와 입력 보존 | PASS | 새 계획 한 파일만 미추적. 부모·ARCH 완료 기록·architecture·ADR·AGENTS 해시 일치, 제품/시험/설정/기존 문서 변경 없음 |
| 구현 명령·새 시험·build·DB·양 OS·패키징·설치 | 미실행 | 문서 작성 요청이므로 소스/의존성/설정/기존 문서 변경 없이 계획만 작성 |

부모는 이후 ACCEPT의 요구사항·VFY도 포함하므로 strict로 전체 완료/준비도를 주장하지 않는다.
standard bundle 검사와 별도로 선택한 MIGRATE의 요구사항 완료 소유권·Task 변화·검증 목적지·
실패/복구·OS 발견·후속 조건을 의미 검토한다. 기계 검사의 성공은 구현이나 native 인수의 성공이 아니다.

## Approval and Completion

승인 필드는 실행 승인 기록이며 현재 문서 작성 요청만으로 채우지 않는다.
현재 산출물은 이 상세 계획이다. 실제 구현·부모/architecture 갱신·MIGRATE 완료 처리와
ACCEPT 착수는 수행하지 않았다. 후속 구현이 요청되면 이 source bundle과 최신 코드 차이를
확인하고 해당 승인 범위에서 진행한다.

## Engineering Review — 2026-11-16

### 검토 범위·근거·작업 크기

아래 F1~F4와 실행 결과는 첫 검토 기록이다. 후속 재검토의 F5는 이 절 말미에 따로 기록한다.

plan-eng-review로 이 계획의 구조·코드 품질·시험·성능을 순서대로 검토했다.
처음부터 개선점이 없었던 것은 아니다. 아래 F1~F4를 확인하여 본문 Task·VFY·종료 조건에 반영했다.
수정 전 입력 SHA-256은 `8b0d344f93b70aa7851e6b8759670d9784aee2201763c24177365957d28b5990`다.
선택한 파일의 후속 검토이며 부모·architecture·제품 코드·시험·설정은 읽기 전용으로 유지했다.
이 기록은 자체 검토다. 별도 독립 검토는 요청되지 않았고 수행하지 않았다.

실제 이동/분리 대상은 기존 생산 원본 27개·시험 27개·선언 6개로 최소 60개 파일이다.
목표 생산 모듈은 38개이며 그중 기존 doc-link·runbook-query 2개를 제외한 36개가 새 경로다.
여기에 신규 도구 2개·인접 도구 시험 2개·명세 1개, 기존 소비자·도구·문서 변경이 더해진다.
이 수는 이전/새 경로를 구분한 범위 설명이며 최종 Git rename/diff 수나 노력 추정은 아니다.
새 class·service·외부 dependency는 0개다. 읽기만 한 파일을 변경 파일로 합산하지 않았다.

| 핵심 전제 | 근거와 판정 |
| --- | --- |
| ARCH 결정과 생산 코드 | 부모/architecture의 14개 entry·59개 값, 현재 27개 원본과 helper/type/consumer 목록 일치. 검토 기준의 제품 변경 없음 |
| 현재 복사기는 전체 복사 | scripts/plugin-lib.mjs:5~58의 SOURCES·sourceModules·sync. 명세·runtime 검사는 아직 없음 |
| 기존 무변경·복구 일부 | plugin-lib.test.mjs:32~65, 105~171의 옵션·check·반복 실행·누락·충돌 무변경 assertion 확인 |
| 실제 package API | 두 함수는 output/runtimeDirectory를 받고 모듈 위치에서 repository를 정함. Git 추적 파일만 복사하며 임의 cwd는 source root를 바꾸지 않음 |
| generated/native 자원 | scripts/macos/build-runtime.mjs:19가 npm 전체를 runtime/macos/node/npm으로 복사. 단순 binary 제외로는 first-party graph가 되지 않음 |
| Node 기반 시험 | 기존 인접 시험이 node:test·node:assert를 사용. 순수 생산 runtime 제한을 그대로 시험에 적용하면 안 됨 |
| Next boundary | 설치된 Next 16.4.2 use-server 지침, 기존 server façade/Action/manifest 시험과 대조. source 경로 이동이 Action 공개 집합 변경은 아님 |
| DB·권한 | schema·transaction·guard 변경 없음. 기존 실제 DB/권한 시험을 보존하며 이번 검토에서 DB 인수를 실행한 것으로 기록하지 않음 |
| 동시 작업 | #348은 운영 문서만 병합됨. H1/H3의 실제 병합 상태는 구현 시 확인하는 조건이며 현재 적용됐다고 전제하지 않음 |

기존 시설이 해결한 CLI·node:test·TypeScript parser·server registry·CI coverage·native 패키징은
그대로 재사용한다. 임의의 재출시·DB 작업·새 검증 framework를 추가하지 않는다.
원 요청의 6개 MIGRATE 요구사항은 포함되고, 독립 설치 조합은 상위 결정대로 ACCEPT에 남는다.

### 구조 검토와 작은 대안

파일을 줄이는 대안도 비교했다. 아래 둘 다 승인된 네 소유 영역·공개 목록·배포 의미는 유지한다.

| 구조 | 장점 | 비용·판정 |
| --- | --- | --- |
| A: shared-module-graph + 경계 검사 + 기존 plugin-lib IO | 명세/실행 graph를 한곳에서 읽고 검사·sync·두 packager가 재사용. 읽기와 쓰기의 책임이 구분됨 | 작은 도구 2개 추가. 현재 계획 유지 |
| B: graph·consumer 검사·sync·package 사전 검사를 plugin-lib 한 파일에 모두 둠 | 신규 graph 모듈 하나를 줄일 수 있음 | 범용 소비자/Next 분석과 생성물 쓰기·CLI의 변경 이유가 한 파일에 모임. 두 packager와 경계 CLI가 큰 API에 결합. 별도 모듈 감소만으로 이득이라고 판단하지 않음 |

더 작은 공개 entry 목록을 위해 Node/universal 또는 서버/플러그인 책임을 다시 합치는 대안은
기존 ARCH 결정을 되돌리므로 선택하지 않았다. 내부 함수/캐시를 새 public service로 추출하지 않는다.

여덟 구조 위험 신호를 대조했다. 큰 API는 실제 소비자가 있는 entry/값과 좁은 도구 API로 제한하고(1),
명세 정책은 graph가 소유한다(2). parser·경계·IO는 실행 순서가 아니라 변경 이유로 나뉘며(3),
경계 없는 전달 wrapper를 추가하지 않는다(4). lib의 작성자는 sync 하나이고(5), 전체 복사와
명세 복사의 경쟁 경로를 남기지 않는다(6). private 참조는 검사하며(7), lib와 직접 소유 runtime의
출하 목록은 실제 source graph/추적 집합에서 도출한다(8). F1~F4 보완 후 남긴 구조를 유지한다.

### 발견 사항·반론 검토·처리

여기서 CRITICAL은 제안대로 구현할 때 전달/검증을 막는 공백이라는 뜻이며 현재 제품에서 장애를
재현했다는 뜻이 아니다. INFORMATIONAL도 이번 개선에 반영한 실행 가능한 지적이다.

| ID·영역 | 영향·확신도·구체적 근거 | 가장 강한 반론과 재확인 | 처리 |
| --- | --- | --- | --- |
| F1 CRITICAL, 코드 품질/검사 | 9/10. 수정 전 계획 279행의 app-core Node 금지와 285행의 시험 포함 탐색을 함께 적용하면 node:test도 거부할 수 있음. 인접 mjs 시험의 실제 import 확인 | 금지가 생산만을 뜻한다고 읽을 수 있으나 분류·양성 대조가 없으면 구현자에게 상충된 규칙을 넘김 | 생산/시험/type graph 분류와 Node 기반 시험 허용, 생산→시험 거부 대조를 본문에 확정 |
| F2 CRITICAL, 배포 구조 | 9/10. 수정 전 계획 338~354행은 lib의 추적 집합만 확인. 실제 패키저의 Git 열거와 필요한 파일 목록에는 새 runtime 5개가 없음. 작업 트리에만 있는 새 runtime은 검사를 통과하고 bundle에서 빠질 수 있음 | 최종 clean CI는 많은 누락을 잡지만 package 함수는 clean 상태를 강제하지 않으며 개발 중 직접 호출도 허용함 | validatePluginModulesForPackaging으로 범위를 명확히 하고 first-party plugin/bin·runtime 생산 모듈의 추적 누락도 쓰기 전에 거부 |
| F3 INFORMATIONAL, 성능/분석 범위 | 9/10. 수정 전 계획 285~288행은 native binary만 제외. 실제 macOS builder는 같은 root 아래 npm JS를 복사하므로 vendor 파싱·오탐·추가 IO 가능. preflight→diff가 snapshot을 재사용한다는 보장도 모호했음 | 현재 작은 shared 15개만 보면 비용이 작지만 소비자 검사는 더 넓고 CI에서는 native tree가 실제 생성됨 | 두 native node 트리 전체 제외, 호출 안의 AST/bytes 재사용·호출 간 새 snapshot 명시. 속도 개선 수치는 주장하지 않음 |
| F4 INFORMATIONAL, 시험 격리 | 8/10. 수정 전 계획 528행의 임시 Git fixture만으로는 package 모듈의 고정 repository와 TypeScript 의존을 어떻게 옮기는지 불명확 | 전체 source 사본을 올바른 경로에서 읽으면 이미 가능한 방식이므로 제품 API 변경은 불필요 | cwd 변경만으로 격리하지 않고 현재 작업 바이트·동일 parser를 가진 사본의 package 모듈을 로드하도록 구체화. sourceRoot 테스트 전용 옵션은 추가하지 않음 |

반론 검토 후에도 F1/F2의 양성·음성 대조와 F3/F4의 범위·격리 명시는 필요했다.
새로운 제품 정책이나 소유권 선택은 필요하지 않았으므로 추가 질문 없이 사용자가 요청한
문서 개선 범위에서 반영했다. 제품 구현 승인은 여전히 별개다.

### 실행·사용 흐름과 검증 지도

```text
CLI 또는 package 호출 [기존 진입점]
  +-- 옵션 오류/help [기존 강함: plugin-lib.test 32~65]
  +-- source snapshot/명세 graph [제안]
  |     +-- production/type/test 분류 [F1 -> 계획된 검사 fixture]
  |     +-- native vendor 제외 + 호출 내 재사용 [F3 -> 계획된 탐색 대조]
  |     +-- public/runtime/경로 위반 [계획: 오류, 쓰기 0회]
  +-- diff/check [기존 강함, 새 graph 연결은 계획]
  |     +-- drift/orphan -> 비정상 종료, 내용 보존
  |     +-- sync IO 중단 -> 부분 결과 -> 새 호출 check -> 재실행 [계획]
  +-- package 추적 집합 [제안]
        +-- lib 또는 직접 소유 runtime 누락 [F2 -> output 없음]
        +-- 정상 -> 실제 package 함수 -> inventory/bytes/mode [F4 -> 격리 사본]

유지보수자 흐름
  앱 정책만 변경 -> sync -> lib 동일 [계획된 회귀]
  새 runtime 파일을 만들고 추적 누락 -> package 거부 -> 추적 반영 -> 성공 [계획]
  bundle 설치/기존 플러그인과 새 서버 통신 -> ACCEPT 인수 [미실행]
```

기존 assertions의 강도를 확인했다. plugin-lib의 오류 전 무변경·반복 실행·nested import는
해당 기존 경로에서 Strong이다. macOS 시험 두 개는 hook 변환/거부에만 Strong이며 package 함수
호출의 증거는 아니다. Windows 시험은 fixture bytes로 verifier·hook 패키징을 확인하므로 그
파일 계약에는 Strong이지만 실제 Windows 실행·설치 증거는 아니다. CI coverage 시험은 선언된
job·OS·문자열의 거부를 확인하지만 workflow path 필터의 실제 triggering 자체를 실행하지는 않는다.

### 필요한 시험의 가치와 실패 처리

아래는 본문 VFY의 구체화이며 전부 구현 시 수행할 계획이다. 현재 통과율로 합산하지 않는다.

| 시험 카드·목적지 | 보호 계약·실패할 결함 | 기존 공백·seam·한계 |
| --- | --- | --- |
| ER-T1 / VFY-SMB-02, 신규 shared boundary 시험 | 보호: 생산/시험 runtime 구분. 같은 node:test import가 인접 시험에서는 허용되고 생산 파일/생산→시험 경유에서는 실패 | 새 checker는 없음. 작은 source fixture, test-only 제품 API 불필요. green은 브라우저 실제 build를 대신하지 않음 |
| ER-T2 / VFY-SMB-03, plugin-lib 및 두 package 시험 | 보호: lib가 맞아도 runtime 모듈 추적 누락은 output 생성 전 거부. 올바른 추적은 통과 | 기존 native 필수 목록은 새 이동 모듈을 보장하지 않음. 실제 source 목록/임시 Git index, 자동 stage 없음. green은 사용자 설치를 대신하지 않음 |
| ER-T3 / VFY-SMB-02, graph/boundary 시험 | 보호: native node/npm tree는 탐색 제외, 같은 위반을 first-party에 놓으면 검출. source 변경 뒤 두 번째 호출은 새 결과 | 기존 검사는 plugin/runtime 전체를 다루지 않음. fixture tree와 관찰 가능한 검사 결과로 확인, 고정 시간 assertion·벤치마크 없음 |
| ER-T4 / VFY-SMB-03, package 시험 | 보호: 사본의 수정된 코드·명세가 실제 package 결과/거부를 결정하고 원본 바이트는 보존. cwd만 바꿔 원본을 읽으면 실패 | package API가 source root를 모듈 위치에서 고정. 현재 bytes의 사본으로 증명, 새 제품 export/flag 없음. fixture binary 실행은 주장하지 않음 |
| ER-T5 / VFY-SMB-03, 기존 plugin-lib 시험 확장 | 보호: 없는 lib의 첫 생성, invalid manifest/경로/consumer의 무변경, 중간 IO 실패 이후 새 호출 check·재실행 회복 | 기존 무변경/반복 사례 재사용, graph/IO 실패만 확장. 제어 가능한 fs 경계 또는 자식 중단, 사용자 폴더·제품 fault flag 없음 |
| ER-T6 / VFY-SMB-04, 이동 정책 시험·policy-contracts·CI coverage | 보호: 원래 경계값/권한/hash와 이동한 8개 TS 목적지의 양 OS 발견. 하나 누락하면 종료 조건 실패 | 기존 의미 assertion을 옮기며 구현을 시험에 복제하지 않음. DB/Next/native는 해당 환경 증거가 별도로 필요 |

새 경로의 현실적인 실패는 위 지도와 카드에 처리·proof가 있다. 모듈/명세 오류는 상대 경로와
원인 chain을 보고하고 쓰지 않으며, IO 중단은 nonzero와 check 불일치로 드러낸다. package 누락은
output 부재와 누락 경로로 보이고, 기존 인증/transaction 거부는 원래 서비스가 처리한다.
회귀 시험 삭제 제안은 없다. 이동·통합은 같은 계약을 새 목적지에서 증명한 뒤 수행한다.

### 성능·운영 비용

검토 기준의 현재 생산 원본 27개는 총 77,599 bytes다. 관련 src/packages/plugin/bin/runtime/
scripts/tests의 JS/TS 파일은 generated·node_modules·두 native node tree를 제외해
845개, 4,389,838 bytes였다. 이는 현재 코드 양의 관측이며 이동 후 크기나 실행 시간 예측은 아니다.
새 검사는 build 도구 경로이고 HTTP/DB hot path를 추가하지 않는다. 새 query·N+1·DB lock 변경은 없다.

한 호출의 파일 읽기·AST는 map으로 재사용하고 runtime 문맥별 방문 집합으로 순환을 끝낸다.
오류 chain을 만들 때 파일을 다시 읽지 않는다. persistent cache·watcher·전역 singleton을 추가하지 않아
다음 호출의 source 변경을 숨기지 않는다. macOS arm64/x64와 Windows의 검사 시간은 실제 CI에서
관찰하고 예상보다 크게 늘면 먼저 vendor 유입·중복 파싱을 확인한다. 임의 SLA나 속도 개선율,
별도 benchmark 인프라를 이 계획의 완료 조건으로 만들지 않는다.

### 처리 권한·의존성과 최종 판정

| 결정 | 상태·근거 | 적용 범위 |
| --- | --- | --- |
| D1 / F1 | accepted: 사용자의 계획 개선 요청과 기존 테스트 실행 보존 계약 | TASK-MIGRATE-02/03, ER-T1 |
| D2 / F2 | accepted: 기존 모듈 배포 완전성·쓰기 전 거부 계약의 보완 | TASK-MIGRATE-02, ER-T2; 공개 shared entry는 늘리지 않음 |
| D3 / F3 | accepted: first-party 경계와 snapshot 재사용의 구체화 | TASK-MIGRATE-02, ER-T3; 새 cache 서비스 없음 |
| D4 / F4 | accepted: 기존 API를 유지하는 테스트 격리 명시 | VFY-SMB-03, ER-T4; 제품 sourceRoot 옵션 없음 |
| 구조 B | rejected: 파일 수 감소보다 책임 혼합·결합 비용이 큼 | 구조 A와 기존 ARCH 소유권 유지 |
| 외부 설치·출시 | deferred by parent: BLK-SMB-01/ACCEPT | 검토 통과로 인수·출시 승인하지 않음 |

ER-T1~T5는 P1: 구현의 종료를 막는 검사/배포 실패와 증거를 닫는다. ER-T6는 P2: 같은 변경의
기존 회귀와 환경 연결을 완성한다. 모두 본문의 세 canonical Task에 속하며 별도 제품 요구사항이 아니다.
원본/소비자 이동은 TASK-MIGRATE-01, parser·source 분류·배포 사전 검사는 TASK-MIGRATE-02,
명령·CI·문서 전환은 TASK-MIGRATE-03이 소유한다. 02의 graph/검사/public API를 먼저 맞춘 뒤
두 packager를 연결하며, package.json·workflow·공통 map은 같은 변경 주체가 직렬 통합한다.
독립적인 정책 시험 정리는 그 계약이 고정된 뒤 분리할 수 있지만 별도 배포 단위로 나누지 않는다.

이번 검토에서 기존 아래 명령을 실행해 30개 통과, 실패·skip 0개를 확인했다.
`node --test scripts/plugin-lib.test.mjs scripts/macos/package-plugin.test.mjs scripts/windows/package-windows-plugin.test.mjs scripts/checks/verify-ci-coverage.test.mjs`
실행 환경은 macOS/Node 26.4.0이며 CI의 Node 22·실제 Windows 실행을 대신하지 않는다.
제안한 graph·새 검사·수정 package 시험은 구현하지 않았고 build·DB·설치·benchmark도 실행하지 않았다.

plan-eng-review 판정은 **Ready**: 위 보완을 반영한 계획에 미해결 CRITICAL이나 새로 선택해야 할
중대한 설계 결정은 남아 있지 않다. Phase 실행 준비도의 기존 **CONDITIONALLY READY**와
H1 통합·최신 기준 확인·격리 DB·양 OS 인수 조건은 유지한다. 문서 개선 완료는 구현 승인이 아니다.
최종 저장본 전체를 다시 읽고 네 영역과 반론·본문 전파를 재검토한다. 문서/traceability 검증 결과는
이번 검토 완료 응답에 기록하며, 추가 수정 필요 항목이 발견되면 이 판정을 다시 연다.

### 재검토: 서버로 옮기는 템플릿의 gate 감지

이번 요청은 이전 결과 확인만이 아니라 최신 저장본에 대한 새 검토였다.
입력 SHA-256은 `b3be0bcf80a601702198f550d8e25ec890e727a26318155dae5d8e79c0543702`다.
이번에도 처음부터 개선점이 없었던 것은 아니다. 이전 검토가 놓친 F5 한 건을 발견했다.
기준 worktree는 51111ed, 확인한 origin/dev는 e8c212a이며 제품 코드 차이는 없다.

**F5 [CRITICAL, 9/10] — 서버로 분리한 템플릿 정책과 시험의 승격 gate 감지 누락.**
입력 문서의 TASK-MIGRATE-03 표는 app-core/pipeline·shared/templates·plugin/runtime만
구체적으로 열거했다. 현재 AGENTS의 명령에는 src/server/templates와 tests/server/runbook-stale이
없고, `smokeTriggerPaths`는 그 명령의 문자열을 읽을 뿐 import의 전이 의존을 자동 추론하지 않는다.
그 목록대로 전환하면 release-preparation 또는 runbook-query만 고친 이후 변경에 pipeline-smoke가
필요한지 판단하는 기존 근거가 사라질 수 있다. 현재 제품 장애나 실제 gate 누락을 재현한 주장은 아니다.

상위 ARCH inventory와 현재 pathspec을 읽는 진단에서 기존 gate가 포함한 생산 원본은 13개,
그 새 생산 목적지는 17개, 시험 목적지는 18개였다. 입력 계획에 열거한 prefix로 대조했을 때
release-preparation.ts·runbook-query.ts와 release-preparation.test.ts·runbook-stale.test.ts가
포함되지 않았다. 이 네 경로를 명시한 뒤 미할당 감지 목적지는 0개다.

가장 강한 반론은 기존 문장의 “분리 위치”가 서버 목적지도 포괄한다고 읽을 수 있다는 것이다.
그러나 명시된 목록과 기존 시험은 그 누락을 잡지 못한다. 모든 src/server/templates를 새 gate
prefix로 지정하는 대안도 가능하지만 기존 범위를 필요한 네 파일로 대응하는 쪽이 변경 감지의
불필요한 확대를 줄인다. 기존 gate 계약의 보존이므로 새로운 운영 정책 선택이나 사용자 결정은 없다.

| 검토 영역 | 이번 결과 |
| --- | --- |
| 구조 | 네 소유 영역·14개 공개 entry·두 도구 구조와 작은 대안 비교를 재확인. 변경 범위/배포 순서는 유지 |
| 코드 품질 | 생산/시험 구분·public/type/runtime·호출별 snapshot·실패 전달 보완은 일관됨. 새 지적 없음 |
| 시험·출시 경계 | F5를 TASK-MIGRATE-03, VFY-SMB-01/04, 종료 조건에 반영. 기존 존재 확인 시험에 실제 단독 변경의 pathspec 대조를 추가하도록 명시 |
| 성능 | 새 서비스·cache·제품 hot path 없음. 재검토는 경로 감지에 한정되며 별도 benchmark나 성능 수치를 추가하지 않음 |

```text
기존 core/templates 변경 [현재 gate 대상]
  -> shared/templates 또는 plugin/runtime [전환 목록에 이미 포함]
  -> server/templates의 두 생산 파일 + 이동 시험 두 개 [F5로 명시]
       -> 실제 AGENTS pathspec / 단독 Git diff [계획된 회귀]
       -> 승격 시 필요 gate 판단 [기존 절차, 이번에 실행하지 않음]
```

ER-T7 | P1 | TASK-MIGRATE-03 / VFY-SMB-01·04 | F5
Value: 보호=기존 gate 감지 범위; 실패조건=네 새 경로 중 하나가 빠져 단독 변경을 놓침;
기존공백=현재 pipeline-smoke-steps 시험은 일부 필수 문자열과 존재만 검사;
seam=기존 smokeTriggerPaths와 임시 Git fixture, 새 제품 export 없음;
한계=실제 모델·설치·운영 승격의 성공을 증명하지 않음.
D5는 accepted: 사용자의 문서 개선 요청과 기존 gate 보존 요구에 따라 계획에 반영했다.
실제 AGENTS·시험·workflow를 이번 검토에서 수정하거나 gate를 dispatch하지 않았다.

기존 `node --test --test-name-pattern='lists pipeline-smoke trigger paths' scripts/rehearsals/pipeline-smoke-steps.test.mjs`는
1개 통과·실패 0개였다. 이 성공은 현재 목록만 확인하며 미래 이동 목적지의 감지를 증명하지 않는다.
진단은 소스/명세를 읽고 경로 집합을 대조했으며 제안한 시험을 구현한 것이 아니다.
선택 문서 외 제품·시험·부모·architecture 파일은 보존했다. 독립 검토는 요청되지 않아 자체 재검토만 수행했다.

F5 반영 후 plan-eng-review의 설계 판정은 Ready이며, 기존 Phase 실행의 조건부 준비 상태와
H1 조정·격리 DB·양 OS 인수 조건은 유지한다. 최종 저장본과 문서/traceability 검사를 다시 확인한
결과는 이번 검토 응답에서 보고한다. 구현·병합·출시는 이 판정으로 시작하지 않는다.


## MIGRATE Execution Results

구현 승인: 2026-11-16 사용자 후속 요청. 실행·검증 기록일: 2026-11-17.
기준 dev는 `e8c212a98335a5e4fb12df915c861a1e2581c43b`, 작업 브랜치는
`harness/shared-modules-migrate-plan-20261116`이다. 기존 미병합 계획의 관리 worktree를 이어 썼다.
원래 checkout의 dirty 자료와 별도 scripts-coupling worktree는 수정하지 않았다.
현재 상태는 **소스 전환 구현·로컬 검증 통과, 양 OS CI 대기**다. ACCEPT·운영 승격은 수행하지 않는다.

### 구현 결과와 설계 보완

- TASK-MIGRATE-01: 기존 27개 생산 원본을 shared/app-core/server/FSD/plugin runtime으로 분리했다.
  옛 생산 파일·타입·alias를 제거하고 실제 import·VM mock·동적 helper·시험을 연결했다.
- TASK-MIGRATE-02: 명세와 AST 그래프의 단일 소유자, `verify:shared`, 읽기 전용 check,
  사전 검증 후 sync, 양 OS package의 출력 생성 전 모듈 추적 집합/바이트 검증을 구현했다.
  공개 entry **14개**, 값 export **59개**, 내부 template-boundary 포함 실행 복사본 **15개**를
  실제 export·명세·architecture 표와 대조했다. plugin/lib는 sync로만 재생성했다.
- TASK-MIGRATE-03: 재귀 시험 발견, 이동 정책의 양 OS 실행, CI 필터·coverage·누락 대조,
  실제 Git pathspec 단독 변경 시험, 현행 architecture·ADR·README·AGENTS를 전환했다.
  양쪽 plugin manifest는 기준 main/dev의 0.6.15보다 높은 **0.6.16**이다.
- H1은 기준 dev에 미통합이었다. 같은 출하 predicate를 중복 구현하지 않도록 병행 작업의
  `scripts/lib/plugin-payload.mjs`와 시험을 동일 경로·동일 바이트로 선행 통합했다.
  source SHA-256은 각각 `f70127776176d9d30aea13e8ddab059d5728cdd5a1714ce8027bcf81759b10ef`,
  `b475cd09c149af98db5b633e14eb60e4ede6874f7e3d6e356a9707dd641201b5`다.
  원본은 `/private/tmp/stagekeeper-scripts-coupling-20261116`의 당시 작업 트리이며 그 작업은
  수정하지 않았다. 이후 열린 [병행 PR #351](https://github.com/Sangeok/stagekeeper/pull/351)에서
  같은 predicate 경로와 바이트를 확인했다. H1 나머지 변경·H3 의존성 변경의 완료를 주장하지 않는다. package-lock은 유지했다.
- QA의 pipeline opt-in 사례는 앱 그래프 소유자인 `packages/app-core/pipeline/qa.test.mjs`로
  옮겼다. release-manifest의 기존 통합 4사례는 `release-preparation.test.ts`에 보존하여
  shared hash와 server 조합을 함께 검증한다. 파일마다 의미 없는 중복 시험을 추가하지 않았다.
- blob-url 사례는 기존 doc-link 시험, stale runbook 사례는 기존 runbook-stale 시험에 합쳤다.
  `pipeline-types.test.ts`는 app-core에서 tsc가 계속 검사한다.
- 전체 도구 회귀에서 계산형 `client-init-smoke-steps.mjs` 소비를 추가로 확인했다.
  새 설치본의 limits.mjs를 우선 읽고 이전 설치본에만 entitlement.mjs를 사용한다.
  현재 모듈 오류를 legacy fallback으로 숨기지 않는 거부 사례를 추가했다.
- 보존한 옛 alias 문자열은 shared 경계 검사의 거부 입력/탐지 목록이다. 옛 entitlement 경로는
  앞의 설치본 호환 reader와 해당 시험만 소유한다. completed 문서 두 개의 깨진 상대 링크는
  당시 commit의 GitHub blob 링크로 바꿨고 역사적 본문을 치환하지 않았다.

### 시험 이동과 실행 연결

기존 27개 `.mjs` 시험의 제목 누락은 0건이다. 이전 순수 정책 suite는 255개 통과했고,
이동 후 같은 사례와 기존 doc-link/runbook façade 사례를 함께 실행한 suite는 261개 통과했다.
아래는 타입 시험을 포함한 파일 대응이다. shared/app-core/plugin runtime의 `.mjs`는 `npm test`,
서버/FSD의 `.ts`는 `test:web`, tests/server는 `test:server`에서 발견하며 8개 이동 TS 소유 시험은
`test:policy-contracts`로 두 native CI에도 연결한다.

| 이전 시험 | 실제 목적지 |
| --- | --- |
| `packages/core/configuration/harness-config.test.mjs` | `plugin/runtime/configuration/harness-config.test.mjs` |
| `packages/core/configuration/workspaces.test.mjs` | `packages/shared/configuration/workspaces.test.mjs` |
| `packages/core/execution/client-runtime.test.mjs` | `packages/shared/execution/client-runtime.test.mjs` |
| `packages/core/execution/runner.test.mjs` | `packages/app-core/execution/runner-status.test.mjs`, `packages/shared/execution/runner-contract.test.mjs` |
| `packages/core/execution/watch.test.mjs` | `plugin/runtime/execution/watch.test.mjs` |
| `packages/core/pipeline/backlog.test.mjs` | `packages/app-core/pipeline/backlog.test.mjs` |
| `packages/core/pipeline/pipeline-types.test.ts` | `packages/app-core/pipeline/pipeline-types.test.ts` |
| `packages/core/pipeline/pipeline.test.mjs` | `packages/app-core/pipeline/pipeline.test.mjs` |
| `packages/core/pipeline/run-input.test.mjs` | `src/server/pipeline/input-validation.test.ts` |
| `packages/core/pipeline/transitions.test.mjs` | `packages/app-core/pipeline/transitions.test.mjs` |
| `packages/core/pipeline/work-selection.test.mjs` | `packages/app-core/pipeline/work-selection.test.mjs` |
| `packages/core/plans/entitlement.test.mjs` | `src/server/projects/availability-policy.test.ts`, `packages/shared/plans/limits.test.mjs`, `packages/app-core/plans/entitlement.test.mjs` |
| `packages/core/plans/usage-window.test.mjs` | `src/server/usage/usage-window.test.ts` |
| `packages/core/project-slug.test.mjs` | `packages/app-core/projects/slug.test.mjs` |
| `packages/core/qa.test.mjs` | `packages/app-core/pipeline/qa.test.mjs`, `plugin/runtime/qa/config.test.mjs`, `src/server/pipeline/qa-report.test.ts` |
| `packages/core/templates/codex-bundle.test.mjs` | `packages/shared/templates/codex-bundle.test.mjs` |
| `packages/core/templates/deliver.test.mjs` | `packages/shared/templates/deliver.test.mjs` |
| `packages/core/templates/manifest.test.mjs` | `plugin/runtime/templates/install-manifest.test.mjs` |
| `packages/core/templates/release-manifest.test.mjs` | `src/server/templates/release-preparation.test.ts` |
| `packages/core/templates/render.test.mjs` | `packages/shared/templates/render.test.mjs` |
| `packages/core/templates/runbook.test.mjs` | `packages/shared/templates/runbook.test.mjs`, `tests/server/runbook-stale.test.ts` |
| `packages/core/templates/template-boundary.test.mjs` | `packages/shared/templates/template-boundary.test.mjs` |
| `packages/core/templates/vars.test.mjs` | `packages/shared/templates/vars.test.mjs`, `plugin/runtime/templates/metadata.test.mjs` |
| `packages/core/tokens/token-validity.test.mjs` | `packages/app-core/tokens/validity.test.mjs` |
| `packages/core/tokens/token.test.mjs` | `src/server/tokens/token-crypto.test.ts`, `packages/shared/tokens/format.test.mjs` |
| `packages/github/blob-url.test.mjs` | `src/fsd/entities/board-item/model/doc-link.test.ts` |
| `packages/github/repo-url.test.mjs` | `packages/shared/github/repo-url.test.mjs` |

### 실행 근거

로컬 환경은 macOS arm64, Node 26.4.0, lockfile의 TypeScript 5.9.3·Next 16.4.2다.
CI는 기존 Node 22를 유지한다. PostgreSQL은 CI와 같은 18.4.0-beta.17 도구로 작업 전용
클러스터/`stagekeeper_test_shared_migrate` DB를 만들었다. 운영·개발 DB URL은 사용하지 않았다.

| VFY | 실행 | 관찰 |
| --- | --- | --- |
| VFY-SMB-01 | 문서 링크·ADR·registry·명세/실제 export 대조 | 공개 14/59, closure 15 일치; docs:check 226개 문서/1165개 상대 링크 통과 |
| VFY-SMB-02/03 | graph/checker/plugin-lib 시험 | 36개 통과. empty import/reexport 및 default+type import도 runtime으로 판정 |
| VFY-SMB-03 | 실제 양 OS package 함수 fixture | macOS에서 9개 통과; Windows 함수도 fixture 실행. Windows 실제 파일 동작은 CI 대기 |
| VFY-SMB-04 | `npm test` | 655개 중 613 통과, 실패 0, 기존 환경별 42 skip |
| VFY-SMB-04 | `test:web` | 839 통과, 실패/skip 0 |
| VFY-SMB-04 | `test:server` | 188개 중 186 통과, 실패 0, build flag 의존 2 skip; fresh 검사 별도 실행 |
| VFY-SMB-04 | `test:policy-contracts` | 34 통과 |
| VFY-SMB-04 | `test:server:integration` | migrate deploy 후 185 통과, 실패/skip 0 |
| VFY-SMB-02/04 | `npm run build`와 세 flag의 fresh manifest 시험 | production build 통과; fresh 이름의 실제 8개 계약 포함 명령 30 통과 |
| VFY-SMB-02/04 | tokens/templates façade import, plain Node macOS rehearsal helper import | DB bootstrap 없이 통과 |
| VFY-SMB-04 | account-usage-and-tokens HTTP 리허설 | token lifecycle 3·auth/rate 6·요청 경계 15와 계획 snapshot 통과 |
| VFY-SMB-04 | acceptance-failure 기본 HTTP 리허설 | owner·stale/foreign/guest·읽기 전용·응답 유실·새 GET·중복 retry 거부 통과 |
| VFY-SMB-01/04 | CI coverage와 실제 gate 감지 시험 | 양 OS 명령 누락·각 정책/도구 단독 변경, 실제 Git pathspec 대조 통과 |
| VFY-SMB-01~04 | `npm run check` | lint·세 경계·docs·CI coverage·typegen·tsc 통과, scripts 524 pass / 3 환경 skip |
| VFY-SMB-02/03 | `npm run test:architecture` | 424 pass / 3 환경 skip, 실패 0 |
| VFY-SMB-01~04 | 양 OS CI | 대기; 결과/최종 revision은 후속 기록 |

초기 샌드박스 실행의 localhost EPERM·공유 메모리·Turbopack 포트 오류는 환경 오류로
분리했고 권한이 있는 동일 작업 환경에서 재실행했다. 실패한 Next 캐시는 작업 전용 경로에
보존한 뒤 새 캐시로 빌드했다. Next가 기존 설치 버전의 보안 업데이트 권고로 한 번 중단했으며,
의존성 업그레이드 없이 원래 빌드 재실행이 통과했다. 권고의 해결은 이 소스 전환에 포함하지 않는다.

외부 원문·실제 설치·모델/권한·출시 gate는 미실행이다. acceptance-failure의 `--templates`
분기도 미실행이며 private template→init→설치 hash는 ACCEPT에서 검증한다.
로컬 로그·입력 snapshot·이동 대응 자료는 작업 폴더 상위의 `*.log`/JSON에 보존했다.
