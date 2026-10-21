---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-10-21"
updated-at: "2026-10-21"
approved-by: "user:Sangeok"
approved-at: "2026-10-21"
approval-scope: "Core FSD-CC-001·002·003과 Phase 2 FSD-CC-004·005의 실제 코드 수정·관련 검증. 후속 사용자 요청으로 커밋·push·dev 대상 PR 생성까지 포함한다. 병합·배포는 포함하지 않는다"
completed-at: null
verification-summary: "Core 001·002·003과 Phase 2 004·005 구현. Phase 2의 check·web 732·fresh manifest server 148·격리 worktree 기본 build 통과. production/development의 새 메뉴 5건·토큰 10건 모두 통과. Core의 core/plugin 435·격리 DB integration 기록 유지. 원래 Desktop 경로의 기본 build는 EPERM. 전체 UI suite는 각 54 pass/11 기존 fail로 gate 미충족"
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
  - "docs/conventions/product-copy.md"
---

# src/fsd 프런트엔드 클린 코드 검토 및 개선 제안

## Summary

`src/fsd` 전체를 `frontend-clean-code-orchestrator`의 다섯 독립 렌즈와 별도 중립 품질 검토로 확인했다.
최종 개선 항목은 **Should 3건, Consider 2건**이다. Must로 판단할 근거는 확인하지 못했다.
토큰 발급 복구 흐름의 중복, 실행 조회·표시 기준의 분산, 다른 slice 내부 구현에 결합된 테스트를 먼저 개선한다.
후속 코드 정합화에서 기존 Board 회귀 계약을 확인했다. 실행 조회의 소유권은 모으되,
Board의 활동 표시와 배너의 현재 cursor 표시는 서로 다른 기준을 그대로 유지한다.

| 우선순위 | ID | 개선 항목 | 기여 렌즈 |
| --- | --- | --- | --- |
| Should | FSD-CC-002 | 실행 조회 소유권 통합과 표시 기준의 명시 | Cohesion, Coupling |
| Should | FSD-CC-001 | 세 토큰 발급 폼의 상태·응답 유실 복구 통합 | Cohesion |
| Should | FSD-CC-003 | 다른 slice 내부 파일·import 표기에 결합된 테스트 개선 | Coupling |
| Consider | FSD-CC-004 | 삽입 메뉴 상태의 sentinel 의미 명시 | Readability |
| Consider | FSD-CC-005 | 대기 항목을 포함하는 `working` 이름 명확화 | Readability |

초기 산출물은 검토와 제안서였다. 현재 승인 범위는 Core 3개 항목과 추가 요청한 Phase 2의 2개 항목 구현·검증이다.
초기 기준선과 실제 구현 후 검증 결과는 아래에서 별도로 기록한다.

## Goal

- 같은 변경을 여러 구현에 반영해야 하는 비용과 누락 위험을 줄인다.
- 기존 테스트가 보장하는 화면별 실행 표시 기준을 유지하면서 조회 소유권을 명확하게 한다.
- 공개 동작을 보존한 내부 리팩터링이 관계없는 slice의 테스트를 깨뜨리는 범위를 줄인다.
- 지역 상태와 이름은 실질적인 읽기 비용이 확인된 곳만 개선한다.

## Proposal Size

`proposal-size: standard`. 후속 구현은 여러 feature와 page의 공개 export·소비 경로를 조정하고,
서버의 공개 조회 계약과 테스트 소유권에 영향을 준다. core 정책은 변경하지 않는다.
문서 한 파일을 추가하는 현재 작업과 이후의 코드 변경 규모를 구분한다.

정합화 Review Profile은 **High-Risk**다. 토큰 발급의 외부 효과·평문 보존·응답 유실 복구와
공통 조회의 표시 계약·이동 후 검증 목적지를 다루기 때문이다. 이는 proposal-size와 별도 분류다.

## Current State

### 검토 기준과 범위

- 기준 커밋: `c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a` — 검토 시작 시 최신 `origin/dev`.
- 검토 전 작업 커밋 `32bb2b3`과 위 커밋의 `src/fsd`·설정·아키텍처 문서 내용은 같다.
- 작업 브랜치: `harness/fsd-clean-code-review`.
- 환경: Node `26.4.0`, Next.js `16.3.3`, React `19.2.8`, TypeScript `5.9.3`, `strict: true`.
- Next.js App Router·RSC 구조와 Action prop 주입은 저장소의 현재 계약을 기준으로 판단했다.
  버전에 민감한 경계·오류 전달 판단은 설치된 `node_modules/next/dist/docs/`와 실제 소비 코드를 대조했다.

| Layer | 파일 | 테스트 파일 | 줄 |
| --- | ---: | ---: | ---: |
| pages | 68 | 17 | 3,245 |
| widgets | 28 | 9 | 1,818 |
| features | 117 | 29 | 4,387 |
| entities | 33 | 9 | 906 |
| shared | 31 | 9 | 694 |
| 합계 | **277** | **73** | **11,050** |

각 렌즈는 위 전체 범위를 독립적으로 읽었다. public API, 운영 코드, 테스트와 fixture를 포함한다.
소스 위치의 줄 번호와 근거 permalink는 위 기준 커밋에 대응한다. 이동·삭제된 초기 파일도 해당 커밋에서 확인한다.

### 검토 방식과 coverage

다섯 렌즈를 각각 별도 에이전트의 독립 컨텍스트로 실행했다. 실행 용량에 맞춰 나누어 실행했으며,
앞선 렌즈 결과를 다음 렌즈에 제공하지 않았다. 별도 중립 품질 검토가 원시 지적 6개를 평가했고,
실행 귀속 판정의 중복 지적은 권고의 소유 위치를 수정한 뒤 하나의 canonical 항목으로 통합했다.

**Coverage: Full applicable-lens review — applicable 5, gate-validated N/A 0.**

| 렌즈 | 최종 상태 | 채택 기여 |
| --- | --- | --- |
| Cohesion | Completed | FSD-CC-001, FSD-CC-002 |
| Coupling | Completed | FSD-CC-002, FSD-CC-003 |
| Predictability | No supported findings | 추가 채택 항목 없음 |
| Readability | Completed | FSD-CC-004, FSD-CC-005 |
| TypeScript generalist | No supported findings | 추가 채택 항목 없음 |

Unavailable·Skipped 렌즈와 사람의 판단이 필요한 미해결 충돌은 없다.
TypeScript generalist는 타입·오류뿐 아니라 VAR/FN/OBJ/ERR/ASYNC/FMT/CMT/TS/TEST/REACT의 관련 범위를 검토했다.
서버 Action을 prop으로 전달하는 구조나 가장 가까운 오류 경계로 전달되는 rejection을 그 자체로 문제로 분류하지 않았다.

## Scope

포함 범위는 `src/fsd` 전체의 응집도·결합도·예측 가능성·가독성과 관련 TypeScript/React/Next.js 규칙이다.
아키텍처 문서·설정·설치된 프레임워크 문서·직접 소비 계약은 판단 근거로 대조했다.

`src/app`, `src/server`, `packages/core` 전체에 대한 별도 감사는 수행하지 않았다.
아래 서버 경로는 FSD 개선에 필요한 구체 조회 계약이며 전면 재설계 대상이 아니다. core는 기존 정책 참조만 유지한다.
현재 요청은 Core 코드 구현과 관련 검증을 포함한다. 제품 의존성·DB schema 변경, 커밋·PR·병합·배포는 포함하지 않는다.

후속 구현 분류는 다음과 같다. Should/Consider의 원래 우선순위를 유지한다.

| 분류 | 항목 | 완료 범위 |
| --- | --- | --- |
| Core | FSD-CC-001·002·003 | 이 문서의 필수 구현·검증·DoD 대상 |
| Phase 2 | FSD-CC-004·005 | 초기 선택 개선에서 추가 사용자 요청으로 구현 범위에 포함. VFY-004·005로 별도 검증 |
| Out of scope | 실행 표시 기준 변경, 토큰 권한·발급 정책 변경, core/plugin 배포 모듈 변경 | 기존 회귀 계약을 바꾸는 작업은 이 제안으로 실행하지 않는다 |

구현 근거 bundle은 이 문서, related의 아키텍처·문구 문서 중 해당 경계·검증 절,
아래 구체 목록과 그 문단에서 명명한 코드·설정·검증 명령이다. 외부 과거 제안서에 구현 결정을 위임하지 않는다.

## Proposal

### Should — FSD-CC-002: 실행 조회 소유권 통합과 표시 기준의 명시

**기여 렌즈: Cohesion, Coupling. 확신도: High — 정적 판정 차이와 중복 소유권.**

근거 위치:

- [project-board.server.ts:20](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/pages/project-board/api/project-board.server.ts#L20), 같은 파일 28·30·32줄.
- [turn-data.server.ts:58](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/widgets/turn-banner/api/turn-data.server.ts#L58), 같은 파일 59·72줄.
- 관련 서버 계약: [run-service.ts:234](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/server/pipeline/run-service.ts#L234), 같은 파일 235줄.
- 보존할 회귀 계약: [project-page-loaders.test.ts:13](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/tests/server/project-page-loaders.test.ts#L13), 같은 파일 54줄.

Board는 열린 keyed AgentRun을 `key + agent`로 모아 `keyedMatch`를 계산한다.
`pipelineRunId + pipelineEntryId` 결속은 key가 없는 project agent의 보조 경로에만 적용한다.
Turn banner는 `slots-v1`에서 item/project agent 모두 현재 run·entry·dispatcher에 결속된 실행을 찾는다.
서버의 다음 실행 조회도 현재 run·entry를 조건으로 제한한다.

`project-page-loaders.test.ts`는 다른 run·entry의 keyed 실행도 **legacy와 slots-v1 모두 Board 활동으로 표시**하도록 명시한다.
따라서 두 adapter의 조건 차이를 오류로 간주하거나 모든 `dispatched` 값을 같게 만드는 것은 잘못된 구현 지시다.
**해당 입력의 실제 운영 도달 가능성과 빈도는 확인하지 않았고, 운영 오표시를 재현하지 않았다.**
Should의 근거는 조회·판정의 소유권 분산과 서로 다른 기준이 이름에 드러나지 않는 변경 위험이다.

이번 구현은 서버 조회로 경로를 확정한다. 새 `src/server/pipeline/current-execution-query.ts`에 DB 주입형
`loadExecutionFacts(db, projectId, items)`를 두고 `src/server/pipeline/api.ts`에서 명시적으로 공개한다.
`items`는 기존 `latestBoard` 결과에서 만든 `{ id, key, agent, updatedAt }` 목록이다.
`ExecutionItem`·`ExecutionFacts` 타입은 서버 `contracts.ts`가 소유한다.
각 결과는 `boardItemId`, 원래 cursor 값인 `cursorNode`, `activityDispatched`, `turnDispatched`, `handoff`를 가진다.

새 query는 `PrismaClient`를 `@/generated/prisma/client`에서 type-only로 가져오고,
`ExecutionItem`·`ExecutionFacts`는 같은 모듈의 `./contracts`에서 type-only로 사용한다.
DB singleton·인증 초기화·runtime API·`server-only`·`use server`를 도입하지 않아 `pipeline/api.ts`의 주입형 경계를 유지한다.
기존 core helper와 `handoffIsLive`의 실제 출처·이동 후 import는 아래 Symbol 표를 따른다.

- `activityDispatched`: 현재 Board의 `keyedMatch || nullKeyBoundMatch`를 그대로 옮긴다.
- `turnDispatched`: 현재 배너의 `isSlotRun ? boundRun !== undefined : keyedMatch`를 그대로 옮긴다.
- `handoff`: 배너의 기존 legacy keyed 최신 step·시간 조건과 slot bound run·시간 조건을 그대로 옮긴다.
  step은 기존처럼 `accepted: true | null`, `at desc`, `take: 1`로 읽는다.
- 열린 cursor·AgentRun 조회는 `projectId`·`closedAt: null`로 제한한다. 기존 배열 순서와 첫 일치 선택을 유지하고
  정렬·transaction·snapshot 일관성 보장을 새로 도입하지 않는다. cursor 누락 시 기존의 null 처리도 유지한다.

Board는 `activityDispatched`, 배너는 `turnDispatched`·`handoff`를 소비한다.
gate/node의 화면 투영, pipeline 이름, runner·failure·token·workspace 조회와 표시 모델은 기존 소유처에 둔다.
`nextFor`의 key·run·entry 검증과 오류 동작은 수정하지 않는다. 이 API를 화면 조회에서 호출하거나
`ensureRun`으로 실행을 생성하지 않는다. `packages/core`·`plugin/lib` 변경과 새 원격 Action은 필요 없다.

완료 기준은 동일 입력에서 **각각 기존 계약과 일치하는 것**이다.
slots-v1의 다른 entry keyed 실행은 Board `true`·배너 `false`를 유지해야 한다.
보존할 차이를 지우려고 기존 테스트의 기대값을 반대로 바꾸지 않는다.

### Should — FSD-CC-001: 토큰 발급 상태와 응답 유실 복구 통합

**기여 렌즈: Cohesion. 확신도: High.**

근거 위치:

- [new-token-form.tsx:13](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/features/manage-token/ui/new-token-form.tsx#L13), 같은 파일 21·33·71줄.
- [new-owner-token-form.tsx:13](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/features/manage-token/ui/new-owner-token-form.tsx#L13), 같은 파일 21·33·71줄.
- [new-user-token-form.tsx:13](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/features/manage-user-token/ui/new-user-token-form.tsx#L13), 같은 파일 21·33·71줄.

세 폼이 같은 `IssuedToken`, `IssueState`, `ISSUE_UNKNOWN`을 각각 선언하고,
UTC 만료 파싱, 제출 상태 전이, 이전 토큰 보존, 거절·응답 미확인 시 refresh 흐름을 반복한다.
프로젝트·사용자 발급 폼은 컴포넌트 이름 외의 구현이 같고, owner 폼의 차이는 reveal·URL·일부 문구다.

응답 유실 복구나 이전 토큰 보존 계약을 수정할 때 세 구현을 함께 찾아야 한다.
현재 오작동을 입증한 것은 아니지만, 발급 결과를 확인할 수 없는 상황의 처리 변경을 일부 scope에서 놓칠 위험이 있다.

발급 UI의 상태·제출·복구를 `features/manage-token` 안의 한 책임으로 모은다.
scope별 서버 Action과 reveal 구성은 별도 책임으로 유지해 주입한다.
사용자 토큰 page가 통합된 발급 UI의 public API를 소비하게 하고, feature끼리 직접 import하지 않는다.
기존 `manage-user-token`의 이름 변경·서버 기능까지 일괄 통합할 이유는 없다.

구체적인 이동 경로는 다음으로 고정한다.

- 새 `features/manage-token/ui/token-issuance-form.tsx`의 내부 `TokenIssuanceForm`이
  `IssuedToken`·`IssueState`·`ISSUE_UNKNOWN`, 만료 파싱, 제출·복구 state와 공통 form을 소유한다.
- 기존 `NewTokenForm`·`NewOwnerTokenForm` 파일은 얇은 client wrapper로 유지한다.
  label placeholder, 제출 버튼, MCP URL과 `TokenReveal`/`OwnerTokenReveal` 선택은 wrapper가 전달한다.
  reveal 렌더 callback이 필요하면 client wrapper 내부에서만 만들고 서버 page가 일반 함수를 넘기게 하지 않는다.
- `features/manage-token/index.ts`는 기존 symbol을 유지하고 `NewTokenForm`을 `NewUserTokenForm`으로도 명시적 재수출한다.
  공통 내부 form과 상태는 외부로 공개하지 않는다.
- `pages/user-tokens/ui/user-tokens-page.tsx`는 `NewUserTokenForm`을 `manage-token` public API에서 가져오고,
  `RenameUserTokenForm`은 계속 `manage-user-token`에서 가져온다.
- `features/manage-user-token/index.ts`의 기존 발급 export와 `ui/new-user-token-form.tsx`를 제거한다.
  해당 `ui/token-name.test.ts`의 발급 assertion은 `manage-token/ui/token-names.test.ts`로 옮긴 뒤 옛 테스트 파일을 제거한다.
  feature 테스트끼리 같은 layer의 다른 slice를 import하는 대체 방식을 쓰지 않는다.
- `tests/server/fixtures/src-clean-code-browser.tsx`의 세 발급 form import를 `manage-token` public API로 바꾼다.
  `CopyFixture`와 `TokenIssuanceFixture`의 hs/hu/ho 인스턴스와 props는 유지한다.
- Core 검증으로 `tests/server/fixtures/src-clean-code-acceptance.ts`에 `token independent instances` 사례를 추가한다.
  기존 token 사례는 scope마다 다시 mount하므로 여러 form의 응답 순서·값 격리를 검증하지 않는다.
  같은 mount의 두 form에 다른 만료를 넣고 요청별 `controls.finishAction` callback을 각각 보관해 역순으로 정산한다.
  한 form의 성공·거절·응답 유실이 다른 form의 이전 token·만료·alert를 덮어쓰지 않고 자동 요청을 만들지 않는지 검사한다.
  실제 프로젝트 화면에 함께 있는 hs/ho와 fixture의 hu도 포함한다. transition의 pending 종료 순서에 새 보장을 추가하지 않으며
  기존 `cleanup`과 보류 callback 정리 방식을 재사용한다. 이 사례는 Phase 2 메뉴 변경과 무관하게 Core에서 실행한다.

완료 기준은 세 scope 모두 성공·명시적 거절·응답 미확인·이전 토큰과 만료값 보존을 동일하게 검증하는 것이다.
Refresh list가 mutation을 다시 보내지 않고, 발급 결과를 잃었다고 자동 재발급하지 않는 계약을 유지한다.

### Should — FSD-CC-003: 다른 slice 내부 구조에 결합된 테스트 개선

**기여 렌즈: Coupling. 확신도: High.**

근거 위치:

- [plugin-install.test.ts:24](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/shared/config/plugin-install.test.ts#L24), 같은 파일 38·42·43·44줄.
- [docs-copy.test.ts:83](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/pages/docs/ui/docs-copy.test.ts#L83), 같은 파일 84·85·86줄.

shared 설정 테스트가 상위 entity의 `connect-command.ts`, `token-reveal.tsx`를 경로로 읽고
import binding 목록과 정확한 한 줄 import 문법을 요구한다.
Docs 테스트도 다른 feature의 `gate-text.ts`, `acceptance-failure.tsx`를 직접 읽어
identifier 부재와 정확한 import 문법을 검사한다.

공개 API와 렌더 결과가 같아도 내부 파일 이동이나 import 줄바꿈이 shared·Docs 테스트를 깨뜨린다.
공통 값의 소유권을 지키려는 목적은 타당하지만, 현재 방식은 내부 리팩터링의 영향 범위를 불필요하게 넓힌다.
이 의존성은 파일 읽기로 형성되므로 정적 import 경계 검사 통과만으로 확인할 수 없다.

동작 검증은 책임을 소유한 slice에서 공개 계약·렌더 결과를 대상으로 유지한다.
다른 slice의 비공개 파일 경로와 import 줄바꿈을 동작 계약에서 제외한다.
symbol의 단일 소유권 검사는 `scripts` 아키텍처 검사 책임에 좁게 배치하고,
AST를 사용해 줄바꿈·binding 표기 변화에 독립적으로 만든다. 기존 소유권 검증을 단순 삭제하지 않는다.

이번 구현에서는 `scripts/frontend-contract-owners.test.mjs`로 소유권 assertion을 옮긴다.
현재 `test:architecture`의 `scripts/*.test.mjs` 패턴에 포함되므로 package script를 추가하지 않는다.
TypeScript AST와 현재 tsconfig의 module resolution을 사용해 공개 경로에서 선언까지 추적한다.
private 파일명, import의 줄바꿈·alias·추가 binding의 수를 계약으로 고정하지 않는다.

| symbol | 허용 소유자·공개 경로 | 보존할 실제 소비처 |
| --- | --- | --- |
| `PLUGIN_ID`, `PLUGIN_MARKETPLACE`, `installCommands` | `shared/config/plugin-install` unit만 선언·공개 | `entities/project-token/model/connect-command.ts`, `ui/token-reveal.tsx`, `pages/docs/model/docs-facts.ts` |
| `ACCEPTANCE_CHECK_LABELS` | `entities/pipeline` slice가 선언하고 `entities/pipeline/index.ts`가 공개 | `features/review-gate/ui/acceptance-failure.tsx`, `pages/docs/model/docs-facts.ts`, `ui/docs-copy.test.ts` |

아키텍처 시험은 위 공개 경로의 실제 export, 소비 binding의 출처, 소유 범위 밖 중복 선언·재수출과
wildcard 우회를 검사한다. 같은 slice 내부 파일을 옮기고 public API를 갱신한 경우와
import를 여러 줄·alias로 쓴 경우는 허용한다. 잘못된 소유자·복제·재수출은 거부하는 메모리 fixture도 둔다.
FSD의 기존 방향·deep import 검사는 계속 `verify:fsd`가 담당한다.

완료 기준은 공개 계약이 같은 import 표기 변경이 관련 없는 테스트를 실패시키지 않으면서,
설치 명령·인수 확인 문구와 값의 소유권 회귀는 계속 검출하는 것이다.

### Consider — FSD-CC-004: 삽입 메뉴 상태의 의미 명시

**기여 렌즈: Readability. 확신도: High.**

근거: [pipeline-rail.tsx:26](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx#L26), 같은 파일 62·124·138~141줄.

`openEdge: string | null | false`에서 `false`는 닫힘, `null`은 끝 위치 메뉴 열림,
문자열은 해당 step 앞 메뉴 열림이다. 서로 다른 두 falsy 값의 의미를 사용처를 함께 읽어 복원해야 한다.
현재 동작 오류를 주장하는 항목은 아니다.

같은 파일에서 `{ kind: "closed" } | { kind: "open"; before: string | null }`처럼 표현한다.
기존 `movesFor`의 `before: null` 계약은 유지한다. 파일 이동이나 새 hook은 필요 없다.
메뉴의 끝 위치 열기·특정 step 앞 열기·토글 닫기를 기존 UI 검증으로 확인한다.

### Consider — FSD-CC-005: 대기 항목을 포함하는 이름 명확화

**기여 렌즈: Readability. 확신도: High.**

근거: [turn.ts:108](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/widgets/turn-banner/model/turn.ts#L108), 같은 파일 109·110·163·174·182·183줄.
기존 [turn.test.ts:168](https://github.com/Sangeok/stagekeeper/blob/c1d83230aadd395f4f5e3cb2ccd42ad8b60beb3a/src/fsd/widgets/turn-banner/model/turn.test.ts#L168), 같은 파일 175·209·263줄도 대기 항목의 포함 범위를 확인한다.

`working` 필터는 `dispatched`를 조건으로 요구하지 않는다.
`workingLine`도 미실행 항목과 인수 대기를 별도로 표현하므로 실제 의미는 실행 중인 항목보다 넓다.
지역 이름만 보고 포함 범위를 오해하면 필터와 formatter를 추가로 추적해야 한다.

변수와 formatter를 `sessionWorkItems`, `sessionWorkLine`처럼 현재 범위가 드러나는 이름으로 바꾼다.
필터·반환값·제품 문구는 그대로 유지한다. 지역 이름 변경을 위해 새 테스트를 만들 필요는 없으며 기존 배너 검증으로 확인한다.

## Affected Files

아래는 후속 구현의 정확한 목록이며 현재 코드 변경 목록이 아니다. 경로는 저장소 루트 기준이다.

| 분류 / ID | 경로 | 작업 |
| --- | --- | --- |
| Core / 002 | `src/server/pipeline/current-execution-query.ts` | 생성: 주입형 `loadExecutionFacts` |
| Core / 002 | `src/server/pipeline/contracts.ts`, `src/server/pipeline/api.ts` | 타입 소유·함수 명시적 export. `api.server.ts`는 유지 |
| Core / 002 | `src/server/pipeline/current-execution-query.test.ts` | 생성: 각 표시 기준·handoff·조회 무쓰기·격리 검증 |
| Core / 002 | `src/fsd/pages/project-board/api/project-board.server.ts` | 공통 조회와 `activityDispatched` 소비 |
| Core / 002 | `src/fsd/widgets/turn-banner/api/turn-data.server.ts` | 공통 조회와 `turnDispatched`·handoff 소비 |
| Core / 002 | `tests/server/project-page-loaders.test.ts`, `src/fsd/widgets/turn-banner/api/turn-data.test.ts` | 실제 adapter 연결과 기존 표시·failure·runner 계약 검증 |
| Core / 001 | `src/fsd/features/manage-token/ui/token-issuance-form.tsx` | 생성: 공통 내부 form·로컬 상태 |
| Core / 001 | `src/fsd/features/manage-token/ui/new-token-form.tsx`, `src/fsd/features/manage-token/ui/new-owner-token-form.tsx` | client wrapper로 변경 |
| Core / 001 | `src/fsd/features/manage-token/index.ts`, `src/fsd/features/manage-user-token/index.ts` | 새 위치의 사용자 발급 alias 공개·옛 발급 export 제거 |
| Core / 001 | `src/fsd/features/manage-user-token/ui/new-user-token-form.tsx`, `src/fsd/features/manage-user-token/ui/token-name.test.ts` | 제거 |
| Core / 001 | `src/fsd/features/manage-token/ui/token-names.test.ts`, `src/fsd/pages/user-tokens/ui/user-tokens-page.tsx`, `src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts` | 발급 assertion·공개 alias·page 연결 갱신 |
| Core / 001 | `tests/server/fixtures/src-clean-code-browser.tsx` | 세 발급 import의 public API 소비·hs/hu/ho fixture 보존 |
| Core / 001 | `tests/server/fixtures/src-clean-code-acceptance.ts` | 같은 mount에서 발급 응답을 역순 정산하는 필수 상태 격리 사례 추가. 기존 token 사례 보존 |
| Core / 003 | `src/fsd/shared/config/plugin-install.test.ts`, `src/fsd/pages/docs/ui/docs-copy.test.ts` | 소유권 assertion만 이동하고 값·본문 검증 유지 |
| Core / 003 | `scripts/frontend-contract-owners.test.mjs` | 생성: 공개 경로·실제 선언·소유권 및 허용/거부 fixture |
| Core / 002·003 | `docs/architecture/server.md`, `docs/architecture/verification.md` | 새 공개 조회와 변경한 검사·검증 범위 기록. 아키텍처 예외 추가 없음 |
| Phase 2 / 004 | `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` | 지역 메뉴 상태 표현 변경 |
| Phase 2 / 004 | `tests/server/fixtures/src-clean-code-acceptance.ts` | 기존 UI fixture에 끝·특정 위치 열기/닫기/선택 후 닫힘 사례 추가 |
| Phase 2 / 005 | `src/fsd/widgets/turn-banner/model/turn.ts` | 지역 변수·formatter 이름 변경 |

생성 대상 4개는 정합화 시 존재하지 않았고 부모 디렉터리는 모두 존재했다. 제거 대상 2개는 존재한다.
구현 전 같은 검사를 반복하고 충돌 파일이 생겼으면 덮어쓰지 않는다.
신규 테스트 확장자는 기존 runner가 찾는 `.test.ts`·`.test.mjs`로 유지한다.
`src/`·`src/app/` 바로 아래에 테스트나 테스트 전용 디렉터리를 만들지 않는다.

### Symbol 이동과 소비 경로

| symbol | 현재 소유·공개 | 변경 후 소유·공개와 소비 | 검증 |
| --- | --- | --- | --- |
| `IssuedToken`, `IssueState`, `ISSUE_UNKNOWN`, 제출 handler | 세 발급 form의 비공개 구현 | `manage-token/ui/token-issuance-form.tsx` 한 곳. 두 client wrapper가 상대 경로로 사용 | VFY-001: 세 복제 제거·공통 구현에서 hs/hu/ho 상태 검증 |
| `NewTokenForm`, `NewOwnerTokenForm` | 각 form → `manage-token/index.ts` | 공개 이름·props 유지, 내부 form으로 위임. project page의 import 유지 | VFY-001·006 |
| `NewUserTokenForm` | `manage-user-token/ui/new-user-token-form.tsx` → 해당 `index.ts` | `manage-token/index.ts`에서 `NewTokenForm as NewUserTokenForm`. user page·browser fixture가 이 API 사용 | VFY-001: 새 alias 렌더·옛 파일/export/import 부재 |
| `RenameUserTokenForm`, 사용자 발급·폐기·이름 Action | 기존 `manage-user-token` API | 기존 소유·공개 경로 유지 | VFY-006: Action·라우트·rename 변경 없음 |
| `parseTokenExpiryInput`, `ActionResult` | `@harness/core/token-validity.mjs`, `@/fsd/shared/api/result` | 공통 form이 같은 공개 경로에서 사용. wrapper의 별도 만료 파싱 제거 | VFY-001: invalid Action 0회·UTC·기존 성공/실패 타입 |
| `TokenReveal`, `OwnerTokenReveal` | `@/fsd/entities/project-token` | 각 client wrapper가 같은 public API 사용; 공통 form은 주입받은 reveal만 표시 | VFY-001·006: hs/hu/ho의 서로 다른 본문·URL·copy lock 유지 |
| React `useState`·`useTransition`, Next `useRouter`, `Button`·`Field`·`Input` | React, `next/navigation`, 기존 `shared/ui/button`·`shared/ui/field` unit | 공통 form이 같은 공개 경로에서 사용. 서버 callback·전역 state로 변환하지 않음 | VFY-001·006: 잠금·state·refresh·client 경계 |
| `loadExecutionFacts`, `ExecutionItem`, `ExecutionFacts` | 신규 | 함수는 `current-execution-query.ts` → `pipeline/api.ts`, 타입은 `pipeline/contracts.ts`. 두 FSD api adapter가 public API 사용 | VFY-002: 실제 DB 주입·adapter 연결·서버 공개 경계 |
| `dispatcherFor`, `slotAgent`, `PROJECT_AGENTS`, `SLOT_FORMAT`, `isGateId` | 기존 두 adapter의 `@harness/core/pipeline.mjs` import | 새 query가 같은 core 공개 모듈에서 사용. adapter는 gate/node 투영에 필요한 `isGateId`를 유지하고 이동한 판정 전용 import만 제거 | VFY-002: 기존 predicate 결과 보존·tsc·경계 검사 |
| `handoffIsLive`, `PrismaClient` | 배너의 `pipeline/api.ts` 공개 helper → `src/server/pipeline/run-rules.ts`; DB client 타입은 `@/generated/prisma/client` | 새 query는 내부 helper를 `./run-rules`로, DB 타입을 generated 경로의 type-only import로 사용. `handoffIsLive`의 기존 public export는 다른 소비자를 위해 유지 | VFY-002·006: handoff 시간 경계·주입형 API 초기화 closure |
| 설치 상수 3개·`ACCEPTANCE_CHECK_LABELS` | 기존 unit·entity public API | 구현·공개·제품 소비처 유지, 소유권 검사만 `scripts`로 이동 | VFY-003: 새 검사 발견·옛 assertion 부재·본문/명령 유지 |
| 메뉴 상태·`workingLine` | rail·turn 모델의 지역 symbol | Phase 2에서만 같은 파일의 지역 표현·이름 변경 | VFY-004·005 |

### 보존할 소비처와 진입점

아래 파일은 계약 대조·회귀 검증 대상이다. 위 변경 목록에 없는 파일을 정리 목적으로 함께 수정하지 않는다.

- 토큰 라우트: `src/app/(app)/p/[slug]/tokens/page.tsx`, `src/app/(app)/settings/tokens/page.tsx`.
  각각 `requireProjectOwner`/`requireUser` 뒤 기존 Action을 주입한다. 두 feature의 `api/manage-*.server.ts`와 `index.server.ts`는 유지한다.
- 토큰 표시: `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx`, 같은 폴더의 `project-tokens-page.test.ts`,
  `src/fsd/entities/project-token/ui/token-reveal.tsx`, `owner-token-reveal.tsx`, `token-reveal.test.ts`.
  연결 명령은 `entities/project-token/model/connect-command.ts`와 `shared/config/plugin-install.ts`가 계속 소유한다.
- 실행 조회 진입점: `src/app/(app)/p/[slug]/page.tsx`, `layout.tsx` → 기존 `loadProjectBoard`/`loadTurn` public server API.
  `src/server/pipeline/run-service.ts`의 `nextFor`, `run-service.test.ts`의 fail-closed 조건은 유지한다.
- 검증 지원: `tests/server/fixtures/src-clean-code-acceptance.ts`, `tests/server/token-issuance-bindings.test.ts`,
  `tests/server/server-public-api.test.ts`, `src/fsd/pages/project-board/model/briefing.test.mjs`,
  `src/fsd/pages/project-board/ui/project-board-page.test.mjs`, `src/fsd/widgets/turn-banner/model/turn.test.ts`,
  `src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs`.
- 실행 도구: `scripts/rehearse-src-clean-code.ts`, `scripts/rehearse-account-usage-and-tokens.ts`,
  `tests/server/register-server-only.mjs`, `scripts/test-server-integration.mjs`.
  `package.json`의 test glob, `tsconfig.json`의 alias, `next.config.mjs`는 유지한다.

## Safety Analysis

- layer 방향과 public API는 현재 [FSD 규칙](../../architecture/fsd.md)을 유지한다.
  토큰 UI를 통합할 때 page가 조합하고 같은 layer feature끼리 연결하지 않는다.
- 실행 조회와 명명된 두 표시 기준은 서버의 주입형 읽기 계약이 소유한다.
  서버→FSD 의존, 일반 조회 함수의 원격 Action 전환, 페이지 조회 시 쓰기를 만들지 않는다.
- 발급 Action의 인증·인가·scope별 endpoint, 일회성 토큰 표시와 기존 복구 문구를 보존한다.
  공통화 과정에서 state를 전역으로 올리거나 토큰을 영구 저장하지 않는다.
- 테스트 소스 검사를 줄일 때 단일 소유권·문구·렌더 결과의 검증 목적은 유지한다.
  [검증 문서](../../architecture/verification.md)의 검사 범위와 실제 테스트 명령이 달라지면 함께 갱신한다.
- 정적 URL·DB schema·라우팅·플랜 정책·외부 SDK를 바꾸는 제안은 없다.
  공개 export가 바뀌는 항목은 구현 시 실제 소비처와 fixture 참조를 다시 검색한다.
- 설명 주석을 추가하는 대신 이름·타입·구조로 의도를 표현한다.

### Runtime 계약

| 경계·입력 | 보존할 전이·결과 | 검증 목적지 |
| --- | --- | --- |
| 발급 초기·잘못된 만료 | 로컬 idle. invalid는 거절 문구만 표시하며 Action 호출 0, 이전 토큰 보존 | 공통 form·VFY-001 |
| 유효 제출·pending | label/UTC 만료를 한 번 포착해 Action 1회. 입력·발급 버튼 잠금, 이전 값은 Previous token | 실제 hs/hu/ho fixture |
| 성공·명시적 거절·응답 유실 | 성공만 새 값·만료로 대체. 거절은 서버 error, 유실은 기존 unknown 문구; 두 실패는 목록 refresh 1회 | 실제 form·Action double 및 VFY-006 |
| Refresh list·명시적 재시도 | refresh는 GET만 수행. 재시도는 사용자 제출 시만 새 요청. 자동 발급·이름 기반 폐기 없음 | `/results`의 payload·refresh 횟수 및 실제 Next `/state` |
| refresh·navigation | Next refresh가 영향을 받지 않은 client state를 보존함을 이용. form key를 목록 수·만료로 바꾸지 않음. route unmount 뒤 평문 복구·영구 저장 없음 | Next `use-router.md`의 refresh 규칙·실제 route 인수 |
| 여러 발급 인스턴스·역순 응답 | 같은 mount에서 각 form의 token·만료·alert를 격리. 다른 form의 응답이나 실패가 값을 바꾸거나 재요청하지 않음. pending 종료 순서의 새 보장은 없음 | Core VFY-001의 `token independent instances`·기존 fixture cleanup |
| legacy keyed 실행 | Board·배너 모두 기존 key+dispatcher 판정. binding의 유무로 새 제한을 넣지 않음 | VFY-002 |
| slots-v1 keyed 실행 | Board는 다른 run/entry도 기존 활동으로 인정. 배너는 현재 run·entry·dispatcher만 인정 | 기존 Board loose-keyed 사례 + 공통 조회·배너 사례 |
| slots-v1 null-key project 실행 | Board는 project agent·entry 존재·정확한 결속을 요구. 배너는 기존 bound-run 조건 유지 | VFY-002: 다른 project/agent/entry·closed·missing case |
| gate·accept·cursor 누락·handoff | gate와 accept는 dispatch하지 않음. legacy/slot handoff의 step·시간 조건, cursor 누락 및 acceptance failure 처리 유지 | 공통 조회와 실제 adapter 검증 |
| 조회 권한·수명 | route 권한 검사 후 읽음. 새 조회는 쓰기·Action·캐시·timer·listener를 만들지 않음. 기존 `nextFor` 형식 오류와 호출 경계의 권한 처리 유지 | VFY-002·006 |
| Phase 2 메뉴 | closed/끝/특정 step 앞을 명시. 토글·선택 후 닫힘, readonly·busy 차단 유지 | VFY-004의 실제 client fixture |

새 form은 요청 취소·자동 재시도·전역 registry를 도입하지 않는다. reveal의 copy lock·client 선택 초기화는 기존 entity가 계속 소유한다.
기존 UI fixture의 router는 refresh 횟수만 세는 double이므로 실제 RSC state 보존을 증명하지 못한다.
그 경계는 VFY-006의 fresh build·실제 Next 화면으로 따로 확인한다.

### 최종 산출물과 본문 의존성

| 최종 표면 | 변경 후 최종 소스·우선순위 | 본문 의존성 | 검증 |
| --- | --- | --- | --- |
| `/settings/tokens` 발급·이전 값·복구 | route의 세션·Action → `UserTokensPage` → `manage-token` public alias → 공통 client form | 원래 user Action, `TokenReveal`, hu 명령, §9 문구, 서버 목록 | VFY-001·006에서 DOM 값·만료·role=alert·호출 수 |
| `/p/[slug]/tokens` 두 발급 form | route의 scope/plan·Action → `ProjectTokensPage` → 두 wrapper → 공통 form | hs/ho Action·URL, 서로 다른 reveal·placeholder·버튼, §9 문구 | VFY-001·006; Free/미선택·해제 시 form 노출 계약 유지 |
| Board Activity·Team | 기존 권한 route → `loadProjectBoard` → `activityDispatched` → `buildBriefing`·page | 최신 Board 행·pipeline 이름·roster·기존 status/문구 | VFY-002에서 실제 activity tone·team state, 기존 page 렌더 |
| 배너 본문·다음 단계 | project layout → `loadTurn` → `turnDispatched`·handoff → `deriveTurn` | runner·failure·setup facts·§5 문구·기존 NextStepContent | VFY-002·005에서 실제 전달 facts와 기존 detail/next 렌더 |
| Docs·설치·인수 문구 | 기존 entity/config export → 기존 제품 소비처. 소유권 시험은 본문 출처를 바꾸지 않음 | 설치 상수, acceptance labels, §20 Docs·기존 copy-lock | VFY-003에서 렌더·값·단일 소유권 모두 검사 |
| `.next`·브라우저 fixture bundle | 기존 build가 같은 route·Action 소스로 새 출력 생성. 생성물 직접 수정 없음 | 기존 폰트·CSS·reveal·Action 경로; fixture는 esbuild `write:false` | VFY-006의 fresh build/실제 화면. 과거 build·HTTP status만으로 대체하지 않음 |

metadata·정적 URL·폰트·DB schema·core 배포 복사본은 변경 지시·이동·새 의존성이 없으므로 변경 범위 밖이다.
새 조회·form·검사는 서버 내부 API/단위 테스트/client 코드이며 route나 Action registry에 신규 원격 함수를 등록하지 않는다.

## Approval

현재 사용자 요청에 따라 Core 구현·검증을 승인 범위로 기록했다. 추가 승인 요청 없이 해당 범위를 진행한다.

## Execution Plan

1. 최신 `dev`와 정확한 파일·symbol 목록을 대조하고 생성 경로 충돌을 확인한다. VFY-002로 기존 Board/배너의 서로 다른 기준을 먼저 고정한다.
2. Core 002의 주입형 조회·타입·공개 export를 만들고 두 adapter를 연결한다. 기존 loose-keyed·handoff·runner·failure·무쓰기 계약을 보존한다.
3. Core 001의 공통 client form과 wrapper·alias를 연결하고 user page·browser fixture·발급 테스트를 함께 옮긴다. 같은 mount의 상태 격리 사례를 Core에 추가하고 옛 구현·export·import의 부재까지 확인한다.
4. Core 003의 소유권 assertion을 새 architecture test로 옮기고 기존 값·본문 시험을 유지한다. 공개 API 목록·검증 문서도 같은 변경에서 갱신한다.
5. VFY-001·002·003·006과 Core DoD를 완료한다. Phase 2의 004·005는 선택했을 때만 별도 작은 변경과 VFY-004·005를 수행한다.

## Verification Plan

후속 코드 변경 시 현재 저장소의 기본 게이트를 실행한다.

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm run test:web
npm run build
```

새 서버 query·기존 route 연결은 `npm run test:server`로도 확인한다. core/plugin은 변경하지 않는다.
위 `check`는 lint·경계·Next typegen·TypeScript·architecture·availability를 포함한다.
새 테스트를 추가·이동하면 실제 실행 결과에 파일이 발견되는지 확인한다.

| 검증 ID | 분류 | 변경 후 검증 대상·기대 결과 |
| --- | --- | --- |
| VFY-001 | Core / 001 | `token-names.test.ts`와 `user-tokens-page.test.ts`에서 새 alias·두 wrapper 렌더. 기존 hs/hu/ho 성공·실패·만료 사례와 `src-clean-code-acceptance.ts`에 추가할 `token independent instances`의 역순 정산·token/만료/alert 격리·추가 요청 부재를 확인. 이 Core 사례는 Phase 2 없이도 `/results`에 나타나야 함. 옛 user form·발급 테스트 파일, 옛 feature의 export와 옛 경로 import는 0 |
| VFY-002 | Core / 002 | 새 `current-execution-query.test.ts`에서 실제 주입형 함수·query를 검증. `project-page-loaders.test.ts`와 `turn-data.test.ts`는 실제 adapter가 새 DTO를 소비함을 확인. legacy/slot, keyed/null-key, 다른 run/entry/project/agent, closed·missing cursor/entry·gate·accept, handoff 시간·accepted step 조건을 각 기존 predicate와 대조. Board loose-keyed `true`와 배너 bound-only 결과를 보존. DB write 호출 0 |
| VFY-003 | Core / 003 | `test:architecture`가 새 `frontend-contract-owners.test.mjs`를 실행. 공개 경로·유일 소유자·소비 출처의 허용/거부 fixture와 줄바꿈/alias/동일 slice 내부 이동 허용을 확인. 두 기존 테스트의 cross-slice 파일 읽기는 제거하되 명령·문구·다섯 Docs 본문 검증은 유지 |
| VFY-004 | Phase 2 / 004 | 기존 rail 렌더 시험 + `src-clean-code-acceptance.ts`에 추가한 실제 메뉴 동작. 새 상태의 closed/끝/특정 step·선택 후 닫기·busy/readonly 차단 확인 |
| VFY-005 | Phase 2 / 005 | 기존 `turn.test.ts`, `turn-banner.test.ts`, `next-step.test.mjs`에서 detail/next·대기·인수·handoff 본문 유지. 옛 지역 선언 `workingLine`·`const working`만 부재; 제품 문구의 working은 금지하지 않음 |
| VFY-006 | Core 전체 | `check`, `test:web`, `test:server`, 기본 `build`와 실제 Next 토큰 화면. route/Action·auth·plan·목록 범위 보존. 신규 조회 함수는 `api.ts`, 타입은 `contracts.ts`로만 공개. client public API로 서버 조회·상태 내부 구현을 내보내지 않음. `src/generated`·DB schema·core/plugin·라우트 파일 변경 없음. `.next`는 fresh build로 재생성하며 직접 편집하지 않음 |

실제 client fixture는 저장소 루트의 zsh에서 다음과 같이 실행한다. DB는 사용하지 않는다.

```bash
node --import tsx scripts/rehearse-src-clean-code.ts --ui-only
```

`http://127.0.0.1:55452/fixture?mode=token-issuance`에서 Run acceptance 후 `/results`의 모든 status가 Pass인지 확인한다.
Core 완료에는 기존 token 사례와 새 `token independent instances` 결과가 모두 있어야 한다.
Phase 2 메뉴 사례를 선택했으면 같은 suite의 새 사례도 Pass여야 한다.
Finish로 root·보류 요청·clipboard 대체를 정리하고 `/finish`로 listener를 닫는다.
앞 프로세스를 종료한 뒤 `--fixture-development`를 추가해 같은 검증을 반복한다.

실제 RSC refresh·발급 외부 효과는 격리 `TEST_DATABASE_URL`과 위 fresh 기본 build가 준비된 환경에서 확인한다.
운영 URL과 다른 `stagekeeper_test_*` DB를 먼저 준비하며 이 문서 검토에서는 DB를 연결·변경하지 않는다.

```bash
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-account-usage-and-tokens.ts --interactive
```

`http://127.0.0.1:55477/user`와 `/project`에서 세 종류를 확인한다.
이 bridge의 `/lose-next-action`은 다음 Action의 **저장 후 응답**을 잘라내므로 롤백 시험으로 해석하지 않는다.
`/state`에서 발급 +1, Refresh list +0, 명시적 재시도 시에만 추가 +1, 지정 Reference의 수동 폐기만 변경되는지 대조한다.
같은 form의 이전 평문·만료가 실제 refresh 뒤에도 남는지 DOM으로 확인하고 raw token을 기록에 저장하지 않는다.
bridge `/finish`로 Next·listener·자기 DB fixture를 정리한다. 이 결과와 UI-only double의 결과를 구분한다.

각 항목의 완료 기준 외에 제품 문구 잠금, scope별 reveal, Action 인증·인가와 무쓰기 조회 계약을 보존해야 한다.
기본 build 실패를 다른 bundler의 성공으로 대체하거나, 타입·아키텍처 검사를 끄는 방식으로 통과시키지 않는다.

## Verification Results

실행일: **2026-10-21**. 아래 첫 표는 초기 독립 검토에서 실행한 기준선 기록이며 이번 정합화의 재실행 결과가 아니다.
코드 기준 커밋은 그대로이고 개선 구현은 아직 없다.

| 명령 | 결과 | 범위·제한 |
| --- | --- | --- |
| `npm run verify:fsd` | PASS | 정적 FSD 경계 |
| `npm run verify:server` | PASS | 서버 모듈 경계 |
| `npm run test:architecture` | PASS — 121 pass, 2 skip, 0 fail | skip 2개는 실제 Windows LPAC의 readlink·IPC 시험 |
| `npm run lint` | PASS — 오류 0, 기존 경고 3 | 경고는 `plugin/runtime/runner-client.mjs` 2개, `src/server/runners/runner-service.test.ts` 1개 |
| `./node_modules/.bin/tsc --noEmit --incremental false` | PASS | 기존 생성 타입을 포함한 현재 설정의 검사; Next typegen 재실행 없음 |
| `node --import tsx --test 'src/fsd/**/*.test.ts' 'src/fsd/**/*.test.mjs'` | PASS — 335 pass, 0 skip, 0 fail | `src/fsd`만 실행; 전체 `test:web` 실행 결과와 구분 |
| `npm run build` | 미실행 | 문서 작성 작업으로 애플리케이션 코드 변경 없음 |

**Review-mode substantiation:** 품질 검토의 추가 실행 검증 요청 없음. 정적 근거로 유지보수 위험을 채택했다.
위 기준선 검사는 별도로 수행했으며 운영 오표시 재현이나 후속 구현의 회귀 검증으로 해석하지 않는다.
**Post-edit regression:** 개선 코드 미구현으로 해당 없음.

이번 코드 정합화에서는 기존 계약을 확인하는 다음 범위를 추가 실행했다.

```bash
node --import ./tests/server/register-server-only.mjs --import tsx --test tests/server/project-page-loaders.test.ts tests/server/token-issuance-bindings.test.ts src/server/pipeline/run-service.test.ts src/fsd/widgets/turn-banner/api/turn-data.test.ts src/fsd/features/manage-token/ui/token-names.test.ts src/fsd/features/manage-user-token/ui/token-name.test.ts src/fsd/shared/config/plugin-install.test.ts src/fsd/pages/docs/ui/docs-copy.test.ts
```

결과: **20 pass, 0 skip, 0 fail**. 이 명령은 이동 전 파일을 검증한 기록이다.
후속 구현에서는 제거되는 `token-name.test.ts`를 다시 실행하지 않고 VFY-001의 새 목적지와 전체 runner로 확인한다.
메모리에서 import AST가 같은 단일행/여러 줄 소스를 비교해 두 기존 정규식이 줄바꿈만으로 실패함도 확인했다.
새 query/form/architecture test, 실제 브라우저·DB·fresh build는 아직 구현·실행하지 않았으며 미래 검증을 PASS로 기록하지 않는다.

후속 전면 재검토에서도 위 20개 시험을 재실행해 모두 통과했다.
기존 browser fixture의 `action` helper를 메모리에서 실행해 두 요청 callback을 따로 보관한 역순 정산과
보류 callback 0개로의 정리를 확인했다. 이는 현재 helper로 Core 격리 사례를 작성할 수 있다는 근거이며,
아직 추가하지 않은 DOM 격리 사례가 통과했다는 결과는 아니다.

### 품질 검토 추적

심각도는 실제 영향으로 판단했다. 여러 렌즈가 동의했다는 이유로 올리지 않았다.

| Raw ID | 최종 disposition | Canonical | 심각도 |
| --- | --- | --- | --- |
| COH-001 | accept | FSD-CC-001 | Should |
| COH-002 | merge-accept(FSD-CC-002) | FSD-CC-002 | Should |
| CPL-001 | accept | FSD-CC-002 | Should |
| CPL-002 | accept | FSD-CC-003 | Should |
| READ-001 | accept | FSD-CC-004 | Consider |
| READ-002 | accept | FSD-CC-005 | Consider |

COH-002는 1차에서 정책의 entity 소유 권고를 수정하도록 반환했고,
원래 렌즈가 서버 공개 읽기 계약/core 순수 정책으로 수정한 뒤 통합했다.
Predictability·TypeScript generalist는 원시 finding을 제출하지 않았다.

## Risks and Rollback

실행 표시 기준의 차이가 실제 운영 입력에서 나타나는지는 미확인이다.
기존 회귀 계약을 보존하고 raw run·entry가 비정상인 경우도 기존 predicate와 대조한다.
토큰 폼 공통화는 응답 유실과 기존 토큰 보존의 미묘한 차이를 만들 수 있고,
테스트 개선은 소유권 가드를 약화시킬 수 있어 각 완료 기준을 보존해야 한다.

문서 정합화 단계의 롤백 범위는 이 제안서였으며, 현재 Core 구현의 롤백 범위는 아래 실제 변경 목록이다.
후속 코드 변경은 항목별로 분리하고 문제가 생긴 항목의 코드·소비처·테스트를 함께 복원한다.
다른 사용자 변경이나 보호 브랜치를 reset하지 않는다.

## Implementation Results

실행일: 2026-10-21. 초기 승인 범위는 Core FSD-CC-001·002·003이며, 후속 사용자 요청으로 Phase 2 FSD-CC-004·005를 추가했다.
`harness/fsd-clean-code-implementation`을 기준 `origin/dev`에서 만들고 격리 worktree에서 구현·검증했다.
기존 작업 트리의 다른 제안서 이동을 보존하며 검증된 코드 patch만 원래 작업 트리에 반영했다. 변경 코드·아키텍처 파일의 내용과 추가/삭제 상태가 검증 worktree와 같은지 확인했다.

- 001: 내부 `TokenIssuanceForm` 한 곳이 상태·만료·제출·복구를 소유한다. 두 client wrapper와 user alias는 기존 props·본문을 유지한다.
  옛 user form·발급 테스트를 제거했고 공통 form 검사와 실제 user page 렌더 검사로 기존 optional-name 계약을 보존했다.
  browser fixture에는 public API 연결과 같은 mount의 역순 정산 4개 사례를 추가했다.
- 002: 주입형 `loadExecutionFacts`와 DTO를 추가했다. 두 adapter는 각각 activity/turn 판정을 소비하며 기존 keyed/slot 차이·handoff를 보존한다.
  query의 경계·표시·handoff를 24개 테스트로 검증하고 실제 adapter 시험을 새 계약에 연결했다.
- 003: 소유권 assertion을 `frontend-contract-owners.test.mjs`로 옮겼다. 실제 public symbol 출처와 허용/거부 fixture 7개가 통과했다.
  기존 설치 값·Docs 본문 검사는 유지했고 private 파일명·한 줄 import 문법 의존은 제거했다.

아래는 Core 구현 직후의 검증 기록이다. Phase 2 추가 후의 재검증은 다음 절에 기록한다.

| 검증 | 결과 |
| --- | --- |
| `verify:fsd`, `verify:server` | PASS |
| `npm run check` | PASS — lint 오류 0·기존 경고 3, typegen·tsc 통과, architecture 128 pass/2 Windows skip, availability 18 pass |
| `npm run test:web` | PASS — 732 pass |
| `npm test` | PASS — 435 pass/16 기존 플랫폼·native skip |
| `npm run test:server` | PASS — 139 pass/1 opt-in skip |
| fresh build 뒤 `RDC_CHECK_ACTION_MANIFEST=true SRC_CHECK_INBOX_MANIFEST=true npm run test:server` | PASS — 148 pass, loader는 원격 Action으로 등록되지 않음 |
| 격리 worktree의 기본 `npm run build` | PASS — 기본 Turbopack 컴파일·타입·정적 생성·라우트 수집 성공 |
| 원래 Desktop 경로의 기본 `npm run build` | FAIL — 동일한 소스를 반영한 뒤 두 번 모두 CSS 평가 worker의 port bind `EPERM`. 소스·설정 변경이나 다른 bundler로 우회하지 않음 |
| 격리 PostgreSQL의 `npm run test:server:integration` | PASS — migration·전체 기존 integration suite |
| 실제 Next account/token HTTP 리허설 | PASS — 토큰 3종 lifecycle, 6 auth/rate 경로, 15 요청 경계, SDK 제외·플랜 snapshot |
| production·development client fixture | 각 60건 중 49 pass/11 fail. 관련 토큰 10건은 전부 PASS. 전체 suite PASS로 기록하지 않음 |
| 기존 코드 production fixture 비교 | 56건 중 45 pass/11 fail. 실패 이름·관측값이 구현 후 11건과 정확히 같음 |
| 실제 Next user form | 정상 발급 +1, 저장 후 응답 유실 +1, Refresh list +0. 이전 token·만료 유지, unknown Reference만 수동 폐기되고 다른 row·scope 불변 |

공통 UI suite의 실패는 Pipeline의 readonly discard, default plan, pending 4종, project switch 4종과 zero-gate confirm이다.
수정하지 않은 기존 코드에서도 같은 11개 실패를 재현했다. 기존 개발 모드 baseline은 별도로 실행하지 않았다.
이번 Core 범위를 벗어나는 Pipeline 동작을 고치거나 시험을 제거해 통과시키지 않았다.
그 때문에 원래 요구한 `/results` 전체 Pass 조건과 해당 DoD 항목은 아직 완료로 표시하지 않는다. 원래 경로의 기본 build 실패도 통과로 대체하지 않았다.

실제 DB 검증은 npm registry의 PostgreSQL 실행 파일을 저장소 밖 임시 경로에 준비하여
loopback의 새로운 `stagekeeper_test_fsd_clean_code` DB에서 수행했다. 제품 의존성·lockfile·schema는 바꾸지 않았다.
UI fixture와 Next·DB fixture를 `/finish`로 정리한 뒤 fixture 사용자 0명과 사용한 다섯 port의 종료를 확인했고, 임시 PostgreSQL도 종료했다.
평문 credential은 결과 문서·파일에 저장하지 않았다.
임시 로그와 JSON은 `/tmp/stagekeeper-fsd-implementation-*`·`/tmp/stagekeeper-fsd-*-ui-production-results.json`의 로컬 작업 기록이며 영구 검증 보증은 아니다.

### Phase 2 추가 구현·검증

- 004: 같은 `pipeline-rail.tsx`에서 `EdgeMenuState`를 closed/open 판별 유니온으로 정의했다.
  `edgeMenu`는 열렸을 때만 `before: string | null`을 가지며, 끝 위치의 `before: null`을 기존 `movesFor`에 그대로 전달한다.
  snapshot 변경·선택 후 닫기와 기존 readonly·busy·pending 차단 조건을 보존했다. 새 hook·파일·public export는 추가하지 않았다.
  기존 browser acceptance fixture에 위치 전환·끝 선택·step 앞 선택·busy·readonly 5개 사례를 추가했다.
- 005: `working`과 `workingLine`을 각각 `sessionWorkItems`, `sessionWorkLine`으로 바꿨다.
  필터·우선순위·반환 구조·detail/next·제품 문구는 바꾸지 않았다. 이름 변경 전후 코드의 해당 식별자 치환 결과가 같은지도 확인했다.

| 검증 | 결과 |
| --- | --- |
| 기존 rail·turn model·turn banner·next-step 대상 시험 | PASS — 45 pass |
| `verify:fsd`, `verify:server` — 원래 경로 | PASS |
| `npm run check` — 원래 경로·격리 worktree | PASS — lint 오류 0·기존 경고 3, typegen·tsc, architecture 128 pass/2 Windows skip, availability 18 pass |
| `npm run test:web` | PASS — 732 pass |
| fresh 기본 build 뒤 manifest 검사를 켠 `npm run test:server` | PASS — 148 pass |
| 격리 worktree의 기본 `npm run build` | PASS — 기본 Turbopack 컴파일·타입·정적 생성·라우트 수집 |
| 원래 Desktop 경로의 기본 `npm run build` | FAIL — 기존과 같은 CSS worker port bind `EPERM` |
| production·development client fixture | 각각 65건 중 54 pass/11 기존 fail. 새 메뉴 5건·기존 토큰 10건은 모두 PASS |

production의 실패 11건은 수정 전 코드 기준선과 이름·관측값이 같고,
development의 실패 11건은 앞선 Core 구현 후 development 결과와 같다. 새 실패는 없다.
각 fixture는 Finish로 root·보류 요청·clipboard 대체를 정리하고 listener 종료를 확인했다.

Phase 2는 UI 지역 상태 표현·이름 변경이므로 DB·core/plugin을 수정하거나 DB integration을 다시 실행하지 않았다.
Core에서 수행한 해당 검증 기록과 Phase 2의 재실행 결과를 구분한다.
Phase 2의 로그·브라우저 결과는 `/tmp/stagekeeper-fsd-phase2-*`의 로컬 기록이다.

## Definition of Done

승인 범위의 완료에는 다음을 모두 요구한다. 문서 정합화 완료와 코드 구현 완료는 구분한다.

- [x] 001: 상태·제출·복구가 공통 form 한 곳에 있고 두 wrapper·사용자 alias가 기존 scope별 본문·props를 보존한다. Core의 같은 mount 역순 응답 사례가 token·만료·alert의 격리와 자동 추가 요청 부재를 확인한다.
- [x] 001: 옛 user 발급 파일·테스트·export·경로 import가 없고 새 public API·user page·두 browser fixture가 동작한다.
- [x] 002: DB 주입형 공개 조회·타입과 두 adapter가 연결되며 Board/배너의 서로 다른 기존 기준·handoff·무쓰기·격리를 보존한다.
- [x] 002: `nextFor`, route 권한 순서, runner/failure·pipeline 이름·setup 사실의 계약을 바꾸지 않는다.
- [x] 003: 소유권 검사가 새 architecture 목적지에서 실행되고 기존 명령·문구·Docs 본문 검증을 유지한다.
- [ ] VFY-001·002·003·006의 자동 검사와 실제 client/Next 인수가 통과했고 skip·미실행·기존 실패를 구분해 기록했다.
- [x] 생성 경로 충돌, 같은 layer 직접 의존, public API 누출, 무관한 core/plugin·DB·라우트·Action 변경이 없다.
- [x] 새 공개 조회·검사 범위가 아키텍처 문서와 일치한다. 승인 metadata와 Core 구현 기록을 갱신한다.
- [x] 004: 메뉴를 closed/open 상태로 구분하고 기존 `before: null` 계약을 유지한다. VFY-004의 위치 전환·두 위치 선택 후 닫힘·busy·readonly 5건이 production/development에서 통과한다.
- [x] 005: 지역 이름을 `sessionWorkItems`·`sessionWorkLine`으로 바꾸고 옛 선언은 없다. VFY-005의 기존 배너·다음 단계·대기·인수·handoff 시험과 본문을 보존한다.

Phase 2는 추가 사용자 요청으로 구현했고 VFY-004·005를 별도로 확인했다.

## Reconciliation Notes

2026-10-21 첫 코드 정합화에서 개선점이 있었다.
기존 Board의 loose-keyed 회귀와 일괄 판정 동일화 지시의 충돌, 서버/core 대안의 미확정,
사용자 토큰 테스트·browser fixture 누락, 검사 이동 목적지와 old-absence 검증의 부재를 수정했다.
현재 계획은 기존 표시·권한·복구 동작을 보존하며 Core/Phase 2, symbol 출처, runtime·최종 본문·검증 목적지를 연결한다.
앞의 원시 렌즈 판정표는 초기 검토 기록이며 구현 지시는 정합화된 Proposal·구체 목록·VFY·DoD를 따른다.
후속 전면 재검토에서는 Core의 상태 독립성 검증을 추가할 파일이 Phase 2로만 분류된 누락과
실행 조회를 옮길 때 필요한 core/helper/DB 타입 import의 출처 누락을 보완했다.
해당 수정을 Proposal·변경 목록·Symbol 표·runtime·실행 순서·VFY·DoD에 반영했다.

## Completion or Closure Notes

Core 001·002·003과 Phase 2 004·005의 코드를 구현했다. 전체 UI gate의 기존 Pipeline 11건 실패와 원래 경로의 build EPERM이 남아 있어 `pending`·`approved`와 `active/`를 유지한다.
커밋·push·`dev` 대상 PR 생성은 후속 사용자 요청 범위에 포함한다. 병합·배포는 포함하지 않는다.
