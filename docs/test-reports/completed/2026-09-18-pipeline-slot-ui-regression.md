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
last-executed-at: '2026-09-18T00:46:22.6293139+09:00'
tested-revision: 'c5c15f6563722876899d8fa836ce3292a6318a45'
owners: ['user:Sangeok']
related:
  - 'docs/test-reports/completed/2026-09-17-pipeline-agent-slots-e2e.md'
  - 'docs/proposals/active/pipeline-agent-slots.md'
primary-area: 'pipeline/ui-regression'
observed-environments:
  - 'local | actual application UI / Server Actions / MCP HTTP | Windows / headless Chrome / Next.js 16.3.3 / Node.js 22.13.1 | anonymous / fixture owner Max'
  - 'remote PostgreSQL | disposable database and additive service migration | Prisma 7.10.0 / pg | database owner'
test-summary: 'pass: 미해결 폼 초기화·과거 인수 보고서 라벨 오류 수정; 실제 앱 E2E 11개 검사와 웹 테스트 292개, 정적 검사·빌드 통과'
follow-up: []
---

# Pipeline UI findings regression

## Summary and Decision

앞선 actual application E2E의 F2/F3를 수정하고 해당 재현 조건을 실제 앱에서
다시 검증했다. 입력 오류 뒤 초안 보존과 과거 인수 보고서 라벨 보존을 확인했다.
앞선 보고서는 당시 미수정 결과를 남기는 기록으로 유지한다.

이번 실행은 두 UI 수정의 회귀 검사이며 이전 Core 1 전체 17개 시나리오를
새로 실행했다는 뜻은 아니다.

## Scope and Criteria

| 기준 | 근거 | 적용 범위 및 성공 기준 |
| --- | --- | --- |
| R1 | 이전 E2E F2, 사용자 수정 요청 | 잘못된 Key·중복 Key·편집 오류에서 초안 유지; 추가 성공 때만 비우기 |
| R2 | 이전 E2E F3, 사용자 수정 요청 | 과거 인수 여부를 제출 당시 기록으로 식별; 재개·후속 인수에도 종류 보존 |
| R3 | AGENTS.md, docs/architecture/fsd.md·protocol.md | FSD/server 경계, 타입·lint·관련 테스트·production build 및 additive migration |

기존 인수 상태의 의미는 유지한다. 재개는 BoardItem.acceptedAt를 초기화하지만
보고서가 제출 당시 인수 기록이었다는 사실은 유지해야 한다.

## Test Target

- 기준 commit 대비 미커밋 Core 1 구현이 있는 working tree에 이번 국소 수정을 추가했다.
- 새 production build를 `next start`로 `http://127.0.0.1:4207`에서 실행했다.
- Playwright `1.64.0-alpha-2026-09-14`, 설치된 headless Chrome, viewport 1440×1000.
- fixture JWT 세션은 별도 test secret으로 발급하고 실제 Auth.js/DAL에서 검증했다.
  GitHub OAuth 로그인 자체, 외부 commit 존재 및 실제 Claude 작업은 제외했다.
- 브라우저 form과 실제 Server Action을 사용하고 UI 발급 토큰으로 실제 MCP를 호출했다.
  page.route mock과 컴포넌트 fixture는 사용하지 않았다.
- 보고서 표시 검사는 완료된 항목·계획·과거 감사 이벤트를 DB fixture로 준비한 뒤,
  새 인수 보고 제출과 재개는 실제 MCP/브라우저를 통해 실행했다.
  따라서 계획부터 구현 완료까지의 에이전트 전체 실행 검사는 이번 범위에 없다.

## Preconditions and Test Data

일반 DB 설정을 이용해 자기 이름의 임시 DB를 만들고, 앱 연결을 해당 DB로
지정했다. 14개 migration 및 private template 10개를 적용하고 fixture 사용자,
프로젝트와 테스트 항목을 만들었다. 일반 DB에는 E2E fixture를 넣지 않았다.

legacy 복원 검사는 임시 DB에서 과거 Report와 같은 시각의 report 감사 이벤트를
준비하고 새 컬럼을 제거한 뒤, 최종 migration.sql 전체를 실제 PostgreSQL에서
실행했다. 이 schema 조작은 폐기할 테스트 DB에서만 수행했다.

## Test Matrix

| ID | 기준 | Gate | 시나리오·기대 결과 | 실제 결과 및 증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| E01 | R3 | required | 미인증 접근 제한 | projects에서 로그인 redirect — V1 | PASS |
| E02 | R3 | required | UI 프로젝트 생성·토큰 발급 | 실제 Server Action 및 owner/token 저장 — V1 | PASS |
| E03 | R3 | required | 실제 MCP 연결·workspace sync | UI 토큰으로 HTTP 초기화·sync 성공 — V1 | PASS |
| U01 | R1 | required | 잘못된 Key 제출 | Key/Title/Area/Source 모두 유지, insert 없음 — V1/V2 | PASS |
| U02 | R1 | required | Key만 수정해 추가 성공 | 보존한 제목·영역·여러 줄 Source 저장, 네 입력란 비워짐 — V1 | PASS |
| U03 | R1 | required | 중복 Key 오류 | 오류 뒤 제목·Source 초안 유지 — V1 | PASS |
| U03a | R1 | required | 편집 오류·성공 및 추가 모드 전환 | 공백 제목 서버 오류에도 draft 보존; 편집 성공 때 값 유지; 추가 모드는 빈 폼 — V1 | PASS |
| U04 | R2 | required | 과거 보고서 목적 migration | 현재 acceptedAt가 null이어도 과거 인수 true·검증 false 복원 및 올바른 링크 표시 — V1 | PASS |
| U05 | R2 | required | 새 인수 보고 실제 MCP 제출 | isAcceptance=true 저장; 새 인수 후에도 이전 Acceptance record 유지 — V1/V3 | PASS |
| U06 | R2 | required | 브라우저 Reopen implementation | acceptedAt null·implementing 전이, 인수 링크 2개·검증 링크 1개 그대로 유지 — V1/V4 | PASS |
| E14 | R3 | required | 오류·정리 및 일반 DB read-back | 관찰 pageerror/HTTP 5xx 없음; 임시 DB·서버·브라우저 종료; 일반 DB 18개 테이블 count 전후 동일 — V1 | PASS |

## Commands and Static Checks

| ID | 기준 | Gate | 명령 | 실제 결과·증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| C1 | R3 | required | npm run test:web | 292/292, fail 0; 인수 목적 회귀 2건 추가 — V5 | PASS |
| C2 | R3 | required | npm run check | sync·lint·FSD·route types·tsc, architecture 19/19, availability 17/17, exit 0 — V5 | PASS |
| C3 | R3 | required | npm run build | Prisma generate 및 production build, exit 0 — V5 | PASS |
| C4 | R3 | required | git diff --check | 저장소 기본 줄바꿈 설정에서 exit 0 — V5 | PASS |
| C5 | R2/R3 | required | npx prisma migrate deploy | E2E 종료 뒤 일반 DB에 새 nullable 컬럼과 legacy backfill migration 적용, exit 0 — V6 | PASS |

임시 driver는 `C:\Users\hamso\AppData\Local\Temp\stagekeeper-slot-ui-e2e.cjs`다.
repo root에서 `node.exe --import tsx <driver>`로 실행했다. 설치된 Playwright cache,
Chrome, 현재 DB 설정 및 DB 생성 권한이 필요하며 상시 CI suite는 아니다.
저장소에 `docs:check` 명령은 없어 문서 metadata·상대 링크·민감정보를 수동 검사했다.

## Evidence Registry

| ID | 종류 | 정제한 증거·보존 위치 |
| --- | --- | --- |
| V1 | browser/MCP/DB | 최종 driver result PASS; E01/E02/E03/U01/U02/U03/U03a/U04/U05/U06/E14 총 11개 모두 PASS; pageErrors=[] / httpFailures=[]; result.json은 Temp |
| V2 | UI | [오류 후 입력 보존](../assets/2026-09-18-pipeline-slot-ui-regression/draft-preserved.png) |
| V3 | UI | [후속 인수 후 과거 기록 유지](../assets/2026-09-18-pipeline-slot-ui-regression/acceptance-history.png) |
| V4 | UI | [재개 후 인수 기록 유지](../assets/2026-09-18-pipeline-slot-ui-regression/reopen-history.png) |
| V5 | commands | 본문 검사 count/exit 결과; web/check 원본 로그는 Temp |
| V6 | migration | nullable Report.isAcceptance 및 legacy audit 복원 적용 성공; 테스트 fixture를 일반 DB에 옮기지 않음 |

스크린샷은 가짜 테스트 사용자·프로젝트만 포함함을 확인했다. 프로젝트 토큰,
JWT, test secret, 연결 문자열과 raw 인증 trace는 저장소에 보존하지 않는다.
인증 정보를 포함할 수 있는 원본 trace와 logs는 Temp에만 있다.

## Findings and Follow-up

F2 수정은 [backlog-form.tsx](../../../src/fsd/features/edit-backlog/ui/backlog-form.tsx)의
controlled draft와 성공 시 추가 폼 초기화다. pending 중 수정은 잠그고 오류 결과에서는
draft를 보존한다. [project-backlog-page.tsx](../../../src/fsd/pages/project-backlog/ui/project-backlog-page.tsx)의
form key는 편집 항목·추가 모드 전환 때 다른 draft를 섞지 않게 한다.

F3 수정은 [board-query.ts](../../../src/server/pipeline/board-query.ts)가 report 생성 때
제출 당시 인수 여부를 저장하고, [item-docs.ts](../../../src/fsd/pages/board-item/model/item-docs.ts)가
그 값을 우선 사용하도록 한 것이다.
[migration.sql](../../../prisma/migrations/20260917010000_report_acceptance_purpose/migration.sql)은
같은 항목·트랜잭션 시각의 report 감사 이벤트로 legacy main-loop 목적을 복원한다.
같은 시각에 상충하는 목적이 있거나 근거가 없는 행은 추측하지 않고 null로 둔다.
복원 불가 legacy 행은 현재 acceptedAt를 이용하던 fallback을 유지한다.
이번 대상 DB에는 기존 Report 행이 없어 복원 불가 운영 행은 없다.

예비 실행의 Source/Note 라벨 선택자, textarea 전송의 CRLF 비교 기대값과
fixture의 필수 createdBy 값을 보완하고, 최종 전체 회귀 시나리오를 처음부터 재실행했다. 이 두 driver 오류는
새로운 제품 결함으로 판정하지 않았다. 최종 실행 범위에서 신규 미해결 발견 사항은 없다.

## Test Data and Cleanup

| 리소스 | 변경·정리 | 최종 영향 |
| --- | --- | --- |
| disposable DB | 14 migrations·templates·fixture 및 migration 재실행 후 DB 삭제 | 테스트 데이터·감사 로그 남지 않음 |
| Next.js/Chrome | 본 실행 process와 context 종료 확인 | 테스트 서버 없음 |
| 일반 DB E2E 구간 | 테이블 count 전후 18개 모두 동일 | E2E fixture write 없음 |
| 일반 DB migration | E2E 종료 뒤 additive 목적 컬럼·backfill 및 migration 원장 추가 | schema 업데이트; 기존 사용자 데이터 삭제 없음 |
| 증거 파일 | 안전한 screenshots만 assets, raw trace/logs는 Temp | 디스크 증거 파일 |

실패한 예비 실행들도 자기 임시 DB를 정리했다. E2E의 전후 count 비교는 행 내용
전체를 hash로 비교한 검사가 아니며, 이후 C5의 정상 migration 원장 추가와 구분한다.

## Conclusion

모든 required 시나리오 및 C1–C5가 PASS이므로 이 회귀 범위는 pass다.
앞선 F2/F3의 실제 재현 조건이 해결됐다. 감사 근거가 없는 임의 legacy 행의 목적을
완전히 복원할 수 있다는 판정이나 Core 1 전체·OAuth의 새 인수 판정은 아니다.

## Review Checklist

- [x] 기존 발견 사항·수정·회귀 결과와 범위를 연결했다.
- [x] metadata, gate·판정, 결과 계산과 evidence를 확인했다.
- [x] 임시 DB schema 조작과 일반 DB additive migration을 구분했다.
- [x] 데이터 정리·인증 및 legacy 복원 한계를 기록했다.
- [x] 상대 링크·이미지·민감정보와 git diff --check를 확인했다.
