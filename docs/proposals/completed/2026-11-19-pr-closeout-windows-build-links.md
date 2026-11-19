---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-18"
approved-by: "user"
approved-at: "2026-11-19"
approval-scope: "제안서 전체의 구현(2번은 device-identity-unavailable 명시 거부 채택)·시험·문서와 로컬 검증, 제안서와 구현의 커밋·push·dev 대상 PR 생성. PR 병합, main 승격, 이 PC 관리기 활성화와 Node 교체 제외."
completed-at: "2026-11-19"
verification-summary: "PR #385(구현 7519673, 시험 수정 9d85bad)의 check CI가 Windows·macOS task-worktrees를 포함해 모두 통과했고, dev ae8bb8a로 병합. 로컬 scripts/pr 시험은 Node v22.23.4에서 68개 중 65 통과·0 실패, Node v22.13.1에서는 의도한 device-identity-unavailable 거부를 확인. test:architecture 실패 1건은 변경 전부터 있던 실패."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/pr-worktree-closeout.md"
  - "docs/proposals/active/pr-worktree-closeout-phase-adopt.md"
  - "docs/test-reports/completed/2026-11-18-pr-worktree-replace.md"
  - "docs/architecture/verification.md"
---

# Windows에서 빌드한 작업의 PR 인계 허용

## Summary

Windows에서 `next build`를 한 작업 worktree는 PR 완료 관리기(`npm run pr --`)의 봉인 단계에서
거부된다. 그래서 `complete`·`recover`·`retire` 어느 경로로도 병합하거나 닫을 수 없다
([#383](https://github.com/Sangeok/stagekeeper/issues/383)). 자동 정리 자격이 없는 호스트에서는
Next가 만드는 두 빌드 링크가 **병합 인계는 막지 않고 자동 삭제만 막도록** 파일 검사를
인계용과 삭제용으로 나눈다. 아울러 Windows에서 장치 번호를 믿을 수 없는 Node 런타임은
지금처럼 오해를 부르는 `foreign-filesystem` 대신 전용 사유로 거부한다.
자격을 갖춘 Mac의 동작과 삭제 조건은 바꾸지 않는다.

## Goal

- Windows처럼 자동 정리 자격이 없는 호스트에서도, 빌드한 작업을 정상 순서(설치 → 빌드 → `complete`)로 dev에 병합한다. 로컬 정리는 지금처럼 `cleanup-pending` → 수동 제거 → `acknowledge-removal` → `cleanup`으로 끝낸다.
- REQ-PWC-003의 "미지원·unknown 관측만으로 확정된 HEAD의 병합을 금지하지 않는다"는 의도를 구현과 일치시킨다.
- 작업 유형: 개발 도구(`scripts/pr`)의 검사 범위 조정과 운영 문서 개정.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 병합과 삭제의 전제 조건이라는 도구 계약을 바꾼다.
- 코드·시험·운영 문서까지 5개를 넘는 파일을 바꾼다.

## Current State

### 차단 경로

- `complete`와 `retire`는 병합이나 retire 판단에 앞서 `seal`을 호출한다. `seal`은 `inspectFiles`로 파일 보존 검사를 한다([index.mjs:127](../../../scripts/pr/index.mjs#L127)). `recover`는 봉인된 작업만 다루므로 봉인 전 작업에는 효과가 없다.
- `inspectFiles`는 `.next/node_modules/pg-<hex>`와 `.next/node_modules/@prisma/client-<hex>` 링크를 검증된 Mac 호스트와 Apple Git-155에서만 허용한다. 그 밖의 호스트에서는 `linked-path`로 거부한다([git-workspace.mjs:265](../../../scripts/pr/git-workspace.mjs#L265)).
- 같은 함수가 인계(봉인·재확인)와 삭제(cleanup 직전 검사)에 함께 쓰인다(index.mjs:127·131·191·202·252·256·297).
- AGENTS는 빌드를 요구하면서 "Do not pre-delete caches or links"(AGENTS.md:225)도 요구한다. 그래서 Windows에서 빌드한 작업을 닫는 정해진 경로가 없다.

### 재현 (2026-11-18, Windows 11, dev `84f6ccc`, 시험 fixture와 GitHub 대역)

| 경우 | Node v22.13.1 | Node v22.23.4 |
| --- | --- | --- |
| A. 열린 PR + 빌드 정션, `complete` | working, `foreign-filesystem`, 병합 요청 0회 | working, `linked-path`, 병합 요청 0회 |
| B. 정션 없음, `complete` (대조군) | cleanup-pending, 병합 요청 1회 | cleanup-pending, 병합 요청 1회 |
| C. 다른 곳에서 병합 + 정션, `complete`·`recover`·`retire` | 모두 working | 모두 working |
| `preservation.test.mjs` | 6 통과, 1 실패 | 7 통과 |

- B가 설계된 Windows 경로다. A와 C는 그 경로에 닿지 못한다.
- 이 PC의 `next build`도 같은 두 링크를 정션으로 만든다.

### Node 버전에 따른 장치 번호

- Node v22.13.1의 Windows `lstat`은 일반 디렉터리의 `dev`를 `0`으로, 정션은 볼륨 값으로 보고한다. 그래서 `filesystem-inventory.mjs`의 같은 장치 검사([filesystem-inventory.mjs:18](../../../scripts/pr/filesystem-inventory.mjs#L18))가 링크 규칙보다 먼저 정션을 `foreign-filesystem`으로 거부한다.
- 이 PC의 `scripts/pr` 전체 시험 4건 실패(cleanup.test.mjs의 세 시험, preservation.test.mjs 첫 시험)가 모두 이 원인이다.
- CI의 Windows 기록(Server 2022, Node v22.23.4)과, 같은 PC에서 받은 Node v22.23.4에서는 일반 디렉터리도 볼륨 값을 보고하고 시험이 통과한다.
- `package.json` `engines`·`.nvmrc`는 없다. CI는 `node-version: 22`를 쓴다.
- 작업 생성 때 기록하는 worktree 신원(`directoryIdentity`의 device·inode)도 같은 값을 쓴다. Node v22.13.1에서 만든 작업을 Node v22.23.4로 `inspect`하면 `identity-changed`가 나온다(같은 날 이 PC에서 재현). 옛 Node에서 만든 작업은 Node를 올린 뒤에는 봉인할 수 없다.

### 기록된 결정

REPLACE 보고서는 "generated directory link가 남은 build 작업은 인계/정리가 보류될 수 있다"를 받아들인 제한으로 기록했다. `preservation.test.mjs`와 `cleanup.test.mjs`도 이 동작을 고정한다. 이 제안은 그 결정 가운데 **인계 보류** 부분을 바꾸고, **정리 보류**는 유지한다.

## Scope

포함 범위:

- `inspectFiles`에 검사 목적(인계 / 삭제)을 두고, 자동 정리 자격이 없는 호스트에서 두 빌드 링크를 인계 목적에 한해 허용한다.
- Windows에서 작업 루트의 장치 번호가 `0`이면 전용 사유로 거부한다.
- 위 동작의 Windows·macOS 시험, 운영 문서(AGENTS·verification·상위 SDD·UPSTREAM·ADOPT 계획)의 해당 문단.

제외 범위:

- 자격을 갖춘 Mac 호스트의 동작, 자동 삭제 자격(usage profile), Windows 자동 정리.
- 두 링크 이외의 디렉터리 링크·정션. `node_modules` 자체를 본 checkout으로 잇는 정션은 외부 링크이므로 REQ-PWC-006에 따라 계속 거부한다.
- Next 빌드 설정 변경, `.next`를 미리 지우는 규칙(AGENTS.md:225 유지).
- 이 PC의 관리기 활성화(ADOPT 범위), main 승격, 플러그인 판 상승(`scripts/pr`는 출시 대상이 아님).

## Proposal

### 1. 인계와 삭제의 파일 검사 분리

`inspectFiles(ctx, record, { purpose })`의 `purpose`는 `"handoff"` 또는 `"removal"`이다.

| 호출 위치 | purpose |
| --- | --- |
| `seal`의 첫 검사와 guard 안 재확인 (index.mjs:127·131) | handoff |
| `complete`의 봉인 후 재확인 (index.mjs:252·256) | handoff |
| `resume`의 재확인 (index.mjs:297) | handoff |
| `cleanup`의 제거 전 검사와 guard 안 재확인 (index.mjs:191·202) | removal |
| `inspect`의 로컬 검사 (index.mjs:368) | handoff. 삭제 차단 사유는 `local.files.removalReasons`에 따로 표시 |

두 빌드 링크의 판정:

| 호스트 | handoff | removal |
| --- | --- | --- |
| 자격을 갖춘 Mac (`matchesMacCloseoutHostV1()`, Apple Git-155) | 지금과 같음 (허용) | 지금과 같음 (허용) |
| 그 밖의 호스트 | **허용**. 단, 아래 구조 조건을 모두 만족해야 함 | 지금과 같음 (`linked-path`) |

구조 조건은 Mac 예외에서 호스트·Git 판 검사만 뺀 것이다.

- 경로가 `^\.next/node_modules/(pg|@prisma/client)-[0-9a-f]{16}$`.
- 실제 목적지(`realpath`)가 같은 worktree의 `node_modules/<pkg>`.
- 링크 문자열: Windows 정션은 절대 경로이므로 해석한 경로가 위 목적지와 같아야 한다. 그 밖의 OS는 지금처럼 원시 상대 경로가 일치해야 한다.
- 링크와 대상 패키지, 양쪽 상위 디렉터리가 ignored인 일반 디렉터리이고 같은 장치에 있다.
- 대상 패키지에 추적 파일이 없다.

이 조건을 하나라도 어기는 링크는 지금처럼 두 목적 모두에서 `linked-path`다(형제 worktree를 가리키는 링크 등).

결과 흐름(자격 없는 호스트, 빌드한 작업):

1. `complete` → 봉인 통과 → 병합 요청과 증명.
2. `cleanup`의 removal 검사가 `linked-path`로 멈춘다. 상태는 `cleanup-pending`(사유 `linked-path`)이고 worktree와 branch는 보존된다.
3. 사용자가 직접 제거하고 `acknowledge-removal` → `cleanup`으로 branch를 정리한다. 이 경로는 지금과 같다.

봉인 지문은 handoff 결과로 기록한다. 자격 있는 Mac에서는 두 목적의 결과가 같으므로 기존 지문 비교가 그대로 성립한다.

### 2. 장치 번호를 믿을 수 없는 런타임의 명시적 거부

Windows에서 `lstat(...).dev`가 `0`인 디렉터리 신원은 기록하지도 비교하지도 않는다. 다음 위치에서 검사한다.

- `git-workspace.mjs`의 `directoryIdentity`: 작업 생성, worktree 신원 확인, guard, 이관이 모두 이 함수를 쓴다.
- `filesystem-inventory.mjs`의 작업 루트 검사.
- `index.mjs`: status·inspect를 뺀 모든 명령이 시작할 때 control checkout과 공통 Git 디렉터리에 같은 검사를 한다. guard는 디렉터리를 만든 뒤 신원을 기록하므로, 이 앞 검사가 없으면 거부된 명령이 guard를 남겨 Node를 올린 뒤에도 `legacy-guard-present` 등으로 막힌다(구현 중 시험으로 확인).

`process.platform === "win32"`이고 `dev`가 `0`이면 `device-identity-unavailable`로 거부한다. 운영 문서에는 Windows 검증 Node를 v22.23.4 이상으로 적는다.

- 옛 Node에서는 `status`와 `inspect`(로컬 사유 `device-identity-unavailable` 표시)만 동작한다. 신원을 기록하는 명령(`create`, 기존 worktree가 있는 `migrate preview`·`apply`)과 상태를 바꾸는 명령은 처음부터 거부된다. 그래서 장치 번호 `0`이 작업 기록이나 이관 계획에 들어가지 않고, Node를 올린 뒤 `identity-changed`로 막히는 작업이 생기지 않는다.
- 이관 계획(`migrate preview`)도 기존 worktree의 신원을 행마다 기록한다(legacy-migration.mjs:81). 그래서 이 PC를 나중에 활성화할 때도 Node v22.23.4 이상이 필요하다.
- 지금은 같은 상황이 `foreign-filesystem`으로 보고되어 원인을 오해하게 한다.
- 대안(채택하지 않음): 링크 항목만 장치 검사에서 빼기. 옛 Node에서도 봉인은 통과한다. 하지만 장치 번호 `0`으로 만든 작업이 Node를 올린 뒤 `identity-changed`로 막히는 문제는 남는다.

### 3. 문서

- AGENTS.md:221-225: 두 링크가 자격 없는 호스트에서는 인계를 막지 않고 삭제만 막는다는 문장을 추가한다. "Do not pre-delete caches or links"와 정션 보존 문장은 유지한다.
- verification.md:412-431: 같은 내용과 Windows Node 조건, 새 거부 사유를 적는다.
- 상위 SDD(`pr-worktree-closeout.md`): 개정 기록에 이 범위 조정을 남긴다.
- `scripts/pr/UPSTREAM.md:127`: 링크 정책 설명을 갱신한다.
- ADOPT 계획: T5 전제에 이 변경과 #383을 연결한다.
- CI job은 바꾸지 않는다. 시험은 기존 `task-worktrees` job(Windows·macOS 행렬)이 실행한다. 그래서 verification.md의 CI 범위 표도 바뀌지 않는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `scripts/pr/git-workspace.mjs` | update | `inspectFiles`의 purpose와 링크 판정, `directoryIdentity`의 장치 번호 검사 | medium: 인계 조건이 넓어짐. removal은 그대로 |
| `scripts/pr/index.mjs` | update | 호출 위치별 purpose 전달, inspect 표시, 명령 시작 때 장치 번호 검사 | low |
| `scripts/pr/filesystem-inventory.mjs` | update | `device-identity-unavailable` | low: 옛 Node의 Windows에서 거부 사유가 바뀜 |
| `scripts/pr/preservation.test.mjs` | update | 정상 링크의 handoff 허용·removal 거부, 위반 형태는 둘 다 거부, 장치 번호 0 거부와 guard 미잔존 | low |
| `scripts/pr/cleanup.test.mjs` | update | 자격 없는 호스트의 빌드 링크 작업이 병합 후 cleanup-pending, 다른 곳에서 병합된 작업과 retire 작업의 인수와 수동 제거 경로(빌드 링크 도우미가 이 파일에 있어 함께 둠) | low |
| `AGENTS.md`, `docs/architecture/verification.md` | update | 운영 규칙 | low |
| `docs/proposals/active/pr-worktree-closeout.md`, `docs/proposals/active/pr-worktree-closeout-phase-adopt.md`, `scripts/pr/UPSTREAM.md` | update | 계약·출처·T5 연결 | low |

## Safety Analysis

- **삭제 조건은 넓어지지 않는다.** removal 판정과 자동 삭제 자격(qualified + clear + complete coverage + settled)은 바뀌지 않는다. 자격 없는 호스트는 원래 자동 삭제를 하지 않는다. 그래서 정션을 따라 지우는 위험이 새로 생기지 않는다(REQ-PWC-015, INV-PWC-006).
- **병합 근거는 그대로다.** HEAD·instance·추적·미추적·Git 진행 상태·숨김 flag·submodule·ignored 자료 검사는 handoff에서도 모두 유지된다. 허용되는 것은 같은 worktree의 ignored 패키지를 가리키는 두 빌드 링크뿐이고, 사용자 자료가 아니다(REQ-PWC-003, REQ-PWC-006).
- **병합과 삭제가 분리된다.** 병합 뒤 정리 보류는 기존 `cleanup-pending` 경로이고 INV-PWC-004와 같다.
- **Mac은 바뀌지 않는다.** 자격을 갖춘 Mac에서는 두 목적의 결과가 같다. 진행 중인 ADOPT의 Mac 인수(T3b, A2)에는 영향이 없다.
- **상태 형식은 그대로다.** task record schema와 ref 형식을 바꾸지 않는다. 옛 도구가 새 도구로 봉인된 작업을 읽으면 removal 검사에서 `linked-path`로 보존한다.

확인한 항목:

- [x] 테스트와 스크립트 참조: 링크 동작을 고정한 시험은 `preservation.test.mjs` 첫 시험, `cleanup.test.mjs:27·60·128`이다.
- [x] 런타임 side effect: CLI 진입점 밖에서 mutation을 추가하지 않는다(CON-PWC-001).
- [x] 다른 SDD 요구 사항과의 충돌: REQ-003·005·006·014·015·016, INV-003·004·005·006, CON-001·003·006·008을 구현과 대조했다. 삭제 조건과 수동 제거 인수는 바뀌지 않고, 활성화(`migrate`)는 Windows Node 조건을 새로 갖는다(CON-006 범위의 운영 문서에 기록).

## Approval

승인 메모:

- 2026-11-19 승인. 2번은 명시적 거부(`device-identity-unavailable`)를 채택했다. 대안(링크 항목만 장치 검사에서 제외)은 Node를 올린 뒤 `identity-changed`로 막히는 작업을 막지 못한다.
- 병합은 PR을 연 뒤 따로 확인받는다.

## Execution Plan

1. 시험을 먼저 바꾼다. 자격 없는 호스트에서 정상 빌드 링크 작업이 병합되는 것과 removal이 거부되는 것을 기대값으로 둔다(지금 코드에서 실패해야 한다).
2. `inspectFiles` purpose 분리와 호출 위치를 구현한다.
3. `filesystem-inventory.mjs`의 장치 번호 검사를 구현한다.
4. 문서 5곳을 갱신한다.
5. 로컬 검증 뒤 PR을 dev로 올리고 #383에 연결한다. Windows·macOS `task-worktrees` job이 녹색이어야 한다.

## Verification Plan

실행할 검증:

```bash
node --test scripts/pr/*.test.mjs scripts/pr/process-usage/*.test.mjs
npm run verify:fsd && npm run verify:server && npm run verify:shared && npm run test:architecture
npm run docs:check && npm run verify:ci-coverage
```

검증 기준:

- Windows(이 PC, Node v22.23.4): A 경우에 병합 요청 1회, `cleanup-pending`(`linked-path`), worktree·branch 보존. C 경우에 `complete`가 병합을 인수하고 `cleanup-pending`. 수동 제거 → `acknowledge-removal` → `cleanup` 뒤 `complete`.
- Windows(이 PC, Node v22.13.1): `create`·`complete`와, 기존 worktree가 있는 `migrate preview`가 `device-identity-unavailable`로 거부된다. 작업 기록·worktree 생성과 병합 요청은 0회. `status`는 동작하고 `inspect`는 같은 사유를 로컬 사유로 표시한다.
- 형제 worktree를 가리키는 링크 등 위반 형태는 두 OS 모두에서 병합 요청 전에 거부.
- 자격을 갖춘 Mac의 기존 시험 결과가 바뀌지 않음. CI의 macOS 행은 자격 호스트가 아니므로 "자격 없는 호스트" 기대값으로 판정한다.
- 기존 실패와 신규 실패 구분: 변경 전 dev `373dcca`에서 같은 명령의 결과(Node v22.13.1에서 4건 실패)를 기준으로 비교한다.

## Verification Results

2026-11-19, 이 PC(Windows 11)에서 실행. CI 결과는 표의 마지막 세 행이다.

시험 먼저: 바꾼 기대값 5개(빌드 링크 인계·병합 후 cleanup-pending·다른 곳에서 병합된 작업과 retire·장치 번호 0 거부 2개)가 변경 전 코드에서 실패하는 것을 Node v22.23.4로 확인한 뒤 구현했다. 명령 시작 때의 장치 번호 검사를 빼면 장치 번호 0 시험이 `legacy-guard-present`로 실패하는 것도 확인했다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `node --test scripts/pr/*.test.mjs scripts/pr/process-usage/*.test.mjs` (Node v22.23.4) | PASS: 68개 중 65 통과, 0 실패, 3 건너뜀 | 새 시험 3개. 건너뜀은 자격 있는 Mac 전용과 native 관측 전용 시험이다 |
| 같은 명령 (Node v22.13.1) | 24 통과, 41 실패, 3 건너뜀 | 의도한 결과. 실패는 모두 fixture 준비(`migrate preview`)의 `device-identity-unavailable`이다. 변경 전에는 58 통과, 4 실패(`foreign-filesystem`) |
| Node v22.13.1 실제 동작 (Node v22.23.4로 만든 fixture) | 기준 충족 | `status` 0, `inspect`의 로컬 사유 `device-identity-unavailable`. `complete`·`retire`·`create`·`migrate preview`는 같은 사유로 거부. 병합 요청 0회, 새 경로 없음, ref 변화 없음, guard 0개 |
| `npm run verify:fsd`, `verify:server`, `verify:shared` | PASS | worktree에 본 checkout의 `node_modules`를 잠시 연결하고 Prisma client를 생성해 실행 |
| `npm run test:architecture` (Node v22.23.4) | 422개 중 410 통과, 1 실패, 11 건너뜀 | 실패 1건(`gate-record/record.test.mjs`의 "runs the Action record CLI once…")은 변경 전 dev `373dcca`에서도 같은 실패. 이 변경과 무관 |
| `npm run docs:check` | PASS | Markdown 244개, 상대 링크 1,329개, test report 63개 |
| `npm run verify:ci-coverage` | PASS | 14 jobs, 16 rows. CI job 변경 없음 |
| PR #385 첫 CI(커밋 `7519673`, run 44418938605) | FAIL | `static`(Linux)과 macOS `task-worktrees`가 `preservation.test.mjs`의 거부 단언 하나에서 실패했다. 작업 밖을 가리키는 `node_modules` 링크에 `linked-path`를 기대했지만, POSIX의 symlink는 `.gitignore`의 `node_modules/`(디렉터리 전용 패턴)에 걸리지 않아 Git이 미추적 파일로 보고하고 `unpreserved-files`가 먼저 나온다. Windows 정션은 디렉터리로 취급되어 `linked-path`가 나온다. 구현 결함이 아니라, 원래 사유를 고정하지 않던 단언에 사유를 너무 좁게 붙인 시험 결함이었다 |
| PR #385 재실행 CI(커밋 `9d85bad`, run 44422277521) | PASS | 그 단언이 두 사유를 모두 받게 하고, POSIX의 빌드 링크를 상대 경로로 만들고, 탈출 링크를 지운 뒤 인계가 통과하는 것까지 확인하도록 고쳤다. `check`의 `static`, `test`, `test-web`, `server`, `server-integration`, `build`, `task-worktrees`(Windows·macOS)와 Vercel 모두 통과 |
| 병합 뒤 Windows Node 판별 장치 번호 (이 PC) | 확인 | 일반 디렉터리의 `lstat` `dev`: v22.13.1(libuv 1.49.2)은 `0`, v22.23.5(libuv 1.51.0)와 v26.13.1(libuv 1.52.1)은 볼륨 값. 공식 zip의 SHA256을 확인한 뒤 설치하지 않고 실행했다 |

## Risks and Rollback

잔여 리스크:

- Next가 다른 패키지(새 `serverExternalPackages`)의 링크를 만들기 시작하면 Mac 예외와 같이 다시 막힌다. 링크 형태를 넓히는 일은 이 제안 밖이다.
- Windows `lstat`이 일반 디렉터리에 장치 번호를 돌려주기 시작한 정확한 Node 판은 특정하지 않았다. 확인한 판은 v22.13.1(`0`)과 v22.23.4·v22.23.5·v26.13.1(볼륨 값)이다. 도구는 판 번호가 아니라 실행 중에 읽은 값으로 판단하므로, 확인하지 않은 판이 `0`을 돌려주면 같은 사유로 거부된다.
- 수동 제거 단계에서 정션을 따라가는 삭제 도구를 쓰면 대상이 지워질 수 있다. 도구는 이 단계를 수행하지 않으며 문서에 주의를 남긴다.

롤백 방법:

- 구현 PR을 revert한다. 상태 형식이 같으므로 이미 봉인·병합된 작업은 옛 도구에서 removal 검사의 `linked-path`로 보존된다.

## Completion or Closure Notes

구현을 병합해 2026-11-19 완료 처리했다. 이 문서는 `active/pr-closeout-windows-build-links.md`에서 `completed/2026-11-19-pr-closeout-windows-build-links.md`로 이동했다. Current State와 Proposal의 줄 번호, Affected Files의 경로는 작성 당시의 것이다.

- 구현: PR #385. 제안서 커밋 `adc4430`, 구현 커밋 `7519673`, 시험 수정 커밋 `9d85bad`. 병합은 사용자가 직접 했고 `dev` `ae8bb8a`로 들어갔다.
- 바뀐 파일: `scripts/pr/git-workspace.mjs`(`inspectFiles`의 purpose와 빌드 링크 판정, `directoryIdentity`의 장치 번호 검사), `scripts/pr/index.mjs`(호출 위치별 purpose, `inspect`의 `local.files.removalReasons`, 명령 시작 때 장치 번호 검사), `scripts/pr/filesystem-inventory.mjs`(`device-identity-unavailable`), `preservation.test.mjs`·`cleanup.test.mjs`, `AGENTS.md`, `docs/architecture/verification.md`, `scripts/pr/UPSTREAM.md`, 상위 SDD의 개정 기록, ADOPT 계획의 T5 전제, 이 문서.
- 상태 형식, CI job, 출하 플러그인 파일과 서버 코드는 바꾸지 않았다. 플러그인 판 상승과 승격 게이트 추가가 필요하지 않다.
- [#383](https://github.com/Sangeok/stagekeeper/issues/383)은 병합 내용과 Node 판별 실측을 댓글로 남기고 2026-11-19 닫았다.

다음은 완료를 막지 않는 후속이다. 미실행 항목을 통과로 바꾸지 않는다.

| 후속 | 상태 | 확인할 때 남길 근거 |
| --- | --- | --- |
| 이 PC의 Node 교체(v22.13.1 → 22 계열 최신) | 사용자 선택 | 교체 뒤 `node --version`과 `scripts/pr` 시험 결과. 교체 전에는 이 PC에서 관리기가 `status`와 `inspect`만 동작한다 |
| Windows 실 PR 인수(ADOPT T5) | ADOPT 계획의 일 | [ADOPT 계획](../active/pr-worktree-closeout-phase-adopt.md)의 T5 기록. 이 PC에서 하려면 Node 교체가 먼저다 |
| 빌드 링크를 만든 작업의 실제 수동 제거 경로 | 시험으로만 확인 | 실제 Windows 작업에서 `cleanup-pending`(`linked-path`) → 수동 제거 → `acknowledge-removal` → `cleanup`을 거친 기록. T5에서 함께 남긴다 |

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
- [x] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
