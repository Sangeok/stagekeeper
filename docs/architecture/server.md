# 서버 모듈 경계

`src/server`는 backend application service다. 프런트엔드 FSD layer를 적용하지 않으며,
순수 공유 정책은 `packages/core`, HTTP·Action 조합은 기존 Next/FSD adapter가 소유한다.
배경과 대안은 [ADR-0003](../ADR/0003-server-module-boundaries.md)에 기록한다.

## 소유권과 의존 방향

모듈은 DB 테이블의 독점 소유자가 아니다. 연결 해제와 credential 폐기, 실행 생성과
사용량 증가처럼 원자성이 필요한 쓰기는 기존 transaction 경계에 함께 둔다.

| 모듈 | 소유 책임 | 참조 가능한 다른 모듈 |
| --- | --- | --- |
| github | 선택형 저장소 목록·승인·credential 수명주기 | 없음 |
| projects | 접근·등록·가용성·연결·워크스페이스 | 없음 |
| tokens | 발급·조회·이름·최근 사용 기록 | projects |
| usage | 실행 사용량·요청 예산 | projects |
| templates | 단계 파서·번들·런북 판정 | projects |
| pipeline | 보드·게이트·실행·정의·설정 | projects, usage |
| agents | 단계 커서·결과·원장 | projects, usage, templates, pipeline |
| auth | 웹 세션·guard | projects |
| runners | 실행기 lease·상태·일시 정지 | projects |
| rest | REST scope·입력·HTTP 응답 | projects, tokens, usage, templates, runners |
| mcp | 도구·인증·서비스 조립·응답 | projects, tokens, usage, templates, agents, pipeline |

타입 참조도 이 방향을 따른다. 루트 기반 파일은 `db.ts`, `database-clock.ts`,
`public-url.ts`, `result.ts`이며 기능 모듈을 참조하지 않는다. 서버는 FSD를 참조하지 않는다.

## 공개 진입점

- `api.ts`: DB 주입형 함수·factory·파서. DB singleton, 인증 초기화, runtime API,
  `server-only` 표식 파일을 직접 또는 간접으로 읽지 않는다.
- `api.server.ts`: `server-only`가 있는 실제 연결 바인딩. 새 Server Action을 만들지 않는다.
- `contracts.ts`: 모듈 밖에서 필요한 타입만 명시적으로 선언·재수출한다.
- `auth/index.ts`, `auth/guard.ts`, `auth/config.base.ts`는 기존 공개 경로다.
  `auth/config.ts`는 내부이며 ambient declaration은 기존 위치에 둔다.

제품 소비자가 쓰는 symbol만 공개한다. 테스트를 위해 API를 넓히지 않으며 `export *`와
`export type *`를 금지한다. 내부는 상대 경로로 구현을 읽고 자기 집계 API를 거치지 않는다.
직접 타입을 정의한 자기 contracts는 읽을 수 있다. auth의 구현 조립은 정확히
`guard.ts → index.ts`, `config.ts → config.base.ts` 두 내부 공개 간선만 허용한다.

다른 모듈의 runtime API는 아래 연결 조립부만 읽는다.

- rest: `api.server.ts`, `templates.ts`, `runbook.ts`, `project-identity.ts`, `project-registration.ts`, `runner.ts`
- mcp: `api.server.ts`, `deps.ts`, `owner-deps.ts`
- auth: `index.ts`, `guard.ts`, `config.ts`
- Next 진입점과 기존 FSD 서버 adapter

시험·리허설은 공개 진입점과 아래 내부 참조 목록을 따른다. 운영·seed 스크립트는 제품 소비자다.

## 공개 symbol과 제품 소비자

다음은 현재 공개 계약이다. 구현 소유자와 실제 제품 소비자를 함께 기록한다.

선택형 GitHub 목록의 운영 경계는 [ADR-0006](../ADR/0006-optional-github-repository-list.md)를 따른다.

| 공개 import 경로 | symbol | 구현 소유자와 제품 소비자 |
| --- | --- | --- |
| `github/api.server.ts` | `listPublicRepos`, `loadRepositoryConnection`, `startRepositoryConnection`, `completeRepositoryAuthorization`, `completeRepositoryInstallation`, `loadConnectionDraft`, `acknowledgeConnectionDraft`, `cancelRepositoryConnection`, `disconnectRepositoryList`, `listAuthorizedRepositories`, `validateRepositorySelection`, `handleGitHubWebhook`, `maintainGitHubConnections` | github 내부의 주입형 서비스·provider·vault·DB 바인딩; Next 진입점·create-project adapter·운영 maintenance 명령 |
| `github/contracts.ts` | 저장소·상태·실패·서비스 의존성 타입 | 직접 정의한 타입; Next/FSD 서버 adapter에서 local DTO로 변환 |
| `projects/api.ts` | `AvailabilityConflict`, `normalizePlan`, `repositoryOwner`, `READ_OPTIONS`, `readProjectAccess`, `readProjectAccessIn`, `readProjectPlanIn`, `lockProjectOwnerIn`, `withAvailabilityTransaction`, `OWNERSHIP_UNAVAILABLE_REASON`, `NOT_YOURS`, `PROJECT_REQUIRED`, `REPO_SEGMENT`, `RESERVED_SLUGS`, `SLUG_RE` | `access-query`, `availability-service`, `access-messages`, `slug-rule`; tokens·usage·templates·pipeline·agents·REST·MCP의 기존 실제 참조만 유지 |
| `projects/api.ts` | `changeUserPlan`, `loadProjectRoster`, `loadProjectView`, `projectForUser`, `syncProject`, `registerRepositoryProject` | `availability-service`, `repository-query`, `project-view-query`, `owner-query`, `sync-workspaces`, `registration-service`; grant-plan·app/FSD roster 조회·agents·MCP·REST 등록 |
| `projects/api.server.ts` | `planForUser`, `planForProject`, `projectAccess`, `loadProjectAvailability`, `loadProjectConnection`, `selectProjectForUse`, `disconnectProject`, `reconnectProject`, `loadProjectRepository`, `projectForUser`, `registerWebProject` | 기존 facade·연결/선택 바인딩과 새 조회/등록 바인딩; 웹·auth·REST 조립부. 주입형 roster는 이곳이 아닌 `api.ts` 사용 |
| `projects/contracts.ts` | `Plan`, `ProjectAccess`, `TransactionHost`, `WorkspaceInput` | 앞의 셋은 `access-query`의 타입(`entitlement` 재수출도 이곳으로 통합), 마지막은 이 파일에서 직접 정의. 기존 모듈 밖 타입 소비자와 MCP tools가 사용 |
| `tokens/api.ts` | `renameProjectToken`, `renameUserToken`, `tryRecordTokenUsage`, `findUserTokenByHash` | `rename-token`, `usage-recorder`, `user-query`; FSD·REST/MCP 주입형 인증 |
| `tokens/api.server.ts` | `issueProjectToken`, `issueProjectOwnerToken`, `recordTokenUsage`, `findUserTokenByHash` | 발급·사용 기록·사용자 토큰 기본 연결; FSD·REST/MCP 조립부 |
| `tokens/contracts.ts` | `TokenUsageRecorder` | `usage-recorder`; REST/MCP의 주입 계약 |
| `usage/api.ts` | `readAccountUsageIn`, `readProjectUsageCapIn`, `usageLimitFailure`, `consumeProjectRequestBudget` | `account-usage-query`, `request-rate-service`; pipeline·agents·MCP |
| `usage/api.server.ts` | `accountUsage`, `limitAccountRequest`, `limitProjectRequest` | 기존 사용량/요청 제한 바인딩; billing·REST/MCP 조립부 |
| `usage/contracts.ts` | `AccountUsage` | `account-usage-query`; billing의 타입 참조 |
| `templates/api.ts` | `DONE`, `findStep`, `splitTemplate`, `TemplateFormatError`, `readCodexBundle`, `checkCodexRunbook`, `resolveCodexBundle`, `runbookStale` | `steps`, `client-bundle-query`, `bundle-query`, `runbook-query`; agents·REST·MCP·seed. `resolveCodexBundle`·`runbookStale`에는 DB를 명시적으로 전달 |
| `templates/contracts.ts` | `Step`, `ParsedTemplate` | `steps`; agents 타입 소비자. 제품 소비자가 없는 `templates/api.server.ts`는 만들지 않음 |
| `pipeline/api.ts` | `createBoardService`, `hasActiveLegacyScoutSlot`, `setAutomaticScout`, `savePipelineDefinition`, `archivePipeline`, `renamePipeline`, `setDefaultPipeline`, `setPipelineRule`, `setAutomaticPick` | `board-service`의 factory 별칭, `automatic-scout`, `save-definition`, `settings-service`; agents·MCP·FSD |
| `pipeline/api.ts` | `headFor`, `nextFor`, `loadPipelinesView`, `loadItemPipelineView`, `loadPipelineChanges`, `codexHandoffView`, `RUNBOOK_STALE_NOTE`, `scoutNodePending`, `PIPELINE_NOT_FOUND`, `PIPELINE_CANNOT_RUN_ITEMS`, `parseHistoryCursor`, `formatHistoryCursor`, `parseHistoryItemCursor`, `formatHistoryItemCursor` | `run-service`, `codex-handoff-query`, `run-rules`, `history-page`, `history-items`; app·FSD·MCP |
| `pipeline/api.ts` | `loadExecutionFacts` | `current-execution-query`의 DB 주입형 읽기; Board·Turn banner api adapter가 각 표시 기준을 소비 |
| `pipeline/api.server.ts` | `addBacklog`, `updateBacklog`, `removeBacklog`, `backlogWithStatus`, `latestBoard`, `latestBoardWithEvents`, `latestRowFor`, `getWithHistory`, `hasHistoryBefore`, `projectHistory`, `projectHistoryItems`, `hasProjectHistoryBefore`, `currentRoundIds`, `propose`, `changePipeline`, `transition`, `discard`, `gate`, `retryAcceptance` | `board.ts`의 singleton 바인딩; 기존 app/FSD·owner MCP 소비. agents의 `latestBoard` 사용은 주입형 factory 호출로 바뀜 |
| `pipeline/contracts.ts` | `Caller`, `PipelineEntry`, `PipelineNext`, `HistoryEventRecord`, `ExecutionItem`, `ExecutionFacts` | `board-service`, `run-service`, `run-rules`, `history-page` 및 이 파일에서 정의한 실행 조회 DTO; agents·MCP·FSD의 타입 참조 |
| `agents/api.ts`, `agents/contracts.ts` | 값: `agentNext`, `createNextDeps`, `NOTE_MAX`, `OUTCOMES`, `receiptSchema`; 타입: `NextInput`, `NextOutput` | 기존 next·runs 구현; MCP. 파서는 templates 소유이며 agents에서 재수출하지 않음 |
| `runners/api.ts` | `runRunnerOp`, `setRunnerPaused`, `readRunnerState` | `runner-service`; 일시 정지 Action(`features/pause-runner`)이 DB를 넘겨 `setRunnerPaused`를 부름 |
| `runners/api.server.ts` | `runRunnerOp`, `readRunnerState`, `readRunnerSummaries` | prisma 바인딩; REST 조립부(`rest/runner.ts`)·배너와 프로젝트 목록의 FSD api adapter |
| `runners/contracts.ts` | `RunnerMode`, `RunnerStateName`, `RunnerWaitReason`, `RunnerPermission`, `RunnerStopReason`, `RunnerRecord`, `RunnerView`, `RunnerHolder`, `RunnerOp`, `RunnerOpResult` | 이 파일에서 직접 정의. REST handler와 FSD api adapter의 타입 참조 |
| `rest/api.ts`, `rest/api.server.ts` | 주입형: `restFailureResponse`, `runnerResponse`; runtime: `projectIdentityFor`, `templatesFor`, `recordRunbook`, `registerProject`, `runnerRequest` | `response`·`runner-handler`와 다섯 REST 바인딩; 동일한 `src/app/api/{project,templates,runbook,projects,runner}/route.ts` |
| `mcp/api.ts`, `mcp/api.server.ts` | 주입형: `registerTools`, `registerOwnerTools`; runtime: `prismaToolDeps`, `verifyProjectToken`, `prismaOwnerToolDeps`, `verifyOwnerToken` | tools·owner-tools와 deps·owner-deps; 기존 두 MCP route |
| `auth/index.ts`, `auth/guard.ts`, `auth/config.base.ts` | `auth`, `handlers`, `signIn`; `requireUser`, `requireProjectOwner`, `requireProjectWrite`; `AFTER_SIGN_IN`, `authConfigBase` | 정의·외부 소비자·두 내부 조립 간선. `config.ts`는 비공개 |

## 내부 참조 시험 목록

자기 모듈 옆 시험은 내부를 상대 경로로 검사한다. 다른 모듈의 비공개 구현을 읽는 시험은
파일과 모듈 단위로 아래에 등록한다. VM mock 키·소스 파일 읽기도 소비 관계다.
목록은 경계 검사의 입력이며 실제로 쓰이지 않는 항목도 실패한다. 디렉터리 면제는 없다.
배치와 실행 환경 규칙은 [test-organization.md](./test-organization.md)를 따른다.

<!-- server-internal-tests:start -->
| 시험 파일 | 내부 모듈 | 이유 |
| --- | --- | --- |
| `tests/server/github-configuration.test.ts` | github | lazy 설정·기본 OFF·운영 준비 gate와 callback origin 검증 |
| `tests/server/github-provider.test.ts` | github | 실제 HTTP adapter의 PKCE·권한·페이지·오류·개별 토큰 폐기 계약 |
| `tests/server/github-token-vault.test.ts` | github | 실제 암호화·AAD·keyring 회전과 위조 envelope 거부 |
| `tests/server/integration/github-connection.test.ts` | github | 격리 PostgreSQL의 시도·갱신·해제 CAS·webhook 중복·수명주기 검증 |
| `scripts/rehearsals/rehearse-acceptance-failure.ts` | pipeline | 격리 인수 fixture의 실제 내부 실행 경로 조립 (board) |
| `scripts/rehearsals/rehearse-pipeline-agent-slots.ts` | agents | 격리 인수 fixture의 실제 내부 실행 경로 조립 (next, run-service) |
| `scripts/rehearsals/rehearse-repository-disconnection.ts` | pipeline | 격리 인수 fixture의 실제 내부 실행 경로 조립 (run-service) |
| `scripts/rehearsals/rehearse-repository-disconnection.ts` | projects | 격리 인수 fixture의 실제 내부 실행 경로 조립 (availability-service, registration-command) |
| `scripts/rehearsals/rehearse-request-rate-baseline.ts` | mcp | 격리 인수 fixture의 실제 내부 실행 경로 조립 (tools, owner-tools) |
| `scripts/rehearsals/rehearse-src-clean-code-fifth-pass.ts` | pipeline | 격리 인수 fixture의 실제 내부 실행 경로 조립 (board) |
| `scripts/rehearsals/rehearse-src-clean-code-fifth-pass.ts` | projects | 격리 인수 fixture의 실제 내부 실행 경로 조립 (access-query) |
| `scripts/rehearsals/rehearse-src-clean-code.ts` | pipeline | 격리 인수 fixture의 실제 내부 실행 경로 조립 (run-service) |
| `src/server/agents/next.test.ts` | projects | 공개하지 않는 정책·조회·원장 구현의 회귀 검증 (entitlement) |
| `src/server/mcp/tools.test.mjs` | agents | 공개하지 않는 정책·조회·원장 구현의 회귀 검증 (next) |
| `src/server/mcp/tools.test.mjs` | projects | 공개하지 않는 정책·조회·원장 구현의 회귀 검증 (access-query) |
| `src/server/rest/harness-init.test.ts` | projects | 공개하지 않는 정책·조회·원장 구현의 회귀 검증 (entitlement, access-query) |
| `src/server/rest/project-identity-handler.test.ts` | projects | 공개하지 않는 정책·조회·원장 구현의 회귀 검증 (access-query) |
| `src/server/tokens/project-token-service.test.ts` | projects | 공개하지 않는 정책·조회·원장 구현의 회귀 검증 (access-query) |
| `tests/server/account-usage-bindings.test.ts` | usage | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (account-usage-query) |
| `tests/server/integration/acceptance-failure.test.ts` | mcp | 격리 DB에서 실제 저장·경합·원자성 검증 (deps) |
| `tests/server/integration/account-usage.test.ts` | usage | 격리 DB에서 실제 저장·경합·원자성 검증 (account-usage-query) |
| `tests/server/integration/agent-runs.test.ts` | agents | 격리 DB에서 실제 저장·경합·원자성 검증 (next) |
| `tests/server/integration/backlog-add.test.ts` | agents | 격리 DB에서 실제 저장·경합·원자성 검증 (next, run-service) |
| `tests/server/integration/backlog-add.test.ts` | mcp | 격리 DB에서 실제 저장·경합·원자성 검증 (deps) |
| `tests/server/integration/backlog-add.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (run-service) |
| `tests/server/integration/board.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (run-service) |
| `tests/server/integration/client-runtime.test.ts` | mcp | 격리 DB에서 실제 저장·경합·원자성 검증 (deps) |
| `tests/server/integration/head.test.ts` | mcp | 격리 DB에서 실제 저장·경합·원자성 검증 (deps) |
| `tests/server/integration/history-items.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (history-items, history-page) |
| `tests/server/integration/hold-propose.test.ts` | mcp | 격리 DB에서 실제 저장·경합·원자성 검증 (deps) |
| `tests/server/integration/pipeline-change.test.ts` | agents | 격리 DB에서 실제 저장·경합·원자성 검증 (next) |
| `tests/server/integration/pipeline-change.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (board-service, run-service) |
| `tests/server/integration/pipeline-composition.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (run-service) |
| `tests/server/integration/pipeline-materialization.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (run-service) |
| `tests/server/integration/pipeline-routing.test.ts` | mcp | 격리 DB에서 실제 저장·경합·원자성 검증 (deps) |
| `tests/server/integration/pipeline-save.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (run-service) |
| `tests/server/integration/pipeline-settings.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (run-service) |
| `tests/server/integration/project-connection.test.ts` | mcp | 격리 DB에서 실제 저장·경합·원자성 검증 (tools) |
| `tests/server/integration/project-connection.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (run-service) |
| `tests/server/integration/project-connection.test.ts` | projects | 격리 DB에서 실제 저장·경합·원자성 검증 (connection-service, availability-service, registration-command) |
| `tests/server/integration/project-connection.test.ts` | rest | 격리 DB에서 실제 저장·경합·원자성 검증 (runbook-handler) |
| `tests/server/integration/project-connection.test.ts` | tokens | 격리 DB에서 실제 저장·경합·원자성 검증 (project-token-service) |
| `tests/server/integration/project-history.test.ts` | pipeline | 격리 DB에서 실제 저장·경합·원자성 검증 (history-page) |
| `tests/server/integration/project-sync.test.ts` | mcp | 격리 DB에서 실제 저장·경합·원자성 검증 (deps) |
| `tests/server/integration/request-rate-limit.test.ts` | usage | 격리 DB에서 실제 저장·경합·원자성 검증 (request-rate-service) |
| `tests/server/integration/templates.test.ts` | projects | 격리 DB에서 실제 저장·경합·원자성 검증 (access-query) |
| `tests/server/integration/token-management.test.ts` | projects | 격리 DB에서 실제 저장·경합·원자성 검증 (connection-service) |
| `tests/server/integration/token-management.test.ts` | tokens | 격리 DB에서 실제 저장·경합·원자성 검증 (project-token-service, usage-recorder) |
| `tests/server/integration/token-usage.test.ts` | mcp | 격리 DB에서 실제 저장·경합·원자성 검증 (auth) |
| `tests/server/integration/token-usage.test.ts` | tokens | 격리 DB에서 실제 저장·경합·원자성 검증 (usage-recorder) |
| `tests/server/owner-gate.test.ts` | mcp | 공개하지 않는 정책·조회·원장 구현의 회귀 검증 (owner-gate) |
| `tests/server/project-connection-bindings.test.ts` | mcp | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (tools, owner-tools) |
| `tests/server/project-connection-bindings.test.ts` | projects | 제품 API에 공개하지 않는 접근 오류·메시지를 회귀 시험에서 검증한다. |
| `tests/server/project-connection-bindings.test.ts` | rest | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (project-registration) |
| `tests/server/project-history.test.ts` | pipeline | 공개하지 않는 정책·조회·원장 구현의 회귀 검증 (history-page, history-items) |
| `tests/server/project-registration.test.ts` | projects | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (slug-rule, access-query, registration-service) |
| `tests/server/project-registration.test.ts` | rest | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (project-registration) |
| `tests/server/token-issuance-bindings.test.ts` | projects | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (registration-service) |
| `tests/server/token-issuance-bindings.test.ts` | tokens | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (rename-token) |
| `tests/server/token-usage-bindings.test.ts` | mcp | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (auth, deps, owner-deps) |
| `tests/server/token-usage-bindings.test.ts` | projects | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (access-query) |
| `tests/server/token-usage-bindings.test.ts` | rest | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (templates-handler, project-identity-handler, runbook-handler, scope, runbook, templates, project-identity, project-registration) |
| `tests/server/token-usage-bindings.test.ts` | tokens | VM/IO 주입으로 실제 adapter·서비스 연결 검증 (usage-recorder, usage) |
<!-- server-internal-tests:end -->

## 검증

`npm run verify:server`는 실제 파일의 TypeScript AST로 import·export-from·타입 질의,
literal dynamic import/require, 방향·순환·공개 경로·runtime 초기화와 목록을 검사한다.
`npm run test:architecture`가 허용·거절 fixture를 실행한다. `npm run check`는
`verify:server`와 해당 fixture를 포함한 `test:scripts`를 실행한다.
미추적 파일도 검사하며 generated·dependency·build 출력은 제외한다.

VM mock 키·빌드 chunk 정규식·상대 파일 읽기의 동작은 관련 시험과 리허설로 따로 확인한다.
주입형 API는 bootstrap 없는 `test:web`·seed 시험으로, runtime API는 `test:server`와 실제
Next production build·격리 DB 인수로 확인한다. 구조 검사 통과가 인증·원자성 인수를 대신하지 않는다.
