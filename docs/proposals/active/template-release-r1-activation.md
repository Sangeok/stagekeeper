---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-11-06"
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
  - "docs/proposals/active/template-release-versioning.md"
  - "docs/proposals/completed/2026-11-05-template-release-production-cutover.md"
  - "docs/test-reports/completed/2026-11-05-template-release-production-cutover.md"
  - "docs/architecture/template-releases.md"
  - "AGENTS.md"
---

# 템플릿 R1 운영 활성화와 포인터 복구 인수 (TPL4 후반)

## Summary

운영은 2026-11-05에 versioned R0(비공개 템플릿 `fb6ef955`)로 전환했다. 같은 날 서버는 main `62e68dd`(#291, 플러그인 0.6.2)로 올라갔다. 이 서버는 검증이 수렴하지 않는 항목을 보류로 빼는 출구를 갖췄지만, 수렴하지 않는 원인인 검증 경로 5는 R0 템플릿에 그대로 있다.

이 문서는 [R0 전환 계획](../completed/2026-11-05-template-release-production-cutover.md)이 별도 승인으로 남긴 Phase H를 실행하는 절차를 정한다. R1은 그 원인을 고친 Sangeok/harness-templates #16이다. R1을 import하고 activate한 뒤 R0로 포인터를 복구했다가 다시 R1로 돌린다. 이 과정으로 [원 제안서](./template-release-versioning.md) TPL4의 종료 조건과 VFY-TPL-09의 production 부분을 채운다.

## Goal

- 운영 템플릿을 R1으로 바꿔 검증 경로 5의 범위 제한과 계획 검증 정지 규칙을 새 실행에 적용한다.
- 운영 DB에서 활성화와 포인터 복구가 CAS로 동작하는지 확인한다. 기존 실행의 pin이 바뀌지 않는지도 확인한다.
- 어느 단계에서 멈춰도 운영은 직전 포인터 상태로 남게 한다. 데이터 복원이 필요 없는 범위에서만 움직인다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 운영 데이터(release 행, 채널 포인터, 배포 감사 기록)를 쓴다.
- 활성화 뒤에 시작한 실행은 R1에 pin되고, 포인터를 되돌려도 R0로 옮겨지지 않는다(`docs/architecture/template-releases.md` 최초 이관과 복구 절). 그래서 롤백이 단순 revert 이상이다.

## Current State

2026-11-06에 확인한 상태다. 운영 값은 전환 기록 기준이고 Phase A에서 다시 읽는다.

운영:

- main과 dev가 모두 `62e68dd`다. main push의 `check`는 녹색이고, stagekeeper.dev의 `dpl_5fW7SFWF…`가 이 커밋의 Vercel 배포다.
- 채널은 versioned, revision 1, active R0 `fc20ccfd…`, legacy writer 장벽 true다(run 42027310590).
- 운영 사용자는 1명이다(전환 계획 A2, 2026-11-05).
- environment `template-production`은 필수 검토자가 Sangeok이고 배포 브랜치는 `main`뿐이다. secret은 `TEMPLATE_TARGET_PROFILES` 하나가 남아 있다.
- R0 전환의 후속 확인 "첫 실제 실행에서 `agent_next`와 새 AgentRun의 R0 pin"은 아직 기록이 없다.

R1 후보:

- harness-templates #16 head `a2538a5`, base `fb6ef95`(= 템플릿 main = R0)이다. 다른 열린 PR은 없다.
- 바뀌는 파일은 `en/CLAUDE.runbook.md`(+23 −3), `en/CODEX.runbook.md`(+23 −3), `en/docs/plans/verification-paths.md`(+1 −1)이다.
- 검증 증거:
  - `test:template-release`의 수렴 계약 시험(`tests/templates/private-template-release.test.ts:127`)은 `fb6ef95`에서 실패하고 `a2538a5`에서 통과한다(PR #291).
  - pipeline-smoke `truncate`(run 42035176138): pluginCommit `62e68dd`, 템플릿 `a2538a5`로 통과했다. planVerifierPasses 1, 10분, stepRefusals 0, harnessErrors `{}`, 33단계 전부 통과다.
  - 같은 커밋의 R0 대조인 pipeline-smoke `slug`(run 42035171666)도 통과했다.

워크플로와 서비스의 동작(`.github/workflows/template-release.yml`, `src/server/templates/release-service.ts`):

- 검증 job은 operation과 관계없이 `source_commit`에 `test:template-release`를 돌린다(`template-release.yml:74`).
  - `62e68dd`부터는 `fb6ef95`가 수렴 계약 시험에서 실패한다. 그래서 `status`와 R0 포인터 복구를 포함한 이 계획의 모든 실행이 R1 커밋을 `source_commit`으로 쓴다.
  - 전환 계획 E4처럼 `source_commit=<R0 커밋>`으로 `status`를 돌리면 이제 검증 job에서 실패한다.
- ref는 dev 또는 main이어야 하고, 그 SHA에 성공한 `check` push 실행이 있어야 한다(`:54`, `:56`). environment가 `main`만 허용하므로 `--ref main`이다.
- 결과는 job summary에만 쓴다(`:149`). 전환 기록에 따르면 summary는 API로 읽을 수 없다.
- import는 sealed release를 저장한다. 채널은 바꾸지 않고 `{releaseId, revision: 현재, previousReleaseId: active}`를 돌려준다(`release-service.ts:66`–`:84`).
- activate는 채널 행을 잠근 CAS다(`:86`–`:107`).
  - versioned이고 장벽이 true일 때만 받는다. 예상 revision이 다르면 `Stale template channel revision`으로 거부한다.
  - 성공하면 revision을 1 올리고 `{releaseId, revision, previousReleaseId}`를 돌려준다.
  - 포인터 복구도 같은 activate다.
- 요청 ID는 operation마다 한 번 쓴다. 같은 ID에 다른 입력을 넣으면 거부된다. 결과를 잃으면 같은 ID로 `result-*`를 조회한다.
- 이 계획의 revision 흐름은 1(R0) → 2(R1) → 3(R0 복구) → 4(R1)이다.

설치 호환(`src/server/pipeline/template-selection.ts`, `packages/core/templates/release-manifest.mjs`):

- 실행의 pin은 그 실행이 처음 만들어질 때 active에서 고른다. 부모가 있는 실행은 부모 pin을 물려받는다. 포인터가 바뀌어도 기존 pin은 그대로다.
- 설치본은 protocol, language, `clientSurfaceHash`가 같을 때만 호환된다(`release-manifest.mjs:110`–`:113`). hash는 배포 본문 전체로 만들고, 런북에는 설치 지침이 붙는다(`:36`–`:40`).
- #16이 런북을 바꾸므로 R0 설치본과 R1 실행은 서로 호환되지 않는다.
  - 호환되지 않으면 서버는 `Update the installation to template release <id>`와 필요한 templateRelease를 돌려준다(`template-selection.ts:13`–`:17`, `:35`). 이것이 `wait/template`이다.
  - 그래서 R1 활성화 뒤 R0 설치본으로 새 항목을 시작하면 재init을 요구받는다.
  - R1로 재init한 저장소의 R0 pin 실행은 R0 설치본을 요구한다.

클라이언트:

- 이 Mac: user scope `harness@stagekeeper-local` 0.5.33(`7d5c893`)이다. versioned 운영에서는 거부되는 판이다. `stagekeeper-macos-e2e` 저장소는 lock v1이다.
- 사용자의 Windows PC: 0.6.1 번들과 `harness-smoke`·`mathgic`(둘 다 lock v2, R0)이다(전환 G2).
- 운영 전환은 Windows PC의 WSL에서 했다. WSL의 프로필과 secret 값 파일은 지웠다(전환 G7).

CI의 템플릿:

- client-init-smoke는 `fb6ef955`를 고정한다(`.github/workflows/client-init-smoke.yml:20`, `:98`, `:130`).
- pipeline-smoke는 기본값으로 템플릿 저장소 기본 브랜치를 쓴다(`.github/workflows/pipeline-smoke.yml:70`). #16을 머지하면 pipeline-smoke 기본값은 R1이 된다.

## Scope

포함 범위:

- 사전 확인: R0 안정 판정, 운영 집계, 열린 R0 실행의 처분, 클라이언트 목록
- #16 머지와 R1 커밋 확정
- 운영 import, R1 activate, R0 포인터 복구, R1 재활성화(배포 job 네 번)
- 시험 프로젝트 `stagekeeper-macos-e2e`에서 하는 R1 인수와 포인터 복구 인수
- 이 Mac의 0.6.2 설치와 재init
- 기록: 이 문서, 원 제안서 진행 기록, 인수 보고서, client-init-smoke 고정 커밋 갱신 PR

제외 범위:

- 템플릿 본문과 서버·도구 코드 변경. 결함을 찾으면 멈추고 별도 PR로 고친다.
- Codex 경로의 운영 인수. dual-client 문서의 범위다.
- Windows PC 저장소의 재init과 0.6.2 번들. Phase F 뒤 사용자가 편할 때 한다. 아래 Phase G에 안내만 둔다.
- 전환 인수 중 관찰한 `--adopt` 요구, 관리 파일 수정 시 pending, `runbookVersion` 정리(F3–F5)
- 오래된 묶음의 정리, 보존 기간, 캐시, Neon compute

## Proposal

### 결정 필요

| ID | 결정 | 선택지 | 권장 |
| --- | --- | --- | --- |
| D1 | R0 안정 판정 | (a) 기준 충족 (b) 고정 대기 시간(예: 24시간) | (a). 아래 A2의 세 기준을 모두 만족하면 안정으로 본다. 시간만으로는 R0 후속 확인(실제 실행의 pin)을 대신하지 못한다. |
| D2 | R1 커밋 | (a) #16을 merge commit으로 머지한 템플릿 main 커밋 M (b) `a2538a5` 그대로 | (a). M의 tree가 `a2538a5`와 같으면 내용이 같다. 운영과 템플릿 main이 같아져 pipeline-smoke 기본값과 운영이 일치한다. squash는 쓰지 않는다. `a2538a5`가 main 이력에 남아야 smoke 증거가 그대로 이어진다. |
| D3 | 인수에서 새 실행을 만드는 방법 | (a) 시험 프로젝트에 백로그 항목을 추가하고, 이 Mac의 headless Claude로 work-assigner 한 턴(배정)까지만 실행 (b) 실제 작업을 끝까지 실행 (c) 평소 사용에서 관찰 | (a). 전환 G3은 headless Claude로 `project_get`·`pipeline_next`를 부르는 데 $0.28이 들었다. 배정 한 턴을 더해도 구현까지 가지 않으므로 비용과 시간이 작다. 끝나면 항목은 항목 페이지에서 폐기한다. |
| D4 | 결과 읽기 | (a) 사용자가 run 페이지의 summary를 읽음 (b) 브라우저 확장으로 run 페이지를 읽음 (c) 이 Mac에 0600 프로필을 만들어 읽기 전용 CLI로 조회 | (b), 실패하면 (a). 운영 연결 정보를 새 기기에 복제하지 않는다. |
| D5 | 운영 집계 경로 | (a) 이 Mac에서 사용자가 `!`로 운영 env 파일을 지정해 저장소 밖 읽기 전용 스크립트 실행 (b) Windows PC의 WSL | (a). 스크립트는 `BEGIN TRANSACTION READ ONLY` 안에서 집계만 출력한다. 연결 정보는 대화에 남기지 않는다. |
| D6 | 열린 R0 실행 | (a) 활성화 전에 끝내거나 처분 (b) 그대로 두고 그 저장소는 R0 설치본으로 끝까지 진행 | 시험 잔여물(`stagekeeper-macos-e2e`의 ITEM-02·ITEM-03)은 (a), 실제 작업은 A4 결과를 보고 정한다. 사용자가 1명이라 C–F 동안 실제 프로젝트에서 새 항목을 시작하지 않는 것으로 충분하다. |

### Phase A — 사전 확인 (운영 쓰기 없음)

1. main 끝이 계획 시점의 커밋인지, push CI 3종이 녹색인지 본다. #294 등의 승격이 C–F와 겹치지 않도록 사용자와 맞춘다.
2. R0 안정을 판정한다(D1). 운영을 읽는 단계라 실행 직전에 승인받는다(D5). 기준은 셋이다.
   - 채널이 versioned, revision 1, active R0, 장벽 true이고, `TemplateDeployment`에 bootstrap 말고 다른 운영 기록이 없다.
   - 열린 PipelineRun·PipelineWorkRun·AgentRun 가운데 `templateReleaseId`가 비어 있는 행이 0개다.
   - 전환(2026-11-05T12:47Z) 뒤 `templatePinOrigin = run-start`로 시작한 실제 실행이 1개 이상 있고 R0에 pin됐다. 그 실행의 AgentRun도 R0에 pin됐다. 없으면 C로 넘어가기 전에 실제 항목 하나를 R0로 진행해 이 후속 확인부터 채운다.
3. 운영 집계를 남긴다. 열린 실행 수를 표와 release별로, 열린 실행 수를 프로젝트별로 센다. ID는 앞 8자만 출력한다.
4. 열린 R0 실행을 D6에 따라 처분한다. 처분은 항목 페이지의 보류·되돌리기·폐기로 하고, 처분 뒤 A3을 다시 센다.
   - 시험 프로젝트에는 열린 작업 실행(PipelineWorkRun)이 없어야 한다. 있으면 `pipeline_next`가 새 선택 대신 그 실행을 이어 쓴다(`src/server/pipeline/work-run.ts:57`–`:69`). 그러면 E·F의 확인이 성립하지 않는다.
   - 정리할 수 없으면 새 시험 프로젝트를 등록해 쓴다.
5. 클라이언트를 점검한다. 이 Mac의 플러그인 판과 저장소 lock, Windows PC 저장소의 lock 상태를 기록한다.

중단 조건: 장벽 false 또는 revision ≠ 1, pin 누락 1개 이상, 설명할 수 없는 배포 기록, 평소 사용에서 템플릿 거부가 보고됨

### Phase B — R1 커밋 확정 (운영 쓰기 없음)

1. (사용자 승인) #16을 merge commit으로 머지하고 템플릿 main 끝을 M으로 기록한다(D2).
2. `git rev-parse M^{tree}`와 `git rev-parse a2538a5^{tree}`가 같은지 본다. 다르면 멈추고 M으로 pipeline-smoke `truncate`를 다시 돌린다.
3. main `62e68dd` checkout에서 `HARNESS_RELEASE_SOURCE=<M checkout> HARNESS_RELEASE_COMMIT=<M> npm run test:template-release`가 3개 모두 통과하는지 본다. 검증 job과 같은 시험을 미리 돌리는 것이다.

B1부터 D까지는 같은 날 이어서 한다. 그 사이 pipeline-smoke 기본값은 R1인데 운영은 R0이기 때문이다.

### Phase C — R1 import (운영 쓰기: release 행만)

1. 실행 직전 UTC 시각을 기록한다.
2. 워크플로를 실행한다.
   - `gh workflow run template-release.yml --ref main -f operation=import -f environment=production -f source_commit=<M> -f request_id=tpl4-r1-import-<날짜>-1`
3. (사용자) 배포 job을 승인한다. summary가 `{releaseId: R1, revision: 1, previousReleaseId: R0}`인지 본다(D4). R1 ID를 기록한다.
4. 결과를 잃으면 같은 요청 ID로 `operation=result-import`를 실행한다.

이 단계 뒤에도 채널과 모든 클라이언트는 그대로다. 새 release는 활성화 전까지 어떤 선택에도 쓰이지 않는다.

중단 조건: 검증 job 실패(운영 무변경), `previously registered with different content`, identity 불일치

### Phase D — R1 활성화 (운영 쓰기: 포인터)

1. A2의 채널 상태가 그대로인지 확인한다. 이 시점부터 F가 끝날 때까지 실제 프로젝트에서 새 항목을 시작하지 않는다(D6).
2. 워크플로를 실행한다.
   - `gh workflow run template-release.yml --ref main -f operation=activate -f environment=production -f source_commit=<M> -f request_id=tpl4-r1-activate-<날짜>-1 -f release_id=<R1> -f expected_revision=1`
3. (사용자) 배포 job을 승인한다. summary가 `{releaseId: R1, revision: 2, previousReleaseId: R0}`인지 본다.
4. 운영을 읽는다(D5). 채널이 active R1, revision 2, 장벽 true인지 본다. 열린 R0 실행 수와 pin이 A3과 같은지도 본다.

중단 조건: `Stale template channel revision`(다른 쓰기가 있었다. 원인 확인 전 재시도 금지), `Bootstrap and compatible readers are required`

### Phase E — R1 인수 (시험 프로젝트)

1. 이 Mac의 user scope 플러그인을 main `62e68dd`(0.6.2)로 갱신하고 Claude Code를 재시작한다.
2. `stagekeeper-macos-e2e`에서 `/harness:init`을 실행한다. lock v1이므로 `--adopt` 미리보기가 나올 수 있다(전환 F3). lock v2 ready, releaseId R1인지 본다.
3. 설치된 `CLAUDE.md`에 "Plan verification stop rule" 절이 있는지 본다. `docs/plans/verification-paths.md`의 경로 5가 R1 문구인지도 본다.
4. D3 방식으로 백로그 항목 X1을 추가하고 work-assigner 한 턴을 끝까지 실행해 X1을 배정한다. 구현은 하지 않는다.
   - `pipeline_next`가 새 작업 실행을 만들고 거부 없이 dispatch를 돌려줘야 한다.
   - `agent_next`가 R1 본문을 줘야 한다.
5. 운영을 읽는다. 새 작업 실행이 R1, origin `run-start`여야 한다. 그 AgentRun과 X1의 PipelineRun도 R1이어야 한다. A3의 R0 실행은 R0 그대로여야 한다.

### Phase F — 포인터 복구 인수

1. R0로 되돌린다.
   - `gh workflow run template-release.yml --ref main -f operation=activate -f environment=production -f source_commit=<M> -f request_id=tpl4-r0-restore-<날짜>-1 -f release_id=<R0> -f expected_revision=2`
   - (사용자) 승인한다. summary가 `{releaseId: R0, revision: 3, previousReleaseId: R1}`인지 본다.
2. 복구를 확인한다.
   - 운영을 읽는다. active R0, revision 3이어야 한다. E5의 X1 실행들은 R1 그대로여야 한다(문제 run 보존). A3의 R0 실행도 그대로여야 한다.
   - R1 설치본인 시험 저장소에 백로그 항목 X2를 추가하고 `pipeline_next`를 부른다. `Update the installation to template release <R0>`와 함께 진행이 멈추면, 새 선택이 R0로 돌아갔다는 증거다.
   - 이 거부는 transaction 밖에서 응답으로 바뀌므로 작업 실행 행이 생기지 않는다(`src/server/pipeline/work-run.ts:130`–`:131`).
3. 다시 R1로 돌린다.
   - `gh workflow run template-release.yml --ref main -f operation=activate -f environment=production -f source_commit=<M> -f request_id=tpl4-r1-reactivate-<날짜>-1 -f release_id=<R1> -f expected_revision=3`
   - (사용자) 승인한다. summary가 `{releaseId: R1, revision: 4, previousReleaseId: R0}`인지 본다.
4. 운영을 읽는다. active R1, revision 4여야 한다. `pipeline_next`를 다시 부르면 X2의 새 작업 실행이 거부 없이 R1에 pin돼야 한다. work-assigner 턴을 끝내 X2를 배정한다.
5. X1·X2를 항목 페이지에서 폐기한다.

### Phase G — 기록과 후속

1. 인수 보고서를 `docs/test-reports/completed/<날짜>-template-release-r1-activation.md`에 쓴다. 허용 목록 요약(ID 앞 8자, revision, 개수, run ID)만 쓴다.
2. 원 제안서 Implementation Progress에 TPL4 후반과 VFY-TPL-09 production 부분의 결과를 적는다. `template-releases.md`의 운영 현황 문장에 R1을 더한다.
3. client-init-smoke의 고정 템플릿 커밋 `fb6ef955`를 M으로 바꾸는 PR을 dev에 연다. 이제 운영과 같은 묶음이 M이다.
4. 이 문서를 완료 처리하고 `completed/<날짜>-template-release-r1-activation.md`로 옮긴다.
5. 사용자 안내:
   - Windows PC의 `harness-smoke`·`mathgic`은 열린 R0 실행이 끝난 뒤 재init하면 R1이 된다. 그 전에 새 항목을 시작하면 재init 요구가 나온다.
   - 0.6.2 번들은 별도로 만든다. 서버는 0.6.1에서도 R1과 보류 규칙을 받는다.
   - 집계 스크립트는 scratchpad에만 두고 끝나면 지운다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| Sangeok/harness-templates main | #16 merge commit | R1 원본 | low — 운영 자동 반영 없음. pipeline-smoke 기본값이 바뀐다 |
| 운영 `TemplateRelease`·`TemplateReleaseEntry` | R1 추가 | import | low — 활성화 전에는 쓰이지 않는다 |
| 운영 `TemplateChannel`·`TemplateDeployment` | 포인터 세 번 변경, 감사 기록 네 건 | activate CAS | medium — 활성화 뒤 시작한 실행은 R1에 pin된다 |
| 운영 시험 프로젝트 `stagekeeper-macos-e2e` | 항목 X1·X2와 실행, 처분된 잔여 항목 | 인수 | low — 시험 프로젝트 |
| 이 Mac의 플러그인, e2e 저장소의 init 파일 | 0.6.2 설치, lock v2(R1) | 인수 | low |
| `.github/workflows/client-init-smoke.yml` | 고정 템플릿 커밋을 M으로(별도 PR) | CI와 운영을 맞춘다 | low |
| `docs/proposals/active/template-release-r1-activation.md` | 신규 | 이 문서 | none |
| `docs/proposals/active/template-release-versioning.md`, `docs/architecture/template-releases.md`, `docs/test-reports/` | 실행 뒤 갱신 | 기록 | none |

## Safety Analysis

순서의 근거:

- import는 포인터를 바꾸지 않는다. 먼저 해 두면 활성화가 한 행 CAS로 줄어든다.
- 활성화 전에 열린 R0 실행을 줄인다. R1으로 재init한 저장소에서 R0 실행이 설치본 요구로 멈추는 일을 피한다.
- 실제 R1 실행(E)이 생긴 뒤에 포인터 복구(F)를 한다. 그래야 "복구해도 R1 실행은 R1에 남는다"를 실제로 확인할 수 있다.
- 실제 프로젝트의 재init은 F가 끝난 뒤에 한다. 포인터가 R1 → R0 → R1로 오가는 동안 실제 저장소를 두 번 바꾸지 않는다.

단계별 실패의 영향:

| 단계 | 실패하면 운영은 | 근거 |
| --- | --- | --- |
| A, B | 바뀌지 않는다 | 읽기와 템플릿 저장소 머지뿐이다 |
| C | 바뀌지 않거나, 쓰이지 않는 release만 남는다 | 한 transaction. 결과는 성공 시에만 기록 |
| D 거부 | 바뀌지 않는다 | CAS 거부는 rollback |
| D 성공 뒤 | 새 실행이 R1을 고른다. R0 설치본은 새 항목에서 재init을 요구받는다 | 설치 호환 규칙 |
| E 실패 | 시험 프로젝트만 영향을 받는다. F1 절차로 R0에 되돌린다 | 포인터 복구 |
| F | 각 activate가 CAS라 중간에 멈추면 직전 포인터에 남는다 | `release-service.ts:94`–`:106` |

비공개 자료:

- 템플릿 본문, 연결 정보, summary 원문은 저장소, artifact, 대화에 남기지 않는다. 집계는 ID 앞 8자, revision, 개수만 출력한다.
- 이 계획은 새 secret이나 프로필 파일을 만들지 않는다. 워크플로는 남아 있는 `TEMPLATE_TARGET_PROFILES`를 쓴다.

확인한 항목:

- [x] 워크플로의 operation, 입력, 검증 job의 시험 범위와 ref·check 조건
- [x] import·activate의 CAS, 요청 ID 재사용 규칙, 결과 조회
- [x] 설치 호환 규칙과 #16이 공개 표면을 바꾼다는 점
- [x] `fb6ef95`가 지금 main의 검증 job에서 실패하므로 R0 복구도 `source_commit=<M>`으로 해야 한다는 점

## Approval

승인 기록은 front matter가 기준이다.

필요한 승인:

1. 이 계획 전체. Phase H의 운영 범위 승인이며 복구 책임자는 사용자다.
2. 실행 직전의 개별 승인: A2·D4·E5·F2·F4의 운영 읽기, B1의 #16 머지, C·D·F1·F3의 워크플로 실행
3. 사용자가 직접 하는 단계: 배포 job 승인 네 번(C3, D3, F1, F3). D4가 (a)이면 summary 읽기도 사용자가 한다.

## Execution Plan

1. Phase A: R0 안정 판정, 운영 집계, 열린 R0 실행 처분, 클라이언트 점검
2. Phase B: #16 머지, tree 대조, 비공개 릴리스 시험
3. Phase C: R1 import
4. Phase D: R1 활성화
5. Phase E: 이 Mac 0.6.2와 시험 프로젝트 재init, R1 실행 인수
6. Phase F: R0 복구, 복구 인수, R1 재활성화
7. Phase G: 보고서, 원 제안서·아키텍처 문서 갱신, client-init-smoke PR, 완료 처리

## Verification Plan

실행할 검증:

```bash
git -C <templates checkout> rev-parse <M>^{tree} a2538a5^{tree}
HARNESS_RELEASE_SOURCE=<M checkout> HARNESS_RELEASE_COMMIT=<M> npm run test:template-release
gh workflow run template-release.yml --ref main -f operation=import -f environment=production -f source_commit=<M> -f request_id=<id>
gh workflow run template-release.yml --ref main -f operation=activate -f environment=production -f source_commit=<M> -f request_id=<id> -f release_id=<id> -f expected_revision=<n>
gh workflow run template-release.yml --ref main -f operation=result-activate -f environment=production -f source_commit=<M> -f request_id=<id>
```

검증 기준:

- A2의 세 기준을 만족한다.
- B2의 tree가 같고, B3이 3개 모두 통과한다.
- C의 결과가 `{R1, 1, R0}`이고 채널이 그대로다.
- D 뒤 채널이 R1·2·장벽 true이고, 열린 R0 실행의 수와 pin이 A3과 같다.
- E에서 lock v2가 R1으로 ready이고, 설치 파일에 R1 문구가 있다. 새 작업 실행, 그 AgentRun, X1의 PipelineRun이 R1에 pin되고 `pipeline_next`·`agent_next`가 거부 없이 응답한다.
- F1 뒤 R0·3이고 X1의 실행들이 R1에 남는다. F2에서 X2의 `pipeline_next`가 R0 설치를 요구하고 작업 실행 행이 생기지 않는다.
- F3 뒤 R1·4이고 X2의 새 작업 실행이 R1에 pin된다.
- 모든 배포 job의 summary와 운영 읽기가 일치한다.

## Verification Results

실행 전이다. 결과는 실행 뒤 여기와 인수 보고서에 기록한다.

## Risks and Rollback

잔여 리스크:

- 활성화 뒤 시작한 실행은 R1에 남는다. R1 내용에 문제가 있어 R0로 돌려도 그 실행은 R1 본문으로 계속된다. 그래서 E의 인수는 시험 프로젝트에서만 하고, 실제 저장소는 F 뒤에 바꾼다.
- 사용자가 C–F 사이에 실제 프로젝트에서 새 항목을 시작하면 재init 요구를 받는다. 운영 사용자가 1명이라 일정으로 피할 수 있다.
- main이 C–F 사이에 움직이면 감사 기록의 codeSha가 달라진다. 새 main에서 `check`가 녹색이 될 때까지 워크플로를 실행할 수 없다. A1에서 승격 일정을 맞춘다.
- summary를 API로 읽을 수 없어 사람이나 브라우저가 읽어야 한다(D4). 잘못 읽으면 다음 activate의 `expected_revision`이 틀리지만, CAS가 거부하므로 운영은 바뀌지 않는다.
- 이 Mac의 0.5.33을 0.6.2로 바꾸고 e2e 저장소를 lock v2로 바꾼다. 전환 F3처럼 `--adopt` 확인이 필요할 수 있다.
- Neon Free 한도: 이 계획이 더 쓰는 compute는 집계 몇 번과 워크플로 네 번뿐이다.

롤백 방법:

- C 뒤: 쓰이지 않는 release가 남는다. 그대로 둔다.
- D–F 어디서든: 같은 activate로 원하는 sealed release에 포인터를 돌린다. 현재 revision은 운영 읽기로 확인한다.
- R1에 pin된 실행이 문제면 항목 페이지에서 보류하거나 폐기한다. pin은 바꾸지 않는다.
- 데이터 복원(Neon 시점 복원, `pg_dump`)은 이 계획의 롤백 수단이 아니다. 포인터 변경만으로 되돌릴 수 있기 때문이다.

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
