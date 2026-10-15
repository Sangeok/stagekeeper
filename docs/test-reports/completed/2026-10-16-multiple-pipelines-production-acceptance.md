---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['integration', 'contract', 'end-to-end']
test-tools: ['Prisma migrate', 'PostgreSQL pg_dump and pg_restore', 'Vercel API and CLI', 'GitHub CLI', 'Node.js fetch']
created-at: '2026-10-16'
completed-at: '2026-10-16'
last-executed-at: '2026-10-16T00:40:00+09:00'
tested-revision: '1091e7306e0b796c6cd0ed8ff2b7e8325defef0d'
owners: ['user:Sangeok']
related:
  - 'docs/proposals/completed/2026-10-16-multiple-pipelines.md'
  - 'docs/test-reports/completed/2026-10-16-multiple-pipelines-implementation.md'
  - 'docs/test-reports/completed/2026-10-16-multiple-pipelines-cleanup.md'
  - 'https://github.com/Sangeok/stagekeeper/pull/163'
  - 'https://github.com/Sangeok/stagekeeper/pull/164'
primary-area: 'pipeline/multiple-pipelines'
observed-environments:
  - 'production | stagekeeper.dev and MCP | Vercel Node 24 and PostgreSQL 18.6 | deployment operator and temporary project credential'
  - 'local | restored production snapshot | Windows PostgreSQL 18.6 | isolated restore operator'
test-summary: 'pass: A/B 운영 전환 — 백업 복원·기존 원장 보존·각 서버 인수·서비스 재개 확인'
follow-up: []
---

# Multiple pipelines 운영 전환 인수

## Summary and Decision

사용자의 후속 진행 지시와 운영 DB 확인에 따라 두 release를 순서대로 배포했다.
A와 nullable 서버를 인수한 뒤에만 cleanup PR #164를 병합하고 B를 적용했다.
최종 서버를 기존 도메인에 연결한 뒤 점검 차단을 해제했다. 도메인 재구매나 DNS 변경은 필요하지 않았다.

## Scope and Criteria

포함 범위는 실제 운영 백업과 복원, 구형 writer 차단·drain, A/B migration,
두 서버의 기본 조회와 기존 실행 호환, main fast-forward, 재개 및 임시 자격 정리다.
사용자 항목을 변경하는 운영 브라우저 편집과 `pipeline_next`의 지연 전진은 실행하지 않았다.
웹 mutation·stale 회복·시각 배치 검증은 연결된 격리 DB·실제 Next·브라우저 보고서가 근거다.
private bundle 전체 지원 인증은 이 배포의 판정 범위가 아니다.

| 기준 ID | 기준 문서 | 적용 범위 | 확인 기준 |
| --- | --- | --- | --- |
| R1 | 제안서 배포 1–2 | 복구·중지 | 실제 복원 가능한 백업, 구형 요청 유입 차단과 종료 대기 |
| R2 | 제안서 배포 3–6 | 전환 순서·보존 | A → nullable 서버 → B → 필수 서버, 기존 실행 데이터 보존 |
| R3 | 제안서 배포 4·7 | 인수·재개 | 기본 읽기·head·기존 항목, 공개 서비스 복귀 |
| R4 | AGENTS.md | 통합·승격 | 녹색 PR을 dev에 병합하고 main은 fast-forward만 수행 |

## Test Target

- 원래 checkout의 미커밋 변경을 사용하지 않은 별도 release worktree를 사용했다.
- Vercel 운영 도메인은 `stagekeeper.dev`이며 운영 DB는 사용자가 `.env`의 DB로 확인했다.
- 운영 비밀 환경변수는 Vercel에서 `[SENSITIVE]`로 반환되어 값 대조를 하지 않았다.
  대신 짧은 만료의 임시 프로젝트 자격으로 실제 MCP를 호출하고, DB에서 조회한 프로젝트와 응답 ID가 일치하는지 확인했다.
- 로컬 `AUTH_SECRET`으로 만든 검증 세션은 운영 로그인으로 리다이렉트되어 운영 웹 세션 검증에 사용하지 않았다.
- API 응답의 실제 프로젝트·항목 내용과 자격 값은 저장소에 기록하지 않았다.

## Preconditions and Test Data

- 운영에는 완료된 선행 migration 25개가 있었고 미완료 migration은 없었다.
- 최초·최종 백업 각각을 개인 계정과 SYSTEM만 접근 가능한 OneDrive 밖 폴더에 보존했다.
  최종 백업은 모든 주소의 차단 확인 후 330초 이상 경과한 다음 생성했다.
- 소유 프로젝트의 보드 항목과 이력은 조회만 했다. 각 HTTP 인수마다 임시 ProjectToken 1개를 만들고 `finally`에서 제거했다.
- 로컬 복원용 PostgreSQL은 별도 포트 55437을 사용했고 리허설 후 종료했다.
  사용자 머신의 다른 앱이 사용하는 포트 3000 프로세스는 중지하지 않았다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오 | 기대 결과 | 실제 결과·증거 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | 최종 custom-format 백업 복원 | 원본과 동일 | 21개 테이블 행 수·내용 지문 일치; E1 | PASS |
| T2 | R1 | required | 복원본 A → B → rollback | 전환·복귀 가능 | 모두 성공, 원장 보존·nullable 복구; E1 | PASS |
| T3 | R1 | required | 운영 차단·drain | 구형 writer 유입 없음 | 인증 보호를 통과한 196개 요청 모두 403, 모든 기존 배포 timeout 300초·추가 30초 대기; E2 | PASS |
| T4 | R2 | required | migration A | 기본·정의 backfill 정상 | null 판·잘못된 기본/소유/정의 모두 0, nullable 유지; E3 | PASS |
| T5 | R2, R3 | required | nullable 서버 운영 인수 | 실제 배포·DB 조회 정상 | 도메인 alias와 commit 일치, MCP·head·항목 연결 통과; E3·E4 | PASS |
| T6 | R2 | required | migration B | 소유 관계 필수·원장 보존 | null 0, NOT NULL, 남은 migration 0, 원본 19개 테이블 기존 컬럼의 지문 일치; E3 | PASS |
| T7 | R2, R3 | required | 필수 서버 운영 인수 | 기존 실행 조회 정상 | MCP 보드 2개·각 이력, DB 프로젝트 2개·기존 항목 7개 연결·head 계산 통과; E4 | PASS |
| T8 | R3 | required | 서비스 재개·자격 정리 | 정상 공개 응답·옛 writer 차단 | `/`·`/login` 200, 무인증 MCP 401, 구형 249개 hostname 403, 임시 보호 우회 자격 폐기; E5 | PASS |
| T9 | R4 | required | 두 release 승격 | dev 검증 후 FF | 두 PR·병합 dev check 성공, main 두 번 fast-forward; E6 | PASS |

### Scenario Details

Vercel WAF에 임시 전체 요청 차단과 구형 hostname 차단을 적용했다.
운영자의 검증 요청만 임시 header로 통과시켰으며, 그 header를 가진 요청도 구형 hostname에서는 거부됐다.
SSO 로그인으로 가는 302를 차단 성공으로 세지 않고, CLI가 발급한 임시 protection bypass로 SSO를 통과시켜 403을 확인했다.
이전 serverless 인스턴스를 물리적으로 삭제한 것은 아니다. 기존 191개 READY 배포의 설정에 모두 300초 timeout이 있고 별도 function override가 없음을 확인해, 요청 유입을 막은 뒤 330초를 기다렸다. DB에는 idle 연결만 남았다.

최종 재개 때 임시 전체 차단만 제거했다. `Retired single-pipeline deployments` 규칙은
구형 188개 배포와 그 alias에 해당하는 249개 hostname을 계속 차단한다.
이 규칙을 풀거나 과거 배포로 rollback하려면 먼저 제안서의 데이터 보정 절차를 따라야 한다.

기존 데이터 지문은 원본 컬럼 순서로 계산했다. `Project`·`PipelineVersion`에 추가된
컬럼은 별도 backfill 단언으로 확인했고, migration 기록과 정상 인증 조회가 갱신하는
`RequestRateWindow`는 원본 지문 비교에서 제외했다. 임시 토큰 제거 뒤 ProjectToken을 포함한
나머지 19개 원본 테이블이 일치했다. 새 실행이나 이벤트·보고서는 만들지 않았다.

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 결과·증거 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | T1, T2 | required | pg_dump 18.6 / pg_restore 18.6 | archive·복원·checksum 유효 | exported snapshot, TLS verify-full, 실제 복원 성공; E1 | PASS |
| C2 | T4, T6 | required | Prisma migrate status / deploy | 대기가 각각 A, B 하나 | 두 status의 예상 exit 1과 이름 확인 후 deploy exit 0; 마지막 대기 0; E3 | PASS |
| C3 | T9 | required | gh check 조회 / git merge-base / merge --ff-only / push | 녹색 및 FF | main: `08bd0f0 → 2e9832b → 1091e73`; E6 | PASS |
| C4 | T5, T7 | required | 배포 MCP POST와 로컬 Prisma READ ONLY | 실제 데이터 조회·무변경 | `project_get`·`board_list`·`board_get`, Pipeline view·head·item view 통과; E4 | PASS |

## Evidence Registry

정제한 수치·시각·배포 ID는 [운영 증거 JSON](../assets/2026-10-16-multiple-pipelines-production-acceptance/release-evidence.json)에 보존한다.
시각은 JSON에서 UTC, 이 문서의 날짜는 KST다.

| ID | 종류 | 증거 | 보존 위치 |
| --- | --- | --- | --- |
| E1 | archive / restore | 최종 백업 109,258 bytes, SHA-256 `063b4730e36f46daafeddb1aa5cb049b9544955b5ec623696b6af6a485e761ef`; 21개 표 복원 및 A/B/rollback | 정제 JSON, 비공개 백업 폴더 |
| E2 | firewall / drain | 00:27:09 전체 차단 확인, timeout 300초, final backup 시작 00:32:51 | 정제 JSON, 비공개 운영 기록 |
| E3 | migration / read-back | A 00:34:44, B 00:37:17, 최종 검증 00:39:12 | 정제 JSON |
| E4 | HTTP / SQL | A 서버 `dpl_FgNqhbeo1CXB4RJxpAvUq8edYJJL`, B 서버 `dpl_Dq5TnaCuNut5PupiwfGhERoE9K6p`; 각 alias·MCP·읽기 전용 인수 | 정제 JSON |
| E5 | network / cleanup | 00:40:00 서비스 재개 확인, 임시 protection bypass 폐기, 구형 차단 규칙 1개 유지 | 정제 JSON |
| E6 | CI / Git | [첫 dev check](https://github.com/Sangeok/stagekeeper/actions/runs/38753463378), [cleanup dev check](https://github.com/Sangeok/stagekeeper/actions/runs/38761860957), PR #163·#164 | GitHub 및 commit 이력 |

백업은 `%LOCALAPPDATA%/stagekeeper-backups/multiple-pipelines-2026-10-15T15-32-51.210Z-8105026e/production.dump`,
원본 운영 기록은 같은 상위 폴더의 `multiple-pipelines-ops-20261016`에 있다.
비밀값이 들어 있는 원본 환경파일·WAF 설정·원본 응답은 공개 저장소에 넣지 않았다.

## Findings and Follow-up

배포를 막는 신규 제품 결함은 없었다. 최초 체크섬 대조는 Windows 줄바꿈 차이를 발견했고,
LF/CRLF만 정규화한 SHA-256 중 운영 값과 일치함을 확인했다. migration SQL은 수정하지 않았다.
읽기 전용 시험에서 `nextFor`는 `ensureRun`의 `SELECT FOR UPDATE` 때문에 거부되어 중단됐다.
실제 cursor 전진을 검증한 것으로 기록하지 않고, 읽기 함수와 기존 원장 보존으로 인수 범위를 제한했다.
pg의 동시 query 사용 deprecation 경고가 있었지만 현재 버전의 시험 결과에는 영향을 주지 않았다.

## Test Data and Cleanup

| 리소스 | 변경 | 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| 운영 DB | A/B DDL·backfill | 기대 스키마·소유 관계, 기존 실행 원장 보존 | 의도한 기능 변경 |
| 임시 ProjectToken | 배포 전·A·B 검증마다 생성 | 각 검증 후 삭제 | 요청 제한 집계·플랫폼 접근 로그만 남음 |
| Vercel protection bypass | 인증 보호 후 WAF 검증용 생성 | 폐기, project의 우회 secret 0개 | 없음 |
| 임시 WAF maintenance | 전체 요청 차단 | 제거 | 구형 hostname 차단 1개는 의도적으로 유지 |
| 로컬 복원 cluster | 복원·A/B·rollback | 자기 cluster 종료 | ACL로 제한한 복구 자료 보존 |

## Conclusion

모든 required 항목이 PASS여서 운영 전환을 완료했다. 추가적인 운영 fixture 변경이나
사용자 브라우저 편집 검증은 이번 인수 결과에 포함하지 않는다. rollback이 필요하면
서비스를 다시 차단하고 이 백업 및 제안서의 보상 절차를 사용한다.

## Review Checklist

- [x] 기준·required 실행 항목·증거·최종 판정이 연결되어 있다.
- [x] 실제 운영 결과와 격리 검증, 미검증 범위를 구분했다.
- [x] 비밀값·사용자 데이터가 없는 정제 증거만 저장소에 남겼다.
- [x] 백업·임시 자격·서버·차단 규칙의 최종 상태를 확인했다.
- [x] 메타데이터·상대 링크·SQL 보존을 확인했다. 저장소에 `docs:check` 명령이 없어 경로·metadata 검증으로 대체했다.
