---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'compact'
test-levels: ['static', 'component', 'integration']
test-tools: ['Node.js test runner', 'Prisma', 'pg', 'ESLint', 'TypeScript', 'Next.js build', 'Playwright']
created-at: '2026-09-17'
completed-at: '2026-09-17'
last-executed-at: '2026-09-17T21:24:07+09:00'
tested-revision: 'c5c15f6563722876899d8fa836ce3292a6318a45'
owners: ['user:Sangeok']
related:
  - 'docs/proposals/active/pipeline-agent-slots.md'
  - 'docs/test-reports/completed/2026-09-17-pipeline-agent-slots-postgresql-acceptance.md'
primary-area: 'pipeline/agent-slots'
observed-environments:
  - 'local | automated suites / browser component fixtures | Node.js 22.13.1 / headless Chrome / Windows | fixture role'
  - 'remote PostgreSQL | temporary empty databases | Prisma 7.10.0 / pg | database owner'
test-summary: 'pass: 자동 테스트 505개와 정적·빌드·브라우저 검사 및 PostgreSQL 3회 반복 — 이전 오류 미재현, 임시 DB 정리 완료'
follow-up: []
---

# Pipeline agent slots regression

## Summary and Decision

사용자의 재검증 요청에 따라 전체 자동 검사와 실제 DB 검증을 새로 실행했다.
앞선 PostgreSQL 검증에서 처음 한 번 발생했던 일반 오류는 이번 원본 스크립트
세 번 연속 실행에서 재현되지 않았다. 최초 오류의 원인이 규명되거나 수정됐다는
의미는 아니며, 이번 세 번의 실행 범위에서 모두 통과한 것으로 판정한다.

검증 중 application code와 기존 테스트 소스는 수정하지 않았다. 기존 구현이
포함된 working tree를 대상으로 했으며 새로 추가한 저장소 산출물은 이 보고서다.

## Scope and Criteria

R1은 관련 제안의 Core 1 계약, R2는 AGENTS.md의 저장소 검증 요구사항이다.

| ID | 기준 | Gate | 실행 및 범위 | 결과 및 증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | npm run test | 154/154, fail=0, E1 | PASS |
| T2 | R1 | required | npm run test:web | 290/290, fail=0, E1 | PASS |
| T3 | R1 | required | npm run test:templates | 25/25, fail=0, E1 | PASS |
| T4 | R2 | required | npm run check | 복사본 동기화, lint, FSD, route typegen, tsc, architecture 19/19, project availability 17/17, E2 | PASS |
| T5 | R2 | required | npm run verify:fsd, npm run db:validate | 경계 및 Prisma schema 유효, E2 | PASS |
| T6 | R2 | required | npm run build | Prisma generate 및 Next.js production build, exit 0, E2 | PASS |
| T7 | R1 | required | 실제 PipelineRail / InboxCard를 브라우저 fixture에서 실행 | 반복 슬롯 추가·이동·저장, 게이트 없는 저장 확인, 동일 snapshot 승인 잠금 유지, 새 entry/run 잠금 해제, 늦은 이전 응답 격리, E3 | PASS |
| T8 | R1 | required | 원본 PostgreSQL 검증 스크립트를 서로 다른 빈 DB에서 3회 순차 실행 | 세 번 모두 PASS 및 exit 0, E4 | PASS |
| T9 | R1 | required | 임시 DB 삭제 및 서비스 DB read-back | 임시 DB 3개 삭제 성공, 기존 18개 테이블별 행 수 동일, E5 | PASS |

## Target and Preconditions

`harness/pipeline-agent-slots-reconcile` 브랜치에서 기준 commit 대비 미커밋
슬롯 구현, 새 migration 및 query service/test 파일이 있는 상태를 검증했다.
private 템플릿도 현재 working copy를 대상으로 검사했다.

기존 서비스 DB의 역할에 CREATE DATABASE 권한이 있어 별도 서버나 사용자 설정
없이 임시 DB를 만들 수 있었다. 매 반복마다 임의 식별자를 붙인 DB를 생성하고
검증 자식 프로세스에만 해당 URL을 주입했다. `.env`와 사용자 환경 변수는
변경하지 않았고, 기존 서비스 DB의 스키마·데이터 초기화는 하지 않았다.

각 DB에 실행한 명령은 다음과 같다. `PIPELINE_SLOT_TEST_DATABASE_URL`은 반드시
새 빈 테스트 DB를 가리켜야 하며 fixture가 남으므로 같은 DB로 재실행할 수 없다.

```powershell
node.exe --import tsx scripts/rehearse-pipeline-agent-slots.ts --allow-fixtures
```

이번에는 진단용 복사본 없이 원본 스크립트를 사용했다. 실제 마이그레이션과
query service를 사용하지만 외부 템플릿 dependency는 fixture다. 브라우저 검사는
실제 UI 컴포넌트를 로컬 fixture에 묶어 수행한 것으로, 배포 사이트의 로그인·HTTP·MCP
전체 경로 검증은 포함하지 않는다. 3회 반복은 장시간 부하·안정성 시험을 대신하지 않는다.

## Evidence and Cleanup

- E1: 자동 테스트 요약의 tests/pass/fail은 각각 154/154/0, 290/290/0,
  25/25/0이었다. check 내부의 19/19/0과 17/17/0을 합해 자동 테스트는 총 505개다.
- E2: check, verify:fsd, db:validate, build의 exit code가 모두 0이었다.
  빌드는 정적 페이지 12개 생성까지 완료했다. `git diff --check`도 통과했다.
- E3: headless Chrome에서 PipelineRail과 InboxCard의 두 시나리오 그룹 모두
  PASS 출력, exit 0이었다. 테스트가 수집한 pageerror는 없었다. fixture 서버와
  브라우저는 종료했다.
- E4: 각 반복의 종료 코드는 0이었다. 각 실행의 최종 출력은 동일했다:
  `PASS: migration, owner-wide last-slot race, cap resume, bound span completion, stale gate rollback, and deletion relations`.
  legacy graph와 audit 보존, 동일 소유자의 마지막 dispatch 경합, cap에서 재개,
  Report insert 후 강제 실패 롤백, 구현 구간 완료, stale 승인 거부와 원장 불변,
  SET NULL/CASCADE 관계 assertion을 매번 실행했다.
- E5: 각 검증 프로세스가 종료된 뒤 해당 실행에서 생성한 DB만 삭제했고 세 번
  모두 삭제에 성공했다. 서비스 DB의 전후 read-back은 Template=10,
  _prisma_migrations=13, 나머지 16개 테이블=0으로 동일했다. 이 검사는 행 수
  비교이며 전체 row 내용의 hash 검사는 아니다. 이번 작업은 서비스 DB에
  데이터 변경 SQL을 실행하지 않았다.

연결 문자열과 계정 비밀은 보고서에 저장하지 않았다. 이전 일시 오류의 원인
미확정 사실은 기존 보고서에 보존하며, 이번 실행에서 새로운 실패는 발견하지 못했다.
