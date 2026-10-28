---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-28"
approved-by: "user"
approved-at: "2026-10-28"
approval-scope: "CC-001–004 전체 구현·검증 및 후속 요청에 따른 commit·push·dev 대상 PR 생성. 병합·main 승격·배포는 제외"
completed-at: "2026-10-28"
verification-summary: "CC-001–004 구현 완료. 신규 브라우저 31개 두 모드 통과·퇴행 0, build·fresh manifest 통과. 최초 작업 트리의 문서 이동 제약을 분리한 최신 dev 기반 PR 브랜치에서 전체 check·web 779개·server 158개 재검증 통과."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "https://github.com/Sangeok/stagekeeper/blob/e5db41b584d42670b4404dcdae3ddd3196189276/docs/proposals/active/src-frontend-clean-code-review.md"
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/core.md"
  - "docs/ADR/0006-optional-github-repository-list.md"
---

# src 프런트엔드 클린 코드 후속 개선 계획

## Summary

2026-10-28 `frontend-clean-code-orchestrator`의 여섯 독립 렌즈와 중립 품질 게이트가
채택한 **Should 1건·Consider 3건**을 실행 가능한 작업과 검증으로 연결한다. Must는 없다.
우선 개선은 이미 연결된 계정의 초기 저장소 조회가 초안 취소·복원 응답을 기다리지 않게 하는 것이다.
나머지 세 건은 테스트 소유권과 읽기 흐름을 정리하는 선택적 개선이다.

후속 구현 요청으로 네 항목을 모두 구현·검증했다. 아래 계획·Current State는 기준 소스 당시의
설계를 보존하며, 실제 변경과 실행 결과 및 제한은 Implementation Results에 기록한다.

- 작성 모드: `PHASE_PLAN` — 별도 부모 SDD 없이, 사용자 요청과 이번 채택 결과를 근거로 하는 독립 구현 계획.
- 최초 산출물은 이 Markdown 문서였다. 현재 후속 구현 요청으로 CC-001–004 전체를 선택했으며, 아래 계획에 따라 코드와 검증을 진행한다.
- 선행 자료: [이전 개선 제안](https://github.com/Sangeok/stagekeeper/blob/e5db41b584d42670b4404dcdae3ddd3196189276/docs/proposals/active/src-frontend-clean-code-review.md)의 구현 결과와 현행 아키텍처.
  이전 `SRC-CC-001–007`의 승인·구현 이력은 보존하며, 그 승인을 이번 작업에 적용하지 않는다.
- 정규 기록 소유자: 이번 범위의 REQ·INV·CON·TASK·VFY·BLK는 이 문서가 단독 소유한다.
  리뷰의 `CC-*`는 발견 사항 ID이며 요구사항 ID와 구분한다.

## Goal

- 초안 복구 I/O와 이미 연결된 저장소 목록 조회 사이의 불필요한 대기를 제거한다.
- 세션 상실, 늦은 응답, 취소, 재시도 대기와 사용자 편집 보존 계약을 유지한다.
- core 계약 테스트의 소유권과 제안 제출·활동 표시의 읽기 흐름을 명확하게 한다.

## Proposal Size

`proposal-size: standard`, 정합성 검토 프로필과 SDD 위험 분류는 `HIGH-RISK`다.
초기 비동기 요청 순서가 계정·재인증·늦은 응답의 적용 여부에 영향을 주고,
브라우저 본문과 생성된 Client/Action 연결까지 검증해야 하므로 강화된 수명주기 검토를 적용한다.
이는 채택된 Should/Consider의 결함 심각도를 높이는 분류가 아니다.
서버 권한 정책·API 형식·저장 데이터·의존성 변경은 계획에 포함하지 않는다.
세션 무효화와 초안 복구의 경합은 아래 수명주기 사례로 검증한다.

## Current State

### 기준 소스와 증거 구분

- 최초 리뷰 기준: `531da8adaa20a1714d0992f5c081591f4a057037`.
- 문서 작성 기준: 최신 `origin/dev`에서 분기한 `e5db41b584d42670b4404dcdae3ddd3196189276`.
- 문서 작업 브랜치: `harness/src-clean-code-follow-up-spec-20261028`; 시작 시 작업 트리는 깨끗했다.
- `src` tree: `ac70d2691663b902f872cb91135e0ef628ab309b`.
- 두 기준 사이 `src`, 이 계획의 브라우저 fixture·리허설, `package.json`에 차이가 없음을 확인했다.
  기존 브랜치는 보존했고 원격 `main`·`dev` 존재를 확인한 후 `dev`를 fetch했다.
- TypeScript/React/Next.js, npm 및 기존 Node test runner를 사용한다.
  `package.json`과 설치 문서의 Next.js는 16.4.2, React는 19.2.8이며 TypeScript는 strict 모드다.

`Observed`는 코드·명령 출력으로 확인한 사실, `Contracted`는 현행 계약,
`Inferred`는 사실에서 도출한 영향이다. 실제 브라우저에서 지연을 측정했다는 주장은 하지 않는다.

| 리뷰 ID / 중요도 / 렌즈 | 현재 근거 | 상태와 남은 변경 |
| --- | --- | --- |
| CC-002 / Should / Coupling | [use-repository-picker.ts:75](../../../src/fsd/features/create-project/model/use-repository-picker.ts#L75)의 초기화는 취소·초안 조회를 기다린 후 `finally`에서 `load()`를 실행한다. [요청 adapter:10](../../../src/fsd/features/create-project/api/repository-picker.ts#L10)의 타임아웃은 요청별 15,000ms다 | Observed: 독립 시작이 없음. Inferred: 초안 요청이 느리면 자동 목록 조회 시작도 늦어진다. focus·수동 reload 경로는 별도로 존재한다 |
| CC-001 / Consider / Cohesion | [gate-source.test.ts:11](../../../src/fsd/features/review-gate/model/gate-source.test.ts#L11)이 core 전체 export·RuleKind를 검사하고, feature 검사는 38행부터 별도로 시작한다 | Observed: 검사는 이미 존재하고 CI에서도 실행된다. 남은 변경은 검사 소유 위치의 분리다 |
| CC-003 / Consider / Readability | [propose-button.tsx:71](../../../src/fsd/features/propose-item/ui/propose-button.tsx#L71)의 JSX 속성에 제출 잠금부터 비동기 결과 처리·해제까지 들어 있다 | Observed: 필요한 동작은 구현되어 있다. 같은 컴포넌트 내부 핸들러 추출만 필요하다 |
| CC-004 / Consider / Readability | [briefing.ts:49](../../../src/fsd/pages/project-board/model/briefing.ts#L49)에 예외 조건과 반환 객체가 결합되고 공통 필드가 반복된다 | Observed: 표시 계약은 구현되어 있다. 조건 명명과 공통 item 구성만 정리한다 |

### 계약 대조

| 경계 | 근거와 판단 | 계획에 적용 |
| --- | --- | --- |
| 초안 취소와 현재 연결 | Observed: [store.cancel](../../../src/server/github/store.server.ts#L75)은 flow의 attempt·draft·verifier를 정리한다. [authorizedRepositories](../../../src/server/github/repositories.ts#L12)는 현재 연결을 별도로 검증한다 | 초안 취소 완료는 이미 연결된 목록 조회의 필수 선행 조건이 아니다. 서버 코드는 유지한다 |
| 폼 복원 | Observed: [NewProjectFormContents](../../../src/fsd/features/create-project/ui/new-project-form.tsx#L67)의 `locallyEdited`가 늦은 복원을 거부한다 | 먼저 도착한 목록에서 사용자가 선택·편집하면 그 입력이 나중의 초안보다 우선한다 |
| 조회·세션·취소 | Contracted: [GitHub 목록 ADR](../../ADR/0006-optional-github-repository-list.md), [선행 구현 결과](https://github.com/Sangeok/stagekeeper/blob/e5db41b584d42670b4404dcdae3ddd3196189276/docs/proposals/active/src-frontend-clean-code-review.md). Observed: `generation`, `flowGeneration`, AbortController, `retryDeadline`과 기존 브라우저 인수 경로 | 이 보호장치를 유지하며 최초 조회의 시작 순서만 바꾼다 |
| 테스트 위치 | Contracted: [테스트 소유권](../../architecture/test-organization.md), [scripts/checks 책임](../../architecture/verification.md#저장소-스크립트), [core 외부 의존 제한](../../architecture/core.md) | TypeScript AST에 의존하는 전체 계약 검사는 core 내부 대신 `scripts/checks`에 둔다 |
| UI·모델 경계 | Contracted: [FSD](../../architecture/fsd.md)의 동일 slice 내부 분리·공개 API·Action 전달 규칙 | 새 slice·공용 hook·공개 export 없이 현재 소유자 안에서 정리한다 |

### 리뷰 coverage와 채택 추적

**Full applicable-lens review — Applicable 6, N/A 0, Unavailable/Skipped 0.**

| Raw ID | 렌즈 | 최종 ID | 품질 게이트 처분 | 최종 중요도 |
| --- | --- | --- | --- | --- |
| CPL-001 | Coupling | CC-002 | accept | Should |
| COH-001 | Cohesion | CC-001 | accept | Consider |
| READ-001 | Readability | CC-003 | accept | Consider |
| READ-002 | Readability | CC-004 | accept | Consider |

Predictability·Simplicity·TypeScript generalist는 지원되는 추가 지적이 없었다.
추가 재현을 요구하는 pending-verification이나 해결되지 않은 렌즈 간 충돌은 없었다.
프런트엔드 전문 렌즈는 필요한 서버 계약을, TypeScript generalist는 서버 구현도 검토했다.
모든 테스트 본문을 전수 정독하거나 전체 동작을 실행 검증한 결과는 아니다.

## Scope

포함 범위는 네 채택 항목과 그 항목의 기존 검증 경로다. CC-002가 우선 권고이며,
Consider 세 항목은 구현 승인에서 선택할 수 있다. 선택하지 않은 항목은 그대로 남겨도
CC-002의 동작과 검증을 완료할 수 있다. 후속 구현 요청으로 네 항목 전체가 선택되었다. 승인 기록은 front matter를 따른다.

| 실행 분류 | 항목·작업 | 선택 범위의 완료 조건 |
| --- | --- | --- |
| Core | CC-002 / TASK-SFCF-01 | REQ-SFCF-001·002·003과 VFY-SFCF-01·02 및 해당 통합 검증 |
| Phase 2 — 선택적 정리 | CC-001·003·004 / TASK-SFCF-02·03·04 | 선택한 작업의 VFY-SFCF-03·04·05만 완료 범위에 추가 |
| Approval-after | 선택된 Core/Phase 2의 제품·테스트 수정 | 후속 구현 요청으로 해소; 선택 범위는 front matter를 따름 |
| Out of scope | 서버·DB·권한 정책·저장 형식·배포 변경 | 변경 금지 및 diff 확인 |

여기서 Phase 2는 선택적 작업의 실행 분류다. 독립 제품 단계나 추가 SDD를 만들지 않으며,
선택하지 않은 작업의 요구사항을 Core 완료 조건에 섞지 않는다.

### Affected Files

| 경로 | 예정 작업 | 경계와 이유 |
| --- | --- | --- |
| `src/fsd/features/create-project/model/use-repository-picker.ts` | 수정 | 최초 목록 조회 시작을 초안 복구 완료에서 분리; 동일 hook·slice 유지 |
| `tests/server/fixtures/github-picker-browser.ts` | 수정 | 취소·초안 응답을 독립적으로 보류·해제하는 제어 가능한 fixture 추가 |
| `tests/server/fixtures/src-clean-code-acceptance.ts` | 수정 | 초기 조회 순서·세션 경합·cleanup 사례를 기존 브라우저 suite에 추가 |
| `tests/server/fixtures/src-clean-code-browser.tsx` | 제한적 수정 | Core 전용 opt-in StrictMode wrapper를 renderMode에 추가; 기존 mode·라우터 double·기본 실행은 유지 |
| `src/fsd/features/review-gate/model/gate-source.test.ts` | 부분 이동 | `RuleKind` 블록과 관련 선언·import만 분리; feature 검사는 유지 |
| `scripts/checks/transitions-contract.test.ts` | 신규 제안 | 옮긴 전체 공개 계약 검사의 목적지. 아직 존재하지 않는다 |
| `src/fsd/features/propose-item/ui/propose-button.tsx` | 수정 | 컴포넌트 내부 `handlePropose` 추출 |
| `src/fsd/pages/project-board/model/briefing.ts` | 수정 | `activityItem`의 공통 필드·복합 조건을 정리 |

관찰·회귀 검증 대상으로 유지할 파일은 `new-project-form.tsx`, `repository-picker.ts`,
`github-connection-state.ts`, `briefing.test.mjs`, `project-board-page.test.mjs`,
`scripts/rehearsals/rehearse-src-clean-code.ts`, `package.json`, 현행 아키텍처다.
기존 runner·mount API로 새 fixture mode를 전달한다. runner 수정과 새 테스트 프레임워크는 필요하지 않다.

서버 구현, core 정책·타입 선언, DB schema·migration, plugin, generated 코드, 의존성·설정,
route·public API·제품 문구, 기존 제안서의 승인·완료 상태는 변경 범위 밖이다.
관찰 전용 파일의 변경이 필요해지면 해당 작업을 멈추고 범위와 이유를 먼저 대조한다.

### Source Bundle과 유지할 경계의 구체적 inventory

최초 문서 검토의 편집 대상은 이 문서 한 개였다. 후속 구현은 Affected Files의 전체 선택 범위에 한정한다. 근거 bundle은 현행 `AGENTS.md`,
`docs/architecture/{README,fsd,test-organization,verification,core}.md`, GitHub 목록 ADR,
`docs/proposals/{README,template}.md`와 아래 코드·검증 경로다. 이전 제안서는
`Implementation Results`·`Risks and Rollback`의 기존 계약·실행 한계만 참고하며 과거 구현 계획을 위임하지 않는다.

| 경계 | 정확한 유지 파일·symbol·경로 | 역할 |
| --- | --- | --- |
| 새 프로젝트 화면 | `src/app/(app)/p/new/page.tsx`; create-project의 `index.ts`, `index.server.ts`, `api/repository-picker.server.ts`, `ui/new-project-form.tsx`, `ui/repository-connection-panel.tsx` | `/p/new` → NewProjectForm, `key={userId}` → 계정별 remount, 폼/패널의 목록·복원·오류 본문 |
| 요청·schema | create-project의 `api/repository-picker.ts`, `model/github-connection-state.ts`, `model/repository-entry-state.ts`, `model/repository-selection.ts`, `model/repo-url.ts` | envelope, savedDraft/restorableDraft/repositoryPage schema, 편집 우선·선택·제출 provenance |
| 세션·연결 API | `src/app/api/github/request.ts`, `repositories/route.ts`, `connection/{cancel,draft,start,disconnect}/route.ts` | 사용자 header 검증, JSON body, GET/POST 구분, no-store·재시도·오류 결과 |
| 서버 연결 소유자 | `src/server/github/{api.server,contracts,draft-service,connection-service,store.server,repositories}.ts` | 공개 진입점, cancel/acknowledge, 현재 연결로 목록 검증. 코드·DB 동작은 유지 |
| 제안 제출 | `src/app/(app)/p/[slug]/backlog/page.tsx`, `src/fsd/pages/project-backlog/{index.ts,ui/project-backlog-page.tsx,ui/backlog-table.tsx}`, propose-item의 `index.ts`, `index.server.ts`, `api/propose-item.server.ts`, `model/propose-input.ts` | `/p/[slug]/backlog` → page → ProposeButton. 서버 Action bind·schema·권한·오류 결과 유지 |
| 활동 본문 | `src/app/(app)/p/[slug]/page.tsx`, project-board의 `index.ts`, `index.server.ts`, `api/project-board.server.ts`, `ui/project-board-page.tsx`, `model/briefing.fixture.mjs`, `model/briefing.test.mjs`, `ui/project-board-page.test.mjs` | `/p/[slug]` → loadProjectBoard → buildBriefing → 실제 Activity/Team 링크·본문·색상 |
| core·표시 소비 | `packages/core/pipeline/{transitions.mjs,transitions.d.mts,pipeline.mjs}`, `src/fsd/entities/board-item/{index.ts,model/text-budget.ts}`, `src/fsd/features/review-gate/model/gate-source.ts` | 공개 규칙과 FIELD_BUDGET/isOverBudget, slotAgent/PROJECT_AGENTS, 기존 feature 함수의 소유권 유지 |
| 실행·설정 | `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.mjs`, `scripts/build.mjs`, `.github/workflows/check.yml` | alias·설치 버전·명령·실제 build/CI 발견 경로. 모두 유지 |
| 검증 보조 | `tests/server/register-server-only.mjs`, `tests/server/fixtures/action-manifest.ts`, `tests/server/{github-action-manifest,inbox-card-boundary,project-guard}.test.ts`, `scripts/checks/verify-docs.mjs` | bootstrap, 구조화된 registry 해석, fresh 생성물 검사, 문서 검사 |

API 표의 상대 경로는 모두 `src/app/api/github/` 아래다. create-project/propose-item/project-board는
각각 위 Affected Files와 동일한 `src/fsd` slice를 가리킨다. scope 밖 OAuth callback·installation·webhook
업무는 변경하지 않지만, 기존 fresh route 검사가 확인하는 여덟 GitHub route 등록은 보존한다.

### 이동·추출의 symbol provenance와 사전 확인

| 대상 | 현재 owner / 공개 경로 | 변경 후 owner·import | 목적지 검증 |
| --- | --- | --- | --- |
| RuleKind 검사 | `gate-source.test.ts`의 두 `it`, `DECLARED`; 제품 export 아님 | 신규 `scripts/checks/transitions-contract.test.ts`; `assert`←`node:assert/strict`, `describe,it`←`node:test`, `readFileSync`←`node:fs`, `ts`←`typescript`, namespace `transitions` 및 `STATUSES,findRule,type RuleKind`←`@harness/core/pipeline/transitions.mjs` | VFY-SFCF-03의 새 블록 존재·기존 블록 부재·두 suite 실행 |
| feature 검사 | `gate-source.test.ts` → `./gate-source` | 원래 파일에 `assert,describe,it,needsHumanDecision,pendingInboxCount,reopenTargetsFor` 참조 유지 | 기존 feature assertion 유지; core 전체 AST 검사 import는 원래 파일에서 제거 |
| 제출 handler | ProposeButton의 inline onClick; `features/propose-item/index.ts` 공개 API | 같은 컴포넌트 내부 `handlePropose`; 모든 기존 import·public export 유지 | VFY-SFCF-04, public API diff |
| 활동 변환 | `activityItem`; 외부 공개되지 않음. `buildBriefing`은 같은 slice의 loader/test가 소비 | 동일 파일의 공통 item과 조건 변수; 기존 entity/core import 유지 | VFY-SFCF-05의 모델·렌더 본문 |

사전 확인: 원본 파일과 `scripts/checks/`는 존재하고, 제안 목적지 `transitions-contract.test.ts`는 없다.
구현 직전 다시 확인하고 같은 경로에 다른 작업이 생겼으면 덮어쓰지 않는다. `tsconfig.json`의
`@harness/core/*` alias와 `test:scripts`의 `.test.ts` 패턴을 그대로 사용한다.
선택적 이동 때문에 core 선언·실행 파일, FSD public API, package script를 수정하지 않는다.

## Requirements and Constraints

### REQ-SFCF-001: 연결된 계정의 최초 목록 조회

WHEN 저장소 선택기가 사용 가능하고 초기 연결 상태가 `connected`인 폼이 마운트되면,
시스템은 초기 저장소 목록 요청을 미완료 초안 취소·조회·복원 요청의 완료를 기다리지 않고 시작해야 한다.
사용자 focus·reload 이벤트를 필수 조건으로 삼지 않아야 한다.

### REQ-SFCF-002: 병행 요청의 복원·무효화

IF 세션 상실, Start over, 연결 변경 또는 unmount로 진행 중 작업이 무효화되면,
THEN 시스템은 무효화된 목록·초안 응답이 폼이나 선택 상태를 다시 채우지 않게 해야 한다.
WHEN 사용자가 초안 응답 전에 입력하거나 저장소를 선택하면, 시스템은 그 입력을 유지해야 한다.

### REQ-SFCF-003: 기존 목록 조회 상태와 재시도 정책

WHILE 목록 조회의 재시도 대기가 유효하면, 시스템은 수동·자동 목록 요청을 제한하면서
기존 세션 확인 경로를 유지해야 한다. WHEN 대기가 만료되면, 시스템은 재시도를 허용하되
만료만으로 목록 요청을 자동 생성하지 않아야 한다. 정상·빈 목록·부분 성공·오류·추가 페이지는
기존 조회 결과와 안내 계약을 유지해야 한다.

### REQ-SFCF-004: 제안 제출 동작 보존

WHEN 사용자가 제안을 제출하면, 시스템은 클릭 시점의 항목·담당자·근거·파이프라인을 캡처한
단일 요청을 보내야 한다. WHILE 그 요청이 처리 중이면 중복 제출을 막아야 하며,
성공·서버 거절·응답 미확인 후 기존 표시·입력 보존·재시도 동작을 유지해야 한다.

### REQ-SFCF-005: 활동 표시 우선순위 보존

WHEN 보드 활동을 계산하면, 시스템은 기존과 동일한 item 필드와 정렬을 반환해야 한다.
`on_hold`는 slot 실행 표시보다 우선하고, 보류가 아닌 item-bound verifier는 `done` 상태에서도
현재 cursor와 dispatched 여부에 따른 working/waiting 표시를 유지해야 한다.

### INV-SFCF-001: 연결·계정 경계

목록 조회는 서버의 현재 연결·사용자 확인을 통과하며, 초안은 동일 userKey·flowId와
현재 폼·복원 수명에 속할 때만 적용된다. 세대 값은 서로 대체하지 않는다.
`generation` ref는 목록 요청 순서, `flowGeneration` ref는 로컬 연결/복원 수명,
`RestorableDraft.generation`은 서버 `expectedRevision`으로서 acknowledge payload에 쓰는 값이다.
서버 세대 값을 로컬 ref와 직접 비교하지 않는다. 초기 `connected` 값은 서버 권한 검사를 대신하지 않는다.

### INV-SFCF-002: 초안·요청 수명

사용자 편집은 늦은 복원보다 우선한다. 초안 내부의 취소→조회 순서, 성공 복원 후 acknowledge,
세대 무효화와 요청·listener·timer 정리는 유지된다. 초안 완료 자체는 추가 목록 조회의 트리거가 아니다.

### INV-SFCF-003: 기존 기능과 검사 보존

제안 제출의 잠금·캡처·alive 검사·finally 해제 순서, 활동의 cursor/보류 우선순위,
core export·RuleKind 검사와 feature 동작 검사의 assertion 의미는 유지된다.

### CON-SFCF-001: 수정 경계

위 Affected Files의 선택한 항목만 수정한다. 새 slice·공용 hook·전역 store·public export·의존성을
추가하지 않고, 설명용 코드 주석이나 테스트 내레이션을 추가하지 않는다.

### CON-SFCF-002: 요청·저장 계약

API path·payload·envelope·쿠키·sessionStorage key와 데이터 형식·15초 요청 타임아웃은 유지한다.
권한·재시도 대기·세션 확인을 완화하거나 비공개 목록을 권한 확인 없이 재사용하지 않는다.

### CON-SFCF-003: 검증 근거

지연 응답은 기존 fixture의 제어 가능한 promise·AbortSignal로 검증한다.
실제 GitHub 장애나 고정 15초 sleep에 의존하지 않는다. 문서 검사, 소스 기준선, 구현 후 인수 결과를 구분한다.

### CON-SFCF-004: 테스트 소유권과 실행 발견

전체 core 계약 검사를 저장소 검사로 이동할 때 assertion을 유지하고,
`test:scripts`·`check`에서 발견되는 것을 확인한다. `typescript` import를 core 내부로 옮기거나
검사 편의를 위해 제품 export·아키텍처 예외를 추가하지 않는다.

## Proposal and Execution Plan

## Phase SFCF: 초기 조회 대기 해소와 선택적 정리

- satisfies: REQ-SFCF-001, REQ-SFCF-002, REQ-SFCF-003, REQ-SFCF-004, REQ-SFCF-005
- preserves: INV-SFCF-001, INV-SFCF-002, INV-SFCF-003
- governed-by: CON-SFCF-001, CON-SFCF-002, CON-SFCF-003, CON-SFCF-004
- verified-by: VFY-SFCF-01, VFY-SFCF-02, VFY-SFCF-03, VFY-SFCF-04, VFY-SFCF-05, VFY-SFCF-06

진입 조건은 BLK-SFCF-01 해소와 최신 소스·작업 트리 재확인이다. 권장 순서는
Core 초기 조회와 그 회귀 검증, 이후 Phase 2에서 선택한 국소 정리다. 각 작업은 독립적으로 되돌릴 수 있으며,
검증이 끝난 선택 작업만 완료로 기록한다. 하나의 범위로 충분하므로 별도 후속 Phase는 만들지 않는다.
일부 작업만 선택되면 그에 해당하는 요구사항만 완료했다고 보고한다.

### TASK-SFCF-01: 최초 목록 조회의 독립 시작 — CC-002

- satisfies: REQ-SFCF-001, REQ-SFCF-002, REQ-SFCF-003
- preserves: INV-SFCF-001, INV-SFCF-002
- governed-by: CON-SFCF-001, CON-SFCF-002, CON-SFCF-003
- verified-by: VFY-SFCF-01, VFY-SFCF-02, VFY-SFCF-06

현재 `useRepositoryPicker`의 초기화 effect는 `resume()`의 `finally`에서 `load()`를 호출한다.
그 결합 호출을 제거하고 같은 초기화 수명 안에서 초안 처리를 시작한 뒤, 사용 가능·초기 connected 조건에
맞는 `load()`도 별도로 시작한다. `queueMicrotask`에서 현재 effect 수명을 다시 확인한 뒤 시작하여
동기 effect 상태 갱신을 피하고, 이미 cleanup된 수명의 목록 요청은 생략한다. 초안 I/O 완료는 기다리지 않는다.
새 hook이나 별도 store로 분해할 필요는 없다. effect 정리 책임은 현재 위치에 유지한다.

`resume()` 내부의 pendingCancel→flowId 조회→restore→필요 시 취소 순서와 acknowledge effect는 유지한다.
`load()`의 응답 schema, pagination 병합, 실패 안내, `retryDeadline` 차단도 유지한다.
초안 복구가 끝나도 두 번째 자동 조회를 보내지 않는다. 연결이 없거나 기능이 꺼진 경우의
목록 자동 조회 정책을 확대하지 않는다.

양쪽 요청은 동일한 현재 사용자·폼 수명에 속한다. 어느 쪽에서든 세션 상실을 확인하면 기존
`lostSession`과 세대 무효화로 다른 쪽의 늦은 응답을 거부한다. unmount·Strict Mode effect 재실행 때
이전 요청을 정리하고 새 수명의 응답만 적용한다. 수동 reload·focus와의 경쟁은 기존 `load()`의
이전 요청 취소·generation 비교로 처리한다. 공개 controller 반환 타입과 폼 props는 바꾸지 않는다.

병행 시작에서 순서가 역전되는 두 지점은 명시적으로 보완한다. 현재 취소 응답은 성공일 때만
storage를 지우므로, 같은 수명의 취소 응답이 `UNAUTHENTICATED`이면 `lostSession`으로 연결한다.
또한 목록의 `REAUTH_REQUIRED`가 초안보다 먼저 도착하면 기존 재인증 상태·선택 해제와 함께
복원 세대도 무효화해 늦은 authorized 초안이 선택을 다시 채우지 않게 한다.
복원 effect는 시작 시 `flowGeneration`을 캡처한다. 각 await의 성공·실패·catch에서
`live && !controller.signal.aborted && flowGeneration.current === capturedFlow`를 확인한 뒤에만
storage·message·restore·lostSession 또는 다음 요청을 수행한다. draft GET의 기존 401 처리도
현재의 live 확인만으로 충분하다고 보지 않고 같은 수명 검사를 적용한다.
storage를 지울 때는 현재 값이 요청 시 캡처한 cancel ID/flow ID와 같은지도 확인한다.
목록 응답은 별도 `generation` snapshot과 해당 요청 signal로 검사한다. 목록의 REAUTH_REQUIRED는
복원 수명을 무효화하고 기존 재인증 안내·선택 해제를 적용한다. 이를 effect dependency에 새로 연결해
초기 조회를 다시 시작하거나 이미 시작된 연결 작업의 finally를 잘못 종료시키지 않는다.
새로운 권한 판정이나 공개 상태 모델은 만들지 않는다.

Start over·Manage·disconnect는 현재처럼 세대 변경과 active 목록 요청 취소로 오래된 결과 적용을 막는다.
이때 초기 복원 HTTP가 즉시 물리 중단되는 것으로 간주하지 않는다. 초기 effect의 unmount/cleanup은
그 effect의 controller와 목록 요청을 abort한다. 이미 발행된 start/disconnect/discard/acknowledge의
서버 처리를 되돌리거나 모든 HTTP를 즉시 중단하도록 확대하지 않는다. acknowledge의 서버 세대 payload와
동일 flow 확인은 유지한다. 새 테스트는 상태 무효화와 실제 요청 abort를 별도 관찰한다.

fixture 세 파일에 취소 응답 보류·해제, 구조화된 요청 기록과 opt-in StrictMode 실행을 추가한다.
기존 `requests: string[]`는 기존 사례용으로 유지하고, 새 기록은 method·pathname·query의 flowId/cursor 구분,
fixture body·request ID·abort/settled 여부를 구별한다. draft 복원 GET과 세션 probe GET을 같은 문자열로
세어 검증하지 않는다. 응답 제어는 cancel/draft/list별로 401·재인증·실패를 독립 설정할 수 있게 한다.
현재 fixture는 cancel에 즉시 성공하고 처음부터 held draft는 성공 body를 캡처하므로,
`expire()`만으로 두 방향의 늦은 401을 시험할 수 있다고 가정하지 않는다.

기본 defer는 abort를 존중한다. 별도의 테스트 전용 late-result 경로는 이미 수신한 응답의 후속 처리처럼
abort 뒤에도 결과를 정산시켜 generation guard를 독립 검증한다. cleanup으로 pending 큐를 비우는 결과만으로
제품 hook의 stale-result 방어가 검증됐다고 주장하지 않는다. remount 전에 이전 인스턴스의 release/pending
handle을 캡처해 새 전역 controls와 혼동하지 않는다. 신규 case마다 원본 fetch·storage·timer·listener와
대기 promise를 복구·정리한다.

`src-clean-code-browser.tsx`의 `renderMode`에서 Core의 명시적인 strict fixture mode에만
`React.StrictMode`를 적용한다. 기존 mode와 기본 root는 그대로 둔다. development bundle이라는 사실만으로
StrictMode가 활성화된 것은 아니다. wrapper의 setup→cleanup→setup을 관찰하며 첫 수명의 응답은 적용하지 않고
두 번째 수명은 정상 완료되어야 한다. 개발 StrictMode의 두 복원 요청 시도 중 첫 요청은 취소되고,
초기 목록 microtask는 무효화된 첫 수명에서 실행하지 않아 현재 수명의 목록 요청 1회만 발생한다.
제품 코드에 테스트 전용 export를 추가하지 않는다.

### TASK-SFCF-02: core 공개 계약 검사의 소유권 이동 — CC-001

- preserves: INV-SFCF-003
- governed-by: CON-SFCF-001, CON-SFCF-004
- verified-by: VFY-SFCF-03, VFY-SFCF-06

`gate-source.test.ts`의 `describe("RuleKind")`, `DECLARED`, 필요한 core·TypeScript·파일 읽기 import만
신규 제안 경로 `scripts/checks/transitions-contract.test.ts`로 옮긴다. 같은 파일의
`reopenTargetsFor`·`pendingInboxCount` 시험은 유지하고 이동 후 쓰이지 않는 import를 제거한다.
새 테스트는 저장소 루트에서 실행하며 기존 선언 파일 읽기 경로를 유지한다.
runtime 코드·core 타입·feature 공개 API 변경은 없다.

이동 후 기존 파일에서 `RuleKind` describe, `DECLARED`, TypeScript AST·선언 파일 읽기가 없어야 하고,
새 파일에는 동일한 두 assertion과 명시한 import가 있어야 한다. 제품 모듈에서는 새 테스트 파일을 import하지 않는다.

`package.json`의 `test:scripts`는 이미 `scripts/**/*.test.ts`를 탐색하므로 명령을 바꿀 필요가 없다.
`test:architecture`는 `.test.mjs`만 탐색하므로 새 `.test.ts`의 실행 증거를 대신하지 않는다.
현재 CI에서도 기존 검사가 실행되므로 검증 누락을 고치는 작업으로 보고하지 않는다.

### TASK-SFCF-03: 제안 핸들러 추출 — CC-003

- satisfies: REQ-SFCF-004
- preserves: INV-SFCF-003
- governed-by: CON-SFCF-001
- verified-by: VFY-SFCF-04, VFY-SFCF-06

`ProposeButton` 안에 `handlePropose`를 만들고 기존 onClick 본문을 같은 순서로 옮긴다.
JSX는 `onClick={handlePropose}`로 연결한다. `submitting` 차단·설정, 클릭 시점 input 캡처,
transition, alive 확인, `resetPipeline`, 성공 알림, catch, finally 잠금 해제를 유지한다.
새 `useCallback`, 파일, hook, public symbol은 만들지 않는다.
기존 submit·취소·roster 변경 계약을 기존 브라우저 fixture로 확인하며 구조만 복제하는 새 테스트는 쓰지 않는다.

### TASK-SFCF-04: 활동 예외 조건과 공통 결과 정리 — CC-004

- satisfies: REQ-SFCF-005
- preserves: INV-SFCF-003
- governed-by: CON-SFCF-001
- verified-by: VFY-SFCF-05, VFY-SFCF-06

`activityItem`의 공통 `item` 구성을 early return 앞에 두고, slot 존재·agent 분류를
`isProjectAgentOrVerifier` 같은 국소 변수로 명명한다. 기존 `on_hold` 제외 조건을 유지하며
`{ ...item, line, tone }` 반환을 여러 줄로 표현한다. 기존 switch보다 앞서는 위치는 유지한다.
`buildBriefing` 반환 계약, 팀 표시, 정렬, 순수성은 바꾸지 않는다. 다른 화면의 모델과 통합하지 않는다.

## Safety Analysis

| 상황 | 유지하거나 새로 확인할 결과 |
| --- | --- |
| connected + 보류된 취소/초안 | 보류 응답 해제 전에 목록 요청을 관찰하고 선택 가능한 목록을 표시한다 |
| 초안 완료 | 초기 목록 요청을 다시 보내지 않고 기존 복원·acknowledge만 처리한다 |
| 목록 성공 후 늦은 초안 | 사용자가 편집하지 않았을 때만 복원한다. 먼저 선택·편집했다면 그 입력을 유지한다 |
| 어느 요청에서든 세션 상실 | 폼을 로그인 복구 상태로 전환하고 다른 요청의 늦은 목록·초안을 적용하지 않는다 |
| Start over·연결 변경 | 현재 세대의 취소·무효화를 유지하고 오래된 응답으로 상태가 복구되지 않는다 |
| 빈 목록·부분 성공·실패 | 기존 query 상태·안내·수동 입력·pagination 정책을 유지한다 |
| 재시도 대기·만료 | 목록 요청 제한과 세션 probe를 유지한다. 만료만으로 자동 요청하지 않는다 |
| unmount·재진입·effect cleanup | 이전 요청·listener·timer를 정리하고 이전 응답을 새 폼에 적용하지 않는다 |
| 오래된 취소/draft 실패 | 이전 flow의 401·실패·catch가 새 폼의 세션·message·storage를 변경하지 않는다 |
| 목록 재인증 요구 후 늦은 초안 | 복원 수명을 무효화해 authorized 선택이 되살아나지 않는다 |
| 개발 StrictMode | opt-in wrapper의 첫 setup 요청은 cleanup/무효화되고 두 번째 setup은 완료된다. 복원은 두 시도 중 첫 수명이 취소되고, 목록 microtask는 현재 수명에서만 실행된다 |
| 제안 중 roster 변경·실패 | 제출 payload는 캡처 상태를 유지하고 재시도는 최신 표시값과 보존한 근거를 사용한다 |
| done verifier·on_hold | 기존 cursor 우선 표시와 보류 제외 규칙을 유지한다 |

변경은 현재 slice 내부와 테스트 소유 위치에 제한된다. 라우팅, dynamic import, barrel export,
정적 자산 URL, ambient 타입, API·저장 형식은 바뀌지 않는다. 초기 목록 요청의 발생 시점만 앞당겨지며
서버의 연결 검사와 요청 예산을 우회하지 않는다. 변경 전후 동작 확인 없이 보안·성능 개선으로 확대해 보고하지 않는다.

### Final Artifact Map

| 최종 노출물 | 결정하는 소스·우선순위 | 본문·의존성 | 최종 확인 위치 |
| --- | --- | --- | --- |
| `/p/new`의 목록·폼 | route → create-project public API → NewProjectForm의 sessionExpired/등록 결과/일반 폼 순서 | schema로 검증한 목록과 사용자 편집이 초안보다 우선; public 목록과 authorized 목록의 기존 결합, hidden repository provenance, 패널 안내 | VFY-SFCF-01·02의 실제 DOM·FormData·요청 기록; 기존 폼/패널 단위 시험 |
| `/p/[slug]/backlog` 제안 | route의 서버 Action bind → page의 canWrite/row 상태 → ProposeButton | 캡처 payload, pending 버튼, 실패 문구·입력, 성공 후 닫힘. 서버 schema·Action은 유지 | VFY-SFCF-04의 기존 브라우저 propose mode와 `project-guard.test.ts` |
| `/p/[slug]` Activity | loadProjectBoard → buildBriefing → ProjectBoardPage | line/tone/pipelineName/key/status/overBudget, 실제 링크·색상·Team. core slot 규칙과 entity 표시 API 유지 | VFY-SFCF-05의 모델 출력과 `project-board-page.test.mjs` 렌더 본문 |
| 이동한 core 계약 검사 | test:scripts → 신규 `.test.ts`; feature 검사는 test:web에 남음 | transitions runtime export와 `.d.mts`의 이름·RuleKind 집합; 중복 실행 블록 부재 | VFY-SFCF-03의 양쪽 목적지·실행 결과 |
| Next 연결 산출물 | 기본 `npm run build` → app/client/Action manifests | NewProjectForm·ProposeButton client 진입점, createProject·proposeItem Action과 GitHub route 등록. 모델·loader는 원격 Action 아님 | VFY-SFCF-06의 fresh registry 구조 검사와 client module/chunk 존재 확인 |

새 URL·메타데이터·다운로드·폰트·정적 자산은 만들지 않는다. 기존 app 전역 자산은 기본 build의
의존성으로 유지한다. `.next`는 검증 산출물이며 직접 수정하지 않는다. UI-only 번들은 Next 서버·provider를
double로 대체하므로 실제 인증 성공이나 GitHub 통신의 증거가 아니며, 제품 본문 동작과 연결 산출물 검증을 구분한다.

## Verification Plan

아래는 구현 전 작성한 VFY 계획이다. 실행 결과는 Implementation Results의 VFY별 증거를 따른다.

### VFY-SFCF-01: 초안 지연과 최초 조회의 독립성

- verifies: REQ-SFCF-001
- 종류·위치: 기존 브라우저 component/acceptance fixture의 두 파일에 사례 추가.
- 준비: connected 계정에 pendingCancel 또는 flowId를 심고, 각각 cancel 응답·draft 응답을 해제 전까지 보류한다.
- 실행·관찰: focus·수동 reload 없이 마운트하고, 보류 promise가 열린 상태에서 `GET /api/github/repositories`와
  목록 표시를 확인한다. 이후 초안을 해제해도 그 완료 때문에 두 번째 목록 요청이 생기지 않아야 한다.
  연결 없음·기능 OFF에서는 초기 목록 요청이 생기지 않아야 한다.
- 제어: 기존 `githubControls.requests`, `defer`, `pendingCount`를 확장한다. 실제 15초 sleep을 사용하지 않는다.
- 추가 관찰: 최초 목록으로 선택한 항목이 DOM과 hidden `repositorySource/repositoryId/installationId/repositoryPage/connectionRevision`에
  반영되는지 확인한다. 초기 요청 완료 후 user action이 없는 상태에서 초안 해제가 추가 목록 요청을 만들지 않아야 한다.

### VFY-SFCF-02: 세션·편집·취소·재시도 대기 회귀

- verifies: REQ-SFCF-002, REQ-SFCF-003
- 종류·위치: `github-picker-browser.ts`와 `src-clean-code-acceptance.ts`.
- 신규 사례: 목록을 먼저 표시해 사용자가 선택한 뒤 초안을 해제해도 입력이 보존되는지 확인한다.
  목록 401 뒤 늦은 초안, 초안 401 뒤 늦은 목록 두 순서를 각각 확인한다.
  목록 성공 뒤 같은 수명의 취소 401은 로그인 복구로 전환하고, 목록 재인증 요구 뒤 늦은 authorized
  초안은 선택을 복원하지 않아야 한다. 오래된 수명의 실패 응답은 새 수명에 적용하지 않는다.
  Start over·연결 변경·unmount 이후 보류 응답을 해제해도 상태가 되살아나지 않고 pending 요청이 정리되어야 한다.
- 기존 회귀: `private newer edits beat restoration`, `private session-loss restoration race`,
  `private canceled loading settles`, cooldown·operation·unmount 사례와 목록 오류·pagination을 유지한다.
  ready 외 empty·partial 응답은 기존 schema에 맞는 fixture 응답으로 표시·선택 결과를 확인한다.
- 성공 기준: 변경된 순서에서 새 실패가 없고, 세션 확인과 retry deadline·사용자 편집 우선 계약이 함께 성립한다.
- 취소 범위: Start over·Manage·disconnect는 늦은 결과 적용 금지를 검사하고, 초기 effect unmount는 abort 여부도 검사한다.
  일반 defer와 abort 뒤 정산 가능한 late-result double을 각각 사용한다. 모든 요청에 즉시 pending=0을 요구하지 않고
  개별 작업의 release/abort 후 정리와 Finish 후 잔여 0을 구분한다.
- StrictMode: `src-clean-code-browser.tsx`의 opt-in wrapper를 development 실행에서 확인한다.
  첫 setup의 abort·stale 결과 거부, 두 번째 setup의 목록 완료, cleanup 후 listener/timer 잔여 부재를 검증한다.
  초기 자동 목록 조회는 모든 모드에서 현재 수명의 1회다. strict development의 복원 요청 두 시도와 첫 수명 취소를 별도로 확인한다.
- 명시적 실패 매트릭스: pending cancel 401, draft GET 401, list 401, list REAUTH_REQUIRED,
  cancel/draft/list의 실패·잘못된 body, abort, 정상·empty·partial·pagination 각각을 해당 schema와 연결해 관찰한다.
  `expire()`는 새 요청의 인증만 바꾸므로 이미 보류된 응답의 결과는 endpoint별 release 설정으로 제어한다.

### VFY-SFCF-03: 이동한 계약 검사와 feature 검사 보존

종류는 공개 계약·테스트 발견 검사다. CON-SFCF-004와 INV-SFCF-003을 확인하며 제품 요구사항을 새로 만들지 않는다.

```bash
node --import tsx --test scripts/checks/transitions-contract.test.ts src/fsd/features/review-gate/model/gate-source.test.ts
npm run test:scripts
```

두 RuleKind assertion과 기존 feature assertion이 모두 실행·통과해야 한다.
옮긴 AST 검사의 core runtime export 대조와 RuleKind 전체 집합 대조가 약화되지 않았는지 diff로 확인한다.
새 경로는 구현 시 생성할 예정이므로 현재 이 명령의 실행 결과는 없다.
추가로 TypeScript AST로 양쪽 파일의 describe 제목·`DECLARED` 선언·import moduleSpecifier·파일 읽기 호출을
검사해 새 목적지 존재와 기존 목적지 부재를 확인한다. 모든 항목은 위 symbol provenance 표를 기준으로 하며
단순히 새 파일이나 테스트 성공만 확인하지 않는다. feature의 세 함수는 원래 `./gate-source`에서 계속 가져와야 한다.

### VFY-SFCF-04: 제안 핸들러 동작 보존

- verifies: REQ-SFCF-004
- 종류·위치: 기존 `src-clean-code-acceptance.ts`의 `propose roster same instance`, `propose pending error`,
  `propose pending unknown`과 `src-clean-code-browser.tsx`의 기존 propose mode.
- 관찰: 단일 캡처 요청, pending 중 중복 제출 억제, roster 변경과 입력 보존, 실패 후 최신 값 재시도,
  성공 후 닫힘을 확인한다. 코드 대조로 `resetPipeline`·alive·finally 순서도 보존한다.
- 구조 기준: JSX에는 이름 있는 핸들러 연결만 남고 별도 공유 추상화는 추가하지 않는다.

### VFY-SFCF-05: 활동 모델 출력 보존

- verifies: REQ-SFCF-005
- 종류·위치: 기존 `src/fsd/pages/project-board/model/briefing.test.mjs`와 `ui/project-board-page.test.mjs` 전체.
- 관찰: done 상태의 item-bound verifier, dispatched 대기·실행, 보류, 기존 정렬과 입력 불변 사례가 통과한다.
  분기 조건의 의미와 실행 우선순위는 변경 전후 diff로 함께 확인한다.

```bash
node --import tsx --test src/fsd/pages/project-board/model/briefing.test.mjs src/fsd/pages/project-board/ui/project-board-page.test.mjs
```

### VFY-SFCF-06: 선택 작업의 통합 검증과 저장소 경계

- verifies: REQ-SFCF-001, REQ-SFCF-002, REQ-SFCF-003, REQ-SFCF-004, REQ-SFCF-005
- 종류: 관련 behavior 검증의 통합 실행과 lint·type·architecture·build 검사.
- 기준: 아래 정적 명령만으로 행동 요구사항을 증명하지 않는다. 선택 작업의 앞선 VFY 결과와 브라우저 사례를 함께 기록한다.

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm run test:web
npm run test:server
npm run build
```

기본 build 완료 후 관련 생성물 시험을 명시적으로 활성화한다. zsh에서 다음 형태로 실행한다.
flag 없이 실행한 server 시험의 skip은 fresh 검사 통과가 아니다.

```bash
RDC_CHECK_ACTION_MANIFEST=true SRC_CHECK_INBOX_MANIFEST=true GITHUB_CHECK_ACTION_MANIFEST=true npm run test:server
```

이 명령의 기존 검사 소유자는 `tests/server/{github-action-manifest,inbox-card-boundary,project-guard}.test.ts`와
다른 기존 RDC opt-in 시험이다. GitHub 검사는 `createProject` 등록, server/github·repository-picker loader의 Action 부재,
start/callback/installation/draft/cancel/disconnect/repositories/webhook 여덟 route를 확인한다.
기존 전체 mutation·금지 모듈 검사를 완화하지 않고 `proposeItem` 등록도 유지한다.

추가 읽기 전용 산출물 확인은 `.next/server/app/(app)/p/new/page_client-reference-manifest.js`와
`.next/server/app/(app)/p/[slug]/backlog/page_client-reference-manifest.js`를 기존 manifest 시험과 같은
격리 VM 방식으로 해석한다. 각 `__RSC_MANIFEST`의 `clientModules`가 object인지 확인하고 각각
`src/fsd/features/create-project/ui/new-project-form.tsx`, `src/fsd/features/propose-item/ui/propose-button.tsx`가
존재해야 한다. 현재 Next 산출물의 `chunks` 값은 `/_next/static/chunks/…js` 형태의 공개 URL이다.
각 URL의 pathname이 `/_next/static/chunks/`로 시작하는지 확인하고, `/_next/` 접두사를 제거한
`static/chunks/…js`를 `.next/`에 연결해 실제 파일 존재를 검사한다. URL 전체를 `.next/`에 단순 연결하지 않는다.
예를 들어 `/_next/static/chunks/example.js`의 로컬 목적지는 `.next/static/chunks/example.js`다.
이 이름은 매 build마다 바뀌므로 예시 filename을 고정하지 않고 manifest 값을 해석한다.
`use-repository-picker.ts`나 `handlePropose`가 독립 client module로 등록돼야 한다고 요구하지 않는다.
manifest의 node/edge/worker와 client module을 구조적으로 확인하며 암호화 key나 전체 registry를 로그로 출력하지 않는다.
실제 본문·버튼·payload의 검증은 Final Artifact Map의 DOM·모델 검증으로 수행한다.

CC-002 또는 CC-003을 선택하면 기존 UI-only 리허설을 production/development 모드에서 순차 실행한다.

```bash
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only --fixture-development
```

각 모드에서 `http://127.0.0.1:55452/fixture?mode=copy&autorun`의 suite를 실행하고
`http://127.0.0.1:55452/results`의 사례별 결과를 보존한다. 두 서버를 동시에 실행하지 않는다.
Finish 버튼으로 React root·fetch·storage·보류 응답·timer·listener를 정리하고 `/finish`로 종료를 확인한다.
development 재실행에서도 이전 요청이나 전역 fixture 상태가 남지 않아야 한다.
Core만 선택하면 같은 URL에 `&private-only`를 붙여 기존 선택적 private suite와 새 Core 사례를 실행할 수 있다.
CC-003을 선택하면 전체 suite의 propose 사례도 실행한다. 단순 `--fixture-development` 실행과
새 opt-in StrictMode 사례의 결과를 따로 기록한다.

같은 환경에서 변경 전 기준선을 확보하고 신규 실패와 기존 실패를 분리한다.
선행 제안서는 로컬 브라우저에서 기존 pipeline fixture 실패 11건과 native 창 전환 미검증을 기록한다.
이는 과거 기록이며 현재 결과로 복사하지 않는다. 새 대상 사례는 모두 통과해야 하고 기존 실패를 조용히 skip하지 않는다.
이 fixture는 실제 GitHub·운영 DB·Next RSC 네트워크 인수의 대체 증거가 아니다.

명령 분류: 위 build·test·UI 리허설은 구현 후 실행할 `manifest-only` 계획이며 이번 문서 대조에서 실행하지 않는다.
`npm run check`는 typegen과 scripts 시험, `build`는 Prisma generate와 Next 출력을 만든다.
UI-only는 esbuild `write:false` 번들과 localhost 서버를 사용하며 DB 분기 전에 반환한다.
문서 validator·파일 목록·읽기 전용 AST/JSON 해석만 이번 정합성 검토의 실행 증거로 사용한다.

### Definition of Done

- 선택한 Core/Phase 2 작업과 Affected Files만 바뀌었고, 권한·API·저장 형식·public export·제품 문구·설정은 보존했다.
- Core는 최초 목록 독립 시작, 초안 완료 후 추가 조회 부재, 양방향 늦은 실패·재인증·편집 우선·세대 구분을 확인했다.
- Core의 production/일반 development와 opt-in StrictMode 결과, 요청 abort와 stale-result 방어, cleanup 결과를 구별해 남겼다.
- 선택한 테스트 이동은 새 검사 존재·옛 블록 부재·두 실행 경로를, handler/활동 정리는 payload와 최종 화면 본문을 확인했다.
- 선택 작업의 모든 VFY와 공통 경계·타입·build·fresh 생성물 검사를 실행했다. 이전 실패·환경 제한·skip은 별도 기록했다.
- `git diff --name-only`와 미추적 파일 목록을 allowlist에 대조했다. 유지 대상으로 명시한 route/API/schema/barrel/설정에는 변경이 없다.
- 미선택 항목이나 실제 외부 GitHub·운영 DB·배포를 완료로 계산하지 않았다.

### 추적 표

| 요구사항·제약 | 완료 소유 작업 | 검증 |
| --- | --- | --- |
| REQ-SFCF-001 | TASK-SFCF-01 | VFY-SFCF-01, VFY-SFCF-06 |
| REQ-SFCF-002, REQ-SFCF-003 | TASK-SFCF-01 | VFY-SFCF-02, VFY-SFCF-06 |
| CON-SFCF-004, INV-SFCF-003의 검사 소유권 | TASK-SFCF-02 | VFY-SFCF-03, VFY-SFCF-06 |
| REQ-SFCF-004 | TASK-SFCF-03 | VFY-SFCF-04, VFY-SFCF-06 |
| REQ-SFCF-005 | TASK-SFCF-04 | VFY-SFCF-05, VFY-SFCF-06 |

## Approval and Readiness

### BLK-SFCF-01: 구현 범위 승인 — 해소

- 분류: `current-phase`; 상태: 해소.
- 최초 중지 조건은 제품·테스트 소스 수정 전 구현 범위 확인이었다.
- 후속 구현 요청으로 네 항목을 모두 선택했으며 승인 기록은 front matter에 보존한다.
- 코드 수정 전 최신 문서·소스·검증 경로를 다시 확인한다. 실행 결과는 아래 기록과 분리해 추가한다.

기술적 정합성 검토를 완료한 계획이며, 실행 권한의 차단도 해소되었다.
문서 계획 자체의 완료를 구현·검증 완료로 간주하지 않는다.

구현 시 최신 checkout·계약·작업 트리를 재확인한다. 전제와 다른 소스, 서버 권한·저장 형식 변경 필요,
무효화/편집 보존 회귀, 테스트 실행 경로 불일치를 발견하면 해당 작업에서 멈추고 근거를 기록한다.
미선택 항목, 후속 Phase, 배포·main 승격을 자동으로 시작하지 않는다.

## Verification Results

### 이전 리뷰의 실행 증거

아래는 최초 리뷰 기준에서 실행한 결과다. 관련 소스가 동일함을 확인했지만 새 기준의 전체 검사 재실행으로 표기하지 않는다.

| 명령 | 당시 결과 | 의미 |
| --- | --- | --- |
| `npm run verify:fsd` | Pass | FSD 기준선 |
| `npm run verify:server` | Pass | 서버 모듈 경계 기준선 |
| `./node_modules/.bin/tsc --noEmit --incremental false` | Pass | 당시 타입 검사 |
| `./node_modules/.bin/eslint src --no-cache` | Pass | 당시 src lint |

Review-mode substantiation은 품질 게이트가 추가 실행을 요구하지 않아 미실행이다.
위 결과는 이번 제안의 구현 회귀나 브라우저 지연 측정 결과가 아니다.

### 최초 문서 작성 시 검증

- 추적성 입력 bundle은 이 문서 한 개다. 외부 자료는 근거 링크이며 이번 canonical ID를 정의하지 않는다.
- standard validator와 `--format json` 검사를 실행해 ID·관계·참조를 확인한다.
- strict는 승인 전·실행 차단 상태의 제안이므로 선택하지 않는다. 요구사항별 작업·검증의 의미는 별도로 대조한다.
- 새 미추적 Markdown을 포함한 저장소 상대 링크·front matter 검사와 whitespace 검사를 수행한다.
- 최초 문서 작성 시 구현 VFY는 모두 Planned였으며 제품 코드·테스트·기존 문서 변경은 없었다.

2026-10-28 최초 작성본의 문서 검증 결과(이번 대조 수정 전 이력):

| 확인 | 실제 결과 |
| --- | --- |
| 설치된 `write-sdd-spec/scripts/validate_sdd_traceability.py`의 standard·JSON 검사 | Pass — 오류·경고 0, REQ 5 / INV 3 / CON 4 / TASK 4 / VFY 6 / BLK 1, 요구사항의 작업·검증 연결 5/5 |
| `npm run docs:check` | Pass — 기존 추적 문서 165개, 상대 링크 847개, 테스트 보고서 54개 |
| `inspectDocs`에 새 파일을 명시적으로 포함한 검사 | Pass — 문서 166개, 상대 링크 863개, 테스트 보고서 54개, 오류 0 |
| `parseFrontMatter` 기반 상태·승인 null·related 대상 확인, 새 파일 whitespace 확인 | Pass |

validator 실행 경로는 `/Users/hamsangeok/.codex/skills/write-sdd-spec/scripts/validate_sdd_traceability.py`이며
입력은 `docs/proposals/active/src-frontend-clean-code-follow-up.md` 한 개였다.
의미 검토에서는 EARS의 관찰 가능성, 선택 작업의 완료 범위, 세션·재인증과 응답 순서,
테스트 소유권·실행 발견, 미실행 검증의 구분을 대조했다. 문서 작성으로 구현 VFY를 통과 처리하지 않았다.

## Implementation Results

### 구현 범위와 기준

- CC-001–004 / TASK-SFCF-01–04 전체를 구현했다. 기준 HEAD는 `e5db41b584d42670b4404dcdae3ddd3196189276`다.
- 수정한 제품·fixture 7개 파일의 `git diff --binary`와 신규 `scripts/checks/transitions-contract.test.ts` 내용을 결합한
  검증 패치 SHA-256은 `1f5875b058a6f7fcee5634269643802fdc5b6f775f82bf7433a92e56e4bf6949`다. 이 문서는 포함하지 않는다.
- TypeScript 클린 코드·파일명 규칙과 기존 FSD 경계를 적용했다. 서버·core 정책·schema·public API·dependency·설정은 변경하지 않았다.
- 작업 중 이전 제안서가 별도 작업으로 `completed/2026-10-28-src-frontend-clean-code-review.md`로 이동했다.
  그 변경은 보존하며 별도 작업의 이동 파일은 이번 PR에 포함하지 않는다. 선행 자료 링크는 검토 기준 commit의 원문에 고정해 독립적인 PR에서도 유효하게 유지한다.

| 항목 | 실제 결과 | 직접 근거 |
| --- | --- | --- |
| CC-002 | 초안 복구와 초기 목록 조회를 독립 시작. 현재 effect 수명을 검사하는 microtask에서 목록을 시작해 동기 effect 상태 갱신을 피함 | 목록은 취소/초안 응답 전에 도착하며 초안 완료에 따른 추가 조회가 없음 |
| CC-002의 보호 경로 | 모든 복원 await 뒤 현재 flow·signal·live 확인, 취소 key 비교, 취소 401과 목록 재인증 결과의 무효화, 목록의 aborted 응답 거부 | 늦은 성공·401·네트워크 실패, Start over·Manage·disconnect·unmount, 재인증·편집 보존 사례 |
| CC-001 | RuleKind 전체 계약 검사 두 건을 `scripts/checks/transitions-contract.test.ts`로 이동 | TypeScript AST printer 비교로 원래 describe 본문 동일, 원래 파일의 해당 suite·contract 전용 import 부재, 두 실행 경로 통과 |
| CC-003 | 같은 ProposeButton 안으로 handlePropose 추출 | 기존 onClick block과 새 handler block의 AST printer 출력 동일; 기존 propose 브라우저 사례 유지 |
| CC-004 | activityItem의 공통 item과 agent 분류 조건을 분리 | 모델·렌더 테스트에서 cursor·보류·정렬·본문·입력 불변 보존 |

StrictMode의 첫 effect는 정리 전에 복원 요청을 시작할 수 있지만 초기 목록 microtask는 이미 무효화된
첫 수명에서 실행하지 않는다. 따라서 development strict 사례는 복원 요청 두 시도와 첫 요청 취소,
현재 수명의 목록 요청 1회를 구분해 확인한다. production·일반 development도 초기 목록 요청은 1회다.
이 처리 방식과 검증 기준은 위 TASK·VFY에 함께 반영했다.

### 자동 검증

| 실행 | 결과 |
| --- | --- |
| 이동한 계약·feature 및 briefing 모델·렌더 집중 시험 | 64 pass, 0 fail |
| `npm run verify:fsd`, `npm run verify:server` | Pass |
| 변경 파일 ESLint와 전체 `npm run lint` 단계 | Pass; 기존 plugin `_key` unused 경고 1개 유지 |
| `tsc --noEmit --incremental false`, 이후 `next typegen && tsc --noEmit` | Pass |
| `npm run test:architecture` | 167 pass, 2 platform skip, 0 fail |
| `npm run test:scripts` | 216 pass, 2 platform skip, 0 fail |
| `npm run test:web` | 778 pass, 0 fail; RuleKind 두 검사는 scripts로 이동 |
| 기본 `npm run test:server` | 158 pass, 2 manifest opt-in skip, 0 fail |
| `npm run build` | 최종 기본 Turbopack production build Pass |
| fresh build 후 세 manifest flag를 지정한 `npm run test:server` | 168 pass, 0 skip, 0 fail |
| 새 프로젝트·Backlog client manifest와 chunk 파일 | 두 entry 및 각 4개 chunk 모두 구조·존재 확인 Pass |
| 실제 작업 트리의 추적·미추적 존재 파일을 사용한 `inspectDocs` | Pass — 166 Markdown, 863 상대 링크, 54 test reports |

최초 작업 트리의 `npm run check` 전체 명령은 lint·경계 검사 후 docs 단계에서 중단됐다. 별도 작업으로 이동된
이전 제안서의 옛 경로가 아직 Git index에 남아 있어 `verify-docs`의 `git ls-files` 기반 읽기가
ENOENT로 실패한 것이다. 그 파일을 복원하거나 타 작업을 stage하지 않았다. 실제 존재하는 작업 트리 파일로
동일한 `inspectDocs`를 실행했고, 이후 typegen·TypeScript·scripts 시험도 개별 실행해 통과했다.
따라서 전체 명령 자체를 Pass로 표기하지 않는다.

최초 web 시험과 build는 샌드박스의 localhost 포트 제한으로 실패했다. 승인된 환경에서 web 시험은 통과했다.
빌드는 승인된 재실행에도 기존 실패 캐시를 재사용해 같은 오류를 냈다. `.next/cache`를 임시 경로에
보존해 분리한 뒤 동일한 기본 build가 성공했고 그 산출물로 fresh manifest 검증을 수행했다.
설정 변경이나 lint·manifest 검사 완화는 없었다.

### 최신 dev 기준 PR 인계 검증

후속 commit·PR 요청으로 최신 `origin/dev`의 `35363d7b7f46d41b3e36ed1d1400c2f68b746465`에서
`harness/src-clean-code-follow-up-20261028`을 만들고 이번 변경 9개 파일만 반영했다.
원래 작업 트리의 별도 문서 이동은 포함하지 않았으며 선행 자료는 기준 commit 링크로 고정했다.
제품·fixture·계약 테스트 8개 파일은 구현 검증본과 바이트 동일하다.

- `npm run check`: **Pass** — lint·FSD·서버 경계·추적 문서 검사·typegen·TypeScript, scripts 218 pass / 2 platform skip / 0 fail.
- `npm run test:web`: **779 pass, 0 fail**. 최초 sandbox 포트 제한 후 승인된 환경에서 재실행했다.
- `npm run test:server`: **158 pass, 2 manifest opt-in skip, 0 fail**.
- 문서·traceability 재확인 후 commit·push·`dev` 대상 PR을 생성한다. 병합·main 승격·배포는 수행하지 않는다.

이 결과로 최초 작업 트리에서 중단됐던 aggregate check의 인계 검증을 닫는다.
아래 브라우저 기준선·신규 회귀와 앞의 production build·fresh manifest 결과는 구현 검증 기록으로 보존한다.

### 브라우저 인수

기존 UI-only runner를 사용해 변경 전후 production/development 각각을 실행했다.

| 모드 | 변경 전 | 변경 후 | 신규 사례 | 기존 통과 사례의 신규 실패 |
| --- | --- | --- | --- | --- |
| production | 82 pass, 11 fail / 93 | 113 pass, 11 fail / 124 | 31/31 pass | 0 |
| development | 82 pass, 11 fail / 93 | 113 pass, 11 fail / 124 | 31/31 pass | 0 |

두 모드의 기존 실패 11건은 case 이름과 observed 내용까지 변경 전후 동일했다.
대상은 기존 pipeline page permission/default, pending success/error/stale/unknown,
project switch success/error/stale/unknown, zero-gate 사례다. 이번 코드나 시험을 바꿔 숨기지 않았다.

신규 사례는 취소/초안 대기와 무관한 목록 시작, 초안 내부 취소→조회 순서, acknowledge의 서버 세대,
빠른 목록 선택 후 편집 보존, 양방향 세션 상실, 취소 401, 재인증 후 늦은 초안,
Start over 뒤 오래된 실패·새 cancel key 보존, Manage 뒤 aborted 응답 정산,
해제 뒤 늦은 초안, 실패·잘못된 envelope/value·네트워크 예외, OFF/미연결/empty/partial,
unmount 후 요청·listener 정리와 실제 opt-in StrictMode다.

모든 실행은 Finish로 root·fetch·storage·보류 promise·timer·listener를 정리하고 서버 종료를 확인했다.
실제 GitHub·운영 DB·서비스 배포는 실행하지 않았다. 검증 결과 JSON은 작업 중 임시 파일로 보존해
변경 전후 case/status/observed를 비교했으며, 이 절의 집계와 기존 실패 구분이 durable 기록이다.

| 검증 ID | 최종 증거 |
| --- | --- |
| VFY-SFCF-01·02 | 신규 31개 브라우저 사례 두 모드 통과, 기존 private suite 퇴행 0 |
| VFY-SFCF-03 | 두 suite 실행 및 AST 동일성·원래 위치 부재 확인 |
| VFY-SFCF-04 | handler AST 동일성·기존 propose 사례 통과 |
| VFY-SFCF-05 | briefing 모델·실제 렌더 본문 시험 통과 |
| VFY-SFCF-06 | 개별 정적/타입/시험/build/fresh 생성물 통과; aggregate check의 문서 index 제한은 위에 명시 |

## Risks and Rollback

- 병행 시작으로 늦은 초안과 먼저 도착한 목록이 만나는 순서가 늘어난다. 두 방향의 세션 상실과
  사용자 선택·편집 우선 사례를 필수 회귀로 다룬다. 실제 운영 지연 빈도나 개선 시간을 추정하지 않는다.
- Strict Mode cleanup 또는 초기화 dependency 변경으로 중복 조회·취소가 생길 수 있다.
  이전 수명 응답을 버리는 조건을 유지하고 production/development 양쪽 결과를 남긴다.
- 테스트 이동은 발견 경로를 바꾼다. 새 검사 실행과 기존 feature assertion 보존을 함께 확인한다.
- 롤백은 선택 작업별 변경을 되돌린다. 초기 조회는 기존 직렬 시작으로 복구할 수 있고 저장 데이터 migration은 없다.
  계약 테스트 이동을 되돌릴 때는 기존 블록·import와 새 파일 제거를 함께 처리해 검증이 사라지거나 중복되지 않게 한다.
  핸들러·활동 모델은 해당 국소 변경만 되돌린다.

## Completion or Closure Notes

네 항목의 코드 변경과 관련 검증을 완료하여 [제안서 수명주기](../README.md)에 따라 완료 기록으로 이동했다.
기존 pipeline fixture 실패 11건과 별도 문서 이동의 index 문제는 Implementation Results에 구분했다.
최초 구현 검증 시점에는 실제 GitHub·운영 DB 인수, commit·push·PR·병합·배포를 수행하지 않았다. 후속 요청으로 이번 변경의 commit·push·dev 대상 PR 생성을 진행한다. 병합·배포는 포함하지 않으며 별도 작업 변경은 보존한다.

## Reconciliation Notes

2026-10-28 첫 정합성 대조에서 개선할 점이 있었다. 채택된 네 항목과 우선순위는 유지했고,
실행 지침의 다음 누락을 한 묶음으로 보완했다.

| 첫 대조의 누락 | 반영한 해소 내용 |
| --- | --- |
| 선택 작업이 공통 Phase·검증의 전체 완료와 섞일 여지 | Core/Phase 2/Approval-after/out-of-scope와 선택별 DoD 명시 |
| 로컬 목록·복원 세대와 서버 acknowledge 세대의 구분 및 실패 guard가 모호 | 세 세대의 역할, await 이후 성공·실패·catch·storage 비교, 실제 abort와 상태 무효화의 차이 명시 |
| development fixture가 StrictMode 검증을 제공하는 것처럼 읽힘 | opt-in wrapper 파일을 허용 목록에 추가하고 실제 setup/cleanup 재실행 관찰을 요구 |
| fixture가 지원하지 않는 취소 지연·held 401·늦은 결과를 전제 | endpoint별 결과 제어·구조화 기록·abort 후 정산 double·인스턴스별 cleanup 설계 |
| 테스트 이동의 import provenance·옛 위치 부재 확인이 부족 | 정확한 import·선언·assertion owner와 원본/목적지 preflight·AST 확인 추가 |
| 최종 본문·생성 연결과 확인할 목적지가 충분히 구체적이지 않음 | route→public API→본문 표, 활동 렌더 시험, fresh registry flag·client module/chunk 확인 추가 |

수정본의 다음 대조에서는 실제 client manifest의 chunk 값이 파일 상대 경로가 아니라
`/_next/` 공개 URL임을 확인해 로컬 `.next/static/chunks/`로 변환하는 검증 절차를 추가했다.
이는 문서 수정이므로 그 뒤 저장본 전체를 다시 수정 없이 검토해야 한다.

검토 근거는 위 source bundle·inventory·runtime matrix·Final Artifact Map·검증 명령이다.
이 수정 직후에는 clean pass를 주장하지 않는다. 최종 상태는 최신 저장본을 다시 읽고 INV-1–INV-6,
Coverage Stability, INV-7을 모두 수정 없이 확인한 뒤 응답의 anchor/receipt로 남긴다.
그 결과는 계획의 정합성에 대한 것이며 아직 실행하지 않은 구현 VFY의 통과를 뜻하지 않는다.

## Review Checklist

- [x] 이전 승인·구현 이력과 이번 네 발견 사항을 구분했다.
- [x] 사실·계약·추론, 현재 동작 보존과 실제 변경을 구분했다.
- [x] 요구사항·작업·검증의 소유권과 선택 범위를 연결했다.
- [x] 초기 조회의 병행 시작과 세션·초안·재시도·cleanup 경합을 명시했다.
- [x] 기존 runner·fixture·테스트 위치와 실행 명령을 확인했다.
- [x] 구현 미승인·미실행과 검토 기준선 통과를 구분했다.
- [x] 추적성·상대 링크·front matter·whitespace 검사와 의미 대조를 완료했다.
