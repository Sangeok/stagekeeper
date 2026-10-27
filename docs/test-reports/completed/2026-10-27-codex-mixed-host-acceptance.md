---
status: "completed"
stage: null
result: "fail"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["integration", "contract", "manual"]
test-tools: ["Claude Code CLI", "Codex CLI", "PowerShell", "Node.js", "PostgreSQL"]
created-at: "2026-10-27"
completed-at: "2026-10-27"
last-executed-at: "2026-10-27T08:49:02.677Z"
tested-revision: "a6d6933e8b499446683dc07fc77d9448d602b449"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md", "docs/test-reports/active/dual-client-runtime-report.md", "docs/architecture/protocol.md", "docs/test-reports/completed/2026-10-26-codex-0524-windows-acceptance.md", "docs/test-reports/completed/2026-10-24-codex-runtime-portability.md"]
primary-area: "harness/codex-mixed-host-acceptance"
observed-environments: ["local | Windows x64 10.0.26200 | Claude Code 2.1.310 with plugin 0.5.18; codex-cli 0.164.0 with plugin 0.5.24; legacy plugin 0.4.1 on system Node | disposable owner/project/service"]
test-summary: "fail: 같은 Windows PC의 혼합 버전 소유권·중지 인수 — 실행 중 인계·중지·successor 보호는 양방향 통과, 죽은 Codex 상주 잠금은 0.5.18 시작 시도가 지움"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md"]
---

# 혼합 버전 호스트 소유권·중지 인수

## Summary and Decision

한 Windows PC에서 판이 다른 플러그인이 같은 checkout의 공용 잠금을 지키는지 실제
클라이언트와 프로세스로 확인했다. 조합은 출시 직후 생길 Claude 0.5.18(현재 공개판)과
Codex 0.5.24(후보), 그리고 공용 세션 이전 판인 0.4.1과 0.5.x다.

역할이 실행 중일 때의 시작 거부, 버전을 넘는 중지, 종료 확인 뒤 반납, 늦은 반납의
successor 보호는 양방향 모두 통과했다. 실패는 한 가지다. Codex 상주 실행기가 죽어
남긴 잠금은 0.5.24가 프로토콜대로 보존하지만, 0.5.18의 `/harness:background` 시작
시도가 그 잠금을 지운다. 서버가 `busy`로 시작을 거부해도 지운다. 그래서 이 PASS들로
혼합 호스트 gate를 해제하지 않는다. F1의 처리 방향은 Codex 실행기 소유 범위에서 정한다.

## Scope and Criteria

포함 범위:

- Claude 0.5.18 ↔ Codex 0.5.24: 실행 중 끼어들기, 버전을 넘는 중지, successor 보호, 실행기 장애 뒤 잠금
- legacy 0.4.1 watch ↔ 0.5.18·0.5.24: 서로의 잠금 인식, legacy 중지와 poller 정리, 확인된 `--force` 인수
- 0.5.24만으로 죽은 Codex 잠금을 복구하는 경로(정보 확인)

제외 범위:

- 물리적 clean Windows, macOS, 운영 서버·운영 DB와 패키지 공개
- 모델 품질, 계획·구현 결과의 정확성
- 다른 checkout·다른 PC 사이의 서버 lease 인계(`--takeover`)

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| ------- | ----------------------- | --------- | ------------- | --------- |
| R1 | [후속 제안서](../../proposals/active/codex-dual-client-runtime-follow-ups.md) BLK-DUAL-05·T56, [실행 보고서](../active/dual-client-runtime-report.md) T56 | 혼합 버전 host의 중지·종료 확인·소유권 이전 | required | pending 역할·도구가 끝나기 전 잠금 보존, 종료 뒤 자기 release, successor 보호 |
| R2 | [protocol](../../architecture/protocol.md) 상주 실행기 멈춤 절 | 죽은 상주 잠금의 회수 | required. Codex 규칙은 0.5.24 단독이 아니라 같은 PC의 모든 판에 적용된다고 해석 | Codex 잠금은 PID 사망만으로 회수하지 않고, `unsettled` 잠금은 보존 |
| R3 | 같은 제안서 R5 행, 2026-10-04 설계 E7 | legacy·updated adapter와 늦은 release | required | 늦은 stop·release·poller 정리가 successor 바이트를 바꾸지 않음 |

## Test Target

- Working tree state: 서비스는 `tested-revision`에서 빌드했다. 0.5.24 패키지는 [0.5.24 인수](./2026-10-26-codex-0524-windows-acceptance.md)가 쓴 `82e9b0cb…` 사본이며 source `0d63e2c`와 `tested-revision`의 `plugin/`은 같다.
- Application/API target: 격리 Next.js(`next start`, loopback)와 일회용 PostgreSQL 18. 모든 마이그레이션 적용, 템플릿은 templates `7f34e7b`.
- Browser/runtime/device: 브라우저 없음. Claude 0.5.18은 사용자 기존 설치본을 그대로 썼고, Codex 0.5.24는 격리 `CODEX_HOME`에 `codex plugin add`로 설치했다. 0.4.1은 `git archive`로 꺼내 시스템 Node로 실행했다.
- Authentication and role: 두 CLI의 기존 로그인을 썼고 인증 파일은 복사하지 않았다. 모든 시험 프로세스의 `HARNESS_TOKEN`·`HARNESS_SERVER`를 fixture 값으로 바꿨다.
- Feature flags/configuration: 사용자 단위 harness MCP가 운영 URL을 고정하므로, fixture checkout에만 local scope harness MCP를 추가했다. 실제 `claude -p`가 받은 프로젝트 slug가 일회용 fixture 값과 같음을 확인했다(E1).
- Environment limitations: 장애는 실행 프로세스 강제 종료로 만들었다. 전원 차단과 OS 재부팅은 재현하지 않았다.

## Preconditions and Test Data

- Preconditions: fixture 네 개(Max plan, 파이프라인 plan→verify→implement→accept, `before-implement` gate). 각 checkout을 먼저 옛 Claude판으로 init하고 그 뒤 Codex 0.5.24로 init해 커밋했다. `npm test`는 240초 기다린 뒤 테스트를 돈다.
- Test data plan: 일회용 DB와 fixture checkout만 바꾼다. s4는 모델 없이 돌도록 보드 항목을 지웠다.
- Cleanup rule: 실행기·자식 프로세스 종료 확인, DB drop, checkout·격리 설치 삭제, local scope MCP 제거.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | S1: Codex 0.5.24 상주 실행기의 역할이 대기 중인 `npm test`를 실행할 때 0.5.18의 상주·세션·watch 시작과 0.5.24 재시작 | 모두 거부, 소유자 유지 | 상주·0.5.24 시작은 `locked` 오류, 세션·watch는 `locked`. 0.5.18 status는 실행 중으로 인식. 시작 전후 id·poller 동일 (E2) | `PASS` |
| T2 | R1 | `required` | S1: 0.5.18 `--stop`으로 Codex 실행기 중지 | 역할 명령·turn이 끝난 뒤 반납 | 대기 명령 중단 → turn `interrupted` → `stopped: owner`. 반납 직전 기록에서 자식은 이미 종료, 서버 실행기 행 제거 (E2) | `PASS` |
| T3 | R1, R3 | `required` | S1: 0.5.18 세션이 잡은 뒤 이전 Codex session으로 stop·release와 `background --stop` | successor 불변 | `replaced` 두 번, `not-running` 한 번. successor 바이트 동일 (E2) | `PASS` |
| T4 | R1 | `required` | S2: Claude 0.5.18 상주 실행기의 `claude -p`가 일하는 동안 0.5.24 상주·세션 시작 | 거부, 소유자 유지 | `locked`. 0.5.24 status가 Claude 실행기를 인식 (E2) | `PASS` |
| T5 | R1 | `required` | S2: 0.5.24 `--stop` 뒤 정지 중 양쪽 시작, 반납 시점 | 정지 중 거부, 실행이 끝난 뒤 반납 | 정지 중 두 판 시작 모두 `locked`. 대기 명령 종료 뒤에도 실행을 마칠 때까지 271초 유지(49 turn), 자식 종료 뒤 반납 (E2) | `PASS` |
| T6 | R1, R3 | `required` | S2: 0.5.24 세션이 잡은 뒤 이전 Claude session으로 stop·release와 `background --stop` | successor 불변 | `replaced` 두 번, `not-running`. successor 바이트 동일 (E2) | `PASS` |
| T7 | R2 | `required` | S3: Codex 실행 자식을 turn 도중 강제 종료 → `unsettled` 잠금 → 각 판 시작 | 두 판 모두 잠금 보존 | 0.5.24는 보존(`locked`). 0.5.18 상주 시작은 서버 `busy`로 실패했지만 잠금을 지움. lease 만료 뒤 0.5.24 시작이 확인 없이 통과 (E3) | `FAIL` |
| T8 | R2 | `required` | S3b: 유휴 Codex 실행기 트리를 강제 종료(`unsettled` 없음) → 각 판 시작 | 두 판 모두 잠금 보존 | 0.5.24는 `locked`. 0.5.18 시작은 `busy`로 실패하며 잠금을 지움. lease 만료 뒤 0.5.24 시작 통과 (E3) | `FAIL` |
| T9 | R3 | `required` | S4: 0.4.1 watch+poller 보유 중 0.5.18·0.5.24 시작, 0.4.1 중지 직후 0.5.24 successor, poller 종료 뒤 확인 | 서로 인식, successor 불변 | 0.5.x는 모두 `locked`(client claude, mode watch로 인식). 0.4.1 중지는 poller가 살아 있어도 즉시 잠금을 지움(legacy 계약). poller 정리 뒤 successor 동일 (E4) | `PASS` |
| T10 | R3 | `required` | S4: 0.5.24 유휴 Codex 실행기 보유 중 0.4.1 시작과 자기 옛 session 중지 | 거부, 소유자 유지 | 0.4.1이 6초 이내 `seenAt`으로 `locked`를 표시. 옛 session 중지는 `replaced` (E4) | `PASS` |
| T11 | R3 | `informational` | S4: 사용자가 확인한 0.4.1 `--force`가 살아 있는 Codex 실행기를 밀어냄 | 기록 | Codex 실행기는 legacy 잠금을 건드리지 않고 종료. 서버 행이 남아 다음 Codex 시작이 최대 3분 `busy` (E4, F3) | `PASS` |
| T12 | R2 | `informational` | 0.5.24만으로 죽은 Codex 잠금 복구: status·`--stop`·status | 기록 | `--stop`은 `stopping`을 쓰지만 마칠 실행기가 없어 잠금이 계속 남음. 시작은 계속 `locked` (E3, F2) | `PASS` |

### Scenario Details

#### T7 — unsettled Codex 잠금

- Preconditions: s3에서 Codex 0.5.24 상주 실행기가 첫 모델 turn을 진행 중이다. 잠금에 실행 자식 두 개가 기록돼 있다.
- Steps: 기록된 실행 자식 하나를 강제 종료했다. 실행기가 반응을 마친 뒤 0.5.24 status·상주 시작·세션 시작, 0.5.18 status·세션 시작·watch 시작을 차례로 실행했다. 그다음 0.5.18 상주 시작을 실행했다.
- Read-back or final-state check: 실행기는 남은 자식을 정리하고 `stopping`·`unsettled:true`로 잠금을 남긴 뒤 끝났다. 남은 프로세스는 없었다. 0.5.18 상주 시작 뒤 잠금 파일이 없었다. 서버 lease가 3분 뒤 만료되자 0.5.24 상주 시작이 새 session으로 통과했다. 그 실행기는 모델 turn을 시작하기 전에 중지해 반납을 확인했다.

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | 전체 | `required` | 두 패키지의 `windows-package.json` inventory 전체 SHA-256 대조 | 불일치 0 | 0.5.18 2,223개(`1ace8c0c…`), 0.5.24 설치본 2,232개(`82e9b0cb…`) 일치 (E1) | `PASS` |
| C2 | 전체 | `required` | fixture checkout에서 실제 `claude -p`가 `mcp__harness__project_get` 호출 | 일회용 fixture slug 반환 | slug 일치, 거부 0 (E1) | `PASS` |
| C3 | 전체 | `required` | 공개 자산에서 사용자 경로·PC 이름·토큰 검색 | 0건 | 0건 | `PASS` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | 설치·init·routing | [setup.json](../assets/2026-10-27-codex-mixed-host-acceptance/setup.json) | 저장소 |
| E2 | S1·S2 단계 기록 | [handoff.json](../assets/2026-10-27-codex-mixed-host-acceptance/handoff.json) | 저장소 |
| E3 | S3·S3b·0.5.24 단독 복구 | [fault.json](../assets/2026-10-27-codex-mixed-host-acceptance/fault.json) | 저장소 |
| E4 | legacy 0.4.1 | [legacy.json](../assets/2026-10-27-codex-mixed-host-acceptance/legacy.json) | 저장소 |

- Existing failures versus new failures: F1·F3·F4는 이번에 새로 관찰했다. F2는 Codex 잠금을 PID 사망만으로 회수하지 않는다는 기존 계약과 복구 명령의 공백에서 나온다.
- Sensitive-data review: 토큰, 사용자 경로, PC 이름을 공개 자산에서 지웠다. session·fixture ID는 지운 일회용 DB의 값이다.
- S1 끼어들기 행의 `lockBytesUnchanged:false`는 소유 실행기가 그 사이 신호를 보내 `seenAt`·children을 바꿨기 때문이다. 소유자 판정은 같은 행의 `contend-end`와 시작 전 id·poller로 했다. 이후 시나리오는 id·client·mode·lifecycle·binding·poller·policy를 비교했다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | high | 0.5.18의 상주 시작은 죽은 상주 잠금을 `client`와 `unsettled`를 보지 않고 회수한다. 서버 호출 전에 잠금을 지우므로 `busy`로 실패해도 Codex 잠금이 사라진다. 0.5.24가 보존한 `unsettled`·죽은 Codex 잠금이 이 PC에서는 지켜지지 않는다 (T7, T8, E3) | [후속 제안서](../../proposals/active/codex-dual-client-runtime-follow-ups.md) BLK-DUAL-05·T56. 이 보고서는 제안서를 고치지 않았다 | 결정된 방향(예: 옛 클라이언트가 실패 쪽으로 닫히게 하는 잠금 표현이나 출시 순서 조건)으로 T7·T8 재실행 |
| F2 | medium | 0.5.24만 있는 PC에서 죽은 Codex 잠금은 `--stop`이 `stopping`만 남겨 풀리지 않는다. 시작 거부 문구는 "Stop it first"라고 안내한다 (T12, E3) | [상주 실행기 계획](../../proposals/active/codex-resident-runner-plan.md)의 종료 미확인 복구 | 제품 복구 명령 추가 뒤 같은 절차 |
| F3 | low | 확인된 legacy `--force`로 밀려난 Codex 실행기는 서버 stop을 보내지 않는다. 다음 Codex 시작이 서버 행이 만료되는 최대 3분 동안 `busy`다 (T11, E4) | 위 후속 제안서 | legacy 강제 인수 뒤 시작 |
| F4 | low | 0.5.18 Claude 상주 실행이 메인 루프 검증 중에 정지 요청을 받으면 역할을 새로 띄우지 않고 끝나지만, `docs/agents/main-loop/<key>.md`를 커밋하지 않고 남긴다. 다음 시작은 두 판 모두 `dirty`로 거부되며 문구가 commit·stash를 안내한다. 판 혼합과 무관한 기존 동작이다 (E2) | 위 후속 제안서 | 정지 직후 tree 상태 확인 |

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| ------ | -------------- | --------------------- | --------- |
| 일회용 PostgreSQL DB | fixture·실행기 행·AgentRun 생성 | DB drop, PostgreSQL 정지 | 없음 |
| 격리 서비스 | loopback `next start` | 프로세스 종료, 포트 해제 확인 | 없음 |
| fixture checkout 4개, 격리 `CODEX_HOME` | init·잠금·실행 기록 | 링크 없음 확인 뒤 삭제 | 없음 |
| 사용자 Claude 설정 | fixture 경로 local scope MCP 3개 | `claude mcp remove --scope local`로 제거, 사용자 단위 harness는 운영 URL 그대로 | fixture 경로의 대화 기록이 사용자 Claude 프로젝트 목록에 남음 |
| 실행 프로세스 | 상주 실행기, 모델·역할 자식 | 각 단계에서 종료 확인, 마지막에 잔여 0 확인 | 없음 |

- Persistent audit/log side effects: 사용자 Claude·Codex 계정에 모델 사용량이 발생했다.
- Cleanup limitations: 없음

## Conclusion

- Result rationale: required T7·T8이 `FAIL`이므로 `fail`이다. 정상 실행 중의 인계·중지와 successor 보호(T1–T6, T9, T10)는 통과했다.
- Remaining uncertainty: 0.5.18이 잠금을 지울 때 살아 있는 Codex 프로세스나 열린 AgentRun은 없었다. 그런 상태에서 0.5.18이 잠금을 지우면 어떤 결과가 나는지는 관찰하지 않았다. 0.5.18의 회수 조건은 기록된 자식이 모두 죽었는지만 보며, 기록되지 않은 손자 프로세스는 보지 않는다.
- Rerun decision: F1의 방향이 정해진 뒤 같은 버전 조합으로 T7·T8을 재실행한다. 해결 전에는 혼합 호스트 gate를 유지한다.
