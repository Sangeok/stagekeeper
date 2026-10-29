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

# 클라이언트 E2E smoke 워크플로 기능 개발 문서

요약: `main` 승격 전에 수동으로 실행하는 GitHub Actions 워크플로 `e2e-smoke`를 추가한다. GitHub이 제공하는
Windows·macOS 러너에서 실제 Claude Code와 Codex가 사용자와 같은 방법으로 플러그인을 설치하고 `init`을
실행하는지 확인한다.

- Claude는 OS 2개 × 시나리오 2개로 job 4개를 둔다. 시나리오는 "새 사용자"와 "기존 사용자의 업데이트"다.
- Codex는 Windows job 1개를 둔다.
- job 5개가 동시에 돈다. 서버와 DB는 job마다 일회용으로 띄운다.
- 판정은 대화 문장이 아니라 파일·DB·설정·실행한 명령으로 한다. 공개 로그에는 결과 요약만 남긴다.
- 제품 코드(서버·플러그인)는 바꾸지 않는다.

## 1. 배경/동기

**사용자가 준 맥락.** 판을 올릴 때마다 사람이 Windows·Mac 기기를 켜고 직접 시험할 수 없다. CI/CD 안에서
Claude와 Codex가 실제로 동작하는지 자동으로 확인해야 한다. 2026-10-29에 사용자가 다음을 정했다.

| 결정 | 선택 |
| --- | --- |
| 깊이 | init만. 항목 인수는 다음 단계 |
| 실행 시점 | 승격 전 수동 실행, 실패하면 승격하지 않음. dev가 승격할 커밋에 도달하면 바로 돌려 둔다 |
| 실행 위치 | 공개 저장소 `Sangeok/stagekeeper`. 로그에는 요약만 남김 |
| 인증 | Anthropic·OpenAI API 키 |
| 권한 | 일회용 러너에서 권한 확인 생략(`--dangerously-skip-permissions`). 사용자가 모든 확인에 "허용"하는 것과 같다 |
| 플랜 | 새 사용자는 Free로 시작해 Pro로 올린다. Codex는 Pro로 시작한다 |
| job 구성 | 시나리오별로 job을 나눈다. 실패한 job만 다시 돌릴 수 있게 하기 위해서다 |

**코드베이스에서 확인한 맥락.**

- 현재 CI에는 모델 없는 계약 시험만 있다.
  - `.github/workflows/check.yml`: Linux에서 static·test·test-web·server·build를 돌린다. `postgres:18` 서비스로
    `npm run test:server:integration`도 돌린다.
  - `.github/workflows/windows-role-runtime.yml`: `windows-2022`에서 패치한 Node를 빌드·캐시하고 LPAC 역할
    시험을 돌린다.
  - `.github/workflows/macos-runtime-contracts.yml`: macOS에서
    `node --test "packages/core/**/*.test.mjs" "plugin/bin/*.test.mjs" "plugin/runtime/*.test.mjs"`를 돌린다.
- 실제 클라이언트가 플러그인을 설치해 init하는 흐름은 자동 검증이 없다. 지금까지는 사람이 PC에서 smoke로
  확인했다.
- 2026-10-29 smoke에서 init이 dry-run 뒤 yes 없이 파일을 쓰는 결함이 실제 에이전트 실행으로만 드러났다.
  PR #257, 0.5.29로 고쳤다. 결함은 `harness.json`이 이미 있고 트리가 깨끗한 재실행에서 두 번 모두 나타났다.
  모델 없는 시험은 이런 스킬·에이전트 행동을 볼 수 없다.
- macOS Claude는 코드상 지원하지만 실기 E2E 기록이 없다. Windows Codex는 번들 설치로만 동작한다. 번들은
  `scripts/windows/package-windows-plugin.mjs`가 만든다.

## 2. 목표 상태

### 목표

- 수동 실행 워크플로 `e2e-smoke`가 실행한 커밋으로 다음 다섯 job을 동시에 돌린다.
  - `claude (windows-2022, new-user)`
  - `claude (windows-2022, update)`
  - `claude (macos-15, new-user)`
  - `claude (macos-15, update)`
  - `codex (windows-2022)`
- 판정은 생성 파일, DB 행, 클라이언트 설정, 세션 기록 속 명령처럼 결정적인 증거로 한다.
- `main` 승격 절차에 "승격할 dev 커밋으로 `e2e-smoke`를 돌려 모든 job이 녹색이어야 한다"를 넣는다.
- 공개 로그와 artifact에는 결과 요약만 남긴다. 대화 기록, 비공개 템플릿 본문, 토큰은 남기지 않는다.

### 비목표

- 항목 하나를 계획부터 인수까지 돌리는 E2E. 사용자 결정에 따라 다음 단계로 미룬다.
- macOS Codex. 제품이 아직 지원하지 않는다. `plugin/bin/harness-background.mjs`가 `codex-windows`로 거부한다.
- Codex 역할 실행(run·resume, LPAC 역할 명령), Codex의 재실행과 Free 경로. Codex는 init의 `complete-init`까지만
  한 번 본다.
- 운영 서버와 운영 DB 사용. 운영 DB는 로컬과 공유한다.
- PR마다 자동 실행, 그리고 브랜치 보호 규칙으로 강제하는 것.
- 러너가 표현하지 못하는 동작: 로그온 자동 시작, 바탕화면 알림, Windows Home 전용 동작, 실제 결제 화면을 통한
  플랜 변경.
- 모델 없는 생성기 시험이 이미 다루는 경로. `plugin/bin/harness-init.test.mjs`가 여러 워크스페이스, adopt,
  `.mcp.json` 정리, 저장소 등록, hs_ 토큰, 소유자 토큰, Free 워크스페이스 한도를 다룬다.

### 성공 기준

`new-user` job (Claude, OS마다):

- **1회차, Free 사용자로 처음 연결**
  - 실제 생성기를 돌리기 전에 질문으로 끝나고, `.claude/agents/`가 없다. `harness.json`과 서버 등록은 yes 전에
    생길 수 있다. 이 부분은 Open Questions의 계약 결정이 날 때까지 관찰값으로만 기록한다.
  - 대답한 뒤 다음이 모두 성립한다.
    - `harness.json`에 `project.slug`가 있다.
    - `CLAUDE.md`와 에이전트 파일 3개(pm, feature-scout, 워크스페이스 에이전트)가 생긴다.
    - 생성기 출력에 `skip(plan):`이 4줄 있다.
    - DB에 해당 owner/repo의 `Project` 행이 있고 `runbookVersion`이 채워져 있다.
    - `claude mcp get harness`의 URL이 `<base>/api/mcp`이다.
    - 새 셸에서 읽은 `HARNESS_SERVER`가 base URL이다.
  - 끝나면 드라이버가 사용자처럼 커밋한다.
- **2회차, 재시작 뒤 아무것도 바뀌지 않은 재실행**
  - 실제 생성기를 돌리기 전에 질문으로 끝난다.
  - 드라이버는 대답하지 않고 세션을 끝낸다. 0.29에서 고친 결함의 조건이 바로 이 경우다.
- **Pro로 업그레이드:** `npm run plan:grant -- <login> pro`로 플랜을 올린다.
- **3회차, 재실행**
  - 질문으로 끝나기 전에 쓰지 않는다.
  - yes 뒤 빠졌던 에이전트 4개가 생겨 모두 7개가 된다.
  - `project_get`과 `project_sync` 호출이 성공한다.
  - DB `lastSyncedAt`이 채워지고, `Workspace` 행 수가 `harness.json`의 workspaces 수와 같다.

`update` job (Claude, OS마다, 다른 시험 사용자):

- **사전 상태(모델 없음)**
  - 지난 판(`previous-ref`, 기본 `origin/main`) 플러그인의 생성기로 저장소를 연결하고 커밋한다.
  - PC 설정은 지난 판 스킬의 명령대로 맞춘다: 사용자 범위 MCP 등록, `HARNESS_SERVER` 영구 저장.
  - 로스터는 DB `Workspace` 행과 과거 시각의 `lastSyncedAt`으로 맞춘다.
  - 이 단계가 성공하면 "지난 판 플러그인 + 새 서버" 조합도 확인한 셈이다. 승격하면 서버가 먼저 배포되므로
    기존 사용자가 바로 겪는 조합이다.
- **4회차, 새 판으로 재실행**
  - 질문으로 끝나기 전에 쓰지 않는다.
  - yes 뒤 생성기가 `refuse:` 없이 끝난다.
  - `project_get`과 `project_sync`가 성공하고, `lastSyncedAt`이 사전 상태보다 뒤로 갱신된다.

`codex` job (Windows, Pro 사용자):

- 번들을 설치하고 `$harness-init`을 실행하면 `.codex/agents/*.toml`과 `docs/harness/codex-runbook.md`가 생긴다.
- `complete-init`이 `connected`를 출력하고, DB `lastSyncedAt`이 채워진다.

공통:

- 세션 기록과 클라이언트 설정 파일에 토큰 원문이 없다.
- 실패한 job은 0이 아닌 종료 코드와 실패 사유 코드로 끝난다.

회귀 감지 증명:

- 플러그인만 0.5.28 커밋 `a750b76`으로 바꿔 돌리면 `new-user` job이 2회차에서 실패해야 한다.
- 0.5.28의 결함은 트리가 깨끗한 재실행에서만 나타났다. 처음 연결하는 1회차는 초안이 있어 옛 문구에서도 물을 수
  있으므로, 증명은 2회차 결과로 판단한다.

## 3. 대안 분석

### Option A: 사용자 PC를 self-hosted runner로 등록

- 장점: 실제 Windows 11 Home에서 돈다.
- 단점:
  - PC가 켜져 있어야 한다. "기기를 켜지 않는다"는 목표와 반대다.
  - init이 그 PC의 `HARNESS_SERVER`와 사용자 범위 MCP를 바꾼다.
  - macOS는 불가능하다.

### Option B: GitHub-hosted runner에 시나리오별 job을 두고, job마다 일회용 PostgreSQL·서버를 띄움

- 장점:
  - 기기가 필요 없다.
  - 러너가 매번 새로 만들어져서 기계 설정을 바꿔도 문제가 없다.
  - 공개 저장소라 러너 시간이 무료다.
  - 기존 리허설의 서버·fixture 패턴을 그대로 쓴다.
- 단점:
  - Windows·macOS 러너에는 서비스 컨테이너가 없다. PostgreSQL을 직접 띄워야 한다(Phase 0).
  - job마다 서버를 빌드하는 러너 시간이 든다. job이 동시에 돌기 때문에 대기 시간은 거의 늘지 않는다.

### Option C: Linux job에 서버를 띄우고, Windows·macOS job이 터널로 접속

- 장점: 서버 빌드를 한 번만 한다.
- 단점: 시험 서버를 인터넷에 노출해야 하고, job 사이 동기화가 복잡하다.

### Option D: 운영 서버와 E2E 전용 계정

- 장점: 서버 준비가 필요 없다.
- 단점: 운영 DB는 로컬과 공유해서 데이터가 오염된다. 운영 토큰을 CI 비밀값으로 둬야 한다.

### Option E: 모델 없는 가짜 클라이언트

- 장점: 비용이 없고 결정적이다.
- 단점: 이미 계약 시험이 하는 일이다. 이번 init yes 결함 같은 스킬·에이전트 행동을 못 잡는다.

### 선택: Option B

- 근거: 기기 없이, 운영 데이터에 영향 없이, 사용자와 같은 설치 경로를 실제 클라이언트로 돌리는 유일한 방법이다.
  - 서버 기동은 `scripts/rehearsals/rehearse-repository-disconnection.ts`의 방식을 따른다.
  - 시험 DB 검증은 `scripts/test-server-integration.mjs`의 `validateTestDatabase`를 따른다.
- 세부 선택
  - 한 job에서 4회차를 모두 도는 대신 시나리오별로 job을 나눈다. 모델 세션 수가 같아서 모델 비용은 같다.
    실패한 job만 다시 돌릴 수 있고, Free 프로젝트 한도 때문에 생기는 회차 순서 제약도 없어진다.
  - `update` job의 사전 상태는 지난 판 에이전트를 돌리지 않고 생성기와 명령으로 만든다. 이 job이 보려는 것은
    "새 판이 기존 상태를 어떻게 처리하느냐"다. 사전 상태는 결정적인 편이 낫고, OS당 약 $1.5도 아낀다.

## 4. 구현 계획

### 신규 코드

| 파일 | 역할 |
|------|------|
| `.github/workflows/e2e-smoke.yml` | `workflow_dispatch` 전용 워크플로. `claude` job(matrix `os` × `scenario`)과 `codex` job. 비공개 템플릿 checkout, PostgreSQL 준비, 클라이언트 설치, 리허설 실행, 요약을 `GITHUB_STEP_SUMMARY`에 쓰는 일을 맡는다 |
| `scripts/rehearsals/rehearse-client-init-smoke.ts` | 공통 도구. 시험 DB 검증, migrate deploy, 템플릿 시드, 사용자·구독·토큰 생성, `next start`, 시험 저장소와 사전 상태 생성, 플러그인 설치, 클라이언트 세션 구동, 판정, 정리를 한다. 표준 출력에는 요약 JSON 한 줄만 쓴다. `parseArguments`·`main`을 export한다 |
| `scripts/rehearsals/rehearse-client-init-smoke.test.ts` | 진입점 시험. `--help`는 0, 잘못된 인자는 2로 끝나고, `CI=true`도 `--allow-machine-changes`도 없으면 거부한다 |
| `scripts/rehearsals/client-smoke-transcript.mjs` | 순수 helper. `classifyTurn`(세션 기록 판정), `decideReply`(다음 대답 결정), `summarize`(허용한 필드만 남긴 요약), `containsSecret`(토큰 원문 포함 여부, 원문은 반환하지 않음) |
| `scripts/rehearsals/client-smoke-transcript.test.mjs` | 위 helper의 단위 시험. `test:scripts`가 `npm run check` 안에서 실행한다 |

배치 근거:

- `docs/architecture/verification.md`의 "책임별 위치와 명령" 표는 `rehearsals/`를 "제품 기능 인수 리허설"
  자리로 정한다. 같은 문서는 "독립 명령 하나를 위해 별도 폴더를 만들지 않는다"고 한다. 그래서 새 폴더를
  만들지 않는다.
- 같은 문서의 "스크립트와 CI의 경계"에 따라 경로 선택과 `GITHUB_STEP_SUMMARY` 기록은 워크플로가 맡는다.
  리허설은 인자와 환경 변수로 입력을 받는다.
- 시험 형식은 `scripts/rehearsals/rehearse-dual-client-runtime.test.ts`처럼 export한 함수를 직접 부른다.
- 진입점 계약은 `scripts/test-server-integration.mjs`와 같게 한다.

#### 리허설 입력과 안전장치

```text
node --import tsx scripts/rehearsals/rehearse-client-init-smoke.ts \
  --client <claude|codex> --scenario <new-user|update> \
  --templates <비공개 템플릿 checkout 절대 경로> --plugin-ref <커밋> [--previous-ref <커밋>] \
  [--snapshot <공개 저장소 밖 절대 경로>] [--budget-usd <세션당 상한>]
환경: TEST_DATABASE_URL(stagekeeper_test_*), 클라이언트 인증(ANTHROPIC_API_KEY 또는 Codex 로그인),
      CI=true 또는 --allow-machine-changes
```

- **기계 설정 보호:** init은 `HARNESS_SERVER`를 영구 저장하고(Windows `setx`, POSIX 프로필) 사용자 범위 MCP를
  등록한다. 그래서 `CI=true`도 `--allow-machine-changes`도 없으면 작업 전에 거부한다. 개발 PC의 운영 설정을
  덮어쓰지 않기 위해서다.
- **DB 연결:** `scripts/lib/prisma.ts`의 `withPrisma`를 쓴다. `DATABASE_URL`은 검증한 시험 DB URL로 둔다.
  서버 내부 모듈(`src/server/*`)은 import하지 않는다.
- **템플릿 시드:**
  - `npm run seed:templates -- --dir <templates>`를 그대로 호출한다.
  - `scripts/templates/seed-templates.ts`는 Codex 템플릿(`CODEX.runbook.md`)이 있으면 `--snapshot`을 요구한다.
    또 snapshot을 공개 저장소 안에 쓰는 것을 거부한다. 그래서 snapshot은 runner 임시 경로에 둔다.
  - 시드한 템플릿 커밋을 요약에 남긴다. `seed-templates.ts`는 `git -C <dir> rev-parse HEAD`로 그 값을 읽는다.

#### 리허설 흐름

1. **DB 준비:**
   - `validateTestDatabase(process.env)`로 시험 DB를 확인한다.
   - `node node_modules/prisma/build/index.js migrate deploy`를 실행한다. `integrationCommands()`의 첫 명령과 같다.
   - 템플릿을 시드한다.
2. **fixture 생성:**
   - `User`를 만든다. `login`은 시나리오별로 정하고, `githubId`는 음수로 한다.
   - `UserToken`은 `packages/core/tokens/token.mjs`의 `newToken("user")`로 `{ plain, hash }`를 만들고 `hash`만
     저장한다.
   - 플랜: `new-user`는 구독 행 없이 시작한다. 그러면 `DEFAULT_PLAN`인 Free가 된다. `codex`는
     `Subscription { plan: "pro" }`로 시작한다.
3. **서버 기동:**
   - `node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port <p>`를 실행한다.
   - 환경 변수는 `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `HARNESS_PUBLIC_URL`이다.
   - `/login`이 200을 줄 때까지 기다린다. `rehearse-repository-disconnection.ts`의 `start()`와 같다.
4. **시험 저장소:**
   - runner 임시 경로에 `git init -b main`으로 만들고, origin을
     `https://github.com/stagekeeper-e2e/<scenario>-<os>.git`로 둔다.
   - `package.json`(`"test": "node --test"`)과 시험 파일 하나를 커밋한다. 패키지는 하나뿐이라 Free 워크스페이스
     한도(1)에 걸리지 않는다.
   - 서버 등록은 GitHub을 호출하지 않는다(`src/server/rest/project-registration.ts`의 `registerProject`). 그래서
     실제 GitHub 저장소가 없어도 된다.
5. **Claude 세션 실행**
   - 명령: `claude -p "/harness:init" --dangerously-skip-permissions --max-budget-usd <상한> --output-format json`.
     이어서 대답할 때는 `--resume <id> "<대답>"`을 같은 옵션으로 실행한다.
   - 각 세션은 새 프로세스로 시작한다. 이것이 사용자의 재시작을 흉내 낸다.
   - 환경: `HARNESS_TOKEN`은 직접 넣는다. `HARNESS_SERVER`는 "새 셸"에서 읽은 값을 넣는다. Windows는
     `HKCU\Environment`, macOS는 로그인 셸에서 읽는다. 1회차에는 값이 없다.
   - 턴이 끝날 때마다 `decideReply`가 세션 기록을 보고 다음 행동을 고른다. 세션당 상한은 6턴이다.
     - 이 세션에서 실제 생성기가 이미 돌았으면 세션을 끝낸다. 마지막에 나오는 지식 문서 제안에는 대답하지 않는다.
     - `Server URL required`가 나왔으면 base URL로 대답한다.
     - 생성 전 질문으로 끝났으면 대답이 허용된 회차(1·3·4회차)에서만 `"yes"`로 대답한다. 2회차는 대답하지 않고
       끝낸다.
     - 실패 결과(`is_error`)나 질문 없이 끝나면 사유 코드와 함께 실패한다.
6. **`new-user` 시나리오:** 1회차 → 판정 → 커밋 → 2회차 → `npm run plan:grant -- <login> pro` → 3회차 → 판정.
7. **`update` 시나리오:**
   - `previous-ref`의 추적 파일에서 플러그인을 내보낸다.
   - 그 판의 `node plugin/bin/harness-init.mjs --register`로 등록한다. 돌려받은 slug로 `harness.json`을 쓰고, 같은
     판 생성기로 생성한 뒤 커밋한다.
   - 지난 판 스킬 4단계의 명령으로 사용자 범위 MCP를 등록하고 `HARNESS_SERVER`를 영구 저장한다.
   - `Workspace` 행과 과거 시각의 `lastSyncedAt`을 넣은 뒤 새 판으로 4회차를 실행한다.
8. **Codex:**
   - 번들 marketplace를 설치하고 `$harness-init`을 비대화형으로 실행한다. 정확한 명령과 플래그는 Phase 0에서
     정한다.
   - `.codex/agents/*.toml`, `docs/harness/codex-runbook.md`, `connected`, DB를 확인한다.
     출력 경로는 `plugin/bin/harness-init.mjs`의 codex 분기, `connected` 이벤트는 `plugin/bin/harness-codex.mjs`의
     `complete-init`에서 확인했다.
9. **출력과 정리:**
   - `summarize`의 결과 JSON 한 줄만 출력한다. 내용은 클라이언트, OS, 시나리오, 클라이언트 버전, 플러그인 커밋,
     템플릿 커밋, 회차별 단언 결과, 턴 수, 비용, 실패 사유 코드다.
   - 세션 기록과 생성 파일은 출력하지도 업로드하지도 않는다.
   - 서버를 종료하고, 실패하면 1로 끝난다.

#### 플러그인 설치 경로

- **Claude:**
  - GitHub 설치는 저장소를 받아 `~/.claude/plugins/cache/<marketplace>/<plugin>/<판>`에 복사한다. 반면 로컬 폴더
    marketplace는 그 자리에서 읽는다. 이 PC의 `stagekeeper-windows`도 `claude plugin list`에 "Read from: <폴더>"로
    나온다.
  - 그래서 Phase 0에서 먼저 GitHub 주소로 검사 커밋을 지정해 설치하는 방법을 확인한다.
    `claude plugin marketplace add`의 도움말은 소스로 "URL, path, or GitHub repo"를 받는다고 한다.
  - 커밋을 지정할 수 없으면 루트 `.claude-plugin/marketplace.json`(이름 `stagekeeper-local`, 소스 `./plugin`)과
    `git ls-files -- plugin`의 추적 파일을 내보내 로컬 경로로 설치한다. 이때는 설치 방식이 다르다는 점을 요약에
    남긴다.
- **Codex:**
  - `node scripts/windows/package-windows-plugin.mjs --output <새 디렉터리> --runtime <runtime>`으로 번들을 만들고,
    marketplace 매니페스트를 붙여 설치한다.
  - 설치 경로는 `docs/test-reports/completed/2026-10-05-windows-package-update.md`에 기록된
    `codex plugin add harness@<private-local-marketplace> --json`을 따른다.
  - runtime은 `windows-role-runtime.yml`과 같은 키(`node scripts/windows/windows-role-runtime-cache.mjs key`)로
    캐시에서 복원한다. 캐시가 없으면 "dev의 windows-role-runtime을 먼저 돌려라"로 실패한다. 빌드하지 않는 이유는
    콜드 빌드가 오래 걸리기 때문이다(이전 측정 약 47분).

#### 워크플로 골격 (`.github/workflows/e2e-smoke.yml`)

After (신규, 앞부분만 확정. 나머지 단계는 아래 표):

```yaml
name: e2e-smoke

on:
  workflow_dispatch:
    inputs:
      claude-version:
        description: Claude Code version or channel for the native installer
        required: true
        default: latest
      plugin-ref:
        description: Commit whose plugin is installed; empty means the run commit
        required: false
        default: ""
      previous-ref:
        description: Released commit for the update scenario
        required: true
        default: origin/main
      templates-ref:
        description: Private templates commit to seed
        required: true
        default: main

permissions:
  contents: read

concurrency:
  group: e2e-smoke
  cancel-in-progress: false

jobs:
  claude:
    name: claude (${{ matrix.os }}, ${{ matrix.scenario }})
    runs-on: ${{ matrix.os }}
    timeout-minutes: 60
    strategy:
      fail-fast: false
      matrix:
        os: [windows-2022, macos-15]
        scenario: [new-user, update]
    steps:
      - uses: actions/checkout@v5
        with:
          path: stagekeeper
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/checkout@v5
        with:
          repository: Sangeok/harness-templates
          ref: ${{ inputs.templates-ref }}
          token: ${{ secrets.E2E_TEMPLATES_TOKEN }}
          path: harness-templates
          persist-credentials: false
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: stagekeeper/package-lock.json
```

| 단계 | 내용 |
| --- | --- |
| PostgreSQL 18 | 1안은 npm의 포터블 배포본 `@embedded-postgres/<platform>@18.4.0-beta.17`이다. npm 무결성 해시로 고정되며 Windows x64·macOS arm64 모두 있다. 받은 뒤 `initdb --auth=trust`, `pg_ctl -w start`로 띄우고 `stagekeeper_test_e2e`를 만든다. Phase 0에서 확정한다 |
| 서버 빌드 | `npm ci` → `npm run db:generate` → `npm run build`. `check.yml`의 build part는 DB 환경 없이 `npm run build`를 돌린다 |
| Claude 설치 | 공식 설치 스크립트로 버전을 고정해 설치한다. macOS는 `curl -fsSL https://claude.ai/install.sh \| bash -s <version>`, Windows PowerShell은 `& ([scriptblock]::Create((irm https://claude.ai/install.ps1))) <version>`이다. 실행 중 자동 갱신은 `DISABLE_AUTOUPDATER=1`로 막는다 |
| 리허설 | `ANTHROPIC_API_KEY: ${{ secrets.E2E_ANTHROPIC_API_KEY }}`로 위 명령을 `--scenario ${{ matrix.scenario }}`로 실행한다. 출력 한 줄을 `GITHUB_STEP_SUMMARY`에 덧붙인다 |
| `codex` job | 같은 checkout과 서버 단계에 runtime 캐시 복원, 번들 패키징, Codex CLI 설치·로그인(`E2E_OPENAI_API_KEY`)을 더하고 리허설을 `--client codex`로 실행한다 |

트리거는 `workflow_dispatch` 하나로 둔다. 외부 포크 PR에서는 비밀값이 열리지 않아야 하고, 비용은 승격할 때만
들어야 하기 때문이다. `pull_request`·`pull_request_target`은 두지 않는다. 비밀값은 그 비밀값을 쓰는 job에만
넘긴다.

### 기존 코드 수정

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
  (`gh workflow run e2e-smoke.yml --ref dev`) and stop unless every job is green.
  Its summary names the commit it tested; promote only that commit.
```

지켜야 할 불변식: 기존 `verify:plugin-version` 규칙은 바뀌지 않는다. 승격 조건이 하나 늘 뿐이다.

**`docs/architecture/verification.md`**

- "자동 검사" 절의 macOS runtime contracts 항목 뒤에 `e2e-smoke` 항목을 추가한다. 내용은 다음과 같다.
  - 실행 조건: 수동, 승격 전
  - job 다섯 개, 비밀값 세 개
  - 로그 정책: 요약만, artifact 없음
  - 비용
- "책임별 위치와 명령"의 스크립트 표에 `rehearsals/rehearse-client-init-smoke.ts` 행을 추가한다. 내용은
  진입점, "`main` 승격 직전(CI)", 하는 일, 쓰기 범위(시험 DB, 러너의 사용자 설정)다.
- 같은 문서의 "실행 계약과 재사용" 2항에 따라 작업 디렉터리, 인자, 필수 환경 변수, 도구 버전, 쓰기 범위를
  기록한다.

## 5. 실행 순서

### Phase 0: 실현 가능성 실측

임시 워크플로를 작업 브랜치의 `push` 트리거로 돌린다. `workflow_dispatch`는 기본 브랜치에 파일이 있어야 하기
때문이다.

- **0A (비밀값 없음):** `windows-2022`·`macos-15`에서 다음을 확인하고 단계별 시간을 잰다.
  - 포터블 PostgreSQL 18 기동
  - `migrate deploy`, `npm run build`, `next start` → `/login` 200
- **0B (비밀값 없음):** Claude Code 설치, GitHub 주소로 커밋을 지정한 marketplace 추가·설치, 설치 위치(cache인지
  그 자리인지), 파일 집합 비교.
- **0C (`E2E_ANTHROPIC_API_KEY` 필요):** 다음을 확인한다.
  - `claude -p`가 API 키로 승인 질문 없이 도는지
  - `--dangerously-skip-permissions`가 러너 계정에서 허용되는지
  - `--max-budget-usd`가 동작하는지
- **0D (`E2E_OPENAI_API_KEY`·`E2E_TEMPLATES_TOKEN` 필요):** Codex CLI 설치, API 키 로그인, 비대화형
  `$harness-init` 명령과 플래그, 템플릿 시드(`--snapshot`).
- **검증:** 항목마다 성공·실패, 실제 명령, 소요 시간을 이 문서에 기록한다. 공개 가능한 내용만 남긴다.

### Phase 1: 판정 helper와 단위 시험

- **작업 내용:** `client-smoke-transcript.mjs`와 그 시험을 만든다. 시험 입력은 합성 JSONL이다. 실제 세션
  기록은 비공개 템플릿을 담고 있어 쓰지 않는다.
- **검증:** `npm run check`. `test:scripts`가 `scripts/**/*.test.mjs`를 포함한다.

### Phase 2: 리허설과 Windows `new-user` job

- **작업 내용:** 리허설 스크립트, 진입점 시험, `claude (windows-2022, new-user)`.
- **검증:**
  - 브랜치에서 돌려 녹색을 확인한다.
  - `plugin-ref=a750b76`(0.5.28)으로 다시 돌려 2회차에서 실패하는지 본다.
  - 로그에서 토큰과 템플릿 문구를 검색해 0건인지 확인한다.

### Phase 3: Windows `update` job

- **작업 내용:** 사전 상태 생성(지난 판 생성기, PC 설정, 로스터)과 4회차.
- **검증:** 녹색. 사전 상태 단계가 실패하면 지난 판과 새 서버가 맞지 않는다는 뜻이므로, 그 사유가 따로 보이는지
  확인한다.

### Phase 4: macOS job 두 개

- **작업 내용:** matrix에 `macos-15`를 추가한다.
- **검증:** 녹색. 새 셸의 `HARNESS_SERVER`는 로그인 셸 기준으로 확인한다.

### Phase 5: Windows Codex job

- **작업 내용:** runtime 캐시 복원, 번들 패키징, Codex 설치·로그인, `--client codex`.
- **검증:** 녹색. 캐시가 없을 때 정해진 사유로 실패하는지도 확인한다.

### Phase 6: 문서와 승격 절차

- **작업 내용:** `AGENTS.md`와 `docs/architecture/verification.md`를 갱신한다. 임시 push 트리거를 지우고 PR을
  머지한다.
- **검증:**
  - `npm run check`, `npm run verify:server`, `npm run test:architecture`
  - 첫 승격 때 `e2e-smoke`를 실제로 실행

## 6. 영향 범위

- **직접 수정 대상:**
  - 신규 5개: 워크플로, 리허설, 리허설 시험, helper, helper 시험
  - 수정 2개: `AGENTS.md`, `docs/architecture/verification.md`
- **import 변경 필요:** 새 리허설은 다음만 import한다. 기존 파일의 import는 바뀌지 않는다.
  - `scripts/test-server-integration.mjs`의 `validateTestDatabase`
  - `scripts/lib/prisma.ts`의 `withPrisma`
  - `packages/core/tokens/token.mjs`의 `newToken`
  - 같은 폴더 helper
  - 플랜 변경은 기존 `npm run plan:grant`를 자식 프로세스로 부른다. 서버 모듈을 직접 import하지 않는다.
- **외부 의존성:**
  - GitHub-hosted runner `windows-2022`·`macos-15`
  - Claude Code 공식 설치 스크립트, Codex CLI
  - 포터블 PostgreSQL 18(`@embedded-postgres/*`)
  - 비밀값 3개: `E2E_ANTHROPIC_API_KEY`, `E2E_OPENAI_API_KEY`, `E2E_TEMPLATES_TOKEN`. 마지막은
    `Sangeok/harness-templates` 읽기 전용이다.
  - Anthropic·OpenAI API 비용
- **소비자/사용처 영향:**
  - 서버와 플러그인 제품 코드는 바뀌지 않는다. 새 파일을 import하는 곳은 없다.
  - 사람과 에이전트의 `main` 승격 절차가 바뀐다.
  - 서버 경계 검사기는 `scripts/rehearsals/` 바로 아래 `rehearse-*.ts`를 리허설로 판정한다. 새 파일이 등록 없이
    통과하는지는 구현 때 `npm run verify:server`로 확인한다. 동적 참조는 따로 열거하지 않았다.

## 7. 리스크 + 롤백 전략

### 리스크

- **모델 비결정성으로 거짓 실패 (가능성 중간, 영향 중간)**
  - 한 번 실행에 Claude 세션이 OS당 4회, 모두 8회다. 회차가 많을수록 우연한 실패 가능성도 커진다.
  - 대응:
    - 판정은 파일·DB·명령 기록 위주로 한다. 문장 판정은 `Server URL required` 감지 하나뿐이다.
    - 권한 확인을 생략한다. auto 분류기의 판단에 결과가 흔들리지 않게 하기 위해서다.
    - 실패하면 사유 코드를 남긴다.
    - 실패한 job만 다시 돌린다(`gh run rerun --failed`). 비용 때문에 자동 재시도는 하지 않는다.
- **공개 로그 노출 (가능성 낮음, 영향 큼)**
  - 노출될 수 있는 것: 토큰, 비공개 템플릿 본문, 대화 기록.
  - 대응:
    - `::add-mask::`를 쓰고, 요약은 `summarize`가 허용한 필드만 남긴다.
    - artifact는 업로드하지 않는다.
    - `pull_request` 트리거를 두지 않고, `permissions: contents: read`로 둔다.
    - 두 checkout 모두 `persist-credentials: false`로 둔다. 에이전트가 권한 확인 없이 도는 러너에 템플릿 토큰을
      남기지 않기 위해서다.
  - Phase 2에서 로그를 검색해 확인한다.
- **비용 폭주:** 세션마다 `--max-budget-usd`, 세션당 6턴 상한, job 제한 60분, API 키 월 한도로 막는다. 월 한도는
  사용자가 설정한다.
- **러너와 실제 PC의 차이:** Windows Server 2022, 관리자 계정, 화면 없음. 이 차이에서만 생기는 문제는 잡지 못한다.
  해당 영역을 바꿀 때만 실기로 확인한다.
- **클라이언트 버전 변화:** 입력으로 버전을 지정하고 요약에 기록한다.
- **`workflow_dispatch` 제약:** 워크플로 파일이 기본 브랜치(`main`)에 있어야 실행할 수 있다.
  - 개발 중에는 임시 `push` 트리거를 쓴다.
  - 이 파일은 첫 승격에 함께 올라간다. 그 첫 승격은 작업 브랜치에서 돌린 결과로 판단한다.
- **러너 부족:** macOS arm64 러너 부족으로 취소된 이력이 있다. 재실행한다.
- **Codex 영역 소유:** 사용자는 Codex 실행기 쪽 항목을 Codex가 처리하도록 정했다. Codex job은 init만 보고
  런타임 코드를 바꾸지 않지만, 겹치는지 확인이 필요하다(Open Questions).

### 롤백 전략

- 신규 파일 5개를 지우고 두 문서 변경을 되돌린다. 단순 revert다.
- 제품 동작, DB, 배포에는 영향이 없다.
- 비밀값은 저장소 설정에서 지운다.

## 8. 검증 전략

- **기존 테스트:** `npm run check`(plugin-lib, lint, docs, typegen, tsc, `test:scripts`), `npm run verify:server`,
  `npm run test:architecture`. `tsconfig.json`의 include가 `**/*.ts`라서 새 리허설과 그 시험도 `tsc --noEmit`이
  검사한다.
- **추가 테스트:** 시험 형식은 형제 시험 `scripts/test-server-integration.test.mjs`(`node:assert/strict`,
  `node:test`의 `it`, 상대 import)를 따른다. 기대값은 helper 계약에서 바로 나오는 값이라 계산이 필요 없다.

```js
import assert from "node:assert/strict";
import { it } from "node:test";
import { classifyTurn, containsSecret, decideReply, summarize } from "./client-smoke-transcript.mjs";

const assistant = (content) => JSON.stringify({ message: { role: "assistant", content } });
const command = (id, text) => assistant([{ type: "tool_use", id, name: "PowerShell", input: { command: text } }]);
const output = (id, text) => JSON.stringify({ message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: text }] } });
const blocks = (id, text) => JSON.stringify({ message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] } });

it("treats a turn that ran only the dry run as waiting for the yes", () => {
  const turn = classifyTurn([command("a", "& powershell.exe -File C:/p/bin/harness.ps1 init --dry-run"), output("a", "plan: free")].join("\n"));
  assert.equal(turn.generatorRan, false);
  assert.equal(turn.needsServerUrl, false);
});

it("does not count registration or identity lookups as a generator run", () => {
  const turn = classifyTurn([
    command("a", "node /p/bin/harness-init.mjs --register"),
    command("b", "& powershell.exe -File C:/p/bin/harness.ps1 init --print-project"),
  ].join("\n"));
  assert.equal(turn.generatorRan, false);
});

it("flags a real generator run, including the Codex client form", () => {
  assert.equal(classifyTurn(command("a", "& powershell.exe -File C:/p/bin/harness.ps1 init")).generatorRan, true);
  assert.equal(classifyTurn(command("a", "node /p/bin/harness-init.mjs --client codex")).generatorRan, true);
});

it("reads the server request from text blocks as well as plain results", () => {
  assert.equal(classifyTurn([command("a", "node /p/bin/harness-init.mjs --dry-run"), output("a", "Server URL required")].join("\n")).needsServerUrl, true);
  assert.equal(classifyTurn([command("a", "node /p/bin/harness-init.mjs --dry-run"), blocks("a", "Server URL required")].join("\n")).needsServerUrl, true);
});

it("answers only while the generation yes is pending, and never in the no-change rerun", () => {
  const waiting = { generatorRan: false, needsServerUrl: false, isError: false };
  assert.deepEqual(decideReply({ ...waiting, needsServerUrl: true }, { session: 1, base: "http://127.0.0.1:1" }), { kind: "answer", text: "http://127.0.0.1:1" });
  assert.deepEqual(decideReply(waiting, { session: 1, base: "x" }), { kind: "answer", text: "yes" });
  assert.deepEqual(decideReply(waiting, { session: 2, base: "x" }), { kind: "stop" });
  assert.deepEqual(decideReply({ ...waiting, generatorRan: true }, { session: 3, base: "x" }), { kind: "stop" });
  assert.equal(decideReply({ ...waiting, isError: true }, { session: 1, base: "x" }).kind, "fail");
});

it("keeps only allowed summary fields and never a token", () => {
  const token = "hu_" + "x".repeat(43);
  const summary = summarize({ client: "claude", os: "windows-2022", transcript: `Bearer ${token}`, note: token });
  assert.equal(JSON.stringify(summary).includes(token), false);
  assert.equal("transcript" in summary, false);
});

it("reports a token value without returning it", () => {
  const token = "hu_" + "x".repeat(43);
  assert.equal(containsSecret(output("a", `Bearer ${token}`), token), true);
  assert.equal(containsSecret(output("a", "Bearer ${HARNESS_TOKEN}"), token), false);
});
```

- **진입점 시험** (`scripts/rehearsals/rehearse-client-init-smoke.test.ts`): export한 `parseArguments`와 `main`을
  직접 부른다.
  - `--help`는 0이다.
  - 모르는 인자는 2다.
  - `CI`와 `--allow-machine-changes`가 모두 없으면 DB·서버·클라이언트를 건드리기 전에 거부한다.
- **타입·빌드 검증:** `npm run check`에 `tsc --noEmit`이 들어 있다. 워크플로 문법은 Phase 2의 실제 실행으로
  확인한다.
- **수동 확인:**
  - Phase 2~5의 CI 실행 결과
  - 회귀 감지 증명: `plugin-ref=a750b76`이면 `new-user` job이 2회차에서 실패해야 한다
  - 공개 로그에 토큰, 템플릿 문구, 대화 기록이 없는지 검색
- **비용·시간 추정**
  - 2026-10-29 이 PC에서 init 세션 6번이 각각 0.6~2.6분 걸렸다.
  - 동시 실행 기준 대기는 가장 느린 job 기준 약 15~25분으로 추정한다. Phase 0A에서 실측한다.
  - 모델 비용은 Claude 두 OS 합쳐 약 $11~12다. Codex는 Phase 0D에서 측정한다.

---

<!-- doc-validation-skip -->
## Open Questions

- **[Phase 0A] PostgreSQL:** `@embedded-postgres` 18.4가 두 러너에서 `initdb`·`pg_ctl`로 뜨고 `migrate deploy`를
  통과하는지 확인하지 않았다.
- **[Phase 0B] 설치 방식:** GitHub 주소로 검사 커밋을 지정해 marketplace를 추가할 수 있는지 확인하지 않았다.
- **[Phase 0C] 헤드리스 실행:** 공식 문서는 `ANTHROPIC_API_KEY`를 쓸 때 대화형에서 승인을 묻는다고만 적었다.
  `-p` 모드, 권한 생략, `--max-budget-usd`가 러너에서 어떻게 동작하는지 확인한다.
- **[Phase 0D] Codex 비대화형 init:** `codex exec`로 `$harness-init`을 부르는 방법, 샌드박스·승인 플래그, API 키
  로그인 방법을 확인하지 않았다.
- **[제품 계약] 처음 연결할 때의 쓰기 순서:**
  - `plugin/bin/harness-init.mjs:167`은 dry-run에서도 `harness.json`을 읽고, 없으면 `Config error`로 끝난다.
  - 스킬 1단계는 hu_ 토큰이면 초안을 보여 주기 전에 `--register`로 서버에 등록한다.
  - 계약 문장 "Show the dry run and get a yes before writing"이 이 둘(`harness.json` 쓰기, 서버 등록)을 예외로
    두는지 정해야 한다. 그때까지 E2E는 둘을 관찰값으로만 기록한다.
- **[범위] 클라이언트 버전과 모델:** Claude 기본값을 `latest`로 할지 고정 판으로 할지, Codex 판, CI에서 쓸 모델을
  정해야 한다. 기본 모델이 실제 사용자와 가장 가깝다.
- **[사용자 작업] 비밀값과 한도:** `E2E_ANTHROPIC_API_KEY`, `E2E_OPENAI_API_KEY`, `E2E_TEMPLATES_TOKEN`(읽기 전용
  fine-grained token)을 만들고 월 한도를 정해야 한다.
- **[소유] Codex job:** Codex 실행기 영역을 Codex가 처리하기로 한 결정과 겹치는지 확인해야 한다.
- **[경계 검사] 새 리허설의 import:** 서버 내부 참조 등록 없이 `npm run verify:server`를 통과하는지 구현 때
  확인한다.
- **[별도 후속] 사용자가 고친 파일 보존:** Codex 쪽은 생성기 시험이 있다(`plugin/bin/harness-init-dual.test.mjs:143`).
  Claude 쪽은 이름으로 찾은 시험이 없다. E2E가 아니라 모델 없는 생성기 시험으로 추가하기를 권한다.

<!-- doc-validation-restore -->

## Approval

승인 전이다. 2026-10-29에 사용자가 1장의 결정을 정하고 Phase 0 착수를 지시했다. Phase 0 결과로 PostgreSQL 준비,
설치 방식, 헤드리스 실행, Codex 실행 명령을 확정해 이 문서에 기록한 뒤 Phase 1로 넘어간다.
