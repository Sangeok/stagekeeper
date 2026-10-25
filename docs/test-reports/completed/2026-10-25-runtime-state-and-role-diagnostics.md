---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "standard"
test-levels: ["static", "contract", "integration"]
test-tools: ["Node.js", "Windows PowerShell", "GitHub Actions"]
created-at: "2026-10-25"
completed-at: "2026-10-25"
last-executed-at: "2026-10-25T13:04:49Z"
tested-revision: "0d63e2c6745fee3b4049b118f27b63bbd5a1c016"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md", "docs/test-reports/completed/2026-10-24-codex-final-windows-acceptance.md"]
primary-area: "harness/dual-client-runtime"
observed-environments: ["local | Windows | Node 22.13.1 and bundled Node 22.23.3 | disposable fixtures", "CI | Ubuntu, Windows, macOS 15 arm64 and Intel | source regression checks | no authenticated model acceptance"]
test-summary: "pass: reproduced partial-state reads and missing role diagnostics repaired; historical individual causes and macOS support remain unresolved"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md"]
---

# 상태 조회 경쟁과 역할 도구 실패 진단 수정

## Summary and Decision

writer가 정책을 저장한 뒤 lock을 저장하기 전에 foreground/resident가 guard 없이
두 파일을 읽어 정상 저장을 `corrupt-state`로 오인하는 결함을 재현했다. 조회도 같은
guard를 사용하도록 수정했다. 역할 도구가 실패 원인을 반환만 하고 보존하지 않던 경로도
재현해 고정 원인 코드와 검증된 native helper 진단을 기록하도록 수정했다.

두 회귀는 수정 전 0 PASS/2 FAIL, 수정 후 2 PASS다. 플러그인 후보는 0.5.24다.
이 PASS는 재현한 결함과 검증 범위에 한정한다. 과거 native/state/CI stop 세 건과
관찰이 빠진 실제 role_file_read 한 건의 개별 원인은 여전히 미확정이다. macOS 전체
후손 종료 backend도 미해결이며 전체 제안서의 pending/blocked를 유지한다.

## Scope and Criteria

| 기준 | 요구 동작 |
| --- | --- |
| R1 | 정책·lock의 작성 중간 상태를 읽지 않으며 실제 손상·abandoned guard는 거부한다 |
| R2 | 도구 실패의 원인을 허용된 고정 값으로 보존하고 경로·본문·인자·토큰을 기록하지 않는다 |
| R3 | receipt·소유권·권한 거부와 native 종료 확인을 보존한다 |
| R4 | 과거 원인 미확정과 macOS 미해결을 회귀 PASS로 닫지 않는다 |

## Test Target

기준은 `7be89c1f67effc05eb8b71262dd5c18c8bfb4253`, 수정 source는 위 tested-revision이다.
수정 전 재현은 기준 source에 새 회귀 두 건만 추가해 실행했다.
[session 모듈](../../../plugin/runtime/local-session.mjs),
[resident 실행기](../../../plugin/runtime/background.mjs),
[역할 bridge](../../../plugin/runtime/codex-thread.mjs),
[고정 진단](../../../plugin/runtime/role-tool-diagnostics.mjs)이 대상이다.

## Preconditions and Test Data

격리 worktree와 매번 새 임시 Git 저장소를 사용했다. 실제 저장 순서인 policy → lock을
guard 안에서 실행하면서 읽기 CLI를 겹쳤다. 수정 전 CLI는 guard가 풀리기 전에
corrupt-state로 끝났고, 수정 후에는 기다린 뒤 완성된 session을 locked로 판정했다.
도구 시험은 실제 파일 broker와 HTTP bridge를 통과하며 입력 오류·허용 경로 부재·권한
거부·OS 오류·native 진단·소유권 종료를 포함한다. 개인정보 canary가 기록에 없음을 검사한다.
새 원격 사용자 메시지·운영 DB 변경·패키지 공개는 수행하지 않았다.

## Test Cases and Results

| ID | 기준 | 시험 | 결과 | 증거 |
| --- | --- | --- | --- | --- |
| T1 | R1/R2 | 수정 전 두 결함 재현, 수정 후 통과 | PASS | E1 |
| T2 | R4 | 수정 전 native/stop/sign-in 각각 10회 | 30 PASS; 과거 원인 증명 아님 | E1 |
| T3 | R2/R3 | 최종 source의 진단·dispatch 전달 시험 | 2 PASS | E1 |
| T4 | R1/R3 | core/plugin 전체 직렬 회귀 | 549 PASS, 2 SKIP | E1 |
| T5 | R3 | 0.5.24 패키지 2,232개 hash, bundled Node native preflight | PASS; helper 2개 시작/종료 확인 | E2 |
| T6 | R4 | 과거 네 실패의 원본 로그·관찰 범위 재검토 | 원인 미확정 유지 | E3 |
| T7 | R4 | macOS 27 descendant-scoped ES 문서 | entitlement 필요; 전체 종료 미입증 | E3 |

## Commands and Static Checks

`npm run check`는 194 PASS/3 SKIP이며 lint·문서·typegen·TypeScript를 포함한다.
`npm run verify:fsd`, `npm run verify:server`, `npm run build`는 PASS다.
`npm run test:architecture`는 148 PASS/2 SKIP다.
전체 회귀는 `node --test --test-concurrency=1 "packages/core/**/*.test.mjs" "plugin/bin/*.test.mjs" "plugin/runtime/*.test.mjs"`로 실행했다.
최종 native 진단 보완 후 bridge/dispatch 두 시험도 다시 통과했다.
source의 [check CI](https://github.com/Sangeok/stagekeeper/actions/runs/40195779380)는
static·core/plugin·web·server·build·실제 PostgreSQL 통합을 모두 통과했다.
[Windows workflow](https://github.com/Sangeok/stagekeeper/actions/runs/40195779309)와
[macOS ARM·Intel workflow](https://github.com/Sangeok/stagekeeper/actions/runs/40195779366)도
동일 source에서 PASS다. 이 macOS 공통 계약 검사는 제품 backend 인수가 아니다.

## Evidence Registry

| ID | 증거 | 내용 |
| --- | --- | --- |
| E1 | [검증 요약](../assets/2026-10-25-runtime-state-and-role-diagnostics/verification.json) | source·명령별 결과·원본 로그 hash·CI |
| E2 | [패키지 시험](../assets/2026-10-25-runtime-state-and-role-diagnostics/package-smoke.json) | package hash·파일 수·native child 정리 |
| E3 | [해결/미해결 구분](../assets/2026-10-25-runtime-state-and-role-diagnostics/findings.json) | 재현 결함·과거 원인 미확정·macOS 제약 |

원본 로그는 로컬 외부 증거 폴더에 보존하고 공개 자산에는 경로·자격 증명·본문을 넣지 않았다.
fixture의 child/server/임시 파일은 테스트 종료 훅으로 정리했다. 버전 후보와 원본 증거는
의도적으로 보존한다. 원본 작업 공간의 private 변경 네 건은 보존한다.

## Findings and Follow-up

과거 CI [40083489330](https://github.com/Sangeok/stagekeeper/actions/runs/40083489330)의
stop 실패에는 `error` event만 있었으며 세부 code가 없었다. 과거 native 실패의 원본
stderr/exit 진단도 남아 있지 않다. 별도 corrupt-state는 손상 phase가 확인되지 않았다.
실제 파일 읽기 실패의 기존 관찰기는 tool/status만 기록했고 해당 역할은 ephemeral
thread였다. 이후 성공한 호출이나 반복 PASS로 이 네 건의 원인을 역산하지 않는다.
이번 partial-state 결함은 독립적으로 재현했으며 과거 실패와의 인과관계를 입증하지 않았다.

Apple의 [es_new_descendants_client 문서](https://developer.apple.com/documentation/endpointsecurity/es_new_descendants_client(_:_:))는
macOS 27부터 후손 범위 관찰·인가를 제공하고 root/TCC는 요구하지 않지만 별도 Endpoint
Security entitlement를 요구한다. 이 API의 사용 가능성과 helper 사망 시 전체 후손
종료는 서로 다른 요건이다. 현재 서명된 entitled 시험이나 그 종료 보장은 확보하지 않았다.
macOS 15의 기존 coalition/launchd 반례로 macOS 전체 해법이 불가능하다고 단정하지 않는다.
현재 최소 설치·권한·종료 계약을 약화하거나 검증되지 않은 backend를 활성화하지 않는다.

0.5.24는 패키지·실행 preflight·회귀 후보 검증이다. 실제 양쪽 client 설치, 인증된 전체
A→Z와 동일 payload 110분은 이번에 재실행하지 않았다. 이전 0.5.23 인수의 범위를 유지한다.

## Conclusion

두 재현 결함의 수정은 완료했다. 미확정 과거 원인 네 건, macOS backend/실제 인수 및
기존 clean Windows·혼합 호스트·운영 출시 gate는 이 회귀 결과로 완료 처리하지 않는다.

## Review Checklist

- [x] 수정 전 실패와 수정 후 통과를 구분했다.
- [x] 임의 경로·본문·token·exception 문구를 진단에서 배제했다.
- [x] 권한·소유권·손상 상태 거부를 유지했다.
- [x] 새 패키지와 이전 실제 A→Z·110분 증거를 구분했다.
- [x] 미해결 항목과 macOS 문서상 제약을 명시했다.
