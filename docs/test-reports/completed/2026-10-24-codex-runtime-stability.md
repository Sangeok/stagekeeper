---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "standard"
test-levels: ["static", "component", "contract", "integration", "manual"]
test-tools: ["Node.js test runner", "PowerShell", "PostgreSQL", "GitHub Actions"]
created-at: "2026-10-24"
completed-at: "2026-10-24"
last-executed-at: "2026-10-24T08:42:06.415Z"
tested-revision: "2e7996180f910b1a56c236454c8bec000ec24e39"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-resident-runner-plan.md", "docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/test-reports/active/dual-client-runtime-report.md", "https://github.com/Sangeok/stagekeeper/pull/223"]
primary-area: "harness/codex-runtime-stability"
observed-environments: ["local | isolated Windows resident service and database | bundled Node 22.23.3; PostgreSQL 18.6 | disposable owner and agent", "CI | macOS 15 arm64 and x64 common runtime contracts | Node 22.23.2 | GitHub-hosted runners"]
test-summary: "pass: 복구 시험 경계 분리, 최종 0.5.21 payload의 실제 110분 idle·HTTP 집계 및 macOS 양쪽 공통 계약 — 실제 macOS resident와 출시 인수는 제외"
follow-up: ["docs/proposals/active/codex-resident-runner-plan.md", "docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
---

# Codex 런타임 복구 경계와 최종 패키지 장시간 검증

## Summary and Decision

sign-in 복구 시험의 간헐 실패를 재현해 강제 종료 시점이 `watch.guard` 안에 들어가는
경우임을 확인했다. 복구 가능한 종료는 guard 밖에서 결정적으로 재현하고, abandoned
guard는 재시작을 거부하며 상태를 보존하는 별도 시험으로 분리했다. 제품의 guard 복구
정책과 배포 payload는 바꾸지 않았다.

이전 A→Z와 동일한 설치 payload를 실제 110분 동안 실행하며 HTTP heartbeat·poll 수를
수집했다. 관찰·최종 확인까지 6,601초, idle heartbeat·pipeline poll 각 108회가 모두
HTTP 200이었고 모델·AgentRun·사용량 증가는 0이었다. macOS Intel·Apple Silicon의 공통 계약 CI는 각각
521 PASS / 18 SKIP다. 실제 macOS Codex resident, physical clean Windows와 출시 인수를
완료한 것으로 확대하지 않는다.

## Scope and Criteria

범위는 현재 Windows의 복구 회귀·최종 후보 idle, 모델 없는 macOS 계약 CI와 증거 정리다.
실제 모델 A→Z는 앞선 [resident 보고서](./2026-10-24-codex-resident-live.md)의 결과를
참조하며 이번에 다시 실행했다고 주장하지 않는다. 운영 DB·main·공개 패키지는 제외한다.

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | [resident 계획](../../proposals/active/codex-resident-runner-plan.md), C4B lifecycle | sign-in 복구 | abandoned guard의 fail-closed 동작 유지 | 복구 가능한 crash와 guard-busy 분리, 상태 불변 |
| R2 | [후속 인수 계획](../../proposals/active/codex-dual-client-runtime-follow-ups.md), C4C/E12 | 현재 Windows 최종 설치본 | 실제 단일 6600초; heartbeat와 HTTP count 구분 | payload hash, 모델·AgentRun·usage 0, 최근 heartbeat, 정리 |
| R3 | [검증 아키텍처](../../architecture/verification.md) | 회귀·CI·기록 | 공통 계약과 OS native 인수 구분 | required 검사 및 arm64/x64 계약 통과 |

## Test Target

- 작업 시작 기준은 dev `ae6e7d6c1e51bada9959636dc15a749b12dd2b05`다. 변경은 테스트·CI·문서이며 shipped plugin 소스는 그대로다.
- 설치 후보는 미공개 0.5.21, payload 2,229개와 SHA-256 `6bfb3bae8c0aee5ee473a7b9feab5e49df015a93bc38c886afa5a3edd3054b23`다. source-locked manifest는 product source `893a24e7f1e4d5361727aa24724be3f9f8bc3503`를 가리킨다. 설치 manifest의 이전 source metadata와 payload의 동일성은 앞선 보고서 E3를 따른다.
- 실제 HTTP/DB 서비스는 기존 최종 production build를 새 disposable DB에 연결했다. app/server/core/schema/dependency/manifest의 non-test 입력 445개가 현재 source와 동일하다.
- 전역 Node가 있는 현재 PC이며 helper subprocess PATH에서 global Node를 제외했다. physical clean host가 아니다.
- macOS CI는 공개 source와 npm 의존성만 사용한다. client 로그인·모델 호출·private template 없이 실행하며 Windows native 전용 항목은 skip한다.

## Preconditions and Test Data

빈 loopback PostgreSQL cluster와 정확한 DB 이름·port를 검증한 뒤 private source
`7f34e7b0a4e6e302b8559f54ca4894ee78b8964f`의 13개 template와 disposable Max 사용자 하나를
생성했다. 항목은 before-plan gate에서 대기한다. 초기 setup 로그의 fixture 개수 2는 복사된
출력 상수 오류였으며 실제 생성 loop·설정·DB는 하나다. helper의 출력 상수를 수정했다.

loopback relay는 request body를 그대로 전달하고 고정 operation 이름·phase·횟수·status와
소요 시간만 기록한다. 인증값·body·실제 사용자/session ID는 정제된 증거에서 제외한다.
setup·idle·settling·stop을 구분해 첫 시작 요청을 110분 idle count에 섞지 않는다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | 복구 가능 crash·sign-in 및 abandoned guard | 안전 경계별 재시작/거부, 상태 불변 | 최종 full suite의 세 crash case 및 sign-in 20회 PASS, E1 | PASS |
| T2 | R2 | required | 최종 payload의 실제 110분 idle | 동일 payload·모델/AgentRun/usage 0·HTTP count | 6,601초, idle HTTP 216회 모두 200, 증가 0, E2/E4 | PASS |
| T3 | R2 | required | stop과 소유 fixture 정리 | lock/guard/runner 및 disposable rows·listener 0 | 사용자 1명·template 13행 제거, owned lock/guard·row·listener 0, E2 | PASS |
| T4 | R3 | required | macOS arm64/x64 공통 런타임 | 각 OS 실제 실행, fail 0 | 각 521 PASS / 18 SKIP, E3 | PASS |
| T5 | R3 | informational | 이전 native helper 진단 실패 추적 | 반복 시험·passive close/stderr 캡처 | 20회 및 전체 회귀 PASS, 이전 원인 미확정, E1 | PASS |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R3 | required | `npm.cmd run check` | fail 0 | 194 PASS / 3 SKIP, E3 | PASS |
| C2 | R1/R3 | required | `node --test --test-concurrency=1 "packages/core/**/*.test.mjs" "plugin/bin/*.test.mjs" "plugin/runtime/*.test.mjs"` | fail 0 | 537 PASS / 2 SKIP, E3 | PASS |
| C3 | R3 | required | `npm.cmd run verify:fsd`, `npm.cmd run verify:server`, `npm.cmd run test:architecture` | 경계 오류·실패 0 | 두 경계 검사 PASS, 148 PASS / 2 SKIP, E3 | PASS |
| C4 | R3 | required | PR `check`의 static/test/web/server/integration/build | 전 job success | 40072521226 PASS, E3 | PASS |
| C5 | R3 | required | Windows native runtime CI | 실제 격리 command와 network-denied build | 40072521287 PASS, E3 | PASS |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | 복구 재현·반복·native 진단 | [실패와 반복 결과](../assets/2026-10-24-codex-runtime-stability/failures.json) | 정제된 수치·고정 진단만 repo 보존 |
| E2 | 최종 package·idle·HTTP·cleanup | [관찰과 정리](../assets/2026-10-24-codex-runtime-stability/observations.json) | phase별 요청·응답·지연 및 분 단위 timeline; 실제 ID·body 제외 |
| E3 | 로컬 검사·CI | [검사 결과](../assets/2026-10-24-codex-runtime-stability/checks.json), [PR #223](https://github.com/Sangeok/stagekeeper/pull/223), [macOS CI](https://github.com/Sangeok/stagekeeper/actions/runs/40072521340) | repo report와 Actions retention |
| E4 | 후보·source·재사용 build 경계 | [source basis](../assets/2026-10-24-codex-runtime-stability/source-basis.json) | 원본 파일·인증값 없이 hash와 범위만 repo 보존 |

서로 다른 heartbeat timestamp 관찰은 109회이며 startup에서 이미 생긴 첫 timestamp를
포함한다. idle HTTP heartbeat 108회와 같은 수로 취급하지 않는다. setup의 heartbeat·poll
각 1회, stop 1회와 template/project 조회도 E2에서 별도 phase로 기록했다. 단일 실행이며
짧은 시험의 시간을 합산하지 않았다. 관찰 중 30초 간격으로 동일 session·client·mode·
permission·idle 상태, 120초 이내 heartbeat, 모델/AgentRun/usage 0과 child 0을 확인했다.

실패 원본과 helper stdout/stderr는 로컬 evidence에 보존하며 public artifact에는 넣지
않았다. JSON 구조와 문자열을 검사해 token·cookie·개인 경로·실제 계정/session ID 및
private template 본문이 없음을 확인했다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | medium | 임의 강제 종료가 guard 안에 들어가 sign-in 복구 기대와 충돌. 4번째 반복에서 guard-busy를 재현했고 fixture를 분리함, E1 | 본 변경 | 세 경계 case와 sign-in 반복 유지 |
| F2 | medium | 이전 native validation-profile 진단 누락과 별도 corrupt-state는 원인 미확정. 이번 20회 통과는 원인 해결 증거가 아님, E1 | resident 계획 | 재발 시 passive helper close/code/signal 및 stderr 보존 |
| F3 | low | 새 macOS CI 첫 시도는 npm 설치 누락으로 zod import 실패. npm ci를 추가한 양쪽 최종 실행 통과, E3 | macOS workflow | dependency install 후 전체 계약 실행 |
| F4 | blocker | macOS resident에는 Windows command/Git backend 의존이 남음. 공통 CI는 native 권한·종료·로그인 인수를 대체하지 않음 | resident 계획 C4C | backend 계약 구현·OS별 실제 인수 |

## Test Data and Cleanup

정확한 DB 이름·loopback port·cluster 경로와 fixture user·template body identity를
확인한 뒤 disposable 사용자 1명과 template 13행을 제거했다. users/projects/runners/
AgentRuns/templates는 모두 0이며 owned lock/guard도 없다. 소유 PID·port를 확인해
서비스와 PostgreSQL을 종료했고 relay를 포함한 세 listener가 사라졌다.
원본 checkout의 private 수정 네 파일은 byte baseline과 일치한다. 운영 DB는 건드리지
않았으며 원본 로그·격리 DB 파일은 로컬 evidence로 보존한다.

## Conclusion

이 보고서의 모든 required 항목이 통과했다. native 진단의 과거 간헐 실패를 원인 해결로
닫지는 않으며 재발 시 별도 원인 분석을 이어간다. 같은 source에 대한 추가 반복은 필요
없고 runtime 변경 또는 남은 실제 환경 인수 때 새 범위의 보고서를 작성한다.
전체 제안서는 clean Windows·macOS native backend와 실제 실행·혼합 버전 host·출시 gate가 남아
pending/blocked를 유지한다. 전체 reconciliation clean pass를 소급 주장하지 않는다.

## Review Checklist

- [x] lifecycle·revision·시각·scope와 required/informational 판정이 일치한다.
- [x] 모든 기준과 실행 항목에 증거를 연결했고 이전 실패와 최종 통과를 구분했다.
- [x] HTTP count와 heartbeat 관찰 수, 실제 idle와 fake client CI를 구분했다.
- [x] 데이터·프로세스 정리를 확인하고 원본 private 수정과 운영 환경을 보존했다.
- [x] 정제된 artifact의 민감정보를 검토했고 남은 결함·출시 조건은 active 계획에 연결했다.
