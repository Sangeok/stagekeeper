---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-11-18"
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
  - "docs/proposals/active/pr-worktree-closeout.md"
  - "docs/proposals/active/pr-worktree-closeout-phase-qualify.md"
  - "docs/test-reports/active/pr-worktree-qualify.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/ADR/0004-organize-repository-scripts.md"
---

# PR worktree 완료 흐름 — Phase REPLACE 상세 계획

## Summary

[상위 SDD](./pr-worktree-closeout.md)의 조건부 자동 정리 계약을 구현 가능한 작업으로 구체화한다.
작업 종료 인계와 exact-head dev 병합, 가능한 로컬 정리를 하나의 `complete` 흐름으로 묶는다.
Windows와 미검증 환경은 병합 후 `cleanup-pending`으로 보존한다.
기존 두 관리기는 보호 동작과 복구 시험을 이관한 뒤 같은 소스 전환에서 제거한다.

- 작성 모드: `PHASE_PLAN`. 위험도: `HIGH-RISK`.
- 이번 쓰기 대상: 이 문서 한 파일. 새 작업 branch/worktree 생성은 사용자 요청에 포함된다.
- 이번에 하지 않는 일: 소스·시험·CI·AGENTS·상위 문서 수정, 실제 원장 이관·PR 병합·사용자 자료 삭제.
- 계획은 검토 가능하며 구현 착수 판정은 `CONDITIONALLY READY`다. 아래 정책 변경과 시험 gate를 포함한 REPLACE 범위 승인 후 실행한다.
- 결과가 보존된 옛 작업 branch를 재사용하지 않는다. 운영 활성화와 실제 GitHub 인수는 ADOPT가 소유한다.
- 공통 구현은 Node ESM·Git·gh·node:test다. Bash/sh wrapper, OpenClaw 설치, 새 package는 추가하지 않는다.

## Source, Baseline, Ownership

| 근거 | 확인 내용 |
| --- | --- |
| branch 생성 기준 dev | `6bb915a2cd223364b06a9daf0d4dd9a9ea530e8a`. PR #364가 2026-11-17T14:21:45Z에 병합됨 |
| 최종 작성 기준 dev | `651427c2ec89171c2ddc83c7245727002f233d18`. 작성 중 병합된 #366을 fast-forward 반영. 아래 관리 코드·parent·QUALIFY·check workflow는 생성 기준과 동일 |
| 작업 branch | `harness/pr-worktree-closeout-replace-plan-20261117` |
| 관리 task / owner | `818c972a-fd57-414b-8ae0-3e979fd5eac0` / `codex-pr-worktree-replace-plan-20261117` |
| 작업 위치 | `/private/tmp/stagekeeper-pr-worktree-replace-plan-20261117.4vZXb0/worktree` |
| parent SHA-256 | `6ae3e7932d3474aa52237499bc7d98c08404026b64ec9c8351816f3a93963dad` |
| QUALIFY plan SHA-256 | `03ad5f0461dc487d0254eea45308040ab6bfdb0db64a165f098c14d02e864715` |
| runtime 계약 | `scripts/pr/process-usage.mjs:inspectWorktreeUsage`. qualified는 Darwin 25.2.0/arm64/Node v26.4.0 및 동일 real/effective non-root UID 한 profile |
| 실제 검증 | [QUALIFY 보고서](../../test-reports/active/pr-worktree-qualify.md), 코드 ae0a6af의 CI 44091585161 전체 통과. Windows 자동 자격은 여전히 미지원 |
| 도구 관측 | Node v26.4.0, Git 2.50.1, gh 2.96.0. 새 REPLACE 코드·native 시험은 실행하지 않음 |
| 동시 작업 | 시작 시 열린 PR #366은 작성 중 병합됨. gate-record/시험/verification의 변경을 확인·반영. 구현 시작 시 다시 열린 PR·최신 dev를 조회 |

최초 점검에서 root checkout은 clean이지만 오래된 dev였으므로 그대로 보존했다.
자기 retained control을 최신 origin/dev로 갱신하고 branches:cleanup, worktrees status/retry를 수행했다.
branch cleanup은 사용 중인 2개 branch를 보존했고 retry 대상은 0건이었다.
이전 QUALIFY worktree는 커밋이 dev에 보존되고 native cwd clear였지만, `.next`의
directory symlink 2개 때문에 종료 조건을 충족하지 못해 보존했다. 이 링크는 이번
문서 작업에서 끊거나 삭제하지 않았다. 다른 작업의 unpreserved-files도 유지했다.

부모가 REQ/INV/CON/TASK/VFY의 단일 정의를 소유한다. 이 문서는 기존 여섯
TASK-PWCR과 VFY-PWC-01~14를 참조하며 canonical ID를 복제하지 않는다.
REQ-PWC-014는 QUALIFY 결과를 소비한다. REQ-PWC-010은 이 Phase에서 migration
reader/transaction의 fixture 검증에 기여하고 실제 전환 완료는 ADOPT에 남긴다.

## Current Code Reconciliation

| 현재 소스 / 기호 | 관측된 동작 | REPLACE의 delta |
| --- | --- | --- |
| `manage-task-worktrees:context / acquire / release` | 공통 Git의 JSON 원장과 전역 directory guard | Git-ref 상태 원본, per-task guard와 짧은 공통 mutation guard로 전환 |
| `createTask / marker / identityFor` | UUID·instance marker, 보호 원격, canonical path/branch/admin 대조 | 보호·생성 복구 의미 재사용. 새 상태 schema/marker로 소유권 이관 |
| `finishTask / preservation` | remote-head 보존만으로 merge 전 폴더 제거 가능 | normal complete는 dev의 정확한 PR 병합 증명 뒤 삭제. retire는 dev ancestry |
| `cleanCheckout / fingerprint` | tracked/untracked/ignored·링크·Git 진행 상태 검사 | 같은 보존 검사 이관. 아래 좁은 build-cache link 예외는 정책 변경과 native 시험 필요 |
| `finalize / handoffBranch` | Git 제거 뒤 구 branch 관리기에 위임 | 새 owner 안에서 효과별 intent/read-back. 구 writer 호출 제거 |
| `cleanup-task-branches:validateBranch / parseWorktreeList` | literal harness ref와 NUL registry 검사 | git-workspace로 이관, main/dev·symbolic ref 보호 유지 |
| `ciReason / mergedEvidence` | 모든 관련 workflow 최신 성공, exact-head merged PR/ancestry | normal merge는 최신 check + GitHub 준비 상태, 저장된 merge 증거를 재사용. 정책 차이는 parent에 명시됨 |
| `inspectLocal` | 실행 checkout 전체 dirty이면 삭제 보류 | 신뢰할 관리 코드와 대상 자료를 검사. 무관한 checkout의 dirty 자료를 치우지 않음 |
| `process-usage*.mjs` | runtime/probe/contract 분리, 미지원은 무관측 unknown | runtime entry만 controller에서 소비. 후보 호출·profile 확대 금지 |
| package / check workflow / AGENTS | worktrees, branches:cleanup 두 진입점 | 단일 pr entry, 새 시험과 운영 규칙으로 같은 변경에서 교체 |

`docs/architecture/`와 현행 AGENTS가 현재 운영의 기준이다. 이 제안은 승인·구현 전에는
그 규칙을 바꾸지 않는다. 앱·서버·plugin 내부를 개발 도구에 import하지 않는다.

## Decisions for This Phase

1. **명령 효과를 유지한다.** normal 흐름은 create → 기존 gh PR → 사용 종료 인계 → complete다.
   예외용 acknowledge-removal은 최초 구현에서 별도로 둔다. parent의 “인수 시 삭제 0회”
   계약을 유지하기 위해 cleanup과 한 호출로 합치지 않는다. 사용자 명령 축소만을 위해
   새로운 삭제 권한이나 숨은 분기를 만들지 않는다.
2. **상태의 원본은 task Git ref다.** JSON 파일을 두 번째 writable 원장으로 유지하지 않는다.
   marker/guard/activation은 신원·동시성 자료이며 상태와 불일치하면 보류한다.
3. **네트워크 효과는 좁힌다.** GitHub 쓰기는 승인된 complete의 정확한 PR 병합 요청만이다.
   PR 생성·댓글·리뷰·CI dispatch·remote ref 삭제·main 승격은 소유하지 않는다.
4. **생성된 내부 캐시 링크 예외를 제안한다.** 현재 모든 directory link 거부 규칙은 일반
   Next build 후 자동 정리를 막는다. 아래 제한된 예외만 native 시험과 verification/AGENTS
   변경을 함께 승인·반영한다. 외부 링크는 계속 보존한다. 증거가 부족하면 예외를 켜지 않는다.
5. **activation은 common Git 단위다.** 선택한 저장소의 모든 legacy active 항목을 종료 또는
   working 이관으로 설명하기 전에는 활성화하지 않는다. 일부 task만 넘기고 두 writer를
   동시에 쓰는 모델은 채택하지 않는다. 미등록 worktree는 계속 미등록으로 보존한다.

## Phase REPLACE: selected implementation boundary

- predecessor artifacts: parent의 조건부 방향, 병합된 QUALIFY 코드/증거, 이 상세 계획.
- satisfies: REQ-PWC-001, REQ-PWC-002, REQ-PWC-003, REQ-PWC-004, REQ-PWC-005, REQ-PWC-006, REQ-PWC-007, REQ-PWC-008, REQ-PWC-009, REQ-PWC-011, REQ-PWC-012, REQ-PWC-013, REQ-PWC-015, REQ-PWC-016
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-004, INV-PWC-005, INV-PWC-006
- governed-by: CON-PWC-001, CON-PWC-002, CON-PWC-003, CON-PWC-004, CON-PWC-005, CON-PWC-006, CON-PWC-008
- verified-by: VFY-PWC-01, VFY-PWC-02, VFY-PWC-03, VFY-PWC-04, VFY-PWC-05, VFY-PWC-06, VFY-PWC-07, VFY-PWC-08, VFY-PWC-11, VFY-PWC-13, VFY-PWC-14
- intermediate validity: 구현 중에는 구 명령을 유지하고 새 mutation을 activation 전 거부한다.
  최종 source 전환 뒤에도 미활성 실제 원장은 status/migration preview만 가능하다.
- exit: 새 보호/실패/복구/이관 fixture 검사와 필수 검증 통과, 구 production 경로·alias·실행 import
  0건, 양 OS 제공 동작 확인, 미활성 실제 repository 자료 불변. 실제 activation은 하지 않음.
- stop: parent 의미 변경, native 자격 우회, 자동 사용자 자료 정리, 미검증 link 예외 활성화,
  legacy writer 호출 wrapper가 필요해지면 해당 경계에서 중지한다.

## Proposed Files and Interfaces

아래 신규 파일은 아직 없으며 구현 대상이다. 역할이 같은 기능을 과도하게 나누지 않는다.

| 경로 | 책임 / 주요 경계 |
| --- | --- |
| `scripts/pr/index.mjs` | CLI parsing, 출력, runPrCommand(options, ports), operation orchestration |
| `scripts/pr/task-state.mjs` | schema/phase 검증, task ref 읽기·CAS, guard·activation·effect receipts |
| `scripts/pr/git-workspace.mjs` | 보호 원격, 생성, 신원, 보존 검사, Git worktree와 exact ref 효과 |
| `scripts/pr/filesystem-inventory.mjs` | 소유된 Node child에서 bounded metadata inventory·fingerprint. 파일 내용 scanner 아님 |
| `scripts/pr/github-merge.mjs` | origin/repository/PR/HEAD binding, check/readiness, 병합 요청·관측 |
| `scripts/pr/legacy-migration.mjs` | v1 reader, source digest, plan·fence·전환·재개. old writer import 없음 |
| 기존 `process-usage.mjs` | runtime capability/관측 결과 소비. probe를 직접 호출하지 않음 |
| lifecycle/merge/cleanup/recovery/migration/retirement `*.test.mjs` | parent VFY별 시험 |
| `scripts/pr/testing/` | 필요한 실제 Git·GitHub transport·중단 fixture. production import 금지 |

ports는 Git/gh 실행·시계·관측 같은 안정된 경계에 주입한다. CLI에서 실행 파일/임의 callback/
qualification flag를 받지 않는다. 실제 Git 시험은 기존 bare origin + fixture별
`url.<bare>.insteadOf` 패턴을 재사용하고 GitHub 응답만 대체한다.

초기 지원 저장소는 현행 Stagekeeper와 같은 SHA-1 Git repository다. 다른 object format,
잘못된 origin, bare/main checkout 삭제 대상, 불명확한 common Git은 mutation 전에 거부한다.
이 제한을 새 저장소로 자동 확대하지 않는다.

## Command Contract

공통 `--root`는 대상 밖의 control checkout이다. UUID·literal branch·절대 경로·SHA·state OID를
엄격하게 파싱하고 알 수 없는 key/중복 flag/보호 ref를 거부한다. 상태 변경 명령은
`--task --owner --expected-state <OID>`를 요구한다. HEAD 관련 효과에는 `--expected-head`,
worktree 효과에는 `--expected-instance`를 함께 받는다. 숫자 revision도 출력하되 CAS는 OID로 한다.

| 명령 | 추가 입력 / 의미 | 허용 효과 |
| --- | --- | --- |
| create | owner, harness branch, 새 path | 최신 dev 기반 materialization·task/marker 생성 |
| create 재개 | task, expected state, 필요한 경우 confirm-created-by-task | 기존 creating intent만 완성 |
| status | 선택 task | 로컬 관측만. fetch/GitHub/상태·guard 생성 없음 |
| inspect | task, 선택 PR, 선택 remote | 계획·검증 결과. remote 모드는 GET/ls-remote만, Git fetch·ref/state 쓰기 없음 |
| complete | PR, expected HEAD/instance/state, usage-ended, request-id | 봉인 → 병합 intent/요청 → merged → 가능한 cleanup |
| recover | task, expected state | 원격·로컬 효과 관측과 기록. 재병합/파일/ref 삭제 없음 |
| cleanup | task, expected state/HEAD/instance, request-id | 이미 확인된 merge/retire의 남은 로컬 효과만 |
| resume | task, expected state | 아직 병합 요청을 보내지 않은 intact sealed 작업만 working 복귀 |
| retire | expected HEAD/instance/state, usage-ended, request-id | no-PR + fresh dev ancestry 확인 후 cleanup 목적을 retire로 설정 |
| acknowledge-removal | expected state/HEAD/instance, request-id, external-removal-confirmed | 명시적 사용자 보고 + 실제 부재·보존 검증, receipt만 저장 |
| migrate preview/apply/recover/abort | 아래 migration plan의 ID/digest와 expected state | fixture 구현. 실제 적용 권한은 ADOPT |
| recover-guard | 관측, 또는 expected nonce + confirmed-quiescent | 알려진 dead guard만 회수. legacy migration fence는 회수 대상 아님 |

complete를 호출할 수 있는 문맥은 해당 PR 병합이 승인된 실행 문맥이다. CLI의 owner/
usage-ended 문자열 자체가 인증이나 타 사용자 동의가 되지는 않는다. 별도 확인 질문을
매번 삽입하지 않되, agent가 preview나 일반 계획 요청을 실제 병합 권한으로 해석하지 않는다.

stdout은 versioned JSON이다. 기본 envelope는 operation/task/state OID/phase/merge/worktree/
branch/capability/observationPerformed/reasons/nextActions를 갖는다. raw stderr·token·env·전체
command line은 내보내지 않는다. partial success를 한 success boolean으로 합치지 않는다.
complete/cleanup/retire의 0은 complete/retired 또는 확인된 완료 no-op, 2는 보류,
1은 실행 실패다. status/inspect/acknowledge-removal의 0은 해당 관측/기록 성공만 뜻한다.
`--dry-run`을 지원한다면 inspect의 무쓰기 경로로만 라우팅한다.

## State and Durability

### task record

task ref는 `refs/stagekeeper/pr-closeout/tasks/<uuid>`이며 commit tree의 `state.json`이
유일한 상태 원본이다. schemaVersion과 unknown-field 거부, 1 MiB record 한도를 둔다.

필수 데이터 집합:

- identity: taskId, instanceId, commonGit canonical path와 installationId, owner,
  literal branch, worktree path/admin, baseSHA, source tool revision.
- lifecycle: sequence, phase, creation intent, PR binding(repo ID/number/base/head repo/branch),
  sealed HEAD, 종료 선언과 file fingerprint, cleanup purpose(merged/retire).
- effects: request-id·expected HEAD/state·시도 전 intent·관측 outcome,
  merge/check receipts, worktree removal intent/result, branch delete intent/result.
- observation: profile/qualification revision, status/coverage/실행 여부/시점.
  과거 clear는 다음 삭제 권한으로 재사용하지 않는다.
- external removal: 사용자 보고와 인수 시점, 원래 identity, 부재/보존 확인.
  실제 외부 actor/삭제 시각을 OS가 증명한 것으로 기록하지 않는다.
- migration: old task ID/source digest/원래 state. 옛 closing consent는 새 권한이 아님.

새 state commit은 이전 state를 첫 parent로, 필요한 base/sealed source/merge commit을
추가 parent로 보존한다. SHA 문자열을 JSON에 적는 것만으로 GC 보존을 주장하지 않는다.
`hash-object / mktree / commit-tree`는 index/working tree를 사용하지 않고, task ref는
expected old OID로 갱신한다. 로컬 전용 internal ref를 제품 branch에 commit/push하지 않는다.
[Git commit-tree](https://git-scm.com/docs/git-commit-tree)의 parent 연결을 사용한다.

상태와 branch ref의 동시 CAS에는 `git update-ref --no-deref --stdin` transaction을 사용한다.
`--batch-updates`의 부분 성공 모드는 사용하지 않는다. Git은 각 ref를 원자적으로 바꾸지만
동시 reader에게 모든 ref의 일관된 snapshot을 보장하지는 않는다. status는 guard/state를
전후 재독해 갱신 중이면 `transition-in-progress`를 반환하고, 권한 판정은 guard 안에서
재검증한다. [Git update-ref](https://git-scm.com/docs/git-update-ref)

### states and guards

| phase | 상태 의미 / 다음 허용 효과 |
| --- | --- |
| creating | 내부 materialization intent. 경로/admin 미확정이면 다른 작업 명령 거부 |
| working | 작업·PR 준비. 종료 인계는 아직 없음 |
| sealed | HEAD/instance/자료 보존·종료 선언 고정. native clear를 뜻하지 않음 |
| merge-requested | 결과 확인 전. transport 불명확이면 다시 PUT하지 않음 |
| merged | exact PR/HEAD/merge SHA와 dev 보존 확인 |
| cleanup-pending | merged/retire 목적과 보류 이유. 같은 task의 로컬 재개만 |
| complete / retired | path/admin/등록/local ref 부재와 해당 보존 증명 확인 |

공통 Git 아래 `stagekeeper-pr-closeout`은 guard·activation·빈 hooks directory를 소유한다.
per-task guard는 원격 대기까지 유지해 중복 complete를 막고, 공통 mutation guard는
worktree/ref/activation을 바꾸는 짧은 구간에만 잡는다. 일반 작업은 task → common 순서,
migration은 전체 일반 작업의 중지 확인 뒤 legacy fence → common 순서다.
잠금을 기다리며 무한 대기하지 않고 task-busy/guard-held를 반환한다.

guard는 mkdir 배타 생성, nonce·host·PID·task/request identity와 생성 시각으로 식별한다.
live/unknown/다른 host는 보존한다. dead PID만으로 자식 Git/다른 사용 종료를 추정하지 않는다.
recover-guard는 명시적 quiescent 확인과 nonce/파일 신원 재검사 뒤 자체 archive로 이동한다.
미종료 observer나 Git child가 있으면 guard를 해제하지 않는다. 전역 process-name kill은 없다.

## Change detail for TASK-PWCR-01

Canonical: [TASK-PWCR-01](./pr-worktree-closeout.md#task-pwcr-01-identity상태명령).

1. 기존 validateBranch/parseWorktreeList/context/marker/identity 검사를 새 git-workspace로
   옮긴다. literal harness namespace, main/dev, 주 checkout, symbolic ref, alias,
   .git pointer·admin·instance 불일치를 보존한다. old module import로 연결하지 않는다.
2. task-state의 schema·OID CAS·상태 parent pin·guard·activation reader를 구현한다.
   global Git config를 쓰지 않고 Git identity 등은 child env에만 제공한다.
3. create는 main/dev 존재와 fresh dev를 확인하고 creating intent를 먼저 저장한다.
   그 뒤 Git worktree add, admin 발견, marker 원자 쓰기, working 저장 순서다.
   새 marker 이름은 pr-closeout-task.json이며 installationId/taskId/instanceId를 갖는다.
   기존 marker를 덮어쓰지 않고 원자적 no-replace 게시·read-back을 요구한다. 생성 중단으로
   불완전/타 소유 marker가 남으면 덮어써 복구하지 않고 보존한다.
   부분 생성은 자동 삭제하지 않는다. marker 없는 경로는 task ID/owner/HEAD와
   명시적 생성 주체 확인 없이 채택하지 않는다.
4. status/inspect는 미활성·legacy 존재·손상·불일치를 읽을 수 있으나 쓰지 않는다.
   inspect의 remote 조회도 GET/ls-remote이며, 객체가 없어 ancestry를 입증하지 못하면
   unknown으로 표시한다. preview를 위해 origin/dev ref를 fetch하지 않는다.
5. activation이 없거나 canonical migration ref와 marker/fence가 불일치하면 create,
   complete, cleanup, retire, resume, ack를 거부한다. bootstrap은 migration만 소유한다.

신뢰할 control 소스의 변경은 검사하되 다른 checkout의 unrelated dirty를 삭제 조건으로
쓰지 않는다. 다른 task의 branch·파일·server를 가져와 준비하지 않는다.
검증 연결: VFY-PWC-01/02/08, 상태 CAS와 경합은 VFY-PWC-06.

## Change detail for TASK-PWCR-02

Canonical: [TASK-PWCR-02](./pr-worktree-closeout.md#task-pwcr-02-병합-검증요청관측).

### preflight and binding

- origin은 credentials 없는 github.com repository 주소로 정규화한다. repo numeric ID와
  PR base/head repo ID를 대조하고 base=dev, same-repo harness head, local/ref/PR HEAD=H를 요구한다.
  origin 변경, fork, draft, 잘못된 base, main/dev head, 삭제된/불명확한 repository는 거부한다.
- `check.yml`의 exact H·해당 PR 연관·head repo/branch가 맞는 최신 run/attempt 성공을 확인한다.
  pagination·연관 정보 누락, pending/cancelled, 잘못된 SHA는 성공이 아니다.
- GitHub readiness의 mergeable/mergeStateStatus/reviewDecision을 엄격히 해석한다.
  MERGEABLE+CLEAN과 APPROVED 또는 명시적 no-decision 값(null/빈 값)을 함께 요구한다.
  no-decision 단독은 승인 증거가 아니다. REVIEW_REQUIRED/CHANGES_REQUESTED/UNKNOWN,
  새로운 enum/조회 오류이면 요청하지 않는다. 추가 required checks는 GitHub의 required-check
  결과와 서버 보호에 맡기며 보호 정책을 자체 재구현하거나 우회하지 않는다.
- 종료 인계·canonical identity·파일 보존을 봉인한다. native 미지원만으로 merge를 막지 않지만
  알려진 미종료 사용자·신원/자료 불명확은 봉인부터 거부한다. 요청 직전 HEAD·state·준비 상태를 재검사한다.

### request and proof

최초 transport는 gh api를 통한 동기 REST `PUT repos/{owner}/{repo}/pulls/{number}/merge`로
정한다. JSON stdin에 `sha=H`와 `merge_method=merge`를 넣고 일반 권한으로 호출한다.
제목·본문 편집·admin 우회·auto-merge·queue 등록은 하지 않는다.
GitHub는 async API도 권고하지만 그 경로의 queue/stack 처리와 별도 요청 수명은 이번 범위에
추가하지 않는다. 이 endpoint의 queue/stack 제한이나 405에 다른 방식으로 자동 fallback하지 않는다.
[GitHub merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)

순서는 durable intent → 원격 요청 1회 → PR 재조회 → dev fetch·도달 확인 → merged receipt다.
API 성공 exit나 merged=true 응답만으로 삭제하지 않는다. exact head H, repo/base, merge SHA,
fresh GitHub dev ref와 Git origin/dev의 일치·merge SHA ancestry를 확인하고 source/merge 객체를 pin한다.
GitHub의 remote branch 자동 삭제는 그대로 둔다.

직접 요청은 merge 방식만 사용한다. 이미 외부 squash/rebase로 병합됐다면 API의 exact head와
merge SHA의 dev 도달 증명으로 인수한다. source H가 dev의 조상이 아님을 이유로 임의
force deletion하거나 다른 PR의 증거를 빌리지 않는다.

취소·timeout·네트워크 오류·응답 유실은 request outcome unknown이다. OPEN 조회만으로
재요청하지 않는다. authoritative HTTP/본문으로 무효과 거부가 확정된 경우에만 rejected로
기록하며, 새 complete 호출은 동일 H·새 request-id·fresh preflight로 별도 intent를 만들 수 있다.
한 호출 안에서 자동 재병합 retry는 하지 않는다. 거부 뒤 H 변경/재봉인이 필요하면 보존하고
별도 작업 인계로 처리한다. 이번 resume은 요청 전 봉인 취소 범위를 확장하지 않는다.

GitHub 조회는 이번 task/PR/HEAD로 제한한다. command 한 번은 20초+settle 4초, 합산 출력 16 MiB.
병합 후 관측은 120초 이내, 2초 이상 간격·최대 30회다. 429/Retry-After가 budget을 넘으면
pending으로 끝낸다. 이는 초기 설계 예산이며 실측 성능 보장이 아니다.
검증 연결: VFY-PWC-02/03/04/07/13.

## Change detail for TASK-PWCR-03

Canonical: [TASK-PWCR-03](./pr-worktree-closeout.md#task-pwcr-03-사용-종료파일branch-정리).

1. cleanCheckout/fingerprint를 새 소유 모듈로 이관한다. tracked/staged/untracked, sparse,
   submodule/nested repo, 숨김 index flag, 진행 중 Git/lock, ignored 데이터를 검사한다.
   .env·로그·보고서·private templates는 보존한다.
2. 실제 metadata walk는 bounded 자기 Node child에서 수행한다. 20만 entry/32 MiB 목록,
   1 MiB record, 20초 관측/4초 settle 한계를 적용한다. 디렉터리 링크를 따라 열거하지 않는다.
   경로 신원·mode/size/mtime/ctime/link target으로 fingerprint를 만들고 파일 내용·env를 수집하지 않는다.
3. merged 또는 명시적 retire의 dev ancestry를 확인한다. native 삭제 조건은 오직
   `inspectWorktreeUsage`의 qualified + performed + clear + coverageComplete + settled다.
   Windows/미지원/관측 오류는 worktree/ref 삭제 0회, cleanup-pending이다.
4. 삭제 직전 guard·state·HEAD·instance·보존 지문을 다시 대조하고 worktree-removal intent를
   저장한다. `git worktree remove -- <exact path>` 한 번으로 path와 admin을 제거한다.
   force, prune, 임의 recursive rm, 자동 cache/link 삭제 전처리는 없다.
5. path/admin/registry 부재를 확인한 뒤만 branch 단계로 간다. 다른 worktree·open/dependent PR·
   remote branch 재사용·변경된 tip을 재검사한다. literal ref와 H를 고정한 no-deref CAS
   삭제를 새 관리기 안에서만 수행한다. source/merge 객체 pin과 branch intent를 먼저 저장한다.
6. task state 갱신과 branch 삭제는 가능한 하나의 ref transaction으로 결부한다. 공통 guard를
   유지하고, 오류/응답 유실은 실제 ref와 receipt를 읽어 확인한다. main/dev는 어떤 삭제 입력에도
   포함하지 않는다. 관측된 symbolic ref는 거부하며 raw writer의 same-SHA 재생성까지 원자적으로
   막았다고 주장하지 않는다.
7. path/admin/ref 모두 없을 때만 complete/retired다. 새 자료·부분 제거이면 branch를 보존한다.

### proposed build-cache link exception

현행 fingerprint는 directory symlink를 전부 거부한다. 실제 이전 작업에는
`.next/node_modules/@prisma/client-* → node_modules/@prisma/client`와
`.next/node_modules/pg-* → node_modules/pg`가 있었다. 단순 문서 누락이 아니라 일반 build의
종료 경로에 영향을 주는 차이다.

제안하는 예외는 **ignored인 .next/node_modules 내부의 링크가 같은 worktree의 ignored
node_modules 내부 일반 directory를 가리키는 경우**뿐이다. 양쪽 cache root는 실제 directory여야
하고, canonical target은 worktree 밖으로 나갈 수 없다. target tree의 외부/추가 미허용 링크,
루트 symlink, 깨진/판정 불가 링크, tracked link, 다른 사용자 자료는 거부한다.
scanner는 링크를 순회하지 않고 별도의 실제 target 경로가 inventory에서 검증됐는지 대조한다.

예외는 직접 unlink나 rmdir fallback을 추가하지 않는다. native Git remove가 대상 밖 자료를
변경하지 않는 것을 양 OS의 자체 fixture와 qualified Mac 통합에서 입증한 뒤에만 켠다.
verification/AGENTS에 기존 전체 거부에서 달라지는 범위와 native 증거를 같은 변경으로 남긴다.
실패·미검증이면 예외를 비활성화하고 linked-path로 보존한다. 문서 작성만으로 현행 종료 규칙을
완화하지 않는다. 예외 없이는 build 후에도 pending일 수 있다는 제한을 숨기지 않는다.

retire는 no-PR/open/dependent PR 없음, fresh dev ancestor, 같은 인계·보존·사용 조건을 요구한다.
미지원이면 purpose=retire의 pending이며 source commit을 삭제할 수 없다.
검증 연결: VFY-PWC-04/05/08/13/14.

## Change detail for TASK-PWCR-04

Canonical: [TASK-PWCR-04](./pr-worktree-closeout.md#task-pwcr-04-중단중복복구).

| 중단 지점 / 상태 | 재진입 규칙 |
| --- | --- |
| intent 저장 전 | 원격 효과 0. 입력/HEAD 재검사 후 시작 가능 |
| intent 저장 뒤 요청 여부 불명 | recover는 관측만. OPEN만으로 재요청 금지 |
| 병합 후 로컬 receipt 유실 | exact PR/H/merge/dev 증거를 복원. 새 merge 없음 |
| worktree intent 뒤 응답 유실 | path/admin/등록 모두 없으면 제거 결과 확정, 일부만 없으면 partial-removal |
| branch transaction 응답 유실 | state/ref 재독. 같은 이름 ref가 남았고 결과 불명확하면 자동 재삭제 금지 |
| complete 뒤 경로/ref 재등장 | 과거 receipt로 새 instance 삭제 금지 |
| guard/자식 미종료 | 후속 효과 중단, guard 유지. 확인된 dead+quiescent일 때만 명시적 회수 |

동일 request-id의 재전송은 저장된 입력·이전 state·HEAD/instance가 모두 일치할 때만 replay다.
같은 ID에 다른 입력이면 거부한다. pending에서 재시도하더라도 과거 clear나 오래된 file
fingerprint를 사용하지 않는다. 독립 task의 원격 대기는 서로 막지 않는다.

### external manual removal

미지원 시 사용자에게 정확한 task/path/HEAD와 보류 이유를 안내한다. 사용자가 자기 editor,
터미널·부모 세션·서버와 공유 dependency 사용을 끝내고 필요한 ignored 자료를 보존했는지
확인해야 한다. 도구가 unknown을 수동 확인 한 번으로 clear로 바꾸지 않는다.

acknowledge-removal은 cleanup-pending + 유효한 인계 + merged/retire 보존 증거 + 명시적
사용자 보고를 받는다. 원래 path/admin/등록의 부재를 확인한 뒤 external-manual receipt만
저장한다. 어떤 파일/ref도 삭제하지 않는다. working 소실, 보고 없음, 일부 부재, 경로 재생성은
거부한다. 다음 cleanup은 부재와 branch 보호를 다시 검사해 남은 ref만 처리한다.
따라서 실제 파일 제거의 주체를 도구가 수행한 것처럼 기록하지 않는다.

ack 저장 뒤 응답 유실은 같은 request-id/이전 state/입력의 일치한 replay만 허용한다.
그 사이 path가 생기거나 ref가 바뀌면 중복이라도 보존한다. 일반적인 “진행” 요청을
특정 worktree의 외부 제거 완료 보고로 재사용하지 않는다.
검증 연결: VFY-PWC-06/07/14.

## Change detail for TASK-PWCR-06

Canonical: [TASK-PWCR-06](./pr-worktree-closeout.md#task-pwcr-06-일회-migration-경계).
실제 사용자 원장 적용은 REQ-PWC-010의 ADOPT 완료 책임이다.

### plan and mapping

preview는 v1 records/marker/registry/guard를 읽어 bounded JSON plan을 stdout으로 반환한다.
입력 파일의 digest·canonical common Git·plan ID·대상/owner·매핑·보류 이유·예상 source revision을
포함한다. preview는 새 ref/guard/marker를 쓰지 않으며 path/owner를 나이나 이름으로 추정하지 않는다.

| legacy 항목 | 이관 계획 |
| --- | --- |
| active, 신원 확인된 intact instance | owner 인계에 따라 working. dirty 자료는 그대로, 종료/삭제 권한은 없음 |
| closing, intact | 기존 usageEnded/보존 proof는 history. 새 release 없는 working만 허용 |
| creating / partial removal / corrupt / unknown version | 자동 채택 금지. 원인 해결 전 activation 보류 |
| removed | history로만 보존. 재사용 path/ref를 새 task로 바인딩하지 않음 |
| unmanaged worktree | 관리 대상에 자동 편입하지 않음 |
| 새 원장에 같은 task ID가 이미 존재 | 정확한 동일 migration 결과만 replay, 그 밖은 충돌 |

최초 plan은 common Git의 모든 active/closing/creating 항목을 설명해야 한다. 설명하지 못한
활성 항목이 있으면 selected subset만 apply해 전역 writer를 전환하지 않는다.
old task UUID/instance를 이관할 수 있으나 새 schema/version·working 상태로 명시하고
old branch cleanup 결과를 재실행 권한으로 복사하지 않는다.

### stale writer fence and activation

1. 운영자가 old writer·자식·공유 작업의 quiescence와 owner별 매핑을 확인한다.
   live/unknown legacy command.guard는 회수하지 않고 보류한다. 독립된 구
   cleanup-task-branches는 이 guard를 읽지 않는다. 모든 알려진 control/작업 소유자가
   그 명령과 진행 중인 Git 자식도 중지하고 이후 실행하지 않기로 인계해야 한다.
   확인 불가인 old branch writer가 있으면 apply를 시작하지 않는다.
2. legacy `command.guard` 자리에 배타 directory를 생성해 v2 migration-fence owner를 기록한다.
   old v1 reader가 이해하지 못하는 명시적 새 version/kind이며 task JSON은 바꾸지 않는다.
   현행 old acquire/recover는 unknown guard를 보존하므로 구 worktree CLI의
   create/finish/retry/recover-guard 쓰기를 막는다. 독립 branch 정리기까지 기술적으로
   차단한다고 주장하지 않는다. 그 도구의 종료는 앞 단계의 운영 인계 조건이다.
   fence의 nonce/instance/digest는 새 migration record가 소유한다. 이 실패 폐쇄 동작을
   pinned v1 실행 fixture로 반드시 검증하며 성립하지 않으면 이관 구현을 멈춘다.
3. fence 획득 후 source digest·path/marker/HEAD를 재대조한다. mismatch이면 task ref/activation을
   쓰지 않는다. 자기가 방금 만든 fence만 identity 검증 후 회수할 수 있다.
4. migration intent ref에 plan과 준비한 task state commit OID를 보존한다. 그 객체들을 parent로
   pin한다. migration ID와 expected bytes digest가 있는 새 marker 계획도 intent에 포함한다.
   old marker는 보존하고 새 marker를 no-replace로 게시한다. 재개 시 기존 새 marker가
   같은 installation/task/instance/digest일 때만 재사용한다. 다른 값·불완전 파일은 보존한다.
   모든 marker read-back 뒤 task refs와 applied receipt를 하나의 Git ref transaction으로 갱신한다.
5. canonical applied 결과와 일치하는 activation marker를 atomic write/read-back한다.
   marker만 있거나 일부 ref가 다르면 일반 mutation은 거부한다.
6. new guard는 해제하되 legacy fence와 v1 기록은 유지한다. 새 도구는 활성 상태의 legacy fence를
   recover-guard 대상으로 취급하지 않는다. old writer의 임의 raw 변경까지 OS로 차단하는 보장은 없다.

빈 legacy 저장소도 같은 explicit bootstrap plan을 거친다. 필요한 경우 빈 legacy namespace에
fence를 두어 stale old CLI의 뒤늦은 초기화를 막는다. 일반 create의 silent activation은 없다.

첫 새 marker 게시 전 abort만 자기 intent를 aborted로 기록하고 자기 fence를 회수한다.
새 marker 또는 task refs를 적용한 뒤에는 자동 되돌리기 대신 migrate recover로 activation을 완성한다.
모든 ref+marker+fence의 신원을 재검사하고 다른 상태를 덮어쓰지 않는다. unknown은 보존한다.
실제 migration/rollback 결과를 fixture 통과만으로 완료했다고 보고하지 않는다.
검증 연결: VFY-PWC-10.

## Change detail for TASK-PWCR-05

Canonical: [TASK-PWCR-05](./pr-worktree-closeout.md#task-pwcr-05-구-체계-퇴역과-ci).

실행 순서는 R01 → R02/R03 → R04 → R06 → R05다. 소스와 규칙의 전환은 마지막에 묶는다.

- 새 보호 시험이 이관된 뒤 `scripts/manage-task-worktrees.mjs`,
  `scripts/cleanup-task-branches.mjs`와 두 root test 파일을 제거한다.
- package의 worktrees/branches:cleanup을 없애고 `pr: node scripts/pr/index.mjs`를 둔다.
  new writer가 old writer를 import·spawn·fallback으로 호출하지 않는다.
- AGENTS의 전체 sweep과 legacy create/finish/retry 지시를 task별 status/create/complete/
  cleanup 및 inactive bootstrap 절차로 바꾼다. main/dev·다른 작업 보존은 최우선 그대로다.
- verification의 명령·state·보존·수동 인수·migration/fence·build-cache 예외와 CI 표를 함께 갱신한다.
  #366이 반영된 verification과 후속 PR·최신 dev를 재대조한다.
- 기존 worktree-lifecycle proposal은 교체 관계를 기록하되 과거 승인/실행 증거를 지우지 않는다.
  완료된 역사 문서의 과거 명령을 현재 실행 참조로 세지 않는다.
- UPSTREAM에 고정 OpenClaw revision·참고/복제 범위와 MIT 고지를 유지한다.
  GitHub API 선택과 포팅 차이를 기록하며 실행 때 upstream을 받아 교체하지 않는다.

old worktree writer의 guard 호환 시험에 필요한 두 source 파일은 고정 기준
`6bb915a2cd223364b06a9daf0d4dd9a9ea530e8a`의 Git 객체에서 시험 임시 폴더로 추출한다.
production에는 import하지 않는다. CI native checkout도 이 fixture 이력을 확보하도록
fetch-depth를 맞춘다. 이력이 없으면 필수 gate를 실패시키며 시험 중 네트워크 fetch로
몰래 보완하지 않는다. source/data 양쪽의 단일 소유를 검사한다.

source 전환과 activation 사이에는 최신 제어 checkout에서 status/migrate preview만 사용한다.
필요한 ADOPT 준비는 읽기 전용 control에서 할 수 있다. old tool로 새 독립 task를 만들며
전환을 우회하지 않는다. 실제 activation 뒤에 새 관리 create를 사용한다.
검증 연결: VFY-PWC-11.

## Verification Matrix

아래는 새 canonical verifier가 아니라 parent VFY의 구체적 시험 책임이다. 모든 행은
REPLACE 구현의 required이며 실제 Git·파일·해당 OS를 사용한다. GitHub는 transport 대역이다.

| 검증 사례 | 기대하는 관찰 / 검출할 결함 | 연결 |
| --- | --- | --- |
| 생성·재개·소유권 | 보호 ref/주 checkout/alias/foreign marker 거부, 부분 생성 보존, markerless 자동 채택 0회 | VFY-PWC-01 |
| PR binding | repo ID/base/head repo/branch/H 불일치·fork·draft 거부, 두 번째 작업 폴더 생성 0회 | VFY-PWC-02 |
| merge readiness | 최신 check attempt·PR 연관·required 결과/리뷰/readiness 누락 시 PUT 0회, exact H만 요청 | VFY-PWC-03 |
| qualified 정상 완료 | 실제 두 worktree 중 A만 병합 증명 뒤 제거, B hash/ref 보존, complete 재호출 효과 0회 | VFY-PWC-04 |
| 파일·링크 보존 | dirty/.env/unknown ignored/외부 link/lock/hidden index/nested repo/sparse/submodule/drift를 보존 | VFY-PWC-05 |
| build-cache link 예외 | 실제 generated 패턴과 외부/깨진/root-link 대조, Git 제거 뒤 외부 sentinel·sibling 불변. 예외 없이는 pending | VFY-PWC-05 |
| 원격/로컬 중단 | intent 전/후, 요청 뒤 유실, Git 제거/transaction 뒤 응답 유실, duplicate/stale state, known/live guard | VFY-PWC-06 |
| pending/external merge | deadline/cancel 보존, OPEN 불명확에서 재요청 0회, 외부 동일 H merge는 cleanup만 | VFY-PWC-07 |
| status/preview/retire | 파일·ref·설정·network의 무변경 범위, no-PR ancestor와 unique/open/dependent 대조 | VFY-PWC-08 |
| 이관·fence·원자성 | source drift·closing consent 미승계·removed/path 재사용·old worktree writer 차단·branch writer 종료 미확인 거부·multi-ref/marker 중단·replay | VFY-PWC-10 |
| 구 경로 제거 | production import/호출/alias/CI old path 0건, history/시험용 pinned source는 명시적 예외 | VFY-PWC-11 |
| unqualified/busy/unknown | 정상 인계/CI면 merge 가능하나 로컬 삭제 0회, exit 2·partial JSON. 인계/보존 실패면 merge도 0회 | VFY-PWC-13 |
| 외부 제거 인수 | 사용자 보고+실제 부재만 receipt, ack의 worktree 파일/local branch ref/PR mutation 0회와 task receipt 기록, 다음 cleanup 전 재생성/추가 commit 재검사 | VFY-PWC-14 |

### existing protection mapping

| 기존 계약 | 새 시험에서 유지하거나 의도적으로 바꾸는 부분 |
| --- | --- |
| literal harness·main/dev·symbolic ref·checked-out branch | 유지, ref 쓰기 직전 재대조 |
| ancestry / exact PR merged proof | normal은 exact PR, retire는 explicit ancestry. 묵시적 전역 branch sweep 제거 |
| 원격 branch 동일 HEAD 보존만으로 폴더 제거 | normal complete에서는 폐기, 실제 merge 증거 필요 |
| 실행 checkout 전체 dirty 거부 | target 및 관리 소스 신뢰로 제한. 다른 checkout을 청소하지 않음 |
| ignored/links·지문·partial removal | 유지. 위 build-cache 예외만 별도 native 근거와 문서 변경 |
| closing usageEnded·retry | 원래 task의 이력으로만 보존, migration 후 새 consent 필요 |
| 추가 commit·remote branch 재사용·dependent PR | 유지 |
| 최신 모든 workflow 재평가 | parent대로 merge 시 check/필수 조건, 이후 저장된 검증 merge의 cleanup. 임의 후속 rerun으로 증명된 병합을 무효화하지 않음 |

### native CI and qualification

- `test:architecture`는 scripts/**/*.test.mjs, `test:scripts`는 mjs/ts를 재귀 발견한다.
  새 focused 파일은 이 범위에 두고 CLI 시험은 실제 process로 실행한다.
- check/task-worktrees의 Windows 2022/macOS 15에 새 lifecycle/cleanup/recovery/migration/retirement
  시험을 필수로 연결하고 기존 두 step을 마지막에 제거한다. coverage 표도 같은 commit에서 갱신한다.
- Windows는 실제 runtime unqualified·파일 보존·manual receipt 경로가 필수다. fixture용 clear
  대역으로 정책 분기를 검사할 수 있으나 Windows native 자동 정리 지원이라고 보고하지 않는다.
- macOS CI의 현재 Darwin 24.6/Node 22 계열은 runtime qualified profile이 아니다.
  그곳의 native 후보 성공만으로 실제 complete 자동 삭제 통합을 PASS로 세지 않는다.
- 등록된 local Darwin 25.2.0/arm64/Node v26.4.0에서 실제 runtime + Git fixture로
  holder 생존 시 보존, 종료 후 자동 정리까지 별도 필수 확인한다. 환경이 달라지면
  테스트용 profile 우회 없이 해당 gate를 BLOCKED로 둔다.
- 새 GitHub mutation의 실제 권한·서버 정책·서비스 인수는 VFY-PWC-12/ADOPT다.
  REPLACE에서는 원격 대역과 실제 Git 효과의 연결까지만 인증한다.
- Git ref transaction은 fixture에서 응답 유실/잠금 실패/동시 reader/CAS·GC 보존을 검증한다.
  process 중단을 전원 장애까지의 내구성 인증으로 확대하지 않는다.

구현 뒤 실행할 명령: 새 focused node:test, verify:fsd/server/shared, test:architecture,
check, 관련 build, docs:check, verify:ci-coverage. 새 파일과 dependency가 없는 이번
문서 작성에서는 이 구현 시험을 실행하지 않는다.

## Gates, Risks, and Recovery

- 설계 선택은 위에서 고정했지만 이번 요청은 계획 작성이다. REPLACE 구현과 build-cache
  정책 변경을 포함한 범위 승인 후 실행한다. 기존 QUALIFY 승인으로 실제 삭제를 시작하지 않는다.
- 초기 state/creation 시험이 통과하기 전에 원격 mutation을 연결하지 않는다.
- state pin/CAS·중복·미확정 원격 효과의 재요청 방지가 통과하기 전에 cleanup을 연결하지 않는다.
- cache-link 예외와 stale v1 worktree guard fence가 실제 Git/기존 writer fixture에서 성립하지 않으면
  해당 삭제·activation 경로를 중지한다. 조건을 느슨하게 하거나 old writer로 우회하지 않는다.
- source 퇴역은 모든 새 required 보호 시험과 양 OS 제공 경로 검증 뒤에 한다.
- BLK-PWC-01은 Windows 자동 삭제에 계속 적용한다. BLK-PWC-02/03의 실제 old writer 종료와
  GitHub 인수 권한/대상은 ADOPT의 blocker다. 이번 로컬 inventory 수치를 ADOPT의 삭제 입력으로 쓰지 않는다.

activation 전 코드 rollback은 가능하지만 준비된 migration의 marker/fence/intent는 보존하고
검증된 recovery revision으로 처리한다. activation 이후 old 원장을 되살려 두 writer를
가동하지 않는다. migration ref 적용 뒤 중단은 forward recovery가 기본이다.
worktree가 부분 제거됐으면 남은 자료를 보존하고 보고하며 force로 마무리하지 않는다.
삭제 결과 복구는 보존 commit에서 별도 새 경로로 하되 원래 path에 자동 덮어쓰지 않는다.

이 Phase의 안전 주장은 협업 protocol과 관측 가능한 신원에 한정된다. owner label이 인증이
아니며, 외부 raw Git/파일 writer의 동일 SHA 재생성이나 사용 종료 진술의 진위를 OS가
완전히 증명한다는 보장은 없다. control 소스가 신뢰되지 않으면 실행하지 않는다.

## Selected-Phase Readiness and Handoff

판정은 **CONDITIONALLY READY**다. 새 task/상태/원격 경계/이관·퇴역의 책임과 시험은
구체화했다. 현재 구현 전 결정 누락을 숨기는 placeholder는 두지 않았다.
다만 build-cache 링크 예외는 현행 운영 규칙의 의도적 변경이며, native proof gate를
포함한 이 계획의 구현 범위 승인 없이 활성화할 수 없다.

구현 인계 범위는 TASK-PWCR-01~06이다. source와 parent hash, AGENTS, 열린 PR,
QUALIFY profile을 먼저 재확인하고 위 순서로 수행한다. 변경 파일·원격/대역 범위·실제
OS 결과·효과 0회 음성 대조·원장/객체 보존·구 경로 제거와 남은 gate를 보고한다.
PR 병합·main 승격·실제 사용자 원장 이관/정리는 이 인계에 포함하지 않는다.

## Documentation Verification

검증 bundle은 parent + 이 REPLACE plan이다. canonical 정의는 parent에 유지한다.
전체 parent에 미래 ADOPT와 Windows 자동 자격 한계가 있으므로 일반 모드로 검증하고
strict를 선택 Phase filter처럼 사용하지 않는다. 기계 검사와 의미 검토 결과는 별도로 기록한다.

작성 중 #366이 병합되어 최신 origin/dev 651427c로 fast-forward했다. 새 문서를 보존했고
관리 도구·parent·QUALIFY·check workflow의 차이가 없음을 확인했다. 검증 수치는 이 최종 기준이다.

이번 산출물은 이 문서 하나다. 소스·시험·CI·governing proposal·영구 아키텍처 문서는
변경하지 않았다. 관리용 branch/worktree 생성과 시작 점검은 사용자 요청·현행 AGENTS
절차로 수행했으며 제안한 새 CLI나 migration을 실행한 것은 아니다.

### 문서 검증 결과

| 검사 | 결과 | 한계 |
| --- | --- | --- |
| parent + REPLACE plan 일반 traceability | PASS | REQ 16/16의 Phase/Task·canonical VFY 연결. 미래 ADOPT 완료를 뜻하지 않음 |
| npm run docs:check | PASS | Markdown 236개·상대 링크 1,254개·report 61개. 새 문서를 포함한 결과 |
| parent/QUALIFY source hash 및 쓰기 경계 | PASS | 기준 hash 유지, 변경 파일은 이 새 계획 하나 |
| 의미 검토 | 수행 | 인수 receipt와 branch 효과 구분, no-write preview, multi-ref reader 한계, marker 중단, v1 fence의 범위와 old branch writer quiescence, cache-link 정책 예외 대조 |
| 구현·native·실제 GitHub 인수 | 미실행 | 미래 구현의 required gate이며 문서 검사 PASS로 대신하지 않음 |

처음 작성한 fence 설명은 old worktree writer와 독립 branch writer의 차이를 구분할
필요가 있었다. 현행 source를 재대조해 fence가 차단하는 명령을 한정하고, standalone
branch writer의 별도 중지 인계와 부정 대조를 추가했다. migration의 marker 게시가
ref transaction 밖이라는 점도 반영해 intent/marker/read-back/refs/activation 순서와
abort 가능 시점을 구체화했다. 독립 sub-agent 검토나 plan-eng-review를 실행했다고
주장하지 않으며, write-sdd-spec의 기계 검증과 자체 의미 검토 결과다.
