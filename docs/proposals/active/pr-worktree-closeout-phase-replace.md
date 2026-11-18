---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-18"
approved-by: "user"
approved-at: "2026-11-18"
approval-scope: "이 계획에 따른 REPLACE 소스·시험·CI·규칙 교체 및 검증. 실제 사용자 원장 이관/삭제, PR 병합, main 승격, ADOPT 제외."
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
엄격하게 파싱하고 알 수 없는 key/중복 flag/보호 ref를 거부한다. 입력 schema는 operation별
discriminated union이다. 모든 mutation에 task 식별자를 일괄 요구하지 않는다.

- 기존 task mutation은 `--task --owner --expected-state <OID>`가 필수다. HEAD 효과에는
  `--expected-head`, worktree 효과에는 `--expected-instance`를 추가한다.
- 새 create는 아직 task/state가 없으므로 owner/branch/path만 받는다. UUID를 생성하고
  새 task ref의 부재를 내부 CAS 조건으로 사용한다. task/state flag를 추가하면 모순 입력으로 거부한다.
- migrate는 repo 범위다. apply는 plan 파일·expected plan digest·expected migration state
  (`absent` 또는 OID)를 받으며 task state와 혼용하지 않는다. recover/abort는 기존 migration OID가 필수다.
- recover-guard는 `--guard common|task|migration`으로 선택하고 task일 때만 task UUID를 받는다.
  회수는 nonce+quiescent 확인이 필수이며 legacy fence를 선택할 수 없다.
- status/inspect/preview/guard 조회에는 mutation용 동의 flag를 받지 않는다.

숫자 sequence는 출력하고 CAS에는 해당 namespace의 OID를 사용한다. 동일 요청 replay의
저장된 이전 OID와 현재 OID를 혼동해 성공한 중복을 stale로 거부하지 않는다.

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
| retire | expected HEAD/instance/state, usage-ended, request-id | PR 없음 또는 CLOSED-unmerged, open/dependent PR 없음 + fresh dev ancestry 확인 후 retire 목적 설정 |
| acknowledge-removal | expected state/HEAD/instance, request-id, external-removal-confirmed | 명시적 사용자 보고 + 실제 부재·보존 검증, receipt만 저장 |
| migrate preview/apply/recover/abort | repo 범위 plan ID/digest와 migration 전용 expected state | fixture 구현. 실제 적용 권한은 ADOPT |
| recover-guard | guard scope, task scope의 UUID; 회수 시 expected nonce + confirmed-quiescent | 알려진 dead guard만 회수. legacy migration fence는 회수 대상 아님 |

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
- lifecycle: sequence, previousStateOid(null 또는 직전 state OID), phase, creation intent, PR binding(repo ID/number/base/head repo/branch),
  sealed HEAD, 종료 선언과 file fingerprint, cleanup purpose(merged/retire).
- effects: request-id·expected HEAD/state·시도 전 intent·관측 outcome,
  merge/check receipts, worktree removal intent/result, branch delete intent/result.
- observation: profile/qualification revision, status/coverage/실행 여부/시점.
  과거 clear는 다음 삭제 권한으로 재사용하지 않는다.
- external removal: 사용자 보고와 인수 시점, 원래 identity, 부재/보존 확인.
  실제 외부 actor/삭제 시각을 OS가 증명한 것으로 기록하지 않는다.
- migration: old task ID/source digest/원래 state. 옛 closing consent는 새 권한이 아님.

새 state commit은 이전 state를 첫 parent로, 필요한 base/sealed source/merge commit을
추가 parent로 보존한다. previousStateOid가 null인 최초 상태에서는 이력 탐색을 멈춘다.
그 외에는 첫 Git parent와 previousStateOid의 일치, 동일 task/installation/schema를 확인한다.
base/source/merge를 pin한 보조 parent에 대한 일반 ancestry를 승인·replay의 state 이력으로
사용하지 않는다. SHA 문자열을 JSON에 적는 것만으로 GC 보존을 주장하지 않는다.
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
worktree/ref/activation을 바꾸는 짧은 구간에만 잡는다. migration은 common Git당 하나의
coordinator guard를 invocation 동안 보유해 fence가 아직 없는 preparing 구간도 직렬화한다.
이 guard는 task-state의 동일 guard primitive를 사용하며 새 상태 원본이나 service가 아니다.
일반 작업은 task → common 순서다. migration은 coordinator → common으로 journal을
준비하고 common을 놓은 다음, coordinator를 유지한 채 legacy fence → common 순서로 진행한다.
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
   기존 context의 `process.env` 전체 상속과 Git 응답으로 선택 root를 교체하는 동작은
   그대로 옮기지 않는다. 아래 실행 context 계약을 먼저 적용한다.
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

### Git execution context boundary

- CLI뿐 아니라 programmatic entry도 최초 Git 호출 전에 invocation의 환경 snapshot을 검증한다.
  `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_INDEX_FILE`, `GIT_NAMESPACE`,
  `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_SHALLOW_FILE`,
  `GIT_REFERENCE_BACKEND`, `GIT_CONFIG`, `GIT_CONFIG_PARAMETERS`가 비어 있지 않으면
  `git-environment-conflict`로 거부한다. `GIT_CONFIG_COUNT`는 미설정/빈 값/0만 허용한다.
  Windows의 환경 변수 이름 대소문자도 정규화해 검사한다. 값은 출력하지 않는다.
- 이 명령은 ambient Git repository/config override를 지원하지 않는다. 이를 조용히 지우거나
  현재 process.env·사용자 설정을 바꾸지 않는다. 정상 인증·일반 Git 설정은 유지한다.
  검사한 snapshot으로 child env를 만들고 후속 호출이 다른 ambient 값으로 바뀌지 않게 한다.
- 요청한 canonical control root는 별도로 보존한다. Git의 top-level/git-dir/common-dir을
  선택한 root의 실제 .git directory/pointer와 대조하고, 다르면 context-mismatch로 거부한다.
  `git -C`만으로 경계가 고정된다고 가정하거나 Git 응답의 다른 경로로 root를 재지정하지 않는다.
  명시한 --root가 checkout root가 아닌 경우도 거부하며 자동으로 다른 checkout을 선택하지 않는다.
- gh에는 기존 adapter처럼 github.com host와 선택한 repository/PR을 명시한다.
  GH_HOST/GH_REPO의 기본 선택을 원격 쓰기 대상 결정에 사용하지 않으며 인증 값은 기록하지 않는다.

[Git repository 환경 변수](https://git-scm.com/docs/git#_environment_variables)와
[Git config 환경 우선순위](https://git-scm.com/docs/git-config#ENVIRONMENT)를 따른다.
이는 의도한 context의 검증이며 신뢰할 수 없는 Git 실행 파일/사용자 인증 도구까지
격리하는 보안 sandbox를 도입하는 것은 아니다.

### read-only object access

status/inspect/migrate preview 및 부재·state 검증용 read-only Git 호출은
`GIT_NO_LAZY_FETCH=1` 또는 동등한 `--no-lazy-fetch`를 명시한다.
partial clone/promisor 저장소에서 `cat-file` 등의 객체 조회가 암묵적 fetch를 수행할 수 있으므로
“fetch 명령을 직접 호출하지 않았다”만으로 무쓰기·무네트워크를 주장하지 않는다.
로컬 객체가 없으면 missing-object/unknown을 반환하고 hydrate하지 않는다.
기존 optional-locks·replace-object·fsmonitor/maintenance 억제도 유지한다.

inspect --remote의 명시적 GET/ls-remote 허용은 객체 hydration 허용이 아니다.
효과를 허용한 create/complete/cleanup에서 필요한 fetch는 별도의 명시적 단계다.
no-lazy-fetch를 지원하지 않는 Git에서는 조회를 무보호로 재시도하지 않고 unsupported-tool로 보류한다.
[Git no-lazy-fetch](https://git-scm.com/docs/git#Documentation/git.txt---no-lazy-fetch)

검증 연결: VFY-PWC-01/02/08, 상태 CAS와 경합은 VFY-PWC-06.

## Change detail for TASK-PWCR-02

Canonical: [TASK-PWCR-02](./pr-worktree-closeout.md#task-pwcr-02-병합-검증요청관측).

### PR state dispatch before preflight

우선 저장된 task/installation/예상 H와 receipt를 검증한다. 이미 complete/retired인
task의 반복 호출은 로컬 path/admin/등록/ref 부재와 완료 receipt를 확인해 무효과 no-op로
끝내며, 이미 삭제된 live HEAD/marker나 현재 PR readiness를 요구하지 않는다. 재등장은 보존한다.

아직 종료되지 않았고 PR이 연결되거나 complete로 지정된 경우에는 repo/base/저장된 H의
PR binding 뒤 PR 상태부터 분기한다. live HEAD·파일 보존은 새 인계 또는 존재하는 worktree의
정리에 적용하며, 아래 readiness 검사는 OPEN에 새 병합 요청을 보낼 때만 적용한다.

| PR 관측 | complete / recover / retire의 동작 |
| --- | --- |
| OPEN | complete는 종료 인계·자료 보존·CI/readiness 검증 뒤에만 새 intent/PUT 가능. retire는 거부 |
| MERGED (REST closed + merged=true) | exact H·merge SHA·fresh dev 증명을 검증한다. 저장된 merged receipt가 없다면 복구하며 PUT 0회. 현재 reviewDecision/CLEAN을 다시 요구하지 않는다 |
| CLOSED-unmerged | complete는 closed-unmerged로 보존하고 PUT 0회. retire는 새 종료 인계·H의 dev ancestry·open/dependent PR 부재를 확인해 처리할 수 있음 |
| 상태/merged 값·binding 불명확 | 관측 불가로 보존. 추측으로 MERGED/CLOSED를 정하거나 PUT하지 않음 |

retire에서 closed PR은 삭제 권한이 아니다. 해당 task의 현재 H가 fresh dev에 보존됐는지가
별도 근거다. 이미 merged인 PR의 작업은 merged 흐름을 유지하며 retired로 다시 분류하지 않는다.
반복 complete의 terminal/local-removal 재개는 아래 R03 분기와 연결한다.

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
병합 후 관측은 monotonic clock의 공유 120초 budget과 최대 30회로 제한한다.
각 자식 timeout은 min(20초, 남은 관측 budget)이며 query·parse·backoff가 같은 budget을
소비한다. 관측 간격은 2초 이상이다. 429/Retry-After가 남은 budget을 넘거나 다음 호출을
시작할 수 없으면 pending으로 끝낸다. deadline 뒤에는 새 조회를 시작하지 않는다.
이미 시작한 자기 자식의 settle에 최대 4초만 추가하므로 이 관측 구간은 120+4초다.
이는 complete 전체 명령의 총 수행 시간이나 실측 성능 보장은 아니다.
검증 연결: VFY-PWC-02/03/04/07/13.

## Change detail for TASK-PWCR-03

Canonical: [TASK-PWCR-03](./pr-worktree-closeout.md#task-pwcr-03-사용-종료파일branch-정리).

### cleanup dispatch

cleanup은 guard·task/보존 증거를 읽은 뒤 path/admin/registry의 현재 존재와 저장된
제거 결과를 먼저 분류한다. 파일 제거와 남은 branch 처리의 전조건을 분리한다.

| 현재 대상 / 제거 근거 | 처리 |
| --- | --- |
| intact worktree 존재 | 아래 1~7의 자동 제거 검사. qualified/clear가 아니면 폴더와 branch 모두 보존 |
| 모두 부재 + 자신의 durable removal intent/result로 제거 확정 | 파일/probe를 재실행하지 않고 branch-only 단계로 진행 |
| 모두 부재 + 유효한 external-manual receipt | Windows/unqualified여도 branch-only 가능. unknown을 clear로 바꾸지 않음 |
| 모두 부재 + 근거 없음 | external-removal-unconfirmed, branch 보존. 사용자가 실제 외부 제거를 보고해야 ack 가능 |
| 일부만 부재, 새 instance/path 존재, identity 불명확 | partial-removal/identity-changed, branch 보존 |

부재 검사는 lstat로 dangling link도 존재로 취급한다. branch-only 경로는 fresh 부재,
보존 증거, 예상 H/state/instance, 다른 worktree·open/dependent PR·remote ref 재사용을
재검증한다. missing path에 probe를 호출해 unknown이 나왔다는 이유로 이미 인수한 외부
제거를 무효화하지 않는다. 관측 미실행/비적용과 외부 receipt를 별도로 출력한다.
기록된 제거 결과가 있더라도 경로가 다시 생겼으면 branch-only 권한을 사용하지 않는다.

아래 1~4는 intact worktree의 자동 제거 경로다. 5~7은 자체 제거 직후와 검증된
branch-only 경로가 공유한다. 두 경로가 별도 ref 삭제 정책을 갖지 않는다.

1. cleanCheckout/fingerprint를 새 소유 모듈로 이관한다. tracked/staged/untracked, sparse,
   submodule/nested repo, 숨김 index flag, 진행 중 Git/lock, ignored 데이터를 검사한다.
   .env·로그·보고서·private templates는 보존한다.
2. 실제 metadata walk는 bounded 자기 Node child에서 수행한다. 20만 entry/32 MiB 목록,
   1 MiB record, 20초 관측/4초 settle 한계를 적용한다. 디렉터리 링크를 따라 열거하지 않는다.
   root와 각 실체의 device/inode·mode/size/mtime/ctime/link target을 포함한다.
   stat은 bigint 값을 사용하고 child JSON에는 정밀도 손실 없는 십진 문자열로 전달한다.
   root와 다른 device의 directory는 그 안을 읽기 전에 foreign-filesystem으로 거부한다.
   device/identity를 해석할 수 없거나 관측된 mount/reparse 경계가 미지원이면 보존한다.
   lexical containment나 isDirectory만으로 같은 소유 경계라고 판단하지 않는다.
   파일 내용·env는 수집하지 않는다.
3. merged 또는 명시적 retire의 dev ancestry를 확인한다. native 삭제 조건은 오직
   `inspectWorktreeUsage`의 qualified + performed + clear + coverageComplete + settled다.
   이 파일 제거 경로에서 Windows/미지원/관측 오류는 worktree/ref 삭제 0회, cleanup-pending이다.
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
다른 device의 subtree는 내부 캐시처럼 보여도 예외에 포함하지 않는다. device 일치만으로
모든 same-device mount/미인증 reparse topology까지 안전하다고 주장하지 않으며 그런 구성이
알려졌거나 신원을 확정할 수 없으면 보존한다. 이 예외는 일반 local directory topology에 한정한다.

상위 Git 2.50.1의 worktree remove는 directory 재귀 제거를 호출하며 해당 재귀는 별도
st_dev 경계 검사를 하지 않는다. 따라서 Git의 성공/실패에 외부 filesystem 보호를 위임하지 않는다.
이는 소스 대조에 따른 위험 분석이며 현재 사용자 데이터에서 삭제를 재현한 결과는 아니다.
[Git worktree 제거](https://github.com/git/git/blob/v2.50.1/builtin/worktree.c),
[Git 재귀 제거](https://github.com/git/git/blob/v2.50.1/dir.c),
[Node Stats.dev](https://nodejs.org/api/fs.html#statsdev).

예외는 직접 unlink나 rmdir fallback을 추가하지 않는다. native Git remove가 대상 밖 자료를
변경하지 않는 것을 양 OS의 자체 fixture와 qualified Mac 통합에서 입증한 뒤에만 켠다.
verification/AGENTS에 기존 전체 거부에서 달라지는 범위와 native 증거를 같은 변경으로 남긴다.
실패·미검증이면 예외를 비활성화하고 linked-path로 보존한다. 문서 작성만으로 현행 종료 규칙을
완화하지 않는다. 예외 없이는 build 후에도 pending일 수 있다는 제한을 숨기지 않는다.

retire는 PR 없음 또는 CLOSED-unmerged, open/dependent PR 부재, fresh dev ancestor와
같은 인계·보존·사용 조건을 요구한다.
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

### migration journal, fence, publication

migration journal ref는 `refs/stagekeeper/pr-closeout/migration`이다. 최초 apply는
부재 CAS, 재개는 expected migration OID로 갱신한다. complete나 task guard의 OID를
이 ref의 expected 값으로 재사용하지 않는다.

1. 모든 old writer/자식/공유 작업의 quiescence와 owner별 매핑을 확인한다. live/unknown
   legacy guard를 회수하지 않는다. standalone branch 정리기는 그 guard를 읽지 않으므로
   알려진 모든 실행 주체가 별도로 중지·미재실행을 인계해야 한다.
2. migration coordinator guard를 획득한 뒤 common guard 아래 source plan을 검증하고
   **fence 생성 전에** preparing journal을
   CAS로 저장한다. plan digest, installation/migration ID, 예정 fence nonce·위치·owner
   digest와 source snapshot을 포함한다. snapshot은 record/marker digest와 필요한 mapping
   metadata이며 worktree 파일 목록·v1 원장 전체를 journal JSON에 중복 내장하지 않는다.
   원본 v1 기록은 그 위치에 history로 보존한다. journal 저장/read-back 실패면 fence를 만들지 않는다.
   이 구간에는 legacy fence를 아직 보유하지 않으며 common guard를 해제한다.
3. legacy command.guard directory를 배타 생성하고 journal이 지정한 v2 owner를 no-replace로
   게시한다. 이후 legacy fence → common 순서로 잠금을 잡고 journal OID와 fence를 재검증한다.
   이 단계의 nested lock 순서는 기존 규칙을 유지한다.
   old v1 acquire/recover가 unknown v2 guard를 보존하는지는 pinned writer fixture로 검증한다.
   standalone branch writer까지 기술적으로 차단한다고 주장하지 않는다.
4. fence를 얻은 뒤 source digest/path/marker/HEAD를 다시 검사한다. 불일치하면 task ref와
   activation을 쓰지 않는다. journal과 일치하는 완전한 자기 fence만 abort로 회수할 수 있다.
5. 준비한 task state/marker manifest를 journal의 prepared 상태에 기록하고 Git 객체를 pin한다.
   old marker는 보존한다. 새 marker는 no-replace로 게시하고 정확한 installation/task/
   instance/digest만 재사용한다. 다른 값·불완전 파일은 덮어쓰지 않는다.
6. 모든 marker read-back 후 task refs와 applied receipt를 Git ref transaction으로 갱신한다.
   그 뒤 해당 applied journal OID/installation/fence와 결부한 activation marker를 원자적으로
   게시·read-back한다. 파일과 ref를 하나의 filesystem transaction이라고 가정하지 않는다.
7. new guard는 해제하되 v1 기록과 legacy fence를 유지한다. 활성 fence는 recover-guard
   대상이 아니다. 처음부터 검증하지 않은 old writer의 raw 변경까지 차단한다고 주장하지 않는다.

### resume and activation epochs

- preparing + fence 없음: 이전 coordinator가 live/unknown이면 재개하지 않는다. known dead와
  자식 quiescence 확인 후 해당 guard를 정상 회수하고, 새 coordinator 아래 source를
  재검증한 뒤 fencing 재개 또는 abort한다. 같은 plan의 동시 apply도 writer는 하나다.
- preparing/prepared + journal과 일치하는 완전한 v2 fence: known dead+quiescent 조건을
  확인한 migrate recover/abort가 처리한다. legacy recover-guard로 넘기지 않는다.
- owner가 없거나 손상된 fence: 계획 ID/경로가 같다는 이유만으로 자기 것이라 추정하지 않는다.
  fence-unverified로 보존하며 자동 회수·owner 덮어쓰기 없음. 실행자는 정확한 잔존 위치와
  journal을 보고한다. 이는 명시적으로 자동 복구하지 않는 실패 상태다.
- source/marker/ref 일부의 불일치: 새 task 권한을 주지 않고 원래 자료·intent를 보존한다.
- activation 전 applied 전환: transaction에 포함된 task ref가 정확한 prepared OID인지 확인.
- activation 후: immutable applied receipt/installation/activation/fence의 일치를 검사한다.
  task refs는 정상 명령으로 전진하므로 초기 imported OID와의 영구 equality를 요구하지 않는다.
  완료된 task의 old path/admin/marker가 사라져도 과거 migration snapshot을 다시 만족시키라고
  요구하지 않는다. 활성화 이후의 task identity는 새 state가 소유한다.
  task를 읽을 때 schema/installation/task ID 및 해당 import의 first-parent 이력을 확인한다.
  source/merge를 pin한 보조 parent를 state 이력의 증거로 혼동하지 않는다.
- active에서 같은 migration plan 재호출: already-active 관측만 반환한다. 전진한 task를
  working으로 되돌리거나 marker/consent를 재복제하지 않는다. 새 plan으로 두 번째 bootstrap은 거부한다.

### bounded object pinning

여러 task commit을 하나의 commit-tree argv에 모두 넣지 않는다. pin 전용 Git commit을
fan-in 최대 32의 tree로 만들고 journal은 그 root를 parent로 보존한다. leaf는 실제 task
state commit을 참조하며 내부 pin node는 새 상태 원본이나 writable ref가 아니다.
task/migration record와 plan/manifest 각각의 합산 JSON 상한은 1 MiB로 두고, 초과는
task marker/ref 게시 전에 plan-too-large로 거부한다. 각 command의 완성된 argv도
플랫폼 한도 전에 검사하며 내용을 로그에 노출하지 않는다.

Windows CreateProcessW의 command line에는 32,767 문자 한도가 있다. 고정된 작은
parent fan-in은 manifest 한도 안에서도 넓은 argv가 실패하는 경로를 제거하기 위한 것이며
성능 향상 수치를 주장하지 않는다. 이 객체 graph와 GC 도달성은 실제 Git으로 검증한다.
[CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw).

빈 legacy 저장소도 같은 explicit bootstrap plan을 거친다. 필요한 경우 빈 legacy namespace에
fence를 두어 stale old CLI의 뒤늦은 초기화를 막는다. 일반 create의 silent activation은 없다.

첫 새 marker 게시 전 abort만 허용한다. 완전한 자기 fence를 검증했다면 device/inode와
expected owner digest를 포함한 aborting journal을 먼저 저장하고 fence를 회수한 뒤 aborted로
확정한다. owner 제거 뒤 중단돼 빈 directory가 남은 경우에는 이 aborting receipt와 directory
identity·빈 상태가 모두 일치할 때만 rmdir를 재개한다. 초기 생성 중 생긴 owner 없는 fence와
구분하며, receipt가 없으면 추측으로 회수하지 않는다. fence 없는 preparing 상태도 abort할 수 있다.
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
| status/preview/retire | 파일·ref·설정·network의 무변경 범위, PR 없음/closed-unmerged ancestor와 unique/open/dependent 대조 | VFY-PWC-08 |
| 이관·fence·원자성 | source drift·closing consent 미승계·removed/path 재사용·old worktree writer 차단·branch writer 종료 미확인 거부·multi-ref/marker 중단·replay | VFY-PWC-10 |
| 구 경로 제거 | production import/호출/alias/CI old path 0건, history/시험용 pinned source는 명시적 예외 | VFY-PWC-11 |
| intact worktree + unqualified/busy/unknown | 정상 인계/CI면 merge 가능하나 로컬 삭제 0회, exit 2·partial JSON. 인계/보존 실패면 merge도 0회 | VFY-PWC-13 |
| 외부 제거 인수 | 사용자 보고+실제 부재만 receipt, ack의 worktree 파일/local branch ref/PR mutation 0회와 task receipt 기록, 다음 cleanup 전 재생성/추가 commit 재검사 | VFY-PWC-14 |

### review-driven boundary cases

아래 사례는 parent VFY를 보완하는 계획이다. 새 production export나 caller bypass는 추가하지 않는다.
실행 결과가 아니라 구현 시 요구할 assertion이다.

| 사례 | 독립적인 실패 조건과 기대 관찰 | 연결 |
| --- | --- | --- |
| 명령 입력 분리 | 빈 repo의 create/migrate apply가 존재하지 않는 task OID를 요구하지 않음. 다른 command의 state/동의 flag는 거부하고 효과 0회 | VFY-PWC-01/08/10 |
| Git context/env | 두 fixture repo 또는 checkout에서 B를 가리키는 GIT_DIR/WORK_TREE/COMMON_DIR/INDEX_FILE/namespace/config 주입. --root A 요청은 Git 호출 전 거부하며 양쪽 refs/index/원장/worktree 불변, env 값 비노출. Windows 키 대소문자도 검사 | VFY-PWC-01/02/08 |
| lazy fetch 차단 | 로컬 객체가 누락된 promisor fixture의 status/inspect/preview가 unknown을 반환하고 fetch 시도·객체/refs/index/config 변경 0회. 명시적 fetch 대조군은 별도 실행해 fixture가 유효함을 확인 | VFY-PWC-08 |
| Windows branch-only | 실제 unqualified runtime + 외부 제거·ack 뒤 cleanup은 probe/worktree remove 0회, 검증된 local branch만 제거. receipt 뒤 path 재생성 시 branch도 보존 | VFY-PWC-13/14 |
| PR terminal routing | 완료 task의 반복은 삭제된 live HEAD를 요구하지 않고 효과 0회. MERGED+현재 UNKNOWN readiness는 증명 복구로 처리하고 PUT 0회. CLOSED-unmerged+ancestor는 retire, unique commit/open/dependent는 보존 | VFY-PWC-03/07/08 |
| fence 전후 중단 | journal 저장 직후/fence owner 게시 직후/source 재검사 전 중단 및 같은 plan의 동시 apply. writer는 하나이며 완전한 자기 fence만 복구·abort, owner 없는/다른 fence는 보존 | VFY-PWC-06/10 |
| abort 중단 | aborting 기록 뒤 owner 제거 전/후 중단. 기록한 동일 빈 directory만 회수, 교체된 directory는 유지 | VFY-PWC-10 |
| activation 뒤 정상 전진 | 이관 task의 상태 전진과 정상 완료·admin 제거 뒤에도 status/create/같은 migration replay가 정상 작동. imported OID로 되돌리기 0회 | VFY-PWC-10 |
| pin 상한·도달성 | 큰 manifest의 command argv가 한도를 넘지 않음. 32개를 넘는 서로 다른 state 객체는 실제 Git에서 journal만 남긴 뒤 GC해도 도달 가능 | VFY-PWC-06/10 |
| shared deadline | 남은 1초에 새 20초 command를 시작하지 않음. 만료 뒤 조회 0회, settle은 별도 4초 안에서 결과/미종료를 구분 | VFY-PWC-07 |
| filesystem 경계 | normal directory 모양이어도 다른 device이면 하위 열거·worktree/ref 삭제 0회. root identity 변경/미확정도 보존 | VFY-PWC-05 |

큰 argv의 construction/timeout은 process/clock 경계 대역으로 검증하고, Git 도달성과
branch/worktree 효과는 실제 Git으로 검증한다. 별도 filesystem을 실제 mount할 권한이 없으면
metadata 부정 대조를 native mount 시험으로 부르지 않는다. 이 review에서는 mount·삭제·시험을 실행하지 않았다.

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
abort 가능 시점을 구체화했다. 초안 작성 당시 독립 sub-agent 검토나 plan-eng-review를 수행한 것은 아니며,
write-sdd-spec의 기계 검증과 자체 의미 검토 결과였다. 이후의 정식 plan-eng-review는 아래 기록과 구분한다.

## Engineering Review Record — 2026-11-18 (1차)

### 대상·최초 판정·권한

선택 대상은 이 REPLACE plan이다. 최초 review baseline은 local commit
`7cccb20`의 SHA-256 `f232540da21905eb467eedba9b15a4bba9e3125dc9ed086944b6f60d58fd541c`,
코드 기준은 `651427c`다. 같은 미병합 작업을 계속했고 시작 tree는 clean이었다.
검토는 위 로컬 snapshot을 기준으로 했으며 최신 원격과의 동기화 검토는 포함하지 않았다. 시작 시 열린 PR 목록은 비어 있었다.

**처음부터 개선점이 없었던 문서는 아니다.** 최초본에서 아래 7건을 확인해 문서에 반영했다.
이는 제안서의 충돌·실패 경로·증명 공백이며, 아직 없는 REPLACE 코드의 재현 bug라고
주장하지 않는다. 사용자 요청의 “검증하고 개선”을 이 파일의 계약 보완·시험 계획 수정
권한으로 사용했다. parent, 실제 source/test/CI, 운영 metadata는 수정하지 않는다.

### Findings and dispositions

아래 줄 번호는 수정 전 7cccb20 snapshot 기준이다.

| ID | 영역 / 중요도 / 확신 | 최초 근거·영향 | 문서 수정·상태 |
| --- | --- | --- | --- |
| F1 | code quality / INFORMATIONAL / 10 | 144~162: 모든 mutation에 task/state 필수라고 하면서 fresh create·repo migration·guard 회수는 task가 없는 입력을 정의 | operation별 schema와 namespace, fresh absent CAS·guard selector 구분. 반영 |
| F2 | architecture / CRITICAL / 10 | 315~317의 일괄 qualified+clear 요구가 377~380의 Windows 외부 제거 후 branch-only와 충돌. absent target을 probe하면 다시 unknown으로 막힐 수 있음 | 존재/제거 근거별 dispatch를 모든 파일 검사 앞에 배치. unknown 유지하며 receipt+fresh absence로 ref만 처리. 반영 |
| F3 | architecture / CRITICAL / 9 | 420~430: v2 fence 생성이 canonical journal보다 먼저다. 완료된 fence 게시 뒤 중단하면 old v1은 회수하지 못하고 새 migration의 durable expected state가 없음 | coordinator 직렬화와 preparing journal 선행, 검증된/owner 없는 fence 구분, aborting receipt와 정확한 회수 재개. 반영 |
| F4 | lifecycle / INFORMATIONAL / 9 | 263~274의 readiness가 OPEN에 한정되지 않고, 159/349의 no-PR 조건은 parent REQ-PWC-012의 closed-unmerged 종료를 놓침 | OPEN/MERGED/CLOSED-unmerged/unknown 분기. 외부 병합은 준비 상태 재요구 없이 증명 복구, closed-unmerged retire 포함. 반영 |
| F5 | architecture / INFORMATIONAL / 9 | 433~435: 초기 imported ref와 activation 일치 조건의 적용 시점이 불명확. 정상 task 전진을 migration 불일치로 판정할 수 있음 | cutover의 정확 OID와 active 이후 installation/applied receipt 및 state lineage를 분리. 반영 |
| F6 | performance / INFORMATIONAL / 9 | 429~430의 모든 task parent는 manifest 크기에 따라 Windows argv 한도를 넘을 수 있음. 300~302의 nested timeout도 공유 budget 전달이 명시되지 않음 | bounded fan-in pin tree, manifest/argv 상한, 남은 관측 시간 전파와 settle 분리. 반영 |
| F7 | data preservation / CRITICAL / 8 | 312~341은 canonical path와 directory/link 모양만으로 소유 범위를 판단. 다른 device의 mounted subtree는 일반 directory일 수 있고 Git 재귀 제거에 넘겨질 수 있음 | device/inode를 보존 지문에 포함하고 다른/불명확한 filesystem 경계는 진입 전에 거부. 동일 device가 모든 mount 부재를 증명한다고 주장하지 않음. 반영 |

F3은 실제 `manage-task-worktrees.mjs:269~292,310~320`의 strict v1 guard reader와
새 계획의 순서를 함께 확인했다. F7은 현행 `fingerprint:383~421`의 metadata 및
upstream Git 2.50.1의 worktree/dir 제거 경로를 대조한 추론이다. Apple Git 배포의
모든 patch나 실제 mounted 데이터 삭제를 재현한 결과는 아니다.

### Scope challenge and structural comparison

제안 변경은 production module 6개, focused test 6개, 기존 command/policy/source 기록 수정
6개, legacy source/test 제거 4개 및 fixture 약 1~3개로 **23~25개+실행 증거**를 예상한다.
읽은 파일 수가 아니며 fixture 세부 분할에 따라 달라진다. 새 service/DB/daemon은 0개다.

| 구조 | 책임·비용 | 판정 |
| --- | --- | --- |
| 현재 6개 module | state store, Git workspace, GitHub, migration, CLI, 격리 inventory child. I/O 실패와 v1 지식을 분리 | 유지. 기존 parent의 소유 경계와 부합 |
| 4개로 축소 | migration을 task-state에, inventory worker entry를 git-workspace에 합침. public 명령·증거는 동일 | 가능하지만 장기 state 계약과 일회 v1 지식, 읽기 전용 worker와 mutation의 결합이 커져 선택하지 않음 |

8개 red flag를 대조했다. command 표면은 넓지만 대부분 실패/복구 경계이며 단순
pass-through service를 만들지 않는다. v1/신 state의 두 writer는 금지하고, runtime/probe는
자격 검증 목적을 구분한다. index는 orchestration과 guard 수명을 소유하며 내부 cleanup을
호출할 때 public CLI를 재귀 호출해 guard를 다시 잡지 않는다.
task-state는 state/migration refs·guard/activation의 writer, git-workspace는 실제
worktree/branch/identity marker 효과의 owner다. legacy-migration은 이를 호출하는 v1
해석·이관 coordinator이며 별도 JSON 상태 원본을 쓰지 않는다.
후속 구현의 내부 exports를 사용자 API로 약속하거나 제품 import 경계를 넓히지 않는다.

### Evidence checks and four-area result

- **Premises:** QUALIFY 결과·조건부 방향·기존 runtime profile·v1 guard/파일 보존·CI 발견 규칙은
  로컬 source와 parent에서 확인했다. 새 source가 없는 것은 결함으로 세지 않았다.
  외부 API·Git atomicity·Windows argv는 공식 문서/고정 upstream source로 대조했다.
- **Architecture:** F2/F3/F5/F7 보완. mutation과 관측·receipt의 역할, activation epoch,
  unknown의 fail-closed·partial outcome 및 원격/로컬 효과 분리를 재검토했다.
- **Code quality:** F1/F4 보완. old helper의 호출자와 schema를 확인하고 호환성이 다른
  Git/gh transport와 cwd observer의 오류 정책을 모양만 보고 통합하지 않는다.
- **Tests:** 기존 외부 canary·추가 commit·동시 ref 변경·중단·guard 시험의 assertion은 강한
  legacy 증거다. 새 state/migration/merged-pending/manual 흐름은 planned이며 현재 coverage가 아니다.
- **Performance:** F6 보완. inventory는 파일 수 F, state/이관은 task 수 T와 JSON bytes B,
  polling은 최대 횟수와 공유 deadline으로 제한한다. 원격 대기 중 common guard를 유지하지
  않는다. pin tree는 O(T) 객체/명령 작업이며 task 수와 무관한 상수 시간이라고 설명하지 않는다.
  latency/p50/p95·최대 native I/O 비용은 구현 때 기록하며 이번에는 측정하지 않았다.

### Coverage and failure diagram

~~~text
[E] legacy finish → JSON/guard → file identity → Git remove → branch cleanup
    proof: 보호 ref·외부 link·추가 commit·guard/중단 assertions
[P] complete → 입력/PR state → OPEN preflight → durable intent → merge
                      ├─ MERGED → merge proof 복구 (PUT 0)
                      └─ CLOSED-unmerged → complete 보존 / 명시적 retire
[P] cleanup → 실제 존재 + 제거 근거
              ├─ present → qualified/clear + 보존 → Git remove
              ├─ absent + own intent/external receipt → branch-only
              └─ unknown/partial/reused → 보존
[P] migrate → preparing journal → fence → revalidate → pin/markers → ref transaction
              → activation → task refs 정상 전진
    failure: fence 직후 중단 → journal 기반 재개; owner 없는 fence → 보존
~~~

E는 실제 기존 코드, P는 계획이다. diagram의 모든 새로운 효과는 위 matrix와 아래
value card의 planned integration 증거가 필요하다. 실제 GitHub 인수는 ADOPT에 남긴다.

| 검증 가치 | 보호 / 결함 조건 / 기존 공백 | seam·한계 |
| --- | --- | --- |
| F1 입력표 | 기존 task 없는 bootstrap을 막거나 다른 namespace OID를 받으면 실패. 새 CLI coverage 없음 | 실제 CLI parser, production test-only flag 없음 |
| F2 branch-only | unqualified 때문에 인수된 외부 제거를 막거나, 재생성된 path까지 제거하면 실패 | 실제 Windows Git/runtime, GitHub만 대역 |
| F3 fence/abort | canonical intent 없이 fence를 남기거나 다른/빈 ownerless guard를 추정 회수하면 실패 | 실제 v1 writer+Git/metadata, owned child crash. 전원 장애 증명 아님 |
| F4 PR routing | merged PR에 PUT하거나 closed-unmerged ancestor를 무조건 거부하면 실패 | GitHub 경계 대역과 실제 Git, provider live 인수 아님 |
| F5 active epoch | 정상 task 전진 후 inactive가 되거나 재이관으로 consent/HEAD를 되돌리면 실패 | 실제 state CAS/marker와 재진입. raw writer 전체 차단 아님 |
| F6 bounds | 큰 manifest의 argv 초과, pin 누락으로 GC 후 객체 소실, deadline 뒤 새 조회이면 실패 | 큰 argv/clock은 경계 대역, >32개 state 도달성은 실제 Git. benchmark 아님 |
| F7 filesystem | 다른 device의 일반 directory에 들어가거나 신원 불명 상태에서 삭제하면 실패 | metadata 음성 대조와 기존 native link fixture. 실제 mount 미실행을 구분 |

읽은 기존 시험의 구체적 근거는 `manage-task-worktrees.test.mjs:109~227`의 보호 ref/
자료/canary assertions, `:297~360`의 중단/guard 보존, `cleanup-task-branches.test.mjs:262~331`의
CI metadata·추가 commit·원격 ref 재사용 대조다. 새 CLI로 의미를 옮긴 뒤에만 옛 시험을 퇴역한다.
단순 import/non-throw 시험으로 destructive workflow의 coverage를 주장하지 않는다.

### Counterarguments and decisions

- F1: 표의 예외를 구현자가 추론할 수 있지만 공통 입력 규칙과 충돌하므로 parser 계약으로 명시했다.
- F2: 수동 인수 절에 의도는 있었으나 일반 cleanup 전조건을 먼저 적용하면 막히므로 dispatch 순서가 필요했다.
- F3: owner JSON 자체가 단서일 수 있지만 canonical authority와 expected state를 대체하지 않는다.
  durable journal 선행은 완전한 자기 fence의 재개를 가능하게 하고 ownerless 추정 회수를 피한다.
- F4: GitHub 병합 readiness는 OPEN에만 의미가 있다. terminal PR를 같은 조건에 통과시키지 않는 것이 parent와 맞다.
- F5: 정확 OID 비교는 cutover에는 필요하다. 활성화 뒤 정상 state 전진까지 금지하는 의미로 남겨 두지 않았다.
- F6: 현재 active 수가 작아도 문서의 허용 manifest가 Win argv 한도를 초과할 수 있다. 작은 fan-in은 목표를 줄이지 않는다.
- F7: canonical path/동일 device가 모든 특수 mount를 인증하지 않는다. 탐지된 경계와 불명확한 topology를
  보존하며, Git remove 자체에 없는 보장을 가정하지 않는다.

| 결정 | 상태 / 근거 |
| --- | --- |
| F1~F7의 parent-compatible 계약·시험·경계 보완 | 문서 반영. 사용자의 개선 요청과 기존 REQ/INV 보존 범위 |
| 6-module 구조, 조건부 방향, 별도 ack 효과 | baseline 유지. 기능 삭제·새 service 없음 |
| build-cache link 예외의 실제 활성화 | 기존 제안·native gate 유지. 이번 review는 운영 승인 아님 |
| parent/제품/시험 구현 변경, 실제 원장/PR mutation | 범위 밖, 수행하지 않음 |
| 독립 agent review | 요청되지 않아 미실행. 이번 counterargument pass는 self-review |

### Review readiness and verification

설계 검토 판정은 **Ready**다. 확인한 7건은 문서에서 해소했으며 재검토 범위에서
추가로 미해결된 critical 설계 결함이나 새 사용자 선택이 필요한 항목은 발견하지 못했다.
이는 구현·native gate 통과나 cache 정책 변경의 실행 승인이 아니다. front matter는
계속 awaiting-approval이며 기존 CONDITIONALLY READY 실행 전제와 모순되지 않는다.

구현 순서는 기존 R01 → R02/R03 → R04 → R06 → R05를 유지한다. F1은 R01, F2/F7은 R03,
F4는 R02/R03, F3/F5/F6 pinning은 R06, shared deadline은 R02의 완료 기준에 반영했다.
공유 state/schema를 먼저 정한 뒤 remote/Git 경계의 독립 작업을 진행하고, 통합된 복구
검증 뒤에만 R05가 구 경로를 제거한다. lane 구분은 agent 병렬 실행 승인이 아니다.

이 review는 문서 한 파일만 수정했다. 요청한 저장 결과를 전체 read-back하고,
parent/source 보존·일반 traceability·docs:check·diff 공백 검사를 확인한다.
새 구현 테스트·GitHub merge·파일 제거·mount·benchmark는 실행하지 않는다.

### 최종 확인 결과

| 검사 | 결과 |
| --- | --- |
| 전체 저장 문서 read-back 및 counterargument 재대조 | 수행. 문서 기준 7건 반영, 추가 미해결 설계 지적 없음 |
| parent + REPLACE plan 일반 traceability | PASS, REQ 16/16의 작업·canonical VFY 연결 |
| npm run docs:check | PASS, Markdown 236개 / 상대 링크 1,254개 / test report 61개 |
| git diff --check | PASS |
| parent/QUALIFY·source/test/CI 변경 여부 | 없음. 수정 대상은 REPLACE plan 한 파일 |
| 구현/native/benchmark/독립 agent review | 미실행. 검토 결과를 실행 증거로 세지 않음 |

최종 구현 전제는 기존 계획의 실행 범위 승인과 required native 검증이다. 검토 판정
Ready와 실제 코드·정책 활성화의 승인을 구분하며, 검증되지 않은 동작을 통과한 것으로
기록하지 않는다.

## Engineering Re-review Record — 2026-11-18 (2차)

### 이번 검토 기준과 최초 판정

대상은 1차 수정본 `d789588`이며 시작 SHA-256은
`8c1e5e6711948c71c15b1808baa36de4e86d8f2eac6d9cb8b9bb7913d016486b`다.
같은 미병합 작업의 계속이고 시작 tree는 clean, 열린 PR은 없었다.
parent/source 기준은 `651427c`로 유지했다. 이전 F1~F7을 다시 수정한 수로 세지 않는다.

**이번 수정본에도 처음부터 추가 개선점이 없었던 것은 아니다.**
Git 실행 경계에서 아래 2건을 새로 확인해 반영했다.
이전의 조건부 방향·6-module 구조·삭제 권한·Windows 미지원 범위는 그대로다.

| ID | 영역 / 중요도 / 확신 | 시작본 근거와 영향 | 반영 |
| --- | --- | --- | --- |
| F8 | context binding / CRITICAL / 9 | R01은 기존 context 이관을 지시하지만 ambient Git 변수 검증이 없다. 기존 gitCommand는 process.env를 상속하고 context는 rev-parse 결과로 root를 교체한다. 지정한 checkout과 다른 context를 사용할 수 있음 | 환경 충돌을 Git 호출 전 거부, 고정 root/.git/git-dir/common-dir 대조, 명시적 gh host/repo와 child 환경 snapshot |
| F9 | read-only contract / INFORMATIONAL / 9 | state가 Git 객체에 저장되는데 객체 조회의 implicit lazy fetch 차단이 없다. partial clone의 누락 객체 조회가 status/preview의 무네트워크·무쓰기 계약을 깨뜨릴 수 있음 | no-lazy-fetch 명시, missing-object/unknown, 무보호 fallback 금지와 promisor 음성 대조 |

F8 근거는 `manage-task-worktrees.mjs:143~196`다. 기존 시험의 beforeEach는 GIT_* 변수를
지우므로 이 입력 상태를 검증한 것으로 볼 수 없다. 읽기 전용 `git -C ... rev-parse --show-toplevel`을 두 기존 자기 checkout에 대해
실행했고, GIT_DIR/GIT_WORK_TREE를
control checkout으로 설정한 child가 요청 root와 다른 top-level을 반환함을 확인했다.
부모 환경·Git 설정·파일·ref는 변경하지 않았다. 다른 저장소의 생성/삭제를 실제로
실행했다는 뜻은 아니다.

F9는 Git 공식 문서의 no-lazy-fetch 의미와 제안한 Git-object reader를 대조한 결과다.
설치된 Git 2.50.1에서 `git --no-lazy-fetch rev-parse --show-toplevel`의 지원은 확인했다.
실제 promisor fetch를 유발하거나 새 REPLACE 시험을 실행한 것은 아니다.

### 네 영역·반론·증거 범위

- Architecture: F1~F7의 journal 선행·coordinator·activation epoch·branch-only와 parent의
  terminal/retire 계약을 다시 대조했다. 추가로 F8의 repository 경계만 보완했다.
  6개 module 대 4개 대안 및 23~25개+증거의 범위 추정은 유지한다.
- Code quality: context 구성은 한 owner가 맡고 모든 Git 소비자가 같은 검증된 환경을 사용한다.
  전체 GIT_* 삭제로 인증/사용자 설정을 무심코 바꾸는 대안을 택하지 않았다.
- Tests: 기존 보호 ref·canary·중단·guard assertions와 새 planned matrix를 구분했다.
  F8/F9 두 경계 사례를 추가했으며 production test-only flag는 만들지 않는다.
- Performance: 기존 shared deadline·pin fan-in·목록/record 상한은 유지한다.
  read-only 조회에 숨은 네트워크 대기·객체 쓰기를 추가하지 않도록 F9를 보완했다.
  새 benchmark나 성능 개선 수치는 없다.

반론도 확인했다. 정상 셸에는 충돌 변수가 없을 수 있지만, 외부 호출자나 Git 작업에서
상속되는 입력은 -C가 제거하지 않는다. 따라서 명시한 root를 보존하는 기존 계약의
필수 검증이며 새 기능이 아니다. 또 일반 full clone에는 lazy fetch가 없지만,
초기 지원을 SHA-1로만 제한한 계획은 partial clone을 제외하지 않았다. Git의 조회
옵션으로 무변경 계약을 지키며 네트워크 동작을 추측하지 않는 안을 선택했다.

~~~text
[P] command → 입력 검증 → Git env/context 검증
                         ├─ conflict/mismatch → Git/원격/state mutation 0
                         └─ read-only → no-lazy-fetch 객체 조회
                                         ├─ local object → 검증 결과
                                         └─ missing object → unknown, fetch 0
~~~

Value F8: protects=선택한 repository/checkout과 자료;
fails_when=환경 override를 따라가거나 값을 노출;
why_new=기존 fixture는 GIT_*를 지움;
seam=실제 CLI child env와 두 Git fixture;
no_claim=악의적인 Git binary/credential helper 격리.

Value F9: protects=status/inspect/preview의 무쓰기·무네트워크;
fails_when=missing object 조회가 hydrate/fetch를 시작;
why_new=신 state는 Git 객체이며 기존 JSON reader 시험으로 미충족;
seam=실제 promisor Git fixture와 실행/객체 변화 관측;
no_claim=실제 서비스 인수나 모든 external user instrumentation의 무효과.

### 판정과 변경 권한

사용자의 이번 “검증하고 개선” 요청과 기존 REQ-PWC-001/002/009·INV-PWC-002 보존 범위로
F8/F9를 문서에 반영했다. 상위 문서·source·tests·CI·사용자 설정은 수정하지 않았다.
독립 agent review는 요청되지 않아 수행하지 않았다.

설계 검토 판정은 **Ready**다. 이번 추가 2건을 반영한 뒤 재대조한 범위에서는
추가 미해결 설계 문제나 새로 결정해야 할 기능 선택을 발견하지 못했다.
1차의 7건과 이번 2건을 구분하며, 문서 개선을 실제 구현/native 통과로 표시하지 않는다.
실행 범위 승인과 필수 native 검증은 기존 계획대로 남는다.

### 2차 최종 확인

- parent + REPLACE plan 일반 traceability: PASS, REQ 16/16.
- docs:check: PASS, Markdown 236개·상대 링크 1,254개·report 61개.
- 전체 저장 내용과 d789588을 비교해 의도한 실행 경계·시험 계획·2차 기록 외 변경이 없음을 확인했다.
- diff 공백 검사와 parent/QUALIFY hash 유지 확인: PASS. 수정 파일은 이 문서 하나다.
- 두 checkout의 읽기 전용 root 재지정 확인과 no-lazy-fetch 옵션 지원 확인만 실행했다.
  실제 생성·삭제·merge·promisor fetch·새 기능 시험·benchmark는 실행하지 않았다.

## Implementation Record — 2026-11-18

사용자가 이 문서를 기준으로 실제 수정을 요청해 REPLACE 구현 범위를 승인했다.
이전 review/계획 섹션의 “이번 한 파일만 수정”·“아직 소스 없음”은 당시 기록이다.
현재 구현과 실행 근거는 [REPLACE 보고서](../../test-reports/active/pr-worktree-replace.md)를 따른다.

- R01/R02/R03/R04/R06을 Node ESM 여섯 module과 실제 Git fixture로 구현했다.
- R05에서 구 production manager 두 개, root test 두 개와 npm aliases를 제거하고
  pr entry·AGENTS·verification·양 OS CI·UPSTREAM·이전 lifecycle supersession을 함께 바꿨다.
- source/merge/tool revision은 Git parent로 pin하고 state/branch 삭제는 no-deref CAS를 사용한다.
- runtime 자격은 그대로다. unknown/Windows는 merged-pending이며 명시적 외부 제거 인수 뒤만
  branch-only가 가능하다. ignored 내부 build link 예외는 Windows native gate에서 잔존 폴더가 확인되어
  계획의 실패 분기에 따라 비활성화했다. 내부 directory link도 linked-path로 보존한다.
- migration preview envelope의 plan/planDigest를 제공한다. journal 선행·v2 fence·bounded pin·
  no-replace marker·applied transaction과 forward recovery를 구현했다. closing consent는 승계하지 않는다.
- 실제 GitHub가 required check 0건을 반환할 때 CLI exit 1을 오류/성공으로 추측하지 않고
  GraphQL isRequired·pagination·head binding으로 판정한다. 최신 check workflow 성공은 별도로 필수다.
- 병합 readiness 뒤 파일이 변경되는 경합과 ack replay OID 갱신을 회귀 시험으로 보완했다.
  plan의 authority를 넓힌 변경은 없다.
- 사용자 원장의 activation/삭제, 실제 PR merge, main promotion, ADOPT는 실행하지 않았다.
  local gate는 통과했고 최신 dev 통합 및 Windows/macOS CI를 확인 중이다.
