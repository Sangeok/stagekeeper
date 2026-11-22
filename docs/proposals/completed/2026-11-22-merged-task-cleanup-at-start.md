---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-21"
approved-by: "user"
approved-at: "2026-11-21"
approval-scope: "정리 검사와 sweep 연산의 구현·시험, AGENTS.md와 verification.md 규칙 수정, dev 대상 PR 생성. PR 병합과 기존 사용자 작업의 실제 정리는 제외."
completed-at: "2026-11-22"
verification-summary: "PR #414, #417의 check 통과(Windows·macOS task-worktrees 포함). 병합 뒤 실제 저장소에서 sweep이 사람이 병합한 작업 1건을 PR 번호 없이 정리하고 병합되지 않은 작업 2건을 보류했다."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/pr-worktree-closeout.md"
  - "docs/proposals/active/rename-pr-command-to-task.md"
  - "docs/architecture/verification.md"
  - "AGENTS.md"
---

# 다음 작업을 시작할 때 병합된 작업 정리하기

## Summary

`npm run pr -- create`로 새 작업을 만들 때, 등록된 기존 작업 중 PR이 `dev`에 병합됐고 병합 뒤 변경이 없으며 사용 중이 아닌 것의 작업 트리와 로컬 브랜치를 제거한다. 지금은 누군가 작업마다 `complete`를 실행해야만 정리되므로, 사람이 GitHub에서 병합한 작업은 계속 남는다. 삭제 근거에 "소유자의 사용 종료 선언" 외에 "도구가 이번 호출에서 직접 확인한 사실"을 추가하는 것이 이 제안의 핵심 결정이다. 삭제 전 검사와 제거 절차는 기존 `complete`의 병합 확인 경로를 그대로 쓴다.

## Goal

- 사람이 GitHub에서 병합한 작업이 별도 마무리 명령 없이도 로컬에 남지 않게 한다.
- 정리 여부가 에이전트나 사람이 명령을 기억하는지에 좌우되지 않게 한다.
- 작업 유형: 관리 CLI에 동작 추가, 운영 규칙 수정.

## Proposal Size

`proposal-size`: standard. 이전 세션이 남긴 파일과 브랜치를 삭제하는 시점을 바꾸고, 5개 이상의 파일을 고친다. 설계 위험도는 HIGH-RISK다.

## Current State

2026-11-21의 `origin/dev` 커밋 `6ac1513e618ac22773cd4b73075056868993f5bb`를 기준으로 확인했다.

| 현재 동작 | 이번 변경에서의 의미 |
| --- | --- |
| 정리는 `complete`·`cleanup`·`retire`를 작업 하나에 대해 실행할 때만 일어난다. `status`와 `inspect`는 저장된 값을 읽으며 `working`인 작업의 병합 여부를 조회하지 않는다. [CLI 구현](../../../scripts/pr/index.mjs) | 명령을 실행하는 주체가 없으면 병합된 작업도 `working`으로 남는다. |
| `complete`는 PR이 이미 `MERGED`이면 병합을 요청하지 않는다. PR HEAD와 병합 커밋, 최신 `dev` 포함 여부를 확인한 뒤 파일·사용 검사를 거쳐 제거한다. [병합 검증](../../../scripts/pr/github-merge.mjs) | 사람이 병합한 작업을 정리하는 절차는 이미 있다. 빠진 것은 그 절차를 시작시키는 주체다. |
| `complete`는 `--owner`, `--expected-state`, `--expected-head`, `--expected-instance`, `--request-id`, `--pr`, `--usage-ended`를 모두 요구한다. | 세션이 끝난 뒤에는 이 값을 기억하는 주체가 없다. |
| 운영 규칙은 정리를 등록된 작업 하나로 한정하고 훑기를 두지 않는다. 사용 종료는 소유자가 선언한다. [작업 규칙](../../../AGENTS.md) · [운영 계약](../../architecture/verification.md#작업-브랜치-정리) | 이 제안이 바꾸는 규칙이다. |

### 2026-11-21에 관찰한 잔여 작업

등록된 작업 33개 중 14개가 `working`이었다. 그중 11개는 PR(#377, #380, #384, #386, #389, #390, #394, #395, #396, #397, #398)이 2~3일 전에 `dev`에 병합된 상태였다.

- 11개 모두 원장의 `pr`과 `merge`가 `null`이었고 `requests`가 비어 있었다. 등록 이후 원장이 갱신된 적이 없다.
- 11개 모두 로컬 브랜치 HEAD가 병합된 PR의 HEAD와 같았고, `origin/dev`에 없는 커밋과 미커밋 변경이 없었다.
- ignored 항목은 `.next/`, `node_modules/`, `src/generated/`, `next-env.d.ts`, `tsconfig.tsbuildinfo`뿐이었다.

원인은 정리가 병합 명령에 묶여 있는 구조다. 병합이 승인 범위에 없는 에이전트는 PR을 만들고 세션을 끝낸다. 이후 사람이 GitHub에서 병합하면 그 시점에는 `complete`를 실행할 주체가 없다.

사용자가 11개 작업의 사용 종료를 확인한 뒤 작업마다 `complete --pr <번호> --usage-ended`를 실행했다. 11개 모두 사용 관측이 `clear`·`qualified`로 나왔고 작업 트리와 브랜치가 제거됐다. 따라서 기존 `MERGED` 경로는 사람이 병합한 작업에 그대로 동작한다.

### 이전 시도

로컬 브랜치 `harness/task-start-cleanup-proposal`(`310f2de`)에 같은 문제를 다룬 제안서와 구현이 있다. `dev`에는 반영되지 않았다. 그 설계는 에이전트가 `task release`로 사용 종료를 기록하고, 다음 `task start`가 인계된 작업만 정리한다. 이 제안은 그 설계를 대체한다. 인계 기록에 의존하면 기록을 빠뜨린 작업이 지금과 똑같이 남고, 위 11개처럼 이미 쌓인 작업도 대상에서 빠진다. 그 제안서의 PR 번호 없는 병합 탐색 기준과 검토 결과(제거 직후 중단된 브랜치의 보존, 원격 무변경 증명)는 아래에 이어받는다.

## Scope

포함 범위:

- `scripts/pr/`의 관리 CLI와 GitHub 조회, 그 시험과 CI 행.
- `AGENTS.md`와 `docs/architecture/verification.md`의 작업 정리 규칙.

제외 범위:

- PR 병합 요청, 원격 브랜치 삭제, 원격 ref 변경.
- 상주 프로세스, 스케줄러, 주기적 조회.
- 매니저에 등록되지 않은 작업 트리(관리용 체크아웃 포함)와 그 브랜치.
- 병합되지 않은 작업: 열린 PR, 병합 없이 닫힌 PR, PR이 없는 작업, `retire` 대상.
- Windows 등 사용 관측이 인정되지 않는 환경으로의 자동 제거 확대.
- 원장의 필드·상태 값 추가.
- 명령 이름 변경. [이름 변경 제안](../active/rename-pr-command-to-task.md)이 따로 다룬다.

## Proposal

### 작업자가 보게 될 흐름

| 시점 | 동작 | 결과 |
| --- | --- | --- |
| 작업 중 | 지금과 같다. | 변화 없음 |
| PR 병합 | 에이전트가 `complete`로 병합하거나 사람이 GitHub에서 병합한다. | `complete`를 실행했다면 지금처럼 그 자리에서 정리된다. |
| 다음 작업 시작 | `npm run pr -- create`가 새 작업을 만들기 전에 기존 작업을 검사한다. | 병합이 증명되고 모든 검사를 통과한 작업만 제거된다. 나머지는 그대로 두고 경로와 사유를 출력한다. |
| 원할 때 | `npm run pr -- sweep`을 실행한다. | 새 작업을 만들지 않고 같은 검사만 실행한다. |

### REQ-MTC-001 — 실행 시점

새 작업을 등록하는 `create` 호출은 작업을 만들기 전에 정리 검사를 한 번 실행해야 한다. 중단된 생성을 이어가는 `create --task <id>`는 검사를 실행하지 않는다. `sweep`은 `--root`만 받고 같은 검사를 실행한다. `status`와 `inspect`는 계속 읽기 전용이다.

### REQ-MTC-002 — 검사 대상

현재 설치에 등록된 작업 중 작업 트리가 기록된 경로에 기록된 인스턴스로 존재하는 것만 검사한다.

| 원장 상태 | 처리 |
| --- | --- |
| `working` | REQ-MTC-003으로 병합된 PR을 찾는다. |
| `sealed`, `merge-requested` | 원장에 연결된 PR을 조회한다. 병합을 요청하지 않는다. |
| `merged`, 병합 목적의 `cleanup-pending` | 기록된 병합 증명으로 기존 `cleanup`을 이어 간다. |
| `creating`, `retire` 목적, `complete`, `retired` | 검사하지 않는다. |

작업 트리가 없거나 원장의 작업 트리 상태가 `present`가 아니면 자동 경로는 그 작업을 건드리지 않는다. 작업 트리가 제거된 뒤 브랜치 삭제 전에 끊긴 경우, 그 사이 같은 이름·같은 SHA로 다시 만들어진 브랜치를 구분할 수 없기 때문이다. 이 작업은 `inspect`와 기존 `cleanup` 절차로 넘긴다.

### REQ-MTC-003 — 병합 증명

PR 번호가 원장에 없으면 GitHub의 PR 목록을 `state=all`, `base=dev`, `head=<원격 저장소 소유자>:<branch>`로 끝 페이지까지 조회한다. 저장소 ID, 양쪽 ref가 일치하고 HEAD가 현재 로컬 브랜치 HEAD와 같은 병합된 PR이 정확히 하나일 때만 후보로 삼는다. 후보는 기존 `pull`로 상세 정보를 다시 확인한다.

병합 증명에는 다음이 모두 필요하다.

- 상세 PR 상태가 `MERGED`다.
- GitHub가 반환한 병합 커밋이 최신 원격 `dev`와 같거나 그 조상이고, GitHub의 `dev` ref가 fetch한 `origin/dev`와 같다.
- 작업을 등록할 때 저장한 `baseSha`가 병합 커밋의 엄격한 조상이다. 작업 시작 전에 이미 `dev`에 들어 있던 같은 이름·같은 HEAD의 과거 PR을 배제한다.
- 로컬 브랜치 HEAD가 `baseSha`와 다르다. 커밋이 없는 새 작업을 배제한다.

열린 PR, 병합 없이 닫힌 PR, 후보 0개·복수, 불완전한 페이지, 권한·네트워크 오류는 보류 사유다. 이 경로의 GitHub 접근은 GET만 허용한다. `mergeProof`는 `record.pr.number`와 `record.release.head`를 읽으므로, 검증된 PR 정보를 담은 임시 레코드를 넘긴다.

### REQ-MTC-004 — 사용 종료 선언을 대신하는 확인

자동 경로는 다음을 같은 호출 안에서 모두 확인했을 때만 제거에 착수한다.

1. REQ-MTC-003의 병합 증명.
2. 로컬 브랜치 HEAD와 작업 트리 HEAD가 병합된 PR의 HEAD와 같다.
3. 기존 파일 검사를 통과한다. staged·unstaged·untracked 변경, 진행 중인 Git 작업과 lock, 허용 캐시 밖의 ignored 자료가 없다.
4. 사용 관측이 `clear`·`qualified`·`performed`·`coverageComplete`·`settled`다.
5. 호출 위치가 대상 작업 트리 밖이다.
6. 원격 브랜치가 다른 HEAD로 재사용되지 않았고 그 브랜치에 의존하는 열린 PR이 없다.

근거는 저장소 규칙이다. `AGENTS.md`는 병합된 작업 브랜치를 다시 쓰지 말고 최신 `dev`에서 새 브랜치를 만들라고 정한다. 병합된 작업의 작업 트리에는 규칙상 이어질 작업이 없다. 남는 손실 가능성은 저장되지 않은 파일과 실행 중인 프로세스이고, 3번과 4번이 이를 막는다. 2번과 3번을 통과한 작업 트리에서 지워지는 것은 `dev`에 들어간 커밋과 다시 만들 수 있는 캐시다.

자동 경로는 owner 문자열을 요구하지 않는다. owner는 지금도 인증이 아니다. 자동 경로가 `--usage-ended` 선언을 대신 만들어 넣는 것도 아니다. 원장에는 기존 `complete` 요청 형식으로 기록하고 요청 ID는 호출이 새로 만든다. 원장의 필드와 상태 값은 늘리지 않으므로, 자동 실행 여부는 호출 출력에만 남는다.

### REQ-MTC-005 — 쓰기 전 확인과 보류

REQ-MTC-004의 확인이 모두 통과하기 전에는 원장을 쓰지 않는다. 보류된 작업은 원장 상태가 그대로이며, 호출 출력에 작업 ID·경로·사유가 나온다. 같은 보류를 다시 관측해도 원장 이력과 요청 슬롯(최대 256건)을 쓰지 않는다.

확인이 통과하면 작업 잠금 아래에서 기존 봉인 → 병합 기록 → `cleanup` 경로를 실행한다. 이 경로는 HEAD, 파일 지문, 사용 관측, 원격 보존을 잠금 아래에서 다시 검사한다. 사전 확인은 쓰기를 줄이는 장치이고, 삭제를 승인하는 것은 잠금 아래의 재검사다.

검사 순서는 로컬 확인(작업 트리 존재, HEAD, 파일 검사)이 먼저다. 미커밋 변경이 있는 작업은 GitHub 조회 없이 보류된다.

### REQ-MTC-006 — 새 작업과의 독립, 예산, 중단

- 기존 작업 하나의 보류나 실패는 새 작업 생성을 막지 않는다. 새 작업 자체의 검증은 그대로 적용한다. 취소 신호와 미종료 자식 프로세스는 지금처럼 호출 전체를 멈춘다. 공용 잠금이 걸려 있으면 남은 검사를 건너뛰고 출력의 `skipped`에 `common-guard-held`를 낸다. 건너뛴 작업은 `notExamined`에 들어가며, 새 작업 생성은 자체 잠금 규칙을 따른다.
- 새 후보에 착수할 수 있는 시간은 호출당 20초를 초기 설계값으로 둔다. 착수한 후보는 기존 명령별 제한 안에서 끝까지 처리한다. 예산이 끝나 보지 못한 작업 수는 출력에 `notExamined`로 표시한다. 예산은 착수 여부만 정하며, 명령에 기한을 걸지 않으므로 원장 쓰기·제거·새 작업 생성으로 넘어가는 기한이 없다.
- 검사 순서는 병합 증명이 이미 기록된 작업, 그다음 작업 ID 순이다. 순환 위치는 저장하지 않는다. 미커밋 변경이 있는 작업은 조회 비용이 없고 열린 PR은 목록 조회 한 번으로 끝나므로, 보류 작업의 조회 합이 20초를 넘으려면 깨끗한 보류 작업이 수십 개 쌓여야 한다. `notExamined`가 반복해서 나오면 순환 위치 저장을 후속 변경으로 검토한다.
- `create`와 `sweep`이 겹치거나 소유자의 `complete`·`resume`과 경합하면 작업 잠금과 상태 OID 비교를 이긴 전이만 효력을 가진다.

출력은 JSON 하나다. `create`는 기존 생성 결과에 `sweep` 항목을 붙이고 종료 코드는 생성 결과를 따른다. `sweep` 항목은 `examined`, `removed`, `held`, `notExamined`, `skipped`와 작업별 행(작업 ID, 브랜치, 경로, 확인한 PR, 작업 트리 결과, 브랜치 결과, 사유)을 담는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `scripts/pr/index.mjs` | update | `sweep` 연산과 인자 검증, `create` 연결, 출력. 기존 봉인·병합 기록·`cleanup`을 호출한다. | high. 삭제 경로의 진입점이 늘어난다. |
| `scripts/pr/merged-sweep.mjs` | add | 후보 선택, 사전 확인, 예산을 한곳에 둔다. | medium |
| `scripts/pr/github-merge.mjs` | update | PR 번호 없는 병합 PR 탐색(GET)과 `baseSha` 조상 검사. | medium. 다른 PR을 잘못 연결할 수 있다. |
| `scripts/pr/task-state.mjs` | keep | 원장 형식을 바꾸지 않는다. | none |
| `scripts/pr/`의 시험과 fixture | add/update | 아래 인수 사례. 기존 `create` 시험은 GitHub 대역에 목록 조회를 추가한다. | low |
| `.github/workflows/check.yml`, `docs/architecture/verification.md`의 CI 범위 표 | update | 새 시험 파일을 Windows·macOS의 `check/task-worktrees`에 연결한다. | low |
| `AGENTS.md`, `docs/architecture/verification.md` | update | "there is no sweep"과 소유자 선언 규칙을 병합된 작업의 예외와 함께 고친다. | medium. 에이전트가 따르는 규칙이다. |

## Safety Analysis

- 병합이 증명되지 않은 작업은 어떤 경우에도 지우지 않는다. 열린 PR, PR 없는 작업, 미커밋 변경이 있는 작업은 지금과 같다.
- 삭제를 승인하는 검사는 기존 `complete`·`cleanup`의 것이다. 새로 만드는 것은 PR 탐색과 호출 시점이다.
- 검사가 틀리게 통과해도 지워지는 것은 `dev`에 들어간 커밋과 허용 캐시다. 허용 캐시 밖의 ignored 파일은 기존 파일 검사가 막는다.
- `main`과 `dev`는 삭제 입력이 될 수 없다는 기존 보호를 그대로 쓴다.
- 원장 형식이 같으므로 이전 도구 리비전의 관리용 체크아웃이 같은 원장을 읽을 수 있다. 이전 리비전의 `create`는 검사를 실행하지 않을 뿐이다.

확인한 항목:

- [x] 테스트와 스크립트 참조: `scripts/pr/`의 시험 7개 파일이 `check/task-worktrees`에서 파일별 step으로 실행된다.
- [x] 런타임 side effect: `create`에 GitHub 조회와 삭제 효과가 추가된다. REQ-MTC-005·006이 범위를 정한다.
- [x] 출시된 plugin·서버와 함께 쓰는 상태: 해당 없음. 로컬 Git ref의 개발 도구 원장이며 형식을 바꾸지 않는다.
- [x] 잠금 아래 재검사와 사전 확인 사이의 경합: VFY-MTC-04의 사례(사전 확인 뒤 쓰인 파일, 소유자 `complete`와의 경합, 동시 `sweep` 두 개)로 확인했다.

## Approval

승인 메모:

- 추가 조건 없음.
- 이 제안은 [PR 정리 제안](../active/pr-worktree-closeout.md)이 제외한 "명령 종료 후 웹 병합의 자동 감시"를 다음 호출 때의 1회 조회로 바꾼다. 상주 감시, 나이 기반 삭제, 미등록 자료의 일괄 삭제는 계속 제외한다.

## Execution Plan

### TASK-MTC-01 — 병합된 PR 탐색

- satisfies: REQ-MTC-003
- verified-by: VFY-MTC-01

PR 번호 없는 탐색과 `baseSha` 검사를 조회 전용으로 구현한다. 삭제 경로에 연결하기 전에 탐색 결과만 시험한다.

### TASK-MTC-02 — 검사와 기존 정리 경로 연결

- satisfies: REQ-MTC-002, REQ-MTC-004, REQ-MTC-005, REQ-MTC-006
- verified-by: VFY-MTC-02, VFY-MTC-03, VFY-MTC-04

`sweep` 연산을 만들고 사전 확인 뒤 기존 경로를 호출한다. 이 단계까지는 `create`에 연결하지 않는다.

### TASK-MTC-03 — 작업 시작 연결과 규칙 문서

- satisfies: REQ-MTC-001
- verified-by: VFY-MTC-02, VFY-MTC-03

보존·경합 시험이 통과한 뒤 `create`에 연결하고, 같은 변경에서 `AGENTS.md`와 `verification.md`를 고친다.

## Verification Plan

### VFY-MTC-01 — 병합 탐색과 원격 쓰기 0건

- verifies: REQ-MTC-003

로컬 bare origin에 일반 병합과, 원래 HEAD가 `dev`의 조상이 아니고 GitHub가 보고한 별도 커밋만 `dev`의 조상인 squash·rebase 이력을 만든다. 열린 PR, 병합 없이 닫힌 PR, 다른 base, HEAD 불일치, 후보 복수, 둘째 페이지의 후보, 페이지 중단, 목록과 상세의 불일치를 대조한다. `baseSha`만 바꿔 과거 PR이 하나만 검색되는 경우에 보존되는지 확인한다. GitHub 대역은 GET 이외의 호출을 거부하고, 실행 전후 origin의 ref 전체를 비교한다.

### VFY-MTC-02 — 정리와 보존

- verifies: REQ-MTC-001, REQ-MTC-002, REQ-MTC-004

원장이 `pr: null`인 `working` 작업을 사람이 병합한 상태로 만들고 `sweep`과 `create`를 각각 실행한다. 제어된 사용 관측이 `clear`일 때 작업 트리·등록·로컬 브랜치만 사라지는지 확인한다. 미커밋 변경, 허용 범위 밖 ignored 파일, 병합 뒤 추가 커밋, 사용 중·미확인, 미자격 환경, 재사용된 원격 브랜치, 의존 PR에서는 둘 다 남아야 한다. `sealed`·`merge-requested`·`cleanup-pending` 작업, 작업 트리가 없는 작업, `create --task` 재개를 대조한다. `status`·`inspect`가 삭제 효과를 내지 않는지 확인한다.

### VFY-MTC-03 — 쓰기 0건과 새 작업의 독립

- verifies: REQ-MTC-005, REQ-MTC-006

보류된 작업의 원장 OID가 호출 전후로 같은지, 같은 보류를 반복 관측해도 `requests`가 늘지 않는지 단언한다. GitHub 조회 실패와 후보 보류에서 새 작업이 정상 생성되는지, 원격 `dev`를 확인할 수 없으면 생성이 기존 규칙대로 실패하는지 구분한다. 가짜 단조 시계로 예산 만료를 재현해 `notExamined`와 착수한 후보의 완료를 확인한다. 미커밋 변경이 있는 작업의 GitHub 요청이 0건인지 요청 기록으로 확인한다.

### VFY-MTC-04 — 경합과 중단

- verifies: REQ-MTC-005, REQ-MTC-006

동시 `create` 두 개, 소유자의 `complete`와 `sweep`의 경합, 사전 확인과 잠금 사이에 추가된 커밋·파일을 시험한다. 제거 의도 기록 전후와 작업 트리 제거 직후에 실제 프로세스를 끊고, 다음 호출이 남은 브랜치를 자동으로 지우지 않는지 확인한다. 같은 SHA로 다시 만든 동명 브랜치가 보존되는지 확인한다.

실행할 검증:

```bash
node --test scripts/pr/cli-integration.test.mjs scripts/pr/lifecycle.test.mjs scripts/pr/merge.test.mjs scripts/pr/cleanup.test.mjs scripts/pr/preservation.test.mjs scripts/pr/recovery.test.mjs
npm run test:scripts
npm run verify:ci-coverage
npm run docs:check
npm run check
```

실제 OS의 삭제 자격은 기존 native 시험으로 확인한다. 사용 중인 실제 사용자 작업 트리로 삭제를 시험하지 않는다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 작업별 `npm run pr -- complete --pr <번호> --usage-ended` 11회 (2026-11-21, macOS 등록 프로필) | 11회 모두 `complete`, exit 0 | 사람이 병합한 작업에 기존 `MERGED` 경로가 동작함을 확인했다. 사용 관측은 모두 `clear`·`qualified`였다. 자동 경로의 검증은 아니다. |
| `node --test scripts/pr/sweep.test.mjs` (2026-11-21, macOS) | 8개 통과 | VFY-MTC-01~04의 사례. 핵심 검사 5개(base 조상, 상태 OID 비교, 제거된 작업 트리 보존, 원격 보존 사전 확인, 사용 사전 확인)를 하나씩 뺐을 때 매번 실패함을 확인했다. |
| `scripts/pr/`의 기존 시험 7개 파일과 새 시험 | 56개 중 54개 통과, 2개 제외 | 제외는 Windows 전용 사례다. |
| `npm run verify:fsd`, `verify:server`, `verify:shared` | 통과 | |
| `npm run test:architecture` | 460개 중 455개 통과, 5개 제외, 실패 0 | |
| `npm run check` | 577개 중 571개 통과, 6개 제외, 실패 0 | lint, `docs:check`, `verify:ci-coverage`, 타입 검사 포함. |
| Windows의 `check/task-worktrees` | 통과 | PR #414와 #417의 CI. |

시험이 다루지 않은 사례: 둘째 페이지의 후보와 페이지 중단, 제거 도중 실제 프로세스를 끊는 중단. 목록 조회는 100건 미만 한 페이지 응답만 시험했다. 한 branch의 PR이 100건을 넘는 경우는 병합된 branch를 다시 쓰지 않는 규칙상 생기지 않는다고 보고 추가하지 않았다. 제거 도중의 중단은 작업 트리가 이미 제거된 원장 상태로 확인했고, 실제 프로세스 중단 뒤의 잠금·원장 보존은 기존 `recovery.test.mjs`가 같은 정리 경로에서 확인한다.

### 2026-11-21 병합 후 실제 실행과 조회 축소

PR #414가 `dev`에 병합된 뒤 실제 저장소에서 `npm run pr -- sweep`을 실행했다. 사람이 병합한 #414의 작업이 PR 번호 입력 없이 정리됐고, 병합되지 않은 작업 2개는 `no-merged-pr`로 남았다.

| 실행 | 결과 | 시간 |
| --- | --- | --- |
| 1회차 | 1개 제거, 2개 `notExamined` | 29.6초 |
| 2회차 | 2개 보류 | 4.6초 |

격리 fixture에 실제 `node_modules`를 복제해 정리 1건을 단계별로 쟀다. 로컬 작업은 7.4초였고(작업 트리 제거 2.2초, 파일 목록 5회 1.7초, 사용 관측 3회 0.7초), 원격 조회는 GitHub GET 26회와 `ls-remote`·`fetch` 각 8회였다. 같은 날 잰 왕복 시간은 GET 0.4초, `ls-remote` 0.45초, `fetch` 0.55초로, 원격 조회만 약 18초다.

후속 변경에서 사전 확인의 중복 병합 증명을 원격 branch 확인과 의존 PR 조회로 바꾸고, 저장소 식별 조회를 명령당 한 번으로 줄였다. 같은 fixture에서 GET은 26회에서 18회로 줄었다. `ls-remote`는 8회에서 7회, `fetch`는 8회에서 6회로 줄어드는 것으로 계산되며, 위 왕복 시간으로 약 5초다. 실제 저장소에서의 값은 다시 재지 않았다. 남은 조회는 기존 `complete`·`cleanup`이 작업 트리 제거 전후에 반복하는 보존 증명이며 이 변경에서 줄이지 않았다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `node --test scripts/pr/sweep.test.mjs` (후속 변경, macOS) | 10개 통과 | 동시 `sweep` 두 개가 병합된 작업을 한 번만 제거하는 사례와 공용 잠금이 걸린 동안 조회 없이 건너뛰는 사례를 추가했다. 3회 반복 실행에서 모두 통과했다. |

## Risks and Rollback

잔여 리스크:

- 사용 관측은 호출자와 같은 OS 계정의 프로세스만 본다. 다른 계정이나 호스트가 공유하는 작업 트리는 관측되지 않는다. 지금의 `complete`와 같은 한계다.
- 병합된 작업 트리를 프로세스 없이 열어 둔 세션은 관측되지 않는다. 그 세션은 폴더가 사라진 것을 보게 되지만 커밋되지 않은 자료가 있었다면 파일 검사에서 보류된다.
- 병합 뒤에도 그 작업 트리에서 검증이나 리허설을 이어 가는 흐름이 있다면, 프로세스가 멈춘 사이에 정리될 수 있다.
- Windows에서는 사용 관측이 인정되지 않아 계속 남는다.
- 원장은 자동 실행과 소유자 실행을 구분하지 않는다.
- 새 작업 시작이 검사 대상 수만큼 느려진다. 2026-11-21 실제 저장소에서 병합된 작업 1건의 정리에 29.6초, 정리할 것이 없는 작업 2개의 검사에 4.6초가 걸렸다. 정리 1건이 시작 예산 20초를 넘으므로 병합된 작업이 여럿이면 호출마다 하나씩 정리된다. 시간의 대부분은 원격 조회다. 아래 Verification Results에 내역을 적었다.

롤백 방법:

- `create`에서 검사 호출을 떼는 커밋 하나로 되돌린다. `sweep` 연산과 원장은 그대로 둘 수 있다.
- 진행 중이던 작업은 `inspect`와 기존 `cleanup`·`recover`로 작업별 확인한다. 원장을 일괄 삭제하지 않는다.
- 이미 지워진 작업 트리는 코드 롤백으로 복원되지 않는다. 커밋은 `dev`와 원장이 고정한 객체에 남는다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-11-22
- verification-summary: PR #414와 #417의 `check`가 Windows·macOS의 `task-worktrees`를 포함해 통과했다. #414 병합 뒤 실제 저장소의 `npm run pr -- sweep`이 사람이 병합한 작업 1건을 PR 번호 입력 없이 정리했고, 병합되지 않은 작업 2건은 `no-merged-pr`로 보류했다.
- implementation PR/commit: #414(`822614d`, 검사와 `sweep` 연산, `create` 연결, 규칙 문서), #417(`5da3a0f`, 중복 원격 조회 축소, 동시 실행과 공용 잠금 사례).
- changed files summary: `scripts/pr/merged-sweep.mjs`(추가), `scripts/pr/index.mjs`, `scripts/pr/github-merge.mjs`, `scripts/pr/sweep.test.mjs`(추가), `scripts/pr/cli-integration.test.mjs`, `scripts/pr/testing/closeout-fixture.mjs`, `.github/workflows/check.yml`, `AGENTS.md`, `docs/architecture/verification.md`.
- remaining follow-up: 없음. 정리 1건이 시작 예산 20초를 넘는 점은 Risks에 적은 대로 남는다. 남은 조회는 기존 `complete`·`cleanup`의 반복 보존 증명이며 줄이지 않기로 했다. 병합하지 않고 끝낸 작업의 정리는 [retire 보존 조건 제안](./2026-11-22-retire-remote-preserved-task.md)이 다뤘다.
