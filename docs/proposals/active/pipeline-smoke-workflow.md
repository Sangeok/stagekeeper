---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-02"
approved-by: "user"
approved-at: "2026-11-02"
approval-scope: "이 설계와 PR 1(DB 준비 composite action 공유)·PR 2(pipeline-smoke 워크플로·리허설·순수 함수와 시험·init 리허설 export·AGENTS.md 승격 조건·verification.md)의 순서. E2E_TRANSCRIPT_KEY 생성과 등록, 이 PC에서 Open Question 1 사전 확인(claude -p 1회), PR 2 draft와 그 브랜치의 수동 실행(Phase 3 1~2회), 등록용 임시 push 트리거, Phase 4 임시 원격 브랜치 push·삭제와 음성 증명 1회. 첫 녹색 실행을 #275의 승격 전 확인으로 쓰는 #272~#276 승격(두 번 실패하면 운영 실기로 대체). PR 머지, 제품 코드·마이그레이션·템플릿 변경은 포함하지 않는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-10-30-client-e2e-smoke-workflow.md"
---

# pipeline-smoke: 실제 모델로 항목 하나를 인수까지 돌리는 CI 기능 개발 문서

요약: 지금 CI는 플러그인 설치와 init만 본다. 이 문서는 그 위에 검사 하나를 더한다. CI가 `dev` 커밋으로 서버를
띄우고 그 커밋의 플러그인을 설치한 뒤, 무인 실행기(`/harness:background`)가 실제 Claude로 백로그 항목 하나를
배정부터 구현 검증, 인수, 문서 감사까지 처리하는지 본다. 사람 입력은 없다.

| 검사 | 무엇을 보나 | 언제 | 비용 |
| --- | --- | --- | --- |
| `client-init-smoke` (있음) | 설치와 init. 모델 없음 | 서버·플러그인 PR, 승격 전 | 0원 |
| `agent-eval` (있음) | 실제 모델이 init 스킬을 따르는지 | 플러그인 출하 파일이 바뀐 승격 전, 주 1회 | 구독 사용량, 1회 정가 환산 약 $4.3 |
| **`pipeline-smoke` (새로)** | 실제 모델과 무인 실행기가 항목 하나를 배정·계획·계획 검증·구현·구현 검증·인수·문서 감사까지 처리하는지 | 파이프라인 경로가 바뀐 승격 전, 역할 템플릿 시드 전, 주 1회 | 구독 사용량, 1회 정가 환산 약 $14~19(추정, Phase 3에서 실측) |

제품 코드(서버·플러그인 동작)는 바꾸지 않는다. 작업은 PR 두 개로 나눈다.

- **PR 1:** `client-init-smoke`의 DB 준비 단계를 공유 composite action으로 옮긴다.
- **PR 2:** 다음을 담는다.
  - 새 워크플로와 리허설
  - 순수 함수와 그 시험
  - init 리허설의 함수 공개(export)
  - 승격 절차 문서

## 1. 배경/동기

**사용자가 준 맥락**

- 2026-10-29: "일일이 내가 수동으로 테스트할 수 없잖아." 이 요구로 CI E2E 3단 구성(`client-init-smoke`·`agent-eval`)이
  생겼다.
- 2026-11-02: 사용자가 `e2e-smoke`라는 이름이 맞지 않다고 지적했다. 확인해 보니 두 검사는 설치와 init만 보고 있었다.
  PR #274에서 이름을 `client-init-smoke`로 바꾸고 범위를 AGENTS.md에 적었다.
- 2026-11-02 사용자 결정:
  - 실행 시점: 파이프라인 관련 변경이 있는 승격 전, 그리고 주 1회
  - 전사(모델의 도구 호출과 출력) 보관: 암호화 artifact
  - 역할 범위: 기본 그래프에 impl-verify를 더한다. qa와 발굴은 나중에 따로 다룬다.
  - 작업 단위: 공유 action을 별도 PR로 먼저 낸다.

**코드베이스에서 확인한 맥락**

- 승격 조건은 `client-init-smoke`와 `agent-eval`만 요구한다. 둘은 "check plugin installation and init only; neither
  runs the pipeline"이다(`AGENTS.md:97-101`).
- `client-init-smoke`가 부르는 MCP 도구는 `project_sync` 하나다(`scripts/rehearsals/rehearse-client-init-smoke.ts`의
  `SYNC` 상수).
- 파이프라인 엔진은 서버에 있다. 서버 통합 시험이 모델 없이 엔진을 덮는다(예:
  `tests/server/integration/pipeline-work-nodes.test.ts`). 다음 두 가지는 못 덮는다.
  - 모델이 계약 문구, MCP 도구 설명, 힌트, 역할 템플릿을 읽고 실제로 맞게 행동하는지
  - 무인 실행기와 watch 스킬의 `--once` 경로가 실제 Claude Code에서 끝까지 도는지

**실기에서 나온 증거 (2026-11-02, 0.5.33, 운영)**

- (1) work-assigner가 `assignment_context`에 `entry.runId`를 넣었다가 거부됐고, `receipt.runId`로 다시 불렀다.
- (2) work-assigner 지시문에 pm 본문이 그대로 들어가 "1~2개 고르기"와 "한 개만 배정"이 함께 있었다.
- 둘 다 실제 모델 실행에서만 드러났고, PR #275로 고쳤다.

**임시 규칙의 한계**

지금은 파이프라인 관련 승격 전에 내가 실기 E2E를 돌린다(약 30분, 정가 환산 $17). 그런데 운영 실기는 `main`에
배포된 서버만 본다. 그래서 서버 변경은 승격 전에 확인할 수 없다.

localhost에서 돌리려면 이 PC의 `HARNESS_SERVER`와 사용자 범위 MCP 등록을 바꿔야 한다. 같은 이유로 init 리허설도
개발 PC에서 돌리지 않는다(`docs/architecture/verification.md:321`).

## 2. 목표 상태

### 목표

- 사람 입력 없이 끝까지 돈다. CI가 대상 커밋으로 `next start`를 띄우고 그 커밋의 플러그인을 GitHub 브랜치로
  설치한다. 그다음 무인 실행기가 실제 Claude로 백로그 항목 하나를 끝까지 처리한다.
- 제품의 무인 경로를 한 번에 통과한다. 이 경로는 다음 다섯 가지로 이루어진다.
  - 실행기(`plugin/bin/harness-background.mjs`)
  - watch 스킬 7절(`--once`)
  - 서버 파이프라인
  - MCP 도구 설명과 힌트
  - 역할 템플릿
- 다음 역할이 실제로 돈다.
  - work-assigner
  - 작업 공간 개발 역할(계획과 구현)
  - plan-verifier
  - impl-verifier
  - 메인 루프(인수)
  - doc-auditor

  역할 템플릿 7개 중 5개(`pm`을 빌려 쓰는 work-assigner, `dev`, `plan-verifier`, `impl-verifier`, `doc-auditor`)를
  거친다.
- 멈춘 상태를 원인별 이름으로 바로 실패시킨다. 원인이 보이지 않는 시간 초과로 끝나지 않게 한다.
- 공개 로그에는 허용 필드만 담은 요약을 남긴다. 실행 기록과 세션 전사는 키로 봉인한 artifact로 7일 보관한다.
  시간 초과로 끝난 실패에서도 봉인 파일은 남는다.
- 승격 조건에 들어간다.
  - 파이프라인 경로가 바뀐 승격 전에 `dev`에서 돌리고, 녹색일 때만 승격한다.
  - 녹색이어도 요약의 거부 수(`harnessErrors`·`stepRefusals`)가 0이 아니면, 승격 전에 봉인 전사로 원인을 확인한다.
  - 주 1회 `main`에서 돌려 모델과 템플릿의 변화를 잡는다.
  - 경로 목록은 시험이 실제 경로인지 확인한다.
- 역할 템플릿 PR은 운영 시드 전에 `templates-ref` 입력으로 같은 검사를 돌릴 수 있다.

### 비목표

- **Codex.** Codex 실행기는 Windows 전용이다(`plugin/bin/harness-background.mjs`의 `codex-windows` 거부). Codex 공개
  배포에 착수할 때 붙인다. 2026-10-30에 Codex job을 보류한 결정과 같은 이유다.
- **qa-verifier.** 화면이 있는 픽스처와 브라우저가 필요하다(2026-11-02 결정으로 나중에 따로 한다).
- **발굴과 새 일을 만드는 노드.** `discover-work`, `scout`, 레거시 `propose`는 그래프에서 뺀다. 항목 하나를 끝낸 뒤에도
  새 일을 만들어 실행이 끝나지 않고, 무엇을 만들지 정해져 있지 않아 판정하기 어렵다.
- **여러 OS 동시 실행.** 1회 비용이 커서 OS는 하나만 쓴다.
- **게이트·보류·인수 실패를 정상적으로 처리하는 경로.** 게이트 없는 파이프라인으로 돈다. 이 상태들은 조기 실패로
  알아채기만 한다. 정상 처리는 서버 통합 시험과 웹 리허설이 맡는다.
- **PR마다 자동 실행.** 비용 때문에 수동 실행과 예약만 둔다.
- **정량 평가.** 같은 사례를 여러 번 돌려 점수를 내는 일은 `agent-eval`의 몫이다. 이 검사는 1회 통과 여부와 관찰 숫자만
  남긴다.
- **비용 상한 인자.** 실행기는 `claude -p`에 고정 인자만 넘긴다(`plugin/runtime/background.mjs:71`). 비용을 묶는 것은
  대기 마감뿐이다. 상한 인자는 제품 코드를 바꿔야 하므로 다루지 않는다.
- **오류 없이 지나가는 지시문 충돌.** 실기 증거 (2)처럼 모델이 서로 어긋나는 지시를 받고도 오류 없이 맞게 행동하면
  이 검사에는 드러나지 않는다. 픽스처 백로그는 항목이 하나뿐이라 배정 개수에 관한 지시도 시험되지 않는다. 이런
  결함은 봉인 전사를 읽어야 보인다.

### 성공 기준

1. `windows-2022`에서 1회 실행하면 사람 입력 없이 항목이 백로그에서 `pipeline-completed`까지 간다. 대기 한도는 75분,
   job 한도는 120분이다.
2. 리허설이 결과를 직접 확인한다. 아래가 모두 맞아야 한다.
   - 구현이 백로그 Source가 정한 동작을 따른다. 리허설이 독립 사례 6개를 직접 실행해 본다(2026-11-04에 5개에서
     늘림).
   - 작업 트리가 깨끗하다.
   - 실행기 시작 전보다 커밋이 늘었다.
   - `node --test`가 통과한다.
3. 배정 근거가 남는다. board item의 `selectionDecision`이 비어 있지 않다.
4. 역할이 실제로 돌았다. 프로젝트의 AgentRun에 `PIPELINE_ROLES` 다섯 역할이 모두 있다.
5. 멈춘 상태는 원인별 이름으로 바로 실패한다(`waitVerdict` 단위 시험).
6. 공개 로그에는 요약 한 줄과 step summary만 남는다. 토큰 모양과 토큰 값은 0건이어야 한다(`secret-scan` 단계).
7. 실패한 실행에서도 봉인 파일이 artifact로 남고, 로컬 키로 열린다. 이것은 음성 증명에서 확인한다. 다른 키나
   변조된 파일로는 열리지 않는다(단위 시험).
8. 음성 증명: 게이트를 남긴 임시 브랜치에서 돌리면 `item-gated` 단계에서 실패한다.
9. 회귀: PR 1과 PR 2 모두에서 `client-init-smoke` 네 job이 녹색이다.
10. AGENTS.md 승격 조건과 `verification.md`에 반영된다.
    - 경로 목록의 경로가 모두 실제로 있는지 시험이 확인한다.
    - 사람이 돌리던 임시 실기 규칙은 이것으로 대체한다.

## 3. 대안 분석

### Option A: 사람이 운영에서 실기 E2E (현재 임시 규칙)

- 장점: 운영 서버와 사용자 PC에서 돌아 가장 실제와 같다.
- 단점:
  - 서버 변경은 승격 뒤에야 보인다.
  - 1회에 약 1시간이 들고, 승격마다 내가 직접 돌려야 한다.

### Option B: 모델 없는 파이프라인 시나리오를 `client-init-smoke`에 붙인다

- 장점: 비용이 0원이고 결과가 결정적이다.
- 단점:
  - 엔진은 서버 통합 시험이 이미 덮는다.
  - 실기에서 나온 결함 종류(모델이 문구를 어떻게 읽는지)를 잡지 못한다.
  - 2026-11-02 첫 추천이었지만 확인 뒤 철회했다.

### Option C: CI에서 `claude --bg`로 대화형 `/harness:watch`를 돌린다

- 장점: 0.5.33 실기와 같은 방식이다.
- 단점:
  - watch는 시작할 때 커밋 여부와 새 작업 여부를 묻는다.
  - `--bg` 세션은 worktree로 격리되고, 그 실기에서 worktree guard 거절이 6건(본 세션 5, plan-verifier 1) 나왔다.
  - 무인 실행이라는 제품 경로가 아니다.

### Option D: `claude plugin eval`로 파이프라인 사례를 만든다

- 장점: 반복 실행과 채점 도구가 이미 있다.
- 단점: 2026-10-29 0C 실측에서 eval 샌드박스는 `.claude/agents` 쓰기를 막았고(EPERM) 서버도 없었다. 파이프라인을 돌릴
  수 없다.

### Option E: `client-init-smoke` 위에 무인 실행기를 얹은 CI (선택)

- 장점:
  - 제품의 무인 경로를 그대로 탄다. 실행기가 `claude -p "/harness:watch --once --session <id>"`를 띄운다
    (`plugin/runtime/background.mjs:71`).
  - 서버, DB, 설치, init은 이미 녹색인 리허설을 재사용한다.
  - `dev` 커밋의 서버로 돌리므로 승격 전에 볼 수 있다.
- 단점: 1회에 정가 환산 약 $14~19어치 구독 사용량과 약 50~60분이 든다(추정). 모델이 비결정적이다.
  - 근거: 0.5.33 실기에서 watch 비용은 정가 환산 $14.54였고, 배정부터 인수까지 27분이 걸렸다. 이때 dev와
    plan-verifier는 사용자 설정 때문에 Opus 4.8로 돌았다.
  - CI에서는 init을 모델 없이 하므로 init 비용 $2.68이 빠진다.
  - impl-verifier 한 번을 더하면 약 $2~4와 10분 안팎이 늘어난다(추정).
  - 서버 빌드, DB 준비, 설치에 약 8~10분이 더 든다.

### 선택: Option E

- 근거: 실기에서 나온 결함 가운데 멈춤이나 서버 거부로 드러나는 종류를 승격 전에 볼 수 있는 유일한 안이다. 이미
  검증된 리허설 위에 얹을 수 있다.
  - 멈춘 항목은 원인별 이름으로 빨강이 된다.
  - 모델이 스스로 고친 거부(실기 증거 (1))는 녹색으로 끝나지만, 요약의 거부 수로 드러난다. 0이 아니면 승격 전에
    사람이 봉인 전사로 원인을 확인한다(2026-11-02 결정).
  - 오류 없이 지나간 지시문 충돌(실기 증거 (2))은 드러나지 않는다(비목표).

### 세부 선택

| 항목 | 선택 | 근거 |
| --- | --- | --- |
| OS | `windows-2022` | 소유자 기기와 같다. 실행기의 Windows 경로(`harness.ps1` → `runtime/windows/job-launch.ps1`)가 가장 복잡하다. 모델 쪽 결함은 OS와 무관하므로 한 OS면 충분하다 |
| 시점 | 파이프라인 경로가 바뀐 승격 전 수동 실행, 역할 템플릿 시드 전, 주 1회 | 2026-11-02 사용자 결정 |
| 예약 시각 | 수요일 18:00 UTC(목요일 03:00 KST) | 사용자가 작업하지 않는 시간에 같은 구독을 쓴다. 예약은 기본 브랜치(`main`)에서만 돈다. `agent-eval`(월요일 03:00 UTC)과 날짜를 나눈다 |
| 동시 실행 | `agent-eval`과 함께 필요하면 그것이 끝난 뒤 dispatch | 두 워크플로가 같은 구독을 쓰고 concurrency 그룹이 다르다(`.github/workflows/agent-eval.yml:16-18`). 함께 돌면 사용량 한도에 걸릴 수 있다 |
| PR 실행 | 없음 | 1회 비용이 크다 |
| 전사 | AES-256-GCM으로 봉인해 artifact로 7일 보관 | 2026-11-02 사용자 결정. 저장소가 공개라 artifact를 GitHub에 로그인한 누구나 받을 수 있다 |
| 권한 | 실행기가 고르는 그대로 둔다. 시작 때 auto 모드를 시험해 보고(`probePermission`, `plugin/bin/harness-background.mjs:206`), 안 되면 허용 목록으로 내려간다. 고른 결과는 요약에 남긴다 | 제품 경로를 바꾸지 않는다 |
| 모델 | 기본값. 실제로 쓰인 모델은 요약에 남긴다 | 사용자와 같은 조건. 모델마다 나눠 돌리지 않는다(2026-11-03 사용자 확인). 이 실행은 계약 문구, 힌트, 역할 템플릿, 실행기의 결함을 보려는 것이고, 모델에 따라 달라지는 잘못된 호출은 서버 계약 검사가 모델과 무관하게 거부한다 |
| 그래프 | 단계 `assign-work`, `plan`, `verify`, `implement`, `impl-verify`, `accept`, `doc-audit`. 게이트 없음 | Pro 기본 그래프(`packages/core/pipeline/pipeline.mjs:48-50`)에서 `discover-work`를 빼고, 선택 노드 `impl-verify`를 더했다(2026-11-02 결정). 순서 규칙 "impl-verify must be between implement and accept"(`pipeline.mjs:60`)를 따른다. 게이트 제거는 Pro에서만 된다(`pipelineEdit`, `packages/core/plans/entitlement.mjs:13`) |
| 새 작업 | `--propose yes` | `propose`가 false면 실행기는 overview head(work-assigner 포함)를 일로 보지 않는다(`plugin/lib/execution/watch.mjs:154`). 그러면 배정을 시작하지 않는다 |
| 백로그·파이프라인 입력 | 웹 action이 부르는 것과 같은 서비스 함수 | `savePipelineDefinition`(`src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts:20`), `addBacklog`(`src/fsd/features/edit-backlog/api/edit-backlog.server.ts:14`). 세션만 건너뛰고 검증은 그대로 탄다 |
| 대기 판정 | 순수 함수 `waitVerdict`에 세 가지를 넘긴다: 서버 `nextFor`(공개 `api`)의 결과, board 상태, 실행기 `--status` | 항목이 왜 멈췄는지는 서버가 이미 한 곳에서 판정한다(`src/server/pipeline/run-rules.ts:52` `decideNext`). 그 판정을 다시 짜지 않는다 |
| 시간 예산 | job 120분, 리허설 step 108분, 리허설 내부 마감 100분, 대기 기본 75분 | 시간 초과로 끝나도 봉인할 시간을 남긴다(4장 시간 예산) |
| DB 준비 단계 | composite action 하나를 두 워크플로가 함께 쓰고, PR 1로 먼저 낸다 | #276에서 같은 날 두 번 고친 단계다. 한 곳에서 관리하고, 승격 조건 워크플로를 바꾸는 일은 따로 확인한다(2026-11-02 결정) |

## 4. 구현 계획

### PR 나누기

| PR | 파일 | 확인 |
| --- | --- | --- |
| PR 1 | `.github/actions/smoke-database/action.yml`(신규), `.github/workflows/client-init-smoke.yml`(수정) | PR의 `client-init-smoke` 네 job(회귀) |
| PR 2 | 아래 "신규 코드" 중 PR 1 것을 뺀 여섯 파일, `scripts/rehearsals/rehearse-client-init-smoke.ts`, `AGENTS.md`, `docs/architecture/verification.md` | 단위 시험, PR의 `client-init-smoke`(회귀), 브랜치 dispatch 실제 실행, 음성 증명 |

PR 2는 PR 1이 `dev`에 머지된 뒤 최신 `dev`에서 브랜치를 만든다.

### 신규 코드

| 파일 | PR | 역할 |
| --- | --- | --- |
| `.github/actions/smoke-database/action.yml` | 1 | 포터블 PostgreSQL 18 기동(Windows·macOS), `stagekeeper_test_*` DB 생성, `migrate deploy` |
| `.github/workflows/pipeline-smoke.yml` | 2 | `windows-2022` job 하나. 비밀값 3개 확인 → 의존성·Prisma·DB → 서버 빌드 → 템플릿 checkout(`templates-ref`) → Claude Code 설치 → 리허설 → 봉인 파일 upload |
| `scripts/rehearsals/rehearse-pipeline-smoke.ts` | 2 | 리허설 진입점. 인자와 안전 거부, 아래 단계 실행, 대기, 정리, 봉인, 요약 출력 |
| `scripts/rehearsals/rehearse-pipeline-smoke.test.ts` | 2 | 인자, 기계 설정, DB, 전사 키를 작업 전에 거부하는지 시험한다 |
| `scripts/rehearsals/pipeline-smoke-steps.mjs` | 2 | 순수 함수 모음: 픽스처, 독립 판정, 대기 판정, 실행 기록 집계, 공개 요약, 승격 경로 목록, 봉인·열기·쓰기 |
| `scripts/rehearsals/pipeline-smoke-steps.test.mjs` | 2 | 위 순수 함수의 시험 |
| `scripts/rehearsals/open-pipeline-transcripts.mjs` | 2 | `--key-file`, `--in`, `--out`만 받아 `openTranscripts`와 `writeTranscripts`를 부르는 CLI |

### 리허설 흐름

아래 단계 이름이 요약의 `steps`에 그대로 남는다. 앞쪽 단계는 init 리허설의 함수를 import해서 재사용하므로,
`client-init-smoke`와 같은 판정을 받는다.

| 단계 | 하는 일 | 실패 조건 |
| --- | --- | --- |
| `seed-templates` | init 리허설의 `seedTemplates` | 명령 실패, 커밋 없음 |
| `fixture` | init 리허설의 `createFixtureUser` | DB 오류 |
| `server` | init 리허설의 `startServer`(`127.0.0.1:45438`) | 120초 안에 `/login` 200 없음 |
| `repository` | `createRepository(work, "pipeline")` 뒤 `FIXTURE_FILES`를 쓰고 `chore: add slug module`로 커밋한다 | git 실패 |
| `plugin-install` | init 리허설의 `installPlugin`. GitHub 브랜치로 설치하고 clone HEAD가 대상 커밋인지 확인한다 | 커밋 불일치 |
| `register` ~ `pro-sync` | init 리허설의 `newUser(smoke, plugin, "pipeline", …)`. Free로 처음 연결하고, 바뀐 것 없이 재실행하고, Pro로 올려 재생성하고, 동기화한다 | 기존 판정 그대로 |
| `pro-roles-commit` | Pro로 생성된 역할 파일을 커밋한다. 실행기는 작업 트리가 더러우면 시작을 거부한다 | git 실패 |
| `pipeline-saved` | 기본 파이프라인을 `PIPELINE_STEPS`, `gates: []`로 저장한다 | `status !== "success"` |
| `backlog-added` | `BACKLOG_ITEM`을 owner 항목으로 추가하고 key를 받는다 | `ok: false` |
| `runner-start` | HEAD를 `headBeforeRunner`로 기록한 뒤 `helperCommand(process.platform, plugin.root, "background", ["--start", "--root", repo, "--propose", "yes"])`를 `run.succeed(…, "background start", 300_000)`로 실행한다. `Run.command`의 기본 한도는 120초인데, 시작은 권한 탐침(`PROBE_LIMIT` 120초)과 시작 확인(`START_WAIT` 20초)에 요청 재시도까지 더해 이를 넘을 수 있다(`plugin/bin/harness-background.mjs:27-28`). 마지막 줄 JSON이 `started`이면 `permission`을 기록한다 | `started` 아님 |
| `item-assigned` | 15초마다 board item과 `selectionDecision`을 본다. 없으면 `waitVerdict({ next: null, …, timeoutStep: "item-assigned" })`(실행기 시작 뒤 20분) | `waitVerdict`가 실패를 내면 그 이름으로 기록 |
| `item-done` | 15초마다 `nextFor`와 board 상태를, 1분마다 `--status`를 읽어 `waitVerdict`에 넘긴다(대기 마감까지) | 같음. 예: `item-held`, `acceptance-failed`, `impl-verify-failed`, `item-gated`, `item-handoff`(핸드오프가 5분 넘게 이어짐), `runner-ended`, `runner-waiting`, `item-done` |
| `roles-ran` | 프로젝트 AgentRun의 `agent`에 `PIPELINE_ROLES`가 모두 있다. `stepRefusals`(AgentRun `refused`의 합)를 기록한다 | 빠진 역할 |
| `runner-stop` | `--stop`을 보낸 뒤 5초마다 `--status`를 읽는다. 15분, 또는 리허설 마감에서 봉인 몫 5분을 뺀 시각 중 이른 쪽까지 기다린다. `running:false`이고 `held:false`여야 한다 | 시간 초과 또는 `held` |
| `implementation-check` | 작업 트리가 깨끗하고 HEAD가 `headBeforeRunner`와 달라야 한다. `node --test`가 통과해야 한다. 별도 Node 프로세스에서 `src/slug.mjs`를 import해 `caseResults`가 모두 true인지 본다(아래 "리허설의 파이프라인 단계"의 코드). 모델이 쓴 코드는 이 자식 프로세스에서만 돌고 30초 한도를 받는다 | 하나라도 어긋남 |
| `secret-scan` | 명령 출력과 전사에서 찾는다: `hu_`·`hs_`·`ho_` 토큰 모양, 이 실행의 토큰 값, `CLAUDE_CODE_OAUTH_TOKEN` 값, 봉인 키 값 | 하나라도 있음 |

`finally`에서는 다음 순서로 정리한다. 이미 남은 실패가 있으면 그 이름을 유지한다. 1~3은 단계마다 오류를 잡아
stderr에 한 줄만 남기고 다음으로 넘어간다. 4는 앞 단계 결과와 관계없이 늘 실행한다.

1. 실행기가 아직 돌고 있으면 `--stop`을 한 번 보내고, 리허설 마감에서 봉인 몫을 뺀 시각까지만 기다린다. 여기서
   `--stop`과 `--status`는 `run.succeed`가 아니라 `run.command`로 부른다. 그사이 실행기가 끝나면 `--stop`이
   `not-running` 오류로 종료 코드 1을 내기 때문이다(`plugin/bin/harness-background.mjs:744-746`).
2. 서버를 멈춘다.
3. `deleteFixtureUser`로 fixture 사용자를 지운다. 프로젝트와 항목은 cascade로 함께 지워진다.
4. 전사를 모아 봉인해 `--transcripts` 경로에 쓴다.
   - 50MB를 넘는 파일은 넣지 않는다. 대신 이름과 크기를 `skipped.txt`에 적는다.
   - 공개하지 않는 전체 집계(`runFindings` 결과)는 `findings.json`으로 함께 넣는다.
   - 봉인에 실패했고 다른 실패가 없으면 실패 이름을 `transcripts-sealed`로 남긴다.

### 시간 예산

| 구간 | 한도 | 근거 |
| --- | --- | --- |
| job 전체 | 120분 | 아래 합계와 여유 |
| 준비(checkout ~ Claude Code 설치) | 약 8~10분 | `client-init-smoke` Windows job과 같은 단계 |
| 리허설 step | `timeout-minutes: 108` | 내부 마감 100분 + 여유. upload 단계가 돌 시간을 남긴다 |
| 리허설 내부 마감 | 리허설 시작 뒤 100분 | 모든 대기를 "마감 − 5분"으로 자른다. 5분은 확인과 봉인 몫이다 |
| init 단계 | 약 4~6분 | 기존 리허설과 같다 |
| 실행기 시작 | 한도 5분(`run.succeed(…, "background start", 300_000)`) | 권한 탐침 한도 `PROBE_LIMIT = 120_000`과 시작 확인 `START_WAIT = 20_000`(`plugin/bin/harness-background.mjs:27-28`)에 요청 재시도가 더해진다 |
| 항목 대기 | `--wait-minutes` 기본 75(5~90), 마감으로 자른다 | impl-verify를 포함한 추정 모델 시간 40~45분의 여유 |
| 정지 대기 | 최대 15분, 마감으로 자른다 | 실행기는 진행 중인 실행을 마치고 멈춘다 |
| 확인과 봉인 | 늘 5분 확보 | 시간 초과 실패에서도 artifact가 남는다 |

### 환경 변수와 비밀값

리허설은 `main(args, env = process.env)`에서 `TRANSCRIPT_KEY`와 `CLAUDE_CODE_OAUTH_TOKEN`을 지역 변수로 옮긴 뒤
`env`와 `process.env`에서 지운다. `childEnv`·`helperEnv`는 모두 그 뒤에 만든다. 그래서 env를 따로 받지 않는 자식
(`git`, `tar`)에도 두 값이 가지 않는다.

- `TRANSCRIPT_KEY`: `transcriptKey`로 확인한 값은 봉인과 `secret-scan`에만 쓴다. 어떤 자식 프로세스에도 넘기지 않는다.
- `CLAUDE_CODE_OAUTH_TOKEN`: `runner-start`의 env에만 넣는다. 그 env는 `{ ...helperEnv, CLAUDE_CODE_OAUTH_TOKEN }`이다.
  - 실행기 시작은 `HARNESS_TOKEN`과 `HARNESS_SERVER`가 없으면 거부한다(`plugin/bin/harness-background.mjs:276-278`).
  - 상주 프로세스는 시작 프로세스의 env를 물려받고(`:377`), 그 env로 `claude -p`를 띄운다(`:585`, `:617`).
  - `claude -p`의 MCP 등록은 `${HARNESS_TOKEN}`을 참조한다(`scripts/rehearsals/rehearse-client-init-smoke.ts:205`).
  - 서버, 시드, `grant-plan`, init 도우미, `--status`·`--stop`, `implementation-check`에는 넣지 않는다. init 단계의
    `claude plugin`·`claude mcp` 명령은 로그인 없이 동작한다(2026-10-29 Phase 0B 실측).
- `HARNESS_TOKEN`·`HARNESS_SERVER`: init 리허설과 같다. `--status`·`--stop`도 `helperEnv`로 부른다. `--stop`은 이미
  멈춘 실행기의 정지를 서버에 알릴 때 `HARNESS_TOKEN`을 쓴다(`:431`).

### 리허설의 파이프라인 단계 (핵심 부분)

```ts
await run.step("pipeline-saved", async () => {
  const { loadPipelinesView, savePipelineDefinition } = await import("../../src/server/pipeline/api");
  await withPrisma(async prisma => {
    const project = await prisma.project.findFirstOrThrow({ where: { ownerUserId: userId }, select: { id: true } });
    const pipeline = (await loadPipelinesView(prisma, project.id)).pipelines.find(entry => entry.isDefault);
    if (!pipeline) throw new Error("the project has no default pipeline");
    const result = await savePipelineDefinition(prisma, {
      projectId: project.id, userId, pipelineId: pipeline.id,
      definition: { steps: [...PIPELINE_STEPS], gates: [] }, expectedVersion: pipeline.saved?.version ?? 0,
    });
    if (result.status !== "success") throw new Error(`pipeline save: ${result.status === "error" ? result.reason : result.status}`);
  });
});

const key = await run.step("backlog-added", async () => {
  const { createBoardService } = await import("../../src/server/pipeline/api");
  return withPrisma(async prisma => {
    const project = await prisma.project.findFirstOrThrow({ where: { ownerUserId: userId }, select: { id: true } });
    const added = await createBoardService(prisma).addBacklog(project.id, { ...BACKLOG_ITEM, addedBy: "owner", addedByRunId: null });
    if (!added.ok) throw new Error(`backlog add: ${added.reason}`);
    return added.item.key;
  });
});
```

`pipeline-saved`에 대한 보충:

- 새 프로젝트의 기본 파이프라인은 아직 행이 없는 가상 항목으로 보인다. 그 id는 `defaultPipelineIdOf(projectId)`다.
- 저장할 때 `ensureDefaultPipeline`이 같은 id로 행을 만든다(`src/server/pipeline/run-service.ts:38`). 웹에서 처음
  저장할 때와 같은 경로다.

대기는 Prisma 클라이언트 하나로 돈다. 15초마다 새 클라이언트를 만들지 않으려고 `withPrisma` 한 번 안에서 반복한다.
`runnerStatus()`는 `--status`의 마지막 줄 JSON을 읽고 1분에 한 번만 다시 묻는다. `waitingSince`는 실행기 상태가
`waiting`이 된 첫 시각이다. `handoffSince`는 항목이 `wait on handoff`가 된 첫 시각이고, 다른 응답이 오면 지운다.

```ts
const { nextFor } = await import("../../src/server/pipeline/api");
const verdict = await withPrisma(async prisma => {
  let handoffSince: number | null = null;
  for (;;) {
    const row = await prisma.boardItem.findFirst({ where: { projectId, discardedAt: null, backlogItem: { key } }, orderBy: { proposedOn: "desc" }, select: { status: true } });
    const next = row ? await nextFor(prisma, projectId, key) : null;
    const runner = await runnerStatus();
    const now = Date.now();
    handoffSince = next?.action === "wait" && next.on === "handoff" ? handoffSince ?? now : null;
    const result = waitVerdict({ next, boardStatus: row?.status ?? null, runner, waitingMs: waitingSince === null ? 0 : now - waitingSince, handoffMs: handoffSince === null ? 0 : now - handoffSince, now, deadline, timeoutStep: "item-done" });
    if (result.verdict !== "wait") return result;
    await delay(15_000);
  }
});
```

- 서버 모듈은 공개 `api`로만 가져온다. 이 경로에는 `verify:server` 등록이 필요 없다. 비공개 모듈을 가져오는
  리허설만 정확한 등록이 필요하다(`scripts/checks/verify-server-boundaries.test.mjs`의 `rehearse-project.ts` 사례).
- `src/server/db.ts`가 `server-only`를 가져오므로, 리허설은 다른 서버 리허설처럼
  `--import ./tests/server/register-server-only.mjs`로 실행한다.
- 리허설은 기존 init 리허설처럼 `DATABASE_URL`을 시험 DB로 바꾼 뒤 서버 모듈을 동적으로 import한다.
- `nextFor`의 쓰임과 조건은 다음과 같다.
  - MCP `pipeline_next`가 항목마다 쓰는 것과 같은 함수다(호출 `src/server/mcp/deps.ts:67`, 정의
    `src/server/pipeline/run-service.ts:263`).
  - board row가 없으면 예외를 던진다. 그래서 board row가 생긴 뒤에만 부른다.

`implementation-check`는 모델이 쓴 모듈을 별도 Node 프로세스에서 연다. Windows의 ESM `import()`는 `C:\…` 같은 절대
경로를 받지 않는다. 그래서 init 리허설의 `SYNC`처럼 file URL로 넘긴다(`scripts/rehearsals/rehearse-client-init-smoke.ts:87`).

```ts
const CASES = [
  "const [steps, slug] = process.argv.slice(1);",
  "const { caseResults } = await import(steps);",
  "const { slugWords } = await import(slug);",
  "console.log(JSON.stringify(caseResults(slugWords)));",
].join("\n");

await run.step("implementation-check", () => {
  if (run.succeed("git", ["status", "--porcelain"], repo, helperEnv, "git status").stdout.trim() !== "") throw new Error("the runner left uncommitted changes");
  if (run.succeed("git", ["rev-parse", "HEAD"], repo, helperEnv, "git rev-parse").stdout.trim() === headBeforeRunner) throw new Error("the runner made no commit");
  run.succeed(process.execPath, ["--test"], repo, helperEnv, "node --test");
  const steps = new URL("./pipeline-smoke-steps.mjs", import.meta.url).href;
  const slug = pathToFileURL(path.join(repo, "src", "slug.mjs")).href;
  const output = run.succeed(process.execPath, ["--input-type=module", "-e", CASES, steps, slug], repo, helperEnv, "independent cases", 30_000).stdout;
  const results: unknown = JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? "null");
  if (!Array.isArray(results) || results.length !== INDEPENDENT_CASES.length || !results.every(value => value === true)) throw new Error("slugWords does not follow the backlog request");
});
```

### 픽스처 저장소와 백로그 항목

항목은 계획 단계에서 보류할 빈틈이 없도록 바깥 동작을 모두 정해 둔다(2026-10-20 결정: 바깥 동작이 갈릴 때만 보류).
두 규칙이 함께 걸리는 입력도 어느 규칙이 먼저인지 정한다. 빈 문자열에 잘못된 `maxWords`가 오면 RangeError를 던진다.
이 순서를 빠뜨린 문구로 app-dev가 계획 단계에서 보류했다(아래 "수정 뒤 두 번째 dev 실행 기록"). 독립 사례
`["", 0]`이 그 순서를 확인한다. `pipeline-smoke-steps.mjs`에 둔다.

```js
export const PIPELINE_STEPS = Object.freeze(["assign-work", "plan", "verify", "implement", "impl-verify", "accept", "doc-audit"]);
export const PIPELINE_ROLES = Object.freeze(["work-assigner", "app-dev", "plan-verifier", "impl-verifier", "doc-auditor"]);

export const FIXTURE_FILES = Object.freeze({
  "README.md": "# slug fixture\n\nA small module that the Stagekeeper pipeline smoke changes. Run `npm test`.\n",
  "src/slug.mjs": "export function slugify(text) {\n  return text.toLowerCase().replace(/[^a-z0-9]+/g, \"-\").replace(/^-+|-+$/g, \"\");\n}\n",
  "test/slug.test.mjs": "import assert from \"node:assert/strict\";\nimport { it } from \"node:test\";\nimport { slugify } from \"../src/slug.mjs\";\n\nit(\"joins lowercase words with single hyphens\", () => {\n  assert.equal(slugify(\"  Hello, World!  \"), \"hello-world\");\n});\n",
});

export const BACKLOG_ITEM = Object.freeze({
  title: "Add slugWords(text, maxWords) to src/slug.mjs",
  area: "src",
  type: "feat",
  source: "Pipeline smoke request. Add and export slugWords(text, maxWords) in src/slug.mjs. Callers always pass a string as text. Check maxWords first: when it is not a positive integer (for example 0, -1, 1.5 or \"2\"), throw a RangeError (any message), even when text is empty. Otherwise trim text, split it on runs of whitespace, keep the first maxWords words (all of them when there are fewer) and return slugify of those words joined with single spaces. Empty or whitespace-only text returns an empty string. Cover these cases in test/slug.test.mjs and keep slugify unchanged.",
});

export const INDEPENDENT_CASES = Object.freeze([
  { args: ["One two three", 2], returns: "one-two" },
  { args: ["  Hello   big World ", 5], returns: "hello-big-world" },
  { args: ["   ", 3], returns: "" },
  { args: ["a b", 0], throws: "RangeError" },
  { args: ["a b", 1.5], throws: "RangeError" },
  { args: ["", 0], throws: "RangeError" },
]);

export function caseResults(slugWords, cases = INDEPENDENT_CASES) {
  return cases.map(({ args, returns, throws }) => {
    try {
      const value = slugWords(...args);
      return throws === undefined && value === returns;
    } catch (error) {
      return throws !== undefined && error?.name === throws;
    }
  });
}
```

- `type`은 `ITEM_TYPES`(`packages/core/pipeline/backlog.mjs:2`)의 `feat`를 쓴다.
- 작업 공간은 init 리허설이 쓰는 `path: "."`, `agent: "app-dev"`, `verify: ["npm test"]`다. `.`은 모든 area와
  맞는다(`packages/core/pipeline/work-selection.mjs` `matchingAgents`). 그래서 `area: "src"`인 항목도 적격이다.
- 실행기 허용 목록에는 작업 공간의 verify 명령(`npm test`)이 들어간다(`plugin/runtime/background.mjs:79`
  `backgroundSettings`).
- `PIPELINE_ROLES`의 이름은 AgentRun `agent`에 남는 dispatcher 이름이다. `plan`·`implement`는 board item의 작업
  공간 역할(`app-dev`)이 맡는다(`packages/core/pipeline/pipeline.mjs` `dispatcherFor`). 인수는 메인 루프가 하므로
  AgentRun에 없다.

### 대기 판정

```js
export const RUNNER_WAIT_LIMIT_MS = 2 * 60_000;
export const HANDOFF_LIMIT_MS = 5 * 60_000;
const WAIT_FAILURES = Object.freeze({ gate: "item-gated", acceptance: "acceptance-failed", "impl-verify": "impl-verify-failed", qa: "qa-failed", cap: "usage-cap" });

export function waitVerdict({ next, boardStatus, runner, waitingMs, handoffMs = 0, now, deadline, timeoutStep }) {
  if (next?.action === "done") return { verdict: "done" };
  if (boardStatus === "on_hold") return { verdict: "fail", step: "item-held" };
  if (next?.action === "wait" && Object.hasOwn(WAIT_FAILURES, next.on)) return { verdict: "fail", step: WAIT_FAILURES[next.on] };
  if (next?.action === "wait" && next.on === "handoff" && handoffMs >= HANDOFF_LIMIT_MS) return { verdict: "fail", step: "item-handoff" };
  if (runner?.running === false) return { verdict: "fail", step: "runner-ended" };
  if (runner?.state === "waiting" && waitingMs >= RUNNER_WAIT_LIMIT_MS) return { verdict: "fail", step: "runner-waiting" };
  if (now >= deadline) return { verdict: "fail", step: timeoutStep };
  return { verdict: "wait" };
}
```

`next`는 다음과 같이 읽는다.

- `nextFor` 결과다. 파이프라인 실행이 닫히면 `action: "done"`이다(`src/server/pipeline/run-rules.ts:54`).
- 사람 없이는 벗어날 수 없는 대기는 `action: "wait"`와 `on`으로 온다. `on` 값은 `gate`, `handoff`, `acceptance`,
  `impl-verify`, `qa`, `cap`이다(`run-rules.ts:9-14`).
- `handoff`만은 바로 실패시키지 않는다. 커밋 권한이 없는 역할이 준비한 파일을 넘기고 멈춘 상태다. 이 픽스처는 커밋
  정책이 yes라 메인 루프가 그 파일을 커밋하고 같은 실행을 outcome 없이 이어 간다(`docs/architecture/protocol.md`
  "커밋 핸드오프", watch 스킬 §5). impl-verifier의 보고서는 늘 메인 루프가 이 절차로 커밋한다
  (`docs/architecture/impl-verifier.md` "Authority and evidence"). 그래서 리허설은
  핸드오프를 처음 본 시각부터 잰 `handoffMs`를 넘기고, `HANDOFF_LIMIT_MS`(5분) 넘게 이어질 때만 `item-handoff`로
  실패한다(2026-11-03 승격 전 dev 실행에서 고침, 아래 "Verification Results").
- 서버가 앞으로 새 대기 이유를 더하면 그 값은 `WAIT_FAILURES`에 없다. 그 경우 마감까지 기다린 뒤 `timeoutStep`으로
  실패한다.

계획 단계 보류는 board 상태 `on_hold`로 남는다. 에이전트가 계획·구현 중에 보류하는 전이가 정해져 있다
(`packages/core/pipeline/transitions.mjs:18`, `:20`). 실행기의 `waiting`은 작업
트리가 더럽거나 브랜치가 바뀐 경우다. 2분 넘게 이어지면 사람이 개입해야 하는 상태로 본다.

### 실행 기록 집계와 공개 요약

실행기는 실행마다 `.git/harness/runs/`에 두 파일을 남긴다(`plugin/bin/harness-background.mjs` `startRun`).

- `<id>.jsonl`: `claude -p --output-format stream-json`의 원문
- `<id>.meta.json`: `line`에 `classifyRun` 결과가 들어 있다

리허설은 이 파일들과 `~/.claude/projects/` 아래의 세션 전사를 읽어 숫자만 뽑는다. 공개 요약에는 허용 필드만 남기고,
모델이 쓴 글, 셸 출력, 거부 사유 원문은 넣지 않는다.

```js
const RESULTS = ["pass", "fail", "skip"];
const PERMISSIONS = ["auto", "allowlist"];
const RUNNER_STATES = ["starting", "idle", "working", "waiting", "stopping", "stopped"];
const WAIT_REASONS = ["dirty", "branch"];
const NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const MODEL = /^claude-[a-z0-9-]{1,60}$/;
const TOOL = /^[a-z_]{1,40}$/;
const HARNESS_TOOL = /^mcp__harness__([a-z_]{1,40})$/;
const AGENT_TOOLS = ["Agent", "Task"];
const RUN_LINE = /^(?:done: (?:\d+|\?) turns, \d+ denied|error: (?:[a-z_]{1,40}(?: \([a-z_]{1,40}\))?|no result|exit -?\d+)|ended: (?:the branch changed|time limit|runner stopping))$/;

export function runFindings(streams, transcripts = []) {
  const names = new Map();
  const failed = new Set();
  const costs = new Map();
  const denials = new Set();
  let unnamedResults = 0;
  const findings = { turns: 0, denials: 0, costUsd: 0, models: [], toolErrors: 0, agentCalls: 0, agentErrors: 0, harnessErrors: {} };
  const visit = (text, withResults) => {
    for (const line of text.split(/\r?\n/)) {
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      for (const block of Array.isArray(message?.message?.content) ? message.message.content : []) {
        if (block?.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") names.set(block.id, block.name);
        if (block?.type === "tool_result" && block.is_error === true && typeof block.tool_use_id === "string") failed.add(block.tool_use_id);
      }
      if (!withResults || message?.type !== "result") continue;
      const session = typeof message.session_id === "string" ? message.session_id : `result-${unnamedResults++}`;
      if (Number.isInteger(message.num_turns)) findings.turns += message.num_turns;
      for (const denial of Array.isArray(message.permission_denials) ? message.permission_denials : []) {
        denials.add(typeof denial?.tool_use_id === "string" ? `${session}:${denial.tool_use_id}` : `denial-${denials.size}`);
      }
      if (Number.isFinite(message.total_cost_usd)) costs.set(session, Math.max(costs.get(session) ?? 0, message.total_cost_usd));
      for (const model of Object.keys(message.modelUsage ?? {})) if (MODEL.test(model) && !findings.models.includes(model)) findings.models.push(model);
    }
  };
  for (const text of streams) visit(text, true);
  for (const text of transcripts) visit(text, false);
  findings.denials = denials.size;
  findings.costUsd = [...costs.values()].reduce((sum, cost) => sum + cost, 0);
  for (const name of names.values()) if (AGENT_TOOLS.includes(name)) findings.agentCalls++;
  for (const id of failed) {
    findings.toolErrors++;
    const name = names.get(id) ?? "";
    if (AGENT_TOOLS.includes(name)) findings.agentErrors++;
    const tool = HARNESS_TOOL.exec(name)?.[1];
    if (tool) findings.harnessErrors[tool] = (findings.harnessErrors[tool] ?? 0) + 1;
  }
  return findings;
}

export function summarizePipeline(record) {
  const summary = {};
  if (typeof record.os === "string" && NAME.test(record.os)) summary.os = record.os;
  for (const field of ["pluginCommit", "templatesCommit"]) if (COMMIT.test(record[field] ?? "")) summary[field] = record[field];
  if (PERMISSIONS.includes(record.permission)) summary.permission = record.permission;
  if (RUNNER_STATES.includes(record.runnerState)) summary.runnerState = record.runnerState;
  if (WAIT_REASONS.includes(record.waitReason)) summary.waitReason = record.waitReason;
  if (Array.isArray(record.steps)) {
    summary.steps = record.steps.filter(entry => NAME.test(entry?.step ?? "") && RESULTS.includes(entry?.result)).map(entry => ({ step: entry.step, result: entry.result }));
  }
  if (Array.isArray(record.runs)) summary.runs = record.runs.filter(line => typeof line === "string" && RUN_LINE.test(line));
  const findings = record.findings;
  if (findings && typeof findings === "object") {
    for (const field of ["turns", "denials", "agentCalls", "agentErrors"]) if (Number.isInteger(findings[field]) && findings[field] >= 0) summary[field] = findings[field];
    if (Number.isFinite(findings.costUsd) && findings.costUsd >= 0) summary.costUsd = Math.round(findings.costUsd * 100) / 100;
    if (Array.isArray(findings.models)) summary.models = findings.models.filter(model => typeof model === "string" && MODEL.test(model));
    if (findings.harnessErrors && typeof findings.harnessErrors === "object") {
      summary.harnessErrors = Object.fromEntries(Object.entries(findings.harnessErrors).filter(([tool, count]) => TOOL.test(tool) && Number.isInteger(count) && count > 0));
    }
  }
  if (Number.isInteger(record.stepRefusals) && record.stepRefusals >= 0) summary.stepRefusals = record.stepRefusals;
  if (Number.isInteger(record.minutesToDone) && record.minutesToDone >= 0) summary.minutesToDone = record.minutesToDone;
  if (typeof record.sealed === "boolean") summary.sealed = record.sealed;
  if (typeof record.failure === "string" && NAME.test(record.failure)) summary.failure = record.failure;
  if (Number.isInteger(record.seconds) && record.seconds >= 0) summary.seconds = record.seconds;
  summary.result = record.failure ? "fail" : "pass";
  return summary;
}
```

- 실패한 도구 호출과 서브에이전트 호출은 `tool_use_id`로 한 번씩만 센다. 같은 호출이 실행 스트림과 세션 전사에 함께
  나와도 두 번 세지 않는다. `turns`, `denials`, `costUsd`, `models`는 실행 스트림의 `result` 줄에서만 센다.
- 공개 요약에 넣는 숫자와 넣지 않는 숫자는 다음과 같다.

  | 숫자 | 뜻 | 공개 요약 |
  | --- | --- | --- |
  | `harnessErrors` | 서버가 거부한 MCP 도구 호출 수(도구 이름별). 서버는 거부를 `isError: true`로 돌려준다(`src/server/mcp/tools.ts:64`). 0.5.33 실기의 (1)은 `{ "assignment_context": 1 }`로 보였을 것이다. #275가 들어간 `dev`에서는 0이어야 한다 | 넣음. 0이 아니면 승격 전에 원인을 확인한다 |
  | `stepRefusals` | agent_next가 결과를 거부해 같은 단계에 머문 횟수. DB의 AgentRun `refused` 합이다(`src/server/agents/run-service.ts:147`) | 넣음. 0이 아니면 승격 전에 원인을 확인한다 |
  | `agentCalls`, `agentErrors` | 서브에이전트(`Agent`·`Task` 도구) 호출 수와 그 실패 수. Open Question 1(작업 공간 신뢰)을 보는 첫 신호다 | 넣음 |
  | `toolErrors` | 원래 실패하는 호출까지 모두 센 수. 예: 시험이 실패하는지 확인하는 실행, `grep` 0건 | 넣지 않음. 봉인 묶음의 `findings.json`에만 남긴다 |

  이 숫자들은 녹색/빨강 판정에 쓰지 않는다. 다만 `harnessErrors`나 `stepRefusals`가 0이 아니면, 녹색이어도 승격 전에
  사람이 봉인 전사로 원인을 확인한다(AGENTS.md 승격 조건). 지금까지 실기에서 나온 서버 거부는 모두 문구나 계약
  결함이었다(#275의 `assignment_context`, #270의 main-loop `report_submit`).
- `costUsd`는 세션마다 가장 큰 `total_cost_usd`를 더한 값이다. 실행기 세션 하나는 차례마다 `result` 줄을 내고, 줄마다
  같은 세션의 누적값을 싣는다(Phase 3 첫 실행 실측). 거부도 세션과 `tool_use_id`로 한 번만 센다. `turns`는 줄마다 그
  차례의 값이라 더한다. API 정가로 환산한 추정치일 뿐 청구액은 아니다.
- `RUNNER_STATES`·`WAIT_REASONS`는 실행기 코드가 쓰는 값이다. `plugin/runtime/background.mjs`의 `runResident`와
  `harness-background.mjs`의 start·release·상주 프로세스 종료 처리에서 가져왔다. `stopping`은 실행기가 정리를 끝내지
  못하고 멈췄을 때 남는다(`harness-background.mjs:687`). 처음 보는 값은 요약에서 빠진다.

### 승격 경로 목록

경로 목록은 AGENTS.md 한 곳에만 둔다. 시험은 그 목록을 읽어 경로가 모두 실제로 있는지 확인한다. 그래서 파일을 옮기면
시험이 깨진다.

```js
const TRIGGER_COMMAND = /`git diff --name-only origin\/main origin\/dev -- ([^`]+)`/;

export function smokeTriggerPaths(agentsText) {
  const match = TRIGGER_COMMAND.exec(agentsText);
  return match ? match[1].trim().split(/\s+/) : [];
}
```

### 전사 봉인

봉인해서 보관하는 파일은 다음과 같다. 봉인 묶음 안에 상대 이름으로 들어간다.

- `.git/harness/runs/*`
- `.git/harness/background.log`
- `.git/harness/background.json`
- 리허설의 `commands.log`, `server.log`
- `~/.claude/projects/**/*.jsonl`(서브에이전트 전사 포함)
- `findings.json`, 그리고 건너뛴 파일이 있으면 `skipped.txt`

```js
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const BUNDLE_NAME = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const BUNDLE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function transcriptKey(text) {
  const key = Buffer.from(String(text ?? "").trim(), "base64");
  if (key.length !== KEY_BYTES) throw new Error("the transcript key must be 32 bytes of base64");
  return key;
}

function checkedFiles(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) throw new Error("transcript files must be an object");
  for (const [name, text] of Object.entries(files)) {
    if (!BUNDLE_NAME.test(name) || name.split("/").some(part => part === "." || part === "..") || typeof text !== "string") {
      throw new Error("the transcript bundle has an unsafe entry");
    }
  }
  return files;
}

function requireKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) throw new Error("the transcript key must be 32 bytes");
  return key;
}

export function sealTranscripts(files, key) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", requireKey(key), iv);
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify({ version: BUNDLE_VERSION, files: checkedFiles(files) }))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function openTranscripts(sealed, key) {
  if (!Buffer.isBuffer(sealed) || sealed.length <= IV_BYTES + TAG_BYTES) throw new Error("the sealed transcripts are truncated");
  const decipher = createDecipheriv("aes-256-gcm", requireKey(key), sealed.subarray(0, IV_BYTES));
  decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  const opened = Buffer.concat([decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]);
  const bundle = JSON.parse(gunzipSync(opened).toString("utf8"));
  if (bundle?.version !== BUNDLE_VERSION) throw new Error("unsupported transcript bundle");
  return checkedFiles(bundle.files);
}

export function writeTranscripts(files, outDir) {
  const entries = Object.entries(checkedFiles(files));
  mkdirSync(outDir);
  for (const [name, text] of entries) {
    const target = path.join(outDir, ...name.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text, { flag: "wx" });
  }
}
```

- 키는 새 비밀값 `E2E_TRANSCRIPT_KEY`다. 무작위 32바이트를 base64로 적는다. 사본은 이 PC의 저장소 밖
  `C:\Users\hamso\.stagekeeper\pipeline-smoke-transcripts.key`에 둔다(`production.env`와 같은 폴더).
- 키는 출력하지 않고 만들고 등록한다. 등록은 사용자 승인 뒤 사용자나 내가 한 번 실행한다(PowerShell).

  ```powershell
  node -e "require('fs').writeFileSync(process.argv[1], require('crypto').randomBytes(32).toString('base64'), { flag: 'wx' })" "$env:USERPROFILE\.stagekeeper\pipeline-smoke-transcripts.key"
  Get-Content -Raw "$env:USERPROFILE\.stagekeeper\pipeline-smoke-transcripts.key" | gh secret set E2E_TRANSCRIPT_KEY --repo Sangeok/stagekeeper
  ```

- 여는 순서는 다음과 같다.
  1. `gh run download <run> -n pipeline-smoke-transcripts -D <새 빈 폴더>`로 받는다.
  2. `node scripts/rehearsals/open-pipeline-transcripts.mjs --key-file <키 파일> --in <봉인 파일> --out <새 폴더>`로
     연다.
  3. `writeTranscripts`는 이미 있는 폴더를 거부하고(`mkdirSync`가 실패), `checkedFiles`를 통과한 이름만 그 아래에
     쓴다.
  4. 받은 파일은 신뢰하지 않는 데이터로 다룬다. 연 파일을 실행하지 않는다.

### 워크플로 (PR 2)

```yaml
name: pipeline-smoke

on:
  schedule:
    - cron: "0 18 * * 3"
  workflow_dispatch:
    inputs:
      templates-ref:
        description: "Branch, tag or commit of Sangeok/harness-templates to seed (default: its default branch)"
        required: false
        default: ""

permissions:
  contents: read

concurrency:
  group: pipeline-smoke
  cancel-in-progress: false

jobs:
  pipeline:
    name: pipeline (windows-2022)
    runs-on: windows-2022
    timeout-minutes: 120
    env:
      PG_PORT: "45432"
      TEST_DB: postgresql://postgres@127.0.0.1:45432/stagekeeper_test_pipeline
      DISABLE_AUTOUPDATER: "1"
    steps:
      - name: Check that the smoke secrets are available
        shell: bash
        env:
          TEMPLATES_TOKEN: ${{ secrets.E2E_TEMPLATES_TOKEN }}
          CLAUDE_TOKEN: ${{ secrets.E2E_CLAUDE_OAUTH_TOKEN }}
          TRANSCRIPT_KEY: ${{ secrets.E2E_TRANSCRIPT_KEY }}
        run: |
          if [ -z "$TEMPLATES_TOKEN" ] || [ -z "$CLAUDE_TOKEN" ] || [ -z "$TRANSCRIPT_KEY" ]; then
            echo "::error::E2E_TEMPLATES_TOKEN, E2E_CLAUDE_OAUTH_TOKEN and E2E_TRANSCRIPT_KEY are all required"
            exit 1
          fi
      - uses: actions/checkout@v5
        with:
          persist-credentials: false
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci --no-audit --no-fund
      - name: Generate Prisma client
        run: npm run db:generate
      - name: Prepare the smoke database
        uses: ./.github/actions/smoke-database
        with:
          pg-package: windows-x64
          port: ${{ env.PG_PORT }}
          database: stagekeeper_test_pipeline
      - name: Build the server
        shell: bash
        run: DATABASE_URL="$TEST_DB" npm run build
      - name: Check out the private templates
        uses: actions/checkout@v5
        with:
          repository: Sangeok/harness-templates
          ref: ${{ inputs.templates-ref }}
          token: ${{ secrets.E2E_TEMPLATES_TOKEN }}
          path: plugin/templates
          persist-credentials: false
      - name: Install Claude Code
        shell: pwsh
        run: |
          irm https://claude.ai/install.ps1 | iex
          "$env:USERPROFILE\.local\bin" | Out-File -FilePath $env:GITHUB_PATH -Append -Encoding utf8
      - name: Run the pipeline smoke
        shell: pwsh
        timeout-minutes: 108
        env:
          TEST_DATABASE_URL: ${{ env.TEST_DB }}
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.E2E_CLAUDE_OAUTH_TOKEN }}
          TRANSCRIPT_KEY: ${{ secrets.E2E_TRANSCRIPT_KEY }}
          PLUGIN_BRANCH: ${{ github.ref_name }}
          PLUGIN_COMMIT: ${{ github.sha }}
        run: |
          $PSNativeCommandUseErrorActionPreference = $false
          claude --version
          $templates = Join-Path $env:GITHUB_WORKSPACE 'plugin/templates'
          $summary = Join-Path $env:RUNNER_TEMP 'pipeline-summary.json'
          $sealed = Join-Path $env:RUNNER_TEMP 'pipeline-transcripts.bin'
          node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-pipeline-smoke.ts --templates $templates --plugin-branch $env:PLUGIN_BRANCH --plugin-commit $env:PLUGIN_COMMIT --transcripts $sealed | Tee-Object -FilePath $summary
          $code = $LASTEXITCODE
          if (Test-Path $summary) { "``````json`n$((Get-Content $summary | Select-Object -Last 1))`n``````" | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Append -Encoding utf8 }
          exit $code
      - name: Keep the sealed transcripts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: pipeline-smoke-transcripts
          path: ${{ runner.temp }}/pipeline-transcripts.bin
          retention-days: 7
          if-no-files-found: warn
```

- 비밀값이 없을 때 `client-init-smoke`는 건너뛴다. 외부 포크 PR 때문이다. 이 워크플로는 PR 실행이 없으므로, 비밀값이
  없으면 설정 오류로 보고 실패시킨다. 건너뛰면 녹색처럼 보이기 때문이다.
- `templates-ref`가 비면 `actions/checkout`은 템플릿 저장소의 기본 브랜치를 쓴다. 예약 실행에는 입력이 없다.
- 예약 실행은 `main`의 워크플로와 코드로 돈다(`PLUGIN_BRANCH=main`). 그래서 출시된 판에 대한 주간 점검이 된다. 다만
  템플릿은 운영에 시드된 판이 아니라 템플릿 저장소의 기본 브랜치다. 주간 실패는 아직 시드하지 않은 템플릿 변경 때문일
  수도 있다.
- 예약 실행이 실패하면 GitHub의 기본 알림이 cron을 마지막으로 고친 계정으로 간다.
- `actions/upload-artifact@v4`는 이미 `macos-runtime-contracts.yml`이 쓰는 판이다.
- 리허설 step의 `timeout-minutes: 108`은 리허설이 멈춰도 upload 단계가 돌 시간을 남긴다.

### DB 준비 composite action (PR 1)

```yaml
name: smoke-database
description: Start portable PostgreSQL 18, create one stagekeeper_test_* database and apply the migrations.
inputs:
  pg-package:
    description: The @embedded-postgres platform package, windows-x64 or darwin-arm64.
    required: true
  port:
    description: The port PostgreSQL listens on.
    required: true
  database:
    description: The stagekeeper_test_* database to create.
    required: true
runs:
  using: composite
  steps:
    - name: Start portable PostgreSQL 18 (Windows)
      if: runner.os == 'Windows'
      shell: pwsh
      env:
        PG_PACKAGE: ${{ inputs.pg-package }}
        PG_PORT: ${{ inputs.port }}
      run: |
        $root = Join-Path $env:RUNNER_TEMP 'pg'
        npm install --prefix $root --no-save --no-audit --no-fund "@embedded-postgres/$($env:PG_PACKAGE)@18.4.0-beta.17"
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
        $bin = Join-Path $root "node_modules/@embedded-postgres/$($env:PG_PACKAGE)/native/bin"
        $data = Join-Path $env:RUNNER_TEMP 'pgdata'
        & (Join-Path $bin 'initdb.exe') -D $data -U postgres --auth=trust -E UTF8 --no-locale
        if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
        netsh interface ipv4 show excludedportrange protocol=tcp
        $env:PGPORT = $env:PG_PORT
        $log = Join-Path $env:RUNNER_TEMP 'pg.log'
        $process = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D', $data, '-l', $log, '-w', 'start') -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $env:RUNNER_TEMP 'pgctl.out') -RedirectStandardError (Join-Path $env:RUNNER_TEMP 'pgctl.err')
        $null = $process.Handle
        $printLogs = { foreach ($file in @((Join-Path $env:RUNNER_TEMP 'pgctl.out'), (Join-Path $env:RUNNER_TEMP 'pgctl.err'), $log)) { if (Test-Path $file) { "--- $file"; Get-Content $file } } }
        if (-not $process.WaitForExit(120000)) { & $printLogs; throw 'pg_ctl did not return' }
        if ($process.ExitCode -ne 0) { & $printLogs; throw "pg_ctl start failed with exit code $($process.ExitCode)" }
    - name: Start portable PostgreSQL 18 (macOS)
      if: runner.os == 'macOS'
      shell: bash
      env:
        PG_PACKAGE: ${{ inputs.pg-package }}
        PG_PORT: ${{ inputs.port }}
      run: |
        root="$RUNNER_TEMP/pg"
        npm install --prefix "$root" --no-save --no-audit --no-fund "@embedded-postgres/$PG_PACKAGE@18.4.0-beta.17"
        bin="$root/node_modules/@embedded-postgres/$PG_PACKAGE/native/bin"
        data="$RUNNER_TEMP/pgdata"
        "$bin/initdb" -D "$data" -U postgres --auth=trust -E UTF8 --no-locale
        if ! PGPORT="$PG_PORT" "$bin/pg_ctl" -D "$data" -l "$RUNNER_TEMP/pg.log" -w start < /dev/null > "$RUNNER_TEMP/pgctl.out" 2>&1; then
          for file in "$RUNNER_TEMP/pgctl.out" "$RUNNER_TEMP/pg.log"; do
            if [ -f "$file" ]; then echo "--- $file"; cat "$file"; fi
          done
          exit 1
        fi
    - name: Create the test database
      shell: bash
      working-directory: ${{ github.workspace }}
      env:
        PG_PORT: ${{ inputs.port }}
        PG_DATABASE: ${{ inputs.database }}
      run: >-
        node -e 'const { Client } = require("pg");
        if (!/^stagekeeper_test_[a-z0-9_]+$/.test(process.env.PG_DATABASE)) { console.error("database must be stagekeeper_test_*"); process.exit(1); }
        (async () => { const c = new Client({ host: "127.0.0.1", port: Number(process.env.PG_PORT), user: "postgres", database: "postgres" });
        await c.connect(); await c.query(`CREATE DATABASE ${process.env.PG_DATABASE}`); await c.end(); })().catch(e => { console.error(e.message); process.exit(1); });'
    - name: Apply migrations
      shell: bash
      working-directory: ${{ github.workspace }}
      env:
        PG_PORT: ${{ inputs.port }}
        PG_DATABASE: ${{ inputs.database }}
      run: DATABASE_URL="postgresql://postgres@127.0.0.1:$PG_PORT/$PG_DATABASE" node node_modules/prisma/build/index.js migrate deploy
```

- 본문은 `client-init-smoke.yml`의 네 단계를 그대로 옮겼다. 다른 점은 세 가지다.
  - `${{ matrix.pg }}`를 환경 변수로 받는다.
  - DB 이름을 입력으로 받고, 이름이 `stagekeeper_test_*` 형식인지 먼저 확인한다.
  - 저장소 파일(`pg`, `node_modules/prisma`)을 쓰는 두 단계에 `working-directory`를 적는다. composite action의 기본
    작업 폴더는 호출한 저장소의 루트라고 알려져 있지만, 공식 문서로 확인하지 못해 기본값에 맡기지 않는다.

### 기존 코드 수정

**`scripts/rehearsals/rehearse-client-init-smoke.ts` (PR 2)**

새 리허설이 재사용할 선언 열세 개를 export한다.

- 선언 줄에 export만 붙이는 것: `ORIGIN`, `Plugin`, `Run`, `Smoke`, `osLabel`, `startServer`, `stopServer`,
  `createRepository`
- 받는 값을 바꾸는 것: `installPlugin`은 타입을 좁히고, `newUser`는 `options` 대신 `scenario`를 받는다.
- `runSmoke`에서 함수로 빼내는 것: `seedTemplates`, `createFixtureUser`, `deleteFixtureUser`

동작은 바꾸지 않는다.

Before (선언 줄. 몸통은 아래 After와 같다):

```ts
const ORIGIN = `http://127.0.0.1:${PORT}`;
type Plugin = { root: string; commit: string };
class Run {
class Smoke {
function osLabel(): string {
async function startServer(databaseUrl: string, log: string, env: NodeJS.ProcessEnv): Promise<ChildProcess> {
async function stopServer(server: ChildProcess | undefined): Promise<void> {
function createRepository(work: string, scenario: string): string {
```

After:

```ts
export const ORIGIN = `http://127.0.0.1:${PORT}`;
export type Plugin = { root: string; commit: string };
export class Run {
export class Smoke {
export function osLabel(): string {
export async function startServer(databaseUrl: string, log: string, env: NodeJS.ProcessEnv): Promise<ChildProcess> {
export async function stopServer(server: ChildProcess | undefined): Promise<void> {
export function createRepository(work: string, scenario: string): string {
```

Before (`installPlugin`, 276행):

```ts
async function installPlugin(run: Run, options: Options, work: string, env: NodeJS.ProcessEnv): Promise<Plugin> {
  if (options.pluginSource === "github-branch") {
    run.succeed("claude", ["plugin", "marketplace", "add", `${PLUGIN_REPOSITORY}#${options.pluginBranch}`], REPO, env, "marketplace add");
    run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
    const clone = path.join(homedir(), ".claude", "plugins", "marketplaces", MARKETPLACE);
    const commit = git(clone, ["rev-parse", "HEAD"]);
    if (commit !== options.pluginCommit) throw new Error(`installed marketplace commit ${commit} is not the commit under test`);
    const version = (JSON.parse(readFileSync(path.join(clone, "plugin", ".claude-plugin", "plugin.json"), "utf8")) as { version: string }).version;
    const root = path.join(homedir(), ".claude", "plugins", "cache", MARKETPLACE, "harness", version);
    if (!existsSync(path.join(root, "bin", "harness-init.mjs"))) throw new Error("installed plugin cache has no generator");
    return { root, commit };
  }
  const exported = exportPlugin(options.pluginCommit, path.join(work, "plugin-export"));
  run.succeed("claude", ["plugin", "marketplace", "add", exported], REPO, env, "marketplace add");
  run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
  const root = path.join(exported, "plugin");
  return { root, commit: options.pluginCommit };
}
```

After:

```ts
export async function installPlugin(run: Run, options: Pick<Options, "pluginSource" | "pluginBranch" | "pluginCommit">, work: string, env: NodeJS.ProcessEnv): Promise<Plugin> {
  if (options.pluginSource === "github-branch") {
    run.succeed("claude", ["plugin", "marketplace", "add", `${PLUGIN_REPOSITORY}#${options.pluginBranch}`], REPO, env, "marketplace add");
    run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
    const clone = path.join(homedir(), ".claude", "plugins", "marketplaces", MARKETPLACE);
    const commit = git(clone, ["rev-parse", "HEAD"]);
    if (commit !== options.pluginCommit) throw new Error(`installed marketplace commit ${commit} is not the commit under test`);
    const version = (JSON.parse(readFileSync(path.join(clone, "plugin", ".claude-plugin", "plugin.json"), "utf8")) as { version: string }).version;
    const root = path.join(homedir(), ".claude", "plugins", "cache", MARKETPLACE, "harness", version);
    if (!existsSync(path.join(root, "bin", "harness-init.mjs"))) throw new Error("installed plugin cache has no generator");
    return { root, commit };
  }
  const exported = exportPlugin(options.pluginCommit, path.join(work, "plugin-export"));
  run.succeed("claude", ["plugin", "marketplace", "add", exported], REPO, env, "marketplace add");
  run.succeed("claude", ["plugin", "install", `harness@${MARKETPLACE}`], REPO, env, "plugin install");
  const root = path.join(exported, "plugin");
  return { root, commit: options.pluginCommit };
}
```

Before (`newUser`, 335행):

```ts
async function newUser(smoke: Smoke, plugin: Plugin, options: Options, login: string, token: string, childEnv: NodeJS.ProcessEnv): Promise<void> {
  const connection = await smoke.firstConnection(plugin, "", options.scenario, token);
  await smoke.run.step("rerun-unchanged", () => {
    smoke.helper(plugin, ["--dry-run"], "rerun dry-run");
    smoke.helper(plugin, [], "rerun generate");
    if (git(smoke.repo, ["status", "--porcelain"]) !== "") throw new Error("a rerun changed committed files");
  });
  const rerunAt = await smoke.sync(plugin, "rerun-sync", connection.slug, connection.syncedAt);
  await smoke.run.step("upgrade-pro", () => {
    const output = smoke.run.succeed(process.execPath, ["--import", "tsx", "scripts/grant-plan.ts", login, "pro", "e2e smoke"], REPO, childEnv, "plan:grant").stdout;
    if (!output.includes(`granted: ${login} -> pro`)) throw new Error("plan:grant did not report the Pro plan");
  });
  await smoke.dryRun(plugin, "pro-dry-run", "pro");
  await smoke.generate(plugin, "pro-generate", "pro");
  await smoke.sync(plugin, "pro-sync", connection.slug, rerunAt);
}
```

After:

```ts
export async function newUser(smoke: Smoke, plugin: Plugin, scenario: string, login: string, token: string, childEnv: NodeJS.ProcessEnv): Promise<void> {
  const connection = await smoke.firstConnection(plugin, "", scenario, token);
  await smoke.run.step("rerun-unchanged", () => {
    smoke.helper(plugin, ["--dry-run"], "rerun dry-run");
    smoke.helper(plugin, [], "rerun generate");
    if (git(smoke.repo, ["status", "--porcelain"]) !== "") throw new Error("a rerun changed committed files");
  });
  const rerunAt = await smoke.sync(plugin, "rerun-sync", connection.slug, connection.syncedAt);
  await smoke.run.step("upgrade-pro", () => {
    const output = smoke.run.succeed(process.execPath, ["--import", "tsx", "scripts/grant-plan.ts", login, "pro", "e2e smoke"], REPO, childEnv, "plan:grant").stdout;
    if (!output.includes(`granted: ${login} -> pro`)) throw new Error("plan:grant did not report the Pro plan");
  });
  await smoke.dryRun(plugin, "pro-dry-run", "pro");
  await smoke.generate(plugin, "pro-generate", "pro");
  await smoke.sync(plugin, "pro-sync", connection.slug, rerunAt);
}
```

Before (`runSmoke`, 362행):

```ts
async function runSmoke(options: Options, databaseUrl: string, env: NodeJS.ProcessEnv): Promise<number> {
  const started = Date.now();
  const work = realpathSync.native(mkdtempSync(path.join(env.RUNNER_TEMP ?? tmpdir(), "stagekeeper-e2e-")));
  const run = new Run(path.join(work, "commands.log"));
  const token = newToken("user");
  const login = `stagekeeper-e2e-${randomBytes(4).toString("hex")}`;
  const record: Record<string, unknown> = { client: options.client, os: osLabel(), scenario: options.scenario, pluginSource: options.pluginSource, steps: run.steps };
  const childEnv: NodeJS.ProcessEnv = { ...env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl };
  const helperEnv: NodeJS.ProcessEnv = { ...env, HARNESS_TOKEN: token.plain, HARNESS_SERVER: ORIGIN };
  delete helperEnv.DATABASE_URL;
  delete helperEnv.TEST_DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  let server: ChildProcess | undefined;
  let userId: string | undefined;
  try {
    record.templatesCommit = await run.step("seed-templates", () => {
      const snapshot = options.snapshot ?? path.join(work, "template-snapshot.json");
      const output = run.succeed(process.execPath, ["--import", "tsx", "scripts/templates/seed-templates.ts", "--dir", options.templates, "--snapshot", snapshot], REPO, childEnv, "seed:templates", 300_000).stdout;
      const revision = /done: \d+ templates atomically seeded from ([0-9a-f]{40})/.exec(output)?.[1];
      if (!revision) throw new Error("seed:templates did not report a template revision");
      return revision;
    });
    userId = await run.step("fixture", async () => {
      const { withPrisma } = await import("../lib/prisma");
      return withPrisma(async prisma => {
        const user = await prisma.user.create({ data: { login, githubId: -randomInt(1, 2_000_000_000) } });
        await prisma.userToken.create({ data: { userId: user.id, hash: token.hash, label: "e2e smoke" } });
        return user.id;
      });
    });
    server = await run.step("server", () => startServer(databaseUrl, path.join(work, "server.log"), childEnv));
    const repo = await run.step("repository", () => createRepository(work, options.scenario));
    const smoke = new Smoke(run, repo, helperEnv, userId);
    if (options.scenario === "new-user") {
      const plugin = await run.step("plugin-install", () => installPlugin(run, options, work, helperEnv));
      record.pluginCommit = plugin.commit;
      await newUser(smoke, plugin, options, login, token.plain, childEnv);
    } else {
      const previousRef = options.previousRef!;
      const previous = await run.step("previous-plugin", async () => {
        const root = path.join(exportPlugin(previousRef, path.join(work, "previous-plugin")), "plugin");
        return { root, commit: previousRef };
      });
      record.previousCommit = previous.commit;
      const plugin = await update(smoke, previous, () => installPlugin(run, options, work, helperEnv), options, token.plain);
      record.pluginCommit = plugin.commit;
    }
    await run.step("secret-scan", () => {
      if (run.outputs.some(output => containsSecret(output, token.plain))) throw new Error("a command printed a token value");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`step ${run.failure ?? "unknown"} failed: ${containsSecret(message, token.plain) ? "details withheld because they contain a token" : message.slice(0, 500)}`);
    console.error(`server: ${!server ? "not started" : server.exitCode === null ? "running" : `exited ${server.exitCode}`}`);
    run.failure ??= "unexpected";
  } finally {
    await stopServer(server);
    if (userId) {
      const { withPrisma } = await import("../lib/prisma");
      await withPrisma(prisma => prisma.user.delete({ where: { id: userId } })).catch(() => console.error("cleanup: the fixture user was not deleted"));
    }
  }
  record.failure = run.failure;
  record.seconds = Math.round((Date.now() - started) / 1000);
  console.log(JSON.stringify(summarize(record)));
  return run.failure ? 1 : 0;
}
```

After (새 함수 세 개와 `runSmoke`):

```ts
export function seedTemplates(run: Run, templates: string, snapshot: string, childEnv: NodeJS.ProcessEnv): string {
  const output = run.succeed(process.execPath, ["--import", "tsx", "scripts/templates/seed-templates.ts", "--dir", templates, "--snapshot", snapshot], REPO, childEnv, "seed:templates", 300_000).stdout;
  const revision = /done: \d+ templates atomically seeded from ([0-9a-f]{40})/.exec(output)?.[1];
  if (!revision) throw new Error("seed:templates did not report a template revision");
  return revision;
}

export async function createFixtureUser(login: string, tokenHash: string): Promise<string> {
  const { withPrisma } = await import("../lib/prisma");
  return withPrisma(async prisma => {
    const user = await prisma.user.create({ data: { login, githubId: -randomInt(1, 2_000_000_000) } });
    await prisma.userToken.create({ data: { userId: user.id, hash: tokenHash, label: "e2e smoke" } });
    return user.id;
  });
}

export async function deleteFixtureUser(userId: string): Promise<void> {
  const { withPrisma } = await import("../lib/prisma");
  await withPrisma(prisma => prisma.user.delete({ where: { id: userId } })).catch(() => console.error("cleanup: the fixture user was not deleted"));
}

async function runSmoke(options: Options, databaseUrl: string, env: NodeJS.ProcessEnv): Promise<number> {
  const started = Date.now();
  const work = realpathSync.native(mkdtempSync(path.join(env.RUNNER_TEMP ?? tmpdir(), "stagekeeper-e2e-")));
  const run = new Run(path.join(work, "commands.log"));
  const token = newToken("user");
  const login = `stagekeeper-e2e-${randomBytes(4).toString("hex")}`;
  const record: Record<string, unknown> = { client: options.client, os: osLabel(), scenario: options.scenario, pluginSource: options.pluginSource, steps: run.steps };
  const childEnv: NodeJS.ProcessEnv = { ...env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl };
  const helperEnv: NodeJS.ProcessEnv = { ...env, HARNESS_TOKEN: token.plain, HARNESS_SERVER: ORIGIN };
  delete helperEnv.DATABASE_URL;
  delete helperEnv.TEST_DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  let server: ChildProcess | undefined;
  let userId: string | undefined;
  try {
    record.templatesCommit = await run.step("seed-templates", () => seedTemplates(run, options.templates, options.snapshot ?? path.join(work, "template-snapshot.json"), childEnv));
    userId = await run.step("fixture", () => createFixtureUser(login, token.hash));
    server = await run.step("server", () => startServer(databaseUrl, path.join(work, "server.log"), childEnv));
    const repo = await run.step("repository", () => createRepository(work, options.scenario));
    const smoke = new Smoke(run, repo, helperEnv, userId);
    if (options.scenario === "new-user") {
      const plugin = await run.step("plugin-install", () => installPlugin(run, options, work, helperEnv));
      record.pluginCommit = plugin.commit;
      await newUser(smoke, plugin, options.scenario, login, token.plain, childEnv);
    } else {
      const previousRef = options.previousRef!;
      const previous = await run.step("previous-plugin", async () => {
        const root = path.join(exportPlugin(previousRef, path.join(work, "previous-plugin")), "plugin");
        return { root, commit: previousRef };
      });
      record.previousCommit = previous.commit;
      const plugin = await update(smoke, previous, () => installPlugin(run, options, work, helperEnv), options, token.plain);
      record.pluginCommit = plugin.commit;
    }
    await run.step("secret-scan", () => {
      if (run.outputs.some(output => containsSecret(output, token.plain))) throw new Error("a command printed a token value");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`step ${run.failure ?? "unknown"} failed: ${containsSecret(message, token.plain) ? "details withheld because they contain a token" : message.slice(0, 500)}`);
    console.error(`server: ${!server ? "not started" : server.exitCode === null ? "running" : `exited ${server.exitCode}`}`);
    run.failure ??= "unexpected";
  } finally {
    await stopServer(server);
    if (userId) await deleteFixtureUser(userId);
  }
  record.failure = run.failure;
  record.seconds = Math.round((Date.now() - started) / 1000);
  console.log(JSON.stringify(summarize(record)));
  return run.failure ? 1 : 0;
}
```

지켜야 할 불변식:

- `client-init-smoke`의 단계 이름, 순서, 판정, 오류 문구는 그대로다.
- 바뀌는 것은 세 가지뿐이다.
  - 선언을 export하는지
  - 받는 값의 타입
  - 단계 몸통을 이름 있는 함수로 옮긴 것
- 진입 조건(`process.argv[1]` 비교) 때문에 이 파일을 import해도 리허설이 실행되지는 않는다.

**`.github/workflows/client-init-smoke.yml` (PR 1)**

Before (76~120행):

```yaml
      - name: Start portable PostgreSQL 18 (Windows)
        if: steps.gate.outputs.ready == 'true' && runner.os == 'Windows'
        shell: pwsh
        run: |
          $root = Join-Path $env:RUNNER_TEMP 'pg'
          npm install --prefix $root --no-save --no-audit --no-fund "@embedded-postgres/${{ matrix.pg }}@18.4.0-beta.17"
          if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
          $bin = Join-Path $root 'node_modules/@embedded-postgres/${{ matrix.pg }}/native/bin'
          $data = Join-Path $env:RUNNER_TEMP 'pgdata'
          & (Join-Path $bin 'initdb.exe') -D $data -U postgres --auth=trust -E UTF8 --no-locale
          if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
          netsh interface ipv4 show excludedportrange protocol=tcp
          $env:PGPORT = $env:PG_PORT
          $log = Join-Path $env:RUNNER_TEMP 'pg.log'
          $process = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D', $data, '-l', $log, '-w', 'start') -NoNewWindow -PassThru -RedirectStandardOutput (Join-Path $env:RUNNER_TEMP 'pgctl.out') -RedirectStandardError (Join-Path $env:RUNNER_TEMP 'pgctl.err')
          $null = $process.Handle
          $printLogs = { foreach ($file in @((Join-Path $env:RUNNER_TEMP 'pgctl.out'), (Join-Path $env:RUNNER_TEMP 'pgctl.err'), $log)) { if (Test-Path $file) { "--- $file"; Get-Content $file } } }
          if (-not $process.WaitForExit(120000)) { & $printLogs; throw 'pg_ctl did not return' }
          if ($process.ExitCode -ne 0) { & $printLogs; throw "pg_ctl start failed with exit code $($process.ExitCode)" }
      - name: Start portable PostgreSQL 18 (macOS)
        if: steps.gate.outputs.ready == 'true' && runner.os == 'macOS'
        shell: bash
        run: |
          root="$RUNNER_TEMP/pg"
          npm install --prefix "$root" --no-save --no-audit --no-fund "@embedded-postgres/${{ matrix.pg }}@18.4.0-beta.17"
          bin="$root/node_modules/@embedded-postgres/${{ matrix.pg }}/native/bin"
          data="$RUNNER_TEMP/pgdata"
          "$bin/initdb" -D "$data" -U postgres --auth=trust -E UTF8 --no-locale
          if ! PGPORT="$PG_PORT" "$bin/pg_ctl" -D "$data" -l "$RUNNER_TEMP/pg.log" -w start < /dev/null > "$RUNNER_TEMP/pgctl.out" 2>&1; then
            for file in "$RUNNER_TEMP/pgctl.out" "$RUNNER_TEMP/pg.log"; do
              if [ -f "$file" ]; then echo "--- $file"; cat "$file"; fi
            done
            exit 1
          fi
      - name: Create the test database
        if: steps.gate.outputs.ready == 'true'
        shell: bash
        run: >-
          node -e 'const { Client } = require("pg");
          (async () => { const c = new Client({ host: "127.0.0.1", port: Number(process.env.PG_PORT), user: "postgres", database: "postgres" });
          await c.connect(); await c.query("CREATE DATABASE stagekeeper_test_e2e"); await c.end(); })().catch(e => { console.error(e.message); process.exit(1); });'
      - name: Apply migrations
        if: steps.gate.outputs.ready == 'true'
        shell: bash
        run: DATABASE_URL="$TEST_DB" node node_modules/prisma/build/index.js migrate deploy
```

After:

```yaml
      - name: Prepare the smoke database
        if: steps.gate.outputs.ready == 'true'
        uses: ./.github/actions/smoke-database
        with:
          pg-package: ${{ matrix.pg }}
          port: ${{ env.PG_PORT }}
          database: stagekeeper_test_e2e
```

`on.pull_request.paths`(6~13행)에 `".github/actions/smoke-database/**"`를 더한다. 그래야 action을 바꾼 PR에서도 이
워크플로가 돈다. job의 `PG_PORT`·`TEST_DB`는 서버 빌드와 리허설이 계속 쓰므로 그대로 둔다.

**`AGENTS.md` (PR 2)**

Before (97~101행):

```markdown
- Before promoting, run the `client-init-smoke` workflow on the `dev` commit being
  promoted (`gh workflow run client-init-smoke.yml --ref dev`), and also `agent-eval`
  when shipped `plugin/` files changed. Stop unless every job is green, and promote
  only the commit their summaries name. Both check plugin installation and init
  only; neither runs the pipeline.
```

After:

```markdown
- Before promoting, run the `client-init-smoke` workflow on the `dev` commit being
  promoted (`gh workflow run client-init-smoke.yml --ref dev`), and also `agent-eval`
  when shipped `plugin/` files changed. Stop unless every job is green, and promote
  only the commit their summaries name. Both check plugin installation and init
  only; neither runs the pipeline.
- Before promoting, also run the `pipeline-smoke` workflow on that `dev` commit
  (`gh workflow run pipeline-smoke.yml --ref dev`) when
  `git diff --name-only origin/main origin/dev -- src/server/pipeline src/server/agents src/server/mcp packages/core/pipeline packages/core/templates plugin/skills/watch plugin/skills/background plugin/bin/harness-watch.mjs plugin/bin/harness-session.mjs plugin/bin/harness-background.mjs plugin/runtime plugin/lib/execution scripts/rehearsals/rehearse-client-init-smoke.ts scripts/rehearsals/rehearse-pipeline-smoke.ts scripts/rehearsals/pipeline-smoke-steps.mjs .github/workflows/pipeline-smoke.yml .github/actions/smoke-database`
  prints a file. Run it with `--field templates-ref=<templates branch>` before seeding
  a role-template change to production. When `agent-eval` is also needed, dispatch
  `pipeline-smoke` after it finishes, because both use the same subscription. It runs
  one backlog item from assignment to acceptance with a real model and the background
  runner. Stop unless it is green; rerun it once only when its summary shows a cause
  outside the change, such as a model API error or a runner that did not start.
  When a green summary shows a nonzero `harnessErrors` or `stepRefusals`, open the
  sealed transcripts before promoting, and fix the contract, hint or template wording
  first when it caused the refusal.
```

경로 목록은 이 한 줄 코드 span에만 있다. `pipeline-smoke-steps.test.mjs`가 이 줄을 읽어 경로가 모두 있는지 확인한다.

**`docs/architecture/verification.md` (PR 2)**

다음 세 곳에 더한다.

- 136행 `client-init-smoke` 항목: "각 job은 일회용 PostgreSQL 18" 바로 뒤에
  "(`.github/actions/smoke-database`, `pipeline-smoke`와 공유)"를 더한다.
- `agent-eval` 항목 뒤에 새 항목을 더한다.

```markdown
- [pipeline-smoke](../../.github/workflows/pipeline-smoke.yml)는 `windows-2022`에서 실제 Claude와 무인 실행기로 백로그
  항목 하나를 배정부터 문서 감사까지 처리하는지 본다. `client-init-smoke`와 같은 서버·DB·설치·init 위에서 Pro로
  올리고, 게이트 없는 파이프라인(`assign-work`·`plan`·`verify`·`implement`·`impl-verify`·`accept`·`doc-audit`)과 고정
  백로그 항목을 넣은 뒤 `harness-background.mjs --start --propose yes`로 실행기를 띄운다. 항목이
  `pipeline-completed`에 닿고, 다섯 역할이 AgentRun에 남고, 리허설의 독립 사례와 `node --test`가 통과해야 녹색이다.
  보류, 인수 실패, 구현 검증 실패, 게이트, 실행기 종료는 원인별 단계 이름으로 바로 실패한다. 커밋 핸드오프는 메인
  루프가 커밋하고 이어 가도록 5분까지 기다린 뒤 `item-handoff`로 실패한다. 녹색이어도 요약의
  `harnessErrors`나 `stepRefusals`가 0이 아니면 승격 전에 봉인 전사로 원인을 확인한다. 승격 전 수동 실행과
  주 1회(수요일 18:00 UTC, `main`)에 돌고 PR에서는 돌지 않는다. 주간 실행은 템플릿 저장소의 기본 브랜치를 시드하므로,
  실패가 아직 운영에 시드하지 않은 템플릿 변경 때문일 수 있다. 구독 토큰 `E2E_CLAUDE_OAUTH_TOKEN`을 쓰고, 모델은
  고정하지 않아 그 계정의 기본 모델로 돈다. 실제 모델과 정가 환산 비용은 요약에 남는다(2026-11-02 첫 실행
  `claude-sonnet-5-5`, 약 $1.5, job 12분). 공개 로그에는 허용 필드 요약만 남긴다. 실행 기록과 세션 전사는
  `E2E_TRANSCRIPT_KEY`로 봉인한 artifact(7일)로만 남긴다. Codex 실행은 Codex 공개 배포에 착수할 때 붙인다.
```

- 비용 문장은 처음에 추정치 "약 $14~19"였다. Phase 5에서 Phase 3 실측으로 바꾸고, 모델을 고정하지 않는다는 것과
  Codex를 붙이는 시점을 더했다.
- 저장소 스크립트 표 322행(init 리허설 시험)의 설명 끝에 PR 2가 더한 시험 두 개를 적는다. "종료 코드 0이어도 시간
  초과한 명령은 실패로 세는지, 출력 파일로 받은 명령이 남은 자식 프로세스를 기다리지 않는지"다.
- 저장소 스크립트 표의 322행 뒤에 세 행을 더한다.

```markdown
| `rehearsals/rehearse-pipeline-smoke.ts`, `rehearsals/pipeline-smoke-steps.mjs` | 저장소 루트에서 `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-pipeline-smoke.ts --templates <비공개 템플릿 절대 경로> --plugin-branch <브랜치> --plugin-commit <커밋> --transcripts <봉인 파일 절대 경로> [--wait-minutes <5~90>]`. `TEST_DATABASE_URL`, `CI=true`(또는 `--allow-machine-changes`), `TRANSCRIPT_KEY`, 로그인된 `claude`(CI는 `CLAUDE_CODE_OAUTH_TOKEN`)와 `npm run build` 산출물이 필요하다 | `pipeline-smoke` workflow | init 리허설의 서버·설치·init 단계를 재사용한다. Pro로 올린 뒤 게이트 없는 파이프라인과 고정 백로그 항목을 넣고 무인 실행기를 띄운다. 항목 상태는 `nextFor`와 실행기 상태로 판정하고, 멈춘 상태는 원인별로 바로 실패시킨다. 그다음 역할 기록, 독립 사례, `node --test`로 결과를 확인한다. 실제 모델 사용량을 쓰고 러너 사용자 설정을 바꾸므로 개발 PC에서 돌리지 않는다. 표준 출력은 허용 필드의 요약 한 줄이다. 전사는 봉인 파일로만 남기고, 종료 시 실행기·서버·fixture 사용자를 정리한다 |
| `rehearsals/rehearse-pipeline-smoke.test.ts`, `rehearsals/pipeline-smoke-steps.test.mjs` | `test:scripts` | CI마다 | 다음을 검사한다. 잘못된 인자와 기계 설정·DB·전사 키를 작업 전에 거부하는지. 대기 판정의 원인별 실패. 실행 기록 집계의 중복 제거와 합산(세션 누적 비용과 반복 거부는 한 번만). 공개 요약의 허용 필드와 토큰 미노출. 봉인·열기와 변조·악성 이름 거부, 새 폴더에만 쓰기. 독립 판정 사례. AGENTS.md 승격 경로가 실제로 있는지 |
| `rehearsals/open-pipeline-transcripts.mjs` | `node scripts/rehearsals/open-pipeline-transcripts.mjs --key-file <키 파일> --in <봉인 파일> --out <새 폴더>` | 실패 조사 때 로컬 | 받은 봉인 파일을 키로 열어 새 빈 폴더에 푼다. 이미 있는 폴더와 안전하지 않은 이름은 거부한다 |
```

## 5. 실행 순서

PR 2의 원격 브랜치는 PR을 열 때 처음 push한다. 실제 모델 실행(Phase 3·4)이 끝날 때까지 PR 2는 draft로 둔다. 이
사용자는 CI가 녹색이면 바로 머지하기 때문이다.

### Phase 1 (PR 1): DB 준비 action 공유

- 작업 내용:
  - `.github/actions/smoke-database/action.yml`을 만든다.
  - `client-init-smoke.yml`의 네 단계를 그 action으로 바꾸고, paths에 action 경로를 더한다.
- 검증(회귀, 필수):
  - PR 1에서 `client-init-smoke` 네 job이 22/22·21/21로 녹색이어야 한다.
  - Windows job 로그에 예약 포트 구간 출력이 그대로 남아야 한다.
  - `check`가 녹색이어야 한다.
  - 사용자가 머지한다.

### Phase 2 (PR 2): 순수 함수와 시험

- 작업 내용:
  - PR 1이 머지된 최신 `dev`에서 `harness/pipeline-smoke` 브랜치를 만든다.
  - `pipeline-smoke-steps.mjs`, `pipeline-smoke-steps.test.mjs`, `open-pipeline-transcripts.mjs`를 만든다.
  - 이 단계의 시험 파일에는 AGENTS.md 경로 시험을 아직 넣지 않는다. 목록의 경로 일부(`rehearse-pipeline-smoke.ts`,
    `pipeline-smoke.yml`)는 Phase 3에서 생기므로, 미리 넣으면 draft PR의 `check`가 그때까지 빨갛다.
- 검증:
  - `node --test scripts/rehearsals/pipeline-smoke-steps.test.mjs`가 통과해야 한다.
  - 일부러 깨뜨린 사본 세 개에서는 시험이 실패해야 한다.
    - 봉인할 때 인증 태그를 빼는 사본
    - 요약에서 `RUN_LINE` 거름을 빼는 사본
    - `WAIT_FAILURES`에서 `impl-verify`를 빼는 사본
  - 깨뜨린 사본은 되돌린다.

### Phase 3 (PR 2): 리허설, 워크플로, 첫 실제 실행

- 작업 내용:
  - `rehearse-pipeline-smoke.ts`, 그 시험, `pipeline-smoke.yml`을 만든다.
  - init 리허설에 export와 함수 세 개를 더한다.
  - AGENTS.md 승격 항목(위 After)과 경로 시험을 함께 더한다. 이제 목록의 경로가 모두 있다.
  - 사용자 승인 뒤 `E2E_TRANSCRIPT_KEY`를 등록한다.
  - 첫 실행 전에 이 PC에서 Open Question 1을 미리 본다. 신뢰된 적 없는 새 폴더에 가짜 역할 하나를 두고
    `claude -p`를 한 번 돌려 그 역할을 쓸 수 있는지 확인한다. 결과로 첫 실행에 `--trust-checkout`을 넣을지 정한다.
  - 워크플로를 GitHub에 등록한다. GitHub 문서상 `workflow_dispatch`는 기본 브랜치에 파일이 있어야 동작한다.
    실측으로는 한 번 실행된 워크플로라면 다른 브랜치에서도 수동 실행이 됐다(2026-10-30 `e2e-smoke`, dev).
    그런데 이 워크플로에는 예약과 수동 실행 트리거뿐이라 등록될 계기가 없다. 그래서 `harness/pipeline-smoke`
    브랜치에만 반응하는 임시 `push` 트리거를 더하고, push로 뜬 실행에서는 job을 건너뛰게
    한다(`if: github.event_name != 'push'`). 비용 없이 등록만 된다. `agent-eval`도 처음에 브랜치 한정 `push`
    트리거로 등록한 뒤 뺐다(`c7dcb48` → `2768cea`). 등록이 되지 않으면 그 push 실행에서 job을 실제로 돌려
    첫 실행으로 쓴다.
  - `gh workflow run pipeline-smoke.yml --ref harness/pipeline-smoke`로 실행한다.
- 이 실행은 `dev`의 서버와 플러그인 코드를 그대로 쓴다. PR 1·2는 둘 다 건드리지 않는다. 그래서 첫 녹색 실행을 #275의
  승격 전 실제 모델 확인으로도 쓴다(2026-11-02 결정). 첫 실행이 두 번 실패하면 기다리지 않는다. 그때는 #272~#276을 먼저
  승격하고 운영 실기로 확인한다.
- 첫 판정은 작업 공간 신뢰(Open Question 1)다.
  - 다음 셋으로 서브에이전트가 실제로 떴는지 본다.
    - 요약의 `agentCalls`와 `agentErrors`
    - `roles-ran`
    - 봉인 전사
  - 떴다면 신뢰 처리가 필요 없다고 기록한다.
  - 안 떴다면 리허설에 `--trust-checkout`을 더한다. 이 옵션은 실행기를 시작하기 전에 픽스처 checkout을
    `~/.claude.json`에서 신뢰된 상태로 만든다. 그다음 다시 돌린다.
  - 실제 소유자는 init할 때 그 폴더에서 이미 Claude Code를 열었으므로, 신뢰된 상태가 현실과 같다.
- 검증:
  - 성공 기준 1~6을 확인한다.
  - 다음 값을 이 문서의 `Verification Results`에 적는다.
    - 실측 시간, 비용, 모델
    - `permission`
    - `harnessErrors`·`stepRefusals` (#275가 들어간 `dev`라서 `assignment_context`가 0인지 함께 본다)
    - `agentCalls`
  - 봉인 artifact를 받아 로컬 키로 연다.
  - Open Questions 2~4를 이 실행에서 답한다.

### Phase 4 (PR 2): 음성 증명

- 작업 내용:
  - 원격에 임시 브랜치를 만든다. 그 브랜치에서는 `pipeline-saved`의 `gates`를 `["before-plan"]`로 바꾼다.
  - 이 브랜치는 PR 없이 push한다. push하기 전에 한 줄로 알린다.
  - `--field templates-ref=main`을 붙여 실행한다. 이 입력이 제대로 전달되는지도 함께 확인한다.
  - 대기 판정이 배정 직후 실패시키므로 비용은 배정 한 번 정도다.
  - 끝나면 원격 임시 브랜치를 지운다.
- 검증:
  - `item-assigned`는 pass, `item-gated`는 fail이어야 한다.
  - 봉인 파일이 artifact로 남고 로컬 키로 열려야 한다(성공 기준 7).
  - 요약에 `runnerState`가 남아야 한다.

### Phase 5 (PR 2): 문서와 승격 절차

- 작업 내용:
  - `verification.md`를 위 After대로 고친다. AGENTS.md는 Phase 3에서 이미 바뀌었다.
  - Phase 3의 임시 `push` 트리거와 job 조건을 빼서 워크플로를 위 4장의 모습으로 되돌린다.
  - 이 문서의 결과 칸을 채우고 PR을 ready로 바꾼다.
  - 사용자가 머지한다.
- 검증:
  - `npm run check`, `npm test`, `npm run test:architecture`, `npm run verify:fsd`, `npm run verify:server`가
    통과해야 한다. AGENTS.md 경로 시험도 여기에 포함된다.
  - PR 2의 `client-init-smoke` 네 job이 녹색이어야 한다(회귀).
  - dev push CI가 녹색이어야 한다.
  - 머지 뒤 첫 승격부터 새 규칙을 적용한다. 주 1회 예약은 그 승격으로 `main`에 들어간 뒤부터 돈다.

## 6. 영향 범위

- 직접 수정 대상:
  - PR 1:
    - `.github/actions/smoke-database/action.yml`(신규)
    - `.github/workflows/client-init-smoke.yml`: 단계 네 개를 action 하나로 바꾸고 paths에 한 줄을 더한다
  - PR 2:
    - `scripts/rehearsals/rehearse-client-init-smoke.ts`: export 열세 개, 두 함수의 받는 값, `runSmoke`의 단계 몸통을
      함수로
    - `AGENTS.md`: 승격 항목 하나
    - `docs/architecture/verification.md`: 항목 하나, 구절 하나, 표 세 행과 기존 한 행의 설명
- 신규: PR 1 한 파일, PR 2 여섯 파일(4장 표)
- import 변경: 새 리허설은 다음을 가져온다.
  - init 리허설
  - `client-init-smoke-steps.mjs`의 `helperCommand`·`containsSecret`
  - `src/server/pipeline/api`의 `loadPipelinesView`·`savePipelineDefinition`·`createBoardService`·`nextFor`
  - `scripts/lib/prisma`의 `withPrisma`
  - `scripts/test-server-integration.mjs`의 `validateTestDatabase`
  - `packages/core/tokens/token.mjs`의 `newToken`
- 외부 의존성:
  - GitHub Actions `windows-2022`와 `actions/upload-artifact@v4`(이미 사용 중)
  - `https://claude.ai/install.ps1`
  - 구독 토큰 `E2E_CLAUDE_OAUTH_TOKEN`(있음)과 `E2E_TEMPLATES_TOKEN`(있음)
  - 새 비밀값 `E2E_TRANSCRIPT_KEY`
- 소비자/사용처 영향:
  - `rehearse-client-init-smoke`로 역방향 검색을 한 번 했다. 결과는 다섯 곳이다.
    - `client-init-smoke.yml` 두 곳: paths, 실행 인자
    - `verification.md` 두 곳: 140, 321행
    - 자기 시험: `main`·`parseArguments`만 import한다
  - 새 export, 받는 값의 변경, 함수로 옮긴 것은 이 다섯 곳의 동작을 바꾸지 않는다.
  - 문자열 경로로 실행하는 참조는 워크플로 인자뿐이다. 동적 참조를 모두 찾아본 것은 아니다.
- 제품 동작과 운영: 바뀌지 않는다. 서버·플러그인 코드, 마이그레이션, 템플릿, 운영 DB를 건드리지 않는다. 플러그인
  출하 파일이 바뀌지 않으므로 판 상승도 필요 없다.
- 비용: 구독 사용량이 든다. 대략 주 1회와 파이프라인 관련 승격마다 1회다.

## 7. 리스크 + 롤백 전략

### 리스크

| 리스크 | 가능성 | 영향 | 대응 |
| --- | --- | --- | --- |
| CI 픽스처 checkout을 신뢰하지 않아 `.claude/agents` 역할이 로드되지 않는다 | 중 | 녹색이 안 됨 | Phase 3 첫 판정에서 `agentCalls`·`agentErrors`·`roles-ran`으로 확인한다. 안 되면 `--trust-checkout`을 더한다 |
| CI에서 auto 권한 탐침이 실패해 실행기가 허용 목록으로 내려간다. 허용 목록 밖 명령이 거부돼 항목이 멈춘다. impl-verifier의 일회용 사본 확인도 Bash가 필요하다 | 중 | 녹색이 안 됨 | Phase 3에서 실측한다. 허용 목록으로 내려가면 auto가 없는 사용자도 같은 상황이므로, 리허설을 고치지 않고 제품 결함 후보로 따로 보고한다 |
| 모델 비결정성(계획 단계 보류, 같은 거부 반복, 다른 해석) | 중 | 거짓 빨강 | 항목 문구에서 바깥 동작을 모두 정했다. 두 규칙이 함께 걸리는 입력의 순서도 정했다(2026-11-04 보류 뒤 보완). 멈추면 원인별 이름으로 바로 실패한다. 재실행은 변경 밖 원인일 때 1회만 한다 |
| 구독 사용량 한도, 소유자의 동시 사용, `agent-eval`과의 동시 실행 | 중 | 실패, 소유자 작업 방해 | 예약은 KST 새벽에 둔다. concurrency는 1이다. `agent-eval`이 끝난 뒤 dispatch한다(AGENTS.md). 한도 때문에 실패하면 변경 밖 원인으로 보고 재실행한다 |
| 시간 초과로 리허설이 죽어 전사를 잃는다 | 낮음 | 진단 불가 | 리허설 내부 마감 100분, 봉인 몫 5분, step 한도 108분, job 한도 120분. 음성 증명에서 실패 경로의 봉인을 확인한다 |
| 공개 노출(토큰, 모델 출력) | 낮음 | 높음 | 요약은 허용 필드만 담는다. 전사는 봉인한다. `secret-scan`을 돌리고 GitHub도 비밀값을 마스킹한다. 키는 자식 프로세스에 넘기지 않고, 비밀값과 저장소 밖 파일에만 둔다 |
| PR 1 composite action으로 `client-init-smoke` 회귀 | 낮음 | 승격이 막힘 | PR 1에서 `client-init-smoke`가 돈다(paths). PR 2보다 먼저 따로 머지한다 |
| 승격 경로 목록이 낡는다(파일 이동) | 낮음 | 검사 누락 | 경로 존재 시험이 깨진다 |
| 실행기 프로세스가 남는다 | 낮음 | 거의 없음 | `finally`에서 stop을 보낸다. 러너 VM은 job이 끝나면 폐기된다 |
| Windows 알림(`notify.ps1`)이 CI의 비대화 세션에서 실패한다 | 낮음 | 알림 한 번에 최대 15초 지연 | 실행기의 `notify`는 최대 15초 기다리고, 실패하면 `background.log`에 `notice failed`만 남긴다(`plugin/bin/harness-background.mjs` `notify`). Phase 3에서 이 줄이 있는지 본다 |
| 예약은 `main`에서만 돈다 | 확실 | 머지 전에는 주 1회가 없다 | 첫 승격 뒤부터 돈다 |

### 롤백 전략

- PR 1: revert하면 `client-init-smoke`가 원래 단계로 돌아간다. PR 2가 이미 머지됐다면 `pipeline-smoke.yml`의 DB 준비
  단계도 함께 되돌려야 하므로, PR 2를 먼저 revert한다.
- PR 2:
  - revert하면 새 파일 여섯 개, init 리허설의 변경, AGENTS.md·`verification.md`가 함께 돌아간다.
  - 승격 조건은 이전으로 돌아가고, 사람이 하던 임시 실기 규칙이 다시 유효해진다.
- 비밀값 `E2E_TRANSCRIPT_KEY`는 지워도 되고 남겨도 된다.
- 운영 서버와 DB에는 영향이 없다.

## 8. 검증 전략

- 기존 테스트: `scripts/rehearsals/rehearse-client-init-smoke.test.ts`와 `client-init-smoke-steps.test.mjs`가 바꾸지
  않은 채 통과해야 한다(`npm run test:scripts`).
- 회귀 시험(필수): PR 1과 PR 2 모두 `client-init-smoke` 네 job이 녹색이어야 한다. PR 1은 그 워크플로를, PR 2는 그
  리허설을 바꾼다.
- 추가 테스트: 아래 두 파일이다. 형식은 형제 시험인 `client-init-smoke-steps.test.mjs`(`node:test`의 `it`,
  `node:assert/strict`)와 `rehearse-client-init-smoke.test.ts`를 따른다. `test:scripts`가
  `scripts/**/*.test.mjs`·`scripts/**/*.test.ts`를, `test:architecture`가 `scripts/**/*.test.mjs`를 찾는다
  (`package.json:16-17`).

`scripts/rehearsals/pipeline-smoke-steps.test.mjs`:

```js
import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { gzipSync } from "node:zlib";
import { containsSecret } from "./client-init-smoke-steps.mjs";
import { BACKLOG_ITEM, HANDOFF_LIMIT_MS, INDEPENDENT_CASES, RUNNER_WAIT_LIMIT_MS, caseResults, openTranscripts, runFindings, sealTranscripts, smokeTriggerPaths, summarizePipeline, transcriptKey, waitVerdict, writeTranscripts } from "./pipeline-smoke-steps.mjs";

const line = value => JSON.stringify(value);
const toolUse = (id, name) => line({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input: {} }] } });
const toolError = id => line({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, is_error: true, content: "refused" }] } });
const result = (turns, cost) => line({ type: "result", num_turns: turns, permission_denials: [], total_cost_usd: cost });
const sealRaw = (bundle, key) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(bundle))), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
};

it("counts tool calls once across the run stream and the session transcripts", () => {
  const stream = [
    toolUse("t1", "mcp__harness__assignment_context"), toolError("t1"),
    toolUse("t2", "Bash"), toolError("t2"),
    toolUse("t3", "Agent"),
    line({ type: "user", message: { content: "plain prompt" } }),
    "not json",
    line({ type: "result", num_turns: 7, permission_denials: [{ tool_name: "Bash" }], total_cost_usd: 1.25, modelUsage: { "claude-opus-5-5": {}, "claude-sonnet-5-5": {} } }),
  ].join("\n");
  const transcript = [toolUse("t1", "mcp__harness__assignment_context"), toolError("t1"), toolUse("t4", "Task"), toolError("t4"), toolError("t9")].join("\n");
  const findings = runFindings([stream], [transcript]);
  assert.deepEqual(findings.harnessErrors, { assignment_context: 1 });
  assert.equal(findings.toolErrors, 4);
  assert.equal(findings.agentCalls, 2);
  assert.equal(findings.agentErrors, 1);
  assert.equal(findings.turns, 7);
  assert.equal(findings.denials, 1);
  assert.equal(findings.costUsd, 1.25);
  assert.deepEqual([...findings.models].sort(), ["claude-opus-5-5", "claude-sonnet-5-5"]);
});

it("adds turns, denials and cost over several runs", () => {
  const first = runFindings([result(3, 0.5)]);
  const second = runFindings([result(4, 0.25)]);
  const both = runFindings([result(3, 0.5), result(4, 0.25)]);
  assert.equal(both.turns, first.turns + second.turns);
  assert.equal(both.denials, first.denials + second.denials);
  assert.ok(Math.abs(both.costUsd - (first.costUsd + second.costUsd)) < 1e-9);
});

it("counts a session's cumulative cost and repeated denials once when the session reports several results", () => {
  const sessionResult = (turns, cost, denials) => line({ type: "result", session_id: "s1", num_turns: turns, permission_denials: denials, total_cost_usd: cost });
  const firstRun = [sessionResult(6, 0.75, [{ tool_use_id: "d1" }]), sessionResult(4, 1.5, [{ tool_use_id: "d1" }])].join("\n");
  const resumedRun = sessionResult(3, 1.5, [{ tool_use_id: "d1" }, { tool_use_id: "d2" }]);
  const otherSession = line({ type: "result", session_id: "s2", num_turns: 2, permission_denials: [{ tool_use_id: "d1" }], total_cost_usd: 0.25 });

  const findings = runFindings([firstRun, resumedRun, otherSession]);

  assert.equal(findings.costUsd, 1.75);
  assert.equal(findings.denials, 3);
  assert.equal(findings.turns, 15);
});

it("keeps only allowlisted values in the public summary", () => {
  const token = `hu_${"a".repeat(43)}`;
  const summary = summarizePipeline({
    os: "win32-x64", pluginCommit: "a".repeat(40), templatesCommit: "main", permission: "auto", runnerState: "idle", waitReason: "free text",
    steps: [{ step: "item-done", result: "pass" }, { step: `leak ${token}`, result: "pass" }],
    runs: ["done: 12 turns, 0 denied", `model said ${token}`],
    findings: { turns: 12, denials: 0, toolErrors: 5, agentCalls: 6, agentErrors: 0, costUsd: 3.456, models: ["claude-opus-5-5", "gpt-5"], harnessErrors: { assignment_context: 1, "Free Text": 2 } },
    stepRefusals: 0, minutesToDone: 31, sealed: true, seconds: 2400,
  });
  assert.equal(containsSecret(JSON.stringify(summary), token), false);
  assert.equal(summary.pluginCommit, "a".repeat(40));
  assert.equal(summary.templatesCommit, undefined);
  assert.equal(summary.runnerState, "idle");
  assert.equal(summary.waitReason, undefined);
  assert.deepEqual(summary.steps, [{ step: "item-done", result: "pass" }]);
  assert.deepEqual(summary.runs, ["done: 12 turns, 0 denied"]);
  assert.deepEqual(summary.models, ["claude-opus-5-5"]);
  assert.deepEqual(summary.harnessErrors, { assignment_context: 1 });
  assert.equal(summary.toolErrors, undefined);
  assert.equal(summary.agentCalls, 6);
  assert.equal(summary.stepRefusals, 0);
  assert.ok(Math.abs(summary.costUsd - 3.456) < 0.01);
  assert.equal(summary.result, "pass");
  assert.equal(summarizePipeline({ failure: "item-gated" }).result, "fail");
  assert.equal(summarizePipeline({ minutesToDone: -1 }).minutesToDone, undefined);
});

it("opens sealed transcripts only with the same key, an untouched file and safe names", () => {
  const key = randomBytes(32);
  const files = { "runs/20261102T000000000Z.jsonl": `${line({ type: "result" })}\n`, "background.log": "runner started\n" };
  const sealed = sealTranscripts(files, key);
  assert.deepEqual(openTranscripts(sealed, key), files);
  assert.deepEqual(openTranscripts(sealRaw({ version: 1, files }, key), key), files);
  assert.equal(sealed.includes(Buffer.from("runner started")), false);
  assert.throws(() => openTranscripts(sealed, randomBytes(32)));
  const tampered = Buffer.from(sealed);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => openTranscripts(tampered, key));
  assert.throws(() => openTranscripts(sealed.subarray(0, 20), key));
  assert.throws(() => openTranscripts(sealRaw({ version: 1, files: { "../outside.txt": "x" } }, key), key));
  assert.throws(() => openTranscripts(sealRaw({ version: 2, files: {} }, key), key));
  assert.throws(() => sealTranscripts(files, randomBytes(16)));
  assert.throws(() => sealTranscripts({ "../outside.txt": "x" }, key));
});

it("reads a base64 key of exactly 32 bytes", () => {
  const key = randomBytes(32);
  assert.deepEqual(transcriptKey(`${key.toString("base64")}\r\n`), key);
  assert.throws(() => transcriptKey(randomBytes(16).toString("base64")));
  assert.throws(() => transcriptKey(undefined));
});

it("writes opened transcripts only into a new directory", t => {
  const root = mkdtempSync(join(tmpdir(), "pipeline-transcripts-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const out = join(root, "opened");
  writeTranscripts({ "runs/a.jsonl": "x\n", "background.log": "y\n" }, out);
  assert.equal(readFileSync(join(out, "runs", "a.jsonl"), "utf8"), "x\n");
  assert.equal(readFileSync(join(out, "background.log"), "utf8"), "y\n");
  assert.throws(() => writeTranscripts({ "b.log": "z" }, out));
  assert.throws(() => writeTranscripts({ "../escape.log": "z" }, join(root, "other")));
  assert.equal(existsSync(join(root, "other")), false);
  assert.equal(existsSync(join(root, "escape.log")), false);
});

it("judges slugWords against the backlog request", () => {
  const reference = (text, maxWords) => {
    if (!Number.isInteger(maxWords) || maxWords < 1) throw new RangeError("maxWords must be a positive integer");
    return text.trim().split(/\s+/).slice(0, maxWords).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  };
  const emptyTextFirst = (text, maxWords) => (text.trim() === "" ? "" : reference(text, maxWords));
  assert.deepEqual(caseResults(reference), INDEPENDENT_CASES.map(() => true));
  assert.ok(caseResults(() => "one-two").includes(false));
  assert.ok(caseResults(emptyTextFirst).includes(false));
  assert.deepEqual(caseResults(() => { throw new TypeError("wrong"); }), INDEPENDENT_CASES.map(() => false));
  assert.match(BACKLOG_ITEM.source, /RangeError/);
  assert.match(BACKLOG_ITEM.source, /even when text is empty/);
});

it("ends the wait on completion and fails early on states an unattended run cannot leave", () => {
  const base = { next: { action: "dispatch" }, boardStatus: "implementing", runner: { running: true, state: "working" }, waitingMs: 0, now: 0, deadline: 1, timeoutStep: "item-done" };
  assert.deepEqual(waitVerdict(base), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...base, next: { action: "done" }, now: 1 }), { verdict: "done" });
  assert.deepEqual(waitVerdict({ ...base, boardStatus: "on_hold" }), { verdict: "fail", step: "item-held" });
  for (const [on, step] of [["gate", "item-gated"], ["acceptance", "acceptance-failed"], ["impl-verify", "impl-verify-failed"], ["qa", "qa-failed"], ["cap", "usage-cap"]]) {
    assert.deepEqual(waitVerdict({ ...base, next: { action: "wait", on } }), { verdict: "fail", step });
  }
  assert.deepEqual(waitVerdict({ ...base, next: { action: "wait", on: "unknown" } }), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...base, runner: { running: false, state: "stopped" } }), { verdict: "fail", step: "runner-ended" });
  assert.deepEqual(waitVerdict({ ...base, runner: { running: true, state: "waiting" }, waitingMs: RUNNER_WAIT_LIMIT_MS }), { verdict: "fail", step: "runner-waiting" });
  assert.deepEqual(waitVerdict({ ...base, runner: { running: true, state: "waiting" }, waitingMs: RUNNER_WAIT_LIMIT_MS - 1 }), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...base, next: null, now: 1, timeoutStep: "item-assigned" }), { verdict: "fail", step: "item-assigned" });
});

it("gives the main loop time to commit a handed-off file and fails a handoff that outlasts the limit", () => {
  const handoff = { next: { action: "wait", on: "handoff" }, boardStatus: "implementing", runner: { running: true, state: "working" }, waitingMs: 0, now: 0, deadline: 1, timeoutStep: "item-done" };
  assert.deepEqual(waitVerdict(handoff), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...handoff, handoffMs: HANDOFF_LIMIT_MS - 1 }), { verdict: "wait" });
  assert.deepEqual(waitVerdict({ ...handoff, handoffMs: HANDOFF_LIMIT_MS }), { verdict: "fail", step: "item-handoff" });
  assert.deepEqual(waitVerdict({ ...handoff, runner: { running: false, state: "stopped" } }), { verdict: "fail", step: "runner-ended" });
});

it("lists pipeline-smoke trigger paths that exist in this repository", () => {
  const repository = new URL("../../", import.meta.url);
  const paths = smokeTriggerPaths(readFileSync(new URL("AGENTS.md", repository), "utf8"));
  for (const expected of ["packages/core/pipeline", "plugin/skills/watch", "scripts/rehearsals/pipeline-smoke-steps.mjs", ".github/actions/smoke-database"]) assert.ok(paths.includes(expected), expected);
  for (const entry of paths) assert.ok(existsSync(new URL(entry, repository)), `${entry} does not exist`);
  assert.deepEqual(smokeTriggerPaths("no command here"), []);
});
```

첫 시험의 숫자는 계산 없이 정해진다(no-computation).

- 결과 줄이 하나라서 그 줄의 값이 곧 합이다.
- 실패한 호출 id는 t1, t2, t4, t9로 네 개다.
- 서브에이전트 호출 id는 t3, t4로 두 개다.
- harness 호출 실패는 하나다.

나머지 시험은 다음 근거로 정했다.

- 합산은 `runFindings`가 세션이 다른 `result` 줄을 더한다는 계약에서 나온 불변식으로 확인한다. `costUsd` 반올림은 정확한
  값 대신 0.01 범위로 본다.
- 같은 세션의 `result` 줄 여럿은 Phase 3 첫 실행에서 실측한 형태로 만든다. 누적 비용, 반복되는 거부, 줄마다 다른 턴 수다.
  기대값은 그 형태에서 손으로 셀 수 있는 값이다(비용 1.5 + 0.25, 거부 `s1`의 d1·d2와 `s2`의 d1, 턴 6 + 4 + 3 + 2).
- 독립 판정 사례가 맞는지는 Source 문구대로 짠 참조 구현이 모든 사례를 통과하는지로 확인한다.
- 대기 판정은 서버가 돌려주는 `on` 값(`run-rules.ts:9-14`)마다 실패 이름 하나를 확인한다. 모르는 값은 기다린다.
- 봉인의 악성 묶음 시험은 같은 형식으로 직접 만든 묶음(`sealRaw`)을 쓴다. 정상 묶음이 열리는지 먼저 확인하므로, 이
  시험이 헛통과하지 않는다.
- 위 코드는 PR 2가 끝났을 때의 모습이다. 마지막 시험(AGENTS.md 경로)은 Phase 3에서 AGENTS.md 변경과 함께 더한다.

`scripts/rehearsals/rehearse-pipeline-smoke.test.ts`:

```ts
import assert from "node:assert/strict";
import path from "node:path";
import { it } from "node:test";
import { main, parseArguments } from "./rehearse-pipeline-smoke";

const TEMPLATES = path.resolve("templates-checkout");
const TRANSCRIPTS = path.resolve("pipeline-transcripts.bin");
const COMMIT = "a".repeat(40);
const KEY = Buffer.alloc(32, 7).toString("base64");
const DATABASE = "postgresql://postgres@127.0.0.1:5432/stagekeeper_test_pipeline";
const VALID = ["--templates", TEMPLATES, "--plugin-branch", "dev", "--plugin-commit", COMMIT, "--transcripts", TRANSCRIPTS];

it("accepts a dev run with the default wait", () => {
  const options = parseArguments(VALID);
  assert.equal(options.pluginBranch, "dev");
  assert.equal(options.waitMinutes, 75);
  assert.equal(options.allowMachineChanges, false);
  assert.equal(parseArguments([...VALID, "--wait-minutes", "10"]).waitMinutes, 10);
});

it("rejects unknown, duplicate, missing, relative and out-of-range arguments before any work", () => {
  const invalid = [
    [],
    [...VALID, "--unknown"],
    [...VALID, "--plugin-branch", "dev"],
    VALID.filter(value => value !== "--plugin-branch" && value !== "dev"),
    VALID.map(value => value === TEMPLATES ? "templates-checkout" : value),
    VALID.map(value => value === TRANSCRIPTS ? "pipeline-transcripts.bin" : value),
    VALID.map(value => value === COMMIT ? "abc" : value),
    [...VALID, "--wait-minutes", "4"],
    [...VALID, "--wait-minutes", "91"],
    [...VALID, "--wait-minutes", "1.5"],
  ];
  for (const args of invalid) assert.throws(() => parseArguments(args));
});

it("prints usage with --help and exits 2 on an unknown argument", async () => {
  assert.equal(await main(["--help"], {}), 0);
  assert.equal(await main(["--unknown"], {}), 2);
});

it("refuses to change the machine outside CI unless asked to", async () => {
  assert.equal(await main(VALID, { TRANSCRIPT_KEY: KEY, TEST_DATABASE_URL: DATABASE }), 2);
});

it("refuses a database that is not a stagekeeper_test_* database before any work", async () => {
  assert.equal(await main(VALID, { CI: "true", TRANSCRIPT_KEY: KEY, TEST_DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/stagekeeper" }), 2);
});

it("refuses a missing or short transcript key before any work", async () => {
  assert.equal(await main(VALID, { CI: "true", TEST_DATABASE_URL: DATABASE }), 2);
  assert.equal(await main(VALID, { CI: "true", TEST_DATABASE_URL: DATABASE, TRANSCRIPT_KEY: Buffer.alloc(16).toString("base64") }), 2);
});
```

- `main`의 검사 순서는 다음과 같다. 모두 DB 접속, 서버 시작, 플러그인 설치보다 앞선다.
  1. 인자
  2. `--help`
  3. CI 여부(`--allow-machine-changes`)
  4. `validateTestDatabase`(`scripts/test-server-integration.mjs:14`)
  5. `transcriptKey`
- 마지막 시험은 이름이 올바른 시험 DB를 주고도 키 검사에서 2를 받는지 본다.
- 타입/빌드 검증:
  - `npm run check`(lint, `docs:check`, `next typegen`, `tsc --noEmit`, `test:scripts`)
  - `npm test`, `npm run test:architecture`, `npm run verify:fsd`, `npm run verify:server`
- CI 실측:
  - Phase 1의 PR 1 `client-init-smoke`
  - Phase 3의 첫 실제 실행
  - Phase 4의 음성 증명
- 수동 확인: Phase 3과 Phase 4의 artifact를 `gh run download`로 받아 `open-pipeline-transcripts.mjs`로 연다. 실행
  스트림, 세션 전사, 메타 파일, `findings.json`이 들어 있어야 한다.

---

<!-- doc-validation-skip -->
## Open Questions

- **[작업 공간 신뢰] 2026-11-02 이 PC에서 답함: 로드한다.**
  - Claude Code 2.1.316의 `claude -p --permission-mode auto`를 신뢰된 적 없는 새 폴더에서 돌렸다. 신뢰 목록의 어떤
    항목도 그 폴더를 덮지 않았다.
  - 실행의 `system/init` 줄 `agents`에 그 폴더의 `.claude/agents/probe-echo.md`가 들어 있었다. 모델이 Agent 도구로
    `probe-echo`를 불러 정해 둔 답을 받았다. 정가 환산 $0.76이 들었다.
  - 그래서 첫 실행에는 `--trust-checkout`을 넣지 않는다. Phase 3에서는 `agentCalls`와 `roles-ran`으로 같은 결과인지만
    확인한다. 프로젝트 권한 설정이 무시된다는 보고는 그대로이며, 이 문제는 실행기가 `--settings`로 피한다.
- **[3장 권한] 2026-11-02 Phase 3 첫 실행에서 답함: `auto`.** 요약의 `permission`이 `auto`였고 거부는 0건이었다.
- **[4장 실행 기록 집계]** 서브에이전트 메시지가 `claude -p --output-format stream-json --verbose` 출력에 들어오는지
  2026-11-02 같은 실행에서 확인했다. 들어온다. 서브에이전트의 메시지와 도구 호출이 `parent_tool_use_id`가 붙은 줄로
  실행 스트림에 함께 나왔다.
  - 그래도 `runFindings`는 세션 전사를 함께 읽는다. 같은 호출은 `tool_use_id`로 한 번만 센다.
  - 이번 세션의 headless 결과(`--output-format json`)에는 `total_cost_usd`, `num_turns`, `permission_denials`,
    `modelUsage`가 있었고, `subagent_stats`도 따로 있었다.
  - **2026-11-02 Phase 3 첫 실행에서 답함.** 실행기 세션 하나가 `result` 줄 7개를 냈다. 비동기 서브에이전트가 끝날
    때마다 차례가 하나씩 생기기 때문이다.
    - 7개 모두 같은 누적 `total_cost_usd`($1.49)와 `modelUsage`를 실었다. `modelUsage`의 캐시 읽기 토큰은 메인 차례들의
      `usage` 합보다 약 160만 많았다. 그래서 누적 비용에는 서브에이전트가 이미 들어 있다.
    - `num_turns`는 줄마다 그 차례의 값이다.
    - 그래서 `runFindings`는 턴 수만 더한다. 비용은 세션마다 가장 큰 값을 한 번 센다. 거부는 세션과 `tool_use_id`로
      한 번만 센다. 첫 실행 요약은 비용을 7번 더해 $10.42로 적었고, PR 2에서 고쳤다.
- **[7장 Windows 알림] 2026-11-02 Phase 3 첫 실행에서 답함: 영향 없음.** `background.log`에는 시작, 실행, 정지 줄만
  있었고 알림 오류는 없었다.

<!-- doc-validation-restore -->

## Approval

2026-11-02 사용자 승인("오케이 진행"). 범위는 front matter `approval-scope`와 같다.

- Phase 3·4의 실제 모델 실행은 Phase 3 1~2회, Phase 4 1회다. 정가 환산 약 $16~40의 구독 사용량이 든다.
- `--trust-checkout`을 넣을지는 이 PC의 사전 확인과 Phase 3 결과로 정하고, 그 결과를 이 문서에 기록한다.
- PR 1·2의 머지와 운영 `migrate status` 실행은 사용자가 한다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| PR 1 `client-init-smoke` 4 job | Pass (PR #278, run 41411910911) | Phase 1(회귀). new-user 22/22, update 21/21. Windows 로그에 예약 포트 구간 출력 있음. `check`는 문서 링크 검사로 한 번 실패한 뒤 고쳐 녹색 |
| `node --test scripts/rehearsals/pipeline-smoke-steps.test.mjs` | Pass (9/9) | Phase 2. 리허설 시험과 init 리허설 시험을 합쳐 28/28 |
| 이 PC의 작업 공간 신뢰 사전 확인 | Pass | Phase 3 전. 신뢰된 적 없는 폴더에서도 `.claude/agents` 역할을 불렀다. 정가 환산 $0.76 |
| `gh workflow run pipeline-smoke.yml --ref harness/pipeline-smoke` | Pass (run 41429824882, `3fe2b16`) | Phase 3 첫 실행. 아래 "Phase 3 첫 실행 기록" |
| 음성 증명(게이트 유지, `templates-ref=main`) | Pass (run 41433975185, `7bd0c7c`) | Phase 4. 아래 "Phase 4 음성 증명 기록" |
| 봉인 artifact 로컬 열기 | Pass (Phase 3, Phase 4) | Phase 3은 파일 14개: 실행 스트림, 세션 전사와 서브에이전트 전사 6개, `background.*`, `commands.log`, `server.log`, `findings.json`. Phase 4는 실패 경로에서 파일 9개 |
| `npm run check` | Pass | Phase 5. `dev` `5dcab73`을 합친 작업 트리(Windows). 스크립트 시험 298개 중 295 pass, 3 skip(Windows 기호 링크 권한과 LPAC 환경), fail 0. AGENTS.md 경로 시험 포함 |
| `npm test`, `npm run test:architecture`, `npm run verify:fsd`, `npm run verify:server` | Pass | Phase 5. 같은 작업 트리. `npm test` 595개 중 592 pass·3 skip, `test:architecture` 207개 중 205 pass·2 skip, 두 경계 검사 통과 |
| PR 2 `client-init-smoke` 4 job | Pass (PR #279, run 41651333308, `b31b182`) | Phase 5(회귀). new-user 22/22, update 21/21(지난 판 `5dcab73`), 템플릿 `fb6ef95`. 같은 커밋의 `check` 6 job도 녹색(run 41651333313) |
| 머지 뒤 첫 승격 전 `gh workflow run pipeline-smoke.yml --ref dev` | Fail (run 41657437554, `6f7982c`) | `item-handoff`. 리허설의 대기 판정 결함이라 승격을 멈추고 고쳤다. 아래 "머지 뒤 첫 dev 실행 기록" |
| #284 머지 뒤 `gh workflow run pipeline-smoke.yml --ref dev` | Fail (run 41751043490, `e15485f`) | `item-held`. 리허설 항목 문구의 빈틈이라 승격을 멈추고 고쳤다. 아래 "수정 뒤 두 번째 dev 실행 기록" |

### Phase 3 첫 실행 기록

2026-11-02 run 41429824882(`3fe2b16`, 템플릿 `fb6ef95`, Claude Code 2.1.316)의 기록이다.

- 결과:
  - 단계 31개가 모두 pass였다. job은 12분, 리허설은 579초 걸렸다.
  - 실행기는 10:36:26에 시작했다. 10:45:24의 `pipeline_next`에는 남은 노드가 없었다. 항목 하나를 끝까지 처리하는 데
    약 9분이 걸렸다.
  - 요약의 `minutesToDone`은 4였다. 실행기 시작 단계가 300초 한도까지 기다린 만큼 늦게 세기 시작했기 때문이다
    (아래 결함 1).
- 모델은 `claude-sonnet-5-5`였다. CI에는 사용자 설정이 없어 기본 모델로 돌았다. 이 PC 소유자의 설정은 `opus[1m]`이다.
- 비용은 정가 환산 $1.49였다(세션 누적 `total_cost_usd`). 요약은 결함 2 때문에 $10.42로 적었다.
- 권한 `auto`, 거부 0, `agentCalls` 6, `agentErrors` 0, `stepRefusals` 0이었다.
- 역할은 다음 순서로 돌았다.
  1. work-assigner
  2. app-dev(계획)
  3. 메인 루프의 계획 검토, plan-verifier
  4. app-dev(구현)
  5. impl-verifier
  6. 메인 루프의 인수
  7. doc-auditor
- #275 확인: work-assigner가 `assignment_context`를 `receipt.runId`로 한 번 불렀고 거부되지 않았다.
- `harnessErrors`의 `agent_next` 2건은 봉인 전사로 확인했다. 둘 다 `` agent `<role>` needs a key ``였다.
  - plan-verifier: 메인 루프가 지시문에 "omit key if the hint says so"라고 써서, 첫 호출에서 key를 뺐다.
  - impl-verifier: 두 번째 호출에서 key를 빠뜨렸다.
  - 둘 다 곧바로 key를 넣어 다시 불렀고 그대로 진행했다.
  - 이 검사(`src/server/agents/next.ts:97`)는 2026-09-03(`2a5114c`)부터 그대로다. 승격할 변경 가운데 이 파일을 고친
    것은 #275뿐이고, 고친 곳은 work-assigner 계약 문구다.
- 리허설 결함 두 개를 찾아 PR 2에서 고쳤다.
  1. Windows에서 `--start`가 띄운 실행기가 출력 파이프를 물려받았다.
     - 그래서 `spawnSync`가 300초 한도까지 기다렸다. 결과는 `status` 0에 `ETIMEDOUT`이었다. `Run.command`가 오류를 보지
       않아 이를 성공으로 셌다.
     - 이 PC에서 재현했다. 12초 사는 손자 프로세스를 두면, 파이프로 받을 때는 12.4초, 파일로 받을 때는 0.3초 만에 돌아왔다.
     - 고친 내용: 시작 출력은 파일로 받고, 시간 초과는 실패로 센다.
  2. 위 비용 과대 집계.
- 플러그인 쪽 관찰(이번 범위 밖): 실행기의 마지막 결과 줄은 마지막 차례의 턴 수만 적는다("done: 3 turns").
  세션 전체는 53턴이었다.

### Phase 4 음성 증명 기록

2026-11-02 run 41433975185의 기록이다. 임시 브랜치 `harness/pipeline-smoke-gate-proof`(`7bd0c7c`)는 `14bfaf3`에서
`pipeline-saved`의 `gates`만 `["before-plan"]`로 바꾼 커밋이다. 실행 뒤 원격 브랜치를 지웠다.

- `item-assigned`는 pass, `item-gated`는 fail이었다. 요약에 `failure: "item-gated"`, `runnerState: "stopped"`,
  `sealed: true`가 남았다.
- 로그의 템플릿 checkout에 `ref: main`이 찍혀, `templates-ref` 입력이 전달됐다. 템플릿 기본 브랜치가 `main`이라 커밋은
  Phase 3과 같은 `fb6ef95`였다.
- 리허설은 108초 걸렸다. 실행기 시작은 11:08:04였고, 게이트 대기는 61초 뒤인 11:09:05에 판정됐다. 시작 단계가
  더는 300초 한도까지 기다리지 않는다(결함 1 수정 확인).
- 비용은 정가 환산 $0.24, 모델은 `claude-sonnet-5-5`였다.
- `harnessErrors`의 `board_propose` 1건은 봉인 전사로 확인했다.
  - work-assigner가 저장된 선택 정책을 옮기면서 마지막 문장을 빠뜨렸다. 그래서 "The selection record must name the
    saved selection policy."로 거부됐다. 이 검사는 `packages/core/pipeline/work-selection.mjs:15`에 있다.
  - 정책 전문을 넣어 다시 보내 제안이 등록됐다.
  - 이 검사는 승격할 변경(#272~#276)이 건드리지 않았다.

### 머지 뒤 첫 dev 실행 기록

2026-11-03 run 41657437554(`6f7982c`, 템플릿 `fb6ef95`)의 기록이다. PR 2 머지 뒤 첫 승격 전 실행이고, 새 승격 규칙을
처음 적용했다.

- 결과는 `item-handoff` 실패였다.
  - 배정, 계획, 계획 검증, 구현은 끝났다.
  - impl-verifier는 결함 0으로 판정 ok를 냈다.
- 원인은 파이프라인이 아니라 리허설의 대기 판정이었다.
  - impl-verifier의 보고서는 늘 메인 루프가 핸드오프 절차로 커밋한다(`docs/architecture/impl-verifier.md`).
    impl-verifier는 14:56:02에 `outcome: "handoff"`를 보내고 멈췄다.
  - 커밋 정책이 yes라 메인 루프가 14:56:17에 그 보고서를 커밋했다.
  - 그 사이 15초 폴링이 `wait on handoff`를 보고 바로 실패로 판정해 실행기를 멈췄다.
  - 메인 루프는 실행기가 `stopping`인 것을 보고 impl-verifier를 다시 부르지 않았다. 이 응답은 맞다.
  - Phase 3 첫 실행에서는 impl-verifier가 핸드오프 없이 보고해서, 이 대기 창을 지나지 않았다.
- 고친 내용:
  - `handoff`를 바로 실패하는 대기에서 뺐다.
  - 핸드오프가 `HANDOFF_LIMIT_MS`(5분) 넘게 이어질 때만 `item-handoff`로 실패한다.
  - 새 시험은 고치기 전 코드에서 실패하는 것을 확인했다.
- 그 밖의 요약 값:
  - 모델 `claude-sonnet-5-5`, 정가 환산 $1.18, 권한 `auto`, 거부 0
  - `harnessErrors`는 `board_propose` 1, `agent_next` 3, `report_submit` 1이었다. 모두 모델이 바로 고쳐 다시 불렀다.
    - `board_propose`: 선택 정책 전문 누락. Phase 4와 같다.
    - `agent_next`: `needs a key`
    - `report_submit`: app-dev가 자기 verify 단계를 기록하기 전에 보고했다.

### 수정 뒤 두 번째 dev 실행 기록

2026-11-04 run 41751043490(`e15485f`, 템플릿 `fb6ef95`, Claude Code 2.1.318)의 기록이다. #284 머지 뒤 승격 전
실행이다.

- 결과는 `item-held` 실패였다. 리허설은 128초 걸렸다.
  - 배정은 끝났다. work-assigner가 ITEM-01을 app-dev에게 제안했고 서버가 받아들였다.
  - app-dev는 계획을 쓰기 전에 항목을 보류했다. 보류 사유는 다음과 같다.
    `Open: slugWords("", 0) - return "" (empty rule wins) or throw RangeError (validate first)? Answer in item Source, then resume.`
- 원인은 리허설의 항목 문구였다.
  - 문구는 빈 문자열이면 빈 문자열을 반환하고, `maxWords`가 양의 정수가 아니면 RangeError를 던진다고만 했다. 두
    규칙이 함께 걸리는 입력에서 어느 쪽이 먼저인지는 정하지 않았다.
  - 바깥 동작이 갈리는 빈틈이므로 계획 단계에서 보류한 것은 정해진 동작이다(2026-10-20 결정).
  - 시험의 참조 구현은 이미 `maxWords`를 먼저 검사했다. 그러나 독립 사례에는 이 순서를 가르는 입력이 없었다.
  - 앞선 두 실행(Phase 3, 머지 뒤 첫 dev 실행)에서는 app-dev가 이 빈틈으로 보류하지 않았다.
- 고친 내용:
  - 항목 문구에 `maxWords`를 먼저 검사해서, 빈 문자열에도 RangeError를 던진다고 적었다.
  - 같은 문구에 `text`는 늘 문자열이고, 단어가 `maxWords`보다 적으면 모두 쓰며, RangeError의 메시지는 정하지 않는다고도
    적었다.
  - 독립 사례에 `["", 0]`(RangeError)을 더했다.
  - 시험은 두 가지를 본다. 빈 문자열을 먼저 처리하는 구현이 독립 사례에서 실패하는지, 그리고 문구가 이 순서를
    적었는지다. 고치기 전 코드에서 실패하는 것을 확인했다.
- 그 밖의 요약 값:
  - 모델 `claude-sonnet-5-5`, 정가 환산 $0.38, 권한 `auto`, 거부 0, `agentCalls` 2
  - `harnessErrors`는 `pipeline_next` 1, `board_propose` 1이었다. 둘 다 모델이 바로 고쳐 다시 불렀다.
    - `pipeline_next`: 메인 루프가 도구 스키마를 불러오기 전에 첫 호출을 보내 `project`가 빠졌다.
    - `board_propose`: 선택 정책 전문 누락. Phase 4와 같다.
  - 같은 커밋의 `client-init-smoke`(run 41751048185)와 dev push CI 세 개(check, windows-role-runtime,
    macos-runtime-contracts)는 녹색이었다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD
