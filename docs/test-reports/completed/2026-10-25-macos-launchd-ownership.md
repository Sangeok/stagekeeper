---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "standard"
test-levels: ["static", "contract", "integration"]
test-tools: ["Node.js", "Clang", "launchd", "Darwin kqueue", "libproc", "GitHub Actions"]
created-at: "2026-10-25"
completed-at: "2026-10-25"
last-executed-at: "2026-10-25T05:50:09Z"
tested-revision: "ab2fbaef023ed0e37215c047e6444238f00b963e"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md", "docs/test-reports/active/dual-client-runtime-report.md", "https://github.com/Sangeok/stagekeeper/pull/227"]
primary-area: "harness/macos-launchd-ownership"
observed-environments: ["CI | macOS 15 arm64 and x64 | Darwin 24.6.0; SDK 15.5; Node 22.23.2 | ordinary user; user and GUI launchd domains", "local | Windows repository checks | Node 22.13.1 | no native macOS execution"]
test-summary: "pass: launchd lifecycle counterexamples reproduced in 20 combinations and 88 monitored fixture processes exited; production descendant ownership remains blocked"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md"]
---

# launchd의 서비스 종료와 분리된 후손의 실제 수명 검증

## Summary and Decision

macOS arm64/x64 각각에서 `user`·`gui` 영역의 다섯 시나리오를 실행했다. 20개 조합 모두
서비스 루트와 같은 그룹의 자식은 종료됐지만, 새 세션의 후손은 `bootout` 이후에도
생존했다. 기본 네 시나리오는 2개, 중지와 자식 생성을 함께 요청한 시나리오는 3개가
남았다. 따라서 **검증한 launchd job 수명과 제거를 전체 후손 quiescence로 사용할 수 없다.**

이 PASS는 반례와 시험 정리의 성공이다. 관찰 대상 88개 프로세스의 실제 종료 이벤트,
중간 부모의 waitpid, 20개 임시 서비스 제거를 확인했다. 제품 backend·Windows 0.5.23
payload·원본 파일 권한·client 인증은 변경하지 않았다. 전체 제안서는 pending/blocked다.

## Scope and Criteria

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 확인 기준 |
| --- | --- | --- | --- |
| R1 | [프로토콜](../../architecture/protocol.md)의 전체 종료·ownership 계약 | launchd 서비스와 후손의 수명 | 서비스 종료·제거와 후손 종료를 따로 관찰 |
| R2 | [resident 계획](../../proposals/active/codex-resident-runner-plan.md)의 macOS 경계 | 종료·중지·timeout·강제 종료·fork 요청 | 두 아키텍처의 실제 kernel과 user/gui 영역 |
| R3 | [최소 설치 계약](../../architecture/README.md) | 후보 선택과 남은 대안 | 권한·설치 요구와 미검증 조건을 명시 |

## Test Target

기준 dev는 `9381e3c21dde2502a4375f31f466ef42327d8240`, 최종 probe source는
`ab2fbaef023ed0e37215c047e6444238f00b963e`다.
[native fixture](../../../scripts/macos/probe-launchd-ownership.c),
[실행기](../../../scripts/macos/probe-launchd-ownership.mjs),
[macOS CI](../../../.github/workflows/macos-runtime-contracts.yml)를 함께 검증했다.
source/binary hash와 kernel·SDK·Node 버전은 관찰 JSON에 보존한다.

## Preconditions and Test Data

일반 사용자로 owned 임시 디렉터리에 plist를 만들고 UUID label의 서비스만 등록했다.
`user/<uid>`에는 `Background`, `gui/<uid>`에는 `Aqua`를 명시했다. GUI 영역은 존재 여부를
확인하며, 이번 두 runner에는 모두 있었다. system domain·LaunchAgents 설치 폴더는
사용하지 않았다. `RunAtLoad:true`, `KeepAlive:false`, `AbandonProcessGroup:false`,
`ExitTimeOut:1`을 사용했다. bootstrap은 절대 plist 경로를 받는다.

서비스 루트, 같은 그룹의 자식, double-fork와 setsid로 분리한 후손 두 개가 시험용
Unix socket으로 신원을 전달한다. PID와 birth identity를 대조해 NOTE_EXIT monitor를
등록한 뒤에만 대기 장벽을 해제한다. 이 협조적 oracle은 관찰·정리를 위한 fixture다.
임의 제품 명령의 소유권 추적 방식으로 사용하지 않는다.

`fork-during-bootout`은 launchctl bootout 프로세스를 시작한 뒤 이미 분리된 후손에게
추가 fork 두 개를 요청한다. 실제 kernel syscall의 동시 실행이나 정확한 선후관계는
증명하지 않는다. 증거 필드도 `forksRequestedAlongsideBootout`으로 기록한다.
이 실행 순서에서 서비스 제거와 후손 생성 요청이 함께 진행되고 새 후손이 살아남음을
검증한다. 모든 가능한 fork 경쟁 순서를 검사했다고 주장하지 않는다.

서비스 루트·동일 그룹 자식의 종료 뒤 detached survivor의 birth identity와 그룹을
다시 확인한다. 후손은 시험용 socket EOF로 정리하고, 등록한 모든 NOTE_EXIT를 받은 뒤
해당 label의 명시적인 서비스 부재 응답과 원래 domain의 정상 조회를 함께 확인한다.
일반적인 조회 오류를 서비스 삭제로 판정하지 않는다. 각 중간 부모는 waitpid로 수거한다. 실패 경로에는 controller의
25초·worker의 30초 alarm과 finally의 해당 label bootout이 있으며, 실패한 디렉터리는
성공 증거 없이 삭제하지 않는다. 이것은 제품 helper의 kill-on-close 보장이 아니다.

## Test Cases and Results

각 행은 arm64/x64 × user/gui의 네 조합에서 실행했다.

| ID | 기준 | 시나리오 | 실제 관찰 | 판정 |
| --- | --- | --- | --- | --- |
| T1 | R1/R2 | 자연 루트 종료 후 bootout | root·같은 그룹 자식 종료, 분리된 후손 2개 생존 | PASS: 반례 |
| T2 | R1/R2 | 서비스 루트에 launchctl kill SIGKILL | root·같은 그룹 자식 종료, bootout 후 후손 2개 생존 | PASS: 반례 |
| T3 | R1/R2 | launchctl bootout | 서비스 제거·root·같은 그룹 자식 종료, 후손 2개 생존 | PASS: 반례 |
| T4 | R1/R2 | SIGTERM 무시 후 ExitTimeOut 1의 bootout | SIGTERM 후 root 생존 확인, 이후 root·같은 그룹 자식 종료, 후손 2개 생존 | PASS: 반례 |
| T5 | R1/R2 | bootout 요청과 추가 fork 요청 | 등록 대상 6개 중 detached survivor 3개, 서비스 제거 확인 | PASS: 반례 |
| T6 | R1 | fixture cleanup | 아키텍처별 44개, 총 88개 등록 대상의 종료 이벤트; 서비스 20개 부재 | PASS |

강제 종료 대상은 생성한 서비스 루트다. OS의 launchd 데몬 자체를 종료하지 않았다.
timeout에서 최종 root 종료 signal을 따로 계측하지 않았으므로 그 signal 번호를
확정하지 않는다. 이 시험은 sandbox 파일/네트워크 경계나 실제 Codex 역할 인수가 아니다.

## Commands and Static Checks

- macOS: `node scripts/macos/probe-launchd-ownership.mjs "$RUNNER_TEMP/launchd-ownership.json"`.
- native fixture는 `xcrun clang -std=c11 -Wall -Wextra -Werror`로 빌드하고 plist는 plutil로 검사한다.
- 로컬: 대상 JavaScript 구문·ESLint, check 194 PASS / 3 SKIP, fsd/server 검사,
  architecture 148 PASS / 2 SKIP, production build PASS.
- source [check CI](https://github.com/Sangeok/stagekeeper/actions/runs/40166924251)와
  [native·공통 계약 CI](https://github.com/Sangeok/stagekeeper/actions/runs/40166924217)의 최종 상태는
  [source-basis](../assets/2026-10-25-macos-launchd-ownership/source-basis.json)에 기록한다.
  두 workflow는 PASS이며, 공통 런타임 계약은 각 아키텍처 529 PASS / 20 SKIP다.
- 문서 155개·상대 링크 700개·보고서 46개 검사와 aggregate report 구조 검사 PASS.

## Evidence Registry

| ID | 증거 | 보존 위치 |
| --- | --- | --- |
| E1 | arm64의 두 영역·다섯 시나리오 | [macos-arm64.json](../assets/2026-10-25-macos-launchd-ownership/macos-arm64.json) |
| E2 | x64의 두 영역·다섯 시나리오 | [macos-x64.json](../assets/2026-10-25-macos-launchd-ownership/macos-x64.json) |
| E3 | source·CI·실패 이력·검사 | [source-basis.json](../assets/2026-10-25-macos-launchd-ownership/source-basis.json) |

공개 JSON에는 고정 결과·count·duration·hash만 남기고 실제 PID·사용자 경로·서비스 UUID·
인증 정보·private template은 넣지 않는다. 로컬 원본 로그에는 GitHub runner의 시험 경로가
포함될 수 있으며 공개 JSON으로 복사하지 않는다.

## Findings and Follow-up

첫 source `53b91bb`은 bootstrap 실패에서 멈췄고 종료 코드를 기록하지 못했다.
`23009db`은 절대 plist 경로에서도 두 아키텍처 모두 bootstrap exit 5를 기록했다.
`754ddf3`에서 세션 유형을 맞춘 뒤 native 20조합이 통과했다. 해당 workflow의 후속 공통
시험은 다음 commit push로 취소됐으므로 전체 workflow PASS로 세지 않는다. 최종 source는
동시 요청과 실제 kernel 순서를 구분하고, 서비스 부재와 domain의 정상 조회를 각각
검증하도록 증거 필드와 assertion을 보강했다.

Apple DTS는 LaunchAgent의 [기본 세션 유형이 Aqua임을 설명한다](https://developer.apple.com/forums/thread/783780).
명시적 Background/Aqua 분기는 이번 CI에서 등록 거부를 해소했다. 절대 경로 변경만으로
해결됐다고 주장하지 않는다. 실패 이력은 제품 종료 결함과 fixture 등록 문제를 구분한다.

| 후보 | 확인된 근거 | 설치·권한 및 남은 조건 |
| --- | --- | --- |
| 일반 권한 launchd job | 이번 20조합에서 서비스 제거 후 detached survivor 확인 | 조사한 설정은 전체 후손 소유권 경계로 부적합 |
| kqueue·PID polling | [앞선 실제 반례](./2026-10-25-macos-descendant-ownership.md) | 반복 횟수 확대만으로 전체 후손 보장을 만들 수 없음 |
| privileged helper·coalition | XNU [종료 요청](https://github.com/apple-oss-distributions/xnu/blob/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/osfmk/kern/coalition.c#L2179)은 요청 flag를 세우고 active_count가 0일 때 종료/알림을 처리한다. 해당 함수는 살아 있는 task를 일괄 kill하지 않는다. | 앞선 보고서의 privileged coalition 제약도 존재. 권한 추가만으로 해결된다는 근거가 없고 지원 API·전체 종료·배포 계약의 별도 검증 필요 |
| Endpoint Security | 앞선 보고서의 Apple entitlement·root 요구 | 관찰 이벤트를 atomic containment로 간주하지 않음. 승인·서비스 설치와 helper death 시 종료 근거 미확보 |
| 자식 생성 금지 실행 | fork 허용 계약을 줄이면 검사 대상 자체가 바뀜 | npm/build/test의 일반적인 자식 실행을 보존하는 대안이 아님. 기능 범위 변경 검토 필요 |
| 별도 VM·실행 호스트 | 이번에는 실행하지 않은 구조 후보 | macOS 명령의 호환성, 파일·인증·네트워크 격리, 전체 종료, 설치·업데이트·용량·복구를 별도로 입증해야 함. 현재 지원 가능한 해결책으로 선정하지 않음 |

coalition 조사는 고정 upstream source에 대한 정적 확인이며 CI kernel의 정확한 source나
실제 privileged API 실행 증거가 아니다. 아직 검토하지 않은 모든 macOS 해법을 배제하지
않는다. 다음 단계는 제품 설치 조건을 보존하는 OS 실행 경계의 지원 근거와 가능성 검증이다.
설치·권한·명령 호환성을 바꾸는 후보는 구현 전에 구체적인 별도 설계로 검토한다.
이번 결과에 맞춰 ownership·quiescence 조건을 낮추거나 backend를 연결하지 않는다.

## Conclusion

launchd의 문서상 한계를 실제 user/gui lifecycle 20조합에서 확인했다. 동일 그룹 정리와
서비스 제거는 동작하지만 분리된 후손의 전체 종료는 보장하지 못했다. fixture는 모두
정리했고, 제품 backend와 인증 A→Z·장시간/취소 인수는 여전히 pending/blocked다.

## Review Checklist

- [x] 두 아키텍처·두 실행 영역·다섯 시나리오를 직접 실행했다.
- [x] 동일 그룹 양성 대조와 detached survivor를 분리해 관찰했다.
- [x] 동시 요청과 정확한 kernel 이벤트 순서를 구분했다.
- [x] 서비스 제거와 전체 fixture 종료를 각각 확인했다.
- [x] 초기 등록 실패와 중간 workflow 취소 이력을 보존했다.
- [x] Windows payload와 사용자 private 변경을 보존했다.
- [x] 문서 검사와 aggregate report 구조 검사를 통과했다.
- [ ] 제품 전체 후손 소유권과 실제 macOS client 인수를 완료한다.
