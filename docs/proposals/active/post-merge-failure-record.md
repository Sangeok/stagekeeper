---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-20"
approved-by: "user"
approved-at: "2026-11-20"
approval-scope: "이 문서의 Proposal 1~4와 Execution Plan 전체. 시험 세 곳 수정, 실패 기록 워크플로와 액션, AGENTS.md의 분류 규칙과 승격 전 확인, find:green-dev 명령, verification.md와 package.json 갱신. 실패 자동 수정은 포함하지 않는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/investigations/active/ci-management-practices-investigation.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/active/ci-verification-code-organization.md"
  - "docs/proposals/active/role-command-time-limit.md"
---

# 병합 후 검사 실패를 자동으로 다시 실행하고 이슈로 남긴다

## Summary

PR이 `dev`에 병합된 뒤에 도는 검사가 실패하면 지금은 커밋 옆의 X 표시만 남는다.
이 제안은 실패한 실행을 한 번 자동으로 다시 실행하고, 처음 실패와 다시 실행한
결과를 이슈에 적는 워크플로 하나를 더한다. 느린 러너에서만 실패하는 시험 세 곳을
먼저 고치고, 실패를 분류하고 처리하는 규칙과 전부 통과한 커밋을 찾는 명령을 함께
넣는다. 검사의 내용과 실행 조건은 바꾸지 않는다. 근거는
[CI 관리 방식 조사](../../investigations/active/ci-management-practices-investigation.md)의
"병합 후 OS 스위트 실패 분류"와 "병합 후 관리의 구성 검토"다.

## Goal

- 병합 후 검사의 실패가 사람이 커밋 목록을 열어 보지 않아도 기록으로 남게 한다.
- 환경 문제와 가끔 실패하는 시험은 사람 손을 거치지 않고 한 번 다시 실행되게 한다.
- 같은 실패가 몇 번 반복됐는지 이슈 하나에서 보이게 한다.
- 승격할 때 고를 커밋을 명령 하나로 찾게 한다.
- 작업 유형: 시험 수정, 워크플로와 그 스크립트 추가, 규칙 문서 수정.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 고칠 파일이 5개를 넘는다. 시험 파일 세 개, 새 워크플로와 액션, `package.json`,
  `AGENTS.md`, `docs/architecture/verification.md`가 대상이다.
- 새 워크플로가 이슈를 쓰고 다른 워크플로의 실행을 다시 시작한다. 저장소 밖으로
  보이는 동작이 생긴다.

## Current State

- `dev` 푸시에서 `check`, `windows-role-runtime`, `macos-runtime-contracts` 세
  워크플로가 돈다. `main` 푸시에서는 `check`만 돈다.
- 병합 후 실행이 실패해도 알리거나 기록하는 장치가 없다. 결과는 GitHub이 커밋마다
  합쳐 보여 주는 체크 상태(커밋 목록의 `✓ 13 / 13`이나 X)에만 남는다.
- 2026-10-21부터 30일 동안 병합 후 실패는 19건이었다. `check` 1건,
  `windows-role-runtime` 6건, `macos-runtime-contracts` 12건이다. 그중 사람이 다시
  실행한 것은 3건이고 모두 통과했다.
- 2026-11-10부터 11-19까지의 실패 14건은 로그를 읽어 분류했다. 병합된 변경이
  원인인 것은 없었다.

  | 원인 | 건수 | 지금 상태 |
  | --- | --- | --- |
  | macOS Intel에서 빌드 리허설 시간 초과 | 5 | `role-command-time-limit`로 고쳐졌다 |
  | macOS Intel에서 `plugin/bin/harness-watch.test.mjs`의 상태 단정 실패 | 5 | 남아 있다 |
  | Windows에서 `plugin/bin/harness-background.test.mjs` 시험 실패 | 2 | 남아 있다 |
  | Windows에서 `scripts/windows/windows-role-readlink.test.mjs` 정리 단계의 `EBUSY` | 1 | 남아 있다 |
  | GitHub이 macOS 러너를 배정하지 못함 | 1 | 환경 문제다 |

- 실제 모델을 부르는 게이트(`client-init-smoke`, `agent-eval`, `pipeline-smoke`)는
  이미 `record` 잡과 `.github/actions/gate-record`로 실패를 `[gate]` 이슈에 남긴다.
  병합 후 검사에는 같은 장치가 없다.
- 실패한 시험 세 곳의 원인은 아직 모른다. 느린 러너에서만 실패한다는 것까지만
  확인했다. 같은 커밋에서 `macos-15` 잡은 통과하고 `macos-15-intel` 잡만 실패했다.

## Scope

포함 범위:

- 느린 러너에서만 실패하는 시험 세 곳의 수정.
- 병합 후 실패를 다시 실행하고 기록하는 워크플로 하나와 그 스크립트, 시험.
- 실패를 분류하고 처리하는 규칙을 `AGENTS.md`에 적는 일.
- 전부 통과한 최신 `dev` 커밋을 찾는 읽기 전용 명령.
- 승격 전에 열려 있는 실패 이슈를 확인하는 규칙.
- `docs/architecture/verification.md`의 CI 범위 표와 스크립트 표 갱신.

제외 범위:

- 병합 후 검사의 내용, 실행 조건, 잡 구성. 그대로 둔다.
- 기본 검사를 룰셋의 필수 체크로 거는 일. 조사 문서의 도입 순서 3번이다.
- 두 실모델 게이트의 동시 실행 그룹. 도입 순서 4번이다.
- 에이전트가 스스로 원인을 찾아 고치는 PR을 여는 일(실패 자동 수정). 이 제안이
  `main`에서 실패를 의도대로 기록하는 것을 확인한 뒤 별도 제안서로 다룬다.
- 승격 워크플로. 도입 순서 5번이다. 승격 절차는 지금처럼 손으로 한다.
- 게이트 실패의 기록 방식. `[gate]` 이슈와 게이트 기록은 그대로 둔다.
- 자동으로 되돌리기, `dev`가 깨진 동안 병합을 막기, 실패 이슈를 자동으로 닫기.
- `task-worktrees` 잡을 기본 검사에서 떼어 내는 일.

## Proposal

### 1. 느린 러너에서만 실패하는 시험 세 곳을 고친다

- 대상은 `plugin/bin/harness-watch.test.mjs`,
  `plugin/bin/harness-background.test.mjs`,
  `scripts/windows/windows-role-readlink.test.mjs`다.
- 먼저 원인을 찾는다. 시간에 기대는 단정이면 고정된 대기 대신 상태를 기다리게
  고치고, 정리 단계의 파일 잠금이면 잠금이 풀린 뒤에 지우게 고친다.
- 시험을 건너뛰거나 단정을 약하게 만들어 통과시키지 않는다. 그렇게밖에 고칠 수
  없으면 고치지 않고 이유를 이 문서에 적는다.
- `.test.mjs` 파일은 배포되는 플러그인 파일이 아니라 플러그인 버전을 올릴 대상이
  아니다(`scripts/lib/plugin-payload.mjs`의 `isShippedPluginFile`). 원인이 시험이
  아니라 `plugin/bin`이나 `plugin/runtime`의 제품 코드에 있으면 그 수정은 배포
  파일을 바꾸므로 두 매니페스트의 버전을 함께 올린다.
- 이 수정은 Sonnet 5.5, effort `medium`으로 실행한 세션에 맡긴다. 뒤에 올 실패 자동
  수정의 첫 시도 설정이 쓸 만한지 확인하기 위해서다. 원인 분석과 수정이 충분한지는
  PR에서 사람이 판단하고, 판단을 이 문서의 검증 결과에 적는다.

### 2. 실패 기록 워크플로를 더한다

새 워크플로 `.github/workflows/post-merge-failure-record.yml`과 액션
`.github/actions/post-merge-failure-record/`를 둔다. GitHub에 기록하는 코드는 그
액션 폴더에 둔다는 `ci-verification-code-organization`의 배치를 따른다.

실행 조건:

| 조건 | 역할 |
| --- | --- |
| `workflow_run`의 `completed` (`check`, `windows-role-runtime`, `macos-runtime-contracts`) | 실패 직후에 기록한다 |
| `schedule`, 1시간마다 | 위 조건이 놓친 것을 줍는다 |
| `workflow_dispatch` | 수동 실행. `dry-run` 입력을 주면 이슈를 쓰지 않고 요약만 남긴다 |

하는 일:

1. `dev`의 세 워크플로와 `main`의 `check`에서, 이벤트가 `push`인 최근 실행을
   읽는다. 범위는 최근 72시간이다.
2. 결론이 `failure`, `timed_out`, `startup_failure`인 실행을 고른다. `cancelled`는
   동시 실행 그룹이 취소한 것이라 실패로 보지 않는다.
3. 첫 번째 시도(`run_attempt`가 1)가 실패했으면 실패한 잡만 다시 실행한다. 두 번째
   시도는 다시 실행하지 않는다.
4. 실패한 잡마다 "같은 실패"를 워크플로, 잡, 처음 실패한 단계의 이름으로 정한다.
   잡 이름에는 러너가 들어 있다(`runtime contracts (macos-15-intel)`). 실행은
   실패했는데 결론이 `failure`인 잡이 없으면, 성공하지 않은 잡을 대상으로 하고
   단계 자리에 "시작하지 못함"을 적는다. GitHub이 러너를 배정하지 못한 실행
   (`44312784163`)이 이 경우다. 잡의 결론이 `cancelled`이고 단계가 0개였다.
5. 같은 실패의 열린 이슈가 있으면 댓글을 덧붙이고, 없으면 새로 연다. 제목은
   `[post-merge] <workflow>/<job>: <step>`이다. 새로 열 때 같은 제목의 닫힌 이슈가
   있으면 그 번호를 본문에 적는다.
6. 실행 번호와 시도 번호를 댓글에 숨은 표시로 남기고, 이미 적힌 실행과 시도는
   건너뛴다. 그래서 몇 번을 실행해도 같은 내용을 두 번 적지 않는다.
7. 다시 실행한 시도가 끝나면 그 결과(통과 또는 실패)를 같은 이슈에 적는다.

이슈에 적는 정보:

- 실패한 커밋, 그 커밋을 만든 PR, PR이 바꾼 파일 목록.
- 실패한 잡과 단계, 그 잡의 로그 주소.
- 같은 잡의 바로 앞 `push` 실행 결과.
- 같은 커밋의 다른 병합 후 잡 결과.
- 다시 실행했는지와 그 결과.

권한과 동시 실행:

- `contents: read`, `actions: write`, `issues: write`, `pull-requests: read`만 준다.
  `actions: write`는 실패한 잡을 다시 실행하는 데 쓴다.
- 워크플로 전체에 동시 실행 그룹 하나를 걸어 한 번에 하나만 돌게 한다. 세
  워크플로가 비슷한 때에 끝나므로 같은 이슈를 두 번 여는 일을 막는다.
- `workflow_run`은 `branches: [dev, main]`으로 거르고, 잡은
  `github.event.workflow_run.event == 'push'`일 때만 돈다.

이슈는 자동으로 닫지 않는다. 사람이나 에이전트가 원인과 조치를 적고 닫는다.

### 3. 실패를 분류하고 처리하는 규칙을 적는다

`AGENTS.md`의 "Branching and pull requests"에 다음을 더한다.

| 분류 | 판단 | 조치 |
| --- | --- | --- |
| 병합된 변경이 원인 | 그 커밋이 실패한 시험이나 그 시험이 쓰는 코드를 바꿨고, 다시 실행해도 실패했다 | 고치기 전에 먼저 되돌린다. 되돌리는 변경도 PR로 올린다. 그 뒤에 고쳐서 다시 올린다 |
| 가끔 실패하는 시험 | 그 커밋과 무관한 시험이 실패했고, 다시 실행해 통과했거나 같은 이슈에 서로 다른 커밋이 쌓였다 | 시험을 고친다. 이슈에 쌓인 횟수가 순서를 정한다 |
| 환경 문제 | 러너 미배정이나 내려받기 실패처럼 시험 밖에서 실패했다 | 다시 실행한 결과가 통과인지 확인하고 이슈를 닫는다 |

승격 규칙에는 한 줄을 더한다. 승격 전에 열려 있는 `[post-merge]` 이슈를 읽고,
승격할 커밋이나 이번 승격에 든 변경에 관한 이슈가 열려 있으면 원인과 결정을 적고
닫은 뒤에 승격한다.

### 4. 전부 통과한 최신 커밋을 찾는 명령을 더한다

- `scripts/checks/find-green-dev-commit.mjs`와 `npm run find:green-dev`를 둔다.
- 최근 `dev` 커밋의 합쳐진 체크 상태(GraphQL `statusCheckRollup`)를 읽고, 상태가
  `SUCCESS`인 가장 최근 커밋의 전체 SHA를 출력한다.
- 그 커밋보다 뒤에 있는 커밋과 각 상태도 함께 출력한다. 승격하면서 무엇을 빼게
  되는지 보이게 하기 위해서다.
- 읽기만 한다. 브랜치나 태그를 만들거나 옮기지 않는다. `dev-green` 같은 표시는
  만들지 않는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `plugin/bin/harness-watch.test.mjs` | update | macOS Intel에서 5회 실패. 실패한 커밋들이 이 파일과 `plugin/runtime`을 바꾸지 않았다 | medium. 원인을 아직 모른다 |
| `plugin/bin/harness-background.test.mjs` | update | Windows에서 2회 실패 | medium. 원인을 아직 모른다 |
| `scripts/windows/windows-role-readlink.test.mjs` | update | Windows 정리 단계의 `EBUSY` 1회 | low |
| `.github/workflows/post-merge-failure-record.yml` | add | 새 워크플로 | medium. 이슈를 쓰고 실행을 다시 시작한다 |
| `.github/actions/post-merge-failure-record/` (`action.yml`, `record.mjs`, `record.test.mjs`) | add | `gate-record`와 같은 배치 | low. 순수 함수와 시험으로 나눈다 |
| `scripts/checks/find-green-dev-commit.mjs`와 짝 시험 | add | 읽기 전용 조회 | low |
| `package.json` | update | `find:green-dev` 스크립트 추가, `test:architecture`와 `test:scripts`에 새 시험 경로 추가 | low. 진행 중인 `ci-verification-code-organization` 작업이 같은 줄을 바꿀 수 있다 |
| `docs/architecture/verification.md` | update | CI 범위 표에 새 잡 한 줄, 스크립트 표에 새 파일 | low. `verify:ci-coverage`가 대조한다 |
| `AGENTS.md` | update | 분류 규칙과 승격 전 확인 한 줄 | low |

## Safety Analysis

- 새 워크플로는 저장소의 코드를 바꾸지 않는다. `contents: read`만 받고, 쓰는 대상은
  이슈와 다른 워크플로의 다시 실행뿐이다.
- 다시 실행은 첫 번째 시도가 실패했을 때 한 번만 한다. 두 번째 시도는 다시 실행하지
  않으므로 끝없이 반복하지 않는다.
- 다시 실행해 통과해도 기록이 남는다. 처음 실패와 다시 실행한 결과를 모두 이슈에
  적기 때문에 가끔 실패하는 시험이 가려지지 않는다.
- 같은 실패는 한 이슈에 쌓인다. 지난 14건에 적용하면 이슈는 5개다.
- 병합 후 검사의 결과 자체는 바뀌지 않는다. 커밋 옆의 체크 상태는 GitHub이 지금처럼
  보여 준다. 다만 다시 실행해 통과하면 그 커밋의 상태가 X에서 체크로 바뀐다.
  처음 실패는 이슈에 남는다.
- 게이트 기록(`.github/actions/gate-record`)과 `[gate]` 이슈는 건드리지 않는다. 새
  액션은 제목이 `[post-merge]`로 시작하는 이슈만 읽고 쓴다.

확인한 항목:

- [x] 테스트와 스크립트 참조. `test:architecture`와 `test:scripts`가 액션 폴더의
  시험을 경로로 직접 지정한다. 새 시험도 같은 방식으로 더해야 발견된다.
- [x] 런타임 side effect 또는 초기화 코드. 새 워크플로는 `main`에 있는 파일로만
  동작한다. `workflow_run`과 `schedule`이 기본 브랜치의 워크플로 파일을 쓴다.
- [x] API, 외부 SDK 영향. GitHub API만 쓴다. 저장소의 기본 토큰으로 호출한다.
- [ ] 출시된 plugin·서버와 함께 쓰는 상태. 시험 수정이 제품 코드까지 가면 그때
  확인한다. 시험 파일만 고치면 해당이 없다.

이 제안과 무관한 항목(라우팅, 정적 import, dynamic import, barrel export, 정적
자산, 타입 선언)은 뺐다.

## Approval

승인 메모:

- 추가 조건 없음. 확인하지 못한 항목의 결과가 계획과 다르면 이 문서를 고친 뒤 진행한다.

## Execution Plan

PR을 셋으로 나눈다. 앞의 것이 병합된 뒤에 다음 것을 시작한다.

1. 시험 수정. 세 곳의 원인을 찾고 고친다. 대상 러너에서 해당 시험 파일을 100회
   반복해 통과를 확인한다. 반복 실행에 쓴 임시 단계는 병합 전에 뺀다.
2. 실패 기록. 액션과 워크플로, 시험을 더하고 CI 범위 표와 `package.json`을 고친다.
   병합 전에 로컬에서 `record.mjs`를 읽기 전용으로 돌려 지난 실패에 대한 출력을
   확인한다.
3. 규칙과 명령. `AGENTS.md`의 분류 규칙과 승격 전 확인, `find:green-dev` 명령을
   더한다.
4. 승격. 세 PR이 든 `dev` 커밋을 `main`에 올린다. 워크플로는 이때부터 동작한다.
5. 확인. `main`에 올린 뒤 실제 실패 몇 건이 의도대로 기록되는지 본다. 실패가 나지
   않으면 수동 실행으로 확인한다.
6. 이 문서를 완료 처리하고, 실패 자동 수정 제안서의 시작 조건이 채워졌다고 적는다.

## Verification Plan

실행할 검증:

```bash
npm run check
npm run test:architecture
npm test
npm run verify:ci-coverage
npm run docs:check
node .github/actions/post-merge-failure-record/record.mjs --dry-run --since 2026-11-10 --until 2026-11-20
npm run find:green-dev
```

검증 기준:

- 시험 수정: 고친 시험 파일이 `macos-15-intel`과 `windows-2022` 러너에서 연속
  100회 통과한다. 역할 명령 한도를 올린 뒤 macOS 병합 후 실행 53건 중
  `harness-watch` 시험 실패가 2건이었다. 실패율이 그 정도면 50회 연속 통과는 고치지
  않아도 일곱 번에 한 번꼴로 나오므로 100회로 잡는다. 100회도 증명은 아니고,
  고쳐졌는지는 이후 병합 후 실행에서 같은 이슈가 다시 쌓이지 않는 것으로 확인한다.
- `record.mjs`의 단위 시험이 다음을 확인한다. 같은 실패가 한 이슈로 모인다. 이미
  적은 실행과 시도는 건너뛴다. 첫 번째 시도만 다시 실행한다. `cancelled`는
  기록하지 않는다. 닫힌 이슈가 있으면 번호를 적는다.
- 읽기 전용 실행을 2026-11-10부터 11-19까지에 대해 돌리면 실패 14건이 이슈 5개로
  묶인다. 2026-11-20에 실패한 잡과 단계를 조회해 확인한 묶음은 다음과 같다.

  | 워크플로 / 잡 | 처음 실패한 단계 | 건수 |
  | --- | --- | --- |
  | `macos-runtime-contracts` / `runtime contracts (macos-15-intel)` | Build the complete project inside the offline native role | 5 |
  | `macos-runtime-contracts` / `runtime contracts (macos-15-intel)` | Validate shared runtime contracts without client credentials | 5 |
  | `windows-role-runtime` / `native-runtime` | Validate the whole product test suite on Windows | 2 |
  | `windows-role-runtime` / `native-runtime` | Validate actual Windows role commands and bundled npm | 1 |
  | `macos-runtime-contracts` / `runtime contracts (macos-15)` | 시작하지 못함 | 1 |
- `verify:ci-coverage`가 새 잡을 표에서 찾는다.
- `main`에 올린 뒤: 실패한 실행이 한 번 다시 실행되고, 처음 실패와 다시 실행한
  결과가 같은 이슈에 적히고, 같은 실패가 또 나면 그 이슈에 쌓인다.
- 기존 실패와 새 실패의 구분: 이 작업 전에 `dev`에서 이미 실패하던 시험은 위 세
  곳이다. 그 밖의 시험이 실패하면 이 작업이 원인인지 먼저 확인한다.

확인하지 못한 것과 확인할 시점:

- `workflow_run`이 다시 실행된 워크플로의 완료에도 반응하는지. 반응하지 않아도
  1시간마다 도는 실행이 결과를 적는다. `main`에 올린 뒤 첫 실패에서 확인한다.
- 저장소의 기본 토큰으로 요청한 다시 실행이 받아들여지는지. `actions: write`로
  된다고 알고 있으나 이 저장소에서 해 본 적이 없다. `main`에 올린 뒤 확인한다.
- 기본 브랜치에 없는 워크플로를 `workflow_dispatch`로 실행할 수 있는지. 안 될
  가능성이 높아서, 병합 전 확인은 로컬의 읽기 전용 실행으로 한다.
- 한 단계 안에서 서로 다른 시험이 실패하면 같은 이슈에 섞인다. 구현할 때 실패한
  시험의 이름까지 구분에 넣을 수 있는지 본다.
- 실패한 잡만 다시 실행하는 요청이 결론이 `cancelled`인 잡(러너 미배정)도 다시
  실행하는지. 안 되면 그 경우에는 실행 전체를 다시 실행한다.
- 이슈가 열릴 때 알림이 오는지는 계정의 알림 설정에 달려 있다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | Not run yet | |
| `npm run test:architecture` | Not run yet | |
| `npm test` | Not run yet | |
| `node .github/actions/post-merge-failure-record/record.mjs --dry-run ...` | Not run yet | 실패 14건이 이슈 5개로 묶여야 한다 |
| 대상 러너에서 시험 파일 100회 반복 | Not run yet | |
| `main`에 올린 뒤의 실제 기록 | Not run yet | |

## Risks and Rollback

잔여 리스크:

- 시험 세 곳의 원인이 시험이 아니라 제품 코드에 있을 수 있다. 그러면 범위가
  커지고 플러그인 버전을 올려야 한다.
- 다시 실행이 러너 시간을 쓴다. 공개 저장소라 요금은 없다. 지난 30일의 실패가
  19건이었으므로 다시 실행도 그 정도다.
- 1시간마다 도는 실행이 하루 24번 Actions 목록에 남는다.
- 다시 실행해 통과하면 커밋 옆의 표시가 체크로 바뀐다. 처음 실패는 이슈에서만
  보인다.
- 이슈가 열려도 원인을 보는 일은 사람이 직접 하거나 에이전트에게 시켜야 시작된다.
  승격 전 확인 규칙이 늦어도 승격 때는 읽히게 한다.
- `package.json`과 `docs/architecture/verification.md`는 진행 중인
  `ci-verification-code-organization` 작업도 고치는 파일이다. PR을 올릴 때 최신
  `dev`와 다시 맞춘다.

롤백 방법:

- 워크플로가 잘못 동작하면 `.github/workflows/post-merge-failure-record.yml`을
  지우는 PR을 올리고 `main`에 승격한다. 급하면 GitHub의 Actions 화면에서 그
  워크플로를 끈다. 이미 열린 `[post-merge]` 이슈는 손으로 닫는다.
- 시험 수정, 규칙, 명령은 각각 해당 PR을 되돌린다. 서로 기대지 않는다.

## Completion or Closure Notes

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
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. 아직 실행 전이다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다. 완료 전이다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다. 닫힌 문서가 아니다.
