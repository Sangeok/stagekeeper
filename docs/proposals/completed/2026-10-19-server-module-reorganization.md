---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-13"
approved-by: "requesting-user"
approved-at: "2026-10-19"
approval-scope: "제안서 P0–P2의 실제 코드·테스트·아키텍처 문서 변경과 로컬 검증. 운영 배포·데이터 변경 제외."
completed-at: "2026-10-19"
verification-summary: "코드 구현·로컬 정적/단위/격리 DB/실제 Next 인수 통과 후 사용자 요청으로 완료 처리. 원격 check·windows-role-runtime CI는 미실행 후속 검증으로 남김."
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/architecture/README.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/repository-disconnection.md"
  - "docs/ADR/0001-adopt-feature-sliced-design.md"
  - "docs/ADR/0002-test-code-organization.md"
---

# 서버 모듈 구조 개선 구현 기록

## Summary

`src/server`를 **얕은 기능 모듈, 명시적인 공개 진입점, 필요한 책임 분리**로 정리했다.
기존 `auth`, `agents`, `pipeline`, `mcp`를 유지하고 `projects`, `tokens`, `usage`,
`templates`, `rest`를 추가했다. 각 모듈 내부는 파일 수준으로 유지했다.

목표는 기능을 고칠 때 살펴볼 위치와 범위를 분명하게 하고, 호출부가 서버 내부의
트랜잭션 조립 방법을 알아야 하는 상황을 줄이는 것이다. 기존 업무 규칙, 잠금 순서,
DB 주입형 테스트, 웹·REST·MCP의 외부 동작을 보존한다.

이 문서는 승인된 방향에 따른 구현 기록이다. 문서 대조 작업 이후 사용자가 실제 코드
수정을 요청해 P0–P2의 코드 변경과 로컬 검증을 수행했다. 원격 CI 미실행을 안내한 뒤 받은
사용자의 완료 처리 요청에 따라 completed로 이동했다. 원격 CI·PR 인수·운영 배포는 별도다.
현행 구조의 권위는 계속 [architecture/README](../../architecture/README.md)에 있다.

## Goal

- 프로젝트 등록·연결·토큰 관리·실행 사용량·템플릿 처리의 소유 위치를 경로로 식별한다.
- 다른 모듈과 웹 호출부는 공개 API를 사용하고, 내부 구현의 파일명에 의존하지 않는다.
- DB 연결 없는 로직과 주입형 함수는 실제 연결을 초기화하지 않고 검사할 수 있게 유지한다.
- 모듈의 허용 의존 방향, 비공개 경로 접근, 모듈 간 순환을 자동 검사한다.
- 작은 기능에 하위 폴더와 추상화 계층을 일률적으로 추가하지 않는다.

## Proposal Size

`proposal-size: standard`다. 코드 대조의 검토 분류는 `High-Risk`다. 다수의 import와 공개 진입점,
서버 초기화 경로, 인증·트랜잭션 관련 호출부에 걸친 구조 변경이다. 인증·권한·저장 정책을
바꾸는 작업은 제외하며, 그 경계를 보존하는 회귀 검증을 필수로 둔다. 제안서 크기와
검토 위험도는 별개이며, 동작을 보존하는 이동도 인증·데이터 무결성 경계의 검토 대상이다.

## Current State

### 관찰 기준과 작업 트리

- 최초 작성: 2026-10-13(`harness/plugin-clean-code`의 미커밋 작업 트리 기준).
  기준선 검증: 2026-10-16. 문서·코드 전체 재대조: 2026-10-18. 코드 HEAD는 두 대조에서 같다.
- 저장소: `stagekeeper`, 점검 브랜치: `dev`.
- HEAD: `ba8f4e9cb89b05855000dc8bda41e271076af0ca`(`origin/dev`·`origin/main`과 같음).
- `src`·`tests`·`scripts`·`docs/architecture`·`docs/ADR`에 미커밋 변경이 없다. 미추적 파일은
  이 제안서뿐이다. `multiple-pipelines.md`의 옛 active 사본은 2026-10-18에 임시 폴더로
  백업 이동되었고, 추적되는 completed 문서가 최종 기록이다.
- 루트 `AGENTS.md`만 있고 하위 `AGENTS.md`는 없다(`git ls-files`).
- `src/server`에는 추적 파일 104개, 루트에는 53개가 있다. 루트 중 구현 파일은 36개,
  테스트는 17개다. 전체에서 테스트와 `.d.ts`를 제외한 TypeScript 파일은 67개다.
- TypeScript AST로 서버 구현 파일의 정적 `import`와 `export from`을 읽어 서버 내부 선언
  190건을 확인했다. 그중 47건은 타입 전용 참조다. 이 수치는 고유 모듈 간선 수가 아니다.
  구현 파일 사이의 dynamic import·require는 없다.
- `src`·`tests`·`scripts`에서 `src/server` 밖의 서버 경로를 참조하는 추적 파일은 100개다. 정적 import·dynamic
  import·문자열 의존성 키·소스 경로를 합친 수다: `src/app` 23, `src/fsd` 20,
  `src/proxy.ts` 1, `tests/server` 18, `tests/server/integration` 27, `scripts` 11.
  이 중 세 파일은 의존성이 아닌 경로 모양 문자열만 가진다: `backlog-form.tsx`의 UI 예시, 그리고
  `verify-fsd-boundaries.test.mjs`·`project-availability-runtime.test.ts`의 검사기 시험용 가상 경로.
  V-INVENTORY의 텍스트 검색은 주석 속 경로 두 개(`scripts/lib/prisma.ts`,
  `src/fsd/shared/routes/projects.ts`)까지 세어 102개를 낸다. 이 세 디렉터리 밖에서는
  `packages/core/{pipeline,vars}.mjs`와 그 복사본 `plugin/lib/{pipeline,vars}.mjs`의 주석,
  루트 `README.md`·`AGENTS.md`가 `src/server`를 언급한다. 모두 위치가 바뀌지 않는 `agents/vars.ts`·`mcp/`
  또는 `src/server` 전체를 가리키므로 경로를 고치지 않는다.

최초 작성 뒤 dev에 다음 변경이 들어왔다.

- [여러 파이프라인 제안](../completed/2026-10-16-multiple-pipelines.md)이 2026-10-16에
  완료되었다. `pipeline/version-save-query.ts`가 삭제되고 `pipeline/definition-save-query.ts`,
  `pipeline/pipeline-settings-query.ts`, `pipeline/lock-query.ts`가 생겼다.
  `pipeline/board.ts`는 singleton을 묶은 함수 외에 factory 별칭 `createBoardService`도 내보낸다.
- 2026-10-15에 [테스트 배치 규칙](../../architecture/test-organization.md)과
  [ADR-0002](../../ADR/0002-test-code-organization.md)가 채택되었다. 따라서 `docs/ADR/0002-*` 번호는
  이미 사용 중이다.
- 최초 작성 때 수정 중이던 서버 테스트 네 개와 다른 작업의 변경은 모두 dev에 커밋되었다.

실제 구현 전에는 이 절의 수치·경로를 다시 측정하고 통합할 기준 리비전을 기록한다.
2026-10-18 대조에서는 추적 파일 열거와 TypeScript AST로 구현 67개·내부 선언 190건·
타입 전용 47건을 재현했다. 이동할 구현·시험의 상대 파일 읽기와 미추적 목적지까지 포함하는
검증은 아래 배치표 보완과 V-INVENTORY를 따른다. 과거 테스트 통과는 변경 후 통과를 뜻하지 않는다.

### 문제와 근거

| 관찰 | 근거 | 개선 목적 |
| --- | --- | --- |
| 관계를 파일명 접두사로만 표현 | 루트의 `project-*`, `token-*`, `account-usage*` | 기능별 탐색 범위 형성 |
| 호출부가 내부 트랜잭션 조립을 소유 | `src/fsd/features/create-project/api/create-project.server.ts`의 `withAvailabilityTransaction`·`registerProjectResultIn` 호출 | 등록 유스케이스를 공개 서비스로 제공 |
| 하나의 파일에 다른 소유 책임이 존재 | `user-scope-query.ts`의 프로젝트 소유권 조회·사용자 토큰 조회 | 프로젝트와 토큰 조회의 소유권 분리 |
| 요청 처리와 재사용 기능이 혼재 | `runbook.ts`의 REST 바인딩·번들 조회·런북 표류 조회 | 외부 요청 조립과 템플릿 기능 분리 |
| 상위 모듈에 놓인 파서를 다른 기능이 참조 | `client-bundle-query.ts` → `agents/steps.ts`, `agents/runs.ts` → `runbook.ts` | 파서를 템플릿 모듈로 이동 |
| 업무 구현이 MCP 타입을 참조 | `mcp/project-sync-query.ts` → `mcp/tools.ts:WorkspaceInput` | 업무 입력 계약을 프로젝트 모듈이 소유 |
| 이름이 실제 쓰기 동작을 설명하지 못함 | `project-registration-query.ts`, `token-management-query.ts`, `runbook-query.ts` | 역할에 맞게 명명 |

### 계약 대조와 근거의 한계

| 구분 | 근거와 판단 |
| --- | --- |
| Observed | 파일 배치, 위 호출 관계, DB singleton 바인딩, 테스트·스크립트 소비자를 실제 소스에서 확인했다. |
| Contracted | [FSD 규칙](../../architecture/fsd.md)은 프런트엔드에 적용된다. 서버는 별도 application service이며 `src/fsd`를 import할 수 없다. 순수 공유 정책은 `packages/core`에 둔다. |
| Contracted | [시스템 개요](../../architecture/system-overview.md)와 [연결 해제 계약](../../architecture/repository-disconnection.md)은 소유권, 원장, 트랜잭션, 토큰 보존·폐기 규칙을 정한다. |
| Contracted | [테스트 배치 규칙](../../architecture/test-organization.md)은 "서버·core·plugin·검사 스크립트의 독립 테스트"를 원본 모듈 옆에 둔다. "`server-only` bootstrap이 필요한 테스트 또는 DB 없는 서버 교차 모듈 테스트"는 `tests/server/`에, 실제 PostgreSQL을 쓰는 서버 통합 테스트는 `tests/server/integration/`에 둔다. [ADR-0002](../../ADR/0002-test-code-organization.md)는 `src/server`에도 적용된다. 결정 기준 중 하나는 "테스트를 위해 운영 API를 넓히거나 운영 코드에 테스트 의존성을 추가하지 않는다"이다. |
| Inferred | `runbook.ts`·`user-scope-query.ts`·`project-registration.ts`를 나누지 않고 `agents/steps.ts`를 옮기지 않은 채 파일명대로만 배치하면 모듈 순환이 생긴다. 2026-10-16 모형에서는 `projects`·`tokens`·`usage`·`rest`·`templates`·`agents`·`pipeline`이 하나의 순환으로 묶였다. 아래 책임 분리와 배치를 현재 내부 선언 190건에 대입하면 허용 방향 위반 0건, 모듈 순환 0건이다. 타입 참조도 포함한 결과다. |
| Limitation | 모형은 현재 정적 참조를 재배치한 설계 검토다. 새 코드의 실행 결과나 새 공개 진입점의 초기화 안전성을 증명하지 않는다. 계산된 dynamic import와 런타임 SDK 동작은 별도 검증 대상이다. |

서버 내부의 public API와 의존 방향은 현재 FSD 검사만으로 강제되지 않는다. 이 제안의
규칙은 새 서버 규칙이며, 구현 시 ADR과 현행 아키텍처 문서에 명시한다.

## Scope

포함 범위는 서버 파일·인접 테스트의 이동, 공개 진입점 도입, 아래에서 지정한 혼합
책임 분리, 역할에 맞는 파일명 변경, 직접 소비자의 import와 테스트 경로 수정이다.
시험의 VM mock 키·소스 경로와 옛 서버 파일 이름을 적은 코드 주석의 갱신도 포함한다.
서버 모듈 검사와 아키텍처 문서 갱신도 포함한다.

다음 작업은 제외한다.

- Prisma 스키마·migration·데이터 변환, 운영 DB·seed·배포.
- 새로운 상품 정책, 인증 방식, 상태 전이, MCP 도구·REST URL·응답 계약.
- `packages/core`·`plugin`의 기능 변경과 진행 중인 다른 제안의 구현.
- 서버에 프런트엔드 FSD 계층 적용, 새 패키지·DI 컨테이너·공통 repository 계층 도입.
- 큰 `board` 구현을 여러 서비스로 다시 나누는 작업과 새 범용 트랜잭션 프레임워크.
- 화면 디자인·문구 변경, 관련 없는 프런트엔드 정리.

## Requirements and Constraints

### REQ-SMOD-001: 외부 요청 결과 보존

WHEN 기존 웹 Action, REST 경로 또는 MCP 도구가 호출될 때, 시스템은 동일한 입력과
저장 상태에 대해 기존 성공·거절 결과, HTTP 상태·헤더, MCP 오류 표현과 사용자 문구를
유지해야 한다. 등록의 신규 201·재등록 200, 429의 `Retry-After`, owner/agent 도구 분리도 포함한다.

### REQ-SMOD-002: 프로젝트·토큰 변경 결과 보존

WHEN 등록, 사용 선택, 플랜 변경, 연결 해제·재연결 또는 토큰 관리가 수행될 때,
시스템은 기존 소유권·상한·멱등·stale 판정과 저장 결과를 유지해야 한다.

### REQ-SMOD-003: 실행·사용량 동작 보존

WHEN 에이전트 실행·재개·결과 제출 또는 파이프라인 전이가 수행될 때, 시스템은
기존 커서·원장·게이트·사용량 판정과 중복 제출 처리 결과를 유지해야 한다.
실행 사용량, 요청 횟수 제한, 토큰의 최근 사용 기록은 각자의 기존 의미를 유지한다.

### REQ-SMOD-004: 템플릿·클라이언트 계약 보존

WHEN 템플릿을 파싱·검증·배포하거나 런북·클라이언트 번들을 조회할 때, 시스템은
기존 스텁·단계 경계, 플랜별 본문 선택, 언어 fallback, 버전·표류 판정과 실패 결과를
유지해야 한다. REST 템플릿 조회와 실행 중 번들 조회의 서로 다른 fallback도 보존한다.

### REQ-SMOD-005: 서버 경계 위반 검출

WHEN 서버 경계 검사에 "자동 경계 검사" 절의 검사 대상 위반이 입력될 때, 검사기는 파일과 위반
경계를 보고하고 실패해야 한다. 위반은 다음과 같다: 비공개 모듈 경로 접근, 허용되지 않은 모듈 의존,
모듈 간 순환, 주입형 API·contracts에서 runtime 연결 진입점이나 `server-only` 표식 파일로의 의존,
조립부가 아닌 서버 파일의 다른 모듈 runtime API 참조, `export *`, 루트 기반 파일의 기능 모듈 참조,
모듈 내부의 자기 집계 API(`api.ts`·`api.server.ts`) 참조, 정적 접두어가 서버 경로인 계산된 dynamic import, 목록에 없는
시험·리허설의 다른 모듈 내부 참조, 더 이상 쓰이지 않는 목록 항목.
허용된 공개 API 참조, 모듈 내부 상대 참조, 직접 정의 contracts의 내부 참조, 명시된 auth 조립
두 간선과 목록에 등록된 시험의 내부 참조는 통과해야 한다.

### INV-SMOD-001: 프로젝트 변경의 원자성

등록과 초기 토큰 저장, 연결 해제와 hs_/ho_ 폐기, 사용 가능 목록과 version/event
기록은 기존과 같은 트랜잭션에서 완료되거나 함께 rollback한다. hu_ 보존, 해제된
프로젝트의 읽기 보존, 재연결 시 기존 id/slug 복원도 유지한다.

### INV-SMOD-002: 실행 원장과 사용량의 일관성

신규 실행과 계정 사용량 증가, 수락된 단계 기록과 커서 revision 변경은 기존 원자성을
유지한다. 기존 User·Project·PipelineRun·AgentRun 잠금 중 각 경로가 실제 사용하는
순서·범위, 충돌 재시도 횟수, stale·응답 유실 후 재제출 판정을 바꾸지 않는다.

### INV-SMOD-003: 인증과 credential 경계

소유권·토큰 종류·만료·폐기 판정, 없는 프로젝트와 타인 프로젝트의 정보 비노출,
토큰 해시 저장과 평문 일회 노출을 보존한다. 사용 기록 실패가 인증 결과를 바꾸지
않는 기존 동작도 유지한다.

### CON-SMOD-001: 얕은 모듈과 현행 외부 경계

서버는 아래 아홉 모듈과 명시된 루트 기반 파일로 구성한다. 이번 변경에서 기능별
하위 폴더를 일률적으로 만들지 않는다. `src/app`, `src/fsd`, `packages/core`의
기존 책임·의존 규칙을 유지하고 `src/server`의 루트 barrel은 만들지 않는다.

### CON-SMOD-002: 공개 API와 초기화 분리

다른 모듈과 외부 소비자는 지정된 공개 진입점을 사용한다. 주입형 API와 계약의
import는 DB singleton·NextAuth 초기화·환경변수 읽기 같은 runtime 바인딩을
끌어오지 않는다. `server-only` 표식이 있는 파일도 끌어오지 않는다. 주입형 코드를
`register-server-only.mjs` bootstrap 없이 읽는 곳이 있기 때문이다. `npm run test:web`, seed 스크립트,
일부 리허설(`rehearse-request-rate-baseline.ts`, `rehearse-pipeline-agent-slots.ts`,
`rehearse-project-availability-d3.ts`)이 그렇다.
서버 API는 파일명이 `api.ts`여도 브라우저 공개 API가 아니다.

### CON-SMOD-003: 사용자 변경과 브랜치 보존

기존 변경을 제거·덮어쓰기·임의 커밋하지 않는다. 구현은 사용자 변경이 반영된 기준을
확정한 뒤 살아 있는 `origin/dev`에서 만든 `harness/<topic>` 브랜치로 진행한다.
PR base는 `dev`이며 현재 검토 브랜치를 구현의 자동 기준으로 삼지 않는다.

### CON-SMOD-004: 행위 보존과 제한된 쓰기 범위

이번 리팩터링에 외부 계약·DB 정책 변경, 새로운 의존성 설치, 운영 작업을 섞지 않는다.
예상하지 못한 동작 결함을 발견하면 기존 실패와 신규 회귀를 구분해 기록하며, 구조
이동의 일부인 것처럼 수정하지 않는다.

### CON-SMOD-005: 기존 검증 유지

인접 테스트와 서버 bootstrap·통합 테스트의 실행 범위를 유지한다. 경로를 옮겨 기존
테스트 glob에서 빠지는 것을 허용하지 않는다. 테스트 위치·보조 코드·운영 코드 의존은
[테스트 배치 규칙](../../architecture/test-organization.md)을 따른다. 아키텍처 규칙을
디렉터리 단위 예외나 검사 비활성화로 통과시키지 않는다.

## Proposal

### 목표 구조와 소유권

아래 경로는 목표 구조다. 신규 모듈과 진입점은 아직 존재하지 않는 제안 경로다.

```text
src/server/
├── projects/       # 프로젝트 접근·등록·사용 선택·연결·워크스페이스
├── tokens/         # 토큰 발급·조회·이름 변경·최근 사용 기록
├── usage/          # 에이전트 실행 사용량과 요청 횟수 제한
├── templates/      # 템플릿 파서·번들 조회·런북 판정
├── agents/         # 에이전트 단계 실행·커서·원장
├── pipeline/       # 보드·게이트·실행 흐름·발굴 설정
├── auth/           # 웹 로그인·세션·접근 guard
├── rest/           # REST 인증·입력·서비스 호출·HTTP 응답 조립
├── mcp/            # MCP 도구·인증·서비스 조립·응답 변환
├── db.ts
├── database-clock.ts
├── github.ts
├── public-url.ts
└── result.ts
```

위 루트 파일은 목적이 제한된 기반이다. 각각 연결, DB 시각, 외부 저장소 목록,
서비스 주소, 공통 결과 계약을 맡는다. 이름 없는 `shared`, `utils`, `services`
폴더로 새 코드를 모으지 않는다. 인접 단위 테스트는 해당 파일 옆에 유지한다.

`usage`는 실행 사용량과 요청 제한을 별도 파일로 유지한다. `tokens`의 사용 기록을
여기에 합치지 않는다. 서버 모듈은 DB 테이블의 독점 소유자를 뜻하지 않는다.
예를 들어 연결 해제에 동반되는 토큰 폐기와 보드 전이에 동반되는 실행 종료는
해당 프로젝트·파이프라인 트랜잭션의 기존 책임으로 유지한다.

### 허용 의존 방향

표는 서버의 다른 기능 모듈에 대한 직접 참조 허용 목록이다. 타입 참조도 포함한다.
각 모듈 내부 상대 참조, 필요한 루트 기반 파일·generated Prisma·`packages/core`·외부
라이브러리는 별도이며, DB 초기화 경계는 다음 절을 추가로 적용한다.

| 출발 모듈 | 참조 가능한 기능 모듈 |
| --- | --- |
| `projects` | 없음 |
| `tokens` | `projects` |
| `usage` | `projects` |
| `templates` | `projects` |
| `pipeline` | `projects`, `usage` |
| `agents` | `projects`, `usage`, `templates`, `pipeline` |
| `auth` | `projects` |
| `rest` | `projects`, `tokens`, `usage`, `templates` |
| `mcp` | `projects`, `tokens`, `usage`, `templates`, `agents`, `pipeline` |

업무 모듈에서 `rest`, `mcp`, `auth`로 돌아가는 참조를 허용하지 않는다. 인증된
호출자 정보와 필요한 의존성은 상위 조립부에서 전달하며, 실제 업무 경로에 이미
있는 소유권·접근 검사를 없애지 않는다. 루트 기반 파일은 기능 모듈을 import하지 않는다.

`scope-copy.ts`의 공통 프로젝트 거절 문구는 `projects`에 둔다. REST와 MCP가 이를
각각 import하므로 두 transport 모듈이 서로 의존할 필요가 없다. `WorkspaceInput`은
`projects` 계약으로 이동하고 MCP 도구도 같은 계약을 참조한다.

### 공개 진입점과 연결 경계

신규 진입점 이름은 다음과 같이 고정한다. 필요한 소비 유형이 없는 진입점은 만들지 않는다.

| 경로 규약 | 공개하는 것 | 금지하는 것 |
| --- | --- | --- |
| `<module>/api.ts` | DB 주입형 함수·factory, 연결 초기화 없는 규칙·파서 | singleton DB, `server-only` 표식 파일, `api.server.ts`의 직접·간접 import |
| `<module>/api.server.ts` | `server-only` 바인딩, 실제 연결이 준비된 서비스 | Client Component에서의 사용 |
| `<module>/contracts.ts` | 모듈 밖에서 필요한 타입의 명시적 `export type` | runtime 초기화, `server-only` 표식 파일, 다른 모듈 내부 타입 파일 참조 |

`projects`, `tokens`, `usage`, `templates`, `pipeline`, `rest`, `mcp`는 필요한 주입형·runtime
진입점을 둔다. `agents`는 주입형 `api.ts`를 기본으로 하며 사용처 없는 runtime 진입점을
추가하지 않는다. contracts 파일은 실제 공유되는 타입이 있을 때만 생성한다.

공개 여부는 제품 소비자가 정한다. 제품 소비자는 `src/app`, FSD 서버 adapter,
`src/proxy.ts`, 운영·seed 스크립트(`scripts/grant-plan.ts`, `scripts/lib/template-seed-query.ts`),
다른 서버 모듈이다. 이들이 모듈 밖에서 실제로 쓰는 symbol만 공개한다. 테스트와
`scripts/rehearse-*` 리허설만 쓰는 symbol을 위해 공개 API를 넓히지 않는다(ADR-0002).
2026-10-16 모형의 공개 후보 수 142개는 최종 export 수가 아니다. 아래 공개 symbol 표는
현재 제품 소비자와 파일 배치표를 대조한 구현 계약이다. TASK-P0-01은 구현 기준 코드에서
이를 다시 측정하고 소비자별 import를 `docs/architecture/server.md`에 기록한다.

`auth`는 기존 `index.ts`(실제 인증 바인딩), `guard.ts`(웹 guard), `config.base.ts`
(DB 없이 읽는 proxy 설정)를 명시적 공개 경로로 유지한다. `config.ts`는 내부다.
`next-auth.d.ts`는 기존 위치와 ambient declaration을 유지한다. 이 경로들은 금지
규칙의 임시 예외가 아니라 해당 모듈의 공개 계약으로 문서·검사기에 등록한다.

모듈 내부는 집계 진입점인 자기 `api.ts`·`api.server.ts`를 다시 거치지 않고 구현을 상대
경로로 참조한다. 그 모듈이 타입을 직접 정의하는 `contracts.ts`는 내부에서도 상대 경로로
읽을 수 있다(`projects/sync-workspaces.ts`의 `WorkspaceInput` 등). 단순 재수출만 하는
contracts를 경유해 내부 구현을 우회하지 않는다. 외부에는 실제 사용하는 symbol만 공개하며
`export *`와 `export type *`는 쓰지 않는다.

`auth`의 기존 조립은 두 개의 내부 공개 경로 참조를 유지한다:
`auth/guard.ts → ./index`와 `auth/config.ts → ./config.base`다. `index.ts`는 NextAuth와
React cache를 실제로 묶는 구현이고 `config.base.ts`는 proxy용 설정의 구현이므로, 이를
금지하면 인증 바인딩을 복제하거나 경로 유지 계약을 깨게 된다. 검사기는 이 두 정규화된
파일 간선만 허용한다. auth 전체 면제가 아니며, 다른 모듈의 자체 집계 진입점 참조는 거부한다.

다른 모듈은 주입형 API와 계약을 사용한다. 다른 모듈의 runtime API(`api.server.ts`)는
실제 연결을 붙이는 조립부에서만 사용할 수 있다. 조립부는 다음과 같다.

- `rest`의 runtime 바인딩 파일: `rest/api.server.ts`, `rest/templates.ts`, `rest/runbook.ts`,
  `rest/project-identity.ts`, `rest/project-registration.ts`.
- `mcp`의 runtime 바인딩 파일: `mcp/api.server.ts`, `mcp/deps.ts`, `mcp/owner-deps.ts`.
- `auth`의 runtime 경로: `auth/index.ts`, `auth/guard.ts`, `auth/config.ts`.
- Next 진입점(`src/app`)과 허용된 FSD 서버 adapter.

시험과 리허설은 이 목록이 아니라 아래 "자동 경계 검사"의 시험 규칙을 따른다. 그 규칙은 공개
진입점(`api.server.ts` 포함) 사용을 허용한다.

2026-10-16 코드에서 다른 모듈의 runtime 바인딩 파일(`server-only` 표식 파일)을 값으로
import하는 서버 파일은 여덟 개다. 일곱 개는 위 조립부의 현재 위치이고(루트 `templates.ts`·`runbook.ts`·
`project-identity.ts`·`project-registration.ts`, `mcp/deps.ts`·`mcp/owner-deps.ts`, `auth/guard.ts`),
나머지 하나가 `agents/runs.ts`다. 타입만 가져오는 파일
(`entitlement.ts`의 `Plan`·`ProjectAccess` 등)은 `projects/contracts.ts`를 쓰도록 바꾼다.
`agents/runs.ts`는 아래처럼 주입형으로 바꾼다. 일반 업무 구현은
다른 모듈의 singleton을 가져오는 대신 현재 DB client를 전달한다.

특히 `agents/runs.ts`는 현재 `@/server/pipeline/board`에서 `latestBoard`를 import한다.
그래서 모듈을 읽는 순간 singleton 보드 서비스가 만들어진다. 이 의존을 주입형 board
service로 바꾸면 `runs.ts`에는 주입형 factory `createNextDeps`만 남는다. 그때 `server-only`
표식도 함께 제거하고 `createNextDeps`를 `agents/api.ts`로 공개한다. 주입형 파일인
`pipeline/run-query.ts`·`board-query.ts`에는 이미 이 표식이 없다.

파이프라인의 공개 factory는 현재 이름 `createBoardService` 하나다. `pipeline/api.ts`는
`board-service.ts`(현 `board-query.ts`)의 `createBoardQueries`를 `createBoardService`라는 이름으로 직접 공개한다.
`createBoardQueries`라는 이름은 공개하지 않는다. 그래서 `createBoardService`를 `board.ts`에서 가져오거나
`mcp/deps.ts`의 mock 키로 쓰던 시험은 이름을 바꾸지 않고 import 경로·키만 바꾼다. `createBoardQueries`를
`board-query.ts`에서 직접 가져오던 시험은 공개 이름으로 바꾸거나 내부 참조 시험 목록에 남는다. 현재처럼 `board.ts`를 거쳐 DB가 초기화되는
재수출은 만들지 않는다. `board.ts`는 singleton을 묶은 runtime 바인딩으로 남고
`pipeline/api.server.ts`만 이를 공개한다. `pipeline/run.ts`는 `server-only` 아래에서 `run-query.ts`를
다시 내보내기만 하는 파일이므로 `pipeline/api.ts`로 대체한 뒤 제거한다. 지금 이 파일을 쓰는
소비자는 이미 DB client를 인자로 넘긴다. `scripts/lib/template-seed-query.ts`도 파서만 공개하는
`templates/api.ts`를 사용해 DB 연결 없이 검증할 수 있게 유지한다.

### 공개 symbol과 이동 후 import

아래 경로는 `src/server/` 기준이다. 현재 소유 파일은 배치표의 source, 아래 구현 소유자는
그 destination이다. 외부 소비자는 구현 소유자 대신 아래 공개 경로를 import한다. 같은 모듈의
호출은 구현을 직접 참조한다. namespace import도 실제로 쓰는 member만 공개한다.
이 표의 값·타입과 신규 등록 유스케이스의 소비자를 V-INVENTORY·V-BOUNDARY·V-UNIT에서
대조한다. 시험만 쓰는 `ensureRun`, `createBoardQueries`, `REVISION_MAX`,
`consumeRequestBudget`, `registerProjectIn` 등을 이 표에 추가하지 않는다.

| 공개 import 경로 | symbol | 구현 소유자와 제품 소비자 |
| --- | --- | --- |
| `projects/api.ts` | `AvailabilityConflict`, `normalizePlan`, `repositoryOwner`, `READ_OPTIONS`, `readProjectAccess`, `readProjectAccessIn`, `readProjectPlanIn`, `lockProjectOwnerIn`, `withAvailabilityTransaction`, `OWNERSHIP_UNAVAILABLE_REASON`, `NOT_YOURS`, `PROJECT_REQUIRED`, `REPO_SEGMENT`, `RESERVED_SLUGS`, `SLUG_RE` | `access-query`, `availability-service`, `access-messages`, `slug-rule`; tokens·usage·templates·pipeline·agents·REST·MCP의 기존 실제 참조만 유지 |
| `projects/api.ts` | `changeUserPlan`, `loadProjectRoster`, `loadProjectView`, `projectForUser`, `syncProject`, `registerRepositoryProject` | `availability-service`, `repository-query`, `project-view-query`, `owner-query`, `sync-workspaces`, `registration-service`; grant-plan·app/FSD roster 조회·agents·MCP·REST 등록 |
| `projects/api.server.ts` | `planForUser`, `planForProject`, `projectAccess`, `loadProjectAvailability`, `loadProjectConnection`, `selectProjectForUse`, `disconnectProject`, `reconnectProject`, `loadProjectRepository`, `projectForUser`, `registerWebProject` | 기존 facade·연결/선택 바인딩과 새 조회/등록 바인딩; 웹·auth·REST 조립부. 주입형 roster는 이곳이 아닌 `api.ts` 사용 |
| `projects/contracts.ts` | `Plan`, `ProjectAccess`, `TransactionHost`, `WorkspaceInput` | 앞의 셋은 `access-query`의 타입(`entitlement` 재수출도 이곳으로 통합), 마지막은 현 `mcp/tools.ts`에서 이 파일로 정의 이동. 기존 모듈 밖 타입 소비자와 MCP tools가 사용 |
| `tokens/api.ts` | `renameProjectToken`, `renameUserToken`, `tryRecordTokenUsage`, `findUserTokenByHash` | `rename-token`, `usage-recorder`, `user-query`; FSD·REST/MCP 주입형 인증 |
| `tokens/api.server.ts` | `issueProjectToken`, `issueProjectOwnerToken`, `recordTokenUsage`, `findUserTokenByHash` | 발급·사용 기록·사용자 토큰 기본 연결; FSD·REST/MCP 조립부 |
| `tokens/contracts.ts` | `TokenUsageRecorder` | `usage-recorder`; REST/MCP의 주입 계약 |
| `usage/api.ts` | `readAccountUsageIn`, `readProjectUsageCapIn`, `usageLimitFailure`, `consumeProjectRequestBudget` | `account-usage-query`, `request-rate-service`; pipeline·agents·MCP |
| `usage/api.server.ts` | `accountUsage`, `limitAccountRequest`, `limitProjectRequest` | 기존 사용량/요청 제한 바인딩; billing·REST/MCP 조립부 |
| `usage/contracts.ts` | `AccountUsage` | `account-usage-query`; billing의 타입 참조 |
| `templates/api.ts` | `DONE`, `findStep`, `splitTemplate`, `TemplateFormatError`, `readCodexBundle`, `checkCodexRunbook`, `resolveCodexBundle`, `runbookStale` | `steps`, `client-bundle-query`, `bundle-query`, `runbook-query`; agents·REST·MCP·seed. `resolveCodexBundle`·`runbookStale`에는 DB를 명시적으로 전달 |
| `templates/contracts.ts` | `Step`, `ParsedTemplate` | `steps`; agents 타입 소비자. 제품 소비자가 없는 `templates/api.server.ts`는 만들지 않음 |
| `pipeline/api.ts` | `createBoardService`, `hasActiveLegacyScoutSlot`, `setAutomaticScout`, `savePipelineDefinition`, `archivePipeline`, `renamePipeline`, `setDefaultPipeline`, `setPipelineRule`, `setAutomaticPick` | `board-service`의 factory 별칭, `automatic-scout`, `save-definition`, `settings-service`; agents·MCP·FSD |
| `pipeline/api.ts` | `headFor`, `nextFor`, `loadPipelinesView`, `loadItemPipelineView`, `loadPipelineChanges`, `codexHandoffView`, `RUNBOOK_STALE_NOTE`, `scoutNodePending`, `handoffIsLive`, `PIPELINE_NOT_FOUND`, `PIPELINE_CANNOT_RUN_ITEMS`, `parseHistoryCursor`, `formatHistoryCursor`, `parseHistoryItemCursor`, `formatHistoryItemCursor` | `run-service`, `codex-handoff-query`, `run-rules`, `history-page`, `history-items`; app·FSD·MCP |
| `pipeline/api.server.ts` | `addBacklog`, `updateBacklog`, `removeBacklog`, `backlogWithStatus`, `latestBoard`, `latestBoardWithEvents`, `latestRowFor`, `getWithHistory`, `hasHistoryBefore`, `projectHistory`, `projectHistoryItems`, `hasProjectHistoryBefore`, `currentRoundIds`, `propose`, `changePipeline`, `transition`, `discard`, `gate`, `retryAcceptance` | `board.ts`의 singleton 바인딩; 기존 app/FSD·owner MCP 소비. agents의 `latestBoard` 사용은 주입형 factory 호출로 바뀜 |
| `pipeline/contracts.ts` | `Caller`, `PipelineEntry`, `PipelineNext`, `HistoryEventRecord` | `board-service`, `run-service`, `run-rules`, `history-page`; agents·MCP·FSD의 기존 타입 참조 |
| `agents/api.ts`, `agents/contracts.ts` | 값: `agentNext`, `createNextDeps`, `NOTE_MAX`, `OUTCOMES`, `receiptSchema`; 타입: `NextInput`, `NextOutput` | 기존 next·runs 구현; MCP. 파서는 templates 소유이며 agents에서 재수출하지 않음 |
| `rest/api.ts`, `rest/api.server.ts` | 주입형: `restFailureResponse`; runtime: `projectIdentityFor`, `templatesFor`, `recordRunbook`, `registerProject` | `response`와 네 REST 바인딩; 동일한 `src/app/api/{project,templates,runbook,projects}/route.ts` |
| `mcp/api.ts`, `mcp/api.server.ts` | 주입형: `registerTools`, `registerOwnerTools`; runtime: `prismaToolDeps`, `verifyProjectToken`, `prismaOwnerToolDeps`, `verifyOwnerToken` | tools·owner-tools와 deps·owner-deps; 기존 두 MCP route |
| `auth/index.ts`, `auth/guard.ts`, `auth/config.base.ts` | `auth`, `handlers`, `signIn`; `requireUser`, `requireProjectOwner`, `requireProjectWrite`; `AFTER_SIGN_IN`, `authConfigBase` | 기존 정의·외부 소비자·두 내부 조립 간선을 유지. `config.ts`는 비공개 |

기본 DB를 쓰는 `projectForUser`·`findUserTokenByHash`는 각 `api.server.ts`의 wrapper가
제공한다. `owner-query.ts`·`user-query.ts`의 주입형 함수에는 singleton 기본값과
`server-only` import를 남기지 않는다. `loadProjectRepository`도 주입형 구현을 내부에 두고
웹의 기존 단일 인자 호출은 runtime wrapper로 유지한다. 루트 기반 API(`prisma`,
`readDatabaseClockIn`, `failureBody`와 공통 결과 타입, `listPublicRepos`, URL 함수)는
기존 공개 경로를 유지한다.

### 파일 배치표

표의 경로는 모두 `src/server/` 기준이다. 목적지에서 같은 모듈임이 분명한 접두사는
줄인다. `-query`는 조회에, handler는 요청 해석·응답 조립에 사용한다. 상태를 쓰는
구현은 command·service 또는 구체적인 동사로 이름을 정한다.

| 현재 루트 파일 | 제안 목적지 | 작업 |
| --- | --- | --- |
| `account-usage.ts` | `usage/account-usage.ts` | runtime 바인딩 이동 |
| `account-usage-query.ts` | `usage/account-usage-query.ts` | 조회 이동 |
| `automatic-scout.ts` | `pipeline/automatic-scout.ts` | 파이프라인 설정·기존 실행 종료 책임 유지 |
| `client-bundle-query.ts` | `templates/client-bundle-query.ts` | 번들 읽기·검증 이동 |
| `codex-handoff-query.ts` | `pipeline/codex-handoff-query.ts` | 실행 결합·재개 정보 조회 이동 |
| `database-clock.ts` | 동일 | 유지 |
| `db.ts` | 동일 | 유지 |
| `entitlement.ts` | `projects/entitlement.ts` | 현재 플랜·접근 facade 이동 |
| `github.ts` | 동일 | 유지 |
| `project-access-query.ts` | `projects/access-query.ts` | 접근 판정 이동; 외부 공유 타입은 contracts로 노출 |
| `project-availability-service.ts` | `projects/availability-service.ts` | 업무 잠금·재시도·목록·원장을 함께 유지 |
| `project-availability.ts` | `projects/availability.ts` | runtime 바인딩 이동 |
| `project-connection-service.ts` | `projects/connection-service.ts` | 원자적 연결 변경 이동 |
| `project-connection.ts` | `projects/connection.ts` | runtime 바인딩 이동 |
| `project-identity-query.ts` | `rest/project-identity-handler.ts` | 인증·접근·HTTP 결과 조립 이동 |
| `project-identity.ts` | `rest/project-identity.ts` | runtime 바인딩 이동 |
| `project-registration-query.ts` | `projects/registration-command.ts` | 기존 transaction 내부 등록 함수 이동 |
| `project-registration.ts` | `rest/project-registration.ts` + `projects/registration-service.ts` | 요청 처리와 등록 트랜잭션 조립 분리 |
| `project-slug-rule.ts` | `projects/slug-rule.ts` | 규칙 이동, 현재 core 위임 유지 |
| `project-token-service.ts` | `tokens/project-token-service.ts` | 발급 서비스 이동 |
| `project-token.ts` | `tokens/project-token.ts` | runtime 바인딩 이동 |
| `project.ts` | `projects/repository-query.ts` + `projects/api.server.ts` | 조회에 DB를 주입하고 기본 연결은 public runtime에서 바인딩; 공개 이름 `loadProjectRepository`·`loadProjectRoster`와 호출 모양 유지 |
| `public-url.ts` | 동일 | 유지 |
| `request-rate-limit.ts` | `usage/request-rate-service.ts` | 요청 예산 소비 구현 이동 |
| `request-rate.ts` | `usage/request-rate.ts` | runtime 바인딩 이동 |
| `rest-scope.ts` | `rest/scope.ts` | REST 주체 해석 이동 |
| `result.ts` | 동일 + `rest/response.ts` | 공통 결과·`failureBody` 유지; HTTP 응답 함수·`RestRateFailure` 분리 |
| `runbook-query.ts` | `rest/runbook-handler.ts` | 인증·검증·기록 요청 조립 이동 |
| `runbook.ts` | `templates/runbook-query.ts`, `templates/bundle-query.ts`, `rest/runbook.ts` | 표류 조회·번들 조회·REST 바인딩 분리; `runbookStale`·`resolveCodexBundle`의 `db = prisma` 기본값 제거(현재 모든 호출부가 client를 넘김) |
| `scope-copy.ts` | `projects/access-messages.ts` | REST/MCP 공통 프로젝트 거절 문구 이동 |
| `templates-query.ts` | `rest/templates-handler.ts` | 인증·플랜 확인·배포 응답 조립 이동 |
| `templates.ts` | `rest/templates.ts` | runtime 바인딩 이동 |
| `token-management-query.ts` | `tokens/rename-token.ts` | 이름 변경 쓰기 함수 이동 |
| `token-usage-query.ts` | `tokens/usage-recorder.ts` | 주입형 최근 사용 기록 이동 |
| `token-usage.ts` | `tokens/usage.ts` | runtime 바인딩 이동 |
| `user-scope-query.ts` | `projects/owner-query.ts` + `tokens/user-query.ts` | 소유 프로젝트 조회와 사용자 토큰 조회 분리; 기본 연결은 runtime API에서 제공 |

기존 네 폴더의 처리와 추가 계약은 다음과 같다. 아래에 적지 않은 기존 파일은
그 모듈에 유지하며 공개 API를 통한 외부 참조만 갱신한다.

| 현재 경로·정의 | 제안 목적지·처리 |
| --- | --- |
| `agents/steps.ts` | `templates/steps.ts`; 파서·단계 타입을 에이전트 실행과 seed가 함께 사용 |
| `agents/run-query.ts` | `agents/run-service.ts`; 커서 쓰기·감사 기록의 의미가 드러나게 이름 변경 |
| `mcp/project-query.ts` | `projects/project-view-query.ts`; 기존 repoOwner → owner DTO 유지 |
| `mcp/project-sync-query.ts` | `projects/sync-workspaces.ts`; transaction과 상한 판정 유지 |
| `mcp/tools.ts:WorkspaceInput` | `projects/contracts.ts`; MCP 입력 검증은 계속 MCP가 담당 |
| `pipeline/board-query.ts` | `pipeline/board-service.ts`; 큰 구현을 재분해하지 않음 |
| `pipeline/run-query.ts` | `pipeline/run-service.ts`; 실행 생성·전진의 책임 유지 |
| `pipeline/definition-save-query.ts` | `pipeline/save-definition.ts`; 저장·stale 판정 유지(최초 작성의 `version-save-query.ts`는 multiple-pipelines가 이 파일로 대체) |
| `pipeline/pipeline-settings-query.ts` | `pipeline/settings-service.ts`; 보관·이름 변경·기본값·규칙·자동 선택 쓰기 유지 |
| `pipeline/lock-query.ts` | `pipeline/lock-pipeline.ts`; 쓰기 잠금·편집 플랜 판정·충돌 변환 유지 |
| `pipeline/run.ts` | 제거; `pipeline/api.ts`가 대체 |
| `pipeline/board.ts` | 위치 유지; singleton runtime 바인딩이며 `pipeline/api.server.ts`로만 공개 |
| `agents/runs.ts` | 위치 유지; board singleton import를 주입형 board service로 바꾸고 `server-only` 표식 제거 |
| `auth/*`, `agents/next.ts`, `agents/vars.ts` | 위치 유지; 파서·공개 API·runtime 의존을 갱신 |
| 나머지 `pipeline/*`, `mcp/*` | 위치 유지; 외부 직접 참조와 재수출만 규칙에 맞게 수정 |

위 매핑에는 루트 구현 36개를 모두 포함했다. 대응 단위 테스트는 구현 파일의 새 이름을
따라 목적지 옆으로 이동한다. 예를 들어 `project-access-query.test.ts`는 `projects/access-query.test.ts`,
`pipeline/board-query.test.ts`는 `pipeline/board-service.test.ts`가 된다. 별도 대응 구현이 없는
`harness-init.test.ts`는 `rest/harness-init.test.ts`, `project-slug-rule-sync.test.ts`는
`projects/slug-rule-sync.test.ts`로 이동한다.

`harness-init.test.ts`는 DB 없이 REST handler(`makeTemplatesFor`, `makeRecordRunbook`)와 plugin CLI를
함께 검증한다. 다른 기능 모듈에서는 거절 문구 상수와 타입만 읽으므로 `rest` 모듈의 독립 테스트로 본다.
테스트 배치 규칙의 "서버·core·plugin·검사 스크립트의 독립 테스트 → 원본 모듈 옆"에 따라 `rest/`에
둔다. `tests/server/`로 보내지 않는 이유도 있다. 그곳은 `npm run test:server`로만 실행되고
`check` workflow에는 없어서 CI 범위에서 빠지기 때문이다(CON-SMOD-005).
`tests/server/`의 교차 모듈·DB 통합 테스트와 `tests/server/runbook-stale.test.ts`는 실행 위치를
유지하고 참조 경로만 변경한다.

시험의 import 외 파일 읽기도 함께 옮긴다. 이동 후 `import.meta.url`의 기준 디렉터리가
바뀌는 두 파일은 다음 값을 사용한다. 경로를 해석한 실제 파일과 내용까지 V-UNIT으로 확인한다.

| 이동 후 시험 | 파일 읽기 | 이동 후 상대 경로와 목적지 |
| --- | --- | --- |
| `rest/harness-init.test.ts` | 실제 CLI 실행 파일 `CLI` | `new URL("../../../plugin/bin/harness-init.mjs", import.meta.url)` → 루트 `plugin/bin/harness-init.mjs` |
| `projects/slug-rule-sync.test.ts` | `SERVER` | `read("./slug-rule.ts")` → `projects/slug-rule.ts` |
| `projects/slug-rule-sync.test.ts` | `FSD_SLUG` | `read("../../fsd/features/create-project/model/project-slug.ts")` → `src/fsd/features/create-project/model/project-slug.ts` |

`agents/vars.test.ts`의 examples JSON과 mcp·pipeline 시험의 product-copy 읽기는 디렉터리
깊이가 바뀌지 않아 기존 상대 경로를 유지한다. 이동 전에 모든 source의 존재, 새 부모 생성,
목적지 충돌 부재를 확인하고 배치표의 source별 old-absence·destination별 new-presence를 검사한다.

### 등록 서비스와 트랜잭션 경계

`projects/registration-service.ts`는 기존 등록 command를 감싸는 공개 유스케이스를
제공한다. 웹 경로의 사용자가 고른 slug 등록과 REST 경로의 멱등 저장소 등록은 같은
command를 사용하되, 현재 각 경로의 재시도·오류 처리 차이를 보존한다.

- 웹 adapter는 세션 확인, FormData 해석, 화면 결과 변환을 맡는다. 직접
  `withAvailabilityTransaction` 또는 transaction 내부 등록 함수를 호출하지 않는다.
- REST adapter는 hu_ 인증, 입력 해석, 요청 제한, HTTP 결과 변환을 맡는다.
- 등록 서비스는 트랜잭션·소유자 잠금·상한·저장·DB 충돌 처리를 맡는다. 신규/기존,
  해제됨, 상한, 무결성·충돌 결과는 transport와 독립적인 결과로 전달한다.
- 두 경로의 slug 충돌 처리와 재시도 횟수는 기준 테스트로 고정하고 각각의
  유스케이스 안으로 이동한다. 새 공통 정책으로 두 경로를 같게 만들지 않는다.
- 기존 초기 토큰 평문 생성과 결과 노출 규약을 유지한다. DB에는 hash만 저장하고,
  기존·해제된 저장소 결과에 새 token을 저장하거나 노출하지 않는다.
  웹 adapter는 지금처럼 `newToken()`을 서비스 호출 전에 한 번 실행해 hash만 넘기고,
  평문은 `created`의 화면 결과를 만들 때만 사용한다. 서비스로 옮기는 것은 DB transaction과
  오류 처리이며 token 생성 시점·재시도마다 같은 hash를 쓰는 규약은 바꾸지 않는다.
- REST 응답을 위한 커밋 후 프로젝트 재조회와 그 사이 삭제·연결 해제된 경우의
  현재 거절 결과도 유지한다. 이 재조회는 DB 읽기이므로 등록 서비스의 REST 유스케이스 안에
  둔다. REST adapter는 위 책임 목록대로 그 결과(사라짐·해제됨 포함)를 HTTP 결과로 변환만 한다.

보존할 현재 동작(2026-10-16 코드 기준)은 다음과 같다. 서비스로 옮긴 뒤에도 값이 같아야 한다.

| 항목 | 웹 `createProject` | REST `registerProject` |
| --- | --- | --- |
| 트랜잭션 | `withAvailabilityTransaction`: Serializable, `maxWait` 5초·`timeout` 30초 | 같음 |
| 동시 쓰기 | 첫 쓰기 전 `User` 행 `FOR UPDATE`. P2034, P2010의 40001·40P01, `AvailabilityConflict`가 나면 트랜잭션 전체를 다시 실행한다(최대 3회). 그래도 실패하면 `AvailabilityConflict` | 같음 |
| 같은 저장소 재요청 | `existing`(토큰 없음), 해제된 저장소는 `disconnected` | 기존 행 200, 해제된 저장소는 409와 `reconnectSlug` |
| slug P2002 | 재시도 없음. `'<slug>' is already taken.` | 한 번 더 시도(총 2회). 두 번째 실패는 throw |
| 상한 | `capped`는 상한 문장의 화면 오류 | 403 |
| 무결성·혼잡 | `integrity` 결과는 화면 오류, `AvailabilityConflict`는 그 메시지, 그 밖의 예외는 다시 throw | `integrity` 결과, 던져진 `ProjectIntegrityError`·`AvailabilityConflict`는 모두 409, 그 밖의 예외는 throw |
| 초기 토큰 | 트랜잭션 전 `newToken()`. 같은 `create`에 hash만 저장하고 평문은 `created`일 때만 반환 | 만들지 않음 |
| 커밋 후 | 없음 | 행 재조회. 사라짐 409, 해제됨 409와 `reconnectSlug` |

등록을 다루는 transport·경합 회귀 시험은 네 개다: `tests/server/token-issuance-bindings.test.ts`(웹 action),
`tests/server/project-registration.test.ts`(REST 입력·인증),
`tests/server/integration/project-registration.test.ts`(REST 실제 DB),
`tests/server/integration/project-connection.test.ts`(등록 경합·직렬화). command·공통 retry의
단위 시험은 현재 `project-registration-query.test.ts`·`project-availability-service.test.ts`이며
각각 `projects/registration-command.test.ts`·`projects/availability-service.test.ts`로 이동한다.

등록 서비스의 공개 이름과 책임은 다음과 같다.

- `registerWebProject`: 기본 연결 wrapper는 `projects/api.server.ts`로만 웹에 공개한다.
  주입형 구현은 `registration-service.ts`에 두고, 검증된 웹 입력·초기 token hash와
  client를 받는다. 결과는 `ServerResult<RegisterProjectResult>`다. 기존 command의
  discriminated 결과는 `ok:true, item`으로 전달하고, 기존 웹 catch 두 종류만
  `ok:false, reason`으로 바꾼다. adapter는 실패를 기존 화면 오류로, 성공 item을
  기존 `toCreateProjectState`와 자신이 가진 평문으로 변환한다. 다른 예외는 throw한다.
- `registerRepositoryProject`: `projects/api.ts`로 REST 조립부에 공개하는 주입형 유스케이스다.
  hu_ 인증·입력 해석·계정 요청 제한을 마친 입력과 client를 받는다. 초기 token hash는 받지 않는다.
  총 두 번의 slug 충돌 시도와 커밋 뒤 재조회를 소유한다. 성공은 `created`/`existing`과
  현재 repository projection, 거절은 `capped`/`integrity`/`disconnected`/`vanished`/`conflict`와
  기존 reason을 반환한다. `disconnected`만 실제 slug를 함께 준다. REST 바인딩이 기존
  200/201·403/409·`reconnectSlug` 결과로 변환한다. 최종 P2002 등 원래 throw하던 오류는 유지한다.
- `registerProjectResultIn`은 등록 서비스 안에서 쓰는 command가 되므로 공개 API로 재수출하지 않는다.
  이를 직접 쓰는 DB 시험·D3 리허설은 내부 참조 시험 목록을 사용한다. 웹은 Prisma error 타입·
  transaction helper를 더 이상 import하지 않는다.

2026-10-18에 대조한 보존 검증의 목적지는 다음과 같다. 없는 assertion은 파일 이동 전에
해당 기존 시험에 추가하고, 이동 후 동일한 주입형 서비스와 실제 adapter를 대상으로 유지한다.

| 보존 경계 | 현재 증거 | 구현 시 필수 회귀 목적지 |
| --- | --- | --- |
| 신규/기존·hash-only·token 미생성, cap·무결성·해제 결과 | command 단위 시험·token issuance binding·실제 등록/연결 통합 시험 | `projects/registration-command.test.ts`, 기존 token issuance binding·등록/연결 integration |
| Serializable 옵션·3회 retry·비충돌 예외 전파 | availability-service 단위 시험·실제 User 잠금 경합 | `projects/availability-service.test.ts`와 기존 `integration/project-connection.test.ts` |
| 웹 slug P2002는 1회·같은 오류 문장, REST는 2회 후 전파 | 현재 코드와 2026-10-18의 실제 함수를 부르는 격리 VM probe로 재현. 기존 transport 시험에는 이 정확한 호출 횟수 assertion이 없음 | `projects/registration-service.test.ts`(신규), 기존 웹 token issuance binding·REST registration binding |
| REST 커밋 후 행 소실·해제와 실제 slug, 던져진 integrity/busy 오류 | 현재 코드와 같은 VM probe로 각각 409·원문 reason을 재현. 기존 registration binding에는 이 재조회 실패 분기 assertion이 없음 | 신규 registration-service 시험 + `tests/server/project-registration.test.ts`; DB 원자성은 기존 integration으로 별도 확인 |

신규 service 시험은 DB 없는 한 모듈 단위 시험이므로 구현 옆에 두고 `test:web`에서 실행한다.
VM probe는 코드의 현재 분기를 확인한 증거이며 실제 DB rollback이나 구현 후 회귀 통과를 대신하지 않는다.

`tokens`가 필요로 하는 소유자 잠금과 프로젝트 접근 함수는 `projects/api.ts`에
제한적으로 공개할 수 있다. 등록 웹 adapter에 그 저수준 조립 권한까지 제공하지는
않는다. 공개 symbol별 실제 소비자와 필요 이유를 아키텍처 문서에 기록한다.

### 대표 변경 시나리오로 평가

| 변경할 동작 | 우선 살펴볼 모듈 | 함께 확인할 경계 |
| --- | --- | --- |
| 프로젝트 등록·중복·상한 | `projects` | REST와 웹이 같은 저장 규칙을 사용하고 응답 변환을 유지하는지 |
| 연결 해제·재연결 | `projects` | 토큰 폐기와 이력 보존이 같은 transaction에 남는지 |
| 토큰 발급·이름·최근 사용 기록 | `tokens` | 프로젝트 접근 정책은 공개 API로 사용하는지 |
| 실행 사용량·요청 제한 | `usage` | 실행 생성과 사용량 증가의 원자성, MCP/REST 요청 제한 |
| 단계 형식·번들 검증 | `templates` | agents·REST·seed가 같은 파서를 사용하는지 |
| 에이전트 커서·원장 | `agents` | pipeline의 실행 결합과 usage 판정의 공개 계약 |

모든 변경이 한 모듈에서 끝난다고 가정하지 않는다. 업무 규칙을 소유한 곳과 이를
호출·표현하는 경계가 구분되는지가 평가 기준이다.

### 자동 경계 검사

신규 `scripts/verify-server-boundaries.mjs`와 `scripts/verify-server-boundaries.test.mjs`를
제안한다. devDependency로 이미 설치된 `typescript`(`^5`)의 compiler API를 이용하며
(`scripts/project-availability-runtime.test.ts`가 같은 방식으로 쓴다) 새 npm 의존성은 추가하지 않는다.
최종 단계에서 `package.json`에 `verify:server`를 추가하고 `lint`에 연결한다.
기존 `check`가 `lint`를 호출하므로 `check` workflow에도 적용된다. 검사기 테스트는
기존 `test:architecture`의 `scripts/*.test.mjs` glob에 포함한다.

검사 대상은 다음과 같다.

- 모듈 간 정적 import·export-from·타입 참조의 허용 방향과 순환. `typeof import("…")` 형태의 타입 질의도
  타입 참조로 본다(2026-10-16 현재 서버 경로를 가리키는 것은 `rehearse-src-clean-code-fifth-pass.ts` 343행 1곳).
- alias와 상대 경로, 파일 확장자·directory resolution을 정규화한 뒤의 private import.
- 문자열 literal dynamic import·require의 동일한 경계. 템플릿 문자열·문자열 연결로 만든
  지정자의 정적 접두어가 서버 경로(`@/server/`, `src/server/`)이면 위치를 보고하고 실패한다.
  2026-10-16 현재 그런 지정자는 없다. VM 로더의 `require(name)`처럼 변수만 받는 호출과
  `resolve("src/server/…")` 같은 소스 경로 문자열은 이 규칙이 아니라 아래 문자열 의존성 확인으로 다룬다.
- 주입형 API와 contracts에서 시작하는 전이적 참조가 `db.ts`, 인증 초기화,
  runtime API, `server-only` 표식 파일로 들어가는지. 같은 모듈 내 간접 재수출도 포함한다.
- 모듈 내부의 자기 `api.ts`·`api.server.ts` 참조, `export *`·`export type *`, 루트 기반 파일의
  기능 모듈 참조. 직접 정의한 contracts 타입의 내부 상대 참조와 위 auth 조립 두 간선은 허용한다.
- 위 조립부 목록에 없는 서버 파일이 다른 모듈의 `api.server.ts`를 참조하는지.
- `src/app`, FSD 서버 adapter, `src/proxy.ts`, 운영·seed 스크립트 등 외부 소비자의 공개 경로 사용.
- 시험·리허설 코드의 내부 참조가 아래 목록에 있는지, 목록 항목이 아직 실제로 쓰이는지.

검사기는 `src`·`tests`·`scripts`의 실제 파일을 순회한다. Git index에만 의존하지 않으며
새 미추적 목적지·시험도 검사한다. `.git`, `.next`, `node_modules`, `src/generated`는 제외한다.
runtime 초기화 closure는 실행되는 값 import·재수출을, 모듈 방향·private 경계는 타입 참조까지
검사한다. contracts는 명시적 타입 선언/재수출만 허용하고 runtime export를 거부한다.

시험과 리허설 코드의 규칙은 다음과 같다. 대상은 `*.test.*`, `tests/**`, `scripts/rehearse-*`다.

- 모듈 옆 단위 테스트는 자기 모듈 내부를 상대 경로로 검사할 수 있다.
- 그 밖의 참조는 공개 진입점, 루트 기반 파일, auth 공개 경로를 사용한다.
- 공개되지 않은 다른 모듈 내부를 읽어야 하면 `docs/architecture/server.md`의 "내부 참조
  시험 목록"에 파일 단위로 등록한다. 각 항목에는 시험 파일, 읽는 모듈, 이유를 적는다.
  이유는 실제 DB 회귀의 주입 factory 조립, VM 소스 로딩 binding 시험, 리허설 fixture 조립 등이다.
  시험을 위해 공개 API를 넓히지 않는다(ADR-0002). 디렉터리 단위 면제나 규칙 끄기는 허용하지 않는다.
  이 목록은 `docs/architecture/server.md`의 현행 규칙이고, 그 근거는 ADR-0003에 둔다(ADR README의 역할
  구분: 현행 규칙은 일반 문서, 배경과 이유는 ADR). 따라서 `verification.md` "예외 정책"의 일시 예외 표
  (현재 "없음")로 옮기지 않는다. 시험이 아닌 코드에 일시 예외가 필요하면 그 예외 정책을 따른다.
- 2026-10-16 모형에서 이 목록 후보는 46개다. 시험 39개와 리허설 7개이며, 상한으로 센 수다.
  - 리허설: `scripts/rehearse-{acceptance-failure,pipeline-agent-slots,project-availability-d3,repository-disconnection,request-rate-baseline,src-clean-code-fifth-pass,src-clean-code}.ts`.
  - 원본 옆 시험: `src/server/{harness-init.test.ts,mcp/tools.test.mjs,project-identity-query.test.ts,project-token-service.test.ts}`.
  - `tests/server/`: `{account-usage-bindings,mutation-identifiers,owner-gate,project-connection-bindings,project-guard,project-history,project-registration,token-issuance-bindings,token-usage-bindings}.test.ts`.
  - `tests/server/integration/`: `{acceptance-failure,account-usage,agent-runs,automatic-scout,backlog-add,board,client-runtime,head,history-items,hold-propose,impl-verifier,mutation-identifiers,pipeline-change,pipeline-composition,pipeline-materialization,pipeline-routing,pipeline-save,pipeline-settings,project-connection,project-history,project-sync,qa-verifier,request-rate-limit,templates,token-management,token-usage}.test.ts`.
- 최종 목록은 TASK-P2-02에서 검사기를 최종 트리에 돌려 확정한다. 공개 symbol만 쓰게 된 파일은 빼고,
  위 후보에 없는 파일을 더할 때는 이유를 PR에 남긴다.

검사기가 보지 않는 문자열 의존성도 있다.

- `tests/server/fixtures/load-module.ts` 같은 VM 로더는 import 지정자 문자열을 mock 키로 쓴다.
  예: `"@/server/project-access-query"`, `"./token-usage"`. 키가 바뀐 지정자와 다르면 mock이
  적용되지 않는다. `@/` 지정자는 require가 실패해 드러나지만, 상대 지정자는 실제 모듈로 조용히
  넘어갈 수 있다.
- 시험은 `"src/server/token-usage.ts"`처럼 소스 경로를 직접 읽기도 한다.
- `scripts/rehearse-src-clean-code.ts --render-faults`는 production build chunk에서
  `(0,x.loadProjectRepository)`를 Inbox 로더 함수의 정규식으로 찾는다.

이것들과 `new URL(..., import.meta.url)`·파일 읽기 helper의 상대 경로는 V-INVENTORY의
문자열·파일 목적지 대조와 해당 시험·리허설의 실제 실행으로 확인한다.
기존 FSD 검사는 그대로 유지한다.

## Affected Files

| 경로 또는 영역 | 작업 | 범위 |
| --- | --- | --- |
| `src/server/**` | move / split / rename / public API 추가 | 위 배치표와 필요한 인접 테스트 |
| `src/server/projects/registration-service.test.ts` | create | 웹/REST 충돌 횟수·오류 전파·커밋 뒤 재조회 실패의 행위 회귀. `test:web` 대상 |
| `src/app/**`(23개), `src/proxy.ts` | import·서버 호출 조립 갱신 | URL·라우팅·화면 동작 보존 |
| `src/fsd/**/api/**`(서버 adapter 18개와 `widgets/turn-banner/api/turn-data.test.ts`) | import·등록 서비스 호출·mock 키 갱신 | 기존 FSD server adapter 경계 유지 |
| `src/fsd/widgets/turn-banner/model/turn.ts`, `turn.test.ts`, `src/fsd/features/review-gate/model/inbox-item.ts` | 옛 서버 파일 이름(`board-query`)을 적은 주석만 수정 | 동작·문구 변경 없음 |
| `tests/server/**`(45개) | import·주입·VM mock 키·소스 경로 수정 | 회귀·원자성 검증의 assertion 유지 |
| `tests/server/server-public-api.test.ts` | create | runtime 진입점(`api.server.ts`)을 `register-server-only.mjs` bootstrap 아래 주입 fixture로 검사. bootstrap이 `server-only`를 대체하므로 import closure는 이 시험이 아니라 검사기(정적)와 `test:web`이 확인 |
| `scripts/grant-plan.ts`, `scripts/lib/template-seed-query.ts`, 위 리허설 7개 | public API 참조·dynamic import·소스 경로 갱신 | 운영 행위 자체는 실행·변경하지 않음 |
| `scripts/project-availability-runtime.test.ts` | 52행의 표시용 파일명 `src/server/project-registration-query.ts`를 새 경로로 수정 | 검사 판정은 바뀌지 않음. `scripts/lib/prisma.ts`·`verify-fsd-boundaries.test.mjs`의 서버 경로는 위치가 바뀌지 않는 파일이나 가상 경로라 그대로 둠 |
| `scripts/verify-server-boundaries.mjs`, 대응 `.test.mjs` | create | 제안된 신규 검사기·검사기 회귀 테스트. 정상 auth 두 간선·직접 정의 contracts·미추적 파일 포함 fixture와 잘못된 자체 집계 참조를 구별 |
| `package.json` | modify | `verify:server`와 lint 연결만; 의존성·lock 변경 없음 |
| `docs/architecture/server.md` | create | 모듈 소유권·공개 symbol·의존 방향·내부 참조 시험 목록의 현행 규칙 |
| `docs/ADR/0003-server-module-boundaries.md`, `docs/ADR/README.md` 목록 | create / modify | `docs/ADR/template.md`를 복사해 작성(MADR 영어 heading·한국어 본문). front matter는 `status: "proposed"`, `supersedes: []`, `superseded-by: null`로 시작하고 README의 ADR 목록에 같은 status로 행을 추가한다. PR 승인 시 둘 다 `accepted`로 바꾼다(ADR README의 lifecycle). `0002`는 테스트 배치 ADR이 사용 중. 착수 시 번호를 다시 확인 |
| `docs/architecture/README.md` | modify | 서버 문서 연결, 12행의 경계 강제 명령 문장, 20행의 `src/server/templates.ts` 경로, "개발 시작과 종료"(157행 블록)의 검사 명령 목록에 `npm run verify:server` 추가 |
| `docs/architecture/test-organization.md` | modify | "의존성 경계"에 서버 모듈 시험의 내부 참조 규칙과 `server.md` 목록 연결만 추가. ADR-0002가 이 문서를 테스트 규칙의 단일 기준으로 정했기 때문이다. 배치 규칙 자체는 바꾸지 않음 |
| `docs/architecture/system-overview.md` | modify | 55~58행의 모듈 이름, 133행 "슬롯 실행 저장 경계"의 `run-query`·`board-query`·`run.ts`·`board.ts`·`runs.ts` |
| `docs/architecture/verification.md` | modify | "자동 검사" 첫머리의 검사기 소개·명령 목록과 14행의 `npm run lint` 구성 설명, "저장소 스크립트" 표의 검사기 행(104행)·검사기 테스트 행(116행)에 서버 검사기 추가, "테스트 배치 규칙의 검증" 표에 서버 검사기가 시험의 서버 내부 참조를 검사한다는 자동화 상태 |
| `README.md`(루트) | modify | Development 표의 `npm run check`·`npm run lint` 설명(288·289행)에 서버 경계 검사를 넣고 `npm run verify:server` 행을 추가. Contributing의 "완료 전 실행 명령" 목록(368행)에도 추가. 정책 문구 변경 없음 |
| `AGENTS.md` | modify | 31행 "완료 전 실행 명령" 목록에 `npm run verify:server` 추가. 정책 문구 변경 없음 |
| `docs/architecture/fsd.md` | modify | 208행 예시 `import { projectAccess } from "@/server/entitlement"` |
| `docs/architecture/protocol.md` | modify | 105행의 `src/server/harness-init.test.ts` 경로 |
| 나머지 현행 architecture 문서 | 필요한 경로·명령 안내만 수정 | 2026-10-16 경로·명령 검색에서는 추가 대상 없음; 정책 문구 변경 제외 |

위 표는 **승인된 구현의 허용 범위**다. 지난 completed 제안·과거 보고서의 당시 경로는 역사적 근거로
유지한다. 다른 활성 제안의 의미를 바꾸지 않으며 경로 변경 영향은 구현 결과에 기록한다.

## Safety Analysis

| 경계 | 보존·검증 방법 |
| --- | --- |
| 접근 권한·세션 만료·토큰 종류 | 기존 긍정·부정 fixture를 유지하고 잘못된 토큰·타인·무세션 경로를 재실행. `rest/`로 이동하는 REST handler 4개(`project-identity-handler`·`templates-handler`·`runbook-handler`·`project-registration`)의 401·403 거절은 함께 이동하는 옆 시험(`project-identity-query`·`templates-query`·`runbook-query`·`rest-scope`의 `.test.ts`)과 `tests/server/project-registration.test.ts`가 단언한다(2026-10-16 확인). 주체 판정은 `rest/scope.ts`(현 `rest-scope.ts`) 한 곳에 남고 각 handler가 그 결과로 거절하는 구조를 바꾸지 않는다. 웹 guard(`auth/guard.ts`, `tests/server/project-guard.test.ts`)와 MCP 인증(`mcp/auth.ts`, `mcp/auth.test.mjs`)은 위치를 유지한다 |
| 잘못된 입력·중복·stale | 기존 응답과 쓰기 없음, 멱등 재등록, 충돌 결과를 공개 서비스에서 검사 |
| 경합·부분 실패 | 기존 잠금 순서·isolation·retry를 변경하지 않고 실제 DB 경합·rollback 검증 |
| 응답 유실·재제출 | 연결 변경 리허설과 실행 커서 통합 테스트로 기존 복구·중복 수락 계약 확인 |
| 사용량·만료 시각 | 기존 DB clock과 window 기준을 유지; 실행 재개에 새 사용량을 부과하지 않음 |
| import 초기화 | DB 없는 parser/factory import와 실제 Next production build를 별도로 검사 |
| 타입·ambient declaration | 타입 참조도 모듈 검사에 포함; `auth/next-auth.d.ts` 위치·내용 유지 |
| 테스트·스크립트 참조 | literal dynamic import, VM mock 키, 소스 경로, 빌드 chunk 정규식(`loadProjectRepository`), seed 파서 경로까지 검색하고 해당 시험·리허설을 실행 |
| 로그·관측 문구 | 서버 로그 문구를 바꾸지 않는다. 이동하는 파일에 있는 것은 `project-availability:`(`entitlement.ts`), `project-availability:use-project:`(`project-availability.ts`), `request-rate:limited`(`request-rate-limit.ts`), `Token usage recording failed`(`token-usage-query.ts`)다. 위치를 유지하는 파일에 있는 것은 `agents/next.ts`의 `account-usage:limited`·`agent_next: outcome transaction failed`·`agent_next: run `(접두어, 뒤는 템플릿 값), `github repositories unavailable`(`github.ts`), `HARNESS_PUBLIC_URL is not set`(`public-url.ts`)다. 이 아홉 개가 2026-10-16 서버 구현 파일의 `console` 호출 전부다(`git grep -n -E 'console\.[a-z]+\(' -- src/server ':!*.test.*'`, 11줄; `github.ts`는 같은 문구 3줄). 이동 후 V-INVENTORY의 `Find-SmodReferences`에 각 문구를 `[regex]::Escape`한 값과 `src/server`를 전달해 미추적 목적지에서도 새 소유 파일을 확인한다. 함께 이동하는 `token-usage-query.test.ts`와 위치를 유지하는 `public-url.test.mjs`가 두 문구를 단언한다 |
| 자산·브라우저 상태 | 자산 URL·localStorage·UI 상태 모델은 변경 범위 밖; Next 실제 페이지 결과는 회귀 확인 |
| Server Action 등록 | 이동 대상에 `"use server"` 파일이 없음. FSD action 파일은 위치를 바꾸지 않는다. V-NEXT에서 node·edge manifest 전체의 `(runtime, filename, exportedName)` 집합을 전후 대조하며 무작위 build key나 Action ID의 바이트 동일성을 요구하지 않음 |

모듈 이동은 새로운 취소·timeout·백그라운드 실행 수명주기를 추가하지 않는다.
기존 transaction timeout과 예외 후 rollback 동작을 보존하며 실행 결과가 불명확한
호출을 새 정책으로 자동 재시도하지 않는다.

확인한 항목(제안서 템플릿 기준, 2026-10-16 재대조):

- [x] 앱 진입점과 라우팅 경계: route·page 파일 위치와 URL은 바뀌지 않는다. `src/app` 23개 파일과 `src/proxy.ts`는 import만 바뀐다.
- [x] 정적 `import` / `export from`: 서버 내부 190건을 제안 배치에 대입했다. 서버 밖 100개 파일을 셌다.
- [x] dynamic `import()` 또는 lazy loading: 서버 구현 파일 사이에는 없다. 리허설 4개(`rehearse-acceptance-failure`, `rehearse-repository-disconnection`, `rehearse-src-clean-code`, `rehearse-src-clean-code-fifth-pass`)에 문자열 dynamic import 7곳이 있고, `public-url.test.mjs`에 위치가 바뀌지 않는 상대 경로 1곳이 있다. `rehearse-src-clean-code-fifth-pass.ts` 343행의 `typeof import("../src/server/pipeline/board")`는 실행되지 않는 타입 질의지만 같은 경로 문자열이므로 함께 바꾼다. 계산된 dynamic import는 `rehearse-multiple-pipelines-browser.mjs`의 fixture 경로뿐이며 서버 경로가 아니다.
- [x] barrel export 경유 참조: `export *`를 금지한다. `pipeline/board.ts`의 factory 재수출과 `pipeline/run.ts`의 재수출 전용 파일을 정리한다.
- [x] 테스트와 스크립트 참조: VM mock 키, 소스 경로, 빌드 chunk 정규식, 운영·seed·리허설 스크립트를 위 검사와 V-INVENTORY로 다룬다.
- [x] 정적 자산 URL 또는 `public` 직접 접근: `src/server`에는 `public/` 자산 참조가 없다. 화면·자산은 바뀌지 않는다.
- [x] 타입 선언, 전역 선언, ambient module: `auth/next-auth.d.ts`는 위치와 내용을 유지한다. 모듈 밖 공유 타입은 `contracts.ts`로 옮기고, 타입 참조도 방향 검사에 포함한다.
- [x] 런타임 side effect 또는 초기화 코드: DB singleton(`db.ts`)과 `server-only` 표식을 주입형 API에서 분리한다. 모듈 초기화 때 생기는 singleton 보드 서비스(`pipeline/board.ts`)는 runtime 경로로만 공개한다.
- [x] API, localStorage/sessionStorage, analytics, 외부 SDK: REST·MCP 응답 계약과 MCP SDK·NextAuth·Prisma 사용 방식은 바뀌지 않는다. 브라우저 저장소와 analytics는 서버 범위 밖이다.

## Approval

승인 기록의 단일 기준은 front matter다. 최초 문서 검증 요청과 이후의 실제 코드 수정
요청을 구분한다. 후자의 명시적 요청에 따라 구현과 로컬 검증을 진행한다.

## Execution Plan

아래는 제안된 순서다. 승인된 전체 구현 범위 안에서는 단계별 검증을 통과하며
연속 진행할 수 있다. 일부 단계만 요청받았다면 그 범위에서 끝낸다.
모든 단계는 하나의 통합 가능한 변경으로 완성하며 중간 구조를 별도 운영 배포하지 않는다.

### Phase P0: 기준 상태와 경계 계약 고정

- status: Completed locally.
- satisfies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004, REQ-SMOD-005
- preserves: INV-SMOD-001, INV-SMOD-002, INV-SMOD-003
- governed-by: CON-SMOD-001, CON-SMOD-002, CON-SMOD-003, CON-SMOD-004, CON-SMOD-005
- entry criteria: 구현 요청의 범위와 사용자 변경을 포함할 기준 상태 확인.
- exit criteria: 기준 검증 결과, 이동 목록, 공개 symbol 목록, ADR·서버 경계 문서 준비.
- verifies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004, REQ-SMOD-005

#### TASK-P0-01: 작업 트리·소비자·회귀 기준 확정

- satisfies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004
- preserves: INV-SMOD-001, INV-SMOD-002, INV-SMOD-003
- governed-by: CON-SMOD-003, CON-SMOD-004, CON-SMOD-005
- implementation destination: 이 문서의 기준 상태·배치표, 신규 구현 브랜치의 변경 목록. 서버 경로를 참조하는 외부 파일(2026-10-16: 100개), 내부 참조 시험 후보(46개), 모듈별 공개 symbol 후보(142개)를 구현 기준 리비전에서 다시 측정한다.
- change intent: 문서 보완; 이 작업에서 제품 동작을 바꾸지 않음.
- verification destination: V-STATIC, V-UNIT, V-DB, V-NEXT의 변경 전 기준; V-INVENTORY.
- stop condition: 미커밋 변경의 반영 기준이 불명확하거나 기준 테스트 실패를 이번 변경과 구별할 수 없음.

#### TASK-P0-02: 아키텍처 계약과 검사 fixture 정의

- satisfies: REQ-SMOD-005
- governed-by: CON-SMOD-001, CON-SMOD-002, CON-SMOD-005
- implementation destination: 제안된 ADR(`docs/ADR/0003-server-module-boundaries.md`)·`docs/architecture/server.md`, 신규 서버 검사기·fixture.
- change intent: create; 현행 README·verification 연결은 최종 배치와 일치하도록 갱신.
- verification destination: V-BOUNDARY의 허용·거절 fixture와 공개 경로 목록 대조.
- stop condition: 문서의 허용 방향에 맞지 않는 실제 의존을 예외로 덮어야 하거나, public API가 runtime 초기화를 누출함.

### Phase P1: 얕은 배치와 필요한 책임 분리

- status: Completed locally; depends on: TASK-P0-01, TASK-P0-02.
- satisfies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004
- preserves: INV-SMOD-001, INV-SMOD-002, INV-SMOD-003
- governed-by: CON-SMOD-001, CON-SMOD-002, CON-SMOD-003, CON-SMOD-004, CON-SMOD-005
- entry criteria: 기준·매핑·공개 API 계약이 확정됨.
- exit criteria: 파일 배치 완료, 혼합 책임 분리, 소비자 갱신, 단위·binding 회귀 통과.
- verifies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004

#### TASK-P1-01: 파일·테스트 이동과 이름 정리

- satisfies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004
- preserves: INV-SMOD-001, INV-SMOD-002, INV-SMOD-003
- governed-by: CON-SMOD-001, CON-SMOD-003, CON-SMOD-004, CON-SMOD-005
- implementation destination: 파일 배치표의 모든 source·대응 테스트, app/FSD/스크립트의 기존 참조.
- change intent: move / rename / import update; 가능한 이동은 책임 분리와 구분되는 diff로 유지.
- verification destination: V-INVENTORY, V-STATIC, V-UNIT. 특히 CLI·FSD source를 읽는 이동 시험의
  상대 URL 세 값과 실제 파일 내용, 배치표 전체의 old-absence·new-presence를 확인한다.
- stop condition: 테스트가 기존 glob에서 사라지거나 이름 변경에 외부 계약 변경이 필요해짐.

#### TASK-P1-02: 혼합 책임과 singleton 의존 분리

- satisfies: REQ-SMOD-001, REQ-SMOD-003, REQ-SMOD-004, REQ-SMOD-005
- preserves: INV-SMOD-002, INV-SMOD-003
- governed-by: CON-SMOD-001, CON-SMOD-002, CON-SMOD-004, CON-SMOD-005
- implementation destination: owner/user 조회, runbook 분리와 singleton 기본값 제거, templates 파서, projects의 workspace 계약, `rest/response.ts`, 각 공개 API, `agents/runs.ts`의 주입 경계와 `server-only` 표식 제거, `pipeline/run.ts` 대체, 공개 진입점 시험 `tests/server/server-public-api.test.ts`(create).
- change intent: split / create / import update.
- verification destination: V-UNIT, V-BOUNDARY, V-STATIC, V-DB의 templates·client-runtime·agent-runs.
- stop condition: 업무 코드가 transport를 import하거나, 연결 없는 API를 읽는 테스트에 실제 DB·환경 설정이 필요해짐.

### Phase P2: 유스케이스 캡슐화와 최종 검증

- status: Completed by user request after implementation and local verification; remote CI remains follow-up; depends on: TASK-P1-01, TASK-P1-02.
- satisfies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004, REQ-SMOD-005
- preserves: INV-SMOD-001, INV-SMOD-002, INV-SMOD-003
- governed-by: CON-SMOD-001, CON-SMOD-002, CON-SMOD-003, CON-SMOD-004, CON-SMOD-005
- entry criteria: 재배치·주입형 공개 API가 단위·binding 검증을 통과함.
- exit criteria: 웹 등록의 내부 조립 의존 제거, 검사기 CI 연결, 전체 필수 검증과 실제 Next 경로 확인 완료.
- verifies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004, REQ-SMOD-005

#### TASK-P2-01: 프로젝트 등록 공개 서비스로 호출 통합

- satisfies: REQ-SMOD-001, REQ-SMOD-002
- preserves: INV-SMOD-001, INV-SMOD-003
- governed-by: CON-SMOD-002, CON-SMOD-004, CON-SMOD-005
- implementation destination: `projects/registration-service.ts`·옆 신규 시험, `projects/api.ts`, `projects/api.server.ts`, `rest/project-registration.ts`, FSD create-project server adapter. 위 공개 symbol·등록 보존 표를 따름.
- change intent: create / modify; 기존 transaction 조립·오류 처리를 각 등록 유스케이스로 이동.
- verification destination: V-UNIT의 registration-service·project-registration·token binding,
  V-DB의 project-registration·project-connection·token-management, V-NEXT 등록 경로.
  웹·Next의 내부 조립 잔존은 V-INVENTORY의 `Assert-SmodAbsent`로
  `withAvailabilityTransaction|registerProjectResultIn|registerProjectIn`을 `src/fsd`·`src/app`에서
  검사한다(현재 기준선: `create-project.server.ts`의 3줄). 미추적 파일도 대상이며 검색 오류는 실패다.
- stop condition: 웹/REST의 slug·충돌·재시도·초기 token 노출 동작이 기준과 달라지거나 원자성이 나뉨.

#### TASK-P2-02: 경계 강제와 통합 회귀·현행 문서 정렬

- satisfies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004, REQ-SMOD-005
- preserves: INV-SMOD-001, INV-SMOD-002, INV-SMOD-003
- governed-by: CON-SMOD-001, CON-SMOD-002, CON-SMOD-003, CON-SMOD-004, CON-SMOD-005
- implementation destination: 신규 검사기, `package.json`, architecture 문서, 루트 `README.md`·`AGENTS.md`의 명령 목록, ADR-0003(`proposed`→승인 시 `accepted`), 내부 참조 시험 목록 확정, 남은 소비자·테스트·스크립트 경로와 옛 파일 이름 주석.
- change intent: modify / create; 기존 루트 경로의 임시 forwarding 파일은 최종 변경에서 제거.
- verification destination: V-INVENTORY, V-BOUNDARY, V-STATIC, V-UNIT, V-DB, V-NEXT.
- stop condition: 필수 검증 실패·미실행, 설명되지 않는 모듈 순환, 사용자 변경 유실, blanket 예외 필요.

## Verification Plan

구현 전 기준과 구현 후 결과를 같은 조건에서 비교한다. 아래 실행 계획의 현재 결과는
Verification Results의 승인 후 구현 표에 기록한다. 필요한 실패·경합 사례가 기존 테스트에 없으면 해당 테스트에 행위 중심
회귀를 추가한다. 단순 파일 이동 자체를 검증하기 위한 중복 단위 테스트는 만들지 않는다.

### 최종 산출물과 본문 검증 목적지

모든 route 위치와 우선순위는 유지한다. 아래 최종 응답의 본문·의존 데이터까지 검사하며
경로 존재나 HTTP status만으로 통과시키지 않는다. 템플릿 원문·운영 데이터 대신 기존 격리
fixture를 사용한다. 새로운 자산·폰트·schema·migration은 만들지 않는다.

| 최종 산출물 | 이동 후 본문 소유자·의존성 | 필수 검증 목적지 |
| --- | --- | --- |
| `GET /api/project` | 기존 route → `rest/api.server`의 identity 바인딩 → `project-identity-handler`; token scope·access·repository DTO | V-UNIT의 handler·token-usage binding, V-DB의 project-connection: 정상 repository key 집합·401/403 정보 비노출·429 body/header |
| `GET /api/templates` | 기존 route → `rest/templates`·`templates-handler` → `templates/api`·불변 core deliverable; Template fixture | V-UNIT의 `rest/templates-handler.test.ts`·`rest/harness-init.test.ts`, V-DB의 templates·client-runtime: 스텁/플랜별 본문·언어/클라이언트·runtime metadata·거절 시 무조회 |
| `POST /api/runbook` | 기존 route → `rest/runbook`·`runbook-handler`; scope·access·제한·version 기록 | V-UNIT의 `rest/runbook-handler.test.ts`·token binding, V-DB의 project-connection: `{ok:true}`·version/lastSyncedAt·401/403/400/429 |
| `POST /api/projects` | 기존 route → `rest/project-registration` → `projects/registration-service`; 커밋 뒤 현재 project snapshot | 등록 보존 표 + V-DB·V-NEXT: 200/201 project 본문, 403/409 사유와 실제 reconnectPath, 429 metadata/Retry-After |
| agent/owner MCP | 기존 두 route → `mcp/api`·`mcp/api.server`; 주입형 pipeline/agents·인증·계정 제한 | 기존 tools·owner-tools/auth 시험, V-DB의 project-connection/client-runtime/request-rate-limit: 15개 agent·1개 owner 도구 집합, `isError` text JSON·범위 거절·실제 원장 |
| 웹 등록·기존 화면 Action | 기존 FSD 파일·directive → 공개 runtime API; 세션·입력·사용량/트랜잭션·기존 UI 결과 변환 | V-UNIT의 실제 adapter binding, V-NEXT의 `/p/new` 성공과 기존 Inbox·연결·토큰 응답 유실 회복. 평문은 신규 등록 성공에서만 노출 |
| Server Action manifest·Client bundle | fresh `.next/server/server-reference-manifest.json`의 node/edge registry와 동일 build chunk; Next 16.3.3의 directive·server-only 규칙 | V-NEXT의 전체 정규화 tuple 집합 전후 대조 + 기존 opt-in manifest 시험, V-STATIC의 build·FSD 검사. raw Action ID·암호화 key는 비교/기록하지 않음 |
| 실제 CLI 시험·slug 동기화 시험 입력 | 이동 후 시험 파일 기준의 CLI 파일, server slug source, FSD slug source | 위 상대 경로 표 + V-INVENTORY 파일 해석, V-UNIT: 실제 CLI 생성물·HTTP·plan/stub 규약과 두 source의 상수 내용 |
| 경계 검사·문서 규칙 | `package.json`의 verify:server/lint/check, 새 검사기와 `server.md`·ADR/기존 architecture 연결 | V-BOUNDARY·V-STATIC: JSON scripts 구조·CI 경로 필터·fixture 결과·현행 public symbol/내부 참조 목록 |

### V-INVENTORY: 파일·소비자 완전성

- verifies: REQ-SMOD-001, REQ-SMOD-004, REQ-SMOD-005
- destination: 아래 PowerShell 명령, 배치표·테스트·공개 symbol/소비자 대조.
  `git diff --name-status`와 `git status --short`는 보조 자료다. `git grep`은 index 밖의 새 파일을
  보지 않으므로 이동 후 내용 검사의 근거로 쓰지 않는다. `rg`는 미추적·ignored source까지 검사하되
  generated·dependency·build 폴더를 제외한다. 명령은 저장소 루트에서 실행한다.

  ```powershell
  function Find-SmodReferences([string]$Pattern, [string[]]$Paths) {
    & rg --hidden --no-ignore -n --glob '!**/generated/**' --glob '!**/node_modules/**' --glob '!**/.next/**' -e $Pattern -- @Paths
    if ($LASTEXITCODE -ge 2) { throw "Source search failed: $LASTEXITCODE" }
  }
  function Assert-SmodAbsent([string]$Pattern, [string[]]$Paths) {
    $smodHits = @(Find-SmodReferences -Pattern $Pattern -Paths $Paths)
    if ($smodHits.Count -gt 0) { $smodHits; throw 'Forbidden references remain' }
  }
  $smodPaths = @('src', 'tests', 'scripts', 'docs/architecture', 'docs/conventions', 'AGENTS.md', 'README.md', 'CONTEXT.md')
  rg --files --hidden --no-ignore src/server
  if ($LASTEXITCODE -ne 0) { throw 'Server file inventory failed' }
  git status --short
  # 1) 서버 밖의 모든 서버 경로 참조(import·mock 키·소스 경로·주석)
  Find-SmodReferences -Pattern '(@/server/|src/server/)' -Paths @('src/app', 'src/fsd', 'src/proxy.ts', 'tests', 'scripts')
  # 2) 삭제·이름 변경된 경로의 잔존
  Assert-SmodAbsent -Pattern '(@/server/|src/server/)(account-usage|account-usage-query|automatic-scout|client-bundle-query|codex-handoff-query|entitlement|harness-init|project|project-[a-z-]+|request-rate|request-rate-limit|rest-scope|runbook|runbook-query|scope-copy|templates|templates-query|token-[a-z-]+|user-scope-query|agents/(steps|run-query)|mcp/project-(query|sync-query)|pipeline/(board-query|run-query|run|definition-save-query|pipeline-settings-query|lock-query))([^a-z/-]|$)' -Paths $smodPaths
  # 3) 경로 없이 적힌 옛 파일 이름(코드 주석·VM mock 키·현행 문서; 새 구조에서 사라지는 이름만)
  Find-SmodReferences -Pattern '(^|[^A-Za-z0-9_])(project-access-query|project-availability-service|project-connection-service|project-identity-query|project-registration-query|project-slug-rule|request-rate-limit|rest-scope|scope-copy|templates-query|token-management-query|token-usage-query|user-scope-query|definition-save-query|pipeline-settings-query|lock-query|board-query|run-query|project-query|project-sync-query|run\.ts)([^A-Za-z0-9_]|$)' -Paths $smodPaths
  # 웹·Next는 transaction 내부 등록을 직접 조립하지 않는다.
  Assert-SmodAbsent -Pattern 'withAvailabilityTransaction|registerProjectResultIn|registerProjectIn' -Paths @('src/fsd', 'src/app')
  ```

  위 absence 검사는 구현 뒤에만 통과해야 한다. 기준선에서는 해당 source가 남아 있으므로 의도적으로
  실패한다. `rg`의 무일치(exit 1)는 정상으로 처리하지만 잘못된 경로/정규식 등 exit 2 이상은
  실패시킨다. 2)의 접두어는 `@/server/` 또는 `src/server/`로 한정해, 유지하는
  `tests/server/project-registration.test.ts` 같은 시험 경로를 옛 구현 경로로 오인하지 않는다.
  3)의 앞뒤 경계는 ASCII 문자 class로 써서 이름 바로 뒤에 한글이 붙은 "board-query의"·
  "run.ts는"도 찾는다. 2)와 3)은 과거 제안·보고서와 `docs/ADR`를 보지 않는다.
  새 ADR이 배경으로 옛 경로를 적는 것은 정상이다.
  3)은 새 구조에서도 이름이 남는 파일(`account-usage-query`, `client-bundle-query`, `codex-handoff-query`,
  `project-token-service`, `templates/runbook-query`)을 빼고 센다. 코드 주석에는 옛 파일 이름이 많이 남아 있다.
  예: `agents/runs.ts`의 "board-query.ts(closeRuns)", `mcp/tools.ts`의 "scope-copy.ts", FSD `turn.ts`의
  "board-query.ts resetRun", `pipeline/run-rules.ts`·`pipeline/run-query.ts`·`mcp/deps.ts`의 "run.ts",
  `project-identity.ts`의 "PROJECT_GET_SELECT(project-query.ts)". 이동 후 이런 주석은 없는 파일을 가리키므로
  새 파일 이름으로 함께 고친다. 가리키는 파일 이름이 새 구조에도 남지만 내용이 다른 파일로 갈라져서,
  검색으로는 찾을 수 없는 주석도 두 곳 있다.
  `mcp/tools.ts`의 "runbook.ts runbookStale"은 `runbookStale`이 `templates/runbook-query.ts`로 가므로 고친다.
  `runbook.ts` 머리 주석의 "runbook-query.ts"는 REST 처리를 가리키므로 `rest/runbook-handler.ts`로 고친다.

- 과거 `git grep` 기준선(2026-10-16): 1)은 102개 파일, 2)는 84개 파일의 195줄, 3)은 103개 파일의 229줄이다.
  이것은 위 `rg` 명령의 새 측정값이 아니다. 3) 중 현행
  문서는 `system-overview.md` 55·57·58·133행과 `verification.md` 374행이다. `verification.md` 374행의
  `request-rate-limit`은 이름이 바뀌지 않는 통합 시험 파일을 가리키므로 그대로 둔다.
- expected observation: 루트 구현 36개가 이동·분리·유지 중 하나에 대응하고, 모든 기존 테스트가 목적지에서
  발견되며 실행 명령의 검색 패턴에 포함된다. 최종 `src/server` 루트에는 `db.ts`, `database-clock.ts`,
  `github.ts`, `public-url.ts`, `public-url.test.mjs`, `result.ts`만 남는다. 옛 경로의 임시 forwarding 파일은
  남지 않는다. 1)의 각 줄은 다음 중 하나다.
  - 공개 진입점, 루트 기반 파일, auth 공개 경로.
  - 내부 참조 시험 목록의 항목.
  - 주석 속 경로. 실제로 존재하는 파일을 가리켜야 한다. 기준선에서 위치가 바뀌지 않는 파일을 가리키는 주석은
    `scripts/lib/prisma.ts`, `src/fsd/shared/routes/projects.ts` 두 곳이다.
  - 검사기 시험의 가상 경로: `scripts/verify-fsd-boundaries.test.mjs`의 `src/server/pipeline/board.ts`,
    `scripts/project-availability-runtime.test.ts`의 `src/server/example.ts`와 아래에서 새 경로로 바꾸는 표시용 파일명.
  - UI 예시 문자열: `src/fsd/features/edit-backlog/ui/backlog-form.tsx`의 Area placeholder `src/server/pipeline`.

  VM 로딩 시험마다 dependency 키 목록을 그 시험이 불러오는 모듈의 실행되는 import 지정자와 대조한다.
  각 지정자는 실제 적용되는 mock 또는 의도한 실제 모듈 해석 중 하나로 분류한다. 공용 fixture가 여러
  모듈을 읽어 키를 공유할 수 있으므로 키와 단일 파일의 1:1 일치를 요구하지 않는다. 어느 로딩에도 쓰이지
  않는 옛 키는 제거하고, mock을 의도한 import가 실제 모듈로 조용히 빠지지 않는지 호출 assertion으로 확인한다.
  type-only import는 VM 실행 의존성에 포함하지 않는다. 2)는 0줄이다.
  `scripts/project-availability-runtime.test.ts`가 `violations()`에 넘기는 파일명
  `src/server/project-registration-query.ts`는 판정에 쓰이지 않는 표시값이다. 그래도 2)에 걸리므로 새 경로로 바꾼다.
  3)의 결과는 모두 분류한다. 허용되는 것은 `verification.md`의 migration 주의 문장과 새 `server.md`의
  내부 참조 목록이 **유지하는** `tests/server/integration/request-rate-limit.test.ts`를 가리키는 경우다.
  이 시험 파일의 존재와 의미를 확인하며, 삭제된 구현 `request-rate-limit.ts`에 대한 참조는 허용하지 않는다.
  나머지는 새 이름으로 고친다. 모든 상대 파일 읽기는 위 URL 표와 실제 filesystem으로도 대조한다.
- state: Executed (2026-10-19); see approval-following implementation results.

### V-BOUNDARY: 모듈·공개 API·초기화 경계

- verifies: REQ-SMOD-005
- destination: 제안된 `npm run verify:server`, `npm run test:architecture`, 제안된 `tests/server/server-public-api.test.ts`.
- expected observation: 실제 트리 통과. "자동 경계 검사"의 검사 대상마다 음성 fixture를 하나 이상 두고, 모두 실패한다: 다른 모듈과 외부 소비자(`src/app` 등)의 private 상대/alias import, 허용 표에 없는 방향의 값·type import, 모듈 순환, 문자열 literal dynamic import·require의 private 경로, 정적 접두어가 서버 경로인 템플릿 문자열 dynamic import, `api.ts`·`contracts.ts`에서 runtime API·`db.ts`·`server-only` 파일로 가는 직접·간접(같은 모듈 재수출 포함) 참조, `export *`·`export type *`·contracts의 runtime export, 루트 기반 파일의 기능 모듈 import, 모듈 내부의 자기 `api.ts`·`api.server.ts` 참조, 조립부가 아닌 서버 파일의 다른 모듈 `api.server.ts` 참조, 목록에 없는 시험의 내부 참조, 더 이상 쓰이지 않는 목록 항목. 양성 fixture인 공개 진입점 참조, 모듈 내부 상대 참조, 직접 정의 contracts의 내부 타입 참조, auth 공개 경로와 위 내부 조립 두 간선, 허용된 runtime 조립, 목록에 있는 시험의 내부 참조는 통과한다. 이 양성/음성 조합을 tracked·미추적 파일 양쪽에서 검사하고, 명시하지 않은 auth의 제3 내부 공개 간선은 거부한다.
- import 검증: 공개 주입형 parser/factory의 import closure에 singleton 초기화와 `server-only` 표식이 없음을 검사한다. `npm run test:web`(bootstrap 없음)과 `scripts/lib/template-seed-query.ts`가 `api.ts`를 그대로 읽는 것으로도 확인한다. 이 실행 확인이 유효한 이유: `server-only` 패키지는 Next 밖의 일반 Node에서 import 즉시 throw하고(2026-10-16 설치본 확인), singleton 초기화 경로(`db.ts`, `pipeline/board.ts`, `auth/config.ts`→`db.ts`)는 모두 `server-only` 표식 파일을 지난다. runtime entry는 기존 `register-server-only.mjs` bootstrap 아래 주입 fixture로 검증하고, 실제 framework 연결은 V-NEXT로 확인한다.
- 실행 위치: `tests/server/server-public-api.test.ts`는 `npm run test:server`로만 실행되고 `check` workflow에는 없다. `check` workflow(`.github/workflows/check.yml`, 2026-10-16)가 실행하는 것은 `npm run check`(`lint`에 연결할 `verify:server`와 `test:architecture` 포함), `npm test`, `npm run test:web`(위 import 검증의 실행 확인), `npm run build`(client bundle의 `server-only` 검사)다. `test:server`·`test:server:integration`과 리허설은 로컬의 V-UNIT·V-DB·V-NEXT 절차에서만 실행된다.
- state: Executed (2026-10-19); see approval-following implementation results.

### V-STATIC: 기존 정적·빌드 게이트

- verifies: REQ-SMOD-001, REQ-SMOD-005
- destination: `npm run verify:fsd`, `npm run check`, `npm run build`.
- setup: 새 worktree에서는 CI(`.github/workflows/check.yml`)와 같이 `npm ci` 뒤 `npm run db:generate`를 먼저 실행한다. `src/generated/prisma`는 gitignore되어 있어 이 단계 없이는 `check`의 `tsc --noEmit`이 실패한다(2026-10-16 실측). `build`는 DB URL이나 `.env`가 필요 없다.
- CI 목적지: 이 변경은 `package.json`을 바꾸므로 PR에서 `check` workflow와 함께 `windows-role-runtime` workflow도 실행된다. 그 workflow의 경로 필터에 `package.json`이 있다. 그 workflow는 Windows 역할 경로(Webpack)로 전체 프로젝트를 다시 빌드한다. 기본 `npm run build`(Turbopack)와 다른 bundler이므로 별도 목적지다. 최초 계획에서는 완료 조건이었으며, 사용자의 완료 처리 요청에 따라 이번 구현 기록에서는 미실행 후속 검증으로 남긴다. 원격 CI 통과를 의미하지 않는다.
- expected observation: FSD 방향·서버 경계·ESLint·Next typegen·TypeScript·architecture 검사 통과. `check`의 plugin 복사본 검사도 기존 기준과 일치한다. 새 module 경로·ambient 타입·서버 초기화가 production build에서 해석된다.
- state: Executed locally; remote PR CI not executed (follow-up).

### V-UNIT: 단위·binding·seed 회귀

- verifies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004
- destination: `npm test`, `npm run test:web`, `npm run test:server`, `npm run test:project-availability`, `node --import tsx --test scripts/template-seed-query.test.ts`.
- expected observation: 이동한 인접 테스트, MCP 도구·인증·문구 잠금, REST scope·handler, 커서·파서, registration·token·usage binding의 기존 assertion이 유지된다. seed 검증이 실제 DB나 private 원문 없이 기존 fixture로 실행된다. 시험 수가 기준선보다 줄지 않는다(이동한 시험이 검색 패턴에서 빠지지 않음). VM 로딩 시험(`tests/server/*-bindings.test.ts` 등)이 새 import 지정자의 mock을 실제로 사용한다(키와 지정자 대조는 V-INVENTORY). 등록 보존 표의 부족했던 오류·재시도·재조회 assertion은 신규 `projects/registration-service.test.ts`와 기존 두 adapter binding에 포함한다. `rest/harness-init.test.ts`는 올바른 CLI를 실행하고 `projects/slug-rule-sync.test.ts`는 실제 server/FSD source의 상수를 읽어야 한다.
- 기준선(2026-10-16, `ba8f4e9`, 새 worktree): `npm test` 402개(통과 400·skip 2), `npm run test:web` 637개 통과, `npm run test:server` 135개(통과 134·skip 1), `npm run test:project-availability` 18개 통과, `template-seed-query.test.ts` 4개 통과.
- state: Executed (2026-10-19); see approval-following implementation results.

### V-DB: 실제 트랜잭션·transport 회귀

- verifies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004
- destination: `npm run test:server:integration`.
- setup: 기존 스크립트가 검증하는 별도 `stagekeeper_test_*` DB의 `TEST_DATABASE_URL`. `.env`의 `DATABASE_URL`과 host·port·database가 달라야 한다. 운영 URL과 분리된 환경을 사용한다. 로컬 PostgreSQL이 없으면 포터블 PostgreSQL을 루프백 포트에 띄우고 빈 `stagekeeper_test_*` DB를 만든다. 러너가 `migrate deploy`를 먼저 실행한다.
- 핵심 기존 파일(`tests/server/integration/` 아래): `project-registration.test.ts`, `project-connection.test.ts`, `project-sync.test.ts`, `token-management.test.ts`, `token-usage.test.ts`, `account-usage.test.ts`, `request-rate-limit.test.ts`, `agent-runs.test.ts`, `board.test.ts`, `automatic-scout.test.ts`, `templates.test.ts`, `client-runtime.test.ts`. 같은 이름의 `tests/server/project-registration.test.ts`는 DB 없는 REST binding 시험이며 V-UNIT에 속한다.
- 기준선(2026-10-16, `ba8f4e9`): 격리 PostgreSQL 18.4에서 `npm run test:server:integration` 통과(exit 0, 77초). 러너는 시험 수를 출력하지 않는다.
- expected observation: 소유자 잠금 경합·rollback·stale·재제출·실행 사용량 원자성·토큰 폐기·MCP/REST 계약 통과. 전체 integration suite에서 새 회귀가 없다.
- state: Executed (2026-10-19); see approval-following implementation results.

### V-NEXT: 실제 Next 진입점·응답 유실

- verifies: REQ-SMOD-001, REQ-SMOD-002, REQ-SMOD-003, REQ-SMOD-004
- 전체 Action 집합: TASK-P0-01의 **변경 전 fresh build**와 최종 **변경 후 fresh build**에서 아래
  함수를 같은 조건으로 실행한다. 기존 manifest 시험은 일부 Action만 검사하므로 이 전량 대조를
  대신하지 않는다. `filename`은 repository-relative source 경로이고 slash만 정규화한다.
  경로와 export 이름의 대소문자는 보존하며 집합 생성·비교 모두 대소문자를 구분한다.
  명령 회귀 fixture는 동일 집합은 통과하고 export 이름 또는 파일 경로의 대소문자만 바꾼
  집합도 실패하는지 확인한다. `createProject`와 `createproject`는 서로 다른 symbol이다.
  metadata가 없는 행이나 예상하지 못한 파일 경로는 생략하지 않고 실패한다. raw manifest의
  encryption key·무작위 Action ID를 출력하거나 저장하지 않는다.

  ```powershell
  function Read-SmodActionSet {
    $smodManifest = Get-Content -Raw -Encoding UTF8 -LiteralPath '.next/server/server-reference-manifest.json' | ConvertFrom-Json
    $smodActions = @(foreach ($smodRuntime in @('node', 'edge')) {
      $smodRegistry = $smodManifest.$smodRuntime
      if ($smodRegistry -isnot [pscustomobject]) { throw 'Invalid action registry' }
      foreach ($smodProperty in $smodRegistry.PSObject.Properties) {
        $smodEntry = $smodProperty.Value
        if ($smodEntry.filename -isnot [string] -or $smodEntry.exportedName -isnot [string]) { throw 'Action metadata missing' }
        $smodFilename = $smodEntry.filename.Replace('\', '/')
        if (-not $smodFilename.StartsWith('src/') -or [string]::IsNullOrEmpty($smodEntry.exportedName)) { throw 'Unexpected action source' }
        "$smodRuntime|$smodFilename|$($smodEntry.exportedName)"
      }
    })
    if ($smodActions.Count -eq 0) { throw 'Empty action registry' }
    $smodActions | Sort-Object -Unique -CaseSensitive
  }
  # P0의 변경 전 build 뒤 한 번 저장하고, 경로를 구현 검증 기록에 남긴다.
  $smodActionBaseline = Join-Path ([IO.Path]::GetTempPath()) ('stagekeeper-smod-actions-' + [guid]::NewGuid().ToString('N') + '.json')
  ConvertTo-Json -InputObject @(Read-SmodActionSet) | Set-Content -Encoding UTF8 -LiteralPath $smodActionBaseline
  # 최종 변경 후 build 뒤, 위 baseline 경로를 유지한 같은 shell에서 실행한다.
  $smodActionDelta = Compare-Object -CaseSensitive -ReferenceObject @(Get-Content -Raw -LiteralPath $smodActionBaseline | ConvertFrom-Json) -DifferenceObject @(Read-SmodActionSet)
  if ($smodActionDelta) { $smodActionDelta; throw 'Server Action registration changed' }
  ```

- destination: fresh `npm run build` 뒤 아래 순서로 실행한다.
  1. `SRC_CHECK_INBOX_MANIFEST=true RDC_CHECK_ACTION_MANIFEST=true npm run test:server`: 새 build manifest의 Server Action 등록 집합과 Inbox 경계를 검사한다. 이 환경변수 접두는 Git Bash 형식이다. PowerShell에서는 [검증 문서](../../architecture/verification.md)의 "src 클린코드 3차 인수"처럼 `$env:`로 두 값을 설정하고, 실행한 뒤 `Remove-Item Env:`로 지운다.
  2. `scripts/rehearse-repository-disconnection.ts --transport-loss`: 끝까지 자동으로 실행된다.
  3. `scripts/rehearse-account-usage-and-tokens.ts`: `--interactive` 없이 실행하면 자동으로 끝난다.
  4. `scripts/rehearse-src-clean-code.ts --render-faults`: 시작 때 build chunk에서 Inbox 내용·wrapper·`loadProjectRepository` 로더 정규식을 찾는다. 준비 메시지가 나온 뒤 `http://127.0.0.1:55452/owner`로 fixture 세션을 열고, 실제 `/p/new`에서 저장소 URL을 넣어 "Project created"를 확인한다. 마지막에 `/finish`로 정리한다.
  5. integration의 REST 등록 대조군: `tests/server/integration/project-registration.test.ts`(V-DB).
- 실행 방식: 리허설은 `node --import ./tests/server/register-server-only.mjs --import tsx` 뒤에 해당 script와 인자를 전달한다. `TEST_DATABASE_URL`은 V-DB와 같은 격리 DB다. 2~4는 `.env` 없는 새 worktree에서 `TEST_DATABASE_URL`만 지정하고 `DATABASE_URL`은 비운 채 실행된다(2026-10-16 확인). 루프백 포트는 55438·55452 등을 쓴다.
- setup: [검증 문서](../../architecture/verification.md)의 격리 DB·fixture·세션·fresh build 조건. 필요한 환경값만 자식 프로세스에 전달한다. V-DB를 먼저 실행해 migration을 적용한다.
- expected observation: 웹 등록·연결·토큰과 REST/MCP의 허용/거절 결과가 기준과 같고, 커밋 후 응답 유실에도 기존 복구 결과를 유지한다. 새 Server Action 노출이 없고(1), Client bundle에 서버 코드가 유입되지 않으며(build의 `server-only` 검사와 `verify:fsd`의 `"use client"` import 검사), `--render-faults`의 세 정규식이 그대로 일치한다. 함수 이름이나 호출 모양이 바뀌어 정규식이 깨지면 같은 변경에서 리허설 정규식을 고치고 이유를 기록한다.
- 기준선(2026-10-16, `ba8f4e9`, 새 worktree·격리 PostgreSQL 18.4): 1은 143개 통과. 2·3은 exit 0과 각 리허설의 통과 문장. 4는 세 정규식 일치·준비 메시지, 실제 `/p/new`의 "Project created", `/finish` 뒤 exit 0.
- cleanup: 기존 리허설의 종료 경로와 fixture 정리를 사용하고 일시 계측 산출물을 최종 코드·배포물에 포함하지 않는다. `--render-faults`는 build chunk를 원본 바이트로 되돌린다. 실제 등록 화면의 토큰은 격리 DB의 fixture이며 `/finish`가 지운다. 브라우저 도구의 스냅숏 파일에 남은 토큰도 지운다. 인수 후 fresh build와 전체 Action 대조·opt-in manifest 시험을 다시 실행해 일시 계측이 최종 산출물에 남지 않았음을 확인하고 자기 Action baseline 파일을 정리한다.
- state: Executed (2026-10-19); see approval-following implementation results.

## Verification Results

### 2026-10-19 승인 후 구현

기준 HEAD는 `ba8f4e9cb89b05855000dc8bda41e271076af0ca`다. 살아 있는 원격 `dev`·`main`이
그 리비전을 가리킴을 확인하고 `harness/server-module-reorganization`을 만들었다.
문서 대조 때의 결과와 아래 구현 후 결과를 구분한다. 중간 경로 이동·mock·fixture 오류는
수정 후 관련 suite를 재실행했으며 최종 로컬 실패는 없다. 원격 CI는 아래 별도 미실행 항목이다.

| Verifier | 실행·결과 |
| --- | --- |
| V-INVENTORY | 이동·대체 매핑 63개 모두 옛 파일 부재·목적지 존재 확인. 실제 source AST의 옛 서버 지정자 0개. 새 모듈 공개 값·타입 128개 모두 제품 소비자 있음(auth·루트 기반 API 제외). 내부 참조 시험은 최종 41개 파일·60개 파일/모듈 행으로 등록. 미추적 파일도 검사 |
| V-BOUNDARY | `npm run verify:server`, `npm run verify:fsd` 통과. 새 서버 검사기 허용·거절 fixture 38개 통과. auth 두 간선·직접 정의 contracts·미추적 파일·타입 방향·초기화 closure·정확한 시험 목록 검증 |
| V-STATIC | `npm run check` 통과: ESLint, 두 경계 검사, typegen, tsc, architecture 84개(82 pass·기존 환경 opt-in skip 2), project-availability 18개 pass. 최종 `npm run build` 통과 |
| V-UNIT | `npm test`: 402개(400 pass·기존 skip 2). `npm run test:web`: 644개 pass(기준 637 + 등록 서비스 회귀 7). `npm run test:server`: 139개(138 pass·기존 manifest opt-in skip 1). seed-query 4개 pass. 이동한 CLI·slug source 비교 시험 포함 |
| V-DB | 새 루프백 PostgreSQL 18.4·별도 `stagekeeper_test_smod_20261019`에 runner가 migrate deploy 후 전체 integration 실행, exit 0. 기존 `.env` DB와 host/port/database 분리. 운영 DB·schema·migration 변경 없음 |
| V-NEXT | 변경 전 fresh build와 인수 후 다시 만든 fresh build의 전체 Action tuple 31개 동일(대소문자 구분). 비교 명령 fixture의 동일 집합·export 대소문자·경로 대소문자·서로 다른 case의 dedup 검증 통과. 최종 두 manifest opt-in을 켠 `test:server` 147개 pass |
| V-NEXT transport | `rehearse-repository-disconnection.ts --transport-loss`, `rehearse-account-usage-and-tokens.ts` 모두 exit 0. 커밋/감사 1회·stale 재실행·읽기 전용 이력·세 토큰 수명주기·인증/요청 제한·플랜 본문 검증 |
| V-NEXT browser | `rehearse-src-clean-code.ts --render-faults`의 세 chunk 정규식 일치·준비 메시지 확인. Playwright로 fixture 세션의 실제 `/p/new`에서 저장소 URL을 제출해 `Project created` 확인. GitHub fixture 계정의 저장소 목록 404는 기존 URL 직접 입력 경로로 처리. `/finish` exit 0, fixture 정리·chunk 원본 복구 후 최종 fresh build와 Action/manifest 재검사 통과 |
| 로컬 인수 시점 미실행 | 원격 PR `check`·`windows-role-runtime`. 로컬 `check`와 별도다. 로컬 인수 완료 시점에는 커밋·push·PR·배포 전이었다. 미실행 사실을 안내한 뒤 사용자가 완료 처리를 요청해 후속 검증으로 남김 |

파일 이동 외의 본문 변경은 등록 유스케이스 캡슐화, DB 주입 조회·런북 helper·HTTP 응답 분리,
agents의 주입형 보드 factory, WorkspaceInput 소유권 이동이다. 기존 서버 구현 67개를
import/re-export·주석·줄바꿈을 제외하고 대조했을 때 60개 본문은 그대로이며, 나머지 7개는
이 분리 대상과 일치했다. 기존 transaction command·가용성/연결 writer의 본문은 보존했다.

공개 후보 중 `DISCONNECTED_REASON`·`ProjectIntegrityError`는 등록 오류 처리를 projects 내부로
옮긴 뒤 모듈 밖 제품 소비자가 없어져 공개 API에서 제외했다. 시험은 등록된 내부 참조로
검증한다. 새 공개 경로를 테스트 편의 때문에 넓히지 않는 규칙을 적용한 결과다.
현행 규칙·공개 symbol·소비자와 시험 목록은 `docs/architecture/server.md`, 선택 이유는
ADR-0003(`proposed`, PR 승인 대기)에 기록했다. 임시 forwarding 파일이나 blanket 예외는 없다.
최종 격리 DB 재실행도 exit 0이며 정리 뒤 사용자 행은 0개다. 자기 PostgreSQL 인스턴스를
종료했고, 최종 대조를 마친 임시 Action baseline을 삭제했다. strict traceability와 Markdown 링크 검사도 통과했다.

### 구현 전 기준과 문서 대조 이력

아래 첫 표는 2026-10-16 기준선 검증 기록이다. 기준은 `ba8f4e9`이며 그 커밋의 새 worktree에서
실행했다. 2026-10-18 문서 대조의 실행 결과는 다음 별도 표에 기록한다. 두 날의 실제 코드 HEAD는 같다.

| 상태 | 점검 | 결과·한계 |
| --- | --- | --- |
| Executed | 아키텍처·지침·테스트 배치 규칙·ADR-0002·소스·소비자·스크립트 읽기 | 현행 파일·경계·검증 명령을 확인했다. |
| Executed | 서버 AST 정적 참조 추출 | 구현 67개, 내부 선언 190건, 타입 전용 47건. |
| Executed | 제안 배치 모형 | 허용 방향 위반 0건, 모듈 순환 0건. 분리 없이 파일명대로만 옮기면 일곱 모듈이 한 순환으로 묶인다. |
| Executed | 외부 참조·시험 내부 참조 측정 | 외부 참조 파일 100개(텍스트 검색 102개). 내부 참조 시험 후보 46개, 공개 symbol 후보 142개. |
| Executed | V-INVENTORY 검색 명령 기준선 | 1) 102개 파일, 2) 84개 파일 195줄, 3) 103개 파일 229줄(현행 문서 다섯 줄). `MSYS_NO_PATHCONV=1` 없이는 1)이 0건임을 확인했다. 3)의 이전 판(이름 18개, `\b` 경계)은 100개 파일 215줄이었다. 한글이 바로 붙은 `inbox-item.ts`의 주석을 놓쳤고, `project-query`·`project-sync-query`·`run.ts`는 찾지 않았다. |
| Executed | 기준선 V-STATIC | `npm ci`, `npm run db:generate` 뒤 `verify:fsd`·`test:architecture`·`check`·`build` 모두 exit 0. `db:generate` 없이는 `check`가 exit 2(생성 client 없음). |
| Executed | 기준선 V-UNIT | `npm test` 402개(skip 2), `test:web` 637개, `test:server` 135개(skip 1), `test:project-availability` 18개, `template-seed-query.test.ts` 4개. 실패 0. |
| Executed | 기준선 V-DB | 격리 PostgreSQL 18.4(루프백)에서 `npm run test:server:integration` exit 0. |
| Executed | 등록 내부 조립 검색 기준선 | `withAvailabilityTransaction`·`registerProjectResultIn`·`registerProjectIn`이 `src/fsd`·`src/app`에서 `create-project.server.ts`의 3줄. 로그 문구 9개(서버 구현 파일의 `console` 호출 전부, 11줄)는 `git grep`으로 현재 위치를 확인했다. |
| Executed | 기준선 V-NEXT | manifest 포함 `test:server` 143개 통과. `--transport-loss`·계정 사용량 리허설 exit 0. `--render-faults` 정규식 일치. 실제 `/p/new` 등록 "Project created" 확인 뒤 `/finish` exit 0. |
| Executed | `validate_sdd_traceability.py --strict docs/proposals/active/server-module-reorganization.md` | 재대조 편집 뒤 PASS. 정의는 REQ 5, INV 3, CON 5, TASK 6개이고 요구사항 5개가 모두 Phase/Task와 verifier에 연결된다. 설치된 `write-sdd-spec/scripts/validate_sdd_traceability.py`를 사용했다. |
| Not executed | `windows-role-runtime` CI | 외부 CI 단계라 로컬에서 실행하지 않았다. 구현 PR에서 확인한다. |
| Not executed | 구현 후 V-INVENTORY부터 V-NEXT | 구현 요청 전이며 제품 코드를 변경하지 않았다. 위 기준선은 명령과 준비 절차가 그대로 실행된다는 증거일 뿐 변경 후 통과의 증거가 아니다. |

문서의 의미 검토에서는 기존 아키텍처 우선권, 얕은 배치, transport와 업무 코드의
분리, DB 주입·초기화 경계, 등록 경로별 동작 차이, transaction 원자성, 작업 트리
보존과 단계별 검증 연결을 대조했다. 문서 검증 결과를 코드 검증의 통과로 대체하지 않는다.

2026-10-18 전체 대조에서는 처음부터 개선점이 없었던 것이 아니다. 다음 충돌·누락을
확인하고 요구사항·배치·실행 단계·검증 목적지·완료 조건에 반영했다.

| 점검 | 현재 코드/실행 증거 | 문서에 반영한 해결 |
| --- | --- | --- |
| 범위·소유권·공개 API | 서버 추적 파일 104개, 구현 67개, 내부 정적 선언 190건(타입 전용 47). 배치 모형의 허용 방향 위반 0 | 필요한 공개 symbol·정의/재수출/기본 연결·실제 소비자와 새 등록 usecase를 명시. 제품 소비자가 없는 공개 API는 만들지 않음 |
| auth와 자기 공개 API 금지의 충돌 | `guard.ts → ./index`, `config.ts → ./config.base`가 실제 코드에 존재 | 집계 API 금지·직접 정의 contracts·정상 auth 두 조립 간선을 구별하고 양성/음성 fixture에 전파 |
| 이동 시험의 상대 파일 읽기 | `new URL` 해석 probe: 기존 literal을 새 위치에 적용하면 `src/plugin/...`, `src/server/fsd/...`라는 없는 파일을 가리킴 | CLI·server source·FSD source의 새 상대 경로와 본문 시험 목적지를 고정 |
| 검색의 미추적 파일 누락·오탐 | 격리 Git fixture에서 `git grep`은 새 source를 못 찾아 exit 1, `rg`는 발견. 옛 경로 패턴은 유지하는 `tests/server/project-registration.test.ts`도 오탐 | filesystem/rg 기반 전체 검사, search error와 무일치 구분, 정확한 구현 경로 접두어, VM의 실제 실행 의존성별 분류 |
| 등록 failure/retry와 본문 목적지 | 기존 코드의 실제 함수를 격리 VM으로 호출한 6개 probe 통과: 웹 P2002 1회, REST 2회/최종 전파·재조회 소실/해제·integrity/busy | 부족한 assertion의 신규 service 단위 시험과 기존 adapter binding 목적지 고정. 기존 DB 경합 시험과 혼동하지 않음 |
| 기존 동작 회귀 | auth config/public-routes, project-guard, token issuance/REST registration binding, registration command·availability service의 기존 시험: 110 pass, 실패/skip 0 | 변경 전 source 근거로만 기록. 변경 후 V-UNIT·V-DB·V-NEXT의 통과를 대신하지 않음 |
| 최종 framework 산출물 | 설치된 Next 16.3.3의 use-server/server-only·route guide, 실제 manifest parser·기존 fixture/test/CI와 목적지 대조 | 전체 Action tuple 전후 대조와 응답별 본문/의존 데이터 표. 현재 build sample을 fresh build 인수로 간주하지 않음 |

새 PowerShell 검색·manifest snippet, 상대 링크·front matter·REQ–Task–verifier 연결은
이 수정본을 저장한 뒤 다시 실행/검증한다. 최종 clean-pass 여부는 최신 저장본에 대한
별도 무편집 INV-1–INV-7 대조 결과로 보고하며, 편집한 패스 자체를 clean pass로 기록하지 않는다.

2026-10-19의 새 전체 대조에서도 개선점 한 가지를 재현했다. 위 Action 집합 명령의 기존
`Sort-Object -Unique`·`Compare-Object`는 기본적으로 대소문자를 구분하지 않아, 실제 export
`createProject`를 `createproject`로 바꾼 격리 manifest에서도 차이를 0건으로 판정했다.
집합 생성과 비교에 각각 `-CaseSensitive`를 추가하고, 이름·경로의 대소문자 변경과
대소문자만 다른 두 export의 중복 제거를 검증하는 fixture를 최종 명령 대조에 포함한다.
이는 검증 명령의 누락을 고친 것이며 제품 코드나 Action 등록을 변경한 것이 아니다.

## Risks and Rollback

| 리스크 | 대응·중단 조건 |
| --- | --- |
| 미커밋 작업과 파일 이동 충돌 | Phase P0에서 기준·사용자 변경을 고정한다. 소유가 불명확한 diff는 제거하거나 자동으로 이관하지 않는다. |
| barrel이 DB·인증 초기화를 확장 | 주입형/runtime entry 분리, 전이적 import 검사와 실제 build로 검증한다. |
| 타입만 옮겨도 모듈 역의존 발생 | 타입도 공개 계약과 방향 검사에 포함하고 WorkspaceInput·PipelineEntry 등 필요한 계약의 소유자를 유지한다. |
| 같은 transaction이 여러 호출로 분리 | 잠금·retry·원장 동작을 기준과 대조하고 V-DB가 통과하기 전 완료하지 않는다. |
| 소스 문자열·dynamic import 경로 누락 | V-INVENTORY의 세 검색으로 VM mock 키·소스 경로·dynamic import·문서를 찾고, 해당 시험·리허설을 실제로 실행한다. 상대 지정자 mock 키는 실제 모듈로 조용히 넘어갈 수 있으므로 키와 지정자를 함께 바꾼다. |
| 시험 편의로 공개 API 확장 | 공개 여부를 제품 소비자로만 정하고, 시험·리허설의 내부 참조는 파일 단위 목록으로 관리한다. |
| Turbopack은 통과하지만 Windows 역할 Webpack 빌드가 실패 | PR의 `windows-role-runtime`에서 별도로 확인한다. 이번 사용자 요청에 따른 문서 완료 처리는 이 CI의 통과를 보증하지 않는다. Runtime cache가 없으면 실행이 길어질 수 있다. |
| 별도 활성 제안이 오래된 경로를 참조 | 의미를 임의로 재작성하지 않고 영향 목록에 기록해 후속 작업이 새 서버 문서를 기준으로 경로를 재조정하게 한다. 기준 코드의 다른 활성 문서에는 현재 서버 경로 변경 대상이 없었다(`investigations/active/harness-platform.md`의 `apps/web/src/server`는 옛 설계 기록). `multiple-pipelines.md`의 옛 active 사본은 이미 정리되었다. 착수 시 미추적 문서를 포함해 다시 확인한다. |

롤백 단위는 이 리팩터링의 파일 이동·소비자 갱신·경계 설정을 함께 포함하는 변경이다.
실패한 일부 경로만 구형으로 되돌려 두 구조를 영구 공존시키지 않는다. 커밋 전에는
자신이 만든 변경만 되돌리고, 커밋 후에는 해당 리팩터링 커밋을 역적용한다. 사용자
작업을 포함하는 전체 reset·clean은 사용하지 않는다. 데이터 형식·migration을 바꾸지
않으므로 DB 보정은 롤백 절차에 포함하지 않는다. 복구 후 정적·단위·관련 integration을
다시 확인한다.

## Implementation Readiness

아래는 구현 착수 때 적용한 선행 조건이다. 문서의 대조 통과와 구현 검증을 구분한다.
최초 계획의 원격 CI 완료 조건은 후속 사용자 요청에 따라 PR 인수 단계로 남겼다.

| 시점 | 조건 | 미충족 시 처리 |
| --- | --- | --- |
| 제품 코드 편집 전 | 사용자 구현 요청, 살아 있는 dev 기반, 미커밋 변경의 기준 확정 | 문서 작성 범위를 넘어 실행하지 않음 |
| 모듈 이동 전 | Phase P0의 소비자·public symbol 목록과 변경 전 테스트 기준 확보 | 누락을 해결한 뒤 이동 |
| Next 관련 코드 편집 전 | 설치된 `node_modules/next/dist/docs/`의 해당 버전 guide 확인 | 추측으로 진입점·초기화 규칙을 변경하지 않음 |
| 구현 기록 완료 | V-DB·V-NEXT를 포함한 로컬 검증과 사용자 완료 처리 요청 | 원격 CI 미실행을 명시하고 통과로 기록하지 않음 |
| PR 인수 전 | 원격 `check`·`windows-role-runtime` 결과 확보 | 해당 CI 통과 전 PR 인수 완료로 간주하지 않음 |

2026-10-18에 동일 `ba8f4e9` 코드와 대조해 문서의 충돌·검증 누락을 고쳤다. 구현 시에는
살아 있는 원격 dev와 그때의 변경을 다시 확인한다. 그 당시의 요청은 문서 검증·개선이었다.
이후 명시적인 코드 수정 요청에 따라 승인 metadata를 채우고 구현했다. 원격 CI를 남긴
상태임을 안내한 뒤 받은 사용자 지시에 따라 구현 기록을 완료 처리했다. PR CI 인수와 구분한다.

## Completion or Closure Notes

제품 코드·테스트·현행 아키텍처 변경과 로컬 인수를 수행했다. 기준은 `ba8f4e9`이며
`harness/server-module-reorganization`에서 작업했다. 착수 전 제품 변경은 없었고 미추적
제안서를 보존했다. 코드 수정과 로컬 검증 완료 및 원격 CI 미실행을 안내한 뒤 사용자가
완료 처리를 요청했다. 이에 따라 `status: completed`, `stage: null`, 완료일을 기록하고
`completed/2026-10-19-server-module-reorganization.md`로 이동했다.

원격 `check`·`windows-role-runtime`은 실행하지 않았으며 후속 PR 인수에서 확인해야 한다.
문서 완료 처리는 커밋·push·PR·병합·배포 또는 CI 통과를 의미하지 않는다.

구현 완료 기준:

- 파일 배치표와 실제 구조가 일치하고, 기능별 하위 폴더를 불필요하게 추가하지 않았다.
- 웹 등록 호출부가 내부 transaction command를 직접 조립하지 않는다.
- 허용 방향·public API·초기화 검사와 기존 FSD 검사가 함께 강제된다.
- auth 두 내부 조립 간선·직접 정의 contracts의 정상 사용은 통과하고 다른 자체 집계 API 참조는 거부된다.
- 미추적 목적지를 포함한 source 검사와 이동 시험의 상대 파일 읽기·CLI/FSD 본문 검증이 통과한다.
- 등록 보존 표의 신규 실패·재시도·재조회 assertion을 구현 옆 시험과 실제 adapter에서 통과한다.
- `docs/architecture/server.md`의 내부 참조 시험 목록이 최종 트리의 검사 결과와 일치하고, 시험을 위해 넓힌 공개 symbol이 없다.
- 단위·binding·seed·DB 경합·실제 Next 검증 결과가 각 요구사항에 연결된다.
- 원격 PR의 `check`·`windows-role-runtime`은 미실행 후속 검증으로 명시하고 PR 인수 때 확인한다(사용자 완료 처리 요청 반영).
- 기존 트랜잭션·권한·응답·사용량·템플릿 계약과 사용자 변경이 보존되었다.
- 새 서버 규칙은 ADR·현행 architecture 문서에 기록되고, 임시 forwarding·미완료 예외가 남지 않는다.
- 전체 Action tuple 집합을 대소문자까지 구분해 전후 대조하고 응답별 최종 본문을 확인하며, 리허설 뒤 fresh build·manifest 재검사를 통과한다.

## Review Checklist

- [x] 모든 `{placeholder}`를 처리하고 완료 기록을 남겼다. 닫힘 기록은 해당 없다.
- [x] `status`는 `completed`이고 문서 위치(`completed/`)와 일치한다.
- [x] `stage`는 `null`이며 기존 구현 승인 기록(`approved-*`)을 보존했다.
- [x] `proposal-size`는 `standard`다. 5개 이상 파일 변경·barrel export·dynamic import·초기화 side effect에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 쓰고, 본문 Approval에는 메모만 둔다.
- [x] 변경 범위와 제외 범위가 명확하다(Scope).
- [x] 영향 파일별 작업과 판단 근거가 있다(파일 배치표, Affected Files).
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 확인했다(Safety Analysis의 확인한 항목).
- [x] 검증 명령과 성공 기준이 있고, 2026-10-16 기준선에서 로컬 명령을 실행했다(Verification Plan·Results).
- [x] 기존 실패와 신규 실패를 구분한다. 2026-10-16 기준선의 로컬 검증 실패는 0건이며, CON-SMOD-004가 구분 기록을 요구한다.
- [x] 잔여 리스크를 명시했다(Risks and Rollback, 미실행 CI 단계).
- [x] 완료 문서 항목: 구현·로컬 인수 결과와 사용자 완료 처리 요청, 원격 CI 후속 검증을 구분해 기록했다.
- [ ] 닫힌 문서 항목: 해당 없음.
