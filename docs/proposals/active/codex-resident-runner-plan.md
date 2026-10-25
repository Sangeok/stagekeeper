---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-10-22"
approved-by: "requesting-user"
approved-at: "2026-10-24"
approval-scope: "2026-10-24 사용자 승인: 현재 Windows PC의 격리 DB·서비스에서 C4B 실제 연결 구현과 통합시험, 연결 후 Windows 110분 유휴 시험을 진행한다. 물리적 clean Windows·OS별 인수는 최종 지원·출시 조건으로 유지하며 운영 seed·main 승격·패키지 공개는 포함하지 않는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/codex-dual-client-runtime-follow-ups.md"
  - "docs/proposals/completed/2026-10-04-codex-dual-client-support.md"
  - "docs/proposals/completed/2026-10-21-runner-status-and-background-runner.md"
  - "docs/architecture/protocol.md"
---

# Codex 상주 실행기 — 기존 runner 재사용 계획

## Goal and Authority

첫 지원은 **Pro/Max 상주형**이다. 사용자는 2026-10-22 이 범위를 선택했다.
기존 background runner의 감시·대기·lease·편집 보호를 재사용하고 Codex의 실행 시작,
결과 판독, 취소와 종료 확인을 연결한다. 세션형 자동 watch와 두 방식 동시 개발은
이번 범위에 넣지 않는다. 기존 foreground run/resume은 유지한다.

상위 [실행·인수 계획](./codex-dual-client-runtime-follow-ups.md)이 최소 설치,
실제 역할·양방향 승인·중지/재개 인수를 소유한다. 원본 SDD의 REQ-DUAL-018/019,
INV-DUAL-001~005, CON-DUAL-001~008과 TASK-C4-01/02는
[완료 기록](../completed/2026-10-04-codex-dual-client-support.md)의 canonical 정의를 참조한다.
이 문서는 그 작업의 상세 계획이며 자동 watch 요구사항을 새로 정의하지 않는다.

앞선 Windows foreground 인수 source는 `5ec3015d3e874c86a2bd624fd8bd336f6dc0eff5`/plugin `0.5.20`이다.
C4B는 public base `8ce600c0e9b92f7f0fc7d8bc49f5eaa5a85e5774`에 구현한 `0.5.21` 격리 후보다.
private source는 상위 문서의 2026-10-24 Windows 기록을 유지하며 이번에는 수정하지 않는다.
아래 기존 runner 차이 표와 C4A 준비 기록은 당시 `e716847` 기준을 보존한다.
구현 전 아키텍처는 Claude resident와 Codex foreground를 제공했다. 현재 architecture에는
검증한 Codex resident 계약을 반영했으며, 소스 구현·격리 시험과 공개 지원 판정을 구분한다.

2026-10-24 사용자는 최소 설치 인수를 개발 착수 조건에서 최종 지원·출시 조건으로
분리하는 순서 변경을 승인했다. C4B-01의 DB·REST 계약부터 구현하고, C4B-02의
transport·도구 계약을 저장·검토한 뒤 실제 모델을 연결한다. 실제 lease·역할·receipt
시험은 구현의 완료 조건이며 아직 없는 구현의 착수 조건으로 순환 참조하지 않는다.
청정 Windows·macOS·혼합 호스트를 현재 PC의 시험으로 대체하거나 PASS 처리하지 않는다.

## Current Windows Acceptance — 2026-10-24

현재 제품 source는 `1cae8cc0843124c25b9dc585e0ef01df63d19dd2`, 격리 설치 후보는 `0.5.23`이다.
내부 상태 진단 누락을 수정했고, 실제 양쪽 client 업데이트의 전체 2,231개 파일을 확인했다.
같은 payload로 Codex 새 계획·독립 verifier·두 browser gate·구현·보고서·최종 다섯 인수를
통과했다. 실제 단일 110분 idle은 6600초, heartbeat 108회·pipeline poll 108회
모두 HTTP 200, 모델·AgentRun·usage 증가는 0이었다. [최종 Windows 보고서](../../test-reports/completed/2026-10-24-codex-final-windows-acceptance.md)가
source/hash·실제 측정·정리·회귀/CI와 실패 이력을 소유한다.

현재 PC의 이 인수는 완료했다. 과거 native/state/CI stop의 개별 원인 미확정,
물리적 clean Windows·macOS 제품 backend/실제 인수·실제 혼합 호스트·운영 출시 gate는
남아 있으며 전체 `pending/blocked`를 유지한다. 아래 기록은 각 후보 당시의 checkpoint다.

## Selected Scope

| 결정 | 범위 |
| --- | --- |
| 사용자 실행 방식 | 기존 background 계열의 resident, Pro/Max. 별도 Codex 세션형 watcher는 만들지 않음 |
| 실행 수명 | 모델 없는 resident가 대기하고, 할 일이 있을 때 한 번의 main-loop 실행을 시작. idle 중 모델 호출 0회 |
| 문맥 | resident의 local session/정책은 유지. work cycle의 모델 문맥은 새로 시작하고 영속 진행은 서버 receipt/원장에서 복원 |
| 역할 | 기존 fresh 역할 격리·MCP bridge·원본 verifier 사용. runner가 agent_next 절차나 검증 판단을 재구현하지 않음 |
| 작업 정책 | 기존 resident처럼 main-loop commit 허용을 명시하고 propose는 시작 시 선택. 역할의 Git 쓰기 권한은 넓히지 않음. gate 자동 승인과 push 금지 |
| 첫 기능 범위 | 기본 graph plan/verify/implement/accept. opt-in qa/impl-verify는 독립 범위이며 기본 인수 성공으로 지원을 주장하지 않음 |
| OS | 공통 계약과 모의 시험은 OS 독립. Windows·macOS의 실제 지원 판정은 각각 수행. macOS 자동 시작/OS 알림 추가는 제외 |
| 초기 운영 기능 | 수동 start/stop/status부터 연결. Codex의 로그온 자동 시작은 이후 검증 대상으로 남기고 첫 후보는 autostart=false |

원본 C4의 같은 main-loop 재진입 구상은 이 resident 설계에서 **같은 local session/
정책 유지 + cycle별 새 main-loop**로 구체화한다. 이미 열린 앱 대화를 자동으로 깨우는
방식에 의존하지 않는다. 이 변경은 상주형 선택에 따른 후속 계획이며, 원본의 역사적
문구를 수정하거나 그 방식의 실측 통과를 주장하지 않는다.

## Current Implementation and Delta

아래 표는 기준 source `e716847`에서 조사한 차이다. 2026-10-23 C4A 구현 결과는
문서 끝의 실행 기록을 따른다. 이 표의 미구현 표시는 역사적 기준이며, 현재 C4B의
구현·인수 판정은 아래 목적지와 실행 기록으로 구분한다.

| 현재 근거 | 판정 | 필요한 변경 |
| --- | --- | --- |
| `plugin/runtime/background.mjs:runResident` | 재사용 | idle polling·backoff·편집 보호·heartbeat·실패 누적을 유지하고 실행 연결 경계만 분리 |
| 같은 파일의 `classifyRun`, `readStreamLine`, `runArguments` | Claude 전용 | Claude adapter가 raw stream-json을 읽고 공통 결과로 변환. Codex raw 이벤트를 Claude subtype으로 위장하지 않음 |
| `plugin/bin/harness-background.mjs:resident/startRun` | Claude 실행 고정 | 시작·결과·종료 전략을 묶어 주입. 기존 Claude가 기본값이며 Codex 실연결은 후속 단계 |
| `runResident`의 `stopAfter` | 현재 drain | Claude는 기존 실행 완료 후 stop 유지. Codex는 stop/lost ownership 때 interrupt하고 실제 종료를 기다리는 전략 필요 |
| `harness-codex.mjs:main` | foreground만 허용 | resident용 bound entry가 별도로 필요. 기존 foreground 검사에서 mode만 느슨하게 바꾸지 않음 |
| `codex-thread.mjs:dispatchFreshRole` | 역할 dispatcher 있음 | 역할용 fresh context와 종료 acknowledgement 재사용. 전체 main-loop 실행기는 별도로 필요하며 역할 하나를 main-loop로 간주하지 않음 |
| `local-session.mjs` | 세 mode와 client 구분 있음 | 기존 common Git lock·nonce·children을 재사용. 새 종류의 잠금은 추가하지 않음 |
| `harness-session.mjs:holdsLease` | Claude만 보고 | Codex resident 연결 시 정확한 client/mode/binding에 한정해 heartbeat·release 보고 확장 |
| `Runner`·REST parser·DB check | permission은 auto/allowlist, client 없음 | Codex 정책을 auto로 잘못 보고하지 않도록 새 permission 계약과 client 표시 설계가 필요. C4A에서는 변경하지 않음 |
| turn-banner·background 안내 | 일부 Claude 고정 문구 | 실제 연결 단계에서 client에 맞는 시작/복구 안내를 제공. 새 client 지원 전에 UI 문구만 바꾸지 않음 |

## Execution Boundary

공통 루프가 소유하는 것은 언제 실행할지, 현재 run이 어느 세션에 속하는지, 정지 뒤
재시작할 수 있는지다. 실행 adapter가 소유하는 것은 프로세스/transport, raw 결과 파싱,
종료 요청, child/bridge/reader 정리다. 서버가 역할 절차와 영속 작업 상태를 계속 소유한다.

구현한 주입 지점은 `deps.execution` 하나다. `start`·`classify`·`stopMode`를 가진다.
새 registry, 범용 plugin framework, 두 번째 polling loop는 만들지 않는다.

- `start({ generation })`은 `{ done, end(reason) }`를 반환한다. 실행 identity와 로그는
  해당 adapter가 고정한 local session/nonce에 묶는다. `generation`은 루프가 증가시키며
  이전 run의 완료·취소 신호가 다음 run의 상태를 바꾸지 못하게 한다.
- `classify(settlement)`는 `{ outcome, line }`을 반환한다. `outcome`은 기존 success,
  error, timeout, branch와 취소를 구분하는 cancelled다. line은 기존 길이 제한을 따른다.
  모델 turn 완료는 item 완료의 증거가 아니며, 작업 진전과 최종 accept는 fresh 서버 상태로 판단한다.
- `stopMode`는 `drain` 또는 `interrupt`다. 기본 Claude adapter는 drain,
  Codex 실제 adapter와 모의 시험은 interrupt를 명시한다. branch/timeout은 기존처럼 종료 요청을 한다.
- `end`는 멱등이며 종료 요청만 뜻한다. `done`은 실제 owned child·reader·bridge가 정리된
  terminal settlement 뒤에만 resolve한다. raw 마지막 메시지나 OS process exit만으로
  completion을 대신하지 않는다. 종료 증거가 없으면 reject하며 로컬 소유권을 보존한다.
  end 요청 자체가 실패해도 종료 성공으로 바꾸지 않고 같은 unsettled 경로로 처리한다.
- 루프는 raw adapter 이벤트를 직접 구독하지 않는다. 하나의 done만 소비하고, 각 await 뒤
  lifecycle/lease 및 generation을 재확인한 후 다음 side effect를 실행한다.

### 권한·취소 상태 계약

| 신호 | 새 실행/제출 | 진행 중 실행 | 잠금/lease |
| --- | --- | --- | --- |
| idle, gate/handoff 대기 | actionable work가 없으면 시작하지 않음 | 없음 | 모델 없이 heartbeat |
| 웹 Pause | 새 dispatch·인수·아직 시작하지 않은 제출 금지 | 이미 시작한 로컬 작업의 종료를 기다리며 새 서버 제출·다음 단계는 차단 | 같은 session 유지 |
| local stop | 감지 즉시 terminal latch | Claude drain 유지; Codex interrupt 1회 | 종료 확인 후 자신의 release와 stop 보고 |
| lease replaced/소유권 상실 | 추가 dispatch·결과 제출·rearm 금지 | Codex bridge를 막고 interrupt | successor를 수정/반납하지 않음 |
| plan/access 철회, 서버 경로 소실, 연속 실패 한도 | 새 실행 금지 | Codex interrupt; Claude의 기존 drain 정책 유지 | 종료 미확인 시 local lock 보존 |
| branch 변경/timeout | 새 실행 금지 | 해당 adapter end 호출 | 종료 확인 후 기존 branch 대기/오류 분류 적용 |
| 취소 뒤 늦은 완료 | 성공·진전으로 수락하지 않음 | 기존 generation의 정리 증거만 소비 | 새 세션에 반납·상태 갱신 금지 |

Codex의 terminal latch 뒤에는 진전 측정을 위한 `pipeline_next`도 새로 호출하지 않는다.
이 API에는 지연 전진이 있으므로 단순 read라고 가정할 수 없다. 소유한 세션을 정리하는
heartbeat/stop은 작업 결과 제출과 구분한다. 이미 전송한 요청의 서버 효과를 취소했다고
주장하지 않으며 그 응답과 새 요청 차단을 별도로 기록한다.

headless 실행은 permission prompt에 자동 승인하지 않는다. 기존 preflight·named role
policy·credential 격리를 유지하고, 추가 권한이 필요한 항목은 blocked/handoff로 남긴다.
main-loop의 허용된 commit과 역할의 Git 쓰기를 분리한다. 이 계약을 만족하는 실제
main-loop transport/commit 경계는 기존 native cycle 증거와 구현 전 도구 계약 검토로
고정한다. 실제 서버 연결의 성공 여부는 격리 통합시험에서 검증한다.

## Phase C4A: 실행 경계와 모델 없는 계약 테스트

**소스 구현·로컬 검증 완료(2026-10-23).** 이 절은 당시 C4A의 목표·검증 기록이다.
foreground-only 노출 제한은 이후 승인된 C4B의 실제 연결 범위와 구분한다. 기본 실제 인수 전 허용한 준비 단계이며,
Codex 자동 실행 기능을 노출하지 않는다. REQ-DUAL-018/019 완료에 기여하지만 실제
요구사항 완료는 C4C가 소유한다. 사용자의 진행 지시에 따라 아래 세 작업을 구현했다.

preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-003, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-003, CON-DUAL-005, CON-DUAL-008

실제 C4A 구현 경로는 `plugin/runtime/background.mjs`, `plugin/bin/harness-background.mjs`,
기존 `plugin/bin/harness-background-loop.test.mjs`, `harness-background.test.mjs`와
신규 `plugin/bin/harness-resident-execution.test.mjs`다. 제안했던
`plugin/runtime/resident-execution.mjs`는 만들지 않았으며 공통 실행 경계는 기존 두 runtime/CLI 파일에 있다.
테스트 fake는 테스트 파일 안에 두고 설치 runtime에 Codex stub을 배포하지 않는다.

DB/schema/REST, private 템플릿, Codex skill/CLI 등록, 실제 프로세스 transport,
OS 설치·로그온 작업·권한 설정은 C4A에서 변경하지 않는다. package version은 이 내부
변경의 배포 시 repository 계약에 따라 올리며 동일 version의 다른 bundle을 덮어쓰지 않는다.

### TASK-C4A-01: Claude 결과와 공통 실행 경계 분리

verified-by: VFY-C4A-01

현재 `runResident`가 `deps.startRun`과 `classifyRun`을 직접 사용한다. 위 execution
객체를 받도록 바꾸고 `harness-background.mjs`의 기존 spawnClaude/startRun,
classifyRun을 하나의 Claude execution 객체로 전달한다. `readStreamLine`, permission
probe, allowlist, push 차단, Job Object, 로그 pruning과 CLI 인자는 그대로 유지한다.
normalization helper가 필요한 경우에만 신규 resident-execution 모듈을 사용한다.

호출자는 bin의 resident와 기존 loop test harness 두 곳이다. tests의 SUCCESS raw
fixture도 Claude adapter를 통과시키며 기존 출력·실패 누적·branch/timeout 결과를 고정한다.
계약 검사: VFY-C4A-01. 독립 완료 조건은 기존 Claude loop/CLI 회귀가 동일하게 통과하는 것.

### TASK-C4A-02: 중지 전략과 늦은 효과 차단

verified-by: VFY-C4A-02

루프의 stopAfter 처리에서 drain/interrupt를 명시적으로 나눈다. Codex 모의 경로는
terminal latch → end 1회 → done/정리 확인 순서를 지킨다. latch 이후 fresh overview,
새 start와 work-result 보고를 차단하고 cancelled를 stuck/error 누적에 섞지 않는다.
done rejection은 `resident-run-unsettled`로 구분한다. 현재 bin의 catch는 오류를
일반 error로 바꾼 뒤 `finish`에서 서버 stop과 clearState를 호출하므로 함께 수정해야 한다.
이 오류만 자신의 lifecycle을 stopping으로 남기고 finish를 호출하지 않는다. `staleResident`
역시 stopping lock을 PID 부재만으로 자동 회수하지 않게 한다. 기존 정상 종료와 Claude
drain의 local-stop/missing-route 동작은 유지하며, 종료 미확인 오류의 소유권 보존을 강화한다.

가짜 adapter는 종료 요청 후에도 done을 pending으로 유지할 수 있어야 한다. 이를 통해
interrupt 요청 자체가 release나 다음 시작으로 이어지지 않는지 검증한다. 계약 검사:
VFY-C4A-02. native cleanup을 fake로 통과시켰다고 기록하지 않는다.

### TASK-C4A-03: 경계 검증과 live 경로 미노출 확인

verified-by: VFY-C4A-03

가짜 clock/lease/overview/adapter로 no-work 110분, pause/resume, duplicate ready,
ownership loss, stop 중 late success, done reject, 종료 전 재시작 금지를 검사한다.
가짜 110분은 E12의 실제 110분 시험을 대신하지 않는다. Codex CLI/skill은 여전히
foreground만 노출하고 actual Codex spawn 호출 수는 0이어야 한다.
검사 위치는 기존 loop test와 필요한 신규 bin test이며 `npm test` glob에 포함한다.

## Verification for C4A

### VFY-C4A-01: 기존 실행 결과 보존

verifies: REQ-DUAL-018, REQ-DUAL-019

분류: 모델 없는 단위/회귀. 기존 Claude success/error/no-result/timeout/branch,
3회 무진전 중지, 5회 전송 실패, 편집 보호, pause와 drain 종료를 동일한 관찰로 확인한다.
`node --test plugin/bin/harness-background-loop.test.mjs plugin/bin/harness-background.test.mjs`.
2026-10-23 PASS: 기존 동작과 새 CLI 실패 주입을 포함한 집중 시험 49개가 통과했다.
parent 요구사항의 준비 기여만 확인하며 실제 Codex 지원 증거가 아니다.

### VFY-C4A-02: 취소·소유권 경계

verifies: REQ-DUAL-019

분류: 모의 lifecycle/실패 주입. pending fake run에서 각각 stop/replaced/plan/missing/
전송 한도를 발생시키고 interrupt 1회, 새로운 overview/start/result 제출 0회,
done 전 release 0회와 late generation 무시를 확인한다. pause는 active run을 interrupt하지
않으면서 다음 작업을 막는다. 실제 local-session lock fixture를 쓰는 통합 단언은 기존
session 시험의 helper를 참고하되 private 모듈을 테스트 때문에 공개하지 않는다.
bin-level 실패 주입은 done rejection 뒤 서버 stop·clearState가 호출되지 않는지,
그 stopping lock을 다음 start의 staleResident가 자동 회수하지 않는지도 관찰한다.
2026-10-23 PASS: 신규 `plugin/bin/harness-resident-execution.test.mjs`의 모의 계약과
기존 background CLI 시험의 test-only preload 실패 주입에서 위 경계를 관찰했다.

### VFY-C4A-03: no-model idle와 노출 제한

verifies: REQ-DUAL-018

분류: fake clock/정적 계약. 110분 가상 idle 동안 adapter start 0회와 기존 주기의
heartbeat/overview만 확인하고, CLI/skill에서 Codex resident 선택이 아직 불가능함을 확인한다.
즉시 연속 work 신호에도 active run은 하나다. 2026-10-23 PASS이며 실제 시간·모델 비용
증거가 아니다. Codex resident 선택 인자는 client 시작 전 거부되는 것을 확인했다.

코드 변경의 최종 검사는 `npm run verify:fsd`, `npm run verify:server`,
`npm run test:architecture`, `npm run check`, `npm test`, `npm run build`다.
Windows 전용 Job/명령 검사는 현재 플랫폼의 skip과 CI의 실제 결과를 분리한다.

## Phase C4B: 실제 Codex main-loop와 서버 연결

**현재 Windows의 구현·격리 연결 검증 완료.** 최종 source는 `893a24e7f1e4d5361727aa24724be3f9f8bc3503`이며
기본 graph의 실제 서버·역할·browser 인수를 [실제 resident 보고서](../../test-reports/completed/2026-10-24-codex-resident-live.md)에 기록했다.
BLK-MIN-01과 다른 OS·출시 조건은 계속 유지한다.

**BLK-C4R-01:** 현재 Windows의 서버 lease, cycle별 fresh main-loop와 역할, 독립 verifier,
commit handoff·receipt·usage, 최종 server acceptance 및 native takeover/stop/resume를
직접 확인했다. 교정 가능한 Git/hash 입력과 실제 권한 거부를 구분하고 queued dispatch와
늦은 completed의 성공 오분류를 회귀로 막았다. 이 호스트의 연결 검증 항목은 해소했으며
macOS·혼합 호스트·출시 인수로 확대하지 않는다.

**BLK-C4R-02:** 정식 migration과 REST/서비스/UI 연결을 구현했다. 실제 PostgreSQL의
legacy·NULL·client/session 충돌·autostart 보호와 응답 binding을 포함한 integration
146개가 통과했다. 현재 격리 계약 검증은 해소했으며 운영 rollout은 미실행이다. 구 서버의
session-only 삭제 위험과 전체 서버 갱신 순서는 아래 출시 조건으로 유지한다.

### 계약 기준과 보존 범위

구현 전 설계 기준은 `1eedf0de90d782763167a8c500f33ab1f19e7905`였다. 당시 startIn의
session-only 재전송, autostartIn의 mode/host 판단, runnerCall의 추가 body 필드 폐기를
아래 client·binding 계약에 맞춰 함께 변경했다.

- client는 Runner 실행 metadata와 adapter 선택에만 둔다. BoardItem/PipelineRun/
  AgentRun/receipt/token/usage identity에는 추가하지 않으며 인증 권한을 부여하지 않는다.
- hs_/hu_ scope, ho_ 거부, User→Project 잠금 순서, DB 시계, Pro/Max 조건, 30초 beat
  쓰기 간격과 기존 생존 시간은 유지한다.
- Claude session/resident·drain·자동 시작을 보존한다. Codex 첫 후보는 resident의
  수동 start/stop/status, autostart=false다.
- 같은 local session의 commit=true/propose 정책을 유지한다. 역할의 Git 쓰기를 늘리지
  않고 main-loop commit도 승인된 산출물/handoff 경계를 따른다. push·gate 자동 승인은 금지한다.

### 저장·요청·응답 계약

| 표면 | 구현할 계약 | 거부/호환 조건 |
| --- | --- | --- |
| Runner | client String, NOT NULL, default claude. permission에 scoped 추가 | client는 claude/codex만. scoped는 Codex resident·branch 필수·autostart=false에서만 허용 |
| Claude 저장 | 기존 auto/allowlist/null과 session/resident 유지 | stopped owner/signin·permission=null인 기존 autostart 행도 보존. legacy null을 이번 변경에서 일괄 정리하지 않음 |
| Codex 저장 | 모든 상태에서 codex/resident/scoped/autostart=false | null/auto/allowlist·session·자동 시작 거부. owner stop은 삭제, error/stuck/plan은 stopped 기록 |
| REST 공통 | 기존 /api/runner에 선택 client 추가. **생략만** claude | null·빈 값·unknown은 400. parseClient(null)의 legacy 기본값을 외부 입력 검증에 사용하지 않음 |
| start | Codex는 client와 resident/scoped/branch/autostart=false 명시 | session/자동 시작 조합 400. Claude 정규화는 유지 |
| 같은 session start | row.client 일치 필수. Codex는 stopped가 아니고 mode/host/branch/permission도 같을 때만 재전송 | 불일치·Codex stopped 행은 409 RUNNER_REPLACED, 쓰기 0. 종료 후 재시작은 새 local session. token 교체는 기존 scope로 인증하며 새 실행 identity를 만들지 않음 |
| beat·stop | client와 session을 저장 row와 대조. beat로 identity 변경 불가 | 다른 client/session은 RUNNER_REPLACED. 행 없는 stop의 멱등 성공 유지 |
| autostart | Claude 전용. 기존 mode/host 판정에 row.client=claude 추가 | Codex op는 400. 기존 Codex 행은 host·live/silent/stopped 여부와 무관하게 on/off/refused 어느 것도 수정·삭제하지 않음 |
| PLAN_REQUIRED | 코드·Pro/Max 판정 유지. Claude의 기존 사유 유지, Codex에는 자신의 foreground run/resume 안내 | Codex 사용자에게 다른 CLI 설치·로그인을 복구 조건으로 제시하지 않음 |
| Codex start/beat 응답 | 기존 ok/paused/stop에 binding:{session,client,mode,permission} 추가 | 요청의 고정 identity와 값이 다르거나 없으면 실행 중단. Claude 성공 body는 유지 |
| busy | holder에 저장 client 추가, 기존 mode/host/seenAt 유지 | 구 helper는 추가 필드를 무시. 표시값으로 token scope를 우회하지 않음 |
| runnerCall | Codex binding을 검증·보존. 민감한 body/token은 로그에 남기지 않음 | 200/ok만으로 지원 확인 금지. 400/404/echo 누락 때 Claude나 lease 없는 실행으로 fallback 금지 |

scoped는 호스트 auto 승인이 아니라 파일·명령·역할·commit 경계를 별도로 검사하는
adapter 정책 표시다. UI는 scoped tools로 표시하며 auto/allow-list only로 바꾸지 않는다.
named policy와 실제 도구 목록의 일치는 BLK-C4R-01에서 확인한다.

### Migration·혼합 서버·롤백

[후보 SQL](../../test-reports/assets/2026-10-24-codex-resident-contract/candidate-migration.sql)은
리허설 입력이며 정식 migration이 아니다. 기존 migration은 수정하지 않는다.

1. Runner의 기존 제약 위반·unknown 값·resident branch 누락을 읽기 전용 검사한다.
   불일치 시 중단하며 client를 추측해 보정하지 않는다. 합법적인 Claude null/autostart는 보존한다.
2. 새 migration transaction에서 client/default와 permission/resident/client CHECK를
   추가한다. Codex permission에는 IS NOT NULL을 명시해 SQL CHECK의 NULL 통과를 막는다.
3. 모든 서버·REST·웹 reader를 먼저 갱신한다. 그동안 Codex resident 패키지·명령·skill은
   공개하지 않는다. 기존 Claude writer는 client 생략/default로 계속 동작한다.
4. 모든 서버의 계약 일치와 구 서버 종료를 확인한 뒤 인수를 통과한 Codex 후보를 배포한다.
   404·구 parser 400·200 echo 누락은 지원 실패다. 별도 flag/두 번째 lease 테이블은 만들지 않는다.
5. 롤백은 신규 시작 중지 → 각 Codex의 interrupt·실제 종료 확인 → 자기 lease 종료 순이다.
   Codex stopped 기록이 남으면 새 필드를 이해하는 호환 서버를 유지한다. 구 서버로 돌아가려면
   별도 승인된 기록 보존/정리 절차로 Codex 행 0건을 확인해야 한다. 실행 중 삭제·Claude
   재분류를 하지 않으며 확장 열/제약을 즉시 down migration하지 않는다.

리허설에서 구 writer의 auto/자동 시작 덮어쓰기는 막혔지만 session-only DELETE는
성공했다(시험 transaction은 rollback). schema만 바꾼 혼합 서버 운영은 안전하지 않다.
서로 다른 플러그인 버전의 실제 호스트 인수는 이 결과와 별도로 수행한다.

### Main-loop lifecycle과 남은 실측

| 상황 | 연결할 동작 | 완료/거부 증거 |
| --- | --- | --- |
| 시작 | local binding → resident lease/echo → 같은 lock에 resident 등록 | 실패 시 모델 0, 다른 lock/lease 변경 0 |
| idle/gate/handoff | 기존 poll/heartbeat만 사용, actionable work 없으면 모델을 시작하지 않음 | 실제 110분 model calls=0은 C4C에서 확인 |
| 새 cycle | 같은 local session/정책, 새 thread/turn, fresh next/receipt 복원 | 이전 문맥 canary 미노출, 열린 AgentRun/승인 commit/usage 보존 |
| 역할 | 서버가 준 역할만 기존 fresh dispatcher로 호출 | 독립 verifier·기존 격리 유지, runner에 step graph 복제 금지 |
| 정상 terminal | raw terminal 해석 뒤 reader/handler/owned child 정리 후 done | completed만으로 item 완료를 기록하지 않음. 서버 final accept와 다섯 인수 확인 유지 |
| pause | 진행 중 로컬 작업 정리 허용, 새 dispatch·인수·서버 제출 차단 | resume은 fresh 조회. paused/terminal 뒤 새 pipeline_next도 금지 |
| stop/replaced/plan/access/한도 | terminal latch → bridge 신규 요청 차단 → interrupt 1회 → 실제 종료 확인 | 종료 전 release 0, 늦은 제출/rearm 0, successor 변경 0 |
| 종료 미확인 | stopping/unsettled=true와 child 기록 보존 | PID 부재만으로 회수하지 않음. 소유 프로세스 정리 증거 뒤 복구 |
| 서버 rollback/응답 불일치 | 신규 실행 차단, active interrupt, 종료 뒤 자기 local 상태 정리 | 404/replaced 뒤 successor stop 금지. 이미 전송된 요청 효과를 취소했다고 주장하지 않음 |

새 `plugin/runtime/codex-main-loop.mjs`가 main-loop transport를 소유하고 기존
harness-background.mjs가 execution을 주입한다. foreground harness-codex.mjs의 mode
검사는 완화하지 않는다. fresh 역할 연결은 session/client/mode/binding/generation과
서버 lease를 대조하는 내부 경계로 둔다. `createCodexExecution`은 기존 실행 경계의
start/classify/interrupt를 구현한다. 한 cycle의 main-loop App Server는 새 ephemeral
thread이며 역할은 `dispatchFreshRole`의 별도 프로세스·문맥에서 실행한다.

### 격리 후보의 main-loop 도구 계약

`codex-main-loop-tools.mjs`가 다음 허용 목록과 현재 서버 상태 확인을 소유한다.
인증은 trusted helper에만 남기고 모델에는 임의 HTTP·shell·owner·nested-agent 도구를 주지 않는다.

| 도구 | 입력·실행 계약 | 거부·검증 |
| --- | --- | --- |
| pipeline_next, board_get, backlog_get, backlog_list, project_get | 기존 서버 schema; 고정 project/client/runbook 전달 | project 변경, 중지·소유권 상실 뒤 조회 거부; pipeline_next의 지연 전진 유지 |
| resident_dispatch | 선택 key와 독립 verifier용 requiredVerificationPaths만 전달 | fresh pipeline_next가 준 역할·entry·AgentRun으로 dispatchBinding 구성. agent 선택, 이전 결론 전달, opt-in qa/impl-verify 자동 실행 금지 |
| resident_commit | key와 파일별 저장소 상대 path/SHA-256 hash. handoff note는 저장소 내부 절대 경로도 정규화 | 현재 handoff의 plan/report와 현재 구현 workspace 또는 accept의 main-loop 보고서만. 명시적 commit 정책, branch/HEAD·현재 byte·기존 index 확인, hooks/filter/push 실행 금지 |
| resident_git | key, 기존 role_git_read의 operation/paths/ref | 현재 board의 planCommit과 현재 HEAD에 한정; 기존 격리 읽기 backend 재사용 |
| validation_record | 현재 key와 150자 이하 기록 | 현재 in_review와 서버에 기록된 같은 plan의 verifier pass를 요구; owner 승인 권한은 없음 |
| report_submit, acceptance_fail | 기존 서버 schema, main-loop actor·현재 key | fresh accept 확인. 성공 보고서는 실제 현재 main-loop artifact commit과 byte 일치 필요. 5개 인수 판단은 모델이 실제 파일/명령/서버 증거로 수행 |
| role_file_read/list/search/write, role_command_exec | 기존 scoped broker schema | root 읽기, scratch와 현재 accept 보고서만 쓰기. 실제 build/test는 LPAC snapshot에서 실행; 결과·누락·실패를 그대로 전달 |

`resident_dispatch`는 handoff를 보유한 경우 `confirmCommitHandoff`의 확정된 commit을
전달해 같은 AgentRun을 fresh 역할에서 계속한다. 역할의 직접 Git 쓰기는 계속 금지한다.
모든 모델 도구는 같은 local binding과 cycle generation을 검사한다. domain mutation과
dispatch·commit 전에는 실제 runner beat/echo를 확인한다. 로컬 파일 읽기와 진행 중
역할의 ownership monitor는 최근 공통 heartbeat 및 local lock을 확인한다. Pause 뒤
새 dispatch·commit·서버 제출은 금지한다. terminal latch 뒤 도구 응답은 완료로 채택하지 않는다.
기존 역할의 로컬 작업은 종료를 기다리지만 Pause 뒤 새 서버 제출을 허용하지 않는다.
commit 목록의 현재 artifact 누락·파일 중복, Git 조회 인자와 파일 쓰기 hash 형식은
-32602, 허용된 baseline blob 부재는 -32004, 쓰기 전
현재 파일 hash 불일치는 -32005로 교정할 수 있다. 현재 내용을 다시 읽고 정확한 hash를
사용해야 하며 실제 권한·소유권 거부와 쓰기 도중의 identity/내용 변경은 계속 거부한다.
Windows에서는 readOnly·다른 workspace·관리 파일 경계를 대소문자 별칭으로 우회하지 못한다.
ref를 갱신한 뒤 index 설치가 실패하면 소유 index.lock을 보존하고 자동 reset하지 않는다.

도구 bridge는 요청을 직렬화하고 크기·개수·queue 상한을 적용한다. 중지 때 bridge의
신규 요청을 차단하고 실제 역할·main-loop interrupt와 process/handler 정리를 기다린다. 확인하지 못한
child는 registry에 남기고 기존 unsettled 경로로 lock을 보존한다. capability URL은
cycle마다 새로 만들며 다음 cycle에서 이전 URL을 재사용하지 않는다.
교정 가능한 인자·누락 경로 오류를 제외한 도구 거부도 같은 종료 경계를 적용한다.
이미 대기열에 들어온 dispatch를 포함해 후속 호출을 막고 현재 turn을 interrupt한다.
그 뒤 늦은 completed가 도착해도 policy 실패를 성공으로 분류하지 않는다.

수동 명령은 `harness-background.mjs --start --client codex --root <checkout> --propose yes|no`
및 기존 `--stop`·`--status`다. `--run`은 저장된 session/client/binding을 대조한다.
Codex의 `--autostart-on/off`·`--from-autostart`는 모델/서버 호출 전에 거부한다.
설치 skill은 이 명령만 연결하며 공개 지원·출시 인수를 대신하지 않는다.

### 변경 파일·공개 API·최종 산출물

아래 경로는 현재 구현·검증 목적지다. 신규 runtime/skill/test와 migration이 존재한다.
정식 migration 경로는 `prisma/migrations/20261024020000_runner_client/migration.sql`이다.

| 소유 경로 | 변경·보존할 symbol/산출물 | 검증 목적지 |
| --- | --- | --- |
| packages/core/execution/runner.mjs, client-runtime.mjs | CLIENTS 유지, RUNNER_PERMISSIONS의 scoped·조합 판정 | runner.test.mjs; plugin/lib/execution/runner.mjs는 scripts/plugin-lib.mjs로 생성 |
| packages/core/plans/entitlement.mjs | 기존 RESIDENT_RUNNER_PLAN_GATE 보존, CODEX_RESIDENT_RUNNER_PLAN_GATE 고정 문구 추가; server/helper가 client로 선택 | entitlement.test.mjs·실제 PLAN_REQUIRED body; plugin/lib/plans/entitlement.mjs 동기화 |
| prisma/schema.prisma, prisma/migrations/20261024020000_runner_client/migration.sql | Runner.client·CHECK, 생성 src/generated/prisma | tests/server/integration/runner-client-migration.test.ts, runner-client.test.ts, 기존 runner-lease.test.ts |
| src/server/runners/contracts.ts, runner-service.ts | RunnerClient·Record/Holder/Op/Result, RUNNER_SELECT, 모든 op·readView/readSummaries | runner-service.test.ts, 실제 runner-lease.test.ts |
| src/server/runners/api.ts, api.server.ts | runRunnerOp/readRunnerState/readRunnerSummaries의 기존 공개 경로 유지 | tests/server/server-public-api.test.ts; 시험 전용 export 금지 |
| src/server/rest/runner-handler.ts | parseRunnerRequest·runnerResponse의 실제 body | runner-handler.test.ts, 실제 route integration |
| src/server/rest/runner.ts, src/app/api/runner/route.ts | 기존 조립·인증 범위 유지 | /api/runner JSON·403/409/400과 DB 상태 |
| plugin/runtime/runner-client.mjs, plugin/bin/harness-session.mjs | runnerCall binding, holdsLease/beatOnCheck/stopOnRelease의 Codex resident 분기 | harness-watch.test.mjs, harness-session.test.mjs, plugin/runtime/runner-client.test.mjs, codex-resident-session.test.mjs |
| plugin/bin/harness-background.mjs, plugin/runtime/background.mjs, local-session.mjs | client별 connection/start/finish/status·execution; Claude drain 보존 | 기존 background/loop/windows/resident-execution/session 시험 |
| 신규 plugin/runtime/codex-main-loop.mjs, 기존 codex-thread.mjs | bound main-loop와 기존 fresh role, foreground 진입 검사 유지 | 신규 plugin/runtime/codex-main-loop.test.mjs, codex-bridge.test.mjs·native 역할 시험 |
| plugin/runtime/codex-main-loop-tools.mjs | createMainLoopTools의 현재 server binding·도구 허용 목록·validation_record·commit/인수 연결 | codex-main-loop-tools.test.mjs의 HTTP 직렬화·abort·권한/인수 경계와 실제 native 파이프라인 |
| plugin/runtime/resident-commit.mjs | commitResidentArtifacts·residentGit·ResidentCommitInputError; scoped commit·현재 byte·기존 index·Windows 경로 경계 | resident-commit.test.mjs의 실제 Git/HTTP·hook/filter 거부·index 보존·경로 교정·Windows 별칭 |
| plugin/runtime/role-git.mjs, codex-thread.mjs, codex-main-loop.mjs | RoleGitInputError·RoleGitPathMissingError를 두 bridge에서 교정 가능하게 전달; 임의 ref/경로는 계속 거부. 현재 HEAD index로 계획 이후 commit된 신규 파일의 diff 보존 | plugin/bin/harness-role-git.test.mjs의 실제 Git·부재·신규 파일·금지 경로, codex-bridge.test.mjs와 codex-main-loop-tools.test.mjs의 HTTP 교정 후 계속 실행 |
| plugin/runtime/role-files.mjs, codex-thread.mjs, codex-main-loop.mjs | RoleFileInputError·RoleFileRevisionError와 두 bridge의 -32602/-32005; 쓰기 전 hash 불일치의 재읽기만 허용하고 실제 권한·중간 변경은 계속 거부 | plugin/bin/harness-role-files.test.mjs 및 codex-main-loop-tools.test.mjs의 실제 HTTP·byte 불변·정확한 hash 재시도·protected 경로 |
| src/fsd/widgets/turn-banner/api/turn-data.server.ts, model/runner.ts | runnerFacts→TurnRunner client 전달·scoped/Codex 복구 문구 | api/turn-data.test.ts, model/runner.test.ts, ui/turn-banner.test.ts |
| 같은 slice의 index.ts, index.server.ts, ui/runner-line.tsx, ui/turn-banner.tsx, ui/next-step.tsx | 공개 API·Pause 보존; 저장 client로 full/compact 표시 | CLI 선택 UI 값과 별개인 실제 rendered body |
| src/fsd/pages/project-list/api/project-list.server.ts, ui/project-list-page.tsx | readRunnerSummaries→공개 runnerFacts→RunnerShort | ui/project-list-page.test.mjs, model/project-list-copy.test.ts와 실제 목록 HTML |
| docs/conventions/product-copy.md | Codex/scoped/복구·플랜 안내, 기존 Claude copy-lock 보존 | full/compact HTML, src/fsd/shared/lib/copy-lock.test.ts |
| plugin/bin/harness.ps1, plugin/.claude-plugin/plugin.json, plugin/.codex-plugin/plugin.json | client에 맞는 helper dispatch·같은 상향 버전, Codex skills root 유지 | 기존 harness-background.test.mjs, harness-background-windows.test.mjs와 실제 설치 manifest |
| plugin/skills/background/SKILL.md, plugin/codex/skills/harness-background/SKILL.md | Claude 기존 skill 보존; Codex manual start/stop/status는 위 저장 계약, 자동 시작 제외 | 실제 loader의 기존 init/run/resume/완전한 verifier 보존 및 새 skill body; 출시 인수 전 공개 금지 |
| scripts/windows/package-windows-plugin.mjs | 원본 plugin tree와 완전한 verifier를 합치는 기존 패키징 유지 | 실제 설치 cache 전량 hash와 windows-package.json inventory; 공개된 같은 버전의 body 변경 금지. 격리 후보는 별도 catalog/profile/hash로 구분 |
| docs/architecture/protocol.md, server.md, runtime 보고서 | 구현 시 현재 API·공개 symbol·지원 판정 갱신 | 문서 검사와 실제 서비스/설치 관찰 |

서버 타입은 runners/contracts.ts를 통해 REST/FSD api adapter에 전달하고 FSD는
runnerFacts에서 날짜/client를 직렬화한다. 프로젝트 목록은 turn-banner의
index.server.ts/index.ts만 소비한다. 신규 server 내부 import나 public export는 필요 없다.
UI·skill의 최종 근거는 계획 본문이 아니라 실제 copy-lock/HTML/설치된 body다.
Codex manifest의 skills root 아래 신규 skill을 배치한다. 폴더 존재나 설명문만으로
실행 지원을 선언하지 않는다. 위 고정 명령 payload와 저장 client의 stop/status 동작을
설치본에서 확인하고 OS별 지원 판정은 별도 인수로 남긴다.

### TASK-C4B-01: 계약과 migration 연결

satisfies: REQ-DUAL-018, REQ-DUAL-019
preserves: INV-DUAL-001, INV-DUAL-005
governed-by: CON-DUAL-002, CON-DUAL-003, CON-DUAL-008

사용자가 승인한 계약에 따라 위 core/DB/REST/helper와 UI serialization을 연결했다. BLK-MIN-01은 출시 조건으로 유지한다. legacy default·Codex NULL 거부·client 간 동일
session/host 충돌을 실제 DB에서 확인한다. 검증은 VFY-C4B-01/02/05다.

### TASK-C4B-02: bound main-loop와 종료 확인

satisfies: REQ-DUAL-018, REQ-DUAL-019
preserves: INV-DUAL-002, INV-DUAL-003, INV-DUAL-004
governed-by: CON-DUAL-004, CON-DUAL-005, CON-DUAL-007

실측 도구/transport를 반영한 뒤 execution adapter를 연결한다. 같은 session·cycle별
새 문맥·fresh 역할·receipt·handoff와 stop settlement를 검증한다(VFY-C4B-03/04).

### TASK-C4B-03: 표시·패키징·C4C 인계

satisfies: REQ-DUAL-015, REQ-DUAL-017, REQ-DUAL-018, REQ-DUAL-019
governed-by: CON-DUAL-002, CON-DUAL-008

저장 client로 표시·복구 문구를 선택하고 copy-lock과 실제 렌더를 함께 갱신한다.
C4C 전에는 격리 설치 후보로 시험하며 foreground 안내·Claude 자동 시작은 유지한다.
운영 seed·서비스 릴리스·패키지 공개는 준비된 후보·검사·복구안을 대상으로 별도 처리한다.
검증은 VFY-C4B-05/06이다.

### C4B 검증 목적지와 완료 조건

| 검증 | post-change 확인 내용 | 현재 판정 |
| --- | --- | --- |
| VFY-C4B-01 | 정식 migration legacy rows/default/NULL·unknown, 구 writer/rollback과 데이터 보존 | 실제 정식 migration·integration PASS; 후보 DDL 111항목은 이전 별도 증거 |
| VFY-C4B-02 | 실제 REST 모든 op, client/session/host 충돌, stopped 재전송, autostart 보호, busy/echo/400/404, 인증·플랜·pause | REST/DB integration 146개와 실제 cap/auth·Pause/Resume PASS |
| VFY-C4B-03 | 실제 main-loop·commit·독립 verifier·서버 lease, cycle별 문맥·receipt/usage | 최종 fresh A→Z의 두 browser gate·역할·handoff·5개 인수 및 acceptedAt PASS |
| VFY-C4B-04 | stop/ownership/timeout/late, interrupt 1회, release·successor·unsettled | 실제 pending main-loop/역할 takeover·같은 AgentRun 재개·owner stop PASS; 세부 실패 경계는 결정적/모의 회귀로 구분 |
| VFY-C4B-05 | DB→select→RunnerView→runnerFacts→full/compact/project-list, copy-lock·Pause/복구 | 최종 production snapshot의 실제 Edge와 web 777개 PASS |
| VFY-C4B-06 | 실제 loader/hash/verifier/기존 skill 보존, OS별 C4C·110분 | 양쪽 0.5.20→0.5.21 설치와 2,229개 hash PASS; 최종 A→Z payload의 단일 110분·HTTP count PASS. clean host·다른 OS native·출시는 미완료 |

실행한 [계약 리허설 보고서](../../test-reports/completed/2026-10-24-codex-resident-contract.md)와
현재 실제 구현 검증은 구분한다. npm run check, verify:fsd, verify:server,
test:architecture, test, test:web, test:server, test:server:integration, build를 수행했고
실패 후보와 최종 통과, source별 재사용한 범위는 실제 resident 보고서에 보존한다.
새 integration 파일은 기존 glob에 포함하고 TEST_DATABASE_URL은 격리 DB만 사용한다.
db:generate 산출물·plugin/lib 복사본·REST body·HTML·설치 캐시를 각각 확인한다.

C4B 구현 완료에는 위 여섯 검증 중 현재 Windows 격리 후보에 해당하는 직접 증거가 필요하다.
물리적 clean Windows·다른 OS·공개 배포는 별도 인수로 남긴다. 후보 SQL PASS는
정식 migration의 통과를 대신하지 않는다. C4B-02 transport/명령 payload는 해당
구현 전에 계약으로 고정하고, 실제 인수 결과를 BLK-C4R-01에 기록한다.


## Phase C4C: OS별 실제 인수와 안내

**부분 실측 완료, 전체 지원·출시 인수 BLOCKED.** 현재 Windows의 실제 A→Z·취소·재개와
같은 최종 0.5.21 payload의 단일 110분 유휴를 확인했다. 최종 확인까지 6,601초 동안
모델·AgentRun·사용량 증가는 0이고 idle HTTP heartbeat·pipeline poll은 각각 108회,
모두 200이었다. timestamp 관찰 109회는 setup의 첫 신호를 포함하므로 HTTP count와 구분한다.
[안정성 후속 보고서](../../test-reports/completed/2026-10-24-codex-runtime-stability.md)에
시작·종료 전량 hash, phase별 요청, 실제 정리와 이전 후보의 경계를 연결한다.
남은 실제 환경에서 TASK-C4-02/E12를 완료한다. Windows와 macOS 각각의 host,
CLI/package hash와 방식으로 실제 110분 no-model idle, 작업 발견, browser gate,
permission/handoff/cap, stop·늦은 이벤트·실제 자식 종료·동일 항목 재개를 기록한다.
각 OS가 통과하기 전 그 OS 지원을 안내하지 않는다. 기존 Windows 최소 설치와 양방향
인수도 유지한다. 검증된 범위에서만 Codex background skill/CLI와 제품 안내를 공개한다.

### macOS native 실행의 남은 경계

[공통 계약 CI](../../../.github/workflows/macos-runtime-contracts.yml)는 macOS 15 arm64와
x64에서 2026-10-25 기준 각각 529 PASS / 20 SKIP다. [GitHub runner 목록](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)의
`macos-15`·`macos-15-intel`을 사용하며 실제 실행 로그의 `darwin/arm64`·`darwin/x64`도 확인했다.
이 결과는 아래 Windows 의존을 없애거나 실제 client 권한·인증·종료를 검증한 결과가 아니다.

| 현재 owner와 경계 | 남은 구현·검증 |
| --- | --- |
| `plugin/runtime/codex-main-loop.mjs:createCodexExecution`의 `installedWindowsRuntime`·`verifyNativeRuntime`·`createRoleCommands` | macOS resident용 bounded 실행 backend를 연결하고 원본 파일·인증·network 접근 차단 및 실제 종료 acknowledgement 검증 |
| `plugin/runtime/role-commands.mjs:runNativeCommand`의 win32 검사, PowerShell helper, `role_command_exec`의 cmd.exe 계약 | OS별 command/snapshot/runtime 계약과 설치 manifest를 정한 뒤 실제 macOS 허용·거부·취소 시험. shell 권한을 넓혀 우회하지 않음 |
| `plugin/runtime/codex-main-loop-tools.mjs`의 `createRoleGit`, `role-git.mjs`와 command backend | data-only Git 읽기·허용 ref/path·snapshot 결과·원본 write 차단을 새 backend에서 재검증 |
| `plugin/runtime/codex-thread.mjs:dispatchFreshRole`의 기존 POSIX foreground 경로 | foreground의 shell 허용 조건을 resident 지원으로 간주하지 않음. fresh 역할·main-loop·receipt·ownership의 실제 연결 인수 필요 |

macOS native backend를 추가할 때 위 owner·도구 schema·runtime packaging·권한/종료 검증을
같은 변경으로 연결해야 한다. 현재 CI에는 client 인증이나 private source를 전달하지 않는다.

2026-10-24 [native 가능성 시험](../../test-reports/completed/2026-10-24-codex-runtime-portability.md)은
Seatbelt 아래의 부모·자식이 합성 foreign/auth/Git/env 경로와 TCP loopback에 접근하지 못함을
arm64/x64에서 확인했다. 그러나 `detached: true` 자식은 부모 그룹을 종료한 뒤에도 살아 있었다.
시험 자식은 별도로 종료·확인했으며 제품 backend는 추가하지 않았다. **프로세스 그룹 종료를
quiescence ack로 쓰는 구현은 불가**하다. 다음 backend는 세션/그룹을 이탈하는 자식과
fork/exit 경쟁까지 포함한 소유권 추적·종료 근거를 마련한 뒤 위 command/Git/packaging 계약을
연결해야 한다. 일시적인 PID 목록·부모 종료만으로 lock을 해제하지 않는다.

2026-10-25 사용자의 진행 지시에 따라 [소유권 API 시험](../../test-reports/completed/2026-10-25-macos-descendant-ownership.md)을
arm64/x64에서 수행했다. 두 환경 모두 NOTE_TRACK을 ENOTSUP 45로 거부하며, 부모
종료·출력 EOF·빈 PID snapshot 뒤에도 orphan 4개가 남았다. 일반 fork 알림은 여러
fork를 합치고 자식 PID를 주지 않았다. 따라서 kqueue 알림과 PID polling을 조합하는
구현은 전체 소유권 해법으로 채택하지 않는다. 시험용 oracle로 확인한 후손은 모두 종료했다.

다음 단계의 선행 조건은 실행 전 등록, fork/exec/setsid 이후의 원자적 소유권 상속,
helper 강제 종료 시 전체 중단, 재사용 안전한 identity와 전체 종료 관찰을 제공하는
지원 메커니즘의 확보다. 현재 확인한 일반 plugin 경로에는 그 근거가 없다.
launchd 기본 그룹 정리·coalition·Endpoint Security의 문서상 범위와 권한 제약은
위 보고서에 구분했다. privileged broker나 별도 격리 환경이 필요하면 설치·권한 계약을
별도 제안에서 먼저 검토한다. 현행 최소 설치 요구를 임의로 변경하지 않으며, 두
아키텍처의 stop·timeout·helper death·fork 경쟁 인수가 갖춰지기 전에는 command/Git/
packaging backend를 연결하지 않는다. 이번 시험은 새 sandbox나 실제 client 인수가 아니다.

이후 [launchd lifecycle 실측](../../test-reports/completed/2026-10-25-macos-launchd-ownership.md)은
두 아키텍처의 user/gui 영역에서 자연 종료·서비스 루트 SIGKILL·bootout·timeout·fork
요청 20조합을 검증했다. 같은 그룹의 자식은 정리됐지만 detached survivor가 남았다.
검증한 launchd job 설정을 quiescence 경계로 채택하지 않는다. 88개 관찰 대상의 종료와
20개 서비스 제거는 fixture cleanup이며 제품 명령의 종료 보장이 아니다.
coalition 종료 요청도 살아 있는 task의 일괄 kill로 해석하지 않는다. 다음 구조 후보의
지원 API·전체 종료·설치·권한·명령 호환성 조건을 먼저 입증하며, 아직 모든 macOS 해법이
불가능하다고 결론 내리지 않는다. 기존 Windows payload와 실제 인수 상태는 유지한다.

같은 보고서의 0.5.21/0.5.22 양방향 인계는 현재 Windows의 공유 session 계약·Claude idle
resident 및 실제 양쪽 client 업데이트만 검증한다. Codex 모델 resident의 실제 혼합 host,
물리적 clean Windows, macOS 인증 A→Z와 출시 gate는 남아 있다.

2026-10-25 [coalition 실제 검증](../../test-reports/completed/2026-10-25-macos-coalition-access.md):
양쪽 macOS 일반 사용자에서 resource/jetsam 생성과 명시적 spawn은 모두 EPERM이었다.
소속 조회·상속은 가능하지만 부모와 공유하는 coalition이며 전용 실행 소유권이 아니다.
생성이 거부돼 전체 후손 종료는 미실행이다. 이 후보는 현행 권한 조건에서 채택하지 않으며,
검증된 대안이 없는 상태에서 backend 연결·권한 완화·지원 선언으로 진행하지 않는다.

## Readiness and Handoff

2026-10-25 [상태 조회·역할 진단 회귀 수정](../../test-reports/completed/2026-10-25-runtime-state-and-role-diagnostics.md)은
0.5.24 후보에 반영했다. 실제 저장 중간 상태의 잘못된 corrupt-state와 역할 도구 진단
누락은 재현·수정했지만 과거 세 intermittent 및 관찰 누락 파일 읽기의 개별 원인은
확정하지 못했다. macOS 27 descendant-scoped Endpoint Security에는 root/TCC가 필요
없다는 Apple 문서를 확인했으나 entitlement·전체 종료·helper death 검증은 별개다.
새 후보의 실제 모델 A→Z·110분 인수와 macOS backend는 이번 회귀 범위에 포함하지 않는다.

C4A와 현재 Windows C4B의 구현·격리 연결 검증은 완료했다. C4C는 이 호스트의
A→Z·lifecycle 및 최종 payload의 110분·HTTP count를 추가했지만 물리적 clean Windows·macOS native backend/실제 인수·
혼합 호스트·출시 gate가 남아 있다. 전체 REQ-DUAL-018/019와 제안서의 pending/blocked는
유지한다. [실제 resident 보고서](../../test-reports/completed/2026-10-24-codex-resident-live.md)는 A→Z와 이전 후보,
[안정성 후속 보고서](../../test-reports/completed/2026-10-24-codex-runtime-stability.md)는 최종 payload idle·복구·macOS 공통 CI의 기준이다.

이후 변경은 위 C4B 계약과 남은 C4C 인수 조건을 따른다. 과거 C4A 인계는 다음과
같이 제한해 수행했다: 이 문서의 C4A 세 작업만 수행한다. 먼저 현재 HEAD·사용자 변경·architecture와
기존 Claude 테스트를 재확인한다. execution 경계와 fake 시험을 완성하고 기존 Claude
동작을 보존한다. live Codex 실행, DB/REST 변경, permission 완화나 사용자 command가
필요해지면 그 변경은 C4B에 남기고 C4A를 확대하지 않는다. 검사 결과와 skip, 변경 경로,
남은 실제 증거를 보고한다. C4A 완료만으로 C4B에 자동 진입하지 않는다.

표준 traceability 검사 입력은 이 문서·상위 active 계획·원본 completed SDD다.
strict는 역사적/후속 범위가 섞인 전체 graph에 적용하지 않는다. 문서 검사는 구현 시험을
대신하지 않는다. C4A VFY의 실제 로컬 결과는 아래 기록과 정제된 evidence를 따른다.

2026-10-22 문서 검증: 위 3개 문서의 standard traceability는 PASS다. 기존 parent의
legacy verifies 경고 13개는 유지하며, 신규 Task 3개와 VFY 3개를 연결했다. 두 active
문서의 로컬 링크와 `git diff --check`도 PASS다. 이번 변경은 문서뿐이며 C4A 구현,
새 runtime 시험과 실제 모델 호출은 수행하지 않았다.

## Runtime Stability Follow-up — 2026-10-24

테스트·CI source `2e7996180f910b1a56c236454c8bec000ec24e39`에서 sign-in 실패를 4번째 반복에
`guard-busy`로 재현했다. fixture가 guard 기록 중 poller를 강제 종료하는 경쟁이었다.
복구 가능 종료를 guard 밖에서 재현하고 abandoned guard의 거부·상태 불변을 별도 검증했다.
제품 정책·shipped payload는 바꾸지 않았다. 수정 후 sign-in 20회와 core/plugin
537 PASS / 2 SKIP, macOS 양쪽 각 521 PASS / 18 SKIP 및 Windows native CI가 통과했다.
native helper 진단은 passive capture를 붙인 20회와 전체 회귀에서 통과했으나 과거 원인은
미확정이며, 별도 corrupt-state도 해결로 표시하지 않는다. 실제 최종 payload idle와 정리는 C4C 기록을 따른다.

## C4B Implementation and Windows Observation — 2026-10-24, 앞선 checkpoint

최종 source `893a24e7f1e4d5361727aa24724be3f9f8bc3503`의 설치 후보로 실제 새 계획·독립 verifier·두 browser gate·
구현·보고서·server acceptance를 확인했다. 서버/DB 계약, 저장 client UI, 실제 설치
전량 hash, native takeover·동일 receipt 재개·Pause/Resume·cap/auth를 범위별로 기록했다.
공통 poller는 실제 6600초 동안 모델/AgentRun/사용량 증가 없이
서로 다른 heartbeat 108회를 관찰했다. fake clock이나 여러 짧은 실행을
합산한 결과가 아니다. 유휴 후보와 최종 후보의 모델 경로 차이는 전량 비교로 명시했다.

최종 core/plugin 회귀는 536 PASS / 2 SKIP다. 앞선 sign-in recovery 및 native helper
거부 진단의 간헐 실패 원인은 미확정으로 남기고, 후속 통과를 원인 해결로 단정하지 않는다.
단발 corrupt-state와 별도로 재현·수정한 successor status race도 구분한다.
전체 사전 reconciliation의 clean pass를 소급 주장하지 않으며, 현재 범위의 구현·실측과
남은 외부 인수를 이 문서와 [실제 resident 보고서](../../test-reports/completed/2026-10-24-codex-resident-live.md)에 연결한다.

## C4A Implementation Results — 2026-10-23

`runResident`는 명시적인 execution 경계로 start/classify/stopMode를 받는다.
실제 연결은 Claude drain이며, interrupt adapter는 테스트 안에만 있다. 종료 요청은
멱등이고 settlement 전에는 다음 실행으로 넘어가지 않는다. terminal stop 이후
late success가 도착해도 새 overview나 결과 보고로 바뀌지 않는다.

child settlement 실패를 삼키던 경로를 제거하고 `resident-run-unsettled`에서
자기 lock을 stopping으로 보존한다. stopping이거나 tracked child가 남아 있으면
PID 부재만으로 다음 start/반복 stop이 잠금을 회수하지 않는다. 실제 CLI에 주입한
settlement 실패에서 서버 stop·결과 보고가 없고 lock/child가 남는 것을 확인했다.

2026-10-23 후속 수정: 위 회수 금지가 unsettled가 아닌 잠금에도 걸려, 실행 중 재부팅이나 강제 종료로 죽은
runner의 checkout은 start·`--stop`·로그온 시작이 모두 `locked`로 막혔다(C4A 전에는 회수됨). 이제 회수 금지는
unsettled 경로가 남기는 `unsettled:true` 잠금에만 적용한다. 그 밖의 잠금은 상주 프로세스와 기록된 child가 모두
없으면 C4A 전처럼 회수한다. TASK-C4A-02가 유지하기로 한 기존 Claude drain 동작과 같다.

| 검사 | 결과 |
| --- | --- |
| 변경 전 Claude 집중 기준 | 29 PASS |
| C4A 집중 시험 | 49 PASS |
| `npm run check` | PASS; scripts 186 PASS / 2 SKIP |
| `npm test` | 460 PASS / 17 SKIP |
| FSD/server 경계 | PASS |
| `npm run test:architecture` | 136 PASS / 2 SKIP |
| 기본 `npm run build` | FAIL — 로컬 Turbopack CSS worker의 port binding에서 EPERM |
| Prisma generate + 지원되는 `next build --webpack` | PASS; 기본 빌드와 별도 결과로 보존 |

[소스 지문과 검사 기록](../../test-reports/assets/2026-10-23-codex-resident-c4a/checks.json)에
명령·실패·skip·모의 범위를 기록했다. Codex transport·서버 API·DB·private 본문·Codex skill·권한은
변경하지 않았다. 추가 설치 ZIP은 생성하지 않았으며, 앞선 0.5.17 준비물은 C4A 변경을
포함하지 않는다. 향후 배포 후보는 버전을 올려 새 inventory로 패키징해야 한다.

## Windows Host Contract Observation — 2026-10-24, 앞선 단일 문맥 시험

현재 Windows에서 native Codex App Server의 실제 `turn/completed` 상태
`completed`와 `interrupted`를 관찰했다. 별도 main-loop 문맥이 현재 runbook을 사용해
명시적으로 허용된 고정 보고서만 commit했고, pending MCP 중 stop 후 조기 release·
경쟁 client 시작·늦은 commit이 거부됐다. 실제 프로세스·bridge handler 종료 뒤 lock을
반납했다. owner 환경 변수 전달·외부 읽기·제품 쓰기·gate/nested tool 호출도 차단했다.

이것은 0.5.19의 공통 helper와 test-only bridge/resident lock fixture를 쓴 bounded
host 시험이다. 제품 main-loop adapter·서버 lease·fresh 역할 전체 orchestration·cycle별
문맥 교체·110분 idle은 실행하지 않았다. BLK-C4R-01의 raw terminal/좁은 commit/stop
계약을 부분적으로 뒷받침하며 BLK-C4R-01/02 또는 C4B readiness를 해제하지 않는다.
현재 foreground 0.5.20의 두 browser gate 전체 인수와도 구분한다.
[범위별 증거](../../test-reports/completed/2026-10-24-codex-windows-gates.md)를 따른다.

## Windows Native Cycle Observation — 2026-10-24

현재 PC만 가능하다는 사용자 확인 뒤 설치된 0.5.20의 실제 runResident 루프에 시험용
native execution adapter를 주입했다. 두 cycle이 별도 App Server 프로세스/ephemeral
thread로 완료되고 세 번째는 pending MCP에서 interrupted로 끝났다. 첫 canary는
두 번째 문맥에서 관찰되지 않았으며 같은 local session/정책과 합성 receipt id를
유지했다. 구 generation bridge 요청은 거부됐다. native 동시 실행 최댓값은 1이었다.

공통 루프가 interrupt를 1회 호출했고 stop 뒤 새 overview·result beat·model start는
0회였다. 프로세스·listeners·handlers·tracked children 정리 뒤 자기 lock을 반납했다.
공통 루프 회귀 34개도 통과했다. 실제 lease/overview/receipt 서버 대신 시험용 응답을
사용했으며 operator Node로 설치 모듈을 로드했다. physical clean Windows, 제품 lease,
fresh 역할 orchestration, 서버 receipt/usage, 실제 110분 idle은 이 결과에 포함되지 않는다.
[native cycle 보고서](../../test-reports/completed/2026-10-24-codex-native-cycles.md)의 제한을
유지하고 BLK-C4R-01/02·BLK-MIN-01 및 C4B/C4C 완료로 승격하지 않는다.
