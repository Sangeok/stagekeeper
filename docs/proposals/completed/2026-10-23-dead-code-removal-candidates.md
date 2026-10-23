---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-23"
approved-by: "user (완료 정리)"
approved-at: "2026-10-23"
approval-scope: "PR #204로 구현·검증·dev 병합된 A1·A2·B1~B8 및 아키텍처 목록 정합화의 완료 확인과 문서 completed 처리. 신규 제품 코드 변경·배포는 포함하지 않음"
completed-at: "2026-10-23"
verification-summary: "A1 상수 1개·A2 싱글턴 바인딩 7개·B1~B8 재export 9개와 아키텍처 정합화 완료. PR #204 check CI 성공 후 dev 병합. 구현 시 check·build·회귀 통과 보고와 완료 확인 시 18개 모듈의 제거/보존 export·미러 동일성 확인"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/server.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/completed/2026-10-07-test-only-code-cleanup-candidates.md"
---

# 미사용 상수·싱글턴 바인딩·재export 정리 완료 기록

## Summary

A1·A2·B1~B8의 전체 Core와 두 아키텍처 목록 정합화를 완료했다.
[PR #204](https://github.com/Sangeok/stagekeeper/pull/204)는 `check` CI 성공 후 `dev`에
병합됐다. 이 문서에는 미선택 Phase 2가 없으며 아래 계획은 당시 근거를 보존한 기록이다.

2026-10-23 코드 감사에서 저장소 내 소비자가 없는 **상수 1개, 싱글턴 바인딩 7개,
재export 9개**를 확인했다. 상수의 플러그인 복사본은 같은 항목으로 집계한다.
전체 파일이 미사용인 제품 모듈은 발견하지 못했다.

최초 문서는 사용자의 감사 결과 문서화 요청에 따른 독립 정리 계획이었다.
당시 작성 범위는 이 Markdown 파일 하나였고 코드 제거는 수행하지 않았다.
기능 오류 수정이나 성능 개선을 목표로 삼지 않는다. 정리로 얻는 이익은 미사용 선언과
공개 경로를 줄이는 것이며, 번들 크기·성능 개선량을 측정한 근거는 없다.

Drafting mode와 제안 규모는 `PHASE_PLAN` / `STANDARD`다. 이번 reconciliation의
Review Profile은 **High-Risk**다. 제품 변경의 우선순위는 낮지만 동기화로 생성되는
플러그인 본문과 공개 경로의 제거·보존 목적지를 함께 검증해야 하기 때문이다.
DB·권한·런타임 상태 전이는 바꾸지 않으며, 하나의 정리 범위 안에 세 Task를 둔다.

## Evidence Baseline and Authority

- 감사·문서 대조일: 2026-10-23.
- 코드 기준 HEAD: `e3fd4f939bb27271ab86cb904ef7c16e2218a0e8`.
- 감사 당시 branch: `harness/private-repository-picker-spec`; 추적·미추적 작업 트리 clean.
- 문서 branch: 원격 `main`·`dev` 존재 확인과 최신 `dev` fetch 후 만든
  `harness/dead-code-cleanup-proposal-20261023`. 생성 시 코드 기준 HEAD와 동일하다.
- 문서 작성 중 별도 `docs/proposals/active/optional-private-repository-picker.md`가
  untracked로 나타났다. 다른 작업의 문서로 취급하고 읽거나 수정·stage하지 않았다.
- 정적 참조 분석: 추적 TS/JS 647개와 플러그인 복사본 21개, 원본 기준 export 1,151개.
  TypeScript Compiler API로 import·재export·심볼 참조를 추적하고 후보별 실제 소비자를 읽었다.
- core와 `plugin/lib`의 참조를 합쳐 판정했다. Next.js 예약 진입점, 테스트·fixture,
  동적 import, 운영 스크립트와 문자열 참조를 함께 대조했다.
- 생성 코드·의존성·빌드 산출물은 삭제 후보 분석에서 제외했다. 별도 private
  `plugin/templates/`는 현재 checkout에 없어 그 내용은 확인하지 못했다.
- 설치된 Next.js `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`를
  확인했다. framework 진입점을 일반 import가 없다는 이유로 미사용 처리하지 않았다.

**Observed**는 현재 코드·검색·실행 출력에서 확인한 사실, **Contracted**는 현재 아키텍처
규칙, **Inferred**는 확인한 저장소 범위에서의 제거 권고다. 정적 분석 결과를 저장소 밖
소비자나 모든 실행 경로의 부재를 절대적으로 증명한 결과로 확대하지 않는다.

현재 경계의 source of truth는 [아키텍처 개요](../../architecture/README.md),
[FSD](../../architecture/fsd.md), [서버 경계](../../architecture/server.md),
[테스트 배치](../../architecture/test-organization.md),
[검증 규칙](../../architecture/verification.md)와 루트 `AGENTS.md`다.
과거 정리 제안서는 유지 결정의 배경으로만 사용하고 현재 아키텍처를 덮어쓰지 않는다.
아래 `REQ`·`CON`·`TASK`·`VFY`의 canonical 정의는 이 문서에만 둔다.

### 구현 전 reconciliation 기준

당시 사용자 지시는 이 제안서의 검증·개선이었고 쓰기 권한은 이 파일 하나에 한정됐다.
같은 제안서 작성의 연속 작업으로 기존 branch와 두 untracked 문서를 보존했다.
당시 코드 기준 HEAD는 위와 같고 제품·테스트·아키텍처 문서 변경은 없었다.

초기 감사의 파일·export 수는 그 감사의 기록이다. 이번에는 A1·A2·B1~B8의 전체
제거 목록, 모든 보존 목적지와 검증 의존 파일을 재대조한다. 검사 대상은 `src`,
`packages/core`, `plugin`, `scripts`, `tests`의 TS/JS와 루트 설정·명령이다.
기본 검색에서 제외되는 `src/generated`, `node_modules`, `.next`, private 템플릿의
내용까지 검사했다고 표시하지 않는다. 생성 코드·패키지는 검증 도구의 의존성으로만 읽는다.

직접 적용하는 source bundle은 이 제안서, 루트 `AGENTS.md`, 위 아키텍처 5문서와
아래 코드·명령·검증 목적지다. 과거 제안서에서는 C01 유지 결정과 실제 완료 기록만
참조한다. 그 제안서의 미선택 Task나 아키텍처 문서가 링크한 다른 제품 계획을 이번
구현 입력으로 이관하지 않는다.

## Findings — 제거 가능한 선언과 바인딩

모든 항목의 정리 우선순위는 낮다. 현재 기능 장애가 있다는 판정은 아니다.

| ID | 현재 위치 | Observed 근거 | Inferred 변경과 보존 범위 |
| --- | --- | --- | --- |
| A1 | `packages/core/runner.mjs:2` — `RUNNER_STATES` | 선언과 `plugin/lib/runner.mjs:2`의 복사본 외 참조가 없다. 테스트에서도 사용하지 않는다. | 상수만 제거하고 기존 동기화 명령으로 복사본에 반영한다. `RUNNER_MODES` 등 다른 상수, runner 상태 타입·요청 검증·lease 판정은 유지한다. |
| A2 | `src/server/pipeline/board.ts:6` — 싱글턴 바인딩 7개 | `walkingKeys`, `availableBacklogCount`, `recordValidation`, `submitPlan`, `submitReport`, `failAcceptance`, `advancePipeline`의 싱글턴 export 소비자가 없다. `pipeline/api.server.ts`도 이 일곱 개를 재export하지 않는다. | 구조 분해에서 해당 바인딩만 제거한다. `createBoardService`, 다른 싱글턴 바인딩, factory가 반환하는 함수와 원본 구현은 유지한다. |

A1의 상태 목록은 요청 파서가 사용하는 상태 검증 규칙을 대체하지 않는다.
`src/server/rest/runner-handler.ts`의 beat 검증과 `src/server/runners/contracts.ts`의
`RunnerStateName`은 유지한다.

A2의 함수 구현은 실제 사용 중이다. `src/server/mcp/deps.ts:createToolDeps`는
`createBoardService(prisma)`로 받은 객체의 일곱 메서드를 호출한다.
`scripts/rehearsals/rehearse-acceptance-failure.ts`와
`rehearse-src-clean-code-fifth-pass.ts`도 `board.ts`에서 factory를 가져온다.
따라서 `board-service.ts`의 메서드나 `board.ts`의 factory alias를 삭제하지 않는다.

## Findings — 소비자가 없는 재export

아래 9개는 공개 경로만 정리하는 대상이다. 원본 함수·타입·컴포넌트와 내부 import는
다른 경로에서 사용하고 있다. 타입 재export 제거를 런타임 코드 감소로 집계하지 않는다.

| ID | 제거할 경로와 심볼 | Observed 사용 경로와 보존 조건 |
| --- | --- | --- |
| B1 | `src/server/pipeline/api.ts:6` — `handoffIsLive` | `run-service.ts`, `current-execution-query.ts`, `run-rules.test.mjs`는 `run-rules.ts`를 직접 참조한다. 원본 함수와 그 참조는 유지한다. |
| B2 | `src/server/mcp/tools.ts:12` — `BacklogView`, `BacklogWithStatusView` | 같은 파일의 `ToolDeps`는 `./views`의 타입을 import한다. 두 타입의 재export만 제거하고 import와 원본 정의를 유지한다. |
| B3 | `src/server/mcp/tools.ts:73` — `NOT_YOURS` | `scope`가 같은 파일의 import를 사용한다. `NOT_YOURS`의 재export만 제거하고 import·분기·오류 문구 및 `PROJECT_REQUIRED` export는 유지한다. |
| B4 | `src/server/projects/entitlement.ts:5` — `ProjectAccess` | 제품 소비자는 `projects/contracts.ts`에서 가져오고 `projectAccess` 반환 타입도 원본 타입을 사용한다. 이 파일의 재export만 제거하고 `Plan` 재export·타입 import·함수 본문을 유지한다. |
| B5 | `src/server/runners/api.ts:2` — `readRunnerSummaries` | 프로젝트 목록은 `runners/api.server.ts`의 바인딩을 사용하며 그 바인딩은 `runner-service.ts`를 직접 import한다. 원본 함수·서버 바인딩·관련 테스트를 유지한다. |
| B6 | `src/fsd/features/review-gate/model/inbox-item.ts:39` — `TransitionInput` | `TransitionAction`은 import한 타입을 사용하고 Action adapter도 `review-gate-input.ts`에서 직접 가져온다. 재export만 제거한다. |
| B7 | `src/fsd/features/edit-pipeline/index.ts:1` — `PipelineRail` | 같은 slice의 `pipeline-list.tsx`와 컴포넌트 테스트·브라우저 fixture는 UI 파일을 직접 참조한다. public API의 `PipelineRail`만 제거하고 같은 문장의 `SavePipelineAction`은 유지한다. |
| B8 | `src/fsd/features/edit-pipeline/index.ts:3` — `Definition` | 내부 모델은 `rail-state.ts` 또는 core에서 타입을 가져온다. index의 재export만 제거하고 `PipelineSnapshot`, 내부 타입 경로와 core 타입을 유지한다. |

B2는 타입 2개이고 나머지 7개 행은 각 1개이므로 총 재export 9개다.

### 제거 후 보존할 symbol의 provenance

| 대상 | 현재 owner → 제거 후에도 유지할 경로·소비자 | 검증 목적지 |
| --- | --- | --- |
| A2 일곱 함수 | `pipeline/board-service.ts:createBoardQueries` → `pipeline/api.ts:createBoardService` → `mcp/deps.ts:createToolDeps`의 `board.*`; 리허설은 `pipeline/board.ts:createBoardService` 유지 | factory 반환 메서드 일곱 개·호출부 본문 불변, VFY-DEADCLEAN-02/03 |
| B1 `handoffIsLive` | `pipeline/run-rules.ts` → 같은 모듈의 `run-service.ts`, `current-execution-query.ts` 직접 import | `run-rules.test.mjs`, VFY-DEADCLEAN-03 |
| B2 두 타입 | `mcp/views.ts` → `mcp/tools.ts`의 기존 type import와 `ToolDeps` | VFY-DEADCLEAN-03의 owner 양성 검사와 타입 검사 |
| B3 `NOT_YOURS` | `projects/access-messages.ts` → `projects/api.ts` → `mcp/tools.ts`의 기존 import·`scope`; `PROJECT_REQUIRED` export 유지 | `mcp/tools.test.mjs`, VFY-DEADCLEAN-03 |
| B4 `ProjectAccess` | `projects/access-query.ts` → `projects/contracts.ts` public type; `entitlement.ts`의 type import·함수 반환 타입 유지 | VFY-DEADCLEAN-03; 같은 문장의 `Plan` 재export 유지 |
| B5 `readRunnerSummaries` | `runners/runner-service.ts` → `runners/api.server.ts`의 DB 바인딩 → `fsd/pages/project-list/api/project-list.server.ts` | `runner-service.test.ts`, `server-public-api.test.ts`, `project-list-page.test.mjs` |
| B6 `TransitionInput` | `review-gate/model/review-gate-input.ts` → `inbox-item.ts`의 type import·`TransitionAction`; Action adapter도 원본 타입 import 유지 | `inbox-item.test.ts`, VFY-DEADCLEAN-03 |
| B7 `PipelineRail` | `edit-pipeline/ui/pipeline-rail.tsx` → 같은 slice의 `ui/pipeline-list.tsx`; 외부 화면은 index의 `PipelineList` 사용 | `pipeline-rail.test.mjs`, `pipeline-list.test.ts`; index의 `SavePipelineAction` 유지 |
| B8 `Definition` | `packages/core/pipeline.d.mts`/`pipeline.mjs` → `edit-pipeline/model/rail-state.ts` → 같은 slice 내부 모델 | VFY-DEADCLEAN-03; index의 `PipelineSnapshot` 유지 |

B7의 직접 참조 fixture는 `tests/server/fixtures/src-clean-code-browser.tsx`와
`tests/server/fixtures/multiple-pipelines-browser.tsx`다. 두 fixture와 기존 테스트의
import는 변경하지 않는다. 모든 B 항목은 소비자 재배선 없이 제거 가능해야 한다.

## Contract Reconciliation and Exclusions

**Contracted:** 서버와 FSD는 실제 소비자가 사용하는 symbol을 공개하고, 소비자는 허용된
public API를 사용해야 한다. 이번 계획은 내부 사용 중인 구현을 보존하면서 불필요한
공개 경로를 좁힌다. 경계 검사 예외나 새 deep import는 필요하지 않다.

**Observed:** `docs/architecture/server.md`의 `pipeline/api.ts` 목록에는 `handoffIsLive`,
`runners/api.ts` 목록에는 `readRunnerSummaries`가 있다. 구현 시 B1·B5와 함께 그 두 행을
정합화하는 작업을 포함한다. `runners/api.server.ts`의 `readRunnerSummaries`는 유지한다.
최초 문서 작성 단계에서는 아키텍처 문서를 수정하지 않았으며 후속 구현에서 정합화했다.

| 제외 대상 | 유지 근거 |
| --- | --- |
| `codexMcpCommand` | `connect-command.test.ts:10`에서 사용한다. [2026-10-07 정리](../completed/2026-10-07-test-only-code-cleanup-candidates.md)의 C01은 당시 구현 범위에서 제외되어 유지됐다. 이번 정리에서도 모델 함수와 테스트를 유지한다. |
| `lineText`, `copyLock`, `missingUnits`, `lockFailure` | runner 표시·제품 문구 검증에서 실제 사용하는 테스트 지원 코드다. |
| `AGENT_TOOL_NAMES`, `OWNER_TOOL_NAMES` | MCP 도구 목록 계약 테스트에서 실제 사용한다. |
| 플러그인에서 직접 참조하지 않는 core 복사 모듈 | `scripts/plugin-lib.mjs`는 테스트를 제외한 모든 core `.mjs`를 동기화한다. 복사본만 선택 삭제하거나 복사 정책을 바꾸지 않는다. |
| Next.js 예약 진입점·생성 타입·운영 스크립트 | framework·생성 계약·수동 실행 진입점이 있다. 일반 import 소비자의 부재만으로 제거하지 않는다. |

분류는 A1·A2·B1~B8 및 `server.md`의 두 목록 정합화가 **Core**, 위 제외 표의
모든 항목과 private 템플릿·DB·운영 배포가 **Out of scope**다. 이 정리에는 Phase 2나
Approval-after 작업을 추가하지 않는다. private 소스의 부재는 현재 checkout에 대한
판정 범위의 한계이며, 그 소스의 호환성을 검증했다는 주장이나 배포 승인 근거가 아니다.

## Requirements and Constraints

### REQ-DEADCLEAN-001: Runner 관찰 동작 보존

WHEN 기존 runner 요청과 상태 조회가 실행될 때, 시스템은 기존 요청 허용·거부 결과,
lease 생존 판정과 프로젝트 목록·배너의 runner 표시를 유지해야 한다.

### REQ-DEADCLEAN-002: 파이프라인·MCP 동작 보존

WHEN 기존 웹·MCP의 보드 및 파이프라인 작업이 실행될 때, 시스템은 기존 factory·runtime
바인딩을 통해 같은 결과·오류·권한 판정과 저장 동작을 제공해야 한다.

### REQ-DEADCLEAN-003: 프런트엔드 소비 경로 보존

WHEN 사용자가 파이프라인 편집과 Inbox를 사용할 때, 시스템은 기존 UI 렌더와
Action 입력·응답 계약을 유지해야 한다.

### CON-DEADCLEAN-001: 제거 범위 제한

A1·A2·B1~B8에 열거한 선언·바인딩·재export만 제거한다. 사용 중인 원본과 내부 import,
factory 반환 메서드, 다른 public export는 보존한다. 새로운 소비자가 발견되면 해당
항목을 보류하고 근거를 갱신하며, 소비자를 우회시키거나 테스트를 약화해 제거하지 않는다.

### CON-DEADCLEAN-002: 동기화와 아키텍처 정합성

A1은 원본 제거 후 `npm run sync:plugin-lib`로 복사본을 갱신한다. 작업 전에는
drift/orphan이 모두 비어 있어야 한다. 동기화 직전에는 `drift: ["runner.mjs"]`,
`orphan: []`만 허용한다. 다른 차이는 동기화로 덮어쓰거나 삭제하지 않고 중지한다.
B1·B5는 `server.md`의 해당 목록만 함께 정합화한다. 기존 FSD·서버 의존 방향과
테스트 배치를 유지한다.

### CON-DEADCLEAN-003: 작업 경계

향후 구현의 tracked 변경 허용 목록은 아래 10개 파일이다. 모두 존재하며 생성·이동·
rename·파일 전체 삭제는 없다. 테스트·의존성·설정·DB·토큰·권한·배포 변경은 없다.

```text
packages/core/runner.mjs
plugin/lib/runner.mjs
src/server/pipeline/board.ts
src/server/pipeline/api.ts
src/server/mcp/tools.ts
src/server/projects/entitlement.ts
src/server/runners/api.ts
src/fsd/features/review-gate/model/inbox-item.ts
src/fsd/features/edit-pipeline/index.ts
docs/architecture/server.md
```

구현 시작 시 HEAD·status와 기존 dirty/untracked 파일을 기록하고 이번 변경의 diff를
그 기준과 비교한다. 기존 제안서·다른 사용자 문서는 정리 대상이 아니며 stash·discard·
stage하지 않는다. 테스트 수정이 필요해지면 원인을 기록하고 범위를 재검토한다.

검증 명령은 기존 ignored 산출물인 `.next/`, `src/generated/`, `next-env.d.ts`,
`tsconfig.tsbuildinfo`를 만들거나 갱신할 수 있다. 이는 제품 파일 추가 허용과 구분한다.
`npm run check`는 `next typegen`, `npm run build`는 Prisma generate와 Next build를
실행한다. 관련 산출물을 자동 삭제하거나 검증 명목으로 DB migration·seed를 실행하지 않는다.
당시 문서 개선 요청의 쓰기 범위는 이 제안서 하나였다.

## Implementation Plan

### TASK-DEADCLEAN-01: A1 상수와 복사본 정리

- satisfies: REQ-DEADCLEAN-001
- governed-by: CON-DEADCLEAN-001, CON-DEADCLEAN-002, CON-DEADCLEAN-003
- verified-by: VFY-DEADCLEAN-01, VFY-DEADCLEAN-03
- 목적지: `packages/core/runner.mjs`, `plugin/lib/runner.mjs`.
- `node scripts/plugin-lib.mjs --check`가 통과하는 기준에서 원본 `RUNNER_STATES`만 제거한 뒤
  아래 guard를 통과한 경우에만 기존 동기화 명령을 실행한다. 최종 복사본 diff는 같은
  상수 한 줄의 제거여야 한다. 모듈 집합 21개와 나머지 20개 복사본의 바이트를 보존한다.
- 다른 runner 상수·상태 타입·검증·timeout·lease·종료 로직과 플러그인 복사 정책을 보존한다.

원본의 A1 제거 후, 저장소 루트의 zsh/bash에서 실행할 동기화 직전 guard:

```sh
node --input-type=module -e 'import assert from "node:assert/strict"; import { diffPluginLib } from "./scripts/plugin-lib.mjs"; assert.deepEqual(diffPluginLib(), { drift: ["runner.mjs"], orphan: [] });' &&
npm run sync:plugin-lib &&
node scripts/plugin-lib.mjs --check
```

첫 명령 실패 시 뒤 명령은 실행하지 않는다. 각 명령을 순서대로 실행하고 결과를 확인한다.

### TASK-DEADCLEAN-02: A2 싱글턴 바인딩 정리

- satisfies: REQ-DEADCLEAN-002
- governed-by: CON-DEADCLEAN-001, CON-DEADCLEAN-003
- verified-by: VFY-DEADCLEAN-02, VFY-DEADCLEAN-03
- 목적지: `src/server/pipeline/board.ts`.
- 구조 분해 선언에서 A2의 일곱 바인딩만 제거한다. `createBoardService(prisma)` 호출과
  나머지 바인딩, `createBoardService` alias와 타입 export는 유지한다.
- `board-service.ts`, `mcp/deps.ts`, 두 리허설의 factory 사용 경로를 변경하지 않는다.

### TASK-DEADCLEAN-03: B1~B8 재export와 목록 정합화

- satisfies: REQ-DEADCLEAN-001, REQ-DEADCLEAN-002, REQ-DEADCLEAN-003
- governed-by: CON-DEADCLEAN-001, CON-DEADCLEAN-002, CON-DEADCLEAN-003
- verified-by: VFY-DEADCLEAN-01, VFY-DEADCLEAN-02, VFY-DEADCLEAN-03
- 목적지: B 표의 코드 6개 파일과 `docs/architecture/server.md`.
- 각 행의 재export만 제거하고 같은 문장의 다른 symbol, 내부 import와 본문은 유지한다.
  `server.md`에서 B1·B5에 대응하는 두 public API 목록만 정합화한다.
- `runners/api.server.ts`의 wrapper 및 테스트, FSD slice의 남은 public API를 유지한다.
  다른 slice가 내부 파일을 직접 import하도록 바꾸지 않는다.

세 Task는 하나의 완료 범위로 검증한다. 새 상태·데이터·비동기 작업을 도입하지 않으며
재시도·중지·재진입·동시성·인증 수명 처리는 기존 소유 모듈에 남긴다.
예상 외 기능 변경이나 소비자 충돌은 해당 항목의 중지 조건이다.

## Runtime and Final Artifact Map

아래는 새 기능 설계가 아니라 제거 후에도 같아야 할 경로다. 성공·거부·재시도·cleanup
본문은 각 owner에 남긴다. 이번 변경은 상태·effect·timer·transaction·callback을 추가하거나
옮기지 않으므로 새 수명주기나 브라우저 동작을 설계할 필요가 없다.

| 보존 표면·최종 산출물 | 최종 owner·본문과 의존성 | 실패·경계·검증 |
| --- | --- | --- |
| 플러그인 runner 모듈 본문 | `packages/core/runner.mjs`를 `scripts/plugin-lib.mjs`가 동일 바이트로 복사한 `plugin/lib/runner.mjs`가 helper import에 쓰인다. runner 모듈 자체에는 import 의존성이 없다. | 동기화 전 정확한 drift/orphan, 동기화 후 파일 집합·전체 본문 일치와 나머지 복사본 불변; `scripts/plugin-lib.test.mjs` |
| Runner REST·lease | `src/app/api/runner/route.ts` → `rest/api.server.ts`·`rest/runner.ts` → `rest/runner-handler.ts`·`runners/api.server.ts`·`runner-service.ts`; core 신호·timeout 함수 유지 | 잘못된 token·요청·사용 불가·예산 초과·교체·stopped/timeout의 기존 거부/상태 결과; VFY-DEADCLEAN-01 |
| Runner 목록·배너 렌더 | `src/app/(app)/projects/page.tsx` → project-list adapter·page, 프로젝트 layout → turn-banner; core 표시 판정과 기존 `useRunnerNow` timer/cleanup 유지 | 빈 목록·live/silent/stopped·일시 정지 표시; 명시한 기존 정적 렌더·모델 시험과 본문 불변으로 검증 |
| MCP 보드 실행·응답 | `src/app/api/mcp/route.ts` → `mcp/api.server.ts` → `mcp/deps.ts:createToolDeps` → board factory; `scope`의 `NOT_YOURS` import·응답 본문 유지 | actor/scope·검증 실패·게이트 거부·허용 실행과 factory 메서드 유지; VFY-DEADCLEAN-02/03 |
| Owner MCP 승인·응답 | `src/app/api/mcp/owner/route.ts` → `mcp/api.server.ts` → `mcp/owner-deps.ts`의 `pipeline/api.server.ts` namespace import → `createOwnerGate`; 기존 `latestRowFor`·`gate` 바인딩 유지 | `owner-tools.test.mjs`와 `server-public-api.test.ts`의 기존 승인/오류·19개 pipeline runtime export 검증. A2의 일곱 바인딩은 이 public API에 원래 없으므로 여기의 export를 함께 제거하지 않음 |
| 파이프라인 편집 렌더 | `src/app/(app)/p/[slug]/pipeline/page.tsx` → `ProjectPipelinePage` → public `PipelineList` → 같은 slice의 `PipelineRail`; 실제 컴포넌트·Action·type owner 유지 | 편집 가능/읽기 전용·입력/표시 검증과 body/import 불변. index에서 UI export를 제거해도 client component identity는 바뀌지 않음 |
| Inbox 입력·렌더 | `src/app/(app)/p/[slug]/inbox/page.tsx` → `ProjectInboxPage`·`InboxCard`; `TransitionAction`과 Action adapter는 `review-gate-input.ts` 타입 유지 | 빈 Inbox·읽기 전용·기존 입력 검증; VFY-DEADCLEAN-02/03 |

이미지·폰트·메타데이터·라우트·응답 schema·DB schema는 이 제거로 소유권이나 내용이
달라지지 않는다. 지정 파일에서 export/바인딩 외의 본문·import 변경이 발견되면 이
비변경 근거가 깨지므로 작업을 멈추고 재검토한다. 정적 렌더·주입형 테스트 통과를
실제 브라우저 hydration·운영 DB·private 패키지 설치·배포 인수로 표시하지 않는다.

## Verification Plan

아래 VFY는 **구현 후 실행할 계획**이다. 직전 감사의 정적 검사 통과를 제거 후 회귀
검증의 완료 증거로 사용하지 않는다. 단순 삭제를 그대로 반영하는 새 테스트는 만들지 않는다.

### VFY-DEADCLEAN-01: Runner 회귀 검증

- verifies: REQ-DEADCLEAN-001
- category: 기존 단위·adapter·렌더 테스트.
- 실행: `npm test`, `npm run test:web`, `npm run test:server`.
- 관찰: `packages/core/runner.test.mjs`의 신호·timeout·lease 판정,
  `src/server/rest/runner-handler.test.ts`의 요청 검증,
  `src/server/runners/runner-service.test.ts`의 상태·목록 조회,
  `tests/server/server-public-api.test.ts`의 runtime wrapper DB 전달,
  `src/fsd/widgets/turn-banner/model/runner.test.ts`,
  `src/fsd/widgets/turn-banner/ui/turn-banner.test.ts`,
  `src/fsd/pages/project-list/ui/project-list-page.test.mjs`의 기존 표시 검증이 유지된다.
- evidence state: Passed. PR #204의 구현 검증에서 해당 기존 회귀를 실행했고 check CI도 성공했다. 아래 완료 기록에서 당시 보고와 이번 직접 확인을 구분한다.

### VFY-DEADCLEAN-02: 파이프라인·MCP·UI 회귀 검증

- verifies: REQ-DEADCLEAN-002, REQ-DEADCLEAN-003
- category: 기존 서비스·MCP·컴포넌트 테스트.
- 실행: `npm test`, `npm run test:web`, `npm run test:server`.
- 관찰: `pipeline/board-service.test.ts`, `pipeline/run-rules.test.mjs`,
  `mcp/tools.test.mjs`, `mcp/owner-tools.test.mjs`와 runtime public API 시험이 통과하고,
  `review-gate/model/inbox-item.test.ts`, `edit-pipeline/ui/pipeline-rail.test.mjs`,
  `pipeline-list.test.ts` 등 기존 렌더·입력 계약 검증을 보존한다.
- evidence state: Passed. PR #204의 구현 검증에서 서비스·MCP·렌더 회귀가 통과했다. 실제 브라우저·운영 DB 인수 완료로 확대하지 않는다.

### VFY-DEADCLEAN-03: 제거 범위·타입·경계·빌드 검증

- verifies: REQ-DEADCLEAN-001, REQ-DEADCLEAN-002, REQ-DEADCLEAN-003
- category: 수동 diff·참조 추적, 동기화, 정적·아키텍처·빌드 검사.
- 실행: A1·A2·B 표와 전체 소비자 검색을 다시 대조한 뒤 `git diff --check`,
  `node scripts/plugin-lib.mjs --check`, `npm run verify:fsd`, `npm run verify:server`,
  `npm run test:architecture`, `npm run check`, `npm run build`를 실행한다.
- 관찰: 허용된 목적지의 지정 제거·목록 정합화만 diff에 있고, core 원본과 복사본이 일치한다.
  미사용 공개 경로는 사라지며 표에 명시한 원본·내부 import·다른 export는 유지된다.
  타입·경계·정적 검사와 build가 통과한다. 테스트 통과만으로 무사용을 판정하지 않는다.
- evidence state: Passed. PR #204의 범위·타입·경계·빌드 검사와 아래 직접 export·미러 확인으로 완료했다.

VFY-DEADCLEAN-03의 공개 표면 검사는 아래 명령을 기준으로 한다. 저장소 루트의
zsh/bash에서 구현 전에는 인자 `before`, 구현 후에는 `after`로 실행한다. 결과의 전체
export 목록을 기록하고, 각 파일의 after 집합이 before에서 해당 제거 목록만 뺀
집합인지 비교한다. 코드·문서에 심볼 이름이 남아 있다는 이유만으로 실패 처리하지 않는다.
예를 들어 `NOT_YOURS`의 내부 사용과 `PipelineRail`의 원본·fixture 참조는 허용된다.

```sh
node --input-type=module - after <<'NODE'
import assert from "node:assert/strict";
import { resolve } from "node:path";
import ts from "typescript";

const mode = process.argv[2];
assert.ok(mode === "before" || mode === "after");
const removed = new Map([
  ["packages/core/runner.mjs", ["RUNNER_STATES"]],
  ["plugin/lib/runner.mjs", ["RUNNER_STATES"]],
  ["src/server/pipeline/board.ts", ["walkingKeys", "availableBacklogCount", "recordValidation", "submitPlan", "submitReport", "failAcceptance", "advancePipeline"]],
  ["src/server/pipeline/api.ts", ["handoffIsLive"]],
  ["src/server/mcp/tools.ts", ["BacklogView", "BacklogWithStatusView", "NOT_YOURS"]],
  ["src/server/projects/entitlement.ts", ["ProjectAccess"]],
  ["src/server/runners/api.ts", ["readRunnerSummaries"]],
  ["src/fsd/features/review-gate/model/inbox-item.ts", ["TransitionInput"]],
  ["src/fsd/features/edit-pipeline/index.ts", ["PipelineRail", "Definition"]],
]);
const retained = new Map([
  ["src/server/pipeline/board-service.ts", ["createBoardQueries"]],
  ["src/server/pipeline/board.ts", ["createBoardService"]],
  ["src/server/pipeline/run-rules.ts", ["handoffIsLive"]],
  ["src/server/mcp/views.ts", ["BacklogView", "BacklogWithStatusView"]],
  ["src/server/mcp/tools.ts", ["PROJECT_REQUIRED"]],
  ["src/server/projects/contracts.ts", ["ProjectAccess"]],
  ["src/server/projects/entitlement.ts", ["Plan"]],
  ["src/server/runners/runner-service.ts", ["readRunnerSummaries"]],
  ["src/server/runners/api.server.ts", ["readRunnerSummaries"]],
  ["src/fsd/features/review-gate/model/review-gate-input.ts", ["TransitionInput"]],
  ["src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx", ["PipelineRail"]],
  ["src/fsd/features/edit-pipeline/model/rail-state.ts", ["Definition"]],
  ["src/fsd/features/edit-pipeline/index.ts", ["SavePipelineAction", "PipelineSnapshot"]],
]);
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
assert.equal(parsed.errors.length, 0);
const targets = [...new Set([...removed.keys(), ...retained.keys()])];
const program = ts.createProgram(targets.map(file => resolve(file)), {
  ...parsed.options, allowJs: true, checkJs: false, noEmit: true, incremental: false,
});
const checker = program.getTypeChecker();
const surfaces = {};
for (const file of targets) {
  const source = program.getSourceFile(resolve(file));
  assert.ok(source, file);
  const module = checker.getSymbolAtLocation(source);
  assert.ok(module, file);
  const names = checker.getExportsOfModule(module).map(symbol => symbol.getName()).sort();
  for (const name of removed.get(file) ?? []) assert.equal(names.includes(name), mode === "before", `${file}:${name}`);
  for (const name of retained.get(file) ?? []) assert.ok(names.includes(name), `${file}:${name}`);
  surfaces[file] = names;
}
console.log(JSON.stringify({ mode, surfaces }, null, 2));
NODE
```

이 검사는 export 존재를 검사한다. A2 함수 본문·factory 메서드나 내부 import의 보존을
대신하지 않으므로, diff에서 지정 export/바인딩 외의 토큰 변경이 없는지 함께 확인한다.
`server.md`는 Markdown 표를 행별로 비교해 `pipeline/api.ts`의 `handoffIsLive`,
`runners/api.ts`의 `readRunnerSummaries`만 빠지고 `runners/api.server.ts` 행과
다른 항목은 같은지 확인한다. 새 wildcard·대체 barrel·alias로 제거 경로를 재노출하지 않는다.

검증 환경은 기존 의존성이 준비된 개발 checkout이다. `npm run build`는
`scripts/build.mjs`의 Prisma generate → Next build 순서이며 DB 접속·migration·seed를
요구하지 않는다. 생성·캐시 효과가 있는 test/typegen/build는 이후 replay에서 자동
실행할 read-only 명령으로 분류하지 않는다.

## Verification Results — 문서화 시점

아래 코드 검사 결과는 같은 세션의 **직전 감사**, 같은 기준 HEAD에서 얻었다.
이번 문서 작성에서 재실행한 결과나 제거 후 검증 결과로 표시하지 않는다.

| 감사에서 실행한 항목 | 결과 |
| --- | --- |
| `node_modules/.bin/tsc --noEmit --incremental false --noUnusedLocals --noUnusedParameters --pretty false` | exit 0, 미사용 지역 변수·매개변수 진단 없음. export 소비자 부재는 별도 참조 분석으로 확인했다. |
| `node_modules/.bin/tsc --noEmit --incremental false --allowUnreachableCode false --allowUnusedLabels false --pretty false` | exit 0, 해당 도달 불가·label 진단 없음. |
| `node_modules/.bin/eslint .` | exit 0, 오류 0·경고 3. `runner-client.mjs`의 catch 변수 2개와 runner 서비스 테스트의 `_projectId` 1개이며 이번 정리 범위에서 제외한다. |
| `node scripts/plugin-lib.mjs --check` | exit 0, `plugin/lib in sync`. |

문서 자체의 검증 결과:

- 설치된 `write-sdd-spec/scripts/validate_sdd_traceability.py`의 표준 검증 통과.
  문서 1개, REQ 3개·CON 3개·Task 3개·VFY 3개이며 Task·verifier의 REQ coverage는 각각 3/3이다.
- 상대 Markdown 링크와 frontmatter의 related 경로 존재 확인 통과.
- 신규 문서의 whitespace 검사 통과.

위 표는 제거 전 문서화 당시 기록이다. 구현 후 VFY·build·회귀 결과는 아래 완료 기록에 별도로 남긴다.

### 구현 전 reconciliation에서 실행한 검증

아래 결과는 같은 HEAD의 **제거 전 코드**와 저장소 밖 메모리 검증에 대한 새 증거다.

| 실행·대조 | 결과와 한계 |
| --- | --- |
| 전체 심볼·재export 참조 재대조 | A1·A2의 소비자 부재와 B1~B8의 public 경로 소비자 부재 재확인. owner·내부 import·fixture의 참조는 보존 대상으로 분류했다. |
| 제품 코드 9개 파일의 메모리 overlay | 지정 제거만 가상 적용한 TypeScript Program의 baseline/after 오류 모두 0. 제거 export 집합과 다른 export 불변, 보존 목적지 15개, 일곱 factory 호출과 core/copy 본문 일치를 확인했다. 실제 파일 제거·생성·동기화를 수행한 결과가 아니다. |
| `node --test --test-reporter=dot packages/core/runner.test.mjs scripts/plugin-lib.test.mjs` | exit 0. 신호·lease와 복사본 drift/orphan·본문·재실행 계약의 기존 테스트 통과. 임시 fixture는 테스트 자체가 정리한다. |
| 아래 12개 파일을 `node --import tsx --test --test-reporter=dot`로 실행 | exit 0. 기존 서비스·MCP·입력·정적 렌더 검증 통과. DB·브라우저 인수는 아니다. |
| `node --import ./tests/server/register-server-only.mjs --import tsx --test --test-reporter=dot tests/server/server-public-api.test.ts` | exit 0. 기존 runtime aggregate·DB 바인딩 wrapper 검증 통과. |
| `node scripts/plugin-lib.mjs --check`와 파일 집합·본문 대조 | exit 0. core/copy 모듈 집합 21개 일치, 모든 복사본 본문 동일. |

12개 파일의 정확한 실행 입력은 다음과 같다.

```text
src/server/rest/runner-handler.test.ts
src/server/runners/runner-service.test.ts
src/server/pipeline/board-service.test.ts
src/server/pipeline/run-rules.test.mjs
src/server/mcp/tools.test.mjs
src/server/mcp/owner-tools.test.mjs
src/fsd/features/review-gate/model/inbox-item.test.ts
src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs
src/fsd/features/edit-pipeline/ui/pipeline-list.test.ts
src/fsd/widgets/turn-banner/model/runner.test.ts
src/fsd/widgets/turn-banner/ui/turn-banner.test.ts
src/fsd/pages/project-list/ui/project-list-page.test.mjs
```

## Readiness and Completion

소비자 부재와 B1·B5의 아키텍처 목록 정합화는 위 코드 근거와 Task에 연결했다.
private 템플릿은 현재 checkout에서 확인하지 못한 한계로 남긴다. 구현 시 해당 소스나
새 소비자가 제공되면 제거 전에 다시 검색하고 충돌 항목만 보류한다.

최초 draft에는 표준 traceability 검증을 사용했다. 완료 정리에서는 strict 추적 검증으로
세 Task와 VFY의 요구사항 연결을 확인한다.
세 요구사항은 각 Task와 VFY에 연결하며 VFY는 기존 동작의 보존을 검증한다.
도달 가능한 코드가 없다는 판정은 후보별 참조 대조와 diff 검토가 담당한다.

구현 완료는 A1·A2·B1~B8의 지정 정리, 두 아키텍처 목록 정합화, 모든 제거·보존 표면
검사와 필수 VFY 명령의 통과를 요구한다. 미실행·실패를 기록한 것만으로 완료 처리하지
않는다. 기존 플랫폼 전용 skip은 원인과 이번 범위 영향 여부를 기록하고, 이번 변경의
필수 검증이 skip되거나 build·타입·경계가 실패하면 구현 완료 판정을 보류한다.
저장·권한 계약 변경과 배포는 포함하지 않는다.
복구가 필요하면 이번 변경만 되돌리고 core 동기화를 재확인한다. 사용자 작업을 일괄
reset하거나 다른 수정과 함께 폐기하지 않는다.

### 구현·검증 완료 근거

구현 commit은 `a9c361a4b1c20cbbfe2e09d1823aef5d20003f3a`이고, PR #204가
merge commit `9f0fac43ee526dc79055d7a01a070a1caee229c6`으로 `dev`에 병합됐다.
GitHub Actions의 `check` run 525는 `completed/success`임을 직접 확인했다.

| 대상 | 구현·검증 근거 | 상태 |
| --- | --- | --- |
| TASK-DEADCLEAN-01 / A1 | core와 미러의 RUNNER_STATES 한 줄만 제거. 나머지 runner 정책·본문 보존 | Completed |
| TASK-DEADCLEAN-02 / A2 | 싱글턴 바인딩 7개만 제거. factory·반환 메서드·구현·소비자는 보존 | Completed |
| TASK-DEADCLEAN-03 / B1~B8 | 재export 9개 제거, server.md 두 목록 정합화. 내부 import·원본·다른 export는 보존 | Completed |
| VFY-DEADCLEAN-01·02 | PR #204 구현 기록: npm test 477 pass / 17 플랫폼 skip, test:web 741 pass, test:server 139 pass / opt-in 1 skip | Passed |
| VFY-DEADCLEAN-03 | PR #204 구현 기록: verify:fsd·verify:server·test:architecture·check·build 통과, 기존 lint 경고 3개 유지 | Passed |
| opt-in 검사 보완 | PR #204 구현 기록: fresh build 후 SRC_CHECK_INBOX_MANIFEST=true 검사 5 pass / 0 skip | Passed |
| 이번 직접 확인 | 병합된 dev에서 문서의 after verifier를 실행. 18개 모듈의 제거 export 부재·보존 export 존재, runner core/미러 전체 바이트 동일 | Passed |

구현 시 테스트 수치는 PR #204의 보고이며 이번 문서 정리에서 전체 테스트를 재실행한
결과로 표시하지 않는다. 이번에는 GitHub의 CI·병합 상태, 실제 commit diff, export와
미러를 직접 확인했다. 초기 감사의 복사 모듈 수 21개는 당시 snapshot 기록이며,
다른 PR이 추가한 모듈까지 삭제하거나 동기화 범위를 축소하는 지시가 아니다.

이 문서는 승인된 전체 Core의 완료 기록으로 completed에 보관한다. 제외 표의 private
템플릿·운영 DB·설치·배포는 수행 완료로 표시하지 않는다. 과거 reconciliation 기록은
새 구현의 readiness 인증으로 재사용하지 않으며, 새 정리 항목은 새 제안서에서 대조한다.
