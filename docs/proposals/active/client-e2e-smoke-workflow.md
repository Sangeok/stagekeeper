---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-10-29"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# 클라이언트 E2E 검증 3단 구성 기능 개발 문서

요약: 판을 올릴 때마다 사람이 Windows·Mac 기기를 켜지 않아도 되도록, 깨질 수 있는 곳마다 그것을 잡는 가장 싼
시험을 붙인다.

| 단 | 무엇 | 언제 | 비용 |
| --- | --- | --- | --- |
| 0단 | 스킬 문서가 가리키는 경로·명령·생성기 출력이 실제와 맞는지 보는 정적 시험 | 모든 PR | 0원 |
| 1단 | 모델 없는 실전 E2E. 실제 GitHub 설치·서버·DB·OS에서 스크립트가 스킬 절차를 그대로 실행한다 | 플러그인·서버를 바꾼 PR, 승격 전 | 0원(공개 저장소 러너) |
| 2단 | Claude Code 내장 `claude plugin eval`로 실제 모델이 스킬을 따르는지 평가한다 | 플러그인이 바뀐 승격 전, 주 1회 | 구독 사용량 안에서 처리 |

제품 코드(서버·플러그인 동작)는 바꾸지 않는다. 바꾸는 것은 시험, 워크플로, 출하 파일 판정 한 줄, 승격 절차 문서다.

## 1. 배경/동기

**사용자가 준 맥락.** 판을 올릴 때마다 사람이 Windows·Mac 기기를 켜고 직접 시험할 수 없다. CI/CD 안에서
Claude와 Codex가 실제로 동작하는지 자동으로 확인해야 한다. 비용은 낮아야 한다. API 키로 매번 실제 모델을 돌리는
안은 비용이 너무 높아 기각됐다.

2026-10-29에 사용자가 정한 것은 다음과 같다.

| 결정 | 선택 |
| --- | --- |
| 구조 | 3단(0단 정적, 1단 모델 없는 실전 E2E, 2단 실제 모델 평가) |
| 실행 시점 | 0단은 모든 PR. 1단은 플러그인·서버를 바꾼 PR과 승격 전. 2단은 플러그인이 바뀐 승격 전과 주 1회. 실패하면 승격하지 않는다 |
| 실행 위치 | 공개 저장소 `Sangeok/stagekeeper`. 로그에는 요약만 남긴다 |
| 인증 | 모델은 2단만 쓴다. Claude 구독 토큰(`claude setup-token`)을 쓰고 API 키는 쓰지 않는다. 상용화 뒤 팀·회사 CI가 되면 회사 API 키로 바꾼다 |
| 대상 | 1단은 Windows Claude, macOS Claude, Windows Codex. 2단은 macOS Claude |
| 1단 시나리오 | new-user(Free로 처음 연결 → 재실행 → Pro로 올린 뒤 재실행), update(지난 판으로 연결해 둔 저장소를 새 판으로 재실행) |
| Codex 실제 모델 평가 | Codex 공개 배포에 착수할 때 추가한다 |

**검토 과정에서 기각한 안과 이유.**

- **API 키로 매 승격 실제 모델 E2E:**
  - 2026-10-29 실측 기준 Opus 5.5로 세션당 $1.17~1.44다. 1회 실행(두 OS)이 약 $11이고, 최근 승격 빈도(10일에 약
    16번)로는 한 달 수백 달러다.
  - 예산이 있어도 최적이 아니다. 모델 결과가 흔들려 거짓 실패가 생기고, 에이전트가 결함을 스스로 우회해 놓친다.
    2026-10-28 smoke에서 watch 스킬의 낡은 경로(F3)를 에이전트가 알아서 찾아내 통과했다.
- **모델 없는 시험만:** 에이전트가 스킬 문장을 다르게 읽는 결함을 원리상 못 잡는다. 2026-10-29의 F4(재실행에서
  yes 없이 씀, PR #257에서 고침)가 이 종류다.

**코드베이스에서 확인한 맥락.**

- 현재 CI에는 모델 없는 계약 시험만 있다.
  - `.github/workflows/check.yml`은 Linux에서 static·test·test-web·server·build를 돌리고, `postgres:18` 서비스로
    `npm run test:server:integration`을 돌린다.
  - `.github/workflows/windows-role-runtime.yml`은 `windows-2022`에서 패치한 Node를 빌드·캐시하고 LPAC 역할 시험을
    돌린다.
  - `.github/workflows/macos-runtime-contracts.yml`은 macOS에서 core·plugin 시험을 돌린다.
- 생성기 시험(`plugin/bin/harness-init.test.mjs`)은 가짜 서버를 쓴다. 실제 GitHub 설치, 실제 서버·DB, 실제 OS로
  처음부터 끝까지 도는 시험은 없다.
- Claude Code에는 플러그인 평가 기능 `claude plugin eval`이 있다(이 PC의 2.1.312 CLI 도움말과
  code.claude.com/docs/en/plugin-evals.md에서 확인). 공식 문서가 밝힌 용도가 "플러그인을 바꾸거나 새 모델이 나왔을
  때 회귀 잡기"다.

## 2. 목표 상태

### 목표

- **0단:** 스킬 문서가 가리키는 플러그인 경로와 생성기 출력 문구가 실제 패키지·코드와 맞지 않으면 PR이 실패한다.
- **1단:** 다섯 job이 동시에 돌며 사용자 흐름을 모델 없이 처음부터 끝까지 확인한다.
  - job은 `claude (windows-2022, new-user)`, `claude (windows-2022, update)`, `claude (macos-15, new-user)`,
    `claude (macos-15, update)`, `codex (windows-2022)`다.
- **2단:** macOS 러너에서 `claude plugin eval`이 init 스킬의 행동 사례를 실제 모델로 평가하고, 기준 점수에 못
  미치면 실패한다.
- **승격 절차:** `main` 승격 절차에 "승격할 dev 커밋에서 1단(과 플러그인이 바뀐 경우 2단)이 녹색이어야 한다"를
  넣는다.
- **로그:** 공개 로그와 artifact에는 결과 요약만 남긴다. 비공개 템플릿 본문과 토큰은 남기지 않는다.

### 비목표

- 항목 하나를 계획부터 인수까지 돌리는 흐름. 다음 단계로 미룬다.
- Windows에서 실제 모델의 동작 평가. `claude plugin eval`은 셸 권한에 OS 샌드박스가 필요한데 native Windows에는
  없다(공식 문서: "Native Windows has no backend"). Windows의 명령 실행은 0·1단이 지킨다.
- Codex의 실제 모델 평가와 macOS Codex. Codex는 아직 GitHub 설치로 쓸 수 없고 번들로만 된다.
  `plugin/bin/harness-background.mjs`는 비Windows에서 Codex 실행기를 `codex-windows`로 거부한다.
- 운영 서버와 운영 DB 사용. 운영 DB는 로컬과 공유한다.
- 러너가 표현하지 못하는 동작: 로그온 자동 시작, 바탕화면 알림, Windows Home 전용 동작, 실제 결제 화면.

### 성공 기준

**0단**

- 모든 `SKILL.md`(Claude·Codex)가 백틱으로 가리키는 `bin/`·`lib/`·`runtime/`·`codex/` 경로가 출하 패키지에 있다.
  패키징이 만드는 경로(`codex/skills/reconciling-proposals-with-codebase`)는 허용 목록으로 다룬다.
- init 스킬이 읽으라고 하는 생성기 출력 문구가 생성기에 있다: `plan:`, `write:`, `skip(modified):`, `skip(plan):`,
  `refuse:`, `server:`, `Server URL required`, `stop: server access was refused after file generation`,
  `note: that entry was also this repository's only record of the server URL`.
- 한도 문구는 `capReason("free", "workspaces")`의 출력이 스킬의 `workspace cap reached on the <plan> plan`과 맞는지로
  확인한다.

**1단 `new-user` job** (Claude, OS마다)

- **처음 연결(Free 사용자)**
  - 스킬 절차대로 등록(`--register`) → `harness.json` 작성 → dry-run → 생성을 실행한다.
  - 에이전트 파일 3개가 생기고, `skip(plan):`이 4줄이다.
  - DB `Project` 행과 `runbookVersion`이 생긴다.
  - `claude mcp add`로 등록한 서버를 `claude mcp get harness`가 `Connected`로 보고한다.
  - `project_get`과 `project_sync`가 성공한다.
  - 새 셸의 `HARNESS_SERVER`가 base URL이다.
- **커밋한 뒤 바뀐 것 없는 재실행:** 생성 결과가 커밋된 파일과 바이트 단위로 같다.
- **`npm run plan:grant -- <login> pro` 뒤 재실행:** 에이전트 파일이 7개가 되고, 동기화가 성공한다.

**1단 `update` job** (Claude, OS마다, 다른 시험 사용자)

- 지난 판(`previous-ref`, 기본 `origin/main`)의 생성기로 연결해 둔 저장소를 새 판으로 재실행해 성공하고,
  `lastSyncedAt`이 갱신된다.
- 지난 판 생성기가 새 서버에 대해 성공하는 것도 확인한다. 승격하면 서버가 먼저 배포되므로 기존 사용자가 바로
  겪는 조합이다.

**1단 `codex` job** (Windows, Pro)

- 번들을 설치하고 `harness.ps1 init --client codex`와 `harness-codex.mjs complete-init`을 실행한다.
- `.codex/agents/*.toml`과 `docs/harness/codex-runbook.md`가 생긴다.
- `connected`가 출력되고, DB `lastSyncedAt`이 채워진다.

**2단** (`claude plugin eval`, macOS, 사례마다 3회)

- 다음 사례가 모두 기준 점수 이상이다.
  1. 연결된 저장소의 바뀐 것 없는 재실행에서 쓰기 전에 묻는다.
  2. 처음 연결에서 초안과 dry-run을 보여 주고 한 번만 묻는다.
  3. yes를 받은 뒤 생성기를 실행한다.
  4. 서버 주소가 없으면 주소를 묻는다.

**공통**

- 실패한 job은 0이 아닌 종료 코드로 끝난다.
- 로그에 토큰 원문과 비공개 템플릿 문구가 없다.

**회귀 감지 증명**

- 2단을 0.5.28 플러그인(`a750b76`)에 돌리면 사례 1이 실패해야 한다.
- 1단은 지난 판과 새 판 조합에서 의도적으로 맞지 않는 상태를 하나 만들어 실패하는지 본다.

## 3. 대안 분석

### Option A: API 키로 매 승격 실제 모델 E2E (두 OS, 시나리오 전체)

- 장점: 가장 사용자에 가까운 실행이다.
- 단점:
  - 1회 약 $11, 한 달 수백 달러다.
  - 거짓 실패가 생긴다.
  - 에이전트가 결정적 결함을 우회해 놓친다(F3 사례).

### Option B: 모델 없는 시험만

- 장점: 0원이고 결정적이다.
- 단점: 스킬 해석 결함(F4 종류)을 원리상 못 잡는다.

### Option C: 사용자 PC를 self-hosted runner로

- 장점: 실제 Windows 11 Home이다.
- 단점: PC가 켜져 있어야 하고 PC 설정을 바꾼다. macOS는 불가능하다.

### Option D: 운영 서버와 E2E 전용 계정

- 단점: 운영 DB를 로컬과 공유해서 데이터가 오염된다. 운영 토큰을 CI 비밀값으로 둬야 한다.

### Option E: 3단 구성 (선택)

- 장점:
  - 깨짐의 종류마다 가장 싼 도구를 붙인다.
    - 코드·통합 결함은 1단이 잡는다.
    - 문서가 실제와 어긋나는 것은 0단이 잡는다.
    - 스킬 해석은 2단이 잡는다.
    - Claude Code 변화는 1단(설치)과 2단의 주 1회 실행이 잡는다.
  - 실제 모델은 꼭 필요한 곳에만 쓰고, 공식 평가 도구와 구독 사용량으로 돌린다.
- 단점:
  - 1단 스크립트가 스킬 절차를 따로 적어 두므로, 스킬 절차가 바뀌면 함께 고쳐야 한다. 스킬이 바뀌면 2단이 돌므로
    어긋남은 그때 드러난다.
  - Windows 실제 모델 동작은 보지 못한다.

### 세부 선택

- **2단 도구:** `claude plugin eval`을 쓴다. 직접 만든 헤드리스 드라이버는 쓰지 않는다.
  - 사례를 3회 반복해 점수를 매기고, `--threshold`로 CI를 막는다.
  - `tool_used`·`regex` 같은 결정적 판정을 쓴다.
  - 실행마다 임시 HOME에서 플러그인만 불러온다.
  - 대화 기록 판정기와 대답 규칙을 직접 만들 필요가 없다.
- **2단 OS:** Linux 대신 macOS로 한다.
  - macOS는 제품 대상 OS이고, 샌드박스(Seatbelt)가 기본으로 있다.
  - 이 저장소 CI가 macOS 러너에서 Seatbelt 시험을 이미 통과했다(2026-10-28 macOS 샌드박스 실측).
  - Linux는 `bubblewrap`·`socat` 설치가 필요하다.
- **인증:** 지금은 구독 토큰을 쓴다. API 키와 시험 품질은 같고, 청구 방식만 다르다.

## 4. 구현 계획

### 신규 코드

| 파일 | 단 | 역할 |
|------|----|------|
| `plugin/bin/harness-skill-references.test.mjs` | 0단 | 스킬이 가리키는 플러그인 경로와 생성기 출력 문구 대조. `npm test`가 찾는 `plugin/bin/*.test.mjs` 위치다 |
| `.github/workflows/e2e-smoke.yml` | 1단 | `pull_request`(dev, 경로 필터)와 `workflow_dispatch`. matrix 다섯 job. PostgreSQL 준비, 플러그인 설치, 리허설 실행, 요약 기록 |
| `scripts/rehearsals/rehearse-client-init-smoke.ts` | 1단 | 공통 도구. 시험 DB, 템플릿 시드, fixture, `next start`, 시험 저장소, 스킬 절차 실행, 판정, 정리. 표준 출력에는 요약 JSON 한 줄. `parseArguments`·`main` export |
| `scripts/rehearsals/rehearse-client-init-smoke.test.ts` | 1단 | 진입점 시험(`--help` 0, 모르는 인자 2, `CI`·`--allow-machine-changes` 없으면 거부) |
| `scripts/rehearsals/client-init-smoke-steps.mjs` | 1단 | 순수 helper. `helperCommand`(OS별 스킬 명령), `summarize`(허용 필드만), `containsSecret`(원문 반환 없음) |
| `scripts/rehearsals/client-init-smoke-steps.test.mjs` | 1단 | 위 helper 단위 시험(`test:scripts`) |
| `.github/workflows/agent-eval.yml` | 2단 | `workflow_dispatch`와 `schedule`(주 1회). macOS에서 `claude plugin eval` 실행 |
| `plugin/evals/<사례>/case.yaml`, `prompt.md`, `graders/*.md`, `fixture.sh` | 2단 | 사례 4개와 fixture. 템플릿은 `plugin/evals/fixtures/templates/`의 공개 가능한 가짜 템플릿 |

배치 근거:

- 1단 리허설은 `docs/architecture/verification.md`의 "책임별 위치와 명령" 표에서 `rehearsals/`(제품 기능 인수
  리허설) 자리에 둔다. 같은 문서는 "독립 명령 하나를 위해 별도 폴더를 만들지 않는다"고 한다.
- 2단 사례는 `plugin/evals/`에 둔다. `claude plugin eval --help`에 따르면 사례 디렉터리는 "below the plugin"이어야
  하고 기본값이 `evals/`다.
- 경로 선택과 `GITHUB_STEP_SUMMARY` 기록은 워크플로가 맡는다. 같은 문서의 "스크립트와 CI의 경계"를 따른다.

### 0단 설계

- 모든 `plugin/skills/*/SKILL.md`와 `plugin/codex/skills/*/SKILL.md`에서 백틱 경로(`$CLAUDE_PLUGIN_ROOT/` 접두 포함)
  중 `bin/`·`lib/`·`runtime/`·`codex/`로 시작하는 것을 모아 `plugin/` 아래에 있는지 확인한다.
- 2026-10-29에 같은 규칙을 손으로 돌려 봤다. 없는 경로는 Codex 스킬 두 곳의
  `codex/skills/reconciling-proposals-with-codebase` 하나였다.
  - 이 경로는 `scripts/windows/package-windows-plugin.mjs`가 패키징 때 만든다(`CODEX_VERIFIER`).
  - 그래서 "패키징이 만드는 경로" 허용 목록에 넣고, 허용 목록 항목이 패키징 코드에 실제로 있는지도 함께 단언한다.
- 생성기 출력 문구는 `plugin/bin/harness-init.mjs`에서 찾는다. 2026-10-29 검색에서 위 목록이 모두 이 파일에
  있었다.
- 한도 문구는 동적으로 만들어지므로 문자열 검색이 아니라 `capReason` 출력과 비교한다
  (`plugin/lib/plans/entitlement.mjs:31-33`: `` `${AXIS_NOUN[axis]} cap reached on the ${plan} plan (${...})` ``).

### 1단 설계

**리허설 입력과 안전장치**

```text
node --import tsx scripts/rehearsals/rehearse-client-init-smoke.ts \
  --client <claude|codex> --scenario <new-user|update> \
  --templates <비공개 템플릿 checkout 절대 경로> --plugin-source <github-branch|export|bundle> \
  [--previous-ref <커밋>] [--snapshot <공개 저장소 밖 절대 경로>]
환경: TEST_DATABASE_URL(stagekeeper_test_*), CI=true 또는 --allow-machine-changes
```

- **기계 설정 보호:** 스킬 절차는 `HARNESS_SERVER`를 영구 저장하고 사용자 범위 MCP를 등록한다. 그래서 `CI=true`도
  `--allow-machine-changes`도 없으면 작업 전에 거부한다.
- **DB 연결:** `scripts/lib/prisma.ts`의 `withPrisma`를 쓴다. 시험 DB는 `scripts/test-server-integration.mjs`의
  `validateTestDatabase`로 확인한다.
- **템플릿 시드:**
  - `npm run seed:templates -- --dir <templates>`를 그대로 부른다.
  - Codex 템플릿이 있으면 `seed-templates.ts`가 `--snapshot`(공개 저장소 밖)을 요구하므로 runner 임시 경로를 준다.
  - 시드한 템플릿 커밋을 요약에 남긴다.
- **서버:** `rehearse-repository-disconnection.ts`의 `start()`처럼 `next start`를 띄우고 `/login` 200을 기다린다.
  환경 변수는 `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `HARNESS_PUBLIC_URL`이다.
- **fixture:**
  - `User`(음수 `githubId`)와 `UserToken`을 만든다. 토큰은 `packages/core/tokens/token.mjs`의 `newToken("user")`로
    만들고 hash만 저장한다.
  - `new-user`는 구독 행 없이 시작해 Free가 된다. `codex`는 `Subscription { plan: "pro" }`로 시작한다.
  - `update`는 다른 사용자를 쓴다. Free는 프로젝트가 1개뿐이라 시나리오를 분리한다.
- **시험 저장소:** runner 임시 경로에 `git init -b main`으로 만들고, origin은
  `https://github.com/stagekeeper-e2e/<scenario>-<os>.git`로 둔다. 등록은 GitHub을 호출하지 않는다
  (`src/server/rest/project-registration.ts`의 `registerProject`).

**스킬 절차 실행(모델 없음)**

- 명령은 스킬 문구를 그대로 따른다. `helperCommand`가 만든다.
  - Windows: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <plugin>/bin/harness.ps1 <task> ...`
  - macOS: `node <plugin>/bin/harness-init.mjs ...`
- 처음 연결(`new-user` 1회차):
  1. `--register`
  2. 돌려받은 slug로 `harness.json` 작성
  3. `--dry-run`
  4. 생성
  5. `HARNESS_SERVER` 영구 저장(Windows `setx`, macOS 로그인 프로필)
  6. `claude mcp add --transport http --scope user harness <base>/api/mcp -H 'Authorization: Bearer ${HARNESS_TOKEN}'`
  7. `claude mcp get harness`가 `Connected`인지 확인
  8. `plugin/runtime/mcp-client.mjs`의 `verifyProject`(project_get + owner·repo·slug 대조)와 `callTool(..., "project_sync", ...)`
- 재실행과 업그레이드 뒤 재실행은 3~4단계와 8단계를 반복한다. 업그레이드는 `npm run plan:grant -- <login> pro`다.
- `update`:
  - `previous-ref`의 추적 파일에서 플러그인을 내보내 그 판 생성기로 위 1~6단계를 하고 커밋한다.
  - 로스터는 DB `Workspace` 행과 과거 시각의 `lastSyncedAt`으로 맞춘다.
  - 그다음 새 판으로 3·4·8단계를 실행한다.
- Codex:
  - `node scripts/windows/package-windows-plugin.mjs --output <새 디렉터리> --runtime <runtime>`으로 번들을 만들고,
    marketplace 매니페스트를 붙여 `codex plugin add`로 설치한다. 설치 경로는
    `docs/test-reports/completed/2026-10-05-windows-package-update.md`가 기록한 방식이다.
  - 그 번들의 `harness.ps1 init --client codex`(dry-run, 생성), `harness.ps1 codex complete-init`을 실행한다.
  - runtime은 `windows-role-runtime.yml`과 같은 캐시 키로 복원하고, 캐시가 없으면 사유 코드와 함께 실패한다.

**판정과 출력**

- 파일, DB 행(`Project.runbookVersion`, `Project.lastSyncedAt`, `Workspace` 수), 클라이언트 설정, 명령 종료 코드로
  판정한다.
- 클라이언트 설정 파일(`~/.claude.json`, Codex 설정)과 출력에 토큰 원문이 없는지 `containsSecret`으로 확인한다.
- 표준 출력에는 `summarize`가 허용한 필드만 남긴다. 클라이언트, OS, 시나리오, 플러그인 커밋, 템플릿 커밋, 단계별
  결과, 실패 사유 코드다.

**플러그인 설치(Phase 0B 실측 결과)**

- 시험 커밋은 `claude plugin marketplace add "https://github.com/Sangeok/stagekeeper.git#<브랜치>"` →
  `claude plugin install harness@stagekeeper-local`로 설치한다.
- 설치 뒤 marketplace clone의 HEAD가 시험 커밋과 같은지 대조한다.
- 커밋 해시 fragment는 git이 거부한다. 그래서 브랜치가 없는 커밋은 추적 파일을 내보내 로컬 경로로 설치하고, 방식
  차이를 요약에 남긴다.

**워크플로**

- 트리거:
  - `pull_request`(dev, 경로 필터: `plugin/**`, `src/server/**`, `src/app/api/**`, `prisma/**`, 리허설 파일)
  - `workflow_dispatch`(승격 전)
- 같은 저장소 브랜치의 PR에는 비밀값이 열리고, 외부 포크 PR에는 열리지 않는다. 비밀값이 없으면 job은 사유를 남기고
  건너뛴다.
- `permissions: contents: read`, checkout은 `persist-credentials: false`로 둔다. job 제한은 30분이다.
- PostgreSQL 단계는 Phase 0A에서 확정한 방법을 쓴다.
  - `npm install --prefix <임시> @embedded-postgres/<platform>@18.4.0-beta.17` → `initdb` → `pg_ctl -w start`
    → `pg`로 DB 생성
  - Windows는 pg_ctl 프로세스만 기다린다.

### 2단 설계

- **실행:** macOS 러너에서 다음을 실행한다.
  `claude plugin eval plugin --trust-plugin --scaffold --allow-tools Write Edit Bash --ablation none --threshold <값> --json <경로> --no-publish`
  - 인증은 비밀값 `E2E_CLAUDE_OAUTH_TOKEN`을 `CLAUDE_CODE_OAUTH_TOKEN`으로 넘긴다.
  - 공식 문서에 따르면 평가 실행은 평소 Claude Code와 같은 인증을 쓰고 "plan's usage limits or your API bill"로
    계산된다.
- **격리:** 공식 문서상 실행마다 임시 HOME·작업 디렉터리·설정이 쓰이고 플러그인만 로드된다. 사용자 설정, MCP 서버,
  `CLAUDE.md`는 로드되지 않는다. 셸 명령은 OS 샌드박스 안에서 돌고 쓰기는 작업 디렉터리로 제한된다.
- **사례 설계:** PC 전체 설정을 바꾸는 단계(서버 주소 저장, MCP 등록)는 샌드박스가 막는다. 그래서 사례는 "쓰기 전에
  묻는가"와 "yes 뒤 생성하는가"까지만 판정하고, 나머지는 1단이 맡는다.
  - 서버와 비공개 템플릿 없이 돌리기 위해 생성기의 로컬 모드를 쓴다(`plugin/bin/harness-init.mjs:80-81`의
    `HARNESS_TEMPLATES_DIR`, `HARNESS_PLAN`). 가짜 토큰과 함께 사례의 `execution.env`로 준다.
  - `fixture.sh`(`context.scaffold_script`)가 시험 저장소를 만든다.
  - 사례 3은 `context.history_file`로 "질문까지 끝난 대화"를 이어받아 `yes`를 다음 턴으로 준다.
- **판정(결정적, 판정 모델 없음):**
  - 사례 1·2: `tool_used`(Bash, `input_match`에 `--dry-run`, `min: 1`), `tool_used`(Bash, 실제 생성 명령, `min: 0`,
    `max: 0`), `regex`(`last_message`, 확인 질문)
  - 사례 3: 실제 생성 명령 `tool_used`(`min: 1`)
  - 사례 4: `regex`(`last_message`, 주소 요청)
- **기준 점수:** 사례마다 3회 실행하고, 기준은 `0.67`(3회 중 2회)로 시작한다. F4처럼 꾸준히 나는 회귀는 이 기준에서
  실패하고, 한 번 우연히 실패한 것은 넘어간다. 거짓 실패와 놓침의 비율을 보고 조정한다.
- **출하 파일에서 제외:** `plugin/evals/`는 사용자에게 필요 없는 시험 자료다.
  `scripts/windows/package-windows-plugin.mjs:12`의 `isShippedPluginFile`에서 제외한다. 그래야 평가만 고쳐도
  플러그인 판을 올려야 하는 일과, Windows 번들에 들어가는 일이 생기지 않는다. `verify-plugin-version.mjs`가 같은
  함수를 쓴다.

### 기존 코드 수정

**`scripts/windows/package-windows-plugin.mjs`** (12행)

Before:

```js
export const isShippedPluginFile = name => name.startsWith("plugin/") && !name.startsWith("plugin/templates/") && !name.endsWith(".test.mjs");
```

After:

```js
export const isShippedPluginFile = name => name.startsWith("plugin/") && !name.startsWith("plugin/templates/") && !name.startsWith("plugin/evals/") && !name.endsWith(".test.mjs");
```

지켜야 할 불변식: `plugin/evals/` 밖 파일의 판정은 바뀌지 않는다.

**`scripts/checks/verify-plugin-version.test.mjs`** ("shipped files follow the Windows package rules" 시험):
입력 목록에 `plugin/evals/rerun-asks-first/case.yaml`을 추가하고 기대 결과에는 넣지 않는다.

**`AGENTS.md`** (Branching and pull requests, 88~91행)

Before:

```markdown
- Before promoting, run `npm run verify:plugin-version` and stop if it fails. When
  shipped `plugin/` files differ between `origin/main` and `origin/dev`, both plugin
  manifests must carry the same, higher version; otherwise the server deploys while
  installed plugins never update.
```

After:

```markdown
- Before promoting, run `npm run verify:plugin-version` and stop if it fails. When
  shipped `plugin/` files differ between `origin/main` and `origin/dev`, both plugin
  manifests must carry the same, higher version; otherwise the server deploys while
  installed plugins never update.
- Before promoting, run the `e2e-smoke` workflow on the `dev` commit being promoted
  (`gh workflow run e2e-smoke.yml --ref dev`), and also `agent-eval` when shipped
  `plugin/` files changed. Stop unless every job is green, and promote only the
  commit their summaries name.
```

지켜야 할 불변식: 기존 `verify:plugin-version` 규칙은 그대로이고, 승격 조건만 늘어난다.

**`docs/architecture/verification.md`**

- "자동 검사" 절에 `e2e-smoke`(1단)와 `agent-eval`(2단) 항목을 추가한다. 실행 조건, job, 비밀값, 로그 정책, 비용을
  적는다.
- 스크립트 표에 `rehearsals/rehearse-client-init-smoke.ts` 행을 추가한다. "실행 계약과 재사용" 2항에 따라 작업
  디렉터리, 인자, 환경 변수, 도구, 쓰기 범위(시험 DB, 러너 사용자 설정)를 적는다.

## 5. 실행 순서

### Phase 0: 실현 가능성 실측

임시 워크플로를 작업 브랜치의 `push` 트리거로 돌린다. `workflow_dispatch`는 기본 브랜치에 파일이 있어야 하기
때문이다.

- **0A (완료):** 포터블 PostgreSQL 18, migrate, build, `next start`.
  - 2026-10-29 run 40822645837은 실측 스크립트 문제로 실패했다. macOS는 `npm pack`이 postinstall
    `hydrate-symlinks.js`를 건너뛰었고, Windows는 `Start-Process -Wait`가 postgres 자식까지 기다렸다.
  - 고친 run 40827212076은 두 OS에서 통과했다.

    | 단계 | windows-2022 | macos-15 |
    | --- | --- | --- |
    | `npm ci` | 34초 | 18초 |
    | PostgreSQL 설치·기동 | 12초 | 4초 |
    | migrate deploy(31개) | 2초 | 1초 |
    | `npm run build` | 31초 | 26초 |
    | `/login` 200까지 | 1초 | 2초 |

  - PostgreSQL은 18.4였다. 토큰 없는 `POST /api/mcp`와 `POST /api/projects`는 401로 거부됐다.
- **0B (완료):** 플러그인 설치 출처를 두 OS에서 비교했다. 결과는 같았다.
  - 기본 주소: main(`7b6103d`), 캐시 97파일(= 추적 파일 수)
  - `#harness/e2e-smoke-workflow`: 실행 커밋(`719a73d`), 캐시 97파일
  - `#<sha>`: 실패(`Remote branch <sha> not found in upstream origin`)
  - 로컬 export: "Read from: <export>/plugin"(캐시 복사 없음)
  - Claude Code 2.1.312 설치는 10~32초였고, 플러그인 명령은 로그인 없이 동작했다.
- **0C (`E2E_CLAUDE_OAUTH_TOKEN` 필요):** macOS 러너에서 사례 1 하나를 `claude plugin eval`로 끝까지 돌린다.
  - 구독 토큰 인증, `--trust-plugin`, `--scaffold`, 샌드박스 안 Bash, 로컬 템플릿 모드, 보고된 비용을 확인한다.
- **검증:** 항목마다 결과와 실제 명령, 시간을 이 문서에 기록한다.

### Phase 1: 0단

- **작업 내용:** `plugin/bin/harness-skill-references.test.mjs`
- **검증:** `npm test` 녹색. 스킬에서 경로 하나를 일부러 틀리게 바꾸면 실패하는지도 본다.

### Phase 2: 1단 Windows `new-user` (`E2E_TEMPLATES_TOKEN` 필요)

- **작업 내용:** 리허설, helper와 그 시험, 워크플로의 `claude (windows-2022, new-user)`
- **검증:** 브랜치에서 녹색. 로그에서 토큰과 템플릿 문구를 검색해 0건인지 본다.

### Phase 3: 1단 `update`와 macOS

- **작업 내용:** 사전 상태 생성, matrix에 `macos-15` 추가
- **검증:** 네 job 녹색

### Phase 4: 1단 Codex Windows

- **작업 내용:** runtime 캐시 복원, 번들, `complete-init`
- **검증:** 녹색. 캐시가 없을 때 정해진 사유로 실패하는지도 본다.

### Phase 5: 2단

- **작업 내용:** 사례 4개, `agent-eval.yml`, `isShippedPluginFile` 제외와 그 시험
- **검증:** 녹색. 0.5.28 플러그인(`a750b76`)에 돌리면 사례 1이 실패해야 한다.

### Phase 6: 문서와 승격 절차

- **작업 내용:** `AGENTS.md`, `docs/architecture/verification.md`, 임시 워크플로 제거, PR, 머지
- **검증:**
  - `npm run check`, `npm run verify:server`, `npm run test:architecture`, `npm test`
  - 첫 승격 때 실제 적용

## 6. 영향 범위

- **직접 수정 대상:**
  - 신규: 0단 시험 1개, 1단 파일 5개(워크플로·리허설·리허설 시험·helper·helper 시험), 2단 워크플로 1개, 2단
    사례 디렉터리
  - 수정: `scripts/windows/package-windows-plugin.mjs`(한 줄), `scripts/checks/verify-plugin-version.test.mjs`,
    `AGENTS.md`, `docs/architecture/verification.md`
- **import 변경 필요:** 새 리허설은 다음만 import한다. 서버 내부 모듈은 직접 import하지 않는다.
  - `validateTestDatabase`, `withPrisma`, `newToken`
  - `plugin/runtime/mcp-client.mjs`의 `connectionInput`·`verifyProject`·`callTool`
  - 같은 폴더 helper
  - 플랜 변경은 `npm run plan:grant`를 자식 프로세스로 부른다.
- **외부 의존성:**
  - GitHub-hosted runner `windows-2022`·`macos-15`
  - Claude Code 공식 설치 스크립트와 `claude plugin eval`
  - Codex CLI(1단 설치만)
  - `@embedded-postgres/*` 18.4
  - 비밀값 2개: `E2E_TEMPLATES_TOKEN`(`Sangeok/harness-templates` 읽기 전용), `E2E_CLAUDE_OAUTH_TOKEN`(2단)
- **소비자/사용처 영향:**
  - 서버와 플러그인 동작은 바뀌지 않는다.
  - `isShippedPluginFile`은 `verify-plugin-version.mjs`와 `package-windows-plugin.mjs`가 쓴다(2026-10-29 검색).
    `plugin/evals/` 밖은 판정이 그대로다.
  - 승격 절차가 바뀐다.
  - 서버 경계 검사기 통과 여부는 구현 때 `npm run verify:server`로 확인한다. 동적 참조는 따로 열거하지 않았다.

## 7. 리스크 + 롤백 전략

### 리스크

- **1단 스크립트와 스킬 절차의 어긋남 (가능성 중간, 영향 중간):** 스킬 절차가 바뀌었는데 스크립트를 고치지 않으면
  1단은 옛 절차로 통과한다. 대응은 두 가지다. 스킬이 바뀌는 승격에서는 2단이 돈다. 0단이 스킬이 가리키는 명령과
  출력 문구를 대조한다.
- **2단의 흔들림:** 3회 반복과 `0.67` 기준으로 우연한 실패를 거른다. 실패한 job만 다시 돌린다.
- **구독 사용량 공유:** 2단은 사용자 구독 한도를 같이 쓴다. 사례 4개 × 3회의 짧은 격리 실행이다. 한도에 걸리면
  실패 사유로 드러난다. 상용화 뒤에는 회사 API 키로 옮긴다.
- **공개 로그 노출:**
  - 1단은 비공개 템플릿을 시드하지만 출력은 `summarize`의 허용 필드뿐이다. artifact는 올리지 않는다.
  - 2단은 가짜 템플릿만 쓴다.
  - `pull_request_target`은 쓰지 않는다.
  - checkout은 `persist-credentials: false`로 둔다.
- **Windows 실제 모델 동작 미검증:** 받아들이는 빈틈이다. Windows에서만 생기는 에이전트 문제가 실제로 나오면 주 1회
  Windows 실측을 추가한다.
- **러너와 실제 PC의 차이:** Windows Server 2022, 관리자 계정, 화면 없음. 해당 영역을 바꿀 때만 실기로 확인한다.
- **`workflow_dispatch` 제약:** 워크플로 파일이 `main`에 있어야 실행할 수 있다. 개발 중에는 임시 `push` 트리거를
  쓰고, 첫 승격은 작업 브랜치에서 돌린 결과로 판단한다.

### 롤백 전략

- 신규 파일을 지우고 수정한 네 파일을 되돌린다. 단순 revert다.
- 제품 동작, DB, 배포에는 영향이 없다.
- 비밀값은 저장소 설정에서 지운다.

## 8. 검증 전략

- **기존 테스트:** `npm run check`(lint, docs, tsc, `test:scripts`), `npm test`, `npm run verify:server`,
  `npm run test:architecture`. `tsconfig.json`의 include가 `**/*.ts`라서 새 리허설도 `tsc --noEmit`이 검사한다.
- **추가 테스트(helper):** 형식은 `scripts/test-server-integration.test.mjs`(`node:assert/strict`, `node:test`의 `it`,
  상대 import)를 따른다. 기대값은 helper 계약과 스킬 문구에서 바로 나오는 값이라 계산이 필요 없다.

```js
import assert from "node:assert/strict";
import { join } from "node:path";
import { it } from "node:test";
import { containsSecret, helperCommand, summarize } from "./client-init-smoke-steps.mjs";

it("runs the helper through the launcher on Windows and through node elsewhere, as the init skill says", () => {
  assert.deepEqual(helperCommand("win32", "C:/p", "init", ["--dry-run"]), {
    file: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join("C:/p", "bin", "harness.ps1"), "init", "--dry-run"],
  });
  assert.deepEqual(helperCommand("darwin", "/p", "init", ["--dry-run"]), { file: "node", args: [join("/p", "bin", "harness-init.mjs"), "--dry-run"] });
});

it("keeps only allowed summary fields and never a token", () => {
  const token = "hu_" + "x".repeat(43);
  const summary = summarize({ client: "claude", os: "windows-2022", scenario: "new-user", note: token, output: `Bearer ${token}` });
  assert.equal(JSON.stringify(summary).includes(token), false);
  assert.equal("output" in summary, false);
});

it("reports a token value without returning it", () => {
  const token = "hu_" + "x".repeat(43);
  assert.equal(containsSecret(`{"Authorization":"Bearer ${token}"}`, token), true);
  assert.equal(containsSecret('{"Authorization":"Bearer ${HARNESS_TOKEN}"}', token), false);
});
```

- **추가 테스트(0단):** 형식은 `plugin/bin/harness-watch.test.mjs`의 스킬 목록 시험(스킬 파일을 읽어 실제 파일과
  대조)을 따른다.

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { it } from "node:test";
import { capReason } from "../lib/plans/entitlement.mjs";

const PLUGIN = new URL("../", import.meta.url);
const PACKAGED = ["codex/skills/reconciling-proposals-with-codebase"];
const skillFiles = ["skills", "codex/skills"].flatMap(root => readdirSync(new URL(root, PLUGIN)).map(name => new URL(`${root}/${name}/SKILL.md`, PLUGIN))).filter(url => existsSync(url));

it("every plugin path a skill names exists, or is created by packaging", () => {
  const packaging = readFileSync(new URL("../scripts/windows/package-windows-plugin.mjs", PLUGIN), "utf8");
  for (const path of PACKAGED) assert.ok(packaging.includes(path), path);
  for (const file of skillFiles) {
    for (const [, path] of readFileSync(file, "utf8").matchAll(/`(?:\$CLAUDE_PLUGIN_ROOT\/)?((?:bin|lib|runtime|codex)\/[^`\s]+)`/g)) {
      assert.ok(existsSync(new URL(path, PLUGIN)) || PACKAGED.includes(path), `${file.pathname}: ${path}`);
    }
  }
});

it("the generator prints every marker the init skill tells the agent to read", () => {
  const generator = readFileSync(new URL("bin/harness-init.mjs", PLUGIN), "utf8");
  for (const marker of ["plan:", "write:", "skip(modified):", "skip(plan):", "refuse:", "server:", "Server URL required", "stop: server access was refused after file generation", "note: that entry was also this repository's only record of the server URL"]) assert.ok(generator.includes(marker), marker);
  assert.match(capReason("free", "workspaces"), /^workspace cap reached on the free plan/);
});
```

- **진입점 시험** (`rehearse-client-init-smoke.test.ts`): `rehearse-dual-client-runtime.test.ts`처럼 export한
  `parseArguments`와 `main`을 직접 부른다.
- **수동 확인:**
  - Phase 2~5의 CI 결과
  - 2단 회귀 증명(`a750b76`이면 사례 1 실패)
  - 공개 로그에 토큰과 템플릿 문구가 없는지 검색
- **시간 추정:**
  - 1단: 서버 준비 약 1~1.5분(0A 실측)과 Claude 설치 10~32초(0B 실측)에 스킬 절차를 더해 job당 약 5분으로 본다.
    job들은 동시에 돈다.
  - 2단: 0C에서 잰다.

---

<!-- doc-validation-skip -->
## Open Questions

- **[Phase 0C] 2단 실현성:** 구독 토큰(`CLAUDE_CODE_OAUTH_TOKEN`)이 `claude plugin eval`에서 동작하는지 확인해야
  한다. macOS 러너의 샌드박스 안에서 init 스킬이 로컬 템플릿 모드로 dry-run까지 가는지, `history_file` 사례가 도는지도
  확인하지 않았다.
- **[2단] 사례 위치와 대상 지정:** 사례를 `plugin/evals/`에 두고 대상을 경로(`plugin`)로 줄 때 결과 디렉터리 위치를
  확인해야 한다. 공개 저장소 결과물을 커밋하지 않도록 `.gitignore`도 필요하다.
- **[제품 계약] 처음 연결할 때의 쓰기 순서:**
  - `plugin/bin/harness-init.mjs:167`은 dry-run에서도 `harness.json`을 읽고, 없으면 `Config error`로 끝난다.
  - 스킬 1단계는 hu_ 토큰이면 초안을 보여 주기 전에 `--register`로 서버에 등록한다.
  - 계약 문장 "Show the dry run and get a yes before writing"이 이 둘을 예외로 두는지 정해야 한다. 2단 사례 2의
    판정이 이 결정에 달려 있다.
- **[범위] 클라이언트 버전:** 1·2단의 Claude Code를 `latest`로 둘지 고정 판으로 둘지, 2단 모델을 기본값으로 둘지
  정해야 한다.
- **[소유] Codex job:** Codex 실행기 영역을 Codex가 처리하기로 한 결정과 겹치는지 확인해야 한다. 1단 Codex job은
  init과 `complete-init`만 보고 런타임 코드를 바꾸지 않는다.
- **[별도 후속] 사용자가 고친 파일 보존:** Codex 쪽은 생성기 시험이 있다(`plugin/bin/harness-init-dual.test.mjs:143`).
  Claude 쪽은 이름으로 찾은 시험이 없다. 모델 없는 생성기 시험으로 추가하기를 권한다.

<!-- doc-validation-restore -->

## Approval

승인 전이다. 2026-10-29에 사용자가 3단 구성과 1장의 결정을 정하고 문서 수정을 지시했다. Phase 0C 결과로 2단의
실현성과 사례 형태를 확정해 이 문서에 기록한 뒤 구현으로 넘어간다.
