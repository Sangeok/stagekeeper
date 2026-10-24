---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-10-04"
approved-by: "requesting-user"
approved-at: "2026-10-24"
approval-scope: "2026-10-24 현재 Windows PC의 격리 C4B 실제 연결·C4C 실측을 승인했고 최소 설치·OS별 조건은 최종 출시 gate로 유지한다. 사용자의 진행 지시와 최소 설치 요구에 따라 선택한 native 클라이언트의 기존 인증으로 연결하는 Windows 실행·의존성 패키징을 우선 해결하고, 기본 실행·재개·중지 인수 후 C4 자동 watch와 장시간·취소·중복 실행을 검증한다. WSL 및 다른 CLI 설치·추가 로그인은 사용자 진행 조건에서 제외한다. 로컬 disposable/test 환경의 bounded 시험은 허용하며 운영 DB seed·서비스 배포·패키지 공개는 별도 실행 범위다."
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
  - "docs/proposals/completed/2026-10-21-runner-status-and-background-runner.md"
  - "docs/architecture/impl-verifier.md"
  - "docs/proposals/active/codex-resident-runner-plan.md"
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
Codex resident 구현과 아직 남은 OS별 실제 인수·출시 조건을 추적한다.

## Proposal Size

`standard`: 실제 권한·owner credential·실행 소유권·private DB 배포/복구 및 장시간 watch 시험을 다룬다.

## Current State

### 2026-10-24 현재 Windows의 실제 resident 연결 검증

최종 public source는 `893a24e7f1e4d5361727aa24724be3f9f8bc3503`, 격리 package는 `0.5.21`이다.
[상주 실행기 계획](./codex-resident-runner-plan.md)의 C4B 서버·DB·scoped main-loop·
CLI/skill·UI를 구현하고 실제 새 계획부터 독립 verifier·두 browser gate·구현·보고서와
다섯 최종 인수를 통과했다. native pending takeover/stop·같은 AgentRun 재개, browser
Pause/Resume, cap/auth와 양쪽 실제 설치 inventory 2,229개도 확인했다.

최종 A→Z와 같은 0.5.21 payload를 후속 단일 실행에서 실제 110분 관찰했다.
최종 확인까지 6,601초, idle HTTP heartbeat·pipeline poll 각 108회가 모두 200이었으며
모델·AgentRun·사용량 증가는 0이었다. timestamp 관찰 109회와 HTTP count를 구분한다.
hash·phase별 count·정리 결과는 [안정성 후속 보고서](../../test-reports/completed/2026-10-24-codex-runtime-stability.md)에 있다.
앞선 다른 유휴 후보와 최종 A→Z의 byte 차이는 [기존 resident 보고서](../../test-reports/completed/2026-10-24-codex-resident-live.md)의 역사적 기록으로 유지한다.
현재 PC에는 전역 Node가 있으며 PATH에서 제외한 시험을 physical clean host로 승격하지 않는다.

C4B의 현재 Windows 연결 증거는 확보했으나 전체 C4C·REQ-MIN-001/002와 공개 지원은
미완료다. 물리적 clean Windows·macOS native backend와 실제 인수·혼합 버전 실제 호스트·운영 출시가 남는다.
sign-in 시험은 guard 안에서의 임의 강제 종료를 재현해 복구 가능 종료와 abandoned guard
거부를 분리했고 20회 반복 및 전체 회귀를 통과했다. 제품의 guard 보호 정책은 유지했다.
native helper 진단과 별도 corrupt-state의 과거 간헐 실패 원인은 미확정이다.
macOS arm64/x64 공통 계약 CI는 각각 521 PASS / 18 SKIP이며 실제 resident 지원 인수가 아니다.
전체 `pending/blocked`를 유지하고 아래 기록은 당시 checkpoint로 읽는다.

### 2026-10-24 앞선 checkpoint — 시험용 native cycle

사용자는 현재 PC만 사용할 수 있음을 확인했다. 별도 clean Windows 게이트를 유지하고
현재 설치된 0.5.20 공통 runResident에 시험용 adapter를 연결해 실제 Codex의 두 정상
cycle과 세 번째 pending MCP 중단을 확인했다. 새 프로세스/문맥, 이전 canary 미관찰,
동일 local session/정책과 합성 receipt 복원, 구 generation 거부, interrupt 1회와
중단 후 재실행/제출 없음, 실제 프로세스·handler·lock 정리가 통과했다.
lease/overview/receipt는 시험용 응답이며 제품 서버 lease·역할 orchestration·110분
idle·물리적 clean Windows의 완료 근거가 아니다. [native cycle 보고서](../../test-reports/completed/2026-10-24-codex-native-cycles.md)에
범위와 증거를 기록했고 BLK-MIN-01·C4B/C4C는 유지한다.

### 2026-10-24 앞선 checkpoint — C4B 계약 준비

현재 Windows에서 가능한 후속 작업으로 [C4B 상세 계약](./codex-resident-runner-plan.md)의
client/scoped permission, legacy 기본값, 동일 session/host 소유권, 응답 binding,
migration·rollout/rollback 및 변경 파일·검증 목적지를 구체화했다. 후보 DDL은 실제
격리 PostgreSQL에서 111개 관찰 항목을 통과했고 기존 Claude 데이터를 보존했다.
구 서버의 session-only 삭제는 DB 제약으로 차단되지 않아 모든 서버 갱신 후 Codex를
활성화하도록 순서를 고정했다. [계약 리허설](../../test-reports/completed/2026-10-24-codex-resident-contract.md)은
설계 증거이며 제품 구현·clean Windows·C4B/C4C 인수는 아니다. 전체 pending/blocked를 유지한다.

### 2026-10-24 앞선 checkpoint — Windows foreground 인수

public `5ec3015d3e874c86a2bd624fd8bd336f6dc0eff5` / plugin `0.5.20`을 실제 설치해 새 계획부터
`before-plan`·`before-implement` 브라우저 승인, 독립 전체 verifier, 구현·보고서 handoff와
5개 최종 인수까지 통과했다. 아래 2026-10-23 기록에서 남았던 두 gate 재현을 이 시험으로
추가 확인했다. Windows 명령의 root `cwd: "."` 오거부와 인자 오류의 권한 거부 오표시를
수정했다. 최초 0.5.19 verifier 거부의 정확한 인자는 수집되지 않았으므로 그 실패를
dot-root 결함 하나로 단정하지 않는다. 같은 계획의 별도 0.5.19 verifier 재현은 통과했다.

양쪽 실제 0.5.19→0.5.20 설치·2,225개 파일 검증과 번들 helper 전체 흐름이 통과했다.
현재 PC에는 전역 Node가 있으며 subprocess PATH에서만 제외했다. 물리적 clean Windows의
완료 근거로 올리지 않는다. 제한된 native main-loop 보고서 commit·중단·종료 시험도
통과했지만 test-only bridge/lock fixture이며 C4 제품 연결·lease·110분 idle은 미완료다.
전체 상태는 `pending/blocked`를 유지한다. 실패·범위·hash·정리 결과는
[Windows 인수 보고서](../../test-reports/completed/2026-10-24-codex-windows-gates.md)에 있다.

### 2026-10-23 기록 — 기본 foreground·R3 통과, R4 인계와 설치/복구 직접 확인

당시 기준은 public `775772efd6163117809c33e13e070adba9a8cff7`과 private
`fb6ef955ba3f6fc8320e173fbafc9ef03b83281b`다. 공개 PR #217과 private PR #15가
병합됐고 공개 최종 PR 및 dev push의 check·Windows runtime CI가 모두 통과했다.
실제 시험 package는 plugin `0.5.19`, source `64db9e966a2adf26f47544f1b7dd833556751d17`,
2,225개 파일이며 이후 공개 변경은 보고서다. private 시험 commit
`7f34e7b0a4e6e302b8559f54ca4894ee78b8964f`와 병합된 private main의 tree는 같다.
정확한 package/runtime/verifier hash와 실패 후보는
[기본 실행 인수 보고서](../../test-reports/completed/2026-10-23-codex-private-acceptance.md)에 보존한다.

| 범위 | 현재 근거와 남은 조건 |
| --- | --- |
| 기본 Codex foreground | 기존 native Windows 로그인, Codex 0.164.0, built HTTP service·격리 DB·committed private 13행으로 새 계획 → 독립 검증 → owner 승인 → 구현 → 보고서 → 최종 인수 통과 |
| 계획·보고서 commit handoff | 같은 실행을 추가 usage와 artifact 변경 없이 재개. 실제 전체 verifier의 필수 5개 경로·0 defects, 구현 45개 테스트·최종 5개 인수 확인 |
| R1 / TASK-MIN-02 | 설치된 0.5.19의 양쪽 bundled helper로 실제 private 서비스 init·Codex 연결 및 수정 role/ownership 보존 통과. helper PATH에 전역 Node 없음; 물리적 clean Windows는 미완료 |
| R2 / T53 | 현재 실제 독립 계획 검증과 정상 완료 경로 통과. 더 넓은 권한·독립 문맥 인수 및 과거 negative 시험은 각 source의 범위대로 유지 |
| R3 / T53·T56 | 실제 npm run test:pending과 자식 실행 중 stop → 조기 release/경쟁 client 거부 → 종료 확인 → 동일 AgentRun/receipt 재개 → 검증 재실행·report handoff·5개 최종 인수 통과 |
| R4 / T54·T56 | 실제 두 CLI와 browser before-implement 승인 후 양방향 같은 open implement step 인계 통과. receipt·approval·usage 보존; 빈 outcome 원장 유지. 이 사례는 인계 후 구현/최종 인수를 수행하지 않음 |
| R5 / T55·T56 | 양쪽 실제 0.5.18→0.5.19 update와 2,225개 파일 전량 일치, 현재 private 13행의 atomic rollback/12행 제한 복구 통과. 실제 혼합 버전 host·운영 인수는 미완료 |
| C4 | C4A 공통 구조·모의 검증 완료. C4B 실제 연결과 C4C 110분·OS별 인수는 미완료 |

직접 증거와 두 R4 observer 실패/수정 이력은 [후속 인수 보고서](../../test-reports/completed/2026-10-23-codex-runtime-followups.md)에 기록했다. R3는 준비된 계획으로 시작했고 기본 fresh-plan 시험과 별도다. R4는 실제 native CLI main-loop의 MCP 호출·공통 session과 브라우저 승인 인계 범위이며 watch 전체 실행이 아니다.

2026-10-23 당시 전체 상태는 `pending/blocked`였다. 당시 기본/R3/R4 사례는 `before-implement` owner gate를
사용했다. 기본 재현의 `before-plan` gate, 물리적 clean Windows·혼합 host·운영 인수 또는
C4를 함께 통과했다고 해석하지 않는다.
private repository 병합은 운영 seed·서비스 배포·패키지 공개가 아니다.

### 2026-10-22 준비 checkpoint — 당시 실제 인수 미실행

당시 단계는 **고정 후보와 재현 절차 준비**였다. 전체 캠페인의 `pending/blocked`와
BLK-MIN-01은 유지한다. 아래 준비 결과는 과거 실패를 현재 소스에서 재현했다거나
Windows 설치·실제 모델·서비스 인수를 통과했다는 뜻이 아니다.

| 대상 | 고정 기준과 확인 결과 |
| --- | --- |
| public source | `e71684751923a3bf4ca03e127be83112cb56039f`, plugin `0.5.17`, `harness-runtime-v1` |
| source CI | [check](https://github.com/Sangeok/stagekeeper/actions/runs/39723500265), [Windows runtime](https://github.com/Sangeok/stagekeeper/actions/runs/39723500363) 모두 성공 |
| private source | `Sangeok/harness-templates`의 `71505fe3f7583fa5ffaa6b721a134d3d2a40354f`에서 필수 `en` 13행을 추출하고 각 Git blob hash를 확인 |
| private 로컬 snapshot | `a72860ca4afb4cd26872b3e2d9d4c7e2a5dbf88c`; 원격 commit 자체의 checkout이 아니라 위 13행의 별도 로컬 Git snapshot이다. seed 도구의 sourceRevision은 이 export commit을 사용하며 upstream revision도 함께 보존 |
| template source hash | `9637a9868d1c84bcbf7a349bb2978474a464d0a830ed1e42c39cdfdbea9c2864`; 현재 source validator 및 양쪽 client의 7개 역할 렌더링 통과 |
| Windows runtime | 위 Windows CI의 artifact `12401914705`; ZIP digest와 고정 build recipe·Node/npm/license·전체 inventory 검증 통과. 원격 artifact 만료는 2026-10-29이며 로컬 사본 확보 |
| verifier | 변경하지 않은 원본 8개 파일, checksum `709537e7095bc8e1e630181f9d0ea77d8e1549f786ff698d9abaf64410b8b9a0`; 양쪽 skill 경로에 동일하게 포함 |
| 설치 후보 | 2,221개 파일, package hash `ea4b925144461fe2e6d9fdf61438bda9b880495957815c67895f7a95523a0842`; ZIP 전 항목 hash 대조 통과. 실제 client 설치·loader 선택은 미실행 |
| 재현 fixture | 의존성 없는 label 함수 변경, 7개 절의 계획 후보, 선택한 verification paths, 실제 pending 명령용 60초 fixture 준비. baseline·sketch 실행 및 의도적 mutation 4개 탐지 통과 |
| 로컬 회귀 | session·background loop·role files·role Git: 70 PASS / 0 FAIL / 6 Windows 전용 SKIP |
| 실행 환경 | 준비는 macOS arm64, Codex 0.163.0·Claude 2.1.307에서 수행. Windows 실제 인수 버전은 아직 고정하지 않았고 interactive 시험 host·격리 TEST_DATABASE_URL도 미준비 |

정제한 해시·명령·시험 범위는 [준비 관찰 기록](../../test-reports/assets/2026-10-22-codex-runtime-preparation/observations.json)에
있다. private 본문·로그인 정보·설치 ZIP은 public Git에 넣지 않는다. 로컬 전달물은
저장소 밖 `stagekeeper-runtime-acceptance-2026-10-22` 디렉터리에 보관한다.

2026-10-22 기준 `/harness:watch`는 Claude 대화 세션용이며 `/harness:background`는
`claude -p "/harness:watch --once --session …"`를 호출한다. 두 경로는 서버 lease와
Pause/Resume를 사용하지만 Codex foreground는 그 보고 경로에 참여하지 않는다.
[runner 완료 기록](../completed/2026-10-21-runner-status-and-background-runner.md)의
Codex 제외 범위와 [현재 protocol](../../architecture/protocol.md)을 따른다. 같은 날 사용자는
C4의 첫 지원 범위로 **Pro/Max 상주형 우선**을 선택했다. 세션형 동시 개발은 제외하고
[상주 실행기 상세 계획](./codex-resident-runner-plan.md)에서 기존 runner 재사용,
결과 판독·취소 전략 분리, 모델 없는 준비 단계와 실제 연결 단계를 구분한다.
이 역사적 상태는 C4B 구현 결과가 아니다. 0.5.21 격리 후보는 같은 background helper에
명시적 `--client codex`와 `$harness-background`를 연결하며 기본 Claude 경로를 보존한다.

기본 재현은 **새 `slots-v1` 항목, `plan → verify → implement → accept`,
`before-plan`·`before-implement` gate**로 고정한다. 선택적 `qa`·`impl-verify`는 이
기본 사례에서 제외한다. 현재 Codex의 `impl-verifier` 거부는 의도된 제한이며,
렌더링 통과가 실행 지원을 뜻하지 않는다. 해당 노드가 이미 묶인 항목을 재사용하거나
다른 CLI 설치·로그인을 사용자 복구 조건으로 요구하지 않는다. 기존 E1–E12의 더 넓은
인수 범위는 삭제하지 않고 별도 후속 사례로 유지한다.

### 2026-10-23 C4A 구현 기록

2026-10-23 C4A 후속: [상주 실행기 상세 계획](./codex-resident-runner-plan.md)의 공통
execution 경계·모의 취소 계약·종료 미확인 lock 보존을 구현했다. 집중 49개와 전체
core/plugin 460개가 통과했고, 실제 Codex 연결·OS별 인수는 미실행이다. 기본 로컬
Turbopack 빌드의 port-binding EPERM과 Webpack 빌드 PASS를
[검사 기록](../../test-reports/assets/2026-10-23-codex-resident-c4a/checks.json)에 구분했다.
앞서 만든 0.5.17 설치 후보는 기존 고정 source의 준비물이며 이 C4A 변경을 포함하지 않는다.
BLK-MIN-01과 C4B/C4C의 실제 인수 조건은 유지한다.

### 2026-10-04~05 실행 기록

아래 버전·미커밋 상태·실패·통과는 당시 checkpoint의 기록이다. 현재 private 후보의
상태나 최신 소스의 재현 결과로 읽지 않는다.

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
| REQ-MIN-001/002, BLK-MIN-01, TASK-MIN-01/02 | Windows native 실행·최소 설치 패키징을 최종 지원·출시 전에 해결; 승인된 현재 PC 격리 C4B 개발·실측은 선행 | 추가 환경/CLI/Node/스킬 수동 설치 없이 실제 패키지의 허용·금지 파일 경계와 실행·중지 통과 |
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
loader/업데이트 인수가 모두 통과하기 전에는 기본 제품 지원과 C4의 공개 지원·출시를
계속 차단한다. 2026-10-24 사용자 승인으로 현재 PC의 격리 C4B 개발·실제 서버 연결과
연결 후 Windows 110분 시험은 먼저 진행한다. 이 순서 변경은 최종 인수 조건을 삭제하지 않는다.
2026-10-22 상주형 우선 결정에 따라 상세 계획의 C4A(공통 실행
경계와 모의 테스트)는 선행 준비로 진행할 수 있다. C4A는 실제 Codex adapter·command를
노출하지 않으며 BLK-MIN-01을 해제하지 않는다.
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

2026-10-05 Git 호환성 후속 구현: Windows non-PM 역할에 `role_git_read`의
고정 head/show/diff/status를 연결했다. 절대 경로의 허용 파일·HEAD/기록한 plan commit만
읽으며 원본 metadata·config·hooks·외부 diff와 임의 명령은 노출하지 않는다. worktree,
index의 숨김 flag, 과거 tree/symlink/gitlink, alias/stale 데이터와 실제 reader 종료도
검증했다. 최종 0.5.7의 2,210개 설치 파일·Windows host Git 시험 12개·필수 source CI 및
실제 서비스 HTTP bridge의 receipt/scope/stop 제한이 통과했다. 최종 bridge 시험은
새 모델 0회다. 별도로 실제 private dev는 0.5.6에서 Git 확인과 native 테스트를 마쳐
서버에 implement ok·verify ok를 기록했으며 report handoff로 owner commit을 기다린다.
[좁은 회귀 완료 보고서](../../test-reports/completed/2026-10-05-windows-role-git.md)는
이 버전 차이와 실패·사용량·cleanup을 보존한다. 독립 verifier는 read failed/blocked였고,
초기 실제 pending 중지의 resume은 scope 검증에 실패했다. 다음 깨끗한 항목은 테스트를
완료했지만 제어된 pending 중지를 수행하지 못했다. 새 native CI도 증거 고정 시점에
실행 중이었다. 전체 verifier·동일 항목 중지/재개·최종 accept·released 본문·물리적 clean
Windows·native Claude·C4는 여전히 미완료이며 BLK-MIN-01·REQ-MIN-001/002를 유지한다.

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

**BLK-DUAL-04의 현재 상태:** 현재 Windows의 실제 resident lease·fresh 역할·승인·최종 인수·취소/재개 및 최종 A→Z payload의 실제 110분·HTTP count 증거를 확보했다. 파일·Git/hash 입력과 늦은 terminal 실패 경계를 수정했다. macOS 공통 계약 CI도 통과했으나 resident의 Windows native backend 의존은 남아 있다. 물리적 clean Windows·macOS backend와 실제 인수·혼합 호스트·최종 출시 인수가 남아 공개 지원 gate를 유지한다. 전체 E12·REQ-DUAL-018/019 완료로 표시하지 않는다.

2026-10-04 최초 실행: fresh thread와 pending MCP turn 취소는 직접 관찰했지만 Windows 파일 도구 실행은 차단됐다. 설치된 CLI 0.160.0의 Windows backend는 `:root` 읽기를 요구하고 현재 역할 정책은 `:root="deny"`다. [동일 버전 공식 소스](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/windows-sandbox-rs/src/resolved_permissions.rs)의 `validate_elevated_filesystem_policy`와 실제 오류가 일치한다. 당시 로컬 WSL 배포판·Docker/Podman은 없었다. 전체 디스크 읽기 허용이나 Windows 전역 설정 변경으로 대체하지 않았다.

2026-10-04 후속 실행: 사용자의 진행 지시 후 [공식 WSL 안내](https://learn.chatgpt.com/docs/windows/wsl)에 따라 WSL2 Ubuntu와 Linux 파일시스템의 별도 checkout을 준비했다. 사용자 홈에 설치된 CLI 실행 파일은 sandbox의 최소 시스템 경로 밖이라 bubblewrap에서 실행되지 않았다. 같은 hash의 CLI와 리소스를 새 Linux 배포판의 `/usr/local/lib`에 root 소유로 설치하고 `/usr/local/bin`에서 실행하자 허용 읽기/scratch와 금지 경로 시험이 통과했다. 역할 정책·커널/AppArmor 설정은 완화하지 않았다. Windows 자격 증명은 복사하지 않고 [native device 로그인](https://learn.chatgpt.com/docs/auth)을 요청했다. 이 기록은 개발 시험의 경과이며 현재 사용자 지원 경로가 아니다. 당시에는 C4 착수 전에 REQ-MIN-001/002와 기본 인수를 요구했다. 2026-10-24 승인으로 현재 PC의 격리 C4B 개발·실측은 먼저 진행했고 이 조건은 최종 지원·출시 gate로 유지한다.

2026-10-04 로그인 후 실행: 실제 모델은 MCP를 호출했지만 `inherit="none"` 셸의 PATH가 없어 `cat` 읽기가 실패했다. 상속 PATH를 전달하지 않고 고정 시스템 도구 경로를 설정했으며 POSIX preflight에 `cat` 경로 확인을 추가했다. 실제 전체 verifier는 owner 스킬을 읽지 못해 네 경로를 NOT RUN/blocked로 올바르게 보고했다. 원본 패키지 8개 파일만 scratch에 복사하고 원본·복사본 checksum과 파일 수를 재검증해, 이 하위 경로를 읽기 전용으로 제한했다. 실제 loader의 정확한 staged 경로만 활성화한 새 모델은 baseline·정확한 계획 sketch의 scratch destination·import/export·citation/최종 reread를 실행했다. 발견한 시험 문서 결함과 수정 후 별도 0-defect 실행, kernel write 거부 및 pending stop 증거는 [WSL 역할 관찰 기록](../../test-reports/assets/2026-10-04-codex-wsl-role-acceptance/observations.json)에 보존한다. 실제 승인 재개·혼합 CLI/host와 패키지 인수는 이 bounded 통과로 대체하지 않는다.

**TASK-C4-01 실행 범위:** [상주 실행기 상세 계획](./codex-resident-runner-plan.md)의 C4A는 기존 runner 실행 경계와 모의 계약을 준비했다. 2026-10-24 승인된 C4B는 현재 Windows PC에서 Codex client/hash/echo poll transport, target thread/turn/session 고정, 동일 local session/정책과 cycle별 새 main-loop, no-model idle, permission 처리, active-turn 중복 방지, interrupt와 reader/timer/listener cleanup을 연결·검증한다. 물리적 clean Windows·다른 OS·혼합 host는 최종 지원·출시 조건으로 유지한다. 임의 앱 대화 재진입 가정·권한 우회·자동 승인·모델 idle polling은 중단 조건이다.

**TASK-C4-02 검증 범위:** E12의 실제 thread/turn/session에서 110분 no-model idle, 작업 발견·재진입·gate 대기/승인·handoff·auth/cap/permission·stop/interrupt·늦은 이벤트·ownership 상실 후 rearm 없음과 Claude watch 회귀를 시험한다. latency·poll/model 호출 수·종료 이유를 기록한다. pending stop은 실제 종료 확인 전 잠금과 ownership을 유지해야 하며 확인 실패 시 잠금을 보존한다. E10의 watch 안내는 관찰한 호스트·버전·방식에 한정한다.

## Affected Files

| 영역 | 예정 작업 | 리스크 |
| --- | --- | --- |
| `plugin/skills/init/SKILL.md`, `plugin/skills/watch/SKILL.md`, `plugin/codex/skills/harness-init/SKILL.md`와 양쪽 helper 배포물 | 선택한 각 client의 Node/검증 패키지 수동 설치 의존성 해소·안내 | high — 사용자 설치·winning package |
| `plugin/bin/harness-codex.mjs`, `plugin/runtime/codex-thread.mjs`, 설치 배포물의 helper/검증 패키지와 init 경로 | TASK-MIN-01/02; native 실행·의존성 전달 방식 확정 후 구현, 제품 오류를 사용자 설치 요구로 변환하지 않음 | high — Windows 권한 경계·배포 출처·기존 인증 |
| `plugin/runtime/codex-thread.mjs`, `codex-agent.mjs`, `local-session.mjs`; `plugin/bin/harness-session.mjs` | 실제 인수 및 발견된 결함 수정 | high — 권한·독립 문맥·소유권 |
| `plugin/templates` 별도 private 저장소; `scripts/templates/seed-templates.ts`, `restore-dual-client-templates.ts` | 소스 전달·승인된 배포/복구 인수 | high — 데이터·배포 조합 |
| 실제 설치한 Claude/Codex package, 기존 dual-client UI | 양방향 end-to-end 인수 | high — 승인·원장·사용량 |
| `plugin/runtime/codex-main-loop.mjs`, `codex-main-loop-tools.mjs`, `resident-commit.mjs`, `plugin/bin/harness-background.mjs`, 대응 runtime/background 시험, `plugin/codex/skills/harness-background/SKILL.md` | 확정된 resident adapter·scoped 도구·commit·수동 진입; 별도 Codex session watcher는 만들지 않음 | high — 재진입·취소·장시간 실행 |
| `prisma/migrations/20261024020000_runner_client/migration.sql`, `prisma/schema.prisma`, `src/server/runners`, `src/server/rest/runner-handler.ts`, turn-banner slice와 runner-client/session helper | client/scoped 계약·echo·호환성·표시·정식 migration; 상세 파일/검증 목록은 C4B 계획이 소유 | high — lease·이전 client·DB 보존 |
| active runtime 보고서와 최종 watch 보고서 | revision·직접 관찰·정리 결과 기록 | medium — 증거 범위 과장 방지 |
| `plugin/bin/harness-session.test.mjs`, `plugin/codex/skills/harness-run/SKILL.md`, `docs/architecture/protocol.md` | 실제 실행 preflight·역할 MCP 승인 정책의 회귀와 사용 지침 | high — 허용 도구 실행과 권한 경계 |
| `scripts/rehearsals/rehearse-dual-client-runtime.ts` 및 test | 실제 기록 추가 중 발견한 CRLF 보고서 append 오류 수정 | medium — 기존 증거 행 보존 |
| `plugin/bin/harness-watch.test.mjs` | 전체 검증에서 드러난 cold-process HTTP 연결 시간과 응답 timeout 시험의 경계 수정 | low — five-retry/cleanup 단언은 유지 |

## Safety Analysis

기존 로컬 DB·UI PASS는 보존하고 실제 미실행 gate를 별도로 유지한다. 모델 시험은 경계가 정해진 disposable/test 환경에서 수행하며 credential·사용자 설정을 복사하지 않는다. 운영 seed·배포와 C4는 승인된 범위와 호스트 기능 증거를 확인한 뒤 수행한다.

## Approval

2026-10-24 추가 결정: 사용자는 현재 Windows PC에서 가능한 C4B 구현·실제 연결과
110분 유휴 시험을 진행하도록 승인했다. 최소 설치·OS별 인수는 개발 착수와 분리한
최종 지원·출시 gate이며, 다음 과거 승인 기록의 C4A 제한을 이번 격리 개발에 적용하지 않는다.
운영 seed·서비스 릴리스·패키지 공개·main 승격은 이 승인에 포함하지 않는다.

2026-10-22 추가 결정: 사용자는 기존 runner 재사용과 최소 Codex 연결을 구체화하도록
지시하고, 첫 지원 범위를 Pro/Max 상주형으로 선택했다. 실제 인수 전 진행할 범위는
상세 계획 C4A의 공통 경계·모의 테스트 준비로 제한한다. C4B/C4C의 실제 연결·지원
활성화는 기존 인수와 호스트·권한 계약 조건을 유지한다.

2026-10-22 사용자는 최신 기준으로 계획을 정리하고, 소스·private 템플릿 버전 고정,
설치 후보와 실패 재현 시나리오를 준비하도록 지시했다. 이 준비 단계는 모델 호출·
서비스/DB 실행·실제 client 설치를 수행하지 않는다. 아래 기존 로컬 인수 승인 범위는
유지하되 실행 환경과 해당 선행 조건이 충족되어야 한다. 운영 seed·서비스 배포·
패키지 공개를 이번 준비에 포함하지 않는다.

2026-10-04 사용자의 후속 진행 지시로 기본 실행 인수 → C4 구현 → 장시간·취소·중복 실행 검증 순서를 승인했다. 기존 세션에서 이미 승인된 작업은 해당 범위에 따른다. 로컬 시험과 구현을 수행하며 운영 DB seed·서비스 배포·패키지 공개는 완료 근거로 대신하지 않는다.
이후 최소 설치 지시에 따라 native Windows 실행·패키징을 우선하며 추가 WSL/다른 CLI
로그인을 사용자 진행 조건으로 요구하지 않는다. 기존 WSL 환경과 인증의 제거는 이 변경의 범위가 아니다.

## Execution Plan

1. **현재 후보 유지:** [실제 resident 보고서](../../test-reports/completed/2026-10-24-codex-resident-live.md)의 최종 public/private/runtime/verifier와 0.5.21 후보 identity를 사용한다. 미공개 중간 후보는 별도 catalog/profile/hash로 구분하고 0.5.20 및 각 이전 결과를 해당 source의 기록으로 보존한다. 공개된 같은 버전의 body를 덮어쓰지 않는다.
2. **시험 환경:** 실제 Windows host·기존 인증·client와 새 격리 DB/서비스가 확보돼 기본 foreground 인수를 통과했다. 후속 사례마다 새 fixture·고정 source를 사용하며 물리적으로 Node가 없는 Windows 최소 설치는 별도 검증한다.
3. **실행 인수:** 현재 private 버전의 R3 같은 항목 중지/재개/최종 인수와 R4 양방향 CLI/browser 인계는 명시한 범위에서 통과했다. 2026-10-24 기본 재현은 두 browser gate와 전체 pipeline을 통과했다. 물리적 clean Windows 및 실제 혼합 버전 host에서 남은 조건을 확인한다. 실패는 product·fixture·operator 원인을 구분하고 제품 수정 시 필수 check·architecture·관련 test/build와 같은 사례를 다시 실행한다.
4. **설치/복구:** 현재 0.5.21의 양쪽 실제 loader·2,229개 inventory와 버전 갱신을 통과했다. 기존 bundled helper 흐름의 직접 증거도 유지한다. 수정 파일 보존과 실제 private atomic seed/제한 복구는 앞선 0.5.19 시험의 직접 증거를 유지한다. 다음은 물리적 clean Windows 최소 설치와 실제 혼합 host 인수다. 운영 릴리스는 별도 범위이며 BLK-MIN-01을 해제하기 전 기본 지원 준비 완료를 선언하지 않는다.
5. **C4:** C4A와 현재 Windows C4B 구현·실제 연결 검증을 완료했다. C4C는 실제 A→Z·lifecycle·같은 최종 payload의 110분·HTTP count를 확보했다. macOS 공통 계약 CI는 후속 회귀 목적지다. 다음은 물리적 clean Windows, [resident 계획의 macOS backend 경계](./codex-resident-runner-plan.md#macos-native-실행의-남은-경계) 구현·실제 인수, 혼합 host와 고정 출시 후보의 OS별 인수이며 공개 지원 gate를 유지한다.

### 실제 Windows 인수의 시작 조건

- 담당 Windows host·기존 native client 로그인과 실제 CLI 버전·실행 파일 hash를 기록한다. 현재 macOS의 CLI 버전은 Windows 증거가 아니다.
- 공개·private·package는 최신 실제 resident 보고서의 직접 시험 commit/hash 및 명시된 검사 재사용 범위와 일치시킨다. 10월 22일의 export commit·0.5.17 inventory를 현재 후보와 혼용하지 않는다. 변경이 있으면 새 후보 identity와 변경 범위를 먼저 기록한다.
- formal integration DB는 `stagekeeper_test_*`이며 `scripts/test-server-integration.mjs`의 `validateTestDatabase`를 통과해야 한다. C4B 실제 모델 서비스는 별도 신규 cluster의 `stagekeeper_resident_live`를 사용했고 loopback·고정 port·정확한 DB 이름·초기 user/template 0건을 확인했다. 이 별도 guard를 test DB 이름 validator 통과로 표현하지 않는다. 두 경로 모두 운영 DB와 분리하며 production 환경 파일을 복사하지 않는다.
- `seed-templates.ts`의 `--snapshot`은 저장소 밖 private 경로에 쓴다. 제한 복구 시험은 기존 non-Codex 12행을 먼저 둔 legacy baseline에서 시작한다. 빈 DB에 전체 13행을 최초 생성한 snapshot은 `restoreTemplates`가 non-Codex 삭제를 거부하므로 그 상태를 제한 복구 PASS로 사용하지 않는다.
- 승인된 시험 서비스의 실제 project identity로 fixture의 `harness.json`을 맞춘다. 원본 fixture는 보존하고 사례별 복사본을 쓴다. 서버 등록·양쪽 init 후 생긴 관리 파일과 초기 fixture를 먼저 owner가 commit한다.
- 새 계획 A→Z에서는 planner가 실제 key의 계획을 작성하고 main-loop가 현재 파일을 commit한다. 준비된 계획을 쓰는 R3 재현은 그 별도 범위를 명시한다. 선택한 verification paths와 실제 planPath/planCommit을 대조하며 예시 파일명이나 임의 commit을 receipt 대신 사용하지 않는다.

### 준비한 재현 순서와 판정

아래 표는 인수 조건이다. 실행 상태는 위 2026-10-24 최신 현황과 각 시험 보고서를 따른다.
R3는 같은 항목의 최종 인수까지, R4는 표에 정의한 승인·open-run 인계까지 직접 확인했다. R1/R5의 로컬 설치·업데이트·제한 복구 증거도 추가했다. 물리적 clean Windows, 혼합 버전 host·다른 OS와 운영 출시 조건은 미완료다. 현재 Windows의 C4B 및 C4C 실측 범위는 최신 resident 보고서를 따른다.

| 사례 | 대상 | 실행과 기대 관찰 | 중단 조건 |
| --- | --- | --- | --- |
| R1 설치/연결 | TASK-MIN-02, T55 | 선택 client의 격리 설치 경로와 실제 loader에서 현재 후보 inventory 및 verifier checksum 대조; bundled `harness.ps1`로 init/연결. PATH에 전역 Node가 없는 경우와 물리적 clean Windows를 구분 | 다른 cache 선택, 추가 Node/skill/CLI 요구, 인증 복사, hash 불일치 |
| R2 독립 계획 검증 | T53, REQ-MIN-001/002 | 새 항목에서 고정 planCommit과 `verifier-briefing.json`을 전달. baseline, 정확한 sketch 실행, before/after, 의존성 열거, mutation, citation/final reread를 실제 fresh role로 관찰. 허용 읽기/scratch와 금지 경로·owner 도구 거부도 확인 | read failed/blocked를 성공으로 제출, 필수 path 생략, 원본 변경·권한 확대 |
| R3 동일 항목 중지/재개 | T53/T56, REQ-MIN-001 | 실제 `role_command_exec`의 `npm run test:pending` 요청과 그 소유 자식이 실행 중임을 확인한 뒤 stop. 종료 전 release·다른 client 시작 거부 → 자식 종료 acknowledgement → 자신의 release → fresh session의 같은 항목/AgentRun/receipt 재개 → verify·report·owner commit·최종 accept까지 관찰 | preflight를 중지하고 실제 명령 시험으로 기록, scope 밖 관리 파일 변경을 숨김, 별도 성공 항목으로 대체, 잠금 파일 수동 삭제 |
| R4 양방향 승인·재개 | T54/T56 | Claude→Codex와 Codex→Claude를 별도 fresh 사례로 실행. 실제 browser gate 승인 뒤 동일 BoardItem/PipelineRun/open AgentRun·approval commit·receipt·원장·usage 보존 확인. 기존 DB contract 6개와 실제 CLI/browser 결과는 구분 | source client의 역할·자식이 남았는데 인계, run 재생성, 재개만으로 usage 증가, 자동 gate 승인 |
| R5 설치 갱신·복구·혼합 host | T55/T56 | 이전/현재 설치본과 실제 loader를 기록하고 고정 bundle로 갱신한 후 수정 generated 파일 보존 확인. legacy baseline의 seed rollback/제한 restore와 mixed-host pending 소유권 보호 관찰 | 같은 version의 다른 body를 새 설치 성공으로 판정, non-Codex 삭제로 restore 우회, successor 잠금 반납 |

R2에서 의도적인 검증 결함을 시험하려면 별도 fresh 계획의 `app/label.mjs:2` 설명만
현재 구현과 다르게 바꾼다. 독립 verifier가 그 결함을 잡은 기록을 보존하고, 수정한
정상 계획은 다른 fresh 실행으로 확인한다. 본래 정상 fixture와 실패 후보를 덮어쓰지 않는다.

R3의 60초 대기 명령은 기존 120초 command 제한 안에 있으며 baseline `npm test`와
별도로 실행한다. 실제 active-command가 확인되지 않으면 중지 시점을 다시 준비한다.
중지 후 owner/generated 파일이 바뀌었다면 old scope 실패를 재현한 것인지 먼저 기록하고,
승인된 artifact/receipt의 일치를 복원한 뒤 같은 항목에서 재시도한다.

다음 명령은 **설치·서비스 준비 후 Windows 운영자가 사용하는 형태**다. 변숫값은
실제 설치 경로·시험 checkout·서버 응답으로 채운다. 이 명령 형태를 마련한 2026-10-22에는
실행하지 않았으며 이후 실제 실행 결과는 각 source의 인수 보고서에 기록한다.

```powershell
& "$pluginRoot\bin\harness.ps1" codex prepare --root $testCheckout --server $testServer --commit no --propose no
& "$pluginRoot\bin\harness.ps1" codex next --root $testCheckout --server $testServer --session $session --key $itemKey
& "$pluginRoot\bin\harness.ps1" codex dispatch --root $testCheckout --server $testServer --session $session --key $itemKey --briefing "$kitRoot\verifier-briefing.json"
& "$pluginRoot\bin\harness.ps1" codex stop --root $testCheckout --session $session
& "$pluginRoot\bin\harness.ps1" codex release --root $testCheckout --session $session
```

`dispatch --briefing`은 현재 next가 `plan-verifier`일 때 사용한다. dev dispatch에는
briefing을 붙이지 않는다. stop과 release는 같은 세션의 소유권·실제 종료를 관찰하며
각각 실행한다. report/plan handoff는 owner가 실제 파일을 commit한 뒤 helper의
`--handoff-commit`과 fresh next binding으로 이어 간다. 시험용 commit:no 정책을
우회하여 역할이 Git commit을 실행하게 하지 않는다.

사례별 기록은 source/package/client/host identity, actual command·thread/turn/role
identity, 승인 commit·receipt·usage 전후, 종료 acknowledgement·lock 상태, verifier
path별 결과, cleanup을 포함한다. public 기록에는 원문 transcript·template body·
credential·실제 account/session 식별자를 제외한 projection만 남긴다. 미확인 종료나
restoration 실패는 해당 사례를 blocked/failed로 남기고 소유권을 보존한다.

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

2026-10-24 추가 진단·호환성 결과는 [이식성 후속 보고서](../../test-reports/completed/2026-10-24-codex-runtime-portability.md)가 소유한다.
0.5.22는 고정 필드의 native helper/state 진단과 원문 비노출·ownership 보존 fault 시험을 추가했다.
실제 Codex·Claude 격리 설치의 0.5.21 → 0.5.22 업데이트와 전체 2,231개 inventory,
동일 Windows PC의 양방향 session 인계·Claude idle resident 중지를 통과했다. 실제 혼합
호스트나 새 payload의 모델 A→Z·110분 인수로 확대하지 않는다. 과거 native/state 원인은 미확정이다.
후속 Windows CI의 resident stop 오류 1건도 원인 미확정이며, 거부 응답·정제 진단 보강과
bundled Node 20회 PASS를 구분해 보고서에 보존했다.

macOS arm64/x64 native probe는 합성 파일·TCP loopback·자식 권한 상속을 검사했고,
detached 자식이 부모 프로세스 그룹 종료 후에도 생존함을 확인했다. 따라서 다음 구현은
그룹을 이탈한 자식까지 포괄하는 소유권 추적·종료 acknowledgement를 먼저 설계하고,
명령/Git/runtime 패키징과 실제 기존 인증 인수를 연결하는 것이다. 현재 제품의 macOS backend는
활성화하지 않는다. 관련 경계는 [resident 계획](./codex-resident-runner-plan.md#macos-native-실행의-남은-경계)에 기록한다.

2026-10-24 안정성 후속 결과는 [후속 보고서](../../test-reports/completed/2026-10-24-codex-runtime-stability.md)가 소유한다.
최종 payload의 실제 110분·HTTP count·정리, sign-in crash 경계 분리와 20회 반복,
core/plugin 537 PASS / 2 SKIP, macOS arm64/x64 각 521 PASS / 18 SKIP 및 Windows native CI를 확인했다.
제품 payload는 바꾸지 않았으며 macOS backend/실제 인수와 미확정 native 진단을 별도로 남겼다.

앞선 2026-10-24 실제 resident 결과는 [실제 resident 보고서](../../test-reports/completed/2026-10-24-codex-resident-live.md)가 소유한다. 정식 migration·REST/DB,
최종 fresh A→Z·독립 verifier·native lifecycle, UI production snapshot·설치와 실제
공통 poller 유휴를 구분해 기록했다. 최종 회귀는 536 PASS / 2 SKIP이며 실패·중단한
후보, source별 재사용 범위와 미확정 진단 원인을 보존했다. 아래 결과는 역사적 checkpoint다.

2026-10-22 준비 검증: 고정 private 13행의 원본 blob·구조·양쪽 역할 렌더링,
Windows runtime의 공식 artifact digest·build recipe·전체 inventory, 원본 verifier
8개 파일과 설치 후보 2,221개 파일의 ZIP 대조를 통과했다. 재현 fixture의 baseline과
정확한 sketch는 실행 성공, 의도적인 mutation 4개는 모두 탐지했다. 공개 source 회귀는
70 PASS / 0 FAIL / 6 Windows 전용 SKIP다. raw private source는 저장소 밖 Git bundle로
보존했다. [준비 관찰 기록](../../test-reports/assets/2026-10-22-codex-runtime-preparation/observations.json)은
아직 실행하지 않은 실제 client 설치·서비스·모델·Windows 최소 설치와 R1–R5를 구분한다.
아래는 2026-10-04~05의 역사적 실행 결과다.

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
- [x] 2026-10-22 source/private/runtime/verifier 후보를 고정하고 최신 runner·Codex 제한, 설치 준비물, R1–R5 재현 순서와 시작 조건을 기록했다.
- [x] 현재 private R3 active-command 중지·같은 run 재개·최종 인수를 통과하고 R4 양방향 browser/CLI 인계의 범위를 기록했다.
- [x] 0.5.20 설치본의 새 계획·두 browser gate·독립 verifier·구현·보고서·최종 인수를 현재 Windows PC에서 통과했다.
- [x] 현재 설치본의 bundled helper·버전 갱신·전체 inventory·수정 파일 보존과 private 제한 복구의 로컬 직접 증거를 추가했다.
- [x] 최종 A→Z payload의 단일 110분 유휴·실제 HTTP count·모델/usage 0·정리를 확인했다.
- [x] sign-in 복구 시험 경계를 분리하고 macOS 양쪽 공통 계약 CI를 추가했다.
- [x] 정제된 native/state 진단과 0.5.21/0.5.22 실제 설치·동일 PC 양방향 인계 증거를 추가했다.
- [x] macOS 양쪽 kernel에서 권한 상속을 시험하고 process-group 종료가 충분하지 않은 반례를 확인했다.
- [ ] REQ-MIN-001/002의 물리적 clean Windows 실행·추가 설치 없는 패키징 인수를 완료한다.
- [ ] 실제 호스트·양방향 CLI·설치/배포·혼합 버전 인수 증거를 확보한다.
- [ ] macOS native backend를 구현하고 OS별 C4 실제 장시간·취소 인수와 출시 안내 검증을 완료한다.
