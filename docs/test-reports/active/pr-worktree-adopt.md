---
status: 'active'
stage: 'blocked'
result: null
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['integration', 'end-to-end']
test-tools: ['Git', 'gh', 'Node.js', 'npm run pr', 'npm run check', 'npm test', 'npm run build']
created-at: '2026-11-18'
completed-at: null
last-executed-at: '2026-11-18T03:16:59Z'
tested-revision: 'e2c6f4155bca6460f208832f5a88c9572572bfe4'
owners: ['user:Sangeok']
related:
  - 'docs/proposals/active/pr-worktree-closeout-phase-adopt.md'
  - 'docs/proposals/active/pr-worktree-closeout.md'
  - 'docs/test-reports/completed/2026-11-18-pr-worktree-replace.md'
primary-area: 'repository/pr-closeout'
observed-environments:
  - 'local | Stagekeeper Git worktrees | Darwin 25.2.0 arm64 / Node v26.4.0 / Git 2.50.1 | role:task-owner'
test-summary: null
follow-up: ['docs/proposals/active/pr-worktree-closeout-phase-adopt.md']
---

# PR worktree 관리기 운영 이관 및 첫 PR 인수

## Summary and Decision

운영 Mac의 기존 작업 세 건을 새 관리기로 이관했다. 같은 plan을 다시 적용한 결과와 작업 파일의 전후 상태를 확인했다. 이 보고서로 만든 첫 실 작업에서는 빌드 전 통과했던 파일 검사가 빌드 후 `linked-path`를 반환했다. Mac에서 일반 빌드 직후 한 호출로 병합·정리하는 인수 기준은 미충족이다. [PR #372](https://github.com/Sangeok/stagekeeper/pull/372)

## Scope and Criteria

| 기준 | 합격 조건 |
| --- | --- |
| R1 · VFY-PWC-10 | 활성 세 작업의 신원·경로·HEAD·자료를 보존하며 working으로 이관하고, 같은 plan을 재실행해도 상태가 유지된다. |
| R2 · VFY-PWC-12, Mac | 작업 A에서 빌드 산출물을 유지한 채 승인된 PR을 완료한다. 한 호출에서 dev 병합과 A의 worktree·branch 부재를 확인하고, 기존 작업 B가 보존된다. |
| R3 · VFY-PWC-12, Windows | 실제 PR 병합 후 보류된 작업을 사용자가 외부에서 제거한다. 인수 호출이 receipt를 기록하고, 후속 cleanup이 branch만 정리한다. |

기준은 [ADOPT 상세 계획](../../proposals/active/pr-worktree-closeout-phase-adopt.md)과 [상위 SDD](../../proposals/active/pr-worktree-closeout.md)를 따른다.

## Test Target

| 대상 | 작업 식별자 | 확인할 자료 |
| --- | --- | --- |
| A · 이 보고서 | task `d8839b74`, instance `419221e1` | `harness/pr-worktree-adopt-report-20261118`의 HEAD, PR, phase와 실제 폴더·branch |
| B · #369 | task `818c972a`, instance `251ed73c` | task OID·branch tip·경로·admin·index와 작업 파일 metadata 지문 |
| 다른 이관 작업 | `ci-verification` 및 #364 | 이관 시 원본 자료, 미추적 문서 2개 |

## Preconditions and Test Data

[#371](https://github.com/Sangeok/stagekeeper/pull/371)을 포함한 검증된 dev의 제어 checkout에서 실행했다. 이관 직전 구 관리기 프로세스와 점검한 예약 설정에서 직접 호출이 발견되지 않았고, 운영자가 세 작업을 보존해 전환하도록 요청했다. A의 제어 명령은 A와 B 밖에서 실행한다. 보고서와 검증 로그의 원본은 worktree 밖에서 보관한다.

## Test Matrix

| ID | 기준 | Gate | 실행과 판정 근거 | 결과 |
| --- | --- | --- | --- | --- |
| T1 | R1 | required | 실제 이관 및 동일 plan 재실행(E1) | PASS |
| T2 | R1 | required | 작업 신원 및 이관 전후 자료 대조(E2) | PASS |
| T3a | R2 | required | 일반 빌드 직후 파일 보존 전제 충족 여부. 동일 HEAD에서 빌드 전후 결과가 달라졌다(E4). | FAIL |
| T3b | R2 | required | 실제 Mac 병합·자동 정리. 사전 검사에서 보류돼 `complete`를 호출하기 전 중단했다(E5). | BLOCKED |
| T4 | R2 | required | A 생성 전과 PR 검사 시점의 B 보존 대조(E3) | PASS |
| T5 | R3 | required | 실제 Windows PR 및 외부 제거 인수 | NOT RUN |

## Commands and Static Checks

- 제어 checkout에서 `pr status`, `migrate preview`, `migrate apply`, 적용 후 `status`와 같은 plan 재호출을 실행했다(T1, T2).
- 활성화된 관리기에서 `npm run pr -- create`로 A를 최신 dev 기준으로 생성했다. 생성 직후 `phase=working`, state OID `65194cae`였다.
- A에서 `npm ci`, `npm run db:generate`, `npm run check`, `npm test`가 통과했다. `check`의 스크립트 테스트는 499 통과·4 제외, 제품 테스트는 613 통과·42 제외였다(T3a).
- `npm run build` 첫 실행은 Next.js의 보안 권고 출력 후 exit 1로 끝났다. 의존성과 파일 정리 정책을 바꾸지 않고 같은 명령을 재실행했고 production 빌드가 exit 0으로 끝났다. `.next`와 `node_modules`를 유지했다(T3a).
- control에서 `pr inspect --task <A>`를 빌드 전·후에, PR 생성 뒤에는 `pr inspect --task <A> --remote --pr 372`를 실행했다(T3a, T3b).

## Evidence Registry

- **E1.** 실제 원장 12행 중 active 3행을 가져왔고 removed 9행은 이력으로 보존했다. 적용 결과는 `active=true`, `phase=applied`, 이관 OID `8f447b98`였다. 같은 plan의 두 번째 응답은 `already-active`였다.
- **E2.** 이관 및 재호출 전후의 task별 경로·HEAD·instance·Git 인덱스·파일 metadata, Git worktree 등록 목록과 로컬 branch refs, 기존 원장·marker를 대조했다. 세 작업 모두 `working`이며 종료 인계는 비어 있었다. `ci-verification`의 미커밋 문서 2개의 내용 SHA-256도 일치했다.
- **E3.** A 생성 전 B의 task OID는 `5e6dff9d`, HEAD는 `5f2d527`이었다. B의 작업 트리 metadata 39,286개 항목과 Git 인덱스 지문, 경로와 admin의 신원을 기록했다. PR을 연결한 검사 직후 B의 모든 비교값이 생성 전과 일치했다.
- **E4.** `e2c6f41`에서 빌드 전 `local.reasons=[]`와 파일 지문을 받았다. 같은 HEAD의 빌드 후에는 `local.reasons=["linked-path"]`였다. `.next/node_modules/pg-587764f78a6c7a9c`와 `.next/node_modules/@prisma/client-2c3a283f134fdcb6`가 각각 동일 worktree의 `node_modules/pg`와 `node_modules/@prisma/client` 디렉터리를 가리켰다.
- **E5.** 원격 검사에서 #372는 `OPEN`, base `dev`, head `e2c6f41`로 연결됐다. 검사 명령은 exit 0이었지만 `local.reasons`에 `linked-path`가 있었고 A는 `working`, state OID `65194cae`, path/admin/ref 존재 상태였다. `observationPerformed=false`, 봉인·병합·제거 receipt는 없었다. GitHub의 `mergeCommit`은 null이었다. 이 증거는 읽기 전용 검사 시점에 해당한다.

## Findings and Follow-up

현재 [파일 보존 검사](../../../scripts/pr/git-workspace.mjs)는 내부 디렉터리 링크도 차단한다. A의 실 PR에서 빌드 후 이 조건을 재현했다. 재검증하려면 빌드 산출물이나 플랫폼별 링크 처리 정책을 검토한 뒤, A와 같은 일반 설치·빌드 조건으로 다시 실행해야 한다. 자동 제거 정책의 근거가 된 Windows의 잔존 폴더 사례는 [REPLACE 검증 보고서](../completed/2026-11-18-pr-worktree-replace.md)에 있다.

## Test Data and Cleanup

최초 검사 당시 이관한 세 작업의 폴더와 branch, A의 빌드 링크·폴더·로컬·원격 branch를 보존했다. 개인 경로가 있는 원장과 원본 실행 기록은 로컬에 보관했다.

## Conclusion

VFY-PWC-10은 운영 Mac에서 통과했다. VFY-PWC-12에서는 빌드 후 파일 검사(T3a)가 실패해 Mac 병합·제거(T3b)를 실행하지 않았다. Windows 실 PR 인수(T5)는 아직 실행 전이다.

## Mac 링크 정책 변경 후 재검사

[#372](https://github.com/Sangeok/stagekeeper/pull/372)는 최초 검사 후 dev에 병합됐다(merge `ad12cb7`). 로컬에는 최초 작업의 두 빌드 링크와 HEAD `0b45840`이 남아 있었다. 도구 수정본 `27a0762`에서 동일한 운영 작업에 `inspect --remote --pr 372`를 실행했다. 이 경로에서는 GitHub 상태를 실제로 조회하며 파일 제거는 수행하지 않는다.

| 재검사 | 관측 결과 | 판정 |
| --- | --- | --- |
| T3a의 파일 보존 전제 | dev의 기존 도구는 `linked-path`, 수정본은 빈 `local.reasons`와 파일 지문을 반환했다. PR은 MERGED이고 두 검사에서 task OID `65194cae`, phase `working`이 유지됐다. | PASS (수정본) |
| 수정본의 `complete` 통합 시험 | 같은 Darwin 25.2.0 arm64, Node v26.4.0, Apple Git-155에서 실제 사용 관측·Git·파일시스템과 GitHub 대역으로 시험했다. 정상 두 링크가 있는 A만 완료됐다. B로 향하는 링크는 PUT 0회였고, 병합 후 최종 검사에서 B로 바뀐 링크는 merge receipt를 보존한 `cleanup-pending`이었다. | PASS (격리 시험) |
| T3b의 실제 단일 호출 병합·정리 | #372의 병합은 이미 별도로 발생했다. 승인된 다음 OPEN PR에서 일반 빌드 후 전체 경로를 확인한다. | NOT RUN |

이 재검사에서 #372의 운영 worktree는 보존했다. 이후 #372의 이미 확인된 병합을 인수해 로컬을 정리하는 결과는 새 OPEN PR을 처리하는 T3b와 구분해 기록한다.
