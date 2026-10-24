---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static", "component", "contract", "integration", "end-to-end", "manual"]
test-tools: ["Node.js test runner", "Codex CLI", "Claude Code CLI", "PostgreSQL", "Playwright", "Microsoft Edge", "GitHub Actions"]
created-at: "2026-10-24"
completed-at: "2026-10-24"
last-executed-at: "2026-10-24T06:03:40.4252950Z"
tested-revision: "893a24e7f1e4d5361727aa24724be3f9f8bc3503"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-resident-runner-plan.md", "docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/test-reports/active/dual-client-runtime-report.md", "https://github.com/Sangeok/stagekeeper/pull/222"]
primary-area: "harness/codex-resident"
observed-environments: ["local | isolated Windows resident service and database | Codex 0.164.0; bundled Node 22.23.3; PostgreSQL 18.6 | disposable owner and agent", "CI | public source check and Windows native runtime | GitHub Actions | repository workflow"]
test-summary: "pass: 현재 Windows의 Codex resident 구현·설치·실제 파이프라인 및 공통 poller 유휴 검증 — 물리적 clean host와 OS별 출시 인수는 별도"
follow-up: ["docs/proposals/active/codex-resident-runner-plan.md", "docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
---

# Windows Codex resident 실제 연결과 장시간 유휴 검증

## Summary and Decision

기존 resident 루프에 Codex main-loop와 fresh 역할을 연결하고 실제 서버의 lease,
승인·receipt·사용량·최종 인수를 확인했다. 최종 파이프라인은 새 계획부터 두 browser
gate, 독립 verifier, 구현·보고서 handoff와 다섯 인수 확인을 통과했다.
현재 PC에 전역 Node가 있는 사실은 바뀌지 않았으며 물리적 clean Windows, macOS,
혼합 버전의 실제 호스트와 운영 출시를 이 결과로 완료 처리하지 않는다.

장시간 시험과 최종 A→Z의 패키지 hash는 다르다. 장시간 시험 뒤 바뀐 모델 도구 오류와
terminal 분류를 별도 회귀로 검증했고, poller·lease·heartbeat·CLI·공통 session 파일은
전량 byte 비교로 동일함을 확인했다. 최종 패키지를 다시 110분 실행했다고 주장하지 않는다.

최종 A→Z의 실제 모델 turn은 main-loop 2회와 fresh 역할 5회였고 모두 종료됐다.
서버에는 닫힌 AgentRun 3개, usage-run 3개와 최종 acceptedAt을 확인했다.
두 owner 승인에서 모델 시작까지 각각 32.712초와 21.815초였다. 도구 수준의
`role_file_read` 실패 1회는 이후 정상 진행했으며 원본 거부 원인을 별도로 수집하지 않아
추정하지 않는다. 서버 단계에는 미처리 실패가 남지 않았다.

## Scope and Criteria

포함 범위: 현재 Windows PC의 격리 설치 후보, 실제 private 13행을 사용한 disposable
Next/PostgreSQL 서비스, Codex resident 기본 graph, lifecycle·UI·패키지와 공통 루프의 실제 유휴 시간.

제외 범위: 물리적 clean host, macOS, 혼합 버전의 별도 호스트, opt-in QA/impl-verifier,
Codex 로그온 자동 시작, 운영 seed·공개 패키지 배포·main 승격.
이 경계는 2026-10-24 승인된 실행 순서를 따르며 원래 출시 조건을 삭제하지 않는다.

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | [C4B 계획](../../proposals/active/codex-resident-runner-plan.md), VFY-C4B-01/02 | DB·REST | accepted architecture와 명시적 client 계약 유지 | 정식 migration, legacy/null, echo·소유권·인증 |
| R2 | 같은 계획, VFY-C4B-03/04 | 실제 역할·종료 | 실제 terminal·서버 인수와 모델 완료 구분 | fresh cycle·독립 verifier·handoff·중단·successor |
| R3 | 같은 계획, VFY-C4B-05/06 | UI·설치 | 실제 저장 client와 installed body 확인 | 최종 렌더, 두 loader, 전량 hash |
| R4 | [후속 인수](../../proposals/active/codex-dual-client-runtime-follow-ups.md), TASK-C4-02/E12 | 현재 Windows 공통 poller | fake clock과 실제 110분 분리; 후보별 hash 보존 | 모델·AgentRun·사용량 0, heartbeat와 정리 |
| R5 | [검증 아키텍처](../../architecture/verification.md), AGENTS.md | 코드·증거·정리 | required 코드 검사와 사실에 맞는 범위별 판정 | 회귀·build·CI, 격리 데이터·프로세스 정리 |

## Test Target

- Public base는 `8ce600c0e9b92f7f0fc7d8bc49f5eaa5a85e5774`이며 최종 tested revision 뒤의 변경은 보고서·제안서다.
- 최종 설치 후보는 미공개 `0.5.21`, 2,229개 payload 파일, SHA-256 `6bfb3bae8c0aee5ee473a7b9feab5e49df015a93bc38c886afa5a3edd3054b23`다. tested manifest의 이전 sourceRevision과 실제 commit에서 재패키징한 payload의 전량 동일성을 E3에 기록했다.
- private source `7f34e7b0a4e6e302b8559f54ca4894ee78b8964f`의 13행을 사용했다. 이번 작업에서 private 소스를 수정하거나 운영 DB에 seed하지 않았다.
- 새 PostgreSQL cluster의 loopback 전용 서비스와 disposable Max/Pro 계정·project를 사용했다. 실제 browser owner gate와 agent token을 구분했다.
- app build 후 변경된 UI 기본 client 선택은 별도 최종 production snapshot에서 검증했다. 이후 변경은 plugin runtime에 한정되며 최종 source 전체 build는 CI에서도 통과했다.
- 전역 Node가 설치된 현재 PC다. 별도 PATH 시험은 global Node를 제외했지만 물리적으로 Node가 없는 host의 증거가 아니다.

## Preconditions and Test Data

formal integration은 `validateTestDatabase`를 통과한 `stagekeeper_test_resident_live`를
사용했다. 실제 모델 서비스는 별도로 생성한 빈 `stagekeeper_resident_live` DB였으며
loopback·고정 port·정확한 DB 이름·초기 user/template 0건을 확인했다. 후자는 test DB 이름
validator를 통과했다고 주장하지 않는다. production 환경 파일과 사용자 인증을 복사하지 않았다.

fixture는 문자열을 그대로 보존하는 작은 greeting 수정이며 계획과 테스트는 실제 모델이
작성했다. 모델 도구·scope·서버 절차를 우회하지 않았다. 실패 후보와 operator가 중단한
후보는 별도 경로에 보존하고 최종 시험은 새 항목과 저장소에서 시작했다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | 정식 migration과 실제 REST/DB | legacy 보존, Codex scoped/binding, 잘못된 client·session·autostart 차단 | integration 146 PASS, E2 | PASS |
| T2 | R2 | required | 최종 설치본의 새 항목 A→Z | 두 browser gate, fresh verifier·역할, report와 server acceptance | 2개 fresh cycle, 45개 실제 fixture test, 다섯 인수 확인, E1 | PASS |
| T3 | R2 | required | native 역할 pending 중 takeover와 재개·owner stop | 각각 interrupt 1회, 실제 종료, successor·같은 AgentRun/receipt/usage 보존 | main-loop와 역할 두 turn의 종료·새 문맥·row 정리, E1 | PASS |
| T4 | R2/R3 | required | 실제 browser Pause→ready work→Resume | 같은 session, paused 중 모델/AgentRun 0, 재개 후 실제 시작 | 45초 관찰과 native 종료, E1 | PASS |
| T5 | R2 | required | Pro 사용량 cap과 token 철회 | cap 중 모델/usage 증가 0, 철회 뒤 로컬 종료 | 45초 cap, local lock 해제; 인증 불가 lease row는 fixture 정리에서 제거, E1 | PASS |
| T6 | R3 | required | 두 client의 실제 0.5.20→0.5.21 설치 | 올바른 loader·기존 skill·완전한 원본 verifier·새 background skill | 전량 2,229개 hash 일치, E1/E3 | PASS |
| T7 | R3 | required | 최종 app build의 저장 client 렌더·복구 | full/compact/list Codex 표시, 선택 변경·Pause·복구 안내 | 실제 Edge 및 production build, E1 | PASS |
| T8 | R4 | required | 실제 110분 유휴 | 모델/AgentRun/사용량 0, 최근 heartbeat·같은 session, stop 정리 | 6600초, 108회 서로 다른 heartbeat 관찰, E1 | PASS |
| T9 | R3/R4 | required | global Node 없는 PATH의 시작·중지 | 설치 runtime으로 반복 연결·종료, 모델·잔여 row 0 | 20회 PASS, 실제 clean host는 제외, E1 | PASS |
| T10 | R5 | required | fixture·서비스·DB 정리 | 소유 lock/guard·fixture 데이터·listener 정리 | E1의 cleanup read-back | PASS |
| T11 | R2/R5 | informational | 이전 후보·회귀 실패와 수정 | 실패·부분 결과의 source와 원인을 보존 | 아래 Findings 및 E3; 최종 후보의 required 판정과 구분 | PASS |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R5 | required | `npm.cmd run check` | lint·type·docs·script 통과 | 194 PASS / 3 SKIP, E2 | PASS |
| C2 | R2/R5 | required | `node --test --test-concurrency=1 "packages/core/**/*.test.mjs" "plugin/bin/*.test.mjs" "plugin/runtime/*.test.mjs"` | fail 0 | 536 PASS / 2 SKIP, E2 | PASS |
| C3 | R5 | required | `npm.cmd run verify:fsd`, `npm.cmd run verify:server`, `npm.cmd run test:architecture` | 경계 오류·실패 0 | architecture 148 PASS / 2 SKIP, E2 | PASS |
| C4 | R1/R3/R5 | required | `npm.cmd run test:web`, `npm.cmd run test:server`, `npm.cmd run test:server:integration` | 관련 기능·실제 DB 통과 | 777 / 155 / 146 PASS; server 2 SKIP, E2 | PASS |
| C5 | R2/R5 | required | hash·Git·terminal 경계 집중 회귀와 Windows native 시험 | 교정 가능한 입력과 실제 권한 거부 구분, late success 거부 | 36개 최신 경계, 40개 Git 경계, Windows native 15개 PASS, E2 | PASS |
| C6 | R3/R5 | required | production `npm.cmd run build`, final source CI | 실제 build와 check/native-runtime 성공 | [check](https://github.com/Sangeok/stagekeeper/actions/runs/40065228189), [native runtime](https://github.com/Sangeok/stagekeeper/actions/runs/40065228194), E2/E3 | PASS |
| C7 | R5 | required | 최종 `npm.cmd run docs:check`, standard traceability, `git diff --check` | 링크·구조·연결 오류 0 | 문서 검사는 제품 실행 판정과 별개, E3 | PASS |

C2의 최종 전체 실행에는 native helper의 stdout/stderr를 보존하는 수동적 진단 capture를
추가했다. 실행 인자·제품 분기·assertion·판정은 변경하지 않았다. 진단 없는 이전 전체
실행의 실패도 E3에 남겼으며 후속 성공만으로 간헐 실패가 해결됐다고 판단하지 않는다.

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | native/API/DB/browser/설치 read-back | [observations.json](../assets/2026-10-24-codex-resident-live/observations.json) | Git; 만료 없음 |
| E2 | 명령 결과·로그 지문 | [checks.json](../assets/2026-10-24-codex-resident-live/checks.json) | Git; 만료 없음 |
| E3 | source·candidate·실패 지문·범위 대조 | [source-basis.json](../assets/2026-10-24-codex-resident-live/source-basis.json) | Git; 만료 없음 |

기존 실패는 삭제하지 않았다. 정제 자료는 본문·credential·사용자 경로·실제 session/account
식별자·원본 transcript를 제외한다. raw 로그·스크린샷·private fixture는 저장소 밖의
소유한 시험 디렉터리에 남기고 공개 Git에는 올리지 않았다. 실제 모델 token 합계를
수집하지 않았으므로 서버의 usage-run 횟수를 token·금액으로 해석하지 않는다.
110분 전체 HTTP poll 요청 수는 수집하지 않았으며 서로 다른 heartbeat 관찰 수와 구분한다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | high | successor가 시작한 뒤 이전 종료가 상태를 덮어쓰는 guard race를 재현·수정. scope 경로/Windows identity·queued dispatch도 강화, E2/E3 | [PR 222](https://github.com/Sangeok/stagekeeper/pull/222) | 동일 재현과 native takeover 유지 |
| F2 | medium | 다중 파일 show·존재하지 않는 baseline blob과 잘못 복사한 hash를 권한 거부로 혼동. 교정 가능한 오류를 분리하고 새 commit 파일 diff 누락 수정, E3 | 같은 PR | 실제 Git/HTTP write-protection 회귀와 fresh A→Z |
| F3 | high | policy refusal 뒤 늦은 completed가 성공으로 분류되는 경합을 결정적 시험으로 재현·수정, E3 | 같은 PR | completed/interrupted 양쪽과 interrupt/cleanup 회귀 |
| F4 | medium | 앞선 sign-in recovery·native helper의 거부 진단 간헐 실패와 단발 corrupt-state의 정확한 원인은 미확정. native SID 거부 집중 시험은 진단 capture를 포함해 13회 후속 통과했고 전체 536개도 통과했다. 앞선 후보 60회와 후속 후보 20회의 start/stop 성공을 포함해 원인 해결로 단정하지 않음, E3 | [후속 계획](../../proposals/active/codex-dual-client-runtime-follow-ups.md) | 재발 시 저장한 진단 로그와 최소 재현으로 원인 확정 |
| F5 | medium | 중간 설치 갱신으로 관리 파일이 승인 계획과 달라진 replay는 올바르게 acceptance_fail. 그 항목을 통과로 바꾸지 않고 최종 fresh fixture 사용, E1 | [상세 계획](../../proposals/active/codex-resident-runner-plan.md) | 초기화·관리 파일 commit 후 새 계획으로 인수 |
| F6 | blocker | physical clean Windows·macOS·mixed-host·운영 출시 미실행 | 두 active 제안서 | 해당 실제 환경과 고정 배포 후보 확보 후 독립 인수 |

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| fixture project/user/template | 격리 cluster에만 생성 | 알려진 소유 fixture와 template identity 확인 후 제거; 잔여 0건 | 없음 |
| native resident/role | 실제 모델·command·잠금 | 실제 종료 후 local lock/guard 부재와 서버 row 정리 확인 | 모델 사용량 기록은 시험 증거로 보존 |
| loopback Next/PostgreSQL | 전용 port와 새 cluster | 소유 PID·data directory 확인 뒤 종료, listener 부재 확인 | 원본 재현 자료만 로컬 보존 |
| public/private 저장소 | public 코드·문서 변경, private 읽기 | 원래 private 작업 4개 보존; private 배포 없음 | public 변경은 PR로 dev 통합 |

인증이 철회된 실행기는 서버 stop 요청 권한이 없어 lease 행을 직접 삭제하지 못했다.
그 local lock 해제와 fixture 소유자의 DB 정리는 별도 관찰이다. 이전 오류 후보의
stopped row도 owner fixture 정리에서 제거했으며 잠금 파일을 수동 삭제하지 않았다.

## Conclusion

현재 Windows에서 정의한 required 항목이 모두 통과했다. native·DB·설치·browser 증거와
모의/결정적 회귀를 구분하고, 서로 다른 후보의 패키지 차이와 재사용한 검사 범위를 E1/E3에
명시했다. 과거 실패가 있는 전체 aggregate 보고서의 판정은 이 scoped pass로 지우지 않는다.

전체 제안서는 여전히 pending/blocked다. 이 보고서는 사전 no-edit readiness pass를
소급해서 증명하지 않으며 전체 reconciliation의 `clean pass achieved`를 선언하지 않는다.
외부 환경·출시 gate는 원래 조건대로 남긴다. 새로운 환경이나 runtime/권한/lease 변경 시
새 인수 보고서와 실제 실행을 요구한다.

## Review Checklist

- [x] metadata·scope·required/informational 판정과 증거를 연결했다.
- [x] 패키지별 hash와 source, 실제/모의 실행, 실패·중단 후보를 구분했다.
- [x] 실제 시간·모델 호출·사용량·승인·receipt·종료·정리 관찰을 확인했다.
- [x] 민감정보와 private 원문을 공개 자료에서 제외하고 링크·문서 검사를 수행했다.
- [x] 현재 PC 시험을 다른 OS·clean host·운영 출시의 증거로 확대하지 않았다.
- [x] 미확정 원인과 외부 인수는 active 제안서에 남겼다.
