---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-12"
approved-by: "user"
approved-at: "2026-11-12"
approval-scope: "Phase BRC 코드·테스트·규칙 문서 구현, 로컬·CI 검증, dev 대상 PR 생성·병합과 완료 문서 정리. 기존 사용자 자료의 일괄 삭제와 main 승격·배포는 제외."
completed-at: "2026-11-12"
verification-summary: "18ba250 구현, 로컬 architecture 321 pass/2 skip·scripts 421 pass/2 skip·제품 639 pass/41 skip·build 통과. PR #328 check 6개 job 성공 후 11dd700으로 dev 병합."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "AGENTS.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/proposals/active/ci-os-coverage.md"
  - "docs/proposals/active/gate-run-records.md"
---

# 로컬 작업 브랜치 정리 — 병합 판정과 worktree 종료 절차 개선 완료

## Summary

로컬 브랜치의 커밋 이력이 이미 `origin/dev`에 보존된 경우에는 별도의 병합 PR과 PR head SHA 일치를 요구하지 않는다. 커밋 이력이 직접 포함되지 않은 squash/rebase 병합은 기존 PR·CI 검증을 유지한다. 보호 브랜치, 사용 중인 worktree, 미커밋 변경, 열린 PR, 원격 브랜치 재사용과 동시 변경에 대한 보호는 유지한다.

정리 결과에는 커밋 보존 여부와 삭제 보류 이유를 따로 표시한다. 작업을 끝낸 주체가 자신이 만든 worktree의 사용 종료를 확인하고 해제하는 절차를 문서화한다. 전체 정리 스크립트는 worktree를 제거하거나 checkout하지 않는다.

Phase BRC 구현과 로컬·CI 검증을 완료하고 [PR #328](https://github.com/Sangeok/stagekeeper/pull/328)로 `dev`에 병합했다. 아래 설계·실행 계획과 baseline은 당시 판단 근거를 보존한 기록이다. 최종 결과는 Verification Results와 Completion or Closure Notes를 따른다.

## Goal

- PR을 만들지 않은 검토용 브랜치와 추가 커밋까지 `dev`에 포함된 브랜치가 PR 조건 때문에 계속 남는 문제를 해결한다.
- “커밋 보존 완료”와 “지금 삭제 가능”을 구분해 다음 조치를 설명한다.
- 작업 종료 후 남는 worktree 연결을 해당 작업 주체가 해제하게 한다.
- 기존 안전장치를 유지하며 기존 스크립트와 테스트 안에서 구현한다.

## Proposal Size

`proposal-size`: standard. Drafting mode: `PHASE_PLAN`, 위험 분류: `HIGH-RISK`.

로컬 ref 삭제 판정과 공유 worktree의 종료 절차를 다루므로 문구 수정으로 취급하지 않는다. 새 서비스·DB·패키지·작업 소유권 원장·자동 worktree 청소기를 추가하지 않는다.

## Current State

### 근거와 상태

- 관찰 기준: 2026-11-12, `origin/dev` `eabd1381169a2692e9b29317c31047bbb4027c7d`.
- 작성 시작 시 주 작업 디렉터리는 `harness/plugin-skill-contract-plan`이고 미커밋 변경이 없었다. 다른 작업의 브랜치를 전환하지 않고 최신 `origin/dev` 기반 별도 worktree에서 작성한다.
- 권위 있는 현재 계약은 [AGENTS.md](../../../AGENTS.md)의 `Branching and pull requests`와 [verification.md](../../architecture/verification.md#작업-브랜치-정리)다. 본문에 제안한 변경을 구현하기 전에는 기존 계약을 적용한다.
- 사용자와 합의한 방향은 병합 판정 두 경로, 기존 보호 유지, 작업 주체의 worktree 해제, 결과 구분이다. 이 문서는 그 범위의 요구사항과 구현 계획을 소유한다.
- 시작 시 확인한 열린 PR은 #325(`harness/core-readme-github-location` → `dev`)였다. 이 수치는 시점 정보이며 구현·삭제 판단에 재사용하지 않는다.

| 현재 구현 | 관찰한 동작 | 필요한 변경 |
| --- | --- | --- |
| `scripts/cleanup-task-branches.mjs:localReason` | 실행 worktree가 dirty이거나 대상이 checkout돼 있으면 조기 반환 | 삭제 차단은 유지하고 진단용 ancestry와 worktree 상태는 별도로 수집 |
| `command` | `spawnSync` 결과를 `{ ok, output }`으로 축약해 종료 코드와 실행 오류를 버림 | 기존 키를 유지하며 `status`와 실행 실패 여부를 내부 결과에 추가 |
| `inspectCompletion` | 로컬 SHA와 병합 PR head SHA가 같아야 하며 merge 결과가 `dev`에 있어야 함 | 로컬 SHA가 `dev`의 조상인 경로를 먼저 판정 |
| `ciReason` | PR head의 최신 `check`와 관련 workflow 모두 성공해야 함 | 직접 포함 경로에서는 호출하지 않고 PR 증거 경로에서 그대로 유지 |
| `cleanupTaskBranches` | 로컬 차단 대상만 있으면 fetch 전에 종료 | 유효한 대상의 보존 상태를 진단할 수 있도록 원격 확인·fetch 시점 조정 |
| `deleteLocalBranch` | 삭제 직전 로컬 상태 재검사, expected SHA로 ref 삭제 | 유지. 최종 재검사 결과를 새 진단 출력에도 반영 |
| `scripts/cleanup-task-branches.test.mjs` | 실제 임시 Git 저장소·bare origin, GitHub 응답 주입으로 검증 | 직접 포함/PR 증거 경로를 구분하고 진단·회귀 사례 추가 |

앞선 로컬 조사에서는 작업 브랜치 6개의 끝 커밋이 `origin/dev`에 포함됐지만 모두 worktree에 연결돼 있어 즉시 삭제 대상이 없었다. 그중 일부는 PR이 없거나 병합 PR head와 로컬 SHA가 달랐다. “6개”는 문제를 설명하는 과거 관찰이며 구현 후 인수의 고정 기대값이 아니다.

### 현재 계약과 바뀔 계약

| 현재 문구/규칙 | 이 계획에서 적용할 수정 |
| --- | --- |
| 모든 삭제 대상에 병합 PR·동일 head·CI 성공 요구 | 직접 포함 경로와 PR 증거 경로 중 하나로 보존을 증명. PR·CI 조건은 후자에 적용 |
| 최종 테스트 커밋이 PR로 `dev`에 병합된 경우만 정리 완료 | PR 없는 브랜치도 커밋 이력이 `dev`에 포함되고 공통 보호 조건을 통과하면 정리 대상. 제품 작업의 완료·승인 판정과 구분 |
| 정리를 위해 worktree를 제거하지 말 것 | dirty·다른 작업 소유·사용 종료 불명의 worktree는 계속 보존. 자기 작업의 정상 종료 절차에서만 해제 가능 |
| `git branch --merged`만으로 삭제 금지 | 유지. ancestry는 보존 증거 중 하나이며 열린 PR·사용 중 worktree·원격 재사용·최종 재검사도 필요 |

`ci-os-coverage.md`와 `gate-run-records.md`도 `AGENTS.md`와 `verification.md`를 변경한다. 구현 시작 시 최신 파일을 다시 읽고 브랜치 정리 관련 문단만 수정한다. CI 분류표·승격 규칙과 다른 제안서의 승인 범위를 바꾸지 않는다.

## Scope

포함 범위는 기존 정리 스크립트의 보존 판정·진단 출력, 그 회귀 테스트, 두 규칙 문서의 정합성, 이 제안서의 실제 검증 기록이다.

다음은 제외한다.

- 기존 브랜치·worktree 목록의 일괄 삭제 또는 강제 정리.
- 원격 ref 삭제·prune, 보호 브랜치 변경, PR 생성·병합·재개 또는 배포.
- CI 성공 조건의 전반적 완화, 실행 worktree dirty 차단 제거, 원격 `dev` 변경 차단 완화.
- 자동 checkout·detach·stash·reset, 작업 소유권 DB/lease, 작업 나이 기준 삭제.
- 파일 diff·patch-id만으로 미병합 커밋을 병합 완료로 간주하는 판정.
- 앱·plugin·DB·Next.js 코드, 의존성·npm 명령·CI workflow 변경.

## Proposal

### 요구사항과 불변식

#### REQ-BRC-001: 직접 포함된 커밋 이력 인정

WHEN 유효한 로컬 작업 브랜치의 끝 커밋이 이번 실행에서 fetch한 `origin/dev`의 조상이면, 스크립트 SHALL 보존 증거를 `ancestor`로 기록하고 병합 PR의 존재·head 일치·과거 CI 성공을 삭제의 추가 조건으로 요구하지 않는다. 공통 보호 조건은 계속 적용한다.

#### REQ-BRC-002: squash/rebase 병합 증거 유지

WHEN ancestry 검사 결과가 “조상이 아님”이면, 스크립트 SHALL 기존의 동일 저장소·`dev` 대상 병합 PR, 로컬 SHA와 PR head 일치, merge 결과의 `dev` 포함, 최신 PR CI 검증을 모두 통과한 경우에만 `merged-pr` 증거를 인정한다. 증거가 없거나 불명확하면 삭제하지 않는다.

#### REQ-BRC-003: 공통 보호 조건 유지

WHEN 보호 대상·로컬 변경·checkout·열린 PR·의존 PR·원격 브랜치 재사용·조회 실패 중 하나가 확인되면, 스크립트 SHALL 해당 대상을 보존하고 원인을 표시한다. 원격 `main` 또는 `dev`가 없거나 존재를 확인할 수 없으면 남은 삭제를 중단한다. 적용 도중 발견한 실패는 앞서 완료된 삭제를 되돌리지 않으며 부분 결과와 비정상 종료를 보고한다.

#### REQ-BRC-004: 보존과 삭제 상태의 분리

WHEN preview 또는 apply 결과를 출력하면, 스크립트 SHALL 각 대상의 보존 증거, 연결 worktree, 확인된 차단 원인과 삭제 상태를 분리하고 집계한다. 검사하지 못한 항목은 `unknown`/`unverified`로 표시하며 성공이나 안전으로 추정하지 않는다.

#### REQ-BRC-005: 작업 주체의 worktree 종료 절차

WHEN 작업을 끝낸 주체가 자기 worktree를 해제하려 하면, 저장소 절차 SHALL 사용 종료·변경 보존·커밋 보존을 먼저 확인하고, 해제 후 기존 정리 스크립트로 해당 브랜치를 다시 검사하도록 요구한다. 소유권·사용 종료·파일 보존이 불명확한 경우에는 해제하지 않는다.

#### REQ-BRC-006: 최종 재검사와 재실행

WHEN 삭제 직전 로컬 SHA·symbolic ref·worktree·dirty 상태 또는 검사한 원격 상태가 달라지면, 스크립트 SHALL 삭제를 보류한다. WHEN 같은 대상을 재실행하면, 스크립트 SHALL 현재 상태를 다시 검사하고 이미 없는 브랜치는 `branch-missing`으로 보고한다.

#### INV-BRC-001: 보호 ref와 사용자 파일 보존

로컬·원격 `main`/`dev`와 `harness/` 밖의 ref는 삭제 대상이 아니다. 정리 스크립트는 worktree 파일·원격 ref·PR을 변경하지 않는다. fetch가 갱신하는 `origin/dev` 추적 ref는 이 제한의 명시적인 기존 예외다.

#### INV-BRC-002: 삭제 대상의 정체성

삭제는 유효한 실제 로컬 `refs/heads/harness/...` 하나와 검증한 전체 SHA에 한정한다. symbolic ref를 따르지 않으며 SHA를 expected old value로 지정한 원자적 삭제를 유지한다.

#### CON-BRC-001: 범위와 도구

기존 Node ESM·`node:test`·Git·`gh api` 및 기존 파일을 사용한다. 설명용 코드 주석, 새 의존성, 추가 CLI flag, 자동 worktree 제거 기능은 도입하지 않는다.

#### CON-BRC-002: 실행 권한과 증거

이 문서의 작성 완료는 구현 실행이나 실제 로컬 자료 삭제의 완료를 뜻하지 않는다. 구현 시 승인된 범위와 최신 저장소 규칙을 적용하고, fixture 검증과 실제 사용자 저장소 적용을 구분해 기록한다.

### 1. 판정 순서

기존 `cleanupTaskBranches({ cwd, apply, branches, github })`와 CLI 인자를 유지한다.

1. 인자·보호 이름을 저장소 접근 전에 검증한다. 유효한 `--branch` 중복은 최초 순서를 유지해 제거하며 브랜치당 결과 한 행을 만든다. 실제 로컬 ref·전체 SHA·symbolic 여부와 실행/연결 worktree 상태를 수집한다. 없는 대상은 `branch-missing`이다.
2. 진단 가능한 실제 ref가 하나라도 있으면 원격 `main`·`dev`를 확인하고 기존 방식으로 `origin/dev`를 fetch해 `devSha`를 고정한다. 로컬 차단 대상만 있어도 이 단계와 ancestry 진단은 수행한다. 유효한 대상이 없으면 네트워크를 호출하지 않는다.
3. `git merge-base --is-ancestor <sha> <devSha>`를 실행한다. 종료 코드 0은 `ancestor`, 1은 PR 증거 검사 후보, 실행 실패·timeout·기타 종료 코드는 `unverified` 및 `inspection-failed`다. Git 오류를 “조상이 아님”으로 축약하지 않는다.
4. 로컬 dirty 또는 checkout 차단 대상은 보존 진단까지만 하고 GitHub API 호출·삭제를 건너뛴다. ancestry가 아니면 `unverified`로 남기며 “미병합”이라고 단정하지 않는다. 연결 worktree의 존재는 사용 중으로 취급하며 clean 상태만으로 해제하지 않는다.
5. 로컬 조건을 통과한 대상은 **두 경로 모두** 기존 head 조회의 모든 페이지로 같은 저장소의 열린 PR을 검사하고, 해당 branch를 base로 하는 열린 PR도 검사한다. 필터 전에 응답 항목을 검증한다. head 조회의 각 항목에는 양의 정수 `number`, `state: open | closed`, 문자열 `head.ref`, `head.repo.full_name`이 있어야 한다. null/누락/잘못된 타입을 일치하지 않는 PR로 무시하지 않는다. base 조회는 각 항목의 양의 `number`, `state: open`, 일치하는 `base.ref`·`base.repo.full_name`을 확인하며 비어 있지 않은 올바른 목록이면 `dependent-pr`다. 응답 형식 오류·조회 실패는 `inspection-failed`이고 `ancestor`여도 삭제하지 않는다. 정상적인 빈 페이지와 모든 페이지를 합친 빈 목록은 허용한다. GitHub owner/repository 식별자는 대소문자를 구분하지 않고 비교하되 branch 이름과 SHA는 정확히 비교한다. PR head/base와 CI의 저장소 비교에 같은 규칙을 적용한다.
6. `ancestor`는 병합 PR 필터와 `ciReason`을 생략한다. 그렇지 않으면 기존 PR 증거·CI 검증을 그대로 실행하고 통과 시 `merged-pr`로 기록한다. PR head 불일치는 이 경로에서만 거부 사유다.
7. 두 경로 모두 원격 보호 브랜치 존재, 원격 `dev` SHA 불변, 같은 이름의 원격 작업 브랜치가 있으면 로컬 SHA와 일치를 검사한다. 보호 원격 조회 실패/누락 또는 `dev` SHA 변경은 실행 전체의 검사 기준을 무효화하므로 아래 중단 계약을 따른다. 특정 작업 브랜치의 SHA 불일치는 그 대상만 보류한다. 원격 작업 브랜치 부재 자체는 완료 증거가 아니다.
8. preview는 판정만 반환한다. apply는 기존 `deleteLocalBranch`의 로컬 재검사와 expected SHA 삭제를 실행한다. 재검사에서 추가된 차단 사유도 결과에 반영한다. 설정 정리 실패의 기존 `note`를 유지한다.

같은 브랜치를 다른 작업이 동시에 checkout·갱신하는 일을 이 검사만으로 완전히 직렬화하지는 못한다. 기존 최종 재검사와 원자적 ref 보호를 유지하며, 작업 주체는 사용 중인 대상의 정리를 다른 세션과 동시에 실행하지 않는다. 새 전역 lock/lease는 이 변경의 보장에 포함하지 않는다.

두 정리 호출이 같은 ref를 동시에 지우는 경우 expected SHA 삭제는 성공을 한 호출에만 허용한다. 다른 호출은 재검사 시점에 따라 `branch-missing` 또는 `branch-changed-or-locked`로 보류한다. GitHub PR 상태와 로컬 Git 상태를 하나의 transaction으로 묶지는 않으며, 최종 확인 이후 새 PR/checkout 생성이나 동일 SHA로 ref를 삭제·재생성하는 경합까지 안전하다고 주장하지 않는다. 이 제한은 원래 사용 종료·브랜치 재사용 금지 절차로 관리한다.

### 2. 출력 계약

기존 최상위 `apply`, `results`와 행의 `branch`, `status`, `reason`, `sha`, `pr`, `note` 의미를 유지한다. `status`는 `eligible | deleted | skipped`를 유지한다. 진단 필드는 추가 방식으로 넣는다. 아래 중단 계약의 적용 도중 전역 실패에서만 기존 catch-and-continue/exit 0을 부분 결과/exit 1로 바꾼다.

| 필드 | 값과 의미 |
| --- | --- |
| `sha` | 처음 고정한 전체 로컬 SHA. 확인 불가 시 생략. `skipped`에도 확인했으면 포함하며 삭제의 expected SHA와 같음 |
| `preservation` | `ancestor | merged-pr | unverified`. 커밋 보존 증거이며 삭제 허가가 아님 |
| `devSha` | 이번 실행에서 fetch해 검사한 전체 SHA. 확인 불가 시 생략 |
| `worktrees` | 연결된 각 worktree의 `{ path, head, changes, locked, prunable }`. `path`는 문자열, `head`는 전체 SHA 또는 null, `changes`는 `clean | dirty | unknown`, `locked`·`prunable`은 boolean |
| `reasons` | 실제로 확인된 차단 사유의 중복 없는 배열. 기존 `reason`은 이 배열의 첫 항목으로 유지 |
| `summary` | 최상위 집계: `total`, `ancestor`, `mergedPr`, `unverified`, `worktreeInUse`, `eligible`, `deleted`, `skipped` |
| `aborted` | 최상위 boolean. 정상 판정/대상별 보류는 false, 아래의 적용 도중 전역 중단은 true |

`ancestor + mergedPr + unverified = total`, `eligible + deleted + skipped = total`이다. `total`은 중복을 제거한 대상 수다. `worktreeInUse`는 연결된 worktree 수가 아니라 `reasons`에 `worktree-in-use`가 있는 브랜치 수이며 다른 집계와 겹칠 수 있다. 대상 없음은 빈 `results`, 모든 값이 0인 `summary`, `aborted: false`다. `eligible`/`deleted`는 `reasons: []`이고 `reason`을 생략한다. `skipped`에는 적어도 한 사유가 있어야 한다. `pr`는 실제 `merged-pr` 증거가 있을 때만 넣는다.

보존 증거는 고정한 `sha`/`devSha`에 대한 관찰이다. 최종 재검사에서 로컬 ref가 바뀌었거나 사라졌으면 해당 행은 `unverified`로 낮추고 사유를 추가한다. 원격 기준이 무효화돼 중단한 경우 완료된 삭제 행은 당시 증거를 유지하고, 삭제하지 않은 행은 `unverified`로 보고한다. 이미 검사한 이전 SHA를 현재 브랜치의 보존 완료로 표시하지 않는다.

`reasons`는 실행 dirty → checkout → ref 오류/변경 → 열린 head PR → 병합/CI 증거 부족 → 의존 PR → 원격 상태 → 삭제 시 재검사 순서로 정렬한다. 검사하지 않은 후속 조건을 “통과”로 출력하지 않는다. 기존 차단 원인의 명칭은 유지하며 실패한 원본 명령·credential·환경변수 값은 출력하지 않는다.

예를 들어 이력이 포함됐으나 checkout된 대상은 `preservation: "ancestor"`, `status: "skipped"`, `reason: "worktree-in-use"`다. 보고자는 “커밋 보존 완료 6개 / worktree 해제 필요 6개 / 즉시 삭제 0개”처럼 설명할 수 있다. Node CLI stdout에는 JSON만 출력한다. 일반 `npm run`은 npm 자체 banner가 붙으므로 JSON 소비자는 `node scripts/cleanup-task-branches.mjs` 또는 `npm --silent run branches:cleanup`을 사용한다.

연결 worktree의 진단은 `git worktree list --porcelain -z`의 NUL 구분 레코드를 사용한다. `locked <reason>`, `prunable <reason>`도 flag가 있는 것으로 읽고 공백/개행 경로와 detached 항목을 구분한다. 목록 명령 실패·필수 필드 누락·해석 실패를 빈 목록으로 처리하지 않는다. 삭제 전 전체 목록을 확정할 수 없으면 아래 전역 중단 계약을 따른다.

연결 경로마다 Git 메타데이터가 가리키는 worktree 최상위 경로가 예상 경로와 일치하는지 realpath로 정규화해 확인한 뒤 `git status --porcelain=v1 --untracked-files=all`을 실행한다. 정규화 자체가 실패하거나 경로/메타데이터가 없거나 접근할 수 없으면 `changes: unknown`이며 등록된 checkout 연결을 계속 보호한다. `.git`이 없어진 하위 디렉터리에서 Git이 상위 저장소를 대신 읽은 결과를 사용하지 않는다. 이 `clean`은 ignored 파일이나 프로세스 사용 부재를 증명하지 않는다.

중단 계약:

- 첫 삭제 이전의 초기 원격 확인/fetch/전체 worktree 목록 실패: 기존처럼 예외·CLI stderr/exit 1. 삭제는 0개이며 완전한 JSON을 약속하지 않는다.
- 대상 처리 도중 보호 원격 확인 실패/누락, 원격 `dev` 변경, 전체 worktree 목록 재검사 실패: 남은 삭제를 중단한다. preview/apply 모두 이미 완료한 `deleted` 행만 유지하고 **그 밖의 모든 행**을 `skipped`/`unverified`로 확정한다. 이전 `eligible` 행과 기존 보류 행도 포함하며 알려진 사유를 보존하고 중단 사유를 `reasons`에 추가해 정해진 우선순위로 정렬한다. 중단 사유는 `inspection-failed`, 원격 `dev` 변경은 `origin-dev-changed`다. 낮춘 행의 `pr`는 생략하고 `summary`를 최종 행으로 다시 계산한다. 따라서 중단된 preview의 `eligible`은 0이다. `cleanupTaskBranches`는 `aborted: true`를 반환하고 CLI는 JSON을 출력한 뒤 exit 1이다. 앞서 완료된 삭제를 자동 복원하지 않는다.
- 특정 대상의 PR API·ancestry·개별 worktree 상태 조회 실패나 원격 작업 브랜치 불일치: 해당 행만 보존하며 다음 대상을 계속 검사한다. 전체 목록이 확인된 상태의 개별 worktree 조회 실패는 checkout 보호를 유지한다. 기존 대상별 보류의 exit 0은 유지한다.
- 중단/프로세스 종료가 ref 삭제 뒤 최종 JSON 출력 전에 발생하면 출력만으로 완료 여부를 단정하지 않는다. 재실행은 실제 ref를 다시 조회하며 없는 대상은 `branch-missing`이다. batch는 transaction이 아니다.

### 3. 작업 종료 시 worktree 해제

이 절은 `AGENTS.md`와 `verification.md`에 반영할 **작업 주체의 절차**다. 정리 스크립트에 제거 명령이나 새 flag를 넣지 않는다.

1. 자기 작업에서 만든 정확한 worktree 경로와 브랜치를 확인한다. 다른 세션이 소유하거나 생성/사용 종료를 확인할 수 없는 기존 worktree는 보존한다. 디렉터리 이름·나이·깨끗한 상태만으로 종료를 추정하지 않는다.
2. 그 경로를 사용하는 자기 서버·테스트·에이전트 작업을 끝내고 해당 경로 밖으로 이동한다. 프로세스를 일괄 종료하지 않는다. 추가 사용자가 있거나 사용 여부를 판단할 수 없으면 보류한다.
3. 작업 결과의 커밋 보존을 확인하고 staged·unstaged·untracked 파일을 확인한다. 미커밋 결과가 있으면 승인된 원래 작업에서 먼저 보존하며 자동 stash·reset·clean으로 제거하지 않는다. PR이 없는 읽기 전용 검토 작업도 사용 종료와 ancestry가 확인되면 종료할 수 있다.
4. ignored 파일도 `git ls-files --others --ignored --exclude-standard -z`로 별도 목록 확인한다. `.env`, 로그, 보고서, 로컬 설정 등 필요한 파일이 남았으면 보존하거나 worktree를 유지한다. 일반 `git worktree remove`도 ignored 파일을 삭제할 수 있으므로 clean status만으로 폴더 삭제를 허용하지 않는다. 다른 디렉터리를 가리키는 junction/symlink/reparse point가 있거나 판별할 수 없으면 폴더 제거를 보류하고 유지/detach 경로를 택한다. 특히 `verification.md`의 Windows junction 경고를 보존하며 이번 절차에서 외부 디렉터리 링크를 재귀 삭제하지 않는다.
5. 자신이 만든 부가 worktree를 완전히 폐기할 수 있으면 정확한 경로에 `git worktree remove <path>`를 사용한다. `--force`, 잠금 해제, `rm -rf`, 일괄 prune으로 실패를 우회하지 않는다. 파일을 남겨야 한다면 자기 worktree를 동일 HEAD의 detached 상태로 전환해 브랜치 연결만 해제할 수 있다. 이 경우 폴더는 남았다고 기록한다.
6. 주 작업 디렉터리는 제거하지 않는다. 자기 작업이 끝났고 깨끗하며 다른 세션과 공유 중이 아님을 확인한 경우에만 사용 가능한 다른 브랜치로 전환하거나 동일 HEAD로 detach한다. 다른 worktree에서 사용 중인 `dev`로 강제 전환하지 않는다.
7. 깨끗한 남은 worktree에서 `npm run branches:cleanup -- --branch harness/example`로 재검사한다. `harness/example`은 확인한 실제 브랜치명으로 치환하며 꺾쇠 placeholder를 셸에 그대로 붙여 넣지 않는다. 통과하면 기존 승인 범위에서 같은 명령에 `--apply`를 붙인다. 브랜치 삭제는 이 스크립트만 수행한다.
8. 해제 성공 뒤 정리 실패, 검사 중 새 커밋, 원격 변경, 작업 취소는 보존 결과로 보고한다. 다음 실행은 현재 상태를 재검사하며 이전 preview를 삭제 권한으로 재사용하지 않는다.

이전 대화에서 발견한 기존 worktree들의 소유권·대량 삭제 상태·미추적 파일을 이 절만으로 해결된 것으로 간주하지 않는다. 기존 자료 일괄 정리는 별도 대상 확인이 필요한 작업이다.

## Affected Files

| 경로 | 변경 내용 | 리스크 |
| --- | --- | --- |
| `scripts/cleanup-task-branches.mjs` | ancestry 경로, 공통 보호 분리, worktree 진단, 결과 집계 | high: ref 삭제 판정 |
| `scripts/cleanup-task-branches.test.mjs` | 기존 fixture 재사용, 두 경로와 회귀·진단·경합 검증 | medium: 거부 테스트가 잘못된 경로를 타면 보호 약화를 놓침 |
| `AGENTS.md` | 정리 완료 조건과 자기 worktree 정상 종료 절차 수정 | medium: 다른 작업/승격 지침 보존 필요 |
| `docs/architecture/verification.md` | 정리 절의 판정·출력·안전 조건과 스크립트 표 설명 갱신 | medium: 코드와 규칙의 불일치 방지 |
| 이 제안서 | 실제 검증·완료 상태 기록 | low |

`package.json`의 `test:architecture`와 `test:scripts`는 기존 `.test.mjs`를 이미 발견하므로 명령을 추가하지 않는다. 소비자는 현재 CLI·직접 import하는 짝 테스트·규칙 문서다. 구현 시작 시 재검색해 새 소비자가 있으면 출력 호환성을 확인한다.

## Safety Analysis

- ancestry 경로는 단순 파일 내용 일치가 아니라 커밋 도달 가능성을 증명한다. 추가 로컬 커밋이 `dev`에 없으면 이 경로를 통과하지 못한다.
- 보존 증거와 열린 PR·worktree 사용·원격 브랜치 재사용은 독립적으로 검사한다. 갓 만든 빈 작업 브랜치도 사용 중이면 보호되며, 임시로 다른 브랜치로 전환한 채 계속 쓸 브랜치는 작업 주체가 정리 실행 전에 사용 상태를 명확히 해야 한다.
- PR/CI 검증 삭제를 전체 정책으로 확대하지 않는다. PR 증거 경로와 `dev` 병합/출시의 CI 게이트는 유지한다.
- dirty 실행 위치 차단을 유지한다. 진단을 위해 fetch·읽기 호출이 늘어도 ref 삭제 허용 조건을 완화하지 않는다.
- 사용 종료는 사람/에이전트의 절차이며 프로세스 전체를 자동으로 증명하지 않는다. 다른 작업의 worktree는 스크립트가 그대로 보존한다.
- 앱 라우팅·정적 자산·barrel export·타입 선언·DB·출하 plugin reader에는 변경이 없다. Node 스크립트의 import 부작용과 CLI 진입 가드는 유지한다.
- 코드·테스트·현재 계약 문서를 같은 구현 변경에 넣는다. 제안서만으로 기존 금지 규칙을 우회하지 않는다.

## Approval

승인 기록은 front matter를 단일 기준으로 사용한다. 최초 문서 작성·로컬 구현 이후의 통합 절차도 승인 범위에 반영했다. 이 완료 기록은 기존 사용자 worktree의 일괄 정리를 승인하지 않는다.

## Execution Plan

### Phase BRC: 정리 판정·진단·작업 종료 계약의 동시 적용

- satisfies: REQ-BRC-001, REQ-BRC-002, REQ-BRC-003, REQ-BRC-004, REQ-BRC-005, REQ-BRC-006
- preserves: INV-BRC-001, INV-BRC-002
- governed-by: CON-BRC-001, CON-BRC-002
- verified-by: VFY-BRC-01, VFY-BRC-02, VFY-BRC-03, VFY-BRC-04

진입 시 최신 `origin/dev`, 열린 PR, 현재 `AGENTS.md`와 관련 active 제안서를 확인한다. 현재 스크립트의 기준 회귀를 먼저 실행한다. 구현 중간의 미검증 스크립트를 실제 브랜치 삭제에 사용하지 않는다. 단계 전체가 통과하기 전에는 두 문서와 코드의 일부만 따로 병합하지 않는다.

#### TASK-BRC-01: 보존 판정 두 경로와 공통 보호 분리

- satisfies: REQ-BRC-001, REQ-BRC-002, REQ-BRC-003, REQ-BRC-006
- verified-by: VFY-BRC-01, VFY-BRC-02

`command`는 기존 `ok`/`output`을 유지하면서 원래의 `status: number | null`과 실행 오류/신호 종료 여부를 보존한다. 예외의 원문·stderr를 사용자 출력으로 노출하지 않는다. 이 내부 결과로 ancestry의 0/1/실행 실패를 구분하며 기존 `git`·`githubPages`·삭제 호출의 `ok` 사용은 유지한다.

`inspectCompletion`에서 열린 head PR·의존 PR·원격 동일성 검사를 양쪽 경로가 공유하게 한다. `arrayPages`의 배열 여부 검증만으로 충분하다고 보지 말고 판정 순서 5의 항목 검증을 추가한다. `ciReason`, PR head/merge 검사는 `merged-pr` 경로에 남긴다. 전역 원격/worktree 검사의 실패는 대상별 catch와 구분해 `cleanupTaskBranches`까지 중단 상태를 전달한다. 공개 함수의 인자와 import 경로는 유지하고 반환값에 `aborted`만 추가한다. `deleteLocalBranch`의 ref 정체성·최종 로컬 재검사를 유지한다.

기존 “PR 미병합·다른 저장소·CI 실패” 테스트는 대부분 일반 merge fixture를 사용한다. 그대로 두면 새 ancestry 경로를 타므로, 해당 **PR 증거 거부** 사례는 squash fixture로 옮기고 실제로 `sha`가 `dev`의 조상이 아님을 먼저 확인한다. 정상 ancestry에서 PR/CI가 필요 없다는 양성 사례와 혼동하지 않는다. 경합 주입도 `/actions/runs`에서만 작동하게 두지 말고 두 경로가 실제 방문하는 API 경계에 맞춘다.

양성 회귀도 경로를 고정한다. `uses all returned PR pages instead of treating the first page as complete`와 `verifies the repository, source branch and commit when GitHub drops PR links after branch deletion`은 squash fixture로 바꾸고 Actions 조회가 실제 실행됐는지 확인한다. 후자는 `pull_requests: []`여도 저장소·head branch·SHA 대조로 CI를 인정하는 기존 계약을 계속 검증해야 한다. ancestry 우회만으로 테스트가 통과하게 두지 않는다.

기존 의존 PR fixture의 `{ number: 10 }` 응답은 새 항목 검증에서 불완전하다. 정상 의존 PR 사례에는 `state: open`, 대상 `base.ref`, 같은 저장소의 `base.repo.full_name`을 함께 넣고, 원래 최소 응답은 malformed-response 거부 사례로 따로 유지한다. 테스트를 통과시키려고 항목 검증을 생략하지 않는다.

#### TASK-BRC-02: 차단된 브랜치까지 보존·worktree 진단 표시

- satisfies: REQ-BRC-003, REQ-BRC-004, REQ-BRC-006
- verified-by: VFY-BRC-02, VFY-BRC-03

`localReason`의 삭제 차단과 진단 수집을 분리한다. `cleanupTaskBranches`의 `pending`이 없다는 이유만으로 ancestry를 생략하던 흐름을 바꾼다. 유효하지 않은 ref는 즉시 제외하되 checkout/dirty 대상은 fetch 이후 보존 상태를 반환하고 API·삭제는 실행하지 않는다. NUL 레코드·경로 정체성·unknown 처리를 구현하고 중복 대상은 한 번만 검사한다. 기존 JSON 키를 유지하면서 위 출력 계약·집계·전역 중단 시 CLI exit 1을 추가한다. 전역 중단은 이미 쌓은 preview/보류 결과까지 다시 확정한 후 집계하며, 최종 삭제 거부도 증거/집계에 반영한다.

#### TASK-BRC-03: 현재 규칙과 작업 종료 절차 갱신

- satisfies: REQ-BRC-005
- verified-by: VFY-BRC-04

`AGENTS.md`의 “정리 완료는 최종 테스트 커밋의 병합 후” 문구를 두 경로와 공통 보호 기준으로 바꾼다. “정리를 위해 worktree를 제거하지 않는다” 문구는 다른 작업·dirty·종료 불명 worktree를 보호하도록 좁히고, 자기 작업 정상 종료 절차를 명시적으로 허용한다. 시작/종료 시 기존 정리 명령, 보호 브랜치 금지, PR 대상 `dev`, 승격 규칙은 보존한다.

`verification.md`의 정리 조건 2–6, 출력·부분 실패/exit 설명, 스크립트 표를 새 계약과 맞춘다. worktree 해제는 위 3절의 절차이며 스크립트 자동 기능이 아님을 명시한다. 인접 Windows junction 경고·CI 분류표·게이트 기록 절은 유지한다.

#### TASK-BRC-04: 전체 회귀와 적용 준비 확인

- satisfies: REQ-BRC-001, REQ-BRC-002, REQ-BRC-003, REQ-BRC-004, REQ-BRC-005, REQ-BRC-006
- verified-by: VFY-BRC-01, VFY-BRC-02, VFY-BRC-03, VFY-BRC-04

아래 검증을 실행하고 이 문서에 실제 결과를 기록한다. 인수용 제거는 자기 fixture worktree에서만 실행한다. 최종 실제 저장소 확인은 preview로 수행하며 실행 전후 브랜치·worktree 상태를 비교한다. 실제 자료 정리를 검증을 통과시키기 위한 작업으로 끼워 넣지 않는다. 구현 PR은 `dev` 대상이고 병합은 원래 승인 범위와 녹색 `check` 조건을 따른다.

## Verification Plan

테스트 작성·배치는 [test-writing.md](../../architecture/test-writing.md), [test-organization.md](../../architecture/test-organization.md)를 따른다. 새 사례는 기존 `scripts/cleanup-task-branches.test.mjs`에 둔다. Git 객체·ref·worktree는 실제 임시 저장소로 검사하고 GitHub만 기존 `github` 경계에서 대체한다. 소스 문자열·내부 함수 이름 일치로 삭제 안전성을 증명하지 않는다.

### VFY-BRC-01: 두 보존 경로의 양성·음성 대조

- verifies: REQ-BRC-001, REQ-BRC-002
- 상태: Executed — 아래 Phase BRC 로컬 구현 결과 참조. macOS 실행이며 다른 OS 인증을 뜻하지 않는다.

| fixture와 동작 | 기대 관찰 |
| --- | --- |
| PR 없음, 끝 커밋은 `dev`의 조상, 모든 공통 보호 통과 후 preview/apply | `ancestor`, preview ref 유지, apply 대상 ref만 삭제, Actions API 미호출 |
| 로컬 SHA는 병합 PR head와 다르지만 로컬 추가 커밋까지 `dev`에 포함 | `ancestor`로 통과 |
| ancestry는 참, 과거 CI 실패/누락 | CI 조회 없이 공통 보호로 판정. 병합/출시 게이트 변경 없음 |
| squash 및 실제 Git rebase로 재작성된 커밋, 원본 head는 조상 아님, 올바른 병합 PR·CI 제공 | `merged-pr`로 통과, 원래 커밋 ancestry에 의존하지 않음 |
| 미병합 추가 커밋 또는 PR head 불일치, ancestry 거짓 | 삭제 거부, ref·파일 보존 |
| ancestry 거짓, PR 단순 종료/잘못된 base·repo/merge 결과 부재/CI 실패·재실행·대기 | 기존 거부 계약 유지 |
| Git ancestry 검사 실패 또는 timeout | `unverified`, `inspection-failed`; PR 경로로 우회해 삭제하지 않음 |

### VFY-BRC-02: 보호 조건·경합·재실행

- verifies: REQ-BRC-003, REQ-BRC-006
- 상태: Executed — 아래 Phase BRC 로컬 구현 결과 참조. macOS 실행이며 다른 OS 인증을 뜻하지 않는다.

두 경로 모두에서 다른 페이지의 열린 head PR과 저장소 이름 대소문자 차이, 의존 PR, 다른 SHA로 재사용된 원격 브랜치, GitHub 오류, pagination 오류를 거부하는지 확인한다. `[{}]`, null 항목, null `head.repo`, 알 수 없는 `state`, 잘못된 dependent PR base를 정상 빈 목록과 대조해 `inspection-failed`와 실제 ref 보존을 검사한다. 로컬/원격 `main`·`dev` 보호와 symbolic ref·잘못된 입력 거부는 기존 회귀를 유지한다.

API 응답 경계에서 새 로컬 커밋·dirty 파일·checkout 연결·원격 `dev` 전진을 삽입하고 삭제가 거부되는지 검사한다. 대상 ref와 변경 파일이 실제 남아 있어야 한다. 두 경로의 경합 주입 지점이 실제 실행됐는지도 확인한다. 성공 후 재실행의 `branch-missing`, apply의 일부 성공 뒤 후속 대상 실패 보존, branch config 정리 실패의 `note`도 확인한다.

최소 세 대상 A/B/C로 A 삭제 후 B 검사에서 원격 보호 ref 누락/조회 오류/`dev` 전진 또는 worktree 목록 조회 실패를 삽입한다. A는 `deleted`, B/C는 `skipped`, `aborted: true`, JSON 집계와 CLI exit 1을 검사한다. 같은 순서의 preview에서는 앞서 `eligible`이던 A까지 `skipped`/`unverified`이고 최종 `eligible` 집계는 0이어야 한다. 별도 사례로 앞서 checkout 때문에 보류된 행에도 중단 사유가 추가되고 기존 사유가 유지되는지 검사한다. 반대로 B의 PR API 오류는 C 검사를 막지 않아야 한다. 두 별도 호출자가 같은 ref에 도달하도록 동기화해 하나만 삭제하고 다른 호출은 재검사/CAS로 보류하는 사례도 둔다. 이미 없는 ref와 중복 `--branch`는 각각 한 행으로 판정한다. 이 테스트를 전역 checkout/원격 PR 동시성의 원자적 보장으로 확대하지 않는다.

### VFY-BRC-03: 차단 상태 진단과 JSON 호환

- verifies: REQ-BRC-003, REQ-BRC-004, REQ-BRC-006
- 상태: Executed — 아래 Phase BRC 로컬 구현 결과 참조. macOS 실행이며 다른 OS 인증을 뜻하지 않는다.

clean/dirty/접근 불가/locked/prunable worktree와 공백 경로를 준비한다. 지원 OS에서는 개행 경로도 확인한다. 사유 문자열이 붙은 locked/prunable 레코드, 깨진 목록, `.git` 메타데이터가 사라진 저장소 하위 경로를 포함한다. checkout 대상에도 ancestry 진단이 나오고 파일·연결·ref가 유지되는지 확인한다. 실행 worktree가 dirty이어도 valid ref의 보존 진단은 가능하고 삭제·GitHub API는 호출하지 않아야 한다. 개별 경로 오류는 `unknown`, 전체 목록 오류는 전역 중단이며 상위 저장소의 clean 결과를 재사용하지 않아야 한다.

모두 checkout된 여러 ancestor 대상의 fixture에서 `ancestor`와 `worktreeInUse`는 대상 수, `eligible`·`deleted`는 0이어야 한다. 빈 목록, 중복 입력, 여러 차단 사유, 삭제 직전 상태 변경과 전역 중단에서도 두 집계 등식을 만족해야 한다. Node CLI 및 npm silent 실행의 stdout을 실제 JSON parser로 읽고 정상/대상별 보류의 exit 0과 전역 중단의 exit 1을 검사한다. 일반 npm banner는 CLI JSON 계약 밖이다. fixture 보조 명령뿐 아니라 `cleanupTaskBranches`와 CLI 자식에도 전역/시스템 Git 설정 격리를 적용하고 테스트 종료 후 환경을 복원한다. live GitHub에 의존하지 않는다.

### VFY-BRC-04: 종료 절차와 계약 문서 인수

- verifies: REQ-BRC-005
- 상태: Executed — 아래 Phase BRC 로컬 구현 결과 참조. macOS 실행이며 다른 OS 인증을 뜻하지 않는다.

자기 임시 저장소에 clean worktree를 만들어 commit 보존 → 작업 종료 → worktree remove 또는 동일 HEAD detach → 정리 API 적용 순서로 ref 삭제와 파일 보존 결과를 확인한다. dirty·미추적 파일·잠긴 worktree는 강제 제거 없이 남기는 대조군을 둔다. ignored 사용자 파일을 남기는 경우에는 파일을 유지한 detach 경로를 확인한다. 이 검증은 절차의 Git 효과를 확인하며 실제 사용자 세션의 사용 종료를 자동 증명하지 않는다.

자기 fixture의 외부 디렉터리를 가리키는 링크가 있는 경우 폴더 제거를 선택하지 않고 detach/유지했으며 외부 파일이 남는지 확인한다. Windows junction의 실제 제거 동작을 macOS symlink 시험으로 인증하지 않는다. 이번 변경은 해당 경계에서 제거하지 않는 절차를 명시하고 기존 Windows 경고를 보존한다.

문서 리뷰에서 보호 브랜치 금지, 두 증거 경로, ignored 파일 보존, 자기 작업 종료 조건, 실패 시 보류가 일치하는지 확인한다. 실제 저장소에 대해서는 preview와 사용 종료 불명 대상 보존만 확인한다.

### 실행 명령과 통과 기준

검증용 격리 worktree에 lockfile 기준 의존성을 설치한다. `npm run check`는 Prisma Client를 생성하지 않으므로 아래 준비를 먼저 실행한다. 같은 경로의 typegen·typecheck·build를 동시에 실행하지 않는다. 기존 저장소의 `node_modules`를 junction/symlink로 공유하지 않는다.

```bash
npm ci
npm run db:generate
```

CI 기준 Node는 `.github/workflows/check.yml`의 22다. 다른 로컬 버전의 결과는 버전을 함께 기록하고 CI 통과로 전용하지 않는다. 준비/검증 명령은 DB migrate·서버 시작·모델 호출을 하지 않으며 운영 `.env`를 복사하지 않는다. HTTP fixture·Turbopack을 위해 로컬 포트/자식 프로세스가 허용되는 실행 환경이 필요하다. 제한으로 실패하면 같은 baseline에서 원인을 기록하고 허용된 환경/CI에서 재검증한다. 실패를 숨기려고 build 명령이나 제품 코드를 바꾸지 않는다.

구현 시작 전과 변경 후의 핵심 회귀:

```bash
node --test scripts/cleanup-task-branches.test.mjs
```

구현 완료 시 저장소 필수 검사:

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm test
npm run build
git diff --check
npm run branches:cleanup
```

`check`에 lint·문서·CI 분류·Next typegen·TypeScript·`test:scripts`가 포함된다. `test:architecture`와 겹쳐도 저장소 필수 명령은 생략하지 않는다. 이 변경은 앱·DB 코드를 바꾸지 않으므로 DB 통합 리허설·실제 모델·운영 승격 게이트를 추가로 실행하지 않는다. 기존 CI는 원래 구성대로 수행한다.

수정 전 새 양성 사례가 PR 조건 때문에 실패하고 수정 후 통과하는지 확인한다. 거부 사례는 결과 코드와 실제 ref·파일 보존을 함께 단언한다. 기준 revision에서 재현한 실패만 기존 실패로 기록하며 다른 제안서의 실패 기록을 이 실행의 근거로 대신하지 않는다. 빌드·의존성·환경 부족은 미실행으로 기록하고 통과로 취급하지 않는다.

## Verification Results

Phase BRC의 코드·테스트·규칙 문서 구현, 로컬·CI 검증과 `dev` 통합을 완료했다. 아래 로컬 구현 결과와 CI·통합 결과가 최종 증거이며, 문서 작성/baseline 표는 구현 전 이력으로 보존한다.

| 확인 | 결과 | 한계 |
| --- | --- | --- |
| 현재 스크립트·짝 테스트·규칙·명령·소비자 대조 | 완료 | 소스 관찰이며 새 동작 검증 아님 |
| 작업 시작 `npm run branches:cleanup -- --apply` | 삭제 0개 | 기존 규칙으로 worktree 사용/열린 PR 대상 보존 |
| `validate_sdd_traceability.py` standard 및 `--strict` | PASS | 단일 문서, REQ 6개·Task 4개·VFY 4개, 요구사항의 Task/VFY 연결 6/6. 의미·Git 안전성의 자동 증명 아님 |
| `inspectDocs`에 tracked 목록과 신규 파일을 명시적으로 전달, `parseFrontMatter` 검사 | PASS | Markdown 214개·상대 링크 1,043개·보고서 59개, 문제 0개. proposal 필수 metadata와 pending/awaiting-approval/standard 확인 |
| 신규 파일의 `git diff --no-index --check` | 공백 오류 없음 | 신규 파일 차이로 exit 1, 오류 출력 없음 |
| 최초 문서 작성 시 VFY-BRC-01–04 | 당시 Not run yet | 현재 실행 결과는 아래 구현 결과에 기록 |

### Phase BRC 로컬 구현 결과

2026-11-12, `origin/dev` `296407f1badd611c2518cc71c9aac9015b6148a5`에서 만든
`harness/local-branch-cleanup-20261112`에서 구현했다. 사용자가 요청한 실제 코드 수정과
검증 범위였으며, 이 로컬 검증 시점에는 PR 병합·배포·기존 사용자 자료의 일괄 정리를 수행하지 않았다. 이후 통합은 아래 CI·통합 결과에 기록한다.

- 환경: macOS arm64, Node 26.4.0, npm 11.17.0, Git 2.50.1.
- 구현 목적지는 Affected Files의 다섯 파일이다. dependency·npm 명령·CI workflow·plugin·앱·DB 코드는 변경하지 않았다.
- `cleanup-task-branches.mjs` SHA-256: `467ccf5cb2413986c858c41e1085ea52cfea858d79e9bff1050ea71cf043910c`.
- `cleanup-task-branches.test.mjs` SHA-256: `3772e13e89c8f0bd053d700adf69f0e8d70df6e8563eea07228ff49b3a7e7fa8`.
- fixture는 실제 임시 Git 저장소/bare origin을 사용한다. GitHub 응답과 Git 명령 오류만 경계에서 대체하며, 테스트 전체와 CLI 자식의 Git 설정을 격리한다.

| 검증 | 결과 | 범위 |
| --- | --- | --- |
| ancestry/checkout 진단 신규 회귀 | 수정 전 2 fail → 구현 후 2 pass | PR 없는 ancestor 정리와 checkout 상태의 보존 진단 |
| 저장소 대소문자 회귀 | 수정 전 2 fail → 보완 후 통과 | 두 보존 경로의 열린 PR 보호. branch 이름은 정확히 비교 |
| 독립 검토 후 집중 회귀 | 12 pass, 0 fail | 두 경로, CLI 정상/보류·npm silent, 설정 격리, 외부 디렉터리 링크 보존 |
| `npm run verify:fsd`, `npm run verify:server` | PASS | 기존 아키텍처 경계 |
| 최종 `npm run test:architecture` | 321 pass, 0 fail, 2 skip | 수정한 브랜치 회귀 전체와 기존 도구 회귀. skip은 조건부 플랫폼 사례 |
| 최종 `npm run check` | PASS; scripts 421 pass, 0 fail, 2 skip | lint·문서·CI 분류·typegen·타입·script 시험 |
| `npm test` | 639 pass, 0 fail, 41 skip | 기존 core/GitHub/plugin 회귀. 환경·플랫폼 조건부 skip은 유지 |
| `npm run build` | PASS | 격리 worktree, Prisma 생성 및 기본 Turbopack production build. 별도 migration/운영 연결 없음 |
| 실제 저장소 Node CLI preview | PASS, 삭제 0개 | 관찰 시 total 8, ancestor 7, unverified 1, worktreeInUse 7, eligible 0, skipped 8. dirty 실행 위치 보호. 수량은 시점 정보 |
| 독립 정적 검토 | PASS | 대소문자 동일성·두 경로 보호·설정 격리·CLI/디렉터리 링크 인수를 보강한 뒤 잔여 오류 없음 |
| `git diff --check`, SDD strict 검사 | PASS | 공백 및 REQ–Task–VFY 구조 |

GitHub owner/repository 이름은 대소문자를 구분하지 않는다는
[공식 API 계약](https://docs.github.com/en/rest/repos/repos#get-a-repository)을 적용했다.
이 보완은 새 ancestry 경로가 열린 PR을 놓치지 않도록 하는 공통 보호 구현이며,
별도 worktree 관리 도구나 추가 삭제 정책을 도입하지 않는다.

VFY-BRC-01은 ancestry/실제 rebase/squash·CI 양성/음성으로, VFY-BRC-02는 두 경로의
PR·원격 재사용·커밋/dirty/checkout 경합 및 A/B/C 부분 중단으로 확인했다.
VFY-BRC-03은 손상된 registry·개행/공백 경로·unknown·JSON·집계·exit으로,
VFY-BRC-04는 소유 fixture의 remove/detach·ignored 파일·외부 디렉터리 링크 보존으로
확인했다. 실제 사용 종료는 사람/에이전트의 절차이며 Windows junction 실행 인증은
이 macOS 결과에 포함하지 않는다. 테스트는 Windows에서 junction을 만드는 분기를 포함한다.

### CI·통합 결과

2026-11-12 구현 커밋 `18ba25043c53fc2c2174c3844f1108ab9a7157dc`의
[check #863](https://github.com/Sangeok/stagekeeper/actions/runs/43159318364)가 성공한 뒤
[PR #328](https://github.com/Sangeok/stagekeeper/pull/328)을 `dev`에 병합했다.

| 확인 | 결과 | 범위 |
| --- | --- | --- |
| PR `check` | 6개 job 모두 success | static, test, test-web, server, build, server-integration. Linux / Node 22 |
| `dev` 병합 | `11dd700b74cd7cef7e0309d8b67d6eb051db76ae` | 검증한 head SHA를 지정해 병합하고 fetch 후 구현 커밋의 포함 여부 확인 |
| 구현 파일 보존 | 스크립트와 테스트의 SHA-256이 위 로컬 검증 기록과 일치 | 통합 과정에서 구현 코드 변경 없음 |

로컬 macOS 결과와 Linux CI 결과를 구분한다. Windows junction 제거 동작의 실제 인수,
기존 사용자 worktree 일괄 정리, `main` 승격과 배포는 이 완료 범위에 포함하지 않는다.

### 구현 전 baseline 이력

2026-11-12 정합성 검토에서 별도 worktree의 동일 baseline(`eabd138`)으로 실행한 기록:

| 명령/확인 | 결과 | 해석 |
| --- | --- | --- |
| `npm ci`(격리 cache, audit/fund 생략), `npm run db:generate` | PASS | Node 26.4.0 / npm 11.17.0 / Prisma 7.10.1. 실제 CI Node 22 결과와 구분 |
| `node --test scripts/cleanup-task-branches.test.mjs` | 39 pass, 0 fail | 기존 보호 동작 회귀 |
| `npm run verify:fsd`, `npm run verify:server` | PASS | 변경 전 경계 검사 |
| `npm run test:architecture` | 264 pass, 3 fail, 2 skip | eval 출력 시간 제한 1건, rehearsal CLI 자식 시간 제한 2건. 실패 소유 파일을 아래에서 별도 재검증 |
| `npm run check` | lint·문서·CI 분류·typegen·타입 통과, scripts 366 pass / 1 fail / 2 skip | 남은 실패는 동일 eval 출력 시간 제한. 전체 suite 통과로 보고하지 않음 |
| `node --test scripts/rehearsals/codex-init-eval.test.mjs` | 4 pass, 0 fail | 앞선 eval 실패 파일의 단독 실행 |
| `node --test scripts/rehearsals/rehearsal-cli.test.mjs` | 7 pass, 0 fail | 앞선 rehearsal 실패 파일의 단독 실행. suite 전체 재통과 증거는 아님 |
| `npm test` | 최초 제한 환경 실패, 권한 확장 재실행 639 pass / 0 fail / 41 skip | 최초 실행에서 다수 `listen EPERM` 관찰. 실제 모델·운영 DB 실행 없음 |
| `npm run build` | 실패, 권한 확장 재실행도 동일 | Turbopack의 자식 프로세스/포트 바인딩 `Operation not permitted`. 빌드 통과는 미확인; 허용된 환경/CI에서 동일 명령 재검증 필요 |
| 임시 Git 저장소 동작 대조 | PASS | ancestry 0/1/128 구분, stale SHA 삭제 거부, ignored 파일의 일반 remove 시 소멸·detach 시 보존, locked 사유 레코드·제거 거부, 메타데이터 소실 시 상위 저장소 탐색 확인 |
| `npm --silent run branches:cleanup` stdout JSON parse | PASS | dirty 실행 위치에서 기존 스크립트의 보류 응답. 새 출력 필드는 아직 구현 전 |

### 정합성 검토에서 반영한 수정

처음부터 개선점이 없는 문서는 아니었다. 코드와 독립 검토로 확인한 다음 구현 누락/모순을 해당 본문·Task·VFY에 반영했다.

- 내부 명령 결과가 버리던 종료 코드·실행 오류를 보존해 ancestry의 정상 음성과 실행 실패를 구분하도록 했다.
- 새 ancestry 경로에서 불완전한 PR 항목을 “열린 PR 없음”으로 오판하지 않도록 응답 항목 검증과 fixture 갱신을 명시했다.
- 초기 실패의 삭제 0개와 적용 도중 전역 실패의 부분 결과를 구분하고, 이전 preview/보류 행의 재판정·`aborted`/exit 1·서로 다른 호출자의 경합 검증을 명시했다.
- worktree 목록 실패·사유 있는 flag·경로 정체성·unknown, 변경된 SHA와 중복 입력의 진단/집계 규칙을 보완했다.
- Node CLI JSON과 npm banner를 구분하고, ignored 파일·외부 디렉터리 링크·Windows junction을 보존하는 종료 절차를 구체화했다.
- Prisma 생성 준비와 검증 순서·실행 환경·기준 실패의 구분을 추가하고, 기존 PR pagination·빈 `pull_requests` 양성 회귀가 CI를 실제 검사하도록 fixture 경로를 지정했다. 별도의 무수정 최종 검토 전에는 이 수정 자체를 clean-pass 증거로 취급하지 않는다.

## Selected-Phase Readiness

Phase BRC는 구현·검증과 `dev` 통합까지 완료했다. 승인 범위는 front matter에 기록했다. 현재 코드의 정상·실패·부분 중단 결과와 독립 검토를 확인했고, 사용 중인 실제 worktree의 해제나 배포를 이 결과로 승인하지 않는다.

다음은 구현 당시 적용한 진입/중단 조건이다.

- 구현 시작 시 함수·출력 소비자·규칙이 달라졌으면 차이를 먼저 대조하고 안전 조건을 유지할 수 없는 충돌에서는 중단한다.
- 코드와 규칙 문서의 변경을 함께 반영한다. 미반영 계약을 제안서로 우회하지 않는다.
- 원격 보호 브랜치·API 증거·Git 결과가 불명확하면 실제 삭제를 진행하지 않는다.
- 기존 worktree의 소유권·변경 보존 미확인은 구현 fixture 검증의 blocker가 아니며, 그 worktree를 실제 해제하는 시점의 중단 조건이다.
- 구조 검증은 이 단일 문서의 REQ–Task–VFY를 대상으로 standard와 strict를 실행한다. 의미 검토는 두 판정 경로, 공통 보호, 출력 호환, fixture 경로 선택, 종료/실패/경합/재실행을 별도로 확인한다.

## Risks and Rollback

- ancestry는 커밋 이력 보존의 증거이지 사용 종료나 현재 기능 유지의 증거가 아니다. 이후 revert가 있어도 이력은 포함될 수 있다. 열린 PR·worktree와 작업 종료 절차를 따로 적용한다.
- 로컬 차단 대상도 fetch와 Git 검사를 하므로 기존보다 preview 시간이 늘 수 있다. API는 로컬 보호 통과 대상에만 호출하며 현재 명령 timeout을 유지한다.
- ignored 파일은 일반 status에 나타나지 않는다. worktree 폴더 삭제 전 별도 목록·보존 확인이 필요하다.
- 동시 checkout의 모든 경합을 원자적으로 막는 전역 잠금은 없다. 삭제 직전 재검사와 expected SHA는 유지하되, 타 세션의 사용 종료를 추정하는 자동화를 추가하지 않는다.
- 코드 롤백은 구현 커밋의 검토된 revert로 수행한다. 사용자 파일이나 원격 ref는 원래 스크립트의 쓰기 대상이 아니다.
- 삭제 결과의 전체 `branch`/`sha`/보존 증거를 실행 기록에 남긴다. 잘못 정리한 로컬 이름은 해당 객체가 존재함을 확인한 뒤 동일 SHA로 재생성할 수 있다. squash/rebase 원본 객체는 GC 뒤 사라질 수 있으므로 SHA 기록만으로 영구 복구를 보장하지 않는다. 실제 복구에서는 원본 PR ref/백업의 존재를 확인하고 다른 이름의 새 작업을 덮어쓰지 않는다.
- worktree 폴더 제거는 스크립트가 수행하지 않는다. 작업 주체의 파일 보존 절차를 생략해 생긴 파일 손실은 코드 revert로 복원되지 않는다.

## Completion or Closure Notes

구현 커밋 `18ba250`의 로컬 검증과 PR CI를 확인한 뒤 #328을 `dev`의 `11dd700`으로 병합했다. 문서 상태를 `completed`, `stage: null`로 갱신하고 `completed/2026-11-12-local-branch-cleanup.md`로 이동했다.

Phase BRC의 미완료 구현 항목은 없다. 기존 worktree를 모두 없애는 것은 완료 조건이 아니며, 소유권·사용 종료를 확인하지 못한 작업 폴더와 사용자 자료는 보존한다. Windows junction 제거 인수와 `main` 승격·배포는 이번 완료 범위 밖에 남는다.

## Review Checklist

- [x] 구현 대상 함수·파일·호출자와 관찰 기준 revision을 확인했다.
- [x] 직접 포함과 PR 증거 경로의 판정·실패·공통 보호 조건을 구분했다.
- [x] 현재 계약에서 수정할 문구와 그대로 유지할 규칙을 명시했다.
- [x] 작업 주체의 절차와 스크립트 자동 동작을 구분했다.
- [x] 기존 PR/CI 거부 테스트의 fixture 전환과 경합 주입 위치를 지정했다.
- [x] 사용자 파일·protected ref·원격 ref·출하 코드의 변경 경계를 명시했다.
- [x] REQ–Task–VFY와 실행 명령·관찰 결과·복구 한계를 연결했다.
- [x] 실제 구현과 검증 완료 후 결과·승인·완료 metadata를 갱신했다.
