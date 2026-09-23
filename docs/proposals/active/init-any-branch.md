---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-09-24"
approved-by: "HamSangEok"
approved-at: "2026-09-24"
approval-scope: "A·B·C 전부. 이번 실행은 stagekeeper 쪽(Execution Plan 1~6, dev 병합까지). 플러그인 전달·템플릿·재시드(7~9)는 별도 지시"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/runbook-branch-neutral-commits.md"
  - "docs/proposals/completed/2026-09-11-runbook-drift.md"
  - "docs/architecture/protocol.md"
  - "docs/conventions/product-copy.md"
---

# 어느 브랜치에서 init해도 맞게 동작하게 하기

## Summary

사용자는 대개 기본 브랜치로 옮기지 않고, 쓰던 브랜치에서 바로 `/harness:init`을 실행한다. 런북의
브랜치 고정 문장은 `runbook-branch-neutral-commits`로 이미 지웠다. 그래도 세 군데가 "init은 기본
브랜치에서 한다"를 전제로 남아 있다.

1. **init의 커밋 안내:** init 세션이 "master가 받을 수 있는 곳에 커밋하라"며 브랜치를 옮기라고
   안내한다. 스킬에 정해진 문장이 없어서 모델이 알아서 지어낸 말이다.
2. **등록 브랜치:** 처음 등록할 때 init은 **현재 브랜치**를 `project.branch`로 보낸다. 웹 등록은
   GitHub의 기본 브랜치를 쓰므로 두 경로가 서로 다르다.
3. **런북 판 판정:** 서버는 "마지막으로 init한 곳의 런북 판"을 프로젝트당 하나만 저장한다. 그래서
   브랜치마다 `CLAUDE.md` 판이 달라도 서버는 알 수 없다.

이 제안은 셋을 모두 고친다. 1은 스킬에 안내 문장을 정해 둔다. 2는 등록할 때 저장소의 기본 브랜치를
찾아 보낸다. 3은 세션이 **자기 `CLAUDE.md`에 적힌 판**을 `pipeline_next`에 넘기고, 서버가 그 값으로
판정한다. 고친 뒤의 규칙은 한 줄이다. **어느 브랜치에서 init하든 그 브랜치에 커밋하고, 평소처럼
병합하면 된다.**

## Goal

- 어느 브랜치에서 init해도 같은 결과(등록 값, 생성 파일, 판 판정)가 나오게 한다.
- 브랜치를 옮기라는 안내가 나오지 않게 한다.
- 작업 유형: 플러그인(init 생성기와 스킬) 수정, 서버 MCP 도구 입력 확장, 런북 템플릿 수정, 계약 문서 갱신.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 변경 파일이 5개를 넘는다(Affected Files 참조).
- MCP 도구 `pipeline_next`의 입력 계약이 바뀐다(선택 필드 추가).
- 새 템플릿 변수 `{{runbook_version}}`이 생긴다. 그래서 서버 → 플러그인 → 템플릿 순서로 배포해야
  하고, 롤백도 역순이어야 해서 단순 revert로 끝나지 않는다.

## Current State

### 1. init의 커밋 안내

- 스킬 7단계는 `git status`를 보여 주고 커밋을 사용자에게 맡긴다고만 적혀 있다. 어느 브랜치에
  커밋할지는 말하지 않는다(`plugin/skills/init/SKILL.md:148-151`).
- 2026-09-23과 2026-09-24 mathgic(`test` 브랜치)에서 init 세션이 "You're on the test branch, …
  Commit these files where master will get them."이라고 안내했다. 앞의 한 번은 런북의 "The branch is
  `master`." 문장을 근거로 했다. 그 문장은 `runbook-branch-neutral-commits`로 지웠다. 하지만 스킬에
  정해진 문장이 없는 한, 모델이 같은 안내를 다시 지어낼 수 있다.
- init 산출물(`CLAUDE.md`, `.claude/agents/`, `docs/`, `harness.json`, `harness.lock.json`)은
  git 파일이다. 그래서 init한 브랜치에 커밋하면 그 브랜치를 병합할 때 기본 브랜치로 함께 들어간다.
  브랜치를 옮길 이유가 없다.

### 2. 등록 브랜치

- `--register`는 `git branch --show-current`를 `branch`로 보낸다(`plugin/bin/harness-init.mjs:126-134`).
  분리된 HEAD면 보내지 않고, 서버 기본값 `"main"`을 쓴다(`src/server/project-registration.ts:42`).
- 웹 등록 폼은 GitHub 목록의 `default_branch`를 채운다(`src/fsd/features/create-project/ui/new-project-form.tsx:64`,
  `src/server/github.ts:36`). product-copy도 "It only uses the name and the default branch."라고
  말한다(`docs/conventions/product-copy.md:520`). 즉 init 경로만 계약과 다르다.
- 브랜치는 **처음 만들 때만** 기록된다(`src/server/project-registration-query.ts:81`). 재등록하면 기존
  프로젝트를 그대로 돌려준다. 그래서 이 수정은 새로 등록하는 프로젝트에만 영향이 있다.
- 지금 `project.branch`를 쓰는 템플릿은 없다(`runbook-branch-neutral-commits` 이후). 이 값이 동작에
  미치는 영향은 `blobHref`의 대체 경로뿐인데, 그 경로는 도달하지 않는다. 그래서 이 항목은 동작 수정이
  아니라 **기록의 정합성** 수정이다.
- 기본 브랜치를 로컬에서 알아내는 방법을 실제 저장소 셋(2026-09-24)에서 확인했다.

  | 저장소 | `git symbolic-ref --short refs/remotes/origin/HEAD` | `git ls-remote --symref origin HEAD` | 현재 브랜치 |
  | --- | --- | --- | --- |
  | mathgic | 없음 | `ref: refs/heads/master` | `test` |
  | stagekeeper | 없음 | `ref: refs/heads/main` | `harness/init-any-branch` |
  | harness-smoke | 없음 | `ref: refs/heads/main` | `main` |

  `git clone`으로 받은 저장소에는 `origin/HEAD`가 있다(임시 저장소로 확인). 위 셋처럼 `git init` 뒤에
  remote를 붙인 저장소에는 없다. 그래서 로컬 기호 참조만으로는 부족하고 `ls-remote`가 필요하다.

### 3. 런북 판 판정

- init이 쓴 뒤 `POST /api/runbook`으로 템플릿 원문의 해시를 보고한다
  (`plugin/bin/harness-init.mjs:305-313`). 서버는 그 값을 `Project.runbookVersion` **하나**에 덮어쓴다
  (`src/server/runbook.ts:22-24`).
- `pipeline_next`는 key 없이 부르면 그 저장값으로 판정한다(`src/server/mcp/deps.ts:61-63`,
  `src/server/runbook.ts:29-35`). 입력은 `{key?, project?}`뿐이다(`src/server/mcp/tools.ts:203`,
  `docs/architecture/protocol.md:90`).
- 이 설계(`docs/proposals/completed/2026-09-11-runbook-drift.md`)는 "서버는 저장소 안을 볼 수 없다"를
  전제로 했다. 브랜치별 차이는 검토하지 않았다.
- 틀리는 경우: `feat/x`에서 init을 다시 하면 저장값이 새 판이 된다. 그런데 `master`의 `CLAUDE.md`는
  아직 옛 판이다. master에서 일하는 세션은 stale 안내를 받지 못하고, 옛 런북을 따른다. 반대 순서면
  최신 판을 가진 브랜치가 거짓 stale 안내를 받는다.
- 런북 블록 안에는 판이 적혀 있지 않다. 마커는 `<!-- harness:runbook:start -->`뿐이다
  (`plugin/bin/harness-init.mjs:73`). 런북을 읽는 세션이 자기 판을 알 방법이 없다.

## Scope

포함 범위:

- 플러그인: `--register`가 기본 브랜치를 찾아 보낸다. init이 런북에 `{{runbook_version}}`을 채운다.
  스킬의 커밋 안내 문장을 정한다. 플러그인 버전을 올린다.
- 서버: `pipeline_next`에 선택 입력 `runbook`을 추가한다. 이 값이 있으면 그것으로 판정하고, 없으면
  기존 저장값으로 판정한다.
- 템플릿(harness-templates): 런북이 자기 판을 적고, 개요 호출에 그 판을 넘긴다.
- 계약: `protocol.md`의 `pipeline_next` 행, product-copy §13의 `pipeline_next` 행과
  §`CLAUDE.runbook.md`.

제외 범위:

- `POST /api/runbook`과 `Project.runbookVersion` 제거. 판을 넘기지 않는 옛 런북 세션의 대체 판정으로
  남긴다.
- 이미 등록된 프로젝트의 `branch` 값 정정. 서버가 처음 만들 때만 기록하므로 영향이 없다. 원하면 웹에서
  고친다. 지금은 이 값을 쓰는 템플릿이 없다.
- `blobHref`의 도달하지 않는 대체 경로와 낡은 주석(`runbook-branch-neutral-commits`의 제외 범위와 같음).
- 에이전트 정의(`.claude/agents/*.md`)와 `docs/` 산출물의 판 판정. 이 파일들은 `harness.lock.json`이
  브랜치마다 해시로 추적한다(`plugin/bin/harness-init.mjs:233-238`).
- 웹 화면 알림, init 자동 재실행.

## Proposal

### A. init의 커밋 안내 (플러그인 스킬)

`plugin/skills/init/SKILL.md` 7단계 끝에 다음 문장을 넣는다.

> Commit these files on the branch you are on. They reach the default branch when this branch
> merges, and every branch cut after that has them; branches cut before it don't, as with any
> file. Do not tell the user to switch branches before committing.

`--register` 설명(`SKILL.md:67-69`)의 "reads `origin` and the current branch from git"은
"reads `origin` and the repository's default branch from git"로 바꾼다.

### B. 등록 브랜치 (플러그인 생성기)

`plugin/bin/harness-init.mjs`의 `--register`에서 보낼 `branch`를 아래 순서로 정한다. 앞 단계에서 값을
얻으면 멈춘다.

1. `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` → `origin/<name>`에서 `origin/`을 뗀다.
2. `git ls-remote --symref origin HEAD` → 첫 줄 `ref: refs/heads/<name>\tHEAD`에서 `<name>`을 뽑는다.
   환경 변수 `GIT_TERMINAL_PROMPT=0`을 주고, 제한 시간 10초를 둔다. 자격 증명을 묻느라 멈추거나
   네트워크가 느려 매달리는 것을 막기 위해서다.
3. `git branch --show-current`(지금 동작).
4. 셋 다 비면 보내지 않는다(지금 동작 — 서버 기본값 `main`).

```js
// harness-init.mjs --register (스케치)
const git = (gitArgs, opts = {}) => { /* 기존 헬퍼에 env·timeout 전달 */ };
const fromSymref = git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]).replace(/^origin\//, "");
const fromRemote = fromSymref ? "" : (/^ref: refs\/heads\/(.+)\tHEAD$/m.exec(
  git(["ls-remote", "--symref", "origin", "HEAD"], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 10_000 }),
)?.[1] ?? "");
const branch = fromSymref || fromRemote || git(["branch", "--show-current"]);
```

3번으로 떨어져도 알림 줄은 내지 않는다. `--register`의 출력은 JSON 한 줄이라는 약속이 있고, 스킬이
그것을 읽는다. 시험 도우미는 stdout과 stderr를 합쳐 JSON으로 파싱한다
(`plugin/bin/harness-init.test.mjs:51`, `:486`). 스킬이 쓰는 Bash 도구도 두 출력을 함께 보여 준다.
그래서 stderr로 내도 이 약속이 깨진다. 등록된 `branch`는 출력 JSON에 들어 있으므로 init 요약에서 그대로
보인다.

### C. 런북 판 판정 (템플릿·플러그인·서버)

**C-1. 런북이 자기 판을 적는다 (템플릿)**
`en/CLAUDE.runbook.md`의 개요 호출 두 곳(`:37`, `:70`)을 아래처럼 바꾼다.
`mcp__harness__pipeline_next({})` → `mcp__harness__pipeline_next({ runbook: "{{runbook_version}}" })`

stale 절(`:52-55`) 첫 문장 뒤에 한 문장을 넣는다.

> This document is runbook version `{{runbook_version}}`; every overview call in it sends that
> version, so the answer is about this checkout's copy, not about whichever branch last ran init.

개요 호출은 이 절의 위(`:37`)와 아래(`:70`)에 하나씩 있다. 그래서 "above"처럼 위치를 가리키지 않고
"every overview call in it"이라고 쓴다.

**C-2. init이 판을 채운다 (플러그인)**
`{{runbook_version}}`은 템플릿 **원문**의 해시다. 런북을 렌더할 때만 넣는다. `POST /api/runbook`도
같은 값을 보내도록 한 변수로 묶는다.

해시를 내기 전에 CRLF를 LF로 바꾼다. DB는 seed가 LF로 정규화한 본문을 갖는다(`scripts/seed-templates.ts:32`).
그래서 서버 모드의 `tpl()`은 이미 LF다. 반면 로컬 템플릿 모드(`HARNESS_TEMPLATES_DIR`)는 파일을
정규화하지 않고 그대로 읽는다(`harness-init.mjs:165-169`). 그런데 이 머신의 템플릿 체크아웃은
`core.autocrlf=true`여서 CRLF다. 정규화하지 않으면 런북에 적힌 판이 DB 판과 달라져, 그 런북은 늘
stale로 판정된다. 서버 모드에서는 이 정규화가 아무것도 바꾸지 않는다.

```js
const RUNBOOK_VERSION = runbookVersion(tpl("CLAUDE.runbook.md").replace(/\r\n/g, "\n"));
const runbookVars = { ...vars, runbook_version: RUNBOOK_VERSION };
const runbookBlock = `${RUNBOOK_START}\n${renderTemplate(tpl("CLAUDE.runbook.md"), runbookVars)}\n${RUNBOOK_END}`;
// … POST /api/runbook 본문도 { version: RUNBOOK_VERSION }
```

원문에 `{{runbook_version}}`이라는 글자가 들어 있어도 순환은 없다. 해시는 치환 **전** 원문에서 뽑는다.

**C-3. 서버가 넘겨받은 판으로 판정한다**
- `src/server/mcp/tools.ts`: `pipeline_next` 입력에 `runbook: z.string().optional()`를 더하고, deps에
  넘긴다. 형식 검사는 zod가 아니라 판정 쪽에서 한다. 모양이 틀린 값 때문에 호출 자체가 실패하면 안 되기
  때문이다.
- `src/server/mcp/deps.ts`·`tools.ts`의 `pipelineNext(projectId, key, runbook?)`.
- `src/server/runbook.ts`의 `runbookStale(projectId, db, reported?)`: `reported`가 `/^[0-9a-f]{12}$/`에
  맞으면 `runbookIsStale(reported, bodies)`로 판정하고, 저장값은 읽지도 쓰지도 않는다. 맞지 않거나
  없으면 지금처럼 저장값으로 판정한다. 형식 정규식은 `runbook-query.ts:16`의 `VERSION`과 같은 모양이다.
  두 곳이 갈라지지 않게 `packages/core/runbook.mjs`에 `isRunbookVersion`으로 옮겨 함께 쓴다
  (`plugin/lib/runbook.mjs`는 `scripts/plugin-lib.mjs`가 동기화한다).
- 넘겨받은 판은 저장하지 않는다. 브랜치마다 다를 수 있는 값을 프로젝트 하나에 쓰면 3번 문제가 다시 생긴다.

판정 표:

| 세션의 런북 | `runbook` 입력 | 판정 근거 | 결과 |
| --- | --- | --- | --- |
| 새 판(이 제안 이후) | 자기 판 | 넘겨받은 값 | 그 checkout의 `CLAUDE.md` 기준으로 정확 |
| 옛 판(판을 적지 않음) | 없음 | 저장값(지금 동작) | 지금과 같음. 옛 판은 어차피 현재 템플릿과 달라 stale로 판정되고 init을 안내받음 |
| 모양이 틀린 값 | 무시 | 저장값 | 호출은 성공 |

### C-4. 계약 문구

`docs/architecture/protocol.md:90`의 `pipeline_next` 행:
- 입력 칸 `{key?, project?}`를 `{key?, runbook?, project?}`로 바꾼다.
- 설명 끝에 다음 문장을 더한다. "`runbook`(12자리 소문자 hex)이 있으면 key 없는 개요의 `runbook` 필드는
  그 판이 현재 템플릿과 다를 때만 실린다. 없거나 모양이 틀리면 마지막 init이 보고한 판(`Project.runbookVersion`)으로
  판정한다. 넘겨받은 판은 저장하지 않는다."

`docs/conventions/product-copy.md:626`(§13 `pipeline_next` 행)에서 "Without a key the answer also carries
`runbook: { stale: true, note }` when this repository's `CLAUDE.md` was generated from an older template"
뒤에 다음 문장을 더한다.
> Pass `runbook` — the version written in the calling checkout's `CLAUDE.md` — and the answer judges
> that copy; without it, the version the last init reported.

`docs/conventions/product-copy.md` §`CLAUDE.runbook.md`에 한 줄을 더한다.
> - Runbook version: every overview call is `pipeline_next({ runbook: "{{runbook_version}}" })`, and
>   the out-of-date rule adds "This document is runbook version `{{runbook_version}}`; every overview
>   call in it sends that version, so the answer is about this checkout's copy, not about whichever
>   branch last ran init."

`tools.ts`의 `pipeline_next` 설명 끝 문장("Without a key the answer also carries a runbook field when this
repository's CLAUDE.md was generated from an older template.")은 다음으로 바꾼다.
> Without a key the answer also carries a runbook field when the runbook version you pass (or, without
> one, the version the last init reported) is older than the current template.

### D. 배포 순서

`{{runbook_version}}`은 새 템플릿 변수다. `renderTemplate`은 없는 변수에서 throw한다
(`packages/core/render.mjs:5`). 그래서 새 템플릿이 먼저 DB에 올라가면, 옛 플러그인의 init이
`template var missing: runbook_version`으로 멈춘다(쓰기 없이 exit 1). 순서:

1. 서버와 플러그인 코드를 한 PR로 `dev`에 넣고 → `main`으로 승격한다(fast-forward).
2. 플러그인을 사용자 머신에 전달한다: `claude plugin marketplace update stagekeeper-local` →
   `claude plugin update harness@stagekeeper-local` → 새 세션.
3. 그다음 템플릿을 병합하고 런북만 부분 재시드한다(`runbook-branch-neutral-commits` 7단계와 같은 방법).
4. 대상 저장소에서 `/harness:init`을 다시 실행한다.

순서의 근거는 둘이다.
- **2가 3보다 먼저여야 한다(필수).** 위의 `template var missing` 때문이다.
- **서버(1)가 템플릿(3)보다 먼저인 편이 낫다(권장).** 새 런북이 넘기는 `runbook` 인자를 옛 서버는 읽지
  않는다. `pipeline_next` 스키마는 `.strict()`가 아닌 `z.object`여서 모르는 키로 거부하지 않는다. 그래서
  순서가 바뀌어도 호출은 실패하지 않는다. 다만 서버가 바뀔 때까지 판정이 저장값 기준으로 남는다.

## Affected Files

| 저장소 · 경로 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| stagekeeper · `plugin/skills/init/SKILL.md` | update | A: 커밋 안내 문장, `--register` 설명 | low — 스킬 문구 |
| stagekeeper · `plugin/bin/harness-init.mjs` | update | B: 기본 브랜치 해석. C-2: `runbook_version` 변수 | medium — 등록 경로와 런북 렌더 |
| stagekeeper · `plugin/bin/harness-init.test.mjs` | update | B의 네 경로(`gitRoot()`가 기본으로 기호 참조를 넣음), 픽스처 런북에 `{{runbook_version}}`, 기존 보고 시험 확장, CRLF 시험 | none |
| stagekeeper · `plugin/.claude-plugin/plugin.json` | update | 0.3.2 → 0.3.3(설치가 새 init을 받도록) | low |
| stagekeeper · `packages/core/runbook.mjs` (+ `plugin/lib/runbook.mjs` 동기화) | update | `isRunbookVersion` | low |
| stagekeeper · `packages/core/runbook.test.mjs` | update | `isRunbookVersion` 경계 | none |
| stagekeeper · `src/server/runbook-query.ts` | update | `VERSION` 대신 `isRunbookVersion` | low |
| stagekeeper · `src/server/runbook.ts` | update | C-3: `runbookStale(…, reported?)` | medium — stale 판정 |
| stagekeeper · `src/server/mcp/tools.ts` · `deps.ts` | update | C-3: 입력 스키마·설명·전달 | medium — MCP 계약 |
| stagekeeper · `src/server/mcp/tools.test.mjs` | update | `runbook` 전달, 없을 때 기존 동작 | none |
| stagekeeper · `docs/architecture/protocol.md` | update | `:90` 입력 `{key?, runbook?, project?}`와 판정 규칙 | none |
| stagekeeper · `docs/conventions/product-copy.md` | update | §13 `pipeline_next` 행, §`CLAUDE.runbook.md`의 개요 호출·판 문장 | none |
| harness-templates · `en/CLAUDE.runbook.md` | update | C-1 | low — 새 변수 |
| harness-templates · `templates.test.mjs` | update | 렌더 vars에 `runbook_version`, 두 호출과 판 문장 단언 | none |

## Safety Analysis

- **옛 세션과의 호환:** `runbook`은 선택 입력이고, 없으면 지금 판정 그대로다. 판을 적지 않은 옛 런북은
  현재 템플릿과 해시가 달라 어차피 stale로 판정되고 init을 안내받는다. 그래서 전환 기간에 틀린 "최신"
  판정이 새로 생기지 않는다.
- **판정 입력을 믿어도 되는가:** 세션이 넘긴 판은 그 세션 자신에게 무엇을 안내할지만 바꾼다. 쓰기도
  권한도 바꾸지 않는다. 잘못된 값을 넘겨 봐야 자기 세션이 stale 안내를 받거나 못 받을 뿐이다. 저장하지
  않으므로 다른 브랜치나 세션에는 영향이 없다. 인가는 지금처럼 `scope`와 `guardUnavailable`이 먼저
  한다(`tools.ts:204-208`).
- **등록 경로의 네트워크:** `ls-remote`는 origin에 접속한다. `GIT_TERMINAL_PROMPT=0`과 10초 제한을
  두어 멈추지 않게 하고, 실패하면 지금 동작(현재 브랜치)으로 돌아간다. 등록은 첫 연결에서 한 번만 한다.
- **재등록 멱등성:** 서버는 `(owner, repo)`로 기존 프로젝트를 찾아 돌려주고 `branch`를 갱신하지 않는다.
  그래서 B는 기존 프로젝트를 바꾸지 않는다.
- **시험 재현성:** B의 각 경로는 네트워크 없이 재현된다(2026-09-24 임시 저장소로 확인). 방법은 다음과 같다.
  - 1번 경로: fixture에서 `git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/<name>`
  - 2번 경로: origin을 상대 경로 `fixture/stagekeeper.git`의 bare 저장소로 둔다. `ls-remote --symref`가
    `ref: refs/heads/master\tHEAD`를 낸다. 빈 bare 저장소는 아무것도 내지 않으므로 커밋이 필요하다.
  - 3번 경로: 없는 상대 경로 `missing/stagekeeper.git`을 origin으로 둔다.
  - 4번 경로: 3번 경로의 조건에 더해 HEAD를 분리한다.

  origin이 GitHub 주소로 해석되어야 등록이 진행되므로 상대 경로를 쓴다(5단계 설명 참고).

  기존 시험의 origin `git@github.com:Sangeok/stagekeeper.git`은 2번 경로에서 실제 네트워크(SSH)를 탄다.
  그래서 **`gitRoot()` 도우미가 기본으로 `refs/remotes/origin/HEAD` 기호 참조를 넣는다**
  (`plugin/bin/harness-init.test.mjs:472-477`). 이렇게 하면 기존 `--register` 시험 전부가 1번 경로에서 멈춘다.
  2·3·4번 경로 시험만 기호 참조 없이, origin을 위의 상대 경로로 바꿔 쓴다. 결과적으로
  **네트워크에 접속하는 시험은 없다.**
- **문구 잠금·폐기 표현:** product-copy의 바뀌는 행(§13 `pipeline_next`, §`CLAUDE.runbook.md`)은
  copy-lock 블록 밖이다. 블록은 232·366·383·397·460·874행에서 시작한다. `pipeline_next` 설명은 도구
  설명 잠금 대상도 아니다(`docs/architecture/verification.md`의 §13 잠금은
  `board_transition`·`plan_submit`·`agent_next`). `SKILL.md`는 `retired-copy` 검사 대상이다. 새 문장에
  폐기된 표현("approve the server", "generated .mcp.json" 등)이 없어야 한다.
- **HTML 주석에 기대지 않는다:** 판을 마커 주석이 아니라 런북 **본문**에 적는다. 세션이 CLAUDE.md의
  주석을 볼 수 있는지 확인하지 않았기 때문이다.

## Approval

승인 메모:

- 2026-09-24 소유자가 "이 제안서를 바탕으로 실제 코드 수정을 진행하고 수정 완료 시 dev에 merge"라고
  지시했다. A·B·C 전부를 적용한다.
- A·B·C는 독립적이다. 부분 승인도 가능하다. C만 배포 순서 제약(D)이 있다.

## Execution Plan

1. stagekeeper `harness/init-any-branch`(`origin/dev`에서 분기)에서 계약부터 고친다: C-4의 세 자리
   (`protocol.md:90`, product-copy §13 `pipeline_next` 행, product-copy §`CLAUDE.runbook.md`).
2. `packages/core/runbook.mjs`에 `isRunbookVersion`을 추가한다 → `node scripts/plugin-lib.mjs`로 `plugin/lib`에
   동기화한다 → `runbook-query.ts`가 그것을 쓰게 한다.
3. 서버: `runbookStale`, `pipelineNext`, `pipeline_next` 스키마와 설명.
4. 플러그인: B(기본 브랜치), C-2(`runbook_version`), A(`SKILL.md`), 버전 0.3.3.
5. 시험:
   - `tools.test.mjs`: `runbook`이 deps로 전달되고, 없으면 `undefined`인지.
   - `runbook.test.mjs`: `isRunbookVersion` 경계(12자 소문자 hex만).
   - `harness-init.test.mjs`: B의 네 경로. 각 경로의 fixture는 다음과 같다.
     1. 기호 참조: `gitRoot()` 기본값. 현재 브랜치는 `feature`로 두고, 기호 참조는 `origin/main`을 가리킨다.
     2. `ls-remote`: 기호 참조 없음. origin은 **상대 경로** `fixture/stagekeeper.git`이다. 그 자리에 커밋이 있고
        기본 브랜치가 `master`인 bare 저장소를 만든다.
     3. 현재 브랜치: 기호 참조 없음. origin은 없는 상대 경로 `missing/stagekeeper.git`.
     4. 생략: 3번 조건에 더해 HEAD를 분리한다(커밋 하나를 만든 뒤 `git checkout --detach`).

     origin을 상대 경로로 두는 이유가 있다. 등록은 origin 주소를 `parseRepoUrl`로 owner/repo로 해석하고,
     해석하지 못하면 기본 브랜치를 찾기 **전에** 멈춘다(`harness-init.mjs:122-125`). 그래서 `../remote.git`
     같은 경로나 절대 경로는 쓸 수 없다. 반면 `fixture/stagekeeper.git`은 호스트 없는 짧은 형태
     (`packages/core/repo-url.mjs:21-22`)로 해석되어 owner `fixture`, repo `stagekeeper`가 된다. git에게는
     작업 디렉터리 기준의 로컬 경로다(2026-09-24 임시 저장소로 확인: 해석 성공, `ls-remote`는
     `ref: refs/heads/master\tHEAD`, 없는 경로는 빈 출력). 등록 요청 본문의 owner/repo도 이 값이 된다.
     bare 저장소는 스냅샷을 찍기 전에 만든다. 기존 단언("--register must not write files")이 비교하는
     전후 스냅샷에 둘 다 포함되므로 깨지지 않는다.

     2번(seed 커밋)과 4번(분리 전 커밋)의 커밋은 신원을 명령에 직접 준다:
     `git -c user.name=harness-test -c user.email=harness-test@example.invalid commit -q --allow-empty -m init`.
     이 시험은 `npm test`에 들어 있어 CI에서 돈다(`.github/workflows/check.yml:27`). 그런데 CI 워크플로에는 git
     신원을 설정하는 단계가 없다. 전역 신원이 있는 개발 머신에서만 통과하는 시험이 되지 않도록 하기 위해서다.

     어느 경로에서도 출력 전체가 JSON 하나로 파싱되는지 확인한다.

     `gitRoot()` 위 주석(`harness-init.test.mjs:462-471`)도 고친다. 지금 주석은 두 가지를 말한다. "`-b main`을
     반드시 준다(현재 브랜치가 곧 등록 값이라서)"와 "분리된 HEAD 분기는 미검증으로 남는다"다. 바뀐 뒤에는
     등록 값이 기호 참조에서 온다. 현재 브랜치는 그것과 **달라야** 증명이 된다(`-b feature`). 분리 HEAD는
     4번 경로 시험이 검증한다. 두 문장을 이 사실에 맞게 바꾼다. 브랜치 이름을 명시해야 한다는 이유
     (`init.defaultBranch`가 환경마다 다름)는 그대로 유지한다.
   - C-2는 **서버 모드**(`withServer` + `runAsync`)로 돌린다. 로컬 템플릿 모드는 보고를 건너뛰기 때문이다
     (`harness-init.mjs:304`). 준비와 확인은 다음과 같다.
     - 픽스처 런북(`harness-init.test.mjs:30`)에 `version {{runbook_version}}` 줄을 더한다. 없으면 블록에 판이
       들어갔는지 확인할 수 없다.
     - 기존 시험 "reports the runbook version it just planted"(`:598-612`)를 넓힌다. 이미 보고 본문이
       `runbookVersion(FIXTURES["CLAUDE.runbook.md"])`인지 단언하고 있다. 여기에 심은 `CLAUDE.md`에 같은 값이
       `version <hash>`로 들어갔는지를 더한다.
     - CRLF 시험을 새로 둔다. 서버가 주는 런북 본문을 CRLF로 바꿔도, 보고 값과 블록의 판이 LF 본문의 판과 같은지
       확인한다.
   - `runbookStale`의 판정 표 세 행. `runbook.ts`는 `server-only`라 `tests/server/`에서 주입 DB로 시험한다.
     `@/server/db`를 import하는 모듈도 같은 방식으로 이미 시험하고 있다(`tests/server/board-history.test.ts`가
     `src/server/pipeline/board.ts`를 쓴다). CI는 `npm run test:server`를 돌리지 않는다. 그래서 이 시험은 PR 전에
     로컬에서 반드시 돌리고, 결과를 Verification Results에 적는다.
6. 검증 명령 → `gh pr create --base dev` → 병합 → `main` fast-forward 승격.
7. 플러그인 전달(D-2).
8. harness-templates `harness/runbook-version`(기준은 `harness/server-clean-code`, 병합됐으면 `main`):
   C-1과 `templates.test.mjs`. 렌더 vars에 `runbook_version`을 더한다 → PR → 병합 → 런북 부분 재시드
   → DB 판 대조.
9. mathgic에서 `/harness:init`을 다시 실행한다. 확인할 것은 두 가지다: 런북에 판이 적혔는지, 그 판으로
   부른 `pipeline_next({ runbook })`가 stale을 내지 않는지. mathgic은 프로젝트 토큰(`hs_`)으로 연결되어 있어
   init이 `--print-project` 경로를 탄다(`SKILL.md:61-63`). 그래서 B(`--register`)는 여기서 확인되지 않는다.
   B의 근거는 5단계의 시험이다. 실제 저장소로 확인하려면, 아직 등록하지 않은 저장소에서 사용자 토큰(`hu_`)으로
   기능 브랜치에서 첫 init을 해 봐야 한다.

## Verification Plan

실행할 검증(stagekeeper 루트, Git Bash 기준):

```bash
npm test
npm run test:templates
npm run test:server
npm run check
```

검증 기준:

- 모든 명령이 변경 전과 같은 결과 이상이다. 실패가 있으면 `origin/dev`에서 같은 명령을 돌려 기존
  실패와 신규 실패를 구분한다.
- CI(`.github/workflows/check.yml:26-33`)는 `npm run check`·`npm test`·`npm run test:web`·`build`만 돌린다.
  `npm run test:server`와 `npm run test:templates`는 로컬에서만 돈다. 그래서 두 명령의 결과는 PR 본문과
  Verification Results에 직접 적는다. CI가 녹색이라고 해서 이 둘이 통과했다는 뜻은 아니다.
- `harness-init.test.mjs`: B의 1·2번 경로에서 `branch`가 현재 브랜치(fixture `feature`)가 아니라 기본
  브랜치 값이다. 3번 경로에서는 현재 브랜치 값이 나온다. 4번 경로에서는 등록 요청 본문에 `branch` 키가
  없다. 모든 경로에서 출력 전체가 JSON 하나로 파싱된다.
- 런북 렌더 결과에 `{{runbook_version}}`이 남지 않고 12자리 hex가 들어가며, 그 값이 보고 값과 같다.
- `rg -a -n "pipeline_next\(\{\}\)" plugin/templates/en/CLAUDE.runbook.md`가 아무것도 찾지 않는다.
- 배포 확인(9단계): mathgic 런북 블록의 판이 DB 템플릿 판과 같다. 그 판으로 `pipeline_next`를 부르면
  `runbook` 필드가 없다. 일부러 옛 판 값(`a85859257e4c`)을 넘기면 `runbook.stale`이 나온다. B는 이 단계의
  대상이 아니다(9단계 참고).

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm test` | pass 185 / fail 0 (2026-09-24) | `harness-init.test.mjs` 62개. 새 시험 4개(기본 브랜치 경로 셋, CRLF)와 넓힌 보고 시험 포함 |
| `npm run test:templates` | pass 27 / fail 0 (2026-09-24) | 템플릿은 이번 범위에서 바꾸지 않았다(8단계). 현재 런북은 `{{runbook_version}}`을 쓰지 않으므로, 새 변수를 넘겨도 영향이 없다 |
| `npm run test:server` | pass 5 / fail 0 (2026-09-24) | 새 `tests/server/runbook-stale.test.ts` 3개(판정 표 세 행). CI는 이 명령을 돌리지 않는다 |
| `npm run test:web` | pass 386 / fail 0 (2026-09-24) | `tools.test.mjs`의 `pipeline_next` 전달 시험 포함 |
| `npm run check` | exit 0 (2026-09-24) | `plugin/lib` 동기화 검사·lint·FSD·typegen·tsc·test:architecture(retired-copy 포함) |

결함 탐지 확인(2026-09-24): 구현을 잠깐 옛 동작으로 되돌려 새 시험이 실패하는지 봤고, 확인 뒤 복구했다.
- 등록 브랜치를 `git branch --show-current`로 되돌림 → 2개 실패(기호 참조 경로, `ls-remote` 경로).
- CRLF 정규화 제거 → CRLF 시험 1개 실패.

계획과 달라진 점: product-copy §13 `pipeline_next` 행의 새 문장은 "…generated from an older template" 바로 뒤가
아니라 같은 행의 "The field is absent when the runbook is current." 뒤에 넣었다. 앞의 자리는 "— the note reads …"로
이어지는 한 문장의 중간이라, 그 자리에 넣으면 문장이 깨진다. 내용은 C-4와 같다.

미실행: 7단계(플러그인 전달), 8단계(템플릿·재시드), 9단계(mathgic 확인). 이번 지시 범위는 dev 병합까지다.

## Risks and Rollback

잔여 리스크:

- `ls-remote`는 사설 저장소에서 자격 증명이 필요하다. `GIT_TERMINAL_PROMPT=0`은 HTTPS 자격 증명 프롬프트만
  막는다. SSH 키 암호는 ssh가 터미널에서 직접 물을 수 있다. 이때는 10초 제한 시간이 끝날 때까지 기다린 뒤
  현재 브랜치로 돌아간다. `GIT_SSH_COMMAND`로 `BatchMode`를 강제하지는 않는다. 사용자의
  `core.sshCommand` 설정을 덮어쓰게 되기 때문이다. 이 지연은 첫 등록 한 번에만 생기고, 결과는 지금 동작과 같다.
- 세션이 런북의 판을 실제로 `pipeline_next`에 넘기는지는 모델이 문서를 따르는지에 달렸다. 넘기지 않으면
  저장값 판정(지금 동작)으로 돌아간다. 실제 사이클에서 확인해야 한다.
- 전환 기간에 새 플러그인이 없는 머신은 새 템플릿으로 init하면 멈춘다(D). 이 저장소의 사용자는 소유자
  한 사람이고, D-2를 먼저 하면 피할 수 있다.
- 한 checkout 안에서 `CLAUDE.md`를 손으로 고쳐 판 문장을 지우면 판을 넘기지 못한다. 그때도 저장값
  판정으로 돌아간다.

롤백 방법:

- 템플릿: 이전 판 런북(`a85859257e4c`, harness-templates `4609bf3`)을 부분 재시드한다. 새 변수를 쓰지 않는
  판이므로 새 플러그인과도 맞다.
- 서버: `runbook` 입력을 무시하면 지금 동작이다. revert해도 새 런북 세션의 호출은 실패하지 않는다(zod가
  모르는 키를 버린다).
- 플러그인: 템플릿을 먼저 되돌린 **뒤에** 이전 버전으로 되돌린다. 순서가 바뀌면 init이
  `template var missing`으로 멈춘다.

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
