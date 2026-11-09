---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-05"
approved-by: "user"
approved-at: "2026-11-06"
approval-scope: "이 설계 전체의 구현과 PR, 선행 client-init-smoke 수정 PR. 운영 migrate deploy와 main push는 실행 직전에 각각 따로 승인받는다."
completed-at: "2026-11-09"
verification-summary: "#297(dev 머지 cd90876) 뒤 dev ac6a6dd에서 push CI 3개, client-init-smoke 4/4, agent-eval, pipeline-smoke가 녹색이었다. pipeline-smoke는 harnessErrors 0, stepRefusals 0, 649초로 직전 실행(656초, 870초)보다 느려지지 않았다. 운영 마이그레이션 runner_idle_since를 적용했고(36개 up to date), main ac6a6dd의 Vercel 배포가 운영 페이지와 일치했다. 이 PC는 0.6.3 번들로 바꿨고 캐시 2,238개 파일이 모두 일치했다. Windows 로컬 check의 0600 프로필 시험 실패는 바꾸지 않은 커밋에서도 나는 기존 실패다. 출시 뒤 대조에서 감속 단계 경계의 seenAt 기록 누락을 찾아 이 기록 PR에서 고쳤다(서버만, 운영 반영은 다음 main 승격). 실제 잠자기 함수로 잰 신호 지연은 30분 대기에 약 30~35초로 2분 여유 안이다. 운영의 15분·30분 구간은 아직 실기로 보지 않았다."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/protocol.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-11-05-template-release-production-cutover.md"
---

# 실행기 대기 감속: 일이 없을 때 신호 간격을 늘려 운영 DB를 재우기

## Summary

상주 실행기와 watch는 일이 없어도 60초마다 서버를 두 번 부른다. 신호(`/api/runner` beat) 한 번과 `pipeline_next` 한 번이고, 둘 다 운영 DB를 깨운다. Neon은 5분 동안 활동이 없어야 compute를 재우므로, 실행기가 켜져 있는 동안에는 승인을 기다리며 놀고 있어도 운영 compute가 계속 깨어 있다.

이 문서는 점진 감속을 제안한다. 서버가 실행기의 대기 시간을 기억하고, 신호 응답으로 다음 신호까지의 간격을 내려준다. 간격은 처음 10분은 1분, 그다음은 15분, 2시간이 지나면 30분이다. 서버의 점유 판정과 웹 배너도 같은 간격으로 실행기가 살아 있는지 판단하고, 배너는 다음 확인 시각을 보여 준다. 실행기를 하루 종일 켜 두고 일이 없을 때의 compute는 하루 약 6 CU-hours에서 약 1.2 CU-hours로 줄어든다.

## Goal

- 실행기·watch가 오래 켜져 있어도 Neon Free 한도(프로젝트당 월 100 CU-hours)를 넘지 않게 한다. AUTO 파이프라인으로 무인 장시간 실행을 할 수 있어야 한다.
- 일이 끝난 직후 사람이 바로 승인하는 경우의 반응 속도는 지금처럼 유지한다.
- 출시된 플러그인과 서버는 어떤 조합으로 섞여도 동작해야 한다.
- 작업 유형: 런타임 동작 변경, 응답 필드 추가, 추가형 마이그레이션, UI 문구 추가.

## Proposal Size

`proposal-size`: standard

선택 근거:

- Runner 표에 열이 생긴다(마이그레이션). `/api/runner` 응답에 필드가 생긴다.
- 서버, 공용 core, 웹 배너, 플러그인 실행기·watch가 함께 바뀐다(5개 이상 파일).

## Current State

2026-11-05 `origin/dev` `62e68dd` 기준이다.

측정:

- Neon 콘솔(11월 1일부터): production 4.41 CU-hours, dev 0.07 CU-hours다. 하루 약 1 CU-hour라 지금 쓰는 방식이면 월 약 30이다.
- 2026-11-05에 두 브랜치의 compute를 0.25 CU 고정으로 바꿨다. 깨어 있는 1시간은 항상 0.25 CU-hours다.
- 한도를 넘는 것은 깨어 있는 시간이 월 400시간(하루 평균 13시간)을 넘을 때다. 그런 경우는 사실상 실행기나 watch를 종일 켜 두는 경우다.

DB를 깨우는 것과 깨우지 않는 것(코드 확인):

- 깨우지 않는 것:
  - 웹 화면에는 주기적인 새로고침이 없다. `router.refresh()`는 사용자 동작 뒤에만 부른다.
  - 공개 페이지와 `src/proxy.ts`는 JWT 세션이라 DB를 거치지 않는다. 사용자 upsert는 로그인 때뿐이다.
  - Vercel cron은 없다.
  - 하네스 MCP가 연결된 Claude 세션을 하루 종일 열어 둔 2026-11-05에도 운영 compute는 활동이 끝나고 5분 뒤 잠들었다(콘솔 "Suspended 3 minutes ago"). 열린 세션 자체는 DB를 깨우지 않는다.
- 깨우는 것: 실행기·watch의 신호, MCP 호출, 웹에서 하는 실제 작업이다.

상주 실행기(`plugin/runtime/background.mjs`):

- 기본 간격은 `INTERVAL_MS = 60_000`(`:3`)이다.
- 한 사이클은 다음 순서다.
  1. beat(idle 또는 waiting)를 보낸다(`:214`).
  2. paused면 60초 쉰다(`:224`).
  3. `pipeline_next`로 할 일을 본다.
  4. 할 일이 없으면 60초 쉰다(`:236`).
  5. 작업 트리 대기(dirty·branch)도 같은 사이클로 60초마다 서버를 부른다(`:238`–`:248`).
- 실행 중에는 `awaitRun`이 60초마다 beat(working)를 보낸다. 첫 신호는 실행을 시작하자마자 보낸다.
- 잠자기(`sleepActive`, `:155`)는 1초마다 로컬 정지 요청만 본다. 긴 잠자기에도 정지는 1초 안에 반응한다.
- Codex resident도 같은 루프를 쓴다(`plugin/bin/harness-background.mjs`의 `runResident` 호출).

watch(`plugin/bin/harness-watch.mjs`):

- 기본 간격은 60초, 내부 deadline은 110분이다(`:68`). deadline이 지나면 `idle`을 내고, 세션이 조용히 다시 건다.
- 한 사이클은 beat(idle)(`:347`), `pipeline_next`, 그리고 간격만큼 대기(`:384`)다. paused일 때도 같은 간격으로 쉰다(`:358`).
- 일을 찾으면 beat(working)를 보내고 끝난다(`:380`).

서버와 공용 판정:

- 신호 처리(`src/server/runners/runner-service.ts`의 `beatIn`, `:87`)는 토큰 확인과 Runner 행 읽기를 한다. 30초가 지났거나 값이 바뀌면 `seenAt`을 쓴다(`:100`).
- beat 요청 파서(`src/server/rest/runner-handler.ts`)는 허용 필드 목록(`:24`) 밖의 필드가 있으면 요청을 거부한다.
- 플러그인의 응답 해석(`plugin/runtime/runner-client.mjs`, `:67`·`:70`)은 `paused`·`stop`(Codex는 `binding`)만 읽고 다른 필드는 무시한다.
- 실행기 생존 판정(`packages/core/execution/runner.mjs`)은 다음과 같다.
  - working이 아닌 실행기는 `SIGNAL_TIMEOUT_MS = 3분`(`:8`)이 지나면 silent다(`runnerSilenceLimit` `:42`, `runnerStatus` `:47`).
  - 점유(`holdsRunnerLease` `:54`)도 같은 판정을 쓴다.
  - 웹 배너(`src/fsd/widgets/turn-banner/model/runner.ts`의 `runnerLiveness`, `:100`)도 같은 판정으로 "No signal from the runner on {host} for {n} min."(`:31`)을 띄운다.
- 문구의 단일 출처는 `docs/conventions/product-copy.md`다. "No signal"은 3분이라는 규칙이 `:257`에 있다.
- 서버의 "마지막 역할 활동"(`readLastAgentActivityIn`, `runner-service.ts:30`)은 AgentRun을 연 시각과 단계를 시작한 시각만 본다. 역할이 결과를 보고하고 끝난 시각은 들어 있지 않다.

언제 대기하는가:

- head는 `src/server/pipeline/work-run.ts`의 `projectWorkNext`(`:52`)가 정한다. 다음 경우 `none`이다.
  - 새 작업이 멈춰 있을 때(`:55`)
  - 열린 항목이 2개일 때(`:68`)
  - 승인 게이트가 기다릴 때(`:82`)
  - 백로그 변화를 기다릴 때(`:110`)
  - 사용량 한도에 걸렸을 때(`:123`)
- 항목은 `src/server/pipeline/run-rules.ts`의 `decideNext`가 정한다. 승인 게이트를 기다리거나 사용량 한도로 기다린다(`:71`).
- 그 밖에 owner가 실행기를 일시정지했을 때와, 작업 트리가 지저분하거나 다른 브랜치에 있을 때도 대기한다.

## Scope

포함 범위:

- 공용 감속 일정(`packages/core/execution/runner.mjs`, `plugin/lib` 사본)과 생존 판정
- Runner 열 `idleSince`, beat 응답 필드 `nextBeatIn`, 서버의 간격 계산
- 상주 실행기(Claude·Codex)와 watch가 서버가 준 간격을 따르게 하기
- 웹 배너의 "다음 확인" 표시와 product-copy
- 문서: `docs/architecture/protocol.md`, `docs/conventions/product-copy.md`

제외 범위:

- DB를 전혀 거치지 않는 대기 신호(서버 캐시). 이번 결과로 부족할 때 다시 본다.
- 사용자가 고르는 간격 옵션. 사용자가 점진 감속 하나로 정했다(2026-11-05).
- 일하는 중(working)의 신호 간격. 그때는 역할이 MCP를 불러 DB가 어차피 깨어 있다. 실행기는 working 신호에서도 서버가 준 간격을 따르게 해 두고, 서버는 지금처럼 60초를 준다. 나중에 효과를 재 보고 서버만 바꿔 줄일 수 있다.
- 사용량 한도의 `resetAt`에 맞춰 바로 다시 확인하는 기능. compute 절감과 무관하다. 서버가 간격을 정하므로 필요하면 나중에 서버만 바꿔 넣을 수 있다.
- watch를 110분마다 다시 걸 때의 확인 신호. 세션 확인 절차의 의미를 바꿔야 해서 이번에는 그대로 둔다(최악의 경우 월 약 8 CU-hours).
- Neon 설정 변경. 0.25 CU 고정은 이미 했다.

## Proposal

### 사용자 결정(2026-11-05)

- 대기 간격은 점진 감속으로 한다. 처음 10분은 지금처럼 1분, 그 뒤는 15분, 2시간이 넘으면 30분이다.
- 적용 범위는 상주 실행기와 watch 둘 다다.

### 1. 공용 감속 일정

`packages/core/execution/runner.mjs`에 일정과 계산 함수를 둔다. 서버의 간격 계산, 점유 판정, 웹 배너가 같은 함수를 쓴다. `npm run sync:plugin-lib`로 `plugin/lib`에도 복사된다.

| 대기한 시간 | 다음 신호까지 |
| --- | --- |
| 10분 미만 | 60초 |
| 10분 이상 2시간 미만 | 15분 |
| 2시간 이상 | 30분 |

간격이 5분을 넘어야 Neon이 그사이 잠든다. 그래서 두 번째 단계부터 절감이 생긴다. 첫 10분은 일이 끝난 직후 사람이 바로 승인하는 경우의 반응 속도를 지키는 구간이다.

### 2. 서버가 대기 시간을 기억하고 간격을 내려준다

Runner에 `idleSince DateTime?`을 더한다(추가형).

- beat를 받을 때 `idleSince`를 다음과 같이 다룬다.
  - 상태가 idle·waiting인데 지금 행이 working이거나 `idleSince`가 비어 있으면, `idleSince = DB 시각`으로 둔다. 일이 끝나는 전환을 정확히 잡는다.
  - 상태가 working이면 `idleSince`를 비운다.
  - 상태 없는 beat(`harness-session --check`)는 그대로 둔다.
  - `start`는 `idleSince`를 비운다.
- 이 전환은 실제 종료 시점과 맞는다.
  - 상주 실행기는 실행 중 working을 보내고, 끝나면 다음 사이클에서 idle을 보낸다.
  - watch는 일을 찾으면 working을 보내고, 세션이 일을 마친 뒤 다시 걸면 idle을 보낸다. 그래서 메인 루프의 인수 확인 시간도 포함된다.
- 응답에 `nextBeatIn`(정수 초)을 더한다.
  - working이 아니면 `일정(DB 시각 − idleSince)`이다.
  - working이면 60초다.
  - paused여도 같은 일정을 쓴다. paused 실행기는 idle 신호를 보낸다.
- 옛 플러그인은 이 필드를 무시하고 지금처럼 60초마다 신호를 보낸다.

### 3. 생존 판정과 웹 배너

- working이 아닌 행의 마감은 `seenAt + max(3분, 일정(seenAt − idleSince) + 2분)`이다. 마지막 신호에 내려준 간격에 여유 2분을 더한 시각이다.
  - `idleSince`가 비어 있으면 지금과 같은 3분 규칙이다.
  - working 행은 지금과 같다.
  - 점유와 웹 배너는 이 판정을 그대로 따라간다.
- 웹 배너:
  - 대기 중이고 다음 확인이 2분 넘게 남았으면 "next check in about {n} min"을 덧붙인다. 시각은 `seenAt + 일정(seenAt − idleSince)`이다.
  - "No signal" 문구는 그대로 두고, 규칙 설명(product-copy `:257`)을 "3분, 또는 실행기가 받은 다음 확인 시각보다 2분 늦을 때"로 고친다.
- 실행기 view와 turn 데이터에 `idleSince`를 싣는다.

### 4. 상주 실행기(`background.mjs`)

- beat 응답의 `nextBeatIn`을 다음 서버 신호까지의 간격으로 쓴다.
  - 60~3600초 범위만 받아들인다. 범위 밖이면 범위로 자른다.
  - 값이 없으면(옛 서버) 지금처럼 `interval`이다.
- 할 일 없음과 paused의 잠자기를 이 간격으로 바꾼다.
- 실행 중 working 신호의 간격도 같은 규칙으로 정한다. 지금 서버는 60초를 주므로 동작은 그대로다.
- 작업 트리 대기(dirty·branch)는 다음처럼 바꾼다.
  - checkout은 지금처럼 `interval`마다 로컬로 다시 본다. 서버는 받은 간격이 지났을 때만 부른다.
  - 대기가 풀리면 바로 서버를 부른다. 지금의 `cleared` 경로와 같다. 그래야 알림의 약속("커밋하거나 stash하면 이어 간다")이 감속 중에도 지켜진다.

### 5. watch(`harness-watch.mjs`)

- 점유가 있을 때 beat(idle) 응답의 `nextBeatIn`을 사이클 사이 대기로 쓴다. 범위는 상주 실행기와 같다. 남은 deadline보다 길게는 자지 않는다.
- paused 대기도 같은 간격을 쓴다.
- 점유가 없거나 값이 없으면 지금처럼 `interval`이다.
- 대기 시작 시각은 서버가 기억하므로 로컬 잠금 파일은 바꾸지 않는다. 110분마다 다시 걸어도 일정이 이어진다.

### 6. 호환과 배포

요청 필드는 늘지 않는다. 응답 필드만 늘고, 옛 플러그인은 그 필드를 무시한다.

| 서버 \ 플러그인 | 0.6.1 이하 | 새 판 |
| --- | --- | --- |
| 지금 서버 | 지금과 같음 | 간격이 오지 않아 지금처럼 60초 |
| 새 서버 | 60초 그대로. 대기 중 죽으면 끊김 표시가 최대 32분 늦음 | 점진 감속 |

- 배포 순서 제약이 없다. 그래도 평소처럼 main 승격이 서버를 먼저 배포하고, 플러그인은 그 뒤 marketplace update로 간다.
- 플러그인 판은 구현 시점 dev 판의 다음 판이다. 2026-11-06 dev는 #293으로 0.6.2이므로 0.6.3이다.
- 리허설(pipeline-smoke)에서 10분 넘는 무작업 구간이 생겨 CI가 느려지면, CI가 띄우는 서버에서만 환경 변수로 감속을 끈다. 플러그인은 바꾸지 않는다. 승격 게이트에서 소요 시간으로 판단한다. 결과: 게이트에서 느려지지 않아(649초) 이 스위치는 만들지 않았다.

### 대안과 버린 이유

- 실행기가 일정을 계산해 beat 요청에 다음 신호 시각을 싣는 방식:
  - 서버 파서가 모르는 필드를 거부하므로 서버를 반드시 먼저 배포해야 한다.
  - watch의 대기 시작 시각을 로컬 잠금 파일에 새로 저장해야 한다.
  - 간격을 조정할 때마다 플러그인을 다시 출시하고 이 PC 번들도 다시 포장해야 한다.
- DB 열 없이 "마지막 역할 활동"으로 대기 시간을 계산하는 방식: 그 값은 역할을 연 시각과 단계를 시작한 시각만 보고 종료 시각은 보지 않는다. watch의 메인 루프 시간도 빠진다. 그래서 빠른 구간 10분이 실제 종료보다 일찍 시작해, 사용자가 고른 "끝나고 바로 승인하면 지연 없음"이 깨질 수 있다.
- 서버의 대기 중 끊김 판정만 35분으로 늘리는 방식(마이그레이션·프로토콜 변경 없음):
  - 배너가 다음 확인 시각을 보여 줄 수 없다.
  - 죽은 실행기를 알아채는 데 최대 35분이 걸린다.
- 고정 15분, 시작 옵션: 사용자가 점진 감속을 골랐다.
- DB 없는 대기 신호(Vercel Data Cache와 태그 무효화): 토큰 확인까지 캐시해야 하고 폐기 지연 같은 새 위험이 생긴다.
- 서버 푸시나 long-poll: Vercel 서버리스에서는 별도 인프라 없이 할 수 없다.

### 효과 추정(0.25 CU, 실행기를 하루 종일 켜 두고 일이 없는 경우)

| 방식 | 하루 | 한 달 |
| --- | --- | --- |
| 지금(60초) | 6 CU-hours | 약 180(한도 초과) |
| 점진 감속 | 약 1.2 CU-hours | 약 36 |

계산: 처음 10분과 그 뒤 5분은 깨어 있다. 다음 110분은 15분마다 약 5분씩, 나머지 약 21.75시간은 30분마다 약 5분씩 깨어 있다. 합하면 하루 약 4.8시간이다. watch는 110분마다 다시 걸 때의 확인 신호가 더해진다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `packages/core/execution/runner.mjs`, `runner.test.mjs`, `plugin/lib/execution/runner.mjs` | update | 감속 일정, `idleSince` 생존 판정 | medium — 점유와 배너가 같이 바뀐다 |
| `prisma/schema.prisma`, `prisma/migrations/<새 시각>_runner_idle_since/` | update/new | `Runner.idleSince DateTime?` 추가형 | low — nullable |
| `src/server/runners/contracts.ts`, `runner-service.ts`, `runner-service.test.ts`, `tests/server/integration/runner-lease.test.ts` | update | `idleSince` 전환, `nextBeatIn` 응답, view·점유 | medium |
| `src/server/rest/runner-handler.ts`, `.test.ts` | 변경 없음 | 응답 본문을 그대로 내보내서 바꿀 필요가 없었다. 통합 시험 `tests/server/integration/runner-client.test.ts`가 route를 거쳐 `nextBeatIn`을 확인한다. 요청 파서는 그대로다 | low |
| turn 데이터 경로와 `src/fsd/widgets/turn-banner/model/runner.ts`, `runner.test.ts`, `ui/turn-banner.test.ts` | update | `idleSince` 전달, 생존 판정, "next check" 줄. 문구는 두 시험이 고정한다 | low |
| `plugin/runtime/runner-client.mjs`, `runner-client.test.mjs` | update | `nextBeatIn` 읽기와 범위 자르기 | low |
| `plugin/runtime/background.mjs`, `plugin/bin/harness-background*.test.mjs` | update | 받은 간격으로 잠자기, 작업 트리 대기의 로컬 확인 | high — 무인 실행 루프 |
| `plugin/bin/harness-watch.mjs`, `harness-watch.test.mjs` | update | 받은 간격으로 사이클 대기 | medium |
| `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | update | 판 상승 | low |
| `docs/architecture/protocol.md`, `docs/conventions/product-copy.md` | update | 계약과 문구 | none |

실제로 바뀐 파일:

- #297은 27개 파일을 바꿨다. 위 표에 없는 시험 세 개도 들어 있다. `src/fsd/pages/project-list/ui/project-list-page.test.mjs`, `src/fsd/widgets/turn-banner/api/turn-data.test.ts`, `tests/server/integration/runner-client.test.ts`다.
- 이 기록 PR은 경계 기록 수정으로 `src/server/runners/runner-service.ts`, `runner-service.test.ts`, `docs/architecture/protocol.md`를 더 고쳤다.

## Safety Analysis

확인할 항목:

- [x] 앱 진입점과 라우팅 경계: 라우트 변경은 없다. `/api/runner`의 응답만 늘어난다.
- [x] 정적 `import` / `export from`: core에 새 export가 생긴다. `npm run sync:plugin-lib` 뒤 `plugin-lib.mjs --check`(드리프트 검사)를 통과해야 한다. 결과: `npm run check`의 드리프트 검사를 로컬과 PR CI에서 통과했다.
- [x] dynamic `import()` 또는 lazy loading: 없음.
- [x] barrel export 경유 참조: turn-banner의 공개 API로만 쓴다.
- [x] 테스트와 스크립트 참조: 실행기 루프 시험은 가짜 시계를 쓴다. 받은 간격대로 자는지 단언하도록 고친다. pipeline-smoke는 무작업 구간이 10분을 넘으면 느려질 수 있어 승격 게이트에서 확인한다. 결과: 실행기와 watch 시험 5개를 더했고 옛 코드에서 실패하는 것을 확인했다. pipeline-smoke는 649초로 느려지지 않았다.
- [x] 정적 자산 URL: 없음.
- [x] 타입 선언: `RunnerRecord`, `RunnerOpResult`의 beat 응답, `TurnRunner`에 필드가 늘어난다. 결과: `tsc --noEmit`을 통과했다.
- [x] 런타임 side effect: 대기 중 서버 호출이 줄고, 일시정지 해제의 서버 반영이 받은 간격만큼 늦어질 수 있다. 로컬 정지 반응은 1초 그대로다. 결과: 시험으로 확인했고 긴 잠자기의 신호 지연을 실측했다. 출시 뒤 대조에서 단계 경계의 기록 누락을 찾아 고쳤다(Verification Results).
- [x] API·외부 SDK: `/api/runner` beat 응답에 필드가 추가된다. 요청 계약은 그대로다.
- [x] 출시된 판과의 조합: 위 표의 네 조합을 시험한다. 특히 옛 판 응답 해석이 새 필드를 무시하는지와, 새 판이 필드 없는 응답에서 60초로 도는지다. 결과:
  - 새 판과 옛 서버: runner-client 시험(값이 없거나 잘못되면 버림)과, 응답에 값이 없는 기존 실행기·watch 시험이 60초로 도는 것으로 확인했다.
  - 옛 판과 새 서버: 0.5.33, 0.6.1, 0.6.2의 runner-client가 응답에서 `ok`·`paused`·`stop`·`binding`만 골라 쓰는 것을 코드로 확인했다. 옛 코드를 실제로 돌려 보지는 않았다.

## Approval

승인 기록은 front matter가 기준이다(2026-11-06 사용자 "진행해").

필요한 승인:

1. 이 설계 전체(구현과 PR).
2. 운영 마이그레이션(`migrate deploy`)과 main push는 실행 직전에 각각 따로 승인받는다.

## Execution Plan

1. 선행 작업: client-init-smoke의 update 시나리오가 이전 판이 0.6 이상이면 전환부터 하도록 고친다(TPL4 후속). 2026-11-06에 확인해 보니 다른 세션의 #293(`83b8e78`)이 이미 dev에 넣었다.
2. core 감속 일정과 생존 판정을 바꾸고 시험을 쓴다(먼저 실패를 확인).
3. 서버: 마이그레이션, `idleSince` 전환, 응답 필드, view, 배너와 문구를 바꾸고 시험을 쓴다.
4. 플러그인: 응답 해석, 상주 실행기, watch를 바꾸고 시험을 쓴다. 판을 올린다.
5. 문서: protocol.md, product-copy.md.
6. 로컬 검증, PR, CI.
7. 승격 게이트(dev), 운영 `migrate deploy`(승인), main push(승인), 배포 대조.
8. 이 PC의 Windows 번들을 새 판으로 패키징·설치하고, 일주일 뒤 Neon Usage로 효과를 확인한다.

## Verification Plan

실행할 검증:

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm test
npm run test:server
TEST_DATABASE_URL=<local PostgreSQL> npm run test:server:integration
npm run build
npm run verify:plugin-version
gh workflow run client-init-smoke.yml --ref dev
gh workflow run agent-eval.yml --ref dev
gh workflow run pipeline-smoke.yml --ref dev
node --env-file=<production env file> node_modules/prisma/build/index.js migrate status
```

검증 기준:

- 감속 일정의 경계(9분 59초, 10분, 1시간 59분 59초, 2시간)가 표와 같다.
- 서버:
  - working → idle 전환에서 `idleSince`가 생기고, working에서 비고, 상태 없는 beat에서는 그대로다. `start`는 비운다.
  - 응답의 `nextBeatIn`이 일정과 같다.
  - 실행기는 마감까지 점유를 갖고, 그 뒤에는 takeover할 수 있다.
- 상주 실행기:
  - 받은 간격마다만 서버를 부르고, 값이 없거나 범위 밖이면 규칙대로 처리한다.
  - 작업 트리 대기는 로컬로 자주 보고, 풀리면 바로 서버를 부른다.
  - 정지 요청에는 1초 안에 반응한다.
- watch: 받은 간격으로 대기하고 deadline을 넘기지 않는다. 옛 서버 응답에서는 60초다.
- 배너: 대기 중에 live이고 "next check in about {n} min"을 보인다. 마감이 지나면 "No signal"이다. `idleSince`가 없는 행은 지금과 같다.
- 승격 게이트가 모두 녹색이다. pipeline-smoke의 소요 시간이 직전 실행과 크게 다르지 않다.
- 기존 실패와 신규 실패는 같은 명령을 `origin/dev`에서 한 번 돌려 구분한다.

## Verification Results

### 로컬과 PR CI

로컬은 2026-11-06 Windows, worktree `harness/runner-idle-backoff`, 기준 dev `62e68dd`이다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm test` | 617 pass, 0 fail | core 감속 일정·생존 판정 4개, runner-client 1개, 상주 실행기 4개, watch 1개를 더했다 |
| `npm run test:web` | 800 pass, 0 fail | 배너 "next check" 시험을 더했다 |
| `npm run test:server` | 176 pass, 0 fail | |
| `node --import tsx --test src/server/runners/runner-service.test.ts` | 31 pass | `idleSince` 전환, `nextBeatIn`, 점유 시험 3개를 더했다 |
| 옛 코드 대조 | 새 시험 실패 확인 | `background.mjs`와 `harness-watch.mjs`만 `origin/dev`판으로 바꾸면 새 실행기 시험 4개와 watch 시험 1개가 실패하고, 되돌리면 통과한다 |
| `npm run check` | 1 fail(기존) | `scripts/templates/template-release-cli.test.ts`의 0600 프로필 시험이다. 바꾸지 않은 본 checkout `3e69c58`에서도 같은 오류(`Template profiles must be private regular files outside the repository`)로 실패하는 Windows 전용 기존 실패다. 린트 경고 1개는 바꾸지 않은 `plugin/runtime/codex-main-loop-tools.mjs`다. 문서 검사, FSD·서버 경계, 타입 검사는 통과했다 |
| `npm run test:server:integration` | PR CI 통과 | `check (server-integration)`에서 실행했다. `runner-lease.test.ts`에 `idleSince`·점유 시험을 더했다 |
| `npm run build` | PR CI 통과 | `check (build)` |
| PR #297 CI | 전부 통과 | check 6개, Windows native-runtime, macOS runtime contracts 2개, Claude 설치 4개, Vercel |

`npm run check`는 `lint`(FSD·서버 경계 포함)와 `test:scripts`(`test:architecture` 범위 포함)를 함께 돌린다.

### 승격 게이트와 운영 반영

승격 대상은 dev `ac6a6dd`이다. #297과, 문서 하나만 더한 #296이 들어 있다.

| 단계 | 결과 | 비고 |
| --- | --- | --- |
| dev push CI | 녹색 | check 42118925618, windows-role-runtime 42118925470, macos-runtime-contracts 42118926018 |
| `npm run verify:plugin-version -- --base origin/main --head origin/dev` | 통과 | 0.6.2 → 0.6.3, 배포 파일 6개. 2026-11-09 main push 직전에 다시 돌렸다 |
| client-init-smoke | 4/4 녹색 | run 42119020619. windows-2022와 macos-15에서 각각 new-user와 update |
| agent-eval | 녹색 | run 42119025536. 첫 시도는 macOS 작업이 러너를 받지 못해 단계 0개로 취소됐다(`job was not acquired by Runner`). 실패한 작업만 다시 돌려 통과했다. 비용 추정 $4.80 |
| pipeline-smoke | 녹색 | run 42121937637. harnessErrors 0, stepRefusals 0, 48턴, 권한 거부 0, $1.49, 649초(완료까지 10분). 직전 dev `62e68dd` 실행은 656초와 870초였다 |
| 운영 `migrate deploy` | 적용 | `20261106000000_runner_idle_since`, 2026-11-05T22:45:34Z, 10.5초. 2026-11-09 main push 직전의 `migrate status`는 36개 up to date였다 |
| main push | 완료 | 2026-11-09T05:35:39Z, `62e68dd..ac6a6dd` fast-forward |
| 운영 배포 대조 | 일치 | Production deployment 7647837821. 운영 HTML의 `dpl_4CV1dAKtzKGb6SnD8P2hd7PU1yiF`가 main push의 Vercel 상태 id와 같다. `/` 200, `/api/mcp` 401. main push의 check 42568208988 녹색 |
| 이 PC 번들 0.6.3 | 설치 | 아래 참고 |
| 운영 실기와 Neon 효과 | 아직 | Completion or Closure Notes의 후속 항목 |

이 PC 번들:

- `ac6a6dd` detached worktree에서 패키징했다. 2,238개 파일, packageSha256 `a96de899…`이다.
- runtime은 설치본(`0148976b…`)을 재사용했다. 설치본 원본 `3e69c58`과 `ac6a6dd` 사이에 `plugin/runtime/windows`, `scripts/windows`, 검증 스킬, `windows-role-runtime.yml` 변화가 없다. verifier는 `de1120a5…`(7파일) 그대로다.
- 0.6.1 설치본 대비 inventory 차이는 10개다. 7개는 git의 배포 파일 변경과 같다. 0.6.2의 `transitions.mjs`가 여기에 포함된다. 나머지 3개(`work-selection.mjs`, `request-rate.mjs`, `file-ownership.mjs`)는 줄바꿈만 다르다. 0.6.1을 묶은 checkout에서 이 셋만 LF로 다시 써져 있었고, 새 번들은 다른 파일처럼 CRLF다.
- marketplace와 plugin update(user scope 0.6.1 → 0.6.3) 뒤 캐시 0.6.3은 2,238개 sha256이 모두 일치했다. inventory 밖 파일은 `windows-package.json`뿐이다. launcher는 런타임 검증 뒤 JSON `session-refused`로 응답했다. 0.6.1 번들은 롤백용으로 남겼다.

### 출시 뒤 대조와 후속 수정(2026-11-09, 이 기록 PR)

완료 기록을 쓰며 본문과 출시된 코드를 다시 대조했다.

단계 경계의 seenAt 기록 누락:

- `beatIn`은 상태가 그대로이고 직전 기록이 30초 안이면 `seenAt`을 쓰지 않는다. 그런데 응답의 `nextBeatIn`은 그 순간 DB 시각으로 계산하고, 생존 판정은 저장된 `seenAt`으로 간격을 다시 계산한다.
- 상태 없는 확인 신호(`harness-session --check`) 뒤 30초 안에 같은 상태의 신호가 오고 그 사이에 대기 시간이 10분이나 2시간을 넘으면, 실행기는 15분(30분)을 받고 마감은 3분(17분)으로 남는다. 공용 함수로 계산하면 약 12분(13분) 동안 실행기가 끊긴 것으로 보인다.
- 평소 흐름에서는 생기지 않는다.
  - 확인 신호를 부르는 훅은 없다.
  - watch를 처음 걸면 대기 시계도 그때 시작하고, 다시 거는 것은 110분마다다.
  - 상주 실행기는 `--once` 작업을 시작할 때 확인 신호를 보내지만, 그때는 이미 working이다.
  - 대기를 시작한 1초 뒤의 신호는 idle에서 waiting으로 바뀌는 신호라 항상 기록된다.
  - 사용자가 아무 때나 확인한 순간이 경계와 겹칠 때만 생긴다.
- 수정: 대기 시간이 감속 단계를 넘긴 beat는 30초 안이어도 쓴다(`runner-service.ts`). protocol.md의 기록 규칙도 고쳤다. 서버만 바뀌고 플러그인 판은 그대로다.
- 시험: `runner-service.test.ts`에 10분과 2시간 경계 시험을 더했다. 알린 다음 신호 시각에 `runnerStatus`가 live여야 한다. 고치기 전 코드에서는 `seenAt`이 1초 전 값으로 남아 실패했고, 고친 뒤 32개가 모두 통과했다.

긴 잠자기의 신호 지연(이 PC, OneDrive 저장소의 `.git` 아래에서 1분 측정):

- 상주 실행기는 잠자는 동안 매초 `withGuard`로 상태 파일을 읽는다. 실제 `withGuard`로 재면 분당 약 1초가 늦어졌다(가드 호출 최대 15ms).
- 대기 중 매분 하는 `git status`는 0.14초였다.
- 그래서 30분 대기에서 신호는 약 30~35초 늦게 가고, 서버의 여유 2분 안이다.
- watch는 사이클 시작 시각 기준으로 자므로 지연이 쌓이지 않는다.

이 PR의 로컬 검증(Windows, `ac6a6dd` 기준):

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `runner-service.test.ts` | 32 pass | 새 경계 시험 포함 |
| `npm run test:server` | 실패 0(통과 176, 건너뜀 2) | `--test-concurrency=2` |
| `npm run test:web` | 801 pass, 0 fail | `--test-concurrency=2` |
| `npm run check` | 1 fail(기존) | 위와 같은 Windows 전용 0600 프로필 시험이다. 린트(FSD·서버 경계 포함), 문서 검사, `plugin/lib` 동기화, 타입 검사는 통과했고, 린트 경고 1개는 바꾸지 않은 파일이다 |
| `npm run build` | PR CI에 맡김 | 본 checkout에서 다른 세션의 `next dev`가 돌고 있었고 여유 메모리가 1.6GB였다 |

## Risks and Rollback

잔여 리스크:

- 2시간 넘게 일이 없던 실행기는 승인 뒤 최대 30분, 10분 넘게 일이 없던 실행기는 최대 15분 늦게 이어 간다. 배너의 "next check" 표시로 알 수 있다. 바로 이어 가려면 watch를 다시 걸거나 실행기를 다시 시작한다.
- 실행기가 긴 대기 중에 죽으면 점유가 최대 32분 남는다. 새 실행기는 지금처럼 takeover로 가져올 수 있다. 업데이트하지 않은 옛 플러그인도 대기 중에 죽으면 같다.
- pipeline-smoke에서 10분 넘는 무작업 구간이 생기면 CI가 느려질 수 있다. 그러면 CI가 띄우는 서버에만 감속을 끄는 스위치를 넣는다. 이번 게이트에서는 느려지지 않아 만들지 않았다.
- 다음 main 승격 전까지 운영 서버에는 단계 경계의 seenAt 기록 누락이 남아 있다. 드물게 생기며, 생기면 약 12~13분 동안 "No signal"이 뜨고 그 사이 점유가 빈다.
- 효과는 실행기를 오래 켜 둘 때만 크다. 지금 사용 방식(월 약 30)에서는 차이가 작다.

롤백 방법:

- 서버만 이전 배포로 되돌려도 된다. 새 플러그인은 간격이 오지 않으면 60초로 돈다. 새 열은 nullable이라 옛 서버가 무시한다.
- 플러그인은 이 PC를 옛 번들로 되돌린다. 다른 설치는 이전 판을 다시 내보낸다(판 재상승).
- 마이그레이션은 추가형이라 그대로 둔다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-11-09
- verification-summary: front matter와 Verification Results를 따른다.
- implementation PR/commit:
  - #297(구현, 커밋 `974f41c`, dev 머지 `cd90876`)
  - main `62e68dd` → `ac6a6dd`
  - 이 기록 PR(단계 경계의 seenAt 기록 수정 포함)
- changed files summary:
  - #297은 27개 파일을 바꿨다. core 감속 일정과 생존 판정, `Runner.idleSince` 추가형 마이그레이션, beat 응답의 `nextBeatIn`, 배너의 "next check" 줄과 문구, 플러그인의 runner-client·상주 실행기·watch, 판 0.6.3, `protocol.md`·`product-copy.md`다.
  - 이 기록 PR은 `runner-service.ts`(쓰기 조건), `runner-service.test.ts`(경계 시험), `protocol.md`(기록 규칙)를 바꿨다.
  - 운영 DB에 `Runner.idleSince` 열이 생겼다. 이 PC는 플러그인 0.6.3으로 바뀌었다.
- remaining follow-up:
  - 경계 기록 수정은 따로 승격하지 않고 다음 main 승격 때 운영에 나간다. 서버만 바뀌어서 게이트는 client-init-smoke와 판 검사다.
  - 운영에서 15분 간격을 한 번 실기로 확인한다. 지금까지는 시험으로만 확인했고, pipeline-smoke에는 10분 넘는 무작업 구간이 없다.
    - 방법: 새 작업을 멈추고 열린 항목이 없는 프로젝트에서 0.6.3 상주 실행기를 30분쯤 켜 둔다. 배너의 "next check in about 15 min"과 Neon의 Suspended를 본다.
    - 새 작업이 켜져 있고 마지막 작업 실행 뒤 백로그 입력이 바뀌었으면, 할 일이 없어도 work-discoverer가 dispatch된다(`work-run.ts` `projectWorkNext`). 그러면 Claude가 실제 항목을 만들 수 있다.
    - 배너를 새로고침하면 DB가 깨므로 배너는 한 번만 본다.
  - Neon Usage는 매달 본다. 기준선은 2026-11-01~05의 하루 약 1 CU-hour다. 실행기를 켠 시간에 따라 달라지므로 감속 효과를 재는 근거로는 약하다.

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [x] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [x] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
