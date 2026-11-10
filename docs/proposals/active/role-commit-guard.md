---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-10"
approved-by: "user"
approved-at: "2026-11-10"
approval-scope: "구현, 커밋, PR. main 승격, 이 PC 번들 설치, 실기는 실행 직전에 각각 따로 승인받는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "plugin/hooks/hooks.json"
  - "docs/architecture/protocol.md"
  - "docs/proposals/completed/2026-11-10-resident-handoff-resume.md"
---

# 역할 서브에이전트의 커밋을 플러그인 훅으로 막기

## Summary

2026-11-09 상주 실행에서 impl-verifier가 보고서를 핸드오프하지 않고 원본 checkout에 직접 커밋했다. 상주 실행은 커밋 정책이 yes라 해가 없었다. 그러나 감시(watch)를 `commit:no`로 쓸 때 같은 일이 생기면 소유자의 커밋 금지를 우회한다. 지금 역할의 커밋 경계와 `commit:no`는 지시문으로만 지켜진다.

이 문서는 플러그인 PreToolUse 훅 하나를 더하자고 제안한다. 서브에이전트가 부른 Bash·PowerShell 명령에서 `git commit`과 `git add`를 찾으면, 아래 두 경우에 거부하고 무엇을 할지 알려 준다.

- 검증·조사 역할: 언제나 거부한다.
- 작업 공간 역할(dev): 활성 세션의 정책이 `commit:no`일 때만 거부한다.

메인 세션(메인 루프와 소유자)의 명령은 보지 않는다. 훅의 `if` 조건으로 커밋·스테이징 명령에서만 돌게 해 다른 셸 호출에는 비용이 없게 한다. 훅이 실패하면 명령은 그대로 진행한다. 검증 역할은 이제 핸드오프로만 커밋을 넘기므로, 2026-11-10 완료한 핸드오프 마무리 경로가 실제로 쓰이게 된다.

## Goal

- 역할의 커밋 경계를 지시문이 아니라 플러그인이 강제한다. 검증·조사 역할은 커밋하지 않고, `commit:no` 세션에서는 어떤 역할도 커밋하지 않는다.
- 평소 셸 호출의 속도와 메인 세션의 동작은 바꾸지 않는다.
- 작업 유형: 플러그인 훅 추가, Windows 포장 변환, 계약 문서, 판 상승.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 모든 세션의 셸 호출 경로에 훅이 들어가는 런타임 동작 변경이다.
- 훅, 시험, Windows 런처와 포장 스크립트, 문서, 매니페스트 두 개로 5개 이상 파일이 바뀐다.

## Current State

2026-11-10 `origin/dev` `e2cc5f4` 기준이다.

관찰:

- 2026-11-09 ITEM-03 상주 실행(0.6.4, Opus 5.5)에서 impl-verifier 서브에이전트가 원본 checkout에서 `git commit`을 실행했다(`faa071b`). 역할 지시는 커밋을 메인 루프에 핸드오프하라고 한다. 같은 역할이 ITEM-05 실행(0.6.3)에서는 핸드오프했다.
- 그래서 핸드오프 마무리 경로(`docs/proposals/completed/2026-11-10-resident-handoff-resume.md`)를 실기로 확인하지 못했다.

권한과 지시문:

- 상주 실행기는 세션 전체에 `git add`·`git commit`을 허용한다(`plugin/runtime/background.mjs` `backgroundSettings`). 서브에이전트도 같은 권한을 쓴다. 감시는 소유자의 설정을 쓴다.
- `commit:no`는 지시문이다. watch 스킬 5절은 dev 브리핑과 메인 루프에 정책을 전하라고만 한다.
- 생성된 역할 정의(예: harness-smoke `.claude/agents/`)에서 Bash를 받는 역할은 plan-verifier, impl-verifier, 작업 공간 역할(dev)이다. qa-verifier, doc-auditor, pm, feature-scout, work-assigner, work-discoverer는 Bash가 없다.
- 작업 공간 역할을 뺀 고정 역할 8개는 `REPORT_AGENTS`다(`packages/core/plans/entitlement.mjs`, `plugin/lib/plans/entitlement.mjs`). 작업 공간 역할 이름은 `harness.json`의 `workspaces[].agent`에 있다(harness-smoke `dev`, mathgic `web-dev`).
- 활성 세션의 정책은 `<git 공통 디렉터리>/harness/watch.json`(`commit`, `propose`)에 있다. 세션이 checkout을 잡고 있는 동안만 있고, 멈추면 지워진다(`plugin/runtime/local-session.mjs`).

Claude Code 사실(문서와 이 PC의 실측, CLI 2.1.318):

- PreToolUse 훅 입력에는 서브에이전트 호출이면 `agent_type`(정의의 `name`)과 `agent_id`가 있다. 메인 세션 호출에는 둘 다 없다. 2026-11-10 `--settings` 훅과 `--agents`로 정의한 서브에이전트로 확인했고, 구현 첫 단계에서 `--plugin-dir`로 읽은 플러그인 훅(실행 파일과 인수 형식, `if: "Bash(*git*commit*)"`)으로 다시 확인했다. 플러그인 훅도 서브에이전트 호출에서만 `agent_type: "probe-runner"`와 `agent_id`를 받았고, `if`가 붙은 처리기는 `git --version`에서 뜨지 않았다.
- 문서는 `--agent`로 시작한 세션의 메인 호출에도 `agent_type`이 있다고 적는다. `agent_id`는 서브에이전트(또는 팀원) 호출에만 있다. 그래서 메인 세션은 `agent_id`가 없는 것으로 가린다.
- 훅 프로세스에는 `CLAUDE_PROJECT_DIR`(세션을 시작한 프로젝트 루트)가 환경 변수로 넘어온다(hooks.md "Exec form and shell form").
- 훅은 `hookSpecificOutput.permissionDecision: "deny"`와 이유를 돌려주어 호출을 막는다. 이유는 모델에게 보인다.
- 훅의 `if`는 권한 규칙 형식 하나로 실행 여부를 거른다. `Bash(*git*commit*)`는 `echo step && git commit …`와 두 줄 명령에서 돌았고, `echo hello`와 `git --version`에서는 돌지 않았다(2026-11-10 실측).
- `onFailure: "continue"`는 훅이 실패해도 호출을 진행시킨다(v2.1.295+). 실행 파일과 인수를 따로 주는 형식은 Git Bash가 없는 Windows의 셸 형식 예외에 걸리지 않는다.
- 다른 방법은 맞지 않는다.
  - 서브에이전트 정의의 `disallowedTools`에 `Bash(git commit *)`를 넣으면 Bash 전체가 빠진다.
  - 설정의 deny 규칙은 메인 세션에도 걸리고, `git -C . commit` 같은 형태를 놓친다.
  - 프로젝트 역할 정의의 훅은 `-p` 세션에서 신뢰 확인 때문에 건너뛴다.
- 문서는 설정 파일과 플러그인의 훅이 서브에이전트 호출에서도 돈다고 적는다(hooks.md "Hook locations"). 위의 두 실측과 맞는다.
- 플러그인은 사용자 범위로 설치되므로 훅은 Stagekeeper에 연결하지 않은 저장소의 세션에서도 돈다. 그런 저장소에 `pm`이나 `qa-verifier` 같은 이름의 서브에이전트가 있을 수 있다.

선례:

- template-guard(`plugin/hooks/hooks.json`, `plugin/bin/harness-template-guard.mjs`)가 PreToolUse 훅으로 거부한다. 시험은 스크립트에 표준 입력 JSON을 넣어 출력을 본다(`plugin/runtime/template-installation.test.mjs`).
- Windows 번들은 이 훅을 `powershell.exe … bin/harness.ps1 template-guard`로 바꿔 넣는다(`scripts/windows/package-windows-plugin.mjs`). 이때 PreToolUse 훅이 하나뿐이라고 가정한다. `harness.ps1`은 모드 이름을 `ValidateSet`과 대응표로 관리한다.

## Scope

포함 범위:

- 새 훅 `plugin/bin/harness-commit-guard.mjs`와 `plugin/hooks/hooks.json` 항목.
- Windows: `harness.ps1`의 `commit-guard` 모드와, 포장 스크립트의 변환이 두 훅을 모두 다루게 고치기.
- 시험: 훅 판정 시험, 포장 변환 시험.
- `docs/architecture/protocol.md`의 커밋 경계 설명.
- AGENTS.md의 pipeline-smoke 대상 경로에 `plugin/hooks`와 새 훅을 더하기. 훅이 파이프라인 역할의 동작을 바꾸기 때문이다.
- 플러그인 판 0.6.4 → 0.6.5.

제외 범위:

- 메인 세션(메인 루프와 소유자)의 커밋. 훅은 `agent_type`이 없는 호출을 보지 않는다. 메인 루프의 `commit:no`는 지금처럼 지시문이다.
- harness 역할이 아닌 서브에이전트. 소유자가 쓰는 다른 서브에이전트는 보지 않는다.
- `commit`·`add` 말고 다른 git 쓰기. push는 상주 실행에서 이미 막고, checkout·restore는 검증 역할이 복사본에서 돌연변이 검사에 쓴다.
- Codex. 역할에 임의 셸을 열지 않고, 커밋은 메인 루프의 전용 도구만 한다(`protocol.md` `:303`–`:306`).
- 비공개 템플릿(역할 정의의 도구 목록과 지시문).

## Proposal

### 1. 판정

| 호출한 쪽 | 명령에 `git commit`/`git add` | 세션 정책 | 판정 |
| --- | --- | --- | --- |
| 메인 세션(`agent_id` 없음, `--agent` 세션 포함) | 상관없음 | 상관없음 | 통과(보지 않음) |
| 연결하지 않은 저장소(`harness.json`의 `workspaces` 없음)의 서브에이전트 | 상관없음 | 상관없음 | 통과 |
| `REPORT_AGENTS`의 역할 | 있음 | 상관없음 | 거부 R1 |
| 작업 공간 역할(`harness.json` `workspaces[].agent`) | 있음 | `commit:false` | 거부 R2 |
| 작업 공간 역할 | 있음 | `commit:true` 또는 세션 없음 | 통과 |
| 그 밖의 서브에이전트 | 상관없음 | 상관없음 | 통과 |
| 누구든 | 없음 | 상관없음 | 통과 |

명령 찾기:

- 명령을 따옴표와 주석 밖의 `&&`, `||`, `;`, `|`, `&`, 줄바꿈, 괄호, `$(`로 나눈다. Bash에서는 역따옴표도 나눈다.
- 각 조각의 첫 단어가 `git`이나 `git.exe`면 본다. 경로가 붙은 것과, PowerShell의 `&` 뒤나 환경 변수 대입 뒤에 오는 것도 포함한다. `if`·`then`·`env`·`xargs` 같은 앞말은 건너뛴다.
- 앞쪽 전역 옵션(`-C <dir>`, `-c <k=v>`, `--git-dir=…`, `--work-tree=…`, `--no-pager`)을 건너뛰고, 하위 명령이 `commit`이나 `add`면 해당한다.
- `bash -c`, `sh -c`, `pwsh -Command`, `powershell -Command`의 인수 문자열은 한 번 더 같은 방식으로 본다.
- `grep "git commit"`처럼 따옴표 안의 글자는 명령 자리가 아니므로 해당하지 않는다.

정책과 역할 이름 읽기:

- 세션의 프로젝트 루트(`CLAUDE_PROJECT_DIR`, 없으면 입력의 `cwd`)에서 위로 `.git`을 찾는다. 역할이 다른 디렉터리로 옮겨 가도 세션의 checkout을 본다. `.git`이 파일이면 `gitdir:`과 `commondir`을 따라 공통 디렉터리를 정한다. git을 실행하지 않는다.
- 그 checkout 루트의 `harness.json`에 `workspaces` 배열이 없으면 연결하지 않은 저장소로 보고 판정하지 않는다.
- `<공통 디렉터리>/harness/watch.json`의 `commit`이 불리언이면 그것이 세션 정책이다.
- 작업 공간 역할 이름은 같은 `harness.json`의 `workspaces[].agent`에서 읽는다.

거부 이유(모델에게 보임):

- R1: `Stagekeeper: <role> does not commit. Leave the file uncommitted and send agent_next outcome handoff with its path as note; the main loop commits it.`
- R2: `Stagekeeper: this session's commit policy is no. Leave the changes uncommitted and report them; the owner commits.`

실패 처리:

- 입력이 깨졌거나 파일을 읽지 못하면 판정하지 않고 통과시킨다. exit 0과 `{}`다.
- 이 훅은 지시문 뒤의 안전망이다. 고장이 셸 호출을 막지 않게 한다.

### 2. 훅 등록

`plugin/hooks/hooks.json`에 PreToolUse 항목을 하나 더한다.

```json
{
  "matcher": "^(Bash|PowerShell)$",
  "hooks": [
    { "type": "command", "if": "Bash(*git*commit*)", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/bin/harness-commit-guard.mjs"], "timeout": 10, "onFailure": "continue" },
    { "type": "command", "if": "Bash(*git*add*)", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/bin/harness-commit-guard.mjs"], "timeout": 10, "onFailure": "continue" },
    { "type": "command", "if": "PowerShell(*git*commit*)", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/bin/harness-commit-guard.mjs"], "timeout": 10, "onFailure": "continue" },
    { "type": "command", "if": "PowerShell(*git*add*)", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/bin/harness-commit-guard.mjs"], "timeout": 10, "onFailure": "continue" }
  ]
}
```

- `if`는 훅을 띄울지만 정한다. `git status && echo address` 같은 명령에서도 돌 수 있지만, 판정은 1의 규칙이 한다.
- 한 명령에 `add`와 `commit`이 같이 있으면 훅이 두 번 돈다. 판정은 같다.

### 3. Windows 번들

- `harness.ps1`의 `ValidateSet`과 대응표에 `commit-guard` → `harness-commit-guard.mjs`를 더한다. template-guard처럼 표준 입력을 UTF-8로 넘긴다.
- 포장 스크립트는 `command: "node"`인 훅 처리기를 모두 바꾼다. 스크립트 이름에 따라 `harness.ps1 template-guard` 또는 `commit-guard`로 넣는다.
  - template-guard는 지금처럼 `onFailure: "block"`인지 확인한다.
  - 새 훅은 `onFailure: "continue"`인지 확인한다.
  - 모르는 처리기가 있거나 둘 중 하나가 없으면 포장을 멈춘다.
  - 두 훅 스크립트가 번들에 들어갔는지 확인한다(추적하지 않은 새 파일은 포장되지 않는다).
- `if` 덕분에 PowerShell 런처는 커밋·스테이징 명령에서만 뜬다.

### 4. 문서

- `protocol.md`의 "커밋 핸드오프" 절 뒤에 "역할 커밋 경계"를 둔다. 1의 판정, 메인 세션 제외, 실패 시 통과, 거부 이유를 적는다.
- AGENTS.md의 pipeline-smoke 대상 경로에 `plugin/hooks plugin/bin/harness-commit-guard.mjs`를 더한다.
- `template-releases.md`의 "hooks.json은 두 MCP 진행 도구만 대상으로 삼는다"는 문장을 템플릿 훅에 한정하고, `impl-verifier.md`의 권한 절에 커밋 훅을 적는다.

### 대안과 버린 이유

- 역할 정의의 `disallowedTools`·`tools`: 특정 명령만 뺄 수 없고 Bash 전체가 빠진다. 비공개 템플릿을 바꿔야 한다.
- 설정의 deny 규칙(상주 `backgroundSettings`): 메인 루프의 커밋도 막고, `git -C . commit`을 놓친다.
- 역할 정의의 frontmatter 훅: `-p`(상주 실행)에서 신뢰 확인 때문에 건너뛴다. 비공개 템플릿을 바꿔야 한다.
- 지시문만 다듬기: 이미 있는 지시를 어긴 사례다.
- 메인 세션도 `commit:no`에서 막기: 훅은 메인 세션과 감시 세션을 이어 줄 근거가 없다. 같은 checkout에서 소유자가 따로 띄운 세션의 커밋까지 막게 된다.
- `if` 없이 모든 셸 호출에서 돌리기: Windows 번들에서는 셸 호출마다 PowerShell이 뜬다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `plugin/bin/harness-commit-guard.mjs` | new | 판정과 명령 찾기 | medium — 모든 세션의 커밋 명령 경로에 놓인다 |
| `plugin/bin/harness-commit-guard.test.mjs` | new | 판정표, 명령 형태, 정책 파일, 실패 시 통과 | low |
| `plugin/hooks/hooks.json` | update | PreToolUse 항목 | medium — 잘못 쓰면 훅이 안 돈다 |
| `plugin/bin/harness.ps1`, `plugin/bin/harness-launcher-windows.test.mjs` | update | `commit-guard` 모드와 표준 입력 전달 시험 | low |
| `scripts/windows/package-windows-plugin.mjs`, `.test.mjs` | update | 두 훅 변환과 계약 확인 | low |
| `docs/architecture/protocol.md` | update | 역할 커밋 경계 | none |
| `docs/architecture/template-releases.md`, `docs/architecture/impl-verifier.md` | update | 훅 설명을 새 훅과 맞추기 | none |
| `AGENTS.md` | update | pipeline-smoke 대상 경로 | none |
| `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | update | 판 0.6.5 | low |

## Safety Analysis

- [x] 앱 진입점과 라우팅 경계: 없음.
- [x] 정적 `import` / `export from`: 훅은 `plugin/lib/plans/entitlement.mjs`의 `REPORT_AGENTS`만 가져온다.
- [x] dynamic `import()` 또는 lazy loading: 없음.
- [x] barrel export 경유 참조: 없음.
- [x] 테스트와 스크립트 참조: 포장 스크립트가 PreToolUse 훅이 하나라고 가정하는 부분을 고쳤다. 그 시험과 Windows 런처 시험을 함께 돌렸다.
- [x] 정적 자산 URL: 없음.
- [x] 타입 선언: 없음.
- [x] 런타임 side effect: 커밋·스테이징 명령마다 훅 프로세스가 하나 뜬다. 메인 세션은 표준 입력만 읽고 끝난다. 실행 시간은 Verification Results에 적었다.
- [x] API·외부 SDK: 서버는 바뀌지 않는다.
- [x] 출시된 판과의 조합: 서버와 로컬 상태 형식이 바뀌지 않는다. 0.6.4 이하에는 훅이 없어 지금과 같다.

## Approval

승인 기록은 front matter가 기준이다.

필요한 승인:

1. 이 설계(구현, 커밋, PR).
2. main 승격과 이 PC 번들 설치는 실행 직전에 따로 승인받는다.
3. 실기는 실행기를 켜고 소유자 동작을 대신하므로 실행 직전에 따로 승인받는다.

## Execution Plan

1. 플러그인 훅이 서브에이전트 호출에서 `agent_type`을 받는지 이 PC에서 잰다. `--plugin-dir`로 작업 사본의 플러그인을 쓰는 짧은 `-p` 실행 한 번이다. 받지 못하면 멈추고 다시 설계한다.
2. 훅 판정 시험을 먼저 쓴다. 판정표의 각 행, 명령 형태, 정책 파일, 깨진 입력을 다룬다. 시험이 훅 없이 실패하는지 확인한다.
3. 훅을 구현하고 hooks.json에 등록한다.
4. `harness.ps1` 모드와 포장 변환을 고치고 시험을 고친다.
5. protocol.md, AGENTS.md, 판 0.6.5.
6. 로컬 검증과 실행 시간 측정, PR, CI(Windows 런처 시험 포함).
7. 승격 게이트(dev): client-init-smoke, agent-eval, pipeline-smoke. 바뀐 대상 경로 규칙으로 pipeline-smoke를 돌린다.
8. main push(승인), 배포 대조, 이 PC 번들 0.6.5(승인).
9. 실기(승인): 구현 검증이 있는 항목 하나를 상주 실행기로 돌린다. impl-verifier의 커밋이 거부되고, 핸드오프 → 메인 루프 커밋 → 같은 실행 재개로 끝나는지 본다. 앞 제안서에 남은 확인도 함께 끝난다.

## Verification Plan

실행할 검증:

```bash
node --test plugin/bin/harness-commit-guard.test.mjs
npm test
npm run check
node --test scripts/windows/package-windows-plugin.test.mjs
npm run verify:plugin-version -- --base origin/dev --head HEAD
gh workflow run client-init-smoke.yml --ref dev
gh workflow run agent-eval.yml --ref dev
gh workflow run pipeline-smoke.yml --ref dev
```

검증 기준:

1. 판정 시험이 1의 판정표를 모두 다룬다.
   - 거부: `git commit -m x`, `git -C <dir> commit`, `git -c user.name=x commit`, `cd <repo> && git add f && git commit`, 두 줄 명령, `git.exe commit`, `& git commit`, `bash -c "git commit"`.
   - 통과: `git -C <copy> rev-parse HEAD`, `git diff`, `git checkout <sha> -- file`, `grep "git commit" f`.
   - 메인 세션은 무엇이든 통과한다.
   - 작업 공간 역할은 정책 파일의 `commit`이 true·false·없음일 때 각각 통과·거부·통과다.
   - 깨진 입력이나 정책 파일은 통과한다.
2. 고치기 전(훅 없음) 상태에서 시험이 실패한다.
3. 메인 세션 호출 한 번의 훅 실행 시간을 이 PC에서 잰다. 기준은 Node 직접 실행 100ms 미만이다.
4. 포장 결과의 hooks.json에서 template-guard와 새 훅이 모두 `harness.ps1`의 해당 모드를 부르고, 계약이 다르면 포장이 멈춘다.
5. 승격 게이트가 모두 녹색이다.
6. 실기에서 impl-verifier의 직접 커밋이 R1로 거부되고, 같은 실행 안에서 핸드오프 → 커밋 → 재개 → `report_submit`으로 끝나 인수까지 간다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 1단계 실측: `--plugin-dir` 기록 훅 + `--agents` 서브에이전트(`claude -p`, Haiku) | PASS | 서브에이전트 호출에만 `agent_type: "probe-runner"`와 `agent_id`. `if`가 붙은 처리기는 `git commit …`에서만 떴다. 약 $0.30 |
| `node --test plugin/bin/harness-commit-guard.test.mjs` | 구현 전 FAIL, 구현 뒤 6 pass | 구현 전에는 `ERR_MODULE_NOT_FOUND` |
| 판정 규칙 변형 10개(`agent_id` 확인, `harness.json` 요구, `commondir`, `-C` 값, 중첩 셸, 따옴표, 정책, BOM, 실패 시 통과, 주석) | 10개 모두 시험이 잡음 | 주석 규칙은 처음에 놓쳐 시험 사례를 고쳤다 |
| `node --test plugin/bin/harness-launcher-windows.test.mjs` | 7 pass | 새 사례는 옛 `harness.ps1`에서 `ValidateSet` 거부로 실패 |
| `node --test scripts/windows/package-windows-plugin.test.mjs` | 4 pass | 새 사례는 옛 포장 스크립트에서 실패 |
| 실제 훅 실측(`--plugin-dir`, 프로젝트 역할 정의, Haiku) | PASS | impl-verifier 커밋 R1 거부, `commit:false`에서 dev 커밋 R2 거부, 메인 세션 `git add` 통과. PowerShell만 가진 plan-verifier도 R1 거부, 메인 PowerShell `git add` 통과. 커밋은 생기지 않았다. 훅에 `CLAUDE_PROJECT_DIR`가 넘어오고 `agent_id`는 문자열. 두 번 합쳐 약 $0.05 |
| 훅 실행 시간(이 PC, 중앙값) | Node 직접 86–89 ms, 번들 런처 750–790 ms | 런처는 매번 내장 Node를 검증한다. 커밋·스테이징 명령에서만 든다 |
| `npm test`(Windows, 기준 dev `e2cc5f4`) | 625 pass, 0 fail, 4 skipped | 새 시험 6개와 런처 사례 포함 |
| `npm run test:architecture` | 218 pass, 0 fail, 2 skipped | 포장 사례 2개 포함 |
| `npm run check` | 1 fail(310 pass, 3 skipped) | 실패는 Windows에서만 나는 `scripts/templates/template-release-cli.test.ts`의 0600 프로필 사례로, 이 변경과 무관하다(#299 때도 같았다). 플러그인 lib 동기화, lint(경고 1건은 기존 `codex-main-loop-tools.mjs`), FSD·서버 경계, 문서 검사(202개), 타입 검사는 통과 |
| `npm run verify:fsd`, `npm run verify:server` | PASS | |

## Risks and Rollback

잔여 리스크:

- 놓침: 별칭, 커밋하는 스크립트를 부르는 경우, `cmd /c` 같은 다른 실행기, `git $(echo commit)` 같은 형태, 따옴표 안의 명령 치환은 찾지 못한다. 이 훅은 보안 경계가 아니라 안전망이다.
- 오탐: 따옴표 없는 heredoc 본문의 줄이 `git commit`이나 `git add`로 시작하면 명령으로 본다. 역할은 파일을 Write 도구로 쓰므로 드물다.
- 오탐: 검증 역할이 복사본에서 정당하게 커밋하는 경우가 있으면 막힌다. 지금 지시문과 실행 기록에는 그런 경우가 없다. 생기면 거부 이유가 보인다.
- Claude Code가 `agent_type`이나 `if`의 동작을 바꾸면 훅이 조용히 돌지 않을 수 있다. 실패 시 통과라 셸은 막히지 않는다. CLI를 올릴 때 실측 방법을 다시 쓴다.
- 커밋·스테이징 명령마다 훅 프로세스가 뜬다. Windows 번들은 PowerShell 런처라 더 느리다.

롤백 방법:

- 판을 다시 올려 hooks.json에서 항목을 빼면 된다. 서버와 데이터는 바뀌지 않는다.

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
