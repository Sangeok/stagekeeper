---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-11-26"
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
  - "docs/proposals/active/post-merge-auto-fix.md"
  - "docs/proposals/active/post-merge-auto-fix-trust.md"
  - "docs/test-reports/active/auto-fix-model-practice-report.md"
  - "docs/architecture/verification.md"
---

# 병합 후 실패의 수정을 저절로 시작시킨다

## Summary

`dev`의 병합 후 검사가 실패하면 수정 워크플로가 저절로 시작해, 에이전트가 고치고, 덜
고쳐졌으면 이어서 고치고, 검사가 이미 돈 수정 PR을 올려 두게 한다. 병합은 사람이 한 번
누른다. 지금은 사람이 입력을 넣어 워크플로를 시작하고, 워크플로가 연 PR의 검사는
사람이 승인해야 돈다. 이 문서는 `post-merge-auto-fix.md`의 4-가와 4-나를 지금의 코드에
맞게 고쳐 쓴 것이고, 그 둘을 대신한다.

## Goal

- 실패가 기록되면 사람이 시작시키지 않아도 수정 시도가 돈다.
- 덜 고친 시도는 그 측정 결과를 받아 이어서 고친다. 한 이슈에 세 번까지다.
- 수정 PR은 검사가 돈 상태로 올라온다. 사람은 PR을 읽고 병합한다.
- 켜고 끄는 값 하나로 "하지 않음", "했을 일을 적기만 함", "실제로 함"을 고른다.
- 작업 유형: 워크플로와 스크립트의 추가, 기존 워크플로 둘의 조건 변경.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 다섯 개가 넘는 파일을 바꾼다.
- 워크플로가 다른 워크플로를 시작시키고, 저장소에 쓰기 권한이 있는 앱 토큰으로 PR을
  연다. 에이전트가 쓴 코드가 사람의 확인 없이 실행되는 자리가 늘어난다.

## Current State

2026-11-26의 `dev`(`930288b`) 기준이다.

있는 것:

| 것 | 상태 |
| --- | --- |
| 실패 기록(`post-merge-failure-record`) | `check`, `windows-role-runtime`, `macos-runtime-contracts`의 `dev`와 `main` 실행을 매시간, 그리고 실행이 끝날 때 읽는다. 실패를 `[post-merge]` 이슈에 적고, 한 번 다시 실행하고, 상태 줄과 라벨을 고친다. 준비 단계의 실패는 통과하면 닫는다 |
| 수정 워크플로(`post-merge-auto-fix`) | 손으로 시작한다. 재현, 에이전트, 확인과 되풀이, 측정, 판정, PR, 기록까지 있다 |
| 이어 고치기(`previous` 입력) | 이전 실행의 변경과 측정 결과를 받아 이어 고친다. 사람이 실행 번호를 준다 |
| 워크플로가 PR을 여는 길 | 저장소 설정이 켜져 있다. `GITHUB_TOKEN`으로 연다 |
| GitHub 앱 `stagekeeper-auto-fix` | 2026-11-26에 주인이 만들었다. 이 저장소에만 설치했고 권한은 Contents와 Pull requests의 읽기·쓰기다. 번호는 저장소 변수 `AUTO_FIX_APP_ID`, 비밀 키는 비밀 값 `AUTO_FIX_APP_PRIVATE_KEY`에 있다. 아직 어떤 워크플로도 쓰지 않는다 |

없는 것:

- 실패 이슈를 보고 수정을 시작시키는 판정.
- 덜 고친 시도 뒤에 다음 시도를 잇는 판정.
- 켜고 끄는 값.

확인한 사실(`post-merge-auto-fix-trust.md`의 Verification Results):

| 사실 | 근거 |
| --- | --- |
| 워크플로가 `GITHUB_TOKEN`으로 연 PR의 `check`는 `action_required`로 만들어지고 돌지 않는다 | 실행 `45774744845` |
| 워크플로가 `check`를 직접 시작시켜도 그 결과는 PR의 필수 검사로 세어지지 않는다 | 같은 실행. 병합 상태가 `BLOCKED`로 남았다 |
| 앱의 이름으로 연 PR은 `check`가 승인 없이 돌고, 통과하면 병합 상태가 `CLEAN`이 된다 | 실행 `45777564204` |
| 남은 실패를 받은 에이전트는 그 실패를 없앴고, 세 번째 시도에서 "고쳤다"가 나왔다 | 실행 `45732297359`, `45754119274`, `45757859106`. 실패 하나, 한 번의 연쇄다 |
| 같은 수정의 판정이 러너에 따라 달라진다 | 사람의 마지막 수정이 세 번은 `verified`, 한 번은 `failures-remain`(실행 `45769288360`) |

실제 병합 후 실패는 드물다. 2026-11-21부터 2026-11-25까지 이슈가 셋이었고(#418, #458,
#461), 그 가운데 #461은 러너가 시작하지 못한 것이다.

## Scope

포함 범위:

- 수정 PR의 브랜치에서 온 PR을 비공개 템플릿을 쓰는 워크플로가 믿지 않게 하는 것.
- 수정 워크플로가 앱의 이름으로 PR을 여는 것.
- 실패 기록 워크플로가 수정을 시작시키고 다음 시도를 잇는 판정, 그리고 켜고 끄는 값.
- `AGENTS.md`와 `docs/architecture/verification.md`의 관련 규칙.

제외 범위:

- 자동 병합. 실제 수정 PR을 몇 건 본 뒤에 따로 정한다. 이 문서의 "나중에 정할 것"에
  그때 필요한 조건을 적어 둔다.
- 병합 뒤 지켜보다가 이슈를 저절로 닫는 것(`post-merge-auto-fix.md` 7절). 실패 기록이
  최근 72시간의 실행만 읽어서 연속 통과를 셀 수 없다. 이슈는 지금처럼 사람이 닫는다.
- `main`에서 난 실패. 수정은 `dev`에서만 한다.
- 판정 규칙과 측정에 쓰는 러너의 수. 그대로 둔다.
- 재현되지 않는 실패와 이름이 있는 시험이 아닌 실패. 지금처럼 에이전트를 부르지
  않는다(`post-merge-auto-fix-trust.md` 5절).

## Proposal

### 1. 에이전트가 쓴 코드가 실행되는 자리

저절로 시작시키면 사람이 보기 전에 에이전트의 코드가 도는 자리가 늘어난다. 자리마다
그곳이 가진 것을 적는다. 새 워크플로가 PR에서 돌게 되면 이 표에 더한다.

| 자리 | 언제 | 그곳이 가진 것 | 조치 |
| --- | --- | --- | --- |
| 수정 워크플로의 `fix` 잡 | 에이전트가 고칠 때 | 모델 토큰(에이전트 단계와 결과물 검사 단계에만). 저장소 읽기 | 지금 그대로. 캐시는 읽기만 한다 |
| 수정 워크플로의 `measure`, 전체 검사 | 측정할 때 | 저장소 읽기 | 지금 그대로 |
| PR의 `check`, `windows-role-runtime`, `macos-runtime-contracts` | PR이 열릴 때 | 저장소 읽기. 비밀 값 없음 | 없음 |
| PR의 `client-init-smoke`, `shared-distribution-acceptance` | PR이 `plugin/**` 등을 바꿀 때 | 비공개 템플릿 저장소의 내용. 같은 잡에서 PR의 코드를 실행한다 | **2절. 수정 브랜치의 PR은 믿지 않는다** |
| Vercel 미리보기 배포 | 브랜치가 올라갈 때 | 미리보기 환경의 값 | 지금 그대로. `vercel.json`이 `harness/auto-fix-*`를 배포하지 않는다 |
| 병합 뒤 `dev`의 워크플로와 개발하는 컴퓨터 | 사람이 병합한 뒤 | 각자의 것 | 병합은 사람이 한다. 자동 병합은 이 문서에서 하지 않는다 |

이 보호들은 에이전트가 `.github/`와 `vercel.json`을 고칠 수 없다는 것에 기댄다.
그 변경은 지금도 브랜치를 올리기 전에 거부된다.

에이전트가 읽는 글은 실패한 실행의 로그, 저장소의 코드, 봇과 저장소 주인이 쓴
글이다(`post-merge-auto-fix.md` 9절). 바깥 사람이 쓴 글은 넘기지 않는다.

### 2. 수정 브랜치의 PR은 비공개 템플릿을 받지 못한다 (0단계)

`client-init-smoke`와 `shared-distribution-acceptance`는 같은 저장소의 브랜치에서 온
PR을 믿고 비공개 템플릿을 내려받는다. 앱이 연 수정 PR도 같은 저장소의 브랜치다.

- 두 워크플로의 맨 앞 단계(준비됐는지 정하는 단계)에 조건을 더한다. PR의 브랜치 이름이
  `harness/auto-fix-`로 시작하면 준비되지 않은 것으로 본다.
- 누가 열었는지가 아니라 브랜치 이름으로 가린다. 앱의 이름에 기대지 않고, 워크플로가
  `GITHUB_TOKEN`으로 연 PR을 사람이 승인해 돌릴 때도 같은 보호를 받는다. 이 이름은
  수정 워크플로만 쓰고 `vercel.json`도 같은 이름으로 가린다.
- 준비되지 않으면 두 워크플로는 지금도 나머지 단계를 건너뛰고 통과로 끝난다. 둘은 필수
  검사가 아니다.
- 병합된 뒤에는 `dev`에서 원래대로 돈다.

이 단계는 3절보다 먼저 병합한다.

### 3. 수정 워크플로가 앱의 이름으로 PR을 연다 (가 단계)

- `pull-request` 잡에서 `actions/create-github-app-token`으로 이 저장소의 토큰을 받아
  PR을 연다. 이 잡은 에이전트의 코드를 실행하지 않는다. 워크플로 자신의 스크립트로
  본문을 만들 뿐이다. 비밀 키는 이 잡의 그 단계에만 준다.
- 저장소 변수나 비밀 값이 없으면 지금처럼 `GITHUB_TOKEN`으로 연다. 키가 없어도 손으로
  쓰는 도구는 돈다.
- 브랜치를 올리는 일과 PR이 열리지 않았을 때 브랜치를 지우는 일은 지금처럼
  `GITHUB_TOKEN`으로 한다.
- 시도 기록에 PR을 누구의 이름으로 열었는지 적는다.

만들면서 확인할 것: 실험에서는 앱이 브랜치도 올렸다. 브랜치는 워크플로가 올리고 PR만
앱이 열어도 `check`가 도는지를 모델 없는 실행(`prepared/pr-path`)으로 먼저 본다. 돌지
않으면 브랜치도 앱의 토큰으로 올린다.

### 4. 켜고 끄는 값 (나 단계)

저장소 변수 `AUTO_FIX_MODE` 하나를 둔다. `post-merge-auto-fix.md` 11절과 같다.

| 값 | 동작 |
| --- | --- |
| 없음, `off`, 모르는 값 | 시작시키지 않는다. 지금과 같다 |
| `report` | 판정만 하고 이슈의 상태 줄에 "시작시켰을 것"을 적는다 |
| `on` | 시작시킨다 |

- 실패 기록, 다시 실행, 라벨과 상태 줄, 준비 단계의 이슈를 닫는 것, 손으로 하는 실행은
  이 값과 무관하다.
- 끌 때 도는 중이던 시도는 끝까지 돈다.
- 실패 기록 워크플로가 실행 요약에 그 시각의 값을 적는다.

### 5. 시작시키는 판정 (나 단계)

판정은 실패 기록 스크립트의 `plan()`에 넣는다. 이슈와 댓글에서 읽은 것만으로 정하는
순수 함수이고, 지금 있는 상태(`stateOf`)에서 이어진다.

처음 시작시키는 조건(이슈마다):

| 이슈의 상태 | 조건 |
| --- | --- |
| `broken`(다시 실행해도 실패했고, 그 잡의 최근 실행도 실패) | 바로 시작시킨다 |
| `collecting`(다시 실행하면 통과) | 그런 실패가 3건 쌓이면 시작시킨다. 주인이 2026-11-26에 정했다 |
| `resolved`, `not-started`, `setup-failed`, `rerun-pending`, `rerun-unclear` | 시작시키지 않는다 |

- 가장 최근 실패가 `dev`에서 난 이슈만 다룬다.
- 이슈에 열린 수정 PR이 있으면 시작시키지 않는다.
- 모델을 쓰는 게이트(`agent-eval`, `pipeline-smoke`)가 도는 중이면 다음 판정으로
  미룬다. 같은 구독을 쓴다.
- 한 번의 판정에서 새로 시작시키는 시도는 둘까지다.

시작시킬 때 넘기는 입력:

| 입력 | 값 |
| --- | --- |
| `issue` | 그 이슈의 번호. 시도 기록이 같은 이슈에 댓글로 달린다 |
| `runs` | 이슈에 기록된 실패 실행의 번호. 최근 것부터 열 개까지 |
| `job` | 이슈 제목의 잡 이름 |
| `runner` | 잡 이름의 괄호 안에서 읽는다(`windows-2022`, `macos-15`, `macos-15-intel`). 괄호가 없으면 `windows-role-runtime`은 `windows-2022`, 그 밖은 `ubuntu-latest` |
| `workflow` | `windows-role-runtime`, `macos-runtime-contracts`의 실패는 그 워크플로. `check`의 실패는 `none`(수정 PR에서 `check`가 돈다) |
| `source`, `model`, `open_pr` | `agent`, 6절의 모델, `true` |
| `previous` | 6절 |

시작시킨 뒤 이슈에 시작 표식이 든 댓글을 단다(몇 번째 시도인지, 어느 실패까지 보고
시작했는지). 시도 기록은 실행이 끝나야 달리므로, 그 사이의 판정이 같은 시도를 또
시작시키지 않게 한다. 시작 요청이 실패하면 표식을 달지 않는다. 표식이 달린 지 6시간이
지나도 시도 기록이 없으면 그 시도는 "끝나지 않음"으로 센다.

### 6. 다음 시도 (나 단계)

한 이슈에 세 번까지 시도한다. 주인이 2026-11-26에 정했다. 사람이 이 실패를 수정 세
번으로 고쳤고, 연습에서도 세 번째에 "고쳤다"가 나왔다. 근거는 한 건이다.

| 앞 시도의 끝(시도 기록의 `end`) | 다음 |
| --- | --- |
| `opened`(PR을 엶. "실패가 남음", "확인 부족" 표시가 붙은 것 포함) | 시작시키지 않는다. 사람이 병합하거나 닫는다. 닫힌 뒤에 새 실패가 기록되면 그 PR의 실행에서 이어 고친다 |
| `stillFailing`(고친 뒤에도 로그에 적힌 시험이 실패) | 그 실행을 `previous`로 주고 이어 고친다 |
| `nothingAdded`, `noChange`, `noOutput`, `testsDropped`, `refused`, `fullCheckFailed`, `failingUnreproduced`, `recordOnly`, `unfinished` | 시작시키지 않는다. 사람이 본다(7절) |
| `notReproduced`, `unhandled` | 시도로 세지 않는다. 새 실패가 기록되면 처음 조건을 다시 본다. 이런 끝이 한 이슈에 셋이면 사람이 본다 |
| `duplicate` | 시작시키지 않는다. 같은 변경의 PR이 열려 있다 |

- 수정 PR이 병합된 뒤 같은 이슈에 새 실패가 기록되면, 병합된 수정이 모자란 것이다.
  남은 횟수 안에서 처음 조건으로 다시 시작시키고 `previous`는 주지 않는다. 그 변경은
  이미 `dev`에 있다.
- 모델은 첫 시도부터 `claude-opus-5-5`다. 주인이 2026-11-26에 정했다. 연습에서 Opus가 한 번에 더 멀리 갔고, 실패가
  드물어 건당 비용의 차이가 문제 되지 않는다(세 시도에 4.95달러 상당). 견준 근거는
  실행 한 번씩이다.

### 7. 사람에게 넘기기와 상태 줄 (나 단계)

- 이슈의 상태 줄에 한 줄을 더한다. 지금의 `Status`, `To do`는 그대로 둔다.

| 경우 | 더하는 줄 |
| --- | --- |
| `report`이고 시작 조건이 됨 | `Automatic fix: would start try N now (report only).` |
| 시작시킴 | `Automatic fix: try N is running.` |
| PR이 열려 있음 | `Automatic fix: pull request #P is open. Read it and merge or close it.` |
| 세 번을 다 씀, 또는 6절에서 사람이 보는 끝 | `Automatic fix: stopped after try N (<end>). A person has to look.` |
| 대상이 아님 | 줄을 더하지 않는다 |

- 에이전트의 변경이 시험 파일이 아닌 파일을 건드렸으면 수정 PR에 라벨
  `auto-fix:product-code`를 붙인다. 손으로 시작한 실행에서도 붙인다. 그런 변경은
  승격되면 서비스와 배포되는 플러그인에 들어가므로 PR 목록에서부터 가려 보이게 한다.
  지금까지 에이전트의 변경 여섯 건은 모두 시험 파일만 고쳤다.
- 사람에게 넘길 때 라벨 `auto-fix:needs-person`을 붙인다. `AGENTS.md`의 작업 시작
  절차에 이 라벨의 이슈를 알리는 것을 더한다.
- 워크플로는 PR을 병합하지 않고 닫지 않는다. 이슈도 닫지 않는다(준비 단계의 이슈는
  지금처럼 닫는다).

### 8. 켜는 순서 (다 단계)

켜기 전에 확인하는 것은 시작시키는 판정이 맞는지다. 에이전트가 실제 실패를 고치는지는
켠 뒤에 올라오는 PR로 본다. 병합을 사람이 하므로 틀린 수정이 들어가는 길은 켜기 전과
같고, 켜서 새로 생기는 위험은 엉뚱한 이슈에 시작시키거나 같은 시도를 두 번
시작시키거나 멈춰야 할 때 멈추지 않는 것이다. 주인이 2026-11-26에 이렇게 정했다.

켜는 조건은 셋이다.

| 조건 | 확인하는 방법 |
| --- | --- |
| 지난 이슈의 실제 글로 판정이 맞게 나온다 | 이슈 #418, #458, #461과 연습용 #430의 본문과 댓글을 시험 자료로 넣어 5절부터 7절의 판정을 고정한다. 시작 표식처럼 지난 글에 없는 것은 만들어 넣는다 |
| 살아 있는 이슈에 판정이 한 번 맞게 적힌다 | `AUTO_FIX_MODE`를 `report`로 두고 실패 기록이 한 번 돈 뒤 열린 이슈의 상태 줄을 읽는다. 시작시키는 판정이든 아니든 맞으면 된다. 지금이라면 #458에 줄이 더해지지 않아야 한다(다시 실행해 통과한 실패가 1건) |
| 판정이 계산한 입력이 통한다 | 판정이 #458에 대해 만든 `runner`, `job`, `workflow`, `runs`를 그대로 넣어 수정 워크플로를 `reproduce-only`로 한 번 돌린다. 맞는 러너에서 로그에 적힌 시험이 돌아야 한다. 모델을 쓰지 않는다 |

- 셋이 채워지면 바로 켠다. 기간을 두고 기다리지 않는다. 그동안 실패가 나지 않으면 새로
  보는 것이 없고, 나면 그 실패는 시작되지 않은 채 지나간다.
- 켠 뒤의 첫 자동 시도는 결과를 확인한다. `AGENTS.md`의 작업 시작 절차가 열린 수정
  PR과 `auto-fix:needs-person` 이슈를 알린다.
- `AUTO_FIX_MODE`는 주인이 말하면 에이전트가 바꾸고, 바꾼 값과 시각을 이 문서의
  Verification Results에 적는다. 저장소 변수는 바뀐 이력이 남지 않는다.

순서:

1. 0단계와 가 단계를 병합하고, 모델 없는 실행으로 앱의 PR에서 `check`가 도는지와 두
   워크플로가 건너뛰는지를 본다.
2. 나 단계를 병합한다. 첫째 조건이 그 PR의 시험이다.
3. `AUTO_FIX_MODE`를 `report`로 두고 둘째와 셋째 조건을 본다.
4. `on`으로 바꾼다.

`post-merge-auto-fix-trust.md` 6절의 기준(실제 실패 5건을 손으로 돌려 4건 이상에서
PR이 병합됨)은 켜는 조건에서 뺀다. 그 기준은 에이전트의 실력을 미리 보려던 것이다.

켠 뒤에 스스로 멈추는 조건: 자동으로 연 PR이 병합된 뒤 같은 이슈에 새 실패가 기록된
것이 저장소 전체에서 두 건이면 `plan()`이 더 시작시키지 않고 전용 이슈로 알린다. 다시
켜려면 주인이 그 이슈를 닫는다. 드물게 실패하는 시험은 옳게 고친 뒤에도 다른 자리에서
다시 실패할 수 있어서(사람의 수정도 병합 뒤에 두 번 더 고쳤다) 두 건의 근거는 약하다.
멈췄을 때 치르는 것이 한 번 들여다보는 일이어서 민감하게 두고, 불필요하게 멈추는 일이
생기면 숫자를 다시 정한다. 주인이 2026-11-26에 정했다.

### 9. 나중에 정할 것: 자동 병합

이 문서에서는 하지 않는다. 실제 수정 PR을 본 뒤에 정한다. 그때 필요한 조건을 적어 둔다.

- 판정이 `verified`이고 `check (required)`가 통과했다.
- 바뀐 파일이 측정한 그 시험 파일 하나뿐이다.
- 그 파일이 비밀 값을 쓰는 워크플로가 돌리는 시험이 아니다. `template-release`는
  `tests/templates/*.test.ts`를, `shared-distribution-acceptance`는
  `scripts/rehearsals/shared-distribution-contract.test.mjs`를 비공개 템플릿과 같은 잡에서
  돌린다. 이 목록은 워크플로에서 뽑아 검사로 고정한다.
- 그래도 남는 것: 병합된 시험 파일은 개발하는 컴퓨터에서도 실행된다. 그곳은 가둘 수
  없다. 자동 병합은 검토하지 않은 모델의 코드가 그 컴퓨터에서 도는 것을 받아들이는
  결정이다.

### 10. 택하지 않은 방법

| 방법 | 택하지 않은 이유 |
| --- | --- |
| 워크플로가 `check`를 직접 시작시키기 | PR의 필수 검사로 세어지지 않는다(실행 `45774744845`) |
| 워크플로가 커밋에 `check (required)` 상태를 직접 붙이기 | 필수 검사가 "검사가 통과함"이 아니라 "워크플로가 통과했다고 적음"이 된다 |
| 대기 중인 검사를 워크플로가 스스로 승인하기 | 사람의 승인을 받으라고 둔 장치를 넘는다 |
| 앱 없이, 사람이 검사를 승인하고 병합하기 | 가장 안전하고 만들 것이 없다. 검사 결과를 보려면 먼저 승인해야 해서 두 번 들러야 한다. 주인이 앱을 택했다 |
| 누가 열었는지로 PR을 가리기 | 앱의 이름에 기대고, `GITHUB_TOKEN`으로 연 PR은 가리지 못한다 |
| 병합 뒤 지켜보다 저절로 닫기 | 실패 기록이 72시간만 읽는다. 이슈를 사람이 닫는 지금의 규칙으로 충분하다 |
| 첫 시도는 Sonnet, 못 미치면 Opus | 실패가 드물어 비용의 차이가 작고, 시도 횟수를 하나 더 쓴다 |
| 측정에서 실패가 드문 러너의 통과를 빼기 | 측정은 이미 그런 러너에서 더 많이 돈다. 실행 `45754119274`에서 남은 실패는 고치기 전에 가장 덜 실패한 러너에서 났다 |

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `.github/workflows/client-init-smoke.yml`, `.github/workflows/shared-distribution-acceptance.yml` | update | 2절. 준비 단계의 조건 하나씩 | low. 수정 브랜치의 PR에서만 건너뛴다 |
| `.github/workflows/post-merge-auto-fix.yml` | update | 3절. `pull-request` 잡이 앱의 토큰으로 PR을 연다 | medium. 쓰기 권한이 있는 토큰을 쓴다. 에이전트의 코드를 실행하지 않는 잡에만 준다 |
| `.github/actions/post-merge-auto-fix/fix.mjs`, `fix.test.mjs` | update | 시도 기록에 PR을 연 이름. 제품 코드를 건드린 변경의 라벨. 워크플로의 모양을 고정하는 시험 | low |
| `.github/actions/post-merge-failure-record/record.mjs`, `record.test.mjs`, `action.yml` | update | 4절부터 7절. `plan()`의 판정, 시작 요청, 상태 줄, 라벨 | medium. 다른 워크플로를 시작시킨다. `report`에서 먼저 본다 |
| `.github/workflows/post-merge-failure-record.yml` | update | `AUTO_FIX_MODE`를 넘긴다. 도는 중인 게이트를 읽는다 | low. 권한은 지금의 `actions: write`로 충분하다 |
| `AGENTS.md` | update | 수정 PR과 `auto-fix:needs-person` 이슈를 다루는 규칙 | low |
| `docs/architecture/verification.md` | update | 스크립트와 워크플로의 설명 | none |
| `docs/proposals/active/post-merge-auto-fix.md`, `post-merge-auto-fix-trust.md` | update | 4-가와 4-나, 6절의 기준이 이 문서로 바뀌었다고 적는다 | none |

## Safety Analysis

- 에이전트의 코드가 실행되는 자리는 1절의 표다. 새로 생기는 자리는 앱이 연 PR의 검사
  하나이고, 그 가운데 비공개 템플릿을 받는 둘은 2절로 막는다.
- 앱의 토큰은 `pull-request` 잡의 한 단계에만 준다. 그 잡은 변경을 내려받아 실행하지
  않는다. 앱은 이 저장소에만 설치돼 있고 `dev`와 `main`의 규칙을 넘지 못한다.
- 시작시키는 판정은 순수 함수여서 시험으로 고정한다. `report`에서는 아무것도
  시작시키지 않는다.
- 한 이슈에 세 번, 한 번의 판정에 둘, 병합 뒤 재발 두 건에서 멈춤이 한도다. 실패
  이슈는 닷새에 셋이었다.
- 병합은 사람이 한다. 이 문서는 병합의 주체를 바꾸지 않는다.

확인한 항목:

- [x] 테스트와 스크립트 참조. `record.test.mjs`와 `fix.test.mjs`가 워크플로의 모양과
      판정을 고정한다
- [x] 런타임 side effect 또는 초기화 코드. 워크플로 시작, 이슈 댓글과 라벨, PR 열기가
      새로 생기는 바깥 동작이다
- [x] API, 외부 SDK 영향. GitHub의 워크플로 시작 API와 앱 토큰 발급을 새로 쓴다

제품의 라우팅, import, 정적 자산, 타입 선언, 출시된 plugin과 서버의 상태는 바꾸지
않는다.

## Approval

승인 기록의 단일 기준은 front matter다.

승인 메모:

- 승인 전. 설계의 값은 주인이 2026-11-26에 대화에서 정했다. 한 이슈에 세 번, 첫
  시도부터 Opus, 다시 실행해 통과한 실패는 3건에서 시작, 켜는 조건 셋(8절)과 기다리는
  기간 없음, 제품 코드를 고친 PR의 표시, 스스로 멈추는 조건, 변수는 주인의 말로
  에이전트가 바꾸는 것이다. 이 값들을 정한 것은 구현의 승인이 아니다.
- 구현 PR의 병합, 모델을 쓰는 실행, `AUTO_FIX_MODE`를 바꾸는 일은 그때마다 따로
  승인받는다. 저장소 변수는 주인이 바꾼다.

## Execution Plan

1. 0단계: 두 워크플로의 조건(2절). 모델 없이, 수정 브랜치 이름의 시험용 PR로 건너뛰는
   것을 본다.
2. 가 단계: 앱의 이름으로 PR 열기(3절). `prepared/pr-path`로 PR을 열어 `check`가 도는
   것을 보고 PR을 닫는다.
3. 나 단계: 값과 판정, 다음 시도, 상태 줄(4절부터 7절). `AUTO_FIX_MODE`가 없는 채로
   병합한다.
4. 다 단계: 주인이 `report`로 두고, 실제 실패에서 판정을 본 뒤 `on`으로 바꾼다(8절).
5. 실제 수정 PR을 본 뒤 자동 병합을 따로 정한다(9절).

## Verification Plan

실행할 검증:

- `npm run check`와 두 스크립트의 시험.
- 0단계: 수정 브랜치 이름의 PR에서 두 워크플로가 템플릿을 내려받지 않고 통과로 끝난다.
  다른 이름의 PR에서는 지금처럼 돈다.
- 가 단계: 앱이 연 PR에서 `check`가 승인 없이 돌고 병합 상태가 `CLEAN`이 된다. 키가
  없는 경우 `GITHUB_TOKEN`으로 열린다.
- 나 단계: `plan()`의 시험으로 5절부터 7절의 표를 한 줄씩 고정한다. 이슈 #418, #458,
  #461, #430의 실제 글을 자료로 쓴다. 실패 기록을 `--dry-run`으로 돌려 지금의
  이슈(#458)에 대한 판정을 본다. 제품 코드를 건드린 변경에 라벨이 붙는 것을 시험으로
  고정한다.
- 다 단계: 8절의 둘째와 셋째 조건.

성공 기준: 위가 모두 기대대로이고, 8절의 조건 셋이 채워진다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 앱의 이름으로 연 PR에서 검사가 도는지 | 돎(2026-11-26) | 실행 `45777564204`. `post-merge-auto-fix-trust.md`에 적었다 |
| 워크플로가 직접 시작한 검사가 세어지는지 | 세어지지 않음(2026-11-26) | 실행 `45774744845` |
| 0단계부터 다 단계 | Not run yet | |

## Risks and Rollback

잔여 리스크:

- 근거가 실패 하나의 연습이다. 다른 종류의 실패에서 에이전트가 어떻게 하는지는 본 적이
  없다. `report`와 사람의 병합으로 받는다.
- 사람이 요약만 보고 병합하면 병합의 보호는 약하다. 변경은 짧다(연습의 세 변경은 6줄,
  7줄, 25줄).
- 이어 고치기를 Windows 러너에서 돌려 본 적이 없다. 실제 실패의 대부분이 Windows였다.
- 구독 한도에 걸렸을 때 시도가 어떻게 끝나는지 확인하지 않았다.
- Claude Code의 판을 고정하지 않는다. 실행마다 최신판을 설치한다.
- 판정이 러너에 따라 달라진다. 기록과 PR 본문에 러너마다의 숫자가 있다.

롤백 방법:

- `AUTO_FIX_MODE`를 지우거나 `off`로 바꾸면 시작시키지 않는다. 손으로 쓰는 도구는
  그대로다.
- 앱의 키를 저장소에서 지우면 `GITHUB_TOKEN`으로 PR을 여는 지금의 동작으로 돌아간다.
  앱 설정에서 키를 폐기할 수 있다.
- 각 단계는 PR 하나이고 되돌리는 PR로 뺀다. 0단계는 가 단계보다 먼저 빼지 않는다.

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
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다. (승인 전이다)
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. (실패 없음)
- [x] 잔여 리스크를 명시했다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
