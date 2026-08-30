---
status: 'active'
stage: 'blocked'
result: null
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['end-to-end', 'contract', 'manual']
test-tools: ['node --test', 'MCP JSON-RPC over HTTP', 'git', 'prisma', 'curl']
created-at: '2026-08-30'
completed-at: null
last-executed-at: '2026-08-30'
tested-revision: 'stagekeeper d2c7da0 / harness-smoke 73261bb'
owners: ['Sangeok']
related:
  - 'docs/proposals/active/harness-platform-phase-0-1.md'
  - 'docs/investigations/active/harness-platform.md'
primary-area: 'pipeline'
observed-environments: ['Windows 11 · Node 22.13.1 · next dev(localhost:3000) · Neon Postgres(us-east-2)']
test-summary: null
follow-up: []
---

# Phase 1 스모크 인수 — 빈 저장소 한 바퀴

## Summary and Decision

빈 GitHub 저장소(`Sangeok/harness-smoke`)를 하니스 서비스에 연결하고, 백로그 항목
한 건이 **웹 게이트 두 번**을 거쳐 `완료`가 되기까지 한 사이클을 실제로 돌렸다.
상태 기계·게이트 인가·MCP 도구 계약·생성기·인수 재현이 전부 라이브에서 동작한다.

전체 판정은 아직 내리지 않는다. **인가 격리 4행 중 2행이 두 번째 GitHub 계정을
요구해 실행하지 못했고**(T8), 그 둘은 "하나라도 404가 아니면 Phase 1 미완"으로
규정된 required 항목이다. 그 둘을 돌리면 이 보고서를 `completed`로 옮긴다.

## Scope and Criteria

포함 범위:

- 런북 1~7단계 한 사이클(선정 → 게이트① → 계획 → 검증 → 게이트② → 구현 → 인수)
- MCP 도구 계약(등록 집합·인증·스코프 격리)
- 생성기 `harness-init.mjs`의 물질화와 재실행 동작
- 인가 격리 4행 중 실행 가능한 것

제외 범위:

- **런북 8단계(`doc-auditor`)** — 사이클 완료 판정에 관여하지 않는다. 별도로 돈다.
- **Claude Code 클라이언트 경로** — 플러그인 로드(`--plugin-dir`), `/harness:init`
  스킬의 인터뷰, `.mcp.json`의 `${HARNESS_TOKEN}` 확장, `/mcp` 승인, 서브에이전트
  `tools:` 제한. 이 스모크는 메인 루프가 **스모크 저장소 밖**(하니스 서비스 개발
  세션)에서 돌았기 때문에 그 계층을 통과하지 않는다. 자세한 영향은 F4.
- 배포 환경(Vercel·도메인) — 제안서 Scope의 제외 범위 그대로.

판정 기준과 근거:

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| ------- | ----------------------- | --------- | ------------- | --------- |
| R1 | `docs/proposals/active/harness-platform-phase-0-1.md` Goal | Phase 1 완료 기준 | MUST | 빈 저장소 1개 연결 · 항목 1건이 웹 게이트 2회를 거쳐 `완료` · 에이전트 토큰에 게이트 도구 부재를 실측 |
| R2 | 같은 문서 T1.17 Step 5 | 웹·저장소 최종 상태 | MUST | `완료` · `검증:` 기록 · 이벤트 8건 이상 · 백로그에서 제거 · 저장소 산출물 3종 · 트리 청결 |
| R3 | 같은 문서 T1.17 Step 5b / Verification Plan 「인가 격리」 | 인가 경계 | MUST | 4행 전부. 하나라도 기대와 다르면 Phase 1 미완 |
| R4 | `docs/architecture/protocol.md` 「인수 다섯 조건」 | 인수 | MUST | 다섯 조건을 **직접 재현**(에이전트 보고를 믿지 않음) |
| R5 | `docs/architecture/invariants.md` 불변식 4·8 | 보안·감사 | MUST | 게이트 도구 미등록 + 서버 거부(4) · 전이가 원장에 시간순으로 남음(8) |
| R6 | 같은 문서 T1.16 | 생성기 | MUST | 보드·백로그·원장 파일을 만들지 않음 · `.mcp.json`은 참조만 · 사용자 편집 보존 |

R2의 "이벤트 8건 이상"은 이번 실행에서 **기준 자체가 어긋난 것으로 판단**해
`informational` gate로 낮췄다. 근거는 F1.

## Test Target

- Working tree state: `harness-smoke` clean(`git status --porcelain` 빈 출력).
  `stagekeeper`는 `src/proxy.ts`의 주석 한 줄이 사용자 편집으로 미커밋 상태이며
  런타임에 영향이 없다.
- Application/API target: `http://localhost:3000` — 웹 + `POST /api/mcp`
- Authentication and role: GitHub OAuth로 로그인한 프로젝트 owner(사람),
  프로젝트 스코프 Bearer 토큰(에이전트). 값은 기록하지 않는다.
- Feature flags/configuration: `harness.json` 워크스페이스 1개(`path: "."`,
  `agent: "dev"`, `verify: ["node --test"]`), `executor.kind: "local"`, scout 미설정
- Environment limitations: 두 번째 GitHub 계정 없음 → T8 일부 차단.
  Claude Code 세션이 스모크 저장소 밖에서 돎 → F4.

## Preconditions and Test Data

- Preconditions: Neon Postgres에 초기 마이그레이션 적용 완료(테이블 10),
  GitHub OAuth 앱 등록, `next dev` 기동
- Test data plan: 프로젝트 2개(`mathgic` 리허설 · `harness-smoke` 본 실행),
  백로그 항목 각 1건, 토큰 다수(폐기 시험용 포함). 최종 상태는 아래 표.
- Cleanup rule: `harness-smoke` 저장소와 두 프로젝트는 판정 근거이므로 보고서가
  `completed`로 갈 때까지 지우지 않는다. 그 뒤에는 저장소 삭제와 프로젝트 삭제
  (cascade)로 정리한다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | 빈 저장소를 생성기로 연결하고 `project_sync` | roster 등록, 보드·백로그 파일 없음 | roster `dev(.) verify=["node --test"]`. E1 | `PASS` |
| T2 | R1/R5 | `required` | 에이전트 토큰의 `tools/list` | 정확히 11개, 게이트·백로그 편집·토큰 발급 도구 부재 | 11개, `AGENT_TOOL_NAMES`와 동일. 웹 전용 11종 누출 0. E2 | `PASS` |
| T3 | R5 | `required` | 에이전트가 게이트 전이를 시도 | 서버가 거부 | `not allowed: agent 승인대기 → 계획지시`. E2 | `PASS` |
| T4 | R1 | `required` | 사람이 웹 결재함에서 게이트 2회 | `계획지시`·`구현승인`이 `human`으로 기록 | 이벤트 2건, `actorId`가 User id. E3 | `PASS` |
| T5 | R1 | `required` | 순서 강제 — `plan_submit`/`report_submit` 선행 | 선행 없으면 거부 | `plan_submit first` · `report_submit first`. E4 | `PASS` |
| T6 | R2 | `required` | 최종 상태 — `완료`·`검증:`·백로그 제거·산출물·트리 | 전부 충족 | `완료` · `검증: 클린 패스 (2026-08-30, 무편집 1라운드)` · `removedAt` 자동 · 산출물 3종 · 트리 청결. E3/E5 | `PASS` |
| T6b | R2 | `informational` | 이벤트 8건 이상 | ≥8 | **6건**. 클린 경로의 최소가 6이다. F1 | `FAIL` |
| T7 | R4 | `required` | 인수 다섯 조건 직접 재현 | 다섯 다 충족 | ①~⑤ 전부. ②는 **바이트 일치**. E5 | `PASS` |
| T8 | R3 | `required` | 인가 격리 4행 | 전부 기대대로 | 행3·행4 통과, 행1·행2 미실행. E6 | `BLOCKED` |
| T9 | R6 | `required` | 생성기 물질화·재실행·사용자 편집 보존 | 계약대로 | 8개 생성, 상태 파일 0, 재실행 `write 8 skip 0`, 편집본 `skip(modified)`. E1 | `PASS` |
| T10 | R5 | `required` | 토큰 수명 — 유효/폐기/위조 | 200/401/401 | 200 · 401 · 401. E2 | `PASS` |
| T11 | — | `informational` | 계획서 검증 라운드가 결함을 잡는가 | 카탈로그 경로가 값을 함 | 결함 3건(구현 오류 유발 1 · 문서 위생 2). E7 | `PASS` |

### Scenario Details

#### T7 — 인수 다섯 조건 재현

- Preconditions: `FEAT-01`이 `완료`, 구현 커밋 `73261bb`
- Steps: ① `git show --stat 73261bb` ↔ 계획서 「고칠 파일」 표 · ② 계획서 스케치
  블록을 바이트 추출해 diff 추가분과 문자열 비교 · ③ `node --test` 직접 재실행 ·
  ④ `backlog_list` / `backlog_list({includeRemoved:true})` 대조 · ⑤ 산출물 3종
  존재와 줄 수 확인 + `git status --porcelain`
- Read-back or final-state check: ②가 바이트 일치(22줄). ①은 `README.md` 일치이며
  `docs/agents/dev/FEAT-01.md`가 같은 커밋에 있으나 이는 규약상 별도 산출물이다(F2).

#### T8 — 인가 격리

- Steps(실행): 행3 — `harness-smoke` 토큰과 `mathgic` 토큰으로 같은 key `FEAT-01`을
  `board_get`. 행4 — 미로그인으로 `/p/harness-smoke`·`/inbox`·`/backlog`·`/items/FEAT-01`
- Read-back: 행3 — 두 토큰이 **서로 다른 행**을 본다(`완료` vs `계획지시`),
  `project_get`도 각자 자기 프로젝트, `backlog_list`에 남의 항목 없음. 행4 — 네 경로
  전부 `307 → /login?callbackUrl=…`
- 미실행: 행1(두 번째 계정으로 남의 `/p/<slug>` 직접 접근 → 404 기대)과
  행2(남의 slug로 게이트 서버 액션 호출 → 404 기대)

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R2/T6 | `required` | `node --test` (harness-smoke) | exit 0 | `# tests 0 / # fail 0`, exit 0. 테스트 파일이 없는 저장소라 정상. E5 | `PASS` |
| C2 | R6/T9 | `required` | `harness-init.mjs` (서버 URL 없이) | exit 1, 안내 | exit 1 `서버 URL 필요: --server …`. E1 | `PASS` |
| C3 | R6/T9 | `required` | `harness-init.mjs --dry-run` | 아무것도 쓰지 않음 | 목록 10줄 출력, `git status`에 `harness.json`만. E1 | `PASS` |
| C4 | R2/T6 | `informational` | `git status --porcelain` (harness-smoke) | 빈 출력 | 빈 출력. E5 | `PASS` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | 생성기 실행 로그 | `write: docs/plans/*`·`.claude/agents/{pm,plan-verifier,doc-auditor,dev}.md`·`CLAUDE.md (runbook inserted)`·`.mcp.json (harness created)` / `done: write 8 · skip 0` / 재실행 `write 8 · skip 0` / 편집 후 `skip(modified): .claude/agents/pm.md · write 7 · skip 1` | 이 보고서 |
| E2 | MCP 응답 | `tools/list` 200 · 도구 11개 = `AGENT_TOOL_NAMES` · 웹 전용 11종 부재 · 점 포함 이름 0 / 토큰 없음 401 · 폐기 토큰 401 · 위조 401 / `board_transition(→계획지시)` = `not allowed: agent 승인대기 → 계획지시` | 이 보고서 |
| E3 | 보드 read-back | `status: 완료` · `검증: 클린 패스 (2026-08-30, 무편집 1라운드)` · 이벤트 6건(`agent —→승인대기` · `human 승인대기→계획지시` · `agent 계획지시→검토대기` · `agent validation` · `human 검토대기→구현승인` · `agent 구현승인→완료`) | 이 보고서 |
| E4 | 순서 강제 | `{"error":"plan_submit first"}` · `{"error":"report_submit first"}` · 재선정 `{"error":"already open"}` | 이 보고서 |
| E5 | 저장소 산출물 | `73261bb` = `README.md +23` / 스케치 22줄 ↔ diff 추가분 22줄 **바이트 일치** / `docs/plans/FEAT-01.md`(89줄) · `docs/agents/dev/FEAT-01.md`(52줄) · `docs/agents/main-loop/FEAT-01.md`(74줄) / `backlog_list` 0건, `includeRemoved` 1건 `removedAt 2026-08-30` | `Sangeok/harness-smoke` |
| E6 | 인가 격리 | 행3: 같은 key `FEAT-01`에 대해 smoke 토큰 → `완료`, mathgic 토큰 → `계획지시`(서로 다른 행). `project_get`도 각자 자기 프로젝트. 행4: 4경로 전부 `307 → /login` | 이 보고서 |
| E7 | 검증 라운드 | 라운드1(메인 루프) 결함 2건 — 스케치 펜스 조기 종료(구현 오류 유발) · 인용 4건 내용 불일치. 라운드2(독립) 결함 1건 — 전칭 "에만"의 반례. 라운드3(독립, 무편집) 0건 | `docs/agents/main-loop/FEAT-01.md` |

- Existing failures versus new failures: 이 스모크 이전에 기존 실패는 없었다.
  `npm test` 53/53 · `npm run test:web` 81/81 · `npm run check` exit 0 ·
  `npm run build` exit 0이 스모크 직전 상태였다. 아래 Findings는 전부 신규 관측이다.
- Sensitive-data review: 수행함. 토큰 평문·`DATABASE_URL`·OAuth 시크릿은 이
  보고서에 없다. 토큰은 접두 6자조차 남기지 않았다. `.env`는 gitignore 상태를 확인했다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | low | **완료 기준의 "이벤트 8건 이상"이 실제와 안 맞는다.** 클린 경로의 최소가 6건이다(E3) — 8이 되려면 반려나 보류가 끼어야 한다. 관련해서 `plan_submit`·`report_submit`은 `TransitionEvent`를 남기지 않는데 `validation_record`는 남긴다. 셋 다 증거를 대는 순간이라 원장의 일관성 문제다 | 제안서 T1.17 Step 5 문구 수정, 또는 두 도구가 이벤트를 남기도록 `board.ts` 변경 — 백로그 항목으로 | 기준을 고치거나 계약을 바꾼 뒤 이 사이클 재실행 |
| F2 | low | **인수 조건 ①의 대상 범위가 문서에 안 적혀 있다.** 구현 커밋에는 계획서 「고칠 파일」에 없는 `docs/agents/<행위자>/<ID>.md`가 함께 들어간다(규약상 항상 허용). 조건 ①이 "행위자 기록 제외"를 명시하지 않아 엄격히 읽으면 불일치로 보인다(E5) | `docs/architecture/protocol.md` 인수 다섯 조건에 한 줄 | 문구 추가 후 |
| F3 | medium | **`planCommit`이 승인 시점을 가리키지 않는다.** `plan_submit`은 `계획지시`에서만 허용되는데(`decidePlanSubmit`), 검증 라운드의 계획서 편집은 그 뒤 `검토대기`에서 일어난다. 이번에 기록된 `f982304` 이후 계획서가 두 번 더 바뀌었고 사용자는 HEAD를 보고 승인했다. 결재함 링크가 commit이 아니라 branch를 쓰기 때문에 화면은 옳았지만, 기록된 commit은 승인 대상이 아니다 | 백로그 — 게이트가 그 시점 commit을 기록하거나, `검토대기`에서 `plan_submit` 재호출 허용 | 계약 변경 후 |
| F4 | medium | **Claude Code 클라이언트 경로가 미검증으로 남았다.** 메인 루프가 스모크 저장소 밖에서 돌아 플러그인 로드·`/harness:init` 스킬·`.mcp.json` 확장·`/mcp` 승인·서브에이전트 `tools:` 제한을 통과하지 않았다. 두 검증자 모두 `mcp__harness__board_get`을 부르지 못했고 그 사실을 「실행하지 못한 경로」에 적었다(E7) | 스모크 저장소에서 세션을 한 번 열어 런북대로 재실행 | 그 세션 실행 시 |
| F5 | low | **`board_propose`의 거부 사유 일부가 라이브에서 미확인.** roster 밖 agent와 150자 초과 근거는 `hasOpenRow` 검사가 먼저 걸려 그 분기까지 가지 않았다. 단위 테스트 12건이 덮고 있으나 라이브 확인은 아니다 | 다음 항목에서 관측 | 미결 0건 상태에서 재시도 |

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| `Sangeok/harness-smoke` (GitHub, 비공개) | 새로 생성. 커밋 7개 | 보고서 완료 후 삭제 가능 | 없음 |
| 프로젝트 `harness-smoke` | 생성 · 백로그 1건 · 보드 1행 · 이벤트 6건 · 토큰 2개 | 보고서 완료 후 삭제(cascade) | 없음 |
| 프로젝트 `mathgic` (리허설) | 생성 · 백로그 1건 · 보드 1행(`계획지시`) · 토큰 4개(1개 폐기) | 삭제 권장 — 실제 저장소를 가리키지만 산출물은 커밋되지 않았다 | 실제 저장소는 무변경 |
| `stagekeeper/.env` | `HARNESS_TOKEN`·`SMOKE_TOKEN` 추가 | 보고서 완료 후 제거 가능 | gitignore 상태 |

- Persistent audit/log side effects: `TransitionEvent` 6건과 `Report` 1건은 설계상
  지우지 않는다(불변식 8). 프로젝트를 삭제하면 cascade로 함께 사라진다.
- Cleanup limitations: 없음.

## Conclusion

- Result rationale: required 항목 중 **T8이 `BLOCKED`**(인가 격리 행1·행2가 두 번째
  GitHub 계정을 요구)이고 나머지 required는 전부 `PASS`다. `fail > blocked > pass`
  규칙에 따라 전체는 `blocked`이며, 그래서 `result`를 아직 확정하지 않고
  `stage: blocked`로 둔다. `FAIL`은 T6b 하나뿐인데 `informational`이고, 그 원인이
  제품이 아니라 기준 문구라고 판단해 F1로 넘겼다.
- Remaining uncertainty: F4가 가장 크다. 서버 쪽 방어선(도구 미등록 + 서버 거부)은
  실측으로 닫혔지만, 클라이언트 쪽 2차 방어선은 이 실행이 지나가지 않았다.
- Rerun decision: 두 번째 GitHub 계정이 생기면 T8 행1·행2만 돌려 이 보고서를
  `completed`로 옮긴다. F4는 스모크 저장소 세션에서 한 바퀴 더 도는 것으로 닫고,
  그 결과는 이 보고서에 절을 더해 이어 붙인다(새 보고서를 만들지 않는다).

## Review Checklist

- [x] 모든 TODO를 처리했고 무관한 예시 행과 선택 섹션을 삭제했다.
- [x] `status`, `stage`, `result`가 위치와 README의 생명주기 규칙에 맞는다.
- [x] metadata가 README의 값 규약을 따르고 실제 범위에 맞게 채워졌다.
- [x] `last-executed-at`, `tested-revision`으로 대상을 다시 식별할 수 있다.
- [x] 모든 기준 ID가 실행 항목에 연결되고 gate와 판정이 있다.
- [x] 전체 결과가 `fail > blocked > pass` 규칙으로 계산됐다.
- [x] 핵심 판정에 Evidence ID가 연결됐다.
- [x] 기존 실패와 신규 실패, 테스트 데이터 최종 상태를 구분했다.
- [x] 민감정보 검토를 실제 수행했고 비밀값이 남지 않았다.
- [x] 발견 사항은 추적 위치로 연결했다.
- [x] 본문과 front matter가 모순되지 않는다.
- [ ] 완료 보고서 고정 — 해당 없음(`active`, T8 잔여).
