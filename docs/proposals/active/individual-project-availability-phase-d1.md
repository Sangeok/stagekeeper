---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-09-13"
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
  - "docs/proposals/active/individual-project-availability.md"
---

# 개인 프로젝트 사용 목록 — Phase D1 상세 계획

- Drafting mode: PHASE_PLAN
- Selected Phase: D1 — Additive ownership and availability foundation
- Risk / reconciliation profile: HIGH-RISK
- Implementation readiness: CONDITIONALLY READY — 구현·격리 검증 계획은 구체화됨. 대상 DB 적용은 아래 실행 조건 충족 필요
- Authoritative source: [부모 SDD](./individual-project-availability.md)
- Parent snapshot: SHA-256 `907dd11b40f405f56e58e30ca9815d9e0d8a1b3f918d8fd7eed279b22925a26d`
- Evidence baseline: `dev@0eef5cb777e6ff6f4343cd2d4a1a9c03f4eac70b`, 2026-09-13.
  조사 시작 시 부모와 D1 proposal 두 파일이 untracked였다. 부모는 읽기 전용으로 보존한다.
- Authority: 현재 요청은 D1 문서 검증·개선이다. 아래 코드는 구현 지시이며 구현 결과가 아니다.

## Summary

D1은 직접 소유권과 사용 목록을 담을 저장 구조를 추가하고 기존 데이터를 이관한다.
기존 `ProjectMember`, `Project.owner`, `activeProjectIds()`, 웹·MCP 접근 판정은 계속 동작한다.
등록 경로에는 새 필드를 함께 쓰고, MCP 응답은 기존 공개 필드로 고정해 추가 열이 외부로 새지 않게 한다.

D1의 `available`은 **D2 전환을 준비하는 DB snapshot**이다. 사용자에게 별도의 임시 선택 상태를
보여주는 것이 아니다. 기존 접근 판정과 새 정렬 결과는 초과 사용자에서 다를 수 있으므로 각각
검증한다. D1 종료 증거는 특정 DB snapshot에 대한 것이며 이후 등록·플랜·활동 변화까지 보증하지 않는다.

## Goal / Proposal Size

- 새 데이터 구조와 기존 runtime을 함께 운영할 수 있는 경계를 구체화한다.
- preflight, 재실행 가능한 백필, 등록 동시 실행, 오류와 rollback을 실제 검증 대상으로 만든다.
- `proposal-size: standard`: schema, DB 이관, 공개 JSON과 등록 transaction에 영향을 주며
  HIGH-RISK의 데이터 보존·검증 조건이 필요하다.

## Source Bundle와 완료 범위

부모의 REQ/INV/CON/Phase/VFY/BLK 정의는 부모에 그대로 둔다. 이 문서는 기존
`TASK-IPA-D1-01`부터 `TASK-IPA-D1-05`까지의 실행 세부사항을 소유한다.

| Canonical record | D1에서의 의미 |
| --- | --- |
| 부모 REQ-IPA-015 | D1 snapshot의 소유권·사용 목록 이관과 기존 데이터 보존을 검증한다. 실제 새 접근 판정 적용은 D2 |
| 부모 REQ-IPA-001, REQ-IPA-004, REQ-IPA-005, REQ-IPA-013, REQ-IPA-016 | 기반만 기여. 사용자 선택, 플랜 변경·원장 runtime, owner-only 접근을 D1 완료로 주장하지 않음 |
| 부모 INV-IPA-004, INV-IPA-006 | 등록 개수 제한 및 연결·토큰·실행 데이터 보존 |
| 부모 CON-IPA-002, CON-IPA-003, CON-IPA-006 | core/server/FSD 경계, 외부 owner 키 호환, legacy 삭제 금지 |
| 부모 VFY-IPA-D1-01, VFY-IPA-D1-02 | 아래에서 검증 목적지·fixture를 상세화. canonical verifier는 재정의하지 않음 |
| 부모 BLK-IPA-D1-01 | 실제 DB 소유권 preflight 통과는 DB 적용 전 실행 조건 |
| 부모 BLK-IPA-D2-01, BLK-IPA-D3-01 | private template 확인과 destructive cleanup 복구는 후속 Phase의 entry 조건 |

현재 아키텍처 근거는 [README](../../architecture/README.md),
[FSD](../../architecture/fsd.md), [검증 규칙](../../architecture/verification.md)이다.
부모의 과거 evidence에 나온 REQ 전체 coverage 16/16은 D1 runtime 동작 16개가 구현됐다는 뜻이 아니다.

## Current-Code Reconciliation

| 관측 근거 | 최초 문서의 문제 | 해소 방법 / 목적지 |
| --- | --- | --- |
| `prisma/schema.prisma`의 ProjectMember 복합 키는 project당 owner 하나를 강제하지 않음 | 일반 member·owner 0/2를 임의 이관할 위험 | T03의 전체 preflight와 적용 transaction 내 재검사 |
| `src/server/mcp/deps.ts:projectGet`은 Project 전체 scalar와 workspaces를 반환 | 새 열이 owner ID와 shadow availability까지 공개 JSON으로 노출 | T04의 명시적 select; body key/value 검증 |
| `scripts/grant-plan.ts`는 Subscription만 변경 | 완료 marker가 있으면 skip하는 백필은 이후 플랜 변경을 놓침 | T03은 매번 현재 source snapshot을 읽고 비교; 변경 시 새 이관 원장 |
| `createProject()`는 신규 row와 membership/token을 생성 | 기존 이관 event snapshot과 새 project 집합이 달라짐 | T04 dual-write + T03 재실행. event 존재만으로 skip 금지 |
| `src/server/entitlement.ts:planForUser`는 누락뿐 아니라 잘못된 plan도 free 처리 | 백필에서 알 수 없는 plan을 바로 limitsFor에 넘기면 runtime과 불일치 | 같은 normalize 규칙 사용; raw plan은 변경하지 않음 |
| `scripts/lib/prisma.ts`는 server-only 앱 DB와 분리된 bootstrap | 스크립트/테스트에서 server-only 서비스 import 시 실행 실패 | CLI와 주입 가능한 로직 분리, type-only Prisma import |
| `package.json`, `.github/workflows/check.yml` | scripts의 새 .test.ts가 기존 test/test:web/test:architecture에 수집되지 않음 | `test:project-availability`를 `check`에 연결 |
| 생성 client의 `models.ts`, `internal/class.ts` | 현재 로컬 생성물에 PipelineVersion/PipelineRun/runbookVersion이 누락 | schema·migration을 기준으로 baseline부터 재생성 후 검증 |
| 부모 최종 관계의 onDelete Cascade | D1에 바로 적용하면 User 삭제가 기존과 달리 Project/child 삭제를 유발 | D1 nullable FK는 SetNull, 최종 Cascade는 D3 상세 계획에서 처리 |
| 현재 schema·migration과 legacy reader | 이관 직후 항상 최신이라는 주장은 성립하지 않음 | snapshot 시각 명시, D2 cutover 직전 catch-up 필수 |
| `node_modules/@prisma/adapter-pg/dist/index.js`와 client runtime | 재시도 횟수·격리수준이 “구현 때 결정”으로 남음 | T03 Serializable/CAS, P2034에 한정한 3회 시도 |
| DB 이관·DDL 검증 경로 없음 | fake deps와 row count만으로 실제 rollback·FK·내용 보존을 입증하지 못함 | T05 실제 PostgreSQL rehearsal 및 legacy payload 전체 비교 |
| 등록은 Project/ProjectMember를 한 transaction에서 생성; PostgreSQL ReadCommitted는 statement별 snapshot | 별도 조회를 섞은 preflight가 정상 등록을 orphan/owner 누락으로 오인 가능 | T03 전체 preflight·사용자별 dry-run/check에 각각 일관된 read-only snapshot |
| `projectGet`의 workspaces 조회에는 orderBy가 없음; Workspace.verify/readOnly는 배열 필드 | JSON 문자열 또는 모든 배열 정렬 비교는 각각 오탐 또는 실제 변경 누락 가능 | T04 행 집합만 ID로 정규화, 필드 값·배열 순서는 그대로 검증 |

관측 버전: Prisma/client/adapter-pg 7.10.0, Next 16.3.3, TypeScript 5.9.3.
로컬 Node는 26.4.0이고 CI는 Node 22다. Node 22에 없는 mock/module API를 테스트에 사용하지 않는다.

## Scope와 구체적 Inventory

Core는 D1 코드와 격리 DB 검증, Approval-after는 이미 부모가 요구한 대상 DB 확인·실행 승인 후 적용이다.
Phase 2는 D2의 실제 접근·UI 전환이다. 아래 표 밖의 일반 기능 리팩터링은 Out of scope다.

| 분류 | 경로 (제안 파일은 신규라고 표시) | 작업·symbol | 검증 목적지 |
| --- | --- | --- | --- |
| Core | `packages/core/entitlement.mjs` | 새 `availableProjectIds` export 추가; old 함수·limits 보존 | entitlement.test.mjs |
| Core | `packages/core/entitlement.test.mjs` | new/old 순서와 경계 테스트 | npm test |
| Generated | `plugin/lib/entitlement.mjs` | core byte copy | `node scripts/plugin-lib.mjs --check` |
| Core | `prisma/schema.prisma` | D1 nullable relation·새 scalar·event model | db:validate, generated type, pg catalog |
| Core | `prisma/migrations/`의 신규 `*_add_individual_project_availability_foundation/migration.sql` | 실행 시 Prisma가 timestamp directory 생성; 한 개의 additive DDL migration | T05 migration SQL·catalog 검사 |
| Core | `scripts/lib/project-availability-migration.ts` (신규) | `checkOwnership`, `planOwnerBackfill`, `applyOwnerBackfill`, `readOwnerSnapshot`; 모든 snapshot 조회에 해당 tx 주입 | migration unit + 일관된 읽기/쓰기 DB rehearsal |
| Core | `scripts/check-project-ownership.ts` (신규) | legacy columns만 사용하는 단일 read-only snapshot CLI preflight | pre-/post-schema·동시 등록 DB fixture |
| Core | `scripts/backfill-project-availability.ts` (신규) | dry-run / --check / --apply dispatcher | argument/zero-write tests, real DB |
| Core | `scripts/project-availability-migration.test.ts` (신규) | DB 없는 unit/negative tests, provenance·package wiring 검사 | test:project-availability → check → CI |
| Core | `scripts/rehearse-project-availability.ts` (신규) | 격리 DB fixture·DDL·backfill·payload·rollback assertion | test:project-availability:db |
| Core | `src/server/project-registration-query.ts` (신규) | `registerProjectIn`: deps로 받은 tx에서 기존 count/create 및 dual-write | project-registration-query.test.ts |
| Core | `src/server/project-registration-query.test.ts` (신규) | 등록 transaction 호출·결과 검증 (server-only bootstrap 없음) | test:web + DB rehearsal |
| Core | `src/fsd/features/create-project/api/create-project.server.ts` | 기존 action이 같은 transaction에서 registerProjectIn 호출 | 새 service test·등록 UI smoke |
| Core | `src/server/mcp/project-query.ts` (신규) | `PROJECT_GET_SELECT`, `loadProjectView` (주입된 finder 사용) | project-query.test.ts + DB rehearsal |
| Core | `src/server/mcp/project-query.test.ts` (신규) | 기존 JSON key/값·배열 순서 보존, Workspace 행 집합 비교 및 새 field 미노출 | test:web |
| Core | `src/server/mcp/deps.ts` | projectGet만 loadProjectView에 배선 | 실제 query + tools serializer |
| Core | `package.json` | 아래 정확한 scripts 추가, check에 unit suite 연결 | JSON parse 후 실제 command 실행 |
| Core | `docs/architecture/verification.md` | 신규 script의 mode·수집 명령·제거 조건 inventory | 문서/명령 대조 |
| Generated | `src/generated/prisma/` | schema에 맞춘 client/model/runtime 재생성 | generator/type/build/catalog 교차검사 |
| Read-only | `prisma.config.ts`, `scripts/lib/prisma.ts`, `src/server/db.ts` | datasource와 DB lifecycle 근거 | args/환경/cleanup 검증 |
| Read-only | `scripts/plugin-lib.mjs`, `scripts/verify-fsd-boundaries.mjs` | 복사본·FSD 검사기 | 기존 architecture tests |
| Read-only | `src/server/mcp/tools.ts`, `src/server/mcp/tools.test.mjs`, `src/app/api/mcp/route.ts` | serializer와 tool 집합·locked 동작 보존 | 같은 registry를 사용한 body 비교 |
| Read-only | `src/fsd/features/create-project/index.server.ts`, `model/create-project-state.ts`, `ui/new-project-form.tsx`, `src/app/(app)/p/new/page.tsx` | action public API·form·성공 token 화면 | build·fixture UI smoke |

표 안에서 축약한 create-project의 model/ui 상대 경로는
`src/fsd/features/create-project/`를 기준으로 한다. 신규 파일들의 상위 디렉터리는 현재 존재하며
대상 파일 충돌은 없다. migration timestamp는 유일한 생성 경로 변수이며 적용 시 실제 경로와 digest를
결과에 기록한다.

Generated inventory는 현재 `client.ts`, `browser.ts`, `models.ts`, `enums.ts`,
`commonInputTypes.ts`, `internal/class.ts`, `internal/prismaNamespace.ts`,
`internal/prismaNamespaceBrowser.ts`와 schema model별 `models/<Model>.ts`다.
최종 model 집합은 User, Subscription, Project, ProjectMember, ProjectToken, OwnerToken, Workspace,
BacklogItem, BoardItem, TransitionEvent, Report, Template, Command, AgentRun, AgentRunStep,
PipelineVersion, PipelineRun, **ProjectAvailabilityEvent**다. 파일 수를 기존 15개 model에 맞추지 않는다.

### 허용 범위와 보존 범위

- 변경 파일은 위 Core 및 Generated 목록에 한정한다. 기존 migration의 수정·삭제는 금지한다.
- `src/server/mcp/deps.ts` 예외는 출력 필드 고정만 허용한다. 소유권·locked 판정, project_sync,
  agent_next 또는 tool 집합 변경은 D2 범위다.
- MCP 비교를 안정화하려고 runtime에 orderBy를 추가하거나 verify/readOnly 배열을 정렬하지 않는다.
  T04의 Workspace 행 순서 정규화는 검증 코드에만 적용한다.
- `src/server/entitlement.ts`, `src/server/auth/guard.ts`, `scripts/grant-plan.ts`,
  `src/server/agents/runs.ts`, `src/server/pipeline/run.ts`, project-list/헤더/배너의 기존
  membership 읽기는 보존한다. D1 신규 ranking 함수는 runtime에 연결하지 않는다.
- 삭제·자동 pause·0개 선택·Business·MCP guard 강화·토큰 폐기·lastSyncedAt 수집은 D1에서 금지한다.
- 기존 도메인 row 보존 대상: User의 기존 필드, Subscription, Project의 기존 필드, ProjectMember,
  ProjectToken, OwnerToken, Workspace, BacklogItem, BoardItem, TransitionEvent, Report, Template,
  Command, AgentRun, AgentRunStep, PipelineVersion, PipelineRun.
- 등록 action의 신규 Project/ProjectMember/initial ProjectToken 생성은 원래 동작으로 허용한다.
  “token에 쓰지 않는다”는 백필에 대한 금지이며 정상 등록까지 금지하는 것이 아니다.
- 앱 코드의 `scripts/lib` import, script/test의 앱 DB/server-only value import, private template 편집,
  부모 및 다른 proposal의 편집은 금지한다.
- 대상 DB 적용은 포함된 완료 단계다. 문서만 검토하는 이번 턴에는 실행하지 않는다.

## Symbol / Import Provenance

| symbol | 현재 owner → D1 owner/public export | 후속 import·consumer | 검증 |
| --- | --- | --- | --- |
| availableProjectIds | 없음 → core/entitlement.mjs named export | scripts/lib에서 ../../packages/core/entitlement.mjs | unit, copy import, type |
| activeProjectIds, limitsFor, isPlan, DEFAULT_PLAN, capError | core 기존 named export 유지 | 기존 runtime unchanged, script는 isPlan/limits/default 재사용 | 기존·신규 unit |
| registerProjectIn | action의 count/create body → server/project-registration-query.ts named export | action이 @/server/project-registration-query 사용, test/rehearsal은 상대 import | tx rollback/type/build |
| createProject | FSD api 파일 그대로 | 기존 index.server.ts → /p/new route → NewProjectForm action prop | public export·입출력·UI 보존 |
| PROJECT_GET_SELECT, loadProjectView | deps의 projectGet read → mcp/project-query.ts | deps는 ./project-query, test/rehearsal은 상대 import | 최종 JSON body |
| withPrisma | scripts/lib/prisma.ts 유지 | CLI가 args 검증 후 dynamic import | missing env/unknown arg/cleanup |
| Prisma 타입 | generated/client.ts → internal/prismaNamespace.ts | 순수 주입 helper에는 import type만; 연결은 기존 bootstrap | fresh generate + typecheck |
| server Prisma singleton | server/db.ts 그대로 | FSD action, mcp/deps의 기존 boundary | Next build |

## Phase D1

- Parent boundary: [Phase D1](./individual-project-availability.md#phase-d1-additive-ownership-and-availability-foundation)
- satisfies: REQ-IPA-015
- preserves: INV-IPA-004, INV-IPA-006
- governed-by: CON-IPA-002, CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D1-01, VFY-IPA-D1-02
- intermediate validity: 새 fields는 준비 snapshot, 기존 읽기·응답 계약 유지. 등록은 양쪽 owner를 쓴다.
- exit: 이 문서의 T05와 DoD를 만족하는 snapshot evidence 확보.
- downstream: D2에 가기 전 새로 변한 source를 대조해야 한다. D1 완료는 D2 자동 실행 승인이 아니다.

### TASK-IPA-D1-01: 새 정렬 함수를 기존 정책 옆에 추가

- satisfies: REQ-IPA-015
- preserves: INV-IPA-004
- governed-by: CON-IPA-002, CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D1-02

`availableProjectIds(candidates, limit)`는 `Set<string>`을 반환한다. 입력의 id는 중복 없는 string,
timestamp는 유효한 Date 또는 명시적 null, createdAt은 필수다. 잘못된 입력이나 limit은
명시적 오류로 처리한다. limit은 0 이상의 안전한 정수 또는 Infinity만 허용한다.

비교 순서는 lastSelectedAt, lastAgentActivityAt, lastSyncedAt, createdAt 내림차순, id 오름차순이다.
각 nullable timestamp에서 non-null이 null보다 먼저 온다. null을 epoch 0으로 치환하지 않는다.
동점일 때만 다음 기준을 비교한다. 문자열 locale에 의존하지 않는 ID 비교를 쓴다.

빈 배열/limit 0은 빈 Set, Infinity는 전체 ID다. 배열·Date를 변경하지 않는다.
부모 정책의 limit 값은 `limitsFor(normalizedPlan).projects`로 전달한다.
D1 script는 생성 snapshot에 lastSelectedAt/lastSyncedAt을 null로 전달한다. 이 두 값이 이미
저장돼 있으면 D2 또는 다른 writer가 개입한 것으로 보고 T03 apply를 중단한다.

기존 activeProjectIds와 모든 기존 테스트는 그대로 둔다. 새 함수 테스트는 동일 module 옆에 둔다.
`node scripts/plugin-lib.mjs --check`로 baseline drift를 확인한 뒤 `npm run sync:plugin-lib`로
동기화하여 의도한 entitlement 복사본만 변했는지 diff를 검사한다.
다른 복사본 drift는 D1 변경인 것처럼 덮어쓰지 않는다. 검사 성공은 exit 0이며,
`.mjs` 파일을 셸에서 직접 실행하거나 실행 권한을 변경하는 방식으로 대체하지 않는다.

### TASK-IPA-D1-02: additive schema와 실제 migration 명령 확정

- satisfies: REQ-IPA-015
- preserves: INV-IPA-004, INV-IPA-006
- governed-by: CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D1-01

D1의 schema delta는 다음과 같다. 부모의 최종 required owner/Cascade는 아직 적용하지 않는다.

| 대상 | D1 추가 필드·관계 |
| --- | --- |
| User | projectAvailabilityVersion Int @default(0); ownedProjects Project[] @relation("ProjectOwner"); projectAvailabilityEvents ProjectAvailabilityEvent[] |
| Project | ownerUserId String?; repoOwner String?; available Boolean @default(true); lastSelectedAt DateTime?; lastSyncedAt DateTime? |
| Project.ownerUser | User? @relation("ProjectOwner", fields: [ownerUserId], references: [id], onDelete: SetNull, onUpdate: Cascade) |
| Project index | @@index([ownerUserId, available]) |
| Event | 부모 ProjectAvailabilityEvent model의 모든 필드·user relation·두 index |

부모 event의 id/default(now()), String[] 배열, nullable fromPlan/toPlan/basis,
`@@unique([ownerUserId, version])`와 `@@index([ownerUserId, at])`를 정확히 유지한다.
User collection은 optional list가 아니라 Prisma 관계 배열이다.
기존 schema 필드·FK/index에는 어떤 drop/rename/constraint 강화도 하지 않는다.
특히 nullable owner FK의 SetNull은 D1에서 User 삭제가 Project와 하위 원장을 연쇄 삭제하지 않게 한다.
최종 Cascade와 NOT NULL은 D3 검토 대상이다.

`prisma.config.ts`는 env(DATABASE_URL)를 즉시 해석한다. 격리 development DB에서만 다음을 수행한다.

```bash
npm run db:migrate -- --create-only --name add_individual_project_availability_foundation
```

`--create-only`도 dev/shadow DB를 사용할 수 있다. 운영 DB를 가리키면 안 된다.
SQL은 BEGIN/COMMIT으로 감싼 additive DDL만 담고 데이터 이관은 T03이 수행한다.
preflight를 통과하기 전 이 migration을 적용하지 않는다.
대상 DB의 기존 migration history는 마지막
`20260911011905_project_runbook_version`까지 적용됐는지 먼저 확인한다.

배포에는 아래 로컬 설치 Prisma 명령을 사용한다.

```bash
node node_modules/prisma/build/index.js migrate status
node node_modules/prisma/build/index.js migrate deploy
npm run db:generate
```

새 schema로 재생성한 앱을 schema 적용 전에 배포하지 않는다.
CLI 도움말만으로 생성물 최신 여부를 가정하지 않고 generate를 별도 실행한다.

### TASK-IPA-D1-03: snapshot 기반 preflight·백필·catch-up

- satisfies: REQ-IPA-015
- preserves: INV-IPA-004, INV-IPA-006
- governed-by: CON-IPA-002, CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D1-01, VFY-IPA-D1-02

**CLI 계약**

- `check-project-ownership.ts`: read-only. 전체 Project와 ProjectMember를 읽어 owner 정확히 1,
  role != owner 없음, 유효한 Project/User reference를 확인한다. 이상을 모두 모아 ID와 issue code를
  출력한다. token/hash, repo URL, 사용자 login, 본문은 출력하지 않는다.
- 이 preflight의 모든 Prisma query는 **기존 열만 명시적 select**한다. 새 client를 사용해도 migration
  전 DB에서 실행 가능해야 한다. 새 event/model을 사용하는 모듈을 top-level import하지 않는다.
- 전체 User/Project/ProjectMember 조회는 **하나의 read-only RepeatableRead transaction**에 넣는다.
  페이지 분할을 하더라도 같은 tx 안에서 읽고, 검사와 apply 대상 User ID 목록도 그 snapshot으로 만든다.
  서로 다른 시점의 Project와 membership을 섞어 가짜 orphan/owner 누락을 만들지 않는다.
- `backfill-project-availability.ts`: args 없음은 dry-run, `--check`는 zero-write 검증,
  `--apply`만 mutation이다. 모드 중복·모르는 args는 연결 전 exit 2, --help는 연결 없이 exit 0.
- preflight의 정상 exit 0/이상 exit 1, 백필 --check의 drift exit 1. 연결 오류·apply 실패 exit 1.
  missing DATABASE_URL은 기존 withPrisma의 exit 2를 유지한다.
- CLI만 bootstrap을 import한다. 로직·unit test는 dotenv·DB 연결 side effect가 없고 주입된 DB를 쓴다.
  callback 안에서 process.exit를 호출하지 않고 finally의 disconnect가 끝난 뒤 process.exitCode를 정한다.

**비교할 입력과 이관값**

1. 최초 whole-DB preflight가 실패하면 전체 apply에서 아무것도 쓰지 않는다.
2. User ID 오름차순으로 사용자별 transaction을 연다. 각 transaction 안에서 해당 snapshot의 User,
   전체 소유 Project/ProjectMember, Subscription, AgentRun/AgentRunStep 집계, 기존 이관 event를
   다시 읽는다. dry-run/--check도 동일한 입력 전체를 사용자별 read-only RepeatableRead tx로 읽고,
   --apply는 아래 Serializable 쓰기 tx에서 다시 읽는다. preflight/dry-run의 결과를 apply 입력으로
   재사용하지 않는다. `readOwnerSnapshot`과 그 하위 query에는 해당 tx만 주입하고 바깥 client로
   조회를 우회하지 않는다.
3. plan은 `isPlan(row?.plan) ? row.plan : DEFAULT_PLAN`로 normalize한다. 이상 문자열은 warning
   code만 내고 Subscription 자체는 수정하지 않는다.
4. 기존 선택 history가 없는 **초기 migration**은 모든 소유 프로젝트를 후보로 삼는다.
   D2의 plan-change가 current available 후보만 줄이는 것과 구분한다.
5. activity는 run이 생성된 시각과 그 run에 속한 모든 결과 at의 최대값이다. 열린/종료 run 모두 포함하며
   step 재조회(outcome 없음)는 새 row를 만들지 않는다는 현재 next.ts 동작을 보존한다.
6. 유일한 owner row → ownerUserId, Project.owner → repoOwner. null은 채우고 동일 값은 유지한다.
   다른 non-null 값은 자동 덮어쓰기하지 않는다. owner integrity 또는 shadow 불일치는 해당 transaction
   rollback과 command 실패로 처리한다.
7. plan limit 이하면 전부 available=true, 초과면 T01 결과만 true. lastSelectedAt/lastSyncedAt은
   null로 남기며 createdAt을 연결/사용자 선택 기록으로 위조하지 않는다.

**재실행과 원장**

`migration-backfill` event의 존재 자체는 완료 판정이 아니다. 매번 owner mapping, 현재 계획된
available 집합, 실제 shadow 값, 최신 event의 plan/version/snapshot을 비교한다.

- 최초 baseline이거나 새 프로젝트·플랜 변화·활동 변화로 이관 결과가 달라지면, 실제 current set에서
  desired set으로 변경하고 version을 1 증가시킨 뒤 system migration-backfill event를 추가한다.
- 입력이 바뀌어도 결과와 mapping·normalized plan·기존 원장이 동일하면 no-op이다.
- event는 수정·삭제하지 않는다. 동일 snapshot 재실행은 version/event 수를 늘리지 않는다.
- event의 added/removed는 transaction 시작의 actual shadow set 대비 차집합이며 전체 snapshot은
  ID 오름차순 배열이다. 최초 default-true에서 줄어들면 removed에 초과 ID가 기록된다.
- fromPlan은 직전 migration event의 toPlan(없으면 현재 normalized plan), toPlan은 현재 normalized
  plan이다. 이는 D1 준비 snapshot의 관측 변화이며 실제 Subscription 변경 event라고 표시하지 않는다.
- basis는 정렬의 첫 번째 유효 근거를 사용한다. under-cap처럼 정렬 선택이 필요 없으면 null이다.
  Pro의 각 후보별 ranking 근거는 dry-run 보고에 따로 남겨 단일 basis가 전체 비교를 대신하지 않게 한다.
- 프로젝트가 0개인 신규 사용자는 version 0/event 0 유지. 이미 이관된 사용자의 프로젝트가 모두
  사라졌다면 지원하지 않는 ownership/data 변화로 실패하고 D1 도구가 빈 선택을 만들지 않는다.
- lastSelectedAt/lastSyncedAt non-null, user event 또는 migration-backfill 외 reason이 보이면
  `lifecycle-started`로 중단한다. D2 전환 후 이 도구의 --apply 실행은 운영 절차에서도 금지한다.

**transaction·동시성·종료**

전체 preflight와 사용자별 dry-run/--check의 `$transaction`에는 RepeatableRead,
maxWait 5000ms, timeout 30000ms를 명시한다. tx callback의 첫 DB 명령으로 고정 SQL
`SET TRANSACTION READ ONLY`를 Prisma의 tagged `$executeRaw`로 실행한 뒤 legacy/read query를 수행한다.
읽기 tx에서는 row write/lock을 하지 않는다. timeout/연결 실패 시 부분 조회를 정상 판정으로
보고하지 않고 exit 1로 실패한다. 재실행하면 새로운 snapshot을 읽는다.

PostgreSQL의 ReadCommitted는 같은 tx 안에서도 SELECT마다 다른 snapshot을 읽을 수 있고,
RepeatableRead는 첫 조회에서 정해진 snapshot을 후속 조회에 유지한다.
[근거: PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).
전체 preflight와 각 사용자 snapshot은 서로 다른 관측 시점이다. 보고의 asOf도 해당 검사 단위에
한정하며 전체 백필이 하나의 고정 snapshot이거나 이후 commit까지 확인했다는 뜻으로 쓰지 않는다.

사용자별 **--apply** `$transaction`에 Serializable, maxWait 5000ms, timeout 30000ms를 명시한다.
version 갱신은 `User.updateMany({ where: { id, projectAvailabilityVersion: readVersion }, ... })`의
count 1을 요구하고 event도 같은 tx에 추가한다. count 0은 내부 retryable CAS 충돌이다.
P2034 또는 이 CAS 충돌만 최초 포함 3회 시도하며 100ms/200ms 뒤 전체 transaction을 새로 읽는다.
일반 P2002, FK 오류, integrity 오류, timeout, 연결 오류는 자동 retry하지 않는다.

Prisma 7.10 adapter는 PostgreSQL 40001/40P01을 TransactionWriteConflict로, client runtime은 이를
P2034로 변환한다. 근거 파일은 `node_modules/@prisma/adapter-pg/dist/index.js`와
`node_modules/@prisma/client/runtime/client.js`다.

preflight 이후 다른 writer가 끼어드는 경우 사용자별 tx에서 다시 검출한다. 이미 이전 사용자에서
commit한 준비 데이터는 남을 수 있으며 command는 completed/failed/unprocessed ID를 보고한다.
부분 완료를 전역 zero-write로 잘못 설명하지 않는다. 재실행하면 최신 snapshot 기준으로 수렴한다.

백필과 등록이 겹치거나 기존 plan:grant가 실행되면 어느 순서로 commit됐는지에 따라 준비 snapshot이
달라질 수 있다. D1은 운영 상태를 그대로 유지하며 `--check`로 차이를 알리고 `--apply`로 따라잡는다.
사용자 단위 동시성만으로 전체 서비스의 모든 writer를 차단했다고 주장하지 않는다.
CLI는 SIGINT/SIGTERM listener를 한 번만 등록해 취소 flag를 세운다. 각 await 뒤와 tx callback 반환
직전에 이를 검사해 취소 시 throw/rollback한다. retry 대기 중 취소되면 다음 tx를 열지 않는다.
최상위 finally에서 listener와 DB connection을 해제하며, 이미 commit한 사용자는 유지한다.
SIGKILL/프로세스 crash는 finally 실행을 보장하지 않는다. DB connection 종료에 따른 미commit tx
rollback과 재실행 검사로 복구한다. 취소 직전에 commit된 결과는 다음 실행에서 검증한다.

### TASK-IPA-D1-04: 등록 dual-write와 MCP body 보존

- satisfies: REQ-IPA-015
- preserves: INV-IPA-004, INV-IPA-006
- governed-by: CON-IPA-002, CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D1-01

**등록**

기존 action의 검증·requireUser·slug 선조회·token 생성·P2002 UI 결과·CreateProjectState를 유지한다.
현재 transaction 안의 count/create를 `registerProjectIn(tx, input)`으로 옮긴다.
input은 서버가 구한 userId, 기존 plan 값, slug/name/owner/repo/branch, initialTokenHash다.
helper는 core capError를 사용해 기존 cap reason 또는 null을 반환한다. FSD state 타입이나
서버 DB singleton을 import하지 않고 Prisma.TransactionClient를 type-only로 사용한다.

같은 Project.create에서 legacy owner/members/token과 새 repoOwner, available=true,
lastSelectedAt=null, lastSyncedAt=null을 기록한다.
새 owner는 checked relation `ownerUser: { connect: { id: userId } }`로 연결한다.
클라이언트가 제출한 ownerUserId는 사용하지 않는다.
Prisma.ProjectCreateInput에 맞는지 fresh generated type으로 검증하고 as any로 우회하지 않는다.
migration 전에는 이 code를 배포하지 않는다.

등록의 token 발급을 백필 쓰기 제한에 포함시키지 않는다.
D1 등록은 아직 version/event를 쓰지 않으며 이후 backfill/catch-up이 새 snapshot을 기록한다.
이것은 D2에서 REQ-IPA-013을 구현하기 전 호환 구간이다.

**MCP 응답**

`deps.ts:projectGet`의 include 전체 반환을 `loadProjectView`와 `PROJECT_GET_SELECT`로 바꾼다.
기존 schema 기준 Project scalar 전부와 Workspace scalar 전부를 명시적으로 선택한다.

- Project: id, slug, name, owner, repo, branch, language, executorKind, commandIssue,
  runbookVersion, createdAt, workspaces.
- 각 Workspace: id, projectId, wsId, path, agent, verify, knowledge, readOnly.
- 새 ownerUserId, repoOwner, available, lastSelectedAt, lastSyncedAt은 응답에 없음.
- `tools.ts`의 locked/reason 부가와 tool별 기존 허용/거부는 그대로다.

ProjectView 타입 선언은 실제 scalar보다 좁으므로 그 타입의 필드만 남기는 방식도 금지한다.
nullable commandIssue/runbookVersion, 배열, ISO 날짜와 중첩 workspace 내용까지 기존 contract를 유지한다.
이 출력 보존을 위해서만 MCP deps 파일 변경을 허용한다.

현재 workspaces relation에는 orderBy가 없으므로 반환 행의 순서는 계약으로 간주하지 않는다.
ORDER BY 없는 SQL 행 순서는 보장되지 않는다.
[근거: PostgreSQL row ordering](https://www.postgresql.org/docs/current/queries-order.html).
baseline/candidate 비교는 최종 serializer의 JSON을 parse한 뒤 object key 순서를 무시하고,
workspaces에 한해서 중복 ID가 없는지 확인한 후 id 기준 행 집합으로 대조한다. 행 누락·추가·중복과
모든 key/value 차이는 실패다. 검증 때문에 runtime select에 orderBy를 새로 추가하지 않는다.
**verify/readOnly 등 필드 내부 배열의 원소 순서는 보존**한다. 모든 배열을 재귀 정렬해서는 안 되며,
null/빈 배열/ISO 날짜/string 값도 구분한다. Workspace 행만 뒤집은 비교는 통과하고,
verify 순서 변경·scalar 변경·중복/누락 행은 실패하는 negative fixture를 둔다.

### TASK-IPA-D1-05: 검증 수집·실제 PostgreSQL rehearsal·인계

- satisfies: REQ-IPA-015
- preserves: INV-IPA-004, INV-IPA-006
- governed-by: CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D1-01, VFY-IPA-D1-02

scripts/*.test.ts는 기존 CI wildcard에 수집되지 않으므로 package.json에 아래 scripts를 추가한다.
`check`의 기존 내용 끝에 `&& npm run test:project-availability`를 추가하여 CI에서도 실행되게 한다.

```json
{
  "db:validate": "prisma validate",
  "check:project-ownership": "node --import tsx scripts/check-project-ownership.ts",
  "backfill:project-availability": "node --import tsx scripts/backfill-project-availability.ts",
  "test:project-availability": "node --import tsx --test scripts/project-availability-migration.test.ts",
  "test:project-availability:db": "node --import tsx scripts/rehearse-project-availability.ts"
}
```

이는 추가할 scripts 항목이며 package.json 전체를 대체하는 JSON이 아니다.
기존 test:web/architecture/core 수집은 유지한다. 새 src/server/*.test.ts는 test:web이 수집한다.

- unit suite: 주입 fake deps로 순서, args, preflight, non-null conflict, default/invalid plan,
  changed-source rerun, 읽기 tx 주입·mode/격리수준, atomic write ordering, CAS/P2034 제한 재시도,
  finally를 검증한다.
- 실제 DB suite: 별도 `IPA_REHEARSAL_DATABASE_URL`과 `--allow-fixtures`가 둘 다 있어야 실행한다.
  DATABASE_URL만으로는 시작하지 않고, 요구한 DB가 빈 격리 DB인지 pg_catalog와 migration 상태로
  검사한 후 baseline migrations와 fixture를 구성한다. 사용 중 DB면 즉시 실패한다.
- runner의 child Prisma 명령에는 rehearsal URL을 env DATABASE_URL로 넘기며 로그에 출력하지 않는다.
  shell 문자열을 조립하지 않고 spawn argument array를 사용한다.
- baseline migrations는 저장소의 기존 10개, 후보 D1 migration은 신규 suffix 한 개로 자동 찾는다.
  후보가 없거나 여러 개면 실패한다. baseline은 기록된 HEAD의 schema와 migration 파일이다.
  runner는 fs.mkdtemp(os.tmpdir() 아래 작업 전용 prefix)로 별도 작업 디렉터리를 만들고,
  git show를 argument array로 호출해 baseline schema/migrations를 추출한다. 그 복사본에 한해서
  generator.output을 작업 디렉터리로 설정하고 로컬 Prisma 7로 baseline client를 생성한다.
  dependencies는 기존 node_modules 경로를 연결해 해석하고 npm install은 실행하지 않는다.
  repo schema·기존 migration·사용 중 client 출력 폴더를 baseline으로 덮어쓰지 않는다.
  별도 config의 migrations.path를 baseline-only 디렉터리로 지정해 먼저 baseline을 적용하고,
  후보 migration을 포함한 bundle로 바꿔 후보만 추가 적용한다. DATABASE_URL은 같은 격리 DB다.
  candidate client의 preflight가 baseline DB를 읽을 때는 legacy select를 강제한다.
- fixture 단계는 owner 없음/2명/일반 member를 실제 DB에 만들고 preflight 실패를 확인한다.
  별도 해당 fixture row만 복구한 후 정상 이관을 수행한다. 전체 DB reset이나 broad delete는 하지 않는다.
- fixture는 User, Subscription, Project, ProjectMember 및 모든 보존 model을 포함한다.
  같은 primary DB를 향한 독립 연결 두 개로 동시 백필과 등록/플랜 변경 시나리오를 수행한다.
  read replica의 복제 지연을 검사하는 테스트가 아니다.
- 읽기 일관성 fixture는 preflight의 Project 조회와 membership 조회 사이에 barrier를 두고,
  다른 연결에서 정상 등록을 commit한다. 등록 전/후 어느 snapshot에서도 가짜 orphan/owner 누락 없이
  같은 시점의 관계를 검사해야 한다. 사용자별 dry-run/check도 두 조회 사이의 plan/등록 commit을
  섞지 않는지 검사한다. 검증 CLI 자체의 legacy/shadow/version/event row write는 0이어야 한다.
- 실제 `registerProjectIn`, `loadProjectView`, core ranking, migration CLI를 호출한다.
  Prisma 오류 후 이전 사용자와 현재 사용자 transaction의 보존 범위를 구분해서 관측한다.
- fixture 생성·의도한 concurrent write를 제외한 백필 검증은 기존 row의 전체 값/ID/관계/커서와 row count를
  비교한다. DB 조회의 행 순서는 무시하되 각 model의 PK/복합 키로 중복·누락·추가를 검사하고
  필드 내부 배열 순서와 전체 값은 보존한다. MCP 최종 body는 T04의 한정된 정규화 규칙으로 대조한다.
  count만 같아도 값이 바뀌면 실패다. secret 값 비교는 memory에서만 하고 보고에는 일치 여부만 남긴다.
- runner 종료 시 생성 client/child process/DB pool과 자신이 만든 작업 디렉터리만 finally에서 정리하고
  실패 DB는 디버깅용으로 보존한다. 작업 directory의 실제 절대 경로를 검증해 그 경로만 제거한다.
  cleanup을 위해 unscoped User.deleteMany를 호출하지 않는다.
- 대상 DB에서는 isolated fixture runner를 실행하지 않는다. read-only preflight → 검토된 DDL apply →
  D1 code → dry-run/apply/check 순서만 수행한다.
- D1 exit 후에도 실제 사용 목록은 legacy 계산이다. D2에는 마지막 backfill event/version과 source
  snapshot을 넘긴다. D2 runtime 활성화 직전에 source drift를 다시 검증·반영하고 이관 도구 종료를
  보장해야 한다. 최종 handoff에서 plan/등록 writer를 배제하는 배포 절차는 D2 실행 계획에서 검증한다.

## Runtime / Failure Matrix

| 시작 상태·행동 | 결과·복구 | 검증 |
| --- | --- | --- |
| migration 전 DB + 새 client preflight | legacy select로 정상 검사; 새 열 없음 오류가 없어야 함 | 실제 pre-schema fixture |
| preflight의 두 조회 사이 정상 등록 commit | 하나의 read-only snapshot으로 false orphan/owner 누락 없음 | 동일 primary 두 연결·barrier |
| dry-run/--check의 두 조회 사이 plan/등록 commit | 사용자별 일관된 snapshot·zero row write; 이후 변화는 다음 실행에서 확인 | 두 연결·tx 주입 검사 |
| owner 0/2 또는 일반 member | 전체 preflight 실패 시 어떤 백필도 시작 안 함 | unit + DB |
| preflight 뒤 owner/plan 변경 | 해당 tx에서 새 snapshot 검사, conflict 또는 catch-up drift 보고 | 두 연결 DB test |
| 정상 최초 apply | shadow set/version/migration event commit | DB 전체 값 비교 |
| 같은 입력 rerun | set/version/event 불변 | unit + DB |
| 완료 후 프로젝트 추가·플랜 하향 | event 존재와 무관하게 새 source로 snapshot 갱신 | unit + DB |
| ranking source 변경, 결과 동일 | no-op; 활동을 사용자 선택으로 기록하지 않음 | unit |
| 사용자 A commit 후 B 실패 | A 보존/B rollback/unprocessed 보고; rerun 수렴 | 오류 주입 DB |
| CAS 충돌/P2034 | fresh tx 최대 3시도; 초과 시 실패 | fake retry + 두 연결 |
| P2002/invalid ownership/timeout | 무조건 실패, 무한 재시도 없음 | unit + 실제 unique/FK |
| SIGINT/SIGTERM 또는 crash | cancel flag·finally 또는 DB rollback, commit 여부 재조회 | CLI 취소·중간 종료 fixture |
| D2 event 또는 non-null 선택/sync | lifecycle-started, zero-write | fixture |
| 정상 등록·등록 실패 | 성공만 legacy/new/token 함께 존재; 실패 모두 rollback | 실제 helper + UI |
| MCP project_get 정상/locked | 행 집합·key/value 동일, 필드 배열 순서 보존, shadow field 미노출 | query → registry → JSON.parse·T04 비교 규칙 |
| code rollback | fresh baseline client와 기존 schema 필드로 동작; 준비 열을 접근에 사용 안 함 | build + DB smoke |

## Final Artifact Resolution Map

| 최종 산출물 | 결정 source / 생성 경로 | body·dependency 검사 목적지 |
| --- | --- | --- |
| DB column/FK/index/event | schema → 새 migration.sql → 실제 pg_catalog | nullability/default, SetNull FK, uniqueness, 기존 objects 보존 |
| DB 이관 snapshot | 일관된 읽기 tx의 ProjectMember/plan/AgentRun → ranking → apply tx 재조회 | PK별 전체 값·version·event와 해당 snapshot의 expected 집합 |
| Prisma client/types | prisma.config.ts/schema → 로컬 Prisma 7 generate → src/generated/prisma | models barrel·class inlineSchema·Project/User/Event types·전체 model 집합 |
| plugin module | core entitlement → `npm run sync:plugin-lib` | `node scripts/plugin-lib.mjs --check`, byte equality 및 새 named export import·기존 export 유지 |
| MCP JSON | 명시 select → deps.projectGet → tools serializer | T04의 Workspace 행 집합·필드 배열 순서·전체 key/value, locked/reason, 새 field 없음 |
| 등록 결과 | createProject → registerProjectIn → transaction → CreateProjectState → NewProjectForm | success/error shape, 단회 token 화면·연결 링크 |
| CLI report | args → read-only/apply mode → sanitized report | exit codes·검사 단위의 mode/asOf·processed counts·drift; 불완전 조회 PASS 및 DB URL/hash/body 없음 |
| CI gate | package scripts → check/test:web → check.yml | migration unit과 두 helper test가 실제 수집되고 DB suite는 자동 실행되지 않음 |

## Verification Detail

Canonical definitions:
[VFY-IPA-D1-01](./individual-project-availability.md#vfy-ipa-d1-01-소유권-migration-rehearsal),
[VFY-IPA-D1-02](./individual-project-availability.md#vfy-ipa-d1-02-기존-availability-결과-비교).

### Verification detail for VFY-IPA-D1-01

1. preflight는 정상/owner 0/owner 2/member/orphan 참조를 검사하고 migration 전 새 client로도 동작한다.
   전체 preflight 및 사용자별 dry-run/check의 읽기 tx 격리수준·read-only·동일 tx 주입을 검사하고,
   두 조회 사이 정상 등록/플랜 commit의 barrier fixture에서도 서로 다른 snapshot을 섞지 않는다.
   timeout/연결 실패는 PASS가 아니며 read-only 검사 자체의 row write는 0이다.
2. schema validate + migration SQL + pg_catalog로 additive/no-drop/default/FK를 확인한다.
3. 백필 전후 legacy row의 ID·값·관계·커서 전체 보존을 model PK/복합 키로 비교한다.
   행 정렬 차이만 무시하며 필드 내부 배열의 순서는 그대로 비교한다.
4. app registration helper가 실제 tx에 legacy/new/token을 함께 쓰고 실패하면 남기지 않는지 확인한다.
5. 반환 JSON은 schema의 실제 scalar 집합과 D1 명시 select를 대조한다. null/빈 배열/locked 양쪽
   상태의 body를 검사한다. 속성 key만 보고 값 비교를 생략하지 않는다.
   T04 정규화의 positive/negative fixture로 Workspace 행 순서만 다른 경우의 통과와 verify 순서·값·
   중복/누락 행 변경의 실패를 각각 증명한다. runtime에 orderBy를 추가하지 않았는지도 확인한다.
6. backfill 반복·동시성·중간 실패·source drift·D2 이후 실행 거부를 Runtime Matrix대로 검사한다.
7. baseline schema/client로 만든 rollback build와 새 D1 build를 같은 이관 DB에 대해 비교한다.
   현재 disk의 오래된 generated client는 baseline artifact로 쓰지 않는다.
8. legacy 전체 model 보존 조건과 event unique, 잘못된 owner FK reject, User 삭제 시 Project 비삭제를
   격리 fixture에서 검증한다. User 삭제 fixture는 별개 트랜잭션/데이터로 수행하고 백필의 no-write와 구분한다.
9. runner 정상·실패·취소 후 listener 수가 원래대로이고 열린 연결/child process가 없으며,
   baseline 생성 과정에서 repo schema·기존 migration·candidate client를 바꾸지 않았는지 검사한다.

### Verification detail for VFY-IPA-D1-02

1. Free 1/3, Pro 4/7, Max 8, 소유 0, Subscription 없음/잘못된 plan과 순서가 섞인 후보를 검사한다.
2. activity는 run 시작/step 보고 둘 중 늦은 값, 모든 run 상태 포함이다. 동률/모두 null은 최근 등록,
   같은 등록 시각은 ID 순이다. Date epoch 0도 유효한 값으로 비교한다.
3. D1 이관에서는 모든 소유 project를 후보로 하며 old locked flag를 필터로 쓰지 않는다.
4. user selection이 없는 D1 fixture에서는 가장 최근 작업을 고르고, shared function test는
   lastSelectedAt 우선·sync 우선도 검증한다.
5. 별도의 preservation fixture는 old activeProjectIds가 계속 가장 오래된 것을 고름을 확인한다.
   두 결과의 차이는 D1 준비와 운영 경계가 정상이라는 증거다.
6. fresh-source --check가 일치하면 exit 0, 신규 등록/플랜/활동으로 expected가 달라지면 exit 1,
   재apply 후 exit 0을 관측한다. 장기간 drift 없음은 주장하지 않는다.

### 명령과 실행 환경

아래 command는 모두 repository root의 zsh/bash에서 사용하며 D1 구현 이후 실행한다.
이미 존재하는 dependency만 사용하고 최신 Prisma를 별도 다운로드하지 않는다.

```bash
node scripts/plugin-lib.mjs --check
npm run db:validate
npm run db:generate
npm run test:project-availability
npm test
npm run test:web
npm run check
npm run verify:fsd
npm run test:architecture
npm run build
```

db:validate/generate/build는 config 해석에 DATABASE_URL 값이 필요하다. DB가 필요 없는 CI 생성 단계에는
check.yml의 기존 loopback placeholder를 사용한다. 실제 migration과 script는 올바른 대상 DB가 필요하다.
build/typegen/generated output은 writes를 만들므로 reconciliation에서 자동 실행하지 않는다.

```bash
npm run check:project-ownership
npm run backfill:project-availability
npm run backfill:project-availability -- --apply
npm run backfill:project-availability -- --check
npm run test:project-availability:db -- --allow-fixtures
```

마지막 command는 IPA_REHEARSAL_DATABASE_URL로 지정한 빈 격리 DB에서만 실행한다.
private templates가 제공되는 구현 환경에서는 부모의 `npm run test:templates`도 실행한다.
CI에는 해당 corpus가 없고 D1은 template를 수정하지 않으므로 자동 gate에 추가하지 않는다.

## Definition of Done / Handoff

- [ ] 모든 Core 파일과 named symbol의 import/export가 Inventory대로 해소됨.
- [ ] `node scripts/plugin-lib.mjs --check` exit 0, entitlement 복사본의 새 export와 기존 export 보존.
- [ ] D1 schema/model 생성물이 최신이며 기존 열·relation·index와 external owner 계약 유지.
- [ ] preflight 정상, additive apply 성공, dual-write 배포 후 old writer 교체 완료.
- [ ] 전체 preflight·사용자별 dry-run/check는 일관된 read-only snapshot; 동시 등록 false-positive 없음.
- [ ] 최신 --check에서 ownerUserId/repoOwner null·불일치 0, 원하는 available 집합 일치.
- [ ] 새 등록·플랜 변경 뒤 marker skip 없이 catch-up 가능; 동일 재실행은 no-op.
- [ ] 기존 row의 PK별 값·ID·커서·배열 순서 보존 및 failure rollback 검증.
- [ ] MCP 최종 JSON을 T04 규칙으로 baseline과 비교: Workspace 행 집합·필드 배열 순서 보존, 새 field 없음.
- [ ] 로컬 unit suite가 CI check에서도 수집됨; type/build/FSD와 DB rehearsal 통과.
- [ ] 기존 activeProjectIds/projectAccess/guard/tool 동작이 바뀌지 않았음.
- [ ] D1 snapshot의 event/version/asOf·실제 migration 경로·명령 결과·배포 build hash 보고.
- [ ] D2 진입 전 fresh catch-up·writer 전환·D1 도구 중단이 필요하다고 인계.
- [ ] 코드를 되돌렸을 때 legacy access 동작을 확인. 별도 D2/D3 실행은 하지 않음.

## Readiness / Blockers / Approval

문서 설계와 실제 DB 적용 준비를 분리한다.

- 설계 검토 대상은 D1 범위다. 실제 DB 데이터는 아직 확인하지 않았다.
- 부모 BLK-IPA-D1-01은 실행 조건으로 유지한다. 먼저 읽기 전용 preflight와 격리 rehearsal을
  수행할 수 있고, 불일치가 있으면 대상 DB backfill을 중단한다.
- 누락된 배포 대상·접속 정보는 실행 환경에서 정한다. 이번 문서가 데이터 이상을 허용하거나
  임의 소유자를 고르도록 승인하지 않는다.
- D2 private template, D3 복구 증거는 각각 후속 entry에서 해결한다.
- SQL·rehearsal 결과·대상 DB 적용 승인은 부모 Approval Gate에 따른다. 문서 검증 통과는 코드 변경,
  DB 적용 또는 다음 Phase 시작 권한을 부여하지 않는다.
- 부모와 현재 변경 내용의 기술적 충돌을 발견하면 이 문서에서 제품 정책을 바꾸지 않는다.

부모의 D1 completion wording은 D1 준비 데이터에 한정해 해석한다. 실제 owner-only 접근은 D2/D3이고
부모 EV-IPA-D1-01의 REQ-IPA-016 prose 참조는 실행 증거가 아니므로 D1 완료 주장에 쓰지 않는다.
D1부터 legacy 응답을 유지하기 위한 제한적인 MCP projection과 nullable SetNull 관계는 부모의
“기존 동작 유지”를 실현하는 구현 상세다.

## Risks and Rollback

D1의 준비 snapshot은 기존 plan:grant/새 등록/새 활동 뒤 바뀔 수 있다. 이는 운영 접근에 영향을
주지 않지만 D2가 오래된 값을 읽으면 문제가 된다. 최신 --check, catch-up와 D2의 명시적인 writer
handoff를 필수로 둔다. D1에서는 final availability invariant가 모든 운영 commit에 적용됐다고 주장하지 않는다.

rollback은 이전 source를 빌드한 **동일 baseline schema의 client**와 함께 수행한다. legacy
ProjectMember/owner가 살아 있고 새 필드는 nullable/default로 허용되므로 old create/read가 계속 된다.
새 관계의 SetNull은 새 project cascade 삭제를 만들지 않는다.
roll back 후 old create가 만든 null shadow는 이후 D1 재배포/catch-up으로 채운다.
D1에서 새 열/table을 drop하거나 event를 지워 상태를 “정리”하지 않는다.

스키마 추가 실패는 migration transaction rollback과 Prisma migration 상태를 확인한다. 실패한
migration을 임의 성공 처리하지 않는다. 실제 복구 명령은 실패 원인과 rehearsal 증거에 맞춰 실행자가
고르며 사용자 데이터 삭제/reset은 이 계획의 복구 수단이 아니다.

## Reconciliation Notes와 Verification Results

기존 검토에서 개선점이 존재해 아래 항목을 반영했다.

| 수정 영역 | 이번 문서에서 반영한 내용 |
| --- | --- |
| 공개 body | 전체 row 반환 → 기존 모든 필드의 명시 select, MCP 응답 검증 목적지 추가 |
| 재실행 | once-per-user marker skip → 최신 source 비교·no-op 또는 새 준비 event, partial commit 보고 |
| 호환 기간 | 영구 최신 주장 제거, old-writer drain·D2 entry catch-up 계약 |
| 스키마 | nullable FK action 구체화, 기존 model 누락을 포함한 fresh generated client 검사 |
| 실행 검증 | 미정 retry/CLI/DDL·DB fixture 명령을 구체화, CI 수집 연결 |
| 보존 검증 | row count에서 실제 payload·row 값·커서·transaction 실패까지 확장 |
| 범위/추적 | 조건부 test 생성 제거, 새 helper/provenance와 최종 artifact 목적지 명시 |

2026-09-13의 앞선 전체 재검토에서도 처음부터 보완점 **2개**가 확인됐다. 아래 내용을 작업 지침,
Runtime Matrix, artifact map, 검증 목적지와 DoD에 함께 반영했다.

| 이번 재검토의 보완점 | 근거와 반영 내용 |
| --- | --- |
| 읽기 snapshot 경계 누락 | 정상 등록의 atomic commit과 statement별 읽기가 엇갈릴 수 있음. 전체 preflight·사용자별 dry-run/check의 read-only RepeatableRead와 실제 두 연결 검증 명시 |
| body/row 비교에서 행 순서와 배열 값 순서 혼동 가능 | orderBy 없는 Workspace 행은 ID 집합으로 비교하되 verify/readOnly의 배열 순서·중복·누락·전체 값은 보존. replica 표현도 동일 primary의 독립 연결로 정정 |

후속 전체 검토에서는 실행 명령의 `node` 누락 1건을 수정했다. 파일 직접 실행은 zsh에서
permission denied/exit 126이었고, `node scripts/plugin-lib.mjs --check`는
`plugin/lib in sync`/exit 0이었다. 정책·데이터 설계는 바꾸지 않았다.

이번 턴에서 실행한 source/환경 조사와 문서 validator는 구현 결과와 분리해 최종 답변에 기록한다.
이 절은 편집 이력이며 clean pass를 선포하지 않는다. 마지막 저장본을 수정 없이 INV-1~INV-7로
재검토한 결과만 reconciliation 최종 결과로 사용한다.

- implementation unit/build/migration/DB preflight: Not executed — 현재는 문서 검증·개선 요청.
- standard SDD validation: 부모와 D1 두 파일 bundle으로 수행.
- strict mode: 실행하지 않음. 부모가 후속 D2/D3 requirement까지 포함하므로 D1 실행 준비도를
  기계적으로 판단하는 입력으로 적절하지 않다.
- source가 바뀌면 이전 문서 검증 결과는 현재 readiness 근거로 사용하지 않는다.

## 고위험 검증 재현 기준

다음 manifest는 2026-09-13 D1 문서 대조에 사용한 범위를 보존한다. 완료·무결점 보증이 아니라
향후 재검증 때 기준 변경을 찾기 위한 증거다. D1 자체 SHA-256은 자기 참조를 피하려고 최종 응답에
기록한다. 아래 explicit 파일과 recursive 디렉터리의 모든 파일을 읽어 중복 제거·정렬하고,
경로 목록에 줄바꿈을 붙여 SHA-256을 계산한다. tracked 파일은 기록한 HEAD와 diff로, nonHead는
파일별 content hash로 비교한다. 신규 후보 파일과 migration suffix의 충돌도 Inventory대로 다시 검사한다.

- runtime 근거: 로컬 Prisma 7.10 adapter/client의 isolation·P2034 mapping, Next 16.3.3 Server Action 문서,
  T03/T04에 연결한 PostgreSQL의 읽기 snapshot·행 순서 공식 문서(2026-09-13 확인).
- artifact 근거: schema scalar/관계·기존 migration DDL·generated inlineSchema/barrel·MCP serializer·CI scripts.
- coverage stability: schema의 Project/Workspace scalar 집합을 별도로 추출해 MCP allowlist와 대조했고,
  CI workflow entry와 package scripts를 각각 읽어 신규 테스트 수집 경로를 대조했다.
  이번 읽기 경계는 등록의 nested write/tx와 snapshot 반례 모델을 교차 대조했고, body 비교는 실제
  Workspace 배열 타입과 행 뒤집기/필드 순서 변경 반례로 대조했다. 반례 모델은 실제 DB 실행이 아니다.
- 추가 safe-replay 범위: 복사본 검사 명령이 읽는 `packages/core`와 `plugin/lib`의 직계 파일 중
  `.mjs`로 끝나고 `.test.mjs`로 끝나지 않는 파일 전부. 아래 기본 85개와의 정렬된 합집합은 103개,
  path-set SHA-256은 `cf11a2a03cdc6fc3b2b362f0e61e5f8e33711ae5d2e2a1d5277be3cd2372be60`이다.
  추가 18개는 모두 HEAD 추적 파일이며 내용 diff 없음, 복사본 drift/orphan 0을 확인했다.
- manifest-only: 아직 작성되지 않은 migration·helper·DB rehearsal 목적지와 예상 결과. 실행 증거로 해석하지 않는다.
- volatile/non-replayable: 실제 대상 DB, 격리 DB와 배포 writer 상태. 문서 검증에서 조회하지 않았으며 실행 시 새 증거 필요.
- exclusions: D2 UI·live access 전환·private templates, D3 drop/restore, 결제·Business는 현재 변경 범위 밖.
- 잔여 실행 조건: 부모 BLK-IPA-D1-01과 실제 PostgreSQL rehearsal. 이 조건을 문서 검증 통과로 해소하지 않는다.
- persistence: 이 D1 계획의 재검증·인계 기준. 별도 파일이나 계약 source는 만들지 않음.
- 최종 no-edit INV-1~INV-7 결과는 이 manifest를 저장한 뒤의 최종 응답을 따른다.

```json
{
  "repository": "stagekeeper-ipa-d1",
  "HEAD": "0eef5cb777e6ff6f4343cd2d4a1a9c03f4eac70b",
  "recipeClass": "safe-replay",
  "recipe": {
    "explicit": [
      "AGENTS.md",
      "docs/proposals/README.md",
      "docs/proposals/template.md",
      "docs/proposals/active/individual-project-availability.md",
      "docs/proposals/active/individual-project-availability-phase-d1.md",
      "docs/architecture/README.md",
      "docs/architecture/fsd.md",
      "docs/architecture/system-overview.md",
      "docs/architecture/invariants.md",
      "docs/architecture/verification.md",
      "package.json",
      "package-lock.json",
      "prisma.config.ts",
      "tsconfig.json",
      "eslint.config.mjs",
      ".gitignore",
      ".github/workflows/check.yml",
      "prisma/schema.prisma",
      "packages/core/entitlement.mjs",
      "packages/core/entitlement.test.mjs",
      "plugin/lib/entitlement.mjs",
      "scripts/lib/prisma.ts",
      "scripts/grant-plan.ts",
      "scripts/plugin-lib.mjs",
      "scripts/verify-fsd-boundaries.mjs",
      "src/server/db.ts",
      "src/server/entitlement.ts",
      "src/server/auth/guard.ts",
      "src/server/auth/config.ts",
      "src/server/agents/runs.ts",
      "src/server/agents/next.ts",
      "src/server/pipeline/run.ts",
      "src/server/mcp/deps.ts",
      "src/server/mcp/tools.ts",
      "src/server/mcp/tools.test.mjs",
      "src/app/api/mcp/route.ts",
      "src/app/(app)/p/new/page.tsx",
      "src/app/(app)/projects/page.tsx",
      "src/fsd/widgets/app-header/api/app-header.server.ts",
      "node_modules/@prisma/client/runtime/client.js",
      "node_modules/@prisma/adapter-pg/dist/index.js",
      "node_modules/prisma/build/index.js",
      "node_modules/next/dist/docs/01-app/02-guides/server-actions.md"
    ],
    "recursive": [
      "prisma/migrations",
      "src/fsd/features/create-project",
      "src/generated/prisma"
    ],
    "ordering": "JS default sort of unique POSIX paths; sha256(paths.join(newline)+newline)",
    "contentOrdering": "sha256(JSON.stringify([[path,sha256(fileBytes)],...]))"
  },
  "candidateCount": 85,
  "pathSetHash": "817344226d09dc2330fbceaa5f46b41f8a32ffb1e803eaabc55e890ff4a9cd97",
  "nonHead": [
    [
      "docs/proposals/active/individual-project-availability.md",
      "907dd11b40f405f56e58e30ca9815d9e0d8a1b3f918d8fd7eed279b22925a26d"
    ],
    [
      "node_modules/@prisma/adapter-pg/dist/index.js",
      "d57ac2ea38047c648b0f3b4b8012031b5adaa9f919dbb21419a4153f7e02d3c4"
    ],
    [
      "node_modules/@prisma/client/runtime/client.js",
      "c444040cf5d0a8bb0edde2d482e2865360671d1609349ce626506ae198bcee29"
    ],
    [
      "node_modules/next/dist/docs/01-app/02-guides/server-actions.md",
      "8063a28cde0495a61c5ac195b0b769d86a10740a673facdc5f3e2f80f0e59b77"
    ],
    [
      "node_modules/prisma/build/index.js",
      "763611d694b08952ced7c5abb3b9d61906fed0a8997d9214ac918a43928e0fc8"
    ],
    [
      "src/generated/prisma/browser.ts",
      "888ac3dd7c9f1778d0ba73ae9e627a02404430cf45f41f8d48e5d08a04e4c445"
    ],
    [
      "src/generated/prisma/client.ts",
      "87658083be96ff94f191bd625b85ca85fa2bf10d74038a64e20db5ceeb0c307d"
    ],
    [
      "src/generated/prisma/commonInputTypes.ts",
      "a655c679a3368e877f4d89df2c5f116792e995536b1336e1794810c96629e91f"
    ],
    [
      "src/generated/prisma/enums.ts",
      "ebbdce75bbdd503c5172913fdc7b0523216ce8a6e6ed3ee4611ab10bea9c1e20"
    ],
    [
      "src/generated/prisma/internal/class.ts",
      "ef154a97ea488cbdd2c2b2759df734b68ccf76c8e801d4be5872689eda41bef1"
    ],
    [
      "src/generated/prisma/internal/prismaNamespace.ts",
      "4a4a1a70ee5b838b547845c583c7eee7cec8650b093e08700c27acc95822fe7d"
    ],
    [
      "src/generated/prisma/internal/prismaNamespaceBrowser.ts",
      "43e655af84ac448b2c1ae0774efe40d518e249345b2aa8aebc9a77c91c235047"
    ],
    [
      "src/generated/prisma/models.ts",
      "dccc1e118f2cd1d72384c4aa0a17c601c2e4f0b1f49cb02696d9fe4454db0e29"
    ],
    [
      "src/generated/prisma/models/AgentRun.ts",
      "337445d8aaa5f06fe8c3cdf8e3daef9412e0aa15eed7a2d51bd9164114b71577"
    ],
    [
      "src/generated/prisma/models/AgentRunStep.ts",
      "6717496e1fb448f968505455cd087ab358e8afecec039bacc413f436225a9ea5"
    ],
    [
      "src/generated/prisma/models/BacklogItem.ts",
      "a9e588e30d62baec86ac7ce3a022c373082ca5cf4f31b5148117b98d2dcb74ae"
    ],
    [
      "src/generated/prisma/models/BoardItem.ts",
      "960b642aed1e4637a62aac645b5ac49e4a1d1394c03ab7240fdc2c903fd12d32"
    ],
    [
      "src/generated/prisma/models/Command.ts",
      "185693dbf265a984604932da58a80df30310f2bac8b02b7ca75def40dec7dd5f"
    ],
    [
      "src/generated/prisma/models/OwnerToken.ts",
      "12127f3d0e87f1532ed103f228b0183975050dfc21fdc0822bbef289ad01cec3"
    ],
    [
      "src/generated/prisma/models/Project.ts",
      "35937301e01625b1cdd40e0e1e776e2e081e2f34fb73a26679895535c242ede6"
    ],
    [
      "src/generated/prisma/models/ProjectMember.ts",
      "0f12c39a42f94545e6086a8e298ae62d8da7192c5f5e8cf0b1e1abacc2174f78"
    ],
    [
      "src/generated/prisma/models/ProjectToken.ts",
      "a652be987be301afbe5a01ff91aad4057c22d6e6398563345ebf05b58698f6f7"
    ],
    [
      "src/generated/prisma/models/Report.ts",
      "0c7e6f8460f440d993b3cb9a41ce72255e99affef3296b49cbb3859a40da4559"
    ],
    [
      "src/generated/prisma/models/Subscription.ts",
      "59b40d2305c054becbe6c2907db6a089256fea1954f66c480f4a6a9c87b71e34"
    ],
    [
      "src/generated/prisma/models/Template.ts",
      "bc66c7945ba3775b12d1fe04b7af67c0ea4bb51a6d1880e6916d74284304b1a6"
    ],
    [
      "src/generated/prisma/models/TransitionEvent.ts",
      "f6fdfc44930c7843b6ec779b6addfacca6f6d9379769d1affb1424e47c8fb5c3"
    ],
    [
      "src/generated/prisma/models/User.ts",
      "ee0f42ab6dafa7c6a37c1ed782d1ce116277f97adbf3cff76b0371296e89e94d"
    ],
    [
      "src/generated/prisma/models/Workspace.ts",
      "147c2486a0b503faab5cb3e413e38fb42da56af5d97a3d221dd29342bf046802"
    ]
  ],
  "sourceIdentityRule": "D1 source SHA-256 is emitted in the final response to avoid self-reference."
}
```

## Completion or Closure Notes

현재 pending이다. 구현 후에만 실제 완료일·검증 요약·PR/commit·migration 증거와 D2 인계를 채운다.
취소하는 경우에도 닫힘 사유와 남은 schema/data 상태를 실제 결과로 기록한다.
