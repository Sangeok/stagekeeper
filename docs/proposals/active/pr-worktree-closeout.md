---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-11-17"
approved-by: null
approved-at: null
approval-scope: null
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
---

# PR 병합과 worktree 정리의 통합 완료 흐름

## Summary

병렬 작업에 사용한 worktree와 브랜치를 해당 PR의 dev 병합 확인 직후 정리하도록 저장소 관리 도구를 전면 교체한다. OpenClaw의 정상 완료 경로인 병합 요청·실제 결과 확인·자기 worktree 제거·자기 브랜치 제거를 채택하고, Stagekeeper의 dev 정책과 Windows/macOS 환경에 맞게 이식한다.

기존 `manage-task-worktrees.mjs`와 `cleanup-task-branches.mjs`는 전환 후 제거한다. 구 구현을 호출하는 영구 wrapper나 두 개의 정리 주체는 남기지 않는다. PR 생성과 CI는 기존 GitHub 기능을 사용한다. 이번 쓰기 권한은 이 SDD 한 파일이며 실제 구현·기존 자료 정리·커밋·푸시·PR 생성·병합·main 승격은 포함하지 않는다.

- 작성 모드: `WHOLE_SDD`.
- 위험도: `HIGH-RISK`. 원격 병합, 로컬 파일 삭제, 중단 복구, 기존 상태 전환을 다룬다.
- 설계 상태: 전체 동작과 전환 경계의 검토 가능한 초안. 플랫폼 사용 확인은 선행 자격 검증 대상이다.
- 구현 준비도: Phase QUALIFY의 범위를 정의했다. REPLACE와 ADOPT는 선행 결과와 상세 계획 없이 착수하지 않는다.
- 기본 범위: 로컬 완료 명령이 병합 요청과 실제 결과 확인을 소유한다. 명령 종료 후 웹 병합을 상시 감시하는 서비스는 제외한다.

## Goal

- 작업자가 사용을 끝낸 작업의 PR이 dev에 병합되면 같은 완료 명령에서 worktree와 로컬 브랜치까지 정리한다.
- 병합 성공과 정리 실패를 구분하고, 이미 성공한 병합을 반복하지 않는다.
- 다른 병렬 작업과 미보존 자료를 유지한다.
- 생성·PR 연결·완료·복구의 주체를 하나로 통합한다.
- 명령·구현·규칙·CI·로컬 기록을 새 체계로 전환한다.

## Proposal Size

`proposal-size: standard`. 기존 구현·테스트 삭제, 로컬 상태 이관, 원격 mutation, 운영체제별 파일·프로세스 검증, 5개 이상의 파일 변경과 단순 revert 이상의 복구를 포함한다. 문서 분류와 위험도는 별개다.

## Current State

### 관측 기준과 쓰기 경계

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
| 자료 보존 | clean만으로 종료 추정 금지 | owner 인계와 OS 관측을 함께 요구 |

CI 판정의 의도적 변경도 구분한다. 기존 merged-pr 삭제 경로는 연결된 최신 workflow 전부의 성공을 다시 요구한다. 새 정상 완료는 해당 HEAD의 check와 서버가 요구하는 필수 검사·review를 병합 직전에 확인하고 그 결과를 병합 기록에 연결한다. 이미 검증한 병합의 정리 재개는 임의의 후속 CI 실행으로 병합 사실을 무효화하지 않는다. 이 차이는 영구 계약 전환에 포함하며, 새 규칙 승인 전에는 기존 검사기를 우회하지 않는다.

현행 계약은 [architecture README](../../architecture/README.md), [verification](../../architecture/verification.md), [AGENTS.md](../../../AGENTS.md)가 소유한다. 작성만으로 계약을 활성화하지 않는다. 문서 내용 중 Observed는 소스·명령 관측, Contracted는 영구 규칙, 새 동작·파일·명령은 Proposed다.

## Scope

포함: 개발용 worktree 생성·조회·PR 연결·병합·정리·복구의 단일 CLI, 기존 두 구현·시험·명령 퇴역, PR 없는 작업의 명시적 종료, legacy 기록의 일회 전환, 양 OS 검증, 개발 규칙·CI·원본 고지 갱신.

제외: 상주 daemon/webhook, 명령 종료 후 웹 병합의 자동 감시, 새 PR 생성·리뷰·CI 플랫폼, 자동 comment/review, 관리자 우회, main 승격·운영 DB·제품 파이프라인 변경, 소유권 불명 자료의 일괄 채택/삭제, 나이 기반 삭제·전역 prune, OpenClaw gateway/Crabbox/Testbox/cache 전체 복제, 임의 raw Git/외부 파일 쓰기의 OS 수준 차단.

## Behavioral Requirements

### REQ-PWC-001: 작업 생성

WHEN 소유자·새 harness branch·새 경로가 주어지면, 도구 SHALL 보호 원격과 최신 dev를 확인하고 새 worktree와 구별 가능한 task identity를 반환한다. 충돌하면 기존 자료를 변경하지 않는다.

### REQ-PWC-002: 정확한 PR 연결

WHEN 완료 명령이 task와 PR을 받으면, 도구 SHALL 저장소·dev base·head repository/branch·최종 SHA를 대조하고 일치할 때만 연결한다. PR 연결을 이유로 worktree를 이동하거나 두 번째 작업 worktree를 만들지 않는다.

### REQ-PWC-003: 사용 종료 인계

WHEN 소유자가 예상 상태·HEAD에 대해 사용 종료를 선언하고 관리자가 대상 밖에서 완료를 요청하면, 도구 SHALL 파일 보존과 사용 확인을 통과한 작업만 봉인한다. 다른 사용 또는 판단 불가이면 병합·삭제를 시작하지 않는다.

### REQ-PWC-004: 병합 전 검증

WHEN 봉인된 작업의 PR이 열려 있으면, 도구 SHALL 해당 HEAD의 최신 check 성공과 적용되는 필수 검사·review·병합 조건을 확인한 뒤 정상 권한으로만 병합을 요청한다. HEAD 변경·실패·인증 오류·판단 불가이면 요청하지 않는다.

### REQ-PWC-005: 병합 후 같은 명령에서 정리

WHEN 정확한 작업 HEAD의 dev 병합과 정리 조건 유지를 확인하면, 완료 명령 SHALL 같은 invocation에서 해당 worktree와 local branch를 순서대로 제거하고 실제 부재를 확인한 뒤 complete를 반환한다. 병합 명령의 성공 exit만으로 완료하지 않는다.

### REQ-PWC-006: 자료와 다른 작업 보존

IF 대상에 dirty 자료·필요한 ignored 파일·외부 directory link·잠금·다른 사용·identity 변경이 있으면, 도구 SHALL 자료와 branch를 보존하고 이유를 반환한다. 무관한 dirty checkout을 삭제 대상으로 삼지 않는다.

### REQ-PWC-007: 불확실한 결과 복구

IF 병합 응답 유실 또는 중단이 발생하면, 도구 SHALL 저장된 요청·HEAD와 원격 결과를 대조한다. 불명확하면 재병합·삭제를 하지 않는다. 이미 병합된 작업의 정리 재개는 원격 병합 mutation을 발생시키지 않는다.

### REQ-PWC-008: 중복과 경합

WHEN 명령이 중복되거나 같은 작업/공유 Git metadata에 경합하면, 도구 SHALL 중복 병합·다른 작업 삭제를 방지하고 변경된 HEAD·instance·예상 상태를 거부한다. 완료된 동일 작업의 반복 처리는 검증된 무해한 결과를 반환한다.

### REQ-PWC-009: 상태 조회와 부분 성공

WHEN status 또는 dry-run을 요청하면, 도구 SHALL task·PR·HEAD·병합·worktree·branch 결과와 보류 이유를 구분한다. status는 network/fetch/기록 쓰기/삭제 없이 수행하며 dry-run은 원격 조회 여부를 표시하고 mutation·권한 예약을 하지 않는다.

### REQ-PWC-010: legacy 전환

WHEN 구 writer 사용 종료 후 선택한 migration plan을 적용하면, 도구 SHALL source snapshot과 실제 경로·instance·HEAD를 재검사하고 일치하는 managed 작업만 전환한다. removed 기록·경로 재사용·미등록 worktree를 새 삭제 허가로 해석하지 않는다.

### REQ-PWC-011: 단일 체계로 교체

WHEN 새 체계를 활성화하면, 저장소 SHALL 구 두 명령·생산 구현·import·CI 실행 경로를 제거하고 새 진입점을 사용한다. 기존 보호 계약은 새 시험으로 이관하고 구 writer로 새 상태를 갱신하지 않는다.

### REQ-PWC-012: PR 없는 작업 종료

WHEN 소유자가 PR 없는 조사 작업 또는 병합 없이 끝낸 작업을 명시적으로 retire하면, 도구 SHALL 사용 종료·최신 dev에 보존된 HEAD·열린/의존 PR 부재를 확인한 경우에만 자기 worktree·local branch를 정리하고 retired로 기록한다. 미보존 커밋은 유지하며 PR 생성·병합을 하지 않는다.

### REQ-PWC-013: 지연·외부 병합

WHEN 실행 중인 완료 명령이 병합 대기를 관측하면, 도구 SHALL 제한된 관측 시간 동안 실제 결과를 기다리고 만료·취소 시 pending을 반환한다. 명령 종료 후 외부 병합은 recover와 cleanup으로 처리하며 상주 명령 없이 즉시 청소된다고 표시하지 않는다.

### REQ-PWC-014: 양 OS 사용 확인

WHEN 사용 확인 모듈에 대상 worktree를 요청하면, 모듈 SHALL Windows/macOS에서 clear·busy·unknown과 근거를 반환한다. 권한 부족·probe 실패·미지원은 unknown이며 clean status나 PID 부재만으로 clear를 반환하지 않는다.

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

Windows/macOS의 파일·프로세스·Git 검증 전 운영 삭제를 활성화하지 않는다. 원격 대역과 실제 GitHub 인수를 구분하고 CI coverage와 workflow를 함께 변경한다.

### CON-PWC-007: 문서 작성 권한

이번 쓰기 대상은 이 SDD뿐이다. governing proposal, AGENTS, 소스·테스트·CI, 기존 사용자 worktree를 수정하지 않는다.

## Proposal

### 책임과 control flow

~~~text
worker: create → 병렬 작업 → 기존 gh로 dev PR 생성 → 사용 종료 인계
controller(대상 밖):
  complete(task, PR, expected HEAD/state)
    → 대상·사용·CI 확인 → intent 보존 → 병합 요청·원격 결과 확인
    → merged 기록 → worktree 제거 → branch 제거 → complete
  불확실한 응답: recover → 관측 결과 기록
  merged / cleanup-pending: cleanup → 남은 로컬 정리
~~~

작업자는 결과를 준비하고 사용을 끝낸다. controller는 신뢰할 수 있는 도구가 있는 유지되는 checkout에서 실행한다. PR 번호는 complete 때 확정하며 inspect는 연결 예정 관계만 검증한다. 작업 시작 시 PR을 강제 생성하지 않는다. 신규 도구는 PR 본문·review·CI dispatch를 소유하지 않는다.

### 제안 소스 배치

다음은 아직 존재하지 않는 새 경로 제안이다.

| 경로 | 소유 책임 |
| --- | --- |
| `scripts/pr/index.mjs` | CLI·출력·완료 흐름 진입점 |
| `scripts/pr/task-state.mjs` | identity·상태·원격 intent/결과·예상 상태 갱신 |
| `scripts/pr/git-workspace.mjs` | 생성·경로/파일 검사·worktree/ref 제거 |
| `scripts/pr/github-merge.mjs` | PR/CI 조회·exact-head 요청·원격 결과 대조 |
| `scripts/pr/process-usage.mjs` | OS 사용 확인·종료 인계 |
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
| complete | 봉인·정확한 병합·같은 호출의 정리 | 외부 병합+finish+branch cleanup 통합 |
| recover | 불확실한 원격 결과 관측. 재병합·삭제 없음 | 원격 결과 복구 |
| cleanup | merged 작업의 남은 로컬 정리. 원격 mutation 없음 | 정리 보류 후 전체 청소를 대체 |
| resume | 병합 요청 전 봉인 취소·작업 복귀 | resume의 보호 의미 |
| retire | PR 없는/병합 없는 작업의 명시적 종료 | 조사 작업 ancestor 정리 |
| migrate | 선택한 legacy 기록 preview·전환 | 신규 전환 경계 |
| recover-guard | known/dead guard의 검사·확인된 회수 | 기존 잠금 복구 의미 |

정상 사용자는 create 뒤 기존 방식으로 PR을 만들고 사용 종료 후 complete를 호출한다. 예외용 명령은 정상 완료의 추가 수동 단계가 아니다. 과거 미확인 요청이 있는 작업에 complete를 다시 실행해도 새 merge를 맹목적으로 보내지 않는다.

### 상태 원본과 identity

새 owner는 repository 공통 Git에 상태를 보존해 worktree 제거 뒤에도 intent·결과를 읽을 수 있게 한다. 기본 설계는 task별 `refs/stagekeeper/pr-closeout/tasks/<uuid>`에 versioned JSON을 가진 내부 Git commit을 연결하고 expected old OID로 갱신하는 방식이다. 이전 상태·봉인 HEAD·merge commit의 보존 parent/ref를 명시해 squash 후 source가 GC되지 않도록 한다. blob 안의 SHA 문자열만으로 객체가 보존된다고 가정하지 않는다.

내부 상태 commit은 제품 branch에 커밋하거나 push하지 않고 전역 Git 사용자 설정을 바꾸지 않는다. linked admin entry의 marker는 repository/task/instance를 대조한다. command guard·activation marker만 별도 공통 metadata 파일로 둔다. 파일 원장과 Git ref를 두 개의 독립 상태 원본으로 운영하지 않는다.

필수 기록은 schemaVersion, task/owner/common Git identity, path/admin/instance, branch/baseSHA, tool revision, phase, PR repository ID/number/base/head, 사용 종료 선언, 요청 identity·expected HEAD·결과, worktree/branch effect, 보류 이유, migration 출처다.

| 상태 | 허용 동작 | 실패·중단 |
| --- | --- | --- |
| working | 작업·PR 준비 | 자료 보존 |
| sealed | 종료 인계·예상 HEAD/state 검증 | 새 변경은 resume 후 재봉인 |
| merge-requested | 저장된 intent 결과 관측 | unknown/pending, 무조건 재요청 금지 |
| merged | dev 병합과 merge SHA 보존 | source HEAD 불일치 시 정리 보류 |
| cleanup-pending | 사용·identity 재검사 후 남은 정리 | 병합 사실 유지, 사유 출력 |
| complete | path/admin/local ref 부재 확인 | 반복 처리는 검증된 no-op |
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

### 정리와 사용 확인

1. controller와 부모 사용자가 대상 밖에 있고 worker 사용이 끝났는지 확인한다.
2. task·PR·봉인 HEAD·instance와 병합 결과를 대조한다.
3. staged/unstaged/untracked, Git 진행 상태/잠금, 숨김 index flag, sparse/submodule/중첩 repo, ignored·링크를 검사한다.
4. 자동 폐기는 현행 ignored `node_modules`, `.next`, `src/generated`, `coverage`, `tsconfig.tsbuildinfo`, `next-env.d.ts`로 제한한다. `.env`·보고서·로그·private templates는 보존한다. allowlist 내부라도 외부 directory link를 따라가지 않는다.
5. probe의 clear와 owner 종료 선언을 함께 요구한다. 실패·권한 부족·지원 불가는 unknown이다.
6. 상태·path·HEAD를 재확인하고 강제 옵션 없는 Git worktree 제거를 수행한다.
7. path/admin 부재 후 다른 worktree·열린/의존 PR·재사용 remote head가 없는 자기 local branch만 제거한다. compare-and-swap을 쓰면 검증한 SHA의 exact ref 하나만 대상이다.
8. 실제 ref 부재와 effect를 기록하고 complete를 반환한다.

OpenClaw의 lsof만 복사하면 Windows에서 같은 증명을 할 수 없다. 기존 Windows role helper는 자신이 만든 역할 프로세스 관리이며 일반 개발 worktree의 cwd holder를 판정하는 공용 API로 확인되지 않았다. 구체적 수단은 QUALIFY에서 입증한다. Windows에서 probe를 생략하고 항상 clear를 반환하는 구현은 허용하지 않는다.

외부 raw Git/파일 쓰기를 원자적으로 막는다는 보장은 하지 않는다. 정상 협업은 사용 종료 이후 편집을 중단한다. 새 명령은 per-task 소유를 유지하고 공유 Git mutation을 짧게 직렬화한다. 원격 대기 전체 동안 불필요한 저장소 전역 잠금을 유지하지 않는다.

### 삭제 단계별 재개

- 각 삭제 효과 전에 시도 identity와 대상을 보존한다. worktree 제거 응답을 잃었어도 path와 정확한 admin entry가 모두 없으면 제거 결과를 확정할 수 있다.
- 일부 파일만 제거됐거나 path/admin이 불일치하면 partial-removal로 보존한다. 강제 제거로 마무리하거나 같은 path를 덮어쓰지 않는다.
- local ref 삭제의 결과가 불명확하고 같은 이름의 ref가 존재하면, SHA가 같아도 재생성 여부를 구분할 수 없으므로 자동 재삭제하지 않는다. ref 부재가 확인된 경우에만 그 효과를 완료로 기록한다.
- 이미 complete인 작업에서 path/ref가 다시 보이면 새 작업의 가능성을 보고한다. 과거 receipt로 삭제하지 않는다. 외부 raw writer의 same-SHA 재생성을 원자적으로 탐지한다는 보장은 하지 않는다.
- 실패가 확정되고 부작용이 없음을 판별한 단계만 현재 identity·사용을 재검사하여 재시도한다. 모든 비정상 종료를 일괄 retry 가능한 실패로 바꾸지 않는다.

### 출력과 성능

task, PR, expected/observed HEAD, phase, merge/worktree/branch 결과, reasons, 다음 허용 작업을 출력한다. JSON stdout과 진단 stderr를 구분한다. exit 0은 완료/검증된 no-op, 2는 보류/pending, 1은 실행 실패/판단 불가로 제안한다.

preview는 삭제 권한을 예약하지 않는다. complete/cleanup은 현재 상태를 다시 검사한다. 중복은 저장된 request identity와 같을 때만 결과를 재사용한다. status의 Git 조회는 optional index/lock 갱신을 억제해 무쓰기 계약을 지킨다.

GitHub 조회는 이번 PR·HEAD로 제한해 정상 경로의 전체 branch sweep을 제거한다. polling 간격·deadline·backoff·scan 한계의 수치와 근거는 상세 계획에서 확정한다. 성능 측정 결과나 개선율은 현재 없다.

### 대안

| 대안 | 판단 |
| --- | --- |
| 구 두 도구 위에 wrapper만 추가 | 전면 교체·단일 owner 요구와 달라 제외 |
| OpenClaw 전체 무수정 복사 | main·Unix·자체 제품 의존 때문에 제외 |
| 완료·보존·복구 구조를 Node 기반 새 도구로 이식 | 채택 방향. dev·OS 차이와 포팅 범위를 문서화 |
| daemon으로 웹 병합 감시 | 별도 범위 결정 전 제외 |

## Concrete Examples

### EX-PWC-005A: 정상 완료

- illustrates: REQ-PWC-002, REQ-PWC-003, REQ-PWC-004, REQ-PWC-005
- Given: A의 local/PR HEAD가 H, 사용 종료와 check 성공. B는 별도 작업 중이다.
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

## Affected Files

다음은 후속 승인 작업의 대상이다. 이번 작성에서는 이 SDD만 변경한다.

| 경로·영역 | 작업 | 근거 |
| --- | --- | --- |
| `scripts/manage-task-worktrees.mjs` | delete | 생성·identity·사용·종료·복구 이관 후 제거 |
| `scripts/cleanup-task-branches.mjs` | delete | PR별 merge proof·branch cleanup으로 이관 |
| 기존 두 `*.test.mjs` | migrate then delete | 보호 의미와 실패 사례를 새 시험으로 이관 |
| `scripts/pr/` | create | 새 owner, 시험, 출처 |
| `package.json` | update | 구 alias 제거, pr alias. 기존 시험 발견 활용 |
| `AGENTS.md` | update | 전체 sweep·기존 finish를 작업별 완료/복구로 교체 |
| `docs/architecture/verification.md` | update | 명령·상태·보존·전환·CI coverage |
| `.github/workflows/check.yml` | update | 새 양 OS lifecycle/usage 시험 |
| `docs/proposals/active/task-worktree-lifecycle.md` | reconcile | 적용 시 이 SDD와 대체 관계 기록. 과거 승인·증거 보존 |
| 기존 local branch cleanup 완료 기록 | keep | 역사 문서이며 새 실행 기준으로 삼지 않음 |
| 공통 Git의 legacy 원장·marker | migrate | 실제 cutover에서만 선택·검증 |
| 제품 src/packages/plugin, Prisma, main 출시 workflow | no change | 개발 도구 교체의 범위 밖 |

static import/npm/CI/문서를 조사했다. 앱 route·barrel·public URL·ambient type의 직접 의존은 없다. 구현 시 최신 ref에서 재검색하며 역사 문서의 과거 경로와 실행 가능한 호출을 구분한다.

## Execution Plan

### Phase QUALIFY: 플랫폼과 이식 경계 확정

- status: Proposed.
- outcome: 양 OS 사용 확인 adapter와 실제 프로세스 증거, 원본 포팅 대응표를 확보한다.
- split rationale: 사용 확인이 불가능하면 원본 cleanup을 안전하게 이식할 수 없어 삭제 구현의 선행 조건이다.
- predecessor artifacts: 이 SDD와 고정 OpenClaw source.
- satisfies: REQ-PWC-014
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-005
- governed-by: CON-PWC-001, CON-PWC-003, CON-PWC-004, CON-PWC-005, CON-PWC-006
- verified-by: VFY-PWC-09
- intermediate validity: 기존 명령은 현행 구현을 사용한다. 새 adapter는 fixture에서 검증하며 운영 삭제 진입점에 연결하지 않는다.
- exit: Windows/macOS에서 부모 cwd·다른 세션·권한 부족·종료 후 clear의 실제 증거와 helper 의존성 결정.
- entry blocker: 현재 source 접근 blocker는 없다. Windows 실행 환경·플랫폼 증명 실패는 다음 Phase를 막는다.
- detailed plan: 실행 전에 구체적 native 수단과 fixture 계획을 작성한다. 전체 SDD가 이를 대신하지 않는다.

### TASK-PWCQ-01: 사용 확인과 native 이식 증거

- satisfies: REQ-PWC-014
- preserves: INV-PWC-002, INV-PWC-005
- governed-by: CON-PWC-001, CON-PWC-003, CON-PWC-005, CON-PWC-006
- destination: 제안 `scripts/pr/process-usage.mjs`, `scripts/pr/process-usage.test.mjs`.
- delta: owner 선언을 유지하며 OS 결과를 clear/busy/unknown으로 정의. 실제 cwd holder·부모 세션·종료·권한 실패·Windows alias/junction을 시험한다.
- verified-by: VFY-PWC-09
- stop: unknown을 clear로 낮추거나 새 권한/의존성/helper를 근거 없이 추가해야 하면 보류한다.

### Phase REPLACE: 새 완료 흐름과 소스 전환

- status: Proposed.
- outcome: 새 구현·시험·규칙·CI를 한 coherent 변경으로 제공하고 구 두 생산 구현과 실행 alias를 제거한다.
- split rationale: source 전환과 사용자 원장 전환의 효과가 달라 로컬 활성화는 ADOPT로 분리한다.
- predecessor artifacts: QUALIFY 결과, 승인된 이식/Phase 상세 계획.
- satisfies: REQ-PWC-001, REQ-PWC-002, REQ-PWC-003, REQ-PWC-004, REQ-PWC-005, REQ-PWC-006, REQ-PWC-007, REQ-PWC-008, REQ-PWC-009, REQ-PWC-011, REQ-PWC-012, REQ-PWC-013
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-004, INV-PWC-005
- governed-by: CON-PWC-001, CON-PWC-002, CON-PWC-003, CON-PWC-004, CON-PWC-005, CON-PWC-006
- verified-by: VFY-PWC-01, VFY-PWC-02, VFY-PWC-03, VFY-PWC-04, VFY-PWC-05, VFY-PWC-06, VFY-PWC-07, VFY-PWC-08, VFY-PWC-11
- completion ownership: 위 행동의 구현과 fixture 검증을 소유한다. legacy migration 구현도 준비하지만 실제 전환 완료는 ADOPT가 소유한다.
- intermediate validity: legacy가 있는 미전환 PC에서 새 status/migration preview는 가능하고 mutation은 activation 전 거부한다. 구 writer를 새 명령에서 호출하지 않는다.
- exit: 양 OS 검사, 필요한 check, 구 실행 참조 0건, 원본 고지, 오류·복구 명세, 미활성 real repo를 바꾸지 않는 증거.
- blockers: BLK-PWC-01.
- detailed plan: QUALIFY 결과를 반영해 작성한다. 아래 Task는 변경 책임의 경계이며 전체 signature 확정본이 아니다.

### TASK-PWCR-01: identity·상태·명령

- satisfies: REQ-PWC-001, REQ-PWC-002, REQ-PWC-009
- preserves: INV-PWC-001, INV-PWC-002
- governed-by: CON-PWC-001, CON-PWC-005
- destination: 새 index/task-state/git-workspace와 lifecycle 시험.
- delta: UUID 생성, PR 없는 시작, exact binding, durable state, local status, 무변경 preview, activation guard. 작업별 요청과 결과의 허용 schema를 확정한다.
- verified-by: VFY-PWC-01, VFY-PWC-02, VFY-PWC-08
- depends on: TASK-PWCQ-01.

### TASK-PWCR-02: 병합 검증·요청·관측

- satisfies: REQ-PWC-004, REQ-PWC-005, REQ-PWC-013
- preserves: INV-PWC-001, INV-PWC-003, INV-PWC-004
- governed-by: CON-PWC-001, CON-PWC-002, CON-PWC-005
- destination: 새 github-merge/index와 merge 시험.
- delta: dev/HEAD/check/필수 조건 확인, durable intent, exact-head 요청, 실제 merge 증명, 동일 invocation의 정리 연결. 기존 gh PR 생성 유지.
- verified-by: VFY-PWC-03, VFY-PWC-04, VFY-PWC-07
- depends on: TASK-PWCR-01.

### TASK-PWCR-03: 사용 종료·파일·branch 정리

- satisfies: REQ-PWC-003, REQ-PWC-005, REQ-PWC-006, REQ-PWC-012
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-005
- governed-by: CON-PWC-001, CON-PWC-003, CON-PWC-006
- destination: 새 process-usage/git-workspace와 cleanup 시험.
- delta: 종료 선언+probe, ignored/링크 보존, exact worktree 제거·부재 확인 후 local ref 제거. retire는 ancestor로 보존된 명시적 대상만 처리.
- verified-by: VFY-PWC-04, VFY-PWC-05, VFY-PWC-08
- depends on: TASK-PWCR-01, TASK-PWCQ-01.

### TASK-PWCR-04: 중단·중복·복구

- satisfies: REQ-PWC-007, REQ-PWC-008, REQ-PWC-013
- preserves: INV-PWC-002, INV-PWC-003, INV-PWC-004
- governed-by: CON-PWC-002, CON-PWC-003, CON-PWC-005
- destination: 새 task-state/index, recovery 시험.
- delta: intent 전후·응답 유실·worktree 제거 전후 중단, state 충돌, duplicate complete, 관측 전용 recover, merged cleanup 재개, dead guard 회수.
- verified-by: VFY-PWC-06, VFY-PWC-07
- depends on: TASK-PWCR-02, TASK-PWCR-03.

### TASK-PWCR-05: 구 체계 퇴역과 CI

- satisfies: REQ-PWC-011
- preserves: INV-PWC-001, INV-PWC-003
- governed-by: CON-PWC-001, CON-PWC-004, CON-PWC-006
- destination: 구 두 구현·시험, package.json, AGENTS, verification, check workflow, 새 UPSTREAM.md.
- delta: 새 시험이 보호 의미를 입증한 뒤 구 파일·alias·import·CI step 제거. 역사 기록 보존. 양 OS gate와 coverage 표 동시 변경.
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

- status: Proposed.
- outcome: 이번 교체에 지정한 관리 PC/checkout을 전환하고 승인된 작업의 실제 병합·정리를 확인한다.
- split rationale: source merge만으로 사용자 원장·활성 세션의 전환은 완료되지 않는다.
- predecessor artifacts: REPLACE 검증 commit, migration preview, owner별 종료/인계 사실.
- satisfies: REQ-PWC-010, REQ-PWC-005, REQ-PWC-007
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-004, INV-PWC-005
- governed-by: CON-PWC-002, CON-PWC-003, CON-PWC-005, CON-PWC-006
- verified-by: VFY-PWC-10, VFY-PWC-12
- completion ownership: 실제 원장 전환을 완료하며 정상 완료·복구의 실제 환경 증거를 보강한다.
- intermediate validity: 전환 전 old source/기록은 보존하고 신 writer를 활성화하지 않는다. 전환 후 구 writer 실행 금지.
- entry blockers: BLK-PWC-02, BLK-PWC-03.
- exit: 선택 단위의 activation·구 writer 정지·legacy active의 종료 또는 신원 확인된 working 이관·실제 PR의 정상 및 보류 결과.
- detailed plan: 실제 repository/path/owner 목록을 적용 시점에 만든다. 이번 관측 수량을 삭제 입력으로 쓰지 않는다.

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

- satisfies: REQ-PWC-005, REQ-PWC-007, REQ-PWC-010
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-004
- governed-by: CON-PWC-002, CON-PWC-003, CON-PWC-006
- destination: 승인된 fixture GitHub repository 또는 명시된 Stagekeeper 작업, 인수 보고서.
- delta: 병렬 작업 둘 중 하나만 병합·정리, sibling 보존, 정리 실패 뒤 cleanup만 재개하는 결과를 남긴다.
- verified-by: VFY-PWC-12
- depends on: TASK-PWCA-01.
- stop: 실제 대상·병합 권한·OS가 없으면 해당 인수는 미실행으로 남긴다.

## Verification Plan

VFY는 모두 Planned다. 실제 Git·bare remote·파일·프로세스를 fixture에서 사용하고 GitHub 응답은 대역으로 주입한다. 대역의 통과가 실제 GitHub 권한·정책 통과를 증명하지 않는다. [test-writing](../../architecture/test-writing.md)과 [test-organization](../../architecture/test-organization.md)을 따른다.

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
- expected: 실제 worktree 2개 중 선택 작업만 사용 종료·병합 증명 뒤 path/admin/ref 제거. source 보존, sibling hash/ref 불변, 반복 complete mutation 0회.
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

### VFY-PWC-09: 실제 OS 사용 검사

- category: integration.
- destination: 제안 `scripts/pr/process-usage.test.mjs`; Windows 2022/macOS 15.
- verifies: REQ-PWC-014
- expected: 실제 child/살아 있는 parent cwd·대상 하위 cwd·다른 세션·종료·probe 실패·권한 불가. busy/unknown의 삭제 호출 0회. 시험 소유 프로세스만 종료.
- limit: 모든 특권/원격 세션 완전 탐지나 외부 writer 차단을 주장하지 않는다.
- state: Planned.

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
- verifies: REQ-PWC-005, REQ-PWC-007, REQ-PWC-010
- expected: 정상 dev 병합과 같은 호출의 정리, sibling 보존, merged-cleanup-pending 뒤 로컬 정리만 복구. SHA/PR URL/OS/삭제·보존 결과 기록.
- limit: 실제 미보존 사용자 자료로 파괴적 장애를 재현하지 않는다. 원격 응답 유실 대역 시험과 구분한다.
- state: Planned.

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

### BLK-PWC-01: Windows 사용 확인 수단 미검증

- classification: downstream, earliest Phase REPLACE.
- evidence: 원본은 lsof와 Windows-skip 시험. 현행 관리기는 owner 선언 기반이며 일반 cwd holder 검사 공용 API는 조사 범위에서 확인되지 않음.
- affects: REQ-PWC-003, REQ-PWC-005, REQ-PWC-014, TASK-PWCQ-01.
- impact: 사용 중인 경로를 clear로 오판하면 자료·실행 환경 훼손 가능.
- unblock: QUALIFY에서 metadata 수단·지원 범위·권한 실패와 양 OS 실제 증거 확정.
- owner: 후속 구현 담당자.
- stop: 증명 없이 운영 cleanup 활성화·REPLACE 구현을 진행하지 않는다. silent Windows skip 금지.

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

전체 설계는 동작·교체·전환 경계를 검토할 수 있는 초안이다. Phase QUALIFY는 후속 승인과 구체적 probe 계획을 전제로 진행 가능하다. REPLACE/ADOPT는 위 선행 결과와 상세 계획이 필요하다. 안전 동작 축소로 blocker를 숨기지 않는다.

## Safety Analysis

- 보호 branch·주 checkout·다른 작업·추가 커밋·경로 재사용 보존은 기존 의미를 유지한다.
- merge·worktree 제거·ref 제거의 효과를 별도 기록하고 부분 성공을 숨기지 않는다.
- 제품과 분리된 개발 도구지만 삭제 자체는 HIGH-RISK이므로 실제 Git/OS 증거가 필요하다.
- 무관한 dirty checkout을 치울 필요가 없다. 실행 source는 관리용 checkout의 승인된 revision/무변경 상태로 검증한다.
- 기존 gh 인증을 사용하고 token을 기록하거나 권한을 확대하지 않는다. 권한 거부는 보류로 처리한다.
- 외부 raw writer의 완전 차단은 보장하지 않는다. 사용 종료 계약과 관찰 한계를 명시한다.

## Approval

승인 기록은 front matter가 단일 원본이다. 이 문서는 검토 가능한 제안 상태이며 구현 실행 승인을 기록하지 않았다. 후속 승인은 선택 Phase와 실제 자료 적용 범위를 구분한다. 작성 완료가 다음 Phase의 자동 실행 권한은 아니다.

## Verification Results

| 이번 문서 작업 | 결과 | 한계 |
| --- | --- | --- |
| 상태·보호 remote·open PR·worktree·기존 원장 조회 | 실행 | 후속 적용 때 재확인할 시점 정보 |
| 코드·호출·CI·시험 assertion·고정 upstream 대조 | 읽기 검토 | 새 구현 실행 증거 아님 |
| 격리 문서 worktree 생성 | 실행 | 원래 dirty checkout과 기존 작업 보존 |
| SDD 일반 모드 추적성 | PASS | REQ 14/14에 Phase/Task·VFY 연결. strict 실행 준비도 판정과 별도 |
| 새 미추적 문서를 포함한 inspectDocs·front matter | PASS | 230개 Markdown, 상대 링크 1,200개, 문제 0건 |
| 공백·code fence·placeholder 검사 | PASS | 행 끝 공백·미처리 표식 없음, fence 짝과 EOF 확인 |
| 의미 검토 | 수행 | preview 무쓰기, 병합/정리 효과 분리, same-SHA 재생성의 재삭제 금지, blocker 시점 대조 |
| VFY-PWC-01~12 | Not run yet | 구현·인수하지 않았음 |

검증 bundle은 이 파일 하나다. 외부 제안서의 canonical ID를 복제하지 않으며 계약/이력 링크로만 참조한다. 이 파일은 미승인 whole SDD와 downstream blocker를 포함하므로 일반 모드 검증을 적용한다. strict의 finalized executable bundle 조건을 충족했다고 주장하지 않는다.

## Completion or Closure Notes

구현·검증 완료 전이다. 이번 산출물은 이 SDD이며 source·시험·CI·기존 자료 migration·원격 PR/병합을 수행하지 않았다. 문서 branch/worktree는 미커밋 산출물 보존을 위해 유지한다.

후속 완료 기록에는 source commit, Phase별 VFY 증거, 양 OS 결과, legacy 전환/보류 항목, 구 실행 경로 제거 결과, 실제 PR/merge SHA와 path/ref 결과를 남긴다.

## Review Checklist

- [x] 현재 코드·영구 계약·사용자 의도·고정 원본을 구분했다.
- [x] 전면 교체와 유지할 보호, 종료 시점의 의도적 변경을 명시했다.
- [x] 정상·지연·유실·정리 실패·중복·경합·migration을 다뤘다.
- [x] 새 파일·명령을 현재 존재하는 것처럼 쓰지 않았다.
- [x] 요구사항과 Phase/Task·VFY를 연결했다.
- [x] 플랫폼 확인과 실제 사용자 전환의 blocker 시점을 구분했다.
- [x] source 삭제와 원장 전환, 단순 revert의 한계를 구분했다.
- [x] 이번 쓰기는 이 SDD로 제한했다.
- [x] 문서 검증과 구현·실제 OS 인수를 구분했다.
