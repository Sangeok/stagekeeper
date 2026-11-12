---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-11"
approved-by: "user"
approved-at: "2026-11-12"
approval-scope: "기존 설계·구현·병합 결과를 반영한 완료 처리와 참조 링크 정리. 미확인 정기 실행과 첫 [gate] 발견은 완료를 막지 않는 후속 관찰로 남긴다."
completed-at: "2026-11-12"
verification-summary: "PR #320 구현·CI 통과, 58850a9로 dev 병합 후 main 포함. 세 게이트의 dev 자동 기록, PR record 건너뜀, 과거 실행 3건 수동 보충 확인. 정기 실행·첫 발견의 실제 이슈 생성은 후속 관찰."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "AGENTS.md"
  - "docs/architecture/verification.md"
  - "docs/test-reports/README.md"
  - "docs/proposals/completed/2026-11-12-codex-dual-client-runtime-follow-ups.md"
---

# 게이트 실행의 조회 규칙과 실행 기록 완료

## Summary

게이트 조회 규칙과 실행 기록 기능을 [PR #320](https://github.com/Sangeok/stagekeeper/pull/320)으로 구현·병합했고, `main`에도 포함됐다. 세 게이트의 실제 `dev` 실행이 [기록 이슈 #319](https://github.com/Sangeok/stagekeeper/issues/319)에 행을 남기는 것을 확인했다. 구현·병합 완료를 기준으로 이 문서를 완료 처리하며, 정기 실행과 첫 발견의 실제 이슈 생성은 후속 관찰로 남긴다. 아래 설계와 구현 전 상태는 당시 판단 근거이며, 최종 결과는 Verification Results와 Completion or Closure Notes를 따른다.

제안 당시 승격 전 게이트(`client-init-smoke`, `agent-eval`, `pipeline-smoke`)의 결과는 GitHub에 커밋별로 남았지만, 절차에 실행 전 조회 규칙이 없었다. 다른 PC나 세션이 이미 돌린 게이트를 다시 돌리거나 진행 중인 실행을 취소할 수 있었다. 요약에 클라이언트 버전이 없고 로그는 90일 뒤 사라져, 어느 판이 어느 OS·클라이언트 버전에서 통과했는지를 나중에 확인하기 어려웠다.

구현은 세 가지를 반영했다. 승격 절차에 조회 규칙을 넣었다. 게이트 요약에 클라이언트 버전·OS 버전·플러그인 판을 넣었다. `dev`와 `main`의 게이트 실행마다 고정 이슈에 행을 남기고 실패나 거부가 있으면 별도 이슈를 여는 경로를 추가했다. 플러그인 출하 파일과 서버 코드는 변경하지 않았다.

## Goal

- 어느 PC의 어느 세션이든 같은 명령으로 "이 커밋의 게이트가 이미 돌았는가, 지금 돌고 있는가"를 알고, 같은 실행을 두 번 돌리지 않는다.
- 게이트가 통과한 플러그인 판, 클라이언트 버전, OS 버전이 로그 보존 기간(90일) 뒤에도 남는다.
- 주 1회 정기 실행의 실패와 거부가 사람이 Actions를 열어 보지 않아도 드러난다.
- 한 PC에서 찾은 게이트 문제를 다른 PC에서 이어받을 자리가 생긴다.
- 작업 유형: CI workflow와 리허설 요약의 확장, 저장소 도구 추가, 승격 절차 문서 변경.

## Proposal Size

`proposal-size`: standard

선택 근거:

- workflow 3개, 리허설 스크립트와 요약 필터, 새 도구와 composite action, AGENTS.md, 문서 2개로 5개 이상 파일이 바뀐다.
- workflow의 job 하나에 이슈 쓰기 권한을 새로 준다.
- 공개 저장소의 이슈에 자동으로 글을 쓰는 동작이 생긴다.

## Current State — 구현 전 기록

2026-11-11 `origin/dev` `ae4079c`(플러그인 0.6.14), `origin/main` `b64643f`(플러그인 0.6.12) 기준이다.

게이트 결과의 위치:

- 결과는 커밋으로 조회된다. `gh run list --commit b64643f…`는 그 커밋의 `client-init-smoke`(42932199468), `agent-eval`(42932203430), `pipeline-smoke`(42932669736)와 `check` 등을 돌려준다. 어느 PC에서든 같다.
- [AGENTS.md](../../../AGENTS.md)의 승격 절차는 게이트를 "run"하라고만 적는다. 이미 돈 실행을 다시 쓰는 규칙과 진행 중인 실행을 다루는 규칙이 없다.
- `agent-eval`과 `client-init-smoke`의 `concurrency`는 ref별 그룹에 `cancel-in-progress: true`다. 같은 브랜치에서 새로 돌리면 진행 중인 실행이 취소된다. `pipeline-smoke`는 그룹 하나에 `cancel-in-progress: false`라 새 실행이 뒤에 줄을 선다.
- `agent-eval`과 `pipeline-smoke`는 같은 구독 토큰(`E2E_CLAUDE_OAUTH_TOKEN`)으로 실제 모델을 쓴다. `client-init-smoke`는 모델을 쓰지 않는다.
- `agent-eval`과 `client-init-smoke`의 job 제한 시간은 30분이다. `pipeline-smoke`는 job 120분, 리허설 단계 108분이다. `pipeline-smoke`의 지금까지 실행 27건 가운데 대기열 없이 돈 것은 19분 안에 끝났다. 27분과 30분이 걸린 두 실행(42001805393, 42035171666)은 같은 커밋에 연달아 돌린 것이라 앞 실행을 기다린 시간이 들어간 것으로 보인다.

요약과 버전:

- `client-init-smoke`와 `pipeline-smoke`는 리허설이 허용 필드만 거른 요약 한 줄을 출력하고(`summarize`, `summarizePipeline`), workflow가 그 줄을 job summary에 붙인다. 요약에는 `os`(`win32-x64` 같은 플랫폼 이름), `pluginCommit`, `templatesCommit`, 단계별 결과가 있다. 클라이언트 버전, OS 버전, 플러그인 판 번호는 없다.
- 클라이언트는 실행마다 최신 Claude Code를 설치한다. 버전은 `claude --version`의 로그 한 줄로만 남는다(2026-11-10 `1eddbc2` 게이트 5개 job이 2.1.322, 2026-11-04 정기 실행이 2.1.318). `agent-eval`에는 버전을 찍는 단계가 없고, 요약도 JSON이 아니라 사람이 읽는 줄이다.
- `gh run view`는 job summary를 내주지 않는다. 요약을 읽으려면 로그를 받아 JSON 줄을 찾아야 한다. 로그와 artifact는 90일 뒤 사라진다. `pipeline-smoke`의 봉인 전사는 7일이다.

읽히지 않는 실행:

- 정기 실행은 지금까지 세 번 돌았고(`agent-eval` 2회, `pipeline-smoke` 1회) 모두 녹색이다.
- 그중 2026-11-04 `pipeline-smoke`(41933524529, `main` `7d5c893`)는 녹색이지만 요약에 `harnessErrors`가 `board_propose` 1, `agent_next` 1, `report_submit` 1이고 권한 거부가 1건이다. 이 실행을 읽은 기록은 저장소에 없다.
- 2026-11-10 `1eddbc2` 승격 전 `pipeline-smoke`(42921691891)의 `harnessErrors`(`validation_record` 2)는 조사했지만, 그 내용은 PR 본문([#315](https://github.com/Sangeok/stagekeeper/pull/315))에만 있다.
- 이 저장소에는 이슈가 하나도 없다. 게이트에서 찾은 문제를 넘길 공용 자리가 없다.

기존 문서의 경계:

- [test-reports](../../test-reports/README.md)는 사람이 판정한 보고서를 두는 곳이고 "일시적인 콘솔 로그를 모으는 폴더가 아니다". workflow가 쓰는 파일은 없다. 보고서 front matter의 `observed-environments`는 형식이 자유로워서 클라이언트 버전을 기계로 뽑을 수 없다(예: `codex-cli 0.164.0; 2.1.310 (Claude Code)`, `macOS 26.2 arm64, Codex 0.166.0`).
- [verification.md](../../architecture/verification.md)는 `agent-eval`의 결과 JSON과 대화 기록을 artifact로 올리지 않는다고 정한다. artifact는 로그와 달리 비밀값 가림을 거치지 않기 때문이다.
- 같은 문서는 스크립트와 CI의 경계를 정한다([ADR-0004](../../ADR/0004-organize-repository-scripts.md)). 공통 도구는 인자와 환경 변수로 입력을 받아 결과를 내고, `GITHUB_OUTPUT` 기록과 GitHub 호출은 workflow나 `.github/actions/`의 composite action이 맡는다.

Codex:

- Codex Windows는 모델 없는 `windows-role-runtime`만 CI에서 돈다. 실제 모델 검증은 수동 인수 보고서로 남고 마지막이 0.5.25다(2026-10-28).
- Codex macOS의 실제 모델 CI는 비공개 저장소에서 맥의 일회용 runner로 돈다(2026-11-11 머지된 [#316](https://github.com/Sangeok/stagekeeper/pull/316)이 verification.md에 문서화했다). 검증 대상 커밋을 그 저장소의 파일에 고정하므로 이 저장소의 `gh run list --commit`으로는 찾을 수 없다. 그 요약에는 이미 Codex 버전, 플러그인 판, 번들 해시, 소스·템플릿 커밋이 있다. 그 저장소는 이슈 기능이 꺼져 있고 workflow는 읽기 권한만 쓴다.

## Scope

포함 범위:

- 승격 절차의 조회 규칙(AGENTS.md).
- `client-init-smoke`, `agent-eval`, `pipeline-smoke` 요약에 클라이언트 버전, OS 버전, 플러그인 판 추가. `agent-eval`의 JSON 요약 신설.
- `dev`와 `main`에서 돈 수동 실행과 정기 실행을 고정 이슈에 한 행씩 남기는 `record` job, 행을 만드는 도구, 호출을 묶는 composite action.
- 실패하거나 거부 수가 0이 아닌 실행에 대한 `[gate]` 이슈.
- 수동 인수 결과를 같은 이슈에 한 줄로 남기는 규칙(test-reports README).
- 행 형식의 정의. 비공개 Codex CI 저장소가 같은 형식을 쓸 수 있게 한다.

제외 범위:

- 비공개 Codex CI 저장소의 workflow 변경과 그 저장소의 기록 이슈. 그 저장소의 작업으로 따로 한다.
- Codex CI를 승격 게이트로 올릴지, 공개 뒤 어떤 일에 어떤 실행을 필수로 할지. Codex 공개 준비([RUN-F01~F03](2026-11-12-codex-dual-client-runtime-follow-ups.md))가 정한다.
- Codex Windows의 실제 모델 CI.
- PR에서 도는 `client-init-smoke`와 기능 브랜치에서 수동으로 돌린 실행의 기록. PR의 검사 목록과 Actions에 지금처럼 남는다.
- 기록에서 호환 표를 자동으로 계산하는 일. 읽기 불편해지면 따로 한다.
- 봉인 전사의 보존 기간(7일) 변경, `concurrency` 설정 변경, 클라이언트 버전 고정.
- macOS에서 도는 `pipeline-smoke` job 추가, PC에만 있는 절차 지식을 문서로 옮기는 일.

## Proposal

요구 사항:

| ID | 요구 사항 |
| --- | --- |
| GR-01 | 승격 절차가 게이트를 돌리기 전에 그 커밋의 기존 실행과 끝나지 않은 게이트 실행을 조회하게 한다 |
| GR-02 | 같은 게이트나 구독을 같이 쓰는 게이트의 끝나지 않은 실행이 있으면 기다리고, gate job이 시작된 지 30분이 넘었을 때만 소유자에게 알린 뒤 취소하게 한다 |
| GR-03 | 세 게이트의 요약에 `clientVersion`, `osVersion`, `pluginVersion`이 남는다. 형식이 맞지 않는 값은 요약에서 빠진다 |
| GR-04 | `dev`나 `main`에서 돈 수동 실행과 정기 실행은 끝나면 기록 이슈에 행 하나를 남긴다. 실패한 실행과 취소된 실행도 남긴다 |
| GR-05 | PR 실행과 기능 브랜치 실행은 행을 남기지 않고, 이슈 쓰기 권한이 있는 job도 돌지 않는다 |
| GR-06 | 행과 이슈에 실리는 글은 허용 필드로 다시 거른 값만으로 만든다. 요약 원문을 그대로 붙이지 않는다 |
| GR-07 | gate job이 실패했거나, 요약이 없거나, `harnessErrors`나 `stepRefusals`가 0이 아니면 `[gate]` 이슈를 연다. 같은 workflow와 커밋의 열린 이슈가 있으면 거기에 댓글을 단다 |
| GR-08 | 기록을 읽는 쪽은 `github-actions[bot]`과 저장소 소유자의 댓글만 행으로 센다 |
| GR-09 | 실제 모델 인수 보고서를 완료하면 같은 이슈에 수동 행을 남기는 규칙이 문서에 있다 |
| GR-10 | 플러그인 출하 파일과 서버 코드는 바뀌지 않는다 |

### 1. 조회 규칙

AGENTS.md의 승격 절차에서 게이트를 돌리라는 두 항목 앞에 항목 하나를 넣는다. 뜻은 다음과 같다.

- 게이트를 돌리기 전에 조회한다. 승격하려는 `dev` 커밋의 실행은 `gh run list --commit <sha>`로, 끝나지 않은 실행은 게이트별 `gh run list --workflow <gate>.yml`에서 상태가 `completed`가 아닌 것으로 본다.
- 그 커밋에 끝난 녹색 실행이 있으면 다시 돌리지 않고 그 실행을 쓴다. 다만 입력이 같아야 한다. `client-init-smoke`의 `template_commit`, `pipeline-smoke`의 `templates-ref`와 `scenario`를 다르게 준 실행은 같은 검증이 아니다. `gh run list`는 입력을 보여 주지 않으므로 행의 `templatesCommit`과 `scenario`로 확인한다. `pipeline-smoke`의 "원인이 변경 밖일 때 한 번 다시 돌린다"는 기존 규칙은 그대로다.
- 돌리려는 게이트의 끝나지 않은 실행이 있으면, 다른 커밋의 것이어도 끝날 때까지 기다린다. 같은 브랜치에서 새로 돌리면 진행 중인 `client-init-smoke`와 `agent-eval`이 취소되기 때문이다.
- `agent-eval`과 `pipeline-smoke`는 같은 구독을 쓰므로, 둘 중 하나가 끝나지 않았으면 다른 하나도 기다린다. `client-init-smoke`는 모델을 쓰지 않아 이 둘을 기다리지 않는다.
- gate job이 시작된 지 30분이 넘은 실행은 멈춘 것으로 보고, 소유자에게 알린 뒤 취소한다. `agent-eval`과 `client-init-smoke`는 job 제한 시간이 30분이라 스스로 끝난다. 이 규칙이 실제로 쓰이는 곳은 `pipeline-smoke`다.
- 끝난 실행이 없거나 녹색이 아닐 때만 돌린다.
- 승격 전에 기록 이슈에서 그 커밋의 행을 읽는다. 그 커밋의 `[gate]` 이슈가 열려 있으면 멈춘다. 원인과 판단을 댓글로 남기고 닫은 뒤 진행한다. 다른 커밋의 열린 `[gate]` 이슈는 읽고, 이번 승격에 실리는 변경과 관련이 있으면 멈춘다.
- `record` job이 실패한 실행은 그 job만 다시 돌려 행을 남긴다. 다시 돌린 job은 앞 시도의 gate job 출력을 그대로 받으므로 모델을 다시 쓰지 않는다.

`pipeline-smoke`의 경로 목록을 담은 `git diff --name-only origin/main origin/dev -- …` 줄은 바꾸지 않는다. `pipeline-smoke-steps.test.mjs`가 이 줄을 읽는다.

### 2. 요약에 넣는 값

| 필드 | 형식 | 값을 얻는 곳 |
| --- | --- | --- |
| `client` | `claude` | `pipeline-smoke`와 `agent-eval`에 새로 넣는다. `client-init-smoke`에는 이미 있다 |
| `clientVersion` | `^\d+\.\d+\.\d+$` | `claude --version` 출력의 첫 낱말 |
| `osVersion` | `^\d+(\.\d+){1,3}$` | macOS는 `sw_vers -productVersion`, Windows는 `os.release()` |
| `pluginVersion` | `^\d+\.\d+\.\d+$` | 설치된 플러그인의 `.claude-plugin/plugin.json` |

- 새 모듈 `scripts/rehearsals/gate-environment.mjs`가 버전 문자열을 해석한다. 두 리허설과 `agent-eval` 요약이 같이 쓴다.
- `summarize`와 `summarizePipeline`의 허용 목록에 위 필드를 더한다. 형식이 맞지 않으면 지금의 다른 필드처럼 버린다.
- `agent-eval`은 새 도구 `scripts/rehearsals/agent-eval-summary.mjs`가 결과 JSON에서 요약 한 줄을 만든다. 필드는 `client`, `os`, `osVersion`, `clientVersion`, `pluginVersion`, `pluginCommit`, 사례별 `name`·`score`·`runs`·`failedRuns`, `costUsd`, `seconds`, `result`다. 지금 workflow 안의 인라인 스크립트가 읽는 필드와 같은 필드만 읽는다. `result`는 eval 명령의 종료 코드로 정한다. 사람이 읽는 줄과 job summary는 지금처럼 남긴다.
- 값을 얻지 못해도 리허설을 실패시키지 않는다. 그 필드만 요약에서 빠지고, 게이트의 판정은 지금과 같다.

### 3. 행 형식

기록은 공개 저장소의 고정 이슈 하나에 댓글로 쌓인다. 댓글 하나가 행 하나다. 첫 줄은 사람이 읽는 한 줄이고, 그 아래에 JSON 블록이 온다.

```text
pipeline-smoke · dev 1eddbc2 · success · run 42921691891
```

```json
{
  "schema": 1,
  "workflow": "pipeline-smoke",
  "level": "pipeline",
  "event": "workflow_dispatch",
  "ref": "dev",
  "commit": "1eddbc2ae66ad33b567e20e1b67f4abe582924d0",
  "runId": 42921691891,
  "runAttempt": 1,
  "conclusion": "success",
  "findings": ["harness-errors"],
  "legs": [
    { "leg": "pipeline", "client": "claude", "clientVersion": "2.1.322", "os": "win32-x64", "osVersion": "10.0.20348", "pluginVersion": "0.6.11", "harnessErrors": { "validation_record": 2 }, "stepRefusals": 0, "result": "pass" }
  ]
}
```

- 위는 형식을 보이는 예다. `legs` 항목은 줄였고 `osVersion`은 실제로 잰 값이 아니다. 실제 행에는 거른 요약의 모든 필드가 들어간다.
- `level`은 그 실행이 어디까지 봤는지다. `init`(설치와 init, `client-init-smoke`), `eval`(init 스킬 평가, `agent-eval`), `pipeline`(항목 하나를 배정부터 끝까지, `pipeline-smoke`), `acceptance`(실제 PC의 수동 인수) 넷이다. 비공개 Codex CI의 단계 이름(`init`, `eval`, `pipeline`)과 같다.
- `conclusion`은 gate job의 결과(`success`, `failure`, `cancelled`, `skipped`)다.
- `legs`는 `client-init-smoke`가 넷(OS 2개 × 시나리오 2개), 나머지는 하나다. 요약이 없거나 JSON이 아닌 다리는 `{ "leg": "…", "result": "missing" }`으로 남긴다.
- `findings`는 `gate-failed`, `missing-summary`, `harness-errors`, `step-refusals` 가운데 해당하는 것이다. 없으면 빈 배열이다.
- 비공개 Codex CI가 같은 형식을 쓸 때는 그쪽 요약의 `codexVersion`을 `clientVersion`으로, `sourceCommit`을 `commit`으로 옮기고 `packageSha256`, `pluginVersion`, `templatesCommit`은 같은 이름으로 둔다. 그 작업은 이 제안의 범위 밖이다.

### 4. 기록 job

세 workflow에 `record` job을 붙인다.

```yaml
  record:
    name: record
    needs: [pipeline]
    if: ${{ always() && github.event_name != 'pull_request' && (github.ref == 'refs/heads/dev' || github.ref == 'refs/heads/main') }}
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      issues: write
    steps:
      - uses: actions/checkout@v5
        with:
          persist-credentials: false
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - uses: ./.github/actions/gate-record
        with:
          workflow: pipeline-smoke
          result: ${{ needs.pipeline.result }}
          summaries: ${{ toJSON(needs.pipeline.outputs) }}
          legs: pipeline
```

- 요약은 artifact가 아니라 job 출력으로 넘긴다. 출력은 비밀값 가림을 거치고, 비밀값이 든 출력은 전달되지 않는다. `agent-eval`의 "artifact로 올리지 않는다"는 기존 결정과 맞는다. 출력 한도는 job당 1 MB이고 요약은 1~2 KB다.
- gate job은 요약 줄을 `GITHUB_OUTPUT`에 쓴다. 출력 이름은 `summary_<다리 이름>`이고, `record` job이 `legs` 입력으로 다리 이름을 넘긴다(`pipeline`, `init_skill`, `client-init-smoke`의 넷). `client-init-smoke`는 matrix라 다리마다 다른 이름(`summary_windows_new_user` 등 넷)으로 쓰고, job의 `outputs`에 네 이름을 모두 적는다. 이름이 다르면 다리끼리 덮어쓰지 않는다는 것이 GitHub 문서의 matrix 출력 방식이다. matrix 항목에 `leg` 값을 더해 이름을 만든다.
- `summaries`는 식을 셸 문장에 끼워 넣지 않고 composite action의 입력에서 환경 변수로 넘긴다.
- composite action `.github/actions/gate-record`는 세 가지를 한다. 열린 이슈의 번호·제목·작성자를 `gh api`로 받아 파일에 쓴다. 도구 `scripts/rehearsals/gate-record.mjs`를 불러 댓글 본문, 발견 이슈의 제목·본문, 이미 열린 발견 이슈의 번호를 파일로 받는다. 그 파일로 `gh` 명령을 불러 기록 이슈에 댓글을 달고, 발견이 있으면 5절의 이슈를 열거나 댓글을 단다. 기록 이슈 번호는 이 action의 입력 기본값 한 곳에만 둔다.
- 도구 `gate-record.mjs`는 네트워크를 쓰지 않는다. 입력(workflow 이름, 이벤트, ref, 커밋, 실행 번호, gate job 결과, 요약들)을 검증하고, 요약을 해당 workflow의 필터(`summarize`, `summarizePipeline`, `agent-eval` 요약 필터)로 다시 거른 뒤 행과 글을 만든다. `summarizePipeline`은 실행 집계를 `findings` 아래에서 읽고 요약에는 펼쳐 쓰므로, 도구가 요약을 그 입력 모양으로 되돌려 넘긴다. 거른 결과에 `os`가 없으면 요약이 없는 것으로 본다. 형식이 틀린 입력은 0이 아닌 종료 코드로 끝난다.
- `record` job은 `always()`라 gate job이 실패하거나 취소돼도 돈다. PR 이벤트와 `dev`·`main`이 아닌 ref에서는 job 전체가 건너뛰어진다.
- workflow 전체의 `permissions: contents: read`는 그대로 둔다. gate job은 지금처럼 읽기 권한만 갖는다.

### 5. `[gate]` 이슈

- 제목은 `[gate] <workflow> <커밋 앞 7자>`다. 본문에는 발견 종류, 그 행, 실행 링크, 닫는 조건(원인과 판단을 댓글로 남긴다)을 적는다.
- 같은 제목으로 `github-actions[bot]`이 연 열린 이슈가 있으면 새로 열지 않고 거기에 댓글을 단다. 작성자로 걸러 찾으므로 다른 사람이 같은 제목의 이슈를 만들어도 섞이지 않는다.
- 이슈를 닫는 것이 "검토가 끝났다"는 표시다. 닫힌 뒤 같은 커밋에서 다시 발견이 나오면 새 이슈가 열린다.
- 공개 저장소이므로 봉인 전사의 내용, 비공개 템플릿의 문장, 모델이 쓴 글은 이슈에 붙이지 않는다. 원인은 도구 이름, 거부 사유, 고친 PR로 적는다.
- 발견 기준은 AGENTS.md의 기존 규칙(녹색이어도 `harnessErrors`나 `stepRefusals`가 0이 아니면 전사를 확인한다)과 같다. 권한 거부 수(`denials`)는 행에는 남지만 발견 기준에 넣지 않는다.

### 6. 수동 인수의 행

- 실제 모델로 한 인수 보고서를 `completed/`로 옮길 때, 작성자가 기록 이슈에 수동 행을 댓글로 남긴다. Codex Windows의 인수도 여기에 남긴다.
- 형식은 3절과 같고 `workflow`는 `manual`, `level`은 `acceptance`다. `client`, `clientVersion`, `os`, `osVersion`, `pluginVersion`, `commit`, `result`, 그리고 보고서 경로 `report`를 적는다.
- 판정의 단일 기준은 보고서의 front matter다. 행은 찾아가기 위한 색인이고, 둘이 다르면 보고서가 맞다.
- 이 규칙은 test-reports README의 완료 기준에 한 항목으로 넣는다. 지난 보고서를 옮겨 적는 일은 하지 않는다.

### 7. 비공개 Codex CI와의 경계

- 자동 기록은 실행이 돈 저장소에 남긴다. 공개 게이트는 이 저장소의 이슈에, Codex macOS CI는 비공개 저장소의 이슈에 남긴다. 저장소를 넘어 쓰는 토큰은 만들지 않는다.
- 비공개 쪽 기록이 생기면 공개 기록 이슈의 본문 맨 위에 "Codex macOS CI의 기록은 비공개 저장소에 있다"는 안내를 넣고, AGENTS.md의 조회 항목에 그 기록에서 검토가 끝나지 않은 `reviewRequired`를 확인하라는 문장을 더한다. 그때까지는 #316이 verification.md에 넣은 규칙(`reviewRequired`면 `main` 승격 전에 원문을 검토한다)을 따른다.
- 공개 전까지 Codex CI는 승격 전 필수 게이트가 아니다.

### 8. 문서

- AGENTS.md: 1절의 조회 항목.
- verification.md: 세 workflow 설명에 `record` job과 새 요약 필드, 기록 이슈의 위치와 읽는 명령(작성자로 거르는 `gh api` 한 줄), 스크립트 표에 새 도구 세 개와 composite action.
- test-reports README: 6절의 완료 기준 한 항목.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `AGENTS.md` | update | 승격 절차에 조회 항목 추가. `pipeline-smoke` 경로 목록 줄은 그대로 둔다 | low: 모든 세션이 읽는 규칙이라 문장이 모호하면 잘못 따른다 |
| `.github/workflows/client-init-smoke.yml` | update | matrix에 `leg`, 다리별 출력 넷, `record` job | medium: PR에서도 도는 workflow다. `record`가 PR에서 건너뛰어지는지 확인한다 |
| `.github/workflows/agent-eval.yml` | update | 버전 확인, 요약 도구 호출, 출력, `record` job | low |
| `.github/workflows/pipeline-smoke.yml` | update | 요약 출력, `record` job | low |
| `.github/actions/gate-record/action.yml` | add | 세 workflow가 같이 쓰는 기록 단계. 기존 `smoke-database`와 같은 방식 | medium: `gh` 호출은 시험으로 덮지 못하고 실제 실행으로 확인한다 |
| `scripts/rehearsals/gate-record.mjs`와 시험 | add | 행과 글을 만드는 순수 도구 | low |
| `scripts/rehearsals/gate-environment.mjs`와 시험 | add | 버전 문자열 해석 | low |
| `scripts/rehearsals/agent-eval-summary.mjs`와 시험 | add | `agent-eval` 결과 JSON에서 요약을 만든다 | low: 결과 JSON의 필드는 문서화돼 있지 않다. 지금 읽는 필드만 읽는다 |
| `scripts/rehearsals/client-init-smoke-steps.mjs`, `pipeline-smoke-steps.mjs`와 시험 | update | 허용 목록에 필드 추가 | low |
| `scripts/rehearsals/rehearse-client-init-smoke.ts`, `rehearse-pipeline-smoke.ts` | update | 요약 기록에 버전 값을 채운다 | low: 값을 못 얻어도 실패시키지 않는다 |
| `docs/architecture/verification.md` | update | workflow 설명과 스크립트 표 | low: #316이 넣은 문단 바로 옆을 고친다 |
| `docs/test-reports/README.md` | update | 수동 행 규칙 | none |
| 기록 이슈(GitHub) | add | 저장소 밖의 상태. 소유자 승인 뒤 만든다 | low |

## Safety Analysis

- 쓰기 권한은 `record` job 하나에만 있고 범위는 이슈다. 실제 모델과 비밀값을 쓰는 gate job의 권한은 바뀌지 않는다.
- `record` job은 PR 이벤트와 `dev`·`main` 밖의 ref에서 돌지 않는다. 쓰기 권한이 있는 job이 실행하는 코드는 `dev`나 `main`에 머지된 코드뿐이다.
- 공개 이슈에 실리는 값은 정규식과 열거형으로 다시 거른 필드뿐이다. 요약 필터를 한 번 더 적용하므로, gate job이 뜻밖의 줄을 출력해도 그 글은 실리지 않고 `missing`으로 남는다. 거른 문자열은 `@`를 담을 수 없어 사람을 호출하지 않는다.
- 요약에는 지금도 비밀값이 없고(`containsSecret` 검사와 허용 목록), 출력은 가림을 한 번 더 거친다.
- `record` job이 실패하면 그 실행이 빨갛게 보인다. 기록이 조용히 빠지지 않게 하려는 의도다. gate job의 판정은 `needs` 결과로 따로 남고, 실패한 job만 다시 돌리면 된다.
- 리허설에 더하는 버전 조회는 실패해도 판정에 영향을 주지 않는다.
- 플러그인 출하 파일과 `src/`는 바뀌지 않는다. 판 상승이 없고 `verify:plugin-version`의 대상이 아니다.

확인한 항목:

- [x] 정적 `import` / `export from`: 새 도구는 `client-init-smoke-steps.mjs`와 `pipeline-smoke-steps.mjs`의 필터를 가져온다. 두 모듈은 Node 내장 모듈만 쓰므로 `record` job에 `npm ci`가 필요 없다
- [x] 테스트와 스크립트 참조: `pipeline-smoke-steps.test.mjs`가 AGENTS.md의 경로 목록 줄을 읽는다. 요약 필터에는 허용 목록 시험이 각각 있다(`keeps only allowed summary fields and never a token`, `keeps only allowlisted values in the public summary`). 새 시험은 `test:scripts`의 검색 범위(`scripts/**/*.test.mjs`)에 들어간다
- [x] 런타임 side effect 또는 초기화 코드: 새 부작용은 이슈 댓글과 `[gate]` 이슈 생성뿐이다
- [x] API, 외부 SDK 영향: GitHub 이슈 API를 `gh`로 부른다. 저장소를 넘는 호출은 없다
- [x] 출시된 plugin·서버와 함께 쓰는 상태: 바꾸지 않는다. 변경 경로에 `plugin/`과 `src/`가 없다
- [ ] 잠긴 이슈에 `github-actions[bot]`이 댓글을 달 수 있는지는 확인하지 못했다. 기록 이슈는 잠그지 않고 작성자로 거른다

## Approval

승인 기록의 단일 기준은 front matter의 `approved-by`, `approved-at`, `approval-scope`입니다.

승인 메모:

- 승인 전에 소유자와 정한 것: 끝나지 않은 실행은 옛 커밋의 것이어도 기다리고 30분이 넘으면 알린 뒤 취소한다. `dev`와 `main`에서 돈 실행만 기록한다. 자동 기록은 실행이 돈 저장소에 두고 수동 인수는 공개 이슈에 남긴다. 공개 전까지 Codex CI는 필수 게이트가 아니고, 공개 뒤의 게이트는 공개 준비 작업에서 정한다.
- 승인 때 확인받은 것 두 가지. 30분은 gate job의 시작 시각부터 잰다(대기열에서 기다린 시간은 넣지 않는다). 기다리는 범위는 "같은 게이트, 그리고 구독을 같이 쓰는 `agent-eval`과 `pipeline-smoke`"다. 처음 정할 때는 세 게이트가 모두 같은 구독을 쓴다고 전제했는데, `client-init-smoke`는 모델을 쓰지 않아 범위를 좁혔다.
- 최초 설계 승인은 2026-11-11에 이뤄졌다. 당시 기록 이슈 생성과 구현 PR은 별도 승인 단계로 두었으며, 이후 실제 생성·병합 결과는 아래에 기록했다.

## Execution Plan

다음은 구현 당시 계획이다. 1–5의 수행 결과와 6–7의 후속 범위는 아래 완료 기록에서 구분한다.

1. 준비. 같은 구역의 verification.md를 고친 #316은 2026-11-11 `dev`에 머지됐다(`ae4079c`). 승인된 [검증 스킬 이름 공간 제안](../active/claude-verifier-skill-namespace.md)의 기록 PR이 `client-init-smoke.yml`의 템플릿 커밋 고정값 세 곳을 바꿀 예정이다. 같은 파일을 고치므로 나중에 올리는 쪽이 최신 `dev`에 맞춘다. 기록 이슈를 만들고(소유자 승인) 본문에 목적, 행 형식, 읽는 법, "workflow와 소유자의 댓글만 기록이다"를 적는다. 2026-11-11 소유자 승인을 받아 [#319](https://github.com/Sangeok/stagekeeper/issues/319)로 만들었다.
2. 구현(PR 하나, `dev` 대상). 버전 해석 모듈과 요약 필드, `agent-eval` 요약 도구, 기록 도구, composite action, workflow 3개, AGENTS.md와 문서 2개. 시험을 먼저 쓴다.
3. PR에서 확인. 이 PR은 `client-init-smoke`의 경로에 걸려 PR 실행이 자동으로 돈다. 그 실행에서 `record` job이 건너뛰어지고 gate job 넷이 지금처럼 녹색인지 본다.
4. `dev`에서 확인. 머지 뒤 다음 승격의 게이트로 세 workflow를 `dev`에서 돌린다(`agent-eval`이 끝난 뒤 `pipeline-smoke`). 행 3개가 남는지, `client-init-smoke` 행에 다리 넷이 모두 있는지, 버전 값이 로그의 값과 같은지 본다.
5. 첫 행 보충. 현재 `main` `b64643f`의 게이트 세 실행(42932199468, 42932203430, 42932669736)을 로그에서 읽어 소유자 댓글로 옮긴다.
6. 정기 실행 확인. 승격 뒤 첫 월요일 `agent-eval`과 수요일 `pipeline-smoke`가 `main`에서 행을 남기는지 본다.
7. 후속(별도 작업). 비공개 Codex CI 저장소의 기록과 7절의 안내 문장.

## Verification Plan

실행할 검증:

```bash
node --test scripts/rehearsals/gate-record.test.mjs scripts/rehearsals/gate-environment.test.mjs scripts/rehearsals/agent-eval-summary.test.mjs
node --test scripts/rehearsals/client-init-smoke-steps.test.mjs scripts/rehearsals/pipeline-smoke-steps.test.mjs
npm run test:scripts
npm run check
gh workflow run client-init-smoke.yml --ref dev
gh workflow run agent-eval.yml --ref dev
gh workflow run pipeline-smoke.yml --ref dev
```

요구 사항별 검증:

| ID | 검증 |
| --- | --- |
| GR-01, GR-02 | AGENTS.md 문장 검토. `pipeline-smoke-steps.test.mjs`의 경로 목록 시험이 그대로 통과한다 |
| GR-03 | 요약 필터 시험: 형식이 맞는 값은 남고 틀린 값(공백, 긴 문자열, 다른 글자)은 빠진다. `dev` 실행의 행에 있는 값이 그 실행 로그의 `claude --version`과 같다 |
| GR-04 | 기록 도구 시험: 성공, 실패, 취소, 요약 없음 각각의 행. `dev`의 세 실행이 행을 남긴다 |
| GR-05 | PR 실행에서 `record` job이 건너뛰어진다. 도구 시험: `dev`·`main`이 아닌 ref와 PR 이벤트는 입력 오류로 끝난다 |
| GR-06 | 기록 도구 시험: 모르는 키, 긴 문자열, `@`와 마크다운이 든 값, JSON이 아닌 줄을 넣어도 댓글 본문에 나오지 않는다 |
| GR-07 | 기록 도구 시험: 발견 종류별 판정과 제목. 1eddbc2 `pipeline-smoke` 실행의 발견(`validation_record` 2)과 같은 모양의 요약을 입력으로 쓴다. 이슈를 여는 `gh` 호출은 첫 실제 발견에서 확인한다 |
| GR-08 | verification.md의 읽는 명령으로 기록 이슈를 읽어 행만 나오는지 본다 |
| GR-09 | test-reports README 문장 검토 |
| GR-10 | `git diff --name-only origin/dev -- plugin src`가 비어 있다. `npm run verify:plugin-version` 통과 |

검증 기준:

- 새 시험은 각각 구현을 되돌리면 실패해야 한다.
- 로컬 `npm run check`의 `template-release-cli` 실패("profile selection…")는 이 PC에서 바뀌지 않은 `dev`에서도 나는 기존 실패이고 CI에서는 통과한다. 그 밖의 실패는 신규로 본다.
- 세 workflow의 gate job 결과가 변경 전과 같아야 한다.

## Verification Results

### 구현 당시 로컬 검증

2026-11-11 구현 브랜치(`dev` `e6f43f0` 기준, Windows 11, Node 22)에서 실행한 기록이다. 병합 뒤의 실제 실행 결과는 다음 표에 추가했다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `node --test`로 새 시험 3개와 요약 필터 시험 2개 | 42개 통과 | GR-03~GR-07의 도구 시험 |
| 구현을 한 곳씩 되돌린 18가지 변형 | 18가지 모두 해당 시험이 실패 | 파이프라인 요약 되돌리기, 이벤트·ref 거부, `os` 없는 요약, 작성자·PR 구분, 취소 실행, 형식 검사 등 |
| 과거 실행의 실제 요약을 도구에 입력 | 모든 필드 보존 | `pipeline-smoke` 42921691891(발견 `harness-errors`), `client-init-smoke` 42932199468의 다리 넷(발견 없음) |
| `npm run test:architecture` | 259개 중 255개 통과, 4개 skip | 실패 없음 |
| `npm run check` | lint·경계 검사·문서 검사·typegen·`tsc` 통과. `test:scripts` 359개 중 353개 통과, 5개 skip, 1개 실패 | 실패는 `template-release-cli`의 "profile selection…" 하나로, 이 PC의 기존 실패다 |
| workflow 3개와 action의 YAML 해석 | 통과 | job, 출력, `record` job의 조건과 권한을 읽어 확인 |
| 이 PC에서 버전 읽기 | `clientVersion` 2.1.322, `osVersion` 10.0.26200, `pluginVersion` 0.6.14 | 실제 `claude --version`과 `plugin.json`으로 확인 |

### 병합 후 확인 — 2026-11-12

| 확인 | 결과 | 근거와 한계 |
| --- | --- | --- |
| 구현 PR·CI | 완료 | [#320](https://github.com/Sangeok/stagekeeper/pull/320), 구현 `c7a9480f1e3f3d8ef09f05d0c6cf753c5b89e821`, [check #845](https://github.com/Sangeok/stagekeeper/actions/runs/43021027509) success |
| `dev`·`main` 포함 | 확인 | 병합 `58850a9b9534aa15de62959bf6350829f7f203f9`가 확인한 `origin/dev` `02747f2`와 `origin/main` `1bbc940`의 이력에 포함됨 |
| PR 실행에서 `record` 건너뜀 | 확인 | [client-init-smoke #71](https://github.com/Sangeok/stagekeeper/actions/runs/43021027473): gate job 넷 success, `record` skipped |
| `dev` 설치·init 자동 기록 | 확인 | [43129245160](https://github.com/Sangeok/stagekeeper/actions/runs/43129245160), [기록 행](https://github.com/Sangeok/stagekeeper/issues/319#issuecomment-6810967393): Windows/macOS의 new-user·update 네 다리 모두 pass |
| `dev` init 평가 자동 기록 | 확인 | [43130553739](https://github.com/Sangeok/stagekeeper/actions/runs/43130553739), [기록 행](https://github.com/Sangeok/stagekeeper/issues/319#issuecomment-6811136048): success, 발견 없음 |
| `dev` 파이프라인 자동 기록 | 확인 | [43129163840](https://github.com/Sangeok/stagekeeper/actions/runs/43129163840), [기록 행](https://github.com/Sangeok/stagekeeper/issues/319#issuecomment-6811080622): success, 발견 없음 |
| 버전 필드 | 기록 확인 | 위 세 실행의 commit은 `1bbc940`, client는 2.1.322, plugin은 0.6.14. OS 버전은 Windows 10.0.20348, macOS 15.8.2로 행에 남음. 이번 문서 정리에서 원본 로그 전체를 다시 대조하지는 않음 |
| 과거 실행 3건 수동 보충 | 완료 | #319의 소유자 댓글에 42932199468·42932203430·42932669736 행이 있음. 당시 없던 버전 필드는 추정하지 않음 |
| 새 기록 기능의 정기 실행 | 후속 관찰 | 마지막 `agent-eval` 정기 실행은 11월 9일. 11월 12일 `pipeline-smoke` 정기 실행 43125985220은 구현 전 `b64643f`를 사용했으므로 새 기록 기능의 인수로 세지 않음 |
| 첫 `[gate]` 이슈 생성 | 후속 관찰 | 실제 발견 이슈는 아직 없음. 판정·본문 도구 시험 통과와 실제 GitHub 이슈 생성 확인은 구분 |

자동 기록은 `github-actions[bot]`, 과거 보충 기록은 소유자 `Sangeok`의 댓글임을 확인했다. 이번 완료 정리는 기존 실행·기록을 조회했으며 새 모델 게이트를 실행하지 않았다.

## Risks and Rollback

잔여 리스크:

- `[gate]` 이슈를 여는 경로는 실제 발견이 나올 때까지 실제 실행으로 확인되지 않는다. 도구의 판정과 글은 시험으로 덮는다.
- `agent-eval` 결과 JSON의 필드는 문서화돼 있지 않다. Claude Code가 형식을 바꾸면 요약이 `missing`이 되고 `[gate]` 이슈가 열린다. 게이트 판정 자체는 종료 코드라 영향이 없다.
- 공개 이슈라 누구나 댓글을 달 수 있다. 읽는 쪽이 작성자로 거르지만 사람이 화면으로 읽을 때는 섞여 보인다.
- 행을 남기는 것은 workflow지만, 원인과 판단을 `[gate]` 이슈에 적는 일은 여전히 사람이나 세션의 몫이다. AGENTS.md 규칙으로만 요구한다.
- 조회 규칙은 문장이다. 세션이 따르지 않으면 지금과 같은 중복 실행이 난다. 실제로 어겨지면 조회를 명령 하나로 묶는 도구를 따로 제안한다.
- Codex macOS의 기록은 비공개 쪽 작업이 끝날 때까지 이 설계에 들어오지 않는다.

롤백 방법:

- 구현 PR을 revert한다. 요약 필드와 `record` job이 함께 사라지고 게이트의 판정은 영향을 받지 않는다.
- 기록 이슈와 이미 남은 행은 지우지 않는다. 이슈 본문에 중단을 적고 닫는다.
- AGENTS.md의 조회 항목만 문제가 되면 그 항목만 되돌린다.

## Completion or Closure Notes

코드 구현·병합 완료를 기준으로 2026-11-12 완료 처리했다. #320은 게이트 조회 규칙, 버전 해석과 요약 필터, 기록 도구·composite action, 세 workflow의 `record` job, 관련 운영 문서를 반영했다. 구현 커밋 `c7a9480`은 `58850a9`로 `dev`에 병합됐고 `main`에도 포함돼 있다. PR CI와 실제 `dev` 자동 기록, 과거 행 보충을 확인했다.

다음은 완료를 막지 않는 후속 관찰 또는 기존 별도 작업이다. 미실행 항목을 통과로 바꾸지 않는다.

| 후속 | 상태 | 확인할 때 남길 근거 |
| --- | --- | --- |
| 새 기록 기능이 포함된 첫 정기 실행 | 관찰 대기 | `agent-eval`·`pipeline-smoke`의 schedule 실행과 #319의 대응 행 |
| 첫 실제 발견의 `[gate]` 이슈 생성 | 관찰 대기 | 발견 행과 자동 생성 이슈. 이를 위해 의도적으로 실패나 모델 호출을 만들지 않음 |
| 비공개 Codex CI 기록과 안내 | 원래 범위 밖의 별도 작업 | 해당 저장소의 기록, 공개 이슈 안내와 조회 규칙 갱신 |

이 문서는 `completed/2026-11-12-gate-run-records.md`로 이동했다. 기존 설계와 로컬 검증의 실패·skip 이력은 보존하며, 이번 문서 정리를 새로운 코드 변경·승격·배포로 기록하지 않는다.

## Review Checklist

- [x] 모든 `{placeholder}`와 완료 기록의 `TBD`를 실제 결과로 갱신했다.
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
- [x] `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
