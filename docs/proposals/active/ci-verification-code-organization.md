---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-17"
approved-by: "user"
approved-at: "2026-11-18"
approval-scope: "CVO1 및 CVO2 구현과 검증. CVO3 실제 모델·설치 인수, 병합·운영 배포는 별도 승인."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/test-organization.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/shared-modules.md"
  - "docs/ADR/0004-organize-repository-scripts.md"
  - "docs/proposals/active/dual-client-ci-parity.md"
  - "docs/proposals/completed/2026-11-17-shared-modules-and-plugin-distribution.md"
  - "docs/proposals/active/role-command-time-limit.md"
---

# CI 검증 코드의 책임별 배치와 실행 계약 보존

## Summary

제품 코드와 그 테스트, OS별 빌드·패키징 도구의 현재 소유권을 유지한다.
scripts/rehearsals 안에서 설치·파이프라인·모델 평가와 실제 공유하는 준비 코드를
분리하고, 런타임 테스트와 GitHub 기록 코드를 실제 소유자 가까이 배치한다.
기존 CLI 경로·export·실행 조건·결과 형식·정리 동작을 보존하며 CI가 새 경로를
빠뜨리지 않도록 검사 선택과 테스트 탐색을 함께 갱신한다.

이 문서는 WHOLE_SDD이며 위험도는 STANDARD다. 전체 설계와 단계별 작업·검증을
한 문서에서 소유한다. 최초 요청은 문서 작성이었고 후속 요청으로 CVO1과 CVO2 구현·검증이
차례로 승인됐다. CVO3의 실제 모델·설치 인수, 병합·운영 배포는 별도 승인을 따른다.
문서의 완료와 아래 구현의 완료를 구분한다.

## Goal

- 설치 또는 파이프라인 검사를 바꿀 때 시나리오·판정·짝 테스트를 같은 책임에서 찾는다.
- 다른 리허설이 CLI 진입점의 내부 구현을 재사용하는 의존성을 없앤다.
- 로컬·PR·정기·승격 게이트가 같은 검증 구현을 호출하도록 유지한다.
- 파일 이동 때문에 검사가 검색·선택·배포 검증에서 빠지는 일을 방지한다.

CI를 설명한 세 묶음인 기본 코드 검사·실행 환경 검사·배포 전 검증은 실행 구성이다.
파일 소유권을 나누는 세 개의 배타적인 폴더가 아니다. 같은 설치 검사는 PR와
승격 게이트에서 재사용할 수 있다.

## Proposal Size

proposal-size는 standard다. 여러 실행 진입점, dynamic import, 자식 프로세스,
테스트 탐색, 공개·비공개 CI 소비자에 걸친 변경이다. 새 제품 기능·DB schema·권한
정책은 도입하지 않지만 잘못된 추출이 정리 누락이나 검증 누락을 만들 수 있다.
새 테스트 프레임워크, 범용 실행기, 별도 workspace package는 필요하지 않다.

## Current State

### 근거와 관찰 기준

- 관찰일: 2026-11-17.
- 소스 기준: dev / 7097582260e1a70324fb690795815cbc9fbaffff.
- 문서 브랜치: harness/ci-verification-code-organization-sdd.
- 관리 task: 07d8bcf2-c3ef-4e43-a336-e4a6696a9c4b.
- 문서 worktree: /private/tmp/stagekeeper-ci-verification-sdd-20261117.
- 시작 시 열린 PR: #361, watch Retry-After 시험의 대기 시간 수정. 이 작업의 파일
  목록에는 그 제품 동작·시험을 넣지 않는다. 구현 시작 때 다시 조회한다.
- 현행 계약은 [테스트 배치](../../architecture/test-organization.md),
  [테스트 작성](../../architecture/test-writing.md),
  [스크립트·CI 경계](../../architecture/verification.md#스크립트와-ci의-경계),
  [공유·출하 경계](../../architecture/shared-modules.md)가 소유한다.
- 주 checkout과 다른 active worktree의 변경은 이 문서 작업에 포함하지 않는다.

2026-11-18 CVO1 구현 준비에서 작업 브랜치를 최신 dev
bce2bef8b5ff61962eb6e3b16419bb4aaaffb217으로 fast-forward했다. 아래 표의 최초 관찰과
달리 현재 shared-distribution 직접 소비자가 추가됐고 CI는 workflow 8개·job 정의
14개·coverage 행 16개다. 기존 단계의 의미와 canonical 요구사항은 유지하며 최신
호출부·이전 판 seed·이벤트별 CI 선택은 [CVO1 상세 계획](./ci-verification-code-organization-phase-cvo1.md)을 따른다.

| 분류 | 직접 확인한 근거 | 판단과 변경 영향 |
| --- | --- | --- |
| Contracted | 단위·독립 테스트는 소유 코드 옆, scripts는 책임별 배치 | 이미 채택된 원칙을 적용하며 모든 테스트를 루트 tests로 옮기지 않는다 |
| Observed | [rehearse-pipeline-smoke.ts](../../../scripts/rehearsals/rehearse-pipeline-smoke.ts)의 설치 리허설 import, [Codex 리허설](../../../scripts/rehearsals/rehearse-codex-macos.mjs)의 동적 import | Run·DB fixture·template 준비·Claude 연결을 진입점에서 가져온다. 공통 준비와 설치 시나리오의 소비를 분리한다 |
| Observed | [script-database.test.ts](../../../tests/server/integration/script-database.test.ts)가 createFixtureUser/deleteFixtureUser를 같은 진입점에서 import | DB fixture의 별도 소유자가 필요하며 실제 DB 시험도 새 소유자로 연결한다 |
| Observed | [smoke-server.mjs](../../../scripts/rehearsals/smoke-server.mjs)는 init·Claude pipeline·Codex 세 호출자가 공유 | 새 추상화를 만들지 않고 현행 구현·listener·짝 테스트를 함께 이동한다 |
| Observed | plugin/bin의 harness-role-commands/files/git.test.mjs는 runtime 모듈을 직접 import | runtime 옆으로 이동한다. CLI를 실행하는 session·background 시험은 bin에 둔다 |
| Observed | [gate-record.mjs](../../../scripts/rehearsals/gate-record.mjs)는 GitHub event/ref/run/issue 형식을 알고 Action 한 곳에서 호출 | 기록 구현과 시험을 Action 옆으로 이동한다. 평가·파이프라인 결과 판정은 시나리오 소유자에 남긴다 |
| Observed | package.json의 test:scripts/test:architecture는 scripts 아래만 탐색 | .github로 옮기는 시험은 명령에 명시적으로 포함해야 한다 |
| Observed | [pipeline-smoke-steps.test.mjs](../../../scripts/rehearsals/pipeline/pipeline-smoke-steps.test.mjs)는 AGENTS promotion pathspec과 workflow paths를 검사 | 새 모듈만 바꾼 변경도 필요한 게이트를 선택하도록 함께 갱신한다 |
| Observed | [plugin-payload.mjs](../../../scripts/lib/plugin-payload.mjs)는 plugin/evals와 .test.mjs를 출하에서 제외 | 테스트만 이동해도 새 fixture를 plugin 아래에 만들면 출하될 수 있으므로 실제 payload 집합·바이트를 확인한다 |
| Inferred | 재사용 구현과 진입점이 결합되고 관련 파일이 같은 flat 폴더에 혼재 | 실행 내용 변경 없이 책임별 추출·배치로 수정 범위를 줄일 수 있다 |
| Unresolved | 현재 private Codex CI 소비자 전체·runner 가용성을 이번 작성에서 재조회하지 않음 | 기존 경로와 named export를 보존하며 private 소비자 변경·호환 계층 제거는 범위 밖이다 |

### 외부 저장소 참고

같은 대화의 2026-11-17 GitHub API·소스 조사 결과다. 스타 수는 관찰 시점 값이며
현재 프로젝트의 계약이나 검증 근거를 대신하지 않는다.

| 저장소 | 당시 stars | 확인한 구조와 채택할 원칙 |
| --- | ---: | --- |
| [microsoft/vscode](https://github.com/microsoft/vscode) | 195515 | [test 실행 환경](https://github.com/microsoft/vscode/blob/main/test/README.md)과 [모듈 내부 시험](https://github.com/microsoft/vscode/blob/main/src/vs/base/test/common/arrays.test.ts)을 구분한다 |
| [microsoft/playwright](https://github.com/microsoft/playwright) | 100367 | [installation](https://github.com/microsoft/playwright/blob/main/tests/installation/playwright.config.ts)과 [library](https://github.com/microsoft/playwright/blob/main/tests/library/playwright.config.ts)가 검증 책임별 설정을 소유한다 |
| [vitejs/vite](https://github.com/vitejs/vite) | 83942 | [단위 시험 설정](https://github.com/vitejs/vite/blob/main/vitest.config.ts)과 [playground 실행 모드](https://github.com/vitejs/vite/blob/main/vitest.config.e2e.ts)를 구분하고 같은 시나리오를 여러 모드에서 사용한다 |

원칙을 참고하며 디렉터리 이름이나 도구를 그대로 이식하지 않는다. 외부 저장소의
main 링크는 변경될 수 있으므로 이 표를 영구적인 구조 증명으로 사용하지 않는다.

### 기존 작업과의 경계

| 기존 작업 | 이 문서와의 관계 |
| --- | --- |
| [dual-client CI](./dual-client-ci-parity.md) | 행동·지원 조합·증거 schema·후보 합격 기준을 소유한다. 이 문서는 그 구현의 배치만 바꾸며 새 Windows Codex 지원이나 증거 수집기를 추가하지 않는다. 겹치는 코드가 변경되면 먼저 최신 동작을 기준으로 이동표를 재대조한다 |
| [공유 모듈 전환](../completed/2026-11-17-shared-modules-and-plugin-distribution.md) | 출하 모듈 소유권·payload를 유지한다. packages/shared 또는 plugin/lib로 시험 지원 코드를 올리지 않는다 |
| [역할 command 한도](./role-command-time-limit.md) | 현행 300000 ms 최대값과 60000 ms 기본값을 유지한다. 제안서의 과거 120초 관찰을 현재 코드에 다시 적용하지 않는다 |
| [템플릿 인수 후속](./template-release-acceptance-follow-ups.md) | 운영 template 활성화·복구·설치 조합 인수를 대행하지 않는다 |
| [worktree 생명주기](./task-worktree-lifecycle.md) | 관리 도구와 기존 작업 기록은 변경하지 않는다 |

## Scope

포함 범위는 아래 이동표, 기존 CLI/모듈 호환 진입점, 관련 시험과 실행 선택,
그 배치를 설명하는 현행 문서의 후속 갱신이다. 시나리오별 짝 테스트를 함께 옮긴다.

제외 범위는 앱 기능·UI·DB schema·인증 정책·모델/timeout/retry 변경, shipped plugin 구현,
새 OS/client 조합, private 저장소 수정, 개인 로그인·설치 변경, 운영 데이터 쓰기,
모델 평가 사례 변경, CI job/leg 신설·통합, 검사 성능 최적화다.
scripts/windows·scripts/macos·scripts/checks·scripts/templates와 나머지 제품 리허설은
현재 책임을 유지한다. 비용·시간 개선을 이 구조 변경의 성과로 주장하지 않는다.

## Behavioral Requirements

### REQ-CVO-001: 기존 호출 계약

WHEN 호출자가 기존 CLI 경로 또는 기존 exported symbol을 사용하면, 검증 도구는
같은 입력에서 기존 인자 수락·거부, 반환값, 종료 코드, JSON 결과 및 필수 출력
계약을 보존해야 한다. import만으로 CLI가 실행되어서는 안 된다.

### REQ-CVO-002: fixture와 정리의 소유권

WHEN 리허설이 성공·실패·취소·시간 초과·정리 실패를 겪으면, 리허설은 기존
DB 대상 검증과 자원 정리 순서를 유지하고 자신이 만든 자원만 처리해야 한다.
서버/runner 종료가 확인되지 않은 경우 기존처럼 fixture를 보존하고 실패를 보고해야 한다.

### REQ-CVO-003: 테스트 탐색 보존

WHEN 기존 로컬 또는 CI 테스트 명령이 실행되면, 이동한 시험과 새 호환성 시험은
지정된 suite에서 검색·실행되어야 한다. 이동한 기존 시험이 0건으로 누락되거나,
동일 시험 구현이 구·신 경로에서 중복 발견되어서는 안 된다.

### REQ-CVO-004: 변경에 따른 게이트 선택

WHEN 이동한 검증 구현·지원 모듈·짝 테스트가 변경되면, CI와 승격 선택은 변경 전
동일 책임에 요구된 OS·gate 범위를 보존해야 한다. 공통 모듈 변경은 모든 실제
소비 게이트를 선택해야 하며, 기존 wrapper만 path filter에 남겨서는 안 된다.

### REQ-CVO-005: 결과 기록과 비공개 경계

WHEN gate 결과가 기록되면, 기존 허용 필드·summary leg·finding 판정·이슈 문구의
의미와 재실행 계약을 보존해야 한다. 비공개 template·token·모델 원문을 공개
로그·이슈·새 artifact에 추가해서는 안 된다.

### REQ-CVO-006: 출하 산출물 보존

WHEN 기존 플러그인 패키징이 같은 source 입력으로 실행되면, 이동한 테스트·검증
도구·호환 진입점은 출하 payload에 포함되지 않아야 하며 출하 대상 경로와 파일
내용은 구조 변경 전과 같아야 한다.

### REQ-CVO-007: 실제 실행 검증의 동등성

WHEN 재배치한 검증을 기존 지원 환경에서 실행하면, Windows·macOS ARM/Intel의
기존 native 검사와 기존 client-init·eval·pipeline 시나리오는 동일 합격 조건을
적용해야 한다. skip·미실행·과거 다른 SHA의 성공을 이번 후보의 통과로 세어서는 안 된다.

### REQ-CVO-008: 사전 거부와 import의 부수효과

IF 인자·DB 대상·model 실행 선택이 유효하지 않거나 모듈을 import만 했다면,
THEN 도구는 기존 사전 거부 경계를 유지하고 설치·DB 쓰기·서버/모델 시작을 추가로
수행해서는 안 된다. 모듈 이동으로 repository root나 상대 자산 경로가 달라져서는 안 된다.

## Invariants and Constraints

### INV-CVO-001: 실행 자원 격리

자원 식별과 소유권은 기존 session·server·fixture 구현이 결정한다.
다른 실행의 listener·프로세스·파일·DB 사용자를 정리하지 않는다.

### INV-CVO-002: 원장·결과의 의미

공개 schema 1 기록과 client-ci-contract의 schema 2 증거를 서로 바꾸지 않는다.
exit code 0만으로 불완전 eval이나 정리 실패를 성공으로 덮지 않는다.

### INV-CVO-003: production 의존성

제품 코드가 검증 코드·fixture·.github를 import하지 않는다. plugin/lib는 생성물이며
검증 편의를 위해 제품 public API를 넓히지 않는다.

### CON-CVO-001: 단일 구현과 방향

각 책임의 동작 구현은 한 곳에 둔다. 호환 파일은 명시적 named re-export와
기존 직접 실행 guard만 가진다. 새 내부 소비자는 호환 파일을 import하지 않는다.
기존 경로의 호환 계약을 직접 검사하는 시험은 그 경로를 import할 수 있다.
기본 방향은 CLI/Action → 시나리오 → 해당 시나리오의 지원 코드 → 기존 제품 API다.
pipeline이 client-init의 명시적인 연결 API를 사용하는 것은 허용하되 CLI를 호출해
내부 함수를 가져오는 방식과 역방향 의존은 허용하지 않는다.

### CON-CVO-002: 기존 실행 환경

Node 22, node:test, tsx, npm, 기존 Prisma·Next 빌드·native runtime을 사용한다.
새 의존성이나 범용 registry/runner를 만들지 않는다. Node glob 및 직접 명령의
현재 범위·직렬 실행·required runtime/reader 설정을 보존한다.
gate-record job은 현재 npm ci 없이 Node만으로 실행된다. 새 record 모듈과 결과
필터의 전이 import도 기존처럼 Node 내장 모듈·순수 MJS로 실행 가능해야 하며,
이 이동 때문에 tsx·Prisma 초기화나 의존성 설치를 요구해서는 안 된다.

### CON-CVO-003: 제품·시나리오 동작 변경 금지

plugin/runtime의 생산 파일·권한·timeout·launcher, src 제품 코드, DB migration,
plugin/evals 사례·fixture는 변경하지 않는다. 추출 중 발견한 기존 결함은 별도로
기록하며 이 리팩터링에 조용히 섞지 않는다.

### CON-CVO-004: 외부 소비자 호환

기존 공개 경로와 named export를 이 작업 안에서 삭제하지 않는다.
private CI의 최신 소비 범위를 확인하지 못했으므로 wrapper 제거 시점은 정하지 않는다.
내부 이전이 끝나도 호환 보존 시험을 유지한다. private source SHA pin 변경은 별도 작업이다.

### CON-CVO-005: 경로와 배포

이동한 모듈의 import.meta.url 기반 상대 경로를 재계산한다.
repository root는 프로세스 cwd로 대체하지 않는다. listener, Next CLI, fixture,
평가 사례, 자식 프로세스에 넘기는 module URL을 실제로 해석해 확인한다.
plugin 아래에는 새 비시험 helper·fixture를 만들지 않는다.

### CON-CVO-006: 실행 승인과 문서 소유권

최초 문서 작성의 write set은 이 파일 하나였다. 후속 구현 요청으로 CVO1과 그 C1/C2
정합에 필요한 코드·시험·문서·CI 연결 변경이 승인됐다. 유료 모델·개인 설치·수동 CI
dispatch·병합·main 승격은 포함하지 않는다. 관련 architecture와 AGENTS의 수정은
아래 구현 단계의 명시된 범위에 한정한다.

## Proposal

### 목표 배치

아래 신규 경로는 모두 제안이다. 기존 경로를 존재하지 않는 새 파일의 링크로 바꾸지 않는다.

~~~text
plugin/
  bin/                         CLI와 CLI 계약 시험
  runtime/                     runtime 구현과 그 시험
  evals/                       기존 Claude 평가 사례

scripts/
  checks/                      기존 검사기
  windows/                     기존 native 빌드·패키징·리허설
  macos/                       기존 native 빌드·패키징·probe
  templates/                   기존 template 운영 도구
  rehearsals/
    rehearse-client-init-smoke.ts
    rehearse-pipeline-smoke.ts
    rehearse-codex-macos.mjs     기존 실행·phase dispatch와 lifecycle 조립
    client-init/
    pipeline/
    agent-eval/
    support/

.github/actions/gate-record/
  action.yml
  record.mjs
  record.test.mjs
~~~

루트의 세 리허설은 실행·lifecycle 조립을 계속 소유한다. 이번 범위에서 거대한
새 공통 실행기로 다시 쓰거나 모든 main 함수를 억지로 이동하지 않는다.
재사용되는 준비 코드와 책임별 시나리오·판정부터 분리한다.
기존 root의 이 명세에 없는 리허설은 이동하지 않는다.

### 공통 준비 코드의 추출 계약

| 제안 목적지 | 기존 소유와 추출할 내용 | 실제 소비자·입출력 |
| --- | --- | --- |
| scripts/rehearsals/support/command-run.ts | init 진입점의 Run, Command/Step 타입, markerLine | init·pipeline·Codex. log/AbortSignal과 명령 입력, steps/outputs/failure·Command 결과를 유지 |
| scripts/rehearsals/support/smoke-database.ts | createFixtureUser, deleteFixtureUser | 세 리허설과 script-database 통합 시험. 명시적 databaseUrl, user/token 입력, userId 반환·자기 사용자 정리 |
| scripts/rehearsals/support/template-fixture.ts | seedTemplates, bootstrapSmokeTemplates | 세 리허설. 기존 seed CLI·template public API와 audit/snapshot 작성 순서를 유지 |
| scripts/rehearsals/support/repository-fixture.ts | createRepository, osLabel와 그 Git 실행 helper | Claude init·pipeline. work/scenario → fixture repository, 기존 이름·origin·초기 commit 유지 |
| scripts/rehearsals/support/repository-root.mjs | 여러 파일의 repository root 계산 | import.meta.url로 같은 실제 checkout root를 계산해 필요한 도구가 직접 import. 전역 env/cwd 변경 없음 |
| scripts/rehearsals/client-init/options.ts | Options, USAGE, parseArguments | 기존 init 진입점이 재수출. 연결 구현이 CLI 파일의 타입을 역참조하지 않게 한다 |
| scripts/rehearsals/client-init/claude-connection.ts | Smoke, Plugin 타입, installPlugin, newUser와 연결·update helper | init과 pipeline이 직접 소비. Claude source 설치·MCP·plan 전환 책임이며 Codex 범용 adapter로 만들지 않는다 |

각 새 모듈은 기존 시그니처와 동작을 우선 보존한다. 기존 private helper의 외부
노출은 scripts 내부 소비에 필요한 범위만 허용하며 제품 public API가 아니다.
Run.command의 timeout/error 판정, deleteFixtureUser의 현행 catch/로그 의미 등
불편한 기존 동작도 이 변경에서는 임의로 강화하거나 약화하지 않는다.

DB와 template의 dynamic import는 실제 작업을 실행할 때 수행하는 현재 시점을
보존한다. help·인자 거부·순수 import에 DB 연결이 생기지 않게 한다.
repository fixture와 Claude 연결은 의미가 다르므로 하나의 만능 environment
클래스로 합치지 않는다. root 계산 외에는 새 전역 singleton 상태를 만들지 않는다.

### 이동과 호환 진입점

| 기존 파일 또는 묶음 | 제안 목적지·처리 |
| --- | --- |
| client-init-smoke-steps.mjs와 짝 시험 | client-init/client-init-smoke-steps.mjs와 짝 시험. 구 모듈 경로는 명시적 named re-export |
| pipeline-smoke-steps.mjs와 짝 시험 | pipeline/pipeline-smoke-steps.mjs와 짝 시험. 구 경로는 named re-export |
| codex-init-eval.mjs와 짝 시험 | agent-eval/codex-init-eval.mjs와 짝 시험. 구 경로는 named re-export |
| agent-eval-summary.mjs와 짝 시험 | agent-eval/agent-eval-summary.mjs와 짝 시험. 구 CLI와 export는 위임하며 기존 직접 실행 결과 보존 |
| smoke-server.mjs, smoke-server-listener.cjs, smoke-server.test.mjs | support/ 아래에 함께 배치. 구 smoke-server 모듈은 named re-export. 구 listener preload도 기존 설정 활성화 조건을 유지하는 호환 loader로 보존 |
| gate-environment.mjs와 짝 시험 | support/gate-environment.mjs와 짝 시험. 구 모듈은 named re-export |
| scripts/rehearsals/gate-record.mjs와 짝 시험 | .github/actions/gate-record/record.mjs와 record.test.mjs. Action은 새 경로를 직접 호출. 구 CLI는 CI 전용 호환 adapter로 유지 |
| plugin/bin/harness-role-commands.test.mjs | plugin/runtime/role-command-execution.test.mjs. 기존 role-commands.test.mjs와 이름 충돌을 피하고 서로 다른 시험 계약을 유지 |
| plugin/bin/harness-role-files.test.mjs | plugin/runtime/role-files.test.mjs |
| plugin/bin/harness-role-git.test.mjs | plugin/runtime/role-git.test.mjs |
| client-ci-contract.mjs와 짝 시험 | 외부 소비자가 있는 현재 위치를 유지. 순수 증거 계약을 이번에 다시 구현하거나 이중 정의하지 않음 |
| open-pipeline-transcripts.mjs | 기존 CLI 위치 유지, 새 pipeline 모듈을 직접 import |
| rehearse-*.test.* | CLI guard·종료 코드·lifecycle 조립 시험은 기존 진입점 옆에 유지. 추출된 구현의 시험만 해당 소유자로 이동 |

위 표의 basename은 달리 적지 않은 경우 scripts/rehearsals 기준이다.
테스트 파일의 옛 위치에 재수출 파일을 남기지 않는다. 재수출된 테스트가 이중
등록될 수 있기 때문이다. 이동 대응표로 검색 집합을 대조한다.

구 gate-record 경로는 이름만 리허설 영역에 남는 **CI 호환 adapter**다.
공통 리허설이 이를 import하는 것은 금지한다. 이 분류와 제거 조건은 후속
verification.md에 기록한다. 이 adapter 때문에 일반 도구 → CI 의존을 허용하는
포괄적인 예외를 만들지 않는다.

### 호환성과 의존성

- 기존 init 진입점의 USAGE, Options, Plugin, parseArguments, Run, Smoke, osLabel,
  installPlugin, createRepository, newUser, seedTemplates, bootstrapSmokeTemplates,
  createFixtureUser, deleteFixtureUser, main을 유지한다.
- pipeline·Codex·summary·gate-record와 이동한 모듈의 기존 export는 구현 직전
  baseline에서 정확히 기록하고 명시적으로 유지한다. wildcard barrel을 새로 만들지 않는다.
- main guard는 import된 구현과 호환 진입점에서 중복 실행되지 않는다.
- root main에 남은 runSmoke/runPipelineSmoke/Codex finally는 기존 성공·취소·실패
  순서를 소유한다. 공통 지원 모듈이 다른 실행의 전체 정리를 대신하지 않는다.
- 새 내부 import는 책임별 구현을 직접 가리킨다. old → new 위임은 호환 파일에만
  허용하고 new → old 의존은 제거한다.
- pipeline의 자식 프로세스에 넘기는 steps module URL, smoke server의 listener 및
  node_modules/next 경로, 시험의 fixture 상대 경로를 함께 갱신한다.
- Claude 셸 eval wrapper의 동작·평가 사례는 이번에 변경하지 않는다. YAML 안의
  셸 코드를 별도 파일로 추출하는 후속은 현재 이동 범위에 추가하지 않는다.

### CI·테스트 연결

1. package.json의 test:scripts와 test:architecture에
   .github/actions/gate-record/record.test.mjs를 명시적으로 포함한다.
   하위 scripts 시험은 기존 재귀 glob이 발견한다. npm test의 runtime 재귀 glob은
   세 이동 시험을 발견하며 Windows workflow의 직접 파일 목록도 새 경로로 바꾼다.
2. client-init-smoke·windows-role-runtime·macos-runtime-contracts의 paths를 실제
   소비 관계로 갱신한다. 기존 관련 경로를 제거해 범위를 좁히지 않는다.
3. AGENTS.md의 promotion pathspec과 pipeline-smoke-steps.test.mjs의 연결 검사를
   함께 갱신한다. 예를 들어 support/smoke-database.ts만 바뀌어도 모든 실제 소비
   smoke 게이트의 재검증 조건에 포함되어야 한다.
4. 기존 job 이름·OS/architecture·matrix leg·schedule·동시성·권한·secret 경계·skip
   정책을 유지한다. gate-record action의 summary 출력 이름과 legs는 바꾸지 않는다.
5. verification.md의 실행 명령·확인 문자열·스크립트 소유권과
   test-organization.md의 CI adapter 시험 위치를 같은 변경에서 반영한다.
   server.md의 내부 참조 시험 목록은 실제 이동으로 해당 목록의 경로가 바뀐 경우만
   갱신한다. public API만 소비하는 새 파일을 불필요하게 예외 등록하지 않는다.
6. verify:ci-coverage 통과만으로 모든 파일 변경의 trigger 보존을 주장하지 않는다.
   각 새 경로를 단독 변경 경로로 넣은 선택 확인과 테스트 탐색 확인을 별도로 한다.
7. CVO1에서 먼저 생기는 support·client-init 경로의 필터·promotion 선택도 CVO1에서
   갱신한다. CVO2까지 미루지 않는다. CVO2는 추가 이동 경로와 전체 대응을 완성한다.

### 대안 비교

| 대안 | 판단 |
| --- | --- |
| CI 세 묶음마다 전체 검증 코드를 이동 | 실행 시점과 검증 책임이 중첩되어 공유 코드·같은 시나리오를 복제하거나 소유권을 흐릴 수 있어 선택하지 않음 |
| 전부 tests/acceptance로 옮기고 새 runner 도입 | 기존 scripts 도구 계약·로컬 CLI·private 소비자를 넓게 바꾸는 비용에 비해 이번 목표의 추가 이득이 확인되지 않음 |
| 공통 준비만 추출하고 나머지 flat 배치 유지 | 가장 작은 중간 상태이며 Phase CVO1로 채택. 시나리오와 Action 소유권 문제는 남으므로 최종 완료로 세지 않음 |
| 현재 상위 구조 유지 + 책임별 내부 분리 | 선택. 기존 실행 계약과 제품 배포 경계를 보존하면서 확인된 의존성을 정리함 |

13개 우선 배치 후보(steps/eval의 구현·짝 시험 8개, runtime 시험 3개, gate-record
구현·시험 2개) 외에도 smoke-server·환경 모듈 이동, 새 지원 모듈, 호환 파일,
호출부·문서·CI 설정 변경이 필요하다. 13개를 전체 변경 파일 수로 보고하지 않는다.
실제 변경 목록은 단계 시작 때 이 표와 대조한다.

## Safety Analysis

| 상황 | 보존할 관찰 결과 | 주 소유자 |
| --- | --- | --- |
| import/help/인자 오류 | 기존 exit·진단, 설치·DB·모델·서버 작업 없음 | CLI guard와 인자 parser |
| 명시적 test DB가 아닌 대상 | 기존 사전 거부, fixture 생성 없음 | validateTestDatabase 소비 진입점 |
| 정상 종료 | 자기 서버·runner 종료 확인 후 자기 fixture 정리 | 각 root 리허설의 lifecycle |
| 중단·timeout·spawn 실패 | 기존 실패·취소 표시, 소유 자식 종료 확인 | Run와 smoke-server 및 native runtime |
| 서버 정리 실패·runner 생존 | 실패 결과와 fixture/진단 보존, 성공으로 덮지 않음 | 기존 finally |
| 신규 설치·update | 이전 판의 template cutover 순서와 ready/수정 파일 보존 | client-init 시나리오 |
| 모델 없는 init | 모델 호출 없이 끝나며 --run-models와의 잘못된 조합 거부 | Codex parser와 phase dispatch |
| gate record 재실행 | 원래 gate 출력을 해석하고 모델을 다시 실행하지 않음 | Action과 record 모듈 |

기존 시험에는 실제 자식 프로세스·DB 확인과 AST/VM을 이용한 caller 정리 시험이
함께 있다. 추출로 함수 위치가 바뀌면 구현을 소유한 새 위치를 대상으로 연결하되
기존 실패·정리 assertion을 삭제하지 않는다. 함수명·finally의 형태를 맞추려고
빈 함수를 남기거나 실행되지 않는 코드를 시험하지 않는다.

정적 자산 URL·라우트·웹 상태·영구 데이터 모델 변경은 없다. 새 DB 연결·새 모델
인증 경로도 없다. 코드가 아닌 시험 위치 변경만으로 plugin 판을 올리지 않으며,
payload 비교에서 출하 변경이 발견되면 완료를 중단하고 원인을 분리한다.

## Execution Plan

### Phase CVO1: 공통 준비와 설치 연결의 소유권 분리

- status: Implemented and locally verified. PR 통합을 기다린다.
- predecessor artifacts: 이 문서와 최신 architecture·겹치는 작업의 현재 head.
- satisfies: REQ-CVO-002, REQ-CVO-004, REQ-CVO-008
- preserves: INV-CVO-001, INV-CVO-002, INV-CVO-003
- governed-by: CON-CVO-001, CON-CVO-002, CON-CVO-003, CON-CVO-004, CON-CVO-005, CON-CVO-006
- verified-by: VFY-CVO-01, VFY-CVO-02, VFY-CVO-03, VFY-CVO-05
- outcome: 세 리허설과 DB 시험이 CLI의 준비 구현을 import하지 않는다.
- split rationale: 파일 이동 전에 의존성 변경과 부수효과 보존을 독립 검증한다.
- intermediate validity: 기존 CLI·module 경로와 전체 실행 조합이 계속 동작한다.
- completion ownership: REQ-CVO-002/008과 이 단계 신규 경로의 REQ-CVO-004를 확인한다.
  전체 이동 경로의 선택 완성은 CVO2가 소유한다.
- exit: 사전 거부·import·취소/정리·실제 test DB fixture 계약 확인.
- downstream: BLK-CVO-01은 CVO3 완료 증거에만 적용한다.

#### TASK-CVO1-01: 재사용 준비 모듈 추출

- satisfies: REQ-CVO-002, REQ-CVO-004, REQ-CVO-008
- preserves: INV-CVO-001, INV-CVO-003
- governed-by: CON-CVO-001, CON-CVO-003, CON-CVO-005
- verified-by: VFY-CVO-01, VFY-CVO-02, VFY-CVO-03, VFY-CVO-05
- destination: 공통 준비 추출 표의 support 모듈과 client-init/options.ts.
- delta: 기존 함수·타입을 이동하고 내부 소비자를 직접 연결한다. 동적 DB import,
  cwd·env 입력, logging·timeout·정리 정책은 유지한다.
- dependents: 세 리허설, 해당 짝 시험, tests/server/integration/script-database.test.ts.
- CI 연결: 이 단계에서 생성한 support·options 경로를 기존 workflow paths와 promotion
  pathspec에 추가하고 그 단독 변경의 게이트 선택을 검증한다.
- stop: 새 제품 API·동작 변경이나 전체 실행기의 재작성 없이는 추출할 수 없으면 재설계한다.

#### TASK-CVO1-02: Claude 연결 책임과 호환 export 분리

- satisfies: REQ-CVO-002, REQ-CVO-004, REQ-CVO-008
- preserves: INV-CVO-001, INV-CVO-002
- governed-by: CON-CVO-001, CON-CVO-004, CON-CVO-005
- verified-by: VFY-CVO-01, VFY-CVO-02, VFY-CVO-05
- destination: client-init/claude-connection.ts, 기존 init·pipeline 진입점.
- delta: Smoke·Plugin·installPlugin·newUser·update 관련 동작을 연결 소유자로 옮긴다.
  root의 기존 export는 명시적으로 보존하고 root main은 동일한 순서로 조립한다.
- CI 연결: 새 연결 모듈의 단독 변경도 init·pipeline 관련 기존 게이트를 선택한다.
- depends on: TASK-CVO1-01.
- exit: pipeline은 설치의 명시적 연결 API를 사용하고 CLI 파일 내부를 참조하지 않는다.

### Phase CVO2: 배치·CI 연결을 함께 전환

- status: Approved. CVO1 병합 후 승인된 상세 계획에 따라 실행한다.
- predecessor artifacts: CVO1의 소스·실행 근거, 이 문서의 이동표.
- satisfies: REQ-CVO-001, REQ-CVO-003, REQ-CVO-004, REQ-CVO-005, REQ-CVO-006
- preserves: INV-CVO-001, INV-CVO-002, INV-CVO-003
- governed-by: CON-CVO-001, CON-CVO-002, CON-CVO-003, CON-CVO-004, CON-CVO-005, CON-CVO-006
- verified-by: VFY-CVO-01, VFY-CVO-04, VFY-CVO-05, VFY-CVO-06, VFY-CVO-07
- outcome: 검증 구현·짝 시험이 소유자 위치에 있으며 old CLI와 CI 선택이 계속 동작한다.
- split rationale: 파일 이동·import·검색·trigger·문서는 한 전환 단위다. 이동만 먼저 병합하지 않는다.
- intermediate validity: 기존 외부 호출은 호환 계층을 사용하고 신규 내부 호출은 직접 구현을 사용한다.
- exit: 누락 없는 탐색·선택·기록 시험과 출하 payload 불변, 공통 quality gate 통과.
- completion ownership: REQ-CVO-001/003/004/005/006. 실제 native 인수 완료는 CVO3가 소유한다.

#### TASK-CVO2-01: 시나리오·지원 모듈과 시험 배치

- satisfies: REQ-CVO-001, REQ-CVO-003
- preserves: INV-CVO-001, INV-CVO-003
- governed-by: CON-CVO-001, CON-CVO-004, CON-CVO-005
- verified-by: VFY-CVO-01, VFY-CVO-04
- destination: 이동표의 client-init·pipeline·agent-eval·support 파일, 해당 기존 facade.
- delta: 동작을 복사하지 않고 구현을 이동한다. old module/CLI 호출을 보존하고
  repository-relative 경로·listener preload·자식 import URL을 새 구현 기준으로 맞춘다.
- depends on: TASK-CVO1-01, TASK-CVO1-02.
- exit: old/new import 결과가 같은 구현을 가리키며 fixture·runtime 경로가 실제 파일로 해석된다.

#### TASK-CVO2-02: 런타임 시험·기록 Action의 소유권 교정

- satisfies: REQ-CVO-003, REQ-CVO-005, REQ-CVO-006
- preserves: INV-CVO-002, INV-CVO-003
- governed-by: CON-CVO-002, CON-CVO-003, CON-CVO-004
- verified-by: VFY-CVO-04, VFY-CVO-06, VFY-CVO-07
- destination: runtime 시험 세 개, .github/actions/gate-record/record.mjs와 record.test.mjs,
  기존 gate-record 호환 adapter, action.yml, package.json.
- delta: runtime 생산 코드에는 손대지 않는다. record만 GitHub 소유 경계로 옮기고
  구 adapter는 existing CLI/export만 위임한다. 새 .github 시험을 두 기존 시험 명령에 연결한다.
- depends on: TASK-CVO2-01의 결과 판정 모듈 경로.
- exit: record 입력·출력·오류·배타적 출력 쓰기·summary 누락 처리 보존, 출하 변화 없음.

#### TASK-CVO2-03: 실행 선택·문서·회귀 증거 연결

- satisfies: REQ-CVO-001, REQ-CVO-003, REQ-CVO-004, REQ-CVO-005, REQ-CVO-006
- preserves: INV-CVO-001, INV-CVO-002, INV-CVO-003
- governed-by: CON-CVO-002, CON-CVO-004, CON-CVO-005, CON-CVO-006
- verified-by: VFY-CVO-01, VFY-CVO-04, VFY-CVO-05, VFY-CVO-06, VFY-CVO-07
- destination: package.json, 관련 workflow paths·명령, AGENTS promotion pathspec,
  pipeline-smoke-steps.test.mjs의 새 위치, architecture 문서의 해당 절.
- delta: 각 새 모듈·시험 단독 변경의 선택을 확인하고 기존 job/leg·권한·출력은 유지한다.
  internal import의 old facade 의존과 제품 → 검증 코드 의존은 제한된 architecture 시험으로 검사한다.
- depends on: TASK-CVO2-01, TASK-CVO2-02.
- exit: 탐색·trigger·문서·source 대응이 일치한다. 일반 check의 green을 native 인수로 확대하지 않는다.

### Phase CVO3: 동일 후보의 native·클라이언트 인수

- status: Proposed; BLK-CVO-01 해소와 별도 실행 범위 확인 후 수행한다.
- predecessor artifacts: CVO2 후보 source SHA, 기존 template/package 입력, public/private 소비 경로.
- satisfies: REQ-CVO-007
- preserves: INV-CVO-001, INV-CVO-002, INV-CVO-003
- governed-by: CON-CVO-002, CON-CVO-003, CON-CVO-004, CON-CVO-006
- verified-by: VFY-CVO-08, VFY-CVO-09, VFY-CVO-10
- outcome: 현재 지원되는 실제 실행 조합이 동일 후보에서 기존 계약을 지킨다는 근거를 확보한다.
- split rationale: 로컬 무모델 회귀와 실제 설치·모델·private runner 인수는 자원·승인 경계가 다르다.
- intermediate validity: CVO2 코드는 완결된 구조지만 이 단계 이전에는 전체 실제 인수를 완료했다고 쓰지 않는다.
- exit: 아래 VFY의 필수 조합·identity·정리 결과와 검토 필요 finding을 기록한다.
- detailed planning: 시작 시 최신 runner·소비자·후보 입력을 고정한다. private 변경이나 새 지원
  조합이 필요하면 기존 dual-client 제안으로 돌려보내며 이 문서의 범위를 넓히지 않는다.

## Blockers and Stop Conditions

### BLK-CVO-01: private 소비자·동일 후보 인수 환경 확인

- classification: downstream, Phase CVO3.
- evidence: 현재 source는 private CI가 legacy CLI/module 경로를 소비한다고 문서화하지만
  이번 작성에서 최신 private caller, 로그인 상태, runner 가용성은 직접 확인하지 않았다.
- affects: REQ-CVO-007, CON-CVO-004.
- impact: 단위 시험·wrapper 존재만으로 private native/model 인수가 통과했다고 주장할 수 없다.
- unblock requirement: CVO3 시작 시 실제 소비 경로와 candidate SHA/template/package tuple,
  사용할 runner와 허용된 실행 범위를 확인하고 결과를 이 문서 또는 후속 인수 기록에 연결한다.
- owner: 해당 private CI 실행 책임자. 이번 문서 작성자가 가용성을 가정하지 않는다.
- stop condition: 환경·실행 범위가 없거나 기존 shim으로 계약을 보존할 수 없으면 해당 실제 인수를
  멈추고 미실행으로 남긴다. CVO1/2의 문서화·안전한 코드 작업을 자동으로 막지는 않는다.

추가 중단 조건:

- 최신 코드·열린 PR가 이동 대상의 행동 계약을 바꿨는데 재대조하지 못한 경우.
- 출하 payload·model 선택·권한·DB 대상·정리 정책을 바꿔야만 작업이 가능한 경우.
- 이동 시험이 검색되지 않거나 필수 native 실행이 skip으로 바뀌는 경우.
- private source를 수정하거나 기존 export/CLI를 없애야 하는 경우.
- 처리 완료 전에 운영 배포·template activation이 필요한 경우. 이 리팩터링에는 그 의존이 없다.

## Verification Plan

아래 VFY는 원 설계의 검증 명세이며 Planned는 작성 시점의 상태다. CVO1에서 실제
실행한 범위와 결과는 상세 계획의 Implementation Results를 따른다. CVO2의 전체
배치 전환과 CVO3 실제 인수는 여전히 계획이다. 새 시험은 이 변경의 경로·탐색·선택
위험을 검증하며 기존 시험을 보존한다.

### VFY-CVO-01: CLI·모듈 호환과 사전 거부

- category: contract.
- verifies: REQ-CVO-001, REQ-CVO-002, REQ-CVO-008
- destination: 기존 rehearse-client-init-smoke.test.ts, rehearse-pipeline-smoke.test.ts,
  rehearse-codex-macos.test.mjs, rehearsal-cli.test.mjs와 제안
  scripts/rehearsals/rehearsal-compatibility.test.mjs.
- protocol: 기존 named export 목록·CLI args/help/거부 결과를 baseline에서 기록한다.
  old/new 모듈 import 및 안전한 거부 입력을 fresh child process에서 비교한다.
  cwd가 다른 임시 디렉터리인 경우도 확인한다.
- expected: import만으로 설치/DB/모델/서버가 실행되지 않음, 기존 exit·JSON·export 유지,
  중복 main 실행 없음, root/listener/자식 module URL이 실제 checkout을 가리킴.
- value: shim만 남기고 직접 실행 guard를 잃거나 모듈 이동으로 root가 바뀌면 실패한다.
  실제 로그인·모델 인수까지 증명하지 않는다.
- state: Planned.

### VFY-CVO-02: 취소·실패·정리 보존

- category: recovery.
- verifies: REQ-CVO-002, REQ-CVO-008
- destination: smoke-server.test.mjs의 새 위치와 기존 세 리허설의 caller lifecycle 시험.
- protocol: 정상·stop 실패·시나리오/stop 동시 실패·startup cleanup 실패·abort,
  무관한 listener 보존·소유 child만 종료하는 기존 assertion을 새 소유 코드에 연결한다.
- expected: stop 확인 전 DB fixture 삭제 없음, runner 생존 시 자원 보존, summary 실패 유지,
  원래 오류 보존, listener 정리. AST/VM 시험은 실제 실행되는 함수/블록을 읽어야 한다.
- state: Planned.

### VFY-CVO-03: 명시적 test DB fixture

- category: integration.
- verifies: REQ-CVO-002, REQ-CVO-008
- destination: tests/server/integration/script-database.test.ts.
- command: npm run db:generate 후 안전한 TEST_DATABASE_URL로 npm run test:server:integration.
- expected: parent DATABASE_URL을 사용하거나 변경하지 않음, 지정 test DB에 자기 user/token 생성,
  자기 fixture만 삭제. 잘못된 DB 입력은 side effect 전에 거부.
- state: Planned. 운영 DB로 실행하지 않는다.

### VFY-CVO-04: 테스트 탐색과 책임 경계

- category: architecture.
- verifies: REQ-CVO-003
- destination: package.json, 제안 scripts/checks/rehearsal-boundaries.test.mjs,
  각 이동 시험의 실제 runner 결과.
- protocol: baseline 시험 파일 집합과 old→new 이동표를 비교하고 실제 명령의 reporter
  결과에서 실행을 확인한다. .github record 시험과 runtime 세 파일이 각각 지정 suite에
  포함되는지 확인하며 단순 전체 건수만 비교하지 않는다.
- commands: npm run test:scripts, npm run test:architecture, npm test.
- expected: 기존 계약 시험 누락 0, 구현 복사로 인한 중복 등록 0. 새 지원 모듈이 old CLI를
  참조하지 않음, 제품이 .github/검증 코드를 참조하지 않음.
- state: Planned.

### VFY-CVO-05: 변경 경로와 OS 선택

- category: contract.
- verifies: REQ-CVO-004
- destination: pipeline/pipeline-smoke-steps.test.mjs, 기존 verify-ci-coverage.test.mjs,
  필요한 경우 scripts/checks/rehearsal-boundaries.test.mjs.
- protocol: 각 이동/신규 경로를 단독 변경으로 취급하여 실제 workflow paths와 promotion
  pathspec의 대응을 확인한다. common support·모든 새 하위 경로·호환 경로를 포함한다.
- commands: npm run verify:ci-coverage, npm run test:scripts.
- expected: 기존 13 job 정의·14 coverage 행의 의미, Windows/macOS·Intel 범위와 record legs 유지.
  경로 이름이 있다는 검사에 그치지 않고 해당 책임의 소비 게이트가 실제로 선택됨을 확인.
- state: Planned.

### VFY-CVO-06: record 입력·출력·privacy

- category: contract.
- verifies: REQ-CVO-005
- destination: .github/actions/gate-record/record.test.mjs와 agent-eval/pipeline의 결과 판정 시험.
- protocol: 기존 failure·missing-summary·nonzero 오류·partial eval·취소·재기록,
  배타적 출력·사전 거부와 허용 필드 검사를 그대로 수행한다. 네트워크 게시 자체는
  로컬 회귀에서 수행하지 않는다.
- expected: schema/field/leg·finding·error code 보존, raw template/model/token 추가 노출 없음.
  npm 의존성이 없는 격리 사본에서도 record CLI의 기존 fixture 입력이 처리됨을 확인한다.
- state: Planned.

### VFY-CVO-07: 정적·빌드·출하 경계

- category: build.
- verifies: REQ-CVO-006
- commands: npm run verify:fsd, npm run verify:server, npm run verify:shared,
  npm run check, npm run test:architecture, npm test, npm run test:web,
  npm run test:server, npm run build.
- destination: 기존 plugin-lib/shared graph·Windows/macOS 패키징 시험과
  scripts/lib/plugin-payload.mjs가 정의한 baseline/candidate 추적 파일 집합·바이트 비교.
- expected: 제품 public boundary·generated plugin/lib drift 없음, 출하 경로·내용 동일,
  새 helper/fixture가 payload로 유입되지 않음. 빌드는 migration 실행 증거가 아니다.
- state: Planned.

### VFY-CVO-08: OS별 runtime·offline build

- category: platform.
- verifies: REQ-CVO-007
- destination: 기존 windows-role-runtime, macos-runtime-contracts, check/task-worktrees.
- protocol: 후보 SHA에서 Windows x64·macOS ARM64/Intel의 현재 suite와 offline build 수행.
  runtime/출시 reader의 required 설정·serial test 옵션을 유지한다.
- expected: 파일/네트워크 거부·자식 종료·원본 보존·300초 최대 요청 계약 유지.
  OS 조건 skip을 그 OS의 성공으로 세지 않는다.
- state: Planned.

### VFY-CVO-09: 설치·init의 실제 연결

- category: end-to-end.
- verifies: REQ-CVO-007
- destination: 기존 client-init-smoke 네 조합과 private macOS Codex의 기존 init 신규/update.
- protocol: 승인된 후보 source/template/package 입력으로 기존 경로를 호출한다.
  실제 환경이 필요한 실행은 CVO3 범위 확인 후 수행하고, 동등 입력의 기존 성공을 재사용할 때
  source SHA·scenario·template/package identity가 맞는지 확인한다.
- expected: ready·MCP 연결·수정 파일 보존·이전 판 update 순서·fixture 정리 유지.
  제품 init 하위 실행의 모델 호출은 0이다. private runner의 별도 auth smoke가 모델을
  호출하면 그 사용량은 별도로 기록하며 workflow 전체를 모델 호출 0으로 보고하지 않는다.
- state: Planned; private 경로는 BLK-CVO-01의 영향을 받는다.

### VFY-CVO-10: 기존 실제 모델·파이프라인

- category: end-to-end / eval.
- verifies: REQ-CVO-007
- destination: 기존 agent-eval, pipeline-smoke의 Windows/macOS,
  private macOS Codex의 기존 eval/pipeline.
- protocol: 기존 gate의 완전한 사례·반복 수와 기존 지원 시나리오를 사용한다.
  source/template/package identity가 다른 과거 run을 현재 결과로 사용하지 않는다.
  동일 subscription 실행은 직렬로 하고 기존 실행 재사용·대기·기록 규칙을 따른다.
- expected: complete eval·terminal pipeline·정리 상태·오류/거부 finding의 의미 보존.
  녹색이어도 reviewRequired/finding을 무시하지 않는다.
- state: Planned; 모델 실행은 이번 문서 작성에서 수행하지 않는다.
  새 Windows Codex 인수나 운영 승격을 이 VFY에 추가하지 않는다.

## Affected Files and Allowed Changes

문서 작성 단계의 허용 파일은 이 문서 하나다. 구현 승인 후의 허용 범위는 다음이다.

- 추출·이동 표의 기존/신규 파일, 명시된 호환 adapter와 직접 호출부.
- 그 파일의 기존 짝 시험 및 위 VFY의 한정된 신규 compatibility/boundary 시험.
- .github/actions/gate-record/action.yml, check.yml의 필요 연결,
  client-init-smoke.yml·windows-role-runtime.yml·macos-runtime-contracts.yml의 경로/명령,
  agent-eval.yml·pipeline-smoke.yml의 직접 도구 경로가 변경될 때 그 연결.
- package.json의 시험 명령. dependency와 lockfile 변경은 없다.
- AGENTS.md의 promotion 경로, verification.md·test-organization.md의 해당 실행·배치 절,
  server.md의 실제 변경된 시험 경로만.
- dual-client 제안의 행동 요구사항은 수정하지 않는다. 그 문서의 경로 갱신이 필요하면
  소유 작업과 조정해 별도로 허용 범위를 정한다. 이 문서에 old→new 대응을 유지하므로
  기존 계획이 곧바로 무효가 되지는 않는다.

제품 src·packages의 생산 코드, plugin runtime 생산 코드·manifest·lib·eval 사례,
운영 DB·template corpus, 사용자 파일·다른 worktree는 금지 범위다.

## Approval

실행 승인 기록의 단일 기준은 front matter다. 후속 사용자 요청으로 CVO1 구현·검증과
그 선행 정합을 수행했다. 2026-11-18 사용자가 CVO2 상세 계획에 따른 구현과 검증을 승인했다.
단계별 결과를 확인하기 전 다음 단계를 자동 시작하지 않는다.

## Risks and Rollback

| 위험 | 방지·관찰 | 실패 시 처리 |
| --- | --- | --- |
| 깊어진 경로에서 root/listener/fixture 오해석 | 다른 cwd의 CLI/import와 실제 경로 확인 | 이동 단위와 호출부를 함께 되돌리고 기존 경로로 재검증 |
| helper 추출로 DB 초기화 시점·정리 순서 변경 | 사전 거부·caller failure matrix·실제 test DB 시험 | 기존 lifecycle로 복구, fixture를 강제로 삭제하지 않음 |
| .github/runtime 시험이 runner에서 누락 | 파일별 발견·실행 대응과 기존 suite 결과 | 탐색 명령을 수정하기 전 단계 완료로 보고하지 않음 |
| support만 바뀌었는데 smoke가 미선택 | 단독 변경 경로별 selection 검증 | workflow/AGENTS/시험을 같은 변경에서 복구 |
| private caller import 또는 export 깨짐 | legacy 경로·named export·CLI 유지, candidate 인수 | 호환 계층 보존; private caller 수정은 이 범위에서 강행하지 않음 |
| 시험용 파일이 plugin payload로 출하 | 추적 집합·바이트 및 양 OS 패키징 검증 | 해당 파일 배치를 되돌리고 판 상승으로 문제를 덮지 않음 |

롤백은 해당 Phase의 source·시험·명령·문서 변경을 한 단위로 되돌린다.
schema migration·운영 data rewrite는 없으므로 DB 복원 작업은 필요하지 않다.
이미 진행 중인 모델/runner가 있으면 먼저 그 실행의 소유 종료 절차를 따른다.
호환 파일만 지우거나 다른 작업의 변경을 reset하는 방식은 사용하지 않는다.

## Completion Conditions

- 전체 설계: 책임·호환 surface·이동표·현재/후속 검증·진행 중인 작업 경계를 명시했다.
- CVO1: 공통 준비가 CLI에서 분리되고 사전 거부·fixture lifecycle 계약을 검증했다.
- CVO2: 모든 대응 경로·시험 탐색·trigger·record·payload 불변을 검증했다.
- CVO3: 동일 후보의 기존 지원 환경 인수와 필요한 finding 검토가 끝났다.
- 구현 완료 보고에는 REQ–VFY별 실제 결과, source/template/package identity,
  skip·미실행·기존 실패·정리 상태, 호환 파일 유지 목록을 포함한다.
- 이 문서의 작성·검사 통과만으로 status를 completed로 바꾸지 않는다.

## Verification Results

문서 자체 검증 결과는 최종 저장 후 아래에 기록한다. 위 VFY는 모두 구현 후 계획이다.

| 검사 | 실행 상태 | 결과·범위 |
| --- | --- | --- |
| 현재 source·호출자·tests·workflow·architecture·active 제안 대조 | Executed | CLI 간 import, dynamic DB import, 경로 계산, caller finally 시험, payload 제외 규칙 확인 |
| 외부 참고 저장소 조사 | Executed, 같은 대화의 선행 조사 | GitHub API의 stars와 실제 파일/설정 비교. 이 문서 단계에서 remote 모델·CI를 실행하지 않음 |
| 문서 traceability validator | Executed / PASS | standard JSON 검사: REQ 8/8의 Phase/Task·VFY 연결, 오류 0·경고 0 |
| 문서 상대 링크·front matter | Executed / PASS | inspectDocs에 신규 문서 포함: Markdown 230개·상대 링크 1,212개·보고서 59개, 문제 0. parseFrontMatter로 pending/awaiting-approval·승인 null 확인 |
| 문서 공백 검사 | Executed / PASS | 최초 EOF 빈 줄 제거 후 git diff --no-index --check의 공백 진단 0. 신규 파일 차이에 의한 exit 1과 공백 오류를 구분 |
| 의미 검토 | Executed | 신규/기존 경로 구분, CLI/module named export·직접 실행 guard, private 소비자 보존, 실제 정리·DB assertion, 테스트 검색과 trigger의 별도 검증, 제품 payload 불변과 작업 범위 대조 |
| 제품/native/DB/model/CI dispatch | Not executed | 문서 작성 범위 밖 |
| 구현 후 VFY-CVO-01~10 | Planned | 현재 통과한 것으로 보고하지 않음 |

엄격 모드는 이 전체 문서에 적용하지 않는다. CVO3는 downstream blocker가 있는
전체 설계의 미래 인수 단계이고, 전체를 이미 실행 가능한 phase bundle로 주장하지
않기 때문이다. 표준 검증의 관계 오류를 해결한 뒤 각 Phase의 REQ–VFY 의미와
coverage를 별도로 검토한다.

## Completion or Closure Notes

CVO1은 PR #377, CVO2는 PR #380으로 dev에 병합됐다. [CVO2 구현 기록](./ci-verification-code-organization-phase-cvo2.md)을 보존한다.
CVO3의 별도 실행 범위는 [상세 계획](./ci-verification-code-organization-phase-cvo3.md), 동일 후보의 공개·private 인수 현황과 BLK-CVO-01은 [실행 보고서](../../test-reports/active/cvo3-client-acceptance-report.md)에서 확인한다.

후속 구현자는 시작 시 최신 dev·열린 PR·active 제안·working tree를 다시 확인하고,
선택한 Phase의 허용 범위·VFY·중단 조건만 수행한다. 이 문서와 현재 architecture가
충돌하면 현재 계약을 우회하지 말고 변경할 계약과 해당 범위를 먼저 명시한다.
