---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'compact'
test-levels: ['end-to-end', 'contract']
test-tools: ['MCP JSON-RPC over HTTP', 'Playwright', 'node --test', 'prisma', 'next dev']
created-at: '2026-09-07'
completed-at: '2026-09-07'
last-executed-at: '2026-09-07'
tested-revision: 'stagekeeper aa683a2(harness/human-checkpoint-consistency, dev 머지 포함) + 작업 트리 수정 2건(F-A·F-B) / private templates 59b6ffd(시드됨) / 웹 프로젝트 harness-smoke'
owners: ['Sangeok']
related:
  - 'docs/proposals/completed/2026-09-07-human-checkpoint-consistency.md'
  - 'docs/test-reports/completed/2026-09-06-template-change-cycle-regression.md'
primary-area: 'pipeline/human-checkpoints'
observed-environments: ['Windows 11 · Node 22.13.1 · next dev(localhost:3000) · Neon Postgres(us-east-2) · Playwright(Chromium)']
test-summary: '인수·핸드오프·검증 벽·Reopen 4항목과 부수 6항목 전부 PASS. 실행 중 결함 2건 발견·수정(게이트 2 카드 도움말 누락, Inbox 탭 배너).'
follow-up:
  - '[열림] 에이전트 실행(claude -p)으로 템플릿 지시 — dev의 handoff outcome, 런북 7단계의 인수 report_submit, B-1의 planCommit 대조 — 가 실제로 따라지는지는 미확인. 다음 템플릿 변경 사이클에서 함께 본다'
  - '[열림] F-A 수정(카드 도움말 문장)은 코드·타입·lint로만 확인했고 브라우저 재확인은 하지 않았다'
---

# 사람 확인 지점 서버 일관성 — 사이클 회귀 확인

## Summary and Decision

제안서 `human-checkpoint-consistency`(Phase 1–4)가 만든 네 가지 — 인수 기록(`acceptedAt`), 커밋 핸드오프
outcome, `validation_record`의 plan-verifier 벽, `done`에서의 Reopen — 를 **실제 서버·DB·웹**에서 한 사이클로
확인했다. 에이전트는 사람이 대신 불렀다(MCP JSON-RPC로 도구를 직접 호출). 물은 것은 하나다 — **서버가 새
규칙대로 기록하고 거부하며, 배너·항목 상세가 그 기록을 읽는가.**

**결과: 전부 통과.** 다만 실행 중 결함 둘을 잡아 같은 트리에서 고쳤다 — 승인된 카피 한 문장이 코드로
옮겨지지 않은 것(F-A)과, Inbox 탭에서 인수·핸드오프뿐인 차례가 "Waiting on you"만 남기고 설명을 잃던
것(F-B). 둘 다 단위 테스트가 볼 수 없는 종류였다.

## Scope and Criteria

| ID | 확인 항목 | 통과 기준 |
| --- | --- | --- |
| R1 | 커밋 핸드오프 | `agent_next({ outcome: "handoff" })`가 원장 행 1개만 남기고 같은 단계에 머문다(전진·분기·거부 카운트 없음). 배너가 "waiting for your commit"과 경로 줄을 보인다. outcome 없는 재호출이 같은 단계 본문을 준다 |
| R2 | 검증 벽 | plan-verifier의 `verify` ok가 마지막 `plan_submit` 뒤에 없으면 `validation_record`가 고정 문구로 거부, 있으면 통과. 계획서 재제출 뒤에는 옛 통과가 셈에서 빠진다 |
| R3 | 인수 기록 | `done`에서 `report_submit(main-loop)`이 `acceptedAt`을 찍는다. 그 전 배너는 "needs acceptance"·step 7 줄·항목 버튼, 그 뒤 "Nothing open". 항목 상세에 Accepted 시각과 "Acceptance record" 라벨 |
| R4 | Reopen | 항목 상세의 Reopen implementation(노트 필수)이 `done → implementing`으로 옮기고 `acceptedAt`·백로그 `removedAt`을 null로 되돌린다. `results`에 `Reopened: <note>`가 붙는다 |

부수: 게이트·Reopen이 에이전트 토큰에 없다 · 게이트 2 카드 링크가 기록된 커밋을 연다 · done·핸드오프 항목은 Inbox
카드가 아니다 · 버튼 목적지 규칙(Inbox에 카드가 없으면 항목 페이지).

제외: 실제 에이전트 실행(템플릿 지시 준수), 커밋의 GitHub 실재(가짜 sha), on_hold 경로, journey(PR #19가 제거).

## Test Target

- Working tree: `aa683a2` + F-A·F-B 수정 2파일(`inbox-card.tsx`·`turn-banner.tsx`)과 카피 한 줄. 실측 도중
  다른 세션이 Phase 4를 커밋하고 `dev`를 머지했다(`06bead4`·`3eccc7f`) — 머지 뒤 상태로 `test:web`·`check`를 다시 돌렸다.
- API: 로컬 `next dev`의 `/api/mcp`(mcp-handler streamable HTTP). 인증은 `.env`의 프로젝트 토큰 하나(값은 기록하지 않는다).
  `initialize` → `notifications/initialized` → `tools/call`. 거부는 `isError` + `{"error": <reason>}`.
- Web: Playwright(Chromium 1180×900). 인증은 `AUTH_SECRET`으로 민팅한 세션 쿠키 — 값은 파일로만 다뤘고 끝나고 지웠다.
- Environment limitations: dev 서버가 옛 Prisma 클라이언트(`acceptedAt` 이전)를 물고 있어 실측 전에 재시작했다(소유자 허락).

## Preconditions and Test Data

- 백로그 `FEAT-90`("Phase 5 cycle regression")을 `harness-smoke`에 직접 삽입(roster: `dev`). 커밋 sha는 `1111…`·`2222…`(계획서 A·B),
  `3333…`(구현), `4444…`(인수) — 서버는 GitHub와 대조하지 않으므로 형식만 맞춘 값이다.
- 배너 확인용으로 기존 `FEAT-02`의 `acceptedAt`을 두 번 잠시 null로 돌렸다가 원래 값(`2026-09-01T13:09:27.960Z`)으로 복구했다.
- Cleanup rule: 끝나면 `FEAT-90` 백로그 삭제(BoardItem·events·reports 연쇄) + 그 key의 AgentRun 삭제, 카운트 0 확인.

## Test Matrix

| ID | 기준 | Gate | 시나리오 | 기대 | 실제 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | dev `agent_next` → `plan`에서 열림 → `handoff`(note `docs/plans/FEAT-90.md`) → outcome 없이 재호출 | 원장 `plan:handoff` 1행, run은 `plan`·열림·refused 0, 보드 `planning`. 응답 접두 "(handoff recorded — …". 재호출은 맨 본문 | 전부 일치. 배너 "FEAT-90 is waiting for your commit" · 줄 `Commit docs/plans/FEAT-90.md, then continue the runbook for FEAT-90.` · **Open FEAT-90**. 항목 페이지 스트립은 링크 없음, Backlog 탭 스트립은 `Open FEAT-90 →` | `PASS` |
| T2 | R2 | `required` | `plan_submit`(A)·`in_review` 뒤 verifier 전 `validation_record` → verifier 4단계 → 재호출 → `plan_submit`(B) → 재호출 → verifier 2회차 → 재호출 | 거부 → 통과 → 거부 → 통과 | 거부 문구 `no plan-verifier pass recorded after the last plan_submit — dispatch plan-verifier, then record the validation` 그대로. 원장에 verifier run 2개(각 `start·read·verify·report` ok), validation 이벤트 2개 | `PASS` |
| T3 | R3 | `required` | dev `implement → verify → report`, `report_submit(dev)`, `done` → 배너·항목 확인 → `report_submit(main-loop)` → 재확인 | 인수 전: "FEAT-90 needs acceptance"·step 7 줄·Open FEAT-90, 헤더에 Accepted 없음. 인수 뒤: `acceptedAt` = 보고 시각, 배너 "Nothing open", 헤더 `Accepted 2026-09-07 13:10`, Documents에 "Acceptance record ↗" → `blob/4444…` | 전부 일치. `board_get.acceptedAt = 2026-09-07T13:10:37.315Z` = 보고 `at`. Documents 순서 Plan · Acceptance record · Implementation report | `PASS` |
| T4 | R4 | `required` | 항목 상세 **Reopen implementation** → 노트 입력 → 확인 | 토스트 "Reopened · FEAT-90 is implementing", 칩 Implementing, `results` 끝에 `Reopened: <note>`, `acceptedAt` null, 백로그 `removedAt` null, Reopen 블록 사라짐, 이벤트 `human done→implementing` | 전부 일치. `backlog_list`에 FEAT-90 `implementing`·`removedAt: null`. validation은 유지(implementing 되돌리기) | `PASS` |
| T5 | 부수 | `required` | 토큰으로 `board_transition(proposed→planning)`·`(done→implementing)` | 둘 다 `not allowed: agent …` | 일치 | `PASS` |
| T6 | 부수 | `required` | 게이트 2 카드의 "Read the plan ↗" href | `blob/<planCommit B>/docs/plans/FEAT-90.md`, 칩 Verified | 일치 | `PASS` |
| T7 | 부수 | `informational` | `done` 전이 뒤 dev의 마지막 `agent_next(ok)` | 서버가 run을 이미 닫아 `{done: true}`, 원장 추가 없음 | 일치(두 번째 dev run steps = `implement:ok, verify:ok`) | `PASS` |
| T8 | 부수 | `required` | 핸드오프 중·인수 대기 중 Inbox | 카드 없음("Nothing to decide."), 탭 뱃지 없음 | 일치 | `PASS` |
| T9 | 카피 §6 | `required` | 게이트 2 카드 도움말에 "Approve implementation approves the plan at the commit shown on the card." | 있어야 한다 | **없었다(F-A)** → `inbox-card.tsx`에 추가. 코드·`check`로 확인, 브라우저 재확인은 안 함 | `PASS`(수정 후) |
| T10 | 카피 §5 | `required` | Inbox 탭, 인수 대기만 있는 차례 | 배너가 설명과 항목 버튼을 지닌다 | **처음엔 "Waiting on you"만 남고 아래는 "Nothing to decide."(F-B)** → `turn-banner.tsx` 수정 뒤 재확인: 디테일 "FEAT-02 needs acceptance" · step 7 줄 · **Open FEAT-02**(`/p/harness-smoke/items/FEAT-02`) | `PASS`(수정 후) |

원장 최종 형태(정리 전): board 1 · events 12 · reports 2 · runs 4 · steps 12. 이벤트 순서 — proposed → 게이트 1 →
plan → in_review → validation → plan(B) → validation → 게이트 2 → report → done → report(인수) → reopen.

## Commands and Static Checks

| 명령 | 결과 |
| --- | --- |
| `npm run test:web` | 153/153 (dev 머지 뒤 수치 — PR #19가 journey 테스트를 지웠다) |
| `npm run check` | exit 0 |

## Findings

- **F-A (`Should`, 수정 완료, 미커밋) — 승인된 도움말 문장이 코드에 없었다.** `product-copy.md` §6과 mock에는
  "**Approve implementation** approves the plan at the commit shown on the card."가 있었으나 Phase 4가 `inbox-card.tsx`에
  옮기지 않았다. 카피→코드 파생의 누락이고, 단위 테스트가 없는 정적 문구라 실측에서만 드러났다.
- **F-B (`Should`, 수정 완료·재확인, 미커밋) — Inbox 탭에서 인수·핸드오프뿐인 차례가 설명을 잃었다.** Inbox의 전체
  배너는 "카드가 말하니 디테일 줄을 뺀다"였는데, done·핸드오프는 카드가 없어 "Waiting on you" 아래에 "Nothing to decide."만
  남았다. Inbox에 카드가 없는 차례(`turn.open.kind === "item"`)는 디테일 줄과 항목 버튼을 유지하도록 고쳤고 카피 §5에 한 줄
  더했다.

## Deviations

- **에이전트 대신 사람이 도구를 불렀다.** 비용·시간 때문에 `claude -p` 사이클(2026-09-06 방식, 약 $16)을 돌리지 않았다.
  서버 규칙·원장·웹은 실제이지만 템플릿 지시가 따라지는지는 이 보고서가 말하지 못한다(follow-up).
- **dev 서버를 실측자가 재시작했다**(소유자 허락 "너가해"). 옛 클라이언트가 `acceptedAt`을 몰라 배너가 틀리게 나왔다 —
  "migrate 뒤 generate, 그리고 재시작"이 배포 절차에 필요하다는 뜻이다.
- **Phase 4 화면 확인 때 세션 쿠키 값이 Playwright 도구 로그에 한 번 노출됐다**(도구가 실행 코드를 결과에 되돌려 보인다).
  이번 실측은 쿠키를 파일·로컬 페이지로만 다뤄 재발하지 않았다. 소유자에게 `AUTH_SECRET` 교체를 권고했다.
- 실측 도중 다른 세션이 Phase 4를 커밋하고 `dev`를 머지했다. 머지가 journey를 지웠으므로 R4의 journey 매핑 확인은 대상에서
  빠졌고, 머지 뒤 상태로 `test:web`·`check`를 다시 돌려 위 표에 적었다.

## Conclusion

- Result rationale: 필수 항목 전부 통과. 발견 2건은 화면 문구·배너 구성이고 같은 트리에서 고쳤으므로 전체 `pass`.
- Remaining uncertainty: 템플릿 지시 준수(에이전트 실행), F-A의 브라우저 재확인, on_hold 경로.
- Rerun decision: 재실행 없음. 다음 템플릿 변경 사이클(에이전트 실행)에서 handoff outcome과 7단계 인수 보고가 실제로
  나오는지 본다.

## Test Data and Cleanup

| 리소스 | 정리 |
| --- | --- |
| `harness-smoke` 백로그 `FEAT-90` + 보드·이벤트·보고·run·step | 삭제 완료 — 카운트 0/0/0/0/0 |
| `FEAT-02.acceptedAt` | 원래 값으로 복구 완료 |
| 임시 스크립트(저장소 루트)·쿠키 파일·`.playwright-mcp/` | 삭제 완료 |
| dev 서버 | 실측자가 재기동(로그는 스크래치패드). 종료·재기동은 소유자 몫 |
