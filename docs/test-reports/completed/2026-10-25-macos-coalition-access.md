---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "standard"
test-levels: ["static", "contract", "integration"]
test-tools: ["Node.js", "Clang", "libproc", "libSystem", "GitHub Actions"]
created-at: "2026-10-25"
completed-at: "2026-10-25"
last-executed-at: "2026-10-25T12:06:49Z"
tested-revision: "fe98480d3a3c2536bb9ce0fbdd3575fd6f689dce"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md", "docs/test-reports/completed/2026-10-25-macos-launchd-ownership.md"]
primary-area: "harness/dual-client-runtime"
observed-environments: ["CI | macOS 15 arm64 and x64 | Darwin 24.6.0; SDK 15.5; Node 22.23.2 | ordinary user", "local | Windows repository checks | Node 22.13.1 | no native macOS execution"]
test-summary: "pass: ordinary-user coalition creation and explicit spawn denial reproduced on both architectures — product ownership remains blocked"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md"]
---

# 일반 사용자 coalition 제어 가능성 검증

## Summary and Decision

macOS ARM·Intel에서 resource와 jetsam coalition 생성 네 건 모두 `-1/EPERM(1)`,
현재 소속을 명시한 spawn 네 건도 `EPERM(1)`이었다. 일반 fork/setsid/exec와 spawn은
성공했다. 조회·상속 가능한 기존 coalition은 호출한 Node 부모와 공유됐으며, 이를
Stagekeeper 실행 하나의 격리된 소유권으로 사용할 수 없다.

일반 사용자에서 직접 coalition을 생성·제어하는 후보는 이번 환경에서 부적합이다.
전체 종료·helper death 안전성을 검증할 전용 coalition을 만들지 못했으므로 그 항목은
미실행이다. 예상 거부를 검증한 PASS이며 macOS 제품 지원 PASS가 아니다. 제품 backend와
Windows 0.5.23 payload는 변경하지 않았다. 전체 제안서는 pending/blocked를 유지한다.

## Scope and Criteria

| 기준 | 연결 요구사항 | 이번 판정 범위 |
| --- | --- | --- |
| R1 | [최소 설치](../../proposals/active/codex-dual-client-runtime-follow-ups.md)의 REQ-MIN-001/002 | 일반 사용자 권한과 기존 native 설치 조건을 보존하는 coalition 제어 가능성 |
| R2 | [resident 계획](../../proposals/active/codex-resident-runner-plan.md)의 macOS backend 경계 | 조회·상속과 전용 소유권 생성·명시적 배치를 구분 |
| R3 | [종료 계약](../../architecture/protocol.md)의 전체 자식 종료 확인 | 생성 실패로 live coalition 종료는 NOT RUN; 기존 coalition 종료 금지 |

## Test Target

기준 dev는 `701e65bdc8fac6cab05e1cd276e750bb0001f484`, 시험 source는
`fe98480d3a3c2536bb9ce0fbdd3575fd6f689dce`다.
[C probe](../../../scripts/macos/probe-coalition-access.c),
[실행기](../../../scripts/macos/probe-coalition-access.mjs),
[macOS workflow](../../../.github/workflows/macos-runtime-contracts.yml)를 사용했다.
두 아키텍처의 source·driver·binary hash와 SDK·kernel 버전을 증거 JSON에 보존한다.

## Preconditions and Test Data

실행기는 macOS가 아니거나 출력 파일이 이미 있으면 시작을 거부한다. realpath로 확인한
임시 루트에서 `xcrun clang -std=c11 -Wall -Wextra -Werror`로 빌드했다. real/effective UID가
같고 0이 아님을 확인하며 sudo·추가 entitlement·인증 정보·제품 runtime은 사용하지 않는다.

고정된 [Apple ABI 선언](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/sys/coalition.h)과
[proc membership 형식](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/sys/proc_info_private.h#L63)을
기준으로 런타임 symbol을 조회했다. 정확한 실행 kernel의 source 일치나 공개 지원 API
계약을 증명하지 않는다. SDK 15.5의 검사한 네 header 경로에는 파일이 없었다.

조회 대상은 자기 자신·부모·직접 만든 자식뿐이다. 기존 coalition의 종료·reap·정책 변경은
요청하지 않는다. 생성이 예상과 달리 성공하면 새로 받은 빈 coalition만 종료·reap하고
관찰을 보존한 뒤 기대한 거부 검사를 실패시킨다. 이번에는 생성 성공이 없어 이 정리 분기는
실행하지 않았다. child alarm·parent alarm으로 대기를 제한하고 정상 결과의 두 자식을
waitpid로 수거했다. 읽기·생성 결과에 실제 PID나 coalition ID는 기록하지 않는다.

## Test Cases and Results

| ID | 기준 | 실행 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- |
| T1 | R1/R2 | 일반 사용자·symbol 조회 | 두 아키텍처 모두 ordinary user, 네 함수 symbol 확인 | PASS |
| T2 | R2 | 현재·부모 소속 조회와 fork/setsid/exec | 두 타입의 소속이 부모와 같고 세션 분리·exec 후에도 유지 | PASS |
| T3 | R2 | 속성 없는 일반 posix_spawn | 양쪽 `/usr/bin/true` 실행·종료 성공 | PASS |
| T4 | R1/R2 | resource/jetsam 생성, flags 0/16 | 네 시도 모두 -1/EPERM(1), ID 미할당 | PASS: 거부 확인 |
| T5 | R1/R2 | 현재 소속을 명시한 posix_spawn | 네 attribute 설정 성공, 실제 spawn은 모두 EPERM(1) | PASS: 거부 확인 |
| T6 | R3 | fixture 정리 | 총 네 대조군 자식 waitpid 수거, 생성된 coalition 0, 임시 루트 정리 | PASS |
| T7 | R3 | 전용 coalition의 live 후손 종료·helper death | 생성 권한이 없어 진행하지 않음 | NOT RUN |

## Commands and Static Checks

- native: `node scripts/macos/probe-coalition-access.mjs "$RUNNER_TEMP/coalition-access.json"`.
- source [macOS CI](https://github.com/Sangeok/stagekeeper/actions/runs/40191644013)와
  [check CI](https://github.com/Sangeok/stagekeeper/actions/runs/40191644014)는 모두 PASS다.
  macOS 공통 계약은 각 아키텍처 529 PASS / 20 SKIP이며 source 판정은 E3에 고정한다.
- 로컬 JavaScript syntax·대상 ESLint, `check` 194 PASS / 3 SKIP,
  fsd/server 경계, architecture 148 PASS / 2 SKIP, production build PASS.
- Windows에서 실행 시 macOS 필요 오류로 거부하고 증거 파일을 만들지 않는 것을 확인했다.
- 문서 156개·상대 링크 716개·보고서 47개 검사와 aggregate 구조 검사 PASS.

## Evidence Registry

| ID | 증거 | 위치 |
| --- | --- | --- |
| E1 | ARM native 관찰·hash·환경 | [macos-arm64.json](../assets/2026-10-25-macos-coalition-access/macos-arm64.json) |
| E2 | Intel native 관찰·hash·환경 | [macos-x64.json](../assets/2026-10-25-macos-coalition-access/macos-x64.json) |
| E3 | source·CI·대조군·합계·검사 | [source-basis.json](../assets/2026-10-25-macos-coalition-access/source-basis.json) |

## Findings and Follow-up

Apple source의 [syscall 진입부](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/kern/sys_coalition.c#L224)는
privileged coalition 소속 여부를 검사한다. [명시적 spawn](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/kern/kern_exec.c#L4078)에도
privileged 소속 또는 Apple entitlement 검사가 있다. 이번 EPERM 관찰은 이 source와
일치하지만 관리자 실행·entitlement 부여·다른 kernel의 동작은 시험하지 않았다.

앞선 [launchd 보고서](./2026-10-25-macos-launchd-ownership.md)의 coalition 정적 검토를
일반 사용자 실측으로 보완했다. 생성·배치 거부로 이번 후보 검증을 종료한다. 특권 helper나
다른 실행 환경이 전체 후손 종료를 해결한다고 추정하지 않으며, 검토하지 않은 모든 macOS
해법이 불가능하다고 주장하지 않는다. 설치·권한 계약 변경은 별도 구체적인 설계 판단이
필요하다. 현재 검증된 backend 후보가 없으므로 제품 연결과 macOS 지원 선언은 보류한다.

## Conclusion

현재 시험 환경에서 일반 사용자 coalition 제어 경로를 사용할 수 없음을 확인했다.
기술 검증의 이 범위는 완료했으며, macOS backend와 실제 client A→Z·장시간·취소 인수는
기존 제안서의 미완료 항목으로 유지한다.

## Review Checklist

- [x] 양쪽 실제 macOS에서 조회·상속·대조군과 생성/배치 거부를 구분했다.
- [x] 기존 coalition에 종료 요청을 보내지 않고 모든 대조군 자식을 수거했다.
- [x] 생성 실패로 미실행인 전체 종료를 PASS로 표시하지 않았다.
- [x] source/hash·ABI 근거·지원 한계와 최신 제안서 상태를 연결했다.
- [x] Windows payload와 기존 private 변경을 보존했다.
