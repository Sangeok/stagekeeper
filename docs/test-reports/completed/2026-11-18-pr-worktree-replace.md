---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['static', 'contract', 'integration']
test-tools: ['node:test', 'Git', 'gh', 'npm run check', 'npm run build']
created-at: '2026-11-18'
completed-at: '2026-11-18'
last-executed-at: '2026-11-18T00:33:03Z'
tested-revision: 'b9364eb0b3fa0556da94652c7a686735394e3d5d'
owners: ['user:Sangeok']
related:
  - 'docs/proposals/active/pr-worktree-closeout.md'
  - 'docs/proposals/completed/2026-11-18-pr-worktree-closeout-phase-replace.md'
  - 'docs/test-reports/active/pr-worktree-qualify.md'
primary-area: 'repository/pr-closeout'
observed-environments:
  - 'local | Node CLI and Git fixtures | Darwin 25.2.0 arm64 / Node v26.4.0 / Git 2.50.1 | role:task-owner'
  - 'CI | Node CLI and Git fixtures | Windows 2022 x64 10.0.20348 / Node v22.23.4 / Git 2.56.1.windows.1 | role:fixture-owner'
  - 'CI | Node CLI and Git fixtures | macos-15 arm64 Darwin 24.6.0 / Node v22.23.4 / Git 2.56.0 | role:fixture-owner'
  - 'CI | static and product checks | Ubuntu / Node v22.23.4 / Git 2.56.1 | role:fixture-owner'
test-summary: 'pass: REPLACE 구현·회귀·퇴역 검증 — check 8개 job과 양 OS 41개 시험 통과, directory-link 예외 비활성화 및 실제 ADOPT 제외'
follow-up: ['docs/proposals/active/pr-worktree-closeout.md']
---

# PR closeout REPLACE acceptance

## Summary and Decision

REPLACE는 Node ESM 단일 pr 명령, Git-ref 상태/guard, exact-head PR merge, 조건부
cleanup, 외부 제거 receipt와 v1 migration을 구현한다. 실제 사용자 원장 이관·worktree
제거·PR 병합·main 승격은 실행하지 않았다. ADOPT의 실제 GitHub 인수를 대신하지 않는다.
최신 dev 9f16385 통합 후 로컬 check와 macOS CI가 통과했다. Windows에서 제안한 directory-link
예외의 Git 제거가 잔존 폴더를 남겼으므로 계획의 실패 분기에 따라 예외를 비활성화했다.
이 fallback은 [44205288567](https://github.com/Sangeok/stagekeeper/actions/runs/44205288567)의 양 OS를 포함한 8개 check job에서 통과했다.
최종 source b9364eb의 [44207459589](https://github.com/Sangeok/stagekeeper/actions/runs/44207459589)도 8개 job이 모두 통과해 선택한 REPLACE 범위를 PASS로 판정한다.

## Scope and Criteria

기준은 [REPLACE 계획](../../proposals/completed/2026-11-18-pr-worktree-closeout-phase-replace.md)과
[parent](../../proposals/active/pr-worktree-closeout.md)의 REQ/INV/CON/VFY다.
REQ-PWC-010은 fixture migration만 이 Phase가 소유하며 실제 전환은 ADOPT다.
QUALIFY의 Windows 미지원 결정과 운영 runtime profile은 변경하지 않았다.

## Test Target and Preconditions

- 기존 미병합 branch: harness/pr-worktree-closeout-replace-plan-20261117.
- 출발 HEAD d629aa6, 계획 작성 dev 651427c. 작업 중 최신 dev 9f16385를 확인했다.
- 실제 Git 저장소/bare origin은 native temp 경로에 테스트별 생성하고 url.insteadOf로 연결한다.
- GitHub 병합 transport는 대역이며 실제 API PUT은 0회다. 일부 사용 관측·시계도 대역이다.
- programmatic fixture의 sourceRevision port는 fixture의 실제 기준 commit을 반환한다.
  제어 소스의 실제 tracked/clean 검사는 retirement의 복사·commit한 real CLI 대조가 담당한다.
- native positive는 실제 inspectWorktreeUsage/runtime + 실제 Git remove를 사용한다.
- Git 실행 context, no-lazy-fetch, ref CAS, GC, marker/fence/guard, 자료 보존은 실제 Git/파일로 검사한다.
- v1 writer는 고정 6bb915a의 두 소스를 fixture에 추출한다. production import나 fallback은 없다.

## Test Matrix

| 연결 기준 | Gate | 시나리오와 기대 | 증거 / 판정 |
| --- | --- | --- | --- |
| VFY-PWC-01/02 | required | 생성/owner/state/instance/context/PR repo·HEAD·base·fork 거부 | lifecycle/recovery/merge, 로컬 PASS |
| VFY-PWC-03/07 | required | 최신 CI/readiness, unknown PUT 재요청 0, 외부 merge 복구 | merge, 로컬 PASS. live merge 미실행 |
| VFY-PWC-04/05 | required | qualified clear에서 A만 제거, B 보존; 자료/links/foreign-device 보존 | cleanup/preservation, 로컬 PASS |
| VFY-PWC-06 | required | 실제 invocation 중단, dead guard 회수, CAS 충돌, 상태 첫 parent, 중복 receipt | recovery/lifecycle, 로컬 PASS |
| VFY-PWC-08 | required | status/inspect 무쓰기, missing promisor object 무fetch, retire ancestry | recovery/lifecycle, 로컬 PASS |
| VFY-PWC-10 | required | dirty/closing 이관, fence, 부분 marker 복구, abort receipt, 40개 state GC pin | migration, 로컬 PASS. 실제 원장 이관 제외 |
| VFY-PWC-11 | required | 옛 source/test/aliases 제거, 단일 CLI 및 양 OS 필수 step | retirement, 로컬 PASS |
| VFY-PWC-13/14 | required | unknown/unqualified는 merged-pending, ack는 receipt만, 이후 branch-only | lifecycle/cleanup, 로컬 PASS. Windows CI PASS(b9364eb) |
| native build-cache link fallback | required | directory-link 예외의 native gate 실패 시 production linked-path 보존; canary 유지 | Windows 첫 gate FAIL 확인, 예외 비활성화 후 양 OS fallback PASS(b9364eb) |
| 기존 QUALIFY 경계 | required | runtime/probe 분리 유지, 미지원 자격 우회 없음 | runtime/probe 및 OS별 기존 필수 시험 PASS. profile 변경 없음 |

## Commands and Static Checks

| 명령 / 환경 | Gate | 현재 결과 |
| --- | --- | --- |
| 새 focused 7개 test 파일 | required | Windows/macOS 각각 41/41 PASS, skip 0. 순서별 4·7·5·10·7·6·2건 |
| STAGEKEEPER_CLOSEOUT_NATIVE_REQUIRED=1 node --test --test-name-pattern='native runtime removes' scripts/pr/cleanup.test.mjs | required | b9364eb에서 1/1 PASS, 실제 qualified profile, complete. fixture 포함 약 6.22초 |
| npm run verify:fsd / verify:server / verify:shared | required | PASS |
| npm run verify:ci-coverage / docs:check | required | PASS, CI 14 jobs / 16 rows; docs 237개·상대 링크 1,263개·report 62개 |
| npm run test:architecture -- --test-concurrency=1 | required | 392 중 389 PASS, 3 환경 조건 skip. 병렬 부하의 기존 eval 시험 실패와 단독 대조는 Findings에 구분 |
| npm run check | required | 로컬 e50fbd7: 503 중 499 PASS·4 skip. 최종 b9364eb Ubuntu CI: 503 중 488 PASS·15 플랫폼 조건 skip |
| npm run build | required | 로컬 PASS, 최종 CI build와 fresh manifest check PASS. 로컬 첫 실행은 Next advisory nudge로 중단 후 동일 명령 재실행 성공, 의존성 변경 없음 |
| check workflow | required | 최종 source [44207459589](https://github.com/Sangeok/stagekeeper/actions/runs/44207459589)의 8개 job 모두 PASS |
| git diff --check | required | PASS |

## Evidence Registry

- 운영 mjs 10개를 파일명 사전순으로 name + NUL + bytes 연결한 SHA-256:
  7b2cfcb8865185c3f58bafd77f257bf919bf92161ec89ec41cf090790b30b8d6.
  source 파일 목록은 scripts/pr의 *.mjs에서 *.test.mjs를 제외한다.
- native positive: Darwin 25.2.0 / arm64 / Node v26.4.0, 실제 runtime이 qualified/clear를
  반환한 뒤 complete, target path/ref 부재와 sibling 파일/ref 보존 assertion. 최종 b9364eb에서
  required positive 1/1 PASS(약 6.22초)를 확인했다. 시간은 fixture 전체이며 성능 benchmark가 아니다.
- 병렬 부하 중 native 관측이 불완전해 unqualified/pending이 된 실행도 있었다.
  삭제 0회라는 계약에 맞는다. 일반 suite는 보존을 검사하며 별도 required positive gate는
  complete를 반드시 요구한다. unknown을 통과한 clear로 계산하지 않는다.
- 실제 gh read-only 조회에서 기존 PR #366의 required check 목록이 비어 있음을 확인했다.
  CLI의 no-required exit 1을 성공으로 추측하지 않고 GraphQL isRequired/pageInfo/HEAD를 검증한다.
  [GitHub CheckRun 계약](https://docs.github.com/en/graphql/reference/checks)을 사용하며 서버 보호를 재구현하지 않는다.
- 최종 [Windows job](https://github.com/Sangeok/stagekeeper/actions/runs/44207459589/job/134476976204),
  [macOS job](https://github.com/Sangeok/stagekeeper/actions/runs/44207459589/job/134476975768),
  [static job](https://github.com/Sangeok/stagekeeper/actions/runs/44207459589/job/134476976294)의 로그와 최종 job/step 상태를 read-back했다.
- Windows native runtime은 unqualified/pending을 유지하고, 실제 수동 Git 제거 뒤 ack는 ref를 유지하며 다음 cleanup만 branch를 제거했다.
  내부 junction 실험은 exit 0인데 targetRemains=true를 다시 재현했다. productionExceptionEnabled=false이며 외부·sibling canary는 유지됐다.
- 원본 로컬 로그는 임시 파일이다. 장기 증거는 본문의 정제 결과와 CI 링크로 남긴다.
  token/env/raw command stderr/외부 process command line은 보고서에 포함하지 않는다.

## Findings and Follow-up

| 발견 | 조치 / 검증 |
| --- | --- |
| readiness 조회 중 source 변경 뒤 PUT 가능 | intent 직전 common guard 안에서 HEAD/파일 재검사. 실패 재현 후 회귀 PASS |
| migration fixture가 UUID 정렬과 생성 순서를 혼동 | 실제 게시 순서의 두 번째 marker에 I/O 실패를 주입하도록 수정. 사용자 자료 처리 정책 변경 없음 |
| required checks 없음의 CLI exit 1 | GraphQL required 여부를 직접 조회. malformed/pagination/pending 음성 대조 및 실제 GET/query 확인 |
| 이관 실패 JSON에 canonical journal OID 누락 | status와 실패 결과에 migration state/phase/digest/fence를 노출해 별도 raw ref 조회 없이 재개 가능. 실제 부분 게시 fixture에서 OID/read-only status assertion PASS |
| 상태 JSON의 PR·retire 목적 및 관측 시점 구분 | PR/purpose/현재 ref HEAD와 lastObservation을 출력하고 observationPerformed는 이번 호출만 반영. branch-only/ack는 과거 관측이 있어도 false, 미지원 이유는 unqualified-profile |
| ack 같은 request replay 때 state 재작성 | 부재/보존/head를 재검증한 뒤 원래 receipt OID 그대로 반환. replay assertion PASS |
| Windows Git directory junction 제거 뒤 target 잔존 | [44204131088 Windows job](https://github.com/Sangeok/stagekeeper/actions/runs/44204131088/job/134465600440)의 실제 실패. 내부 directory-link 예외를 전 OS에서 비활성화하고 linked-path 보존. 후속 44205288567의 양 OS gate PASS. force/unlink fallback 없음 |
| 로컬 병렬 architecture에서 기존 150ms eval fixture의 출력 누락 | 해당 테스트의 source 변경 없음. 단독 4/4 PASS를 확인했고 전체 suite 직렬 실행 392건 중 389 PASS·3 환경별 skip으로 확인 |
| native 부하에서 unknown | 삭제를 보류하는 기존 계약 유지. 별도 positive gate로 실제 자동 제거 성공 확인 |

## Test Data and Cleanup

테스트가 생성한 temp Git 저장소, marker/fence/ref 및 자기 child만 정리한다.
강제 종료 fixture는 직접 생성한 Node child 하나만 종료하고 close를 확인한다.
실제 사용자 common Git의 새 activation/task/migration refs는 만들지 않았다.
기존 worktree와 v1 원장은 유지한다. 실제 CLI status는 active=false, activation-required, migration=null이다.
사용자 지침에 따라 전환 전 retained control에서 이 task branch만 대상으로 legacy cleanup apply를 실행했다.
결과는 worktree-in-use, deleted=0이었다. 새 도구의 fallback이 아니며 새 closeout 상태는 쓰지 않았다.
이 작업 worktree는 PR 미병합·후속 리뷰 때문에 보존한다.

## Conclusion

선택한 REPLACE의 모든 required gate가 PASS이므로 결과는 pass다. 앞선 Windows link 예외의
실패는 역사적 실패로 유지하며, 현재 source는 계획에 정해진 linked-path 보존 fallback을 제공한다.
Windows 자동 사용 관측은 미지원이고 generated directory link가 남은 build 작업은 인계/정리가
보류될 수 있다. 이 제한을 force/unlink 또는 unknown 우회로 해소하지 않았다.

[PR #369](https://github.com/Sangeok/stagekeeper/pull/369)은 dev 대상으로 열려 있고 병합하지 않았다.
REPLACE 다음 단계는 승인된 dev 병합 이후 ADOPT의 실제 원장 전환·실제 GitHub 인수다.
현재 source 검증 통과가 사용자 자료 이관이나 삭제의 승인·완료를 뜻하지 않는다.

## Review Checklist

- [x] 대역/실제 Git/native/live API 범위를 구분했다.
- [x] 첫 실패와 수정 후 결과, unknown 보존을 별도 기록했다.
- [x] 실제 사용자 자료와 fixture 정리 범위를 구분했다.
- [x] 최종 source revision, 최신 dev 및 Windows/macOS CI 결과를 확정했다.
- [x] docs:check와 최종 diff 검토를 완료했다.
