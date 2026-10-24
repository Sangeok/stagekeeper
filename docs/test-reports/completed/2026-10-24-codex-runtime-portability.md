---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "standard"
test-levels: ["static", "component", "contract", "integration", "manual"]
test-tools: ["Node.js test runner", "PowerShell", "Codex CLI", "Claude Code CLI", "GitHub Actions", "Seatbelt"]
created-at: "2026-10-24"
completed-at: "2026-10-24"
last-executed-at: "2026-10-24T09:49:36Z"
tested-revision: "7da33e96bfc5379830a8aba62aadff9ca76d863d"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md", "docs/test-reports/active/dual-client-runtime-report.md", "https://github.com/Sangeok/stagekeeper/pull/224"]
primary-area: "harness/runtime-portability"
observed-environments: ["local | Windows installed-version rehearsal | bundled Node 22.23.3; plugin 0.5.21 and 0.5.22 | isolated client profiles and loopback fixture", "CI | macOS 15 arm64 and x64 native feasibility probe | Node 22.23.2; Darwin 24.6.0 | GitHub-hosted runners without client credentials"]
test-summary: "pass: 정제된 실패 진단, 실제 양쪽 client 업데이트와 같은 PC의 버전 간 인계; macOS 권한 시험과 process-group 종료의 반례 확인. macOS 제품 backend·전체 출시 인수는 미완료"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md"]
---

# 런타임 진단·설치 버전 인계·macOS 종료 경계 검증

## Summary and Decision

0.5.22는 native helper 응답 실패와 손상된 resident 상태의 진단을 보강한다. 고정 실패
경계·단계·숫자 코드만 출력하며 stderr 원문·경로·토큰·상태 내용은 반영하지 않는다.
종료 acknowledgement가 없으면 ownership을 보존하고, 손상 상태는 덮어쓰지 않는다.
과거 `validation-profile` 진단 누락과 별도 `corrupt-state`의 원인은 여전히 미확정이다.

Codex와 Claude의 실제 격리 설치에서 0.5.21 → 0.5.22 업데이트와 전체 inventory를
확인했다. 같은 PC의 양방향 session 인계 및 Claude idle resident 중지 계약을 통과했다.
실제 혼합 호스트·Codex 모델 resident 인수를 이 결과로 대체하지 않는다.

macOS arm64/x64에서 부모·자식의 파일/네트워크 차단은 통과했지만, 분리된 자식은
부모 프로세스 그룹을 종료한 뒤에도 살아남았다. 이는 검사기의 예상 반례이며 제품의
quiescence 계약은 **BLOCKED**다. 새 production backend를 연결하거나 권한을 완화하지 않았다.

## Scope and Criteria

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | [프로토콜](../../architecture/protocol.md), ownership/ack 계약 | Windows 실패 진단 | 원문 비노출·기존 보존 정책 유지 | 실제 helper fault 주입, 상태 불변 |
| R2 | [후속 계획](../../proposals/active/codex-dual-client-runtime-follow-ups.md), C0/C4C | 현재 PC 설치·업데이트·버전 간 중지 | 같은 PC의 모델 없는 계약 시험 | 전체 해시, 양방향 인계, successor 보호 |
| R3 | [resident 계획](../../proposals/active/codex-resident-runner-plan.md), macOS 경계 | native backend의 가능성 조사 | 반례 검출은 제품 지원 인증이 아님 | 권한 상속, detached 자식 생존 검출·정리 |

## Test Target

- 기준 dev는 `e85430eb04edcf656f7cc34f9239d506206646d8`, 제품 source는 `f345d0096370316c9c9114d45e0c43c9276cc8b5`다. 이후 commit은 시험 도구·CI·문서만 변경한다.
- 새 후보는 0.5.22, 2,231개 파일, SHA-256 `d2ba0a9d492f4634087dd1569411e974d9c7ee6c5d5e6733676e7becf3215a19`다. 현재 shipped source 64개도 바이트 단위로 일치한다.
- 이전 실제 설치 manifest는 `93f0f543c998a3f79b5842ef865551860a09fbbb`다. 이전 source-locked `893a24e7f1e4d5361727aa24724be3f9f8bc3503`와 동일 payload라는 구분은 [앞선 보고서](./2026-10-24-codex-runtime-stability.md)를 유지한다.
- Node가 설치된 현재 Windows PC다. client와 helper PATH에서 전역 Node를 제외했으며 물리적인 clean host가 아니다.
- macOS probe는 시험용 Node 복사본·고정 스크립트·합성 canary만 사용한다. 실제 계정 인증·private template·모델·제품 backend는 사용하지 않는다.

## Preconditions and Test Data

별도 `CODEX_HOME`·`CLAUDE_CONFIG_DIR`과 로컬 marketplace에서 실제 client CLI의 설치/업데이트를
실행했다. Codex App Server의 skill 목록에서 다섯 스킬의 단일 경로를 확인했다. 기본 사용자
설정·로그인·인증 파일은 복사하거나 변경하지 않았다. 별도 Git fixture와 loopback 서버는
합성 토큰·빈 작업 목록만 사용했다. 원본 private 미커밋 네 파일의 해시는 작업 전과 동일하다.

macOS의 좁은 read allowlist는 처음에 loader 단계 `SIGABRT`를 냈다. 양쪽 OS crash report는
namespace `0x23`, code 2였고, 동일 실행 파일은 sandbox 밖에서 시작됐다. 시스템 실행 권한
보완 후에도 실패했으며, 마지막 변경인 `/` 자체의 읽기 허용을 추가한 후보에서 시험이
실행됐다. 이는 하위 디렉터리 전체 읽기 허용이 아니다. namespace 해석은
[Apple 정의](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/sys/reason.h), loader/platform
권한 검토는 [OpenAI의 platform policy](https://github.com/openai/codex/blob/main/codex-rs/sandboxing/src/seatbelt_read_only_platform_defaults.sbpl)를 참고했고 판정은 실제 CI 관찰에 근거한다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | spawn/exit/ack JSON·shape·timeout 주입 | 정제 진단, 미확인 settle 없음 | 집중 7개 및 전체 회귀 PASS, E1 | PASS |
| T2 | R1 | required | malformed JSON·schema·쓰기 실패와 CLI 거부 | 원본 상태·reason 계약 보존, client/request 0 | PASS, E1 | PASS |
| T3 | R2 | required | 실제 Codex·Claude 설치/업데이트 | 0.5.22 전체 inventory 일치 | 양쪽 2,231개 PASS, E2 | PASS |
| T4 | R2 | required | 이전/새 버전 양방향 session·resident | 충돌·미확인 종료 거부, successor 보존 | 38개 helper 명령, 양방향 PASS, E3 | PASS |
| T5 | R3 | required | native 부모·자식 파일·TCP loopback·환경 경계 | allowed read/write 및 네 경로 read/write 거부 | arm64/x64 PASS, E4 | PASS |
| T6 | R3 | required | detached 자식과 부모 그룹 종료 | 반례를 검출하고 소유 프로세스 정리 | 양쪽 생존 검출 후 정리 PASS, E4 | PASS |
| T7 | R3 | informational | macOS 제품의 전체 자식 종료 보장 | detached 자식까지 포함하는 quiescence ack | process-group 방식 불충분, backend 미구현, E4 | BLOCKED |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R1/R2 | required | `npm run check` | lint·type·script 실패 0 | 194 PASS / 3 SKIP, E5 | PASS |
| C2 | R1 | required | serial core/plugin test suite | 실패 0 | 544 PASS / 2 SKIP, E5 | PASS |
| C3 | R1/R2 | required | `verify:fsd`, `verify:server`, `test:architecture`, `build` | 경계·build 오류 0 | PASS; architecture 148 PASS / 2 SKIP, E5 | PASS |
| C4 | R2 | required | `verify:plugin-version -- --base origin/dev --head HEAD` | 양쪽 manifest 상승 | 0.5.21 → 0.5.22, shipped 7개 변경 PASS, E5 | PASS |
| C5 | R1/R2/R3 | required | PR check·Windows native·macOS CI | 최종 source 전 job success | 최종 CI 확인 중, E5 | NOT RUN |

재현 도구는 [버전 인계](../../../scripts/windows/rehearse-plugin-version-handoff.mjs)와
[macOS native probe](../../../scripts/macos/probe-seatbelt-containment.mjs)다. Windows는
검증된 `--previous`·`--current` 설치 경로와 새 `--output` 디렉터리를, macOS는 새 JSON 출력
경로를 받는다. macOS CI의 성공은 반례 검출까지 성공했다는 뜻이며 지원 인증이 아니다.

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | 진단·실패 이력 | [고정 진단과 개발 실패](../assets/2026-10-24-codex-runtime-portability/failures.json) | 정제된 원인·횟수만 repo 보존 |
| E2 | 실제 client 업데이트 | [설치 관찰](../assets/2026-10-24-codex-runtime-portability/windows-update.json), [source/payload](../assets/2026-10-24-codex-runtime-portability/source-basis.json) | 버전·해시·개수만 repo 보존 |
| E3 | 동일 PC 버전 인계 | [양방향 결과](../assets/2026-10-24-codex-runtime-portability/windows-handoff.json) | session ID·토큰·실제 경로 제외 |
| E4 | native macOS 가능성·반례 | [arm64](../assets/2026-10-24-codex-runtime-portability/macos-arm64.json), [x64](../assets/2026-10-24-codex-runtime-portability/macos-x64.json) | 고정 경계·판정·hash만 repo 보존 |
| E5 | 회귀·최종 CI | [검사 결과](../assets/2026-10-24-codex-runtime-portability/checks.json) | source·명령·CI link 보존 |

## Findings and Follow-up

첫 회귀의 두 실패는 새 모듈을 복사하지 않은 fixture였으며 보완 후 전체 검사가 통과했다.
버전 인계의 첫 시도는 detached resident가 잡은 출력 pipe의 close를 기다렸다. 소유한
resident를 정상 중지하고 파일 출력으로 바꾼 뒤 전체 시나리오를 다시 통과했다. 제품의
잠금 정책·helper 응답을 완화하지 않았다. 시험 뒤 소유한 프로세스·lock·guard·listener는 0이다.

Windows CI 40083489330에서는 기존 resident stop 시험이 한 번 `stopping` 대신 `error`를
받았다(40 PASS / 1 FAIL). 당시 단언에 거부 코드가 없어 원인은 확정하지 못했다. 실패 시
응답과 정제된 상태 진단을 남기도록 보강했고 bundled Node의 동일 시나리오 20회는 모두
통과했다. 재현되지 않았다는 사실을 원인 해결로 바꾸지 않으며 재발 시 해당 진단으로 추적한다.

다음 macOS 작업은 세션/프로세스 그룹을 바꾼 자식을 포함해 모든 소유 프로세스를 추적·종료하고
종료 완료를 입증하는 supervisor/backend 설계다. 단순 PGID kill이나 일시적인 PID 목록
스캔만으로 acknowledgement를 발급하지 않는다. 명령 실행·Node/npm 패키징·scoped Git·
fresh role/main-loop 연결, 실제 기존 인증 A→Z·취소·장시간 인수까지 별도로 필요하다.
현재 probe의 합성 경로·TCP·환경 검사는 완전한 production sandbox 인증이 아니다.

## Conclusion

진단과 현재 Windows 설치·인계 범위는 통과했다. 새 0.5.22의 실제 모델 A→Z와 110분 idle은
이번에 다시 실행하지 않았으며 이전 0.5.21 결과를 새 payload의 인증으로 바꾸지 않는다.
물리적 clean Windows, macOS backend·실제 모델 인수, 혼합 host와 출시 gate는 남아 있다.
전체 제안서는 pending/blocked이며 전체 reconciliation clean pass를 주장하지 않는다.

## Review Checklist

- [x] 새 진단과 과거 원인 미확정을 구분했다.
- [x] 실제 설치·같은 PC의 계약·실제 혼합 host를 구분했다.
- [x] macOS native 반례와 제품 지원 판정을 분리했다.
- [x] 제품 source·시험 도구 revision·설치 manifest/payload를 구분했다.
- [x] 사용자 private 변경과 이전 실패 이력을 보존했다.
