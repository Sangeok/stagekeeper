---
status: "pending"
stage: "blocked"
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
  - "docs/proposals/completed/2026-11-18-pr-worktree-closeout-phase-replace.md"
  - "docs/test-reports/completed/2026-11-18-pr-worktree-replace.md"
  - "docs/architecture/verification.md"
---

# PR worktree 완료 흐름 — ADOPT 실행 계획

이 Mac의 기존 작업을 보존한 채 새 관리기를 활성화하고, 첫 실제 작업에서 **평소대로 빌드한 뒤 dev 병합과 로컬 정리가 한 호출로 끝나는지** 확인한다. 운영 이관은 완료했다. 첫 실 PR #372의 빌드 후 검사 결과와 후속 인수 상태는 [실행 보고서](../../test-reports/active/pr-worktree-adopt.md)에 기록한다.

상위 계약은 [PR worktree SDD](./pr-worktree-closeout.md), 실행 명령은 [운영 규칙](../../architecture/verification.md#작업-브랜치-정리)이 소유한다. 작성 모드는 PHASE_PLAN, 위험도는 HIGH-RISK다. 이 변경은 이 계획과 상위 SDD의 진행 상태를 갱신한다. PR 병합·Git ref 삭제·이관은 아래 실행 단계에서 각 대상의 권한과 증거를 확보한 뒤 수행한다.

## 현재 저장소와 이관 범위

- 기준은 [#369](https://github.com/Sangeok/stagekeeper/pull/369)가 병합된 dev `d745747`이다. REPLACE는 실제 Git 및 양 OS에서 검증됐으며 GitHub 병합 요청은 대역으로 시험했다. 이전 결과는 [검증 보고서](../../test-reports/completed/2026-11-18-pr-worktree-replace.md)에 있다.
- 2026-11-18 운영 Mac의 기존 common Git에서 `status`는 `active=false`, `legacyPresent=true`, `migration=null`이었다. 읽기 전용 preview는 12건, active 3건, removed 이력 9건, 사유 0건이었다. sourceDigest는 `8a06a286a185852943a9a3358609b8cec9e4d16dea1c85442f70f6c9bdb77033`이다. 아래 UUID·HEAD 접두어는 사람이 대조할 표식이다. 실행 입력은 새 preview의 전체 값에서 얻는다.
- preview에 사용한 checkout은 #369의 최종 head `5f2d527`이다. 실행 시에는 대상 밖의 동일 common Git에 속하는 제어 checkout에서 해당 시점의 검증된 dev로 preview를 새로 만든다. 각 clone은 원장이 독립적이다. 문서 작성용 별도 clone에서 만든 작업이나 빈 원장 bootstrap은 운영 인수 증거에서 제외한다.
- 저장소 workflow·공통 action에서 구 명령 직접 호출은 발견되지 않았고 한 시점의 로컬 프로세스 검사에서도 이름이 일치하는 구 관리기는 0개였다. 세 작업의 인계 확인과 구 명령 중지 확인은 아직 확보하지 못했다. 다음 세션·예약 작업의 재실행 가능성까지 확인할 자료는 아직 없다.

| 운영 작업 / v1 task 접두어 | 소유자 표식 / HEAD | 현재 근거 | 제안하는 인계 |
| --- | --- | --- | --- |
| `harness/ci-verification-code-organization-sdd` / `07d8bcf2` | `codex-ci-verification-sdd-20261117` / `7097582` | active, 일반 Git status에 untracked 항목 2개 | 미추적 자료와 Git 인덱스를 보존해 working으로 이관. 소유자가 계속 작업할 위치를 확인한다. |
| #364 / `3163c7e4` | `codex-pr-worktree-closeout-sdd-20261117` / `4ac5281` | QUALIFY PR 병합, 원장은 active | working으로 보존. 소유자와 기존 build 자료의 사용이 끝난 뒤 별도 종료 대상으로 판단한다. |
| #369 / `818c972a` | `codex-pr-worktree-replace-plan-20261117` / `5f2d527` | REPLACE PR 병합. 현 worktree에 대해 실제 파일 보존 검사가 `linked-path`를 반환 | working으로 보존. `.next/node_modules` 아래 pg·Prisma 링크를 유지한다. 실제 이관의 대조군으로 쓰되 새 PR 병합 시험으로 세지 않는다. |
| removed 9건과 미등록 worktree | 원래 기록 및 Git registry | 기존 제거 이력, 관리 밖 경로 | 이력과 경로를 보존한다. 새 task ref가 생기면 이관을 통과로 기록할 수 없다. |

세 active 항목은 모두 **working으로 이관할 후보**다. 작업 내용이 dev에 보존됐더라도 과거의 종료 의사를 승계하지 않는다. 실행 전 종료하기로 바뀐 항목은 소유자가 승인된 절차로 종료한 사실과 결과를 확인하고 전체 preview를 갱신한다. 행을 편집해 부분 이관하는 기능은 없다.

## Phase ADOPT: 운영 원장 전환과 실제 병합 인수

- satisfies: REQ-PWC-010, REQ-PWC-005, REQ-PWC-007, REQ-PWC-015, REQ-PWC-016
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-003, INV-PWC-004, INV-PWC-005, INV-PWC-006
- governed-by: CON-PWC-002, CON-PWC-003, CON-PWC-005, CON-PWC-006, CON-PWC-008
- verified-by: VFY-PWC-10, VFY-PWC-12

| 완료할 일 | 기존 구현 / 실제 변경 위치 | 성공을 판정할 증거 |
| --- | --- | --- |
| TASK-PWCA-01 / REQ-PWC-010 | [migration](../../../scripts/pr/legacy-migration.mjs)의 `migrate`, `finishMigration` 및 [상태 저장](../../../scripts/pr/task-state.mjs). 운영 common Git의 이관 ref, task refs, 연결된 admin marker, activation 파일 | VFY-PWC-10. 실제 이관 전후 매핑, 기존 자료 보존, 활성화 재조회와 동일 plan 재호출 |
| TASK-PWCA-02 / REQ-PWC-005, REQ-PWC-007, REQ-PWC-015, REQ-PWC-016 및 이관된 작업의 연속성 | [CLI](../../../scripts/pr/index.mjs)의 `complete`, `recover`, `cleanup`, [PR 요청·증명](../../../scripts/pr/github-merge.mjs), [파일 검사](../../../scripts/pr/git-workspace.mjs). 승인된 PR과 그 task의 로컬 상태만 변경 | VFY-PWC-12. qualified Mac에서 A만 완료, Windows에서 병합 후 보류·수동 인수·branch 정리, B 보존과 중복 병합 0회 |

### 기존 작업 전환 — TASK-PWCA-01

1. 운영자가 원래 작업 저장소와 선택한 control 양쪽에서 `git rev-parse --path-format=absolute --git-common-dir`를 실행해 같은 실경로인지 확인한다. 선택한 control은 이 원장을 공유하고 세 대상 밖에 있어야 한다. 전환·복구가 끝날 때까지 같은 버전의 관리 소스를 유지한다. 오래된 control은 소유자·사용·변경 상태를 확인한 뒤 준비한다. 문서 작성 clone의 control이나 대상 작업 디렉터리에서 운영 쓰기를 실행하지 않는다.
2. 위 표 각 행에 대해 소유자가 **task·instance·HEAD·경로·보존 자료·계속 사용할 위치·인계 시점**을 확인한다. 기존 writer 실행 주체는 진행 중인 구 명령과 자식의 종료, 예약·시작 훅·다른 세션에서의 재실행 중지를 확인한다. `command.guard`는 구 worktree 관리기만 막고 독립 branch 정리기는 이 잠금을 읽지 않는다. 다른 PC가 별도 clone을 쓰면 그 PC의 원장은 별도 전환 대상이다.
   각 담당자 또는 해당 세션을 관리하는 운영자는 `작업 / 현재 HEAD / 파일을 유지한 working 이관 / 중지한 구 명령·실행 주체 / 확인 시각`을 남긴다. 한 사람이 전부 관리한다면 한 번에 기록할 수 있다. 담당자가 불명확한 작업은 대기시킨다.
3. 소유자들과 전환 구간을 정하고 그동안 자료와 ref를 그대로 유지한다. 대상 밖에서 보호 원격 main/dev 존재, origin, control의 소스 revision과 청결 상태를 점검한다. 아래 예시에서 `$CONTROL`은 검증한 제어 checkout, `$EVIDENCE`는 저장소 밖에 새로 만든 해당 실행 전용 비공개 디렉터리다. 실제 출력에는 절대 경로 등이 담기므로 로컬에만 보관한다.

~~~sh
cd "$CONTROL"
node scripts/pr/index.mjs status --root "$CONTROL"
node scripts/pr/index.mjs migrate preview --root "$CONTROL" > "$EVIDENCE/preview.json"
~~~

4. 최초 전환은 `status.active=false`, `migration=null`, 새 task 목록이 비어 있을 때 시작한다. 기존 journal이 있으면 아래 복구 표로 간다. preview 호출의 종료 코드, `plan.commonGit`, `repository`, `origin`, `toolRevision`, `rows`, `owners`, 빈 `reasons`를 재확인한다. 로컬 자료의 보존 근거는 path/HEAD/상태, dirty 항목, 필요한 자료의 소유자 측 전후 지문을 별도로 기록한다. sourceDigest는 작업 파일의 내용 해시가 아니다.
5. **검토한 그 preview 한 건**에서 `plan` 객체만 `$EVIDENCE/plan.json`에 배타 생성하고 외부 envelope의 `planDigest`를 보관한다. 다시 preview하면 planId가 달라진다. 이후 명령에는 같은 파일·digest·도구 버전을 사용한다. 아래는 최초 전환이며, 두 확인 flag는 2번 인계 사실이 성립할 때 설정한다.

~~~sh
node -e 'const fs=require("node:fs"),p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); if(p.exitCode!==0||p.reasons.length||p.plan.reasons.length)process.exit(2); fs.writeFileSync(process.argv[2],JSON.stringify(p.plan),{flag:"wx",mode:0o600});console.log(p.planDigest)' "$EVIDENCE/preview.json" "$EVIDENCE/plan.json"
~~~

앞 단계의 출력값을 `DIGEST`에 설정하고 인계를 확인한 운영자가 다음 명령을 한 번 실행한다.

~~~sh
node scripts/pr/index.mjs migrate apply --root "$CONTROL" --plan "$EVIDENCE/plan.json" --expected-plan-digest "$DIGEST" --expected-migration-state absent --writers-quiescent --owners-confirmed
~~~

6. 성공 출력의 applied OID·installation ID와 `status`의 `active=true`, `migration.state`, `phase=applied`, `planDigest`를 맞춘다. 각 imported task의 UUID/instance/owner/branch/path/live HEAD가 매핑과 같고 `phase=working`, `purpose=null`, `merge=null`임을 확인한다. 각 task의 canonical `state.json`은 상태 OID를 사용한 `git show <oid>:state.json`으로 읽어 `release=null`과 원래 sourceState를 확인한다. 구 marker·기록, dirty 자료, 미등록 경로, 보호 ref·Git registry도 전후 대조한다. 같은 plan을 다시 apply하면 `already-active`이며 task OID·파일이 그대로여야 한다.
7. 한 항목이라도 불일치하면 새 작업 생성과 완료 호출을 보류한다. 기존 task ID와 instance가 유지된 것을 확인해 각 소유자에게 현재 state OID와 조회 방법을 인계한다. 이후 종료 시 해당 owner·instance·HEAD·state OID에 대해 사용 종료를 새로 선언한다.

| 중단 시 읽은 상태 | 조치와 재개 조건 |
| --- | --- |
| 첫 쓰기 전, source 또는 tool revision 변경 | 원인과 실제 대상을 다시 확인한다. 아직 journal이 없으면 새 preview와 새 인계를 사용한다. |
| preparing / prepared | `status.migration` 또는 실패 JSON의 migration으로 OID·digest·fence를 읽는다. 동일 control 소스·plan으로 `migrate recover`에 현재 OID를 준다. 새 marker 전까지만 `migrate abort`를 선택할 수 있다. 두 명령에도 같은 두 인계 확인이 필요하다. |
| marker 일부 게시 / applied인데 activation 미게시 | 자기 fence·task·marker의 일치 여부를 검증한 뒤 같은 plan으로 recover해 전진한다. 다른 marker, 신원 미상 fence, 손상, 부분 제거는 현 상태와 이유를 보존한다. |
| aborting / aborted / 활성화 완료 | aborting은 저장된 자기 fence 신원에 묶어 abort를 재개한다. aborted에서는 새 계획과 **현재 journal OID**로 다시 시작한다. 활성화 뒤 구 명령 복구나 소스 revert는 원장 롤백 수단이 아니다. |
| guard 소유자 불명 또는 실행 중 | `recover-guard`로 조회한다. 같은 host의 dead owner와 nonce, 자식·사용 중지 확인이 모일 때만 해당 새 guard를 회수한다. legacy fence는 이 명령의 대상 밖이다. |

### 실제 PR 인수 — TASK-PWCA-02

**A 후보는 이관 후 처음 발생하는 실제 dev 작업**이다. 당장 가장 작은 후보는 성공한 운영 이관의 결과를 기록하는 PR이다. 01이 끝난 뒤 검증된 control에서 `pr create`로 새 harness branch와 새 경로를 만들고, 이관 보고서의 실제 증거를 커밋한 뒤 기존 gh 절차로 dev PR을 연다. 실제 병합 전에 repo·PR 번호·최종 HEAD·task·instance·소유자의 병합 권한을 확정한다. 이 계획 PR, 이미 병합된 #369, 작성 시 열려 있던 타 작업 #370을 임의로 A에 대입하지 않는다. B는 같은 common Git에서 사용 중인 별도 작업이다. 소유자와 관측 구간을 정하고 B의 task OID·경로/admin·branch tip·작업 자료 지문 또는 기존 파일 보존 증거를 전후 비교한다.

1. **평소 빌드 경로를 재현한다.** A 안에서 저장소의 일반 설치와 `npm run db:generate`, `npm run check`, 해당 작업 테스트와 `npm run build`를 수행한다. 명령·결과·Git HEAD·실제 runtime을 기록한다. 빌드 산출물과 생성된 링크를 둔 상태에서 작업 프로세스를 마치고 control로 돌아와 `pr inspect --task <A> --remote --pr <N>`을 읽는다. inspect의 종료 코드가 0이어도 `local.reasons`를 읽는다.
2. `linked-path`, `unpreserved-files`, inventory 한도 등으로 파일 보존 검사에 실패하면 원인과 A/B의 상태를 남긴다. OPEN PR의 working task에서 같은 조건으로 complete를 요청하면 봉인 전에 중단되므로 기대 결과는 **PR OPEN·병합 요청 0회·폴더/branch 유지**다. 사전 검사에서 멈춘 경우 실제 complete를 실행했다고 기록하지 않는다. 사용자 목표인 **일반 빌드 직후 자동 완료는 미충족**으로 기록한다. 링크·캐시를 지워 얻은 성공이나 fixture 통과로 대체하지 않는다. 재현한 OS/도구/링크 형태를 첨부해 보존 정책 또는 빌드 산출물 개선을 별도로 검토한 뒤 같은 조건으로 다시 인수한다.
3. **qualified Mac의 정상 경로.** 인계·파일 검사가 통과한 A에 대해 green CI와 PR readiness, 소유자 사용 종료를 확인한다. control에서 아래 형식으로 `complete`를 호출한다. 검증된 Mac profile은 Darwin 25.2.0 / arm64 / Node v26.4.0 / 동일 real·effective non-root UID다. 이번 호출의 실제 관측 결과도 `lastObservation`의 capability·status·performed·coverageComplete·settled로 확인한다. 이후 단계에서 `$STATE`는 바로 직전 응답의 OID, `$REQUEST`는 새 효과의 UUID다. 응답 유실 때 동일 요청을 재생한다면 원래 ID와 인자 전체를 보존한다.

~~~sh
node scripts/pr/index.mjs complete --root "$CONTROL" --task "$TASK" --owner "$OWNER" --expected-state "$STATE" --expected-head "$HEAD_SHA" --expected-instance "$INSTANCE" --request-id "$REQUEST" --pr "$PR" --usage-ended
~~~

4. 같은 호출이 `complete`/exit 0인지, GitHub의 동일 PR·head·merge SHA와 fresh dev의 도달성, A path/admin/registry/local ref 부재, B와 보호 ref 보존을 독립 확인한다. dev의 정상 병합 전진은 허용한다. 응답 유실/중단은 `status`로 최신 OID를 얻은 후 `recover --task … --owner … --expected-state …`로 관측한다. 원격 결과가 불명확하면 재병합하지 않는다. 이미 완료된 동일 요청의 재실행은 새 효과가 없어야 한다. 실환경에서 응답 유실을 강제로 만들 필요는 없다.
5. **Windows의 실제 보류와 수동 인수.** Windows 담당자·제어 clone·승인된 실제 GitHub PR/HEAD·task를 따로 정한다. 그 common Git도 빈 원장 여부에 맞춰 명시적으로 전환한다. 자료 보존 검사가 가능한 경우 실제 Windows runtime에서 완료를 호출해 PR 병합 증명과 `cleanup-pending`/exit 2, A path/admin/ref 보존을 확인한다. 소유자가 보존 자료·공유 사용을 확인하고 해당 worktree를 외부에서 정상 제거한 사실을 보고하면 `acknowledge-removal`에 같은 task/owner/head/instance, 최신 state, 새 request-id와 `--external-removal-confirmed`를 준다. ack는 path/admin/등록의 부재를 확인하고 receipt만 저장한다. 그 직후 동일 branch ref가 여전히 H임을 확인하고 별도 `cleanup`에 최신 state와 새 ID를 준다. A ref 부재와 B 보존을 확인한다. working 또는 일부만 사라진 경로에는 ack를 사용할 수 없다.
6. 실제 결과는 [보고서 규칙](../../test-reports/README.md)에 따라 `docs/test-reports/active/pr-worktree-adopt.md`에 누적한다. 시작할 때 각 시나리오를 NOT RUN으로 두고 OS·Node/Git·task 식별자·PR URL·HEAD/merge SHA·호출 exit/phase 및 이유·정리 방식·A/B 관측 전후를 기록한다. merge한 A의 최종 결과는 살아 있는 control에서 확보해 후속 기록에 반영한다. 토큰, 사용자 파일 내용, 전체 원장 JSON은 로컬에 둔다.

## 실행 판정과 인계

| 확인할 사실 | 현재 판정 | 해제 증거 |
| --- | --- | --- |
| BLK-PWC-02 / 01 실행 | **PASS**. 운영 Mac에 세 작업을 이관하고 재호출 결과를 확인 | 보고서 T1·T2에 상태와 자료 보존 증거 기록 |
| BLK-PWC-03 / 02 실행 | Mac 수정본에서 #372의 빌드 링크 파일 검사가 통과했다. #372는 이미 병합됐고 OPEN PR의 단일 호출 인수와 Windows 실 PR·실행 환경은 대기 중이다. | Mac의 다음 실제 대상·병합 권한, Windows의 별도 대상·권한·OS 확보 |
| ADOPT 완료 | VFY-PWC-10과 VFY-PWC-12 모두 실제 증거 필요 | 운영 원장 이관, 일상 빌드 후 Mac 정상 완료, Windows 수동 인수, B 보존·중복 효과 부재가 모두 기록된 보고서 |

Windows 실 PR 인수의 전제: [#383](https://github.com/Sangeok/stagekeeper/issues/383)과 [Windows 빌드 링크 인계 제안](./pr-closeout-windows-build-links.md)이 반영된 도구와 Node v22.23.4 이상을 쓴다. 이 변경 뒤 자격 없는 호스트에서 빌드한 작업의 기대 결과는 병합 요청 1회와 `cleanup-pending`(`linked-path`)이고, 이어서 수동 제거와 `acknowledge-removal`로 닫는다. 위 2단계의 "병합 요청 0회" 기대는 이 변경 전 도구에만 해당한다.

**다음 실행자에게.** 먼저 세 작업의 인계표를 갱신한다. 확인된 범위 안에서 01을 실행하고 read-back을 남긴 뒤 02로 진행한다. 미확인 행이나 빌드 후 보존 실패가 있으면 해당 단계·실제 이유·남은 자료 위치를 보고한다. 이번 문서 작성과 검토 시점에 운영 원장 적용, 실 PR 병합, 사용자 폴더 삭제는 발생하지 않았다.

## 엔지니어링 검토 기록

검토 대상은 이 ADOPT 계획이다. 문서 2개를 수정하며 운영 코드와 서비스 변경은 0개다. 기존 CLI 및 시험과 대조해 다음 사항을 반영했다.

| 검토 영역 | 확인한 영향과 계획 반영 |
| --- | --- |
| 아키텍처 | 같은 origin을 가진 작성용 clone도 실제 로컬 원장은 다르다. 첫 단계에 common Git 실경로 대조를 넣었다. 활성화 상태는 기존 journal과 activation marker로 확인한다. |
| 코드·복구 | `migrationPreview`는 호출마다 planId를 발급한다. `migrate`는 plan 전체 digest와 도구 revision을 확인한다. 하나의 preview에서 저장한 파일·digest와 현재 journal OID를 복구까지 유지하도록 했다. |
| 시험·실패 경로 | `complete → seal → inspectFiles`가 원격 요청보다 앞선다. #369의 현재 검사에서 `linked-path`가 재현됐다. A의 빌드 후 인계 실패, 병합 후 cleanup-pending, 전체 완료를 분리했다. [기존 시험](../../../scripts/pr/cleanup.test.mjs)은 폴더 존재·branch tip·옆 작업 보존을 검증했다. 실제 GitHub 경로는 02가 확인한다. |
| 성능 | preview는 legacy record와 신원을 조사한다. 작업 파일 순회는 inspect/complete에서 일어난다. inventory 상한은 20만 항목·32 MiB, child 출력 합산 상한은 16 MiB다. 일반 빌드에서 실제로 먼저 도달한 한도와 경과 시간을 기록한다. 한도를 늘려 통과시키는 작업은 별도 설계 대상이다. |

#369만 먼저 이관하는 방안은 모든 active 행을 재검증하는 명령 계약과 맞지 않는다. 이미 병합된 #369를 정상 경로 인수에 쓰면 OPEN PR 요청과 같은 호출에서의 자동 정리를 입증할 수 없다. 운영 인계 → 전체 매핑 적용 → 새 A로 실제 인수하는 순서를 채택했다.

계획 검토 당시에는 운영 실행이 인계 대기 상태였다. 당시의 fixture 증거는 [REPLACE 보고서](../../test-reports/completed/2026-11-18-pr-worktree-replace.md)에 있다. 이후 운영 실행의 판정은 위 인계 표를 따른다.
