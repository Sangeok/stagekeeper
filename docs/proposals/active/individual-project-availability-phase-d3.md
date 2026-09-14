---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-09-14"
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
  - "docs/proposals/active/individual-project-availability-phase-d1.md"
  - "docs/proposals/active/individual-project-availability-phase-d2.md"
---

# 개인 프로젝트 사용 목록 — Phase D3 상세 계획

- Drafting mode: PHASE_PLAN
- Selected Phase: D3 — Remove Member and legacy owner storage
- Risk: HIGH-RISK
- Phase completion / deployment readiness: **BLOCKED** — D2 운영·DB·브라우저 인수와 D3 복구 증거 미확보
- Local implementation: 후속 사용자 요청으로 D3 코드·schema·migration·검증 도구를 구현함. 아래 실행 기록 참조
- Authoritative source: [부모 SDD](./individual-project-availability.md)
- Predecessors: [D1 계획](./individual-project-availability-phase-d1.md), [D2 계획 및 구현 기록](./individual-project-availability-phase-d2.md)
- D2 source baseline: `harness/individual-project-availability-d1@7e1678d3b4a66040618b25702541ab0315bdf639`, 2026-09-14
- D2 migration content-set SHA-256: `d6b6cbbead279990d95b4dfd25d58f6cd053b661b122e7f4a533a312658a73dd`
- Parent/D1/D2 SHA-256: 각각 `907dd11b40f405f56e58e30ca9815d9e0d8a1b3f918d8fd7eed279b22925a26d`,
  `583d3f51324deefa5edeb5ce9dfe5ea12fd7137ab3b9d4702ac33de471fb2607`,
  `9f604e6e97457c0a2f29c4aa368bad9c4e4cbfa49b21fc75e334cb30fb4a987e`
- Working tree: 위 커밋이 D1·D2 source와 기존 11개 migration을 고정한다. D3 로컬 구현은 그 위의 두 번째 커밋 대상으로 분리됐다.
- Authority: 최초 요청은 문서 검증·개선만 승인했고, 후속 사용자 요청은 D3 로컬 코드 수정을 승인했다.
  운영 DB migration·복구 실행, private template seed 또는 배포 승인은 포함하지 않는다.

## Summary / Goal

D2가 직접 소유권과 저장된 사용 목록을 runtime에 연결했다면, D3는 남아 있는 호환 저장 구조를 제거한다.
`ProjectMember`, `User.members`, `Project.members`, DB의 `Project.owner`를 없애고
`ownerUserId`/`repoOwner`를 required로 강화한다. 사용 목록·플랜·선택 원장·연결·커서는 그대로 둔다.

사용자가 경험하는 Free/Pro/Max 선택 정책과 웹·MCP 권한은 바뀌지 않는다. D3가 완료되면 현재 개인
프로젝트 도메인과 일반 실행 코드에 Member가 없으며, GitHub 저장소 소유자의 외부 `owner` 키는 유지된다.

`proposal-size: standard`: 테이블·열 삭제, FK 삭제 동작 변경, 생성 타입과 운영 스크립트 제거,
복구 migration이 필요한 변경이다. 코드 revert만으로 복구할 수 없다.

## Canonical Ownership와 계약

부모가 REQ/INV/CON/EX/VFY/BLK를 계속 소유한다. 이 문서는 새 TASK-IPA-D3-01~06만 정의한다.

| 부모 계약 | D3 책임 |
| --- | --- |
| REQ-IPA-015 | cleanup 전후 기존 데이터와 새 직접 소유권을 보존하는 최종 이관 |
| REQ-IPA-016 | Member 없이 direct owner만으로 웹 not-found와 owner MCP 거부 유지 |
| INV-IPA-001 | 단일 개인 소유권의 required 물리 모델 완성 |
| INV-IPA-002~007 | exact set·cap·선택 우선순위·연결·transaction 의미 보존 |
| CON-IPA-003 | harness.json/MCP/template/링크의 외부 repository `owner` 유지 |
| CON-IPA-006 | D2 운영 검증·rollback rehearsal 뒤에만 legacy storage 제거 |
| VFY-IPA-D3-01, VFY-IPA-D3-02 | 아래에서 실제 post-change 검증 목적지를 상세화 |
| BLK-IPA-D3-01 | backup/restore·legacy 복원 증거와 운영 실행 조건 |

현재 구조의 기준은 [architecture README](../../architecture/README.md), [FSD](../../architecture/fsd.md),
[invariants](../../architecture/invariants.md), [protocol](../../architecture/protocol.md),
[verification](../../architecture/verification.md), [product copy](../../conventions/product-copy.md)다.
새 UI·billing·Business 기능은 추가하지 않는다.

## 현재 구현과 선행 조건

| 관측 근거 | 분류 | 남은 D3 delta |
| --- | --- | --- |
| project-access-query / entitlement / requireProjectOwner | already satisfied | direct owner/available 판정 유지; 새 generated client로 재검증 |
| project-registration-query.ts | locally satisfied | legacy writes 제거; token·event·CAS 유지, test:web 통과 |
| prisma/schema.prisma와 D3 migration | locally satisfied | required direct owner/Cascade, Member·legacy owner 제거, event 배열 NOT NULL 강화 |
| core/entitlement.mjs | locally satisfied | old active export/test 제거, 새 policy와 plugin copy 유지 |
| project-availability-runtime.test.ts | locally satisfied | shadow 예외 폐지, final schema/generated·폐기 command 검사 |
| D1/D2 migration helper/rehearsal | removed locally | D3 runner로 목적 이전. 미추적 원본은 아래 임시 archive에 보존 |
| D3 cleanup/recovery helper·SQL·runner | locally satisfied, DB unverified | unit/type/build 통과; 실제 두 DB/backup 실행은 미완료 |
| D2 source artifact | satisfied locally | 위 40자 commit과 dependency lock을 D3 runner 입력으로 사용 |
| D2 운영·DB·browser/private 인수 | unresolved | local source commit/test/build를 D2 운영 exit로 대체할 수 없음 |

Observed: Prisma/client/adapter-pg 7.10.0, Next 16.3.3, React 19.2.8, TypeScript 5.9.3, CI Node 22.
현재 migration은 기존 10개와 D1 additive 1개다. D1 FK 이름은 `Project_ownerUserId_fkey`이며
`ON DELETE SET NULL ON UPDATE CASCADE`, ownerUserId/repoOwner 열은 nullable이다.

D2 기록의 154 core/plugin tests, 273 web tests, check 및 Webpack build 통과는 **선행 작업의 보고**다.
이번 문서 작성 중 재실행하지 않았다. 실제 D1/D2 DB 리허설·브라우저 인수·private corpus 확인은 아직 없다.

### Entry / Blocker 상세

- D2 entry/exit: source commit은 `7e1678d3b4a66040618b25702541ab0315bdf639`로 고정됐다.
  부모 BLK-IPA-D1-01·BLK-IPA-D2-01을 포함한 DB·browser·private 인수는 여전히 먼저 끝나야 한다.
  로컬 commit을 검증된 운영 release artifact라고 부르지 않는다.
- 부모 BLK-IPA-D3-01은 현재 Phase blocker다. 대상 DB/버전·backup 식별자/보관 위치·복원 권한과 담당자,
  별도 DB에서의 복원 결과, 허용된 복구 시점/데이터 손실 범위, 검토된 복원 SQL·D2 build smoke가 필요하다.
  실제 provider와 backup 명령은 확인되지 않았으므로 이 문서에서 `pg_dump`나 cloud snapshot 도구를 가정하지 않는다.
- NULL·orphan·owner 불일치·일반 Member·기존 set/event 불일치가 한 건이라도 있으면 drop을 중단한다.
  첫 owner 선택, Member 삭제, D1 ranking 재적용으로 통과시키지 않는다.
- D2 배포 artifact/복구 증거가 없으면 D3 운영 전환은 BLOCKED다. 후속 사용자 승인으로 로컬 구현은
  수행했지만 migration 적용·운영 전환 권한은 부여되지 않았다.

## Scope / Inventory

### 변경·신규 목적지

| 분류 | 실제 또는 제안 경로 | 변경 | 검증 |
| --- | --- | --- | --- |
| Core | `prisma/schema.prisma` | Member/legacy owner 제거, required owner/repo, Cascade FK | schema/generated/catalog |
| Core | `prisma/migrations/20260914090000_remove_individual_project_ownership_shadow/migration.sql` (신규) | 아래의 단일 transactional cleanup | D3 DB runner |
| Core | `src/server/project-registration-query.ts`, `.test.ts` | 두 shadow write 제거, 나머지 atomic 등록 계약 유지 | test:web + DB |
| Core | `packages/core/entitlement.mjs`, `entitlement.test.mjs` | old active export/import/describe만 제거; 새 policy 유지 | npm test |
| Generated | `plugin/lib/entitlement.mjs` | core의 byte copy 재생성 | plugin-lib --check |
| Generated | `src/generated/prisma/` | Member 모델·delegate·relation·legacy owner type 없는 client 생성 | fresh generate/type/build |
| Core | `scripts/lib/project-ownership-cleanup.ts` (신규) | readCleanupFactsIn / validateCleanupFacts / inspectOwnershipCleanup, snapshot 비교·migration 상태 분류·recovery bundle 검증 | cleanup unit + DB |
| Core | `scripts/lib/project-ownership-recovery.ts` (신규) | 고정 보상 identity, receipt type, D2 commit migration content digest | cleanup unit + recovery runner |
| Core | `scripts/check-project-ownership-cleanup.ts` (신규) | explicit pre/post read-only CLI | args/exit/zero-write |
| Core | `scripts/project-availability-cleanup.test.ts` (신규) | 검사·복구 입력과 보존 비교·package/provenance regression | test:project-availability → check |
| Core | `scripts/rehearse-project-availability-d3.ts` (신규) | D2 baseline → drop → D3 runtime → 복원·D2 smoke | explicit isolated DB command |
| Core | `scripts/recovery/individual-project-availability-d3/restore-d2-shadow.sql` (신규) | 긴급 복원용 검토 SQL. 일반 migration 디렉터리 밖에 보관 | recovery DB/catalog |
| Core | `scripts/restore-project-ownership-shadow.ts` (신규) | default check; 승인된 recovery bundle의 보상 migration 적용 | receipt/args/recovery tests |
| Core | `scripts/project-availability-runtime.test.ts` | shadow create 예외 폐지, 폐기 CLI invocation 제거, 최종 schema/export 부재 검사 | check |
| Core | `package.json` | 아래 retired scripts 제거·D3 scripts 추가; 기존 CI 연결 유지 | parsed scripts + 실제 수집 |
| Core | `docs/architecture/{README,system-overview,invariants,protocol,verification}.md` | D3 완료 모델·삭제 동작·운영 도구·복구 경계 | code/doc 대조 |
| Review/update if stale | `CONTEXT.md`, `docs/architecture/fsd.md`, `docs/conventions/product-copy.md` | current Member/shadow 필요 주장만 정리. 이미 맞는 glossary/UX 보존 | current-contract 검사 |

`scripts/recovery/individual-project-availability-d3`와 D3 migration 경로를 생성했다. cleanup SQL SHA-256은
`584f10489349904079ec3640d27194c3e2684a7f5ceef9a6e0bdda01de88dd75`, 보상 SQL은
`45c0f3577041ee0dcd12a618e1d1d5f3a6c65bde1532f0960c3743d25d90c755`다.
운영 실행 전 현재 artifact의 checksum을 다시 기록하고 receipt와 대조한다.

### 로컬 삭제 완료 대상 — 운영 적용은 복구 artifact 확보 뒤

다음 **6개 파일**을 로컬 저장소에서 제거했다. 기존 migration 파일과 과거 proposal은 제거하지 않았다.

- `scripts/backfill-project-availability.ts`
- `scripts/check-project-ownership.ts`
- `scripts/lib/project-availability-migration.ts`
- `scripts/project-availability-migration.test.ts`
- `scripts/rehearse-project-availability.ts`
- `scripts/rehearse-project-availability-d2.ts`

D1/D2 script는 D2 commit `7e1678d3b4a66040618b25702541ab0315bdf639`에서 재현할 수 있다. 삭제 전
`/private/tmp/stagekeeper-d3-retired-scripts-20260914.tgz`에도 임시 보관했다(SHA-256
`06bf07d99c0fd54983e3de9765f17fdd894e15f6d32effd7e2841706937ea297`). 이 임시 파일은 휘발성 보조본이며
Git commit을 대신하지 않는다. D2 commit push 확인 뒤 제거할 수 있다.
현재 repo에는 old generated Member 타입을 요구하는 실행 코드를 남기거나 TypeScript exclude로 숨기지 않는다.

### 보존·검증 표면

- `src/server/{project-access-query,project-availability-service,project-availability,entitlement,project}.ts`
  및 colocated tests: 새 owner/available 판정과 외부 DTO 유지. nullable 방어 제거를 별도 리팩터링으로 확대하지 않는다.
- `src/server/auth/guard.ts`, `src/server/mcp/{tools,owner-tools,deps,owner-deps,auth,project-query,project-sync-query}.ts`
  및 tests, `src/server/{templates-query,runbook-query}.ts`와 tests, `src/server/agents/{runs,next,vars}.ts`,
  `src/server/pipeline/{board,run}.ts`: 인가·scope·token·cursor·명시 select 보존.
- `src/app/(app)/projects/page.tsx`, `src/app/(app)/p/[slug]/{layout,page}.tsx` 및
  backlog/inbox/items/[key]/pipeline/tokens page, `src/fsd/features/{create-project,select-project-for-use,manage-token}`:
  등록 결과·Use/replace/stale·read/revoke 예외 유지. 새 route/action을 만들지 않는다.
- `src/server/agents/vars.ts`, `src/server/mcp/project-query.ts`, `src/server/project.ts`의 외부 owner mapping,
  `plugin/bin/harness-init.mjs`와 tests, core config/vars/deliver, private templates: 외부 repository owner 계약 유지.
- `prisma.config.ts`, `scripts/lib/prisma.ts`, `.github/workflows/check.yml`, `tsconfig.json`, `scripts/plugin-lib.mjs`:
  배선 근거. 검증 도구 추가를 이유로 설정·의존성을 변경하지 않는다.

생성 표면은 `src/generated/prisma/{client,browser,models,enums,commonInputTypes}.ts`,
`internal/{class,prismaNamespace,prismaNamespaceBrowser}.ts`와 아래 보존 17 model의 `models/<Model>.ts`다.
기존 `models/ProjectMember.ts`의 파일 부재와 barrel/delegate 부재를 각각 검사한다.
slice 보존 범위는 create-project의 api/create-project.server.ts, model/create-project-state.ts·project-slug.ts·
repo-url.ts와 test, ui/new-project-form.tsx 및 index.ts/index.server.ts;
select-project-for-use의 api/select-project-for-use.server.ts, model/select-project-state.ts와 test,
ui/use-project-control.tsx 및 두 index; manage-token의 api/manage-token.server.ts,
ui/new-token-form.tsx·new-owner-token-form.tsx 및 두 index다. UI 자체 수정은 D3 delta가 아니다.

새 helper를 일반 CLI와 격리 runner가 상대 import하고, `scripts/lib/prisma.ts`는 일반 check CLI에서만
args 검증 뒤 사용한다. recovery/rehearsal은 전용 URL로 PrismaPg/PrismaClient를 구성한다.
DATABASE_URL만 읽는 기존 withPrisma에 전용 URL이 자동 전달된다고 가정하거나 전역 환경을 덮지 않는다.
모든 child의 DATABASE_URL/Prisma config/tsconfig는 해당 child env와 작업 사본에만 지정한다.

제외: 정책·상한 변경, billing, Business/초대/seat, 프로젝트·계정 삭제 API, 사용자 선택 초기화,
token revoke/run close, 기존 migration 편집, 문서 이력에서 Member 단어 지우기, TanStack Query·전역 store 도입.

## Phase D3

- satisfies: REQ-IPA-015, REQ-IPA-016
- preserves: INV-IPA-001, INV-IPA-002, INV-IPA-003, INV-IPA-004, INV-IPA-005, INV-IPA-006, INV-IPA-007
- governed-by: CON-IPA-002, CON-IPA-003, CON-IPA-006, CON-IPA-007
- verified-by: VFY-IPA-D3-01, VFY-IPA-D3-02
- predecessor: 승인된 D2 exit와 고정 artifact; BLK-IPA-D3-01 복구 증거
- intermediate validity: D3 artifact·검증 코드는 격리 환경에서 준비한다. 운영은 D2를 유지하다가
  maintenance window에서 writer/traffic을 drain하고 migration과 D3 artifact를 함께 전환한다.
- exit: required direct owner, legacy storage/delegate/write 0, D2 동작 보존, 실제 복구와 전체 회귀 완료
- deployment boundary: D3 등록 코드를 pre-drop DB에 먼저 배포하지 않는다. legacy owner의 NOT NULL에 걸린다.
  D2 등록 코드도 post-drop DB에서 실행하지 않는다. 두 버전의 writer가 겹치는 rolling 배포는 허용하지 않는다.

### TASK-IPA-D3-01: cleanup preflight와 보존 snapshot

- satisfies: REQ-IPA-015, REQ-IPA-016
- preserves: INV-IPA-001, INV-IPA-002, INV-IPA-006, INV-IPA-007
- governed-by: CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D3-01, VFY-IPA-D3-02

새 helper의 `inspectOwnershipCleanup(db, mode)`는 `pre | post`와 주입 client를 받는다. CLI는
`--pre` 또는 `--post` 하나를 명시해야 하고 --help 외 잘못된 입력은 연결 전 exit 2다.
default DATABASE_URL은 기존 script bootstrap에서만 해석한다. result는 mode/asOf/schema fingerprint,
검사 항목별 count·issue code와 마스킹된 ID를 제공하고 정상 0/불일치 1/입력 오류 2로 종료한다.
연결·timeout·불완전 조회·취소는 exit 1이며 정상 report를 내지 않는다. helper의 facts 조회에는 동일 tx를
주입하고 순수 validateCleanupFacts는 DB를 호출하지 않는다. CLI finally의 disconnect/listener 해제 전에
process.exit를 호출하지 않는다.

검사는 하나의 RepeatableRead read-only transaction, maxWait 5000ms/timeout 30000ms,
첫 SQL `SET TRANSACTION READ ONLY`로 실행한다. preflight 결과를 적용 tx의 입력으로 재사용하지 않는다.
최종 D3 generated client에는 ProjectMember가 없으므로 legacy 검사는 고정 SQL과 pg_catalog를 사용한다.
SQL 식별자를 사용자 입력으로 조립하지 않고, 관련 helper는 앱/Next/server-only bootstrap을 import하지 않는다.

- pre: direct owner/repoOwner NULL 0, User 참조 유효, project당 legacy owner 정확히 1,
  일반 Member 0, legacy userId=ownerUserId 및 owner=repoOwner, 예상 FK/index/catalog만 존재함.
- 공통: 소유 프로젝트가 있으면 available ≥1, plan cap 이하, 최신 event.version=User.version,
  최신 event snapshot=stored exact set. 비소유 ID·중복 ID·잘못된 원장 연결은 거부한다.
  프로젝트 0/version 0/event 0 신규 사용자는 정상이다. plan normalize는 D2와 동일하다.
  최신 event.toPlan과 현재 Subscription.plan의 동일성은 요구하지 않는다. D2의 plan-only upgrade는
  event/version을 바꾸지 않으므로 이 차이는 정상일 수 있다. NULL event 배열·중복 ID는 정렬로 숨기지 않고 거부한다.
- post: Member table/legacy owner column 부재, owner/repo NOT NULL과 유효 FK,
  direct owner FK의 DELETE/UPDATE CASCADE, 기존 available index/event unique 유지.

pre/post mode는 먼저 catalog를 읽어 요구 schema가 맞는지 판단한 뒤 그 상태에 존재하는 table/column만
조회한다. post에서 ProjectMember를 조회해 missing-table exception을 정상 부재 증거로 취급하지 않는다.
검사 결과에는 `_prisma_migrations`의 해당 이름/checksum/finished_at/rolled_back_at을 읽은 migration
상태도 포함한다. `migrate deploy`는 일반 schema drift 검사기가 아니므로 exit 0만으로 catalog 일치를 주장하지 않는다.

보존 snapshot은 아래 model의 PK/복합 키별 **전체 값**을 비교한다. User.version, Project.available/
lastSelectedAt/lastSyncedAt, 모든 event·token·cursor가 포함된다. 제거 대상 두 shadow는 별도 mapping으로
보관한다. 행 순서만 정규화하고 필드 내부 배열·null·날짜·본문은 바꾸지 않는다. 민감한 전체 snapshot은
승인된 backup/evidence 위치에만 두고 Git·stdout에는 원문·token/hash·URL·login을 기록하지 않는다.

보존 model: User, Subscription, Project(legacy owner 제외), ProjectAvailabilityEvent, ProjectToken,
OwnerToken, Workspace, BacklogItem, BoardItem, TransitionEvent, Report, Template, Command,
AgentRun, AgentRunStep, PipelineVersion, PipelineRun. 원장 count만 같은 것을 보존 성공으로 보지 않는다.

### TASK-IPA-D3-02: drop 전에 D2 복구 경로 준비

- satisfies: REQ-IPA-015, REQ-IPA-016
- preserves: INV-IPA-001, INV-IPA-002, INV-IPA-006, INV-IPA-007
- governed-by: CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D3-02

기본 rollback 대상은 **D2 artifact**다. D1의 oldest-N 또는 backfill 적용으로 되돌리지 않는다.
`restore-project-ownership-shadow.ts`는 check가 기본이며 --apply에는 explicit
`IPA_D3_RECOVERY_DATABASE_URL`과 검토된 backup receipt 경로가 필요하다. receipt에는 대상 DB 식별,
복구 가능한 backup 식별/위치, 복원 rehearsal 결과, D2 artifact/schema/migration digest를 기록한다.
URL/receipt 누락·다른 DB·일치하지 않는 artifact·기존 legacy 구조 불일치는 mutation 전에 거부한다.

일반 CLI 입력은 args 없음/`--check` 또는 `--apply --backup-receipt <path>`이며 `--help`는 연결 없이
exit 0이다. check도 전용 recovery URL만 사용한다. malformed JSON/중복 옵션/알 수 없는 옵션은 exit 2,
receipt·schema·history 불일치/연결·적용 실패는 exit 1이다. receipt는 버전이 있는 JSON으로 대상 DB·app schema,
D2 artifact/11개 migration digest, cleanup 이름·checksum, recovery 이름·SQL checksum, backup 참조와
운영용 rehearsal evidence 참조를 요구한다. credential-bearing URL이나 backup 원문을 receipt 로그에 내지 않는다.

최초 격리 rehearsal은 아직 자기 자신의 성공 증거를 가질 수 없다. TASK-IPA-D3-05 runner 내부에서는
초기 빈 DB 검사로 등록한 두 fixture DB와 검토 SQL로 하위 recovery bundle을 시험하고 그 결과를 생성한다.
이 fixture 증거 입력을 운영 CLI의 승인된 receipt로 위조하거나 일반 --apply의 gate를 생략하지 않는다.
운영 --apply는 이렇게 생성·검토된 실제 rehearsal evidence가 있어야만 허용한다.

복원 SQL은 현재 direct owner/repoOwner에서 ProjectMember(projectId,userId,role=owner)와 Project.owner를
재구성한다. PK·기존 양방향 FK·role default를 D2 catalog와 맞추고 owner를 채운 뒤 NOT NULL로 만든다.
direct owner/repoOwner는 D2의 nullable 상태, direct owner FK는 SetNull/Update Cascade로 복원한다.
기존 token/run/event/selection version과 모든 비호환 대상 외 값은 건드리지 않는다. D3 뒤 새로 등록된
프로젝트도 **현재** direct mapping에서 복원하므로 옛 backup의 프로젝트 목록만 사용하지 않는다.

복원의 검사·lock·재구성·사후 assertion transaction은 **보상 migration.sql의 BEGIN/COMMIT**이 소유한다.
wrapper가 interactive transaction으로 lock을 잡은 채 별도 Prisma migrate child를 기다리지 않는다.
wrapper의 read-only 사전 검사는 끝낸 뒤 child를 실행하고, migration은 자기 연결에서 잠금 뒤 조건을
다시 확인한다. 사후 외부 검사는 child 종료 뒤 새 read-only snapshot으로 수행한다.
완전한 D3 상태 또는 history까지 정확히 복원된 D2 상태만 받으며 후자는 no-op이다. 부분/혼합 schema를
무조건 IF EXISTS로 덮지 않는다. D3를 적용한 적 없는 D2 DB를 복구 완료로 보고하지 않는다.

성공한 cleanup migration을 `migrate resolve --rolled-back`로 되돌리거나 `_prisma_migrations`를 직접
수정하지 않는다. 복원 SQL은 별도 검토된 **전진 보상 migration**으로, 기존 history와 복원 한 개만 담은
격리 migration bundle/config에서 로컬 Prisma migrate deploy로 적용한다. 정상 배포 migration 디렉터리에
복원 SQL을 미리 넣어 모든 DB가 자동으로 legacy를 되살리게 해서는 안 된다. 복구 후 canonical history와
schema를 그 복구 결과에 맞춘 별도 변경으로 정리하기 전 후속 schema 배포를 중단한다.

recovery bundle은 receipt에 고정된 **기존 11개 + 적용된 cleanup 1개 + 보상 1개**만 가진다.
복구 때마다 다른 timestamp로 보상 이름을 새로 만들지 않는다. 동일 실행 재시도는 같은 migration 이름과
checksum을 사용한다. 예상 밖 pending/failed migration이나 checksum 차이가 있으면 child 실행을 거부한다.
원본 repo의 migrations.path를 바꾸지 않고 임시 config의 schema는 검증된 D2 복원 schema를 가리킨다.
child argv는 로컬 `node node_modules/prisma/build/index.js migrate deploy --config <bundle-config>` 형태다.

#### DDL 상태와 migration 이력의 복구 분기

DDL transaction과 Prisma의 migration bookkeeping을 하나의 atomic commit으로 가정하지 않는다.
운영 resolve는 아래 증거를 확인해 승인된 정확한 migration 이름에만 수행하고 wrapper가 자동 실행하지 않는다.

| catalog/데이터 | 이력 | 처리 |
| --- | --- | --- |
| 온전한 D2, cleanup 효과 0 | cleanup failed/unfinished, 보상 이력 없음 | 값 보존 확인 뒤 실패한 cleanup만 `resolve --rolled-back`, 같은 checksum 재시도 또는 D2 유지 |
| 온전한 D3, post 검사 통과 | cleanup failed/unfinished | cleanup SQL/checksum·전체 값 검증 뒤 `resolve --applied`로 기록 정리; 그 뒤에만 보상 migration |
| 온전한 D3 | cleanup 성공, 보상 없음 | 검토된 보상 migration 적용 |
| 온전한 D3, 보상 효과 0 | cleanup 성공, 보상 failed/unfinished | 값 보존 확인 뒤 실패한 보상만 `resolve --rolled-back`, 같은 이름/checksum으로 재시도 |
| 온전한 복원 D2 | 보상 failed/unfinished | 복원 catalog/행 값 확인 뒤 해당 보상만 `resolve --applied`; 확인 전 no-op/PASS 금지 |
| 온전한 복원 D2 | cleanup·보상 모두 성공, checksum 일치 | 복원 check/no-op, 새 event·migration 추가 없음 |
| 혼합 schema 또는 설명되지 않는 값 변화 | 어떤 상태든 | 자동 resolve/추가 DDL 중단, backup·진단 증거로 복구 판단 |

resolve는 schema를 복원하는 명령이 아니라 실패한 migration의 이력을 정리하는 명령이다.
[Prisma resolve 문서](https://docs.prisma.io/docs/cli/migrate/resolve).
deploy가 drift를 검사하지 않는다는 점도 별도 catalog 검사의 이유다.
[Prisma migration model](https://docs.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/mental-model).

backup restore도 별도의 빈 DB에서 실제 검증한다. traffic 재개 뒤 pre-drop backup으로 운영 DB를
덮으면 신규 작업이 사라질 수 있으므로 자동 선택하지 않는다. 보상 복원 불가 시 실제 backup 시점·새 데이터
차이를 제시하고 운영 복구 판단을 받는다. backup 존재만으로 복원 성공을 대신하지 않는다.

### TASK-IPA-D3-03: required schema와 transactional cleanup migration

- satisfies: REQ-IPA-015, REQ-IPA-016
- preserves: INV-IPA-001, INV-IPA-002, INV-IPA-006, INV-IPA-007
- governed-by: CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D3-01, VFY-IPA-D3-02

schema delta는 다음 표로 제한한다. User의 `ownedProjects @relation("ProjectOwner")` 이름은 유지한다.

| 대상 | 최종 상태 |
| --- | --- |
| Project.ownerUserId / repoOwner | `String` required |
| Project.ownerUser | required User, ProjectOwner relation, Delete Cascade / Update Cascade |
| ProjectMember / User.members / Project.members | 제거 |
| Project.owner | 제거; 외부 owner DTO 이름은 유지 |
| availability fields / User.version / event model / index | 값·default·관계·index 보존 |

새 migration은 BEGIN/COMMIT으로 감싸고 lock_timeout 5초, statement_timeout 30초를 명시한다.
위 보존 17개 table과 제거할 ProjectMember를 table 이름 오름차순의 `ACCESS EXCLUSIVE` mode로 lock하고,
pre 조건을 다시 검사한 뒤만
NULL 제약 강화·direct owner FK 교체·ProjectMember와 Project.owner 제거를 수행한다.
lock 순서·조건 검사는 SQL 자체에 포함하고 이름·NULL·owner 대응·cap·event snapshot을 검사하는
RAISE EXCEPTION 절을 drop 전에 둔다. JS helper가 child transaction 안에서 실행된다고 가정하지 않는다.
SQL의 plan 정규화/Free 1·Pro 5·Max 무제한 판정은 이 release의 core 정책과 같은 fixture로 교차검증한다.
upgrade 후 event.toPlan 차이, empty 신규 사용자 등 정상 예외도 SQL과 helper에서 같은 결과여야 한다.
현재 운영 규모에서 timeout 안에 완료되는지는 rehearsal로 확인하며 자동으로 timeout을 늘리지 않는다.
알 수 없는 view/index/FK 의존성이 있으면 중단한다. drop CASCADE로 임의 의존성을 지우지 않는다.

DDL은 강한 잠금을 요구할 수 있고, 열 삭제 시 관련 table 내부 index/constraint도 제거될 수 있다.
따라서 table 외 의존성뿐 아니라 내부 objects도 pre/post catalog로 비교한다.
[PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html),
[locking](https://www.postgresql.org/docs/current/explicit-locking.html).

D3는 사용 목록을 다시 정렬하거나 ProjectAvailabilityEvent를 새로 만들지 않는다. 해당 DDL/제약 검사가
실패하면 drop까지 전부 rollback되어야 한다. process 취소·lock timeout·commit 응답 유실은 성공으로
처리하지 않고 migration status/catalog를 재조회한다. 기존 migration 11개는 수정·삭제하지 않는다.

required Cascade는 부모 최종 설계에서 정한 변경이다. 격리 전용 User 삭제 fixture로 연결 Project의
삭제 동작과 다른 소유자의 데이터 보존을 검사하되, 실제 cleanup이 User나 Project를 삭제해서는 안 된다.
계정 삭제 API를 새로 구현하는 작업도 아니다.

### TASK-IPA-D3-04: 등록 shadow와 old policy·생성 타입 제거

- satisfies: REQ-IPA-015, REQ-IPA-016
- preserves: INV-IPA-001, INV-IPA-002, INV-IPA-003, INV-IPA-006, INV-IPA-007
- governed-by: CON-IPA-002, CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D3-01, VFY-IPA-D3-02

registerProjectIn의 `owner: input.owner`와 `members.create`만 제거한다. input.owner는 기존 repo form의
저장소 계정 값이므로 호환 입력 이름으로 유지하고 repoOwner에 기록한다. ownerUser.connect, initial token,
available=true, null selection/sync 시각, cap, CAS와 registration event는 유지한다. 기존 transaction test의
shadow 기대값을 제거하고 양 legacy write 부재·등록 성공/실패·event 1회·단회 token 결과를 검증한다.

activeProjectIds export와 전용 describe/import를 제거한다. availableProjectIds,
availabilityAfterPlanChange, availabilityBasis 및 상한·dispatch 규칙은 유지한다. plugin-lib sync로 복사하고
직접 generated 파일을 편집하지 않는다.

새 schema로 fresh Prisma generate한 뒤 ProjectMember model 파일/delegate/barrel/inline schema와
User.members/Project.members/Project.owner 타입 부재를 검사한다. 최종 model은 위 보존 목록의 17개다.
오래된 생성 파일을 남겨 타입 검사를 통과시키거나 any/assertion/tsconfig exclude로 우회하지 않는다.
nullable 방어와 외부 owner adapter는 의미가 바뀌지 않는 한 보존한다.

일반 CLI도 `tsconfig.json`의 **/*.ts 수집 대상이다. 삭제 6개 파일과 Member 타입 import/child 참조를
제거하는 변경을 같은 code cutover에 포함한 뒤 final client로 typecheck한다. 새 client로 먼저 타입 검사를
돌리고 old script 오류를 임시 exclude하는 순서는 허용하지 않는다.

### TASK-IPA-D3-05: 검증 시나리오 이전과 legacy 운영 도구 폐기

- satisfies: REQ-IPA-015, REQ-IPA-016
- preserves: INV-IPA-001, INV-IPA-002, INV-IPA-006
- governed-by: CON-IPA-002, CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D3-01, VFY-IPA-D3-02

D3 runner가 먼저 D2 runner의 exercise 시나리오를 인계한다: 동시 등록 cap, plan/selection 경쟁,
stale zero-write, sync 중간 실패 rollback, token/workspace/run/cursor 보존, event snapshot/version.
추가로 preflight owner 0/2/member/NULL/mismatch, drop rollback, post-drop 새 등록,
required FK, 실제 호환 복원과 D2 artifact smoke를 수행한다. 이전 test를 삭제해 통과 수만 줄이지 않는다.

runner는 `--allow-fixtures`, 고정 D2 baseline commit 입력, 서로 다른 빈 DB를 가리키는
`IPA_D3_REHEARSAL_DATABASE_URL`과 `IPA_D3_RESTORE_DATABASE_URL`이 모두 있어야 한다.
DATABASE_URL을 fixture fallback으로 사용하지 않는다. catalog와 실제 DB identity를 검사하고 일반 DB면
어떤 fixture도 만들기 전에 거부한다. D2 commit/manifest의 기존 11개 migrations와 schema를 별도 작업
디렉터리로 추출해 baseline client를 만들고 D3 후보만 추가 적용한다. 현재 HEAD나 과거의 오래된 client를
baseline으로 추측하지 않는다. 기존 D1/D2 script를 현재 repo에서 child로 부르는 의존성은 제거한다.

두 URL 문자열이 다르다는 것만으로 격리를 인정하지 않는다. 양 연결의 current_database() 이름이
서로 달라야 하고 replica가 아니어야 하며, 모든 non-system schema에 사용자 table/view/sequence가
없어야 한다. 같은 DB의 서로 다른 schema는 두 격리 DB로 인정하지 않는다. 실제 대상 PostgreSQL 버전과
app schema는 D2 evidence/receipt와 맞춘다. 빈 DB와 primary 여부는 fixture 생성 직전에 다시 확인한다.

baseline 추출은 commit 객체를 먼저 검증하고 git show/ls-tree argv로 한다. D2 helper/MCP body 검증에는
schema/client만이 아니라 그 commit의 필요한 app/core source와 tsconfig도 사용한다. **별도 child process**의
cwd와 TSX_TSCONFIG_PATH를 D2 작업 사본에 지정해 `@/*`·`@harness/core/*`가 현재 D3 코드를 가리키지
않게 한다. D2 generated client는 사본 안에서 생성하며 현재 src/generated/prisma를 덮지 않는다.
로컬 tsx 4.23.12의 `dist/cli.mjs`는 TSX_TSCONFIG_PATH 배선을 제공하고 현재 tsconfig의 alias는 repo 상대다.
dependency 버전/lock은 D2 artifact와 일치해야 하며 문서 검증이나 runner가 임의 npm install로 바꾸지 않는다.

Node/Prisma runner는 실제 D2/D3 service·query·serializer의 DB 회귀를 소유한다. 로그인 session이 필요한
웹 not-found/direct POST/브라우저 refresh는 고정 D2/D3 Next artifact를 실제 실행하는 별도 수동 protocol로
확인하고 결과를 같은 receipt에 연결한다. Node에서 server-only route를 직접 import하거나 가짜 응답으로
웹 smoke를 대신하지 않는다. 이 분리는 이미 D2 검증 경계가 채택한 방식이다.

pre-D3 fixture는 baseline client 또는 고정 parameterized SQL로 만들고 최종 client에서 제거된 Prisma
타입을 참조하지 않는다. 복원 뒤 고정 D2 artifact로 실제 등록·웹 owner 접근·MCP 전체 body를 확인한다.
post-drop fixture로 새 데이터를 만든 뒤 복원해 그 데이터까지 보존되는지도 확인한다.

모든 child는 argv 배열과 별도 env로 실행한다. SIGINT/SIGTERM은 신규 query/transaction을 중단하고
미commit 작업은 rollback, 이미 commit한 단계는 기록한다. finally에서 child 종료를 기다린 뒤 listener,
client/pool과 자신이 만든 검증된 임시 디렉터리만 정리한다. 실패 DB는 보존하고 broad reset/delete는 하지 않는다.

이전 완료 뒤 위 삭제 6개 파일과 package의 check:project-ownership, backfill:project-availability,
test:project-availability:db, test:project-availability:d2:db를 제거한다. runtime test의 CLI 실행 검사는
삭제된 파일/명령/child 참조 부재 검사로 바꾼다. registration shadow 허용 fixture도 거부 fixture로 뒤집는다.
기존 test:project-availability wildcard와 check 연결은 유지해 새 cleanup test가 실제 CI에 수집되게 한다.

금지 대상은 runtime·최종 schema/generated·현행 일반 도구의 Member/legacy owner read/write와 old policy다.
허용 대상은 immutable migration history, 과거 proposal/실행 기록, 새 preflight/recovery/fixture의 명시적
legacy 검사·복원 SQL, 검사기의 forbidden fixture다. 에이전트 TeamMember와 외부 repository owner도
별개 개념이다. 광범위한 문자열 삭제나 directory 전체 예외를 만들지 않는다.

### TASK-IPA-D3-06: current contract·배포·복구 인계

- satisfies: REQ-IPA-015, REQ-IPA-016
- preserves: INV-IPA-001, INV-IPA-002, INV-IPA-006
- governed-by: CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D3-01, VFY-IPA-D3-02

현재 architecture의 shadow 필요 주장을 최종 required 모델로 갱신하고 verification 문서의 폐기/신규
script 목록을 교체한다. 이미 직접 owner로 정리된 glossary와 UI copy는 다시 설계하지 않는다.
CONTEXT에는 DB 구현 설명을 넣지 않는다. private D2 copy evidence를 인수하되 D3가 단지 cleanup이라는
이유로 미확인 corpus를 확인 완료로 표기하지 않는다. 과거 이관 기록은 역사적 문맥 그대로 남긴다.

최종 인계는 D2/D3 artifact·client·migration digest, 대상 DB 버전/catalog, pre/post 전체 값 비교,
backup/restore 결과, compensation migration 경로, 수행자/시각과 실패 시 복구 상태를 포함한다.
모든 토큰·URL·본문은 마스킹한다. 실제 완료 전 proposal을 completed로 이동하지 않는다.

## 최종 Artifact / 검증 목적지

| 산출물 | 결정 경로 | 확인할 결과 |
| --- | --- | --- |
| 최종 DB | schema → D3 migration → catalog | Member/legacy owner 없음, required/Cascade, 비대상 objects 보존 |
| 생성 client | final schema → Prisma generate | 17 model, Member delegate/relations/owner scalar 없음 |
| 등록 결과 | action → registerProjectIn → availability tx/event | 기존 token/result/cap 유지, shadow SQL 없음 |
| 프로젝트 공개 JSON | access → project-query adapter → MCP serializer | owner/available/reason 규칙·Workspace 값/배열 보존 |
| 웹 읽기/선택 | 기존 owner guard·FSD action/model | 다른 owner not-found, Source 읽기·revoke·stale·cursor 보존 |
| 운영 복구 | 현재 direct mapping → 보상 migration → D2 artifact | 현재 모든 프로젝트의 legacy 복원, 새 데이터·원장 불변 |
| CI 도구 | package scripts → check/test:web/core | deleted CLI 참조 없음, cleanup 검사 수집 |

## Verification Detail

Canonical verifiers는 부모 [VFY-IPA-D3-01](./individual-project-availability.md#vfy-ipa-d3-01-memberlegacy-owner-제거-검사)과
[VFY-IPA-D3-02](./individual-project-availability.md#vfy-ipa-d3-02-전체-회귀와-복구)다.

### Verification detail for VFY-IPA-D3-01

1. 최종 schema/generated/client/public exports와 모든 runtime import를 구조적으로 검사한다.
   Member shadow write까지 금지하고 외부 owner DTO와 허용된 recovery SQL은 구분한다.
2. 삭제한 6개 파일과 4개 package command, D2 child 호출은 사라지고 새 목적지/tests가 수집된다.
3. fresh install 경로는 기존 migration 11개를 보존한 채 D3까지 적용되어야 한다. 과거 SQL에 Member가
   등장하는 것은 역사적 생성·삭제 과정이며 실패 조건이 아니다.
4. 실제 catalog에서 NOT NULL·FK action/index와 예상 drop만 확인한다. undocumented 의존성은 실패다.
5. 새 client/등록 action/CLI 전체 type·FSD·build를 통과하고 API body에서 외부 owner rename이 없어야 한다.

### Verification detail for VFY-IPA-D3-02

1. 정상/owner 0·2/member/NULL/orphan/mismatch 및 깨진 set/event fixtures: 실패는 drop·보정 write 0.
2. 정상 snapshot → cleanup → post 검사: 제거된 shadow 외 17 model의 전체 값·PK·관계·cursor 동일.
3. lock contention/statement timeout/중간 DDL 오류/취소: partial schema가 없고 상태 재조회로 재진입 가능.
4. 별도 User 삭제 fixture로 Cascade와 다른 owner 데이터 보존을 검사한다. cleanup의 no-delete 검사와 분리한다.
5. D2의 등록·plan·selection·sync concurrency/rollback 시나리오를 최종 schema에서 실행한다.
6. available/selected-out × owner/other user × web read/write/revoke/use, agent 13개 도구와 owner MCP,
   templates/runbook의 status/body·zero-write를 기존 D2 matrix대로 검사한다.
7. 실제 D2 호환 복원 → D2 client/build 등록·MCP·웹 smoke. D3 이후 새 프로젝트도 복원에 포함되어야 한다.
8. 별도 DB backup restore를 수행해 전체 snapshot을 비교한다. 복원 명령 성공만으로 PASS로 처리하지 않는다.
9. 정상/오류/취소 뒤 열린 child/DB/listener가 없고 원본 repo schema/migrations/generated client가
baseline 생성에 의해 덮이지 않았는지 검사한다.
10. helper와 migration SQL의 정상/실패 판정이 동일하고, DDL commit 뒤 이력 실패 fixture에서 위 복구
    분기를 따른다. successful migration에 rolled-back을 적용하거나 failed 이력을 무시한 no-op은 실패다.
11. 같은 DB/다른 schema URL, 잘못된 baseline alias, 다른 client, 추가 pending migration, 변조 receipt,
    반복 보상 이름 변경을 모두 거부한다. wrapper lock 상태에서 migrate child를 실행하지 않음을 확인한다.

### 구현 뒤 실행할 명령

다음 JSON은 package scripts의 **추가 항목**이며 전체 package.json을 대체하지 않는다.

```json
{
  "check:project-ownership:cleanup": "node --import tsx scripts/check-project-ownership-cleanup.ts",
  "test:project-availability:d3:db": "node --import tsx scripts/rehearse-project-availability-d3.ts",
  "restore:project-ownership:shadow": "node --import tsx scripts/restore-project-ownership-shadow.ts"
}
```

```bash
npm run db:validate
npm run db:generate
npm run sync:plugin-lib
npm test
npm run test:web
npm run test:project-availability
npm run verify:fsd
npm run test:architecture
npm run check
npm run build
```

private corpus 준비 뒤 `npm run test:templates`를 실행한다. 실제 DB suite는 두 전용 DB와 고정 baseline
입력 후 D3 command의 --allow-fixtures로 실행한다. baseline 인수는 `--baseline <commit>`이며
실제 승인된 commit만 받는다. 운영에서는 fixture runner를 실행하지 않는다.
현재 local source 검증의 baseline 인수는
`--baseline 7e1678d3b4a66040618b25702541ab0315bdf639`다. 운영 실행에서는 push된 동일 commit과 receipt를 대조한다.
cleanup 생성은 별도 빈 development/shadow DB에서 로컬 Prisma
`migrate dev --create-only --name remove_individual_project_ownership_shadow`로 시작하고 검토 SQL을 완성한다.
--create-only도 development/shadow DB를 사용할 수 있으므로 운영 URL을 쓰지 않는다. deploy는 생성·drift
검사를 대신하지 않으며 code client는 별도로 generate한다. 복원 bundle 생성·check·apply는 TASK-IPA-D3-02의
전용 URL/receipt 계약을 따른다. 이 명령들은 이번 문서 검토에서 실행하지 않는다.
Turbopack 권한 오류 재현 시 Webpack fallback은 별도 증거로 기록하고 CI 기본 build 성공으로 대체하지 않는다.

## Rollout / Recovery 순서

1. D2 exit·backup/restore·D3 전체 격리 검증·SQL 검토와 운영 승인 확보.
2. D3 code/client artifact를 사전 빌드한다. 검증되지 않은 artifact로 DDL부터 적용하지 않는다.
3. 모든 웹/MCP/API traffic, plan grant·등록·선택·sync·agent writer와 운영 도구를 drain한다.
   in-flight 종료 확인 뒤 변경 없는 snapshot/backup과 최종 preflight를 확보한다.
4. 검토된 migration을 로컬 설치 Prisma migrate deploy로 적용한다. DDL 안에서도 검사·lock을 반복한다.
5. 성공 catalog/post 검사 뒤 D3 artifact를 배포한다. permission/등록/selection smoke 후 traffic을 연다.
6. catalog·데이터와 migration 이력을 함께 분류한다. failed/unfinished 이력은 TASK-IPA-D3-02의 증거/resolve
   분기로 먼저 정리한다. DDL rollback이면 D2 상태를 확인하고 운영 복구, DDL commit 후 코드 실패이면
   traffic을 닫은 채 검증된 보상 migration → D2 schema/client/body smoke 순으로 복원한다. 단순 code revert 금지.
7. 복구 후 history/schema가 정리될 때까지 추가 migration을 중단한다. D1 backfill은 어떤 복구 경로에서도 실행하지 않는다.

유지보수 창은 데이터 보호를 위한 실행 방식이다. 실제 길이·lock 시간·복구 시간은 대상 규모의 rehearsal로
측정해 운영 승인에 포함한다. 이 문서가 가용성 목표나 backup 데이터 손실 허용치를 새로 정하지 않는다.

## Readiness / Verification Results / DoD

- Verdict: **BLOCKED**. D2 실제 exit와 BLK-IPA-D3-01이 미해소다.
- Local implementation: 완료. 운영 전환과 Phase 완료는 아래 미실행 검증 때문에 BLOCKED다.
- 새 제품 정책 결정: 없음. required Cascade는 부모 최종 모델을 따른다. 운영 DB/backup/artifact 정보는
  실행 입력이며 확인되기 전 실제 drop·복구 실행을 하지 않는다.
- 문서 검증: 부모+D1+D2+D3의 standard traceability와 D3 Task/VFY 의미·경로·명령 구조를 확인한다.
  broad parent와 blocked Phase이므로 strict를 D3 준비도 판정으로 사용하지 않는다.
- 실제 D3 unit/type/build: Executed/PASS. DB/backup/private/browser 검증: Not executed.
- 이 문서는 실제 로컬 구현 기록을 포함하지만 별도의 reconciliation clean pass나 Phase 완료를 주장하지 않는다.

문서 작성 시 실제 검증 결과:

| 검사 | 결과 | 한계 |
| --- | --- | --- |
| 부모+D1+D2+D3 standard traceability | PASS — 4 files, TASK 18, REQ coverage 16/16 | 코드·DB의 요구사항 구현 완료를 의미하지 않음 |
| D3 6 Tasks → 부모 D3 VFY 의미 대조 | PASS | 실제 verifier 실행은 향후 작업 |
| YAML/JSON·shell syntax·상대 링크/anchor·신규 경로 충돌 | PASS | SQL·CLI는 구현됨. 실제 DB 실행은 미완료 |
| D3 schema validate/generate/type/lint/FSD | PASS | CI placeholder URL은 DB에 연결하지 않음 |
| `npm run test:project-availability` | PASS — 17 tests | DB 없는 cleanup/runtime/CLI guard 검사 |
| `npm run test:web` | PASS — 273 tests | D2 권한·선택·MCP/UI 회귀 포함 |
| `npm test` | PASS — 149 tests | 샌드박스 loopback 제한 때문에 허용된 실행에서 재검증 |
| `npm run check` | PASS | architecture 19 tests와 cleanup 14 tests 포함 |
| `npm run build -- --webpack` | PASS | 기본 Turbopack의 기존 local-port EPERM 때문에 Webpack production build 사용; 설정은 변경하지 않음 |
| D3 runner guard | PASS — 전용 URL 둘이 없으면 fixture 전 exit 2 | 실제 PostgreSQL suite가 아님 |
| 실제 D3 DB/backup/private/browser | Not executed | 전용 DB·D2 artifact·backup/corpus 없음 |

완료 조건:

- [ ] D2 exit, 고정 artifact, 복구 담당자·backup/실제 restore 증거가 승인됨.
- [ ] DROP 이전 전체 무결성·catalog·값 snapshot 검사 통과.
- [x] 로컬 schema/generated에서 required owner/repo와 Cascade가 정의되고 Member/legacy owner가 사라짐.
- [x] shadow registration/old policy/legacy CLI·child 의존성이 제거되고 D3 검증으로 이전됨.
- [ ] 사용 목록·version·event·token·Workspace·run·cursor 전체 보존과 D2 권한/UX 회귀 통과.
- [ ] D2 보상 복원과 별도 DB backup restore를 실제로 재현함.
- [ ] DDL commit/Prisma 이력 실패와 wrapper/child lock 경계를 검증하고 안전한 재시도/no-op을 확인함.
- [ ] baseline source/client/alias 격리와 두 실제 DB의 격리를 입증하고 helper/SQL 판정이 일치함.
- [ ] current contracts·generated outputs·CI와 배포 artifact가 동일한 최종 모델을 가리킴.
- [ ] 결과/실패·복구 상태를 기록하고 실제 Phase 완료 승인 뒤에만 completed로 이동함.

## Reconciliation 기록 — 2026-09-14

처음부터 개선점이 존재했다. 다음 내용을 Task·inventory·검증·rollout·DoD에 반영했다.

| 개선 영역 | 코드/동작 근거와 반영 |
| --- | --- |
| 복구 transaction/이력 상태 | Prisma child는 별도 연결이며 성공 DDL과 failed migration 기록을 분리해야 함. SQL이 lock/transaction을 소유하고 catalog+history별 복구 분기·고정 보상 identity를 추가 |
| 검증 artifact 격리 | 현재 tsconfig alias는 repo 상대이고 D1 runner는 schema/client만 별도 생성함. D2 전체 필요 source·client·child tsconfig를 격리하고 웹 protocol과 Node DB 검증을 구분 |
| 실행 가능한 검사/CLI 계약 | withPrisma는 DATABASE_URL만 읽음. 전용 URL bootstrap·receipt/exit/check/no-op 조건, 최초 isolated rehearsal과 운영 receipt의 차이를 명시 |
| 판정·수집 누락 방지 | 정상 plan-only change를 거부하지 않도록 하고 helper와 실제 migration SQL을 교차검증. generated 표면과 삭제 script의 TypeScript 수집·후속 검증을 구체화 |

검토 bundle은 부모+D1+D2+D3와 현행 schema/migrations·등록·access/availability·MCP·script/CI/config다.
실제 D2 운영/DB/private evidence와 D3 backup/restore evidence는 아직 없어 전체 reconciliation 상태는
`clean pass not completed`다. 이번 수정과 문서 validator 통과를 실제 drop/복구 가능 증거로 해석하지 않는다.
최종 저장본을 추가 편집 없이 재검토하며, 외부 evidence 확보 뒤 INV-1~7 전체 closure를 다시 확인해야 한다.

## D3 로컬 구현 기록 — 2026-09-14

- final Prisma schema와 cleanup migration을 추가했다. 기존 11개 migration은 수정하지 않았다.
- cleanup/helper/recovery/runner 현재 SHA-256은 각각 `584f10489349904079ec3640d27194c3e2684a7f5ceef9a6e0bdda01de88dd75`,
  `685e092bb578681bf1d5eb820aa5b306d0f4761d14255c12034f82dc865e20d9`,
  `585ba7b7522ee8f11e28d91e8eb8b34999de1cb3b31defb871ef7b2b96dd7097`,
  `717133e2795263f3cc3983857a2650408726131f750ce59b32c81161ec23c819`다. 문서 이후 변경 시 이 값은 새 evidence로 교체한다.
- D1 migration의 event 배열 nullable DDL을 발견해 D3가 기존 NULL을 거부하고 세 배열을 NOT NULL로 강화한다.
- 등록 shadow와 old active policy를 제거하고 generated client 17 models/외부 owner adapter를 검증했다.
- cleanup pre/post helper·CLI, migration 상태·receipt·D2 artifact checksum 검사, 고정 보상 SQL/wrapper를 추가했다.
- cleanup report는 owner shadow를 제외한 17개 보존 table의 전체 값 fingerprint를 같은 read-only snapshot에서 기록한다.
- D3 runner는 승인된 40자 D2 commit과 서로 다른 빈 primary DB 두 개를 요구한다. 고정 D2 source/client/alias,
  preserved-row hash, final 등록·동시 선택, 보상 복구와 D2 smoke를 수행하도록 구현했다.
- 실제 DB가 없어 migration SQL 실행, lock/timeout·Prisma history failure, compensation/backup restore는 실행하지 않았다.
- 삭제된 D1/D2 script는 위 D2 commit에서 복구 가능하며 임시 archive도 push 완료 전까지 유지한다.

## Completion or Closure Notes

현재 pending/blocked다. 실행 후 완료일, PR/commit, 실제 migration 경로·checksum, VFY별 결과,
pre/post/restore evidence와 배포·복구 상태를 기록한다. 취소 시에는 closed metadata와 이미 반영된
schema/data 유무 및 필요한 복구 작업을 적는다. 문서 작성만으로 이 값을 완료 처리하지 않는다.
