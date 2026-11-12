---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-11"
approved-by: "requesting-user"
approved-at: "2026-11-11"
approval-scope: "Execution Plan 전체. 템플릿 R2 브랜치부터는 단계마다 결과를 보고하고, 문서와 어긋나면 멈추고 문서를 먼저 고친다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/protocol.md"
  - "docs/architecture/template-releases.md"
  - "docs/test-reports/completed/2026-11-10-template-release-r1-activation.md"
  - "docs/proposals/active/template-release-acceptance-follow-ups.md"
---

# Claude에서 검증 스킬을 플러그인 이름공간으로 부르기

## Summary

Claude Code에서 Stagekeeper는 검증 스킬을 `reconciling-proposals-with-codebase`라는 맨 이름으로
부른다. 같은 이름의 개인 스킬(`~/.claude/skills/`)이 있으면 Claude Code는 플러그인 사본 대신
개인 스킬을 연다. 그 결과 init·watch·백그라운드 실행기가 시작 전 확인에서 멈춘다. Claude만 읽는
문구는 `harness:reconciling-proposals-with-codebase`로 바꾸고, Codex와 함께 읽는 문구(verify 안내문,
plan-verifier 단계)에는 Claude용 이름을 덧붙인다. 템플릿은 R2로 릴리스한다. 고친 곳이 맨 이름으로
되돌아가지 못하게 기존 테스트 세 곳에 문구 검사를 넣는다.

## Goal

- 같은 이름의 개인·프로젝트 스킬이 있어도 Claude 클라이언트가 항상 플러그인이 포함한 검증
  스킬을 쓴다.
- 사용자가 개인 스킬을 옮기거나 이름을 바꾸지 않아도 된다.
- 이 제안이 고친 곳(플러그인의 Claude용 스킬 문서, verify 안내문, Claude runbook, plan-verifier의
  `step:verify`)이 맨 이름만 쓰는 문구로 되돌아가면 PR 또는 템플릿 릴리스 검증에서 실패한다. 다른
  안내문이나 다른 역할 템플릿에 새로 생기는 호출까지 막지는 않는다.
- 작업 유형: 문구 수정(플러그인·서버 안내문·템플릿), 테스트 추가, 템플릿 릴리스.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 5개 이상 파일을 바꾼다.
- 서버가 내려주는 안내문과 프로덕션 템플릿 릴리스를 바꾼다. 되돌리려면 revert와 별도로 릴리스
  포인터를 되돌려야 한다.

## Current State

Claude Code의 이름 해석:

- 맨 이름은 개인 스킬이 플러그인 스킬보다 먼저 잡힌다. 플러그인 스킬은
  `<플러그인 이름>:<스킬 이름>`으로 부르면 개인 스킬과 무관하게 플러그인 사본이 열린다.
- 2026-11-11에 이 Mac에서 `claude -p`로 확인했다. 개인 스킬을 둔 채
  `harness:reconciling-proposals-with-codebase`를 부르면 메인 세션과 서브에이전트 모두 플러그인
  사본을 열었다.
- 플러그인 이름은 `plugin/.claude-plugin/plugin.json`과 `plugin/.codex-plugin/plugin.json`의
  `name`, `.claude-plugin/marketplace.json`의 `plugins[]` 항목 모두 `harness`다(마켓플레이스 자체의
  이름은 `stagekeeper-local`이다). Mac·Windows 설치 묶음 생성기는 플러그인 이름을 바꾸지 않는다.

맨 이름으로 부르는 곳(Claude가 읽는 문구):

| 위치 | 현재 문구 | 누가 읽는가 |
| --- | --- | --- |
| `plugin/skills/watch/SKILL.md:47-49` | preflight the **effective** `reconciling-proposals-with-codebase` package | `/harness:watch` 세션 |
| `plugin/skills/init/references/reconciliation-contract.md:9-13` | Confirm the actual Claude Skill invocation resolves that compatible package; a same-named personal/project skill can shadow the plugin's copy | init·watch 세션 |
| `plugin/skills/init/references/reconciliation-contract.md:21-22` | Resolve the actual `reconciling-proposals-with-codebase` skill | init·watch 세션 |
| `src/server/pipeline/run-rules.ts:47` (`HINT.verify`) | Run your own round first (reconciling-proposals-with-codebase) | 메인 루프 (Claude·Codex 공용) |
| 템플릿 `en/CLAUDE.runbook.md:120-123` | The owner supplies a complete compatible `reconciling-proposals-with-codebase` package | Claude 메인 루프 |
| 템플릿 `en/agents/plan-verifier.md:102` (`step:verify`) | Load your actual resolved `reconciling-proposals-with-codebase` skill | plan-verifier (Claude·Codex 공용) |

- 템플릿 위치는 비공개 저장소 `Sangeok/harness-templates`의 R1 커밋 `8ccb37a` 기준이다. 이
  저장소의 main은 R1 커밋에서 움직이지 않았고 열린 PR이 없다.
- runbook의 "The owner supplies …" 문장은 사실과도 다르다. 2026-10-28 결정 이후 검증 스킬은
  플러그인이 포함한다(`docs/architecture/protocol.md:934-935`).
- 계약 문서는 개인 스킬이 가리는 경우를 알고 있지만 멈추게만 한다. 개인 스킬이 호환되지 않으면
  사용자가 직접 옮겨야 한다.

바꾸지 않아도 되는 곳:

- `plugin/skills/watch/SKILL.md:22`, `plugin/skills/init/SKILL.md:18`, 패키징 스크립트는 파일
  경로(`skills/reconciling-proposals-with-codebase`)를 가리킨다. 이름 해석과 무관하다.
- `en/agents/plan-verifier.md:58`은 스킬을 설명하는 문장이다. 부르는 지시가 아니다.
- Codex는 `~/.claude/skills`를 읽지 않는다. 역할 실행 때 준비한 사본의 실제 경로와 불러온 스킬의
  경로가 같은지 코드로 확인한다(`plugin/runtime/codex-thread.mjs:439`). `en/CODEX.runbook.md`와
  `plugin/codex/skills/`는 그대로 둔다.

영향을 받는 설치본:

- R1에 고정된 실행이 있는 프로젝트는 두 개다(2026-11-12 프로덕션 읽기 전용 조회).
  - `stagekeeper-macos-e2e`(Mac e2e 저장소): 작업 실행은 모두 닫혔고, R1 항목 실행 2개가 열려 있다.
  - `harness-smoke`(Windows PC 소유자 프로젝트): 2026-11-10 06:19–11:31Z에 항목 하나가 dev,
    plan-verifier, impl-verifier, doc-auditor까지 R1으로 끝났다. 열린 R1 실행은 없다. 그날 이
    저장소에 R1과 호환되는 설치본이 있었다는 뜻이다. 클라이언트는 DB로 알 수 없다(`Runner` 행 없음).
    Claude 설치본이면 R2 activate 뒤 다음 사용 때 다시 init해야 하고, Codex 설치본이면 영향이 없다.
- 그 밖의 Windows PC 저장소(`mathgic` 등)는 R0 실행만 있다. 다음 사용 때 어차피 다시 init해야 한다.
- 서버는 설치 기록을 저장하지 않는다(`docs/architecture/template-releases.md:53`,
  `src/server/rest/runbook-handler.ts:54-67`). DB로 알 수 있는 것은 R1에 고정된 실행이 있는
  프로젝트까지다. init만 하고 실행이 없는 저장소는 DB에 보이지 않는다.

R1 템플릿 커밋을 고정해 둔 곳:

- `.github/workflows/client-init-smoke.yml`의 20·98·130행이 `8ccb37a…`를 기본값으로 쓴다.
- `docs/architecture/template-releases.md:8-10`은 R1 활성화와 "이후 모든 실행은 R1 커밋을
  `source_commit`으로 쓴다"는 규칙을 적고 있다.
- R1 때는 활성화 뒤 기록 커밋 `6d229da`에서 두 곳을 함께 바꿨다.

진행 중인 다른 제안서와의 겹침:

- `docs/proposals/completed/2026-11-12-codex-dual-client-runtime-follow-ups.md`가 `plugin/skills/init/SKILL.md`,
  `plugin/skills/watch/SKILL.md`(수동 설치 의존성 해소·안내), `docs/architecture/protocol.md`(실행
  preflight·역할 MCP 승인 지침), 비공개 템플릿 저장소(소스 전달·배포 인수)를 대상으로 든다. 그
  대상 가운데 이 제안이 건드리는 것은 `watch/SKILL.md`의 47-49행 첫 문장, `protocol.md`의 검증
  스킬 문장 뒤, 템플릿의 runbook 항목 하나와 plan-verifier `step:verify` 1번 항목이다.
  `init/SKILL.md`는 바꾸지 않는다. 같은 문장을 다루지 않으므로 순서 제약이 없다.
- `docs/proposals/active/template-release-acceptance-follow-ups.md`는
  `docs/architecture/template-releases.md`를 현재 계약으로 읽고 `docs/test-reports/`에 기록한다. 이
  제안의 변경 PR이 그 문서의 `source_commit` 규칙을 R2 커밋으로 바꾸므로, 변경 PR이 dev에 들어간
  뒤 그 제안서의 후속 인수는 바뀐 규칙을 따른다. 그 제안서의 TPL-F02는 "Windows PC 저장소의 R1
  재init"을 남은 일로 적고 있다. R2를 activate하면 대상이 R2가 되므로 기록 PR에서 그 문구를 R2로
  고친다.
- `docs/proposals/active/runner-usage-limit-installation.md`는 제품 코드를 바꾸지 않는다.

이 저장소 밖에서 얻은 근거(2026-11-11 관측, 구현 때 다시 확인한다):

- 템플릿 문구와 행 번호, main이 `8ccb37a`이고 열린 PR이 없다는 점: `gh api`로
  `Sangeok/harness-templates`를 읽었다.
- 이름 해석: 이 Mac의 Claude Code 2.1.319에서 `claude -p`로 실행했다.
- R1에 고정된 실행이 있는 프로젝트: 프로덕션 DB를 읽기 전용으로 조회했다(2026-11-12).

## Scope

포함 범위:

- 플러그인의 Claude용 문구(`watch/SKILL.md` 1곳, `reconciliation-contract.md` 3곳)와 플러그인 판
  올림(0.6.12 → 0.6.13). dev에서 다른 변경과 합쳐져 0.6.14로 출시됐다.
- 서버 verify 안내문과 제품 문구 표.
- 템플릿 2개 파일과 R2 릴리스(import, activate).
- 문구 검사 3개.
- `docs/architecture/template-releases.md`의 `source_commit` 규칙 갱신(변경 PR).
- R2 활성화 뒤 `client-init-smoke.yml`의 템플릿 커밋 고정값과
  `docs/architecture/template-releases.md`의 활성 릴리스 기록 갱신, 시험 보고서 추가, 이 문서의
  `completed/` 이동, `template-release-acceptance-follow-ups.md`의 TPL-F02 문구 갱신(기록 PR).
- `docs/architecture/protocol.md`에 호출 규칙 기록.
- Mac e2e 저장소 다시 init, 개인 스킬을 둔 채 전체 흐름 확인.

제외 범위:

- Codex runbook, Codex 스킬, Codex 실행 코드.
- 개인 스킬 자체(옮기거나 고치지 않는다).
- 서버 안내문을 클라이언트별로 다르게 내려주는 구조 변경. `decideNext`는 클라이언트를 알지 못하고,
  안내문 하나에 두 이름을 적는 것으로 충분하다.
- CI 환경에 가짜 개인 스킬을 심는 검사. 결과가 모델 판단에 따라 갈리고 출시 직전에만 돈다.
- Windows PC 저장소의 다시 init(다음 사용 때 한다).

## Proposal

아래 영어 문구는 제안이다. 구현 중 다듬을 수 있지만 `harness:` 이름을 쓴다는 점은 바꾸지 않는다.

### 1. stagekeeper 저장소 (변경 PR, dev 대상)

`plugin/skills/watch/SKILL.md:47-49`의 첫 문장("Read that exact reconciliation contract …
supporting files.")만 아래로 바꾼다:

```md
Read that exact reconciliation contract and preflight the verifier this plugin includes,
invoked as `harness:reconciling-proposals-with-codebase`, and all its required supporting
files.
```

- 같은 문단의 나머지 문장("A Codex-only copy …", "Do not infer availability …", "On failure report
  …", "Do not start a review …")은 그대로 둔다.
- 문장은 "Read that exact reconciliation contract"로 시작해야 한다.
  `plugin/bin/harness-watch.test.mjs:749`가 이 구절의 위치로 앞 구간을 잘라 검사한다.

`plugin/skills/init/references/reconciliation-contract.md:9-13`:

```md
Read the installed plugin's `skills/reconciling-proposals-with-codebase/SKILL.md`
and its required supporting files. Invoke the verifier as
`harness:reconciling-proposals-with-codebase`: the plugin namespace opens this package even
when a personal or project skill has the same name. Never invoke it by the bare name.
Do not overwrite conflicting packages during init. Record the resolved absolute path and
plugin version/commit or package checksum, then repeat preflight after reconciliation.
```

- "Do not overwrite conflicting packages during init."는 그대로 둔다.

`plugin/skills/init/references/reconciliation-contract.md:21-22`의 첫 문장("Resolve the actual …
skill available to this Claude Code session.")만 아래로 바꾼다. 뒤따르는 "Read its complete
`SKILL.md` …"부터는 그대로 둔다:

```md
Resolve `harness:reconciling-proposals-with-codebase` in this Claude Code session.
```

- 같은 문서 35행의 "(or reconcile the winning loader conflict)"는 더 맞지 않으므로 지운다.
- 두 플러그인 manifest의 `version`을 `0.6.13`으로 올린다(출시는 0.6.14).

`src/server/pipeline/run-rules.ts:47` (`HINT.verify`)의 해당 구절:

```txt
Run your own round first (reconciling-proposals-with-codebase; in Claude Code invoke it as harness:reconciling-proposals-with-codebase).
```

- `docs/conventions/product-copy.md:980`의 같은 문구를 함께 바꾼다.

`docs/architecture/template-releases.md:8-10`의 `source_commit` 규칙을 이 PR에서 바꾼다. 새 문구
검사가 dev에 들어가는 순간부터 dev에서 돌리는 `template-release.yml`은 R1 커밋으로 검증을 통과하지
못하기 때문이다. 바꿀 내용은 "새 문구 검사가 들어간 코드에서는 R1 원본이 검증에서 실패하므로, 모든
operation이 그 검사를 통과하는 R2 원본 커밋을 `source_commit`으로 쓴다. R2의 SHA와 활성화 날짜는
활성화 뒤 기록한다"이다. SHA를 여기에 적지 않으므로, 4단계의 시험 결과로 R2 커밋이 바뀌어도 이
문서를 다시 고칠 필요가 없다. 8행의 "2026-11-10에 R1(…)을 활성화했다"는 문장은 그대로 둔다. R2를
activate하기 전까지 프로덕션의 활성 릴리스는 R1이다.

`docs/architecture/protocol.md:935`의 "…공개로 포함한다." 문장 바로 뒤(같은 행에서 이어지는 "생성기는
…" 문장 앞)에 규칙을 한 문장 추가한다. Claude Code용 문구는 검증
스킬을 `harness:reconciling-proposals-with-codebase`로 부르고, 맨 이름은 같은 이름의 개인 스킬이
먼저 잡히므로 쓰지 않는다는 내용이다.

문구 검사:

| 파일 | 검사 |
| --- | --- |
| `src/server/pipeline/run-rules.test.mjs` | `HINT.verify`가 `harness:reconciling-proposals-with-codebase`를 포함한다 |
| `plugin/bin/harness-skill-references.test.mjs` | Claude용 스킬 문서(`skills/*/SKILL.md` 가운데 검증 스킬 자신의 `skills/reconciling-proposals-with-codebase/SKILL.md`를 뺀 것)와 `skills/init/references/reconciliation-contract.md`에서 스킬 이름이 나오는 곳은 모두 `harness:` 또는 `skills/` 바로 뒤다 |
| `tests/templates/private-template-release.test.ts` | `en/CLAUDE.runbook.md`에서 스킬 이름이 나오는 곳은 모두 `harness:` 바로 뒤다. `en/agents/plan-verifier.md`의 `step:verify` 구간이 `harness:reconciling-proposals-with-codebase`를 포함한다 |

- 세 번째 검사는 `HARNESS_RELEASE_SOURCE`가 있을 때만 돈다. `template-release.yml`의 검증 단계가
  import 전에 실제 비공개 템플릿을 대상으로 실행한다.
- 템플릿 저장소의 `templates.test.mjs`(`npm run test:templates`)에는 검사를 두지 않고, 이 제안에서
  고치거나 실행하지도 않는다. 그 suite는 그 저장소의 경로·lock v1 계약을 정비한 뒤 따로 실행하기로
  되어 있다(`docs/architecture/protocol.md:126-127`, `docs/architecture/verification.md:833-834`).

### 2. 템플릿 저장소 (`Sangeok/harness-templates`, R2)

`en/CLAUDE.runbook.md:120-123`:

```md
- Complete the verification-skill preflight from `/harness:init` (harness reconciliation
  contract v1). The Stagekeeper plugin includes the verifier. Invoke it as
  `harness:reconciling-proposals-with-codebase`, never by the bare name: a personal skill
  with the same name would load instead. If it is missing or incompatible, stop, update the
  plugin and rerun init. Each reviewing session loads its own copy; a name in a list is not
  proof.
```

`en/agents/plan-verifier.md`의 `step:verify` 1번 항목(102행부터, Claude·Codex 공용). 첫 문장
("Load your actual resolved … supporting files.") 바로 뒤에 아래 문장을 끼워 넣는다:

```md
In Claude Code invoke it as `harness:reconciling-proposals-with-codebase`, the copy the
Stagekeeper plugin includes; a personal skill with the same name would load under the bare name.
```

- 같은 항목의 나머지("Check harness reconciliation contract v1: …"부터 끝까지)는 그대로 둔다. 다만
  "Init checks the owner-supplied package"만 "Init checks the included package"로 바꾼다.

### 3. 활성화 뒤 기록 (기록 PR, dev 대상)

R1 때의 기록 커밋 `6d229da`와 같은 방식이다. R2를 프로덕션에서 activate한 뒤에 한다.

- `.github/workflows/client-init-smoke.yml`의 20·98·130행 기본값을 R2 커밋 전체 SHA로 바꾼다.
- `docs/architecture/template-releases.md`의 같은 문단에 R2 커밋 SHA와 활성화 날짜를 적는다.
- 시험 보고서를 `docs/test-reports/completed/YYYY-MM-DD-<이름>.md`로 추가한다.
- 이 문서를 `docs/proposals/completed/YYYY-MM-DD-claude-verifier-skill-namespace.md`로 옮기고 front
  matter의 `status`, `stage`, `completed-at`, `verification-summary`와 Completion Notes를 채운다.
  시험 보고서의 `related`는 옮긴 뒤의 경로를 가리킨다(`npm run docs:check`가 확인한다). 이 PR의
  `client-init-smoke` 결과, 머지 뒤 dev 재실행, main 승격은 이 커밋 시점에 끝나지 않았으므로
  Completion Notes의 `remaining follow-up`에 적는다. `6d229da`도 같은 방식이었다.
- `docs/proposals/active/template-release-acceptance-follow-ups.md`의 TPL-F02에서 "R1 재init"을 "R2
  재init"으로 고친다.
- 이 PR은 `client-init-smoke.yml`을 바꾸므로 PR에서 `client-init-smoke`가 자동으로 돈다. 입력이
  없어서 새 기본값(R2)으로 돈다. 이 실행이 통과해야 머지한다.

### 4. 설치 상태에 미치는 영향

- Claude runbook은 설치되는 파일이다. R2는 Claude용 설치 지문(`clientSurfaceHash`)이 R1과 다르다.
- 서버는 설치 호환성을 활성 릴리스가 아니라 각 실행에 고정된 릴리스로 판정한다
  (`docs/architecture/template-releases.md:19-21`, `:46-49`). 그래서 R2를 activate한 뒤에도 R1에
  고정된 기존 실행은 R1 설치본으로 계속 진행하고, 새로 시작하는 실행만 R2 설치를 요구한다. 이미
  실행이 있는 보드 항목이 호환되지 않으면 `wait`·`template`을 받는다. 배정 흐름처럼 아직 실행이 없는
  경우에는 head가 `none`과 필요한 `templateRelease`를 받고, 실행도 보드 항목도 생기지 않는다
  (`docs/architecture/template-releases.md:47-48`, `src/server/pipeline/work-run.ts:131`).
- R1에 고정된 실행이 있는 프로젝트는 Current State에 적은 두 곳이다. Mac e2e 프로젝트에 2026-11-10
  기준으로 열려 있던 R1 작업 실행과 AgentRun
  (`docs/test-reports/completed/2026-11-10-template-release-r1-activation.md`의 F1)은 2026-11-12 조회에서
  모두 닫혀 있었다. 남은 것은 R1 항목 실행 2개다. 열린 작업 실행이 있으면 `pipeline_next`가 그것을
  이어 쓰고 거기서 배정된 항목은 R1에 고정되지만, 웹의 Put on the board로 올린 항목은 부모가 없어
  활성 릴리스를 고른다(같은 보고서 99행).
- plan-verifier의 `step:verify`는 서버가 `agent_next`로 내려주는 본문이다. 설치되는 파일은 첫
  `## step:` 앞에서 잘린 사본이다(`packages/core/templates/template-boundary.mjs`). Codex runbook도
  바꾸지 않으므로 Codex용 설치 지문은 그대로일 것으로 본다. 릴리스 검증 출력에는
  `clientSurfaceHash`가 없으므로 R2 체크아웃의 diff로 확인한다. `git diff 8ccb37a <R2 커밋>`이
  `en/CLAUDE.runbook.md`와 `en/agents/plan-verifier.md`만 바꾸고, plan-verifier의 바뀐 행이 모두 첫
  `## step:` 행보다 아래면 Codex에 설치되는 파일은 한 글자도 달라지지 않는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `plugin/skills/watch/SKILL.md` | update | 시작 전 확인이 맨 이름을 쓴다 | low: 문구만 바뀐다 |
| `plugin/skills/init/references/reconciliation-contract.md` | update | 호출 이름과 가림 설명 | low |
| `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | update | 출시되는 플러그인 파일이 바뀌면 판을 올려야 한다 | low |
| `src/server/pipeline/run-rules.ts` | update | 메인 루프의 자체 검토가 맨 이름을 쓴다 | low: Codex도 읽지만 맨 이름을 그대로 남긴다 |
| `docs/conventions/product-copy.md` | update | 안내문 표가 코드와 같아야 한다 | none |
| `docs/architecture/protocol.md` | update | 호출 규칙의 기준 문서 | none |
| `src/server/pipeline/run-rules.test.mjs` | update | 안내문 검사 | none |
| `plugin/bin/harness-skill-references.test.mjs` | update | 플러그인 문구 검사 | none |
| `tests/templates/private-template-release.test.ts` | update | 템플릿 문구 검사 | medium: R1 커밋은 이 검사를 통과하지 못한다(Risks 참고) |
| 템플릿 `en/CLAUDE.runbook.md` | update | 메인 루프의 시작 전 확인 | medium: Claude 설치본이 다시 init해야 한다 |
| 템플릿 `en/agents/plan-verifier.md` | update | plan-verifier의 스킬 호출 | low: 서버가 내려주는 본문 |
| `.github/workflows/client-init-smoke.yml` | update (기록 PR) | R1 커밋 고정값 3곳 | low: R2가 릴리스 검증을 통과한 뒤에 바꾼다 |
| `docs/architecture/template-releases.md` | update (변경 PR, 기록 PR) | 변경 PR: `source_commit` 규칙. 기록 PR: 활성 릴리스 | none |
| `docs/proposals/active/claude-verifier-skill-namespace.md` | add (변경 PR), move (기록 PR) | 이 문서. 기록 PR에서 `completed/`로 옮긴다 | none |
| `docs/test-reports/completed/YYYY-MM-DD-<이름>.md` | add (기록 PR) | 릴리스·Mac e2e 결과 기록 | none |
| `docs/proposals/active/template-release-acceptance-follow-ups.md` | update (기록 PR) | TPL-F02의 "R1 재init"을 R2로 | none |

## Safety Analysis

출시된 판과의 조합. 개인 스킬이 없는 기기는 어느 조합에서도 지금과 같다. `harness:` 이름은
플러그인이 검증 스킬을 포함한 모든 판에서 플러그인 사본을 연다.

| 플러그인 | 템플릿 | 같은 이름의 개인 스킬이 있는 기기 |
| --- | --- | --- |
| 0.6.12 이하 | R1 | 지금과 같다. 시작 전 확인에서 멈춘다 |
| 0.6.12 이하 | R2 | 지금과 같다. 플러그인의 확인 문구가 맨 이름이라 멈춘다 |
| 0.6.13 이상 | R1 | init·watch 확인은 통과한다. runbook과 plan-verifier가 맨 이름이라 메인 루프나 plan-verifier가 `blocked`로 멈춘다. 잘못된 검토로 넘어가지 않는다 |
| 0.6.13 이상 | R2 | 플러그인 사본으로 끝까지 진행한다 |

- 어느 쪽을 먼저 배포해도 실행 중 동작이 지금보다 나빠지는 조합이 없다. 릴리스 절차의 순서
  제약(새 문구 검사가 들어간 코드에서는 R2 커밋을 `source_commit`으로 써야 한다)은 Execution Plan과
  Risks에 따로 적는다.
- 로컬 잠금, 서버 행, 응답 형식은 바꾸지 않는다. 안내문은 값만 바뀌는 문자열이다.

확인한 항목:

- [x] 테스트와 스크립트 참조: `git grep`으로 `plugin`, `src`, `packages`, `scripts`의 스킬 이름
  언급을 모두 분류했다. 호출 문구는 Current State의 표가 전부다.
- [x] 런타임 side effect 또는 초기화 코드: 실행 코드는 바꾸지 않는다.
- [x] 출시된 plugin·서버와 함께 쓰는 상태: 위 조합 표로 확인했다. 로컬 잠금과 응답 형식은
  바꾸지 않으므로 `plugin/bin/harness-released-readers.test.mjs`의 대상이 아니다.
- [ ] R2 activate 뒤 R1 Claude 설치본이 웹에서 보드에 올린 새 항목에 받는 응답(`wait`·`template`)은
  Execution Plan 6단계에서 확인한다.
- [ ] Codex용 설치 지문이 그대로인지는 Execution Plan 2단계의 diff로 확인한다.

## Approval

승인 기록의 단일 기준은 front matter의 `approved-by`, `approved-at`, `approval-scope`입니다.

승인 메모:

- 템플릿 R2 브랜치부터는 단계마다 결과를 보고한 뒤 다음 단계로 넘어간다. 문서와 어긋나는 점이
  나오면 멈추고 문서를 먼저 고친다.

## Execution Plan

1. 변경 PR을 만든다(`harness/claude-verifier-namespace` → `dev`). 이 문서, 플러그인 문구, 안내문,
   `product-copy.md`, `protocol.md`, `template-releases.md`의 `source_commit` 규칙, 문구 검사 3개,
   플러그인 0.6.13을 담는다. (실행 기록: dev에서 다른 변경과 합쳐져 0.6.14로 출시됐다.)
2. 템플릿 저장소에 R2 브랜치를 만든다. 먼저 `8ccb37a`에서 Current State 표의 두 문장이 그대로
   있는지 확인하고, 행 번호가 아니라 그 문장을 기준으로 고친다. R2 체크아웃을 `plugin/templates`
   (gitignore 대상)에 두고, 변경 PR 브랜치에서
   `HARNESS_RELEASE_SOURCE=plugin/templates npm run test:template-release`를 돌린다. Proposal 4절의
   diff 확인도 여기서 한다.
3. stagekeeper PR의 `check`가 통과하면 dev에 머지한다. dev push의 `check` 통과를 확인한다.
   `template-release.yml`이 이것을 요구한다.
4. dev 커밋에서 `client-init-smoke`(`--field template_commit=<R2 커밋 전체 SHA>`)와 `agent-eval`을
   돌린다. `agent-eval`이 끝난 뒤
   `pipeline-smoke`를 `--field templates-ref=<R2 커밋 전체 SHA>`로 한 번 돌린다. `harnessErrors`나
   `stepRefusals`가 0이 아니면 봉인된 기록을 열어 원인을 본다. 원인이 템플릿 문구라서 R2 브랜치를
   고치면 새 커밋으로 2단계의 검사와 이 단계의 `client-init-smoke`, `pipeline-smoke`를 다시 돌린다.
5. 템플릿 R2 브랜치를 main에 fast-forward로 머지한다. import하는 `source_commit`은 4단계에서
   시험한 바로 그 커밋이어야 한다. `npm run verify:plugin-version`과 프로덕션 migrate 상태를
   확인하고 dev를 main으로 fast-forward한다. activate 전에 프로덕션에서 R1에 고정된 실행이
   있는 프로젝트와 그 열린 실행을 읽기 전용으로 다시 확인한다. Current State에 적은 것과 다르면 멈추고
   이 문서를 먼저 고친다. `template-release.yml`로 R2 커밋을 프로덕션에 import한
   뒤 activate한다.
6. Mac의 플러그인을 0.6.14로 올린다. 시험 항목은 웹의 Put on the board로 보드에 올린다. 이
   방식은 열린 R1 작업 실행이 있든 없든 항목을 활성 릴리스(R2)에 고정하고, 다시 init하기 전에도
   항목이 생긴다. 다시 init하기 전에 R1 설치 상태에서 `pipeline_next`를 한 번 불러 그 항목이
   `wait`·`template`과 R2 설치 요구를 받는지 보고 응답을 기록한다. 그다음 다시 init하고, 개인 스킬을
   옮기지 않은 채 그 항목을 인수까지 백그라운드 실행기로 돌린다. R1에 고정된 열린
   실행은 이 제안에서 정리하지 않는다. 다시 init한 뒤 그 실행이 R1 설치를 요구하면 보고서에 적는다.
7. 기록 PR을 만든다(Proposal 3절). PR에서 자동으로 도는 `client-init-smoke`가 새 기본값(R2)으로
   통과하면 dev에 머지한다. 승격 전에 그 dev 커밋에서 `client-init-smoke`를 입력 없이 한 번 더
   돌린다. `npm run verify:plugin-version`과 프로덕션 migrate 상태를
   확인하고 main으로 fast-forward한다. 이 PR은 `plugin/`과 pipeline-smoke 대상 경로를 바꾸지 않으므로
   `agent-eval`과 `pipeline-smoke`는 다시 돌리지 않는다.

## Verification Plan

실행할 검증:

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:server
npm run build
npm run verify:plugin-version
HARNESS_RELEASE_SOURCE=plugin/templates npm run test:template-release
gh workflow run client-init-smoke.yml --ref dev --field template_commit=<R2 커밋 전체 SHA>
gh workflow run agent-eval.yml --ref dev
gh workflow run pipeline-smoke.yml --ref dev --field templates-ref=<R2 커밋 전체 SHA>
```

- `npm run check`는 lint, 문서 검사, 타입 검사, `test:scripts`를 포함한다.
- `test:template-release`는 R2 체크아웃이 `plugin/templates`에 있을 때 돌린다. `npm run
  test:templates`는 돌리지 않는다(Proposal 1절의 문구 검사 설명 참고).
- `run-rules.test.mjs`는 `npm run test:web`에서, `harness-skill-references.test.mjs`는 `npm test`에서
  돈다. `private-template-release.test.ts`는 `HARNESS_RELEASE_SOURCE`가 있을 때만 돈다.

검증 기준:

- 새 문구 검사 3개가 수정 전 문구에서 실패하고 수정 후 통과한다. 템플릿 검사는 R1 체크아웃에서
  실패하고 R2 체크아웃에서 통과한다.
- PR의 `check`, dev의 세 워크플로가 모두 통과한다.
- Mac e2e: 개인 스킬(`~/.claude/skills/reconciling-proposals-with-codebase`)이 제자리에 있는
  상태에서 init이 통과하고, 항목 하나가 인수까지 간다. 메인 루프와 plan-verifier 기록에 불러온
  스킬이 플러그인 사본으로 남는다.
- Mac e2e: 다시 init한 저장소의 `CLAUDE.md`에서 스킬 이름이 나오는 곳이 모두
  `harness:reconciling-proposals-with-codebase`다.
- Mac e2e: 다시 init하기 전 R1 설치 상태에서, 웹에서 보드에 올린 새 항목이 `wait`·`template`과 R2
  설치 요구를 받는다.
- R2 체크아웃의 diff가 Proposal 4절의 조건(두 파일만, plan-verifier는 첫 `## step:` 아래만)을
  만족한다.
- 변경 PR 뒤 `template-releases.md`가 "R1 원본은 새 검사에서 실패하고 R2 원본 커밋을
  `source_commit`으로 쓴다"고 적고 있다.
- 기록 PR의 `client-init-smoke`(입력 없음, R2 기본값)가 통과한다.
- 기록 PR 뒤 `client-init-smoke.yml`에 `8ccb37a`로 시작하는 SHA가 없고, `template-releases.md`에 R2
  커밋 SHA와 활성화 날짜가 있다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `claude -p`로 `harness:` 이름 해석(메인 세션, 서브에이전트) | Passed (2026-11-11) | 개인 스킬을 둔 채 플러그인 사본이 열렸다 |
| `npm run verify:fsd`, `verify:server`, `test:architecture`, `check`, `npm test`, `test:web`, `build` | Passed (2026-11-11, 변경 PR 브랜치) | `check`는 Prisma client 생성 전에는 타입 오류로 실패했고 생성 뒤 통과했다 |
| 새 문구 검사 2개(플러그인, 안내문)가 수정 전 문구에서 실패 | Passed (2026-11-11) | `HEAD`의 두 스킬 문서에서 맨 이름이 잡히고, `HEAD`의 안내문에 `harness:` 구절이 없다 |
| `npm run test:server` | Not run yet | 로컬에서 돌리지 않았다. PR의 `check`가 돌린다 |
| `HARNESS_RELEASE_SOURCE=plugin/templates npm run test:template-release` | Passed (2026-11-11) | R2 `99245ac`에서 4개 통과. R1 `8ccb37a`에서는 새 문구 검사만 실패 |
| R2 diff (Proposal 4절 조건) | Passed (2026-11-11) | 두 파일만 바뀌고, plan-verifier는 103·106행(첫 `## step:`는 54행) |
| `client-init-smoke`, `agent-eval`, `pipeline-smoke` (dev `1bbc940`, R2 `99245ac`) | Passed (2026-11-12) | `pipeline-smoke`의 `harnessErrors` 없음, `stepRefusals` 0. 봉인 기록에서 plan-verifier가 `harness:` 이름으로 플러그인 0.6.14 사본을 연 것을 확인 |
| `pipeline-smoke` (dev `20fe525`, R2) | Passed with `harnessErrors: {"validation_record": 2}` (2026-11-11) | 같은 오류가 이 변경 전 `1eddbc2`에도 있었다. 기록은 당시 키를 아무도 몰라 열지 못했고, 키를 교체했다 |
| 템플릿 main fast-forward, dev → main 승격 | Done (2026-11-12) | 템플릿 main `99245ac`, stagekeeper main `1bbc940`(Vercel 프로덕션 배포 완료) |
| 나머지(R2 import·activate, Mac e2e) | Not run yet | |

## Risks and Rollback

잔여 리스크:

- 새 템플릿 검사가 들어가면 R1 커밋은 `test:template-release`를 통과하지 못한다.
  `template-release.yml`의 검증 단계는 activate에서도 `source_commit`을 대상으로 돈다. activate
  명령 자체는 릴리스 ID와 revision만 받으므로(`template-release.yml:139`), R1으로 되돌릴 때는
  `source_commit`에 R2 커밋을 주고 `release_id`에 R1 릴리스 ID를 준다. R0 원본이 R1 검사에서
  실패하게 된 뒤 R1 커밋을 쓰기로 한 기존 규칙(`docs/architecture/template-releases.md:8-10`)과
  같은 방식이다.
- R2를 activate한 뒤 Mac e2e 저장소는 다시 init할 때까지 새 실행을 시작하지 못한다. R1에 고정된
  기존 실행은 R1 설치본으로 계속 진행하고, 다시 init한 뒤에는 그 실행이 R1 설치를 요구할 수 있다.
  Windows PC의 `harness-smoke`도 2026-11-10에 R1으로 돌았다. 그 설치본이 Claude라면 다음 사용 때
  다시 init해야 한다. 서버가 설치 기록을 저장하지 않으므로 DB로는 R1에 고정된 실행이 있는
  프로젝트까지만 확인할 수 있다.
- Codex에서 안내문과 plan-verifier 본문의 "in Claude Code …" 구절이 혼동을 주는지는
  `pipeline-smoke`가 Claude만 돌리므로 확인되지 않는다. Codex는 준비한 사본을 경로로 확인하므로
  다른 스킬을 쓰게 되지는 않는다. Windows Codex를 다음에 쓸 때 확인한다.
- Claude Code가 플러그인 이름공간 해석을 바꾸면 이 방식이 깨진다. 지금 동작은 2.1.319에서
  확인했다.

롤백 방법:

- 템플릿: 위 방법으로 R1 릴리스를 다시 activate한다. R1 Claude 설치본으로 돌아가려면 다시
  init한다.
- 서버·플러그인: PR을 revert해 dev에 머지하고 플러그인 판을 한 번 더 올려 main으로 승격한다.
  수정 전 문구는 개인 스킬이 없는 기기에서 지금처럼 동작한다.

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
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
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
