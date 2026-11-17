---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-12"
approved-by: "user"
approved-at: "2026-11-16"
approval-scope: "Phase ARCH 및 후속 승인된 MIGRATE 소스·배포·시험·CI·문서 전환과 검증, 2026-11-17 사용자 요청에 따른 ACCEPT의 GitHub CI-only 인수·기록·dev 병합·완료 문서 통합과 소유 작업 정리. 운영 승격 제외"
completed-at: "2026-11-17"
verification-summary: "ARCH·MIGRATE·ACCEPT 완료. PR #363 최종 head d5c6714의 check 941와 공유 배포 인수 4가 모두 성공했고 9937829로 dev에 병합됨. Windows x64·macOS arm64/x64 모델 없는 인수와 동일 제품 bytes의 Claude source 4개 leg PASS. 운영 승격·모델 기반 출시 gate는 별도"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/core.md"
  - "docs/architecture/github.md"
  - "docs/architecture/server.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/ADR/0005-organize-core-modules.md"
  - "docs/ADR/0007-share-github-url-modules.md"
---

# 공유 모듈 소유권과 플러그인 배포 경계 재설계

## Summary

공통 코드의 소유권과 플러그인 배포 경계를 분리한다. 플러그인에도 제공할 공통 계약·규칙은
`packages/shared`, 웹·서버가 공유하는 제품 규칙은 `packages/app-core`, 서버 전용 정책과
처리는 `src/server`, 플러그인 전용 구현은 `plugin/runtime`이 소유한다.
`plugin/lib`는 명시적으로 공개한 shared 모듈과 그 내부 의존성의 생성된 배포 복사본으로 유지한다.

ARCH 조사 당시 `packages/core`와 `packages/github`의 생산 `.mjs` 27개가 모두 복사됐다.
정적 의존성 조사에서는 플러그인 제품 코드가 직접 15개, 간접 의존성까지 17개를 참조했다.
그러나 이 17개에도 토큰 발급, 프로젝트 선택, 템플릿 release 제작처럼 서버가 소유할 처리가
섞여 있다. 전체 복사를 의존성 기반 복사로만 바꾸는 것으로는 소유권 문제가 해결되지 않는다.

따라서 책임을 먼저 나누고, 공개·배포 계약을 명시한 뒤 그 범위에서 패키징을 자동화한다.
최종 배포 파일 수를 17개로 고정하지 않는다. 함수 분리로 파일 수는 늘 수 있다.
완료 기준은 변경 영향과 배포 필요성을 소유 영역에서 판단할 수 있고, 기존 제품 동작과
설치 호환성을 보존하는 것이다.

Phase ARCH의 아키텍처·ADR·전환 목록 문서화를 완료했다.
[현재 공유 경계](../../architecture/shared-modules.md), [ADR-0008](../../ADR/0008-separate-shared-module-distribution.md),
[ARCH 완료 기록](./2026-11-16-shared-modules-and-plugin-distribution-phase-arch.md)을 따른다.
후속 사용자 승인으로 MIGRATE 구현·검증을 완료했다. ACCEPT는 2026-11-17 시작했다. 모델을 쓰지 않는
인수 항목과 BLK-SMB-01은 통과했고, 양 OS의 watch·session·background 실제 실행만 남았다([ACCEPT 실행 결과](#accept-실행-결과)).
전체 제안은 pending으로 유지한다.
실행 상태는 [MIGRATE 상세 기록](./2026-11-17-shared-modules-and-plugin-distribution-phase-migrate.md#migrate-execution-results)을 따른다.

## Goal

- 앱 전용 규칙을 바꿨을 때 플러그인 배포물이 불필요하게 달라지지 않는다.
- 공통 계약과 서버·플러그인 구현을 다른 변경 이유에 따라 유지한다.
- 공개 경로와 배포 범위를 명시적으로 정하고, 의존성 검사는 그 결정을 검증한다.
- 새 코드의 위치와 배포 여부를 지속적으로 판단할 규칙을 architecture에 남긴다.
- 현재 동작·입출력·오류·해시·인증·권한·실행 상태를 보존한다.

## Proposal Size

`proposal-size: standard`, 작성 모드 `WHOLE_SDD`, 위험도 `STANDARD`다.
원본 27개와 소비자·시험·타입·검사·배포가 함께 바뀌며 소스 위치와 공개 경로의 삭제·이동을
포함한다. 인증·권한·프로토콜의 의미는 바꾸지 않지만 소스 이동과 배포 누락은 설치 실패로
이어질 수 있으므로 호환성·패키징 검증을 포함한다.

## Current State

### ARCH 실행 기준

실제 문서 실행은 최신 dev `a0993fcc0d94eed25094012e2716abc70774f61a`에서 격리된
`harness/shared-modules-arch-20261116`에서 수행했다. 시작 시 열린 PR은 0건이다.
27개 생산 원본의 바이트는 초안 기준과 같고, 최신 소비자·시험·문서·관리 worktree 규칙은 다시 읽었다.
현재 dev의 active `role-command-time-limit.md`, `template-release-acceptance-follow-ups.md`와
원래 작업 트리에 남아 있는 CI·verifier·scripts 제안의 차이를 확인했다. 이 작업은 그 구현을
선행하거나 복제하지 않는다. 원본 두 문서의 입력 해시와 작업 식별자는 ARCH 완료 기록에 남겼다.

### 초안의 관측 기준과 작업 트리

2026-11-12, 저장소 HEAD `eabd1381169a2692e9b29317c31047bbb4027c7d`,
브랜치 `harness/plugin-skill-contract-plan`의 작업 트리를 읽었다.
열린 PR 조회 결과는 0건이었다. README·protocol, active/completed 제안서와 시험 보고서에
다른 작업의 변경·이동·미추적 파일이 있다. 이 문서는 그 변경을 수정·stage·정리하지 않는다.
후속 구현은 최신 dev와 관련 작업을 다시 확인하고 별도 작업 브랜치·격리 작업 트리에서 시작한다.
이 문서의 기준 revision이 이후 구현 revision을 대신하지 않는다.

현재 active 제안서 `ci-os-coverage.md`와 `claude-verifier-skill-namespace.md`를 확인했다.
전자는 시험 탐색·workflow·coverage 표, 후자는 플러그인 스킬의 경로·검증기 계약과 접점이 있다.
원본 문서들의 완료 여부를 추정하지 않고 구현 시작 시 현황과 이미 반영된 코드를 다시 대조한다.

### 코드·계약 대조

| 구분 | 확인한 근거 | 상태와 영향 |
| --- | --- | --- |
| 전체 복사 | [plugin-lib.mjs](../../../scripts/plugin-lib.mjs)의 `SOURCES`, `isDeliverable`, `sourceModules` | Observed. 두 원본 디렉터리의 비테스트 `.mjs` 전체가 배포 대상 |
| 실제 참조 | `plugin/bin`, `plugin/runtime`의 생산 모듈 39개와 shared 후보의 import·재수출 | Observed. 직접 15개 + 간접 2개. 현재 checkout에서의 정적 결과 |
| 경계 혼재 | `tokens/token.mjs`, `plans/entitlement.mjs`, `templates/release-manifest.mjs` | Observed. 공통 판정과 서버 처리가 같은 파일에 존재 |
| 단일 소비자 | `execution/watch.mjs`, `templates/manifest.mjs` | Observed. 제품 런타임 소비자가 플러그인뿐인 모듈도 core에 존재 |
| 패키징 | `scripts/windows/package-windows-plugin.mjs`, `scripts/macos/package-plugin.mjs` | Observed. Git 추적 plugin 파일을 선택해 native runtime·verifier와 함께 묶음 |
| 버전 판정 | `scripts/checks/verify-plugin-version.mjs` | Observed. 출하되는 plugin 파일 변경이 있으면 두 manifest의 높은 동일 버전 필요 |
| 원본 경계 | [core.md](../../architecture/core.md), [github.md](../../architecture/github.md), AGENTS | Contracted. 현재 두 원본 위치와 전체 복사를 규정. 새 구조와 충돌하므로 명시적인 변경 필요 |
| 검증 기반 | `package.json`, `verify-server-boundaries.mjs`, `plugin-lib.test.mjs` | Observed. Node test, TypeScript 파서, drift/orphan·읽기 전용 검사 기반이 이미 있음 |
| 설계 근거 | 사용처·변경 이유·독립 설치되는 플러그인의 호환성 | Inferred. 명시적 경계를 먼저 만들고 자동화가 따르게 하는 편이 장기 변경 범위를 좁힘 |

현재 직접·간접 참조가 없는 배포 후보는 `github/blob-url.mjs`,
`pipeline/{backlog,pipeline,run-input,transitions,work-selection}.mjs`,
`plans/usage-window.mjs`, `project-slug.mjs`, `request-rate.mjs`,
`tokens/token-validity.mjs`다. 미사용 판정은 이 checkout의 제품 코드 기준이며,
별도 배포 템플릿이나 기존 설치본의 참조까지 검증했다는 뜻은 아니다.

대화 중 원본 기반 의존성 계산을 메모리에서 시험했다. 생성된 lib를 읽지 않고 17개를
계산했고, 미사용 소스 변경은 결과를 바꾸지 않았으며, 새 직접·간접 참조는 포함되고
없는 모듈 참조는 실패했다. 이것은 선택 알고리즘의 가능성 확인이다.
아래의 최종 경계 설계·구현·양 OS 설치가 검증됐다는 근거로 확대하지 않는다.

## Scope and Decisions

포함 범위는 27개 원본 모듈의 소유권 대조, 혼합 책임 분리, 소비자·타입·시험 이동,
공개 경로·배포 명세, 경계 검사, 동기화·양 OS 패키징 연결, 관련 문서와 CI 탐색 경로 갱신이다.
비즈니스 규칙 재설계, DB migration, 새 인증 방식, OS 지원 확대, 독립 npm 출시,
별도 패키지 버전 체계, 번들 최소화·난독화, 전역 barrel, 신규 모델 실행 프레임워크는 제외한다.

| 선택지 | 결정 | 이유 |
| --- | --- | --- |
| 현재 두 원본 전체 복사 | 교체 | 앱 전용 정책까지 플러그인 출하 변경으로 연결됨 |
| 현재 파일을 유지하고 실제 import만 추적 | 최종 설계로 채택하지 않음 | 파일 내부의 서버 처리까지 배포되고, import 추가만으로 공개 범위가 확장됨 |
| 현재 17개/10개를 그대로 두 폴더에 배치 | 채택하지 않음 | 현재 파일 단위가 책임 단위와 일치하지 않음 |
| 책임 분리 + 명시적 공개·배포 계약 + 제한된 의존성 검사 | 채택할 목표 | 소유권과 배포 의도를 기록하면서 누락과 역방향 의존을 검사할 수 있음 |

## Requirements

### REQ-SMB-001: 앱 전용 변경의 배포 격리

WHEN app-core·서버·FSD 전용 정책만 변경되고 shared·플러그인 실행 코드는 동일하면,
동기화 결과의 `plugin/lib` 경로·바이트는 변경되지 않아야 한다(SHALL).

### REQ-SMB-002: 선언한 모듈의 완전하고 재현 가능한 배포

WHEN 유효한 공개 명세와 원본으로 동기화하면, 생성물은 선언한 실행 모듈과 필요한 내부
의존성만 포함하고 원본 상대 경로·바이트를 보존해야 한다(SHALL).
동일 입력으로 다시 실행하면 변경이 없어야 한다(SHALL).
IF 명세·참조·경로가 유효하지 않으면, 동기화는 기존 생성물을 변경하기 전에 실패해야 한다(SHALL).
`--check`는 항상 읽기 전용이며 누락·불필요한 모듈·내용 차이를 실패로 보고해야 한다(SHALL).

### REQ-SMB-003: 금지된 의존성과 런타임 유입 검출

WHEN 비공개 경로, 금지한 영역, 시험 전용 코드 또는 브라우저 경로에서 Node 전용 모듈을
참조하면, 기존 check에 연결한 경계 검사가 원인 경로를 제시하고 실패해야 한다(SHALL).

### REQ-SMB-004: 기존 제품 동작과 외부 계약 보존

WHEN 기존 유효·무효 입력, 인증·권한·플랜·토큰·설치 상태를 새 경로의 구현에 적용하면,
제품 결과·오류·허용/거부·부수효과와 CLI/HTTP/MCP 직렬화 결과가 보존되어야 한다(SHALL).
템플릿 canonical JSON·content/contract/surface hash·런북 버전의 계산 결과도 보존해야 한다(SHALL).

### REQ-SMB-005: 독립 배포·설치 호환성

WHEN Windows 또는 macOS에서 새 번들을 설치·초기화·실행하면, 저장소 원본이나 개발
의존성이 없는 환경에서도 선언한 설치 경로와 실행 기능이 동작해야 한다(SHALL).
WHEN 기존 지원 설치 플러그인이 새 서버와 통신하면, 기존 호환성 판정과 프로토콜 동작을
보존해야 한다(SHALL).

### REQ-SMB-006: 지속적인 아키텍처 판단 기준

WHEN 유지보수자가 architecture를 읽으면, 현행 구조와 적용 예정 구조, 코드 소유자,
공개 경로·의존 방향·배포 범위·전환 조건을 구분할 수 있어야 한다(SHALL).
전환 완료 후 현행 구조에 이전 전체 복사 규칙이 남지 않아야 한다(SHALL).

### REQ-SMB-007: 이동한 검증의 실행 보존

WHEN 모듈·시험이 새 위치로 이동하면, 대응 npm 명령과 CI가 시험을 계속 발견하고
원래의 환경별 검증 범위를 유지해야 한다(SHALL). 파일 이동 때문에 실행하지 않은 시험을
통과로 보고해서는 안 된다(SHALL).

### INV-SMB-001: 제품·데이터·권한 불변

프로젝트 식별자, 토큰 형식·발급 결과, 플랜 수치, 파이프라인 전이·선택 의미,
보고서 검증, 템플릿 식별·해시 규칙과 런타임 허용 권한을 바꾸지 않는다.
DB schema·저장 데이터·사용자 설정·설치본을 이 구조 변경의 부수효과로 수정하지 않는다.

### CON-SMB-001: 단일 원본과 명시적 소유권

한 규칙의 구현 원본은 하나다. 배포 복사본을 직접 편집하지 않는다.
순수 함수라는 이유만으로 공통 영역에 올리지 않으며, 독립적인 서버·로컬 처리를
공통 계약과 같은 파일에 남겨 배포하지 않는다. 관련 작은 함수는 책임 단위로 묶고
각 함수마다 별도 파일을 만드는 것은 요구하지 않는다.

### CON-SMB-002: 승인 범위와 기존 작업 보존

이번 요청은 이 문서 작성이다. 후속 구현 요청은 그때 지정된 범위에 적용하며 이미 받은
승인을 반복해서 묻지 않는다. 기존 dirty 작업을 stash·discard·stage하거나 다른 문서를
현재 승인 범위로 해석하지 않는다. main/dev 보호와 실제 출시 절차는 보존한다.

### CON-SMB-003: 실행 환경과 외부 의존

shared와 plugin 실행 코드는 설치된 Node에서 별도 TS 빌드 없이 실행되는 `.mjs`를 유지한다.
app-core도 우선 `.mjs`를 유지하여 이동과 언어 전환을 분리한다.
브라우저에서도 쓰는 모듈과 Node 전용 공통 모듈을 다른 공개 경로로 둔다.
shared에 외부 npm 의존성을 추가하거나 설치 플러그인에 TypeScript 파서를 넣지 않는다.

## Target Architecture

아래 경로는 새로 만들거나 이동할 **제안 경로**다. 현재 존재한다고 주장하지 않는다.

```text
packages/
  shared/
    plugin-exports.json
    configuration/workspaces.mjs
    execution/client-runtime.mjs
    execution/runner-contract.mjs
    plans/limits.mjs
    tokens/format.mjs
    qa/validation.mjs
    templates/
    github/repo-url.mjs
  app-core/
    projects/slug.mjs
    pipeline/
    plans/entitlement.mjs
    execution/runner-status.mjs
    tokens/validity.mjs
src/
  app/
  fsd/
  server/
    projects/
    tokens/
    usage/
    pipeline/
    runners/
    templates/
plugin/
  bin/
  runtime/
    configuration/
    execution/
    templates/
    qa/
  lib/
```

### 소유 영역과 의존 방향

| 영역 | 소유 기준 | 허용되는 제품 의존 |
| --- | --- | --- |
| `shared` | 앱과 플러그인이 공유하고 플러그인에도 배포하기로 명시한 계약·규칙 | 자신의 공개 모듈·내부 의존성, Node용 경로의 내장 모듈 |
| `app-core` | 웹·서버가 공유하는 앱의 순수 제품 계약 | app-core, shared 공개 경로 |
| `src/server` | 서버 전용 정책·IO·트랜잭션·등록 처리 | 현재 서버 모듈 경계, app-core·shared 공개 경로 |
| `src/fsd` | UI·표현·기능과 서버 adapter | FSD 방향, app-core·shared 공개 경로, server adapter의 서버 공개 API |
| `plugin/runtime` | 설치·로컬 실행·OS 처리·로컬 설정 | plugin 내부, 배포된 shared 공개 경로 |
| `plugin/lib` | shared의 생성된 실행 복사본 | 배포 내부 경로와 허용된 Node 내장 모듈 |

shared → app-core/src/plugin, app-core → src/plugin, 서버 → 플러그인 구현,
브라우저 → Node 전용 경로는 금지한다. scripts·tests는 별도의 제품 소유 영역을 만들지 않는다.
리허설·빌드 도구가 참조한다는 이유만으로 서버 또는 플러그인 전용 코드를 shared로 올리지 않는다.

shared는 범용 유틸리티 보관소가 아니다. 생산 모듈은 공개 배포 항목 또는 그 내부 의존성에
포함되어야 한다. 테스트·타입 선언·문서는 구현 옆에 둘 수 있으나 배포하지 않는다.
app-core 안에서도 단일 서버 책임에 귀속되는 처리는 서버로 옮긴다. 여러 앱 영역이 같은
권한·표현 계약을 함께 유지하는 경우는 app-core의 응집된 모듈로 둔다.

소비자는 제안 alias `@harness/shared/*`, `@harness/app-core/*`의 모듈 경로를 사용한다.
alias만으로 공개 여부가 강제되지는 않으므로 검사기가 공개 경로와 runtime을 대조한다.
전체 모듈을 섞는 barrel은 만들지 않는다. 서버로 옮긴 symbol의 외부 소비자는 기존
`api.ts`·`api.server.ts` 경계를 통과하고, 소스 위치만 바뀌었다고 초기화·DB 의존을 늘리지 않는다.

### 공개·배포 명세

제안 파일 `packages/shared/plugin-exports.json`은 `version: 1`과 `entries` 배열을 가진다.
각 항목은 shared 기준 상대 `path`와 `runtime: "universal" | "node"`를 선언한다.
배포 대상은 공개 entry와 shared 안의 실행 의존성이다. 내부 helper는 공개 entry가 아니며
영역 밖 소비자가 직접 import할 수 없다. 선언의 초기 전체 목록은 [shared-modules.md](../../architecture/shared-modules.md)에 14개 entry로 확정했다. 실제 JSON 생성은 MIGRATE다.
새 `.mjs`가 생겼다고 자동 공개하지 않으며, 공개 또는 내부 연결이 없는 생산 파일은 검사에서 거부한다.

출력은 `packages/shared/<relative>` → `plugin/lib/<relative>`로 고정한다.
자유로운 목적지 매핑·코드 변환·tree shaking은 도입하지 않는다.
universal entry의 전이 의존성에도 Node 내장 모듈이 없어야 하며,
node entry를 브라우저 실행 그래프에서 가져오면 실패해야 한다.

명세는 파일 수를 수동으로 이중 관리하는 목록이 아니라 공개 경로·실행 환경의 계약이다.
구현은 공개 entry부터 정적 import·재수출·문자열 리터럴 import의 내부 closure를 계산한다.
shared의 계산형 import/require와 선언되지 않은 외부 의존은 허용하지 않는다.
plugin 자체의 기존 동적 dispatcher·native asset 선택은 명시된 실행 소유자와 패키징 검증으로
보존한다. 이 제약을 이유로 기존 플러그인 동작을 제거하지 않는다.

### 동기화·패키징의 상태 처리

1. 명세, 공개 경로, 원본 존재, 상대 경로, 실행 환경, 전체 의존성을 먼저 검증한다.
   절대 경로·상위 경로 탈출·대소문자 충돌·배포 목적지 중복·허용하지 않은 symlink는 거부한다.
2. 완전한 복사·삭제 계획을 만든 후에만 lib를 변경한다. 원본·명세 누락 시 기존 파일을 지우지 않는다.
3. 정상 동기화는 drift를 복사하고 선언한 범위에서 벗어난 생성 `.mjs`를 제거한다.
   비생성 파일을 임의로 정리하지 않는다. `--check`는 같은 계획으로 읽기만 한다.
4. 쓰기 중 IO 실패는 성공으로 처리하지 않는다. check가 부분 상태를 드러내고 재실행으로
   같은 완전한 결과에 수렴해야 한다. 동시 writer를 지원하는 새 서비스는 만들지 않으며
   검증된 단일 checkout에서 생성·패키징한다.
5. Windows·macOS 패키저는 같은 lib 완전성 검사를 통과한 산출물만 묶는다.
   native runtime·권한·파일 mode·완전 verifier 복사·inventory/hash 처리는 보존한다.
6. 출하 파일의 공통 판정은 저장소 도구가 소유한다. 필요하면 현재 Windows 패키저의
   `isShippedPluginFile`을 제안 `scripts/plugin-files.mjs`로 옮겨 양 OS와 버전 검사에서
   공유한다. 이런 저장소 도구를 packages/shared에 넣어 플러그인에 배포하지 않는다.

## Source Migration Map

`core/`는 현재 `packages/core/`, `github/`는 현재 `packages/github/`를 줄여 쓴다.
모든 행은 이동·분리 대상의 설계이며 실행 완료 기록이 아니다.

| 현재 모듈 | 목표 소유자·제안 경로와 분리 기준 |
| --- | --- |
| `core/project-slug.mjs` | `app-core/projects/slug.mjs`. SLUG_MAX·SLUG_RE·RESERVED_SLUGS와 웹 문구/서버 이름 생성의 현재 분리 보존 |
| `core/pipeline/backlog.mjs` | `app-core/pipeline/backlog.mjs` |
| `core/pipeline/pipeline.mjs` | `app-core/pipeline/pipeline.mjs`. 공통 limits는 shared를 사용 |
| `core/pipeline/transitions.mjs` | `app-core/pipeline/transitions.mjs` |
| `core/pipeline/work-selection.mjs` | `app-core/pipeline/work-selection.mjs`. 서버 선택 결과와 UI의 읽기 계약 보존 |
| `core/pipeline/run-input.mjs` | 서버 전용 `src/server/pipeline/input-validation.ts` |
| `core/plans/entitlement.mjs` | 아래의 함수별 분리 표 적용 |
| `core/plans/usage-window.mjs` | `src/server/usage/usage-window.ts` |
| `core/request-rate.mjs` | `src/server/usage/request-rate-policy.ts`. 현재 request-rate adapter/service와 구분 |
| `core/tokens/token.mjs` | 형식·Bearer 해석은 `shared/tokens/format.mjs`, 생성·해시는 `src/server/tokens/token-crypto.ts` |
| `core/tokens/token-validity.mjs` | `app-core/tokens/validity.mjs`. 만료 입력·UI 표시·서버 검증의 동일성 보존 |
| `core/configuration/workspaces.mjs` | `shared/configuration/workspaces.mjs` |
| `core/configuration/harness-config.mjs` | `plugin/runtime/configuration/harness-config.mjs`. 서버도 쓰는 workspaces와 분리 |
| `core/execution/client-runtime.mjs` | `shared/execution/client-runtime.mjs` |
| `core/execution/runner.mjs` | 아래의 상태·메시지·서버 timing 분리 적용 |
| `core/execution/watch.mjs` | `plugin/runtime/execution/watch.mjs` |
| `core/qa.mjs` | QA_BROWSER_TOOLS·parseQaConfig는 `plugin/runtime/qa/config.mjs`, parseQaReport는 `src/server/pipeline/qa-report.ts`, 공통 text/httpUrl 검증은 `shared/qa/validation.mjs` |
| `core/templates/manifest.mjs` | hashOf·planWrites·mergeClientLock은 `plugin/runtime/templates/install-manifest.mjs` |
| `core/templates/release-manifest.mjs` | 아래의 공통 계약·해시와 서버 release 처리 분리 적용 |
| `core/templates/deliver.mjs` | `shared/templates/deliver.mjs` |
| `core/templates/codex-bundle.mjs` | `shared/templates/codex-bundle.mjs` |
| `core/templates/template-boundary.mjs` | `shared/templates/template-boundary.mjs` |
| `core/templates/render.mjs` | `shared/templates/render.mjs` |
| `core/templates/runbook.mjs` | 공통 버전 계산·형식은 `shared/templates/runbook.mjs`, 서버 저장 상태 판정은 기존 `src/server/templates/runbook-query.ts` 소유 |
| `core/templates/vars.mjs` | buildVars·buildWorkspaceVars·DEFAULT_SCOUT_QUESTION은 `shared/templates/vars.mjs`, buildReportTable·templateDescription은 `plugin/runtime/templates/metadata.mjs` |
| `github/repo-url.mjs` | `shared/github/repo-url.mjs`. GitHub 문법·허용 범위 보존 |
| `github/blob-url.mjs` | 현재 제품 소비자인 `src/fsd/entities/board-item/model/doc-link.ts`에 blobHref 통합. 기존 entity 공개 계약 유지 |

### 혼합 모듈의 분리

| 현재 symbol 그룹 | 목표 |
| --- | --- |
| PLANS·DEFAULT_PLAN·UNLIMITED·LIMITS·REPORT_AGENTS·isPlan·limitsFor·withinLimit·capReason, 양 client RESIDENT_RUNNER_PLAN_GATE | `shared/plans/limits.mjs`. 앱·플러그인의 공통 플랜 계약과 일치하는 거부 문구 |
| availableProjectIds·availabilityBasis·availabilityAfterPlanChange와 그 내부 정렬/검증 | `src/server/projects/availability-policy.ts` |
| capError·allowsAgent·historyCutoff·allowsSessionApprovals·OWNER_TOKEN_PLAN_GATE | `app-core/plans/entitlement.mjs`. 앱의 여러 소유 영역이 쓰는 순수 접근·표시 계약. OWNER 문구는 UI와 서버가 함께 사용하므로 UI에만 두지 않음 |
| TOKEN_KINDS·Bearer 형식·parseBearer | `shared/tokens/format.mjs`. 발급 측도 같은 prefix·형식 계약을 소비하도록 `tokenPrefix`를 공개 |
| newToken·hashToken | `src/server/tokens/token-crypto.ts`. DB 초기화 없는 공개 server 경로로 FSD 서버 Action·리허설 소비자를 연결 |
| runner의 상태 값·signal 필드 제한·limitedResult/limitedUntil 형식, time을 추출한 runnerTimestamp | `shared/execution/runner-contract.mjs` |
| idleInterval·runnerNextSignalAt·runnerSignalAt·runnerSilenceLimit·runnerStatus·holdsRunnerLease·needsAgentActivity와 판정 상수 | `app-core/execution/runner-status.mjs` |
| BEAT_WRITE_INTERVAL_MS·WORKING_BEAT_MS 등 서버 갱신 주기 | `src/server/runners/timing.ts`. 필드 제한·외부 메시지 형식과 구분 |
| TEMPLATE_PROTOCOL·TEMPLATE_CONTRACT·installationGuide·readTemplateContract·compatibleInstallation | `shared/templates/release-contract.mjs` |
| canonicalJson·manifestHash·deliverySurfaceHash | `shared/templates/manifest-hash.mjs`의 Node 공개 경로. 내용·줄바꿈·정렬·해시 보존 |
| normalizeTemplateRows·sourceKey·prepareTemplateRelease·selectTemplateLanguage·releaseDeliverable·installationFor | `src/server/templates/release-preparation.ts`. 기존 release 서비스/조회/HTTP adapter가 조합 |

Phase ARCH에서 아래 [전수 대응표](#arch-inventory)의 공개 심볼·private helper·타입·시험·소비자를 이 표와 대조했다. 여기서 목적지에 새 이름을 부여한 것은 설계 선택이며 기존 파일 존재의 주장이 아니다.
예상과 다른 제품 소비자가 발견되면 소유권과 공개 계약을 먼저 수정하고, 복제 구현으로 우회하지 않는다.
기존 `.d.mts`의 타입도 함수 소유자를 따라 분리하며 타입 전용 참조와 실행 참조를 구분한다.

## ARCH Inventory

이 절은 `a0993fcc0d94eed25094012e2716abc70774f61a`에서 확정한 **MIGRATE 입력**이다.
실제 파일 이동은 아직 없다. TypeScript 5.9.3 AST로 두 packages 아래 비테스트 `.mjs`를
전수 열거하고 src/plugin/scripts/tests의 정적 import·재수출·literal dynamic import·import-type을
연결했다. JSDoc typedef와 인접 `.d.mts`도 확인했다. 생산 원본 27개, 값 export 출현 175개
(의도된 재수출 포함), 최상위 private binding 49개, typedef/type 31개, 직접 참조 404건이다.
동적 계산 경로·문자열 fixture·glob·지침은 뒤의 별도 대응표로 확인했다.

### 대응표 읽기와 import 변환 규칙

각 모듈 절의 현재 export·private·타입은 전수 목록이다. 이름 변경을 쓰지 않은 심볼은
이름·입출력·오류를 보존한다. 함수 안의 지역 변수와 callback은 해당 함수와 함께 이동한다.
표의 목표 경로는 아직 존재하지 않는 **설계 경로**다. 값의 소유자가 나뉘면 현재 한 import를
그 그룹별로 나눈다. 현재 `*` namespace/dynamic import는 해당 모듈 전체 계약을 가리키므로
표의 전체 symbol을 기준으로 분리한다. `type`은 실행 의존성을 만들지 않는다.

| 목표 소유자 | 영역 밖 소비자의 MIGRATE import | 영역 안·검증 처리 |
| --- | --- | --- |
| shared 공개 | 앱 `@harness/shared/<상대 경로>`, plugin의 `lib/<상대 경로>`까지 상대 import | shared 내부 상대 import. 내부 template-boundary의 영역 밖 소비자는 deliver 공개 경로 사용 |
| app-core | 앱 `@harness/app-core/<상대 경로>` | app-core 내부 상대 import. plugin 생산 소비는 허용하지 않음 |
| server | `@/server/<모듈>/api`, 도구는 같은 `api.ts`의 상대 경로; 타입은 `contracts` | 같은 모듈 내부 상대 import. 기존 내부 시험은 registry/실행 환경을 함께 갱신 |
| plugin runtime | 현재 plugin 소비자의 위치에서 새 runtime 원본까지 상대 import | 앱 생산 소비 금지. plugin/lib의 옛 구현은 재생성으로 제거 |
| FSD doc-link | 기존 board-item public API와 같은 slice의 상대 경로 유지 | 기존 doc-link 재수출을 구현으로 통합, blob URL 시험을 기존 doc-link 시험에 합침 |

아래 소비자 경로는 현재 위치다. 그 소비자 자체가 원본인 경우 해당 모듈 절의 새 위치를 적용한다.
`plugin/lib/`의 참조는 생성물의 의존 간선이다. 수동 편집하지 않고 새 shared 원본의 의존으로
옮겨 sync 결과를 검증한다. 나머지 시험·리허설은 현재 위치에서 import/fixture만 전환한다.
server 테스트의 내부 import는 현행 registry 절차를 따르며 단순 이동을 위해 테스트만 쓰는
함수를 제품 façade에 공개하지 않는다.

인접 `.d.mts` 여섯 파일은 `pipeline/{pipeline,run-input,transitions,work-selection}`,
`qa`, `templates/release-manifest`다. 모든 값 선언 signature도 아래 값의 소유자를 따른다.
shared/app-core는 새 모듈 옆 `.d.mts`, server는 구현의 TypeScript 선언으로 옮긴다.
QA config는 plugin `.mjs`의 기능적 JSDoc으로 유지한다. 분리 후의 반환 타입과 기존 type-only
소비자를 typecheck와 pipeline-types 시험으로 확인한다. 타입의 중복 정의로 맞추지 않는다.

### 영역을 가르는 helper와 실행 시점

- `prefixOf → tokenPrefix`, `time → runnerTimestamp`, `text → qaText`, `httpUrl → qaHttpUrl`은
  실제 양쪽 소비가 있는 공개 추출이다. 이 네 helper 때문에 최종 공개 값은 59개다.
  QA validation entry를 포함해 14개 공개 entry와 template-boundary 내부 실행 파일 1개가 된다.
- `limitedResult`와 runner 상태 판정이 날짜 검증을 공유하고, QA config/report가 같은 text/URL
  검증을 쓴다. 원래 오류·trim·길이·밀리초 의미를 바꾸거나 각 소유자에 복제하지 않는다.
- `newToken`, `hashToken`은 `tokens/api.ts`에 공개한다. FSD Action·TS 리허설은 그 API를 사용한다.
  `scripts/rehearsals/rehearse-codex-macos.mjs`의 newToken은 기존 main 안의 TS 동적 import
  묶음에 넣는다. 실제 리허설은 기존 `--import tsx` 실행을 유지하고, plain Node에서 helper만
  import하는 시험에 TS/DB graph를 eager-load하지 않는다.
- `plugin/bin/harness-init-dual.test.mjs`의 newToken 사용은 그 시험이 소유하는 유효한 고정
  토큰 문자열로 대체한다. 시험 하나 때문에 서버 발급을 lib에 남기거나 server API를 plugin에
  연결하지 않는다. shared의 parseBearer 시험도 고정 형식 fixture를 사용한다.
  발급→파싱 roundtrip과 랜덤 고유성·hash 사례는 server/token-crypto 시험에서 shared를 소비해
  보존하며 기존 인증·발급 리허설을 유지한다.
- `pipeline/template-selection.ts`의 installationFor·selectTemplateLanguage는 templates/api를
  사용한다. MIGRATE는 pipeline → templates를 방향표·검사기에 추가하며 역방향은 허용하지 않는다.
  templates 내부 함수는 상대 import, 외부 seed/REST/리허설은 templates/api를 쓴다.
- 서버의 runbookIsStale은 runbook-query의 private helper가 되고 기존 runbookStale API를 유지한다.
  `scripts/rehearsals/rehearse-acceptance-failure.ts`도 templates/api의 `runbookStale`로 전환한다.
  현재 정상 version은 그대로 전달하고, stale 사례의 `"old-template"`은 그대로 reported에 넣으면
  stored version으로 fallback하므로 과거 본문의 유효한 `runbookVersion` 값으로 바꿔 불일치를 검증한다.
  원래 helper의 null·여러 언어·빈 목록·잘못된 저장값 사례는 `tests/server/runbook-stale.test.ts`의
  주입 DB를 통해 보존한다. 시험/리허설만을 위해 private helper를 새 façade API로 공개하지 않는다.
  TemplateRow·TemplateSource는 release-preparation 소유이며 외부 타입 소비가 생기는 경우에만
  templates/contracts에서 재수출한다. Installation·TemplateContract는 shared 소유다.


| MIGRATE에서 추가할 공개 server 값 | 현재 외부 생산 소비자 |
| --- | --- |
| `tokens/api.ts`: newToken | create-project·manage-user-token의 FSD 서버 Action, 기존 발급 리허설(파일별 목록 참조); macOS 리허설은 main 내부 동적 import |
| `tokens/api.ts`: hashToken | mcp/auth, rest/scope |
| `templates/api.ts`: releaseDeliverable | rest/runbook-handler, rest/templates-handler |
| `templates/api.ts`: selectTemplateLanguage | pipeline/template-selection |
| `templates/api.ts`: installationFor | pipeline/template-selection, rest/runbook-handler, rest/templates-handler |

나머지 이동 함수는 현재 생산 소비가 같은 server 모듈 안에 있으므로 새 façade export를 만들지 않는다.
`runbookIsStale`의 리허설 소비는 기존 `runbookStale`로 바꾸며 private helper 자체는 공개하지 않는다.

앱 외부의 scripts/tests는 새 소유 원본 또는 server façade까지의 상대 경로를 사용한다.
기존 alias 기반 fixture는 loader를 함께 전환한다. 실행 방식과 모듈 초기화 시점은 유지한다.

### 원본별 symbol·helper·타입·직접 소비자


#### packages/core/configuration/harness-config.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `parseHarnessConfig` | plugin runtime/Node — `plugin/runtime/configuration/harness-config.mjs`; 같은 이름 |
| private | `EXECUTORS`, `RELEASE_AUTH`, `fail`, `str`, `object` | plugin runtime/Node — `plugin/runtime/configuration/harness-config.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/configuration/harness-config.test.mjs`.
새 검증 목적지: `plugin/runtime/configuration/harness-config.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/configuration/harness-config.test.mjs` | import: `parseHarnessConfig` |
| `plugin/bin/harness-init.mjs` | import: `parseHarnessConfig` |
| `plugin/bin/harness-watch.mjs` | import: `parseHarnessConfig` |
| `plugin/runtime/mcp-client.mjs` | import: `parseHarnessConfig` |
| `plugin/runtime/template-installation.mjs` | import: `parseHarnessConfig` |
| `scripts/rehearsals/rehearse-acceptance-failure.ts` | import: `parseHarnessConfig` |
| `scripts/rehearsals/rehearse-dual-client-runtime.ts` | import: `parseHarnessConfig` |
| `tests/templates/private-template-release.test.ts` | import: `parseHarnessConfig` |

#### packages/core/configuration/workspaces.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `validateWorkspaceSemantics` | shared/universal — `packages/shared/configuration/workspaces.mjs`; 같은 이름 |
| private | `AGENT_ID_RE`, `fail`, `str`, `validateKnowledge` | shared/universal — `packages/shared/configuration/workspaces.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/configuration/workspaces.test.mjs`.
새 검증 목적지: `packages/shared/configuration/workspaces.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/configuration/harness-config.mjs` | import: `validateWorkspaceSemantics` |
| `packages/core/configuration/harness-config.test.mjs` | dynamic: `*` |
| `packages/core/configuration/workspaces.test.mjs` | import: `validateWorkspaceSemantics` |
| `src/server/mcp/tools.ts` | import: `validateWorkspaceSemantics` |
| `src/server/projects/sync-workspaces.ts` | import: `validateWorkspaceSemantics` |
| `plugin/lib/configuration/harness-config.mjs` | import: `validateWorkspaceSemantics` |

#### packages/core/execution/client-runtime.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `CLIENTS`, `RUNTIME_PROTOCOL`, `RUNTIME_MARKER`, `parseClient`, `clientRuntime`, `runtimeEcho` | shared/universal — `packages/shared/execution/client-runtime.mjs`; 같은 이름 |
| type | `Client` | shared/universal — `packages/shared/execution/client-runtime.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/execution/client-runtime.test.mjs`.
새 검증 목적지: `packages/shared/execution/client-runtime.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/execution/client-runtime.test.mjs` | import: `parseClient`, `clientRuntime` |
| `packages/core/templates/codex-bundle.mjs` | import: `RUNTIME_MARKER` |
| `packages/core/templates/codex-bundle.test.mjs` | import: `RUNTIME_MARKER` |
| `packages/core/templates/deliver.mjs` | import: `clientRuntime`, `parseClient`, `runtimeEcho` |
| `packages/core/templates/manifest.mjs` | import: `parseClient` |
| `packages/core/templates/vars.mjs` | import: `clientRuntime` |
| `src/fsd/entities/project-token/ui/owner-token-reveal.tsx` | import: `CLIENTS`, `clientRuntime`, `parseClient` |
| `src/fsd/entities/project-token/ui/token-reveal.tsx` | import: `CLIENTS`, `clientRuntime`, `parseClient` |
| `src/fsd/features/review-gate/model/gate-text.ts` | import: `clientRuntime` |
| `src/fsd/pages/docs/model/docs-facts.ts` | import: `clientRuntime` |
| `src/fsd/widgets/turn-banner/model/next-step.test.ts` | import: `clientRuntime` |
| `src/fsd/widgets/turn-banner/model/next-step.ts` | import: `clientRuntime` |
| `src/fsd/widgets/turn-banner/model/setup-detail.ts` | import: `clientRuntime` |
| `src/fsd/widgets/turn-banner/model/turn.ts` | import: `clientRuntime` |
| `src/fsd/widgets/turn-banner/ui/next-step.tsx` | import: `CLIENTS`, `clientRuntime`, `parseClient` |
| `src/fsd/widgets/turn-banner/ui/turn-banner.tsx` | import: `CLIENTS`, `clientRuntime`, `parseClient` |
| `src/server/agents/next.ts` | import: `parseClient`, `runtimeEcho`, `type Client` |
| `src/server/agents/vars.test.ts` | import: `clientRuntime` |
| `src/server/agents/vars.ts` | import: `type Client` |
| `src/server/mcp/deps.ts` | import: `runtimeEcho` |
| `src/server/mcp/tools.ts` | import: `type Client` |
| `src/server/rest/templates-handler.test.ts` | import: `RUNTIME_MARKER` |
| `src/server/rest/templates-handler.ts` | import: `parseClient`, `type Client` |
| `src/server/templates/client-bundle-query.test.ts` | import: `RUNTIME_MARKER` |
| `src/server/templates/client-bundle-query.ts` | import: `runtimeEcho` |
| `plugin/bin/harness-codex.mjs` | import: `RUNTIME_PROTOCOL` |
| `plugin/bin/harness-init-dual.test.mjs` | import: `RUNTIME_MARKER` |
| `plugin/bin/harness-init.mjs` | import: `parseClient`, `RUNTIME_PROTOCOL` |
| `plugin/bin/harness-session.mjs` | import: `parseClient` |
| `plugin/bin/harness-session.test.mjs` | import: `RUNTIME_MARKER` |
| `plugin/bin/harness-watch.test.mjs` | import: `RUNTIME_PROTOCOL` |
| `plugin/lib/templates/codex-bundle.mjs` | import: `RUNTIME_MARKER` |
| `plugin/lib/templates/deliver.mjs` | import: `clientRuntime`, `parseClient`, `runtimeEcho` |
| `plugin/lib/templates/manifest.mjs` | import: `parseClient` |
| `plugin/lib/templates/vars.mjs` | import: `clientRuntime` |
| `plugin/runtime/codex-agent.mjs` | import: `RUNTIME_MARKER` |
| `plugin/runtime/mcp-client.mjs` | import: `parseClient`, `RUNTIME_PROTOCOL` |
| `scripts/templates/template-seed-query.test.ts` | import: `RUNTIME_MARKER` |
| `tests/server/integration/client-runtime.test.ts` | import: `RUNTIME_MARKER` |

#### packages/core/execution/runner.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `RUNNER_MODES`, `RUNNER_WAIT_REASONS`, `RUNNER_PERMISSIONS`, `RUNNER_STOP_REASONS`, `RUNNER_AUTOSTART_STATES`, `RUNNER_SIGNIN_CODES`, `RUNNER_HOST_MAX`, `RUNNER_BRANCH_MAX`, `RUNNER_RESULT_MAX`, `RUNNER_LOG_MAX`, `limitedResult`, `limitedUntil` | shared/universal — `packages/shared/execution/runner-contract.mjs`; 같은 이름 |
| export | `SIGNAL_TIMEOUT_MS`, `WORKING_TIMEOUT_MS`, `SIGNAL_GRACE_MS`, `IDLE_STEPS`, `idleInterval`, `runnerNextSignalAt`, `needsAgentActivity`, `runnerSignalAt`, `runnerSilenceLimit`, `runnerStatus`, `holdsRunnerLease` | app-core/universal — `packages/app-core/execution/runner-status.mjs`; 같은 이름 |
| export | `BEAT_WRITE_INTERVAL_MS`, `WORKING_BEAT_MS` | server/Node — `src/server/runners/timing.ts`; 같은 이름 |
| private | `time`, `LIMITED_RESULT`, `LIMITED_LINE` | shared/universal — `packages/shared/execution/runner-contract.mjs`; `time → runnerTimestamp` |
| type | `RunnerSignal` | app-core/universal — `packages/app-core/execution/runner-status.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/execution/runner.test.mjs`.
새 검증 목적지: `packages/shared/execution/runner-contract.test.mjs`, `packages/app-core/execution/runner-status.test.mjs`, `src/server/runners/runner-service.test.ts (기존 timing 회귀; 상수만 위한 새 시험은 만들지 않음)`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/execution/runner.test.mjs` | import: `holdsRunnerLease`, `idleInterval`, `limitedResult`, `limitedUntil`, `needsAgentActivity`, `RUNNER_RESULT_MAX`, `runnerNextSignalAt`, `runnerSignalAt`, `runnerSilenceLimit`, `runnerStatus`, `SIGNAL_TIMEOUT_MS`, `WORKING_TIMEOUT_MS` |
| `src/fsd/widgets/turn-banner/api/turn-data.server.ts` | import: `limitedUntil` |
| `src/fsd/widgets/turn-banner/model/runner.test.ts` | import: `RUNNER_SIGNIN_CODES` |
| `src/fsd/widgets/turn-banner/model/runner.ts` | import: `runnerNextSignalAt`, `runnerSignalAt`, `runnerStatus` |
| `src/server/rest/runner-handler.ts` | import: `RUNNER_AUTOSTART_STATES`, `RUNNER_BRANCH_MAX`, `RUNNER_HOST_MAX`, `RUNNER_LOG_MAX`, `RUNNER_MODES`, `RUNNER_PERMISSIONS`, `RUNNER_RESULT_MAX`, `RUNNER_SIGNIN_CODES`, `RUNNER_STOP_REASONS`, `RUNNER_WAIT_REASONS` |
| `src/server/runners/runner-service.test.ts` | import: `runnerStatus` |
| `src/server/runners/runner-service.ts` | import: `BEAT_WRITE_INTERVAL_MS`, `holdsRunnerLease`, `idleInterval`, `needsAgentActivity`, `WORKING_BEAT_MS` |
| `plugin/runtime/background.mjs` | import: `limitedResult` |
| `plugin/runtime/runner-client.mjs` | import: `RUNNER_HOST_MAX` |

#### packages/core/execution/watch.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `STUCK_AFTER`, `parseToolResponse`, `actionableWork`, `hasWork`, `workSignature`, `nextWatchState` | plugin runtime/Node — `plugin/runtime/execution/watch.mjs`; 같은 이름 |
| private | `object`, `text`, `nullableText`, `protocolError`, `requireValue`, `validateEntry`, `validateFormat`, `validateTemplateMetadata`, `validateExecution`, `validateItem`, `executionSignature`, `templateSignature` | plugin runtime/Node — `plugin/runtime/execution/watch.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/execution/watch.test.mjs`.
새 검증 목적지: `plugin/runtime/execution/watch.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/execution/watch.test.mjs` | import: `STUCK_AFTER`, `actionableWork`, `hasWork`, `nextWatchState`, `parseToolResponse`, `workSignature` |
| `plugin/bin/harness-background.mjs` | import: `actionableWork` |
| `plugin/bin/harness-watch.mjs` | import: `actionableWork`, `hasWork`, `nextWatchState`, `parseToolResponse`, `workSignature` |
| `plugin/runtime/background.mjs` | import: `hasWork`, `workSignature` |
| `plugin/runtime/local-session.mjs` | import: `STUCK_AFTER` |
| `plugin/runtime/mcp-client.mjs` | import: `parseToolResponse` |
| `tests/server/integration/impl-verifier.test.ts` | import: `actionableWork` |

#### packages/core/pipeline/backlog.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `ITEM_TYPES`, `SCOUT_ITEMS_PER_RUN`, `toItemType`, `nextItemKey` | app-core/universal — `packages/app-core/pipeline/backlog.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/pipeline/backlog.test.mjs`.
새 검증 목적지: `packages/app-core/pipeline/backlog.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/pipeline/backlog.test.mjs` | import: `ITEM_TYPES`, `SCOUT_ITEMS_PER_RUN`, `nextItemKey`, `toItemType` |
| `src/fsd/features/edit-backlog/api/edit-backlog.server.ts` | import: `toItemType` |
| `src/fsd/features/edit-backlog/ui/backlog-form.tsx` | import: `ITEM_TYPES` |
| `src/fsd/features/edit-pipeline/api/pipeline-settings.server.ts` | import: `ITEM_TYPES` |
| `src/fsd/features/edit-pipeline/ui/pipeline-rules-panel.tsx` | import: `ITEM_TYPES` |
| `src/server/mcp/tools.ts` | import: `ITEM_TYPES` |
| `src/server/pipeline/board-service.ts` | import: `nextItemKey`, `SCOUT_ITEMS_PER_RUN`, `toItemType` |
| `src/server/pipeline/settings-service.ts` | import: `ITEM_TYPES` |
| `tests/server/integration/pipeline-routing.test.ts` | import: `ITEM_TYPES` |

#### packages/core/pipeline/pipeline.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `NODE_KINDS`, `REQUIRED_NODES`, `TAIL_NODES`, `NODE_AGENT`, `SLOT_FORMAT`, `PROJECT_AGENTS`, `DEFAULT_SELECTION_POLICY`, `workPrefix`, `itemGraph`, `AUTO_SCOUT_DISABLED_REASON`, `slotAgent`, `dispatcherFor`, `isItemNode`, `GATE_PREFIX`, `gateId`, `isGateId`, `gateKind`, `BOUNDARY`, `boundaryOf`, `DEFAULT_GATES`, `nodeAllowed`, `OPT_IN_NODES`, `STEP_KINDS`, `defaultGraph`, `allowsPipelineEdit`, `PROPOSE_SETTING_REASON`, `validateGraph`, `sequence`, `nextAfter`, `cursorForStatus`, `nodeDone`, `advance`, `REF_PREFIX`, `isRef`, `refId`, `refStep`, `validateDefinition`, `expand`, `composedReason`, `usersOf`, `recompose`, `routePipeline`, `AUTO_PROPOSE_DISABLED_REASON`, `PIPELINE_EDIT_PLAN_GATE` | app-core/universal — `packages/app-core/pipeline/pipeline.mjs`; 같은 이름 |
| private | `ORDER`, `RANK`, `orderReason`, `aliasReason`, `gateReason` | app-core/universal — `packages/app-core/pipeline/pipeline.mjs`; 같은 이름 |
| type | `Graph`, `GraphInput`, `Boundary`, `GraphValidation`, `NodeFacts`, `AdvanceFacts`, `Advance`, `Definition`, `DefinitionInput`, `Definitions`, `Expansion`, `Recompose` | app-core/universal — `packages/app-core/pipeline/pipeline.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/pipeline/pipeline-types.test.ts`, `packages/core/pipeline/pipeline.test.mjs`.
새 검증 목적지: `packages/app-core/pipeline/pipeline.test.mjs`, `packages/app-core/pipeline/pipeline-types.test.ts`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/pipeline/pipeline-types.test.ts` | import: `composedReason`, `expand`, `recompose`, `validateDefinition`, `type DefinitionInput`, `type Definitions`, `type NodeFacts` |
| `packages/core/pipeline/pipeline.test.mjs` | import: `expand`, `recompose`, `refStep`, `routePipeline`, `usersOf`, `validateDefinition`, `PROPOSE_SETTING_REASON`, `advance`, `cursorForStatus`, `DEFAULT_GATES`, `defaultGraph`, `dispatcherFor`, `gateId`, `isItemNode`, `NODE_KINDS`, `nodeDone`, `sequence`, `validateGraph` |
| `packages/core/pipeline/run-input.d.mts` | import: `type GraphInput` |
| `packages/core/pipeline/run-input.mjs` | import: `validateDefinition`, `isRef` |
| `packages/core/pipeline/run-input.test.mjs` | import: `advance`, `SLOT_FORMAT` |
| `packages/core/pipeline/work-selection.mjs` | import: `DEFAULT_SELECTION_POLICY` |
| `packages/core/pipeline/work-selection.test.mjs` | import: `DEFAULT_SELECTION_POLICY`, `expand`, `itemGraph`, `validateDefinition`, `workPrefix` |
| `packages/core/qa.test.mjs` | import: `advance`, `defaultGraph`, `dispatcherFor`, `isItemNode`, `nodeDone`, `validateGraph` |
| `src/app/(app)/p/[slug]/pipeline/page.tsx` | import: `allowsPipelineEdit` |
| `src/fsd/entities/pipeline/model/gate-copy.ts` | import: `gateKind`, `slotAgent` |
| `src/fsd/entities/pipeline/model/labels.test.ts` | import: `NODE_KINDS` |
| `src/fsd/entities/pipeline/model/labels.ts` | import: `slotAgent`, `refId`, `gateKind`, `gateId`, `boundaryOf` |
| `src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts` | import: `allowsPipelineEdit` |
| `src/fsd/features/edit-pipeline/api/pipeline-settings.server.ts` | import: `allowsPipelineEdit`, `PIPELINE_EDIT_PLAN_GATE` |
| `src/fsd/features/edit-pipeline/model/insertion-conflicts.test.ts` | import: `refStep`, `type Definitions` |
| `src/fsd/features/edit-pipeline/model/insertion-conflicts.ts` | import: `expand`, `refId`, `type DefinitionInput`, `type Definitions` |
| `src/fsd/features/edit-pipeline/model/pipeline-catalog.ts` | import: `expand` |
| `src/fsd/features/edit-pipeline/model/pipeline-save-state.ts` | import: `type Definition` |
| `src/fsd/features/edit-pipeline/model/plan-gate.ts` | reexport: `PIPELINE_EDIT_PLAN_GATE` |
| `src/fsd/features/edit-pipeline/model/rail-state.test.ts` | import: `defaultGraph`, `refStep` |
| `src/fsd/features/edit-pipeline/model/rail-state.ts` | import: `TAIL_NODES`, `PROJECT_AGENTS`, `slotAgent`, `gateKind`, `gateId`, `validateDefinition`, `expand`, `recompose`, `refStep`, `refId`, `type Definition`, `type Definitions`, `type Recompose` |
| `src/fsd/features/edit-pipeline/model/rail-state.ts` | reexport: `type Definition` |
| `src/fsd/features/edit-pipeline/ui/pipeline-list.tsx` | import: `refStep` |
| `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` | import: `DEFAULT_SELECTION_POLICY`, `STEP_KINDS`, `REQUIRED_NODES`, `TAIL_NODES`, `PROJECT_AGENTS`, `gateId`, `refId`, `expand`, `sequence`, `usersOf`, `type Definition` |
| `src/fsd/features/review-gate/model/inbox-item.ts` | import: `isGateId` |
| `src/fsd/pages/docs/model/docs-facts.ts` | import: `DEFAULT_GATES`, `OPT_IN_NODES`, `PROJECT_AGENTS`, `REQUIRED_NODES`, `STEP_KINDS`, `defaultGraph`, `dispatcherFor`, `nodeAllowed` |
| `src/fsd/pages/docs/ui/docs-copy.test.ts` | import: `defaultGraph` |
| `src/fsd/pages/project-backlog/api/project-backlog-page.server.ts` | import: `routePipeline` |
| `src/fsd/pages/project-board/api/project-board.server.ts` | import: `isGateId` |
| `src/fsd/pages/project-board/model/briefing.test.mjs` | import: `NODE_KINDS`, `PROJECT_AGENTS`, `defaultGraph` |
| `src/fsd/pages/project-board/model/briefing.ts` | import: `slotAgent`, `dispatcherFor`, `PROJECT_AGENTS` |
| `src/fsd/pages/project-board/ui/project-board-page.test.mjs` | import: `NODE_KINDS` |
| `src/fsd/widgets/turn-banner/api/turn-data.server.ts` | import: `isGateId` |
| `src/fsd/widgets/turn-banner/model/turn.ts` | import: `slotAgent`, `dispatcherFor`, `PROJECT_AGENTS` |
| `src/server/agents/run-service.ts` | import: `dispatcherFor`, `isItemNode`, `SLOT_FORMAT`, `AUTO_SCOUT_DISABLED_REASON` |
| `src/server/pipeline/automatic-scout.ts` | import: `slotAgent` |
| `src/server/pipeline/board-rules.ts` | import: `boundaryOf`, `gateId`, `isGateId` |
| `src/server/pipeline/board-service.ts` | import: `advance`, `sequence`, `itemGraph`, `routePipeline`, `cursorForStatus`, `gateId`, `SLOT_FORMAT`, `AUTO_SCOUT_DISABLED_REASON` |
| `src/server/pipeline/codex-handoff-query.ts` | import: `dispatcherFor`, `isItemNode` |
| `src/server/pipeline/current-execution-query.ts` | import: `dispatcherFor`, `isGateId`, `PROJECT_AGENTS`, `SLOT_FORMAT`, `slotAgent` |
| `src/server/pipeline/lock-pipeline.ts` | import: `allowsPipelineEdit`, `PIPELINE_EDIT_PLAN_GATE` |
| `src/server/pipeline/run-request.ts` | import: `DEFAULT_SELECTION_POLICY`, `expand`, `workPrefix`, `type GraphInput` |
| `src/server/pipeline/run-rules.test.mjs` | import: `AUTO_SCOUT_DISABLED_REASON` |
| `src/server/pipeline/run-rules.ts` | import: `dispatcherFor`, `slotAgent`, `boundaryOf`, `isGateId`, `AUTO_SCOUT_DISABLED_REASON`, `AUTO_PROPOSE_DISABLED_REASON` |
| `src/server/pipeline/run-service.ts` | import: `BOUNDARY`, `SLOT_FORMAT`, `PROJECT_AGENTS`, `slotAgent`, `dispatcherFor`, `isItemNode`, `cursorForStatus`, `defaultGraph`, `isGateId`, `sequence`, `expand`, `validateGraph`, `itemGraph`, `DEFAULT_SELECTION_POLICY` |
| `src/server/pipeline/save-definition.ts` | import: `DEFAULT_SELECTION_POLICY`, `recompose`, `SLOT_FORMAT`, `validateDefinition`, `type Definition`, `type GraphInput` |
| `src/server/pipeline/settings-service.ts` | import: `refStep` |
| `src/server/pipeline/work-run.ts` | import: `DEFAULT_SELECTION_POLICY`, `isGateId`, `nextAfter`, `sequence`, `slotAgent`, `workPrefix` |
| `src/server/templates/bootstrap-service.ts` | import: `dispatcherFor`, `isItemNode`, `slotAgent` |
| `plugin/lib/pipeline/run-input.mjs` | import: `validateDefinition`, `isRef` |
| `plugin/lib/pipeline/work-selection.mjs` | import: `DEFAULT_SELECTION_POLICY` |
| `scripts/rehearsals/rehearse-backlog-pipeline.ts` | import: `defaultGraph`, `PIPELINE_EDIT_PLAN_GATE`, `SLOT_FORMAT` |
| `scripts/rehearsals/rehearse-multiple-pipelines.ts` | import: `PIPELINE_EDIT_PLAN_GATE` |
| `scripts/rehearsals/rehearse-web-http-contracts.ts` | import: `SLOT_FORMAT` |
| `tests/server/fixtures/frontend-ux-browser.tsx` | import: `type Definition` |
| `tests/server/fixtures/src-clean-code-browser.tsx` | import: `defaultGraph` |
| `tests/server/integration/automatic-scout.test.ts` | import: `AUTO_SCOUT_DISABLED_REASON` |
| `tests/server/integration/pipeline-composition.test.ts` | import: `refStep` |
| `tests/server/integration/pipeline-materialization.test.ts` | import: `defaultGraph` |
| `tests/server/integration/pipeline-save.test.ts` | import: `defaultGraph` |
| `tests/server/integration/pipeline-settings.test.ts` | import: `refStep`, `PIPELINE_EDIT_PLAN_GATE` |
| `tests/server/integration/pipeline-work-nodes.test.ts` | import: `DEFAULT_SELECTION_POLICY` |
| `tests/server/pipeline-settings.test.ts` | import: `PIPELINE_EDIT_PLAN_GATE` |
| `tests/server/project-guard.test.ts` | import: `defaultGraph` |
| `tests/server/project-page-loaders.test.ts` | import: `SLOT_FORMAT` |

#### packages/core/pipeline/run-input.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `validateExecutionGraph`, `pipelineInputReason` | server/Node — `src/server/pipeline/input-validation.ts`; 같은 이름 |
| type | `PipelineInput` | server/Node — `src/server/pipeline/input-validation.ts`; 같은 이름 |

현재 인접 시험: `packages/core/pipeline/run-input.test.mjs`.
새 검증 목적지: `src/server/pipeline/input-validation.test.ts`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/pipeline/run-input.test.mjs` | import: `pipelineInputReason`, `validateExecutionGraph` |
| `src/server/pipeline/board-service.ts` | import: `pipelineInputReason` |
| `src/server/pipeline/run-request.ts` | import: `pipelineInputReason`, `validateExecutionGraph` |
| `src/server/pipeline/run-service.ts` | import: `validateExecutionGraph` |

#### packages/core/pipeline/transitions.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `STATUSES`, `TEXT_LIMIT`, `findRule`, `canDiscard`, `isOpen`, `canPropose`, `canRecordValidation`, `checkText` | app-core/universal — `packages/app-core/pipeline/transitions.mjs`; 같은 이름 |
| private | `STATUS_SET`, `RULES`, `DISCARD_FROM` | app-core/universal — `packages/app-core/pipeline/transitions.mjs`; 같은 이름 |
| type | `BoardStatus`, `TransitionActor`, `RuleKind`, `TransitionRule` | app-core/universal — `packages/app-core/pipeline/transitions.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/pipeline/transitions.test.mjs`.
새 검증 목적지: `packages/app-core/pipeline/transitions.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/pipeline/transitions.test.mjs` | import: `canDiscard`, `canPropose`, `canRecordValidation`, `checkText`, `findRule`, `isOpen`, `STATUSES` |
| `src/fsd/entities/board-item/model/inbox-gate.ts` | import: `STATUSES`, `findRule` |
| `src/fsd/entities/board-item/model/text-budget.ts` | import: `TEXT_LIMIT` |
| `src/fsd/features/review-gate/model/gate-source.ts` | import: `STATUSES`, `canDiscard`, `findRule`, `type RuleKind` |
| `src/fsd/features/review-gate/model/gate-text.ts` | import: `TEXT_LIMIT` |
| `src/fsd/widgets/turn-banner/model/turn.ts` | import: `canPropose`, `isOpen` |
| `src/server/agents/next.ts` | import: `STATUSES`, `canPropose` |
| `src/server/pipeline/board-rules.ts` | import: `canDiscard`, `canPropose`, `canRecordValidation`, `checkText`, `findRule`, `isOpen`, `type RuleKind` |
| `src/server/pipeline/board-service.ts` | import: `isOpen` |
| `src/server/pipeline/run-rules.test.mjs` | import: `TEXT_LIMIT` |
| `src/server/pipeline/run-rules.ts` | import: `canPropose` |
| `src/server/pipeline/work-run.ts` | import: `isOpen` |
| `src/server/projects/availability-service.ts` | import: `isOpen` |
| `src/server/templates/steps.ts` | import: `STATUSES` |
| `scripts/checks/transitions-contract.test.ts` | import: `*` |
| `scripts/checks/transitions-contract.test.ts` | import: `STATUSES`, `findRule`, `type RuleKind` |
| `tests/templates/private-template-release.test.ts` | import: `findRule` |

#### packages/core/pipeline/work-selection.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `readSelectionDecision`, `selectionReason`, `matchingAgents` | app-core/universal — `packages/app-core/pipeline/work-selection.mjs`; 같은 이름 |
| private | `nonempty` | app-core/universal — `packages/app-core/pipeline/work-selection.mjs`; 같은 이름 |
| type | `SelectionDecision`, `SelectionCandidate`, `SelectionContext` | app-core/universal — `packages/app-core/pipeline/work-selection.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/pipeline/work-selection.test.mjs`.
새 검증 목적지: `packages/app-core/pipeline/work-selection.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/pipeline/work-selection.test.mjs` | import: `matchingAgents`, `readSelectionDecision`, `selectionReason` |
| `src/fsd/pages/board-item/api/board-item-page.server.ts` | import: `readSelectionDecision` |
| `src/fsd/pages/board-item/ui/board-item-page.tsx` | import: `type SelectionDecision` |
| `src/server/mcp/tools.ts` | import: `type SelectionContext`, `type SelectionDecision` |
| `src/server/pipeline/board-service.ts` | import: `selectionReason`, `type SelectionDecision` |
| `src/server/pipeline/work-run.ts` | import: `matchingAgents`, `type SelectionContext` |
| `tests/server/integration/pipeline-work-nodes.test.ts` | import: `type SelectionContext`, `type SelectionDecision` |

#### packages/core/plans/entitlement.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `PLANS`, `DEFAULT_PLAN`, `UNLIMITED`, `RESIDENT_RUNNER_PLAN_GATE`, `CODEX_RESIDENT_RUNNER_PLAN_GATE`, `REPORT_AGENTS`, `LIMITS`, `isPlan`, `limitsFor`, `withinLimit`, `capReason` | shared/universal — `packages/shared/plans/limits.mjs`; 같은 이름 |
| export | `OWNER_TOKEN_PLAN_GATE`, `capError`, `allowsAgent`, `historyCutoff`, `allowsSessionApprovals` | app-core/universal — `packages/app-core/plans/entitlement.mjs`; 같은 이름 |
| export | `availableProjectIds`, `availabilityBasis`, `availabilityAfterPlanChange` | server/Node — `src/server/projects/availability-policy.ts`; 같은 이름 |
| private | `AXES`, `AXIS_NOUN` | shared/universal — `packages/shared/plans/limits.mjs`; 같은 이름 |
| private | `timestamp`, `nullableTimestamp`, `compareNullableDesc`, `compareId` | server/Node — `src/server/projects/availability-policy.ts`; 같은 이름 |
| type | `Plan` | shared/universal — `packages/shared/plans/limits.mjs`; 같은 이름 |
| type | `AvailabilityCandidate` | server/Node — `src/server/projects/availability-policy.ts`; 같은 이름 |

현재 인접 시험: `packages/core/plans/entitlement.test.mjs`.
새 검증 목적지: `packages/shared/plans/limits.test.mjs`, `packages/app-core/plans/entitlement.test.mjs`, `src/server/projects/availability-policy.test.ts`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/configuration/workspaces.mjs` | import: `REPORT_AGENTS` |
| `packages/core/pipeline/pipeline.mjs` | import: `limitsFor` |
| `packages/core/plans/entitlement.test.mjs` | import: `availabilityAfterPlanChange`, `availabilityBasis` |
| `packages/core/plans/entitlement.test.mjs` | import: `DEFAULT_PLAN`, `LIMITS`, `PLANS`, `REPORT_AGENTS`, `RESIDENT_RUNNER_PLAN_GATE`, `allowsAgent`, `allowsSessionApprovals`, `availableProjectIds`, `capError`, `capReason`, `historyCutoff`, `isPlan`, `limitsFor`, `withinLimit` |
| `packages/core/plans/usage-window.mjs` | import: `limitsFor` |
| `packages/core/templates/codex-bundle.mjs` | import: `limitsFor` |
| `packages/core/templates/codex-bundle.test.mjs` | import: `limitsFor` |
| `packages/core/templates/deliver.mjs` | import: `REPORT_AGENTS`, `limitsFor` |
| `packages/core/templates/deliver.test.mjs` | import: `REPORT_AGENTS` |
| `src/app/(app)/p/[slug]/tokens/page.tsx` | import: `allowsSessionApprovals` |
| `src/fsd/entities/account-plan/model/plan-label.ts` | import: `type Plan` |
| `src/fsd/features/manage-project-connection/model/project-connection-state.ts` | import: `type Plan` |
| `src/fsd/features/manage-token/model/plan-gate.ts` | reexport: `OWNER_TOKEN_PLAN_GATE` |
| `src/fsd/features/select-project-for-use/model/select-project-state.ts` | import: `type Plan` |
| `src/fsd/pages/billing/model/plan-matrix.test.ts` | import: `LIMITS`, `PLANS` |
| `src/fsd/pages/billing/model/plan-matrix.ts` | import: `PLANS`, `UNLIMITED`, `limitsFor`, `type Plan` |
| `src/fsd/pages/billing/ui/billing-page.tsx` | import: `PLANS`, `type Plan` |
| `src/fsd/pages/board-item/api/board-item-page.server.ts` | import: `historyCutoff` |
| `src/fsd/pages/docs/model/docs-facts.ts` | import: `PLANS`, `limitsFor` |
| `src/fsd/pages/docs/ui/docs-copy.test.ts` | import: `limitsFor` |
| `src/fsd/pages/project-history/api/project-history.server.ts` | import: `historyCutoff` |
| `src/fsd/pages/project-list/model/project-list-copy.ts` | import: `type Plan` |
| `src/fsd/widgets/app-header/api/app-header.server.ts` | import: `type Plan` |
| `src/fsd/widgets/app-header/ui/app-header.tsx` | import: `type Plan` |
| `src/fsd/widgets/turn-banner/ui/turn-banner.test.ts` | import: `type Plan` |
| `src/fsd/widgets/turn-banner/ui/turn-banner.tsx` | import: `type Plan` |
| `src/server/agents/next.ts` | import: `REPORT_AGENTS`, `allowsAgent` |
| `src/server/agents/run-service.ts` | import: `allowsAgent` |
| `src/server/mcp/deps.ts` | import: `historyCutoff` |
| `src/server/mcp/owner-tools.ts` | import: `allowsSessionApprovals` |
| `src/server/pipeline/board-rules.ts` | import: `REPORT_AGENTS` |
| `src/server/pipeline/board-service.ts` | import: `allowsSessionApprovals`, `capError` |
| `src/server/pipeline/lock-pipeline.ts` | import: `type Plan` |
| `src/server/projects/access-query.ts` | import: `DEFAULT_PLAN`, `isPlan`, `type Plan` |
| `src/server/projects/availability-service.ts` | import: `availabilityAfterPlanChange`, `isPlan`, `limitsFor` |
| `src/server/projects/connection-service.ts` | import: `limitsFor`, `withinLimit` |
| `src/server/projects/registration-command.ts` | import: `capError` |
| `src/server/projects/sync-workspaces.ts` | import: `capReason`, `withinLimit` |
| `src/server/rest/runner-handler.test.ts` | import: `RESIDENT_RUNNER_PLAN_GATE` |
| `src/server/rest/templates-handler.test.ts` | import: `limitsFor` |
| `src/server/runners/runner-service.test.ts` | import: `RESIDENT_RUNNER_PLAN_GATE` |
| `src/server/runners/runner-service.ts` | import: `limitsFor`, `RESIDENT_RUNNER_PLAN_GATE`, `CODEX_RESIDENT_RUNNER_PLAN_GATE` |
| `src/server/templates/client-bundle-query.ts` | import: `limitsFor` |
| `src/server/tokens/project-token-service.ts` | import: `allowsSessionApprovals`, `OWNER_TOKEN_PLAN_GATE` |
| `plugin/bin/harness-background.mjs` | import: `RESIDENT_RUNNER_PLAN_GATE`, `CODEX_RESIDENT_RUNNER_PLAN_GATE` |
| `plugin/bin/harness-commit-guard.mjs` | import: `REPORT_AGENTS` |
| `plugin/bin/harness-init.mjs` | import: `REPORT_AGENTS`, `capReason`, `isPlan`, `withinLimit` |
| `plugin/bin/harness-init.test.mjs` | import: `REPORT_AGENTS`, `limitsFor` |
| `plugin/bin/harness-skill-references.test.mjs` | import: `capReason` |
| `plugin/lib/configuration/workspaces.mjs` | import: `REPORT_AGENTS` |
| `plugin/lib/pipeline/pipeline.mjs` | import: `limitsFor` |
| `plugin/lib/plans/usage-window.mjs` | import: `limitsFor` |
| `plugin/lib/templates/codex-bundle.mjs` | import: `limitsFor` |
| `plugin/lib/templates/deliver.mjs` | import: `REPORT_AGENTS`, `limitsFor` |
| `scripts/grant-plan.ts` | import: `PLANS`, `isPlan` |
| `scripts/templates/template-seed-query.test.ts` | import: `limitsFor` |
| `tests/server/integration/history-items.test.ts` | import: `historyCutoff` |
| `tests/server/integration/project-history.test.ts` | import: `historyCutoff` |
| `tests/server/project-history.test.ts` | import: `historyCutoff` |

#### packages/core/plans/usage-window.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `USAGE_WINDOW_MS`, `usageSnapshot` | server/Node — `src/server/usage/usage-window.ts`; 같은 이름 |

현재 인접 시험: `packages/core/plans/usage-window.test.mjs`.
새 검증 목적지: `src/server/usage/usage-window.test.ts`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/plans/usage-window.test.mjs` | import: `usageSnapshot` |
| `src/server/agents/next.test.ts` | import: `usageSnapshot` |
| `src/server/usage/account-usage-query.ts` | import: `usageSnapshot` |

#### packages/core/project-slug.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `SLUG_MAX`, `SLUG_RE`, `RESERVED_SLUGS` | app-core/universal — `packages/app-core/projects/slug.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/project-slug.test.mjs`.
새 검증 목적지: `packages/app-core/projects/slug.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/project-slug.test.mjs` | import: `SLUG_MAX`, `SLUG_RE`, `RESERVED_SLUGS` |
| `src/fsd/features/create-project/model/project-slug.test.ts` | import: `*` |
| `src/fsd/features/create-project/model/project-slug.ts` | import: `SLUG_MAX` |
| `src/fsd/features/create-project/model/project-slug.ts` | reexport: `SLUG_MAX`, `SLUG_RE`, `RESERVED_SLUGS` |
| `src/server/projects/slug-rule.test.ts` | import: `*` |
| `src/server/projects/slug-rule.ts` | import: `SLUG_MAX`, `SLUG_RE`, `RESERVED_SLUGS` |
| `src/server/projects/slug-rule.ts` | reexport: `SLUG_MAX`, `SLUG_RE`, `RESERVED_SLUGS` |

#### packages/core/qa.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `QA_BROWSER_TOOLS`, `parseQaConfig` | plugin runtime/Node — `plugin/runtime/qa/config.mjs`; 같은 이름 |
| export | `parseQaReport` | server/Node — `src/server/pipeline/qa-report.ts`; 같은 이름 |
| private | `text`, `httpUrl` | shared/universal — `packages/shared/qa/validation.mjs`; `text → qaText`, `httpUrl → qaHttpUrl` |
| type | `QaStatus`, `QaReport` | server/Node — `src/server/pipeline/qa-report.ts`; 같은 이름 |
| type | `QaConfig` | plugin runtime/Node — `plugin/runtime/qa/config.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/qa.test.mjs`.
새 검증 목적지: `plugin/runtime/qa/config.test.mjs`, `src/server/pipeline/qa-report.test.ts`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/configuration/harness-config.mjs` | import: `parseQaConfig` |
| `packages/core/qa.test.mjs` | import: `parseQaConfig`, `parseQaReport` |
| `src/server/pipeline/board-service.ts` | import: `parseQaReport` |
| `src/server/pipeline/qa-query.ts` | import: `parseQaReport` |
| `plugin/bin/harness-init-dual.test.mjs` | import: `QA_BROWSER_TOOLS` |
| `plugin/bin/harness-qa-browser.test.mjs` | import: `QA_BROWSER_TOOLS` |
| `plugin/bin/harness-role-files.test.mjs` | import: `QA_BROWSER_TOOLS` |
| `plugin/bin/harness-session.test.mjs` | import: `QA_BROWSER_TOOLS` |
| `plugin/lib/configuration/harness-config.mjs` | import: `parseQaConfig` |
| `plugin/runtime/codex-agent.mjs` | import: `QA_BROWSER_TOOLS` |
| `plugin/runtime/codex-thread.mjs` | import: `QA_BROWSER_TOOLS` |
| `plugin/runtime/qa-browser.mjs` | import: `QA_BROWSER_TOOLS`, `parseQaConfig` |

#### packages/core/request-rate.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `REQUEST_WINDOW_MS`, `REQUEST_LIMITS`, `requestWindow` | server/Node — `src/server/usage/request-rate-policy.ts`; 같은 이름 |

현재 인접 시험: 없음.
인접 시험은 없다. 아래 기존 소비자 시험·리허설에서 해당 동작을 계속 검증한다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `src/server/usage/request-rate-service.ts` | import: `REQUEST_LIMITS`, `requestWindow` |
| `tests/server/integration/request-rate-limit.test.ts` | import: `REQUEST_LIMITS` |

#### packages/core/templates/codex-bundle.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `COMMON_DOCS`, `validateCodexBundle` | shared/universal — `packages/shared/templates/codex-bundle.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/templates/codex-bundle.test.mjs`.
새 검증 목적지: `packages/shared/templates/codex-bundle.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/templates/codex-bundle.test.mjs` | import: `COMMON_DOCS`, `validateCodexBundle` |
| `packages/core/templates/deliver.mjs` | import: `validateCodexBundle` |
| `packages/core/templates/manifest.mjs` | import: `COMMON_DOCS` |
| `packages/core/templates/release-manifest.mjs` | import: `COMMON_DOCS`, `validateCodexBundle` |
| `packages/core/templates/release-manifest.test.mjs` | import: `COMMON_DOCS` |
| `src/server/rest/templates-handler.test.ts` | import: `COMMON_DOCS` |
| `src/server/templates/client-bundle-query.test.ts` | import: `COMMON_DOCS` |
| `src/server/templates/client-bundle-query.ts` | import: `validateCodexBundle` |
| `plugin/bin/harness-init-dual.test.mjs` | import: `COMMON_DOCS` |
| `plugin/bin/harness-init.mjs` | import: `validateCodexBundle` |
| `plugin/lib/templates/deliver.mjs` | import: `validateCodexBundle` |
| `plugin/lib/templates/manifest.mjs` | import: `COMMON_DOCS` |
| `plugin/lib/templates/release-manifest.mjs` | import: `COMMON_DOCS`, `validateCodexBundle` |
| `plugin/runtime/mcp-client.mjs` | import: `validateCodexBundle` |
| `scripts/templates/template-seed-query.test.ts` | import: `COMMON_DOCS` |
| `scripts/templates/template-seed-query.ts` | import: `validateCodexBundle` |
| `tests/server/integration/client-runtime.test.ts` | import: `COMMON_DOCS` |

#### packages/core/templates/deliver.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `STEP_HEADING`, `stubOf`, `deliverable` | shared/universal — `packages/shared/templates/deliver.mjs`; 같은 이름 |
| private | `RUNBOOK_FREE`, `agentOf` | shared/universal — `packages/shared/templates/deliver.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/templates/deliver.test.mjs`.
새 검증 목적지: `packages/shared/templates/deliver.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/templates/codex-bundle.test.mjs` | import: `deliverable` |
| `packages/core/templates/deliver.test.mjs` | import: `STEP_HEADING`, `deliverable`, `stubOf` |
| `packages/core/templates/release-manifest.mjs` | import: `deliverable` |
| `src/server/rest/templates-handler.test.ts` | import: `stubOf` |
| `src/server/rest/templates-handler.ts` | import: `deliverable` |
| `src/server/templates/steps.ts` | import: `STEP_HEADING`, `stubOf` |
| `plugin/bin/harness-init-dual.test.mjs` | import: `deliverable`, `stubOf` |
| `plugin/bin/harness-init.mjs` | import: `deliverable` |
| `plugin/bin/harness-init.test.mjs` | import: `deliverable` |
| `plugin/lib/templates/release-manifest.mjs` | import: `deliverable` |
| `scripts/rehearsals/rehearse-acceptance-failure.ts` | import: `deliverable` |

#### packages/core/templates/manifest.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `hashOf`, `planWrites`, `mergeClientLock` | plugin runtime/Node — `plugin/runtime/templates/install-manifest.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/templates/manifest.test.mjs`.
새 검증 목적지: `plugin/runtime/templates/install-manifest.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/templates/codex-bundle.test.mjs` | import: `hashOf`, `mergeClientLock` |
| `packages/core/templates/manifest.test.mjs` | import: `hashOf`, `planWrites` |
| `plugin/bin/harness-init-dual.test.mjs` | import: `hashOf` |
| `plugin/bin/harness-init.mjs` | import: `hashOf`, `mergeClientLock`, `planWrites` |
| `plugin/runtime/template-installation.mjs` | import: `hashOf` |
| `tests/plugin/template-fixture.mjs` | import: `hashOf` |

#### packages/core/templates/release-manifest.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `TEMPLATE_PROTOCOL`, `TEMPLATE_CONTRACT`, `installationGuide`, `readTemplateContract`, `compatibleInstallation` | shared/node — `packages/shared/templates/release-contract.mjs`; 같은 이름 |
| export | `releaseDeliverable`, `normalizeTemplateRows`, `sourceKey`, `prepareTemplateRelease`, `selectTemplateLanguage`, `installationFor` | server/Node — `src/server/templates/release-preparation.ts`; 같은 이름 |
| export | `deliverySurfaceHash`, `canonicalJson`, `manifestHash` | shared/node — `packages/shared/templates/manifest-hash.mjs`; 같은 이름 |
| private | `INSTALLATION_GUIDE` | shared/node — `packages/shared/templates/release-contract.mjs`; 같은 이름 |
| type | `TemplateRow`, `TemplateSource` | server/Node — `src/server/templates/release-preparation.ts`; 같은 이름 |
| type | `Installation`, `TemplateContract` | shared/node — `packages/shared/templates/release-contract.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/templates/release-manifest.test.mjs`.
새 검증 목적지: `packages/shared/templates/release-contract.test.mjs`, `src/server/templates/release-preparation.test.ts`, `packages/shared/templates/manifest-hash.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/templates/release-manifest.test.mjs` | import: `canonicalJson`, `normalizeTemplateRows`, `prepareTemplateRelease`, `installationFor`, `compatibleInstallation`, `selectTemplateLanguage` |
| `src/server/agents/next.ts` | import: `type Installation` |
| `src/server/mcp/tools.ts` | import: `type Installation` |
| `src/server/pipeline/template-selection.ts` | import: `compatibleInstallation`, `installationFor`, `readTemplateContract`, `selectTemplateLanguage` |
| `src/server/pipeline/template-selection.ts` | import: `type Installation` |
| `src/server/rest/harness-init.test.ts` | import: `TEMPLATE_CONTRACT`, `manifestHash`, `releaseDeliverable` |
| `src/server/rest/runbook-handler.ts` | import: `compatibleInstallation`, `installationFor`, `releaseDeliverable` |
| `src/server/rest/templates-handler.ts` | import: `type TemplateContract` |
| `src/server/rest/templates-handler.ts` | import: `installationFor`, `releaseDeliverable`, `TEMPLATE_PROTOCOL` |
| `src/server/templates/bootstrap-service.ts` | import: `manifestHash`, `prepareTemplateRelease`, `selectTemplateLanguage` |
| `src/server/templates/release-protocol.ts` | import: `TEMPLATE_PROTOCOL` |
| `src/server/templates/release-query.ts` | import: `selectTemplateLanguage`, `readTemplateContract` |
| `src/server/templates/release-query.ts` | import: `type TemplateRow`, `type TemplateContract` |
| `src/server/templates/release-service.ts` | import: `manifestHash`, `prepareTemplateRelease`, `readTemplateContract` |
| `src/server/templates/release-service.ts` | import: `type TemplateRow`, `type TemplateSource` |
| `plugin/bin/harness-init.mjs` | import: `canonicalJson`, `deliverySurfaceHash`, `manifestHash`, `readTemplateContract`, `TEMPLATE_PROTOCOL` |
| `plugin/runtime/mcp-client.mjs` | import: `TEMPLATE_PROTOCOL`, `compatibleInstallation` |
| `plugin/runtime/template-installation.mjs` | import: `TEMPLATE_CONTRACT`, `TEMPLATE_PROTOCOL` |
| `scripts/templates/bootstrap-template-releases.ts` | import: `manifestHash` |
| `scripts/templates/template-target.ts` | import: `manifestHash` |
| `tests/plugin/template-fixture.mjs` | import: `TEMPLATE_CONTRACT`, `TEMPLATE_PROTOCOL`, `deliverySurfaceHash`, `manifestHash` |
| `tests/server/integration/template-bootstrap.test.ts` | import: `installationFor` |
| `tests/server/integration/template-execution.test.ts` | import: `installationFor` |
| `tests/server/integration/template-release-support.ts` | import: `type TemplateRow` |
| `tests/templates/private-template-release.test.ts` | import: `installationFor`, `releaseDeliverable` |

#### packages/core/templates/render.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `renderTemplate` | shared/universal — `packages/shared/templates/render.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/templates/render.test.mjs`.
새 검증 목적지: `packages/shared/templates/render.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/templates/render.test.mjs` | import: `renderTemplate` |
| `src/server/agents/next.ts` | import: `renderTemplate` |
| `src/server/templates/release-service.ts` | import: `renderTemplate` |
| `plugin/bin/harness-init-dual.test.mjs` | import: `renderTemplate` |
| `plugin/bin/harness-init.mjs` | import: `renderTemplate` |
| `scripts/rehearsals/rehearse-acceptance-failure.ts` | import: `renderTemplate` |

#### packages/core/templates/runbook.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `RUNBOOK_TEMPLATE`, `runbookVersion`, `codexRunbookVersion`, `isRunbookVersion` | shared/node — `packages/shared/templates/runbook.mjs`; 같은 이름 |
| export | `runbookIsStale` | server/Node — `src/server/templates/runbook-query.ts`; 같은 이름 |

현재 인접 시험: `packages/core/templates/runbook.test.mjs`.
새 검증 목적지: `packages/shared/templates/runbook.test.mjs`, `tests/server/runbook-stale.test.ts`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/templates/codex-bundle.test.mjs` | import: `codexRunbookVersion`, `runbookVersion` |
| `packages/core/templates/runbook.test.mjs` | import: `RUNBOOK_TEMPLATE`, `isRunbookVersion`, `runbookIsStale`, `runbookVersion` |
| `src/server/rest/harness-init.test.ts` | import: `runbookVersion` |
| `src/server/rest/runbook-handler.test.ts` | import: `runbookVersion` |
| `src/server/rest/runbook-handler.ts` | import: `isRunbookVersion`, `runbookVersion`, `codexRunbookVersion` |
| `src/server/templates/client-bundle-query.ts` | import: `codexRunbookVersion`, `isRunbookVersion` |
| `src/server/templates/runbook-query.ts` | import: `RUNBOOK_TEMPLATE`, `isRunbookVersion`, `runbookIsStale` |
| `plugin/bin/harness-init-dual.test.mjs` | import: `codexRunbookVersion` |
| `plugin/bin/harness-init.mjs` | import: `runbookVersion`, `codexRunbookVersion` |
| `plugin/bin/harness-init.test.mjs` | import: `runbookVersion` |
| `plugin/runtime/local-session.mjs` | import: `isRunbookVersion` |
| `plugin/runtime/mcp-client.mjs` | import: `isRunbookVersion`, `codexRunbookVersion` |
| `scripts/rehearsals/rehearse-acceptance-failure.ts` | import: `runbookIsStale`, `runbookVersion` |
| `scripts/rehearsals/rehearse-dual-client-runtime.ts` | import: `isRunbookVersion` |
| `tests/server/integration/client-runtime.test.ts` | import: `codexRunbookVersion` |
| `tests/server/integration/project-connection.test.ts` | import: `runbookVersion` |
| `tests/server/runbook-stale.test.ts` | import: `runbookVersion` |

#### packages/core/templates/template-boundary.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `STEP_HEADING`, `stubOf` | shared/universal — `packages/shared/templates/template-boundary.mjs`; 같은 이름; shared 내부, deliver 재수출만 외부 공개 |

현재 인접 시험: `packages/core/templates/template-boundary.test.mjs`.
새 검증 목적지: `packages/shared/templates/template-boundary.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/templates/codex-bundle.mjs` | import: `stubOf` |
| `packages/core/templates/codex-bundle.test.mjs` | import: `stubOf` |
| `packages/core/templates/deliver.mjs` | import: `stubOf` |
| `packages/core/templates/deliver.mjs` | reexport: `STEP_HEADING`, `stubOf` |
| `packages/core/templates/deliver.test.mjs` | import: `STEP_HEADING`, `stubOf` |
| `packages/core/templates/template-boundary.test.mjs` | import: `STEP_HEADING`, `stubOf` |
| `plugin/lib/templates/codex-bundle.mjs` | import: `stubOf` |
| `plugin/lib/templates/deliver.mjs` | import: `stubOf` |
| `plugin/lib/templates/deliver.mjs` | reexport: `STEP_HEADING`, `stubOf` |

#### packages/core/templates/vars.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `DEFAULT_SCOUT_QUESTION`, `buildVars`, `buildWorkspaceVars` | shared/universal — `packages/shared/templates/vars.mjs`; 같은 이름 |
| export | `buildReportTable`, `templateDescription` | plugin runtime/Node — `plugin/runtime/templates/metadata.mjs`; 같은 이름 |
| private | `bullets` | shared/universal — `packages/shared/templates/vars.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/templates/vars.test.mjs`.
새 검증 목적지: `packages/shared/templates/vars.test.mjs`, `plugin/runtime/templates/metadata.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/templates/vars.test.mjs` | import: `buildReportTable`, `buildVars`, `buildWorkspaceVars`, `templateDescription` |
| `src/server/agents/vars.test.ts` | import: `DEFAULT_SCOUT_QUESTION` |
| `src/server/agents/vars.ts` | import: `buildVars`, `buildWorkspaceVars` |
| `src/server/templates/release-service.ts` | import: `buildVars`, `buildWorkspaceVars` |
| `plugin/bin/harness-init.mjs` | import: `buildReportTable`, `buildVars`, `buildWorkspaceVars`, `templateDescription` |
| `plugin/bin/harness-init.test.mjs` | import: `DEFAULT_SCOUT_QUESTION` |
| `scripts/rehearsals/rehearse-acceptance-failure.ts` | import: `buildReportTable`, `buildVars`, `templateDescription` |
| `tests/templates/private-template-release.test.ts` | import: `buildWorkspaceVars` |

#### packages/core/tokens/token-validity.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `isTokenActive`, `parseTokenExpiry`, `parseTokenExpiryInput` | app-core/universal — `packages/app-core/tokens/validity.mjs`; 같은 이름 |

현재 인접 시험: `packages/core/tokens/token-validity.test.mjs`.
새 검증 목적지: `packages/app-core/tokens/validity.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/tokens/token-validity.test.mjs` | import: `isTokenActive`, `parseTokenExpiry`, `parseTokenExpiryInput` |
| `src/fsd/entities/project-token/ui/token-table.tsx` | import: `isTokenActive` |
| `src/fsd/features/manage-token/ui/token-issuance-form.tsx` | import: `parseTokenExpiryInput` |
| `src/fsd/features/manage-user-token/api/manage-user-token.server.ts` | import: `parseTokenExpiry` |
| `src/server/mcp/auth.ts` | import: `isTokenActive` |
| `src/server/rest/scope.ts` | import: `isTokenActive` |
| `src/server/tokens/project-token-service.ts` | import: `parseTokenExpiry` |

#### packages/core/tokens/token.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `TOKEN_KINDS`, `parseBearer` | shared/universal — `packages/shared/tokens/format.mjs`; 같은 이름 |
| export | `hashToken`, `newToken` | server/Node — `src/server/tokens/token-crypto.ts`; 같은 이름 |
| private | `prefixOf`, `tokenRe` | shared/universal — `packages/shared/tokens/format.mjs`; `prefixOf → tokenPrefix` |

현재 인접 시험: `packages/core/tokens/token.test.mjs`.
새 검증 목적지: `packages/shared/tokens/format.test.mjs`, `src/server/tokens/token-crypto.test.ts`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/core/tokens/token.test.mjs` | import: `hashToken`, `newToken`, `parseBearer` |
| `src/fsd/entities/project-token/model/connect-command.test.ts` | import: `TOKEN_KINDS` |
| `src/fsd/features/create-project/api/create-project.server.ts` | import: `newToken` |
| `src/fsd/features/manage-user-token/api/manage-user-token.server.ts` | import: `newToken` |
| `src/server/mcp/auth.test.mjs` | import: `newToken` |
| `src/server/mcp/auth.ts` | import: `hashToken`, `parseBearer` |
| `src/server/rest/harness-init.test.ts` | import: `newToken` |
| `src/server/rest/project-identity-handler.test.ts` | import: `newToken` |
| `src/server/rest/runbook-handler.test.ts` | import: `newToken` |
| `src/server/rest/runner-handler.test.ts` | import: `newToken` |
| `src/server/rest/scope.test.ts` | import: `newToken` |
| `src/server/rest/scope.ts` | import: `hashToken`, `parseBearer` |
| `src/server/rest/templates-handler.test.ts` | import: `newToken` |
| `src/server/tokens/project-token-service.test.ts` | import: `hashToken` |
| `src/server/tokens/project-token-service.ts` | import: `newToken` |
| `plugin/bin/harness-background.mjs` | import: `parseBearer` |
| `plugin/bin/harness-init-dual.test.mjs` | import: `newToken` |
| `plugin/bin/harness-session.mjs` | import: `parseBearer` |
| `plugin/bin/harness-watch.mjs` | import: `parseBearer` |
| `plugin/runtime/mcp-client.mjs` | import: `parseBearer` |
| `scripts/rehearsals/rehearse-acceptance-failure.ts` | import: `newToken` |
| `scripts/rehearsals/rehearse-account-usage-and-tokens.ts` | import: `newToken` |
| `scripts/rehearsals/rehearse-client-init-smoke.ts` | import: `newToken` |
| `scripts/rehearsals/rehearse-codex-macos.mjs` | import: `newToken` |
| `scripts/rehearsals/rehearse-pipeline-smoke.ts` | import: `newToken` |
| `scripts/rehearsals/rehearse-repository-disconnection.ts` | import: `newToken` |
| `tests/server/integration/project-connection.test.ts` | import: `newToken` |
| `tests/server/integration/project-registration.test.ts` | import: `newToken` |
| `tests/server/integration/request-rate-limit.test.ts` | import: `newToken` |
| `tests/server/integration/runner-client.test.ts` | import: `newToken` |
| `tests/server/integration/runner-lease.test.ts` | import: `newToken` |
| `tests/server/integration/templates.test.ts` | import: `newToken` |
| `tests/server/integration/token-usage.test.ts` | import: `newToken` |
| `tests/server/token-issuance-bindings.test.ts` | import: `hashToken` |
| `tests/server/token-usage-bindings.test.ts` | import: `newToken` |

#### packages/github/blob-url.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `blobHref` | FSD/universal — `src/fsd/entities/board-item/model/doc-link.ts`; 같은 이름 |
| private | `encodePathSegments` | FSD/universal — `src/fsd/entities/board-item/model/doc-link.ts`; 같은 이름 |

현재 인접 시험: `packages/github/blob-url.test.mjs`.
새 검증 목적지: `src/fsd/entities/board-item/model/doc-link.test.ts`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/github/blob-url.test.mjs` | import: `blobHref` |
| `src/fsd/entities/board-item/model/doc-link.ts` | reexport: `blobHref` |

#### packages/github/repo-url.mjs

| 종류 | 현재 이름 | 목표 소유자·경로와 이름 |
| --- | --- | --- |
| export | `SEGMENT`, `parseRepoUrl` | shared/universal — `packages/shared/github/repo-url.mjs`; 같은 이름 |
| private | `PATTERNS` | shared/universal — `packages/shared/github/repo-url.mjs`; 같은 이름 |

현재 인접 시험: `packages/github/repo-url.test.mjs`.
새 검증 목적지: `packages/shared/github/repo-url.test.mjs`. 혼합 시험은 해당 symbol의 사례를 분리하며 새 파일 수를 맞추기 위해 시험을 복제하지 않는다.

| 현재 직접 소비자 | 참조 종류와 symbol |
| --- | --- |
| `packages/github/repo-url.test.mjs` | import: `SEGMENT`, `parseRepoUrl` |
| `src/fsd/features/create-project/model/repo-url.test.ts` | import: `parseRepoUrl`, `SEGMENT` |
| `src/fsd/features/create-project/model/repo-url.ts` | import: `parseRepoUrl` |
| `src/fsd/features/create-project/model/repo-url.ts` | reexport: `SEGMENT` |
| `src/server/projects/slug-rule-sync.test.ts` | import: `SEGMENT` |
| `src/server/projects/slug-rule.ts` | reexport: `SEGMENT → REPO_SEGMENT` |
| `plugin/bin/harness-init.mjs` | import: `parseRepoUrl` |

### 재수출 이후의 소비자

아래는 앞 표의 직접 참조에서 끝내지 않고 재수출을 따라간 결과다. 중간 façade·slice 공개 이름은
유지하며 원본 import만 앞의 목표 경로로 바꾼다. 최종 소비자 자체의 기능·UI 계약은 보존한다.

| 원본 symbol | 경유 공개 경로 | 후속 소비자 | 참조 |
| --- | --- | --- | --- |
| `packages/core/pipeline/pipeline.mjs#Definition` | `src/fsd/features/edit-pipeline/model/rail-state.ts#Definition` | `src/fsd/features/edit-pipeline/model/pipeline-draft-state.test.ts` | `import: Definition` |
| `packages/core/pipeline/pipeline.mjs#Definition` | `src/fsd/features/edit-pipeline/model/rail-state.ts#Definition` | `src/fsd/features/edit-pipeline/model/pipeline-draft-state.ts` | `import: Definition` |
| `packages/core/pipeline/pipeline.mjs#PIPELINE_EDIT_PLAN_GATE` | `src/fsd/features/edit-pipeline/model/plan-gate.ts#PIPELINE_EDIT_PLAN_GATE` | `src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts` | `import: PIPELINE_EDIT_PLAN_GATE` |
| `packages/core/pipeline/pipeline.mjs#PIPELINE_EDIT_PLAN_GATE` | `src/fsd/features/edit-pipeline/model/plan-gate.ts#PIPELINE_EDIT_PLAN_GATE` | `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` | `import: PIPELINE_EDIT_PLAN_GATE` |
| `packages/core/plans/entitlement.mjs#OWNER_TOKEN_PLAN_GATE` | `src/fsd/features/manage-token/index.ts#OWNER_TOKEN_PLAN_GATE` | `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx` | `import: OWNER_TOKEN_PLAN_GATE` |
| `packages/core/plans/entitlement.mjs#OWNER_TOKEN_PLAN_GATE` | `src/fsd/features/manage-token/model/plan-gate.ts#OWNER_TOKEN_PLAN_GATE` | `src/fsd/features/manage-token/index.ts` | `reexport: OWNER_TOKEN_PLAN_GATE` |
| `packages/core/project-slug.mjs#RESERVED_SLUGS` | `src/fsd/features/create-project/model/project-slug.ts#RESERVED_SLUGS` | `src/fsd/features/create-project/api/create-project.server.ts` | `import: RESERVED_SLUGS` |
| `packages/core/project-slug.mjs#RESERVED_SLUGS` | `src/fsd/features/create-project/model/project-slug.ts#RESERVED_SLUGS` | `src/fsd/features/create-project/model/project-slug.test.ts` | `import: RESERVED_SLUGS` |
| `packages/core/project-slug.mjs#RESERVED_SLUGS` | `src/server/projects/api.ts#RESERVED_SLUGS` | `scripts/rehearsals/rehearse-codex-macos.mjs` | `dynamic: *` |
| `packages/core/project-slug.mjs#RESERVED_SLUGS` | `src/server/projects/api.ts#RESERVED_SLUGS` | `src/server/rest/project-registration.ts` | `import: RESERVED_SLUGS` |
| `packages/core/project-slug.mjs#RESERVED_SLUGS` | `src/server/projects/slug-rule.ts#RESERVED_SLUGS` | `src/server/projects/api.ts` | `reexport: RESERVED_SLUGS` |
| `packages/core/project-slug.mjs#RESERVED_SLUGS` | `src/server/projects/slug-rule.ts#RESERVED_SLUGS` | `src/server/projects/slug-rule.test.ts` | `import: RESERVED_SLUGS` |
| `packages/core/project-slug.mjs#RESERVED_SLUGS` | `src/server/projects/slug-rule.ts#RESERVED_SLUGS` | `tests/server/project-registration.test.ts` | `import: *` |
| `packages/core/project-slug.mjs#SLUG_MAX` | `src/fsd/features/create-project/model/project-slug.ts#SLUG_MAX` | `src/fsd/features/create-project/model/project-slug.test.ts` | `import: SLUG_MAX` |
| `packages/core/project-slug.mjs#SLUG_MAX` | `src/fsd/features/create-project/model/project-slug.ts#SLUG_MAX` | `src/fsd/features/create-project/model/repo-url.ts` | `import: SLUG_MAX` |
| `packages/core/project-slug.mjs#SLUG_MAX` | `src/server/projects/slug-rule.ts#SLUG_MAX` | `src/server/projects/slug-rule.test.ts` | `import: SLUG_MAX` |
| `packages/core/project-slug.mjs#SLUG_MAX` | `src/server/projects/slug-rule.ts#SLUG_MAX` | `tests/server/project-registration.test.ts` | `import: *` |
| `packages/core/project-slug.mjs#SLUG_RE` | `src/fsd/features/create-project/model/project-slug.ts#SLUG_RE` | `src/fsd/features/create-project/api/create-project.server.ts` | `import: SLUG_RE` |
| `packages/core/project-slug.mjs#SLUG_RE` | `src/fsd/features/create-project/model/project-slug.ts#SLUG_RE` | `src/fsd/features/create-project/model/project-slug.test.ts` | `import: SLUG_RE` |
| `packages/core/project-slug.mjs#SLUG_RE` | `src/server/projects/api.ts#SLUG_RE` | `scripts/rehearsals/rehearse-codex-macos.mjs` | `dynamic: *` |
| `packages/core/project-slug.mjs#SLUG_RE` | `src/server/projects/api.ts#SLUG_RE` | `src/server/rest/project-registration.ts` | `import: SLUG_RE` |
| `packages/core/project-slug.mjs#SLUG_RE` | `src/server/projects/slug-rule.ts#SLUG_RE` | `src/server/projects/api.ts` | `reexport: SLUG_RE` |
| `packages/core/project-slug.mjs#SLUG_RE` | `src/server/projects/slug-rule.ts#SLUG_RE` | `src/server/projects/slug-rule.test.ts` | `import: SLUG_RE` |
| `packages/core/project-slug.mjs#SLUG_RE` | `src/server/projects/slug-rule.ts#SLUG_RE` | `tests/server/project-registration.test.ts` | `import: *` |
| `packages/core/templates/template-boundary.mjs#STEP_HEADING` | `packages/core/templates/deliver.mjs#STEP_HEADING` | `packages/core/templates/deliver.test.mjs` | `import: STEP_HEADING` |
| `packages/core/templates/template-boundary.mjs#STEP_HEADING` | `packages/core/templates/deliver.mjs#STEP_HEADING` | `src/server/templates/steps.ts` | `import: STEP_HEADING` |
| `packages/core/templates/template-boundary.mjs#stubOf` | `packages/core/templates/deliver.mjs#stubOf` | `packages/core/templates/deliver.test.mjs` | `import: stubOf` |
| `packages/core/templates/template-boundary.mjs#stubOf` | `packages/core/templates/deliver.mjs#stubOf` | `plugin/bin/harness-init-dual.test.mjs` | `import: stubOf` |
| `packages/core/templates/template-boundary.mjs#stubOf` | `packages/core/templates/deliver.mjs#stubOf` | `src/server/rest/templates-handler.test.ts` | `import: stubOf` |
| `packages/core/templates/template-boundary.mjs#stubOf` | `packages/core/templates/deliver.mjs#stubOf` | `src/server/templates/steps.ts` | `import: stubOf` |
| `packages/github/blob-url.mjs#blobHref` | `src/fsd/entities/board-item/index.ts#blobHref` | `src/fsd/features/review-gate/model/inbox-item.ts` | `import: blobHref` |
| `packages/github/blob-url.mjs#blobHref` | `src/fsd/entities/board-item/index.ts#blobHref` | `src/fsd/features/review-gate/ui/inbox-card.test.mjs` | `import: blobHref` |
| `packages/github/blob-url.mjs#blobHref` | `src/fsd/entities/board-item/index.ts#blobHref` | `src/fsd/pages/board-item/model/item-docs.ts` | `import: blobHref` |
| `packages/github/blob-url.mjs#blobHref` | `src/fsd/entities/board-item/index.ts#blobHref` | `src/fsd/pages/board-item/ui/board-item-page.tsx` | `import: blobHref` |
| `packages/github/blob-url.mjs#blobHref` | `src/fsd/entities/board-item/index.ts#blobHref` | `src/fsd/widgets/history-feed/model/history-row.ts` | `import: blobHref` |
| `packages/github/blob-url.mjs#blobHref` | `src/fsd/entities/board-item/model/doc-link.ts#blobHref` | `src/fsd/entities/board-item/index.ts` | `reexport: blobHref` |
| `packages/github/blob-url.mjs#blobHref` | `src/fsd/entities/board-item/model/doc-link.ts#blobHref` | `src/fsd/entities/board-item/model/doc-link.test.ts` | `import: blobHref` |
| `packages/github/repo-url.mjs#SEGMENT` | `src/fsd/features/create-project/model/repo-url.ts#SEGMENT` | `src/fsd/features/create-project/api/create-project.server.ts` | `import: SEGMENT` |
| `packages/github/repo-url.mjs#SEGMENT` | `src/fsd/features/create-project/model/repo-url.ts#SEGMENT` | `src/fsd/features/create-project/model/repo-url.test.ts` | `import: SEGMENT` |
| `packages/github/repo-url.mjs#SEGMENT` | `src/server/projects/api.ts#REPO_SEGMENT` | `scripts/rehearsals/rehearse-codex-macos.mjs` | `dynamic: *` |
| `packages/github/repo-url.mjs#SEGMENT` | `src/server/projects/api.ts#REPO_SEGMENT` | `src/server/rest/project-registration.ts` | `import: REPO_SEGMENT` |
| `packages/github/repo-url.mjs#SEGMENT` | `src/server/projects/api.ts#REPO_SEGMENT` | `tests/server/project-connection-bindings.test.ts` | `import: REPO_SEGMENT` |
| `packages/github/repo-url.mjs#SEGMENT` | `src/server/projects/slug-rule.ts#REPO_SEGMENT` | `src/server/projects/api.ts` | `reexport: REPO_SEGMENT` |
| `packages/github/repo-url.mjs#SEGMENT` | `src/server/projects/slug-rule.ts#REPO_SEGMENT` | `src/server/projects/slug-rule-sync.test.ts` | `import: REPO_SEGMENT` |
| `packages/github/repo-url.mjs#SEGMENT` | `src/server/projects/slug-rule.ts#REPO_SEGMENT` | `tests/server/project-registration.test.ts` | `import: *` |

### 문자열·계산 경로·fixture·glob·지침의 전환

위 AST 간선에 나오지 않는 참조도 포함한다. 코드를 문자열로 읽는 VM mock은 새 import 이름을
같은 변경에서 맞춰야 한다. 동적 경로가 shared 원본의 계산형 import가 아니라 시험/도구의
fixture·설치 디렉터리 선택이면 그 실행 소유자와 기존 플랫폼 시험으로 검증한다.

| 현재 소비자 | MIGRATE 처리와 검증 목적지 |
| --- | --- |
| `package.json` | npm test의 core/github 재귀 glob을 shared/app-core로, runtime glob을 재귀로 전환. test:web/server/scripts·typecheck의 이동 시험 발견도 대조 |
| `tsconfig.json` | core/github alias를 shared/app-core로 교체. 기존 타입 선언 분할과 type-only import를 typecheck로 검증 |
| `scripts/plugin-lib.mjs`, `scripts/plugin-lib.test.mjs` | 전체 디렉터리 복사를 명세+closure로 전환. fixture tree·drift/orphan·무변경·재실행을 VFY-SMB-03에서 확인 |
| `scripts/checks/verify-fsd-boundaries.mjs`, `scripts/checks/verify-fsd-boundaries.test.mjs` | alias resolver·탐색 루트·fixture 경로를 전환. 새 shared 검사와 FSD/browser node 금지 검증을 연결 |
| `scripts/checks/verify-server-boundaries.mjs`, `scripts/checks/verify-server-boundaries.test.mjs` | pipeline → templates 방향과 새 공개 API·type-only 참조를 검사. 현행 registry를 실제 이동 시험에 맞춰 갱신 |
| `tests/server/fixtures/load-module.ts` | @harness/core 문자열 resolver를 새 shared/app-core 경로로 전환. VM dependency key와 server façade 변경을 아래 모든 fixture 소비자에서 대조 |
| `tests/plugin/template-fixture.mjs` | 새 shared render·release-contract와 plugin 설치 모듈의 경로를 연결. template cache/설치 시험의 실제 fixture body 확인 |
| `scripts/rehearsals/rehearse-codex-macos.mjs` | token 동적 import 예외 적용. packageRoot로 계산하는 native runtime 경로와 기존 helper-import 시험 보존 |
| `scripts/rehearsals/pipeline-smoke-steps.test.mjs`, `AGENTS.md` | core pipeline/templates에서 나뉘는 모든 새 소유 경로를 promotion path 조건에 반영, 누락·과잉 gate 경로 검사 |
| `.github/workflows/macos-runtime-contracts.yml`, `.github/workflows/windows-role-runtime.yml` | path filter와 실제 test glob 모두 전환. CI coverage 표·verify-ci-coverage와 양 OS 발견/실행/skip 구분 확인 |
| `scripts/macos/package-plugin.mjs`, `scripts/macos/package-plugin.test.mjs`, `scripts/windows/package-windows-plugin.mjs`, `scripts/windows/package-windows-plugin.test.mjs` | 공통 출하 predicate 재사용. lib 집합과 native Node·verifier·license·mode·설치 자원의 최종 bundle 확인 |
| `scripts/checks/verify-plugin-version.mjs`, `scripts/checks/verify-plugin-version.test.mjs` | 실제 출하 판정은 패키저와 동일하게 유지. 양 manifest 버전은 출하 변경을 기준으로 함께 결정 |
| `plugin/skills/watch/SKILL.md` | 열거한 lib/qa·runner·watch·config·token·manifest·release·limits 경로를 새 lib/runtime 소유자로 전환. hook 권한·실행 의미 보존 |
| `plugin/skills/init/SKILL.md` | lib/github/repo-url 경로는 유지됨을 확인. init의 실제 parser·origin 대조와 일치하도록 검증 |
| `plugin/hooks/`, `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | 현재 core/lib 직접 경로 참조 없음. helper entrypoint·hook 실행 순서 보존, 실제 출하 버전만 MIGRATE에서 함께 갱신 |
| `packages/core/README.md`, `plugin/README.md`, 루트 `README.md`, `AGENTS.md` | 실제 원본·alias·복사·gate 경로를 MIGRATE에서 갱신. ARCH에서는 출하 문서와 실행 지시를 변경하지 않음 |
| `CONTEXT.md` | 경로 문자열은 구현 위치에 대한 조사 근거일 뿐 도메인 의미 변경 없음. 역사·도메인 정의의 기계적 경로 치환 금지 |
| `docs/architecture/{README,core,github,fsd,server,verification,test-organization,protocol,macos-runtime}.md` | ARCH 예정 참조를 MIGRATE 때 현행 규칙으로 전환. registry·coverage와 실제 구현을 함께 맞춤 |
| `docs/architecture/{pipeline-execution,system-overview,test-writing}.md` | 현행 코드 예시의 경로는 MIGRATE 때 실소유자로 변경. ARCH의 문서 변경 범위에는 추가하지 않음 |

다음은 AST의 직접 소비자 집합과 별도로 원본·alias·lib 경로 문자열이 확인된 파일 전수다.
표의 심볼과 위 변환 규칙을 적용하며 시험 본문/fixture 문자열은 같은 파일에서 새 목적지를 검증한다.
생산 원본 및 생성 lib는 원본별 표로 이미 다뤘으므로 이 목록에서 제외했다.


| 문자열 참조 파일 | 현재 원본 키 |
| --- | --- |
| `plugin/bin/harness-background.mjs` | `packages/core/execution/watch.mjs`, `packages/core/plans/entitlement.mjs`, `packages/core/tokens/token.mjs` |
| `plugin/bin/harness-codex.mjs` | `packages/core/execution/client-runtime.mjs` |
| `plugin/bin/harness-commit-guard.mjs` | `packages/core/plans/entitlement.mjs` |
| `plugin/bin/harness-init-dual.test.mjs` | `packages/core/execution/client-runtime.mjs`, `packages/core/qa.mjs`, `packages/core/templates/codex-bundle.mjs`, `packages/core/templates/deliver.mjs`, `packages/core/templates/manifest.mjs`, `packages/core/templates/render.mjs`, `packages/core/templates/runbook.mjs`, `packages/core/tokens/token.mjs` |
| `plugin/bin/harness-init.mjs` | `packages/core/configuration/harness-config.mjs`, `packages/core/execution/client-runtime.mjs`, `packages/core/plans/entitlement.mjs`, `packages/core/templates/codex-bundle.mjs`, `packages/core/templates/deliver.mjs`, `packages/core/templates/manifest.mjs`, `packages/core/templates/release-manifest.mjs`, `packages/core/templates/render.mjs`, `packages/core/templates/runbook.mjs`, `packages/core/templates/vars.mjs`, `packages/github/repo-url.mjs` |
| `plugin/bin/harness-init.test.mjs` | `packages/core/plans/entitlement.mjs`, `packages/core/templates/deliver.mjs`, `packages/core/templates/runbook.mjs`, `packages/core/templates/vars.mjs` |
| `plugin/bin/harness-qa-browser.test.mjs` | `packages/core/qa.mjs` |
| `plugin/bin/harness-role-files.test.mjs` | `packages/core/qa.mjs` |
| `plugin/bin/harness-session.mjs` | `packages/core/execution/client-runtime.mjs`, `packages/core/tokens/token.mjs` |
| `plugin/bin/harness-session.test.mjs` | `packages/core/execution/client-runtime.mjs`, `packages/core/qa.mjs` |
| `plugin/bin/harness-skill-references.test.mjs` | `packages/core/plans/entitlement.mjs` |
| `plugin/bin/harness-watch.mjs` | `packages/core/configuration/harness-config.mjs`, `packages/core/execution/watch.mjs`, `packages/core/tokens/token.mjs` |
| `plugin/bin/harness-watch.test.mjs` | `packages/core/execution/client-runtime.mjs` |
| `plugin/runtime/background.mjs` | `packages/core/execution/runner.mjs`, `packages/core/execution/watch.mjs` |
| `plugin/runtime/codex-agent.mjs` | `packages/core/execution/client-runtime.mjs`, `packages/core/qa.mjs` |
| `plugin/runtime/codex-thread.mjs` | `packages/core/qa.mjs` |
| `plugin/runtime/local-session.mjs` | `packages/core/execution/watch.mjs`, `packages/core/templates/runbook.mjs` |
| `plugin/runtime/mcp-client.mjs` | `packages/core/configuration/harness-config.mjs`, `packages/core/execution/client-runtime.mjs`, `packages/core/execution/watch.mjs`, `packages/core/templates/codex-bundle.mjs`, `packages/core/templates/release-manifest.mjs`, `packages/core/templates/runbook.mjs`, `packages/core/tokens/token.mjs` |
| `plugin/runtime/qa-browser.mjs` | `packages/core/qa.mjs` |
| `plugin/runtime/runner-client.mjs` | `packages/core/execution/runner.mjs` |
| `plugin/runtime/template-installation.mjs` | `packages/core/configuration/harness-config.mjs`, `packages/core/templates/manifest.mjs`, `packages/core/templates/release-manifest.mjs` |
| `plugin/skills/init/SKILL.md` | `packages/github/repo-url.mjs` |
| `plugin/skills/watch/SKILL.md` | `packages/core/configuration/harness-config.mjs`, `packages/core/configuration/workspaces.mjs`, `packages/core/execution/client-runtime.mjs`, `packages/core/execution/runner.mjs`, `packages/core/execution/watch.mjs`, `packages/core/plans/entitlement.mjs`, `packages/core/qa.mjs`, `packages/core/templates/codex-bundle.mjs`, `packages/core/templates/deliver.mjs`, `packages/core/templates/manifest.mjs`, `packages/core/templates/release-manifest.mjs`, `packages/core/templates/runbook.mjs`, `packages/core/templates/template-boundary.mjs`, `packages/core/tokens/token.mjs` |
| `scripts/checks/transitions-contract.test.ts` | `packages/core/pipeline/transitions.mjs` |
| `scripts/checks/verify-fsd-boundaries.test.mjs` | `packages/core/pipeline/transitions.mjs`, `packages/core/project-slug.mjs`, `packages/github/blob-url.mjs`, `packages/github/repo-url.mjs` |
| `scripts/grant-plan.ts` | `packages/core/plans/entitlement.mjs` |
| `scripts/plugin-lib.test.mjs` | `packages/core/templates/render.mjs`, `packages/github/blob-url.mjs`, `packages/github/repo-url.mjs` |
| `scripts/rehearsals/rehearse-acceptance-failure.ts` | `packages/core/configuration/harness-config.mjs`, `packages/core/templates/deliver.mjs`, `packages/core/templates/render.mjs`, `packages/core/templates/runbook.mjs`, `packages/core/templates/vars.mjs`, `packages/core/tokens/token.mjs` |
| `scripts/rehearsals/rehearse-account-usage-and-tokens.ts` | `packages/core/tokens/token.mjs` |
| `scripts/rehearsals/rehearse-backlog-pipeline.ts` | `packages/core/pipeline/pipeline.mjs` |
| `scripts/rehearsals/rehearse-client-init-smoke.ts` | `packages/core/tokens/token.mjs` |
| `scripts/rehearsals/rehearse-codex-macos.mjs` | `packages/core/tokens/token.mjs` |
| `scripts/rehearsals/rehearse-dual-client-runtime.ts` | `packages/core/configuration/harness-config.mjs`, `packages/core/templates/runbook.mjs` |
| `scripts/rehearsals/rehearse-multiple-pipelines.ts` | `packages/core/pipeline/pipeline.mjs` |
| `scripts/rehearsals/rehearse-pipeline-smoke.ts` | `packages/core/tokens/token.mjs` |
| `scripts/rehearsals/rehearse-repository-disconnection.ts` | `packages/core/tokens/token.mjs` |
| `scripts/rehearsals/rehearse-web-http-contracts.ts` | `packages/core/pipeline/pipeline.mjs` |
| `scripts/templates/bootstrap-template-releases.ts` | `packages/core/templates/release-manifest.mjs` |
| `scripts/templates/template-seed-query.test.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/plans/entitlement.mjs`, `packages/core/templates/codex-bundle.mjs` |
| `scripts/templates/template-seed-query.ts` | `packages/core/templates/codex-bundle.mjs` |
| `scripts/templates/template-target.ts` | `packages/core/templates/release-manifest.mjs` |
| `src/app/(app)/p/[slug]/pipeline/page.tsx` | `packages/core/pipeline/pipeline.mjs` |
| `src/app/(app)/p/[slug]/tokens/page.tsx` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/entities/account-plan/model/plan-label.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/entities/board-item/model/doc-link.ts` | `packages/github/blob-url.mjs` |
| `src/fsd/entities/board-item/model/inbox-gate.ts` | `packages/core/pipeline/transitions.mjs` |
| `src/fsd/entities/board-item/model/text-budget.ts` | `packages/core/pipeline/transitions.mjs` |
| `src/fsd/entities/pipeline/model/gate-copy.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/entities/pipeline/model/labels.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/entities/pipeline/model/labels.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/entities/project-token/model/connect-command.test.ts` | `packages/core/tokens/token.mjs` |
| `src/fsd/entities/project-token/ui/owner-token-reveal.tsx` | `packages/core/execution/client-runtime.mjs` |
| `src/fsd/entities/project-token/ui/token-reveal.tsx` | `packages/core/execution/client-runtime.mjs` |
| `src/fsd/entities/project-token/ui/token-table.tsx` | `packages/core/tokens/token-validity.mjs` |
| `src/fsd/features/create-project/api/create-project.server.ts` | `packages/core/tokens/token.mjs` |
| `src/fsd/features/create-project/model/project-slug.test.ts` | `packages/core/project-slug.mjs` |
| `src/fsd/features/create-project/model/project-slug.ts` | `packages/core/project-slug.mjs` |
| `src/fsd/features/create-project/model/repo-url.test.ts` | `packages/github/repo-url.mjs` |
| `src/fsd/features/create-project/model/repo-url.ts` | `packages/github/repo-url.mjs` |
| `src/fsd/features/edit-backlog/api/edit-backlog.server.ts` | `packages/core/pipeline/backlog.mjs` |
| `src/fsd/features/edit-backlog/ui/backlog-form.tsx` | `packages/core/pipeline/backlog.mjs` |
| `src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/api/pipeline-settings.server.ts` | `packages/core/pipeline/backlog.mjs`, `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/model/insertion-conflicts.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/model/insertion-conflicts.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/model/pipeline-catalog.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/model/pipeline-save-state.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/model/plan-gate.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/model/rail-state.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/model/rail-state.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/ui/pipeline-list.tsx` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/edit-pipeline/ui/pipeline-rules-panel.tsx` | `packages/core/pipeline/backlog.mjs` |
| `src/fsd/features/manage-project-connection/model/project-connection-state.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/features/manage-token/model/plan-gate.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/features/manage-token/ui/token-issuance-form.tsx` | `packages/core/tokens/token-validity.mjs` |
| `src/fsd/features/manage-user-token/api/manage-user-token.server.ts` | `packages/core/tokens/token-validity.mjs`, `packages/core/tokens/token.mjs` |
| `src/fsd/features/review-gate/model/gate-source.ts` | `packages/core/pipeline/transitions.mjs` |
| `src/fsd/features/review-gate/model/gate-text.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/pipeline/transitions.mjs` |
| `src/fsd/features/review-gate/model/inbox-item.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/features/select-project-for-use/model/select-project-state.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/pages/billing/model/plan-matrix.test.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/pages/billing/model/plan-matrix.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/pages/billing/ui/billing-page.tsx` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/pages/board-item/api/board-item-page.server.ts` | `packages/core/pipeline/work-selection.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/fsd/pages/board-item/ui/board-item-page.tsx` | `packages/core/pipeline/work-selection.mjs` |
| `src/fsd/pages/docs/model/docs-facts.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/pipeline/pipeline.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/fsd/pages/docs/ui/docs-copy.test.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/fsd/pages/project-backlog/api/project-backlog-page.server.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/pages/project-board/api/project-board.server.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/pages/project-board/model/briefing.test.mjs` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/pages/project-board/model/briefing.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/pages/project-board/ui/project-board-page.test.mjs` | `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/pages/project-history/api/project-history.server.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/pages/project-list/model/project-list-copy.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/widgets/app-header/api/app-header.server.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/widgets/app-header/ui/app-header.tsx` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/widgets/turn-banner/api/turn-data.server.ts` | `packages/core/execution/runner.mjs`, `packages/core/pipeline/pipeline.mjs` |
| `src/fsd/widgets/turn-banner/model/next-step.test.ts` | `packages/core/execution/client-runtime.mjs` |
| `src/fsd/widgets/turn-banner/model/next-step.ts` | `packages/core/execution/client-runtime.mjs` |
| `src/fsd/widgets/turn-banner/model/runner.test.ts` | `packages/core/execution/runner.mjs` |
| `src/fsd/widgets/turn-banner/model/runner.ts` | `packages/core/execution/runner.mjs` |
| `src/fsd/widgets/turn-banner/model/setup-detail.ts` | `packages/core/execution/client-runtime.mjs` |
| `src/fsd/widgets/turn-banner/model/turn.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/pipeline/pipeline.mjs`, `packages/core/pipeline/transitions.mjs` |
| `src/fsd/widgets/turn-banner/ui/next-step.tsx` | `packages/core/execution/client-runtime.mjs` |
| `src/fsd/widgets/turn-banner/ui/turn-banner.test.ts` | `packages/core/plans/entitlement.mjs` |
| `src/fsd/widgets/turn-banner/ui/turn-banner.tsx` | `packages/core/execution/client-runtime.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/server/agents/next.test.ts` | `packages/core/plans/usage-window.mjs` |
| `src/server/agents/next.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/pipeline/transitions.mjs`, `packages/core/plans/entitlement.mjs`, `packages/core/templates/release-manifest.mjs`, `packages/core/templates/render.mjs` |
| `src/server/agents/run-service.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/server/agents/vars.test.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/templates/vars.mjs` |
| `src/server/agents/vars.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/templates/vars.mjs` |
| `src/server/mcp/auth.test.mjs` | `packages/core/tokens/token.mjs` |
| `src/server/mcp/auth.ts` | `packages/core/tokens/token-validity.mjs`, `packages/core/tokens/token.mjs` |
| `src/server/mcp/deps.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/server/mcp/owner-tools.ts` | `packages/core/plans/entitlement.mjs` |
| `src/server/mcp/tools.ts` | `packages/core/configuration/workspaces.mjs`, `packages/core/execution/client-runtime.mjs`, `packages/core/pipeline/backlog.mjs`, `packages/core/pipeline/work-selection.mjs`, `packages/core/templates/release-manifest.mjs` |
| `src/server/pipeline/automatic-scout.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/server/pipeline/board-rules.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/pipeline/transitions.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/server/pipeline/board-service.ts` | `packages/core/pipeline/backlog.mjs`, `packages/core/pipeline/pipeline.mjs`, `packages/core/pipeline/run-input.mjs`, `packages/core/pipeline/transitions.mjs`, `packages/core/pipeline/work-selection.mjs`, `packages/core/plans/entitlement.mjs`, `packages/core/qa.mjs` |
| `src/server/pipeline/codex-handoff-query.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/server/pipeline/current-execution-query.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/server/pipeline/lock-pipeline.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/server/pipeline/qa-query.ts` | `packages/core/qa.mjs` |
| `src/server/pipeline/run-request.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/pipeline/run-input.mjs` |
| `src/server/pipeline/run-rules.test.mjs` | `packages/core/pipeline/pipeline.mjs`, `packages/core/pipeline/transitions.mjs` |
| `src/server/pipeline/run-rules.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/pipeline/transitions.mjs` |
| `src/server/pipeline/run-service.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/pipeline/run-input.mjs` |
| `src/server/pipeline/save-definition.ts` | `packages/core/pipeline/pipeline.mjs` |
| `src/server/pipeline/settings-service.ts` | `packages/core/pipeline/backlog.mjs`, `packages/core/pipeline/pipeline.mjs` |
| `src/server/pipeline/template-selection.ts` | `packages/core/templates/release-manifest.mjs` |
| `src/server/pipeline/work-run.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/pipeline/transitions.mjs`, `packages/core/pipeline/work-selection.mjs` |
| `src/server/projects/access-query.ts` | `packages/core/plans/entitlement.mjs` |
| `src/server/projects/availability-service.ts` | `packages/core/pipeline/transitions.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/server/projects/connection-service.ts` | `packages/core/plans/entitlement.mjs` |
| `src/server/projects/registration-command.ts` | `packages/core/plans/entitlement.mjs` |
| `src/server/projects/slug-rule-sync.test.ts` | `packages/github/repo-url.mjs` |
| `src/server/projects/slug-rule.test.ts` | `packages/core/project-slug.mjs` |
| `src/server/projects/slug-rule.ts` | `packages/core/project-slug.mjs`, `packages/github/repo-url.mjs` |
| `src/server/projects/sync-workspaces.ts` | `packages/core/configuration/workspaces.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/server/rest/harness-init.test.ts` | `packages/core/templates/release-manifest.mjs`, `packages/core/templates/runbook.mjs`, `packages/core/tokens/token.mjs` |
| `src/server/rest/project-identity-handler.test.ts` | `packages/core/tokens/token.mjs` |
| `src/server/rest/runbook-handler.test.ts` | `packages/core/templates/runbook.mjs`, `packages/core/tokens/token.mjs` |
| `src/server/rest/runbook-handler.ts` | `packages/core/templates/release-manifest.mjs`, `packages/core/templates/runbook.mjs` |
| `src/server/rest/runner-handler.test.ts` | `packages/core/plans/entitlement.mjs`, `packages/core/tokens/token.mjs` |
| `src/server/rest/runner-handler.ts` | `packages/core/execution/runner.mjs` |
| `src/server/rest/scope.test.ts` | `packages/core/tokens/token.mjs` |
| `src/server/rest/scope.ts` | `packages/core/tokens/token-validity.mjs`, `packages/core/tokens/token.mjs` |
| `src/server/rest/templates-handler.test.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/plans/entitlement.mjs`, `packages/core/templates/codex-bundle.mjs`, `packages/core/templates/deliver.mjs`, `packages/core/tokens/token.mjs` |
| `src/server/rest/templates-handler.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/templates/deliver.mjs`, `packages/core/templates/release-manifest.mjs` |
| `src/server/runners/runner-service.test.ts` | `packages/core/execution/runner.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/server/runners/runner-service.ts` | `packages/core/execution/runner.mjs`, `packages/core/plans/entitlement.mjs` |
| `src/server/templates/bootstrap-service.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/templates/release-manifest.mjs` |
| `src/server/templates/client-bundle-query.test.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/templates/codex-bundle.mjs` |
| `src/server/templates/client-bundle-query.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/plans/entitlement.mjs`, `packages/core/templates/codex-bundle.mjs`, `packages/core/templates/runbook.mjs` |
| `src/server/templates/release-protocol.ts` | `packages/core/templates/release-manifest.mjs` |
| `src/server/templates/release-query.ts` | `packages/core/templates/release-manifest.mjs` |
| `src/server/templates/release-service.ts` | `packages/core/templates/release-manifest.mjs`, `packages/core/templates/render.mjs`, `packages/core/templates/vars.mjs` |
| `src/server/templates/runbook-query.ts` | `packages/core/templates/runbook.mjs` |
| `src/server/templates/steps.ts` | `packages/core/pipeline/transitions.mjs`, `packages/core/templates/deliver.mjs` |
| `src/server/tokens/project-token-service.test.ts` | `packages/core/tokens/token.mjs` |
| `src/server/tokens/project-token-service.ts` | `packages/core/plans/entitlement.mjs`, `packages/core/tokens/token-validity.mjs`, `packages/core/tokens/token.mjs` |
| `src/server/usage/account-usage-query.ts` | `packages/core/plans/usage-window.mjs` |
| `src/server/usage/request-rate-service.ts` | `packages/core/request-rate.mjs` |
| `tests/plugin/template-fixture.mjs` | `packages/core/templates/manifest.mjs`, `packages/core/templates/release-manifest.mjs` |
| `tests/server/fixtures/frontend-ux-browser.tsx` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/fixtures/src-clean-code-browser.tsx` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/github-create-project.test.ts` | `packages/core/tokens/token.mjs` |
| `tests/server/integration/automatic-scout.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/integration/client-runtime.test.ts` | `packages/core/execution/client-runtime.mjs`, `packages/core/templates/codex-bundle.mjs`, `packages/core/templates/runbook.mjs` |
| `tests/server/integration/history-items.test.ts` | `packages/core/plans/entitlement.mjs` |
| `tests/server/integration/impl-verifier.test.ts` | `packages/core/execution/watch.mjs` |
| `tests/server/integration/pipeline-composition.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/integration/pipeline-materialization.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/integration/pipeline-routing.test.ts` | `packages/core/pipeline/backlog.mjs` |
| `tests/server/integration/pipeline-save.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/integration/pipeline-settings.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/integration/pipeline-work-nodes.test.ts` | `packages/core/pipeline/pipeline.mjs`, `packages/core/pipeline/work-selection.mjs` |
| `tests/server/integration/project-connection.test.ts` | `packages/core/templates/runbook.mjs`, `packages/core/tokens/token.mjs` |
| `tests/server/integration/project-history.test.ts` | `packages/core/plans/entitlement.mjs` |
| `tests/server/integration/project-registration.test.ts` | `packages/core/tokens/token.mjs` |
| `tests/server/integration/request-rate-limit.test.ts` | `packages/core/request-rate.mjs`, `packages/core/tokens/token.mjs` |
| `tests/server/integration/runner-client.test.ts` | `packages/core/tokens/token.mjs` |
| `tests/server/integration/runner-lease.test.ts` | `packages/core/tokens/token.mjs` |
| `tests/server/integration/template-bootstrap.test.ts` | `packages/core/templates/release-manifest.mjs` |
| `tests/server/integration/template-execution.test.ts` | `packages/core/templates/release-manifest.mjs` |
| `tests/server/integration/template-release-support.ts` | `packages/core/templates/release-manifest.mjs` |
| `tests/server/integration/templates.test.ts` | `packages/core/tokens/token.mjs` |
| `tests/server/integration/token-usage.test.ts` | `packages/core/tokens/token.mjs` |
| `tests/server/pipeline-settings.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/project-guard.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/project-history.test.ts` | `packages/core/plans/entitlement.mjs` |
| `tests/server/project-page-loaders.test.ts` | `packages/core/pipeline/pipeline.mjs` |
| `tests/server/runbook-stale.test.ts` | `packages/core/templates/runbook.mjs` |
| `tests/server/token-issuance-bindings.test.ts` | `packages/core/tokens/token.mjs` |
| `tests/server/token-usage-bindings.test.ts` | `packages/core/tokens/token.mjs` |
| `tests/templates/private-template-release.test.ts` | `packages/core/configuration/harness-config.mjs`, `packages/core/pipeline/transitions.mjs`, `packages/core/templates/release-manifest.mjs`, `packages/core/templates/vars.mjs` |

전체 가족 경로 검색은 packages/core·packages/github·@harness·plugin/lib와 경로 분할 문자열을
포함했다. 일반 reconciliation skill의 예시 `lib/utils` 같은 다른 프로젝트 경로는 전환하지 않는다.
앞의 표에 있는 경계 검사·패키저·version·CI 도구는 구현 때 그 시점의 공통 모듈을 다시 확인한다.
MIGRATE 후에는 이전 원본·alias 참조가 제품/시험/도구에서 남지 않았는지 다시 전수 검색하고,
보존할 역사 문서나 외부 fixture는 이유를 기록한다. 목록의 개수만 맞추는 검증은 허용하지 않는다.


## Architecture and ADR

ARCH는 아래 architecture·ADR의 적용 예정 부분과 전환 기록을 작성했다. 실제 경로·검사·출하 안내의 현행 전환은 MIGRATE가 소유한다.

| 문서 | 변경 책임 |
| --- | --- |
| 제안 `docs/architecture/shared-modules.md` | 네 영역의 소유권·공개 경로·실행 환경·배포 명세·의존성의 단일 기준 |
| `docs/architecture/core.md`, `github.md` | 전환 중 현재 규칙과 적용 예정 규칙을 구별. 전환 완료 시 중복 규칙 제거·통합 문서로 안내 |
| `docs/architecture/README.md`, `fsd.md`, `server.md` | 최상위 구조·alias·server 공개 진입점·초기화 경계·내부 시험 등록을 맞춤 |
| `docs/architecture/verification.md`, `test-organization.md` | 검사 책임·탐색 경로·CI 범위·명령을 갱신. test-writing의 의미 중심 기준은 보존 |
| `docs/architecture/protocol.md`, `macos-runtime.md` | 소스/배포 모듈 경로와 설치 계약의 실제 변경분만 반영 |
| `docs/ADR/`의 새 결정 문서 | 선택 이유·대안·비용·적용 조건. 번호는 작성 시 기존 목록에서 결정 |
| AGENTS·루트 README·plugin README·packages README | 현재 core/github 배치, alias·명령, 승격 path 목록을 새 소유권에 맞춤 |
| 이 proposal | 전환 순서·작업/검증 기록. 영구 규칙의 중복 사본으로 유지하지 않음 |

ADR-0005/0007의 과거 결정 이유와 당시 기록은 보존한다. 새로운 ADR에서 무엇을 대체하는지
밝히고 기존 문서의 상태/연결만 갱신한다. 설계 확정 후 architecture에 목표 구조를 기록할 때는
적용 예정임을 표시하고 현행 규칙·체커와 구별한다. Phase MIGRATE가 완료된 revision에서 새
구조를 현행으로 전환한다. 문서만 먼저 바꿔 기존 import를 위반으로 취급하거나 검사를 비활성화하지 않는다.

## Affected Files and Coupled Changes

- 원본 27개와 인접 시험·타입 선언, 새 shared/app-core, 위 표의 server/FSD/plugin 소유 파일.
- `src`, `plugin/bin`, `plugin/runtime`, `scripts`, `tests`의 import·재수출·동적 fixture 경로.
  서버 공개 API를 통해 접근하며 DB 초기화가 없는 기존 도구에 DB 연결을 새로 요구하지 않는다.
- `scripts/plugin-lib.mjs`와 시험, 양 OS 패키저와 시험, 버전 검사와 시험.
- `scripts/checks/verify-fsd-boundaries.mjs`, `verify-server-boundaries.mjs`와 시험.
  필요한 신규 공유 경계 검사는 제안 `scripts/checks/verify-shared-boundaries.mjs`가 소유하고
  `check`에 연결한다. 기존 parser를 활용하되 범용 번들러를 만들지 않는다.
- `tsconfig.json`, `package.json`의 alias·시험 범위·검사 연결. 설치 플러그인의 실행 방식은 유지한다.
- `.github/workflows/macos-runtime-contracts.yml`, `windows-role-runtime.yml` 등 실제 경로 필터·
  시험 목록을 가진 workflow와 `verify-ci-coverage.mjs`의 탐색 가정. 작업 시작 시 최신 상태로 재대조한다.
- `plugin/skills/watch/SKILL.md` 등의 모듈 경로 안내, plugin README와 경로를 읽는 계약 시험.
  지침의 승인·중단·권한 의미와 verifier 패키지의 완전성은 바꾸지 않는다.
- AGENTS의 pipeline-smoke 대상 경로와 이를 검사하는
  `scripts/rehearsals/pipeline-smoke-steps.test.mjs`. 옛 packages 경로를 지워 게이트가 누락되지 않게
  새 shared/app-core/server/runtime 위치를 같은 변경에 연결한다.
- `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json`: 실제 출하 변경의
  최종 버전을 함께 갱신하며 이 문서에서 버전 숫자를 미리 고정하지 않는다.

새 하위 runtime 폴더로 시험을 옮기면 현재 `plugin/runtime/*.test.mjs`가 발견하지 못한다.
재귀 탐색으로 변경하고 실제 실행 파일 목록을 확인한다. shared/app-core의 시험도 기존
`npm test` 경로와 CI를 함께 바꾼다. server/FSD로 옮긴 시험은 해당 실행 환경으로 옮기며,
server-only bootstrap이 필요한 조합은 `tests/server`, DB 조합은 `tests/server/integration`을 따른다.
현재 루트 src/app 시험 배치 금지와 OS별 실행·skip 구분은 유지한다.

## Safety Analysis

아래는 설계의 보존 범위와 현재 조사 수준이다. 체크아웃을 읽은 사실과 변경 후 동작이
검증됐다는 사실을 구분하며, 구현 후 검증은 VFY-SMB-02~05가 담당한다.

| 경계 | 확인한 사실과 보존·검증 방법 |
| --- | --- |
| 앱 진입점·라우팅·정적 URL | 경로 import 전환은 있지만 route·public asset·사용자 URL을 변경할 요구는 없음. slug와 blob URL의 출력·인코딩은 기존 사례로 보존 |
| 정적 import·재수출 | 현재 source와 소비자를 조사. 새 공개 경로·server facade·시험 fixture 경로를 한 변경에서 전환 |
| 동적 import·native asset | macOS dispatcher의 계산형 import는 기존 bin task들을 선택함. helper·OS asset은 기존 소유자가 유지하며 private 템플릿의 경로 참조는 BLK-SMB-01에서 인수 |
| 타입·공개 API | 기존 `.d.mts`와 타입 전용 소비자는 이동 대상. export·mock·소스 읽기 시험이 빠지지 않도록 목록과 실제 type/build 검증을 연결 |
| 초기화·IO | 토큰·release 함수를 server로 옮기더라도 기존 순수 도구의 import에 DB 초기화를 추가하지 않음. 새 facade의 전이 의존성을 검사 |
| API·권한·저장 상태 | HTTP/MCP 응답, local lock, 서버 행, 토큰 형식, QA 허용 도구·거부 조건을 그대로 유지. schema·권한 변경이 필요해지면 이 구조 변경과 분리해 설계 |
| 구버전 설치와 새 서버 | 원본 공유만으로 배포 시점 차이가 해결되지는 않음. 현재 실제 조합은 미검증이며 출시 reader·hash fixture·양 OS 설치 증거가 필요 |

## Execution Plan

각 Phase는 독립적인 종료 상태를 가진다. 아래의 이후 Phase는 전체 설계의 실행 지도이며,
Phase ARCH에서 확정한 API 목록·실제 baseline을 반영한 뒤 세부 실행을 시작한다.
이번 문서 작성 요청을 제품 코드 구현·게이트 dispatch·출시 권한으로 확대하지 않는다.

### Phase ARCH: 영구 계약과 전환 대응표 확정

진행 상태: **완료**. 적용 예정 계약·공개 목록·전수 대응표·문서 검증 범위이며 코드 전환은 아니다.

- satisfies: REQ-SMB-006
- preserves: INV-SMB-001
- governed-by: CON-SMB-001, CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-01

목표는 architecture·ADR의 적용 예정 계약, 전체 symbol/소비자 대응표와 공개 entry/runtime
목록을 확정하는 것이다. 코드와 체커는 현행 상태를 유지하므로 이 Phase만 완료해도 저장소가
동작한다. 문서·목록 사이의 미할당 심볼, 상충하는 소유권과 browser/Node 경계가 0건이어야 종료한다.

#### TASK-ARCH-01: 적용 예정 아키텍처와 공개 계약 기록

- satisfies: REQ-SMB-006
- governed-by: CON-SMB-001, CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-01

위 Architecture and ADR의 소유 문서를 작성·보완하고, 각 공개 모듈의 symbol·runtime·
소비자·배포 경로를 기록한다. 이 proposal의 파일 대응표를 재대조한다.
현행/목표/전환 조건을 분리하고 새로운 규칙의 효력을 코드 전환 완료 시점과 연결한다.

### Phase MIGRATE: 원본·소비자·배포·검사의 일관된 전환

진행 상태: **완료**. 코드 revision `451190372007942832c5bc057319da500f065023`의 로컬·양 OS CI를 확인했다.

- satisfies: REQ-SMB-001, REQ-SMB-002, REQ-SMB-003, REQ-SMB-004, REQ-SMB-006, REQ-SMB-007
- preserves: INV-SMB-001
- governed-by: CON-SMB-001, CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-01, VFY-SMB-02, VFY-SMB-03, VFY-SMB-04

Phase ARCH의 계약과 최신 baseline을 입력으로 한다. 최종 변경은 원본·소비자·alias·명세·
체커·시험 탐색·문서를 함께 포함하는 일관된 PR로 검증한다. 내부 Task 사이의 임시 상태를
설치·배포하거나 불완전한 경로 전환을 독립적으로 머지하지 않는다.
종료 상태는 옛 원본·alias·미사용 배포 복사본이 제거되고 로컬/CI 검사가 통과한 저장소다.
REQ-SMB-006의 적용 예정 문서는 ARCH에서 준비하고, 현행 구조로의 전환 완료는 이 Phase가 소유한다.
이 종료가 실제 native 설치·운영 출시 완료를 의미하지는 않는다.

#### TASK-MIGRATE-01: 책임 분리와 소비자 전환

- satisfies: REQ-SMB-003, REQ-SMB-004
- preserves: INV-SMB-001
- governed-by: CON-SMB-001, CON-SMB-003
- verified-by: VFY-SMB-02, VFY-SMB-04

Source Migration Map에 따라 기존 동작을 이동·분리한다. 함수 재작성과 정책 정정을 섞지 않는다.
타입·공개 export·server facade·FSD adapter·CLI·리허설·시험을 함께 연결한다.
초기화·인증·트랜잭션·오류 전달의 순서를 보존하고, 최종 상태에 옛 core/github의 호환용
재수출을 무기한 남기지 않는다. 실행 그래프에서 server 코드의 브라우저·plugin 유입을 검사한다.

#### TASK-MIGRATE-02: 선언 기반 동기화와 패키징 연결

- satisfies: REQ-SMB-001, REQ-SMB-002, REQ-SMB-003
- governed-by: CON-SMB-001, CON-SMB-003
- verified-by: VFY-SMB-02, VFY-SMB-03

명세와 경계 검사를 구현하고 기존 `SOURCES` 전체 복사를 교체한다.
원본만으로 lib를 생성하고, 선언된 범위의 drift/orphan을 계산한다.
현재의 무효 인자 무변경·check 읽기 전용·원본 누락 보존 계약을 유지한다.
양 OS 패키저·버전 검사의 공통 파일 판정을 맞추고 native asset·verifier 검사를 유지한다.

#### TASK-MIGRATE-03: 시험 탐색과 현재 규칙 전환

- satisfies: REQ-SMB-006, REQ-SMB-007
- governed-by: CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-01, VFY-SMB-04

옮긴 시험을 실제 명령에서 발견하도록 npm/CI glob·경로 필터·fixture loader를 갱신한다.
CLI와 시험에서 옛 경로 문자열을 찾고 의도된 과거 기록과 실행 참조를 구분한다.
새 경계가 실제 코드·체커에서 성립한 뒤 architecture를 현행으로 전환한다.
CI job/gate leg를 바꾸면 coverage 표와 양 OS 범위를 함께 갱신한다.
기존 active 작업의 CI 확장을 이 작업에서 중복 구현하지 않는다.

### Phase ACCEPT: 설치 산출물과 독립 배포 호환성 인수

- satisfies: REQ-SMB-004, REQ-SMB-005
- preserves: INV-SMB-001
- governed-by: CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-05

Phase MIGRATE의 최종 tested commit과 깨끗한 checkout을 입력으로 한다.
양 OS 번들의 lib 목록·mode·native runtime·verifier를 확인하고 설치·init·로컬 실행을 검증한다.
지원 중인 출시 플러그인과 새 서버의 protocol/hash 조합을 확인한다.
새 서버와 기존 플러그인의 호환성을 깨는 발견이 있으면 단순 경로 이동으로 처리하지 않고
설계로 되돌린다. 설치된 캐시를 제자리에서 덮어쓰지 않는다.

실제 production 승격은 별도 출시 작업이다. 그때 최신 AGENTS에 따라 기존 gate 기록을
먼저 확인하고 필요한 client-init-smoke·agent-eval·pipeline-smoke 결과와 plugin 버전을 확인한다.
경로 재편 때문에 기존 pipeline-smoke 조건이 빠지지 않아야 한다.
이 문서 작성이나 로컬 검증을 근거로 gate를 dispatch하거나 main을 갱신하지 않는다.

## Verification Plan

### VFY-SMB-01: 영구 문서·공개 목록의 의미 대조

- verifies: REQ-SMB-006
- category: documentation / architecture
- destination: Architecture and ADR에 열거한 문서, Source Migration Map과 공개 entry 목록
- state: 계획. 이번 요청에서는 이 proposal만 작성하며 architecture 변경 인수는 실행하지 않음

각 생산 symbol의 소유자·공개 여부·runtime·소비자·시험이 식별되어야 한다.
현행과 목표 상태가 모순 없이 구분되고, 공개 계약이 source 위치/배포 경로와 연결되어야 한다.
상대 링크·front matter·문서 검사를 실행하고 사람이 같은 정책의 중복 정의·상충 여부를 검토한다.

### VFY-SMB-02: 의존성·공개 API·실행 환경의 거부 사례

- verifies: REQ-SMB-003, REQ-SMB-004
- category: architecture / type / build
- destination: 기존 경계 검사 시험과 제안 `scripts/checks/verify-shared-boundaries.test.mjs`
- state: 계획

정상 공개 import는 통과하고 shared→app-core/server/plugin, app-core→server/plugin,
plugin→앱 전용 원본, 비공개 helper 직접 참조, 제품→시험, universal→Node의 직접·간접 참조를
각각 실패시킨다. server facade 변경 후 브라우저·Action 빌드 산출물에 server 구현이나
시험 helper가 새로 노출되지 않는지 기존 fresh build 계약 시험과 연결해 확인한다.

### VFY-SMB-03: 배포 범위·완전성·무변경·복구

- verifies: REQ-SMB-001, REQ-SMB-002, REQ-SMB-003
- category: packaging / failure / recovery
- destination: `scripts/plugin-lib.test.mjs`, 양 OS package 시험, 버전 검사 시험
- state: 계획

격리 fixture에서 다음을 확인한다.

- lib가 없어도 원본·명세로 생성되고 원본 바이트·상대 경로와 일치한다.
- app-core/server 전용 파일의 변경·추가가 plugin 산출물에 영향을 주지 않는다.
- 공개 entry의 정상 내부 의존성은 포함되고, 배포 대상에서 제거한 생성 모듈은 사라진다.
- 명세에 없는 고립 생산 모듈, 비공개 직접 참조, 없는 의존성·원본, 계산형 shared import,
  경로 탈출·충돌·잘못된 runtime은 기존 생성물을 바꾸지 않고 실패한다.
- `--check`·잘못된 CLI 인자는 무변경이고 두 번 동기화한 결과는 같다.
- 복사 도중 실패가 성공으로 보고되지 않고 check로 드러나며 재실행으로 복구된다.
- 테스트·타입·문서·source metadata가 실행 lib에 들어가지 않고, 다른 비생성 파일은 보존된다.
- 양 OS 패키저가 같은 공통 lib 목록을 사용하고 기존 native 파일·verifier 완전성을 보존한다.

### VFY-SMB-04: 제품 동작과 시험 발견의 보존

- verifies: REQ-SMB-004, REQ-SMB-007
- category: behavior / regression / integration / CI
- destination: 이동한 기존 단위 시험, server/FSD 소비자 시험, 격리 DB 시험과 기존 rehearsal
- state: 계획

새 함수마다 구현을 복제한 시험을 만들지 않고 기존 경계·실패 사례를 새 소유자로 옮긴다.
slug 길이/예약어, 토큰 형식·발급·만료·폐기, 플랜 선택, pipeline 입력/전이, QA 거부,
template canonical/hash/설치 결과, runner 상태·사용량 제한 직렬화의 관찰 결과를 보존한다.
랜덤 토큰·시간은 기존 fixture 방식으로 검증하며 우연히 같은 랜덤 값이 나오기를 요구하지 않는다.

이동 전후 시험 파일 목록과 실제 실행·skip 결과를 비교한다.
다음은 기존 명령이며, 새 경로의 탐색·환경 연결을 수정한 후 실행한다.

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:server
npm run test:server:integration
npm run build
```

`check`에 lint·typegen·tsc·script 시험이 포함됨을 확인하며 새 경계 검사도 연결한다.
DB 시험은 기존 안전 검사와 격리 PostgreSQL 환경을 사용한다.
OS 의존 시험은 Windows/macOS 각각의 실행 증거를 남긴다.
새 job/leg가 필요하면 verification의 coverage 표를 같은 변경에 갱신하고,
미확보 OS를 다른 OS의 통과로 대체하지 않는다.

### VFY-SMB-05: 출시 reader·격리 설치·실행 인수

- verifies: REQ-SMB-004, REQ-SMB-005
- category: compatibility / native packaging / installation
- destination: `plugin/bin/harness-released-readers.test.mjs`, 양 OS package 시험,
  `scripts/rehearsals/rehearse-client-init-smoke.ts`, 기존 pipeline smoke 계약
- state: 일부 실행(2026-11-17). 모델을 쓰는 양 OS 실제 실행이 남았다. [ACCEPT 실행 결과](#accept-실행-결과)

출시 reader 회귀를 유지하고, 필요한 경우 기존 release/HTTP fixture에 구버전 플러그인과
새 서버 조합을 추가한다. 기존 reader 시험이 증명하는 범위를 실제 양 OS 설치·서버 호환성으로
확대 보고하지 않는다. 이동 전후 동일한 template 입력의 hash·설치 tuple·generated body를 비교한다.
실제 설치에서는 저장소의 packages·node_modules가 없는 bundle로 init·session/watch/background
관련 경로와 module resolution을 확인한다. native runtime·파일 권한·verifier checksum의
실제 플랫폼 검증과 모델을 사용하는 출시 gate의 실행 기록을 구분한다.

## Downstream Blockers and Readiness

### BLK-SMB-01: 배포 템플릿·기존 설치본의 외부 경로 참조 확인

- classification: downstream, Phase ACCEPT의 설치 인수 전
- evidence: 이번 조사 범위는 현재 checkout이다. 서버가 공급하는 별도 템플릿 전체와 지원 중인
  설치 revision별 경로 의존성을 실제 설치 환경에서 확인하지 않았다.
- affects: REQ-SMB-005, VFY-SMB-05
- impact: 새 helper import가 맞아도 외부 지침이 제거된 lib 경로를 읽을 수 있음
- unblock requirement: 인수에 사용할 templates commit·출시 revision·OS를 기록하고 경로 참조와
  설치 동작을 확인한다. 변경이 필요하면 소유 저장소의 작업·검증을 별도로 연결한다.
- stop condition: 참조 유효성이나 필요한 OS 실행 증거가 없으면 설치 인수·출시 완료로 표시하지 않음
- status: 해소(2026-11-17). templates `main`의 모든 커밋(운영 R2 `99245acd018d26a7c1238f34323951159c41d954`,
  R1 `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215` 포함), 출시 revision 0.6.15(`main` `85c66fb`)와 후보 0.6.16
  (`dev` `c5f4e44`·`8e0f880`), Windows·macOS 설치 실행으로 확인했다. 근거는 [ACCEPT 실행 결과](#accept-실행-결과)의 1·6번이다.

Phase ARCH의 적용 예정 계약·ADR·전수 대응표와 VFY-SMB-01 문서 검증을 완료했다.
ARCH 종료 당시 MIGRATE는 미착수였으며, 후속 승인된 실행 상태는 상세 기록에서 추적한다.
Phase ACCEPT는 BLK-SMB-01과 양 OS 실행 환경·증거가 충족되어야 한다.
이 준비도는 제품 코드 구현이나 출시가 승인·완료됐다는 뜻이 아니다.

## Risks and Rollback

- 소스 이동으로 시험이 조용히 빠질 수 있다. glob·fixture 경로·실행 파일 목록을 함께 확인한다.
- 작은 공통 함수를 과도하게 분리하면 탐색 비용이 증가한다. 독립적인 변경 이유가 있는 책임만
  분리하고, 같은 계약을 구성하는 private helper는 가까이 유지한다.
- shared의 공개 영역이 다시 커질 수 있다. 공개 경로·runtime·앱과 플러그인 소비 근거를 명세
  변경에서 검토하며, 임의의 import를 추가해 경계를 우회하지 못하도록 검사한다.
- namespace·모듈 이동으로 템플릿 hash나 오류 문자열이 바뀌지 않게 golden 입력을 보존한다.
- 구현 전 rollback은 이 문서 및 후속 승인된 문서 변경 범위에 한정한다.
  구현 후에는 검증된 source·manifest·생성 lib·체커·소비자 변경을 일관된 단위로 되돌린다.
  다른 작업을 덮거나 DB/사용자 설정을 되돌리지 않는다.
- 설치·출시 후에는 이전 설치 디렉터리를 덮어쓰지 않고, 기존 버전·배포 절차를 따라 수정
  release 또는 검증된 rollback을 수행한다. 자동 main 승격이나 gate 재실행은 포함하지 않는다.

## Verification Results

아래 첫 표와 설명은 초안 작성 당시의 기록이다. 실제 ARCH 실행 결과는 이어지는 절과 완료 문서에 따로 기록한다.

| 확인 | 상태 | 근거·한계 |
| --- | --- | --- |
| 소스·소비자·동기화·패키저·기존 아키텍처·활성 제안 대조 | 확인 | 위 baseline 작업 트리의 읽기 전용 조사 |
| 원본 기반 의존성 선택의 메모리 시험 | PASS | 17개 선택, 미사용 변경 무영향, 새 직접·간접 의존 포함, 누락 참조 실패. 최종 설계의 구현 검증 아님 |
| 문서 작성 전 `npm run docs:check` | 기존 실패 | Git 추적 상태에서 이동 중인 `docs/proposals/active/codex-dual-client-runtime-follow-ups.md`를 읽다가 ENOENT. 이번 문서 생성 전 재현 |
| 새 문서의 traceability | PASS | 설치된 write-sdd-spec validator의 standard 모드: REQ 7개, 작업/Phase 연결 7/7, VFY 연결 7/7, 오류·경고 0개 |
| 새 문서의 front matter·상대 링크·공백 검사 | PASS | 저장소의 parseFrontMatter·relativeLinks와 파일 존재 검사 사용. 본문 상대 링크 3개·related 9개 유효, 줄 끝 공백 0개, 마지막 개행 확인 |
| 의미 검토 | 확인 | 현재/목표 계약 충돌, 함수별 소유권, 문서와 구현 Phase의 완료 책임, 배포 실패·재실행, 후속 설치 blocker를 대조. 독립 에이전트 검토나 구현 인수는 아님 |
| 제품 코드·배포 구현·양 OS 설치·외부 gate | 미실행 | 이번 요청은 proposal 한 파일 작성 |

초안 작성 당시 검사 대상은 이 문서 한 파일이었다. 전체 SDD에 이후 Phase의 개요와 미실행 인수가 포함되어
있으므로 strict 모드로 전체 구현 준비도를 주장하지 않았다. 새 문서 검사는 미추적 파일도
직접 읽어 수행했으며, 기존 추적 파일 이동 때문에 실패한 저장소 전체 docs:check를 대체한
성공으로 보고하지 않는다.

### ARCH 실행 결과

VFY-SMB-01의 문서 산출물은 새 architecture·ADR과 기존 안내 10개, 상위/하위 proposal로 총 14개다.
값 export 175개·private 49개·type 31개와 직접 참조 404건을 대조했고 새 공개 entry는 14개다.
실행 명령·최종 문서 검사 결과와 scope 보존 증거는 [ARCH 완료 기록](./2026-11-16-shared-modules-and-plugin-distribution-phase-arch.md#arch-execution-results)에 남긴다.
VFY-SMB-02~05, 제품 테스트·build·native 설치·외부 gate는 미실행이다.

### ACCEPT 선행 비교·CI 기록

2026-11-17 Windows PC에서 실행했다. 후보는 `dev` `c5f4e44`이고, 그 뒤 `8e0f880`까지 바뀐 것은
문서 하나와 `plugin/bin/harness-watch.test.mjs`(아래 7번)뿐이라 제품 코드는 같다. 비교 기준은 출시된
`main` `85c66fb`(플러그인 0.6.15)다. 2~5번의 비교 도구는 이 확인을 위해 임시로 만든 것이고 저장소에 남기지 않았다.

| # | 확인 | 결과 | 근거·한계 |
| --- | --- | --- | --- |
| 1 | 삭제·이동된 `plugin/lib` 18개 경로의 외부 참조(BLK-SMB-01) | 없음 | templates `main`의 커밋 51개 모두에 `lib/` 문자열과 플러그인 안쪽 경로가 없다. 그중 15개(R1·R2 포함)의 `CLAUDE.runbook.md`가 `CLAUDE_PLUGIN_ROOT`를 언급하지만, 그 변수를 셸 변수로 가정하지 말고 `harness-session` helper를 플러그인 메타데이터에서 찾으라는 지시다. `plugin/bin`·hooks·skills의 파일은 옮겨지거나 지워진 것이 없다. `dev`의 출하 텍스트(skills·hooks·agents·README)·`src`·`packages`, 이 PC에 연결된 저장소 2개의 추적 파일에도 없다. 0.6.15 코드의 동적 import는 같은 번들의 bin을 부르는 `harness-platform.mjs` 하나이므로 설치본은 자기 번들의 `lib`만 읽는다 |
| 2 | Windows 번들 | 통과 | 깨끗한 checkout에서 `package-windows-plugin.mjs`로 만들었다. 2245개 파일, `lib` 15개, verifier 7개 파일이고 삭제된 18개 경로는 없다. native runtime은 빌드 키가 `main`과 같아(`…914aadc3…`) 이 PC의 설치본 0.6.11 runtime을 `windows-role-runtime-cache.mjs verify`로 확인해 썼다. 패키저 검사에 필요한 Prisma client는 가짜 주소로 생성했다(DB 접속 없음) |
| 3 | 저장소 없는 module resolution | 통과 | 번들을 위쪽 폴더에 저장소도 `node_modules`도 없는 곳으로 복사했다. 코드 59개 파일의 import 300개가 모두 번들 안의 파일이나 Node 내장 모듈로 해석된다. `lib`·`runtime` 모듈 51개 중 50개를 실제 import로 불러왔다. 나머지 1개는 macOS 전용 진입 스크립트 `runtime/macos/role-process.mjs`로, 불러올 때 인자의 경로를 읽어 실패한다. 0.6.15 원본도 같고 파일은 바뀌지 않았다 |
| 4 | 템플릿 결과 보존(REQ-SMB-004) | 차이 0 | `main`과 `dev`의 모듈에 같은 입력을 넣었다: templates R2·R1, 연결 저장소 2개의 `harness.json`(각자의 parser로 파싱). release 준비(content·contract hash, release identity), 언어 × plan 3개 × client 2개의 설치 정보와 배포 본문, 배포 본문마다 init lock hash·stub·runbook 판·변수 렌더링(작업 공간 포함), 설정 parser를 비교해 1852건이 모두 같았다. `main` 쪽 runbook 판 함수에 결함을 넣으면 152건이 달라져 비교가 차이를 잡는 것을 확인했다 |
| 5 | 서버·공유·플러그인 코드의 동작 보존(REQ-SMB-004, REQ-SMB-005의 서버 쪽) | 이름 변경 외 차이 없음 | `src/server`·`packages`·`plugin/lib`·`plugin/runtime`·`plugin/bin`의 최상위 선언(비공개 포함) 946개를 같은 형식으로 변환해 이름별로 비교했다. 930개는 같다. 11개는 보조 함수의 이름 변경(`time`→`runnerTimestamp`, `httpUrl`→`qaHttpUrl`, `text`→`qaText`, `prefixOf`→`tokenPrefix`)과 TypeScript 전환의 매개변수 별칭뿐이라 되돌리면 같고, 보조 함수의 본문도 같다. 제거로 보인 `runbookIsStale`·`blobHref`는 서버와 fsd의 지역 함수로 옮겨졌고 본문이 같다. 정적 비교이며, 옛 플러그인을 새 서버에 실제로 붙여 본 결과가 아니다 |
| 6 | 양 OS 실제 설치·init | 통과 | `dev` `8e0f880`, templates R2로 돌린 `client-init-smoke` [run 44039379768](https://github.com/Sangeok/stagekeeper/actions/runs/44039379768): Windows·macOS × 새 사용자·업데이트 4개 통과. 플러그인 0.6.16, Claude 2.1.326, Windows Server 10.0.20348, macOS 15.8.2 arm64. 게이트 기록 #319에 행이 있다 |
| 7 | 양 OS 런타임 CI | 통과 | `dev` `c5f4e44`의 macOS Intel job이 `harness-watch` 시험 하나의 0.6초 폴링 한도로 실패했다(#338과 같은 유형, 이 재편과 무관). 응답 지연으로 재현하고 그 시험의 한도를 넓혀 [PR #361](https://github.com/Sangeok/stagekeeper/pull/361)로 고쳤다. #361에서 Windows·macOS arm64·Intel 런타임 CI가 통과했고, 병합 뒤 `dev` `8e0f880`의 `check`·Windows·macOS 런타임 CI도 통과했다 |
| 8 | 양 OS watch·session·background 실제 실행 | 미실행 | 모델을 쓰는 출시 게이트 `pipeline-smoke`에 남긴다. 출하 플러그인 파일이 바뀌었으므로 승격 전에 `agent-eval`도 필요하다. Mac에서 손으로 확인한 것은 없다 |

1·4·5번으로 기존 설치본과 새 서버의 조합에서 바뀌는 코드 경로가 없음을 보였다. 다만 이것은 출시된 각 판을
새 서버에 실제로 연결한 인수가 아니었다. 이 선행 확인 시점에는 8번의 공백 때문에 설치 인수와
출시를 완료로 표시하지 않았다. 후속 사용자의 CI-only 지시와 실제 인수 결과는 다음 절을 따른다.

### ACCEPT GitHub CI-only 인수 결과

사용자는 개인 host/로그인 준비 대신 GitHub CI만으로 진행하도록 지정했다.
[상세 ACCEPT 계획](./2026-11-17-shared-modules-and-plugin-distribution-phase-accept.md)의 실행 범위를
모델 없는 설치·배포·서버 호환성으로 확정하고 재실행 가능한 인수 workflow를 추가했다.
[완료 보고서](../../test-reports/completed/2026-11-17-shared-modules-plugin-distribution-acceptance.md)에
실제 run/job/source identity와 정제 summary를 보존한다.

- `4c5ccd6`의 [인수 run 44048937201](https://github.com/Sangeok/stagekeeper/actions/runs/44048937201):
  Windows x64·macOS arm64/x64 세 job 모두 PASS. 각 실제 Codex cache에서 P0 설치,
  동일 DB/origin의 S0→S 교체, P0 무재init receipt/pin 보존, bad surface 거부,
  P update·빈 cache 설치·pending 복구·session stop/release와 DB 정리까지 확인했다.
- bundle의 lib는 세 OS 모두 15개다. 전체 payload는 Windows 2245개, macOS 각각 2065개이며
  runtime/verifier hash·파일 bytes·macOS 권한과 실제 loader 선택 cache를 대조했다.
- 고정 T `8ccb37a`의 13개 row, en × 3plan × 2client 결과가 이전/후보에서 같다.
  private corpus 설치·그래프 두 검사도 실행했다. 앞선 전체 외부 참조 조사는 위 선행 기록으로 보존한다.
- [Claude source run 44044069195](https://github.com/Sangeok/stagekeeper/actions/runs/44044069195)의
  Windows/macOS 신규·update 4개 leg와 `4c5ccd6`의 공통 check 8개 job도 PASS다.
  Claude run의 실제 SHA `909a83d`와 이후 제품 bytes 동일성을 보고서에 명시했다.

이로써 승인된 CI-only 인수 범위는 통과했다. 개인 PC·모델 역할·장시간 background와 운영
승격은 이 판정에 포함하지 않는다. `agent-eval`/`pipeline-smoke`는 기존 출시 조건으로 유지하며
이번 경로 재편의 인수와 구분한다. PR #363의 dev 병합을 확인해 상위/상세 proposal을
completed로 옮겼다. 이 구분은 앞선 8번의 당시 미실행 기록을 모델 실행 성공으로 바꾸지 않는다.

## Approval and Completion

ARCH·MIGRATE와 승인된 CI-only ACCEPT의 구현·인수가 완료됐다. 최종 PR head
`d5c67141c580f825cb4ce12e4aa0ce871a41cfd8`의 [check 941](https://github.com/Sangeok/stagekeeper/actions/runs/44051075589)와
[공유 배포 인수 4](https://github.com/Sangeok/stagekeeper/actions/runs/44051075608)가 모두 성공했고,
[PR #363](https://github.com/Sangeok/stagekeeper/pull/363)을
`99378292893a2f0dd75aa5473ef5f92d406f57fe`로 dev에 병합했다.

상위 SDD와 ACCEPT 상세 문서를 completed로 옮기고 ARCH·MIGRATE·architecture·ADR·보고서의
참조를 갱신했다. 영구 규칙은 architecture, 이유는 ADR, 전환·검증 이력은 이 문서와
연결된 Phase 기록이 소유한다. main 승격과 운영 배포는 이 완료 판정에 포함하지 않는다.

## MIGRATE execution status

2026-11-17, `e8c212a98335a5e4fb12df915c861a1e2581c43b` 기반으로 소유권·공개 명세·생성 lib·
소비자·검사·양 OS CI 연결·현행 문서를 구현했다. 27개 생산 원본의 전체 복사를 제거하고
14개 공개 entry/59개 값 export 및 내부 template-boundary의 15개 runtime 모듈을 배포한다.
로컬 정책·웹·서버·PostgreSQL·HTTP 회귀와 build를 검증했으며 최종 check와 architecture 회귀, Windows native·macOS arm64/x64 CI가 모두 통과했다.
세부 시험 대응·H1 공통 predicate 선행 통합·기존 설치 reader 경로의 보존 이유는
[MIGRATE Execution Results](./2026-11-17-shared-modules-and-plugin-distribution-phase-migrate.md#migrate-execution-results)에 기록했다.
이 상태는 REQ-SMB-005나 BLK-SMB-01 해소, native 설치·운영 배포의 완료를 뜻하지 않는다.


코드 검증 revision은 `451190372007942832c5bc057319da500f065023`, 검토 대상은
[PR #354](https://github.com/Sangeok/stagekeeper/pull/354)다. check 915, macOS runtime 237,
Windows runtime 415, PR 자동 client-init-smoke 84가 green이다. 최신 dev `85c66fb`의 기존
CI 변경은 함께 보존했다. 자동 init은 Claude 2.1.326과 templates `8ccb37a`의 고정 조합 증거이며,
실제 Codex 설치·권한·모델 역할과 독립 갱신 조합의 전체 인수는 ACCEPT에 남는다.


검증 대기 중 병합된 #351/#355의 dev `0f6028f`도 후속 통합했다. 기존 smoke-server 검사와
공유 배포 검사, 양쪽 gate 감지 경로를 모두 보존했다. 고정 revision별 증거와 최종 PR head를
구분하여 [MIGRATE 완료 기록](./2026-11-17-shared-modules-and-plugin-distribution-phase-migrate.md#병행-작업-병합-이후-통합)에 남겼다.
