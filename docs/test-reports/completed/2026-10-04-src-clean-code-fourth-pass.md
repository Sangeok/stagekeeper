---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['static', 'component', 'integration', 'contract', 'end-to-end']
test-tools: ['Node test runner', 'TypeScript', 'ESLint', 'Next production build', 'PostgreSQL 18.4', 'headless Microsoft Edge']
created-at: '2026-10-04'
completed-at: '2026-10-04'
last-executed-at: '2026-10-04'
tested-revision: '4660d42eded2845e44f071aa21dee6504f969e5a + harness/src-clean-code-fourth-pass working tree'
owners: ['user:Sangeok']
related:
  - 'docs/proposals/completed/2026-10-04-src-clean-code-fourth-pass.md'
  - 'docs/conventions/product-copy.md'
primary-area: 'frontend/clean-code'
observed-environments:
  - 'local isolated fixtures | React DOM | Edge headless/Windows | owner double'
  - 'local isolated database | Next production HTTP | Node/Windows/PostgreSQL | owner/foreign/anonymous'
test-summary: 'pass: F4-01~10 회귀·인수 검증 — 단일 대상 보호, 저장 경합·복구, 좁은 조회와 실제 React 상호작용 확인'
follow-up: []
---

# src 클린코드 4차 구현 인수

## Summary and Decision

제안된 열 작업을 구현하고 공통 코드 게이트, 실제 DB 경쟁, fresh build HTTP 및 실제 React 브라우저 상호작용을 확인했다. PR을 `dev` 대상으로 제출할 수 있다. 이 기록은 로컬 구현 인수이며 PR 병합이나 Codex 제품 지원 인증을 의미하지 않는다.

## Scope and Criteria

기준은 연결된 완료 제안서의 F4 계약과 accepted architecture다. 인증, 기존 CAS, copy-lock, 폼의 editing 보존을 그대로 확인했다. schema·core·plugin·의존성 변경은 없다.

| 기준 ID | 요구 | 필수 판정 |
| --- | --- | --- |
| R1 | F4-01 | invalid ID/key의 mutation 0; 정상 한 대상; 기존 범위·폐기 권한 보존 |
| R2 | F4-02/03 | pending 편집 잠금; immutable expected+1; stale/unknown 명시적 복구 |
| R3 | F4-04/06 | core client 명령 사용; handoff 의미와 표시/Copy 일치 |
| R4 | F4-05/07 | owner guard 후 page loader; read-only 좁은 connection projection |
| R5 | F4-08/09/10 | 실제 React event·focus·FormData·Resume payload와 fixture 정리 |

## Test Target

기준 commit 대비 이 PR의 코드·테스트·canonical copy 변경을 포함한 dirty tree에서 실행했다. 시작 전에 존재한 다른 proposal 삭제·이동 및 local-watch 보고서 수정은 검사 대상과 커밋에서 제외했다.

설치된 Next 16.3.3, React 19.2.8, Prisma 7.10.0을 사용했다. fresh production build의 Action registry와 실제 JWT 세션/Origin/Host 경계를 통과했다. 브라우저 fixture의 router·action·clipboard double은 실제 Next navigation이나 DB commit의 증거로 사용하지 않았다. 서로 다른 DB 검증과 HTTP 검증이 그 경계를 확인한다. 두 실제 브라우저 탭의 동시 편집은 별도 실행하지 않았고, 두 SQL 연결의 read barrier 및 같은 baseline의 동시 HTTP 요청으로 서버 경합을 확인했다.

## Preconditions and Test Data

기존에 추출된 PostgreSQL 바이너리로 별도 Temp cluster와 `stagekeeper_test_*` DB를 생성했다. 기존 운영 URL과 구별되는지 validator로 확인하고 migration deploy를 실행했다. 무작위 owner/foreign fixture, 세 종류 토큰의 대조 행, 백로그·보드·원장·pipeline version을 사용했다. 실패도 포함하여 runner의 finally에서 생성 사용자를 cascade 정리하고 pool·Next child·proxy를 닫았다.

## Test Matrix

| ID | 기준 | Gate | 시나리오/방법 | 관찰 결과·증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | 실제 8 Action의 invalid 원본 값 + 서비스 boundary double | 인증 먼저, delegate/revalidate 0; E1 | PASS |
| T2 | R1 | required | built token Action POST; 각 종류 대조 행 전량 비교 | undefined/null/공백/객체/배열 거부, 정상 대상만 rename/revoke; 익명/외부 세션 보존; E2 | PASS |
| T3 | R1 | required | 미선택/연결 해제/Free의 정상 token action | revoke 유지, project rename 읽기 전용 거부, user rename 독립; E2 | PASS |
| T4 | R1 | required | Flight multipart Backlog POST | invalid·외부·익명 write 0, 정상 한 대상 soft removal, open key 보호; E3 | PASS |
| T5 | R2 | required | 두 SQL 연결·read barrier; baseline 0/1 및 default 물질화 양방향 승패 | expected+1 한 행, loser stale, 기존 graph/createdBy 보존; E4 | PASS |
| T6 | R2 | required | built savePipeline + loopback transport loss proxy | invalid/access/plan create 0; 순차·동시 stale; commit 전 유실 write 0, 후 유실 한 행; E3 | PASS |
| T7 | R2/R5 | required | 실제 React pipeline/scout 이벤트 | 연속 Save·편집·Discard 잠금, zero-gate 확인, 독립 scouting, 새 root에 늦은 응답 없음, canonical 복구; E5 | PASS |
| T8 | R3/R5 | required | 두 client × hs/hu × continue/handoff/null note Copy | 표시=clipboard, 커밋 전제 유지, Codex watch 없음, clipboard 실패·text 변경·unmount; E5 | PASS |
| T9 | R4 | required | 실제 loader 단위·History 기존 양 mode 시험·HTTP GET | auth-first, query→props, Board/History Items/Events 본문 및 GitHub report 목적지; E1/E3 | PASS |
| T10 | R4 | required | user/project만 구현한 tx double + 실제 DB snapshot | read-only RepeatableRead, exact target/summary, Free/Pro/Max·부재·무결성, 행 변경 없음; E4/E6 | PASS |
| T11 | R5 | required | 실제 React connection/form/resume | menu focus/Escape/outside/reset, pending·stale/unknown, typing focus·editing 보존·실제 FormData, primary/secondary 양쪽 timestamp payload; E5 | PASS |
| T12 | R1/R2/R4 | required | fresh-build flagged registry | mutation 8개·save export 등록; 두 일반 loader 비등록, client barrel 안전; E1 | PASS |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령 | 결과·증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| C1 | R1~R5 | required | `npm run verify:fsd`, `npm run test:architecture`, `npm run check` | FSD·lint·typegen·typecheck·architecture·plugin 사본·availability 통과; E6 | PASS |
| C2 | R1~R5 | required | `npm run test:web` | 553개 통과; E6 | PASS |
| C3 | R1~R5 | required | `npm test` | core/plugin 286개 통과; E6 | PASS |
| C4 | T12 | required | `npm run build`, 두 manifest flag 활성 `npm run test:server` | production build 및 서버 46개 통과, skip 0; E1/E6 | PASS |
| C5 | T2~T6/T9/T10 | required | 격리 DB의 `npm run test:server:integration`와 두 HTTP rehearsal | 통합 95개 통과, token 및 fourth-pass HTTP 모든 assertion 통과; E2/E3/E4 | PASS |
| C6 | T7/T8/T11 | required | `rehearse-src-clean-code.ts --ui-only` + 허용된 isolated-profile Edge headless | UI 시나리오 25개 통과; E5 | PASS |

환경변수 flag는 실행 후 이전 값으로 복원했다. 재실행 시 built client registry까지 확인하려면 `SRC_CHECK_INBOX_MANIFEST=true`도 설정한다. integration과 rehearsal에는 parent `DATABASE_URL`과 다른 `TEST_DATABASE_URL`이 필요하다. `scripts/rehearse-src-clean-code-fourth-pass.ts`는 설치된 Flight encoder로 FormData를 직렬화한다.

## Evidence Registry

| ID | 종류 | 보존 증거/재현 목적지 |
| --- | --- | --- |
| E1 | action/manifest | `tests/server/mutation-identifiers.test.ts`, `pipeline-save.test.ts`, `project-page-loaders.test.ts`; 각 helper의 JSON/workers 검증 |
| E2 | HTTP + DB read-back | `scripts/rehearse-account-usage-and-tokens.ts`의 invalid·권한 matrix 및 전체 대상 행 비교 |
| E3 | HTTP + DB read-back | `scripts/rehearse-src-clean-code-fourth-pass.ts`의 multipart·version·transport·GET body assertion |
| E4 | SQL 경쟁·snapshot | `tests/server/integration/mutation-identifiers.test.ts`, `pipeline-save.test.ts`, `project-connection.test.ts` |
| E5 | DOM/event/clipboard | [정제한 25개 결과](../assets/2026-10-04-src-clean-code-fourth-pass/browser-results.json); 실제 renderer는 `tests/server/fixtures/src-clean-code-browser.tsx` |
| E6 | 회귀 게이트 | 저장소 test/check/build 명령 및 `src/server/project-availability-service.test.ts` |

원본 로그·쿠키·토큰·DB URL은 commit하지 않는다. 결과 JSON에는 시나리오·기대·관찰·Pass만 있다. 첫 실행의 test expectation/fixture 조건 오류는 고친 뒤 재실행했다. 기존 account-usage 시험은 최신 `dev`의 사전 렌더 검증과 달리 예외/과금을 기대해 실패했으므로, 실제 실패 반환과 과금 0을 검사하도록 수정했다. 해당 production 코드는 바꾸지 않았다.

## Findings and Follow-up

열 요구에 대해 남은 구현 blocker는 없다. 추가 diff 검토에서 명령 문자열 사본과 narrow loader 검증 누락을 발견해 core 파생 및 unit/DB snapshot 시험으로 보완했다. 추가 isolated agent 생성이 thread limit으로 실패하여 전체 orchestrator 재검토는 중단했다. 응집도·결합도 두 독립 읽기 검토와 main-agent 수동 검토는 새 다섯 렌즈/중립 게이트 전체 검토와 동등한 인증이 아니다.

## Test Data and Cleanup

| 리소스 | 정리·최종 상태 | 남은 영향 |
| --- | --- | --- |
| 전용 test DB fixture | 생성 owner·foreign와 자식 행 cascade 삭제, connections 종료 | 운영 데이터 영향 없음 |
| Next child·proxy·UI server | 종료 및 listen port 해제 | 없음 |
| React root·listener·clipboard·pending double | case별 unmount, deferred settle, pagehide/Finish cleanup, 원래 clipboard 복원 | 없음 |
| 임시 PostgreSQL cluster | task 전용 instance 종료 | Temp의 cluster/log와 Edge profile은 로컬 재현 산출물로 남음 |
| process env | 원래 DATABASE_URL·manifest flags 복원 | 없음 |

## Conclusion

필수 인수 게이트가 통과하여 구현을 commit하고 `dev` 대상 PR로 제출한다. rollback은 이 PR commit의 revert다. 이미 발생한 데이터 변경을 revert가 되돌리지는 않으며 이번 검증의 쓰기는 전용 fixture에 한정했다.
