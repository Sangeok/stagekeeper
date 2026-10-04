---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-03"
approved-by: "user"
approved-at: "2026-10-03"
approval-scope: "copy, implementation, isolated verification, plugin version, public dev PR/merge, private template PR"
completed-at: "2026-10-04"
verification-summary: "PR #102·#103 dev 병합 및 로컬 구현 검증 완료. 2026-10-04 관련 회귀 테스트 192개·웹 액션 테스트·plugin/lib 동기화 검사 통과. Private 런북 PR 병합·운영 배포·watch 실측은 후속 작업이며 미완료."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-10-03-local-watch-executor.md"
  - "docs/proposals/completed/2026-09-07-human-checkpoint-consistency.md"
  - "docs/proposals/completed/2026-09-10-configurable-pipeline.md"
---

# 웹에서 끝나는 인수 — 실패 기록, 다시 실행, 세션 차례 배너, 레일 auto 표시

## Summary

인수 성공은 지금처럼 메인 루프가 저장소에서 다섯 조건을 재현하고 커밋한 기록을
`report_submit`으로 제출해야 한다. 웹 클릭으로 `acceptedAt`을 찍지 않는다.
추가하는 것은 실패 경로다. 세션이 `acceptance_fail`로 실패 조건과 메모를 남기면 그 항목은
소유자를 기다린다. 소유자는 항목 페이지에서 **Run acceptance again** 또는 Reopen을 선택한다.
실패가 끝날 때까지 watch는 해당 항목의 조건을 반복하지 않는다.
인수 대기는 세션 차례, 실패는 소유자 차례로 표시하며 Pipeline 레일은 Propose 앞을 뺀
게이트 없는 칸마다 `auto → …`를 표시한다.

문서 정합성 검증 뒤 사용자가 2026-10-03에 이 문서를 바탕으로 실제 구현과 dev 병합을 승인했다.
카피·구현·격리 검증·private PR은 이 지시에 포함한다. 운영 DB migration/seed·플러그인 설치 갱신·main 승격은 별도다.
코드 구현은 PR #102·#103으로 dev에 병합됐으며 구현 검증 결과는 아래에 기록한다.
2026-10-04 사용자 지시에 따라 코드 구현·격리 검증·dev 병합 완료를 기준으로 제안서를 completed 처리한다.
Private 런북 PR 병합과 운영 배포·설치 갱신·watch 실측은 후속 작업으로 남긴다.

## Goal

### 목표

- watch 실행 중이고 필요한 커밋 권한이 있으면 실패 기록·웹 재시도·성공 기록까지 터미널 입력 없이 이어진다.
- 실패 조건·메모·시각·선택적 기록 링크가 항목 페이지에 표시되고 배너와 이력에 실패가 드러난다.
- 실패 항목만 소유자를 기다린다. 다른 ready 항목과 허용된 head는 계속 진행한다.
- 레일의 게이트 유무가 **Gate · you** 또는 `auto → …`로 읽힌다.
- 계약 문서의 “사람이 다섯 조건을 재현한다”를 메인 루프의 실제 수행과 일치시킨다.

### 비목표 / 보존 경계

- 웹 인수 성공, 세션 Reopen, Inbox·Board 카드 추가, 새 보드 상태는 만들지 않는다.
- 웹은 watch 실행 여부를 알거나 세션을 깨우지 않는다. 재시도는 실패 해제이며 작업 기동 확인이 아니다.
- `before-accept`의 승인·entry·커서 계약과 인수 성공 `report_submit`의 기존 허용 범위는 바꾸지 않는다.
- `commit:no` 성공 기록의 커밋 핸드오프를 위한 새 원장은 만들지 않는다. Q3은 운용 권고다.
- 실패 기록은 커밋 없이 가능하다. Reopen 노트 자동 채움, 알림, 재시도 횟수 제한은 후속 후보다.
- 계정 사용량·요청 제한, 토큰 유효성, 플랜, 사용 선택·연결 해제 정책은 보존한다.
- 운영 DB 분리와 레거시 항목 자동 보정은 포함하지 않는다.

### 성공 기준 / Definition of Done

제안서의 completed 처리는 아래 구현 완료 조건을 기준으로 한다.
운영 후속 작업은 별도의 완료 조건을 충족해야 하며, 문서 완료가 운영 완료나 운영 변경 승인을 뜻하지 않는다.

#### 구현 완료 조건

1. done·열린 accept·미인수·열린 실패 없음은 배너의 세션 차례이며 기존 accept 터미널 줄을 보존한다.
2. 실패 뒤 single key와 key 없는 `pipeline_next`가 `wait/acceptance`를 반환하고 watch가 그 항목을 일로 세지 않는다.
3. 실패는 소유자 차례이며 해당 항목의 터미널 줄은 없다. 실패만 pending이면 상세를 연다.
   다른 게이트 카드가 있으면 기존 Inbox 우선 규칙을 보존한다.
4. 재시도·두 Reopen은 실패 행을 삭제하지 않고 끝낸다. 재시도는 상태·커서를 옮기거나 acceptedAt을 쓰지 않는다.
   같은 key의 실패 A가 해제된 뒤 실패 B로 교체되면 UI 상태는 B의 기록 ID로 새로 시작한다.
   해제 상태를 화면이 한 번도 보지 못했어도 A의 pending·안내·늦은 응답을 B에 적용하지 않는다.
   자신의 정상 재시도로 A가 먼저 화면에서 사라져도 같은 항목의 확인된 성공 안내는 한 번 표시한다.
5. 열린 실패 중 main-loop 인수 보고는 Report·이벤트·커서 변경 없이 거부된다.
6. 레일의 기존 auto planning/implementing과 게이트 편집 권한을 보존한다.
7. 검증 행렬·명령·실제 Next/브라우저·격리 최종 본문을 확인한다. 미실행·skip을 Pass로 세지 않는다.
   agent 15개·owner `["gate_approve"]`의 고정 등록 집합과 retry의 두 MCP 부재를 검증한다.

#### 운영 후속 작업의 완료 조건

1. 실측 시작 전에 watch·권한·플러그인/런북 판을 기록하고 “실패 → 웹 재시도 → 다음 폴링 → 성공”을 관측한다.
   초기 설정과 관측 구간을 구분하고 구간 안에 터미널 입력이 없었는지 기록한다.
2. 카피·레거시·운영 승인·본문 일치 조건을 충족하지 않으면 해당 운영 단계는 완료가 아니다.
   런북의 cap 안내와 protocol의 제품 사용량·실행 저장 절은 서버 reason/resetAt·계정 단위 5시간 계약과 일치해야 한다.
   옛 30일 dispatch cap 안내를 재배포하지 않는다. 30일 History 조회 정책은 그대로다.

## Proposal Size

`standard`. 새 영속 모델·migration, MCP 도구·응답, 서버 쓰기·웹 흐름,
독립 배포 단위인 플러그인·private 템플릿이 함께 바뀐다.
Affected Files의 구체적 행을 범위로 사용하며 대략적인 파일 수를 구현 근거로 쓰지 않는다.

## Current State (구현 시작 전 정합성 검증 기준)

### 검증 기준 / source bundle

- 원격 dev: `9675a3efdaf12bb7c419d11c4164beaa55c89821`(PR #101, 계정 사용량·토큰 관리).
  원격 조회 후 fetch하여 확인했다.
- 문서 작업 트리 HEAD는 `0aec9ab9144f6c9c26c5e39c3321c09771791ddb`이다.
  **구현 착수 때 최신 dev를 반영하고 재대조한다.** 이번 문서 수정에서 merge/rebase하지 않는다.
- 검증에 읽은 주 작업 트리 HEAD `133bcff3b2d6a3eda3068a9506ed70b2e9871ca8`의 tracked tree는
  위 dev와 동일하다(`git diff --name-only HEAD origin/dev` 결과 없음). 다른 사용자 변경은 보존한다.
- private 원문: `harness-templates main@2babc87a3f42540274433afe03bb2bae153314ea`.
  로컬 `95ace9d70b63cc8598ab229e2fe1138467f11728`와 두 수정 대상 본문은 동일하다.
  로컬 차이는 `templates.test.mjs`의 최신 서버 API fixture다. 구현 PR에서 보존·통합한다.
  **런북 cap 본문은 아직 옛 30일 정책이다.** 서버 API fixture가 최신이라는 사실은
  런북 본문 정합성의 증거가 아니다. ⑤에서 현재 확정된 서버 계약에 맞추고 실제 배포 본문까지 확인한다.
- 구현 source bundle은 **이 문서 하나**다. related architecture·product-copy는 현재 계약과 변경 목적지다.
  기존 제안서는 결정 배경이며 그 안의 옛 구현 지시·명령을 이번 작업에 재사용하지 않는다.
- 설치된 Next 16.3.3의 `01-app/02-guides/server-actions.md`,
  `01-app/03-api-reference/04-functions/revalidatePath.md`,
  `01-app/01-getting-started/07-mutating-data.md`,
  `01-app/03-api-reference/04-functions/use-router.md`를 확인했다.
  액션 내부 인가·성공 후 literal 경로 revalidation·refresh를 사용한다.
  refresh는 Client state를 보존하므로 실패 기록 교체의 상태 초기화는 데이터 identity로 보장한다.
  현재 `next.config.ts`는 빈 설정이며 cacheComponents 활성화·새 캐시 설정 변경은 이번 범위가 아니다.
  클라이언트의 순차 dispatch는 다른 탭·세션의 동시 쓰기를 막지 않으므로 DB 잠금을 대신하지 못한다.

### 확인한 현재 동작

| 사실 | 현재 코드 근거 |
| --- | --- |
| 인수는 done의 main-loop report_submit이며 acceptedAt을 쓴다 | `board-rules.ts:decideReportSubmit`, `board-query.ts:submitReport` |
| 웹 성공 버튼은 증거 없는 선언으로 기각됐다 | `2026-09-07-human-checkpoint-consistency.md`의 A 대안 |
| accept는 실패를 모르고 계속 actionable work다 | `run-rules.ts:decideNext`, `packages/core/watch.mjs:actionableWork` |
| 같은 actionable 집합 3회는 stuck, 빈 집합은 반복 상태 초기화 | `watch.mjs:nextWatchState`·`STUCK_AFTER` |
| 모르는 wait 사유는 protocol-error다 | `watch.mjs:validateItem`, `plugin/bin/harness-watch.mjs` |
| done·미인수는 지금 배너의 소유자 차례다 | `turn-banner/model/turn.ts:deriveTurn` |
| 보드 쓰기는 User → Project 잠금 뒤 CAS·이벤트를 한 transaction에 저장한다 | `board-query.ts:inProjectTransaction`·`latestRow`·`claim` |
| Reopen은 사람 전용이며 acceptedAt·백로그 제거를 되돌리고 run을 재설정한다 | `packages/core/transitions.mjs`, `board-query.ts:transitionIn` |
| 서버는 저장소 재현·Claude 실행을 하지 않는다 | `docs/architecture/system-overview.md` |
| auto는 상태 경계 두 칸뿐이다 | `pipeline-rail.tsx:EdgeSlot`, `pipeline.mjs:BOUNDARY` |
| 최신 cap은 UsageLimitFailure이며 code/resetAt을 보존한다 | `run-rules.ts:PipelineNextInput.cap`, `run-query.ts:readProjectUsageCapIn` |
| private cap 안내는 아직 최근 30일 dispatch라고 적혀 있어 최신 5시간 계약과 다르다 | `plugin/templates/en/CLAUDE.runbook.md`의 cycle cap 분기·`packages/core/usage-window.mjs:USAGE_WINDOW_MS`·`protocol.md` 제품 사용량 절 |
| protocol의 실행 저장 절에도 옛 rolling 30일 설명이 남아 있다 | `docs/architecture/protocol.md`의 저장과 상한·`src/server/agents/run-query.ts:cursorTransaction`·`src/server/account-usage-query.ts:readAccountUsageIn` |
| 새 MCP도 요청 제한을 거쳐야 한다 | `mcp/tools.ts:guardUnavailable`, `mcp/deps.ts:requestLimit` |
| 플러그인 현재 판은 0.4.1이다 | `plugin/.claude-plugin/plugin.json` |
| 생성 모델 수 19를 고정한 검사가 있다 | `scripts/project-availability-runtime.test.ts` |
| by hand와 main-loop 계약이 어긋난다 | `protocol.md` 인수 절·`product-copy.md` §3/§14·`invariants.md` 보드 규칙 1·private 런북 |

표의 server 파일은 `src/server/pipeline/`, mcp 파일은 `src/server/mcp/`의 파일이다.
정확한 구현 경로는 Affected Files에서 확정한다.

### 읽기 전용 종속·재검증 경계

아래는 현재 구현 계약·최종 본문·검증 환경을 확인한 읽기 종속이다. 수정 범위는 Affected Files다.
재검증 후보는 이 문서에서 backtick으로 쓴 정확한 저장소 경로와 private `en/`의 전체 `.md` bundle 및
`plugin/templates/templates.test.mjs`다. private 수정 대상은 Affected Files의 세 경로로 한정한다.
존재/부재를 포함한 정렬 경로 집합과 파일 본문을 비교하고, 새 import·경로가 생기면 full pass로 돌아간다.

| 경계 | 읽기 종속 |
| --- | --- |
| 승인된 구조 | `docs/architecture/README.md`, `docs/architecture/fsd.md`, `docs/architecture/system-overview.md` |
| 보드·커서·권한 | `src/server/pipeline/run.ts`, `src/server/pipeline/history-page.ts`, `src/server/project-access-query.ts`, `src/server/account-usage-query.ts`, `src/server/result.ts`, `src/server/auth/guard.ts`, `src/server/mcp/auth.ts`, `src/server/mcp/views.ts`, `src/server/mcp/owner-tools.ts`, `src/server/request-rate-limit.ts`, `src/server/rest-scope.ts`, `src/server/user-scope-query.ts` |
| 공개 symbol·표시 | `src/fsd/entities/board-item/index.ts`, `src/fsd/entities/board-item/model/doc-link.ts`, `src/fsd/shared/lib/relative-time.ts`, `src/fsd/shared/ui/button.tsx` |
| 정책·watch·본문 | `packages/core/transitions.mjs`, `packages/core/entitlement.mjs`, `packages/core/usage-window.mjs`, `packages/core/pipeline.mjs`, `packages/core/deliver.mjs`, `packages/core/render.mjs`, `packages/core/runbook.mjs`, `plugin/bin/harness-watch.mjs`, `plugin/bin/harness-init.mjs` |
| Template HTTP·runbook 판 | `scripts/seed-templates.ts`, `src/app/api/templates/route.ts`, `src/server/templates.ts`, `src/server/templates-query.ts`, `src/app/api/runbook/route.ts`, `src/server/runbook.ts`, `src/server/runbook-query.ts` |
| 환경·생성·시험 | `package.json`, `prisma.config.ts`, `next.config.ts`, `.github/workflows/check.yml`, `scripts/plugin-lib.mjs`, `scripts/test-server-integration.mjs`, `tests/server/integration/support.ts`, `tests/server/integration/board.test.ts`, `scripts/rehearse-repository-disconnection.ts`, `scripts/rehearse-src-clean-code.ts`, `tests/server/register-server-only.mjs` |
| 확정된 실행 사용량 계약 | `src/server/agents/run-query.ts`, `src/server/database-clock.ts` |
| 기존 Client 액션 패턴 | `src/fsd/features/review-gate/ui/reopen-actions.tsx`, `src/fsd/features/review-gate/ui/gate-transition-button.tsx` |
| 실제 Next 안내 | `node_modules/next/package.json`, `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`, `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` |

생성 목적지 검사는 schema·generator·기존 runtime 시험을 근거로 계획했다.
이번 문서 검증에서 신규 migration·generated client·운영 Template/HTTP 본문을 생성/실행했다고 주장하지 않는다.

### 결정 기록 (grilling, 2026-10-02~03)

| # | 결정 | 보존 의미 |
| --- | --- | --- |
| Q1 | 켜진 세션에 터미널 줄을 넣는 불편을 없앤다 | 증거는 세션이 만든다 |
| Q2 | 기본은 Accept 앞 게이트 없음 | 사용자 게이트 설정은 보존한다 |
| Q3 | commit:yes 운용 권고 | 제품이 권한을 강제·부여하지 않는다 |
| Q4 | 실패를 서버에 기록하고 웹에서 처리한다 | 세션은 Reopen하지 않는다 |
| Q5 | Run acceptance again 버튼 | 구현 오류는 Reopen, 실행 환경 문제는 재시도 |
| Q6 | 조건 번호·메모·선택적 path/commit | 실패에 커밋 필수 아님 |
| Q7 | 대기는 세션 차례, 실패는 소유자 차례 | 세션 실행 여부를 주장하지 않는다 |
| Q8 | 처리 장소는 항목 페이지 | Inbox·Board 카드 늘리지 않음 |
| Q9 | Propose 앞 외 모든 게이트 없는 칸에 auto | 상태 경계 문구 보존 |

소유자가 확인한 기본값: 재시도·Reopen은 소유자만, 횟수 제한 없음.
옛 서버·옛 런북 조합은 실패를 기록하지 않고 터미널에 알린다.
**새 서버의 accept hint도 새 도구를 지시하므로 옛 런북이면 실패 기록이 안 생긴다고 가정하지 않는다.**

## Scope

완료된 구현 범위는 아래 실패·재시도·배너·레일·계약·격리 최종 본문 검증이다.
Private 런북 PR 병합·운영 배포 일치 검증·watch 실측은 별도 후속 작업이다.
카피 승인은 구현 선행 조건, 운영 쓰기는 Approval의 별도 확인 대상이다.
비목표의 후속 후보·레거시 자동 보정은 제외 범위다.
현재 계정 사용량·토큰·요청 제한을 이전 정책으로 되돌리는 작업은 금지한다.
런북의 오래된 cap 설명을 현재 reason/resetAt 계약에 맞추는 것은 ⑤의 본문 정합성 작업이다.
protocol의 저장과 상한 절에 남은 rolling 30일 설명은 ③에서 같은 확정 계약에 맞춘다.
서버의 집계 창·상한·재개 허용·요청 예산과 History의 30일 창은 변경하지 않는다.

## Alternatives

| 대안 | 판정 |
| --- | --- |
| 웹 Accept가 acceptedAt 기록 | 증거 없는 선언, 기각(Q1) |
| 세션 Reopen | 사람 전용 결정 경계와 충돌(Q4) |
| 런북만 변경 | 서버가 accept를 반복하고 실패가 웹에 안 남음 |
| BoardItem 실패 열을 지웠다 재작성 | 실패 행의 내용·시각 보존 안 됨 |
| Report 재사용 | path/commit 필수·보고 수·Documents 의미가 Q6에 맞지 않음 |
| **AcceptanceFailure 모델** | 채택; 행 보존, clearedAt으로 결정 대기 종료 |
| wait/handoff 재사용 | 다음 행동이 dev의 커밋 뒤 agent_next라 틀린 지시 |
| **wait/acceptance** | 채택; 새 watch와 롤아웃 호환성 검증 포함 |
| Accept 앞만 auto | Verify·반복 슬롯까지 포함해야 Q9 충족 |

## Proposal

### 런타임 계약

| 시작 / 행동 | 결과 | 보존·회복 |
| --- | --- | --- |
| done·열린 accept·미인수·실패 없음 | accept, 배너 theirs | 터미널 줄 유지, main-loop 5조건 |
| 5조건 전부 통과·권한 있는 커밋·main-loop report | acceptedAt·Report·기존 advanceRun | 성공 증거·원장 계약 보존 |
| 조건 실패/실행 불가·acceptance_fail | 실패 1행·same-status 이벤트 | status·acceptedAt·backlog·run/entry 불변, updatedAt 증가 |
| 열린 실패의 accept | wait/acceptance, 배너 mine | 해당 항목 재검증 없음, 다른 work 유지 |
| 소유자의 최신 CAS retry | clearedAt·same-status 이벤트 | 행 보존, updatedAt 증가, 다음 next는 accept |
| retry + watch 켜짐/꺼짐 | 다음 기본 60초 폴링 / 실행 대기 | 클릭을 기동·성공 확인으로 표현 안 함 |
| 두 Reopen | 기존 전이·복원·run 재설정 + clearedAt | 사유 필수, planning의 validation 정리 보존 |
| 실패 중 done main-loop report | 거부 | Report·event·acceptedAt·cursor zero-write |
| 중복 실패·stale retry·다른 상태/게이트·닫힘·인수 완료 | 거부 | 전체 transaction rollback, fresh 상세 조회 |
| timeout·응답 유실 | 저장 여부 불명 | fresh board_get/pipeline_next, 자동 재제출·rollback 단정 금지 |
| retry 뒤 이전 세션의 늦은 failure | 새 실패가 될 수 있음 | 명시적 위험, attempt/entry 결합은 추가하지 않음 |
| 다른 탭의 retry 뒤 같은 key에 새 실패·해제 상태를 보지 못한 refresh | A→B의 실패 기록 ID 변경으로 leaf 초기화 | A의 늦은 응답은 B의 toast·안내·refresh를 실행하지 않음; fresh 상세가 기준 |
| 자신의 정상 retry가 같은 응답의 RSC에서 실패 A를 먼저 제거 | 실패 leaf만 사라지고 같은 항목 controller는 유지 | 확인된 성공 toast 1회; leaf unmount를 항목 이탈로 오인하지 않음 |
| fail/retry/Reopen/report 경쟁 | User → Project 직렬화 + CAS | 열린 실패 최대 1·이벤트 중복 금지 |

실패 wait는 해당 항목만 제외한다. 다른 일이 같은 signature로 계속 정체되어 stuck이 되는
기존 보호 장치까지 제거하지 않는다. 빈 work는 기존 반복 카운터를 초기화한다.
위 zero-write/rollback은 BoardItem·AcceptanceFailure·Report·TransitionEvent·BacklogItem·PipelineRun(entryId 포함)의
도메인 쓰기다. 기존 인증·접근·요청 예산의 기록은 별도이며 새 도구도 그 정책을 그대로 거친다.
새 polling/listener/registry는 없으며 watch 소유권·stop·timeout·cleanup을 보존한다.

### 데이터와 migration

`prisma/schema.prisma`의 BoardItem에는 `acceptanceFailures AcceptanceFailure[]`만 추가한다.

~~~prisma
model AcceptanceFailure {
  id          String    @id @default(cuid())
  boardItemId String
  checks      Int[]
  note        String
  path        String?
  commit      String?
  actorId     String?
  at          DateTime  @default(now())
  clearedAt   DateTime?
  boardItem   BoardItem @relation(fields: [boardItemId], references: [id], onDelete: Cascade)

  @@index([boardItemId, clearedAt])
}
~~~

- checks는 1~5 정수 1~5개·중복 없음. note는 기존 `checkText("note",note)`의 trim-empty 거부와
  JS 문자열 길이 150 예산이다. 조건 순서는 강제하지 않는다.
- path/commit은 둘 다 생략하거나 둘 다 비공백 문자열이다. 기존 보고처럼 서버가 파일 존재를 재현하지 않는다.
- actorId는 agent credential의 `actorRef`(`token:<id>`). main-loop는 수행 지침이며 별도 인증 역할은 아니다.
- 열린 실패(clearedAt:null)는 항목당 최대 1이다. 부분 unique index 대신 공통 User → Project 잠금으로 보장한다.
  두 실제 연결의 경쟁 검증은 필수다.
- 예약 migration은 `prisma/migrations/20261003000000_acceptance_failure/migration.sql`.
  격리 개발 DB에서 create-only로 생성·검토한 SQL을 예약 디렉터리에 둔다. 기존 migration·충돌 파일은 덮어쓰지 않는다.
- SQL은 위 table/column/default/PK, `AcceptanceFailure_boardItemId_clearedAt_idx`와 BoardItem FK
  (Cascade delete/update)만 추가한다. 필수 scalar는 NOT NULL, checks는 Prisma PostgreSQL의
  `INTEGER[]` 생성 표현을 따른다. 내용·최소 길이는 서비스 검사다. 기존 행 UPDATE/DELETE/백필 없음.
  cuid는 Prisma client가 생성하므로 id에 DB cuid 함수/default를 발명하지 않는다.
- generate 목적지는 `src/generated/prisma/models/AcceptanceFailure.ts`와 `client.ts`·`browser.ts`·
  `models.ts`·`internal/class.ts`·`internal/prismaNamespace.ts`·`internal/prismaNamespaceBrowser.ts`.
  모델·관계·delegate를 검증하며 생성 파일은 직접 편집하지 않는다.
- `scripts/project-availability-runtime.test.ts`의 모델 수는 19 → 20, 새 model file 존재를 단언한다.
  ProjectMember 부재 등 기존 검사를 보존한다.

create-only도 연결·shadow DB·drift 처리가 필요하므로 공유 운영 DATABASE_URL에서 실행하지 않는다.
`TEST_DATABASE_URL`을 기존 `validateTestDatabase`로 검증한 뒤 명령 범위의 DATABASE_URL을
격리 URL로 설정하고 finally 복원한다. reset 요청·drift·destructive SQL이면 중단한다.
운영은 별도 승인 후 `migrate status → 격리 리허설 → migrate deploy → 새 서버/웹` 순서다.

### 서버 규칙·서비스

`board-rules.ts`:

- MAIN_LOOP를 export하고 `ReportSubmitInput.acceptanceFailed:boolean`을 추가한다.
  기존 상태·보고자·implementing verify 선행 검사를 보존한 뒤 done/main-loop/acceptanceFailed이면 거부한다.
  false이면 기존 결과다. 다른 actor의 done 보고·in_review·implementing은 기존 계약이다.
- `ACCEPTANCE_CHECKS`·`decideAcceptanceFail`: 입력
  `{status,cursor:string|null,accepted:boolean,failed:boolean,checks:readonly number[],note,path?,commit?}`.
  미인수 done·열린 accept·기존 실패 없음·checks/note/pair를 검사한다.
- `decideAcceptanceRetry`: 입력 `{status,cursor:string|null,accepted:boolean,failed:boolean}`.
  미인수 done·열린 accept·열린 실패일 때만 성공한다. 두 판정은 `Decision<null>`다.

`createBoardQueries` 안에 추가할 서비스 계약(아래 type aliases는 인자·결과 설명이며 완성 구현이 아니다):

~~~ts
type FailAcceptance = (projectId: string,
  input: { key: string; checks: number[]; note: string; path?: string; commit?: string },
  actorRef: string) => Promise<ServerResult<AcceptanceFailure>>;

type RetryAcceptance = (projectId: string,
  input: { key: string; userId: string; expectedUpdatedAt: Date }
) => Promise<ServerResult<null>>;
~~~

1. 둘 다 `inProjectTransaction` 안에서 access 재검사 → `latestRow` → `ensureRun` →
   열린 실패(boardItemId/clearedAt:null) → 규칙 판정한다. 폐기 제외·key의 최신 회차만 사용한다.
   없는 항목은 기존 no-such-board-item 거부다.
2. format:null/slots-v1만 허용하고 slots-v1은 entryId 필수다. nextFor의 기존 format 거부와 일치시킨다.
   closedAt은 cursor:null로 판정한다.
3. fail은 `claim(tx,row,{})` 뒤 실패 행·same-status 이벤트를 저장한다.
   이벤트는 actor:agent, actorId:actorRef, channel:null, note:acceptance-failed.
   advanceRun/closeRuns는 호출하지 않는다.
4. retry는 잠금 안에서 ownerUserId와 input.userId를 확인한다. 불일치는
   `acceptance retry access denied`, zero-write다. 웹 guard를 이 검사의 대체로 삼지 않는다.
5. retry CAS는 id/expectedUpdatedAt/status/discardedAt:null, 갱신은 nextTimestamp다.
   실패면 stale를 던진다. 성공 이벤트는 actor:human, actorId:userId, channel:web,
   note:acceptance-retry. 열린 실패의 clearedAt은 그 event.at이다. run/version/entry/status는 불변이다.
6. 반환 binding은 reportFailure로 감싼다. BoardRejection만 실패 결과로 바꾸고 DB/event/commit 확인 유실은 전파한다.
   transaction 안에서 예외를 삼키지 않는다. 반환 객체와 board.ts의 명시적 export에 두 이름을 추가한다.

기존 함수의 변경:
- transitionIn reopen의 backlog 복원 뒤 열린 실패 updateMany(clearedAt:transitionEvent.at)를 추가한다.
  기존 전이·validation·closeRuns·resetRun을 보존하고 별도 retry 이벤트는 만들지 않는다.
- submitReport는 done/main-loop에서만 열린 실패를 조회한다.
  runId 검사·isAcceptance·acceptedAt timestamp·advanceRun은 보존한다.
- getWithHistory에
  `acceptanceFailures:{where:{clearedAt:null},orderBy:{at:"desc"},take:1}`을 include한다.
  현재 결정 대기에는 since를 적용하지 않는다. 기존 event/report 창과 hasHistoryBefore는 보존한다.
  cleared 원문은 DB 감사 기록으로 보존한다. 이번 상세·board_get은 열린 실패만, 해제 뒤 History는 라벨만 표시한다.
- 서비스 import는 기존 board-rules에 MAIN_LOOP/decideAcceptanceFail/decideAcceptanceRetry를 추가한다.
  AcceptanceFailure 타입은 생성 client에서 가져온다. 쓰지 않는 ACCEPTANCE_CHECKS는 import하지 않는다.

### pipeline_next·MCP

PipelineNext union에 아래 응답형을 추가한다(독립 타입 선언은 형태 설명이다).

~~~ts
type AcceptanceWait = { key: string; node: string; version: number; action: "wait"; on: "acceptance"; checks: number[]; note: string };
~~~

`PipelineNextInput.acceptanceFailure?:{checks:number[];note:string}|null`을 추가한다.
decideNext의 accept 분기에서 실패가 있으면 wait, 없으면 기존 accept다.
순서는 닫힘 → gate → accept(실패 포함) → handoff → cap → dispatch다.

**최신 dev 보존:** `cap:UsageLimitFailure|null`와 cap 응답의
`code:"USAGE_LIMIT_REACHED"`·resetAt, resumable 예외, HeadNext/decideHead는 그대로다.
삭제된 capReason/recentRuns/DISPATCH_WINDOW_DAYS 구현을 다시 넣지 않는다.
nextFor는 node===accept에서만 열린 실패의 checks/note를 읽는다.
기존 agentRun.findFirst의 entry·accepted-step 조건, handoffIsLive, readProjectUsageCapIn 연결은 보존한다.
createToolDeps의 overview(미결 + walkingKeys)·지연 전진·head·runbook stale 조립도 보존한다.
실패 done을 미결 2건 계산에 추가하지 않는다. gate_approve의 next는 union을 그대로 전달한다.

MCP 변경:
- AGENT_TOOL_NAMES·registration에 acceptance_fail을 추가한다.
  input은 `{project?,key,checks,note,path?,commit?}`이며 actor 인자는 없다.
  등록 agent 도구는 14 → 15다. protocol.md의 연결 해제·project scope·요청 제한 절의
  세 “14개” 참조도 acceptance_fail을 포함한 15개로 맞춘다. owner/REST의 도구·경로 수는 그대로다.
- schema의 project 설명은 기존 것, checks는
  `z.array(z.number().int().min(1).max(5)).min(1).max(5)`.
  note/pair 서비스 검사는 직접 호출에도 적용한다.
- `scope → guardUnavailable → unwrap(deps.failAcceptance)` 순서다.
  hu_ project/소유 확인·hs_ scope·토큰 인증/만료·사용 불가·요청 제한을 우회하지 않는다.
  failureBody의 RATE_LIMITED/retryAfterSec를 보존한다.
- ToolDeps.failAcceptance는 위 서비스 인자와 `Promise<ServerResult<unknown>>`이며 deps에서 board로 연결한다.
- BoardDetailView에
  `acceptanceFailures:{checks:number[];note:string;path:string|null;commit:string|null;at:Date}[]`.
  실제 board_get JSON의 at은 ISO다. 새로운 전체 실패 이력 표시·actor 표시 계약은 추가하지 않는다.
- 새 도구·pipeline_next 설명과 HINT.accept는 카피 덱에서 확정하고 schema/callback/실제 body까지 시험한다.
- retry 도구는 agent·owner MCP 어디에도 등록하지 않고 web action만 둔다.
  owner 등록 모듈은 변경하지 않으며 실제 등록 집합과 OWNER_TOOL_NAMES는 모두
  literal `["gate_approve"]`여야 한다. owner 시험의 기대값을 구현 상수에서만 가져오지 않는다.
  상수와 등록에 retry를 함께 추가해도 실패하도록 독립 고정 집합을 검사한다.

### 배너·레거시 진입 조건

TurnItem에 acceptanceFailed:boolean을 추가한다. loadTurn은 project의 열린 실패 boardItemId를 읽고
최신 rows와 연결한다. 실제 열린 cursor가 accept이며 done·미인수인 경우만 true다.
다른 회차·폐기·게이트·인수 완료를 실패 차례로 표시하지 않는다.

- pending은 gate 또는 failure 또는 기존 handoff다.
- working에 node===accept && isAwaitingAcceptance(status,accepted)를 추가한다.
- mineDetail은 승인 준비 → 계획 요청 → 다른 게이트 → 인수 실패 → 커밋 순서다.
- workingLine은 accept에서 “<KEY> is waiting for acceptance”를 먼저 반환한다. 실행 여부를 추정하지 않는다.
- nextStepLine은 failure일 때 **handoff 검사보다 먼저** null이다.
  정상 accept 줄·WATCH_LINE·다른 ready 항목 줄은 유지한다.
- open은 기존 Inbox 카드 우선, 없으면 pending 첫 항목이다. failure만 pending이면 Open <KEY>.
- pendingInboxCount·held·Board 카드·head는 바꾸지 않는다.

운영 배너 배포 전에 아래 read-only count를 확인한다. 0이면 기록 후 진행한다.
양수면 기존 배너를 유지하고 배포를 중단한다. 자동 run 생성·재인수·백필은 제외 범위이며
그 항목 처리 결정은 별도로 받는다. GET에서 run을 만들지 않는다.
미확인 count를 “레거시는 없을 것”으로 가정하지 않는다.

~~~sql
WITH latest AS (
  SELECT DISTINCT ON ("backlogItemId") "id", "status", "acceptedAt"
  FROM "BoardItem"
  WHERE "discardedAt" IS NULL
  ORDER BY "backlogItemId", "proposedOn" DESC
)
SELECT COUNT(*) AS unaccepted_done_without_accept
FROM latest b
LEFT JOIN "PipelineRun" r ON r."boardItemId" = b."id"
WHERE b."status" = 'done' AND b."acceptedAt" IS NULL
  AND NOT COALESCE((r."closedAt" IS NULL AND r."node" = 'accept'), false)
  AND NOT COALESCE((r."closedAt" IS NULL AND r."node" LIKE 'before-%'), false);
~~~

run 없음도 포함한다. URL·개별 항목·credential 대신 count/확인 시각만 보고서에 기록한다.

### 웹 액션·UI·symbol provenance

`review-gate.server.ts`에 `retryAcceptance(slug,{key,expectedUpdatedAt})`를 추가한다.
기존 requireProjectWrite/parseExpected/message/success/failure를 재사용한다.
권한·사용 불가·잘못된 날짜·서비스 거부는 쓰기/revalidation 없이 처리한다.
성공 뒤 projectPath(slug), projectPath(slug,"/inbox"), itemPath(slug,key) 세 literal 경로만
revalidate한다. advice/pipeline_next·Claude 실행은 호출하지 않는다.

~~~ts
type RetryAcceptanceAction =
  (input: { key: string; expectedUpdatedAt: string }) => Promise<ActionResult<void>>;
type AcceptanceFailureView = {
  id: string;
  checks: number[]; note: string; at: string;
  record: { path: string; href: string } | null;
};
~~~

route는 row.acceptanceFailures[0] 또는 null의 id/checks/note/at/path/commit을 item에 전달한다.
**at은 Date, 포맷은 기존 server page의 utcMinute**다.
BoardItemView.acceptanceFailure는 id를 포함한 이 Date 기반 최소 데이터 또는 null.
page가 view 문자열과 blobHref(recorded commit)를 만들고 public Client component에 넘긴다.
route는 표시용 포맷을 소유하지 않고 액션의 slug를 bind한다.
route params의 slug를 BoardItemPage의 명시적 `slug:string` prop으로 전달하고 기존 fixture에도 추가한다.
page는 slug+item.key로 Client wrapper의 React key와 항목 identity를 만든다.
action 함수 참조나 expectedUpdatedAt을 wrapper key로 쓰지 않는다. 같은 항목의 refresh·실패 해제에도
wrapper는 유지되며, 다른 프로젝트의 같은 key는 별도 wrapper다.

- UI는 Documents 아래·Reopen 위에 checks/UTC/escaped mono pre/선택적 Failure record 링크를 표시한다.
  path는 mono, 링크와 DOC_LINK_NOTE를 함께 표시한다.
- 실제 Button은 ButtonHTMLAttributes와 className을 지원하므로 mine-outline/self-start를 사용한다.
- canWrite:false는 실패 내용을 보존하고 retry 버튼·변경을 권하는 힌트를 숨긴다.
- useTransition pending·disabled, 확인된 success만 toast/refresh.
  서비스 거부는 error toast·상세 재조회로 회복한다.
  throw/transport loss/revalidation 실패는 저장 여부 불명인 중립 안내 뒤 fresh 상세를 읽는다.
  자동 재시도·“저장 안 됨” 단정은 금지하고 pending은 끝나야 한다.
- 기존 acceptedAt 주석의 needs-acceptance 전제를 갱신한다. 기존 Documents·Reopen·History는 보존한다.
- Client leaf는 항목 key와 **실패 기록 id**의 조합을 React key로 사용한다. key가 그대로여도 실패 A를
  해제하고 B가 생성되면 새 leaf다. 해제 상태를 중간에 렌더하지 못한 A→B refresh도 로컬 pending/안내를
  초기화한다. UTC 분 문자열이나 항목 key만으로 기록을 구별하지 않는다.
  응답 처리 controller는 같은 파일 안의 항목 identity(slug+key) 기반 Client wrapper가 소유한다.
  wrapper는 failure가 null이 되어도 마운트해 두며 그 안의 실패 leaf만 조건부 렌더한다.
  제출 시 항목·실패 identity를 고정하고 wrapper의 수명 및 이후 관측한 실패 기록 교체와 대조한다.
  B를 관측했거나 다른 항목으로 이동한 뒤 도착한 A의 응답은 toast·안내·router.refresh를 실행하지 않는다.
  B가 다시 해제되어도 교체 사실을 잊고 A의 응답을 되살리지 않는다. wrapper unmount cleanup은 guard를
  종료하며 DB 쓰기는 취소하지 않는다. leaf unmount만으로 응답 처리를 무조건 중단하지 않는다.
  자신의 정상 retry에서는 action의 revalidation이 같은 응답의 RSC로 A를 먼저 제거할 수 있다.
  같은 항목 wrapper가 살아 있고 다른 실패로 교체되지 않았다면 확인된 성공 toast를 정확히 한 번 표시한다.
  로컬 pending·안내는 leaf 소유, 결과 toast·refresh의 수명 판단은 wrapper 소유로 구분한다.
  재진입은 fresh 상세를 읽는다. 별도 timer/listener/구독은 만들지 않는다.
  같은 key의 기록 교체·정상 성공·항목 이동 중 응답·wrapper unmount 뒤 응답을 실제 브라우저에서 확인한다.

| symbol | owner → public API → 소비자 |
| --- | --- |
| failAcceptance/retryAcceptance(서비스) | board-query.ts → board.ts → mcp/deps.ts / web action |
| retryAcceptance(액션) | review-gate.server.ts → review-gate/index.server.ts → route bind |
| RetryAcceptanceAction | model/inbox-item.ts → review-gate/index.ts → page/UI |
| AcceptanceFailure/AcceptanceFailureView | ui/acceptance-failure.tsx → review-gate/index.ts → board-item page |
| blobHref/DOC_LINK_NOTE | entities/board-item/model/doc-link.ts → 기존 entities/board-item/index.ts → page/UI |
| utcMinute | 기존 shared/lib/relative-time.ts unit API → server page |
| autoEdgeLabel | entities/pipeline/model/labels.ts → entities/pipeline/index.ts → pipeline-rail.tsx |

### 이력·레일

history-row:eventContent의 same-status 처리에 acceptance-failed/acceptance-retry 라벨을 추가한다.
raw event.note를 실패 메모로 출력하지 않는다. report 중복 제외·창·cursor·tie-break·commit link는 보존한다.
history-page:eventWhere는 이미 to:done 이벤트를 key/all에 포함하므로 수정하지 않는다.
항목 History·프로젝트 History Events key/all에서 실제 응답/렌더를 확인한다.

autoEdgeLabel(kind)는 propose이면 null, 그 밖은 boundaryOf(gateId(kind)).to 또는
nodeLabel(kind).toLowerCase()로 “auto → …”다. aliases·canonical slots·#2도 nodeLabel을 재사용한다.
labels core import에 gateId/boundaryOf, public export에 autoEdgeLabel을 추가한다.
EdgeSlot의 boundary prop을 auto로, 호출을 autoEdgeLabel(kind)로 바꾸며 unused BOUNDARY는 제거한다.
gate 카드 분기는 그대로다. Free/읽기 전용도 auto 문구가 보인다.
Propose 앞의 기존 편집 메뉴/버튼까지 제거하는 작업은 아니다.

### watch·private 본문·계약

watch:validateItem에 wait/acceptance를 추가한다.
node=accept, checks 1~5 정수 1~5개·중복 없음, note 비공백 문자열·길이 ≤150을 검사한다.
actionableWork의 dispatch/accept만 수집하는 로직은 보존한다.
core 수정 뒤 sync:plugin-lib로 사본을 맞춘다. SKILL.md의 gate/handoff/cap 목록에도 acceptance를 추가하고
fresh pipeline_next가 accept를 다시 답하기 전 조건 반복을 금지한다.
소유권·propose/commit 정책·통지 중복 억제·cleanup을 보존한다.

plugin.json은 현재 **0.4.1 → 0.4.2**. 착수 때 먼저 배포된 판이 있으면 그보다 높은 patch로 확정한다.
private 런북은 wait 소유자 목록/cycle/accept/실패 문단을 서로 일치시킨다.
실패 시 `acceptance_fail({ project,key,checks,note })`, 선택적 committed path/commit,
소유자의 retry/Reopen 대기와 다른 항목 진행, timeout 뒤 fresh 조회를 지시한다.
5조건·보고 파일 예외·project·receipt/entry·commit/push 권한은 그대로다.
기존 Reopen 지시를 남긴 채 반대 문장을 덧붙이지 않는다.
docs/agents/README에도 같은 차례/실패 지침을 반영한다.
templates.test.mjs의 project-scope regex에 새 도구, 실제 렌더 body·새 규칙 false fixture를 추가한다.
최신 서버 API용 fixture는 보존한다. 현재 런북 cycle의 “dispatches for the last 30 days”를
카피 덱의 cap 후보로 교체하고 reason/resetAt을 전달한다. 기존 run 재개가 신규 사용량이 아니라는
계약을 보존한다. 착수 전 다른 private PR에서 이미 정합화됐다면 그 변경을 유지한다.
이 작업은 새 사용량 정책을 만들지 않는다. 전체 en bundle의 cap 설명·실제 렌더·DB/HTTP/사용자
관리 block까지 옛 안내가 없는지 검사하며 History의 30일 문구는 제거하지 않는다.

| 문서 목적지 | 반영할 계약 |
| --- | --- |
| protocol.md | report 거부·fail 도구·board_get active failure·7분기·retry/Reopen 정리·watch wait; agent 도구 수의 세 참조 15개 |
| invariants.md | failure 행 보존·최대 1·clearedAt; 성공 증거·사람 Reopen 보존 |
| product-copy §3·§5 | main-loop 재현·세션/소유자 차례·혼합 pending 버튼 |
| product-copy §11·§12·§13 | 상세·오류·toast·거부·MCP·hint |
| product-copy §14·§15·§18 | 런북·watch·레일·cap 본문 정합화, 5조건/권한·History 창 불변 |
| architecture/verification.md | 새 격리 재현 script·검증 목적지·cleanup |
| scripts/retired-copy.test.mjs | 보이는 웹 `needs acceptance` / `items need acceptance` 문구 재출현 금지 |

protocol의 제품 사용량 절과 저장과 상한 절을 함께 대조한다. 저장과 상한의 옛 rolling 30일 수는
현재 계정의 5시간 창·`User.usageWindowStartedAt`/`usageRunCount`·DB clock 기준으로 교체한다.
소유자 User→PipelineRun→AgentRun 잠금·열린 실행 재개·단계 CAS/rollback 계약은 보존한다.
`src/server/agents/run-query.ts`와 `src/server/database-clock.ts`는 이 결정의 읽기 근거이며 수정 대상이 아니다.

①의 카피 후보는 사용자의 구현 지시로 승인됐다. code-lock 본문은 각 대응 코드·시험과 함께 반영한다.
각 코드 묶음에서 대응 product-copy·코드·시험을 함께 변경한다.

### 카피 후보 (① 승인)

| 자리 | 후보 |
| --- | --- |
| 세션 차례 상세 | `ITEM-02 is waiting for acceptance`; 여러 항목은 기존 working 방식으로 잇는다 |
| 소유자 차례 상세 | `ITEM-02 failed acceptance` / `2 items failed acceptance` |
| 섹션 | `Acceptance failed` |
| 조건 1~5 | `Changed files` · `Diff vs sketch` · `Verify command` · `Backlog entry` · `Report record` |
| 조건 줄 | `3 Verify command · 5 Report record` + UTC 분 |
| 링크 | `Failure record ↗` + mono path + 기존 DOC_LINK_NOTE |
| 버튼 / pending | `Run acceptance again` / `Preparing…` |
| 힌트 | `Use this when the checks could not run — the environment, a missing push. When /harness:watch is running, the main loop runs all five checks again; otherwise continue the pipeline in Claude Code. If the code is wrong, reopen it below.` |
| 성공 toast | `Acceptance ready to run again · ITEM-02` |
| 확인 불가 | `Couldn't confirm whether acceptance was reset. Refresh to check the current state before trying again.` |
| 런북 cycle의 cap 분기 | `wait on a cap — new runs are unavailable until the server's resetAt. Relay the server's reason and reset time; an already open run can resume.` |
| 이력 | `Acceptance failed` / `Acceptance run again` |
| fail 상태 거부 | `acceptance_fail only while the item waits at the accept node` |
| 중복 거부 | `acceptance already failed — the owner runs acceptance again or reopens the item` |
| 조건 거부 | `checks: name the failed acceptance checks, 1 to 5, each once` |
| pair 거부 | `path and commit go together` (한쪽 누락·공백 pair 포함) |
| retry 거부 | `no failed acceptance to run again` |
| report 거부 | `acceptance failed on this item — the owner runs acceptance again or reopens it on the item page` |
| retry 소유 거부 | `acceptance retry access denied` |
| 기존 거부 | note 예산·stale·사용 불가·format 문구는 기존 값 |
| 레일 | `auto → planning` · `auto → implementing` · `auto → verify` · `auto → accept` · `auto → doc audit` · `auto → scout` · `auto → doc audit #2` |

HINT.accept 후보:

> You run this one — reproduce the five acceptance checks yourself. All pass: write the acceptance section in docs/agents/main-loop/<KEY>.md, commit it, then record it with report_submit({ actor: "main-loop" }). Any fails: record it with acceptance_fail and tell the owner; don't reopen.

MCP acceptance_fail description 후보:

> main-loop: record a failed acceptance at the accept node — the failed checks (1–5, the runbook's five acceptance checks) and a note of 150 characters or fewer; a committed write-up's path and commit are optional, together. The item then waits for the owner, who runs acceptance again or reopens it on the item page. Don't run the checks again until pipeline_next answers accept.

pipeline_next 설명은 gate or owner wait(acceptance 포함)를 반영하되 scope·slots·runbook·cap 설명을 보존한다.

## Affected Files

그룹 행의 모든 파일이 범위다. 일반 파일은 update, 신규는 create로 표시했다.
“관련 테스트” 같은 미확장 영역을 추가 작업 근거로 쓰지 않는다.

| 정확한 경로 | 작업 / 판단 근거 |
| --- | --- |
| `prisma/schema.prisma` | 모델·관계 |
| `prisma/migrations/20261003000000_acceptance_failure/migration.sql` | create; additive SQL |
| `src/server/pipeline/board-rules.ts`, `src/server/pipeline/board-query.ts`, `src/server/pipeline/board.ts` | 판정·원자적 서비스·export |
| `src/server/pipeline/run-rules.ts`, `src/server/pipeline/run-query.ts` | wait·실패 조회·최신 cap 보존 |
| `src/server/mcp/tools.ts`, `src/server/mcp/deps.ts` | schema·등록·계약·binding |
| `src/fsd/widgets/turn-banner/model/turn.ts`, `src/fsd/widgets/turn-banner/api/turn-data.server.ts` | 차례·읽기 질의 |
| `src/fsd/features/review-gate/api/review-gate.server.ts` | 웹 액션 |
| `src/fsd/features/review-gate/model/inbox-item.ts`, `src/fsd/features/review-gate/model/gate-text.ts` | action type·copy |
| `src/fsd/features/review-gate/ui/acceptance-failure.tsx` | create; 항목 wrapper·실패 leaf·기록 identity·응답 수명 guard |
| `src/fsd/features/review-gate/index.ts`, `src/fsd/features/review-gate/index.server.ts` | public API |
| `src/fsd/pages/board-item/ui/board-item-page.tsx` | Date→view·섹션·slug prop·항목 wrapper key·주석 |
| `src/app/(app)/p/[slug]/items/[key]/page.tsx` | 데이터·slug prop 전달·액션 bind |
| `src/fsd/widgets/history-feed/model/history-row.ts` | 이력 라벨 |
| `src/fsd/entities/pipeline/model/labels.ts`, `src/fsd/entities/pipeline/index.ts` | auto label·export |
| `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` | EdgeSlot 본문 |
| `packages/core/watch.mjs` → `plugin/lib/watch.mjs` | protocol 수용·사본 |
| `plugin/skills/watch/SKILL.md`, `plugin/.claude-plugin/plugin.json` | 지침·판 상승 |
| private `en/CLAUDE.runbook.md`, `en/docs/agents/README.md`, `templates.test.mjs` | 본문·실제 렌더 시험 |
| `docs/architecture/protocol.md`, `docs/architecture/invariants.md`, `docs/architecture/verification.md` | 계약·script |
| `docs/conventions/product-copy.md` | 위 지정 절 |
| `scripts/project-availability-runtime.test.ts`, `scripts/retired-copy.test.mjs` | 모델 수·옛 copy 가드 |
| `src/server/pipeline/board-rules.test.mjs`, `src/server/pipeline/board-query.test.ts`, `src/server/pipeline/run-rules.test.mjs`, `src/server/pipeline/run-query.test.ts` | 판정·IO·순서 |
| `src/server/mcp/tools.test.mjs`, `src/server/mcp/owner-tools.test.mjs` | agent 15개·owner literal 1개 고정 집합·retry 부재·scope·limit·schema·copy-lock |
| `src/fsd/widgets/turn-banner/model/turn.test.ts` | 분류·mixed ready·fixtures |
| `src/fsd/widgets/turn-banner/api/turn-data.test.ts` | create; 최신 회차·cursor·read-only |
| `src/fsd/features/review-gate/ui/acceptance-failure.test.ts` | create; 기존 renderToStaticMarkup 패턴으로 정적 본문·권한·링크 |
| `src/fsd/pages/board-item/ui/board-item-page.test.ts` | 기존 props fixture·섹션·Date·링크 |
| `src/fsd/widgets/history-feed/model/history-row.test.ts` | 라벨·이력 보존 |
| `src/fsd/entities/pipeline/model/labels.test.ts`, `src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs` | aliases·slots·gate/auto |
| `packages/core/watch.test.mjs` | schema·signature·idle·다른 work |
| `tests/server/review-gate-actions.test.ts` | vm 인가·거부·예외·revalidate |
| `tests/server/integration/acceptance-failure.test.ts` | create; 영속·경쟁·회복·window·MCP body |
| `tests/server/integration/migration.test.ts` | catalog·기존 행 보존 |
| `scripts/rehearse-acceptance-failure.ts` | create; 격리 실제 Next·POST·transport loss·브라우저 fixture |

순수 규칙·라벨의 리스크는 낮다. 서비스·MCP는 권한/원자성, DB는 운영 데이터,
플러그인/템플릿은 protocol/body 호환성이 주요 위험이다.
생성 파일은 검증 목적지이며 tracked 변경 목록에 넣지 않는다.

Filesystem preflight: 기존 파일·export와 신규 parent를 확인했다. 예약 migration 디렉터리만 생성 필요다.
신규 UI/test/script는 기준 dev에 없다. target collision이면 덮어쓰지 않는다.
문서 작업 트리에 private checkout/node_modules가 없어 구현 전에 준비해야 한다.
기존 중첩 private 브랜치·fixture는 보존하고 plugin/lib는 sync만 사용한다.
export/import·생성물 존재와 옛 capReason/visible copy 부재를 함께 확인한다.

## Safety Analysis

- pages → widgets → features → entities → shared와 명시 public API를 따른다.
  새 slice/route 없음, service는 src/server, route는 인가·데이터·bind만 담당한다.
- Client wrapper/leaf에 서버 import 없음. UI 숨김은 인가가 아니며 액션과 서비스에서 각각 소유 확인한다.
- 실패 기록 id는 표시·상태 수명의 identity다. 쓰기 인가는 기존 owner·expectedUpdatedAt CAS로 검사하고,
  UI guard의 cleanup은 이미 제출한 DB 쓰기를 취소하는 장치로 쓰지 않는다.
- 새 MCP도 기존 scope/access/request-budget 경로다. main-loop label은 인증 역할이 아니다.
- fail/retry/report/Reopen은 같은 owner/project 잠금이다. event 예외는 rollback,
  확인 유실은 저장 여부 불명으로 처리한다.
- failure는 Report가 아니므로 보고 수·Documents·isAcceptance·상한을 바꾸지 않는다.
- 새 table 조회는 실패가 없어도 실행되므로 migration이 새 서버보다 먼저여야 한다.
- Cascade는 기존 user/project 삭제 계약이다. retry/Reopen에서는 delete하지 않는다.
- 새 listener/timer/queue 없음. VM/stub은 case별 분리, user·연결·Next child·proxy·test hook은 finally 정리한다.

## Approval

사용자의 2026-10-03 지시 “worktree의 해당 문서를 바탕으로 실제 코드를 수정하고, 수정 완료하면 dev에 merge하라”로 카피 후보·구현·검증·dev 대상 PR/병합 및 private PR을 승인했다. 운영 변경은 별도다.
승인 범위는 ①~⑤ 구현·격리 검증·dev 대상 PR/병합·private PR·플러그인 판 상승이다. 운영 실측은 포함하지 않는다.
main 승격, marketplace 갱신, 운영 재시드, 운영 migration 적용은 각각 별도 확인 대상이다.
①의 카피는 구현 지시로 확정했다. 문서 검증 요청과 이후 구현 승인을 구분하며, 운영 변경 승인을 추론하지 않는다.

## Execution Plan

공개 저장소는 최신 dev에서 harness/<topic>, `gh pr create --base dev`.
dev를 PR head로 쓰거나 dev/main에 직접 커밋하지 않는다.
private 저장소는 main에서 분기하고 PR base도 main으로 명시한다.

1. **① 카피 덱**: 승인된 위 카피·거부·MCP hint를 코드에 반영하고 실제 두 배너/실패 섹션을 브라우저로 확인한다.
   copy-lock 본문만 먼저 바꾸지 않고 각 대응 코드 묶음에 문서·코드·시험을 함께 반영한다.
2. **② 레일(독립 PR)**: labels/public API/EdgeSlot·시험·copy §18.
   gate/auto·Propose·first Plan·반복 slot·read-only 렌더/screenshot.
3. **③ 서버/MCP/migration**: 모델·규칙·서비스·응답·binding·DB/권한/경쟁 시험·model count·protocol/invariants·protocol 상한 설명 정합화·copy §12/§13.
   agent 15개와 owner `["gate_approve"]`를 독립 고정 기대값으로 검증한다. owner 등록 모듈은 보존한다.
   db:generate가 check보다 먼저다. 운영 배포는 묶음 직후 하지 않고 아래 통합 순서다.
4. **④ 웹**: banner query/model·action/UI/exports·page/route·실패 기록 identity와 항목 wrapper의 응답 guard·정상 성공 안내·History·기존 fixtures·copy §3/§5/§11·retired-copy.
   운영 레거시 count 조건 확인. 같은 .next에서 dev/build를 동시에 실행하지 않는다.
   build가 dev 프로세스를 임의로 종료한다고 가정하지 않는다.
5. **⑤ plugin/runbook/실측**: watch/sync/skill/version·private 두 본문과 시험·cap 안내 정합화·copy §14/§15·격리 재현 script/verification.md.
   DB→HTTP→사용자 생성 런북 본문까지 확인한다.

통합 롤아웃(외부 쓰기마다 승인 범위 확인):

1. ⑤의 **watch 호환성 부분**을 먼저 별도 릴리스한다. 새 watch는 옛 서버와 호환된다.
   관측 대상 session의 marketplace/installed harness를 갱신하고 실제 판·watch 본문을 확인한다.
2. 승인된 운영 DB에 additive migration을 한 번 적용하고 catalog/status를 확인한다.
3. 카피·레거시 조건 충족 뒤 ③④ 서버/웹을 배포한다.
   새 hint로도 실패 기록이 가능하므로 관측 watch는 이 전에 갱신돼야 한다.
4. private PR의 검증된 exact merge SHA에서 전체 en bundle을 archive해 재시드한다.
   cap 설명이 현재 reason/resetAt 계약과 맞지 않거나 옛 30일 dispatch 문구가 남으면 재시드하지 않는다.
5. 실제 /api/templates body와 /harness:init 생성물을 비교한다.
   skip(modified)는 보존/개별 조정, CLAUDE.md 관리 marker는 별도로 확인한다.
   POST /api/runbook 판과 overview stale도 대조한다.
6. commit:yes 실제 권한을 확인하고 운영 저장소의 실패→웹 retry→성공을 관측한다.
   원인 수정은 retry 클릭 전에 완료한다.

PowerShell 바이너리 pipeline을 쓰지 않는 archive 명령:

~~~powershell
# templateMergeSha: 검증된 private merge SHA.
# templateStage: 새 빈 임시 디렉터리; templateArchive: 그 안의 bundle.tar. 충돌이면 중단.
git -C plugin/templates archive --format=tar --output $templateArchive $templateMergeSha en
tar -xf $templateArchive -C $templateStage
npm.cmd run seed:templates -- --dir $templateStage
~~~

변수는 실행 때 정확한 값으로 확정해 기록한다. 개별 두 파일만 seed하지 않는다.
seed는 전체 transaction이 아닌 Template upsert다. 중간 실패는 부분 반영 가능성이 있으므로
같은 검증 bundle을 다시 seed하고 body를 비교한다. HTTP 200·폴더·도구 이름만으로 완료를 판단하지 않는다.

## Verification Plan

### 명령·환경

dependency/private checkout을 준비한 대상 작업 트리에서 **구현 후** 실행한다.
Windows에서는 npm.cmd/npx.cmd를 사용한다.

~~~powershell
npm.cmd run db:generate
npm.cmd run db:validate
npm.cmd run verify:fsd
npm.cmd run test:architecture
npm.cmd run check
npm.cmd test
npm.cmd run test:web
npm.cmd run test:server
npm.cmd run test:server:integration
npm.cmd run test:templates
npm.cmd run build
~~~

check는 plugin-lib check → lint(FSD 포함) → next typegen → tsc → architecture → project-availability다.
generate는 연결하지 않지만 prisma.config.ts 로딩용 비밀 없는 DATABASE_URL은 필요하다.
통합 명령은 test-server-integration.mjs가 stagekeeper_test_*·운영과 host/port/database 분리를 검사하고
그 DB에만 migrate deploy한다. 환경 없으면 Not run, skip을 pass로 세지 않는다.
private 시험은 exact checkout SHA·서버 HEAD를 함께 기록한다. 공개 CI에는 templates가 없으므로 로컬 결과가 별도로 필요하다.
실패는 동일 최신 baseline 9675a3e의 격리 작업 트리/동등한 환경에서 비교한다.
옛 0aec9ab이나 stale origin/dev를 신규 실패 판정 기준으로 쓰지 않는다.

### 검증 목적지 행렬

| ID / 시험 목적지 | 필수 범위 |
| --- | --- |
| V1 board-rules.test.mjs | rs에 acceptanceFailed:false. checks empty/range/duplicate/fraction; note empty/blank/150/151; pair absent/one/blank/both; 상태/accepted/gate/null/중복 실패·retry 거부. false의 기존 결과·non-main-loop 보고·verify 조건 보존 |
| V2 board-query.test.ts + DB 통합 | 두 service·report guard·Reopen. format:null/slots-v1 성공, unknown format·slots-v1 entry 없음 거부/rollback. updatedAt 단조 증가, actor/channel/event·clearedAt, 기존 status/results/validation/backlog/run/entry 불변 |
| V3 integration/acceptance-failure.test.ts | fail→retry→**성공 report**→acceptedAt·인수 Report·커서 전진. 두 Reopen 독립 fixture, 백로그/run/validation 복원, failure 원문/행 보존 |
| V4 같은 DB 시험 | 두 연결 fail/fail 1행·1event, retry/retry 한 성공, fail/report·retry/Reopen 양 순서. stale/타인/폐기/다른 회차·project, event 주입 실패의 전체 rollback. support.connections/checkpoint/failingEvent와 finally cleanup |
| V5 run-rules/run-query 시험 + createToolDeps DB | 실제 single/overview wait body, gate 우선·닫힘·failure 없음·retry 후 accept. unknown format/entry 없음 거부 유지. cap code/resetAt·resumable/handoff/head 불변. protocol 제품 사용량·저장과 상한 절 모두 현재 5시간 계약과 일치. failure query는 accept만 |
| V6 mcp/tools.test.mjs + mcp/owner-tools.test.mjs | acceptance_fail 포함 agent 등록 literal exact set 15개·protocol 세 수 참조 일치, locked ARGS, hu_ project/타인·hs_/무인증·사용 불가·RATE_LIMITED/retryAfterSec·schema/service 거부·deps args·body. WEB_ONLY에 retry 이름을 보강해 agent 도구 부재 검사. owner 실제 등록과 OWNER_TOOL_NAMES를 각각 literal ["gate_approve"]와 비교해 retry를 포함한 추가 도구를 금지한다. 구현 상수를 기대값으로만 재사용하지 않는다 |
| V7 turn.test.ts + 새 turn-data.test.ts | helper false; 정상 theirs+줄, failure mine+no 줄+item link, gate/failure/ready 혼합·Inbox 우선. failure+handoff에도 no 줄. latest row/cursor/since 무관·read-only query |
| V8 review-gate-actions.test.ts | case별 새 vm stub. success만 세 path; 날짜/권한 실패 service 0회, stale revalidate 0회. precommit/commit-unknown/revalidate 예외 전파·advice 0회 |
| V9 새 failure UI 시험 + board-item-page.test.ts + 실제 browser | 기존 item:null·slug/retry prop·실패 id fixture, Documents→failure→Reopen→History, UTC·escaped note·선택적 commit link/DOC_LINK_NOTE. read-only/pending/거부/throw/유실/refresh·대기 표현 toast. 두 탭에서 A 해제→같은 key의 B 생성→첫 탭 refresh(해제 화면 없이 직접 A→B), 같은 UTC 분이어도 B 초기화. A 응답 지연 뒤 B/다른 항목 toast·안내·refresh 0회, B가 다시 해제되어도 A 응답 부활 없음. 정상 retry는 같은 응답의 RSC가 A를 먼저 지워도 성공 toast 1회. 같은 항목 refresh 때 wrapper 유지·다른 프로젝트의 같은 key는 분리. leaf와 wrapper 수명 구분·wrapper guard cleanup·항목 이동/unmount/재진입 |
| V10 history-row.test.ts + 실제 History Events key/all | 두 same-status 라벨·cleared 뒤 보존·report 중복/창/cursor/tie-break/과거 회차 링크 불변. eventWhere 수정 없음 |
| V11 labels.test.ts/rail.test.mjs | 모든 NODE_KINDS·aliases·canonical #2. propose null·first Plan planning·implement implementing, gate면 auto 없음, Free/read-only·메뉴 동작 보존 |
| V12 watch.test.mjs/실제 plugin/lib | 정상 wait는 work 없음, wrong node/empty·151 note/duplicate/range 거부, busy 계속 거부. failure만 idle/reset, 다른 work/head 유지, retry 뒤 work·sync 바이트 동일 |
| V13 migration.test.ts/model count | 별도 case에서 신규 이전의 전체 migration → populated rows snapshot → 신규 SQL 한 파일 적용 → snapshot 동일. 기존 RDC·token migration case 보존. columns/defaults/PK/index/FK·cascade·null clear, 생성 delegate/관계·20 models·membership 부재 |
| V14 private templates.test.mjs + 배포 본문 | 실제 render에 새 wait/tool/project/5조건·commit:no·권한·report-file 예외·재검증 금지. cap의 server reason/resetAt·기존 run 재개 안내 존재, 옛 30일 dispatch 안내 부재·History 창 보존. 새 변수 없음, scope regex/false fixture. exact LF body·runbook hash |
| V15 새 Next 재현 script | owner valid POST 대조군과 동일 action/body의 타인·무세션·사용 불가·잘못된 날짜·stale 거부, DB commit 뒤 응답 유실·fresh GET 복구·중복 event 없음 |
| V16 운영 기록 | 레거시 read-only count 0, 실제 설치 plugin 판, migration 선행, 서버/웹·Template·HTTP·사용자 marker body·stale·watch 실측. 미충족이면 운영 완료 금지 |

done만 지정한 기존 fixture는 backlog.removedAt을 채우지 않는다.
정상 done 시험은 removedAt/removedReason:"done"도 준비한다.
ensureRun의 첫 version 1은 반환된 fixture 값과 대조한다.
nextFor만 부른 시험은 overview의 지연 전진·walkingKeys 검증을 대신하지 않는다.
권한 검증은 plain service 호출이 아닌 valid 실제 Server Action POST도 사용한다.
render double과 실제 HTTP/browser 증거를 구분한다. 새 정적 UI 시험은 기존 React server renderer를 사용하고
pending·클릭·throw·transport loss·refresh는 실제 browser에서 재현 script fixture로 확인한다.
새 browser test 라이브러리를 요구하지 않는다. --interactive 기록에는 각 상태의 화면·DB 결과를 남긴다.
같은 key의 A→B 교체 fixture는 두 소유자 탭과 지연 응답으로 준비한다. B의 id를 화면 모델과 DB에서
대조하고, 첫 탭이 A의 해제 상태를 보지 않은 채 refresh했는지 기록한다. 이전 A 응답의 toast·안내·refresh가
실행되지 않는지 관측한다. pending 표시가 바뀌었다는 사실만으로 guard를 검증했다고 하지 않는다.
같은 항목에서 B를 본 뒤 B도 해제한 경우의 늦은 A 응답도 확인한다. 정상 성공 fixture는 action 결과와
RSC가 함께 도착해 A leaf가 먼저 사라지는 경우이며, 항목 wrapper가 유지되고 성공 toast가 한 번 나와야 한다.

`scripts/rehearse-acceptance-failure.ts`는 기존 repository-disconnection/src-clean-code 재현 패턴을 따른다.
TEST_DATABASE_URL을 재검증하고 child DATABASE_URL만 격리 URL로 설정하여 fresh production build를 띄운다.
Windows background child는 숨김 창, auth fixture·failure/retry/transport-loss 관측,
--interactive의 finish/종료 입력, 자기 user/연결/Next/proxy/timer만 finally cleanup을 제공한다.
운영 watch 실측을 fixture 결과로 대신하지 않는다.

~~~powershell
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-acceptance-failure.ts --transport-loss --templates
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-acceptance-failure.ts --interactive
~~~

### 최종 산출물 map·검색 결과 계약

| 노출 산출물 | winning source / 의존 | 검증 |
| --- | --- | --- |
| failure DB·원장·clearedAt | schema→additive SQL→transactional service | catalog·실제 rows·snapshot·race/rollback |
| MCP body | agent tools schema/scope/guard→createToolDeps→board/run→failureBody; owner 등록은 gate_approve 하나로 보존 | agent 15개·owner literal 1개 독립 고정 집합·retry 부재·callback/schema·single/overview JSON·ISO at |
| 상세/배너/History | 인가 route/queries→server page→항목 wrapper/실패 id 기반 leaf/history | HTML/RSC/body·links/buttons·Action POST·fresh 탭·동일 key A→B 교체·늦은 응답 억제·정상 성공 toast 1회 |
| 레일 | entity public label→EdgeSlot | static render·editable/read-only screenshot |
| 설치 watch | core→sync→plugin/lib→versioned installed bundle | 바이트·실제 판/본문·idle/work |
| 사용자 런북 | private exact SHA→LF seed rows→deliverable→render/init→CLAUDE.md marker | Template body·HTTP body·generated managed block의 acceptance/cap 설명·hash/stale |

게시된 DB가 본문의 직접 출처다. private 파일·plugin 판만 변경하면 배포된 본문은 바뀌지 않는다.
런북/docs는 전체 파일, agents는 기존 stub/plan-filter 규칙이다.
새 asset/font/env flag는 없고 기존 template vars·harness.json scope·init manifest를 보존한다.

~~~powershell
rg -n 'acceptance_fail|acceptanceFailure|acceptanceFailed|retryAcceptance|autoEdgeLabel' src packages/core plugin/lib plugin/skills tests scripts docs/architecture docs/conventions/product-copy.md
rg -n 'capReason|recentRuns|DISPATCH_WINDOW_DAYS' src/server/pipeline/run-query.ts src/server/pipeline/run-rules.ts
rg -n 'needs acceptance|items need acceptance' src/fsd/widgets/turn-banner/model/turn.ts
rg -n 'rolling 30일|dispatches for the last 30 days' docs/architecture/protocol.md plugin/templates/en/CLAUDE.runbook.md
~~~

첫 검색은 증거 찾기 보조, symbols 허용 목적지는 Affected Files/public API 표다.
두 번째 이후 검색은 결과 없음이 기대값(다른 subsystem·archive는 제외)이다.
마지막 검색은 cap의 옛 안내만 금지하며 History의 30일 창까지 금지하지 않는다.
structured package/plugin JSON·Prisma generated model·MCP schema는 parser/실제 API로 검사한다.
검색만으로 V1~V16의 실제 목적지 검증을 대체하지 않는다.

## Verification Results

구현 시작 기준은 dev@9675a3efdaf12bb7c419d11c4164beaa55c89821이다. 2026-10-03 구현 후 실제 실행 결과다.
운영 완료와 로컬 구현 검증을 구분하며, skip이나 미실행은 Pass로 세지 않았다.

| 검증 | 결과 | 증거 목적지 |
| --- | --- | --- |
| db:generate/db:validate | Pass | 20개 모델 생성·schema valid, additive migration |
| verify:fsd/test:architecture/check | Pass | plugin/lib 동기화·FSD·lint(기존 fixture warning 1개)·route typegen·tsc·architecture·availability |
| npm test/test:web | Pass: 265 / 543 | core/watch·웹·copy-lock·MCP 고정 집합 |
| test:server | fresh build 뒤 manifest opt-in: Pass 35, Skip 0 | 최초 34 Pass/1 Skip 뒤 SRC_CHECK_INBOX_MANIFEST=true로 실제 manifest까지 실행했다 |
| test:server:integration | Pass: 84, Skip 0 | 전용 PostgreSQL18 test DB; 24개 migration·전체 integration·상태 거부·경합/rollback·schema replay |
| test:templates | Pass: 31 | private@55f2d7dcfd1803662f25d3df0e3000cfcf2f7461, public 구현 작업 트리; scope/false fixture·LF hash |
| build | Pass, exit 0 | Prisma generate·Next compile/types·page generation·최종 routes |
| 실제 Next HTTP | Pass | 유효 owner 대조·인증/날짜/stale/read-only·저장 뒤 응답 유실·fresh GET·중복 쓰기 없음 |
| 브라우저 | Pass | 실제 React failure A→B/A→B→null/이동/자신의 A→null/같은 A 갱신 token·늦은 응답 억제·정상 success 1회·unknown 안내/refresh. 실제 Next retry 및 저장 뒤 해석 불가능한 응답 검증 |
| V14 격리 최종 본문 | Pass | private 전체 LF source → test Template → 실제 인증 HTTP deliverable → 실제 init의 CLAUDE.md marker/보고 규약/hash·POST 판·stale 판정; 고유 test 언어/사용자 정리 |
| V16 운영 count/배포/설치/watch 실측 | Not run | 운영 DB/marketplace/main 변경 권한을 추론하지 않는다. 운영 단계 진입 조건은 유지 |

로그·screenshots는 Temp에 보존했다. 실제 브라우저 fixture는 별도 headless 프로필로 실행했고 Next/proxy/user 연결은 finally에서 정리했다.
합성 React 응답 fixture와 실제 Next 저장/응답 유실 검증을 구분한다. 실제 운영 watch가 무입력으로 한 바퀴 도는 관측은 실행하지 않았다.
재현 스크립트의 `--templates`는 운영 en을 바꾸지 않고 고유 test 언어만 만들며, init 생성 파일은 고유 Temp 디렉터리에 보존한다.

## Risks and Rollback

- **구버전 watch**: 새 hint/런북이 실패를 기록하면 protocol-error로 멈출 수 있다.
  호환 watch 선배포·관측 대상 갱신으로 닫는다. 모든 외부 설치의 갱신을 보장하지 않는다.
  compatible plugin/server update 후 restart가 회복 경로다. template 변수를 차단 장치로 추가하지 않는다.
- **늦은 failure**: attempt/entry 결합이 없어 retry 뒤 새 실패가 가능하다. fresh 조회 뒤 소유자가 retry/Reopen한다.
- **응답 유실**: 자동 재제출하지 않고 fresh board_get/pipeline_next로 저장 여부를 확인한다.
- **레거시**: count 양수/미확인이면 새 배너 배포 중단·기존 유지·처리 별도 결정.
- **공유 DB**: 로컬/운영 URL 동일성은 외부 환경이다. 공유 가능성을 고려해 개발 migration은 격리만,
  운영 적용은 승인된 대상에 한 번 한다.
- **재시도 시점**: 원인 수정 전 clear하면 다음 폴링이 다시 실패할 수 있으므로 수정 후 클릭한다.
- **부분 seed/수정 생성물**: exact bundle 재게시·body 비교, skip(modified) 보존·개별 조정.
- **배너 의미 변경**: Agents are working 아래라도 상세는 waiting이다. WATCH_LINE/터미널 줄·성공 증거 보존.

롤백:
1. 레일은 독립 revert 가능. 웹/서버/본문은 함께 호환성을 검토한다.
2. 옛 서버로 되돌려도 table/failure 행은 남긴다. DROP/delete하지 않는다.
   옛 서버는 열린 failure를 무시하고 accept를 답할 수 있다.
3. 이전 exact template merge SHA의 전체 bundle을 재시드하고 HTTP body/사용자 marker를 확인한다.
4. retry/Reopen 처리를 먼저 뺀 기간에는 retained failure가 clear되지 않을 수 있다.
   새 서버 복귀 전 board/run/failure를 read-only 대조하고 이미 accepted된 항목을 자동 retry시키지 않는다.
   정리가 필요하면 별도 처리 결정을 받는다.
5. plugin 롤백은 더 높은 patch 판(0.4.2 이후면 0.4.3 이상)이다.
   새 서버보다 watch 호환성을 먼저 하향하지 않는다.
6. 런북만 rollback해도 새 HINT.accept가 있으면 failure 도구를 쓸 수 있다.
   런북만 되돌렸다는 사실을 실패 경로 제거의 증거로 사용하지 않는다.

## Completion or Closure Notes

코드 구현·로컬 검증은 완료했고 PR #102·#103은 2026-10-03 dev에 병합됐다.
2026-10-04 사용자 지시로 코드 구현 완료를 기준으로 completed 처리했다.
운영 후속 작업의 완료 조건은 유지하며, V16 미실행을 Pass로 바꾸지 않는다.

완료 기록:
- completed-at: 2026-10-04
- verification-summary: 위 구현 검증 결과 참조. 2026-10-04 현재 dev에서 관련 회귀 테스트 192개, 웹 액션 테스트 및 plugin/lib 동기화 검사를 재확인했다. 운영 V16은 미실행이다.
- implementation PR/commit: 본 구현 PR [#103](https://github.com/Sangeok/stagekeeper/pull/103)은 check green 후 dev에 병합(a6ea199), 독립 rail PR [#102](https://github.com/Sangeok/stagekeeper/pull/102)도 dev에 병합(9e31f75). Companion private PR [#7](https://github.com/Sangeok/harness-templates/pull/7)은 2026-10-04 확인 시 OPEN이며, private head는 55f2d7dcfd1803662f25d3df0e3000cfcf2f7461이다.
- changed files summary: 실패 모델/서비스/MCP·재시도 action/UI·차례/이력·watch 0.4.2·private 런북·migration/경합/실제 Next·브라우저 시험. 도구 registry fixture(project-connection)와 plugin version fixture(token-reveal)도 새 계약에 맞췄다
- remaining follow-up: private PR #7 병합, main 승격, 승인된 대상의 레거시 count, 호환 plugin 선배포·설치 갱신, migration 선행, 서버/웹 배포, 검증된 private merge SHA의 운영 seed/생성물 비교, 운영 watch 실측

닫힘 기록:
실행하지 않기로 닫은 문서가 아니므로 해당 없음. closed metadata는 null이다.

## Review Checklist

- [x] completed·사용자 구현 승인과 운영 후속 작업의 승인 범위가 현재 권한과 일치한다.
- [x] 최신 dev/문서 작업 트리 차이·private 원문/fixture 차이를 기록했다.
- [x] requirements·symbol provenance·create preflight·검증 목적지가 구체적이다.
- [x] cap/request limit/토큰·게이트·Reopen·이력 창·커밋 정책의 보존을 전파했다.
- [x] retry의 agent·owner MCP 부재와 owner 등록 보존을 독립 고정 집합·정확한 시험 목적지로 검증한다.
- [x] private cap 본문의 현재 불일치와 정합화·새 도구 수·배포 본문 검증을 반영했다.
- [x] 경쟁·rollback·실패/응답 유실·cleanup 검증 경로가 있다.
- [x] 같은 key의 실패 기록 교체·Client state 초기화·늦은 응답 억제·정상 성공 안내의 검증 경로를 정의했다.
- [x] generated client·Template/HTTP/사용자 body까지 산출물 목적지를 정의했다.
- [x] 설계의 미결 placeholder는 없다. 완료일을 기록했고 closed metadata는 null이다.
- [x] 구현 후 명령·격리 DB·실제 Next/browser·private render/HTTP/init 본문 결과를 기록했다.
- [ ] 운영 후속 작업: 운영 진입 조건·배포 본문·watch 한 바퀴를 검증했다.
- [x] 코드 구현 완료를 기준으로 status·stage·completed-at·검증 요약·완료 기록을 갱신하고 completed로 이동했다. closed metadata는 null을 유지한다.

## Open Questions

구현 설계를 나중에 정하도록 남긴 질문은 없다.
카피/구현은 승인되고 로컬 검증·dev 병합을 마쳐 completed 처리했다.
Private 런북 PR 병합과 운영 레거시 count·외부 운영 변경·watch 실측은 후속 작업이며,
운영 레거시 count·외부 운영 변경 승인은 명시적 단계 진입 조건으로 유지한다.
조건이 실패하면 그 단계가 중단된다. 문서 정합성 검증으로 승인·실측을 대신하지 않는다.
