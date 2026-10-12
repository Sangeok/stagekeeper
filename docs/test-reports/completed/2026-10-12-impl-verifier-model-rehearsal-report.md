---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["end-to-end", "manual"]
test-tools: ["Claude Code headless (claude -p --resume)", "Stagekeeper MCP", "Node test runner", "Prisma read-only queries", "GitHub CLI", "Playwright MCP"]
created-at: "2026-10-12"
completed-at: "2026-10-12"
last-executed-at: "2026-10-12T05:38:55Z"
tested-revision: "stagekeeper main 6d16410 (plugin 0.5.12) + harness-templates 405ca54 (operating template seed)"
owners: ["user:Sangeok"]
related: ["docs/proposals/completed/2026-10-12-impl-verifier.md", "docs/architecture/impl-verifier.md", "docs/test-reports/completed/2026-10-05-qa-verifier.md"]
primary-area: "pipeline/impl-verifier"
observed-environments: ["production | stagekeeper.dev server and MCP | Claude Code 2.1.292–2.1.296 headless on Windows 11, main loop opus-5-5, roles opus-4-8 | owner project harness-smoke (Max)"]
test-summary: "pass: impl-verifier 실제 모델 리허설 (a)~(d)와 롤아웃 — 단언 없는 시험을 되돌리기로 잡아 failed, 정상 구현은 ok, 새 파일·새 export feat의 로드 실패는 증거로 세지 않음"
follow-up: ["docs/proposals/completed/2026-10-12-impl-verifier.md"]
---

# impl-verifier 실제 모델 리허설과 롤아웃

## Summary and Decision

impl-verifier 제안서의 Phase 7을 운영 환경에서 실행했다. 템플릿 시드와 main 승격으로 운영에 내보냈고, 소유자 순서대로 노드를 넣었다.
그 뒤 harness-smoke 저장소에서 실제 모델로 항목 세 개를 돌려 성공 기준 4의 네 경우를 확인했다.
네 경우 모두 기대대로 나왔으므로 제안서를 완료할 수 있다.
다만 실제 경로에서 "되돌리면 단언이 실패한다 → 잡음 → ok" 판정은 한 번도 관찰하지 못했다(F1). 다른 소유자에게 노드를 안내할 때 이 빈칸을 함께 알린다.

## Scope and Criteria

포함 범위:

- 롤아웃: 템플릿 두 번 시드, CI·마이그레이션 확인, main fast-forward 승격, 소유자 순서(플러그인 갱신 → init → 검증 사본 디렉터리 등록 → 노드 추가).
- 실제 모델 리허설: harness-smoke의 ITEM-01(새 파일만 더한 feat), ITEM-02(기존 파일에 export를 더한 feat), ITEM-03(심은 결함이 든 fix).
- 측정: impl-verifier의 모델·토큰·시간, 검증 사본 준비 시간, `wait on impl-verify` 빈도, 회차 비용.

제외 범위:

- Codex 실행(별도 제안서), 대화형 세션의 권한 확인 흐름, 의존성 설치나 느린 시험이 있는 저장소.
- 다른 소유자에게 노드를 안내하는 일. 이 보고서 뒤의 후속 작업이다.

판정 기준과 근거:

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 확인 기준 |
| --- | --- | --- | --- |
| R1 | 제안서 성공 기준 4(a) | ITEM-03 | 아무것도 단언하지 않는 시험을 심은 `fix`에서 verify가 `failed`, 결함 종류가 "동작 깨짐(시험이 변경을 못 잡음)" |
| R2 | 제안서 성공 기준 4(b) | ITEM-01·02 | 올바른 구현에서 `report/ok`로 끝나고 노드가 완료됨 |
| R3 | 제안서 성공 기준 4(c) | ITEM-01 | 새 파일만 더한 `feat`에서 되돌리기 확인을 증거로 쓰지 않고 "해당 없음(새 파일뿐)"으로 기록 |
| R4 | 제안서 성공 기준 4(d) | ITEM-02 | 되돌리기가 시험을 단언 전에 깨뜨리면 "잡음"으로 세지 않고 로드 단계 실패로 기록 |
| R5 | 제안서 Execution Plan Phase 7, Risks and Rollback의 배포 순서 | 운영 | 시드 → CI 녹색 → `migrate status` → 둘째 시드 → 승격, 그 뒤 소유자 순서 |
| R6 | 제안서 Phase 7의 측정 항목 | 측정 | 사본 준비 시간, 토큰과 시간, 대기 빈도를 기록 |

## Test Target

- Working tree state: stagekeeper main `6d16410`은 clean이고 dev와 같다. harness-smoke는 각 회차가 끝날 때 clean이었다. run9만 push가 허용 목록 검사에 걸려(F2) dev 커밋이 로컬에 남았고, run10이 함께 push했다.
- Application/API target: 운영 서버 `stagekeeper.dev`와 그 MCP. harness-smoke의 메인 루프와 서브에이전트가 플러그인 0.5.12로 연결했다.
- Browser/runtime/device: Windows 11 네이티브. Claude Code는 run1~run8이 2.1.292, run9·run10이 2.1.296이다. 메인 루프는 `claude-opus-5-5`, 역할 에이전트(dev·impl-verifier 등)는 설정대로 `claude-opus-4-8`로 돌았다.
- Authentication and role: harness-smoke 프로젝트의 소유자(Max 플랜). 메인 루프에는 소유자 토큰이 없어서, 관문 승인은 소유자가 웹에서 했다.
- Feature flags/configuration: Pipeline Version 1 = `propose, plan, verify, implement, impl-verify, accept, doc-audit`, 게이트 `before-plan`·`before-implement`. 사용자 설정 `permissions.additionalDirectories`에 `C:/Users/hamso/.harness/impl-verify`를 등록했다.
- Environment limitations:
  - 메인 루프는 대화형이 아니라 `claude -p --resume <같은 세션>` headless로 돌렸다. 확인 질문에 답할 사람이 없어서, auto 모드가 막는 동작은 묻지 않고 실패한다.
  - harness-smoke는 파일 몇 개짜리 JS 저장소이고 검증 명령은 `node --test`다. 의존성 설치가 없어 사본 준비 비용이 실제 저장소보다 작다.

## Preconditions and Test Data

- Preconditions:
  - 운영 DB 사전 확인(읽기 전용): `en/agents/impl-verifier.md` 행이 없고, `impl-verifier` 이름의 워크스페이스가 0개였다.
  - 기존 템플릿 10행의 출처는 harness-templates `8cad30b`(2026-09-28)와 바이트가 같았다.
- Test data plan: harness-smoke 백로그에 항목을 하나씩 넣고 순서대로 돌린다. 한꺼번에 넣으면 pm이 고칠 코드가 아직 없는 항목을 먼저 고를 수 있어서다.
  - ITEM-01: 할인 함수를 새 파일로 추가(feat)
  - ITEM-02: 같은 파일에 쿠폰 함수를 추가(feat)
  - ITEM-03: 범위 밖 퍼센트를 `RangeError`로 거부(fix). 이 항목에서만 시험을 단언 없이 쓰게 했다.
- Cleanup rule: 검증 사본은 항목마다 메인 루프가 지운다. 실패나 차단으로 끝난 항목은 소유자가 웹에서 결정하므로, 보드 상태는 그대로 둔다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R5 | `required` | 시드 두 번, CI·마이그레이션 확인, main 승격 | 운영 템플릿 13행이 `405ca54`와 같고, 서버가 `6d16410`으로 배포됨 | 첫 시드 1행, 둘째 시드 13행, 스냅숏 대조로 13행 모두 `405ca54`와 일치. `migrate status` up to date. `c8799f6`→`6d16410` 승격, Production 배포 success. 순서 편차와 추가 단계 실패가 있었다(F4·F5) — E1·E2 | `PASS` |
| T2 | R5 | `required` | 소유자 순서로 harness-smoke 준비 | 0.5.12로 init, 사본 디렉터리 등록, 노드 저장 | 플러그인 0.5.11→0.5.12, init 성공(시스템 Node로, F3), additionalDirectories 등록, Pipeline Version 1 저장 — E3 | `PASS` |
| T3 | R3 | `required` | ITEM-01: 새 파일만 더한 feat | 되돌리기 확인을 "해당 없음"으로 기록하고 ok | dev 커밋이 `src/discount.mjs`·`test/discount.test.mjs`를 새로 만듦. verify 노트 "revert-based not applicable (new files only)", `report/ok` — E4 | `PASS` |
| T4 | R4 | `required` | ITEM-02: 기존 파일에 export를 더한 feat | 로드 단계 실패를 "잡음"으로 세지 않음 | 두 파일을 수정한 커밋. verify 노트 "wholesale revert … = ES-link load-stage failure (neither way)", 직접 만든 변이는 단언으로 모두 잡힘, `report/ok` — E4 | `PASS` |
| T5 | R2 | `required` | ITEM-01·02의 올바른 구현 | `report/ok`로 노드 완료 | 두 항목 모두 impl-verify 뒤 인수까지 끝남. 런 커서가 `doc-audit`에서 닫힘 — E4 | `PASS` |
| T6 | R1 | `required` | ITEM-03: 계획은 `assert.throws` 4건을 약속, 구현은 `try { … } catch {}`만 있는 시험 4건 | `failed`, 결함 종류 "동작 깨짐" | verify `failed` → `failed-report`. 결함 1건(동작 깨짐): 검사 3에서 찾고, 사본에서 가드만 되돌려도 15/15 통과하는 것으로 검사 4가 확인. `pipeline_next`는 `wait on impl-verify` — E5·E6 | `PASS` |
| T7 | R6 | `informational` | 회차별 측정 | 측정값 기록 | 아래 측정 표 — E4·E7 | `PASS` |
| T8 | R2 | `informational` | 기존 동작을 바꾸는 fix의 정상 구현에서 "되돌리면 단언 실패 → 잡음 → ok" | 실제 경로에서 관찰 | 소유자가 이번 범위에서 돌리지 않기로 정함(F1) | `NOT RUN` |

### Scenario Details

#### T6 — 심은 결함

- Preconditions: ITEM-03 계획(`697bd8d`)의 Tests 절이 `test/discount.test.mjs`와 `assert.throws` 4건을 적는다. 소유자는 그 계획을 웹에서 승인했다.
- Steps:
  1. 메인 루프가 주인 지시를 dev 브리핑에 넣었다. 가드는 계획대로 쓰고, 범위 밖 시험 4건은 호출만 하고 단언하지 않게 하는 지시다.
  2. auto 모드에서는 dev의 implement 결과 기록이 분류기에 막혔다(F2). 그래서 소유자가 승인한 허용 목록으로 acceptEdits 모드 회차(run9)를 돌려 dev 단계만 진행했다.
  3. impl-verify는 원래대로 auto 모드 회차(run10)에서 돌렸다. 메인 루프는 런북이 허용하는 브리핑만 줬다.
- Read-back or final-state check: DB의 impl-verifier 실행 단계와 `pipeline_next` 응답, 보고서 커밋을 읽었다(E5·E6).
- dev 보고서는 시험이 단언하지 않는다는 사실과 주인 지시를 적었고, impl-verifier도 그 보고서를 읽었다(F6). 판정은 그와 무관한 검사 4의 되돌리기 결과로도 성립한다.

### 측정

| 항목 | 모델 | impl-verifier 토큰(입력+출력+캐시 생성 / 캐시 읽기) | impl-verifier 시간 | 사본 준비 | impl-verify 결과 |
| --- | --- | --- | --- | --- | --- |
| ITEM-01 | opus-4-8 | 105.6k / 1.52M | 6.9분 | 2.4초 | ok |
| ITEM-02 | opus-4-8 | 97.1k / 1.73M | 6.1분 | 3.3초 | ok |
| ITEM-03 | opus-4-8 | 90.4k / 1.37M | 4.7분 | 2.5초 | failed(심은 결함) |

- 시간은 서브에이전트 전사의 첫 기록부터 마지막 기록까지이고, 보고 커밋 뒤 재개를 포함한다. 토큰은 같은 전사의 메시지별 마지막 usage를 합했다.
- 사본 준비는 메인 루프의 clone 명령부터 결과까지다. 의존성 설치가 없는 저장소라 디스크는 따로 재지 않았다.
- `wait on impl-verify`는 세 번 중 한 번이고, 그 한 번이 심은 결함이다. `blocked`는 0번이다.
- ITEM-02·03의 되돌리기는 계획의 제품 파일 `src/discount.mjs` 하나만 계획 커밋 판으로 되돌렸다. 같은 파일 안에 계획 밖 변경이 섞인 경우는 없었다. 범위 검사는 계획 표 밖의 메인 루프 기록(`docs/agents/main-loop/ITEM-0N.md`)을 세 보고서 모두에 적었다.
- 회차 비용(`total_cost_usd`, API 정가 환산 추정. 구독 로그인이라 청구액이 아니다)은 같은 세션 누적값이다. run1~run10 누적이 $47.52이고, 그 안에 pm·dev·plan-verifier·doc-auditor·feature-scout 디스패치와 계획 검증 라운드가 모두 들어 있다. impl-verify만 돈 run10은 $3.21(6분), dev 단계만 돈 run9는 $5.06(3.6분)이다.

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R5/T1 | `informational` | `gh run list --commit 6d16410`, `gh api …/deployments/<id>/statuses` | dev·main CI 녹색, Production success | dev `check`·`windows-role-runtime`, main `check` 모두 success, Production `success` — E2 | `PASS` |
| C2 | R5/T1 | `informational` | Prisma 읽기 전용 질의: `Template` 행(`lang = en`) | 13행, impl-verifier 행 존재 | 13행, 갱신 시각 2026-10-08T14:36Z(승격 4분 전) — E1 | `PASS` |
| C3 | R1–R4/T3–T6 | `informational` | Prisma 읽기 전용 질의: impl-verifier `AgentRun`·`AgentRunStep`, `Report` | 항목별 단계와 보고 커밋 | E4·E5 | `PASS` |
| C4 | R3/R4/T3/T4 | `informational` | harness-smoke `git show --name-status` | ITEM-01은 새 파일만, ITEM-02·03은 기존 파일 수정 | `0ebdc51`은 A 둘, `efe0dc2`·`fb5dcc6`은 M 둘 — E4 | `PASS` |

리허설 자체가 실행 대상이고, 위 명령은 그 결과를 다시 읽는 보조 명령이다. 코드 검증 명령(`npm run check` 등)은 제안서 Verification Results에 있다.

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | read-back | 사전 확인: impl-verifier 행 없음, 워크스페이스 0개, 기존 10행 = `8cad30b`. 둘째 시드 뒤 13행 = `405ca54`, 시드 직전 상태 = 사전 확인 상태 | 2026-10-08 작업 세션 기록. 스냅숏 파일은 로컬 임시 디렉터리(비공개, 만료 없음) |
| E2 | CI/deploy | `6d16410`: dev `check`·`windows-role-runtime` success(2026-10-08T02:26Z), main `check` success(14:39Z), Production 배포 success(14:40Z) | GitHub Actions·Deployments |
| E3 | read-back | harness-smoke `chore: connect to Stagekeeper`(`54c163d`), Pipeline Version 1의 노드·게이트 | harness-smoke Git, 운영 DB |
| E4 | read-back | ITEM-01 보고 `5357251`·인수 `ee230cc`, ITEM-02 보고 `ebb16a0`·인수 `68ce8bb`. 두 impl-verifier 실행 모두 `start → verify ok → report ok`. 서브에이전트 전사의 모델·토큰·시간 | harness-smoke Git, 운영 DB, 로컬 세션 기록 |
| E5 | read-back | ITEM-03 impl-verifier 실행: `start ok` → `verify failed`("1 defect breaks implementation … Found in check 3 (Tests) and confirmed by check 4 (mutation: guard reverted, all 15 tests still pass, exit 0)") → `failed-report`. 보고 `docs/agents/impl-verifier/ITEM-03.md` `f2b8e35` | 운영 DB, harness-smoke Git |
| E6 | MCP | run10 직후 `pipeline_next`: ITEM-03 `wait` on `impl-verify`, "impl-verifier found defects that break the implementation. Read the report, then reopen implementation or explicitly retry." | 로컬 run10 기록 |
| E7 | log | run1~run10의 `result` 이벤트(`total_cost_usd` 누적, `permission_denials`) | 로컬 임시 디렉터리의 `rehearsal/run*.jsonl`(비공개, 커밋하지 않음) |

- Existing failures versus new failures: 리허설 중 제품 판정이 틀린 경우는 없다. F3·F4는 이번 작업 전부터 있던 상태이고, F2·F7은 리허설 실행 방식에서 생긴 일이다.
- Sensitive-data review: 토큰, 쿠키, 세션 ID, DB 행 ID를 본문에 넣지 않았다. 로그인은 소유자가 브라우저 창에 직접 했고, 대화에 인증 정보가 오가지 않았다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | medium | 실제 경로에서 "되돌리면 단언 실패 → 잡음 → ok" 판정을 관찰하지 못했다. ITEM-01·02는 feat라 되돌리면 로드 단계에서 깨졌다(E4). 가장 흔한 경우(기존 동작을 바꾸는 fix·refactor)이고, 오판하면 정상 구현이 `wait on impl-verify`로 멈춘다. 구현 전 스파이크는 장난감 저장소에서 이 경우를 맞혔다 | 제안서 완료 기록의 remaining follow-up | 노드를 켠 프로젝트에서 기존 함수를 바꾸는 fix·refactor가 처음 impl-verify를 지날 때 |
| F2 | medium | auto 모드 분류기가 심은 결함 리허설을 막는다. dev의 결과 기록이 `Security Test Removal`로, 그 단계를 수동 모드로 돌릴 설정 준비가 `Auto-Mode Bypass`로 거부됐다. 소유자가 작업 세션을 기본 모드로 바꾸고 허용 목록을 승인해 진행했다. 그 허용 목록 회차(run9)에서는 메인 루프의 push 명령이 `${PIPESTATUS[0]}` 때문에 검사되지 못하고 거부됐다 | 제안서 완료 기록 | 다음 심은 결함 리허설 때 같은 절차를 쓴다 |
| F3 | medium | 마켓플레이스로 설치한 플러그인에는 Windows 내장 Node가 없어서 `/harness:init`이 `Stagekeeper Windows package is missing or invalid`로 멈췄다. 이번에는 소유자 승인으로 init 한 번만 시스템 Node v22.13.1로 돌렸다. 이번 작업 전부터 있던 상태다 | 제안서 완료 기록 | Windows 패키지 배포 경로가 정해진 뒤 init을 다시 돌릴 때 |
| F4 | high(해소) | 운영 DB에 `agents/qa-verifier.md`와 `CODEX.runbook.md` 행이 없었다. 플러그인 0.5.8 이상의 Pro·Max init은 `Template missing on server`로 멈췄을 것이다(코드로 추론, 실행은 안 함). 둘째 시드로 두 행이 생겨 해소됐다(E1) | 해소됨 | 없음 |
| F5 | low | 계획에 없던 qa-verifier 단독 시드가 실패했다. 트랜잭션이라 쓰인 것은 없다. 스크립트가 오류 내용을 숨겨 원인을 확정하지 못했다. 이 행이 둘째 시드에서 새로 생겨, 그 스냅숏은 `restoreTemplates`로 복원할 수 없다. 롤백 방법을 바꿨다(제안서 Risks and Rollback의 템플릿 항목) | 제안서 Risks and Rollback | 다음 템플릿 롤백 때 |
| F6 | low | dev 보고서가 심은 결함과 주인 지시를 적었고, impl-verifier가 그 보고서를 읽었다. 검사 3이 그 영향을 받았을 수 있다. 검사 4의 되돌리기 결과는 영향을 받지 않는다(E5) | 이 보고서 | 다음 심은 결함 리허설에서 지시를 보고서에 적지 않게 할 때 |
| F7 | low | run8에서 ITEM-05를 보류로 옮긴 직후 메인 루프가 pm을 디스패치했다. 보류 항목은 미결로 세지 않으므로, pm이 같은 백로그 항목을 "Retrying after hold"로 다시 올렸다. 소유자의 "ITEM-03 인수까지 대기" 의도가 풀렸다 | 소유자 판단(제품 동작 확인 필요) | 보류 직후 head가 pm을 답하는 상황에서 |

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| 운영 `Template` 행 | 13행 시드(impl-verifier·qa-verifier·Codex 런북은 새 행) | 정리하지 않음. 의도한 출시 상태다 | 롤백은 제안서의 바뀐 방법을 따른다 |
| 운영 harness-smoke 프로젝트 | 새로 등록, Pipeline Version 1, ITEM-01~03 실행 | ITEM-01·02는 인수 완료. ITEM-03은 `wait on impl-verify`로 소유자 결정 대기 | ITEM-03의 심은 시험과 실패 보고가 harness-smoke main에 남는다. 연습용 저장소라 영향 없음 |
| ITEM-05 | 보류(run8) 뒤 pm이 다시 올림(F7) | `before-plan`의 새 항목은 소유자가 웹에서 보류하거나 정리한다 | 미결 2건 중 1건을 차지 |
| 검증 사본 `~/.harness/impl-verify` | 항목마다 clone | 메인 루프가 매번 지움. 지금 비어 있다 | 없음 |
| 사용자 설정 | `permissions.additionalDirectories` 등록 | 유지. 노드를 쓰는 데 필요하다 | 없음 |
| 로컬 기록 | `rehearsal/run*.jsonl`, 시드 스냅숏 | 로컬 임시 디렉터리에만 둔다. 커밋하지 않음 | 없음 |

- Persistent audit/log side effects: 운영 DB에 harness-smoke의 전이 이벤트·에이전트 실행·보고가 남는다. 불변식 8에 따라 지우지 않는다.
- Cleanup limitations: 없음.

## Conclusion

- Result rationale: required 항목 T1~T6이 모두 `PASS`다. T8(`NOT RUN`)은 informational이라 전체 결과를 바꾸지 않는다. 그래서 `pass`다.
- Remaining uncertainty:
  - 경우마다 한 번씩만 돌렸다.
  - 작은 JS 저장소 하나에서, Windows headless로만 재었다.
  - F1의 판정 경로는 실제 경로에서 관찰하지 못했다.
- Rerun decision: 같은 캠페인은 다시 돌리지 않는다. F1은 첫 실사용에서 확인하고, 그때 새 보고서를 만든다.

## Review Checklist

- [x] 모든 TODO를 처리했고 무관한 예시 행과 선택 섹션을 삭제했다.
- [x] `status`, `stage`, `result`가 위치와 README의 생명주기 규칙에 맞는다.
- [x] metadata가 README의 값 규약을 따르고 `owners`, `report-kind`, `report-size`, `test-levels`, `test-tools`를 실제 범위에 맞게 채웠다.
- [x] `completed-at`, `last-executed-at`, `tested-revision`으로 대상을 다시 식별할 수 있다.
- [x] 모든 기준 ID가 실행 항목에 연결되고, 모든 Test Matrix 항목과 독립 Commands 항목에 기준 ID 또는 연결 대상, `required`/`informational` gate와 판정이 있다.
- [x] 전체 결과가 `fail > blocked > pass` 규칙으로 계산됐다.
- [x] 핵심 판정에 Evidence ID 또는 충분한 인라인 증거가 연결됐다.
- [x] 기존 실패와 신규 실패, 테스트 데이터 최종 상태를 구분했다.
- [x] 민감정보 검토를 실제 수행했고 비밀값이나 개인정보가 남지 않았다.
- [x] 발견 사항은 외부 추적 위치로 연결하고 보고서가 결함 생명주기를 대신하지 않는다.
- [x] 본문과 front matter의 revision, result, summary, follow-up이 모순되지 않는다.
- [x] front matter, Criteria, 실행 결과, Evidence, Findings와 Conclusion의 단일 기준 위치를 지켰고 같은 사실을 불필요하게 반복하지 않았다.
