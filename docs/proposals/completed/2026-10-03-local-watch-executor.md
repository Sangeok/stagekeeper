---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-02"
approved-by: "user (explicit chat request)"
approved-at: "2026-10-02"
approval-scope: "Stage 1 implementation, verification, commit and pull request to dev; Stage 2 remains design only. 2026-10-03 사용자 지시로 코드 구현 완료를 기준으로 completed 처리하며 브라우저·배포·운영 인수는 후속 작업으로 남긴다."
completed-at: "2026-10-03"
verification-summary: "PR #100 dev 병합(0aec9ab); 구현 보고서의 core/CLI 254, web 526, architecture 26, project-availability 18 PASS; check·build·verify:fsd 및 격리 Claude 메인 대화 스모크 PASS. 브라우저·hosted cache·mathgic 운영 실측은 미실행 후속 작업."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/investigations/active/harness-platform.md"
  - "docs/proposals/completed/2026-09-10-configurable-pipeline.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/fsd.md"
  - "plugin/skills/init/references/reconciliation-contract.md"
  - "docs/conventions/product-copy.md"
  - "docs/test-reports/active/2026-10-02-local-watch-executor.md"
---

# 로컬 실행기 — 세션 감시형 `/harness:watch`(1단계)와 상주형(2단계 설계)

1단계 코드 구현은 PR [#100](https://github.com/Sangeok/stagekeeper/pull/100)으로 완료되어
2026-10-02 dev에 병합됐다(`0aec9ab9144f6c9c26c5e39c3321c09771791ddb`). 2026-10-03 사용자
지시에 따라 코드 구현 완료를 기준으로 이 문서를 `completed` 처리한다. 자동 검증과 격리 세션
시험 결과는 [구현 보고서](../../test-reports/active/2026-10-02-local-watch-executor.md)에 있다.
브라우저·플러그인 설치/배포 확인·운영 실측은 후속 작업이며, 2단계 상주형은 설계만 완료했다.

## Summary

웹에서 게이트를 열어도 에이전트가 시작되지 않는다. 서버는 상태만 바꾸고, 에이전트를 띄우는 쪽은
사람이 연 Claude Code 세션뿐이기 때문이다. 이 제안은 플러그인에 `/harness:watch`를 더한다. 사용자가
연 Claude Code 세션이 백그라운드 감시 스크립트를 걸어 두고, 할 일이 생기면 그 세션이 깨어나 런북대로
처리한다. 서버·DB·에이전트 토큰 도구 집합은 바꾸지 않는다.

**설계는 두 단계를 함께 하고, 구현은 1단계만 한다.** 2단계(창 없이 `claude -p`를 띄우는 상주형)는
1단계와 같은 감시 코어·이벤트·정책 파일·잠금을 쓰도록 연결 지점만 정해 둔다. 무인 실행에 줄 권한
목록은 1단계 운용에서 얻는다. 같은 변경으로, 이 상황을 가리던 배너와 결재함 문구도 고친다.

## Goal

- 웹에서 게이트를 연 뒤, 감시 중인 세션이 사람의 입력 없이 다음 노드를 시작한다.
- 기다리는 동안 모델을 부르지 않는다. 판정은 스크립트가 하고, 세션은 일이 있을 때만 깨어난다.
- "누가 시작하는가"를 화면이 사실대로 말한다. 사용자 차례인 항목이 아무도 시작하지 않은 항목의
  안내 줄을 가리지 않게 한다.
- 작업 유형: 기능 추가(플러그인 스킬·스크립트, 순수 판정 모듈), 웹 문구·판정 수정, 계약 문서 갱신.

비목표:

- **2단계 상주형 구현.** 연결 지점과 설계만 이 문서에 둔다(§2단계 설계).
- **클라우드 루틴 실행기(`executorKind: "routine"`).** 명령 원장(Phase 3.1)과 GitHub 쓰기 권한(Phase 4의
  GitHub App)이 먼저 필요하다. 그래서 필요가 생길 때 따로 다룬다.
- **자동 push.** 런북 계약은 "Pushing is the owner's job; a pipeline step never grants it."
  (`plugin/templates/en/CLAUDE.runbook.md:101-102`)이다. 감시 세션에도 커밋 허용 여부만 묻는다.
- **항목이 고정된 파이프라인 버전 표시**(보드·항목 화면, 저장 시 경고). 별도 소규모 제안서로 다룬다.
- 런북 템플릿(`plugin/templates/`, private 중첩 저장소) 변경과 DB 재시드. 스킬이 런북을 그대로 따르므로
  템플릿은 바꾸지 않는다.
- 서버(`src/server`)·Prisma 스키마·MCP 도구 변경. 기존 `project_get`·`pipeline_next`만 감시 CLI가 호출한다.

성공 기준:

1. mathgic에서 `/harness:watch`가 도는 동안 웹 게이트를 열면 다음 성공한 폴링이 할 일을 감지하고
   세션이 다음 노드를 시작한다. 건강한 서버의 감지 지연은 기본 간격 60초 + 해당 HTTP 응답 시간
   이내다. 세션 통지·디스패치·권한 확인 시간은 별도로 측정한다. 웹 승인 완료를 관측한 로컬 시각,
   `work` 출력 시각, 다음 `agent_next` 성공 응답의 로컬 수신 시각과 receipt(runId/revision/stepId)를
   연결해 기록한다. 열린 실행 재개도 receipt로 확인한다. 서버 게이트 `TransitionEvent.at`은
   History/board_get에서 보조 증거로 읽으며 로컬/서버 시계 차이를 확인하지 않고 차이를 계산하지 않는다.
   현재 History는 event/report만 노출하고 AgentRun.openedAt/AgentRunStep.at은 노출하지 않는다
   (`src/server/pipeline/history-page.ts`, `src/fsd/pages/project-history/model/history-view.ts`).
   그 DB 시각을 필수 실측 경로로 삼지 않으며 운영 DB 직접 조회나 시험용 서버 변경도 추가하지 않는다.
2. 할 일 없이 감시하는 동안 세션은 감시 시한(기본 110분)마다 한 번만 깨어난다(`idle` → 재무장).
3. 동일한 실행 가능 작업 집합이 재무장 뒤 세 번 연속 반환되면 `stuck`으로 감시가 멈춘다.
   폴링 틱이나 HTTP 재시도는 횟수에 넣지 않는다. 빈 작업 집합·노드/회차/작업 집합 변경은 횟수를
   초기화한다. 서버 내부 단계 진전을 측정하는 watchdog이라는 주장은 하지 않는다.
4. ITEM-02가 인수를 기다리고 ITEM-01이 아무도 시작하지 않은 plan 노드에 있을 때, 배너의
   "Next, in Claude Code" 상자가 두 줄을 모두 보인다. 단위 시험이 단언한다.
5. 1단계 실측에서 세션이 멈춰 선 권한 확인 창의 목록이 시험 보고서에 남는다. 이 목록이 2단계 허용
   목록의 입력이다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 22개 구현·시험·문서 산출물을 다룬다(아래 Affected Files). 제안서 자체의 이번 수정은 별도다.
- 새 런타임 동작이 생긴다. 백그라운드 스크립트가 서버를 주기적으로 부르고, 이 clone의 git 디렉터리에
  잠금·정책 파일을 쓴다.
- 문구 계약(`docs/conventions/product-copy.md`)과 프로토콜 문서가 바뀐다.
- 롤백이 단순 revert로 끝나지 않는다. 플러그인은 판 상승 뒤 사용자 쪽 업데이트가 따로 필요하다.

## Current State

이 절과 Before/After 스케치는 제안 검증 당시의 코드 관측 기록이다. 실제 1단계 구현은
최신 dev `495bd22`를 기반으로 적용·검증됐으며, 완료 결과와 미실행 후속 작업은
Verification Results와 Completion or Closure Notes에 기록한다.

### 2026-10-02 기존 관측 기록 — mathgic ITEM-01

| 시각(KST) | 일 |
| --- | --- |
| 09-29 15:07 | 파이프라인 v1 자동 생성. 게이트는 before-plan, before-implement |
| 09-29 15:26 | ITEM-01 제안, v1에 고정 |
| 10-02 15:33:56 | 소유자가 게이트를 모두 지운 v2 저장 |
| 10-02 15:34:14 | 웹에서 ITEM-01 승인. v2 저장 18초 뒤라 v1의 before-plan을 연 것 |
| 그 이후 | ITEM-01의 `AgentRun`·`Command` 기록 없음 |

위 시각·운영 행 부재는 제안서 작성 당시의 기록이며 이번 대조에서 운영 DB를 다시 조회하지 않았다.
현재 코드로 확인한 구조적 원인은 다음 세 가지다.

1. **실행기가 없다.** 서비스는 Claude를 직접 실행하지 않는다(`docs/architecture/system-overview.md:5-8`).
   스펙의 실행기 계약에서 `local`의 트리거는 "사용자가 Claude Code에서 런북대로 디스패치"이고,
   `routine`은 Phase 3 예약이다(`docs/investigations/active/harness-platform.md:160-164`). 명령 원장과
   루틴 실행기는 아직 계획만 있다(`:1184-1185`).
2. **배너가 안내 줄을 가린다.** `deriveTurn`은 사용자 차례인 항목이 하나라도 있으면 그 항목들의 줄만
   낸다(`src/fsd/widgets/turn-banner/model/turn.ts`, `next: nextSteps(pending)`). 그래서
   ITEM-02의 인수 대기가 ITEM-01의 "Continue the pipeline for ITEM-01: plan …" 줄을 가렸다. 이건
   문구 계약 위반이기도 하다. 계약은 상자가 "One line per item that waits on the terminal"을 보인다고
   정한다(`docs/conventions/product-copy.md:205-206`).
3. **결재함 문구가 자동 진행처럼 읽힌다.** before-plan 힌트는 "dev writes a plan. Nothing changes in the
   code yet."이다(`src/fsd/entities/pipeline/model/gate-copy.ts:7`). 같은 표의 before-implement 힌트는
   "Then you run dev in Claude Code."로 끝나는데(`:9`), before-plan 쪽에는 그 말이 없다. 도움말
   "Request plan: dev writes a plan."(`src/fsd/features/review-gate/ui/inbox-card.tsx:98`)도 같다.
   계약의 일반 문장 "Opening a gate moves the item; it does not start an agent."
   (`docs/conventions/product-copy.md:296-297`)가 이 두 자리에는 닿지 않는다.

### 1단계가 기대는 현재 코드

- `pipeline_next` 개요의 답은 `{head, items, runbook?}`이다(`src/server/pipeline/run-rules.ts:75`).
  항목별 답은 `dispatch`·`wait`(gate·handoff·cap)·`accept`·`done`으로 갈린다(`:8-14`).
  그래서 스크립트가 서버 변경 없이 "세션이 움직일 일"을 판정할 수 있다.
- 호출 한도는 `agent_next`에만 걸린다(`src/server/agents/next.ts:16`, `:104`). `pipeline_next`를 주기적으로
  불러도 세션의 디스패치 한도를 쓰지 않는다.
- 현재 작업 트리의 MCP 인증은 유효한 미폐기 credential을 받아들이면 토큰 사용 기록 query도 기다린다
  (`src/server/mcp/auth.ts`, `deps.ts`, `src/server/token-usage-query.ts`). 60초 조건은 행 변경만 줄이며
  DB 왕복을 없애지 않는다. domain 거부도 이미 받아들인 credential의 기록을 취소하지 않는다.
  감시가 이 기록을 추가 구현하거나 우회하지 않으며, 폴링 비용 실측은 인증 query도 포함한다.
- `pipeline_next`는 읽기 도구이지만 doc-audit·scout 완료에 대해 지연 전진을 한다
  (`docs/architecture/protocol.md:137`). 감시 스크립트가 부르면 세션이 부를 때와 같은 전진이 조금
  먼저 일어날 뿐이다.
- 현재 route의 `mcp-handler`는 SDK의 `legacy: "stateless"` 경로를 사용한다
  (`src/app/api/mcp/route.ts`, `node_modules/mcp-handler/dist/index.mjs`,
  `node_modules/@modelcontextprotocol/server/dist/index.mjs:createLegacyStatelessFallback`).
  claim 없는 JSON-RPC `tools/call`을 직접 POST할 수 있고, initialize/session id가 필요 없다.
  이 호환 경로의 응답은 `Content-Type: text/event-stream`의 `event: message` / `data: {jsonrpc…}`
  프레임이다. JSON 응답도 파서가 지원한다. 도구 결과는 `result.content[0].text`의 JSON이고, 실패하면 `isError: true`와
  `{"error": …}`가 온다. 초안에는 2026-10-02 운영 서버의 `project_get` 호출 관측이 기록되어 있다.
  이번 대조에서는 운영 호출을 재실행하지 않았으며 설치 SDK/route를 확인했다. 이후 실제 호환성은
  Phase 3의 격리된 세션 시험과 Phase 5의 운영 실측으로 확인한다.
- 결과 기록의 중복은 이미 막혀 있다. 낡은 영수증으로 결과를 내면 `StaleCursor`로 거부된다
  (`src/server/agents/run-query.ts:83`). 하지만 두 세션이 같은 일을 **시작하는 것**은 막지 않는다.
  그래서 감시 세션은 저장소당 하나로 제한한다.
- 플러그인 규약:
  - 순수 모듈은 `packages/core`에 두고 `plugin/lib`로 복사한다(`scripts/plugin-lib.mjs:5-9`).
    `npm run check`가 어긋남을 막는다. `watch.mjs`는 파일·네트워크·외부 npm 의존성을 갖지 않는다.
  - 스크립트는 `plugin/bin`에 둔다.
  - 현재 init 스킬의 `$CLAUDE_PLUGIN_ROOT/bin/...` 예시는 새 watch의 경로 해석 규칙으로 복사하지
    않는다. 새 스킬은 `${CLAUDE_PLUGIN_ROOT}`의 로딩 시 본문 치환으로 실제 설치 경로를 얻는다.
    일반 Bash 도구의 환경변수로 제공된다고 가정하지 않는다([플러그인 공식 규칙](https://code.claude.com/docs/en/plugins-reference#where-each-variable-resolves)).
  - 서버 URL에 기본값을 두지 않는다(`plugin/bin/harness-init.mjs:86-95`).
  - `harness.json`의 `project.slug`가 사용자 토큰의 프로젝트다(`packages/core/config.mjs:21`).
- 런북의 실행 전 외부 검증 스킬 preflight와 프로젝트 범위/실행 receipt 규칙도 유지한다.
  `plugin/skills/init/references/reconciliation-contract.md`를 watch 세션에서도 읽어 실제 해결된
  `reconciling-proposals-with-codebase` 패키지와 supporting files를 확인한다.
- 런북은 커밋 권한을 브리핑에 담고 push는 소유자에게 남긴다
  (`plugin/templates/en/CLAUDE.runbook.md:73-80`, `:101-102`). 감시 세션은 이 규칙을 그대로 쓴다.

## Scope

포함 범위:

- 순수 판정 모듈 `packages/core/watch.mjs`와 그 복사본 `plugin/lib/watch.mjs`
- 감시 스크립트 `plugin/bin/harness-watch.mjs`
- 스킬 `plugin/skills/watch/SKILL.md`
- 플러그인 판 상승
- 배너 판정 수정과 감시 안내 한 줄, before-plan 힌트, 결재함 도움말 한 줄
- 문구·프로토콜·스펙 문서 갱신
- 2단계 상주형의 설계(구현 없음)

제외 범위: Goal의 비목표 전부.

## Alternatives

### Option A: 클라우드 루틴(`routine`)
- 장점: PC가 꺼져 있어도 돈다. 샌드박스라 실제 PC를 건드리지 않는다.
- 단점:
  - 불변식 1~3(명령 원장, 멱등 소비, 서버 화이트리스트, `docs/architecture/invariants.md:13-15`)을
    `Command` 테이블로 구현해야 한다.
  - 즉시 발화하려면 사용자 저장소에 쓸 권한이 필요하다. 지금은 쓰기 권한이 없고, GitHub App은
    Phase 4로 미뤄져 있다(`src/server/github.ts:6-8`).
  - cron이면 최대 1시간 늦게 시작한다.
  - 매번 새로 clone하므로 시험 환경을 클라우드에 다시 꾸려야 한다.

### Option B1: 상주형부터(창 없이 `claude -p`)
- 장점: Claude Code 창을 켜 두지 않아도 된다.
- 단점: 무인 권한 정책, 작업 트리 분리, 대화형 세션과의 중복 시작 방지, 로그인 시 자동 시작을
  실측 데이터 없이 정해야 한다.

### Option B2: 세션 감시형 `/harness:watch`
- 장점:
  - 서버 변경이 없다.
  - 평소의 대화형 세션이라 권한 확인 창이 그대로 작동한다. 아무도 답하지 않는 확인 창은 안전한 정지다.
  - 감시하는 세션이 곧 사용자의 세션이라 "러너와 사용자 세션의 충돌"이 생기지 않는다.
  - 실행기 계약의 `local`(사용자 세션이 런북대로 디스패치)을 그대로 두고 시작 시점만 자동이 된다.
- 단점: Claude Code 창을 켜 둬야 한다. 한 세션이 오래 돌아 컨텍스트가 쌓인다.

### Option B3: 스크립트 없이 `/loop`로 세션이 직접 폴링
- 장점: 플러그인 코드가 거의 없다.
- 단점: 할 일이 없어도 매 틱이 모델 호출이다. B2는 기다리는 동안 모델을 부르지 않는다.

### 선택: Option B2를 1단계로 구현하고, B1을 2단계로 설계한다
- 근거:
  - B2는 기대 동작("웹에서 승인하면 바로 시작")을 서버 변경 없이 충족한다.
  - B1의 가장 어려운 결정인 무인 허용 목록을 B2 운용 데이터로 정할 수 있다(성공 기준 5).
  - 감시 코어·이벤트·정책·잠금을 처음부터 두 단계가 같이 쓰게 나눠 두면, 2단계는 "이벤트를 받는
    쪽"만 하나 더하는 일이 된다.
  - Option A는 PC가 꺼진 동안의 실행이 반복해서 필요해질 때 다시 검토한다.

## Proposal

### 동작 — 1단계

1. **시작 전 확인.** 현재 checkout의 harness.json·CLAUDE.md·생성 에이전트와 외부 검증 스킬을
   확인한다. 설치된 Claude Code의 Bash 또는 PowerShell 도구가 백그라운드 실행·완료 통지를
   지원해야 한다. bare 모드나 CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1에서는 시작하지 않는다.
2. **정책 묻기.** 커밋 허용 여부와 새 일(head의 pm·feature-scout) 허용 여부를 한 번 받는다.
   새 일 기본값은 no이며 push 권한은 부여하지 않는다. propose:no여도 기존 항목 그래프의
   feature-scout 슬롯은 계속 처리한다. 정책은 새 감시 session에만 유효하며 재시작/인수 때 다시 받는다.
3. **연결 확인과 잠금 획득.** --start는 로컬 입력을 먼저 검증하고 project_get으로 설정의
   owner/repo 및 있으면 slug와 서버 정체·available:true를 확인한다. 실패하면 잠금/정책을 쓰지 않는다.
   성공 후 원자적 직렬화 경계에서 session id·정책·checkout/서버/프로젝트 바인딩을 저장한다.
4. **대기.** --session <id>를 메인 대화가 백그라운드로 실행한다. 도구 입력은
   run_in_background:true, timeout:7200000이며, CLI 내부 시한은 기본 110분이다.
   태스크 id·출력 파일·session·정책을 보관하고 턴을 끝낸다. 서브에이전트에게 감시를 맡기지 않는다.
5. **판정.** 시작 즉시, 이후 기본 60초 간격으로 key 없는 pipeline_next를 읽는다.
   dispatch·accept 또는 허용된 head가 있으면 work 한 줄을 출력하고 끝낸다.
6. **처리.** 완료 태스크가 현재 태스크와 일치하고 --check --session <id>가 owned일 때만 처리한다.
   fresh pipeline_next를 다시 읽고 런북의 hint·format·entry·receipt 계약으로 행동한다.
   이벤트의 스냅샷으로 직접 실행하지 않는다. 한 항목의 wait는 그 항목만 멈춘다. 다른 ready 항목과
   허용된 head를 모두 검토한 후 더 할 일이 없을 때 재무장한다. propose:no는 이 fresh cycle에도 적용한다.
7. **중단.** idle만 조용히 재무장한다. stuck·replaced·stopped·error, 사용자의 중단 요청,
   원인 불명 태스크 종료/잘못된 출력은 재무장하지 않는다. 도구가 명시한 background time limit만
   현재 소유권·정책·중단 의도 확인 후 재무장할 수 있다. 작업 중 확인 창이나 메인 루프의 커밋
   핸드오프는 자동 처리를 멈추고 소유자의 입력을 기다린다. 권한을 넓히거나 우회하지 않는다.

백그라운드 한도·도구 종료 동작은 [Claude Code 도구 문서](https://code.claude.com/docs/en/tools-reference#time-limit-for-background-commands),
완료/출력 파일·세션 종료 시 정리는 [interactive mode](https://code.claude.com/docs/en/interactive-mode#background-bash-commands)를 기준으로 한다.
최초 지원 대상은 기존 관측 환경인 2.1.287이며, 더 낮은 최소 지원 판을 추측하지 않는다.
Phase 3의 가짜 서버·실제 대화형 세션 스모크가 완료 통지와 재무장을 확인하고, Phase 5가
110분 시한을 실측한다. 모델이 스킬을 지키는지까지 CLI 시험 통과로 주장하지 않는다.

### 이벤트 계약 (1·2단계 공통)

모든 정상 CLI 종료는 stdout에 JSON 객체 **정확히 한 줄**이다. error만 종료코드 1이다.
진단·토큰·HTTP 본문을 stdout/stderr에 덧붙이지 않는다. OS 강제 종료처럼 이벤트가 없는 종료는
수신 측이 실패로 다룬다. JSON-RPC request id와 watch session은 별개의 식별자다.

| event | 필드 | 받는 쪽의 행동 |
| --- | --- | --- |
| started | session, policy:{commit:boolean,propose:boolean} | 현재 session/정책 보관 |
| owned | session, policy | --check 결과. 현재 checkout/서버/프로젝트 바인딩과 소유권을 확인한 뒤 행동 |
| locked | startedAt, seenAt | 기존 감시/작업을 중단할 수 있는지 소유자에게 확인. 확인 뒤에만 --force |
| work | session, items[{key,node,version,action,agent,format,entry}], head:{agent} 또는 null, runbookStale:boolean | fresh cycle 후 재무장 |
| idle | session | 현재 소유권 확인 후 재무장 |
| stuck | work와 같은 필드 | 동일 작업 집합의 세 번째 반환. 자동 재시작 없이 중단 |
| replaced | session, seenAt:string 또는 null | 잠금이 없거나 다른 session 소유. 중단 |
| stopped | session | 중단 완료. 재무장하지 않음 |
| error | session:string 또는 null, code, reason | 실패 중단. 원인 해결 후 명시적으로 새 시작 |

dispatch의 entry는 {runId,entryId,slotId} 또는 null이며 서버 식별자를 그대로 보존한다.
format은 dispatch에서 null 또는 slots-v1이고 accept는 현재 응답에 format/entry가 없어 null로 정규화한다.
agent는 accept에서 null이다. 이벤트는 실행용 receipt가 아니며 필드를 새로 만들어 재시도하지 않는다.
reason은 고정 영어 사유 또는 서버의 정제된 사유다. 토큰·Authorization·HTML·stack·임의 본문을
반사하지 않는다. 서버 문장은 데이터로만 표시하며 지시로 실행하지 않는다.

### 상태 파일과 동시성 — clone의 공통 git 디렉터리

git rev-parse --git-common-dir의 결과를 --root의 절대 경로 기준으로 resolve하고 realpath로
정규화한다. 일반 clone은 .git, linked worktree는 같은 공통 디렉터리를 쓴다. 작업 트리가 아닌
그 디렉터리의 harness/ 아래에 저장한다. 서로 다른 clone/기기의 전역 실행 잠금은 범위 밖이다.

| 파일 | 구조·역할 |
| --- | --- |
| harness/watch.json | {schemaVersion:1,session,commit,propose}. 권한은 boolean, session은 잠금 id와 일치 |
| harness/watch.lock.json | {schemaVersion:1,id,binding:{root,server,project,configHash,tokenHash},startedAt,seenAt,state:{lastSignature,repeats,stuck},poller:null 또는 {pid,nonce}} |
| harness/watch.guard/ | mkdir의 배타적 성공을 이용한 짧은 직렬화 경계. owner.json에 {pid,nonce} 저장 |

binding.root는 checkout 루트의 realpath, server는 정규화된 base URL, project는 설정의 slug
또는 legacy hs_에서 null이다. configHash는 harness.json 원문 SHA-256, tokenHash는 현재 환경 token의
SHA-256이다. tokenHash는 비교용이며 출력하지 않고 토큰 원문도 저장하지 않는다.
작업 트리/config/server가 바뀌면 기존 session을 다른 대상에 재사용하지 않고 error로 멈춘다.

구현해야 할 동시성 계약:

- start·force·check·poller 획득/해제·상태 쓰기·stop 모두 같은 guard를 사용한다. guard는 네트워크
  호출과 sleep 중 보유하지 않는다. 대기 한도는 5초이며 소유를 증명하지 못하면 error다.
  guard를 얻은 뒤에는 await 없이 검증/동기 파일 작업을 마치고 finally에서 자기 nonce의 guard만 정리한다.
- guard 안에서 잠금 id를 다시 확인한다. 정책·잠금은 같은 디렉터리의 고유 임시 파일을 완전히 쓴 뒤
  rename으로 교체한다. 정책을 먼저, 잠금을 commit 지점으로 기록한다. 중간 실패/강제 종료로
  session이 불일치하면 error이며 기본 false 정책으로 조용히 복구하지 않는다. 임시 파일은 자기 것만 정리한다.
- session당 poller 하나를 등록한다. 같은 session의 두 번째 --session은 살아 있는 pid/nonce를
  확인하면 network 호출 없이 error로 끝낸다. process.kill(pid,0)의 ESRCH만 죽음 증거로 쓴다.
  EPERM·PID 재사용·판정 불가는 살아 있음으로 취급한다. poller는 정상 종료/SIGINT/SIGTERM에서
  자기 id와 nonce가 여전히 일치할 때만 해제한다. OS 강제 종료 뒤에는 죽은 pid임이 확인된 경우만 재등록한다.
- HTTP 응답을 받는 동안 force/stop이 실행될 수 있다. 응답 뒤 guard를 재획득하여 session id·poller
  nonce·binding을 재확인한 다음에만 상태를 쓰거나 work/stuck을 출력한다. 이전 프로세스는 새
  session의 상태를 덮어쓰거나 지우지 못하고 replaced를 출력한다. 정리 단계에도 같은 검사를 한다.
- fetch/body/sleep 중에도 최대 1초마다 로컬 소유권을 확인한다. 소유권 상실은 요청을 abort하고
  replaced로 끝낸다. 이 로컬 확인은 서버/모델 호출이나 반복수 증가가 아니며 timer는 finally에서
  정리한다. guard 대기는 감시의 남은 deadline과 5초 중 작은 값으로 제한한다.
- work/idle은 session 잠금을 보존하고 poller만 해제한다. stuck 및 자기 session의 치명적 error는
  **등록한 poller nonce를 여전히 소유한 경우에만** 잠금·정책을 해제한다. preflight/check/중복 poller의
  error는 기존 session을 해제하지 않는다. guard를 얻지 못하거나 상태가 손상되어 소유권을 증명할
  수 없으면 파일을 남기고 수동 복구를 안내한다. replaced는 새 소유자의 파일을 건드리지 않는다.
  --stop은 자기 session만 삭제하며 파일이 이미 없으면 stopped, 다른 id면 replaced다.
- 12시간은 session의 seenAt 기준이다. 만료도 locked로 알리고 확인된 --force로 인수한다.
  live poller가 있으면 시간만으로 인수하지 않는다.
  정책/잠금 손상, guard의 owner 누락, 죽은 guard도 자동으로 훔치지 않는다. 모든 관련 태스크·기존
  세션의 작업을 종료한 뒤 아래 롤백/복구 절차로 owner가 정리한다. --force도 guard를 우회하지 않는다.
- --force 인수 전 소유자는 이전 세션의 감시와 진행 중 에이전트가 멈췄음을 확인한다.
  로컬 파일 잠금이 이미 디스패치된 에이전트를 취소하지는 않는다. watch 스킬은 모든 새 행동과
  재무장 전에 --check를 호출하며 소유권을 잃은 완료 통지를 버린다.

### CLI·전송·판정 계약

전체 감시 구현을 복사할 수 있는 미검증 코드 대신 아래 계약과 Verification Plan을 구현 기준으로 삼는다.
외부 npm 의존성·새 서버 도구는 추가하지 않으며 fs/network/process 작업은 plugin/bin에만 둔다.

| 모드 | 입력 | 효과 |
| --- | --- | --- |
| --start | --root(기본 .), --server 또는 HARNESS_SERVER, HARNESS_TOKEN, --commit yes/no, --propose yes/no, 선택 --force | 입력·project_get 정체 확인 후 session 생성. 두 정책값은 필수 |
| --session <id> | 같은 root/server/config와 token, 선택 --interval <초>, --deadline <분>, --request-timeout <초> | 단독 poller 획득, key 없는 pipeline_next 폴링 |
| --check --session <id> | 같은 root/server/config와 token | 네트워크·반복수 갱신 없이 owned 또는 replaced/error |
| --stop --session <id> | root와 session. token/server가 없어도 실행 가능 | 자기 잠금·정책만 해제 |

중복/알 수 없는 옵션, 값 누락, 모드 충돌, force의 start 외 사용, 빈 session은 error다.
시간값은 finite 양수이며 Number의 NaN/Infinity/0/음수를 허용하지 않는다. 기본 interval=60초,
deadline=110분(최대 110분), request-timeout=20초(최대 20초). 작은 소수는 가짜 서버 시험에 허용한다.
입력 오류는 네트워크·상태 파일 쓰기 전에 검출한다. 모든 모드는 root를 실제 Git 작업 트리
루트로 정규화하고 bare repo를 거부한다. start/session/check는 harness.json 부재·설정 파싱
실패를 거부한다. stop은 root와 session으로 공통 git dir의 상태만 확인하므로 harness.json·
CLAUDE.md·token·server가 없거나 바뀌어도 실행 가능하다. 정책/잠금 자체가 손상되어 자기
session을 증명할 수 없는 경우는 corrupt-state로 파일을 보존하고 수동 복구를 안내한다.

전송:

- URL 출처는 --server → HARNESS_SERVER이며 서비스 기본값/.env/.mcp.json fallback은 없다.
  생성기와 같이 끝의 /api/mcp/owner, /api/mcp, slash를 제거하고 http(s) URL을 파싱한다.
  URL의 userinfo·query·fragment는 거부한다. --server로 시작한 스킬은 check/재무장에도 그 값을 전달한다.
- HARNESS_TOKEN은 프로세스 환경의 hs_/hu_ 형태만 허용한다. packages/core/token.mjs의 규칙대로
  3자 접두 + 43자 base64url 본문(`[A-Za-z0-9_-]`), 총 46자다. 43자는 전체 토큰 길이가 아니다.
  ho_·기타 접두·길이/문자 위반은 네트워크 전에 거부한다. hu_에는 project.slug가 필수이며 모든 request에
  arguments.project로 보낸다. hs_는 slug가 있으면 보내고 확인된 legacy 설정에서만 생략한다.
- --start의 project_get은 owner/repo를 대소문자 정규화해 설정과 대조하고, slug가 있으면 정확히
  대조한다. available:false/정체 불일치/불완전 body는 잠금 쓰기 없이 중단한다. 감시 중 token이나
  config를 바꿀 때는 stop 후 새 start로 연결을 다시 확인한다.
- /api/mcp에 POST하며 Content-Type:application/json, Accept:application/json, text/event-stream,
  Authorization:Bearer <token>을 설정한다. redirect:manual로 보내며 모든 3xx를 치명적 거부로 처리해
  다른 URL로 토큰을 전송하지 않는다. JSON-RPC 2.0, 고유 request id,
  method:tools/call, name:project_get 또는 pipeline_next, arguments:{project?,runbook?}를 사용한다.
  key는 보내지 않는다. runbook은 pipeline_next에만 아래 규칙으로 읽은 checkout 판을 보낸다.
- 판 추출은 CLI에서 해당 root의 CLAUDE.md를 읽어 수행한다. harness-init이 쓰는
  `<!-- harness:runbook:start -->`와 `<!-- harness:runbook:end -->` 사이만 판의 출처다.
  관리 블록 밖의 소유자 문장·commit hash는 무시하며 렌더된 CLAUDE.md를 해시하지 않는다.
  두 marker가 있으면 각각 정확히 하나이며 start가 end보다 앞서야 한다. 한쪽 누락·역순·중복
  블록은 invalid-config로 네트워크·상태 쓰기 전에 거부한다.
  블록 안의 ``This document is runbook version `<value>` `` 선언과 `runbook: "<value>"` 인자 값은
  기존 isRunbookVersion으로 검증한다(12자리 소문자 hex). 현재 런북처럼 같은 값이 여러 번
  나와도 하나의 판이다. 서로 다른 값·잘못된 값·손상된 판 선언은 invalid-config다.
  판 선언이 없는 legacy 관리 블록 또는 두 marker가 모두 없는 legacy 런북은 runbook을 생략한다.
  이때 서버의 마지막 init 판에 대한 경고를 보존하고 fresh cycle에서 확인한다. CLAUDE.md와
  private 원본/생성기를 수정하거나 임의의 12자리 hex를 checkout 판으로 추정하지 않는다.
- AbortController의 request timeout과 남은 deadline 중 작은 값으로 fetch와 body 읽기 모두를 제한한다.
  최대 body는 UTF-8 1MiB다. 한도를 넘으면 protocol error로 중단한다. 응답 도중 timeout/stop은
  reader.cancel/abort와 timer 정리를 수행한다. deadline은 단조 시계(performance.now)로 계산하고
  sleep도 남은 시한까지만 한다. deadline으로 취소한 요청은 실패 횟수 대신 idle이다.
- 401/403 및 408/429를 제외한 4xx, redirect, JSON-RPC error, isError:true, 손상/미지원 body는 치명적이다.
  timeout/연결 실패/408/429/5xx는 전송 실패다. 5번째 연속 전송 실패에서 error로 끝낸다.
  정상 overview 하나를 읽으면 실패 수를 초기화한다. 재시도는 interval 이상 기다리고, 429의 유효한
  Retry-After가 더 길면 그 시간까지 기다린다(남은 deadline 한도). 실패 요청도 지연 전진을 완료했을
  수 있으므로 rollback/zero-write를 주장하지 않는다. 재호출은 fresh overview를 다시 얻는 것이다.
- 정상 요청은 단조 시계의 요청 시작 시각을 기준으로 interval 간격을 잡고 중첩 요청은 하지 않는다.
  느린 요청으로 다음 시작 시각을 지났으면 응답 정리 후 바로 다음 한 건을 읽는다. 전송 실패 재시도는
  위의 응답 후 대기 규칙을 따른다. 따라서 성공 기준 1의 감지 지연은 모델 기상/권한 대기와 분리된다.

순수 모듈의 exports와 판정:

| symbol | 계약 | 소비자 |
| --- | --- | --- |
| STUCK_AFTER | 3 | 단위 시험·CLI 상태 갱신 |
| parseToolResponse(contentType,body,requestId) | {ok:true,value} 또는 {ok:false,error}. JSON 또는 SSE의 일치 id 응답 하나를 판별 | CLI의 공통 tools/call |
| actionableWork(overview,policy) | 유효한 PipelineOverview에서 이벤트 items/head/runbookStale를 정규화. 잘못된 overview는 throw | CLI |
| hasWork(work) | dispatch/accept items 또는 허용 head가 존재 | CLI |
| workSignature(work) | 정렬된 JSON tuple 배열의 JSON.stringify. 구분자 결합 충돌 금지 | CLI |
| nextWatchState(state,signature) | 동일 비어 있지 않은 서명 3번째부터 stuck. 빈 서명은 {lastSignature:null,repeats:0,stuck:false} | CLI |

SSE는 LF/CRLF, blank-line 이벤트 경계, comment/keepalive, 여러 data: 줄의 newline 결합을 처리한다.
requestId와 일치하는 result/error를 찾으며 notification과 다른 id 응답을 무시한다. text content의
유일한 JSON tool body를 읽고, 해당 id의 중복 응답·누락·잘못된 JSON-RPC 모양·손상 JSON은 거부한다.
끝의 data: 줄 하나를 선택하는 파서를 사용하지 않는다.

overview는 head와 items 배열이 필수다. 각 item의 key(중복 없음), node, 양의 정수 version,
action union과 해당 분기의 필수 필드를 run-rules.ts에 맞춰 검증한다. dispatch는 agent/hint/format이
필수이고 slots-v1은 세 필드가 비어 있지 않은 entry와 entry.slotId===node가 필요하다.
null format의 optional entry가 있으면 구조도 검증한다. accept는 hint, wait는 on(gate/handoff/cap)과
그 분기의 gate/boundary/planCommit/format/gateEntry 또는 note 또는 reason, done은 string/null node를
검증한다. runbook이 있으면 {stale:true,note:string}이다. head는 dispatch(pm/feature-scout,hint) 또는
none(reason)이다. 알려지지 않은 추가 필드는 허용하되 알 수 없는 action/format은 빈 일로 처리하지 않는다.

서명 tuple에는 key,node,version,action,agent,format,entry의 runId/entryId/slotId를 포함하고 head agent도
포함한다. 표시용 hint/runbookStale는 진전으로 세지 않는다. 반복 상태는 성공한 폴링의 빈 작업 관측
또는 work/stuck 반환 때에만 갱신하며 check·재시도는 갱신하지 않는다. idle 사이에도 상태를 보존한다.
seenAt은 정상 폴링/전송 재시도/소유권 check 때 갱신해 살아 있는 세션의 잠금이 만료되지 않게 한다.

로컬 code→reason 문장은 product-copy §15에 함께 적고 CLI 시험으로 글자 일치를 확인한다:

| code | reason |
| --- | --- |
| invalid-arguments | Invalid watch arguments. Check the mode, required values, and positive timing limits. |
| invalid-config | Watch configuration is invalid. Run /harness:init and start again. |
| missing-server | Server URL required: pass --server <url> or set HARNESS_SERVER. |
| invalid-token | HARNESS_TOKEN must be a project or user token. |
| missing-project | A user token requires harness.json project.slug. Run /harness:init. |
| identity-mismatch | This token does not match the configured repository. Stop and reconnect with /harness:init. |
| binding-changed | The checkout, server, or configuration changed. Stop and start a new watch. |
| corrupt-state | Watch state is unreadable or inconsistent. Stop all related tasks before removing it. |
| guard-busy | Watch state is busy. Stop related tasks before recovering an abandoned guard. |
| poller-active | A watcher is already running for this session. |
| protocol-error | Unexpected MCP response. Update the compatible plugin and server before restarting. |
| request-failed | Five consecutive watch requests failed. Resolve the server or connection error before restarting. |
| access-refused | 서버 error string을 정제 후 보존(고정 표시 문장이 아님) |

access-refused는 분류이며 고정 표시 문장이 아니다. 본문/구조가 잘못되면 protocol-error다.
알려진 token값의 제거와 Bearer 등 비밀값을 포함한 문장의 비표시를 CLI 시험으로 확인한다.
HTTP 인증 실패의 JSON error가 없으면 "The server refused HARNESS_TOKEN (401)." 를 쓰고,
다른 4xx에는 "The server refused the watch request (HTTP <status>)." 를 쓴다. 이 두 문장도 §15에 적는다.

### 2단계 설계 — 상주형 (이번에 구현하지 않음)

- **실행 방식.** `harness-watch.mjs`에 `--spawn` 모드를 더한다. `work`를 받으면 그 저장소에서 아래를
  실행하고, 끝날 때까지 기다린 뒤 다시 감시한다. 지금 설치된 CLI(2.1.287)에 두 플래그가 있는 것을
  `claude --help`로 확인했다.

  ```
  claude -p "<런북대로 이 항목들을 이어 가라 + 커밋 권한>" --permission-mode <mode> --allowedTools <목록>
  ```

- **1단계와 공유하는 것.** 잠금(두 단계가 같은 저장소에서 동시에 돌지 않음), 정책 파일, `stuck` 규칙,
  이벤트 판정(`packages/core/watch.mjs`).
- **허용 목록.** 1단계 실측의 권한 확인 창 목록(성공 기준 5)으로 정한다.
- **설계에서 열어 둘 것.**
  - 작업 트리: 그대로 쓸지, `git worktree`로 분리할지
  - 실행 로그 위치(`harness/runs/`)
  - 연속 실패 상한
  - Windows 로그인 시 자동 시작(작업 스케줄러)
- **제품 경계.** 서비스가 Claude를 실행하지 않는다는 경계(`system-overview.md:5-8`)는 2단계에서도
  유지된다. 실행은 사용자 기계에서, 사용자 계정으로 한다.
- **착수 조건.** Claude Code 창 없이 PC만 켜 둔 상태에서의 실행이 반복해서 필요해질 때.

### 신규 코드

| 파일 | 역할 |
| --- | --- |
| packages/core/watch.mjs | 위 exports의 순수 파싱·overview 검증·작업 판정·반복 상태 |
| packages/core/watch.test.mjs | 계약 표와 상태 경계의 node:test + assert/strict 시험 |
| plugin/lib/watch.mjs | sync:plugin-lib 생성 복사본. 직접 수정하지 않음 |
| plugin/bin/harness-watch.mjs | CLI·프로세스/파일 직렬화·HTTP timeout/재시도·종료 |
| plugin/bin/harness-watch.test.mjs | 가짜 서버와 실제 child process/linked worktree를 사용하는 CLI 시험 |
| plugin/skills/watch/SKILL.md | 사용자 진입점. 아래 동작 계약을 영어로 작성 |

watch SKILL.md의 front matter는 name:watch이며 description은 아래 문장을 사용한다.
product-copy §15에도 같은 문장을 기록한다.

> Keep this Claude Code session running the Stagekeeper pipeline — a background watcher waits for ready steps and wakes the session. Use when the user says "/harness:watch" or wants web approvals to continue work in this session.

SKILL.md에 반드시 담을 절과 순서:

1. **Preflight.** 현재 root/harness.json/CLAUDE.md, token/server 존재(값 출력 금지), 지원 도구·판,
   실제 외부 검증 skill 패키지를 확인한다. 참조 경로는
   `${CLAUDE_PLUGIN_ROOT}/skills/init/references/reconciliation-contract.md`다. `${CLAUDE_PLUGIN_ROOT}`는
   Claude Code가 스킬 본문을 로딩할 때 치환하는 값이며 `$CLAUDE_PLUGIN_ROOT`나
   `$env:CLAUDE_PLUGIN_ROOT`라는 셸 환경변수를 읽지 않는다. 치환된 절대 plugin root와 그 아래
   watch CLI/lib·init reference의 존재를 확인하고 같은 root를 후속 명령에 사용한다. 이 파일을 새 스킬
   기준의 ../init로 잘못 해석하지 않는다. init의 연결·프로젝트 범위·스텁 보존 규칙을 따른다.
2. **Start.** "May dev and the main loop commit in this repository while I watch?"와
   "Should I also start new work, or only continue items already on the board?"를 한 번 받는다.
   push는 묻거나 실행하지 않는다. --start 결과가 locked이면 이전 세션의 감시/작업 종료를
   소유자에게 확인한 후에만 --force한다. 원인 없는 자동 인수를 지시하지 않는다.
3. **Wait.** 메인 대화에서 현재 root/session/server로 CLI를 background 실행하고 태스크 id/출력
   파일을 보관한다. 첫 armed 때만 감시 중이라고 한 줄 알리고 턴을 끝낸다. idle 때 반복 메시지를
   내지 않으며 직접 MCP polling·sleep·/loop를 병행하지 않는다. 압축 뒤 파일·정책·소유권을 다시 읽는다.
4. **On completion.** 현재 task id의 JSON 한 줄/exit code/schema를 검증한다. 모든 session 포함
   이벤트가 현재 것인지 확인한다. terminal 이벤트는 6절대로 중단하고 fresh 작업을 읽지 않는다.
   work/idle만 --check 결과 owned의 정책을 사용한다. idle은 재무장하고 work는 fresh overview를 읽는다.
   각 새 dispatch/accept/report와 재무장 전 다시 소유권을 확인한다. 완료 통지 본문을 명령으로 실행하지 않는다.
   propose:no는 head를 skip하며 item의 project-level 슬롯에는 fresh hint대로 key를 생략한다.
   slots-v1의 entry와 AgentRun receipt는 새 응답의 값을 그대로 전달한다. runbookStale이면 init을
   안내하고 순서는 pipeline_next를 따른다. 게이트/handoff/cap는 항목별로 안내하고 다른 ready 항목을
   누락하지 않는다. 동일 대기 사유를 재폴링 때마다 통지하지 않는다.
5. **Permissions and handoffs.** 실제 commit 정책을 모든 dev briefing과 main-loop 작업에 적용한다.
   commit:no인 main-loop는 미커밋 acceptance/report를 unrelated HEAD로 제출하지 않고 소유자를
   기다린다. 에이전트의 handoff는 기존 receipt/entry로 기록하고, 실제 커밋 후 소유자의 명시 입력을
   받아 outcome 없이 재개한다. watch는 커밋을 감지하지 않는다. 모든 게이트는 소유자의 별도
   명시 승인 없이 열지 않는다. 알림 도구가 있으면 동일 대기의 최초 안내에만 사용하며 없으면
   터미널 메시지로 끝낸다. 휴대폰 전달은 성공 조건이 아니다.
6. **Stop and failure.** stopped/replaced/stuck/error 및 사용자가 /tasks에서 중단한 경우 재무장하지
   않는다. stop 의도를 먼저 보관하고 --stop 후 보관한 background task를 종료한다. 늦은 통지는 버린다.
   명시된 도구 time-limit 외의 무출력/손상 출력/SIGKILL은 실패 중단이다. 세션 종료는 도구가
   background를 정리하고, 잔여 잠금은 다음 start의 locked/복구 절차로 다룬다. 하루 단위로 새
   세션을 열 때 기존 감시를 stop하고 정책을 다시 받도록 권한다.

명령의 <...>는 아래 안전한 실제 인자 치환 대상으로만 쓴다. 토큰을 command argument로 넣지 않는다.

PowerShell 도구:

```powershell
node '<absolute-plugin-root>/bin/harness-watch.mjs' --root '<absolute-checkout>' --start --commit <yes|no> --propose <yes|no>
node '<absolute-plugin-root>/bin/harness-watch.mjs' --root '<absolute-checkout>' --session '<session>'
node '<absolute-plugin-root>/bin/harness-watch.mjs' --root '<absolute-checkout>' --check --session '<session>'
node '<absolute-plugin-root>/bin/harness-watch.mjs' --root '<absolute-checkout>' --stop --session '<session>'
```

Bash 도구(Windows Git Bash 포함):

```bash
node '<absolute-plugin-root>/bin/harness-watch.mjs' --root '<absolute-checkout>' --start --commit <yes|no> --propose <yes|no>
node '<absolute-plugin-root>/bin/harness-watch.mjs' --root '<absolute-checkout>' --session '<session>'
node '<absolute-plugin-root>/bin/harness-watch.mjs' --root '<absolute-checkout>' --check --session '<session>'
node '<absolute-plugin-root>/bin/harness-watch.mjs' --root '<absolute-checkout>' --stop --session '<session>'
```

plugin root는 위 본문 치환으로 얻은 실제 설치 경로, root/session은 확인한 실제 값으로 치환한다.
예시의 <...>를 그대로 실행하지 않는다. 스킬을 쓸 때는 치환된 CLI 절대 경로 전체를 하나의
인자로 만들어 PowerShell은 단일 따옴표를 두 번 쓰는 방식, Bash는 각 인자를 shell-safe quote하는
방식으로 이스케이프한다. 셸 변수 재확장에 의존하지 않는다. yes/no는 허용된 literal 하나이며
<yes|no>를 그대로 셸에 보내지 않는다. --server를 사용했으면 start/session/check에 같은 URL을
하나의 안전하게 quote된 인자로 전달한다. stop에는 필요 없다. timeout/run_in_background는
node CLI 플래그가 아니라 Bash/PowerShell 도구 입력에 설정한다.

### 기존 코드 수정

**`src/fsd/widgets/turn-banner/model/turn.ts`** — 사용자 차례에도 세션이 이어 갈 항목의 줄을 낸다.
감시 안내 문장도 여기 둔다.

불변식: `pending`이 빈 입력(`theirs`·`none`·`setup`)의 결과는 Before와 같다. `working`에 더한
`!pending.includes(i)`는 `pending`이 비면 아무것도 거르지 않는다. `mine`의 `count`·`detail`·`why`·`open`도
같다. `next`에만 working 항목의 줄이 붙는다.

Before (`:162-206`):

```ts
export function deriveTurn(items: readonly TurnItem[], setup: SetupState): Turn {
  if (items.length === 0) {
    const steps = setupSteps(setup);
    const firstOpen = steps.findIndex((s) => !s.done);
    return { kind: "setup", steps, current: (firstOpen === -1 ? steps.length - 1 : firstOpen) + 1 };
  }

  // 당신 차례 = 게이트가 열린 것 + 인수를 기다리는 것 + 커밋을 기다리는 것. on_hold는 여전히 배너를 소유하지 않는다.
  const pending = items.filter((i) => i.gate !== null || isAwaitingAcceptance(i.status, i.accepted) || i.handoff !== null);
  const first = pending[0];
  if (first !== undefined) {
    const openCount = items.filter((i) => isOpen(i.status)).length;
    // 결재함 자격은 review-gate가 센다(gate·resume) — 카드가 하나라도 있으면 Inbox, 없으면 첫 항목의 페이지.
    const open: TurnTarget = pendingInboxCount(items.map((i) => ({ status: i.status, gate: i.gate }))) > 0 ? { kind: "inbox" } : { kind: "item", key: first.key };
    return {
      kind: "mine",
      count: pending.length,
      detail: mineDetail(pending),
      why: canPropose(openCount) ? null : BLOCKED_WHY,
      next: nextSteps(pending),
      open,
    };
  }

  // 보류한 항목은 커서를 멈춘 자리에 둔 채 런이 열려 있다(board.ts resetRun) — 재개가 그 자리를 이어받기
  // 위해서다. 그래서 노드만 보면 "작업 중"이 된다(실측: on_hold인 FEAT-07에 "waiting for dev"가 떴다).
  // pipeline_next는 walkingKeys에서 같은 규칙으로 거른다(board.ts:52) — 그 주석이 말하는 "배너와 같은 규칙"이 여기다.
  const isProjectSlot = (node: string | null) => {
    const agent = slotAgent(node);
    return agent !== null && PROJECT_AGENTS.includes(agent);
  };
  const working = items.filter((i) => i.status !== "on_hold" && i.gate === null
    && (i.node === "plan" || i.node === "verify" || i.node === "implement" || isProjectSlot(i.node)));
  if (working.length > 0) {
    return {
      kind: "theirs",
      // 디스패치되지 않은 항목을 "하고 있다"고 말하면 사실이 아니다. 게이트를 열자마자 그 상태가 된다(실측) —
      // 사람이 세션을 돌리기 전까지는 아무도 그 일을 하고 있지 않다. 아래 "Next, in Claude Code" 줄이 할 일을 준다.
      detail: working.map(workingLine).join(" · "),
      next: nextSteps(working),
    };
  }

  return { kind: "none", detail: setup.autoScoutEnabled === false ? SCOUT_OFF_DETAIL : NONE_DETAIL };
}
```

After:

```ts
// 터미널 상자 밑의 한 줄(§5 잠금 블록 turn-banner-watch). 감시 세션은 ready 노드를 이어 가며 게이트·커밋 대기는 소유자에게 남긴다.
export const WATCH_LINE = "Or leave /harness:watch running in that session — it continues ready steps and waits for your gates and commits.";

export function deriveTurn(items: readonly TurnItem[], setup: SetupState): Turn {
  if (items.length === 0) {
    const steps = setupSteps(setup);
    const firstOpen = steps.findIndex((s) => !s.done);
    return { kind: "setup", steps, current: (firstOpen === -1 ? steps.length - 1 : firstOpen) + 1 };
  }

  // 당신 차례 = 게이트가 열린 것 + 인수를 기다리는 것 + 커밋을 기다리는 것. on_hold는 여전히 배너를 소유하지 않는다.
  const pending = items.filter((i) => i.gate !== null || isAwaitingAcceptance(i.status, i.accepted) || i.handoff !== null);

  // 보류한 항목은 커서를 멈춘 자리에 둔 채 런이 열려 있다(board.ts resetRun) — 재개가 그 자리를 이어받기
  // 위해서다. 그래서 노드만 보면 "작업 중"이 된다(실측: on_hold인 FEAT-07에 "waiting for dev"가 떴다).
  // pipeline_next는 walkingKeys에서 같은 규칙으로 거른다(board.ts:52) — 그 주석이 말하는 "배너와 같은 규칙"이 여기다.
  const isProjectSlot = (node: string | null) => {
    const agent = slotAgent(node);
    return agent !== null && PROJECT_AGENTS.includes(agent);
  };
  // 당신 차례인 항목은 뺀다 — 핸드오프로 멈춘 plan 노드 항목이 커밋 줄과 노드 줄을 함께 얻지 않게.
  const working = items.filter((i) => !pending.includes(i) && i.status !== "on_hold" && i.gate === null
    && (i.node === "plan" || i.node === "verify" || i.node === "implement" || isProjectSlot(i.node)));

  const first = pending[0];
  if (first !== undefined) {
    const openCount = items.filter((i) => isOpen(i.status)).length;
    // 결재함 자격은 review-gate가 센다(gate·resume) — 카드가 하나라도 있으면 Inbox, 없으면 첫 항목의 페이지.
    const open: TurnTarget = pendingInboxCount(items.map((i) => ({ status: i.status, gate: i.gate }))) > 0 ? { kind: "inbox" } : { kind: "item", key: first.key };
    return {
      kind: "mine",
      count: pending.length,
      detail: mineDetail(pending),
      why: canPropose(openCount) ? null : BLOCKED_WHY,
      // 당신 차례여도 세션이 이어 갈 항목의 줄은 함께 낸다 — 인수 대기 하나가 아무도 시작하지 않은 항목의
      // 줄을 가렸다(실측 2026-10-02, mathgic ITEM-02의 인수가 ITEM-01의 plan 줄을 가렸다).
      next: nextSteps([...pending, ...working]),
      open,
    };
  }

  if (working.length > 0) {
    return {
      kind: "theirs",
      // 디스패치되지 않은 항목을 "하고 있다"고 말하면 사실이 아니다. 게이트를 열자마자 그 상태가 된다(실측) —
      // 사람이 세션을 돌리기 전까지는 아무도 그 일을 하고 있지 않다. 아래 "Next, in Claude Code" 줄이 할 일을 준다.
      detail: working.map(workingLine).join(" · "),
      next: nextSteps(working),
    };
  }

  return { kind: "none", detail: setup.autoScoutEnabled === false ? SCOUT_OFF_DETAIL : NONE_DETAIL };
}
```

**`src/fsd/widgets/turn-banner/ui/next-step.tsx`** — 줄들 밑에 감시 안내 한 줄을 붙인다. 문장은 모델의
`WATCH_LINE` 하나만 쓰고, 명령만 `Code`로 감싼다. `turn-banner.tsx`의 `DetailText`와 같은 이유다.

Before (파일 전체):

```tsx
import { CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";
import type { NextStep } from "../model/turn";

// 터미널로 돌아가는 다리. 이 상자만 에이전트 차례에도 --mine을 쓴다 — 복사는 사람의 동작이다.
export function NextStepBox({ steps }: { steps: NextStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-mine bg-mine-soft px-3.5 py-3">
      <p className="text-sm font-medium text-mine">Next, in Claude Code</p>
      {steps.map((step) => (
        <div key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <CodeBlock className="bg-paper">{step.line}</CodeBlock>
          <CopyButton text={step.line} />
        </div>
      ))}
    </div>
  );
}
```

After:

```tsx
import { Code, CodeBlock } from "@/fsd/shared/ui/code";
import { CopyButton } from "@/fsd/shared/ui/copy-button";
import { WATCH_LINE, type NextStep } from "../model/turn";

const WATCH_COMMAND = "/harness:watch";

// 터미널로 돌아가는 다리. 이 상자만 에이전트 차례에도 --mine을 쓴다 — 복사는 사람의 동작이다.
export function NextStepBox({ steps }: { steps: NextStep[] }) {
  if (steps.length === 0) return null;
  const [before, ...rest] = WATCH_LINE.split(WATCH_COMMAND);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-mine bg-mine-soft px-3.5 py-3">
      <p className="text-sm font-medium text-mine">Next, in Claude Code</p>
      {steps.map((step) => (
        <div key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <CodeBlock className="bg-paper">{step.line}</CodeBlock>
          <CopyButton text={step.line} />
        </div>
      ))}
      <p className="text-xs text-quiet">
        {before}
        <Code>{WATCH_COMMAND}</Code>
        {rest.join(WATCH_COMMAND)}
      </p>
    </div>
  );
}
```

**`src/fsd/entities/pipeline/model/gate-copy.ts`** — before-plan 힌트를 before-implement 힌트와 같은
구조로 맞춘다. 이 힌트는 Inbox 버튼 밑(`review-gate/model/gate-text.ts:7`)과 Pipeline 레일 툴팁
(`edit-pipeline/ui/pipeline-rail.tsx:188`)에 함께 쓰인다.

Before (`:6-13`):

```ts
const GATE_COPY: Record<string, { label: string; hint: string }> = {
  "before-plan": { label: "Request plan", hint: "dev writes a plan. Nothing changes in the code yet." },
  "before-verify": { label: "Continue to verification", hint: "The main loop verifies the plan; plan-verifier runs an independent pass." },
  "before-implement": { label: "Approve implementation", hint: "Approving lets dev change code. Then you run dev in Claude Code." },
  "before-accept": { label: "Continue to acceptance", hint: "The main loop reproduces the five acceptance checks." },
  "before-doc-audit": { label: "Continue to doc audit", hint: "doc-auditor checks whether the docs still match the code." },
  "before-scout": { label: "Continue to scouting", hint: "feature-scout researches outside and proposes features." },
};
```

After:

```ts
const GATE_COPY: Record<string, { label: string; hint: string }> = {
  "before-plan": { label: "Request plan", hint: "Requesting lets dev write a plan. Then you run dev in Claude Code. Nothing changes in the code yet." },
  "before-verify": { label: "Continue to verification", hint: "The main loop verifies the plan; plan-verifier runs an independent pass." },
  "before-implement": { label: "Approve implementation", hint: "Approving lets dev change code. Then you run dev in Claude Code." },
  "before-accept": { label: "Continue to acceptance", hint: "The main loop reproduces the five acceptance checks." },
  "before-doc-audit": { label: "Continue to doc audit", hint: "doc-auditor checks whether the docs still match the code." },
  "before-scout": { label: "Continue to scouting", hint: "feature-scout researches outside and proposes features." },
};
```

**`src/fsd/features/review-gate/ui/inbox-card.tsx`** — 도움말의 첫 항목에 "누가 시작하는가"를 더한다.

Before (`:97-100`):

```tsx
            <li>
              <b className="font-medium text-ink">Request plan</b>: dev writes a plan.{" "}
              <b className="font-medium text-ink">Approve implementation</b>: dev changes the code.
            </li>
```

After:

```tsx
            <li>
              <b className="font-medium text-ink">Request plan</b>: dev writes a plan.{" "}
              <b className="font-medium text-ink">Approve implementation</b>: dev changes the code. Neither starts dev —
              your Claude Code session does.
            </li>
```

**`plugin/.claude-plugin/plugin.json`** — 현재 `"version": "0.3.7"`을 `"0.4.0"`으로 올린다. 새 스킬이 생기므로
minor를 올리고, 판을 올려야 사용자 쪽 `claude plugin update`가 새 판을 받는다.
실제 구현에서는 최신 dev의 `src/fsd/entities/project-token/ui/token-reveal.test.ts`에 있는
init 배포 판 기대값도 0.3.7에서 0.4.0으로 갱신하고 안내 본문 검사는 유지했다.

### 문서 수정

- `docs/conventions/product-copy.md`
  - §3 Next-step hint(`:91`): Request plan을
    `"Requesting lets dev write a plan. Then you run dev in Claude Code. Nothing changes in the code yet."`로.
  - §5(`:205-221` 뒤): 아래 규칙 문장과 잠금 블록을 더한다.

    ```markdown
    The box lists every item that waits on the terminal — also while it's your turn. An item waiting on you
    must not hide an item nobody has started (2026-10-02: ITEM-02's acceptance hid ITEM-01's plan line).
    Under the lines, one quiet line, with `/harness:watch` in mono:

    <!-- copy-lock:turn-banner-watch -->
    > Or leave `/harness:watch` running in that session — it continues ready steps and waits for your gates and commits.
    <!-- /copy-lock -->
    ```

  - §6 도움말(`:280`): `- **Request plan**: dev writes a plan. **Approve implementation**: dev changes the code. Neither starts dev — your Claude Code session does.`
  - §18 Pipeline tab의 before Plan 툴팁 예시도 같은 새 힌트를 사용한다. 최종 문장은
    `"The item waits here until you press Request plan in the Inbox. Requesting lets dev write a plan. Then you run dev in Claude Code. Nothing changes in the code yet."`다.
    §3만 갱신하고 §18의 이전 예시를 남기지 않는다. 실제 rail 본문과 gate-copy/rail 시험의 기대값을
    §3·§18 두 자리와 함께 대조한다.
  - §15: `/harness:watch`의 description, CLI 이벤트·위 code→reason 표와 HTTP fallback 문장,
    기본값·플랫폼별 시작/중단/실패 안내를 더한다. 파일명/명령을 제외한 표시 문구는 영어다.
- `docs/architecture/protocol.md`의 MCP 표: `pipeline_next` 호출자를 `main-loop · harness-watch`로,
  `project_get` 호출자는 기존 `전부`를 유지한다. 표 아래 감시 절에 시작의 project_get 정체 확인,
  hu_의 매 요청 project, 총 46자 token 검증, 관리 블록의 checkout runbook 판 추출·동일 값 반복 허용·
  충돌/손상 거부·legacy 판 생략, key 없는 overview의 지연 전진·실패 응답 뒤
  저장 여부 단정 금지, 소유자 게이트 금지, 로컬 guard/스킬 권한의 한계를 위 계약대로 적는다.
- `docs/investigations/active/harness-platform.md` §3.4: `local` 행의 트리거를
  "사용자가 Claude Code에서 런북대로 디스패치(`/harness:watch`면 감시 스크립트가 그 세션을 깨운다)"로.
  routine/hosted 및 과거 상세 구현 절은 변경하지 않는다. 현재 구현의 계약은 architecture 문서다.
- `docs/architecture/verification.md`의 문구 잠금 표: turn-banner-watch → 모델/렌더 시험을 등록한다.
- `docs/test-reports/active/2026-10-02-local-watch-executor.md`: Phase 3 세션 스모크와 Phase 5 운영
  관측을 분리해 기록한다. 구현/배포 SHA·plugin 실제 경로/판·tool/CLI 판·요청/이벤트/실행 시각,
  idle 재무장·권한 확인 창·비용 관측·잔여 실패를 포함한다. 템플릿 재시드 완료로 기록하지 않는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `packages/core/watch.mjs` | add | 순수 판정. 두 단계가 공유한다 | low — 소비자는 감시 스크립트뿐 |
| `packages/core/watch.test.mjs` | add | `npm test`가 `packages/core/*.test.mjs`를 돈다 | none |
| `plugin/lib/watch.mjs` | add(동기화 복사본) | `scripts/plugin-lib.mjs`가 core 모듈 전부를 복사한다 | low — 빠지면 `npm run check`가 막는다 |
| `plugin/bin/harness-watch.mjs` | add | 감시·checkout 런북 판 추출 | medium — 주기 호출·파일 쓰기(Risks) |
| `plugin/bin/harness-watch.test.mjs` | add | `npm test`가 `plugin/bin/*.test.mjs`를 돈다 | none |
| `plugin/skills/watch/SKILL.md` | add | 사용자 진입점 | medium — 동작이 모델의 지시 준수에 기댄다 |
| `plugin/.claude-plugin/plugin.json` | update | 판 0.3.7 → 0.4.0 | low |
| `src/fsd/entities/project-token/ui/token-reveal.test.ts` | update | 기존 init 배포 판 기대값 0.3.7 → 0.4.0, 안내 본문 검사는 유지 | none |
| `src/fsd/widgets/turn-banner/model/turn.ts` | update | `deriveTurn`의 `next`, `WATCH_LINE` | low — 소비자는 `api/turn-data.server.ts:65` 하나(역검색) |
| `src/fsd/widgets/turn-banner/model/turn.test.ts` | update | 시험 추가 | none |
| `src/fsd/widgets/turn-banner/ui/next-step.tsx` | update | 감시 안내 줄 | low — 소비자는 `turn-banner.tsx:64` |
| `src/fsd/widgets/turn-banner/ui/next-step.test.mjs` | add | 실제 NextStepBox 본문·Code·빈 입력 확인 | none |
| `src/fsd/entities/pipeline/model/gate-copy.ts` | update | before-plan 힌트 | low — Inbox 힌트·레일 툴팁 두 곳에 같이 바뀐다 |
| `src/fsd/entities/pipeline/model/gate-copy.test.ts` | update | `PLAN` 기대 문장(`:8`) | none |
| `src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs` | update | 툴팁 기대 문장(`:23`) | none |
| `src/fsd/features/review-gate/ui/inbox-card.tsx` | update | 도움말 한 줄 | low |
| `src/fsd/features/review-gate/ui/inbox-card.test.mjs` | update | before-plan/도움말 실제 렌더·읽기 전용 비노출 | none |
| `docs/conventions/product-copy.md` | update | §3·§5·§6·§15·§18 | low — 잠금 블록이 시험과 묶인다 |
| `docs/architecture/protocol.md` | update | `pipeline_next` 호출자 | none |
| `docs/investigations/active/harness-platform.md` | update | §3.4 실행기 계약 | none |
| `docs/architecture/verification.md` | update | 새 문구 잠금 시험 등록 | none |
| `docs/test-reports/active/2026-10-02-local-watch-executor.md` | add | 세션·운영 실측 보고서 | low — 완료 증거와 미실행 구분 |

바꾸지 않는 것: `src/server/**`, `prisma/**`, MCP 도구 등록, `plugin/templates/**`(런북),
`plugin/bin/harness-init.mjs`, `.claude-plugin/marketplace.json`(현재 name/source/description 유지).

## Safety Analysis

- **아키텍처.** 순수 판정은 packages/core, IO는 plugin/bin, UI는 기존 FSD slice다.
  원격 명령 채널/Command 원장/routine/호스팅 실행기를 만들지 않는다. server·Prisma·MCP 등록 집합,
  소유자 endpoint, private 템플릿과 seed는 그대로다. 게이트는 인간만 열며 스킬이 자동 승인하지 않는다.
- **자격.** 환경의 총 46자 token만 사용하고 ho_는 거부한다. hu_의 project는 매 요청 필수다.
  project_get으로 시작 대상을 확인하고 설정 변경/타 프로젝트/미선택/해제는 오류 중단한다.
  HTTP 실패를 offline/template fallback이나 자동 reconnect로 우회하지 않는다.
- **checkout 판.** CLAUDE.md의 init 관리 블록만 읽고 같은 판의 반복은 허용한다. 다른 판·손상된
  선언/marker는 입력 오류로 중단한다. legacy 판 생략 외 추정은 하지 않으며 런북/생성기는 읽기 전용이다.
- **경쟁·중단.** guard·session id·poller nonce로 파일 갱신을 직렬화한다. 대기/응답 뒤 및 cleanup에도
  소유권을 검사한다. work/idle은 session만 남기고, stop은 자기 session만, poller의 error/stuck은
  자기 nonce 소유를 증명할 때만 정리한다. 미등록 caller나 증명 불가 상태는 기존 파일을 지우지 않는다.
  stop은 설정 파일·환경이 바뀌거나 없어져도 자기 session을 정리하지만 다른 소유자의 상태는 보존한다.
  다른 clone/기기/수동 세션의 AgentRun 개설과 이미 디스패치된 작업 취소는 로컬 잠금이 보장하지 않는다.
- **비밀값·시간.** token은 argument/file/log에 쓰지 않는다. 응답은 id/schema/크기 검증 후 데이터로
  처리한다. 요청/body/sleep/deadline 모두 유한하며 abort/timer/reader를 정리한다.
- **설치 경로.** watch 스킬 본문의 `${CLAUDE_PLUGIN_ROOT}` 치환값이 CLI/lib/reference의 출처다.
  셸의 plugin-root 환경변수 부재를 다른 설치·현재 디렉터리·기본 경로로 우회하지 않는다.
- **FSD provenance.** Code/CodeBlock은 shared/ui/code.tsx의 unit API → next-step.tsx에서 import한다.
  WATCH_LINE은 같은 slice model/turn.ts → ../model/turn로 import하며 외부 export를 늘리지 않는다.
  gateActionHint/gateTooltip은 entities/pipeline/model/gate-copy.ts → entities/pipeline/index.ts →
  review-gate/model/gate-text.ts(alias gateNextActionHint)/edit-pipeline/ui/pipeline-rail.tsx로 이어진다.
  deriveTurn은 turn-data.server.ts, NextStepBox는 turn-banner.tsx가 소비하며 호출 시그니처는 유지한다.

파일 preflight: 신규 core/CLI 부모와 기존 파일은 존재하고 watch.mjs/watch.test.mjs/CLI 두 파일/
watch skill/next-step.test.mjs/보고서 목표는 현재 충돌하지 않는다. plugin/skills/watch/는 Phase 3에서
명시적으로 생성한다. scripts/plugin-lib.mjs는 test가 아닌 core .mjs 전체를 복사하고 byte 동일성을
검사한다. 파일 이동·삭제 지시는 없으므로 old-path 부재 검사는 적용하지 않는다.

정적·barrel 역참조와 bounded slice의 import()/lazy()를 열거했다. 관련 동적 로딩은 없고,
  경로/DI/라우트 신규 생성은 하지 않는다. UI는 현재 client subtree의 본문을 바꾸며 app entry와
서버 액션을 수정하지 않는다. 새 CLI는 config/token/runbook의 기존 공개 exports를 사용하고
서버/Prisma 또는 FSD 타입을 import하지 않는다. post-change 검증 목적지는 아래 표에 고정한다.

## Approval

승인 메모:

- 구현 당시 승인 기록은 front matter에 보존한다. 코드 구현과 dev 병합은 완료됐으며,
  사용자 요청에 따라 운영 인수는 완료 처리의 후속 작업으로 남긴다.

## Execution Plan

아래 Phase 1–4는 실제 구현에 사용한 계획을 보존한 기록이다. `harness/local-watch-executor`에서
구현하고 최신 dev `495bd22`를 반영한 PR #100이 dev에 병합됐다. 별도 checkout에서 검증하여
다른 작업의 dirty/untracked 파일을 보존했다. Phase 5의 배포·운영 인수는 후속 작업이다.

### Phase 1: 순수 판정 모듈

- 작업: watch.mjs와 시험을 작성하고 npm run sync:plugin-lib으로 복사본을 생성한다.
- 검증: V1·V2, npm test, plugin-lib --check. 미검증 전체 CLI 초안을 복사하는 방식은 사용하지 않는다.

### Phase 2: 감시 스크립트

- 작업: 총 46자 token·입력/정체/전송 검증, checkout 런북 관리 블록의 판 추출·검증,
  guard와 session/poller 소유권, timeout·body 제한·재시도·정리 구현.
  stop은 설정/환경 preflight와 분리하여 root/session만으로 소유권과 guard를 확인한다.
- 검증: V3–V8을 실제 child process와 루프백 서버로 수행한다. 강제 인수 중 지연 응답과
  같은 session의 중복 poller는 barrier로 정확한 순서를 만들어 검사한다.

### Phase 3: 스킬과 계약 문서

- 작업: watch SKILL.md/폴더, plugin version 0.4.0, product-copy §15, protocol 감시 절,
  스펙 §3.4, 명명된 시험 보고서의 세션 스모크 절을 작성한다.
  SKILL.md는 `${CLAUDE_PLUGIN_ROOT}`의 본문 치환으로 경로를 얻고 명령을 안전하게 quote한다.
  `context: fork`나 주입 셸 명령으로 감시를 시작하지 않고 위 메인 대화 절차를 사용한다.
- 검증: V9·V12, npm run check. 실제 대화형 세션은 다음 순서로 실행한다.
  임시 Git repo에서 `claude --plugin-dir '<absolute-stagekeeper>/plugin' --strict-mcp-config --mcp-config '<absolute-fixture-config.json>'`으로
  watch를 로드한다. 별도 MCP JSON은 mcpServers.harness:{type:"http",url:<loopback>/api/mcp,
  headers:{Authorization:"Bearer ${HARNESS_TOKEN}"}}만 등록한다. strict 플래그로 사용자/프로젝트의
  운영 harness/owner 서버를 제외하고, 환경 server/token도 loopback/dummy로 지정한다.
  Bash/PowerShell에 CLAUDE_PLUGIN_ROOT를 따로 주입하지 않는다. 로딩된 스킬의 본문 치환값으로
  실제 명령·init reference가 해석되는지 확인해 환경변수 가정 오류를 감추지 않는다.
  가짜 서버는 SDK의 실제 stateless handler로 initialize/tools/list/tools/call을 제공하며
  project_get·pipeline_next·agent_next·board_get·report_submit fixture만 등록한다. 상태는 메모리에만
  저장하고 실제 프로젝트/AgentRun은 만들지 않는다. fixture dev는 자기 임시 root의 확인 작업만
  하며 receipt를 가진 안전한 fixture 응답으로 WAIT→PLAN→WAIT를 만든다. 소유자의 stop 뒤 늦은 통지가 재무장하지
  않는지도 확인한다. 배포 전 이 스모크가 실패하면 Phase 5로 진행하지 않는다.

### Phase 4: 웹 판정과 문구

- 작업: Affected Files의 UI/시험/product-copy §3·§5·§6·§18·verification 잠금 표를 같은 commit으로 갱신.
- 검증: V10·V11, npm run test:web, npm run check, verify:fsd, test:architecture, lint, build.
  Next.js 16.3.3의 설치 문서 `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`는
  dev 출력을 `.next/dev`, production 출력을 `.next`로 분리하므로 빌드를 위해 dev 서버를 일괄
  종료하지 않는다. 같은 checkout의 production build끼리는 직렬화한다. `npm run build`의 선행
  `prisma generate`는 `src/generated/prisma`를 쓰므로 같은 생성 경로를 쓰는 다른 생성 작업과도
  직렬화한다. 격리 checkout을 사용한다면 그 checkout의 의존성·생성물로 검증한다. 실제 충돌이
  확인돼 프로세스를 멈춰야 할 때만 사용자가 허용한 범위의 정확한 대상을 종료한다.

### Phase 5: 플러그인 확인·배포와 실측

- PR #100의 dev 병합은 `0aec9ab`로 완료됐다. 이후 release 승격 시 main은 검증된 dev로
  fast-forward만 승격한다. dev를 PR head로 쓰거나 UI merge로 승격하지 않는다.
- 웹의 watch 안내를 노출하기 전 사용할 설치 경로가 local marketplace인지 hosted cache인지
  확인한다. local ./plugin 소스는 실제 경로가 main의 새 내용인지 보고 세션을 재시작한다.
  hosted cache는 아래 두 update 명령 후 캐시 manifest의 0.4.0과 watch skill/CLI/lib 본문을 확인한다.
  이미 watcher가 있으면 먼저 stop하고 업데이트한다. 업데이트 결과 문장만으로 새 본문을 단정하지 않는다.
- mathgic 소유자 세션을 재시작해 정책을 받고 watch를 켠다. 다음 ready gate는 소유자가 웹에서 연다.
  성공 기준 1·2·5와 V13을 보고서로 남긴다. 운영 자동화/권한 확인 창/호출 수·compute 관측을
  보고 비용 범위를 승인한 세션만 장시간 유지한다. 이 검토가 interval 변경을 요구하면 proposal을
  갱신/재검증하며 성공 기준을 조용히 바꾸지 않는다. 사용자 지시에 따라 코드 구현은 completed로
  처리했으며, 실제 운영 인수는 이 후속 작업의 완료 근거로 별도 기록한다.

```powershell
claude plugin marketplace update stagekeeper-local
claude plugin update harness@stagekeeper-local
```

로컬 소스와 캐시 업데이트의 차이·판 상승 규칙은
[marketplace 문서](https://code.claude.com/docs/en/plugins/host-marketplace#keep-users-up-to-date)를 따른다.
플러그인 배포가 DB Template을 갱신하지 않는다. 이번 변경에는 private 템플릿/재시드를 포함하지 않는다.

## Verification Plan

구현 전 dev 기준과 구현 후 같은 명령의 exit code·시험 수를 각각 기록한다. 이번 문서 대조의
기존 코드 통과는 새 watch 구현 통과가 아니다. PowerShell 명령은 npm.cmd를 사용한다:

```powershell
npm.cmd test
npm.cmd run test:web
npm.cmd run check
npm.cmd run verify:fsd
npm.cmd run test:architecture
npm.cmd run lint
npm.cmd run build
```

새 시험 파일은 node:test + assert/strict를 사용한다. packages/core/*.test.mjs, plugin/bin/*.test.mjs는
npm test가, src/**/*.test.mjs/ts는 test:web이 실행한다. 테스트는 fixture 기대값을 직접 정하며
실제 인증·연결 상태·시간 순서·출력/파일 상태를 단언한다. production 구현과 같은 helper를 써서
기대값을 재계산하지 않는다.

| ID | 요구사항·입력/경계 | 검증 목적지와 단언 |
| --- | --- | --- |
| V1 | JSON/SSE, LF/CRLF, multiple data, keepalive, 알림/다른 id, malformed/duplicate/missing result, rpc/isError | core/watch.test.mjs. 일치 응답 body 선택 또는 명시 오류. 마지막 data 선택 파서 회귀 금지 |
| V2 | dispatch/accept/wait(gate/handoff/cap)/done, legacy/slots-v1/repeated slots, malformed head/items/version/entry/format | 같은 파일. 모든 branch 구조; propose:no는 head만 제외; 슬롯 scout는 유지; 순서와 구분자에 독립적인 서명; entry/run/version 변경과 빈 작업 reset; 1·2회 work/3회 stuck |
| V3 | 옵션값 누락/중복/충돌/unknown, 시간값 NaN/Infinity/0/음수/최댓값, bare/비Git/불완전 config/server, checkout 런북 판 | CLI 시험. 현재 init의 marker/렌더 구조로 같은 판 3회 반복·관리 블록 밖 다른 hash를 넣어 pipeline_next의 arguments.runbook이 정확한 판인지 확인. 서로 다른/잘못된 판·손상 선언·marker 한쪽 누락/역순/중복은 error 한 줄·exit1, 요청/정책/잠금 쓰기 0. 판 없는 legacy는 runbook 인자 없음과 stale 경고 보존. 다른 입력 오류도 무쓰기. plugin/root 경로의 공백·따옴표와 PowerShell/Bash 인자 형식 스모크; plugin-root 셸 환경변수가 없어도 치환된 CLI 경로가 한 인자로 전달됨 |
| V4 | 유효한 dummy hu_/hs_(접두 3자 + 본문 43자 = 총 46자), 전체 길이 43/45/47자·잘못된 문자, slug/정체/available, owner token·잘못된 접두, environment 격리 | CLI 시험. token 형식 오류·ho_는 요청/정책/잠금 쓰기 0. hu_ slug를 fixture에 추가하고 fake server가 모든 arguments.project를 검증. hs_ legacy만 생략. project_get의 owner/repo/slug 불일치·미선택·해제 거부는 시작 파일 쓰기 0 |
| V5 | 동시 start/force/stop, linked worktree, 동일 session 두 poller, 지연 HTTP 중 force/stop | CLI 시험. guard 승자 하나, second locked; 단독 poller; 중복 poller error가 기존 잠금 유지; 이전 응답은 replaced, 새 id/policy/hash byte 불변; 오래된 stop/cleanup은 새 소유자 무쓰기; work/idle 보존과 자기 nonce의 terminal 해제 |
| V6 | 손상 JSON/schema/session 불일치, 12시간 만료/live PID/죽은 PID/EPERM, guard crash, binding/token 변경, stop의 설정 독립성 | CLI 시험. 손상은 error, 권한 확대/default 복구 없음. 만료는 locked/확인된 force; live poller를 expiry로 훔치지 않음. guard fail-closed와 명시 수동 복구. 실패한 check는 기존 파일 유지, 성공 check는 반복 수 불변. config 변경·손상·삭제 및 CLAUDE.md/token/server 부재에도 stop은 자기 session만 해제; 다른 id/손상된 상태는 보존 |
| V7 | hung fetch/hung body, oversized body, SIGTERM, deadline 직전 응답·긴 sleep·소유권 상실 | CLI 시험. request/local-check timer/reader/poller/임시 파일 정리, deadline 이내 idle(스케줄러 허용 오차 기록), request timeout5회는 error, 1초 이내 상실 감지/abort(스케줄러·guard 허용 오차 기록), 새로운 소유자 파일 무변경 |
| V8 | 401/403/4xx/rpc/tool errors, 408/429/5xx/연결실패, 성공 뒤 재실패, Retry-After, redirect·token 반사 | CLI 시험. 치명 오류 1회, transient 5회에서 종료·정상 응답 reset·재시도 간격; secret이 stdout/stderr/state에 없음; 영어 reason/copy 계약과 정확히 한 JSON 줄 |
| V9 | 실제 메인 대화 background·완료/idle 재무장/stop, policy/ownership/stale runbook, 다른 item의 wait, plugin 경로 치환 | Phase 3 보고서. dummy server + 지원 tool 세션으로 observable task/query 순서와 policy 적용 확인. 셸 plugin-root 환경변수 없이 SKILL 본문의 실제 CLI/reference 경로가 해석됨. permission/commit handoff는 소유자 입력 전 제출/재무장 없음. 도구 비활성 환경은 시작 실패 |
| V10 | mine의 acceptance+미시작 plan, handoff+미시작 implement, gate+verify, 반복 project slots, on_hold | turn.test.ts. pending→working 입력 순서/한 item 한 줄. count/detail/why/open 유지; setup/none/theirs 기존 결과 유지. WATCH_LINE과 copyLock(turn-banner-watch) 일치 |
| V11 | 실제 본문·명령 Code·Copy payload·빈 상자·읽기 전용·문서의 툴팁 예시 | next-step.test.mjs의 renderToStaticMarkup(기존 client context 패턴 이용), inbox-card.test.mjs의 기존 render helper, gate-copy.test.ts/pipeline-rail.test.mjs. WATCH_LINE은 명령 Code 하나로 렌더; steps:[]는 HTML/안내 모두 없음; before-plan의 새 hint/도움말 본문 존재; read-only에서 실행 안내 없음. product-copy §3의 hint·§18의 before Plan 툴팁 예시와 최종 렌더/기대 문장이 일치하며 해당 두 자리의 이전 힌트는 남지 않음 |
| V12 | core→lib, plugin manifest/marketplace precedence, skill 발견, 문서 잠금 registry, 경계 보존 | plugin-lib --check + JSON.parse manifest/marketplace 구조 검사 + 실제 설치 파일과 /harness:watch 로딩. manifest name=harness/version=0.4.0; marketplace name=stagekeeper-local/source=./plugin이며 version override가 없음. npm check/verify:fsd/test:architecture 및 diff로 server/Prisma/templates/init/marketplace의 무변경 확인 |
| V13 | mathgic gate→work→agent_next 성공 receipt, 110분 idle와 재무장, 확인 창/비용/세션 종료 | 명명된 보고서. 성공 기준의 로컬 시각과 gate event/task/receipt id, actual plugin/tool 판, HTTP/모델 호출 수, stop 뒤 새 요청 없음(기존 in-flight 서버 효과는 취소 보장 밖). 휴대폰 push·2단계 실행·다른 기기 잠금은 성공 주장 밖 |

fixture/cleanup: 부모 HARNESS_TOKEN/HARNESS_SERVER/HARNESS_OWNER_TOKEN과 dotenv 자동 로딩을
차단하고 loopback 서버·전용 임시 Git repo만 쓴다. fake server는 method/name/id/header/project와
호출 수를 기록해 검사하고 실제 Stagekeeper에 접속하지 않는다. child는 process.execPath로 비동기
실행한다(동기 spawn은 같은 프로세스 HTTP 서버를 교착시킨다). timeout/barrier·t.after/finally로
child terminate/서버 closeAllConnections→close/자기 임시 root 제거를 수행한다. Windows 제거는
child/server 종료 뒤 절대 경로가 자기 tmp root 안인지 검증한다. 실패해도 fixture가 남아 후속 시험을
오염시키지 않게 한다. core parser는 정규화 정책 외 IO를 갖지 않는다.

현재 두 문구 기대값(gate-copy.test.ts, pipeline-rail.test.mjs)만 새 문장으로 갱신한다.
다른 기존 기대값을 맞춰 회귀를 숨기지 않는다. 신규 렌더/상태 시험은 V10/V11의 요구를 추가한다.

### 최종 산출물과 의존성

| 최종 산출물 | 승리하는 출처·본문 의존성 | 구현 후 검증 |
| --- | --- | --- |
| /harness:watch | 실제 로딩 plugin 경로의 skills/watch/SKILL.md, 본문 ${CLAUDE_PLUGIN_ROOT} 치환값 아래 bin/harness-watch.mjs·init reference, lib/watch/config/token/runbook 및 transitive workspaces.mjs·entitlement.mjs, 대상 checkout의 읽기 전용 CLAUDE.md 관리 블록. marketplace source/manifest/cache 우선순위 적용 | V3·V4·V9·V12. 셸 환경변수 없이 실제 CLI/reference 경로, token/checkout 판을 request 인자에서 확인하고 명령 발견 + 실제 설치 본문/exports + dummy server 실행. package 이름/판만 확인하지 않음 |
| 로컬 감시 상태/이벤트 | 공통 git dir의 정책/잠금/guard, session·poller 소유권, HTTP 최종 응답 body | V3–V8. JSON.parse 구조·fresh 소유권·새 id 보존·stdout/exit code·abort/cleanup |
| Board/Inbox 전체 배너의 terminal box | turn-data.server.ts→deriveTurn→TurnBanner→NextStepBox, WATCH_LINE/product-copy 잠금, Code/CodeBlock/CopyButton | V10·V11 + Phase 4 브라우저에서 Board/Inbox, 공백/긴 key·좁은 폭·Copy 실제 값. compact strip의 기존 동작과 unavailable 프로젝트의 배너 비노출 유지 |
| Inbox before-plan hint/도움말, Pipeline tooltip | gate-copy.ts→entities public API→gate-text alias/rail, InboxCard JSX, product-copy §3/§6/§18 | 실제 렌더 V11와 gate-copy/rail 시험 및 §18 예시 대조; before-implement 등 다른 문구 및 read-only 비노출 보존 |
| 계약/관측 문서 | product-copy §3/5/6/15/18, protocol 감시 절, spec §3.4, verification 잠금 표, 명명된 report | V9–V13 + 문서 대조. future phase와 미실행 결과를 실제 완료로 기록하지 않음 |

### Definition of Done

2026-10-03 사용자 지시로 코드 구현 완료를 문서 완료 기준으로 확정했다. 아래 구현·자동 검증·
격리 세션 시험은 완료됐고 브라우저·배포·운영 인수는 후속 작업으로 관리한다.

- 22개 산출물이 inventory와 일치하고 외부 skill·설정·정체·도구 전제가 검사된다.
  plugin root는 스킬 본문 치환으로 해결되며 셸 환경변수 없이 CLI/reference가 동작한다.
- 총 46자 token과 checkout 판 추출을 실제 request/무쓰기 경계로 검증한다. 같은 판의 반복과
  소유자 hash를 구분하고 충돌/손상은 거부하며 legacy 판 생략·stale 경고는 보존한다.
- V1–V8·V10의 자동 검증, V9의 격리 메인 대화 스모크, V11의 자동 렌더 검증,
  V12의 로컬 소스 검증과 필수 명령이 통과했다. V11의 브라우저 검증, V12의 hosted cache 확인,
  V13의 운영 실측은 미실행 후속 작업으로 보고서에서 구별한다.
- guard 경쟁·동일 session poller·지연 응답의 force/stop·timeout·bad body·후속 cleanup을 검증한다.
  설정/환경을 잃은 뒤에도 자기 session을 stop할 수 있고 손상/다른 소유자의 상태는 보존한다.
- 모든 fresh cycle에 head 정책·commit 정책·현재 scope/entry/receipt/소유권을 적용한다.
- 웹 model 및 최종 렌더/copy payload/read-only를 확인하고 product-copy §3·§5·§6·§15·§18과
  잠금 표를 동기화한다. §18의 툴팁 예시를 포함해 이전 힌트를 남기지 않는다.
- 서버/DB/도구 집합/템플릿/init/marketplace 무변경, 자동 push/게이트 없음, 2단계 구현 없음을 확인한다.
- 코드 구현·기록된 검증·PR #100 dev 병합을 근거로 completed 처리한다. release 승격·실제
  배포 plugin 본문 확인·운영 실측의 완료를 이 상태로 주장하지 않는다.

## Verification Results

### 실제 1단계 구현 결과

[구현 보고서](../../test-reports/active/2026-10-02-local-watch-executor.md)의 최종 dev 기반 검증 기록:

| 검사 | 결과 | 범위 |
| --- | --- | --- |
| npm test | PASS, 254/254 | watch 시험을 포함한 core/CLI |
| npm run test:web | PASS, 526/526 | 최종 dev 기반 웹/MCP |
| npm run check | PASS | 복사본 동기화·lint·typegen·typecheck·architecture 26/26·project-availability 18/18 |
| npm run verify:fsd / npm run build | PASS | FSD 경계와 production build |
| 격리 Claude 메인 대화 스모크 | PASS | 실제 background 완료 통지·idle 재무장·receipt dispatch·commit:no handoff·owner stop |
| dev 병합 | 완료, PR #100 / 0aec9ab | 2026-10-02 병합. 구현 commit b0b3c27, 최종 PR head 427fd7d |
| 브라우저·hosted cache·mathgic 운영 실측 | 후속 작업, 미실행 | V11 브라우저/clipboard, V12 배포 설치 본문, V13 실제 gate→receipt·110분 idle·권한/비용 관측 |

위 결과는 구현 당시 실행 기록이다. 이번 완료 처리에서는 문서 상태·이동·링크를 확인하며
애플리케이션 테스트나 운영 인수를 다시 실행하지 않는다. 기존 lint 경고 1개와 짧은 timing 시험의
병렬 실행 실패 및 동일 코드의 직렬 재실행 통과는 구현 보고서에 기록돼 있다.

### 제안 검증 당시 baseline

아래는 구현 전 제안서 대조에서 HEAD 03876dd24fab12c63542b4565f087b79a877f7ef의 추적된 코드로
기록한 역사적 baseline이다. 당시 애플리케이션/watch 구현은 하지 않았으며, 이후 실제 구현 결과는
위 절과 구현 보고서에서 구별한다.

| 검사 | 결과 | 범위 |
| --- | --- | --- |
| npm test | PASS, 188/188 | 위 HEAD의 core/CLI. 신규 watch 시험 아님 |
| npm run test:web | PASS, 504/504 | 위 HEAD의 웹/MCP. 제안한 렌더 변경은 아직 없음 |
| npm run test:architecture | PASS, 26/26 | 위 HEAD의 경계/동기화/문구 가드 |
| npm run verify:fsd | PASS | 위 HEAD의 FSD 경계 |
| 초안의 감시 code 실행(임시 파일·가짜 서버) | 결함 5건 재현 | force 중 이전 응답이 새 lock 덮어쓰기; 동일 session 두 poller 모두 work; hu_ fixture가 project를 빠뜨림; 마지막 SSE 알림이 정상 결과를 가림; 잘못된 interval/deadline이 idle로 성공 |
| 이번 재대조의 웹 스케치 검사 | PASS | Before 네 쌍의 현재 source 일치, 임시 메모리의 After 타입 오류 0, 배너 상태 8개와 NextStepBox/InboxCard/PipelineRail 실제 렌더. 저장소 코드 변경이나 watch 구현 시험이 아님 |
| 이번 재대조의 전송·로컬 런타임 검사 | PASS | 현재 MCP handler/도구/인증의 dummy 요청 8개로 stateless SSE·project scope·접근 거부 확인. 임시 Git/linked worktree·mkdir 배타성·rename 교체·PowerShell/Git Bash 공백/따옴표 인자 확인. 운영 호출 0 |
| 새 구현의 V1–V13·check/lint/build·배포/실측 | 당시 미실행 | 구현 전 대조 결과. 이후 구현 검증과 남은 인수 항목은 위 실제 결과에 기록 |

재현된 초안 전체 CLI/core/test 복사 블록은 제거하고 위 동시성·전송·판정·스킬 계약과 검증
목적지로 교체했다. 웹 Before/After는 제안 검증 당시 source와 구현 스케치의 역사적 기록이다.

위 baseline·초안 결함 5건은 기존 대조 기록이다. 이번 재대조는 §18 툴팁 예시의 수정 누락,
stop과 공통 설정 preflight의 충돌, 설치 Next.js의 dev/build 출력 분리와 맞지 않는 종료 지시,
셸의 plugin-root 환경변수에 의존한 명령 예시를 보완했다. 해당 결정을 Phase·V3/V6/V9/V11·
산출물 표·DoD에 반영했으며 새 watch의 동작 통과를 주장하지 않는다.

## Risks and Rollback

잔여 리스크와 검증 경로:

- **폴링 비용.** 기본 60초면 감시당 대략 분당 한 HTTP 요청이다. 인증의 사용 기록과 개요 조립·지연
  전진에 여러 DB query가 필요하므로 HTTP 한 건을 DB 왕복 한 건으로 가정하지 않는다. 토큰 사용 기록의
  60초 조건도 query를 없애지 않는다. 지속 요청은 DB scale-to-zero를 방해할 수 있다.
  [Neon 공식 문서 원본](https://github.com/neondatabase/website/blob/main/content/docs/introduction/scale-to-zero.md)은
  기본 비활성 대기를 5분으로 설명하지만 운영 플랜/설정은 별도다. V13에서 실제 호출·compute를
  기록하고 소유자가 비용 범위를 보고 장시간 유지한다. 다른 interval 정책은 별도 변경/재검증이다.
- **모델·도구 의존.** background 완료 통지/재무장과 실제 skill 지시 준수는 V9·V13 세션 스모크로
  확인한다. 실패하면 중단 사유를 알리고 수동 terminal 줄을 사용한다. 서버의 watch 생존 표시는
  제공하지 않으며 지원 판 확대나 heartbeat는 후속 설계다.
- **권한·커밋 대기.** 답하지 않은 권한 창은 안전한 정지다. commit:no에는 main-loop의 acceptance
  제출도 소유자 커밋이 필요하다. V9·V13은 대기 원인·재개 조건을 기록해 2단계 허용 목록 입력으로 쓴다.
- **로컬 경계.** 같은 공통 git dir의 watch CLI는 직렬화하지만 수동 세션/다른 clone/기기를 잠그지
  못한다. --force는 이미 시작된 에이전트를 취소하지 않는다. V5/V9 및 인수 전 이전 작업 중단 확인을
  유지한다. 서버 AgentRun/receipt 보호를 중복 실행 방지라고 표현하지 않는다.
- **stuck의 관측 한계.** 작업 집합의 반복 반환이지 개별 AgentRun 단계의 멈춤을 증명하는 지표가
  아니다. 정확한 무진전 원인은 V13 보고서/서버 원장을 확인한다. stuck 자동 재시작은 하지 않는다.
- **업데이트 시차.** local marketplace와 hosted cache가 다르다. V12의 실제 skill/CLI/lib body와
  세션 재시작 확인 후 웹 안내를 공개한다. 판 숫자만으로 새 명령이 설치됐다고 단정하지 않는다.

롤백/로컬 복구:

1. 감시 세션에서 stop 의도를 먼저 기록하고 --stop --session <id>를 실행한다. 해당 background
   task와 진행 중 agent가 끝났는지 확인한다. 다른 새 소유자의 id가 있으면 그 파일을 지우지 않는다.
2. 손상 상태/버려진 guard는 해당 공통 git dir를 쓰는 **모든** 감시/에이전트/세션 작업이 멈춘 뒤
   owner가 복구한다. git rev-parse --git-common-dir 결과를 절대 realpath로 확인하고, 그 아래
   harness/watch.json, watch.lock.json, watch.guard와 이 CLI가 만든 고유 tmp 파일만 제거한다.
   guard를 유지한 프로세스가 살아 있는 동안 제거하지 않으며 --force로 우회하지 않는다.
3. 웹/플러그인은 harness/* 브랜치의 revert PR을 green dev에 merge한 뒤 main을 fast-forward로
   승격한다. plugin 내용 revert에도 version은 0.4.1처럼 더 높은 새 판을 부여한다.
4. cache 사용자는 marketplace update/plugin update 후 실제 body/판과 재시작을 확인한다.
   local ./plugin 사용자는 source checkout이 revert를 포함하는지 확인하고 세션을 재시작한다.
5. 서버/DB 변경이나 저장 데이터 복구는 없다. polling 중 기존 서버가 남긴 정상 전이/원장을 삭제하거나
   되돌리지 않는다. 로컬 파일 제거는 감시 권한을 끝내는 것이며 이미 진행된 파이프라인을 rollback하지 않는다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-10-03. 사용자 요청으로 1단계 코드 구현 완료를 기준으로 완료 처리했다.
- verification-summary: core/CLI 254, web 526, architecture 26, project-availability 18 PASS;
  check·build·verify:fsd 및 격리 Claude 메인 대화 스모크 PASS. 상세 범위·제한은
  [구현 보고서](../../test-reports/active/2026-10-02-local-watch-executor.md)에 기록한다.
- implementation PR/commit: [PR #100](https://github.com/Sangeok/stagekeeper/pull/100),
  구현 `b0b3c27b7b1a2f0009b2c94427a38c8152f13608`, 최종 PR head `427fd7d`,
  dev 병합 `0aec9ab9144f6c9c26c5e39c3321c09771791ddb`(2026-10-02).
- changed files summary: watch 순수 코어·동기화 lib·CLI·메인 대화 스킬 및 시험,
  배너 판정/안내·before-plan/Inbox 문구와 시험, plugin 0.4.0 및 init 안내 판 기대값,
  문구·프로토콜·스펙·검증 계약·구현 보고서. 22개 구현 산출물이며 제안서 자체는 별도다.
- remaining follow-up: V11 실제 브라우저/clipboard/좁은 폭 확인, V12 hosted cache와 실제 설치
  본문 확인·세션 재시작, release/배포 확인, V13 mathgic gate→work→agent_next receipt·110분
  idle 재무장·권한 확인 창·HTTP/모델/Neon/Vercel 비용 관측. 시험 보고서는 이 후속 검증을 위해
  active에 유지한다. 2단계 상주형 구현은 별도 제안·승인 대상이다.

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 실행 계약의 미결 placeholder는 없고 shell 예시의 인자 치환 규칙을 명시했다. 완료 기록은 채웠고 미사용 닫힘 전용 TBD만 유지한다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다.
- [x] `stage`는 pending 문서에서만 사용했다.
- [x] 완료 문서의 `stage`는 null이며 구현 승인 기록과 사용자 완료 기준을 보존했다.
- [x] `proposal-size`는 standard이고 강제 조건(5개 이상 파일, 런타임 side effect)에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용한다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 제안 검증 당시 baseline·초안 결함, 실제 구현 검증 통과, 미실행 후속 인수를 구분했다.
- [x] 잠금·전송·권한·중단·fresh cycle 계약을 inventory/Phase/V1–V13/산출물/DoD/롤백에 반영했다.
- [x] 설정/환경이 없는 stop의 소유권 경계와 §18 툴팁 예시를 구현·검증·완료 조건에 반영했다.
- [x] 설치된 Next.js의 dev/build 출력 분리와 Prisma 생성 경로를 구분해 빌드 절차를 정했다.
- [x] plugin-root의 본문 치환·안전한 인자 전달을 명시하고 셸 환경변수 없는 검증을 계획했다.
- [x] 잔여 리스크를 명시했다.

<!-- doc-validation-skip -->
## Open Questions

Core의 구현 계약은 위에서 결정한다. 아래는 실제 운용 검증 또는 2단계 설계의 입력이며
1단계 구현자가 값을 추측하거나 scope를 넓히는 근거로 사용하지 않는다.

- **운용 관측:** V13에서 운영 Neon/Vercel 사용량·권한 확인 창·재무장 로그를 기록하고 장시간 운용
  비용을 소유자가 확인한다. 지원 CLI는 2.1.287부터 실제 스모크 결과로 넓힌다. 휴대폰 push는
  선택 도구이며 미지원 시 terminal 안내를 사용한다.
- **2단계 설계:** --spawn의 무인 권한 목록·worktree/로그/연속 실패/로그인 자동 시작·서버 heartbeat,
  창 없이 실행할 필요와 무인 push 허용 여부는 별도 제안/승인 대상이다. 1단계의 자동 push 금지와
  서버가 Claude를 실행하지 않는 제품 경계를 이번 문서에서 변경하지 않는다.

<!-- doc-validation-restore -->
