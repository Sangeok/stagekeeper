---
status: "active"
created-at: "2026-11-25"
completed-at: null
owners: []
related:
  - "docs/proposals/active/ci-structure-map-and-job-names.md"
  - "docs/investigations/active/ci-management-practices-investigation.md"
  - "docs/ADR/0004-organize-repository-scripts.md"
  - "docs/proposals/active/ci-verification-code-organization.md"
  - "https://github.com/n8n-io/n8n/blob/master/.github/WORKFLOWS.md"
  - "https://github.com/microsoft/vscode/tree/main/.github/rulesets"
  - "https://github.com/elastic/kibana/blob/main/.buildkite/README.md"
primary-area: "CI 구조의 발견 가능성: scripts 배치, 워크플로·잡 이름, CI 흐름 문서"
observed-environments:
  - "GitHub 언어 표시가 TypeScript인 공개 저장소 15곳의 기본 브랜치(2026-11-25), gh api로 scripts/·.github/·워크플로 파일 확인"
  - "이 저장소 origin/dev a291fec의 워크플로 10개, scripts/, 룰셋 3개, check 워크플로 실행 45530700803·45532552036·45349007598"
conclusion-summary: null
follow-up:
  - "docs/proposals/active/ci-structure-map-and-job-names.md"
---

# CI 구조를 알아보기 어려운 원인과 참고 저장소의 구성 방식

## Summary

`check (required)`의 구성을 정리하던 중, PR 게이트가 어디서 갈라지고 어디서 모이는지를
저장소 구조만 보고 알아보기 어렵다는 문제가 나왔다. 처음에는 scripts 폴더 구조를 원인으로
의심했다. star가 많은 TypeScript 저장소 15곳을 GitHub API로 확인한 결과, CI 단계로 scripts
폴더를 나누는 곳은 없었다. 이들은 scripts를 하는 일로 나누고, CI 구조는 워크플로 파일,
집계 잡 이름, 지도 문서로 드러낸다.

이 저장소의 scripts 배치(ADR-0004)는 참고 저장소와 같은 방식이다. 알아보기 어려운 원인은
세 가지로 좁혀졌다. "check"라는 이름이 다섯 곳에 겹치고, 워크플로 이름이 역할을 말하지
않으며, 흐름을 한곳에 보여 주는 지도가 없다. 개선안은
[제안서](../../proposals/active/ci-structure-map-and-job-names.md)로 옮겼다. 이 문서는 조사 기록이고, 코드·워크플로·룰셋은 바꾸지 않았다.

## Problem

- Symptom: 저장소 소유자가 `check (required)` 정리 페이지를 읽고 "잡 3개, 실행 8개, 총 11개를
  검사하나", "check (required)에서 3개로 분기하고 거기서 또 분기하나"라고 물었다. 실제로는
  워크플로 시작점에서 잡 3개가 실행 8개로 갈라지고, 끝에서 `check (required)` 하나로 모인다.
  이 방향과 개수를 `.github/workflows/`, `scripts/`, PR 체크 목록에서 바로 읽기 어려웠다.
- User impact: CI 구성을 처음 읽거나 바꾸는 사람과 에이전트의 이해 비용이다. 동작 결함은 없다.
  잡 추가 때 `needs` 누락과 집계 잡 이름 변경은 이미 시험과 규칙이 막는다.
- Frequency: CI 구성을 읽거나 바꿀 때마다.
- Severity: low.
- Reproduction: PR 체크 목록, `.github/workflows/`, `scripts/`만 보고 "PR 병합을 막는 것은
  무엇이고 어떤 실행으로 이루어지는가"를 설명해 본다.
- Environment notes: 이 저장소의 워크플로는 10개(1,960줄)다. 참고 저장소는 2~113개다.

## Scope

- In scope: scripts 배치 기준, 워크플로·잡·집계 잡의 이름, CI 흐름 문서의 위치와 유지 방식.
  참고 저장소 15곳의 같은 항목.
- Out of scope: 검사 내용과 실행 시간, `main`의 필수 체크, 워크플로 린트와 액션 SHA 고정
  ([CI 운영 방식 조사](./ci-management-practices-investigation.md)의 남은 항목), 리허설 코드 배치
  ([CI 검증 코드 배치 제안](../../proposals/active/ci-verification-code-organization.md)).

## Evidence

### Known Facts

#### 1. check (required)의 구조

- [check.yml](../../../.github/workflows/check.yml)의 잡은 4개다. `task-worktrees`(matrix:
  windows-2022, macos-15), `check`(matrix: static, test, test-web, server, build),
  `server-integration`, `required`. 앞의 셋이 실행 8개로 펼쳐진다.
- `required`(표시 이름 `check (required)`)는 `needs: [task-worktrees, check, server-integration]`,
  `if: ${{ always() && github.event_name == 'pull_request' }}`로 돈다. `toJSON(needs)`에서
  `success`가 아닌 결과가 하나라도 있으면 실패한다. 판정 스크립트는 YAML 안에 있고
  `scripts/`에는 없다.
- 룰셋 `Require check on dev`(id 27968217)는 `check (required)` 하나를 필수 상태 체크로
  요구한다. 최신화 요구(strict)는 꺼져 있고 예외 대상은 없다. PR #441이 2026-11-24T23:29:27Z에
  병합되고 30초 뒤(2026-11-25 08:29:57 KST) 룰셋이 잡 8개의 이름 대신 이 하나를 요구하도록
  바뀌었다.
- 배선은 [verify-ci-coverage.test.mjs](../../../scripts/checks/verify-ci-coverage.test.mjs)
  319행의 시험이 지킨다. needs가 나머지 잡 전부와 같은지, 이름과 `if` 줄이 그대로인지,
  `continue-on-error`가 없는지 확인한다.
- 실행 45530700803(PR #444): 우분투 잡 1분 17초~3분 12초, macOS worktree 3분 27초, Windows
  worktree 14분 9초, 집계 잡 4초. push 실행 45532552036에서 집계 잡은 `skipped`였고, 새 커밋으로
  취소된 PR 실행 45349007598에는 집계 잡이 생기지 않았다.
- `check (required)`를 이해하려면 네 곳을 봐야 한다. `check.yml`(정의와 판정),
  `scripts/checks/verify-ci-coverage.*`(배선 시험), `scripts/pr/github-merge.mjs`(병합 전 확인),
  `docs/architecture/verification.md`(CI 범위 표).

#### 2. 참고 저장소 15곳의 구성

GitHub 언어 표시가 TypeScript인 저장소만 골랐다. vercel/next.js와 mui/material-ui는 JavaScript,
microsoft/TypeScript는 Go로 표시돼 제외했다. 위의 10곳은 워크플로 파일까지 열었고, 아래 5곳은
폴더 목록만 확인했다. stars는 2026-11-25 조회 값이다.

| 저장소 | stars | scripts 정리 기준 | CI 구조가 드러나는 곳 |
| --- | ---: | --- | --- |
| n8n-io/n8n | 212,055 | `scripts/` 평면과 일부 폴더(개발 도구). CI 전용은 `.github/scripts/`에 짝 시험과 함께 둔다 | `.github/WORKFLOWS.md`(1,427줄). 워크플로 113개의 파일 이름과 `name:`에 범주 접두사(`ci-`·`test-`·`release-`·`build-`·`sec-`·`util-`, `CI: Pull Requests (Build, Test, Lint)`, `Test: Unit`). 집계 잡 `Required Checks` |
| microsoft/vscode | 195,725 | `scripts/`는 실행 진입점(`test.sh`·`test.bat` 같은 OS별 쌍), `build/`는 빌드 시스템과 `azure-pipelines/` | `pr.yml`(`name: Code OSS`)이 OS별 재사용 워크플로 `pr-darwin-test.yml`·`pr-linux-test.yml`·`pr-win32-test.yml`을 부르고, 집계 잡 `PR Gate`가 `toJSON(needs)`로 판정한다. 룰셋을 `.github/rulesets/*.json`으로 두고 `rulesets.yml`이 실제 룰셋과 매일 대조한다 |
| angular/angular | 101,542 | 목적별 하위 폴더 `scripts/{build,ci,test,benchmarks}`. `scripts/ci/`에는 CI용 셸 2개 | 검사 의존 관계는 Bazel이 가진다. `ci.yml`·`pr.yml` 잡은 `lint`·`test`·`integration-tests`·`adev`처럼 결과물 단위 |
| microsoft/playwright | 101,010 | `scripts/` 대신 `utils/` 평면. `check_deps.js`·`generate_*.js`·`roll_browser.js`처럼 동사로 시작 | 워크플로를 `tests_primary`·`tests_secondary`·`tests_docker`처럼 시험 대상별로 나눈다 |
| storybookjs/storybook | 91,714 | 목적별 폴더. `scripts/tasks/`는 CI 단계 하나에 파일 하나(`build.ts`·`compile.ts`·`e2e-tests-dev.ts`·`smoke-test.ts` 등) | `scripts/ci/main.ts`가 CircleCI 설정을 TS로 생성한다. 병합 게이트 워크플로를 코드에서 지정(`isMergeGating`)하고 `circleci-completion` 상태 체크로 모은다 |
| vitejs/vite | 84,082 | 릴리스 스크립트 7개 | `ci.yml`(`name: CI`) 하나. 잡 이름 `Build&Test: node-<버전>, <OS>`, 집계 잡 `Build & Test Passed or Skipped`·`Build & Test Failed` |
| withastro/astro | 64,186 | 목적별 `scripts/{cmd,deps,smoke,testing}`. GitHub 자동화는 `.github/scripts/` | 잡 이름에 시험 종류·OS·Node 버전(`Test (E2E): <OS> (node@<버전>)`) |
| twentyhq/twenty | 61,446 | 루트 `scripts/` 없음. nx 프로젝트 target으로 대신한다 | 워크플로 61개를 `ci-*`·`cd-*`로 나눈다(`name: CI Front`). 워크플로마다 집계 잡(`ci-front-status-check`) |
| prisma/prisma | 47,750 | `scripts/` 평면 약 90개. `check-`·`lint-`·`validate-`·`regen-` 접두사와 짝 시험. 워크플로 검사(`lint-workflow-triggers.mjs`)도 같은 평면 | `ci.yml`(`name: CI (PR)`)의 집계 잡 `Test`(`if: ${{ !cancelled() }}`) |
| elastic/kibana | 21,395 | 개발자용 `scripts/`(README에 규칙: `--help` 지원, `src`·`packages` 호출, OS 확인)와 CI 전용 `.buildkite/`를 최상위에서 분리 | `.buildkite/README.md`가 폴더 역할을 정의한다. `pipelines/`(정의), `scripts/steps/`(스텝 하나에 스크립트 하나), `scripts/lifecycle/`, `pipeline-utils/`. PR 파이프라인 스크립트는 `.buildkite/scripts/pipelines/pull_request/`에 있다 |
| supabase/supabase | 115,411 | `scripts/` 평면 12개 | 워크플로 60개에 영역 접두사(`docs-`·`kb-` 등) |
| nestjs/nest | 77,152 | `scripts/` 평면 6개 | 워크플로 2개와 `.circleci/` |
| vuejs/core | 55,102 | `scripts/` 평면 12개 | 워크플로 8개 |
| TanStack/query | 50,627 | `scripts/` 9개 항목 | 워크플로 4개 |
| nrwl/nx | 29,494 | `scripts/` 평면 약 50개 항목과 일부 폴더 | 워크플로 14개 |

#### 3. 참고 저장소에서 보이는 패턴

1. scripts는 하는 일 기준으로 나눈다. 위 10곳 중 CI 단계로 나눈 곳은 없다. 평면에 동사
   접두사(prisma, playwright, kibana, n8n), 목적별 하위 폴더(angular, astro, storybook), 파일이
   적으면 평면(vite, vue, nest, TanStack, supabase)이다.
2. 두 번째 축은 누가 부르는가다. 사람이 쓰는 스크립트와 CI만 부르는 스크립트를 나눈다(n8n·astro의
   `.github/scripts/`, angular의 `scripts/ci/`, kibana의 `.buildkite/`).
3. CI 구조는 워크플로 쪽에서 드러낸다. 파일·`name:` 접두사(n8n, twenty, supabase), OS별 재사용
   워크플로(vscode `pr-*`), 시험 대상별 분할(playwright), 역할을 말하는 집계 잡 이름이다. 집계 잡은
   6곳에서 확인했다(vscode `PR Gate`, n8n `Required Checks`, vite, twenty, prisma `Test`,
   storybook `circleci-completion`).
4. 지도 문서는 워크플로 옆에 둔다(n8n `.github/WORKFLOWS.md`, kibana `.buildkite/README.md`,
   vscode `.github/rulesets/README.md`).
5. 폴더가 곧 CI 구조인 곳은 CI 정의를 코드로 생성하는 storybook과 kibana뿐이다. 둘 다
   파이프라인이 수십 개 규모다.

#### 4. 원인별로 참고 저장소가 쓰는 방법

- 잡 이름은 내용을 말하고 워크플로 이름을 반복하지 않는다. n8n `Unit tests`·`Typecheck`·`Lint`·
  `DB Tests`, vite `Build&Test: …`, astro `Test (E2E): …`, prisma `Package Tests (<i>/4)`.
- 집계 잡 이름은 역할을 말한다. 룰셋은 집계 잡 이름 하나만 붙잡으므로 다른 잡 이름은 바꿔도
  룰셋에 영향이 없다. n8n의 `.github/scripts/workflow-validation.test.mjs`는 자동 릴리스 PR에서도
  집계 체크가 남는지 시험한다.
- 필수 체크 이름과 룰셋의 결합은 vscode가 다룬다. 룰셋을 JSON으로 저장소에 두고 관리자가
  적용하며, `rulesets.yml`이 실제 룰셋과 파일을 매일 대조한다. GitHub은 그 파일을 읽지 않는다.
- 워크플로의 역할은 n8n(113개)·twenty(61개)·supabase(60개)가 접두사로, kibana가 트리거 이름
  (`on_merge.yml`, `pull_request/`, `merge_queue.yml`)으로 나눈다. 모두 워크플로가 수십 개
  이상이고, 한 워크플로가 한 역할을 맡는다.
- 지도 문서는 두 형태다. n8n은 손으로 쓴 1,427줄 문서에 폴더 트리, 아키텍처 그림, 접두사 표,
  "What Runs When You Open a PR" 흐름도, 호출 그래프를 담는다. `workflow-validation.test.mjs`의
  시험 이름에서는 이 문서를 워크플로와 대조하는 시험을 찾지 못했다. kibana
  `.buildkite/README.md`는 잘 바뀌지 않는 폴더 역할만 몇 줄로 정의한다.

#### 5. 이 저장소의 현재 상태

- scripts는 [ADR-0004](../../ADR/0004-organize-repository-scripts.md)의 책임별 배치다. `checks/` 19,
  `lib/` 10, `macos/` 17, `pr/` 34, `project-ownership/` 4, `rehearsals/` 66, `templates/` 10,
  `windows/` 11, 루트 파일 9개다(시험 포함 파일 수). ADR-0004는 "실행 종류별 분리"를 검토하고
  "한 책임의 운영 도구·리허설·보조 모듈을 다시 분산한다"는 이유로 기각했다.
- "check"라는 이름이 워크플로 `check`, matrix 잡 id `check`, `npm run check`, `scripts/checks/`,
  집계 잡 `check (required)` 다섯 곳에 쓰인다. 잡 표시 이름이 모두 `check (…)`이라 PR 체크
  목록에 `check / check (static)`처럼 두 번 나온다. CI 범위 표에는 `check/check` 키가 8행에 있다.
- 워크플로 10개의 트리거는 각 파일의 `on:`에서 읽었다. "매번"은 경로 조건이 없다는 뜻이다.

  | 워크플로 | PR | push | 수동 | 정기 | 다른 워크플로 |
  | --- | --- | --- | --- | --- | --- |
  | `check` | 매번 | 매번 |  |  |  |
  | `windows-role-runtime` | 경로 조건 | 매번 |  |  | 호출 |
  | `macos-runtime-contracts` | 경로 조건 | 매번 | ✓ |  | 호출 |
  | `client-init-smoke` | 경로 조건 |  | ✓ |  |  |
  | `shared-distribution-acceptance` | 경로 조건 | 경로 조건 | ✓ |  |  |
  | `agent-eval` |  |  | ✓ | ✓ |  |
  | `pipeline-smoke` |  |  | ✓ | ✓ |  |
  | `post-merge-failure-record` |  |  | ✓ | ✓ | 완료 후 |
  | `post-merge-auto-fix` |  |  | ✓ |  |  |
  | `template-release` |  |  | ✓ |  |  |

  8개가 트리거를 둘 이상 가진다. `client-init-smoke`와 `shared-distribution-acceptance`는
  PR 경로 조건 검사이면서 AGENTS.md의 승격 게이트이고, `macos-runtime-contracts`는 PR·push·수동·
  호출을 모두 받는다. 접두사 하나로는 분류되지 않는다.
- CI 문서는 [verification.md](../../architecture/verification.md)(1,232줄)에 있다. "CI 검사의 OS
  범위" 절의 표는 워크플로와 기계 대조되지만 OS 분류가 목적이다. 같은 문서 앞부분에 `check`의
  병렬 실행과 취소 규칙 설명이 있다. 트리거 → 잡 → 집계 → 룰셋, 병합 후 기록, 승격 전 게이트를
  한 흐름으로 보여 주는 절은 없다.

#### 6. 이름을 바꿀 때 영향받는 곳

참조 수는 `.github`, 완료 문서, 시험 보고서를 제외하고 rg로 센 값이다.

- `check.yml` 파일 이름을 적은 파일은 17곳이다. 작업 마무리 `scripts/pr/github-merge.mjs`(이
  경로로 PR 실행을 조회)와 `scripts/checks/find-green-dev-commit.mjs`가 포함된다.
- 게이트·OS 워크플로 파일 이름은 `client-init-smoke.yml`·`agent-eval.yml`·`windows-role-runtime.yml`
  각 7곳, `macos-runtime-contracts.yml` 8곳, `pipeline-smoke.yml`·`shared-distribution-acceptance.yml`
  각 5곳이다. AGENTS.md 승격 절차는 `gh run list --workflow <gate>.yml`로 이미 돈 실행을 찾는다.
  GitHub은 실행 이력을 워크플로 파일에 묶으므로, 파일 이름을 바꾸면 이전 실행이 새 이름으로
  조회되지 않는다.
- 워크플로 `name:`은 `post-merge-failure-record.yml`이 `workflow_run.workflows: [check,
  windows-role-runtime, macos-runtime-contracts]`로 구독할 때 쓴다. `[post-merge]` 이슈 제목
  (`.github/actions/post-merge-failure-record/record.mjs` 43행, `<워크플로>/<잡 표시 이름>: <step>`)과
  `[gate]` 이슈 제목도 이름을 쓴다.
- 잡 표시 이름은 룰셋이 `check (required)` 하나만 요구한다. 그 밖에는 `[post-merge]` 이슈 제목과,
  그 이슈를 읽는 `.github/actions/post-merge-auto-fix/fix.mjs` 417행(`job.name === args.job`)이 쓴다.
  2026-11-25 기준 열린 `[post-merge]` 이슈는 0건이다.
- matrix 잡 id `check`는 `required`의 needs, CI 범위 표 키 `check/check`(verification.md 8행),
  `verify-ci-coverage.test.mjs`의 시험 입력 문자열, 활성 문서 두 곳의 서술에 나온다.
- `scripts/checks/verify-ci-coverage.mjs`는 `.github/workflows/`에서 `.yml` 파일만 읽는다(204행).
  같은 폴더의 다른 파일은 검사 대상이 아니다.

#### 7. 진행 중인 겹치는 작업 (2026-11-25)

- PR #445(`harness/auto-fix-trust`)가 `verification.md`, `post-merge-auto-fix.yml`,
  `.github/actions/post-merge-auto-fix/fix.mjs`를 고친다.
- `harness/auto-fix-trust-ruler`(PR 없음)가 새 워크플로 `auto-fix-ruler.yml`을 더한다.

### Unknowns

- 비공개 Codex CI 소비자가 `check` 워크플로의 잡 표시 이름을 참조하는지. CI 검증 코드 배치
  제안도 비공개 소비자 전체를 재조회하지 않았다고 기록했다.
- n8n의 수기 지도가 실제로 얼마나 자주 워크플로와 어긋나는지. 커밋 이력은 분석하지 않았다.
- 개선 뒤 이해 비용이 실제로 줄었는지. 정량 지표가 없어 소유자와 에이전트의 질문으로만
  확인할 수 있다.

## Hypotheses

| ID | 가설 | 근거 | 확인 방법 | 현재 판단 |
| --- | --- | --- | --- | --- |
| H1 | scripts 폴더 배치가 알아보기 어려운 주원인이다 | 소유자의 첫 의심 | PR 게이트 구성이 정의된 위치 확인, 참고 저장소의 scripts 배치 비교 | ruled-out |
| H2 | "check"가 워크플로·matrix 잡 id·npm 스크립트·폴더·집계 잡에 겹쳐 구조를 잘못 읽게 한다 | 체크 목록의 `check / check (static)`, 소유자의 "총 11개" 질문 | 이름 목록 대조, 참고 저장소의 잡·집계 잡 이름 비교 | likely |
| H3 | 워크플로 이름이 역할을 말하지 않고, 한 워크플로가 여러 역할을 겸해 접두사로는 분류할 수 없다 | 워크플로 10개의 `on:`과 AGENTS.md의 게이트 목록 | 트리거 표 작성 | confirmed |
| H4 | 트리거부터 룰셋까지 흐름을 한곳에 보여 주는 지도가 없다 | verification.md의 절 구성 | 절 목록과 CI 관련 서술 확인 | likely |
| H5 | 참고 저장소의 워크플로 이름 접두사 방식은 이 저장소에서 비용 대비 효과가 낮다 | 규모 차이, 다중 역할, 이름 참조 | 참조 수 집계, 실행 이력·구독·이슈 제목 결합 확인 | likely |
| H6 | 손으로 쓴 긴 지도는 낡기 쉬워, 이 저장소에는 기계 대조가 있는 표가 맞다 | n8n 문서에 대조 시험이 보이지 않음, 이 저장소의 `verify:ci-coverage` 선례 | n8n 문서의 커밋 이력 분석 | unverified |

## Verification

| 확인 항목 | 관련 가설 | 방법 또는 데이터 | 판단 기준 | 결과 | 해석 |
| --- | --- | --- | --- | --- | --- |
| PR 게이트 구성의 정의 위치 | H1 | `check.yml`, `verify-ci-coverage.test.mjs`, `github-merge.mjs` 읽기 | 갈라짐과 모임이 scripts에 정의돼 있으면 H1 지지 | matrix, needs, 판정이 모두 `check.yml`에 있다 | scripts 배치를 바꿔도 이 구조는 드러나지 않는다. H1 배제 |
| 참고 저장소의 scripts 기준 | H1 | gh api로 15곳의 `scripts/`·`.github/` 목록 | CI 단계별 폴더가 흔하면 H1 지지 | 10곳 중 0곳. 폴더가 곧 CI 구조인 곳은 코드 생성 2곳 | H1 배제 |
| 이름 겹침 | H2 | `check.yml`, `package.json`, 폴더, 실행 45530700803의 체크 목록 | 같은 이름이 다른 단위를 가리키면 지지 | 다섯 곳. 체크 목록에 `check / check (…)` | 지지 |
| 참고 저장소의 잡·집계 잡 이름 | H2 | n8n·vscode·vite·astro·prisma·twenty 워크플로 원본 | 잡 이름에 워크플로 이름을 반복하지 않으면 지지 | 반복하는 곳 없음. 집계 잡 6곳이 역할 이름 | 지지 |
| 워크플로 트리거 | H3 | 10개 파일의 `on:` | 한 워크플로가 여러 트리거·역할을 가지면 지지 | 8개가 트리거 둘 이상, 게이트 2개가 PR 검사 겸용 | H3 확인 |
| 지도 유무 | H4 | `verification.md` 절 목록 | 흐름을 다루는 절이 없으면 지지 | OS 범위 표와 부분 서술만 있다 | 지지 |
| 이름 변경 영향 | H5 | rg 참조 수, `workflow_run` 구독, 이슈 제목 형식, AGENTS.md 승격 절차 | 참조와 결합이 많으면 지지 | Known Facts 6 | 지지 |
| 수기 지도의 낡음 | H6 | n8n `.github/WORKFLOWS.md` 커밋 이력 | 워크플로 변경 뒤 문서 갱신이 빠진 빈도 | Not verified yet | 판단 보류 |

## Conclusion

- Current conclusion: 원인은 scripts 폴더가 아니라 이름(H2, H3)과 지도의 부재(H4)다. 참고
  저장소의 방법 중 잡 이름을 내용으로 짓는 방식은 그대로 쓸 수 있다. 워크플로 이름 접두사와
  손으로 쓴 전체 지도는 이 저장소의 규모와 다중 역할 워크플로, 기존 이름 결합에 맞지 않는다.
  대신 기존 `verify:ci-coverage`에 역할 표 대조를 더하는 방식을 제안서에 담았다.
- Remaining uncertainty: Unknowns의 세 항목. H6은 판단을 보류했다.

## Follow-up Actions

- [CI 흐름 지도와 check 워크플로 잡 이름 정리](../../proposals/active/ci-structure-map-and-job-names.md)
- 집계 잡 이름을 바꾸게 되면 vscode처럼 룰셋을 저장소 파일로 두고 대조하는 방식을 먼저 검토한다.
- 워크플로가 수십 개로 늘거나 한 워크플로가 한 역할만 맡게 되면 이름 접두사 방식을 다시 검토한다.

## Review Checklist

- [x] 모든 `TODO`를 처리했고, 빈 값은 "없음" 또는 "아직 불명확"처럼 이유가 드러나게 남겼다.
- [x] `status`는 `active` 또는 `completed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `active`, `completed/`는 `completed`다.
- [x] `owners`, `related`, `primary-area`, `observed-environments`를 현재 조사에 맞게 채웠거나 빈 값으로 둘 이유가 명확하다.
- [x] 증상, 사용자 영향, 발생 빈도, 심각도, 재현 조건, 환경 메모가 구분되어 있다.
- [x] 코드로 확인된 사실과 런타임에서 확인해야 하는 사실이 분리되어 있다.
- [x] 주요 가설마다 ID, 근거, 확인 방법이 있고, 현재 판단은 README의 가설 판단값을 사용했다.
- [x] Verification 표에 관련 가설 ID, 확인 방법, 판단 기준, 결과, 해석을 기록했다.
- [x] 후속 조치가 필요하면 proposal, ADR, dependency 문서 또는 issue/PR로 연결했다.
- [ ] 완료 문서라면 `completed-at`, `conclusion-summary`, `follow-up`이 실제 조사 결과와 일치한다.
