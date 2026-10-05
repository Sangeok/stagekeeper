---
status: "completed"
stage: null
result: "fail"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["contract","integration","manual"]
test-tools: ["Codex CLI App Server","Claude Code installed helper","PostgreSQL","headless Microsoft Edge","Windows PowerShell"]
created-at: "2026-10-05"
completed-at: "2026-10-05"
last-executed-at: "2026-10-05T10:42:06.144Z"
tested-revision: "0edfb7e044b0e2c19e4ce7a72966d0beea5f0690"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md","docs/test-reports/active/dual-client-runtime-report.md"]
primary-area: "harness/windows-private-template-acceptance"
observed-environments: ["local | native Windows 11 Home disposable service and install profiles | Codex 0.160.0, Claude Code 2.1.288 helper, bundled Node 22.23.3/x64, PostgreSQL 18.4 | existing Codex login; no authentication copied"]
test-summary: "fail: real private working templates connected and browser approval/server handover passed; dev role blocked at Git inspection and full role/verifier/stop-resume acceptance did not complete"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
---

# Windows 실제 private 템플릿 연결 인수

## Summary and Decision

실제 private working 본문을 격리 DB에 넣고 설치된 helper로 연결했다. 초기화,
웹 승인과 서버·로컬 세션 인수 계약은 통과했지만 dev는 Git diff 확인 뒤
`implement`를 blocked로 기록했고 `hold`도 실패했다. 이 bounded 시험의 결과는
FAIL이다. 실행·정리·기록이 끝난 이 보고서를 completed에 보존하고, 제품 출시
게이트와 수정 후 재실행은 상위 active 보고서에 유지한다.

## Scope and Criteria

포함: 고정한 실제 private working 본문, fresh loopback DB의 시드·롤백·제한 복구,
실제 production 서비스와 installed helper, 기존 native Codex 로그인, 실제 Inbox
승인, 모델 역할 실행, 양쪽 client 형식의 영수증·사용량 및 공통 세션 잠금.

미인수: released private body, 물리적으로 Node가 없는 새 Windows, GitHub OAuth,
native Claude 모델, 실제 pending 명령 중지와 fresh 모델 재개, 전체 독립 verifier,
최종 accept·배포·C4. 일부는 시험 준비 오류로 유효한 증거를 얻지 못했다.
이를 이 보고서의 통과 항목으로 계산하지 않는다.

| 기준 ID | 기준 문서 | 적용 범위 | 확인 기준 |
| --- | --- | --- | --- |
| R1 | `docs/architecture/system-overview.md`, 후속 계획 REQ-MIN-001/002 | 선택한 native client의 연결 | 추가 Node/WSL/다른 CLI 로그인 요구 없이 installed helper와 실제 서비스 연결 |
| R2 | `scripts/lib/template-seed-query.ts`, `docs/architecture/protocol.md` | 본문 시드/복구 | 전체 사전 검증·transaction rollback·whitelist 복구·무관 행 보존 |
| R3 | `docs/architecture/protocol.md` Windows 역할 backend | 실제 본문의 역할 실행 | 요청한 검증을 실제 수행하고 실패·누락을 성공으로 취급하지 않음 |
| R4 | `docs/architecture/invariants.md`, protocol 공통 세션/원장 계약 | 승인과 교차 인수 | web 감사, 같은 receipt/run/사용량 유지, 겹치는 세션 거부 |

## Test Target

공개 application source는 기준 commit의 clean worktree다. 설치 패키지는 앞선
0.5.2 회귀에서 검증한 별도 source checkpoint이며 E1에 두 identity를 구분한다.
private 본문은 별도 저장소의 미커밋 working copy를 무변경 복사한 것이다.
12개 행의 hash를 고정했고 종료 시 원본 working copy와 다시 대조했다.

working bundle에는 integration branch에 없는 `qa-verifier` 및 런북 참조도 있다.
현재 Max entitlement의 역할 다섯 개를 초기화했으며 이 미래 QA 흐름은 실행하지
않았다. working copy를 이미 출시된 본문이나 운영 DB 상태라고 부르지 않는다.

호스트에는 Node가 설치되어 있다. client PATH에서 제거하고 `where node` 실패를
확인한 후 bundled launcher를 사용했다. 실제 물리적 clean machine은 확보하지
못했다. Claude 로그인은 없어 native Claude 모델을 호출하지 않았다. 양방향
서버 요청과 local-session 인수는 Claude Code host 실행을 대신하지 않는다.

## Preconditions and Test Data

새 native PostgreSQL cluster와 `stagekeeper_test_*` DB를 loopback에 만들고 현재
migration을 적용했다. 별도 synthetic Max 사용자·등록 프로젝트·작은 JavaScript
저장소와 승인 대기 board를 사용했다. 원본 private 본문은 변경하지 않았다.

복구 baseline은 candidate에 fixture marker를 붙인 합성 이전 상태다. 새 Codex
런북 행 삭제와 기존 행·무관 행 보존을 검증했으나 출시 이력의 복구 인수는 아니다.
브라우저에는 이 서비스 전용 secret으로 만든 fixture JWT만 주었다. 실제 GitHub
인증을 거친 사용자 세션이라는 주장은 하지 않는다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | installed 0.5.2 loader와 양쪽 helper의 실제 본문 init | winning Codex loader 하나; 추가 Node 없는 client PATH에서 양쪽 init, 등록·MCP·sync·gate wait 통과 [E1] | PASS |
| T2 | R2 | required | 실제 candidate 시드와 fault injection/복구 | transaction 예외 뒤 zero-write; 제한 복구에서 Codex 행 제거·무관 행 보존; 마지막 복구 재확인 [E1] | PASS |
| T3 | R4 | required | 실제 Inbox 승인 | 버튼 click 뒤 implementing, web 감사 1건, page error 0 [E1] | PASS |
| T4 | R3 | required | 실제 dev 본문으로 구현·검증 | Git diff 확인 뒤 implement blocked, hold failed; 구현 파일 불변; 테스트 성공·항목 완료 없음 [E1] | FAIL |
| T5 | R4 | required | 양쪽 형식 조회와 Codex→Claude→Codex local-session 인수 | 동일 dev receipt, runs/charges 3과 steps 6 불변; 겹치는 시작 locked; 모든 잠금 반납 [E1] | PASS |
| T6 | R3 | required | 전체 독립 verifier | 두 시도 모두 read 단계 실패; 아래 fixture 결함이 있어 유효한 전체 인수 증거 없음 [E1] | NOT RUN |
| T7 | R3,R4 | required | 실제 pending 명령 stop→quiescence→fresh 모델 resume | dev가 먼저 paused로 종료해 유효한 active-command 중지·재개를 실행하지 못함 [E1] | NOT RUN |
| T8 | R1,R4 | informational | 물리적 clean Windows/released body/native Claude host | 필요한 환경·candidate·native Claude 인증 없음; 사용자에게 추가 설치/로그인을 요구하지 않음 [E1] | NOT RUN |

T4의 실패가 전체 판정을 결정한다. T5는 실제 HTTP와 foreground ownership 계약의
통과이며 두 native CLI 모델의 양방향 인수 PASS가 아니다.

## Commands

| 기준 ID | 실행 계약 | 결과 | Evidence |
| --- | --- | --- | --- |
| R1,R2 | fresh DB `prisma migrate deploy`, 현재 source `npm run build`, private `readTemplateSources` 및 seed/restore transaction | migration/production build/12행 검증/롤백/복구 통과 | E1 |
| R1 | installed `bin/harness.ps1 init --client codex/claude`, Codex `complete-init`, `prepare`, `next` | 실제 서비스 연결·승인 대기; 모델 시작 0 | E1 |
| R3 | installed fresh-thread dispatcher, 실제 원본 private 단계 | 3 model starts, 모두 paused; full verifier/구현 완료 없음 | E1 |
| R4 | 격리 headless Edge 실제 Inbox 버튼, `agent_next` client별 조회, start/stop/releaseSession | web 승인·원장/사용량 보존·겹침 거부·quiescent release | E1 |

operator source는 Git 밖에 보존하고 checksum만 E1에 남긴다. 본문·credential·raw
model transcript를 공개하지 않았다. 표시된 token 합계 223,481은 CLI가 보고한
세 turn의 사용량이며 서버의 신규 run 청구 3회나 금액과는 다른 값이다.

## Evidence Registry

| ID | 증거 | 범위 |
| --- | --- | --- |
| E1 | [고정 필드 관찰 기록](../assets/2026-10-05-windows-private-template-acceptance/observations.json) | application/package/private working hash, 실제 결과·실패 후보, 모델 횟수/token, operator checksum, 정리 |

## Findings and Follow-up

dev의 수락된 원장에는 Git diff 확인 후 blocked가 남았다. 현재 명령 snapshot은
Git metadata를 제외한다. 실제 본문이 요구하는 Git 확인과 Windows backend 사이의
호환성·owner handoff를 후속으로 해결해야 한다. 정확한 거부 원인의 추가 재현이
필요하며 이 관찰만으로 kernel 권한 문제나 해결된 결함이라고 단정하지 않는다.
부모의 넓은 권한으로 역할 명령을 대신 실행하거나 WSL 설치로 우회하지 않는다.

시험 준비의 실패도 E1에 보존한다. 첫 production build는 node_modules junction
때문에 실패했고 일반 파일 복사 뒤 통과했다. restore의 행 정렬 비교, 오래 살지
못한 시험 서버, 잘못 만든 token, 잘못된 감사 query 열도 수정·재실행했다.
첫 verifier dispatch에는 필수 selected verification paths가 없었다. 두 번째
K-2 파일은 기록한 commit에 포함되지 않았다. 두 시도는 원본 verifier의 결함이나
성공을 입증하지 않는다. 최초 stop은 잘못된 lock 필드를 사용해 replaced였고
active-command stop을 입증하지 않았다. 이후 올바른 ID로 종료된 역할의 잠금을
반납한 결과를 실행 중인 명령의 종료 acknowledgement로 바꾸어 쓰지 않는다.

다음 유효한 역할 인수는 정확한 plan commit·필수 verification paths를 준비하고,
현재 공개 source와 맞는 고정 private candidate를 사용해야 한다. Git 확인 경로를
해결한 후 실제 명령 대기를 자동 관측해 중지·재개를 실행하고, 전체 verifier와
native Claude 교차 인수·physical clean machine은 각자의 직접 증거로 닫는다.

## Cleanup and Final State

모든 역할 child가 settle했고 foreground 잠금은 반납했다. 마지막 candidate
restore와 무관 행 보존을 확인한 후 Next supervisor와 owned native PostgreSQL을
종료했다. 실패 원장과 private 진단은 정지된 disposable fixture에만 보존한다.
private working source·사용자 인증·운영 DB를 수정하지 않았고 패키지 공개·배포·
main 승격을 수행하지 않았다.
