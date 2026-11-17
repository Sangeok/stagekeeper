---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-17"
approved-by: "user"
approved-at: "2026-11-17"
approval-scope: "Phase QUALIFY의 실제 관측 후보·fixture·시험·CI·기록 구현과 검증. 운영 worktree 정리·PR 병합·REPLACE/ADOPT 제외."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/pr-worktree-closeout.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/ADR/0004-organize-repository-scripts.md"
---

# PR worktree 완료 흐름 — Phase QUALIFY 상세 계획

## Summary

[상위 SDD](./pr-worktree-closeout.md)의 Phase QUALIFY를 구체화한다. 목표는 macOS와 Windows에서 worktree 사용을 관측하는 adapter의 입력·출력, 지원 범위, 실패 처리와 실제 프로세스 증거를 확정하고 OpenClaw에서 이식할 부분을 분리하는 것이다.

이 Phase는 운영 worktree를 삭제하거나 PR을 병합하지 않는다. 현행 두 관리기를 유지한 채 새 관측 모듈을 격리 fixture에서 검증한다. 양 OS에서 성립하지 않으면 QUALIFY를 통과한 것으로 처리하지 않고 상위 REPLACE의 선행 조건을 미해결로 남긴다.

- 작성 모드: `PHASE_PLAN`.
- 위험도: `HIGH-RISK`. 이번 adapter는 읽기 전용이지만 false clear는 후속 자료 삭제의 잘못된 근거가 된다.
- 이번 쓰기 범위: 이 문서 한 파일. 상위 SDD·코드·시험·설정·CI·라이선스 파일은 수정하지 않는다.
- 구현 준비도: 제한된 qualification 작업은 `CONDITIONALLY READY`. Windows backend의 운영 적합성과 REPLACE 착수는 미확정이다.
- OpenClaw는 고정 source reference다. OpenClaw 제품·CLI·gateway 설치나 실행은 요구하지 않는다.

## Goal

- 상위 사용 확인 계약을 clear/busy/unknown의 구체적 관측 계약으로 만든다.
- 현재 코드가 보장하는 범위와 신규 관측이 필요한 범위를 구분한다.
- macOS의 lsof 경로와 Windows 후보를 같은 실패·가시성 기준으로 평가한다.
- native 관측과 시험용 oracle을 분리해 false clear를 검출한다.
- 성공뿐 아니라 미지원·권한 불가·불완전 관측의 보류 결과를 남긴다.
- REPLACE에 넘길 adapter interface·지원 OS/architecture·의존성·검증 증거를 확정한다.

## Proposal Size

`proposal-size: standard`. 새 native 관측 경계, 오류·중단 계약, 추가 helper 후보, 양 OS 시험과 CI coverage 변경을 포함한다. 앱·DB·원격 PR mutation은 없다.

## Authoritative Source and Ownership

| 항목 | 단일 정의 위치 | 이 문서의 역할 |
| --- | --- | --- |
| 선택 Phase | [Phase QUALIFY](./pr-worktree-closeout.md#phase-qualify-플랫폼과-이식-경계-확정) | 기존 경계 유지 |
| 완료할 요구사항 | [REQ-PWC-014](./pr-worktree-closeout.md#req-pwc-014-양-os-사용-확인) | adapter 계약·native 검증 상세화 |
| 기존 Task | [TASK-PWCQ-01](./pr-worktree-closeout.md#task-pwcq-01-사용-확인과-native-이식-증거) | 실행 순서·소스 delta·후속 소비자 구체화 |
| 기존 Verifier | [VFY-PWC-09](./pr-worktree-closeout.md#vfy-pwc-09-실제-os-사용-검사) | 실제 fixture와 판정 기준 구체화 |
| 보호 불변식 | INV-PWC-001, INV-PWC-002, INV-PWC-005 — 상위 Invariants and Constraints | 보호 경로·대상 신원·종료 선언 의미 보존 |
| 적용 제약 | CON-PWC-001, CON-PWC-003, CON-PWC-004, CON-PWC-005, CON-PWC-006 — 상위 Invariants and Constraints | 구현 경계·강제 수단 금지·출처·로그·양 OS 증거 |
| 후속 차단 조건 | [BLK-PWC-01](./pr-worktree-closeout.md#blk-pwc-01-windows-사용-확인-수단-미검증) | QUALIFY 결과로 해소 여부를 판정 |

기존 REQ/INV/CON/TASK/VFY 정의를 이 문서에 복제하지 않는다. 아래 설명은 호환되는 상세화다. 계약을 바꿔야 하는 결과가 나오면 상위 수정 제안으로 보고하며 이 child에서 의미를 덮어쓰지 않는다.

### Evidence baseline

- 작성일: 2026-11-17.
- 작성 checkout: `harness/pr-worktree-closeout-sdd-20261117`, HEAD `b0855c5ab02f35dd9afaf980c09182fee245fbea`.
- 조회한 최신 원격 dev: `c5f4e44e7be8d83607f2c644db3d5e6ae8c2d0a9`. 두 관리 구현·AGENTS·package 명령·check workflow는 작성 HEAD와 동일하다. verification.md 차이는 CI matrix parser 설명이다.
- 상위 파일은 미추적 문서다. 읽은 바이트의 SHA-256은 `bf627b4304fef88b3eaa97be918bbdf6e97f118b8f92d170117630c1ab7cd3e9`다. 상위 변경 시 이 계획의 계약 대응을 재검토한다.
- 같은 미병합 문서 작업의 계속이므로 새 branch/worktree를 만들지 않는다. 상위 문서는 그대로 보존한다.
- 원래 root checkout의 관련 없는 변경 52건은 쓰기 범위 밖이다. 시작 시 열린 PR은 0건이었다.
- 이 문서에서 native probe·테스트·Windows 실행·의존성 설치를 수행하지 않았다.
- plan-eng-review 재검토 기준은 이 child의 수정 전 SHA-256 `b5b19b0a45407e86348b7facd62a62b058ee1a9c89e4a43d2a87321733df87e7`다. 검토 시 열린 PR #360은 다른 문서 기록 작업이다. 로컬 `/usr/sbin/lsof -v`의 결과는 4.91/libproc-based였으며 버전 metadata만 읽었다. 이것은 대상 프로세스 관측·native 인수 증거가 아니다.

## Current Implementation and Remaining Delta

| 대상 | Observed | 판정과 작업 |
| --- | --- | --- |
| `scripts/manage-task-worktrees.mjs:finishTask` | owner·expectedRevision·HEAD·usageEnded를 확인 | 종료 인계의 의미 유지. 이 Phase에서 호출·수정하지 않음 |
| `identityFor / cleanCheckout` | worktree/branch identity, tracked/untracked·진행 중 Git 작업 검사 | 파일 보존 검사다. 프로세스 사용 부재의 증거로 재사용하지 않음 |
| `finalize` | caller cwd와 root가 대상 안이면 거부 | 직접 caller 보호는 존재. 살아 있는 부모·다른 세션의 cwd 전수 관측과는 다름 |
| `pidState` | guard 소유 PID에 signal 0으로 생존 확인 | guard 전용 검사. worktree의 모든 사용자를 찾는 함수가 아님 |
| `scripts/manage-task-worktrees.test.mjs` | 실제 Git/bare origin/격리 임시 폴더/중단 fixture | fixture 구성 패턴만 참고. 구현 내부나 fixture를 production import하지 않음 |
| `scripts/macos/probe-descendant-ownership.mjs` | 실제 kernel 사례를 증거 JSON으로 남기고 소유 fixture 정리 | 실행 증거 분리의 전례. cwd 관측 adapter로 오인하지 않음 |
| `plugin/runtime/windows/role-process.ps1` 및 `RoleProcess.cs` | PowerShell Add-Type·C# interop, 소유 역할 프로세스 실행 | helper 작성·자식 수명 관리의 전례. 제품 모듈 import/변경 금지 |
| `scripts/windows/windows-role-spawn-diagnostics.cjs` | 제한된 실패 metadata 기록 | 로그 최소화 참고. 타 프로세스 cwd 관측 기능은 없음 |
| `scripts/pr/process-usage.mjs` / 시험 | 현재 없음 | 새 읽기 전용 관측 모듈과 시험을 제안 |
| `check/task-worktrees` | Node 22, Windows 2022/macOS 15, 기존 두 시험 실행 | 후속 QUALIFY 구현에서 새 필수 시험 step 추가. 기존 step 유지 |

[architecture README](../../architecture/README.md), [스크립트 배치](../../ADR/0004-organize-repository-scripts.md), [시험 작성](../../architecture/test-writing.md), [시험 배치](../../architecture/test-organization.md)가 현행 계약이다. 이 문서는 이들 파일을 변경하지 않는다.

## Scope and Intermediate Validity

포함:

- 읽기 전용 `process-usage.mjs`와 양 OS backend 후보 검증.
- common 결과 schema, path identity, 출력 파싱, 오류·timeout·cancel 처리.
- 실제 cwd holder를 만드는 독립 fixture, 무쓰기·개인정보 출력·observer 자식 종료 증거.
- 이식 대응표, native profile/권한/의존성 판정, 후속 실행 보고서.
- 구현 승인 후 새 native 시험의 CI step와 coverage 표 연결.

제외:

- 기존 관리기·npm alias 삭제 또는 교체, 새 complete/merge/cleanup 명령 구현.
- PR 생성·병합·GitHub 쓰기·main 승격, 실제 기존 worktree 정리·원장 이관.
- 사용 중인 사용자 프로세스 종료, 강제 handle close, 권한 상승, 시스템 정책 변경.
- OpenClaw 설치, 외부 binary 자동 다운로드, 원본 script 실행.
- 파일 내용을 읽는 scanner, command line/env/transcript 수집, 모든 외부 writer 차단 보장.

중간 상태는 기존 운영 경로가 그대로인 상태다. 신규 module은 시험에서 import하여 관측한다. import 자체에 spawn·파일 쓰기·Git/네트워크 효과가 없어야 하며, 이 Phase에서는 현행 finish/finalize에서 신규 module을 호출하지 않는다.

여기서 실행 중의 읽기 전용은 대상 worktree·sibling·Git metadata·사용자 설정의 무변경을 뜻한다. 호출자가 소유한 격리 compiler scratch의 생성·회수는 아래 Q4의 제한 아래 허용한다. import 무부수효과와 실행 중 제한된 임시 쓰기를 같은 보장으로 표현하지 않는다.

## Phase QUALIFY: 실행 범위

- 원본 Phase: 상위의 동일 Phase.
- predecessor artifacts: 상위 SDD의 고정 snapshot, OpenClaw 고정 source, 아래 native 문서.
- satisfies: REQ-PWC-014
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-005
- governed-by: CON-PWC-001, CON-PWC-003, CON-PWC-004, CON-PWC-005, CON-PWC-006
- verified-by: VFY-PWC-09
- entry: 이 Phase 구현 범위 승인, 현재 source/부모 hash 재검사. 실제 실행 시 Windows/macOS host와 검사 권한 확인.
- exit: 양 OS의 clear/busy/unknown 대조 증거, 지원 profile·가시성 한계·helper 의존성·실행 비용·실패 기준을 기록하고 후속 adapter 경계를 확정.
- stop: Windows를 항상 unknown으로 만드는 stub, 순수 mock 또는 macOS 결과만으로 양 OS 완료를 선언하지 않는다.
- 후속: REPLACE 명령·상태·이관 구현은 별도 작업이다. Phase 완료가 자동 착수 권한은 아니다.

## Change detail for TASK-PWCQ-01

Canonical Task는 상위 SDD에 유지한다. 아래 Q1~Q5는 그 Task의 실행 순서이며 새로운 canonical Task ID가 아니다.

### Q1. 관측 계약과 fixture truth 확정

먼저 새 adapter가 무엇을 관측하는지 고정한다. 이 Phase에서 직접 관측하는 것은 **대상 경로 또는 하위 경로를 cwd로 사용하는 프로세스와 관측의 완전성**이다. shared dependency나 파일 handle을 사용하는 모든 애플리케이션의 업무 종료를 증명하는 것은 아니다. 파일 사용·세션 소유권은 상위 controller의 종료 인계 및 보존 검사와 결합해야 한다.

이 구분이 상위 요구를 충족하지 못한다고 판단되면 scope를 넓힌 것으로 간주하고 상위 계약 수정 필요를 보고한다. 기존 cwd 범위를 모르게 전체 프로세스 사용 부재로 표시하지 않는다.

#### 관측 범위와 완전성 근거

backend 구현 전에 Gate A 산출물에 관측 profile을 작성한다. 최소 내용은 OS/build/architecture·실행 권한, 관측해야 할 process population, enumeration API/도구의 가시성, 누락·권한 거부·process 종료를 감지하는 방법, encoding/format과 제외 대상의 근거다. profile은 source revision과 결합하고 호출자가 검사를 통과시키려고 임의 축소할 수 없다.

`coverageComplete`는 backend가 임의로 선언하는 성공 boolean이 아니다. 공통 wrapper가 profile과 실제 관측 사실을 대조하여 계산한다. 필요한 population을 정의하지 못하거나, 해당 population의 일부를 읽지 못하거나, 열거 결과의 완전성을 판단할 근거가 없으면 false다. 같은 user, fixture가 만든 PID 집합, exit 0, stderr 없음, 출력 행 수만으로 전체 가시성을 증명하지 않는다.

시험용 holder 집합은 정답 대조에만 사용한다. production 관측 범위를 fixture PID로 제한해서 clear를 만드는 구현은 탈락이다. 특정 profile만 입증했다면 그 profile의 증거로만 기록하고, 상위 계약에 필요한 사용자/세션 범위를 줄여야 한다면 상위 변경 결정 전에는 QUALIFY 전체 PASS를 선언하지 않는다. 지원 가능한 완전성 근거를 찾지 못하는 것은 정상적인 negative qualification 결과다.

#### 입력·출력과 판정 순서

제안 production-facing entry는 다음 입력/출력을 갖는다. 이름은 `inspectWorktreeUsage`로 제안한다.

| 입력 | 의미 |
| --- | --- |
| `worktreePath` | controller가 선택한 절대 경로. adapter도 존재·directory·canonical identity를 확인 |
| `signal` | 관측 취소. 사용자 worker를 종료하는 권한이 아님 |
| `observationTimeoutMs` | startup/compile/조회·파싱을 포함하는 관측 단계의 유한 budget. 종료 대기 4초는 별도이며 아래 Q4에서 전체 상한을 정의 |

| 출력 | 의미 |
| --- | --- |
| `status` | clear / busy / unknown |
| `target` | canonical path와 관측 전후의 directory identity. 신원 확인 실패 시 null |
| `observation` | 시점, OS/build/architecture, backend version/profile, population·누락/진단·query 완료 근거와 wrapper가 계산한 coverageComplete |
| `holders` | 검증된 PID·가능한 start identity·target/descendant 관계. 무관한 cwd/명령은 출력하지 않음 |
| `observer` | not-started / settled / unsettled, 자기 자식의 확인 가능한 identity와 격리 scratch 잔존 여부. 사용자 holder의 종료 상태와 혼동하지 않음 |
| `reasons` | 고정 reason code. raw stderr·메모리·env를 메시지로 반영하지 않음 |

판정은 다음 표의 위에서 아래 순서로 하나만 선택한다. holder를 발견했어도 관측 전체가 실패했으면 상위 REQ-PWC-014의 unknown 계약을 우선한다.

| 조건 | 결과 |
| --- | --- |
| 상대/빈 경로, 잘못된 signal, 허용 범위 밖 timeout 입력 | unknown / invalid-input, observer=not-started. spawn·scratch 생성 없음 |
| 이미 취소된 signal | unknown / cancelled, observer=not-started |
| 미지원 profile·도구 없음·permission denial·출력/parse 오류·timeout·도중 취소·target drift·불완전 coverage·observer 미종료 | unknown. 관측한 holder 일부는 진단으로 남길 수 있으나 busy/clear로 격상하지 않음 |
| 유효한 전체 관측·안정된 target·정상 종료 확인 + holder 존재 | busy |
| 같은 성공 조건 + holder 없음 | clear |

entry는 항상 Promise로 결과를 반환한다. signal은 생략하거나 AbortSignal을 받는다. `observationTimeoutMs`는 생략 시 초기 평가값 20,000ms, 지정 시 1~20,000의 정수로 제한한다. 상한 변경은 측정 근거와 profile 갱신으로 처리하며 입력만으로 무제한 대기를 만들지 않는다. 예상 가능한 입력/I/O/권한/파싱 오류는 위 unknown으로 반환한다. 구현 불변식 위반 같은 프로그래밍 오류는 실패로 전파하고 정상 unknown/clear로 숨기지 않는다.

신원을 읽지 못한 process를 holders에서 빼더라도 coverageComplete=true로 표시해서는 안 된다. settle 실패·timeout reason은 다른 부분 결과로 덮어쓰지 않는다.

clear는 해당 시점·지원 scope의 관측 결과다. 삭제 허가나 owner 종료 선언을 대신하지 않으며 호출자가 오래 보관해 재사용할 수 없다. fixture가 아는 PID/cwd 정답을 production adapter에 넘겨 검색 대상을 제한하지 않는다.

### Q2. macOS backend 검증

OpenClaw의 [common.sh](https://github.com/openclaw/openclaw/blob/c7ccc5e8bc96d9ba1dc2463145ebd33338813d02/scripts/pr-lib/common.sh#L633-L655)를 1차 reference로 사용한다. source의 명령은 lsof의 cwd 관측이며, 성공 exit와 출력 형식을 검증한 뒤 대상 관계를 판정한다.

제안 delta:

- argv 배열로 `lsof -nP -d cwd -Fpfn0`를 평가한다. p/process와 f/file-set 경계를 보존하고 f가 cwd인 n/name을 연결한다. 원본의 pn0를 무조건 그대로 복사하지 않는다. shell 문자열을 조립하지 않는다.
- 실행 파일의 실제 경로·버전·build visibility·locale/format을 profile에 기록한다. missing command를 설치하거나 우회하지 않고 unknown으로 반환한다.
- NUL은 field 구분이며 process/file set의 끝에는 NL이 올 수 있다. NUL만 split한 후 whitespace를 일괄 trim하여 경로 바이트를 바꾸지 않는다.
- 설치 버전의 name escaping/locale 규칙을 검증한다. 한글·공백·literal backslash·control-character 이름을 raw path로 오인하거나 두 번 decode하지 않는다. 역변환을 입증하지 못한 형식은 unknown이다. 잘린 field·잘못된 PID·빈 stdout의 의미도 profile에 명시한다.
- nonzero exit·가시성 관련 warning을 무시하지 않는다. warning 억제나 검색 실패를 성공으로 바꾸는 옵션을 판정 편의 때문에 추가하지 않는다. 명확히 무해하다고 입증되지 않은 진단은 unknown이다.
- 문자열 startsWith만 쓰지 않고 canonical directory identity와 경로 segment 경계를 대조한다. `task-a`와 `task-ab`를 같은 대상으로 보지 않는다.
- 부모가 대상에 남고 자식만 cwd를 바꾼 경우 부모를 busy로 찾아야 한다.
- 성공 exit만으로 coverageComplete를 정하지 않는다. 권한 때문에 누락되는 scope와 lsof 진단을 분리해 기록한다.
- actor가 아는 사용자가 관측 불가이거나 scope의 완전성을 판정할 수 없으면 unknown이다. 임의 whitelist로 누락을 없애지 않는다.

목표는 source 복사 자체가 아니라 동일한 false-clear 방지 동작이다. 전체 output은 메모리에서만 다루고 target과 관계없는 PID/path를 로그에 남기지 않는다.

근거는 설치된 `/usr/share/man/man8/lsof.8`의 SECURITY·OUTPUT FOR OTHER PROGRAMS·DEVICE CACHE FILE 절과 [Apple lsof manual source](https://github.com/apple-oss-distributions/lsof/blob/main/lsof/lsof.man)다. 이 문서는 build에 따라 가시성과 device-cache 동작이 달라질 수 있고 field/set terminator가 다름을 명시한다. 로컬 4.91 metadata만으로 macOS 15 runner의 버전·가시성·출력 형식을 인증하지 않는다.

### Q3. Windows 후보를 검증하고 채택 여부 결정

현재 기본 도구만으로 다른 프로세스의 cwd를 읽을 수 있다고 가정하지 않는다. 확인한 primary 문서는 다음과 같다.

| 근거 | 확인된 의미 |
| --- | --- |
| [Win32_Process](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process) | 공개 속성에 PID/parent/creation/image/command line은 있으나 cwd 속성은 없음 |
| [GetCurrentDirectory](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getcurrentdirectory) | 호출한 자기 프로세스의 cwd. 다른 세션 관측 API가 아님 |
| [NtQueryInformationProcess](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntqueryinformationprocess) | 다른 프로세스 정보/PEB 경로는 있으나 API·반환 구조 변경 가능성을 명시 |
| [RTL_USER_PROCESS_PARAMETERS](https://learn.microsoft.com/en-us/windows/win32/api/winternl/ns-winternl-rtl_user_process_parameters) | 공개 구조는 reserved 필드와 image/command line을 노출. cwd layout을 안정된 공개 계약으로 제공하지 않음 |
| [ReadProcessMemory](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-readprocessmemory) | PROCESS_VM_READ 권한과 읽기 가능한 주소 범위 필요 |
| [Sysinternals Handle](https://learn.microsoft.com/en-us/sysinternals/downloads/handle) | file/directory handle 조회 도구이며 관리자 권한을 요구 |

후보 판정:

| 후보 | 이 Phase의 처리 | 채택 기준 |
| --- | --- | --- |
| CIM/Get-Process/ImagePath/command line만 사용 | cwd 판정 backend에서 제외 | image·시작 인자와 현재 cwd를 혼동하지 않음 |
| 내장 PowerShell + 제한된 C# native metadata helper | qualification 후보. 구현 전에 구조·출처·build/bitness·권한·가시성 계획을 기록 | 실제 cwd 대조, 불가 시 unknown, 지원 profile 명시, 제한된 개인정보 접근과 수명 관리 |
| Sysinternals Handle | 비교 reference. 기본 의존성으로 설치하거나 관리자 전환하지 않음 | 별도 의존성·권한 결정이 없으면 운영 후보로 채택하지 않음 |
| owner 선언/PID 존재/잠금 파일만 사용 | 단독 backend에서 제외 | 상위 계약상 native 사용 관측을 대체하지 못함 |

C# 후보는 현재 저장소의 PowerShell Add-Type 사용 전례만 참고한다. `plugin/runtime/windows/role-process.ps1` 또는 역할 실행기를 import하거나 실행하지 않는다. candidate 경로는 `scripts/pr/platform/windows-process-usage.ps1` 및 `windows-process-usage.cs`로 제안한다.

PEB 기반 후보를 시도한다면 구현 전에 다음을 확정해야 한다.

1. 사용할 API와 정확한 data layout의 근거·source revision·라이선스를 남긴다. Microsoft가 opaque로 둔 reserved 영역의 offset을 추정해 production 기본값으로 넣지 않는다.
2. Windows build·host/target architecture·WOW64 처리 범위를 기록한다. 검증하지 않은 layout이나 bitness는 unknown이다.
3. 현재 권한에서 process enumeration, start identity 확인, 필요한 cwd metadata 읽기를 수행한다. 실패 PID를 무시해 clear로 만들지 않는다.
4. 접근은 필요한 metadata 읽기로 제한한다. command line, env, 전체 PEB/memory dump를 출력·저장하지 않는다.
5. PID 재사용/조회 중 종료/부분 읽기/권한 실패를 분리한다. 읽을 수 없다는 사실은 해당 프로세스가 없다는 증거가 아니다.
6. helper가 검증된 scope의 누락 여부를 설명할 수 없으면 coverageComplete=false로 유지한다.
7. CWD oracle을 가진 실제 fixture와 대조한다. native 조회를 fixture의 IPC 응답으로 대체하지 않는다.

이 단계의 결과는 채택·보류·탈락 중 하나다. 공개 ABI만으로 부족하다는 사실을 숨겨 후보를 채택하거나, 새 관리자 권한·binary 설치·의존성 추가를 자동 수행하지 않는다. 적합한 Windows 후보가 없으면 negative qualification 결과를 남기고 상위 BLK-PWC-01을 유지한다.

### Q4. 공통 wrapper·취소·출력 계약

새 `scripts/pr/process-usage.mjs`는 path 확인·backend 선택·deadline·결과 normalization을 소유한다. macOS parser는 이 책임에 가깝게 두고, OS별 소스가 실제로 복잡할 때만 `scripts/pr/platform/`에 분리한다.

- import 시 spawn, filesystem write, Git, network 호출 없음.
- 대상 directory를 canonicalize하고 관측 전후 identity를 대조한다. 없는 경로/다른 파일/identity drift는 unknown이며 main checkout 등은 관측해도 변경하지 않는다.
- 관측 budget은 기본 20초, stdout+stderr의 합산 상한은 16 MiB로 평가한다. cold Add-Type과 모든 순차 native 읽기를 같은 관측 budget에 포함한다. byte 수는 streaming 중 계산하고 초과 즉시 관측을 중단하며 상한 밖 출력을 계속 buffer하지 않는다.
- 관측 timeout·cancel·출력 상한 도달 뒤 settle budget은 최대 4초다. 따라서 기본 전체 호출은 관측 20초+종료 확인 4초의 유한 상태로 설계한다. 이는 현행 `gitCommand`의 20초 관측·4초 미종료 판정과 같은 초기 예산이며 성능 실측 결과가 아니다.
- 1초 정상 종료 시도 후에도 살아 있으면, 보유 native handle 또는 재확인된 PID/start identity로 자기 observer임을 확정한 대상만 종료 강도를 높일 수 있다. 소유권이 불명확하면 강제 종료하지 않는다. 4초 내 종료를 확인하지 못하면 unknown / observer-unsettled로 반환하고 evidence·scratch를 보존한다.
- 새 프로세스를 PID만으로 종료하지 않으며, 같은 observer가 미확정인 상태에서 자동 관측 재시도·scratch 삭제를 하지 않는다. 함수가 종료를 영원히 기다리거나 미종료를 settled로 표시하지 않는다.
- PowerShell은 -NoProfile/-NonInteractive와 argv·명시적 script 경로를 사용한다. 실행 정책·시스템 설정을 영구 변경하지 않는다.
- compile scratch가 필요하면 target·sibling·source·사용자 설정 밖의 호출별 임시 폴더에 한정한다. PowerShell의 compiler TEMP/TMP 등은 그 child에만 전달하며 전역 환경을 바꾸지 않는다. 초기 scratch owner·instance를 기록하고 종료 확인 및 identity 재검사 후 자기 자료만 회수한다.
- lsof 등의 지원 버전이 사용자 device cache를 쓰는지 profile에서 확인한다. cache 기능이 있다면 해당 버전의 no-write 동작을 확인해 사용하고, 기능이 없는 버전에 지원하지 않는 flag를 무조건 전달하지 않는다. 허용되지 않은 cache/config 쓰기를 피할 수 없으면 그 후보를 보류한다.
- 취소/timeout의 소유 범위에는 observer가 만든 compiler/helper 후손도 포함한다. 직접 자식 close만으로 후손이 모두 종료됐다고 가정하지 않는다. 아직 소유/종료를 증명하지 못한 helper 구조는 운영 후보로 채택하지 않는다.
- 사용 중인 worker·editor·다른 세션을 종료하지 않는다. 모든 PowerShell/node 프로세스를 이름으로 죽이는 정리는 금지한다.
- parser/권한/도구 실패는 고정 reason code로 변환하고 raw 출력은 폐기한다. 프로그래밍 오류를 성공으로 삼키지 않는다.

프로세스 생명주기를 확인하는 소비자는 QUALIFY 시험과 그 시험의 evidence 수집 경로뿐이다. 정의되지 않은 별도 증거 실행기나 상주 프로세스를 추가하지 않는다. merge/controller·legacy registry에 production call site를 추가하지 않는다.

예상 작업량은 지원 population의 process 수 P와 출력 byte 수 B에 비례하는 한 번의 bounded 관측이다. PID마다 PowerShell/외부 CLI를 새로 실행하는 구조는 피하고 native helper 안에서 처리한다. 동시에 호출하면 scratch와 결과를 공유하지 않는다. 전체 host 관측 결과를 다음 호출의 clear 근거로 cache하지 않는다. 반복 관측의 rate/호출 제한은 REPLACE controller에서 정할 일이며 이 Phase가 daemon을 만들지 않는다.

~~~text
입력/target 확인 → profile·가시성 근거 확인 → native 관측 → observer settle
  ├─ 입력/관측/coverage/identity/settle 실패 → unknown
  └─ 검증된 전체 관측 → holder 있음: busy / 없음: clear
~~~

오류 경로는 N09~N13/N16/N19, 성공 경로는 N01~N08, 무변경·자식 수명은 N17/N18로 판정한다. 이 diagram은 제안 흐름이며 실제 실행 성공을 나타내지 않는다.

### Q5. 포팅 대응표와 결정 산출물

제안 `scripts/pr/UPSTREAM.md`에 고정 OpenClaw revision, 참조/복제 파일, 원본 고지 위치, 기존 native API 문서, 채택 backend·미지원 profile을 기록한다. 정상 병합·정리 순서는 후속 Phase의 참고 항목으로 남기며 이 Phase에서 merge.sh 전체를 이식하지 않는다.

Phase 결과에는 각 OS의 실제 사용 권한, build/architecture, helper source/binary hash, 관측 scope, 처리한/누락된 사례, cold/warm 소요 시간과 output 크기, clear/busy/unknown 결과를 남긴다. source를 읽은 사실과 native 시험 성공을 구분한다.

## Verification detail for VFY-PWC-09

Canonical verifier는 [상위 VFY-PWC-09](./pr-worktree-closeout.md#vfy-pwc-09-실제-os-사용-검사)에 유지한다. 아래 사례는 그 실행 protocol이며 별도 VFY 정의가 아니다.

### Fixture와 독립 oracle

제안 시험 파일은 `scripts/pr/process-usage.test.mjs`다. 필요한 시험 전용 프로그램은 `scripts/pr/testing/usage-holder.mjs`와 `usage-observer.mjs`에 둔다. production module이 testing/를 import하지 않는다. 별도 시험 runner나 npm dependency를 도입하지 않는다.

- 실제 임시 Git repository와 linked worktree A/B를 만들고, 관측 호출은 A/B 밖의 control directory에서 실행한다.
- holder는 준비된 후 IPC로 자기 PID·start identity·실제 cwd와 ready를 보고한다. 이 값은 테스트 기대값의 oracle이며 adapter에 검색 대상·정답으로 전달하지 않는다.
- parent-holder는 A에 남고 child는 control로 이동하는 구조를 실제로 만든다. 자식의 cwd 변경으로 부모가 사라졌다고 판단하는 구현은 실패해야 한다.
- 초기 파일 hash, Git HEAD·ref 목록, worktree 등록·marker·index를 snapshot한다. 관측 전후 불변을 확인한다. git read에서는 optional index 갱신을 억제한다.
- timeout/cancel은 IPC handshake로 시작 시점을 맞춘다. 성공을 기대하는 고정 sleep을 쓰지 않는다.
- 시험은 자신의 fixture/observer 프로세스만 종료한다. 종료를 확인한 뒤 알려진 임시 경로만 정리한다. 실패하면 정확한 잔존 경로를 보고하고 사용자 checkout을 정리하지 않는다.
- helper의 output은 raw stdout을 공개 로그에 붙이지 않는다. 개인정보 canary가 출력되지 않는지 별도로 검증한다.

### 사례 표

이 표의 N 번호는 시험 시나리오 label이며 새로운 canonical requirement/verifier가 아니다.

| 사례 | Setup / action | 기대 결과와 검출할 결함 | 증거 종류 |
| --- | --- | --- | --- |
| N01 | control에 observer, A cwd holder 없음, 지원 scope 완전 관측 | clear. 실제 clear 경로 없이 unknown만 반환하는 구현 실패 | 양 OS native |
| N02 | 살아 있는 holder의 cwd=A | busy와 해당 holder 식별. false clear 검출 | 양 OS native |
| N03 | holder cwd=A/subdir | busy. 정확한 root 문자열만 검사하는 결함 검출 | 양 OS native |
| N04 | holder cwd=A-sibling, A에는 없음 | qualified clear. 문자열 prefix 오탐 검출 | 양 OS native |
| N05 | parent cwd=A, child cwd=control | busy이며 parent 포함. 부모 사용 누락 검출 | 양 OS native |
| N06 | probe caller 자체가 A에 있고 observer 자식은 밖에 있음 | busy. 자기 세션을 무조건 제외하는 결함 검출 | 양 OS native |
| N07 | holder 두 개 중 하나만 종료, 이어서 둘째도 종료 | busy 유지 후 새 관측에서 clear. 첫 종료만 보고 clear하는 결함 검출 | 양 OS native |
| N08 | 같은 user의 독립적인 다른 세션 holder | busy. 테스트가 만든 한 process tree만 관측하는 결함 검출 | 양 OS native |
| N09 | holder 일부를 읽은 뒤 다른 대상 접근 거부 또는 API 실패 | 부분 holder가 있어도 unknown, 누락/권한 근거. busy 우선으로 오류를 숨기는 결함 검출 | native 거부 + boundary fault 구분 |
| N10 | observer/자기 compiler 후손이 완료하지 않음 또는 합산 output 상한 초과 | 관측+settle 상한 내 unknown. 종료 확인 또는 observer-unsettled를 정확히 표시, 사용자 worker 유지 | 실제 observer process + 미종료 boundary fault |
| N11 | 시작 전·compile/조회 중 signal 취소 | 시작 전에는 spawn/scratch 0회. 실행 중에는 bounded settle, worker 유지, 미종료 시 scratch 보존 | 실제 observer process |
| N12 | 정상 NUL+NL set, cwd/file-set 구분, 잘린 field, 잘못된 PID, 모호한 escape/encoding/schema | 정상 record만 해석. malformed/손실/모호한 역변환은 unknown | parser/boundary fixture |
| N13 | PID가 관측 중 종료되거나 start identity가 달라짐 | 새 process와 혼동하지 않음. 완전성 확보 실패 시 unknown | native 종료 + 재사용 대역 구분 |
| N14 | 공백·한글·literal backslash/control 문자·8.3 alias·대소문자·segment prefix | 실제 이름 바이트와 profile decoding 일치. 같은 directory 대조, 다른 경로 오탐 없음. 미지원 형식은 unknown | 지원 OS별 native, 미지원 조건 명시 |
| N15 | 대상 경로 교체·rename 또는 외부 junction/symlink | identity/path 판별 실패는 unknown. 다른 자료 접근·수정 없음 | 양 OS 파일 fixture |
| N16 | observer 도구 없음, 미지원 build/architecture, 권한 부족 | unknown과 고정 reason. fallback clear 금지 | unit + 해당 native profile |
| N17 | process 인자/env에 비밀 canary, target에 canary 파일 | 결과·stderr·evidence에 값 없음, target 파일 hash 불변 | 양 OS privacy fixture |
| N18 | import, 반복/병렬 관측, Windows cold compile와 scratch 실패 | import 부수효과 0. target/repo/user config 불변, runtime scratch만 허용. 호출 간 오염 없음. 정상 종료 후 회수, 미종료·identity 변경이면 보존 | unit + 실제 process |
| N19 | exit 0이지만 visibility profile 미확정·일부 결과 누락·권한 warning·잘못된 coverage 주장 | 성공 exit/빈 holders만으로 clear가 되지 않음. wrapper가 실제 근거와 profile을 대조해 unknown | native visibility 사례 + boundary fixture 분리 |

N09의 실제 권한 거부를 해당 host에서 재현하지 못하면 fault injection만으로 native 권한 검증을 완료했다고 쓰지 않는다. N13의 PID 재사용을 deterministic하게 강제할 수 없으면 boundary 사례와 실제 종료 사례를 분리한다. 지원 profile에 필요한 증거 누락은 BLOCKED로 기록한다. N14의 OS별 불가능한 이름 형식은 capability 표에 사유를 적고 해당 입력의 unknown/rejection을 시험한다. 지원한다고 선언한 변형의 native 시험을 skip해 통과시키지 않는다.

open file handle만 가지고 cwd는 밖인 프로세스, unloaded editor 상태, 다른 host의 사용자 업무까지 이 관측이 검출한다고 주장하지 않는다. 그런 사용을 owner가 알고 있으면 상위 완료 흐름에서 보존해야 한다. 이 Phase에서 clear가 나온 것을 실제 cleanup 허가로 사용하는 integration은 금지한다.

### 실행 명령과 CI 연결

새 파일이 구현된 후 실행할 명령이다. 이번 문서 작성에서는 실행하지 않았다.

~~~sh
npm exec --call "node --test scripts/pr/process-usage.test.mjs"
npm run test:architecture
npm run test:scripts
npm run docs:check
npm run verify:ci-coverage
~~~

후속 코드 변경의 저장소 필수 검사는 AGENTS.md와 verification.md에 따라 함께 수행한다. 이 Phase는 앱 코드를 변경하지 않으며 불필요한 live 모델·운영 DB·실제 PR 인수를 추가하지 않는다.

CI 계획:

- 기존 `check/task-worktrees`의 Windows 2022와 macOS 15 matrix에 새 명시적 필수 step을 추가한다.
- 기존 `manage-task-worktrees.test.mjs`와 `cleanup-task-branches.test.mjs` step은 QUALIFY 동안 유지한다.
- verification.md의 OS별 coverage 행을 같은 변경에서 보완한다. 별도 새 job을 만들 필요는 없다.
- Linux의 공통 script 시험에서는 unsupported 결과와 공통 parser/계약을 검사한다. Linux 결과를 macOS/Windows native 증거로 세지 않는다.
- 지원 OS에서 필수 native 사례를 skip하거나 항상 unknown으로 끝내고 job 성공으로 계산하지 않는다.
- runner의 OS build·architecture·elevation 상태를 기록한다. hosted runner에서의 성공이 일반 사용자 PC의 권한 profile까지 검증했다는 뜻은 아니다.

### Evidence artifact

실행 결과는 새로운 test report와 그 보고서가 소유하는 evidence 디렉터리에 저장한다. 실제 보고서명은 실행일 기준 저장소 규칙을 따른다. 기존 보고서를 덮어쓰지 않는다.

필수 내용:

- source revision, parent hash, adapter/helper hash, OS/build/architecture, Node/Git/backend version;
- current privilege/profile와 관측 scope, incompleteness 이유;
- 사례별 expected/observed status, native 또는 boundary-double 구분, exit/timeout/cancel 정보;
- observer 종료 여부와 대상·sibling 파일/ref/등록의 불변 결과;
- cold/warm startup·compile·관측·settle의 시간, population 크기·합산 output byte 수, 적용 관측/settle budget;
- 실행 profile의 가시성 근거와 제외 대상, incompleteness 사실, parser protocol/locale, scratch의 위치 범주·owner·정리/보존 결과;
- 채택/보류/탈락 결정, 운영 적용 가능 profile, 남은 gap과 상위 blocker 연결.

관계없는 프로세스 경로·명령·환경·memory dump는 저장하지 않는다. raw 자료를 남겨야만 결함을 분석할 수 있는 경우, fixture의 합성 데이터만 별도 비공개 파일에 보존하고 공개 보고서에 내용을 붙이지 않는다.

## Affected Files and Write Boundary

다음은 후속 QUALIFY 구현이 승인될 때의 범위다. 이번에는 이 계획 파일만 작성한다.

| 경로 | 조치 | 범위 |
| --- | --- | --- |
| `scripts/pr/process-usage.mjs` | create | 읽기 전용 adapter·normalization·자식 수명 |
| `scripts/pr/process-usage.test.mjs` | create | N01~N19, native와 double 구분 |
| `scripts/pr/testing/usage-holder.mjs`, `usage-observer.mjs` | create when needed | 실제 프로세스 fixture만. production import 금지 |
| `scripts/pr/platform/windows-process-usage.ps1`, `windows-process-usage.cs` | conditional create | Q3 후보가 근거·scope gate를 통과한 경우에만 |
| `scripts/pr/UPSTREAM.md` | create | 고정 원본·이식 대응·고지·OS profile |
| `.github/workflows/check.yml` | update | 기존 matrix에 필수 probe 시험 추가. 기존 시험 유지 |
| `docs/architecture/verification.md` | update | 새 시험 coverage와 qualification 용도만 기록 |
| `docs/test-reports/`의 신규 보고서/evidence | create at execution | 실행 증거. 보고서 metadata 규칙 준수 |
| 기존 두 관리기·npm alias·AGENTS·상위 SDD | keep | 이번 Phase에서 production 활성화·퇴역·상위 재정의 없음 |
| `src/`, `packages/`, `plugin/`, 실제 로컬 원장 | read only | 코드 참고는 가능, import·실행·변경 불가 |

파일 수 검토: 현재 목록은 core 2개, 선택 fixture 최대 2개, Windows helper 최대 2개, source 기록 1개, CI/coverage 2개로 최대 9개와 실행 보고서/evidence다. 새 service·registry·database는 0개다. 비교한 대안은 다음과 같다.

| 구조 | 장점 | 판단 |
| --- | --- | --- |
| 공통 Node 모듈이 결과·coverage·lifecycle을 소유하고 OS helper는 관측 사실만 반환 | 판정 기준 한곳, OS별 상태 의미 불일치 방지 | 채택 방향. 새 production public entry는 하나 |
| 각 OS CLI가 완전한 판정/상태를 소유하고 Node가 결과만 중계 | 파일 일부를 줄일 수 있음 | coverage·오류·timeout 정책 복제로 제외 |
| helper와 fixture source를 모두 한 파일의 긴 문자열로 내장 | 파일 수 감소 | source/라이선스·native lifecycle 검토를 어렵게 하므로 필수 감소 목표로 삼지 않음 |

상태 writer 추가·경쟁 구현·pass-through 층·제품 내부 import는 도입하지 않는다. fixture는 필요할 때만 분리하며, evidence 목록은 시험 결과에서 산출하고 수동 PASS 목록을 따로 유지하지 않는다.

Windows 추가 helper의 구체적 algorithm·source/layout·권한 계획을 확정하지 못한 상태에서 이름만 같은 placeholder helper를 만들지 않는다. 지원 범위를 바꾸거나 외부 binary/관리자 권한을 채택해야 하면 먼저 그 결정과 상위 영향이 문서로 명시돼야 한다.

## Decision Gates and Stop Conditions

### Gate A — backend 증거 선택

Q1의 결과 schema와 Q2/Q3의 source·관측 가능 범위, 필요한 population·권한별 누락 판정·target identity·parser·scope 증명식을 먼저 정한다. 이 항목이 없는 backend는 clear를 반환하는 구현 단계로 넘어가지 않는다. macOS와 Windows의 clear 의미가 다르면 성공으로 합치지 않는다. native 구조 layout이나 권한 범위를 확인하지 못하면 해당 후보는 보류한다. 이는 fixture/parser 작업까지 모두 막는 조건은 아니지만 해당 backend 구현을 추측해 진행할 수는 없다.

### Gate B — 양 OS native 통과

모든 필수 native 사례의 실제 증거와 정상 clear 대조군, 명시한 boundary fault 사례의 결과가 있어야 QUALIFY를 통과한다. 대역 입력 시험에 native 증거가 있는 것처럼 표시하지 않는다. unknown을 안전하게 반환하는 구현은 필요한 실패 처리지만, 모든 Windows 요청이 unknown인 상태는 Windows 지원 완료가 아니다.

두 OS의 source snapshot과 결과 schema가 일치해야 한다. OS별 사례가 실패하면 이유를 유지하고 고쳐서 재검증하거나 상위 BLK-PWC-01을 유지한다. 단순 rerun으로 반복 실패를 숨기지 않는다.

### Gate C — 후속 adapter 채택

채택 결과에는 다음이 있어야 한다.

- production-facing input/output와 오류·cancel·timeout 계약;
- 구현·증거의 고정 revision, 지원 OS/build/architecture·권한 profile;
- 필요한 helper/tooling, 설치 없는 경우 그 사실, 새 의존성이면 해당 결정;
- false clear 방지와 관측 범위의 한계;
- REPLACE가 추가로 수행해야 할 owner release·identity·파일 보존 검사.

CWD 관측은 운영 전체 사용 종료의 대체 수단이 아니다. 세션 종료 없이 probe만 반복해서 clear를 얻으려는 방식은 채택하지 않는다.

### 결과 판정

| 결과 | 의미 | 후속 |
| --- | --- | --- |
| PASS | 양 OS의 필수 사례와 지원 profile·비용·출처가 검증됨 | 상위 blocker 해소 제안과 REPLACE 상세 계획 입력 제공 |
| BLOCKED | 실행 환경·접근 범위·native 수단·의존성 결정이 부족함 | 관측 결과/실패 후보를 보존. REPLACE에 진행하지 않음 |
| FAIL | 지원한다고 한 profile에서 false clear·오염·자식 누수 등 계약 위반 | 수정 후 관련 native 사례 재검증. skip으로 통과 금지 |

관리자 권한의 전체 host 관측을 새 기본 요건으로 삼거나 public API로 얻지 못한 정보를 지원한다고 추정하는 결정은 이 문서가 자동 승인하지 않는다. 그 변경이 필요하면 상위 설계의 비용·지원 범위·보존 계약을 함께 검토한다.

## Rollback and Handoff

이 Phase는 운영 정리 경로를 연결하지 않으므로 실패 시 기존 관리 기능을 되돌릴 필요가 없다. 새 adapter/helper/추가 CI step을 같은 변경에서 철회하고 qualification 결과를 보존할 수 있다. source rollback과 실제 fixture 자식 종료는 구분한다.

실행자는 자기가 만든 observer·fixture만 정리하고, 종료 확인이 안 된 경우 정확한 PID/path와 이유를 보고한다. 다른 작업자의 세션이나 사용자 worktree를 지우지 않는다. parent·기존 관리 원장·원격 PR/branch는 이 Phase에서 변경하지 않는다.

REPLACE 인계에는 위 Gate C 산출물, N 사례 결과, 원본 대응표, 지원하지 않는 환경의 unknown 처리, 상위 요구와의 차이 목록을 포함한다. parent의 TASK/VFY 정의를 이 문서로 옮기거나 자동으로 완료 처리하지 않는다.

## Selected-Phase Readiness

- Verdict: **CONDITIONALLY READY**, bounded qualification에 한정.
- 준비된 부분: 현재 source 차이, adapter 계약, 후보 평가 순서, native fixture·negative control, 증거 형식·CI 배치·정지 조건.
- 조건: 실제 Windows/macOS 실행 환경과 권한을 확인하고, Q3의 native source/layout 선택을 근거와 함께 확정한 뒤 해당 후보를 구현한다.
- 미확정: Windows 후보가 상위 사용 확인 계약을 실제로 충족하는지, 어떤 build/architecture/profile을 지원할 수 있는지.
- 의미: qualification 실험을 실행할 수 있는 계획이다. 실제 backend의 운영 적합성·REQ-PWC-014 충족·상위 BLK-PWC-01 해소는 아직 주장하지 않는다.
- 후속 Phase: REPLACE/ADOPT는 실행 범위 밖이며 자동 시작하지 않는다.

현재의 불확실성은 QUALIFY가 검증할 대상이다. 후보를 선택할 근거 자체가 없으면 그 후보에서 멈추며, negative qualification도 결과로 기록한다. 이를 PASS나 요구사항 완료로 바꾸지 않는다.

## Engineering Review Record

### 최초 판정과 수정 범위

2026-11-17 plan-eng-review로 수정 전 child snapshot을 검토했다. **처음부터 개선점이 없었던 문서는 아니다.** 아래 네 건은 문서의 명시적 충돌·정의 부족을 source와 대조해 찾은 사항이며 실행 중인 구현의 재현 bug라고 주장하지 않는다. 상위 SDD와 구현 코드는 수정하지 않는다.

| ID | 분야·초기 중요도·확신 | 수정 전 근거와 영향 | 반영한 개선 |
| --- | --- | --- | --- |
| F1 | architecture / CRITICAL(후속 삭제 판단 전 해소 필요), 8/10 | Q1·Gate A가 coverageComplete의 생성 근거를 정의하지 않아 backend가 일부 결과를 전체라고 표시할 여지 | profile/population/누락·제외 근거와 wrapper 판정 소유를 정의, 미확정이면 unknown; N19 |
| F2 | code quality / INFORMATIONAL, 10/10 | Q1은 holder 우선 busy와 모든 권한/timeout 오류 unknown을 동시에 규정. invalid-input의 반환 방식도 모호 | unknown 우선 결정표, Promise/입력 오류·취소 계약, 부분 holder+오류 대조; N09/N11 |
| F3 | lifecycle/performance / INFORMATIONAL, 10/10 | Q4의 전체 20초·close 대기와 N10 deadline 조건에 settle 상한·후손 처리가 없음 | 관측 20초+settle 4초, 자기 process identity·unsettled·scratch 보존, 합산 output 상한; N10/N11 |
| F4 | side effects/tests / INFORMATIONAL, 10/10 | Q4는 compile scratch를 허용하지만 N18은 모든 파일 쓰기 0을 요구 | target/repo/config 무변경과 제한된 scratch를 분리, backend cache 확인, compile/취소/반복 사례 보강; N18 |

lsof의 set terminator·name escaping·build visibility는 설치 manual과 Apple source를 근거로 Q2에 보강했다. 이는 확인한 4.91/libproc metadata와 일반 문서 대조이며 대상 process scan은 수행하지 않았다.

### 네 영역의 검토 결과

- Architecture: 공통 판정 소유자와 OS 사실 관측을 분리했다. 최대 9개 예정 파일 및 보고서의 작은 대안을 비교했다. 새로운 영구 상태나 제품 의존성은 추가하지 않는다.
- Code quality: 예상 실패와 프로그래밍 오류, unknown/busy/clear의 우선순위, target/observer identity, bounded lifetime을 구체화했다.
- Tests: 상위 canonical VFY를 유지하고 N09~N18을 실제 실패 경계에 맞게 수정, N19를 추가했다. 기존 파일의 native 시험은 아직 없어 현재 구현 coverage를 PASS로 세지 않는다.
- Performance: process 수 P·output B, cold compile·관측·settle을 별도 기록하고 합산 byte·시간 상한을 둔다. 이번에는 benchmark를 수행하지 않았고 개선 수치를 주장하지 않는다.

### 검증 가치와 counterargument

| 개선 검증 | 보호할 성질 / 실패를 만드는 결함 | 기존 계획의 빈틈 / 한계 |
| --- | --- | --- |
| N19 scope 음성 대조 | 일부 결과·exit 0을 전체로 오판하면 실패 | 이전 N01은 완전 관측을 전제로만 둠. 대역 사례가 native 전체 가시성을 입증하지는 않음 |
| N09/N11 판정 대조 | holder+권한 오류를 busy로 만들거나 취소 뒤 spawn하면 실패 | 충돌한 기대값을 하나로 고정. 실제 권한 재현이 없으면 native 증거로 세지 않음 |
| N10/N11 lifetime | settle이 끝없이 대기하거나 compiler 후손을 놓치면 실패 | 기존 직접 observer 종료 확인만으로는 부족. 외부 worker 종료는 금지 |
| N18 effect 범위 | target/config 쓰기 또는 호출 간 scratch 오염·미종료 scratch 회수가 있으면 실패 | 합법적인 compiler scratch를 무쓰기 실패로 오판하지 않음 |

반론도 확인했다. busy와 unknown은 모두 후속 정리를 막지만, 상위 계약과 반환 schema의 일관성을 위해 F2를 수정했다. source의 timeout만으로 자식 close/후손 종료의 유한성이 보장되지는 않아 F3는 유효한 최초 지적이었고, 이번 문서에서 별도 settle 상한과 미종료 결과로 보완했다. scratch를 허용해도 target 자료 보존이 약화되지 않도록 F4의 허용 위치와 소유권을 제한했다.

### 결정과 남은 검증

문서 수정 권한은 사용자의 이번 “검증하고 개선” 요청이다. F1~F4는 상위 의미를 유지하는 계획 보완으로 반영했다. 새로운 설치·권한 확대·운영 backend 선택·실제 자료 정리는 승인된 것으로 기록하지 않는다.

| 결정 | 상태 |
| --- | --- |
| 공통 wrapper의 coverage·결과 판정, unknown 우선 | 문서에 반영 |
| 유한 관측/settle·자기 자식과 scratch 효과 구분 | 문서에 반영 |
| Windows의 실제 native backend/profile 채택 | qualification 증거 대기 |
| 상위 요구 변경·REPLACE/ADOPT 실행 | 이번 검토 범위 밖 |

검토 후 판정은 **조건부 qualification 계획으로 검토 가능**이다. 문서의 네 결함은 보완했지만, 실제 Windows 가시성·권한·layout과 양 OS의 비용/자식 종료를 실행 검증한 것은 아니다. 독립 sub-agent 검토는 요청되지 않아 수행하지 않았고 이번 검토는 self-review다. 현재 확인한 문서 결함과 예상된 qualification 불확실성을 구분한다.

## Verification Results

| 문서 작업 | 상태 | 근거·한계 |
| --- | --- | --- |
| parent·현재 관리 코드·시험·CI·native helper 전례 대조 | 읽기 검토 수행 | 실제 probe 실행과 구분 |
| Microsoft primary 문서 확인 | 수행 | API 범위·권한·opaque 구조의 한계 확인 |
| 문서 source bundle 추적성 | PASS | parent + 이 문서, 일반 모드. 기존 canonical 정의 재사용, 중복/끊어진 참조 없음 |
| 상대 링크·front matter | PASS | 두 미추적 문서 포함, Markdown 231개·상대 링크 1,211개·문제 0건 |
| 공백·fence·placeholder·parent 불변 | PASS | EOF/공백 검사, 상위 SHA-256 일치 |
| 선택 Phase 의미 검토 | 수행 | 독립 oracle·후보의 미검증 상태·상위 계약 범위·native/double 증거 구분 |
| native N01~N19 | Not run yet | 계획 검토·수정 요청이므로 구현·실행하지 않음 |

source bundle은 `pr-worktree-closeout.md`와 이 파일이다. 상위에 REPLACE/ADOPT의 미래 요구사항과 blocker가 있으므로 strict를 Phase filter처럼 사용하지 않는다. 일반 bundle 검증 뒤 선택 Phase의 의미적 coverage를 별도로 검토한다.

## Approval and Completion Notes

승인 기록은 front matter가 단일 기준이다. 계획 작성 당시에는 구현 실행 승인이 없었다. 후속 사용자 요청에 따른 QUALIFY 구현 승인은 front matter에 기록했다. 상위 SDD에 정의된 정상 운영 교체·자료 이관과 구분한다.

계획 작성·리뷰 당시 산출물은 이 파일 한 개였으며 native 실행과 코드 변경을 수행하지 않았다. 이후 승인된 구현·검증은 아래 Implementation record로 구분한다. 상위 문서는 보존한다.

## Implementation record

실행 기준을 최신 dev `8e0f880c13c2a0dce02c9246c983dffff898bc77`로 fast-forward했다. 기존 미추적 두 문서는 보존했다. 공통 도구는 Node ESM이며 `.sh`·Bash·OpenClaw runtime을 추가하지 않는다.

Gate A 후보의 scope는 호출한 계정의 모든 세션에 속한 non-zombie process cwd다. 같은 계정이라는 사실만으로 coverage를 인정하지 않고 독립 전후 inventory·start identity·필수 cwd·진단을 대조한다. 이 범위 밖의 계정·특권·원격 사용은 인증하지 않으며, 자동 삭제 연결은 없다. 지원 범위가 맞지 않는 REPLACE 적용은 별도 보류한다.

Windows 후보는 설치된 PowerShell Core 7의 메모리 내 Add-Type과 고정 phnt prefix 근거를 사용한다. 외부 binary 설치·SeDebugPrivilege 활성화는 없다. Windows Server 2022 x64/build 20348로 qualification을 제한하며 다른 profile은 unknown이다. source·profile·라이선스는 `scripts/pr/UPSTREAM.md`를 따른다. Windows 실제 통과 여부는 CI 결과로 기록하며 코드 작성만으로 성공을 선언하지 않는다.

macOS 첫 확장 실행에서는 외부 process population 변경으로 정상 대조군 3건이 unknown이었다. 조건을 완화하거나 재시도 횟수만 늘리지 않고, 하나의 관측 budget 안에서 fresh inventory를 재확인하도록 구현했다. snapshotAttempts/populationChanges를 결과에 남긴다. 변경 후 native gate는 21 PASS, 1 SKIP(다른 OS 전용 common 사례), 0 FAIL이었다. Windows와 나머지 프로젝트 검증은 진행 중이다.
