---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-17"
approved-by: "user"
approved-at: "2026-11-17"
approval-scope: "사용자의 GitHub CI-only 후속 지시에 따라 GitHub-hosted Windows/macOS 인수 workflow와 기존 native runtime 재사용, 필요한 인수 스크립트·시험·문서와 격리 CI 인수·증거 기록. 후속 요청에 따른 dev 병합·완료 문서 통합과 소유 작업 정리 포함. 개인 프로필/설치 변경·로컬 native 인수·실제 모델 호출·운영 DB/seed/activation·main 승격 제외"
completed-at: "2026-11-17"
verification-summary: "GitHub CI-only 범위 완료: 최종 d5c6714의 check 941·공유 배포 인수 4 PASS 후 PR #363을 9937829로 dev에 병합. Windows x64·macOS arm64/x64와 동일 제품 bytes의 Claude source 4개 leg PASS. 상세 결과와 정제 summary는 완료 보고서에 보존"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-11-17-shared-modules-and-plugin-distribution.md"
  - "docs/proposals/completed/2026-11-17-shared-modules-and-plugin-distribution-phase-migrate.md"
  - "docs/architecture/shared-modules.md"
  - "docs/architecture/macos-runtime.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/template-releases.md"
  - "docs/architecture/verification.md"
  - "docs/test-reports/completed/2026-11-17-shared-modules-plugin-distribution-acceptance.md"
  - "docs/proposals/active/dual-client-ci-parity.md"
  - "docs/proposals/active/template-release-acceptance-follow-ups.md"
---

# 공유 모듈·플러그인 배포 경계 — Phase ACCEPT 상세 계획

## Summary

[상위 SDD](./2026-11-17-shared-modules-and-plugin-distribution.md)의 ACCEPT를 구체화한다.
MIGRATE의 소스·생성물·검사 구현을 유지하면서, 실제 설치 산출물과 기존 플러그인/새 서버의
조합에서도 경로·해시·설치 상태·실행 계약이 보존되는지 확인한다. 이미 통과한 검증은 입력과
관찰 범위가 같은 경우 재사용하고, 설치 채널·실제 캐시·외부 템플릿에 남은 공백만 보완한다.

초기 요청은 이 계획 파일의 작성·검토였다. 이후 사용자가 이 문서를 바탕으로 실제 작업을
진행하도록 요청하여 front matter 범위의 ACCEPT 실행을 승인했다. 작성·검토 이력의 미실행
표시는 당시 상태로 보존하며, 실제 수행 결과는 별도 인수 보고서와 아래 실행 기록을 따른다.

작성 모드는 `PHASE_PLAN`, 규모는 `standard`, 인수 실행 위험도는 `HIGH-RISK`다.
제품 설계를 추가하는 작업은 아니지만 설치 캐시·인증 홈·runner·외부 템플릿·실행 중 잠금과
유료 모델 호출이 관련된다. 대상 식별과 소유한 자원만 정리하는 절차가 필요하다.

## 현재 승인된 실행 방식 — GitHub CI only

실행 중 사용자가 GitHub CI만으로 진행하도록 명시했다. 이 지시는 아래 초안·검토 기록의
개인 테스트 host/로그인 준비 경로와 새 CI 실행기 제외 범위를 대체한다. 별도 개인 프로필이나
self-hosted runner를 요구하지 않는다. `shared-distribution-acceptance`의 Windows/macOS matrix에서
기존 native 제작기·검증된 cache를 재사용해 모델 없는 실물 인수를 실행한다. 긴 기존 회귀 검사와
인수 실행의 시간 제한을 분리한다. 실제 Codex CLI의 local marketplace
설치·선택 cache, native helper의 init/MCP·session, source/서버 교체와 cleanup을 확인한다.

모델 inference는 이 배포 경계 변경의 인수 범위에서 실행하지 않는다. 기존 native 실행·정책 회귀,
private corpus 양 client/plan/언어 비교와 실제 설치·HTTP/MCP 관찰을 결합하되 실제 모델 역할의
성공으로 확대하지 않는다. 개인 PC/실제 운영 설치와 모델 gate는 기존 별도 인수·출시 작업에 남긴다.
필수 입력이 없는 fork/비신뢰 run은 해당 단계가 BLOCKED이며, job의 다른 검사 성공만으로
ACCEPT PASS를 선언하지 않는다. source·runtime·template·CLI·실제 단계 결과를 summary와 연결한다.

개인 Windows host 부재는 이 모델 없는 CI 경로의 blocker가 아니다. 공개 CLI와 기존 native
runtime으로 GitHub-hosted Windows x64와 macOS arm64/x64에서 검증한다. 이전 native package는
고정 0.6.15 source로 재생성한 fixture임을 명시하고 원래 사용자 배포 archive라고 주장하지 않는다.
현재 CI 코드가 추가된 후보 SHA를 실제 sourceCommit으로 기록하며, f430e26의 제품·출하 bytes와
동일한지 대조한다. 기존 성공 run의 SHA나 입력을 새 후보로 바꾸어 적지 않는다.

## Source and Evidence Baseline

### 기준과 정의의 소유자

- 조사일: 2026-11-17. 작성 기준 dev: `aea8ae51dfcb41ed1f4bfdd379df3a9eef101049`.
  [MIGRATE PR #354](https://github.com/Sangeok/stagekeeper/pull/354)의 병합 commit이다.
- MIGRATE 최종 tested head: `f430e2656bef1b7cd41db3213ab02d6f8090d667`.
  이 head와 작성 기준의 `src`, `packages`, `plugin`, `scripts`, `.github`, package/lock,
  tsconfig 차이는 0이다. 병합 SHA를 기존 실행 SHA로 바꾸어 기록하지 않는다.
- 조회한 원격 main: `85c66fb1d9e02c3d9416710240cbfca3f0023939`.
  시작 시 열린 PR은 0건이었다. main의 현재 실제 배포 상태는 조사하지 않았다.
- 작성 브랜치: `harness/shared-modules-accept-plan-20261117`.
  관리 작업 ID: `8677b8a2-79c8-439b-bd1e-8d526e96df7b`.
  주 checkout의 기존 dirty 문서를 보존하고 새 작업 트리에서 작성한다.
  기존 MIGRATE 트리는 최신 dev와 같은 관리 도구를 가진 제어 checkout으로 유지한다.
- 개발 도구는 단일 npm package, Node ESM/TypeScript, Next 16.4.2, Prisma 7.10.1,
  node:test다. 공개 CI는 Node 22, native bundle은 고정 Node 22.23.3을 사용한다.

| 정의 | 단일 소유 문서 | 이 계획의 역할 |
| --- | --- | --- |
| REQ-SMB-004/005, INV-SMB-001, CON-SMB-001~003 | 상위 SDD | 기존 동작·독립 설치의 인수 절차를 상세화 |
| Phase ACCEPT, VFY-SMB-05, BLK-SMB-01 | 상위 SDD | 재정의 없이 실행·증거·중단 조건 연결 |
| 공개 entry·runtime·배포 원본 | [shared-modules](../../architecture/shared-modules.md) | 14개 공개 entry/59개 값, 내부 의존성 포함 15개 runtime의 실물 확인 |
| 설치·실행·잠금·서버 호환성 | [protocol](../../architecture/protocol.md), [macOS runtime](../../architecture/macos-runtime.md), [template releases](../../architecture/template-releases.md) | 실제 helper/서버의 기존 판정을 그대로 관찰 |
| TASK-ACCEPT-01~04, BLK-SMB-02/03 | 이 문서 | 이번 상세 계획에서 새로 소유. 부모에는 같은 Task 정의가 없음 |
| CI 구축·runner·공통 증거 연결 | [dual-client CI 계획](../active/dual-client-ci-parity.md) | 기존 구현·host 계약 재사용; 미구현 Windows 실행기를 여기서 중복 개발하지 않음 |
| 설치 tuple·복원 후속 | [template acceptance 후속](../active/template-release-acceptance-follow-ups.md) | 동일 입력의 증거 연결. 운영 복원·activation 인수는 포함하지 않음 |

상위 SDD SHA-256은 `bd12282b462df3fb50fe5d42893488820fe28463fb9096ee5de23286ef6c2303`,
MIGRATE 완료 기록은 `eeb6e8855d5d71ab6f195742203a04c83316a6970a4625ea58950021a9be054b`다.
실행 착수 시 해당 문서와 실제 소스의 이후 변경을 다시 대조한다.

### 이미 확보한 증거와 재사용 한계

다음은 **기존 실행**이며 이번 문서 작성의 실행 결과가 아니다. GitHub에서 네 run의
`completed/success`를 다시 조회했다. 원문 모델 전사나 인증정보는 조회하지 않았다.

| 기존 증거 | 이미 확인한 범위 | ACCEPT에서 남는 범위 |
| --- | --- | --- |
| [check 921](https://github.com/Sangeok/stagekeeper/actions/runs/44016444458) | f430e26의 경계·제품/웹/서버·DB·build·fresh manifest·관리 도구 | 실제 사용자 설치 cache와 번들 단독 실행의 증거는 아님 |
| [macOS 241](https://github.com/Sangeok/stagekeeper/actions/runs/44016444450), [Windows 419](https://github.com/Sangeok/stagekeeper/actions/runs/44016444441) | 정책·배포 도구·native 권한/명령·제품 회귀·offline build | 패키저 fixture의 가짜 binary와 native runtime 시험을 합쳐 실제 배포 bundle 설치로 보고하지 않음 |
| [client-init-smoke 86](https://github.com/Sangeok/stagekeeper/actions/runs/44016446177) | Claude source 채널의 Windows/macOS new-user/update | Codex 또는 native bundle 채널의 설치·모델 역할 증거는 아님 |
| [MIGRATE 기록](./2026-11-17-shared-modules-and-plugin-distribution-phase-migrate.md#migrate-execution-results) | 원본 시험 대응, 로컬 DB 185 pass, HTTP 회귀, 15개 모듈/59개 export 대조 | private corpus 전체·실제 설치 선택·독립 배포 조합 전체는 미실행 |
| [과거 macOS Codex 인수](../../test-reports/completed/2026-11-10-codex-macos-native-acceptance.md) | 당시 0.6.10 설치·실제 역할·110분 유휴 | 새 0.6.16 payload, 현재 loader, Intel/Windows 성공으로 전용하지 않음 |

run 86의 공개 요약에서 후보 `f430e26…`, templates
`8ccb37a4ab91de527e6a23caa6d415c7cdc6f215`, 이전 plugin `85c66fb…`, Claude 2.1.326을 확인했다.
조회한 macOS 신규 설치 요약은 15.8.2/arm64, Windows update는 10.0.20348/x64다.
같은 source 채널·입력·관찰에 대해서는 이 성공을 재사용한다. 설치된 파일의 정확한 선택 경로나
서로 다른 bundle hash를 증명해야 하는 항목은 해당 요약만으로 채우지 않는다.

## Scope and Current Implementation

포함 범위는 외부 경로 참조, 원본과 실물 배포물의 대응, 지원 설치 경로의 신규/update,
기존 플러그인과 새 서버의 호환성, 동일 template 입력의 해시·본문·설치 tuple, 실행·정리 증거다.
REQ-SMB-004는 MIGRATE 증거에 이 설치 경계의 증거를 더하고, REQ-SMB-005는 이 Phase가
확정한 지원 범위와 필수 조합의 인수 결과로 완료한다. 준비 자료만으로 두 요구사항을 완료하지 않는다.

제품 정책·schema·프로토콜·공개 entry·버전 체계의 재설계, 개인 PC 설치 변경, 운영 DB/seed/activation,
main 승격, 공개 bundle 게시, 새 CI/Windows Codex 실행기 개발은 제외한다. 결함을 찾으면
관련 소유 작업에 범위와 회귀를 연결하고 새 후보를 검증한다. 예전 lib 전체를 다시 복사하여 덮지 않는다.

| 항목 | 현재 코드 근거 | 판정·남은 일 |
| --- | --- | --- |
| 배포 집합·거부 | `plugin-exports.json`, `shared-module-graph.mjs`, `verify-shared-boundaries.mjs`, `plugin-lib.mjs` | 구현·회귀 충족. 검사기를 다시 만들지 않고 실제 bundle에 적용 |
| 양 OS 패키저 | `scripts/macos/package-plugin.mjs#packageMacosPlugin`, `scripts/windows/package-windows-plugin.mjs#packageWindowsPlugin` | 구현 충족. 실제 runtime과 새 외부 output으로 제작·inventory·설치 후 바이트 대조 |
| 이전 reader | `plugin/bin/harness-released-readers.test.mjs`, `harness-released-init-readers.test.mjs` | 기존 잠금 거부 계약 충족. 모든 구버전이 새 서버에 접속 가능하다는 증거는 아님 |
| private corpus | `tests/templates/private-template-release.test.ts` | 기존 HTTP fixture는 두 client×세 plan×완전한 언어를 순회. 실제 CLI/서버와 구버전 조합은 별도 |
| 공개 init | `scripts/rehearsals/rehearse-client-init-smoke.ts#parseArguments` | Claude github-branch/export만 구현. `--client codex`와 `--plugin-source bundle`은 명시적으로 거부 |
| macOS Codex | `rehearse-codex-macos.mjs#parseMacosRehearsalArguments`, `main` | init/eval/pipeline과 이전 package 지원. 전달된 package에서 helper를 실행하며 loader 설치 자체를 수행하지 않음. 매 호출에 seed/bootstrap하고 종료 시 fixture user만 정리하므로 DB 전체 복구를 보장하지 않음 |
| Windows Codex | `plugin/bin/harness.ps1`, native runtime, 과거 인수 기록 | 제품 경로는 존재. `scripts/rehearsals/rehearse-codex-windows.mjs`는 현재 없음. 신뢰 host/설치 절차는 관련 CI 작업과 조정 |
| legacy template 리허설 | `rehearse-acceptance-failure.ts`의 `--templates` 분기 | `plugin/templates/en` 10개 행·legacy Template·저장소 init을 사용. versioned bundle 인수의 대체가 아님 |
| 공통 증거 | `scripts/rehearsals/client-ci-contract.mjs#clientTarget`, `normalizeClientEvidence`, `evidenceDigest`, `evaluateClientCandidate` | 정규화·증거 해시·실제 합격 판정을 구분해 재사용. 모든 실행기가 이 schema를 출력하거나 public gate에 연결됐다는 뜻은 아님 |

기존 `.github/workflows/pipeline-smoke.yml`에는 Windows/macOS Claude leg가 모두 있다.
다른 active 문서의 과거 표에 적힌 macOS leg 부재를 근거로 재구현하지 않는다.
active `role-command-time-limit.md`의 timeout 변경·모델 제외 범위, worktree 관리 작업의
정리 권한도 이 계획의 실행 권한으로 가져오지 않는다.

## Phase ACCEPT: 설치 산출물과 독립 갱신의 확인

- predecessor artifacts: 병합된 MIGRATE, 현재 shared/설치 계약, 아래 고정 입력과 기존 실행 원본.
- satisfies: REQ-SMB-004, REQ-SMB-005
- preserves: INV-SMB-001
- governed-by: CON-SMB-001, CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-05

정의는 상위 [Phase ACCEPT](./2026-11-17-shared-modules-and-plugin-distribution.md#phase-accept-설치-산출물과-독립-배포-호환성-인수)를 따른다.
새 Phase를 추가하지 않고 자료 확정 → 실물 제작 → 설치·호환성 → 판정의 네 Task로 나눈다.
각 Task는 일부 증거를 제공하며 최종 완료 판정은 모든 필수 관찰을 모은 뒤에만 한다.

### TASK-ACCEPT-01: 후보·기존 증거·외부 참조 확정

- satisfies: REQ-SMB-004, REQ-SMB-005
- preserves: INV-SMB-001
- governed-by: CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-05

원본과 과거 PASS를 유지하고, 제안 보고서
[인수 보고서](../../test-reports/completed/2026-11-17-shared-modules-plugin-distribution-acceptance.md)에 입력 원장과 재사용 표를 보존한다.
아직 이 보고서는 없으며 이번 작성에서 만들지 않는다.

| 입력 | 준비할 값·기본 선택 | 다음 단계로 넘어가는 조건 |
| --- | --- | --- |
| 후보 server/plugin | 우선 S=P=`f430e2656bef1b7cd41db3213ab02d6f8090d667`, version 0.6.16 | 직접 green을 확인한 후보. 다른 SHA 선택 시 영향 파일·검증·artifact를 다시 연결 |
| 병합 기준 | M=`aea8ae51dfcb41ed1f4bfdd379df3a9eef101049` | S/P와 별도 기록. M을 사용하면 M에서 새로 만든 build/bundle identity를 기록 |
| 이전 호환 후보 | P0=`85c66fb1d9e02c3d9416710240cbfca3f0023939`, version 0.6.15 | 가장 최근 source update 기준. 이것이 모든 지원 이전 버전을 대표한다고 가정하지 않음 |
| 이전 서버 | S0=P0와 같은 고정 SHA의 서버 코드 | 별도 checkout/build로 준비하고 같은 DB/origin을 유지한 교체 대조에만 사용 |
| template | 우선 T=`8ccb37a4ab91de527e6a23caa6d415c7cdc6f215` | corpus 시험용 export와 seed 리허설용 Git checkout을 구분. seed 입력은 private 저장소 root/HEAD=T/clean 상태와 실제 rows hash를 함께 확인 |
| 이전 설치물 | 채널별 원래 release artifact 또는 고정 P0에서 재생성한 fixture | 둘을 구분. 실제 배포물 update를 주장할 때는 원래 artifact와 hash가 필요 |
| 실물 bundle | 각 OS/architecture의 package/runtime/verifier/payload hash | Task 02가 실제 bytes에서 계산. source SHA만으로 bundle hash를 채우지 않음 |
| host·client | 전용 host 식별, OS/architecture/CLI version, 설치/인증 홈의 소유자, 로그 위치 | 현재 가용성·auth·시간/사용량 범위 확인 전 설치·모델 단계 중단 |
| DB·실행 단위 | campaign/scenario/attempt → 정확한 DB identity·초기 channel 상태·종료/보존 담당 | 자동 seed 리허설은 호출별 새 legacy DB, 서버 교체 대조는 별도의 한 DB를 시퀀스 동안 유지. 둘을 섞지 않음 |

부모 BLK-SMB-01의 해소 자료로 다음을 조사한다.

1. T의 전체 지원 언어·runbook·역할·문서에서 제거/이동된 `lib/` 경로와 계산형 조합을 찾는다.
   후보 plugin의 skill·실제 선택된 이전 설치 cache도 같은 관점으로 확인한다.
2. 상위 source map과 현재 `plugin/lib`, `plugin/runtime`을 기준으로 각 참조의 실제 목적지를 대조한다.
   문자열 검색 0건을 계산형 참조까지 모두 확인했다는 근거로 쓰지 않는다.
3. 이전 설치물 내부에서 이전 경로를 참조하는 것은 정상일 수 있다. 새 bundle에서 그 경로를
   읽거나 외부 지침이 새 helper에 옛 경로를 요구하는 경우를 구분한다.
4. 보고서에는 검색 범위·수량·판정·private 증거 식별자만 남긴다. private 본문·인증·전사는
   저장소 문서/공개 artifact에 복사하지 않는다. 외부 수정이 필요하면 해당 저장소 소유 작업에 연결한다.

재사용 표에는 각 관찰마다 원래 실행 SHA·run/job/attempt·환경·입력·결과·제외 범위를 적는다.
제품 소스가 같아도 CLI/OS/실제 cache/인증이나 template가 달라진 관찰은 자동 재사용하지 않는다.
보고된 SHA를 새 후보 SHA로 바꾸지 않고, source-equivalence의 파일 범위와 이유를 별도 기록한다.
source 채널을 다시 실행할 때도 branch 이름만으로 후보를 고정하지 않는다. 실제 ref가 P와
일치해야 하며 병합 후 삭제된 작업 branch를 재생성하지 않는다. 지원되는 export 채널을 선택하면
채널 변경을 기록하고 github-branch 설치 증거와 구분한다.

`readTemplateSources`는 일반 디렉터리도 읽지만 `seed-templates.ts:21`은 입력 디렉터리에서
`git rev-parse HEAD`를 호출한다. 따라서 `SMB_TEMPLATE_EXPORT`는 검증된 파일 export에만,
`SMB_TEMPLATE_CHECKOUT`은 seed를 호출하는 Git 관리 입력에 사용한다. 후자의 Git top-level이
입력 원장에 적힌 private checkout root이고 HEAD=T이며 tracked/untracked 변경이 없어야 한다.
언어 디렉터리들이 있는 입력이 저장소 하위 폴더라면 그 상대 경로도 원장에 고정한다.
public checkout 아래의 일반 export에서 얻은 상위 저장소 HEAD를 T로
기록하지 않는다. 두 입력의 정규화된 rows hash도 같아야 하며 실행 전후 출처를 다시 확인한다.

### TASK-ACCEPT-02: 실물 bundle과 개발 환경 독립성 검증

- satisfies: REQ-SMB-004, REQ-SMB-005
- preserves: INV-SMB-001
- governed-by: CON-SMB-001, CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-05

현재 그래프·sync·패키저를 보존한다. 테스트용 fake runtime 대신 provenance를 검증한 실제
native runtime으로, Git에 등록된 후보 소스에서 새 외부 output을 만든다. 제작 환경은 개발
의존성을 사용할 수 있지만 **설치 소비 환경은 Stagekeeper 제작 checkout의 packages/src/node_modules에 접근하지 않는다**.
사용자 작업 repo의 허용 파일과 검증에 필요한 의존성까지 금지한다는 뜻은 아니다.

1. 새 checkout의 HEAD/clean 상태, manifest 버전, 명세/원본/lib check를 확인한다.
   입력 오류를 sync로 숨기지 않으며 실제 후보가 바뀌면 후보를 다시 식별한다.
2. Windows x64, macOS arm64/x64의 기존 native build/cache 검증을 사용한다. CI runtime을
   재사용할 때 run/attempt·archive/provenance·architecture/hash가 일치해야 한다.
3. 해당 OS의 실제 package 함수를 호출하고 `windows-package.json` 또는 `macos-package.json`의
   sourceRevision·inventory·hash를 확인한다. lib는 명세 closure와 정확히 같고 원본 bytes를 보존한다.
   현재 관측값은 15개이나 기대 목록은 숫자가 아니라 실제 명세와 내부 의존성으로 계산한다.
4. 이동한 plugin 전용 configuration/execution/qa/templates 파일, hooks, 양 client manifest,
   완전 verifier 두 경로, native Node/npm/license와 macOS mode를 확인한다.
   bundle 내부 native npm의 `node_modules`는 필요 자원이며 금지할 저장소 개발 의존성과 구분한다.
5. 별도 소비 위치에 bundle만 설치한다. 제작 checkout을 사용하지 않는 host/격리 context에서
   설치된 native launcher로 helper 진입·정상 init·guard·session과 지원 watch/background 경로를 확인한다.
   `node <소스 helper>` 실행이나 모듈 import만 성공한 결과는 이 항목의 PASS가 아니다.
6. 결과물 hash·설치 전후 inventory·실제 launcher 경로를 기록한다. Codex는 global Node 우회가
   없어야 한다. Claude source 채널의 기존 PATH Node 예외를 native bundle 검증에 적용하지 않는다.

missing/drift/orphan/추적 누락/잘못된 파일 종류의 사전 거부는 같은 도구 입력이면 MIGRATE
회귀를 재사용한다. 현재 제작 실패를 무시해 부분 output을 설치하지 않는다. 자기 실패 output을
증거로 보존하고 원인을 고친 새 입력·새 디렉터리로 재시도한다. 설치 cache를 제자리 덮어쓰지 않는다.

### TASK-ACCEPT-03: 실제 설치 선택과 독립 갱신 조합 인수

- satisfies: REQ-SMB-004, REQ-SMB-005
- preserves: INV-SMB-001
- governed-by: CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-05

기본 실행 순서는 기존 [지원·작업 소유권](../active/dual-client-ci-parity.md#지원-범위와-작업-소유권)의
Windows x64/macOS arm64 × Claude/Codex 네 조합을 따른다. 다음 표는 요구를 지우는 skip 표가 아니다.

| 대상 | 재사용할 경로 | 추가로 확보할 관찰·차단 |
| --- | --- | --- |
| Windows x64 / Claude source | 공개 init new-user/update | run 86의 동일 조합 재사용 가능. 새 서버/이전 설치 조합·실제 cache identity 중 없는 항목만 보완 |
| macOS arm64 / Claude source | 같은 공개 init 경로 | source 설치에서 PATH Node가 있는 조건을 명시. bundle 단독 실행으로 보고하지 않음 |
| macOS arm64 / Codex bundle | 기존 private 설치 wrapper + `rehearse-codex-macos.mjs` | 후보/이전 bundle 설치, 실제 winning cache inventory, 모델 없는 init과 별도 실행 증거 |
| Windows x64 / Codex bundle | 기존 native launcher·제품 runtime·신뢰 host | 전용 host/실제 installer 절차가 미확정. 관련 CI 작업의 실행기 또는 구체적 수동 protocol 확보 전 해당 leg BLOCKED |
| macOS x64 | 기존 native CI와 Task 02의 실물 제작/해석 | runtime 증거는 유지. 실제 client 설치/모델 전체는 이번 기본 네 조합에 포함되지 않으며, 지원 범위 결정 없이 전체 Intel 인수 완료를 주장하지 않음 |

Claude native bundle을 제공하는 설치 채널도 Task 02의 실물·helper 검증 대상이다.
실제 Claude loader가 bundle을 선택하는 채널을 인수 범위에 포함하면 그 설치·update 관찰을
별도 행으로 추가해야 한다. 공개 init CLI에 미지원 bundle 인자를 넣어 대체하지 않는다.
Task 01에서 필수 채널·architecture 목록을 확정하고, 미확정/누락 행이 있으면 전체 ACCEPT를 완료하지 않는다.
Intel 지원을 축소하거나 새 설치 경로를 지원한다고 선언하는 결정은 이 계획이 대신하지 않는다.

각 필수 설치 행에서 다음 순서를 지킨다.

1. 시험 전용 홈·cache·repo·DB·서버를 식별한다. 개인 설치·일반 인증 홈과 섞지 않는다.
   사용 중인 runner나 같은 인증 홈의 다른 실행이 있으면 기다리고, 새 후보를 위해 취소하지 않는다.
2. 신규 설치는 빈 **설치 cache**에서 시작한다. 기존 plugin으로 새 repo만 연결한 경우와 구분한다.
   client가 선택한 SKILL/helper 실제 경로와 설치 inventory를 제작물과 비교하고 필요한 client 재시작을 확인한다.
3. update는 이전 설치를 먼저 연결하고 설정·관리 파일·사용자 수정 파일·lock·DB pin snapshot을 남긴다.
   dry-run은 무변경이어야 하며, 실제 update 뒤 사용자 수정/다른 client 파일과 기존 실행 pin을 보존한다.
   정상 호환성 기준선은 ready 상태로 유지하고, managed 파일을 수정하는 거부 사례는 별도 분기로 실행한다.
4. 아래의 상태를 유지하는 전환 protocol로 `S0/P0` → `S/P0` → `S/P`를 비교한다.
   세 개의 새 fixture를 각각 초기화한 비교는 기존 설치·실행 pin 보존의 증거가 아니다.
   후보 설치를 이전 서버로 되돌리는 downgrade는 지원을 확인한 경우에만 추가한다.
5. HTTP/MCP shape·token scope·runtime marker·template protocol, canonical/content/contract/surface hash,
   installation tuple, rendered body/runbook version이 동일 입력에서 기존 계약과 일치해야 한다.
   releaseId가 다르다는 이유만으로 호환성을 거부하거나 허용하지 않는다. 실제 판정은
   `compatibleInstallation`의 protocol/language/clientSurfaceHash와 서버의 실행 pin 계약을 따른다.
6. pending·수정됨·missing·incompatible 설치의 dispatch 거부와 정상 재init을 아래 상태표로 확인한다.
   init의 부분 적용과 dispatch의 무진행을 구분한다. 수정한 파일·기존 pin을 보존하고,
   임의 adopt/강제 release 또는 lock을 ready로 직접 바꾸어 통과시키지 않는다.
7. 지원하는 session/watch/background 경로를 실제 설치 helper로 시작·조회·중지·정리한다.
   모듈 경로 오류가 없다는 관찰과 실제 모델 역할 성공을 별도로 기록한다. 정상 session 식별자는
   helper 반환값을 사용하며 다른 checkout이나 이전 실행의 session을 채택하지 않는다.

실제 모델이 필요한 실행 증거가 이미 같은 후보·설치물·환경에 있으면 그 범위로 재사용한다.
없으면 관련 CI 계획의 신뢰된 host·인증·예산·시간 정책을 먼저 확정하여 기존 제품 경로의
최소 충분한 역할 실행을 선택한다. macOS의 기존 `--phase pipeline --run-models`는 사용 가능한
경로지만 Windows용 실행기나 모델 없는 init 명령으로 해석하지 않는다. Windows의 미지원
선택 역할을 강제로 켜거나 full pipeline 성공을 모사하지 않는다. `eval`·110분 idle·운영 승격용
전체 gate를 매 OS에서 다시 수행하는 것은 이 경로 이동 인수의 기본 조건이 아니다.

#### 상태를 유지하는 서버 교체 protocol

이 대조는 자동 init 리허설과 별도 campaign으로 수행한다. 실행 전에 S0/S의 Prisma schema와
migration 차이를 확인한다. 호환 불명 또는 추가 schema 작업이 필요하면 이 계획에서 임의로
적용하지 않고 중단한다. 각 checkout의 의존성·generated client·fresh build를 따로 준비한다.

1. 전용 DB를 한 번 준비하고 S0에서 T를 seed/bootstrap한다. P0를 실제 선택한 cache에서
   연결하고, 정상 HTTP/MCP 응답·installation tuple과 관리 파일을 기록한다. 지원되는 실제
   서비스/API로 열린 실행과 receipt/pin을 준비한다. DB 컬럼을 직접 바꿔 정상 상태를 만들지 않는다.
2. P0 파일·lock·harness 설정·token·서버 origin과 DB identity를 고정한다. user/project ID,
   channel/release ID, 열린 실행 ID·revision·receipt/pin·이벤트/결과 집합을 snapshot한다.
   중간 서버 교체 시에는 모델/runner writer를 정지 또는 안전한 checkpoint에서 drain한다.
3. S0의 소유 프로세스 종료와 port 해제를 확인한 뒤 S를 **같은 origin, 같은 DB**로 시작한다.
   이 사이에는 init·seed·bootstrap·template activation을 호출하지 않는다. 후보로 재init하면
   사라질 호환성 결함을 숨길 수 있으므로 먼저 변경하지 않은 P0로 재조회/재개한다.
4. 기존 instruction/receipt/pin과 결과 집합이 보존되고 기존 정책에 따른 요청만 전진하는지 본다.
   잘못된 surface hash 대조는 새 AgentRunStep·pipeline materialization 없이 거부돼야 한다.
   인증 사용 기록·요청 예산 등 기존 계약상 bookkeeping은 금지할 업무 쓰기와 구분한다.
5. 그 관찰을 저장한 뒤에만 P를 선택해 dry-run/update하고 `S/P`를 확인한다. 사용자 수정 사례는
   아래의 별도 case를 사용한다. 시퀀스 종료 전 DB·기존 pin·이전 cache를 정리하지 않는다.

고정 S0의 `startServer`는 port 45438을 사용하고, 후보의 `startSmokeServer`는 `port` 인자를
지원한다. 이 경로를 재사용할 때 해당 port의 미사용/소유권부터 확인한다. S0의 `stopServer`가
반환했다는 사실만으로 종료를 인정하지 않고 실제 child exit/close와 listener 해제를 확인한다.
다른 프로세스를 일괄 종료하지 않는다. 이 대조의 native Bearer/설치·pin 관찰을 웹 cookie의
서버 재시작 호환성까지 확대하지 않는다.

현재 macOS `--previous-package`는 **S 한 서버**에서 P0 init 후 P init을 수행한다.
그 invocation을 두 번 실행해도 위 S0→S 전환이 되지 않는다. 교체 대조는 소유한 외부 scratch의
검증 controller/수동 protocol로 수행하고 호출 목록·controller 내용 hash·각 source SHA와
snapshot을 보고서에 남긴다. 제품에 sourceRoot override나 검증 전용 public API를 추가하지 않는다.

#### 실패 유형별 기대 상태

| case | 실제 조작·기대 관찰 | PASS로 해석하면 안 되는 결과 |
| --- | --- | --- |
| 정상 설치의 dry-run | 설치·설정·관리 파일·lock의 경로/bytes가 전후 동일, 새 guard/lock/출력 없음 | 내용만 비교하여 새 파일·guard·lock의 생성을 놓침 |
| 소유하지 않은 기존 generated-path 파일 | adopt 없이 실행하면 기존 파일을 덮지 않고 refuse | 임의 adopt 또는 파일을 치운 새 설치만으로 원래 충돌을 통과 처리 |
| 수정한 managed 파일 | P0 정상 설치 후 실제 생성 파일 하나에 식별 가능한 수정을 가함. update가 그 bytes와 이전 lock hash를 보존하고 client state는 pending, ready 성공 아님 | 모든 파일/lock이 그대로여야 한다는 assertion. 수정하지 않은 대상은 이미 갱신됐을 수 있음 |
| 설치 report 실패/응답 유실 | 작성된 파일 목록과 pending lock, 서버의 실제 반영 여부를 각각 관찰. 기존 재시도 계약 적용 | init 실패이므로 모든 파일·DB가 rollback됐다고 가정 |
| pending/modified/missing/incompatible의 dispatch | 실제 역할 시작·업무 전진을 거부하고 기존 pin/원장을 보존 | ready를 직접 써 넣거나 소유권 불명 lock을 지워 통과 |

사용자 수정 case는 일반 정상 update와 별도 분기다. 수정 파일뿐 아니라 다른 client 전용 파일,
공유 문서와 lock의 두 client 항목을 관찰한다. `harness-init.mjs`는 shared 내용/config가 달라지면
다른 client state도 pending으로 바꿀 수 있으므로 전체 lock의 무변경을 요구하지 않는다.
복구 대조는 시험자가 만든 수정만 보존본으로 되돌린 뒤 정상 init을 재시도하여 ready를 확인한다.
실제 사용자 수정의 자동 폐기를 허용하는 절차가 아니다.

### TASK-ACCEPT-04: 증거 판정·후속 연결과 Phase 종료

- satisfies: REQ-SMB-004, REQ-SMB-005
- preserves: INV-SMB-001
- governed-by: CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-05

제안 보고서에 필수 관찰별 결과를 모으고 새 코드 구현 없이 소유 문서에 연결한다.
후속 실행 범위에 보고서와 완료 기록 갱신이 포함됐을 때만 이 계획/상위 SDD의 상태를 갱신한다.
architecture는 실행 로그의 저장소가 아니다. 영구적인 호환성/지원 계약 변경이 발견되면
현재 계약과 충돌을 기록하고 별도 결정·수정 범위로 처리한다.

- 실행자·관측 시각, server/plugin/workflow/template SHA, 실제 설치/이전 설치물 identity,
  OS/architecture/client version, channel/phase/scenario, run/job/attempt와 private 증거 위치를 기록한다.
- `clientTarget`/`normalizeClientEvidence`의 schema 2가 적용되는 실행은 기존 필드로 정규화한다.
  수동 실행에 GitHub run ID를 만들어 넣지 않는다. 해당 계약을 출력하지 않는 도구는 원본 요약과
  보고서의 필드 대응을 함께 남기며 public gate 기록에 자동 수용됐다고 하지 않는다.
- 정규화 성공은 합격 판정이 아니다. 실제 schema 2 실행은 신뢰할 수 있는 execution/attempt의
  증거를 독립적으로 확인하고 `evidenceDigest(evidence)`로 해시를 계산한다. 이 함수는
  `normalizeClientEvidence` 결과를 JSON으로 직렬화한 SHA-256을 반환하며, 그 값이
  `executions[].evidenceSha256`의 기준이다. 사전에 고정한 expected 집합·resource 목록과 함께
  `evaluateClientCandidate`로 누락·다른 identity·정리 실패·미검토 진단·재시도를 판정한다.
  원문 로그/JSON 파일 또는 보관 archive의 bytes 해시는 별도 보관 무결성 자료이며 이 필드에
  대신 넣지 않는다. 입력이 없는 수동 관찰이나 부분 역할 실행을 full pipeline record로
  꾸미지 않고 보고서의 해당 관찰 범위로만 판정한다.
- init의 모델 호출 0, 실제 호출 수/시간/가능한 비용, 진단과 cleanup 결과를 분리한다.
  `reviewRequired`·harnessErrors·stepRefusals가 있으면 원인을 검토하며 exit 0만으로 PASS하지 않는다.
- 결과는 pass/fail/blocked/not-executed/reused를 구분한다. 필수 행의 skip·미실행·출처 불명은
  전체 PASS가 아니다. 재사용 행에는 원래 증거와 입력 동일성의 근거가 필요하다.
- 템플릿 설치 후속의 같은 tuple 관찰과 CI 동등화 작업은 증거 링크를 공유한다. 이 Phase가
  전체 CI 동등화·운영 복원·사용자 설치 인증까지 완료했다고 대신 표시하지 않는다.

보고서 생명주기는 [test-reports 규칙](../../test-reports/README.md)을 따른다. 결과가 fail이어도
정해진 캠페인 기록은 완료할 수 있지만, 부모 ACCEPT/REQ-SMB-005가 완료된다는 뜻은 아니다.

## Verification detail for VFY-SMB-05

Canonical verifier: [VFY-SMB-05](./2026-11-17-shared-modules-and-plugin-distribution.md#vfy-smb-05-출시-reader격리-설치실행-인수).
정의와 `verifies`는 부모에 유지한다. 아래는 모두 **Planned / Not executed in this authoring task**다.

| 관찰 | Task | 입력·행동 | 합격·거부 기준 |
| --- | --- | --- | --- |
| 외부 경로 완전성 | 01 | 고정 T, 후보 skill, 이전 실제 cache의 직접/계산형 경로 대조 | 새 설치물에 필요한 제거 경로가 없음. 미확인 참조는 blocker로 유지 |
| artifact 독립성 | 02 | 실제 package inventory와 별도 소비 위치의 native helper 실행 | closure bytes·native 자원·mode·verifier 일치, 저장소 개발 의존성 없이 정상 경로 실행 |
| 설치 선택·update | 03 | 실제 loader cache, 빈 cache 신규 설치, 이전 artifact update | 선택된 payload 일치, dry-run 무변경, 사용자 수정·다른 client·기존 pin 보존 |
| 이전 서버/플러그인 대조 | 03 | 동일 T/config/plan/language의 S0/P0 → S/P0 → S/P | 기존 정상·거부·부수효과·호환성 판정 유지. 차이가 있으면 새 후보 전 재설계/수정 |
| 설치 상태·reader 거부 | 02/03 | pending/modified/missing/incompatible, 출시 reader corpus | 기존 보존·거부 유지. 예상 거부를 새 서버 연결 성공으로 바꾸지 않음 |
| 실행·정리 | 03 | 설치 helper의 지원 경로, 필요한 경우 승인된 실제 역할 | 모듈 해석·실제 결과·소유 프로세스 종료·잠금/fixture 정리를 각각 확인 |
| 증거 완전성 | 04 | 필수 행 목록과 실제/재사용 결과 집합 대조 | 누락·중복·다른 SHA·미검토 진단 없음. 관찰 범위 밖의 성공으로 확대하지 않음 |

### 해시·본문 비교와 기존 시험의 한계

`tests/templates/private-template-release.test.ts`는 `HARNESS_RELEASE_SOURCE`가 없으면 skip한다.
실행 시 source와 `HARNESS_RELEASE_COMMIT`을 모두 지정하고 실제 export의 T를 먼저 검증한다.
시험의 기본 가짜 commit 값이나 fixture CLI/verifier를 실제 client 설치 증거로 사용하지 않는다.

이동 전후 비교는 P0의 `packages/core/templates/release-manifest.mjs`와 후보의
`src/server/templates/release-preparation.ts`, 양쪽의 manifest/runbook 생산 함수를 각각 해당
checkout의 별도 프로세스에서 호출한다. 같은 T rows·source descriptor·client·plan·language·
고정 releaseId/config를 주고 결과 JSON/본문 hash를 비교한다. free/pro/max, 두 client,
완전한 모든 언어와 기존 계약의 잘못된 installation 입력을 포함한다.
검증 adapter가 필요하면 소유한 외부 scratch에 두고 명령·내용 hash를 보고서에 보존한다.
제품 export·전역 barrel·새 npm dependency를 추가하지 않는다. 선택한 이전 버전에 함수가 없으면
몰래 최신 구현을 대신 넣지 않고 그 버전의 wire/reader 관찰로 범위를 다시 정한다.

제외할 수 있는 차이는 package sourceRevision·서로 다른 임시 경로 등 명시된 provenance뿐이다.
template 본문·contract/surface hash·installation 의미를 정규화하여 차이를 지우지 않는다.
`rehearse-acceptance-failure --templates`는 legacy 경로의 보조 증거로만 사용할 수 있다.
현재 T가 그 10행 fixture 조건과 맞는지 확인하지 않고 실행하거나, 행 수 검사를 지워 통과시키지 않는다.

출시 reader corpus는 실행 시 고정한 main 이력에서 실제 선택한 version/commit 목록을 기록한다.
특히 `f2d7196675f8ee6f7b21581eac83cdc7bc2c8ecf`의 0.5.33 init은 v2 ready/pending lock을
**파일 변경 없이 거부**하는 것이 기대 결과다. 모든 과거 설치본에 새 설치를 허용하라는 요구가 아니다.

## 실행 명령과 선행 조건

이 절은 후속 실행용이다. `SMB_` 변수는 Task 01/02에서 검증한 실제 절대 경로·SHA를 넣는다.
이번 작성에서 값이 없는 host/runtime/cache를 임의의 개인 설치 경로로 채우지 않는다.
POSIX 예시이며 Windows에서는 같은 argv를 PowerShell로 전달하고 각 `$LASTEXITCODE`를 확인한다.

### 공통·private corpus·실물 제작

깨끗한 후보 checkout에서 필요한 개발 의존성·Prisma client를 그 checkout에 준비한다.
기존 CI와 입력이 같으면 전체 check/build 반복 대신 증거를 재사용한다. 다른 후보·도구·입력이면
그 영향을 받는 검사를 다시 실행하고 fresh manifest 검사는 해당 build 뒤에 실행한다.

```bash
set -e
node scripts/plugin-lib.mjs --check
npm run verify:shared
STAGEKEEPER_RELEASED_READERS=required node --test plugin/bin/harness-released-readers.test.mjs plugin/bin/harness-released-init-readers.test.mjs
HARNESS_RELEASE_SOURCE="$SMB_TEMPLATE_EXPORT" HARNESS_RELEASE_COMMIT="$SMB_TEMPLATES_SHA" npm run test:template-release
```

각 native OS에서 검증된 runtime과 **없는 외부 출력 경로**를 사용한다.

```bash
node scripts/macos/package-plugin.mjs --output "$SMB_NEW_BUNDLE" --runtime "$SMB_NATIVE_RUNTIME"
```

```powershell
node scripts/windows/package-windows-plugin.mjs --output $SMB_NEW_BUNDLE --runtime $SMB_NATIVE_RUNTIME
if ($LASTEXITCODE -ne 0) { throw 'Package acceptance failed' }
```

위 두 명령을 같은 OS에서 모두 성공시켜야 한다는 뜻이 아니다. 실제 생성물의 경로와 hash는
보고서에 저장하며 test fixture의 fake runtime을 이 입력으로 사용하지 않는다.

### macOS Codex의 기존 모델 없는 init 경로

신뢰된 설치 절차로 선택된 cache를 먼저 대조한 뒤 `--package`에 **그 실제 경로**를 전달한다.
제작 output을 그대로 전달한 helper 성공만으로 loader 선택까지 통과했다고 하지 않는다.
이 리허설은 실행마다 `seedTemplates` → `bootstrapSmokeTemplates`를 호출한다. 따라서 단순히
이름이 `stagekeeper_test_*`인 DB가 아니라 **해당 invocation/attempt가 새로 소유한 빈 DB**에
후보 migrations를 적용하고 untouched legacy channel을 확인해야 한다. 검사할 값은
mode=legacy, legacyWritesBlocked=false, activeReleaseId=null이며 다른 캠페인의 데이터가 없어야 한다.
기존 사용자/다른 시험의 DB를 비워 이 조건을 만들거나 versioned channel을 legacy로 내리지 않는다.

loopback DB, fresh build, HEAD=T의 clean private Git checkout, 새 외부 evidence 디렉터리가 필요하다.
`--browser-cli`는 init에서도 현재 parser가 요구하는 절대 경로다. DB 준비·identity 확인은
아래 명령에 포함되지 않으며, 해당 준비가 완료된 경우에만 실행한다.

```bash
TEST_DATABASE_URL="$SMB_INIT_DATABASE_URL" node --import tsx scripts/rehearsals/rehearse-codex-macos.mjs \
  --phase init --package "$SMB_INSTALLED_CACHE" --templates "$SMB_TEMPLATE_CHECKOUT" \
  --work "$SMB_NEW_EVIDENCE" --browser-cli "$SMB_BROWSER_CLI"
```

update는 `SMB_UPDATE_DATABASE_URL`의 **다른 새 DB**와 새 evidence 경로에서
`--previous-package "$SMB_PREVIOUS_CACHE"`를 추가한다. 외부 원인 재시도도 새 DB/경로를 쓴다.
그 호출 내부의 P0→P update는 같은 DB를 쓰지만, 독립적인 new-user/update invocation 사이에는
DB를 재사용하지 않는다. 앞의 서버 교체 campaign DB와도 분리한다.
이 helper는 이전 package의 init도 실행하지만 이전 loader 설치 선택은 별도로 증명해야 한다.
`init`에는 `--run-models`를 넣지 않는다. outer wrapper가 auth smoke 모델 turn을 실행하는지도
확인하여 helper의 모델 0과 전체 workflow 모델 0을 혼동하지 않는다.

bootstrap은 DB 전역의 TemplateChannel을 versioned로 바꾸고 legacy 쓰기를 차단한다.
helper의 finally는 fixture user를 지울 뿐 template/release/channel을 초기 상태로 되돌리지 않는다.
더구나 `deleteFixtureUser`는 삭제 오류를 경고로 처리하므로 `summary.result=pass`만으로
정리 완료를 판정하지 않는다. 외부 controller가 자기 user/자식/서버의 종료·삭제를 확인하고,
증거를 보존한 뒤 정확한 소유 DB를 폐기하거나 보존 사유와 담당자를 기록한다.
정리 실패는 전체 PASS가 아니다. private 증거 보관은 실행 중 fixture/DB의 정리와 따로 기록한다.

Windows Codex용 위 명령의 복제나 공개 init의 미지원 인자 조합은 제공하지 않는다.
BLK-SMB-02를 해소한 소유 실행기의 실제 인자/수동 절차를 보고서에 고정한 뒤 사용한다.
운영 승격용 `gh workflow run`, production DB 명령이나 개인 설치 갱신 명령은 이 계획에 포함하지 않는다.

## Lifecycle, Failure, and Recovery

| 상황 | 처리·보존 조건 |
| --- | --- |
| 입력/manifest/runtime/hash 불일치 | 설치 전에 중단. 후보·실패 output 보존, 다른 artifact로 바꿔 결과를 이어 쓰지 않음 |
| 이전 artifact 또는 host 미확보 | 해당 행 BLOCKED. 신규 설치 시험이나 다른 OS PASS로 update/해당 OS를 채우지 않음 |
| 사용자 수정·pending·incompatible 설치 | init의 파일 보존·pending과 dispatch의 무진행을 위 상태표로 구분. 강제 adopt·cache 덮어쓰기·lock 삭제 없음 |
| 자동 seed 리허설의 재호출 | 새 invocation 전용 DB 사용. 이전 versioned DB의 barrier를 해제하지 않음 |
| 서버 교체 대조 | 시퀀스 내부의 같은 DB/origin/P0 유지. S0 종료 확인 전 S를 시작하거나 중간 seed/reinit으로 상태를 교체하지 않음 |
| 동시 실행·인증 홈 점유 | 소유자·실행 식별 후 직렬화. 다른 실행을 정리 대상으로 삼지 않음 |
| 취소/timeout/인증·모델 오류 | 소유 runner stop → 자식/브라우저/서버 종료 확인 → 자기 잠금 반납 → fixture/DB 정리. 미확인 자원은 보존하고 실패 이유 기록 |
| init/report 도중 응답 유실 | 기존 pending/ready·재시도 계약을 관찰. 소스 이동을 이유로 새 rollback/중복 방지 정책을 만들지 않음 |
| 외부 원인 재시도 | 원인·첫 실패·새 attempt를 보존하고 한 번만 재시도. 제품 불일치면 수정된 후보로 새 캠페인 |
| 기록만 실패 | 기존 원문 결과를 보존해 기록만 복구. 모델·설치를 다시 실행하거나 실행 SHA를 바꾸지 않음 |

이전 설치는 독립 디렉터리/시험 홈에 보존한다. 되돌림은 소유 시험 환경에서 이전 설치를 다시
선택하는 절차이며, 더 높은 판의 사용자 cache를 제자리 덮어쓰거나 version을 내리는 방식이 아니다.
DB는 검증된 별도 TEST_DATABASE_URL만 사용하고 운영/개발 DB URL과 같은 대상이면 중단한다.
공개 보고서는 허용한 identity·관찰·요약만 포함하며 credential·private template·원문 전사는 제외한다.

## 검증량과 실행 자원

제품 query나 런타임 성능을 변경하지 않으므로 새 benchmark/성능 개선 주장은 없다.
검증량은 실제 manifest의 완전한 언어 수를 L이라 할 때 기본 해시 비교가 6L쌍이며,
두 checkout의 입력 평가는 12L건이다. 이 순수 비교는 동일 T/도구 입력이면 OS 설치 행마다 반복하지 않는다.
필수 native OS/채널 관찰은 유지하고, 각 행의 입력이 다른데 순수 계산 결과로 대체하지 않는다.

Task 01에서 DB/인증 홈/port/cache의 배타 소유와 campaign 전체 종료 시간을 고정한다.
현재 source의 300초 helper/seed 제한, 120초 서버 시작 제한과 개별 종료 제한이 전체 campaign의
예산을 대신하지 않는다. 모델 호출은 입력·증거 공백이 확인된 행에만 배정하고, 원래 실패를
남긴 한 번의 외부 원인 재시도 한도를 유지한다. 측정 전 속도나 비용 수치를 약속하지 않는다.
독립 DB를 준비할 수 있어도 같은 인증 홈·설치 cache를 쓰는 native 행은 직렬 실행한다.
전역 template snapshot이 다른 프로젝트까지 읽지 않도록 invocation 전용 DB 조건을 먼저 확인한다.

## Blockers and Readiness

부모 [BLK-SMB-01](./2026-11-17-shared-modules-and-plugin-distribution.md#blk-smb-01-배포-템플릿기존-설치본의-외부-경로-참조-확인)은
아직 유지한다. 이번에는 T의 실제 private 본문이나 설치 cache를 열지 않았으므로 해소했다고 하지 않는다.
Task 01의 외부 참조 원장과 Task 03의 실행 결과가 해소 근거다.

### BLK-SMB-02: 실제 native 설치 host·loader·실행 계약

- classification: current-phase; Task 03의 해당 설치/실행 행 진입 전.
- evidence: macOS 전용 리허설과 private wrapper의 기존 문서는 있으나 현재 host/auth/cache는 미확인이다.
  Windows 전용 실행기는 공개 저장소에 없고 관련 CI 계획도 host 조건을 남겨 두었다.
- affects: REQ-SMB-005, TASK-ACCEPT-03, VFY-SMB-05.
- impact: helper 직접 호출이나 fake CLI 성공을 실제 loader/native 설치 성공으로 오인할 수 있다.
- unblock requirement: 소유 host·설치/인증 홈·기존 설치물·실제 installer/launcher·정리 방법과
  필요한 모델 실행 범위를 확정한다. Windows는 관련 소유 작업의 검증된 실행기 또는 구체적 수동 protocol을 연결한다.
- owner: 실행 환경/설치 소유자와 ACCEPT 실행 담당자. 특정 개인을 임의 지정하지 않는다.
- stop condition: 대상/권한/종료 확인 수단이 없으면 그 행을 실행하지 않고 BLOCKED로 유지한다.

### BLK-SMB-03: 이전 실물·지원 집합과 입력 identity의 확정

- classification: current-phase; Task 02/03의 재사용·update·완료 판정 전.
- evidence: source 이전 SHA와 T는 기존 CI 요약에서 확인했다. native 이전 archive의 실제 hash,
  현재 private export, 필수 설치 채널과 Intel 실제 client 인수 범위는 이번에 확인하지 않았다.
- affects: REQ-SMB-004, REQ-SMB-005, TASK-ACCEPT-01, TASK-ACCEPT-03, TASK-ACCEPT-04.
- impact: 재생성 fixture를 실제 배포물로, 일부 조합을 전체 지원 범위로 잘못 표시할 수 있다.
- unblock requirement: Task 01 입력 원장에 실제/재생성 여부와 hash·출처·필수 행 목록을 확정하고
  기존 지원 계약과 대조한다. 새 지원 범위 결정이 필요하면 해당 계약 소유자에게 연결한다.
- stop condition: 필수 행 누락·입력 불명·지원 범위 충돌이 남으면 ACCEPT/부모 완료를 표시하지 않는다.

판정은 **CONDITIONALLY READY**다. 후속 실행이 요청되면 Task 01의 자료 확정과 가능한
Task 02의 제작 검증부터 진행할 수 있다. 실제 설치·모델 실행은 위 blocker를 해당 지점에서
해소하기 전에는 준비 완료가 아니다. 문서 작성 완료와 ACCEPT 인수 완료를 구분한다.
이미 승인된 범위를 다시 묻지 않되, 이 문서 작성 요청을 설치·운영·모델 권한으로 사용하지 않는다.

## Completion and Verification Record

완료 조건은 다음 모두다.

1. 필수 OS/architecture/client/channel·이전 설치 조합과 입력 identity가 고정되어 있다.
2. 외부 참조, 실물 bundle, 실제 cache 선택과 개발 의존성 없는 helper 실행의 증거가 있다.
3. 동일 입력의 동작·해시·본문·installation과 이전 플러그인/새 서버 조합이 기존 계약을 보존한다.
4. 필수 행의 미실행·skip·미해결 진단·정리 미확인이 없다. 재사용의 범위와 원래 출처가 명시되어 있다.
5. BLK-SMB-01/02/03의 해소 또는 승인된 상위 계약 변경이 기록되고, 운영 승격과 별개로 판정한다.

이번 작성의 기계 검증 source bundle은 이 파일과 상위 SDD 두 파일이다. 새 요구사항이나
VFY를 복제하지 않는다. 상위 문서는 ARCH/MIGRATE와 외부 인수까지 포함하고 이 계획에는
설치 환경의 조건이 남아 있으므로 strict 전체 실행 준비 판정을 선택하지 않는다.
standard traceability와 선택한 ACCEPT의 Task–관찰–요구사항 연결을 의미적으로 검토한다.

| 초안 작성 시 검증 | 결과·한계 |
| --- | --- |
| `validate_sdd_traceability.py --format json`에 상위 SDD와 이 문서 전달 | PASS, 오류/경고 0. 요구사항 7개에 연결 누락 없음. 이 수치는 전체 부모 그래프의 구조 검사이며 ACCEPT 실행 완료가 아님 |
| `npm run docs:check` | PASS, 229개 Markdown·1208개 상대 링크·59개 기존 test report 검사 |
| `git diff --cached --check`, 변경 범위 대조 | PASS. 이 신규 문서 한 파일만 추가; 상위 SDD·architecture·기존 결과·제품/시험/설정은 보존 |
| 의미 검토 | 후보/이전/template identity, 실제 cache와 제작물 구분, 공개 init의 미지원 인자, legacy 10행 fixture, Windows host 공백, 부수효과·정리·중복 실행 경계를 확인 |
| 실제 ACCEPT 실행 | NOT EXECUTED. 제품 시험·패키징·DB·설치·모델·gate를 실행하지 않았고 기존 run 조회를 새로운 PASS로 표시하지 않음 |

기계 검증은 명령/계약의 의미나 아직 확보하지 않은 host·artifact를 증명하지 않는다.
선택한 두 요구사항은 네 Task와 상위 VFY-SMB-05에 연결되며, 필수 행의 실제 결과와
blocker 해소가 있어야 Phase를 완료할 수 있다. 현행 영구 규칙의 추가 변경은 제안하지 않는다.

## plan-eng-review 검토 기록 — 2026-11-17

대상은 이 문서이며, 입력 SHA-256은
`bbdaf1934370b2352813e4599d7f1de016bda3921faaa167d4bd45a39b4c25a8`이다.
동일한 미병합 문서 작업의 후속 검토로 `aea8ae51dfcb41ed1f4bfdd379df3a9eef101049` 소스를
대조했다. 원격 최신성·private host·실제 인수를 다시 확인했다고 주장하지 않는다.
사용자의 검증·개선 요청에 따라 문서의 사실 오류·절차·필수 증거만 보완했다. 제품/시험 구현은 변경하지 않았다.

### 범위와 기존 구현

예상 영구 변경은 후속 실행의 이 계획/부모 완료 기록과 인수 보고서 최대 3개 문서다.
제품 클래스·서비스·공개 API 추가는 0이다. 외부 scratch의 검증 controller는 필요할 때
내용 hash와 소유권을 남기는 임시 검증물이며 새 배포 모듈이 아니다.
OS별 새 실행기·별도 CI를 ACCEPT에서 만드는 대안보다 기존 도구와 한 보고서의 행별 증거를
재사용하는 현재 구조가 작고 소유권도 명확하다. 새 public boundary가 없으므로 별도의
서비스/모듈 설계 비교는 적용하지 않았다. 지원 범위·개인 설치 권한·Windows runner 구축은 확장하지 않았다.

### 주요 발견과 반영

처음부터 개선점이 없었던 문서가 아니다. 아래 네 항목은 소스 대조로 확인한 **계획의 문제**이며,
실제 설치 장애를 실행·재현했다는 주장은 아니다.

| ID·중요도·확신 | 초기 위치·발생 조건과 영향 | 근거·반영 |
| --- | --- | --- |
| F1 · CRITICAL · 9/10 | macOS init 명령/복구: 새 evidence 경로만 만들고 DB를 재사용하면 다음 seed/bootstrap이 거부된다. helper PASS를 DB 정리 완료로 오인할 여지도 있었다 | `rehearse-codex-macos.mjs:129–132,331–344`, `rehearse-client-init-smoke.ts:369–399`, `bootstrap-service.ts:81,146`, migration의 legacy write barrier. 호출별 새 DB·불가역 channel·외부 cleanup 확인을 명시 |
| F2 · INFORMATIONAL · 10/10 | template 입력/CLI: 일반 export를 seed 리허설에 전달하면 Git 조회가 실패하거나 상위 public 저장소 SHA를 출처로 기록할 수 있다 | `seed-templates.ts:13–25`와 `readTemplateSources`. export와 Git 관리 입력을 분리하고 실제 Git root/HEAD/T/rows hash 확인 추가 |
| F3 · CRITICAL · 8/10 | Task 03의 S0/P0 → S/P0 → S/P: 독립적인 새 fixture 세 개나 두 번의 자동 init으로도 통과했다고 해석할 수 있어 기존 pin/receipt 보존을 증명하지 못한다 | macOS `main`은 한 후보 서버를 시작해 P0/P helper를 차례로 호출한다. 같은 DB/origin·변경하지 않은 P0·writer drain·S0 종료·중간 seed/reinit 금지의 전환 protocol 추가 |
| F4 · INFORMATIONAL · 9/10 | Task 03/실패 표: 사용자 수정 init과 dispatch 거부를 모두 무변경으로 해석하면 현재 pending/부분 적용 계약에 맞지 않는 oracle이 된다 | `harness-init.mjs:287–291,333–380`, `install-manifest.mjs:9–28`, dual init 시험. 실패 종류별 bytes/hash/pending/ready·다른 client lock 기대 상태 분리 |

반증도 확인했다. bootstrap의 동일 requestId 재호출 처리는 있지만 리허설은 새 login/requestId로
다시 seed하며 channel을 복구하지 않으므로 F1을 해소하지 않는다. Git 관리 private 입력을
전제로 삼으면 F2는 발생하지 않지만 초안은 일반 export도 허용했으므로 그 전제를 명시했다.
같은 state를 유지하는 별도 controller가 있으면 F3를 검증할 수 있지만 기존 init entrypoint가
그 역할을 하지 않으므로 필요한 관찰을 분리했다. dispatch 자체의 무진행은 유지하되 init의
허용된 부분 쓰기를 구분하여 F4를 고쳤다. 고정 S0/S의 Prisma schema·migration diff는 0임을
읽기 전용 Git 비교로 확인했으며, 이 사실을 다른 이전 버전으로 일반화하지 않는다.

### 네 검토 영역

| 영역 | 결론 |
| --- | --- |
| Architecture | F1/F3 반영. 자동 bootstrap campaign과 상태 유지 server-swap campaign의 DB 수명이 다르며, 기존 private/공개 CI 소유권은 유지 |
| Code quality | F2/F4 반영. 실제 CLI/실패 계약을 사용하고 새 wrapper/public export를 만들지 않음. schema 정규화와 `evaluateClientCandidate`의 합격 판정을 구분 |
| Tests | 기존 fixture·서비스 통합 시험의 실제 assertion 범위를 확인. 아래 네 관찰 공백을 인수 절차로 명시했고 새 시험은 구현/실행하지 않음 |
| Performance | 제품 hot path 변경 없음. DB 전역 snapshot은 전용 DB로 한정하고, 순수 비교 6L쌍·입력 12L건을 설치 행마다 중복하지 않음. 시간/인증 자원/재시도 예산의 소유자를 명시 |

### 실행·검증 흐름

```text
private Git input [기존 seed CLI: root/HEAD/rows 확인 필요]
  -> 새 DB A -> seed -> bootstrap(versioned, 되돌림 불가) [기존]
  -> P0/P init -> helper summary [기존, loader/DB 전체 정리는 미증명]
  -> 실제 cache + cleanup 관찰 [계획] -> evidence 보존, 소유 DB 종료
  다음 invocation은 새 DB B [계획: A의 channel을 reset하지 않음]

같은 전용 DB V + origin + P0 [계획된 서버 교체 관찰]
  S0/P0의 열린 pin/receipt [기존 서비스/API]
  -> writer drain, S0 exit/port 해제 [계획된 checkpoint]
  -> S/P0, init/seed 없음 [GAP -> 실제 HTTP/MCP 인수]
  -> 원래 state 보존 확인 -> P update -> S/P
       +-- modified init -> bytes/이전 hash 보존 + pending [기존 계약]
       +-- pending dispatch -> 역할/업무 전진 없음 [기존 계약]
```

새 DB가 없으면 seed 전 차단, T 출처 불일치는 seed 전 차단, S0가 닫히지 않으면 S 시작 전 차단,
modified 설치는 pending 유지가 각각 작업자에게 보일 결과다. 조용히 새 fixture로 바꾸거나
unknown cleanup을 성공으로 바꾸는 경로를 허용하지 않는다.

### 실제 assertion과 필요한 인수 관찰

| 기존 근거·평가 | 증명하는 범위 | 아직 직접 관찰할 것 |
| --- | --- | --- |
| `scripts/plugin-lib.test.mjs:97–146,167–186`, 두 package 시험 · Strong | 잘못된 그래프/경로/추적 목록의 쓰기 전 거부·바이트 보존·fixture package | 실제 배포물의 loader/cache 선택과 native 실행 |
| `tests/server/integration/template-execution.test.ts:15–98` · Strong | 같은 DB의 기존 instruction/receipt/pin, 잘못된 surface의 무 materialization | S0→S 실제 서버 교체와 변경하지 않은 설치 P0 |
| `plugin/bin/harness-init-dual.test.mjs:146–166` · Strong | dry-run 무출력, 수정 파일/이전 hash 보존·실패·guard 정리 | 실제 선택 cache의 update 및 pending/부분 쓰기 관찰 |
| `tests/templates/private-template-release.test.ts:20–62` · Strong(정해진 fixture 범위) | corpus×client/plan/language HTTP 설치·pending report·동일 tuple | 실제 client/verifier·서버 교체·loader. fake CLI와 fixture HTTP 한계 유지 |
| `scripts/rehearsals/smoke-server.test.mjs:73–199` · Strong | 소유 child/IPC·점유 port 거부·timeout·미확인 종료 실패 | S0 helper를 포함한 교체 controller의 실제 종료 checkpoint |

다음은 추가로 작성한 테스트 코드가 아니라 인수 보고서에서 확보할 관찰이다.

| 관찰 ID·우선순위 | 연결·검증 내용 | 상태 |
| --- | --- | --- |
| ER-T1 · P1 | F1 / Task 03: new-user와 update invocation을 다른 새 DB에서 실행. channel 전환·남은 전역 자료·user 삭제 실패를 독립 확인 | Planned |
| ER-T2 · P1 | F2 / Task 01: 일반 export와 public 상위 Git root를 seed 전 거부하고, T의 private Git 입력/rows 대조만 허용 | Planned |
| ER-T3 · P1 | F3 / Task 03: 같은 DB/origin/P0를 유지한 S0→S 전환과 pin/receipt 무변경 대조. 중간 init/seed 흔적이 있으면 증거 무효 | Planned |
| ER-T4 · P1 | F4 / Task 03: 수정 managed 파일을 실제로 만든 update의 bytes/이전 hash/pending, report 실패와 dispatch 거부를 각각 확인 | Planned |

ER-T1 Value: protects=캠페인 격리와 정리 판정; fails_when=versioned DB 재사용 또는 user 삭제 실패를 PASS 처리;
why_new=기존 finally는 user만 정리하고 오류를 경고로 처리; seam=제품 변경 없음; no_claim=운영 DB 복원.

ER-T2 Value: protects=T의 출처; fails_when=export에 상위 저장소 HEAD를 부여;
why_new=corpus reader는 Git을 요구하지 않지만 seed CLI는 요구; seam=입력 preflight; no_claim=private 내용의 제품 적합성 전체.

ER-T3 Value: protects=독립 서버 갱신의 호환성; fails_when=재init/새 DB로 기존 pin 결함을 숨김;
why_new=기존 DB 통합 시험과 init 도구는 실행 서버 교체를 하지 않음; seam=외부 검증 controller; no_claim=다른 지원 버전·웹 cookie 세션.

ER-T4 Value: protects=수정 파일 보존·불완전 설치의 실행 거부; fails_when=ready 오판 또는 pending을 잘못된 회귀로 판정;
why_new=실제 설치 cache에서는 아직 미관찰; seam=기존 launcher; no_claim=강제 adopt/사용자 수정 폐기의 승인.

### 결정과 최종 준비도

| 결정 | 처리 | 근거·허용 범위 |
| --- | --- | --- |
| D1: 호출별 새 DB와 외부 cleanup 검증 | accepted | 사용자 문서 개선 요청 + 기존 테스트 DB/소유 자원 경계. 실제 DB 생성·삭제 승인은 아님 |
| D2: export/Git 관리 입력 구분 | accepted | CLI의 사실 정정. private 소스 접근이나 수정 권한을 새로 부여하지 않음 |
| D3: state-preserving 서버 교체 protocol | accepted | 이미 요구한 REQ-SMB-004/005의 필요한 증거 구체화. 새 제품 상태/프로토콜 없음 |
| D4: 실패 유형별 oracle | accepted | 기존 init/dispatch 동작 보존. adopt·강제 release 허용 없음 |
| D5: host/이전 artifact/필수 채널·Intel 범위 | pending | 기존 BLK-SMB-02/03 유지. 문서 개선을 근거로 대신 선택하거나 범위를 축소하지 않음 |

검토 결과는 **문서의 알려진 수정 필요 항목 해소, 실제 native 실행은 Needs decisions**다.
Task 01/가능한 Task 02의 조건부 준비와 Task 03의 진입 차단을 유지한다. 새 public boundary나
설치 동작을 결정하는 추가 선택은 하지 않았다. 독립 검토는 요청되지 않았으며 자체 반증 검토를 수행했다.
제품 시험·설치·DB migration·모델·benchmark는 실행하지 않았다. 최종 저장본의 문서 검사와
traceability 및 원본 보존 대조 결과는 아래에 별도로 기록한다.

| 최종 저장본 검증 | 결과 |
| --- | --- |
| 부모+선택 문서의 standard traceability | PASS, 오류 0·경고 0, canonical 요구사항 7/7 연결. 실제 인수 통과의 증거는 아님 |
| `npm run docs:check` | PASS, Markdown 229개·상대 링크 1208개·기존 보고서 59개 |
| `git diff --check`와 staged diff 검사 | PASS. 이 문서만 변경했고 원래 부모·MIGRATE 완료 기록·shared architecture의 SHA-256이 유지됨 |
| 저장본 전체 재독·반증 재검토 | 네 보완과 Task/실패·복구/검증 연결 확인. 본 검토 범위에서 추가 문서 수정 필요 사항은 확인하지 못함 |

검토 결과는 현재 기준과 조사 범위에 한정한다. 외부 host·private 입력·이전 실물의 미확정은
문구를 더 쓰거나 기존 PASS를 재분류해서 해소할 수 없으며, 해당 Task의 실제 진입 전에 확인한다.

## plan-eng-review 재검토 — 2026-11-17 (2차)

입력 SHA-256은 `1535dd1ce2a410f416b378d5b305733bf5ac6f9b2f441c9adffc072577d81c39`다.
기준 코드는 앞선 검토와 같은 `aea8ae5…`이며, 제품/시험 변경 없이 현재 문서를 재검토했다.
앞선 F1~F4의 수정은 seed/bootstrap·정리·서버 교체·init 상태 계약과 계속 일치한다.

**F5 · INFORMATIONAL · 9/10 · Task 04:** “원문 digest”를 파일 bytes의 해시로 구현하면
`evaluateClientCandidate`가 정상 증거를 `unverified-evidence`로 거부할 수 있다.
근거는 `client-ci-contract.mjs:211–212,268–271`의 정규화 후 해시 계산과 비교,
`client-ci-contract.test.mjs`의 `input`·`refresh`가 `evidenceDigest`를 사용하는 실제 호출이다.
원문이 정규화 결과와 정확히 같은 JSON bytes이면 우연히 일치할 수 있지만, 파일 포맷·필드 순서·
비허용 필드가 같은 것을 계약으로 보장하지 않는다. 원문 보관 해시와 판정용 증거 해시를 분리했다.
D6는 accepted이며, 근거는 사용자의 문서 개선 요청과 기존 함수/필드 계약이다. 제품 변경은 없다.

| 영역 | 재검토 결과 |
| --- | --- |
| Architecture | 소유권·지원 범위·전용 DB/서버 교체 경계 유지. 추가 변경 필요 없음 |
| Code quality | F5의 해시 함수·필드 대응을 명시. 새 계산 구현이나 public API를 추가하지 않음 |
| Tests | 기존 `client-ci-contract.test.mjs` 16개 실행: pass 16, fail/skip 0. 신뢰 출처·identity·누락·정리·재시도 판정 assertion 확인. 신규 시험 구현 없음 |
| Performance | 정규화/해시는 기존 함수 재사용. 앞의 6L쌍 비교·native 직렬화·자원 예산을 유지하며 추가 측정이나 성능 주장은 없음 |

기존 실행·검증 흐름도와 ER-T1~T4는 유지한다. 판정 경로는
`확인한 실행 증거 → evidenceDigest(내부 정규화·JSON 직렬화·SHA-256) → evidenceSha256 비교`이고,
원문 bytes 보관 해시는 이 경로 밖의 보관 무결성 자료다. 해시 불일치는 기존처럼 실패하며
해시를 사후에 제출 record에 맞춰 덮어쓰지 않는다. 이 시험 통과는 실제 native 인수의 증거가 아니다.

추가 구조·scope 선택은 없고 기존 D5의 host/이전 artifact/지원 집합 결정은 남는다.
자체 반증 검토이며 독립 reviewer는 요청되지 않았다. 실제 설치·DB·모델·외부 gate는 실행하지 않았다.

재검토 후 부모+선택 문서의 standard traceability는 오류/경고 0, 7/7 연결로 통과했고,
`docs:check`는 Markdown 229개·상대 링크 1208개·기존 보고서 59개를 통과했다.
저장본과 입력 snapshot의 차이 및 원본 계약 hash를 대조하여 선택 문서만 바뀐 것을 확인했다.
F5 수정 후 추가 문서 수정 사항은 확인하지 못했다. 문서의 조건부 준비 판정과 실제 native 실행의
환경 결정 조건은 유지한다.


## ACCEPT Execution — 2026-11-17

사용자의 후속 실행 요청에 따라 동일한 미병합 작업 트리에서 진행한다. Windows x64/Codex
전용 환경은 현재 없다는 사용자 답변을 받아 해당 실제 인수를 BLOCKED로 기록한다. 모델 작업은
전용 로그인과 실행 한도를 제공하겠다는 답변을 받았으며, 구체적인 값이 확정되기 전에는 실행하지 않는다.
자료 확정·격리 제작·모델 없는 검증을 독립적으로 진행하고 실제 결과를 인수 보고서에 기록한다.


### CI-only 지시 반영

2026-11-17 사용자 지시로 전용 로그인/모델 한도 확인을 종료하고 모델 없는 GitHub CI 경로로
전환했다. 로컬에서는 소스·CLI 버전·공식 archive metadata 조회와 준비용 다운로드만 수행했으며,
개인 설치·인증 프로필 변경, native 인수·DB·모델 실행은 하지 않았다. Windows와 macOS의 실물
인수 실행은 GitHub-hosted runner에서 수행한다. 기존 private CI는 다른 source/template에 고정돼
있어 retarget하거나 실행하지 않는다.

### CI-only 인수 완료 기록 — 2026-11-17

실제 tested source는 `4c5ccd6d616495c644d7a26be7afc4bbceaff030`이다.
`shared-distribution-acceptance` run `44048937201`의 Windows x64·macOS arm64/x64 job과
정제 summary가 모두 PASS이며, 각 7개 named check와 server/fixture/client/database 정리가 성공했다.
공통 `check` run `44048937150`도 8개 job 모두 PASS다.

| Task | 승인된 CI-only 범위 결과 | 근거 |
| --- | --- | --- |
| TASK-ACCEPT-01 | 완료 | 고정 T `8ccb37a`의 전체 13row·6입력 hash 비교와 옛 lib 경로 검사, 실제 corpus 설치·그래프 두 검사 |
| TASK-ACCEPT-02 | 완료 | 세 OS에서 실제 이전/후보 package 제작과 native runtime·verifier·bytes·mode·lib 15개 closure 대조 |
| TASK-ACCEPT-03 | 완료 | 실제 Codex 선택 cache의 S0/P0→S/P0→S/P, 새 빈 cache, pending 거부/복구와 session lifecycle. Claude source 4개 leg는 동일 제품 bytes의 원래 source/run으로 재사용 |
| TASK-ACCEPT-04 | 완료 | [완료 보고서](../../test-reports/completed/2026-11-17-shared-modules-plugin-distribution-acceptance.md)에 run/job/attempt·원래 SHA·해시·정리·실패 수정 이력과 정제 summary 보존 |

BLK-SMB-02의 개인 Windows host 부재는 승인된 GitHub-hosted 경로에서 해결했다.
BLK-SMB-03의 모델 로그인·한도는 이 모델 없는 범위의 진입 조건이 아니다. private self-hosted CI를
변경하지 않았고 모델 호출은 0회다. native 실행 및 현재 model-free 회귀 결과를 전체 모델 역할이나
운영 승격의 성공으로 확대하지 않는다. 기존 모델 기반 출시 gate는 별도 출시 작업에 남긴다.

초기 검증기의 과거 corpus/최신 문구 혼용과 Windows의 모의 macOS 경로 처리 오류를 수정했다.
기존 회귀와 인수를 한 job에 묶어 발생한 Intel 시간 제한은 독립 인수 matrix로 해결했다.
제품 코드에는 추가 변경이 없다. 최초 실패·취소와 최종 성공을 보고서에서 구분한다.

후속 dev `1298603`의 다른 세션이 남긴 선행 비교 기록을 병합·보존했다. 이후 결과 문서만
바뀌었으므로 기존 증거의 tested source를 문서 commit으로 바꾸지 않는다.

### Completion or Closure Notes

최종 head `d5c67141c580f825cb4ce12e4aa0ce871a41cfd8`의
[check 941](https://github.com/Sangeok/stagekeeper/actions/runs/44051075589)와
[공유 배포 인수 4](https://github.com/Sangeok/stagekeeper/actions/runs/44051075608)도 모두 성공했다.
[PR #363](https://github.com/Sangeok/stagekeeper/pull/363)을
`99378292893a2f0dd75aa5473ef5f92d406f57fe`로 dev에 병합했고, 상위 SDD와 이 문서를
completed로 옮겼다. 원래 4c5ccd6·909a83d의 시험·정제 summary는 원래 identity로 유지한다.

기존 ACCEPT 작업의 결과가 dev에 보존됐고 미보존 파일·ignored 파일·외부 링크·열린 파일 사용이
없음을 확인했다. 관리 task `8677b8a2-79c8-439b-bd1e-8d526e96df7b`를 정상 finish해 해당
worktree와 로컬 작업 브랜치를 정리했다. 개발·인수 종료이며 운영 배포를 뜻하지 않는다.
