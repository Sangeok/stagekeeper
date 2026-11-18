---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-17"
approved-by: "user"
approved-at: "2026-11-18"
approval-scope: "조건부 방향과 QUALIFY에 이어, 사용자 요청으로 REPLACE 소스·시험·CI·규칙 교체 및 검증을 승인. Windows 자동 삭제, 실제 사용자 원장 이관·삭제, PR 병합·main 승격·ADOPT 제외."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "AGENTS.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/ADR/0004-organize-repository-scripts.md"
  - "docs/proposals/active/task-worktree-lifecycle.md"
  - "docs/proposals/completed/2026-11-12-local-branch-cleanup.md"
  - "docs/proposals/active/pr-worktree-closeout-phase-qualify.md"
  - "docs/test-reports/active/pr-worktree-qualify.md"
  - "docs/proposals/completed/2026-11-18-pr-worktree-closeout-phase-replace.md"
  - "docs/proposals/active/pr-worktree-closeout-phase-adopt.md"
  - "docs/test-reports/completed/2026-11-18-pr-worktree-replace.md"
---

# PR 병합과 worktree 정리의 통합 완료 흐름

## Summary

병렬 작업의 dev PR 병합과 로컬 worktree 정리 결과를 하나의 완료 흐름에서 관리한다.
OpenClaw의 병합 요청·실제 결과 확인·자기 worktree 제거·자기 branch 제거 순서를
Node ESM으로 이식한다. 자동 정리는 사용 관측이 검증된 profile에서만 수행한다.

Windows 후보 검증에서 접근 거부와 cwd 누락 반례가 확인됐다. 개정안은
**병합 가능 여부와 자동 삭제 가능 여부를 분리**한다. 종료 인계와 정확한 HEAD의
병합 조건을 충족하면 dev 병합을 진행할 수 있으나, 자동 정리 자격이 없거나
관측이 busy/unknown이면 merged / cleanup-pending으로 남기고 자료·branch를 보존한다.
현재 Windows는 자동 정리 미지원 대상으로 제안한다. 모든 Windows 작업을 병합
직후 자동 삭제하겠다는 원래 목표는 이 개정안으로 충족되지 않는다.

기존 두 관리기의 전면 교체 목표는 유지한다. 현행 writer를 호출하는 영구 wrapper는
남기지 않는다. 최초 재설계는 상위 SDD 한 파일에 한정했다. 이후 승인된 QUALIFY
코드·시험·CI·증거 보완은 front matter와 child 실행 기록에 따른다. 기존 관리기·
AGENTS는 REPLACE에서 교체했고 사용자 자료는 유지한다. REPLACE 구현·fixture 검증은 완료했으며
실제 원장 활성화·GitHub 인수는 ADOPT에 남긴다.

- 작성 모드: `WHOLE_SDD` 개정.
- 위험도: `HIGH-RISK`. 원격 병합·로컬 삭제·외부 수동 제거의 인수를 구분한다.
- 설계 상태: 조건부 방향 채택, QUALIFY 구현 검증 완료. 후속 REPLACE 상세화 대기.
- 구현 준비도: 조건부 QUALIFY 구현·검증을 통과했다. REPLACE 상세 계획 작성이 가능하며 실행은 그 계획과 별도 범위 확인이 선행한다.
- 기본 범위: 단일 complete 호출의 병합 확인과 가능한 정리. 상주 감시·Windows 자동 삭제 인증은 포함하지 않는다.

## Goal

- 사용이 끝난 작업을 정확한 HEAD로 dev에 병합하고, 검증된 자동 정리 조건에서는 같은 호출로 worktree와 local branch를 제거한다.
- 사용 관측의 한계만으로 안전하게 확정할 수 있는 원격 병합까지 막지 않되, 병합 성공을 정리 완료로 표시하지 않는다.
- busy/unknown·미지원 profile·미보존 자료·identity drift에서는 로컬 자료와 branch를 보존한다.
- 수동 제거가 필요하면 사용자가 자기 작업의 사용 종료와 자료 보존을 확인하도록 인계하고, 실제 제거 결과만 별도로 인수한다.
- 기존 관리기·명령·규칙·CI·기록을 하나의 새 체계로 전환한다.

### 이번 개정의 의사결정 경계

권고안은 지원 profile의 자동 정리와 미지원 profile의 병합 후 보존을 함께 제공하는
것이다. Windows 자동 정리를 지원한다고 표시하지 않는다. 양 OS에서 같은 즉시
자동 삭제를 출시 조건으로 유지한다면 이 권고안을 채택하지 않고 BLK-PWC-01이
해소될 때까지 기존 체계를 유지해야 한다.

후속 “오케이 진행해”로 조건부 방향을 채택했다. front matter의 승인 범위 안에서
QUALIFY 문서 정합과 기존 후보 구현·검증을 계속한다. 명령 통합은 아직 확정하지
않으며 acknowledge-removal의 외부 명령 노출 여부는 REPLACE 상세 계획에서 판단한다.
그 절차의 사용자 확인·실제 부재·보존 검증 책임은 유지한다. 현행 관리기는 계속 유효하다.

## Proposal Size

`proposal-size: standard`. 기존 구현·테스트 삭제, 로컬 상태 이관, 원격 mutation, 운영체제별 파일·프로세스 검증, 5개 이상의 파일 변경과 단순 revert 이상의 복구를 포함한다. 문서 분류와 위험도는 별개다.

## Current State

### 2026-11-17 재설계 근거

- Observed: 같은 미병합 작업의 계속이다. branch는 `harness/pr-worktree-closeout-sdd-20261117`,
  source HEAD는 `ff623241cfca4f99b42d191e1331b9ed11a26fd9`다. 시작 시 working tree는 clean,
  열린 PR은 Draft #364 하나였다. 새 branch/worktree를 만들지 않는다.
- Observed: [실행 보고서](../../test-reports/active/pr-worktree-qualify.md)의 Windows PEB
  후보는 같은 계정 process 1건의 cwd 접근을 거부당했다. directory 공유 검사와
  PID 조회도 살아 있는 cwd process를 놓쳤다. [해제 후 재검사 증거](../../test-reports/assets/2026-11-17-pr-worktree-qualify/windows-directory-release.json)는
  삭제 접근 handle을 닫은 뒤에도 PID 0건인 반례를 보존한다.
- Observed: [최종 CI 44063322504](https://github.com/Sangeok/stagekeeper/actions/runs/44063322504)는
  Windows task-worktrees만 실패했고 macOS와 나머지 job은 통과했다.
  이는 macOS의 모든 계획 사례나 자동 삭제 활성화까지 인증했다는 뜻이 아니다.
- Contracted: unknown을 clear로 바꾸지 않고 보호 ref·다른 작업·미보존 자료를 보존한다.
- Inferred: 목표를 조건부 자동 정리로 정하면 Windows 관측 실패가 원격 병합 기능
  전체의 blocker일 필요는 없다. 자동 삭제의 blocker는 그대로다.
- Decision: 후속 사용자 요청으로 조건부 목표를 채택했다. BLK-PWC-04의 목표 선택은 해소됐으며 구현 범위는 front matter로 제한한다.

개정 전 parent hash는 `bf627b4304fef88b3eaa97be918bbdf6e97f118b8f92d170117630c1ab7cd3e9`다.
[기존 QUALIFY 상세 계획](./pr-worktree-closeout-phase-qualify.md)은 그 snapshot을
검증한 문서다. 이번에 그 문서의 양 OS clear/busy 필수 성공,
미지원 stub 금지와 REPLACE 진입 조건을 재정합한다. 기존 native 실패와
반례는 실행 증거로 보존한다. 이 parent 수정만으로 child를 최신 실행 계획으로
간주하거나 과거 QUALIFY를 PASS로 바꾸지 않는다.

### 개정 전후의 계약 차이

| canonical 계약 | 개정 전 | 이번 제안 |
| --- | --- | --- |
| REQ-PWC-003 | 사용 probe를 봉인·병합 전조건으로 결합 | 종료 인계·신원·자료 보존으로 봉인, native 관측은 자동 삭제 전조건 |
| REQ-PWC-005 | 양 OS 자격 확보 후 같은 호출의 전체 정리 | qualified+clear에서만 자동 정리, 나머지는 명시적 부분 성공 |
| REQ-PWC-014 / CON-PWC-006 | 양 OS native 성공을 전체 전환 선행 조건으로 요구 | profile 자격과 runtime 미지원 동작을 구분하며 양 OS 제공 경로는 필수 검증 |
| REQ-PWC-015 | 별도 정의 없음 | 미지원/unknown의 pending과 자동 삭제 0회 |
| REQ-PWC-016 / INV-PWC-006 | 자동 제거 intent의 복구만 정의 | 사용자 외부 제거의 부재 검증·기록, 이후 ref만 정리. clear로 변환하지 않음 |
| 기존 child / Windows FAIL | 원래 전체 자동 목표의 qualification | 과거 실패 유지. 목표 선택 뒤 child 재정합과 CI 책임 변경 필요 |

### 최초 작성 당시 관측 기준과 쓰기 경계

- 기준: `origin/dev` `b0855c5ab02f35dd9afaf980c09182fee245fbea`, `origin/main` `85c66fb1d9e02c3d9416710240cbfca3f0023939`.
- 원래 checkout: `harness/plugin-skill-contract-plan` / `eabd1381169a2692e9b29317c31047bbb4027c7d`. 관련 없는 변경·미추적 문서 52건을 보존했다.
- 작성 branch: `harness/pr-worktree-closeout-sdd-20261117`. 최신 dev에서 별도 관리 worktree를 생성했다. 작성 task ID는 `3163c7e4-7c68-4eb7-87b1-cf869f639b21`다.
- 시작 시 열린 PR은 #357(CI coverage parser), #359(eval 제안서 완료 기록)다. 구현 때 재조회하고 CI·verification.md의 동시 변경을 조정한다.
- 작성 종료 시 원격 dev는 `c5f4e44e7be8d83607f2c644db3d5e6ae8c2d0a9`로 진행됐다. 차이는 eval 제안서 완료 이동과 CI coverage parser·설명이며, 두 관리 구현·AGENTS·npm 명령·check workflow는 기준과 동일함을 diff로 확인했다. 문서의 구현 기준은 위 고정 SHA로 유지한다.
- 작성 작업 생성 전 원장에는 active 3건, removed 4건이 있었다. removed 중 path 재사용 진단도 있었다. 이 수치는 삭제 입력이나 사용 종료 허가가 아니다.
- 기존 status를 읽었고 retry는 처리 대상 0건이었다. 시작 branch cleanup은 원래 checkout의 dirty 상태로 모두 보존했다.
- Node ESM·npm·node:test·Git·gh를 사용한다. 기존 두 도구 시험은 Windows 2022/macOS 15의 `check/task-worktrees`에서 실행된다.
- 조사한 직접 호출은 npm 명령, 두 도구 간 import, 시험, CI, 개발 규칙이다. 제품 서버·플러그인에서 두 관리 API를 import하는 호출은 발견하지 못했다.

### 기존 구현과 변경 이유

| 위치 | Observed | 교체 시 차이 |
| --- | --- | --- |
| `manage-task-worktrees:createTask` | task UUID와 경로·branch·owner·instance 등록 | 작업 identity에 나중에 PR 연결 |
| `preservation / finishTask / finalize` | 원격 같은 branch의 HEAD 보존만으로 PR 병합 전 폴더 제거 가능 | 정상 완료는 해당 PR의 dev 병합 확인 후 제거 |
| `handoffBranch` | 폴더 제거 후 기존 branch 정리기에 한 번 위임 | 병합·정리 결과를 동일 작업에서 관리 |
| `retry` | closing 또는 removed + branch not-started만 재시도 | 원격 결과 확인과 로컬 정리 재개 분리 |
| `cleanup-task-branches` | ancestor 또는 exact-head merged PR, 열린/의존 PR·worktree 검사 | 이번 task·PR·HEAD·경로에 범위 고정 |
| `inspectLocal` | 명령 실행 checkout이 dirty면 대상과 무관하게 branch 삭제 보류 | 실행 코드 신뢰와 대상 자료 보존을 구분 |
| `AGENTS.md` | 작업 시작·종료의 전체 branch cleanup | 조회는 무변경, 완료는 해당 작업만 |
| 공통 Git의 `stagekeeper-task-worktrees` | JSON 원장·instance marker·command.guard | 명시적 이관. 과거 완료를 새 삭제 권한으로 재사용하지 않음 |

### OpenClaw reference

고정 revision은 `c7ccc5e8bc96d9ba1dc2463145ebd33338813d02`다. 실행 시 최신 upstream을 받아 쓰지 않는다.

| 원본 | 확인한 동작 | 이식 범위 |
| --- | --- | --- |
| [merge.sh](https://github.com/openclaw/openclaw/blob/c7ccc5e8bc96d9ba1dc2463145ebd33338813d02/scripts/pr-lib/merge.sh#L1392-L1449) | 병합 결과 확인 뒤 cleanup, 정리 성공 뒤 complete | 순서 채택. dev와 Stagekeeper check 정책 적용 |
| [common.sh](https://github.com/openclaw/openclaw/blob/c7ccc5e8bc96d9ba1dc2463145ebd33338813d02/scripts/pr-lib/common.sh#L633-L737) | live cwd 보존, worktree 제거 뒤 PR용 branch 삭제 | 자기 경로·강제 제거 금지·양 OS 검사로 이식 |
| [recovery](https://github.com/openclaw/openclaw/blob/c7ccc5e8bc96d9ba1dc2463145ebd33338813d02/.agents/skills/openclaw-pr-maintainer/references/landing-recovery.md#recovery-and-closeout) | 불확실한 원격 효과 복구와 정리를 구분 | recover는 관측, cleanup은 확인된 병합의 로컬 정리 |
| [scripts/pr](https://github.com/openclaw/openclaw/blob/c7ccc5e8bc96d9ba1dc2463145ebd33338813d02/scripts/pr#L1665-L1695) | main 전용, 자체 리뷰·실행 도구 의존 | dev로 조정. OpenClaw 제품·검증 플랫폼은 제외 |
| [시험 helper](https://github.com/openclaw/openclaw/blob/c7ccc5e8bc96d9ba1dc2463145ebd33338813d02/test/scripts/pr-merge-outcome.test-support.ts#L64) | 해당 병합 시험은 win32 skip | Windows/macOS 모두 필수 검증 |
| [LICENSE](https://github.com/openclaw/openclaw/blob/c7ccc5e8bc96d9ba1dc2463145ebd33338813d02/LICENSE) | MIT, 저작권·허가 고지 보존 | 복제 코드의 고지와 원본·변경점 기록 |

원본 wrapper는 Bash·Node·Python, 자체 PR·검증·실행 상태 모듈에 연결돼 있다. 몇 파일의 무수정 복사로 독립 실행할 수 있다고 가정하지 않는다. 이 제안은 완료·보존·복구 구조의 이식이며 OpenClaw 전체 제품 vendoring이 아니다.

### 계약 대조

| 경계 | Contracted / 사용자 의도 | 처리 |
| --- | --- | --- |
| 보호 ref | 로컬·원격 main/dev 삭제 금지 | 유지 |
| 통합·출시 | dev 통합, main은 검증한 dev SHA의 fast-forward 출시 | 새 명령은 dev PR만 취급 |
| 기존 도구 사용 의무 | 현행 규칙은 두 관리기를 사용 | REPLACE에서 명령·규칙·CI를 함께 변경 |
| 병합 전 종료 | 현행은 원격 보존으로 허용 | 정상 완료는 merged 후로 의도적 변경 |
| GitHub 업무 | 기존 gh PR 생성과 check 활용 | 새 리뷰·CI 플랫폼 제외 |
| 작업 시작 | PR 생성 전 병렬 작업 | task 먼저 생성, PR은 이후 연결 |
| 자료 보존 | clean만으로 종료 추정 금지 | 자동 삭제에는 owner 인계와 검증된 OS 관측을 함께 요구. 원격 병합 전조건과 분리 |

CI 판정의 의도적 변경도 구분한다. 기존 merged-pr 삭제 경로는 연결된 최신 workflow 전부의 성공을 다시 요구한다. 새 정상 완료는 해당 HEAD의 check와 서버가 요구하는 필수 검사·review를 병합 직전에 확인하고 그 결과를 병합 기록에 연결한다. 이미 검증한 병합의 정리 재개는 임의의 후속 CI 실행으로 병합 사실을 무효화하지 않는다. 이 차이는 영구 계약 전환에 포함하며, 새 규칙 승인 전에는 기존 검사기를 우회하지 않는다.

현행 계약은 [architecture README](../../architecture/README.md), [verification](../../architecture/verification.md), [AGENTS.md](../../../AGENTS.md)가 소유한다. 작성만으로 계약을 활성화하지 않는다. 문서 내용 중 Observed는 소스·명령 관측, Contracted는 영구 규칙, 새 동작·파일·명령은 Proposed다.

## Scope

포함: 개발용 worktree 생성·조회·PR 연결·병합·조건부 자동 정리·외부 수동 제거 인수·복구의 단일 CLI, 기존 두 구현·시험·명령 퇴역, PR 없는 작업의 명시적 종료, legacy 기록의 일회 전환, 양 OS의 제공 동작 검증, 개발 규칙·CI·원본 고지 갱신.

제외: 상주 daemon/webhook, 명령 종료 후 웹 병합의 자동 감시, 새 PR 생성·리뷰·CI 플랫폼, 자동 comment/review, 관리자 우회, main 승격·운영 DB·제품 파이프라인 변경, 소유권 불명 자료의 일괄 채택/삭제, 나이 기반 삭제·전역 prune, OpenClaw gateway/Crabbox/Testbox/cache 전체 복제, 임의 raw Git/외부 파일 쓰기의 OS 수준 차단.

## Behavioral Requirements

### REQ-PWC-001: 작업 생성

WHEN 소유자·새 harness branch·새 경로가 주어지면, 도구 SHALL 보호 원격과 최신 dev를 확인하고 새 worktree와 구별 가능한 task identity를 반환한다. 충돌하면 기존 자료를 변경하지 않는다.

### REQ-PWC-002: 정확한 PR 연결

WHEN 완료 명령이 task와 PR을 받으면, 도구 SHALL 저장소·dev base·head repository/branch·최종 SHA를 대조하고 일치할 때만 연결한다. PR 연결을 이유로 worktree를 이동하거나 두 번째 작업 worktree를 만들지 않는다.

### REQ-PWC-003: 사용 종료 인계

WHEN 소유자가 자기 작업의 사용 종료·자료 보존을 예상 상태·HEAD·instance에 결부해 선언하고 controller가 대상 밖에서 완료를 요청하면, 도구 SHALL 대상 신원·HEAD·파일 보존을 검증한 뒤 종료 인계를 봉인한다. 종료 선언 부재·알려진 미종료 사용자·identity 또는 보존 판단 불가는 봉인을 거부한다. native 사용 관측은 자동 삭제의 별도 조건이며 미지원/unknown만으로 확정된 HEAD의 병합을 금지하지 않는다.

### REQ-PWC-004: 병합 전 검증

WHEN 봉인된 작업의 PR이 열려 있으면, 도구 SHALL 해당 HEAD의 최신 check 성공과 적용되는 필수 검사·review·병합 조건을 확인한 뒤 정상 권한으로만 병합을 요청한다. HEAD 변경·실패·인증 오류·판단 불가이면 요청하지 않는다.

### REQ-PWC-005: 병합 후 같은 명령에서 정리

WHEN 정확한 작업 HEAD의 dev 병합, 종료 인계, 자동 정리 자격, 현재 clear와 자료·identity 조건 유지를 확인하면, 완료 명령 SHALL 같은 invocation에서 해당 worktree와 local branch를 순서대로 제거하고 실제 부재를 확인한 뒤 complete를 반환한다. 로컬 조건 미충족은 병합 사실과 분리한 cleanup-pending이며 병합 명령의 성공 exit만으로 완료하지 않는다.

### REQ-PWC-006: 자료와 다른 작업 보존

IF 대상에 dirty 자료·필요한 ignored 파일·외부 directory link·잠금·다른 사용·identity 변경이 있으면, 도구 SHALL 자료와 branch를 보존하고 이유를 반환한다. 무관한 dirty checkout을 삭제 대상으로 삼지 않는다.

### REQ-PWC-007: 불확실한 결과 복구

IF 병합 응답 유실 또는 중단이 발생하면, 도구 SHALL 저장된 요청·HEAD와 원격 결과를 대조한다. 불명확하면 재병합·삭제를 하지 않는다. 이미 병합된 작업의 정리 재개는 원격 병합 mutation을 발생시키지 않는다.

### REQ-PWC-008: 중복과 경합

WHEN 명령이 중복되거나 같은 작업/공유 Git metadata에 경합하면, 도구 SHALL 중복 병합·다른 작업 삭제를 방지하고 변경된 HEAD·instance·예상 상태를 거부한다. 완료된 동일 작업의 반복 처리는 검증된 무해한 결과를 반환한다.

### REQ-PWC-009: 상태 조회와 부분 성공

WHEN status 또는 dry-run을 요청하면, 도구 SHALL task·PR·HEAD·병합·worktree·branch 결과, 자동 정리 capability, 관측 실행 여부와 보류 이유를 구분한다. status는 network/fetch/기록 쓰기/삭제 없이 수행하며 dry-run은 원격 조회 여부를 표시하고 mutation·권한 예약을 하지 않는다.

### REQ-PWC-010: legacy 전환

WHEN 구 writer 사용 종료 후 선택한 migration plan을 적용하면, 도구 SHALL source snapshot과 실제 경로·instance·HEAD를 재검사하고 일치하는 managed 작업만 전환한다. removed 기록·경로 재사용·미등록 worktree를 새 삭제 허가로 해석하지 않는다.

### REQ-PWC-011: 단일 체계로 교체

WHEN 새 체계를 활성화하면, 저장소 SHALL 구 두 명령·생산 구현·import·CI 실행 경로를 제거하고 새 진입점을 사용한다. 기존 보호 계약은 새 시험으로 이관하고 구 writer로 새 상태를 갱신하지 않는다.

### REQ-PWC-012: PR 없는 작업 종료

WHEN 소유자가 PR 없는 조사 작업 또는 병합 없이 끝낸 작업을 명시적으로 retire하면, 도구 SHALL 사용 종료·최신 dev에 보존된 HEAD·열린/의존 PR 부재를 확인하고, 정상 완료와 같은 로컬 정리 조건 또는 확인된 외부 제거 결과를 충족한 경우에만 retired로 기록한다. 미지원/unknown이면 retirement 목적의 cleanup-pending으로 보존하고, 미보존 커밋은 유지하며 PR 생성·병합을 하지 않는다.

### REQ-PWC-013: 지연·외부 병합

WHEN 실행 중인 완료 명령이 병합 대기를 관측하면, 도구 SHALL 제한된 관측 시간 동안 실제 결과를 기다리고 만료·취소 시 pending을 반환한다. 명령 종료 후 외부 병합은 recover와 cleanup으로 처리하며 상주 명령 없이 즉시 청소된다고 표시하지 않는다.

### REQ-PWC-014: 양 OS 사용 확인

WHEN 사용 확인 모듈에 대상 worktree를 요청하면, 모듈 SHALL Windows/macOS에서 profile·관측 실행 여부·clear/busy/unknown·완전성 근거를 반환한다. 검증되지 않은 profile은 관측 미실행/unknown으로 표시할 수 있으나 성공한 native 검사로 세지 않는다. 실행 중 권한 부족·probe 실패·누락·미지원은 unknown이며 clean status나 PID 부재만으로 clear를 반환하지 않는다.

### REQ-PWC-015: 미지원과 관측 불가의 보존 인계

WHEN 병합 또는 retire 보존 조건을 충족한 작업의 worktree 제거가 아직 확정되지 않았으며 capability 미검증·busy·unknown 중 하나에 해당하면, 도구 SHALL cleanup-pending, 실제 병합/retire 목적, 이유와 다음 허용 동작을 반환하고 worktree·local branch 삭제를 호출하지 않는다. 반복 실행·owner 종료 선언·수동 확인 문구만으로 자동 삭제 자격을 올리지 않는다.

### REQ-PWC-016: 외부 수동 제거 결과 인수

WHEN 사용자가 특정 task·봉인 HEAD·instance·예상 상태에 대해 자기 worktree의 외부 수동 제거와 자료 보존 완료를 명시적으로 보고하면, 도구 SHALL 원래 path·admin entry·worktree 등록의 실제 부재와 task 보존 증거를 재검증하고 일치하는 결과만 외부 제거로 기록한다. 이 인수는 파일·branch를 삭제하지 않는다. 이후 cleanup은 부재와 branch 보호 조건을 다시 확인한 뒤 남은 local ref만 처리하며, 부분 제거·재생성·HEAD 변경·사용자 확인 부재에는 complete/retired로 승격하지 않는다.

## Invariants and Constraints

### INV-PWC-001: 보호 ref와 주 checkout

로컬·원격 main/dev와 주 checkout은 삭제·재목적화하지 않는다. symbolic ref·별칭·잘못된 refname으로 우회하지 않는다.

### INV-PWC-002: 정확한 대상

삭제 권한은 task, common Git, admin entry, instance, branch, 봉인 HEAD에 한정된다. 같은 이름의 재생성이나 다른 task에 승계되지 않는다.

### INV-PWC-003: 보존

complete는 결과가 dev에 보존되고 필요한 Git 밖 자료를 잃지 않으며 대상 path/admin/local ref의 부재가 확인된 상태다. squash/rebase는 정확한 PR head와 merge 결과 증거로 판정한다.

### INV-PWC-004: 효과 분리

원격 병합과 로컬 삭제는 하나의 transaction이 아니다. 정리 실패를 이유로 병합을 반복하거나 자동 revert하지 않는다.

### INV-PWC-005: 사용 종료 범위

owner label은 인증 수단이 아니다. 종료 선언은 다른 사용자의 종료를 대신하지 않는다. 자식 cwd 변경은 부모 세션의 cwd 해제가 아니다.

### INV-PWC-006: 선언·관측·제거 근거 분리

사용 종료 선언은 협업 주체의 인계이며 OS 관측 증거가 아니다. 외부 제거 확인은 이미
사라진 대상의 결과 인수이며 clear 증거가 아니다. unknown·미지원은 이 선언이나
수동 절차로 clear로 변환되지 않는다. complete/retired는 실제 path/admin/ref 부재와
보존 증거를 요구하며 수동 인수 여부를 숨기지 않는다.

### CON-PWC-001: 구현 경계

새 개발 도구는 scripts/pr/가 소유한다. Node ESM·Git·gh·node:test를 우선 사용하고 제품 src/server·src/fsd·packages·plugin을 관리기 내부로 import하거나 변경하지 않는다. import만으로 mutation하지 않으며 CLI 진입점에서만 효과를 시작한다.

### CON-PWC-002: 권한과 병합 정책

문서 작성·PR 연결·preview는 병합 권한이 아니다. complete는 해당 작업 병합이 승인된 실행 문맥에서 호출한다. 기존 check·서버 보호를 유지하고 --admin·보호 규칙 변경·main 승격을 하지 않는다.

### CON-PWC-003: 우회 수단 금지

자동 stash/reset/clean, worktree remove --force, branch -D, 사용자 자료 rm, 전역 prune, 강제 checkout을 정상·복구 경로에 사용하지 않는다.

### CON-PWC-004: 출처

고정 원본 revision·경로·변경 정책과 복제 코드의 MIT 고지를 보존한다. 실행 시 upstream source를 자동 교체하지 않는다.

### CON-PWC-005: 기록 범위

task/PR, SHA, phase/reason, 경로와 필요한 PID metadata만 기록한다. token·환경 변수 값·파일 내용·세션 대화·명령 전체 인자를 수집하지 않는다.

### CON-PWC-006: 검증과 활성화

Windows/macOS에서 제공하는 파일·프로세스·Git 경로를 실제 검증한 뒤 활성화한다. 자동 삭제를 제공할 profile은 native 관측 자격 검증까지 통과해야 하며, 미지원 profile은 자동 삭제 0회와 보존·인수 경로를 검증한다. 자격 실패를 시험 skip으로 성공 처리하지 않는다. 원격 대역과 실제 GitHub 인수를 구분하고 CI coverage와 workflow를 함께 변경한다.

### CON-PWC-007: 문서 작성 권한

이번 쓰기 대상은 이 SDD뿐이다. governing proposal, AGENTS, 소스·테스트·CI, 기존 사용자 worktree를 수정하지 않는다.

### CON-PWC-008: 자동 삭제 자격 우회 금지

caller flag·환경 변수·owner label로 자동 정리 capability를 켜거나 unknown을 무시할
수 없다. 권한 상승·사용자 process 종료·대상 잠금 실험·강제 Git 제거를 fallback으로
사용하지 않는다. 외부 제거 인수 명령은 존재하는 path/admin을 제거하는 분기가 없다.

## Proposal

### 책임과 control flow

~~~text
worker: create → 병렬 작업 → 기존 gh로 dev PR 생성
        → 자기 결과 보존·소유 process 종료·다른 사용자 종료 확인 → 종료 인계
controller(대상 밖):
  complete(task, PR, expected HEAD/state/instance, 종료 선언)
    → 인계·대상·파일·CI 확인 → intent 보존 → exact-head 병합·실제 결과 확인
    → merged 기록
      ├─ qualified profile + 현재 clear + 보존/identity 유지 → worktree → branch → complete
      └─ 그 밖의 로컬 조건 → cleanup-pending, path/admin/branch 유지
  unknown 원격 결과: recover → 관측 결과 기록, 재병합·삭제 없음
  cleanup-pending: 조건 회복 후 cleanup 또는 사용자 수동 제거 인계
  사용자 외부 제거 보고: acknowledge-removal → 부재·보존 검증과 기록만
  외부 제거 인수 뒤: cleanup → 부재 재확인 → 남은 branch → complete/retired
~~~

작업자가 자기 process를 종료하고 편집·공유 dependency 사용이 끝났는지 확인한다.
소유하지 않은 세션은 종료시키지 않고, 사용을 아는 경우 인계를 하지 않는다.
이 선언은 인증이나 OS 전체 사용 부재 증명이 아니다. 새 process registry,
상주 supervisor, 임의 process 강제 종료를 도입하지 않는다.

controller는 대상 밖의 유지되는 신뢰 checkout에서 실행한다. 호출한 자식의 cwd만
바꿔 부모 사용이 끝났다고 간주하지 않는다. 인계는 task·owner·expected state/OID·
HEAD·instance와 연결하고, resume·HEAD/instance 변경으로 무효화한다. 재시도는
그 인계를 다른 task나 새 HEAD에 승계하지 않는다.

봉인 전에는 caller/target 신원, HEAD, 자료 보존, 종료 선언, 알려진 사용 종료를
확인한다. native probe는 원격 병합을 승인하는 수단이 아니며 자동 삭제 직전에
수행한다. 종료 선언을 할 수 없거나 파일·신원이 불명확하면 병합도 시작하지 않는다.
병합 뒤 새 자료나 사용이 발견되면 병합은 유지하고 로컬 정리만 보류한다.

PR 생성·review·CI dispatch는 기존 GitHub 기능을 사용한다. PR 번호는 complete 때
확정하며 inspect는 연결 예정 관계만 검증한다. 시작 시 PR 생성은 강제하지 않는다.

### 제안 소스 배치

process-usage와 UPSTREAM 및 후보 시험은 QUALIFY에서 이미 생성됐다. 나머지는 아직 없는 새 경로 제안이다.

| 경로 | 소유 책임 |
| --- | --- |
| `scripts/pr/index.mjs` | CLI·출력·완료 흐름 진입점 |
| `scripts/pr/task-state.mjs` | identity·상태·원격 intent/결과·예상 상태 갱신 |
| `scripts/pr/git-workspace.mjs` | 생성·경로/파일 검사·worktree/ref 제거 |
| `scripts/pr/github-merge.mjs` | PR/CI 조회·exact-head 요청·원격 결과 대조 |
| `scripts/pr/process-usage.mjs` | profile/capability와 OS 관측. 종료 인계는 task-state/controller 소유 |
| `scripts/pr/legacy-migration.mjs` | v1 reader와 일회 전환; 구 writer import 없음 |
| `scripts/pr/*.test.mjs` | 책임별 실제 Git·파일·프로세스·원격 대역 시험 |
| `scripts/pr/UPSTREAM.md` | 고정 원본과 이식 대응표·고지 위치 |

상태·삭제·원격 mutation·플랫폼 관찰은 변경 이유가 달라 분리한다. 공용 utility framework나 제품 공유 패키지를 만들지 않는다. 추가 OS helper는 QUALIFY의 근거와 제한된 경로를 확정한 후 도입한다.

### 명령 책임

`npm run pr -- ...`를 단일 진입점으로 제안한다. 최종 flag와 JSON 전체 schema는 REPLACE 상세 계획에서 확정한다. 아래 효과 경계는 이 SDD의 계약이다.

| 명령 | 효과 | 기존 대응 |
| --- | --- | --- |
| create | 최신 dev에서 작업·worktree 생성 | create |
| status | 로컬 상태만 읽음 | status |
| inspect / dry-run | 지정 task·PR 검사 계획. 원격 조회·증거 fetch 여부 표시 | 전체 branch preview를 task로 제한 |
| complete | 종료 인계 봉인·정확한 병합·가능한 정리, 불가 시 cleanup-pending | 외부 병합+finish+branch cleanup 통합 |
| recover | 불확실한 원격 결과 관측. 재병합·삭제 없음 | 원격 결과 복구 |
| cleanup | merged/retire-pending의 남은 정리. 미지원/unknown이면 폴더 보존, 인수된 외부 제거 뒤에는 ref만 처리. 원격 mutation 없음 | 정리 보류 후 전체 청소를 대체 |
| acknowledge-removal | 사용자 보고와 실제 부재를 검증해 외부 제거 기록만 갱신. 파일/ref 삭제 없음 | 새 수동 결과 인수 경계 |
| resume | 병합 요청 전 봉인 취소·작업 복귀 | resume의 보호 의미 |
| retire | PR 없는/병합 없는 작업의 명시적 종료 | 조사 작업 ancestor 정리 |
| migrate | 선택한 legacy 기록 preview·전환 | 신규 전환 경계 |
| recover-guard | known/dead guard의 검사·확인된 회수 | 기존 잠금 복구 의미 |

자동 정리 지원 profile의 정상 경로는 create·PR·종료 인계·complete다. Windows처럼 미지원인 profile은 병합 뒤 수동 절차가 필요한 제한된 경로다. 이를 동일한 즉시 자동 완료라고 설명하지 않는다. 과거 미확인 요청이 있는 작업에 complete를 다시 실행해도 새 merge를 맹목적으로 보내지 않는다.

### 상태 원본과 identity

새 owner는 repository 공통 Git에 상태를 보존해 worktree 제거 뒤에도 intent·결과를 읽을 수 있게 한다. 기본 설계는 task별 `refs/stagekeeper/pr-closeout/tasks/<uuid>`에 versioned JSON을 가진 내부 Git commit을 연결하고 expected old OID로 갱신하는 방식이다. 이전 상태·봉인 HEAD·merge commit의 보존 parent/ref를 명시해 squash 후 source가 GC되지 않도록 한다. blob 안의 SHA 문자열만으로 객체가 보존된다고 가정하지 않는다.

내부 상태 commit은 제품 branch에 커밋하거나 push하지 않고 전역 Git 사용자 설정을 바꾸지 않는다. linked admin entry의 marker는 repository/task/instance를 대조한다. command guard·activation marker만 별도 공통 metadata 파일로 둔다. 파일 원장과 Git ref를 두 개의 독립 상태 원본으로 운영하지 않는다.

필수 기록은 schemaVersion, task/owner/common Git identity, path/admin/instance, branch/baseSHA,
tool revision, phase, PR repository ID/number/base/head, 사용 종료 선언, 요청 identity·
expected HEAD·결과, worktree/branch effect, 보류 이유, migration 출처다.

개정은 cleanup 목적 `merged | retire`, capability의 profile/revision/qualified 여부,
관측 실행 여부, 정리 방식 `automatic | external-manual`, 외부 제거의 사용자 보고·
검증 시점·부재 확인을 구분한다. 외부 제거의 실제 actor나 완료 시각을 OS가 증명한
것처럼 기록하지 않는다. capability는 저장된 옛 값을 권한으로 재사용하지 않고
실행 도구 revision과 현재 host/profile로 다시 판정한다.

| 상태 | 허용 동작 | 실패·중단 |
| --- | --- | --- |
| working | 작업·PR 준비 | 자료 보존 |
| sealed | 종료 인계·예상 HEAD/state 검증. native clear를 뜻하지 않음 | 새 변경은 resume 후 재봉인 |
| merge-requested | 저장된 intent 결과 관측 | unknown/pending, 무조건 재요청 금지 |
| merged | dev 병합과 merge SHA 보존 | source HEAD 불일치 시 정리 보류 |
| cleanup-pending | 목적 merged/retire를 구분. 자격·사용·identity 재검사 또는 외부 제거 인수 | 자동 정리 불가이면 path/admin/ref 유지 |
| complete | path/admin/local ref 부재와 dev 병합 보존 확인. automatic/external-manual 방식 표시 | 반복 처리는 검증된 no-op |
| retired | PR 없는 종료 증거·부재 확인 | merged 완료와 구분 |

phase와 effect의 허용 조합을 schema로 제한한다. 조회는 실제 Git과 저장 결과 불일치를 stale/unknown으로 표시한다. 과거 완료는 재생성된 branch의 삭제 허가가 아니다.

### 병합과 관측

- base=dev, 저장소=검증된 origin, head=봉인 SHA다. 외부 fork PR을 임의 채택하는 기능은 제외한다.
- 직접 병합은 현재 저장소의 merge commit 방식을 기본으로 한다. 이미 외부에서 squash/rebase된 PR은 정확한 head·merge SHA·fresh dev 도달 증거로 확인할 수 있어야 한다.
- gh exact-head precondition과 서버 측 보호를 사용한다. 선택한 merge method가 불가하면 임의로 변경하지 않는다.
- intent 내구 저장 실패 시 원격 mutation하지 않는다. 요청 뒤 exit code뿐 아니라 실제 PR state/head/base/merge commit과 dev 보존을 확인한다.
- 즉시 병합을 기본으로 하며 새 auto-merge/queue 예약 기능은 만들지 않는다. 서버 pending은 같은 intent를 제한된 시간 관측하고 만료 시 보존한다.
- 명령이 끝난 뒤 웹에서 병합된 작업은 recover→cleanup으로 처리한다. 상주 감시 없이 즉시 청소를 약속하지 않는다.
- 새 PR head 또는 진행된 local branch를 자동 승인하지 않는다. 정확한 작업 연결과 사용 종료를 다시 확인한다.
- 원격 feature branch는 현재 GitHub 자동 삭제 정책에 맡긴다. 새 도구의 직접 remote delete는 제외한다.

### 자동 정리 capability와 사용 확인

capability는 `qualified | unqualified`이며 OS 이름만으로 결정하지 않는다. profile은
검증된 OS/build/architecture·backend version·관측 population·권한·필수 native 사례와
source revision을 결부한다. 호출자가 임의 축소하거나 켤 수 없다.
미검증 profile에서는 `unknown`, `observationPerformed=false`,
`reason=unqualified-profile`을 반환할 수 있다. 이를 Windows native 조회 성공이나
전체 QUALIFY 성공이라고 표시하지 않는다. qualifier 시험은 실제 후보를 계속 검증할 수 있다.

아래 profile/관측 행은 유효한 종료 인계와 원격 병합 전조건 충족을 전제로 한다. 알려진 미종료 사용자가 있으면 첫 행에 해당한다.

| 실행 조건 | 병합 전 인계 | 병합 후 자동 폴더 삭제 | 결과 |
| --- | --- | --- | --- |
| 종료 선언·HEAD/identity·보존·CI 불충족 | 거부 | 0회 | 현재 작업 보존 |
| 인계/병합 충족, profile unqualified | 가능 | 0회 | merged / cleanup-pending |
| qualified, 실제 관측 busy/unknown 또는 coverage 불완전 | 가능 | 0회 | merged / cleanup-pending |
| qualified + 현재 clear + 보존·identity 유지 | 가능 | 허용 | 제거·ref 부재 확인 뒤 complete |
| 취소·미종료 observer·identity drift | 새 효과 중단 | 0회 | 이미 확정된 효과만 보고, 그 밖은 보존 |
| 자동 제거 결과 또는 외부 제거 인수가 확정되고 path/admin/등록이 모두 없음 | 새 병합 없음 | 0회 | branch 조건 재검사만 가능 |

현재 Windows의 capability는 unqualified다. PEB 권한 실패와 directory 반례는
해결되지 않았다. macOS는 N 항목별 증거 보완 후 Darwin 25.2.0/arm64/Node v26.4.0의
일반 사용자 profile 하나만 runtime 관측에 등록했다. macOS 전체 버전이나 다른
권한·Node 조합을 인증하지 않는다. 실제 자동 삭제 controller는 아직 구현·활성화하지 않았다.

자동 정리 순서:

1. controller와 알려진 사용자 세션의 사용 종료 인계가 유효한지 확인한다.
2. task·PR 또는 retire 목적·봉인 HEAD·instance와 보존 증거를 대조한다.
3. staged/unstaged/untracked, 진행 중 Git 작업·잠금, 숨김 index flag,
   sparse/submodule/중첩 repo, ignored·링크를 검사한다.
4. 자동 폐기는 현행 ignored `node_modules`, `.next`, `src/generated`, `coverage`,
   `tsconfig.tsbuildinfo`, `next-env.d.ts`로 제한한다. `.env`·보고서·로그·private templates는
   보존한다. allowlist 내부라도 외부 directory link를 따라가지 않는다.
5. qualified profile과 새 probe의 clear·coverage·observer settle을 확인한다.
   실패·권한 부족·미지원·부분 coverage는 unknown이며 삭제하지 않는다.
6. 상태·path·HEAD를 재확인하고 강제 옵션 없는 Git worktree 제거를 수행한다.
7. path/admin/등록 부재 후 다른 worktree·열린/의존 PR·재사용 remote head가 없는
   자기 local branch만 제거한다. 검증한 SHA의 exact ref 하나만 대상이다.
8. 실제 ref 부재와 effect를 기록하고 complete 또는 retired를 반환한다.

외부 raw Git/파일 쓰기를 원자적으로 막는 보장은 하지 않는다. 정상 협업은 인계
이후 편집을 중단한다. 새 변경이 생기면 보존한다. per-task 소유와 짧은 공유 Git
직렬화를 사용하며 원격 대기 전체 동안 전역 잠금을 유지하지 않는다.

### 수동 인계와 외부 제거 인수

미지원/unknown은 자동 삭제 금지다. complete는 이유와 정확한 task·HEAD·path를
출력하고 종료한다. 반복 실행을 기다리는 daemon이나 자동 권한 확대를 두지 않는다.

수동 제거는 이 CLI가 실행하는 우회 경로가 아니다. 사용자가 자기 작업의 editor,
터미널·부모 세션·서버·공유 dependency 사용을 끝내고, staged/unstaged/untracked/
ignored·외부 link를 확인해 필요한 자료를 먼저 보존해야 한다. 다른 사용자를
확인할 수 없거나 자료 보존이 불명확하면 수동 제거도 진행하지 않는다.
Git의 제거 성공이 모든 process의 사용 종료를 보장하지는 않는다는 반례를 함께 안내한다.

그 후 사용자는 대상 밖에서 저장소의 자기 worktree 수동 절차를 수행할 수 있다.
이때 해당 task의 controller/observer가 종료돼야 하며 live/unknown command guard가
남았으면 제거·guard 강제 회수를 진행하지 않는다.
강제 제거, 자동 stash/reset/clean, 사용자 파일 rm, 전역 prune은 제안하지 않는다.
CLI/agent가 unknown 결과만으로 사용자를 대신해 제거하거나, 일반적인 “계속 진행”
요청을 특정 기존 worktree의 수동 제거 확인으로 재사용해서는 안 된다.

`acknowledge-removal`의 의미는 이미 수행된 결과의 인수다.

- 입력은 task·봉인 HEAD·instance·expected state·request identity와 해당 작업의 명시적 사용자
  수동 제거/자료 보존 완료 보고다. CLI의 owner label 자체는 인증이 아니다.
- 유효한 종료 인계, merged 보존 또는 retire ancestor 증거가 있고 phase가
  cleanup-pending인 작업만 받는다. working의 directory 소실은 인수하지 않는다.
- 원래 path, 원래 admin entry, Git worktree 등록을 각각 새로 검사한다. symlink나
  다른 instance로 재생성됐거나 하나라도 남았으면 실패한다. 입력을 filesystem
  부재 사실로 사용하지 않는다.
- 성공 시 external-manual receipt와 새 상태 revision만 저장한다. 파일/ref
  삭제·PR mutation·unknown→clear 변경은 없다.
- 기록 뒤 응답을 잃은 중복 호출은 같은 request identity·입력·저장된 이전 state가
  모두 일치할 때만 receipt를 재확인해 no-op로 처리한다. 그 외 stale state는 거부한다.
  path 재생성은 중복에도 거부하며 과거 receipt를 다른 instance에 승계하지 않는다.
- 후속 cleanup은 부재·보존·branch SHA·다른 worktree·dependent PR 등을 다시
  검사한다. 통과해야 남은 local branch를 삭제할 수 있다. cwd probe를 실행한
  것으로 꾸미지 않고 receipt+부재를 별도 근거로 사용한다.
- 수동 제거 안내에 `git branch -D`나 remote 삭제를 추가하지 않는다.

자동 제거 intent 이후 응답을 잃은 경우에는 기존 recover의 부재 대조를 유지한다.
그런 intent도 사용자 보고도 없는 directory 소실은
`external-removal-unconfirmed` 또는 `partial-removal`이며 자동 완료하지 않는다.

### 삭제 단계별 재개

- 각 삭제 효과 전에 시도 identity와 대상을 보존한다. worktree 제거 응답을 잃었어도 path와 정확한 admin entry가 모두 없으면 제거 결과를 확정할 수 있다.
- 일부 파일만 제거됐거나 path/admin이 불일치하면 partial-removal로 보존한다. 강제 제거로 마무리하거나 같은 path를 덮어쓰지 않는다.
- local ref 삭제의 결과가 불명확하고 같은 이름의 ref가 존재하면, SHA가 같아도 재생성 여부를 구분할 수 없으므로 자동 재삭제하지 않는다. ref 부재가 확인된 경우에만 그 효과를 완료로 기록한다.
- 이미 complete인 작업에서 path/ref가 다시 보이면 새 작업의 가능성을 보고한다. 과거 receipt로 삭제하지 않는다. 외부 raw writer의 same-SHA 재생성을 원자적으로 탐지한다는 보장은 하지 않는다.
- 실패가 확정되고 부작용이 없음을 판별한 단계만 현재 identity·사용을 재검사하여 재시도한다. 모든 비정상 종료를 일괄 retry 가능한 실패로 바꾸지 않는다.

### 출력과 성능

task, PR, expected/observed HEAD, phase, cleanup 목적, capability, 관측 실행 여부, merge/worktree/branch 결과, 정리 방식, reasons, 다음 허용 작업을 출력한다. JSON stdout과 진단 stderr를 구분한다. complete/cleanup/retire의 exit 0은 완료/검증된 완료 no-op, 2는 관측 unknown·미지원 등을 포함한 정상 보류/pending, 1은 명령 실행 실패다. acknowledge-removal의 exit 0은 인수 기록 성공이며 전체 complete를 뜻하지 않는다. 취소·관측 실패로 원격 결과가 불명확하면 해당 효과를 unknown으로 따로 표시한다.

preview는 삭제 권한을 예약하지 않는다. complete/cleanup은 현재 상태를 다시 검사한다. 중복은 저장된 request identity와 같을 때만 결과를 재사용한다. status의 Git 조회는 optional index/lock 갱신을 억제해 무쓰기 계약을 지킨다.

GitHub 조회는 이번 PR·HEAD로 제한해 정상 경로의 전체 branch sweep을 제거한다. polling 간격·deadline·backoff·scan 한계의 수치와 근거는 상세 계획에서 확정한다. 성능 측정 결과나 개선율은 현재 없다.

### 대안

| 대안 | 판단 |
| --- | --- |
| 구 두 도구 위에 wrapper만 추가 | 전면 교체·단일 owner 요구와 달라 제외 |
| OpenClaw 전체 무수정 복사 | main·Unix·자체 제품 의존 때문에 제외 |
| 완료·보존·복구 구조를 Node 기반 새 도구로 이식 | 채택 방향. dev·OS 차이와 포팅 범위를 문서화 |
| daemon으로 웹 병합 감시 | 별도 범위 결정 전 제외 |
| 양 OS의 동일한 즉시 자동 정리를 필수 유지 | 원래 목표 유지. Windows blocker 해소 전 전면 교체 불가 |
| 검증된 profile 자동 정리 + 미지원 profile 보존/수동 인수 | 이번 권고안. 목표 제한이므로 BLK-PWC-04의 결정 필요 |
| unknown을 owner 확인 flag로 자동 삭제 가능하게 변경 | cwd 반례와 미확인 사용을 해소하지 못하므로 제외 |

## Concrete Examples

### EX-PWC-005A: 정상 완료

- illustrates: REQ-PWC-002, REQ-PWC-003, REQ-PWC-004, REQ-PWC-005
- Given: A의 local/PR HEAD가 H, 종료 인계·check 성공·qualified profile·현재 clear·자료 보존 조건 충족. B는 별도 작업 중이다.
- When: controller가 A complete를 실행하고 H의 dev 병합을 확인한다.
- Then: 같은 호출에서 A의 path/admin/branch가 사라지고 B의 파일 hash/ref는 유지된다.

### EX-PWC-007A: 응답 유실

- illustrates: REQ-PWC-007, REQ-PWC-008
- Given: intent 저장과 병합 요청 뒤 응답을 잃었다.
- When: recover가 원격을 관측한다.
- Then: 동일 H 병합은 merged로 기록하고 cleanup을 안내한다. OPEN/unknown만으로 두 번째 요청을 보내지 않는다.

### EX-PWC-006A: 병합 뒤 새 자료

- illustrates: REQ-PWC-005, REQ-PWC-006, REQ-PWC-014
- Given: 병합 후 새 `.env` 또는 cwd holder가 생겼다.
- When: 정리 검사를 수행한다.
- Then: merged 사실을 유지하고 cleanup-pending을 반환하며 자료·branch를 보존한다.

### EX-PWC-010A: 경로 재사용

- illustrates: REQ-PWC-010, REQ-PWC-008
- Given: legacy removed 경로에 다른 worktree가 있다.
- When: migrate 또는 과거 cleanup을 수행한다.
- Then: path-reused로 보존하고 과거 종료 권한으로 새 instance를 삭제하지 않는다.

### EX-PWC-015A: Windows 병합 후 보존

- illustrates: REQ-PWC-003, REQ-PWC-004, REQ-PWC-005, REQ-PWC-009, REQ-PWC-015
- Given: Windows unqualified profile이다. 종료 인계·HEAD·파일 보존·CI·병합 권한은 유효하다.
- When: complete가 H의 dev 병합을 확인한다.
- Then: merged / cleanup-pending, reason=unqualified-profile, exit 2를 반환한다. path/admin/ref는 유지되고 worktree/ref 삭제 호출은 0회다. complete를 반복해도 재병합하거나 자동 삭제하지 않는다.

### EX-PWC-016A: 외부 수동 제거 후 branch 인수

- illustrates: REQ-PWC-007, REQ-PWC-008, REQ-PWC-016
- Given: merged / cleanup-pending인 A를 사용자가 확인 후 수동 제거했다. B는 계속 작업 중이다.
- When: 사용자 보고와 acknowledge-removal이 A의 path/admin/등록 부재·보존 증거를 확인하고, 이어 cleanup이 branch 조건을 재검사한다.
- Then: 첫 명령은 receipt만 저장하고 삭제하지 않는다. 두 번째 명령은 A의 남은 local ref만 처리한다. B는 불변이며 결과는 external-manual 방식의 complete다. 두 명령 사이 A 경로가 재생성되면 branch도 보존한다.

## Affected Files

다음은 후속 승인 작업의 대상이다. 이번 작성에서는 이 SDD만 변경한다.

| 경로·영역 | 작업 | 근거 |
| --- | --- | --- |
| `scripts/manage-task-worktrees.mjs` | delete | 생성·identity·사용·종료·복구 이관 후 제거 |
| `scripts/cleanup-task-branches.mjs` | delete | PR별 merge proof·branch cleanup으로 이관 |
| 기존 두 `*.test.mjs` | migrate then delete | 보호 의미와 실패 사례를 새 시험으로 이관 |
| `scripts/pr/` | create/update | 기존 후보와 새 controller, capability, 외부 제거 인수 및 시험, 출처 |
| `package.json` | update | 구 alias 제거, pr alias. 기존 시험 발견 활용 |
| `AGENTS.md` | update | 전체 sweep·기존 finish를 작업별 완료/복구로 교체 |
| `docs/architecture/verification.md` | update | 명령·상태·보존·전환·CI coverage |
| `.github/workflows/check.yml` | update | 새 양 OS lifecycle/usage 시험 |
| `docs/proposals/active/pr-worktree-closeout-phase-qualify.md` | reconcile before implementation | 새 parent snapshot, profile 미지원 의미, 기존 실패 증거와 새 gate 구분 |
| `docs/proposals/active/task-worktree-lifecycle.md` | reconcile | 적용 시 이 SDD와 대체 관계 기록. 과거 승인·증거 보존 |
| 기존 local branch cleanup 완료 기록 | keep | 역사 문서이며 새 실행 기준으로 삼지 않음 |
| 공통 Git의 legacy 원장·marker | migrate | 실제 cutover에서만 선택·검증 |
| 제품 src/packages/plugin, Prisma, main 출시 workflow | no change | 개발 도구 교체의 범위 밖 |

static import/npm/CI/문서를 조사했다. 앱 route·barrel·public URL·ambient type의 직접 의존은 없다. 구현 시 최신 ref에서 재검색하며 역사 문서의 과거 경로와 실행 가능한 호출을 구분한다.

## Execution Plan

### Phase QUALIFY: 플랫폼과 이식 경계 확정

- status: 조건부 계약 구현·검증 통과. 원래 Windows 자동 qualification은 FAIL/미지원 유지.
- outcome: 자동 정리 가능한 profile과 미지원 profile을 구분하고 실제 관측 증거·한계·원본 포팅 대응표를 확보한다.
- split rationale: 자동 삭제 자격과 불가 시 보존 계약을 먼저 확정해야 controller를 안전하게 구현할 수 있다.
- predecessor artifacts: 채택된 이 SDD, 기존 QUALIFY 계획·실행 보고서, 고정 OpenClaw source.
- satisfies: REQ-PWC-014
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-005, INV-PWC-006
- governed-by: CON-PWC-001, CON-PWC-003, CON-PWC-004, CON-PWC-005, CON-PWC-006, CON-PWC-008
- verified-by: VFY-PWC-09
- intermediate validity: 기존 관리기를 유지한다. 후보·capability 검증은 fixture 안에서 하며 운영 삭제에 연결하지 않는다.
- exit: 각 profile의 qualified/unqualified 근거·관측 실행 여부·지원 범위와 새 runtime 계약 시험을 확정. 자동 정리를 제공할 최소 한 macOS profile의 필수 증거를 확보한다. 미지원 결과를 native 사용 부재 증명으로 세지 않는다.
- entry: BLK-PWC-04의 목표 선택 해소, 재정합된 child 및 기존 구현 승인 범위. exit에는 BLK-PWC-05 해소가 필요하다. Windows 자동 삭제 자격 자체는 계속 BLK-PWC-01에 막혀 있다.
- detailed plan: 기존 child를 새 parent에 재정합한 뒤 구현. 기존 native 실패 기록은 보존한다.

### TASK-PWCQ-01: 사용 확인과 native 이식 증거

- satisfies: REQ-PWC-014
- preserves: INV-PWC-002, INV-PWC-005, INV-PWC-006
- governed-by: CON-PWC-001, CON-PWC-003, CON-PWC-005, CON-PWC-006, CON-PWC-008
- destination: 기존 `scripts/pr/process-usage.mjs`, `process-usage.test.mjs`, `UPSTREAM.md`와 별도로 제안하는 `process-usage-qualification.test.mjs`.
- delta: 기존 parser·bounded observer·unknown 판정을 보존한다. profile 자격과 관측 실행 여부를 추가하고 runtime의 미지원 결과와 후보 qualification을 분리한다. macOS의 필수 native 사례 누락을 닫기 전에는 qualified로 등록하지 않는다.
- verified-by: VFY-PWC-09
- stop: unknown→clear, fixture PID 한정 관측, 권한 상승, 기존 실패 기록의 성공 전환, 목표 결정 전 Windows gate 완화는 금지한다.

### Phase REPLACE: 새 완료 흐름과 소스 전환

- status: 구현·선택 범위 검증 완료. 검증 source b9364eb, 최종 head 5f2d527. [PR #369](https://github.com/Sangeok/stagekeeper/pull/369)는 2026-11-18 dev에 병합됐다(d745747).
- outcome: 새 구현·시험·규칙·CI를 한 coherent 변경으로 제공하고 구 두 생산 구현과 실행 alias를 제거한다.
- split rationale: source 전환과 사용자 원장 전환의 효과가 달라 로컬 활성화는 ADOPT로 분리한다.
- predecessor artifacts: BLK-PWC-04의 범위 결정, 재정합된 QUALIFY 결과와 profile별 한계, 승인된 이식/Phase 상세 계획.
- satisfies: REQ-PWC-001, REQ-PWC-002, REQ-PWC-003, REQ-PWC-004, REQ-PWC-005, REQ-PWC-006, REQ-PWC-007, REQ-PWC-008, REQ-PWC-009, REQ-PWC-011, REQ-PWC-012, REQ-PWC-013, REQ-PWC-015, REQ-PWC-016
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-004, INV-PWC-005, INV-PWC-006
- governed-by: CON-PWC-001, CON-PWC-002, CON-PWC-003, CON-PWC-004, CON-PWC-005, CON-PWC-006, CON-PWC-008
- verified-by: VFY-PWC-01, VFY-PWC-02, VFY-PWC-03, VFY-PWC-04, VFY-PWC-05, VFY-PWC-06, VFY-PWC-07, VFY-PWC-08, VFY-PWC-11, VFY-PWC-13, VFY-PWC-14
- completion ownership: 위 행동의 구현과 fixture 검증을 소유한다. legacy migration 구현도 준비하지만 실제 전환 완료는 ADOPT가 소유한다.
- intermediate validity: legacy가 있는 미전환 PC에서 새 status/migration preview는 가능하고 mutation은 activation 전 거부한다. 구 writer를 새 명령에서 호출하지 않는다.
- exit: 양 OS의 제공 경로 검사, 필요한 check, 구 실행 참조 0건, 원본 고지, 오류·복구·수동 인수 명세, 미활성 real repo를 바꾸지 않는 증거. Windows는 자동 삭제 0회와 명시적 인수 경로가 필수다.
- entry evidence: 재정합된 QUALIFY와 등록 profile의 실행 증거. BLK-PWC-04/05는 해당 범위에서 해소됐으며, BLK-PWC-01은 Windows 자동 삭제 활성화에 남는다. REPLACE 상세 계획과 실행 범위는 별도다.
- detailed plan: [완료된 REPLACE 계획](../completed/2026-11-18-pr-worktree-closeout-phase-replace.md)과 [검증 보고서](../../test-reports/completed/2026-11-18-pr-worktree-replace.md). 아래 Task의 canonical 책임은 유지한다.

### TASK-PWCR-01: identity·상태·명령

- satisfies: REQ-PWC-001, REQ-PWC-002, REQ-PWC-009
- preserves: INV-PWC-001, INV-PWC-002
- governed-by: CON-PWC-001, CON-PWC-005
- destination: 새 index/task-state/git-workspace와 lifecycle 시험.
- delta: UUID 생성, PR 없는 시작, exact binding, durable state, local status, 무변경 preview, activation guard. capability·관측 실행 여부·cleanup 목적·automatic/external-manual 효과를 구분하는 schema를 확정한다.
- verified-by: VFY-PWC-01, VFY-PWC-02, VFY-PWC-08
- depends on: TASK-PWCQ-01.

### TASK-PWCR-02: 병합 검증·요청·관측

- satisfies: REQ-PWC-004, REQ-PWC-005, REQ-PWC-013
- preserves: INV-PWC-001, INV-PWC-003, INV-PWC-004
- governed-by: CON-PWC-001, CON-PWC-002, CON-PWC-005
- destination: 새 github-merge/index와 merge 시험.
- delta: 종료 인계와 native 관측을 분리한다. dev/HEAD/check/필수 조건 확인, durable intent, exact-head 요청, 실제 merge 증명 뒤 로컬 정리 또는 pending으로 연결한다. 미지원만으로 병합을 막지 않으며 기존 gh PR 생성은 유지한다.
- verified-by: VFY-PWC-03, VFY-PWC-04, VFY-PWC-07
- depends on: TASK-PWCR-01.

### TASK-PWCR-03: 사용 종료·파일·branch 정리

- satisfies: REQ-PWC-003, REQ-PWC-005, REQ-PWC-006, REQ-PWC-012, REQ-PWC-015
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-005
- governed-by: CON-PWC-001, CON-PWC-003, CON-PWC-006
- destination: 새 process-usage/git-workspace와 cleanup 시험.
- delta: 종료 인계와 qualified+clear 삭제 조건, 미지원/busy/unknown의 pending·삭제 0회, ignored/링크 보존, exact worktree 제거·부재 확인 뒤 ref 제거. 외부 제거 receipt 경로는 폴더 삭제 없이 ref만 처리한다. retire도 동일 조건을 적용한다.
- verified-by: VFY-PWC-04, VFY-PWC-05, VFY-PWC-08, VFY-PWC-13, VFY-PWC-14
- depends on: TASK-PWCR-01, TASK-PWCQ-01.

### TASK-PWCR-04: 중단·중복·복구

- satisfies: REQ-PWC-007, REQ-PWC-008, REQ-PWC-013, REQ-PWC-016
- preserves: INV-PWC-002, INV-PWC-003, INV-PWC-004
- governed-by: CON-PWC-002, CON-PWC-003, CON-PWC-005
- destination: 새 task-state/index, recovery 시험.
- delta: intent 전후·응답 유실·worktree 제거 전후 중단, state 충돌, duplicate complete, recover, pending 재개, dead guard 회수. acknowledge-removal은 예상 상태와 사용자 보고·부재·보존 증거만 인수한다. 자동 intent 없는 소실, partial-removal, receipt 후 재생성은 보존한다.
- verified-by: VFY-PWC-06, VFY-PWC-07, VFY-PWC-14
- depends on: TASK-PWCR-02, TASK-PWCR-03.

### TASK-PWCR-05: 구 체계 퇴역과 CI

- satisfies: REQ-PWC-011
- preserves: INV-PWC-001, INV-PWC-003
- governed-by: CON-PWC-001, CON-PWC-004, CON-PWC-006
- destination: 구 두 구현·시험, package.json, AGENTS, verification, check workflow, 새 UPSTREAM.md.
- delta: 새 시험이 보호 의미를 입증한 뒤 구 파일·alias·import·CI step 제거. 양 OS의 실제 제공 동작 gate와 coverage 표를 함께 갱신하고, 아래 CI 전환 원칙에 따라 native 자격 실패를 숨기지 않는다.
- verified-by: VFY-PWC-11
- depends on: TASK-PWCR-01, TASK-PWCR-02, TASK-PWCR-03, TASK-PWCR-04, TASK-PWCR-06.
- stop: 구 writer 호출 wrapper가 남거나 지원 OS 필수 검사가 skip되면 완료하지 않는다.

### TASK-PWCR-06: 일회 migration 경계

- satisfies: REQ-PWC-010
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003
- governed-by: CON-PWC-001, CON-PWC-003, CON-PWC-005
- destination: 새 legacy-migration/task-state와 migration 시험.
- delta: v1 reader, 선택 plan, source digest/identity 재검증, history 보존, 중단 복구와 activation. legacy writer import 금지.
- verified-by: VFY-PWC-10
- depends on: TASK-PWCR-01.
- completion scope: fixture 기반 기능 기여다. 실제 전환 완료는 Phase ADOPT가 소유한다.

### Phase ADOPT: 지정한 저장소 전환과 실제 인수

- status: 운영 Mac의 세 작업 이관 완료. #372에서 보류됐던 빌드 후 파일 검사가 Mac 링크 수정본에서 통과했다. #372는 이미 dev에 병합됐으며 실제 단일 호출 병합·정리 및 Windows 실 PR 인수는 대기 중이다. [실행 보고서](../../test-reports/active/pr-worktree-adopt.md)
- outcome: 이번 교체에 지정한 관리 PC/checkout을 전환하고 승인된 작업의 실제 병합·정리를 확인한다.
- split rationale: source merge만으로 사용자 원장·활성 세션의 전환은 완료되지 않는다.
- predecessor artifacts: REPLACE 검증 commit, migration preview, owner별 종료/인계 사실.
- satisfies: REQ-PWC-010, REQ-PWC-005, REQ-PWC-007, REQ-PWC-015, REQ-PWC-016
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-004, INV-PWC-005
- governed-by: CON-PWC-002, CON-PWC-003, CON-PWC-005, CON-PWC-006
- verified-by: VFY-PWC-10, VFY-PWC-12
- completion ownership: 실제 원장 전환을 완료하며 정상 완료·복구의 실제 환경 증거를 보강한다.
- intermediate validity: 전환 전 old source/기록은 보존하고 신 writer를 활성화하지 않는다. 전환 후 구 writer 실행 금지.
- entry blockers: BLK-PWC-02, BLK-PWC-03.
- exit: 선택 단위의 activation·구 writer 정지·legacy active의 종료 또는 신원 확인된 working 이관·실제 PR의 정상 및 보류 결과.
- detailed plan: [ADOPT 상세 계획](./pr-worktree-closeout-phase-adopt.md). 적용 시점의 새 preview로 대상·소유자를 다시 확인한다.

### TASK-PWCA-01: 기존 작업 전환

- satisfies: REQ-PWC-010
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-005
- governed-by: CON-PWC-003, CON-PWC-005
- destination: 선택한 로컬 common Git metadata와 migration 명령.
- delta: old writer 정지, record↔실제 경로 대조, active 종료/인계, removed 이력 보존, unknown 유지, activation read-back.
- verified-by: VFY-PWC-10
- depends on: TASK-PWCR-06.
- stop: source plan drift, 손상 기록, 사용 중 old writer 또는 unknown owner에 임의 적용하지 않는다.

### TASK-PWCA-02: 실제 완료 인수

- satisfies: REQ-PWC-005, REQ-PWC-007, REQ-PWC-010, REQ-PWC-015, REQ-PWC-016
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-004
- governed-by: CON-PWC-002, CON-PWC-003, CON-PWC-006
- destination: 승인된 fixture GitHub repository 또는 명시된 Stagekeeper 작업, 인수 보고서.
- delta: qualified profile의 병렬 작업 중 하나만 병합·자동 정리, Windows의 병합 후 보존·사용자 수동 제거 인수·ref 정리, sibling 보존, 재병합 없는 재개를 실제 권한 범위에서 검증한다.
- verified-by: VFY-PWC-12
- depends on: TASK-PWCA-01.
- stop: 실제 대상·병합 권한·OS가 없으면 해당 인수는 미실행으로 남긴다.

## Verification Plan

기존 VFY-PWC-09 후보 실행은 부분 성공/실패 증거가 있다. 그 밖의 controller 및 이번 개정의 새 동작은 Planned다. 실제 Git·bare remote·파일·프로세스를 fixture에서 사용하고 GitHub 응답은 대역으로 주입한다. 대역의 통과가 실제 GitHub 권한·정책 통과를 증명하지 않는다. [test-writing](../../architecture/test-writing.md)과 [test-organization](../../architecture/test-organization.md)을 따른다.

### VFY-PWC-01: 생성과 보호 경계

- category: integration.
- destination: 제안 `scripts/pr/lifecycle.test.mjs`.
- verifies: REQ-PWC-001
- expected: 정상 생성과 identity. 보호 ref·충돌·alias·다른 repo·부분 생성 실패에서 기존 파일/ref 불변.
- state: Planned.

### VFY-PWC-02: PR exact binding

- category: contract.
- destination: 제안 `scripts/pr/merge.test.mjs`.
- verifies: REQ-PWC-002
- expected: 같은 repo/dev/head만 연결. fork·base/branch/HEAD drift·malformed 응답 거부, 두 번째 worktree 생성 없음.
- state: Planned.

### VFY-PWC-03: 병합 전조건

- category: integration.
- destination: 제안 `scripts/pr/merge.test.mjs`.
- verifies: REQ-PWC-004
- expected: 최신 성공 check와 필수 조건에만 mutation 1회. 실패/pending/auth/HEAD 변경/wrong base에는 0회. 페이지/attempt 누락은 성공 아님.
- state: Planned.

### VFY-PWC-04: 정상 전체 완료

- category: integration.
- destination: 제안 `scripts/pr/lifecycle.test.mjs`.
- verifies: REQ-PWC-003, REQ-PWC-005
- expected: qualified profile에서 실제 worktree 2개 중 선택 작업만 종료 인계·현재 clear·병합 증명 뒤 path/admin/ref 제거. 인계 부재·stale HEAD/instance·자료 보존 실패는 병합/삭제 0회. source 보존, sibling hash/ref 불변, 반복 complete mutation 0회.
- state: Planned.

### VFY-PWC-05: 삭제 보존 경계

- category: integration.
- destination: 제안 `scripts/pr/cleanup.test.mjs`.
- verifies: REQ-PWC-006
- expected: tracked/untracked/필요한 ignored, `.env`, 외부 link/junction, nested repo, lock, stale instance/HEAD, 열린 dependent PR의 양성·음성 대조. 거부 후 내용/ref 보존.
- state: Planned.

### VFY-PWC-06: 중단과 경합 복구

- category: recovery.
- destination: 제안 `scripts/pr/recovery.test.mjs`.
- verifies: REQ-PWC-007, REQ-PWC-008
- expected: intent 전후·원격 수락 뒤 응답 유실·worktree 제거 뒤 저장 전 중단 주입. 재병합 0회, ref 재생성 보존, 동일 request 중복 효과 방지, live/unknown guard 유지.
- state: Planned.

### VFY-PWC-07: pending과 외부 병합

- category: integration.
- destination: 제안 `scripts/pr/merge.test.mjs`, `scripts/pr/recovery.test.mjs`.
- verifies: REQ-PWC-007, REQ-PWC-013
- expected: deadline/SIGINT는 pending과 자료 유지. 외부 동일 HEAD 병합은 recover 뒤 cleanup만 가능. OPEN/unknown에서 재요청 없음, 다른 HEAD 병합은 보류.
- state: Planned.

### VFY-PWC-08: 조회와 retire

- category: contract.
- destination: 제안 `scripts/pr/lifecycle.test.mjs`.
- verifies: REQ-PWC-009, REQ-PWC-012
- expected: status의 파일/ref/network trace 무변경, preview 삭제/state mutation 없음. no-PR ancestor만 retired. unique commit·open/dependent PR이면 보존.
- state: Planned.

### VFY-PWC-09: 실제 OS 관측과 capability

- category: integration.
- destination: 기존 `scripts/pr/process-usage.test.mjs`, 새로 제안한 `process-usage-qualification.test.mjs`, 기존 `windows-directory-usage.test.mjs`; Windows 2022/macOS 15.
- verifies: REQ-PWC-014
- expected: runtime 미지원은 unknown·관측 미실행·coverage false로 구분하고 native 성공으로 세지 않는다. qualified 후보는 실제 부모/하위 cwd·다른 세션·종료 후 clear·권한/alias/중단 사례와 population 근거를 입증한다. Windows directory 반례의 살아 있는 cwd 누락도 실제 OS에서 보존한다.
- limit: 다른 계정·특권·원격 host 전체 가시성은 미인증. mock은 native 자격을 증명하지 않는다.
- state: 기존 후보의 실행 증거는 보고서 참조, 개정 capability/runtime 계약 검증은 Planned. Windows 자동 정리 자격 FAIL은 그대로다.

### VFY-PWC-10: migration 전환

- category: migration.
- destination: 제안 `scripts/pr/migration.test.mjs`와 선택한 실제 원장 전환 기록.
- verifies: REQ-PWC-010
- expected: active/removed/closing/손상/신버전/path-reused 구분. digest drift·old writer 경합 중단. 반복 migration mapping 일치. imported working은 삭제 권한을 얻지 않음.
- state: Planned.

### VFY-PWC-11: 구 경로 퇴역과 CI

- category: architecture.
- destination: package·CI·실제 import graph·문서 검사와 새 focused 시험.
- verifies: REQ-PWC-011
- expected: 구 두 생산 파일·alias·실행 import·CI step 0건, 새 양 OS 검사 실제 실행. 역사 문서의 과거 설명 제외. 구 보호 사례를 새 VFY에 매핑.
- state: Planned.

### VFY-PWC-12: 실제 PR 인수

- category: end-to-end.
- destination: 명시된 GitHub 대상/작업, 양 OS 결과 보고서.
- verifies: REQ-PWC-005, REQ-PWC-007, REQ-PWC-010, REQ-PWC-015, REQ-PWC-016
- expected: qualified profile의 정상 dev 병합·같은 호출의 정리, Windows의 merged-cleanup-pending·사용자 외부 제거 인수·ref 정리, sibling 보존, 재병합 0회. SHA/PR URL/OS/capability/정리 방식과 삭제·보존 결과 기록.
- limit: 실제 미보존 사용자 자료로 파괴적 장애를 재현하지 않는다. 원격 응답 유실 대역 시험과 구분한다.
- state: Planned.

### VFY-PWC-13: 병합과 자동 정리 조건의 분리

- category: integration.
- destination: 제안 `scripts/pr/merge.test.mjs`, `lifecycle.test.mjs`, `cleanup.test.mjs`.
- verifies: REQ-PWC-003, REQ-PWC-004, REQ-PWC-005, REQ-PWC-009, REQ-PWC-015
- expected: 종료 인계·HEAD·보존·CI 충족 + unqualified/unknown의 대조군은 원격 병합 1회 뒤 pending/exit 2, 파일/ref 삭제 0회다. 인계·보존·CI 중 하나라도 실패하면 병합도 0회다. qualified busy도 삭제 0회, qualified clear만 전체 조건 뒤 정리한다. 재시도·중단·외부 병합은 이미 확정한 병합을 반복하지 않는다. stdout의 partial 결과와 status의 무변경을 검사한다.
- native boundary: Windows 실제 runtime 경로와 실제 Git fixture에서 자동 삭제 0회·원래 파일/ref 보존을 검증한다. GitHub mutation만 대역이며 실제 인수는 VFY-PWC-12다.
- state: Planned.

### VFY-PWC-14: 외부 제거 인수와 경합

- category: recovery.
- destination: 제안 `scripts/pr/recovery.test.mjs`, `cleanup.test.mjs`.
- verifies: REQ-PWC-007, REQ-PWC-008, REQ-PWC-009, REQ-PWC-012, REQ-PWC-016
- expected: 양 OS의 시험 소유 worktree에서 holder 종료 후 외부 제거를 재현한다. 사용자 보고·expected state·봉인 HEAD·보존 증거와 path/admin/등록의 부재를 대조하고 인수 명령의 파일/ref/PR mutation 0회를 확인한다. 이어 cleanup은 같은 대상의 ref만 처리한다. 사용자 보고 없음, working 소실, path/admin 중 하나만 없음, junction·다른 instance·동일 경로 재생성, 추가 commit, 다른 worktree/PR, receipt 뒤 재생성, 인수 저장 뒤 응답 유실·중복에는 다른 자료를 변경하지 않는다. merged와 retire 목적, complete/retired 출력, actual absence와 unknown 유지도 대조한다.
- limit: 사용자 진술의 진위나 모든 외부 사용 종료를 OS가 인증한다고 주장하지 않는다. 필수 예상 상태·실제 부재·보존 검사를 생략하는 구현을 실패시킨다.
- state: Planned.

### CI 전환 원칙

조건부 범위 채택에 따라 QUALIFY 상세 계획에서 runtime 계약 시험과 자동 정리
자격 시험의 책임을 분리한다. Windows의 기존 실패를 고친 것으로 보고하지 않으며
새 required gate의 성공은 Windows 자동 삭제 자격을 뜻하지 않는다.

- required `check/task-worktrees`는 양 OS에서 생성·인계·병합·보존·중단·인수를 실제
  Git/process fixture로 실행한다. Windows 미지원 경로의 삭제 0회가 필수다.
- 자동 정리로 출시하는 profile의 native 자격 시험은 필수다. macOS에서 미검증
  사례를 skip한 채 qualified로 표시하지 않는다.
- Windows의 기존 clear/busy 기대 시험은 실패한 자동 정리 후보 평가로 보존한다.
  그 실행 기록을 PASS로 바꾸지 않는다. Windows 자동 정리를 출시 범위에서
  제외하는 승인된 결정에 한해서 runtime required gate와 분리하며, 별도 명시적
  qualification 실행·실패 판정은 유지한다. 이 변경 이유와 지원하지 않는 기능을
  coverage 표와 보고서에 기록한다.
- directory 누락 반례 시험과 Windows 보존/인수 시험은 실제 Windows에서 실행한다.
  다른 OS에서의 skip을 Windows native 증거로 세지 않는다.
- check green은 제공한 조건부 기능의 계약 검증이지 Windows 자동 삭제 지원 인증이 아니다.

후속 구현에서 사용할 기존 검증 명령:

~~~sh
npm run verify:fsd
npm run verify:server
npm run verify:shared
npm run test:architecture
npm run check
npm test
npm run build
npm run docs:check
npm run verify:ci-coverage
~~~

새 focused 시험은 구현 후 `npm exec --call "node --test scripts/pr/*.test.mjs"`로 연결한다. 파일이 실제 발견되는지 확인하고 native 사례 skip을 통과로 세지 않는다. CI leg 변경과 coverage 표를 같은 변경에서 맞춘다.

~~~text
create/bind                   → VFY 01/02
release/probe                 → VFY 04/09
CI + exact-head merge         → VFY 03
merge confirmed → own cleanup → VFY 04/05
unknown/duplicate/crash        → VFY 06/07
unqualified merge → preserve   → VFY 13
external removal → ref only    → VFY 14
status/retire                 → VFY 08
legacy → new owner            → VFY 10
old paths removed + CI        → VFY 11
live acceptance               → VFY 12
~~~

위는 계획 coverage이며 현재 통과율이 아니다.

## Migration, Rollout and Rollback

전환 단위는 같은 common Git을 공유하는 로컬 저장소 전체다. 다른 PC는 별도 단위다. checkout 하나만 새 규칙으로 바꾸고 다른 세션의 구 writer가 같은 metadata를 계속 쓰게 두지 않는다.

1. 새 구현·양 OS fixture 검증을 준비한다.
2. 적용 시점의 원장·실제 경로를 읽고 old 명령·자동 호출을 정지한다. active는 소유자가 종료하거나 신원 확인 후 working으로 인계한다.
3. preview에서 task/instance/path/branch/actual HEAD와 old record hash를 제시한다. 이 문서의 작업도 나중에 legacy면 같은 원칙으로 다룬다.
4. exact selection 재검사 후 새 기록을 만든다. removed는 이력으로 보존하고 새 경로에 연결하지 않는다. 미등록·손상·신버전은 보고만 한다.
5. activation을 마지막에 기록한다. 중단 시 source/new mapping을 대조해 migration만 재개하고 폴더/ref를 삭제하지 않는다.
6. activation 뒤 old 원장은 history로 보존하고 writer로 쓰지 않는다. 구 source는 Git 이력에 남지만 명령·alias·import로 재노출하지 않는다.

구 실행 파일은 새 activation을 이해하지 못한다. source 전환만으로 기존 프로세스가 정지된다고 주장하지 않는다. old writer 정지와 협업 종료는 실제 적용 조건이다.

롤백:

- 새 activation/mutation 전이면 검증한 이전 source revision으로 복귀 가능하다.
- intent 또는 병합 이후에는 writer를 멈추고 원격 결과와 새 기록을 보존한다. 구 프로그램을 곧바로 실행하지 않는다.
- 이미 병합된 PR을 이 교체의 롤백 때문에 revert하거나 다시 병합하지 않는다.
- 삭제된 worktree를 같은 path에 자동 재생성하지 않는다. 필요하면 보존 commit에서 새 경로로 복구하고 남은 사용자 자료와 대조한다.
- 새 상태를 읽는 검증된 recovery revision을 유지한다. 검증된 역변환 없이 legacy downgrade하지 않는다.
- migration/rollback 시험은 원격 효과 반복 없이 기록·자료 보존을 확인해야 한다.

## Blockers and Readiness

### BLK-PWC-01: Windows 자동 정리 자격 미확보

- classification: downstream. 원래 목표에서는 전체 REPLACE, BLK-PWC-04의 조건부 범위 채택 뒤에는 Windows 자동 삭제 활성화에 한정.
- evidence: 실제 PEB 조회의 접근 거부와 directory 후보의 살아 있는 cwd 누락. 실행 보고서와 고정 source/run/job 참조.
- affects: REQ-PWC-005, REQ-PWC-014, REQ-PWC-015, TASK-PWCQ-01.
- impact: 성공 exit·PID 0건·종료 선언만으로 clear를 만들면 사용 중인 자료를 지울 수 있다.
- unblock: 현재 반례를 해소하는 새로운 수단의 가시성 근거·필수 native 사례·권한/profile 검증과 별도 자동 정리 범위 승인.
- owner: 후속 플랫폼 구현 담당자.
- stop: Windows 자동 삭제는 비활성. unknown 우회·권한 상승·silent skip 금지. 조건부 범위 승인 전에는 REPLACE 전체 보류를 유지한다.

### BLK-PWC-02: old writer와 활성 작업 전환

- classification: downstream, earliest Phase ADOPT.
- evidence: 작성 전 active 3건, 작성 task도 active 기록을 추가함.
- affects: REQ-PWC-010, REQ-PWC-011, TASK-PWCA-01.
- impact: 두 writer가 같은 경로·상태를 소유하거나 과거 권한이 재사용됨.
- unblock: 실제 record/path/owner 재조회, 정상 종료·인계, old writer 정지 확인.
- owner: 각 작업 소유자와 전환 실행자.
- stop: unknown/active owner를 임의 종료·채택하지 않는다.

### BLK-PWC-03: 실제 GitHub 인수 대상과 권한

- classification: downstream, earliest Phase ADOPT.
- evidence: 이번 요청은 SDD 작성이며 실제 시험 PR·병합·자료 정리 대상을 지정하지 않음.
- affects: TASK-PWCA-02.
- impact: 대역 통과를 실제 성공으로 보고하거나 무관한 PR을 시험 목적으로 병합할 수 있음.
- unblock: 대상 repository/작업/OS와 실제 승인 범위 명시.
- owner: 요청자와 실행 담당자.
- stop: 대상·권한 없으면 실제 mutation하지 않고 미실행 기록.

### BLK-PWC-04: 조건부 자동 정리 목표의 채택

- classification: resolved 목표 선택. 후속 child 재정합은 이 결정의 적용 작업이다.
- evidence: 원래 목표는 양 OS의 병합 직후 자동 정리다. 개정안은 Windows에서 병합 후 보존과 사용자 수동 인수를 제공하므로 사용자 결과가 달라진다.
- affects: REQ-PWC-003, REQ-PWC-005, REQ-PWC-009, REQ-PWC-014, REQ-PWC-015, REQ-PWC-016, CON-PWC-006.
- impact: 결정을 생략하면 구현 편의를 위해 원래 목표를 줄이거나, Windows 자동 정리가 지원되는 것으로 오인시킬 수 있다.
- resolution: 요청자가 조건부 범위 권고 뒤 “오케이 진행해”로 채택했다. 기존 QUALIFY child를 새 parent에 재정합하고 기존 승인 구현 범위에서 runtime/qualification 경계를 보완한다.
- owner: 요청자와 설계 담당자.
- stop: 방향 채택은 Windows 자격 통과·실제 삭제·REPLACE 실행 승인이 아니다. 명령 수를 줄인다는 이유로 사용 확인이나 외부 제거 검증을 생략하지 않는다.

### BLK-PWC-05: 자동 정리 출시 profile의 증거 마감

- classification: resolved, 등록한 로컬 profile 한정. 다른 profile의 자격은 승계하지 않는다.
- evidence: 7a6b804의 local macOS native 17건, ae0a6af의 qualified runtime 대조, 전체 CI 44091585161 통과. 실행 보고서에 N 항목별 native/boundary/미지원과 한계를 기록했다.
- affects: REQ-PWC-005, REQ-PWC-014, TASK-PWCQ-01.
- impact: 일부 suite 통과를 macOS 전체 자동 삭제 자격으로 확대할 수 있다.
- resolution: Darwin 25.2.0/arm64/Node v26.4.0/lsof 4.91/current-UID 일반 권한 한 profile을 등록했다. root/effective UID 변경, 다른 OS/build/CPU/Node는 미지원이다. 매 호출 실제 backend와 coverage를 재검증한다.
- owner: QUALIFY 재정합·검증 담당자.
- stop: 모든 profile을 unqualified로 남긴 채 자동 정리 기능을 완성했다고 선언하지 않는다.

전체 설계는 개정 목표의 선택과 구현 책임을 검토할 수 있는 상태다. REPLACE의
조건부 QUALIFY의 구현·검증과 BLK-PWC-04/05의 해당 범위는 마감했다.
이제 REPLACE 상세 계획을 작성할 수 있다. 구 관리기 교체·실제 병합/삭제 구현은
그 상세 계획의 범위와 준비도를 확인한 뒤 진행하며 이번 QUALIFY 결과로 자동 실행하지 않는다.
BLK-PWC-01은 Windows 자동 삭제 기능에 계속 남으며 ADOPT는 별도 실제 권한과 인수가 필요하다.

## Safety Analysis

- 보호 branch·주 checkout·다른 작업·추가 커밋·경로 재사용 보존은 기존 의미를 유지한다.
- merge·worktree 제거·ref 제거의 효과를 별도 기록하고 부분 성공을 숨기지 않는다.
- 수동 인수는 미지원/unknown을 clear로 바꾸지 않는다. 이미 사라진 대상의 확인만 소유하며, 사람의 사용 종료 판단까지 OS 증명으로 포장하지 않는다.
- 미지원 환경에서 병합이 먼저 끝나 원격 task branch가 자동 삭제돼도 로컬 worktree/ref와 내부 상태의 source 보존은 유지한다. 추가 commit은 HEAD drift로 정리를 막는다.
- 제품과 분리된 개발 도구지만 삭제 자체는 HIGH-RISK이므로 실제 Git/OS 증거가 필요하다.
- 무관한 dirty checkout을 치울 필요가 없다. 실행 source는 관리용 checkout의 승인된 revision/무변경 상태로 검증한다.
- 기존 gh 인증을 사용하고 token을 기록하거나 권한을 확대하지 않는다. 권한 거부는 보류로 처리한다.
- 외부 raw writer의 완전 차단은 보장하지 않는다. 사용 종료 계약과 관찰 한계를 명시한다.

## Approval

승인 기록은 front matter가 단일 원본이다. 조건부 범위와 QUALIFY 계속 작업은 front matter에 승인 범위를 기록했다. REPLACE/ADOPT와 실제 자료 적용은 승인하지 않았다. 후속 승인은 선택 Phase와 실제 자료 적용 범위를 구분한다. 작성 완료가 다음 Phase의 자동 실행 권한은 아니다.

## Verification Results

아래 표는 최초 초안 작성의 기록이다. 이번 개정 검증은 다음 절에 별도로 기록한다.

| 이번 문서 작업 | 결과 | 한계 |
| --- | --- | --- |
| 상태·보호 remote·open PR·worktree·기존 원장 조회 | 실행 | 후속 적용 때 재확인할 시점 정보 |
| 코드·호출·CI·시험 assertion·고정 upstream 대조 | 읽기 검토 | 새 구현 실행 증거 아님 |
| 격리 문서 worktree 생성 | 실행 | 원래 dirty checkout과 기존 작업 보존 |
| SDD 일반 모드 추적성 | PASS | REQ 14/14에 Phase/Task·VFY 연결. strict 실행 준비도 판정과 별도 |
| 새 미추적 문서를 포함한 inspectDocs·front matter | PASS | 230개 Markdown, 상대 링크 1,200개, 문제 0건 |
| 공백·code fence·placeholder 검사 | PASS | 행 끝 공백·미처리 표식 없음, fence 짝과 EOF 확인 |
| 의미 검토 | 수행 | preview 무쓰기, 병합/정리 효과 분리, same-SHA 재생성의 재삭제 금지, blocker 시점 대조 |
| VFY-PWC-01~12 | 초안 작성 시 Not run yet | 이후 VFY-PWC-09 후보 실행은 연결된 QUALIFY 보고서 참조 |

검증 bundle은 이 파일 하나다. 외부 제안서의 canonical ID를 복제하지 않으며 계약/이력 링크로만 참조한다. 이 파일은 미승인 whole SDD와 downstream blocker를 포함하므로 일반 모드 검증을 적용한다. strict의 finalized executable bundle 조건을 충족했다고 주장하지 않는다.

### 개정 검증과 후속 인계

이번 검증 bundle은 이 parent와 기존 QUALIFY child다. canonical REQ/INV/CON/TASK/VFY는
parent에만 정의하며, child와의 의미 차이는 위 재정합 대상으로 명시했다.
일반 모드로 ID·연결·중복·누락을 확인한다. blocked/미승인 whole SDD이므로 strict를
실행 준비도 판정처럼 적용하지 않는다.

| 이번 개정의 검증 | 결과 | 의미와 제한 |
| --- | --- | --- |
| parent + 기존 child 일반 traceability validator | PASS | REQ 16/16에 Phase/Task 및 canonical VFY 연결. INV 6, CON 8, TASK 9, VFY 14, BLK 5 |
| npm run docs:check | PASS | Markdown 233개, 상대 링크 1,224개, test report 60개. 링크/metadata 검증 |
| git diff --check | PASS | 공백 오류 없음 |
| 수정 경계 | PASS | 상위 SDD 1파일만 변경. child·실행 보고서·source·시험·CI 유지 |
| child와의 의미 정합성 | 후속 작업 | ID 연결 성공과 별개로 old snapshot의 계약 재정합은 BLK-PWC-04에 연결 |
| 신규 동작의 runtime/native 인수 | 미실행 | 설계 작성이며 시험 통과나 실제 삭제를 주장하지 않음 |

의미 검토는 종료 선언과 native 관측의 분리, 원격 HEAD 변경, post-merge 새 자료,
취소·응답 유실·중복, unqualified/unknown의 삭제 0회, 수동 인수의 부재 대조,
인수 이후 재생성, retire 목적, capability downgrade와 CI 제공 범위를 대조한다.
이번 문서 작업에서 native probe·테스트·build·실제 병합·사용자 자료 삭제는 수행하지 않는다.

후속 작업은 결정에 따라 갈린다.

- 조건부 범위를 채택하면 이 parent snapshot과 실행 보고서를 기준으로 기존
  QUALIFY child만 먼저 재정합한다. 허용 profile·미지원 표현·native/계약 시험 분리,
  macOS 필수 증거 누락, source/runtime 진입점과 CI 변경을 구체화한다.
  그것이 다음 bounded 문서 작업이며 REPLACE 코드 구현을 동시에 시작하지 않는다.
- 양 OS 즉시 자동 정리 목표를 유지하면 이 개정의 제한된 경로를 활성화하지 않고
  기존 체계를 유지한다. Windows 새 후보가 실제 가시성 근거를 제시하기 전에는
  반복 실험만 늘리거나 권한을 확대하지 않는다.

## Completion or Closure Notes

구현·검증 완료 전이다. 이번 재설계 산출물은 이 SDD 한 파일이며 source·시험·CI·기존 자료 migration·PR 병합을 수행하지 않았다. 같은 미병합 작업의 Draft PR #364와 task branch/worktree에 설계 결과를 보존한다. 조건부 목표 채택과 QUALIFY 계속 작업은 이번 사용자 요청으로 기록했으며 REPLACE/ADOPT로 승계하지 않는다.

후속 완료 기록에는 source commit, Phase별 VFY 증거, 양 OS 결과, legacy 전환/보류 항목, 구 실행 경로 제거 결과, 실제 PR/merge SHA와 path/ref 결과를 남긴다.

## Review Checklist

- [x] 현재 코드·영구 계약·사용자 의도·고정 원본을 구분했다.
- [x] 전면 교체와 유지할 보호, 종료 시점의 의도적 변경을 명시했다.
- [x] 정상·지연·유실·정리 실패·중복·경합·migration을 다뤘다.
- [x] 새 파일·명령을 현재 존재하는 것처럼 쓰지 않았다.
- [x] 요구사항과 Phase/Task·VFY를 연결했다.
- [x] 플랫폼 확인과 실제 사용자 전환의 blocker 시점을 구분했다.
- [x] Windows 즉시 자동 정리 목표와 개정안의 차이, unknown 보존, 수동 인수의 한계를 명시했다.
- [x] 기존 child의 stale snapshot과 재정합 범위를 숨기지 않았으며 native FAIL을 PASS로 바꾸지 않았다.
- [x] source 삭제와 원장 전환, 단순 revert의 한계를 구분했다.
- [x] 이번 쓰기는 이 SDD로 제한했다.
- [x] 문서 검증과 구현·실제 OS 인수를 구분했다.

## REPLACE completion handoff — 2026-11-18

사용자의 상세 계획 기반 구현 요청으로 REPLACE 실행이 승인됐다. 앞선 작성·review 섹션의
“REPLACE 미실행/제외”는 당시 이력이며 현재 권한·결과는 front matter와 이 인계를 따른다.
REQ/INV/CON의 canonical 의미는 변경하지 않았다.

- b9364eb / [check 44207459589](https://github.com/Sangeok/stagekeeper/actions/runs/44207459589): 8개 job PASS, Windows/macOS 새 41개 시험 각각 PASS.
- Node ESM 단일 pr 흐름과 Git-ref 상태/merge/cleanup/recovery/migration을 구현하고 구 두 writer·alias·CI 경로를 퇴역했다.
- Windows unqualified 및 unknown은 보존한다. 내부 generated directory-link 예외도 Windows의 잔존 경로 반례로 비활성화했다.
- 실제 repository는 activation-required이며 사용자 v1 원장·worktree를 이관/삭제하지 않았다. 실제 merge도 미실행이다.
- [REPLACE 완료 문서](../completed/2026-11-18-pr-worktree-closeout-phase-replace.md)와 [보고서](../../test-reports/completed/2026-11-18-pr-worktree-replace.md)가 구현 근거다.
- #369는 dev에 병합됐다. 다음 실행 단계는 ADOPT 상세 계획에 따른 소유자별 인계, 이전 관리기 중지 확인, 지정된 실제 PR 인수다.
  BLK-PWC-02/03 및 Windows 자동 qualification의 downstream 제한은 남는다.
