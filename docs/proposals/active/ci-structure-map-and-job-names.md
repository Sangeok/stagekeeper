---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-11-25"
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
  - "docs/investigations/active/ci-structure-discoverability-investigation.md"
  - "docs/investigations/active/ci-management-practices-investigation.md"
  - "docs/architecture/verification.md"
  - "docs/ADR/0004-organize-repository-scripts.md"
  - "docs/proposals/active/ci-verification-code-organization.md"
  - "docs/proposals/active/post-merge-auto-fix-trust.md"
---

# CI 흐름 지도와 check 워크플로 잡 이름 정리

## Summary

[조사](../../investigations/active/ci-structure-discoverability-investigation.md)에서 CI 구조를 알아보기 어려운 원인 세 가지를 찾았다. 흐름을 한곳에 보여 주는
지도가 없고, 워크플로 이름이 역할을 말하지 않으며, "check"라는 이름이 다섯 곳에 겹친다. 이
제안서는 세 가지를 한꺼번에 하지 않고, 원인 하나에 단계 하나씩 세 단계로 나눠 순서대로 처리한다.
각 단계는 PR 하나이고, 승인도 단계마다 따로 받는다.

| 단계 | 해결하는 원인 | 하는 일 | 이름 변경 |
| --- | --- | --- | --- |
| 1단계 | 흐름 지도가 없다 | `verification.md`에 CI 흐름도, `.github/workflows/README.md`에 안내 | 없음 |
| 2단계 | 워크플로 이름이 역할을 말하지 않는다 | 워크플로 역할 표와, 그 표를 각 워크플로의 `on:`과 대조하는 검사 | 없음 |
| 3단계 | "check" 이름이 겹친다 | `check` 워크플로의 잡 표시 이름과 matrix 잡 id | 잡 이름만 |

순서는 위험이 낮은 것부터다. 1단계는 문서만 바꾸고, 2단계는 검사 코드를 더하고, 3단계는 다른
도구가 문자열로 쓰는 잡 이름을 바꾼다. 앞 단계는 뒤 단계에 의존하지 않으므로, 어느 단계에서
멈춰도 그때까지의 결과가 그대로 쓸모 있다. 룰셋이 요구하는 `check (required)`, 워크플로 이름,
파일 이름은 세 단계 모두 바꾸지 않으므로 룰셋 변경은 없다.

## Goal

- PR을 열 때, 병합한 뒤, 승격하기 전, 손으로 실행할 때 각각 무엇이 돌고 무엇이 병합을 막는지
  한곳에서 읽을 수 있게 한다.
- 워크플로마다 언제 돌고 어떤 역할인지를 표로 보여 주고, 표가 워크플로와 어긋나면 기존 검사가
  실패하게 한다.
- PR 체크 목록에서 "check"가 집계 잡에만 남게 한다.
- 작업 유형: 문서 추가, 검사 확장, 워크플로 잡 이름 변경.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 세 단계를 합쳐 다섯 개 이상의 파일을 바꾼다. CI 워크플로와 그 검사 스크립트가 포함된다.
- 3단계의 잡 표시 이름은 병합 후 실패 기록과 자동 수정 도구가 문자열로 사용한다.

## Current State

원인별 근거는 [조사 문서](../../investigations/active/ci-structure-discoverability-investigation.md)의 Known Facts에 있다. 요약하면 다음과 같다.

| 원인 | 현재 상태 | 처리 단계 |
| --- | --- | --- |
| 흐름 지도가 없다 | `verification.md`의 CI 범위 표는 OS 분류용이다. 트리거부터 룰셋까지, 병합 후 기록, 승격 전 게이트를 한 흐름으로 보여 주는 절이 없다 | 1단계 |
| 워크플로 이름이 역할을 말하지 않는다 | 워크플로 10개 중 8개가 트리거를 둘 이상 가진다. 게이트 두 개는 PR 경로 조건 검사를 겸한다. 참고 저장소의 이름 접두사로는 분류되지 않는다 | 2단계 |
| "check" 이름이 겹친다 | 워크플로 `check`, matrix 잡 id `check`, `npm run check`, `scripts/checks/`, 집계 잡 `check (required)`. 잡 표시 이름이 모두 `check (…)`이라 PR 체크 목록에 `check / check (static)`처럼 보인다 | 3단계 |

`check (required)`는 PR #441 이후 룰셋이 요구하는 유일한 체크다. 다른 잡의 이름은 룰셋과 결합돼
있지 않다.

## Scope

포함 범위:

- 1단계: `verification.md`의 "CI 흐름" 절과 흐름도, `.github/workflows/README.md` 안내.
- 2단계: 같은 절의 워크플로 역할 표, `verify-ci-coverage`의 역할 표 대조와 시험, AGENTS.md의 CI 규칙
  한 문장, README 한 줄.
- 3단계: `check.yml`의 잡 표시 이름 세 줄과 matrix 잡 id, 그에 따른 CI 범위 표 키와 `needs`.

제외 범위:

- 집계 잡 이름 `check (required)` 변경.
- 워크플로 파일 이름과 `name:` 변경.
- `npm run check`, `scripts/checks/`의 이름.
- scripts 폴더 재배치. 리허설 코드 배치는 [CI 검증 코드 배치 제안](./ci-verification-code-organization.md)이 소유한다.
- n8n 방식의 `.github/WORKFLOWS.md` 전체 지도, vscode 방식의 룰셋 파일화.
- `check`의 검사 내용과 실행 시간, `main`의 필수 체크, `task-worktrees` 잡의 별도 워크플로 분리
  ([CI 운영 방식 조사](../../investigations/active/ci-management-practices-investigation.md)의 권고).

## Proposal

### 1단계: 흐름 지도

**시작 조건:** 1단계 승인.

**1-1. `verification.md`에 "CI 흐름" 절을 더한다.** 위치는 "CI 검사의 OS 범위" 절 앞이다. 흐름도는
잘 바뀌지 않는 구조만 담는다. 개별 검사와 경로 조건은 2단계의 역할 표와 기존 CI 범위 표가
맡는다. 초안은 다음과 같다.

```text
PR 생성·커밋 추가
  ├─ check ─ 잡 3개가 실행 8개로 펼쳐짐 ─ check (required) ─ 룰셋 Require check on dev ─ dev 병합 허용
  └─ 경로 조건에 맞는 워크플로 (병합을 막지 않음)

dev·main에 병합된 커밋
  ├─ check (집계 잡은 건너뜀), windows-role-runtime, macos-runtime-contracts 등
  └─ 끝나면 post-merge-failure-record ─ 실패를 [post-merge] 이슈로 기록

main 승격 전 (손으로 실행)
  └─ client-init-smoke, agent-eval, pipeline-smoke, shared-distribution-acceptance ─ 게이트 기록
```

흐름도 아래에 `check`의 갈라짐과 모임을 한 문단으로 적는다. 잡 3개가 워크플로 시작점에서 실행
8개로 펼쳐지고, 실행 8개가 모두 끝난 뒤 `check (required)`가 잡 결과 3개를 받아 판정한다는 내용이다.

**1-2. `.github/workflows/README.md`에 몇 줄짜리 안내를 둔다.** GitHub 폴더 화면에서 바로 보이게
하려는 것이다. 내용을 복제하지 않고 기준 문서를 가리킨다.

```markdown
# Workflows

PR 병합을 막는 체크는 check.yml의 check (required) 하나다.
CI 흐름은 docs/architecture/verification.md의 "CI 흐름" 절이 기준이다.
```

GitHub Actions는 이 폴더의 `.yml`·`.yaml` 파일만 워크플로로 읽는다. vscode와 kibana도 같은 폴더에
`.md` 파일을 둔다. `verify-ci-coverage.mjs`도 `.yml`만 읽는다(204행).

### 2단계: 워크플로 역할 표

**시작 조건:** 1단계 병합, 2단계 승인. PR #445와 `auto-fix-ruler.yml` 작업의 병합 순서를 확인하고, 최신
`dev`의 워크플로 목록으로 표를 다시 만든다. 두 작업이 워크플로 목록과 `verification.md`를 바꾸기
때문이다.

**2-1. "CI 흐름" 절에 워크플로 역할 표를 더한다.** 워크플로 하나에 한 행이다. 기계 대조를 위해
`<!-- ci-roles:start -->`와 `<!-- ci-roles:end -->` 사이에 둔다. 2026-11-25 `origin/dev`의 `on:`에서
만든 초안이다.

| 워크플로 | PR | push | 수동 | 정기 | 다른 워크플로 | 병합을 막음 | 역할 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `check` | 매번 | 매번 |  |  |  | ✓ | PR 병합 게이트. 병합 후 실패 기록 대상 |
| `windows-role-runtime` | 경로 조건 | 매번 |  |  | 호출 |  | Windows 역할 런타임과 제품 코드 시험 |
| `macos-runtime-contracts` | 경로 조건 | 매번 | ✓ |  | 호출 |  | macOS 런타임 계약과 제품 코드 시험 |
| `client-init-smoke` | 경로 조건 |  | ✓ |  |  |  | 설치와 init. 승격 게이트 |
| `shared-distribution-acceptance` | 경로 조건 | 경로 조건 | ✓ |  |  |  | 공유 배포 실물 설치. 승격 게이트 |
| `agent-eval` |  |  | ✓ | ✓ |  |  | init 스킬의 모델 동작. 승격 게이트 |
| `pipeline-smoke` |  |  | ✓ | ✓ |  |  | 파이프라인 전체. 승격 게이트 |
| `post-merge-failure-record` |  |  | ✓ | ✓ | 완료 후 |  | 병합 후 실패를 이슈로 기록 |
| `post-merge-auto-fix` |  |  | ✓ |  |  |  | 병합 후 실패 자동 수정 |
| `template-release` |  |  | ✓ |  |  |  | 템플릿 release 운영 |

칸의 값은 다음 뜻이다.

- PR·push: "매번"은 경로 조건 없이, "경로 조건"은 그 트리거 아래 `paths:`가 있을 때, 빈칸은 그
  트리거가 없을 때.
- 수동·정기: `workflow_dispatch`·`schedule`이 있으면 ✓.
- 다른 워크플로: `workflow_call`이 있으면 "호출", `workflow_run`이 있으면 "완료 후".
- 병합을 막음: 룰셋이 요구하는 집계 잡을 가진 워크플로에만 ✓.
- 역할: 사람이 읽는 설명이다. 기계 대조하지 않는다.

**2-2. `scripts/checks/verify-ci-coverage.mjs`가 역할 표를 대조한다.** 기존처럼 YAML 패키지 없이
들여쓰기로 `on:` 블록을 읽는다. 아래 경우에 실패한다.

- 표의 워크플로 집합과 `.github/workflows/*.yml` 집합이 다르다.
- 트리거 칸이 비었는데 그 트리거가 있거나, 채워졌는데 없다.
- "경로 조건"과 "매번"이 그 트리거 아래 `paths:` 유무와 다르다.
- "호출"·"완료 후"가 `workflow_call`·`workflow_run` 유무와 다르다.
- "병합을 막음" ✓이 `check (required)` 잡을 가진 워크플로가 아닌 곳에 있거나, 그 워크플로에 없다.

`on:`이 한 줄 형식(`on: [push]` 등)이면 대조하지 못했다고 실패한다. 지금 10개 파일은 모두 블록
형식이다.

**2-3. `scripts/checks/verify-ci-coverage.test.mjs`에 시험을 더한다.** 일치하면 통과하는 사례와, 2-2의
실패 조건 각각이 실패하는 사례를 둔다.

**2-4. AGENTS.md의 CI 규칙에 한 문장을 더한다.** "워크플로를 더하거나 트리거를 바꾸면 같은 변경에서
역할 표를 고친다"는 내용이다. 기존 CI 범위 표 규칙 바로 뒤에 둔다.

**2-5. `.github/workflows/README.md`에 한 줄을 더한다.** 워크플로별 트리거와 역할은 같은 절의 역할
표가 기준이고 `npm run verify:ci-coverage`가 이 폴더와 대조한다는 내용이다.

### 3단계: check 워크플로의 잡 이름

**시작 조건:** 2단계 병합, 3단계 승인, 새 matrix 잡 id 이름 확정. 그리고 아래 3-0을 확인한다.

**3-0. 사전 확인.**

- 열린 `[post-merge]` 이슈 중 `check` 워크플로의 잡 이름을 제목에 가진 것이 없다.
- PR #445 병합 뒤의 `.github/actions/post-merge-auto-fix/fix.mjs`가 잡 표시 이름을 어떻게 비교하는지
  다시 읽는다. 현재는 417행에서 `job.name === args.job`으로 비교한다.
- 비공개 Codex CI 소비자가 `check`의 잡 표시 이름을 참조하는지, 확인할 수 있는 범위에서 확인한다.
- [CI 운영 방식 조사](../../investigations/active/ci-management-practices-investigation.md)가 권한
  `task-worktrees` 잡의 별도 워크플로 분리가 진행 중이면 순서를 맞춘다. 두 작업 모두 `check.yml`의
  잡 구성과 CI 범위 표를 바꾼다.

**3-1. 잡 표시 이름에서 `check (` 접두를 뺀다.**

| 지금 | 바꾼 뒤 |
| --- | --- |
| `check (task-worktrees, ${{ matrix.os }})` | `task-worktrees (${{ matrix.os }})` |
| `check (${{ matrix.part }})` | `${{ matrix.part }}` |
| `check (server-integration)` | `server-integration` |
| `check (required)` | 그대로 |

**3-2. matrix 잡 id `check`를 내용을 말하는 이름으로 바꾼다.** 후보는 `common`이다. CI 범위 표가 이
잡의 검사를 "공통"으로 분류하기 때문이다. `required`의 `needs`와 CI 범위 표 키 `check/check`(8행)를
함께 바꾼다. `verify-ci-coverage.test.mjs`의 시험 입력 문자열이 실제 워크플로를 가리키는지 확인하고,
가리킬 때만 바꾼다.

**3-3. 문서.** `verification.md`의 `check` 설명과 1단계 흐름도의 표기를 새 이름에 맞춘다. 역할 표는
워크플로 단위라 바뀌지 않는다. 작성 시점의 명칭을 기록한 활성 문서 두 곳
(`task-worktree-lifecycle.md`, `ci-management-practices-investigation.md`)은 바꾸지 않는다.

바꾼 뒤 PR 체크 목록은 다음처럼 보인다.

```text
지금                                       바꾼 뒤
check / check (static)                     check / static
check / check (task-worktrees, macos-15)   check / task-worktrees (macos-15)
check / check (server-integration)         check / server-integration
check / check (required)                   check / check (required)
```

"check"는 집계 잡에만 남고, 그 이름이 "check 워크플로의 필수 결과"로 읽힌다.

### 채택하지 않은 안

| 안 | 채택하지 않은 이유 | 다시 검토할 조건 |
| --- | --- | --- |
| 집계 잡 이름을 `PR gate` 등으로 변경 | 룰셋(저장소 밖), AGENTS.md, README, 드리프트 시험이 이 이름에 결합돼 있다. 룰셋 변경과 병합 순서가 어긋나면 모든 PR이 막힌다. "required"가 이미 역할을 말한다(n8n `Required Checks`, TypeScript `required`) | 집계 잡을 둘 이상 두게 될 때. 그때는 vscode처럼 룰셋을 저장소 파일로 두고 대조하는 방식을 먼저 도입한다 |
| 워크플로 파일 이름 접두사(n8n, twenty) | 파일 이름 참조가 수십 곳이고, 실행 이력이 파일에 묶여 승격 절차의 기존 실행 조회가 끊긴다. 다중 역할 워크플로는 접두사 하나로 분류되지 않는다 | 워크플로가 수십 개로 늘고 한 워크플로가 한 역할을 맡게 될 때 |
| 워크플로 `name:` 접두사(n8n) | `workflow_run` 구독, `[post-merge]`·`[gate]` 이슈 제목, 게이트 기록이 이름에 결합돼 있다. 분류 한계는 위와 같다 | 위와 같다 |
| `npm run check`·`scripts/checks/` 이름 변경 | 정적 검사를 check로 부르는 것은 관례다(kibana `scripts/check.js`, n8n `pnpm check:dependencies`, prisma `check-*`) | 없음 |
| n8n 방식의 `.github/WORKFLOWS.md` 전체 지도 | `docs/architecture/`가 기준 문서라는 저장소 규칙과 겹치고, 손으로 쓴 긴 문서는 대조 장치 없이 낡는다 | 없음 |
| scripts 폴더 재배치 | ADR-0004가 실행 종류별 분리를 기각했고, 참고 저장소도 CI 단계로 나누지 않는다. PR 게이트 구성은 scripts가 아니라 `check.yml`에 있다 | ADR-0004를 다시 검토할 때 |
| vscode 방식의 룰셋 파일화와 대조 | 이번 범위에서 룰셋을 바꾸지 않는다 | 집계 잡 이름이나 룰셋을 바꿀 때 |
| 흐름 지도와 역할 표를 한 단계로 묶기 | 흐름도는 대조 없이도 잘 낡지 않지만, 역할 표는 대조 검사와 함께 들어가야 처음부터 검사를 받는다. 나누면 1단계를 검사 코드 없이 바로 쓸 수 있다 | 없음 |

## Affected Files

| 경로 또는 영역 | 단계 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- | --- |
| `docs/architecture/verification.md` | 1, 2, 3 | update | "CI 흐름" 절과 흐름도(1), 역할 표(2), CI 범위 표 키와 `check` 설명(3) | low. PR #445가 같은 파일을 고치므로 병합 순서를 맞춘다 |
| `.github/workflows/README.md` | 1, 2 | add, update | 기준 문서를 가리키는 안내(1), 역할 표 한 줄(2) | low. 워크플로로 읽히지 않는다 |
| `scripts/checks/verify-ci-coverage.mjs` | 2 | update | 역할 표 대조 추가 | medium. 대조 규칙이 너무 엄격하면 정상 변경을 막는다 |
| `scripts/checks/verify-ci-coverage.test.mjs` | 2, 3 | update | 대조 시험 추가(2), 필요하면 입력 문자열의 잡 id 갱신(3) | low |
| `AGENTS.md` | 2 | update | 역할 표 갱신 규칙 한 문장 | low |
| `.github/workflows/check.yml` | 3 | update | 잡 표시 이름 세 줄, matrix 잡 id, `needs` | medium. 잡 이름을 문자열로 쓰는 도구가 있다(Safety Analysis) |

## Safety Analysis

1단계는 문서만, 2단계는 문서와 검사만 바꾸고 이름은 바꾸지 않는다. 3단계는 룰셋과 결합되지 않은
잡 이름만 바꾼다. 이름으로 연결된 경계를 다음과 같이 확인했다.

확인한 항목:

- [x] 룰셋: `Require check on dev`는 `check (required)` 하나만 요구한다(gh api, 2026-11-25). 세 단계
  모두 이 이름을 바꾸지 않는다.
- [x] 작업 마무리: `scripts/pr/github-merge.mjs`는 `check.yml` 경로의 PR 실행 결과와 `isRequired`
  체크로 판정한다. 잡 표시 이름과 무관하다.
- [x] 병합 후 기록: `post-merge-failure-record`는 워크플로 이름으로 구독하고, 워크플로 이름은 바꾸지
  않는다. 이슈 제목은 잡 표시 이름을 쓰므로 3단계 뒤의 새 실패는 새 제목으로 열린다. 2026-11-25
  기준 열린 `[post-merge]` 이슈는 0건이고, 3-0에서 다시 확인한다.
- [x] 자동 수정: `fix.mjs` 417행은 이슈의 잡 이름과 실행의 잡 표시 이름을 비교한다. 옛 이름의 열린
  이슈가 없으면 영향이 없다. PR #445가 이 파일을 고치므로 3-0에서 다시 읽는다.
- [x] CI 범위 표: 키는 `워크플로/잡 id`다. 표시 이름 변경은 영향이 없고, 잡 id 변경은
  `verify:ci-coverage`가 누락을 잡는다.
- [x] 게이트 기록: `check`는 게이트 기록 대상이 아니다.
- [x] `.github/workflows/README.md`: GitHub Actions와 `verify-ci-coverage.mjs` 모두 `.yml`만 읽는다.
- [x] 테스트와 스크립트 참조: `check.yml`, `check/check`, 잡 표시 이름의 참조를 rg로 셌다(조사 문서
  Known Facts 6).
- [ ] 비공개 Codex CI 소비자의 잡 이름 참조: 확인하지 못했다. 3-0에서 확인할 수 있는 범위를 기록한다.

## Approval

승인 기록의 단일 기준은 front matter의 `approved-by`, `approved-at`, `approval-scope`다.

승인 메모:

- 승인 전.
- 세 단계는 따로 승인한다. 승인된 단계까지만 `approval-scope`에 적고, 다음 단계는 앞 단계가 병합된
  뒤 승인받는다.
- 3단계의 matrix 잡 id 새 이름은 3단계 승인 때 확정한다.

## Execution Plan

1. 1단계 PR: "CI 흐름" 절과 흐름도, `.github/workflows/README.md`.
2. 1단계 병합 뒤 2단계 승인을 받는다. PR #445와 `auto-fix-ruler.yml`의 병합 순서를 확인하고, 최신
   `dev`의 워크플로 목록으로 역할 표를 다시 만든다.
3. 2단계 PR: 대조 검사와 시험(2-2, 2-3), 역할 표(2-1), AGENTS.md(2-4), README 한 줄(2-5).
4. 2단계 병합 뒤 3단계 승인을 받고, 3-0을 확인한다.
5. 3단계 PR: 잡 표시 이름과 matrix 잡 id(3-1, 3-2), CI 범위 표와 문서(3-3).
6. 3단계 PR의 체크 목록과 병합 뒤 push 실행에서 새 이름을 확인한다.

## Verification Plan

단계마다 실행할 검증:

| 단계 | 명령과 확인 |
| --- | --- |
| 1단계 | `npm run docs:check`, `npm run check` |
| 2단계 | `npm run verify:ci-coverage`, `node --test scripts/checks/verify-ci-coverage.test.mjs`, `npm run docs:check`, `npm run check`, `npm run verify:fsd`, `npm run verify:server`, `npm run verify:shared`, `npm run test:architecture` |
| 3단계 | 2단계의 명령 전부, `gh api repos/Sangeok/stagekeeper/rulesets/27968217`로 룰셋 전후 비교, PR 체크 목록 확인 |

검증 기준:

- 1단계: `docs:check`가 통과하고, 흐름도에 적은 워크플로와 잡 이름이 현재 파일과 같다.
- 2단계: `verify:ci-coverage`가 현재 워크플로와 역할 표에 대해 통과한다. 새 시험이 2-2의 실패
  조건을 각각 실패로 잡는다. 역할 표의 한 칸을 일부러 틀리게 바꾸면 `verify:ci-coverage`가 실패한다.
- 3단계: PR 체크 목록에 새 이름과 `check / check (required)`가 보이고, 집계 잡이 성공하며 PR이
  `CLEAN`이 된다. 룰셋 조회 결과가 변경 전과 같다. 병합 뒤 `dev` push 실행에서
  `post-merge-failure-record`가 계속 실행된다.
- 기존 실패 구분: 각 단계 전에 변경 전 `dev`에서 같은 명령을 먼저 실행해 기준을 남긴다.

## Verification Results

| 단계 | 결과 | 비고 |
| --- | --- | --- |
| 1단계 | Not run yet | |
| 2단계 | Not run yet | |
| 3단계 | Not run yet | 룰셋 전후 비교 포함 |

## Risks and Rollback

잔여 리스크:

- 2단계: 역할 표 대조가 앞으로 쓰일 트리거 형식을 다 다루지 못하면 정상 변경을 막을 수 있다. 다루지
  못한 형식은 조용히 통과시키지 않고 실패로 알린다. 역할 표는 워크플로나 트리거를 바꿀 때마다 함께
  고쳐야 하며, 이 유지 비용은 의도한 것이다.
- 3단계: 비공개 Codex CI 소비자가 `check`의 잡 표시 이름을 참조할 수 있다. 병합 뒤 GitHub의 체크
  이력에 옛 이름과 새 이름이 섞여 보인다.

롤백 방법:

- 각 단계의 PR을 revert한다. 룰셋을 바꾸지 않으므로 revert만으로 돌아간다.
- 3단계를 revert할 때는 그 사이 새 이름으로 열린 `[post-merge]` 이슈가 있는지 먼저 본다. 있으면
  자동 수정이 비교할 잡 이름이 다시 어긋나므로, 그 이슈를 정리한 뒤 revert한다.

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성한다.

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [x] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
