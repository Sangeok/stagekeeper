---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-11-18"
updated-at: "2026-11-18"
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
  - "docs/proposals/active/ci-verification-code-organization.md"
  - "docs/proposals/active/ci-verification-code-organization-phase-cvo2.md"
  - "docs/proposals/active/dual-client-ci-parity.md"
  - "docs/architecture/verification.md"
---

# CVO3 상세 실행 계획 — 동일 후보의 native·클라이언트 인수

**완료 목표.** CVO2에서 옮긴 코드로 기존 Windows·macOS 런타임, Claude 및 macOS Codex 설치·평가·파이프라인이 종전 합격 조건을 충족하는지 같은 소스 후보에서 입증한다. 완료 요건은 [상위 SDD의 REQ-CVO-007](./ci-verification-code-organization.md#req-cvo-007-실제-실행-검증의-동등성)이다. 요구사항·불변조건·제약·VFY는 상위 SDD가 소유하며, 이 문서는 CVO3 실행 작업 네 개와 결과 기록 방식을 소유한다.

**착수 판정.** 문서 작성과 공개 증거 조회를 마쳤다. 후보 선정과 공개 실행 이력 대조는 바로 진행할 수 있다. 전체 인수 실행은 **BLOCKED**다. 실행 승인, 모든 필수 워크플로가 실제로 검사할 수 있는 동일 SHA, private CI의 현재 대상·러너·실행 범위가 확정돼야 한다. 계획 모드는 `PHASE_PLAN`, 위험도는 `HIGH-RISK`다. 실제 모델 구독, 비공개 설치물과 실행자 권한이 관련된다. [CVO3 정의와 BLK-CVO-01](./ci-verification-code-organization.md#phase-cvo3-동일-후보의-native클라이언트-인수)

## 후보와 현재 증거

| 구분 | 2026-11-18 조회 결과 | 실행 시 처리 |
| --- | --- | --- |
| CVO2 병합 기준 | PR #380의 `dev` 병합 SHA는 `634f70d39b4cc69e7f5c11031fcf71afe0e4b3ac`다. PR head `6043398`의 검사는 CVO2 회귀 기록으로 보존돼 있다. | 이 SHA는 CVO2 회귀의 기준이다. PR head에서 수행한 검사는 그 head의 기록으로 보존한다. [CVO2 기록](./ci-verification-code-organization-phase-cvo2.md) · [PR #380](https://github.com/Sangeok/stagekeeper/pull/380) |
| 병합 SHA의 native | Windows는 실제 LPAC 파일 거부, 새 snapshot의 preflight·test/build 두 사례가 skip 없이 통과했고 offline build도 성공했다. macOS Intel의 runtime과 offline build도 성공했다. macOS ARM의 runtime과 `check/task-worktrees`는 러너를 배정받지 못해 실행 단계 0개로 취소됐다. | 이 SHA의 VFY-CVO-08에는 ARM 두 job이 남았다. 이를 복구해도 같은 SHA의 공개 클라이언트 인수까지 완료되지는 않는다. [Windows native job](https://github.com/Sangeok/stagekeeper/actions/runs/44312783867/job/134830960068) · [macOS](https://github.com/Sangeok/stagekeeper/actions/runs/44312784163) · [check](https://github.com/Sangeok/stagekeeper/actions/runs/44312783918) |
| 병합 SHA의 공유 배포 | 세 job의 실제 인수 step과 `summary.json` 3개를 확인했다. 각각 후보·이전·template SHA 일치, 검사 7개, `result=pass`, 모델 호출 0, server/DB 정리 통과·정리 오류 0이다. 후보/이전 package에 package/runtime/verifier SHA256이 기록돼 있다. | 이 SHA를 유지할 때 공개 Codex bundle 설치 보조 증거로 재사용할 수 있다. run `44312784013` attempt 1의 artifact ID는 Windows `14430882746`, ARM `14432401225`, Intel `14431721210`이다. private 모델 결과는 별도 항목이다. [공유 배포 실행](https://github.com/Sangeok/stagekeeper/actions/runs/44312784013) |
| 계획 기준과 후보 변경 | 이후 #381과 #382가 병합됐다. 문서를 작성한 `dev`는 `373dcca19143a1612969fcc94f50069643efa328`이다. #382는 공유 배포의 필수 입력과 승격 규칙을 바꿨다. 이 SHA에도 push CI 실행이 생성됐다. | 2026-11-18 재조회에서 `634f70d`의 공개 Actions 실행은 위 push 워크플로 4개뿐이었다. `client-init-smoke`, `agent-eval`, `pipeline-smoke` 실행이 없고 `--ref dev`는 이미 다른 SHA를 가리킨다. **전체 CVO3 인수를 위해서는 실행 시점의 dev SHA를 먼저 승인받는 경로를 권고한다.** 새 후보에서 모든 행을 다시 산정한다. [PR #381](https://github.com/Sangeok/stagekeeper/pull/381) · [PR #382](https://github.com/Sangeok/stagekeeper/pull/382) |
| 모델·private 증거 | 조회 시 공개 원장 #319에서 위 두 전체 SHA에 해당하는 행을 찾지 못했다. 공개 저장소에는 private Mac wrapper·수집기 계약과 과거 pin이 기록돼 있다. 이번 조회 계정에서 private 저장소를 직접 확인할 수 없었다. | private 최신 pin·로그인 유효성·러너 가용성·기존 모델 결과는 미확인이다. 소유자가 제공한 검토 가능한 실행 출처를 확보할 때까지 해당 행을 차단으로 둔다. [원장 #319](https://github.com/Sangeok/stagekeeper/issues/319) · [private CI 조사 기록](./dual-client-ci-parity.md#재검토에서-확인한-private-ci) |

**승격 정책과 단계 완료.** 최신 `AGENTS.md`에서 모델 없는 공유 배포는 승격 필수 검사다. 이 workflow에는 `record` job이 없다. Codex 모델 결과의 신뢰된 행이 없으면 승격 보고에 미검증으로 남기며 #319에 미검증 행을 쓰지 않는다. 반면 CVO3의 VFY-CVO-10은 기존 private macOS Codex 모델 인수를 포함한다. 그 결과가 없으면 CVO3 전체도 미완료다. 이번 단계의 산출물은 인수 기록이며 `main` 승격은 별도 결정이다. [저장소 운영 규칙](../../../AGENTS.md) · [현재 검증 계약](../../architecture/verification.md)

## 실행 순서

### TASK-CVO3-01: 후보 고정과 기존 실행 분류

- satisfies: REQ-CVO-007
- preserves: INV-CVO-002, INV-CVO-003
- governed-by: CON-CVO-002, CON-CVO-004, CON-CVO-006
- verified-by: VFY-CVO-08, VFY-CVO-09, VFY-CVO-10

공개 CI 실행 책임자가 아래 입력표를 먼저 채운다. private CI 책임자는 검토된 private workflow revision, 실제 caller·명령, `ci-target.json`의 source/previous/template pin, 신뢰된 Mac ARM64 러너와 전용 인증의 사용 가능 여부를 확인한다. 기존 CLI·호환 경로로 후보를 지정할 수 있어야 한다. pin 변경이나 runner 신규 구성이 필요하면 소유 작업에 넘기고 해당 행에서 멈춘다. DCPR의 신규 hosted 인증 설비와 Windows Codex 모델 지원은 이 단계의 구현 범위 밖이다. [dual-client 계획](./dual-client-ci-parity.md) · [호환 진입점 계약](./ci-verification-code-organization.md#con-cvo-004-외부-소비자-호환)

| 고정할 입력 | 실제 공급원과 대조 방법 |
| --- | --- |
| 소스·실행 출처 | run의 `headSha`로 실행을 찾은 뒤, 서버를 빌드한 checkout SHA와 설치 요약의 `pluginCommit`을 각각 승인한 후보 SHA와 대조한다. source-copy eval처럼 서버가 비해당인 행은 해당 계약을 따른다. workflow repo/ref/SHA, client·OS·architecture·버전은 별도로 기록한다. private workflow SHA는 public 제품 SHA와 용도가 다르다. |
| 템플릿·평가 사례 | 공개 shared-distribution의 고정 template은 `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215`다. Claude init은 `template_commit`, pipeline은 `templates-ref`에 승인된 전체 SHA를 주고 실제 checkout/요약과 대조한다. source-copy Claude eval은 후보의 `plugin/evals`와 control/gate 사례를 사용한다. schema 2로 판정할 때는 `fixtureCommit`과 실행한 복사본의 `copySha256`이 필요하다. server/template은 `not-applicable:source-copy-eval`로 기록한다. |
| 설치물·이전 버전 | source 설치는 plugin commit·설치 채널·판, bundle은 package/runtime/verifier 해시와 설치 후 inventory를 남긴다. Claude update 전 `git ls-remote origin refs/heads/main`으로 기대하는 이전 SHA를 기록한다. Windows와 macOS의 `Resolve the previous release`는 각각 `main`을 fetch하므로 두 `summary_*.previousCommit`을 이 값과 따로 대조한다. 하나라도 다르면 해당 행을 보류하고 서로 다른 이전 버전의 결과를 한 쌍으로 합산하지 않는다. public shared-distribution의 previous는 `85c66fb1d9e02c3d9416710240cbfca3f0023939`에서 재생성한 fixture다. private update는 그 실행이 사용한 이전 bundle과 해시를 따로 확인한다. |
| 실행 승인 | 공개 무모델 게이트, private init, 실제 모델 eval/pipeline의 실행 주체·시나리오·동시 사용 제한·허용 시간/사용량·private 결과 검토 권한을 구분한다. 승인되지 않은 모델 행은 `미실행`으로 둔다. |

첫 조회에는 후보의 공개 실행 전체와 #319의 해당 행, 열린 `[gate]` 이슈를 사용한다. 예를 들어 `gh api --paginate "repos/Sangeok/stagekeeper/actions/runs?head_sha=$CANDIDATE_SHA&per_page=100"`로 run ID를 찾고 `gh run view "$RUN_ID" --json headSha,attempt,event,conclusion,jobs`로 실제 job을 확인한다. 일부 job만 재실행했다면 해당 job이 실행된 attempt까지 대조한다. 각 필수 행을 **재사용 가능 / 새 실행 필요 / 차단**으로 분류한다. 선택한 SHA와 입력이 모두 맞고 실제 단계·정리·검토 근거까지 있는 행만 재사용한다. 다른 SHA의 green, secret 부재로 모든 실질 단계가 skip된 job, 최신 실패가 남은 옛 성공은 합격 건수에 넣지 않는다. [결과 수집 계약](../../../scripts/rehearsals/client-ci-contract.mjs)

공개 Claude init의 PR 실행은 서버와 플러그인의 소스가 다를 수 있다. PR #380의 Windows 신규 설치에서는 run의 `headSha`와 `pluginCommit`이 `6043398`이었지만 서버 checkout은 PR 임시 병합 커밋 `d9642a0`이었다. 이 run은 해당 조합의 회귀 증거로 보존한다. 후보 SHA 검색 결과만으로 동일 후보 인수에 합산하지 않는다. [실제 checkout과 설치 요약](https://github.com/Sangeok/stagekeeper/actions/runs/44301810242/job/134793169272)

### TASK-CVO3-02: OS별 런타임과 무모델 설치 인수

- satisfies: REQ-CVO-007
- preserves: INV-CVO-001, INV-CVO-002, INV-CVO-003
- governed-by: CON-CVO-002, CON-CVO-003, CON-CVO-004, CON-CVO-006
- verified-by: VFY-CVO-08, VFY-CVO-09

01에서 고정한 후보의 기존 CI와 설치 경로를 사용한다. 이 작업은 시나리오 코드·workflow·package manifest 변경을 요구하지 않는다. 공개 native 관측은 private 준비와 독립적으로 수집할 수 있다.

| 검증 | 실행과 합격 조건 |
| --- | --- |
| VFY-CVO-08 · Windows x64 | `windows-role-runtime/native-runtime`에서 실제 Windows 역할 명령과 bundled npm, 이동한 runtime 시험, 소유 smoke 서버의 IPC·종료, 전체 제품 시험과 격리 빌드를 확인한다. 필수 LPAC 거부와 fresh snapshot의 preflight·test/build는 TAP의 실제 통과를 확인한다. 원본 보존, 자식 종료, 300초 최대 요청 계약을 점검한다. [Windows workflow](../../../.github/workflows/windows-role-runtime.yml) |
| VFY-CVO-08 · macOS ARM64·Intel | `macos-runtime-contracts/contracts`의 두 runner 각각에서 native 권한·자식 소유권, 서버 생명주기, 제품 시험과 offline build를 확인한다. PR·push에서 필수인 `probe-seatbelt-containment`와 `probe-sandbox-identity`의 step 결과를 확인한다. 재귀 추적·launchd·coalition 조사 세 단계는 `workflow_dispatch` 전용이므로 push의 `skipped`는 ‘이 이벤트에 해당 없음’으로 기록한다. 실제 병합 SHA의 [Intel push job](https://github.com/Sangeok/stagekeeper/actions/runs/44312784163/job/134830961424)에서도 두 필수 probe와 빌드는 통과하고 세 조사는 건너뛰었다. `check/task-worktrees`는 Windows x64·macOS ARM64 두 job을 확인한다. required runtime/released-reader와 직렬화 설정을 유지하며 필수 사례의 skip은 미통과다. [macOS workflow](../../../.github/workflows/macos-runtime-contracts.yml) · [check workflow](../../../.github/workflows/check.yml) |
| VFY-CVO-09 · 공개 Claude | `client-init-smoke`의 Windows x64·macOS ARM64에서 각각 `new-user`, `update` 네 leg를 모두 확인한다. 양쪽에서 후보 설치와 기대 에이전트 파일, MCP 연결, fixture 정리 및 제품 init 모델 호출 0을 확인한다. 신규는 첫 연결 뒤 `rerun-unchanged`(재생성 후 Git 변경 0)와 Pro 전환·동기화, update는 이전 판 연결 후 `mcp-unchanged`, `update-dry-run`, `update-generate`, `update-sync`가 통과해야 한다. 소유자가 수정한 파일을 넣어 보존·거부를 확인하는 사례는 아래 Codex 공유 배포 행에 기록한다. leg별 `summary_*`와 실제 smoke step을 대조한다. [설치 workflow](../../../.github/workflows/client-init-smoke.yml) · [init 리허설](../../../scripts/rehearsals/rehearse-client-init-smoke.ts) |
| 공개 Codex 공유 배포 보조 증거 | 세 runner의 `shared-distribution-<runner>` artifact와 job 결론을 함께 읽는다. candidate·previous bundle, 빈 cache 신규 설치, 이전/현재 서버와 연결·pin 보존, 수정 파일 처리, 세션 정리를 본다. PR의 입력 skip, 과거 push의 job 결론만으로는 인정하지 않는다. 이 증거는 private init 및 모델 행과 별도로 기록한다. [워크플로](../../../.github/workflows/shared-distribution-acceptance.yml) · [배포 리허설](../../../scripts/rehearsals/rehearse-shared-distribution.mjs) |
| VFY-CVO-09 · private macOS Codex | 신뢰된 private wrapper에서 `--phase init` 신규와 `--previous-package` update를 실제 설치된 bundle로 확인한다. native helper의 `complete-init`이 `connected`를 반환하는지, dry-run 전후 관리 파일이 같은지, 기존 `CLAUDE.md`·MCP/Claude 설정·`harness.json` 내용과 자원 정리·모델 호출 0이 보존되는지 판정한다. wrapper가 별도 인증 smoke를 수행하면 호출량을 분리한다. private 단일 init 수집기는 attempt 2 이상을 거부한다. 첫 시도에도 문서화된 producer는 보관한 workspace를 `preserved`, 관측하지 않은 update의 `pins-preserved`를 `fail`로 남긴다. 기존 init 동작의 관측 결과를 기록하되, schema 2에서는 각각 `cleanup-incomplete`, `incomplete-checks`를 미충족으로 남긴다. private 담당자가 현재 revision에서 새 증거를 확인한 항목만 갱신한다. [private init 수집 결과](./dual-client-ci-parity.md#init-evidence-follow-up--2026-11-16) [macOS 진입점](../../../scripts/rehearsals/rehearse-codex-macos.mjs) · [private 수집기 운영 계약](../../architecture/verification.md) |

CVO2 병합 SHA 자체의 native 미확인 항목까지 해소하도록 승인받은 경우에만 그 SHA에서 `gh run rerun --job 134830960294`와 `gh run rerun --job 134830960738`을 사용한다. 먼저 최신 attempt를 다시 조회해 이미 성공했거나 실행 중이면 그 결과를 사용한다. 새 후보에서는 그 후보의 job ID를 사용한다. 공유 배포 run이 없으면 승인된 후보와 `dev`가 일치할 때 `gh workflow run shared-distribution-acceptance.yml --ref dev`를 사용하고 세 leg와 artifact를 다시 확인한다.

### TASK-CVO3-03: 동일 후보의 실제 모델 평가와 파이프라인 인수

- satisfies: REQ-CVO-007
- preserves: INV-CVO-001, INV-CVO-002
- governed-by: CON-CVO-002, CON-CVO-003, CON-CVO-006
- verified-by: VFY-CVO-10

02의 해당 환경이 통과하고 실제 모델 실행 범위가 승인된 뒤 시작한다. 기존 구독을 공유하는 `agent-eval`과 `pipeline-smoke`는 순서대로 실행한다. 현재 같은 게이트의 미완료 실행 및 다른 공유 구독 실행을 먼저 조회한다. private 순서는 해당 소유자가 `codex-account-auth`와 동일 로그인 사용 여부를 확인한 뒤 확정한다.

**유료 실행 전 증거 확인.** 공개 `agent-eval`은 `plugin/`을 복사하고 `summary_init_skill`에 `pluginCommit`, `selection`, `controlPassed`, `gateComplete`와 사례별 결과를 남긴다. 현재 workflow·요약기는 `fixtureCommit`·`copySha256`을 출력하지 않는다. 기존 행동 검증은 해당 run의 checkout·복사 step, 결과·종료·정리로 판정한다. schema 2의 설치물 식별까지 요구하는 행은 같은 실행에서 복사본을 관측한 신뢰된 증거가 있어야 한다. 확보 경로가 없으면 그 판정을 차단으로 남긴다. 누락된 해시를 채우려고 같은 평가를 다시 호출하거나 나중에 만든 복사본의 해시를 대입하지 않는다. [평가 workflow](../../../.github/workflows/agent-eval.yml) · [요약기](../../../scripts/rehearsals/agent-eval/agent-eval-summary.mjs) · [schema 2 계약](../../../scripts/rehearsals/client-ci-contract.mjs)

| 기존 모델 경로 | 반드시 관찰할 결과 |
| --- | --- |
| 공개 Claude eval · macOS ARM64 | `agent-eval`의 기본 gate 선택에서 쓰기 대조군 1회, gate 3사례 각각 3회를 실행한다. `controlPassed`, `gateComplete`, 실패 실행 0, 요약 종료 코드와 job 결론을 대조한다. 단일 `case` 실행은 진단용이다. [평가 workflow](../../../.github/workflows/agent-eval.yml) · [요약 판정](../../../scripts/rehearsals/agent-eval/agent-eval-summary.mjs) |
| 공개 Claude pipeline · Windows x64·macOS ARM64 | `slug`와 `truncate`를 각각 선택해 두 OS leg를 확인한다. 시나리오별 한 항목의 할당부터 acceptance까지, 필수 역할 5개, plan-verifier 1~3회, 독립 사례·시험·commit·종료 정리를 확인한다. 공개 smoke는 `gates: []`로 실행하고 항목 완료 후 runner를 종료한다. 이 결과로 schema 2의 `owner-gate`나 작업 중 `stop-resume`, `no-duplicate-results`를 통과 처리할 수 없다. 네 행동 검증 행(OS 2개 × 시나리오 2개)과 별도로, schema 2는 해당 실행에서 실제 관측한 검사만 기재하고 필수 검사가 빠지면 `incomplete-checks`로 기록한다. OS matrix는 `max-parallel: 1`이다. [pipeline workflow](../../../.github/workflows/pipeline-smoke.yml) · [결과 판정](../../../scripts/rehearsals/rehearse-pipeline-smoke.ts) |
| private Codex eval · macOS ARM64 | `--phase eval --run-models`는 새 경로의 AppServer preflight를 먼저 마치고 `modelsStarted: false`를 기록한다. 이후 실제 쓰기 대조군 1회와 dry-run·수정 파일 보존·불완전 패키지 3사례 각각 3회를 판정한다. 사전 검사 성공과 실제 모델 평가 성공을 분리해 남긴다. [평가 구현](../../../scripts/rehearsals/agent-eval/codex-init-eval.mjs) |
| private Codex pipeline · macOS ARM64 | 기존 `--phase pipeline --run-models`에서 설치 bundle로 resident·실제 역할·owner gate·QA/scout·최종 인수를 확인한다. 최종 상태와 시험·보고·구현 commit, 역할별 dispatch, 정리 결과 및 `reviewRequired`의 검토 결정을 기록한다. private 원문은 권한 있는 검토자가 확인한다. [기존 리허설](../../../scripts/rehearsals/rehearse-codex-macos.mjs) |

**공개 수동 실행 예시.** 아래 명령은 dispatch 예시이므로 해당 행의 승인을 받은 뒤 하나씩 사용한다. `CANDIDATE_SHA`와 `TEMPLATE_SHA`는 01에서 승인한 전체 SHA다. 각 dispatch 직전에 원격 `dev`가 후보와 같은지 확인하고, 직후 실제 run의 `headSha`도 대조한다. 중간에 `dev`가 이동하면 해당 결과를 분리하고 후보 선택으로 돌아간다. ref를 과거 SHA로 되돌리는 절차는 없다.

| 실행할 때 | 해당 행의 명령 |
| --- | --- |
| 후보와 중복 실행 확인 | `git ls-remote origin refs/heads/dev`, `gh run list --commit "$CANDIDATE_SHA"` 및 `gh run list --workflow <workflow 파일명>` |
| Claude init 네 조합의 일치하는 증거가 없을 때 | `gh workflow run client-init-smoke.yml --ref dev -f template_commit="$TEMPLATE_SHA"` |
| 실제 모델 예산 확인 후 전체 eval | `gh workflow run agent-eval.yml --ref dev` |
| eval 종료·검토 후 첫 pipeline | `gh workflow run pipeline-smoke.yml --ref dev -f templates-ref="$TEMPLATE_SHA" -f scenario=slug` |
| 앞 실행 종료·검토 후 두 번째 pipeline | `gh workflow run pipeline-smoke.yml --ref dev -f templates-ref="$TEMPLATE_SHA" -f scenario=truncate` |

### TASK-CVO3-04: 시도별 증거와 최종 판정

- satisfies: REQ-CVO-007
- preserves: INV-CVO-001, INV-CVO-002, INV-CVO-003
- governed-by: CON-CVO-003, CON-CVO-004, CON-CVO-006
- verified-by: VFY-CVO-08, VFY-CVO-09, VFY-CVO-10

실행 책임자가 인수 결과를 [시험 보고서 규칙](../../test-reports/README.md)에 따라 `docs/test-reports/active/`의 CVO3 보고서 한 곳에 모은다. 이 경로는 후속 승인된 실행의 산출물이다. 공개 보고서에는 run 링크와 허용된 요약만 남기고, private 원본·인증값·템플릿 본문·모델 출력은 기존 private 보관 위치에서 관리한다.

| 결과 한 행에 필요한 값 | 판정 규칙 |
| --- | --- |
| VFY, OS/arch, client·버전, phase·scenario, 후보/이전 설치물·template/fixture identity | 승인한 필수 조합을 먼저 열거한다. 다른 SHA, 실제 skip, 부분 eval, 누락된 leg나 비용 미관측을 각각 드러낸다. Claude eval의 `costUsd`와 `seconds`는 gate 결과(`eval.json`)의 값이다. 별도 control 실행과 재시도 비용은 확인된 값만 따로 기록한다. 일부만 관측했으면 해당 범위의 값과 전체 미상(`null`)을 함께 남긴다. |
| 실행 repo/workflow/SHA, run/attempt/job/leg, 전체 job 결론, 핵심 step·TAP·요약과 cleanup, 실행 시간·모델 사용량 | 실제 실행 출처와 record 게시 출처를 각각 남긴다. 동일 실행·동일 digest의 재게시는 한 건으로 센다. 기록 전용 실패는 record job만 복구한다. 공개 schema 1의 행을 schema 2 후보 통과로 소급하지 않는다. [기록 Action](../../../.github/actions/gate-record/record.mjs) |
| finding, 검토자·결정·관련 시도, 재시도 사유, 미충족 항목 | 최신 실패·미해결 finding·cleanup 불명·identity 불일치를 남기고 해당 행은 미통과로 판정한다. schema 2 자료가 있는 범위에서는 신뢰된 실행 목록과 기대 자원을 대조한 뒤 `evaluateClientCandidate`를 사용한다. 검토 승인은 해당 실행과 `evidenceSha256`에 연결한다. [판정 함수](../../../scripts/rehearsals/client-ci-contract.mjs) |

**증거 보관 기한.** 공개 pipeline의 `harnessErrors` 또는 `stepRefusals`가 0보다 크면 권한 있는 검토자가 해당 OS의 `pipeline-smoke-transcripts-<leg>`를 7일 보관 기간 안에 확인한다. 업로드는 파일 누락 시 경고만 남긴다. 검토가 이미 끝났으면 같은 실행에 연결된 검토 기록을 재사용하고, 미검토 전사가 누락·만료됐고 출처를 확인할 수 있는 봉인 사본도 없으면 해당 행을 ‘검토 미완료’로 둔다. 공유 배포의 `summary.json`은 14일 보관되므로 최초 확인 때 run/attempt·artifact ID와 판정에 사용한 허용 필드를 보고서에 남긴다. [pipeline artifact](../../../.github/workflows/pipeline-smoke.yml) · [공유 배포 artifact](../../../.github/workflows/shared-distribution-acceptance.yml)

**DB fixture 정리 판정.** 공개 Claude init·pipeline과 private macOS Codex 리허설은 `deleteFixtureUser`를 사용한다. fixture 생성 이후 해당 leg의 정리 로그까지 확인한다. 삭제가 실패해도 함수는 `cleanup: the fixture user was not deleted`를 stderr에 기록하고 정상 반환할 수 있다. 이 경고가 있으면 job과 요약이 성공이어도 fixture 정리는 `FAIL`이다. 서버 정지 실패로 fixture를 보존하면 해당 실행의 정리 실패와 보존 사유를 남긴다. 정리 구간을 확인할 로그나 같은 실행의 동등한 증거가 없으면 `BLOCKED`로 기록한다. 완료 보고서에서 필수 정리 `FAIL`과 다른 필수 행의 `BLOCKED`가 함께 있으면 전체 `result`는 `fail`이다. [공용 정리 함수](../../../scripts/rehearsals/support/smoke-database.ts) · [Claude init의 종료 처리](../../../scripts/rehearsals/rehearse-client-init-smoke.ts)

**오류와 재개.** runner 미배정은 실행 전 인프라 실패로 남기고 같은 SHA의 해당 job만 기존 재시도 규칙에 따라 복구한다. 공개 승격용 수동 게이트의 job 실행 시간이 30분을 넘으면 사용자에게 알리고 취소하는 운영 규칙을 따른다. pipeline/공유 배포의 외부 원인 재시도는 기존 한도 1회와 원래 실행을 연결한다. 코드·계약·안내가 원인이면 결함을 분리해 수정하고 새 SHA의 인수 집합을 다시 만든다. 중단·취소 시 기존 runner·서버 종료 및 시험 DB fixture 정리를 확인한다. 종료가 불명확하면 fixture와 진단을 보존한다. [운영 규칙](../../../AGENTS.md)

**완료 기준.** 08의 세 native 환경, 09의 공개 네 leg와 private 신규/update, 10의 공개·private 모델 행이 모두 같은 후보로 합격하고, 필요한 검토·정리를 마쳐야 `REQ-CVO-007`을 완료한다. 보고서는 CVO3의 기존 게이트 행동 판정과 schema 2로 입증된 범위를 각각 표시한다. 필수 후보·시나리오·실행 출처를 확인하지 못한 행은 CVO3 합격에 포함하지 않는다. 공개 검사가 모두 성공해도 private 입력이나 실행 승인이 없으면 공개 통과 범위와 private 차단 사유를 함께 기록한다. 승격·배포, private pin 수정, 새 CI 구현은 각 소유 작업의 결정으로 남긴다.
