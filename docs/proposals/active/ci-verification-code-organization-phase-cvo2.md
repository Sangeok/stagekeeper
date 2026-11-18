---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-11-18"
updated-at: "2026-11-18"
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
  - "docs/proposals/active/ci-verification-code-organization.md"
  - "docs/proposals/active/ci-verification-code-organization-phase-cvo1.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/server.md"
  - "docs/architecture/shared-modules.md"
---

# CVO2 상세 실행 계획 — 리허설 파일 이동과 CI 연결

**완료 목표.** 설치·파이프라인·모델 평가·서버 준비·GitHub 기록 코드를 담당 위치로 옮긴다. 사용자는 기존 CLI를 같은 인자로 실행할 수 있고, CI는 새 구현 파일만 수정한 PR에서도 해당 검사를 실행해야 한다. 파일 이동, 호출부, 시험 탐색, 변경 경로 필터를 한 PR에서 전환한다.

- 작성 모드 `PHASE_PLAN`, 위험도 `STANDARD`. 기준은 [PR #377](https://github.com/Sangeok/stagekeeper/pull/377)의 `dev` 병합 커밋 `3b8ddeb072459da8ddb573fba1fafa0f056b1580`이다.
- 요구사항·Task·VFY의 정의는 [상위 SDD](./ci-verification-code-organization.md#phase-cvo2-배치ci-연결을-함께-전환)가 소유한다. 이 계획은 CVO2의 세 Task에 대한 구현·검증 상세다. CVO1의 생성물과 실행 증거는 [CVO1 결과](./ci-verification-code-organization-phase-cvo1.md#implementation-results--2026-11-18)에 있다.
- 설계 시 확인한 CVO1 상태와 CVO2 착수 조건은 마지막 절에 기록한다. CVO2 구현 승인 상태는 이 문서의 front matter를 따른다.

## 현재 코드에서 확인한 출발점

| 확인한 사실 | CVO2에서의 처리 |
| --- | --- |
| `support/`의 공통 준비 5개와 `client-init/`의 options·Claude 연결은 이미 병합됐다. 4개 현재 리허설과 이전 checkout용 seed의 역할이 구분돼 있다. | 이 기반을 재사용한다. 기존 init CLI의 13개 값·2개 타입, Codex preflight 이후 동적 로딩, 이전 판 seed의 옛 import와 `cwd: options.previous`를 유지한다. |
| `pipeline-smoke-steps.mjs`를 정적 import하는 곳 외에 `rehearse-pipeline-smoke.ts`가 파일 URL을 별도 child에 전달한다. `codex-init-eval.mjs`는 preflight 시점에 AppServer를 동적 import한다. | 정적 import가 통과해도 두 경로는 별도로 실행 또는 해석 검증한다. |
| `startSmokeServer`는 init·pipeline·Codex·shared-distribution이 사용한다. shared-distribution은 한 실행에서 이전 Next 서버와 후보 Next 서버를 차례로 띄운다. | 공통 서버는 후보 checkout 기준 경로를 제공하고, 이전 서버 호출은 기존 launch 주입으로 이전 Next 실행 파일·cwd를 선택한다. |
| `record` job은 checkout·Node 준비 후 로컬 Action을 실행한다. Action은 기록 파일 생성 후에만 게시 단계로 간다. | 기록 생성 모듈의 전이 의존성은 저장소 MJS와 Node 내장 모듈로 제한한다. 실제 이슈 게시 권한과 단계 순서는 Action이 소유한다. |
| `test:scripts`와 `test:architecture`는 `scripts/**`를 탐색하고, `npm test`는 `plugin/bin/*.test.mjs`와 `plugin/runtime/**/*.test.mjs`를 포함한다. | Action 시험은 두 npm 명령에 명시한다. runtime으로 이동한 시험은 기존 glob이 발견한다. Windows native 전용 step의 직접 호출도 수정한다. |

근거는 [pipeline 리허설](../../../scripts/rehearsals/rehearse-pipeline-smoke.ts), [shared-distribution 리허설](../../../scripts/rehearsals/rehearse-shared-distribution.mjs), [기록 Action](../../../.github/actions/gate-record/action.yml), [npm 명령](../../../package.json), [CVO1 경계 시험](../../../scripts/checks/rehearsal-boundaries.test.mjs)이다.

## 1. 시나리오와 준비 코드 이동

상위 작업 [TASK-CVO2-01](./ci-verification-code-organization.md#task-cvo2-01-시나리오지원-모듈과-시험-배치). 다음 표의 경로는 `scripts/rehearsals/` 기준이다. 여섯 MJS 모두 구현과 같은 이름의 `.test.mjs`를 목적지로 함께 옮긴다. 구 테스트 경로는 삭제한다.

| 기존 파일 | 새 구현 위치 | 함께 바꿀 호출·위치 계산 |
| --- | --- | --- |
| `client-init-smoke-steps.mjs` | `client-init/client-init-smoke-steps.mjs` | init·pipeline CLI, `client-init/claude-connection.ts`, pipeline steps·시험, record 필터. `assertGeneratedAgents`는 호출자가 준 pluginRoot에서 현행 limits/이전 entitlement를 선택한다. 옮긴 시험은 checkout의 실제 plugin을 찾도록 수정한다. |
| `pipeline-smoke-steps.mjs` | `pipeline/pipeline-smoke-steps.mjs` | pipeline·Codex CLI, `open-pipeline-transcripts.mjs`, record 필터. pipeline CLI가 자식에게 넘기는 `new URL(..., import.meta.url).href`도 새 구현으로 지정한다. 옮긴 시험이 읽는 AGENTS·workflow·Git fixture 기준 root를 수정한다. |
| `codex-init-eval.mjs` | `agent-eval/codex-init-eval.mjs` | macOS Codex 리허설의 평가 호출을 전환한다. 새 위치에서 AppServer는 `../../../plugin/runtime/codex-thread.mjs`다. 패키지에서 가져오는 실행 파일과 preflight의 기존 로딩 시점을 유지한다. |
| `agent-eval-summary.mjs` | `agent-eval/agent-eval-summary.mjs` | `agent-eval.yml`의 대조군·평가 결과 CLI 호출 두 곳과 record 필터를 변경한다. 시험이 참조하는 `plugin/evals/*/case.yaml`과 workflow 경로도 checkout root 기준으로 수정한다. |
| `gate-environment.mjs` | `support/gate-environment.mjs` | init·pipeline CLI와 각 요약 모듈의 import를 전환한다. 옮긴 시험에서 실제 플러그인 manifest 경로를 확인한다. |
| `smoke-server.mjs` | `support/smoke-server.mjs` | 현재 리허설 4곳을 전환한다. 기존 `support/repository-root.mjs`에서 얻은 경로로 server cwd와 `node_modules/next/dist/bin/next`를 조립한다. |
| `smoke-server-listener.cjs` | `support/smoke-server-listener.cjs` | 서버가 `--require`로 넘기는 파일과 smoke-server 시험의 listener를 새 위치에 둔다. listener 검증은 위 smoke-server 시험이 계속 소유한다. |

**호환 진입점.** 구 MJS에는 기준 커밋에서 확인한 각 모듈의 named export를 명시적으로 재수출한다. 내부 소비자는 새 구현을 직접 참조한다. `agent-eval-summary`의 구·신 CLI는 각각 자기 파일을 직접 실행했을 때만 같은 `main`을 한 번 호출한다. 기존 `USAGE`, stdout/stderr, 종료 코드, summary 파일 형식을 보존한다. 구 CJS preload는 새 CJS를 같은 프로세스에서 `require`한다. 기존 wrapper와 새 preload를 같은 자식에 차례로 지정해도 실제 listener 모듈은 CJS 캐시에서 한 번만 로드되어야 한다. 직접 자식에서 listening 메시지 한 건과 원래 `listen` 복원, 후손에서 `listen` 불변, 잘못된 parent PID에서 패치 전 거부를 확인한다.

**서버 완료 조건.** 기존 parent PID·run UUID·port·IPC 활성화 조건과 자식에서 한 번만 전달하는 listening 메시지를 유지한다. start/abort/stop, 소유 listener만 종료, 종료 확인 실패 시 오류 전달과 caller의 fixture 보존까지 기존 시험을 통과해야 한다. launch에 전달된 argv를 fixture로 확인해 새 preload와 실제 Next CLI가 존재하는지, 이전 서버의 주입이 이전 Next와 이전 cwd를 선택하는지 확인한다. fixture가 Next argv를 대체한 성공만으로 실제 Next 경로를 확인했다고 기록하면 안 된다.

**재사용 방향.** pipeline의 결과 필터는 client-init의 `smokeResult`와 support의 `environmentFields`를 직접 사용한다. record는 세 시나리오 필터를 사용한다. `client-ci-contract.mjs`와 그 시험, `rehearse-*.ts/mjs` 진입점 및 그 caller 시험은 현재 위치에 둔다. 기존 sealed transcript의 키·경로 검증·복호화·새 디렉터리에만 쓰는 계약과 실제 모델 선택은 이번 변경에서 유지한다.

**작업 중 확인할 입력.** pipeline child는 임시 저장소의 실제 산출물과 새 steps 모듈의 URL로 `slug`·`truncate` 독립 사례를 판정한다. 두 시나리오 각각에서 정상 fixture는 모든 결과가 true여야 하고 오답 fixture는 false를 포함해야 한다. child는 오답 배열을 출력하고도 정상 종료할 수 있으므로 root 리허설이 배열 길이와 각 값을 검사해 `implementation-check` 단계를 실패시키는지 확인한다. 호환 wrapper도 정상 결과를 낼 수 있다. 따라서 `CASES`에 실제 전달되는 URL이 새 구현을 가리키는지도 독립적으로 확인한다.

`preflightInitEval`은 AppServer를 지연 로딩하고 launcher·파일 접근 경계를 검사한 뒤 `modelsStarted: false`를 반환한다. CVO2에서는 새 위치에서 **그 함수에 쓰인 실제 import**가 `AppServer` export를 가진 파일로 해석되는지 확인한다. 실제 macOS 프로세스로 수행하는 preflight와 그 이후의 모델 평가는 CVO3에서 각각 실행 근거를 남긴다.

## 2. 런타임 시험과 GitHub 기록 코드 전환

상위 작업 [TASK-CVO2-02](./ci-verification-code-organization.md#task-cvo2-02-런타임-시험기록-action의-소유권-교정). 1번에서 새 MJS 경로가 준비된 후 연결한다.

| 기존 경로 | 새 경로 | 변경 및 인수 조건 |
| --- | --- | --- |
| `plugin/bin/harness-role-commands.test.mjs` | `plugin/runtime/role-command-execution.test.mjs` | local-session, role-files, role-commands를 새 위치 기준으로 import. 이미 존재하는 `role-commands.test.mjs`와 두 시험의 독립적인 사례를 유지한다. |
| `plugin/bin/harness-role-files.test.mjs` | `plugin/runtime/role-files.test.mjs` | 파일 접근·역할 도구·QA 설정 imports를 같은 runtime 기준으로 정리한다. 허용·거부·원본 보존 assertions를 유지한다. |
| `plugin/bin/harness-role-git.test.mjs` | `plugin/runtime/role-git.test.mjs` | 실제 Git reader·역할 파일 구현을 직접 참조한다. 기존 platform 조건·fixture 정리를 유지한다. |
| `scripts/rehearsals/gate-record.mjs` | `.github/actions/gate-record/record.mjs` | 기록 행·finding·허용 필드·파일 배타 생성은 새 모듈이 소유한다. 구 CLI는 기존 export 및 직접 실행 guard를 가진 호환 adapter로 남긴다. 새 구현에는 GitHub 게시 호출을 넣지 않는다. |
| `scripts/rehearsals/gate-record.test.mjs` | `.github/actions/gate-record/record.test.mjs` | import와 경쟁 subprocess는 옆의 `record.mjs`, composite shell 시험은 옆의 `action.yml`을 읽는다. 구 시험 위치는 삭제한다. |

- Action의 **Build the row** 단계는 checkout root에서 `node .github/actions/gate-record/record.mjs`를 호출한다. 새 record → `../../../scripts/rehearsals/{client-init,pipeline,agent-eval}/...` 방향을 사용한다. 구 record adapter 외에 일반 리허설이 Action 모듈을 import하는 간선은 허용하지 않는다.
- 기존 shell 실패 시험에 **성공 대조**를 짝지어 둔다. 새 임시 부모 `GATE_WORK_DIR`에 `open-issues.ndjson`과 빈 `GITHUB_OUTPUT`을 준비하고 **`result/`가 없는 상태**에서 Action의 실제 Build the row 셸을 실행한다. 종료 0, `result/comment.md` 생성, `GITHUB_OUTPUT`에 `directory=<부모>/result` 한 줄 추가를 확인한다. 거부 시험은 별도 부모에 빈 `result/`를 먼저 만든다. 같은 입력에서 종료 1, 기존 디렉터리 내용 보존, `GITHUB_OUTPUT` 무변경, 후속 게시용 `gh` 호출 0건이어야 한다. 셸의 cwd는 checkout root로 고정하고 게시 명령은 시험 전용 대역으로 관찰한다. 잘못된 CLI 경로로 Node 자체가 실패해도 음성 시험만 통과하는 경우를 잡는다.
- 세 runtime 시험은 **코드와 기존 이름의 대응표**로 추적한다. 새 위치의 `.test.mjs` 외에 `plugin/` 아래에 시험용 helper를 추가하면 출하 판정이 달라질 수 있다. 비교 기준은 [출하 predicate](../../../scripts/lib/plugin-payload.mjs)다.

## 3. 테스트 탐색·변경 경로·문서를 같은 PR에서 연결

상위 작업 [TASK-CVO2-03](./ci-verification-code-organization.md#task-cvo2-03-실행-선택문서회귀-증거-연결). 구현 순서는 1 → 2 → 3이며 리뷰 가능한 최종 변경에는 세 작업이 함께 들어간다.

| 실행 지점 | 구체적인 변경 |
| --- | --- |
| `package.json` | `test:scripts`, `test:architecture` 각각의 기존 시험 인자에 `".github/actions/gate-record/record.test.mjs"`를 1회 추가한다. 기존 `scripts/**` glob은 유지한다. `npm test`의 bin/runtime glob은 이미 새 runtime 시험을 포함한다. |
| Windows/macOS runtime PR·dev push | 두 workflow에서 `node --test scripts/rehearsals/support/smoke-server.test.mjs` 실행. Windows의 native 필수 step은 runtime 시험 세 개의 새 전체 경로를 사용한다. 기존 `STAGEKEEPER_TEST_WINDOWS_RUNTIME`, 전체 제품 시험의 직렬 옵션, released-reader 및 macOS runtime required 설정을 보존한다. |
| `client-init-smoke` PR | 기존 `support/**`, `client-init/**`, `.github/actions/gate-record/**`가 덮는 새 경로는 재등록할 필요가 없다. 옛 codex-init-eval 경로의 후속 구현·짝 시험은 새 `agent-eval/codex-init-eval*`로도 선택한다. 유지한 옛 CLI·adapter의 기존 필터도 유지한다. |
| `shared-distribution-acceptance` | 서버와 listener는 새 `support/**` PR 필터에 이미 포함된다. previous-seed의 기존 checkout import/cwd 및 CVO1의 PR 대 push 선택 차이를 보존한다. |
| `agent-eval`, `pipeline-smoke`, 기록 job | 기존 수동·정기 이벤트와 권한·matrix·output/legs·record 조건을 유지한다. eval CLI 경로만 교체한다. pipeline은 기존 root CLI를 호출하며 그 내부 child URL이 달라진다. |
| 승격 선택 | AGENTS의 실제 Git pathspec에 새 `scripts/rehearsals/pipeline`·`scripts/rehearsals/agent-eval`을 포함한다. client-init/support·gate-record Action·plugin/runtime와 기존 호환 경로의 선택을 확인한다. 문서 단독 변경은 음성 대조군이다. |
| 문서·정적 검사 | `docs/architecture/verification.md`의 smoke-server 확인 문자열, 명령 목록·책임 설명을 고친다. `test-organization.md`에 Action 구현 옆 시험과 두 npm 명령을 명시한다. `server.md` 내부 참조 목록에서 `pipeline-smoke-steps.test.mjs`의 pipeline/templates 두 행은 새 시험 경로로 바꾼다. |

**단일 파일 변경으로 확인한 실행 범위.** 현재 PR 필터를 새 경로에 그대로 적용하면 `client-init-smoke-steps.mjs`가 선택하는 조건부 workflow는 설치 검사 1개에서 설치·Windows·macOS 검사 3개로 늘어난다. `gate-environment.mjs`는 같은 1개에서 shared-distribution까지 4개로 늘어난다. 반대로 `codex-init-eval.mjs`는 새 필터를 추가하기 전에는 설치 검사가 1개에서 0개로 줄어든다. 이 수치는 `check`를 제외한 **workflow 선택 수**이며 시간·모델 비용의 측정값과 구분한다. 설계상 기존 `support/**`·`client-init/**` 규칙의 적용은 유지하고, Codex eval 이동으로 사라지는 설치 검사 선택을 복원한다. runtime 시험 세 개의 단독 변경은 새 `plugin/runtime` 위치에서 승격용 pipeline pathspec에도 포함됨을 기록한다.

**실행 선택 검증.** 기존 `scripts/checks/rehearsal-boundaries.test.mjs`의 이벤트별 paths 해석과 pipeline 시험의 임시 Git 저장소를 재사용한다. 이동표의 파일을 하나씩 유일한 변경으로 만들고 **기준 파일이 선택하던 workflow가 새 위치도 선택하는지** 확인한다. 기준/후보의 PR·push·승격 결과를 경로 쌍별로 기록하고, 위에서 설명한 확대와 필요한 양성 경로를 확인한다. `pipeline-smoke-steps.test.mjs`의 재귀 열거기는 현재 `mjs|ts|mts`만 수집한다. `support/smoke-server-listener.cjs`와 구 CJS 경로도 fixture에 직접 넣거나 열거기에 `cjs`를 추가해 각각 단독 변경으로 검증한다. 예를 들어 runtime 시험은 `plugin/runtime/**` 및 `plugin/**`에, 새 서버 시험은 `support/**`에 걸린다. `check`는 PR 전체에서 실행한다. 모델 평가·pipeline은 기존 승격 절차의 수동 선택을 검증한다. 지표는 기준 커밋의 **workflow 8개·job 정의 14개·coverage 행 16개**이며, 행 안의 확인 문자열은 새 직접 실행 경로와 일치해야 한다.

**문서 링크 추적.** 기준 tree에서 옛 시험 파일을 링크한 곳은 상위 SDD, CVO1 계획, `docs/test-reports/completed/2026-10-05-windows-role-git.md`다. 구현 PR에서 현행 참조는 새 경로로, 과거 시험 증거는 해당 이력의 고정 커밋 링크로 연결한다. 기존 승인·시험 결과의 의미는 보존한다. `role-command-time-limit.md` 등의 코드 표기 경로도 검색해 현행 실행 명령과 당시 실행 기록을 구분한다. 착수 시 CVO1 문서가 completed로 옮겨졌으면 이 계획의 링크와 front matter도 실제 목적지에 맞춘다.

## 검증과 완료 기준

검증 명령은 **구현 후보**에서 실행하도록 계획했다. 먼저 Node 22·lockfile로 준비한 기준 checkout에서 Git SHA, export 키, 시험 파일·사례명·실행 조건, 출하 파일 (경로·blob·mode)을 저장한다. 기준 SHA와 후보 SHA를 따로 고정한다. 기준 checkout에서 얻은 기대값을 후보 shim으로 재생성하지 않는다. 각 suite 사이에 중복되는 시험은 합산하지 않는다.

| 검증 및 요구사항 | 실행 방법 | 완료 증거 |
| --- | --- | --- |
| VFY-CVO-01 · REQ-CVO-001 | CVO1 호환 시험을 확장한다. 7개 ESM(여섯 시나리오/지원 모듈과 record)의 구·신 경로를 fresh child에서 import하고 기준 checkout에서 저장한 export 이름 전체와 후보의 이름 집합을 비교한다. 같은 후보의 구·신 경로는 **한 child 안에서** import해 각 export의 동일성(`Object.is`)을 확인한다. 기준·후보 프로세스 간에는 값/출력과 이름을 비교한다. 구·신 summary/record CLI는 임시 입력으로 각각 직접 호출한다. | import는 무쓰기, CLI는 정확히 한 번 실행. summary는 control·부분/전체 eval·인자 오류의 기존 0/1/2, record는 성공/거부의 기존 0/1 및 출력 파일을 보존한다. 구·신 CJS preload도 실제 child IPC로 직접/후손/잘못된 env를 확인한다. |
| VFY-CVO-04 · REQ-CVO-003 | `npm run test:scripts`, `npm run test:architecture`, `npm test` 및 Windows native 직접 step. 기준과 후보의 TAP 사례를 이동표로 연결하고 기존 suite 내에서 누락·이중 등록을 검사한다. 경계 시험으로 구 adapter 역참조·순환도 검사한다. | 이동한 시험 10개(리허설 짝 시험 6개, record 1개, runtime 3개)가 지정 suite에 모두 등장한다. 기존 OS별 skip은 사유와 실행 환경을 기록한다. |
| VFY-CVO-05 · REQ-CVO-004 | PR·push별 양성/음성 경로 fixture, 실제 `git diff --name-only -- <promotion pathspec>`, `npm run verify:ci-coverage`를 실행한다. | 구 adapter와 새 구현·짝 시험·Action 변경이 의도한 검사를 선택한다. 직접 명령과 coverage 확인 문자열이 실제 파일을 가리킨다. |
| VFY-CVO-06 · REQ-CVO-005 | `node --test .github/actions/gate-record/record.test.mjs`와 두 summary 시험. `node_modules` 없는 임시 checkout/소스 사본에서도 Node만으로 구·신 record CLI에 같은 fixture를 전달한다. | 같은 입력을 기준 CLI와 후보의 구·신 CLI에 각각 독립된 새 출력 경로로 전달한다. 세 실행의 종료 코드·출력 파일 목록·내용을 비교하고 기존 schema 1·leg·finding·run attempt assertion을 유지한다. 성공/실패·요약 누락·partial eval·abandoned를 구분하고 원문·토큰은 출력에 없다. 동시 writer 한 곳만 성공, 기존/부분 출력 보존, 실패 후 게시 0건. |
| VFY-CVO-07 · REQ-CVO-006 | clean baseline/candidate에서 동일한 `isShippedPluginFile`로 Git tree를 필터링해 전체 경로·blob·mode를 대조한다. 기존 shared graph·plugin-lib·양 OS 패키징 검사와 production build를 수행한다. | CVO1 기준 출하 파일 87개의 집합과 바이트가 후보와 같다(착수 시 새 base라면 다시 산출). 새 경로의 시험이 패키지에 들어가지 않고 `plugin/lib` 동기화가 통과한다. |

**회귀 실행 순서.** 준비된 checkout에서 `npm run db:generate` 후 새 위치의 집중 시험을 실행한다. 이어서 `npm run verify:fsd`, `npm run verify:server`, `npm run verify:shared`, `npm run test:architecture`, `npm run check`, `npm test`, `npm run test:web`, `npm run test:server`, `npm run build`와 기존 fresh manifest 검사를 수행한다. `npm run check`에 포함된 `test:scripts` 결과를 같은 후보에서 재사용한다. PR의 Windows native와 macOS ARM/Intel 결과에서는 실제 step이 실행됐는지도 확인한다. 실제 모델 호출·private Codex 후보 인수는 상위 CVO3가 소유한다.

**변경 범위·대안.** 구현·preload 8개와 시험 10개가 위치를 바꾼다(기존 파일 18개, CLI·workflow·문서 호출부 수정 별도). 기존 모듈만 새 폴더로 재수출하는 작은 변경은 경로 호환을 제공하지만 실제 구현과 시험은 원래 위치에 남게 된다. 실제 구현을 이동하고 옛 구현 경로에만 얇은 wrapper 8개를 두는 기존 결정을 유지한다. 클래스·서비스·새 테스트 러너는 추가할 필요가 없다.

**중단과 복구.** 새 CLI가 도움말 이전에 경로 해석으로 실패하거나, 필수 native 시험이 사라지거나, record 출력·권한·출하 파일이 달라지면 CVO2 완료 판정을 보류한다. 저장한 기준 입력으로 재현하고 파일 이동, wrapper, workflow, npm 명령, 문서 변경을 같은 단위로 수정하거나 되돌린다. 중단·재시도는 기존 smoke 자식 종료 확인과 record의 새 출력 디렉터리 정책을 따른다. 실제 게시나 모델 재실행은 로컬 회귀에 필요하지 않다.

## 착수 상태와 문서 검증

- **선행 작업.** CVO1은 2026-11-18 `dev`에 병합됐다. 병합 커밋의 push 실행 결과는 [check](https://github.com/Sangeok/stagekeeper/actions/runs/44288581346), [Windows runtime](https://github.com/Sangeok/stagekeeper/actions/runs/44288579419), [macOS runtime](https://github.com/Sangeok/stagekeeper/actions/runs/44288579359), [shared distribution](https://github.com/Sangeok/stagekeeper/actions/runs/44288579601)에서 확인한다.
- **착수 조건.** CVO1 병합본의 검사 결과 및 활성 제안·최신 dev를 재대조하고 이 계획에 대한 구현 승인을 받는다. `dual-client-ci-parity`는 클라이언트 행동과 증거 규격을 소유한다. 해당 작업이 동시 변경됐다면 먼저 실제 호출부와 입출력을 다시 확정한다.
- **검증의 구분.** 이번 산출물은 상세 계획 한 파일이다. 구현 후의 5개 VFY는 모두 예정 상태다. 문서 검증에는 부모와 자식 두 파일을 명시적으로 입력해 표준 추적성 검사를 수행하고, CVO2 세 Task의 검증 대상을 위 표와 따로 대조한다. 상위에는 아직 CVO3가 포함되어 있으므로 전체 묶음에 strict 실행 가능 판정을 적용하지 않는다.

**기술 판정은 READY, 구현은 승인 대기다.** 재검토 시 CVO1 병합 커밋의 위 네 push workflow가 모두 성공했다. 해당 커밋에서 CVO2 구현을 막는 선행 CI 조건은 해소됐다. 열린 PR #379도 `docs/architecture/verification.md`를 수정하므로 구현 착수 시 변경된 행을 재대조한다. 이 문서의 검증 대상은 CVO2 계획이다.

**작성 검증.** 병합 tree의 이동 대상·직접 실행 경로·호환 export·시험 검색을 대조했다. 부모와 이 계획의 표준 추적성 검사는 오류·경고 0건이었고, 저장소 상대 링크 검사에서 이 파일을 포함해 문제 0건이었다. CVO2가 담당하는 5개 요구사항(001·003·004·005·006)이 각각 위 표에서 실제 판정 기준을 가진다.

**재검토 증거.** Node 22.23.3으로 기준 커밋의 record CLI를 같은 입력에 두 번 실행했다. 이미 만든 빈 출력 디렉터리에서는 `EEXIST`·종료 1, 준비한 부모 아래 새 경로에서는 `comment.md`·종료 0을 확인했다. 기존 record·eval-summary 시험 29개는 모두 통과했고, `verify:ci-coverage`는 14개 job·16개 행을 확인했다. 이 결과는 변경 전 기준 증거로 보관하고, 후보에 대한 다섯 VFY는 구현 후 판정한다.
