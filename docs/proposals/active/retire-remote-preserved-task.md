---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-22"
approved-by: "user"
approved-at: "2026-11-22"
approval-scope: "보존 조건 구현과 시험, AGENTS.md와 verification.md 규칙 수정, dev 대상 PR 생성. PR 병합과 두 잔여 작업의 push·retire는 제외."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/pr-worktree-closeout.md"
  - "docs/proposals/active/merged-task-cleanup-at-start.md"
  - "docs/architecture/verification.md"
  - "AGENTS.md"
---

# 원격에 보존된 미병합 작업을 retire로 닫기

## Summary

`npm run pr -- retire`가 로컬 작업 트리와 브랜치를 지우는 조건에 "원격 `origin`의 같은 이름 브랜치가 같은 커밋을 가리킨다"를 추가한다. 지금은 작업의 커밋이 `dev`에 들어 있을 때만 `retire`가 통과하므로, 병합하지 않기로 한 작업은 닫을 방법이 없다. 규칙이 `git branch -D`도 금지하므로 그런 작업은 로컬에 계속 남는다. 바뀌는 것은 보존 증거 한 가지이고, 열린 PR 차단, 파일 검사, 사용 관측, 소유자의 명시적 호출은 그대로다.

## Goal

- 병합하지 않고 끝낸 작업을 관리 도구로 닫을 수 있게 한다.
- 로컬에서 지우기 전에 커밋이 다른 곳에 남아 있음을 도구가 확인하게 한다.
- 작업 유형: 관리 CLI의 삭제 허용 조건 확장, 운영 규칙 수정.

## Proposal Size

`proposal-size`: standard. 미병합 커밋을 가진 로컬 브랜치의 삭제를 처음으로 허용한다. 고치는 파일은 5개 안팎이다.

## Current State

2026-11-22의 `origin/dev` 커밋 `5da3a0fe31c393d28d222269ab2ff4725da69983`를 기준으로 확인했다.

- `retire`는 `scripts/pr/index.mjs`의 `taskCommand`에서 PR이 없거나 닫힌 미병합 PR일 때만 진행하고, `ancestor(expectedHead, remote.dev)`가 거짓이면 `head-not-in-dev`로 거부한다.
- 이어지는 `cleanup`은 작업 트리 제거 전과 브랜치 삭제 전에 `scripts/pr/github-merge.mjs`의 `preservation`을 각각 호출한다. `purpose`가 `retire`이면 여기서도 `dev` 조상 여부만 본다.
- `preservation`은 원격 브랜치가 있는데 봉인된 head와 다르면 `remote-branch-reused`로 거부한다. 원격 브랜치가 같은 head인 경우는 통과만 하고 증거로 쓰지 않는다.
- `create`는 원격에 같은 이름의 브랜치가 이미 있으면 `remote-branch-exists`로 거부한다. 따라서 등록된 작업의 원격 브랜치는 그 작업에서 올린 것이다.
- `sweep`은 병합이 확인된 작업만 다루고 `retire` 목적의 작업은 건너뛴다.

### 지금 닫을 수 없는 작업

| 작업 브랜치 | PR | 원격 브랜치 | 로컬 head | 지금 `retire` 결과 |
| --- | --- | --- | --- | --- |
| `harness/background-liveness-diagnosis` | #405 닫힘, 미병합 | 같은 커밋 `16e66e0` | `16e66e0` | `head-not-in-dev` |
| `harness/task-start-cleanup-proposal` | 없음 | 없음 | `310f2de` (로컬에만 있는 커밋 5개) | `head-not-in-dev` |

두 작업 모두 작업 트리에 미커밋 변경이 없다. 첫째는 병합하지 않기로 한 실험이고, 둘째는 PR #414로 대체된 이전 설계다.

## Scope

포함 범위:

- `retire` 진입 검사와 `preservation`의 보존 조건 확장.
- 거부 코드 `head-not-in-dev`를 `head-not-preserved`로 변경.
- 시험, `AGENTS.md`, `docs/architecture/verification.md`의 `retire` 설명.
- 병합하지 않고 끝내는 작업을 `retire`로 닫을지 사용자에게 묻는 에이전트 규칙.

제외 범위:

- 도구가 대신 push하는 기능. 원격에 올리는 것은 작업자가 `git push`로 한다.
- `sweep`이나 `create`에서의 자동 `retire`. 버릴지 여부는 도구가 판단할 수 없다. 닫힌 PR도 신호로 쓰지 않는다. 병합 없이 닫힌 PR 3건(#120, #268, #405) 중 #405는 닫힌 뒤 다시 열린 적이 있다.
- `retire`가 `cleanup-pending`으로 보류된 작업의 자동 재시도. 원장의 작업 36개 중 `retire`로 처리된 것이 없어 근거가 될 사례가 없다. 보류된 작업은 기존대로 `cleanup`을 다시 실행한다.
- 닫힌 PR의 `refs/pull/<n>/head`를 보존 증거로 쓰는 것. 원격 브랜치가 지워진 경우에는 다시 push하면 같은 조건으로 닫을 수 있다.
- 원격 브랜치 삭제와 정리.
- 미등록 작업 트리, 원장 형식, 사용 관측, Windows 처리.
- 위 표의 두 작업을 실제로 닫는 일. PR이 병합된 뒤 별도 승인을 받아 수행한다.

## Proposal

### 작업자가 보게 될 흐름

1. 버릴 작업의 커밋이 원격에 없으면 `git push origin harness/<topic>`으로 올린다. 이미 올라가 있으면 생략한다.
2. PR이 열려 있으면 닫는다.
3. 관리용 체크아웃에서 `npm run pr -- retire --task <id> --owner <owner> --expected-state <oid> --expected-head <sha> --expected-instance <uuid> --request-id <uuid> --usage-ended`를 실행한다. 닫힌 PR이 있으면 `--pr <번호>`를 붙인다.
4. 도구가 검사를 통과하면 작업 트리와 로컬 브랜치를 지우고 `retired`로 기록한다. 원격 브랜치는 남는다.

### REQ-RRP-001 — 보존 조건

`retire`는 다음 둘 중 하나가 이번 호출에서 확인될 때만 진행한다.

- 작업 head가 방금 가져온 `dev`의 조상이다. (기존 조건)
- `git ls-remote`로 읽은 `origin`의 `refs/heads/<작업 브랜치>`가 작업 head와 같은 커밋이다. (추가 조건)

원격 브랜치가 없거나 다른 커밋이면 추가 조건은 성립하지 않는다. 다른 커밋이면 기존대로 `remote-branch-reused`로 거부한다. 원격 추적 ref(`refs/remotes/origin/...`), 다른 이름의 브랜치, `refs/pull/<n>/head`, 태그는 증거로 쓰지 않는다.

### REQ-RRP-002 — 삭제 직전 재확인

`cleanup`이 작업 트리 제거 전과 브랜치 삭제 전에 호출하는 `preservation`에도 같은 조건을 적용한다. 작업 트리를 지운 뒤 원격 브랜치가 사라지거나 바뀌면 로컬 브랜치는 지우지 않고 `cleanup-pending`으로 남긴다.

### REQ-RRP-003 — 유지하는 차단

다음은 바꾸지 않는다.

- 열린 PR이 있거나 이 브랜치를 base로 하는 열린 PR이 있으면 거부한다(`retire-pr-not-closed`, `open-dependent-pr`).
- 병합된 작업은 `retire`로 분류하지 않는다(`purpose-conflict`).
- 로컬 head가 `--expected-head`와 다르거나 미커밋 변경, 잠금, 외부 링크가 있으면 거부한다.
- 사용 관측이 인정되고 비어 있을 때만 작업 트리를 지운다. Windows와 미검증 환경에서는 `cleanup-pending`으로 남는다.
- `--usage-ended`와 소유자, 상태 OID, 인스턴스 ID가 필요하다.

### REQ-RRP-004 — 거부 코드

두 보존 조건이 모두 성립하지 않으면 `head-not-preserved`를 낸다. `head-not-in-dev`는 원격에 올리면 된다는 사실을 가리지 않도록 이 이름으로 바꾼다. 이전 리비전이 원장에 남긴 `head-not-in-dev` 문자열은 그대로 읽힌다.

### REQ-RRP-005 — 중단할 때 묻는 규칙

`AGENTS.md`에 다음을 추가한다.

- 작업을 병합하지 않고 끝내게 되면(사용자가 중단을 지시했거나, PR을 병합 없이 닫았거나, 다른 작업으로 대체됐을 때) 에이전트는 그 작업을 `retire`로 닫을지 사용자에게 묻는다. 커밋이 원격에 없으면 push가 필요하다는 것도 함께 묻는다.
- 사용자가 그 작업을 지정해 승인한 경우에만 push와 `retire`를 실행한다. 진행하라는 일반적인 지시를 승인으로 해석하지 않는다.
- 승인이 없으면 작업 트리와 브랜치를 그대로 두고 경로와 이유를 보고한다.

`create`와 `sweep`이 보류로 보고하는 작업 가운데 병합되지 않은 것은 이 질문의 대상이다. 세션이 끝나면서 남은 작업은 그 보고에서 드러난다.

### 별도 플래그를 두지 않는 이유

`--preserved-on-remote` 같은 확인 플래그를 추가하지 않는다. `retire`는 이미 작업 하나를 지정해 사용 종료를 선언하는 명시적 호출이고, 추가 조건은 도구가 직접 확인하는 사실이다. 플래그는 호출자가 이미 한 결정을 한 번 더 적게 할 뿐 검사를 늘리지 않는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `scripts/pr/index.mjs` | update | `retire` 진입 검사 한 곳에 추가 조건을 넣는다. | high. 미병합 커밋의 로컬 삭제를 허용하는 지점이다. |
| `scripts/pr/github-merge.mjs` | update | `preservation`의 `retire` 분기에 같은 조건을 넣는다. 두 곳이 같은 함수를 쓰게 한다. | high |
| `scripts/pr/lifecycle.test.mjs` | update | 아래 인수 사례. 기존 시험 파일에 추가하므로 CI 단계는 늘지 않는다. | low |
| `scripts/pr/task-state.mjs` | keep | 원장 형식을 바꾸지 않는다. | none |
| `scripts/pr/merged-sweep.mjs` | keep | 자동 정리 대상은 그대로다. | none |
| `AGENTS.md`, `docs/architecture/verification.md` | update | `retire` 설명의 "already an ancestor of fresh dev" 조건과 거부 코드를 고친다. | medium. 에이전트가 따르는 규칙이다. |

## Safety Analysis

- 삭제 시점에 작업 head는 `dev` 또는 `origin`의 같은 이름 브랜치에서 도달 가능하다. 둘 다 아니면 지우지 않는다.
- 증거는 호출 중 `git ls-remote`로 읽은 값이다. 로컬에 캐시된 원격 추적 ref는 오래됐을 수 있어 쓰지 않는다.
- 미커밋 자료는 기존 파일 검사가 막는다. 허용 캐시 밖의 ignored 파일도 같다.
- 자동 경로(`create`, `sweep`)는 이 조건을 쓰지 않는다. 미병합 작업은 누군가 `retire`를 호출해야만 지워진다.
- `main`과 `dev`는 삭제 입력이 될 수 없다는 기존 보호를 그대로 쓴다.
- 원장 형식이 같으므로 이전 리비전의 관리용 체크아웃도 같은 원장을 읽는다. 이전 리비전의 `retire`는 계속 `dev` 조상만 인정한다.

확인한 항목:

- [x] 호출 지점: 보존 조건을 판정하는 곳은 `taskCommand`의 `retire` 분기와 `preservation` 두 곳뿐이다.
- [x] 테스트 참조: `head-not-in-dev`를 단언하는 시험은 `scripts/pr/lifecycle.test.mjs` 한 곳이다.
- [x] 출시된 plugin·서버와 함께 쓰는 상태: 해당 없음. 로컬 Git ref의 개발 도구 원장이다.
- [x] 작업 트리 제거와 브랜치 삭제 사이에 원격이 바뀌는 경우: VFY-RRP-03에서 확인했다.

## Approval

승인 메모:

- 추가 조건 없음.
- PR 병합과 두 잔여 작업의 push·`retire`는 별도 승인을 받는다.

## Execution Plan

### TASK-RRP-01 — 보존 조건

- `preservation`의 `retire` 분기를 "dev 조상이거나 원격 브랜치가 봉인된 head와 같다"로 바꾼다.
- `taskCommand`의 `retire` 진입 검사가 같은 판정을 쓰게 한다.
- 거부 코드를 `head-not-preserved`로 바꾼다.

### TASK-RRP-02 — 시험

- VFY-RRP-01~03의 사례를 기존 시험 파일에 추가한다.

### TASK-RRP-03 — 규칙 문서

- `AGENTS.md`의 `retire` 항목과 `docs/architecture/verification.md`의 "수동 제거 인수와 retire" 절을 고친다.
- `AGENTS.md`에 REQ-RRP-005의 규칙을 추가한다.

## Verification Plan

### VFY-RRP-01 — 원격 보존으로 닫기

- PR 없는 작업에 커밋을 만들고 원격에 같은 커밋의 브랜치를 둔 뒤 `retire`하면 작업 트리와 로컬 브랜치가 사라지고 `retired`가 된다.
- 닫힌 미병합 PR이 있고 원격 브랜치가 같은 커밋이면 `--pr`과 함께 같은 결과가 난다.
- 두 경우 모두 원격 ref가 바뀌지 않고 GitHub 쓰기 요청이 0건이다.

### VFY-RRP-02 — 계속 거부되는 경우

- 원격 브랜치가 없고 `dev`에도 없으면 `head-not-preserved`.
- 원격 브랜치가 다른 커밋이면 `remote-branch-reused`.
- PR이 열려 있으면 `retire-pr-not-closed`, 이 브랜치를 base로 하는 열린 PR이 있으면 `open-dependent-pr`.
- 각 경우 작업 트리와 로컬 브랜치가 그대로다.

### VFY-RRP-03 — 삭제 직전 변화

- 작업 트리 제거 뒤 원격 브랜치가 삭제된 상태에서 `cleanup`을 실행하면 로컬 브랜치가 남고 `cleanup-pending`이다.

### 공통

- `node --test scripts/pr/*.test.mjs`
- `npm run verify:fsd`, `npm run verify:server`, `npm run verify:shared`, `npm run test:architecture`, `npm run check`
- CI의 `check` 워크플로(Windows·macOS `task-worktrees`).

## Verification Results

2026-11-22, Darwin 25.2.0 arm64, Node v26.4.0에서 실행했다.

| 검증 | 결과 |
| --- | --- |
| VFY-RRP-01 | pass. `lifecycle.test.mjs`의 "retire removes an unmerged task whose head is on its remote branch…". PR 없는 작업과 닫힌 PR 작업이 `retired`가 되고 원격 ref와 GitHub 쓰기 0건이 유지됐다. |
| VFY-RRP-02 | pass. "retire keeps an unmerged task whose remote branch is missing or moved…". `remote-branch-reused`, `head-not-preserved`, `open-dependent-pr`, `retire-pr-not-closed` 각각에서 원장 단계가 `working`이고 작업 트리와 브랜치가 남았다. |
| VFY-RRP-03 | pass. "a remote branch deleted after the worktree is gone keeps the local branch…". 원격 브랜치를 되돌린 뒤의 `cleanup`은 `retired`로 끝났다. |
| `node --test scripts/pr/*.test.mjs` | 61개 중 59 pass, 2 skip(기존 조건부 건너뜀), 0 fail |
| `verify:fsd`, `verify:server`, `verify:shared`, `test:architecture`, `check` | 모두 exit 0 |

CI의 Windows·macOS 결과는 PR에서 확인한다.

## Risks and Rollback

잔여 리스크:

- PR이 없는 작업을 닫은 뒤에는 원격 브랜치가 그 커밋의 유일한 사본이다. 누군가 원격 브랜치를 지우면 커밋을 찾을 수 없게 된다. 닫힌 PR이 있는 작업은 GitHub이 `refs/pull/<n>/head`로 커밋을 계속 보관한다.
- 버려진 작업마다 원격 브랜치가 하나씩 남는다. 이 제안은 원격 정리를 다루지 않는다.
- 원격 브랜치가 남아 있는 동안 `create`는 같은 브랜치 이름을 `remote-branch-exists`로 거부한다. 닫은 작업의 이름은 다시 쓸 수 없다.
- REQ-RRP-005는 에이전트가 따르는 문서 규칙이다. 에이전트가 중단을 인지하지 못한 작업은 다음 `create`의 보류 보고에서야 드러난다.
- 소유자 문자열은 인증이 아니므로, 다른 세션이 아직 필요한 작업을 `retire`할 수 있다. 지금의 `complete`·`retire`와 같은 한계이고, 이 경우에도 커밋은 원격에 남는다.
- 사용 관측은 호출자와 같은 OS 계정의 프로세스만 본다.

롤백 방법:

- 조건을 추가한 커밋 하나를 되돌리면 `retire`는 다시 `dev` 조상만 인정한다.
- 이미 닫은 작업의 로컬 브랜치는 `git fetch origin harness/<topic>`으로 원격에서 다시 받을 수 있다.
- `retire` 도중 보류된 작업은 `inspect`와 기존 `cleanup`으로 작업별 확인한다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):
