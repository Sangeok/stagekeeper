---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'standard'
test-levels: ['static', 'integration', 'end-to-end']
test-tools: ['Playwright', 'Next.js production server', 'Auth.js', 'Prisma', 'pg', 'Node.js test runner', 'ESLint', 'TypeScript']
created-at: '2026-09-18'
completed-at: '2026-09-18'
last-executed-at: '2026-09-18T08:12:51.934+09:00'
tested-revision: 'ce19203'
owners: ['user:Sangeok']
related:
  - 'docs/proposals/active/pipeline-agent-slots.md'
  - 'docs/test-reports/completed/2026-09-17-pipeline-agent-slots-e2e.md'
  - 'docs/test-reports/completed/2026-09-18-pipeline-slot-ui-regression.md'
primary-area: 'pipeline/dev-integration'
observed-environments:
  - 'local | actual application / Server Actions / MCP HTTP | Windows / Chrome / Next.js 16.3.3 / Node.js 22.13.1 | fixture owner Max'
  - 'remote PostgreSQL | disposable databases | Prisma 7.10.0 / pg | database owner'
test-summary: 'pass: dev receipt 계약과 슬롯 결합 실행 통합 후 웹 306개, 서버 DB 10개, 경합 rehearsal, 실제 앱 E2E 17개 및 UI 회귀 11개 통과'
follow-up: []
---

# Pipeline slots dev integration regression

## Scope and Decision

슬롯 구현 커밋 `ce19203`에 최신 `dev`의 `d9cc593`을 통합한 working tree를
검증했다. 두 커밋은 공통 기준 `c5c15f6`에서 출발했다. 서버 실행·보드·MCP와
프로토콜의 충돌을 해결한 결과이며, 통합 후 모든 required 검사가 통과했다.
Phase 2 역할 카탈로그의 구현 인수는 이 보고서 범위에 포함되지 않는다.

모든 outcome은 `receipt={runId,revision,stepId}`를 제출한다. 슬롯 실행은
`entry={runId,entryId,slotId}`도 함께 제출한다. 호환 필드 agentRunId·stepId가
있으면 receipt와 일치해야 한다. 오래된 슬롯 회차·revision은 원장 쓰기 전에
거부하고, standalone/legacy의 범위 내 오래된 receipt는 dev의 거절 감사 규칙을
유지한다. 수락되지 않은 원장은 완료·검증·handoff의 증거로 사용하지 않는다.

dev의 보드 CAS, 단조 증가 updatedAt, 보고서까지 포함하는 정확한 이력 창,
workspace 검증과 DB 주입 서비스도 유지했다. 실제 board writer는 소유자·프로젝트
잠금 뒤 최신 행을 읽는다. 따라서 유효한 동시 계획 제출은 순서대로 기록되고,
사람이 이전 화면에서 읽은 토큰은 계속 stale로 거부된다.

## Required Checks

| ID | 검사 | 실제 결과 | 판정 |
| --- | --- | --- | --- |
| C1 | npm test | core/plugin 156/156 | PASS |
| C2 | npm run test:web | 306/306; 슬롯 receipt·rollback 및 기존 requires 재검사 | PASS |
| C3 | npm run check | 복사본·lint·FSD·route types·tsc; architecture 21/21, availability 17/17 | PASS |
| C4 | npm run test:server | 이력 창·GitHub 응답 경계 2/2 | PASS |
| C5 | npm run build | Prisma generate 및 production build, exit 0 | PASS |
| C6 | PostgreSQL server integration | 실제 DB 테스트 10/10; receipt CAS·감사 원자성·보드 직렬화·stale 사람 요청·sync·migration·templates | PASS |
| C7 | scripts/rehearse-pipeline-agent-slots.ts --allow-fixtures | legacy migration, 소유자 전체 마지막 dispatch 경합, cap 재개, 결합 구간 완료, stale 게이트 zero-write 및 삭제 관계 | PASS |
| C8 | npm run test:templates | 로컬 private template 테스트 25/25 | PASS |
| E1 | 실제 앱 Core 1 Playwright | 기존 전체 17개 시나리오를 receipt 전달과 함께 처음부터 재실행, 모두 PASS | PASS |
| E2 | 실제 앱 UI Playwright | 초안 보존·편집/추가 모드·과거 목적 migration·후속 인수·재개 11개 검사, 모두 PASS | PASS |

`check`가 verify:fsd와 test:architecture를 포함한다. C6/C7은 서로 다른 새 DB에서
실행했고 각각 종료 후 삭제했다. C6는 test:server:integration과 같은 migration 및
server-only bootstrap/test 명령을 사용하는 로컬 driver로 실행했다.
C7은 공개 테이블이 없는 DB만 허용하는 저장소의 rehearsal 스크립트다.

## Actual Application Evidence

E1은 4207, E2는 4208 포트의 실제 `next start`를 사용했다. UI 프로젝트 생성·토큰
발급, 실제 Auth.js/DAL, Server Actions, MCP HTTP와 PostgreSQL을 연결했다.
page.route mock이나 컴포넌트 fixture는 사용하지 않았다.

- E1 완료: `2026-09-18T08:12:51.934+09:00`, 17/17, pageErrors=[], httpFailures=[].
- E2 완료: `2026-09-18T08:10:46.227+09:00`, 11/11, pageErrors=[], httpFailures=[].
- 각 실행에서 임시 DB·서버·브라우저를 정리했고 일반 DB 18개 테이블 count가
  전후 동일했다. 이 비교는 전체 행 내용 hash 검사가 아니다.
- 범위와 시나리오는 이전 [전체 E2E](./2026-09-17-pipeline-agent-slots-e2e.md)와
  [UI 회귀](./2026-09-18-pipeline-slot-ui-regression.md)를 따른다. 이전 보고서는
  당시 결과를 보존하며, 위 결과는 이번 통합본의 새로운 실행이다.

driver와 raw 증거는 `C:\Users\hamso\AppData\Local\Temp`에 있다.
`stagekeeper-slot-merge-e2e.cjs`, `stagekeeper-slot-merge-ui-e2e.cjs`를 repo root에서
`node.exe --import tsx <driver>`로 실행했다. 결과는 각각
`stagekeeper-slot-merge-e2e-artifacts/result.json`과
`stagekeeper-slot-merge-ui-e2e-artifacts/result.json`이다. DB driver는
`stagekeeper-slot-merge-db.cjs`이며 원본 로그는 `stagekeeper-slot-merge-db-artifacts`에
보존한다. E2E driver는 현재 머신의 Playwright cache·Chrome·DB 생성 권한에
의존하는 로컬 실행 도구이며 저장소의 상시 CI suite는 아니다.

모든 격리 검사를 종료한 뒤 `npx prisma migrate deploy`로 일반 DB에 dev의
`20260915090000_agent_receipts_and_callers`를 적용했다. 15개 migration 상태에서
추가 receipt 컬럼·인덱스 적용이 성공했다. 이 additive schema 변경과 migration
원장 추가는 위 E2E 전후 count 비교 이후의 별도 작업이며 기존 행을 삭제하지 않는다.

## Findings and Limits

예비 C6에서 테스트 항목에 PipelineRun을 준비하지 않아 회차 조회가 실패했다.
fixture에 실제 run을 준비한 뒤 전체 DB suite를 다시 실행해 10개 모두 통과했다.
변수 읽기 후 requires 검사도 기존 열린 단계가 바뀐 상태에서는 거부되는 조건으로
검증했다. 새 진입 단계는 transaction 밖 변수 읽기 후의 현재 상태에서 고른다.

로컬 private template 시험의 이전 메모리 adapter는 receipt를 보내지 않아 8건이
실패했다. 해당 시험 adapter를 새 계약에 맞춘 뒤 25건 모두 통과했다. 이 로컬
fixture 수정은 git 미추적 private template 디렉터리에 있으며 이번 PR에 포함하지
않는다. UI E2E의 최초 실행은 sandbox DB 연결 EACCES로 시작 전 실패했고,
권한을 받아 다시 실행한 최종 11개 검사는 모두 통과했다.

인증은 서명한 fixture JWT이며 외부 GitHub OAuth 로그인은 검사하지 않았다.
에이전트 작업은 실제 MCP 단계 호출에 성공 outcome과 가짜 commit SHA를 전달한
것이며 실제 Claude 작업과 원격 commit 실재 확인은 제외했다. 이번 실행 범위의
새로운 미해결 제품 발견 사항은 없다. 인증 trace·토큰·연결 문자열·raw logs는
저장소에 포함하지 않는다.
