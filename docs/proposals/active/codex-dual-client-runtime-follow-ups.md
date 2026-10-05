---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-10-04"
approved-by: "requesting-user"
approved-at: "2026-10-04"
approval-scope: "사용자의 진행 지시와 최소 설치 요구에 따라 선택한 native 클라이언트의 기존 인증으로 연결하는 Windows 실행·의존성 패키징을 우선 해결하고, 기본 실행·재개·중지 인수 후 C4 자동 watch와 장시간·취소·중복 실행을 검증한다. WSL 및 다른 CLI 설치·추가 로그인은 사용자 진행 조건에서 제외한다. 로컬 disposable/test 환경의 bounded 시험은 허용하며 운영 DB seed·서비스 배포·패키지 공개는 별도 실행 범위다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-10-04-codex-dual-client-support.md"
  - "docs/test-reports/active/dual-client-runtime-report.md"
  - "docs/test-reports/completed/2026-10-04-codex-dual-client-ui.md"
  - "docs/architecture/README.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/verification.md"
---

# Codex dual-client 실행·배포 인수와 조건부 자동 watch 후속 작업

## Summary

2026-10-04 사용자는 기본 dual-client 제안서를 코드 구현 기준으로 완료 처리하도록 지시했다.
[완료 기록](../completed/2026-10-04-codex-dual-client-support.md)의 실제 모델/CLI·설치·private 배포/복구·혼합 호스트 인수와 미구현 C4를 이 문서로 이관한다.
이관은 인수 통과나 새 실행·배포 승인을 뜻하지 않는다. 현재 실행 판정은 [active runtime 보고서](../../test-reports/active/dual-client-runtime-report.md)에 보존한다.

같은 날 사용자는 WSL과 추가 설치를 최소화하라고 지시했다. 이에 따라 WSL을 사용자
지원 경로로 삼는 진행을 중단하고 native Windows 실행·의존성 패키징을 C4보다 먼저
해결한다. 개발용 WSL 통과 기록은 보존하지만 이 새 출시 기준의 PASS로 사용하지 않는다.

## Goal

선택한 native 클라이언트의 기존 로그인 → Stagekeeper 플러그인 설치 → 프로젝트 연결로
사용할 수 있게 한다. 기본 지원의 소스 구현 완료와 실제 실행·배포 완료를 각각 추적하고,
미구현 Codex 자동 watch의 요구사항을 보존한다.

## Proposal Size

`standard`: 실제 권한·owner credential·실행 소유권·private DB 배포/복구 및 장시간 watch 시험을 다룬다.

## Current State

- C1–C3 public 소스는 PR #104, 후속 UI는 PR #106으로 dev 통합됐다. 기존 격리 DB 계약 6개와 UI 브라우저 시험은 PASS다.
- T53–T56의 기존 NOT RUN 행은 당시 기록으로 유지한다. 2026-10-04 초기 제품 어댑터의 실제 모델 시험에서 MCP 승인 설정 결함을 수정했다. 당시 built-in Windows sandbox의 root-read 요구로 허용 읽기/scratch가 BLOCKED였다. 후속 native backend의 범위별 판정은 아래와 보고서의 새 행으로 구분한다.
- `plugin/templates` 별도 private 저장소에는 수정 7개와 신규 `en/CODEX.runbook.md`가 미커밋 상태다. 운영 seed·배포는 수행하지 않았다.
- 실제 PM 모델의 pending MCP 요청에서 stop → interrupt → interrupted → bridge/child 종료 → release를 확인했다. 종료 전 release와 동시 Claude session 시작은 거부됐다. fixture MCP를 사용했으므로 실제 두 CLI/browser 승인 재개나 혼합 버전 호스트 인수의 완료 근거가 아니다.
- 후속 진행 지시로 WSL2 Ubuntu 26.04.1과 별도 Linux 사용자/checkout을 준비했다. CLI 0.160.0에 native ChatGPT 로그인을 완료했고 Windows 인증 파일은 복사하지 않았다. 실제 모델 시험에서 PATH 제거로 읽기 명령이 실패하고, owner `.codex` 안의 스킬은 목록에 나타나도 읽지 못하는 결함을 발견했다. 고정 시스템 PATH와 checksum을 검증한 완전한 스킬의 읽기 전용 scratch 복사본으로 수정했다. root deny·인증 디렉터리 차단·network/approval 정책은 유지했다.
- 수정 후 bounded 실제 역할의 읽기/scratch 쓰기, 실제 private working-source verifier의 네 검증 경로, 모델 없는 staged skill·외부 경로·저장소/Git 권한 경계가 통과했다. verifier는 시험 제안서의 설명 불일치 1건을 찾아냈고, 그 시험 문서만 수정한 별도 fresh 실행에서 0 defects를 반환했다. 이 결과는 현재 C4 문서나 운영 winning package를 검증한 결과가 아니다. Linux native pending turn도 종료 전 반납·중복 시작을 거부하고 interrupt/실제 종료 후 자신의 잠금을 반납했다.
- C4 자동 watch 어댑터·명령·skill은 미구현이다. Windows scoped 파일 실행·중지와 LPAC snapshot 명령 backend, Node/npm·완전한 원본 verifier를 포함하는 private Windows bundle 생성기는 구현했다. 실제 설치·전체 verifier 인수와 양방향 CLI/browser 승인 재개·혼합 호스트 인수 상태는 보고서에서 따로 추적한다. C4 구현·110분 idle 시험은 시작하지 않았다. Linux Claude 2.1.288은 개발 시험용으로 설치했고 당시 auth status는 none이었다. 추가 WSL Claude 로그인 요청을 진행 조건에서 철회했다. 준비한 격리 DB·WSL 환경은 사용자 기본 설치 요건이 아니다.
- Windows helper는 install bundle의 `bin/harness.ps1`로 bundled Node를 사용한다. verifier는 양쪽 client의 skill 경로에 완전한 원본을 포함한다. source-only checkout에는 생성 배포물이 없으며 별도 Node/스킬 수동 설치를 사용자 복구 절차로 안내하지 않는다. 잘못된 runtime이나 preflight 실패는 `codex-role-execution-unavailable`로 구분하며 재초기화·호스트 변경으로 사용자에게 해결을 맡기지 않는다.
- native 명령 후속 시험에서 실제 Windows Codex의 guarded 코드 수정→npm test/build→다음 명령의 산출물 부재 확인, 별도 원본 verifier의 네 경로·no-edit final pass 및 중지/Job 자식 종료가 통과했다. verifier는 의도적 시험 제안서 불일치를 발견했고, 올바른 fixture의 별도 fresh 실행에서는 처음부터 plan defect가 없었다. 격리 프로필의 private 패키지 설치·winning loader·전역 Node 없는 PATH에서 helper init도 통과했다. 전체 Next fixture는 33,871개·743,143,926 bytes의 snapshot에서 실제 Prisma build 명령까지 실행됐으나, ignore-scripts로 설치하지 않은 엔진의 다운로드가 network deny로 실패했다. host의 production build PASS와 이 결과는 구분한다. 실제 서비스 등록·승인 재개·배포/업데이트 인수와 C4 완료를 뜻하지 않는다.
- 2026-10-05 전체 프로젝트 빌드 후속 시험은 정상 npm ci로 엔진을 준비한 공개 source fixture에서 통과했다. 로컬 licensed font·DB URL 없는 generate·Windows 역할 전용 Webpack/SWC 별칭 위임과 readlink 호환 경로·2 worker/캐시 제외를 적용했다. 실제 33,883개·764,278,078 bytes LPAC snapshot의 전체 build exit 0, 타입 검사·15개 정적 페이지·build trace·route table·종료 acknowledgement와 원본 hash/build ID 불변을 확인했다. source/kernel 권한·network deny·120초 command/300초 snapshot 제한을 유지했다. [별도 완료 보고서](../../test-reports/completed/2026-10-05-windows-project-build.md)는 실패했던 후보도 보존한다. 이 저장소의 준비된 의존성 빌드 결과이며 최소 설치·실제 서비스 재개·배포와 C4 인수를 완료 처리하지 않는다.

## Scope

기존 제안서의 BLK-DUAL-01/02/03/05와 실제 E1–E11 미실행 인수, private 소스 전달·seed/복구·패키지 출시를 추적한다.
C4의 REQ-DUAL-018/019 watch 부분, BLK-DUAL-04, TASK-C4-01/02, E12와 E10의 watch 안내 부분도 명시적으로 이관한다.
기본 소스 구현을 다시 수행하거나 기존 로컬 PASS를 새 실행 결과로 승격하지 않는다. C4 실행은 기본 지원 인수와 별도 범위다.
현재 Windows 호환성 결함 수정과 사용자에게 별도 설치를 요구하지 않는 helper·검증
패키지 전달을 추가 범위로 삼는다. 사용자 인증을 복사하거나 역할 권한을 넓혀 설치
기준을 만족했다고 주장하지 않는다. 지원하지 못하는 호스트는 제품 결함으로 명시한다.

## Proposal

| 이관 항목 | 남은 작업 | 완료 증거 |
| --- | --- | --- |
| REQ-MIN-001/002, BLK-MIN-01, TASK-MIN-01/02 | Windows native 실행·최소 설치 패키징을 기본 인수보다 먼저 해결 | 추가 환경/CLI/Node/스킬 수동 설치 없이 실제 패키지의 허용·금지 파일 경계와 실행·중지 통과 |
| BLK-DUAL-01, T53 | 현재 fresh App Server 어댑터의 실제 역할·모델·권한·독립 문맥 확인 | 허용 읽기/scratch 성공, 금지 쓰기·owner/nested 도구 차단, 완전한 verifier와 fresh-context canary |
| BLK-DUAL-02/03, T54 | 실제 두 CLI와 브라우저에서 양방향 승인·재개 | 동일 BoardItem/PipelineRun/open AgentRun, 승인 commit·receipt·usage 보존; DB-only PASS와 별도 기록 |
| BLK-DUAL-02/03, T55 | private 소스 커밋/전달, 승인된 seed/복구와 실제 패키지 설치 | winning body/helper revision·hash, 양쪽 client 렌더·실행, atomic seed와 제한 복구의 직접 관찰 |
| BLK-DUAL-05, T56 | 혼합 버전 host의 중지·종료 확인·소유권 이전 | pending role/tool 종료 전 잠금 보존, 종료 후 자신의 release, successor 보호 |
| BLK-DUAL-04, TASK-C4-01/02, E12 | 조건부 watch 구현·장시간/취소 인수 후 안내 | 아래 C4 요구사항 및 검증 기준 충족 |

### 최소 설치 요구사항과 선행 blocker

**REQ-MIN-001:** 웹 사용에는 로컬 CLI를 요구하지 않는다. 저장소 실행은 사용자가
선택한 Claude Code 또는 Codex의 기존 native 설치·로그인을 사용한다. WSL·VM·컨테이너·
별도 Linux checkout, 선택하지 않은 CLI의 설치·로그인을 기본 연결이나 복구 조건으로
요구하지 않는다. 양방향 인수는 개발자의 시험 책임이며 모든 사용자에게 두 CLI를
설치하라는 요구로 변환하지 않는다.

**REQ-MIN-002:** helper 실행 환경과 완전한 검증 스킬은 Stagekeeper 패키징 책임이다.
별도 Node·외부 스킬 수동 설치와 사용자 인증 복사를 요구하지 않는다. 실제 클라이언트의
지원 기능 또는 검증된 배포물로 해결하며 임의 다운로드나 원본 없는 대체 스킬을 만들지
않는다. 전달 revision/hash·완전성·winning loader·충돌/업데이트 경계를 직접 검증한다.

**BLK-MIN-01:** Windows scoped 파일 MCP와 별도 LPAC snapshot 명령 backend 및 Windows
bundle 생성기는 구현했다. 실제 설치된 패키지의 최소 설치·완전한 verifier·현재 client
loader/업데이트 인수가 모두 통과하기 전에는 기본 제품 지원과 C4 착수를 계속 차단한다.
private 로컬 패키지의 실제 loader/init과 bounded 원본 verifier는 통과했다. Node가 전역
PATH에 없는 helper subprocess 시험이며, 후속 `0.5.2` private 패키지의 실제 양쪽 client
업데이트·전체 cache inventory·helper init·수정 generated 파일 보존과 Codex staged skill
선택도 통과했다. Node가 물리적으로 없는 clean Windows machine, released private 본문과
연결된 서비스·양방향 browser 인수나 패키지 공개 완료로 승격하지 않는다.
CLI 0.160.0의 root-read shell backend를 켜지 않는다. Linux/WSL 기록이나 파일/명령
fixture만의 성공은 blocker 전체의 해제 증거가 아니다.

#### TASK-MIN-01: Windows native 역할 실행

모델 없는 Windows native capability 시험으로 현재 정책을 유지한
실행 가능성을 확인하고 어댑터/클라이언트 호환성 해결 방안을 검증한다. repository 읽기와
scratch 쓰기, owner credential·외부 경로 읽기 및 repository/Git 쓰기 거부를 실제 파일
연산으로 확인한다. Windows에서는 scoped MCP 파일 연산으로 먼저 구현했으며, 일반
명령을 부모의 넓은 권한으로 실행하지 않는다. native shell/build/test 격리와 전체
verifier 검증은 후속 bounded Windows 시험에서 통과했다. 전체 repository의 외부 다운로드·
Git·환경 의존성 및 실제 서비스 인수는 별도로 확인한다. 불가능하면 blocker를 유지하며 WSL 설치를 권하는 복구를
제공하지 않는다.

satisfies: REQ-MIN-001

#### TASK-MIN-02: 추가 수동 설치 없는 helper·검증 패키지 전달

helper 실행 환경·완전한 검증 패키지의 출처와 전달 방식을 확정하고
설치된 Stagekeeper 패키지에서 구현·검증한다. 기존 외부 패키지 수동 설치 의존성을
제거하되 verifier 독립 문맥과 원본 계약은 보존한다. 별도 Node·외부 스킬이 없는 Windows
사용자 프로필에서 기존 선택 클라이언트 인증만으로 설치·연결·역할 실행·중지를 검증한다.

satisfies: REQ-MIN-002

2026-10-05 패키지 갱신 인수: 같은 `0.5.1`로 새 내용을 전달하면 Claude update는
`up_to_date`로 이전 cache를 유지했다. 양쪽 manifest를 `0.5.2`로 올린 뒤 실제
Claude update와 Codex 재설치의 2,209개 파일이 새 package hash와 일치했다.
전역 Node 없는 PATH의 installed helper·수정 파일/ownership 보존, duplicate verifier가
있을 때 실제 fresh thread의 원본 staged checksum 하나 선택, private ZIP 추출 hash도
통과했다. model turn은 0이며 새 전체 verifier 검토나 서비스 연결 시험은 아니다.
[범위별 완료 보고서](../../test-reports/completed/2026-10-05-windows-package-update.md)는
초기 실패와 source/runtime/package/ZIP identity를 보존한다. TASK-MIN-02 전체와
BLK-MIN-01은 물리적 clean Windows·released private bundle/service 인수 전까지 유지한다.

2026-10-05 실제 private working 본문 서비스 인수: current dev source의 fresh
production 서비스·격리 native DB에 고정한 12행 본문을 넣고, installed 0.5.2 helper로
추가 Node 없는 PATH의 양쪽 init·Codex 연결·웹 승인·제한 복구를 확인했다.
같은 dev receipt/원장/사용량을 보존한 양쪽 client 형식과 local-session 인수 및
동시 시작 거부도 통과했다. native Claude 모델 인수와는 구분한다.
실제 dev 본문은 Git diff 확인 뒤 implement blocked와 hold failed를 기록했다.
Git metadata를 제외하는 명령 snapshot과 실제 본문의 Git 확인·owner handoff
호환성을 해결하고 재현해야 하며, 이 시험은 구현 완료·active-command 중지/재개·
전체 verifier의 통과를 입증하지 않는다. 잘못 준비한 verifier/stop fixture도
[bounded FAIL 보고서](../../test-reports/completed/2026-10-05-windows-private-template-acceptance.md)에
보존한다. 다음 시험은 기록한 commit의 실제 계획 파일과 필수 verification paths,
공개 source와 일치하는 고정 private candidate를 먼저 확인한다. 이 working copy는
future QA 참조가 있고 released 본문이 아니다. BLK-MIN-01·REQ-MIN-001/002와 C4의
미완료 상태는 유지하며 다른 client 로그인·WSL 설치를 사용자 복구 조건으로 요구하지 않는다.

2026-10-04 Windows 파일 backend 진행: `role-files.mjs`의 고정 파일 연산을
역할 bridge에 연결했다. 실제 native Codex 모델이 repository 읽기·허용 workspace 수정·
신규 파일·항목 plan 생성·목록·검색을 실행했고 readonly/foreign/external/Git 경로를
거부했다. 별도 thread에서 완전한 verifier 8개 파일의 첫 줄 읽기와 전체 파일 hash를
관찰하고 원본·복사본 불변 및 staged write/원본 owner read 거부를 확인했다. 선택적
`agent_next` key:null 오거부도 실제 loader 실패로 발견해 canonical dispatch key에
바인딩하도록 수정했다. pending turn의 다른 client start 차단·중지·quiescence-required·
terminal interrupted 후 release가 통과했다. [Windows 관찰 기록](../../test-reports/assets/2026-10-04-codex-windows-role-files/observations.json)은
phase별 범위·실패·hash·관찰된 token을 보존한다. loader canary는 전체 verifier 인수가
아니며, fixture 서비스는 실제 DB 원장이나 설치된 winning template 배포를 검증하지 않는다.

2026-10-04 명령·패키징 후속 소스: 고정한 Node 22.23.3 공식 source에
[libuv의 AppContainer pipe 수정](https://github.com/libuv/libuv/pull/5181)을 backport하는
운영자 build를 추가했다. 일반 realpath/module semantics를 유지하고 role snapshot만
임시 drive letter에 매핑한다. 명령은 scoped 파일 정책으로 만든 repository/scratch
복사본에서 LPAC·network 없음·Job Object 아래 실행하며 출력/시간 상한과 전체 자식
종료 acknowledgement를 적용한다. snapshot hash·제외 경로를 결과에 남기고 모든
복사본 쓰기를 버린다. 원본 수정은 guarded 파일 도구가 담당한다.
Windows bundle 생성기는 이 runtime·원본 npm·license와 변경하지 않은 완전한 verifier를
포함한다. source-only Git checkout과 실제 설치 배포물을 구분한다. 현재 실행 결과와
native npm/model/verifier/설치 시험 범위는 [runtime 보고서](../../test-reports/active/dual-client-runtime-report.md)에
추가 기록하며 과거 pipe 실패를 PASS로 덮어쓰지 않는다. TASK-MIN-02와 전체 verifier·
설치 인수가 완료되기 전 BLK-MIN-01을 해제하지 않는다.

### 이관한 C4 요구사항과 blocker

**REQ-DUAL-018 watch 부분:** 진행 가능한 작업 발견 시 검증된 native 완료 신호 또는 로컬 runner로 실행을 재개한다. 기능 검증 전에는 명시적 재개만 안내한다.

**REQ-DUAL-019 watch/실제 취소 부분:** stop 또는 ownership 상실 후 새 dispatch·결과 제출·watch 재설정을 중단한다. 늦은 이벤트로 재진입하지 않는다. stopping 중 잠금을 유지하고 실제 자식 종료 확인 뒤 release한다.

**BLK-DUAL-04의 현재 상태:** Codex의 파일 도구 권한, watch 대상 thread/turn 재진입·취소 및 장시간 idle에 필요한 증거가 아직 부족하다. C4와 자동 watch 안내를 차단하며 기본 명시적 재개 소스의 완료를 취소하지 않는다.

2026-10-04 최초 실행: fresh thread와 pending MCP turn 취소는 직접 관찰했지만 Windows 파일 도구 실행은 차단됐다. 설치된 CLI 0.160.0의 Windows backend는 `:root` 읽기를 요구하고 현재 역할 정책은 `:root="deny"`다. [동일 버전 공식 소스](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/windows-sandbox-rs/src/resolved_permissions.rs)의 `validate_elevated_filesystem_policy`와 실제 오류가 일치한다. 당시 로컬 WSL 배포판·Docker/Podman은 없었다. 전체 디스크 읽기 허용이나 Windows 전역 설정 변경으로 대체하지 않았다.

2026-10-04 후속 실행: 사용자의 진행 지시 후 [공식 WSL 안내](https://learn.chatgpt.com/docs/windows/wsl)에 따라 WSL2 Ubuntu와 Linux 파일시스템의 별도 checkout을 준비했다. 사용자 홈에 설치된 CLI 실행 파일은 sandbox의 최소 시스템 경로 밖이라 bubblewrap에서 실행되지 않았다. 같은 hash의 CLI와 리소스를 새 Linux 배포판의 `/usr/local/lib`에 root 소유로 설치하고 `/usr/local/bin`에서 실행하자 허용 읽기/scratch와 금지 경로 시험이 통과했다. 역할 정책·커널/AppArmor 설정은 완화하지 않았다. Windows 자격 증명은 복사하지 않고 [native device 로그인](https://learn.chatgpt.com/docs/auth)을 요청했다. 이 기록은 개발 시험의 경과이며 현재 사용자 지원 경로가 아니다. C4 착수는 REQ-MIN-001/002와 기본 인수의 통과를 먼저 요구한다.

2026-10-04 로그인 후 실행: 실제 모델은 MCP를 호출했지만 `inherit="none"` 셸의 PATH가 없어 `cat` 읽기가 실패했다. 상속 PATH를 전달하지 않고 고정 시스템 도구 경로를 설정했으며 POSIX preflight에 `cat` 경로 확인을 추가했다. 실제 전체 verifier는 owner 스킬을 읽지 못해 네 경로를 NOT RUN/blocked로 올바르게 보고했다. 원본 패키지 8개 파일만 scratch에 복사하고 원본·복사본 checksum과 파일 수를 재검증해, 이 하위 경로를 읽기 전용으로 제한했다. 실제 loader의 정확한 staged 경로만 활성화한 새 모델은 baseline·정확한 계획 sketch의 scratch destination·import/export·citation/최종 reread를 실행했다. 발견한 시험 문서 결함과 수정 후 별도 0-defect 실행, kernel write 거부 및 pending stop 증거는 [WSL 역할 관찰 기록](../../test-reports/assets/2026-10-04-codex-wsl-role-acceptance/observations.json)에 보존한다. 실제 승인 재개·혼합 CLI/host와 패키지 인수는 이 bounded 통과로 대체하지 않는다.

**TASK-C4-01 실행 범위:** 실제 호스트 기능을 먼저 확인하고 Codex client/hash/echo poll transport, target thread/turn/session 고정, 동일 watch session/정책 main-loop reuse, no-model idle, permission relay, active-turn 중복 방지, interrupt와 reader/timer/listener cleanup을 구현한다. 임의 앱 대화 재진입 가정·권한 우회·자동 승인·모델 idle polling은 중단 조건이다.

**TASK-C4-02 검증 범위:** E12의 실제 thread/turn/session에서 110분 no-model idle, 작업 발견·재진입·gate 대기/승인·handoff·auth/cap/permission·stop/interrupt·늦은 이벤트·ownership 상실 후 rearm 없음과 Claude watch 회귀를 시험한다. latency·poll/model 호출 수·종료 이유를 기록한다. pending stop은 실제 종료 확인 전 잠금과 ownership을 유지해야 하며 확인 실패 시 잠금을 보존한다. E10의 watch 안내는 관찰한 호스트·버전·방식에 한정한다.

## Affected Files

| 영역 | 예정 작업 | 리스크 |
| --- | --- | --- |
| `plugin/skills/init/SKILL.md`, `plugin/skills/watch/SKILL.md`, `plugin/codex/skills/harness-init/SKILL.md`와 양쪽 helper 배포물 | 선택한 각 client의 Node/검증 패키지 수동 설치 의존성 해소·안내 | high — 사용자 설치·winning package |
| `plugin/bin/harness-codex.mjs`, `plugin/runtime/codex-thread.mjs`, 설치 배포물의 helper/검증 패키지와 init 경로 | TASK-MIN-01/02; native 실행·의존성 전달 방식 확정 후 구현, 제품 오류를 사용자 설치 요구로 변환하지 않음 | high — Windows 권한 경계·배포 출처·기존 인증 |
| `plugin/runtime/codex-thread.mjs`, `codex-agent.mjs`, `local-session.mjs`; `plugin/bin/harness-session.mjs` | 실제 인수 및 발견된 결함 수정 | high — 권한·독립 문맥·소유권 |
| `plugin/templates` 별도 private 저장소; `scripts/seed-templates.ts`, `restore-dual-client-templates.ts` | 소스 전달·승인된 배포/복구 인수 | high — 데이터·배포 조합 |
| 실제 설치한 Claude/Codex package, 기존 dual-client UI | 양방향 end-to-end 인수 | high — 승인·원장·사용량 |
| C4 후보 `plugin/runtime/codex-session.mjs`, `plugin/bin/harness-codex-watch.mjs` 및 test, `plugin/codex/skills/harness-watch/SKILL.md` | 호스트 기능 확인 후 구현 위치 확정 | high — 재진입·취소·장시간 실행 |
| active runtime 보고서와 최종 watch 보고서 | revision·직접 관찰·정리 결과 기록 | medium — 증거 범위 과장 방지 |
| `plugin/bin/harness-session.test.mjs`, `plugin/codex/skills/harness-run/SKILL.md`, `docs/architecture/protocol.md` | 실제 실행 preflight·역할 MCP 승인 정책의 회귀와 사용 지침 | high — 허용 도구 실행과 권한 경계 |
| `scripts/rehearse-dual-client-runtime.ts` 및 test | 실제 기록 추가 중 발견한 CRLF 보고서 append 오류 수정 | medium — 기존 증거 행 보존 |
| `plugin/bin/harness-watch.test.mjs` | 전체 검증에서 드러난 cold-process HTTP 연결 시간과 응답 timeout 시험의 경계 수정 | low — five-retry/cleanup 단언은 유지 |

## Safety Analysis

기존 로컬 DB·UI PASS는 보존하고 실제 미실행 gate를 별도로 유지한다. 모델 시험은 경계가 정해진 disposable/test 환경에서 수행하며 credential·사용자 설정을 복사하지 않는다. 운영 seed·배포와 C4는 승인된 범위와 호스트 기능 증거를 확인한 뒤 수행한다.

## Approval

2026-10-04 사용자의 후속 진행 지시로 기본 실행 인수 → C4 구현 → 장시간·취소·중복 실행 검증 순서를 승인했다. 기존 세션에서 이미 승인된 작업은 해당 범위에 따른다. 로컬 시험과 구현을 수행하며 운영 DB seed·서비스 배포·패키지 공개는 완료 근거로 대신하지 않는다.
이후 최소 설치 지시에 따라 native Windows 실행·패키징을 우선하며 추가 WSL/다른 CLI
로그인을 사용자 진행 조건으로 요구하지 않는다. 기존 WSL 환경과 인증의 제거는 이 변경의 범위가 아니다.

## Execution Plan

1. private working source의 상태·revision/hash와 현재 public 제품 소스를 고정한다.
2. TASK-MIN-01/02의 Windows native 실행과 추가 설치 없는 패키징을 구현·검증한다. BLK-MIN-01이 해제될 때까지 기본 지원 준비 완료를 선언하지 않는다.
3. T53/T54/T56의 실제 호스트·양방향 승인 재개·취소/소유권 시험을 개발 인수로 수행하고 결과를 누적한다. 사용자에게 두 CLI 설치·로그인을 요구하지 않는다.
4. 승인된 환경에서 T55의 설치·private seed/복구·릴리스 인수를 수행한다.
5. 별도 범위인 C4는 최소 설치·기본 실행 인수와 호스트 기능 확인 후 TASK-C4-01/02 및 E12를 수행한다.

## Verification Plan

기존 runtime 보고서의 T53–T56과 이관한 E1–E12 기준을 사용한다. report의 revision·실행 시각·직접 관찰·정리 결과를 기록하고 역사적 판정을 보존한다. `--validate-report-only` 통과는 문서 구조 검증이며 제품 PASS가 아니다. 발견된 코드 결함을 수정하면 해당 회귀와 저장소의 check·관련 test/build를 수행한다.

verifies: REQ-MIN-001, REQ-MIN-002

아래 최소 설치 인수는 계획된 검증이며 파일 canary/loader 통과로 완료 처리하지 않는다.
ID 추적 검사는 이 후속 문서와 원본 completed 제안서를 함께 입력한다. 원본에서 가져온
REQ-DUAL·BLK-DUAL 정의를 복제하거나 완료 문서를 다시 편집하지 않는다.

| 요구사항 | 작업 | 추가 인수 |
| --- | --- | --- |
| REQ-MIN-001 | TASK-MIN-01 | Windows native 실제 역할의 허용 읽기/scratch 성공·금지 경로 거부·중지/소유권 회수. WSL·다른 CLI 로그인·권한 완화가 있으면 FAIL |
| REQ-MIN-002 | TASK-MIN-02 | 별도 Node/외부 스킬이 없는 프로필의 실제 설치·연결·verifier 로드·실행·중지, 전달 hash/완전성·업데이트/충돌 확인. 기존 인증 복사나 수동 의존성 설치가 있으면 FAIL |

preflight 실패/불일치/transport 오류는 모델 시작 없이 고정된 런타임 오류로 전달되어야
하며 민감한 원본 오류를 노출하거나 재초기화/추가 설치를 해결책으로 제시하지 않는다.

## Verification Results

native 명령·bundle 후속 결과는 [새 projected evidence](../../test-reports/assets/2026-10-04-codex-windows-role-commands/observations.json)와
[검증 기록](../../test-reports/assets/2026-10-04-codex-windows-role-commands/checks.json)에 phase별
소스/package/runtime hash, 실제 model token 필드, snapshot·종료·잠금 반납을 보존한다.
Windows Server CI와 로컬 native 20개 시험이 통과했다. 초기 hidden npm 누락, trusted TEMP
표기와 compiler cleanup 실패, verifier의 pagination/shell syntax 오류, unborn Git fixture,
full-project hardlink·준비 시간 실패도 삭제하지 않았다. 기존 원본 private skill은 8개 파일의
checksum이 같으며 Git에 본문을 넣지 않았다. full verifier 모델은 자신의 이전 package
revision으로 기록하고 이후 snapshot/helper 최적화의 native 회귀와 최종 패키지 검증을
별도로 기록한다. 당시 Next fixture build의 엔진 다운로드 실패는 역사적 기록으로 유지한다.
2026-10-05 정상 의존성 준비 후 현재 저장소의 network-denied 전체 빌드는
[새 보고서](../../test-reports/completed/2026-10-05-windows-project-build.md)에서 PASS다.
전체 Windows/운영 readiness 또는 C4 완료를 선언하지 않는다. 아래는 이전 단계의 기록이다.

2026-10-05 후속 로컬 실제 서비스 시험에서는 설치된 native Codex plugin/helper와
새 loopback PostgreSQL·production Next 서비스를 연결했다. client PATH에서 전역 Node를
제외한 설치/loader/프로젝트 등록/MCP 연결·동기화, 실제 owner MCP 승인, 모델의 native
명령 실행 중 stop과 quiescence 전 release 거부, 새 세션의 동일 AgentRun 재개·완료가
통과했다. 서버 사용량은 재개 전후 1회였다. 기존 Windows 로그인만 사용했고 WSL·인증
복사·운영 쓰기는 없었다. 합성 템플릿의 이전 실패 2회와 수정 후 모델 2회를
[관찰 기록](../../test-reports/assets/2026-10-05-windows-native-service/observations.json)에
구분했다. 첫 모델 token usage는 누락되어 126,714는 나머지 3회의 보고된 합계다.
시험 서비스/DB는 종료했고 소유한 역할·세션도 정리했다. 물리적으로 새 Windows의
최소 설치, 배포된 private winning template·업데이트/충돌, 실제 browser/Claude 양방향
승인·재개와 운영/C4 gate는 이 bounded 시험으로 완료 처리하지 않는다.
single-preload의 로컬 전체 격리 빌드도 통과했으며 Windows Server의 이전 `spawn EPERM`
실패와 최종 CI는 [빌드 보고서](../../test-reports/completed/2026-10-05-windows-project-build.md)에서
별도로 추적한다.

최종 소스 `7214151`의 Windows Server [전체 격리 빌드 CI](https://github.com/Sangeok/stagekeeper/actions/runs/37287612001)와
[check CI](https://github.com/Sangeok/stagekeeper/actions/runs/37287612166)가 통과했다.
Windows 역할에만 Next의 지원되는 TypeScript compiler API 검사를 선택해 실패한 CLI
spawn 경로를 피했으며, 의도적인 타입 오류의 실제 LPAC 빌드 실패도 확인했다.
원본 source/build ID 불변·quiescence·산출물 폐기가 통과했다. 이전 Server spawn 실패와
로컬 시험 중 operator 주석 갱신으로 source 불변 검사가 실패한 기록은
[API/CI evidence](../../test-reports/assets/2026-10-05-windows-project-build/typescript-api-observations.json)에
보존한다. 이 전체 프로젝트 빌드 회귀 통과는 위의 남은 최소 설치·운영·C4 gate를
완료 처리하는 근거가 아니다.

2026-10-04 사용자 진행 지시에 따라 기본 인수를 실행했다. 최초 Windows 단계에서는 MCP 승인 결함을 수정하고 모델 없는 실제 sandbox 실행 preflight를 추가했다. Windows 실제 모델의 MCP 호출과 pending stop/잠금 반납을 확인했고 Windows 파일 명령은 BLOCKED였다. 후속 WSL2 모델 없는 실제 파일 시험에서는 허용 읽기/scratch, 금지된 외부 읽기·저장소/Git 쓰기 차단을 확인했다. 당시 별도 Linux 로그인과 실제 모델/전체 verifier는 미실행이었다. 로그인 후의 추가 관찰은 아래에 구분하고 기존 실패 이력은 보존한다.

로그인 후 단계에서는 PATH와 verifier 패키지 접근 결함을 실제 모델로 재현·수정했다. 실제 bounded 역할 및 private working-source verifier의 네 경로·실제 결함 탐지·별도 clean-fixture 최종 reread, staged package kernel 권한과 Linux native pending stop이 통과했다. actual App Server token 합계와 phase별 runtime/role/package hash, 원본 문서 불변·receipt·cleanup 범위는 [WSL 역할 관찰 기록](../../test-reports/assets/2026-10-04-codex-wsl-role-acceptance/observations.json)에 기록한다. CLI token 합계는 서버 사용량 횟수나 금액이 아니다. 당시 Windows source와 Linux 실행 runtime hash가 일치했다. 초기 PATH 실패와 skill blocked도 삭제하지 않는다.

최종 Windows session은 12 PASS/1 POSIX skip, Linux session은 13 PASS다. 전체 core/plugin은 Windows 288 PASS/1 POSIX skip, Linux 289 PASS/0 skip이며 `npm run check`와 `build`가 통과했다. 초기 전체 및 단독 watch response-timeout 시험은 50ms 안에 HTTP listener까지 도착하지 않은 요청 때문에 실패했다. 시험의 요청 제한을 200ms로 바꾸고 five-retry/cleanup 단언을 유지한 뒤 targeted/전체 시험이 통과했다. [최종 검증 기록](../../test-reports/assets/2026-10-04-codex-wsl-role-acceptance/checks.json)은 동일 source hash와 native verifier TAP 관찰 범위도 보존한다. 과거 검증 횟수는 아래에 당시 기록으로 유지한다. C4·110분 idle·실제 양방향 CLI/browser 승인·설치된 winning package·운영 배포는 완료되지 않았다. 새 관찰·사용량·소스 hash와 기존 실패 이력은 [active runtime 보고서](../../test-reports/active/dual-client-runtime-report.md)에 함께 기록한다.

로컬 검증은 session 11개, core/plugin 287개, report 27개 PASS이며 Windows 파일 symlink 권한 시험 1개는 skip이다. `npm run check`, `verify:fsd`, `test:architecture`, `build`, 보고서 구조 검증과 `git diff --check`가 통과했다. 실제 기록 추가 중 발견한 CRLF append 오류도 수정해 기존 149개 실행/증거 행을 보존했다. [현재 소스 hash와 검증 기록](../../test-reports/assets/2026-10-04-codex-role-host-preflight/checks.json)은 제품 인수 통과를 대신하지 않는다.

PR [#109](https://github.com/Sangeok/stagekeeper/pull/109)은 `dev`에 병합됐고 소스 커밋 `21a1d6eb66cd0e57f94cff87de14b485f321a21e`의 CI `check`가 통과했다. 같은 커밋의 Linux checkout에서도 session 11개와 report 28개가 모두 PASS이며 skip은 없다. [초기 WSL2 관찰 기록](../../test-reports/assets/2026-10-04-codex-wsl-host-preflight/observations.json)은 당시 모델 없는 실제 파일 명령 결과, 동일 실행 파일 hash, 완전한 verifier 패키지 inventory/checksum 및 잠금 반납을 기록한다. 패키지 inventory만으로 실제 verifier 통과를 의미하지 않으며 후속 실제 모델 기록과 구분한다.

최소 설치 지시 후, 기존 Windows CLI 0.160.0/elevated에서 수정한 실제
`dispatchFreshRole`을 모델 없이 다시 실행했다. effective policy 검사 뒤 `command/exec`가
차단됐고 새 `codex-role-execution-unavailable` 오류로 전달됐다. 시험 guard는
`thread/start`·`turn/start`를 금지했으며 해당 요청·모델 사용량·fixture MCP 호출은 없었다.
stop/child 정리 뒤 release와 실제 잠금 파일 부재를 확인했다. 추가 설치·로그인·WSL 사용·
권한 완화는 수행하지 않았다. [native 관찰 기록](../../test-reports/assets/2026-10-04-codex-native-minimum-setup/observations.json)의
판정은 BLOCKED다. 파일 쓰기가 없었다는 사실은 실행되지 않은 파일 격리 검사의 PASS가
아니며 Windows 지원·패키징·C4 완료를 의미하지 않는다.
이번 오류 분류 변경의 Windows session 12 PASS/1 POSIX skip, core/plugin 288 PASS/1 skip,
`npm run check`·`verify:fsd`·`build` 및 report 구조/문서 링크 검사가 통과했다.
[새 검증 기록](../../test-reports/assets/2026-10-04-codex-native-minimum-setup/checks.json)은
이번 runtime/helper hash를 사용한다. 이전 Linux 모델 인수의 hash·판정은 갱신하지 않는다.

## Risks and Rollback

permission 상속, private/public 버전 차이, pending host 종료·잠금 반납 및 template 데이터 복구가 주요 위험이다. 새 Codex 안내 중단 → 실제 세션 종료 확인 → 호환 private 데이터의 제한 복구 → 서버/plugin 복원 → Claude 회귀 순서를 사용한다. 구 checkout 역seed나 잠금 파일 삭제만으로 복구를 선언하지 않는다. 상세 절차는 완료 기록의 Risks and Rollback을 따른다.

## Completion or Closure Notes

현재 완료되지 않았다. 기본 실행·배포 인수는 REQ-MIN-001/002, required 미실행 gate와 관련 blocker 해제의 직접 증거가 있어야 완료 처리한다. C4 완료는 TASK-C4-01/02, E12와 실제 watch 안내 검증을 추가로 요구하며 기본 지원 인수와 각각 판정한다.

## Review Checklist

- [x] 코드 구현 완료와 실제 실행·배포 인수를 구분했다.
- [x] private 미커밋 상태와 기존 FAIL/BLOCKED/NOT RUN을 보존했다.
- [x] C4 요구사항·blocker·Task·검증과 안내 범위를 명시적으로 이관했다.
- [x] 최소 설치 기준과 native Windows/패키징의 선행 작업·출시 blocker를 반영했다.
- [ ] REQ-MIN-001/002의 실제 Windows 실행·추가 설치 없는 패키징 인수를 통과한다.
- [ ] 실제 호스트·양방향 CLI·설치/배포·혼합 버전 인수 증거를 확보한다.
- [ ] C4 실행 시 실제 장시간·취소 시험과 안내 검증을 완료한다.
