---
status: 'completed'
stage: 'complete'
result: 'pass'
report-kind: 'regression'
report-size: 'compact'
test-levels: ['end-to-end', 'manual']
test-tools: ['Claude Code', 'node --test', 'MCP JSON-RPC over HTTP', 'git', 'prisma', 'transcript parser(scratch)', 'Playwright']
created-at: '2026-09-06'
completed-at: '2026-09-06'
last-executed-at: '2026-09-06'
tested-revision: 'stagekeeper be2066c(main) / private templates b56ff46 → 수정 70ae0a9 / harness-smoke v2-check'
owners: ['Sangeok']
related:
  - 'docs/test-reports/completed/2026-09-04-phase-4-g1-stub-vs-file-acceptance.md'
  - 'docs/proposals/completed/2026-09-05-agent-next-open-routing.md'
  - 'docs/proposals/completed/2026-09-05-plugin-clean-code-findings.md'
  - 'docs/investigations/completed/2026-09-04-agent-next-round-trip-cost.md'
primary-area: 'pipeline/agent-delivery'
observed-environments: ['Windows 11 · Node 22.13.1 · Claude Code 2.1.260 · next dev(localhost:3000) · Neon Postgres(us-east-2)']
test-summary: '템플릿 4회 변경 뒤 한 사이클 완주. 확인 5건 전부 통과, 런북 문서 결함 1건 발견·수정(70ae0a9).'
follow-up:
  - '[열림] 템플릿을 고치면 단위 테스트로 부족하다 — 사이클 1회를 규칙으로 둘지 결정'
---

# 템플릿 변경 뒤 사이클 회귀 확인

## Summary and Decision

G1(2026-09-04) 이후 에이전트 템플릿이 **네 번** 바뀌었다. 넷 다 단위 테스트·`check`·`build`만
통과했고 **실제 사이클을 한 번도 거치지 않았다.** 이 보고서는 그 공백을 닫는다.

물은 것은 하나다 — **네 변경 뒤에도 사이클이 완주하는가.** G1처럼 두 방식을 비교하지 않는다.

**결과: 완주했다.** 확인 5건 전부 통과. 다만 **런북 문서 결함 1건**을 잡았고 고쳤다(`70ae0a9`).
그 결함은 테스트·타입·빌드가 볼 수 없는 종류였다 — 규칙 절과 절차 본문이 어긋난 것이다.

## Scope and Criteria

검증 대상이 된 네 변경:

| 커밋 | 무엇 | 어디 |
| --- | --- | --- |
| `cbfad29` | pm의 서두 단계를 pick에 병합(4→3단계) | private 템플릿 |
| `242ecba` | 구현 보고서의 절 구조 고정 | private 템플릿 |
| `606bcdd` + PR #12 | dev 라우터 단계 제거, run 개방 라우팅, 소유 검사 서버 이관 | 템플릿 + 서버 |
| `b56ff46` | 플러그인 클린코드 10건(보류 경로·커밋 인계 포함) | 템플릿 |

| ID | 확인 항목 | 통과 기준 |
| --- | --- | --- |
| R1 | 사이클 완주 | 항목이 `done`, 백로그 제거, `node --test` 통과, 트리 청결 |
| R2 | run 개방 라우팅 | dev run이 `start` 없이 보드 상태에 맞는 단계에서 열린다 |
| R3 | pm 단계 병합 | 원장이 3단계, `agent_next` 4회 |
| R4 | 커밋 인계 | 권한 없으면 보드·원장 무변경으로 멈추고, 소유자 커밋 뒤 같은 단계를 이어받는다 |
| R5 | 보고서 절 구조 | `docs/agents/dev/<KEY>.md`가 고정된 제목을 그대로 쓴다 |

제외: 파일 방식 대조(G1이 이미 했다), 토큰 비교, doc-auditor(런북 8단계).

## Test Target

- 저장소 `harness-smoke` 브랜치 `v2-check`, 기준선 `b78dacb`(greet CLI + 테스트 2건).
  G1이 쓰던 기준선은 정리 때 삭제돼 같은 모양으로 다시 만들었다.
- 웹 프로젝트 `v2-check`, 백로그 `FEAT-04`("greet CLI: add a --shout flag").
- 재초기화 `f140974` — 생성기가 서버에서 새 스텁을 받았다(`plan: max · done: write 8 · skip 0`).
  `dev.md` 스텁 109줄, 커밋 인계 문구 포함, **단계 본문은 네 파일 어디에도 새지 않았다**(`## step:` 0건).
- 세션 `6897c354`(단일 세션, 게이트 기준 구간 분할).

## Results

| ID | 결과 | 증거 |
| --- | --- | --- |
| R1 | `PASS` | `FEAT-04` `done`, `removedAt 15:06:19`(서버가 제거), `node --test` 7/7(기준선 2), 트리 청결. 구현 `abb26b6`, 브랜치 tip `4cb9012` |
| R2 | `PASS` | dev run이 `plan`(14:40:28)과 `implement`(15:02:58)에서 각각 **직접** 열렸다. 라우터 단계 없이 서버가 보드 상태로 골랐다 |
| R3 | `PASS` | pm 원장이 `start → propose → report` 3단계, `agent_next` 4회(이전 5회) |
| R4 | `PASS` | 아래 「커밋 인계」 참조 |
| R5 | `PASS` | 보고서가 `# FEAT-04 — …` / `## Implementation 2026-09-06` / `### Files changed` · `Differences from the sketch` · `Verification` · `What tests couldn't cover` · `Out of scope`. 고정한 것과 **정확히 일치** |

부수 확인:

- 서브에이전트 **넷 전부 첫 도구 호출이 `agent_next`**(pm·dev×2·plan-verifier).
- `report_submit` 벽: dev 두 run 모두 `verify`가 `report_submit`보다 앞(트랜스크립트 idx 22<30, 4<10).
- 토큰 합계 16,664,421(메인 루프 11,155,887 + 서브 5,508,534). 비용 $16.58.
  **G1(약 900만)보다 큰 이유는 중복 실행이다** — 아래 이탈 참조. 비교용 수치가 아니다.

### 커밋 인계 (R4) — 이번 실측의 중심

dev가 계획서를 다 쓴 뒤 **멈췄다.** `plan_submit`은 `commit`이 필수인데 커밋 권한이 없었다.

멈춘 방식이 F05의 지시와 일치했다. 원장에 outcome을 남기지 않고 run을 `plan`에 연 채 두었고,
보드는 `planning` 그대로였으며, **관련 없는 HEAD를 증거로 제출하지 않았다.**

소유자가 계획서를 커밋(`e148d97`)하고 알리자 **같은 단계를 이어받아** 디스크와 커밋이 일치하는지
확인한 뒤 제출했다 — 원장: `Handoff resolved: confirmed plan committed at e148d97 (tree clean,
disk == commit)`. 양방향이 다 동작한다.

## Findings

- **F-A (`Should`, 수정 완료 `70ae0a9`) — 런북 3단계가 커밋 인계를 말하지 않았다.**
  규칙 절에는 절차가 있었으나 3단계 본문은 "dev가 `plan_submit`하고 `in_review`로 옮긴다"로 남아,
  **소유자가 계획서를 커밋해야 넘어간다는 새 단계가 절차에 드러나지 않았다.** G1 때는 dev가 스스로
  커밋했으니 없던 단계다. 읽는 사람은 정지를 고장으로 읽는다 — 실제로 그렇게 읽혔다.
  일반·Free 두 판의 3단계에 "설계된 정지이지 실패가 아니다"와 복구 절차를 적었다. 스텁 무변경.
  **테스트가 볼 수 없는 결함이다** — 규칙과 절차가 어긋난 것이라 문법도 타입도 걸리지 않는다.
  이것이 사이클을 돌려야 했던 이유다.

## Deviations

- **대리 실행.** 대화형 대신 비대화 `claude -p`를 게이트 기준으로 나눠 돌렸고, 게이트 ①·②는
  민팅한 세션 쿠키로 결재함에서 승인했다. 원장에는 `actor: human`으로 남는다.
- **사이클을 한 번 겹쳐 돌렸다(실측자 실수).** 구현 구간의 백그라운드 완료 알림을 받고 출력 파일
  크기를 쟀는데 0이라 실패로 보고 재실행했다. 실제로는 출력이 늦게 내려온 것이고 그 세션은
  정상 완주했다. **알림 도착 ≠ 출력 준비**를 확인하지 않은 것이 원인이다. 원장에서 run이 열려
  있는 것도 "죽었다"로 읽었으나 진행 중일 수도 있다는 뜻이었다.
  피해는 없었다 — 재실행 세션의 메인 루프가 재구현 전에 상태를 확인하고 "아무것도 구현 안 됐다"는
  잘못된 브리핑을 **정정했다.** 그대로 믿었으면 승인된 코드가 지워졌을 것이다.
  낭비는 약 $3.9. 두 세션이 각각 인수 기록을 커밋해 브랜치에 그 커밋이 둘 남았다(`f2f0fc6`·`4cb9012`).
  같은 실측을 하는 사람은 출력이 비면 잠시 뒤 다시 읽거나 git·원장으로 실제 상태를 먼저 볼 것.

## Conclusion

- Result rationale: 확인 5건 전부 통과. 네 변경이 실사용에서 의도대로 동작한다. 발견 1건은
  문서 결함이었고 같은 날 고쳤으므로 전체 `pass`.
- Remaining uncertainty: **보류(`hold`) 경로는 여전히 안 밟혔다.** 클린 사이클에서는 나오지 않는다.
  F04가 고친 "verify 없이 막힌 구현의 보류 보고"는 아직 실사용 확인이 없다.
- Rerun decision: 재실행 없음. **다음 템플릿 변경 때 같은 절차를 다시 밟는 것을 권한다** —
  이번에 단위 테스트가 통과하는데도 문서 결함이 남았다는 것이 그 근거다.

## Test Data and Cleanup

| 리소스 | 정리 |
| --- | --- |
| 웹 프로젝트 `v2-check`(원장 포함) | 삭제 완료(2026-09-06) — board 1 · events 9 · reports 2 · runs 4 · steps 10 |
| `harness-smoke` 브랜치 `v2-check`(tip `4cb9012`) | 삭제 완료(2026-09-06). 원격에 없었으므로 영구 |
| 스크래치 토큰·쿠키 파일 | 삭제 완료 |
| dev 서버 | 실측 위해 기동. 종료는 소유자 몫 |
