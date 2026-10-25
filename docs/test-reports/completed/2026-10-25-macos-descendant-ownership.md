---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "standard"
test-levels: ["static", "contract", "integration"]
test-tools: ["Node.js", "Clang", "Darwin kqueue", "libproc", "GitHub Actions"]
created-at: "2026-10-25"
completed-at: "2026-10-25"
last-executed-at: "2026-10-25T05:03:11Z"
tested-revision: "e69fdd24556c7dadcf3d2ec8951ac6f05ebfd99f"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md", "docs/test-reports/active/dual-client-runtime-report.md", "https://github.com/Sangeok/stagekeeper/pull/226"]
primary-area: "harness/macos-descendant-ownership"
observed-environments: ["CI | macOS 15 arm64 and x64 native kernel | Darwin 24.6.0; SDK 15.5; Node 22.23.2 | ordinary user; no client credentials", "local | Windows repository validation | Node 22.13.1 | native macOS probe refuses execution"]
test-summary: "pass: macOS recursive tracking and PID snapshot counterexamples reproduced and owned fixtures exited; production descendant ownership remains blocked"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md"]
---

# macOS 자식 소유권 API의 실제 한계 검증

## Summary and Decision

macOS 15 arm64/x64 모두 `NOTE_TRACK` 등록을 `ENOTSUP(45)`로 거부했다. 일반
`NOTE_FORK`는 4회의 fork를 부모 이벤트 1개로 합치며 자식 PID를 전달하지 않았다.
부모의 실제 종료, 출력 pipe EOF, 빈 자식 PID 조회가 모두 확인된 뒤에도 분리된
orphan 4개가 살아 있었다. 자연 종료와 그룹 SIGKILL에서 각각 재현했다.

이 보고서의 PASS는 예상 반례를 탐지하고 시험 프로세스를 종료했다는 뜻이다.
**제품의 descendant ownership·quiescence는 BLOCKED**다. Windows 0.5.23 payload,
실행 권한, 잠금 반납 계약은 변경하지 않았으며 macOS backend를 연결하지 않았다.

## Scope and Criteria

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 확인 기준 |
| --- | --- | --- | --- |
| R1 | [프로토콜](../../architecture/protocol.md)의 실제 종료·ownership 계약 | macOS 종료 근거 후보 | 등록한 부모의 종료와 전체 후손 종료를 구분 |
| R2 | [resident 계획](../../proposals/active/codex-resident-runner-plan.md)의 macOS 경계 | 재귀 추적·fork/exit 경쟁 | 커널 API를 실제 호출하고 유효한 경쟁 순서를 재현 |
| R3 | [최소 설치 계약](../../architecture/README.md) | 대안 선택 | 요구 권한·설치 변경을 숨기지 않고 제품 지원을 유보 |

## Test Target

기준 dev는 `6d6db1b19364524fd71cd22303ec1fc4ddd1de60`, native 시험 source는
`e69fdd24556c7dadcf3d2ec8951ac6f05ebfd99f`다.
[C fixture](../../../scripts/macos/probe-descendant-ownership.c)와
[실행기](../../../scripts/macos/probe-descendant-ownership.mjs)를
[macOS workflow](../../../.github/workflows/macos-runtime-contracts.yml)가 두 아키텍처에서 실행한다.
관찰에는 source/binary SHA-256, 실제 kernel·SDK·Node 버전을 포함한다.

## Preconditions and Test Data

root가 아닌 CI 사용자로 실행했다. 고정 native fixture만 fork하며 모델·인증·실제
프로젝트 명령은 실행하지 않는다. 부모 monitor를 먼저 등록한 뒤 pipe barrier로
fork를 허용한다. 중간 부모는 후손을 만든 직후 종료하고, 후손은 새 세션으로 분리된다.
부모가 종료될 때까지 monitor의 이벤트 회수를 늦춰 유효한 스케줄링 순서를 고정한다.
반복 횟수나 빠른 polling으로 경쟁이 없다고 추정하지 않는다.

후손 신원은 시험 전용 별도 pipe로 받는다. 이 oracle은 PID·birth identity 대조와
cleanup에만 사용하고 kqueue가 발견한 후손으로 세지 않는다. 알려진 후손 PID에
종료 monitor를 등록한 뒤 cleanup lease를 닫고 4개의 실제 NOTE_EXIT를 확인한다.
실패 시에도 lease EOF와 후손 자체의 20초 alarm이 fixture 수명을 제한한다.
그 협조 동작을 임의 제품 명령의 kill-on-close 보장으로 사용하지 않는다.

## Test Cases and Results

| ID | 기준 | 시험 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- |
| T1 | R2 | NOTE_TRACK 등록 | 두 아키텍처, 두 시나리오 모두 ENOTSUP 45 | PASS: 후보 부적합 확인 |
| T2 | R1/R2 | 일반 부모 monitor 양성 대조 | 등록 성공, NOTE_FORK와 NOTE_EXIT 수신 | PASS |
| T3 | R1/R2 | 부모 자연 종료·EOF·빈 PID snapshot | 분리된 orphan 4개 생존, 자식 identity 없는 부모 이벤트 1개 | PASS: 반례 확인 |
| T4 | R1/R2 | 부모 그룹 SIGKILL·EOF·빈 PID snapshot | 분리된 orphan 4개 생존, 자식 identity 없는 부모 이벤트 1개 | PASS: 반례 확인 |
| T5 | R1 | oracle로 알려진 후손 monitor·cleanup | 시나리오별 4개 종료 이벤트, 아키텍처별 8개 후손 모두 종료 | PASS |
| T6 | R2 | 현재 Windows에서 native 실행 시도 | 실제 macOS kernel 요구 오류, 증거 JSON 미생성 | PASS |

T3/T4는 두 아키텍처에서 각각 수행했다. 전체 임의 프로그램·모든 경쟁 순서의
인수 시험이 아니라, 해당 후보 방식의 보편적인 종료 보장을 반증하는 구체적 실행이다.

## Commands and Static Checks

- macOS: `node scripts/macos/probe-descendant-ownership.mjs "$RUNNER_TEMP/descendant-ownership.json"`.
- 실행기는 `xcrun clang -std=c11 -Wall -Wextra -Werror`로 빌드하며 새 증거 경로만 허용한다.
- Windows: 구문·대상 ESLint, `npm run check` 194 PASS / 3 SKIP,
  `verify:fsd`, `verify:server`, `test:architecture` 148 PASS / 2 SKIP, production build PASS.
- source CI의 전체 check는 [40164085189](https://github.com/Sangeok/stagekeeper/actions/runs/40164085189),
  native·공통 계약은 [40164085054](https://github.com/Sangeok/stagekeeper/actions/runs/40164085054)로 모두 PASS다.
  공통 런타임 시험은 두 아키텍처 각각 529 PASS / 20 SKIP다.
  최종 상태와 source 연결은 [source-basis](../assets/2026-10-25-macos-descendant-ownership/source-basis.json)에 기록한다.

## Evidence Registry

| ID | 증거 | 보존 위치 |
| --- | --- | --- |
| E1 | arm64 실제 native 관찰 | [macos-arm64.json](../assets/2026-10-25-macos-descendant-ownership/macos-arm64.json) |
| E2 | x64 실제 native 관찰 | [macos-x64.json](../assets/2026-10-25-macos-descendant-ownership/macos-x64.json) |
| E3 | 기준 commit·CI·공식 source identity | [source-basis.json](../assets/2026-10-25-macos-descendant-ownership/source-basis.json) |

관찰 JSON에는 사용자 경로·토큰·private source·모델 대화를 넣지 않았다. 공식 Apple
source는 아래 고정 commit 링크로 인용하며 공개 저장소에 원문 복사본을 추가하지 않는다.

## Findings and Follow-up

| 후보 | 근거와 한계 | 현재 판단 |
| --- | --- | --- |
| kqueue 재귀 추적 | Apple [event.h](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/sys/event.h#L362)와 [filt_procattach](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/kern/kern_event.c#L1098)는 NOTE_TRACK 계열의 미지원·ENOTSUP을 명시한다. E1/E2에서 실제 확인했다. | 제외 |
| fork 알림 + 반복 PID scan | E1/E2의 합쳐진 알림·신원 부재·orphan 반례. birth identity는 이미 발견한 PID의 재사용을 구분할 뿐 누락된 자식을 발견하지 못한다. | 전체 종료 ack 근거로 제외 |
| launchd 기본 그룹 정리 | Apple 공개 [launchd.plist 매뉴얼](https://github.com/apple-oss-distributions/launchd/blob/d448a1c8f70a61202f8705f94337f686b87c30c4/man/launchd.plist.5#L364)의 계약은 같은 process group이다. 이 자료는 현행 launchd 전체 동작을 실제 시험한 결과가 아니다. | 이 문서상 계약만으로 채택 불가 |
| XNU coalition | [sys_coalition.c](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/bsd/kern/sys_coalition.c#L220)는 privileged coalition 소속을 요구한다. 커널 내부 interface의 존재가 일반 plugin의 지원 API·전체 종료 증거는 아니다. 실제 생성·종료 시험은 하지 않았다. | 적용 가능한 지원 경로 미확정 |
| Endpoint Security | Apple의 [entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.endpoint-security.client) 승인 및 [root 권한](https://developer.apple.com/documentation/endpointsecurity/es_new_client_result_err_not_privileged)이 필요하다. 이벤트 관찰이 전체 종료 보장이라는 증거도 없다. | 현행 plugin 설치만으로 바로 채택 불가 |
| fork 전체 금지 또는 협조적 wrapper | 임의 npm/build/test 도구의 자식 실행 계약을 충족하지 않거나, 코드가 협조하지 않을 때의 보장이 없다. | 기존 제품 계약의 해결책으로 채택 불가 |

고정 upstream source의 revision이 CI kernel의 정확한 build source와 같다고 주장하지
않는다. 소스 조사와 실행 관찰을 분리하며, 모든 가능한 macOS 해법이 불가능하다고
결론 내리지 않는다. **현재 조사·검증한 범위에서는 설치 계약을 보존하는 적합한
소유권 primitive를 확보하지 못했다.**

다음 구현의 선행 조건은 실행 전 자식 등록, fork/exec/setsid 이탈 방지 또는 원자적
소유권 상속, helper 비정상 종료 시 전체 실행 중단, 재사용 안전한 신원과 전체 종료
관찰, reader EOF 및 nonce ack를 한 경계에서 보장하는 지원 메커니즘이다.
그 메커니즘을 두 아키텍처에서 stop·timeout·helper 강제 종료·fork 경쟁까지 검증한
뒤 command/scoped Git/runtime packaging을 연결한다. privileged broker나 별도 격리
환경이 필요하다면 설치·권한·운영 계약을 먼저 별도 제안으로 검토해야 한다. 이번 작업은
그 변경을 승인하거나 설치하지 않았다. PID polling의 횟수를 늘리는 후속 구현은 하지 않는다.

## Conclusion

소유권 후보 API의 반례와 bounded fixture cleanup은 두 아키텍처에서 확인했다.
macOS 제품 backend·인증 A→Z·장시간/취소 인수와 전체 제안서는 pending/blocked다.
앞선 [Seatbelt 권한 상속 시험](./2026-10-24-codex-runtime-portability.md)은 별도 범위의
증거로 유지한다. 이 시험은 권한 sandbox나 제품 lock release를 검증하지 않는다.

## Review Checklist

- [x] 실제 arm64/x64 kernel 실행과 고정 upstream source를 구분했다.
- [x] 양성 대조·구체적 경쟁 순서·oracle 의존성과 cleanup을 기록했다.
- [x] 후보 반례 PASS를 제품 지원 PASS로 확대하지 않았다.
- [x] Windows payload와 사용자 private 변경을 보존했다.
- [x] 문서 154개·상대 링크 683개·보고서 45개 검사와 aggregate report 구조 검사를 통과했다.
- [ ] 적합한 소유권 경계·제품 backend·실제 macOS client 인수를 완료한다.
