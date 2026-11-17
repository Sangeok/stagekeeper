---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-12"
approved-by: "user"
approved-at: "2026-11-16"
approval-scope: "Phase ARCH 문서·ADR·전수 목록 작성과 검증. 코드 MIGRATE·설치 ACCEPT 제외"
completed-at: "2026-11-16"
verification-summary: "VFY-SMB-01 문서·목록 대조 완료. 상세 명령 결과는 ARCH Execution Results 참조"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-11-17-shared-modules-and-plugin-distribution.md"
  - "docs/architecture/README.md"
  - "docs/architecture/core.md"
  - "docs/architecture/github.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/server.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-organization.md"
  - "docs/ADR/README.md"
  - "docs/ADR/0005-organize-core-modules.md"
  - "docs/ADR/0007-share-github-url-modules.md"
---

# 공유 모듈·플러그인 배포 경계 — Phase ARCH 완료 기록

## Summary

[상위 SDD](./2026-11-17-shared-modules-and-plugin-distribution.md)의 Phase ARCH를 구체화한다.
목표는 적용 예정 아키텍처와 ADR, 모듈·심볼·소비자 대응표, shared 공개 entry와 실행 환경을
확정해 MIGRATE가 소유권이나 배포 경계를 다시 결정하지 않고 작업할 수 있게 하는 것이다.

ARCH는 문서와 설계 목록을 만드는 단계다. 현재 core/github 원본, alias, 검사기, 생성 lib와
설치 동작은 유지한다. 새 구조를 현재 구현으로 오인하지 않도록 모든 문서에서 현행과
적용 예정을 구분한다. 출하 파일인 plugin README·스킬의 실제 경로 안내 변경은 MIGRATE에 둔다.

사용자의 명시적 실행 요청에 따라 아래 ARCH 작업을 수행했다.
[shared-modules.md](../../architecture/shared-modules.md), [ADR-0008](../../ADR/0008-separate-shared-module-distribution.md),
상위 SDD의 전수 대응표를 작성하고 기존 문서의 현행/예정 안내를 연결했다.
아래 실행 절차와 초안 검토 이력은 근거로 보존하며 실제 결과는 [ARCH Execution Results](#arch-execution-results)에 있다.
MIGRATE와 ACCEPT는 실행하지 않았다.

## Goal and Proposal Size

- 코드 소유권, 공개 API, 실행 환경과 배포 대상의 판단 기준을 영구 문서로 정한다.
- 현재 27개 원본의 생산 export·타입·private helper·소비자·검증 위치를 전환 목록에 연결한다.
- 새 공개 모듈의 runtime과 내부 의존성을 명시해 Node 코드의 브라우저 유입을 예방한다.
- 변경할 문서와 보존할 현행 규칙, MIGRATE로 넘길 변경을 구분한다.

작성 모드는 `PHASE_PLAN`, 규모와 위험도는 `STANDARD`다.
실행 자체는 문서 변경이지만 여러 소유 영역·공개 경로·배포 계약을 정하므로
작은 문구 수정으로 취급하지 않는다. 제품 요구사항은 상위 SDD가 소유한다.

## Source and Evidence Baseline

### 상속하는 계약

| 항목 | 단일 정의 위치 | 이 Phase의 역할 |
| --- | --- | --- |
| Phase ARCH | [상위 Phase](./2026-11-17-shared-modules-and-plugin-distribution.md#phase-arch-영구-계약과-전환-대응표-확정) | 기존 Phase 경계를 유지 |
| REQ-SMB-006 | [지속적인 아키텍처 판단 기준](./2026-11-17-shared-modules-and-plugin-distribution.md#req-smb-006-지속적인-아키텍처-판단-기준) | 적용 예정 문서·공개 목록 부분을 완료. 현행 전환의 최종 완료는 MIGRATE |
| INV-SMB-001 | 상위 Domain invariant | 제품·데이터·권한 의미 보존 |
| CON-SMB-001~003 | 상위 Engineering constraints | 단일 원본·쓰기 범위·실행 환경 보존 |
| TASK-ARCH-01 | [상위 Task](./2026-11-17-shared-modules-and-plugin-distribution.md#task-arch-01-적용-예정-아키텍처와-공개-계약-기록) | 아래에서 변경 절차를 상세화하며 ID를 재정의하지 않음 |
| VFY-SMB-01 | [상위 Verifier](./2026-11-17-shared-modules-and-plugin-distribution.md#vfy-smb-01-영구-문서공개-목록의-의미-대조) | 문서·목록의 의미 대조를 상세화 |
| BLK-SMB-01 | 상위 downstream blocker | 배포 템플릿·기존 설치본 확인은 ACCEPT의 인수 조건. ARCH 문서 작성을 막지 않음 |

REQ-SMB-001~005·007을 위한 구현·실행 증거는 이 Phase에서 완성하지 않는다.
공개 계약·경계·검증 설계를 준비하는 기여와 실제 배포·동작 검증을 구분한다.
상위 REQ/INV/CON/TASK/VFY의 정의를 이 문서에 복사하거나 다른 의미로 덮어쓰지 않는다.

### 작성 기준과 재검증 snapshot

- 초안 조사일: 2026-11-12. 이번 정합성 재검증일: 2026-11-16.
- 저장소 HEAD: `eabd1381169a2692e9b29317c31047bbb4027c7d`.
- 작업 브랜치: `harness/plugin-skill-contract-plan`.
- 상위 SDD는 작성 시 미추적 파일이며 Git commit으로 내용을 식별할 수 없다.
  읽은 파일의 SHA-256은 `2fa38ac553d73b2c680cd98cd7a72f2a379431e4c617cd9459f802d11a894608`이다.
- architecture README·protocol, active/completed 문서와 보고서에는 다른 작업의 변경이 있다.
  이번 검토는 이 상세 계획만 수정하고 그 변경을 수정·stage·정리하지 않는다.
- 초안 조사 때 열려 있던 PR #336은 과거 관측이다. 2026-11-16 열린 PR 조회 결과는 0건이다.
  이 값은 실행 시작 시 다시 확인하며, 과거 PR 번호를 현재 선행 작업으로 고정하지 않는다.
- active의 CI OS 범위·Claude verifier namespace 제안서를 다시 읽었다.
  CI·스킬 변경은 소유 작업의 실제 반영 상태를 확인하며 중복 구현하지 않는다.
- 이번 재검토에서는 새 active 제안서 `scripts-coupling-remediation.md`도 확인했다.
  H1의 출하 predicate 분리는 MIGRATE와 접점이 있으므로 실제 반영된 공통 모듈을 재사용한다.
  이 제안의 다른 Action·smoke 서버 작업은 ARCH의 실행 범위나 선행 조건으로 편입하지 않는다.

### 초안 당시 상위 기대와 상태 대조

| 작업 항목 | 현재 근거 | 판정 | ARCH의 구체적인 차이 |
| --- | --- | --- | --- |
| 네 소유 영역의 목표 | 상위 Target Architecture | 부분 충족 | proposal의 목표를 architecture의 적용 예정 계약으로 기록 |
| 현재 아키텍처 | `core.md`, `github.md`, README의 배치 규칙 | 현행과 목표가 다름 | 현행을 지우지 않고 목표·활성화 조건·책임 문서를 연결 |
| 공개 entry/runtime | 상위의 명세 형식, 현재 producer export·consumer import | 부분 충족 | 아래의 제안 목록과 실제 symbol/전이 의존성을 대조해 확정 |
| 변경 대응표 | 상위 Source Migration Map | 부분 충족 | 파일 단위 표를 심볼·타입·private helper·소비자·시험까지 확장 |
| ADR | 0005·0007은 accepted, 새 결정 문서는 없음 | 누락 | 새 ADR에 결정 이유·대안·적용 조건을 기록 |
| 동기화·패키징 | 전체 복사, Git 추적 plugin 파일 패키징 | 현행 유지 대상 | 새 구현을 만들지 않고 새 계약·MIGRATE 변경 위치만 문서화 |
| server facade | `server.md`의 api/api.server/contracts 구분 | 이미 존재 | 토큰·release 이동 후에도 DB 없는 소비자의 초기화 경계를 보존하도록 명시 |

현재 코드에서 export 목록을 AST로 읽고 정적 import·재수출과 소비자를 다시 조사했다.
아래의 새 경로와 runtime 분류는 **설계 선택**이며, 해당 경로의 코드가 생성·검증되었다는 뜻은 아니다.

## Scope

### 실행 범위

초안 검토는 이 상세 계획 하나로 한정했으나, 이후 명시적 실행 요청으로 아래 문서 산출물을 작성했다.
AGENTS, 소스·설정·시험·workflow와 출하 파일은 계속 변경 범위에서 제외했다.
완료된 상세 계획은 저장소의 proposal 수명주기에 따라 completed로 이동했다.

ARCH 실행 산출물은 다음과 같다.

| 산출물 | 역할과 작성 위치 |
| --- | --- |
| 적용 예정 아키텍처 | 신규 `docs/architecture/shared-modules.md` |
| 결정 이유와 비용 | 신규 `docs/ADR/NNNN-separate-shared-module-distribution.md` |
| 진입점과 현행/목표 구분 | 아래 문서 변경 표의 기존 architecture 문서와 ADR index |
| 전환 목록 | 상위 SDD의 Source Migration Map을 근거와 함께 보완 |
| ARCH 검증 기록 | 이 상세 계획과 상위 Phase ARCH의 결과 기록 |

실제 실행 시작에서 ADR 번호 `0008`이 비어 있음을 확인하고
`docs/ADR/0008-separate-shared-module-distribution.md`를 선택했다. 완료 검사에서는 이 번호의 단일 파일과 index 행을 확인했다.
아래의 `NNNN`은 원래 번호 선택 절차의 표기이며 실제 산출물에는 남기지 않았다.

### ARCH에서 제외하는 변경

- packages/shared·app-core·새 runtime 폴더의 실제 생성과 코드 이동·함수 분리.
- 실제 `plugin-exports.json`, alias, 공개 export, 체커·테스트·CI glob 변경.
- plugin/lib 재생성·정리, 번들 생성·설치, manifest 버전 변경, 외부 gate·운영 API 호출.
- plugin README·스킬의 모듈 경로 전환과 packages README의 현행 경로 교체.
- AGENTS의 현재 코드 배치·pipeline-smoke 대상 경로를 새 경로로 바꾸는 일.
- 완료 기록의 과거 경로·판단을 현재 구조에 맞춰 일괄 수정하는 일.

상위의 Architecture and ADR/Affected Files 표는 전체 전환의 영향 범위다.
이 상세 계획은 ARCH에 필요한 적용 예정 문서와 MIGRATE에서 바꿀 실행·출하 안내를 구분한다.
출하 파일인 plugin README만 먼저 바꿔 문서 Phase가 plugin 버전 변경을 요구하게 만들지 않는다.

## Phase ARCH: 적용 예정 계약과 실행 가능한 전환 목록

- predecessor artifacts: 위 snapshot의 상위 SDD와 현재 원본·소비자·검사·패키징 코드.
- satisfies: REQ-SMB-006
- preserves: INV-SMB-001
- governed-by: CON-SMB-001, CON-SMB-002, CON-SMB-003
- verified-by: VFY-SMB-01
- completion ownership: 적용 예정 계약과 목록만 완료한다. 현행 규칙의 전환은 MIGRATE가 소유한다.
- intermediate validity: 현재 alias·원본·검사·배포 경로가 그대로이므로 코드 실행은 현행 상태로 유지된다.

### 진입·종료 조건

진입 시 최신 dev, 열려 있는 PR, active 제안서, 실제 적용 지침과 현재 작업 트리를 확인한다.
다른 작업과 겹치는 기존 문서는 최신 반영분을 보존한 격리 작업 트리에서 다룬다.
이 계획을 쓴 현재 폴더의 dirty 문서를 덮어써서 실행을 시작하지 않는다.

격리 checkout에는 미추적 상위 SDD와 이 계획이 자동으로 따라오지 않는다.
ARCH 실행 준비는 다음 순서로 한다.

1. 현재 승인된 source bundle 두 파일의 바이트와 SHA-256을 기록한다. 원래 폴더의 다른
   dirty 문서와 함께 복사하지 않는다. 관련 선행 문서가 새 dev에 아직 없으면 그 차이를 먼저 대조한다.
2. 저장소의 브랜치 규칙으로 준비한 격리 checkout에 두 파일의 동일 snapshot이 있는지 확인한다.
   없으면 같은 상대 경로로 복사하고 해시를 대조한다. 이미 있지만 내용이 다르면 덮어쓰지 않고
   어느 snapshot이 이번 실행의 입력인지 확정한다. 이 문서의 과거 해시를 최신 수정본에 강요하지 않는다.
3. 실제 실행 checkout의 HEAD, 두 입력 해시, 기존 문서의 변경 전 상태와 선택한 ADR 경로를
   실행 기록에 남긴다. 같은 셸에서 아래 기준 명령을 실행하고 나서 ARCH 문서를 편집한다.
4. Node·npm·Git·Python 3와 설치된 write-sdd-spec validator를 확인한다. 아래 명령은 macOS의
   zsh/bash에서 검증했다. 문서 검사는 npm 의존성 설치 없이 실행된다. AST 전수 대조에는
   조사할 checkout의 lockfile과 맞는 TypeScript 개발 도구가 필요하다. 다른 셸·설치 위치에서는
   실제 경로와 동등 명령을 먼저 확인하며, 검사기를 찾지 못한 상태를 통과로 기록하지 않는다.

아래 검증의 `SMB_ARCH_BASE`는 문서 편집 전 기록한 commit이다. 새 셸에서 재개할 때는
그 값을 복원한다. 편집·중간 커밋 후의 HEAD로 기준을 다시 잡아 변경을 숨기지 않는다.

종료 시 새 영구 문서·ADR·공개 목록·전환 표·검증 기록이 연결되어 있어야 한다.
모든 현재 생산 export와 전환에 영향을 받는 타입·helper·소비자에 소유자 또는 보존 사유가
있어야 하며, 미할당 심볼·상충한 runtime·설명 없는 경로는 0건이어야 한다.
ARCH 완료를 근거로 자동으로 MIGRATE를 시작하지 않는다.

## Change detail for TASK-ARCH-01

Canonical Task는 [상위 TASK-ARCH-01](./2026-11-17-shared-modules-and-plugin-distribution.md#task-arch-01-적용-예정-아키텍처와-공개-계약-기록)이다.
아래 A~E는 그 Task의 실행 순서이며 별도의 경쟁 Task 정의가 아니다.
검증 참조는 [VFY-SMB-01](./2026-11-17-shared-modules-and-plugin-distribution.md#vfy-smb-01-영구-문서공개-목록의-의미-대조)이다.

### A. 원본·심볼·소비자 목록 확정

입력은 현재 core/github의 27개 생산 모듈과 인접 시험·타입 선언,
src·plugin·scripts·tests의 참조다. `rg` 검색과 설치된 TypeScript AST로 생산 export,
import·재수출·타입 전용 참조를 읽고 계산형 경로·fixture 문자열은 따로 확인한다.
원본 집합은 두 packages 디렉터리를 재귀 열거한 비테스트 `.mjs` 전체다. 상위 27행의
Source Migration Map과 이 파일 집합을 양방향 대조하고 추가·삭제된 파일도 기록한다.
각 원본의 실제 소비자를 찾은 뒤 공개 재수출과 역방향 import를 따라 최종 소비자까지 확장한다.
옛 alias·packages 경로·plugin/lib 상대 경로를 문자열로 읽는 시험·리허설도 별도 행으로 남긴다.
plugin README·init/watch 스킬과 hooks·manifest는 읽기 전용 경로 참조 입력으로 포함한다.

상위의 파일 대응표를 다음 열로 보완한다. 기계적으로 모든 행을 중복하는 별도 문서는 만들지 않는다.

| 필드 | 기록 기준 |
| --- | --- |
| 현재 key | `현재 원본 경로#export 이름`. 동일 symbol의 재수출 경로도 기록 |
| 목표 소유자 | shared/app-core/server/FSD/plugin runtime 중 실제 책임 |
| 목표 경로와 이름 | 제안 경로임을 표시하고, rename·이동·동일 구현 재수출을 구분 |
| 공개/내부·runtime | 모듈 공개 경로와 universal/node, 타입 전용 참조 구분 |
| 실제 소비자 | 파일·symbol 기준. src/fsd에 있다는 이유만으로 브라우저 실행이라고 단정하지 않음 |
| private helper·타입 | 함께 이동할 내부 함수·상수·JSDoc 타입·d.mts 선언 |
| 시험·도구 | 인접 시험, server bootstrap, fixture loader, 리허설·빌드·패키징·스킬 경로 |
| 보존 계약 | 입력·출력·오류·해시·서버 초기화·호환성 중 해당 항목 |

전체 export를 기준으로 누락과 중복 소유를 확인한다. `deliver.mjs`의 STEP_HEADING·stubOf처럼
의도된 재수출은 구현 중복으로 세지 않는다. 시험/도구만의 참조를 제품 공유의 근거로 삼지 않는다.
함수마다 파일을 만들지 않고 같은 변경 이유의 helper를 가까이 둔다.

원본과 새 계약의 의미가 달라져야 하는 발견은 상위 SDD에 수정 제안과 영향 범위를 기록한다.
순수 구조 변경으로 처리할 수 없는 권한·프로토콜·데이터 변경을 이 계획에서 임의로 결정하지 않는다.

### B. 공개 entry와 실행 환경 확정

공개 목록은 전수 대조를 거쳐 [영구 계약](../../architecture/shared-modules.md#공개-entry와-실행-환경)에
**14개 entry, 값 export 59개**로 확정했다. 표와 전체 JSON은 그 문서가 소유하며 여기서 복제하지 않는다.
초안의 13개/56개에서 runnerTimestamp와 qaText/qaHttpUrl을 보완하고 qa/validation entry를 추가했다.
기존 private time·text·httpUrl은 영역을 나눈 뒤에도 양쪽에서 사용하므로 검증 규칙을 복제하지 않는다.
tokenPrefix 추출은 초안대로 유지한다. 상세 provenance와 타입·소비자·시험은
[상위 ARCH Inventory](./2026-11-17-shared-modules-and-plugin-distribution.md#arch-inventory)에 있다.

`templates/template-boundary.mjs`는 deliver/codex-bundle의 내부 의존성으로 배포하며 영역 밖에서는
deliver의 STEP_HEADING·stubOf 재수출을 사용한다. 새 코드와 생산 JSON은 MIGRATE에서 만든다.

release-contract는 readTemplateContract가 manifestHash를 사용하므로 전이 의존성에
`node:crypto`가 있다. 상수 일부가 순수하다는 이유로 모듈 전체를 universal로 표시하지 않는다.
runbook도 실제 해시 계산 때문에 node다. shared 전체를 한 barrel로 묶어 이 경계를 흐리지 않는다.

명세 형식은 상위와 같이 `version: 1`, `entries: [{ path, runtime }]`다.
영구 문서에 JSON 예시를 넣더라도 생산 설정 파일과 구분한다. 공개 목록 이외의 shared 생산 파일은
선언한 내부 closure에 포함되어야 하며, 고립 파일·영역 밖 직접 참조는 허용하지 않는다.
공개 entry의 추가·제거는 계약 변경으로 기록하고 소비자·시험·배포 영향도 함께 검토한다.

### C. 영구 아키텍처 문서 작성

신규 `docs/architecture/shared-modules.md`는 다음 내용을 소유한다.

1. 상태: 적용 예정, 현재 적용 규칙, 전환 조건과 확인 revision.
2. 네 소유 영역과 배치 판단. packages/shared와 FSD shared layer의 차이.
3. 허용·금지 의존 방향, server facade와 브라우저/Node 전이 의존의 경계.
4. B의 공개 모듈·symbol·runtime·설명용 제품 소비자와 내부 helper 정책. 완전성 판단은 A의 전체 소비자 목록으로 수행.
5. plugin-exports 명세, source→lib 경로, 포함·제외 기준.
6. 검증 후 쓰기, check 읽기 전용, 오류·부분 쓰기·재실행·고아 정리 계약.
7. 호환성·버전·검증 책임과 MIGRATE 적용 조건.

새 architecture의 front matter는 `status: "planned"`, `activates-after: "Phase MIGRATE"`로
적용 상태를 표시한다. 현재 코드 배치를 바꾸는 값이나 제품 설정 파일은 아니다.
B에서 확정한 공개 표와 정확히 일치하는 `plugin-exports.json` 전체 예시를 JSON 코드 블록
하나로 넣는다. 예시에는 `version`과 `entries`만, 각 entry에는 `path`와 `runtime`만 둔다.
정적 예시와 생산 JSON 파일을 구분하고, 표를 바꾸면 예시도 함께 대조한다.

공개 계약과 의존 방향은 영구 문서에서 정의하고 다른 문서는 링크한다.
현재 파일→새 파일의 전환 이력과 실제 작업 순서는 상위 proposal이 계속 소유한다.

| 문서 | ARCH에서 추가할 내용 | 그대로 보존할 내용 |
| --- | --- | --- |
| architecture README | 문서 지도에 새 문서, 적용 예정 전환 절과 현행/목표 구분 | 현재 구조 tree·현재 배치 규칙·실제 구현 상태 |
| core.md·github.md | 새 설계 링크와 대체될 범위·시점 | 현재 원본 위치·복사 경로·실제 import 규칙 |
| fsd.md | packages/shared는 FSD shared layer가 아니라는 설명과 예정된 의존 계약 링크 | 현재 FSD 방향·공개 API·Client/Server adapter 규칙 |
| server.md | 새 위치로 들어올 서버 정책과 DB 없는 공개 경로의 계획 | 현재 방향표·public symbol·내부 시험 registry. 아직 없는 export를 현행 표에 넣지 않음 |
| verification.md | 새 검사·시험 탐색·lib 검증의 적용 예정 책임 | 현재 실행 명령·CI coverage 표·gate 조건 |
| test-organization.md | 구현 소유자를 따라 이동할 시험과 새 runtime 재귀 탐색 계획 링크 | 현재 시험 배치·검색 범위 |
| protocol.md | 소스 경로 변경의 예정 범위와 wire 의미 보존 설명 | HTTP/MCP·해시·로컬 잠금·runner·스킬 계약과 현재 경로 |
| macos-runtime.md | 새 lib 경계와 후속 패키징 검증의 예정 참조 | 현재 native 설치·권한·프로세스·검증 절차 |

현재 적용 문장을 새 경로로 바꾸는 것은 MIGRATE다. ARCH 종료 후에도 현재 코드를 보고
현행 문서를 따라갈 수 있어야 한다. 새 코드 경로는 inline code로 표시하고 존재하지 않는
소스 파일에 클릭 링크를 만들지 않는다. 새 문서·ADR 사이의 링크는 파일을 작성한 뒤 확인한다.

### D. ADR 작성과 전환 상태 정리

[ADR 템플릿](../../ADR/template.md)의 영어 heading과 한국어 본문을 따른다.
문제·결정 요인·대안·선택·비용·확인 방법을 기록하고, 상위 SDD의 네 선택지를 근거로 비교한다.
새 공개 목록을 ADR에 복제하지 않고 architecture를 참조한다.

번호는 실행 시 [ADR 목록](../../ADR/README.md)에서 정한다. 새 문서의 적용 범위에는
shared/app-core, server/FSD 소유권, plugin runtime/lib, 동기화·패키징 경계를 적는다.
0005·0007 중 대체할 결정과 보존할 책임별 배치·단일 원본 원칙을 구분한다.

ADR README에서 accepted는 현재 적용하는 결정이라는 뜻이다. ARCH에서는 새 ADR과 index의
상태를 `proposed`로 유지한다. 설계에 대한 승인 근거가 있다면 Acceptance 본문에 그 범위와
아직 미적용이라는 사실을 기록한다. 새 ADR의 `supersedes`는 `["0005", "0007"]`,
`superseded-by`는 null이며, proposed 상태의 대체 계획을 현행 대체 완료로 읽지 않도록 설명한다.
기존 두 ADR의 accepted 상태와 역사적 본문은 ARCH에서 바꾸지 않는다.
새 ADR의 accepted 전환·기존 ADR의 superseded 전환·index 갱신은 MIGRATE 적용 시점에 함께 한다.

ADR 템플릿의 설명용 front matter 주석과 placeholder는 실제 문서에 복사하지 않는다.
현재 저장소의 parseFrontMatter는 그 주석을 파싱하지 못한다. 실제 metadata 값과 MADR
본문으로 작성하고, 날짜·번호·배열 값이 문서와 index에서 일치하는지 검사한다.

번호를 고른 뒤 최초 파일 생성 전에 선택 경로를 ARCH 실행 기록에 남긴다.
이미 같은 실행의 부분 산출물이 있으면 기록된 입력·경로·내용을 대조해 이어서 작성하며,
재시도할 때 새 번호와 index 행을 추가하지 않는다. 다른 작업이 같은 번호나 경로를 사용했다면
그 파일을 덮어쓰지 않고 자기 산출물의 번호와 모든 참조를 조정한다.
완료·통합 직전에도 최신 ADR 파일 목록과 index의 번호 유일성을 확인한다.
동일 경로의 내용이나 실행 기록을 설명할 수 없으면 해당 파일의 수정을 멈추고 차이를 확인한다.

### E. 대응표·검증 기록과 MIGRATE 인계

상위 SDD의 Source Migration Map·ARCH 관련 준비도·검증 기록만 실제 산출물에 맞춰 갱신한다.
REQ/INV/CON의 의미, 다른 Phase의 범위나 완료 상태를 이 작업으로 바꾸지 않는다.
상위에 이 상세 계획을 연결할 때는 실제 파일이 존재하는 것을 확인한다.

인계에는 최종 source revision, 신규 문서·ADR 경로, 공개 entry/runtime 목록,
심볼·소비자·시험 대응표, 적용 조건, 실행한 문서 검증과 미실행 검증을 남긴다.
packages/shared/app-core 생성, JSON 명세·체커 구현, 소스 이동, plugin README·스킬과
AGENTS gate 경로 전환은 MIGRATE 항목으로 명시한다. ARCH 결과로 새 구조가 작동한다고 보고하지 않는다.

## Safety and Preserved State

ARCH에서는 파일 시스템의 문서 외에 제품 상태가 바뀌지 않는다.
DB·인증·세션·프로세스·설치·네트워크의 새 생명주기를 도입하지 않는다.
문서의 최초 생성·부분 작성·재진입은 source bundle과 ADR 경로 기록으로 구분한다.
중단 후에는 이미 생성한 문서와 index를 재사용하고 누락된 부분만 보완한다.
다른 작성자와의 ADR 번호 충돌은 덮어쓰기가 아니라 자기 문서·링크의 재번호 부여로 해결한다.
이후 원본이나 입력 snapshot이 바뀌었으면 목록을 다시 대조하며 코드 변경으로 차이를 해소하지 않는다.

문서에도 기능적 입력이 있다. server.md의 내부 시험 registry, verification의 CI coverage 표,
AGENTS의 gate 경로와 plugin 스킬의 실행 지시는 현재 동작에 연결된다.
ARCH에서 미래 상태를 이 입력들에 적용하지 않는다.
예정 경계의 구현이 없다는 이유로 현행 검사를 비활성화하거나 예외를 추가하지 않는다.

권한·프로토콜·데이터 의미를 바꾸는 발견, 설명 없는 public API 확대, Node 의존성을 가진
universal entry가 있으면 해당 계약 확정을 멈춘다. 안전하게 계속할 수 있는 다른 문서 작성은
진행하되, 미확정 항목이 남은 상태로 ARCH를 완료 처리하거나 MIGRATE를 시작하지 않는다.

## Verification detail for VFY-SMB-01

Canonical Verifier는 [상위 VFY-SMB-01](./2026-11-17-shared-modules-and-plugin-distribution.md#vfy-smb-01-영구-문서공개-목록의-의미-대조)이다.
여기서는 그 실행 대상을 문서·계약 목록에 한정해 구체화한다. 아래 인수는 모두 **계획**이다.
이번 상세 계획 작성 후 실행한 문서 검증은 별도 Verification Results에 기록한다.

### 1. 의미와 목록의 완전성

- 현재 생산 export마다 목표 소유자·공개 여부·runtime·소비자·검증 위치가 있다.
- 의도된 재수출은 원본과 연결되고 실제 구현을 복제하지 않는다.
- public entry의 내부 의존성과 Node builtin 유입을 추적해 runtime 표와 대조한다.
- A에서 식별한 private helper·타입·fixture·문자열 참조에 이동 또는 보존 판단이 있다.
- 변경 전 public 입력/오류/해시 규칙을 바꾸는 새 결정을 몰래 포함하지 않는다.

### 2. 문서 간 일관성

- 새 architecture는 적용 예정 상태이고 현재 원본·alias·체커가 유지됨을 명시한다.
- source/pub/lib 경로는 상위 대응표·새 공개 목록·문서 예시에서 일치한다.
- 모든 기존 문서의 현행 규칙은 현재 코드와 맞고 새 규칙의 활성화 시점이 일치한다.
- ADR은 이유를, architecture는 영구 규칙을, proposal은 전환·검증 기록을 소유한다.
- 플러그인 설치 문서·gate 입력을 아직 새 경로로 바꾸지 않았음을 diff로 확인한다.

### 3. 기계 검사

명령은 실행 checkout의 저장소 루트에서 수행한다. 입력 bundle 전달이 끝난 뒤,
문서를 편집하기 전에 같은 셸에서 기준 commit과 기존 문서 검사의 결과를 기록한다.
각 블록은 독립적으로 `set -e`를 적용해 앞선 실패가 뒤의 성공으로 가려지지 않게 한다.
블록을 `|| true`나 조건문의 성공 처리로 감싸지 않고 종료 코드도 확인한다.

```bash
set -e
SMB_ARCH_BASE="a0993fcc0d94eed25094012e2716abc70774f61a"
export SMB_ARCH_BASE
python3 "${CODEX_HOME:-$HOME/.codex}/skills/write-sdd-spec/scripts/validate_sdd_traceability.py" docs/proposals/completed/2026-11-17-shared-modules-and-plugin-distribution.md docs/proposals/completed/2026-11-16-shared-modules-and-plugin-distribution-phase-arch.md
npm run docs:check
```

validator가 다른 위치에 설치되어 있으면 실제로 읽은 SKILL.md 디렉터리의
`scripts/validate_sdd_traceability.py` 경로로 실행한다. 상위 정의를 복사하거나 검사를 생략하지 않는다.
부모에 이후 Phase가 포함되므로 bundle에는 standard 모드를 사용하고,
ARCH의 완료 범위는 의미 검토로 대조한다.

산출물 작성 후에는 traceability 명령을 다시 실행하고 다음 직접 검사를 수행한다.
이 검사는 신규 architecture·실제 선택된 ADR·상위/하위 계획·기존 문서까지 14개 목적지를 읽는다.
미추적 파일도 직접 검사하고, Git 추적 파일에 이번 산출물을 합친 목록으로 전체 문서 검사를
수행한다. 검증만을 위해 새 파일이나 다른 작업을 stage할 필요는 없다.
기본 docs:check는 Git 추적 목록만 읽으므로 신규 파일이 미추적인 동안에는 새 링크를 찾지 못할 수 있다.

```bash
set -e
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseFrontMatter, relativeLinks, inspectDocs } from './scripts/checks/verify-docs.mjs';
const root = process.cwd();
const base = process.env.SMB_ARCH_BASE;
assert.match(base ?? '', /^[0-9a-f]{40}$/, 'SMB_ARCH_BASE must be the recorded start commit');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
const list = (...args) => git(...args).split('\0').filter(Boolean);
const proposals = ['docs/proposals/completed/2026-11-17-shared-modules-and-plugin-distribution.md', 'docs/proposals/completed/2026-11-16-shared-modules-and-plugin-distribution-phase-arch.md'];
const architecture = ['README', 'core', 'github', 'fsd', 'server', 'verification', 'test-organization', 'protocol', 'macos-runtime'].map(name => 'docs/architecture/' + name + '.md');
const matches = readdirSync('docs/ADR').filter(name => /^\d{4}-separate-shared-module-distribution\.md$/.test(name));
assert.equal(matches.length, 1, 'exactly one ARCH ADR must exist');
const adr = 'docs/ADR/' + matches[0];
const id = matches[0].slice(0, 4);
assert.equal(readdirSync('docs/ADR').filter(name => name.startsWith(id + '-')).length, 1, 'ADR number collision');
const shared = 'docs/architecture/shared-modules.md';
const targets = [...proposals, ...architecture, shared, adr, 'docs/ADR/README.md'];
const changes = [...new Set([...list('diff', '--name-only', '-z', base), ...list('ls-files', '--others', '--exclude-standard', '-z')])];
assert.deepEqual(changes.filter(file => !targets.includes(file)), [], 'change outside ARCH documents');
const slug = value => value.toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
const anchors = text => {
  const seen = new Map(), result = new Set();
  const prose = text.replace(/^(\x60{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
  for (const match of prose.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const key = slug(match[1]), count = seen.get(key) ?? 0;
    result.add(key + (count ? '-' + count : '')); seen.set(key, count + 1);
  }
  return result;
};
for (const file of targets) {
  const body = readFileSync(file, 'utf8');
  assert.ok(body.endsWith('\n'), file + ': final newline');
  assert.equal(/[ \t]+$/m.test(body), false, file + ': trailing whitespace');
  const linkBody = body
    .replace(/(\]\(\s*<?)#/g, (_, prefix) => prefix + path.basename(file) + '#')
    .replace(/(^ {0,3}\[[^\]]+\]:\s*<?)#/gm, (_, prefix) => prefix + path.basename(file) + '#');
  for (const link of relativeLinks(linkBody)) {
    const [location, anchor] = link.split('#');
    const resolved = location.startsWith('/') ? path.resolve(root, '.' + decodeURIComponent(location)) : path.resolve(path.dirname(file), decodeURIComponent(location));
    assert.ok(existsSync(resolved), file + ': ' + link);
    if (anchor && resolved.endsWith('.md')) assert.ok(anchors(readFileSync(resolved, 'utf8')).has(decodeURIComponent(anchor)), file + ': ' + link);
  }
}
const metadata = parseFrontMatter(readFileSync(adr, 'utf8'));
assert.equal(metadata.status, 'proposed');
assert.deepEqual(metadata.supersedes, ['0005', '0007']);
assert.equal(metadata['superseded-by'], null);
assert.match(metadata.date, /^\d{4}-\d{2}-\d{2}$/);
for (const key of ['applies-to', 'decision-makers', 'consulted', 'informed']) assert.ok(Array.isArray(metadata[key]));
for (const file of ['docs/ADR/0005-organize-core-modules.md', 'docs/ADR/0007-share-github-url-modules.md']) assert.equal(parseFrontMatter(readFileSync(file, 'utf8')).status, 'accepted');
const indexRow = readFileSync('docs/ADR/README.md', 'utf8').split('\n').filter(line => line.includes('](' + matches[0] + ')'));
assert.equal(indexRow.length, 1); assert.match(indexRow[0], /\|\s*proposed\s*\|$/);
const markdown = readFileSync(shared, 'utf8');
const state = parseFrontMatter(markdown);
assert.equal(state.status, 'planned');
assert.equal(state['activates-after'], 'Phase MIGRATE');
const tick = String.fromCharCode(96);
const blocks = [...markdown.matchAll(new RegExp('^' + tick.repeat(3) + 'json\\n([\\s\\S]*?)^' + tick.repeat(3) + '[ \\t]*$', 'gm'))].map(match => JSON.parse(match[1]));
assert.equal(blocks.length, 1, 'one complete proposed plugin-exports example');
const manifest = blocks[0];
assert.deepEqual(Object.keys(manifest).sort(), ['entries', 'version']);
assert.equal(manifest.version, 1); assert.ok(Array.isArray(manifest.entries) && manifest.entries.length);
const names = new Set();
for (const item of manifest.entries) {
  assert.deepEqual(Object.keys(item).sort(), ['path', 'runtime']);
  assert.match(item.path, /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\.mjs$/);
  assert.ok(['universal', 'node'].includes(item.runtime));
  assert.ok(!names.has(item.path)); names.add(item.path);
}
const table = markdown.split('\n').filter(line => line.startsWith('| ' + tick)).map(line => line.split('|').slice(1, -1).map(cell => cell.trim())).filter(cells => ['universal', 'node'].includes(cells[1])).map(cells => ({ path: cells[0].replaceAll(tick, ''), runtime: cells[1] }));
const ordered = rows => [...rows].sort((a, b) => a.path.localeCompare(b.path));
assert.deepEqual(ordered(manifest.entries), ordered(table), 'JSON and public API table differ');
for (const [file, start, end] of [
  ['docs/architecture/server.md', '<!-- server-internal-tests:start -->', '<!-- server-internal-tests:end -->'],
  ['docs/architecture/verification.md', '<!-- ci-coverage:start -->', '<!-- ci-coverage:end -->']
]) {
  const section = text => { const a = text.indexOf(start), b = text.indexOf(end); assert.ok(a >= 0 && b > a); return text.slice(a, b + end.length); };
  assert.equal(section(readFileSync(file, 'utf8')), section(execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' })), file + ': active machine input changed');
}
const tracked = list('ls-files', '-z');
const effective = [...new Set([...tracked, ...targets])];
const report = inspectDocs(root, effective);
assert.deepEqual(report.problems, []);
console.log(JSON.stringify({ targets: targets.length, publicEntries: manifest.entries.length, adr, metadata: 'PASS', linksAndAnchors: 'PASS', activeInputs: 'unchanged', wholeDocumentCheck: report }));
NODE
git diff --check
git diff --cached --check
```

JSON shape·runtime·경로 유일성·공개 표 일치, ADR metadata·index, 링크·anchor·공백,
같은 문서의 인라인·참조형 `#anchor` 목적지까지 확인한다. `relativeLinks`는 원래 같은 문서의
anchor를 제외하므로 검사 전에 현재 파일의 상대 경로로 정규화한다. 코드 블록과 인라인 코드의
링크 예시는 기존 parser가 계속 제외한다. 이와 함께
기능적 문서 입력의 보존을 이 명령으로 확인한다. 의미·소비자 근거·권한·프로토콜 불변은
위 1~2절의 전수 대조가 담당한다. 정적 통과를 제품 구현·설치 통과로 확대하지 않는다.

기준 checkout의 docs:check부터 실패하면 같은 입력에서 재현해 기존 실패를 기록한다.
다른 작업의 이동 중인 문서를 고쳐서 통과시키지 않는다. 새 산출물이 모두 포함된 전체 문서
검사와 직접 검사가 통과해야 ARCH를 완료할 수 있으며, 추적된 산출물에 대한 CI의 docs:check도
동일하게 통과해야 한다.

검증 명령을 바꿀 때는 Node 검사 본문만 실행하지 않고 전체 셸 블록으로 정상·실패를 확인한다.
traceability 실패와 산출물 검사 실패를 각각 주입하면 뒤의 명령으로 넘어가지 않고 블록이
0이 아닌 코드로 종료되어야 한다. 정상 in-page anchor와 코드 예시는 통과하고,
존재하지 않는 인라인·참조형 in-page anchor는 실패해야 한다.

### 4. 변경 범위와 종료 증거

후속 ARCH 실행 전 허용 문서 목록과 각 baseline을 기록하고 실행 후 diff를 대조한다.
제품 코드, packages, plugin, scripts, package/tsconfig, workflow, AGENTS의 실행 규칙에
새 변경이 없어야 한다. 기존 dirty 파일의 존재 자체를 이 작업의 실패로 세지 않는다.
검증 결과에는 실행한 명령·revision·문서 목록과 미실행인 MIGRATE/ACCEPT 검증을 구분해 남긴다.

## Affected Files for ARCH Execution

아래는 수행한 ARCH의 허용 문서다. 상세 계획은 완료 시 completed로 옮겨 같은 논리적 산출물로 검증했다.

| 구분 | 허용 파일 | 작업 |
| --- | --- | --- |
| 신규 영구 계약 | `docs/architecture/shared-modules.md` | C의 계약·공개 목록·전환 상태 |
| 기존 아키텍처 | `README.md`, `core.md`, `github.md`, `fsd.md`, `server.md`, `verification.md`, `test-organization.md`, `protocol.md`, `macos-runtime.md` — 모두 `docs/architecture/` 아래 | C의 표에 지정한 예정 참조·현행 보존 |
| 결정 기록 | 새 번호의 `docs/ADR/*-separate-shared-module-distribution.md`, `docs/ADR/README.md` | D의 결정과 index. 기존 ADR 역사 본문 변경 금지 |
| 전환·인수 기록 | 상위 SDD와 이 계획 | A의 전수 목록, 실제 ARCH 결과와 링크, MIGRATE 인계 |

그 밖의 파일은 ARCH의 변경 대상에 자동으로 포함하지 않는다.
상위 전체 영향 파일 목록에 있다는 이유만으로 현재 Phase의 쓰기 범위로 삼지 않는다.

## Readiness and Phase Boundary

ARCH의 착수 조건은 동일 source bundle 전달, 실제 실행 기준·도구 확보,
명시된 문서 범위와 충돌 없는 ADR 경로다. 종료 조건은 A~E의 산출물·전수 대조와
새 목적지를 포함한 VFY-SMB-01 검사 통과다. 코드·생산 JSON·체커를 작성하지 않고
수행하는 문서 단계이며, 계획을 검토한 사실만으로 ARCH 실행 완료를 선언하지 않는다.

이 계획은 상위 방향을 바꾸지 않는다. 공개 entry의 구체적인 이름과 runtime,
내부 template-boundary의 배포, tokenPrefix 추출, 문서별 예정/현행 처리와
출하 문서의 MIGRATE 배치는 상위 Task의 세부화다.
전수 대조에서 의미 변경이 필요하면 상위 계약의 수정 사항으로 기록하며 자식만으로 덮어쓰지 않는다.

상위 BLK-SMB-01의 외부 템플릿·기존 설치·양 OS 증거는 ACCEPT의 조건이다.
ARCH에서 그 환경을 만들거나 실제 모델·게이트를 실행할 필요는 없다.
일반적인 후속 검증의 미실행은 ARCH 문서 작성의 blocker로 확대하지 않는다.

## Risks and Rollback

- 목표 문서가 현행처럼 읽힐 수 있다. 상태·적용 조건을 문서 첫 부분과 index에서 구분한다.
- 같은 정책이 여러 문서에 복제될 수 있다. 규칙은 새 architecture, 전환 목록은 상위 SDD가 소유한다.
- 긴 심볼 목록은 기준 코드 변경으로 낡을 수 있다. revision·부모 snapshot과 소비자 근거를 기록하고
  실제 ARCH 실행 시작 및 종료 시 다시 대조한다.
- public API를 내부 코드 절감용으로 과도하게 넓히지 않는다. 실제 제품 소비자와 계약을 근거로 정한다.
- rollback은 해당 실행이 추가한 문서와 문서 diff만 되돌린다. 기존 작업·과거 ADR 본문·제품 상태를
  복구 명목으로 수정하지 않는다.

## Verification Results

아래 첫 표는 2026-11-12 상세 계획 작성 당시의 기록이다. 현재 정합성 검토와 ARCH 산출물 인수와 구분한다.

| 확인 | 상태 | 근거·한계 |
| --- | --- | --- |
| 부모 snapshot·원본 export·소비자·아키텍처·ADR 형식·active 제안 재대조 | 확인 | 위 기준 작업 트리의 읽기 전용 조사 |
| 작성 전 전체 docs:check | 기존 실패 | 이동 중인 추적 경로 `docs/proposals/active/codex-dual-client-runtime-follow-ups.md`의 ENOENT 재현 |
| 부모+자식 traceability | PASS | standard 모드로 두 파일 검사. canonical REQ 7개와 Task/Phase·VFY 연결 7/7, 중복 정의·오류·경고 0개 |
| 새 문서 metadata·링크·anchor·공백 | PASS | 저장소의 parseFrontMatter·relativeLinks 사용. 상대 링크 10개와 heading anchor, related 11개 유효. 줄 끝 공백 0개·마지막 개행 확인 |
| 선택 Phase 의미 검토 | 확인 | 상속 ID의 단일 정의, 문서별 현행/예정 구분, 공개 runtime, 출하 문서의 MIGRATE 배치, 후속 blocker·인계 범위를 대조. 독립 검토·구현 인수 결과는 아님 |
| 부모 SDD 보존 | PASS | 작성 전후 SHA-256이 위 snapshot과 동일 |
| 현재 architecture·제품 코드 변경 | 미수행 | 이번 요청은 이 상세 계획 한 파일 작성 |
| ARCH 산출물·MIGRATE·ACCEPT | 미실행 | 계획 작성의 통과를 실행 완료로 간주하지 않음 |

### 2026-11-16 정합성 검토의 편집 pass

처음부터 개선점이 없었던 것은 아니다. 다음 세 가지 실행·검증 공백을 확인하고 본문에 반영했다.

- source bundle이 미추적 상태여서 격리 checkout에 없는 문제: 동일 snapshot 전달·해시 대조·기준 기록을 진입 절차에 추가했다.
- 최종 문서 목적지의 실행 가능한 검사가 없는 문제: 작성자 개인 경로에 고정된 명령을 설치 경로 기반으로 바꾸고, 새 문서·ADR·JSON·현행 검사 입력을 직접 검사하는 명령을 추가했다.
- ADR의 적용 시점·재시도/번호 충돌 처리의 모호함: ARCH의 proposed 상태, MIGRATE의 효력 전환, 부분 산출물 재사용과 충돌 시 자기 문서의 참조 갱신을 명시했다.

열린 PR 수는 2026-11-16 조회 값으로 갱신했다. 이는 코드 변경 후 새 결함이 아니라
실행 전 다시 확인하도록 이미 정한 변동 정보의 갱신이다.

| 검증 | 결과 | 범위와 한계 |
| --- | --- | --- |
| 원본·공개 심볼 대조 | PASS | 생산 모듈 27개, 제안 entry 13개·공개 심볼 56개를 원본 export 또는 명시된 prefixOf 추출과 대조 |
| 격리 기준 checkout | 확인 | 최초에는 두 계획서가 없었음. 두 입력을 동일 바이트로 전달한 후 기존 네 검증 명령을 실행 |
| 기준 docs:check·traceability·diff 검사 | PASS | HEAD 기반 격리 사본. 현재 원래 작업 트리의 다른 문서 이동 오류와 구분 |
| 새 목적지 직접 검사 | PASS | 임시 문서 fixture 14개, 공개 entry 13개, effective 문서 검사 217개. 실제 ARCH 산출물을 작성한 것이 아님 |
| 실패 검출 | PASS | 미추적 공백, 잘못된 runtime, 조기 accepted, 현행 registry 변경, 깨진 anchor, JSON/표 불일치, ADR 번호 충돌, index 중복 8건을 모두 실패로 검출하고 복원 후 통과 |
| 실행 환경 | 확인 | macOS zsh, Node.js 26.4.0, Python 3.9.6, Git 2.50.1, TypeScript 5.9.3 |
| 제품 코드·실제 ARCH 산출물·외부 gate | 미실행 | 이번 작업은 이 계획의 정합성 개선 |

이 표는 편집에 사용한 근거다. source 편집 직후에는 clean pass를 주장하지 않는다.
최신 저장본을 대상으로 한 별도의 무수정 최종 검토와 그 source identity는 검토 결과 응답에 기록한다.
후속 MIGRATE·ACCEPT의 제품·설치 인수와 정합성 검토의 통과를 구분한다.

### 2026-11-16 재검토: 셸 실패 전달과 같은 문서 anchor

동일 입력 문서(`fc495584be21a568685b14a918509d90e002eb92eb1cd66bb10c1ba64cf5148e`)로
새 전체 검토를 수행했다. 처음부터 개선점이 없었던 것은 아니다.
이전 검토는 Node 검사 자체의 거부는 확인했지만 전체 셸 블록의 실패 전달과
같은 문서 anchor를 놓쳤다. 이번에는 다음 두 문제를 재현하고 수정했다.

- traceability 또는 Node 검사가 실패해도 뒤의 npm/git 명령이 성공하면 블록 종료 코드가
  0이 됐다. 각 블록에 `set -e`를 적용하고 기준 commit 조회와 export도 분리했다.
- `relativeLinks`가 `#anchor`를 제외하므로 같은 문서의 깨진 인라인·참조형 링크가
  통과했다. 현재 파일 경로로 정규화한 뒤 실제 heading과 대조하도록 보완했다.

| 검증 | 결과 | 범위 |
| --- | --- | --- |
| 수정 전 전체 블록 | 결함 재현 | zsh/bash 모두 traceability·JSON 오류가 보여도 0을 반환. 깨진 같은 문서 anchor도 통과 |
| 수정안 전체 블록 | PASS | 두 셸에서 30회 실행: 정상·복원 8회는 0, 실패 사례 22회는 비정상 종료. 실패 뒤 npm/git 미실행 확인 |
| anchor 양성·음성 | PASS | 기존 정상 anchor·참조형 링크는 통과, 없는 anchor는 실패, 코드 블록·인라인 코드의 예시는 제외 |
| 새 active 제안 | 확인 | scripts-coupling-remediation의 H1과 후속 출하 판정 소유권 조정 필요. ARCH에서 해당 구현을 선행하지 않음 |

이 기록은 편집에 사용한 검증이며 실제 ARCH 수행 결과가 아니다.
수정 후 최신 bundle에 대한 무수정 최종 검토는 별도로 수행하고 결과 응답에 기록한다.

## ARCH Execution Results

### 입력과 실제 작업 기준

- 기준: `a0993fcc0d94eed25094012e2716abc70774f61a` (실행 시작에 fetch한 origin/dev).
- 브랜치: `harness/shared-modules-arch-20261116`.
- 관리 worktree task: `11d8aeae-6edc-42a9-a21b-a1afd72c4893`.
- 원본 상위 입력 SHA-256: `2fa38ac553d73b2c680cd98cd7a72f2a379431e4c617cd9459f802d11a894608`.
- 원본 상세 입력 SHA-256: `2c75cec0dc29391753ee01041738936281800018e812af8847cc2772fb81b49f`.
- 두 미추적 입력을 동일 바이트로 격리 작업 트리에 전달했고 원래 dirty 문서·코드 변경은 보존했다.
- 기준 docs:check: PASS, Markdown 220개·상대 링크 1111개·시험 보고서 59개.
- AST 도구: lockfile과 일치하는 TypeScript 5.9.3. Node 26.4.0, Python 3.9.6, Git 2.50.1, macOS.
- 최신 dev의 active 두 제안(role-command-time-limit, template-release-acceptance-follow-ups)과
  원래 작업 트리의 미통합 제안 차이를 대조했다. 이미 적용된 수정은 유지하며 타 작업을 구현하지 않았다.

### 수행 결과와 인계

아키텍처 새 문서, proposed ADR-0008, 기존 architecture 9개와 ADR index,
상위 전수 대응표와 이 완료 기록을 연결했다. 논리적 문서 산출물은 14개다.
27개 원본·값 export 출현 175개·private binding 49개·type 31개·직접 참조 404건과
재수출 이후 소비자·문자열/fixture/glob을 대조했다. shared 공개는 14개/59값이며 내부 실행
template-boundary 1개를 구별했다. .d.mts 여섯 파일의 signature도 소유자에 연결했다.

runner/QA 공통 helper, pipeline → templates 예정 방향, token façade와 리허설의 늦은 TS import,
plugin 시험의 고정 토큰 fixture, 타입/시험 이동 목적지를 상위 SDD와 영구 계약에 반영했다.
앞부분에 남긴 13개/56개 검증 수치는 초안 검토 이력이며 최종 계약 수치가 아니다.
REQ-SMB-006의 적용 예정 문서 부분과 TASK-ARCH-01/VFY-SMB-01만 완료했다.
기존 ADR-0005/0007, server 시험 registry, CI coverage, 제품 코드·출하 파일의 바이트를 보존했다.

### 최종 검증

| 검증 | 결과 | 실제 범위 |
| --- | --- | --- |
| 부모+완료 자식의 traceability | PASS | standard, REQ 7개; 작업/Phase 7/7·VFY 7/7, 오류·경고 없음 |
| 새 산출물을 포함한 VFY-SMB-01 직접 검사 | PASS | 목적지 14개, 공개 entry 14개; JSON schema·runtime·표 일치, metadata·링크·anchor·공백 검사 |
| 전체 문서 검사 | PASS | Markdown 224개·상대 링크 1159개·시험 보고서 59개. inspectDocs에 추적 파일+신규 산출물을 합쳐 검사 |
| 최종 추적 후보의 `npm run docs:check` | PASS | 동일 224/1159/59. 임시 Git index/object 디렉터리에 이번 14개 문서만 추적 후보로 넣어 실행. 실제 저장소 index는 변경하지 않음 |
| AST inventory와 최종 문서 대조 | PASS | 원본 27개·export 출현 175개·private 49개·type 31개·직접 참조 404건, 공개 14개/59값; 재수출 후속 참조 45행과 문자열 참조 197파일도 인계 목록에 기록 |
| 전체 셸 블록의 실패 전달 | PASS | zsh/bash에서 traceability·산출물 검사 실패를 각 주입한 4회 모두 비정상 종료. 뒤의 npm/git 미실행 확인 |
| 최종 산출물의 거부 사례 | PASS | 깨진 인라인/참조형 같은 문서 anchor, 잘못된 runtime, JSON/공개 표 불일치 4건 모두 실패. 원본 복원 후 정상 검사 재실행 |
| `git diff --check`, `git diff --cached --check`와 범위 대조 | PASS | 문서 14개만 변경. server 내부 시험 registry·CI coverage 블록, 기존 ADR-0005/0007, 제품·출하 파일 보존 |
| 원래 입력 보존 | PASS | 원래 작업 폴더의 두 미추적 입력 해시는 전달 전 값과 동일. 다른 작업의 dirty 문서를 수정·stage·정리하지 않음 |
| 종료 branch/worktree 점검 | 보존 | cleanup 실행 성공: 삭제 0개, 사용 중/dirty 3개 보존. 관리 작업은 unpreserved-files로 retained; 미커밋 문서가 있으므로 worktree 제거를 요청하지 않음 |

일반 작업 트리의 `npm run docs:check`는 Git 추적 목록만 사용하므로 신규 문서를 아직 추적하지
않은 상태에서는 그 링크를 거부했다. 이를 문서 오류로 숨기거나 다른 작업을 stage하지 않고,
위 직접 검사와 임시 index의 실제 명령으로 최종 추적 후보를 검증했다. 실제 CI는 실행하지 않았다.
두 셸 블록은 완료 문서의 실제 목적지와 기록한 baseline으로 갱신해 전체를 실행했다.
MIGRATE의 코드·경계 검사·build와 ACCEPT의 native 설치·외부 gate는 미실행이며
ARCH 통과를 그 검증의 성공으로 해석하지 않는다.

## Approval and Completion

실행 승인 범위는 front matter가 소유한다. 사용자의 “해당 md를 바탕으로 수정을 진행하라”는
명시적 요청을 실행 근거로 삼았으며 그 전에 수행한 검토 요청과 구분했다.
ARCH 완료에 따라 이 상세 문서를 completed로 이동했다. 상위 SDD는 후속 MIGRATE·ACCEPT가
남아 active/pending으로 유지한다. 다음 Phase의 자동 착수·출시·병합은 수행하지 않았다.

완료 산출물은 위에 연결한 영구 문서·ADR·전환 목록·검증 기록이다. 작업은
`harness/shared-modules-arch-20261116`의 격리 worktree에 미커밋 상태로 보존했다.
원래 작업 폴더의 미추적 입력은 변경하지 않았으며 이 완료본이 이번 실행 결과다.
