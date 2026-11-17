---
status: "active"
stage: "awaiting-rerun"
result: null
report-kind: "exploratory"
report-size: "standard"
test-levels: ["static", "component", "integration"]
test-tools: ["node:test", "Git", "lsof", "PowerShell Core"]
created-at: "2026-11-17"
completed-at: null
last-executed-at: "2026-11-17T13:27:22Z"
tested-revision: "ae0a6af4ee80b0b55ec37a86dc64d7569583e16f"
owners: []
related:
  - "docs/proposals/active/pr-worktree-closeout-phase-qualify.md"
  - "docs/proposals/active/pr-worktree-closeout.md"
primary-area: "tooling/pr-worktree-qualify"
observed-environments: ["macOS arm64 / Darwin 25.2.0 / Node 26.4.0", "GitHub macos-15 / Node 22.23.4", "GitHub windows-2022 x64 / Node 22.23.4"]
test-summary: "조건부 QUALIFY 구현 검증 PASS: 등록한 로컬 macOS profile, Windows 미지원/반례, CI 44091585161 전체 성공. 원래 Windows 자동 자격 FAIL 유지"
follow-up: ["QUALIFY 결과를 반영한 REPLACE 상세 계획", "새 profile 승격은 별도 실제 검증", "Windows 자동 정리 미지원 유지"]
---

# PR worktree 사용 관측 QUALIFY 실행

## Final Conditional Verification

검증 코드 ae0a6af4ee80b0b55ec37a86dc64d7569583e16f의
[CI 44091585161](https://github.com/Sangeok/stagekeeper/actions/runs/44091585161)는
Windows/macOS를 포함한 8개 job 모두 PASS다.
[CI 증거](../assets/2026-11-17-pr-worktree-qualify/conditional-ci-final.json)와
[최종 runtime 대조](../assets/2026-11-17-pr-worktree-qualify/conditional-runtime-final.json)를 보존한다.

| 현재 승인된 계약의 gate | 필수 여부 | 결과 |
| --- | --- | --- |
| runtime 입력·미지원·caller 우회 거부·일반 권한 제한 | required | PASS |
| 등록 local Mac의 native N 사례와 runtime busy 대조 | required | PASS |
| Windows 실제 무관측 runtime 및 cwd 누락 반례 | required | PASS |
| 최종 코드 전체 CI | required | PASS, 8 jobs |
| local check·architecture·경계·lint·docs | required | PASS, 실행 source와 counts는 아래 기록 |
| local build | required | 첫 실행 Next 안내로 중단, 동일 명령 재실행 PASS. dependency 변경 없음 |
| 원래 Windows clear/busy 자동 자격 | informational: 원래 계약의 실패 증거 | FAIL/미지원 유지 |
| 다른 OS/build/Node 조합 및 실제 삭제 controller | 현재 범위 밖 | 미인증/미실행 |

CI Mac은 Darwin 24.6.0/arm64/Node v22.23.5이며 native 후보 17 PASS다.
R01 runtime profile 대조는 이 host에서 미등록으로 skip이다. 이를 등록 runtime의
native 성공으로 세지 않는다. R01은 정확한 등록 host에서 최종 source로 별도 PASS다.
새 root 권한 거부 사례를 포함한 local runtime unit 5건도 PASS다.

이 보고서는 이후 profile qualification 재실행을 위해 active로 유지한다.
이번 조건부 계약의 gate와 아래 원래 양 OS 자동 목표의 FAIL 이력은 별개다.
운영 삭제·PR 병합·기존 관리기 퇴역은 수행하지 않았다.

## Current Conditional Implementation

조건부 방향 채택 후 runtime과 실제 probe를 분리했다. inspectWorktreeUsage는
검증한 Darwin 25.2.0/arm64/Node v26.4.0 profile에만 실제 관측을 위임한다.
그 외 조합과 Windows는 관측 미실행/unknown/unqualified다. caller의 mode/profile/
allowUnknown이나 시험 환경 변수로 runtime 자격을 올릴 수 없다. 운영 삭제 연결은 없다.

macOS 증거 공백을 보완한 native 17건은 7a6b804에서 PASS다. 등록 profile의 runtime
대조까지 포함한 집중 실행은 36 PASS / 1 SKIP / 0 FAIL이다. SKIP은 다른 OS 전용
common 사례다. Windows required gate는 runtime 무관측 계약과 실제 directory
반례를 검증하며 기존 자동 정리 자격 실패를 해결한 것으로 취급하지 않는다.

[Native 마감](../assets/2026-11-17-pr-worktree-qualify/conditional-macos-final.json),
[runtime 대조](../assets/2026-11-17-pr-worktree-qualify/conditional-runtime-local.json),
[초기 fixture 실패](../assets/2026-11-17-pr-worktree-qualify/conditional-macos-first.json)를 보존한다.
초기 실패는 ps sess 값이 0으로 가려진 점과 빈 directory에 rm을 사용한 시험
오류였다. session leader stat/pgid 대조와 rmdir로 수정했다. 첫 실패는 정확한
source snapshot이 없어 base/collection revision과 한계를 구분했다.

| 영역 | 실제 보완 증거 | 한계 |
| --- | --- | --- |
| N08 | detached holder의 PID=PGID, ps stat의 session leader | 같은 UID/host |
| N09/N19 | 허용 control과 동일한 임시 sandbox 정책 아래 lsof 거부, unknown/coverage false | 해당 observer 경계이며 모든 권한 조합 아님 |
| N10/N11 | 실제 Node observer를 spawn 경계에서 대체, ready 후 cancel/timeout/output-limit, child 종료와 worker 생존 | 실제 lsof 정지나 Windows compiler 후손 증거와 구분 |
| N13 | 기존 holder 종료, 실제 population 변경, start drift 대역 | 동일 초 PID 재사용의 원자적 방지 미인증 |
| N14 | backslash/newline/한글/공백, ancestor link와 case alias, caret unknown | Windows 8.3 자동 관측 미지원 |
| N15 | 실제 native 관측 시작 경계에서 target 교체, unknown과 retained canary 보존 | 외부 writer 전체 차단 아님 |
| N18 | import 효과 guard, 병렬/후속 관측, sentinel/.git/admin index/HEAD/gitdir bytes·inode·mtime 및 등록/ref 불변 | 사용자 설정 전체의 외부 변경을 감시하는 시험 아님 |

7a6b804 로컬 검증: check 585 PASS / 4 SKIP, architecture 476 PASS / 4 SKIP,
FSD/server/shared/CI coverage 및 ESLint PASS. profile 등록 후 집중 검증은 위와 같다.
CI [44089522611](https://github.com/Sangeok/stagekeeper/actions/runs/44089522611)의
Windows runtime/probe 경계와 directory 반례 step은 PASS이며 macOS runner는
이 기록 시점 배정 대기였다. 전체 job이나 최종 revision의 CI 완료로 확대하지 않는다.

아래 FAIL/BLOCKED는 원래 양 OS 자동 자격 목표의 기록이다. Windows 자동 자격은
계속 FAIL/미지원이며 새 조건부 runtime 계약의 판정과 구분한다.

## Original Summary and Decision

공통 Node ESM 관측 모듈과 macOS lsof/ps 후보, Windows PowerShell Core/C# 후보를 구현했다. 운영 정리기에 연결하지 않았으며 worktree·branch 삭제와 PR 병합은 하지 않는다. Windows 실제 실행에서 같은 계정의 process 1건에 대한 cwd 조회가 권한 거부로 실패했다. 필수 정상 대조군을 만족하지 못했으므로 QUALIFY는 미통과이며 REPLACE는 보류한다.

## Scope and Criteria

상위 REQ-PWC-014 / TASK-PWCQ-01 / VFY-PWC-09를 기준으로 한다. 관측은 현재 계정의 모든 세션에 있는 non-zombie process cwd로 제한한다. 다른 계정·특권·remote host·cwd 밖의 파일 사용을 인증하지 않는다. 이것은 삭제 허가가 아니다.

## Test Target

기준 commit 대비 새 scripts/pr 모듈·시험·CI step·coverage 설명이 추가된 working tree다. .sh/Bash와 OpenClaw runtime을 사용하지 않는다. Windows는 설치된 PowerShell Core 7과 Server 2022 x64/build 20348만 후보이며 자동 설치·권한 상승이 없다.

## Test Matrix

| 구분 | required | 현재 결과 |
| --- | --- | --- |
| protocol·입력·실패 경계 | yes | 로컬 통과 |
| macOS native clear/busy·부모/sibling·독립 process group | yes | 최신 실행 통과 |
| population 변경의 unknown 보존 | yes | 실제 변경을 관측했고 fresh snapshot 횟수 기록 |
| Windows native | yes | FAIL — 필수 clear/busy 대조군 7건 모두 unknown, missingCount=1 |
| 권한·profile 한계와 구현 범위 | yes | BLOCKED — 현재 PEB 후보를 운영에 채택할 근거 부족 |

## Commands

- STAGEKEEPER_USAGE_NATIVE_REQUIRED=1 node --test scripts/pr/process-usage.test.mjs: 최신 21 PASS, 1 SKIP, 0 FAIL. SKIP은 unsupported OS 전용 common 사례이며 macOS native 사례는 실행했다.
- npx eslint scripts/pr/*.mjs scripts/pr/testing/*.mjs: PASS.
- npm run verify:fsd, npm run verify:server: PASS.
- npm run verify:shared: 처음에는 generated Prisma client 부재로 실패. 생성 후 npm run check의 동일 검사 통과.
- npm run check: 로컬 PASS, 581 PASS / 4 SKIP.
- npm run test:architecture: 로컬 PASS, 472 PASS / 4 SKIP.
- npm run build: 첫 실행은 Next.js 안내로 중단, 같은 명령의 재실행 PASS. 의존성 upgrade는 하지 않음.
- npm run verify:ci-coverage: PASS, 13 jobs / 15 rows.

## Evidence Registry

[macOS 관측 기록](../assets/2026-11-17-pr-worktree-qualify/macos-observations.json)은 실패한 첫 확장 실행과 수정 후 실행을 함께 보존한다. source hash는 기록을 모은 시점의 구현이다. 실행별 code 변화는 Findings에 구분한다. process 이름·명령·env·관계없는 cwd는 기록하지 않는다.

## Findings

- 첫 확장 실행의 실패 3건은 외부 population 변경을 unknown으로 보존한 결과였다. 정상 대조를 얻을 수 없는 가용성 문제가 있었다.
- 관측 budget을 유지한 채 fresh snapshot을 수집하며 population이 안정됐는지 재확인하도록 수정했다. 바뀐 population을 무시하거나 불완전한 결과를 clear로 만들지 않는다.
- macOS cwd는 libproc의 vnode 경로를 사용한다. 삭제된 무관한 cwd pathname을 다시 stat하지 않으며 대상 identity는 관측 전후 대조한다.
- Windows 첫 실행은 missingCount=1을 관측했다. 단계 진단을 추가한 두 번째 실행에서 cwd-open-5(Access denied) 1건으로 좁혔다.
- PROCESS_QUERY_INFORMATION 대신 PROCESS_QUERY_LIMITED_INFORMATION과 VM_READ의 최소 조합으로 바꾼 세 번째 실행도 동일했다. 해당 process를 무시하거나 SeDebugPrivilege를 활성화하지 않았다.
- 첫 Windows 실행에서 실패한 fixture의 holder 종료 전에 directory를 정리하여 EBUSY가 발생한 시험 문제는 자기 holder를 먼저 종료하도록 수정했다. 후속 실행에서는 EBUSY 없이 원래 coverage 실패가 보고됐다.
- 최신 check/static 실패는 변경하지 않은 scripts/rehearsals/codex-init-eval.test.mjs:41의 150ms timeout 사례에서 synthetic stdout/stderr가 비어 있던 것이다. 초기 CI와 로컬 check는 통과했다. 타이밍 영향은 추론이며 baseline 재현을 완료한 것으로 표시하지 않는다. 해당 파일은 이번 범위에서 수정하지 않았다.

## Conclusion

필수 Windows 대조군 FAIL이 있으므로 현재 시험의 전체 판정은 fail이다. 실행은 후속 후보 수정/재검증을 기다리므로 active/awaiting-rerun으로 유지한다. 계획의 Windows 사용 확인 blocker는 해소되지 않았고, Phase 실행은 보류다.

Q3의 대안 두 가지까지 실제로 검증했으나 clear 근거로 채택하지 못했다. 다음 작업은 상위 사용 종료 계약과 자동 정리 범위의 설계 결정이다. 현재 계약을 유지한다면 BLK-PWC-01을 유지하고, 추가 후보는 cwd 누락을 배제할 근거부터 제시해야 한다. 새로운 권한 상승이나 실패 process 제외로 gate를 통과시키지 않는다. 양 OS의 모든 필수 사례를 충족한 뒤에만 REPLACE 상세 구현으로 진행한다.

## CI Evidence

| Run / source commit | macOS native | Windows native | 기타 |
| --- | --- | --- | --- |
| [44049597103](https://github.com/Sangeok/stagekeeper/actions/runs/44049597103) / 0cd239a | PASS | FAIL, coverage 누락 1건 | 나머지 job PASS |
| [44051768584](https://github.com/Sangeok/stagekeeper/actions/runs/44051768584) / 32daabc | native step PASS | FAIL, cwd-open-5 | 진단 및 fixture 정리 수정 확인 |
| [44052440547](https://github.com/Sangeok/stagekeeper/actions/runs/44052440547) / 285de22 | PASS | FAIL, 최소 권한에도 cwd-open-5 | build/test/web/server/integration PASS, static 기존 timeout 사례 FAIL |

[macOS CI](../assets/2026-11-17-pr-worktree-qualify/macos-ci.json), [Windows 최초](../assets/2026-11-17-pr-worktree-qualify/windows-first.json), [Windows 진단](../assets/2026-11-17-pr-worktree-qualify/windows-diagnostic.json), [최소 권한 재검증](../assets/2026-11-17-pr-worktree-qualify/windows-minimal-rights.json)을 보존한다. 각 파일의 commit·run/job ID를 기준으로 결과를 해석한다.

## Q3 follow-up: directory 기반 대안의 실제 결과

사용자의 “다음 단계 진행”에 따라 기존 PEB 후보와 별개인 두 Windows 대안을
시험했다. production `inspectWorktreeUsage`와 원래 native gate는 그대로 유지했다.
아래 4개 탐색 시험의 통과는 반례 재현 성공이며 Windows QUALIFY 통과가 아니다.

| 후보 | 실제 관측 | 결정 |
| --- | --- | --- |
| DELETE access로 directory를 열어 sharing violation 확인 | 일반 cwd는 감지했으나 `chdir`를 EBUSY로 막았다. 동시에 시작된 새 process는 해당 cwd를 유지하며 검사에서는 누락됨 | clear 근거에서 탈락. 운영 관측에 연결하지 않음 |
| `NtQueryInformationFile` class 47로 directory handle의 PID 확인 | 일반 cwd와 일반 directory handle을 모두 반환. 실제 cwd process가 살아 있어도 성공 코드와 PID 0건을 반환하는 반례 확인 | clear 근거에서 탈락. system-use 예약 ABI라는 별도 한계도 유지 |
| root directory 한 번만 조회 | 하위 directory cwd는 두 후보 모두 놓침 | root 한 번의 검사 불충분. 재귀 탐색만으로 아래 cwd 누락 반례까지 해결되지는 않음 |

결정적 사례는 독립 IPC oracle로 실제 cwd와 생존을 확인했다.

1. fixture의 target directory에 DELETE access handle을 유지한다. 파일 삭제나
   disposition 변경은 하지 않는다.
2. 다른 fixture에서 `chdir(target)`는 EBUSY로 실패한다. 반면 target을 초기 cwd로
   지정한 새 Node process는 정상 시작하고 `process.cwd()`가 target임을 보고한다.
3. 그 process가 살아 있는 동안 DELETE access 검사는 성공하며 PID 조회에는
   해당 process가 없다.
4. 첫 DELETE handle을 닫은 뒤에도 새 process는 살아 있다. 재검사에서 DELETE
   access는 성공하고 PID 조회는 NTSTATUS 00000000, PID 0건이다.
5. 자기 fixture process만 종료하고 synthetic canary 내용 불변을 확인한 뒤
   임시 directory를 회수했다.

이는 Windows 20348/x64에서 관측한 반례다. 모든 Windows 관측 방법이 불가능하다는
일반 증명이나 다른 OS/build에 대한 결과가 아니다. 현재 두 후보는 cwd 부재를
보장하지 못하므로 완전성 근거로 사용할 수 없다는 판정이다.

첫 실행의 일반 handle fixture는 FILE_READ_ATTRIBUTES만 요청했다. 이 access는
공유 검사에서 데이터 읽기 access와 다르므로 예상한 sharing violation이 없었다.
FILE_LIST_DIRECTORY를 사용하는 대조군으로 수정했고, 그 과정과 첫 실패도 보존했다.

| Run / revision | 탐색 시험 | 기존 Windows native | 다른 check job |
| --- | --- | --- | --- |
| [44061702799](https://github.com/Sangeok/stagekeeper/actions/runs/44061702799) / 313702a | 3 PASS / 1 FAIL: metadata-only handle 대조군의 기대값 오류 | 7 FAIL | 모두 PASS |
| [44062134741](https://github.com/Sangeok/stagekeeper/actions/runs/44062134741) / d2f116c | 4 PASS: cwd 신원·chdir 간섭·PID 누락 확인 | 7 FAIL | 모두 PASS |
| [44062492846](https://github.com/Sangeok/stagekeeper/actions/runs/44062492846) / 871cffe | 4 PASS: handle 해제 후에도 누락 확인 | 7 FAIL | 모두 PASS |

증거: [최초 실험](../assets/2026-11-17-pr-worktree-qualify/windows-directory-first.json),
[cwd 신원 대조](../assets/2026-11-17-pr-worktree-qualify/windows-directory-identity.json),
[해제 후 재검사](../assets/2026-11-17-pr-worktree-qualify/windows-directory-release.json).
helper/test SHA-256과 source/run/job을 각 파일에 기록했다. 공개 evidence에는
무관한 PID·경로·명령·환경을 포함하지 않는다.

로컬 추가 검증은 `verify:fsd`, `verify:server`, `verify:shared`, ESLint,
`verify:ci-coverage`, `check`(581 PASS / 4 SKIP), `test:architecture`
(472 PASS / 4 SKIP)에서 통과했다. Windows 실험은 실제 Windows CI로 실행했으며
macOS/Linux의 해당 suite skip을 Windows 성공으로 세지 않는다. 앞서 기록한
`codex-init-eval` timeout 사례는 이번 후속 CI에서 수정 없이 통과했다. 최초 실패의
원인을 확정하거나 별도 수정으로 해결했다고 주장하지 않는다.

## 다음 설계 결정의 범위

현재 계약을 보존한 구현 상태는 unknown과 worktree 보존이다. 자동 정리를
실현하려면 관측 가능한 조건과 종료 인계의 책임을 다시 정해야 한다.

권고안은 worker가 작업 결과를 보존하고 자신이 소유한 process를 종료한 뒤,
대상 밖의 controller에 종료를 인계하는 흐름을 먼저 명세하는 것이다. native
관측은 추가 보호로 두되, 확인 불가 상태의 자동 삭제는 계속 금지하고 명시적인
수동 인수 경로로 남긴다. 이 안은 모든 Windows task의 즉시 자동 정리를
보장하지 않으므로 원래 목표와의 차이를 상위 SDD에서 결정해야 한다.

이번 변경은 그 계약을 자동 채택하지 않는다. parent SDD hash는 그대로이며,
권한 상승·OpenClaw 설치·관리기 교체·PR 병합·실제 worktree 정리도 수행하지 않았다.

Primary API 근거는 [CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew),
[SetCurrentDirectory](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setcurrentdirectory),
[FILE_INFORMATION_CLASS](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/ne-wdm-_file_information_class)다.
실제 반례는 위 CI evidence에 근거하며 API 문서에 해당 반례가 명시돼 있다고 주장하지 않는다.
