---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-07"
approved-by: "user (conversation)"
approved-at: "2026-09-16"
approval-scope: "E1–E6 코드·스키마·테스트·private 템플릿·문서 구현. 실제 DB 검증은 사용자 요청으로 후속 진행. 운영 migration·seed·배포 제외."
completed-at: "2026-09-23"
verification-summary: "E1~E5 구현이 PR #45(60070e0)로 dev·main에 들어갔다. 통과: check · build · test 151 · test:web 290 · test:architecture 21 · test:server 2 · private test:templates 24(2026-09-16 기록). **미실행인 채로 완료 처리했다(2026-09-23 사용자 지시)**: test:server:integration(격리 DB의 TEST_DATABASE_URL 없음 — suite는 작성됐고 타입·린트만 통과), D3 복구 리허설(빈 격리 PostgreSQL 두 개 필요), A1~A5 실제 route·브라우저·배포 인수. 이 셋은 Completion or Closure Notes의 remaining follow-up으로 넘긴다."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
---

# src/server 클린코드 개선 제안

## Summary

2026-09-07의 frontend-clean-code-orchestrator 리뷰에서 채택한 **10개 발견(Must 6, Should 3, Consider 1)**을 유지한다. 이 문서는 reconciling-proposals-with-codebase로 현재 코드와 아홉 차례 대조했고, **아홉 차례 모두 수정 전부터 개선점이 있었다.**

- 2026-09-10(기준 aee92b2): 오래된 기준·행 번호, 미정인 완료 식별/이전 원장 처리, 실제 공개 필드 목록, DB 검증 실행 경로를 보완했다. 소유자 MCP 승인, handoff 배너, 완료 후 재개·인수 처리를 영향 범위에 넣었다.
- 2026-09-15(기준 c5c15f6): 그 사이 merge가 아닌 커밋 32개(파이프라인 커서와 pipeline_next, 상태가 바뀌면 run 닫기, 닫힌 run의 마지막 말, 개인 프로젝트 사용 목록, 런북 표류 보고)가 공개 저장소의 대조 경계와 private 원본을 바꿨다(수와 산출식은 Current State). 옮겨지거나 사라진 소유자(sessionGate→gate, projectSync→syncProject, membership→ownerUserId, locked→available, Free 런북 삭제), 세 곳 늘어난 원장 소비부(nextFor, lastClosedRun, changeUserPlan), 새로 생긴 보존 계약, 기존 migration보다 앞에 정렬되던 migration 이름, 낡은 실행 명령·재현 근거를 고쳤다. F09는 이미 충족, F04의 project_get 부분은 이미 충족, F06의 반려 시나리오는 이미 막힘으로 판정을 바꿨다.
- 2026-09-15 재대조(같은 기준 c5c15f6, 관점을 나눈 독립 재검증): 틀린 근거 넷(F01의 D3 리허설 두 호출은 선택되지 않은 프로젝트와 선택된 프로젝트로 나뉜다, F05의 현재 입력에는 note도 있다, F10의 plan_submit은 transitionIn을 거쳐 전진하고 재제출은 전진하지 않는다, F02의 현재 잘림 판정은 보고서를 보지 않는다), 빠진 규칙·경로 둘(discard는 호출자가 준 CAS 토큰을 유지한다, pipeline_next는 보드 쓰기 밖에서 advancePipeline으로 커서를 지연 전진하고 run을 닫을 수 있다), E2 목록의 verifyOk·recentSteps 누락과 고칠 것이 없는 turn.test.ts, 수정 대상이면서 보존 목록에도 있던 verification.md, 적히지 않은 parseHarnessConfig 직접 호출자, T04와 대조 근거의 부정확한 조회 목록을 고쳤다.
- 2026-09-15 두 번째 재대조(같은 기준, 기존 시험 fixture·진입점과 updatedAt 소비부·목표 계약의 일관성·문서 규칙 관점): 제안서 템플릿 형식(Proposal Size, Safety Analysis의 확인한 항목, 기준선으로 기존·신규 실패 구분, Verification Results 명령 표, 잔여 리스크·롤백 구분, Completion 기록 칸, 문서 점검 항목과 DoD를 나눈 Review Checklist), 새 루트 tests/의 아키텍처 트리 반영과 위치 근거, syncProject의 입력 수 검사와 init 사전 검사의 처리, 템플릿 변경으로 닫힌 run의 마지막 말 제외, @updatedAt 자동 갱신과 단조 updatedAt의 관계·인박스 statusSince, 세션 gate의 CAS 토큰 출처, 경쟁 사례를 담지 못하는 board-rules.test.mjs·owner-tools.test.mjs의 역할, E3에 빠진 propose-item 호출부를 고쳤다.
- 2026-09-15 세 번째 재대조(같은 기준, private 템플릿 그래프·설치된 라이브러리의 실제 동작·권한과 멱등성·불변식·문구 규칙 관점): 거절 감사 행 쓰기 실패의 처리와 CAS 우선 순서, 재전송이 호출 한도를 쓰는 점, refused 10회 경고 로그 유지, key 없이 여는 run과 마지막 말, 스텁의 handoff 호출과 dev 스텁 110줄 상한, 런북에서 receipt가 필요한 절, A3의 플랜·scout 조건, product-copy §10에 없던 정상 빈 목록 문장, capReason으로 시작하는 project_sync 문장과 init 문장의 차이, github.ts 로그 안전성의 검증 목적지, Windows Node 22에서 .cmd를 쓰지 않는 prisma 실행과 dotenv 17의 안내 줄을 고쳤다.
- 2026-09-15 네 번째 재대조(같은 기준, 구현자 관점의 모호함·스키마와 데이터 수명·다른 문서와 용어 관점): 재현되지 않던 커밋·변경 파일 수, 새 migration 뒤 순서가 바뀌는 D3 복구 migration과 원장 필터를 모르는 D2 artifact 복구, 새 migration 전후로 달라지는 D3 cleanup 보고의 보존 데이터 fingerprint, 닫힌 run에 온 outcome의 응답과 스코프 불일치 거절, project_sync 트랜잭션 충돌 응답, callerTokenId에 FK를 두지 않는 근거와 토큰 재발급, 거절 감사 행 누적, SDD 인용의 정확성, protocol.md·schema 주석의 원장 정의와 handoff 설명, receipt·수락·커서·판 번호 용어 구분, 선행 완료 제안서(진입 단계, CAS 규칙, 게이트 재전송, F10 잔존) 인용, 런북의 번호 금지 시험과 표류 안내 문단 보존을 고쳤다.
- 2026-09-16 다섯 번째 재대조(같은 기준 c5c15f6, 인용 전수 대조·계약 전파·검증 명령 실행 가능성 관점): manifest 보강 뒤 다시 세지 않은 경계 안 변경 경로 수(99개가 아니라 101개), product-copy 단일 출처 규칙의 위치(§1이 아니라 머리말), check의 tsc·eslint가 새 tests/server를 검사하는 점, invariants.md verify 벽과 protocol.md handoff 설명의 구체적 갱신 문장, F01 추출 뒤에도 지킬 오류 검사 순서, E2와 E3가 함께 고치는 증거 writer를 고쳤다.
- 2026-09-16 여섯 번째 재대조(같은 기준 c5c15f6, 직접 소비부·아키텍처 규칙·스키마 설명 관점): `board.ts`를 직접 읽는 프로젝트 보드 화면·백로그 화면·백로그 삭제 action이 manifest와 보존 경계에서 빠진 점, `tests/server` 배치와 fsd.md의 테스트 공존 규칙이 충돌하는 점, verification.md에 이미 끝난 `app/`→`src/app/` 이동을 미완료로 적은 점, 여러 열린 run을 허용하는 코드·범위 결정과 반대인 AgentRun 모델 주석을 고쳤다.
- 2026-09-16 일곱 번째 재대조(구현 산출물과 계약의 대조 관점 — 앞의 여섯과 달리 구현 **뒤**의 대조다): 계약(실DB 실행기 계약)이 요구한 `tests/server/integration/support.ts`(두 연결·barrier로 읽기·쓰기 순서 통제)와 `templates.test.ts`가 구현에 없던 점, `migration.test.ts`가 실제 `agent_run` 표가 아니라 손으로 만든 3열짜리 임시 표를 써서 인덱스 이름 충돌 같은 경계를 못 보던 점, 경쟁 시험이 `Promise.all`이라 승패가 고정되지 않아 양방향·패자 부수효과를 시험할 수 없던 점, manifest `prospective`에서 빠진 `board-history.test.ts`와 구현 전 수로 남아 있던 path-set(212 → 230), 명령 결과 표가 두 곳에 나뉘어 한쪽만 갱신된 채 서로 다른 말을 하던 점을 고쳤다. path-set 계산은 목록을 스크립트에 복사해 두어 문서(fixed 51)와 스크립트(fixed 48)가 어긋나 있었으므로, 이제 이 문서의 manifest를 직접 읽어 계산한다.

2026-09-16 사용자가 이 문서를 바탕으로 실제 코드 수정을 요청하여 구현을 진행했다. 아래에는 목표 계약과 구현 전 정합성 대조 기록을 보존한다. 명령별 실행 결과는 **Verification Results의 명령 표** 하나가 기준이고, 구현 범위와 미검증 범위는 마지막 **Implementation Results** 절이 기준이다. 실제 PostgreSQL 동시성·마이그레이션·D3 복구 검증은 사용자가 나중에 진행하도록 요청했으므로 완료로 표시하지 않는다.

| 우선순위 | ID | 목표 | 실행 묶음 / 검증 |
| --- | --- | --- | --- |
| Must | F05 | 완료 요청을 제공된 실행에 묶어 재전송의 추가 전진 방지 | E2 / T05 |
| Must | F10 | 증거 제출과 전이를 같은 보드 버전에 묶기 | E3 / T10 |
| Must | F03 | outcome 호출량을 실제 호출 토큰에 귀속 | E2 / T03 |
| Must | F07 | upsert 후 저장될 워크스페이스 합집합으로 상한 검사 | E4 / T07 |
| Must | F01 | MCP·설정 파서의 워크스페이스 의미 검증 공유 | E4 / T01 |
| Must | F06 | 모든 단계 본문 반환 경로의 requires 재검사. 반려 시나리오는 이미 막혔고 can-propose와 경쟁 창이 남음 | E2 / T06 |
| Should | F02 | 이력 본문과 잘림 판정의 BoardItem·보고서 범위 일치 | E5 / T02 |
| Should | F04 | backlog_get·backlog_list의 공개 JSON 필드를 보존하는 명시적 DTO. project_get은 이미 명시적 select | E5 / T04 |
| Should | F08 | 정상 빈 저장소 목록과 조회 실패 구분 | E5 / T08 |
| Consider | F09 | 템플릿 API 잠금 주석의 MCP 설명 정정 — **이미 충족, 구현 작업 없음** | — / T09(보존 회귀) |

Must는 현재 코드가 허용하는 잘못된 동작의 우선순위이지 운영 사고 확인을 뜻하지 않는다. 빈도·기여 관점 수로 심각도를 올리지 않는다.

## Goal

- 실행·호출자·보드 판정과 그에 따른 쓰기/응답을 일치시킨다.
- 공통 입력 규칙, 저장 상한, 응답 필드, 조회 대상을 명시한다.
- 구현자가 핵심 계약을 다시 추측하지 않도록 파일·작업·실패 경로·검증 목적지를 연결한다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 마이그레이션과 데이터 구조가 바뀐다(AgentRun·AgentRunStep의 추가 열과 index).
- API 계약이 바뀐다(agent_next의 receipt, project_sync 오류 문장, backlog 도구 JSON의 명시적 DTO, 저장소 목록 결과).
- 인증된 호출자의 원장·entitlement·트랜잭션 경계에 영향을 주고 변경 파일이 5개를 넘는다.
- DB 경유 private 템플릿과 생성물 전달이 함께 바뀌어 롤백이 단순 revert 이상이다.

정합성 검토 프로파일은 High-Risk다. 새 제품 기능이나 범용 계층을 도입하지 않는다.

## Current State

- 최초 리뷰 기준: a9b4bf273e8c423b71bbc0745210d404d6613209, 2026-09-07, 원본 서버 29개 파일.
- 1차 코드 대조 기준: aee92b2591326cdf12c4c0cc183f9a3867103ffb, 2026-09-10. 서버 32개 파일이었다.
- **현재 코드 대조 기준: c5c15f6563722876899d8fa836ce3292a6318a45, 2026-09-15.** aee92b2 이후 merge가 아닌 커밋은 32개다(`git rev-list --no-merges --count aee92b2..c5c15f6`). 그 사이 바뀐 공개 저장소 경로 158개(`git diff --name-only aee92b2 c5c15f6`) 가운데 아래 manifest의 roots·fixed·prospective에 드는 것은 103개다(지금 manifest 기준이며, manifest를 보강하면 이 수도 다시 센다). private 원본은 aee92b2 당시 커밋 8b6ff08에서 657a50d까지 7개 파일이 바뀌었다. 2026-09-15 첫 대조 때 적은 31개·97개는 산출식이 남지 않아 재현되지 않으므로 이 값과 산출식으로 바꿨다. src/server는 아래 51개 파일이다. private 템플릿 원본은 Sangeok/harness-templates@657a50d7bbcc83a147e03f4ab7262a0f389b7e86이고 그 작업 트리에 변경이 없다.
- 이번 정합성 검토는 새 5관점 클린코드 리뷰가 아니다. 이전 발견을 현재 구현·직접 소비부에 다시 연결한 전체 대조다. 2026-09-15~16의 일곱 재대조는 같은 대조를 관점별로 나눠 독립 검증했다. 첫째는 영역별(원장·커서, 보드·DTO·이력, 입력·sync·GitHub·문구, 실행기·migration·템플릿), 둘째는 기존 시험 fixture·진입점과 updatedAt 소비부·목표 계약의 일관성·문서 규칙, 셋째는 private 템플릿 그래프·설치된 라이브러리의 실제 동작·권한과 멱등성·불변식, 넷째는 구현자 관점의 모호함·스키마와 데이터 수명·다른 문서와 용어, 다섯째는 인용 전수 대조·계약 전파·검증 명령 실행 가능성, 여섯째는 직접 소비부·아키텍처 규칙·스키마 설명, 일곱째는 구현 산출물과 계약의 대조(작성된 시험이 계약대로인지, 파생 수치가 구현 뒤 다시 계산됐는지)다. 일곱 재대조 모두 새 F 발견을 추가하지 않았다.
- Next.js 16.3.3, React 19.2.8, TypeScript 5.9.3, Prisma 7.10.0, 로컬 Node 22.13.1. tsconfig는 strict/allowJs, bundler resolution이며 @/ → src/, @harness/core/ → packages/core/다.
- 아키텍처의 source of truth는 docs/architecture다. src/app은 진입점, src/server는 백엔드, packages/core는 순수 정책을 소유한다. src/server → src/fsd와 Client Component → src/server 의존을 만들지 않는다.
- 증거는 현재 소스·schema·migration·직접 호출부·설치된 Next fetch 가이드·로컬 private 템플릿이다. 운영 DB 격리 수준, 배포된 Template 행, 외부 사용자 파일, 실제 재전송 빈도는 확인하지 않았다.
- 이 문서는 저장소에 커밋되지 않은(untracked) 파일이라 다른 복사본에는 없다. 완료된 제안서(configurable-pipeline, session-approval-channel, agent-next-open-routing, individual-project-availability SDD와 D3 phase 계획서, runbook-drift)는 수정하지 않는다. 이 문서의 계약 근거는 현재 코드이며, 그 제안서들은 지금 규칙이 정해진 출처로만 인용한다.

~~~text
src/server/
  agents/next.ts, next.test.ts, runs.ts, steps.ts, steps.test.ts, vars.ts, vars.test.ts
  auth/config.base.ts, config.base.test.mjs, config.ts, guard.ts, index.ts,
       next-auth.d.ts, public-routes.test.mjs
  mcp/auth.ts, auth.test.mjs, deps.ts, tools.ts, tools.test.mjs,
      owner-deps.ts, owner-tools.ts, owner-tools.test.mjs,
      project-query.ts, project-query.test.ts, project-sync-query.ts, project-sync-query.test.ts
  pipeline/board.ts, board-rules.ts, board-rules.test.mjs, run.ts, run-rules.ts, run-rules.test.mjs
  db.ts, entitlement.ts, github.ts, project.ts, public-url.ts, result.ts,
  project-access-query.ts, project-access-query.test.ts, project-availability.ts,
  project-availability-service.ts, project-availability-service.test.ts,
  project-registration-query.ts, project-registration-query.test.ts,
  runbook.ts, runbook-query.ts, runbook-query.test.ts,
  templates.ts, templates-query.ts, templates-query.test.ts
~~~

현재 보존할 계약:

- /api/mcp는 hs_ ProjectToken의 13개 에이전트 도구(pipeline_next 포함), /api/mcp/owner는 ho_ OwnerToken의 gate_approve만 제공한다. 토큰을 서로 교환할 수 없다. /api/templates와 /api/runbook도 hs_ 토큰으로 인증한다.
- 선택되지 않은 프로젝트(Project.available false): project_get은 available:false와 reason을 싣고 답하며 소유권 무결성 오류만 도구 오류다. 나머지 12개 에이전트 도구는 guardUnavailable로 도구 오류를 준다. /api/templates와 /api/runbook은 403과 사유다.
- 소유자 경로는 소유자 확인(Project.ownerUserId) → 사용 가능(available) → sessionApprovals 플랜 → board.gate 판정 순이다. 세션의 implementing 승인은 validation과 정확한 planCommit을 요구한다. 웹 approveGate와 세션 게이트는 같은 board.gate를 지나고, 웹의 override 권한은 그대로다.
- handoff는 원장 기록 후 같은 단계 유지, 분기·전진·refused 증가 없음이다. outcome 없는 재개도 기존처럼 허용한다. 배너(turn-data.server.ts의 loadTurn)와 pipeline_next(run.ts의 nextFor)는 열린 run의 마지막 원장 행이 handoff이고 그 시각이 항목 updatedAt보다 뒤일 때만 소유자 차례로 본다(run-rules.ts의 handoffIsLive).
- 상태를 바꾸는 모든 전이(board.ts의 transitionIn)와 폐기는 같은 트랜잭션에서 그 key의 열린 AgentRun을 닫는다(closeRuns). 닫힌 run은 그 단계의 마지막 종료 outcome(ok·blocked·failed) 한 줄을 한 번만 받는다. handoff는 종료 outcome으로 치지 않고, 스스로 done에 닿은 run은 더 받지 않는다(next.ts의 lastClosedRun 분기, next.test.ts의 run lifecycle 사례).
- 파이프라인 커서(board.ts의 advanceRun)는 두 경로로 움직인다. 첫째, 보드 쓰기와 같은 트랜잭션이다. propose(:149)·gate(:248)·recordValidation(:291)·submitReport(:336)는 advanceRun을 직접 부른다. pipeline이 아닌 transitionIn은 되돌리기·보류·재개·reopen이면 resetRun, 그 밖에는 advanceRun을 부른다(:193-196). plan_submit은 planning에서 부르는 transitionIn(planning→in_review)으로 전진하고, in_review 재제출은 기록만 하며 전진하지 않는다. 둘째, 보드 쓰기를 지나지 않는 완료(doc-auditor·feature-scout run 닫힘)를 반영하려고 pipeline_next가 응답 전에 항목마다 advancePipeline(board.ts:371)으로 자기 트랜잭션에서 지연 전진한다(mcp/deps.ts:38·:48). 두 경로 모두 그래프가 게이트 없이 넘기는 경계는 pipeline 행위자의 transitionIn이며, 방금 읽은 updatedAt으로 CAS하고 상태를 바꾸므로 그 key의 열린 AgentRun도 닫는다.
- 디스패치 상한은 소유자의 30일 AgentRun 개설 수로 센다(runs.ts와 run.ts의 recentRuns). 열린 run의 재개는 세지 않는다.
- plan을 내리면 사용 중인 프로젝트 가운데 남길 것을 고르는 근거 하나가 최근 에이전트 활동이다. project-availability-service.ts의 changeUserPlan이 AgentRun.openedAt과 그 run의 모든 AgentRunStep.at 중 최댓값으로 센다.
- 런북은 한 판이다. deliver.mjs는 DB에 옛 CLAUDE.runbook.free.md 행이 남아 있어도 내려보내지 않는다. init은 파일을 쓴 뒤 /api/runbook에 런북 판을 보고한다.
- validation_record는 마지막 plan 이벤트 뒤 plan-verifier의 verify/ok가 필요하다. implementing의 report_submit은 verify의 outcome을 제한하지 않는다.
- done 자체는 인수가 아니다. done에서 main-loop의 보고만 acceptedAt을 채우고, 사람이 done에서 재개하면 acceptedAt을 지우고 백로그를 복원한다. planning 재개는 validation도 지운다.
- 원장·미포함 Workspace·사용자가 수정한 생성 파일을 자동 삭제하지 않는다.

## Scope

**Core:** E1~E6와 F01~F10 전부. Must/Should/Consider는 위험 우선순위이며 승인된 묶음을 조용히 제외하는 표지가 아니다. F09는 2026-09-15 대조에서 이미 충족으로 판정해 구현 작업이 없다(아래 F09). F04의 project_get 부분도 이미 충족이며 구현 범위는 backlog_get·backlog_list 두 도구다.

**Approval-after:** 실제 코드·private 템플릿 수정은 2026-09-16 대화에서 승인되었다. 운영 마이그레이션/시드/배포는 별도 승인 대상이며 실행하지 않았다. 실제 DB 검증은 사용자의 후속 진행 요청에 따라 보류한다.

**Phase 2:** 없음. **범위 밖:** 파이프라인 재설계, 새 FSD layer, 워크스페이스 삭제/replace 동기화, 기존 원장 재작성, 결제·플랜 종류·OAuth scope 변경, 비공개 GitHub 조회, 템플릿 본문 공개 배포, 임의로 수정된 사용자 파일 덮어쓰기. 전역 단일 열린 run 강제와 완전한 동시 호출 rate-limit 직렬화는 F05/F03의 보장 범위가 아니다. 현재의 공유 커서 선택 규칙은 보존한다.

## Proposal

### F05 · Must — 완료는 서버가 제공한 실행 receipt에만 적용한다

근거: src/server/agents/next.ts의 NextInput/NextOutput, agentNext의 openRun → record → advance 흐름과 src/server/agents/runs.ts의 stepId CAS. 현재 입력은 agent/key/outcome/note뿐이고 어느 run·단계의 말인지 밝히는 값이 없다. implement/ok 처리 응답이 유실된 뒤 같은 입력을 다시 보내면 최신 단계 verify의 ok로 기록되어 report로 이동할 수 있다. 동시 CAS 실패만 검사하는 테스트로 순차 재전송을 막았다고 할 수 없다. 2026-09-15 확인: 입력은 next.ts:34, 기록은 :172, 전진은 :191·:197로 여전히 분리돼 있다. 열린 run이 없을 때 온 outcome은 가장 최근에 닫힌 run에 붙는데(:134-137), 호출이 어느 run의 말인지 밝히지 않아 서버가 정확히 가를 수 없다.

목표 계약:

1. receipt는 { runId: string, revision: number, stepId: string }이다. revision은 0 이상 PostgreSQL Int 범위의 정수다. done:false 응답은 기존 step/instruction에 receipt를 추가한다. done:true는 그대로다. outcome 없는 조회는 receipt 없이 허용하며 원장을 추가하지 않는다.
2. outcome 네 종류 모두 receipt가 필수다. 서버가 인증한 projectId, 입력 agent, 정규화한 key와 receipt의 run이 일치해야 한다. runId는 인증 수단이 아니다. 다른 프로젝트/agent/key의 run 존재 여부나 본문을 노출하지 않고 거부한다.
3. outcome은 최신 run에 다시 붙이지 않고 receipt의 run을 조회한다. 열린 run의 revision·stepId·closedAt을 조건으로 한 CAS, 수락 원장, cursor 갱신/닫기, 필요한 refused 증가를 하나의 트랜잭션에서 처리한다. 보드가 run을 먼저 닫으면 전진은 실패해야 한다. 기록만 먼저 커밋하는 기존 record → advance 분리는 제거한다.
4. 수락한 호출마다 revision을 정확히 한 번 증가시킨다. handoff, 실패 분기 없음, 다음 requires 미충족으로 같은 단계에 머물 때도 회전한다. stepId가 같아도 이전 receipt를 다시 소비하지 않는다. handoff/분기 없음은 기존처럼 refused를 증가시키지 않고, 다음 단계가 모두 닫힌 경우만 증가시킨다. refused가 REFUSAL_WARN_AT(10)에 이르면 내는 console.warn(next.ts:202-205)과 그 시험(next.test.ts:390)은 commitOutcome으로 옮긴 뒤에도 같은 조건으로 유지한다.
5. 같은 receipt의 동시 요청 중 최대 하나만 수락된다. 열린 run에 재전송하거나 CAS에 진 요청은 본문 없는 stale 오류와 outcome 없는 재조회 안내를 받는다. 성공 응답을 재생하는 idempotency cache를 새로 만들지는 않는다. 이미 닫힌 동일 스코프 run에 온 outcome은 수락 여부와 관계없이 지금처럼 done:true 안내(next.ts:138의 note)로 답하며, 새 run을 만들거나 현재 열린 다른 run을 완료하지 않는다. 아래 마지막 말 조건을 채운 한 번만 accepted:true이고, 같은 닫힌 run에 대한 두 번째 시도와 동시 요청의 패자는 accepted:false 감사 행과 함께 같은 done:true 안내를 받는다. **닫힌 run의 마지막 말은 보존한다.** 보드 전이가 먼저 run을 닫은 경우(예: board_transition, planning에서 transitionIn을 부르는 plan_submit, 증거 writer 뒤 advanceRun이나 pipeline_next 지연 전진의 pipeline 전이가 dev의 마지막 ok 전에 closeRuns로 닫는다), receipt의 revision·stepId가 그 닫힌 run의 값과 같고, 그 stepId가 현재 템플릿에 아직 있으며, 그 단계에 수락된 종료 outcome(ok·blocked·failed)이 아직 없으면 그 outcome을 accepted:true로 한 번 받는다. 이때 closedAt IS NOT NULL과 revision·stepId를 조건으로 revision만 CAS로 올리고 stepId·closedAt·refused는 바꾸지 않으며, 응답은 지금의 done:true 안내다. handoff는 종료 outcome으로 치지 않는다. 템플릿 변경으로 닫힌 run(9, 지금의 next.ts:162-167)은 그 stepId가 템플릿에 없으므로 마지막 말을 받지 않는다. key 없이 여는 run은 closeRuns가 key로 찾기 때문에(board.ts:263-265) 보드 전이로 닫히지 않는다. 스스로 done에 닿거나 템플릿 변경으로만 닫히므로 이 분기에 해당하지 않는다. 그 밖의 닫힌 run 시도는 6의 거절 감사다.
6. 감사 목적의 거절 기록과 실행 증거를 구분한다. 유효 스코프의 run에 연결 가능한 stale/closed 시도는 accepted:false로 반드시 남긴다. commitOutcome은 run CAS를 트랜잭션의 첫 쓰기로 한다. CAS가 0건이면 같은 트랜잭션에는 거절 감사 행 하나만 쓰고 커밋한 뒤, 열린 run이면 stale을, 닫힌 run이면 5의 done:true 안내를 돌려주므로 되돌릴 앞선 쓰기가 생기지 않는다. 감사 행 쓰기까지 실패하면(DB 오류 등) 트랜잭션 전체가 실패해 원장·커서·refused가 바뀌지 않는다. 이때 호출자는 본문 없는 도구 오류와 outcome 없는 재조회 안내를 받고, 서버는 감사 누락을 안전한 정보(run id·단계)로 로그에 남긴다. 거절 기록의 stepId/revision은 제출한 receipt의 주장이지 성공 증거가 아니다. 다른 스코프·잘못된 입력·잠금·한도 초과 등 실행 전 거절은 기존처럼 성공 원장을 만들지 않는다. 다른 스코프이거나 존재하지 않는 runId의 receipt는 run이 있는지 드러내지 않도록 한 문장(이 receipt는 이 호출의 run이 아니니 outcome 없이 다시 읽으라는 뜻)으로 똑같이 거부하고 원장을 남기지 않는다.
7. 새로운 AgentRunStep은 accepted:true(현재 실행에서 수락) 또는 false(거절 감사), receiptRevision, callerTokenId를 명시한다. 예전 행의 accepted:null은 legacy다. 새 writer가 null로 쓰는 경로는 금지한다. 수락된 verify 시도와 이동 성공은 별개다. 다음 경로가 닫혀 있어도 실제 현재 verify의 수락된 outcome은 증거로 남는다.
8. 실행 증거 조회는 accepted:true 또는 null만 허용한다. Prisma의 not:false만 사용해 NULL 행을 누락시키지 말고 OR를 명시한다. 적용 지점은 runs.ts/verifyOk, board.ts/recordValidation, board.ts/submitReport, turn-data.server.ts/loadTurn의 마지막 steps 조회, run.ts/nextFor의 마지막 steps 조회, 5의 닫힌 run 종료 outcome 판정(지금의 runs.ts/lastClosedRun) **여섯 곳 모두**다. 호출량 집계 runs.ts/recentSteps는 증거 조회가 아니므로 F03의 규칙대로 거절 행도 센다. plan 변경의 최근 에이전트 활동(project-availability-service.ts/changeUserPlan의 max(AgentRun.openedAt, AgentRunStep.at))도 증거 조회가 아니다. 완료된 개인 프로젝트 사용 목록 SDD(docs/proposals/completed/2026-09-15-individual-project-availability.md:82)는 그 값을 "서버가 관측한 최근 agent_next 활동"으로 정의하고 수락·거절은 가르지 않는다(accepted 열이 없던 때다). 거절 행도 서버가 관측한 호출이므로 그 정의와 어긋나지 않게 활동으로 센다. validation은 기존의 plan 이후 시각 조건, report는 outcome 불문 조건을 유지한다. 배너와 pipeline_next는 필터링 후 마지막 행을 고르고 handoffIsLive를 그대로 적용해, stale handoff가 소유자 차례를 만들거나 정상 handoff를 가리지 않게 한다.
9. 템플릿에 현재 stepId가 없어지면 기존처럼 run을 닫고 outcome 없는 복구를 안내한다. 이전 receipt가 새 run이나 새 단계 본문을 가리키지 못하게 한다. 템플릿 그래프/이름을 이번 전환과 동시에 개편하지 않는다.

스키마는 AgentRun.revision Int @default(0), AgentRunStep.callerTokenId String?, receiptRevision Int?, accepted Boolean? 및 @@index([callerTokenId, at])를 추가한다. 기존 열·원장·개설자 tokenId는 보존한다. 신규 migration은 이 두 표의 추가 열·index만 다루고 다른 표를 변경하지 않는다. AgentRun 모델 머리 주석(schema.prisma:198)은 부분 unique가 없어 같은 (project, agent, key)에 열린 run이 여러 개일 수 있고 최신 openedAt 행을 공유 커서로 고른다는 실제 규칙으로 고친다. tokenId 주석은 “run 개설자, 실제 호출자 아님”으로 정정한다. 단계 거절 감사 행을 위한 복합 unique 제약은 추가하지 않는다. 원자성의 근거는 run CAS와 트랜잭션이다. callerTokenId에는 지금의 AgentRun.tokenId처럼 FK를 두지 않는다. 토큰은 지우지 않고 revokedAt만 채우므로(manage-token.server.ts:26) id가 남고, 행이 지워지는 경로는 Project·User cascade뿐이라 run·step도 함께 지워진다. 토큰을 폐기하고 새로 발급하면 새 id라 호출 한도 창이 새로 시작되며, 지금의 tokenId 집계와 같다. AgentRunStep 주석(schema.prisma:215의 "outcome을 실어 부른 호출 전부")도 수락·거절 감사·legacy 구분에 맞게 고친다. 이 accepted는 실행 호출의 수락이며 CONTEXT.md의 인수(Acceptance, :60)나 BoardItem.acceptedAt과 다른 개념이다.

호환성: 새 서버는 receipt 없는 outcome을 실행하지 않고 “outcome 없이 다시 읽고 반환된 receipt를 보내라; 오래된 스텁이면 /harness:init을 다시 실행하라”는 오류를 준다. 조회는 계속 허용된다. 열린 기존 run은 revision 0부터 재조회하여 이어 간다. 클라이언트는 응답 유실 시 **동일 receipt**를 재전송하고, stale이면 재조회만 한다. 새 receipt에 옛 outcome을 자동으로 붙이지 않는다. 이것이 원래 F05의 재전송 방지 목적을 충족하는 전환 규칙이다. 게이트 호출은 receipt 없이 상태 기계와 CAS만으로 재전송을 막는다. 두 번째 승인은 상태가 이미 바뀌어 거부되기 때문이다(docs/proposals/completed/2026-09-09-session-approval-channel.md:1512). agent_next는 같은 단계에 머무는 outcome(handoff·분기 없음·requires 미충족)이 상태를 바꾸지 않아 그 방식으로 막을 수 없으므로 receipt를 쓴다. 같은 제안서가 미룬 결정 원장(:142)을 만드는 것은 아니다.

템플릿의 최초 호출은 그대로 두고 다섯 스텁의 outcome 호출(완료와 handoff)·실패 후 복구 문장을 갱신한다. dev 단계 본문, 런북(CLAUDE.runbook.md 한 판)의 "Before the cycle" 절에 있는 에이전트 handoff 설명, docs/agents/README의 handoff 예시에도 최신 receipt를 포함한다. 런북 "The cycle" 절에서 메인 루프가 dev를 outcome 없이 재개하는 안내는 receipt가 필요 없어 그대로 둔다. dev 스텁은 지금 107줄이고 templates.test.mjs의 스텁 상한은 110줄이다(:41·:284). 새 문장은 기존 문장을 바꿔 쓰는 방식으로 상한 안에 넣으며, 상한을 올리는 변경은 이 제안에 없다. 넣을 수 없으면 구현 전에 재검토한다. 런북 수정은 templates.test.mjs:177의 "no step or gate numbers" 규칙을 지키고, runbook-drift 제안서가 "Before the cycle"에 넣은 표류 안내 문단(docs/proposals/completed/2026-09-11-runbook-drift.md:204-206)을 보존한다. /harness:init에서 skip(modified)가 나오면 사용자가 수정한 파일을 자동 덮어쓰지 말고 receipt 지침 반영을 안내한다. 상세 산출물은 A2, 시험은 T05/T06이다.

### F10 · Must — 판정한 보드 버전과 증거 쓰기를 원자적으로 묶는다

근거: pipeline/board.ts의 recordValidation(:289)·submitPlan(:302)은 상태를 읽은 후 id만으로 update한다. submitReport도 상태 판정 뒤 report/event를 추가하고, done의 main-loop이면 acceptedAt까지 id만으로 쓴다(:335). recordValidation(:291)과 submitReport(:336)는 같은 트랜잭션에서 advanceRun을 직접 부르고, submitPlan은 planning일 때 부르는 transitionIn(:309, planning→in_review)을 거쳐 전진한다. in_review 재제출은 기록만 하고 전진하지 않는다. advanceRun 안의 pipeline 행위자 전이는 다시 읽은 updatedAt으로 CAS한다(:352). transition/discard/gate와 교차하면 승인 뒤 planCommit 변경, bounce 뒤 validation 복원, reopen 뒤 acceptedAt 복원이 가능하다. 현재 트랜잭션이 있다는 사실만으로 이 경쟁이 해소되지 않는다. 운영 격리 수준을 단정하지 않는다. 전이의 CAS 규칙(agent·pipeline은 방금 읽은 row.updatedAt, human은 expectedUpdatedAt)은 docs/proposals/completed/2026-09-10-configurable-pipeline.md(:534·:567)가 정했고 증거 writer에는 적용되지 않았다. 세션 게이트 제안서도 F10을 남은 결함으로 적었다(2026-09-09-session-approval-channel.md:1638).

목표는 기존 updatedAt 기반 CAS를 증거 제출에도 일관되게 적용하는 것이다.

- transitionIn(human·agent·pipeline 행위자. pipeline 행위자의 진입점은 증거 writer 뒤의 advanceRun과 pipeline_next의 advancePipeline 둘이다), discard, gate의 비경계 갱신(:245), submitPlan, recordValidation, submitReport의 모든 보드 쓰기는 id + updatedAt CAS 토큰 + 읽은 status + discardedAt:null을 조건으로 선점한다. agent·pipeline 전이와 증거 writer는 트랜잭션에서 읽은 updatedAt을 쓴다. 사람 경로(웹 human 전이, discard, 웹·세션 gate)는 지금처럼 호출자가 준 expectedUpdatedAt을 CAS 토큰으로 유지한다(board.ts:172·:216·:245). 웹의 토큰은 화면이 받은 updatedAt ISO 문자열이다(inbox-card.tsx·reopen-actions.tsx가 그대로 돌려보낸다). board.ts 안에서 방금 읽은 값으로 바꾸면 화면이 본 버전과의 낙관적 잠금이 사라지므로 금지한다. 세션 gate에는 화면이 없어 owner-deps.ts:15가 latestRowFor로 방금 읽은 값을 넘기며, 이 연결도 그대로 둔다.
- 같은 밀리초의 쓰기도 버전을 바꾸도록 updatedAt을 max(현재 시각, 이전 updatedAt + 1ms)로 명시한다. board.ts 내부 비공개 공통 함수로만 계산한다. 별도 DB revision 열이나 웹 입력 형식 변경은 필요 없다. 위 writer 전부와 acceptedAt 후속 쓰기에 이 규칙을 적용하며, gate의 `updatedAt: new Date()`도 이 함수로 바꾼다. 단조 updatedAt은 벽시계를 몇 ms 앞설 수 있어 handoffIsLive(원장 시각 > updatedAt)의 판정이 바뀔 수 있다. 틀리는 쪽은 살아 있는 handoff를 잠시 숨기는 방향이며(run-rules.ts:37-42), T10에서 같은 ms 연속 쓰기 뒤 handoff 사례로 확인한다. 지금 BoardItem.updatedAt은 schema의 @updatedAt이라(schema.prisma:144) Prisma update·updateMany가 값을 주지 않으면 현재 시각을 넣는다. 명시한 값이 우선하므로 모든 BoardItem 쓰기에 계산한 값을 직접 넣고, 빠뜨린 쓰기는 T10의 같은 ms 사례로 드러낸다. 열은 TIMESTAMP(3)이고 웹 토큰은 ms 정밀도의 ISO 문자열로 왕복하므로 +1ms 규칙은 그 정밀도 안에 있다. 비교가 아닌 소비부도 있다. 인박스 카드의 statusSince는 상태 전이 이벤트가 창에 없을 때 updatedAt으로 대체되어(review-gate/model/inbox-item.ts:94) 몇 ms 앞선 시각을 보일 수 있으며 이는 받아들인다. updatedAt으로 정렬하는 조회는 없다.
- report는 보고 생성 전 보드 버전을 선점하여 행 잠금을 유지한다. report/event/acceptedAt은 같은 트랜잭션에서 함께 커밋한다. 증거 writer의 전진(recordValidation·submitReport의 advanceRun, submitPlan이 부르는 transitionIn과 그 안의 advanceRun)과 그 안의 pipeline 전이도 같은 트랜잭션이며 선점 뒤에 실행한다. acceptedAt은 생성한 report.at을 쓴다. 선점 실패는 기존 stale 결과, 선점 후 예외는 트랜잭션 rollback이다. 일부 쓰기 후 fail 값을 반환하여 커밋하는 경로를 만들지 않는다.
- validation의 마지막 plan 조회·verify 증거 판정도 그 보드 snapshot에 속한다. 경쟁에서 져서 stale을 반환한 요청은 validation/plan/report/event를 남기지 않는다. 자동 재시도로 사용자의 승인 대상 snapshot을 바꾸지 않는다.
- board.gate의 planCommit/validation 선검사(board-rules.ts의 decideGate)와 transitionIn의 expectedUpdatedAt 연결을 유지한다. 웹 approveGate(review-gate.server.ts)와 소유자 세션(owner-deps.ts)이 같은 gate를 부른다. 웹 override를 세션과 같은 제한으로 바꾸거나, agent에게 gate 도구를 추가하지 않는다.
- done ↔ reopen 경쟁도 검증한다. 인수가 먼저 성공하고 이후 사람이 재개하면 acceptedAt:null, 백로그 복원이 최종 결과다. 재개가 먼저 성공하면 옛 done snapshot의 인수 보고는 stale이어야 한다.

T10에서 real PostgreSQL READ COMMITTED 연결 두 개와 명시적 barrier로 양방향 순서를 재현한다. 시간 지연만으로 경쟁을 만들거나 판정 함수 대역만 검사하지 않는다.

### F03 · Must — 호출량의 개설자와 실제 호출자를 구분한다

근거: agents/runs.ts/openRun은 project/agent/key를 공유하지만 recentSteps는 run.tokenId로 센다(runs.ts:30, 2026-09-15 그대로). A가 연 run을 B가 호출하면 B의 outcome이 A에게 합산된다.

새 outcome·거절 감사 행에 인증 컨텍스트의 tokenId를 callerTokenId로 전달한다. 입력 JSON으로 호출자 값을 받지 않는다. recentSteps는 callerTokenId와 at으로 새 기록을 센다. accepted:false인 유효 스코프 시도도 호출량에서 제외하지 않는다. 응답 유실 뒤 같은 receipt를 재전송하는 복구 경로(F05 호환성)도 거절 감사 행 하나를 남기고 한도를 한 번 소비하며, 이는 의도한 동작이다. 클라이언트는 stale 뒤에 재조회만 하므로 재전송은 한 번에 그친다. 읽기 호출은 새 행을 만들지 않지만 기존처럼 한도 검사를 통과해야 한다. 60회/10분 수치와 공유 run 선택 규칙은 그대로다. 소유자 단위 디스패치 상한(recentRuns)은 run 개설 수라 이 변경과 무관하게 그대로다.

과거 호출자는 복원할 수 없으므로 callerTokenId를 부모 tokenId로 backfill하지 않는다. 전환 시 최근 legacy null 행만 기존 run.tokenId 집계로 보수적으로 포함하고, 새 기록은 정확한 callerTokenId로 센다. OR 분기는 상호 배타적으로 하여 이중 집계하지 않는다. 기존 10분 창이 지나면 legacy fallback의 영향은 자연히 사라진다. 이 짧은 창의 집계는 추정치임을 숨기지 않는다.

T03은 A/B의 수락·거절 호출, legacy 창 경계, tokenId를 무시하지 않는 어댑터, 거절 행도 changeUserPlan의 최근 에이전트 활동으로 잡히는지를 확인한다. 추가 schema/과거 값 보존은 tests/server/integration/migration.test.ts와 연결한다. rate-limit의 동시 burst까지 완전 직렬화했다는 주장은 하지 않는다.

### F07 · Must — upsert 결과의 합집합을 기준으로 상한을 검사한다

근거: 저장 경로는 이제 src/server/mcp/project-sync-query.ts의 syncProject다(deps.ts의 projectSync는 그대로 넘기기만 한다). syncProject는 readProjectAccess로 읽은 플랜에서 입력 workspaces.length만 검사하고(:13), 트랜잭션에서 lastSyncedAt과 선택적 language를 쓴 뒤 agent 키로 upsert한다(:16-21). Free 프로젝트에 A가 저장되어 있고 요청이 B 하나이면 두 행이 남는다. 그 거부 문구 "Drop workspaces"도 입력에서 빼면 저장 행이 줄어드는 것처럼 읽히지만 실제로는 upsert라 줄지 않는다.

syncProject의 하나의 interactive Serializable 트랜잭션 안에서 기존 agent 집합 조회 → 입력과의 합집합 크기 검사 → project 갱신(lastSyncedAt, 선택적 language) → upsert를 수행한다. 트랜잭션 충돌(P2034)은 syncProject가 잡아 { ok:false, reason }으로 돌려주고 일부 성공을 반환하지 않는다. 지금은 기본 격리 수준이라(project-sync-query.ts:16) 이 충돌이 생기지 않으므로, 그 reason 문장(다른 sync와 겹쳤으니 다시 부르라는 한 문장)을 product-copy §12에 새로 둔다. 자동 삭제·replace·숨은 무제한 재시도는 없다. 플랜 값은 지금처럼 readProjectAccess의 요청 시점 결과를 쓰며(선택되지 않은 프로젝트는 쓰기 전에 거부), 별도 관리자 plan:grant 작업까지 선형화하는 변경은 하지 않는다. 지금의 입력 수 검사(:13)는 이 합집합 검사로 대체한다. F01이 중복 agent를 거부한 뒤에는 입력 수가 합집합 수를 넘지 않으므로 입력 수만 상한을 넘는 요청도 합집합 검사에서 거부된다. 생성기의 사전 검사(plugin/bin/harness-init.mjs:86-90과 그 문장인 product-copy §15, plugin/skills/init/SKILL.md:35-37의 안내)는 파일을 쓰기 전에 harness.json의 입력 수만 보는 필요조건 검사라 그대로 둔다. 입력 수가 상한 안이어도 저장된 행과의 합집합 때문에 서버가 거부할 수 있고, 그때의 문장은 §12의 새 project_sync 문장이다.

- 같은 agent는 기존 행을 갱신하고 미포함 agent는 보존한다. F01이 중복 agent 입력을 거부하므로 synced는 성공한 입력 개수다. 저장 총수로 의미를 바꾸지 않는다.
- 합집합이 상한을 넘으면 language·lastSyncedAt을 포함한 모든 쓰기를 거부한다. 기존 초과 데이터도 삭제하지 않는다. 초과 상태에서 결과가 여전히 초과하는 요청은 거부하고 업그레이드/별도 정리 필요를 알린다.
- 오류는 입력에서 항목을 빼면 저장 행이 삭제되는 것처럼 안내하지 않는다. 현재 저장 총수와 upsert 후 총수·플랜 상한의 충돌을 설명한다. 문장은 상한 문구의 단일 출처인 capReason(plan, "workspaces")로 시작한다(product-copy §15, 지금의 project-sync-query.ts:14와 같다). init 사전 검사 문장(§15)은 입력 수만 보고 "drop workspaces"를 권하므로 두 문장의 뜻이 달라지며, §12에 그 차이를 적는다.
- language 생략은 기존 값 유지다. 빈 배열·예약 agent 등 의미 오류는 트랜잭션 진입 전에 거부한다. 지금은 빈 배열도 lastSyncedAt만 쓰고 성공하며 src/server/mcp/project-sync-query.test.ts의 첫 사례가 그 동작과 verify:[] fixture를 고정하므로, 그 fixture를 비어 있지 않은 유효 workspace로 바꾸고 빈 배열 거부를 새 사례로 둔다.

T07은 순차 A→B, 기존 A 갱신, 동시 신규 B/C, language·lastSyncedAt 원자성, 빈 배열 거부, 선택되지 않은 프로젝트의 쓰기 0, 이미 초과된 DB, Pro/Max의 실제 core 상한을 검사한다.

### F01 · Must — 워크스페이스 의미 검증을 공유한다

근거: mcp/tools.ts의 workspace Zod schema는 문자열/배열 모양만 검사한다. packages/core/config.mjs/parseHarnessConfig는 비어 있지 않은 verify, agent 형식·예약 이름·중복을 검사한다. MCP에 pm을 workspace로 넣으면 agents/next.ts가 roster를 먼저 보고 dev 템플릿을 선택한다.

packages/core/workspaces.mjs에 순수 validateWorkspaceSemantics를 추출한다. 대상은 정규화된 workspace 배열이다. 배열 최소 1개, 비어 있지 않은 id/path/agent·verify 명령·readOnly 항목, agent의 /^[a-z][a-z0-9-]*$/ 및 REPORT_AGENTS 예약·중복 금지를 한 벌로 소유한다. knowledge는 null 또는 비어 있지 않은 문자열이다. verify 배열 자체도 최소 1개여야 한다. 문자열 trim이나 verify 명령 실행을 새로 도입하지 않는다.

parseHarnessConfig는 원래 raw 입력 해석/정규화를 소유하고 공통 검증을 호출한다. raw knowledge 생략 → null, readOnly 생략 → [] 및 기존 오류 경로 접두를 유지한다. 첫 오류 하나를 던지는 지금 동작과 검사 순서도 유지한다. 지금은 workspaces 배열(config.mjs:22) 뒤 항목마다 agent 형식·예약·중복(:26-29) → verify 배열(:31) → readOnly 배열(:32) → id·path(:34) → verify·knowledge·readOnly 원소(:35-37) 순이다. 기존 기대값은 오류가 하나인 fixture라 순서를 드러내지 않으므로 T01에 오류가 둘인 fixture를 둔다. raw config의 knowledge:null을 새로 허용하는 변경은 아니다. MCP는 기존에 요구한 normalized knowledge:null/readOnly:[]를 계속 허용한다. tools.ts는 schema parse 후 공통 검증을 호출하고 project-sync-query.ts의 syncProject도 접근 판정 뒤·저장 전에 같은 검증을 호출하여 직접 호출 우회를 막는다. syncProject의 다른 직접 호출자인 scripts/rehearse-project-availability-d3.ts는 두 번 부른다. 선택되지 않은 프로젝트에 빈 배열을 보내 ok:false를 기대하는 호출(:174-175)은 접근 판정에서 거부되어 새 검증에 닿지 않는다. 선택된 프로젝트에 유효 workspace 하나를 보내 ok:true를 기대하는 호출(:179-181)은 새 검증을 통과한다. 두 기대값 모두 바뀌지 않는다. parseHarnessConfig의 다른 직접 호출자인 packages/core/vars.test.mjs(:7·:29)와 src/server/agents/vars.test.ts(:12)는 유효한 설정만 파싱하므로 결과가 같다. 형식 오류를 잡겠다고 DB 오류까지 일반 입력 오류로 삼키지 않는다.

오류 문장은 지금 parseHarnessConfig가 내는 경로와 문구 그대로를 validateWorkspaceSemantics가 소유한다. 항목 수준은 `workspaces[<i>].<field>: <message>`(예: `workspaces[0].agent: reserved report agent: pm`, `workspaces[0].verify: at least one verify command`), 배열 수준은 `workspaces: at least one workspace`다. parseHarnessConfig는 지금처럼 `harness.json ` 접두를 붙이고, init은 `Config error: ` 뒤에 그대로 출력한다. MCP project_sync(tools.ts와 syncProject)도 입력이 harness.json의 workspaces이므로 같은 접두를 붙인 같은 문장을 도구 오류로 돌려준다. 이 형태를 고정하는 기존 기대값 packages/core/config.test.mjs:39와 plugin/bin/harness-init.test.mjs:170은 바뀌지 않아야 한다.

새 export의 사용처는 config.mjs의 상대 import와 server의 @harness/core/workspaces.mjs다. plugin/lib는 생성 복사본이며 직접 편집하지 않는다. T01은 raw config와 normalized MCP를 따로 시험하고, 파서 raw 오류를 검증하는 기존 테스트를 보존한다.

### F06 · Must — 본문 반환 직전 현재 requires를 검사한다

근거: agents/next.ts에서 새 run 진입/전진 대상은 검사하지만 기존 단계의 재조회·handoff·분기 없음은 serve(current)로 바로 간다. implementing 단계에서 보드가 planning으로 반려되면 옛 구현 지시를 다시 받을 수 있다.

2026-09-15 확인: 상태를 바꾸는 모든 transitionIn과 discard가 그 key의 열린 run을 닫으므로(board.ts:187-190, :221) 위 반려 시나리오는 이제 막힌다. 다음 호출은 새 run 진입의 requires 판정을 지난다. 남은 경로는 둘이다. 첫째, 보드 상태가 아닌 requires다. pm의 propose 단계(requires: can-propose)는 다른 경로로 미결이 2건이 된 뒤에도 재조회·handoff·분기 없음에서 본문을 다시 받는다(next.ts:168·:177·:183). board_propose가 Serializable로 다시 거부하므로 쓰기는 막히지만 본문 공개 규칙은 어긋난다. 둘째, openRun을 읽은 뒤 전이가 커밋되는 경쟁 창에서는 닫히기 전 run의 본문이 나갈 수 있다. 목표 계약은 그대로다. 새 run은 열리는 첫 단계로 열고, 열린 단계가 없으면 run 없이 not open으로 거부하며, 실패 분기로만 닿는 단계를 진입 후보에서 빼는 규칙은 docs/proposals/completed/2026-09-05-agent-next-open-routing.md(:88·:177-180)가 정했고 그대로 둔다.

본문 제공을 공통 checked-serve 경계로 모으고 **매번 새 Facts로 반환할 step의 requires**를 검사한다. 새 진입, 다음 단계, outcome 없는 재조회, handoff, 분기 없음 모두 포함한다. 충족하지 않으면 본문과 receipt를 포함하지 않는 not open 응답만 준다. 이 읽기 거절은 cursor/원장/refused를 추가 변경하지 않는다. outcome의 기존 수락/감사 기록과 본문 공개 여부는 별도로 다룬다.

이미 커밋된 cursor 이동 뒤 반환 직전에 조건이 바뀌면 본문은 숨기고 재조회를 안내한다. 사실을 읽은 시점 이후의 외부 상태 변경을 영구히 막는 보장은 하지 않는다. no-route/handoff 전의 Facts를 재사용해 옛 상태를 보내지 않는다. 조건 없는 hold는 계속 반환 가능하지만 실패 분기 전용 hold를 새 run의 우회 진입점으로 만들지 않는다. 항목 소유권·보고 에이전트 예외·language→en fallback도 유지한다.

### F02 · Should — 잘림 판정은 반환한 BoardItem을 대상으로 한다

근거: pipeline/board.ts/getWithHistory는 최신 비폐기 행 하나를 반환하지만 hasHistoryBefore(projectId,key,cutoff)는 같은 key의 과거 행까지 본다. 상세 페이지가 새 행의 이력에 대해 거짓 잘림 배너를 표시할 수 있다. 2026-09-15 확인: getWithHistory는 events와 reports를 둘 다 since로 자르지만(board.ts:113-114) hasHistoryBefore는 transitionEvent만 본다(:121). 창 밖에 보고서만 있으면 문서 링크(item-docs.ts의 reports)는 사라지는데 잘림 배너(board-item-page.tsx:131)는 뜨지 않는다.

hasHistoryBefore를 (projectId, boardItemId, cutoff)로 바꾸고, 그 행의 transitionEvent 또는 Report 중 cutoff 전 행이 있으면 true로 한다. 보고서 검사는 지금 없는 조건을 새로 넣는 의도된 변경이며, 본문 창(getWithHistory)과 잘림 판정을 맞추려는 것이다. 배너 문구는 바꾸지 않는다. src/app/(app)/p/[slug]/items/[key]/page.tsx는 getWithHistory가 반환한 row.id를 넘긴다. 이름만 바뀐 같은 string 인자를 혼동하지 않도록 매개변수·쿼리·호출·테스트를 함께 바꾼다. projectId 관계 조건도 유지한다. cutoff:null이면 추가 조회 없이 false, since 이상의 본문과 미만의 잘림 경계를 일치시킨다. MCP board_get의 반환 envelope는 바꾸지 않는다.

### F04 · Should — 기존 공개 필드를 보존하며 DTO로 제한한다

근거: tools.ts의 BacklogView/BacklogWithStatusView는 최소 타입일 뿐이다. deps.ts의 backlogGet(:21)은 Prisma 전체 행을, backlogList(:20)는 board.ts/backlogWithStatus의 전체 행에 status를 붙여 반환하고, text()가 JSON.stringify하므로 타입에 없는 필드도 현재 전송된다. 구조적 타입의 만족 여부는 필드 유출 방지 검사가 아니다. **project_get은 이미 해소됐다.** 7e1678d가 src/server/mcp/project-query.ts의 명시적 PROJECT_GET_SELECT와 loadProjectView로 바꿨고, src/server/mcp/project-query.test.ts가 그 projection과 repoOwner·ownerUserId·available 부재를 고정한다.

이번 구현 범위는 backlog_get, backlog_list다. 새 mcp/views.ts의 toBacklogView/toBacklogWithStatusView가 아래 필드를 **명시적으로** 복사한다. project_get은 project-query.ts의 명시적 select를 유지하고 새 mapper를 만들지 않는다. 표의 project_get 행은 보존 회귀 검사의 기준이다. 객체 spread, 전체 행 반환, Prisma 타입을 공개 계약으로 내보내는 방식은 쓰지 않는다. 먼저 현재 값으로 계약 fixture를 만들고 동일 JSON을 보존한다. 알 수 없는 외부 소비자를 이유로 임의 필드를 삭제하지 않는다.

| 응답 객체 | 보존하는 정확한 필드 |
| --- | --- |
| project_get(보존 기준, 이미 명시적 select) | id, slug, name, owner(repoOwner에서 옮긴 값), repo, branch, language, executorKind, commandIssue, runbookVersion, createdAt, workspaces |
| workspaces 각 행 | id, projectId, wsId, path, agent, verify, knowledge, readOnly |
| backlog_get 및 backlog_list 각 행 | id, projectId, key, title, area, source, createdAt, removedAt |
| backlog_list만 추가 | status |
| project_get 추가 필드(tools.ts가 붙임) | 사용 가능하면 available:true, 선택되지 않았으면 available:false와 reason. 소유권 무결성 오류는 필드가 아니라 도구 오류 |

현재 Date 직렬화는 ISO 문자열, null/배열은 그대로다. ToolDeps의 View 타입도 전체 실제 계약과 일치시킨다. 지금 ProjectView(tools.ts:20-23)에는 executorKind·commandIssue·runbookVersion·createdAt과 workspaces의 id·projectId가 빠져 있으므로 타입만 보강하고 project_get 응답 모양은 바꾸지 않는다. board_list/get/propose/transition/증거 도구, pipeline_next(runbook 선택 필드 포함), agent_next의 응답은 이번 DTO 추출 대상이 아니며 board 응답의 acceptedAt과 board_get의 events.channel을 포함해 각 응답이 지금 싣는 필드를 삭제하지 않는 회귀 검사를 둔다. 추출 목적은 backlog 두 도구의 미래 필드 자동 노출을 막는 것이지 과거 응답 축소가 아니다.

### F08 · Should — 정상 빈 목록과 실패를 별도로 전달한다

근거: server/github.ts/listPublicRepos는 정상 빈 배열, non-2xx, 잘못된 JSON, 네트워크 실패를 []로 합친다. NewProjectForm은 빈 목록 모두에 “Couldn't load”를 표시한다. 2026-09-15 확인: github.ts:19·:21·:37이 []를 반환하고 catch만 console.error를 남긴다. 폼은 목록이 비면 처음부터 수동 입력으로 열고(new-project-form.tsx:33) 같은 문구를 낸다(:128-133).

서버 결과는 { ok:true, repos:PublicRepo[] } | { ok:false, reason:"http"|"payload"|"network" }로 구분한다. 정상 [] 또는 archived 제외 후 []는 성공이다. JSON parse 실패/배열이 아닌 body는 payload 실패다. 배열의 비객체/null 원소는 안전하게 건너뛰고 기존 name/defaultBranch/archived 필터를 유지한다. 원시 예외·응답 본문·헤더를 클라이언트에 넘기지 않는다.

src/app/(app)/p/new/page.tsx(:13·:19)는 서버 결과를 NewProjectForm의 기존 repos와 새 repoLoadFailed:boolean prop으로 명시적으로 매핑한다. FSD의 RepoOption 타입은 그대로 쓰며 client가 서버 결과 타입을 import하지 않는다. 실패 때만 기존 “Couldn't load your repositories. Paste a URL.”, 정상 빈 목록은 “No public repositories found. Paste a URL.”을 표시한다. 이 새 문장은 product-copy §10의 New project 항목에 먼저 추가한다(지금은 실패 문장만 fallback으로 있다, product-copy.md:405). 양쪽 모두 URL 붙여넣기/수동 편집/제출 경로를 유지한다.

공개 저장소 API URL·인증 범위·100개 조회·기본 branch fallback·next.revalidate:300은 유지한다. 새 페이지네이션, client fetch, 자동 재시도, cache:no-store는 추가하지 않는다. 서버 로그는 실패 분류와 HTTP status 등 안전한 정보만 남긴다. 지금의 console.error(error)(github.ts:36)는 원시 오류 객체를 남기므로 분류·status만 남기도록 바꾸고 T08에서 확인한다.

### F09 · Consider — 잠금 설명을 실제 경로에 맞춘다 (이미 충족, 2026-09-15)

최초 근거: server/templates.ts는 “MCP도 401”이라고 설명하지만 mcp/tools.ts는 인증을 통과시킨 뒤 상태 변경 도구를 isError로 거부하고 읽기를 허용한다.

현재: bd72d94가 그 주석을 지웠고, 7e1678d 이후 src/server/templates.ts는 DB 배선만 한다. 인증·접근 흐름은 src/server/templates-query.ts로 옮겨졌고, 선택되지 않은 프로젝트를 403과 사유로 거부하며 주석도 그 동작을 말한다(:31-35). MCP 쪽 주석(tools.ts:79, owner-tools.ts:40)도 실제 경로와 맞다. project_get은 사유를 싣고 답하고, 나머지 도구는 읽기·쓰기 모두 도구 오류다. 이 발견에 남은 구현 작업은 없다. 토큰 검증, HTTP 상태, MCP body, 도구별 거부 정책은 바꾸지 않는다. T09는 E2~E5가 이 경계를 바꾸지 않았는지 보는 보존 회귀로만 남긴다.

## Affected Files

여기서 “수정”은 후속 구현 대상이다. 이번 편집 대상은 이 MD 하나다. 경로 그룹은 아래 manifest에서만 확장하며 “관련 파일 전체”라는 추가 범위를 두지 않는다.

| 묶음 | 정확한 현재/신규 경로와 소유 심볼 |
| --- | --- |
| E1 스키마·실행기 | 수정: prisma/schema.prisma(새 열과 AgentRun 모델 머리·tokenId·AgentRunStep 주석), package.json, docs/architecture/verification.md(test:server·test:server:integration과 runner 행, 이미 완료된 `src/app` 이동을 미완료로 적은 :92-101 갱신), docs/architecture/README.md(저장소 트리에 tests/ 추가), docs/architecture/fsd.md(:173을 일반 단위 시험의 공존 규칙으로 한정하고 별도 bootstrap·실DB를 쓰는 교차 모듈 서버 시험은 tests/server에 둔다는 영구 규칙 추가). verifier 예외나 ADR은 추가하지 않는다. 신규: prisma/migrations/20260915090000_agent_receipts_and_callers/migration.sql, scripts/test-server-integration.mjs, scripts/test-server-integration.test.mjs, tests/server/register-server-only.mjs |
| E2 cursor | 수정: src/server/agents/next.ts(NextInput/Output/Deps, agentNext, checked-serve, 닫힌 run 분기), runs.ts(prismaNextDeps의 record·advance·refused·lastClosedRun 교체, verifyOk의 accepted 필터, recentSteps의 callerTokenId 집계; 신규 createNextDeps), next.test.ts. src/server/mcp/tools.ts(registerTools의 agent_next schema·설명), src/server/mcp/tools.test.mjs. src/server/pipeline/board.ts의 두 증거 조회(recordValidation·submitReport). src/server/pipeline/run.ts(nextFor의 마지막 steps 조회). src/fsd/widgets/turn-banner/api/turn-data.server.ts(loadTurn) |
| E2 private 지침 | 수정: plugin/templates/en/agents/dev.md, pm.md, plan-verifier.md, doc-auditor.md, feature-scout.md; plugin/templates/en/CLAUDE.runbook.md; plugin/templates/en/docs/agents/README.md; plugin/templates/templates.test.mjs. CLAUDE.runbook.free.md는 원본에서 이미 삭제됐다 |
| E3 보드 | 수정: src/server/pipeline/board.ts(신규 createBoardService와 기존 export, writer transitionIn·discard·gate·submitPlan·recordValidation·submitReport와 advanceRun의 pipeline 전이. pipeline_next가 부르는 advancePipeline도 같은 advanceRun을 지난다). 판정 정책의 소유자는 board-rules.ts에 유지한다. 보존 회귀: src/server/pipeline/board-rules.test.mjs(decide* 정책만 시험하고 updatedAt을 다루지 않음)와 src/server/mcp/owner-tools.test.mjs(gate_approve → board.gate 연결)는 고칠 것이 없고 경쟁 사례를 담지 않는다. 쓰기 호출부 src/fsd/features/review-gate/api/review-gate.server.ts, src/fsd/features/propose-item/api/propose-item.server.ts, src/server/mcp/owner-deps.ts, src/server/mcp/deps.ts와 읽기 호출부 src/app/(app)/p/[slug]/page.tsx, src/app/(app)/p/[slug]/backlog/page.tsx, src/fsd/features/edit-backlog/api/edit-backlog.server.ts는 기존 import·인자·반환 모양을 유지한다 |
| E4 입력·sync | 신규: packages/core/workspaces.mjs, workspaces.test.mjs. 수정: packages/core/config.mjs, config.test.mjs; src/server/mcp/tools.ts, tools.test.mjs, project-sync-query.ts(syncProject), project-sync-query.test.ts; plugin/bin/harness-init.test.mjs. src/server/mcp/deps.ts는 배선만 한다(신규 createToolDeps) |
| E5 이력 | 수정: src/server/pipeline/board.ts/hasHistoryBefore, src/app/(app)/p/[slug]/items/[key]/page.tsx |
| E5 DTO | 신규: src/server/mcp/views.ts, views.test.ts. 수정: src/server/mcp/tools.ts의 View 타입, src/server/mcp/deps.ts의 두 조회 어댑터(backlogList·backlogGet), src/server/mcp/tools.test.mjs. project_get의 src/server/mcp/project-query.ts, project-query.test.ts는 보존 검증 전용이다. MCP 전용 mapper 밖의 src/app/(app)/p/[slug]/backlog/page.tsx와 src/fsd/features/edit-backlog/api/edit-backlog.server.ts는 기존 board query 모양을 계속 받는다 |
| E5 GitHub | 수정: src/server/github.ts, src/app/(app)/p/new/page.tsx, src/fsd/features/create-project/ui/new-project-form.tsx, docs/conventions/product-copy.md §10의 New project 문장(fallback인 실패 문장은 유지하고 정상 빈 목록 문장 추가). 신규: tests/server/github.test.ts, src/fsd/features/create-project/ui/new-project-form.test.ts |
| E5 주석 | 없음 — F09 이미 충족. src/server/templates.ts와 templates-query.ts는 보존 검증 전용 |
| E6 계약·배포 검증 | 수정: docs/architecture/protocol.md(도구 입력/출력·handoff·공개 JSON. :62의 AgentRunStep 정의를 수락·거절 감사·legacy로 고치고, :175-178의 handoff 설명에 receipt를 실은 호출, 거절 감사 행을 뺀 마지막 원장 행, handoffIsLive의 시각 조건을 넣는다), invariants.md(수락/거절 원장 구분. :61-64의 validation 벽과 :65-71의 report 벽이 세는 AgentRunStep verify 행에서 거절 감사 행을 뺀다고 적는다), system-overview.md(전달·receipt 경계). docs/conventions/product-copy.md §12(agent_next의 receipt 필수·스코프 불일치·stale·닫힌 run 안내와 project_sync 합집합 상한 거부 문장(capReason으로 시작하고 init 사전 검사 문장과 뜻이 다름을 명시)·트랜잭션 충돌 문장, 그리고 harness.json 파싱 오류 문단의 워크스페이스 문장 소유자를 core workspaces.mjs로 바꾸고 project_sync도 같은 문장을 낸다고 적기), §13(agent_next 설명 행), §14(dev·보고 에이전트 스텁의 receipt를 실은 완료·handoff 호출 안내). plugin/skills/init/SKILL.md의 갱신·skip(modified) 안내, plugin/bin/harness-init.test.mjs. 용어는 문서와 코드에서 구분한다. agent_next의 receipt는 "실행 receipt"로 불러 D3 복구 receipt(verification.md:52·:55)와 가르고, AgentRunStep.accepted는 "수락"으로 불러 인수(CONTEXT.md:60)와 가른다. 커서는 "agent run 커서"와 "파이프라인 커서"로(protocol.md:133), 판 번호는 AgentRun.revision과 PipelineVersion의 version으로 나눠 쓴다 |
| 실DB 시험 | 신규: tests/server/integration/support.ts, agent-runs.test.ts, board.test.ts, project-sync.test.ts, templates.test.ts, migration.test.ts |

표에서 파일명만 적은 항목은 같은 셀 안에서 바로 앞에 적은 디렉터리로 확장한다. 모든 경로는 저장소 루트 기준이다.

읽기/보존 검증 전용 경계도 다음으로 고정한다.

- 인증/라우트: src/app/api/mcp/route.ts, src/app/api/mcp/owner/route.ts, src/app/api/templates/route.ts, src/app/api/runbook/route.ts, src/server/mcp/auth.ts, auth.test.mjs, owner-deps.ts, owner-tools.ts, src/server/auth/guard.ts, src/server/templates-query.ts, templates-query.test.ts, runbook-query.ts, runbook-query.test.ts, project-access-query.ts.
- 웹 전이/표시: src/app/(app)/p/[slug]/page.tsx(보드 행과 열린 AgentRun으로 디스패치 표시), src/app/(app)/p/[slug]/backlog/page.tsx(backlogWithStatus), src/fsd/features/edit-backlog/api/edit-backlog.server.ts(latestBoard를 쓰는 삭제 guard), src/fsd/features/review-gate/api/review-gate.server.ts, src/fsd/features/review-gate/index.server.ts, src/fsd/pages/board-item/ui/board-item-page.tsx, src/fsd/widgets/turn-banner/model/turn.ts, turn.test.ts(순수 모델 시험이라 loadTurn의 원장 필터와 무관하며, 필터는 T05의 agent-runs.test.ts가 검사한다), src/fsd/entities/board-item/index.ts, src/fsd/features/create-project/model/repo-url.ts, repo-url.test.ts, src/fsd/features/create-project/index.ts, index.server.ts.
- 공통 정책/생성: packages/core/entitlement.mjs, entitlement.test.mjs, transitions.mjs, transitions.test.mjs, deliver.mjs, deliver.test.mjs, render.mjs, vars.mjs, manifest.mjs, pipeline.mjs, runbook.mjs; src/server/pipeline/run-rules.ts(handoffIsLive); src/server/project-availability-service.ts(changeUserPlan의 최근 에이전트 활동), project-availability-service.test.ts; plugin/bin/harness-init.mjs; scripts/plugin-lib.mjs, plugin-lib.test.mjs, seed-templates.ts, lib/prisma.ts; examples/apch/harness.json; plugin/skills/init/references/reconciliation-contract.md. init의 외부 검증 스킬 preflight와 사용자 파일 쓰기 확인은 그대로 보존하며 이 제안에서 외부 스킬 설치/교체는 하지 않는다.
- 환경/지침: AGENTS.md, docs/architecture/fsd.md, docs/proposals/README.md, template.md, prisma.config.ts, tsconfig.json, package-lock.json, .github/workflows/check.yml, node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md. scripts/rehearse-project-availability-d3.ts의 syncProject 직접 호출과 legacy 모양 AgentRunStep fixture(accepted 없음)는 그대로 둔다. 리허설 코드는 새 migration 때문에 고치지 않는다. migrateD3(:128-129)는 저장소의 migration을 전부 적용하지만, primary의 보존 표 snapshot 비교(:230-232)는 AgentRun·AgentRunStep 행을 만드는 exerciseFinalSchema(:165-166, 호출 :233)보다 앞이고 그 전의 setup smoke(:90-93)도 에이전트 행을 만들지 않아 두 표가 비어 있다. restore의 두 snapshot(:237·:242)은 모두 새 migration 적용 뒤에 찍는다. migration 수 확인(:73)은 D2 baseline 커밋의 migration을 센다. 달라지는 것은 복구 migration의 순서다. scripts/restore-project-ownership-shadow.ts의 applyRecovery(:52-64)는 저장소 migration을 임시 폴더에 복사하고 20260914093000_restore_d2_ownership_shadow(scripts/lib/project-ownership-recovery.ts:5)를 더해 migrate deploy한다. 지금은 이 복구 migration이 마지막이지만, 새 20260915090000 migration이 적용된 DB에서는 이미 적용된 migration보다 이름이 앞선 미적용 migration이 된다. Prisma 문서는 deploy가 미적용 migration을 적용하고 이력 차이를 경고하지 않는다고만 적으므로, 이 순서에서도 복구가 적용되어 D2 schema 판정(:107-108)을 통과하는지는 E1 뒤 D3 리허설의 복구 단계(:238-242)로 확인한다. 복구 스크립트는 cleanup migration을 이름으로 찾으므로(:95) 그 판정은 바뀌지 않는다. scripts/lib/project-ownership-cleanup.ts의 보존 데이터 fingerprint(:182-191)는 AgentRun·AgentRunStep 행이 있으면 새 열 때문에 이 migration 전후 값이 달라지므로 같은 schema 상태의 보고끼리만 비교한다. 보고의 schemaFingerprint(:200)는 catalogFingerprint(:56)가 소유권 catalog만 해시한 값이라 바뀌지 않는다. scripts/project-availability-runtime.test.ts는 check 안에서 생성 모델 파일 수 17과 membership 부재를 고정하는데, F05는 열만 추가하므로 그 기대값이 바뀌지 않는다.
- private 본문 의존: plugin/templates/README.md 및 en/docs/plans/README.md, template.md, verification-paths.md. 단계 본문이 읽는 이 세 파일은 변경 없이 함께 렌더/전달 검증한다. 다른 언어 원본은 현재 로컬 목록에 없다.

**추출/생성의 provenance**

- validateWorkspaceSemantics: 현재 config.mjs 내부 의미 검사 → 새 core/workspaces.mjs의 named export → config.mjs 상대 import + tools.ts·project-sync-query.ts의 @harness/core/workspaces.mjs → core/workspaces.test.mjs, config.test.mjs, tools.test.mjs, project-sync-query.test.ts. 옛 중복 의미 검사가 없어지고 새 호출이 존재하는지 함께 확인한다. JSON raw 정규화는 config.mjs에 남긴다.
- DTO mapper: 현재 deps.ts의 backlog 두 어댑터가 반환하는 전체 행 → 새 mcp/views.ts named exports → deps.ts 상대 import → views.test.ts 및 실제 MCP JSON 검사. 순수 mapper에서 server-only/Prisma/FSD를 import하지 않는다.
- NextDeps: 실제 구현은 runs.ts, 소비는 next.ts와 두 테스트 harness(next.test.ts, private templates.test.mjs). 기존 record/advance/refused/lastClosedRun 완료 계약은 commitOutcome으로 교체하고, scope로 제한한 runByReceipt와 템플릿 변경 전용 closeRun을 추가한다. 이 NextDeps.closeRun은 AgentRun 전용이며 board.ts의 비공개 closeRun(PipelineRun)·closeRuns와 다른 함수다. openRun/createRun은 revision을 반환하며, 생성한 행의 실제 id/revision/stepId로 receipt를 만든다. commitOutcome은 scope·receipt·outcome/note·목적지(stay/step/done/닫힌 run의 마지막 말)·refused 증가 여부를 받아 CAS와 수락 원장(CAS가 0건이면 거절 감사 행)을 한 트랜잭션에 저장하고 수락된 run 또는 stale/closed를 반환한다. 구현은 runs.ts, 타입은 next.ts의 NextDeps, 소비는 agentNext와 두 harness다. DB 주입 연결점은 같은 파일의 createNextDeps(db) → prismaNextDeps, mcp/deps.ts의 createToolDeps(db) → prismaToolDeps, board.ts의 createBoardService(db) → 기존 named export 바인딩으로 한정한다. 세 factory는 모두 신규이고 지금의 prismaNextDeps·prismaToolDeps const와 board.ts named export를 그 결과로 바인딩한다. project-sync-query.ts(syncProject)·project-query.ts(loadProjectView)·project-access-query.ts(readProjectAccess)는 이미 client나 finder를 주입받으므로 그대로 쓴다. 기존 호출 import/인증 정책은 그대로 두고 테스트만 별도 client를 전달한다. 새로운 범용 repository/service 계층은 만들지 않는다.
- hasHistoryBefore: export 소유자는 board.ts 그대로, route의 import 경로도 그대로다. key가 아니라 반환 row.id를 넘기는 호출과 scoped DB 쿼리를 검증한다.
- GitHub 결과: server/github.ts → src/app/(app)/p/new/page.tsx의 명시적 prop 매핑 → create-project public index의 NewProjectForm. client에 서버 타입 import를 추가하지 않는다.

**파일 작업 preflight:** 신규 대상은 2026-09-15 대조에서도 모두 부재이며(tests/ 루트 자체가 없다) 기존 파일과 충돌하지 않는다. packages/core, plugin/lib, src/server/mcp, scripts, prisma/migrations, create-project/ui 부모는 존재한다. tests/server/integration과 새 migration 하위 폴더는 구현 시 생성한다. migration 이름은 이 제안의 고정 목적지이며, 기존 최신 migration(20260914090000_remove_individual_project_ownership_shadow)보다 뒤에 정렬되어야 한다. 2026-09-10에 적었던 20260910000000은 이후 생긴 migration 네 개보다 앞에 정렬돼 적용 순서가 어긋나므로 바꿨다. 구현 직전 충돌하거나 더 새 migration이 생겼으면 덮어쓰지 말고 이름·모든 참조를 함께 갱신한 뒤 재검토한다. 파일 이동·삭제 계획은 없다. generated Prisma와 plugin/lib에는 원본 편집이 아닌 생성 절차만 적용한다. migration.test.ts의 부모 tests/server/integration과 register-server-only.mjs의 부모 tests/server도 함께 생성한다. 테스트 bootstrap은 대조일에 부재이며 src의 런타임 import 대상이 아니다. 서버 시험을 대상 옆에 두는 현재 fsd.md:173의 문장만으로는 저장소 루트 tests/server를 정당화할 수 없으므로 E1에서 규칙도 함께 갱신한다. 일반 단위 시험과 server-only 없이 client를 주입받는 기존 src/server의 *-query.test.ts는 대상 옆에 유지한다. 반면 github.ts·board.ts·runs.ts·run.ts·deps.ts는 server-only를 import하므로(github.ts:1) src/**/*.test.ts를 bootstrap 없이 도는 test:web에 두면 로드되지 않고, 실DB 시험은 TEST_DATABASE_URL을 검증하는 별도 runner에서만 돌아야 한다. 이 별도 bootstrap·교차 모듈·실DB 서버 시험만 tests/server에 둔다. 새 최상위 폴더는 docs/architecture/README.md 트리에 넣고, verification.md:92-101의 이미 끝난 `app/`→`src/app/` 이동 설명은 현재 README.md:40-42와 맞게 갱신한다. verifier 예외를 만들거나 규칙을 끄지 않는다. tsconfig.json의 include(:28의 **/*.ts)와 eslint.config.mjs의 globalIgnores(:9-18)에 tests/가 없으므로, 새 tests/server/**/*.ts는 CI가 실행하지 않아도 check의 tsc --noEmit·eslint 대상이다. 이 파일들도 E1부터 타입·린트를 통과해야 한다.

## Safety Analysis

위험은 아래 runtime/산출물 표와 T01~T10으로 닫는다. 기존 동작을 보존한다는 문장만으로 안전 판정을 하지 않는다.

| 입력/상태 | 목표 결과 및 실패 경로 | 검증 목적지 |
| --- | --- | --- |
| hs_/ho_ 교차, revoked, 소유자 아님, 선택되지 않음(available:false), 소유권 무결성 오류, Free 세션 승인 | 기존 인증/플랜 순서, project_get의 사유 응답, 나머지 도구 isError, HTTP 403 유지, 권한 확대 없음 | auth.test.mjs, tools.test.mjs, owner-tools.test.mjs, templates-query.test.ts, runbook-query.test.ts, T09/T10 |
| 같은 receipt 순차·동시 재전송/같은 step 재방문 | 한 번만 수락, stale은 성공 증거/다음 단계 완료 아님 | T05, agent-runs.test.ts |
| 보드가 먼저 닫은 run의 마지막 종료 outcome, 같은 시도 두 번째, handoff 뒤 종료, 스스로 done에 닿은 run | 한 번만 accepted:true, 이후는 accepted:false 감사, 응답은 모두 done:true 안내, cursor·stepId·closedAt 불변 | T05, next.test.ts run lifecycle |
| handoff/분기 없음/조건 불충족 | 수락 receipt 회전, 기존 cursor/refused 규칙 유지, 본문은 다시 검사 | T05/T06, 실제 private 템플릿 시험 |
| 다른 scope receipt/닫힌 run/템플릿 변경 | 스코프 누출 없음(다른 스코프·없는 runId는 같은 한 문장, 원장 0), 새 run 자동 완료 없음, 재조회 복구 | T05 |
| A 개설+B 호출, legacy 원장 | 새 호출만 정확한 귀속, legacy 보수 집계·행 보존 | T03, migration fixture |
| plan·validation·report vs 웹/세션 전이·gate·폐기·reopen, 증거 뒤 advanceRun과 pipeline_next 지연 전진(advancePipeline)의 pipeline 전이 | 조건부 버전 선점, 패자 전체 rollback, acceptedAt/백로그 일치, 같은 ms 연속 쓰기 뒤 handoffIsLive 판정 확인 | T10 |
| 중복/예약 workspace, 빈 배열, 합집합 초과, 동시 sync | 저장 전 오류 또는 트랜잭션 충돌(§12 충돌 문장), language·lastSyncedAt/행 부분 변경 없음 | T01/T07 |
| 과거/현재 BoardItem, cutoff 동일 시각, 창 밖에 보고서만 있는 행 | 반환 행만 잘림 판정, 이벤트·보고서 모두 경계 포함/제외 일치 | T02 |
| 현재 필드 + 저장 모델의 가상 추가 필드 | 현재 JSON 완전 보존, 새 필드 자동 노출 없음 | T04 |
| GitHub 정상 빈/archived/HTTP/JSON/network | 성공 빈 상태와 실패 copy 분리, 양쪽 수동 입력 가능 | T08 |

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — 새 라우트는 없다. /api/mcp·/api/mcp/owner·/api/templates·/api/runbook의 인증과 도구 목록은 그대로다(T09). 바뀌는 진입점은 agent_next·project_sync·backlog_get/backlog_list의 도구 응답과 src/app/(app)/p/new/page.tsx·items/[key]/page.tsx의 서버 조회다. src/app/(app)/p/[slug]/page.tsx·backlog/page.tsx와 edit-backlog.server.ts는 board factory/DTO 변경 뒤에도 기존 내부 조회 계약을 보존한다.
- [x] 정적 `import` / `export from` — 새 packages/core/workspaces.mjs(config.mjs의 상대 import, server의 @harness/core/workspaces.mjs)와 src/server/mcp/views.ts(deps.ts의 상대 import). plugin-lib가 .mjs를 목록 없이 복사하므로 plugin/lib/workspaces.mjs가 생기고 check의 plugin-lib --check가 확인한다. 위 provenance.
- [ ] dynamic `import()` 또는 lazy loading — 해당 없음. 영향 경계(src/server, packages/core, plugin/bin, 해당 FSD slice와 라우트)에 동적 import가 없다.
- [x] barrel export(`index.ts`) 경유 참조 — create-project/index.ts가 NewProjectForm을 내보내며 repoLoadFailed prop만 는다. review-gate/index.server.ts와 board-item·turn-banner의 공개 API는 바뀌지 않는다.
- [x] 테스트와 스크립트 참조 — T01~T10 목적지, test·test:web·test:architecture·test:project-availability의 glob, scripts/rehearse-project-availability-d3.ts의 직접 호출·legacy fixture·보존 표 snapshot 비교(새 migration에 영향받지 않음)와 복구 bundle의 migration 순서(E1 뒤 리허설로 확인), project-availability-runtime.test.ts의 모델 파일 수 17, 새 tests/server 위치의 근거와 check의 tsc·eslint 대상 여부(Affected Files의 preflight).
- [ ] 정적 자산 URL 또는 `public` 직접 접근 가능성 — 해당 없음.
- [x] 타입 선언, 전역 선언, ambient module 영향 — 생성 Prisma의 AgentRun·AgentRunStep 타입(A1), NextDeps·NextInput/NextOutput, ToolDeps의 View 타입, listPublicRepos의 결과 타입. next-auth.d.ts 같은 ambient 선언은 바뀌지 않는다.
- [x] 런타임 side effect 또는 초기화 코드 — server-only shim은 별도 시험 process에서만 로드한다. 새 factory는 기존 singleton Prisma 바인딩을 그대로 export하고, GitHub fetch의 revalidate:300 캐시는 유지한다.
- [x] API, localStorage/sessionStorage, analytics, 외부 SDK 영향 — MCP 계약(agent_next receipt, project_sync 오류 문장, backlog JSON 필드 보존)과 GitHub REST 조회 결과의 분류가 바뀐다. 영향 경계에 storage·analytics 사용은 없다.

### 최종 산출물과 우선순위

| ID | 원본 → 최종 소비 지점 | 내용 단위 검증 |
| --- | --- | --- |
| A1 | schema.prisma → 추가 migration → PostgreSQL 및 src/generated/prisma/client.ts, src/generated/prisma/models/AgentRun.ts, src/generated/prisma/models/AgentRunStep.ts | 새 열/nullable/default/index의 실제 metadata·기존 행 수·legacy NULL. 생성된 AgentRun/AgentRunStep 타입과 어댑터 컴파일 확인 |
| A2 | private en 원본 → seed-templates.ts의 (lang,path) Template upsert → templatesFor/deliverable 및 runs.ts/template | /api/templates는 플랜 허용 스텁만, agent_next는 현재 단계 본문만. 서버는 Project.language 해당 본문 없으면 en fallback. API 언어 조회와 이 fallback을 같은 것으로 가정하지 않음 |
| A3 | A2 또는 HARNESS_TEMPLATES_DIR → deliverable → renderTemplate → harness-init/planWrites | .claude/agents/pm.md(모든 플랜), plan-verifier.md·doc-auditor.md(Pro·Max만, entitlement.mjs의 Free agents에 없음), feature-scout.md(모든 플랜이지만 harness.json에 scout 설정이 있을 때만, harness-init.mjs:114), 각 workspace.agent.md; docs/plans의 세 파일·docs/agents/README.md; CLAUDE.md의 harness:runbook 마커 내부; .mcp.json; harness.lock.json |
| A4 | core/workspaces.mjs·config.mjs → scripts/plugin-lib.mjs → plugin/lib/workspaces.mjs·config.mjs | core와 복사본의 파일 집합/바이트 일치. copied config의 상대 import가 copied workspaces를 가리킴. .test.mjs는 배포하지 않음 |
| A5 | board query/DTO/GitHub result → MCP JSON·프로젝트 보드·백로그·상세 페이지·삭제 guard·배너·새 프로젝트 폼 | 타입만 아니라 실제 직렬화 필드, 내부 board query 모양, row 범위, acceptedAt/channel 보존, handoff 선택, 오류 문구·수동 입력을 검사 |

A2/A3는 템플릿 “존재”만으로 통과하지 않는다. 다섯 스텁의 receipt 사용(완료·handoff 호출)/재조회 규칙, dev의 plan/report/hold handoff 본문, runbook "Before the cycle"의 handoff 설명과 "The cycle"의 outcome 없는 재개 안내 보존, docs/agents 안내, dev 스텁의 110줄 상한을 각각 검사한다. dev의 verify 명령·scope·readOnly 변수, 문서 경로, tools 목록은 그대로여야 한다. 런북은 한 판이며 deliverable은 DB에 옛 CLAUDE.runbook.free.md 행이 남아 있어도 내려보내지 않는다. Free에서 제외된 보고 에이전트(plan-verifier·doc-auditor)는 새로 배포하지 않는다. 기존 사용자 파일을 강제 삭제하지 않으므로 “디스크에 없음”을 일반 요구로 삼지 않는다. 깨끗한 생성 fixture에서는 제외 파일 부재, 기존 fixture에서는 보존·lock 정책을 각각 검사한다.

.mcp.json의 harness/harness_owner URL·환경변수 참조 및 다른 서버 항목 보존, harness.lock.json의 version/files/hash/template 구조, CLAUDE.md의 마커 바깥 보존도 확인한다. init이 파일을 쓴 뒤 /api/runbook에 런북 판을 보고하는 동작과 dry-run·로컬 우회로에서 보고하지 않는 규칙(harness-init.mjs:173-186)도 보존한다. 실제 receipt 값은 정적 파일에 넣지 않고 호출 때 받은 값을 쓴다. private 본문을 공개 저장소나 이 제안서에 복사하지 않는다.

## Approval

승인 기록은 front matter를 기준으로 한다. 사용자가 실제 코드 수정을 요청하여 코드·private 템플릿·아키텍처 문서를 함께 갱신했다. 실제 DB 검증은 사용자가 나중에 진행하도록 요청했고, 운영 migration·seed·배포는 승인 범위 밖이다.

## Execution Plan

1. **E1 — 기반:** 새 구현 요청/승인 후 HEAD와 dirty/private 원본을 재대조한다. 추가형 migration과 아래 격리 DB runner/fixture를 먼저 만든다. 기존 행의 callerTokenId/receiptRevision/accepted는 NULL, run revision은 0임을 검사하고 Prisma client를 생성한다. AgentRun·AgentRunStep 주석도 실제 다중 open-run 선택과 수락·거절·legacy 규칙에 맞춘다. 새 migration 뒤 D3 리허설을 한 번 실행해, 복구 migration이 새 migration보다 이름이 앞선 상태에서도 적용되는지 확인한다(빈 격리 PostgreSQL 두 개 필요). 새 최상위 tests/와 새 스크립트가 생기므로 docs/architecture/README.md의 저장소 트리, fsd.md의 테스트 위치 규칙, verification.md의 스크립트 행과 낡은 마이그레이션 주의 문단도 이때 고친다. 구현을 시작하기 전 기준선 명령 결과를 Verification Results에 적는다.
2. **E2 — cursor/호출자/공개:** F05/F03/F06을 한 계약 변경으로 구현한다. atomic 저장 경계와 모든 증거 소비부·배너를 함께 전환한다. MCP schema/설명, 순수 harness, private harness와 지침을 갱신한다. 실제 템플릿 그래프를 바꾸지 않고 T03/T05/T06/A2~A3를 통과시킨다.
3. **E3 — 보드:** E2가 바꾼 recordValidation·submitReport의 증거 조회 필터를 유지한 채 F10의 writer 전부(transitionIn·discard·gate·submitPlan·recordValidation·submitReport와 advanceRun의 pipeline 전이, pipeline_next의 advancePipeline 경유 포함)에 공통 CAS/단조 updatedAt을 적용하고(사람 경로는 호출자 CAS 토큰 유지) 웹 approveGate·소유자 세션 gate의 snapshot과 연결한다. 새 factory 뒤에도 프로젝트 보드·백로그·삭제 guard의 기존 named export와 조회 모양을 유지한다. 웹 override, 인수·재개, plan 이후 검증 규칙을 보존하며 T10을 실행한다.
4. **E4 — 입력/저장:** F01 공통 검증을 추출한 뒤 F07 Serializable 합집합 상한을 적용한다. core 복사본을 동기화한다. normalized/raw 입력·실제 생성기 import·DB 동시성 T01/T07/A4를 검증한다.
5. **E5 — 조회/안내:** F02의 rowId 호출부와 보고서를 포함한 잘림 판정, F04의 backlog 두 도구 DTO와 ProjectView 타입 보강, F08의 server→route→client 결과를 각 직접 소비부와 같이 수정한다. DTO는 MCP 어댑터에만 적용하고 백로그 화면·삭제 guard의 내부 board query 모양을 유지한다. F09는 이미 충족이라 작업이 없다. T02/T04/T08과 보존 회귀 T09를 실행한다.
6. **E6 — 문서/전달/검증:** protocol/invariants/system-overview/product-copy/init 안내를 실제 계약과 맞추고, E1에서 고친 docs/architecture/README.md 트리·fsd.md 테스트 위치 규칙·verification.md 스크립트 행과 마이그레이션 주의 문단이 최종 저장소·명령과 일치하는지 다시 확인한다. 공개 CI에 없는 private 검증 결과를 별도로 첨부한다. 전체 게이트와 DoD의 실행 결과를 기록한다. 커밋/PR까지 요청된 경우에만 harness/<topic>에서 dev 대상 PR을 만든다.

**승인 후 배포 순서:** 추가형 schema 적용 → 새 서버 writer와 모든 reader의 일관된 전환 → private 템플릿 seed → /harness:init 재실행 안내와 생성물 검증. 새 서버는 갱신 전 스텁의 outcome을 안전하게 거절하고 재조회 방법을 알려야 한다. 새 서버 writer를 배포하기 전에 IPA D3 복구 경로에 대한 승인자 결정(Risks and Rollback)을 받는다. 무receipt outcome을 임시 허용하는 우회나 혼합 구버전 writer가 계속 쓰는 rolling 상태를 정상 완료로 인정하지 않는다. 실제 서비스 전환 창/운영 연결 확인은 배포 수행자가 실행 직전에 확인한다. 이 문서는 자동 배포 명령을 제공하지 않는다.

## Verification Plan

### 검증 경로와 합격 조건

| ID | 실행 목적지 | 반드시 포함할 사례 |
| --- | --- | --- |
| T01 | packages/core/workspaces.test.mjs, config.test.mjs; src/server/mcp/tools.test.mjs, project-sync-query.test.ts; plugin/bin/harness-init.test.mjs | pm 포함 예약 4종, 형식·중복·빈 verify·빈 배열, raw 생략/normalized null, 오류가 둘인 fixture의 첫 오류(지금 검사 순서), schema 실제 parse, syncProject 직접 호출(검증 실패 시 쓰기 0), core/lib 동등. MCP project_sync의 도구 오류가 파서와 같은 `harness.json workspaces…` 문장이고, config.test.mjs:39·harness-init.test.mjs:170의 기존 기대값은 그대로 통과. project-sync-query.test.ts의 빈 배열·verify:[] fixture를 유효 입력으로 교체. scripts/rehearse-project-availability-d3.ts:175·:180의 기대값이 그대로임을 정적으로 확인 |
| T02 | tests/server/integration/board.test.ts | 같은 key의 옛 행만 cutoff 전 이력, 최신 행만 cutoff 전 이력, events만/reports만, 정확히 cutoff, 다른 project, 무제한 플랜; route가 row.id 전달 |
| T03 | src/server/agents/next.test.ts; tests/server/integration/agent-runs.test.ts | A/B caller 분리, accepted:false 집계, legacy fallback 중복 없음/10분 경계, 한도 초과 거부. 부모 tokenId는 보존. accepted:false 거절 행만 새로 생긴 프로젝트도 changeUserPlan의 최근 에이전트 활동이 그 시각으로 잡힘 |
| T04 | src/server/mcp/views.test.ts, tools.test.mjs, project-query.test.ts; tests/server/integration/project-sync.test.ts; 정적 type/build 경계인 src/app/(app)/p/[slug]/page.tsx·backlog/page.tsx와 src/fsd/features/edit-backlog/api/edit-backlog.server.ts | backlog 두 도구의 실제 JSON key 집합·Date/null/배열, 가상 필드 제외. project_get의 표 필드·available/reason 추가 필드 보존. DTO mapper는 MCP backlog 어댑터에만 적용하고 프로젝트 보드·백로그 화면·삭제 guard는 기존 내부 board query 필드를 받음. board 응답의 acceptedAt(board_list·board_get·board_propose·board_transition)과 board_get의 events.channel, pipeline_next(runbook 선택 필드)·agent_next 응답의 기존 필드 보존 |
| T05 | src/server/agents/next.test.ts, mcp/tools.test.mjs; tests/server/integration/agent-runs.test.ts; plugin/templates/templates.test.mjs | 동일 receipt 연속/동시, 루프의 같은 step, 잘못된 scope/누락 receipt, closed/새 run, CAS 후 오류 rollback. rejected verify는 verifyOk·validation·report 조회에서 제외, rejected handoff는 배너와 pipeline_next에 영향 없음. 보드가 먼저 닫은 run의 마지막 종료 outcome은 한 번만 accepted:true이고 동시 두 요청 중 하나만 이긴다. 템플릿 변경으로 닫힌 run은 마지막 말을 받지 않고 accepted:false 감사다. key 없이 연 run에는 보드가 먼저 닫는 분기가 없다. CAS 패자는 같은 트랜잭션에 거절 감사 행 하나만 남기고, 감사 행 쓰기가 실패하면 도구 오류와 원장·커서·refused 불변. refused 10회 console.warn 사례(next.test.ts:390) 유지. 갱신한 dev 스텁이 templates.test.mjs의 110줄 상한 통과. 닫힌 run에 온 outcome은 수락·거절 모두 done:true 안내, 열린 run의 CAS 패자는 stale. 다른 스코프·없는 runId의 receipt는 같은 한 문장으로 거부하고 원장 0. next.test.ts run lifecycle 사례의 "행이 늘지 않음" 기대값은 accepted:false 감사 행과 증거 불변으로 갱신. 바뀐 agent_next 설명이 product-copy §13 행과 글자까지 같음을 tools.test.mjs의 copyRow 방식(지금 board_transition·plan_submit에만 적용)으로 고정 |
| T06 | src/server/agents/next.test.ts; tests/server/integration/agent-runs.test.ts; private templates.test.mjs | 새 진입/전진/재조회/handoff/no-route 모두 검사. implementing→planning bounce 뒤 본문 없음(closeRuns로 이미 통과하는 회귀 사례); pm propose 단계에서 미결 2건이 된 뒤 재조회·handoff·분기 없음이면 본문 없음; 열린 hold는 유지, 실패 전용 hold로 초기 진입 불가. last moment 상태 변경·재조회 |
| T07 | src/server/mcp/project-sync-query.test.ts; tests/server/integration/project-sync.test.ts | A 보존+B 추가 거부, A 갱신, duplicate 요청 거부, 두 연결 동시 추가, language·lastSyncedAt rollback, 초과 legacy 보존, 선택되지 않은 프로젝트는 쓰기 0, Free/Pro/Max, P2034를 잡아 §12 충돌 문장으로 답하고 부분 쓰기 0. DB 없는 사례로 합집합 거부 시 쓰기 0, 입력 수만 상한을 넘는 요청도 같은 거부 |
| T08 | tests/server/github.test.ts; src/fsd/features/create-project/ui/new-project-form.test.ts | mocked fetch의 200 빈/archived/정상, 403/500, JSON 실패/비배열/null원소/network. URL·revalidate:300 유지, route 매핑, 두 상태의 실제 SSR 문구·입력 UI, 기존 repo-url.test.ts 파싱 회귀; console.error 대역으로 로그에 분류·HTTP status만 남고 원시 오류·응답 본문·헤더가 없음; 아래 수동 브라우저 인수 |
| T09 | src/server/mcp/auth.test.mjs, tools.test.mjs, owner-tools.test.mjs; src/server/templates-query.test.ts, runbook-query.test.ts; tests/server/integration/templates.test.ts | 보존 회귀: 토큰 경계, 선택되지 않은 프로젝트의 project_get 사유 응답과 나머지 도구 isError, 소유자 아님 거부, 실제 templates route의 403 status/error JSON. F09는 코드 변경이 없다 |
| T10 | tests/server/integration/board.test.ts(경쟁 사례 전부); 보존 회귀 src/server/pipeline/board-rules.test.mjs(decide* 정책)·src/server/mcp/owner-tools.test.mjs(gate 연결) | plan↔웹 승인/세션 승인(둘 다 board.gate), validation↔bounce/새 plan, report↔전이/폐기, done main-loop 보고↔reopen, 증거 쓰기 뒤 advanceRun의 pipeline 전이 경쟁, pipeline_next의 지연 전진(advancePipeline)과 웹 전이·gate·증거 쓰기 경쟁. 양방향 승패·고정 시계 같은 ms·패자 event/report 없음·acceptedAt/백로그·롤백. 같은 ms 연속 쓰기 뒤 handoff 기록의 handoffIsLive 판정. 화면이 본 옛 expectedUpdatedAt으로 보낸 웹 전이·discard·gate는 stale이고 쓰기 0. 세션 gate는 owner-deps.ts가 읽은 토큰 뒤에 다른 쓰기가 끼면 stale. 모든 BoardItem 쓰기가 계산한 updatedAt을 명시해 @updatedAt의 현재 시각이 들어가지 않음 |

T08의 수동 브라우저 인수는 승인된 테스트 환경의 /p/new에서 수행한다. 정상 빈 응답과 실패 응답을 각각 재현하고 문구 확인 → URL 붙여넣기 → Edit에서 owner/repo/branch/slug 수정 → Create project → 성공 화면과 해당 테스트 프로젝트 저장값 확인 순으로 기록한다. SSR 테스트를 클릭·제출 성공으로 보고하지 않는다. 기존 인증된 테스트 계정과 테스트 DB에서만 수행하고 운영 프로젝트는 만들지 않는다.

추가 cross-check: 원장 읽기 심볼 검색 결과를 직접 fixture의 배너/pipeline_next/검증 결과에서 역추적한다. src/fsd/widgets/turn-banner/api/turn-data.server.ts와 src/app/(app)/p/[slug]/page.tsx는 템플릿 문자열 안에 NUL 바이트가 있어 git과 ripgrep 기본 설정이 binary로 보고 건너뛴다. 원장·보드 소비부 검색은 `rg --text`로 하거나 이 파일들을 직접 연다. 보드 writer 목록은 UI/agent/owner 세 진입점과 pipeline 커서(증거 writer 뒤의 advanceRun, pipeline_next의 advancePipeline)에서 다시 추적하고, board.ts의 export 표면 열거와 latestBoard·backlogWithStatus·getWithHistory·hasHistoryBefore 호출자 검색으로 한 번 더 대조한다. entitlement는 입력 개수뿐 아니라 저장 후 전체 행을 확인한다. private seed 경로는 생성된 스텁·서버 단계 응답에서 원본으로 역추적한다. 이 서로 다른 경로의 검증으로 경계 누락을 찾는다.

### 실DB 실행기 계약

서버 계약용 실DB 테스트 명령은 없다. 기존 `test:project-availability:d3:db`(scripts/rehearse-project-availability-d3.ts)는 개인 프로젝트 사용 목록 D3 전환 리허설 전용이다. 빈 격리 DB 두 개와 IPA_D3_REHEARSAL_DATABASE_URL·IPA_D3_RESTORE_DATABASE_URL을 요구하므로 이 runner로 재사용하지 않고, 아래 TEST_DATABASE_URL과 이름·용도를 섞지 않는다. E1에서 package.json에 다음을 추가한다.

~~~json
{
  "test:server": "node --import ./tests/server/register-server-only.mjs --import tsx --test \"tests/server/*.test.ts\"",
  "test:server:integration": "node scripts/test-server-integration.mjs"
}
~~~

scripts/test-server-integration.mjs는 다음 계약을 구현한다.

- 명시적 TEST_DATABASE_URL만 테스트 대상으로 받는다. 비교할 일반 DATABASE_URL은 dotenv로 로드하되 기존 process env를 덮어쓰지 않고, dotenv 17이 기본으로 내는 주입 안내 줄은 quiet 옵션(또는 DOTENV_CONFIG_QUIET=true)으로 끈다. 미설정·파싱 실패·postgresql/postgres 이외 scheme·DB 이름이 stagekeeper_test_로 시작하지 않음·일반 DATABASE_URL과 같은 DB 대상을 가리킴은 실패 종료한다. 사용자명/비밀번호/query가 달라도 host/port/database가 같으면 거부한다. URL/credentials를 출력하지 않는다.
- fixture용 DB는 별도로 준비된 폐기 가능한 DB다. runner가 DB를 drop/create/reset하거나 외부 운영 URL을 추측하지 않는다. 확인된 test URL을 자식 process의 DATABASE_URL에만 주입한다. 서버 모듈/Prisma import는 그 이후에 한다.
- 로컬 설치 Prisma CLI의 JS 진입점(node_modules/prisma/build/index.js, prisma package.json의 bin)을 process.execPath로 실행해 migrate deploy를 하고, 성공 후 process.execPath로 --import ./tests/server/register-server-only.mjs --import tsx --test --test-concurrency=1 "tests/server/integration/*.test.ts"를 실행한다. shell:true나 문자열 결합으로 비밀 URL을 전달하지 않는다. Windows의 Node 22는 shell 없이 .cmd(node_modules/.bin/prisma.cmd, npx.cmd)를 spawn하면 EINVAL로 거부하므로 .bin 래퍼나 npx를 쓰지 않는다. register-server-only.mjs는 createRequire로 server-only의 실제 CommonJS 경로를 resolve하고, 그 경로의 require.cache에 loaded:true/exports:{}인 Module 한 개만 등록하는 테스트 bootstrap이다. ESM import와 CommonJS require 양쪽을 확인한다. React/Next나 다른 모듈은 대체하지 않는다. 이 shim은 별도 시험 process가 끝나면 사라지며 앱·빌드·test:web에서는 불러오지 않는다.
- support.ts는 test별 고유 project/user/token/board/template 식별자를 만들고 두 독립 Prisma 연결·barrier를 제공한다. createBoardService/createNextDeps/createToolDeps에 별도 client를 연결한다. 테스트 전용 transaction proxy는 실제 SQL을 실행하되 읽기 직후/쓰기 직전 barrier만 끼워 넣어 두 순서를 통제한다. query 결과나 CAS count를 가짜로 만들지 않는다. READ COMMITTED 경쟁 연결과 Serializable sync 경계를 명시한다. 테스트가 쓴 fixture만 정리하고 두 연결을 finally에서 종료한다. 기존 default 바인딩이 사용하는 singleton Prisma 연결도 시험 종료 때 disconnect하고, 전역 fetch/시계 대역은 restore한다. timeout으로 barrier 대기 실패를 명확하게 실패시킨다.
- 전역 --conditions=react-server는 사용하지 않는다. loadTurn → review-gate public index → client UI → next/navigation은 createContext를 사용하므로 그 조건의 React로는 node에서 로드할 수 없다. 로컬 Node 22.13.1에서 일반 React의 createContext는 function, react-server 조건에서는 undefined임을 확인했다. bootstrap이 없는 별도 process는 server-only import를 계속 거부해야 하며, bootstrap process는 일반 React를 유지해야 한다. runner가 이 조건을 확인하고 부적합한 실행 환경에서는 실패시킨다. 이 시험 shim으로 프로덕션 경계가 증명되는 것은 아니므로 verify:fsd/check/build를 별도로 통과해야 한다.
- runner의 validation/spawn 인자(두 spawn 모두 process.execPath, .cmd 없음)/실패 전 무실행/정리 규칙은 scripts/test-server-integration.test.mjs에서 DB 없이 시험한다. GitHub fetch 시험은 test:server, DB 시험은 integration만 사용하여 test:web가 DB 미설정으로 우연히 skip/pass하지 않게 한다.
- migration.test.ts는 검증된 test DB 안의 test별 임시 schema에 Project(id) 참조 표와 기존 prisma/migrations/20260903055754_agent_run/migration.sql의 실제 두 표를 구성한다. 이후 migration 중 이 두 표를 건드리는 것은 20260914090000_remove_individual_project_ownership_shadow의 LOCK TABLE뿐이라 두 표의 구조는 agent_run migration 그대로다. 같은 transaction/search_path에서 legacy run/step을 넣고 새 migration의 SQL statement를 적용한 뒤 기존 값·행 수·새 NULL/default/index를 확인한다. fixture schema 이름은 테스트가 생성한 안전한 식별자만 쓰며 transaction rollback으로 정리한다. runner의 전체 migrate deploy와 최신 Prisma client 검사는 빈 DB 경로를 별도로 검증한다. 업그레이드 시험을 단순히 최신 schema에 옛 모양 데이터를 insert하는 시험으로 대체하지 않는다.
- 실제 배포된 private DB 원본은 이 테스트로 증명할 수 없다. integration/templates.test.ts는 고유 lang fixture로 route body/status를 확인하고 정리한다. 실제 en seed 후 검증은 승인된 배포 환경의 별도 인수 절차다.

### 실행 명령

저장소 루트의 PowerShell에서 실행한다. 아래는 **구현 후 검증용**이며 이번 문서 대조에서는 실행하지 않는다. .env 내용을 출력하거나 운영 DB를 테스트에 사용하지 않는다.

~~~powershell
npm.cmd run db:generate
npm.cmd run sync:plugin-lib
npm.cmd run verify:fsd
npm.cmd run test:architecture
npm.cmd run test:web
npm.cmd run test
npm.cmd run test:server
npm.cmd run test:server:integration
npm.cmd run test:templates
npm.cmd run check
npm.cmd run build
~~~

test:server와 test:server:integration은 E1 이후에만 존재한다. TEST_DATABASE_URL은 담당자가 위 조건에 맞는 테스트 DB로 사전 설정한다. seed:templates는 실제 DB 쓰기이므로 이 회귀 명령 묶음에 넣지 않는다. D3 리허설(test:project-availability:d3:db)은 빈 격리 PostgreSQL 두 개가 필요한 수동 명령이라 이 묶음에 넣지 않지만, 새 migration 뒤 복구 migration의 순서가 바뀌므로(Affected Files의 보존 경계) E1 뒤 한 번 실행해 결과를 명령 표에 적는다. private 원본이 없으면 test:templates를 통과로 표시하지 말고 E2/E6 인수 미완료로 기록한다. 공개 CI는 private 원본/실DB 서비스를 제공하지 않으므로 현재 check green만으로 전체 DoD를 충족할 수 없다.

기존 실패와 신규 실패는 기준선으로 구분한다. 구현을 시작하기 전 기준 커밋에서 위 명령 가운데 이미 있는 것(test:server·test:server:integration 제외)을 실행해 결과를 Verification Results의 명령 표에 기준선으로 적는다. 구현 후 같은 명령의 결과와 비교해 기준선에서 이미 실패한 항목은 기존 실패로, 새로 실패한 항목은 신규 실패로 기록한다. 신규 실패가 남으면 완료로 보지 않는다.

db:generate와 build의 Prisma CLI는 prisma.config.ts를 읽으므로 DATABASE_URL 설정이 필요하지만 생성 자체는 DB 연결을 요구하지 않는다. 실DB 변경은 위 runner가 검증한 test URL로만 수행한다.

npm run check의 실제 구성은 plugin/lib 동기화 검사 → lint(ESLint/FSD) → next typegen → tsc --noEmit → architecture tests(scripts/*.test.mjs, 새 scripts/test-server-integration.test.mjs도 여기서 돈다) → test:project-availability다. CI(.github/workflows/check.yml)는 db:generate → check → test → test:web → build이며 test:server·test:templates·실DB 시험은 돌리지 않는다. build는 Prisma 생성 후 Next 빌드다. 새 test script JSON은 parser로 검사하고 테스트 파일 glob을 실제 Node 22에서 열거한다. fetch의 300초 옵션은 설치된 Next 가이드와 대조했으며 dev HMR/hard refresh를 production 캐시 증거로 사용하지 않는다.

## Verification Results

| 구분 | 이번 작업에서 확인한 사실 |
| --- | --- |
| 수정 전 상태 | 2026-09-10: 개선점 있음. 옛 29개 inventory, stale 위치, 미정 핵심 계약·실DB 검증·private 최종 산출물 연결을 발견. 2026-09-15: 개선점 있음. aee92b2 기준과 32개 목록, 사라지거나 옮겨진 소유자(sessionGate, deps.projectSync, membership, locked, CLAUDE.runbook.free.md, templates.ts 잠금 주석), 빠진 보존 계약(closeRuns, 닫힌 run의 마지막 말, advanceRun, handoffIsLive, guardUnavailable, 디스패치 상한, /api/runbook), 원장 소비부 세 곳(nextFor, lastClosedRun, changeUserPlan), 그 뒤 migration보다 앞에 정렬되던 migration 이름, 낡은 check·runner 설명, 어긋난 재현 근거, E6 목록에서 빠진 product-copy §12·§13·§14 목적지, 정해지지 않았던 F01의 MCP 오류 문장과 그 §12 소유자, 존재하지 않는 DoD 절 참조를 발견. 2026-09-15 재대조(같은 기준, 관점별 독립 재검증): 개선점 있음. D3 리허설 두 호출의 대상 프로젝트, F05 현재 입력의 note, plan_submit의 전진 경로, pipeline_next의 지연 전진(advancePipeline) 경로, discard의 호출자 CAS 토큰, 보고서를 보지 않는 현재 잘림 판정, E2의 verifyOk·recentSteps 누락과 turn.test.ts, verification.md 이중 분류, parseHarnessConfig의 다른 직접 호출자, T04의 응답별 필드, 대조 근거의 AgentRun 조회 목록을 발견. 2026-09-15 두 번째 재대조(같은 기준, fixture·진입점·목표 계약·문서 규칙 관점): 개선점 있음. 템플릿 형식과 어긋난 절(Proposal Size, 확인한 항목, 기존·신규 실패 구분, 명령 결과 표, 잔여 리스크·롤백, Completion 기록 칸, Review Checklist와 DoD), 아키텍처 트리에 없는 새 tests/ 루트, 처리가 적히지 않은 syncProject 입력 수 검사와 init 사전 검사, 템플릿 변경으로 닫힌 run의 마지막 말, @updatedAt 자동 갱신·인박스 statusSince, 세션 gate CAS 토큰 출처, 경쟁 사례를 담지 못하는 board-rules.test.mjs·owner-tools.test.mjs, E3에 빠진 propose-item 호출부를 발견. 2026-09-15 세 번째 재대조(같은 기준, 템플릿·라이브러리 동작·권한/멱등성/불변식 관점): 개선점 있음. 실패 처리가 정해지지 않은 별도 트랜잭션의 거절 감사, 재전송의 한도 소비, 적히지 않은 refused 경고 로그, key 없는 run과 마지막 말, 스텁 handoff 호출·dev 스텁 상한, 잘못 짚은 런북 절, 뒤집힌 A3 조건, product-copy에 없는 새 문장, capReason 규칙, github.ts 로그 검증, Windows에서 실패하는 prisma 실행 방식, dotenv 안내 줄을 발견. 2026-09-15 네 번째 재대조(같은 기준, 구현자 모호함·스키마/데이터 수명·문서 용어 관점): 개선점 있음. 재현되지 않는 커밋·파일 수, 새 migration 뒤 순서가 바뀌는 D3 복구 migration과 원장 필터를 모르는 D2 artifact 복구, 새 migration 전후로 달라지는 D3 cleanup 보고의 보존 데이터 fingerprint, 정해지지 않은 닫힌 run 응답·스코프 불일치 문장·project_sync 충돌 응답, 적히지 않은 FK 없음의 근거와 감사 행 누적, 단정한 SDD 인용, 고칠 대상에서 빠진 protocol.md·schema 주석의 원장·handoff 설명, 겹치는 용어, 인용하지 않은 선행 결정, 런북 번호 금지 시험과 표류 안내 문단을 발견. 2026-09-16 다섯 번째 재대조(같은 기준, 인용 전수·계약 전파·실행 가능성 관점): 개선점 있음. manifest 보강 뒤 99개로 남은 경계 안 변경 경로 수(실제 101개), §1로 잘못 짚은 product-copy 단일 출처 규칙, 적히지 않은 tests/server의 tsc·eslint 대상 여부, 일반적으로만 적힌 invariants.md verify 벽·protocol.md handoff 설명의 갱신, 정해지지 않은 F01 추출 뒤 오류 검사 순서, E3에서 지킬 E2의 원장 필터를 발견. 2026-09-16 여섯 번째 재대조(같은 기준, 직접 소비부·아키텍처 규칙·스키마 설명 관점): 개선점 있음. manifest와 보존 경계에서 빠진 board.ts 직접 소비부 세 곳, tests/server 배치와 fsd.md:173의 충돌, 현재 README.md와 어긋난 verification.md:92-101, 코드·범위 결정과 반대인 schema.prisma:198의 단일 open-run 주석을 발견. 2026-09-16 일곱 번째 재대조(구현 뒤, 산출물과 계약의 대조 관점): 개선점 있음. 계약이 요구한 support.ts·templates.test.ts의 부재, 실제 표가 아닌 임시 표로 만든 migration fixture, 승패가 고정되지 않아 양방향을 못 보던 경쟁 시험, prospective에서 빠진 board-history.test.ts, 구현 전 수로 남아 있던 path-set(212 → 230)과 문서와 어긋난 계산 스크립트, 두 곳에 나뉘어 서로 다른 말을 하던 명령 결과 표를 발견 |
| 코드 대조 | 기준 c5c15f6에서 서버 51개 목록 및 위 영향 manifest/직접 소비부를 정적으로 대조 |
| 원본 대비 보존 | 10개 F ID·등급·기여 기록 유지. owner/handoff/acceptedAt의 현재 정책을 범위 guard와 테스트에 반영. 2026-09-15에 판정 셋을 바꿈: F09 이미 충족, F04의 project_get 이미 충족, F06의 반려 시나리오 이미 막힘 |
| 구현 테스트 | T01~T10의 동작 재현, migration, lint/type/test/build를 이번 문서 작업에서 실행하지 않음 |
| 외부 상태 | 운영 DB·배포 Template·사용자 생성 파일·외부 GitHub 결과는 미검증. 배포 인수와 fixture 검증을 혼동하지 않음 |
| 로컬 본문 계산 | 2026-09-15 재계산: private en 원본 10개(CLAUDE.runbook.free.md 삭제됨)를 기존 core 함수(parseHarnessConfig, deliverable, buildVars, buildWorkspaceVars, renderTemplate)로 examples/apch/harness.json(workspace 3개, scout 설정)에 대해 free·pro·max 각각 init과 같은 순서로 메모리 렌더했다. 세 플랜 모두 미치환 {{ 0, 스텁의 ## step: 제목 0, CLAUDE.runbook.free.md 전달 0, receipt 언급 0. Free는 보고 에이전트 pm·feature-scout만 받는다. 새 계약 구현 시험이나 DB 인수는 아님 |
| 최종 정합성 판정 | 아래 재검토 근거와 최종 응답의 문서 SHA-256·무편집 결과를 함께 사용. 문서 편집만으로 clean을 선언하지 않음 |

명령 실행 결과. **이 표가 명령 결과의 단일 기준이다** — 같은 수치를 문서 두 곳에 적었더니 한쪽만 갱신돼 어긋났다(2026-09-16 일곱 번째 재대조에서 발견).

| 명령 | 기준선 | 구현 후 | 비고 |
| --- | --- | --- | --- |
| `npm.cmd run db:generate` | — | 통과 | 생성만 한다. 실제 DB migration 실행이 아니다 |
| `npm.cmd run sync:plugin-lib` | — | 통과 | `check`의 `plugin-lib --check`가 core/lib 일치를 확인 |
| `npm.cmd run verify:fsd` | 통과 | 통과 | `lint`에 포함 |
| `npm.cmd run test:architecture` | 통과 | 21개 통과 | runner의 URL 안전 검사·실행 순서 시험 포함 |
| `npm.cmd run test:web` | 277개 통과 | 290개 통과 | |
| `npm.cmd run test` | 149개 통과 | 151개 통과 | |
| `npm.cmd run test:server` | 새 명령 | 2개 통과 | 이력 조회 범위·GitHub 실패/빈 목록 |
| `npm.cmd run test:server:integration` | — | **미실행** | 검증된 `TEST_DATABASE_URL`이 없다. 파일은 작성했고 타입·린트만 통과했다 |
| `npm.cmd run test:templates` | — | private 24개 통과 | private 원본 필요 |
| `npm.cmd run check` | 통과 | 통과 | 2026-09-16 재실행에서도 통과: plugin-lib·lint·FSD·typegen·tsc·architecture 21·project-availability 17 |
| `npm.cmd run build` | — | 통과 | |
| `npm.cmd run test:project-availability:d3:db -- --allow-fixtures --baseline <40자 D2 commit>` | — | **미실행** | E1 뒤 수동. 빈 격리 PostgreSQL 두 개와 IPA_D3_REHEARSAL_DATABASE_URL·IPA_D3_RESTORE_DATABASE_URL 필요. 복구 단계 포함 |

실행한 검사에서 기준선 대비 신규 실패는 없다. `check`가 새 `tests/server/**`의 타입·린트를 보지만, 그것이 DB 실행 성공을 뜻하지는 않는다.

## Reconciliation Evidence

이 절은 High-Risk 검토의 Minimal Replay Anchor/Durable Receipt를 재구성할 수 있는 저장 근거다. **이 MD의 최종 SHA-256과 무편집 판정은 최종 응답과 짝을 이룬다.** 자기 해시를 본문에 넣는 순환을 피한다. 최종 응답이 없거나 소스 지문이 달라지면 기존 clean 결과를 재사용하지 않는다. 해시는 적용 기준의 동일성만 나타내며 완전성·정확성·결함 부재를 증명하지 않는다.

- Repository opaque identity: f7df32898cc5a30007dc3e6f(루트 커밋 id 문자열의 SHA-256 앞 24 hex); HEAD: c5c15f6563722876899d8fa836ce3292a6318a45. 2026-09-10 기록의 9facb7db567781ed63fc5933은 산출식이 남아 있지 않아 비교할 수 없다.
- Scope/profile: F01~F10, E1~E6의 구현 전 제안 정합성, High-Risk. 운영 배포 완료 판정 아님.
- Source bundle: 이 MD(untracked), related의 아키텍처 6개, 위 manifest에 명시한 계약·스키마·명령·템플릿 지침. tracked 근거의 identity는 HEAD + 경로이며 tracked 파일의 작업 트리 diff가 없음을 함께 확인한다(untracked는 이 MD와 이 제안과 무관한 .playwright-mcp/뿐). 이 MD와 아래 non-HEAD 근거는 별도 content identity다.
- Candidate closure: 아래 manifest로 230개 경로. path-set SHA-256: 14dfbc1e15c86c04c08a71a4a9d15c67abf6c8b6158b171589efe9db8c7c47c8. 2026-09-10 값(162개, 67b13d80…)과 다른 것은 그 뒤 코드 변경과 manifest 보강 때문이다. 2026-09-15 첫 대조 값(193개, 03d765b1…)에서 두 번째 재대조가 fixed에 propose-item.server.ts와 형식 기준으로 쓴 완료 제안서를 더해 195개(7559d538…)가 됐고, 세 번째 재대조가 installed에 runner가 쓰는 prisma의 package.json·JS 진입점과 dotenv의 package.json을 더해 198개(c69650df…)가 됐고, 네 번째 재대조가 fixed에 CONTEXT.md, 인용한 완료 제안서 넷, D3 cleanup·복구 스크립트와 복구 migration 이름을 가진 scripts/lib/project-ownership-recovery.ts, D3 phase 완료 제안서, manage-token.server.ts를 더해 208개(0d5adaad…)가 됐고, 다섯 번째 재대조가 fixed에 eslint.config.mjs를 더해 209개가 됐고, 여섯 번째 재대조가 fixed에 board.ts의 경계 밖 직접 소비부 세 곳을 더해 212개(1ffe43f7…)가 됐다. 212는 **구현 전에 센 수다.** 일곱 번째 재대조가 구현이 만든 파일(tests/server 아래 일곱 개, views.ts·views.test.ts, workspaces 세 개, 새 migration.sql, 새 폼 시험)과 그 뒤 더한 support.ts·templates.test.ts, prospective에서 빠져 있던 board-history.test.ts까지 반영해 230개가 됐다. 이 수는 이제 이 문서의 manifest를 직접 읽어 계산한다 — 목록을 계산 스크립트에 복사해 두었더니 문서(fixed 51)와 스크립트(fixed 48)가 어긋나 있었다. 추가·삭제도 비교한다. 이 수는 각각의 모든 줄을 독립 리뷰했다는 뜻이 아니라 재검토 경계의 파일 집합이다.
- Private 원본 기준: 657a50d7bbcc83a147e03f4ab7262a0f389b7e86, 해당 저장소 작업 트리 변경 없음. 상위 저장소에서는 ignored이므로 아래 파일별 지문도 필요하다.
- Persistence: 사용자가 지정한 이 제안서의 durable handoff 부록 + 최종 응답. 비밀값·원문 private 본문·절대 경로·remote URL은 기록하지 않았다.

### 반복 가능한 경계 manifest

~~~json
{
  "recipe": "safe-replay: recursive regular files under roots (missing roots are empty); exclude each .git directory; union fixed, installed, and existing prospective paths; repository-relative '/' paths; JS default ordinal sort; SHA-256 of UTF-8 paths joined by LF with one final LF",
  "roots": [
    "src/server",
    "packages/core",
    "plugin/lib",
    "plugin/templates",
    "src/fsd/widgets/turn-banner",
    "src/fsd/features/create-project",
    "src/fsd/features/review-gate",
    "src/fsd/pages/board-item",
    "prisma/migrations",
    "tests/server"
  ],
  "fixed": [
    "AGENTS.md",
    "docs/proposals/active/src-server-clean-code-findings.md",
    "docs/proposals/README.md",
    "docs/proposals/template.md",
    "docs/architecture/README.md",
    "docs/architecture/fsd.md",
    "docs/architecture/system-overview.md",
    "docs/architecture/protocol.md",
    "docs/architecture/invariants.md",
    "docs/architecture/verification.md",
    "docs/conventions/product-copy.md",
    "src/app/api/mcp/route.ts",
    "src/app/api/mcp/owner/route.ts",
    "src/app/api/templates/route.ts",
    "src/app/(app)/p/new/page.tsx",
    "src/app/(app)/p/[slug]/page.tsx",
    "src/app/(app)/p/[slug]/backlog/page.tsx",
    "src/app/(app)/p/[slug]/items/[key]/page.tsx",
    "prisma/schema.prisma",
    "prisma.config.ts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    ".github/workflows/check.yml",
    "scripts/plugin-lib.mjs",
    "scripts/plugin-lib.test.mjs",
    "scripts/seed-templates.ts",
    "scripts/lib/prisma.ts",
    "plugin/bin/harness-init.mjs",
    "plugin/bin/harness-init.test.mjs",
    "plugin/skills/init/SKILL.md",
    "plugin/skills/init/references/reconciliation-contract.md",
    "examples/apch/harness.json",
    "src/fsd/entities/board-item/index.ts",
    "src/app/api/runbook/route.ts",
    "scripts/rehearse-project-availability-d3.ts",
    "scripts/project-availability-runtime.test.ts",
    "src/fsd/features/propose-item/api/propose-item.server.ts",
    "src/fsd/features/edit-backlog/api/edit-backlog.server.ts",
    "docs/proposals/completed/2026-09-11-runbook-drift.md",
    "CONTEXT.md",
    "docs/proposals/completed/2026-09-05-agent-next-open-routing.md",
    "docs/proposals/completed/2026-09-09-session-approval-channel.md",
    "docs/proposals/completed/2026-09-10-configurable-pipeline.md",
    "docs/proposals/completed/2026-09-15-individual-project-availability.md",
    "scripts/lib/project-ownership-cleanup.ts",
    "scripts/restore-project-ownership-shadow.ts",
    "src/fsd/features/manage-token/api/manage-token.server.ts",
    "scripts/lib/project-ownership-recovery.ts",
    "docs/proposals/completed/2026-09-15-individual-project-availability-phase-d3.md",
    "eslint.config.mjs"
  ],
  "installed": [
    "node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md",
    "node_modules/next/package.json",
    "node_modules/react/package.json",
    "node_modules/typescript/package.json",
    "node_modules/@prisma/client/package.json",
    "node_modules/@prisma/adapter-pg/dist/index.mjs",
    "node_modules/server-only/package.json",
    "src/generated/prisma/client.ts",
    "src/generated/prisma/models/AgentRun.ts",
    "src/generated/prisma/models/AgentRunStep.ts",
    "node_modules/next/dist/shared/lib/app-router-context.shared-runtime.js",
    "node_modules/react/index.js",
    "node_modules/react/react.react-server.js",
    "node_modules/react/cjs/react.development.js",
    "node_modules/react/cjs/react.production.js",
    "node_modules/react/cjs/react.react-server.development.js",
    "node_modules/react/cjs/react.react-server.production.js",
    "node_modules/prisma/package.json",
    "node_modules/prisma/build/index.js",
    "node_modules/dotenv/package.json"
  ],
  "prospective": [
    "packages/core/workspaces.mjs",
    "packages/core/workspaces.test.mjs",
    "plugin/lib/workspaces.mjs",
    "src/server/mcp/views.ts",
    "src/server/mcp/views.test.ts",
    "scripts/test-server-integration.mjs",
    "scripts/test-server-integration.test.mjs",
    "tests/server/github.test.ts",
    "tests/server/board-history.test.ts",
    "tests/server/integration/support.ts",
    "tests/server/integration/agent-runs.test.ts",
    "tests/server/integration/board.test.ts",
    "tests/server/integration/project-sync.test.ts",
    "tests/server/integration/templates.test.ts",
    "src/fsd/features/create-project/ui/new-project-form.test.ts",
    "prisma/migrations/20260915090000_agent_receipts_and_callers/migration.sql",
    "tests/server/integration/migration.test.ts",
    "tests/server/register-server-only.mjs"
  ]
}
~~~

content identity는 각 파일의 원시 바이트 SHA-256이다. source bundle과 non-HEAD identity를 먼저 비교하고, 변경된 코드의 순수 함수라고 추측하여 자동 실행하지 않는다.

| non-HEAD 의존 경로 | SHA-256 |
| --- | --- |
| node_modules/@prisma/adapter-pg/dist/index.mjs | e6879b3429f9efade5696321da768476fd4710f2aff7de95c01cca15d6a8d1d1 |
| node_modules/@prisma/client/package.json | 974ee2fedaddb6f7707ba2dc0c4d95219be80d6e952034ba9d5d10c68eddc9a7 |
| node_modules/dotenv/package.json | 7e57c7c7b3c5fe5dd127091aeacadec3e144fd290988c61c184876c1b8bda819 |
| node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md | 30bc67649cbf64eca5f4666cfe631eede1d185747f0d4c1027a9e91d4422f765 |
| node_modules/next/dist/shared/lib/app-router-context.shared-runtime.js | a8fc13908648cc341f23235b5a3f1e854c59a99d6393633dd7752f9e06f13bde |
| node_modules/next/package.json | 3ae720e4b8cdad7503935b27b0d14e04390068bf10d6e685797ccf1044051967 |
| node_modules/prisma/build/index.js | 763611d694b08952ced7c5abb3b9d61906fed0a8997d9214ac918a43928e0fc8 |
| node_modules/prisma/package.json | e0d96b7612a7592e62b1e2ba5b40e686e96af588bf9dafe74799b99d0b31abed |
| node_modules/react/cjs/react.development.js | e7a035fea0b35de567a563966fdb5e05c01f01f8ff776770d3a44794990ba3d7 |
| node_modules/react/cjs/react.production.js | d348b80a78c8ea0bd02b1990c7b7b514f5c276f9e74fee6e3976297585385961 |
| node_modules/react/cjs/react.react-server.development.js | db0b3bdb71c5fd39a15f219a116b25c980c58bef26f54002dc3827fde596e79c |
| node_modules/react/cjs/react.react-server.production.js | e9a7a278f37772c63206c69a7fe0f9edfce65a3e89d859ca2ba6f2452c279b1e |
| node_modules/react/index.js | 60caffdecbdc5db3bc4ec4e83df9488345ccb271d07533b9210bf5750918d97e |
| node_modules/react/package.json | e40c3ed9b633c9ecf188e09a4be309780a1ea0a9c068278a30ff6a27e7b2dbb6 |
| node_modules/react/react.react-server.js | ced6f228807a193b8a0ec436304b96ca44492bae8899c3e84c2a88162843dc14 |
| node_modules/server-only/package.json | e4b0cc01e2e0349c51c694fa97d8a642eb8322521ca1444b20bd1842594b4339 |
| node_modules/typescript/package.json | 822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6 |
| plugin/templates/README.md | fca42060e121cc2acc01b550767564230e09dd039512e9fab3148da8a68339fe |
| plugin/templates/en/CLAUDE.runbook.md | 05c4439c7704f5cfb536f836bd51add7b2fd601665b2a6f9c25b2bf100ec07f7 |
| plugin/templates/en/agents/dev.md | 67b02e8c4f3c81dd5f94bd6bf1e3e65eb7dc57b9ccde8b98312f2fa078fed824 |
| plugin/templates/en/agents/doc-auditor.md | e73ceb6e43616160502531ebde4524e2ae6802f515e475fd2607b4fa664e4e9a |
| plugin/templates/en/agents/feature-scout.md | ed3506b09c66bd60d02f2d6c9597fd1eae1afe3dda83ef6b52436571c5144738 |
| plugin/templates/en/agents/plan-verifier.md | 29dc031200d4487dfb59adce0d0138a391ae188bc3b345aeb43ac1c55cff7ab4 |
| plugin/templates/en/agents/pm.md | 74e13cee3d07fc514f8b01305ce60cfaf647626bb0d5b4186ab5a2846eb6bb67 |
| plugin/templates/en/docs/agents/README.md | e17da96ac72c8cc12bed101d4a2473142d9f887378b55e1773a1008922cdc825 |
| plugin/templates/en/docs/plans/README.md | 9611697d7bd6becc20b7acdbc713a383f8af9685e14fb0b2c915f635b76eb452 |
| plugin/templates/en/docs/plans/template.md | 8a2618d453c7f63022b4b8a22cc56d5600d928aa6c1ba2e3786fd7eaa69a3266 |
| plugin/templates/en/docs/plans/verification-paths.md | 9dc3f3470169efae12a81cb9b095b15dced2847e1535516e2a555e645bc15725 |
| plugin/templates/templates.test.mjs | e59d185241491e176e501efcf1b25454d4d526ccd0c2b24764ad942b5fa066ac |
| src/generated/prisma/client.ts | cbf9bd063b8a148827d1396eac2f34e1924c52835d8de654b0228f6ef3ccbf15 |
| src/generated/prisma/models/AgentRun.ts | 337445d8aaa5f06fe8c3cdf8e3daef9412e0aa15eed7a2d51bd9164114b71577 |
| src/generated/prisma/models/AgentRunStep.ts | 6717496e1fb448f968505455cd087ab358e8afecec039bacc413f436225a9ea5 |

### 위험 경계별 closure와 제한

| 경계 | 서로 다른 대조 경로와 관측 결과 | recipe class / 후속 목적지 |
| --- | --- | --- |
| 원장·재전송 | src/server 및 turn-banner 파일 열거와 agentRunStep/steps/NextDeps 참조를 `rg --text`로 역추적: 쓰기 runs.ts/record(next.ts:134-137의 닫힌 run 분기도 이 함수로 쓴다), 증거 조회 verifyOk·recordValidation·submitReport·lastClosedRun(runs.ts:66), 마지막 행 조회 loadTurn·nextFor, 호출량 recentSteps, plan 변경 활동 changeUserPlan(project-availability-service.ts:86-96), 순수/실제 private harness 2곳 확인. turn-data.server.ts와 src/app/(app)/p/[slug]/page.tsx는 NUL 바이트 때문에 기본 검색이 건너뛰어 직접 열어 확인. 상태 변경 전이의 closeRuns와 닫힌 run의 마지막 말(next.test.ts run lifecycle)도 대조. 구조가 다른 경로로 Prisma 접근자(`.agentRun.`·`.agentRunStep.`의 조회·쓰기 메서드)를 다시 훑어 steps를 읽지 않는 AgentRun 조회를 모두 확인했다. runs.ts의 recentRuns(:34)·openRun(:37)·lastClosedRun의 run 행(:60)과 run.ts의 recentRuns(:79)는 F05·F03이 이미 다루는 커서·상한 경로다. 그 밖의 셋은 src/app/(app)/p/[slug]/page.tsx:17(열린 run으로 디스패치 표시), project-availability-service.ts:170(열린 run 수), run.ts:69(닫힌 doc-auditor·feature-scout run의 closedAt)이다. 프로젝트 보드 route를 manifest와 읽기/보존 경계에 넣었다. 닫힌 run의 마지막 말은 closedAt을 바꾸지 않으므로 이 조회들은 F05의 원장 필터 대상이 아니다(openRun·createRun이 revision을 함께 반환하는 변경은 E2). agentNext의 분기 전부(새 진입·재개·닫힌 run·handoff·분기 없음·requires 미충족·전진·done·템플릿 변경 닫힘·한도·상한·보고 에이전트)를 F05 1~9와 F06에 대응시켰고, 템플릿 변경 닫힘(next.ts:162-167)은 stepId가 템플릿에 없어 마지막 말 조건에서 빠짐을 확인 | safe-replay(경로·내용 비교); 새 동작 실행은 manifest-only T03/T05/T06 |
| 보드 무결성·인증 | boardItem writer 검색과 웹 humanTransition·approveGate·discardItem, agent tools, owner gate, pipeline 커서에서 역추적: writer transitionIn·discard·gate·submitPlan·recordValidation·submitReport + advanceRun의 pipeline 전이 + Serializable propose. 소유자 확인은 ownerUserId, 사용 가능은 available, agent/owner 서로 다른 토큰 경계. acceptedAt·channel·plan 이후 verify 조건·handoffIsLive 확인. CAS 토큰은 agent·pipeline이 방금 읽은 값, 사람 경로(웹 전이·discard·gate)가 호출자 expectedUpdatedAt(board.ts:172·:216·:245)이다. advanceRun은 propose·gate·recordValidation·submitReport와 pipeline이 아닌 transitionIn이 부르고, plan_submit은 planning의 transitionIn으로만 전진함을 확인. 구조가 다른 경로로 board.ts의 export 표면을 열거해 보드 쓰기 밖의 커서 진입점 advancePipeline(:371)과 그 호출자 pipeline_next(mcp/deps.ts:38·:48)를 찾았다. 진입점 역추적(웹 action propose-item·review-gate, MCP agent·owner 도구)으로 board.ts 밖 BoardItem writer가 없음을 확인했다. 읽기 export의 경계 밖 호출자는 프로젝트 보드 route(latestBoard), 백로그 route(backlogWithStatus), edit-backlog 삭제 guard(latestBoard) 세 곳이며 manifest·보존 경계에 넣었다. updatedAt 소비부 전수로 비교는 handoffIsLive 두 곳뿐이고 나머지는 CAS 토큰 왕복(inbox-card·reopen-actions·items page·owner-deps)과 표시(inbox-item.ts:94)임을, schema의 @updatedAt(schema.prisma:144)과 TIMESTAMP(3)을 확인 | safe-replay; real DB 경쟁 실행은 manifest-only T10 |
| workspace entitlement | schema unique(projectId,agent), core config/limits, MCP schema와 syncProject upsert의 저장 결과를 양방향 추적: 입력 개수와 저장 합집합이 다름, 거부 뒤 쓰기 0(project-sync-query.test.ts), D3 리허설의 두 호출(선택되지 않은 프로젝트는 접근 거부, 선택된 프로젝트는 유효 sync 성공)과 parseHarnessConfig의 직접 호출자(config.test.mjs, vars.test.mjs, src/server/agents/vars.test.ts, harness-init.mjs) 확인. config.mjs:22-37의 검사 순서와 그 순서를 고정하는 기대값이 없음(config.test.mjs:39·harness-init.test.mjs:170은 오류 하나짜리 fixture)을 확인 | safe-replay; T01/T07 |
| 공개 body·이력 | Prisma scalar/select/include → text(JSON.stringify), project_get의 PROJECT_GET_SELECT 명시 projection, 상세 row.id/cutoff(getWithHistory는 events·reports를 자르고 hasHistoryBefore는 transitionEvent만 봄), GitHub 결과→page→form 역추적. 현재 필드 목록과 빈 배열 합류 지점, backlogWithStatus→백로그 route, latestBoard→프로젝트 보드 route·삭제 guard의 내부 소비 모양을 확인 | safe-replay; T02/T04/T08 |
| private 산출물 | seed의 (lang,path), deliverable의 스텁·옛 Free 런북 제외, generator의 render/lock/runbook 보고 경로를 대조. en 10개, agent 5개, free·pro·max 모두 미치환 0·스텁 단계 제목 0·옛 Free 런북 전달 0. apch dev 이름은 web-dev/admin-dev/backend-dev. 다섯 에이전트의 단계·requires·on 분기를 steps.ts 규칙으로 전수 대조했고(자기 반복 없음, 실패 전용 hold는 진입 단계가 아님), 첫 `## step:` 앞 스텁 줄 수(dev 107, 상한 110)와 런북의 agent_next 위치(Before the cycle의 handoff, The cycle의 outcome 없는 재개)를 확인 | safe-replay(원본 동일성 확인 후 현재 core의 메모리 계산); A2/A3 인수는 manifest-only |
| migration·실행 명령 | migration 폴더 12개의 정렬과 새 이름의 위치, 기존 AgentRun migration과 이후 LOCK TABLE뿐인 변경, 현재 schema·generated model 목적지, package scripts(check의 test:project-availability 포함)·CI 단계·Node 22·server-only 조건 export를 대조. 일반 React를 유지하는 marker 전용 bootstrap의 CommonJS/ESM 동작은 2026-09-10에 별도 process로 확인했고, 2026-09-15에는 그 입력인 설치 파일 해시가 기록과 같음만 확인했다(재실행 안 함). MD front matter는 js-yaml로, script·manifest JSON은 JSON.parse로 확인. 설치본으로 adapter-pg가 40001·40P01을 쓰기 충돌로 바꿔 Prisma가 P2034로 내는 것, Node 22.13.1의 --test-concurrency와 test glob, 루트 package.json에 type이 없어 tsx가 .ts를 CJS로 읽어 server-only shim이 require.cache에 걸리는 것, Windows Node 22가 shell 없는 .cmd spawn을 거부하는 것과 prisma의 JS 진입점, dotenv 17.4.2의 기본 안내 줄과 quiet 옵션을 확인. D3 리허설의 migrateD3가 저장소 migration을 전부 적용해도 보존 표 snapshot 비교가 새 열에 영향받지 않는 순서(primary 비교 전에는 에이전트 행이 없고, restore의 두 snapshot은 모두 새 migration 뒤)와, 복구 스크립트가 cleanup migration을 이름으로 찾는 것, 복구 bundle이 20260914093000 복구 migration을 더해 deploy하므로 새 migration 뒤에는 이미 적용된 migration보다 이름이 앞선 미적용 migration이 되는 것, 보존 데이터 fingerprint(to_jsonb 전체 행)는 에이전트 행이 있으면 새 열 때문에 값이 달라지고 schemaFingerprint는 소유권 catalog만 보는 것을 확인. Prisma v7 문서(development-and-production)는 deploy가 미적용 migration을 적용하고 이력 차이를 경고하지 않는다고만 적으므로, 이름이 앞선 미적용 migration의 적용은 D3 리허설 전까지 미검증이다. 커밋 수와 경계 안 변경 경로 수는 Current State의 산출식으로 다시 셌다(2026-09-16에 지금 manifest로 다시 세어 103개). tsconfig.json include(**/*.ts)와 eslint.config.mjs의 ignore에 tests/가 없어 새 tests/server가 check의 tsc·eslint 대상임을, src/server 모듈이 이미 @/·@harness/core/ 값 import를 쓰고(runs.ts:4-6, deps.ts:2-11) test:web이 tsx로 불러오므로 새 시험도 같은 경로 해석을 받음을 확인 | safe-replay(구조 검사); migrate/seed/build/test의 실행은 manifest-only, 자동 replay 금지 |
| 문서 규칙·시험 fixture | docs/proposals/README.md의 필수 정보·template.md의 절과 이전 완료 제안서(completed/2026-09-11-runbook-drift.md)의 형식을 대조. docs/architecture/README.md 트리·fsd.md:173의 시험 위치 규칙·verification.md:92-101의 마이그레이션 주의를 새 tests/ 루트 및 현재 src/app 상태와 대조. README.md:40-42는 이동 완료, verification.md:94-96은 이동 전이라고 서로 모순하며, fsd.md는 모든 테스트를 대상 옆에 두라고 하므로 구현 묶음에 두 문서의 갱신을 추가했다. 기존 시험 전부에서 목표 계약이 바꾸는 기대값을 찾아 Affected Files·T 행과 대조(project-sync-query.test.ts의 빈 배열·verify:[], next.test.ts의 harness와 run lifecycle 기대값은 이미 목록에 있고, board-rules.test.mjs·owner-tools.test.mjs는 보존 회귀) | safe-replay(문서·시험 구조 비교) |
| 권한·멱등성·불변식 | invariants.md의 불변식 여덟과 보드 규칙 셋을 F01~F10 목표 계약과 대조(원장 추가만, 사람 게이트, 보고 추가만, 이력 창은 조회만). 외부 진입점별 권한 위치(agent_next receipt의 scope 확인, project_sync·backlog·pipeline_next의 guardUnavailable, 시험 runner의 TEST_DATABASE_URL 조건, GitHub 실패의 원시 정보 차단). 상태를 바꾸는 호출의 재전송·동시 요청·부분 실패(거절 감사 행 실패 포함). product-copy 머리말(:3-5)의 단일 출처 규칙과 §15의 capReason 규칙(:698). 로그(github.ts:36, next.ts:202-205)와 검증 목적지 | safe-replay(코드·문서 비교); 실행 확인은 manifest-only T05/T07/T08/T10 |
| 용어·선행 결정 | CONTEXT.md의 인수(:60), verification.md의 D3 receipt(:52·:55), protocol.md(:62 AgentRunStep, :133 커서, :175-178 handoff)와 schema.prisma:198·:215 주석을 새 용어·원장 의미와 대조. schema.prisma:198은 (project, agent, key)당 열린 run 하나라고 하지만 runs.ts:36-38은 부분 unique가 없어 여러 행을 허용하고 최신 openedAt을 고르며 Scope도 전역 단일 open-run 강제를 제외하므로, AgentRun 모델 주석 갱신을 E1에 추가했다. invariants.md의 verify 벽(:61-64 validation, :65-71 report)이 거절 감사 행을 모르는 문장임을 확인. 완료 제안서 agent-next-open-routing(진입 단계·not open), configurable-pipeline(전이 CAS 규칙), session-approval-channel(게이트 재전송·결정 원장 유보·F10 잔존), individual-project-availability SDD(최근 활동), runbook-drift(표류 안내 문단)와 대조. 구현자 관점으로 E1~E6을 따라가며 응답·문장·signature를 추측해야 하는 곳을 찾음 | safe-replay(문서·코드 비교) |

safe-replay의 심볼 검색은 src/server, 위 FSD/route, packages/core, plugin/bin, scripts, plugin/templates 범위에서 agentRunStep, steps, boardItem, NextDeps, agentNext, projectSync, syncProject, parseHarnessConfig, latestBoard, backlogWithStatus, getWithHistory, hasHistoryBefore, listPublicRepos, deliverable, planWrites, templatesFor, loadProjectView, lastClosedRun, closeRuns, handoffIsLive, advanceRun, recentSteps, verifyOk를 텍스트 모드(`rg --text` 또는 `grep -a`)로 각각 찾고 위 소유자/호출/검증 목적지에 대조한다. prospective 경로는 현재 부재도 기록하고, 새 tests/server 루트와 함께 이후 추가를 감지한다. AST/JSON/schema 구조 대조가 필요한 계약을 검색 결과만으로 통과시키지 않는다.

volatile-non-replayable: 운영 DB 격리/내용, 실제 배포 Template, 외부 GitHub, 사용자 로컬 생성물과 연결된 Claude 세션. 이번 근거는 이들 상태의 정상 동작을 주장하지 않는다. 배포는 별도 승인·대상 확인 후 A1~A5와 DoD로 인수한다. 후보 경계 밖인 결제/관리자 플랜 갱신 직렬화·OAuth 변경·임의 UI 재설계·사용자 수정 파일 자동 교체는 Scope의 보존/제외 결정에 따라 직접 시험에서 제외한다.

무편집 최종 패스는 저장된 이 절을 포함한 문서 전체, F01~F10 → E1~E6 → T01~T10/A1~A5 → DoD의 전파를 다시 확인해야 한다. 현재 함수에 대한 정적 근거와 아직 존재하지 않는 목표 심볼을 혼동하지 않는다. 후속 구현 승인 전 상태는 계속 pending이다.

## Review Coverage and Decisions

다음은 **2026-09-07 최초 리뷰의 이력**이다. 현재 51개 파일을 다섯 에이전트가 재검토했다는 주장이 아니다. 원시 17건 → 정규 10건, 실질 중립 심사 2회, 최초 pending-verification/기각 없음. TS-01의 replace 권고는 upsert 보존·합집합 상한으로 수정한 후 병합했다. TS-04의 최종 Must는 예약 이름이 템플릿 선택을 바꾸는 영향에 따른 것이다.

| 관점 | 상태 | 채택 기여 |
| --- | --- | --- |
| Cohesion | 2026-09-07 Completed · 29/29 | F01, F02 |
| Coupling | 2026-09-07 Completed · 29/29 | F03, F04 |
| Predictability | 2026-09-07 Completed · 29/29 | F03, F05, F06, F07, F08 |
| Readability | 2026-09-07 Completed · 29/29 | F05, F07, F09 |
| TypeScript generalist | 2026-09-07 Completed · 29/29 | F01, F03, F05, F07, F10 |

최종 원시 ID → 정규 ID 매핑과 판정:

| Raw ID | 최초 등급 | 최종 disposition | Canonical ID | 최종 등급 |
| --- | --- | --- | --- | --- |
| COH-01 | Must | accept | F01 | Must |
| COH-02 | Should | accept | F02 | Should |
| CPL-01 | Must | accept | F03 | Must |
| CPL-02 | Should | accept | F04 | Should |
| PRE-01 | Must | accept | F05 | Must |
| PRE-02 | Must | accept | F06 | Must |
| PRE-03 | Must | accept | F07 | Must |
| PRE-04 | Must | merge-accept(F03) | F03 | Must |
| PRE-05 | Should | accept | F08 | Should |
| READ-01 | Must | merge-accept(F05) | F05 | Must |
| READ-02 | Must | merge-accept(F07) | F07 | Must |
| READ-03 | Consider | accept | F09 | Consider |
| TS-01 | Must | merge-accept(F07) | F07 | Must |
| TS-02 | Must | merge-accept(F05) | F05 | Must |
| TS-03 | Must | accept | F10 | Must |
| TS-04 | Should | merge-accept(F01) | F01 | Must |
| TS-05 | Must | merge-accept(F03) | F03 | Must |

## Risks and Rollback

잔여 리스크:

- legacy 호출자의 실제 귀속은 복원 불가능하다. F03의 짧은 보수 집계 창과 NULL 보존이 해결책이며 과거 정확도를 주장하지 않는다.
- receipt는 cursor 소비를 보호할 뿐 실제 에이전트가 작업을 수행했는지 암호학적으로 증명하지 않는다. 동시 열린 run 정리, 동일 step 이름으로 내용만 바뀐 템플릿의 버전 고정, 완전한 병렬 rate-limit은 별도 문제다. 이번에는 템플릿 그래프를 보존하고 T05로 명시한 보장만 주장한다.
- DB/배포 인수는 실제 실행 때 확인해야 한다. 격리·barrier·실제 rollback 관측 없이 순수 테스트 green을 경쟁 해결 증거로 쓰지 않는다.
- test:server(tests/server/github.test.ts 등)는 DB도 private 원본도 필요 없지만 CI 단계(.github/workflows/check.yml)에 없다. E6에서 로컬 실행 결과를 첨부하며, CI에 넣을지는 이 제안의 범위 밖이다.
- 새로운 오류/DTO가 외부 클라이언트에 미칠 영향은 fixture만으로 모두 알 수 없다. 공개 필드 보존, stale 재조회, 무receipt 거절의 복구 안내를 인수한다.
- 단조 updatedAt은 인박스 statusSince 같은 표시 시각을 몇 ms 앞당길 수 있다(F10). 판정에 쓰는 비교는 handoffIsLive뿐이며 T10에서 확인한다.
- dev 스텁의 여유가 3줄(107/110)이라 receipt 문장을 넣다가 templates.test.mjs의 상한을 넘을 수 있다. 문장을 바꿔 써도 넘으면 구현 전에 재검토한다.
- 거절 감사 행은 지우지 않으므로 계속 쌓인다(불변식 8). 지금도 outcome 호출마다 행이 남고 호출 한도(60회/10분)가 증가 속도를 묶으며, 행은 Project·User cascade로만 지워진다. 보존 기한은 이 제안의 범위 밖이다.
- IPA D3 복구는 D2 artifact로 되돌린다(docs/proposals/completed/2026-09-15-individual-project-availability-phase-d3.md:252, docs/proposals/completed/2026-09-15-individual-project-availability.md:860-861). 그 artifact는 원장 필터를 모르므로, E2 배포 뒤 거절 감사 행이 생긴 DB에서 이 복구를 쓰면 아래 롤백 금지와 같은 문제가 된다. 새 migration 뒤 복구 migration의 적용 순서도 E1 뒤 D3 리허설 전에는 확인되지 않는다(Affected Files의 보존 경계).
- 문서 정합성 결과는 명시한 기준과 범위에 한정된다. 이후 코드/제안/ignored 원본 변경이나 새 모순이 발견되면 재대조한다. 해시 일치는 결함 부재의 증명이 아니다.

롤백 방법:

- 추가형 migration은 롤백할 때도 새 열과 원장을 삭제하지 않는다. 원장 필터를 모르는 구버전 서버로 그대로 되돌리면 accepted:false가 검증/배너로 해석될 수 있으므로 금지한다. 장애 시 상태 변경 경로를 중지한 뒤 새 원장 필터·receipt 검사를 보존하는 수정 버전으로 복구한다. IPA D3 복구의 D2 artifact 배포도 이 금지에 해당하므로, E2 배포 승인 때 승인자가 D3 복구 경로를 닫을지 원장 필터를 보존한 복구용 build를 따로 둘지 정한다. 운영 중지/배포 자체는 별도 승인 범위다.
- 템플릿은 서버 계약과 일치하는 버전으로 복구한다. 스텁만 옛 버전으로 돌려 무receipt outcome을 다시 허용하지 않는다. core 원본을 복구하면 plugin/lib 복사본도 동기화한다. 사용자 수정 생성 파일은 보존한다.
- 문서만 되돌릴 때는 docs/architecture·product-copy의 변경을 코드 변경과 같은 커밋 단위로 되돌려 계약 문서와 구현이 어긋나지 않게 한다.

## Completion or Closure Notes

2026-09-16 구현 뒤에는 실제 DB 검증과 배포 인수가 남아 있어 pending / approved로 두었다. 2026-09-23 사용자 지시로 completed로 옮긴다. **Review Checklist의 DoD를 모두 채워서 옮기는 것이 아니다.** 아래 remaining follow-up의 검증은 실행하지 않았고, 통과했다고 주장하지 않는다. 이 문서에서 코드로 할 일은 끝났고, 남은 것은 격리 DB와 배포 환경이 있어야 하는 검증뿐이다. 그래서 실행 대기 제안서가 아니라 수행 기록으로 둔다. `user-scoped-project-identity`도 같은 방식으로 `test:server:integration`을 미실행으로 적은 채 완료됐다.

완료 기록:

- completed-at: 2026-09-23
- verification-summary: front matter 참조. 명령별 결과는 Verification Results의 명령 표가 단일 기준이다.
- implementation PR/commit: PR #45(`harness/server-clean-code`, 구현 커밋 `60070e0`). private 템플릿 변경은 별도 저장소에 있다.
- changed files summary: 48개 파일, +2330/−645. 추가형 migration과 격리 DB 실행기(E1), receipt에 묶인 outcome 원장(E2), 보드 writer CAS(E3), 공통 workspace 의미 검증과 합집합 상한(E4), 잘림 판정·MCP DTO·GitHub 빈 목록 구분(E5), 문서와 private 템플릿(E6). 자세한 내용은 Implementation Results.
- remaining follow-up(미실행 — 통과로 읽지 않는다):
  - `npm run test:server:integration`을 격리 PostgreSQL(`TEST_DATABASE_URL`)에서 실행하고, T02/T03/T05/T07/T10의 전체 경쟁·경계 매트릭스와 대조한다. 지금 suite에는 대표 시나리오만 있다.
  - 빈 격리 DB 두 개로 D3 복구 리허설을 실행한다. 복구 migration(20260914093000)이 이름이 뒤인 20260915090000 뒤에 적용되는지를 아직 검증하지 않았다.
  - A1~A5: 실제 템플릿 route·브라우저·배포 순서 인수(추가 열 적용 → 새 writer/증거 필터 → private seed → managed init)를 한다.
  - 롤백 제한은 그대로다. 거절 원장을 증거로 읽는 구버전 writer로 되돌리지 않는다.

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

문서 점검(template.md 항목):

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`의 `pending`이다.
- [x] `stage`는 pending 문서에서만 사용했다(`approved`).
- [x] `approved-by`, `approved-at`, `approval-scope`에 실제 대화의 승인 범위를 기록했다.
- [x] `proposal-size`는 `standard`이고, standard 강제 조건(마이그레이션·API 계약·5개 초과 파일)에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다(Scope).
- [x] 영향 파일별 작업(수정·신규·보존 회귀)과 판단 근거(F01~F10 절)가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다(Safety Analysis의 확인한 항목).
- [x] 검증 명령과 성공 기준이 적혀 있다(T01~T10, 실행 명령).
- [x] 실행한 검사에서 기존 기준선 대비 신규 실패가 없다. 실제 DB 검증과 수동 인수는 미실행으로 구분했다.
- [x] 잔여 리스크를 명시했다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다. — pending이라 아직 해당 없음.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다. — pending이라 아직 해당 없음.

정합성 대조 기록:

- [x] 최초 리뷰 이력과 현재 대조 기준을 분리했다.
- [x] F01~F10의 계약·직접 호출부·실패 경로·작업·테스트 목적지를 연결했다.
- [x] schema/legacy 처리·receipt 전환·DTO 필드·upsert 보존·실DB 실행 계약을 명시했다.
- [x] owner MCP, handoff 배너, validation의 plan 시각, acceptedAt/reopen을 보존 대상에 포함했다.
- [x] 생성 원본·복사본·스텁·런북·최종 JSON과 private/운영 인수의 경계를 구분했다.
- [x] 2026-09-15 기준(c5c15f6)으로 옮겨진 소유자, 늘어난 원장 소비부, 새 보존 계약, 이미 충족된 항목, migration 정렬 순서를 재대조했다.
- [x] 같은 기준에서 관점별 독립 재검증으로 D3 리허설 호출 대상, 현재 입력의 note, plan_submit 전진 경로, pipeline_next 지연 전진 경로, discard CAS 토큰, 잘림 판정의 보고서 조건, E2 목록, verification.md 분류를 바로잡았다.
- [x] 두 번째 재대조로 템플릿 형식, tests/ 루트의 트리 반영, 입력 수·init 사전 검사 처리, 템플릿 변경으로 닫힌 run, @updatedAt 자동 갱신, 세션 gate 토큰, 보존 회귀 시험의 역할, propose-item 호출부를 바로잡았다.
- [x] 세 번째 재대조로 거절 감사 실패 처리, 재전송의 한도 소비, refused 경고 로그, key 없는 run, 스텁 handoff 호출·dev 스텁 상한, 런북 절, A3 조건, product-copy §10·capReason 규칙, github.ts 로그 검증, Windows prisma 실행·dotenv 안내 줄을 바로잡았다.
- [x] 네 번째 재대조로 커밋·파일 수 산출식, D3 복구 migration 순서와 D2 artifact 복구, cleanup 보고의 보존 데이터 fingerprint, 닫힌 run 응답·스코프 불일치·project_sync 충돌 응답, callerTokenId FK 근거와 감사 행 누적, SDD 인용, protocol.md·schema 주석, 용어 구분, 선행 완료 제안서 인용, 런북 시험 규칙을 바로잡았다.
- [x] 다섯 번째 재대조로 경계 안 변경 경로 수, product-copy 단일 출처 규칙의 위치, tests/server의 tsc·eslint 대상 여부, invariants.md·protocol.md의 갱신 문장, F01 오류 검사 순서, E2·E3가 함께 고치는 증거 writer를 바로잡았다.
- [x] 여섯 번째 재대조로 board.ts 직접 소비부 세 곳의 manifest·보존 계약, tests/server의 아키텍처 위치 규칙, verification.md의 낡은 app migration 설명, AgentRun의 다중 open-run 주석을 바로잡았다.
- [x] 일곱 번째 재대조(구현 뒤)로 계약이 요구한 support.ts·templates.test.ts를 채우고, migration fixture를 실제 표로 바꾸고, 경쟁 시험의 승패를 고정하고, manifest의 누락 경로와 구현 전 수로 남아 있던 path-set(212 → 230)을 다시 세고, 명령 결과 표를 한 곳으로 합쳤다. 새 시험은 아직 실행되지 않았다 — 타입·린트만 통과했다.

구현 완료 조건(DoD):

- [ ] E1~E6 구현 및 T01~T10 실행 결과 기록. 기준선 대비 신규 실패 없음.
- [ ] 원장 증거 소비부 여섯 곳(verifyOk, recordValidation, submitReport, loadTurn, nextFor, 닫힌 run 종료 판정)이 거절 증거를 제외하고 legacy를 보존함을, 그리고 recentSteps·changeUserPlan은 거절 행도 셈을 실제 DB에서 확인. 테스트 bootstrap의 범위 제한·일반 React 유지와 shim 없는 앱 경계 검증도 확인.
- [ ] receipt 순차/동시 재전송과 보드의 양방향 경쟁·같은 ms 갱신에서 패자 부수효과 없음 확인. 거절 감사 행 쓰기 실패 시 원장·커서·refused 불변.
- [ ] Workspace 합집합·language·lastSyncedAt 원자성, DTO 기존 필드, 이력 rowId와 보고서를 포함한 잘림 판정, GitHub 두 문구/수동 제출, product-copy §10·§12·§13·§14 문장과 실제 문자열 일치 확인.
- [ ] core/lib 일치, dev 스텁 110줄 상한 통과, 실제 private 스텁·서버 본문·Free 플랜의 보고 에이전트 제외와 옛 CLAUDE.runbook.free.md 미전달·사용자 수정 파일 보존 확인.
- [ ] 모든 공통 검증 통과 또는 승인된 예외 기록. private/실DB 미실행을 공개 CI green으로 대체하지 않음. docs/architecture/README.md의 tests/ 트리, fsd.md의 일반 공존·tests/server 위치 규칙, verification.md의 새 스크립트 행과 현재 src/app migration 설명이 실제 저장소와 일치.
- [ ] D3 리허설(test:project-availability:d3:db)이 새 migration을 포함한 상태에서 복구 단계까지 통과. 배포 인수에서 migration·server·seed·init 순서, 구버전 writer 부재, D3 복구 경로에 대한 승인자 결정 확인. 구현/검증 후에만 완료 처리.

## Implementation Results — 2026-09-16

### 실행 범위와 상태

- 사용자의 “해당 문서를 바탕으로 실제 코드 수정을 진행하라” 요청으로 구현했다. 공개 저장소 브랜치는 `harness/server-clean-code`, 시작 HEAD는 `c5c15f6563722876899d8fa836ce3292a6318a45`다. 시작 시 추적 파일 변경은 없었고 `.playwright-mcp/`·활성 제안서는 기존 untracked 상태였다.
- private 템플릿 시작 HEAD는 `657a50d7bbcc83a147e03f4ab7262a0f389b7e86`이고 작업 트리가 깨끗함을 확인한 뒤 수정했다. 공개 저장소와 별도 작업 트리이므로 함께 인수해야 한다. 커밋·푸시·운영 migration·seed·배포는 수행하지 않았다.
- **실제 DB 검증은 사용자 요청으로 후속 진행한다.** `TEST_DATABASE_URL`이 없는 상태에서 운영 `DATABASE_URL`을 대체 사용하지 않았다. 아래 통합 테스트 파일을 작성했지만 실제 PostgreSQL에서 통과했다고 주장하지 않는다. pending / approved를 유지한다.

### 구현 내용

- **E1:** revision·callerTokenId·receiptRevision·accepted의 추가형 migration과 Prisma client 생성, 일반 React를 유지하는 server-only marker bootstrap, 안전한 DB URL 검증·migration 후 직렬 테스트 실행기를 추가했다. 테스트 위치와 스크립트를 아키텍처 문서에 반영했다.
- **E2:** 모든 outcome에 receipt를 요구하고, scope 확인 후 run CAS·원장·전진/닫기·refused 증가를 한 트랜잭션으로 처리한다. 수락한 호출마다 revision을 바꾸며 stale/closed 시도는 거절 감사로 남긴다. callerTokenId 집계와 여섯 증거 조회 필터를 갱신했다. 템플릿에서 사라진 단계의 outcome은 실행 닫기와 거절 감사를 함께 저장하므로 감사 실패 시 닫기도 롤백된다. 본문용 변수 조회 후 새 Facts로 requires를 마지막으로 확인한다. private 스텁·본문·런북·보고 지침과 harness를 갱신했고 그래프와 110줄 스텁 상한은 유지했다.
- **E3:** 보드 writer에 id/updatedAt/읽은 status/discardedAt 조건과 단조 timestamp를 적용했다. 보고는 report 생성 전에 보드 버전을 선점한다. 뒤의 실패 결과도 트랜잭션 내부 예외로 바꾸어 앞선 쓰기를 롤백한다. pipeline cursor CAS 실패도 앞선 쓰기를 커밋하지 않는다. 기존 export를 유지하는 `createBoardService`를 추가했다.
- **E4:** `workspaces.mjs/validateWorkspaceSemantics`가 공통 의미 규칙을 소유한다. raw parser는 생략값 정규화 callback을 넘겨 이전 오류 순서를 보존한다. MCP와 직접 sync 호출 모두 검증하며 Serializable 트랜잭션에서 저장 roster와 입력의 합집합을 검사한다. 오류는 생략한 agent가 삭제되지 않음을 설명한다. `createToolDeps`를 추가하고 core 배포 복사본을 동기화했다.
- **E5:** 화면이 읽은 BoardItem ID로 events/reports의 cutoff 이전 존재 여부를 검사한다. MCP 전용 backlog mapper는 기존 공개 필드를 보존하고 내부 board query는 유지한다. GitHub 결과는 정상 빈 목록과 실패를 구분하며 실제 SSR 문구·URL 입력을 시험했다. F09와 이미 충족된 project_get 조회 정책은 유지했다.

### 실행 결과

명령별 기준선과 구현 후 결과는 **Verification Results의 명령 표** 하나에 적는다. 여기에 같은 표를 또 두었더니 한쪽만 갱신돼 서로 다른 말을 했다. 그 표에 없는 것만 적는다: `git diff --check`는 공개·private 양쪽 통과. `npm run test:server:integration`과 D3 복구 리허설은 사용자 요청으로 미실행이다.

### 남은 검증과 인수

- 작성된 integration suite는 두 연결의 receipt CAS/최종 outcome, 원장 실패 롤백, 호출자·legacy 증거, 보드 계획 경쟁/이벤트 실패, workspace 동시 추가와 합집합 상한, 이전 열 값을 보존하는 migration fixture를 포함한다. 실제 DB에서 실행하고 T02/T03/T05/T07/T10의 전체 경쟁·경계 매트릭스를 대조해야 한다. 현재 일부 대표 시나리오를 작성한 상태이며 전체 매트릭스 완료 표시는 하지 않는다.
- 서로 다른 빈 DB 두 개로 D3 보상 migration 순서와 복구를 검증한다. 실제 템플릿 route·브라우저·배포 순서의 A1~A5 인수도 남아 있다. SSR 및 단위 테스트로 이를 대체하지 않는다.
- 배포는 추가 열 적용 → 새 writer/증거 필터 → private seed → managed init 순서로 함께 인수한다. 기존 사용자 수정 파일은 자동 덮어쓰지 않는다. 거절 원장을 증거로 오해하는 구버전 writer로 되돌리지 않는 롤백 제한은 유지한다.
