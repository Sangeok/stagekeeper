---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["integration", "contract", "manual"]
test-tools: ["Claude Code CLI", "Codex CLI", "PowerShell", "Node.js", "PostgreSQL"]
created-at: "2026-10-28"
completed-at: "2026-10-28"
last-executed-at: "2026-10-27T15:52:37Z"
tested-revision: "36b00ac5c42803e2775624d54e18899eb4f780b5"
owners: ["user:Sangeok"]
related: ["docs/test-reports/completed/2026-10-27-codex-mixed-host-acceptance.md", "docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md", "docs/architecture/protocol.md"]
primary-area: "harness/codex-mixed-host-reacceptance"
observed-environments: ["local | Windows x64 10.0.26200 | Claude Code 2.1.311 with plugin 0.5.18 and 0.5.25 helpers; codex-cli 0.164.0 with plugin 0.5.25 | disposable owner/project/service"]
test-summary: "pass: 0.5.25 혼합 버전 재인수 — 0.5.18이 죽은 Codex 잠금을 더는 지우지 않고(T7·T8), owner 해제·포그라운드 abandoned 해제와 정상 인계·중지가 통과"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
---

# 혼합 버전 호스트 재인수 (0.5.25)

## Summary and Decision

[2026-10-27 인수](./2026-10-27-codex-mixed-host-acceptance.md)의 실패 두 건(T7·T8)을 고친 0.5.25 후보로
같은 Windows PC에서 다시 확인했다. 수정은 네 PR이다. #239는 Codex·unsettled 잠금에 옛 판이 회수하지 못하게 하는
항목을 두었고, #240은 owner 확인 해제(`release`)를, #241은 정지 요청 파일 분리와 `newer-state`를,
#242는 포그라운드 Codex 세션의 abandoned 해제를 넣었다. #243이 판을 0.5.25로 올렸다.

0.5.18 Claude는 이제 죽은 Codex 잠금(unsettled 포함)을 시작·정지 어느 쪽으로도 지우지 않는다.
owner 확인 해제는 Codex 0.5.25와 Claude 0.5.25 양쪽에서 동작했고, 해제 직후 Codex가 서버 대기 없이 다시 시작했다.
실행 중 끼어들기 거부, 판을 넘는 정지, successor 보호도 양방향으로 다시 통과했다. 포그라운드 Codex 호스트를
턴 도중 강제로 끝낸 뒤 abandoned 해제로 checkout을 되찾았다. 그래서 혼합 호스트 gate(BLK-DUAL-05·T56)는
이 범위에서 해제한다.

새로 찾은 문제 하나(F5)는 정지가 역할 준비를 멈출 때 "Role sandbox execution unavailable"로 잘못 보고되는 것이다.
정지 자체는 정상으로 끝났고 안전을 해치지 않아 출시를 막지 않는다.

## Scope and Criteria

포함 범위:

- Claude 0.5.18 ↔ Codex 0.5.25: 실행 중 끼어들기, 판을 넘는 정지(유휴·모델 턴 도중), successor 보호
- 죽은 Codex 상주 잠금(unsettled·유휴 크래시)에 대한 0.5.18의 시작·정지와 0.5.25의 owner 확인 해제
- Claude 0.5.25에서 Codex 잠금 해제
- 포그라운드 Codex 세션의 호스트 강제 종료 뒤 abandoned 해제

제외 범위:

- legacy 0.4.1(T9–T11). 이번 수정이 바꾼 것은 0.4.1이 읽지 않는 `children` 항목과 새 파일뿐이라 다시 돌리지 않았다.
- 물리적 clean Windows(아래 출시 gate 결정), macOS, 운영 서버·DB와 패키지 공개
- 모델 품질, 계획·구현 결과의 정확성

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| ------- | ----------------------- | --------- | ------------- | --------- |
| R1 | [후속 제안서](../../proposals/active/codex-dual-client-runtime-follow-ups.md) BLK-DUAL-05·T56 | 혼합 버전 host의 중지·종료 확인·소유권 이전 | required | 실행 중 시작 거부, 종료 뒤 반납, successor 보호 |
| R2 | [protocol](../../architecture/protocol.md) 상주 실행기 멈춤 절 | 죽은 Codex·unsettled 잠금 | required. 같은 PC의 모든 판에 적용 | PID 사망만으로 회수하지 않음. owner 확인 해제만 허용 |
| R3 | 같은 protocol의 포그라운드 잠금 절 | 호스트가 닫힌 포그라운드 Codex 세션 | required | stop 뒤 `processLeft:false`일 때만 abandoned 해제 |

## Test Target

- Working tree state: 서비스와 0.5.25 패키지는 `tested-revision`에서 만들었다. 패키지는 `scripts/windows/package-windows-plugin.mjs`로 0.5.24 인수 패키지의 런타임(Node 22.23.3)과 verifier를 그대로 넣어 만들었다.
- Application/API target: 격리 Next.js(`next start`, loopback)와 일회용 PostgreSQL 18. 모든 마이그레이션 적용, 템플릿은 templates `7f34e7b`(13행).
- Browser/runtime/device: 브라우저 없음. Claude 0.5.18은 사용자 기존 설치본, Codex 0.5.25는 격리 `CODEX_HOME`에 `codex plugin add`로 설치했다. Claude 0.5.25 명령은 같은 0.5.25 패키지의 helper로 실행했다.
- Authentication and role: 두 CLI의 기존 로그인을 썼고 인증 파일은 복사하지 않았다. 모든 시험 프로세스의 `HARNESS_TOKEN`·`HARNESS_SERVER`를 fixture 값으로 바꿨다.
- Feature flags/configuration: 사용자 단위 harness MCP가 운영 URL을 고정하므로 fixture checkout에만 local scope harness MCP를 추가하고, `claude mcp get`으로 격리 URL을 확인했다. 이번에는 `claude -p`의 slug 대조(이전 C2)를 따로 돌리지 않았다. 실행기 lease 행이 격리 DB에 생긴 것으로 연결을 확인했다.
- Environment limitations: 장애는 프로세스 강제 종료로 만들었다. 전원 차단과 OS 재부팅은 재현하지 않았다.

## Preconditions and Test Data

- Preconditions: fixture 다섯 개(m1–m5, Max plan, plan→verify→implement→accept, `before-implement` gate). 각 checkout을 Claude 0.5.18로 init한 뒤 Codex 0.5.25로 init해 커밋했다. `npm test`는 240초 기다린다.
- Test data plan: 일회용 DB와 fixture checkout만 바꾼다.
- Cleanup rule: 실행기·자식 종료 확인, DB drop, checkout·격리 설치·패키지 삭제, local scope MCP 제거.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | m1: Codex 0.5.25 상주 잠금(PID 4 항목 포함) 보유 중 0.5.18 상주·세션·watch 시작과 0.5.25 재시작 | 모두 거부, 소유자 유지 | 상주·0.5.25 시작은 `locked` 오류, 세션·watch는 `locked`, 소유자 불변 (E2) | `PASS` |
| T2 | R1 | `required` | m1 유휴, m4 모델 턴 도중: 0.5.18 `--stop` | 정지, 턴은 interrupt 뒤 반납 | m1은 2초 만에 반납. m4는 턴이 `interrupted`(endedFor stop)로 끝나고 `stopped: owner`, 2초 만에 반납 (E2, F5) | `PASS` |
| T3 | R1, R2 | `required` | m1·m4: 0.5.18 successor 세션 뒤 옛 Codex session의 stop·release와 `background --stop` | successor 불변 | `replaced` 두 번, `not-running`. successor 바이트 동일 (E2) | `PASS` |
| T4 | R1 | `required` | m2: Claude 0.5.18 상주 실행기 실행 중 0.5.25 상주·세션 시작 | 거부, 소유자 유지 | `locked`, 0.5.25 status가 Claude 실행기를 인식 (E2) | `PASS` |
| T5 | R1 | `required` | m2: 0.5.25 `--stop` 뒤 정지 중 양쪽 시작, 반납 시점 | 정지 중 거부, 실행이 끝난 뒤 반납 | 정지 중 두 판 시작 모두 거부, 실행을 마친 뒤 33초에 반납 (E2) | `PASS` |
| T6 | R1, R2 | `required` | m2: 0.5.25 successor 세션 뒤 옛 Claude session의 stop·release와 `background --stop` | successor 불변 | `replaced` 두 번, `not-running`. successor 바이트 동일 (E2) | `PASS` |
| T7 | R2 | `required` | m3: Codex 실행 자식을 턴 도중 강제 종료 → unsettled 잠금 → 각 판 시작·정지 | 모든 판이 잠금 보존 | 잠금은 `stopping`·`unsettled:true`·PID 4 항목으로 남고 잔여 프로세스 0. 0.5.25 시작은 `held`, 0.5.18 상주 시작은 `locked` 오류, 0.5.18 `--stop`은 `stopping`. 잠금 id 불변 (E3) | `PASS` |
| T8 | R2 | `required` | m4: 유휴 Codex 실행기 트리 강제 종료 → 각 판 시작·정지 | 모든 판이 잠금 보존 | 0.5.25 시작은 `held`, 0.5.18 시작은 `locked` 오류, 0.5.18 `--stop`은 `stopping`. 잠금 id 불변 (E3) | `PASS` |
| T9 | R2 | `required` | m3: Codex 0.5.25 `--release` 확인 → `--release --session` → 바로 재시작 | 확인 문구, 해제, 서버 대기 없음 | 확정 문구 세 줄(프로세스 없음·unsettled·로그) 뒤 `released`. 곧바로 시작이 `started`(이전의 3분 `busy` 없음) (E3) | `PASS` |
| T10 | R2 | `required` | m4: Claude 0.5.25에서 Codex 잠금 status·`--release` 확인·해제 → Codex 재시작 | 다른 클라이언트에서도 해제 | status `held:true`, 확인 두 줄 뒤 `released`, Codex 시작 `started` (E3) | `PASS` |
| T11 | R3 | `required` | m5: 포그라운드 Codex plan 역할 턴 도중 호스트 트리 강제 종료 → `prepare` → stop → release → `--abandoned yes` | abandoned 해제만 허용 | `prepare`는 `locked`와 `startedAt`, release는 `quiescence-required`·`processLeft:false`, `--abandoned yes`는 `released`, 새 세션 정상 (E4) | `PASS` |
| T12 | R1 | `informational` | m2: 0.5.18 owner가 남긴 정지 요청 파일 | 다음 세션에 영향 없음 | 0.5.18은 파일을 모르므로 반납 뒤 남았지만, 0.5.25 successor는 `active`로 시작했고 그 해제 때 파일이 지워짐 (E2) | `PASS` |

### Scenario Details

#### T7 — unsettled Codex 잠금

- Preconditions: m3에서 Codex 0.5.25 상주 실행기의 첫 모델 턴이 진행 중이고, 잠금에 실행 자식 두 개와 PID 4 항목이 있다.
- Steps: 기록된 실행 자식 하나를 강제 종료했다. 실행기가 반응을 마친 뒤 0.5.25 status·상주 시작·세션 시작, 0.5.18 status·세션 시작·watch 시작·상주 시작·`--stop`을 차례로 실행했다.
- Read-back or final-state check: 0.5.18 상주 시작과 `--stop` 앞뒤의 잠금 id가 같았다(이전 인수에서는 시작 뒤 잠금이 없었다). 작업 트리는 깨끗했다. 이어서 T9의 해제와 재시작을 했다.

#### T11 — 포그라운드 abandoned 해제

- Preconditions: m5에서 Codex 0.5.25 포그라운드 세션(`--commit no --propose no`)과 `K-1` plan 역할 dispatch. 역할의 Codex 프로세스가 자식으로 기록돼 있다.
- Steps: dispatcher(PowerShell) 트리를 강제 종료했다. `prepare`, `stop`, `release`, `release --abandoned yes`, 새 `prepare`·stop·release를 차례로 실행했다.
- Read-back or final-state check: 강제 종료 뒤 잔여 프로세스 0, 작업 트리 깨끗. 마지막에 잠금과 정지 요청 파일이 없었다. 첫 시도는 `next`의 head가 새 일 발굴(`feature-scout`)이라 `--propose no`에서 dispatch되지 않았다. 그 세션은 일반 stop·release로 정리하고 `--key K-1`로 다시 돌렸다(E4).

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | 전체 | `required` | 두 패키지의 `windows-package.json` inventory 전체 SHA-256 대조 | 불일치 0 | 0.5.18 2,223개(`1ace8c0c…`), 0.5.25 설치본 2,232개(`8eb1ccf1…`, source `36b00ac`) 일치 (E1) | `PASS` |
| C2 | 전체 | `required` | 실행 로그 전체에서 원인 미확정 증상 검색 | `corrupt-state`·`guard-busy`·stop 오류·`validation-profile` 진단 누락·`role_file_read` 실패 0 | 모두 0. 역할 거부 두 건은 일부러 만든 장애(m3)와 F5(m4) | `PASS` |
| C3 | 전체 | `required` | 공개 자산에서 사용자 경로·PC 이름·토큰 검색 | 0건 | 0건 | `PASS` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | 설치·init·routing | [setup.json](../assets/2026-10-28-codex-mixed-host-reacceptance/setup.json) | 저장소 |
| E2 | 인계·정지·successor | [handoff.json](../assets/2026-10-28-codex-mixed-host-reacceptance/handoff.json) | 저장소 |
| E3 | 장애·해제 | [fault.json](../assets/2026-10-28-codex-mixed-host-reacceptance/fault.json) | 저장소 |
| E4 | 포그라운드 abandoned 해제 | [foreground.json](../assets/2026-10-28-codex-mixed-host-reacceptance/foreground.json) | 저장소 |
| E5 | 서버 최종 상태 | [server-final.json](../assets/2026-10-28-codex-mixed-host-reacceptance/server-final.json) | 저장소 |

- Existing failures versus new failures: F5는 이번에 새로 관찰했다. 이전 F1·F2는 해결했고 F3·F4는 다시 돌리지 않았다.
- Sensitive-data review: 토큰, 사용자 경로, PC 이름을 공개 자산에서 지웠다. session·fixture ID는 지운 일회용 DB의 값이다.
- m1은 처음에 역할 실행 중 정지를 보려 했지만, Codex plan 역할이 240초 대기 `npm test`가 역할 명령 시간 제한을 넘는다고 보고 항목을 `on_hold`로 두었다. 그래서 m1은 유휴 정지로 확인하고, 모델 턴 도중 정지는 m4에서 따로 확인했다.
- 서버 최종 상태에서 실행기 행은 다섯 fixture 모두 없다. m3·m5에는 강제 종료된 역할의 AgentRun이 열린 채 남아 있다. 프로토콜대로 다음 실행이 이어받을 기록이다(E5).

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | 해결 | 0.5.18이 죽은 Codex·unsettled 잠금을 회수하던 문제. #239의 PID 4 항목으로 시작·정지 모두 보존 (T7, T8, E3) | 이 보고서 | 다음 잠금 형식 변경 때 `plugin/bin/harness-released-readers.test.mjs` |
| F2 | 해결 | 죽은 Codex 잠금을 풀 방법이 없던 문제. #240 owner 확인 해제, #242 포그라운드 abandoned 해제 (T9–T11) | 이 보고서 | 없음 |
| F5 | low | 역할 준비(`verifyNativeRuntime`) 중 owner 정지로 세션이 `stopping`이 되면 소유권 오류가 `RoleExecutionUnavailable`로 바뀌어 "Stagekeeper must fix runtime compatibility"라는 도구 거부와 로그를 남긴다. 정지는 정상 완료됐다 (T2 m4, E2) | [후속 제안서](../../proposals/active/codex-dual-client-runtime-follow-ups.md) | 정지·소유권 상실을 별도 결과로 보존하는 수정 뒤 같은 정지 |
| F6 | info | 0.5.18 owner는 정지 요청 파일을 지우지 않는다. 다음 세션은 session 불일치로 무시하고, 새 판이 잠금을 지울 때 함께 지운다 (T12, E2) | 이 보고서 | 없음 |

## Release Gate Decisions

- 물리적 clean Windows: 사용자가 2026-10-27 생략을 결정했다. 대체 근거는 세 가지다. [0.5.24 인수](./2026-10-26-codex-0524-windows-acceptance.md)가 전역 Node를 PATH에서 뺀 채 통과했고, 번들 최장 상대 경로가 117자이며, PowerShell 실행 14곳이 모두 `-ExecutionPolicy Bypass`다.
- 원인 미확정 네 건(과거 native `validation-profile` 진단 누락, 별도 `corrupt-state`, Windows CI 40083489330의 stop `error`, `role_file_read` 실패 한 건): 사용자가 판단을 맡겼고, 출시를 막지 않는다고 판단했다.
  - 근거 1: 모두 거부·오류로 끝나 잠금을 지우거나 실행을 겹치게 하지 않았다.
  - 근거 2: 이후 각 경로의 진단이 보강됐다.
  - 근거 3: 같은 경로가 이후 반복 시험에서 통과했다.
  - 조건이었던 "이번 재인수에서 같은 증상 재발 없음"을 C2로 확인했다. F5는 1번과 같은 진단 갈래이지만, 과거 건의 원인이라고 입증하지는 않았다.

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| ------ | -------------- | --------------------- | --------- |
| 일회용 PostgreSQL DB | fixture·실행기 행·AgentRun 생성 | DB drop, PostgreSQL 정지 | 없음 |
| 격리 서비스 | loopback `next start` | 프로세스 종료, 포트 해제 확인 | 없음 |
| fixture checkout 5개, 격리 `CODEX_HOME`, 0.5.25 패키지 | init·잠금·실행 기록 | 링크 없음 확인 뒤 삭제 | 없음 |
| 사용자 Claude 설정 | fixture 경로 local scope MCP 5개 | `claude mcp remove --scope local`로 제거, 사용자 단위 harness는 운영 URL 그대로 | fixture 경로의 대화 기록이 사용자 Claude 프로젝트 목록에 남음 |
| 실행 프로세스 | 상주 실행기, 모델·역할 자식 | 각 단계에서 종료 확인, 마지막에 잔여 0 확인 | 없음 |

- Persistent audit/log side effects: 사용자 Claude·Codex 계정에 모델 사용량이 발생했다.
- Cleanup limitations: 없음

## Conclusion

- Result rationale: required T1–T11과 C1–C3이 모두 `PASS`라서 `pass`다. 이전 실패 T7·T8이 같은 조합에서 통과했다.
