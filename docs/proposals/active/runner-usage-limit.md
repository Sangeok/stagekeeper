---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-10"
approved-by: "user"
approved-at: "2026-11-10"
approval-scope: "설계와 새 문구(Windows 알림, 상태 문장, 배너 두 줄, 결과 한 줄), 구현, 커밋, PR. main 승격과 이 PC 번들 설치는 실행 직전에 각각 따로 승인받는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "plugin/runtime/background.mjs"
  - "docs/architecture/protocol.md"
  - "docs/conventions/product-copy.md"
---

# 상주 실행기가 Claude 사용 한도에서 멈추지 않고 기다렸다가 잇게 하기

## Summary

2026-11-10 harness-smoke ITEM-04 실기 중에 Claude 구독의 5시간 한도(HTTP 429)에 걸렸다. 상주 실행기는 인수 직전에 끊긴 실행을 "done: 0 turns"로 기록했다. 이어서 새 실행을 세 번 띄웠고, 모두 같은 한도로 곧바로 실패했다. 그러자 오류 3회 규칙으로 멈추고 "It hit an error"라는 알림만 남겼다. 소유자는 실행 로그를 열어야 원인을 알 수 있었고, 한도가 풀린 뒤 손으로 다시 켜야 했다. 무인 진행이라는 상주 실행기의 목적과 어긋난다.

이 문서는 실행기가 Claude Code의 구조화된 한도 신호(`rate_limit_event`의 `status:"rejected"`와 `resetsAt`)를 읽게 하자고 제안한다. 한도로 끝난 실행은 실패로 세지 않는다. 해제 시각까지 새 실행을 띄우지 않고 기다렸다가 그대로 잇는다. 소유자는 Windows 알림 한 번, `--status`, 웹 배너 한 줄로 이유와 재개 시각을 본다. 서버 계약과 DB는 바꾸지 않는다.

## Goal

- 한도에 걸려도 실행기가 멈추지 않는다. 해제 뒤 사람 손 없이 이어 간다.
- 소유자가 이 PC에서도 웹에서도 "Claude 한도 때문에 기다리는 중이고, 언제 다시 시작한다"를 안다.
- 다른 실패(비정상 종료, 시간 초과, 진전 없음)의 3회 정지 규칙과 알림은 그대로다.
- 작업 유형: 플러그인 런타임 동작 변경, 웹 배너 한 줄, 문구와 계약 문서, 판 상승.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 상주 실행기의 실패 판정과 대기 동작이 바뀐다. 무인 실행 경로 전체에 영향이 있다.
- 플러그인, 공용 모듈, 웹 배너, 문서, 매니페스트 두 개로 5개 이상 파일이 바뀐다.

## Current State

2026-11-10 `origin/dev` `84c1c22` 기준이다.

실행기 코드(`plugin/runtime/background.mjs`):

- `readStreamLine`은 stream-json에서 `system init`과 `result`만 읽는다. `result`가 여러 번 오면 마지막 것으로 덮는다. 읽는 필드는 `subtype`, `is_error`, `num_turns`, `terminal_reason`, `permission_denials`다.
- `classifyRun`은 `!isError && subtype === "success"`면 성공 "done: {n} turns, {n} denied"로 본다. 결과가 있으면 그 밖은 "error: {subtype} ({terminal})"이다.
- `runResident`는 성공이 아닌 실행마다 `failures`를 하나 올린다. 3회(`FAILURE_LIMIT`)면 멈춘다(`stuck`이나 `error`). 실패한 실행 뒤에는 기다리지 않고 바로 다음 사이클로 간다.
- 대기는 `dirty`와 `branch` 두 가지다. 상태는 `waiting`이고, 알림은 대기 하나에 한 번이다.

실기 증거(2026-11-10, Claude Code 2.1.318, harness-smoke `.git/harness/runs/`):

- 한도에 걸린 실행의 stream:
  - `rate_limit_event`의 `rate_limit_info`에 `status:"rejected"`, `resetsAt:1794302400`(09:20Z, 18:20 KST), `rateLimitType:"five_hour"`가 있었다.
  - 이어서 `assistant` 이벤트(`error:"rate_limit"`, `api_error_status:429`, 사람이 읽는 "You've hit your 5-hour limit · resets 6:20pm (Asia/Seoul)")가 왔다.
  - 마지막은 `result`(`is_error:true`, `api_error_status:429`, `terminal_reason:"api_error"`)였다.
- 한도 전에는 같은 이벤트가 사용량을 알린다. 평소에는 `status:"allowed"`이고, 90%를 넘으면 `"allowed_warning"`이다(`utilization` 0.98, 0.99).
- 인수 직전에 끊긴 실행은 429 `result` 뒤에 `system init`과 `result`(`is_error:false`, `num_turns:0`, 빈 결과)가 한 번 더 왔다. 마지막 결과만 읽기 때문에 "done: 0 turns"로 기록됐다.
- 서버와 데이터는 온전했다. 한도가 풀린 뒤 실행기를 다시 켜자 인수와 문서 감사가 이어졌다.

서버와 웹:

- 서버는 `lastResult`를 150자(`RUNNER_RESULT_MAX`) 이하의 문자열로 받기만 하고 형식을 보지 않는다(`src/server/rest/runner-handler.ts`).
- 대기 사유는 계약(`RUNNER_WAIT_REASONS`)과 DB CHECK(`Runner_wait_check`)가 `dirty`와 `branch`로 묶는다.
- 웹 배너(`src/fsd/widgets/turn-banner/model/runner.ts`)는 `lastResult`를 보여 주지 않는다. 다만 로그인 거부 코드를 `lastResult`에서 꺼내 쓴다(`signinCode`, `turn-data.server.ts`).
- 문구 규칙(`product-copy.md`)은 결과 한 줄이 고정 낱말만 쓰고 모델의 글을 담지 않는다고 정한다. 이 절의 문구는 소유자 확인을 받는다.
- `packages/core/execution/runner.mjs`는 `plugin/lib/execution/runner.mjs`로 복사되고 `scripts/plugin-lib.mjs --check`가 같음을 본다.

## Scope

포함 범위:

- 실행기가 한도 신호를 읽고, 한도로 끝난 실행을 실패로 세지 않고, 해제까지 기다렸다가 잇는다(Claude 실행기).
- 결과 한 줄 "limited: …"의 형식과 해석을 공용 모듈에 둔다.
- Windows 알림 한 줄, `--status`의 재개 시각과 스킬의 상태 안내, 웹 배너의 대기 한 줄.
- pipeline-smoke 리허설이 한도 대기를 곧바로 실패로 알아보게 하기.
- 시험, 계약 문서, 문구, 판 상승(PR 시점의 dev 판 + 1, 지금은 0.6.6).

제외 범위:

- Codex 실행기. 자기 실행 어댑터와 다른 한도 신호를 쓴다. 필요하면 따로 한다.
- 대화형 `/harness:watch` 세션의 한도. 그 세션 자체가 멈추고 소유자가 보고 있다.
- 서버 계약·DB(새 대기 사유와 CHECK 변경), Stagekeeper 자체 플랜 한도(`USAGE_LIMIT_REACHED`).
- 90% 경고(`allowed_warning`)에서 미리 멈추기. 끊긴 실행도 서버 상태로 이어지므로 이득이 적다.
- 실행 안에서 기다리기(`CLAUDE_CODE_RETRY_WATCHDOG`). 대안 절에 적은 이유로 후속으로 둔다.
- 2026-11-10 실기의 다른 관찰. 메인 루프가 건 보류에 "dev's note" 이름표가 붙는 것, R0에 고정된 작업 실행이 R1 재init 뒤 새 일 선택을 막는 것이다. 이 둘은 따로 다룬다.

## Proposal

### 1. 한도 판정

`readStreamLine`이 다음을 더 읽는다.

| 신호 | 기록 |
| --- | --- |
| `result`의 `api_error_status === 429` | `run.limited = true`. 뒤에 오는 결과가 지우지 않는다 |
| `rate_limit_event`의 `rate_limit_info.status === "rejected"` | `run.limitReset = { resetsAt, type }`(`resetsAt`은 초 단위 epoch, `type`은 `rateLimitType`). 마지막 것을 쓴다 |

판정 기준은 "어느 턴이 429로 끝났는가"다. `rejected` 이벤트는 해제 시각만 준다. `rejected`가 나왔어도 429로 끝난 턴이 없으면(예: CLI가 다른 모델로 넘어가 끝까지 간 실행) 지금처럼 판정한다.

`classifyRun`은 `limited`를 가장 먼저 본다.

- 결과: `{ outcome: "limited", line, resumeAt }`
- `resumeAt`: `resetsAt`이 지금부터 8일 안의 미래면 `resetsAt` + 60초, 아니면 지금 + 30분.
- `line`: `limited: Claude usage limit until {YYYY-MM-DDTHH:MMZ}`. 고정 낱말과 UTC 분 단위 시각이다. 사람이 읽는 원문("resets 6:20pm (Asia/Seoul)")은 해석하지 않는다.

공용 모듈(`packages/core/execution/runner.mjs`, 플러그인 사본 포함)에 `limitedResult(resumeAt)`과 `limitedUntil(lastResult)`를 둔다. 실행기는 앞의 것으로 쓰고, 웹은 뒤의 것으로 읽는다.

### 2. 실행기 동작

`runResident`가 `outcome === "limited"`를 따로 다룬다. `execution.classify`의 결과에 `outcome: "limited"`와 `resumeAt`이 더해지는 것이다. 진행 중인 Codex 상주 실행기 계획(`codex-resident-runner-plan.md`)이 적은 결과 집합(success, error, timeout, branch, cancelled)에 값 하나를 더한다. Codex 어댑터는 이 값을 내지 않으므로 동작이 바뀌지 않는다.

- `failures`와 진전 판정에 넣지 않는다. 앞선 실패 횟수도 그대로 둔다.
- `limitedUntil = resumeAt`을 정하고 상태(`background.json`)에 저장한다. 이 대기에 처음 들어갈 때 알림을 한 번 띄운다.
- 결과 beat는 지금처럼 `state:"idle"`과 `lastResult`(위 한 줄)를 보낸다.
- 다음 사이클부터 `limitedUntil` 전까지는 `pipeline_next`를 부르지 않고 새 실행도 띄우지 않는다. beat(idle)는 서버가 준 간격대로 보내되, `limitedUntil`이 더 가까우면 그때 깬다. 멈춤·교체 요청은 지금처럼 1초마다 본다.
- `limitedUntil`이 지나면 평소 사이클로 돌아간다. 다시 한도에 걸리면(주간 한도 등) 새 시각으로 같은 대기를 한다.
- 끊긴 실행이 미커밋 변경을 남겼으면, 해제 뒤 첫 사이클의 기존 `waitInterrupted` 대기가 다룬다.

### 3. 소유자에게 보이는 것

모두 새 문구이며, 이 절의 다른 문구처럼 소유자 확인을 받는다.

| 곳 | 문구 |
| --- | --- |
| Windows 알림(처음 한 번) | 제목 `Runner waiting for Claude`, 본문 `Claude's usage limit was reached. The runner continues after {time}.`({time}은 이 PC의 시각 HH:MM) |
| `--status` | JSON에 `limitedUntil`(ISO). 결과 한 줄은 위의 `limited: …` |
| `/harness:background` 스킬의 상태 안내 | `--status`를 읽어 주는 문장에 한도 대기와 재개 시각을 더한다(`plugin/skills/background/SKILL.md`) |
| 웹 배너 긴 줄 | `Runner on {host} is waiting for Claude's usage limit and continues in about {n} min.`(1시간 이상이면 `{n} h`) |
| 웹 배너 짧은 줄 | 기존 `Runner: waiting on {host}` |

웹은 `turn-data.server.ts`가 `lastResult`에서 `limitedUntil`을 꺼내 `TurnRunner`에 싣는다(`signinCode`와 같은 방식). 배너 모델은 실행기가 살아 있고(`live`), 상태가 `idle`이며, `limitedUntil`이 아직 오지 않았을 때만 위 줄을 쓴다. 시각이 지나면 평소 줄로 돌아간다. 실행기가 멈췄거나 신호가 끊겼으면 기존 줄이 우선한다.

### 4. pipeline-smoke 리허설

리허설은 `--status`로 실행기 상태를 읽어 판정한다(`scripts/rehearsals/pipeline-smoke-steps.mjs`의 `waitVerdict`). 지금은 한도에 걸린 실행기가 멈추므로 `runner-ended`로 곧바로 실패한다. 이 변경 뒤에는 실행기가 멈추지 않는다. 그대로 두면 리허설이 대기 마감(배정 20분, 완료 60분)까지 기다린 뒤 원인이 보이지 않는 시간 초과로 실패한다.

- `waitVerdict`가 실행기 상태의 `limitedUntil`을 보면 곧바로 `claude-usage-limit` 단계로 실패시킨다.
- 요약에 싣는 실행 결과 줄의 허용 형식(`RUN_LINE`)에 `limited: …`를 더한다. 더하지 않으면 요약에서 그 줄이 빠진다.
- 이 실패는 AGENTS.md가 말하는 "변경 밖 원인"이라 한 번 다시 돌릴 수 있는 경우다.

### 5. 문서

- `protocol.md` "상주 실행기"의 한 사이클 설명에 한도 판정과 대기를 더한다. 결과 한 줄 목록에 `limited: …`를 더한다.
- `product-copy.md` 상주 실행기 절의 알림 표와 결과 한 줄 목록, §5 배너 runner 줄에 위 문구를 더한다.

### 대안과 버린 이유

- 지금처럼 멈추되 알림만 고친다: 사람이 다시 켜야 하는 문제가 남는다.
- 사람이 읽는 원문 "resets 6:20pm (Asia/Seoul)"을 해석한다: 언어, 시간대, 형식이 바뀌면 깨진다. 같은 stream에 구조화된 `resetsAt`이 있다.
- 새 대기 사유 `limit`(state `waiting`): 서버 계약, DB CHECK 마이그레이션(운영 쓰기), 배너를 함께 바꿔야 한다. 같은 표시를 `lastResult`로 마이그레이션 없이 할 수 있고, `signinCode` 선례가 있다.
- 웹 표시 없이 실행기만 고친다(더 작은 안): 무인 실행기를 웹으로 보는 소유자는 몇 시간 동안 "running in the background"만 보고, 일이 왜 안 움직이는지 모른다. 웹 줄 하나가 그 공백을 메운다. 승인 때 이 안으로 줄일 수 있다.
- 일정 간격으로 계속 실행을 다시 띄워 본다: 한도 중에는 실행마다 실패만 쌓이고 서버를 매번 깨운다.
- 실행 안에서 기다리기(`CLAUDE_CODE_RETRY_WATCHDOG=1`): 한도에 걸린 요청이 실패하지 않고 해제까지 기다렸다가 같은 단계를 이어 간다. 끊긴 실행이 미커밋 변경을 남기는 경우까지 없앨 수 있다. 이 제안에서는 하지 않고 후속으로 둔다.
  - 확인한 것(이 PC의 CLI 2.1.322 코드, 2026-11-10): 구독 한도 거부(`anthropic-ratelimit-unified-status: rejected`)를 기다리는 경로가 따로 있다. 기다리는 동안 stream에 `system`/`api_retry`(`error_status: 429`, `retry_delay_ms`)를 30초마다 낸다. 대기 상한 설정(`CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS`, `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS`)이 있다.
  - 확인하지 못한 것: 이 계정의 한도 응답에서 실제로 기다리는지다. 곧바로 실패하는 조건(`x-should-retry: false`, 추가 사용량 상태가 실린 일부 응답 형식)이 있고, 그 값은 실제 한도 응답에서만 보인다.
  - 켜면 함께 바뀌는 것: 529와 다른 일시 오류도 훨씬 오래 다시 시도한다. 기다리는 실행을 2시간 상한이 끝내지 않게 해야 한다. 그동안 서버 신호를 대기 간격으로 늦추려면 새 대기 사유(계약과 DB CHECK)가 필요하다. `--stop`은 진행 중인 실행을 기다리므로, 몇 시간짜리 대기를 따로 끝내는 규칙도 필요하다.
  - 그래서 실제 한도에서 한 번 관찰한 뒤 따로 제안한다. 관찰은 코드 변경 없이 할 수 있다(실행기를 시작하는 셸에 환경 변수를 준다). 이 제안의 판정과 실행 밖 대기는 그때도 안전망으로 남는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `plugin/runtime/background.mjs` | update | 한도 판정(`readStreamLine`, `classifyRun`), 대기(`runResident`), 알림 | medium — 무인 실행의 실패 판정이 바뀐다 |
| `plugin/bin/harness-background-loop.test.mjs` | update | 판정·대기·알림 시험, "init과 result만 읽는다" 시험 갱신 | low |
| `plugin/bin/harness-background.mjs` | update | `--status`의 `limitedUntil` | low — 열려 있는 #294도 이 파일을 바꾼다 |
| `plugin/skills/background/SKILL.md` | update | 상태 안내 문장 | low |
| `scripts/rehearsals/pipeline-smoke-steps.mjs`, `pipeline-smoke-steps.test.mjs` | update | 한도 대기를 곧바로 실패로 판정, 결과 줄 허용 형식 | low |
| `packages/core/execution/runner.mjs`, `plugin/lib/execution/runner.mjs` | update | `limitedResult`, `limitedUntil`(한 형식) | low |
| `packages/core/execution/runner.test.mjs` | update | 형식 왕복과 잘못된 값 | low |
| `src/fsd/widgets/turn-banner/api/turn-data.server.ts`, `src/fsd/widgets/turn-banner/model/runner.ts`, `turn-data.test.ts`, `runner.test.ts` | update | 배너 한 줄 | low |
| `docs/architecture/protocol.md`, `docs/conventions/product-copy.md` | update | 계약과 문구 | none |
| `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | update | PR 시점의 dev 판 + 1(지금은 0.6.6) | low — 열려 있는 #294가 0.6.10을 싣는다. 먼저 머지되는 쪽에 맞춰 판과 충돌을 정리한다 |

## Safety Analysis

- [x] 앱 진입점과 라우팅 경계: 바뀌지 않는다.
- [x] 정적 `import`: 실행기와 웹이 공용 모듈의 새 함수 두 개를 가져온다. 플러그인은 복사본을 쓴다.
- [x] dynamic `import()`: 없음.
- [x] 타입 선언: `TurnRunner`에 `limitedUntil: string | null`을 더한다.
- [ ] 테스트와 스크립트 참조: "init과 result만 읽는다" 고정 시험을 바꾼다. 실행기 루프 시험과 배너 시험을 더한다.
- [ ] 런타임 side effect: 한도 대기 중에는 `pipeline_next`를 부르지 않는다(서버·DB 호출이 줄어든다). beat 간격은 서버가 정한 그대로다.
- [x] API·서버 계약: 바뀌지 않는다. `lastResult`는 지금도 150자 이하 문자열이다.
- [x] DB: 바뀌지 않는다.
- [x] 출시된 판과의 조합: 옛 플러그인은 지금처럼 멈춘다. 새 서버는 `limited:`가 없는 `lastResult`를 지금처럼 다룬다. 서버(배너)가 먼저 배포되고 플러그인이 나중에 닿아도 문제가 없다.

## Approval

승인 기록은 front matter가 기준이다.

필요한 승인:

1. 이 설계와 새 문구(Windows 알림, 배너 줄, 결과 한 줄)다. 문구는 이 절의 다른 문구처럼 소유자 확인을 받는다. 웹 줄을 빼는 더 작은 안으로 줄일 수 있다.
2. 구현, 커밋, PR까지다. main 승격과 이 PC 번들 설치는 실행 직전에 따로 승인받는다.

## Execution Plan

1. 시험을 먼저 쓴다(공용 형식, 판정, 대기 루프, 배너). 시험은 2026-11-10 실기 stream에서 뽑은 실제 이벤트 모양을 쓰고(식별자는 지운다), 고치기 전에 실패하는지 확인한다.
2. 공용 모듈, 실행기, `--status`, 배너 순서로 구현한다. `plugin-lib --check`로 사본이 같은지 본다.
3. 리허설 판정, 스킬 문장, protocol.md, product-copy.md, 판 상승.
4. 로컬 검증, PR, CI.
5. 승격 게이트(dev): client-init-smoke, agent-eval(배포 파일 변경), pipeline-smoke(`plugin/runtime`이 대상 경로).
6. main push(승인), 배포 대조, 이 PC 번들 설치(승인).

## Verification Plan

실행할 검증:

```bash
node --test plugin/bin/harness-background-loop.test.mjs
node --test packages/core/execution/runner.test.mjs
node --test scripts/rehearsals/pipeline-smoke-steps.test.mjs
npm test
npm run test:web
npm run check
npm run verify:plugin-version -- --base origin/dev --head HEAD
```

검증 기준:

1. 판정:
   - 실제 모양의 `rejected` 이벤트 → 429 결과 → 뒤따르는 0턴 성공 결과 순서의 stream이 `limited`로 판정된다. `resumeAt`은 `resetsAt` + 60초다.
   - `resetsAt`이 없거나 8일보다 멀면 30분 뒤다.
   - `allowed`와 `allowed_warning`만 있는 실행은 지금처럼 판정한다. `rejected` 이벤트가 있어도 429로 끝난 턴이 없는 성공 실행은 성공이다.
2. 대기 루프:
   - `limited` 실행이 세 번 이어져도 실행기는 멈추지 않는다. 알림은 대기 하나에 한 번이다.
   - `limitedUntil` 전에는 `pipeline_next`와 새 실행이 없고 beat는 계속된다. 시각이 지나면 다음 실행을 띄운다.
   - 오류 두 번 뒤 `limited` 한 번, 다시 오류 한 번이면 그때 멈춘다(한도는 횟수를 바꾸지 않는다).
3. 형식: `limitedResult`와 `limitedUntil`이 왕복한다. 다른 결과 줄과 잘못된 시각은 `null`이다. 결과 줄은 150자 이하다.
4. 배너: 살아 있는 idle 실행기 + 미래의 `limitedUntil`이면 대기 줄이다. 지난 시각, `working`, 멈춤, 신호 끊김에서는 기존 줄이다.
5. 리허설: 상태에 `limitedUntil`이 있으면 `waitVerdict`가 `claude-usage-limit`으로 곧바로 실패한다. `limited: …` 줄이 요약의 실행 결과 줄에 남는다.
6. 고치기 전(지금 코드)에는 1~2와 5의 시험이 실패한다.
7. 승격 게이트가 모두 녹색이다.

실제 한도는 일부러 만들 수 없다. 그래서 실기는 따로 계획하지 않고, 실기에서 받은 stream 모양으로 시험한다. 다음에 실제로 한도에 걸리면 실행 로그와 배너로 동작을 확인한다.

## Verification Results

2026-11-10, worktree `harness/runner-usage-limit`(dev `295082c` 위), 이 PC(Windows, Node 22.13.1)에서 돌렸다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 고치기 전 코드로 새 시험 | 모두 실패 | 공용 형식·실행기 루프는 없는 export로, 배너·`turn-data`는 단언으로, CLI 통합 시험은 한도 결과를 못 받아 실패했다. 리허설 시험 2개도 실패했다 |
| `node --test plugin/bin/harness-background-loop.test.mjs` | 27 통과 | 한도 판정 3개, 대기 루프 3개, 알림 시각 1개를 더했다 |
| `node --test packages/core/execution/runner.test.mjs` | 12 통과 | 형식 왕복과 잘못된 값 |
| `node --test scripts/rehearsals/pipeline-smoke-steps.test.mjs` | 13 통과 | `claude-usage-limit` 판정, 요약의 `limited:` 줄 |
| `npm test` | 639개 중 635 통과, 실패 0, 4 건너뜀 | CLI 통합 시험 "waits on Claude's usage limit…" 포함(가짜 Claude가 실기 stream 순서를 냄) |
| `npm run test:web` | 803 통과 | 처음에는 18개 파일이 `@/generated/prisma/client`를 못 찾았다. 새 worktree에 생성 클라이언트가 없어서였고, `npm run db:generate` 뒤 모두 통과했다 |
| `npm run test:server` | 173개 중 171 통과, 2 건너뜀 | CI check의 server 단계와 같은 명령 |
| `npm run check` | 시험 하나 실패(변경 밖) | `plugin/lib` 동기화, lint(경고 1: 손대지 않은 `codex-main-loop-tools.mjs`), 문서 검사, typegen, tsc는 통과했다. `test:scripts` 324개 중 `template-release-cli.test.ts`의 "profile selection requires an approved private target…" 하나가 실패했다. 바꾸지 않은 dev `295082c` 본 checkout에서도 같은 오류로 실패하는 이 PC 환경 문제다 |
| `npm run verify:fsd`, `verify:server`, `test:architecture` | 통과(아키텍처 224개 중 222 통과, 실패 0) | |
| `npm run build` | CI에 맡김 | CI check의 build 단계가 돈다 |
| `npm run verify:plugin-version -- --base origin/dev --head HEAD` | 통과 | 0.6.5 → 0.6.6, 배포 파일 6개(커밋 `9cc60d5`) |

## Risks and Rollback

잔여 리스크:

- Claude Code가 `rate_limit_event`나 429 표기를 바꾸면 판정이 놓친다. 그러면 지금처럼 오류로 세고 3회에 멈추므로, 나빠지지는 않는다. CLI를 올릴 때 stream 모양을 다시 본다.
- 주간 한도처럼 해제가 며칠 뒤면 실행기가 그동안 기다린다. 소유자는 알림, 배너, `--stop`으로 안다.
- 끊긴 실행이 미커밋 변경을 남기면 해제 뒤에도 기존 interrupted 대기로 소유자를 기다린다.
- 한도 중의 beat는 지금 idle 대기와 같은 비용이다(서버 감속 간격).

롤백 방법:

- 판을 다시 올려 실행기 변경을 되돌린다. 웹 줄은 `limited:` 결과가 없으면 나타나지 않으므로 그대로 두어도 된다. 서버 계약과 데이터는 바뀌지 않는다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

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
- [ ] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
