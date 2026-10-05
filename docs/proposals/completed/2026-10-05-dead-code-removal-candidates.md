---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-05"
approved-by: "user"
approved-at: "2026-10-05"
approval-scope: "A1–A7 및 B01–B15 제거, A2 플러그인 복사본 동기화, 이에 필요한 T01 구조 시험 기대 조건 정합화, V1–V5 검증 및 완료 기록"
completed-at: "2026-10-05"
verification-summary: "A1–A7/B01–B15 및 T01 적용; 최초 구현 1037 pass/4 skip; PR dev 기준 check·build·AST 통과, 공개 시험 988 pass/4 skip, 커밋된 private snapshot 30 pass; 로컬 QA snapshot 로딩 실패 별도 기록"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/completed/2026-09-07-dead-code-removal-candidates.md"
---

# 미사용 코드와 불필요한 재수출 정리 후보

## Summary

2026-10-05 감사에서 미사용 코드를 확인했다. 확정된 정리 대상은
**구현·상수 3개, 테스트 헬퍼 1개, 타입 1개, 미사용 타입 배럴 파일 2개**다.
별도로 **최종 사용처가 없는 재수출 22개(값 10개, 타입 12개)**를 확인했다.
재수출 대상의 원본 구현·타입은 사용 중이므로 공개 경로만 좁히는 대상이다.

후속 구현 지시에 따라 A1–A7 및 B01–B15의 제거를 적용했다. 제품·지원 코드 23개
파일과 이에 필요한 T01 구조 시험 1개를 수정했고, 파일 삭제는 미사용 타입 배럴
두 개다. A2 복사본은 기존 동기화 명령으로 갱신했다. 사용 중인 원본 구현·타입,
route·Action·인증·DB 본문과 의존성·설정은 유지했다.

아래 최초 감사와 구현 전 문서 대조는 역사적 근거다. 실제 제거 후의 검사 결과는
별도 실행 결과 표에 기록했다. 전체 서버 시험에서 발견한 구조 시험 의존성 누락과
최초 watch 시험 실패도 원인·수정·재실행 결과를 구분해 기록한다.
PR 제출을 위해 최신 `dev`로 분리한 뒤의 결과와 private snapshot별 차이는
아래 PR Submission Verification에 따로 기록했다.

## Evidence Baseline — 최초 감사

- 감사일: 2026-10-05.
- 문서화 시점 branch: `harness/qa-verifier`.
- 문서화 시점 HEAD: `f9211a7d473fe2036c689e129d8ac5d6c58f619b`.
- 분석 기준: 당시 QA verifier·dual-client 관련 미커밋 변경과 신규 파일을 포함한
  작업 트리. 이 절은 최초 감사 기록이며 현재 작업 트리 상태를 뜻하지 않는다.
  당시 HEAD만으로 최초 감사 상태 전체를 재현할 수는 없다.
- TypeScript Compiler API 검사 대상: 생성 코드, `plugin/lib` 복사본,
  private `plugin/templates`를 제외한 TypeScript·JavaScript 파일 491개.
- 참조 그래프 분석: 별도 Temp 디렉터리에 설치한 Knip `6.39.0`.
  프로젝트 `package.json`과 lockfile에는 도구 의존성을 추가하지 않았다.
- 문서화 시점에 A1–A5의 선언과 참조를 다시 검색했고, 감사의 판정이 유지됨을 확인했다.
- 표의 줄 번호는 감사 시점 기준이다. 구현 전 경로·심볼·소비자를 다시 확인한다.

**Observed**는 소스와 실행 출력에서 확인한 사실, **Contracted**는 현재 아키텍처의
규칙, **Inferred**는 확인한 참조 범위 안에서의 제거 가능 판정이다. 정적 분석과
수동 참조 확인은 모든 실행 경로의 무사용을 절대적으로 증명하지 않는다.

## Reconciliation Baseline — 구현 전 코드 대조

이 절은 제품 코드 제거 전의 문서 검증 기록이다. 구현 이후의 현재 상태나 실행 결과를
뜻하지 않으며 T01 누락은 아래 Implementation Discovery에 따로 기록했다.

- 대조일: 2026-10-05. branch: `harness/qa-verifier`.
- 현재 근거 HEAD: `f0dd023eff4ae83e778e39d1db720005c3bb3bf6`. 최초 감사 HEAD와 구분한다.
- 대조 시 추적 파일은 clean이고 이 제안서만 untracked다. ignored private 템플릿과
  생성 타입의 내용은 별도 해시로 식별한다. HEAD만 일치해도 이 근거 전체가 같지는 않다.
- source bundle: 이 제안서, frontmatter의 아키텍처 3문서와 과거 완료 제안서,
  `AGENTS.md`, 설치된 Next.js의 `01-app/01-getting-started/02-project-structure.md`.
  과거 제안서는 역사적 A2 판정의 근거이고 현재 구현 지시는 이 문서만 따른다.
- Review Profile: **High-Risk**. core 복사 산출물과 그 전체 덮어쓰기 정책, FSD 공개
  경로와 토큰 화면의 본문 의존성, 검증 대상의 모호성을 함께 검토해야 한다.
  제안 규모 `standard`와 스킬의 위험 분류는 서로 다른 기준이다.
- 기존 문서에는 개선점이 있었다. 동기화 전 drift 제한, 잔존 export의 양성 검사,
  B12/B13 순서, 토큰·init 밖의 보존 동작 추적, private 검증 완료 조건,
  재현 명령과 최신 근거 식별을 아래 실행 계획에 반영한다.

## Goal and Scope

목표는 실제 소비자가 없는 코드를 제거하고, 공개 API를 현재 소비자에 맞게 좁히는
것이다. 라우트·인증·MCP·Server Action·토큰 화면·생성기의 사용자 동작은 유지한다.

포함 범위는 아래 묶음 A와 B에 열거한 파일·심볼과 T01 구조 시험의 존재 조건이다. 내부에서 사용 중인 구현의
삭제, 배포 복사 정책 변경, 의존성 정리, DB schema·migration 변경, QA verifier 기능
변경, private 템플릿 변경, 릴리스·배포는 포함하지 않는다.

제안 규모는 `standard`다. 여러 모듈의 삭제와 FSD public API 변경, core 원본과
플러그인 복사본의 동기화가 함께 필요하다. 새 기능이나 데이터 변경은 제안하지 않는다.

## Findings — 묶음 A: 확정 정리 대상

| ID | 종류 | 위치 | Observed 근거 | Inferred 권고 |
| --- | --- | --- | --- | --- |
| A1 | 사용하지 않는 초기화 결과 | `src/server/agents/runs.ts:75` — `prismaNextDeps` | export의 소비자가 없다. 실제 MCP는 `src/server/mcp/deps.ts:26`에서 `createNextDeps(prisma)`를 지역 객체로 만들고 `:56`에서 사용한다. | 미사용 export와 초기화를 제거한다. `runs.ts:4`의 `prisma` import도 이 선언만 사용하므로 함께 제거한다. `createNextDeps`는 유지한다. |
| A2 | 미사용 함수 | `packages/core/manifest.mjs:20` — `buildLock` | core·플러그인 양쪽과 테스트에서 호출되지 않는다. `plugin/bin/harness-init.mjs:365`는 `mergeClientLock`을 사용한다. | preflight의 drift/orphan 조건을 확인하면서 원본의 `buildLock`만 제거하고 `npm.cmd run sync:plugin-lib`로 `plugin/lib/manifest.mjs`를 동기화한다. `hashOf`, `planWrites`, `mergeClientLock`은 유지한다. |
| A3 | 미사용 상수 | `src/fsd/entities/pipeline/model/labels.ts:21` — `NODE_ORDER` | 선언 외 참조가 없다. 같은 파일의 `NODE_KINDS` import도 이 상수만 사용한다. | `NODE_ORDER`와 전용 `NODE_KINDS` import를 제거한다. 다른 label 함수와 core의 `NODE_KINDS`는 유지한다. |
| A4 | 미사용 테스트 헬퍼 | `tests/server/integration/support.ts:79` — `afterBoardRead` | 통합 테스트를 포함한 저장소 검색과 참조 분석에서 호출·import가 없다. | 헬퍼와 해당 설명 주석만 제거한다. `support.ts`의 다른 fixture·barrier·query 헬퍼는 유지한다. |
| A5 | 미사용 타입 | `src/server/pipeline/run-rules.ts:86` — `PipelineOverview` | 타입 정의 외 참조가 없다. | 타입 정의만 제거한다. `PipelineNext`, `HeadNext`와 실제 응답 조립은 유지한다. |
| A6 | 미사용 타입 배럴 파일 | `src/fsd/pages/project-tokens/index.ts:1` | `TokenRow`의 타입 재수출만 있고 import 소비자가 없다. 실제 route `src/app/(app)/p/[slug]/tokens/page.tsx:2`는 `index.server.ts`에서 `ProjectTokensPage`를 가져온다. 파일 존재를 확인하는 T01은 별도로 보완한다. | `index.ts`를 삭제한다. `index.server.ts`, UI 파일과 UI 내부에서 사용하는 타입은 유지한다. |
| A7 | 미사용 타입 배럴 파일 | `src/fsd/pages/user-tokens/index.ts:1` | `UserTokenRow`의 타입 재수출만 있고 import 소비자가 없다. 실제 route `src/app/(app)/settings/tokens/page.tsx:2`는 `index.server.ts`를 사용한다. 파일 존재를 확인하는 T01은 별도로 보완한다. | `index.ts`를 삭제한다. 서버 public API와 화면·타입 구현은 유지한다. |

A1은 도달 불가 구문이 아니라 **결과를 아무도 사용하지 않는 초기화**다. 모듈이
로딩될 때 불필요한 `NextDeps` 객체가 하나 더 만들어진다. 이 사실을 중복 DB
연결이나 중복 질의가 발생한다는 주장으로 확대하지 않는다.

제품·지원 코드의 편집·삭제 목적지는 **23개 파일**이다. A의 원본 7개와 A2 복사본 1개,
B의 서로 다른 파일 15개다. 구현 중 확인한 T01 구조 시험 1개를 합한 실제 코드 변경은
**24개 파일**이며 코드 파일 생성·이동·rename은 없다. A6·A7의 `index.ts`
두 개만 파일 전체 삭제다. 그 밖의 파일은 지정 선언·import·재수출만 수정한다.

A4의 모듈 전체가 미사용인 것은 아니다. `support.ts`의 동적 import 8곳도 확인했다.
`scripts/rehearse-acceptance-failure.ts`, `rehearse-account-usage-and-tokens.ts`,
`rehearse-automatic-scout.ts`, `rehearse-repository-disconnection.ts`,
`rehearse-src-clean-code.ts`, `rehearse-src-clean-code-fourth-pass.ts`,
`rehearse-src-clean-code-fifth-pass.ts`, `tests/server/integration/migration.test.ts`는
`connections`, `fixture`, `cleanup` 등을 쓰며 `afterBoardRead`를 쓰지 않는다.
이 호출부·namespace 접근·타입 질의와 나머지 support export는 유지한다.

A6·A7의 삭제 후에도 각 slice에는 `index.server.ts` public API가 남는다.
[FSD 규칙](../../architecture/fsd.md)의 public API 경계를 유지하면서 사용하지 않는
추가 배럴만 제거할 수 있다.

### A2의 과거 판정과 현재 판정

[2026-09-07 완료 제안서](../completed/2026-09-07-dead-code-removal-candidates.md)는
당시 `harness-init`이 복사본의 `buildLock`을 import했으므로 미사용 보고를 오탐으로
판정했다. 현재 생성기는 두 client의 잠금 항목을 보존하는 `mergeClientLock`을 사용한다.
현재 코드에서 양쪽 `buildLock`의 소비자가 없어졌으므로 이번 판정은 달라진다.
과거 완료 문서는 당시 실행 기록으로 유지한다.

## Findings — 묶음 B: 최종 사용처 없는 재수출 22개

아래 행은 **재수출문에서 열거한 심볼만 제거**하는 대상이다. 원본 함수·컴포넌트·타입은
내부 소비자가 있으므로 유지한다. 같은 export문에 다른 심볼이 있으면 그 심볼도 유지한다.
타입 재수출 제거는 런타임 코드 감소와 구분한다.

| ID | 재수출 위치 | 제거할 심볼 | 개수 | 원본의 사용 근거 |
| --- | --- | --- | --- | --- |
| B01 | `src/fsd/features/select-project-for-use/index.server.ts:1` | `loadProjectSelection` | 값 1 | `ui/locked-project-banner.tsx`가 server adapter를 상대 경로로 import·호출한다. |
| B02 | `src/fsd/features/manage-project-connection/index.server.ts:1` | `loadProjectConnection` | 값 1 | `ui/disconnected-project-banner.tsx`가 server adapter를 상대 경로로 import·호출한다. |
| B03 | `src/fsd/features/select-project-for-use/index.ts:2` | `availabilityLabel` | 값 1 | `ui/locked-project-banner.tsx`에서 상대 경로로 사용한다. |
| B04 | `src/fsd/pages/project-board/index.ts:2` | `buildBriefing` | 값 1 | `api/project-board.server.ts`에서 모델을 상대 경로로 import·호출한다. |
| B05 | `src/fsd/pages/project-history/index.ts:2` | `readHistoryQuery` | 값 1 | `api/project-history.server.ts`에서 사용한다. |
| B06 | `src/fsd/features/review-gate/index.ts:4,6` | `isAtGate`, `pendingInboxCount`, `AcceptanceFailureView` | 값 2·타입 1 | gate 함수 원본은 `entities/board-item`에 있으며 실제 gate·Inbox 판정에서 사용한다. `AcceptanceFailureView`는 `ui/acceptance-failure.tsx` 안에서 사용한다. |
| B07 | `src/fsd/entities/project-token/index.ts:3,4` | `TokenUsage`, `TokenStatus`, `TokenExpiry` | 값 3 | `ui/token-table.tsx`에서 각각 상대 경로로 import·렌더한다. |
| B08 | `src/server/runbook.ts:22` | `RunbookResult` | 타입 1 | 원본 `runbook-query.ts`의 결과 계약은 유지한다. facade의 재수출 소비자가 없다. |
| B09 | `src/fsd/widgets/history-feed/index.ts:3` | `HistoryRowView` | 타입 1 | `model/history-row.ts`와 `ui/history-list.tsx`에서 사용한다. |
| B10 | `src/server/project-identity.ts:10` | `ProjectIdentity`, `ProjectIdentityResult` | 타입 2 | 원본 `project-identity-query.ts`의 질의 계약은 유지한다. facade 재수출의 소비자가 없다. |
| B11 | `src/server/templates.ts:10` | `TemplateResult` | 타입 1 | 원본 `templates-query.ts`의 결과 계약은 유지한다. facade 재수출의 소비자가 없다. |
| B12 | `src/fsd/features/review-gate/model/gate-source.ts:6` | `GateRow` | 타입 1 | 이 중간 재수출은 사용하지 않는다. entity 원본은 `inbox-gate.ts`의 함수 인자로 사용한다. 같은 줄의 사용 중인 값 재수출은 유지한다. |
| B13 | `src/fsd/entities/board-item/index.ts:10` | `GateRow` | 타입 1 | 원본 타입은 `model/inbox-gate.ts` 내부에서 사용한다. 이 public API를 B12가 다시 재수출하지만 최종 타입 소비자가 없으므로 B12와 함께 정리한다. |
| B14 | `src/fsd/features/manage-project-connection/index.ts:3` | `ProjectConnectionTarget` | 타입 1 | slice의 UI와 server adapter가 모델의 타입을 상대 경로로 사용한다. |
| B15 | `src/fsd/features/edit-pipeline/index.ts:3,4` | `Step`, `SavePipelineInput`, `SavePipelineResult` | 타입 3 | `pipeline-rail.tsx`와 `api/edit-pipeline.server.ts`가 모델 타입을 상대 경로로 사용한다. |

합계는 값 10개와 타입 12개다. A6·A7의 파일은 이 합계에 포함하지 않는다.
22개는 전체 소스의 모든 module-level `export`를 비공개로 바꾸라는 의미도 아니다.
이번 목록에 없는 내부 헬퍼의 export 축소는 별도 감사 범위다.

### 제거 후 유지할 공개 심볼

다음은 각 B 파일에서 남아야 하는 **전체 export 집합**이다. 순서는 계약이 아니지만
심볼·원본 경로·값/타입 구분은 유지한다. 표 밖의 추가 export를 함께 지우지 않는다.

| ID | 해당 파일에서 유지할 export |
| --- | --- |
| B01 | `selectProject`, `LockedProjectBanner` |
| B02 | `disconnectRepository`, `reconnectRepository`, `DisconnectedProjectBanner` |
| B03 | `UseProjectControl`, `selectionControlKey`, `ProjectSelectionModel`, `SelectProjectAction` |
| B04 | `ProjectBoardPage` |
| B05 | `ProjectHistoryPage` |
| B06 | `AcceptanceFailure`, `ReopenActions`, `inboxReadOnlyLabel`, `DiscardAction`, `GateAction`, `InboxItem`, `InboxReadOnlyLabel`, `RetryAcceptanceAction`, `TransitionAction` |
| B07 | `TokenReveal`, `OwnerTokenReveal`, `TokenRow` |
| B08 | `resolveCodexBundle`, `recordRunbook`, `runbookStale` |
| B09 | `HistoryList`, `toHistoryRows`, `HISTORY_TRUNCATED_NOTE`, `HistoryEventInput`, `HistoryReportInput` |
| B10 | `projectIdentityFor` |
| B11 | `templatesFor` |
| B12 | `isAtGate`, `needsHumanDecision`, `pendingInboxCount`, `resumeTargetsFor`, `reopenTargetsFor`, `rejectActionsFor` |
| B13 | `DOC_LINK_NOTE`, `blobHref`, `orderReportActors`, `reportDocLabel`, `reportIsAcceptance`, `RepoRef`, `statusLabel`, `FIELD_BUDGET`, `isOverBudget`, `NotVerifiedChip`, `OverBudgetChip`, `isPlanVerified`, `isAwaitingAcceptance`, `isAtGate`, `needsHumanDecision`, `pendingInboxCount`, `resumeTargetsFor` |
| B14 | `ProjectConnectionControl`, `connectionControlKey`, `ProjectConnectionSummary`, `ProjectConnectionAction` |
| B15 | `PipelineRail`, `SavePipelineAction`, `AutomaticScoutControl`, `SaveAutomaticScoutAction`, `Graph` |

B12는 B13의 `GateRow`를 재수출하는 유일한 중간 경로다. **B12를 먼저 수정한 뒤
B13을 수정하고 묶음 전체를 검증**한다. B13만 먼저 지운 상태로 검사·완료하지 않는다.
`src/fsd/entities/board-item/model/inbox-gate.ts`의 `GateRow`와 해당 함수 인자는 남긴다.

## Exclusions and False Positives

| 분석 후보 | 현재 판정과 근거 |
| --- | --- |
| `plugin/lib/backlog.mjs`, `pipeline.mjs`, `request-rate.mjs`, `token-validity.mjs`, `transitions.mjs`, `usage-window.mjs` | 플러그인 런타임에서 직접 참조하지 않는 복사본 6개다. **Contracted:** `scripts/plugin-lib.mjs`는 테스트를 제외한 core의 모든 `.mjs`를 복사·검사한다. 복사본만 삭제하면 drift로 실패한다. 원본은 사용 중이므로 이번 삭제 대상에서 제외한다. 배포 파일 축소는 복사 정책 변경을 포함한 별도 작업이다. |
| core 또는 복사본 한쪽에서만 미사용으로 보고된 심볼 | 양쪽 사용을 합쳐 판정한다. 예를 들어 core의 `QA_BROWSER_TOOLS`는 복사본을 통해 `plugin/runtime/qa-browser.mjs`, `codex-thread.mjs`, `codex-agent.mjs`에서 실제 사용한다. |
| `@prisma/client` | `src/generated/prisma/client.ts:18`, `internal/class.ts:14` 등이 런타임 모듈을 import한다. 생성 코드 제외 때문에 발생한 오탐이며 유지한다. |
| `tailwindcss` | `src/app/globals.css:1`의 CSS import와 PostCSS 경로에서 사용한다. 유지한다. |
| Next.js 예약 파일·설정의 default export | route·layout·error·proxy와 설정 로더가 사용하는 framework 진입점이다. 일반 import 소비자가 없다는 이유로 제거하지 않는다. |
| `packages/core/*.d.mts`의 export | `.mjs`에 대응하는 타입 선언 계약이다. entry export 확장 검사에서 나온 후보를 런타임 미사용 구현과 동일시하지 않는다. |
| `src/fsd/shared/lib/copy-lock.ts` | 문구 잠금 테스트가 실제 사용하는 시험 전용 라이브러리다. |
| `NextStepBox`, `codexMcpCommand`, `PLAN_COUNT` | 제품 런타임 소비자가 없더라도 테스트·브라우저 fixture에서 사용한다. 테스트 구조를 함께 바꾸는 별도 결정 없이 삭제하지 않는다. |
| `registerProjectIn`, `changeUserPlan` | D3 리허설과 수동 플랜 운영 스크립트에서 사용하는 경로다. 제품 route만 본 분석의 미사용 후보에서 제외한다. |
| `type-display`, `animate-breathe` | 실제 화면 클래스에서 사용한다. CSS 제거 대상이 아니다. |
| Knip의 `pg`, `esbuild` unlisted 보고 | 사용하지 않는 의존성 보고가 아니라 직접 의존성 선언 문제다. 이번 dead code 제거 범위에 포함하지 않는다. |

Knip 전역 그래프에서는 private `plugin/templates/`를 제외한다. 이를 private 검증
완료로 해석하지 않는다. 이번 대조에서는 로컬 private 파일 **14개 전부**를 별도로
열거·검색했고 `templates.test.mjs`의 import와 런타임 사용을 확인했다. A1–A5 심볼 및
`manifest.mjs` 경로의 private 소비자는 없었고 `npm.cmd run test:templates` 36개가
통과했다. `dev.md`의 일반 문구 `Step`는 B15 타입 import가 아니다.

이 결과는 해당 로컬 snapshot에 한정한다. 후속 구현 시 같은 14개를 고정해서 검색하지
않고 현재 private 디렉터리의 전체 파일 집합을 다시 열거한다. 필요한 파일이 없거나
시험을 실행하지 못하면 V4를 미완료로 두고 전체 정리를 완료 처리하지 않는다.
외부 설치 환경의 임의 deep import까지 보증하지 않는다. `package.json`은 `private`
프로젝트이고 이번 대상은 저장소 내부 경로이며, release·배포·client 지원 범위 변경은
제외된다. 실제 외부 소비자 근거가 발견되면 그 제거를 멈추고 목록을 재조정한다.

## Requirements and Constraints

### REQ-DEADCODE-001: 기존 토큰 화면 제공

WHEN 인증된 소유자가 `/p/[slug]/tokens` 또는 `/settings/tokens`를 열면, 시스템은
기존 server public API를 통해 해당 토큰 화면을 제공하고 기존 발급·이름 변경·폐기
Action 연결을 유지해야 한다.

### REQ-DEADCODE-002: init의 잠금 보존 동작 유지

WHEN `harness-init`이 생성 파일의 잠금을 갱신하면, 생성기는 `mergeClientLock`을 통해
다른 client 소유 항목과 사용자가 수정해 건너뛴 파일의 기존 잠금 항목을 유지해야 한다.

### REQ-DEADCODE-003: 나머지 실행 경로 보존

WHEN MCP가 `agent_next`·`pipeline_next`를 호출하거나 소유자가 보드·이력·Inbox·
프로젝트 사용 선택·연결·pipeline 편집 화면을 이용하면, 시스템은 기존 factory,
loader, 모델과 Action을 통해 동일한 결과와 인가·read-only·stale 처리를 제공해야 한다.
`runbook`, `project-identity`, `templates` facade의 값 바인딩과 응답 계약도 유지한다.

### REQ-DEADCODE-004: 열거한 항목만 제거

WHEN 정리가 완료되면, A1–A5 선언은 지정 원본에서 사라지고 A2 복사본도 일치해야 한다.
A6·A7 파일은 없어야 하며 각 server public API와 화면 타입은 남아야 한다.
B의 재수출 22개는 지정 경로에서만 사라지고 원본·내부 소비자·잔존 export는 유지돼야 한다.

### CON-DEADCODE-001: 제거 목록과 원본의 경계

A1–A7 및 B01–B15만 정리한다. B의 원본 구현·타입과 다른 소비자가 있는 export를
유지한다. FSD 의존 방향, slice public API, Server/Client 경계를 변경하지 않는다.
삭제한 두 타입 배럴의 존재를 가정하는 T01 구조 시험의 기대 조건만 함께 갱신한다.
다른 시험·검사기·설정은 변경하지 않고 검사 항목을 삭제하거나 건너뛰지 않는다.

### CON-DEADCODE-002: 복사 정책 유지

core의 변경은 원본에서 수행하고 기존 `npm.cmd run sync:plugin-lib`로 동기화한다.
이 명령은 모든 drift를 덮어쓰고 모든 orphan을 삭제하므로 아래 preflight를 먼저
통과해야 한다. 동기화 직전 허용 drift는 `manifest.mjs` 하나, orphan은 0개다.
다른 차이를 발견하면 해당 작업을 보존·조정한 뒤 재검사한다. 전량 복사 정책은 유지한다.

### CON-DEADCODE-003: 진행 중인 변경과 실행 범위 보존

QA verifier 등 사용자가 진행 중인 변경을 보존한다. 구현 직전에 `git status`와
현재 소비자를 다시 확인하고 중복 편집 가능성이 있으면 해당 변경과 조정한다.
초기 문서화 요청과 후속 구현 지시를 구분한다. 후속 지시에 따라 코드 정리와 필요한
시험 정합화를 수행했으며 승인·완료 기록은 frontmatter를 기준으로 한다.

## Runtime and Final Artifact Contracts

아래 경로의 사용 중인 실행 본문은 유지 대상이다. import 경로와 바인딩을 그대로 유지하고,
V5의 원본 보존 확인 및 지정 회귀 시험으로 최종 화면·응답·생성물을 검사한다.

| 대상 | 유지할 실행·본문 의존성 | 오류·종료 경계와 검증 목적지 |
| --- | --- | --- |
| A1·A5 MCP | `src/server/mcp/deps.ts` → `createNextDeps` → `agentNext`; `pipelineNext`의 실제 head/items/runbook 응답 조립. `cursorTransaction`은 factory 호출 시 callback을 반환하고 DB 쓰기는 호출 때 실행한다. | 인증·scope·cursor/stale와 run 종료: `src/server/agents/next.test.ts`, `run-query.test.ts`, `src/server/pipeline/run-rules.test.mjs`, V1·V2·V5. 지역 `prismaNextDeps`는 허용한다. |
| A2 init·lock | `packages/core/manifest.mjs`가 원본, `plugin/lib/manifest.mjs`는 바이트 동일 복사본. `plugin/bin/harness-init.mjs`는 복사본의 `planWrites`, `mergeClientLock`을 사용한다. lock의 `{version: 1, files}`와 각 `{template, hash}`는 유지한다. | foreign client·skipModified hash 보존, malformed lock·MCP 준비 실패 시 기존 파일 보존: core manifest/client-runtime 및 harness-init 시험, V1·V2·V5. JSON 구조를 파싱해 검사한다. |
| A6·A7·B07 토큰 화면 | 두 `src/app` route → 해당 `index.server.ts` → `ui/*-tokens-page.tsx` → entity `TokenTable` → 상대 경로의 `TokenUsage`, `TokenStatus`, `TokenExpiry`. entity `TokenRow`와 page 내부 타입 alias를 유지한다. | 인증/소유자별 목록, unavailable/Free 발급 제한, 만료·폐기 목록, rename/revoke 바인딩: `tests/server/token-issuance-bindings.test.ts`, 두 page UI 시험, token-table 시험, V2·V3·V5. |
| B01–B05·B14 프로젝트 화면 | 선택·연결 banner의 상대 경로 loader, `availabilityLabel`; 보드 adapter의 `model/briefing.ts`, 이력 adapter의 `model/history-navigation.ts`; 각 route의 server loader와 UI public API를 유지한다. | 거부된 사용자에 대해 loader 미호출, read-only/stale/연결 복원: `project-page-loaders.test.ts`, `project-history.test.ts`, `project-connection-bindings.test.ts`, V2·V3·V5. |
| A3·B06·B09·B12·B13·B15 UI·모델 | label 4함수와 core `NODE_KINDS`, entity gate 판정, history model/list, pipeline model/UI/adapter의 내부 import와 타입 원본을 유지한다. | gate/종료/재개, 잘못된 pipeline 입력·stale 저장: gate-source, briefing, history-row, rail-state 및 pipeline-save 시험, V2·V5. |
| B08·B10·B11 server facade | `runbook.ts`의 `resolveCodexBundle`, `recordRunbook`, `runbookStale`; `project-identity.ts`의 `projectIdentityFor`; `templates.ts`의 `templatesFor`와 각 `*-query.ts` 원본을 유지한다. | 토큰 인가·scope·요청 제한·stale 및 기존 응답 union: `tests/server/runbook-stale.test.ts`, REST scope/사용량 시험과 V1·V2·V5. 타입 재수출만 제거한다. |
| A4 integration 지원 | `support.ts`의 나머지 모든 export 및 위 동적 소비자 8곳을 유지한다. | 격리 DB 연결·fixture cleanup·barrier 해제는 그대로다. V1·V5로 import/본문 보존 확인. 실제 PostgreSQL 통합 시험은 아래 별도 범위 설명을 따른다. |

Next.js의 route 소유자는 `src/app/**/page.tsx`이고 FSD의 `index.ts` 파일 이름은
라우트를 등록하지 않는다. A6·A7은 화면 이동이 아니라 소비자 없는 타입 배럴 삭제다.
root `app/`을 만들거나 route·layout·proxy·Server Action의 본문을 바꾸지 않는다.
fresh build는 `scripts/build.mjs` → Prisma generate → 설치된 Next build로 생성한다.
최종 `.next` route/action 산출물은 기존 산출물을 재사용하지 않고 V3에서 확인한다.
Windows 배포 bundle 생성·설치, DB에 저장된 private 본문, seed/migration은 이번
산출물에 포함하지 않는다. 관련 실행·DB 코드의 본문은 V5로 변경 없음이 확인돼야 한다.

## Phase CLEANUP: 목록에 한정한 코드 정리

- status: Completed.
- satisfies: REQ-DEADCODE-001, REQ-DEADCODE-002, REQ-DEADCODE-003, REQ-DEADCODE-004.
- governed-by: CON-DEADCODE-001, CON-DEADCODE-002, CON-DEADCODE-003.
- verifies: REQ-DEADCODE-001, REQ-DEADCODE-002, REQ-DEADCODE-003, REQ-DEADCODE-004.
- entry criteria: 별도 구현 지시와 아래 preflight 충족 — 충족했다.
- exit criteria: 두 작업과 V1–V5 완료, 제외 대상·기존 본문·사용자 변경 보존 — 충족했다.

### Preflight and Ordering

1. 저장소 root에서 `git status --short`, `git rev-parse HEAD`를 확인한다. 현재 A/B
   경로·선언과 제거 전 export 집합, 관련 소비자 및 비교할 본문을 기록한다.
   23개 목적지가 모두 존재해야 하며 새 파일·이동 목적지·충돌 해결은 없다.
2. 전체 그래프 및 AST로 named/namespace import, 재수출, `import type`, literal
   dynamic import/require를 확인한다. 로컬 private 전체 파일도 별도 확인한다.
   A4의 namespace 사용처럼 모듈 전체 import는 실제 property 접근까지 대조한다.
3. 편집 전 `node.exe scripts/plugin-lib.mjs --check`가 통과해야 한다. baseline부터
   drift/orphan이 있으면 동기화를 실행하지 않고 기존 작업을 먼저 조정한다.
4. A2 원본만 편집한 직후 같은 `--check`는 **오직 `plugin/lib/manifest.mjs` drift**로
   exit 1이어야 한다. 그 외 drift/orphan이 있으면 중단한다. 이 조건을 확인한 뒤에만
   `npm.cmd run sync:plugin-lib`를 실행하고 `--check` exit 0을 확인한다.
5. B12 → B13 순서를 지켜 묶음 B 전체를 편집한다. 원본이나 소비자를 수정하거나
   deep import를 추가해야 한다면 목록을 다시 대조한다. 새로운 사용처를 억지로 지우지 않는다.
6. V1–V5를 실행한다. 관계없는 baseline 실패는 별도 기록하고 실패한 검사를 PASS로
   처리하거나 완료 조건에서 빼지 않는다. rollback도 이 작업의 diff만 되돌린다.

### TASK-CLEANUP-01: 묶음 A 정리

- status: Completed.
- satisfies: REQ-DEADCODE-001, REQ-DEADCODE-002, REQ-DEADCODE-003, REQ-DEADCODE-004.
- governed-by: CON-DEADCODE-001, CON-DEADCODE-002, CON-DEADCODE-003.
- implementation destination: A1–A7의 원본 7개와 `plugin/lib/manifest.mjs`,
  T01 `tests/server/inbox-card-boundary.test.ts`.
- change intent: 지정 선언과 A1/A3의 전용 import 제거, A4의 전용 주석 제거,
  A6·A7 파일 삭제, preflight를 통과한 A2 복사본 동기화. T01에서는 기존
  `project-inbox` 배럴 부재 검사와 두 토큰 배럴의 type-only 검사를, 세 slice 모두의
  배럴 부재 검사로 통일한다. server API의 exact provenance와 모든 소비자 검사는 유지한다.
- verification destination: V1–V5의 A별 부재·잔존 경로, runtime 계약 표의 MCP/init/토큰 시험.
- stop condition: 새 소비자, private 참조, 허용 밖 drift/orphan, 기존 편집 충돌 발견.

### TASK-CLEANUP-02: 묶음 B 재수출 정리

- status: Completed.
- satisfies: REQ-DEADCODE-001, REQ-DEADCODE-003, REQ-DEADCODE-004.
- governed-by: CON-DEADCODE-001, CON-DEADCODE-003.
- implementation destination: B01–B15의 서로 다른 파일 15개.
- change intent: 열거한 재수출만 제거하고 잔존 export 표·원본·내부 소비자를 유지한다.
- verification destination: V1–V5, B별 AST export 집합·원본 경로·import provenance 대조.
- stop condition: 표 밖 export/원본/소비자 수정, route/API 수정 또는 deep import 우회 필요.

## Verification — 감사에서 실행한 증거

아래 결과는 **정리 전 감사**에서 실행했다. 이 문서 작성 중 전체 검사를 다시 실행한
결과나 제거 후 회귀 검증으로 해석하지 않는다.

| 검사 | 상태 | 관측 결과 |
| --- | --- | --- |
| Knip `6.39.0`, 전체 참조 그래프 및 entry export 확장 검사 | Executed | 미사용 파일·export·타입 후보를 발견했다. 보고의 exit 1은 후보 검출 결과이며 전체 무결점 통과가 아니다. 후보를 core/복사본·내부 사용·테스트·framework 경계와 대조해 위 목록으로 분류했다. |
| Knip 제품 런타임 분석, 테스트·운영 스크립트 root 제외 | Executed | 테스트·운영 경로에서만 사용하는 후보를 추가로 구분했다. 이 분석의 단독 결과로 삭제를 확정하지 않았다. |
| `npx.cmd tsc --noEmit --incremental false --noUnusedLocals --noUnusedParameters` | Executed | exit 0. 미사용 지역 선언·인자 오류 없음. 미사용 public export 전체를 검사하는 명령은 아니다. |
| TypeScript Compiler API: 491개 TS/JS 파일, `checkJs: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `allowUnreachableCode: false`, `incremental: false` | Executed | 미사용·도달 불가 관련 진단 `6133`, `6192`, `6196`, `6138`, `7027`, `7028` 0건. 다른 JS 타입 진단의 통과를 주장하는 결과가 아니다. |
| 후보 심볼·파일명·소비자 전역 `rg` 검색과 소스 대조 | Executed | 묶음 A, B 및 제외 근거 확인. |
| `npm.cmd run lint` | Executed | 통과. |
| `npm.cmd run verify:fsd` | Executed | 통과. |
| `npm.cmd run test:architecture` | Executed | 26개 테스트 통과, 실패 0. |
| `node.exe scripts/plugin-lib.mjs --check` | Executed | `plugin/lib in sync`. |
| 전체 제품 단위·웹 테스트, build, 실제 DB·브라우저·private 템플릿 시험 | Not executed | 이번 감사에서는 실행하지 않았다. 해당 동작과 제거 후 안전성의 검증 완료 근거로 사용할 수 없다. |

## Verification — 이번 문서 대조에서 실행한 증거

다음은 **제품 코드를 수정하지 않은 구현 전 baseline**의 결과다. 제거 후 PASS를 뜻하지 않는다.

| 검사 | 관측 결과 |
| --- | --- |
| Knip 6.39.0 전체 그래프 재실행 및 A/B 전수 소스 대조 | A의 7개와 B의 22개 판정 유지. core/복사본 양쪽을 확인했고 새 삭제 대상으로 확대하지 않았다. |
| TypeScript AST/module resolution | 23개 목적지, 목적지 모듈의 import·재수출 108개 전수 확인. B12→B13과 A4 동적 import 8곳을 분리 확인했다. |
| 메모리상의 제거 후 compiler overlay | 실제 파일은 수정하지 않고 A/B 제거와 A1/A3 import 정리를 메모리에서 적용. 현재 tsconfig의 제거 전·후 진단 각각 0건. TS 연결 검증이며 모든 JS 런타임·실제 build 검증은 아니다. |
| core manifest/client-runtime, harness-init, 토큰 page 2개/token-table, pipeline gate-copy/review gate-source의 기존 시험 | 8파일, 93개 통과. init 시험은 자체 Temp fixture를 쓰며 실제 사용자 프로젝트에 init하지 않는다. |
| token-issuance-bindings/project-page-loaders/project-history/pipeline-save/review-gate-actions/project-connection-bindings 서버 시험 | 6파일, 35개 통과. DB는 fixture/stub이며 실제 PostgreSQL 인수를 뜻하지 않는다. |
| `npm.cmd run test:templates` | 로컬 private snapshot의 36개 통과. |
| `npm.cmd run verify:fsd`, `npm.cmd run test:architecture` | FSD 통과. 아키텍처 26개 통과·2개 skip·실패 0. skip은 통과한 시험 수에 넣지 않는다. |
| `node.exe scripts/plugin-lib.mjs --check` | `plugin/lib in sync`. |
| 실제 제거·전체 check/lint/제품/web/server 시험·fresh build·DB/브라우저/배포 | 이번 문서 대조에서는 미실행. 최초 감사의 실행 결과와도 구분한다. |

## Verification — 최초 구현 후 검증 계약과 실행 결과

V1–V5는 **Executed / PASS**다. 아래 계약에 따라 실행했고 실제 결과·skip·최초 실패와
재실행은 표와 완료 기록에 구분했다.
이 표는 QA 기능이 있는 `f0dd023` 기반의 최초 구현 결과다. 이후 PR의 `dev` 기준
수치와 로컬 private 로딩 상태를 이 표의 PASS로 대신하지 않는다.
명령은 저장소 root의 PowerShell 기준이며 `npm.cmd`, `npx.cmd`를 사용한다.

| 검증 | 제거 후 실행 결과 |
| --- | --- |
| V1: `npm.cmd run check` | 최종 재실행 exit 0. 복사본 일치, ESLint/FSD, fresh route typegen와 tsc 통과. 포함된 `test:architecture`는 26 pass·2 skip, `test:project-availability`는 18 pass·0 skip. |
| V1: `npm.cmd run verify:fsd` 및 strict noUnused tsc | 둘 다 exit 0. `npx.cmd tsc --noEmit --incremental false --noUnusedLocals --noUnusedParameters`도 최종 상태에서 통과. |
| V2: `npm.cmd test` | 최종 전체 재실행 319 pass·2 skip·0 fail. 최초 병렬 검사에서 watch 폴링 시험 1개가 `idle !== work`로 실패했다. 변경되지 않은 시험의 600 ms deadline이 관련된 시간 민감 실패로 판단했으며, 단독 실행 1 pass와 전체 재실행 결과를 따로 확인했다. 시험/제품의 시간 제한을 변경하지 않았다. |
| V2: `npm.cmd run test:web` | 577 pass·0 skip·0 fail. |
| V2/V3: `npm.cmd run test:server` | T01 수정 후 두 fresh manifest opt-in을 켠 최종 실행은 61 pass·0 skip·0 fail. 최초 실행은 T01의 삭제된 토큰 배럴 읽기가 `ENOENT`로 실패했으며 수정 근거는 Implementation Discovery에 있다. |
| V3: `npm.cmd run build` | Prisma generate와 Next production build exit 0. 두 토큰 route 및 보드·이력 route 산출물이 존재한다. fresh Action registry의 토큰 Action 9개와 worker, loader 비등록·Client 경계 시험 통과. |
| V4: private 전량 대조 및 `npm.cmd run test:templates` | 로컬 private 14개 파일의 inventory/본문 SHA-256이 제거 전과 동일하고 새 A/B 소비자가 없다. 36 pass·0 skip·0 fail. |
| V5: TypeScript AST·export·module resolution·diff 전수 비교 | A/B 23개 목적지의 지정 선언·재수출 부재, 남은 export의 원본 경로·alias·type-only flag 일치, 남는 AST 본문·주석 보존 확인. T01은 두 존재 조건 변경 외 AST가 동일하다. 현재 목적지 consumer edge 107개에 삭제한 경로의 심볼 소비자 없음. 그 밖의 bounded 파일 511개(그중 private 14개) 보존, tracked 코드 변경 24개·삭제 2개, `git diff --check` 통과. |
| 보조 검증: Knip 6.39.0 전체 그래프 | JSON 정상 파싱·loader 오류 없음·unresolved 0. 제거 전 95개 → 제거 후 65개 보고 항목, 새 보고 항목 0개. 감소한 30개는 A/B와 A2 copy의 정확한 경로별 항목이며 남은 보고를 전체 dead code로 판정하지 않는다. exit 1은 남은 보고가 있다는 뜻이다. |

전체 명령의 최종 결과는 **1,037 pass·4 skip·0 fail**이다. skip은 전용 native Windows
runtime이 필요한 아키텍처 시험 2개와 플러그인 시험 1개, Windows에서 실행하지 않는
POSIX 명령 시험 1개다. 단독 재현 시험은 이 합계에 중복으로 넣지 않는다.

### V1: 타입·린트·아키텍처·동기화

- destination: `npm.cmd run check`, `npm.cmd run verify:fsd`,
  `npm.cmd run test:architecture`,
  `npx.cmd tsc --noEmit --incremental false --noUnusedLocals --noUnusedParameters`.
- verifies: REQ-DEADCODE-001, REQ-DEADCODE-002, REQ-DEADCODE-003, REQ-DEADCODE-004.
- expected observation: 새 타입·lint·FSD 오류가 없고 core/copy 동기화가 통과한다.
  `check`의 `next typegen`과 tsc는 생성 타입·cache를 쓸 수 있다. read-only 재검사로
  분류하지 않으며 생성 변경을 제품 소스 변경과 구분한다.

### V2: 제품·웹·서버 회귀 시험

- destination: `npm.cmd test`, `npm.cmd run test:web`, `npm.cmd run test:server`.
- verifies: REQ-DEADCODE-001, REQ-DEADCODE-002, REQ-DEADCODE-003.
- expected observation: 각 시험 통과. runtime 표의 모든 기존 시험이 각 명령의 glob에
  포함됨을 확인한다. 서버 바인딩 시험은 실제 route/Action 소스를 fixture로 읽고 UI
  시험은 최종 화면 본문을 렌더한다. 삭제 대상 때문에 기존 시험을 제거하지 않는다.
  VM의 가짜 모듈 객체에 남은 `readHistoryQuery` 필드는 실제 배럴 소비자가 아니다.
  B05 정리만으로 그 fixture까지 변경하지 않는다.

### V3: fresh framework 빌드와 최종 Action registry

- destination: `npm.cmd run build` 후 아래 명령. 일반 서버 시험의 manifest 조건부
  시험을 fresh build 뒤에 명시적으로 켠다. 최종 실행에서는 기존
  `SRC_CHECK_INBOX_MANIFEST=true`도 함께 켜 Client registry 시험까지 실행했다.
- verifies: REQ-DEADCODE-001, REQ-DEADCODE-003.
- expected observation: 두 토큰 route와 보드/이력 route를 수집·빌드하고 Server/Client
  경계를 유지한다. `tests/server/fixtures/action-manifest.ts`는 최종
  `.next/server/server-reference-manifest.json`의 node/edge/workers를 구조적으로 읽는다.
  `project-page-loaders.test.ts`의 Board/History loader 비등록 시험도 실행·통과해야 한다.
  `scripts/build.mjs`의 Windows role snapshot 분기는 이번에 바꾸지 않는다.

```powershell
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'fresh build failed' }
$deadcodePreviousManifest = $env:RDC_CHECK_ACTION_MANIFEST
try {
  $env:RDC_CHECK_ACTION_MANIFEST = 'true'
  npm.cmd run test:server
  if ($LASTEXITCODE -ne 0) { throw 'fresh action manifest tests failed' }
} finally {
  $env:RDC_CHECK_ACTION_MANIFEST = $deadcodePreviousManifest
}
```

### V4: private snapshot 검증

- destination: `rg --files --hidden --no-ignore plugin/templates -g '!**/.git/**'`로 현재
  전량 열거, 해당 파일의 A/B 심볼 및 import 경로 확인, `npm.cmd run test:templates`.
- verifies: REQ-DEADCODE-002, REQ-DEADCODE-003, REQ-DEADCODE-004.
- expected observation: 필요한 private 파일·시험이 존재하고 현재 snapshot에 새 소비자가
  없으며 시험 통과. 문서의 일반 단어와 실제 코드 소비자를 구분한다. 미실행·누락이면
  V4는 미완료이고 전체 정리를 완료 처리하지 않는다. private 파일은 수정하지 않는다.

### V5: 항목별 부재·양성 보존·변경 범위

- destination: TypeScript Compiler API로 A/B **전체** 목적지의 AST와 모듈 해석을
  제거 전 snapshot에 대조하고, 현재 소스·소비자·정리 diff를 확인한다. 아래는 이
  검증의 정확한 판정 계약이며 기존 `rg`만으로 자동 PASS 처리하지 않는다.
- verifies: REQ-DEADCODE-001, REQ-DEADCODE-002, REQ-DEADCODE-003, REQ-DEADCODE-004.
- expected observation:
  1. A1–A5의 지정 선언 및 A2 copy의 `buildLock`은 해당 AST에 없다. A1의 `@/server/db`
     import와 A3의 named import `NODE_KINDS`도 없다. 나머지 top-level 문장·주석의
     의미는 A4 전용 주석을 제외하고 보존한다. export 집합은 제거 전에서 지정 심볼만 뺀다.
  2. A6·A7은 filesystem에 없다. 각 `index.server.ts` → UI의 값 export가 존재하고,
     두 실제 route는 계속 해당 server API를 import한다. UI 타입 alias·entity
     `TokenRow`·토큰 Action 9개와 기존 guard/query/prop 바인딩은 유지한다.
  3. 모든 B 파일의 named export는 잔존 표와 정확히 일치한다. `moduleSpecifier`,
     원래 이름/alias, type-only flag는 제거 전과 같다. B12/B13을 모두 검사하고,
     원본·내부 소비자는 제거 전 본문과 같다. import/재수출을 해결했을 때 제거한
     **경로의 심볼**을 요구하는 소비자는 없어야 한다. 새 namespace/wildcard/dynamic
     경로가 있으면 접근 property를 확인하고 확인 불가능한 소비자는 중단 조건이다.
  4. 같은 이름의 합법적 잔존을 실패로 오판하지 않는다. A1의 MCP 지역 `prismaNextDeps`,
     core `NODE_KINDS`, B의 모든 원본, entity `GateRow`와 `isAtGate`/`pendingInboxCount`,
     UI `TokenUsage`/`TokenStatus`/`TokenExpiry`는 **허용·필수 목적지**다. A/B 이름 전역
     검색 0건은 완료 조건이 아니다. 타입 선언·과거 문서는 범위 밖의 잔존이다.
  5. 편집 파일은 A/B 23개와 T01 구조 시험 1개, 총 24개 목록 안에 있고 파일 삭제는
     A6·A7 두 개뿐이다. A/B는 지정 AST 부분만 제거하고 T01은 명시한 존재 조건만
     갱신한다. 원본·route·Action·DB/인증·설정·다른 시험·검사기·private·6개
     제외 copy 및 다른 사용자의 diff는 보존한다. 새 deep import나 `export *`는 없다.

Knip 0건은 완료 조건이 아니다. 제거한 항목의 지정 경로별 부재와 신규 소비자/후보를
대조한다. 새 module-level 미사용 export는 자동으로 제거하지 않는다.

이번 변경은 실행 본문·SQL·데이터를 바꾸지 않으므로 실제 DB 경합, 브라우저 로그인·
응답 유실, client 설치·배포 인수는 범위 밖이다. 이 경계를 유지할 근거는 V5의
본문·바인딩 보존 검사다. 그 검사가 실패하면 범위를 다시 검토해야 하며 정적 분석이나
fixture 시험으로 실제 DB/브라우저 인수까지 통과했다고 기록하지 않는다.

## Implementation Discovery — 구조 시험의 filesystem 의존성

2026-10-05 실제 제거 후 전체 서버 시험에서 T01
`tests/server/inbox-card-boundary.test.ts`가 두 토큰 slice의 `index.ts`를
`readFileSync`로 읽고 모든 export가 type-only인지 검사해 `ENOENT`로 실패했다.
이는 import/export 소비자가 아닌 **파일 존재에 대한 구조 시험 의존성**이다.
앞선 문서 대조의 compiler overlay·import 그래프와 부분 서버 시험은 이를 놓쳤다.
따라서 최초 문서부터 개선점이 없었다고 주장하지 않는다.

현재 구조는 세 composition slice 모두 client 배럴 없이 `index.server.ts`로만
공개하므로 T01이 세 `index.ts`의 부재를 직접 확인하도록 바꾼다. 파일이 있을 때만
검사하는 조건이나 skip을 추가하지 않는다. 각 server API의 named value export·UI
원본 경로, 두 토큰 route 및 Inbox route의 소비자, TokenTable 경계와 schema 우회
검사는 그대로 둔다. 이 필요한 시험 수정만 TASK-CLEANUP-01/V2/V3/V5에 추가했으며
새 제품 제거 대상은 없다.

## Reproduction Notes

감사에서 사용한 전체 그래프 설정은 다음과 같다. 필요 시 저장소 밖에 설정 파일을
두고 Knip `6.39.0`으로 아래 PowerShell 명령을 사용한다. 도구 설치와 분석 설정은 프로젝트 의존성·설정 변경과 분리한다.

```json
{
  "entry": [
    "scripts/*.{ts,mjs}",
    "plugin/bin/*.mjs",
    "tests/**/*.{ts,tsx,mjs}",
    "src/**/*.test.{ts,tsx,mjs}",
    "packages/core/*.test.mjs",
    "*.config.{ts,mjs}",
    "next-env.d.ts"
  ],
  "project": [
    "src/**/*.{ts,tsx,mjs,mts}",
    "packages/core/**/*.{mjs,mts}",
    "plugin/{bin,runtime,lib}/**/*.mjs",
    "scripts/**/*.{ts,mjs}",
    "tests/**/*.{ts,tsx,mjs}",
    "*.config.{ts,mjs}",
    "next-env.d.ts"
  ],
  "ignore": ["src/generated/**", "plugin/templates/**"],
  "ignoreExportsUsedInFile": true
}
```

다음 코드는 위 JSON을 `$deadcodeConfig`에 저장한 뒤 실행하는 명령 전체다.
설치·설정 저장은 Temp에만 쓰며 프로젝트 의존성을 변경하지 않는다. 분석은 source를
읽지만 이 도구의 package/config loader까지 read-only라고 보증하지는 않는다.

```powershell
$deadcodeScratch = Join-Path $env:TEMP 'stagekeeper-deadcode-audit-20261005'
New-Item -ItemType Directory -Force -Path $deadcodeScratch | Out-Null
$deadcodeConfig = Join-Path $deadcodeScratch 'knip.json'
if (-not (Test-Path -LiteralPath $deadcodeConfig)) { throw 'Save the JSON above as knip.json first' }
npm.cmd install --prefix $deadcodeScratch --no-save --package-lock=false --ignore-scripts knip@6.39.0
if ($LASTEXITCODE -ne 0) { throw 'Knip installation failed' }
$deadcodeKnip = Join-Path $deadcodeScratch 'node_modules/knip/bin/knip.js'
node.exe $deadcodeKnip --config $deadcodeConfig --include-entry-exports --reporter json --no-config-hints
if ($LASTEXITCODE -notin @(0, 1)) { throw 'Knip did not produce a usable candidate report' }
```

exit 1을 성공으로 간주하지 않는다. JSON의 `issues`를 정상적으로 파싱할 수 있는지,
config/plugin 로드 오류가 없는지와 실제 후보를 별도로 확인한다. 설치된 버전은 해당
Temp의 `node_modules/knip/package.json`에서 `6.39.0`인지 확인한다.

최초 감사의 별도 제품 런타임 분석과 491파일 Compiler API 검사는 역사적 보조 증거다.
현재 제거 판정의 재현에는 위 전체 그래프·V4 private 전량 대조·V5 AST/provenance를
함께 사용한다. 최초 런타임 분석을 다시 실행하지 않고 새로 실행했다고 기록하지 않는다.

entry에는 framework가 자동 등록하는 경로 외에 수동 CLI·리허설·테스트 진입점을
포함했다. raw 결과의 미사용 export와 실제 미사용 구현은 구분한다. 같은 파일에서
사용하는 함수의 외부 export가 필요 없다는 사실만으로 함수 본체를 지우지 않는다.

## Risks, Readiness and Closure

- 지정된 A/B 제거와 T01 구조 시험 정합화를 완료했고 V1–V5가 통과했다. 초기 문서의
  import 그래프만으로는 T01의 파일 존재 의존성을 포착하지 못했다는 한계를 기록했다.
- watch 시험의 최초 시간 민감 실패는 단독·전체 재실행에서 통과했으나, 병렬 부하에서
  재발할 가능성은 남는다. 이번 정리를 위해 관련 시험이나 runtime 코드를 변경하지 않았다.
- Knip의 남은 65개 보고는 보존한 배포 copy 6개, framework config, declaration file,
  배포 모듈 public export, 기존 dependency/unlisted 경고다. 새 보고 항목은 없고 추가
  제거는 수행하지 않았다. 이 완료 판정은 저장소 전체의 미사용 코드 부재를 뜻하지 않는다.
- 환경 조건에 따른 시험 4개의 skip과 실제 DB·브라우저·설치·배포 미실행은 위 결과와
  구분한다. auth·SQL·런타임 본문 및 기존 소비자의 보존을 V5로 확인한 정리 범위다.
- 완료 조건인 A/B 23개 목적지의 지정 변경, T01 한정 수정, A6·A7 파일 부재,
  server/UI/Action·원본·잔존 API 존재, 결과·실패·skip 기록과 사용자 변경 보존을 충족했다.
  저장소 proposal 정책에 따라 `status: completed`, `stage: null`로 기록하고 `completed/`로 이동한다.
- 롤백은 지정 삭제 부분과 T01 존재 조건만 복원한다. 복사본 복구도 preflight를 거친다.
  전체 reset이나 다른 작업의 덮어쓰기는 수행하지 않는다.

## Completion Notes

- 최초 구현의 코드 변경은 `harness/qa-verifier`, HEAD `f0dd023eff4ae83e778e39d1db720005c3bb3bf6` 위의
  미커밋 작업 트리다. 구현 전 tracked 트리는 clean이었고 이 제안서만 untracked였다.
- A1–A7, B01–B15는 전부 적용했다. core/copy는 바이트 동일하며 동기화 결과는
  1 copied·0 removed였다. T01은 구조 검사를 강화하는 두 존재 조건 변경만 적용했다.
- fresh build ID: `3ji3xgQud6T2FpA3naWbo`.
- fresh Action registry SHA-256:
  `3457684310196edcdbd7f6e496a987bac28b4a8ff08dc63c8003bbded1804a84`.
- 검사기·snapshot·명령 로그는 저장소 밖 Temp에서 사용했다. 저장소에 도구 의존성이나
  sidecar를 추가하지 않았으며 완료 문서가 실제 범위·실행 결과·남은 한계의 기록이다.

## PR Submission Verification

기존 QA 기능 PR #116이 열려 있어 이번 정리만 최신 `dev`에서 분기한
`harness/dead-code-cleanup`으로 옮겼다. 제출 기준 commit은
`af88938670003abf71292686fc37832007da29f1`이며 대상은 `dev`다. QA 기능이나 기존
다른 PR의 commit을 포함하지 않는다. 코드 24개 파일과 이 완료 문서 1개만 제출한다.

| 검증 | `dev` 기준 재실행 결과 |
| --- | --- |
| `npm.cmd run check` | exit 0. lint/FSD/typegen/tsc 및 복사본 검사 통과, architecture 26 pass·2 skip, project availability 18 pass. |
| `npm.cmd run verify:fsd`, strict noUnused tsc | exit 0. |
| `npm.cmd test` | 307 pass·2 skip·0 fail. |
| `npm.cmd run test:web` | 576 pass·0 skip·0 fail. |
| `npm.cmd run build` 및 두 manifest opt-in을 켠 `test:server` | fresh build exit 0, server 61 pass·0 skip·0 fail. 토큰 Action 9개 및 토큰·보드·이력 route 산출물 보존. |
| 현재 로컬 private snapshot의 `test:templates` | 로딩 실패. uncommitted QA 시험이 #116의 `packages/core/qa.mjs`를 import하지만 현재 `dev`에는 그 모듈이 없다. 정리가 삭제한 모듈이 아니며 이번 변경의 회귀로 판정하지 않는다. 이 snapshot의 새 기준 V4 실행은 PASS가 아니다. |
| private 저장소의 커밋된 snapshot `95ace9d70b63cc8598ab229e2fe1138467f11728` | snapshot을 저장소 밖 Temp에 추출하고 현재 공개 코드와 함께 같은 `npm.cmd run test:templates`를 실행해 30 pass·0 skip·0 fail. 현재 로컬 QA snapshot의 시험 완료를 대신하지 않는다. private 원본 파일·git 상태는 변경하지 않았다. |
| 항목별 AST·모듈 해석·본문·주석·diff 대조 | `dev`의 원본에 지정 제거만 적용됨을 확인. 코드 변경 24개·삭제 2개, consumer edge 106개, 원본 구현과 잔존 API 보존. 현재 private 14개 파일의 byte hash와 inventory 보존. `git diff --check` 통과. |
| Knip 6.39.0 | 정상 JSON, unresolved 0, 지정 제거 항목 없음. 나머지 보고 59개로 exit 1이며 저장소 전체 무결점 PASS가 아니다. 최초 QA 기준 65개와는 코드 baseline이 다르다. |

공개 시험의 합계는 988 pass·4 skip·0 fail이고 커밋된 private snapshot은 별도 30 pass다.
현재 로컬 QA snapshot의 로딩 실패를 두 합계에서 숨기지 않는다. QA snapshot 검증은
QA 모듈이 존재하는 공개 baseline에서 다시 수행해야 하며 이 PR의 자동 CI에 private
파일은 포함되지 않는다. 실제 DB·브라우저·설치·배포 인수도 실행하지 않았다.

- 제출 기준 fresh build ID: `fXvC7tAr-ew4eTJbpVTRk`.
- 제출 기준 fresh Action registry SHA-256:
  `3457684310196edcdbd7f6e496a987bac28b4a8ff08dc63c8003bbded1804a84`.

## Reconciliation Receipt — 구현 전 근거 범위와 재검증

아래는 코드 제거 전 Minimal Replay Anchor와 High-Risk Durable Receipt의 역사적
기록이다. **완전성·정확성·결함 부재의 증명은 아니다.** 당시 제안서 SHA-256은
`e607518f67e1df10fcf5cd983b8f9d88434df5755a3b3fb6710d99ea590f2c70`였다.
후속 구현과 T01 보완·완료 문서 갱신으로 source·범위가 달라졌으므로 이 receipt를
현재 상태의 clean pass로 재사용하지 않는다. 제거 후 근거는 위 V1–V5와 완료 기록이다.

- repository opaque ID: `9facb7db567781ed63fc5933a96fc8a51f52172500f90fb26956350b058db7f3`.
- code HEAD: `f0dd023eff4ae83e778e39d1db720005c3bb3bf6`.
- scope/phase/profile: A1–A7 + B01–B15, CLEANUP, High-Risk. 목적지 23개.
- candidate recipe (`safe-replay`): 두 Findings 표의 repository-relative 파일 경로에서
  줄 번호를 제거하고 A2 copy `plugin/lib/manifest.mjs`를 더한다. 중복 제거 후 ASCII
  오름차순 정렬, 경로 구분자는 `/`, UTF-8 `\n` 연결·끝 newline 없음의 SHA-256.
- candidate path-set signature: `38f0b8fb64efe301fe9e5119c0e443382423bc9544df59f53772ce8f0b52c2d5`.
- discovery recipe (`safe-replay`): `rg --files --hidden src packages/core plugin/bin
  plugin/runtime plugin/lib scripts tests -g '*.ts' -g '*.tsx' -g '*.mjs' -g '*.mts'`를 한 줄로 실행하고,
  V4 private 전량 열거 중 같은 확장자 파일을 합쳐 중복 제거·정렬한다.
- discovery code path-set signature: `8652b38235b36bd1ca0a12c5ebccd355630e728b95662d3cc9033e7c5ed62cd4`.
- source bundle identity: 아래 직접 참조 문서별 SHA-256. 이 제안서 identity는 완료 응답.

- `AGENTS.md`: `e16a0346affdffd71df1ec8ea982a77e93e5d0d6aeb7f72dffb99690b08d25ed`.
- `docs/architecture/README.md`: `edf7b74096415f84ed66c5dc780836b4c5fe6c1ccf5f4185c8ec7dc2ffa35b78`.
- `docs/architecture/fsd.md`: `b29fcacba7821efb85aeae9ac08a4cbdc2c08ee8b70105a1acc98b30fd5c9a91`.
- `docs/architecture/verification.md`: `150a55bcb147c95e7b3364cc8be8d3b3bc1977e90dbebb8b0d681c21a2a2449e`.
- `docs/proposals/completed/2026-09-07-dead-code-removal-candidates.md`: `f27486c127ab6c117af19247506f5eb9d42d36d0d3c5727fa299c294f96db5c7`.
- `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`: `bd37023ff68fe1ce3915575dd9225b79341020d4c2a02cc8fcee67a60e43c5cc`.

Coverage Stability와 산출물·검증 경계:

- 값·타입 제거 closure: Knip 후보 그래프와 다른 구조의 AST/module resolution 및
  compiler host overlay로 23개 목적지를 대조한다. 제거 전/후 진단 0/0, 목적지
  consumer edge 108개. literal dynamic import 8곳과 B12→B13 경로를 직접 닫았다.
  검사 manifest는 V5의 전수 부재·잔존 판정이며 source 변경 없이 수행한다.
- 최종 본문 closure: runtime 표의 source provenance, 기존 UI/route/Action fixture
  시험 35개·core/init/UI 시험 93개·private 36개 및 원본/copy byte 비교.
  auth·DB·runtime body 변경이 금지된 근거와 검증 목적지는 V5에 있다.
- command classes: filesystem 열거·AST source 분석·`plugin-lib.mjs --check`는
  `safe-replay`; Knip 설치/실행·시험·typegen·sync·build는 `manifest-only`다.
  명령 이름만 보고 replay에서 자동 실행하지 않는다. DB/브라우저/배포 인수는
  `volatile-non-replayable`이고 미실행·범위 밖이다.
- final artifact map: core→copy→init union lock, route→server API→화면 본문과
  Action props, B public API→원본 모델/UI/query, fresh `.next` Action registry를
  Runtime/V1–V5에서 연결했다. 새 registry/hook/listener/handler 생성은 없다.
- exclusions: 실제 SQL·인증·브라우저·설치·배포 경로는 수정하지 않는다. V5의 본문
  보존을 전제로 제외한다. private 전체 검색은 제외하지 않고 V4로 따로 검증한다.
- freshness: 아래 ignored snapshot/생성 타입 중 하나라도 달라지거나 관련 dirty
  파일이 생기면 해당 근거를 재수집한다. tracked 소비자·검사기·config 변화는 HEAD와
  bounded discovery를 함께 대조한다. 새 제안서 편집은 기존 clean 결과를 무효화한다.
- redaction: private 본문·credential·외부 환경 내용은 기록하지 않고 상대 경로와 digest만 기록했다.
- persistence: 사용자가 개선을 요청한 이 제안서에 저장. 별도 저장소 sidecar는 만들지 않았다.

### Relevant Non-HEAD Dependencies

로컬 ignored private 파일과 compiler가 실제 읽은 ignored Prisma/Next 생성 타입의
**각 경로별 SHA-256**이다. 생성 타입은 현재 static overlay의 근거이고 fresh build
완료 증거는 아니다. 이 제안서 외 관련 tracked dirty/untracked 파일은 관측되지 않았다.

```text
.next/dev/types/cache-life.d.ts	4f984436b10cfb43ccf7fc3114dcb851cbefa4d58b7d8ae741aaae0f6e330129
.next/dev/types/root-params.d.ts	f3387dd7800eec3c34273f7a8efad13e864598c7e8f788d321e407390989bb59
.next/dev/types/routes.d.ts	2ed2590103afda49c209614b2851a4d81fcf5493795c3b3d680d622d56633c1b
.next/dev/types/validator.ts	0740bcfe097dc9ca7fa1819952bf1f54ac62eca1ccf149faa1b741acadaea843
.next/types/cache-life.d.ts	4f984436b10cfb43ccf7fc3114dcb851cbefa4d58b7d8ae741aaae0f6e330129
.next/types/root-params.d.ts	f3387dd7800eec3c34273f7a8efad13e864598c7e8f788d321e407390989bb59
.next/types/routes.d.ts	2ed2590103afda49c209614b2851a4d81fcf5493795c3b3d680d622d56633c1b
.next/types/validator.ts	23906faf89d4b5d98ada98e99c16bc3e97a9821a34a36bb9656b47b7dcee5c3d
next-env.d.ts	1862ac4bbbc5192d4bf562161df66ea547ed3e67173100656ab606ae9797db2b
node_modules/next/package.json	3ae720e4b8cdad7503935b27b0d14e04390068bf10d6e685797ccf1044051967
node_modules/typescript/package.json	822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6
plugin/templates/README.md	fca42060e121cc2acc01b550767564230e09dd039512e9fab3148da8a68339fe
plugin/templates/en/CLAUDE.runbook.md	851dde2b97e0e482ac47b5a15b95a0ad8b4e2bfa9f697aa76d2a5f37902c4d4a
plugin/templates/en/CODEX.runbook.md	ef5cb547c8c2030119bb91336b04ddb139293440f6ed38b35ce8bf923ca10b22
plugin/templates/en/agents/dev.md	ca0f39b3e489ab236ed4eb1113601ff1798812bdfa0c5ac69a6e5de7e1535ec5
plugin/templates/en/agents/doc-auditor.md	4cc599dca790560b7e2252068c485e59e6a137df0b2647cf4a3939f27eb03ddb
plugin/templates/en/agents/feature-scout.md	c4059e06aea80ccdae95995b63519d485fcc98b5ae104c29bdb59cd30c03db4b
plugin/templates/en/agents/plan-verifier.md	300c498e7e88406fda42b74a39a2878f865e370b46d4dcef37914f916d0eb771
plugin/templates/en/agents/pm.md	b0727c3177b5a1e9f91f5d68de81ef39af04f3763c88002cd26dcbd288606280
plugin/templates/en/agents/qa-verifier.md	b310fae4a26121a9b2837537938c5770669750428aa253cd67ff7cf516f15b48
plugin/templates/en/docs/agents/README.md	b68e24a4bd029b0d9b2eb12dac1889e83273427210552c53bf0b97510117348a
plugin/templates/en/docs/plans/README.md	86c56405c4518a05d987067e1eb2969dea8a36be27711e8886eb000e513c5038
plugin/templates/en/docs/plans/template.md	1d014f9f5530db6ddddc50a5905588bf622e24b3e7adf105d1f3b25587e9c4eb
plugin/templates/en/docs/plans/verification-paths.md	9dc3f3470169efae12a81cb9b095b15dced2847e1535516e2a555e645bc15725
plugin/templates/templates.test.mjs	0021e90fbb59c88d1ecdc38784e4f126165252c868747e32e9ab4939aa1b51e5
src/generated/prisma/browser.ts	08af4f27b96d9c65fc95997333107ea0d16fc0b4417fe45df8ce5d953314188a
src/generated/prisma/client.ts	690090cc31199f6052c33e9a8d4c4f446defad6b9a4f2c267ea8392cd68791b4
src/generated/prisma/commonInputTypes.ts	3843fa222a65bbc55b4b02283680dbd41e8090d2a1b5367f960e78ec2d2ce9a2
src/generated/prisma/enums.ts	ebbdce75bbdd503c5172913fdc7b0523216ce8a6e6ed3ee4611ab10bea9c1e20
src/generated/prisma/internal/class.ts	2bb6a7db90a2f792463d296419a38edf9ef151e7aadc5a54acf946c6fa69961c
src/generated/prisma/internal/prismaNamespace.ts	e2791aebcc663ce50cd841b4e137fb15657cf858223ae29055a9b5c0ea6248bc
src/generated/prisma/internal/prismaNamespaceBrowser.ts	7f3f8e30e017bb31b848eb1f82b053aca465853d93766092911325877f527b94
src/generated/prisma/models.ts	6857b56b9cd11d5733e4320f5641bbe8f33a6d83cab6916a673cfd7b51aaf680
src/generated/prisma/models/AcceptanceFailure.ts	9794fe58be87e45fa641f0d72ae8ebedc1c3cad5e205300c97cd5ce73bc8c16b
src/generated/prisma/models/AgentRun.ts	108da56de9e4c61f6bd22abe93cc314204ee85536e4e8fde2b3af3c5f7673567
src/generated/prisma/models/AgentRunStep.ts	3d644d19019a4d369e5c960cc4b3573c2e780a16ad69361bf80feda20686f0fc
src/generated/prisma/models/BacklogItem.ts	978d51c2b5015008c28bdfd993657a5c59bf98b2c76151b6487795191f35d0b3
src/generated/prisma/models/BoardItem.ts	4d0dd1d33fae6a84dc7d2a22a8385957ce051c6f499cb13f2002b02e8d2909a9
src/generated/prisma/models/Command.ts	185693dbf265a984604932da58a80df30310f2bac8b02b7ca75def40dec7dd5f
src/generated/prisma/models/OwnerToken.ts	4efad292d74b0edd0cd1bc0d44e6e0622465804af91ce41f6bd16c921ee8a9e4
src/generated/prisma/models/PipelineRun.ts	fe323c0e3f9b6e8bf5b3106151af72cd516a25efe9365a7d61aab6249d8503de
src/generated/prisma/models/PipelineVersion.ts	30716530a924ea1159a77a18193afc1ed03c52b3013931293fe5041dd90c7fa5
src/generated/prisma/models/Project.ts	6619ed89bed5d834d1e7cfa9b6cc6b1f72d79f08eac794c8089d9f153fda1be0
src/generated/prisma/models/ProjectAvailabilityEvent.ts	f9215f82ab9ca3ff214b80d10dedb0994831a729c515f3647becda6e95dffd57
src/generated/prisma/models/ProjectToken.ts	56f9997e35bd197aa13edbfedb0985fd7635b502c9c39e19dac9a226310f5e1b
src/generated/prisma/models/Report.ts	0f8dfed22450e17aeeee6f4bbd18e14677d83e2ce25235e4fae534b29aab0f7a
src/generated/prisma/models/RequestRateWindow.ts	82d6a2a637306eb65d52b87a6902105b99f8d382eeda1ed3c0168afc621d4fd6
src/generated/prisma/models/Subscription.ts	59b40d2305c054becbe6c2907db6a089256fea1954f66c480f4a6a9c87b71e34
src/generated/prisma/models/Template.ts	bc66c7945ba3775b12d1fe04b7af67c0ea4bb51a6d1880e6916d74284304b1a6
src/generated/prisma/models/TransitionEvent.ts	f6fdfc44930c7843b6ec779b6addfacca6f6d9379769d1affb1424e47c8fb5c3
src/generated/prisma/models/User.ts	4f607c3ff623200cd58fe1a9875fadcf30ad9cd795dce813b1da7b60a0cb88eb
src/generated/prisma/models/UserToken.ts	910b53eeafef0bf8272d08d69b611598b7b344208f86340f7c140dfa2427305e
src/generated/prisma/models/Workspace.ts	176dc2776a3ac25f965b013e6929773c94fac4717de723d35bf8c3eedc0d5c78
```
