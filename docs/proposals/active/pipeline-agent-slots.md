---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-09-16"
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
  - "docs/proposals/completed/2026-09-10-configurable-pipeline.md"
  - "docs/proposals/completed/2026-09-07-human-checkpoint-consistency.md"
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/protocol.md"
  - "docs/conventions/product-copy.md"
---

# 에이전트 슬롯 파이프라인 — 구간과 자유 슬롯의 실행 기반

## Summary

파이프라인을 고정 역할 노드의 부분열에서 **필수 앵커 + 구간 안의 자유 슬롯**으로 확장한다.
장기 목표는 사용자가 `harness.json`으로 에이전트의 이름·역할·범위·판단 기준을 선언하고,
서버가 역할별 절차를 배달하는 것이다. 절차 본문은 계속 서버가 소유한다.

원래 Execution Plan의 단계 경계를 유지한다. **이 문서의 구현 대상(Core)은 1단계의
그래프·실행 기반이다.** 사용자 정의 review 역할과 Workspace/MCP 설정 확장은 2단계다.
2단계는 §G–§I의 설계 방향을 별도 제안서로 구체화·승인·재검증한 뒤 구현한다.
이번 문서의 구현 준비 판정이 2단계까지 증명한다고 해석하지 않는다.

1단계에서는 기존 doc-auditor·feature-scout를 구간 사이에 추가·이동·삭제·반복 배치한다.
plan·implement·accept는 필수 실행 앵커로 남는다. **계획 제출이 in_review로 전이하는
현재 동작을 보존한다.** 구현 성공 보고 뒤에도 남은 구현 구간 슬롯을 실행하고,
구간 끝에서 서버가 actor pipeline으로 done을 기록한다. 인수는 여전히 별도의 증거다.

기존 PipelineVersion.nodes/gates의 값은 수정하지 않는다. 슬롯의 반복 실행·재개·경합을
구별할 식별자는 additive migration으로 추가한다. **backfill 없음은 스키마 변경 없음이나
구버전 코드로 즉시 롤백 가능하다는 뜻이 아니다.**

## Goal

- Core: 기존 프로젝트 단위 에이전트를 앵커 전후에 배치하고 간선의 사람 게이트를 편집한다.
- Core: 성공 구현 보고와 보류 보고를 구별하며 구현 구간 전체가 끝난 뒤에만 done을 찍는다.
- Core: 같은 에이전트의 반복 슬롯·다른 항목·reopen 이전 실행이 완료 증거를 재사용하지 않는다.
- Core: 기존 그래프 행의 backfill 없이 읽기·재개가 가능하고 항목의 버전 고정을 보존한다.
- Phase 2: 원하는 에이전트를 직접 늘린다. 이름·범위·판단 기준은 사용자, 단계 본문은 서버가 소유한다.

## Proposal Size

proposal-size: standard는 저장소의 문서 크기 분류다. reconciliation은 **High-Risk**로 수행한다.
상태 전이, 감사 원장, migration, private 템플릿 배포, 되돌리기 어려운 그래프 행이 영향받는다.
문서 크기와 검증 위험도를 같은 분류로 취급하지 않는다.

## Current State

2026-09-16 기준 dev HEAD `c5c15f6563722876899d8fa836ce3292a6318a45`에서 확인했다.
완료 제안서 둘은 결정 배경이다. 과거 코드 스니펫·명령을 재실행할 구현 입력으로 상속하지
않는다. 현재 구조·도구 계약·보존 규칙의 기준은 docs/architecture와 현재 코드다.

| 표면 | 현재 사실과 근거 |
| --- | --- |
| 그래프 | packages/core/pipeline.mjs: NODE_KINDS 7종, 필수 plan/implement/accept, accept 앞 골격 부분열·뒤 꼬리 2종. dispatcherFor도 같은 파일 |
| 편집 | edit-pipeline의 rail-state.ts·pipeline-rail.tsx: 선택 노드 복원·제거, 게이트 토글, 꼬리 Swap |
| 구간 | board.ts:submitPlan은 planning에서 제출하면 같은 transaction에서 in_review로 전이. planning과 in_review를 합치면 안 됨 |
| done | transitions.mjs: agent의 implementing → done에 requiresResult·requiresReport. transitionIn은 백로그 제거와 keyed AgentRun 종료를 함께 처리 |
| 보고 벽 | board-rules.ts:decideReportSubmit은 in_review/implementing/done만 허용. implementing은 역할·이름과 무관하게 verify 시도 원장을 요구하고 outcome은 묻지 않음 |
| 실패 보고 | private dev.md:hold도 report_submit을 먼저 시도한 뒤 on_hold 전이. Report 존재만으로 성공을 판정하면 보류 보고가 done을 만들어 버림 |
| 프로젝트 완료 | run.ts:readFacts는 doc-auditor/feature-scout의 key:null, openedAt >= enteredAt, closedAt != null만 읽음 |
| key·역할 | next.ts:needsKey는 상태 또는 verify-ok requirement로 key 필요 여부 추론. roster 전부에 dev.md를 배달하고 다른 dev 소유 항목을 거부. Facts.check에 item 분기 없음 |
| 템플릿 조건 | pm의 start/report, plan-verifier의 start/report에는 상태 requirement가 없음. 검증자의 read/verify만 in_review. 템플릿 전체의 key 필요 여부와 단계별 진입 조건은 다름 |
| config·DB | config.mjs는 path·비어 있지 않은 verify 필수. Workspace.path는 DB에서도 non-null이고 role/criteria/scope 열이 없음 |
| sync | project-sync-query.ts는 upsert만 수행. 입력에서 빠진 Workspace를 삭제·비활성화하지 않음 |
| 배달·생성 | deliver.mjs:agentOf는 agents/<name>.md만 인식. 하위 역할 경로는 스텁 절단 우회. harness-init.mjs도 workspace 전부를 agents/dev.md로 렌더 |
| 버전 | loadCurrentVersionView는 GET 무쓰기. ensureCurrentVersion/ensureRun은 쓰기 경로에서 물질화. 항목은 versionId에 고정 |
| 상한 | entitlement.mjs: Free 편집 불가. workspaces 1/10/무제한, dispatches 60/600/무제한. 30일 rolling의 소유자 전체 AgentRun 개설 수. 고정 에이전트 플랜 제한도 별도 적용 |
| 상한 경합·재개 | next.ts의 recentRuns 확인과 runs.ts의 createRun은 별도 호출. 같은 소유자의 동시 개설이 마지막 1자리를 함께 사용할 수 있음. run.ts:nextFor/headFor는 열린 item/PM run이 있어도 capReason으로 개요의 재개를 막음 |
| 단계·게이트 식별 | next.ts의 outcome 입력에는 수행한 step이 없어 뒤늦은 응답을 서버의 현재 step에 기록함. readFacts는 enteredAt 이후 gate note/사람 경계 전이를 승인으로 읽고, owner-deps는 호출 직전 updatedAt을 새로 읽음. 새 entry의 단계/게이트 보호 계약이 필요 |
| 실행 안내 | run-rules.ts:HINT는 legacy id로 조회하고 implement가 직접 done으로 옮긴다고 안내. 레일의 게이트 0개 경고도 인수까지 사람이 불필요하다고 읽힐 수 있음 |

## Scope

| 분류 | 실행 범위 |
| --- | --- |
| Core | §A–§F, Affected Files의 Core 목록, 1단계 실행 계획, V1–V9, Definition of Done |
| Phase 2 | §G–§I의 사용자 정의 역할·criteria/scope·requires:item·역할별 템플릿·Workspace 확장. 이 문서로 구현하지 않음 |
| Approval-after | 구현 PR·private 템플릿·격리 DB 검증 준비 후 승인된 운영 배포·재시드. 이번 요청은 문서 검증·개선이며 구현·배포 승인 아님 |
| Out of scope | 자유 DAG·병렬/조건 분기, 새 보드 상태, 사용자 작성 step 본문 업로드, 쓰기 역할 대본 신설, 열린 항목 versionId 교체, 결제·플랜 숫자 변경, Command/release 경로 |

보존 대상은 상태 6종, 필수 인수, 사람 전용 게이트, 기존 plan/validation/verify 벽,
되돌리기·보류·폐기 출구, 감사 행 보존, selected-out 쓰기 차단, 상한, Phase 4 스텁 배달이다.
acceptedAt과 백로그 removedAt의 의미도 보존한다. Phase 2 구분은 원래 실행 계획의 경계를
명확히 한 것이며 장기 목표를 폐기한 것이 아니다.

## Proposal

### A. 실제 상태와 실행 앵커

```text
propose? → proposed 슬롯… → before-plan? → plan(planning)
  → plan_submit → in_review 슬롯…/verify? → before-implement?
  → implement(implementing) → implementing 슬롯… → [서버 done]
  → before-accept? → accept → done 슬롯… → 파이프라인 종료
```

- propose가 있으면 맨 앞에서 1번만 존재한다. pm은 key 없이 새 항목을 제안하고,
  이미 생성된 항목의 propose는 현재처럼 완료다. pm을 일반 반복 슬롯으로 만들지 않는다.
- plan·implement·accept는 각 1번, 상대 순서 고정이다. 앵커 제거·복제와 상태 기계 우회 배치는 거부한다.
- verify는 선택 앵커이며 1번만, plan 뒤·implement 앞이다. 임의 review 슬롯이 아니다.
  완료는 계속 validation_record이며 임의 Report로 대체하지 않는다.
- 자유 슬롯은 기존 프로젝트 에이전트 둘이다. planning 중간은 Core에서 표현하지 않는다.
  plan 앵커가 계획 제출·상태 전이를 함께 수행하기 때문이다.
- implement 앞은 in_review → implementing 경계다. implement 뒤 슬롯은 implementing에서 돈다.
  구간 마지막 슬롯 완료 후, **before-accept를 기다리기 전에** 서버가 done을 찍는다.
  before-accept는 기존대로 done의 same-status 사람 게이트다. 꺼도 accept는 필수다.

### B. 슬롯 id와 검증

기존 id 7종을 보존한다. 자유 슬롯 id는 doc-auditor 또는 feature-scout, 반복은 #2, #3, …
접미를 쓴다. 첫 배치는 접미가 없다. 기존 doc-audit·scout는 각 에이전트의 legacy 별칭이다.
에이전트 이름과 배치 id를 구별한다. 다음은 신규 그래프 예시다.

```json
{
  "nodes": ["propose", "doc-auditor", "plan", "verify", "implement", "doc-auditor#2", "accept"],
  "gates": ["before-plan", "before-implement", "before-doc-auditor#2"]
}
```

validateGraph(graph, plan)의 Core 계약:

1. graph는 nodes/gates 배열이 있는 객체, 모든 원소는 문자열. 슬롯·게이트 id는 각각 유일하다.
2. §A의 앵커 조건을 지킨다. unknown agent, #1, 0·음수·비정수 접미, 앵커 접미, before-로
   시작하는 슬롯, 빈 id는 거부한다. legacy 별칭은 접미 없이만 허용한다.
3. 같은 에이전트의 legacy 별칭과 신규 id를 섞은 그래프는 거부한다. 편집 시 별칭을 신규 id로
   정규화하면 연결 게이트도 함께 바꾼다. 기존 저장 행 자체는 수정하지 않는다.
4. nodeAllowed는 배치 id를 해석한 실제 에이전트에 고정 플랜 제한을 적용한다.
   접미로 제한을 우회할 수 없다. roster/role 자유 슬롯은 Core에서 거부한다.
5. 게이트는 존재하는 슬롯 앞에 1개, before-propose는 불가. propose 없는 첫 슬롯의 게이트는
   허용한다. 경계 두 곳의 게이트만 제거 시 자동 상태 전이를 연다.
6. defaultGraph의 nodes/gates와 scout opt-in은 그대로다. 일반 꼬리 제한만 없애며 앵커 제약은 유지한다.

공통 해석기 slotAgent(슬롯→실제 에이전트)는 pipeline.mjs에 둔다. dispatcherFor, gateKind,
boundaryOf, sequence, nextAfter, cursorForStatus, nodeDone, advance가 같은 해석을 쓴다.
웹·서버에 접미 제거 정규식이나 역할 매핑을 복제하지 않는다.

### C. 성공 증거와 done

상태 기계에 다음 규칙을 더하고 agent의 implementing → done 규칙을 제거한다.
다음은 새 전이표 행의 계약이며, 구간 완료 검사는 전이 허용표와 별도로 수행한다.

```js
{ from: "implementing", to: "done", actor: "pipeline", kind: "auto",
  requiresResult: true, requiresReport: true }
```

transitionIn의 pipeline done 경로도 고정 그래프·현재 실행 회차·구간 완료 증거를 확인한다.
reportCount>0이나 임의 pipeline Caller만으로 종료할 수 없다. actorId는 pipeline:<versionId>,
channel은 null. 서버 result는 "Implementation span completed."(150자 이하)를 누적한다.
종료 guard는 잠긴 현재 cursor/entry에서 사실을 다시 읽어 advance가 구현 구간 종료를
반환하는지 재판정한다. 신규 커서의 앞부분은 entry별 증거를 통과해 원자적으로 저장된 완료
prefix다. implement 이전/진행 중에는 done을 반환하지 않고, 구현 구간 마지막 실행 슬롯을
통과한 뒤 accept 앞 경계에서만 반환한다. 외부 입력이나 과거 Report 목록으로 prefix를 만들지 않는다.

**성공 구현 완료 = 현재 배치에 결합된 dev Report + 같은 AgentRun의 verify/ok + 정상 report
단계 종료(ok).** 보고만 제출하거나 verify가 failed/blocked이거나 hold 단계에서 보고하면
완료가 아니다. 기존 report_submit의 verify **시도** 벽은 그대로 두어 실패·보류 보고를
막지 않는다. 성공 슬롯 판정의 추가 조건을 보고 허용 조건과 분리한다.

submitReport는 저장만으로 성공을 주장하지 않는다. agent_next의 정상 report 종료 뒤 다음
pipeline_next가 지연 전진한다. 남은 구현 구간 슬롯이 끝나면 transitionIn으로 done·백로그
제거·keyed run 종료를 같은 transaction에 반영한다. 상태 전이 시 closeRuns는 보존한다.
슬롯 사이에서는 상태를 바꾸지 않는다. 늦은 outcome은 다음 배치를 움직이지 못한다(§D).

인수 다섯 조건은 실제 diff·계획 구현 스케치·재현 출력과 대조한다. 보고의 Files changed
합집합이 실제 diff라고 단정하지 않는다. 서버는 증거 행·원장 결합을 보장하며 원격 파일 내용·
커밋 포함 여부·검증 품질은 메인 루프가 직접 확인한다. 여러 writer의 집계는 별도 제안이다.

### D. 배치별 실행 결합·재개·경합

시간 창과 (항목, 에이전트)만으로 반복 슬롯·다른 항목·reopen·ABA를 구별할 수 없다.
신규 형식은 dispatch와 gate 대기에 아래 entry 데이터를 더한다. 기존 응답 필드는 보존한다.

```ts
type PipelineEntry = { runId: string; entryId: string; slotId: string };
type GateEntry = { runId: string; entryId: string };
// 항목에 결합된 pipeline_next dispatch: 기존 응답 + format: "slots-v1" | null
// format === "slots-v1"이면 entry: PipelineEntry 필수, null은 legacy
// pipeline_next wait/on:gate: 기존 응답 + 같은 format, slots-v1이면 gateEntry: GateEntry 필수
// agent_next: 기존 입력 + entry?: PipelineEntry + agentRunId?: string + stepId?: string
// 새 bound outcome은 응답의 entry/agentRunId/step을 entry/agentRunId/stepId로 전달
// gate_approve 및 웹 GateAction: 기존 입력 + gateEntry?: GateEntry (slots-v1 필수)
// report_submit: 기존 입력 + runId?: string (보고를 수행한 AgentRun id)
```

PipelineEntry/GateEntry.runId는 PipelineRun id, agentRunId와 report_submit.runId는 AgentRun id다.
stepId는 새 열이 아니라 기존 응답 step과 저장된 AgentRun.stepId를 왕복하는 요청 필드다.

- entryId는 커서 진입·reset마다 서버가 새로 발급한다. 같은 node도 회차는 다르다.
- 항목 dispatch와 gate 대기의 format은 고정 PipelineVersion에서 서버가 제공한다. legacy는 명시적
  null과 기존 무entry 계약을 유지하고, slots-v1은 dispatch에 entry, gate 대기에 gateEntry를 필수로 제공한다. 입력으로 format을
  선택하게 하지 않는다. 항목 생성 전 PM·명시적 standalone 호출에는 이 항목 메타데이터가 없다.
- agent_next는 entry의 프로젝트·항목·고정 version·현재 node·entryId·dispatcher를 검증한다.
  gate/accept/다른 항목·에이전트/stale entry는 run 개설·원장 쓰기·전진 전에 거부한다.
  계획 제출·보류 전이가 먼저 닫은 run의 마지막 응답은 예외다. 해당 entry에 결합된 닫힌 run을
  정확히 지정하고 stepId가 저장된 닫힌 step과 일치하며 아직 terminal 응답이 없을 때만 1회 기록한다. 다른 최신 run에 붙이지 않으며
  현재 커서·상태를 전진시키지 않는다. 중복 마지막 응답은 무쓰기 성공으로 처리한다.
- 프로젝트 슬롯은 key를 생략하고 entry를 전달한다. binding의 항목과 절차의 key 계약은 다르다.
  openRun/createRun/record/advance/lastClosedRun은 binding별로 격리한다. 늦은 outcome을
  단순히 같은 agent의 최신 run에 붙이지 않는다.
- 항목 생성 전 headFor의 pm dispatch에는 PipelineRun/entry가 없다. 기존 standalone 호출을
  유지한다. 이미 생성된 항목의 propose는 실행 없이 통과한다. plan-verifier의 verify dispatch는
  항목에 결합되므로 entry를 전달하되 완료 증거는 계속 validation_record다.
- report_submit의 runId는 같은 프로젝트·actor·항목·현재 entry의 실제 run인지 검증한다.
  기존 runId 없는 보고는 현재 계약으로 저장하되 신규 슬롯 완료 증거로 쓰지 않는다.
  agent_next의 단계 응답은 실제 AgentRun id·기존 step·결합된 entry를 함께 돌려준다. outcome에는
  entry·agentRunId·stepId를 함께 보내 수행한 단계와 닫힌 run의 최종 응답도 정확히 식별한다.
  legacy/standalone의 기존 입력은 유지하되 신규 binding의 outcome에 식별자가 없으면 거부한다.
- 새 bound outcome은 잠긴 AgentRun의 현재 stepId와 요청의 stepId가 같은지 **원장·refused·
  전진·닫기 등 모든 쓰기 전에** 재확인한다. CAS의 from도 요청 stepId다. 누락·unknown·불일치·
  이전 단계의 중복 응답은 stale/zero-write이며 outcome 없는 호출로 현재 지시를 다시 읽는다.
  implement/ok 뒤 늦은 같은 응답을 verify/ok로 기록하지 않는다. 같은 step에 머무는 handoff·
  거부·재시도 의미는 보존한다. 모든 시도의 exactly-once를 주장하지 않는다. Core 고정 대본의
  현재 비순환 단계 경로를 보존·V8 검증해 한 AgentRun 안에서 같은 step으로 되돌아가지 않는다.
  기존 parser·standalone의 일반 cycle 정책이나 별도 receipt/revision 기능은 바꾸지 않는다.
- slots-v1의 게이트 승인은 호출자가 pipeline_next/Inbox에서 읽은 gateEntry를 그대로 전달한다.
  board.gate는 프로젝트·미폐기 최신 항목·고정 format·PipelineRun id·현재 gate node·entryId·
  열린 cursor·상태와 기존 row CAS·권한·session validation/planCommit 벽을 잠금 아래 확인한다.
  owner-deps는 최신 조회로 요청의 gateEntry를 새로 만들거나 교체하지 않는다. 누락·unknown·
  이전 회차·다른 run/gate는 쓰기 전에 거부한다. ensureRun 물질화가 선행한 실패도 전체 rollback이다.
  승인된 현재 gate만 같은 transaction의 내부 advanceRun에 1회 전달해 cursor CAS로 소비하고,
  다음 node에는 새 entry를 발급한다. 경계의 transitionIn(viaGate)도 이 검증된 현재 gate 문맥을
  전달한다. 다른 진입·transaction·다음 gate로 승인 문맥을 넘기지 않는다.
  신규 readFacts의 평상시 approvedGates는 비어 있으며 과거 gate note/from-to/시각은 감사용이다.
  같은 enteredAt/updatedAt·gate id로 reset되어도 과거 승인·오래된 요청은 새 회차를 열지 못한다.
  기존 human 이벤트·note·channel과 legacy의 시간 기반 승인 판정은 보존하며 새 감사 열은 추가하지 않는다.
- Inbox의 승인 성공 잠금도 읽은 게이트 회차에 한정한다. inbox-item.ts의 client-safe
  gateCardKey(item)는 신규 gate에서 (항목 key, gate, gateEntry.runId, gateEntry.entryId),
  legacy·비게이트 카드에서 (항목 key, gate, updatedAt)의 충돌 없는 tuple key를 반환한다.
  inbox-card.tsx는 이 값을 GateCardLock subtree의 React key로 사용한다. 같은 snapshot은
  잠금을 유지하고, 다른 gate·같은 gate의 새 entry·legacy CAS snapshot은 잠금을 초기화한다.
  router.refresh/새 Props만으로 useState가 초기화된다고 가정하지 않는다. 이전 승인 응답은
  새 subtree를 잠그거나 새 gate를 자동 승인하지 않는다. stale 뒤 새 카드의 승인에는 새 클릭이 필요하다.
- implement는 §C의 결합 증거로 완료한다. 프로젝트 슬롯은 **해당 entry에 결합된 run 닫힘**으로
  완료한다. 기존 로컬 log append·도구 집합은 보존한다. 이는 Report 통일의 명시적 예외다.
  프로젝트 슬롯의 run 닫힘은 작업 품질/성공 판정을 증명하지 않으며 keyed 작업의 증거 규칙을 대체하지 않는다.
- advance는 새로 진입한 실행 슬롯에 이전 cursor의 사실을 재사용하지 않는다. 새 entry를
  발급해야 하는 슬롯에 도착하면 멈추고 다음 호출에서 읽는다. 같은 run/Report를 두 슬롯에 쓰지 않는다.
- 지연 전진은 기존 mcp/deps.ts:pipelineNext가 수행한다. 개요는 미결과 walking done 꼬리를
  함께 본다. on_hold/폐기는 전진 금지. handoff도 실제 dispatcher·entry의 run으로 좁힌다.
  closeRuns는 기존 keyed run 종료와 함께 해당 PipelineRun에 결합된 non-key run도 닫는다.
  다른 항목의 binding run과 entry 없는 standalone project run은 닫지 않는다. 상태 전이·
  보류·폐기와 같은 transaction에서 적용하고, 과거 닫힌 run의 로그는 유지한다.
- entry 없는 standalone 경로의 소유 검사·상한·재개는 보존하되 신규 파이프라인을 완료하지 않는다.
  신규 형식에 결합된 run은 모든 outcome 호출에 동일 entry가 필요하다.
- nextFor/decideNext의 내부 NextInput에 hasResumableRun을 더한다. 현재 실제 dispatcher와
  해당 binding의 열린 run이 맞을 때만 서버가 true로 계산한다. legacy는 프로젝트·agent·key로
  대응하고 신규 형식은 PipelineRun·entry까지 일치해야 한다. 이때 cap wait 대신 기존 dispatch를
  돌려주어 agent_next의 outcome 없는 호출로 재개한다. 다른 항목·entry·standalone run은
  재개 근거가 아니다. gate/accept/handoff의 기존 우선순위·access/plan 거부는 그대로다.
- 항목 생성 전 PM의 headFor/decideHead에는 내부 HeadInput.hasResumablePmRun을 더한다.
  같은 프로젝트의 pm·key:null·binding 두 필드 null인 열린 standalone run일 때만 true다.
  기존 propose 유무 → 미결 2건 → availableBacklog → cap 판정 순서를 보존하고, 이 run이
  있으면 cap만 면제해 기존 PM dispatch로 재개한다. 다른 프로젝트·agent·bound run은 근거가
  아니며 새 run/entry 생성·상한 차감은 없다. access/plan과 PM 제안 수·백로그 정책은 그대로다.
- 실제 run 개설은 소유자 단위의 짧은 쓰기 transaction에서 상한 확인과 create를 묶는다.
  bound/legacy/standalone을 포함한 모든 운영 개설 경로가 기존 User 행을 매개변수화한
  SELECT FOR UPDATE로 잠근 뒤, 필요한 PipelineRun·AgentRun 순서로 재확인한다.
  재사용할 열린 run이 있으면 새 개설·상한 차감을 하지 않고, 없으면 현재 access/plan과
  소유자 전체 rolling count를 다시 읽고 허용될 때만 만든다. 실패는 무쓰기 rollback이다.
  next.ts의 사전 count는 조언이며 이 원자적 개설 결과가 최종 판정이다. 새 상한 표·카운터
  테이블·프로세스 잠금은 추가하지 않는다. 동일 소유자의 다른 프로젝트·PM 개설도 같은 잠금을 쓴다.
- NextDeps.createRun은 `Promise<ServerResult<RunRow>>`를 반환하도록 확장하고 실제
  개설·재사용된 run의 id/stepId와 신규 binding을 돌려준다. cap/access/stale 실패는
  agent_next에서 같은 실패로 반환하고 instruction을 렌더하지 않는다. 성공 시에도 사전
  candidate가 아니라 반환된 run의 현재 step을 제공한다. 중복 호출 사이에 먼저 전진한
  run을 재사용해도 본문·agentRunId·entry가 서로 다른 단계를 가리키지 않아야 한다.
  저장 경계는 agents/run-query.ts로 분리해 client를 주입하며 runs.ts가 운영 adapter를 맡는다.
  transaction 내부 access 판정은 project-access-query.ts의 기존 사실·normalizePlan 정책을
  readProjectAccessIn으로 추출해 재사용한다. readProjectAccess는 이 함수에 위임하되
  기존 read-only transaction·결과 계약을 보존하고 개설 transaction 안에 중첩하지 않는다.
- binding 확인·쓰기·소비는 transaction에서 직렬화한다. cursor CAS는 id+node+entryId+
  closedAt:null을 검사한다. 상태 CAS/커서 CAS 실패는 **그 시도 전체 rollback**이다.
  transaction 안에서 fail을 return해 앞선 Report·이벤트·백로그 변경을 commit하지 않는다.
  밖에서 stale 결과로 매핑하고 재호출이 최신 entry를 읽는다. 중복 run 개설·outcome도 같은 배치에서 격리한다.
  AgentRunStep 기록과 AgentRun CAS도 같은 transaction의 원자적 쓰기다. 검증·후보 계산 후
  짧은 쓰기 transaction에서 binding을 재확인한다. 대본/변수 렌더링과 gate 응답의 next 조회는
  transaction 밖에 두어 기존 원격 DB의 interactive transaction 시간 한도를 보존한다.

| 시작·이벤트 | 기대 동작·재진입 |
| --- | --- |
| 새 제안·propose 없는 그래프 | 첫 슬롯·첫 게이트·게이트 없는 plan 경계 모두 처리 |
| 성공 구현 보고 | Report 단독으로 종료하지 않음. 같은 run의 verify/ok·report/ok 뒤 전진 |
| plan_submit/hold 뒤 마지막 응답 | 닫힌 binding run/step을 지정해 terminal 1회만 기록, 다음 entry 전진·중복 기록 없음 |
| implement/ok 뒤 늦은 동일 응답 | 요청 stepId가 현재 verify와 달라 zero-write. verify/ok 위조 기록·report 전진 없음, outcome 없이 재개 |
| 게이트 승인·동일 gate 재진입 | 현재 gateEntry만 원자적으로 소비. 과거 이벤트·같은 clock·오래된 웹/session 요청은 새 gate 회차를 열지 않음 |
| Inbox 승인 성공 뒤 새 gate/회차 Props | GateCardLock key가 바뀌어 이전 성공 잠금 해제. 같은 snapshot refresh는 잠금 보존, 오래된 응답은 새 카드 잠금·자동 승인 없음 |
| 실패·pre-verify hold | 기존 로컬-only 예외·실패 보고·on_hold 유지. 성공 전이·백로그 제거 없음 |
| 반복·다른 항목·standalone | 매 배치 새 entry, 다른 run의 완료·handoff 재사용 불가 |
| bounce/resume/reopen | 현재 cursorForStatus의 앵커 시작 의미 보존. 새 entry, 과거 완료 증거 무효. acceptedAt·removedAt 복원 유지 |
| on_hold/discard | 전진 정지·기존 run 종료. 감사/보고 행 삭제 없음 |
| cap 도달·해제·동시 개설 | 정확히 결합된 item run과 같은 프로젝트의 무binding PM run은 각 개요의 cap만 면제해 재개. 앞선 gate/accept/handoff·PM head 정책 보존. 새 개설만 소유자 잠금 아래 count+create, 마지막 1자리에 2요청이면 1개만 개설 |
| 같은 node ABA·동시 reset/outcome | stale·zero-write, 최신 entry로 재진입 |
| 저장·권한/플랜 변경 | 진행 중 versionId 불변. 직접 Action에서 소유/available/plan 검사. 최신 서버 graph로 UI 초기화 |

프로세스 registry·timer·queue는 추가하지 않는다. UI 메뉴 listener는 닫힘/unmount에서 해제하고
test fixture는 항목·entry·token 단위로 격리한다.

### E. additive migration과 기존 행

Core migration은 실행 provenance를 추가한다. Workspace.role은 Phase 2다.
다음은 기존 모델에 더할 필드 계약이며 모델 전체를 대체하는 스니펫이 아니다.

| 모델 | 새 필드 | 읽기·쓰기 계약 |
| --- | --- | --- |
| PipelineVersion | format String? | null은 legacy, 새 저장·기본 물질화는 slots-v1. unknown format은 fail-closed |
| PipelineRun | entryId String? | legacy null 허용, 신규 활성 cursor에는 필수. 생성·진입·reset에서 발급 |
| AgentRun | pipelineRunId String?, pipelineEntryId String? | 둘 다 null은 standalone/legacy. binding은 함께 저장. nullable PipelineRun relation·조회 index 추가 |
| Report | agentRunId String? | nullable AgentRun relation·index. run→pipelineRun/entry로 provenance 확인 |

역관계와 프로젝트 삭제 cascade를 함께 정의·검증한다. 새 SQL은 nullable 열·relation/index
추가만 수행한다. 기존 nodes/gates/versionId·원장·보고 path/commit은 update/backfill하지 않는다.
generated client는 재생성하고 직접 편집하지 않는다.
AgentRun.pipelineRun 관계는 onDelete:Cascade, Report.agentRun 관계는 onDelete:SetNull로
정의한다. PipelineRun에는 agentRuns, AgentRun에는 reports 역관계를 추가한다. binding 조회
index는 AgentRun(projectId,pipelineRunId,pipelineEntryId,agent,closedAt), Report(agentRunId)다.
직접 pipeline/run/보고 삭제 기능은 추가하지 않고 기존 프로젝트 삭제 경로만 cascade 검증한다.

legacy는 기존 그래프·커서·게이트·프로젝트 closed-run 판정을 보존한다. 이미 done이면 구현을
다시 실행하지 않는다. 아직 implementing인 legacy는 진입 후 배정 dev의 보고와 정상
verify/ok·report/ok closed run을 대응시켜 새 pipeline done 경로로 넘긴다.
runId로 결합된 보고를 우선 판정하고, 기존 미결합 행의 대응이 모호하면 재디스패치한다.
재실행의 새 dev 보고는 실제 runId로 결합해 이전의 모호한 보고를 후보에서 제외한다.
legacy runId 없는 보고에 대해
자동 성공을 판정하려면 **진입 후 생성된 구현 run이 정확히 1개이고, 보고가 그 run의
openedAt부터 closedAt 사이에 있으며, verify/ok·report/ok가 같은 run에 있어야 한다.**
다수 후보·시간 경계 불확실성·중단 run은 재실행한다. 시간만으로 신규 반복 슬롯의 binding을
추론하지 않는다. 재실행도 legacy 증거 조건을 만족하는 신규 run으로 판정하며 모호한 기존 보고는 제외한다.
기존 dev 절차 업데이트와 legacy 정상/보류 재개를 함께 검증한다(§F,V2,V3,V5,V8).

GET/loadCurrentVersionView는 계속 무쓰기다. format은 저장 서버가 정하며 사용자 입력으로
legacy 검증을 선택할 수 없다. version P2002는 기존 Refresh 문구로 거부하고 행을 덮어쓰지 않는다.
Graph와 SavePipelineAction의 graph payload는 기존 nodes/gates 두 배열을 유지한다. format은
서버 version view·page Props의 별도 값으로 전달한다. readFacts의 Facts에 format/entryId와
결합 증거를 포함해 nodeDone/advance가 legacy와 신규를 구별한다. 신규 gate 승인은 §D의
검증된 transaction 내부 문맥만 소비하고 legacy approvedGates의 시간 조회로 추론하지 않는다. null 형식에서도 실제
runId 결합 보고는 현재 구현 진입/reset 뒤의 run만 허용하며 모호한 과거 보고는 제외한다.

### F. 플랜·템플릿·최종 산출물·배포

Core는 고정 에이전트 집합·상한 숫자·플랜 표를 바꾸지 않는다. Free 기본 그래프도 새 실행
규칙으로 완료해야 한다. downgrade 뒤 고정 version을 다시 쓰거나 슬롯을 조용히 빼지 않는다.
agent_next의 현재 plan/access 거부는 유지한다.

서버 안내도 새 계약의 일부다. run-rules.ts에 hintFor(node)를 두고 앵커는 기존 HINT,
프로젝트 슬롯은 core slotAgent가 돌려준 실제 agent로 한 문장을 선택한다. legacy 별칭·신규
id·모든 반복 접미에 같은 절차 안내가 나오며 빈 hint나 agent done 지시를 남기지 않는다.
implement 안내는 다음 문장으로 교체하고 product-copy §13·MCP board_transition 설명도 맞춘다:
"Dispatch with the item key and any supplied entry. It reports; the pipeline marks done after the implementation span completes."
plan/verifier는 key와 제공된 entry, 프로젝트 슬롯은 제공된 entry와 no key, 항목 생성 전 PM은 no entry라는
dispatch 계약을 hint·runbook·실제 JSON에서 일치시킨다. Scout opt-in 안내는 literal scout가
아니라 slotAgent로 모든 별칭/반복 배치에 적용한다.
gate 대기의 format/gateEntry와 gate_approve 설명은 owner가 읽은 현재 회차를 그대로 전달하도록
맞춘다. agent_next 설명은 새 bound outcome의 step echo와 stale 후 outcome 없는 재개를 포함한다.

게이트 0개 저장 확인은 유지하되 레일과 product-copy §18의 경고를 다음으로 교체한다:
"No gate: plan and implementation start without your approval. Acceptance is still required. Reopen and discard stay on the web."
게이트 제거가 필수 accept·독립 인수를 없앤다고 안내하지 않는다.

private 템플릿 변경은 단계 본문뿐 아니라 스텁·최종 생성물을 포함한다.

- dev.md: first-call에 entry, outcome에 entry/agentRunId/stepId 전달, 보고에 AgentRun id 전달. 정상 agent done 호출 제거.
  구간 종료 전 done 출력 금지, 실제 상태 출력. 실패 hold 보고·전이·로컬-only 예외 보존.
  agent_next가 현재 AgentRun id를 응답에 제공해 report 단계가 실제 id를 사용할 수 있게 한다.
- doc-auditor.md·feature-scout.md: key 없이 first-call에 entry, outcome에 entry/agentRunId/stepId 전달. 기존 로컬 append·도구 집합·standalone 보존.
- plan-verifier.md: 첫 호출에 entry, outcome에 entry/agentRunId/stepId 전달. briefing에 결합
  데이터를 추가하되 독립 검토·읽기 전용·validation_record 의미를 바꾸지 않는다.
- pm.md: 항목 생성 전에는 entry 없이 기존 절차를 사용한다. 상태 설명표의 done 주체는
  pipeline으로 고치고 새 항목 proposed 작성 권한·도구 집합은 유지한다.
- CLAUDE.runbook.md: dispatch entry·승인 요청의 gateEntry를 데이터로 전달. 실행 순서를 다시 문서에 넣지 않는다.
- docs/agents/README.md: 정상 보고·구간 종료·인수와 보류 보고 구별. 계획 문서 구조·verify 기준 보존.
- 현재 private tests/stubs는 서버에 없는 receipt/revision·commitOutcome API를 가정한다.
  이 제안에서 그 보안 기능을 도입/제거하지 않는다. **현재 accepted 서버 계약에 맞는 private
  템플릿·fixture 판 확보가 배포 전제**다. V8은 실제 NextDeps.record/advance/lastClosedRun과
  entry 확장을 연결한다. 별도 receipt 제안의 구현을 암묵적으로 선행했다고 가정하지 않는다.
  고정 대본의 next/실패/blocked 경로 비순환성과 step echo를 함께 검증한다.

| 최종 산출물 | 단일 출처·우선순위 | 내용·의존성·검증 목적지 |
| --- | --- | --- |
| /p/[slug]/pipeline 레일·Read as text | persisted graph/format 우선, 없으면 defaultGraph. GET 무쓰기 | slotAgent·entity public labels·client state·save가 같은 순서/id/게이트 표시(V1,V6) |
| pipeline_next JSON·handoff/cap | 고정 version/format+현재 entry/gateEntry+결합 run/Report, head는 같은 프로젝트의 무binding PM | 실제 dispatcher·명시적 legacy null/신형 entry·gateEntry echo·stale/hold/cap/PM 재개/accept/done 분기(V2–V5,V7,V8) |
| done·인수·History·보고 링크 | board transaction·Report·TransitionEvent | 현재 gateEntry 승인/소비·회차별 Inbox 잠금 초기화·감사 표시·pipeline actor/result·백로그 제거·독립 acceptedAt·commit 링크. project 슬롯의 keyed 보고 링크 약속 없음(V2,V3,V5,V6) |
| .claude/agents/*.md·CLAUDE.md·lock | private→Template DB→deliverable→생성기. lock은 modified 파일 보존 | 스텁 tools·entry/agentRunId/stepId 전달·본문 비유출·runbook gateEntry/판·실제 body/lock(V8) |
| agent_next instruction | 프로젝트 언어 우선, 없으면 en·server vars·renderTemplate | 본문 1단계·미치환 없음·runId/entry/step의 상호 일치·실제 흐름(V2,V4,V8) |
| Prisma client·plugin/lib | schema/migration→generate, core→sync | relation/index/nullable 구조·생성 타입·복사본 byte 일치(V5,V9) |

격리 DB migration·client 생성 → 호환 server/plugin/private 판 준비 → 승인된 재시드·init 검증
→ slots-v1 편집 개방 순서다. seed만으로 기존 사용자 스텁은 갱신되지 않으므로 init과
skip(modified)/lock 결과까지 확인한다. old server/new template·new graph/old stub를 정상으로
간주하지 않고 호환 오류·재init으로 복구한다. 준비 전 새 형식 저장은 운영상 개방하지 않는다.
entry 없는 호출은 합법적인 standalone 입력이기도 하므로 일괄 거부로 old stub를 탐지하지
않는다. 이 실행은 신규 cursor의 증거가 되지 않으며 pipeline_next는 entry를 포함한 dispatch를
계속 안내한다. 새 bound 스텁은 dispatch의 format으로 계약을 구별한다. 명시적 null이면
legacy의 기존 key/no-key 입력을 유지하고, slots-v1이면 briefing의 entry와 step 응답의
entry/agentRunId/step을 확인해 outcome에 stepId로 되돌린다. 항목 dispatch/gate 대기의 format 누락/unknown 또는 신형 결합 응답의
누락·불일치이면 outcome/보고를 보내지 않고 호환 판·init/lock 확인으로 복구한다.
gateEntry가 누락·불일치이면 승인도 보내지 않는다. stale outcome/gate 승인은 기존 요청의
식별자를 최신 값으로 바꿔 재전송하지 않고 현재 단계 지시/게이트 대기를 다시 읽는다.
migration/seed/운영 호출은 DB 쓰기이며 이 문서 reconciliation에서 실행하지 않는다.

### G. Phase 2 — 역할 카탈로그 v1의 방향

기존 결정은 유지한다: harness.json의 roster가 선언 출처, role은 dev(기본)·review부터 시작,
criteria는 사용자 문서, scope는 검사 범위, 단계 본문은 서버 카탈로그다.
다음은 **향후 workspace 원소 예시**이며 현재 parseHarnessConfig 입력으로 실행하지 않는다.

```json
{
  "workspaces": [
    { "id": "web", "agent": "web-dev", "role": "dev", "path": "src/web", "verify": ["npm test"], "knowledge": "src/web/CLAUDE.md" },
    { "id": "cr", "agent": "code-reviewer", "role": "review", "criteria": "docs/reviews/code.md", "scope": ["src/**"] }
  ]
}
```

role 없음/null은 dev 호환. dev는 path/verify 필수, review는 코드 소유 path를 필수로 하지 않는다.
코드·설계·문서 검토는 review 대본 하나의 criteria/scope로 나눈다. 새 쓰기 역할 대본과
테스트 작성의 dev 분리는 별도 제안이다. 다음은 Phase 2에서 반드시 확정할 계약이다.

1. Workspace.role만 추가하면 불충분: path non-null 변경, criteria/scope 저장·빈 값 의미,
   검증 명령·예약명(main-loop/앵커/before-접두)을 정의한다.
2. config→생성기→project_sync Zod/DTO→DB→project_get DTO→serverVars→instruction 전체에 전달한다.
   생성기의 workspace 렌더 루프·pm 소유 표·dev others path 변수도 바꾼다.
3. 전체 roster와 BoardItem.agent에 배정 가능한 dev roster를 구별한다. 웹 propose 선택,
   board_propose, 실행 owner 검사, Team, 소유 path 규약을 동시에 갱신한다.
4. sync는 upsert뿐이다. 삭제/개명/role 변경과 진행 중 version의 snapshot·회복을 정의한다.
   현행 Workspace 변경 때문에 고정 그래프의 의미가 바뀌어서는 안 된다.
5. review의 제품 읽기와 보고 append/commit 권한·tools·handoff를 구분한다.
   role명은 project token의 개별 에이전트 인증 identity가 아니므로 새로운 인증 경계를 주장하지 않는다.
6. implementing review에도 현재 verify 시도 벽이 적용된다. 검증 절차 또는 승인된
   대체 증거 규칙을 설계한다. role 이름으로 벽을 제거하지 않는다.
7. Report를 run/entry에 결합한다. 성공·지적 있음·blocked의 정지 의미, 재검토·반복 시
   보고 path/append 단위와 재개를 확정한다.
8. Free도 review를 선언·standalone dispatch할 수 있다. 기본 그래프에 자유 슬롯이 없다는
   이유로 무관하다고 하지 않는다. workspaces/고정agent/dispatch 제한을 생성기·서버에서 검증한다.

### H. Phase 2 — requires:item과 대본 배달

needsKey는 item 선언 **또는** 기존 status/verify-ok 추론(OR)으로 호환한다.
DERIVED_REQUIREMENTS 추가만으로 끝내지 않는다. Facts.check("item")을 명시 구현하고
실재하는 미폐기 최신 BoardItem·허용 상태·복구를 계약화한다. item을 status와 비교해
항상 not open이 되는 구현을 금지한다.

owner 검사를 dev role에 한정하는 방향은 유지하되 review의 key/access/current-entry 확인을
생략하지 않는다. dev가 planning에서 계획 파일을 쓰는 예외를 보존하고, "쓰기 역할은
implementing만"이라는 문구로 계획 작성을 금지하지 않는다.

대본 경로는 Phase 2에서 하나로 확정한다. agents/review.md는 현재 agentOf가 스텁화하나
server/생성기의 role 선택은 필요하다. agents/roles/review.md는 agentOf·stubOf·plan filtering
수정과 서버/로컬 두 전달 경로의 최종 body 검증이 필요하다.
생성 목적지는 .claude/agents/<workspace.agent>.md다. 원문 전체가 저장되는 경로를 남기지 않는다.

### I. Phase 2 — 2026-09-10 결정의 처리

결정 #1(고정 카탈로그)의 부분 갱신, #5(선형 체인) 유지라는 방향을 보존한다.
서버 역할 대본과 workspaces 축으로 절차 소유·상한을 지킨다. 임의 review Report는
validation_record의 고정 plan-verifier·마지막 plan_submit 이후 verify/ok를 대신하지 않는다.
Phase 2 수용 시 그 결정과 구현을 architecture에 반영한다.

## Affected Files

Core의 정확한 후보 목록이다. 괄호의 신규 파일은 구현 때 생성한다. Phase 2 경로를 섞지 않는다.

| Core 경로 | 작업·공개 API·검증 목적지 |
| --- | --- |
| packages/core/pipeline.mjs, pipeline.test.mjs | slotAgent/dispatcher/검증/진행. 기존 @harness/core alias(V1–V5) |
| packages/core/transitions.mjs, transitions.test.mjs | pipeline done 추가·agent done 제거·나머지 규칙 보존(V2,V3) |
| prisma/schema.prisma, prisma/migrations/<생성시각>_pipeline_slot_execution/migration.sql(신규), src/generated/prisma/(생성) | §E nullable/relation/index/cascade. 기존 migration 수정 금지(V5,V9) |
| src/server/pipeline/run.ts, run-rules.ts, run-rules.test.mjs, run-query.ts(신규), run-query.test.ts(신규) | readFacts DB 질의를 주입 가능한 run-query로 분리, 같은 폴더 상대 import. Graph/Facts/NextInput/HeadInput/PipelineNext·서버 format·entry/gateEntry·hasResumableRun/hasResumablePmRun·hintFor 확장. 신형 gate 감사 조회와 승인 문맥 분리(V2–V5,V7,V8) |
| src/server/pipeline/board.ts, board-rules.ts, board-rules.test.mjs, board-query.ts(신규), board-query.test.ts(신규) | report 결합·done guard·gateEntry 입력/검증·transitionIn/advanceRun의 현재 gate 문맥·원자적 소비·latestBoardWithEvents의 run id/entryId/version.format select·CAS rollback. 주입 가능한 저장 경계로 부분 commit 검증(V2,V3,V5,V6) |
| src/server/agents/next.ts, next.test.ts, runs.ts, run-query.ts(신규), run-query.test.ts(신규) | NextDeps/입출력 entry/agentRunId/step echo·입력 stepId의 쓰기 전 검증·createRun의 ServerResult·binding 조회/닫힌run 최종응답/원자적 기록·전진·주입 가능한 개설 경계의 소유자 잠금 아래 count+create·반환된 현재 step 제공·standalone 보존(V2–V5,V7) |
| src/server/project-access-query.ts, project-access-query.test.ts | readProjectAccessIn 추출·공개 export, agents/run-query의 서버 내부 import. 기존 normalizePlan/available/integrity·readProjectAccess read-only 결과 보존, 기본 DB import 없음(V5,V7,V9) |
| src/server/mcp/tools.ts, tools.test.mjs, deps.ts, owner-tools.ts, owner-tools.test.mjs, owner-deps.ts | entry·agent_next agentRunId/stepId·report_submit runId·gate_approve gateEntry의 Zod/DTO·설명·등록 집합 보존·owner adapter의 요청 token 보존·gate 이후 next(V4,V7) |
| src/fsd/features/edit-pipeline/model/rail-state.ts, rail-state.test.ts, ui/pipeline-rail.tsx, pipeline-rail.test.mjs, api/edit-pipeline.server.ts, index.ts, index.server.ts | add/move/delete·게이트 추종·raw validation·format 저장·게이트0개 필수인수 경고·Scout 별칭/반복 안내. 공개 Graph/Step/SavePipelineAction 일치(V1,V6) |
| src/fsd/entities/pipeline/model/labels.ts, labels.test.ts, index.ts | core slotAgent 사용, entity public 라벨(V6) |
| src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx, src/app/(app)/p/[slug]/pipeline/page.tsx | format·Read as text·최신 서버 값 재초기화. route는 composition(V6) |
| src/fsd/features/review-gate/model/gate-text.ts, gate-source.test.ts, inbox-item.ts, inbox-item.test.ts, api/inbox-data.server.ts, api/review-gate.server.ts, ui/inbox-card.tsx, ui/gate-card-lock.tsx(참조), index.ts, index.server.ts, src/app/(app)/p/[slug]/inbox/page.tsx(composition 참조) | 반복 게이트·경계2개·before-accept 보존. BoardRow→InboxItem format/gateEntry→GateAction→approveGate→board.gate 배선·구조적 서버/client 타입과 공개 API·카드가 읽은 token echo. model의 gateCardKey를 같은 slice 상대 import로 InboxCard의 GateCardLock key에 연결·새 회차의 성공 잠금 초기화(V6,V7) |
| src/fsd/pages/project-board/model/briefing.ts, briefing.test.mjs | 실제 agent 해석·Team 중복 제거(V6) |
| src/fsd/widgets/turn-banner/model/turn.ts, turn.test.ts, api/turn-data.server.ts | dispatcher/entry에 맞는 keyed/non-key run·handoff·다음 줄(V4,V6) |
| src/fsd/pages/board-item/ui/board-item-page.tsx, model/item-docs.test.ts | pipeline 종료 표기·기존 모든 commit 보고 링크·독립 인수(V6) |
| plugin/templates/en/agents/dev.md, doc-auditor.md, feature-scout.md, plan-verifier.md, pm.md, en/CLAUDE.runbook.md, en/docs/agents/README.md, plugin/templates/templates.test.mjs(private) | 항목 결합 스텁 entry·PM 무entry 예외/상태 설명·성공/보류·실제 engine fixture·생성 body(V2–V4,V8) |
| packages/core/deliver.test.mjs, plugin/bin/harness-init.test.mjs, src/server/templates-query.test.ts, src/server/agents/vars.test.ts | 기존 delivery/config/vars 제품 규칙 보존 검증(V8) |
| plugin/lib/pipeline.mjs, transitions.mjs(동기화 출력), scripts/plugin-lib.mjs, scripts/seed-templates.ts, plugin/bin/harness-init.mjs, src/server/templates-query.ts(참조만) | 복사본·재시드·생성·최종 전달 경로(V8,V9) |
| scripts/rehearse-pipeline-agent-slots.ts(신규) | 전용 격리 PostgreSQL의 transaction/소유자 상한 경합/cascade/legacy 실측. 전용 client·query deps 주입, 일반 server/db singleton·DATABASE_URL import 금지. finally에서 client/pool 종료(V5) |
| docs/architecture/protocol.md, invariants.md, system-overview.md, docs/conventions/product-copy.md | Core 수용 시 규칙·copy §3/5/6/7/11/12/13/14/18 갱신(V6,V9) |

preflight: 기존 경로는 존재 확인, 신규 query/test/rehearsal·migration은 충돌 확인을 한다.
부모 폴더는 기존이며 migration의 새 부모만 Prisma가 만든다. 이동·삭제 지시는 없다.
FSD 소비자는 index.ts/index.server.ts만 통과하고 server는 FSD 타입을 import하지 않는다.
Graph의 server·feature 공개 정의와 신규 entry/gateEntry/dispatch 타입은 함께 갱신한다.
GateEntry는 server run-rules가 소유하고 서버/MCP는 내부 import, review-gate는 client-safe 구조적
정의·public index를 사용한다. 같은-layer slice import나 server→FSD 의존을 추가하지 않는다.

## Safety Analysis

파일 열거와 core export→import/public API→MCP/화면 목적지 추적의 두 경로로 검증한다.
dispatcherFor의 turn-data 소비자, NODE_AGENT의 briefing/run-rules 소비자,
NODE_KINDS/TAIL_NODES의 rail/labels 소비자와 binding 없는 readFacts를 빠뜨리지 않는다.
before-plan/before-implement 경계·세션 전제는 보존하고 반복 슬롯 게이트는 same-status다.
단계 응답의 step→요청 stepId→잠긴 AgentRun CAS, gate 대기/Inbox의 gateEntry→owner/web
입력→검증된 내부 advanceRun 문맥→cursor 소비까지 왕복 경로를 별도로 추적한다.

Prisma schema/client/SQL, Zod, graph/entry/response JSON, init lock은 구조로 검증한다.
rg 문자 일치만으로 합격하지 않는다. 새 route/asset/동적 대본 경로/프로세스 registry는 없다.
Server Action은 직접 POST 가능하므로 editable만 믿지 않고 requireProjectWrite와 plan 검사를
보존한다. Next 16.3.3의 설치 문서
`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`를 구현 전에 읽고,
revalidatePath 뒤 실제 graph/version/Read as text 재렌더를 검증한다.
Inbox는 설치된 `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`의
refresh가 Client state를 보존하는 계약도 따른다. gateCardKey의 tuple 변화와 실제 잠금 subtree
재마운트를 따로 검증하며, item key만 유지된 카드가 새 회차를 계속 잠그지 않게 한다.

## Approval

front matter는 미승인이다. 2026-09-16 grilling의 8결정은 설계 출발점이다.
문서 reconciliation·수정이 구현·운영 승인으로 바뀌지 않는다.

| # | 질문 | 보존 결정·실행 경계 |
| --- | --- | --- |
| 1 | 노드 정의 | C — 앵커+자유 슬롯. Core는 기존 project agent, 사용자 role은 Phase 2 |
| 2 | 에이전트 출처 | 2 — roster 1급, harness.json 선언(Phase 2) |
| 3 | 역할 바인딩 | A — Workspace.role·path/verify 조건부(Phase 2) |
| 4 | 판단 기준 | 사용자 repo criteria, 대본은 서버(Phase 2) |
| 5 | 상태·슬롯 | 위치가 상태를 정함. 현재 plan_submit의 in_review 전이 보존 |
| 6 | done 주체 | A — 구간 끝 pipeline, agent는 호출하지 않음 |
| 7 | 슬롯 증거 | A — keyed 작업은 Report 필수, 보류와 성공 구별. 기존 non-key run 닫힘 예외 보존 |
| 8 | gate id | A — slot id·기존 앵커 id·backfill 없음. requires:item은 Phase 2 |

테스트 작성 등의 writer를 dev 전후에 두는 장기 방향은 유지하지만 대본·소유 범위·verify
분할·실제 diff/스케치 대조는 별도 제안이다. Core가 미정의 writer를 허용하지 않는다.

## Execution Plan

### 1단계 — Core

1. 변경 전 기준·private 판·schema 저장. 현재 fixture/API 불일치의 호환 의존 작업 기록.
   dev에서 harness/<topic>으로 분기, 현재 architecture·설치 Next guide 확인.
2. §E migration/client/legacy 읽기 준비, core 해석기·V1 구현, plugin/lib 동기화.
3. entry lifecycle·run/Report binding·outcome stepId·gateEntry의 Zod/DTO/서버·웹 왕복·NextDeps.createRun의 ServerResult·원자적 소유자별
   개설 준비. agents/run-query·readProjectAccessIn과 pipeline run/board-query로 DB 경계·
   동시 마지막1자리·item/PM 개요의 cap 중 재개·재사용 run의 현재 step·늦은 이전 step 거부·
   게이트 재진입/과거 승인 재사용 거부·실패 시 본문 없음 검증(V2–V5,V7).
4. 성공 증거 advance·구간 끝 guard·전체 rollback 구현 후 agent done 제거.
   hold/reopen·legacy·Free cycle 검증을 선행.
5. rail-state의 add/move/delete·게이트 추종을 UI에 연결. 모든 소비자·label·handoff·hintFor·dispatch/gate format·Inbox gateEntry echo 일치,
   게이트0개 인수 경고·Scout 별칭/반복 안내·직접 Action·format/version 충돌·레일 재초기화와
   gateCardKey→GateCardLock의 새 회차 잠금 초기화·오래된 승인 응답 격리 검증.
6. 실제 private 고정 에이전트 전체의 스텁·본문·runbook·보고 문서·engine fixture·step echo/비순환 경로·gateEntry 전달 일치와 생성 body 검증(V8).
   별도 receipt 기능을 무단 변경하거나 서버에 없는 API를 요구하지 않음.
7. architecture·copy 갱신, V1–V9/DoD·실측 결과 기록, PR은 `gh pr create --base dev`.
   dev merge는 check 녹색, main은 이미 녹색인 dev의 fast-forward만.
8. 구현/private 변경/격리 DB 검증 준비 후 승인된 배포만 §F 순서로 수행.

### 2단계 — 별도 역할 카탈로그 문서

§G–§I를 입력으로 별도 spec·inventory·제품/증거 결정·INV-1–INV-7·승인을 완료한다.
Core 완료가 임의 review 선언·배달·실행의 완료는 아니다. 향후 설계의 미확정 항목을 Core에 섞지 않는다.

## Verification Plan

문서 대조의 관측과 미래 구현 검증을 구별한다. 다음은 Core 구현 후 PowerShell 실행 명령이다.

```powershell
npm.cmd run sync:plugin-lib
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run check
npm.cmd test
npm.cmd run test:web
npm.cmd run test:templates
npm.cmd run verify:fsd
npm.cmd run test:architecture
npm.cmd run build
```

check는 복사본·lint/FSD·next typegen·tsc·architecture·project availability를 포함하며 build는
별도 조건이다. DB migration/seed는 위 일반 check에 섞지 않는다.
V5 신규 rehearsal은 전용 빈 DB의 PIPELINE_SLOT_TEST_DATABASE_URL과 명시 fixture 허용만 사용,
일반 DATABASE_URL로 fallback 금지, env/token 출력 금지다. 구현 후 호출 형태:

```powershell
node.exe --import tsx scripts/rehearse-pipeline-agent-slots.ts --allow-fixtures
```

| ID | 목적지와 필수 케이스·기대 결과 |
| --- | --- |
| V1 | pipeline/rail-state: 모든 legacy valid graph, 플랜별 default, 별칭/반복 정례, unknown/원소 타입/#1/앵커중복/pm·verify 위치/플랜위반/중복·고아gate 부례. move는 gate 추종, delete는 해당 gate만 제거, 실패 시 state 불변 |
| V2 | run/board-query/run-rules/next/실dev: Report 단독은 미완료, same-run verify/ok+report/ok로 implement 전진, 남은 슬롯 뒤만 pipeline done. 다른 actor/key/run/entry·main-loop·과거보고·실패/보류 증거 대체 금지 |
| V3 | board/transitions/templates: verify 시도 벽 유지, pre-verify local-only hold, verify 실패 이후 hold 보고 허용. agent의 implementing→done 거부·result/Report 없는 pipeline done 거부, 종료 prefix 위조·implement 중 조기 종료 거부. 이미 done인 같은 상태의 result 없는 기존 무쓰기 noop은 보존. bounce/resume/reopen/discard의 backlog/acceptedAt/cursor/keyed 및 bound non-key run 종료와 다른 항목/standalone 보존. 신형 gate의 현재 승인만 소비하며 reset 후 과거 gate note/경계 전이는 승인 증거가 아님. legacy 승인·human 감사 note/channel 보존 |
| V4 | next/turn: 반복2slots·동시2items·non-key·standalone isolation·stale outcome·handoff·ABA. 같은 entry/run의 implement/ok 처리 뒤 동일 stepId 요청 재전송은 verify 원장·refused·cursor 모두 zero-write, verify 실행 없이 report로 가지 않음. 같은 step의 handoff/거부/재시도 의미 보존. plan_submit/hold 뒤 지정된 닫힌run/step 최종응답 1회·중복 무쓰기, 다른 최신run/step 오결합 금지. gateEntry 재진입/중복/같은 clock의 이전 승인 거부, fixture별 mutable state reset |
| V5 | agents/run-query·project-access-query·pipeline run/board-query tests+전용 PostgreSQL: 상태/커서CAS·중복개설/outcome·동시reset·Report 후 실패를 주입해 zero-write 확인. outcome stepId 확인과 원장/CAS가 원자적이며 이전 step·닫힌 다른 step 거부도 무쓰기. gate 승인/경계 전이/이벤트/소비 중 실패·물질화 후 거부는 전체 rollback, 같은 enteredAt/updatedAt/동일 gate ABA에서 오래된 gateEntry 요청/이벤트는 새 회차를 열지 않음. 같은 소유자의 다른2프로젝트에서 PM/slot/standalone 개설을 마지막1자리와 경합시키면 1개만 성공·패자는 새run/원장/본문 없음, 다른 소유자는 독립, 같은entry 중복은 1개run이며 전진한 run 재사용 시 현재 step/body/응답 binding 일치. cap 중 정확한 item run·같은 프로젝트 무binding PM run 재개에 새run/차감 없음. readProjectAccessIn의 selected-out/integrity/plan 결과·기존 읽기 계약 보존. 기존 snapshot→nullable migration→legacy 전상태/모호증거 재실행/신규cycle→cascade 검증. 기존 rows/versionId 불변·relation/index 구조·구형 snapshot 호환성·client/pool teardown 확인 |
| V6 | labels/briefing/turn/rail/inbox/item-docs+실화면: rail/Read as text 순서·Team 중복제거·non-key active·반복gate 문구·before-accept는 done·게이트0개에도 독립인수 필수 경고·Scout 모든별칭/접미 안내·모든 commit 보고 링크·Refresh 충돌·권한/plan/state 초기화. latestBoardWithEvents→toInboxItems의 format/gateEntry 직렬화→카드가 읽은 token→GateAction/approveGate→board.gate까지 일치. 오래된 카드 승인은 zero-write 후 Refresh, 현재 카드 승인만 소비. inbox-item.test는 gateCardKey의 같은 snapshot 안정성·gate/run/entry 변화·legacy updatedAt 변화·tuple 충돌 방지를 검사하고 gate-source.test는 실제 GateCardLock key 배선을 확인. 실화면은 카드가 중간에 사라지지 않은 채 승인 성공 잠금→다른 gate/같은 gate의 새 entry Props→새 승인 버튼 사용 가능을 검증. 같은 snapshot refresh는 잠금 보존, 이전 요청의 늦은 성공 응답은 새 카드 잠금/자동 승인 없음. copy §3/5/6/7/11/12/13/14/18과 실제 body 대조 |
| V7 | tools/owner-tools/owner-deps/next/run-rules: 등록 집합 보존·agent에 gate/graph 도구 없음·위조entry/agentRunId/stepId/report runId/gateEntry 거부·selected-out/Free session approval/non-owner 직접 호출 거부·session validation/planCommit 벽 유지. slots-v1에서 gateEntry/stepId 누락 거부·owner adapter의 최신 token 교체 금지·현재 승인 소비와 reset 후 stale 거부. 모든 slot dispatch cap/시간해제, cap중 정확한 열린item run 재개는 dispatch·다른binding/standalone 근거 거부. PM head는 같은 프로젝트 pm/key:null/무binding 열린run만 cap 면제, 다른 프로젝트/agent/bound run 거부, propose 없음/미결2건/빈백로그 우선순위·access/plan 유지. owner-wide 개설 경합 V5. legacy/신규/반복 slot hintFor가 빈값 없이 key/entry 계약과 pipeline done을 안내·MCP step echo/gateEntry 설명 일치·walking done tail 개요 포함 |
| V8 | 실제 private+deliver/init/templates-query/vars: accepted engine 의존계약·entry/step echo 확장·old/new template 흐름·hold/success/handoff·tools·언어/en fallback·미치환 없음. 임시 init fixture의 모든 agent body에 본문 없음/정상 agent done 지시 없음. dev·plan-verifier·doc-auditor·feature-scout는 명시적 legacy format:null일 때 기존 무entry key/no-key 재개, slots-v1일 때 entry/agentRunId/응답step→요청stepId 결합 호출. 고정 대본 next/on failed/on blocked의 비순환 경로 보존. 항목 dispatch/gate 대기의 format 누락/unknown·신형 결합 응답 누락/불일치이면 outcome/보고/승인 없이 호환 복구. 항목 생성 전 PM·standalone에는 메타데이터/entry 없이 허용. runbook은 읽은 gateEntry 그대로 승인 호출에 전달하고 stale 뒤 새 대기를 읽음. PM 상태표의 pipeline done·검증자 briefing 결합 데이터·lock/skip(modified)/runbook stale 대조 |
| V9 | schema/generate/check/전체tests/build: nullable/relation/index·public exports/import provenance·plugin/lib byte 일치·FSD 예외 없음·architecture 일치. Core에 role/criteria/scope/requires:item/review 대본/플랜 숫자 변경 없음 |

신규 목적지의 존재·새 테스트 통과는 구현 시 확인하며 이번 관측으로 대신하지 않는다.
잔존 감사 기대 결과: agent done 규칙/정상 template 지시는 없음, 거부 회귀 test·이행 설명에는
남을 수 있음. before-plan/before-implement/plan-verifier는 보존. NODE_KINDS는 legacy/default
용도만, 신규 dispatcher는 slotAgent 사용. 넓은 rg 0행은 구조·body·runtime 검증을 대체하지 않는다.

## Verification Results

두 시점의 관측이다. 첫 표는 2026-09-16 문서 reconciliation 중 **변경 전 코드**에서,
둘째 표는 2026-09-18 **`ce19203` 커밋 뒤**에 실행했다.

변경 전 (2026-09-16):

| 명령 | 관측 | 의미 |
| --- | --- | --- |
| npm.cmd run check | exit 0 | 복사본·lint/FSD·typegen/tsc·architecture·availability 통과 |
| npm.cmd test | exit 0, 149/149 | 당시 core/plugin 기준 |
| npm.cmd run test:web | exit 0, 277/277 | 당시 frontend/server 기준 |
| npm.cmd run test:templates | exit 1, 16 pass / 8 fail | private fixture가 receipt/commitOutcome을 가정: deps.record is not a function |
| npm.cmd run verify:fsd | exit 0 | 당시 FSD |
| npm.cmd run test:architecture | exit 0, 19/19 | 당시 검증기 |

구현 후 (2026-09-18, `ce19203`):

| 명령 | 관측 | 의미 |
| --- | --- | --- |
| npm run check | exit 0 | lint/FSD·typegen·tsc·architecture·availability 포함 |
| npm test | 156/156 pass | |
| npm run test:web | 306/306 pass | |
| npm run test:templates | 25/25 pass | 위 8실패가 닫혔다 |

`npm run build`·실제 앱 사이클·PostgreSQL 통합은 별도 보고서에 있다 —
[E2E](../../test-reports/completed/2026-09-17-pipeline-agent-slots-e2e.md)(17시나리오 PASS, build exit 0)와
[PostgreSQL 인수](../../test-reports/completed/2026-09-17-pipeline-agent-slots-postgresql-acceptance.md)(7항목 PASS).
두 보고서의 `tested-revision`은 기준 commit이고 검증 대상은 당시 미커밋 working tree다.
front matter `verification-summary`는 승인·완료 처리 시점에 채운다.

## 구현 현황 — 2026-09-18 재검토

1단계(Core)는 `ce19203 feat: support repeated pipeline agent slots`로 커밋됐고 작업 트리는
깨끗하다. 문서는 `stage: awaiting-approval`(승인 요청, 아직 미승인)이다. 이 절은 커밋 이후 상태를 다시 확인한 기록이며,
직전 검토에서 열려 있던 항목 중 무엇이 닫혔고 무엇이 남았는지를 적는다.

### 닫힌 것

- **템플릿 배포.** 서비스 DB의 public 스키마를 초기화하고 `prisma migrate deploy`로 13개
  migration을 적용한 뒤 `scripts/seed-templates.ts`가 `done: 10 templates`로 끝났다
  (PostgreSQL 인수 보고서 E2). 같은 과정에서 **기존 사용자·프로젝트·토큰·플랜이 삭제**됐다 —
  소유자는 다시 로그인하고 프로젝트·토큰을 만들어야 한다.
- **아키텍처 문서.** `protocol.md`의 「파이프라인 그래프」 절을 앵커·슬롯·게이트·버전/회차·
  실행 결합·완료 증거·구간 종료로 다시 썼고, 상태 기계 표의 `implementing → done`을
  `pipeline | auto`로, `agent_next`에 `entry?`·`agentRunId?`·`stepId?`를, `report_submit`에
  `runId?`를 반영했다. `invariants.md`의 "경계 둘뿐"과 `done`의 뜻도 고쳤다.
- **실행 증거.** 실제 앱 Playwright E2E 17시나리오와 PostgreSQL 통합 7항목이 통과했다.
  게이트 회차 소비(E07·E10·T5), 반복 슬롯(E04), 구간 종료(E09·E10), 재개(E12),
  무게이트(E12a·E12b)가 실제 경로로 확인됐다.
- **E2E가 미수정으로 남긴 F2·F3.** 같은 커밋이 `backlog-form.tsx`·`backlog-form-state.ts`·
  `item-docs.ts`를 고쳤다 — 그 보고서의 "미수정" 기술이 이제 낡았다.

### 남은 것

- **`product-copy.md` §12가 사용자에게 보이는 문구를 틀리게 적는다.** §12는 이 문자열들이
  "shown as is"라고 규정하는데, `validateGraph`에서 삭제된 사유 둘(`nodes before accept must
  keep the order …`, `only doc-audit and scout may follow accept`)이 그대로 남아 있고,
  새 사유 다섯(`slot and gate ids must be strings` · `anchors must keep the order plan ·
  implement · accept` · `propose must be first` · `verify must be between plan and implement` ·
  `don't mix <alias> with <agent> slots`)은 한 건도 없다.
- **`product-copy.md` §18(Pipeline tab)이 옛 레일을 설명한다.** "노드 이름 7종", "꼬리 둘이
  Swap"이라고 적혀 있으나 레일은 `Add <agent> here`·`Move <id> here`를 내놓고 슬롯이 반복된다.
  무게이트 경고 문장도 코드에서 바뀌었다.
- **디스패치 상한의 재개 면제가 문서에 없다.** `decideNext`·`decideHead`가
  `hasResumableRun`·`hasResumablePmRun`이면 상한을 건너뛴다(`run-rules.ts`). PostgreSQL 인수의
  E1 출력이 `cap resume`를 검증했다고 말하므로 **동작은 확인됐고 문구만 없다.**
- **회귀를 잡는 자리는 있으나 CI에 없고, 구간 종료는 그 자리에도 없다.** `tests/server/integration/`의
  다섯 파일이 실제 PostgreSQL에 붙어 돈다 — `board.test.ts`가 `transition`·`discard`·`gate`의 stale CAS와
  이벤트 실패 롤백을, `agent-runs.test.ts`가 receipt 1회 전진·CAS 패자의 refused 미소비·감사 실패
  롤백을 고정한다. 다만 **`check.yml`은 `check`·`test`·`test:web`·`build`만 돌린다** —
  `test:server`와 `test:server:integration`은 `TEST_DATABASE_URL`(`stagekeeper_test_*`이고
  `DATABASE_URL`과 달라야 한다)을 요구해 손으로만 돈다. E2E와 PostgreSQL 인수도 CI가 아니다.
  남은 공백은 **구간 종료(actor `pipeline`의 done)가 통합 스위트에 없다**는 것이다. `board.test.ts`의
  게이트 케이스는 `updatedAt` CAS의 낡음을 잠그지 entry 정체성을 잠그지 않는다 — 그쪽은
  `board-query.test.ts`(132줄·5건, PR #47)가 단위로 덮는다.
- **private 템플릿 저장소 반영 증거가 없다.** `plugin/templates/`는 `.gitignore`로 무시되고
  정본은 별도 private 저장소다. 서비스 DB는 재시드됐으나 정본에 반영됐는지는 이 저장소에서
  확인할 수 없다.
- **DoD 14항목이 전부 미체크**이고 `Review Checklist` 마지막 줄도 미체크다. 승인 전이므로
  당연하지만, 위 증거로 채울 수 있는 항목과 그렇지 않은 항목의 구분은 승인자가 한다.

### 처리 순서

`product-copy.md` §12·§18 갱신과 상한 재개 면제 기록, 게이트 회차 소비·구간 종료의 단위 고정은
PR #47(`e3af7fb`)에서 닫혔다. 남은 것:

1. 구간 종료(actor `pipeline`의 done)를 `tests/server/integration/`에 더한다 — 지금 그 경로를
   실제 DB로 지나는 케이스가 없다
2. `test:server`·`test:server:integration`의 CI 편입 — 통합 쪽은 테스트 DB 자격이 필요해 별도 판단이다
3. private 템플릿 저장소 반영 확인
4. 승인 절차 — front matter와 DoD

## Risks and Rollback

- CAS·entry/step echo/gateEntry 없는 old stub·private fixture/API 불일치는 V4/V5/V8 실측 대상이다.
  배포 DB 상태는 로컬 파일에서 추정하지 않고 최종 stub/instruction·원문 digest를 대조한다.
- 소유자 잠금은 짧은 run 개설 transaction에만 둔다. 잠금 순서·다른 프로젝트/PM/standalone
  경합·timeout/rollback을 V5로 확인하고 렌더링/원격 조회를 잠금 안에 넣지 않는다.
- 구형 engine은 새 format/entry를 해석하지 못한다. 열린 PipelineRun은 예전 versionId에
  고정되므로 **최신 default version을 추가해도 그 run은 복구되지 않는다.**
- 안전한 default 복귀는 같은 호환 engine으로 새 default version을 저장해 다음 항목부터 쓰는
  것이다. 열린 slots-v1은 호환 engine으로 완수/보존한다. old engine 복귀는 쓰기 정지·전 pinned
  run/새형식 version 목록·Prisma/템플릿/플러그인 호환 확인·복구 rehearsal이 선행되어야 한다.
  읽힐 수 있는 모든 비호환 version/row를 처리할 검증된 compatibility bundle 없이 old engine으로 되돌리지 않는다.
- 원장 삭제·versionId 교체·컬럼 제거로 복구하지 않는다. nullable 열이 남는 것만으로
  구형 client의 의미 호환은 보장되지 않는다. Code/Template/Plugin/DB의 검증된 bundle로 복원한다.
- old dev의 done 요청은 result를 포함하므로 isNoopTransition의 무해한 성공 조건에도 해당하지
  않을 수 있다. new rule 이전 템플릿·스텁을 호환성 검사 없이 함께 운영하지 않는다.

## Definition of Done

- [ ] Core §A–§F만 구현, Phase 2/제외 기능 혼입 없음.
- [ ] 필수 앵커·상태6종·legacy/default·version 고정·GET 무쓰기 보존.
- [ ] Report/run/entry·verify/ok·report/ok 성공과 보류 비성공을 V2/V3으로 증명.
- [ ] 반복/다른 항목/standalone/reopen/ABA/경합 격리·이전 stepId outcome 거부·실패 transaction zero-write를 V4/V5로 증명.
- [ ] 현재 gateEntry만 승인/원자적 소비, 과거 감사 이벤트·같은 clock·오래된 웹/session 요청의 재승인 금지와 legacy 보존을 V3–V7로 증명.
- [ ] Inbox의 동일 snapshot 잠금 보존·새 gate/entry/legacy CAS snapshot의 잠금 초기화·오래된 승인 응답 격리를 V6의 model/배선/실화면에서 증명.
- [ ] done/backlog/acceptedAt·사람gate·validation/verify·selected-out/cap을 실제 목적지에서 검증.
- [ ] owner-wide 마지막1자리 동시 개설·무쓰기 패자·cap 중 정확한 item/무binding PM run 재개와 기존 head 우선순위를 V5/V7로 증명.
- [ ] 주입 가능한 개설·access 경계와 createRun 실패 전파·재사용 run의 현재 step/body/binding 일치를 V4/V5/V7/V9로 증명.
- [ ] hintFor/JSON/스텁/Inbox/승인의 key·entry·step echo·gateEntry·서버 format 계약과 legacy 무entry 재개, 고정 대본 비순환 경로·pipeline done 안내와 게이트0개 필수인수 경고·Scout 별칭/반복 안내를 V6–V8로 증명.
- [ ] UI/copy/client/plugin/lib/private stub/instruction의 동일 계약·본문 비유출 확인.
- [ ] V1–V9와 check/test/test:web/test:templates/verify:fsd/test:architecture/build 통과.
- [ ] private8실패를 accepted 의존계약으로 닫고 격리 DB·실화면·배포 bundle 증거 확보.
- [ ] 실제 구현 PR/commit/private 판/수행 결과로 metadata·Verification Results 갱신.

## Completion or Closure Notes

1단계(Core)는 `ce19203`으로 커밋됐고 작업 트리는 깨끗하다. 다만 **문서는 미승인**이다 —
front matter의 `approved-by`·`approved-at`·`approval-scope`가 비어 있다. `stage`는
`awaiting-approval`이다 — README의 정의상 "검토와 승인 요청이 가능한 상태"이지 승인이 아니다.
`status`는 `pending`을 유지하며 `active/`에 둔다.
남은 항목은 「구현 현황 — 2026-09-18 재검토」의 처리 순서에 있다. `completed/`로 옮기는 것은
승인과 그 항목들의 종료 뒤다. 구현 커밋의 존재를 승인으로 기록하지 않는다.

## Review Checklist

- [x] 초안의 phase 혼재·in_review 누락·실패 보고 오완료·provenance 누락·불완전 inventory·
  재배포/롤백/검증 목적지 부족을 문서에 수정했다.
- [x] Core/Phase 2/Approval-after/Out of scope를 요구·inventory·steps·runtime·verification·DoD에 전파했다.
- [x] 현재 code/architecture를 근거로 사용하고 과거 archive·미승인 metadata·원장을 보존했다.
- [x] snippet의 예시/신규 필드 계약·신규 목적지를 구별하고 결정용 TBD를 Core에 남기지 않았다.
- [x] PowerShell 명령·구조/body 목적지·기대 결과와 DB 쓰기의 별도 배포 전제를 명시했다.
- [x] 2026-09-17 새 검토에서 개설 count/create 경합·개요의 cap 재개 차단·서버 hint/게이트0개 안내·old stub와 standalone 구별을 보완하고 V5–V8/DoD에 전파했다.
- [x] 같은 검토의 전체 재독에서 개설 결과·현재 step·격리 DB 주입/access 재사용 경계를 명시하고 이미 done인 무쓰기 noop의 보존을 V3/V5/DoD까지 맞췄다.
- [x] legacy의 새 스텁 재개가 필수 entry 검사에 막히지 않도록 dispatch의 서버 format과 조건부 entry 계약을 JSON·hint·body·V8·DoD에 맞췄다.
- [x] 2026-09-17 후속 전체 검토에서 같은 run의 이전 단계 outcome 오결합·신형 gate의 과거 승인/오래된 요청 재사용·항목 생성 전 PM의 cap 재개 누락을 stepId/gateEntry/hasResumablePmRun 계약으로 닫고 inventory·왕복 경로·steps·V3–V8·DoD에 전파했다.
- [x] 같은 날짜 새 전체 검토에서 Inbox의 승인 성공 잠금이 새 gate 회차 Props에도 남는 경로를 gateCardKey→GateCardLock 재마운트 계약으로 보완하고 runtime·artifact·inventory·steps·V6·DoD에 전파했다.
- [ ] 구현·배포 합격 조건: 아직 수행하지 않음.
