---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-10-22"
approved-by: "requesting-user"
approved-at: "2026-10-22"
approval-scope: "기존 runner 재사용과 Codex 실행·완료·취소 연결의 최소화 방향으로 실행 계획을 구체화한다. 첫 지원 범위는 사용자가 선택한 Pro/Max 상주형이며, 실제 인수 전에는 공통 실행 경계와 모의 테스트 준비 범위를 분리한다. 기존 실제 인수 승인과 출시 조건은 유지한다."
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

제품 source 기준은 `e71684751923a3bf4ca03e127be83112cb56039f`/plugin `0.5.17`이다.
설치 후보와 private source는 상위 문서의 2026-10-22 준비 기록을 따른다.
현재 아키텍처는 Claude의 상주 실행기와 Codex foreground만 지원한다. 아래 Codex
상주 동작과 경로는 **예정 설계**이며 현재 지원 기능으로 문서화하거나 배포하지 않는다.

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
문서 끝의 실행 기록을 따르며 실제 Codex 연결에 관한 행은 계속 미완료다.

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

예정 주입 지점은 `deps.execution` 하나다. `start`·`classify`·`stopMode`를 가진다.
새 registry, 범용 plugin framework, 두 번째 polling loop는 만들지 않는다.

- `start({ generation })`은 `{ done, end(reason) }`를 반환한다. 실행 identity와 로그는
  해당 adapter가 고정한 local session/nonce에 묶는다. `generation`은 루프가 증가시키며
  이전 run의 완료·취소 신호가 다음 run의 상태를 바꾸지 못하게 한다.
- `classify(settlement)`는 `{ outcome, line }`을 반환한다. `outcome`은 기존 success,
  error, timeout, branch와 취소를 구분하는 cancelled다. line은 기존 길이 제한을 따른다.
  모델 turn 완료는 item 완료의 증거가 아니며, 작업 진전과 최종 accept는 fresh 서버 상태로 판단한다.
- `stopMode`는 `drain` 또는 `interrupt`다. 기본 Claude adapter는 drain,
  Codex 모의 adapter는 interrupt를 명시한다. branch/timeout은 기존처럼 종료 요청을 한다.
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
| 웹 Pause | 새 dispatch·인수·아직 시작하지 않은 제출 금지 | 이미 시작한 역할은 완료할 수 있음; 다음 단계는 대기 | 같은 session 유지 |
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
main-loop transport/commit 경계가 확인되기 전에는 Codex live adapter를 연결하지 않는다.

## Phase C4A: 실행 경계와 모델 없는 계약 테스트

**소스 구현·로컬 검증 완료(2026-10-23).** 기본 실제 인수 전 허용한 준비 단계이며,
Codex 자동 실행 기능을 노출하지 않는다. REQ-DUAL-018/019 완료에 기여하지만 실제
요구사항 완료는 C4C가 소유한다. 사용자의 진행 지시에 따라 아래 세 작업을 구현했다.

preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-003, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-003, CON-DUAL-005, CON-DUAL-008

허용 경로는 `plugin/runtime/background.mjs`, `plugin/bin/harness-background.mjs`,
기존 `plugin/bin/harness-background-loop.test.mjs`, `harness-background.test.mjs`,
필요한 신규 `plugin/runtime/resident-execution.mjs`와
`plugin/bin/harness-resident-execution.test.mjs`다. 신규 경로는 제안이며 아직 없다.
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

**BLOCKED.** 상위 BLK-MIN-01의 기본 인수와 아래 연결 계약 증거가 선행한다.
TASK-C4-01의 실제 연결 부분이며 C4A의 fake 통과로 진입하지 않는다.

**BLK-C4R-01:** C4B 진입 blocker. 역할 helper는 있으나 실제 resident main-loop의
런북·허용 commit·권한/credential 경계·terminal/cleanup 증거가 없다. 표의 main-loop와
결과 계약을 실제 bounded host에서 확인하기 전 live adapter 구현 계약을 확정하지 않는다.

**BLK-C4R-02:** C4B 진입 blocker. 현행 permission enum/DB check와 client 없는
실행기 표시 계약을 Codex에 그대로 적용할 수 없다. 명시적 permission/client 계약,
migration·legacy 호환·rollout/rollback을 상세 계획과 현재 architecture에 반영한 뒤
server/UI 연결을 구현한다. C4A의 내부 경계 작업에는 영향을 주지 않는다.

| 연결 전 조건 | 현재 확인한 차이 | 필요한 증거/변경 |
| --- | --- | --- |
| main-loop 실행/권한 | 기존 App Server helper는 역할용이다 | 새 main-loop context의 런북 사용, receipt 보존, 허용 commit/handoff, owner gate/credential 차단, 실제 interrupt/terminal/child cleanup을 bounded host 시험으로 고정 |
| 결과 계약 | raw Codex main-loop terminal 관찰이 없음 | 실제 transcript의 정제된 fixture로 adapter 파서를 검증. 예상 JSON이나 Claude subtype을 대입하지 않음 |
| permission 보고 | REST·Runner DB check가 auto/allowlist만 수락 | Codex의 role-scoped 권한을 나타낼 명시적 값과 호환 migration/서버 검증 계획 확정. auto/allowlist로 허위 보고하지 않음 |
| client 표시 | Runner/client 구분과 복구 문구가 없음 | 실행기 metadata에 한정한 client 정보 및 legacy default Claude 설계. BoardItem/PipelineRun/AgentRun/token/usage identity에는 client를 추가하지 않음 |
| resident 소유권 | Codex helper는 foreground만 허용 | 새 bound resident entry와 실제 session/generation 검증. 임의 session ID 채택이나 foreground 제한 완화 금지 |
| 안전한 release | background finish의 현재 계약은 Claude용 | done/terminal/bridge/child acknowledgement를 확인하고 자신의 local/서버 lease만 반납하는 연결 검증 |

수정 후보는 `harness-background.mjs`, `harness-session.mjs`, `local-session.mjs`,
Codex runtime/별도 resident entry, runner core·server·REST·DB migration·turn-banner다.
정확한 파일/서버 계약과 실제 transport는 위 증거를 얻은 뒤 C4B 상세 계획에서 확정한다.
두 클라이언트의 단계 흐름을 공통 runner에 복제하거나 인증 파일을 복사하는 방식은 거부한다.

## Phase C4C: OS별 실제 인수와 안내

**BLOCKED — C4B 이후.** TASK-C4-02/E12를 완료한다. Windows와 macOS 각각의 host,
CLI/package hash와 방식으로 실제 110분 no-model idle, 작업 발견, browser gate,
permission/handoff/cap, stop·늦은 이벤트·실제 자식 종료·동일 항목 재개를 기록한다.
각 OS가 통과하기 전 그 OS 지원을 안내하지 않는다. 기존 Windows 최소 설치와 양방향
인수도 유지한다. 검증된 범위에서만 Codex background skill/CLI와 제품 안내를 공개한다.

## Readiness and Handoff

C4A는 **소스 구현·로컬 검증 완료**다. C4B/C4C는
명시한 실제 증거와 서버 계약이 없어 **BLOCKED**다. 전체 proposal 상태는 blocked로
유지하며 parent REQ-DUAL-018/019가 완료됐다고 표시하지 않는다.

후속 구현 범위는 C4B의 선행 조건이 충족된 뒤 다시 고정한다. 이번 C4A 인계는 다음과
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

## C4A Implementation Results — 2026-10-23

`runResident`는 명시적인 execution 경계로 start/classify/stopMode를 받는다.
실제 연결은 Claude drain이며, interrupt adapter는 테스트 안에만 있다. 종료 요청은
멱등이고 settlement 전에는 다음 실행으로 넘어가지 않는다. terminal stop 이후
late success가 도착해도 새 overview나 결과 보고로 바뀌지 않는다.

child settlement 실패를 삼키던 경로를 제거하고 `resident-run-unsettled`에서
자기 lock을 stopping으로 보존한다. stopping이거나 tracked child가 남아 있으면
PID 부재만으로 다음 start/반복 stop이 잠금을 회수하지 않는다. 실제 CLI에 주입한
settlement 실패에서 서버 stop·결과 보고가 없고 lock/child가 남는 것을 확인했다.

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
