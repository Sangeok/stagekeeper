---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-09"
approved-by: "user"
approved-at: "2026-11-09"
approval-scope: "구현, 커밋, PR. main 승격, 이 PC 번들 설치, 실기는 실행 직전에 각각 따로 승인받는다."
completed-at: "2026-11-10"
verification-summary: "#299(dev 머지 8b231c2)를 #298과 함께 main 8b231c2(0.6.4)로 승격했다. 게이트는 녹색이었고, 운영 배포가 일치했으며, 이 PC 번들은 0.6.4가 됐다. 실기(ITEM-03 재개, Opus 5.5, 0.6.4 상주 실행기)에서는 한 실행으로 구현·검증·인수·문서 감사가 끝났다. 앞선 실행이 남긴 ITEM-05 핸드오프는 새 규칙대로 소유자 차례로 남겼다. 그러나 이번에는 impl-verifier가 핸드오프 대신 원본 checkout에 직접 커밋했다. 그래서 같은 실행의 핸드오프를 커밋·재개하는 경로는 실기로 확인하지 못했고, 그 근거는 문구 고정 시험과 pipeline-smoke 통과다. main push 뒤 check에서는 #297 watch 시험이 deadline 경계 경합으로 한 번 실패했다. 이 기록 PR에서 그 시험을 고쳤다."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "plugin/skills/watch/SKILL.md"
  - "docs/architecture/protocol.md"
  - "docs/proposals/completed/2026-11-09-runner-idle-backoff.md"
---

# 상주 실행기가 커밋 핸드오프를 같은 실행 안에서 마무리하기

## Summary

Claude 상주 실행기의 1회 실행(`/harness:watch --once`)은 커밋 권한이 없는 역할이 핸드오프한 파일을 커밋한다. 그런데 그 역할을 다시 불러 제출을 마치지 않고 끝난다. 그래서 항목이 `wait on handoff`에 멈추고 인수가 돌지 않는다. 실행기는 대기를 일로 치지 않으므로 사람이 세션을 띄울 때까지 그대로다.

원인은 watch 스킬이다. 5절은 핸드오프를 "소유자가 커밋하고 계속을 요청할 때까지" 멈추는 일로 정한다. 그런데 상주 실행을 다루는 7절이 이 규칙을 저장된 커밋 정책으로 확장하지 않는다.

이 문서는 7절과 5절에 규칙을 더하자고 제안한다. 그 실행이 보낸 역할의 핸드오프는 저장된 커밋 정책을 소유자의 커밋 동의로 보고, 인계 파일만 커밋한 뒤 같은 run을 outcome 없이 재개한다. Codex 상주 실행기가 이미 도구 계약으로 하는 일을 Claude 쪽 지시문에 맞추는 변경이다. 서버, 비공개 템플릿, 감시(watch) 동작은 바꾸지 않는다.

## Goal

- 상주 실행기로 도는 항목이 구현 검증처럼 핸드오프하는 단계에서 멈추지 않고 인수까지 간다.
- 감시와 foreground 세션의 핸드오프는 지금처럼 소유자 차례로 둔다.
- 작업 유형: 플러그인 스킬 지시문 변경, 계약 문서 갱신, 판 상승.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 무인 실행기의 런타임 동작(커밋과 재개)이 바뀐다.
- 출시 판(0.6.3 이하)과 새 판의 동작이 달라 판 상승과 사용자 갱신이 필요하다.
- 스킬, protocol.md, 두 매니페스트, 시험 1개로 5개 파일이다.

## Current State

2026-11-09 `origin/dev` `4eaa30b` 기준이다.

관찰(2026-11-09 운영 실기, harness-smoke, 플러그인 0.6.3, Opus 5.5):

- 상주 실행기가 ITEM-05 구현 실행을 돌렸다. dev는 README를 고치고 보고서를 직접 커밋해 제출했다(`f12e33a`).
- impl-verifier는 결함 0으로 통과한 뒤 보고서 경로를 note로 `handoff`를 보냈다. 메인 루프는 그 보고서를 커밋했다(`6832901`). 그러나 impl-verifier를 다시 부르지 않았고, `report_submit`과 최종 `ok`도 없었다.
- 실행은 "세션을 열어 ITEM-05를 이어 가라"는 최종 답으로 끝났다. 이후 `pipeline_next`는 ITEM-05를 `impl-verify`, `action: "wait"`, `on: "handoff"`로 돌려주고, 웹은 "waiting for your commit"을 보인다. 인수와 문서 감사는 돌지 않았다.
- 같은 단계를 거치는 2026-11-05 pipeline-smoke(CI, Sonnet 5.5, 단계 목록은 `scripts/rehearsals/pipeline-smoke-steps.mjs`의 `PIPELINE_STEPS`)는 통과했다. 모델 해석에 따라 갈리는 문제라 CI가 늘 잡지는 못한다.

지시문(`plugin/skills/watch/SKILL.md`):

- 5절 `:177`–`:180`: 역할의 핸드오프는 현재 entry와 receipt로 기록하고, 소유자가 실제로 커밋하고 계속을 명시적으로 요청한 뒤에 같은 run을 outcome 없이 재개한다.
- 5절 `:182`–`:183`: 메인 루프의 커밋 핸드오프는 소유자 입력이 있을 때까지 자동 실행을 멈춘다.
- 4절 `:158`–`:159`: 게이트·핸드오프·한도·실패한 인수·QA·구현 검증은 그 항목만 기다리게 한다.
- 7절 `:233`–`:235`: 4절의 작업 루프를 따르되, 실행기의 커밋 정책은 항상 yes다.
- 7절 `:239`–`:240`: 런북이 소유자에게 묻거나 알리라고 하는 곳에서는 그 항목이 기다린다. 웹이 이미 게이트·보류·핸드오프를 보여 준다.
- 7절은 5절의 "소유자의 커밋과 계속 요청"을 저장된 커밋 정책으로 대신한다고 말하지 않는다. 그래서 메인 루프는 커밋한 뒤 소유자의 계속 요청을 기다리며 끝났다.

계약과 선례(`docs/architecture/protocol.md`):

- "커밋 핸드오프" 절 `:543`–`:547`: 핸드오프는 소유자 차례로 센다. 소유자가 커밋한 뒤 세션이 outcome 없이 다시 부르면 그 단계가 이어진다. 상주 실행의 경우는 따로 정하지 않았다.
- Codex 상주 실행 `:301`–`:308`: foreground 런북의 수동 진입·핸드오프 부분을 상주 실행의 저장 정책과 전용 도구 계약으로 명시적으로 확장하고, 비공개 본문은 바꾸지 않는다.
  - `plugin/runtime/codex-main-loop-tools.mjs`의 `resident_commit`과 `resident_dispatch`가 인계 파일을 커밋하고, `confirmCommitHandoff`로 확인한 뒤 같은 run을 재개한다.
  - impl-verifier와 qa-verifier는 Codex 상주 실행이 맡지 않고 foreground로 넘긴다(`:54`, "Optional verifier requires an explicit foreground handoff").
- 상주 실행의 커밋 정책은 항상 yes이고(watch 스킬 `:234`), push는 막는다(`protocol.md` `:366`).

실행기(`plugin/runtime/background.mjs`, `plugin/lib/execution/watch.mjs`):

- `actionableWork`는 `dispatch`와 `accept` 항목만 일로 친다. `wait on handoff`인 항목만 남으면 실행을 띄우지 않는다.

## Scope

포함 범위:

- watch 스킬 7절: 그 실행이 보낸 역할의 커밋 핸드오프를 같은 실행 안에서 커밋하고 재개하는 단계를 더한다. 3단계의 소유자 대기 목록에서 핸드오프를 뺀다.
- watch 스킬 5절: 상주 실행(7절)은 저장된 커밋 정책이 소유자의 커밋과 계속 요청을 대신한다는 한 문장을 더한다.
- protocol.md "커밋 핸드오프" 절: 상주 1회 실행의 규칙을 더한다.
- 시험 1개: 7절에 이 규칙이 있음을 고정한다.
- 플러그인 판 0.6.3 → 0.6.4(두 매니페스트).

제외 범위:

- 앞선 실행이 남긴 핸드오프(이미 멈춘 ITEM-05 같은 것)를 실행기가 다시 집게 하는 변경. 대안 B에서 다룬다.
- 서버의 핸드오프 판정과 웹 문구. 웹은 지금처럼 "waiting for your commit"과 계속 안내를 보인다.
- 감시(watch)와 foreground 세션의 핸드오프. 지금처럼 소유자 차례다.
- 비공개 템플릿(런북·역할 지시문) 본문. Codex 선례처럼 스킬 쪽에서 확장한다.
- Codex 상주 실행. 이미 도구 계약으로 처리한다.
- 멈춘 ITEM-05의 마무리. 사용자가 하지 않기로 했다(2026-11-09).

## Proposal

### 1. 7절 단계

3단계를 고치고 새 4단계를 넣는다. 나머지 번호는 하나씩 밀린다.

```text
3. Where the runbook says to ask or tell the owner, that item waits — the web
   already shows the gate or hold. Note it in your final reply and continue with
   other items. A denied tool call is not retried in another form; that item
   waits for the next run.
4. A commit handoff from a role you dispatched in this run is not an owner wait:
   the runner's stored commit policy is the owner's commit and continuation
   request for it (section 5). Commit only the handed-off file under the
   runbook's rules, then resume that role's same run **without outcome**, with
   its exact entry and receipt, so it confirms the commit and submits. If the
   file is missing or outside this checkout, the commit fails, or the resume is
   refused, that item waits; name it in your final reply. A handoff that an
   earlier run left behind still waits for the owner.
```

- "그 실행이 보낸 역할"로 범위를 좁힌다. 메인 루프가 내용을 준비한 역할과 같은 세션에서 커밋하므로, 앞선 실행이 남긴 파일을 확인 없이 커밋할 일이 없다.
- 인계 파일 하나만 커밋하고 push와 게이트는 지금처럼 금지다(기존 5단계).
- 재개한 역할이 커밋과 준비한 내용을 다시 대조하는 절차는 역할 지시문이 이미 갖고 있다. 이 변경은 그 절차를 부를 수 있게 할 뿐이다.

### 2. 5절 문장

`:180` 뒤에 한 문장을 더하고, `:182`의 자동 실행 정지를 감시와 foreground로 한정한다.

```text
In a background run (section 7), the runner's stored commit policy stands in for
the owner's commit and continuation request for a handoff from a role that run
dispatched.

An unanswered permission prompt, or a main-loop commit handoff outside a
background run, pauses automatic execution/rearming until owner input.
```

### 3. protocol.md

"커밋 핸드오프" 절 끝에 상주 1회 실행의 규칙을 적는다. 그 실행이 보낸 역할의 핸드오프는 메인 루프가 인계 파일만 커밋하고 같은 run을 outcome 없이 재개한다. 앞선 실행이 남긴 핸드오프와 감시·foreground는 소유자 차례다. 서버 동작은 그대로라는 점도 함께 적는다.

### 4. 시험

`plugin/bin/harness-watch.test.mjs`에 시험 하나를 더한다. 7절 본문에 새 4단계 문장이 있고, 3단계의 소유자 대기 목록에 핸드오프가 없음을 단언한다. `docs/architecture/test-writing.md`의 기준대로 문구 자체가 계약일 때 쓰는 문자열 비교다. 실제 동작은 아래 실기로 확인한다.

### 대안과 버린 이유

- A(이 제안): 7절과 5절 지시문만 고친다. 무인 실행에서 늘 생기는 경우(같은 실행이 만든 핸드오프)를 막는다.
- B. 실행기가 `wait on handoff` 항목도 일로 쳐서 다음 실행을 띄운다:
  - `actionableWork`는 감시와 같이 쓰므로 상주 전용 분기가 필요하다.
  - 해결할 수 없는 핸드오프 하나가 같은 작업 서명을 세 번 남기면 stuck 판정으로 실행기 전체가 멈춘다. 지금은 그 항목만 기다린다.
  - 남은 핸드오프는 중단된 실행에서만 생기고, 웹이 계속 방법을 보여 준다. 이번에는 넣지 않는다.
- C. 서버가 상주 클라이언트에는 핸드오프를 `dispatch`로 돌려준다: 서버는 로컬 커밋을 모르고, 응답 계약이 바뀐다.
- D. 검증 역할에 커밋 권한을 준다: 검증 역할은 원본 저장소를 바꾸지 않는다는 격리 원칙과 맞지 않고, 비공개 템플릿을 바꿔야 한다.
- E. 비공개 런북 문구를 고친다: Codex 선례처럼 스킬 쪽에서 확장하는 것이 계약(`protocol.md` `:306`–`:307`)이다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `plugin/skills/watch/SKILL.md` | update | 7절 3단계 수정과 새 4단계, 5절 한 문장과 정지 범위 | medium — 무인 실행의 커밋·재개 동작이 바뀐다 |
| `docs/architecture/protocol.md` | update | "커밋 핸드오프" 절에 상주 1회 실행 규칙 | none |
| `plugin/bin/harness-watch.test.mjs` | update | 7절 규칙 문구 고정 시험 | low |
| `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | update | 판 0.6.4 | low |

## Safety Analysis

- [x] 앱 진입점과 라우팅 경계: 없음.
- [x] 정적 `import` / `export from`: 없음. 스킬 문서와 시험만 바뀐다.
- [x] dynamic `import()` 또는 lazy loading: 없음.
- [x] barrel export 경유 참조: 없음.
- [x] 테스트와 스크립트 참조: 스킬 본문을 읽는 기존 시험은 preflight 절의 파일 목록만 본다(`plugin/bin/harness-watch.test.mjs` "the watch skill preflight lists exactly the modules the watch and session helpers load"). 이 변경은 preflight 절을 건드리지 않는다.
- [x] 정적 자산 URL: 없음.
- [x] 타입 선언: 없음.
- [x] 런타임 side effect: 상주 1회 실행이 인계 파일 하나를 커밋하고 역할을 재개한다. push와 게이트는 그대로 금지다. 실기로 확인한다. 결과: 실기에서는 이번 실행이 보낸 역할의 핸드오프가 생기지 않아 이 경로를 확인하지 못했다. 앞선 실행이 남긴 핸드오프는 새 규칙대로 소유자 차례로 남겼고, push는 없었다(Verification Results).
- [x] API·외부 SDK: 서버 계약은 그대로다. 재개는 지금도 허용된 outcome 없는 `agent_next`다.
- [x] 출시된 판과의 조합: 서버는 바뀌지 않는다. 0.6.3 이하 플러그인은 지금처럼 핸드오프에서 멈추고, 0.6.4부터 같은 실행 안에서 마무리한다. 로컬 잠금과 서버 행 형식은 바뀌지 않는다.

## Approval

승인 기록은 front matter가 기준이다.

필요한 승인:

1. 이 설계(구현, 커밋, PR).
2. main 승격과 이 PC 번들 설치는 실행 직전에 따로 승인받는다.
3. 실기(아래 검증 계획의 5)는 실행기를 켜고 소유자 동작(재개·승인)을 대신하므로 실행 직전에 따로 승인받는다.

## Execution Plan

1. 7절과 5절을 고치고 문구 고정 시험을 쓴다. 시험이 고치기 전 본문에서 실패하는지 먼저 확인한다.
2. protocol.md "커밋 핸드오프" 절을 고친다.
3. 판을 0.6.4로 올린다.
4. 로컬 검증, PR, CI.
5. 승격 게이트(dev): client-init-smoke, agent-eval(플러그인 배포 파일 변경), pipeline-smoke(`plugin/skills/watch` 경로). dev에는 #298의 서버 수정도 있어 같은 승격에 실린다.
6. main push(승인), 배포 대조, 이 PC 번들 0.6.4(승인).
7. 실기(승인): 핸드오프가 있는 단계를 상주 실행기로 한 번 돌린다.

## Verification Plan

실행할 검증:

```bash
npm test
npm run check
npm run verify:plugin-version -- --base origin/dev --head HEAD
gh workflow run client-init-smoke.yml --ref dev
gh workflow run agent-eval.yml --ref dev
gh workflow run pipeline-smoke.yml --ref dev
```

검증 기준:

1. 새 시험은 고치기 전 본문에서 실패하고 고친 뒤 통과한다.
2. `npm test`와 `npm run check`가 기존 실패 말고는 통과한다. 기존 실패는 Windows 전용 0600 프로필 시험이다.
3. 판 검사가 0.6.3 → 0.6.4를 받아들인다.
4. 승격 게이트가 모두 녹색이다. pipeline-smoke는 구현 검증 핸드오프를 거쳐 인수까지 가야 한다(`item-done`).
5. 실기(Opus, 이 PC, 0.6.4 번들): harness-smoke에서 구현 검증이 있는 항목 하나를 상주 실행기로 돌린다. 후보는 ITEM-03이다. 소유자가 구현을 다시 열면 dev가 아무것도 단언하지 않는 시험 네 개를 고친다.
   - 기준 1: 같은 `--once` 실행 안에서 impl-verifier가 핸드오프 → 메인 루프 커밋 → 같은 run 재개 → `report_submit` → `ok`로 끝난다.
   - 기준 2: 항목이 인수까지 간다.
   - 기준 3: 커밋은 인계 파일 하나이고 push는 없다.

## Verification Results

2026-11-09 로컬 결과다. Windows, worktree `harness/resident-handoff-resume`, 기준 dev `4eaa30b`, 구현 커밋 `4789bb1`이다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 새 시험(고치기 전 스킬) | 1 fail | 7절과 5절 문구가 없어 `AssertionError`로 실패했다 |
| 새 시험과 기존 preflight 시험(고친 뒤) | 2 pass | `node --test --test-name-pattern=… plugin/bin/harness-watch.test.mjs` |
| `npm test` 범위(core, github, plugin bin·runtime) | 618 pass, 0 fail, 4 skipped | `--test-concurrency=2`, 622개 |
| `npm run check` | 1 fail(기존) | Windows 전용 0600 프로필 시험이다(`scripts/templates/template-release-cli.test.ts`). 바꾸지 않은 커밋에서도 같다. lint(FSD·서버 경계 포함), 문서 검사(201개), `plugin/lib` 동기화, 타입 검사는 통과했다 |
| `npm run verify:plugin-version -- --base origin/dev --head HEAD` | 통과 | 0.6.3 → 0.6.4, 배포 파일 3개(스킬과 두 매니페스트) |
| PR #299 CI | 전부 통과 | macOS arm64 작업 두 개가 러너를 받지 못해 단계 0개로 취소됐다(`job was not acquired by Runner`). 실패한 작업만 다시 돌려 통과했다. runtime contracts(macos-15)는 세 번째 시도에서 통과했다 |

### 승격과 운영 반영

승격 대상은 dev `8b231c2`다. #298(감속 단계 경계의 seenAt 기록)과 #299가 들어 있다.

| 단계 | 결과 | 비고 |
| --- | --- | --- |
| dev push CI | 녹색 | check 42638604963, windows-role-runtime 42638604909, macos-runtime-contracts 42638604990 |
| `npm run verify:plugin-version -- --base origin/main --head origin/dev` | 통과 | 0.6.3 → 0.6.4, 배포 파일 3개 |
| client-init-smoke | 녹색 | run 42638917208 |
| agent-eval | 녹색 | run 42638923189, 비용 추정 $4.40 |
| pipeline-smoke | 녹색 | run 42639474157. 55턴, 권한 거부 0, harnessErrors 0, stepRefusals 0, 677초, $1.65. 구현 검증을 거쳐 인수까지 갔다 |
| 운영 `migrate status` | up to date | 36개, 새 마이그레이션 없음(`prisma/` 변경 없음) |
| main push | 완료 | 2026-11-09T16:45:40Z, `ac6a6dd..8b231c2` fast-forward |
| 운영 배포 대조 | 일치 | Production deployment 7660589594. 운영 HTML의 `dpl_2Mn6ma8ahMYC5ktsbMABoya93snj`가 main push의 Vercel 상태 id와 같다. `/` 200, `/api/mcp` 401 |
| main push 뒤 check | 1 fail, 재실행 통과 | 아래 참고 |
| 이 PC 번들 0.6.4 | 설치 | 2,238개 파일, packageSha256 `b2be9298…`이다. runtime과 verifier는 재사용했다. 0.6.3 대비 inventory 차이는 정확히 배포 파일 3개다. 캐시 sha256이 전부 일치하고, 설치된 스킬에 새 4단계가 있다 |

main push 뒤 check:

- `check (test)`의 `with a lease, waits as long as the server says before the next check, paused or not`이 실패했다. #297이 더한 watch 시험이다(run 42658023143). paused 경우에 idle beat를 하나 더 봤다.
- watch는 서버 간격이 더 길면 deadline까지 잔다. 그런데 `setTimeout`이 소수점 아래 ms를 버려서, deadline 바로 전에 깨어 한 번 더 beat할 수 있다.
- 운영 영향은 없다. 110분 watch가 끝날 때 beat 하나가 더 가는 정도다.
- 이 기록 PR에서 시험을 고쳤다. 그 경계 beat 하나를 허용하고, 다섯 번 돌려 다섯 번 통과했다. #297 이전 watch 코드(`62e68dd`)에서는 beat가 수십 번 찍혀 여전히 실패한다.
- 실패한 작업만 다시 돌리자 main check도 통과했다.

### 실기(2026-11-09, harness-smoke, Opus 5.5, 0.6.4)

준비:

- 23:35Z에 웹에서 ITEM-03을 Reopen implementation으로 다시 열었다. 메모는 범위 밖 시험 네 개가 아무것도 단언하지 않는다는 것이다.
- 실행기는 session `f6a5690c`, `--propose no`, 권한 auto로 23:36:21Z에 시작했다.

| 기준 | 결과 | 비고 |
| --- | --- | --- |
| 실행 | 한 실행으로 끝남 | 23:36:25~23:53:35, 61턴, 권한 거부 0, 실패 0, API 정가 환산 $6.43. dev `7434d7b`, impl-verifier `faa071b`, 인수 `c591205`(검사 5개 통과), 문서 감사 `2eee627`. 새 AgentRun은 모두 R0(`fc20ccfd…`)다 |
| 1. 같은 실행의 핸드오프를 커밋·재개 | 확인 못 함 | impl-verifier가 handoff를 보내지 않고 원본 checkout에서 보고서를 직접 커밋했다. 역할 정의에 Bash가 있다. ITEM-05 실행(0.6.3)에서는 handoff를 보냈다. 모델 해석에 따라 갈리는 경로라 실기로 일부러 재현할 수 없다 |
| 2. 인수까지 | 통과 | ITEM-03 accepted |
| 3. 인계 파일 하나, push 없음 | push 없음 | 핸드오프가 없어 인계 파일 커밋은 해당 없다. 원격은 그대로다 |
| 앞선 실행이 남긴 핸드오프 | 새 규칙대로 대기 | 실행의 최종 답이 ITEM-05를 "앞선 실행이 남긴 커밋 핸드오프라 재개하지 않았다"고 보고했다 |

실행기는 23:55:19Z에 `--stop`으로 멈췄다(owner).

## Risks and Rollback

잔여 리스크:

- 지시문이라 모델이 따르지 않을 수 있다. 실기로 확인하고, 그래도 멈추면 대안 B나 Codex처럼 도구 계약으로 강제하는 방안을 다시 본다.
- 메인 루프가 인계 파일 말고 다른 파일을 커밋할 위험이 있다. 지시문이 "인계 파일 하나"로 한정하고, 재개한 역할이 커밋과 준비 내용을 다시 대조한다. Codex처럼 해시로 강제하지는 않는다.
- 앞선 실행이 남긴 핸드오프는 여전히 소유자 차례다. 실행이 핸드오프와 재개 사이에 끊기면 그 항목은 사람이 세션을 띄울 때까지 기다린다.
- 0.6.3 이하를 쓰는 설치는 갱신 전까지 지금처럼 멈춘다.

롤백 방법:

- 플러그인 판을 다시 올려 이전 스킬 문구로 되돌린다. 서버와 데이터는 바뀌지 않으므로 다른 되돌릴 것이 없다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-11-10
- verification-summary: front matter와 Verification Results를 따른다.
- implementation PR/commit:
  - #299(커밋 `4789bb1`·`d3c70c7`, dev 머지 `8b231c2`)
  - main `ac6a6dd` → `8b231c2`(#298과 함께)
  - 이 기록 PR(#297 watch 시험 고침 포함)
- changed files summary:
  - #299: watch 스킬 5절·7절, `protocol.md` "커밋 핸드오프" 절, 문구 고정 시험, 두 매니페스트 0.6.4.
  - 이 기록 PR: `plugin/bin/harness-watch.test.mjs`의 경계 경합 시험. 시험 파일만이라 판 상승이 없다.
  - 이 PC는 플러그인 0.6.4로 바뀌었다.
- remaining follow-up:
  - 같은 실행의 핸드오프를 커밋·재개하는 경로를 실기로 확인한다. 다음에 상주 실행에서 역할이 핸드오프를 보내면 실행 기록에서 본다.
  - impl-verifier가 핸드오프 대신 원본 checkout에 직접 커밋한 일은 따로 다룬다(2026-11-10 사용자 결정). 상주 실행은 커밋 정책이 yes라 해가 없다. 하지만 감시를 `commit:no`로 쓸 때도 같은 일이 생기면 소유자의 커밋 금지를 우회한다.
  - ITEM-05는 앞선 실행이 남긴 핸드오프로 기다린다. 사용자가 마무리하지 않기로 했다(2026-11-09).
  - harness-smoke의 로컬 커밋은 push하지 않았다.

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
