---
status: 'active'
stage: 'running'
result: null
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['integration', 'end-to-end']
test-tools: ['Git', 'gh', 'Node.js', 'npm run pr', 'npm run check', 'npm test', 'npm run build']
created-at: '2026-11-18'
completed-at: null
last-executed-at: '2026-11-18T03:10:05Z'
tested-revision: 'ff36724d7e6cf0439901b36833fd2043bcc7a9e8'
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

운영 Mac의 기존 작업 세 건을 새 관리기로 이관했다. 같은 plan을 다시 적용한 결과와 작업 파일의 전후 상태를 확인했다. 이번 보고서를 첫 신규 작업 A로 등록해, 일반 빌드가 끝난 직후 자동 정리 조건을 충족하는지 살펴본다.

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
| T3 | R2 | required | 실제 Mac 빌드 후 한 호출에서 병합과 자동 정리 | NOT RUN |
| T4 | R2 | required | A 작업 전후 B 보존 대조(E3) | NOT RUN |
| T5 | R3 | required | 실제 Windows PR 및 외부 제거 인수 | NOT RUN |

## Commands and Static Checks

- 제어 checkout에서 `pr status`, `migrate preview`, `migrate apply`, 적용 후 `status`와 같은 plan 재호출을 실행했다(T1, T2).
- 활성화된 관리기에서 `npm run pr -- create`로 A를 최신 dev 기준으로 생성했다. 생성 직후 `phase=working`, state OID `65194cae`였다.
- A에서 일반 설치·Prisma 생성·검사·제품 테스트·빌드를 실행하고, 파일 보존 조건을 제어 checkout의 `pr inspect`로 확인한다(T3).

## Evidence Registry

- **E1.** 실제 원장 12행 중 active 3행을 가져왔고 removed 9행은 이력으로 보존했다. 적용 결과는 `active=true`, `phase=applied`, 이관 OID `8f447b98`였다. 같은 plan의 두 번째 응답은 `already-active`였다.
- **E2.** 이관 및 재호출 전후의 task별 경로·HEAD·instance·Git 인덱스·파일 metadata, Git worktree 등록 목록과 로컬 branch refs, 기존 원장·marker를 대조했다. 세 작업 모두 `working`이며 종료 인계는 비어 있었다. `ci-verification`의 미커밋 문서 2개의 내용 SHA-256도 일치했다.
- **E3.** A 생성 전 B의 task OID는 `5e6dff9d`, HEAD는 `5f2d527`이었다. B의 작업 트리 metadata 39,286개 항목과 Git 인덱스 지문, 경로와 admin의 신원을 기록했다. 로컬 절대 경로와 원장 원문은 비공개 실행 기록에 보관한다.

## Findings and Follow-up

첫 Mac 작업에서 `inspect`가 반환하는 `local.reasons`와 GitHub PR 상태를 함께 기록한다. 파일 검사에서 멈추면 산출물을 보존하고 일반 빌드 경로를 미충족으로 판정한다.

## Test Data and Cleanup

이관한 세 작업의 폴더와 branch는 제자리에 있다. A는 진행 중인 실제 작업이다. Mac·Windows에서 실제 제거가 확인된 대상만 제거로 기록한다.

## Conclusion

VFY-PWC-10의 운영 Mac 이관은 통과했다. VFY-PWC-12의 Mac·Windows 실 PR 결과는 수집 대상이다.
