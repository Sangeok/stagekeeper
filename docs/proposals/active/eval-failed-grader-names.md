---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-17"
approved-by: "user"
approved-at: "2026-11-17"
approval-scope: "제안서의 설계와 그에 따른 구현·로컬 검증. 커밋·PR과 #353 댓글은 실행 직전에 각각 따로 승인받는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/verification.md"
  - "docs/proposals/active/dual-client-ci-parity.md"
  - "docs/proposals/completed/2026-11-12-gate-run-records.md"
  - "https://github.com/Sangeok/stagekeeper/issues/353"
---

# agent-eval 요약에 실패한 판정 이름 남기기

## Summary

`agent-eval`이 실패해도 지금 요약으로는 어느 판정(grader)이 실패했는지 알 수 없다. 사례마다 점수, 실행 수, 실패한 실행 수만 남기 때문이다. 사례마다 실패한 판정의 이름과 그 판정이 실패한 실행 수를 허용 필드로 추가한다. 판정 이름은 `plugin/evals/<사례>/case.yaml`에 정해진 식별자라 모델 출력이 아니므로, 공개 로그에 원문을 남기지 않는다는 규칙과 맞는다. 합격 판정은 바꾸지 않는다.

## Goal

- 실패한 `agent-eval` 실행에서 사례별로 어느 판정이 몇 번 실패했는지 공개 로그, job summary, 게이트 기록 행에서 읽을 수 있게 한다.
- #353의 후속 2를 처리한다. 후속 1(간헐 실패의 원인 조사)은 이 변경으로 다음 실패를 읽은 뒤 따로 다룬다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 바뀌는 파일은 넷이고 롤백은 revert 하나다.
- 다만 게이트 기록(#319) 행의 eval 사례 항목에 필드가 하나 늘어난다. 데이터 구조 변경이므로 standard로 둔다.

## Current State

- `scripts/rehearsals/agent-eval-summary.mjs`의 `evalRecord`는 실행마다 판정을 하나씩 확인해 실패한 실행 수(`failedRuns`)를 센다. 어느 판정이 실패했는지는 그 자리에서 버린다.
- `summarizeEval`은 사례마다 `name`, `score`, `runs`, `failedRuns`만 허용한다. 사람이 읽는 줄(`evalLines`)도 같은 값만 출력한다. `gate-record.mjs`는 `agent-eval` 행을 `summarizeEval`로 걸러 적는다.
- #342 전에는 workflow가 실행마다 `run 2: … generator-ran=fail …` 같은 줄을 출력해서 실패한 판정을 알 수 있었다. 2026-11-10 실행 42821658109가 그 예다. #342는 공개 로그에서 셸 명령과 assistant 메시지를 지웠고(REQ-DCP-009), 그 출력과 함께 실행별 판정 결과도 빠졌다.
- 그래서 2026-11-17 실행 43994281918의 `first-connection-asks-before-writing` 실패(점수 0.93, 3번 중 1번)는 어느 판정이 실패했는지 알 수 없다. #352에서 원인을 "미확인"으로 닫았다.

## Scope

포함 범위:

- `evalRecord`가 사례마다 실패한 판정의 이름과 실패한 실행 수를 모은다.
- `summarizeEval`이 그 값을 허용 필드로 남긴다. 같은 필터를 쓰는 게이트 기록 행에도 그대로 실린다.
- `evalLines`가 사람이 읽는 줄 끝에 그 값을 덧붙인다.
- 시험과 `verification.md`의 설명을 고친다.

제외 범위:

- 합격 판정(`result`, `gateComplete`)과 `failedRuns`의 계산은 바꾸지 않는다.
- 판정 결과 말고 실행 자체의 오류(`error`)나 판정 누락의 내용은 남기지 않는다. 그런 실행은 지금처럼 `failedRuns`에만 잡힌다.
- 게이트 기록 행의 `schema` 번호와 행의 사람이 읽는 줄은 바꾸지 않는다. 근거는 Safety Analysis에 있다.
- CI 동등화 제안서의 공통 판정(`client-ci-contract.mjs`)은 바꾸지 않는다.
- 간헐 실패의 원인 조사(#353 후속 1)와 eval 사례·init 스킬의 수정은 하지 않는다.

## Proposal

**새 필드.** 사례 항목에 `failedGraders`를 둔다. 그 사례의 판정 이름을 키로, 그 판정이 기록됐지만 통과하지 못한 실행 수를 값으로 갖는 객체다. 실패한 판정이 없으면 필드를 두지 않는다.

```json
{"name":"first-connection-asks-before-writing","score":0.93,"runs":3,"failedRuns":1,"failedGraders":{"generator-ran":1}}
```

**모으는 규칙(`evalRecord`).**

- 실행마다 `passed !== true`인 판정의 이름을 모은다. 한 실행 안에서 같은 이름은 한 번만 센다.
- `GATE_CASES`에 있는 그 사례의 판정 이름만 센다. 모르는 이름은 버린다.

**남기는 규칙(`summarizeEval`).**

- `GATE_CASES`에 있는 사례에서, 그 사례의 판정 이름이고 값이 1 이상의 정수인 키만 남긴다.
- 키 순서는 `GATE_CASES`의 순서로 고정한다. 한 번 거른 요약을 다시 걸러도 같은 값이 나온다.

**사람이 읽는 줄(`evalLines`).** 실패한 판정이 있을 때만 끝에 붙인다.

```text
first-connection-asks-before-writing: score 0.93 over 3 runs, 1 failed (failed graders: generator-ran 1)
```

## Affected Files

| 경로 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `scripts/rehearsals/agent-eval-summary.mjs` | update | 위 세 규칙 | low: 합격 판정 코드는 그대로다 |
| `scripts/rehearsals/agent-eval-summary.test.mjs` | update | 실패한 판정의 집계, 모르는 이름 제외, 판정이 아닌 오류, 다시 거르기, 출력 줄 | none |
| `docs/architecture/verification.md` | update | `agent-eval` 설명과 도구 표의 출력 필드 목록 | none |
| `docs/proposals/active/eval-failed-grader-names.md` | add | 이 문서 | none |

## Safety Analysis

- **공개 출력.** 남는 값은 `GATE_CASES`에 있는 판정 이름과 정수뿐이다. `GATE_CASES`는 시험이 `plugin/evals/<사례>/case.yaml`과 같은지 확인하는 공개 식별자 목록이다. 모델 출력, 셸 명령, 판정의 설명 문구는 남기지 않는다. 결과 JSON에 모르는 판정 이름이나 다른 값이 들어와도 출력과 요약에 나오지 않는 것을 기존 canary 시험 방식으로 확인한다.
- **게이트 기록 행.** `gate-record.mjs`는 job 출력으로 받은 요약을 `summarizeEval`로 한 번 더 걸러 행의 JSON에 싣는다. 그래서 다시 거른 요약이 같은 값을 내는지 보는 시험이 행에 새 필드가 실린다는 근거가 된다. 행을 다시 읽는 코드는 저장소에 없다(`gate-record` 시험과 사람이 읽는 것이 전부). 선택 필드 하나가 늘 뿐이고 실패가 없는 행은 지금과 같다. 그래서 `schema: 1`을 유지한다.
- **CI 동등화 작업과의 관계.** `client-ci-contract.mjs`는 eval 사례에서 `name`, `runs`, `failedRuns`만 꺼내므로 새 필드는 거기서 빠지고 영향이 없다. 이 파일들의 확장은 [CI 동등화](./dual-client-ci-parity.md)의 TASK-DCP3-02가 다룰 영역이지만, 그 제안서는 차단 상태이고 지금 이 코드 파일을 고치는 작업이 없다. 허용 필드를 하나 늘리는 것은 그 제안서의 REQ-DCP-009(원문 대신 허용 필드 요약)와 같은 방향이다. 그 제안서를 고치고 있는 다른 작업의 초안(2026-11-17, 아직 `dev`에 없음)은 원문 진단이 필요하면 승인된 비공개 보관 경로를 쓰고, 그 경로를 고르기 전에는 공개 출력을 넓히지 않는다고 적는다. 이 변경은 원문을 내보내지 않는다. 판정 이름은 저장소의 `case.yaml`에 이미 공개된 식별자다. #342가 지운 것도 셸 명령과 assistant 메시지였다. 그래도 그 작업의 영역이므로 PR과 #353에 이 판단을 적어 그 작업이 이어받을 수 있게 한다.
- **합격 판정.** `failedRuns`, `result`, `gateComplete`의 계산을 건드리지 않는다. 기존 시험이 그대로 통과하는 것으로 확인한다.
- **적용 시점.** 이 스크립트는 출하 플러그인 파일이 아니고 승격 경로 목록에도 없다. 수동 실행은 고른 ref의 코드를 쓰므로 `dev` 병합 뒤 바로 적용된다. 주 1회 예약 실행(월요일 03:00 UTC)은 기본 브랜치 `main`의 코드를 쓰므로 다음 승격 뒤부터 적용된다.

## Approval

승인 메모:

- 추가 조건 없음

## Execution Plan

1. 이 제안서를 승인받는다.
2. 시험을 먼저 고쳐 새 필드가 없어서 실패하는 것을 확인한 뒤, `agent-eval-summary.mjs`를 고친다.
3. `verification.md`의 설명을 고친다.
4. 검증을 돌리고 결과를 이 문서에 적은 뒤 PR 하나로 올린다.
5. 병합 뒤 실제 eval 결과로 확인하는 것은 다음 `agent-eval` 실행(수동 또는 승격 뒤 예약 실행)에 맡긴다. 이 확인만을 위해 모델을 돌리지 않는다.

## Verification Plan

실행할 검증:

```bash
node --test scripts/rehearsals/agent-eval-summary.test.mjs scripts/rehearsals/gate-record.test.mjs scripts/rehearsals/client-ci-contract.test.mjs
npm run test:scripts
npm run docs:check
npm run verify:ci-coverage
npx eslint scripts/rehearsals/agent-eval-summary.mjs scripts/rehearsals/agent-eval-summary.test.mjs
```

검증 기준:

- 3번 중 1번 `generator-ran`이 실패한 결과에서 사례 항목이 `failedGraders: {"generator-ran": 1}`을 갖고, 출력 줄 끝에 `(failed graders: generator-ran 1)`이 붙는다.
- 모르는 판정 이름, 숫자가 아닌 값, 다른 사례의 판정 이름은 요약과 출력 줄에 나오지 않는다.
- 판정 결과 없이 `error`만 있는 실행은 `failedRuns`에만 잡히고 `failedGraders`를 만들지 않는다.
- 실패가 없는 결과의 요약과 출력 줄, 합격 판정이 지금과 같다.
- 실패한 시험이 있으면 `dev` `aea8ae5`에서 같은 시험을 돌려 기존 실패인지 구분한다.

## Verification Results

모두 2026-11-17 이 PC(Windows)에서 `dev` `aea8ae5` 기준 작업 폴더로 실행했다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 코드를 고치기 전 `node --test scripts/rehearsals/agent-eval-summary.test.mjs` | 새 시험 셋 중 둘 실패, 기존 10개 통과 | 실패한 판정 집계와 기록 필터 시험이 새 필드가 없어서 실패했다. 나머지 하나는 모르는 이름과 판정 없는 오류를 걸러 내는 시험이라 고치기 전에도 통과한다 |
| 고친 뒤 같은 시험 | 13개 모두 통과 | |
| 일부러 넣은 결함 6가지 | 모두 시험이 잡음 | 사례 필터 없이 세기(시험 4), 0을 남기기(시험 5), 한 실행 안의 중복을 두 번 세기(시험 3), `passed`가 없는 판정을 빼고 세기(시험 3), 기존 실패 실행 판정에서 `passed`가 없는 판정을 통과로 보기(시험 3), 기록 필터를 건너뛰기(시험 5). 처음 시도에서 살아남은 결함 하나(사례 필터를 두 곳에서 하던 것)는 중복이라 한 곳을 지웠다. 바꾸기 전후 파일이 다른 것을 먼저 확인했다 |
| `node --test` 대상 시험 셋(`agent-eval-summary`, `gate-record`, `client-ci-contract`) | 44개 중 43개 통과 | 실패 1개는 아래 `gate-record`의 줄바꿈 문제다 |
| `npm run test:scripts` | 538개 중 522개 통과, 7개 실패, 9개 건너뜀 | 실패 7개는 모두 이 PC 환경 때문이다. 생성된 Prisma client가 없는 작업 폴더라서 5개(`template-release-cli`, `template-seed-query`, 두 smoke 리허설 시험, `project-availability-runtime`), 작업본이 CRLF라 `action.yml`을 `\n`으로 나누지 못해서 1개(`gate-record`), Windows가 symlink 생성을 거부해서(`EPERM`) 1개(`manage-task-worktrees`)다. 실패한 시험 파일 중 바뀐 파일을 읽는 것은 없다. 같은 기준 커밋의 `dev` CI(`check`, Windows·macOS 런타임)는 통과했다 |
| `npx eslint scripts/rehearsals/agent-eval-summary.mjs scripts/rehearsals/agent-eval-summary.test.mjs` | 통과 | |
| `npm run docs:check` | 통과 | Markdown 228개, 상대 링크 1194개 |
| `npm run verify:ci-coverage` | 통과 | |
| 실제 `agent-eval` 실행 | 실행 안 함 | Execution Plan 5번대로 다음 실행에 맡긴다 |

## Risks and Rollback

잔여 리스크:

- 판정이 아니라 실행 자체가 오류로 끝난 실패는 여전히 원인을 알 수 없다. 그 내용은 모델 출력일 수 있어 공개하지 않는다.
- 실제 eval 결과로 확인하는 것은 다음 실행까지 미뤄진다. 결과 JSON의 판정 형식(`graders[].name`, `passed`)은 지금 코드가 이미 쓰는 형식이라 바뀌지 않는다.

롤백 방법:

- PR을 revert한다. 그 사이에 쌓인 게이트 기록 행의 새 필드는 그대로 둬도 읽는 코드가 없다.

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
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
