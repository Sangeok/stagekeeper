---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['static', 'integration', 'end-to-end']
test-tools: ['Playwright', 'Next.js production server', 'Auth.js', 'Prisma', 'pg', 'Node.js test runner', 'ESLint', 'TypeScript']
created-at: '2026-09-17'
completed-at: '2026-09-17'
last-executed-at: '2026-09-17T13:25:27.330Z'
tested-revision: 'c5c15f6563722876899d8fa836ce3292a6318a45'
owners: ['user:Sangeok']
related:
  - 'docs/proposals/active/pipeline-agent-slots.md'
  - 'docs/test-reports/completed/2026-09-17-pipeline-agent-slots-regression.md'
  - 'docs/test-reports/completed/2026-09-17-pipeline-agent-slots-postgresql-acceptance.md'
primary-area: 'pipeline/agent-slots'
observed-environments:
  - 'local | actual application UI / Server Actions / MCP HTTP | Windows / headless Chrome / Node.js 22.13.1 / Next.js 16.3.3 | anonymous / fixture owner Max then Free / outsider'
  - 'remote PostgreSQL | dedicated disposable database | Prisma 7.10.0 / pg | database owner'
test-summary: 'pass: 실제 앱 Playwright E2E 17개 시나리오와 수정 후 정적·단위·빌드 검사 통과; 승인 시간 초과 수정, 기존 UI 관찰 2건 미수정'
follow-up: []
---

# Pipeline agent slots actual application E2E

## Summary and Decision

사용자가 요청한 Playwright E2E를 실제 production 앱의 화면, Server Action,
MCP HTTP와 PostgreSQL까지 연결해 실행했다. 이전 regression 보고서의
컴포넌트 fixture 검사는 이 실행을 대신하지 않는다.

필수 파이프라인 흐름과 접근 제한 검사를 모두 통과했다. 실제 승인에서 발견한
트랜잭션 시간 초과는 수정 후 전체 흐름을 재실행해 검증했다. 별도로 발견한 기존
UI 문제 두 건은 미수정이며, 이 판정은 앱 전체에 결함이 없다는 뜻이 아니다.

## Scope and Criteria

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 해석 및 확인 기준 |
| --- | --- | --- | --- |
| R1 | [pipeline-agent-slots.md](../../proposals/active/pipeline-agent-slots.md), Core 1 A–D/F | 반복 슬롯, 버전 고정, 실행 결합, 게이트, 완료·재개 | UI 조작 및 실제 MCP 호출 뒤 DB read-back으로 cursor/version/entry/run/report 상태 확인 |
| R2 | AGENTS.md, src/server/auth/guard.ts, edit-pipeline.server.ts 및 기존 Backlog 입력 계약 | 로그인, 소유권, 플랜·입력 제한 | 실제 Auth.js 세션과 Server Action의 거부 및 zero-write 확인 |
| R3 | AGENTS.md의 코드 변경 완료 검사 | 승인 시간 초과 수정 | lint/FSD/type/architecture/관련 테스트/production build 통과 |

이번 필수 범위는 제안의 Core 1을 실제 앱에서 사용하는 주요 흐름이다.
Phase 2 역할 카탈로그, 모든 legacy/ABA/경합 조합, 실제 Claude 작업,
외부 GitHub OAuth 로그인과 원격 저장소 commit 존재 검증은 포함하지 않는다.
DB 경합·롤백 전용 검사의 범위와 결과는 관련 PostgreSQL 보고서에 별도로 남아 있다.

입력 오류 후 폼 값 보존과 과거 보고서의 표시 라벨은 기존 UI의 추가 관찰이다.
아래 O1/O2는 Core 1 상태·실행 결합 판정과 구분한 informational 항목이다.

## Test Target

- 기준 commit 대비 미커밋 Core 1 구현이 포함된 working tree를 대상으로 했다.
  이 실행 중 application code 변경은 board-query.ts와 run-query.ts의
  제한된 트랜잭션 timeout 조정이다.
- 실제 서버: `http://127.0.0.1:4207`, 새로 빌드한 `next start`.
  컴포넌트 fixture 서버, 라우팅 mock, 가짜 Server Action은 사용하지 않았다.
- Playwright 버전: `1.64.0-alpha-2026-09-14`; 설치된 Chrome을 headless로 사용,
  viewport 1440×1000.
- Auth.js가 검증하는 테스트용 JWT 세션 쿠키를 별도 테스트 secret으로 발급해
  owner/outsider 브라우저 context에 주입했다. 앱의 인증/DAL은 그대로 실행했지만,
  GitHub OAuth 로그인 버튼부터 시작하는 인증 과정은 검증하지 않았다.
- owner의 Max 및 Free 플랜은 fixture DB에서 설정했다. 결제·플랜 부여 UI는
  검증하지 않았으며, Free로 변경한 뒤 실제 화면과 Server Action의 제한을 검증했다.
- UI에서 발급한 프로젝트 토큰으로 실제 `/api/mcp` 초기화와 tools/call을 수행했다.
  private template의 실제 단계와 현재 entry/run/step을 사용했으며, 에이전트의
  작업 결과는 테스트 성공 outcome으로 제출했다.
- 계획·보고서에는 테스트 저장소 경로 및 40자리 fixture SHA를 사용했다.
  실제 외부 repository 파일이나 commit을 만들지는 않았다.

## Preconditions and Test Data

현재 DB 연결 설정은 controller의 테이블 행 수 조회와 임시 DB 생성·삭제에만
사용했다. 매 실행마다 `stagekeeper_slot_e2e_<random uuid>` DB를 만들고,
앱과 Prisma의 연결 URI는 해당 DB로 지정했다. 일반 DB schema와 사용자 데이터에
테스트 write를 수행하지 않았다.

임시 DB에 13개 migration, 10개 private template, owner/outsider, 프로젝트,
SLOT-01/SLOT-02 및 계획·보고서·감사 기록을 생성했다. 생성 성공을 확인한 자기
DB만 삭제하며, 실패 경로에서도 browser/server/Prisma 연결을 종료한 뒤 정리한다.

## Test Matrix

| ID | 기준 | Gate | 시나리오 및 기대 결과 | 실제 결과 및 증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| E01 | R2 | required | 미인증 projects 접근 | 로그인 화면으로 redirect — V1 | PASS |
| E02 | R2 | required | 브라우저 프로젝트 생성·토큰 발급 | 실제 Server Action 성공, owner/token DB 기록 — V1 | PASS |
| E03 | R1/R2 | required | UI 토큰으로 MCP 연결·workspace sync | 실제 HTTP 초기화 및 web-dev 설정 성공 — V1 | PASS |
| E04 | R1 | required | doc-auditor 반복 슬롯 추가·이동·게이트 저장 | slots-v1 노드·게이트 DB 일치, reload 후 유지 — V1/V2 | PASS |
| E05a | R2 | required | 잘못된 Backlog key 제출 | 오류 표시, insert 없음 — V1 | PASS |
| E05 | R1 | required | 올바른 Backlog 생성·보드 제안 | SLOT-01 proposed, 저장한 v1 고정 — V1 | PASS |
| E06 | R1 | required | 새 pipeline v2 저장 | 기존 SLOT-01의 versionId는 v1 유지 — V1 | PASS |
| E07 | R1 | required | 같은 Inbox snapshot을 가진 두 탭에서 승인 | 첫 승인 성공, 오래된 두 번째 승인 거부·audit 추가 없음 — V1 | PASS |
| E08 | R1 | required | plan 제출·verifier 실행·검증 기록·구현 승인 | 실제 MCP 후 Verified 표시 및 implementing 전이 — V1/V3 | PASS |
| E09 | R1 | required | developer 성공 후 남은 audit 슬롯 확인 | developer run 종료, 항목은 implementing 유지 — V1/V4 | PASS |
| E10 | R1 | required | 두 번째 audit 진입 및 이전 실행 응답 재전송 | 새 entry/run 발급, stale outcome 거부; 두 번째 audit 완료 후에만 done 및 acceptance gate 도달 — V1/V5 | PASS |
| E11 | R1 | required | Inbox 인수 진행 및 main-loop 보고 | acceptedAt 설정, pipeline 완료 — V1/V6 | PASS |
| E12 | R1 | required | 항목 재개 | acceptedAt/removedAt 초기화, v1 유지, 새 entry의 implement anchor dispatch — V1/V7 | PASS |
| E12a | R1 | required | 모든 gate 제거 후 저장 | 첫 Save는 확인만 표시·write 없음; 명시적 확인 후 v3 저장 — V1 | PASS |
| E12b | R1 | required | ungated v3로 새 항목 제안 | SLOT-02 planning 자동 진입 및 plan dispatch — V1/V8 | PASS |
| E13 | R2 | required | outsider 접근 및 Free 플랜 저장 제한 | Not found. 화면; Save 없음; 이전 Max Server Action 재전송도 거부·version insert 없음 — V1 | PASS |
| E14 | R2 | required | 런타임 오류 및 테스트 정리 | 관찰 페이지 pageerror/HTTP 5xx 없음, 임시 DB 삭제, 일반 DB 18개 테이블 행 수 전후 동일 — V1/V9 | PASS |
| O1 | R2 | informational | Backlog 입력 오류 후 나머지 입력값 보존 | uncontrolled Title/Area/Source가 초기화됨 — V10/F2 | FAIL |
| O2 | R1 | informational | 재개 후 과거 인수 보고서의 의미 보존 | 과거 Acceptance record가 Validation record로 표시됨 — V7/F3 | FAIL |

### Scenario Details

E04에서는 기본 doc-audit 슬롯을 제거하고 doc-auditor를 두 번 추가해 Accept
앞으로 이동했다. DB 노드는 propose → plan → verify → implement →
doc-auditor → doc-auditor#2 → accept, gate는 before-plan, before-implement,
before-doc-auditor#2, before-accept였다.

E07은 첫 탭 승인 후 두 번째 탭의 오래된 entry에 대한 승인 결과와 감사 행 수를
함께 검사했다. E10은 실제 agent_next의 이전 entryId/agentRunId/stepId를
재전송해 stale 거부를 확인하고, 두 번째 슬롯의 새 run이 start부터 시작함을
검사했다. agent 이름이 같은 것만으로 완료 증거를 재사용하지 않았다.

E12의 기존 재개 계약은 before-implement를 다시 승인하는 것이 아니라
cursorForStatus의 implement anchor에서 시작하는 것이다. acceptedAt와
backlog removedAt 초기화, 이전 완료 증거와 새 entry 분리를 함께 검사했다.

E13의 framework not-found 응답은 streaming 때문에 HTTP 200 또는 404일 수
있으므로 UI의 Not found. heading과 Pipeline 화면 부재를 검사했다.
HTTP 404를 반드시 반환했다는 판정은 하지 않는다.

## Commands and Static Checks

승인 timeout 수정 뒤 아래 검사를 수행했고, 이후 application code는 변경하지
않은 상태로 최종 E2E 전체를 실행했다.

| ID | 연결 대상 | Gate | 명령 | 성공 기준 및 실제 결과 | 판정 |
| --- | --- | --- | --- | --- | --- |
| C1 | R3 | required | npm run test:web | 290 tests, pass 290, fail 0 — V11 | PASS |
| C2 | R3 | required | npm run check | sync 검증, lint/FSD, next typegen, tsc, architecture 19/19, project availability 17/17, exit 0 — V11 | PASS |
| C3 | R3 | required | npm run build | Prisma generate 및 Next.js production build, exit 0 — V11 | PASS |
| C4 | R3 | required | git diff --check | whitespace 오류 없음, exit 0 — V11 | PASS |

실행 driver는 현 머신의 Temp 경로
`C:\Users\hamso\AppData\Local\Temp\stagekeeper-slot-e2e.cjs`에 있다.
repo root에서 `node.exe --import tsx <driver path>`로 실행했으며,
설치된 Playwright cache, Chrome, DB 생성 권한 및 현재 환경 설정을 전제로 한다.
현재 실행의 재현용 임시 driver이며 저장소의 상시 CI suite는 아니다.
`docs:check` 명령은 이 저장소 package.json에 없으므로 상대 링크, front matter,
gate/판정과 민감정보를 수동 검사했다.

## Evidence Registry

| ID | 종류 | 정제한 증거 및 보존 위치 |
| --- | --- | --- |
| V1 | browser/API/read-back | 최종 driver result: PASS, E01–E14 및 E05a/E12a/E12b 총 17행 모두 PASS; pageErrors=[] / httpFailures=[]; 원본 result.json은 Temp |
| V2 | UI | [반복 슬롯 저장 후](../assets/2026-09-17-pipeline-agent-slots-e2e/pipeline-repeat-slots.png) |
| V3 | UI | [검증된 계획 Inbox](../assets/2026-09-17-pipeline-agent-slots-e2e/inbox-verified-plan.png) |
| V4 | UI | [구현 구간 실행 중](../assets/2026-09-17-pipeline-agent-slots-e2e/implementation-span-running.png) |
| V5 | UI | [인수 gate 도달](../assets/2026-09-17-pipeline-agent-slots-e2e/inbox-before-acceptance.png) |
| V6 | UI | [인수 완료](../assets/2026-09-17-pipeline-agent-slots-e2e/item-accepted.png) |
| V7 | UI | [재개 후](../assets/2026-09-17-pipeline-agent-slots-e2e/item-reopened.png) |
| V8 | UI | [게이트 없는 새 항목](../assets/2026-09-17-pipeline-agent-slots-e2e/backlog-ungated-planning.png) |
| V9 | read-back | 일반 DB 18개 테이블 각각의 count 전후 동일: migration 13, Template 10, 나머지 0. 임시 DB DROP 성공 |
| V10 | UI/runtime | [입력 오류 후 값 초기화](../assets/2026-09-17-pipeline-agent-slots-e2e/backlog-validation-reset.png) 및 [수정 전 승인 오류](../assets/2026-09-17-pipeline-agent-slots-e2e/plan-approval-timeout.png) |
| V11 | commands | 본문 C1–C4의 exit/count 결과; 원본 수정 후 검사 로그는 Temp |

pageerror/HTTP 5xx 수집은 owner의 주 페이지와 오래된 두 번째 탭에 연결했고,
MCP 각 응답은 별도로 성공/예상 domain error를 검사했다. 다른 모든 context의
console 전체를 수집했다는 의미는 아니다.

스크린샷은 가짜 테스트 사용자·프로젝트만 포함함을 확인했다. 연결 문자열,
프로젝트 토큰, JWT, Auth secret, raw trace/인증 state와 원본 로그는 저장소에
보존하지 않는다. trace.zip에는 폐기한 fixture 인증 정보가 있을 수 있어 Temp에만
유지했다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항 | 상태 및 후속 조건 |
| --- | --- | --- | --- |
| F1 | high | 실제 Request plan 승인 트랜잭션 P2028: timeout 5000ms, elapsed 5444ms | 수정 후 E07 및 전체 E2E PASS. 원격 DB round trip을 위한 제한된 15초 timeout 적용 |
| F2 | medium | 잘못된 Backlog key 반환 후 Title/Area/Source 초기화 | 미수정 기존 UI 관찰. 입력 오류에서 값 보존 및 성공 때만 초기화하는 변경·재검증 필요 |
| F3 | low | 재개 후 과거 인수 보고서의 라벨 변경 | 미수정 기존 UI 관찰. 현재 acceptedAt와 독립적인 보고서 목적 식별 및 과거 행 호환성 결정 필요 |

F1 수정 위치는 [board-query.ts](../../../src/server/pipeline/board-query.ts)와
[run-query.ts](../../../src/server/agents/run-query.ts)이다. timeout을 해당
트랜잭션에만 15초로 지정했고, owner/project lock, CAS, 감사 append 원자성과
기존 isolation 옵션은 유지했다.

F2는 [backlog-form.tsx](../../../src/fsd/features/edit-backlog/ui/backlog-form.tsx)의
uncontrolled 입력과 실제 오류 반환 뒤 폼 초기화로 확인했다. 테스트는 정상
흐름을 계속하기 위해 모든 필드를 다시 채웠으며, 제품 수정이 적용된 것은 아니다.

F3는 [item-docs.ts](../../../src/fsd/pages/board-item/model/item-docs.ts)가
현재 acceptedAt로 인수 보고서를 분류하는 경로와 실제 재개 화면을 확인했다.
재개는 acceptedAt를 정상 초기화하므로, 기존 인수 파일이 Validation record
라벨로 보인다. 과거 보고서 삭제나 이전 완료 증거 재사용은 관찰되지 않았다.

F2/F3는 이번 실행에서 확인한 현상이며 Core 1 변경으로 처음 발생했다는 근거는
없다. 외부 issue나 별도 후속 구현안은 만들지 않았으므로 follow-up은 비어 있다.
이 기록은 해당 결함의 수정·종료를 뜻하지 않는다.

예비 실행에서 잘못된 Backlog key, 오류 후 비운 필드, 재개 anchor 및 기본 404
문구를 잘못 기대했던 driver 오류를 수정했다. 수정된 기대값으로 처음부터 전체를
재실행한 결과를 위 표에 사용했다. 이전 PostgreSQL 보고서의 일반 오류와 이번
P2028이 같은 원인이라는 결론도 내리지 않았다.

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| disposable PostgreSQL DB | migrations/templates/users/project/board/pipeline/agent/report/audit | browser/server/Prisma 종료 후 생성한 DB 삭제 확인 | 없음 |
| local Next.js server 및 Chrome | 본 실행용 process/context | 종료 확인 | 없음 |
| 일반 DB | 전후 테이블 count 조회 및 임시 DB 관리 | 18개 테이블 count 모두 동일 | 테스트 write 없음 |
| 실행 산출물 | screenshots/result/trace/logs | 안전한 screenshots만 assets에 보존; 나머지는 Temp | 디스크 증거 파일만 남음 |

실패한 예비 실행들도 자기 임시 DB를 삭제했다. 서비스 DB에 테스트의 감사 기록을
남기지 않았으며, 일반 DB에 대한 증거는 테이블별 행 수 비교이지 전체 행 내용의
해시 검증은 아니다.

## Conclusion

모든 required E01–E14/E05a/E12a/E12b 및 C1–C4가 PASS이므로 README의
규칙에 따라 전체는 pass다. informational O1/O2의 미해결 UI 문제는 이 판정을
앱 전체 무결함으로 확대할 수 없게 하는 제한이다.

OAuth 공급자 로그인, 실제 에이전트의 코드 변경 및 외부 commit 검증은 별도
E2E가 필요하다. F2/F3 수정 뒤에는 해당 UI 오류·재개 사례를 새 보고서로
재검증한다.

## Review Checklist

- [x] 최종 실행 결과와 completed 경로·metadata가 일치한다.
- [x] 기준, required/informational gate, 판정과 증거가 연결돼 있다.
- [x] 실패한 예비 실행과 수정 후 전체 재실행을 구분했다.
- [x] 미해결 UI 문제, 실제 OAuth 제외 및 테스트 outcome의 한계를 기록했다.
- [x] 민감정보·스크린샷·상대 링크와 데이터 최종 상태를 확인했다.
- [x] 저장소에 없는 docs:check 대신 수동 문서 검토와 git diff --check를 수행했다.
