---
# Metadata. status value는 proposals/README.md의 세 상태만 사용합니다.
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-10"
approved-by: "user:Sangeok"
approved-at: "2026-10-15"
approval-scope: "실제 코드 구현과 후속 진행 지시에 따른 Phase 1–6 통합·검증·운영 배포. 사용자 확인 운영 DB에 maintenance·복원 가능한 백업·A → nullable 서버 → B → 필수 서버 순서를 적용한다."
completed-at: "2026-10-16"
verification-summary: "Phase 1–6 구현·격리 검증과 A/B 운영 전환 완료. docs/test-reports/completed/2026-10-16-multiple-pipelines-production-acceptance.md 참조."
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/architecture/protocol.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-09-10-configurable-pipeline.md"
  - "docs/proposals/completed/2026-10-04-pipeline-agent-slots.md"
---

# 여러 파이프라인과 파이프라인 합성

## 구현 진행 기록

2026-10-15 사용자 구현 지시로 Phase 1–5를 구현하고 [PR #163](https://github.com/Sangeok/stagekeeper/pull/163)을 dev에 병합했다. 후속 진행 지시에 따라 Phase 6 [PR #164](https://github.com/Sangeok/stagekeeper/pull/164)도 A 서버 운영 인수 뒤 병합했다. 2026-10-16(KST) 운영 DB 백업·실제 복원·A/B/rollback 리허설, 요청 차단·drain, A → nullable 서버 → B → 필수 서버 배포를 완료하고 `stagekeeper.dev`를 재개했다. [운영 인수 보고서](../../test-reports/completed/2026-10-16-multiple-pipelines-production-acceptance.md)가 최종 상태와 검증 한계를 기록한다. [첫 구현 보고서](../../test-reports/completed/2026-10-16-multiple-pipelines-implementation.md)와 [cleanup 보고서](../../test-reports/completed/2026-10-16-multiple-pipelines-cleanup.md)는 로컬 검증 근거다. 아래 Before·대조 이력은 구현 전 기준선을 보존한 기록이다.

## Summary

지금은 프로젝트마다 그래프가 하나뿐이다. 이 제안은 프로젝트 안에 **이름 붙은 파이프라인을 여러 개** 두고, 한 파이프라인이
다른 파이프라인을 **자기 순서 안에 연결해 쓰게** 한다. 예를 들면 `기능 개발 = [계획] → implement → [검증] → accept` 같은 식이다.
파이프라인에는 종류가 없다. 항목에 붙일 수 있는지는 **펼친 결과에 지금의 `validateGraph`를 돌려** 계산한다.

저장 구조는 둘로 나눈다. 편집 원본은 새 `PipelineDefinition`에 저장한다. 항목이 실제로 도는 그래프는 지금처럼 `PipelineVersion`에
"펼친 실행 판"으로 남긴다. 그래서 런·커서·원장·MCP 응답을 읽는 코드는 거의 그대로 둘 수 있다.

새 항목은 백로그 `type` 규칙에 따라 파이프라인을 고르고, 규칙이 없으면 기본 파이프라인으로 간다. `propose` 노드는 없애고
프로젝트 설정 "PM 자동 선택"(`autoProposeEnabled`)으로 옮긴다.

이 문서의 15개 결정은 2026-10-10 grilling 세션에서 사용자와 합의한 것이다.

related의 completed 제안 두 개는 결정 배경이다. 현재 구현을 위임하는 추가 명세가 아니며, 현재 구조와 보존 계약은 관련 architecture 문서와 실제 코드로 확인한다.

## Goal

### 목표

grilling에서 합의한 결정을 그대로 요구사항으로 쓴다.

| # | 결정 | 이 문서에서 구현하는 곳 |
|---|---|---|
| 1 | 합성은 **불러오기**다. 연결 자리에 커서가 오면 그 파이프라인의 노드를 돌고, 끝나면 다음으로 간다 | §2 `expand` — 런 시작 시 펼친 결과에 고정 |
| 2 | 파이프라인에는 종류가 없다. 어떤 노드든 넣어 저장할 수 있고, 단독 검사는 내부 규칙만 본다 | §2 `validateDefinition` |
| 3 | 항목에 붙일 수 있는지 = 펼친 결과가 `validateGraph`를 통과하는가. 게이트 수는 상관없다 | §2 `recompose`, §4 실행 판 |
| 4 | 연결은 **최신 판을 따라간다**. 저장 시 직·간접 사용처를 다시 조립해 하나라도 깨지면 거부한다. 항목은 시작 시 펼친 결과에 고정된다 | §6 저장 |
| 5 | 파이프라인은 프로젝트에 속하고, 연결도 같은 프로젝트 안에서만 한다 | §3 스키마 |
| 6 | 새 항목은 `type` 규칙 → 기본 파이프라인 순으로 정한다. 웹에서는 규칙 결과가 미리 선택된 상태로 바꿀 수 있다 | §5 `propose` |
| 7 | `propose` 노드를 없애고 프로젝트 설정 "PM 자동 선택"으로 옮긴다. 옛 판은 호환해서 읽고, 기존 프로젝트는 현재 판에 `propose`가 있으면 켠다 | §3 migration, §4 head |
| 8 | 이음매 게이트는 연결하는 쪽도 선언할 수 있다. 펼친 결과의 게이트는 합집합이고, 이음매 게이트는 연결에 붙여 저장한다 | §2 `expand` |
| 9 | 몇 단계든 연결할 수 있다. 순환은 거부하고, 같은 파이프라인이 두 번 들어가면 기존 중복 검사가 막는다 | §2 `expand`·`composedReason` |
| 10 | Free는 기본 파이프라인 하나만 쓴다. Pro·Max는 개수 제한이 없다. 다운그레이드는 현행 동작을 따른다 | §11 |
| 11 | 삭제는 없고 보관만 있다. 쓰이는 곳이 있으면 보관을 거부한다 | §7 |
| 12 | 실패 자동 복구는 범위 밖이다 | 비목표 |
| 13 | Proposed 상태일 때만 소유자가 항목의 파이프라인을 바꿀 수 있다. 바꾸면 다시 고정하고 원장에 이벤트로 남긴다 | §5 `changePipeline` |
| 14 | 미결 2건 상한은 프로젝트 전체 기준을 유지한다 | 변경 없음(`transitions.mjs:39`) |
| 15 | 편집기는 접힌 블록이 기본이고 펼친 결과 토글이 있다. 보드에는 항목이 탄 파이프라인 이름을 보여준다 | §8 웹 |

### 비목표

- **실패 자동 복구.** 검증·인수 실패 뒤의 자동 Reopen과 retry는 별도 제안에서 다룬다(결정 12). `impl-verify`·`qa`·인수 실패와 Reopen은 지금처럼 사람이 한다.
- **계정 범위 공유.** 다른 프로젝트의 파이프라인을 연결하지 않는다(결정 5). "다른 프로젝트에서 복사"도 이번 범위가 아니다.
- **넘기기·상속 합성.** A가 끝난 뒤 B로 넘기거나 A를 상속해 B를 만드는 방식은 하지 않는다(질문 1에서 (b)와 (c)를 기각).
- **상한 우회 우선순위.** 핫픽스를 미결 2건 상한과 상관없이 끼워 넣는 기능은 하지 않는다(결정 14).
- **MCP·플러그인 계약 변경.** `pipeline_next`·`board_propose`·`gate_approve`의 입력과 출력 모양은 바꾸지 않는다(§9). 플러그인 판도 올리지 않는다.
- **실행 중 그래프 교체.** Proposed가 아닌 항목의 파이프라인은 바꾸지 않는다(결정 13의 (c)를 기각).
- **이름 중복 DB 강제.** 이름 중복은 서비스에서 잠금 아래 막는다. Prisma가 표현하지 못하는 부분 unique 인덱스는 만들지 않는다.

### 성공 기준

모두 관찰할 수 있는 동작이다. 검증 목적지는 Verification Plan에 있다.

1. Pro 프로젝트에서 `impl-verify → qa`만 있는 파이프라인을 저장할 수 있다. 이 파이프라인에는 실행 판(`PipelineVersion`)이 생기지 않는다.
2. `[계획] → implement → [검증] → accept`를 저장하면 펼친 결과로 실행 판이 생긴다. 이후 올라오는 항목의 런은 그 판의 `nodes`로 돈다.
3. 검증 파이프라인에 `before-qa`를 더하면 기능 개발에 새 실행 판이 생긴다. 이미 돌던 항목의 `PipelineRun.versionId`는 바뀌지 않는다.
4. 기능 개발을 깨는 검증 변경(예: `verify`를 넣어 implement 뒤로 가게 함)은 `Saving would break <이름>: …`로 거부되고, 정의 행도 판 행도 쓰이지 않는다.
5. 순환(A → B → A)과 보관된 파이프라인으로의 연결은 저장할 때 거부된다.
6. `fix → 핫픽스` 규칙이 있으면, PM이 올린 `type: fix` 항목의 런은 핫픽스의 실행 판에 고정된다. `type`이 비었거나 규칙이 없으면 기본 파이프라인에 고정된다.
7. 미결 여유가 있고 백로그 후보가 남아 있을 때 PM 자동 선택이 꺼지면 head가 `{ action: "none", reason: AUTO_PROPOSE_DISABLED_REASON }`을 돌려준다. 켜져 있으면 지금과 같이 PM을 디스패치한다.
8. migration A 뒤 모든 기존 프로젝트에 대해 다음이 성립한다.
   - `Default` 파이프라인이 생긴다.
   - 판이 있는 프로젝트는 최신 판에서 `propose`를 뺀 그래프가 정의 v1이 된다. 판이 없는 프로젝트는 정의 없이 기본 설정 true를 유지하며 첫 성공 쓰기에 정의 v1을 만든다.
   - `autoProposeEnabled`는 그 판에 `propose`가 있었는지와 같다.
   - 기존 `PipelineRun.versionId`는 바뀌지 않는다.
9. 항목이 Proposed 상태이고 그 런에 묶인 `AgentRun`이 없을 때만 파이프라인을 바꿀 수 있다. 바꾸면 변경 감사 TransitionEvent 한 줄이 남고, 새 그래프의 무게이트 경계가 전진하면 기존 자동 전이 이벤트도 별도로 남는다.
10. 기본 파이프라인, 다른 파이프라인이 연결한 파이프라인, 규칙 대상 파이프라인은 보관이 거부되고, 사유에 쓰이는 곳이 나온다.
11. Free에서는 정의 저장, 만들기, 이름 바꾸기, 보관, 규칙 변경, 기본 변경, Automatic picking 변경이 `PIPELINE_EDIT_PLAN_GATE`로 거부된다. 기본 파이프라인으로 항목이 도는 동작은 지금과 같다.
12. `npm run check`가 통과한다(이 명령은 `plugin/lib` 동기화를 검사한다). 플러그인 쪽 `pipeline_next` 검증기(`packages/core/watch.mjs`)의 기존 시험도 수정 없이 통과한다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 마이그레이션, 데이터 구조, 서버 계약(웹 액션 입력)이 바뀐다.
- 30개가 넘는 파일이 바뀐다(코어·스키마 약 6, 서버 약 8, 웹 약 20, 문서 5, 시험은 별도).
- 롤백이 단순 revert로 끝나지 않는다. 옛 서버는 "프로젝트 최대 판 = 현재 그래프"로 읽기 때문에 데이터 보정이 필요하다(§Risks).

범위 합의(2026-10-10): 문서는 하나로 쓴다. 코드 수준 Before/After는 코어·스키마·서버까지만 쓰고, 웹 UI와 문서는 계약·컴포넌트 수준으로 적는다.

## Current State

### 배경/동기 (사용자 제공)

- 파이프라인을 여러 개 두고, 계획·검증 같은 묶음을 따로 만들어 기능 개발 같은 파이프라인에 연결해 재사용하고 싶다.
- 나중에는 사람의 수락이 전혀 필요 없는 완전 자동 파이프라인도 만들고 싶다. 이것은 지금도 게이트를 0개로 두면 가능하다.
  `accept`는 사람 버튼이 아니라 main-loop의 `report_submit` 증거다(`docs/architecture/invariants.md:55`).

### 코드에서 확인한 현재 구조

이 절의 Before·줄 번호와 구현 기준은 **원격 `dev`의 `c60a906`**이다(2026-10-14 `git ls-remote --heads origin dev`로 확인). 문서를 검토하는 현재 checkout은 `harness/plugin-clean-code`의 `6d16410`에 별도 미커밋 변경이 있는 상태다. 이 checkout에는 dev의 보류 항목 제안 거부, `save-pipeline-input.ts`, core의 `Plan` 타입 변경이 아직 없으므로, 아래 Before를 이 checkout에 그대로 적용하지 않는다. 구현은 준비 절차대로 실제 원격 dev를 확인·fetch한 별도 worktree에서 시작하며, 두 작업의 겹치는 파일은 Risks 7의 머지 규칙을 따른다. 아래 표는 구현 완료를 뜻하지 않는다.

| 사실 | 근거 |
|---|---|
| 그래프는 프로젝트마다 하나다. 판은 `projectId`로 쌓이고, 현재 판은 프로젝트의 최대 `version`이다 | `prisma/schema.prisma:308`·`:319`, `src/server/pipeline/run-query.ts:21` `ensureCurrentVersion` |
| 노드 종류는 9개로 고정이고, `plan · implement · accept`는 반드시 있어야 한다 | `packages/core/pipeline.mjs:7`·`:8`, `validateGraph` `:54` |
| `propose`는 맨 앞에만 올 수 있다. 런에서는 아무 일도 하지 않는다(`nodeDone`이 언제나 `true`) | `pipeline.mjs:64`, `:114` |
| head가 PM을 부를지는 "현재 판에 `propose`가 있는가"로 정한다 | `run-query.ts:165`, `run-rules.ts:103`·`:123` |
| 항목은 `board.propose`로 생기고, 같은 트랜잭션에서 현재 판에 고정된 런이 머리에 선다. before-plan 게이트가 없으면 곧바로 planning으로 넘어간다 | `board-query.ts:300`·`:319` |
| `board.propose`는 최신 행이 `on_hold`인 key를 거부한다(재개는 소유자만). head의 후보 수 `availableBacklog`는 최신 행이 미결이거나 보류인 항목을 세지 않는다 | `board-rules.ts` `decidePropose`·`countPickable`, `board-query.ts` `propose`·`availableBacklogCount`, `tests/server/integration/hold-propose.test.ts` |
| 런의 `versionId`는 런을 만들 때 한 번만 쓰이고, 이후 어떤 경로에서도 바뀌지 않는다 | `run-query.ts:50`이 유일한 쓰기 지점(`versionId` 검색) |
| 런·커서·원장을 읽는 코드는 모두 `run.version.{nodes,gates,format,id,version}`를 본다 | `board-query.ts:629`·`:634`·`:649`, `run-query.ts:62`–`:141`, `codex-handoff-query.ts:9`, `agents/run-query.ts:46` 등 |
| 저장은 잠금 없이 `expectedVersion`과 unique 제약으로 낙관적으로 처리한다. 웹 액션의 입력 검사는 서버 전용 zod 스키마다 | `src/server/pipeline/version-save-query.ts:8`, `src/fsd/features/edit-pipeline/model/save-pipeline-input.ts` `savePipelineInputSchema` |
| 편집 액션은 Free를 거부한다(`pipelineEdit: false`) | `src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts:17`, `packages/core/entitlement.mjs:15` |
| 페이지 GET은 판을 만들지 않는다 | `docs/architecture/invariants.md:81`, `docs/conventions/product-copy.md:1262` |
| `packages/core/*.mjs`는 통째로 `plugin/lib`에 복사되고 `npm run check`가 동기화를 검사한다. 플러그인 런타임은 `lib/pipeline.mjs`를 import하지 않는다 | `scripts/plugin-lib.mjs`, `package.json:12`, `plugin/bin`·`plugin/runtime`의 `../lib/` import 목록 |
| 플러그인 감시기는 `pipeline_next`의 `format`을 `null`과 `"slots-v1"`만 받고, `version`은 양의 정수인지만 본다. 모르는 필드는 거부하지 않는다 | `packages/core/watch.mjs`의 `validateFormat`·`validateItem` |
| 백로그 `type`은 `feat | fix | refactor | docs` 중 하나이거나 null이다 | `packages/core/backlog.mjs:2`, `schema.prisma:170` |
| 상태를 Proposed로 되돌리는 전이는 없다 | `packages/core/transitions.mjs` `RULES` |

### grilling 때 말씀드린 내용 정정

결정 13을 정할 때 "Proposed 상태는 아직 항목 노드에서 에이전트가 돈 적이 없는 시점"이라고 말씀드렸는데, 정확하지 않았다.

- 프로젝트 슬롯(`doc-auditor`·`feature-scout`)은 `plan` 앞에도 둘 수 있다(`packages/core/pipeline.test.mjs`의 "slot execution isolation" 그래프).
  그런 그래프에서는 Proposed 상태에서도 슬롯 에이전트가 돌 수 있다.
- 그래서 바꿀 수 있는 조건을 **"Proposed이고, 이 런에 묶인 `AgentRun`이 없다"**로 정한다(§5).
- before-plan 게이트도 없고 plan 앞 슬롯도 없는 파이프라인은 `propose` 직후 바로 planning으로 넘어간다(`board-query.ts:318` 주석).
  이런 파이프라인에는 **바꿀 수 있는 순간이 아예 없다**. 사용자가 Proposed 조건 유지를 확정했으므로 planning으로 창을 넓히지 않는다.

## Scope

포함 범위:

- 코어: 정의 단독 검사, 펼치기, 사용처 계산, 재조립 판정, `type` 라우팅. `validateGraph`의 순서 규칙을 표 하나로 정리하고 `propose`를 거부한다.
- 스키마: `Pipeline`·`PipelineDefinition`·`PipelineRule`, `Project.autoProposeEnabled`·`defaultPipelineId`, `PipelineVersion.pipelineId`. migration A(추가와 backfill)와 migration B(NOT NULL).
- 서버:
  - 실행 판 해석: 기본 파이프라인 지연 생성
  - 정의 저장: 잠금, 재조립, 실행 판 쓰기
  - head의 설정 전환
  - `propose` 라우팅
  - 항목 파이프라인 변경
  - 보관·이름·기본·규칙·자동 선택 설정
- 웹(계약 수준):
  - Pipeline 탭: 목록, 연결 블록, 펼친 결과 토글, 규칙·기본·자동 선택
  - Put on the board 선택기
  - 보드와 항목 화면의 파이프라인 이름, 항목 화면의 파이프라인 변경
  - 배너와 History 문구
- 문서: `protocol.md`, `invariants.md`, `system-overview.md`, `verification.md`(새 리허설 스크립트 행), `product-copy.md`.

제외 범위:

- 비목표에 적은 모든 것.
- private 템플릿(`plugin/templates`). 런북은 `propose` 노드를 언급하지 않는다(`plugin/templates/en/CLAUDE.runbook.md:138`–`:141`).
  `plugin/templates/en/agents/pm.md:93`의 "the pipeline where the Pipeline tab has no gate"도 계속 참이다.
- 화면의 세부 배치와 시각 디자인. 웹 단계(Phase 4) 전에 따로 확정한다.

## 대안 분석

### 저장 구조

**Option A: `PipelineVersion`에 연결이 섞인 정의를 저장하고, 런에 펼친 결과 스냅숏을 둔다**

- 장점: 테이블이 하나 덜 생긴다.
- 단점: 런·커서·원장·MCP가 `run.version.nodes/gates`를 읽는 곳(Current State 표)을 전부 "런의 스냅숏"을 읽도록 바꿔야 한다.
  `actorRef = pipeline:<versionId>`(`board-query.ts:634`)가 가리키는 판도 펼친 그래프가 아니게 된다.

**Option B: 편집 원본(`PipelineDefinition`)과 실행 판(`PipelineVersion` = 펼친 그래프)을 나눈다 — 선택**

- 장점:
  - `PipelineVersion`의 의미("항목이 실제로 도는 그래프")가 그대로 남는다. 그래서 런을 읽는 모든 코드와 `pipeline_next`의 `version`·`format`이 그대로다.
  - 저장할 때 이미 재조립 검사(결정 4)를 하므로, 그 결과를 실행 판으로 쓰면 런 시작은 지금처럼 "그 파이프라인의 최신 판 고르기"가 된다.
  - 조각에는 실행 판이 없으므로, "항목에 붙일 수 있는가"를 DB에서 판의 존재로 바로 읽을 수 있다.
- 단점: 정의와 판이 둘 다 생겨서, 한 번 저장할 때 여러 행을 쓴다. 대신 같은 잠금 아래 한 트랜잭션에서 쓴다.

**Option C: 펼치지 않고 실행 중에 커서가 블록 스택을 따라간다**

- 장점: 정의를 고쳐도 판 행이 늘지 않는다.
- 단점: 커서가 스택이 되면서 `advance`, `cursorForStatus`, 게이트 승인, entry 결합을 전부 다시 설계해야 한다. 결정 4("항목은 시작 시 펼친 결과에 고정")와도 맞지 않는다.

**선택: Option B.** 런 쪽 코드를 건드리지 않는 것이 가장 큰 위험 절감이다. 결정 4가 이미 "저장 시 재조립"을 요구하므로 추가 비용도 작다.

### 실행 판 번호

**Option 1: 파이프라인마다 1부터 매긴다** (`@@unique([pipelineId, version])`)

- 장점: 번호가 파이프라인별로 읽힌다.
- 단점: 기존 `@@unique([projectId, version])`를 바꿔야 한다. migration과 새 서버 배포 사이에 옛 서버가 돌면, 옛 서버의 "최대+1" 저장과 새 unique가 충돌한다.

**Option 2: 프로젝트 안에서 파이프라인을 가로질러 일련번호를 매긴다** (기존 unique 유지) — **선택**

- 장점: 기존 unique 제약을 유지해 프로젝트 일련번호와 MCP 식별자 계약을 보존한다. 구·신 서버의 동시 운영은 허용하지 않는다(배포 절). `pipeline_next.version`은 원래 양의 정수 식별자일 뿐이다(`watch.mjs` `validateItem`).
- 단점: 화면에 판 번호를 그대로 보여주면 건너뛰는 번호가 보인다. 그래서 Pipeline 탭은 **정의 판**(파이프라인마다 1부터)을 보여준다.

### PM 자동 선택 설정의 권한

- 지금은 `propose` 노드를 빼는 것이 그래프 편집이라 Pro·Max만 할 수 있다.
- 사용자 확인으로 **Pro·Max만** 변경 가능하도록 확정했다. 자동 스카우트의 모든 플랜 권한은 별도로 유지한다.

## Proposal

### 용어

| 용어 | 뜻 |
|---|---|
| 정의(definition) | 파이프라인의 편집 원본. `steps`(노드 id 또는 `pipeline:<id>`)와 `gates`(`before-<step>`) |
| 연결(reference) | 정의의 step `pipeline:<pipelineId>` |
| 이음매 게이트 | 연결 앞 게이트 `before-pipeline:<pipelineId>`. 펼치면 그 블록의 첫 노드 앞 게이트가 된다 |
| 펼친 결과(expansion) | 연결을 재귀로 풀어 `{ nodes, gates }`로 만든 그래프 |
| 실행 판(runnable version) | 펼친 결과가 `validateGraph`를 통과한 파이프라인의 `PipelineVersion` 행. 항목은 이것에 고정된다 |
| 조각(fragment) | 펼친 결과가 `validateGraph`를 통과하지 못하는 파이프라인. 실행 판이 없고 연결해서만 쓴다 |

### 1. 데이터 흐름

```
편집기 ──savePipeline──▶ savePipelineDefinition (User→Project 잠금)
                           ├─ validateDefinition(초안)                   단독 검사
                           ├─ recompose(바뀐 것 + 직·간접 사용처)       펼치기·구조 검사·validateGraph
                           ├─ PipelineDefinition +1 행
                           └─ 실행 판이 바뀐 파이프라인마다 PipelineVersion +1 행

pm/웹 ──board.propose──▶ routePipeline(type, rules, default) 또는 웹 선택
                           └─ ensureRunIn(tx, …, pipelineId) → 그 파이프라인의 최신 PipelineVersion에 고정
                                                          (이후 런·커서·원장·MCP는 지금과 같음)
```

### 2. 코어 — `packages/core/pipeline.mjs`

새 export는 모두 순수 함수이고 브라우저에서도 안전하다. 웹 편집기도 같은 함수로 미리보기를 계산한다.

**`defaultGraph`** (`pipeline.mjs:45`–`:50`)

Before:

```js
// 선택 노드 — 기본 그래프에 넣지 않는다(Pipeline 탭에서 넣는다). scout·qa는 서버가 모르는 harness.json 설정에 달렸고, impl-verify는 항목마다 검증 비용을 더한다.
export const OPT_IN_NODES = ["scout", "impl-verify", "qa"];
// 기본 그래프 = 골격에서 플랜 밖 노드와 opt-in 노드를 뺀 것 + 게이트 둘. Free: propose·plan·implement·accept (verify·doc-audit 없음).
export function defaultGraph(plan) {
  return { nodes: NODE_KINDS.filter((k) => nodeAllowed(plan, k) && !OPT_IN_NODES.includes(k)), gates: [...DEFAULT_GATES] };
}
```

After:

```js
// 선택 노드 — 기본 그래프에 넣지 않는다(Pipeline 탭에서 넣는다). scout·qa는 서버가 모르는 harness.json 설정에 달렸고, impl-verify는 항목마다 검증 비용을 더한다.
export const OPT_IN_NODES = ["scout", "impl-verify", "qa"];
// 정의에 넣을 수 있는 노드 = 골격에서 propose를 뺀 것. propose는 옛 판을 읽으려고 NODE_KINDS에 남고, 지금은 프로젝트 설정(autoProposeEnabled)이다.
export const STEP_KINDS = NODE_KINDS.filter((k) => k !== "propose");
// 기본 그래프 = 정의 노드에서 플랜 밖 노드와 opt-in 노드를 뺀 것 + 게이트 둘. Free: plan·implement·accept (verify·doc-audit 없음).
export function defaultGraph(plan) {
  return { nodes: STEP_KINDS.filter((k) => nodeAllowed(plan, k) && !OPT_IN_NODES.includes(k)), gates: [...DEFAULT_GATES] };
}
```

지켜야 할 불변식: `propose`가 빠진다는 점 말고는 지금 `defaultGraph(plan)`과 같은 노드를 같은 순서로 낸다.

**`validateGraph`** (`pipeline.mjs:53`–`:79`) — 순서 규칙을 표 하나로 모아서 정의 검사와 공유하고, `propose`를 거부한다.

Before:

```js
// 저장 전 검증. 사유는 화면에 그대로 보인다(product-copy.md §12).
export function validateGraph(graph, plan) {
  const { nodes, gates } = graph ?? {};
  if (!Array.isArray(nodes) || !Array.isArray(gates)) return { ok: false, reason: "graph must have nodes and gates" };
  if (![...nodes, ...gates].every((id) => typeof id === "string")) return { ok: false, reason: "slot and gate ids must be strings" };
  if (new Set(nodes).size !== nodes.length) return { ok: false, reason: "a node appears twice" };
  for (const k of nodes) if (!NODE_KINDS.includes(k) && !PROJECT_AGENTS.includes(slotAgent(k))) return { ok: false, reason: `unknown node: ${k}` };
  for (const k of REQUIRED_NODES) if (!nodes.includes(k)) return { ok: false, reason: `${k} can't be removed` };
  for (const k of nodes) if (!nodeAllowed(plan, k)) return { ok: false, reason: `${k} is not on the ${plan} plan` };
  const planAt = nodes.indexOf("plan"), implementAt = nodes.indexOf("implement"), acceptAt = nodes.indexOf("accept");
  if (!(planAt < implementAt && implementAt < acceptAt)) return { ok: false, reason: "anchors must keep the order plan · implement · accept" };
  if (nodes.includes("propose") && nodes[0] !== "propose") return { ok: false, reason: "propose must be first" };
  if (nodes.includes("verify") && !(planAt < nodes.indexOf("verify") && nodes.indexOf("verify") < implementAt)) return { ok: false, reason: "verify must be between plan and implement" };
  if (nodes.includes("impl-verify") && !(implementAt < nodes.indexOf("impl-verify") && nodes.indexOf("impl-verify") < acceptAt)) return { ok: false, reason: "impl-verify must be between implement and accept" };
  if (nodes.includes("qa") && !(implementAt < nodes.indexOf("qa") && nodes.indexOf("qa") < acceptAt)) return { ok: false, reason: "qa must be between implement and accept" };
  if (nodes.includes("impl-verify") && nodes.includes("qa") && nodes.indexOf("impl-verify") > nodes.indexOf("qa")) return { ok: false, reason: "impl-verify must come before qa" };
  for (const [alias, agent] of [["doc-audit", "doc-auditor"], ["scout", "feature-scout"]]) {
    const slots = nodes.filter((id) => slotAgent(id) === agent);
    if (slots.includes(alias) && slots.length > 1) return { ok: false, reason: `don't mix ${alias} with ${agent} slots` };
  }
  if (new Set(gates).size !== gates.length) return { ok: false, reason: "a gate appears twice" };
  for (const g of gates) {
    const k = gateKind(g);
    if (k === null || k === "propose" || !nodes.includes(k)) return { ok: false, reason: `gate ${g} has no node after it` };
  }
  return { ok: true };
}
```

After:

```js
export const PROPOSE_SETTING_REASON = "propose is no longer a node — turn on Automatic picking in the Pipeline tab";

// 순서 규칙 — 두 노드가 다 있을 때만 본다. 표의 순서가 사유의 우선순위다(예전 validateGraph가 검사하던 순서).
// 앵커가 다 있는 그래프에서는 이 아홉 짝이 plan·verify·implement·impl-verify·qa·accept의 전순서를 이미 강제한다.
const ORDER = [
  ["plan", "implement", "anchors must keep the order plan · implement · accept"],
  ["implement", "accept", "anchors must keep the order plan · implement · accept"],
  ["plan", "verify", "verify must be between plan and implement"],
  ["verify", "implement", "verify must be between plan and implement"],
  ["implement", "impl-verify", "impl-verify must be between implement and accept"],
  ["impl-verify", "accept", "impl-verify must be between implement and accept"],
  ["implement", "qa", "qa must be between implement and accept"],
  ["qa", "accept", "qa must be between implement and accept"],
  ["impl-verify", "qa", "impl-verify must come before qa"],
];
const RANK = ["plan", "verify", "implement", "impl-verify", "qa", "accept"];
function orderReason(nodes) {
  for (const [first, then, reason] of ORDER) {
    const a = nodes.indexOf(first), b = nodes.indexOf(then);
    if (a >= 0 && b >= 0 && a > b) return reason;
  }
  // 조각에서만 걸리는 짝(예: [accept, plan]처럼 사이 노드가 없는 경우). 앵커가 다 있으면 위 아홉 짝이 먼저 같은 결론을 낸다.
  const ranked = nodes.filter((id) => RANK.includes(id));
  for (let i = 1; i < ranked.length; i++) {
    if (RANK.indexOf(ranked[i - 1]) > RANK.indexOf(ranked[i])) return `${ranked[i]} must come before ${ranked[i - 1]}`;
  }
  return null;
}
function aliasReason(nodes) {
  for (const [alias, agent] of [["doc-audit", "doc-auditor"], ["scout", "feature-scout"]]) {
    const slots = nodes.filter((id) => slotAgent(id) === agent);
    if (slots.includes(alias) && slots.length > 1) return `don't mix ${alias} with ${agent} slots`;
  }
  return null;
}
function gateReason(steps, gates) {
  if (new Set(gates).size !== gates.length) return "a gate appears twice";
  for (const g of gates) {
    const k = gateKind(g);
    if (k === null || !steps.includes(k)) return `gate ${g} has no node after it`;
  }
  return null;
}

// 항목에 붙일 수 있는 그래프인가 — 실행 판(펼친 결과)의 검증. 사유는 화면에 그대로 보인다(product-copy.md §12).
export function validateGraph(graph, plan) {
  const { nodes, gates } = graph ?? {};
  if (!Array.isArray(nodes) || !Array.isArray(gates)) return { ok: false, reason: "graph must have nodes and gates" };
  if (![...nodes, ...gates].every((id) => typeof id === "string")) return { ok: false, reason: "slot and gate ids must be strings" };
  if (new Set(nodes).size !== nodes.length) return { ok: false, reason: "a node appears twice" };
  for (const k of nodes) {
    if (k === "propose") return { ok: false, reason: PROPOSE_SETTING_REASON };
    if (!NODE_KINDS.includes(k) && !PROJECT_AGENTS.includes(slotAgent(k))) return { ok: false, reason: `unknown node: ${k}` };
  }
  for (const k of REQUIRED_NODES) if (!nodes.includes(k)) return { ok: false, reason: `${k} can't be removed` };
  for (const k of nodes) if (!nodeAllowed(plan, k)) return { ok: false, reason: `${k} is not on the ${plan} plan` };
  const reason = orderReason(nodes) ?? aliasReason(nodes) ?? gateReason(nodes, gates);
  return reason === null ? { ok: true } : { ok: false, reason };
}
```

지켜야 할 불변식: `propose`가 없는 모든 입력에 대해 Before와 같은 결과와 같은 첫 사유를 낸다. 근거는 두 가지다.

- 검사 순서가 같다: 중복 → 미지 → 필수 → 플랜 → 순서 → 별칭 → 게이트.
- `RANK` 대체 검사는 앵커가 다 있으면 걸리지 않는다.

`propose`가 들어 있는 입력만 새 사유로 거부된다. 이건 의도한 변경이다.

**새 export — 정의·연결·펼치기·재조립·라우팅** (`validateGraph` 아래에 추가)

```js
// 연결 step. 정의의 steps에 노드 id 대신 pipeline:<id>로 들어가고, 그 앞 게이트는 before-pipeline:<id>다(gateId가 그대로 만든다).
export const REF_PREFIX = "pipeline:";
export const isRef = (step) => typeof step === "string" && step.startsWith(REF_PREFIX);
export const refId = (step) => (isRef(step) ? step.slice(REF_PREFIX.length) : null);
export const refStep = (pipelineId) => `${REF_PREFIX}${pipelineId}`;

// 정의 하나의 단독 검사(저장 시). 앵커가 다 있는지는 보지 않는다 — 그건 펼친 결과의 validateGraph다.
// 연결이 가리키는 파이프라인이 있는지·순환인지는 펼칠 때(expand) 본다.
export function validateDefinition(definition, plan) {
  const { steps, gates } = definition ?? {};
  if (!Array.isArray(steps) || !Array.isArray(gates)) return { ok: false, reason: "pipeline must have steps and gates" };
  if (![...steps, ...gates].every((id) => typeof id === "string")) return { ok: false, reason: "step and gate ids must be strings" };
  if (steps.length === 0) return { ok: false, reason: "a pipeline needs at least one step" };
  if (new Set(steps).size !== steps.length) return { ok: false, reason: "a step appears twice" };
  for (const s of steps) {
    if (isRef(s)) {
      if (refId(s) === "") return { ok: false, reason: `unknown step: ${s}` };
      continue;
    }
    if (s === "propose") return { ok: false, reason: PROPOSE_SETTING_REASON };
    if (!NODE_KINDS.includes(s) && !PROJECT_AGENTS.includes(slotAgent(s))) return { ok: false, reason: `unknown node: ${s}` };
    if (!nodeAllowed(plan, s)) return { ok: false, reason: `${s} is not on the ${plan} plan` };
  }
  const own = steps.filter((s) => !isRef(s));
  const reason = orderReason(own) ?? aliasReason(own) ?? gateReason(steps, gates);
  return reason === null ? { ok: true } : { ok: false, reason };
}

// 연결을 반복 스택으로 펼친다. 유효한 중첩 깊이에 임의 상한을 두지 않는다.
// definitions는 단독 검사를 통과한 비보관 정의 묶음이다. 연결·중복은 여기서 검사한다.
export function expand(pipelineId, definitions, path = []) {
  const fail = (id, reason) => ({ ok: false, pipelineId: id, reason });
  const missing = "it uses a pipeline that is archived or missing";
  const loop = "pipelines can't use each other in a loop";
  if (!Object.hasOwn(definitions, pipelineId)) return fail(pipelineId, missing);
  const active = new Set(path);
  if (active.has(pipelineId)) return fail(pipelineId, loop);
  const frameOf = (id, junction) => ({ id, junction, index: 0, nodes: [], gates: new Set(), seen: new Set() });
  const stack = [frameOf(pipelineId, false)];
  active.add(pipelineId);
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const definition = definitions[frame.id];
    if (frame.index === definition.steps.length) {
      stack.pop();
      active.delete(frame.id);
      const graph = { nodes: frame.nodes, gates: [...frame.gates] };
      if (stack.length === 0) return { ok: true, graph };
      const parent = stack[stack.length - 1];
      if (frame.junction) parent.gates.add(gateId(frame.nodes[0]));
      for (const node of frame.nodes) {
        if (parent.seen.has(node)) return fail(parent.id, "a node appears twice");
        parent.seen.add(node);
        parent.nodes.push(node);
      }
      for (const gate of frame.gates) parent.gates.add(gate);
      continue;
    }
    const step = definition.steps[frame.index++];
    const gated = definition.gates.includes(gateId(step));
    if (!isRef(step)) {
      if (frame.seen.has(step)) return fail(frame.id, "a node appears twice");
      frame.seen.add(step);
      if (gated) frame.gates.add(gateId(step));
      frame.nodes.push(step);
      continue;
    }
    const id = refId(step);
    if (!Object.hasOwn(definitions, id)) return fail(frame.id, missing);
    if (active.has(id)) return fail(frame.id, loop);
    active.add(id);
    stack.push(frameOf(id, gated));
  }
  return fail(pipelineId, missing);
}

// 펼친 결과의 구조 검사 — 앵커가 다 있는지는 보지 않는다(항목에 붙일 수 있는지는 validateGraph).
export function composedReason(graph) {
  if (new Set(graph.nodes).size !== graph.nodes.length) return "a node appears twice";
  return orderReason(graph.nodes) ?? aliasReason(graph.nodes);
}

// 이 파이프라인을 직·간접으로 쓰는 파이프라인들(자기 자신 제외). 순환이 있어도 끝난다.
export function usersOf(pipelineId, definitions) {
  const found = new Set(), queue = [pipelineId];
  while (queue.length > 0) {
    const target = refStep(queue.shift());
    for (const [id, definition] of Object.entries(definitions)) {
      if (id !== pipelineId && !found.has(id) && definition.steps.includes(target)) { found.add(id); queue.push(id); }
    }
  }
  return [...found];
}

// 저장 판정. changedId의 정의를 바꾼 definitions에서, 그것과 그것을 쓰는 모든 파이프라인을 다시 펼친다.
// mustRun(실행 판이 있거나 기본·규칙 대상인 파이프라인)은 펼친 결과가 validateGraph를 통과해야 한다 — 붙을 수 있던 것은 계속 붙을 수 있어야 한다.
// runnable[id] = 항목에 붙일 수 있게 된 펼친 그래프(null = 조각).
export function recompose(changedId, definitions, mustRun, plan) {
  const runnable = Object.create(null);
  for (const id of [changedId, ...usersOf(changedId, definitions)]) {
    const expanded = expand(id, definitions);
    if (!expanded.ok) return expanded;
    const structural = composedReason(expanded.graph);
    if (structural !== null) return { ok: false, pipelineId: id, reason: structural };
    const full = validateGraph(expanded.graph, plan);
    if (!full.ok && mustRun.includes(id)) return { ok: false, pipelineId: id, reason: full.reason };
    runnable[id] = full.ok ? expanded.graph : null;
  }
  return { ok: true, runnable };
}

// 새 항목이 붙을 파이프라인 — type 규칙이 있으면 그것, 없거나 type이 비었으면 기본(결정 6).
export function routePipeline(type, rules, defaultPipelineId) {
  return type !== null && Object.hasOwn(rules, type) ? rules[type] : defaultPipelineId;
}

export const AUTO_PROPOSE_DISABLED_REASON = "Automatic picking is off. Put an item on the board from the Backlog tab, or turn it on in the Pipeline tab.";

// Free에서 파이프라인 편집·설정과 Automatic picking 변경을 막는 문장. src/server는 FSD를 import하지 않으므로(fsd.md) 서비스·웹 action·레일이 함께 쓰도록 core가 소유한다.
export const PIPELINE_EDIT_PLAN_GATE = "Pipeline editing opens on Pro. The default pipeline stays as is.";
```

`expand`의 루트는 호출자가 `definitions`에 있는 id로 넘긴다. `recompose`와 서버는 비보관 파이프라인만 넣는다.

**`packages/core/pipeline.d.mts`** — 이 파일만이 그 모듈의 형을 정한다(파일 머리 주석). 다음을 추가한다.

```ts
export type Definition = { steps: string[]; gates: string[] };
export type DefinitionInput = { readonly steps: readonly string[]; readonly gates: readonly string[] };
export type Definitions = Readonly<Record<string, DefinitionInput>>;
export type Expansion = { ok: true; graph: Graph } | { ok: false; pipelineId: string; reason: string };
export type Recompose = { ok: true; runnable: Record<string, Graph | null> } | { ok: false; pipelineId: string; reason: string };

export const STEP_KINDS: string[];
export const PROPOSE_SETTING_REASON: string;
export const AUTO_PROPOSE_DISABLED_REASON: string;
export const PIPELINE_EDIT_PLAN_GATE: string;
export const REF_PREFIX: "pipeline:";
export function isRef(step: unknown): step is string;
export function refId(step: unknown): string | null;
export function refStep(pipelineId: string): string;
export function validateDefinition(definition: unknown, plan: string): GraphValidation;
export function expand(pipelineId: string, definitions: Definitions, path?: readonly string[]): Expansion;
export function composedReason(graph: GraphInput): string | null;
export function usersOf(pipelineId: string, definitions: Definitions): string[];
export function recompose(changedId: string, definitions: Definitions, mustRun: readonly string[], plan: string): Recompose;
export function routePipeline(type: string | null, rules: Readonly<Record<string, string>>, defaultPipelineId: string): string;
```

`plugin/lib/pipeline.mjs`는 `npm run sync:plugin-lib`로 다시 복사한다. `.d.mts`는 미러되지 않는다(`scripts/plugin-lib.mjs`의 `isDeliverable`).

`PIPELINE_EDIT_PLAN_GATE`의 문장은 지금 `src/fsd/features/edit-pipeline/model/plan-gate.ts`가 소유한다. 그 파일은 `export { PIPELINE_EDIT_PLAN_GATE } from "@harness/core/pipeline.mjs";`로 core의 상수를 다시 내보낸다. 그래서 기존 import(`edit-pipeline.server.ts`·`pipeline-rail.tsx`)는 그대로 둔다. 문장은 바꾸지 않는다(product-copy §12의 `— (pipeline save, plan)` 행).

### 3. 스키마와 migration

**`Project`** (`schema.prisma:37`–`:68`)

Before:

```prisma
model Project {
  id           String          @id @default(cuid())
  slug         String          @unique   // URL: /p/apch
  name         String
  repo         String
  branch       String
  language     String          @default("ko")
  executorKind String          @default("local")   // local | routine
  commandIssue Int?
  runbookVersion String?                 // /harness:init이 마지막으로 심은 런북 템플릿의 해시. null = 보고된 적 없음(= 낡음으로 본다)
  autoScoutEnabled Boolean     @default(true) // 빈 백로그 자동 발굴. 그래프 슬롯과 독립적이며 모든 플랜에서 소유자가 제어한다
  createdAt    DateTime        @default(now())
  tokens       ProjectToken[]
  workspaces   Workspace[]
  backlog      BacklogItem[]
  board        BoardItem[]
  commands     Command[]
  runs         AgentRun[]
  ownerTokens  OwnerToken[]
  pipelineVersions PipelineVersion[]
  ownerUserId   String
  repoOwner     String
  available     Boolean   @default(true)
  disconnectedAt DateTime?
  lastSelectedAt DateTime?
  lastSyncedAt  DateTime?
  requestRateWindows RequestRateWindow[]
  ownerUser     User      @relation("ProjectOwner", fields: [ownerUserId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([ownerUserId, available])
  @@index([ownerUserId, disconnectedAt])
}
```

After:

```prisma
model Project {
  id           String          @id @default(cuid())
  slug         String          @unique   // URL: /p/apch
  name         String
  repo         String
  branch       String
  language     String          @default("ko")
  executorKind String          @default("local")   // local | routine
  commandIssue Int?
  runbookVersion String?                 // /harness:init이 마지막으로 심은 런북 템플릿의 해시. null = 보고된 적 없음(= 낡음으로 본다)
  autoScoutEnabled Boolean     @default(true) // 빈 백로그 자동 발굴. 그래프 슬롯과 독립적이며 모든 플랜에서 소유자가 제어한다
  autoProposeEnabled Boolean   @default(true) // head가 pm을 불러 백로그에서 고르게 하는가. 옛 propose 노드를 대신한다
  defaultPipelineId String?              // 규칙에 걸리지 않은 새 항목이 붙는 파이프라인. null = 첫 쓰기 경로에서 default_<id>를 만든다
  createdAt    DateTime        @default(now())
  tokens       ProjectToken[]
  workspaces   Workspace[]
  backlog      BacklogItem[]
  board        BoardItem[]
  commands     Command[]
  runs         AgentRun[]
  ownerTokens  OwnerToken[]
  pipelineVersions PipelineVersion[]
  pipelines    Pipeline[]      @relation("ProjectPipelines")
  defaultPipeline Pipeline?    @relation("ProjectDefaultPipeline", fields: [defaultPipelineId], references: [id], onDelete: SetNull)
  pipelineRules PipelineRule[]
  ownerUserId   String
  repoOwner     String
  available     Boolean   @default(true)
  disconnectedAt DateTime?
  lastSelectedAt DateTime?
  lastSyncedAt  DateTime?
  requestRateWindows RequestRateWindow[]
  ownerUser     User      @relation("ProjectOwner", fields: [ownerUserId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([ownerUserId, available])
  @@index([ownerUserId, disconnectedAt])
}
```

**`PipelineVersion`** (`schema.prisma:308`–`:320`)

Before:

```prisma
model PipelineVersion {                  // 프로젝트의 그래프. 저장마다 새 행 — 항목은 시작 시점 버전에 고정된다(원장 = 감사 로그)
  id        String   @id @default(cuid())
  projectId String
  version   Int                          // 1부터. 현재 = 프로젝트의 최대 version
  nodes     String[]                     // pipeline.mjs NODE_KINDS의 부분열
  gates     String[]                     // before-<kind>
  format    String?
  createdAt DateTime @default(now())
  createdBy String                       // userId. 기본 그래프를 서버가 물질화했으면 "pipeline"
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  runs      PipelineRun[]
  @@unique([projectId, version])
}
```

After:

```prisma
model PipelineVersion {                  // 실행 판 — 항목이 실제로 도는 펼친 그래프. 정의 저장이 영향받은 파이프라인마다 새 행을 쓴다. 항목은 시작 시점 판에 고정된다 — Proposed이고 실행 전인 항목만 Change pipeline으로 다시 고정한다(원장 = 감사 로그)
  id         String    @id @default(cuid())
  projectId  String
  pipelineId String?                     // migration A가 채우고, migration B가 null 부재를 검증한 뒤 NOT NULL로 만든다
  version    Int                         // 프로젝트 안 일련번호(파이프라인을 가로지른다). 그 파이프라인의 현재 = 그 파이프라인 행 중 최대 version
  nodes      String[]                    // pipeline.mjs NODE_KINDS의 부분열(펼친 결과라 연결이 없다)
  gates      String[]                    // before-<kind>
  format     String?
  createdAt  DateTime  @default(now())
  createdBy  String                      // userId. 기본 그래프를 서버가 물질화했으면 "pipeline"
  project    Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  pipeline   Pipeline? @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  runs       PipelineRun[]
  @@unique([projectId, version])
  @@index([pipelineId, version])
}
```

**새 모델**

```prisma
model Pipeline {                         // 이름 붙은 파이프라인. 종류가 없다 — 항목에 붙을 수 있는지는 실행 판이 있는가(펼친 결과의 validateGraph)로 정해진다
  id          String    @id @default(cuid()) // migration·지연 생성이 만든 기본 파이프라인은 default_<projectId>
  projectId   String
  name        String
  createdAt   DateTime  @default(now())
  createdBy   String                     // userId. migration·지연 생성이 만들었으면 "pipeline"
  archivedAt  DateTime?                  // 보관. 지우지 않는다 — 판 행과 런이 이 행을 거쳐 원장에 남는다(불변식 8)
  project     Project   @relation("ProjectPipelines", fields: [projectId], references: [id], onDelete: Cascade)
  defaultOf   Project[] @relation("ProjectDefaultPipeline")
  definitions PipelineDefinition[]
  versions    PipelineVersion[]
  rules       PipelineRule[]
  @@index([projectId, archivedAt])
}

model PipelineDefinition {               // 편집 원본. 저장마다 새 행. steps는 노드 id 또는 pipeline:<id>, gates는 before-<step>
  id         String   @id @default(cuid())
  pipelineId String
  version    Int                         // 파이프라인마다 1부터. 저장의 낙관적 기준(expectedVersion)이자 Pipeline 탭이 보여 주는 번호
  steps      String[]
  gates      String[]
  createdAt  DateTime @default(now())
  createdBy  String
  pipeline   Pipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  @@unique([pipelineId, version])
}

model PipelineRule {                     // BacklogItem.type → 파이프라인. 규칙이 없으면 기본(결정 6)
  projectId  String
  type       String                      // backlog.mjs ITEM_TYPES
  pipelineId String
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  pipeline   Pipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  @@id([projectId, type])
}
```

`Pipeline`은 지우지 않으므로 `PipelineVersion → Pipeline`의 Cascade는 프로젝트 삭제 경로에서만 일어난다. 기존 관계들처럼 Cascade로 둔다.
Restrict로 두면 프로젝트 삭제가 막힌다(`schema.prisma:332` 주석).

**migration A — `prisma/migrations/<timestamp>_multiple_pipelines/migration.sql`** (추가와 backfill. timestamp는 구현 시점에 정한다)

```sql
-- Additive. Existing PipelineVersion/PipelineRun/TransitionEvent rows keep their values; runs stay pinned to their versions.
ALTER TABLE "Project" ADD COLUMN "autoProposeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "defaultPipelineId" TEXT;
ALTER TABLE "PipelineVersion" ADD COLUMN "pipelineId" TEXT;

CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PipelineDefinition" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "steps" TEXT[],
    "gates" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "PipelineDefinition_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PipelineRule" (
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    CONSTRAINT "PipelineRule_pkey" PRIMARY KEY ("projectId", "type")
);

CREATE INDEX "Pipeline_projectId_archivedAt_idx" ON "Pipeline"("projectId", "archivedAt");
CREATE UNIQUE INDEX "PipelineDefinition_pipelineId_version_key" ON "PipelineDefinition"("pipelineId", "version");
CREATE INDEX "PipelineVersion_pipelineId_version_idx" ON "PipelineVersion"("pipelineId", "version");

ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_defaultPipelineId_fkey" FOREIGN KEY ("defaultPipelineId") REFERENCES "Pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PipelineDefinition" ADD CONSTRAINT "PipelineDefinition_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineRule" ADD CONSTRAINT "PipelineRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineRule" ADD CONSTRAINT "PipelineRule_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PipelineVersion" ADD CONSTRAINT "PipelineVersion_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill. Every project gets its Default pipeline (id default_<projectId>, so later lazy creation is idempotent).
-- The latest graph becomes Default's first definition without propose, and propose's presence becomes Automatic picking.
INSERT INTO "Pipeline" ("id", "projectId", "name", "createdBy")
SELECT 'default_' || p."id", p."id", 'Default', 'pipeline' FROM "Project" p
ON CONFLICT ("id") DO NOTHING;
UPDATE "Project" SET "defaultPipelineId" = 'default_' || "id" WHERE "defaultPipelineId" IS NULL;
UPDATE "PipelineVersion" SET "pipelineId" = 'default_' || "projectId" WHERE "pipelineId" IS NULL;
WITH latest AS (
  SELECT DISTINCT ON ("projectId") "projectId", "nodes", "gates", "createdAt", "createdBy"
  FROM "PipelineVersion"
  ORDER BY "projectId", "version" DESC
)
INSERT INTO "PipelineDefinition" ("id", "pipelineId", "version", "steps", "gates", "createdAt", "createdBy")
SELECT 'default_' || l."projectId" || '_1', 'default_' || l."projectId", 1, array_remove(l."nodes", 'propose'), l."gates", l."createdAt", l."createdBy"
FROM latest l
ON CONFLICT ("pipelineId", "version") DO NOTHING;
WITH latest AS (
  SELECT DISTINCT ON ("projectId") "projectId", "nodes"
  FROM "PipelineVersion"
  ORDER BY "projectId", "version" DESC
)
UPDATE "Project" p SET "autoProposeEnabled" = ('propose' = ANY(l."nodes"))
FROM latest l WHERE l."projectId" = p."id";
```

- 판이 없는 프로젝트는 정의를 만들지 않는다. 그 프로젝트는 지금처럼 "플랜의 기본 그래프"를 따르고(§4), `autoProposeEnabled`는 기본값 `true`다.
  지금 기본 그래프에는 `propose`가 있으므로 동작이 그대로다.
- `before-propose` 게이트는 원래 저장될 수 없었으므로(`validateGraph`의 게이트 검사) `gates`는 그대로 옮겨도 된다.
- 정의 v1은 최신 판의 `createdBy`와 `createdAt`을 그대로 받는다. Pipeline 탭의 버전 줄은 정의 판을 보여 주므로(§8), `createdAt`을 옮기지 않으면 배포 직후 모든 기존 프로젝트가 "saved just now"로 보인다. 번호는 정의 판이라 1부터다.
- 옛 판의 `propose`는 실행 판에 남는다. 그 판에 고정된 런에서 `propose`는 원래 아무 일도 하지 않으므로(`pipeline.mjs:114`) 동작이 같다.
  기본 파이프라인을 다음에 저장하면 `propose`가 없는 판이 새로 생긴다.

**migration B — 새 서버 배포 뒤** (`<timestamp>_pipeline_version_owner_required`)

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PipelineVersion" WHERE "pipelineId" IS NULL) THEN
    RAISE EXCEPTION 'old or invalid pipeline writer remains; stop cutover';
  END IF;
END $$;
ALTER TABLE "PipelineVersion" ALTER COLUMN "pipelineId" SET NOT NULL;
```

B는 첫 release에 넣지 않는다. 별도 cleanup release에서 schema의 `pipelineId String?`과 `pipeline Pipeline?`을 필수화하고 fixture·생성 client를 함께 갱신한다(배포 절).
B는 old writer를 조용히 보정하지 않는다. A 이후 이전 writer가 만든 판은 정의/설정도 어긋나므로 발견 즉시 전환을 중단한다. A/B 적용과 rollback은 별도 격리 migration 시험으로 검증한다.

### 4. 서버 — 실행 판 해석과 head (`src/server/pipeline/run-query.ts`, `run-rules.ts`)

**쓰기 경계와 실행 판** — 현재 `ensureCurrentVersion`의 프로젝트 최대 판 조회를 대체한다.

Before의 현재 소유 위치는 `run-query.ts`의 `ensureCurrentVersion`·`ensureRun`이다.
After의 형 계약은 아래와 같다. 선언 블록은 호출 경계를 정하며 함수 본문 예제가 아니다. 본문의 처리 순서와 실패 계약이 구현 기준이다.

```ts
type PipelineWriteContext = { tx: Prisma.TransactionClient; projectId: string; ownerUserId: string; plan: Plan };
export declare function withPipelineWrite<Result>(
  client: PrismaClient, projectId: string, userId: string | undefined,
  work: (context: PipelineWriteContext) => Promise<Result>,
): Promise<Result>;
export declare function ensureDefaultPipeline(tx: Prisma.TransactionClient, projectId: string): Promise<string>;
export declare function ensureRunnableVersion(tx: Prisma.TransactionClient, projectId: string, pipelineId?: string): Promise<PipelineVersion>;
export declare function ensureRunIn(tx: Prisma.TransactionClient, projectId: string, boardItemId: string, status: string, fresh: boolean, pipelineId?: string): Promise<PipelineRunRow>;
export declare function ensureRun(client: PrismaClient, projectId: string, boardItemId: string, status: string, fresh: boolean, pipelineId?: string): Promise<PipelineRunRow>;
```

- `withPipelineWrite`는 새 `lock-query.ts`가 소유한다. Prisma·PipelineVersion은 `@/generated/prisma/client`에서, Plan은 단일 출처인 `@harness/core/entitlement.mjs`에서 가져온다(`@/server/project-access-query`는 같은 형을 다시 내보낼 뿐이다). transaction timeout은 기존 보드와 같은 15초다.
- 프로젝트의 소유자 id를 읽고 `User → Project FOR UPDATE`로 잠근 뒤 프로젝트를 다시 읽는다. 전달된 웹 userId가 소유자와 다르면 거부하고 `readProjectAccessIn(tx, projectId)`로 연결·선택·무결성과 **최신 plan**을 재검사한다. GET에는 이 helper를 쓰지 않는다.
- 이미 같은 잠금을 잡은 `board-query.ts`는 `ensureRunIn(tx, …)`을 사용한다. 공개 `ensureRun(client, …)`은 helper 안에서 ensureRunIn을 호출한다. 중첩 transaction은 만들지 않는다.
- `nextFor(PrismaClient, …)`는 공개 wrapper를 쓴다. MCP는 `mcp/deps.ts`에서 advancePipeline을 먼저 호출하지만 nextFor 자체도 안전해야 한다. 현 코드의 nextFor → ensureRun 직접 호출과 시험·리허설의 직접 호출을 잠금 안이라고 가정하지 않는다.
- ensureRunIn은 boardItem이 입력 프로젝트에 속하는지 확인하고 기존 run이면 판·커서·entry를 그대로 반환한다. 없으면 ensureRunnableVersion으로 판을 고르고 기존 `(fresh ? sequence(graph)[0] : cursorForStatus(graph, status)) ?? sequence(graph)[0]` 계약을 쓴다(`run-query.ts:49`). 끝의 대체값을 빼지 않는다: `cursorForStatus`는 `on_hold`에서 null이고 `PipelineRun.node`는 NOT NULL이라, 런이 없는 옛 항목이 `on_hold`일 때 `advanceRun`(`board-query.ts:627`) 같은 ensureRun 경로가 실패한다. run INSERT의 `ON CONFLICT(boardItemId)`는 유지한다.

`ensureDefaultPipeline`의 처리 순서:

1. 잠긴 프로젝트의 defaultPipelineId가 있으면 같은 프로젝트의 비보관 Pipeline인지 검사하고 반환한다.
2. 없으면 `default_<projectId>`와 이름 Default로 Pipeline을 만들고 프로젝트에 연결한다. id 충돌을 무시한 뒤에도 소유 프로젝트를 확인한다.
3. 이 함수만으로 정의나 실행 판을 만들지는 않는다. 실패 반환 전에 기본 행이 생겼다면 transaction 전체를 rollback한다.

`ensureRunnableVersion`의 처리 순서:

1. 기본 id를 구하고 선택 id가 같은 프로젝트의 비보관 Pipeline인지 확인한다. 다른 프로젝트·보관·없는 대상은 PIPELINE_NOT_FOUND로 거부한다.
2. `where: { projectId, pipelineId }`, `orderBy: { version: "desc" }`로 조회한다. 판이 있으면 알려진 format(null·slots-v1)인지 검사하고 그대로 반환한다. 옛 판의 propose와 고정 run은 바꾸지 않는다.
3. 판이 없는 비기본 대상은 PIPELINE_CANNOT_RUN_ITEMS로 거부한다. 기본도 저장된 정의가 있는데 판만 없으면 무결성 실패다. 저장된 정의를 플랜 기본 그래프로 덮어쓰지 않는다.
4. **정의와 판이 모두 없는 기본 대상만** 잠긴 최신 plan의 defaultGraph로 정의 v1과 실행 판을 같은 transaction에서 만든다. 첫 실행 후 기본을 바꿔도 원래 기본 정의가 사라지거나 다운그레이드 플랜으로 다시 계산되지 않게 한다.
5. 실행 판 번호는 프로젝트 최대값 + 1이다. 4번의 정의 v1·실행 판 INSERT는 지금 `ensureCurrentVersion`처럼 `ON CONFLICT DO NOTHING`으로 쓰고, `RETURNING`으로 한 행이 들어갔는지 확인한다. 안 들어갔으면 무결성 실패로 전체를 rollback하고 다른 Pipeline의 행을 가져다 쓰지 않는다(기본 Pipeline 행은 `ensureDefaultPipeline` 2번대로 충돌을 무시하고 소유를 확인한다). 잠금 안의 READ COMMITTED writer에서는 충돌이 나지 않는다. 그러나 Serializable인 `propose`는 잠금보다 먼저(`inProjectTransaction`의 첫 읽기) 스냅숏을 잡는다. 그 사이 다른 writer가 기본을 물질화해 commit하면, `ON CONFLICT DO NOTHING`은 지금처럼 40001(P2034, 다시 부르면 된다)로 실패하고 그냥 INSERT는 23505(P2002)로 실패해 propose 계약이 바뀐다(PostgreSQL 18에서 확인). 정의 번호·프로젝트 번호는 PostgreSQL Int 상한 2,147,483,647을 넘기 전에 거부한다.

기본을 다른 Pipeline으로 바꾸기 전에도 원래 기본의 가상 그래프를 4번으로 보존한다.
생성·저장·설정·항목 생성 실패는 기본 행·정의·판까지 zero-write다.

**읽기 전용 loadPipelinesView** — loadCurrentVersionView를 대체하고 run.ts에서 명시 export한다.

```ts
export type PipelineView = {
  id: string; name: string; isDefault: boolean;
  definition: { steps: string[]; gates: string[] };
  saved: { version: number; createdAt: Date } | null;
  runnable: { nodes: string[]; gates: string[]; format: string | null } | null;
};
export type PipelinesView = { pipelines: PipelineView[]; rules: Record<string, string>; autoProposeEnabled: boolean };
export declare function loadPipelinesView(client: PrismaClient, projectId: string): Promise<PipelinesView>;
export declare function loadPipelinesViewIn(tx: Prisma.TransactionClient, projectId: string): Promise<PipelinesView>;
export type PipelineChangeView = { fromName: string; toName: string };
export type ItemPipelineView = { pipelineId: string | null; name: string; canChange: boolean };
export declare function loadItemPipelineView(client: PrismaClient, projectId: string, boardItemId: string): Promise<ItemPipelineView>;
export declare function loadPipelineChanges(client: PrismaClient, projectId: string, notes: readonly (string | null)[]): Promise<Record<string, PipelineChangeView>>;
```

웹 전용 metadata reader 두 개도 run.ts에서 명시 공개한다. loadItemPipelineView는 같은 프로젝트의 기존 run/AgentRun만 읽는다. `pipelineId`는 그 run이 고정된 실행 판의 pipelineId이고(Change pipeline이 현재 Pipeline을 선택지에서 뺄 때 쓴다), `name`은 그 Pipeline의 이름이다(보관된 것도 그대로). run이 없으면 pipelineId:null·name `Default`·canChange:false다. run을 만든 2026-09-10 migration(`20260910044819_pipeline_version_and_run`)은 기존 항목의 run을 backfill하지 않아서, 그 뒤 ensureRun 경로를 한 번도 지나지 않은 옛 항목에는 run이 없다. 판의 pipelineId가 null인 경우(전환을 멈추게 하는 옛 writer 판, §3)도 name은 `Default`다. 보드 카드의 대체값(§8)과 같다. loadPipelineChanges는 정확히 pipeline-changed:<old-id>:<new-id>인 note만 해석해 note별 이름 객체를 반환한다. 두 reader도 읽기 전용이다.

프로젝트 설정·규칙과 비보관 Pipeline의 최신 정의/실행 판을 한 읽기 전용 RepeatableRead snapshot으로 읽는다.
root wrapper는 `@/server/project-access-query`에서 명시 import한 READ_OPTIONS와 SET TRANSACTION READ ONLY를 사용한다. 잠긴 서비스는 loadPipelinesViewIn으로 기존 transaction을 사용한다.

- 새 프로젝트는 계산된 기본 id·이름으로 가상 Pipeline 하나를 반환한다. 정의와 판이 모두 없는 기본(가상 기본)은 `definition`과 `runnable`에 현재 plan의 기본 그래프(`runnable.format`은 slots-v1)를, `saved`에 null을 담는다. 지금 `loadCurrentVersionView`가 판이 없을 때 기본 그래프를 돌려주는 것과 같다. 첫 쓰기의 물질화(§4 4번)는 잠긴 최신 plan으로 다시 계산한다.
- 저장된 정의와 판은 그대로 반환한다. 비기본 조각은 runnable:null이다. 기본 정의/판의 일부만 없는 비정상 조합은 무결성 오류다.
- 첫 실행에서 보존한 정의 v1은 saved.version=1이다. 물질화 직전 읽은 expectedVersion 0은 이후 저장에서 stale일 수 있다.
- Runs items 태그, 규칙·기본 셀렉트와 Put on the board·Change pipeline의 선택 가능 여부, Team은 모두 **`runnable !== null`**로 판단한다. `runnable`은 저장된 실행 판에서 오고, 가상 기본만 위의 기본 그래프다. 그래서 판이 하나도 없는 새 프로젝트에서도 기본이 선택지에 들어간다(`runnableReason`이 미물질화 기본을 받는 것과 같다). Team이 `runnable` 노드를 모을 때는 옛 판에 남은 `propose`를 뺀다(§8). 다운그레이드 뒤에도 현재 Free plan의 validateGraph로 기존 Pro 그래프를 조각으로 재분류하지 않는다.
- 목록·보드·백로그·항목·History GET은 Pipeline·정의·판·run을 생성하지 않는다.
- `pipelines` 순서는 기본 파이프라인이 먼저이고, 나머지는 `createdAt`, 같으면 `id` 오름차순이다. Pipeline 탭 목록과 규칙·기본 셀렉트, Put on the board와 Change pipeline의 선택지, Team이 이 순서를 그대로 쓴다. 조회에 순서를 주지 않으면 DB가 돌려주는 순서가 매번 같다는 보장이 없다.

DEFAULT_PIPELINE_NAME, defaultPipelineIdOf, PIPELINE_CANNOT_RUN_ITEMS, PIPELINE_NOT_FOUND는 run-query.ts가 소유한다.
PIPELINE_CANNOT_RUN_ITEMS는 `This pipeline can't run items on its own. Use it inside another pipeline.`, PIPELINE_NOT_FOUND는 `Pipeline not found.`이다. 이 사유를 내는 정의 저장·설정·항목 생성·항목 변경은 이 상수를 가져다 쓴다(어느 곳이 어느 사유를 내는지는 §8 문구 표).
필수 앵커 외에도 순서·중복·플랜 검사가 있어 실패 원인을 앵커 부족으로 단정하지 않는다.

**`headFor`** (`run-query.ts:146`–`:171`) — 판 대신 설정을 읽는다.

Before:

```ts
// key 없는 호출의 머리 — 미결 수는 deps.ts가 latestBoard로 세어 넘긴다(run.ts는 board.ts를 import하지 않는다)
export async function headFor(db: Db, projectId: string, openCount: number, availableBacklog: number, scoutNodePending: boolean): Promise<HeadNext> {
  const version = await ensureCurrentVersion(db, projectId);
  const cap = await readProjectUsageCapIn(db, projectId);
  const [lastScout, backlogChange, resumableScout, project] = await Promise.all([
    db.agentRun.findFirst({ where: { projectId, agent: "feature-scout", key: null, closedAt: { not: null },
      steps: { some: { stepId: "report", outcome: "ok", OR: [{ accepted: true }, { accepted: null }] } },
    }, orderBy: { closedAt: "desc" }, select: { closedAt: true } }),
    db.backlogItem.aggregate({ where: { projectId }, _max: { createdAt: true, removedAt: true } }),
    db.agentRun.findFirst({ where: { projectId, agent: "feature-scout", key: null,
      pipelineRunId: null, pipelineEntryId: null, closedAt: null }, select: { id: true } }),
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { autoScoutEnabled: true } }),
  ]);
  const changedAt = Math.max(backlogChange._max.createdAt?.getTime() ?? 0, backlogChange._max.removedAt?.getTime() ?? 0);
  return decideHead({
    autoScoutEnabled: project.autoScoutEnabled,
    scoutNodePending,
    hasResumableScoutRun: resumableScout !== null,
    scoutedSinceChange: lastScout?.closedAt !== null && lastScout?.closedAt !== undefined && lastScout.closedAt.getTime() > changedAt,
    hasPropose: version.nodes.includes("propose"),
    openCount,
    availableBacklog,
    hasResumablePmRun: await db.agentRun.findFirst({ where: { projectId, agent: "pm", key: null, pipelineRunId: null, pipelineEntryId: null, closedAt: null }, select: { id: true } }) !== null,
    cap,
  });
}
```

After:

```ts
// key 없는 호출의 머리 — 미결 수는 deps.ts가 latestBoard로 세어 넘긴다(run.ts는 board.ts를 import하지 않는다)
// pm을 부를지는 그래프가 아니라 프로젝트 설정이다 — 항목이 어느 파이프라인으로 갈지는 pm이 고른 뒤에 type으로 정해진다.
export async function headFor(db: Db, projectId: string, openCount: number, availableBacklog: number, scoutNodePending: boolean): Promise<HeadNext> {
  const cap = await readProjectUsageCapIn(db, projectId);
  const [lastScout, backlogChange, resumableScout, project] = await Promise.all([
    db.agentRun.findFirst({ where: { projectId, agent: "feature-scout", key: null, closedAt: { not: null },
      steps: { some: { stepId: "report", outcome: "ok", OR: [{ accepted: true }, { accepted: null }] } },
    }, orderBy: { closedAt: "desc" }, select: { closedAt: true } }),
    db.backlogItem.aggregate({ where: { projectId }, _max: { createdAt: true, removedAt: true } }),
    db.agentRun.findFirst({ where: { projectId, agent: "feature-scout", key: null,
      pipelineRunId: null, pipelineEntryId: null, closedAt: null }, select: { id: true } }),
    db.project.findUniqueOrThrow({ where: { id: projectId }, select: { autoScoutEnabled: true, autoProposeEnabled: true } }),
  ]);
  const changedAt = Math.max(backlogChange._max.createdAt?.getTime() ?? 0, backlogChange._max.removedAt?.getTime() ?? 0);
  return decideHead({
    autoScoutEnabled: project.autoScoutEnabled,
    scoutNodePending,
    hasResumableScoutRun: resumableScout !== null,
    scoutedSinceChange: lastScout?.closedAt !== null && lastScout?.closedAt !== undefined && lastScout.closedAt.getTime() > changedAt,
    autoProposeEnabled: project.autoProposeEnabled,
    openCount,
    availableBacklog,
    hasResumablePmRun: await db.agentRun.findFirst({ where: { projectId, agent: "pm", key: null, pipelineRunId: null, pipelineEntryId: null, closedAt: null }, select: { id: true } }) !== null,
    cap,
  });
}
```

달라지는 점: Before는 head가 처음 불릴 때 기본 판을 물질화했다(`ensureCurrentVersion`). After는 head가 아무것도 쓰지 않고, 물질화는 첫 성공 파이프라인 쓰기나 ensureRun에서 일어난다.
판이 언제 생기는지만 바뀌고(Pipeline 탭의 "not saved yet" 표시가 더 오래 남음), 어느 항목이 어떤 그래프로 도는지는 바뀌지 않는다.

**`run-rules.ts` `HeadInput`·`decideHead`** (`run-rules.ts:97`–`:126`)

Before:

```ts
export type HeadInput = {
  autoScoutEnabled: boolean;
  hasResumablePmRun?: boolean;
  hasResumableScoutRun?: boolean;
  scoutedSinceChange: boolean;
  scoutNodePending: boolean;
  hasPropose: boolean;   // 현재 버전의 nodes에 propose가 있는가
  openCount: number;     // 미결 항목 수(latestBoard(projectId, true).length)
  availableBacklog: number; // 최신 행이 미결도 보류도 아닌 백로그 항목 수(countPickable) — pm이 고를 수 있는 것
  cap: UsageLimitFailure | null;
};

export function scoutNodePending(items: PipelineNext[]): boolean {
  return items.some((item) => item.action === "dispatch" && item.agent === "feature-scout");
}

// Open limit first, then, with nothing for pm to pick (held items don't count), fill the backlog once per change, then propose.
export function decideHead(i: HeadInput): HeadNext {
  if (!canPropose(i.openCount)) return { action: "none", reason: `open items: ${i.openCount} (max 2)` };
  if (i.availableBacklog === 0) {
    if (i.scoutNodePending) return { action: "none", reason: "a Scout node in items dispatches feature-scout — that run looks for items to add" };
    if (!i.autoScoutEnabled) return { action: "none", reason: AUTO_SCOUT_DISABLED_REASON };
    if (i.scoutedSinceChange) return { action: "none", reason: "feature-scout already looked at this backlog — it looks again after the backlog changes; add an item on the Backlog tab" };
    if (i.cap !== null && !i.hasResumableScoutRun) return { action: "none", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
    return { action: "dispatch", agent: "feature-scout", hint: HINT.scoutHead };
  }
  if (!i.hasPropose) return { action: "none", reason: "no propose node on this pipeline — put an item on the board from the Backlog tab" };
  if (i.cap !== null && !i.hasResumablePmRun) return { action: "none", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
  return { action: "dispatch", agent: "pm", hint: HINT.propose };
}
```

After:

```ts
export type HeadInput = {
  autoScoutEnabled: boolean;
  hasResumablePmRun?: boolean;
  hasResumableScoutRun?: boolean;
  scoutedSinceChange: boolean;
  scoutNodePending: boolean;
  autoProposeEnabled: boolean; // Project.autoProposeEnabled — 옛 propose 노드를 대신하는 설정
  openCount: number;     // 미결 항목 수(latestBoard(projectId, true).length)
  availableBacklog: number; // 최신 행이 미결도 보류도 아닌 백로그 항목 수(countPickable) — pm이 고를 수 있는 것
  cap: UsageLimitFailure | null;
};

export function scoutNodePending(items: PipelineNext[]): boolean {
  return items.some((item) => item.action === "dispatch" && item.agent === "feature-scout");
}

// Open limit first, then, with nothing for pm to pick (held items don't count), fill the backlog once per change, then propose.
export function decideHead(i: HeadInput): HeadNext {
  if (!canPropose(i.openCount)) return { action: "none", reason: `open items: ${i.openCount} (max 2)` };
  if (i.availableBacklog === 0) {
    if (i.scoutNodePending) return { action: "none", reason: "a Scout node in items dispatches feature-scout — that run looks for items to add" };
    if (!i.autoScoutEnabled) return { action: "none", reason: AUTO_SCOUT_DISABLED_REASON };
    if (i.scoutedSinceChange) return { action: "none", reason: "feature-scout already looked at this backlog — it looks again after the backlog changes; add an item on the Backlog tab" };
    if (i.cap !== null && !i.hasResumableScoutRun) return { action: "none", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
    return { action: "dispatch", agent: "feature-scout", hint: HINT.scoutHead };
  }
  if (!i.autoProposeEnabled) return { action: "none", reason: AUTO_PROPOSE_DISABLED_REASON };
  if (i.cap !== null && !i.hasResumablePmRun) return { action: "none", reason: i.cap.reason, code: i.cap.code, resetAt: i.cap.resetAt };
  return { action: "dispatch", agent: "pm", hint: HINT.propose };
}
```

지켜야 할 불변식: 검사 순서와 사유는 그대로다. 한 줄만 바뀐다: `hasPropose: false` 대신 `autoProposeEnabled: false`이면 `none`을 돌려준다.
`availableBacklog`의 뜻(보류 항목은 후보가 아니다, `countPickable`)과 그 주석은 바꾸지 않는다.
import에 `AUTO_PROPOSE_DISABLED_REASON`(`@harness/core/pipeline.mjs`)을 더한다.

`AUTO_PROPOSE_DISABLED_REASON`에는 "Backlog tab"이 들어 있다. 그래서 기존 시험의 `/Backlog tab/` 정규식(`run-rules.test.mjs:107`)은 입력 필드 이름만 바꾸면 통과한다.

### 5. 서버 — 항목 생성(type 라우팅)과 파이프라인 변경 (`src/server/pipeline/board-query.ts`)

**`propose`** (`board-query.ts:297`–`:323`)

Before:

```ts
// 미결 상한(2)은 "세고 나서 만든다" — READ COMMITTED에서는 두 호출자가 같은 수를 읽고 둘 다 만들 수 있다.
// 스펙이 이 상한을 서버 강제로 규정하므로(불변식·pm 규칙) 이 트랜잭션만 Serializable로 올린다.
// 충돌 시 Postgres가 40001로 실패시키고, 도구는 그 오류를 그대로 반환한다(에이전트는 다시 부르면 된다).
async function propose(projectId: string, input: { key: string; agent: string; reason: string }, by: Proposer) {
  return inProjectTransaction(projectId, async (tx) => {
    const backlog = await tx.backlogItem.findUnique({ where: { projectId_key: { projectId, key: input.key } } });
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const latest = await latestBoard(projectId, false, tx);
    const open = latest.filter((r) => isOpen(r.status));
    const mine = backlog ? latest.find((r) => r.backlogItemId === backlog.id) : undefined;
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: mine !== undefined && isOpen(mine.status),
      onHold: mine?.status === "on_hold",
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
    if (!d.ok || !backlog) return fail(d.ok ? "no such backlog item" : d.reason);
    const item = await tx.boardItem.create({
      data: { projectId, backlogItemId: backlog.id, agent: input.agent, status: "proposed", reason: input.reason,
        events: { create: { from: null, to: "proposed", actor: by.actor, actorId: by.actorRef, channel: by.actor === "human" ? by.channel : null } } },
    });
    // 런은 항목과 같은 트랜잭션에서 머리에 선다. 게이트 없는 before-plan이면 여기서 바로 planning으로 넘는다.
    await ensureRun(tx, projectId, item.id, "proposed", true);
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: item.id } }) };
  }, { isolationLevel: "Serializable" });
}
```

After:

```ts
// 미결 상한(2)은 "세고 나서 만든다" — READ COMMITTED에서는 두 호출자가 같은 수를 읽고 둘 다 만들 수 있다.
// 스펙이 이 상한을 서버 강제로 규정하므로(불변식·pm 규칙) 이 트랜잭션만 Serializable로 올린다.
// 충돌 시 Postgres가 40001로 실패시키고, 도구는 그 오류를 그대로 반환한다(에이전트는 다시 부르면 된다).
// 파이프라인: 웹은 고른 것(미리 선택은 규칙 결과), pm은 type 규칙 → 기본(결정 6). MCP board_propose 입력에는 pipelineId가 없다.
async function propose(projectId: string, input: { key: string; agent: string; reason: string; pipelineId?: string }, by: Proposer) {
  return inProjectTransaction(projectId, async (tx) => {
    const backlog = await tx.backlogItem.findUnique({ where: { projectId_key: { projectId, key: input.key } } });
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const latest = await latestBoard(projectId, false, tx);
    const open = latest.filter((r) => isOpen(r.status));
    const mine = backlog ? latest.find((r) => r.backlogItemId === backlog.id) : undefined;
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: mine !== undefined && isOpen(mine.status),
      onHold: mine?.status === "on_hold",
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
    if (!d.ok || !backlog) return fail(d.ok ? "no such backlog item" : d.reason);
    await ensureDefaultPipeline(tx, projectId);
    const pipelineId = by.actor === "human" && input.pipelineId !== undefined
      ? input.pipelineId : await routedPipelineId(tx, projectId, backlog.type);
    const unrunnable = await runnableReason(tx, projectId, pipelineId);
    if (unrunnable !== null) return fail(unrunnable);
    const item = await tx.boardItem.create({
      data: { projectId, backlogItemId: backlog.id, agent: input.agent, status: "proposed", reason: input.reason,
        events: { create: { from: null, to: "proposed", actor: by.actor, actorId: by.actorRef, channel: by.actor === "human" ? by.channel : null } } },
    });
    // 런은 항목과 같은 트랜잭션에서 고른 파이프라인의 실행 판 머리에 선다. 게이트 없는 before-plan이면 여기서 바로 planning으로 넘는다.
    await ensureRunIn(tx, projectId, item.id, "proposed", true, pipelineId);
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: item.id } }) };
  }, { isolationLevel: "Serializable" });
}

// type 규칙 → 기본(core routePipeline). 기본 파이프라인 행이 없으면 여기서 만든다 — 이 경로는 프로젝트 잠금 안이다.
async function routedPipelineId(tx: Prisma.TransactionClient, projectId: string, type: string | null): Promise<string> {
  const defaultId = await ensureDefaultPipeline(tx, projectId);
  const rules = await tx.pipelineRule.findMany({ where: { projectId }, select: { type: true, pipelineId: true } });
  return routePipeline(type, Object.fromEntries(rules.map((r) => [r.type, r.pipelineId])), defaultId);
}

// 항목에 붙을 수 있으면 null — 비보관이고, 실행 판이 있거나 아직 물질화되지 않은 기본 파이프라인이다.
// 없거나 다른 프로젝트·보관이면 PIPELINE_NOT_FOUND, 조각이면 PIPELINE_CANNOT_RUN_ITEMS(§8 문구 표, 정의 저장·설정과 같은 사유).
async function runnableReason(tx: Prisma.TransactionClient, projectId: string, pipelineId: string): Promise<string | null> {
  const pipeline = await tx.pipeline.findFirst({ where: { id: pipelineId, projectId, archivedAt: null },
    select: { versions: { select: { id: true }, take: 1 }, defaultOf: { where: { id: projectId }, select: { id: true } } } });
  if (pipeline === null) return PIPELINE_NOT_FOUND;
  return pipeline.versions.length > 0 || pipeline.defaultOf.length > 0 ? null : PIPELINE_CANNOT_RUN_ITEMS;
}
```

import에 다음을 더한다.

- `@harness/core/pipeline.mjs`에서 `routePipeline`, `sequence`
- `./run-query`에서 `ensureDefaultPipeline`, `ensureRunnableVersion`, `ensureRunIn`, `PIPELINE_CANNOT_RUN_ITEMS`, `PIPELINE_NOT_FOUND`

이 파일의 `ensureRun` 호출 8곳(지금 `board-query.ts`의 `propose`·`advanceRun` 등)은 모두 트랜잭션 안이라 `ensureRunIn`으로 옮긴다. 그러면 `./run-query`의 `ensureRun` import는 쓰이지 않으므로 뺀다. `npm run lint`는 `--max-warnings` 없이 돌아 미사용 import 경고로는 실패하지 않으므로, 경고 0건인 기준선은 이 제거로 지킨다.

`decidePropose`의 판정(보류 key 거부 포함)과 그 앞의 읽기는 바꾸지 않는다. 거부는 기본 파이프라인 행을 쓰기 전에 끝나므로 거부된 제안은 아무것도 쓰지 않는다.

웹 액션의 입력 스키마(`src/fsd/features/propose-item/model/propose-input.ts`)에는 `pipelineId: z.string().min(1).optional()`을 더한다.

**`changePipeline`** (새 함수 — 결정 13. 서비스 반환 목록과 `board.ts` export에 추가)

```ts
const PIPELINE_CHANGE_UNAVAILABLE = "The pipeline can change only while the item is proposed and nothing has run on it yet.";

// Proposed 항목의 파이프라인을 바꾼다(소유자, 웹). 이 런에 묶인 에이전트 실행이 없을 때만 — 그래야 버려지는 실행 증거가 없다.
// plan 앞 프로젝트 슬롯이 이미 돌았으면 Proposed여도 바꾸지 않는다. 옛 형식(format null) 런은 실행이 런에 묶이지 않아 판정할 수 없으므로 거부한다.
// 새 파이프라인의 현재 실행 판으로 다시 고정하고 새 항목처럼 머리에 선 뒤 전진한다. 원장에는 같은 상태의 이벤트 한 줄.
async function changePipeline(projectId: string, input: { key: string; pipelineId: string; userId: string; expectedUpdatedAt: Date }): Promise<ServerResult<null>> {
  return inProjectTransaction(projectId, async (tx) => {
    const owner = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { ownerUserId: true } });
    if (owner.ownerUserId !== input.userId) throw new BoardRejection("pipeline change access denied");
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    if (row.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new BoardRejection("stale");
    if (row.status !== "proposed") throw new BoardRejection(PIPELINE_CHANGE_UNAVAILABLE);
    const run = await tx.pipelineRun.findUnique({ where: { boardItemId: row.id }, include: { version: true } });
    if (!run) throw new BoardRejection(PIPELINE_CHANGE_UNAVAILABLE);
    if (run.closedAt || run.version.format !== SLOT_FORMAT) throw new BoardRejection(PIPELINE_CHANGE_UNAVAILABLE);
    if (await tx.agentRun.findFirst({ where: { pipelineRunId: run.id }, select: { id: true } })) throw new BoardRejection(PIPELINE_CHANGE_UNAVAILABLE);
    const unrunnable = await runnableReason(tx, projectId, input.pipelineId);
    if (unrunnable !== null) throw new BoardRejection(unrunnable);
    const version = await ensureRunnableVersion(tx, projectId, input.pipelineId);
    if (version.id === run.version.id) return { ok: true as const, item: null };
    const claimed = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: input.expectedUpdatedAt, status: row.status, discardedAt: null },
      data: { updatedAt: nextTimestamp(row.updatedAt) },
    });
    if (claimed.count !== 1) throw new BoardRejection("stale");
    const graph: Graph = { nodes: version.nodes, gates: version.gates };
    await tx.pipelineRun.update({ where: { id: run.id }, data: {
      versionId: version.id, node: sequence(graph)[0], entryId: version.format === SLOT_FORMAT ? randomUUID() : null, enteredAt: new Date(), closedAt: null,
    } });
    await tx.transitionEvent.create({ data: {
      boardItemId: row.id, from: row.status, to: row.status, actor: "human", actorId: input.userId, channel: "web",
      note: `pipeline-changed:${run.version.id}:${version.id}`,
    } });
    // 새 그래프의 머리에 before-plan 게이트가 없으면 여기서 planning으로 넘는다 — propose와 같은 규칙.
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: null };
  });
}
```

- 이 함수가 `PipelineRun.versionId`를 고치는 두 번째 쓰기 지점이 된다. 고치는 조건은 결정 13의 범위(Proposed, 실행 없음)로 묶는다.
- 커서는 `cursorForStatus("proposed")`가 아니라 `sequence(graph)[0]`에 선다. `cursorForStatus`는 plan 앞 슬롯을 건너뛰기 때문이다. 이렇게 하면 새로 올린 항목(`ensureRun`의 `fresh: true`)과 같은 자리에서 시작한다.
- 앞 그래프에서 이미 승인한 같은 상태 슬롯 게이트(`gate:before-<slot>`)는 새 entry에서 다시 승인해야 한다.


이 함수 블록은 createBoardQueries 내부에 넣는다. PIPELINE_CHANGE_UNAVAILABLE 상수는 factory 밖 모듈 수준에서 명시 export한다. 반환 목록은 reportFailure(changePipeline)으로 감싸고 board.ts에서 changePipeline만 명시 공개한다.

### 6. 서버 — 정의 저장 (새 파일 `src/server/pipeline/definition-save-query.ts`)

Before는 version-save-query.ts의 savePipelineVersion이며 직접 소비자는 편집 action과 서버/통합 시험이다.
After는 아래 형 계약과 처리 순서를 따른다. 선언 블록은 함수 본문 예제가 아니다.

```ts
type SaveInput = {
  projectId: string; userId: string; pipelineId: string | null; name?: string;
  definition: { steps: string[]; gates: string[] }; expectedVersion: number;
};
type SaveResult =
  | { status: "success"; pipelineId: string; version: number }
  | { status: "stale" }
  | { status: "error"; reason: string };
export declare function savePipelineDefinition(client: PrismaClient, input: SaveInput): Promise<SaveResult>;
```

1. primitive·배열 형태를 검사한다. expectedVersion은 0–2,147,483,646의 정수다. 새 Pipeline은 pipelineId:null·expectedVersion:0이며 name을 trim해 1–40자로 검사한다. 기존 Pipeline 저장에서는 name을 쓰지 않는다(이름은 renamePipeline이 바꾼다). 다른 프로젝트·보관 대상은 Pipeline not found.로 거부한다.
2. §4 withPipelineWrite로 잠그고 소유자·접근·**현재 plan의 allowsPipelineEdit**를 확인한다(아니면 core의 `PIPELINE_EDIT_PLAN_GATE`로 거부한다). 웹 action 앞단 검사는 서비스 안 재검사를 대신하지 않는다. 클라이언트가 보낸 plan·owner·projectId를 권한 근거로 쓰지 않는다.
3. 쓰기 없이 최신 정의·실행 판·규칙·가상 기본을 읽는다. 대상 최신 정의 번호가 expectedVersion과 다르면 stale이다. 비보관 이름 중복은 대소문자를 구별한 trim 결과로 검사한다. 가상 Default 이름과도 충돌하면 안 된다. 새 Pipeline 저장은 expectedVersion으로 중복 제출을 막지 못하므로 이 이름 검사가 막는다: 응답 유실 뒤 같은 초안을 다시 보내면 이름 중복으로 거부되어 두 번째 Pipeline이 생기지 않는다.
4. 현재 plan으로 validateDefinition을 실행한다. 새 Pipeline 임시 id draft:new는 실제 cuid·기본 id와 충돌하지 않는다. 정의 사전은 Object.create(null)과 own-key 접근으로 만든다.
5. 대상 초안을 넣고 자신과 usersOf의 모든 사용처에 recompose를 실행한다. 기본·규칙 대상·기존 실행 판을 가진 Pipeline은 mustRun이다. 다른 대상이 깨지면 Saving would break <name>: <reason>으로 거부한다. 사용처 자체가 조각이어도 구조·순환·동일 노드 중복은 검사한다.
6. 쓰기 전에 필요한 정의/판 수를 계산해 번호 overflow를 검사한다. 현재 판과 nodes·게이트 집합·format이 같을 때만 실행 판을 재사용한다. format=null인 legacy 판은 정의 저장에서 slots-v1 판으로 전환한다.
7. 검사가 모두 통과하면 기본 행을 보장한다. 새 조각/다른 Pipeline을 저장하며 기본 정의·판이 없다면 §4대로 기본을 보존한다. **가상 기본 자체의 첫 저장**은 초안을 정의 v1과 첫 실행 판으로 쓴다. 별도 기본 정의 v1을 먼저 써 unique 충돌을 만들지 않는다.
8. 새 Pipeline은 여기서만 생성한다. 대상 정의 +1을 쓰고 실행 그래프가 바뀐 자신·직간접 사용처마다 프로젝트 일련번호로 새 PipelineVersion을 쓴다. 조각 자체에는 실행 판이 없다. 다른 Pipeline의 정의 판은 올리지 않는다.
9. error/stale 또는 판 쓰기 예외는 transaction 밖까지 내부 거부 예외를 전파해 기본 물질화까지 전부 rollback한다. transaction 안에서 실패 객체를 반환하며 앞선 쓰기를 commit하지 않는다. 바깥에서 SaveResult로 바꾼다. PostgreSQL 오류 후 같은 transaction을 계속 사용하지 않는다.
10. 잠금 timeout/40001·응답 유실은 현행 회복 UI를 따른다. 응답 유실을 실패 확정으로 보고 자동 저장 재시도를 하지 않는다. 읽기 후 expectedVersion으로 명시 재시도한다.

**동시성**: 저장·물질화·설정·보드 생성은 User → Project 잠금을 공유한다.
정의 저장 두 건과 기본 물질화 경합을 barrier로 양방향 검증한다.
보드 propose의 Serializable 40001/P2034 계약과 프로젝트 전체 미결 2건 상한은 유지한다. propose는 잠금 전 스냅숏으로 읽으므로, 기본 물질화가 겹칠 때도 40001로 끝나게 §4 5번의 INSERT 방식을 지킨다.
기존 inProjectTransaction 안에서 helper transaction을 중첩하지 않는다.

**웹 action Before/After**

현재 savePipeline은 `savePipelineInputSchema.safeParse`(서버 전용 `model/save-pipeline-input.ts`, zod)로 graph·expectedVersion을 검사한 뒤 `parsed.data`를 savePipelineVersion에 넘긴다.
새 SavePipelineInput(`model/pipeline-save-state.ts`의 형)은 `{ pipelineId, name?, definition, expectedVersion }`,
성공 SavePipelineResult는 `{ status: "success", pipelineId, version }`이다.
`savePipelineInputSchema`를 `{ pipelineId: string | null, name?: string, definition: { steps: string[], gates: string[] }, expectedVersion: 0–2,147,483,646 정수 }`로 바꾼다. 모르는 키는 지금처럼 버린다.
zod는 그 파일에만 둔다(`pipeline-save-state.ts`는 클라이언트도 가져간다).
action은 requireProjectWrite → allowsPipelineEdit → input 검사 순서를 유지하고,
서비스 입력의 projectId/userId를 검증된 세션 값으로 마지막에 지정한다(`{ ...parsed.data, projectId, userId }`).
지금 action이 zod 검사 뒤에 하는 `validateGraph(parsed.data.graph, plan)`은 **뺀다**. 이 검사를 정의에 그대로 옮기면, 앵커가 없는 조각(성공 기준 1)이 action에서 거부된다.
정의 검사는 서비스가 잠금 안의 최신 plan으로 돌리는 validateDefinition·recompose만 한다. 서비스 입력에는 plan을 넣지 않는다(지금 입력에도 없다).
성공 후 프로젝트 layout을 무효화하고 새 snapshot을 읽는다. 부모 정의가 바뀌어도 dirty draft를 덮어쓰지 않는다.

version-save-query.ts는 모든 import와 시험 double을 옮긴 뒤 삭제한다.
tests/server/pipeline-save.test.ts와 tests/server/integration/pipeline-save.test.ts의 경합 시험은 없애지 않고 새 잠금·정의 번호 계약으로 옮긴다.

### 7. 서버 — 보관·이름·기본·규칙·자동 선택 (새 파일 `src/server/pipeline/pipeline-settings-query.ts`)

모두 §4 helper의 잠금 안에서 소유자·접근·최신 plan을 검사하고 결과형은 ServerResult다. 웹 action의 앞단 검사도 유지한다.

- 모든 함수의 입력에 trusted projectId/userId를 받는다. 소유자·선택·연결·최신 plan은 §4 helper의 **잠금 안**에서 재검사한다. Free 편집/Automatic picking 변경은 서비스도 core의 `PIPELINE_EDIT_PLAN_GATE`로 거부한다.
- 이름·대상 id·type·enabled는 primitive부터 검사한다(형식이 틀리면 `Invalid pipeline settings request.`). 규칙/기본/보관/이름 바꾸기 대상은 같은 프로젝트의 비보관 Pipeline으로 제한한다. 없거나 남의 것이거나 보관된 대상은 `Pipeline not found.`로 거부한다(§8 문구 표). 판 없는 가상 기본은 성공 쓰기 안에서 materialize한 뒤 판정한다.
- 기본 교체 전에 원래 가상 기본 정의·판을 보존한다. 첫 성공 설정 쓰기도 기본 정의·판을 보존한다. 실패 시 그 쓰기까지 rollback한다.
- 보관 검사에서 사용하는 정의는 비보관 Pipeline의 **최신** 정의다. 직접 연결이 있으면 간접 사용처도 안전해진다. 기본·규칙·정의 사용처가 없는 Pipeline은 기존/닫힌 run이 있어도 보관할 수 있고, 그 run은 고정 판으로 계속 돈다. 삭제하지 않으며 읽기 전용 이름/원장은 보존한다.
- archive/rename/setDefault/setRule/setAutomaticPick action 이름은 각각 archivePipelineAction, renamePipelineAction, setDefaultPipelineAction, setPipelineRuleAction, setAutomaticPickAction이다. pipeline-settings.server.ts는 mutation 다섯 개만 export한다.



| 함수 | 입력 | 거부 조건과 사유 | 쓰는 것 |
|---|---|---|---|
| `archivePipeline` | `pipelineId` | 기본이면 `Can't archive <name>: it's the default pipeline.` · 비보관 파이프라인이 직접 연결 중이면(`refStep(id)`가 steps에 있음) `Can't archive <name>: <names> use it.` · 규칙 대상이면 `Can't archive <name>: the <type> rule points to it.` | `archivedAt = now()` |
| `renamePipeline` | `pipelineId`, `name` | trim 결과가 1–40자가 아니면 `Use 1 to 40 characters for the pipeline name.` · 자기 자신을 뺀 비보관 이름과 겹치면 `Another pipeline already uses this name. Choose a different one.`(지금 이름 그대로 바꾸기는 성공한다) | `name` |
| `setDefaultPipeline` | `pipelineId` | 실행 판이 없으면(조각) `PIPELINE_CANNOT_RUN_ITEMS` | `Project.defaultPipelineId` |
| `setPipelineRule` | `type`(`ITEM_TYPES`), `pipelineId \| null` | `type`이 `ITEM_TYPES`에 없으면 `Invalid pipeline settings request.` · 대상에 실행 판이 없으면 `PIPELINE_CANNOT_RUN_ITEMS` | `PipelineRule` upsert, `null`이면 delete |
| `setAutomaticPick` | `enabled` | 접근 불가 | `Project.autoProposeEnabled` |

- `setAutomaticPick`은 head 디스패치만 바꾼다. 이미 열린 pm 단독 run의 `board_propose`는 막지 않는다.
  지금도 `propose` 노드를 빼면 head 디스패치만 멈추고 `decidePropose`는 노드를 보지 않기 때문에, 그 동작을 그대로 둔다(사용자 확인 완료).
- 자동 스카우트를 끄면 열린 단독 scout run을 닫는다(`automatic-scout.ts:31`–`:36`). pm에는 이 동작을 더하지 않는다.

### 8. 웹 (계약·컴포넌트 수준)

FSD 방향(`pages → widgets → features → entities → shared`)과 공개 API import 규칙을 따른다(`docs/architecture/fsd.md`).

| 영역 | 변경 |
|---|---|
| `src/app/(app)/p/[slug]/pipeline/page.tsx` | `loadCurrentVersionView` 대신 `loadPipelinesView`를 읽는다. 보관·이름·기본·규칙·자동 선택 액션을 bind해서 넘긴다. `editable` 판정(`access.available && allowsPipelineEdit(access.plan)`)은 그대로다 |
| `features/edit-pipeline/model/rail-state.ts` | 조작 대상을 `Graph`에서 정의 `{ steps, gates }`로 바꾼다. `check`는 `validateDefinition`을 돌리고, 페이지가 넘긴 프로젝트 정의 묶음으로 `recompose` 미리보기를 돌려 사유를 그대로 돌려준다. `addNode`의 골격 자리 끼우기는 앵커가 있을 때만 쓰고, 없으면 끝에 붙인다. `insertRef(def, pipelineId, before)`를 새로 만들고 `before:null`은 끝에 추가한다. `removeNode`는 연결을 뺄 때 이음매 게이트도 함께 뺀다. `addNode`의 `propose` 분기(맨 앞에 끼우기)는 쓰이지 않게 되므로 뺀다. `addSlot`의 새 id는 로컬 steps뿐 아니라 현재 정의를 펼친 결과의 프로젝트 슬롯 id까지 예약한 뒤 기존의 `agent`, `agent#2`, … 중 처음 비어 있는 것으로 정한다. 연결 대상의 정의·id는 고치지 않으며, legacy 별칭과 명시 슬롯 혼합은 기존 core 사유로 계속 거부한다 |
| `features/edit-pipeline/ui/pipeline-rail.tsx` | 연결은 접힌 블록 카드 `[<이름> · N nodes]`로 그리고 "Edit <이름>" 링크를 단다. 레일 위에 **Show expanded** 토글을 두고, 켜면 `expand()` 결과를 읽기 전용으로 블록 테두리와 함께 그린다(결정 15). 간선 메뉴에 "Use <이름> here"를 더한다. 저장 버튼 옆에 `usersOf`로 "Also changes: …"를 보여준다. 게이트 0개 경고는 이 저장 뒤 **항목을 받는 그래프**로 판정한다. recompose 미리보기의 runnable 결과(편집 중인 Pipeline이 항목을 받으면 그것, 그리고 Also changes의 사용처) 중 게이트가 0개인 것이 하나라도 있으면 지금 경고 문장과 "Save without a gate" 두 번 누르기를 쓴다. 항목을 받지 않는 조각은 자기 게이트 수로 경고하지 않는다(경고 문장의 plan·implement가 조각에는 없다). 반대로 조각 저장이 사용처의 마지막 게이트를 없애면 경고한다. 추가 가능 목록(지금 `missing = NODE_KINDS.filter(…)`)은 `STEP_KINDS`에서 뽑는다 |
| `features/edit-pipeline/ui/` 새 컴포넌트 | 파이프라인 목록이다. 이름, Default 배지, "Runs items"/"Used inside" 태그(PipelinesView의 `runnable` 존재로 계산하며 가상 기본을 포함한다; 편집 미리보기는 core로 판정), New pipeline, Rename, Archive를 둔다. 규칙(`type → 파이프라인` 셀렉트 4개), 기본 선택, **Automatic picking** 스위치도 둔다. 스위치는 자동 스카우트 컨트롤(`automatic-scout-control.tsx`)과 같은 모양이고, 꺼졌을 때의 문장은 core의 AUTO_PROPOSE_DISABLED_REASON이다(§8 문구 표). 편집 컨트롤을 언제 바꿀 수 있는지는 아래 계약의 `editable` 규칙을 따른다 |
| `features/edit-pipeline/api/` | `savePipeline`(위)과 보관·이름·기본·규칙·자동 선택 액션을 둔다. 각 액션은 `requireProjectWrite` 다음에 플랜 검사(`allowsPipelineEdit`, 자동 선택도 allowsPipelineEdit)를 하고 서비스를 부른다 |
| `pages/project-pipeline/ui/project-pipeline-page.tsx` | 목록과 선택된 파이프라인의 레일을 조합한다. 버전 줄은 **정의 판**을 보여 준다(`Version N · saved … · applies to items proposed from now on.`). "Read as text"는 펼친 결과를 커서 순서로 보여 준다 |
| `features/propose-item` | `ProposeButton`에 `pipelines: { id, name }[]`와 `preselected`(서버가 `routePipeline(row.type, rules, defaultId)`로 계산)를 넘기고 **Pipeline** 셀렉트를 더한다. `runnable`이 있는 파이프라인만 넣는다(아직 물질화되지 않은 가상 기본을 포함한다). 액션과 `proposeInputSchema`에 `pipelineId`를 더한다 |
| `pages/project-backlog` | 위 목록과 미리 선택값을 행마다 넘긴다 |
| `pages/project-board/api/project-board.server.ts`·`model/briefing.ts` | Team은 지금 "현재 판 노드"(`project-board.server.ts:18`, `briefing.ts:150`)에서 뽑는다. 이것을 비보관 파이프라인 `runnable` 노드의 합집합으로 바꾸되 `propose`는 뺀다(가상 기본은 기본 그래프. 그래서 새 프로젝트의 Team이 지금처럼 기본 그래프의 에이전트를 보여 준다). migration A가 그대로 둔 옛 판에는 `propose`가 남아 있고 `slotAgent("propose")`가 `pm`이라(`briefing.ts`의 `agentsOf`), 빼지 않으면 Automatic picking을 꺼도 Team에 pm이 남는다. pm은 `autoProposeEnabled`일 때만 지금 자리(맨 앞)에 둔다. 나머지 에이전트는 `PipelinesView` 순서(§4: 기본 먼저)로 각 실행 판의 노드를 이어 붙였을 때 처음 나온 자리에 둔다. 카드에는 `run?.version.pipeline?.name ?? "Default"`를 보여준다(run이 없는 옛 항목과 판에 Pipeline이 없는 옛 writer 판은 Default — §4 loadItemPipelineView와 같은 대체값) |
| `pages/board-item` + 새 feature `change-item-pipeline` | 파이프라인 이름을 보여준다. Proposed이고 실행이 없고 옮겨 갈 다른 파이프라인이 있으면 **Change pipeline** 셀렉트를 보여준다(선택지 규칙은 아래 계약). 액션은 `board.changePipeline`을 부르고 `expectedUpdatedAt`을 보낸다 |
| `widgets/turn-banner/model/turn.ts:79` | "With no Propose node, …"를 "With automatic picking off, …"로 바꾼다 |
| `widgets/history-feed/model/history-row.ts` | `note`가 `pipeline-changed:`로 시작하면 "Pipeline changed"를 보여준다. 이름은 서버에서 판 id로 조회해 DTO로 넘긴다 |
| `entities/pipeline/model/labels.ts` | `gateLabel`이 **선택 인자**로 이름 조회를 받아 `before-pipeline:<id>`를 이름으로 읽는다. 인자가 없으면 지금과 같다. 실행 판의 게이트에는 `before-pipeline:`이 없으므로, 편집기 밖의 기존 호출(`review-gate/ui/inbox-card.tsx`, turn-banner, history-row)은 그대로 둔다. `autoEdgeLabel`의 `propose` 분기는 옛 판 표시용으로 남긴다 |

### 웹 데이터·상태·문구 계약

- 보드 loader는 **closed run도 포함한** 별도 이름 조회를 해야 한다. 현재 열린 커서 조회만 확장하면 끝난 항목의 이름이 Default로 잘못 보인다. brief 모델의 BoardRow/ActivityItem과 ActivityRow까지 이름을 전달한다. Team은 비보관 Pipeline의 `runnable` 노드 합집합(가상 기본 포함, `propose` 제외)과 autoProposeEnabled의 pm을 쓰고 roster 제한을 유지한다.
- 항목 route는 새 읽기 전용 loadItemPipelineView로 run.version.pipeline.name, format/closedAt, AgentRun 존재에 따른 change eligibility를 읽고 목록/규칙을 GET reader로 읽는다. getWithHistory의 MCP DTO는 그대로 둔다. 서버에서 계산한 canChange·현재 pipelineId와 ISO updatedAt을 새 feature에 넘긴다. 새 action은 기존 항목 action(`review-gate.server.ts`의 `retryAcceptance`)처럼 먼저 `requireProjectWrite`로 소유자와 프로젝트 쓰기 가능(미선택·해제 거부)을 확인한다. 서비스도 `inProjectTransaction`이 잠금 뒤 `readProjectAccessIn`으로 미선택·해제·무결성을 다시 거부하고(`board-query.ts:56`–`:57`) `changePipeline`이 소유자를 본다. action의 앞단 검사는 서비스를 부르기 전에 같은 사유로 끝내려는 것이다(다른 항목 action과 같다). 그다음 date/id/key를 검증하고(틀리면 `Invalid pipeline change request.`) 그 세션 userId를 마지막에 지정한다.
- History의 이름 조회는 서버의 새 읽기 전용 loadPipelineChanges로 수행한다. pipeline-changed note의 두 판 id를 프로젝트 범위로 묶어 한 번에 조회하고 보관 Pipeline도 포함한다. 이벤트 DTO에 선택적 `pipelineChange: { fromName: string; toName: string } | null`을 더해 항목 route·project-history loader·history-view·HistoryEventInput까지 전달한다. malformed/missing note는 기존 표시로 안전하게 돌아간다. text는 Pipeline changed, 부가 note는 두 이름의 화살표 표시다. JSON/HTML을 이름으로 해석하지 않는다. pagination/시간 창/커서는 유지한다. 웹 loader가 원래 events에 metadata를 추가하고, MCP deps의 getWithHistory/boardWithBacklogView에는 run·pipelineChange·목록을 추가하지 않는다.
- 목록에서 기존 Pipeline을 고르면 레일 key는 프로젝트·pipelineId다. plan·쓰기 가능 여부는 props로 반영하며 초안을 remount하지 않는다. 새 서버 snapshot이 도착해도 dirty draft를 덮어쓰지 않고 외부 변경 경고와 명시 reload를 둔다. 이때 자기 정의 번호만 비교하지 않는다. 자식 정의가 바뀌면 부모의 정의 번호는 그대로이고 실행 판·펼친 결과만 바뀔 수 있기 때문이다(§6 8번). 참조하는 직·간접 정의의 id·판과 실행 그래프를 포함해 변경을 감지하고, 보존한 초안의 preview·Also changes·슬롯 예약 id·게이트 0개 경고를 최신 snapshot으로 다시 계산하며 이전의 `Save without a gate` 확인은 해제한다. clean 상태에서만 새 자기 정의를 반영한다. 로컬 변경이 있는 Pipeline 이동은 명시 discard 확인을 거친다. 저장 중 identity를 바꾸지 않는다. 늦은 저장 응답은 이동/unmount한 레일에 적용하지 않는다. 레일에 열려 있던 Pipeline을 보관하면, 보관 Pipeline은 목록에서 빠지므로 기본 Pipeline을 연다. 새 Pipeline은 pipelineId:null·expectedVersion:0·`{ steps: [], gates: [] }`인 로컬 초안으로 시작한다. 빈 초안은 저장하지 못하지만 첫 단계는 추가할 수 있어야 한다. 빈 레일과 레일 맨 끝에도 일반 노드·프로젝트 슬롯·연결을 추가하는 진입점을 둔다. 기존 노드 앞 간선의 메뉴만으로 구현하면 빈 초안에서 시작하거나 마지막에 연결을 붙일 수 없다. 첫 저장이 성공하면 돌려받은 pipelineId의 Pipeline을 연다(그 Pipeline이 목록에 들어온다). 첫 저장 전 버전 줄은 `New pipeline · not saved yet`(제안값)이고, 가상 기본의 `Default pipeline · not saved yet`은 그대로다.
- 저장은 자신 expectedVersion을 CAS하고 **부모가 최신 정의를 따른다는 결정 4**를 유지한다. 오래된 의존 정의를 같이 저장하지 않는다. 현재 부모 영향은 잠긴 서버가 재조립하며 성공 후 preview 목록을 다시 읽는다.
- ProposeButton의 pipeline 선택은 서버가 고른 파이프라인을 거부하면(보관·없음은 `Pipeline not found.`, 조각은 조각 선택 거부) 미리 선택값으로 되돌리고 서버가 돌려준 사유를 그대로 보인다. 클라이언트에 사유 문장의 사본을 두지 않는다. row identity·규칙·목록 변경은 pending이 아닐 때 반영하고, 다시 읽은 목록에 고른 값이 없으면 미리 선택값으로 맞춘다. pending 입력 snapshot을 유지하고 실패 시 입력을 보존한다.
- Change pipeline은 Proposed·slots-v1·열린 run·AgentRun 없음과 프로젝트 write 가능을 모두 만족해야 보인다. 선택지는 PipelinesView 순서의 `runnable !== null` Pipeline에서 현재 Pipeline(`ItemPipelineView.pipelineId`)을 뺀 것이고, 현재 이름은 셀렉트 밖에 보인다. 선택지가 비면(예: 항목을 받을 수 있는 파이프라인이 기본 하나뿐인 프로젝트) 컨트롤을 보이지 않는다. 기본 그래프에는 before-plan 게이트가 있어 대부분의 Proposed 항목이 앞의 조건을 모두 만족하므로, 이 조건이 없으면 고를 것이 없는 셀렉트가 항목마다 보인다. Free 다운그레이드에서는 기존 대상 선택을 허용한다. server recheck/CAS가 최종 기준이다. stale/전송 유실은 서버 상태를 명시 reload해 확인하며 자동 재전송하지 않는다. 서비스의 `stale` 사유는 원문으로 보이지 않고 product-copy §12의 `stale` 행 문장으로 바꿔 보인다(기존 항목 action `review-gate.server.ts`의 `REASON_MESSAGE`와 같다). 응답 유실 문장은 아래 문구 표의 "항목 변경 회복"이다. 셀렉트에서 고른 값은 항목 identity(boardItemId·현재 pipelineId·updatedAt)가 바뀌면 처음 상태로 돌린다. 변경에 성공하면 고른 Pipeline이 현재 Pipeline이 되어 선택지에서 빠지기 때문이다.
- 연결 블록은 collapse가 기본이고 expanded는 읽기 전용이다. 항목을 받지 않는 Pipeline(실행 판이 없고 기본·규칙 대상이 아닌 Pipeline과 첫 저장 전 새 Pipeline — mustRun이 아닌 것)을 편집할 때는 REQUIRED_NODES의 제거를 UI에서 막지 않는다. 항목을 받는 Pipeline에서는 지금처럼 앵커에 Remove가 없다(`pipeline-rail.tsx`의 `removable`). gate 0 경고는 위 `pipeline-rail.tsx` 행의 규칙(이 저장 뒤 항목을 받는 펼친 그래프)으로 판단한다. junction gate tooltip은 expand가 찾은 첫 노드 gate로 기존 gateTooltip을 호출한다. 이름 라벨은 entity public API로 전달한다.
- 목록의 편집 컨트롤(New pipeline·Rename·Archive·규칙 셀렉트·기본 셀렉트)과 Automatic picking 스위치는 레일과 같은 `editable`(`access.available && allowsPipelineEdit(access.plan)`)을 따른다. `editable`이 아니면 New pipeline·Rename·Archive는 보이지 않고, 규칙·기본 셀렉트와 스위치는 현재 값만 보이며 바꿀 수 없다. 사유 문장은 레일과 같다(Free는 `PIPELINE_EDIT_PLAN_GATE`, 미선택·해제는 프로젝트 회복 사유). 지금 레일의 "Read-only on Free"·"editing controls are absent"(product-copy §18)와 같은 원칙이다. Automatic scouting 스위치는 지금처럼 `access.available`만 따른다. Put on the board의 Pipeline 선택과 Change pipeline은 이 규칙이 아니라 각자의 조건을 따른다(§11). 서버 action·서비스의 거부가 최종 기준이다.

문구는 다음 제안값을 구현 계약으로 사용한다. product-copy는 Phase 5에서 §10대로 고치고, 같은 PR 안에서 코드·시험과 맞춘다. 이 문서가 바꾸는 문장 중 product-copy를 읽는 시험(copy-lock 블록 시험들, `tools.test.mjs`·`owner-tools.test.mjs`·`run-rules.test.mjs`·`briefing.test.mjs`·`inbox-card-boundary.test.ts`·`plugin/bin/harness-watch.test.mjs`)이 보는 문장은 없어서, Phase 2–4 사이에도 그 시험은 깨지지 않는다.
시각 배치·색·간격은 이미 제외한 디자인 검토 대상이며 정책/데이터 계약을 다시 미확정 상태로 되돌리지 않는다.

| 표시/사유 | 값·소유 |
|---|---|
| 설정·기본·블록 | Automatic picking, Default, Show expanded, Also changes, Runs items, Used inside, New pipeline, 첫 저장 전 버전 줄 `New pipeline · not saved yet`(제안값) / product-copy §18 |
| PM off | AUTO_PROPOSE_DISABLED_REASON (§2) / core → run-rules의 head 사유(MCP `pipeline_next`)·Automatic picking 스위치의 꺼짐 문장. 배너의 Nothing open 문장은 지금처럼 그대로 둔다(지금도 propose 노드를 빼면 같은 문장이다). 배너에서 바뀌는 것은 첫 실행 3단계 문장(`turn.ts:79`)뿐이다 |
| 새 저장 propose 거부 | PROPOSE_SETTING_REASON (§2) / core |
| 조각 선택 거부 | This pipeline can't run items on its own. Use it inside another pipeline. / run-query(PIPELINE_CANNOT_RUN_ITEMS) → board-query(항목 생성·변경)·pipeline-settings-query(기본·규칙) |
| 저장이 사용처를 깨뜨림 | `Saving would break <name>: <reason>` / definition-save-query |
| 없거나 남의·보관 대상 | `Pipeline not found.` / run-query(PIPELINE_NOT_FOUND) → definition-save-query·pipeline-settings-query·board-query(항목 생성·변경) |
| 이름 길이·중복(저장의 새 Pipeline·이름 바꾸기 공통) | `Use 1 to 40 characters for the pipeline name.` · `Another pipeline already uses this name. Choose a different one.` / definition-save-query·pipeline-settings-query |
| 변경 불가 | The pipeline can change only while the item is proposed and nothing has run on it yet. / board-query |
| 소유자가 아닌 항목 변경 | `pipeline change access denied` / board-query(`acceptance retry access denied`와 같은 꼴) |
| Free의 정의 저장·설정 다섯 개 거부(Automatic picking 포함) | 기존 문장 `Pipeline editing opens on Pro. The default pipeline stays as is.` / core `PIPELINE_EDIT_PLAN_GATE`(plan-gate.ts가 다시 내보냄) → 각 action·서비스·레일 |
| 형식이 틀린 입력(직접 POST에서만 닿는다) | 저장은 기존 `Invalid pipeline save request.`, 설정 다섯 개는 `Invalid pipeline settings request.`, 항목 변경은 `Invalid pipeline change request.`(기존 `Invalid … request.` 관례) / 각 action·서비스 |
| 보관 거부 | §7 세 사유 / pipeline-settings-query |
| 변경 History | Pipeline changed / product-copy §11의 같은 상태 행 목록(§19는 §11을 따른다)·history-row |
| 설정 회복 | 기존 Automatic scouting의 lost-response 회복 문구/무재시도 원칙 사용 |
| 항목 변경 회복 | `stale`은 product-copy §12의 기존 `stale` 행 `The board changed. Refresh and try again.` · 응답 유실은 제안값 `Couldn't confirm whether the pipeline changed. Refresh to check the current state before trying again.`(Run acceptance again의 Unknown response와 같은 꼴, product-copy §11) / change-item-pipeline action·컨트롤 |

성공한 save/설정/change action은 `revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout")`을 사용한다(`src/fsd/shared/routes/project.ts`의 `"/(app)/p/[slug]"`, 연결 관리 action과 같은 상수).
설치된 Next 16.3.3 revalidatePath 문서의 route-group layout 예제를 따른다. 패턴 경로라 현재 프로젝트만이 아니라 모든 프로젝트의 탭 아래 페이지가 다음 방문 때 다시 그려진다(상수 주석, 문서의 "all matching pages"). 연결 관리 action과 같은 범위다. 시험은 성공한 action만 이 두 인자로 부르고 실패·stale·형식 오류에서는 부르지 않는지 본다.
문서 읽기는 Server Action으로 export하지 않는다. 새 mutation만 use server 모듈과 index.server public API로 공개한다.

### 9. 에이전트·플러그인 계약

- **`pipeline_next`**: 항목 응답의 모양이 그대로다. `version`(`run.version.version`, 양의 정수), `format`(`slots-v1`), 노드와 게이트 id(`before-<kind>`)가 지금과 같다.
  펼친 실행 판에는 연결이나 `before-pipeline:` 게이트가 남지 않기 때문이다. head 응답 모양도 그대로이고, 사유 문자열만 새것이다.
  `watch.mjs`는 `reason`이 문자열인지만 본다(`watch.mjs` `actionableWork`).
- **`board_propose`**: 입력 스키마(`src/server/mcp/tools.ts:183`)를 바꾸지 않는다. zod 객체가 모르는 키를 버리므로 pm은 파이프라인을 고를 수 없고, 서버가 규칙으로 정한다.
- **`gate_approve`**: 설명에 나열된 게이트 id(`src/server/mcp/owner-tools.ts:36`)는 펼친 결과에서도 그대로다.
- **플러그인**: `plugin/lib/pipeline.mjs`는 다시 동기화한다(`npm run sync:plugin-lib`, `npm run check`가 검사).
  플러그인 런타임은 이 모듈을 import하지 않으므로 `plugin.json` 판을 올리지 않는다. 사용자에게 배달할 필요가 없다.
- **템플릿**: 바꾸지 않는다(Scope 참조).

### 10. 문서

| 문서 | 변경 |
|---|---|
| `docs/architecture/protocol.md:288`–`:295` | "순서의 단일 출처"를 `pipeline.mjs` + `PipelineDefinition`(편집 원본) + `PipelineVersion`(펼친 실행 판)으로 바꾼다. "앵커와 슬롯"에서 `propose`를 빼고 정의·연결·이음매 게이트·조각 규칙을 더한다. "버전과 회차"에 프로젝트 일련번호와 정의 판을 더한다. 자동 선택 설정 항목을 자동 발굴 옆에 더한다. "버전과 회차"의 "항목은 시작한 버전에 고정된다"에는 예외 하나를 적는다: Proposed이고 그 run에 묶인 AgentRun이 없는 항목은 소유자 웹 Change pipeline이 User → Project 잠금과 expectedUpdatedAt CAS 아래 다른 Pipeline의 현재 실행 판으로 다시 고정하고 새 entryId로 머리에 세우며, 같은 상태 이벤트 `pipeline-changed:<옛 판 id>:<새 판 id>`를 human/web으로 남긴다(§5). 그 항목의 `pipeline_next` version·entry가 새 판의 것이 된다. 이 action은 MCP 두 서버에 없다 |
| `docs/architecture/protocol.md:401` | "Propose 노드 여부"를 "PM 자동 선택 설정"으로 바꾼다. 같은 줄의 "head scout는 Propose 노드 없이도 돈다"는 "head scout는 PM 자동 선택 설정과 상관없이 돈다"로 바꾼다(`decideHead`는 후보가 없을 때의 scout 분기를 그 설정보다 먼저 본다). 같은 항목 첫 줄(`:396`)의 후보 정의(최신 행이 미결도 보류도 아닌 백로그 항목)는 그대로 둔다 |
| `docs/architecture/invariants.md:51`–`:56` | 게이트를 빼는 일이 이제 소유자의 **정의** 편집임을 적는다. 인수 앵커 규칙이 실행 판(펼친 결과)에 걸린다는 점을 적는다 |
| `docs/architecture/invariants.md:81` | "page GET은 기본 PipelineVersion도 생성하지 않는다"에 기본 `Pipeline` 행을 더한다 |
| `docs/architecture/system-overview.md:90` | "파이프라인 그래프와 커서" 행에 `Pipeline`·`PipelineDefinition`·`PipelineRule`을 더한다 |
| `docs/architecture/verification.md` | "저장소 스크립트" 표에 `rehearse-multiple-pipelines.ts` 행을 더한다. 진입점은 "구현 후 실행"의 리허설 명령, 시점은 격리 TEST_DATABASE_URL·fresh production build에서 수동, 하는 일은 검증 목적지 표의 "실제 화면·전송" 행이다(기존 `rehearse-automatic-scout.ts` 행과 같은 꼴) |
| `docs/conventions/product-copy.md` | §18 Pipeline tab: 목록, 블록, 펼친 결과 토글, 규칙, 기본, Automatic picking(Automatic scouting 블록과 같은 꼴. 스위치가 꺼졌을 때의 문장은 AUTO_PROPOSE_DISABLED_REASON이고 Automatic scouting의 "Off:" 줄 옆에 둔다. "the shared Nothing open detail" 줄에는 더하지 않는다 — 배너는 바뀌지 않는다), 정의 판 버전 줄, `Propose`를 앵커 이름과 "Propose alone has no auto label" 문장에서 뺌. 같은 절의 세 문장도 이 변경으로 틀려지므로 고침: "A node card's menu offers **Remove** for optional nodes"는 항목을 받지 않는 Pipeline(조각·첫 저장 전 새 Pipeline)을 편집할 때 앵커에도 Remove가 있다는 것으로, "the rail runs the same `validateGraph` the save action does"는 레일이 저장 서비스와 같은 validateDefinition·recompose를 돈다는 것으로(저장 action은 더는 validateGraph를 돌리지 않는다, §6), "Zero gates is allowed, and saving warns first"는 이 저장 뒤 항목을 받는 그래프에 게이트가 없을 때 경고한다는 것으로(§8 `pipeline-rail.tsx` 행). 목록의 편집 컨트롤도 레일처럼 Free·사용 불가 프로젝트에서 읽기 전용임을 적고(§8 계약), 첫 저장 전 새 Pipeline의 버전 줄 `New pipeline · not saved yet`을 "Without a persisted version" 줄 옆에 적음. 새 초안은 비어 있고 저장 전에 단계를 추가해야 한다는 것, 빈 레일·맨 끝에도 기존 Add/Use 조작이 있다는 것, 연결 내부 슬롯과도 id가 겹치지 않게 추가한다는 것을 적는다. 자기 정의 번호가 그대로여도 참조 정의 변경은 외부 변경으로 안내하고 preview·게이트 확인을 갱신한다(§8). "Automatic scouting can still be changed on Free." 옆에 Automatic picking은 Free에서 바꿀 수 없다(스위치 비활성, 같은 `PIPELINE_EDIT_PLAN_GATE` 문장)를 적음. §12: 이 문서가 새로 만드는 거부 사유를 모두 더한다 — §2의 `pipeline must have steps and gates`·`step and gate ids must be strings`·`a pipeline needs at least one step`·`a step appears twice`·`unknown step: …`·`it uses a pipeline that is archived or missing`·`pipelines can't use each other in a loop`·`<a> must come before <b>`·PROPOSE_SETTING_REASON, 그리고 §8 문구 표의 서버 사유 전부(조각 선택·저장 깨짐·Pipeline not found.·이름 길이·이름 중복·변경 불가·`pipeline change access denied`·보관 거부 셋). 형식이 틀린 입력의 두 새 문장은 기존 "Malformed pipeline graph/version inputs return …" 줄 옆에 같은 꼴로 적는다. 기존 `— (pipeline save, plan)` 행은 정의 저장과 설정 다섯 개(Automatic picking 포함)의 Free 거부로 넓힌다. 코드에서 사라지는 `propose must be first` 행은 뺀다. §5: 배너 문구. §6: 보드 카드의 파이프라인 이름. Team 행 첫 문장 "the agents the current pipeline dispatches, in graph order"를 항목을 받을 수 있는 비보관 파이프라인들의 합집합과 그 순서(§8 Team)로, "pm appears when the graph has a Propose node"를 Automatic picking 기준으로 바꾼다. §8: Put on the board의 Pipeline 필드. §11: 항목의 Change pipeline(현재 이름, 선택지 규칙, §8 문구 표의 "항목 변경 회복" 문장), 그리고 같은 상태 행 목록("Same-state rows show …")에 **Pipeline changed**(부가 note는 두 이름의 화살표)를 더한다. 이 목록에 없는 note는 "Unknown notes keep the original transition"으로 읽히기 때문이다. §13: pipeline_next 설명의 head 사유 `no propose node on this pipeline — …`를 AUTO_PROPOSE_DISABLED_REASON으로(입출력 schema 보존). §19: 같은 상태 label은 §11을 따르므로(“Same-state labels follow §11”), 포함 규칙 표의 `actor = human` 행 설명에 파이프라인 변경을 더한다. copy-lock `history-tab` 블록에는 넣지 않는다(Acceptance failed 같은 다른 같은 상태 label도 블록 밖이다) |

### 11. 플랜과 다운그레이드

현행 동작(코드 확인):

- 저장된 그래프는 플랜과 상관없이 계속 쓰인다. `ensureCurrentVersion`은 플랜을 보지 않는다(`run-query.ts:21`–`:26`).
- 편집만 막힌다(`edit-pipeline.server.ts:17`).
- 플랜 밖 에이전트는 실행을 열 때 거부된다(`src/server/agents/next.ts:86`). 그래서 그런 노드에 선 항목은 멈춘다.

이 제안은 같은 원칙을 따른다(결정 10).

- **Free**: 정의 저장, 만들기, 이름 바꾸기, 보관, 기본·규칙 변경이 웹 액션에서 `PIPELINE_EDIT_PLAN_GATE`로 거부된다. 아직 그래프가 없는 신규 Free 프로젝트는 Free 기본 그래프 하나를 따른다. 저장된 기본 정의/판은 현재 plan으로 덮어쓰지 않는다. Automatic picking 변경도 같은 문장으로 거부한다. 다운그레이드가 잠금 대기 중에 일어나도 잠금 안의 서비스가 같은 core 상수로 거부한다.
- **Pro·Max → Free**: 이미 만든 파이프라인, 연결, 규칙, 기본 선택은 그대로 돈다. 규칙도 계속 라우팅한다. 편집만 막힌다.
  Put on the board의 파이프라인 선택과 조건을 만족하는 Change pipeline은 기존 것 중에서 고르는 일이므로 막지 않는다(사용자 확인 완료).

## Affected Files

다음 목록은 실제 파일 열거와 역방향 심볼/DB writer 검색을 결합한 구체적 경계다.
update는 아래 계약 변경 대상이며 check는 보존 회귀 확인 대상이다. check 파일은 필요 없이 수정하지 않는다.
새 파일의 이름은 여기서 정하고, 별도 화면 배치 결정으로 파일 범위를 늘리지 않는다.

### 기존 파일

```text
update packages/core/pipeline.mjs
update packages/core/pipeline.d.mts
update packages/core/pipeline.test.mjs
check packages/core/qa.test.mjs
check packages/core/watch.mjs
check packages/core/watch.test.mjs
check packages/core/deliver.mjs (defaultGraph comment; delivery contract unchanged)
update plugin/lib/pipeline.mjs (sync only)
check plugin/lib/watch.mjs
check plugin/lib/deliver.mjs (delivery comment mirror; behavior unchanged)
update prisma/schema.prisma
check prisma/migrations/20260910044819_pipeline_version_and_run/migration.sql (historical; do not edit)
check prisma/migrations/20260914090000_remove_individual_project_ownership_shadow/migration.sql (historical; do not edit)
check prisma/migrations/20260917000000_pipeline_agent_slots/migration.sql (historical; do not edit)
update src/server/pipeline/run-query.ts
update src/server/pipeline/run-query.test.ts (nextFor double. §4대로 nextFor의 공개 ensureRun wrapper는 withPipelineWrite로 $transaction을 부르므로 double에 $transaction과 잠금 질의를 더한다)
update src/server/pipeline/run.ts
update src/server/pipeline/run-rules.ts
update src/server/pipeline/run-rules.test.mjs
update src/server/pipeline/board-query.ts
update src/server/pipeline/board-query.test.ts
update src/server/pipeline/board.ts
check src/server/pipeline/board-rules.ts (decidePropose·countPickable, 보류 거부 그대로)
check tests/server/integration/hold-propose.test.ts (보류 key 제안 거부와 후보 0 — 바뀐 propose의 보존 회귀)
update src/server/pipeline/history-page.ts
check src/server/pipeline/history-items.ts
delete src/server/pipeline/version-save-query.ts (imports moved first)
check src/server/mcp/deps.ts
check src/server/mcp/views.ts
update src/server/mcp/views.test.ts
check src/server/mcp/tools.ts (도구 설명에 propose 노드 문구가 없다. board_propose·pipeline_next 설명과 입력 schema 그대로)
update src/server/mcp/tools.test.mjs (board_propose 입력 schema에 pipelineId가 없다는 단언을 더한다. copy lock·등록 도구 집합 그대로)
check tests/server/inbox-card-boundary.test.ts (proposeInputSchema는 api/propose-item.server.ts만 import하고 barrel·client에 들어가지 않는다 — Pipeline 셀렉트가 스키마를 가져가지 않게)
check src/server/mcp/owner-tools.ts
check src/server/mcp/owner-tools.test.mjs
check src/server/mcp/owner-deps.ts (gate advice가 nextFor(prisma, …)를 부른다)
check src/server/agents/next.ts
check src/server/agents/next.test.ts
check src/server/agents/run-query.ts (User 잠금·entry 재검사 — changePipeline과 agent_next 경합 경계)
check src/server/agents/run-query.test.ts (결합 실행·stale 영수증 보존)
check src/server/project-access-query.ts
check src/server/project-availability-service.ts (owner lock shared with plan changes)
check src/server/auth/guard.ts
check src/server/automatic-scout.ts
update src/app/(app)/p/[slug]/pipeline/page.tsx
update src/app/(app)/p/[slug]/backlog/page.tsx
update src/app/(app)/p/[slug]/items/[key]/page.tsx
check src/app/(app)/p/[slug]/page.tsx
check src/app/(app)/p/[slug]/history/page.tsx
update src/fsd/widgets/turn-banner/model/turn.ts
update src/fsd/widgets/turn-banner/model/turn.test.ts
update src/fsd/entities/pipeline/index.ts
check src/fsd/entities/pipeline/model/gate-copy.test.ts
check src/fsd/entities/pipeline/model/gate-copy.ts
update src/fsd/entities/pipeline/model/labels.test.ts
update src/fsd/entities/pipeline/model/labels.ts
check src/fsd/features/review-gate/ui/inbox-card.tsx (gateLabel 소비자. 선택 인자라 호출 그대로)
check src/fsd/features/edit-pipeline/api/automatic-scout.server.ts
update src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts
update src/fsd/features/edit-pipeline/index.server.ts
update src/fsd/features/edit-pipeline/index.ts
check src/fsd/features/edit-pipeline/model/pipeline-save-state.test.ts (복구 문구 copy lock만 남아 있다)
update src/fsd/features/edit-pipeline/model/pipeline-save-state.ts
update src/fsd/features/edit-pipeline/model/save-pipeline-input.ts
update src/fsd/features/edit-pipeline/model/save-pipeline-input.test.ts
update src/fsd/features/edit-pipeline/model/plan-gate.ts (PIPELINE_EDIT_PLAN_GATE를 core에서 다시 내보낸다. 문장·import 경로 그대로)
update src/fsd/features/edit-pipeline/model/rail-state.test.ts
update src/fsd/features/edit-pipeline/model/rail-state.ts
check src/fsd/features/edit-pipeline/ui/automatic-scout-control.test.ts
check src/fsd/features/edit-pipeline/ui/automatic-scout-control.tsx
update src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs
update src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx
update src/fsd/features/propose-item/api/propose-item.server.ts
update src/fsd/features/propose-item/index.server.ts
update src/fsd/features/propose-item/index.ts
update src/fsd/features/propose-item/model/propose-input.test.ts
update src/fsd/features/propose-item/model/propose-input.ts
update src/fsd/features/propose-item/ui/propose-button.tsx
update src/fsd/pages/board-item/index.ts
check src/fsd/pages/board-item/model/item-docs.test.ts
check src/fsd/pages/board-item/model/item-docs.ts
update src/fsd/pages/board-item/ui/board-item-page.test.ts
update src/fsd/pages/board-item/ui/board-item-page.tsx
update src/fsd/pages/project-backlog/index.ts
update src/fsd/pages/project-backlog/ui/project-backlog-page.tsx
update src/fsd/pages/project-board/api/project-board.server.ts
update src/fsd/pages/project-board/index.server.ts
update src/fsd/pages/project-board/index.ts
check src/fsd/pages/project-board/model/briefing.fixture.mjs
update src/fsd/pages/project-board/model/briefing.test.mjs
update src/fsd/pages/project-board/model/briefing.ts
update src/fsd/pages/project-board/ui/project-board-page.test.mjs
update src/fsd/pages/project-board/ui/project-board-page.tsx
update src/fsd/pages/project-pipeline/index.ts
update src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx
update src/fsd/widgets/history-feed/index.ts
update src/fsd/widgets/history-feed/model/history-row.test.ts
update src/fsd/widgets/history-feed/model/history-row.ts
check src/fsd/widgets/history-feed/ui/history-list.test.ts
check src/fsd/widgets/history-feed/ui/history-list.tsx
update src/fsd/pages/project-history/api/project-history.server.ts
update src/fsd/pages/project-history/model/history-view.ts
check src/fsd/pages/project-history/ui/project-history-page.tsx
check src/fsd/pages/project-history/ui/history-items-list.tsx
update src/fsd/pages/project-history/ui/project-history-page.test.ts
update docs/architecture/protocol.md
update docs/architecture/invariants.md
update docs/architecture/system-overview.md
update docs/architecture/verification.md (저장소 스크립트 표에 rehearse-multiple-pipelines.ts 행)
update docs/conventions/product-copy.md
update scripts/retired-copy.test.mjs (RETIRED에 `/With no Propose node|has a Propose node|no propose node on this pipeline|Propose alone has no auto label/`를 where web·skill·locks로 더한다. 맨 단어 Propose는 옛 판을 표시하는 라벨이라 막지 않는다)
check scripts/plugin-lib.mjs
update scripts/project-availability-runtime.test.ts (생성 Prisma 모델 파일 수 고정값 20을 23으로 올리고, 그 주석의 근거에 Pipeline·PipelineDefinition·PipelineRule을 더한다. `npm run check`의 test:project-availability가 이 시험을 돈다. 같은 시험은 `project.find*` 호출에 `select`를 요구하므로 새 Project 조회도 select를 쓴다)
check scripts/test-server-integration.mjs
check tests/server/fixtures/action-manifest.ts
update tests/server/fixtures/src-clean-code-browser.tsx (existing rail/action fixture contract, ProposeFixture의 pipelines·preselected)
update tests/server/fixtures/src-clean-code-acceptance.ts (propose 사례가 payload JSON을 { key, agent, reason }로 정확히 비교한다 — pipelineId를 더한다)
check scripts/build.mjs
check prisma.config.ts
check package.json
check tsconfig.json
```

### 새 모듈·시험·산출물

```text
create packages/core/pipeline-types.test.ts (compile-only. tsconfig의 **/*.ts라 `tsc --noEmit`이 검사한다. dev e12449b에는 없다 — 본 checkout의 미커밋 plugin-clean-code 작업이 같은 이름으로 만들므로, 구현 시점의 dev에 이미 있으면 그 파일에 더한다)
create src/server/pipeline/lock-query.ts
create src/server/pipeline/definition-save-query.ts
create src/server/pipeline/pipeline-settings-query.ts
create src/fsd/features/edit-pipeline/ui/pipeline-list.tsx
create src/fsd/features/edit-pipeline/ui/pipeline-list.test.ts
create src/fsd/features/edit-pipeline/ui/automatic-pick-control.tsx
create src/fsd/features/edit-pipeline/ui/automatic-pick-control.test.ts
create src/fsd/features/edit-pipeline/api/pipeline-settings.server.ts
create src/fsd/features/change-item-pipeline/index.ts
create src/fsd/features/change-item-pipeline/index.server.ts
create src/fsd/features/change-item-pipeline/model/change-input.ts
create src/fsd/features/change-item-pipeline/model/change-input.test.ts
create src/fsd/features/change-item-pipeline/api/change-item-pipeline.server.ts
create src/fsd/features/change-item-pipeline/ui/change-pipeline-control.tsx
create src/fsd/features/change-item-pipeline/ui/change-pipeline-control.test.ts
create tests/server/pipeline-settings.test.ts
create tests/server/pipeline-change.test.ts
create tests/server/integration/pipeline-composition.test.ts
create tests/server/integration/pipeline-settings.test.ts
create tests/server/integration/pipeline-routing.test.ts
create tests/server/integration/pipeline-change.test.ts
create tests/server/integration/pipeline-materialization.test.ts
create tests/server/integration/pipeline-migration.test.ts
create tests/server/integration/pipeline-rollback.test.ts
create scripts/rehearse-multiple-pipelines.ts
create tests/server/fixtures/multiple-pipelines-browser.tsx
create prisma/migrations/<implementation timestamp>_multiple_pipelines/migration.sql (release A)
create prisma/migrations/<later timestamp>_pipeline_version_owner_required/migration.sql (cleanup release B, Phase 6)
generate src/generated/prisma (db:generate; edit by hand forbidden)
generate .next/server/server-reference-manifest.json (fresh build; do not commit)
```

timestamp는 migration 도구가 구현 시 발급하는 디렉터리 식별자다. SQL 내용과 두 release의 순서는 §3·배포 절이 정한다.

### 테스트·리허설 DB writer

필수 schema cleanup(Phase 6)에서는 PipelineVersion을 직접 만드는 아래 파일도 갱신한다. 그중 `head.test.ts`·`automatic-scout.test.ts`는 head가 판을 만든다는 전제 때문에 Phase 2에서 먼저 고친다(Phase 2 작업 내용).
공통 `tests/server/integration/support.ts`에 같은 프로젝트 Default/정의/판을 만드는 fixture helper를 두고 사용한다.
현재 역사 migration 재생의 **이전 스키마 SQL**은 보존하고, 새로운 A/B 시험만 현재 스키마로 작성한다.

```text
tests/server/integration/support.ts
tests/server/integration/acceptance-failure.test.ts
tests/server/integration/automatic-scout.test.ts
tests/server/integration/client-runtime.test.ts
tests/server/integration/head.test.ts
tests/server/integration/impl-verifier.test.ts
tests/server/integration/qa-verifier.test.ts
scripts/rehearse-acceptance-failure.ts
scripts/rehearse-pipeline-agent-slots.ts
scripts/rehearse-src-clean-code-fifth-pass.ts
tests/server/integration/migration.test.ts (check historical boundaries, no blanket rewrite)
tests/server/integration/project-connection.test.ts (ensureRun wrapper regression)
scripts/rehearse-repository-disconnection.ts (ensureRun wrapper regression)
scripts/rehearse-src-clean-code.ts (ensureRun wrapper regression)
scripts/rehearse-src-clean-code-fourth-pass.ts (new defaultGraph/definition contract)
scripts/rehearse-automatic-scout.ts (schema/GET regression)
scripts/rehearse-project-availability-d3.ts (schema shape regression)
scripts/lib/project-ownership-cleanup.ts (schema introspection regression)
tests/server/pipeline-save.test.ts
tests/server/project-page-loaders.test.ts
tests/server/review-gate-actions.test.ts
tests/server/board-history.test.ts
tests/server/project-history.test.ts
tests/server/integration/pipeline-save.test.ts
tests/server/integration/board.test.ts
tests/server/integration/backlog-add.test.ts
```

### 심볼 소유권·공개 API·검증 목적지

| 심볼 | 현재 → 변경 후 소유 | 외부 소비 / 검증 |
|---|---|---|
| ensureCurrentVersion | run-query.ts → ensureRunnableVersion(tx), 내부 전용 | ensureRunIn·정의 저장·설정 / materialization 통합 시험 |
| ensureRun | run-query.ts → root wrapper + ensureRunIn(tx) | run.ts는 wrapper만 공개; board-query.ts는 내부 ensureRunIn / 직접 호출·경합 시험 |
| loadCurrentVersionView | run-query.ts → loadPipelinesView·loadPipelinesViewIn | run.ts가 root reader 공개; pipeline route·보드 loader·backlog route·item route / GET zero-write |
| savePipelineVersion | version-save-query.ts → savePipelineDefinition | edit-pipeline/index.server.ts action → 새 서버 서비스 / 양방향 저장 경합·옛 import 부재 |
| 설정 mutation 5종 | 신규 pipeline-settings-query.ts | edit-pipeline/api/pipeline-settings.server.ts → index.server.ts → pipeline route / 권한·보관·규칙·회복 시험 |
| changePipeline | 신규 board-query.ts 내부 함수 | createBoardQueries의 reportFailure(changePipeline) → board.ts 명시 export → 새 feature index.server.ts / CAS·audit rollback |
| Definition·확장 함수 | core pipeline.mjs + pipeline.d.mts | edit-pipeline index.ts는 UI/타입만; 순수 함수는 core 직접 import / core runtime·compile-only |
| 파이프라인 이름 | run-query.ts의 loadItemPipelineView + board loader | briefing ActivityItem → ActivityRow, BoardItemView → BoardItemPage / archived·closed run 이름 렌더, run 없는 옛 항목은 Default·Change pipeline 없음 |
| 변경 이벤트 이름 | run-query.ts의 loadPipelineChanges + history-page.ts DTO | project-history.server.ts·item route → history-feed public API / Items 펼침·Events·항목 History 모두 |
| 이음매 게이트 label/tooltip | entities/pipeline/model/labels.ts | entities/pipeline/index.ts 공개; gateTooltip은 feature가 expand로 첫 노드 게이트를 구해 기존 공개 API에 전달 / 반복 슬롯·연결 게이트 시험 |

프로젝트 이름/파이프라인 이름은 React text로 렌더하고 DB 조회를 client model 안에 넣지 않는다.
같은 layer feature 간 직접 import는 하지 않는다. 페이지가 두 feature를 조합한다.

**파일 작업 preflight**: 열거한 기존 경로 존재와 삭제 소스 존재, 새 경로의 충돌 없음, 기존 부모 디렉터리를 확인한다.
change-item-pipeline slice와 api/model/ui는 먼저 생성한다. migration 디렉터리는 각 release 때 생성한다.
삭제 후 옛 파일/옛 import 부재와 새 서비스/action 공개 API 존재를 함께 검증한다.
FSD 예외·루트 app 추가·수동 generated 수정은 허용하지 않는다.

## Safety Analysis

확인한 항목:

- [x] **앱 진입점과 라우팅 경계**: 새 제품 라우트는 없다. 기존 Pipeline·Backlog·Board·항목·History의 loader/본문과 새 Server Action이 바뀐다. 검증 fixture는 배포에 포함하지 않는다.
- [x] **정적 `import` / `export from`**: `run.ts`·`board.ts`의 명시 export 목록을 바꾼다(§4·§5). FSD 경계는 `npm run verify:fsd`로 확인한다.
- [x] **dynamic `import()` 또는 lazy loading**: 해당 없음(검색).
- [x] **barrel export 경유 참조**: `features/edit-pipeline/index.ts`·`index.server.ts`와 새 feature의 공개 API를 맞춘다.
- [x] **테스트와 스크립트 참조**: `propose`·`hasPropose`·`ensureCurrentVersion`·`savePipelineVersion`을 참조하는 시험·직접 DB writer·fixture를 Affected Files와 Verification Plan에 정확히 열거한다. PM 단계 이름 propose는 실행 노드와 구별해 보존한다.
- [ ] **정적 자산 URL**: 해당 없음.
- [x] **타입 선언 영향**: `pipeline.d.mts`가 유일한 형 출처다. `tsc --noEmit`(`npm run check`)으로 확인한다.
- [x] **런타임 side effect 또는 초기화 코드**: 판 물질화 시점이 head에서 첫 성공 파이프라인 쓰기/ensureRun으로 옮겨진다(§4). 페이지 GET은 여전히 아무것도 쓰지 않는다.
- [x] **API 영향**: MCP 입출력 모양은 그대로다(§9). 웹 action은 직접 POST로 호출할 수 있는 인증 경계다. 모든 mutation의 action·서비스에서 권한을 재검사하고 실제 Next POST 대조 시험을 둔다.

안전하다고 판단한 근거:

1. 런·커서·원장·MCP가 읽는 `PipelineVersion`의 의미가 그대로다. 그래서 진행 중인 항목은 migration과 배포 전후로 같은 판에서 같은 방식으로 돈다.
2. migration A는 추가와 backfill만 한다. 기존 unique와 기존 실행 그래프/원장을 유지한다. pipelineId backfill만 추가하며 구·신 서버 혼용은 maintenance로 막는다.
3. 저장 판정은 순수 함수(`recompose`)이고, 웹 미리보기와 서버가 같은 함수를 쓴다. 깨지는 경우는 잠금 안에서 판정하며 실패하면 물질화까지 전체 rollback한다.

## Approval

승인 메모:

- 2026-10-15 사용자 지시로 실제 코드 구현을 승인받았다. Phase 1–5와 후속 Phase 6의 구현·검증 범위는 상단 approval-scope와 구현 진행 기록을 따른다. 후속 진행 지시에 따라 PR·병합·배포 준비를 진행했다. 운영 DB는 사용자가 확인했으며, maintenance·기존 writer 차단과 drain·백업 복원 검증을 마친 후 운영 migration과 main 승격을 순서대로 실행했다. 실행 근거는 운영 인수 보고서에 있다.

## Execution Plan

Phase 1–5는 한 브랜치(`harness/multiple-pipelines`, `dev`에서 분기) 안의 검증 단위이고, 합쳐서 첫 release(migration A와 nullable 서버)가 된다.
Phase 6은 그 PR이 dev에 머지된 뒤 별도로 통합·배포하는 cleanup release(migration B와 필수 schema)다. 후속 승인으로 구현·로컬 검증을 먼저 준비하며, 아래 Phase 6 절에 브랜치와 통합 조건을 기록한다.
배포 단위는 **migration A → nullable 서버 release → migration B + 필수 schema cleanup release** 세 단계다.

### 준비: 작업 worktree와 격리 시험 DB

본 checkout에는 다른 작업의 미커밋 변경이 있으므로 새 worktree에서 구현한다. 명령은 Git Bash 기준이며, 아래
Verification Plan의 명령도 같은 셸에서 돌린다(`TEST_DATABASE_URL`을 이 셸에서 export한다).
각 블록은 첫 줄의 `set -euo pipefail`부터 실행한다. fetch·설치·DB 초기화·서버 시작 중 하나라도 실패하면 뒤의 쓰기를 실행하지 않는다. `rg`가 PATH에 있어야 한다.

```bash
set -euo pipefail
# WT는 짧은 경로로 둔다(예: "$LOCALAPPDATA/Temp/mpwt"). npm ci가 받는 node_modules는 worktree 안 상대 경로가
# 132자까지 깊어서, 긴 경로에 두면 Windows 경로 한도(260자)를 넘어 정리 단계의 worktree remove가 실패한다
MAIN="<본 checkout 경로>"; WT="<새 worktree 경로>"
command -v rg
git -C "$MAIN" ls-remote --exit-code --heads origin dev
git -C "$MAIN" fetch origin dev:refs/remotes/origin/dev
git -C "$MAIN" worktree add "$WT" -b harness/multiple-pipelines origin/dev
cd "$WT"
npm ci              # 실제 node_modules. 정션으로 이은 node_modules는 Turbopack이 build를 거부한다
npx prisma generate # src/generated는 gitignore. DB 연결 없음
```

통합 시험·migration 재생·리허설에는 로컬 격리 PostgreSQL의 `stagekeeper_test_*` DB가 필요하고, `TEST_DATABASE_URL`은
`.env`에 없다. 이 머신의 포터블 PostgreSQL 18로 버리는 DB를 띄운다. 운영과 공유하는 `.env`의 DB에는 시험 DB를 만들지 않는다.

```bash
set -euo pipefail
PGBIN="$LOCALAPPDATA/Temp/stagekeeper-backlog-postgres/package/native/bin"
test -x "$PGBIN/initdb.exe"
test -x "$PGBIN/pg_ctl.exe"
PGDIR=$(mktemp -d -t stagekeeper-mp-pg.XXXXXX)
"$PGBIN/initdb.exe" -D "$(cygpath -w "$PGDIR/data")" -U postgres --auth=trust -E UTF8 --no-locale > "$PGDIR/initdb.log" 2>&1
# 출력을 파이프로 받지 않는다. 서버가 파이프를 쥐고 있어 명령이 끝나지 않는다
"$PGBIN/pg_ctl.exe" -D "$(cygpath -w "$PGDIR/data")" -o "-p 55432 -c listen_addresses=127.0.0.1" -l "$(cygpath -w "$PGDIR/server.log")" -w start > /dev/null 2>&1
export MP_PGDATA="$(cygpath -w "$PGDIR/data")"
node -e 'const { Client } = require("pg"); const path = require("node:path"); const c = new Client({ connectionString: "postgresql://postgres@127.0.0.1:55432/postgres" }); c.connect().then(() => c.query("SHOW data_directory")).then(r => { if (path.resolve(r.rows[0].data_directory).toLowerCase() !== path.resolve(process.env.MP_PGDATA).toLowerCase()) throw new Error("Unexpected PostgreSQL instance"); return c.query("CREATE DATABASE stagekeeper_test_multiple_pipelines"); }).finally(() => c.end()).catch(() => { console.error("Isolated database setup failed; stop before tests."); process.exitCode = 1; })'
export TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/stagekeeper_test_multiple_pipelines   # 로컬 trust DB라 비밀이 아니다
```

55432가 이미 사용 중이면 새 서버 시작이 실패하는 자리에서 중단한다. 다른 인스턴스에 시험 DB를 만드는 방식으로 계속하지 않는다. 시작 실패는 `$PGDIR/server.log`로 확인하고, 자신이 시작한 서버만 정지한다.

DB 정리는 Git Bash의 `cygpath -w "$PGDIR"`로 확인한 값을 아래 PowerShell의 경로에 넣어 실행한다. 삭제 전에 실제 절대 경로가 Temp 아래의 이번 접두 디렉터리인지 검사하며, 서버 정지 실패 시 삭제하지 않는다.

```powershell
$mpPgRoot = (Resolve-Path -LiteralPath '<PGDIR의 Windows 절대 경로>').Path
$mpTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (-not $mpPgRoot.StartsWith($mpTempRoot, [StringComparison]::OrdinalIgnoreCase) -or
    -not (Split-Path -Leaf $mpPgRoot).StartsWith('stagekeeper-mp-pg.', [StringComparison]::Ordinal)) {
  throw 'Refusing cleanup outside the isolated PostgreSQL directory.'
}
$mpPgBin = Join-Path $env:LOCALAPPDATA 'Temp/stagekeeper-backlog-postgres/package/native/bin/pg_ctl.exe'
& $mpPgBin -D (Join-Path $mpPgRoot 'data') -m fast -w stop
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not stop; keep its directory for inspection.' }
Remove-Item -LiteralPath $mpPgRoot -Recurse -Force
```

worktree는 PR 머지 뒤 등록 경로를 `git -C "$MAIN" worktree list --porcelain`로 확인하고 `git -C "$MAIN" worktree remove "$WT"`로 지운다. 미커밋 변경이나 긴 경로 오류가 나면 강제 삭제로 우회하지 않는다. 변경을 보존하고 오류를 해결한 뒤 같은 Git 명령을 다시 실행한다. 이미 등록만 제거된 경우에도 남은 실제 절대 경로와 소유 작업을 확인하기 전에는 재귀 삭제하지 않는다.

### Phase 1: 코어 순수 함수 (추가만)

- **작업 내용**
  - `pipeline.mjs`에 `ORDER`·`RANK`·`orderReason`·`aliasReason`·`gateReason`, 정의·연결·`expand`·`composedReason`·`usersOf`·`recompose`·`routePipeline`·상수를 더한다.
  - `validateGraph`를 표로 정리한다. 이 단계에서는 **`propose` 거부를 넣지 않는다.** 현행 저장 경로가 아직 `propose`가 든 그래프를 보내기 때문이다. 그래서 Before의 "propose must be first" 규칙도 Phase 2에서 거부로 바꿀 때까지 예전 자리(앵커 순서 검사 바로 뒤)에 둔다. 사유 우선순위를 지키려면 이 단계에서만 `ORDER`의 앵커 두 짝을 먼저 보고, 그다음 propose 규칙, 그다음 나머지 짝을 본다.
    `gateReason`에도 이 단계에서는 Before의 `k === "propose"` 조건을 남긴다(`before-propose`는 노드가 있어도 거부). After의 `gateReason`은 propose가 앞에서 거부된다는 전제로 이 조건을 뺐기 때문에, 그대로 쓰면 `{ nodes: [propose, plan, implement, accept], gates: [before-propose] }`가 통과해 기존 시험 "refuses … a gate with no node after it"이 깨진다.
  - STEP_KINDS는 추가하되 defaultGraph는 아직 바꾸지 않는다.
  - `pipeline.d.mts`와 core 시험을 고치고, `npm run sync:plugin-lib`를 돌린다.
- **검증**: `npm test`, `npm run check`. 기존 `validateGraph` 시험이 수정 없이 통과해야 한다(불변식 근거).

### Phase 2: 스키마와 단일 파이프라인을 새 모델로

- **작업 내용**
  - nullable schema와 migration A만 첫 release에 만든다. db:generate로 client를 갱신한다. 생성 모델이 3개 늘므로 `scripts/project-availability-runtime.test.ts`의 고정값을 23으로 같이 올린다. B SQL/필수 schema는 cleanup release(Phase 6)에서 만든다.
  - lock-query helper와 ensureDefaultPipeline·ensureRunnableVersion·ensureRunIn·공개 ensureRun wrapper·loadPipelinesView/In을 만든다. board-query 내부 8곳은 ensureRunIn으로 옮기고 root 직접 호출은 wrapper를 쓴다.
  - 옛 loader export를 제거하는 이 단계에서 pipeline route와 project-board loader 및 그 시험 double도 새 reader로 옮긴다. 백로그/item/History의 목록·이름 확장은 Phase 3에서 한다.
  - `savePipelineDefinition`을 만들고 `version-save-query.ts`를 지운다.
  - head를 `autoProposeEnabled`로 바꾼다. head가 더는 판을 만들지 않으므로, head가 만든 판을 읽던 통합 시험 둘을 같은 단계에서 고친다.
    - `tests/server/integration/head.test.ts:46`의 `pipelineVersion.findFirstOrThrow`는 `headFor` 뒤에 판이 있다고 가정한다. 같은 파일 아래 시험(`pipelineVersion.create`)처럼 판을 직접 만들고 그 판에 런을 단다.
    - `tests/server/integration/automatic-scout.test.ts:17`·`:23`은 head가 만든 판을 "저장된 그래프"로 잡아 토글 전후를 비교한다. 이것을 "Automatic scouting 토글 전후로 그 프로젝트의 Pipeline·정의·판이 0건 그대로다"로 바꾼다.
  - `defaultGraph`·`STEP_KINDS`, `validateGraph`의 `propose` 거부를 넣는다.
  - 웹은 최소 변경만 한다. 레일이 기본 파이프라인 하나를 정의 `{ steps: nodes, gates }`로 저장하고, 추가 목록에서 Propose를 뺀다.
  - 기존 src-clean-code-browser.tsx fixture도 레일/저장 action의 정의·pipelineId·새 성공 결과형에 맞춘다. 기존 리허설이 옛 graph/성공 응답을 다시 주입하지 않게 한다.
  - Pipeline 탭에 Automatic picking 스위치를 둔다. 이 단계에서 propose 노드가 없어지므로, PM 자동 선택을 끄는 수단도 같은 단계에 있어야 한다. 그래서 스위치가 부르는 `setAutomaticPick` 서비스와 `setAutomaticPickAction`을 이 단계에서 `pipeline-settings-query.ts`·`pipeline-settings.server.ts`에 먼저 만든다.
- **검증**
  - `npm run db:validate`, `npm test`, `npm run test:web`, `npm run test:server`, `npm run test:server:integration`(로컬 격리 DB), `npm run check`
  - migration 재생 시험(아래 코드)
  - 수동: 기존 프로젝트의 Pipeline 탭이 Propose 카드만 빠진 같은 레일과, 옛 판의 propose 유무대로 켜지거나 꺼진 Automatic picking 스위치를 보여 주는지, PM head가 그대로 도는지 확인한다.

### Phase 3: 여러 파이프라인 서버 기능

- **작업 내용**
  - `propose` 라우팅과 `runnableReason`, `changePipeline`을 만든다.
  - `pipeline-settings-query.ts`와 `pipeline-settings.server.ts`에 나머지 네 설정(보관·이름·기본·규칙)을 더한다.
  - 보드·백로그·항목·History loader와 DTO, §8 이름 조회를 함께 갱신한다.
- **검증**: 단위 시험(라우팅, 변경 조건), 통합 시험(재조립 저장, 규칙 라우팅, 변경 이벤트, 보관 거부), `npm run check`.

### Phase 4: 웹 UI

- **선행 조건**: 제외 범위인 시각 배치를 Approval-after 검토한다. §8의 데이터/상호작용 계약은 이미 확정돼 있다.
- **작업 내용**: §8 표 전체. 빈 초안의 첫 단계·끝 연결 추가, 펼친 슬롯 id 예약, 자기 정의 번호가 바뀌지 않은 참조 정의 변경의 preview/경고 갱신도 이 단계에서 구현한다.
- **검증**
  - `npm run test:web`, `npm run verify:fsd`, `npm run lint`
  - `npm run build`. dev 서버를 끄고 돌린다. build는 Prisma generate와 next build를 순서대로 실행한다(scripts/build.mjs). dev 중지/재시작은 별도로 관리한다.
  - 격리 loopback 브라우저 검증: 조각 저장 → 연결 → 블록·토글 → 깨지는 저장 거부 → Put on the board 선택 → 항목 Change pipeline → History 행.

### Phase 5: 문서

- **작업 내용**: §10 표.
- **검증**: 문구 시험(`scripts/retired-copy.test.mjs` 등 `npm run test:architecture`). 문서의 경로·심볼 인용이 실제 코드와 맞는지 대조한다.

### Phase 6: cleanup release (migration B와 필수 schema)

- **병합·배포 선행 조건**: Phase 1–5의 PR이 dev에 머지돼 있다. 그 dev 기준의 별도 `harness/<topic>` 브랜치에서 cleanup 변경을 통합한다("준비" 절차에서 브랜치 이름만 바꾼다). 2026-10-15 후속 승인에 따라 구현·로컬 검증은 첫 release 커밋 위의 `harness/multiple-pipelines-cleanup`에서 미리 진행할 수 있다. 첫 release PR에 B를 포함하지 않으며, 후속 PR은 실제 dev 기준으로 재검증하고 dev를 대상으로 한다. migration A와 nullable 서버의 운영 적용을 확인할 때까지 cleanup PR은 draft로 유지하며 병합하지 않는다.
- **작업 내용**
  - `prisma/migrations/<later timestamp>_pipeline_version_owner_required/migration.sql`에 §3의 B SQL을 그대로 넣는다. 이 디렉터리는 이 release에만 있으므로 첫 release의 `migrate deploy`는 B를 실행하지 않는다.
  - schema의 `PipelineVersion.pipelineId`·`pipeline`을 필수(`String`·`Pipeline`)로 바꾸고 `db:generate`로 client를 다시 만든다. 모델은 늘지 않으므로 생성 모델 수 23은 그대로다.
  - "테스트·리허설 DB writer" 목록의 파일이 PipelineVersion을 `pipelineId`와 함께 만들도록 `support.ts` helper로 옮긴다.
  - `pipeline-migration.test.ts`에 B 사례를, `pipeline-rollback.test.ts`에 B 뒤 사례를 더한다(검증 목적지 표의 "DB A/B"·"롤백" 행). 첫 release에는 B 디렉터리가 없어 이 사례를 넣을 수 없다.
- **검증**: Verification Plan의 "구현 후 실행" 명령 전체(`assert_absent` 호출 세 개 포함). 리허설 명령도 다시 돌린다.

### 배포

사용자가 2026-10-10에 확정한 **잠시 중지하는 전환**을 사용한다. 이 문서 검증은 운영 변경 승인이 아니다.

1. 격리 DB에서 A·B와 롤백을 리허설한다. B는 §3의 SQL로 한다(Phase 6이 같은 SQL을 파일로 만든다). `scripts/test-server-integration.mjs`의 DATABASE_URL과 분리된 `stagekeeper_test_*` 검사를 통과해야 한다. 격리 DB는 Execution Plan "준비"의 포터블 PostgreSQL로 만든다. 운영 DB에서 ROLLBACK하는 대체 리허설은 하지 않는다.
2. 운영 배포 담당자가 복구 가능한 backup과 리허설 결과를 확인한다. 플랫폼의 maintenance 설정으로 웹 쓰기·MCP 실행/쓰기를 중지하고, 기존 서버의 in-flight 요청과 이전 배포 인스턴스를 모두 종료한다. GET도 옛 snapshot을 노출하지 않도록 점검 화면으로 전환한다. 설정 위치와 담당자를 배포 기록에 남긴다.
3. 옛 writer가 없는 상태에서 migration A를 적용한다. Phase 1–5의 PR(`harness/multiple-pipelines` → `dev`)을 check 녹색으로 머지한 dev를 받은 작업 트리에서, 운영 DB를 가리키는 `DATABASE_URL`로 `node node_modules/prisma/build/index.js migrate status`를 돌려 대기 migration이 A 하나인지 확인한다(대기가 있으면 1로 끝나고 그 이름을 보인다). 그다음 `node node_modules/prisma/build/index.js migrate deploy`를 실행한다. 모든 기존 프로젝트 기본 연결, 기존 판의 pipelineId, 최신 판에서 나온 정의/설정, 기존 run 원장 보존을 확인한다. A 뒤 옛 서버가 쓴 행이 발견되면 전환을 중단하고 원인을 제거한 뒤 복구/backfill을 별도 검토한다.
4. nullable schema의 새 서버 release를 main fast-forward로 배포한다. 승격 전에 `git -C "$MAIN" fetch origin && git -C "$MAIN" merge-base --is-ancestor origin/main origin/dev`가 0으로 끝나는지 확인한다. 1이면 main에 dev 밖 커밋이 있어 fast-forward가 안 된다(2026-10-13에는 main에 직접 머지된 #148과 dev→main 머지 커밋 #149가 그랬다). 그때는 AGENTS.md가 말하는 back-merge로 main을 먼저 dev에 합친다. maintenance 중에 기본 읽기·head·기존 run 호환을 검증한다.
5. Phase 6의 cleanup release PR을 check 녹색으로 dev에 머지한다. main 승격은 아직 하지 않는다. **이전 인스턴스가 종료된 상태를 재확인하고**, 그 dev를 받은 작업 트리에서 3번과 같은 `migrate status`로 대기 migration이 B 하나인지 확인한 뒤 `migrate deploy`로 B를 적용한다. B는 pipelineId null이 한 건이라도 있으면 실패시킨다. 운영 중인 nullable 서버(4번)는 NOT NULL DB를 읽고 non-null 값을 쓰므로 이 단계와 호환된다.
6. 4번의 fast-forward 확인을 거쳐 main을 승격해 필수 schema의 cleanup 서버를 배포한다. B SQL은 Phase 6에만 있으므로 3번의 `migrate deploy`는 B를 실행하지 않았다. 새 프로젝트의 Project.defaultPipelineId nullable은 지연 생성 때문에 유지한다.
7. 운영 검증과 rollback 판단을 마친 뒤 maintenance를 해제한다. 중지 중에는 플러그인 감시 호출도 정상 실행으로 간주하지 않는다. 플러그인 버전은 올리지 않는다.

## Verification Plan

실행할 검증(Execution Plan "준비"의 worktree와 셸에서. `test:server:integration`은 거기서 export한 `TEST_DATABASE_URL`을 쓴다):

```bash
set -euo pipefail
npm run db:validate
npm test
npm run test:web
npm run test:server
npm run test:server:integration
npm run check
npm run verify:fsd
npm run build
```

검증 기준:

- 성공 기준 1–12가 아래 시험과 수동 확인으로 관찰된다.
- 기존 실패와 신규 실패는 `dev` 기준 같은 명령의 결과와 비교해 구분한다.

**기존 시험의 초기 목록**(전체 경계는 Affected Files와 아래 검증 목적지 표다):

- `packages/core/pipeline.test.mjs`
- `src/server/pipeline/run-rules.test.mjs`
- `src/server/agents/next.test.ts`
- `src/fsd/entities/pipeline/model/labels.test.ts`
- `src/fsd/features/edit-pipeline/model/{pipeline-save-state,save-pipeline-input,rail-state}.test.ts`
- `src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs`
- `tests/server/pipeline-save.test.ts`
- `tests/server/project-page-loaders.test.ts`
- `tests/server/review-gate-actions.test.ts`
- `tests/server/integration/{head,automatic-scout,backlog-add,pipeline-save,hold-propose}.test.ts`

**추가 시험 1 — 코어 합성** (`packages/core/pipeline.test.mjs`에 추가. 형식은 같은 파일의 describe/it과 node:assert/strict를 따른다. 기존 import와 아래 named import를 합쳐 중복 binding을 만들지 않는다)

```js
import { expand, recompose, refStep, routePipeline, usersOf, validateDefinition, validateGraph } from "./pipeline.mjs";

describe("pipeline composition", () => {
  const planning = { steps: ["plan", "verify"], gates: ["before-plan"] };
  const checking = { steps: ["impl-verify", "qa"], gates: ["before-qa"] };
  const feature = { steps: [refStep("planning"), "implement", refStep("checking"), "accept"], gates: [] };
  const definitions = { planning, checking, feature };

  it("saves a fragment without anchors but keeps its internal order", () => {
    assert.equal(validateDefinition(checking, "pro").ok, true);
    assert.equal(validateDefinition({ steps: ["qa", "impl-verify"], gates: [] }, "pro").ok, false);
    assert.equal(validateDefinition({ steps: ["accept", "plan"], gates: [] }, "pro").ok, false);
    assert.equal(validateDefinition({ steps: ["propose", "plan"], gates: [] }, "pro").ok, false);
  });

  it("expands references in place, unions gates and moves a junction gate onto the block's first node", () => {
    const expanded = expand("feature", definitions);
    assert.equal(expanded.ok, true);
    assert.deepEqual(expanded.graph.nodes, [...planning.steps, "implement", ...checking.steps, "accept"]);
    assert.deepEqual(new Set(expanded.graph.gates), new Set([...planning.gates, ...checking.gates]));
    assert.equal(validateGraph(expanded.graph, "pro").ok, true);
    assert.equal(validateGraph(expand("checking", definitions).graph, "pro").ok, false);
    const junction = expand("feature", { ...definitions, feature: { ...feature, gates: [`before-${refStep("checking")}`] } });
    assert.ok(junction.ok && junction.graph.gates.includes(`before-${checking.steps[0]}`));
  });

  it("refuses loops and archived references", () => {
    assert.equal(expand("feature", { ...definitions, checking: { steps: ["impl-verify", refStep("feature")], gates: [] } }).ok, false);
    assert.equal(expand("feature", { planning, feature }).ok, false); // checking이 보관돼 묶음에서 빠졌다
  });

  it("rejects a change that breaks a pipeline that must stay runnable, naming that pipeline", () => {
    assert.deepEqual(usersOf("checking", definitions), ["feature"]);
    const broken = recompose("checking", { ...definitions, checking: { steps: ["verify", "qa"], gates: [] } }, ["feature"], "pro");
    assert.equal(broken.ok, false);
    assert.ok(!broken.ok && broken.pipelineId === "feature");
    const fine = recompose("checking", definitions, ["feature"], "pro");
    assert.ok(fine.ok && fine.runnable.checking === null && fine.runnable.feature !== null);
  });

  it("routes by type and falls back to the default", () => {
    const rules = { fix: "hotfix" };
    assert.equal(routePipeline("fix", rules, "default"), rules.fix);
    assert.equal(routePipeline("feat", rules, "default"), "default");
    assert.equal(routePipeline(null, rules, "default"), "default");
  });
});
```

기대값의 근거:

- 펼친 `nodes`는 `expand`의 계약(연결 자리에 그 파이프라인의 노드를 넣음)에서 입력 기호로 유도했다.
- 게이트는 합집합 계약에서, `routePipeline`은 항등식(계산 없음)에서 나온다.
- `broken`에서는 `expand`가 `feature`를 펼치다가 `verify`가 두 번 나오는 것을 찾아 `feature` id로 거부한다(`a node appears twice`). `expand`는 블록을 합칠 때마다 중복을 보므로 성공한 펼친 결과에는 중복이 없다. `composedReason`의 중복 검사는 방어용이다. 시험은 거부 사유가 무엇이든 실패한 파이프라인 id만 단언한다.

**추가 시험 2 — head 설정** (`src/server/pipeline/run-rules.test.mjs`. 이 파일의 `hasPropose` 입력 11곳(`:24`·`:28`, `describe("decideHead (H.4)")`의 `:105`–`:118`, `:153`·`:157`·`:158`·`:176`)을 모두 `autoProposeEnabled`로 바꾼다. 하나라도 남기면 `autoProposeEnabled`가 `undefined`라 pm 디스패치를 기대한 단언이 깨진다. 아래 import는 기존 `import { AUTO_SCOUT_DISABLED_REASON } from "@harness/core/pipeline.mjs"` 줄에 합친다)

```js
import { AUTO_PROPOSE_DISABLED_REASON, AUTO_SCOUT_DISABLED_REASON } from "@harness/core/pipeline.mjs";

it("automatic picking off → none with the setting's reason", () => {
  assert.deepEqual(decideHead({ autoProposeEnabled: false, openCount: 0, availableBacklog: 3, cap: null }),
    { action: "none", reason: AUTO_PROPOSE_DISABLED_REASON });
});
```

**추가 시험 3 — 재조립 저장 통합** (`tests/server/integration/pipeline-composition.test.ts`. `fixture`·`connections`·`cleanup`은 `./support`의 것을 쓴다)

```ts
import assert from "node:assert/strict";
import { it } from "node:test";
import { refStep } from "@harness/core/pipeline.mjs";
import { savePipelineDefinition } from "../../../src/server/pipeline/definition-save-query";
import { cleanup, connections, fixture } from "./support";

it("a used pipeline's save writes new runnable versions for its users and refuses a breaking change", async () => {
  const pool = connections(1); const [db] = pool.all;
  let userId: string | undefined;
  try {
    const f = await fixture(db, { plan: "pro" }); userId = f.userId;
    const base = { projectId: f.projectId, userId: f.userId };
    const checkSteps = ["impl-verify", "qa"];
    const check = await savePipelineDefinition(db, { ...base, pipelineId: null, name: "Check", definition: { steps: checkSteps, gates: [] }, expectedVersion: 0 });
    assert.equal(check.status, "success");
    const checkId = check.status === "success" ? check.pipelineId : "";
    assert.equal(await db.pipelineVersion.count({ where: { pipelineId: checkId } }), 0);
    const feature = await savePipelineDefinition(db, { ...base, pipelineId: null, name: "Feature", definition: { steps: ["plan", "implement", refStep(checkId), "accept"], gates: [] }, expectedVersion: 0 });
    const featureId = feature.status === "success" ? feature.pipelineId : "";
    const first = await db.pipelineVersion.findFirstOrThrow({ where: { pipelineId: featureId }, orderBy: { version: "desc" } });
    assert.deepEqual(first.nodes, ["plan", "implement", ...checkSteps, "accept"]);

    assert.equal((await savePipelineDefinition(db, { ...base, pipelineId: checkId, definition: { steps: checkSteps, gates: ["before-qa"] }, expectedVersion: 1 })).status, "success");
    const second = await db.pipelineVersion.findFirstOrThrow({ where: { pipelineId: featureId }, orderBy: { version: "desc" } });
    assert.ok(second.version > first.version);
    assert.ok(second.gates.includes("before-qa"));

    const definitionsBefore = await db.pipelineDefinition.count({ where: { pipeline: { projectId: f.projectId } } });
    const broken = await savePipelineDefinition(db, { ...base, pipelineId: checkId, definition: { steps: ["verify", "qa"], gates: [] }, expectedVersion: 2 });
    assert.ok(broken.status === "error" && broken.reason.includes("Feature"));
    assert.equal(await db.pipelineDefinition.count({ where: { pipeline: { projectId: f.projectId } } }), definitionsBefore);
  } finally { await cleanup(db, userId); await pool.disconnect(); }
});
```

**추가 시험 4 — migration A/B 재생** (기존 migration.test.ts 방식으로 새 pipeline-migration.test.ts에 작성한다)

1. 이전 migration을 새 스키마에 재생한다.
2. 판이 있는 프로젝트(최신 판 `nodes`에 `propose` 포함), `propose`가 없는 프로젝트, 판이 없는 프로젝트, 판이 있는 프로젝트에는 그 판에 묶인 런을 넣는다. 판이 없는 프로젝트에 FK를 깨는 run을 넣지 않는다.
3. migration A를 적용한다.
4. 다음을 단언한다.
   - `Project.defaultPipelineId = 'default_' || id`
   - `PipelineDefinition.steps = array_remove(최신 nodes, 'propose')`, `createdBy`·`createdAt`은 최신 판의 값
   - `autoProposeEnabled`가 `propose` 유무와 같다
   - `PipelineVersion.pipelineId`가 모두 채워졌다
   - `PipelineRun.versionId`가 변하지 않았다
   - 판이 없는 프로젝트에는 정의가 없다

이전 migration 개수는 하드코딩하지 않고 새 migration 이름보다 앞선 디렉터리로 거른다. 기존 historical migration.test.ts의 23/17 assertion은 각 옛 경계의 증거이므로 그대로 둔다. 새 pipeline-migration.test.ts에서 A 사례는 A 이름, B 사례(Phase 6)는 B 이름을 경계로 predecessor를 열거한다. 첫 release에는 B 디렉터리가 없으므로 위 1–4는 A만 다룬다.

**추가 시험 5 — 항목 생성과 변경 통합**: 다음을 통합 시험으로 확인한다.

- `fix → 핫픽스` 규칙에서 pm(`actor: "agent"`)의 `propose`가 핫픽스 판에 고정된다.
- 웹 `propose`가 고른 `pipelineId`를 따른다. 조각을 고르면 `PIPELINE_CANNOT_RUN_ITEMS`로, 보관·없는·다른 프로젝트의 id를 고르면 `PIPELINE_NOT_FOUND`로 거부된다.
- `changePipeline`의 성공 경로(이벤트 한 줄, `versionId` 교체)를 확인한다.
- `changePipeline`의 거부 경로를 확인한다: planning 상태, 묶인 `AgentRun` 존재, stale `expectedUpdatedAt`.

**수동 확인**: Phase 4의 시나리오. 그리고 기존 프로젝트에서 `pipeline_next`(key 없음)의 head·items 모양이 배포 전후로 같은지 확인한다.

### 검증 목적지와 실패 경로

아래 시험은 구현 후 필수 인수 조건이다. 번호 상한, 정의 일부만 존재하는 무결성 실패, 이름 id 충돌도 각 저장/물질화 시험에 포함한다. 이번 문서 대조의 PASS를 미래 구현 시험 결과로 기록하지 않는다.

| 요구/위험 경계 | 구현 후 검증 목적지와 기대 결과 |
|---|---|
| 정의·조각·중첩·이음매 게이트 | core pipeline.test.mjs: 10,000단계 연결 성공, 순환·missing/archived·중복·별칭 혼합 거부, 게이트 합집합·첫 노드 치환 |
| validateGraph 보존 | 같은 파일: propose 없는 그래프의 기존 결과/첫 사유 일치, 새 저장의 propose 거부; pipeline-types.test.ts readonly/unknown/결과 narrowing |
| 첫 기본 보존·지연 생성 | pipeline-materialization.test.ts: GET/head zero-write, 첫 ensureRun 정의 v1+판 1건, 기본 교체 후 옛 기본 정의 유지. integration automatic-scout.test.ts: Automatic scouting 토글과 head 호출 전후로 Pipeline·정의·판이 0건 그대로 |
| 경합 | pipeline-save.test.ts·pipeline-materialization.test.ts: owner/project 잠금 barrier 양방향, 번호/정의 unique, stale·timeout 전체 rollback; nextFor·root ensureRun 직접 호출 포함. Default 행만 있고 정의·판이 없는 프로젝트에서 propose가 첫 읽기 뒤 잠금을 기다리는 동안 정의 저장이 기본을 물질화해 commit하면, propose는 23505(P2002)가 아니라 40001(P2034)로 실패하고 zero-write이며 다시 부르면 물질화된 기본으로 성공 |
| 저장·재조립 | pipeline-composition.test.ts: 직접·간접 사용처 갱신, legacy→slots-v1, graph 같으면 reuse, 기존 run 고정, 깨진 변경의 Pipeline/Definition/Version/Project 수·값 모두 불변. tests/server/pipeline-save.test.ts: action이 앵커 없는 조각 정의를 앞단에서 거부하지 않고 서비스에 넘긴다(옛 `validateGraph` 앞단 검사 없음). pipeline-composition.test.ts: 같은 이름의 새 Pipeline 저장을 다시 보내면 이름 중복으로 거부되고 두 번째 Pipeline이 생기지 않는다 |
| 서버 권한 | tests/server/pipeline-settings.test.ts·pipeline-save.test.ts 및 통합 settings: 비소유자·미선택·해제·Free·잠금 대기 중 downgrade 거부와 zero-write. Free와 잠금 대기 중 downgrade의 사유는 `PIPELINE_EDIT_PLAN_GATE` 문장이다(Automatic picking 포함) |
| 기본·이름·보관·규칙 | 통합 pipeline-settings.test.ts: 1/40/41자·trim·다른 Pipeline과 동명·지금 이름 그대로 바꾸기 성공·archived 재사용(§8 문구 그대로), 없음·cross-project·archived 대상은 `Pipeline not found.`, fragment 대상(규칙·기본)은 `PIPELINE_CANNOT_RUN_ITEMS`로 거부, 기본·직접 연결·규칙 대상 보관 거부, null 규칙 삭제, 형식 오류·모르는 type은 `Invalid pipeline settings request.`와 zero-write |
| 런/원장 보존 | 통합 settings·composition: 보관 가능한 Pipeline의 기존 run은 계속 같은 판 사용; 삭제 없음. 보관은 새로운 선택/연결만 막는다 |
| type 라우팅·웹 override | pipeline-routing.test.ts: 4개 type·null·규칙 없음, 가상 기본 id의 첫 웹 제출 성공, 판이 하나도 없는 새 프로젝트의 Backlog 선택지·preselected·Pipeline 목록 Runs items·보드 Team에 가상 기본이 들어감(project-page-loaders.test.ts와 리허설 본문도), 남의·보관·없는 id는 `Pipeline not found.`·조각 id는 PIPELINE_CANNOT_RUN_ITEMS로 거부하고 zero-write, 기본 Pipeline 행이 없는 프로젝트에서 보류 key 제안 거부 시 Pipeline·정의·판·BoardItem 수 불변 |
| 프로젝트 상한·MCP | integration board.test.ts + mcp/tools.test.mjs: 두 Pipeline이어도 전체 미결 2건, MCP schema에 pipelineId 없음·등록 도구 집합 불변, views.test.ts로 board_get/board_list 응답에 새 웹 metadata가 없는 정확한 key 집합 확인 |
| 보류 거부 보존 | integration hold-propose.test.ts(수정 없이 통과): 보류 key의 agent·human propose가 `on hold — only the owner resumes it, on the web`로 거부, availableBacklogCount 0과 head 비pm, 새 후보 뒤 pm 복귀(autoProposeEnabled 기본 true), 재개 뒤 `already open`. 거부의 zero-write는 위 pipeline-routing.test.ts에서 단언 |
| PM/Scout 보존 | run-rules.test.mjs·integration head.test.ts·automatic-scout.test.ts: open cap→빈 백로그 Scout→Automatic picking→dispatch cap 순서, 열린 PM 유지, Scout 중단/slot 동작 불변. 두 통합 시험의 head 순서·사유 기대값은 그대로이고, head가 만든 판에 기대던 부분(head.test.ts의 판 준비, automatic-scout.test.ts의 판 비교)만 Phase 2에서 바꾼다 |
| 보드 Team | briefing.test.mjs·project-page-loaders.test.ts: `runnable` 노드에 옛 `propose`가 남아 있어도 Automatic picking이 꺼져 있으면 Team에 pm이 없고, 켜져 있으면 pm이 맨 앞에 있다. 여러 Pipeline의 노드 합집합에서 에이전트가 한 번씩만 나오고, pm 다음 순서는 `PipelinesView` 순서로 이어 붙인 첫 자리다. `loadPipelinesView`의 순서(기본 먼저, 나머지는 createdAt·id)는 pipeline-materialization.test.ts에서 본다 |
| 다운그레이드 | routing/settings/change/agents next 시험: 기존 규칙·기본 유지, 다운그레이드한 Free 프로젝트에서 Put on the board의 다른 Pipeline 선택(pipeline-routing.test.ts)과 changePipeline(통합 pipeline-change.test.ts)은 성공(§11), 편집/Automatic picking 변경 금지, 플랜 밖 실행은 기존 agent_next 거부 |
| 항목 변경 | 통합 pipeline-change.test.ts: Proposed·slots-v1·AgentRun 없음만 허용; planning/closed/legacy/run 없음/discarded/다른 프로젝트/stale 거부, 보관·없는·다른 프로젝트의 대상은 `Pipeline not found.`·조각 대상은 PIPELINE_CANNOT_RUN_ITEMS, 비소유자 `pipeline change access denied`, 미선택·해제 프로젝트는 잠금 안의 접근 재검사로 거부하고 zero-write, 동일 판 no-op도 stale 검사. tests/server/pipeline-change.test.ts: action은 `requireProjectWrite`가 실패하면(미선택·해제) 그 사유를 돌려주고, 형식 오류는 `Invalid pipeline change request.`이며, 두 경우 모두 서비스를 부르지 않음 |
| CAS와 audit | 같은 파일: 새 entry·옛 승인 재사용 금지, 변경 감사 note 1건과 필요 시 별도 자동 전이, 이벤트 실패·CAS 패자 전체 rollback, 중복 클릭 1회. 같은 항목의 plan 앞 슬롯 실행을 여는 `agent_next`와의 경합: 둘 다 User 행을 먼저 잠그므로 어느 쪽이 먼저든 한쪽만 이긴다 — 변경이 먼저면 `agent_next`가 바뀐 entry로 StaleCursor(`src/server/agents/run-query.ts:71`), `agent_next`가 먼저면 변경이 묶인 AgentRun을 보고 PIPELINE_CHANGE_UNAVAILABLE. 변경과 AgentRun이 함께 commit되지 않음 |
| DB A/B | pipeline-migration.test.ts — 첫 release: A 이름보다 앞선 predecessor 전체 재생, 판 없음/legacy/slots 포함 populated fixture, A 기본/정의(최신 판의 createdBy·createdAt 포함)/flag·run 보존. Phase 6: B 이름보다 앞선 predecessor로 B null 실패·필수 제약·FK/index 구조 |
| 롤백 | pipeline-rollback.test.ts: B 전(첫 release)·B 후(Phase 6), true/false, default가 최대 판 아닌 경우, legacy propose 제거, run 보존, 옛 저장/새 프로젝트 생성·다음 보상 migration 필요 확인 |
| UI 회복·identity | rail/list/automatic-pick/change-control 시험 + multiple-pipelines-browser.tsx: dirty 유지, 새 부모 arrival 경고, pipeline identity remount, stale/unknown 명시 reload, pending 중 이동/중복 mutation 금지, unmount 응답 무시, 열린 Pipeline 보관 뒤 기본으로 이동, Change pipeline 선택지에 현재 Pipeline·조각이 없고 선택지가 비면 컨트롤이 없음, Change pipeline 셀렉트는 항목 identity가 바뀌면 초기화되고 `stale`은 product-copy §12 문장·응답 유실은 "항목 변경 회복" 문장으로 보임 |
| 게이트 0개 경고 | rail-state.test.ts·pipeline-rail.test.mjs: 게이트 없는 조각 자체의 저장에는 경고와 "Save without a gate"가 없다. 조각 저장이 사용처의 마지막 게이트를 없애면 경고한다. 게이트가 없는 기본 Pipeline 저장은 지금처럼 경고한다 |
| 조합 편집의 생성·슬롯 id | rail-state.test.ts·pipeline-rail.test.mjs·multiple-pipelines-browser.tsx: 빈 새 초안은 저장 불가지만 첫 일반 노드/연결을 추가할 수 있고 맨 끝에도 연결을 추가한다. 연결 안에 `doc-auditor`·`doc-auditor#2`가 있고 로컬에도 슬롯이 있을 때 새 슬롯은 펼친 전체에서 비어 있는 id를 고른다. 연결 대상 정의는 불변이며 alias 혼합·같은 블록 중복은 기존 core 사유로 거부한다 |
| 참조 정의만 바뀐 snapshot | rail-state.test.ts·pipeline-rail.test.mjs·multiple-pipelines-browser.tsx: 부모의 saved.version/steps는 같고 자식 정의·부모 실행 판만 달라진 응답에서 dirty 초안은 유지되고 외부 변경이 표시된다. preview·Also changes·슬롯 예약·게이트 0개 경고는 새 snapshot으로 계산하며 이전 무게이트 확인은 재사용하지 않는다 |
| 편집 컨트롤의 쓰기 가능 상태 | pipeline-list.test.ts·automatic-pick-control.test.ts·pipeline-rail.test.mjs: Free·미선택·해제 프로젝트에서 New pipeline·Rename·Archive가 없고 규칙·기본 셀렉트와 Automatic picking 스위치는 값만 보이며 바꿀 수 없고, 사유는 레일과 같다. 사용 가능한 Pro·Max에서는 바꿀 수 있다. 새 Pipeline 첫 저장이 성공하면 그 Pipeline이 열리고, 저장 전 버전 줄은 `New pipeline · not saved yet`이다. 항목을 받지 않는 Pipeline에서만 앵커에 Remove가 있다 |
| 실제 화면·전송 | rehearse-multiple-pipelines.ts: 격리 DB·loopback 소유자 fixture의 Pipeline/Backlog/Board/Item/History 본문; 실제 Next action ID POST(savePipeline·설정 5종·proposeItem·changeItemPipeline)의 소유자 대조군과 비소유자·미선택/해제 거부. Free 거부는 savePipeline·설정 5종만 보고, proposeItem의 Pipeline 선택과 changeItemPipeline은 다운그레이드한 Free 프로젝트에서 성공하는지 본다(§11); 응답 유실 회복 |
| 생성물·copy | 생성 Prisma 모델 23개(project-availability-runtime.test.ts의 고정값); fresh build manifest에 savePipeline·설정 5종·changeItemPipeline 등록, reader 미등록; copy lock·실제 렌더 일치, retired-copy에 더한 Propose 노드 문구 패턴(Affected Files) 부재 |
| 제거·미러 | 아래 "구현 후 실행"의 `assert_absent` 호출 세 개가 모두 출력 없이 0으로 끝난다. 대상은 `savePipelineVersion`·`ensureCurrentVersion`·`loadCurrentVersionView`·`hasPropose` 식별자, `version-save-query` 경로, 옛 사유 `propose must be first`·`no propose node on this pipeline`이다(src·tests·scripts·packages·plugin/lib·product-copy). `rg`가 아직 Git에 추가하지 않은 새 소스도 검사한다. 일치 발견은 실패이고 검색 오류(종료값 2 이상)도 실패다. gitignore된 생성물은 별도의 Prisma/manifest 검사 대상이다. 새 함수/공개 API 존재; plugin/lib/pipeline.mjs byte equality, watch 기존 시험 그대로 |
| 검증 환경 실패 중단 | 준비·검증의 Git Bash 블록은 `set -euo pipefail`로 실행한다. 원격 dev 부재·fetch/설치 실패·DB 초기화/시작 실패 뒤 다음 쓰기가 실행되지 않아야 한다. DB 생성 전에 `SHOW data_directory`가 이번 PGDIR/data인지 확인한다. 검색 검증은 untracked 파일의 금지 심볼과 존재하지 않는 검색 경로를 각각 실패시키고, 무일치만 성공시킨다 |
| 범위 금지 | fsd·architecture: server→FSD/같은 layer feature import 없음, core 외부 의존 없음, 새 root app·MCP 도구/입력·private template 변경·자동 retry/Reopen 없음 |

리허설은 기존 격리 DB guard를 재사용하고 child DATABASE_URL을 테스트 DB로만 설정한다.
실제 원장/사용자 세션을 쓰지 않는다. fixture 사용자·독립 schema만 finally에서 정리한다.
barrier는 finally에서 해제하고 client·서버·proxy·timer를 닫는다. Windows background child는 windowsHide를 사용한다.

```bash
# 구현 후 실행("준비"의 worktree·셸). DB guard 실패는 연결/실행 중단이다.
set -euo pipefail
npm run db:generate
npm run db:validate
npm test
npm run test:web
npm run test:server
npm run test:server:integration
npm run verify:fsd
npm run test:architecture
npm run check
npm run build
# 옛 심볼·경로·사유의 부재. untracked 새 소스도 검사하며 검색 오류를 성공으로 뒤집지 않는다.
assert_absent() {
  local result
  if rg "$@"; then
    printf '%s\n' 'Unexpected retired symbol or copy remains.' >&2
    return 1
  else
    result=$?
    if [ "$result" -eq 1 ]; then return 0; fi
    return "$result"
  fi
}
assert_absent -n -w -e 'savePipelineVersion|ensureCurrentVersion|loadCurrentVersionView|hasPropose' src tests scripts packages
assert_absent -n -e 'version-save-query' src tests scripts
assert_absent -n -F -e 'propose must be first' -e 'no propose node on this pipeline' src packages plugin/lib docs/conventions/product-copy.md
# TEST_DATABASE_URL을 먼저 설정한 독립 DB에서만 실행한다.
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-multiple-pipelines.ts
```

fresh build manifest를 JSON 파싱하고 실제 POST·렌더 본문을 확인한다.
기존 fixture action-manifest.ts의 assertActions를 재사용하되 새 export와 reader 미등록을 명시 검사한다.
실제 loopback 브라우저에서는 조각 생성 → 연결/토글 → 깨지는 저장 거부 → type 미리 선택/override →
Proposed 변경 → Item·History Items 펼침/Events의 이름·감사 행 → stale/unknown recovery를 확인한다.

## Verification Results

### 문서 대조에서 실행한 검사 (2026-10-10)

- 제안의 JavaScript 함수와 현재 코어를 비교해 `propose` 없는 그래프 3,507건의 결과·첫 사유가 일치했다. 합성·순환·누락·중복·게이트·라우팅 경계와 10,000단계 연결도 통과했다.
- head의 기존 코드·Before·After를 1,536개 입력 조합으로 비교했다. PM off 사유 변경 외에는 상한·Scout·열린 실행·플랜 사용량 검사 순서와 결과가 일치했다.
- fenced 코드 33개를 추출해 fence 균형과 JS/TS 구문을 검사했다. 선언 계약은 미래 서비스 전체의 타입 검사 결과로 간주하지 않는다.
- 제안의 nullable A 스키마와 required B 스키마는 Prisma validate를 통과했다. 현재 스키마에서 A 스키마로 생성한 migrate diff의 테이블·컬럼·인덱스·외래키 DDL이 제안 SQL과 일치했다.
- 임시 PGlite(PostgreSQL WASM) 메모리 DB에 현재 스키마와 판 없음/legacy/slots-v1 fixture를 넣어 제안 SQL을 실행했다. A backfill·기존 판/런/이벤트 보존·전체 컬럼/제약/인덱스 catalog 일치, B null 발견 시 rollback·NOT NULL/FK 강제, B 전후 rollback·기본 판이 프로젝트 최대가 아닌 경우·설정 true/false·옛 writer 복귀·번호 overflow 시 zero-write가 통과했다. 단일 엔진 SQL 검사이며 Prisma 연결 간 잠금·운영 DB·실제 서버 배포를 검증한 결과는 아니다.
- 기존 파일 존재·새 파일 충돌·부모 디렉터리 선행 생성 계약과 공개 API/소비자/검증 목적지를 확인했다.
- 실제 애플리케이션·Prisma 통합 시험과 브라우저 리허설은 구현 후 아래 목적지에서 실행한다. 현재 `TEST_DATABASE_URL`이 없고 미래 서비스·화면도 아직 구현되지 않아 이번 대조에서는 실행하지 않았다. 승인·완료 기록을 채우지 않는다.

### 문서 재대조 (2026-10-13, dev `e12449b`)

- 10-10 이후 dev에 들어온 F7(#139·#145, 보류 항목은 제안을 거부하고 pm 후보로 세지 않음)과 #143(편집 액션 입력의 zod 스키마)이 이 문서가 인용한 코드를 바꿨다. §4 `decideHead`·§5 `propose`의 Before/After, §6 웹 액션, 인용 줄 번호, Affected Files·검증 목적지를 그 판에 맞췄다.
- 10-10 판에 처음부터 있던 결함도 고쳤다. `pipeline-types.test.ts`를 기존 파일로 적었지만 dev에는 없다(본 checkout 미커밋 작업의 파일). Phase 1 설명대로 After의 `gateReason`을 쓰면 `before-propose`가 통과한다. `owner-deps.ts`(nextFor)·`run-query.test.ts`(nextFor double)·`src-clean-code-acceptance.ts`(propose payload 정확 비교)가 목록에 없었다. 격리 시험 DB를 만드는 절차가 없었다. run-rules 시험 지시가 `hasPropose` 11곳 중 한 describe만 가리켰고 import가 중복됐다. product-copy의 Team 문구 위치(§6), §12에 더할 새 사유 목록과 `propose must be first` 행 삭제가 빠져 있었다. §4 `ensureRunIn`의 커서 계약이 현재 코드의 `?? sequence(graph)[0]` 대체값을 빠뜨렸다. 이름 검사, 설정·항목 변경 입력의 형식 오류, 규칙 대상의 실행 판 없음 거부 문구가 정해지지 않았다(이번에 제안값을 넣었다. 형식 오류는 기존 `Invalid … request.` 관례를 따랐다). §12에 더할 사유 목록에 `pipeline change access denied`가 없었다. 추가 시험 1의 보관 사례가 쓰지 않는 변수를 남겨 lint 경고(기준선 0건)를 냈다. `tools.ts`를 설명 변경 대상으로 적었지만 도구 설명에는 propose 노드 문구가 없다(check로 고침). proposeInputSchema의 import 경계를 지키는 `inbox-card-boundary.test.ts`가 목록에 없었다.
- After 코어 모듈을 조립해 dev 코어의 `validateGraph`와 propose 없는 입력 503,715건(세 플랜)을 비교했다. 결과·첫 사유가 모두 같았다. `defaultGraph`는 세 플랜에서 propose만 빠졌다. 추가 시험 1(합성)은 5/5 통과했다.
- Phase 1 형태(위 gate 조건 포함)는 기존 `pipeline.test.mjs` 27/27이 수정 없이 통과했다. propose가 든 입력 59,574건도 Before와 같았다. gate 조건을 빼면 34건이 달라지고 시험 1건이 깨진다.
- After 스키마(A)는 `prisma validate`를 통과했다. dev 스키마와의 `prisma migrate diff`가 SQL A의 DDL과 문장 단위로 같았다.
- 포터블 PostgreSQL 18의 버리는 DB에 기존 migration을 모두 적용하고 다음 프로젝트와 각자의 런을 넣었다: 판 있음(최신 판에 propose, legacy 판 포함), propose 없음, 판 없음. 그 뒤 SQL A·B·롤백을 실행해 다음을 단언했다.
  - A: 기본 Pipeline, `defaultPipelineId`, `pipelineId` backfill, propose를 뺀 정의 v1, `autoProposeEnabled`, 런 고정 보존. 백필을 다시 돌려도 바뀌지 않았다.
  - B: null 판이 있으면 거부했고, 없으면 NOT NULL이 걸렸다.
  - 롤백: NOT NULL을 풀었고, 자동 선택 설정에 맞춰 propose를 넣은 판을 프로젝트 최대 판으로 더했다.
- Execution Plan "준비" 절차대로 만든 dev worktree에서 Verification Plan의 명령을 구현 전 기준선으로 돌렸다. 모두 exit 0이었다.

  | 명령 | 결과 |
  | --- | --- |
  | `npm run db:generate` · `npm run db:validate` | 통과 |
  | `npm test` | 341 pass, 2 skip |
  | `npm run test:web` | 587 pass |
  | `npm run test:server` | 55 pass, 1 skip |
  | `npm run test:server:integration` | 통과(러너가 개수를 내지 않는다) |
  | `npm run verify:fsd` · `npm run check` | 통과 |
  | `npm run test:architecture` | 44 pass, 2 skip |
  | `npm run sync:plugin-lib` | 복사 0, 작업 트리 변화 없음 |
  | `npm run build` | 통과. server-reference-manifest에 `savePipeline`·`saveAutomaticScout`·`proposeItem` |

  리허설 명령의 `scripts/rehearse-multiple-pipelines.ts`는 구현이 만든다. 기준선에서 같은 명령은 loader(`register-server-only`·tsx)를 지나 그 스크립트의 `ERR_MODULE_NOT_FOUND`로 끝났다. 명령 형태는 `docs/architecture/verification.md`의 기존 리허설(`rehearse-automatic-scout.ts` 등)과 같다.
- "준비"의 정리 단계도 실행했다. 포터블 PostgreSQL 정지·삭제는 그대로 됐다. 경로가 긴 scratch worktree(약 140자)에서는 `worktree remove`가 `Filename too long`으로 실패해 등록만 지워졌다. 그 디렉터리는 `\\?\` 리터럴의 `rd /s /q`로 지웠다. 39자 경로에서는 `worktree add -b` → `npm ci` → `npm run build` → `worktree remove`가 모두 성공했다. 그래서 "준비"에 짧은 경로 조건과 실패 시 정리 명령을 적었다.

### 문서 재대조 2회차 (2026-10-13, dev `f46ff23`)

- 1회차 뒤 dev에 #146(Plan 형을 `packages/core/entitlement.mjs` 하나로)과 #147(turn-banner 토큰 단계)이 들어왔다. 그래서 인용 두 곳(`entitlement.mjs:12`→`:15`, `turn.ts:78`→`:79`)과 §4의 Plan import 출처를 맞췄다. 1회차에 `run-query.test.ts`를 조건부 check로 적었지만 §4 계약상 double에 `$transaction`이 반드시 필요하므로 update로 고쳤다.
- 1회차의 검사를 이 판에서 다시 돌렸다. 결과는 1회차와 같았다.
  - 인용 81곳은 위 두 곳 말고 그대로였다. Before 블록 7개는 dev와 같았다.
  - Affected Files와 역방향 검색에서 빠진 것이 없었다. 문구 대조에서 모르는 사유가 없었다.
  - 코어 차등 비교 503,715건에서 차이가 없었다. 합성 시험 5/5, Phase 1 형태 27/27, 형 선언 tsc를 통과했다.
  - 스키마 `prisma validate`를 통과했고 DDL 14문장이 일치했다. PostgreSQL 18에서 A·B·롤백 단언도 통과했다.
- "준비" 절차를 39자 경로에서 돌렸다. 구현 브랜치 이름을 미리 만들지 않도록 `-b`에는 버리는 이름을 썼고, 나머지는 적힌 그대로다. 기준선 명령은 모두 exit 0이었다.
  - `npm test` 341 pass·2 skip, `test:web` 588 pass, `test:server` 55 pass·1 skip, `test:architecture` 44 pass·2 skip
  - `test:server:integration`·`check`·`verify:fsd`·`build`는 통과했고, `sync:plugin-lib`는 복사 0이었다.
  - 리허설 명령은 스크립트가 없어 `ERR_MODULE_NOT_FOUND`로 끝났다.

### 문서 재대조 3회차 (2026-10-13, dev `f46ff23` 그대로)

- dev는 2회차와 같았다. 대신 앞선 두 회차가 놓친 결함을 고쳤다.
  - §7 표가 `setDefaultPipeline`에 보관된 Pipeline을 넘기면 `PIPELINE_CANNOT_RUN_ITEMS`로 거부한다고 적었다. 이것이 §6과 §8 문구 표의 `Pipeline not found.`와 어긋났다.
  - §6에 웹 action이 지금 하는 `validateGraph` 앞단 검사를 어떻게 할지 적혀 있지 않았다. 그대로 옮기면 조각 저장이 action에서 거부된다.
  - `gateLabel`이 받을 이름 조회가 선택 인자인지 적혀 있지 않았고, 그 소비자 `inbox-card.tsx`도 목록에 없었다.
  - board-query의 `ensureRun` import 제거, protocol.md `:401`의 두 번째 Propose 문장, 추가 시험 1의 근거(실제로는 `expand`가 거부한다), 후보 정의의 줄 위치(`:396`), 템플릿 경로를 바로잡았다.
- 다음 검사를 다시 돌렸다. 역방향 검색의 두 번째 갈래와 삭제 cascade는 이번에 더한 검사다.
  - Before 블록 7개가 dev와 글자 그대로 같고 인용 줄 범위도 맞았다. 이번 회차 시작본의 인용 85곳을 줄 내용과 나란히 대조했다.
  - Affected Files의 존재·충돌 검사를 통과했다. 역방향 검색은 두 갈래로 돌렸다: 옛 심볼·writer 12종, §8이 기대는 DTO·라벨 기호 14종. 영향이 있는데 목록에 없던 것은 `inbox-card.tsx` 하나였다. 나머지 목록 밖 사용처는 이름만 같은 별개 형이거나, 바뀌지 않는 호출이거나, 모듈 전체를 stub으로 바꾸는 시험이었다.
  - 코어 차등 503,715건에서 차이가 없었다. 합성 5/5, Phase 1 형태 27/27, propose 입력 59,574건도 같았다. tsc와 시험 조각 lint도 통과했다.
  - 스키마 A·B의 `prisma validate`를 통과했다. DDL 14문장은 한 문장이 PK 열 목록의 공백만 다르고 모두 같았다.
  - PostgreSQL 18에서 A·B·롤백 단언과 프로젝트·사용자 삭제 cascade가 통과했다.
- "준비" 절차와 기준선 명령, 정리 단계를 다시 실행했다. 구현 브랜치 대신 버리는 이름을 썼다.
  - 기준선은 모두 exit 0이었다: `npm test` 341 pass·2 skip, `test:web` 588, `test:server` 55·1 skip, `test:architecture` 44·2 skip, 통합·`check`·`verify:fsd`·`build`, `sync:plugin-lib` 복사 0.
  - 리허설 명령은 `ERR_MODULE_NOT_FOUND`로 끝났다.

### 문서 재대조 4회차 (2026-10-13, dev `f46ff23` 그대로)

- dev는 3회차와 같았다. 3회차까지 놓친 결함을 고쳤다.
  - 잠금 안 서비스의 Free 거부 사유가 정해지지 않았다. 그 문장 `PIPELINE_EDIT_PLAN_GATE`는 FSD feature에 있어 `src/server`가 import할 수 없다(fsd.md). 그래서 core가 소유하고 plan-gate.ts가 다시 내보내게 했다. Automatic picking의 Free 거부 사유도 같은 문장으로 정했다.
  - 판이 없는 새 프로젝트의 가상 기본이 문서대로라면 Put on the board 선택지·Runs items·Team에서 빠졌다("저장된 실행 판 존재"로 판단). `loadPipelinesView`가 가상 기본에 기본 그래프를 `runnable`로 돌려주고, 모두 `runnable !== null`로 판단하게 했다.
  - 옛 심볼·사유의 음성 검사가 "옛 심볼 import 부재"뿐이었다. 대상 전체와 명령 세 줄, retired-copy에 더할 패턴을 적었다.
  - 그 밖에: Phase 2 스위치가 부르는 `setAutomaticPick`을 Phase 2로, 승격 전 fast-forward 확인, 열린 Pipeline 보관 뒤 기본으로 이동, 성공 기준 11의 빠진 두 동작.
- 이번에 더한 검사:
  - 현재 `run-query.ts` 본문과 §4 계약을 줄 단위로 대조했다. `ensureRun`의 직접 호출자(시험·리허설)는 모두 연결된 프로젝트에서 부르므로 새 접근 검사에 걸리지 않는다.
  - Coverage Stability: worktree에서 지워질 export·형을 실제로 지우고 `tsc --noEmit`과 서버·웹·코어 시험을 돌렸다. tsc가 깨뜨린 8개 파일과 시험이 실패한 두 파일(run-rules.test.mjs·board-query.test.ts)이 모두 목록에 있었다.
  - 새 명령(음성 검사 세 줄, fast-forward 확인)은 plain Git Bash에서 기준선으로 실행했다. 음성 검사는 지금 쓰는 곳을 출력하고 1로 끝났다. fast-forward 확인은 1이었다(main이 dev와 갈라져 있음).
- 기준선 명령과 "준비"·정리 절차의 결과는 3회차와 같았다.

### 문서 재대조 5회차 (2026-10-13, dev `aecc676`)

- 4회차 뒤 dev에 #150(SEO 메타데이터)이 들어왔다. 이 문서가 고치는 코드는 건드리지 않았지만 product-copy에 17줄을 더해 인용 하나가 밀렸다(`product-copy.md:1245`→`:1262`).
- 4회차까지는 지워지는 것만 기준으로 목록을 닫았다. 이번에는 더해지는 것도 닫았다. worktree에 schema A와 "create" 파일 27개를 stub으로 넣고 시험 전체·verify:fsd·lint·tsc·build·action manifest 검사(`RDC_CHECK_ACTION_MANIFEST=true`)를 돌렸다. 깨진 것은 `scripts/project-availability-runtime.test.ts`의 생성 모델 수 고정값(20) 하나였다. 목록에 없던 이 시험을 update로 더하고, Phase 2와 검증 목적지에도 적었다.
- 그 밖에 고친 것: 새 리허설 스크립트를 `verification.md` 스크립트 표에 올리는 지시(리허설 13개 중 10개가 표에 있다). 추가 가능 목록 지시의 위치(실제로는 `pipeline-rail.tsx`의 `NODE_KINDS.filter`).
- 확인만 한 것:
  - `migration.test.ts`의 23/17은 경계 이름보다 앞선 디렉터리만 세므로 새 migration에 영향받지 않는다.
  - `PRESERVED_TABLES`는 D3 정리의 역사적 목록이라 새 테이블을 더하지 않는다(UserToken 선례).
  - `briefing.fixture.mjs`와 `pipeline-save-state.test.ts`는 check가 맞다.
- 새 dev에서 "준비"·기준선 명령을 다시 돌렸다. `test:web`이 590 pass(#150의 시험 2개)인 것 말고는 4회차와 같았다. 음성 검사 세 줄과 fast-forward 확인도 1로 끝났다(구현 전이고 main이 아직 dev와 갈라져 있음).

### 문서 재대조 6회차 (2026-10-13, dev `aecc676` 그대로)

- dev와 템플릿은 5회차와 같았다. 이번에는 옛 데이터(migration A가 그대로 두는 판의 `propose`), 시나리오별 거부 사유, Serializable `propose`의 잠금 전 스냅숏, release 경계를 따라 다시 대조해 처음부터 있던 결함을 고쳤다.
  - Team이 `runnable` 노드를 모으면 옛 판에 남은 `propose`가 `slotAgent("propose") = "pm"`으로 pm을 다시 넣는다. 그래서 Automatic picking을 꺼도 Team에 pm이 남았다. dev의 `buildBriefing`에 옛 노드를 넣어 재현했다. `propose`를 빼고 pm은 설정으로만 정하게 했다.
  - 항목 생성·변경이 보관되거나 없거나 다른 프로젝트의 파이프라인을 조각과 같은 사유(`PIPELINE_CANNOT_RUN_ITEMS`)로 거부했다. §8 문구 표가 같은 경우를 `Pipeline not found.`로 정한 것과 어긋났다. `runnableReason`이 두 사유를 나누고, 그 상수는 run-query가 소유한다.
  - 배포 5번이 B를 적용하는데, B 파일을 담은 cleanup release는 6번에서야 준비했다. migration을 어떤 작업 트리에서 어떤 명령으로 적용하는지도 없었다. A·B 모두 dev에 머지한 뒤 `migrate status`로 대기 migration을 확인하고 `migrate deploy`로 적용하게 순서를 고쳤다. 두 명령은 격리 DB에서 Git Bash로 실행해 형태를 확인했다.
  - §4 5번이 "모든 writer가 프로젝트 잠금을 쓴다"는 이유로 물질화 INSERT에서 `ON CONFLICT DO NOTHING`을 빼게 했다. 그러나 Serializable인 `propose`는 잠금 전에 스냅숏을 잡는다. 포터블 PostgreSQL 18에서 같은 경합을 재현해 보니, 지금 코드의 방식(`ON CONFLICT DO NOTHING`)은 40001이고 그냥 INSERT는 23505였다. 그래서 물질화 INSERT를 `ON CONFLICT DO NOTHING ... RETURNING`으로 정하고 경합 시험에 이 경우를 더했다.
  - 검증 목적지 표의 B 사례(`pipeline-migration.test.ts`의 B, `pipeline-rollback.test.ts`의 B 뒤)는 첫 release에 B 디렉터리가 없어 쓸 수 없었다. cleanup release를 Phase 6으로 적고 그 사례를 거기로 옮겼다.
  - 그 밖에: "Pipeline changed"가 들어갈 product-copy 자리(§11의 같은 상태 행 목록), ProposeButton이 보이는 사유, revalidatePath 패턴 경로의 실제 범위(모든 프로젝트).
- 확인만 한 것:
  - MCP `pipeline_next`·`gate_approve` 경로는 이미 `guardUnavailable`·owner 접근 검사를 거치므로, §4 wrapper의 접근 재검사가 기존 MCP 동작을 바꾸지 않는다.
  - PipelineVersion을 직접 만드는 시험·리허설 9개 파일은 그 판에 고정된 런도 직접 만든다. 그 항목은 새 판 해석(`ensureRunnableVersion`)을 거치지 않으므로, 판에 `pipelineId`를 넣는 갱신은 필수 schema가 되는 Phase 6에서 해도 된다. fifth-pass 리허설의 proposeItem은 새 항목을 기본 파이프라인으로 올리지만 그 그래프를 단언하지 않는다.
  - 문구 잠금 블록(`turn-banner-*`·`history-tab`·`pipeline-save-recovery`)에는 바뀌는 Propose 문장이 없다.

### 문서 재대조 7회차 (2026-10-13, dev `aecc676` 그대로)

- dev·템플릿·문서는 6회차 끝과 같았다. 이번에는 바뀌는 **동작**에 기대는 시험을 찾았다. head가 판을 만들지 않게 되는데, `head.test.ts:46`과 `automatic-scout.test.ts:17`·`:23`은 head가 만든 판을 읽는다. 이 둘이 "Phase 6에서 고치는 DB writer" 목록과 "불변" 행에만 있어 Phase 2의 통합 시험이 깨진다. Phase 2 작업 내용과 검증 목적지에 고칠 내용을 적었다. 같은 종류를 찾으려고 `headFor`·`pipelineNext`를 부르는 시험·리허설과 판을 읽는 곳을 모두 훑었다. 해당하는 것은 이 둘뿐이었다.
- 이번에 처음 돌린 검사:
  - dev worktree에 schema A, After 코어·`.d.mts`, §4 `headFor`·§4 형 계약(stub), `run-rules` After, §5 `propose`·`routedPipelineId`·`runnableReason`·`changePipeline`을 그대로 끼워 넣고 `next typegen`·`tsc --noEmit`을 돌렸다. 오류는 0이었다.
  - 같은 트리에서 시험을 돌렸다(`npm test`, `test:web`, `test:server`, `test:architecture`, `test:project-availability`). 실패한 파일은 `pipeline.test.mjs`·`rail-state.test.ts`·`briefing.test.mjs`·`run-rules.test.mjs`·`project-availability-runtime.test.ts`였고, 모두 목록의 update다. 추가 시험 1(5/5)과 추가 시험 2의 조각도 그 트리에서 통과했다.
  - 소스를 읽어 규칙을 강제하는 시험(`project-availability-runtime`의 locked·owner·select 규칙, `inbox-card-boundary`의 스키마 import 경계, `review-gate-actions`의 proposeItem 재검증 3회)에 문서의 코드 조각이 걸리지 않는다. `retired-copy`의 `where` 값도 시험 파일 형식과 맞다.

### 문서 재대조 8회차 (2026-10-13, dev `aecc676` 그대로)

- dev·템플릿·문서는 7회차 끝과 같았다. 이번에는 §8 문구 표의 "소유·소비" 열을 §8 웹 표·Affected Files·§10과 한 줄씩 맞대 보고, migration이 옮기는 값과 동시 실행 경로를 다시 봤다.
  - 문구 표가 `AUTO_PROPOSE_DISABLED_REASON`을 "배너"가 쓴다고 적었지만, 웹 표와 Affected Files에서 배너가 바뀌는 곳은 첫 실행 3단계 문장(`turn.ts:79`)뿐이고 `turn-data.server.ts`는 목록에 없다. §10의 "자동 발굴의 꺼짐 문장 옆에"도 product-copy §18의 두 줄(스위치 "Off:"·배너 "shared Nothing open detail") 중 어느 쪽인지 정하지 않았다. 지금 동작(propose 노드를 빼도 배너 문장은 그대로)을 따라 배너는 바꾸지 않고, 이 문장은 head 사유와 Automatic picking 스위치의 꺼짐 문장으로 쓰게 정했다.
  - migration A의 정의 v1이 최신 판의 `createdBy`는 옮기면서 `createdAt`은 옮기지 않아, 배포 직후 기존 프로젝트의 버전 줄이 "saved just now"로 보였다. `createdAt`도 옮기게 SQL A를 고치고, 포터블 PostgreSQL 18에서 A·B·롤백 단언을 다시 돌렸다. 정의 v1이 최신 판의 `createdAt`(밀리초까지)과 `createdBy`를 받았고, 백필 재실행·B·롤백·프로젝트/사용자 삭제 cascade 단언도 통과했다. SQL A의 DDL은 바뀌지 않아 `migrate diff` 대조 결과는 그대로다.
  - 그 밖에: `changePipeline`과 같은 항목의 슬롯 실행을 여는 `agent_next`의 경합을 검증 목적지에 더했다(둘 다 User 행을 먼저 잠그고, `agent_next`는 entry가 바뀌면 StaleCursor). Phase 2 수동 확인의 "같은 레일"을 "Propose 카드만 빠진 레일"로 바로잡았다.
- 확인만 한 것: 새 `retired-copy` 패턴은 `plugin/skills`의 SKILL.md에 걸리지 않는다(플러그인은 바꾸지 않는다). 플러그인 런타임은 `lib/pipeline.mjs`를 import하지 않는다. `defaultGraph`·`validateGraph`·`NODE_KINDS`·`REQUIRED_NODES`의 시험 밖 소비자는 모두 목록에 있다.

### 문서 재대조 9회차 (2026-10-13, dev `aecc676` 그대로)

- dev·템플릿·문서는 8회차 끝과 같았다. 이번에는 §10이 "바꾼다"고 인용한 문장이 대상 문서에 있는지, 그 문장이 든 문단의 나머지도 이 변경으로 틀리게 되는지, `verification.md`의 변경 체크리스트와 Phase 순서를 봤다. blocker는 없었고 다음을 고쳤다.
  - product-copy §6 Team 행 첫 문장 "the agents the current pipeline dispatches, in graph order"가 여러 파이프라인 합집합에서는 틀리게 되는데 §10이 고치라고 하지 않았다. 합집합의 순서와 `PipelinesView.pipelines`의 순서도 정해지지 않아, 조회에 순서를 주지 않으면 목록·선택지·Team 순서가 DB 반환 순서에 맡겨졌다. 기본 먼저, 나머지는 createdAt·id 순으로 정하고 Team·§10·검증 목적지에 반영했다.
  - §8의 "product-copy를 먼저 반영"과 product-copy를 Phase 5에서 고치는 계획이 어긋났다. product-copy를 읽는 시험이 보는 문장을 이 문서가 바꾸지 않는 것을 확인하고, Phase 5에서 같은 PR 안에 고치는 것으로 문장을 맞췄다.
- 확인만 한 것: §10이 인용한 옛 문장(product-copy·protocol·invariants·system-overview·verification)은 모두 대상 문서에 있다. 템플릿 저장소와 `plugin/skills`에는 바뀌는 head 사유나 Propose 노드 문장에 기대는 곳이 없다. `verification.md`의 변경 전 체크리스트(사용자에게 말해 둔 사실을 바꾸면 `RETIRED`에 더함)는 이미 지킨다.

### 문서 재대조 10회차 (2026-10-13, dev `aecc676` 그대로)

- dev·템플릿·문서는 9회차 끝과 같았다. 이번에는 새 사용자 컨트롤마다 실제로 고를 것이 있는지, 새 같은 상태 TransitionEvent를 읽는 모든 곳, 새 action마다 권한·플랜 검사를 어디서 하는지를 봤다. 다음을 고쳤다.
  - `ItemPipelineView`에 현재 Pipeline id가 없어 Change pipeline 셀렉트가 현재 값을 표시하거나 선택지에서 뺄 수 없었다. 기본 그래프의 before-plan 게이트 때문에 대부분의 Proposed 항목이 보이는 조건을 만족하므로, 파이프라인이 하나뿐인 프로젝트에서는 고를 것이 없는 셀렉트가 항목마다 보였다. `pipelineId`를 더하고, 선택지는 현재 Pipeline을 뺀 runnable 목록이며 비면 컨트롤을 보이지 않게 했다.
  - 리허설 행이 모든 실제 POST에 "Free 거부"를 적었다. 이것이 사용자가 확인한 §11(다운그레이드한 Free에서도 Put on the board의 선택과 Change pipeline은 허용)과 어긋났고, 그 허용을 확인하는 검증 목적지도 없었다. Free 거부를 저장·설정 여섯 action으로 한정하고, 다운그레이드 행에 두 성공 사례를 더했다.
  - 항목 변경 action이 미선택·해제를 어디서 거부하는지 적혀 있지 않았다. 서비스는 잠금 안에서 소유자만 다시 본다. 기존 항목 action처럼 `requireProjectWrite`를 먼저 부르게 적고 action 시험에 더했다.
- 확인만 한 것:
  - 새 `pipeline-changed` 이벤트는 결재함(`latestBoardWithEvents`는 note 없는 이벤트만 읽는다), History Items(시각만 쓴다), `agent_next`의 종료 판정(특정 전이만 찾는다), 옛 형식의 게이트 판정(같은 상태 경계가 없다)에 영향이 없다. History의 `key` 보기에는 `actor: human`이라 들어간다.
  - 게이트 승인은 entry에 묶여 있어(`board-query.ts:419`) 새 entryId가 옛 승인을 무효로 한다.
  - 배너 `turn.ts:79`의 Propose 문장은 조건 없는 고정 문장이라 문구만 바꾸면 된다.
  - Put on the board의 Pipeline 필드는 선택지가 하나여도 기존 Assignee 필드처럼 제출되는 폼 안에 있으므로 그대로 둔다.

### 문서 재대조 11회차 (2026-10-14, dev `c60a906`)

- 10회차 뒤 dev에 #151(main의 #148·#149를 dev로 합친 back-merge)이 들어왔다. 바뀐 파일(`account-usage-query.ts`와 그 시험, 완료 문서 하나)은 이 문서가 고치거나 인용하는 곳이 아니다. Before 블록 7개는 dev와 글자 그대로 같고, 인용 101곳의 줄 내용도 그대로다. 배포 4번의 fast-forward 확인은 이제 0으로 끝난다(main이 dev의 조상이다).
- 새 dev에서 "준비" 절차와 기준선 명령을 다시 돌렸다. 모두 exit 0이었다: `npm test` 341 pass·2 skip, `test:web` 593 pass, `test:server` 55 pass·1 skip, `test:architecture` 44 pass·2 skip, 통합·`check`·`verify:fsd`·`build` 통과, `sync:plugin-lib` 복사 0. 리허설 명령은 `ERR_MODULE_NOT_FOUND`로, 음성 검사 세 줄은 지금 쓰는 곳을 출력하고 1로 끝났다.
- 이번에는 §10이 고치는 대상 문서의 해당 절 전체를 문장마다 After 동작과 대조하고, 새 동작 셋(게이트 0개 경고, Change pipeline 셀렉트, 항목의 파이프라인 이름)의 상태 전이 표를 처음부터 다시 채웠다. 다음을 고쳤다.
  - protocol.md "버전과 회차"의 "항목은 시작한 버전에 고정된다"는 Change pipeline(§5) 뒤에는 틀리는데 §10이 고치라고 하지 않았다. 이 문서 After schema의 PipelineVersion 주석도 같았다. 예외(Proposed·실행 전, 소유자 웹, 같은 상태 `pipeline-changed`, MCP에 없음)를 적게 했다.
  - 게이트 0개 경고를 편집 중인 Pipeline의 펼친 결과로 판정하면, 게이트 없는 조각(예: `impl-verify → qa`)을 저장할 때마다 조각에 없는 plan·implement를 말하는 경고와 두 번 누르기가 나오고, 조각 저장이 사용처의 마지막 게이트를 없앨 때는 경고가 없다. 이 저장 뒤 항목을 받는 그래프(자신과 사용처)로 판정하게 바꾸고 검증 목적지 행을 더했다.
  - product-copy §18의 "Remove for optional nodes"와 "the rail runs the same validateGraph the save action does"도 이 변경으로 틀려지는데 §10에 없었다.
  - 그 밖에: run이 없는 옛 항목(2026-09-10 migration은 run을 backfill하지 않았다)의 항목 화면 이름과 `pipelineId`, Change pipeline 셀렉트의 초기화 시점과 `stale`·응답 유실 문구.
  - 10회차에 적은 "`changePipeline` 서비스는 잠금 안에서 소유자만 다시 본다"는 틀렸다. `inProjectTransaction`이 잠금 뒤 미선택·해제·무결성을 거부한다(`board-query.ts:56`–`:57`). 문장을 고치고 통합 시험 행에 그 거부를 더했다. action의 `requireProjectWrite`는 그대로 둔다.
- 확인만 한 것:
  - 플러그인 감시는 `pipeline_next` 항목의 version·entry를 작업 서명(`watch.mjs`의 `workSignature`)에 넣는다. 그래서 Change pipeline으로 바뀐 값은 새 작업으로 보이고 멈춤 판정에 걸리지 않는다.
  - `changePipeline`이 다시 쓰는 PipelineRun 열(versionId·node·entryId·enteredAt·closedAt)이 모델의 커서 열 전부다. enteredAt을 `new Date()`로 쓰는 것은 지금의 `advanceRun`과 같다.
  - Serializable `propose`가 잠금 전 스냅숏으로 보관·기본 변경·규칙 변경·정의 저장과 겹쳐도, 결과는 propose가 먼저 실행된 직렬 순서와 같다. 보관은 기존 run이 있어도 허용되고, 저장은 실행 판을 가진 Pipeline을 조각으로 만들 수 없기 때문이다.

### 문서 재대조 12회차 (2026-10-14, dev `c60a906` 그대로)

- dev·템플릿·문서는 11회차 끝과 같았다. Before 블록 7개, 파일 목록, 인용 105곳도 그대로다. 명령과 준비 절차가 바뀌지 않아 11회차의 기준선 결과가 그대로 유효하다.
- 이번에는 §8의 사용자 컨트롤마다(목록의 New pipeline·Rename·Archive·규칙·기본, 레일의 Remove) 상태 전이 표를 다시 채우고, mutation마다 같은 요청을 다시 보냈을 때를 봤다. blocker는 없었고 다음을 고쳤다.
  - 목록의 편집 컨트롤이 Free·미선택·해제 프로젝트에서 어떤 상태인지 정하지 않았다. 지금 page는 레일에만 `editable`을 넘긴다. 레일과 같은 `editable` 규칙을 따르게 했다.
  - 이름 바꾸기가 자기 자신과 이름을 비교하는지 정하지 않아, 지금 이름 그대로 바꾸면 "Another pipeline already uses this name"이 나올 수 있었다. 새 Pipeline 저장은 expectedVersion으로 중복 제출을 막지 못하는데, 이름 검사가 그것을 막는다는 점도 적혀 있지 않았다.
  - 새 Pipeline의 첫 저장이 성공한 뒤 무엇을 여는지, 저장 전 버전 줄이 무엇인지 없었다.
  - 그 밖에: 앵커 Remove를 허용하는 "조각 편집"의 범위를 mustRun이 아닌 Pipeline으로 분명히 했고, 기존 Pipeline 저장에서는 name을 쓰지 않는다고 적었다. 규칙·기본 셀렉트의 선택지도 항목을 받는 Pipeline(`runnable !== null`)이고 같은 순서라고 §4에 적었다(조각을 고르면 서버가 거부하는 죽은 선택지가 된다).
- 확인만 한 것: 추가 시험 3이 쓰는 `impl-verify`·`qa`는 Pro에서 허용된다(`entitlement.mjs`의 pro agents가 REPORT_AGENTS 전부). `npm run check`가 lint·tsc·test:architecture·test:project-availability를 포함하므로 "구현 후 실행" 목록에 lint가 따로 없어도 된다.

### 문서 재대조 13회차 (2026-10-14, dev `c60a906` 및 현재 checkout 대조)

- 이번 검토 시작 시 개선할 점이 있었다. 이전 검토 결과의 유효성 확인만 하지 않고, 저장된 문서 전체와 구현 기준 dev·현재 checkout을 새로 대조했다. 애플리케이션 구현과 승인 상태는 바꾸지 않았다.
- 수정한 내용:
  - 새 Pipeline의 빈 초안에서 첫 단계를 추가하고 레일 끝에 연결을 붙일 경로를 정의했다. 기존 레일의 노드 앞 메뉴만 옮겨서는 이 경로가 생기지 않는다.
  - `addSlot`이 로컬 steps만 보고 id를 정하면 연결 내부의 `doc-auditor`와 충돌한다. 제안 core로 충돌 거부와 `doc-auditor#2`의 성공을 재현하고, 펼친 전체 슬롯 id를 예약하도록 했다. 참조 정의를 자동으로 수정하는 동작은 넣지 않았다.
  - 자식 저장 시 부모 정의 판은 그대로라는 §6 계약을 UI 갱신에도 반영했다. 의존 정의 변경을 감지해 dirty 초안을 보존하면서 preview·경고·슬롯 예약을 갱신하고, 이전 무게이트 확인은 해제한다.
  - `! git grep`는 untracked 새 파일을 놓치고 검색 오류도 성공으로 뒤집었다. 임시 Git 저장소에서 재현하고, untracked를 포함하는 `rg`의 무일치(1)만 성공으로 바꾸는 검사로 교체했다.
  - 준비 명령에 실패 중단과 실제 원격 dev 확인을 넣었다. DB 시작 실패 뒤 다른 로컬 인스턴스에 DB를 만들지 않도록 `data_directory`도 검사한다. DB 정리는 PowerShell에서 실제 Temp 하위 경로 확인·서버 정지 성공 뒤 수행한다.
  - 구현 기준 dev와 이전 checkout을 구분하고, 변경과 `agent_next` 경합의 실제 소유자인 `agents/run-query.ts` 및 그 시험을 보존 확인 목록에 명시했다.
- 이번에 실행한 검증:
  - JS/TS 코드 블록 구문, dev의 `defaultGraph`·`validateGraph` Before 일치, propose 없는 입력 35,253건의 결과·첫 사유 차등 비교, 합성 예제 5개와 10,000단계 연결, head 1,536개 입력 조합이 통과했다.
  - A/B Prisma schema validate, A DDL과 migrate diff의 구조 대조, 격리 PGlite의 A backfill·기존 판/런/이벤트 보존·전체 catalog·B 거부/성공·B 전후 rollback·번호 초과 zero-write가 통과했다.
  - 별도 포터블 PostgreSQL 인스턴스의 실제 data_directory를 확인한 뒤 두 연결로 Serializable 경합을 재현했다. `ON CONFLICT DO NOTHING`은 40001, 단순 INSERT는 23505였고 실패 transaction의 부분 쓰기는 없었다. 종료 시 자기 인스턴스를 정지했다.
  - Git Bash의 새 음성 검사 함수는 untracked 금지 심볼에서 1, 무일치에서 0, 잘못된 검색 경로에서 2로 끝났다. 실패 중단이 다음 쓰기를 막는 것도 확인했다.
- 위 결과는 제안 검증 당시의 계약·조각·검증 절차에 대한 증거다. 당시에는 새 서비스와 화면의 구현 후 통합 시험·실제 Next POST/브라우저 인수를 실행하지 않았다. 이후 구현·배포 결과는 아래 표와 연결된 보고서에 기록한다.

### 구현 후 실행 결과

| 명령/인수 | 결과 | 근거 |
| --- | --- | --- |
| `npm test` | PASS: 347, 기존 조건 skip 2 | 첫 release·cleanup 보고서 |
| `npm run test:web` | PASS: 633 | 동일 |
| `npm run test:server` | PASS: 143 | fresh action manifest 포함 |
| `npm run test:server:integration` | PASS | 격리 PostgreSQL A/B·rollback |
| `npm run check`, `npm run verify:fsd`, production build | PASS | 양 release 로컬·CI |
| 실제 Next HTTP·브라우저 | PASS | 8개 action·5개 화면·15개 브라우저 시나리오·61개 HTTP/Flight 회귀 |
| 운영 A/B 전환·조회·기존 원장 보존·서비스 재개 | PASS | 운영 인수 보고서 |

운영에서는 실제 항목을 변경하는 사용자 동작을 재실행하지 않았다. 해당 동작은 격리 DB·실제 Next 서버로 검증했다. private bundle 지원 인증은 이 기능 배포의 판정 범위가 아니다.

## Risks and Rollback

1. **구·신 서버 혼용**: 프로젝트 최대 판과 파이프라인별 최신 판의 의미가 다르다. 기존 unique를 유지해도 동시 운영 호환성이 생기지 않는다. 확정된 maintenance/drain 절차가 이를 막는다.
2. **전환 중 옛 쓰기**: A 뒤 옛 저장은 정의와 autoProposeEnabled를 갱신하지 않는다. B의 pipelineId 보정만으로 회복할 수 없다. null 판이나 옛 writer가 발견되면 전환을 중단하며 B로 덮지 않는다.
3. **자동 파이프라인 변경 창 없음**: Proposed 조건을 유지하기로 사용자 확정했다. 즉시 planning이 된 항목에는 Change pipeline을 표시하지 않는다. planning·Reopen으로 창을 넓히지 않는다.
4. **공용 정의 변경 영향**: 다음 항목부터 사용처 실행 판이 바뀐다. Also changes 목록과 서버 재조립 사유를 표시한다. 이미 고정된 run은 바꾸지 않는다.
5. **경합·timeout·응답 유실**: 15초 transaction timeout과 기존 Serializable 오류를 따른다. 실패 감사/부분 쓰기/자동 재제출을 막는 통합 시험과 UI 회복 시험을 완료 조건으로 둔다.
6. **운영 검증**: Prisma 통합·실제 Next/DB 인수와 운영 백업 복원본의 A/B/rollback 리허설을 완료했다. 운영 A/B, 각 서버 배포와 재개 결과는 운영 인수 보고서에 있다. 실제 운영의 브라우저 편집 흐름과 private bundle 지원 인증까지 검증한 것은 아니다.
7. **다른 미커밋 작업과의 머지 순서**: 본 checkout의 plugin-clean-code 작업(2026-10-13 미커밋)이 `packages/core/pipeline.mjs`(nodeDone)·`pipeline.d.mts`(NodeFacts)·`pipeline.test.mjs`·`docs/architecture/protocol.md`를 함께 고치고 `packages/core/pipeline-types.test.ts`를 만든다. 늦게 머지되는 쪽이 dev에 rebase하고 core 시험과 `npm run check`를 다시 돌린다.

롤백은 **maintenance 유지 → 데이터 보정 → 옛 서버 검증 → 재개** 순서다. 먼저 옛 서버를 공개 배포하고 나중에 보정하지 않는다.

1. 웹 쓰기·MCP 실행을 중지하고 모든 신규 서버 요청을 drain한다. backup과 실행 판 번호 상한을 확인한다. 복구 작업에 실패하면 maintenance를 유지한다.
2. B를 적용했다면 pipelineId NOT NULL을 아래 transaction에서 완화한다. 옛 저장·새 프로젝트 기본 물질화는 pipelineId를 쓰지 않으므로, 필수 제약을 남기면 이전 서버가 정상 동작할 수 없다. FK·새 테이블·원장 행은 유지한다.
3. 기본 Pipeline의 최신 실행 판을 프로젝트 최대 판으로 복사한다. 자동 선택 true면 propose를 정확히 한 번 앞에 넣고 false면 옛 판에 있던 propose도 제거한다. 기본 판이 없는 프로젝트는 설정 true·정의/판 모두 미저장인지 확인한다. false인데 판이 없거나 정의/판 일부가 없는 비정상 데이터는 복구를 중단한다.

```sql
-- maintenance/drain 뒤 운영 복구 작업에서 한 번 실행한다.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PipelineVersion" WHERE "version" >= 2147483647) THEN
    RAISE EXCEPTION 'pipeline version limit reached';
  END IF;
END $$;
ALTER TABLE "PipelineVersion" ALTER COLUMN "pipelineId" DROP NOT NULL;
WITH d AS (
  SELECT DISTINCT ON (v."projectId") v."projectId", p."defaultPipelineId", v."nodes", v."gates", v."format", p."autoProposeEnabled"
  FROM "PipelineVersion" v JOIN "Project" p
    ON p."id" = v."projectId" AND v."pipelineId" = p."defaultPipelineId"
  ORDER BY v."projectId", v."version" DESC
), m AS (SELECT "projectId", MAX("version") AS top FROM "PipelineVersion" GROUP BY "projectId")
INSERT INTO "PipelineVersion" ("id", "projectId", "pipelineId", "version", "nodes", "gates", "format", "createdBy")
SELECT 'rollback_' || d."projectId" || '_' || (m.top + 1), d."projectId", d."defaultPipelineId", m.top + 1,
  CASE WHEN d."autoProposeEnabled" THEN array_prepend('propose', array_remove(d."nodes", 'propose'))
       ELSE array_remove(d."nodes", 'propose') END,
  d."gates", d."format", 'rollback'
FROM d JOIN m ON m."projectId" = d."projectId";
COMMIT;
```

4. 이전 서버를 maintenance 상태로 배포하고 기존 run·head·새 프로젝트 물질화·기본 저장을 검증한다. 데이터 보정은 기존 PipelineRun.versionId를 바꾸지 않는다. 웹 쓰기와 MCP를 재개한다.
5. 복귀 배포 후 pipelineId null인 옛 쓰기와 정의 불일치가 생길 수 있다. **동일 B migration을 다시 migrate deploy해서 해결된다고 보지 않는다.** 재도입 전에 새 보상 migration을 작성해 옛 쓰기를 기본 Pipeline에 귀속시키고 최신 기본 정의/설정을 새 판으로 복원하며, null 검증 뒤 NOT NULL을 복구한다. checksum이 기록된 A·B 파일은 수정하지 않는다.
6. 테이블/컬럼을 삭제하는 down migration은 하지 않는다. 복구 rehearsal은 각 실패 지점에서 transaction rollback·maintenance 유지·원장 보존을 단언한다.

## Completion or Closure Notes

완료일·검증 요약은 front matter를 따른다.

- implementation PR: [#163](https://github.com/Sangeok/stagekeeper/pull/163), [#164](https://github.com/Sangeok/stagekeeper/pull/164).
- 변경: Pipeline·Definition·Rule, 기본/자동 선택, 합성 편집과 항목 선택·변경, A/B migration 및 필수 Prisma 관계.
- 운영 인수: 필수 schema 서버 배포와 서비스 재개 완료. 백업·복원·구형 주소 차단·원장 보존 근거는 운영 보고서에 보존한다.
- 범위 밖 후속: private bundle 전체 지원 인증은 기존 [dual-client 보고서](../../test-reports/active/dual-client-runtime-report.md)에서 별도로 추적한다.

## 구현 완료 조건

- 성공 기준 1–12와 검증 목적지 표의 모든 행을 충족한다. 데이터/권한 실패는 전체 rollback이며 운영 결과를 로컬 시험으로 대체하지 않는다.
- A release와 B cleanup release 각각의 적용 스키마로 client를 생성하고 fixture·기존 검사·fresh build를 통과한다. A 뒤 old writer 부재와 B/롤백의 실제 DB 결과를 기록한다.
- 웹의 최종 본문·copy-lock·new action manifest·직접 POST·stale/unknown 회복을 실제 목적지에서 확인한다. 시각 배치 검토가 선행돼야 Phase 4를 완료로 기록할 수 있다.
- 새 초안에서 첫 단계와 끝 연결을 추가할 수 있고, 슬롯 id는 연결 내부까지 포함해 충돌하지 않는다. 자기 정의 판이 그대로인 의존 정의 변경도 preview/경고/확인 상태에 반영한다. 검증은 untracked 소스까지 검사하고 검색·환경 준비 실패를 성공으로 간주하지 않는다.
- 삭제된 옛 서비스/심볼 import가 없고 새 공개 API가 있으며 미러가 일치한다. MCP·기존 run/원장·전체 미결 상한·보류 항목 제안 거부·Scout/다운그레이드 계약을 보존한다.
- 실제 코드 변경/운영 배포는 이 문서 대조 작업의 범위가 아니다. 승인 기록을 임의로 채우지 않는다.

## Review Checklist

- [x] 완료 상태와 검증 결과를 기록하고 완료/닫힘 전용 미작성 항목을 정리했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다.
- [x] `stage`는 pending 문서에서만 사용했다.
- [x] 승인 기록을 채웠으며 완료 상태의 `stage`는 null이다.
- [x] `proposal-size`는 standard이고, standard 강제 조건(마이그레이션·데이터 구조·5개 이상 파일)에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용한다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. (실행 전)
- [x] 잔여 리스크를 명시했다.

## 결정 사항과 승인 이후 작업

- 2026-10-10 사용자 확인: Automatic picking 변경은 Pro·Max만; 다운그레이드 후 기존 파이프라인·규칙·기본·선택은 유지한다.
- 이미 열린 PM 실행의 board_propose를 추가로 차단하지 않는다.
- 파이프라인 변경은 Proposed이고 AgentRun이 없을 때만 허용한다. planning 창을 넓히지 않는다.
- 운영 전환은 maintenance와 기존 요청 drain을 사용한다. 실제 운영 실행은 별도 배포 작업이다.
- Phase 4 전 시각 배치 검토는 Approval-after다. 데이터·문구·상호작용 계약은 §8로 확정하고, 제품 정책 미결로 남기지 않는다.
- 물질화 경합은 사용자 결정 사항이 아니라 §4 구현/검증 계약이다.
