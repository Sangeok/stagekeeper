---
status: 'completed'
stage: 'complete'
result: 'fail'
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['end-to-end', 'contract', 'manual']
test-tools: ['Claude Code', 'node --test', 'MCP JSON-RPC over HTTP', 'git', 'prisma', 'transcript parser(scratch)']
created-at: '2026-09-03'
completed-at: '2026-09-04'
last-executed-at: '2026-09-04'
tested-revision: 'stagekeeper de7dcda(dev) / private templates 9818dec(파일 방식)·d27e614(스텁 방식) / harness-smoke f925fbd 기준'
owners: ['Sangeok']
related:
  - 'docs/proposals/active/harness-platform-phase-4-entitlement.md'
  - 'docs/test-reports/completed/2026-09-01-phase-1-smoke-acceptance.md'
primary-area: 'pipeline/agent-delivery'
observed-environments: ['Windows 11 · Node 22.13.1 · Claude Code · next dev(localhost:3000) · Neon Postgres(us-east-2)']
test-summary: 'R0·R1·R2·R3 PASS(스텁 전달 동작·안전 검증), R4·R5 FAIL(보고 형식 상이·토큰 +9.5%) → 전체 FAIL. Batch C 착수 여부는 사용자 결정.'
follow-up:
  - 'F1 스텁 토큰 +9.5%(agent_next 왕복 오버헤드) — 제안서 §G1 ⑤, 완화 여지는 단계 병합'
  - 'F2 보고서 제목 계층·문구 상이 — 제안서 §G1 ④, private 템플릿에서 제목 고정'
---

# Phase 4 G1 — 스텁 방식 vs 파일 방식 비교 실측

## Summary and Decision

Phase 4의 에이전트 전달 방식(파일은 스텁, 단계 본문은 `agent_next`)이 **파일 방식과
같은 품질로 한 사이클을 완주**하는지를 같은 백로그 항목으로 두 번 돌려 잰다.
제안서 §G1의 다섯 기준이 판정 기준이며, 결과가 Batch C(`report_submit` 벽) 착수
여부를 정한다 — 전부 통과하면 C·D 승인 요청, 하나라도 실패하면 실패한 단계의 분기를
쓰거나 단계를 합친 뒤 **같은 항목으로 재실측**한다. 파일 방식으로 되돌리는 스위치는
만들지 않는다.

**측정 결과는 FAIL이다** — R4(보고 형식)와 R5(토큰)가 사전 등록 기준을 벗어났다.
그러나 **소유자 결정은 착수(2026-09-04)**: 실패한 둘은 안전이 아니라 비용·형식이고,
전달 방식의 핵심 베팅(R1 첫 호출·R2 검증 선행·R3 readOnly)은 전부 통과했다. 그래서
R4·R5를 **차단 기준에서 관찰 항목으로 낮추고** F1·F2를 후속으로 추적하며 Batch C에
착수한다. 이 문단은 판정을 덮지 않는다 — 측정은 FAIL로 남고 결정만 따로 적는다.

## Scope and Criteria

포함 범위:

- 런북 1~7단계 한 사이클(pm 선정 → 게이트① → dev plan → 검증 라운드 → 게이트② →
  dev implement → 인수) × 2회, 같은 백로그 항목 `FEAT-03`
- Run A **파일 방식**: private 템플릿의 단계 분할 이전 마지막 판(`9818dec`) 본문을
  통째로 `.claude/agents/`에 놓고 돈다. `agent_next`는 어디에도 없다
- Run B **스텁 방식**: 서버(`/api/templates`)가 주는 스텁만으로 돈다. 단계 본문은
  `agent_next`로 받는다
- 기준 ①~⑤(아래 R1~R5)와, 비교의 전제인 사이클 완주(R0)

제외 범위:

- **런북 8단계(`doc-auditor`)** — 기준에 들어 있지 않다. 어느 쪽이든 돌면 원장에
  남는 것만 기록한다
- **`report_submit`의 verify 선행 벽(T4.6)** — 제안서대로 아직 꺼져 있다. 기준 ②는
  두 방식 모두 **자발적** 순서를 잰다
- Free 플랜 벽·워크스페이스 상한 — 별도 실측(제안서 §Verification Plan)
- 플러그인 로드 경로(`--plugin-dir`)와 `/harness:init` 스킬 — Phase 1에서 밟았고
  이번 비교의 변수가 아니다(아래 「해석과 이탈」)

판정 기준과 근거:

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| ------- | ----------------------- | --------- | ------------- | --------- |
| R0 | 제안서 §G1 머리글 "같은 품질로 한 사이클을 완주" | 두 실행 | MUST(비교의 전제) | 두 실행 모두 `FEAT-03`이 `done`, `validation` 기록, 백로그에서 제거, `node --test` 통과, 트리 청결 |
| R1 | 제안서 §G1 ① 첫 행동 | Run B의 모든 서브에이전트 | MUST | 각 서브에이전트 트랜스크립트의 **첫 도구 호출**이 `mcp__harness__agent_next`. Run A는 기준선으로 첫 호출만 기록(informational) |
| R2 | 제안서 §G1 ② 검증 선행 | dev implement 구간 | MUST | Run B: 원장에서 `AgentRunStep{stepId:"verify", outcome:"ok"}`의 `at`이 `Report.at`보다 앞. Run A: 트랜스크립트에서 `node --test`를 실행한 Bash 호출이 `report_submit` 호출보다 앞 |
| R3 | 제안서 §G1 ③ readOnly | 두 실행 | MUST | `docs/spec/greet-cli.md`에 쓰기 없음 — `git diff g1-base..<최종>` 빈 출력 + 트랜스크립트의 Write/Edit 대상 경로에 없음 |
| R4 | 제안서 §G1 ④ 보고 형식 | `docs/agents/dev/FEAT-03.md` | MUST | 두 실행의 보고서에서 `#`~`###` 제목 줄의 **순서와 문구**가 같다(공백·대소문자 정규화). 본문 내용은 비교하지 않는다 |
| R5 | 제안서 §G1 ⑤ 토큰 | 두 실행의 세션 전체 | MUST | Run B 합계 ≤ Run A 합계. 합계 = 메인 루프 + 모든 서브에이전트의 `input + cache_creation + cache_read + output`, 스트리밍 중복 행은 `message.id`로 한 번만 센다. `output`만의 비교는 informational |

### 해석과 이탈 (판정 전에 읽을 것)

- **"private 템플릿의 현재 판"의 해석.** 제안서 §G1은 T4.3(단계 분할) 이전에 쓰였다.
  T4.3 이후의 현재 판(`d27e614`)은 이미 스텁+`## step:`이라 파일 방식이 성립하지
  않으므로, 파일 방식은 **단계 분할 직전 판 `9818dec`**로 한다. 이 판은 Phase 1이
  렌더링한 원본과 같고, `d27e614`와는 에이전트 4종과 런북 절만 다르다(규약 문서는
  바이트 동일).
- **테스트 프로젝트 하나 → 저장소 하나, 브랜치·웹 프로젝트 둘.** 두 실행의
  트랜스크립트(cwd별)와 원장(프로젝트별)을 섞이지 않게 나누려고 `harness-smoke`
  저장소의 `g1-base`(`f925fbd`)에서 `g1-file`(Run A, 본 checkout)과 `g1-stub`(Run B,
  worktree `harness-smoke-stub`)을 갈랐고, 웹 프로젝트도 `g1-file`·`g1-stub` 둘을
  두었다. 백로그 항목·토큰·`harness.json`(브랜치명 제외)은 같다.
- **웹 프로젝트와 백로그 항목은 Prisma 스크립트로 만들었다**(UI 경로 아님). 웹 UI의
  프로젝트 생성·백로그 입력은 Phase 1에서 밟았고 이번 비교의 변수가 아니다.
- **init은 생성기 직접 실행.** `/harness:init` 스킬 대신 `plugin/bin/harness-init.mjs`를
  돌렸다. Run B 스텁은 서버가 없던 시점에 로컬 우회로(`HARNESS_TEMPLATES_DIR` +
  `HARNESS_PLAN=max`, 원본 `d27e614`)로 먼저 썼고, 서버가 뜨면 **같은 토큰으로
  `/api/templates`에 대해 다시 생성해 `git status`가 비는 것**을 확인한다(C5). 그때까지
  Run B를 시작하지 않는다.
- **트랜스크립트의 토큰 합계**는 Claude Code가 남기는 `message.usage`를 그대로 더한
  값이라 캐시 읽기가 대부분이며 턴 수에 민감하다. 그래서 R5는 합계로 판정하되
  `output`만의 비교를 따로 적는다.

## Test Target

- Working tree state: `stagekeeper` clean, 브랜치 `harness/phase-4-g1`(`dev`
  `de7dcda`에서 분기, 코드 변경 없음). `harness-smoke`: `g1-file` `9d1e4bb`
  (g1-base 대비 `dev.md`·`CLAUDE.md`·`harness.json`·lock만 변경), `g1-stub` `4dd56af`
  (에이전트 4종이 스텁으로 교체: −520/+95줄).
- Application/API target: `http://localhost:3000` — 웹 결재함(게이트 ①·②),
  `GET /api/templates?lang=en`, `POST /api/mcp`
- Browser/runtime/device: Claude Code(메인 루프 = 저장소 안 세션), 브라우저(게이트)
- Authentication and role: 사람 = GitHub OAuth 로그인한 프로젝트 owner(플랜 `max`),
  에이전트 = 프로젝트별 Bearer 토큰(`initial`). 토큰 값은 스크래치 파일에만 있고
  기록하지 않는다
- Feature flags/configuration: `harness.json` 워크스페이스 1개 `app`(`path: "."`,
  `agent: "dev"`, `verify: ["node --test"]`, `knowledge: "docs/knowledge/dev.md"`,
  `readOnly: ["docs/spec/greet-cli.md"]`), `language: "en"`, `executor.kind: "local"`,
  scout 미설정. Run B는 `.mcp.json`으로 `harness` MCP 서버 연결, Run A도 같은
  `.mcp.json`(파일 방식도 `board_get`·`plan_submit`·`report_submit`은 MCP다)
- Environment limitations: 초안 작성 시점에는 포트 3000을 다른 프로젝트의 `next dev`가
  잡고 있어 C5와 `project_sync`를 미뤘다. 사용자가 그 서버를 내린 뒤 stagekeeper
  `next dev`를 띄워(2026-09-03) 둘 다 마쳤다. 그 외 제한 없음

## Preconditions and Test Data

- Preconditions: 사용자 `Sangeok`의 플랜이 `max`(DB read-back), `Template` 테이블에
  `en` 11행(`d27e614`, 2026-09-03T05:43Z 시드), `harness-smoke` 세 브랜치와 worktree,
  웹 프로젝트 `g1-file`·`g1-stub`(각각 `FEAT-03` 1건 + 토큰 1개), 서버 기동 후
  두 프로젝트에 `project_sync({ workspaces, language: "en" })` 완료 — 전부 충족
  (2026-09-03, sync는 `{"synced":1}` × 2, read-back으로 roster `dev(.)`·readOnly·knowledge·
  verify와 `language en` 확인, `agent_next` 원장 0건)
- Test data plan: 백로그 항목 `FEAT-03` "greet CLI: add an --upper flag"(area `src`,
  근거는 관찰/코드 확인/원하는 결과 세 문단). 예상 최종 상태: 두 프로젝트 모두
  `FEAT-03`이 `done`, 각 브랜치에 계획서·검증 기록·보고서·구현 커밋
- Cleanup rule: 정상 종료 — 스크래치의 토큰 파일 삭제, 두 브랜치·worktree와 두
  프로젝트는 판정 근거이므로 보고서가 `completed`로 갈 때까지 유지. 실패·재실측 —
  같은 항목으로 다시 돌 수 있게 브랜치를 `g1-base`로 되돌리고 보드 항목을 초기화하지
  않고 **새 프로젝트**를 판다(원장을 지우지 않는다). 차단 — 그대로 두고 사유를 적는다

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R0 | `required` | Run A(파일 방식) 사이클 완주 — 원장·트리 read-back | `done` · `validation` 기록 · `removedAt` · `node --test` 통과 · 트리 청결 | FEAT-03 `done`; validation `clean pass (2026-09-04, 2 rounds, no edits)`; `removedAt` 05:14:50; `node --test` 8/8 통과; 트리 청결. E1·E3 | `PASS` |
| T2 | R0 | `required` | Run B(스텁 방식) 사이클 완주 — 같은 read-back | 위와 같음 | FEAT-03 `done`; validation 동일 문구; `removedAt` 04:16:23; `node --test` 9/9 통과; 트리 청결. E1·E3 | `PASS` |
| T3 | R1 | `required` | Run B 서브에이전트 전부의 첫 도구 호출 | 모두 `agent_next` | pm·dev(plan)·plan-verifier·dev(impl) **4종 전부 첫 호출이 `agent_next`**. E2 | `PASS` |
| T3b | R1 | `informational` | Run A 서브에이전트의 첫 도구 호출(기준선) | 기록만 | pm=`backlog_list`, dev=`board_get`, plan-verifier=`Skill` — `agent_next` 전무(파일 방식엔 그 도구를 쓸 이유가 없음). E2 | (기록) |
| T4 | R2 | `required` | Run B 원장: dev implement run의 `verify/ok` ↔ `Report.at` | verify가 앞 | dev-impl run `verify/ok` 04:15:42 < dev `Report.at` 04:16:19. E1 | `PASS` |
| T5 | R2 | `required` | Run A 트랜스크립트: `node --test` Bash ↔ `report_submit` | verify가 앞 | dev-impl 트랜스크립트 verify idx 8 < `report_submit` idx 15. (Run B 트랜스크립트도 11<17로 일치) E2 | `PASS` |
| T6 | R3 | `required` | 두 실행 모두 `docs/spec/greet-cli.md` 무변경 | diff 빈 출력 + 쓰기 대상에 없음 | 두 브랜치 `g1-base..HEAD`의 해당 파일 diff **빈 출력**; 어느 서브에이전트의 Write/Edit 대상에도 없음. E2·E3 | `PASS` |
| T7 | R4 | `required` | 두 `docs/agents/dev/FEAT-03.md`의 제목 줄 비교 | 순서·문구 동일 | 같은 5개 주제(Files changed·Differences·Verification·tests-couldn't-cover·Out-of-scope)가 양쪽에 있으나, 파일 방식은 `## Implementation` 아래 `###` 중첩 + `Pre-check` 절 추가, 스텁은 평면 `##`; 문구도 상이(`Not covered by tests` ↔ `What tests couldn't cover`). 제목 diff **비어있지 않음**. E3 | `FAIL` |
| T8 | R5 | `required` | 세션 합계 토큰 Run B ≤ Run A | ≤ | 합계 stub **10,241,502** > file **9,352,623** (+888,879, **+9.5%**). E2 | `FAIL` |
| T8b | R5 | `informational` | `output` 토큰만 Run B ↔ Run A | 기록만 | out stub 88,379 ≤ file 90,324 — 생성 토큰만 보면 스텁이 근소히 적다. E2 | (기록) |
| T9 | — | `informational` | Run B 원장의 `agent_next` 거부·`hold`·`failed`/`blocked` 기록 | T4.6 벽의 hold 처리 후보(a)/(b) 선택 근거 | 4개 run 모두 `refused=0`, 모든 outcome `ok`. hold/blocked/failed **0건** — 클린 사이클에선 hold 경로가 밟히지 않는다. T4.6 (a)/(b) 선택에 실측 압력 없음. E1 | (기록) |
| T10 | — | `informational` | Run B에서 클라이언트에 401 사유가 보이는지(제안서 §Risks) | 기회가 있으면 기록 | 토큰이 항상 유효해 401 미발생. 해당 없음 | (N/A) |

### Scenario Details

실행 완료. Run A(파일 방식)는 `harness-smoke` 브랜치 `g1-file` 세션 `2579dee1`,
Run B(스텁 방식)는 `harness-smoke-stub` 브랜치 `g1-stub` 세션 `8fc0c8df`에서
각각 한 사이클을 완주했다. 두 실행 모두 게이트 ①·②는 실측자가 세션 쿠키로 웹 결재함에
들어가 프로젝트별 항목(`g1-file`·`g1-stub`)에서 눌렀고, 원장에 `actor: human`으로 남았다
(「해석과 이탈」의 대리 승인 항목). 실행은 비대화 `claude -p`를 게이트 기준 3구간으로
나눠(`--resume`) 돌렸다.

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | T1/T2/T4/T9 | `informational` | `g1-ledger.ts g1-file` · `g1-ledger.ts g1-stub` | 원장 덤프 | 실행함 — 전이·보고·`AgentRun`/`AgentRunStep` 시각을 E1로 인라인 | (기록) |
| C2 | T3/T5/T6/T8 | `informational` | `g1-transcript.mjs <transcript dir>` | 세션·서브에이전트 요약 | 실행함 — 첫 호출·순서·쓰기 경로·토큰 합계를 E2로 인라인 | (기록) |
| C3 | R3/T6 | `required` | `git diff g1-base..<최종 커밋> -- docs/spec/greet-cli.md` (두 브랜치) | 빈 출력 | 두 브랜치 모두 **빈 출력**. E3 | `PASS` |
| C4 | R4/T7 | `required` | 두 브랜치의 `docs/agents/dev/FEAT-03.md`에서 코드펜스를 걷어낸 `^#{1,3} ` 줄만 뽑아 diff | 빈 출력 | diff **비어있지 않음**(중첩 깊이·절 구성·문구 상이). E3 | `FAIL` |
| C5 | 준비/T2 | `required` | `harness-smoke-stub`에서 `HARNESS_TOKEN=<g1-stub> harness-init.mjs --root . --server http://localhost:3000` 뒤 `git status --porcelain` | `plan: max` · 빈 출력(서버 배포본 = 우회로 산출물) | `plan: max` · `done: write 8 · skip 0`. 생성된 10개 파일 전부 HEAD `4dd56af`와 **바이트 동일**(md5, `git diff --numstat` 빈 출력). status에는 5개가 떴으나 체크아웃 CRLF ↔ 서버 LF의 EOL 상태 차이뿐이라 `git checkout --`로 되돌려 빈 출력. E3 | `PASS` |
| C6 | R0/T1/T2 | `required` | `node --test` (두 최종 트리) | exit 0, `--upper` 케이스 포함 | file 8/8·stub 9/9 통과, exit 0, 두 트리 모두 `--upper`가 `HELLO, ADA!`. E3 | `PASS` |
| C7 | R0/T1/T2 | `informational` | `git status --porcelain` (두 worktree) | 빈 출력 | 두 worktree 모두 **빈 출력**. E3 | (기록) |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | read-back(DB) | 두 프로젝트 원장 — Run B: `proposed`(01:16:59)→`planning`(human 01:42:29)→`in_review`→`validation`(01:58:29)→`implementing`(human 04:12:57)→`done`(04:16:23); dev-impl `AgentRunStep` verify/ok 04:15:42 < dev Report 04:16:19; 4개 run 전부 `refused=0`. Run A: `proposed`(04:42:37)→`planning`(human 04:43:34)→`in_review`→`validation`(04:59:55)→`implementing`(human 05:12:57)→`done`; `removedAt` 05:14:50 | 이 보고서에 인라인 |
| E2 | log(transcript) | 파서 출력. 첫 호출 — Run B 서브 4종 전부 `agent_next`; Run A pm=`backlog_list`·dev=`board_get`·plan-verifier=`Skill`. 토큰 합계(dedupe by message.id): **file 9,352,623 / stub 10,241,502**(out file 90,324 / stub 88,379). pm 서브 단독: file 129,577 vs stub 348,515(2.7×) | 정제 인라인. 원본 `.jsonl`은 로컬만 |
| E3 | git | C3(양쪽 빈 출력) · C4(제목 diff 비어있지 않음) · C6(file 8/8·stub 9/9) · C7(양쪽 빈 출력). 최종 커밋 file `728d1da`·stub `e82f15c` | 인라인 |
| E4 | UI | 게이트 ①·② 전이의 `actor: human`(E1 원장으로 확인). 세션 쿠키는 스크래치 파일에만 두고 값 미기록 | E1에 포함 |

- Existing failures versus new failures: 신규만. 실측용 프로젝트/브랜치라 기존 실패 없음
- Sensitive-data review: 수행함. 토큰 값·세션 쿠키·Bearer 문자열은 보고서에 없음.
  파서 출력 중 도구 인자에 토큰이 섞이지 않음을 확인

## Findings and Follow-up

- **F1 (R5, `FAIL`) — 스텁 방식이 한 사이클에 토큰을 ~9.5% 더 쓴다.** 합계 stub
  10,241,502 vs file 9,352,623. 초과분은 전부 서브에이전트에 있다(메인 루프는 오히려
  stub이 62만 적다). 메커니즘은 명확하다 — `agent_next`가 단계마다 MCP 왕복을 하나씩
  더하고, 토큰의 90%↑가 캐시 읽기라 왕복 수에 비례한다. 가장 깨끗한 신호는 pm
  서브에이전트다: 코드 없는 동일 작업인데 stub이 file의 **2.7배**(348,515 vs 129,577),
  차이는 거의 순수 `agent_next` 왕복이다. 반면 **생성(output) 토큰만 보면 stub이 근소히
  적다**(88,379 vs 90,324). 즉 실제 사고량이 아니라 왕복 오버헤드가 원인이다.
  두 실행의 검증 라운드 수가 완전히 같지 않아 절대치엔 잡음이 있으나, pm 신호가 방향을
  못박는다. 추적: 제안서 §G1 ⑤.
- **F2 (R4, `FAIL`) — 두 보고서의 제목 구조가 다르다.** 같은 다섯 주제가 양쪽에 다
  있으나 파일 방식은 `## Implementation` 아래 `###`로 중첩하고 `Pre-check` 절을 하나 더
  두며, 스텁은 평면 `##`에 문구도 다르다. 내용 누락은 아니고 제목 계층·문구의 차이다.
  단계 분할판(`d27e614`)이 보고 형식 지시를 통짜판(`9818dec`)과 다르게 전하거나, 애초에
  템플릿이 제목을 고정하지 않아 에이전트 재량이 갈린 것. 추적: 제안서 §G1 ④.
- **관찰(비결함) — Run A에서 `agent_next` 없는 파일 방식이 정상 완주**했다(T3b). 스텁
  방식은 서브 4종 전부 첫 호출이 `agent_next`였다(R1 `PASS`) — 전달 방식의 대비가
  의도대로 갈린다.
- **관찰 — Run A 실행 중 nested 세션에서 Bash 1건이 분류기에 거부**됐다(코드펜스 추출
  명령). 메인 루프가 우회해 검증을 마쳤고 판정엔 영향 없음. 대리 실행(비대화·게이트
  대리 승인)의 부수효과로 기록.

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| 웹 프로젝트 `g1-file`·`g1-stub` | 생성(스크립트), `FEAT-03` 각 1건 `done`, 원장 존재 | 보고서 `completed` 후 삭제 가능(cascade) | 없음 |
| `harness-smoke` 브랜치 `g1-base`·`g1-file`·`g1-stub`, worktree `harness-smoke-stub` | 각 브랜치에 계획·검증·구현 커밋 | 판정 근거로 유지, 이후 삭제 가능 | 없음 |
| 스크래치 토큰 파일 2개 + 세션 쿠키 파일 | 생성 | **실행 종료 직후 삭제 예정** | 없음 |
| 기존 프로젝트 `harness-smoke`(Phase 1) | 변경 없음 | — | 없음 |

- Persistent audit/log side effects: 두 프로젝트의 `TransitionEvent`·`AgentRun`/`AgentRunStep` 원장(판정 근거)
- Cleanup limitations: 없음

## Conclusion

- Result rationale: 안전·정확성 기준(R0 완주, R1 첫 호출 `agent_next`, R2 검증 선행,
  R3 readOnly 준수)은 **모두 통과** — 스텁 전달의 핵심 베팅은 실측으로 검증됐다.
  그러나 R4(보고 형식 동일)와 R5(토큰 ≤ 파일)가 **실패**해, `fail > blocked > pass`로
  전체 결과는 **FAIL**이다. 두 실패는 안전이 아니라 비용(+9.5%)과 형식 일관성 문제다.
- Remaining uncertainty: R5의 절대치는 두 실행의 검증 라운드 수 차이로 잡음이 있다.
  다만 코드 없는 pm 서브가 stub에서 2.7배라 방향(스텁이 더 비쌈)은 확고하다.
  R4가 템플릿 지시 탓인지 에이전트 재량 탓인지는 템플릿 본문 대조로 더 좁힐 수 있다.
- Rerun decision: **재실측하지 않는다.** 사전 합의는 "하나라도 실패 → Batch C 미착수,
  수정 후 재실측"이었으나, 소유자가 2026-09-04에 (a)를 골랐다 — R4·R5를 차단 기준에서
  관찰 항목으로 낮추고 F1·F2를 후속으로 추적하며 Batch C에 착수. 근거는 실패 둘이
  안전이 아니라 비용(+9.5%)과 제목 형식이고, 안전·정확성 기준이 전부 통과했다는 점이다.
  F1은 단계 병합으로, F2는 private 템플릿의 제목 고정으로 각각 닫을 수 있으며 둘 다
  이 게이트 밖의 후속 작업이다.

## Review Checklist

- [ ] 모든 TODO를 처리했고 무관한 예시 행과 선택 섹션을 삭제했다.
- [ ] `status`, `stage`, `result`가 위치와 README의 생명주기 규칙에 맞는다.
- [ ] metadata가 README의 값 규약을 따르고 `owners`, `report-kind`, `report-size`,
      `test-levels`, `test-tools`를 실제 범위에 맞게 채웠다.
- [ ] `completed-at`, `last-executed-at`, `tested-revision`으로 대상을 다시
      식별할 수 있다.
- [ ] 모든 기준 ID가 실행 항목에 연결되고, 모든 Test Matrix 항목과 독립 Commands
      항목에 기준 ID 또는 연결 대상, `required`/`informational` gate와 판정이 있다.
- [ ] 전체 결과가 `fail > blocked > pass` 규칙으로 계산됐다.
- [ ] 핵심 판정에 Evidence ID 또는 충분한 인라인 증거가 연결됐다.
- [ ] 기존 실패와 신규 실패, 테스트 데이터 최종 상태를 구분했다.
- [ ] 민감정보 검토를 실제 수행했고 비밀값이나 개인정보가 남지 않았다.
- [ ] 발견 사항은 외부 추적 위치로 연결하고 보고서가 결함 생명주기를 대신하지
      않는다.
- [ ] 본문과 front matter의 revision, result, summary, follow-up이 모순되지
      않는다.
- [ ] front matter, Criteria, 실행 결과, Evidence, Findings와 Conclusion의 단일
      기준 위치를 지켰고 같은 사실을 불필요하게 반복하지 않았다.
- [ ] 완료 보고서는 실행·증거 갱신이 더 남아 있지 않은 시점 고정 기록이다.
- [ ] 상대 링크와 증거 경로를 확인하고 `npm run docs:check`를 실행한 뒤, 자동
      검증이 다루지 않는 판정·증거·민감정보 항목을 수동 검토했다.
