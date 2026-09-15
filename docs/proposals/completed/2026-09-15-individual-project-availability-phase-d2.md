---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-14"
approved-by: "HamSangEok"
approved-at: "2026-09-14"
approval-scope: "D2 로컬 구현(PR #42), D1 DB exit 뒤 runtime 운영 전환, 브라우저 인수용 임시 데이터(Free 하향·테스트 프로젝트 등록·삭제·max 복구), private template 테스트 fixture 수정"
completed-at: "2026-09-15"
verification-summary: "runtime은 PR #42로 dev에 merge되어 2026-09-14 D1 DB exit 직후부터 direct owner/available을 읽는다. 2026-09-15 실제 DB에서 등록→Free 하향(자동 선택 근거 안내)→선택되지 않은 프로젝트의 배너·읽기 전용·Source 읽기·revoke만→교체 확인·확정→복귀를 브라우저로 확인, event v2~v5 기록. private corpus 10파일에 옛 용어 없음, templates test 23/23. 미실행: 두 세션 stale, Pro 교체 선택, direct POST 거부, 뒤로 가기 갱신, project_sync 시각, 격리 DB concurrency runner"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-09-15-individual-project-availability.md"
  - "docs/proposals/completed/2026-09-15-individual-project-availability-phase-d1.md"
---

# 개인 프로젝트 사용 목록 — Phase D2 상세 계획

- Drafting mode: PHASE_PLAN
- Selected Phase: D2 — Atomic server policy and user workflow cutover
- Risk: HIGH-RISK
- Phase completion / deployment readiness: **Completed with recorded gaps** — D1 DB exit(2026-09-14)와 private
  corpus 확인(2026-09-15)으로 두 entry blocker 해소. 브라우저 인수는 부분 실행. 아래 "D2 운영 전환·인수 기록" 참조
- Local implementation: 사용자가 후속 코드 수정을 승인하여 D2 로컬 코드·자동 검증을 수행함. 아래 실행 기록 참조
- Authoritative source: [부모 SDD](./2026-09-15-individual-project-availability.md)
- Predecessor plan: [Phase D1 상세 계획](./2026-09-15-individual-project-availability-phase-d1.md)
- Parent snapshot: SHA-256 `907dd11b40f405f56e58e30ca9815d9e0d8a1b3f918d8fd7eed279b22925a26d`
- D1 plan snapshot: SHA-256 `583d3f51324deefa5edeb5ce9dfe5ea12fd7137ab3b9d4702ac33de471fb2607`
- Evidence baseline: `harness/individual-project-availability-d1@0eef5cb777e6ff6f4343cd2d4a1a9c03f4eac70b`, 2026-09-14
- Working tree: D1 구현과 두 선행 proposal이 아직 commit되지 않은 상태. 이 문서는 그 변경을 읽기 전용
  predecessor 후보로 관측하며 덮어쓰거나 완료됐다고 재해석하지 않는다.
- Authority: 최초에는 문서 검증만 승인됐고, 후속 사용자 요청으로 D2 로컬 코드 수정이 승인됐다.
  이 승인을 운영 DB 적용·배포·private template seed·D3 실행 승인으로 확장하지 않는다.

## Summary

D2는 D1에서 준비한 `ownerUserId`, `repoOwner`, `available`, selection version과 event를 실제 runtime의
source of truth로 전환한다. 플랜 변경·프로젝트 등록·사용 목록 교체가 같은 사용자 단위 transaction과
원장을 사용하고, 웹·MCP·템플릿·런북·에이전트 실행은 하나의 접근 판정을 공유한다.

사용자는 `/projects`와 선택되지 않은 프로젝트 안에서 현재 사용 목록을 보고 `Use this project`를
실행한다. Free의 가득 찬 목록은 유일한 현재 프로젝트를 확인 후 교체하고, Pro는 교체 대상을 직접
고른다. 선택되지 않은 프로젝트는 데이터·연결·token·run을 그대로 보존하면서 웹 읽기와 token revoke만
허용한다.

D2는 `ProjectMember`와 legacy `Project.owner`를 삭제하지 않는다. runtime read는 새 직접 소유권과
`repoOwner`로 전환하되, 등록 dual-write는 D3 rollback shadow를 위해 유지한다. 물리 삭제와 required FK
강화는 D3만 소유한다.

## Goal / Proposal Size

- `available`을 실제 사용 가능 집합으로 전환하고 모든 접근 지점을 같은 판정에 연결한다.
- registration, plan change, user selection의 exact set·version·event를 원자적으로 유지한다.
- 선택·교체 UX와 stale 복구, 영향 안내, read-only 화면을 구현 가능한 수준으로 구체화한다.
- 저장소 소유자 외부 키는 유지하면서 runtime의 membership 의존을 제거한다.

`proposal-size: standard`다. 인가, persisted state, 공개 MCP body, Server Action, 동시성, 운영 cutover,
다수의 route와 current architecture contract를 함께 바꾸며 잘못된 전환은 데이터 접근 손실 또는 노출을
만들 수 있다.

## Source Bundle와 Requirement Ownership

부모가 모든 canonical REQ/INV/CON/EX/VFY/BLK를 소유한다. 이 문서는 새
`TASK-IPA-D2-01`부터 `TASK-IPA-D2-07`까지의 구현 세부사항만 소유하며 부모 정의를 재정의하지 않는다.

| Canonical record | D2에서의 의미 |
| --- | --- |
| REQ-IPA-001~014, REQ-IPA-016 | D2가 observable runtime과 UI를 완료한다. REQ-IPA-015의 이관 완료는 D1/D3 소유 |
| INV-IPA-002~007 | exact set, 상한, 사용자 선택 우선, 연결 보존, atomic plan change를 runtime에서 강제 |
| INV-IPA-001 | runtime은 직접 owner만 읽지만 nullable FK와 legacy storage의 물리 제거는 D3까지 미완료 |
| CON-IPA-001~007 | 중앙 access, FSD/server/core 경계, 외부 owner 호환, 활동·sync 신호, legacy shadow, client cache 금지 |
| VFY-IPA-D2-01~04 | 아래에 실제 code/test/manual destination을 상세화. canonical verifier는 부모에 유지 |
| BLK-IPA-D1-01 | 대상 DB D1 preflight/backfill/check 증거가 D2 entry에 필요 |
| BLK-IPA-D2-01 | private template 원본·tests가 없어서 D2 copy cutover를 완료할 수 없음 |
| BLK-IPA-D3-01 | D3 drop/복구 blocker이며 D2 구현을 막지는 않음 |

현재 architecture source는 [README](../../architecture/README.md),
[FSD](../../architecture/fsd.md), [system overview](../../architecture/system-overview.md),
[invariants](../../architecture/invariants.md), [protocol](../../architecture/protocol.md),
[verification](../../architecture/verification.md), [product copy](../../conventions/product-copy.md)다.
D2 구현이 승인되면 이 current-contract 문서들은 code cutover와 같은 변경에서 갱신해야 한다.

## Entry Gate와 현재 Blocker

### D1 predecessor evidence

현재 worktree에는 D1 schema, migration, ranking, registration dual-write, MCP projection, backfill CLI와
rehearsal runner가 존재한다. 정적 검사·unit·build 통과는 이전 작업에서 보고됐지만, 아래 운영 증거는
없다.

- `IPA_REHEARSAL_DATABASE_URL`을 사용한 실제 PostgreSQL rehearsal 결과
- 대상 DB의 owner 정확히 1·일반 member 0 preflight 결과
- 대상 DB additive migration apply와 최신 backfill `--check` 결과
- `ownerUserId`/`repoOwner` null·불일치 0, plan별 desired `available` 집합 일치
- D1 build rollback smoke와 old writer drain 준비

위 증거가 없으면 D2 runtime은 nullable/미이관 shadow를 진실로 읽게 되므로 운영 전환을 시작하지 않는다.
후속 사용자 승인으로 로컬 구현·DB 없는 자동 검증은 진행했으며 실제 DB/배포 gate는 유지한다.

runner 파일의 존재나 단일 `ok` 출력만으로 D1 exit를 인정하지 않는다. 현재
`scripts/rehearse-project-availability.ts`의 rollback 검사는 baseline client의 Project 네 필드 조회이며,
D1 계획이 요구하는 rollback build·최종 MCP 전체 body 비교를 대신하지 못한다. D1의 VFY/DoD별로
실제 assertion과 실행 결과를 대응시킨 evidence가 필요하다. 미검증 항목은 D1에서 먼저 닫고,
그때의 source commit 또는 전체 변경 snapshot·schema·migration·runner digest를 D2 입력으로 고정한다.

### Private template corpus

`plugin/templates/`는 현재 workspace에 없다. 부모 BLK-IPA-D2-01에 따라 private source와 tests를
확보하고 아래 계약상 후보를 실제 inventory와 대조해야 한다.

- `agents/pm.md`, `agents/dev.md`, `agents/plan-verifier.md`, `agents/doc-auditor.md`,
  `agents/feature-scout.md`
- `CLAUDE.runbook.md`
- `docs/plans/README.md`, `docs/plans/template.md`, `docs/plans/verification-paths.md`,
  `docs/agents/README.md`
- 실제 지원 언어별 대응 파일과 snapshot/template tests

위 목록은 `product-copy.md`가 계약상 이름을 제공한 후보이지 private repository의 완전성 증거가 아니다.
모든 언어·테스트 파일을 열거하고 Member/locked/project owner/availability 안내를 확인하기 전 D2 copy
task와 Phase를 완료 처리하지 않는다.

추가로 `product-copy.md` §14는 “Eight files”라고 쓰지만 위에서 10개 경로를 이름으로 열거한다.
현재 `packages/core/deliver.mjs`는 `CLAUDE.runbook.free.md`를 폐기된 DB row로 취급해 배포에서 제외하지만
`docs/architecture/README.md`에는 Free runbook을 사용한다는 과거 설명이 남아 있다. 실제 private corpus와
현재 deliverable test를 기준으로 파일 수·단일 runbook 계약을 확정하고 두 current-contract 문서를 함께
고친다. 문서만 보고 어느 설명을 선택하지 않는다.

## Current-Code Reconciliation

| 관측 근거 | 현재 상태 | D2 delta |
| --- | --- | --- |
| D1 schema와 migration | 새 필드는 nullable/default shadow, legacy relation 유지 | schema 변경 없이 D1 exit snapshot을 runtime source로 사용. null owner는 fallback하지 않고 fail closed |
| `packages/core/entitlement.mjs` | old `activeProjectIds`와 new `availableProjectIds`가 공존 | plan-change는 current available 후보만 new ranking으로 trim; upgrade/same-cap은 preserve. event basis helper를 core에 둠 |
| `src/server/entitlement.ts` | ProjectMember로 owner와 plan을 찾고 오래된 N개를 다시 계산 | `Project.ownerUserId`, stored `available`과 owner subscription을 한 query path에서 읽는 `ProjectAccess`로 교체 |
| `src/server/auth/guard.ts` | `requireMember`가 member row를 읽고 `requireProjectWrite`가 locked를 검사 | `requireProjectOwner`가 `ownerUserId + slug`를 직접 검사; write guard는 availability를 검사 |
| `project-registration-query.ts` | D1 legacy/direct/token dual-write, version/event 없음, default isolation | direct-owned count, Serializable retry, registration event와 version increment를 같은 tx에 추가 |
| `scripts/grant-plan.ts` | Subscription만 upsert | 단일 plan-change service를 호출하여 plan/set/version/event를 atomic commit |
| `src/server/mcp/tools.ts` | project_get과 일부 읽기는 locked여도 허용 | project_get만 허용; 다른 12개 agent tool 모두 같은 unavailable reason으로 guard |
| `project_sync` | Workspace/language만 transaction에 기록 | 성공 transaction에 `lastSyncedAt` 포함; 거부·오류는 timestamp 불변 |
| templates/runbook/agent_next | ProjectAccess를 재사용하지만 locked union에 결합 | available union과 동일 reason을 유지; selected-out은 403/ServerResult failure, write 0 |
| owner MCP | membership을 매 호출 확인 | direct owner를 매 호출 확인하고 selected-out/Free 순서로 거부 |
| project repository/MCP/agent vars | legacy `Project.owner`를 GitHub owner로 읽음 | 내부 `repoOwner`를 읽어 외부 `{ owner }`로 명시 변환; legacy owner read 0 |
| `/projects` | route가 membership과 old active set을 직접 계산, 행 전체가 Link | server read model + count/status/impact/version; Link와 Use control을 sibling으로 분리 |
| project layout/pages | layout banner와 일부 UI만 locked를 인지 | 모든 mutation control을 read-only 상태로 만들고 revoke/selection만 예외 허용 |
| `currentVersion()` | 없으면 Server Component read 중 PipelineVersion을 생성 | read-only `loadCurrentVersionView`와 mutation용 `ensureCurrentVersion` 분리 |
| `ProjectAvailabilityEvent` | D1 migration-backfill만 사용 | registration/use-project/plan-downgrade event의 single writer service가 됨 |
| current architecture/product copy | ProjectMember와 Locked가 현재 계약 | D2 runtime 계약으로 같은 cutover에서 갱신; D3 physical shadow는 명시 |

관측 runtime은 Next 16.3.3, React 19.2.8, Prisma/client/adapter-pg 7.10.0,
TypeScript 5.9.3, CI Node 22다. Next 16의 Server Action은 직접 POST 가능한 untrusted entrypoint이므로
bound target도 서버에서 owner/version을 다시 검사한다. `revalidatePath`는 literal path의 현재 UI를
같은 action response에서 갱신할 수 있으므로 별도 TanStack Query나 전역 client cache를 추가하지 않는다.

## Scope와 구체적 Inventory

### Core / server / scripts

| 분류 | 경로 | 작업과 symbol | 검증 목적지 |
| --- | --- | --- | --- |
| Core | `packages/core/entitlement.mjs` | `availabilityAfterPlanChange`, `availabilityBasis` 추가; old active 함수는 runtime 연결 제거 후 D3까지 호환 export 여부만 유지 | entitlement.test.mjs, service test |
| Core | `packages/core/entitlement.test.mjs` | downgrade/current-set/upgrade/tie/basis/immutability | npm test |
| Generated | `plugin/lib/entitlement.mjs` | core byte copy | `node scripts/plugin-lib.mjs --check` |
| Core | `src/server/project-availability-service.ts` (신규) | injected DB 기반 list/plan/select transaction과 retry, exact event writer | colocated test + PostgreSQL integration |
| Core | `src/server/project-availability-service.test.ts` (신규) | transaction order, CAS/stale/idempotency/failure tests | test:web |
| Core | `src/server/project-availability.ts` (신규) | `server-only` Prisma wiring: list, plan change, selection command | Next action/route integration |
| Core | `src/server/project-access-query.ts`, `src/server/project-access-query.test.ts` (신규) | 주입된 DB의 direct owner/plan/available query와 공통 reason/type; read-only snapshot | test:web + 실제 DB matrix |
| Core | `src/server/entitlement.ts` | project-access-query에 Prisma를 연결하는 기존 public facade; Plan/ProjectAccess type re-export | consumer tests + DB matrix |
| Core | `src/server/auth/guard.ts` | `requireProjectOwner`; write guard availability; notFound indistinguishability | route/action tests |
| Core | `src/server/project-registration-query.ts` | direct-owned cap, registration version/event, legacy shadow dual-write 유지 | existing/new test + DB |
| Core | `src/server/project-registration-query.test.ts` | event/snapshot/CAS/rollback/cap/P2034 | test:web |
| Core | `src/server/project.ts` | repoOwner → external owner adapter | item/inbox link tests |
| Core | `src/server/agents/runs.ts` | repoOwner adapter, ownerUserId 기반 recent owner runs | agent integration |
| Core | `src/server/agents/next.ts`, `next.test.ts` | `ProjectAccess.available` union과 selected-out refusal | agent tests |
| Core | `src/server/pipeline/run.ts` | direct owner recentRuns; read-only version view와 mutation-only ensure 분리 | run-rules/page/DB tests |
| Core | `src/server/mcp/project-query.ts`, `.test.ts` | repoOwner를 public owner로 mapping, D2 shadow field는 query body에 직접 노출하지 않음 | query test |
| Core | `src/server/mcp/tools.ts`, `tools.test.mjs` | project_get 외 모든 agent tool availability guard; project_get status body | exact registry/permission body |
| Core | `src/server/mcp/project-sync-query.ts`, `src/server/mcp/project-sync-query.test.ts` (신규) | injected DB 기반 syncProject: access/cap → Workspace/language/lastSyncedAt transaction | test:web + 실제 DB failure rollback |
| Core | `src/server/mcp/deps.ts` | projectSync body를 syncProject로 이동·배선; updated project query/access wiring | tools + DB |
| Core | `src/server/mcp/owner-tools.ts`, `owner-tools.test.mjs` | member → owner naming/check; selected-out failure | owner tool matrix |
| Core | `src/server/mcp/owner-deps.ts` | ownerUserId exact check | owner test + DB |
| Core | `src/server/templates-query.ts`, `.test.ts` | available union; selected-out 403/write 0 | test:web |
| Core | `src/server/runbook-query.ts`, `.test.ts` | available union; selected-out 403/write 0 | test:web |
| Core | `scripts/grant-plan.ts` | direct Subscription upsert 제거, plan-change service 호출 | CLI/integration |
| Core | `scripts/backfill-project-availability.ts` | D2 cutover에서 operational `--apply` 제거·명시 거부; dry-run/check도 lifecycle-started 보고 | CLI tests |
| Core | `scripts/lib/project-availability-migration.ts` | 공통 basis를 core helper로 교체; isolated D1 rehearsal 내부 apply만 유지 | migration tests |
| Core | `scripts/project-availability-migration.test.ts` | D2 lifecycle 이후 apply 진입 불가와 core basis regression | check |
| Core | `scripts/rehearse-project-availability.ts` | D2 register input/transaction signature에 caller 동기화; baseline은 아래 고정 commit 사용 | type/check + 격리 compatibility rehearsal |
| Core | `scripts/project-availability-runtime.test.ts` (신규) | runtime membership/legacy owner/old active/locked 계약 금지 목록을 구조적으로 검사 | check → CI |
| Core | `scripts/rehearse-project-availability-d2.ts` (신규) | 빈 D2 격리 DB에서 D1 snapshot 구성 후 plan/select/sync/access/concurrency/recovery fixture | `test:project-availability:d2:db` |
| Core | `package.json` | unit glob 확장과 guarded D2 DB rehearsal script 추가 | parsed script + check/manual DB |

`src/server/templates.ts`, `src/server/runbook.ts`, `src/app/api/{templates,runbook}/route.ts`는 wiring/body
verification surface다. signature가 그대로면 변경하지 않지만 최종 403 body와 side effect 0을 실제 route까지
검사한다. `src/server/db.ts`, `prisma/schema.prisma`와 D1 migration은 read-only evidence이며 D2 schema
migration을 새로 만들지 않는다.

### FSD / Next routes

| 분류 | 경로 | 작업과 symbol | 검증 목적지 |
| --- | --- | --- | --- |
| Core | `src/fsd/features/select-project-for-use/` (신규) | `api/select-project-for-use.server.ts`, `model/select-project-state.ts`, `model/select-project-state.test.ts`, `ui/use-project-control.tsx`, `index.ts`, `index.server.ts` | model/action/manual |
| Core | `src/fsd/features/create-project/api/create-project.server.ts` | 외부 plan read 제거; 공통 Serializable retry에서 registerProjectIn 호출; 기존 token reveal 보존 | registration/action/DB |
| Core | `src/fsd/pages/project-list/api/` segment와 `project-list.server.ts` (신규) | api segment를 먼저 만들고 server read model을 UI-safe props로 mapping | page test/build |
| Core | `src/fsd/pages/project-list/index.server.ts` (신규) | server-only public API | FSD verifier |
| Core | `src/fsd/pages/project-list/ui/project-list-page.tsx`, 신규 `project-list-page.test.mjs`, `src/fsd/pages/project-list/index.ts` | count/status, sibling Link/control, downgrade notice | test:web의 server-render body/manual |
| Core | `src/fsd/widgets/app-header/api/app-header.server.ts` | direct-owned project switcher 목록 | widget/DB |
| Core | `src/fsd/widgets/turn-banner/api/turn-data.server.ts` | read-only pipeline version view; unavailable에서도 DB write 0 | query/DB |
| Core | `src/fsd/features/manage-token/api/manage-token.server.ts` | issue는 write guard, agent/owner revoke는 owner guard 예외 | action matrix |
| Core | `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx` | selected-out에서 issue 숨김, 기존 token revoke 유지, 없는 form/Inbox approval 안내 제거 | component/manual |
| Core | `src/fsd/features/manage-token/ui/new-token-form.tsx`, `src/fsd/features/edit-backlog/ui/remove-backlog-button.tsx` | requireMember 주석을 새 owner guard 의미로 정정; 기존 catch/error 동작 보존 | static/build |
| Core | `src/fsd/features/review-gate/ui/inbox-card.tsx`, `src/fsd/pages/project-inbox/ui/project-inbox-page.tsx` | locked prop을 writable/available 의미로 교체, mutation controls 숨김 | component/manual |
| Core | `src/fsd/pages/board-item/ui/board-item-page.tsx` | selected-out에서 reopen control 숨김 | component/manual |
| Core | `src/fsd/pages/project-backlog/ui/project-backlog-page.tsx` | selected-out에서 form/propose/remove/edit control 제거 | component/manual |
| Core | `src/fsd/features/edit-backlog/ui/backlog-table.tsx` | read-only row의 Source 전문 조회 보존; edit Link와 mutation action 제거 | component/manual |
| Core | `src/fsd/features/edit-backlog/ui/backlog-table.test.mjs` (신규) | Source 전문/공백 보존과 form·mutation 부재의 render regression | test:web |
| Core | `src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx` | availability와 plan entitlement를 구분한 editable, unsaved default version 표시 | component/manual |
| Core | `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` | unavailable의 +/Remove/Swap/Save 제거, plan 거부와 selection 거부 문구 분리, 새 snapshot에서 draft reset | component/manual |
| Read-only | `src/fsd/features/edit-backlog/api/edit-backlog.server.ts`, `src/fsd/features/propose-item/api/propose-item.server.ts`, `src/fsd/features/review-gate/api/review-gate.server.ts`, `src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts` | add/update/removeBacklogItem, proposeItem, humanTransition/approveGate/discardItem, savePipeline 각각의 기존 write guard와 zero-write 검사 | 실제 Next action matrix |
| Core | `src/app/(app)/projects/page.tsx` | DB/old policy 제거, project-list server adapter 조합 | build/manual |
| Core | `src/app/(app)/p/[slug]/layout.tsx` | owner guard, available banner/Use control, available일 때만 Turn action UI | layout/manual |
| Core | `src/app/(app)/p/[slug]/page.tsx` | owner guard, side-effect 없는 version read | read-only DB test |
| Core | `src/app/(app)/p/[slug]/backlog/page.tsx` | owner guard, available prop과 read-only controls; rows에 source 전달 | manual/action |
| Core | `src/app/(app)/p/[slug]/inbox/page.tsx` | owner guard, available prop | permission UI |
| Core | `src/app/(app)/p/[slug]/items/[key]/page.tsx` | owner guard, available prop | permission UI |
| Core | `src/app/(app)/p/[slug]/pipeline/page.tsx` | owner guard, read-only version view, editable conjunction | DB/manual |
| Core | `src/app/(app)/p/[slug]/tokens/page.tsx` | owner guard, issueAllowed와 revoke exception | permission UI |
| Core | `src/app/(app)/not-found.tsx` | requireMember 주석만 owner로 갱신, body 보존 | rendered body |
| Read-only | `src/app/(app)/p/[slug]/error.tsx`, `src/app/(app)/p/[slug]/not-found.tsx` | 기존 error/not-found body 보존 | rendered body |

filesystem preflight 기준으로 `src/fsd/features`와 `src/fsd/pages/project-list`, `src/server`, `scripts`는
존재하고 제안한 신규 파일과 충돌하지 않는다. `select-project-for-use` slice와 `project-list/api` segment는
아직 없으므로 구현 순서에서 디렉터리를 먼저 만든다. 구현 시작 시 같은 이름의 새 사용자 변경이 생겼는지
다시 확인한다. slice 밖 import는 `index.ts`/`index.server.ts`만 사용하고 Client Component는 `@/server`
또는 `*.server`를 import하지 않는다.

`test:web`은 현재 `.test.mjs`와 `.test.ts`만 수집한다. 새 render test는 기존
`src/fsd/pages/project-board/model/briefing.test.mjs`처럼 `createElement`와 `renderToStaticMarkup`을
사용한다. `.test.tsx`를 수집된 것으로 간주하지 않는다. hydration·클릭·refresh는 아래 실제 브라우저
protocol이 검증하며 static render만으로 완료 처리하지 않는다.

보존·배선 확인 목적지는 `src/server/agents/vars.ts`와 `vars.test.ts`, `src/server/mcp/auth.ts`와
`auth.test.mjs`, `src/app/api/mcp/route.ts`, `src/app/api/mcp/owner/route.ts`,
`src/fsd/features/create-project/{index.server.ts,model/create-project-state.ts,ui/new-project-form.tsx}`,
`src/app/(app)/p/new/page.tsx`, `src/app/layout.tsx`의 기존 Toaster,
`src/server/pipeline/board.ts`의 latestBoard/ensureRun caller다. 이 경계의 기존 token prefix,
등록 결과 shape, 원장·커서 규칙은 유지한다.

### Current-contract / private artifacts

| 분류 | 경로 | 변경 |
| --- | --- | --- |
| Core | `CONTEXT.md` | 프로젝트 소유자, 저장소 소유자, 사용 가능/선택되지 않음 용어 추가; current Member actor 제거 |
| Core | `docs/architecture/README.md` | old locked/oldest-N 설명을 D2 exact set과 직접 owner로 교체 |
| Core | `docs/architecture/system-overview.md` | Postgres owner/availability와 access service 책임 갱신 |
| Core | `docs/architecture/fsd.md` | `requireMember` 예시를 owner guard와 project-list/select feature 경계로 갱신 |
| Core | `docs/architecture/invariants.md` | old locked invariant를 exact available/read-only/connection preservation로 교체 |
| Core | `docs/architecture/protocol.md` | project_get-only matrix, owner token direct check, sync timestamp와 reason body |
| Core | `docs/architecture/verification.md` | runtime legacy-read guard와 D2 manual protocol 추가 |
| Core | `docs/conventions/product-copy.md` | Available/Not selected/Use this project/stale/impact/MCP 문구와 hidden-write 없는 read-only 설명 |
| Blocked | private template source와 tests | 실제 전체 inventory 확정 후 Member/locked/owner 안내와 selected-out 복구 문구 갱신 |

## Scope Guard

### Included

- D1 shadow를 사용하는 direct ownership, exact availability, selection event runtime cutover.
- registration/plan change/selection/project_sync의 transaction과 concurrency.
- 모든 웹·agent MCP·owner MCP·templates·runbook 접근 판정.
- `/projects`와 project 내부의 Use/replace/read-only UX.
- current architecture, domain vocabulary, product copy와 private template alignment.
- D1 operational apply retirement와 runtime legacy-read static guard.

### Excluded

- D1 실제 DB 실행 자체. D2 entry evidence로 받아야 하며 이 문서 작성이 대신하지 않는다.
- `ProjectMember`, `User.members`, `Project.members`, legacy `Project.owner` 열·relation·migration 삭제.
- ownerUserId/repoOwner NOT NULL/Cascade 강화와 D3 restore tooling.
- Business/Organization/seat/invitation/share/member model.
- 프로젝트 삭제·보관, 수동 pause, 사용 가능 0개 선택.
- 결제/checkout/webhook/가격 또는 새 billing mutation. `plan:grant`만 현재 plan writer다.
- token 자동 revoke, AgentRun/PipelineRun close/reset, in-flight 작업 강제 취소.
- TanStack Query, global store, polling, SSE, optimistic availability mutation.
- `harness.json project.owner`, `{{project.owner}}`, 공개 MCP repository owner의 breaking rename.

## Symbol / Import Provenance

| symbol | 현재 owner → D2 owner | consumer | verification |
| --- | --- | --- | --- |
| `availableProjectIds` | core D1 export 유지 | plan-change decision | pure ranking + service integration |
| `availabilityAfterPlanChange`, `availabilityBasis` | 신규 core named exports | service + D1 migration basis | core/plugin tests |
| `ProjectAccess`, `Plan`, access reason | entitlement → project-access-query 소유, entitlement에서 type re-export | 기존 consumers + injected service/sync/DB runner | import/body/permission matrix |
| `planForUser`, `planForProject`, `projectAccess` | entitlement public facade 유지 → injected query에 DB 배선 | guards, MCP, templates, runbook, agents, pipeline, header | permission matrix |
| `readProjectAccess`, `readProjectPlanIn` | 신규 project-access-query named exports | entitlement facade, sync query, transaction reader, DB runner | snapshot/actual DB |
| `syncProject` | mcp/deps의 projectSync body → mcp/project-sync-query named export | deps.projectSync + injected test/DB runner | 실제 Workspace/language/timestamp rollback |
| `requireProjectOwner` | `requireMember` 대체 | 모든 project route, revoke, selection owner check | not-found/owner tests |
| `requireProjectWrite` | 이름 유지, 내부 available 판정 | 기존 mutation actions | selected-out zero-write tests |
| `loadProjectAvailability`, `changeUserPlan`, `selectProjectForUse` | 신규 service/wrapper | project list, plan:grant, feature action | transaction tests |
| `registerProjectIn` | D1 dual-write helper → D2 version/event writer | createProject action | registration integration |
| `loadCurrentVersionView`, `ensureCurrentVersion` | currentVersion의 read/write 책임 분리 | Server Component reads / board mutations | query count + no-write DB test |
| `PROJECT_GET_SELECT`, `loadProjectView` | legacy owner select → repoOwner adapter | MCP deps → tools serializer | final JSON body |
| `loadProjectRepository`, `serverVars` input | Project.owner → repoOwner adapter → external owner | item/inbox links, agent template vars | URL/vars tests |
| `UseProjectControl`, `SelectProjectState` | 신규 select feature public API | project list와 project layout | component/manual |
| `loadProjectListPage` | 신규 project-list server public API | `/projects` route | FSD/build |

service는 `import type`으로 Prisma 타입만 참조하고 DB bootstrap, `server-only`, Next, FSD를
value import하지 않는다. `scripts/grant-plan.ts`와 D2 DB runner는
`../src/server/project-availability-service`를 상대 import하고 script bootstrap으로 client를 주입한다.
Next consumer만 `@/server/project-availability` wrapper를 사용한다. 모든 하위 조회·writer는 전달받은
transaction을 사용하며 tx 안에서 singleton의 `planForUser`/`planForProject`로 우회하지 않는다.

project-access-query와 project-sync-query도 같은 bootstrap-free 경계를 지킨다. access query는 core와
Prisma type만 의존하고 service/entitlement를 역으로 import하지 않는다. `readProjectAccess(client, id)`는
read-only snapshot을 소유하며, 기존 tx 안의 plan 조회는 `readProjectPlanIn(tx, id)`로 같은 tx를 사용한다.
entitlement의 public 함수와 type import 경로는 유지해 불필요한 caller rename을 피한다.
sync query는 access query와 core를 호출하며, Node DB runner가 server-only deps를 import하지 않고도
실제 production query/transaction을 실행하게 한다. 테스트 안에 production SQL을 복제하지 않는다.

공통 retry와 availability event append는 service가 소유한다. register helper가 이를 사용하므로 service가
register helper를 역으로 import하지 않는다. create action이 retry 안에서 register helper를 조합한다.
select feature의 `index.ts`는 `UseProjectControl`과 UI-safe model/type만, `index.server.ts`는 selection
action만 공개한다. action은 route/server composition이 prop으로 넘긴다. 목록 page의 server adapter는
자기 `loadProjectListPage`를 공개하고, internal layout은 server read model과 select feature의 public
model을 사용한다. feature가 page나 create-project feature를 import하지 않는다.

## Phase D2

- Parent boundary: [Phase D2](./2026-09-15-individual-project-availability.md#phase-d2-atomic-server-policy-and-user-workflow-cutover)
- satisfies: REQ-IPA-001, REQ-IPA-002, REQ-IPA-003, REQ-IPA-004, REQ-IPA-005, REQ-IPA-006, REQ-IPA-007, REQ-IPA-008, REQ-IPA-009, REQ-IPA-010, REQ-IPA-011, REQ-IPA-012, REQ-IPA-013, REQ-IPA-014, REQ-IPA-016
- preserves: INV-IPA-002, INV-IPA-003, INV-IPA-004, INV-IPA-005, INV-IPA-006, INV-IPA-007
- governed-by: CON-IPA-001, CON-IPA-002, CON-IPA-003, CON-IPA-004, CON-IPA-005, CON-IPA-006, CON-IPA-007
- verified-by: VFY-IPA-D2-01, VFY-IPA-D2-02, VFY-IPA-D2-03, VFY-IPA-D2-04
- predecessor: D1 target DB exit evidence and BLK-IPA-D2-01 해소.
- intermediate validity: direct owner/available이 runtime 진실이고 legacy membership/owner는 write-only rollback shadow.
- exit: 모든 D2 verifier와 cutover/manual evidence 통과, runtime legacy read 0, shadow dual-write 일치.
- downstream: D3 recovery evidence 승인 전 legacy schema를 drop하지 않는다.

### TASK-IPA-D2-01: 순수 plan-change availability policy 확정

- satisfies: REQ-IPA-004, REQ-IPA-005, REQ-IPA-006
- preserves: INV-IPA-002, INV-IPA-003, INV-IPA-005
- governed-by: CON-IPA-002, CON-IPA-005
- verified-by: VFY-IPA-D2-01

`availabilityAfterPlanChange`는 `fromPlan`, `toPlan`, current available ID set과 그 set에 해당하는
ranking candidates를 받는다. 후보와 ID 집합이 정확히 일치하지 않거나 중복·잘못된 timestamp가 있으면
오류다.

- target project limit이 source limit 이상이면 current set을 그대로 반환한다. Max upgrade도 자동 추가 없음.
- target limit이 더 작고 current count가 초과할 때만 `availableProjectIds`로 trim한다.
- 후보는 **현재 available만**이다. 과거 selected-out project를 owner 전체 후보에서 되살리지 않는다.
- 결과는 ID 오름차순의 added/removed/snapshot과 `changed`, `basis`를 반환한다.
- basis는 user-selection → recent-agent-activity → recent-project-sync → recent-registration 순서의
  첫 유효 근거이며 trim이 없으면 null이다.
- 입력 array/Date/Set을 mutate하지 않는다. old `activeProjectIds`는 runtime에서 더 이상 import하지 않는다.

D1 migration의 동일 basis 계산도 core helper를 사용하도록 바꾸되 D1 initial migration이 owner 전체를
후보로 삼는 의미는 바꾸지 않는다.

### TASK-IPA-D2-02: direct owner와 중앙 access로 runtime 전환

- satisfies: REQ-IPA-010, REQ-IPA-011, REQ-IPA-016
- preserves: INV-IPA-002, INV-IPA-004, INV-IPA-006
- governed-by: CON-IPA-001, CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D2-03

`ProjectAccess`는 다음 의미의 discriminated union이다.

```ts
type ProjectAccess =
  | { plan: Plan; available: true }
  | { plan: Plan; available: false; code: "not-selected" | "integrity"; reason: string };
```

`projectAccess(projectId)`는 `readProjectAccess(prisma, projectId)` facade다. query helper가 Project의
`ownerUserId`, `repoOwner`, `available`, owner subscription을
일관된 snapshot에서 직접 읽는다. 관계 조회가 여러 SQL로 나뉘어도 아래 read-only transaction을 공유한다.
없는/잘못된 plan은 기존처럼 free로 normalize한다. D1 physical schema가 nullable이므로 ownerUserId가
null이거나 owner relation/Project가 없거나 repoOwner가 null이면 legacy 필드로 fallback하지 않고 data-integrity reason으로
fail closed한다. D2 entry check가 정상이라면 이 branch는 관측되지 않아야 하며 로그에는 project ID만 남긴다.

비정상 ownership branch의 외부 reason은 `Project ownership is unavailable.`로 고정한다. 정상
selected-out recovery reason과 섞지 않으며 token/project detail이나 owner 후보를 노출하지 않는다.
`project_get`도 `code: integrity`이면 detail dependency를 호출하지 않고 error body만 반환한다.
`code`는 내부 분기용이며 정상 project_get 공개 body에 추가하지 않는다. repoOwner adapter도 null을
non-null assertion·빈 문자열·legacy owner로 바꾸지 않고 동일한 integrity 실패로 처리한다.
`planForProject`도 owner가 없다는 이유로 free를 반환하지 않는다. 동일 direct-owner 조회를 재사용하고
integrity 오류로 중단한다. free normalize는 유효한 소유자의 Subscription 누락/잘못된 plan에만 적용한다.

`requireProjectOwner(slug)`는 로그인 user와 `ownerUserId + slug`가 같은 Project만 반환한다. 없는 slug와
다른 owner는 기존 `/not-found` body로 합친다. `requireProjectWrite`는 이 owner guard 뒤 central access를
검사하고 selected-out이면 명시적 failure를 반환한다.

runtime `src/**`는 ProjectMember를 읽지 않는다. 예외는 D3 rollback shadow를 만드는
`registerProjectIn`의 nested create뿐이다. Project.owner도 읽지 않으며 repo 링크/MCP/template vars에는
repoOwner를 `{ owner }`로 mapping한다.

모든 availability writer는 기존 상태가 다음 조건을 만족하는지 transaction 안에서 먼저 확인한다:
available ID는 전부 같은 direct owner의 Project이며, owner Project가 있으면 available이 1개 이상이고,
현재 normalized plan cap을 넘지 않는다. 정당한 plan downgrade trim 외의 empty/over-cap/orphan shadow를
자동 복구하지 않고 integrity failure로 중단한다. D2 entry check가 이 branch를 사전에 0건으로 만들어야 한다.

**read-only의 숨은 쓰기 제거**: `currentVersion()`을 read용 `loadCurrentVersionView`와 mutation용
`ensureCurrentVersion`으로 분리한다. layout/board/pipeline/turn Server Component read는 version이 없어도
default graph를 memory에서 만들어 보여 주고 DB create/update를 하지 않는다. board mutation과
pipeline execution만 access 통과 후 ensure를 호출한다. 선택되지 않은 project의 모든 page GET을
query log/row snapshot으로 검사해 token revoke나 Use action 외 write가 0인지 확인한다.

read view는 `{ graph, persisted }`이며 persisted는 `{ id, version, createdAt } | null`이다.
기존 행은 그 graph와 metadata를 쓰고, 행이 없으면 전달된 db에서 읽은 plan의 `defaultGraph`와
`persisted: null`을 반환한다. 가짜 version 1·id·savedAt을 만들지 않는다. board/turn은 `graph.nodes`만,
pipeline page는 null일 때 `Default pipeline · not saved yet`를 표시한다. `ensureRun`과 `headFor`는
mutation용 ensure를 사용하고, 기존 row·version pinning과 unique-race 처리를 보존한다.
read path에서 `currentVersion`/ensure 호출이 사라졌는지 전체 caller와 DB write log 양쪽으로 확인한다.

### TASK-IPA-D2-03: registration·plan·sync atomic writer 통합

- satisfies: REQ-IPA-001, REQ-IPA-002, REQ-IPA-003, REQ-IPA-004, REQ-IPA-006, REQ-IPA-013
- preserves: INV-IPA-003, INV-IPA-004, INV-IPA-006, INV-IPA-007
- governed-by: CON-IPA-002, CON-IPA-004, CON-IPA-006
- verified-by: VFY-IPA-D2-02

**Plan change**

registration/plan/selection 공통 transaction 옵션은 Serializable, maxWait 5000ms, timeout 30000ms다.
P2034와 내부 CAS count 0만 최초 포함 최대 3회, 100ms/200ms 뒤 fresh transaction으로 재시도한다.
stale·입력·소유권·무결성 오류·일반 P2002·timeout·연결 오류는 자동 재시도하지 않는다. selection의
expectedVersion은 retry 중 최신 값으로 바꾸지 않는다. retry 소진은 명시적 conflict 실패다.
commit 응답 유실처럼 성공 여부가 불명확한 오류는 자동 replay하지 않고 새 조회로 확인한다.
상태·event는 tx 내부, revalidation·성공 출력은 commit 뒤다.

`changeUserPlan`은 Prisma client를 받은 testable service가 Serializable transaction을 열어 아래 순서를
지킨다.

1. User version, current normalized plan, Subscription, 직접 소유 Project 전체와 current available 후보의
   selection/sync/create 시각 및 AgentRun/AgentRunStep activity를 읽는다.
2. TASK-IPA-D2-01로 next exact set을 계산한다.
3. Subscription upsert와 changed Project.available을 같은 tx에 쓴다.
4. set이 바뀐 경우에만 version CAS increment와 system `plan-downgrade` event를 쓴다.
5. event의 from/to plan, sorted added/removed/snapshot, basis와 새 version을 기록한다.

upgrade, Max 전환 또는 downgrade라도 current count가 target cap 이하면 available set/version/event를
바꾸지 않고 Subscription만 쓴다. raw invalid plan은 free로 읽지만 저장할 target은 `isPlan`을 통과해야 한다.
`scripts/grant-plan.ts`는 user lookup 뒤 이 service만 호출하며 직접 Subscription upsert를 제거한다.
기존 login 중복/없음 판정과 `source: manual`, optional note를 보존한다. callback 안의 process.exit를
return/throw로 바꾸고 withPrisma의 disconnect 뒤 exitCode를 설정한다. 원시 DB 오류/접속 문자열은
출력하지 않는다. 같은 set을 보존하는 plan writer도 전체 read/Subscription write를 Serializable 안에서
수행한다. version 증가가 없다는 이유로 이 branch만 transaction 밖으로 빼지 않는다.

**Registration**

`registerProjectIn`은 직접 소유 project count로 기존 cap 문구를 유지한다. 기존 Project/legacy owner
member/initial token과 direct owner/repoOwner/available을 만든 뒤 User version을 increment하고 user
`registration` event를 추가한다. event는 새 project ID를 added에, commit 뒤 전체 available set을 sorted
snapshot에 두고 basis는 `recent-registration`이다. lastSelectedAt은 null이다.

action이 transaction 밖에서 계산한 plan은 input에서 제거한다. helper가 transaction 안의 Subscription을
normalize하고 cap을 판정한다. User version 갱신은 읽은 version을 조건으로 한 `updateMany` count 1 CAS이며,
동시 registration/plan/selection으로 count 0이면 전체 create/token/event가 rollback된 뒤 fresh retry한다.

create action은 위 공통 retry를 사용하며 token hash/input은 retry 사이에 유지한다.
P2002 중 slug unique 충돌만 기존 UI error로 mapping한다. event version/hash 등 다른 unique 충돌을
`slug is already taken`으로 오인하지 않는다. cap과 create,
token, 양 owner shadow, version/event 중 하나라도 실패하면 모두 rollback한다.
등록 성공의 기존 `{ status: "created", slug, token }`과 단회 평문 표시를 유지한다. 내부 helper의
`string | null` cap 결과는 유지하고 event 작성에 필요한 새 id만 tx 안에서 조회한다. registration event의
fromPlan/toPlan은 둘 다 해당 tx의 현재 plan이다. token response 유실 시 자동 재등록하지 않고 기존
프로젝트의 Tokens 화면에서 새 토큰 발급으로 복구한다.

**Repository sync**

`src/server/mcp/project-sync-query.ts`의 `syncProject(client, { projectId, workspaces, language? })`는
주입된 client로 중앙 access query와 기존 workspace cap을 검사하고 기존 `ServerResult<number>`를 반환한다.
`WorkspaceInput`은 기존 tools module에서 type-only import하며 MCP 입력 schema와 필드·upsert key는 유지한다.
deps의 `projectSync`는 이 함수에 Prisma/input을 넘기는 adapter가 되고 기존 본문은 제거한다.
tool 층 guard는 유지하며 helper의 접근 재검사도 같은 중앙 query를 사용한다. guard 뒤 실제 쓰기 tx가
시작된 in-flight 호출은 기존 완료 허용 계약을 따른다.

`syncProject`는 availability guard를 먼저 통과한 뒤 language update와 Workspace upsert와 같은 transaction에
`Project.lastSyncedAt = now`를 쓴다. language가 undefined여도 timestamp update는 존재한다. cap/validation/
DB 실패 또는 selected-out 거부 시 Workspace, language, timestamp 모두 불변이다.
단위 검증은 access/cap 거부와 호출 순서를, 실제 DB runner는 같은 helper의 성공·중간 DB 오류 rollback을
관측한다. time source는 테스트에서 고정할 수 있게 주입하고 runtime 기본값은 서버의 현재 시각이다.

### TASK-IPA-D2-04: user selection·replacement·impact transaction

- satisfies: REQ-IPA-007, REQ-IPA-008, REQ-IPA-009, REQ-IPA-011, REQ-IPA-012, REQ-IPA-013
- preserves: INV-IPA-002, INV-IPA-003, INV-IPA-004, INV-IPA-005, INV-IPA-006, INV-IPA-007
- governed-by: CON-IPA-001, CON-IPA-002
- verified-by: VFY-IPA-D2-02, VFY-IPA-D2-03, VFY-IPA-D2-04

service input은 `{ userId, targetProjectId, replacementProjectId?, expectedVersion }`다. userId는 session에서
오며 client body의 owner 값은 받지 않는다. expectedVersion은 0 이상의 safe integer, ID는 non-empty string로
검사한다.

Serializable tx에서 User version, normalized plan, target/replacement direct ownership과 current exact set을
다시 읽는다.

- target이 다른 owner거나 없으면 일반 not-found/error로 거부한다.
- expectedVersion이 다르면 target의 available 여부와 무관하게 `stale`과 current version을 반환하고 write 0이다.
  부모 REQ-IPA-012의 관측 결과가 우선한다. 부모의 멱등 성공은 아래 current-version 요청에 적용한다.
- version이 같고 target이 이미 available이면 current version/set을 돌려주는 idempotent success다.
  timestamp/version/event write는 0이다.
- spare slot이면 target만 available=true, lastSelectedAt=now로 쓴다. 보내온 replacement가 있더라도
  소유권을 확인한 뒤 제외에는 사용하지 않는다. 업그레이드 전 확인창이 남아 있어도 REQ-IPA-007을 지킨다.
- full Free는 client가 확인한 현재 유일 project ID를 replacement로 보내야 한다. 서버 최신 ID와 다르면 stale.
- full Pro는 replacement가 필수이며 같은 owner, current available, target과 다른 ID여야 한다.
- Max는 capacity replacement를 요구하지 않으며 spare slot과 같은 추가 전용 branch다.
- 변경 성공은 target 추가와, full-cap branch에서만 확인된 replacement 제외를 적용하고 version CAS
  increment와 user `use-project` event를 같은 tx에 commit한다. fromPlan/toPlan은 현재 plan,
  basis는 user-selection이다. 이미 available인 no-op은 이 쓰기 단계로 들어오지 않는다.

제공된 replacement ID도 owner scope로 조회하며 다른 owner/없는 ID는 not-found로 처리한다.
service 결과는 success `{ version, availableProjectIds, changed }`, stale `{ currentVersion }`,
invalid-input/invalid-replacement/not-found/integrity/conflict 실패를 구분한다. feature adapter는 not-found를
기존 `notFound()`로 변환하고, 나머지를 feature-local `SelectProjectState`의 success/stale/error로
mapping한다. 문자열 reason 파싱으로 stale를 판별하거나 shared ActionResult를 전역 변경하지 않는다.
unauthenticated는 `requireUser`의 login 흐름을 보존한다. 일반 오류는 재시도 가능한 메시지를 표시하고,
화면 이탈은 이미 시작한 server transaction을 취소하지 않는다. 재진입 시 저장된 목록을 다시 읽는다.

selection은 ProjectToken, OwnerToken, Workspace, BoardItem, AgentRun, PipelineRun 또는 cursor를 update/delete/
close하지 않는다. commit 이전에 access를 통과한 요청은 완료될 수 있고, commit 뒤 시작한 요청부터
central access가 거부한다.

read model은 각 project의 **backlogItemId별** 최신 미폐기 BoardItem을 먼저 고른 뒤 `isOpen(status)`인 수와
`AgentRun.closedAt = null` 수를
집계한다. 이는 확인 시각의 advisory snapshot이며 selection version은 board/run 변화로 증가하지 않는다.
확인 뒤 수가 늘어도 data를 삭제·종료하지 않으므로 교체는 허용하고 모든 행을 보존한다.

### TASK-IPA-D2-05: MCP·template·runbook permission matrix와 owner adapter

- satisfies: REQ-IPA-003, REQ-IPA-010, REQ-IPA-011, REQ-IPA-016
- preserves: INV-IPA-006
- governed-by: CON-IPA-001, CON-IPA-003, CON-IPA-004
- verified-by: VFY-IPA-D2-02, VFY-IPA-D2-03

고정 recovery reason은 bootstrap-free `src/server/project-access-query.ts` 한 곳에서 소유한다.

> This project is not selected for use. Open Stagekeeper → Projects and choose “Use this project”.

Agent MCP의 `project_get`은 available project에도 `available: true`, selected-out에는
`available: false, reason`을 추가한다. D1의 `locked` key는 availability 의미로 더 이상 내지 않는다.
repoOwner는 public `owner` key로 mapping하고 direct/shadow field는 그 외 노출하지 않는다.

`AGENT_TOOL_NAMES`는 바꾸지 않는다. project_get을 제외한 project_sync, backlog_list/get,
board_list/get, board_propose/transition, plan_submit, report_submit, validation_record, pipeline_next,
agent_next 전부 callback 진입 직후 같은 guard를 거친다. `agentNext` service 내부 access도 direct 호출에 대한
defense-in-depth로 유지한다. selected-out fixture에서는 auth/access 조회만 허용하고 나머지 domain
dependency call count가 0인지 검사한다. `deps.access`까지 0이라고 단언하지 않는다.

`/api/templates`와 `/api/runbook`은 valid token 인증 뒤 403과 같은 reason을 반환하며 template load/
runbook write를 하지 않는다. Owner MCP는 token의 userId와 Project.ownerUserId가 같은지 먼저 확인하고,
아니면 `not the owner of this project`로 거부한다. 그 뒤
availability, sessionApprovals 순으로 검사한다.

웹 token page는 selected-out에서도 기존 agent/owner token revoke를 허용한다. issue와 owner gate는
거부한다. token 자체를 자동 revoke하지 않으며 다시 selected되면 기존 연결이 복구된다.

project_get의 D1 scalar/Workspace allowlist는 owner→repoOwner 조회·owner 출력 mapping 외 유지한다.
executorKind/commandIssue/runbookVersion/createdAt 및 Workspace id/projectId도 임의로 줄이지 않는다.
최종 JSON을 parse해 key/value/null/ISO 날짜와 verify/readOnly 배열 순서를 비교한다. Workspace 행 순서만
id 기준으로 정규화하고 runtime orderBy는 추가하지 않는다. selected-out reason과 integrity error,
available true의 reason 부재를 서로 다른 fixture로 검사한다.

### TASK-IPA-D2-06: project list·banner·read-only UX

- satisfies: REQ-IPA-007, REQ-IPA-008, REQ-IPA-009, REQ-IPA-012, REQ-IPA-014
- preserves: INV-IPA-002, INV-IPA-004, INV-IPA-006
- governed-by: CON-IPA-002, CON-IPA-007
- verified-by: VFY-IPA-D2-04

`loadProjectAvailability`는 user login/plan/limit/version, owned project ID/slug/name/repoOwner/repo/
available/impact, available count와 최신 availability event를 읽는다. event는 owner별 version 내림차순
첫 행이며 reason으로 먼저 필터링하지 않는다. 읽기 전체는 read-only RepeatableRead tx 안에서 수행하고,
첫 명령은 `SET TRANSACTION READ ONLY`, maxWait 5000ms/timeout 30000ms다. 같은 tx를 모든 하위
조회에 전달해 plan/count/set/version/event가 서로 다른 commit에서 섞이지 않게 한다. 실패 시 부분 목록을
정상 결과로 반환하지 않는다. route/FSD adapter가 Date와 DB
필드를 serializable UI model로 바꾸며 Client Component에 Prisma row를 넘기지 않는다.
UI limit은 `number | null`이며 null은 Max 무제한이다. availability 조회를 영속 cache에 넣지 않는다.
일관된 읽기·전체 transaction retry의 근거는
[PostgreSQL isolation 문서](https://www.postgresql.org/docs/current/transaction-iso.html)이며 실제 동시성은
아래 두 연결 DB verifier에서 별도로 증명한다.

`/projects`는 다음을 표시한다.

- `Projects` 제목 옆 `N / limit available`; Max는 `N available · unlimited`.
- 각 row의 `Available` 또는 `Not selected` badge.
- 기존 `projectPath(slug)` 프로젝트 정보 Link와 `Use this project` control은 sibling이다.
  repository 외부 URL로 진입점을 바꾸거나 button을 Link 안에 넣지 않는다.
- 최신 event가 system plan-downgrade이고 현재 plan이 그 toPlan과 같으면 basis와 kept set을 notice로
  표시한다. 후속 selection/registration event 또는 upgrade 후에는 옛 downgrade notice를 재노출하지 않는다.
  이는 현재 snapshot의 비차단 안내이며 영구적인 '한 번 읽음' 상태를 저장하지 않는다.
- spare slot의 Use는 confirmation 없이 즉시 action을 부른다.
- full Free는 유일한 current project와 impact를 보여 주고 `Use {target} instead` 확인을 받는다.
- full Pro는 current available 목록에서 replacement를 고른 뒤 해당 impact와 최종 확인을 보여 준다.
- pending 동안 중복 submit을 막고 success는 갱신된 payload를 받고, stale는 최신 목록을 다시 요청하며
  `Your project list changed. Review the latest selection and try again.`을 표시한다.

project 내부 selected-out banner는 같은 `UseProjectControl`과 read model을 재사용한다. 문구는 다음과 같다.

> This project is not selected for use. Open Stagekeeper → Projects and choose “Use this project”.

(2026-09-15 정정: 최초 계획은 "You can view it, but changes and agent tools are off."였으나 구현(`7e1678d`)은
MCP 거부 사유와 같은 한 문장을 `NOT_SELECTED_REASON`으로 통일하고 `product-copy.md` §10 Recovery에 현재
계약으로 기록했다. 브라우저 인수에서 이 계획서만 옛 문장을 갖고 있는 것을 발견해 현재 계약에 맞췄다.)

선택되지 않은 상태에서는 TurnBar/TurnBanner의 실행 지시를 숨기되 Inbox count와 read-only 데이터는
보존한다. Backlog add/edit/remove/propose, Inbox decision, item reopen, pipeline edit, token issue를 그리지
않는다. Tokens의 revoke만 남긴다. Server Action은 UI 부재와 별개로 중앙 guard를 다시 검사한다.

백로그 Source 읽기는 유지한다. 현재 route는 source를 editing prop으로만 넘기고 BacklogForm의 textarea가
전문을 표시하므로 폼만 제거하면 REQ-IPA-010의 웹 읽기도 사라진다. `BacklogRow`에 `source: string`을
추가하고 route의 rows mapping → ProjectBacklogPage → BacklogTable까지 전달한다. selected-out row는
title을 summary로 하는 native details 안에 `Source`와 전문을 일반 텍스트로 표시하고 줄바꿈을 보존한다.
available row의 기존 edit Link/form은 유지한다. `Show removed`에 포함된 행도 같은 읽기가 가능하며,
직접 `?edit=<key>`로 진입해도 selected-out이면 쓰기 폼 대신 위 읽기 경로만 제공한다. 새 fetch/action은
필요하지 않고 기존 `backlogWithStatus`가 이미 source를 반환하므로 DB query를 추가하지 않는다.

Client state는 control 내부 pending/replacement/error만 소유한다. control key는 target ID, version,
plan을 포함한다. plan-only 변경도 확인창을 초기화하고 자동 제출하지 않는다. stale 안내는 기존
`sonner` toast로 먼저 알린 뒤 확인 선택을 비우고 router.refresh한다. key 변경으로 component가
unmount되어도 root Toaster의 메시지는 유지된다. fresh payload를 받기 전 재제출을 막고, refresh 실패 시
명시적 새로고침으로 복구한다. success의 중복 router.refresh는 기본 경로에서 호출하지 않는다.

`router.refresh()`의 반환은 void이므로 await로 완료를 판정하지 않는다. action submission과 refresh에
각각 `useTransition` pending을 사용하고 둘 중 하나라도 pending이면 제출을 막는다. stale 결과를 받으면
replacement/confirmation을 명시적으로 비운 뒤 refresh transition을 시작한다. 완료 후에는 최신 props로
사용자가 다시 선택할 수 있으며 version/key가 바뀌는 것만을 복구 조건으로 삼지 않는다. full Free의 잘못된
replacement처럼 같은 version으로 stale가 반환되는 경우도 이 경로로 풀린다. Next의 실제 refresh transition
종료·오류는 browser protocol에서 확인하며 model test만으로 완료를 주장하지 않는다.

selection action 성공은 `revalidatePath("/projects")`와
`revalidatePath("/(app)/p/[slug]", "layout")`를 호출한다.
후자는 프로젝트 layout과 하위 탭·item detail 전체의 후속 방문을 갱신하기 위한 고정 route pattern이다.
literal project base path만 invalidation하면 하위 route 보장을 표현하지 못하므로 이를 대체한다.
client가 준 임의 path나 `/` layout은 받지 않는다. 현재 action response의 RSC 갱신을 사용하고,
stale는 DB write/revalidate 없이 client refresh만 수행한다. 별도 browser session은 push 갱신되지 않으므로
새로고침 전까지 snapshot일 수 있으며 모든 POST의 서버 재검사를 유지한다. CLI plan 변경도 Next cache
API를 호출하지 않고 다음 서버 읽기에 반영한다. 열린 화면에는 새로고침이 필요하다.

Next 근거는 설치된 `server-actions.md`, `revalidatePath.md`, `use-router.md`다. router.refresh는
unaffected useState를 보존하며 revalidatePath의 literal page와 layout pattern 범위는 다르다.
manual 검증은 target/replacement의 이미 방문한 모든 탭과 뒤로 가기까지 포함한다.

PipelineRail은 selected-out에서 +/Remove/Swap/Save를 숨기고 selection reason을 표시한다. Free의
plan-only 거부 문구와 혼동하지 않는다. graph의 persisted version/default, plan, available이 바뀌면
rail key도 바꿔 예전 draft/menu/confirmation을 폐기한다. token/backlog의 빈 상태는 각각
`No tokens yet.`, `No backlog items yet.`로 끝내어 사라진 발급·추가 폼을 가리키지 않는다.

### TASK-IPA-D2-07: current contract·template·static boundary cutover

- satisfies: REQ-IPA-010, REQ-IPA-014, REQ-IPA-016
- preserves: INV-IPA-002, INV-IPA-006
- governed-by: CON-IPA-001, CON-IPA-003, CON-IPA-006, CON-IPA-007
- verified-by: VFY-IPA-D2-03, VFY-IPA-D2-04

current architecture와 product copy를 runtime cutover와 같은 commit/PR에서 갱신한다. D2 상태를 최종
Member cleanup으로 과장하지 않고 다음을 명시한다.

- runtime ownership/access는 direct owner/available이다.
- legacy ProjectMember/Project.owner는 D3 rollback shadow이며 runtime read가 아니다.
- GitHub owner 외부 계약은 owner라는 이름을 유지한다.
- Available/Not selected는 user choice 상태이고 Locked/Paused가 아니다.
- project_get-only matrix, token revoke exception, in-flight request와 read-only no-write 경계.

`scripts/project-availability-runtime.test.ts`는 `src/app`, `src/server`, `src/fsd`의 runtime source를
열거하고 TypeScript AST로 import/alias와 Prisma query를 검사한다. generated와 `.test.*`는 runtime
검사에서 제외하며 fixture의 legacy 모델은 허용한다. runtime 허용은 register helper의 nested
`members.create`와 legacy `owner` write뿐이다. `requireMember`, projectMember의 find/count/aggregate/
groupBy 및 relation members read, Project.owner select/include/destructure, runtime activeProjectIds
import/re-export, availability 의미의 locked union/prop/body/copy는 금지다. raw query·동적 property·별칭을
읽지 않은 채 통과시키지 말고 해당 query의 모델/필드까지 수동 inventory로 닫는다. 구체적인 allowed/
forbidden fixture로 검사기 자체도 검증한다. TeamMember(에이전트), 일반 lock/CAS와 `on blocked`,
외부 repository DTO의 `owner`는 이 금지와 다르다.

private corpus가 준비되면 실제 모든 파일·언어·test를 열거하고 필요한 copy만 수정한다. template seed는
검토된 source와 snapshot test 통과 후 수행하며 D2 server/code와 같은 cutover에 배포한다. corpus가
없으면 이 task와 Phase exit는 blocked다.

본문 경로는 private source → `scripts/seed-templates.ts` → Template(lang,path,body) →
`packages/core/deliver.mjs`/`src/server/agents/steps.ts` → templates HTTP 또는 agent_next instruction이다.
seed는 현재 행별 upsert이므로 batch 전체가 atomic하다고 가정하지 않는다. traffic 중단 상태에서
적용 전 해당 template 행 snapshot을 보관하고, 적용 뒤 모든 언어/path/body와 stub·단계 분리·외부
`{{project.owner}}` 치환을 비교한 후 traffic을 연다. 실패/부분 seed 시 이전 검토된 body를 복원·검증한다.
기존 step ID/절차/도구 집합을 copy 수정으로 바꾸지 않는다. 실제 corpus가 없으므로 이 최종 body 검증은
현재 `not verified`이며 BLK-IPA-D2-01을 문서상의 예상 목록으로 해소하지 않는다.

## Runtime / Failure Matrix

| 시작 상태·행동 | 결과·복구 | 검증 |
| --- | --- | --- |
| D1 exit evidence 없음 | D2 운영 전환 금지; 후속 승인된 로컬 코드 검증과 구분 | entry checklist |
| ownerUserId/repoOwner null, owner relation/Project 없음 | legacy fallback 없이 integrity; project_get도 detail 0/error only | DB/security |
| 다른 user의 project/replacement ID | web not-found, owner MCP not-owner; 목록/version 노출 없음 | DB/security |
| available project GET | 기존 화면·도구 정상, hidden write 없음 | route/MCP |
| selected-out project GET | 웹 read와 project_get만; 실행 control/turn 지시 없음 | permission/UI |
| selected-out backlog / Show removed / edit query | Source 전문 읽기 유지, 추가·편집·제거·제안 form/action 없음 | table render + 실제 browser |
| selected-out mutation direct POST | owner여도 central reason, zero domain write | action matrix |
| selected-out token revoke | agent/owner revoke만 성공 | DB/action |
| selected-out project_sync | 403/failure, Workspace/language/lastSyncedAt 불변 | MCP DB |
| project_sync success | Workspace/language/lastSyncedAt atomic | injected failure DB |
| upgrade/same capacity | Subscription만 변경, exact set/version/event 보존 | service |
| downgrade under new cap | Subscription 변경, exact set/version/event 보존 | service |
| downgrade over cap | current set만 ranking trim, plan/set/version/event atomic | service + core |
| plan change와 selection 동시 | version/CAS 또는 serialization으로 한쪽 fresh 결과; invariant 유지 | two connection DB |
| registration 동시 | direct-owned cap과 Serializable로 상한 초과 없음 | two connection DB |
| registration 성공/실패 | 성공만 project/token/dual owner/version/event; 실패 zero partial | DB/action |
| Use target already available + current version | idempotent success, timestamp/version/event write 0 | service |
| Use target already available + old version | success로 바꾸지 않고 stale, timestamp/version/event write 0 | service |
| spare slot Use | target만 추가, lastSelectedAt/version/event commit | service/UI |
| upgrade 뒤 오래된 replacement 입력 + spare slot | 같은 owner ID 검증 후 target만 추가, replacement 제외 없음 | service/UI |
| full Free stale replacement | current unique ID 불일치면 stale zero-write | two session |
| full Pro missing/invalid replacement | error zero-write | service/UI |
| 두 browser version N | 첫 commit N+1; 둘째 stale와 refresh | two session |
| impact snapshot 뒤 새 run | 교체 허용, 새/기존 run 모두 보존; 새 요청부터 access 거부 | DB/manual |
| selection commit 전 통과한 mutation | 완료 가능; commit 뒤 새 요청부터 거부 | barrier DB |
| P2034/내부 CAS 충돌 | 최초 포함 3회, 100/200ms; client expectedVersion 고정, stale는 retry 없음 | injected/two connection |
| read model 조회 사이 다른 selection commit | plan/set/count/version/event가 한 snapshot, 부분 정상 반환 없음 | read barrier DB |
| stale 뒤 refresh/plan-only props 변경 | toast 유지, 확인창 reset, fresh payload 전 재제출 금지 | 두 browser sessions |
| 같은 version의 stale 뒤 refresh | key remount 없이 confirmation reset; refresh transition 종료 후 명시적 재선택 가능 | model + 실제 browser |
| 취소/화면 이탈/응답 유실 | 미제출은 write 0; 제출한 tx는 완료 가능, 자동 replay 없이 새 조회 | service/manual |
| D1 backfill --apply after cutover | CLI가 연결/쓰기 전에 명시 거부 | CLI |
| old D1 writer와 D2 writer overlap | 허용하지 않음; traffic/writer drain 실패 시 cutover 중단 | rollout checklist |
| code rollback to D1 | data/token/run 보존, old oldest-N access; writer 재개 없이 격리 smoke 후 D2 re-entry 검증 | rollback smoke |

## Final Artifact Resolution Map

| 최종 산출물 | source/precedence | 최종 body/state | 검증 목적지 |
| --- | --- | --- | --- |
| exact available set | Project.available + ownerUserId | user별 cap 이하 stored set | service/DB snapshot |
| plan state | plan-change service transaction | Subscription + optional set/version/event | concurrency DB |
| selection event | registration/plan/select service only | sorted diff/snapshot, actor/reason/basis/version | event query |
| project access | project-access-query → entitlement facade | available union + one recovery reason | injected query + 실제 DB + every consumer matrix |
| sync state | deps.projectSync → project-sync-query → DB transaction | 성공만 Workspace/language/lastSyncedAt commit | production helper의 실제 DB rollback |
| web ownership | requireProjectOwner destination check | not-found indistinguishability | route/direct POST |
| project_get JSON | project-query repoOwner adapter + tools serializer | external owner, available; reason only false; no shadow IDs | parsed final body |
| other MCP result | same central access before domain deps | selected-out error body, auth/access 외 calls 0 | registry handlers |
| template/runbook HTTP | token auth → central access → route response | selected-out 403 reason | actual Response body |
| project list UI | read-only snapshot → page adapter → project-list/feature | count/badge/impact/Use, 최신 전체 event notice, stale toast | collected .test.mjs + browser/manual |
| project internal UI | owner/access → layout/pages | banner/read-only/revoke/Use exceptions | route/manual |
| backlog Source body | backlogWithStatus → route rows → BacklogRow → table details | selected-out에서도 전문·줄바꿈·removed 행 읽기, mutation 없음 | backlog-table.test.mjs + browser |
| repository owner external DTO | Project.repoOwner → adapter owner | harness/MCP/link vars unchanged | body/URL/template vars |
| pipeline read | loadCurrentVersionView → page/turn graph adapter | persisted null의 unsaved default, zero DB write | query log/row snapshot |
| browser refresh | action revalidatePath → project layout subtree + root Toaster | 하위 탭 fresh payload, stale 메시지와 plan-aware reset | 실제 Next browser protocol |
| current contract | runtime + architecture/product copy + private templates | direct owner/Not selected language aligned | rg/snapshot/manual |
| CI boundary | package script → runtime static test/check workflow | legacy runtime read regression fails CI | npm run check |

## Verification Detail

Canonical verifiers:
[VFY-IPA-D2-01](./2026-09-15-individual-project-availability.md#vfy-ipa-d2-01-순수-selection-policy),
[VFY-IPA-D2-02](./2026-09-15-individual-project-availability.md#vfy-ipa-d2-02-plan과-selection-transaction),
[VFY-IPA-D2-03](./2026-09-15-individual-project-availability.md#vfy-ipa-d2-03-웹mcp-permission-matrix),
[VFY-IPA-D2-04](./2026-09-15-individual-project-availability.md#vfy-ipa-d2-04-프로젝트-선택-ux).

### Verification detail for VFY-IPA-D2-01

1. Free/Pro/Max의 upgrade, same plan, downgrade-under-cap, downgrade-over-cap을 검사한다.
2. 후보는 current available만이며 excluded 최신 project가 자동 복원되지 않는다.
3. lastSelected/activity/sync/createdAt/id의 모든 tie/null/epoch 조합과 input immutability를 검사한다.
4. added/removed/snapshot은 ID 오름차순이고 trim이 없으면 basis null이다.
5. D1 initial migration은 owner 전체, D2 plan change는 current set이라는 차이를 regression fixture로 고정한다.

### Verification detail for VFY-IPA-D2-02

1. registration은 direct-owned cap, Project/legacy member/token/version/event atomicity와 P2002/P2034 rollback을 검사한다.
2. plan grant는 target plan validation, invalid existing plan normalize, upgrade preserve, downgrade trim을 actual tx로 검사한다.
3. project_sync success/failure/selected-out 각각에서 Workspace/language/lastSyncedAt을 전후 비교한다.
4. selection은 spare, full Free, full Pro, Max, already selected, wrong owner, invalid replacement와 stale를 검사한다.
5. concurrent registration, plan-vs-selection, selection-vs-selection을 same primary 독립 연결로 실행한다.
   plan-vs-plan 및 set을 바꾸지 않는 upgrade/under-cap downgrade와 registration/selection도 양 순서로 검사한다.
6. success event의 version/diff/snapshot/basis와 failure event 0을 비교한다.
7. `ProjectMember`, Project.owner, token/run/cursor row의 ID/값이 의도한 registration shadow 외 불변인지 확인한다.
8. 이미 selected인 target의 current-version no-op와 old-version stale를 별개로 검사한다. spare/Max에서
   유효한 replacement를 보내도 제거가 없고, 다른 owner ID는 어떤 branch에서도 거부되는지 확인한다.
9. P2034/CAS 재시도 횟수·delay·fresh reads·expectedVersion 고정, 소진/timeout/연결 실패와 commit 결과
   불명확 시 자동 replay 부재를 injected service test에 둔다. 실제 DB에서는 rollback과 event 1회를 대조한다.
10. 목록과 central access의 read-only snapshot 도중 plan/selection commit barrier를 두어 섞인 결과가
    없고 query 자체 write가 0인지 검사한다. plan-only update의 version/event 보존도 확인한다.
11. DB fixture는 `readProjectAccess`와 `syncProject`를 실제 client로 호출한다. 전자는 owner/plan/available
    query와 snapshot 옵션을, 후자는 기존 upsert key·language 생략·cap/접근 거부·중간 실패의 원자성을 검사한다.
    가짜 access 응답이나 테스트 전용 sync SQL로 production helper 실행을 대체하지 않는다.

### Verification detail for VFY-IPA-D2-03

1. web matrix는 owner/other user × available/selected-out × read/write/revoke/use action을 검사한다.
2. 모든 project page GET이 selected-out에서 domain write 0인지 확인한다. 특히 PipelineVersion/Run 생성이 없어야 한다.
3. agent MCP의 13개 tool을 정확히 열거하여 project_get 외 12개가 auth/access 외 domain dependency call 전에 같은 reason으로 실패하는지 검사한다.
4. project_get의 available true/false body, reason 조건부, repoOwner→owner mapping과 shadow field 부재를 JSON.parse로 검사한다.
5. owner MCP는 owner mismatch → availability → plan → gate 순서와 dependency call count를 검사한다.
6. templates actual Response의 200/401/403/404와 runbook의 200/400/401/403을 각각 검사한다.
   runbook의 malformed JSON/invalid version은 available에서 400이며 selected-out은 access 순서상 403이다.
   4xx body는 `{ error: reason }`, runbook 성공은 `{ ok: true }`다. template load/runbook write 0을 검증한다.
7. selection 전후 token/Workspace/AgentRun/PipelineRun/cursor 전체 값 보존과 재선택 후 기존 token 재개를 검사한다.
8. integrity fixture는 owner null/repoOwner null/Project 없음/owner relation 없음으로 나누고 project_get
   detail 미호출·error-only를 검사한다. 다른 user의 selection target/replacement는 존재 여부가 드러나지 않는다.
9. web mutation 목록은 Inventory의 8개 backlog/propose/review/pipeline action과 issueToken/issueOwnerToken,
   revokeToken/revokeOwnerToken 및 selection이다. UI에 버튼이 없어도 direct POST로 검증하고, 각 route의
   auth/owner guard를 layout 검사로 대체하지 않는다.

### Verification detail for VFY-IPA-D2-04

1. `/projects`: 0 project, Free 1, Pro spare/full, Max, downgrade notice를 render한다.
2. row의 Link와 button이 중첩되지 않고 badge/count/CTA의 accessible name이 상태와 일치하는지 검사한다.
3. spare direct action, Free confirmation, Pro replacement selection, cancel, pending 중복 차단을 수행한다.
4. two-session stale에서 둘째 UI가 최신 version/list로 reset되고 자동 replacement를 실행하지 않는지 검사한다.
5. impact 0/여러 open BoardItem/AgentRun과 확인 뒤 새 run 생성의 advisory 의미를 검사한다.
6. selected-out project의 모든 tab을 열어 read data는 보이고 mutation control은 Use/revoke 외 없음을 확인한다.
7. project를 다시 선택한 뒤 같은 token, roster, board, pipeline cursor로 작업이 이어지는지 확인한다.
8. `/projects`에서 교체한 뒤 이미 방문했던 두 프로젝트의 Board/Backlog/Inbox/Items/Pipeline/Tokens로
   이동·뒤로 가기를 수행해 layout과 control이 갱신되는지 확인한다. internal tab에서 실행한 교체도 반복한다.
9. stale toast가 version key remount 뒤에도 보이는지, plan만 바뀌었을 때 확인창이 reset되는지,
   fresh payload/명시적 재확인 없이 재제출되지 않는지 확인한다. 다른 session에는 자동 push를 기대하지 않는다.
10. 최신 downgrade 후 manual selection/registration/upgrade가 있으면 옛 notice가 사라지는지 검사한다.
    unsaved pipeline에는 가짜 저장 시각이 없고 selected-out에는 +/Remove/Swap/Save와 발급·추가 폼 안내가 없다.
11. selected-out backlog에서 여러 줄 Source 전문을 열고 Show removed 및 직접 edit query 진입을 검사한다.
    텍스트는 보존되고 저장/제거/제안 action은 없으며 다시 selected되면 기존 편집 경로로 돌아와야 한다.
12. 같은 version의 stale를 만들어 refresh pending 중 submit 차단, 완료 뒤 재선택 가능, toast 유지와
    confirmation reset을 확인한다. cancel·refresh 실패·route 이탈 뒤에도 자동 제출이 없어야 한다.

## Verification Commands와 Evidence State

다음은 D2 공통 검증 명령이다. 후속 로컬 구현에서 실제 실행한 결과는 아래 구현 기록에 구분해 남긴다.
private corpus와 실제 DB가 필요한 명령까지 실행됐다는 뜻은 아니다.

```bash
npm run db:validate
npm run db:generate
npm run sync:plugin-lib
npm run test:project-availability
npm test
npm run test:web
npm run test:templates
npm run check
npm run verify:fsd
npm run test:architecture
npm run build
```

`test:templates`는 private corpus가 checkout/seed staging에 있을 때만 유효하다. DB integration은
별도 `scripts/rehearse-project-availability-d2.ts`가 소유한다. runner는
`IPA_D2_REHEARSAL_DATABASE_URL`과 `--allow-fixtures`가 모두 있어야 시작하고 빈 격리 DB인지 확인한다.
package.json에는 아래 exact command를 추가하고 `verification.md`에 mode/cleanup을 기록한다.

```json
{
  "test:project-availability": "node --import tsx --test \"scripts/project-availability*.test.ts\"",
  "test:project-availability:d2:db": "node --import tsx scripts/rehearse-project-availability-d2.ts"
}
```

실행은 `npm run test:project-availability:d2:db -- --allow-fixtures`다. D1 schema 적용과 valid backfill
snapshot 구성 후 D2 service/route fixture를 수행하며 same-primary 독립 연결을 사용한다. 대상 DB나
production에서는 destructive fixture suite를 실행하지 않는다.

이 JSON은 기존 scripts의 두 항목만 추가/교체한다. check의 기존 unit 연결과 CI Node 22 test:web은
유지한다. Node integration에서 `server-only` wrapper나 실제 Next route를 직접 import하지 않는다.
DB runner는 injected service/registration, `readProjectAccess`, `syncProject`, MCP registry와 query factory를
사용한다. 새 helper의 type-only 경계와 deps/facade 배선은 test:web·type/build로 함께 확인한다.
실제 route Response, 인증 session, Server Action/RSC/뒤로 가기는 별도 실행한 D2 Next 환경에서
VFY-IPA-D2-03 및 VFY-IPA-D2-04 manual protocol로 관측한다. fake deps 통과를 실제 route 통과로 보고하지 않는다.

DB runner의 초기화는 확정된 D1 schema/migration과 격리 fixture를 사용한다. 기존 D1 runner는 main과
DB 생성 side effect가 있으므로 import해서 재사용하지 않는다. legacy baseline은 현재 HEAD가 아니라
`0eef5cb777e6ff6f4343cd2d4a1a9c03f4eac70b`의 schema/기존 10 migrations로 고정한다.
D1 additive migration은 entry evidence의 경로/digest와 일치해야 한다. D2 source 이후 HEAD에는 D1
migration이 포함될 수 있으므로 기존 D1 runner의 HEAD 기반 추출도 이 고정 baseline으로 바꾼다.
register helper의 plan input 제거와 공통 Serializable retry를 기존 runner caller에도 전파한다.
이 호환 runner의 결과를 과거 D1 binary 자체의 exit evidence로 재사용하지 않는다.

runner는 기존 D1 snapshot 비교 규칙(PK별 전체 값, Workspace 행만 정렬, 필드 배열 순서 유지)을 따른다.
DB/fixture 준비 후 D1 내부 apply를 실행할 수 있으나 D2 lifecycle 시작 전으로 제한하며 production CLI는
사용하지 않는다. args/env 미충족과 비어 있지 않은 사용자 schema/catalog는 fixture write 전 거부한다.
child는 spawn argv와 전용 env로 실행한다. SIGINT/SIGTERM은 새 tx 시작을 막고 미commit tx를 rollback하며,
finally에서 child 종료를 기다린 뒤 listener/client/pool과 자신이 만든 임시 directory만 해제한다.
실패한 격리 DB는 보존하고 broad reset/delete는 하지 않는다. 정상·실패·취소의 cleanup을 unit/runner
검증에 포함한다. secret/URL/hash/raw row 값은 보고서에 출력하지 않는다.

| 검증 | 상태 | 비고 |
| --- | --- | --- |
| parent + D1 + D2 standard traceability | PASS | 3 files, TASK 12, REQ phase/task·verifier coverage 16/16 |
| selected-Phase semantic review | 개선 반영; entry 증거 미확인 | D2 7 Tasks의 owner/VFY, lifecycle, permission, artifact, rollback 검토. clean pass 증거 아님 |
| D2 implementation unit/build | PASS | 후속 코드 구현 요청으로 실행. 아래 로컬 구현 기록 참조 |
| D1 isolated PostgreSQL rehearsal | Replaced (2026-09-14) | 격리 DB 없음. 실제 DB single-transaction rehearsal(ROLLBACK)로 대체. D1 문서 운영 적용 기록 |
| target DB preflight/backfill check | PASS (2026-09-14) | D1 migration + backfill SQL 적용, `--pre` issue 0. D1 문서 운영 적용 기록 |
| private template inventory/tests | PASS (2026-09-15) | corpus 10 en 파일 본문에 Member/locked/oldest 없음. `templates.test.mjs` fixture `locked:false`→`available:true`, 23/23. DB Template 행 10개 hash 동일, seed 불필요 |
| 실제 DB 브라우저 protocol | PASS 부분 (2026-09-15) | 아래 "D2 운영 전환·인수 기록" |

Strict validator는 선택하지 않는다. explicit bundle의 부모가 D1/D3까지 포함한 broad graph이고 현재 D2가
entry blocker를 가진 pending plan이므로 strict 결과를 D2 readiness filter로 사용할 수 없다. standard bundle
validation과 D2 satisfies→VFY semantic coverage를 별도로 사용한다.

## Definition of Done / Handoff

2026-09-15 판정. "unit"은 injected test만, "live"는 실제 DB·브라우저 관측을 뜻한다.

- [x] D1 actual DB exit evidence와 private template inventory가 entry gate를 통과함. (2026-09-14 / 09-15)
- [x] direct owner/available만 runtime에서 읽고 legacy membership/owner read가 CI에서 0임. (`project-availability-runtime.test.ts`, D3 이후 schema 자체에 없음)
- [x] registration/plan/select transaction과 event/version invariant — live: 등록 v2, 하향 v3, 선택 v4·v5가 각각 version 1 증가·event 1개. sync는 unit만.
- [x] available count ≤ cap, owner project ≥1 available — live Free 하향 뒤 `1 / 1 available`, `--post` 검사 cap 위반 0.
- [x] upgrade 보존/downgrade trim — live: max→free에서 활동 있는 harness-smoke 유지, 근거 `recent agent activity`; free→max 복귀 시 set 불변(version 그대로 5). unit: 나머지 조합.
- [x] user selection의 target/replacement 한정 변경 — live Free 교체 2회. stale/invalid zero-write는 unit만.
- [ ] old-version already-selected stale, spare/Max replacement 무시 — unit만.
- [ ] 읽기 snapshot 격리와 bounded retry — unit만. 격리 DB concurrency runner 미실행.
- [x] project page GET의 hidden write 0 — live: selected-out 5개 탭을 연 전후 `--post` preserved fingerprint가 선택 event 외 변화 없음(PipelineVersion 3 유지).
- [x] selected-out 백로그 Source 전문·removed 행 읽기 — live로 확인(제거된 FEAT-01 행 details 열어 원문 표시).
- [x] permission matrix의 공통 reason — unit(`tools.test.mjs`, `owner-tools.test.mjs`, templates/runbook query tests). live MCP 호출은 하지 않았다.
- [x] selected-out 전후 token 17/workspace 1/run 21 보존과 재개 — live count 동일, 재선택 뒤 Turn 화면 복귀.
- [x] `/projects`·배너의 count/status/Use/impact — live. **stale은 미관측**(두 세션 필요).
- [ ] plan-only reset, remount 뒤 toast, 하위 탭/뒤로 가기 갱신 — 미관측. unsaved/read-only pipeline은 live 확인.
- [ ] 같은 version stale 복구 — 미관측.
- [ ] production access/sync helper의 실제 DB 실행 — 격리 runner 미실행. runtime 자체가 실제 DB에서 helper를 실행한 것으로 대체.
- [x] repoOwner → 외부 owner key mapping — unit + live 목록의 `Sangeok/harness-smoke` 표시.
- [x] old writer drain → catch-up → retirement — 서버를 끈 상태에서 D1 backfill → D3까지 적용해 writer overlap 구간이 없었다.
- [ ] D1 runner 고정 baseline/D2 caller — runner는 D3에서 삭제되어 해당 없음.
- [x] architecture/CONTEXT/product-copy/private templates가 runtime과 일치함. (계획서 602행 문구만 이번에 정정)
- [x] evidence 기록 — 아래 운영 전환·인수 기록.
- [x] D3는 별도 approval 뒤 시작 — 같은 세션에서 D3 적용을 별도로 승인받았다.

## Rollout / Observability / Rollback

### Cutover

1. D1 rehearsal, target preflight, migration/backfill/check와 rollback smoke를 완료한다.
2. private templates 전체 inventory/copy tests와 seed staging을 완료한다.
3. old plan:grant/registration 및 웹·MCP traffic을 막고 기존 in-flight 작업이 끝날 때까지 drain한다.
   agent_next의 활동 기록과 project_sync까지 정지되어야 한다. 실행 중인 D1 apply도 종료를 기다린다.
4. 정지 상태를 유지한 채 검토된 D1 binary로 마지막 ownership preflight/catch-up/--check를 수행하고,
   source snapshot·event/version을 기록한다. 이어 D1 operational apply를 폐기한다. check 뒤 writer가
   다시 실행됐거나 drain 증거가 없으면 snapshot을 유효하다고 보고 배포하지 않는다.
5. D2 code와 current-contract/template data를 한 cutover로 배포한다. old/new writer overlap을 허용하지 않는다.
6. direct owner null/mismatch, exact set cap, event/version, permission matrix smoke를 확인한 뒤 traffic을 연다.
7. registration/use-project/plan-downgrade/stale/unavailable reason을 기존 server log에서 식별한다. token/hash/
   DB URL, repo URL, login은 새 log에 남기지 않는다.

Next 16 Server Action ID는 deploy 사이에 바뀔 수 있다. old client action failure는 refresh로 새 action reference를
받아 복구하도록 generic action error를 유지한다. 이 이유로도 D2는 old/new writer가 섞이는 긴 rolling window를
사용하지 않는다.

### Rollback

- selection/plan/registration writer와 traffic을 먼저 멈춘다.
- D1 build로 code rollback한다. legacy ProjectMember/Project.owner는 D2 registration도 dual-write했으므로
  schema/data 재구성 없이 이전 code가 읽을 수 있다.
- 새 availability/event/version/timestamp 행과 token/run은 삭제하지 않는다.
- D1 runtime은 stored exact set이 아니라 old oldest-N을 계산하므로 rollback 동안 사용 가능 project가 D2 선택과
  다를 수 있다. 이는 기능 rollback의 명시적 제한이며 data loss가 아니다.
- rollback smoke 동안 production writer/agent traffic은 계속 중단한다. D1 registration/plan writer를
  재개하고도 저장된 D2 set이 유효하다고 가정하지 않는다. D2 재진입 전 D2 invariant/event snapshot의
  일치와 shadow owner를 read-only로 확인한 뒤에만 traffic을 연다. D1 writer가 이미 재개되어 drift가
  생겼으면 자동 재배포/백필을 중단하고 실제 변경을 보존하는 별도 복구를 결정한다.
- D2 event/lastSelectedAt/lastSyncedAt이 생긴 뒤 D1 backfill `--apply`를 다시 실행하지 않는다.
- D2 CLI의 --apply는 연결 전 exit 2로 거부한다. dry-run/check의 lifecycle-started는 실패 보고이며,
  lifecycle 흔적이 없다는 결과도 old binary apply의 재실행 허가가 아니다.
- owner/project/token/Workspace/AgentRun/PipelineRun row와 MCP project_get legacy body를 rollback 전 snapshot과 비교한다.

## Readiness / Approval

- Verdict: **BLOCKED** (2026-09-14 작성 시점) → **Completed with recorded gaps** (2026-09-15). 아래 두 blocker는
  해소됐고, 미관측 항목은 DoD와 운영 전환·인수 기록에 남겼다.
- Current entry blockers: D1 actual DB exit evidence 부재, BLK-IPA-D2-01 private template corpus 부재.
- User decision required: 없음. 제품 정책은 부모에서 확정됐고 현재 필요한 것은 predecessor/external artifact evidence다.
- Local code authority: 후속 사용자 요청으로 코드·현재 코드 문서·로컬 검증이 승인됨.
- Forbidden while blocked: 운영 template seed와 runtime/direct owner cutover. D2 CLI는 --apply를 거부하므로
  최종 D1 catch-up은 승인된 D1 배포본으로 수행한 뒤 D2를 배포한다.
- Approval note: 로컬 구현 승인과 Phase 완료·운영 전환 승인을 구분한다. entry evidence 없이 배포하지 않는다.
- D2 완료는 D3 schema drop 권한이 아니다.

## Risks

- old D1 writer overlap은 registration event 누락 또는 plan/set 불일치를 만들 수 있다. traffic drain이 필수다.
- selected-out read page의 숨은 pipeline materialization을 놓치면 web read-only 계약을 위반한다.
- 영향 count는 advisory snapshot이므로 confirmation 뒤 증가할 수 있다. 데이터는 보존되고 새 요청만 차단된다.
- code rollback은 data를 보존하지만 old oldest-N access로 일시 회귀한다.
- physical owner FK는 D3까지 nullable이므로 entry/runtime fail-closed와 null monitoring이 필요하다.
- private template의 실제 language/file 집합이 미확인이라 현재 copy inventory는 불완전하다.

## 2026-09-14 Reconciliation 기록

`reconciling-proposals-with-codebase`의 fresh/full HIGH-RISK 검토에서 개선점이 확인되어 반영했다.
검토 source는 부모 SDD·D1 계획·이 D2 계획과 위 current architecture/code inventory다.
부모와 D1의 내용·canonical ID는 보존했다.

| 확인한 문제 | 수정된 구현 지침과 검증 목적지 |
| --- | --- |
| stale보다 already-selected 성공이 우선 | 부모 REQ-IPA-012에 따라 version 검사를 우선; VFY-IPA-D2-02의 두 branch |
| spare/Max의 이전 replacement 처리 불명확 | owner 검증 뒤 target만 추가; VFY-IPA-D2-02/04 |
| read model snapshot·retry·오류 경계 누락 | read-only snapshot, 공통 3회 retry, commit 결과 불명확 시 재조회; service/DB barrier |
| nullable repoOwner와 integrity project_get 노출 가능 | legacy fallback 금지, integrity error-only; 최종 JSON/permission matrix |
| 읽기용 pipeline view와 편집 UI의 구체 계약 누락 | persisted null/default graph, 실제 rail·empty copy 수정; GET zero-write와 browser protocol |
| refresh/remount·plan-only reset·오래된 notice 모순 | plan-aware key, 기존 toast, 전체 event 조회, 하위 layout 갱신; VFY-IPA-D2-04 |
| 누락된 caller·script bootstrap·테스트 수집 경로 | create action/rail/D1 runner inventory, injected service, .test.mjs와 정확한 scripts |
| HTTP 상태·MCP dependency 검증 기대가 부정확 | runbook 400과 templates 404 분리, auth/access 제외 domain call 0, 공개 body 전체 비교 |
| 마지막 check와 writer drain 순서·rollback 재진입 공백 | drain 뒤 catch-up/check, writer 중단을 유지한 rollback 검증, template partial seed 복구 |

문서 검증은 standard 3-file traceability, D2 Task/VFY 의미 대조, shell/JSON/front matter와 경로 검사로
수행한다. 구조 검사는 구현·DB·브라우저 실행 결과가 아니다. Completion 절의 TBD는 실행 후 채울
evidence 항목이며 미정 제품 정책으로 사용하지 않는다.

최종 저장본은 수정 없이 다시 대조해야 한다. 전체 reconciliation의 `clean pass achieved`는 현재
선언하지 않는다. D1 VFY별 actual DB/rollback evidence와 private 전체 corpus/body가 없어 INV-1/2/5의
완전한 closure를 확인할 수 없기 때문이다. 상태는 `clean pass not completed`, D2 readiness는 BLOCKED다.
다음 검토는 이 두 입력을 확보해 실제 inventory·artifact와 대조하며, 이 기록을 무결점 보증으로 쓰지 않는다.

같은 날 후속 fresh/full 검토에서도 다음 세 영역의 추가 개선점이 있었다. 이전 표는 앞선 검토 이력이다.

| 추가 확인 | 근거와 반영 |
| --- | --- |
| read-only 전환이 Source 읽기까지 없앰 | backlog route는 source를 editing에만 전달하고 form만 전문을 표시함. rows/type/details에 읽기를 보존하고 render/browser 검증 추가 |
| 같은 version stale의 복구 종료가 불명확 | Next refresh는 void이고 state를 보존함. key 변경에 의존하지 않는 confirmation reset과 refresh transition pending 명시 |
| 실제 DB verifier가 접근할 access/sync 구현 목적지 누락 | entitlement/deps가 server-only이므로 Node runner에서 직접 import할 수 없음. bootstrap-free production query를 추출하고 facade/registry/DB 검증 경로를 연결 |

## D2 로컬 구현 및 검증 기록 — 2026-09-14

- 범위: TASK-IPA-D2-01~07의 이 저장소 코드, 공개 계약 문서와 검증 도구를 구현했다.
  private 원본 변경·DB seed·운영 DB 적용·실제 브라우저 인수는 미실행이다.
- 구현: pure plan policy, direct owner/access query, registration/plan/selection atomic service,
  sync transaction, 모든 agent/owner MCP guard, owner adapter, read-only pipeline view,
  Use/replace/stale UI, Source 읽기·token revoke 보존, D1 CLI apply 폐기와 runtime AST 경계 검사.
- 검증 목적지: 신규 server query/service tests, selection model, project-list/backlog-table/pipeline-rail render tests,
  기존 MCP/agent/template/runbook tests와 scripts/project-availability-runtime.test.ts.
- `npm test`: PASS, 154 tests. 최초 sandbox의 loopback listen EPERM 뒤 허용된 범위로 재실행했다.
- `npm run test:web`: PASS, 273 tests. project_get 확장 body 기대값과 read-only optional node 표시 회귀를 포함한다.
- `npm run check`: PASS. lint·FSD·type·architecture 19 tests·availability script 16 tests 포함.
- build: 중간 `npm run build`는 통과했지만 최종 Turbopack 재실행은 권한 확장 뒤에도 로컬 포트
  binding EPERM으로 중단됐다. `npm run build -- --webpack`으로 production build/type/route 검증을 통과했다.
  DB 접속을 하지 않는 생성/빌드에는 CI의 loopback DATABASE_URL placeholder를 사용했다. 기본 bundler 설정은 바꾸지 않았다.
- D2 DB runner: `node --import tsx scripts/rehearse-project-availability-d2.ts`가 필수 URL/flag 없을 때 exit 2로
  거부함을 확인했다. 실제 PostgreSQL suite 통과로 보고하지 않는다. 현재 D1/D2 rehearsal URL과 로컬
  postgres/initdb/docker가 없다.
- 독립 UI 검토: Full applicable-lens review — cohesion/coupling/predictability/readability/TypeScript 5개 완료,
  N/A·누락 없음. 중립 gate가 PRED-1/READ-1을 D2-FE-1로 병합 승인했다. 읽기 전용 optional node를
  required로 표시하던 오류를 고치고 실제 render regression 2개로 확인했다.
- 계획 보완: pipeline-rail.test.mjs를 추가했다. D2 격리 runner는 main side effect가 있는 D1 runner를
  import하지 않고 child process로 실행해 고정 baseline fixture를 구성한 다음 실제 D2 helper를 검사한다.
- 잔여 검증: 실제 DB concurrency/rollback/cleanup, page GET zero-write·direct POST·브라우저 stale/refresh,
  private 모든 언어/body/seed 및 D1 운영 exit evidence. 이 항목 전에는 Phase 완료나 배포 가능을 주장하지 않는다.
- D1 schema와 additive migration, 부모·D1 proposal은 이 구현에서 변경하지 않았다. 기존 사용자 변경을 보존했다.

## D2 운영 전환·인수 기록 — 2026-09-14/15

### 운영 전환

D2 runtime 코드는 D1·D3와 함께 PR #42(`dev@2128881`)에 있다. 2026-09-14 14:21~14:23Z에 dev 서버가 꺼진 상태로
D1 migration → backfill → D3 migration을 적용했으므로, D2 runtime이 실제 DB를 읽은 첫 시점부터 schema는
최종(D3) 상태였다. D1 shadow만 있는 구간에서 D2 코드가 돈 적은 없다. 적용 뒤 `npm run db:generate`로 로컬
client를 재생성했다(이전 생성물은 `ProjectMember`가 남고 event model이 없는 옛 것이었다).

### private template corpus (BLK-IPA-D2-01)

`plugin/templates`는 별도 git 저장소(`fd50763`)로 로컬에 있었다. en 파일 10개(`agents/{pm,dev,plan-verifier,
doc-auditor,feature-scout}.md`, `CLAUDE.runbook.md`, `docs/agents/README.md`, `docs/plans/{README,template,
verification-paths}.md`) 본문에 Member/locked/oldest 문구 없음. 실패하던 것은 `templates.test.mjs:49`의 가짜
access 응답 `{ plan: "pro", locked: false }`뿐이라 `{ plan: "pro", available: true }`로 고쳤다
(`npm run test:templates` 16/23 → 23/23). DB `Template` 행 10개는 원본과 LF 정규화 후 hash가 같아 seed하지
않았다. DB에만 있는 `en/CLAUDE.runbook.free.md` 행은 `deliver.mjs`가 건너뛴다. 이 fixture 수정은 private
저장소에서 아직 commit되지 않았다.

### 브라우저 인수 (2026-09-15, 로컬 dev 서버 + `neondb`)

사용자 1명(max, 프로젝트 1개)뿐이라 선택되지 않은 상태를 만들려고 임시 데이터를 넣고 끝난 뒤 되돌렸다.
인증은 `AUTH_SECRET`으로 만든 세션 쿠키를 한 번만 응답하는 로컬 페이지로 심었다(값은 파일로만, 끝나고 삭제).

| 단계 | 관측 | event |
| --- | --- | --- |
| `/p/new`에서 `codingTest` 등록 | `/projects` `2 available · unlimited`, 둘 다 Available | v2 `registration` |
| `npm run plan:grant -- Sangeok free` | `1 / 1 available`; 안내 "After your plan changed, these projects remained available: harness-smoke. Selection basis: recent agent activity."; codingtest `Not selected` + `Use this project` | v3 `plan-downgrade` |
| `/p/codingtest/backlog` | 배너 + `1 / 1 available` + Use 버튼; 백로그 추가 폼 없음, `No backlog items yet.` | — |
| Use → 확인창 | "harness-smoke will no longer be selected. 0 open board items · 0 open agent runs. Data, tokens, and run cursors are kept. …" / `Use codingtest instead` / `Cancel` | — |
| 확정 | 새로고침 없이 같은 화면이 Setting up 배너·추가 폼으로 바뀜; `lastSelectedAt` 기록 | v4 `use-project` |
| `/p/harness-smoke/backlog?removed=1` | 배너; 제거된 행 9개 읽기, FEAT-01 details 열면 `Source` 원문(줄바꿈 포함); 편집 링크 없음 | — |
| `/p/harness-smoke/tokens` | 발급 폼 없음; 활성 토큰 3개에 `Revoke`만; owner 토큰 발급 없음 | — |
| `/p/harness-smoke/pipeline` | +/Remove/Swap/Save 없음; 레일 아래 선택 사유 표시(플랜 문구와 구분) | — |
| 배너 Use → `Use harness-smoke instead` | Turn 화면(`Nothing open`)으로 복귀, 플랜 문구 `Pipeline editing opens on Pro`로 전환 | v5 `use-project` |
| `npm run plan:grant -- Sangeok max` | set 불변, version 5 유지 | (없음, plan-only) |
| codingtest 삭제 (guard 있는 1회성 SQL, SHA-256 `09e94291…`) | `--post` ok, preserved `17809152…`; `/projects` 1개 Available | — |

전 구간에서 harness-smoke의 ProjectToken 17, AgentRun 21, Workspace 1이 유지됐다. 서버 로그에는
`project-availability:not-selected {projectId}`와 `project-availability:plan-change`만 남았다.

인수에서 찾은 것과 처리:

- `/projects` 행의 배지가 `Not selected` 행에서만 가운데로 밀림 → closeout PR에서 배지·Use 버튼을 한 묶음으로.
- 프로젝트 배너의 `Use this project` 버튼이 배너 폭으로 늘어남(모든 탭) → 같은 PR에서 `self-start`.
- 이 계획서 602행의 배너 문구가 구현과 다름 → 위에서 정정.
- 파이프라인의 사유 두 번 표시, 토큰 소개 문구는 계획·현재 계약대로라 결함 아님.

### 미관측 (잔여 리스크)

두 세션 stale·같은 version stale 복구, Pro 교체 대상 선택, direct POST 거부, 하위 탭/뒤로 가기 갱신,
plan-only 확인창 reset, `project_sync`의 `lastSyncedAt`, live MCP 호출 body, 격리 DB concurrency runner.
사용자가 Pro이거나 두 브라우저를 쓰는 시점에 확인한다.

## Completion or Closure Notes

- completed-at: 2026-09-15
- verification-summary: front matter 참조.
- implementation PR/commit: `7e1678d` (PR #42). 인수 후 수정과 이 기록은 `harness/ipa-closeout` PR.
- changed files summary: 부모 SDD Completion 절 참조.
- D1 entry evidence: D1 문서 운영 적용 기록 (2026-09-14).
- private template inventory/seed evidence: 위 corpus 절. seed 없음, test fixture 1줄 수정(private 저장소 미commit).
- D3 handoff: 같은 세션에서 D3 cleanup까지 적용. D3 문서 운영 적용 기록 참조.

취소 시에는 closed-at/by/reason, partially deployed code/data/template 상태와 rollback 필요 사항을 기록하고
completed 경로로 이동한다.

## Review Checklist

- [x] 부모 REQ/INV/CON/VFY/BLK를 재정의하지 않고 D2 Task만 소유한다.
- [x] 현재 D1 worktree를 predecessor 후보로 관측하고 실제 DB 완료로 과장하지 않았다.
- [x] direct owner, exact set, registration/plan/select/sync transaction을 구체화했다.
- [x] web/MCP/template/runbook/agent/owner-token permission과 revoke 예외를 열거했다.
- [x] selected-out GET의 hidden write와 pipeline version materialization을 검증 대상으로 포함했다.
- [x] FSD public API, Server/Client boundary, revalidation과 client state reset을 명시했다.
- [x] runtime legacy read 금지와 D3 rollback shadow write 허용을 구분했다.
- [x] concurrency, stale, retry, in-flight, partial deploy, rollback limitation을 다뤘다.
- [x] Business/delete/pause/billing/cache/D3 cleanup을 제외했다.
- [x] planned/executed/not-executed evidence를 구분했다.
- [x] D1 actual DB entry evidence — 2026-09-14 대상 DB 적용.
- [x] private template corpus inventory/tests — 2026-09-15 확인, 23/23.
- [x] Phase D2 local code implementation — 후속 사용자 요청으로 승인·실행.
- [x] Phase D2 운영 전환/완료 승인 — DB 적용·브라우저 인수(부분)·잔여 리스크 기록으로 완료 처리.
