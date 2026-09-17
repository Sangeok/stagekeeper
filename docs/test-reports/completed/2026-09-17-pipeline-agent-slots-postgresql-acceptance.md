---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'acceptance'
report-size: 'compact'
test-levels: ['integration']
test-tools: ['Node.js', 'Prisma', 'pg']
created-at: '2026-09-17'
completed-at: '2026-09-17'
last-executed-at: '2026-09-17T20:57:56+09:00'
tested-revision: 'c5c15f6563722876899d8fa836ce3292a6318a45'
owners: ['user:Sangeok']
related: ['docs/proposals/active/pipeline-agent-slots.md']
primary-area: 'pipeline/agent-slots'
observed-environments: ['local runner / remote PostgreSQL | application services | Node.js 22.13.1 / Windows | database owner']
test-summary: 'pass: PostgreSQL 슬롯 통합 검증 — 재실행 통과 후 테스트 데이터 제거 및 스키마·템플릿 재설치 완료'
follow-up: []
---

# Pipeline agent slots PostgreSQL acceptance

## Summary and Decision

격리 DB 미설정으로 남아 있던 실제 PostgreSQL 검증을 실행했다. 사용자가 현재 DB의
전체 데이터 폐기를 명시적으로 승인하여, 해당 DB의 public 스키마를 초기화한 후
검증 프로세스에만 PIPELINE_SLOT_TEST_DATABASE_URL을 주입했다. 환경 파일은 변경하지 않았다.

첫 실행은 상세 정보 없는 오류로 종료됐다. 같은 초기 상태로 다시 실행한 검증은
모든 assertion을 통과했다. 최초 오류의 원인은 확정하지 못했으므로 반복 안정성이나
장시간 부하 검증까지 통과했다는 의미는 아니다.

## Scope and Criteria

기준 R1은 관련 제안의 Core 1 슬롯 데이터 무결성 계약이다. HTTP, 인증, 외부 에이전트
실행 및 배포 검증은 이번 범위 밖이다.

| ID | 기준 | Gate | 시나리오 | 실제 결과 및 근거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | 기존 그래프·보고서가 있는 상태에서 additive migration | null 바인딩 및 기존 graph/path/commit 보존 assertion, E1 | PASS |
| T2 | R1 | required | 동일 소유자의 두 프로젝트가 마지막 실행 한도를 동시에 소비 | 신규 실행 한 개만 허용, 한도 도달 후 기존 실행 재개, E1 | PASS |
| T3 | R1 | required | 보고서 원장 기록에 DB trigger로 실패 주입 | Report와 TransitionEvent 모두 롤백, E1 | PASS |
| T4 | R1 | required | 실행 회차에 연결된 구현·감사 완료 | entry 갱신, 구현 완료, 인수 승인 전 acceptedAt null, E1 | PASS |
| T5 | R1 | required | 이전 entry의 승인 및 다른 실행의 보고서 제출 | 거부 및 stale 승인 시 원장 불변, 현재 entry 승인 성공, E1 | PASS |
| T6 | R1 | required | AgentRun 및 PipelineRun 삭제 | 보고서 연결 SET NULL, 바인딩된 실행 CASCADE, E1 | PASS |
| T7 | R1 | required | 테스트 후 서비스 DB 정리 | 13개 migration 적용, 기본 템플릿 재설치, E2 | PASS |

## Target and Preconditions

기준 commit에 pipeline-agent-slots 구현이 추가된 미커밋 working tree를 검증했다.
검증 소스는 `scripts/rehearse-pipeline-agent-slots.ts`이며, 실제 Prisma/pg 연결과
application service를 사용한다. 외부 템플릿 제공은 fixture dependency이다.

재실행은 동일 스크립트의 임시 복사본을 사용했다. 차이는 최상위 catch의 오류 진단
출력뿐이며, 연결 문자열을 제거하도록 처리했다. assertion, DB 클라이언트 옵션,
트랜잭션 및 fixture는 변경하지 않았다. 임시 복사본은 실행 후 삭제했다.

재현에는 별도로 준비한 빈 PostgreSQL DB와 해당 환경 변수가 필요하다:

```powershell
node.exe --import tsx scripts/rehearse-pipeline-agent-slots.ts --allow-fixtures
```

이 명령은 fixture를 남긴다. 현재 서비스 DB는 이미 재설치된 상태이므로 다시
그대로 실행할 수 없다. 이번 초기화 승인을 향후 초기화에 대한 상시 승인으로 취급하지 않는다.

## Evidence and Cleanup

- E1: 재실행 exit code 0. 출력:
  `PASS: migration, owner-wide last-slot race, cap resume, bound span completion, stale gate rollback, and deletion relations`
- E2: fixture가 들어 있는 public 스키마 제거 후 `prisma migrate deploy`로 13개
  migration을 정상 적용했다. `scripts/seed-templates.ts`는 `done: 10 templates`로 종료했다.
  최종 read-back은 User=0, Project=0, AgentRun=0, Report=0, Template=10이었다.
- 기존 사용자·프로젝트·토큰과 테스트 fixture는 유지하지 않았다. 사용자는 다시 로그인하고
  프로젝트·토큰을 생성해야 한다. 계정에 부여했던 플랜도 초기화된다.
- 최초 일반 오류는 재현되지 않았고 원인 미확정이다. 유사 오류가 재발하면 자격 증명을
  제외한 상세 오류를 수집해야 한다. 이번 작업에서 application code는 추가 변경하지 않았다.
