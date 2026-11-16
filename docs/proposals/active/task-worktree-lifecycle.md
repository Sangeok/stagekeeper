---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-12"
approved-by: "requesting-user"
approved-at: "2026-11-12"
approval-scope: "Phase WTL 코드·테스트·규칙·CI 구현과 검증, 커밋·푸시 및 dev 대상 PR 생성. PR 병합, main 승격, 기존 사용자 worktree의 실제 정리는 제외한다."
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
  - "docs/proposals/completed/2026-11-12-local-branch-cleanup.md"
  - "docs/proposals/active/ci-os-coverage.md"
---

# 작업 worktree의 생성·종료·복구 관리

## Summary

독립적인 변경 작업마다 worktree를 사용하는 방식을 유지하면서, 생성과 종료를 저장소 관리 명령으로 묶는다. 공통 Git 디렉터리에 작업 식별자·소유자·경로·종료 의사를 기록하고, 작업자가 사용 종료와 결과 보존을 확인하면 자기 worktree를 제거한다. 종료 도중 중단된 작업은 현재 상태를 재검사해 이어가며, 종료 여부가 불명확한 작업은 보존하고 이유를 표시한다.

브랜치 삭제는 기존 `branches:cleanup`의 책임으로 유지한다. 이미 구현된 ancestry/merged-PR 두 경로와 공통 보호를 보존하고, squash/rebase 병합 증거만 읽기 전용 함수로 분리해 공유한다. 이 문서는 worktree 관리 기능의 단일 구현 계획이며 완료된 브랜치 정리 개선을 다시 구현하지 않는다. 후속 사용자 요청으로 Phase WTL 구현과 dev 대상 PR 생성이 승인됐다. 기존 사용자 자료 삭제, PR 병합 및 배포는 승인 범위에 포함하지 않는다.

## Goal

- 정상 종료한 작업의 worktree를 작업 주체가 마무리 과정에서 정리한다.
- 세션 종료 후 폴더 이름과 수정 시각으로 작업 상태를 추측하는 부담을 줄인다.
- 정리 중 중단·중복 호출·새 변경·경로 재사용을 구분하고 사용자 자료를 보존한다.
- worktree 제거 결과와 브랜치 정리 결과를 따로 보고한다.

## Proposal Size

`proposal-size`: standard. 작성 모드는 `PHASE_PLAN`, 위험 분류는 `HIGH-RISK`다.

사용자 파일을 포함하는 디렉터리 제거, 지속 기록, 중단 복구와 여러 세션의 동시 실행을 다룬다. 저장소의 Node ESM·`node:test`·Git을 사용하며 새 패키지·DB·상주 청소 프로세스는 도입하지 않는다.

## Current State

### 관찰 기준과 근거

- 기준 커밋: 2026-11-12에 원격 `main`·`dev`를 확인하고 fetch한 `origin/dev` `62e5898037e65b3145290a7bb5320d750f773615`.
- 문서 작성은 별도 `harness/task-worktree-lifecycle-plan-20261112` 브랜치에서 수행한다. 주 작업 폴더의 미추적 제안서 두 개와 다른 작업의 worktree는 보존한다.
- 시작 시 열린 PR은 #326(Windows 제품 테스트)과 #327(플러그인 스킬 책임 문서)였다. 목록은 시점 정보이며 구현 시작 시 다시 확인한다.
- 후속 정합성 대조에서는 #327이 병합됐고 원격 `dev`는 `296407f1badd611c2518cc71c9aac9015b6148a5`였다. 기준 커밋 이후 변경은 plugin 안내·protocol의 스킬 유지보수 절·해당 완료 제안서다. 이 계획이 사용하는 Git 정리 함수·명령·CI·파일 보존 계약은 동일함을 diff로 확인했다. 검증은 문서 checkout과 같은 `62e5898`의 별도 clean checkout에서 실행했다.
- 재검토 첫 기준은 #326 병합 후 `68f3d4974ac1cff4b07aafb3308ea053b7ba4962`였다. Windows 제품 시험과 8.3 경로 fixture 수정이 추가됐다.
- 검토 도중 #328·#331·#330이 병합돼 **현행 구현 기준을 `02747f288bb7e4dd1b6e2f97f3857b671b5189f2`로 갱신**했다. 작업 브랜치를 이 커밋으로 fast-forward하면서 미추적 제안서는 보존했다. 아래 현재 구현 표와 작업은 이 기준을 따른다. 앞선 기준 SHA와 검증 수치는 이력을 보존한 것이며 현재 구현 지시를 덮어쓰지 않는다.
- 적용할 현재 규칙은 [AGENTS.md](../../../AGENTS.md)와 [verification.md](../../architecture/verification.md#작업-브랜치-정리)다. 본문은 이를 변경할 제안이며 작성만으로 현재 규칙을 대체하지 않는다.

| 관찰한 구현·계약 | 현재 동작 | 이번 변경 |
| --- | --- | --- |
| `scripts/cleanup-task-branches.mjs:cleanupTaskBranches` | ancestor/merged-pr, worktrees/reasons/summary/aborted를 반환. 로컬 차단 대상도 보존을 진단하며 폴더는 제거하지 않음 | 공개 인자·두 판정 경로·진단 계약 유지. 반환값 전체를 위임 결과로 처리 |
| 같은 파일의 `inspectCompletion` | 열린 head/base PR을 먼저 검사. ancestor는 CI 없이 공통 보호를 적용하고 merged-pr에만 병합 증거·CI를 적용 | 현재 분기·검사 순서와 거부 사유 유지. 내부 병합 증거 판정만 읽기 전용 공개 함수로 분리 |
| 같은 파일의 `validateBranch`, NUL worktree parser | 두 명령이 같은 branch·목록 계약을 사용 | 실제 소비용 읽기 전용 export로 공유 |
| 같은 파일의 `command`, `isAncestor`, `headPulls`, `sameRepository` | status/failed 보존, ancestry 오류 구분, PR 구조 검사, GitHub 저장소 이름 대소문자 처리 구현됨 | 이미 만족. 그대로 재사용하고 중복 구현하지 않음 |
| `AGENTS.md`·`verification.md` | 소유자가 자기 worktree를 정상 종료하는 수동 절차가 이미 있음 | 보호 조건을 유지하면서 관리 대상의 명령·복구 절차 연결 |
| `CLAUDE.md` | `@AGENTS.md`만 포함 | 규칙을 중복 작성하지 않음 |
| `package.json` | `branches:cleanup`은 있으나 worktree 관리 명령은 없음 | `worktrees` 진입점 추가 |
| `.gitignore` | 의존성·빌드·생성 코드뿐 아니라 `.env*`, 비공개 템플릿도 제외 | ignored 여부만으로 폐기 가능하다고 판단하지 않음 |
| `plugin/runtime/local-session.mjs:gitRoot` | 공통 Git 디렉터리의 `harness/`에 실행기 상태 저장 | 별도 이름공간 사용. 실행기 잠금·서버 계약은 변경하지 않음 |
| `.github/workflows/check.yml` | `npm run check`의 도구 시험은 Ubuntu에서 실행 | 새 파일시스템 시험을 Windows·macOS에도 연결 |

기존 worktree 조사에서는 미추적 문서, 대량 삭제로 표시되는 파일, detached HEAD, clean checkout이 함께 관찰됐다. 현재 수량·나이·clean 여부는 작업 종료나 삭제 허가의 증거가 아니다. 명령이 만들어질 때의 실제 목록을 다시 조사한다.

### 기존 제안서와의 책임 경계

[브랜치 정리 완료 기록](../completed/2026-11-12-local-branch-cleanup.md)은 #328 구현과 #331 완료 정리의 이력이다. 현재 계약은 `AGENTS.md`·`verification.md`와 실제 스크립트가 소유한다. 주 작업 폴더에 남은 옛 미추적 초안을 현행 구현 기준으로 사용하지 않는다.

| 소유 문서 | 담당 계약 |
| --- | --- |
| 기존 브랜치 정리기와 현재 아키텍처 규칙 | 커밋 보존 두 경로, PR·CI 증거, 브랜치 삭제·진단 |
| 이 문서 | worktree 생성·작업 기록·사용 종료·폴더 제거·복구·기존 항목 확인 |
| 구현 후 `verification.md`·`AGENTS.md` | 실제 적용할 명령과 작업 절차 |

현재 worktree 종료 절차는 수동이다. 이 기능이 들어갈 때 관리 대상에는 새 명령을 적용하고, 미등록 대상에는 기존 보존·확인 절차를 유지하도록 연결한다. 브랜치 정리 스크립트가 worktree를 제거하지 않는다는 경계는 유지한다. 완료 제안서의 작업 기록·자동 제거 제외 문구는 당시 작업 범위이며 저장소 전체의 영구 금지가 아니다.

현재 문서의 관련 문단만 최신 병합본에 맞춰 조정한다. 완료 제안서는 읽기 전용 이력으로 보존하며 승인·요구사항·완료 상태를 바꾸지 않는다.

## Scope

포함 범위:

- 이 저장소 개발용 CLI 하나, 공통 Git 디렉터리의 최소 로컬 기록, 해당 테스트.
- 신규 작업 worktree 생성, 읽기 전용 목록, 명시적 종료, 미완료 종료 재시도.
- 생성 중단의 같은 작업 재진입과 worktree 인스턴스 표식, 기존 squash/rebase 보존 증거의 읽기 전용 재사용.
- 소유자에 의한 종료 취소와 비정상 종료 후 관리 명령 잠금의 제한적 복구.
- 실제 Git 연결·파일·커밋 보존 검사, 종료 후 기존 브랜치 정리기 연결.
- 작업 규칙, 명령 설명, Windows·macOS CI 검증 연결.

제외 범위:

- 기존 worktree의 자동 등록·일괄 제거, 경과 시간에 따른 삭제, 무조건적인 `prune`.
- 자동 commit·stash·reset·clean·push·PR 생성·병합·원격 ref 삭제.
- 브랜치 삭제 조건 완화, 보호 `main`·`dev` 변경, 새 작업의 임의 A 브랜치 기반 생성 허용.
- npm 설치·환경 파일 복사·DB·포트 할당, 범용 프로세스 관리자, 작업 간 자원 의존성 DB.
- 플러그인·서버·Next.js·제품 UI 변경, Stagekeeper 파이프라인 동시 실행 정책 변경.
- 다른 세션이나 일반 사용자의 파일 접근을 OS 수준에서 차단하는 보장.

## Proposal

### 요구사항과 불변식

#### REQ-WTL-001: 관리 대상 생성

WHEN 소유자가 유효한 신규 작업 생성을 요청하면, 도구 SHALL 보호 원격 존재와 최신 `origin/dev`를 확인하고 새 `harness/` 브랜치와 부가 worktree를 생성해 식별 가능한 기록을 남긴다. 기존 경로·브랜치·기록은 덮어쓰지 않는다.

#### REQ-WTL-002: 관찰과 보류 이유

WHEN 상태를 조회하면, 도구 SHALL 관리 기록과 실제 Git worktree 목록을 대조해 진행·종료 중·제거 완료·미등록·확인 불가 상태와 보류 이유를 반환하고 사용자 파일·Git ref·관리 기록을 변경하지 않는다.

#### REQ-WTL-003: 명시적 사용 종료

WHEN 소유자가 해당 작업의 사용 종료를 선언하면, 도구 SHALL 작업·경로·브랜치·HEAD·자료 보존을 확인한 후 종료 의사를 지속 기록하고 자기 부가 worktree만 제거한다. 확인되지 않은 조건이 있으면 제거하지 않는다.

#### REQ-WTL-004: 중단 복구

WHEN 종료 기록이 있는 작업을 재시도하면, 도구 SHALL 저장된 종료 대상과 현재 상태를 재검사하고 남은 단계만 수행한다. 종료 선언이 없는 작업을 나이·PID 사망·clean 상태로 완료 처리하지 않는다.

#### REQ-WTL-005: 변경·경합·재사용 보호

IF 검사에서 새 변경, 대상 정체성 불일치, 동시 명령, 잠금 또는 기록 오류가 발견되면, 도구 SHALL 해당 제거를 보류한다. 중복 호출은 다른 작업을 제거하거나 완료 상태를 이전 상태로 되돌리지 않는다.

#### REQ-WTL-006: 자료와 연결 보존

WHEN 제거를 준비하면, 도구 SHALL tracked·untracked·ignored 파일과 링크를 검사하고 명시된 재생성 산출물 외의 미보존 자료, 외부 사용 의존성 또는 불명확한 경로가 있으면 보존한다.

#### REQ-WTL-007: 브랜치 정리 분리

WHEN worktree 제거가 확인되면, 도구 SHALL 브랜치 정리를 기존 정리기의 공개 함수에 위임하고 폴더 제거와 브랜치 정리의 결과를 별도로 보고한다. 위임 시도를 먼저 기록하고, 응답 유실이나 이후 재진입에서 같은 과거 작업의 권한으로 브랜치 삭제를 반복하지 않는다. 브랜치 정리 실패로 이미 제거된 worktree를 자동 복원하지 않는다.

#### REQ-WTL-008: 미등록 항목과 도입

WHEN 관리 기록이 없는 기존 worktree를 발견하면, 도구 SHALL 미등록 상태로 표시하고 자동 등록·제거하지 않는다. 기존 자료는 소유권·사용 종료·자료 보존을 별도로 확인하는 절차를 따른다.

#### REQ-WTL-009: 종료 취소와 명령 잠금 복구

WHEN 소유자가 제거 전 종료를 취소하면, 도구 SHALL 실제 대상이 그대로 존재함을 확인하고 종료 근거를 폐기한 새 revision으로 작업을 active로 되돌린다. WHEN 비정상 종료의 명령 잠금을 복구하면, 도구 SHALL 확인한 잠금의 동일성과 명령·자식 프로세스의 사용 종료를 요구하고 불명확한 잠금을 보존한다.

#### INV-WTL-001: 보호 대상

로컬·원격 `main`·`dev`, 공통 Git 디렉터리, 주 worktree 및 미등록 worktree는 제거 대상이 아니다. 부가 worktree가 보호 브랜치로 바뀌었으면 제거를 거부한다.

#### INV-WTL-002: 작업 정체성

경로 문자열만으로 제거하지 않는다. 작업 ID·revision·canonical common Git·부가 worktree Git 디렉터리·실제 루트·브랜치·HEAD와 별도의 인스턴스 표식을 확인한다. 같은 경로·브랜치·HEAD와 Git 관리 경로도 재생성 시 재사용될 수 있다. 기록이나 표식이 없어지거나 손상되면 그 경로를 자유롭게 정리할 수 있는 것으로 간주하지 않는다.

#### INV-WTL-003: 분기와 사용 의존성의 구분

A에서 B가 분기했다는 사실만으로 A에 사용 의존성이 생기지는 않는다. B가 A의 경로·파일·서버를 사용하는 경우에는 A 폴더를 보존하고, B의 열린 PR이 A를 base로 쓰는 경우에는 기존 정리기가 A 브랜치를 보존한다.

#### CON-WTL-001: 도구와 배치

Node 22의 표준 모듈·Git·기존 `node:test`를 사용한다. 저장소 관리 도구는 `scripts/`에 둔다. 새 npm 패키지·상주 프로세스·DB·제품 코드 의존성을 추가하지 않는다.

#### CON-WTL-002: 권한과 보장의 범위

관리 명령은 소유자가 수행할 작업 종료 절차를 구현한다. 사용자·에이전트 세션의 상태를 Git만으로 증명하거나, 다른 프로세스를 임의 종료하거나, 외부 편집과의 완전한 원자성을 보장하지 않는다. 구현·실제 삭제는 그 작업에 부여된 권한 범위 안에서만 수행한다.

### 1. CLI와 호출 위치

신규 진입점은 `scripts/manage-task-worktrees.mjs`, npm 별칭은 `worktrees`로 제안한다. import 시 실행하지 않고 명시적 CLI 진입점에서만 부수효과를 수행한다. 아래 명령과 파일은 아직 존재하지 않는다.

| 동작 | 입력 | 효과 |
| --- | --- | --- |
| `create` | 신규: `--owner`, `--branch`, `--path`. 생성 복구: `--task`, `--owner`, `--expected-revision`, 선택적 `--confirm-created-by-task` | 신규 생성 또는 이미 기록된 creating 작업의 제한적 재진입 |
| `status` | 선택적 `--task` | 기록과 실제 worktree의 읽기 전용 대조 |
| `finish` | `--task`, `--owner`, `--expected-revision`, `--expected-head`, `--usage-ended` | 소유자의 종료 선언을 기록하고 제거 시도 |
| `retry` | 선택적 `--task` | closing의 제거와 removed/not-started의 최초 후속 위임만 재검사. active·미등록 항목과 이미 시도한 branch 정리는 관찰만 함 |
| `resume` | `--task`, `--owner`, `--expected-revision` | 제거 전 종료를 취소. 이후에는 새 finish 필요 |
| `recover-guard` | 기본은 조회. 적용 시 `--expected-nonce`, `--confirmed-quiescent` | 아래의 비정상 명령 잠금 복구만 수행 |

모든 명령은 `--root`로 명시한 **남겨 둘 제어 checkout**에서 실행한다. 생략하면 현재 저장소 루트를 사용한다. 제거할 worktree 안이나 그 하위 경로에서 `finish`·`retry`를 실행하면 `caller-inside-target`으로 거부한다. 에이전트는 명령 전에 제어 checkout으로 이동한다. 제어 checkout이 dirty라는 이유만으로 다른 관리 worktree의 상태 조회·종료를 막지 않는다. 후속 브랜치 정리기는 자기 dirty 보호 조건을 그대로 적용한다.

존재하는 control root·worktree root·common Git·부가 Git 디렉터리 및 Git이 반환한 경로는 `realpathSync.native`와 플랫폼의 `path` 연산으로 같은 물리 경로 형식에 맞춰 비교한다. Windows의 8.3 짧은 이름을 문자열 그대로 저장하거나 일반 `realpathSync` 결과와 Git의 긴 이름을 직접 비교하지 않는다. 아직 없는 생성 대상은 존재하는 부모의 native 실경로에 검증한 이름을 붙이고, 생성 후 실제 루트를 다시 확인한다. 제거 완료의 부재 판정은 존재 여부를 먼저 확인하며, 없는 경로를 realpath 오류라는 이유로 다른 저장소 경로에 대입하지 않는다. 이 정규화가 인스턴스 표식 검사나 symlink/junction 거부를 대신하지 않는다.

일반 실행에서는 `npm run worktrees -- status`처럼 호출하고, JSON 소비자는 npm banner를 제외하도록 `npm --silent run worktrees -- status` 또는 Node 진입점을 사용한다. 셸 문자열 조합 대신 argv로 Git을 실행하며 경로·이름을 옵션으로 재해석하지 않도록 검증한다.

task ID·instance ID·guard nonce는 `crypto.randomUUID()`로 발급한 UUID이고, 입력과 저장된 값 모두 UUID 형식을 검사한다. nonce 검증 전에 폐기 경로를 조합하지 않는다. revision은 양의 safe integer, HEAD는 full SHA다. owner는 비어 있지 않은 제한 길이 문자열이며 기록 값과 정확히 일치해야 한다. branch는 현재 정리기의 `harness/` 이름 규칙과 `git check-ref-format --branch`를 함께 통과해야 한다. 중복·알 수 없는 옵션, 옵션값 누락, 신규 생성 입력과 복구 입력의 혼합은 부수효과 전에 거부한다. `--help`는 저장소가 없어도 무쓰기 exit 0이다.

신규 `create`는 기존 규칙대로 최신 `origin/dev`에서만 새 독립 작업을 만든다. 일반적인 기존 브랜치 재사용·detached 생성·`--from A`는 제공하지 않는다. creating 복구는 새 독립 작업이 아니며 최초에 고정한 기준 SHA를 사용한다. A/B 사례는 실제 연결과 자료 보존의 판단 사례이며 새 분기 정책에 대한 승인이 아니다.

새 Git 실행 경계는 `GIT_NO_REPLACE_OBJECTS=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`과 command-local `core.fsmonitor=false`를 사용한다. 기계적인 생성·조회·제거 명령은 `core.hooksPath`를 관리 영역의 검증된 빈 디렉터리로 지정한다. 관리 영역이 아직 없는 읽기 전용 조회는 그 경로의 부재를 확인하고 사용하며 디렉터리를 생성하지 않는다. `git worktree add`의 post-checkout hook이 설치·다른 파일 변경을 실행할 수 있기 때문이다. 사용자 Git 설정 파일을 수정하지 않는다. 자식은 shell 없이 실행하고 제한 시간·출력 크기·종료 코드·signal을 보존한다. 취소 시 추가 명령을 보내지 않고 자기 Git 자식의 종료를 기다리며, 종료 확인이 실패하면 guard를 보존한다. Git 자식이 남았는데 `finally`만으로 잠금을 반납하지 않는다.

### 2. 기록과 잠금

기록 위치는 canonical common Git 아래 `stagekeeper-task-worktrees/`다. 작업 원장 `tasks/`, 폐기된 명령 잠금 `retired-guards/`, 비어 있어야 하는 `empty-hooks/`와 현재 `command.guard`만 소유한다. 플러그인의 `harness/`를 재사용하지 않는다. 제거 대상 밖에 있으므로 worktree 제거 뒤에도 기록이 남는다. `.gitignore`·제품 DB·플러그인 manifest 변경은 필요 없다.

별도로 각 **관리 부가 worktree의 실제 Git 디렉터리**에 `stagekeeper-task.json` 표식을 배타적으로 생성한다. 본문은 `{schemaVersion:1, taskId, instanceId}`이며 원장과 같은 UUID 두 개를 사용한다. Git의 `commondir`·HEAD·index를 수정하거나 다른 관리 파일을 덮어쓰지 않는다. Git이 해당 worktree를 제거하면 표식도 함께 제거된다. 표식이 없는 기존 worktree는 자동 등록하지 않는다.

작업별 `tasks/<UUID>.json`은 다음 정보를 소유한다.

- `schemaVersion: 1`, 임의의 고유 `taskId`·`instanceId`, `revision`, 소유자 식별 문자열.
- canonical common Git·경로·부가 Git 디렉터리의 식별 정보, 브랜치, 생성 기준 SHA. creating에서 아직 존재하지 않는 Git 디렉터리는 null.
- `creating | active | closing | removed` 상태, 생성·종료 요청·제거 완료 시각.
- closing인 경우 종료 HEAD·경로 정체성·파일 목록 지문과 사용 종료 선언.
- 마지막 보류 이유와 worktree/브랜치 각각의 결과. credential·환경 파일 내용은 기록하지 않는다.

저장 형식의 필드는 아래 계약으로 고정한다. 알 수 없는 상위 schemaVersion·누락·잘못된 타입·상태와 필드의 모순을 정상 상태로 기본값 처리하지 않는다.

| 필드 | 형식·의미 |
| --- | --- |
| `schemaVersion`, `taskId`, `instanceId`, `revision`, `owner` | 위 타입. UUID와 owner는 생성 후 불변, 성공한 상태 변경마다 revision 증가 |
| `commonGit`, `path`, `gitDir`, `branch`, `baseSha` | canonical 절대 경로, `harness/topic` 형태의 검증된 짧은 branch명, full SHA. Git ref가 필요하면 `refs/heads/`를 명시적으로 붙인다. `gitDir`만 creating에서 null 가능 |
| `state`, `createdAt`, `removedAt` | 상태 enum, UTC ISO 시각. removedAt은 removed에서만 non-null |
| `closing` | active/creating이면 null. closing/removed에서는 `{headSha, requestedAt, sourceRevision, fileFingerprint, preservation, usageEnded:true}` |
| `closing.preservation` | `{kind: remote-head | ancestor | merged-pr, headSha, devSha, checkedAt, pr?, mergeSha?}`. merged-pr에서만 pr·mergeSha 필수 |
| `removalStartedAt` | 첫 Git 제거 명령 전 저장. 아직 시도하지 않았다면 null. 시도했어도 최종 성공을 뜻하지 않음 |
| `branchCleanup` | `{state: not-started | attempted | finished, headSha, result}`. headSha는 closing 이전에는 null, 이후 종료 SHA. result는 finished에서만 기존 결과 또는 실패 코드 |
| `lastReasons` | 확인된 코드 배열. status는 이를 갱신하지 않고 현재 관찰 결과에 별도로 reasons를 반환 |

새로운 정상 기록은 creating/closing null/removalStartedAt null/branchCleanup not-started다. removed는 종료 스냅샷을 유지한다. creating을 active로 확정하려면 아래 생성 복구 검사와 표식이 필요하다. removed 기록의 같은 branch·SHA만으로 새로 생성된 ref의 소유권을 추정하지 않는다.

소유자 문자열과 UUID는 협력하는 작업 주체를 구분하는 값이며 인증 토큰이나 OS 보안 경계가 아니다. 비정상 스키마·더 새로운 스키마·링크로 바뀐 기록 파일은 덮어쓰지 않는다. 기록 디렉터리와 하위 경로도 링크가 아닌지 검사한다. 기록은 같은 디렉터리의 임시 정규 파일에 쓰고 flush 후 rename하며, 실패 시 마지막 유효 기록을 보존한다. 교체를 위해 기존 기록을 먼저 unlink하지 않는다. Windows 교체·중단 동작도 실제 fixture로 확인한다. 전원 손실까지 무조건 복원한다는 보장은 하지 않으며 불완전 기록은 unknown으로 보존한다.

변경 명령은 짧게 유지하는 저장소 공통 `command.guard` 디렉터리의 배타적 생성으로 직렬화한다. nonce·호스트·PID·명령·대상 작업을 기록하고, 자기 nonce가 여전히 일치할 때만 `finally`에서 해제한다. PID 재사용·권한 오류·불완전한 소유자 파일·다른 호스트의 기록은 자동 회수 근거가 아니다. 읽기 전용 status는 잠금을 기다리지 않고 guard의 held/abandoned/unknown 상태와 마지막 확정 작업 상태를 표시한다.

프로세스 강제 종료로 guard가 남으면 일반 retry는 `guard-recovery-required`로 보류한다. `recover-guard`의 조회 결과를 보고, 호출자와 Git 자식을 포함한 관련 명령이 모두 종료됐음을 작업 소유자가 확인한 뒤에만 정확한 nonce로 해제한다. 적용 시 같은 호스트·같은 nonce·기록된 PID 부재를 다시 검사하며 `EPERM`·살아 있는 PID·판단 불가는 거부한다.

해제는 `command.guard`를 같은 파일시스템의 `retired-guards/<nonce>`로 rename하는 방식이다. owner 파일이 있는 **비어 있지 않은** 폐기 디렉터리를 남겨 같은 nonce의 두 번째 rename이 successor guard를 옮기지 못하게 한다. 폐기 디렉터리를 삭제하거나 덮어쓰지 않는다. 이미 같은 nonce의 폐기 기록이 있으면 현재 command.guard를 건드리지 않고 이전 복구 결과를 반환한다. 다른 nonce·링크·손상된 대상이면 거부한다. 서로 다른 두 복구 호출과 새 일반 명령의 경합을 양 OS에서 검사한다. owner 파일 생성 전의 강제 종료처럼 nonce를 확인할 수 없는 빈 guard는 자동 복구 대상이 아니며, 모든 관리 명령과 자식의 사용 종료를 별도 확인하는 수동 유지보수 대상으로 보고한다.

복구 시 Git 자식 부재는 parent PID 사망만으로 증명되지 않는다. 기록된 명령과 실제 자식의 종료까지 확인하는 소유자 절차가 필요하다. 이 절차를 “모든 강제 종료가 사용자 개입 없이 자동 복구된다”는 보장으로 표현하지 않는다.

일반 명령의 동시성은 guard로 제어하되 raw Git·에디터·다른 도구를 잠그지는 못한다. 외부 쓰기는 소유자의 사용 종료 확인과 제거 직전 재검사로 다룬다. 검사 직후 발생한 비협력적 파일 쓰기까지 원자적으로 보호한다는 주장은 하지 않는다.

### 3. 생성과 상태 전이

| 기존 상태 | 사건 | 결과 |
| --- | --- | --- |
| 없음 | 유효한 create | `creating`을 먼저 기록하고 Git 생성 수행 |
| creating | 생성 성공·정체성 확인 | `active` |
| creating | 실패·중단 | 기록과 부분 결과 보존. 같은 task ID의 create 복구 또는 수동 보존 필요 표시 |
| active | finish 사전 검사 통과 | 종료 스냅샷을 저장한 `closing` |
| active | 종료 검사 거부 | active 유지, 이유 보고 |
| closing | 재검사·Git 제거·사후 확인 성공 | `removed` |
| closing | 변경·사용·파일·잠금 문제 | closing 유지, 제거 보류 |
| closing | 소유자의 resume, 원래 대상이 온전함 | revision 증가, 종료 스냅샷을 버린 active |
| closing | 중복 finish | 기존 closing을 사용한 재시도. 스냅샷·usage 선언을 새로 만들지 않음 |
| removed | 반복 finish/retry | 폴더에는 무쓰기. not-started인 최초 후속 위임만 조건부 수행하고 attempted/finished 삭제는 반복하지 않음 |

생성 전 경로의 기존 존재·다른 worktree와의 중첩·상위 디렉터리 링크·주 checkout 포함 여부를 검사한다. 대상의 부모 디렉터리는 이미 존재하는 정규 디렉터리여야 하며 임의 상위 폴더를 재귀 생성하지 않는다. 경로 별칭은 실경로로 정규화하되 정규화 실패를 우회하지 않는다. 보호 원격 확인과 fetch가 실패하면 생성하지 않는다. 신규 요청은 기존 경로나 브랜치를 접수하지 않으며, 사용자가 건드린 부분 결과를 자동 rollback하지 않는다.

생성이 중단된 creating은 자료를 자동 삭제하지 않는다. 신규 create는 다른 creating 기록의 예약 경로·branch와도 충돌하면 거부한다. 같은 작업의 복구 create는 owner·expected revision을 대조하고 최초 baseSha를 유지한다.

- path·Git 등록·branch가 모두 없으면 기록된 생성을 다시 실행한다.
- branch만 있고 정확한 baseSha이며 다른 checkout이 사용하지 않으면, `--confirm-created-by-task`를 받은 경우에만 그 branch로 등록된 경로를 생성한다. 확인 없이는 보류한다.
- 연결된 worktree가 존재하면 common Git·경로·branch·HEAD·원래 기준과 tracked/untracked clean 상태를 확인한다. 같은 인스턴스 표식이 있으면 active로 확정한다. 표식 작성 전 중단으로 표식이 없으면 `--confirm-created-by-task`로 해당 부분 생성의 출처를 확인한 뒤에만 배타적으로 표식을 만든다.
- 표식이 다른 작업을 가리키거나 checkout이 부분 생성·dirty·연결 불일치이면 보류한다. 자동 reset·checkout 덮어쓰기를 하지 않는다. 소유자는 남은 파일을 별도 보존한 뒤 해당 부분 생성을 직접 확인·복구하거나 별도 새 경로에서 작업을 시작한다.

이 경로는 이미 기록된 자기 creating 작업만 복구하며 임의 미등록 worktree를 접수하는 adopt가 아니다. 새 작업자가 old task ID를 재사용하거나 owner를 바꿀 수 없다.

### 4. 사용 종료와 자료 보존

`--usage-ended`는 호출자의 선언이다. 에이전트는 해당 경로에서 실행한 자기 서버·테스트·에이전트 작업을 끝내고, 다른 세션이 사용하는지 확인한 뒤 선언한다. Stagekeeper 실행기가 그 경로를 사용하면 기존 실행기 종료·상태 확인 절차를 먼저 따른다. 관리 도구가 임의 PID나 공통 실행기 잠금을 종료·해제하지 않는다.

관리 worktree 사이에서 다른 worktree의 `node_modules`, 환경 파일, 생성물, 실행 서버를 공유하는 구성을 기본 절차로 만들지 않는다. 이미 그런 사용이 있으면 소비자가 의존성을 해소하거나 종료할 때까지 제공하는 worktree를 보존한다. 종료 선언만으로 알려진 외부 사용을 무시할 수 없다. 모든 작업자는 closing 대상에 새 사용·자원 의존성을 만들지 않는다. 미등록 소비자까지 자동 탐지하는 기능은 제공하지 않는다.

제거 허용 검사는 다음 순서로 고정한다.

1. 소유자·task ID·expected revision·인스턴스 표식·실제 Git 연결·common Git·정규 경로를 대조한다. 주 worktree, 다른 저장소, 잠긴 worktree, 불완전 목록, 보호 브랜치는 거부한다. 없어진 표식의 재생성은 finish/retry에서 허용하지 않는다.
2. 대상의 브랜치와 `--expected-head`가 일치하는지 본다. merge·rebase 등 진행 중 Git 작업, submodule·중첩 저장소, sparse checkout, assume-unchanged·skip-worktree flag가 있으면 첫 버전에서는 거부한다. 숨겨진 변경을 clean으로 취급하지 않는다.
3. 전체 tracked·untracked 변경을 확인한다. staged·unstaged·untracked 자료가 있으면 `unpreserved-files`로 보류한다. 자동 commit·stash·clean을 수행하지 않는다.
4. ignored 항목도 링크를 따라가지 않고 조사한다. 아래 정책을 통과한 재생성 산출물만 폐기 가능하다. 파일 조회 오류·권한 문제는 unknown으로 보류한다.
5. 보호 원격 main/dev를 확인하고 dev를 fetch해 SHA를 고정한다. 보존 증거는 현재 HEAD와 origin의 같은 branch tip 일치(`remote-head`), 고정 dev의 조상(`ancestor`), 또는 기존 병합 PR 증거(`merged-pr`) 중 하나다. 마지막 경로는 squash/rebase 뒤 원격 작업 branch가 제거된 경우를 다룬다. 모든 경로에서 로컬 branch가 종료 HEAD를 그대로 가리켜야 한다. 조회 오류·ancestry 명령의 오류를 거짓/성공으로 축약하지 않는다. 로컬 branch는 이 단계에서 삭제하지 않는다. PR 병합 전에도 remote-head 증거와 사용 종료가 확인되면 폴더 제거는 가능하지만 branch 삭제는 기존 두 보존 경로와 공통 보호를 따른다. branch의 PR·CI 요구는 merged-pr 경로에만 있으며 ancestor 경로에 새로 요구하지 않는다.
6. 모든 검사가 통과한 뒤 종료 HEAD·연결 정체성과 파일 목록 지문을 closing에 기록한다. 지문은 상대 경로 순으로 정렬한 경로·종류·크기·mtimeNs/ctimeNs·링크 대상의 정규 JSON을 SHA-256으로 요약한다. bigint 값은 십진 문자열로 직렬화하고 atime은 제외한다. 파일 내용·비밀값은 저장하지 않는다. 이는 정상적인 재진입·파일 변경 탐지이며 공격자가 메타데이터를 위조하는 상황의 무결성 증명이 아니다.
7. 제거 직전에 실제 연결·branch·HEAD·변경·ignored 목록·지문을 다시 대조한다. 달라졌으면 보류하고 이전 종료 의사를 새 대상에 적용하지 않는다.
8. `removalStartedAt`을 저장한 뒤 정확한 등록 경로에 `git worktree remove`를 실행한다. 이 호출이 재생성 산출물을 포함한 폴더 삭제의 비가역 시작점이다. `--force`, `rm -rf`, 자동 unlock·prune으로 실패를 우회하지 않는다. 성공 후 경로와 Git 등록이 모두 사라졌는지 확인하고 removed를 기록한다. 오류여도 Git이 이미 일부 파일을 지웠을 수 있으므로 전부 보존됐다고 보고하지 않는다.

첫 버전의 재생성 산출물 허용 목록은 이 저장소의 `node_modules/`, `.next/`, `src/generated/`, `coverage/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`다. 실제로 ignored인 항목에만 적용하고 목록 밖은 보존한다. 산출물 루트 자체가 symlink/junction이거나 내부에 디렉터리 링크·중첩 Git 저장소가 있으면 보류한다. 일반 파일 symlink는 허용된 산출물 내부의 같은 루트 안 정규 파일만 가리키고 해당 OS 시험을 통과한 경우에만 허용한다.

`.env*`, `plugin/templates/`, 로그·보고서·개인 설정은 기본 폐기 대상이 아니다. 필요한 자료는 소유자가 원래 작업 범위에서 외부에 보존하고 확인한 뒤 다시 종료한다. 자동 비밀파일 복사나 모든 ignored 항목의 일괄 삭제 기능은 추가하지 않는다. macOS Git 2.50.1의 실제 fixture에서 ignored 산출물과 내부 file symlink가 있는 worktree의 force 없는 제거를 확인했다. Windows 및 구현된 검사기의 정상·거부 경로는 별도 인수로 남는다.

`merged-pr` 증거는 `scripts/cleanup-task-branches.mjs`에 신규 읽기 전용 export `inspectMergedTaskBranch({cwd, branch, sha, devSha, github})`로 분리한다. full SHA·branch·저장소를 검증하고 같은 저장소/dev 대상의 유일한 병합 PR, 정확한 PR head SHA, merge SHA의 고정 dev 포함을 판정한다. 반환은 `{kind:'merged-pr', pr, headSha, mergeSha, devSha}` 또는 `{kind:'unverified', reason}`이다. ref 삭제·fetch·CI/열린 의존 PR 정책 판정을 수행하지 않는다. 원격 관계 확인과 fetch는 호출자가 담당한다.

현재 `inspectCompletion`의 head/dependent PR 검사와 ancestor 조기 반환은 유지한다. 그 뒤 merged-pr 분기의 유일한 PR 선택·정확한 head·merge ancestry 판정만 내부 공통 함수로 분리해 신규 export와 공유한다. 기존 dependent 사유 누적, merged-pr 경로의 CI, 호출자의 원격 재검사·CAS 삭제·부분 중단은 순서와 조건을 보존한다. worktree 제거에서는 병합 증거만 사용하므로 B의 열린 PR이 A를 base로 쓰더라도 폴더 제거와 branch 보존을 분리할 수 있다. 이 변경은 기존 삭제 판정의 완화나 ancestry 기능의 재구현이 아니다.

현재 `command`의 status/failed와 `isAncestor`의 0/1/실행 실패 구분을 재사용한다. `headPulls`·`sameRepository`의 PR 구조와 GitHub 저장소 이름 판정도 유지하고 branch명·SHA는 정확히 대조한다. 새 export에 필요한 merge 증거 필드를 검증하되 잘못된 응답을 빈 목록으로 축약하지 않는다. 이미 구현된 helper를 새 이름으로 복제하거나 반환 의미를 바꾸지 않는다.

### 5. 재시도와 종료 취소

작업 시작 시 status로 전체 상황을 보고 retry로 closing 및 제거 완료 뒤 최초 위임이 남은 작업만 재확인한다. 새 종료 승인을 만들거나 다른 작업의 active 상태를 변경하지 않는다. guard가 남았으면 위 복구 절차를 먼저 적용한다.

- 대상이 같은 identity·HEAD·파일 지문이면 보존 조건을 새로 조회하고 제거를 재시도한다. 이전 원격 조회 결과를 영구적인 삭제 허가로 쓰지 않는다.
- 삭제는 끝났지만 removed 기록 전에 중단됐다면 경로와 기존 Git 등록이 **모두** 없는지 확인해 removed를 기록한다.
- 경로가 다른 작업에 재사용됐거나 표식이 없어졌으면 identity-changed로 보류한다. path/Git 등록 중 하나만 남았거나 제거 시도 후 파일 지문이 달라졌으면 partial-removal로 보류한다. 남은 폴더를 재귀 삭제하지 않는다.
- partial-removal은 자동 resume 대상이 아니다. 소유자가 잔존 파일을 worktree 밖에 보존하고, 기록한 HEAD의 보존 증거와 현재 연결을 다시 확인한다. 필요하면 남아 있는 local branch/보존 commit에서 **다른 새 경로**로 복구하고 잔존 자료를 대조한다. 기존 폴더를 reset·restore로 덮어쓰지 않는다. 기존 잔여 폴더와 Git 등록의 정리는 별도 확인 작업이며 CLI가 force·prune으로 대신하지 않는다.
- closing 상태에서 다시 편집하려면 소유자가 resume으로 종료를 먼저 취소한다. 제거가 시작됐더라도 원래 인스턴스·tracked 상태·파일 지문이 완전히 같다는 확인이 있어야 취소할 수 있고, 불명확하면 partial-removal로 보류한다. 성공 시 closing·removalStartedAt을 null로, branchCleanup을 not-started/headSha null/result null로 초기화하고 revision을 증가시킨다. 이미 removed인 작업은 resume할 수 없다. 뒤늦은 finish/retry는 revision을 새로 확인하며 이전 종료 의사를 재생성하지 않는다.
- removed 기록은 작은 완료 기록으로 남긴다. 나이 기준으로 삭제하지 않는다. 같은 이름·SHA의 branch도 외부에서 재생성될 수 있으므로 과거 removed 기록을 반복 삭제 권한으로 쓰지 않는다. 이후 branch 정리는 기존 독립 `branches:cleanup` 절차가 현재 상태를 다시 판정한다.

### 6. A/B 사례와 브랜치 정리

| 상황 | A 폴더 | A 브랜치 |
| --- | --- | --- |
| B가 A의 커밋에서 분기했지만 자기 폴더·자원을 사용 | A의 종료·보존 조건이 충족되면 제거 가능 | 기존 정리 조건에 따라 판단 |
| B가 A의 파일·의존성·서버를 사용 | 사용 의존성이 해소될 때까지 보존 | 폴더 연결 등 기존 보호 조건 적용 |
| B의 열린 PR이 A를 base로 사용 | 파일 사용 의존성이 없고 나머지 조건이 충족되면 제거 가능 | 기존 `dependent-pr`로 보류 |
| B라는 폴더가 별도 브랜치가 아니라 A를 checkout | B는 이 작업의 제거 대상이 아님 | checkout 보호로 보존 |
| A가 공통 Git을 가진 주 worktree | 항상 제거 대상에서 제외 | 안전한 branch 전환과 브랜치 정리는 별도 기존 절차 |
| B의 사용 여부를 확인할 수 없음 | 보존·이유 보고 | 독립적으로 기존 검사 적용 |

worktree의 생성 기준 SHA는 출처 정보이며 부모 worktree가 반드시 살아 있어야 한다는 lease가 아니다. 실제 파일 사용 의존성을 분기 이력으로 추정하거나, B가 active라는 이유만으로 무조건 A를 삭제 가능하다고 판단하지 않는다.

제거 후 `cleanupTaskBranches({ cwd: controlRoot, apply: true, branches: [record.branch] })`를 한 번 위임한다. 기존 공개 함수의 인자·삭제 조건은 변경하지 않는다. 호출 전 기록의 branch·HEAD와 현재 ref를 대조하고 다른 관리 task가 같은 branch를 사용하면 보류한다. 이미 없는 ref는 missing으로 보고한다. 호출 직전 branchCleanup을 attempted로 저장하고 종료 후 finished와 실제 결과를 저장한다.

현재 반환값 `{apply, results, summary, aborted}` 전체를 `branchCleanup.result`에 보존한다. `aborted:true` 또는 호출 예외는 단순한 대상별 skipped와 다르다. wrapper도 aborted:true/exit 1로 나머지 batch 변경을 중단하고 이미 완료한 worktree 제거와 branch 결과는 유지한다. `results`의 `reasons` 전체를 읽으며 첫 reason이 dirty라는 이유로 그 뒤의 검사 실패나 전역 중단을 숨기지 않는다. 반환 형식·대상 branch·행 수·summary를 확인할 수 없으면 unverified로 보류한다.

attempted 상태에서 중단되면 호출했는지·삭제됐는지 단정하지 않고 branch 결과를 unverified로 보고한다. 같은 이름·SHA의 ref 재생성까지 원자적으로 구별할 수 없으므로 과거 작업의 retry에서 위임을 다시 실행하지 않는다. not-started 상태에서 중단된 경우에는 동일 branch·SHA와 다른 task의 사용 여부를 다시 확인한 뒤 최초 위임을 수행할 수 있다. raw Git과 기존 정리기까지 새 guard로 잠근다는 보장은 하지 않는다.

기존 스크립트가 제어 checkout의 dirty 상태로 branch를 남겨도 worktree 제거 완료는 유효하다. 예상 출력 예는 `worktree: removed`, `branch: skipped`, `reason: working-tree-dirty`다. 이는 새 도구의 관측된 실행 결과가 아니다. 예외·API 실패·skipped 등 기존 결과와 폴더 제거 결과를 따로 유지한다. 이후 다시 branch를 정리하려면 기존 독립 명령을 사용한다.

### 7. 출력과 종료 코드

stdout은 `{schemaVersion:1, operation, results, aborted, guard?, error?}`인 JSON 한 개다. guard는 잠금 조회 결과이고 error는 대상 식별 전 또는 공통 실패 코드다. 각 결과는 `{taskId, path, owner, branchName, state, revision, headSha, reasons, lastReasons, worktree, branch}`를 갖는다. owner·branchName은 관리 기록이 없으면 null이다. lastReasons는 마지막 승인된 검사 보류 기록이고 reasons는 현재 관찰 결과다. finish의 잘못된 owner/revision/HEAD 입력은 기록을 바꾸지 않으며, 승인된 검사 보류는 lastReasons와 revision을 갱신한다. 미등록/파싱 불가 항목의 taskId·revision·HEAD는 null이며, state는 persisted enum 외에 unmanaged/unknown을 관찰값으로 허용한다. `worktree`는 retained/removed/already-removed/unknown, `branch`는 `{status: not-requested | missing | deleted | skipped | unverified, reason?:string, reasons:string[], details?:object}`이다. 실제 위임 결과가 있으면 details에 기존 정리기의 전체 검증된 반환값을 넣어 preservation/worktrees/summary/aborted를 보존한다. 불명확한 상태는 unknown으로 표시하고 raw 오류·환경 변수·credential은 출력하지 않는다. 파싱 가능한 입력 단계의 거부도 같은 envelope를 사용하며 CLI 사용법은 stderr로 출력한다.

관찰할 수 없는 path도 null이다. 작업을 식별하기 전의 입력 오류는 빈 results와 aborted:true를 반환한다. 기존 branch 결과의 `skipped/branch-missing`은 missing으로, aborted·전체 reasons 중 검사 실패·조회 실패·부분 응답은 unverified로 우선 매핑한다. 정책에 의한 open-pr·dependent-pr·dirty 등의 보류만 있으면 skipped다. status는 과거 실패 기록을 관찰했다는 이유만으로 실패하지 않으며, 현재 조회 자체가 불가능한 경우에만 exit 1이다.

- exit 0: 요청 동작 성공 또는 이미 끝난 작업에 대한 무해한 반복. status가 미등록 항목을 정상적으로 관찰한 것도 성공이다. `--help`는 JSON 예외인 사용법 출력이다.
- exit 2: 입력 오류, 소유권·보존·잠금·상태 조건으로 요청한 작업을 보류. 제거 후 branch만 skipped인 경우에도 결과 JSON은 worktree removed를 유지하면서 exit 2다.
- exit 1: Git·파일 I/O·기록 파싱 등의 실행 실패 또는 판단 불가. 한 작업의 자료를 일부 제거한 뒤 실패했다면 부분 결과를 반드시 남긴다.

batch retry는 항목별 결과를 보존한다. 저장소 공통 정체성·기록 디렉터리·guard 검사 실패면 나머지 변경을 중단한다. 대상 하나의 dirty 상태는 다른 검증된 closing 작업의 검사를 막지 않는다. 최종 종료 코드는 1, 2, 0 순으로 우선하며 성공 항목을 rollback하지 않는다.

## Affected Files

| 경로 | 작업 | 이유·리스크 |
| --- | --- | --- |
| `scripts/manage-task-worktrees.mjs` | 신규 | CLI·원장·인스턴스 표식·Git 검사·종료·복구의 단일 소유자. high: 파일 제거 |
| `scripts/manage-task-worktrees.test.mjs` | 신규 | 실제 Git·파일·child process 기반 계약 검증. high |
| `scripts/cleanup-task-branches.mjs` | 내부 병합 증거 분리·읽기 전용 export 추가 | 기존 삭제 조건·기존 공개 API를 보존하며 squash/rebase 증거 재사용 |
| `scripts/cleanup-task-branches.test.mjs` | 수정 | 증거 조회와 실제 삭제 조건이 분리돼도 기존 보호가 유지되는지 검증 |
| `package.json` | 수정 | `worktrees` 명령만 추가. 기존 테스트 glob은 신규 시험 발견 가능 |
| `AGENTS.md` | 수정 | 생성·종료·재시도·사용 종료 선언·보류 보고 규칙. 다른 작업·승격 지침 보존 |
| `docs/architecture/test-organization.md` | 수정 | 임시 경로 준비를 `realpathSync.native(tmpdir())`로 명확히 하고 Windows 8.3 경로 근거 추가. 시험 배치·소유권 규칙은 유지 |
| `docs/architecture/verification.md` | 수정 | 새 명령·guard 복구·자료 정책·CI 행. Windows junction 경고 유지 |
| `.github/workflows/check.yml` | 수정 | worktree·브랜치 정리 두 시험을 실행하는 Windows·macOS matrix job 추가 |
| `docs/proposals/completed/2026-11-12-local-branch-cleanup.md` | 읽기 전용 | 구현·승인 이력. 관계 설명은 현재 아키텍처 문서와 이 제안서에만 반영 |
| 이 제안서 | 검증·완료 기록 갱신 | 요구사항·결과의 단일 기록 |

기존 `cleanupTaskBranches` 공개 계약과 삭제 조건, `CLAUDE.md`, `.gitignore`, 앱·plugin·DB는 유지 대상이다. 앞선 정합성 검토는 이 제안서만 수정했다. 승인된 구현에서는 위 구현 파일을 함께 수정하며 완료된 기존 제안서는 보존한다.

## Safety Analysis

- 적용되는 위험 경계는 로컬 파일·Git ref·관리 상태와 concurrent process다. 앱 라우팅·브라우저 자산·barrel·제품 타입·서버 API·DB에는 변경이 없다.
- 새 CLI import는 무실행이고 제품 런타임에서 import하지 않는다. 기존 브랜치 정리의 공개 함수 외에 플러그인 내부 실행기 코드를 재사용하지 않는다.
- 관리 원장은 공통 Git 아래 독립 이름공간에 두고 인스턴스 표식은 자기 부가 Git 디렉터리에 둔다. 출시 플러그인의 잠금 경로·schema·reader 동작을 바꾸지 않는다.
- 소유권은 협력 절차다. 다른 사용자·도구의 악의적 파일 조작을 방어하는 sandbox나 OS 접근 제어가 아니다.
- 기록에 종료가 없거나 guard가 불명확하면 보존한다. 강제 종료에서 자동 복구할 수 있는 범위와 소유자 확인이 필요한 범위를 구분한다.
- Windows junction·경로 별칭·파일 교체·Git 종료 실패는 실제 OS fixture의 제거 결과와 외부 canary 보존으로 검증한다. Linux PASS를 대신 사용하지 않는다.
- 복구의 기본은 삭제를 멈추고 남은 자료를 보존하는 것이다. 코드 revert는 제거한 ignored 자료를 복원하지 못한다.

## Approval

후속 사용자 요청은 이 제안서에 따른 실제 코드 수정과 dev 대상 PR 생성이다. 해당 구현 승인을 front matter에 기록한다. 구현 시 관리 대상 자기 worktree의 정상 종료를 작업 권한에 포함하고, 정리 명령이 추가적인 commit·push·병합 권한을 만들지 않도록 한다. 기존 미등록 자료의 실제 정리는 대상과 사용 종료를 확인한 별도 작업으로 수행한다.

## Execution Plan

### Phase WTL: worktree 관리 명령과 작업 절차 도입

- satisfies: REQ-WTL-001, REQ-WTL-002, REQ-WTL-003, REQ-WTL-004, REQ-WTL-005, REQ-WTL-006, REQ-WTL-007, REQ-WTL-008, REQ-WTL-009
- preserves: INV-WTL-001, INV-WTL-002, INV-WTL-003
- governed-by: CON-WTL-001, CON-WTL-002
- verified-by: VFY-WTL-01, VFY-WTL-02, VFY-WTL-03, VFY-WTL-04, VFY-WTL-05, VFY-WTL-06

진입 시 최신 `dev`·열린 PR·이 제안서·브랜치 정리 완료 기록·아키텍처 규칙을 다시 확인한다. 이미 적용된 브랜치 판정·진단·정상 종료 규칙을 재구현하지 않는다. 아래 OS·중단 검증이 끝날 때까지 실제 사용자 worktree에 새 제거 기능을 적용하지 않는다. 현재 규칙과 구현을 같은 변경으로 제출하며 부분 구현만으로 정상 종료 절차를 교체하지 않는다.

#### TASK-WTL-01: 상태 관찰·기록·생성 경계 구현

- satisfies: REQ-WTL-001, REQ-WTL-002, REQ-WTL-005, REQ-WTL-008
- verified-by: VFY-WTL-01, VFY-WTL-02, VFY-WTL-05

새 관리 스크립트와 짝 테스트에 인자 파싱·명시된 schema·native 실경로 대조·원자적 기록·인스턴스 표식·guard·create/status를 구현한다. Git 목록은 NUL 구분을 사용하고 `locked <reason>`·`prunable <reason>`·공백/개행 경로를 처리한다. Windows의 짧은/긴 경로와 Git 출력도 같은 native 형식으로 대조하며 다른 저장소 상위 경로의 상태를 재사용하지 않는다. Git hook/fsmonitor·optional index write를 명령 범위에서 억제한다. 기록 없는 항목은 관찰만 하고 creating의 같은 작업 재진입은 별도 입력으로 처리한다.

#### TASK-WTL-02: 보존 검사와 정상 종료 구현

- satisfies: REQ-WTL-003, REQ-WTL-005, REQ-WTL-006
- verified-by: VFY-WTL-02, VFY-WTL-03, VFY-WTL-05

finish의 owner/revision/HEAD/usage 선언, Git 작업 중 상태·숨김 flag·tracked/untracked/ignored 검사, 재생성 목록·링크 경계를 구현한다. 기존 정리기에서 읽기 전용 `inspectMergedTaskBranch`를 분리해 보존 증거 세 경로를 완성한다. 현재 ancestor 경로와 merged-pr의 CI 경계를 유지하고 local/open-PR/dependent-PR/원격/CAS/aborted 보호를 보존한다. 제거 시작점을 기록하고 마지막 재검사를 통과한 부가 worktree만 Git으로 제거한다. 중복 finish는 스냅샷을 새로 만들지 않는다.

#### TASK-WTL-03: 재시도·종료 취소·비정상 잠금 복구 구현

- satisfies: REQ-WTL-002, REQ-WTL-004, REQ-WTL-005, REQ-WTL-009
- verified-by: VFY-WTL-01, VFY-WTL-04, VFY-WTL-05

retry는 기존 closing 스냅샷만 소비한다. resume은 온전한 인스턴스의 종료만 취소하고 revision을 증가시킨다. 제거가 부분 진행됐다면 잔여 자료 보존·다른 경로 복구의 수동 절차로 연결한다. guard 복구는 quiescence·nonce 검사 후 비어 있지 않은 폐기 디렉터리로 rename하며 successor를 건드리지 않는다. 모든 Git 자식의 종료 확인과 부분 실패를 JSON·종료 코드에 반영한다.

#### TASK-WTL-04: 기존 브랜치 정리 연결과 에이전트 규칙 반영

- satisfies: REQ-WTL-003, REQ-WTL-007, REQ-WTL-008, REQ-WTL-009
- verified-by: VFY-WTL-03, VFY-WTL-04, VFY-WTL-06

worktree 제거 이후에만 기존 브랜치 정리 함수를 정확한 대상 하나로 한 번 위임하고 attempted/finished 기록으로 응답 유실을 구분한다. 반환값의 summary/reasons/aborted를 보존하고 전역 중단을 wrapper batch에 전파한다. `package.json`과 `AGENTS.md`에 시작 status/retry, 최신 dev의 신규 생성, 제어 checkout으로 이동한 finish, resume·creating·guard 복구 조건을 연결한다. 순수 조회 작업에 불필요한 worktree 생성을 강제하지 않는다. 현재 아키텍처 문서에 관계를 설명하고 완료 제안서는 수정하지 않는다.

`AGENTS.md`와 `verification.md`의 소유자 정상 종료 허용 및 다른 작업·dirty·사용 종료 불명 대상 보호는 이미 구현됐다. 이를 다시 허용하는 작업으로 쓰지 않고 관리 대상에 새 명령을 연결한다. branch 정리를 위한 강제 제거 금지, ancestor/merged-pr 두 보존 경로, 공통 PR·원격 보호와 merged-pr의 CI 조건을 유지한다. 문서·코드·검증이 함께 반영되기 전에는 관리 명령 절차를 적용하지 않는다.

`test-organization.md`의 임시 경로 준비 표현은 native API와 Windows 짧은 경로 근거로 보완한다. 이 작업의 두 테스트 fixture와 CLI 시험의 cwd도 같은 방식으로 준비하되, 무관한 테스트를 일괄 수정하거나 배치를 바꾸지 않는다.

#### TASK-WTL-05: 양 OS 검증과 적용 준비

- satisfies: REQ-WTL-001, REQ-WTL-002, REQ-WTL-003, REQ-WTL-004, REQ-WTL-005, REQ-WTL-006, REQ-WTL-007, REQ-WTL-008, REQ-WTL-009
- verified-by: VFY-WTL-01, VFY-WTL-02, VFY-WTL-03, VFY-WTL-04, VFY-WTL-05, VFY-WTL-06

`check.yml`에 `task-worktrees` job을 추가하고 `windows-2022`·`macos-15` matrix에서 아래 두 명령을 **서로 다른 필수 step**으로 실행한다. 각 step의 nonzero exit를 그대로 job 실패로 전달한다. Node 22·함께 준비한 npm·Git만 사용하고 새 패키지를 설치하지 않는다. npm의 실행 환경은 기존 npm-silent 시험이 읽는 npm_execpath도 제공한다.

```sh
npm exec --call "node --test scripts/manage-task-worktrees.test.mjs"
npm exec --call "node --test scripts/cleanup-task-branches.test.mjs"
```

두 경로를 한 node --test 호출에 합치지 않는다. 이번 Node 22 기준 시험에서는 신규 파일이 없더라도 기존 파일을 함께 지정하면 기존 시험만 실행하고 exit 0이 나왔다. 파일별 필수 step으로 새 시험의 부재를 실패로 만든다. Ubuntu의 기존 `npm run check`도 두 파일을 발견한다. CI 표에는 Windows/macOS를 `check/task-worktrees`, Linux를 `check/check`로 적는 OS별 행을 추가하고 확인 문자열은 양 OS job이 실행하는 두 테스트 경로로 지정한다. 새 job의 checkout/setup-node는 기존 action 판을 따르고 읽기 전용 권한만 사용한다. #326으로 통합된 Windows 제품 시험과 현재 CI 표를 보존한다.

## Verification Plan

새 테스트는 [test-writing.md](../../architecture/test-writing.md)와 [test-organization.md](../../architecture/test-organization.md)를 따른다. 실제 임시 Git 저장소·bare origin·worktree·파일·child process를 사용하고, GitHub 응답만 기존 브랜치 정리기의 주입 경계로 대체한다. 임시 경로는 `realpathSync.native(tmpdir())` 아래에 두고 Git이 반환한 root도 같은 방식으로 정규화한다. 이는 기존 격리 임시 경로 원칙을 유지하면서 Windows 8.3 이름을 처리하기 위한 구체화다. 개인 Git 설정·hook·credential과 실제 사용자 자료를 fixture에 사용하지 않는다.

### VFY-WTL-01: 기록·관찰·생성의 부수효과 경계

- verifies: REQ-WTL-001, REQ-WTL-002, REQ-WTL-005, REQ-WTL-008, REQ-WTL-009
- 상태: 구현됨. 실제 실행 범위는 아래 구현 검증 기록을 따른다. 목적지: 신규 `scripts/manage-task-worktrees.test.mjs`.

정상 생성, 기존 branch/path 거부, main/dev·주 worktree 거부, 잘못된 common Git, 경로 별칭·중첩·미등록·손상/새 schema를 검사한다. status 전후 파일·ref·기록을 비교해 무쓰기를 확인한다. 원격 확인 실패에서 생성이 없는지, creating 단계 중단에서 기존 파일을 지우지 않는지 검사한다. 동시 명령은 같은 작업을 중복 생성하지 않고 guard-held로 보류해야 한다. 명령 guard 복구 조회도 무쓰기여야 한다.

같은 입력 재제출과 서로 다른 두 작업의 같은 path/branch 생성 경쟁을 별도로 검사한다. creating의 branch만 존재/연결 완료/표식 전 중단/다른 표식/dirty 부분 checkout을 각각 확인한다. 기존 원장과 표식 JSON의 상태별 필수·null·타입 계약을 parser로 검사한다. post-checkout·fsmonitor canary와 Git index bytes도 관찰해 새 관리 Git 호출의 억제 경계를 확인한다.

### VFY-WTL-02: 자료와 경로 보존 대조군

- verifies: REQ-WTL-001, REQ-WTL-003, REQ-WTL-005, REQ-WTL-006
- 상태: 구현됨. 실제 실행 범위는 아래 구현 검증 기록을 따른다. 목적지: 같은 신규 테스트.

staged·unstaged·untracked·ignored `.env`·보고서·템플릿, 진행 중 Git 작업, hidden index flag, sparse checkout, nested repository를 각각 남기고 종료가 거부되며 canary bytes가 보존되는지 확인한다. 반대로 허용된 재생성 산출물만 있는 fixture는 force 없이 제거되어야 한다. 다른 작업에서 사용하는 자원을 소유자가 아직 종료하지 않은 사례는 usage 선언 없이 거부한다. 이것을 일반 프로세스 사용 자동 탐지 시험이라고 부르지 않는다.

### VFY-WTL-03: 정상 종료·A/B·브랜치 후속 결과

- verifies: REQ-WTL-003, REQ-WTL-006, REQ-WTL-007, REQ-WTL-008
- 상태: 구현됨. 실제 실행 범위는 아래 구현 검증 기록을 따른다. 목적지: 같은 신규 테스트.

보존된 커밋의 관리 worktree를 종료하고 폴더·Git 등록 제거와 완료 기록을 확인한다. B가 A에서 분기해 독립 작업하는 fixture에서 A 제거 후 B의 파일·HEAD·작업 가능성을 검사한다. B가 A를 PR base로 쓰면 worktree 제거와 `dependent-pr` 보류를 별도로 확인한다. A의 자원을 사용하는 B, A 브랜치를 checkout한 다른 폴더, 공통 Git이 있는 주 worktree는 각각 해당 보호 경계로 검증한다. 제어 checkout dirty·GitHub 오류·브랜치 부재·ref 이름 재사용에서도 worktree 결과가 사라지지 않아야 한다. 분기한 B fixture는 일반 create가 A 기반 생성을 허용한다는 증거가 아니다.

remote-head·ancestor·squash/rebase merged-pr를 모두 양성 대조한다. 원격 작업 branch가 없고 원래 HEAD가 dev의 조상이 아닌 fixture에서도 정확한 병합 증거로 worktree를 종료할 수 있어야 한다. 기존 정리기 짝 테스트에서는 새 export의 무쓰기와 기존 PR·CI·dependent-PR·ref-CAS 거부를 함께 검사한다. 잘못된 저장소·head SHA·merge SHA·복수 매칭·Git/API 오류는 증거로 사용하지 않는다.

기존 ancestor 삭제 경로가 PR·CI를 새로 요구하지 않는 양성 사례와, 두 경로의 열린/dependent PR·원격 재사용·로컬 보호를 대조한다. 위임 결과가 aborted이거나 reasons에 정책 사유와 검사 실패가 함께 있으면 wrapper가 완료한 폴더 제거를 보존하면서 나머지 batch를 중단하는지도 확인한다. 새 export를 추가한 뒤에도 기존 summary 집계와 aborted의 부분 결과를 보존해야 한다.

### VFY-WTL-04: 실제 중단·재실행·종료 취소

- verifies: REQ-WTL-002, REQ-WTL-004, REQ-WTL-005, REQ-WTL-007, REQ-WTL-009
- 상태: 구현됨. 실제 실행 범위는 아래 구현 검증 기록을 따른다. 목적지: 같은 신규 테스트와 실제 CLI child process.

종료 기록 후 제거 전, Git 제거 후 완료 기록 전, removed 기록 후 브랜치 정리 전의 중단을 실제 child process로 재현한다. guard가 남은 강제 종료는 먼저 보류되고, fixture의 모든 명령·Git 자식 종료 확인과 정확한 nonce 복구 후 재시도가 이어지는지 확인한다. 살아 있는 PID·다른 호스트·불완전 guard·nonce 변경에서는 해제하지 않는다. 정상 종료의 finally 이후 재시도에는 추가 확인이 필요 없어야 한다.

두 finish 호출, finish와 resume, 오래된 retry와 새 revision, 경로 재사용, 종료 후 새 파일, 폴더만/등록만 남은 경우를 검사한다. 보호 파일을 제거하지 않고 stale 결과로 완료 기록을 덮어쓰지 않는지 본다. 외부 변경은 명시한 재검사 지점에 삽입하며 모든 OS 프로세스와 파일 접근을 원자적으로 가둔 것으로 해석하지 않는다.

같은 path·gitDir·branch·HEAD의 재생성에서도 표식 불일치로 거부해야 한다. 두 recover 호출과 successor 명령 사이를 동기화해 비어 있지 않은 폐기 기록이 successor guard를 보호하는지 검사한다. 경로 순회 문자열·잘못된 UUID nonce는 파일 접근 전에 거부한다. parent 종료 후 살아 있는 Git 자식, owner 파일 없는 guard, partial remove 뒤 resume 거부와 수동 복구 안내도 포함한다. resume 뒤 종료·제거 시작·branch 위임 필드가 초기화되고 새 revision의 finish만 허용되는지 확인한다. branchCleanup attempted 직전·직후와 결과 저장 전 중단을 구분하고, 이후 같은 SHA의 ref가 재생성돼도 과거 작업의 재시도가 삭제 호출을 반복하지 않아야 한다.

### VFY-WTL-05: Windows·macOS 파일시스템 인수

- verifies: REQ-WTL-001, REQ-WTL-002, REQ-WTL-003, REQ-WTL-004, REQ-WTL-005, REQ-WTL-006, REQ-WTL-009
- 상태: 구현됨. 실제 실행 범위는 아래 구현 검증 기록을 따른다. 목적지: 같은 신규 테스트의 OS별 사례와 새 CI matrix.

directory symlink/junction, 내부·외부 file symlink, 공간이 포함된 경로, 같은 경로의 교체, 파일 점유·권한 오류, 기록 교체 실패, force 없는 Git 제거를 검증한다. 외부 canary를 두고 거부·성공 후 bytes를 확인한다. 필수 junction 또는 해당 OS의 핵심 사례가 준비되지 않으면 인수 PASS로 계산하지 않는다. Windows에서 지원하지 않는 파일명 등만 구체적 사유로 skip한다. 기록 flush/rename·프로세스 종료 처리 결과를 각 OS에서 관찰한다.

Windows에서는 실제 8.3 짧은 경로와 긴 경로가 같은 canonical root·common Git·부가 Git 디렉터리로 해석되는 대조군을 포함한다. 원장과 표식을 유지한 동일 대상은 정상 조회·종료가 가능해야 하며, 다른 물리 디렉터리를 이름만 비슷하다는 이유로 같게 취급하지 않아야 한다. 사용 가능한 짧은 이름이 없는 환경에서는 그 사례를 미실행으로 명시하고 Windows 8.3 인수를 통과했다고 기록하지 않는다. volume 설정이나 관리 권한을 시험이 임의로 변경하지 않는다.

### VFY-WTL-06: 명령·작업 규칙·CI 연결

- verifies: REQ-WTL-001, REQ-WTL-002, REQ-WTL-003, REQ-WTL-004, REQ-WTL-007, REQ-WTL-008, REQ-WTL-009
- 상태: 구현됨. 실제 실행 범위는 아래 구현 검증 기록을 따른다. 목적지: 신규 CLI 테스트, 기존 docs·CI coverage 검사, 문서 의미 검토.

Node/npm silent stdout을 JSON으로 파싱하고 입력 오류·보류·실행 실패의 종료 코드를 확인한다. import만으로 기록·파일·ref가 바뀌지 않아야 한다. 에이전트 절차에 제어 checkout 이동·usage 종료·보류 보고·resume·guard 복구가 연결되는지 검토한다. 기존 제안서의 브랜치 판정은 단일 원본을 유지하고, 기존 항목을 자동 정리한다는 문구가 없어야 한다. CI 양 OS job과 분류표의 확인 문자열을 대조한다.

stdout envelope·결과 enum·unknown의 null 필드, branch skipped와 worktree removed의 조합, attempted 유실의 unverified를 실제 JSON으로 확인한다. `check.yml`과 CI 표는 기존 `readWorkflow`·`readCoverageTable`·`inspectCoverage`로 구조 검사한다. 신규 명령은 `cleanupTaskBranches`·`inspectMergedTaskBranch`와 실제 소비하는 공통 검증 `validateBranch`·NUL parser `parseWorktreeList`를 기존 정리기에서 import하며 새 관리 스크립트가 플러그인 실행기를 import하지 않는지 함께 확인한다.

새 CI job의 두 시험이 별도 필수 step인지 확인하고, 신규 시험 파일만 없고 기존 파일은 있는 대조군에서 신규 step이 실패하는지 관찰한다. 기존 파일의 통과 개수만으로 신규 시험이 실행됐다고 판정하지 않는다. 두 파일 각각의 실행 결과와 정상·거부 사례가 나타나야 한다.

규칙 문서의 의미 검토에서는 현재 정상 종료 절차와 새 관리 명령이 모순되지 않는지, main/dev·다른 작업·dirty·미등록 자료 보호 및 branch의 두 보존 경로·공통 보호·merged-pr CI가 유지되는지 확인한다. 완료 제안서가 수정되지 않았는지와 현재 검증 문서의 스크립트 표·본문이 같은 책임 경계를 설명하는지도 확인한다.

임시 경로에 관한 테스트 배치 문서·이 계획·두 대상 테스트 fixture가 native 정규화로 일치하는지 확인한다. 기존 기록·CI 결과의 이전 관찰값을 현재 성공으로 바꾸거나 Windows 실제 실행 없이 macOS 결과로 대체하지 않는다.

검증 checkout은 source 코드가 기준 커밋과 같은 별도 격리 경로를 사용한다. Node 22가 PATH에서 선택되는지 먼저 확인하고, `.env`·인증 자료·기존 node_modules를 복사하거나 symlink로 공유하지 않는다. `DATABASE_URL`·`TEST_DATABASE_URL`을 공급하지 않는 DB 없는 기준 환경에서 아래 준비와 검사를 실행할 수 있음을 확인했다. 환경 파일을 사용해야 하는 별도 검증은 개발/격리 DB만 사용한다.

```sh
node --version
npm --version
npm ci
npm run db:generate
npm exec --call "node --test scripts/manage-task-worktrees.test.mjs"
npm exec --call "node --test scripts/cleanup-task-branches.test.mjs"
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run docs:check
npm run verify:ci-coverage
npm run check
npm run build
```

같은 worktree의 typegen·typecheck·build를 동시에 실행하지 않는다. 신규 테스트·CLI는 기준 코드에 없으므로 baseline에서 파일/명령 없음으로 실패하는 것이 예상 결과이며, 구현 후에는 실제 정상·거부 사례를 실행해야 한다. 실제 사용자 저장소의 최종 확인은 새 명령의 status로 수행하며, 기능 검증을 위해 기존 worktree를 제거하지 않는다.

개별 파일 시험도 npm 실행 환경을 통해 호출한다. 기존 branch 정리 시험은 npm_execpath가 없으면 Node 실행 파일 옆 npm을 추정하는데, 그 파일이 JS 진입점 대신 셸 launcher인 설치 형태에서는 직접 `node --test`가 실패한다. `npm exec --call`은 선택한 Node를 실행하면서 정확한 npm CLI 경로를 전달한다. --package나 패키지 설치 요청을 추가하지 않는다. 이 호출 형태는 로컬과 새 CI job에서 동일하게 유지한다.

## Verification Results

아래 최초 표와 첫 정합성 검토는 `62e5898` 기준의 실행 이력이다. 이어지는 재검토 기록은 각 기준 SHA를 따로 표시한다. 이력에 남긴 옛 명령을 현재 실행 지시로 사용하지 않고, 현행 명령은 위 Verification Plan을 따른다.

| 확인 | 결과 | 적용 범위 |
| --- | --- | --- |
| 현재 코드·규칙·제안서·CI 대조 | 수행 | 문서 설계의 기준 확인. 새 관리 기능의 실행 증거가 아님 |
| 시작 시 기존 브랜치 정리 | 삭제 0개 | 주 작업 폴더의 dirty 상태로 기존 대상 보존 |
| 원격 보호 브랜치 확인·dev fetch | 수행 | 기준 SHA 확인과 문서 작성용 격리 checkout 준비 |
| SDD strict 추적성 검사 | PASS | 이 문서 단독. 요구사항 9개·Task 5개·VFY 6개, 요구사항의 작업·검증 연결 각각 9/9 |
| 기존 `inspectDocs`에 새 파일을 명시적으로 포함 | PASS | 기준 checkout의 Markdown 214개·상대 링크 1,044개·보고서 59개, 오류 0개 |
| 제안서 front matter·공백 검사 | PASS | pending/awaiting-approval, 승인·완료 metadata null, 불필요한 행 끝 공백 없음 |
| 신규 관리 도구·OS·중단 인수 | Not run yet | 도구 미구현. VFY-WTL-01–06은 계획 |

추적성 검사는 설치된 `write-sdd-spec`의 `scripts/validate_sdd_traceability.py --strict`에 이 파일만 전달했다. 상대 링크 검사는 기존 `scripts/checks/verify-docs.mjs:inspectDocs`에 `git ls-files` 목록과 아직 미추적인 이 파일을 함께 전달했다. 일반 `npm run docs:check`만 실행해 새 파일이 검사에서 빠지는 결과를 사용하지 않았다. 이 검사는 링크의 anchor 본문이나 미래 구현 동작을 증명하지 않는다.

### 2026-11-12 코드베이스 정합성 검토

처음부터 개선점이 없었던 문서는 아니다. 다음 구현 차단 후보를 확인하고 관련 요구사항·절차·영향 파일·검증 목적지에 반영했다.

| 발견 | 근거 | 반영한 해소 |
| --- | --- | --- |
| squash/rebase 완료 작업의 보존 경로 누락 | 실제 bare origin fixture에서 원격 task branch 없음·HEAD ancestry false인데 기존 정리기 preview는 eligible | 기존 병합 증거를 읽기 전용 export로 공유하고 삭제 정책은 보존 |
| worktree 및 branch 재사용 식별 부족 | 같은 path·Git 관리 경로·branch·HEAD로 worktree 재생성 가능 | 별도 인스턴스 표식, revision 대조, branch 위임 시도 기록과 반복 삭제 금지 |
| creating·중복 finish·partial removal의 종료 경로 불완전 | 상태 전이와 실행 명령을 대조했을 때 복구 입력·취소 가능 조건이 빠짐 | 자기 creating 복구, closing 스냅샷 재사용, 부분 제거의 보존·다른 경로 복구 절차 |
| 명령 잠금 복구·Git 자식 종료의 경합 경계 부족 | 두 호출자의 잠금 획득 및 successor 디렉터리 교체 실험 | 원자적 mkdir, 비어 있지 않은 nonce별 폐기 기록, 자식 미종료 시 guard 보존 |
| Git 조회·생성의 부수효과 제어 누락 | worktree add에서 post-checkout canary 실행, status의 index refresh 계약 | 호출별 hooks/fsmonitor 억제와 optional locks 비활성화, 무쓰기 대조 |
| 저장/출력 구조·CI 목적지의 모호성 | 신규 상태별 null·타입과 기존 결과 매핑을 구조적으로 대조 | 원장/표식/envelope 계약, 두 시험 파일의 양 OS job 및 분류표 연결 |
| 검증 준비·증거 구분 부족 | 기본 호스트 Node는 26, 제안은 22. 신규 파일·명령은 baseline에 없음 | Node 22 선택·설치·Prisma 생성 선행 명령, baseline의 기대 실패와 실제 인수 분리 |

Node 22.23.3·npm 10.9.9·Git 2.50.1/macOS의 별도 clean checkout에서 실행한 기준 명령은 다음과 같다. npm cache만 검증 소유 임시 경로를 사용했고 `.env`와 DATABASE_URL·TEST_DATABASE_URL 없이 실행했다.

| 명령 또는 명령군 | 분류·실제 결과 | 해석 |
| --- | --- | --- |
| `node --version`, `npm --version` | local, 22.23.3 / 10.9.9 | 기본 PATH의 Node 26을 그대로 쓰지 않음 |
| `npm ci`, `npm run db:generate` | local, PASS | 최초 설치의 sandbox DNS 실패 후 승인된 환경에서 재실행. lockfile 기반 525 packages, Prisma 7.10.1 생성 |
| `node --test scripts/cleanup-task-branches.test.mjs` | local, 39/39 PASS | 현재 공개 함수와 보호 회귀. 미래 export의 통과 증거는 아님 |
| `npm run verify:fsd`, `npm run verify:server` | local, PASS | 현재 경계 검사 |
| `npm run test:architecture` | local, 267 PASS / 2 skip / 0 fail | 현재 269개 시험, OS 조건의 skip을 양 OS 인수로 세지 않음 |
| `npm run docs:check`, `npm run verify:ci-coverage` | local, PASS | 기준 문서 213개·링크 1,040개·보고서 59개 / 12 jobs·10 rows |
| `npm run check` | local, PASS | lint·typegen·typecheck와 도구 시험 367 PASS / 2 skip / 0 fail |
| `npm run build` | local, 최종 PASS | 처음에는 sandbox의 port binding 실패. 승인된 실행과 별도 보존한 실패 산출물 이후 새 `.next`에서 build·TypeScript·34개 정적 페이지 생성 성공. 원인을 제품 회귀로 기록하지 않음 |
| `node --test scripts/manage-task-worktrees.test.mjs` | local, 예상 baseline 실패 | 아직 없는 새 시험 파일을 찾지 못함. 구현 후 성공으로 바뀌어야 함 |
| `npm run worktrees -- status`, `npm --silent run worktrees -- status`, `node scripts/manage-task-worktrees.mjs status` | local, 예상 baseline 실패 | 아직 없는 npm script/CLI. 구현 후 JSON·무쓰기 시험으로 검증 |
| 새 관리 CLI의 mutation 명령·실제 사용자 대상 Git 제거 | external/미실행 | 본문은 미래 helper의 명령 계약. 기존 사용자 자료에 실행하지 않음 |
| Windows/macOS 신규 CI job | external/미실행 | job·도구 미구현. 아래의 구조 검증과 실제 OS 인수를 구분 |

추가로 실제 임시 Git 저장소에서 ignored 산출물의 force 없는 제거와 독립 B worktree 보존, 재사용 경로의 기존 표식 부재, hook 억제, 서로 다른 두 프로세스의 mkdir 배타성, nonce별 폐기 디렉터리의 successor 보존, 동일 디렉터리 JSON 교체를 확인했다. 폐기·원장 형식의 전체 구현을 만들어 시험한 것은 아니며 Git/Node 원시 동작과 누락된 조건을 검증한 것이다.

CI 변경 형태는 메모리상의 제안 job과 기존 표를 `readWorkflow`·`readCoverageTable`·`inspectCoverage`에 넣어 `check/task-worktrees`가 Windows/macOS로 해석되고 새 행과 일치함을 확인했다. 실제 workflow 파일은 수정하거나 dispatch하지 않았다.

원시 동작의 문서 근거는 [Git worktree](https://git-scm.com/docs/git-worktree), [Git status의 index refresh](https://git-scm.com/docs/git-status#_background_refresh), [Git post-checkout hook](https://git-scm.com/docs/githooks#_post_checkout), [Node 22 파일시스템 API](https://nodejs.org/docs/latest-v22.x/api/fs.html#fsrenameoldpath-newpath-callback)다. 로컬 인수와 문서 계약은 미래 Windows 구현의 실제 인수를 대체하지 않는다.

### 2026-11-12 재검토: Windows 경로 정규화

동일 문서의 검증·개선 요청을 전체 정합성 검토로 다시 수행했다. 이번에는 이전 결과 뒤 병합된 `68f3d49`에서 한 가지 추가 보완 사항을 확인했다. `docs/proposals/active/ci-os-coverage.md`의 새 Windows 실행 기록과 `plugin/runtime/codex-resident-session.test.mjs`, `plugin/runtime/resident-commit.test.mjs`는 일반 `realpathSync`가 8.3 짧은 이름을 남겨 Git의 긴 경로와 달라지는 실패 및 native API 수정을 기록한다. 이 문서의 기존 임시 경로 준비 지시에도 같은 조건이 빠져 있었다.

canonical 경로 정의, TASK-WTL-01/04, 테스트 배치 문서의 변경 범위, 두 테스트 fixture 준비, VFY-WTL-05/06에 native 정규화를 반영했다. 새로운 기능이나 삭제 권한을 추가한 변경은 아니다. #326 병합과 #328 미병합 정보는 시점 정보 갱신으로 구분했다.

Node 22.23.3·npm 10.9.9·Git 2.50.1/macOS의 새 `68f3d49` 검증 checkout에서 준비·검증 명령을 다시 실행했다. 기존 정리 시험 39/39, 아키텍처 시험 267 PASS/2 skip, `npm run check`의 도구 시험 367 PASS/2 skip, 경계·문서·CI 표 검사와 빌드가 통과했다. 최신 기준 문서는 214개·상대 링크 1,058개이며 CI는 12 jobs·10 rows다. 신규 CLI/시험 파일의 baseline 부재는 예상 실패로 다시 확인했다.

Git/Node 기초 동작 일곱 사례와 제안 CI job의 구조 검사도 다시 수행했다. macOS에서 native 실경로와 Git root의 일치를 확인했으며, 이번 세션에서 Windows 프로세스를 실행한 것은 아니다. Windows의 8.3 실제 대조는 VFY-WTL-05의 구현 인수에 남는다. 새 결과를 이전 기준 커밋의 검증 수치와 섞거나 신규 관리 도구의 실행 성공으로 기록하지 않는다.

### 재검토 중 병합된 정리 계약과 검증 명령 반영

검토 중 `02747f2`로 기준이 이동해 #328/#331의 실제 코드·규칙·완료 문서를 다시 대조했다. ancestry 경로·status/failed·PR 검증·소유자 수동 종료는 이미 구현됐으므로 재구현 지시를 제거했다. `aborted`, 복수 reasons, summary를 현재 반환값 그대로 보존하고 wrapper의 중단·exit 1로 전파하도록 보완했다. 완료 제안서는 읽기 전용으로 변경했다. 이는 단순한 SHA 갱신과 구분되는 새 반환 계약의 연결 수정이다.

또 현재 branch 시험의 직접 `node --test` 실행은 이 Node/npm 설치 형태에서 92 PASS/1 fail이었다. npm-silent 시험이 npm의 셸 launcher를 Node의 JS 입력으로 실행한 실패다. 현행 명령인 `npm exec --call "node --test scripts/cleanup-task-branches.test.mjs"`로 93/93 통과했다. 신규 파일이 없는 상태에서 두 파일을 한 호출에 합친 경우도 기존 93개만 실행하고 exit 0이므로 CI를 파일별 필수 step으로 분리했다. 신규 파일 단독 호출은 예상대로 파일 없음/exit 1이다.

`02747f2`의 별도 검증 checkout에서 전체 local 검증을 다시 실행했다. 경계 검사, 문서 검사(215개·링크 1,062개), CI 표 검사(12 jobs·10 rows), 아키텍처 시험(321 PASS/2 skip), check의 도구 시험(421 PASS/2 skip), 빌드가 통과했다. 의존성 lockfile과 Prisma 설정은 앞선 기준과 같았고 새 패키지를 추가하지 않았다. primitive 일곱 사례도 새 정리 코드에 다시 연결해 통과했다. 신규 CLI와 실제 Windows 인수는 여전히 미구현·미실행 범위다.

## Readiness

판정: **CONDITIONALLY READY**. 위 단일 Phase의 fixture 기반 구현·검증을 시작할 수 있는 설계이며, 실제 사용자 자료 적용과 새 종료 규칙의 활성화는 양 OS 파일 보존·중단 복구 시험 통과 뒤로 제한한다. 구현 실행 승인은 front matter에 별도로 기록한다. 사용 종료를 자동 증명할 수 없다는 한계와 비정상 guard 복구의 소유자 확인은 의도적인 계약이며 숨겨진 자동화 약속이 아니다.

기존 미등록 worktree의 소유권 미확인은 fixture 구현의 blocker가 아니며, 해당 자료를 실제 정리하는 시점의 보존 조건이다. 이미 완료된 branch 개선이나 제품 플러그인 출시를 새 선행 작업으로 추가하지 않는다. 실제 OS에서 기록 교체나 force 없는 제거가 계약을 충족하지 못하면 TASK-WTL-05에서 적용을 중단하고 설계를 먼저 수정한다. 정합성 검토의 최종 상태는 이 파일의 최종 hash를 기준으로 수행한 별도 무수정 pass의 응답에 기록하며, 기준 명령·기초 동작 시험을 새 관리 도구의 구현 인수로 확대하지 않는다.

### 구현 검증 기록 — 2026-11-16

구현 브랜치는 `harness/task-worktree-lifecycle-20261112`다. 처음에는 `407be0b`에서
분기했고, 최종 검사 전에 최신 dev `a26830935a4003f329cb234a6937a019f0f8e045`로
재배치했다. 이후 dev에 들어온 plugin·운영 정리·CI 증거 계약을 보존하며,
이 변경은 저장소 작업 도구·시험·문서·check job만 수정한다.

이번 구현은 TASK-WTL-01–05의 CLI, 원장, 표식, 종료·복구, 기존 branch 위임, npm·규칙·CI 연결을
구현했다. 실제 소비용 `validateBranch`·`parseWorktreeList`도 공유하여 branch 이름과
Git 목록 계약의 중복을 없앴다. 응답에는 owner/branchName/lastReasons와 선택적 guard/error를
추가했다. 잘못된 finish 입력은 무쓰기이며 승인된 검사 보류 뒤에는 revision을 다시 읽는다.
상태 조회의 Git 실패는 exit 1로 보고하고 자료를 변경하지 않는다.

| 범위 | 실제 검증 | 결과·한계 |
| --- | --- | --- |
| VFY-WTL-01/02 | 생성·신원·dirty/ignored·잠금·submodule·숨김 index·status와 I/O 실패 fixture | macOS 통과. `.env`와 다른 작업의 파일 bytes 보존 |
| VFY-WTL-03 | remote-head·ancestor·squash 보존, 독립 B, dependent PR, dirty 제어 checkout, branch 예외/aborted | macOS 통과. 폴더와 branch 결과 분리, 남은 batch 보존 |
| VFY-WTL-04 | 생성 네 중단 지점, closing/제거 후 중단, resume, finish 경합, 취소 자식 정산 실패, attempted 응답 유실 | macOS 통과. 실제 subprocess/Git 및 파일·프로세스 경계 오류 주입. 비협력적인 외부 쓰기까지 격리한다는 보장은 아님 |
| 기존 branch 회귀 | 별도 npm 실행의 `cleanup-task-branches.test.mjs` | 96/96 통과. 기존 두 삭제 경로·PR/CI·CAS 보호 유지 |
| VFY-WTL-05 | macOS 파일·symlink·원자적 교체·강제 없는 제거 | 로컬 통과. Windows 실행은 아래 PR CI로 확인하며 macOS 결과로 대체하지 않음 |
| VFY-WTL-06 | 실제 저장소의 npm silent status, 문서·CI 표·strict traceability 검사 | 통과. 기존 7개 worktree는 unmanaged로 관찰만 했고 실제 제거하지 않음 |
| 공통 회귀 | `verify:fsd`, `verify:server`, `test:architecture`, `check`, `build` | Node 22.23.3/npm 10.9.9 macOS에서 통과. 최신 추가 status 회귀도 단독 통과 |
| 양 OS 자동 검증 | `check/task-worktrees`의 Windows 2022·macOS 15, 파일별 필수 step | 이 변경의 PR check 결과를 인수 증거로 사용. 8.3 별칭이 없는 Windows 볼륨은 해당 사례를 명시적으로 skip하며 8.3 인수 성공으로 계산하지 않음 |

최초 관리 시험 실행에는 Git timeout 한 건과 비정상적으로 긴 wall time이 있었다.
동일 사례 단독 재실행과 후속 전체 시험은 통과했고 timeout 상한은 늘리지 않았다.
오류 기록을 삭제하거나 처음부터 모두 통과했다고 기록하지 않는다.
현재 실제 사용자 자료의 자동 채택·정리, dev 병합과 main 승격은 수행 범위 밖이다.
PR에 최종 commit의 check 결과와 잔여 보류를 기록하고 병합 전에는 active 제안서로 유지한다.

## Risks and Rollback

- 사용 종료를 잘못 선언하거나 다른 세션이 closing 폴더를 계속 쓰면 자료 손실 위험이 있다. 독립 환경·resume 규칙·직전 재검사로 줄이지만 OS 수준의 완전한 차단은 제공하지 않는다.
- `.git` 아래 기록을 삭제하거나 오래된 checkout의 도구를 실행하면 관찰이 불완전할 수 있다. 새 schema는 거부하고 미등록·unknown 자료를 보존한다.
- guard 복구와 기존 자료 전환에는 소유자 판단이 남는다. 시간 기준 자동 회수로 이 확인을 제거하지 않는다.
- 등록되지 않은 B의 경로·서버 의존성은 자동 발견되지 않는다. 분기 이력을 의존성 원장으로 대체하지 않는다.
- 기능 롤백은 CLI·npm·규칙·CI 연결을 되돌리고 관리 기록은 보존하는 방식이다. 로컬 상태를 버리거나 기존 폴더를 정리하는 동작을 rollback에 포함하지 않는다.
- 제거된 tracked 자료는 보존된 커밋으로 재구성할 수 있지만 ignored 자료는 Git으로 복원되지 않는다. 미보존 자료를 사전에 거부하는 검증이 필수다.

## Completion or Closure Notes

관리 도구·규칙·CI 구현과 VFY-WTL-01–06의 실제 증거, 승인된 PR 절차와 남은 보류 이유를 기록한다. dev 병합은 별도 권한이며 병합 전에는 이 문서를 active에 유지한다. 기존 worktree가 모두 사라져야 기능 구현이 완료되는 것은 아니다. 이전 baseline 결과를 새 기능의 인수로 취급하거나 기능 구현을 기존 자료 정리 완료로 표시하지 않는다.

## Review Checklist

- [x] 현재 계약과 제안의 차이, 독립적인 브랜치 정리 계획과의 책임을 구분했다.
- [x] 생성·종료·중단·재시도·종료 취소·경로 재사용·A/B 의존 사례를 명시했다.
- [x] 주 worktree·보호 브랜치·미등록 자료·미보존 파일의 보호 조건을 정의했다.
- [x] 작업 소유권 기록을 인증이나 일반 프로세스 사용 부재의 증명으로 표현하지 않았다.
- [x] 원자적 보장의 한계와 guard 강제 종료의 확인 절차를 명시했다.
- [x] 기존 스크립트의 삭제 조건과 새 worktree 제거 조건을 분리했다.
- [x] Windows·macOS 인수와 CI 표 갱신을 같은 구현 범위에 포함했다.
- [x] 문서 작성 권한과 구현·기존 자료 삭제 권한을 구분했다.
- [ ] 구현 및 실제 OS·중단 인수 완료.
