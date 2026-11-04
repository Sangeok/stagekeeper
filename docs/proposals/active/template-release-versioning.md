---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-02"
approved-by: "requesting-user"
approved-at: "2026-11-03"
approval-scope: "2026-11-03 문서를 바탕으로 실제 코드 수정을 요청했다. Core 구현과 격리 검증을 진행하며 운영 DB 이관·활성화·서비스 배포는 포함하지 않는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/core.md"
  - "docs/architecture/server.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/pipeline-execution.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/active/codex-dual-client-runtime-follow-ups.md"
---

# 템플릿 버전별 배포와 파이프라인 실행 버전 고정

## Summary

비공개 Git 저장소에서 템플릿 원본을 관리하고 PostgreSQL을 통해 제공하는 구조를 유지한다. 운영자가 지정한 커밋을 CI가 가져와 검증한 뒤 변경 불가능한 템플릿 묶음으로 저장하고, 별도 활성화 작업으로 새 실행에 적용한다. 파이프라인 실행은 시작할 때 템플릿 묶음과 언어를 고정하며, 배정 전후와 여러 에이전트에 걸쳐 같은 묶음을 사용한다.

이 제안은 로컬 clone에 의존하는 배포 절차와 실행 도중 지침이 교체되는 문제를 함께 해결한다. 서버·플러그인·로컬 생성 파일의 호환성 검증을 활성화 조건에 포함한다. 2026-11-03 실제 코드 수정 요청에 따라 Core 구현을 진행한다. 운영 DB 이관·서비스 배포는 별도 운영 경계다.

## Goal

- 운영자의 PC에 원본 저장소가 없어도 지정한 템플릿 커밋을 재현 가능하게 배포한다.
- 템플릿 배포 후에도 진행 중인 실행의 단계 본문과 전이 규칙을 유지한다.
- 어떤 원본·검증 조합을 배포했고 각 실행이 어떤 템플릿을 사용했는지 추적한다.
- 활성 버전을 되돌릴 때 기존 실행·보고·사용자 변경 파일을 보존한다.

## Proposal Size

`standard`, 위험 등급 `HIGH-RISK`, 작성 모드 `WHOLE_SDD`다. 영속 데이터와 REST/MCP·설치 계약을 변경하고, 구·신 서버 공존과 실행 재개·복구를 다룬다. 이 문서는 전체 설계 검토안과 Phase별 완료 경계를 정의하며, 모든 Phase의 상세 구현 계획이나 운영 실행 승인을 대신하지 않는다. Core 구현과 로컬 검증 결과는 Implementation Progress에 기록한다. 운영 이관·native 출시 인수는 별도 Phase TPL4 경계다.

이 문서의 reconciliation은 전체 설계의 코드 정합성·실행 순서·변경 후 산출물·검증 목적지를 심사한다. 미래 제품 VFY가 아직 실행되지 않았다는 사실과 현재 설계의 미해결 결함을 구분한다. 최신 저장본의 무편집 대조가 통과해도 각 Phase의 구현·운영 인수나 실행 승인을 대신하지 않는다.

## Current State

### 근거와 권위

이 표는 구현 전 reconciliation 기준이다. 구현 후 현재 계약은 [template-releases.md](../../architecture/template-releases.md)와 아래 Implementation Progress를 따른다.

조사 기준은 `dev`의 `14d605599a92e8b242f7e20073281f97aa4d56c1`과 2026-11-02 로컬 파일이다. 문서 작업 브랜치는 `harness/template-release-versioning-sdd-20261102`다. 초안 작성 시작 시 작업 트리는 깨끗했고, 이번 재검증 시작 시 변경은 이 미추적 문서 하나였다. 이전 `harness/src-clean-code-review-20261102`의 커밋은 해당 브랜치에 보존했다.

재검증에서 GitHub 앱으로 private 원본 `Sangeok/harness-templates@fb6ef955ba3f6fc8320e173fbafc9ef03b83281b`도 조회했다. 전체 tree 16개 blob과 반환 내용의 Git blob hash를 대조했다. 원본 수정·커밋·seed는 하지 않았다. CLI의 404와 달리 앱 연결은 접근 가능했으므로 저장소 부재나 삭제로 해석하지 않는다.

[아키텍처 문서](../../architecture/README.md), [프로토콜](../../architecture/protocol.md), [파이프라인 실행 계약](../../architecture/pipeline-execution.md)이 현재 계약이다. 아래 변경은 제안이며, 이 문서를 저장하는 것만으로 현행 계약이 변경되지는 않는다.

| 분류 | 근거 | 현재 동작과 설계 영향 |
| --- | --- | --- |
| Contracted | 아키텍처 README | 원본은 별도 private 저장소 `Sangeok/harness-templates`이며 배포 경로는 DB다. 공개 저장소에 본문을 포함하지 않는다. |
| Observed | [seed-templates.ts](../../../scripts/templates/seed-templates.ts), [template-seed-query.ts](../../../scripts/templates/template-seed-query.ts) | 로컬 디렉터리를 읽고 전체 검증·스냅샷 후 Serializable transaction에서 `(lang, path)`로 upsert한다. 원격 가져오기, 커밋과 작업 파일의 일치 검사, 버전별 DB 보존은 없다. |
| Observed | 로컬 경로·private 커밋 조회 | `plugin/templates/`는 없다. 앱으로 고정 커밋의 원본 13행과 7개 agent graph를 확인했다. 이 커밋이 실제 DB에 배포됐는지는 확인하지 않았다. |
| Observed | [Prisma schema](../../../prisma/schema.prisma) | `Template`은 `lang`, `path`, `body`, `updatedAt`을 가진다. `PipelineRun`, `PipelineWorkRun`, `AgentRun`에 템플릿 버전 참조가 없다. |
| Observed | [agents/runs.ts](../../../src/server/agents/runs.ts), [agents/next.ts](../../../src/server/agents/next.ts) | 매 `agent_next`에서 현재 템플릿을 다시 읽고 파싱한다. 현재 단계가 사라진 경우의 종료 경로는 있지만, 같은 단계 ID의 본문·전이 변경은 실행 버전으로 격리되지 않는다. |
| Observed | [agents/run-service.ts](../../../src/server/agents/run-service.ts) | 템플릿 파싱은 현재 커서 transaction 바깥에서 시작한다. 이후 run/entry·receipt·사용량 검사를 하므로 템플릿 선택과 실행 결합의 경계를 함께 바꿔야 한다. |
| Observed | `agents/run-service.ts:cursorTransaction`, `pipeline/run-service.ts:readFacts,nextFor`, `pipeline/codex-handoff-query.ts` | `format: null` 작업의 에이전트는 현재 부모 참조 없이 생성된다. 완료 조회는 미결합 실행을, 프로젝트 역할의 완료 조회는 다른 부모의 실행까지 읽고, 재개/handoff도 미결합 실행을 찾는다. 버전 pin만 추가하면 잘못된 상속·완료 누락이 생기므로 부모 전달과 조회를 함께 바꿔야 한다. |
| Observed | [pipeline/work-run.ts](../../../src/server/pipeline/work-run.ts), [pipeline/board-service.ts](../../../src/server/pipeline/board-service.ts), [pipeline/run-service.ts](../../../src/server/pipeline/run-service.ts) | 프로젝트 실행, 배정 후 작업 실행, 직접 실행·재개 등 여러 생성 경로가 있다. `PipelineVersion`을 고정하는 기존 패턴이 있다. |
| Observed | [mcp/deps.ts](../../../src/server/mcp/deps.ts), [client-bundle-query.ts](../../../src/server/templates/client-bundle-query.ts) | Codex의 런북 검사는 현재 DB 번들을 기준으로 한다. 활성 번들만 바꾸면 이전 실행이 이전 런북을 갖고도 stale로 거부될 수 있다. |
| Observed | [templates-handler.ts](../../../src/server/rest/templates-handler.ts), [runbook-handler.ts](../../../src/server/rest/runbook-handler.ts) | 다운로드 응답에는 전체 템플릿 묶음 ID가 없고 런북 보고는 12자리 런북 해시를 받는다. 현재 REST는 요청한 언어의 템플릿이 없으면 영어로 fallback하지 않고 404를 반환한다. 버전 모드의 공통 언어 선택을 추가해도 legacy REST의 이 동작과 인증·가용성·요청 제한·플랜별 본문 경계는 유지한다. |
| Observed | [harness-init.mjs](../../../plugin/bin/harness-init.mjs), [manifest.mjs](../../../packages/core/templates/manifest.mjs), [mcp-client.mjs](../../../plugin/runtime/mcp-client.mjs) | init은 관리 파일·런북·잠금 파일을 쓰고 Codex preflight는 현재 서버 번들을 읽는다. 부분 생성, `skip(modified)`, 다른 클라이언트의 잠금 항목을 고려해야 한다. |
| Observed | [client-init-smoke.yml](../../../.github/workflows/client-init-smoke.yml) | private 원본 checkout과 격리 DB의 init 시험 기반이 있다. 현재 private checkout은 `ref`를 지정하지 않으며 운영 템플릿 배포 workflow가 아니다. |
| Contracted | `server.md`, `verify-server-boundaries.mjs` | `pipeline`의 서버 의존은 `projects`, `usage`다. `pipeline → templates`의 값·타입 import를 추가하면 경계 위반이다. DB 테이블은 모듈의 독점 소유가 아니다. |
| Observed | `run-service.ts:headFor,nextFor`, `work-run.ts:projectWorkNext` | 조회처럼 보이는 호출에서도 실행 생성·전진이 일어난다. 호출 뒤 검사만으로 무변경 거부를 보장하지 못한다. |
| Observed | `packages/core/execution/watch.mjs`, `plugin/bin/harness-watch.mjs` | 알 수 없는 `wait.on`은 파서가 거부한다. Claude watch는 공통 `mcp-client.mjs`와 별도로 요청을 구성한다. |
| Observed | `harness-init.mjs`, `file-ownership.mjs` | 현재 init guard는 파일 쓰기 구간만 감싸며 설치 lock은 마지막에 쓴다. Claude 런북 블록은 파일별 hash 관리 밖에 있다. 이전 ready 정보를 남겨 둔 부분 갱신은 별도로 방지해야 한다. |
| Observed | `harness-released-readers.test.mjs` | 기존 시험은 `.git/harness/watch.lock.json` 등 세션 상태를 검증한다. `harness.lock.json` 설치 형식의 출시판 호환성을 검증하지 않는다. |
| Observed | `rehearse-client-init-smoke.ts:parseArguments` | 현재 Codex·bundle 입력은 명시적으로 거부된다. 기존 smoke 통과를 양쪽 client 인수로 확대할 수 없다. |
| Inferred | 위 실행·저장 경로 | CI에서 기존 seed를 실행하는 개선만으로는 실행 도중 지침 변경, 런북 혼용, 배정 전후의 버전 변경을 막지 못한다. |
| Observed | private `templates.test.mjs` | 현재 없는 `examples/apch/harness.json`, lock 형식 1, 서버 내부 parser/board-rules 경로를 참조한다. 새 검증 입력·형식과 허용된 import/시험 배치로 함께 갱신해야 한다. |
| Unresolved | 운영 환경·출시 패키지·새 private 계약 | 실제 DB 내용, 실행 목록, 전체 출시판 조합, 새로운 설치 전달 계약의 실제 인수와 private 백업 보관은 미검증이다. 아래 차단 조건으로 관리한다. |

## Scope

포함 범위:

- 커밋을 지정한 private 원본 취득, 결정적인 내용 해시, 전체 사전 검증과 버전별 DB 저장.
- 활성 버전 전환, 동시 배포 거부, 재시도·응답 유실 복구와 배포 감사 기록.
- `PipelineWorkRun`·`PipelineRun`·`AgentRun`의 템플릿 버전과 유효 언어 선택.
- REST/MCP, 두 클라이언트의 init·런북·관리 파일·preflight·역할 briefing에 걸친 호환성 계약.
- 현행 DB의 기준 묶음 확보, 구버전 reader/writer 차단, 격리 이관·복구 시험과 운영 적용 절차.

제외 범위:

- 에이전트 역할·단계·플랜·사용량 상한·사용자 게이트의 제품 정책 변경.
- 템플릿 편집 UI, 사용자별 템플릿 커스터마이징, 자동 A/B 선택, 자동 과거 버전 삭제.
- GitHub를 사용자 요청마다 조회하는 런타임, 별도 템플릿 서버·워크플로 엔진 도입.
- 기존 resident·OS 권한·설치 인수의 완료 선언. 관련 active 제안서의 범위를 대신하지 않는다.

분류는 Core = TPL0–TPL3의 계약·격리 구현/검증, Approval-after = TPL4의 실제 운영 적용이다. 캐시는 후속 최적화이며 첫 완료 조건이 아니다. 자동 GC·편집 UI·새 실행 엔진은 Out of scope다. 운영 적용이 별도라는 이유로 Core의 이관 도구·복구 설계·격리 시험을 생략하지 않는다.

웹 Run은 실제 시작 transaction 시점에 템플릿을 선택한다. 기존 `graphKey`·시작 입력·사용자 게이트 UI는 보존하며 브라우저가 템플릿 버전을 지정하는 DTO를 추가하지 않는다.

## Requirements and Invariants

다음 ID의 정의는 이 문서가 소유한다. EARS 조건의 주체인 시스템은 배포 도구, 서버와 플러그인의 해당 계약 소유자를 뜻한다.

### REQ-TPL-001: 지정 원본의 재현 가능한 등록

WHEN 운영자가 원본 커밋과 대상 환경을 명시하여 등록을 요청하면, 시스템은 그 커밋의 검증된 내용으로 템플릿 묶음을 만들고 원본 식별자·내용 해시·계약 해시를 기록해야 한다. 서로 다른 OS에서도 같은 정규화 입력은 같은 해시를 만들어야 한다.

### REQ-TPL-002: 검증 실패와 부분 저장의 격리

IF 파일·단계 그래프·필수 문서·런타임 마커·계약 검증 또는 DB 저장이 실패하면, THEN 시스템은 새 묶음의 일부를 사용 가능하게 남기거나 활성 버전과 기존 실행을 변경해서는 안 된다.

### REQ-TPL-003: 명시적이고 원자적인 활성화

WHEN 운영자가 검증된 묶음과 예상 활성 revision을 지정하여 활성화를 요청하면, 시스템은 예상 revision이 일치할 때만 활성 포인터·revision·감사 이벤트를 함께 저장해야 한다. 등록만으로 활성화해서는 안 된다.

### REQ-TPL-004: 실행 계보 전체의 버전 고정

WHEN 새 최상위 실행을 시작하면, 시스템은 활성 템플릿 묶음과 유효 언어를 그 실행에 고정해야 한다. 배정으로 생성하는 작업 실행과 그 자식 에이전트 실행은 상위 실행의 선택을 상속해야 한다.

이 규칙은 `slots-v1`과 기존 `format: null` 모두에 적용한다. 후자는 명시한 부모 실행에 결합하고, 실제 독립 실행과 구분한다. key가 없는 프로젝트 역할도 파이프라인 dispatch라면 부모를 생략할 수 없다.

### REQ-TPL-005: 재개와 기존 실행의 일관성

WHILE 실행이 고정된 템플릿으로 진행 중이면, 시스템은 활성 버전 변경·프로세스 재시작·프로젝트 언어 변경 이후에도 같은 단계 본문과 전이 규칙을 제공해야 한다. 재개 시 현재 활성 버전으로 참조를 교체해서는 안 된다.

완료 증거·열린 에이전트 조회·handoff도 같은 부모와 현재 단계의 범위를 사용해야 한다. 전환 이후 독립 실행이나 다른 부모의 결과를 기존 형식 파이프라인의 완료 근거로 사용해서는 안 된다.

### REQ-TPL-006: 설치·서버·실행 호환성 거부

IF 설치된 런북·스텁 또는 서버 프로토콜이 실행에 필요한 템플릿과 호환되지 않으면, THEN 시스템은 해당 실행의 새 dispatch와 outcome 반영 전에 업데이트 또는 재연결 사유를 반환해야 한다. 자동 실행 생성과 지연 전진도 검사 뒤에 수행하며, 이 거부로 실행 커서·승인·보고·제품 실행 사용량을 변경해서는 안 된다.

### REQ-TPL-007: 버전을 식별할 수 있는 제한된 다운로드

WHEN 인증된 클라이언트가 기본 또는 명시한 템플릿 묶음을 요청하면, 시스템은 접근 권한과 현재 플랜에 맞는 런북·문서·에이전트 스텁 및 해당 묶음의 설치 메타데이터만 제공해야 한다. 다운로드는 활성화나 프로젝트 실행 상태를 변경해서는 안 된다.

버전 모드의 다운로드는 실행 시작과 같은 묶음 내 언어 선택 규칙을 사용하고 유효 언어를 반환한다. 요청 언어가 없다는 이유만으로 같은 묶음의 완전한 영어를 거부하거나 다른 묶음의 해당 언어를 가져와서는 안 된다. legacy REST의 fallback 없는 계약은 전환 전 보존한다.

### REQ-TPL-008: 중복 요청과 결과 유실 복구

WHEN 같은 등록·활성화 요청을 재시도하거나 응답 유실 후 결과를 조회하면, 시스템은 기존 요청의 결과를 식별하고 중복 묶음·활성화 이벤트를 생성하지 않아야 한다. 같은 요청 ID에 다른 입력이 오면 거부해야 한다.

서로 다른 요청 ID가 같은 원본·내용·해석 계약의 묶음을 동시에 등록해도 성공 결과는 같은 묶음 ID를 가리켜야 한다. 요청별 기록과 묶음 자체의 유일성은 별도로 보장한다.

### REQ-TPL-009: 실행을 보존하는 배포 복구

WHEN 운영자가 호환되는 이전 묶음을 다시 활성화하면, 시스템은 이후 최상위 실행의 기본 선택만 전환하고 기존 실행의 고정 참조와 원장을 보존해야 한다. 문제 버전에서 시작한 실행의 변경·재시작을 자동으로 수행해서는 안 된다.

### REQ-TPL-010: 사실을 보존하는 최초 이관

WHEN 기존 `Template` 데이터를 버전 저장 방식으로 이관하면, 시스템은 실제 DB 내용의 기준 묶음을 보존하고 신규 선택과 기존 실행의 이관 경계를 기록해야 한다. 확인하지 못한 과거 실행 버전이나 원본 커밋을 추정해서 채워서는 안 된다.

전환 전 기존 형식의 미결합 완료 기록은 당시 조회 범위의 증거로만 보존한다. 과거 부모나 템플릿을 추정하지 않으며, 전환 이후 새 미결합 결과가 그 증거 집합에 추가되어서는 안 된다.

### REQ-TPL-011: 매 요청의 현재 권한 적용

WHEN 묶음을 다운로드하거나 실행을 조회·진행하면, 시스템은 현재 인증·소유권·프로젝트 가용성·플랜·요청 제한을 검사해야 한다. 템플릿에 고정된 버전은 예전 권한을 복원하거나 선택되지 않은 프로젝트의 실행을 허용해서는 안 된다.

### REQ-TPL-012: 비공개 배포와 추적 가능한 결과

WHEN 배포 workflow가 실행되면, 시스템은 검증한 서버·플러그인·템플릿 식별자와 성공·실패·현재 활성 상태를 기록해야 한다. 공개 로그·아티팩트에는 private 본문·복구 스냅샷·자격 증명을 출력해서는 안 된다.

### REQ-TPL-013: 부분 init과 사용자 수정의 보존

IF init이 중단되거나 필요한 관리 파일에 충돌·`skip(modified)`가 있으면, THEN 플러그인은 사용자 파일을 보존하고 새 묶음의 설치가 완료됐다고 보고해서는 안 된다. 파일을 바꾸기 전에 영향을 받는 설치의 기존 ready 상태를 무효화하고, 재시도는 실제 파일과 잠금 상태를 다시 검사해야 한다.

### INV-TPL-001: 묶음 내용의 불변성

등록 완료된 묶음의 원본·계약 manifest·언어별 본문은 불변이다. 수정은 새 묶음으로 등록한다. 실행에서 참조하는 묶음은 삭제하지 않는다.

### INV-TPL-002: 실행 계보의 단일 선택

한 `PipelineWorkRun`과 그것이 배정한 `PipelineRun`, 각 자식 `AgentRun`은 같은 `templateReleaseId`와 유효 언어를 가진다. `PipelineVersion`과 템플릿 묶음은 서로 다른 버전 축이다. 활성 포인터와 설치 메타데이터는 실행의 고정 참조를 덮어쓸 수 없다.

기존 형식의 자식도 부모 FK를 가진다. 같은 프로젝트·역할·key 또는 같은 템플릿이라는 이유만으로 다른 실행의 완료·재개 증거를 공유하지 않는다. 전환 전 증거는 아래에 정의한 불변 cutover 집합만 예외로 읽는다.

### INV-TPL-003: 현재 정책과 과거 지침의 분리

고정하는 대상은 템플릿 원문과 해석 계약이다. REQ-TPL-005의 동일 본문도 원문을 뜻하며, 프로젝트의 현재 값과 상태를 반영하는 렌더 변수까지 과거 시점으로 복원한다는 뜻은 아니다. 인증·플랜·사용량·사용 목록·사용자 게이트·소유권은 요청 시점의 정책을 적용한다. client는 현재 계약처럼 실행 원장의 소유자나 token identity가 되지 않는다.

### INV-TPL-004: 복구의 경계

활성 포인터 복구, 서버 배포 복구, 설치 파일 갱신, 이미 수행한 코드 변경·보고의 처리는 서로 다른 작업이다. 포인터 전환만으로 나머지가 되돌아갔다고 기록하지 않는다.

### CON-TPL-001: 기존 소유권과 공개 API 경계

순수 manifest·해시·호환성은 `packages/core/templates`, 묶음 등록·조회·활성화 서비스는 `src/server/templates`, 원격 취득·운영 실행은 `scripts/templates`가 소유한다. 허용된 템플릿 서버 모듈 소비자는 `templates/api.ts`·`contracts.ts`를 사용한다.

`pipeline`은 허용된 서버 의존을 유지한다. root 생성 transaction의 채널 잠금·선택은 `pipeline/run-service.ts`에서 DB를 직접 조회하고 순수 core 판정을 사용한다. 독립 실행 선택이 필요한 `agents`는 `pipeline/api.ts`의 제안 symbol `selectTemplateReleaseForRunIn`을 사용한다. `pipeline`이 `templates/api.ts`·`templates/contracts.ts`를 import하는 우회는 금지한다. server/FSD 방향과 core 복사 계약도 유지한다.

### CON-TPL-002: 검증 환경과 실행 승인

저장·잠금·migration·rollback은 격리 PostgreSQL에서 검증한다. 운영 migration·seed·활성화·서버 승격·private 저장소 변경·패키지 공개는 문서 작성 권한에 포함하지 않는다. 실제 실행 범위는 이 제안서의 승인 기록과 기존 배포 규칙을 따른다.

### CON-TPL-003: 비공개 원본과 실행 채널

원본 저장소와 대상 환경을 임의 URL로 받지 않는다. 승인된 저장소·환경의 목록을 사용하고 원격 취득은 배포 시에만 수행한다. 배포 도구·템플릿 변경 권한을 agent MCP 도구 집합에 추가하지 않는다.

### CON-TPL-004: 점진적 적용과 reader/writer 장벽

초기 schema 변경은 additive다. 버전 방식을 활성화하기 전에 모든 운영 reader가 새 선택을 이해하고 이전 writer가 기준 데이터를 변경하지 못해야 한다. 활성화 후 구형 앱·seed로 돌아가는 경로는 별도 호환성 검증 없이 허용하지 않는다.

## Proposal

### 1. 선택한 구조와 대안

| 대안 | 판단 | 이유 |
| --- | --- | --- |
| 수동 clone 후 현재 seed 유지 | 개발·비상 점검용 기존 경로로 한정 | 가장 단순하지만 운영자 PC 상태·미커밋 파일·수작업에 의존한다. |
| 커밋 고정 CI에서 현재 테이블 덮어쓰기 | 단독 최종안으로 채택하지 않음 | 배포 재현성은 개선되지만 진행 중인 실행과 로컬 런북의 버전 혼용을 해결하지 못한다. |
| 커밋 고정 CI, 불변 묶음 저장, 실행 단위 고정 | 채택 제안 | 현재 private Git·PostgreSQL과 `PipelineVersion` 패턴을 활용해 두 문제를 함께 해결한다. |
| 요청마다 private Git 조회 | 채택하지 않음 | GitHub 인증·가용성이 사용자 실행 경로에 들어가며 실행 선택과 권한 분리가 복잡해진다. |

채택 기준은 진행 중인 실행을 보존하면서 지침을 업데이트할 수 있어야 한다는 것이다. 서로 다른 런북·프로토콜이 자동으로 호환된다고 가정하지 않는다. 호환되지 않는 설치는 해당 실행을 안전하게 기다리게 하고 명시적으로 갱신한다.

### 2. 용어와 데이터 소유권

아래 모델과 신규 symbol은 제안이다. 기존 모델은 `prisma/schema.prisma`, 현재 공개 API는 `src/server/templates/api.ts`와 `src/server/pipeline/api.ts`를 기준으로 한다.

| 제안 모델·필드 | 책임과 제약 |
| --- | --- |
| `TemplateRelease` | opaque ID, 원본 종류, 저장소/커밋 또는 legacy snapshot 근거, `contentHash`, `contractHash`, manifest 형식, non-null `releaseIdentity`, `sealedAt`, 등록 시각. `releaseIdentity`는 DB 유일 키이며 seal된 내용은 불변이다. |
| `TemplateReleaseEntry` | `(releaseId, lang, path)` 유일 키와 정규화 본문. 부모 seal 뒤 entry 추가·변경·개별 삭제를 거부한다. |
| `TemplateChannel` | 환경 DB의 기본 채널에 nullable `activeReleaseId`, 단조 증가 `revision`, `mode`(`legacy`/`versioned`), `legacyWritesBlocked`. 초기 상태는 legacy·활성 묶음 없음이다. 버전 모드에 활성 묶음이 없으면 새 실행을 거부한다. |
| `TemplateDeployment` | `(operation, requestId)` 유일 키, 정규화 입력 해시, 수행자·환경, `targetProfileId`·비밀 없는 `targetIdentityHash`, 실행 코드 SHA·검증 workflow/run 식별자, 이전/이후 묶음과 revision·결과. 운영 요청의 출처 필드는 필수이고 개발/격리 fixture의 미적용 값은 명시한다. import 결과 또는 활성화와 같은 transaction으로 저장한다. |
| 실행의 선택 | `templateReleaseId`, `templateLanguage`, `templatePinnedAt`, 선택 근거(`run-start`/`cutover`). 신규 버전 모드 실행은 null을 허용하지 않는다. |
| 계보의 출처 | 배정의 `PipelineRun.sourceWorkRunId`, 계속 실행의 `continuedFromRunId`. 현재 `assignedBoardItemId` 문자열이나 `PipelineVersion`만으로 출처를 추정하지 않는다. |
| 기존 형식의 결합·전환 증거 | `AgentRun.pipelineNode`는 버전 모드에서 `format: null` 부모에 결합할 때 원래 dispatch 노드를 기록한다. `pipelineRunId`와 함께 저장하고 `pipelineEntryId`는 null을 유지한다. nullable `PipelineRun.legacyEvidence`는 bootstrap에서만 만드는 불변 증거 집합이며 새 실행에는 없다. |
| 과거 미상 | 전환 전 닫힌 실행의 nullable 참조와 과거 원장은 보존한다. cutover 이후 보장을 과거 전체 실행의 증거로 소급하지 않는다. |

등록은 unsealed 부모 → 모든 entry → count/hash 재검증 → seal → 요청 결과 저장의 단일 transaction이다. 읽기·활성화는 sealed 묶음만 허용한다. DB guard로 seal 뒤 본문·manifest 변경과 entry 추가를 막고 FK로 채널·실행이 참조한 묶음 삭제를 막는다. 자동 삭제 서비스는 만들지 않는다. 테스트 teardown은 자신의 참조와 fixture 또는 격리 schema만 정리하며 guard를 비활성화하지 않는다. SQL guard는 해당 schema를 사용하며 `public`을 하드코딩하지 않는다.

`releaseIdentity`는 원본 종류·원본 식별자·manifest 형식·내용 해시·계약 해시의 canonical tuple에서 계산한다. Git 원본 식별자는 저장소/커밋, legacy 식별자는 snapshot 해시이며 null에 의존한 복합 유일성은 사용하지 않는다. 기존 묶음을 재사용할 때 해시뿐 아니라 저장된 tuple도 대조한다. 요청 ID가 달라도 DB unique 제약으로 한 묶음만 남긴다.

등록은 현행 seed의 Serializable·maxWait 15초·timeout 30초 계약을 유지하고, 같은 원본/manifest 형식의 기존 내용 해시 대조와 묶음·요청 결과 저장을 그 경계 안에서 수행한다. 직렬화/unique 충돌 시 실패 transaction을 폐기하고 확정된 승자와 요청 결과를 재조회한다. 재시도가 필요하면 같은 입력·요청 ID를 사용하며, 재조회를 성공한 저장으로 가장하거나 다른 입력으로 자동 변경하지 않는다.

`contentHash`는 LF로 정규화한 `{ lang, path, body }`를 `(lang, path)`의 명시적 문자열 순서로 정렬한 canonical JSON에서 계산한다. UTF-8, 필드 순서와 형식 버전을 고정한다. locale·파일 탐색 순서에 의존하거나 의미 있는 공백·마지막 개행을 제거하지 않는다.

`contractHash`는 해석 형식·native runtime 프로토콜·역할 alias 어댑터·지원 client 선언을 해시한다. 검증 시각·요청 ID·시험 결과는 해시 밖의 배포 증거에 연결한다. 같은 Git 저장소/커밋의 정규화 내용이 다르면 거부하며, 같은 내용에 다른 해석 계약을 적용하면 별도 묶음이다. Git SHA, 내용 해시, 런북의 12자리 버전, 설치 표면 해시는 대체해서 사용하지 않는다.

### 3. 원본 취득·등록·활성화

1. 요청은 정확한 원본 커밋, 검증할 서버 커밋·플러그인 식별자, 대상 환경, 요청 ID를 지정한다. branch/tag는 커밋으로 해석·고정한다. 임의 저장소 URL·환경을 허용하지 않는다.
2. CI의 새 작업 디렉터리에서 저장소 식별·실제 HEAD·Git blob과 입력 inventory의 일치를 확인한다. 운영 등록에 dirty/untracked 원본을 섞지 않는다. 배포 검증은 신뢰한 공개 코드의 `tests/templates/private-template-release.test.ts`가 지정 checkout을 데이터로 읽는다. private 저장소의 실행 코드를 운영 자격과 함께 실행하지 않는다. 기존 private suite의 경로·lock 1 계약은 별도 유지보수 대상으로 보존하며 이 검증을 그 suite의 실행으로 보고하지 않는다.
3. 기존 경로·중복·빈 본문·symlink·단계 그래프·Codex bundle 검증을 재사용하고 canonical hash·언어 inventory·각 지원 client의 필수 문서·렌더 변수를 검증한다. 단계 본문을 공개 생성물로 전달하지 않는다.
4. 지정한 서버·플러그인·원본 조합으로 계약·격리 DB·실제 init 시험을 수행한다. private 입력 부재·skip은 배포 증거가 아니다.
5. 완성된 묶음과 import 요청 결과를 같은 DB transaction에 저장한다. 동일 입력의 재요청은 같은 ID를 반환하고 같은 요청 ID의 다른 입력은 거부한다. 외부 Git 취득·백업 업로드는 transaction 밖에서 완료한다.
6. 활성화는 등록과 별도 요청이다. 대상 묶음·예상 채널 revision·요청 ID를 검증하고 호환 증거와 실제 서버 식별을 대조한 뒤 포인터·revision·감사 이벤트·요청 결과를 원자적으로 저장한다.
7. 응답 유실·취소 뒤에는 요청 ID로 결과부터 조회한다. 이미 성공한 요청의 결과를 반환하며, 더 최신 활성 상태를 되돌리려고 새 활성화를 자동 실행하지 않는다. stale 요청은 운영자의 재검토 없이 최신 revision으로 재시도하지 않는다.

제안 CLI는 `scripts/templates/publish-templates.ts`(등록/결과 조회), `activate-templates.ts`(CAS 전환/결과 조회), `bootstrap-template-releases.ts`(최초 이관)다. 상태 조회는 읽기 전용이며 같은 DB 주입형 서비스를 사용한다. 기존 seed/restore는 legacy 도구로 남기고 DB 쓰기 장벽 이후 거부한다.

새 CLI의 연결 경계는 신규 제안 `scripts/templates/template-target.ts:withTemplateTarget`가 소유한다. 선택한 승인 프로필이 환경 ID·명시적 connectionString·기대 endpoint/database/schema 및 필요한 provider routing 식별자를 제공해야 한다. 기대 연결 식별자와 제공 URL을 대조하고, 연결 후 DB 이름·유효 schema를 읽기 전용으로 확인한 뒤에만 작업 callback을 호출한다. 현재 앱의 public schema와 다른 대상을 자동 승인하지 않는다. URL·비밀·원시 오류 객체는 로그에 쓰지 않는다.

현행 `scripts/lib/prisma.ts:withPrisma`는 dotenv와 `DATABASE_URL`을 사용하므로 이 자체를 새 CLI의 환경 검증으로 간주하지 않는다. 새 helper는 검증한 명시적 연결로 client를 구성하고 callback의 완료를 await한 뒤 finally에서 해제한다. 연결 후 대상 불일치·callback 실패에서도 소유한 연결을 해제하며 선택 누락/불일치 시 `.env`로 대체하지 않는다. 기존 grant-plan·legacy seed/restore의 helper 호출 계약은 유지한다. 프로필과 운영 자격의 공급·대상 확인은 BLK-TPL-03의 환경 준비에 포함한다.

등록·활성화 서비스와 CLI의 격리 검증은 TPL1에서 완성한다. TPL3의 workflow는 이를 조합한다. 앞 단계의 검증이 뒤 단계의 workflow나 클라이언트 구현에 의존하지 않는다.

일반 활성화는 버전 모드에서만 허용한다. 최초 R0/mode 전환은 유지보수 bootstrap이 소유한다. TPL1의 격리 fixture는 그 테스트 schema에서 버전 모드를 구성하며 운영의 전환 장벽을 우회하지 않는다.

CI 검증 job에는 운영 DB 자격을 제공하지 않는다. 운영 등록 job은 검증한 원본을 같은 커밋으로 다시 취득해 해시를 대조하며 private 저장소의 시험 코드를 운영 자격과 함께 실행하지 않는다. 활성화 job은 환경별 직렬 실행과 DB CAS를 함께 사용한다. 새 요청으로 진행 중인 운영 job을 자동 취소하지 않고, 입력을 shell 본문에 직접 삽입하지 않는다.

운영 자격을 받는 workflow 정의와 실행 코드는 기존 main/dev의 검토·green commit 규칙으로 신뢰한 SHA에 고정한다. 검증 증거에는 그 코드 SHA, 원본 SHA, 서버/플러그인 식별자, 내용/계약 해시와 workflow/run 식별자를 연결한다. 같은 신뢰 경계의 검증 job 결과를 대조하며 호출자가 제출한 `passed: true` JSON이나 임의 ref를 증거로 받아 운영 job을 열지 않는다. 배포 기록은 환경 프로필 ID와 검증한 대상 식별자를 비밀 없이 추적한다.

기존 smoke에는 선택적인 `template-revision` 입력과 실제 원본 커밋 요약을 추가한다. 입력 없는 기존 호출은 유지하되 배포 증거는 명시한 SHA와 결과가 일치해야 한다. 현재 smoke는 Claude 전용이므로 아래 신규 Codex 리허설의 실제 검증 전에는 양쪽 인수로 처리하지 않는다. 기존 승격 명령에 필수 입력을 추가해 깨뜨리지 않는다.

### 4. 실행 선택과 transaction 경계

| 경로 | 선택 규칙과 변경 지점 |
| --- | --- |
| 자동 `PipelineWorkRun` | `work-run.ts:projectWorkNext`의 create에서 활성 묶음·유효 언어를 선택한다. |
| 사용자 프로젝트 실행 | `work-run.ts:startProjectWork`의 create에서 선택한다. |
| 배정 후 작업 실행 | `board-service.ts:proposeIn`의 create에서 부모 work run의 선택과 출처를 상속한다. 다른 Run rule의 graph로 전달돼도 같다. |
| 직접 작업 실행 | `board-service.ts:startPipeline`, `run-service.ts:ensureRunIn`의 create에서 선택한다. 기존 행을 조회한 경우 다시 선택하지 않는다. |
| 자식·독립 `AgentRun` | `agents/run-service.ts:cursorTransaction`의 create에서 entry 또는 기존 형식의 execution 문맥으로 검증한 부모 선택을 상속한다. 현재 허용된 실제 독립 실행만 명시적인 standalone 문맥으로 생성 시 root 선택을 한다. |
| 같은 실행의 보류·bounce·resume | `board-service.ts:resetRun`의 기존 행 update는 선택을 유지한다. |
| `resetRun`이 이전 graph를 찾아 새 행 생성 | 현재 run을 `continuedFromRunId`로 기록하고 그 템플릿을 상속한다. `previous.version`은 graph 선택이며 템플릿 출처가 아니다. |
| 실행 전 `changePipeline` | 템플릿은 유지한다. 고정 묶음이 변경 graph의 역할을 제공하는지 쓰기 전에 검사한다. |
| 명시적 새 검증·새 실행 | 새 root로 선택하고 이전 보고의 참조는 변경하지 않는다. |
| 과거 미상인 닫힌 실행의 소유자 reopen | 허용된 reopen 경로에서 새 root와 현재 선택을 만든다. `continuedFromRunId`는 null로 두고 같은 transaction의 감사 note `template-restart:<이전 run ID>:<새 run ID>`로 출처를 연결한다. 이 기록은 pin 상속 관계가 아니다. 과거 행을 새 버전으로 소급하거나 기존 정책상 불가능한 reopen을 허용하지 않는다. |

총 7곳의 create(파이프라인 6곳, 에이전트 1곳)와 `changePipeline`·`resetRun`의 기존 행 갱신을 모두 점검한다. 호출자인 `advanceRun`, `advancePipeline`, `nextFor`, `headFor`도 검사 대상이다. 정의 변경·Stop new work·승인·재조회가 고정 참조를 바꾸지 않아야 한다.

버전 모드의 유효 언어는 선택 묶음이 선언한 완전한 실행 언어 중 요청 언어, 없으면 같은 묶음의 영어를 사용한다. 둘 다 없으면 시작을 거부하고 다운로드는 404를 반환한다. 먼저 명시/활성 묶음을 선택한 뒤 그 안에서 언어를 정하며, 파일별 fallback이나 다른 묶음의 언어로 섞지 않는다. 버전 모드의 REST 생성과 root 선택은 같은 core 규칙을 사용하고 실제 언어를 응답한다. legacy REST는 기존의 요청 언어 조회·fallback 없는 404를 유지한다. 기존 실행은 프로젝트 언어가 바뀌어도 고정 언어를 유지하고 현재 plan·설치 호환성을 다시 검사한다.

기존 User → Project(해당 경로가 사용하는 경우) → 실행 잠금의 상대 순서를 유지한다. 새 root 선택은 그 transaction에서 채널 행을 `FOR SHARE`로 읽고 활성화는 같은 행을 `FOR UPDATE`로 잠근 뒤 CAS한다. 활성화는 업무 User·Project·실행 잠금을 획득하지 않는다. 자식/재개는 부모 선택을 사용해 채널을 다시 잠그지 않는다.

행 잠금의 충돌과 transaction 종료 시 해제는 [PostgreSQL 18 문서](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS)에서 대조했다. 이는 잠금 방식의 근거이며 실제 서비스의 교착·rollback 통과 증거는 VFY-TPL-03/04에서 별도로 확보한다.

자동 생성·전진의 호환성 검사는 `headFor`·`nextFor`·`advancePipeline` 호출 후가 아니라 해당 선택과 쓰기의 transaction 안에서 수행한다. 사전 읽기와 실제 생성 사이 활성화도 재검사한다. 웹에서 소유자가 명시적으로 만든 실행은 시작 시 선택을 저장할 수 있지만, 이후 호환되지 않는 클라이언트의 진행은 대기한다.

`agent_next`는 scope·부모 run/entry·receipt를 검증하고 고정 묶음을 읽은 뒤 파싱·렌더링한다. 현재처럼 transaction 밖의 활성 본문을 먼저 파싱하는 경로를 제거한다. 불변 묶음 캐시는 첫 구현에 필수가 아니다. 추후 추가하면 `(releaseId, language, path, contractHash)`로 구분하고 현재 권한 판정은 캐시하지 않는다.

#### 기존 형식의 실행 결합과 완료 조회

`TemplateChannel.mode`와 `PipelineVersion.format`은 독립적이다. 버전 모드에서도 `format: null` graph를 유지하며 강제로 `slots-v1`으로 변환하지 않는다. `pipeline_next`가 이 형식의 작업을 dispatch/resume할 때 `execution: { kind: "legacy", runId, node }`를 반환한다. 여기의 runId는 `PipelineRun` ID이며 receipt의 `AgentRun` ID와 다르다. 현재 허용된 독립 PM·scout 등은 `execution: { kind: "standalone" }`으로 구분한다. 이 문맥은 기존 역할·key·자동 scout 조건을 완화하거나 work-assigner의 독립 실행을 허용하지 않는다.

버전 모드의 `agent_next`는 기존 `entry` 또는 `execution` 중 정확히 하나를 받는다. 기존 형식의 문맥은 같은 cursor transaction에서 부모 잠금·프로젝트·최신 보드/현재 실행·열림·노드·dispatcher·예상 key를 검사하고, `AgentRun.pipelineRunId`·`pipelineNode`와 부모 pin을 함께 저장한다. key가 있는 파이프라인 작업을 문맥 없이 별도 root로 만들거나, key 없는 파이프라인 역할을 standalone으로 재해석하지 않는다. standalone은 기존에 허용된 독립 경로에만 사용하며 이미 부모에 결합된 AgentRun의 재개/receipt를 받을 수 없다. 결과에도 실제 문맥과 agentRunId를 돌려준다.

기존 형식의 `readFacts`·`nextFor`·`codexHandoffView`, agents의 open/receipt/verify 조회와 `board-service.ts:recordValidation,submitReport,closeRuns,resetRun`의 실행 조회는 같은 부모를 사용한다. 전환 이후 결과는 부모 ID·기록된 노드·역할/key와 각 조회의 기존 시간 조건을 적용한다. readFacts의 enteredAt 경계와 recordValidation의 lastPlan 이후 verify/ok 조건을 혼동하지 않는다. 기존 상태·승인·accepted/legacy 원장·verify/ok·정상 report 종료 조건은 보존한다. 새 파이프라인 성공 증거는 같은 AgentRun의 연결된 Report를 사용하고, 새 미결합 보고는 감사 기록으로 남아도 성공 증거가 되지 않는다. 기존 미결합 Report의 one-candidate fallback은 cutover 증거에 한정한다. `recordValidation`의 verifierBinding과 `submitReport`의 hasVerifyStep도 같은 부모의 증거만 읽게 한다. 보드 전이의 closeRuns는 그 부모의 열린 자식을 닫아 정상 terminal outcome 경로를 보존한다. legacy 모드의 기존 조회와 slots-v1의 entry 제약, legacy에서 지원하지 않는 QA/impl-verify의 거부는 유지한다.

plan/hold 제출이 이미 부모 상태를 전진시킨 뒤의 마지막 outcome은 기존 terminal step·receipt·동일 transaction의 전이 이벤트 증거 규칙으로만 받는다. 저장한 원래 pipelineNode와 부모를 대조하고, 이미 전진한 부모의 현재 node 일치만 요구해 이 정상 종료 경로를 막지 않는다. 그 외 닫힘·교체·다른 단계의 요청은 기존 stale 처리와 원장 규칙을 따른다. 이 변경은 단계 엔진이나 새로운 gate를 도입하지 않는다.

`legacyEvidence`는 `{ version: 1, capturedAt, node, enteredAt, completedRunIds, projectClosedRunIds, unlinkedReportIds, validationStepIds, reportVerifyStepIds }`다. 기존 열린 `format: null` 실행의 원래 enteredAt을 보존한 채, 현행 readFacts의 닫힌 후보·프로젝트 역할·미결합 보고 ID와 recordValidation의 verifierPassedAfterPlan·submitReport의 hasVerifyStep가 읽는 AgentRunStep ID를 각각 정렬·중복 제거해 bootstrap transaction에 저장한다. 검증은 run ID만 저장하지 않아 같은 열린 독립 run에 나중에 추가한 step이 과거 증거에 섞이지 않게 한다. 당시의 후보 범위이지 역사적 부모 관계나 R0 실행의 증거가 아니다. 열린 후보는 이관 전 부모/pin 추정의 근거로 삼지 않고 별도의 유일 귀속 검사를 통과해야 한다. 이후 각 조회는 같은 부모의 새 결합 증거에 해당 selector의 고정 ID 집합만 더하고 기존 시간·역할/key·outcome·보고 조건을 다시 적용한다. 집합은 해당 node/enteredAt에서만 유효하며 새 단계·reset·새 행으로 복사하거나 다시 수집하지 않는다. 과거 닫힌 AgentRun·Report에 부모/pin을 소급하지 않는다.

실행 pin은 서비스 코드의 관례뿐 아니라 DB에서도 보호한다. 알려진 선택 tuple의 변경·null 복귀는 null-safe 비교로 거부한다. versioned 모드의 신규 실행은 묶음/언어/pinnedAt이 모두 있어야 하고, 자식 및 `sourceWorkRunId`/`continuedFromRunId`로 상속하는 실행의 tuple·프로젝트가 부모와 일치해야 한다. 과거 미상 reopen의 독립 새 root는 상속 FK를 설정하지 않고 별도 감사 note로 연결한다. 과거 미상 행의 null은 보존하되 null→R0의 일회 전환은 legacy 모드·writer 장벽이 설정된 bootstrap transaction에서만 허용한다. cutover가 끝난 뒤 일반 UPDATE로 pin을 수선하는 우회는 두지 않는다. 정상 재개는 pin을 유지하고 명시적인 새 실행은 새 행을 만든다.

버전 모드의 기존 형식 자식은 pipelineNode가 필수이며 생성 시 부모 노드와 일치해야 한다. 결합한 부모·노드는 이후 변경하지 않는다. 이관 시 열린 미결합 역할은 현재 부모/노드를 유일하게 입증할 때만 연결하고, 후보가 여러 개인 프로젝트 역할은 자동 추정하지 않는다. 실제 독립 실행 여부도 확인할 수 없으면 bootstrap을 중단한다. 과거 증거 집합의 변경도 DB guard로 거부한다.

### 5. REST/MCP와 설치 협상

native runtime의 `harness-runtime-v1`, 전달 프로토콜 `template-release-v1`, 설치 lock의 형식 번호는 별개다. 아래는 제안하는 확정 기본 계약이며 TPL0은 private briefing·출시 reader에 이를 대조한다. 전달 불가능한 역할이나 지원하지 않는 출시 조합이 발견되면 필드를 생략하지 않고 진입 조건을 미충족으로 남긴다.

| 표면 | 새 계약과 권위 |
| --- | --- |
| `GET /api/templates` | 새 플러그인은 `templateProtocol=template-release-v1`, 선택적인 `release=<opaque ID>`를 보낸다. 생략한 release는 활성 묶음이고 lang query 생략의 기본값은 현행 en이다. 버전 모드의 구형 요청과 legacy 모드의 버전 설치 요청은 HTTP 400과 `{ error }`로 파일 쓰기 전에 거부한다. 버전 모드는 선택 묶음의 요청 언어, 없으면 같은 묶음의 영어를 사용한다. 알 수 없는 묶음 또는 두 완전한 언어가 모두 없을 때 404다. legacy 요청의 fallback 없는 기존 계약과 scope·가용성·요청 제한은 전환 전 보존한다. |
| GET 성공 body | 기존 필드, 공개 해석 계약 `templateContract`와 `templateRelease: { id, schemaVersion: 1, protocol: "template-release-v1", language, clientSurfaceHash }`. route가 JSON body에 실제로 포함한다. `language`는 유효 언어다. |
| MCP 설치 입력 | `installation: { releaseId, language, clientSurfaceHash, protocol: "template-release-v1" }`. client는 기존 별도 입력이다. legacy 모드의 기존 요청을 보존하고 버전 모드의 `pipeline_next`·`agent_next`에는 설치 정보를 요구한다. |
| MCP 실행 문맥 | slots-v1은 기존 entry, 기존 형식은 `execution: { kind: "legacy", runId, node }`, 실제 독립 호출은 `execution: { kind: "standalone" }`이다. 버전 모드의 agent_next에는 정확히 하나를 요구하고 initial/resume/outcome에 그대로 왕복한다. legacy 모드에는 기존 생략 계약을 보존하며 새 실행 문맥으로 버전 결합을 가장하지 않는다. |
| MCP 성공 body | 전달 프로토콜과 해당 실행의 templateRelease·실행 문맥을 반환한다. 실행 선택은 검증한 DB 부모/독립 run이 결정하며 설치 ID로 참조를 변경하지 않는다. |
| 호환되지 않는 항목 | key/node/version과 `action: "wait", on: "template", reason, templateRelease`. head는 기존 `action: "none"`에 reason과 필요한 묶음 정보를 싣는다. 호환되는 다른 항목은 계속 제공한다. |
| `POST /api/runbook` | 새 모드는 양쪽 client의 `{ project?, client, version, installation }`을 검증하고 `{ ok: true }`를 반환한다. 보고한 묶음·유효 언어·현재 plan의 표면과 런북 버전을 대조하고 활성 묶음으로 치환하지 않는다. |
| 오류와 캐시 | template 오류는 현행 `reason` → `{ error }`를 사용하고 새 전역 error code를 암묵적으로 추가하지 않는다. 기존 두 제한 code·Retry-After를 보존한다. 인증된 다운로드의 `private, no-store`와 사용자/plan 간 body 비혼용을 검사한다. |

공개 역할·런북에는 manifest의 versioned 설치 지침을 붙인다. 원문을 보존한 R0에도 같은 전달 계약을 적용하며 guide는 해석 계약 hash에 들어간다. Claude의 native PreToolUse hook이 로컬 설치를 검증해 installation을 주입하고 원래 entry/execution/receipt는 보존한다. 이 차단 계약은 Claude Code 2.1.295 이상과 재시작을 요구한다. Codex bridge는 같은 정보를 직접 보존·주입한다.

`clientSurfaceHash`는 현재 plan에 대한 `deliverable`의 client·유효 언어·정렬된 path/body와 해석 계약을 canonical 형식으로 해시한다. 묶음 ID·단계 전체 본문·시험 시각은 넣지 않는다. 따라서 ID가 달라도 같은 공개 표면·계약이면 같은 설치가 사용 가능하다. 런북 선택·alias 변환·plan 필터를 별도로 재구현하지 않는다.

init은 응답의 유효 언어로 원본 참조·lock의 template 경로·Codex package의 language를 기록한다. 요청한 언어와 fallback 언어가 달라도 `harness.json`의 사용자 선호를 임의 변경하지 않는다. 요청 언어를 그대로 package에 기록해 실행의 고정 언어와 어긋나는 경로를 검사한다.

설치 정보는 권한이나 실제 로컬 파일의 원격 증명이 아니다. 플러그인이 ready·파일 hash를 검사하고 서버는 현재 권한과 실행의 고정 묶음을 대조한다. `Project.runbookVersion`은 legacy 보조 정보이며 여러 checkout의 설치 권위가 아니다. 새 클라이언트는 읽기 전용 GET에서 지원을 확인하고, 지원 여부를 확인하려고 상태 변경 가능 MCP 도구를 먼저 호출하지 않는다.

전역 Codex 번들·런북 검사를 실행별 검사로 바꾼다. 기존 실행의 런북 검사는 고정 묶음 기준이다. `packages/core/execution/watch.mjs:validateItem,actionableWork`가 새 template 대기를 허용하고 runnable 목록에서 제외하도록 수정한다. 이는 응답 파싱이며 execution에서 templates로 의존을 만들지 않는다. 알 수 없는 다른 대기는 계속 거부한다.

같은 watch의 `actionableWork,workSignature`는 실행 문맥을 보존하고 부모가 바뀌면 다른 작업으로 식별한다. `harness-codex.mjs:dispatchBinding`, `codex-thread.mjs`의 요청 주입·응답 검증·역할 briefing, `codex-main-loop-tools.mjs`와 `commit-handoff.mjs`도 이 문맥을 보존·대조한다. handoff의 resume/commitHandoff가 entry 없는 기존 형식의 부모를 버려서는 안 된다. Claude runbook·stub/watch 호출도 같은 문맥을 전달하며 installation tuple만으로 부모를 대신하지 않는다.

공통 `runtime/mcp-client.mjs` 외에 Claude 전용 `bin/harness-watch.mjs:localInput,callTool`도 설치 정보를 보내야 한다. background·foreground·resident의 시작·재진입과 각 dispatch/outcome 전에 같은 로컬 설치 검사를 수행한다. 오래 살아 있는 프로세스의 최초 input/ready 캐시만 신뢰하지 않는다. template 대기는 기존 업무 대기로 취급하고 Runner의 `waitReason` enum(`dirty`/`branch`)이나 사용자 게이트를 확장하지 않는다. 현재 Codex의 impl-verifier/선택 verifier 지원 제한도 그대로 유지한다.

### 6. 부분 init을 견디는 설치 commit

제안 `harness.lock.json` 형식은 `version: 2`, 기존 파일별 소유권·hash, client별 `state: pending|ready`·설치 tuple·렌더 시 `configHash`를 가진다. configHash는 현행 session binding과 같은 `harness.json` 내용의 SHA-256이며 원격 권한 정보가 아니다. Codex package에도 같은 설치 tuple을 기록한다. 새 runtime은 ready·현재 configHash·실제 파일 hash·런북 블록·공유 문서의 일치를 확인한 뒤 전달한다. source fingerprint가 같아도 설정 변경 후의 오래된 렌더를 승인하지 않는다. 구형 reader가 형식 2를 거부하고 파일을 보존하는지 실제 출시판으로 검사한다.

1. 쓰기 없는 GET 지원 검사와 dry-run을 먼저 수행한다. 거부된 서버·plan·입력에는 관리 파일을 쓰지 않는다. 기존의 명시적 adopt 승인 없이 사용자 파일을 인수하지 않는다.
2. init guard를 얻고 기존 session guard 안에서 세션 소유권을 다시 읽는다. 활성/정리 미완료 세션이 있으면 관리 파일을 바꾸지 않는다. 세션 시작도 같은 session guard 안에서 init guard 부재를 검사한다. init은 그 뒤 파일/보고/ready까지 init guard를 유지하되 session guard를 네트워크 대기 동안 잡지 않는다. 두 경로의 검사와 시작 사이 경합을 barrier로 검증한다.
3. 최초 관리 파일 쓰기 전에 대상 client와 설정·공유 문서 변경에 영향을 받는 다른 client의 ready를 pending으로 원자적으로 바꾼다. 이후 crash가 나도 이전 ready가 부분 갱신 파일을 승인하지 못하게 한다.
4. 파일별 기존 값 비교와 safeTarget을 유지한다. `CLAUDE.md`는 전체 파일 대신 관리 블록의 hash를 추적해 바깥 사용자 내용을 보존한다. legacy lock에 블록 hash가 없으면 승인된 기준 렌더와 대조하며 marker가 있다는 이유만으로 수정 블록을 덮어쓰지 않는다.
5. 필요한 파일·공유 문서·package·관리 블록을 다시 hash 검사한다. 충돌·skip·쓰기 실패는 pending과 실제 생성물을 보존한 채 종료한다. 여러 파일 쓰기를 filesystem transaction이라고 주장하지 않는다.
6. 선택한 client의 설치/런북 보고가 성공한 뒤 실제 파일을 재대조하고 그 client의 lock을 ready로 원자적으로 commit한다. 다른 client의 설치나 로그인을 완료 조건으로 요구하지 않는다. GET과 보고 사이 활성화돼도 원래 묶음을 보고한다. 보고 실패·응답 유실은 pending으로 남겨 재검사·재보고하며 자동 adopt하지 않는다.
7. guard는 ready commit/실패 정리까지 유지한다. ready 전에는 최종 성공을 출력하거나 Codex complete-init의 MCP 등록·project_sync를 진행하지 않는다. ready는 템플릿 파일 설치 완료이며, 기존의 연결·실제 runtime 인수 완료와는 구분한다.

제안 공통 로컬 검사 모듈은 `plugin/runtime/template-installation.mjs`다. `connectionInput`, 독립 Claude watch, 세션 시작이 이를 사용한다. 파일 도구가 없는 역할은 검증한 tuple을 상위 briefing에서 받는다. dry-run은 pending/ready·파일·서버 설치 보고를 변경하지 않는다. `HARNESS_TEMPLATES_DIR`의 offline 개발 경로는 미배포 원본을 서버의 버전 설치로 승인하지 않으며, 버전 인수는 실제 HTTP 경로로 수행한다.

### 7. 최초 이관과 writer 장벽

최초 이관은 업무 writer·역할·진행 중 RPC가 정리된 유지보수 경계다. 일반 실행 시작과 bootstrap을 동시에 실행하지 않는다. 정리 여부나 reader 집합을 확인할 수 없으면 중단한다.

1. additive schema·불변 저장·legacy reader를 배포하되 mode는 legacy로 유지한다. 새 묶음 등록만으로 선택을 바꾸지 않는다.
2. 실제 `Template` 전체와 실행 계보의 일관된 snapshot을 private 위치에 보관하고 hash·복원 근거를 확인한다. 현재 `snapshotTemplates`는 입력 대상의 이전 본문만 보존하므로 전체 DB 이관 백업으로 사용하지 않는다.
3. 외부 백업 I/O를 끝낸 뒤 bootstrap transaction에서 legacy 표의 쓰기를 잠그고 현재 hash를 snapshot과 재대조한다. drift가 있으면 이관을 중단하고 다시 snapshot을 만든다. 같은 transaction에서 legacy DB 쓰기 장벽을 세우고 승인된 runtime inventory로 `R0`를 seal한다. 사용하지 않는 잔존 행은 근거와 함께 보존한다.
4. Git 일치를 입증한 경우에만 원본 커밋을 연결한다. 아니면 `legacy-snapshot`이다. 기존 selector로 legacyEvidence를 먼저 확보하고 열린 계보·명확히 귀속된 열린 AgentRun에 cutover 이후 부모/노드·참조·출처를 연결한다. enteredAt·과거 닫힌 기록·미상 버전은 보존하며 모호한 열린 역할은 중단 조건이다.
5. cutover 이전 receipt를 새 선택의 결과로 잘못 수락하지 않도록 열린 `AgentRun.revision`을 한 번 증가시키고 변경 근거를 기록한다. 단계·사용량·원장은 보존한다. 현재 `REVISION_MAX`에 도달한 행이나 귀속이 모호한 계보가 있으면 중단한다. 이전 receipt는 stale이며 fresh read로 재개한다.
6. transaction 전 확인한 reader 지원·writer 정리 증거를 대조하고, 같은 transaction에서 active R0·채널 revision·versioned mode·bootstrap 요청 결과를 확정한다. 유지보수 장벽은 commit까지 유지해 새 결합 행이 legacy 조회에 노출되는 중간 상태를 만들지 않는다. 새 client 설치와 기존 실행 재개 뒤에만 `R1` 활성화·이전 포인터 복구를 인수한다.
7. legacy 표·명령은 즉시 삭제하지 않는다. 버전 참조 없는 실행을 활성 묶음으로 몰래 보완하지 않는다. 과거 미상 닫힌 실행의 명시적 reopen은 앞의 새 root 규칙을 따른다.

bootstrap은 반복 시 이미 기록한 요청 결과를 반환하고 revision을 다시 증가시키지 않는다. 실패 시 R0·legacyEvidence·부모/선택 backfill·receipt revision·writer 장벽·active/mode/revision·요청 결과를 모두 rollback하며, 이미 저장한 private snapshot의 존재만으로 DB 이관 성공을 판단하지 않는다.

## Affected Files

현재 구현은 이 proposal의 승인 범위와 아래 inventory를 따른다. 각 행의 목록은 예시가 아니라 대조 범위이며, 추가 소비자가 발견되면 같은 Phase 계획에 반영한다. `신규 제안`은 아직 없는 경로다.

| ID | 정확한 경로·symbol | 변경 또는 보존과 검증 |
| --- | --- | --- |
| I01 | `prisma/schema.prisma`, 신규 제안 `prisma/migrations/20261103120000_template_release_versioning/migration.sql` | additive 모델·묶음 identity unique·nullable 과거 참조·pipelineNode/legacyEvidence·seal/legacy writer/pin/증거 guard·부모 일치/FK. VFY-02/03/04/08. 부모 디렉터리를 먼저 만들고 미래 착수 시 timestamp 충돌을 재검사한다. |
| I02 | `packages/core/templates/{deliver,manifest,runbook,codex-bundle,template-boundary,render,vars}.mjs` | 배포/설치 hash와 기존 필터·alias·변수·본문 경계 보존. 신규 제안 `release-manifest.mjs`, `release-manifest.d.mts`, `release-manifest.test.mjs`에 canonical manifest·언어·표면·호환성 판정. VFY-01/05/07. |
| I03 | `src/server/templates/{api,contracts,bundle-query,client-bundle-query,runbook-query,steps}.ts`; 신규 제안 `release-service.ts`, `release-query.ts`, `release-service.test.ts` | sealed 등록/조회·활성화·상태와 기존 parser. VFY-01/02/03/06. |
| I04 | `scripts/templates/{seed-templates,restore-dual-client-templates,template-seed-query}.ts`, 보존 대상 `scripts/lib/prisma.ts`; 신규 제안 `publish-templates.ts`, `activate-templates.ts`, `bootstrap-template-releases.ts`, `template-target.ts`, `template-release-cli.test.ts` | 명시적 프로필/실제 대상·argv·요청 ID와 bootstrap. 새 연결은 template-target가 소유하고 legacy helper 호출 계약은 유지한다. VFY-01/03/08/09. |
| I05 | `src/server/pipeline/{api,contracts,run-service,work-run,board-service,run-rules}.ts` | 6곳 create·상속·재개·graph 변경·자동 생성/전진·template 대기. `selectTemplateReleaseForRunIn`의 DB 선택, 기존 형식 문맥 타입, readFacts/nextFor/recordValidation/submitReport/closeRuns/reset 조회와 cutover 증거를 소유한다. VFY-04/06/08. |
| I06 | `src/server/agents/{api,contracts,runs,next,run-service}.ts` | 부모/receipt 검사 후 본문 선택·동일 transaction의 사용량/커서. VFY-04/06/07. |
| I07 | `src/server/rest/{templates,templates-handler,runbook,runbook-handler}.ts`, `src/app/api/{templates,runbook}/route.ts` | query·GET metadata·버전 모드의 동일 묶음 언어 fallback/legacy 404·양쪽 client 보고·실제 Response JSON. `rest/{api,api.server,response}.ts`는 기존 명시 export/제한 오류 구조 보존. VFY-05/07. |
| I08 | `src/server/mcp/{tools,deps}.ts`, `src/server/pipeline/codex-handoff-query.ts` | Zod 입력·실행별 호환/대기와 handoff. `src/server/result.ts`의 기존 오류 구조 보존. VFY-06/07. |
| I09 | `packages/core/execution/{watch.mjs,watch.test.mjs}` | `wait.on=template`의 parser·runnable 제외, 기존 형식 문맥 보존·workSignature와 다른 미지원 대기 거부. templates 역방향 import 금지. VFY-06. |
| I10 | `plugin/bin/{harness-init,harness-codex,harness-session,harness-watch,harness-background}.mjs`, `plugin/runtime/{mcp-client,local-session,file-ownership,codex-thread,codex-main-loop,codex-main-loop-tools,commit-handoff}.mjs` | 양 client의 metadata·preflight·독립 watch·세션/guard·실행 문맥/briefing/handoff 전파·대조. 신규 제안 `runtime/template-installation.mjs`, `runtime/template-installation.test.mjs`. VFY-05/06/10. |
| I11 | `plugin/skills/{init,watch,background}/SKILL.md`, `plugin/codex/skills/{harness-init,harness-run,harness-resume,harness-background}/SKILL.md` | 설치 완료·pending 복구·tuple/실행 문맥 briefing·기존 native 설치/중지 계약. VFY-05/06/10. |
| I12 | `plugin/lib/templates/{deliver,manifest,runbook,codex-bundle,template-boundary,render,vars}.mjs`, `plugin/lib/execution/watch.mjs`, 신규 복사본 `plugin/lib/templates/release-manifest.mjs` | `scripts/plugin-lib.mjs`로 원본에서 동기화한다. `.d.mts`/시험은 runtime 복사 대상이 아니다. VFY-01/06 및 sync 검사. |
| I13 | `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | 구현 후보의 두 판은 0.6.0이다. 아직 공개 배포하지 않았다. 실제 출하 시 동일한 더 높은 판을 정하고 기존 출시 gate를 따른다. VFY-10. |
| I14 | `.github/workflows/{client-init-smoke,check}.yml`, 신규 제안 `.github/workflows/template-release.yml` | 원본 SHA·증거·격리 fixture·환경별 명시 활성화. check의 기존 검색/자격 구조와 승격 명령 보존. VFY-09. |
| I15 | `scripts/rehearsals/{rehearse-client-init-smoke.ts,client-init-smoke-steps.mjs,rehearse-client-init-smoke.test.ts,client-init-smoke-steps.test.mjs}` | Claude smoke의 버전 방식·정확한 body/metadata·seed 전환과 요약을 함께 갱신한다. `tests/templates/private-template-release.test.ts`에서 Codex의 실제 HTTP init을 별도로 검증한다. 기존 smoke의 Codex native 설치 거부는 유지하며 그 플랫폼 인수를 실행한 것으로 간주하지 않는다. VFY-05/09. |
| I16 | `docs/architecture/{protocol,server,core,pipeline-execution,verification}.md`, `CONTEXT.md` | API/형식·DB 선택 소유자·source/pin 용어와 시험 경로를 구현과 함께 갱신한다. 현재는 읽기 전용이다. |
| I17 | private 저장소의 `en/{CLAUDE,CODEX}.runbook.md`, `en/agents/{dev,pm,feature-scout,doc-auditor,plan-verifier,qa-verifier,impl-verifier}.md`, `en/docs/plans/{README,template,verification-paths}.md`, `en/docs/agents/README.md`, `templates.test.mjs`, `README.md`, `QA-VERIFIER-ROLLOUT.md` | 고정 커밋에서 확인한 정확한 inventory다. 원문 13행을 immutable 입력으로 유지하고 공개 manifest guide·native hook·Codex bridge에 installation·실행 문맥 전달/대기를 적용한다. file tool 없는 PM도 이 경로를 사용한다. private 원본이나 그 legacy suite를 수정·게시하지 않는다. VFY-01/05/06/10. |
| I18 | 신규 `tests/templates/private-template-release.test.ts`, 기존 `tests/server/integration/support.ts`의 격리 방식과 신규 release fixture helper | private 본문을 복사하지 않고 승인된 checkout에서 읽는 서버 교차 시험이다. 필요한 agents/pipeline 내부 참조를 `server.md`에 정확히 등록한다. 공통 DB singleton은 바꾸지 않는다. VFY-01/04/06. |

보존 대조 범위는 `src/server/pipeline/{run-request,save-definition,automatic-scout,lock-pipeline}.ts`, `src/fsd/features/edit-pipeline/{api/run-pipeline.server.ts,model/run-pipeline-input.ts}`, `plugin/runtime/{background,runner-client,resident-commit}.mjs`, `packages/core/execution/runner.mjs`다. graph 준비·사용자 시작·정의 편집/중지·Runner enum·보호 파일/commit 정책을 바꾸지 않는다. 기존 `harness.json`, owner MCP, 토큰 저장 위치·OS 권한 backend도 변경하지 않는다.

시험 inventory는 아래 VFY의 정확한 파일 목록이 소유한다. 신규 파일의 부모 존재·이름 충돌을 착수 때 재검사하고 같은 모듈은 상대 경로, 모듈 밖은 public API로 import한다. 허용 경계를 바꾸거나 새 test-only export로 검사를 통과시키지 않는다.

새 private 입력 검증은 test-owned config와 기존 public `validateTemplateRelease`·`splitTemplate`·`agentNext`를 사용한다. 양 client·세 plan의 실제 HTTP 설치, ready hash, 전체 graph 순환 여부, 실제 원문의 dev interruption/handoff와 QA/impl verdict 분기를 검사한다. 운영 import는 검증한 source/code SHA와 release identity를 다시 대조한다.

입력은 `HARNESS_RELEASE_SOURCE`의 절대 checkout과 `HARNESS_RELEASE_COMMIT`이다. 새 배포 workflow는 둘을 반드시 제공한다. 일반 공개 실행에서 입력이 없으면 명시적인 skip이며 배포 증거로 사용하지 않는다. 기존 private `templates.test.mjs`의 문구 검사는 수정·삭제하지 않고 미실행으로 남긴다. 새 두 계약 검사의 통과가 그 legacy suite 전체의 통과를 뜻하지 않는다.

### 공개 symbol의 변경 후 경로

| 필요한 역할 | 현재 소유자·공개 경로 | 제안 소유자·소비자 | 검증 |
| --- | --- | --- | --- |
| `splitTemplate`, `TemplateFormatError`, `readCodexBundle`, `checkCodexRunbook` | `templates/{steps,client-bundle-query}.ts` → `templates/api.ts` | 현 소유 유지, release 선택 인자를 결합한 agents/REST/MCP 소비. agents에 parser를 복사하지 않는다. | VFY-01/05/06, verify:server |
| `publishTemplateRelease`, `activateTemplateRelease`, `readTemplateDeployment` | 현재 없음 | 신규 `templates/release-service.ts` → `templates/api.ts` → 운영 CLI. test 전용 export가 아니다. | VFY-02/03/08 |
| `readTemplateRelease` | 현재는 legacy DB query | 신규 `templates/release-query.ts` → `templates/api.ts` → REST·허용된 agents/MCP 조립부 | VFY-05/07 |
| `selectTemplateReleaseForRunIn` | 현재 없음 | `pipeline/run-service.ts` → `pipeline/api.ts` → 독립 실행을 생성하는 agents. pipeline 내부 소비는 상대 경로다. | VFY-04, verify:server |
| `AgentExecutionContext`(제안 타입) | 현재 entry만 `pipeline/contracts.ts`가 소유 | 같은 contracts에서 명시 export → agents의 NextInput/NextOutput·MCP 타입 소비. wire schema는 mcp/tools.ts가 소유한다. plugin/core watch는 wire 구조를 검사하며 server 모듈을 import하지 않는다. | VFY-04/06, verify:server |
| canonical manifest·표면·언어/설치 판정과 타입 | 현재 코드에 각각의 기초 규칙이 있음 | 신규 core `release-manifest.mjs`/`.d.mts` → server 및 plugin 복사본. pipeline이 templates 서버 모듈 타입을 import하지 않는다. | VFY-01/06, check·sync |
| `planWrites`, `mergeClientLock`와 로컬 파일 검사 | `templates/manifest.mjs`와 init 내부 | 기존 core 확장 + `runtime/template-installation.mjs` → init·공통/독립 watch·세션 시작 | VFY-05/10 |
| `withTemplateTarget` | 현재 없음; legacy `withPrisma`는 env 기반 | 신규 `scripts/templates/template-target.ts` → 새 publish/activate/bootstrap CLI. 서버 제품 API로 export하지 않는다. | VFY-01/09 |

### 최종 산출물과 winning source

| 최종 산출물 | 본문/구조의 최종 권위와 의존성 | 변경 후 검증 목적지 |
| --- | --- | --- |
| DB 묶음·entry·채널·실행 참조 | migration + identity unique/seal + root 생성·pin/부모/노드 guard와 불변 legacyEvidence. active는 기존 pin을 덮어쓰지 않는다. | VFY-02/03/04/08의 실제 DB 값·제약·동시 연결 |
| GET templates의 JSON body | route → REST handler → 명시/활성 sealed release → 같은 묶음의 유효 언어 → 현재 plan의 deliverable. 버전 모드의 fallback과 legacy 404를 구분하며 metadata를 route에서 버리지 않는다. | VFY-05/07의 실제 GET JSON과 새 production build의 HTTP |
| MCP JSON/SSE의 지침·대기·실행 문맥 | tools schema → deps → 검증한 부모/독립 run → 고정 release·언어·해석 계약 → serverVars. watch/dispatch/handoff/briefing도 문맥을 보존한다. 현재 정책은 별도 검사한다. | VFY-04/06의 실제 직렬화 body·parser·최종 agent 요청과 handoff 재개 |
| `.claude/agents/*.md`, `.codex/agents/*.toml` | filtered stub → vars/workspace vars → `claude-agent.mjs`/`codex-agent.mjs`. 단계 본문은 생성하지 않는다. | VFY-05의 실제 파일 본문·필요 설정·역할 목록 |
| `CLAUDE.md` 관리 블록 | 해당 release의 Claude 런북·변수·markers. 블록 밖 사용자 내용은 보존한다. | VFY-05의 블록 hash·외부 내용·충돌/부분 쓰기 |
| `docs/harness/codex-runbook.md`, `codex-package.json` | 고정 Codex 런북 + 같은 설치 tuple + 기존 verifier package path/checksum. 단순 파일 존재는 충분하지 않다. | VFY-05/10의 JSON 구조·checksum·실제 helper 소비 |
| 공유 문서 4개 | `docs/plans/{README,template,verification-paths}.md`, `docs/agents/README.md`의 고정 원본 → vars. 다른 client의 의존도 함께 검사한다. | VFY-05의 실제 내용·양 client ready 무효화 |
| `harness.lock.json`, `harness.init.guard` | 형식 2 pending → 파일/보고 대조 → ready의 commit과 기존 guard 소유권. | VFY-05/10의 crash·동시 init/세션·구형 writer |
| 배포 복사본과 안내 | core 원본 → sync → 설치 package의 실제 lib/skill/manifest | VFY-01/06/10과 plugin-lib --check |
| workflow 요약·복구 자료 | 신뢰한 실행 코드/검증 run·확인한 target profile/identity와 DB 요청 결과가 요약의 권위. private snapshot은 별도 비공개 보관이 권위. | VFY-09의 allowlist JSON·비노출·배포 행의 출처/대상 일치·실제 복원 |

native MCP 등록과 `project_sync`는 설치 ready 뒤의 기존 연결 단계다. `.mcp.json`의 unrelated/owner 항목과 token env 참조를 보존하고 생성물에 인증 값을 쓰지 않는다. Node runtime·verifier 패키지·QA/impl-verifier 지원 정책은 현재 출하 계약을 따른다.

## Safety Analysis

### 계약 조정과 출시 조합

새 묶음 ID는 기존 12자리 런북 버전이나 `harness-runtime-v1` 마커를 대체하지 않는다. 서로 독립적인 값으로 검사한다. 설치 계약의 additive 입력·lock 형식 변경은 Phase TPL0에서 현재 계약과 대조하고 관련 아키텍처 문서에 반영한다. 최소 설치·client 비저장 원칙은 유지한다.

| 서버·설치 조합 | 허용 동작과 전환 조건 |
| --- | --- |
| 구형 서버 + 구형 플러그인 | 전환 전 기존 계약만 사용한다. 새로운 버전 활성화를 허용하지 않는다. |
| 새 서버의 legacy 전환 모드 + 구형 플러그인 | 고정된 기준 데이터에 대한 기존 계약만 유지한다. 새 묶음을 자동 배정하지 않는다. |
| 새 서버의 legacy 전환 모드 + 새 버전 설치 요청 | GET 협상에서 중단하고 관리 파일을 쓰지 않는다. R0/업무 pin/mode 전환이 끝나기 전에 versioned ready를 발급하지 않는다. |
| 새 서버의 버전 모드 + 구형·설치 정보 누락 플러그인 | 읽기·토큰 관리 등 기존 권한 경로는 유지하되 버전 정보가 필요한 진행은 업데이트 안내로 거부한다. |
| 새 서버 + 새 플러그인 + 같은 설치 표면 | 실행이 고정한 묶음을 사용한다. 활성 포인터가 달라도 호환된 기존 실행은 계속된다. |
| 새 서버 + 다른 설치 표면 또는 미지원 해석 계약 | 해당 실행을 기다리게 한다. 실행 버전을 바꾸거나 다른 실행까지 전역 stale로 차단하지 않는다. |
| 구형 서버 + 새 플러그인 | 읽기 전용 지원 검사에서 중단한다. 설치 성공·실행 호환성을 추정하지 않는다. |
| 활성화 후 구·신 서버 공존 | 허용하지 않는다. 모든 reader의 지원 확인이 활성화 선행 조건이다. |

정확한 출시 플러그인 버전 집합과 잠금 reader의 동작은 아직 미검증이다. 현재 소스가 거부한다는 사실을 모든 출시판의 증거로 확대하지 않는다. 사용자에게 새 로그인·검증 스킬·별도 런타임 설치를 요구하는 경로를 이 변경의 해결책으로 추가하지 않는다.

### 실패·동시성·수명주기

| 사건 | 처리와 관찰할 결과 |
| --- | --- |
| 원본 취득·자격 만료·검증 실패 | 새 등록/활성화 없음. 단계와 오류 분류만 기록하고 private 본문·token은 출력하지 않는다. |
| import 중 오류·transaction timeout | 새 묶음 전체 rollback. 기존 활성 묶음과 실행 불변. |
| 다른 요청 ID의 같은 묶음 등록 경합 | identity unique와 Serializable 대조로 성공 결과가 한 묶음을 가리킨다. 요청별 결과는 보존하고 충돌 transaction의 부분 행은 남기지 않는다. |
| 환경 프로필/실제 연결/검증 출처 불일치 | 작업 callback과 운영 쓰기 전에 거부한다. dotenv fallback이나 호출자 제출 성공 플래그로 진행하지 않는다. |
| 두 활성화 요청의 경합 | 같은 예상 revision에서는 하나만 성공한다. 다른 요청은 stale로 끝나고 재검토 없이 최신 상태로 재시도하지 않는다. |
| 활성화와 최상위 실행 시작의 경합 | 채널 잠금으로 이전/이후 묶음 하나를 선택하고 호환성을 같은 transaction에서 확인한다. 실패한 head/next 호출이 root·cursor를 먼저 쓰지 않는다. |
| 배정 도중 활성화 | 작업 실행은 배정 부모의 묶음을 상속한다. 유형별 파이프라인 변경도 이를 바꾸지 않는다. |
| 서버·CLI 재시작 | DB의 실행 참조로 재개한다. 메모리 캐시나 로컬 clone의 존속에 의존하지 않는다. |
| 기존 형식의 dispatch·완료·handoff | 명시한 부모/노드와 pin을 왕복한다. 다른 부모·standalone 결과는 완료에서 제외하고, cutover 증거는 원래 node/enteredAt에서만 읽는다. terminal outcome은 기존 전이 증거를 보존하며 현재 노드 검사만으로 정상 종료를 막지 않는다. |
| init 중단·수정 파일 충돌 | 첫 쓰기 전 pending, crash/보고 유실 후에도 pending. 실제 파일·관리 블록 재검사 없이 ready로 되돌리지 않는다. 다른 client의 공유 문서 의존도 무효화한다. |
| 여러 checkout·두 클라이언트 | 요청의 설치 정보와 실행을 대조한다. 한 checkout의 최신 init 보고가 다른 설치의 권위가 되지 않는다. |
| 묶음에 요청 언어 없음·명시한 과거 묶음 | 버전 모드만 선택 묶음 내의 완전한 영어로 fallback한다. active나 다른 묶음으로 바꾸지 않으며 유효 언어를 응답한다. 두 언어 모두 없으면 파일 쓰기 전 404, legacy REST는 요청한 언어의 템플릿이 없을 때 기존 404를 유지한다. |
| 플랜·선택 목록·연결 상태·token 변경 | 기존 공통 권한 판정과 요청 제한 적용. 허용되지 않는 진행·다운로드를 이전 묶음으로 우회하지 않는다. |
| 활성화 성공 직후 응답 유실·CI 취소 | 요청 ID와 DB 기록으로 결과를 확인한다. 파일 스냅샷이나 workflow 상태만 보고 성공/실패를 추정하지 않는다. |
| 이전 버전 재활성화 | 이후 root 선택만 변경한다. 이미 수행한 작업·승인·보고를 삭제하지 않는다. outcome 유실은 기존 request/receipt를 조회하고 새로운 실행으로 재제출하지 않는다. |
| 최초 이관·늦은 receipt | 전체 snapshot hash 재대조, legacyEvidence 확보·R0/계보/receipt/writer 장벽/채널/결과의 원자성, open revision의 단일 증가. 이전 receipt는 stale이며 과거 미상 행을 최신 버전으로 보완하지 않는다. |
| 실행 pin 직접 변경·부모 불일치 | DB guard가 update/insert를 거부한다. 과거 미상/승인 bootstrap 예외는 좁게 구분하며 일반 코드에 bypass flag를 제공하지 않는다. |

요청 제한 집계와 계약상 감사 기록은 거부 시에도 현행 규칙을 따른다. REQ-TPL-006의 무변경 범위는 업무 커서·승인·보고·제품 실행 사용량이며, 공통 요청 제한을 우회한다는 뜻이 아니다.

### 비공개 자료와 관측

공개 기록에는 opaque 묶음 ID, 원본 SHA와 내용 해시 등 승인된 식별자, 행 수, 검증 ID, 채널 revision, 오류 분류만 남긴다. 원본 저장소 경로나 해시를 제품 화면에 노출하는 UI는 만들지 않는다. 복구용 전체 snapshot은 공개 checkout·공개 workflow 아티팩트에 보관하지 않는다. 실제 private 보관 위치·접근자·보존·복원 가능성이 확인되지 않으면 운영 이관에 진입하지 않는다.

배포 상태 조회는 활성 묶음/revision·요청 결과·묶음별 열린 실행 수·고정 누락을 구분하고, 호환성 거부는 본문 없는 진단으로 기록한다. 이 관측은 VFY-TPL-09에서 DB와 대조한다. 관측은 기존 서버 로그·운영 CLI·배포 요약을 활용하며, 별도 대시보드는 이 범위에 포함하지 않는다.

## Blockers

전체 설계의 선택과 현재 문서 작성은 가능하다. 아래는 구현·운영의 해당 경계에서 해소할 조건이며, 이를 모두 이미 충족했다고 선언하지 않는다.

### BLK-TPL-01: private 원본과 출시 설치 계약의 대조

- classification: downstream. 계약 부분은 TPL0 종료, 구현 인수 부분은 TPL3 종료까지 각각 해소한다. TPL0이 아직 없는 TPL3 코드를 실행해야 끝나는 조건으로 사용하지 않는다.
- evidence: 로컬 `plugin/templates/`는 없지만 앱으로 고정 private 커밋과 13행을 확인했다. 현재 본문에는 새 installation 입력이 없고 시험 fixture/형식도 갱신이 필요하다. 새 계약의 실제 역할 전달과 전체 출시 lock reader 조합은 미검증이다.
- affects: REQ-TPL-006, REQ-TPL-007, REQ-TPL-013.
- unblock requirement: TPL0에서는 승인된 private 기준·출시판 inventory로 필드/briefing 전달 가능성, 지원·거부 정책, 기존 reader/writer의 형식 처리와 필요한 시험을 확정한다. TPL3 종료에서는 구현된 새 client의 preflight·pending/ready·실제 역할 전달 및 출시판 조합을 VFY-TPL-05/06/10으로 검증한다. 후자를 TPL0 또는 TPL3 진입의 선행 조건으로 요구하지 않는다.
- owner: 구현 담당자와 private 원본 관리자.
- stop condition: 데이터 전달이 불가능한 역할, 새 상태를 삭제하는 출시 writer, 지원 여부를 확인할 수 없는 조합을 발견하면 계약 확정과 새 묶음 활성화를 중단한다.

### BLK-TPL-02: 실제 DB 이관·동시성 증거

- classification: downstream, Phase TPL1·TPL2의 DB 검증 종료 전.
- evidence: schema·코드만 조사했으며 격리 DB migration과 역할·커서 경합은 실행하지 않았다.
- affects: REQ-TPL-002, REQ-TPL-003, REQ-TPL-004, REQ-TPL-008, REQ-TPL-010.
- unblock requirement: 안전 검사를 통과한 `stagekeeper_test_*` DB에서 baseline, 빈 DB, transaction fault, 독립 연결 경합, stale·응답 유실을 재현한다.
- owner: 구현 담당자.
- stop condition: 선택 누락·혼용·부분 저장·중복 활성화가 남으면 다음 전환 단계를 진행하지 않는다.

### BLK-TPL-03: 배포 환경·증거·private 복구 보관

- classification: downstream, Phase TPL3 실제 workflow 실행 및 TPL4 진입 전.
- evidence: 기존 workflow의 private token 참조는 있으나 실제 권한·production 연결·대상 서버 build 식별·복구 자료 보관은 확인하지 않았다.
- affects: REQ-TPL-001, REQ-TPL-009, REQ-TPL-012.
- unblock requirement: 환경별 자격과 네트워크 경로, 실제 배포 서버 식별 방법, private 보관·복원 절차, workflow 실행 권한을 확인한다. 임의 환경변수 값만으로 실제 배포 버전이 검증됐다고 기록하지 않는다.
- owner: 운영자.
- stop condition: 검증한 조합과 실제 대상이 다르거나 private 백업을 안전하게 보존·복원할 수 없으면 운영 쓰기 전에 중단한다.

### BLK-TPL-04: 운영 전환 승인과 실제 실행 목록

- classification: downstream, Phase TPL4 진입 전.
- evidence: 현재 요청은 Core 코드 수정이며 운영 쓰기와 승격은 요청하지 않았다. 관련 dual-client 운영 인수도 별도 active 문서에서 관리한다.
- affects: REQ-TPL-009, REQ-TPL-010, REQ-TPL-012.
- unblock requirement: 운영 실행 범위 승인, 대상 커밋의 필수 workflow 결과, 열린 실행 계보·미제출 outcome·호환 서버 목록과 복구 책임자를 기록한다.
- owner: 요청자와 운영자.
- stop condition: 미정리 역할·구형 reader/writer·귀속을 판단할 수 없는 실행이 있으면 활성화 장벽을 넘지 않는다.

## Approval

승인 기록의 단일 기준은 front matter다. 대화에서 방향에 동의하고 문서 작성을 요청한 것을 구현·운영 승인으로 확장하지 않는다. 2026-11-03 사용자의 실제 코드 수정 요청으로 Core 구현이 승인됐다. 현재 실행 범위와 미완료 작업은 아래 구현 진행 기록을 따른다. 본문에 정한 경계와 별도로 각 Phase의 상세 계획·변경 범위를 확인한 뒤 실행한다.

## Execution Plan

전체 SDD의 Phase 경계다. 상세 Task는 착수 시 실제 코드·DDL·승인 범위로 구체화하며 이 문서의 미래 개요를 모든 Phase의 READY 판정으로 사용하지 않는다. 각 Phase의 구현 증거와 운영 인수는 구분한다.

### Phase TPL0: 계약과 전환 기준 대조

- outcome: 위 wire/lock/hash·선택 소유권·상속·기존 형식의 부모 문맥/완료 증거·cutover 계약을 private briefing과 지원할 출시 패키지에 대조한다.
- predecessor: 이 문서, 현행 architecture, BLK-TPL-01의 입력.
- completion ownership: 후속 REQ의 계약 근거. 제품 동작 완료를 주장하지 않는다.
- preserves: INV-TPL-002, INV-TPL-003.
- governed-by: CON-TPL-001, CON-TPL-002, CON-TPL-003, CON-TPL-004.
- destinations: I01–I18의 계약·inventory와 현재 아키텍처 문서. source/client 지원 집합과 누락된 전달 경로를 기록한다.
- intermediate validity: 제품·DB 선택은 legacy이며 새 묶음을 활성화하지 않는다.
- exit/gate: BLK-TPL-01의 계약 부분과 신규 파일/SQL 설계를 검토하고 승인 후 TPL1에 진입한다. private 기준 입력 없이 계약 대조를 통과했다고 표시하지 않으며, 새 client 코드 실행 증거는 TPL3 종료에서 확보한다.

### Phase TPL1: 불변 저장·등록·활성화 서비스

- outcome: additive schema, import/seal, 요청 결과 조회, CAS 활성화와 운영 CLI를 격리 환경에서 완성한다. 운영 활성화는 하지 않는다.
- predecessor: TPL0의 manifest·wire·SQL 경계.
- satisfies: REQ-TPL-001, REQ-TPL-002, REQ-TPL-003, REQ-TPL-008.
- preserves: INV-TPL-001, INV-TPL-004.
- governed-by: CON-TPL-001, CON-TPL-002, CON-TPL-003, CON-TPL-004.
- verified-by: VFY-TPL-01, VFY-TPL-02, VFY-TPL-03.
- destinations: I01–I04. bootstrap 도구의 원자성·기준 묶음 기능도 구현하되 업무 계보 연결은 TPL2에서 완성한다.
- intermediate validity: legacy reader는 계속 작동하고 import가 active를 바꾸지 않는다. 격리 시험의 활성화 서비스는 TPL3 workflow 없이 실행 가능하다.
- exit: 빈/legacy DB, seal 뒤 추가/변경 거부, 전체 rollback, 서로 다른 요청 ID의 동일 identity 경합·다른 입력 거부, CAS·응답 유실 조회, 명시적 연결 프로필의 쓰기 전 거부를 증명한다. BLK-TPL-02의 저장 부분을 해소한다.
- approval gate: 결과와 실행 결합 상세 계획을 확인한 뒤 TPL2를 시작한다.

### Phase TPL2: 실행 계보와 커서 결합

- outcome: 7곳 생성·재개·graph 변경과 모든 단계 조회를 고정 선택에 결합한다. 기존 형식의 부모·노드/완료/재개 조회와 cutover 증거도 완성하며 설치 판정의 transaction 내 admission을 core 입력으로 시험한다.
- predecessor: TPL1의 조회·활성화 API, TPL0의 계보 계약.
- satisfies: REQ-TPL-004, REQ-TPL-005, REQ-TPL-011.
- preserves: INV-TPL-001, INV-TPL-002, INV-TPL-003.
- governed-by: CON-TPL-001, CON-TPL-002, CON-TPL-004.
- verified-by: VFY-TPL-04, VFY-TPL-07, VFY-TPL-08.
- destinations: I01/I04의 계보 schema·bootstrap과 I05–I08의 실행 서비스·공개 API, VFY-04/07/08의 DB 주입형 서비스·이관 시험. 설치 transport 전체는 TPL3에서 검증한다.
- intermediate validity: 운영 선택 장벽은 닫힌 상태다. 현재 plan·권한/사용량을 유지하고 fixture의 설치 입력으로 admission/상속을 검증한다.
- exit: 배정/Run rule, 직접 시작, reset의 두 경로, changePipeline, 독립 AgentRun, 언어 변경·재시작, 늦은 receipt·root 활성화 경합과 DB의 pin 변경/부모 불일치 거부를 증명한다. format:null의 같은 부모 완료·standalone/다른 부모 증거 배제·terminal 종료와 불변 cutover 집합/원자적 전환도 VFY-04/08로 검증한다. BLK-TPL-02의 실행 부분을 해소한다.
- approval gate: 실행 결합과 metadata/설치 상세 변경을 확인한 뒤 TPL3를 시작한다.

### Phase TPL3: 클라이언트 설치 commit과 배포 조합

- outcome: 두 client의 GET/POST/MCP·형식 2·pending/ready·strict watch parser와 workflow를 연결한다.
- predecessor: TPL1의 활성화 서비스, TPL2의 admission/선택, TPL0의 실제 출시 reader 대조.
- satisfies: REQ-TPL-006, REQ-TPL-007, REQ-TPL-012, REQ-TPL-013.
- preserves: INV-TPL-001, INV-TPL-002, INV-TPL-003, INV-TPL-004.
- governed-by: CON-TPL-001, CON-TPL-002, CON-TPL-003, CON-TPL-004.
- verified-by: VFY-TPL-05, VFY-TPL-06, VFY-TPL-07, VFY-TPL-09, VFY-TPL-10.
- destinations: I07–I18와 공개 계약 문서. 양쪽 client tuple과 skill 안내, 독립 Claude watch, 기존 helper caller와 private 검증 기반을 함께 반영한다.
- intermediate validity: staging/test에서 조합을 검증하고 production 선택은 전환하지 않는다.
- exit: 실제 GET/MCP body·동일 묶음 언어 fallback/legacy 404·생성 파일·pending crash·old init reader·multi-release dispatch·기존 형식 문맥의 watch/briefing/handoff 왕복·구형 서버 무쓰기·비공개 증거 보관을 검증한다. Claude-only smoke를 Codex 증거로 사용하지 않는다.
- blockers/gate: BLK-TPL-01의 구현 인수 부분과 BLK-TPL-03을 해소하고 운영 범위 승인을 확인한 뒤 TPL4에 진입한다.

### Phase TPL4: 운영 기준 묶음 이관과 인수

- outcome: 실제 snapshot·legacyEvidence·writer 장벽·R0 pin과 receipt 무효화/채널의 원자적 경계를 적용한 뒤 R1 활성화/복구를 인수한다.
- predecessor: TPL1–TPL3의 구현/격리 증거, 실제 서버/실행 목록·private 보관·승인 기록.
- satisfies: REQ-TPL-009, REQ-TPL-010.
- preserves: INV-TPL-001, INV-TPL-002, INV-TPL-003, INV-TPL-004.
- governed-by: CON-TPL-001, CON-TPL-002, CON-TPL-003, CON-TPL-004.
- verified-by: VFY-TPL-08, VFY-TPL-09, VFY-TPL-10.
- destinations: 승인된 운영 DB·배포 workflow·private snapshot과 인수 보고서.
- intermediate validity: R0에서 기존 실행을 fresh receipt로 재개하는 지점에 멈출 수 있다. R1 활성화는 추가 검증 후 수행한다.
- exit: R0/이후/과거 미상 구분, 새 선택·기존 pin 불변, old writer 거부, 실제 두 client 생성물·MCP와 포인터 복구를 기록한다.
- blockers/gate: BLK-TPL-03·BLK-TPL-04가 남으면 운영 쓰기를 하지 않는다. 정리·보존 기간·캐시는 후속 범위다.

## Verification Plan

모든 제품 VFY는 `Planned`다. 아래는 변경 후 목적지의 검증이며 문서 검사나 코드 읽기를 동작 통과로 바꾸지 않는다. 신규 시험 파일은 부모/충돌 preflight와 runner 검색 포함을 확인한다.

### VFY-TPL-01: 원본·canonical hash·본문 경계

- category: unit / contract.
- destination: `scripts/templates/template-seed-query.test.ts`, 신규 `scripts/templates/template-release-cli.test.ts`, `packages/core/templates/{release-manifest,deliver,manifest,runbook,render,vars,codex-bundle,template-boundary}.test.mjs`, I17의 private suite와 I18의 서버 교차 시험.
- verifies: REQ-TPL-001, REQ-TPL-002, REQ-TPL-008.
- expected: 순서/CRLF의 같은 해시, 공백/본문 변경의 다른 해시, dirty/untracked/blob 불일치·중복·누락·graph/marker 거부와 무쓰기. identity tuple의 결정성과 원본/계약 차이를 구분한다. 프로필 누락·URL/기대 대상 불일치에서 DB 작업 callback이 호출되지 않고 `.env`로 대체하지 않는다. 지연 callback이 끝나기 전에 연결을 해제하지 않으며 대상 거부·callback 실패에서도 해제한다. 변하지 않은 런북·스텁/문서·계약이면 단계 본문 변경만으로 clientSurfaceHash가 바뀌지 않고, public 표면/언어/계약/현재 제공 집합 변경은 검출한다. 단계 본문이 응답·생성 파일로 새지 않는다.
- state: Planned.

### VFY-TPL-02: 실제 seal·저장 제약·전체 import

- category: integration / migration.
- destination: 신규 `tests/server/integration/template-release.test.ts`, 신규 fixture helper `tests/server/integration/template-release-support.ts`.
- verifies: REQ-TPL-002, REQ-TPL-008.
- expected: 중간 insert/seal 실패·timeout 후 전체 rollback, 기존 active/본문 불변. 독립 연결과 서로 다른 요청 ID로 같은 identity를 등록해 최종 release 1건·같은 성공 ID와 요청별 결과를 확인한다. 같은 원본의 다른 내용은 거부한다. seal 뒤 entry 추가·본문/manifest 변경·개별 삭제와 참조 묶음 삭제를 DB가 거부한다. unsealed 묶음이 조회/활성화되지 않는다.
- isolation: 승인된 TEST_DATABASE_URL에서 fixture 전용 schema, PrismaPg의 schema 옵션, 각 연결 pool의 search_path를 함께 설정한다. 생성 query와 raw User/Project 잠금이 모두 같은 소유 schema를 사용하는지 확인해 public의 행을 잠그는 가짜 경합 시험을 막는다. 모든 연결을 닫고 소유 schema만 정리하며 guard를 끄지 않는다. 실제 HTTP 인수는 별도 disposable smoke DB에서 수행한다. `src/server/db.ts`에 test-only schema 우회를 만들지 않는다.
- semantics: 설치된 PrismaPg 타입의 schema 옵션과 [PostgreSQL의 search_path 규칙](https://www.postgresql.org/docs/18/ddl-schemas.html#DDL-SCHEMAS-PATH)을 대조했다. adapter 옵션만으로 raw SQL의 namespace가 바뀐다고 가정하지 않는다.
- state: Planned.

### VFY-TPL-03: 활성화·요청 ID·동시성·결과 유실

- category: integration / recovery.
- destination: 신규 release 통합 시험, 신규 CLI 시험. TPL1의 서비스/CLI만 필요하며 workflow·새 client를 선행 조건으로 두지 않는다.
- verifies: REQ-TPL-003, REQ-TPL-008, REQ-TPL-009.
- expected: 독립 DB 연결/barrier로 같은 expected revision의 성공 1건, 포인터·event·요청 결과의 원자성, 응답 유실 후 조회/재시도의 중복 0건, 같은 ID/다른 입력 거부. 이미 더 새 활성화가 있으면 이전 성공 재조회가 이를 되돌리지 않는다. 이전 release 재활성화는 기존 run pin을 바꾸지 않는다.
- state: Planned.

### VFY-TPL-04: 전체 생성·갱신 계보와 transaction admission

- category: integration.
- destination: `tests/server/integration/{agent-runs,pipeline-materialization,pipeline-routing,pipeline-change,pipeline-work-nodes,pipeline-direct-run,hold-propose,pipeline-rollback}.test.ts`, 신규 release 통합 시험, `src/server/agents/next.test.ts`, `src/server/pipeline/{run-service,codex-handoff-query}.test.ts`.
- verifies: REQ-TPL-004, REQ-TPL-005.
- expected: 7곳 create와 2종 기존 행 갱신을 inventory와 대조한다. R1 work → R2 활성화 → 다른 Run rule 배정 → 자식들이 R1. reset의 이전 graph 선택도 현재 pin 상속, changePipeline의 역할 부족은 zero-write. 과거 미상 reopen은 독립 새 root·상속 FK 없음·전/후 ID의 감사 note·과거 보존을 확인한다. 직접 SQL의 pin 변경/null 복귀와 다른 부모 tuple/프로젝트의 자식 생성은 거부하고 기존 원장을 보존한다. 언어/프로세스 변경에도 같은 원문/전이. head/next의 자동 생성·전진 실패는 root/cursor/AgentRun/사용량 무변경. 채널 잠금 경합은 이전/이후 선택 하나만 남긴다.
- legacy cases: format:null의 R1 부모에서 plan/verify/implement·key 없는 프로젝트 역할을 시작·재개·완료하고 R2 활성화 뒤에도 R1을 사용한다. 같은 프로젝트의 standalone/다른 부모 R2 결과가 R1의 readFacts·recordValidation의 verifierPassedAfterPlan·submitReport의 hasVerifyStep·handoff를 충족하지 않음을 확인한다. 현재 부모의 검증은 기존 lastPlan/accepted 조건대로 validation_record를 허용하며 다른 부모의 검증은 거부한다. 새 연결 보고만 성공 증거이며 기존 approval/status/accepted 조건은 그대로다. 잘못된 부모·노드·key/문맥 혼합과 다른 부모 receipt를 거부하고, 보드 전이가 해당 부모의 열린 자식만 닫는지와 plan/hold 제출 뒤 정상 마지막 outcome·현재 열린 run의 사용량 재사용을 회귀 검증한다. legacy 모드의 기존 무문맥 호출과 slots-v1 제약도 별도로 보존한다.
- state: Planned.

### VFY-TPL-05: wire body·두 client의 설치 commit

- category: contract / integration / end-to-end.
- destination: `src/server/rest/{harness-init.test.ts,templates-handler.test.ts}`, `src/server/templates/client-bundle-query.test.ts`, `tests/server/integration/templates.test.ts`, `plugin/bin/{harness-init.test.mjs,harness-init-dual.test.mjs}`, 신규 `plugin/runtime/template-installation.test.mjs`, I15의 Claude/Codex 리허설.
- verifies: REQ-TPL-006, REQ-TPL-007, REQ-TPL-013.
- expected: GET의 실제 JSON에 release/protocol/유효 언어/fingerprint와 현재 plan의 stub/doc/runbook이 존재하고 private step은 없다. fallback 언어와 요청 선호가 다를 때 lock/package/보고는 유효 언어이고 config 선호는 보존된다. 두 client 각각의 POST가 정확한 tuple/런북을 대조하며 다른 client 설치를 요구하지 않는다. 첫 파일 전 pending, 각 쓰기/보고/ready 전 crash와 401/403/429/응답 유실은 pending·사용자 파일 보존. GET/POST 사이 활성화돼도 원래 release를 보고한다. CLAUDE 블록 밖 보존·블록 수정 충돌·설정 변경 후 stale ready와 다른 client 공유 의존 무효화·dry-run 무쓰기를 검사한다. 실제 init/session guard 경합에서 둘 중 하나만 시작하고 ready 뒤 기존 complete-init 연결만 진행한다.
- language cases: 버전 모드의 R1에 요청 언어가 없고 영어가 있으면 양 client의 실제 GET은 200·R1·en을 반환한다. active R2에 요청 언어가 있어도 명시한 R1을 바꾸지 않는다. R1에 요청 언어와 영어가 모두 없거나 지정한 release ID가 DB에 없으면 404·파일 무쓰기다. release query 생략은 현재 active, lang query 생략은 en 기본값으로 검사한다. legacy REST의 요청한 언어 템플릿 없음 404와 기존 Codex의 혼합/불완전 bundle 거부 시험은 유지하고 새 버전 계약의 사례를 별도로 추가한다.
- state: Planned. 기존 Node HTTP fixture·직접 route 호출에 더해 fresh production build의 실제 HTTP body와 실제 파일/JSON/checksum을 확인한다.

### VFY-TPL-06: 실행별 호환성과 모든 전송 경로

- category: contract / integration.
- destination: `src/server/{agents/next.test.ts,templates/client-bundle-query.test.ts,mcp/tools.test.mjs}`, `tests/server/integration/client-runtime.test.ts`, `packages/core/execution/watch.test.mjs`, `plugin/runtime/{mcp-client.test.mjs,codex-main-loop.test.mjs,codex-main-loop-tools.test.mjs,codex-resident-session.test.mjs,commit-handoff.test.mjs}`, `plugin/bin/{harness-watch,harness-background,harness-session}.test.mjs`와 신규 release 시험.
- verifies: REQ-TPL-005, REQ-TPL-006.
- expected: full overview·key·head·handoff·agent initial/outcome에 tuple 전파. 고정 R1의 런북을 active R2 때문에 전역 stale로 거부하지 않는다. 다른 ID/같은 표면은 허용하고 다른 표면은 항목별 template 대기. strict parser가 template만 새로 허용하고 runnable에서 제외한다. 독립 Claude watch·Codex preflight/foreground/resident에서 시작 후 파일/lock drift도 검출하며 late callback이 금지된 dispatch/ledger/사용량 쓰기를 하지 않는다. I17의 PM 등 모든 역할과 I18의 이전 사례를 확인한다. 원격 권한을 tuple로 대체하거나 Runner wait enum·OS 정책을 변경하지 않는다.
- execution context: 기존 형식의 문맥을 실제 JSON/SSE → actionableWork/workSignature → dispatchBinding → 역할 briefing/요청 주입 → 응답/receipt 검증 → handoff resume/commitHandoff까지 대조한다. 다른 부모는 같은 key/agent여도 signature가 달라야 하고, key 없는 역할도 부모를 유지해야 한다. 문맥 삭제·변조·entry와의 동시 제출·다른 부모의 commitHandoff는 거부한다. 설치 tuple만 전파하는 시험으로 대체하지 않는다.
- state: Planned.

### VFY-TPL-07: 현재 권한·plan·보존 경계

- category: security / integration.
- destination: `tests/server/integration/{templates,project-connection,token-management,token-usage,request-rate-limit,account-usage}.test.ts`, core `deliver.test.mjs`, 신규 release 시험.
- verifies: REQ-TPL-007, REQ-TPL-011.
- expected: 다른 소유자·미선택·연결 해제·만료/잘못된 scope·plan 축소에서 새/과거 release 요청 모두 현재 권한 적용과 업무 행 불변. 기존 요청 제한 집계와 Retry-After 보존, 사용자/plan 간 다운로드 캐시 비혼용, 묶음 ID 위조로 실행/게이트 선택 불가. legacy 보호 동작도 유지한다.
- state: Planned. TPL2는 DB 주입형 서비스까지, TPL3는 실제 wire/클라이언트 연결까지 같은 계약을 검증한다.

### VFY-TPL-08: 전체 snapshot·cutover·legacy writer

- category: migration / recovery.
- destination: 신규 `tests/server/integration/template-release-migration.test.ts`, 신규 CLI 시험과 승인된 운영 리허설.
- verifies: REQ-TPL-009, REQ-TPL-010.
- expected: 빈 DB·legacy 잔존 행·열린 계보·닫힌 과거 미상 구분. 전체 snapshot과 현재 hash drift 시 전환 거부, Git 미확인 R0는 legacy-snapshot. R0/계보/쓰기 장벽 rollback, 열린 revision의 단일 증가·기존 receipt stale·fresh 재개, REVISION_MAX/미정리 역할/구형 reader/모호한 계보 거부. 재실행 시 중복 bump/원장 변경 없음. 구형 seed/restore의 실제 DB 쓰기를 guard가 거부한다.
- legacy boundary: 전환 전 readFacts/recordValidation/submitReport의 selector별 실제 후보 ID와 legacyEvidence가 일치하고 과거 닫힌 부모/pin·enteredAt·원장을 바꾸지 않는지 확인한다. 새 결합 결과는 완료/검증/보고 허용에 읽고, 전환 후 standalone 결과/새 미결합 보고 및 같은 기존 독립 run에 추가한 새 step은 과거 집합으로 읽히지 않는다. 단계 변경·reset/새 행에서 집합을 재사용하지 않고 직접 변경을 DB가 거부한다. 열린 key 없는 역할의 다중 부모/독립 여부 미상은 중단한다. 각 단계 fault에서 R0/증거/부모·pin/receipt/writer 장벽/active·mode·revision/요청 결과 전체 rollback과 재실행의 단일 commit을 검증한다.
- state: Planned.

### VFY-TPL-09: 실제 조합·workflow·활성 포인터 복구

- category: end-to-end / recovery.
- destination: 신규 `template-release.yml`, I15 리허설/시험, 승인된 `docs/test-reports` 보고서.
- verifies: REQ-TPL-001, REQ-TPL-003, REQ-TPL-009, REQ-TPL-012.
- expected: 명시한 서버/플러그인/private SHA와 실제 build/원본 hash 일치, 검증 job의 운영 자격 부재, 운영 job의 재취득 hash·승인 코드 SHA·검증 run 출처 대조와 명시적 활성화. 임의 ref/위조 성공 JSON·잘못 연결한 환경 프로필/DB namespace는 실제 쓰기 전에 거부한다. 요약은 allowlist JSON이며 원문/token 0건. 실제 DB의 상태 조회·열린 run 수·pin 누락과 요약을 대조한다. R1 기존 실행 유지, R2 새 선택, 이전 포인터 복구와 문제 run 보존, private 전체 snapshot의 실제 복원을 확인한다. CI cancel/secret 누락/skip은 성공으로 처리하지 않는다.
- state: Planned. TPL3는 staging/test의 실제 조합·파이프라인·백업/복구를, TPL4는 별도 승인한 production 대상을 확인한다. production snapshot이나 TPL4 실행을 TPL3 완료의 선행 조건으로 삼지 않는다. 기존 smoke/agent-eval의 init 성공을 파이프라인 실행 증거로 대신하지 않으며 Claude-only smoke와 신규 Codex 경로를 구분한다.

### VFY-TPL-10: 실제 출시 init reader와 복구 장벽

- category: compatibility / recovery.
- destination: 신규 `plugin/bin/harness-released-init-readers.test.mjs`, 기존 `plugin/bin/{harness-released-readers,harness-skill-references,harness-init-dual}.test.mjs`, 신규 설치 모듈 시험과 출시 패키지 리허설.
- verifies: REQ-TPL-006, REQ-TPL-009, REQ-TPL-010.
- expected: 정확한 출시 init/package를 실행해 lock 형식 2·pending을 거부하고 metadata/파일을 보존하는지 대조한다. 구형 reader 시험은 세션 잠금 보존의 별도 회귀다. 새 plugin/구형 서버는 GET 지원 협상에서 MCP 진행/파일 쓰기 전에 중단한다. 새 서버가 참조된 구형 묶음을 계속 읽고 활성화 후 구형 서버 재배포를 거부한다. 지원하지 않은 판은 미검증으로 남긴다.
- state: Planned.

### 실행 명령·정적 경계와 증거 범위

문서 대조에서는 읽기 전용 구문·링크·schema/JSON/command 검사만 수행한다. 구현 때는 기존 Node test runner와 격리 PostgreSQL을 사용한다.

```bash
npm run db:generate
npm run db:validate
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:server
npm run test:server:integration
npm run test:templates
npm run build
```

신규 core/runtime `.test.mjs`는 `npm test`, scripts `.test.ts`는 `test:scripts`/check, 서버 `.test.ts`는 `test:web` 또는 기존 server bootstrap, 위 integration `.test.ts`는 `test:server:integration`에 포함한다. registry를 필요로 하는 내부 참조는 `server.md`에 정확한 파일/모듈로 기록한다. `test:architecture`의 `.mjs` 검색이 scripts의 `.test.ts`까지 실행한다고 가정하지 않는다.

정적 gate는 공개 symbol의 정의→export→실제 소비자→시험 경로를 대조한다. 금지 대상은 pipeline→templates의 값/타입 import, execution→templates import, FSD 역방향 import, `export *`, test-only public export, plugin/lib의 수동 drift, 버전 모드의 legacy Template 읽기/쓰기 우회다. legacy 경로 자체는 전환 전 보존 대상이며 단순 문자열 검색으로 전부 삭제하지 않는다.

DB 시험은 `validateTestDatabase`를 통과한 `stagekeeper_test_*`에서 수행하고 실제 migration·잠금·rollback을 사용한다. 불변 global 채널/trigger가 다른 suite를 오염시키지 않도록 신규 fixture helper가 소유 schema·연결·정리를 책임진다. 기존 runtime DB singleton을 바꾸는 테스트 전용 우회는 금지한다. fresh HTTP/native 인수는 기존 disposable smoke DB/CI 방식으로 격리한다. private checkout이 없으면 `test:templates`를 통과로 표시하지 않는다.

원본 동기화·두 manifest의 동일한 상위 출하 판·실제 출시 reader와 대상 dev commit의 필수 check/client-init-smoke/해당 agent-eval·production migration·main fast-forward 규칙은 유지한다. 새 템플릿 workflow는 기존 승격 gate를 대체하지 않는다. docs 검사와 관련 VFY 통과를 전체 플랫폼/운영 인수로 확대하지 않는다.

## Implementation Progress

2026-11-03 최신 dev 기준의 격리 `harness/template-release-implementation-20261103` 브랜치에서 시작했고 원래 dirty 문서 작업 트리는 보존했다. 2026-11-04 Core 구현과 로컬 검증을 진행했다.

- TPL1: additive release/entry/channel/deployment, seal·legacy writer·pin DB guard, canonical identity, 등록·활성화 CAS·결과/상태 조회, 명시적 target profile과 운영 CLI.
- TPL2: 모든 root 생성과 부모 상속, cursor transaction 내 파싱·렌더·usage/receipt, 기존 형식 execution 결합, 완료/검증/보고/handoff의 동일 부모 조회, 과거 미상 reopen과 동결 legacyEvidence.
- 최초 이관: 전체 private snapshot, hash drift 확인, 승인 inventory·reader/writer evidence, R0 seal·열린 pin·귀속·receipt 1회 증가·writer 장벽·mode/결과의 단일 transaction과 replay.
- TPL3: versioned REST/MCP, 공개 해석 guide, client lock v2 pending/ready, 부분 설치·공유 파일 무효화, native Claude MCP hook, 양 runtime의 설치/서버 지원 검사, Codex execution/handoff 전달, Windows bundle hook launcher.
- 배포 코드: protected code/source SHA의 `template-release.yml`, 운영 credential과 검증 job 분리, 명시 import/activate/bootstrap/status/result. 기존 Claude smoke에는 pinned private SHA와 이관 경계를 연결했다. production 환경·secrets 설정이나 workflow 실행은 하지 않았다.
- 검증: check/lint/type, architecture, core/plugin, web, server composition, 격리 PostgreSQL 전체 suite와 private 실제 HTTP 설치·단계 분기, 정확한 출시 0.5.33 init reader를 확인했다. 수치·revision·제한은 [구현 검증 보고서](../../test-reports/completed/2026-11-04-template-release-implementation.md)에 기록한다.

변경 후 현재 계약은 [template-releases.md](../../architecture/template-releases.md)가 권위다. native macOS/Windows 출시 조합의 실제 설치·hook 로딩, 전체 이전 client 집합, 운영 백업 복원·이관·포인터 복구와 배포 인수는 실행하지 않았다. TPL4 완료 또는 운영 배포 승인을 뜻하지 않으며 제안서는 active에 유지한다.

## Verification Results

아래 표는 구현 전 문서 reconciliation 당시의 기록이다. 최신 코드 검증은 Implementation Progress와 구현 검증 보고서를 따른다.

전체 제품 VFY-TPL-01–VFY-TPL-10은 아직 완료되지 않았다. 위 기반 구현의 실행 증거와 아래 과거 문서 대조 결과를 구분한다. 아래는 2026-11-02 및 2026-11-03의 문서/기존 코드 대조 결과다. strict 모드는 전체 Task가 확정되지 않은 WHOLE_SDD에 적용하지 않는다. 기계적 ID 연결과 의미·소유자·변경 후 검증 목적지는 별도로 대조한다. 기존 원본의 파싱/렌더 결과를 새 버전 기능의 통과로 사용하지 않는다.

| 검사 | 상태 | 증거 범위 |
| --- | --- | --- |
| 현재 코드·schema·계약·CI 읽기 | Executed | 위 근거 표의 로컬 기준 revision. 운영·private 원본 실측은 아님. |
| GitHub 앱의 private 원본 조회·blob 검증 | Executed — PASS | 고정 커밋 `fb6ef955ba3f6fc8320e173fbafc9ef03b83281b`, 누락 없는 tree 16 blob과 내용 hash 대조. 본문은 공개 저장소에 복사하지 않았다. |
| 현재 parser·bundle·합성 fixture의 렌더 검사 | Executed — PASS | 실제 private 원본 13행·agent graph 7개, Claude/Codex × Free/Pro/Max 6조합. 미치환/step 본문 노출 없음. DB 접속·실제 설치·전체 private suite는 실행하지 않았다. |
| private 시험의 기존 fixture 전제 | Executed — mismatch found | 현재 없는 `examples/apch/harness.json`의 ENOENT를 확인했다. 원본 시험의 lock 1·내부 import도 대조하고 I17/I18에 수정·이전 사례 검증을 계획했다. 전체 suite 통과로 보고하지 않는다. |
| 실행 생성 경로의 독립 대조 | Executed — PASS | 텍스트 검색과 TypeScript AST로 pipelineRun 4곳·workRun 2곳·agentRun 1곳의 create를 확인했다. |
| workflow JSON/YAML 구조 대조 | Executed — PASS | package scripts·manifest는 JSON, workflow는 설치된 js-yaml로 읽었다. 현재 smoke의 job은 Claude이며 private ref 미지정임을 확인했다. |
| `npm run verify:server`, `npm run verify:fsd` | Executed — PASS | 현재 코드의 경계 기준이 통과한다. 아직 없는 구현의 통과 증거가 아니라, 제안의 소유권/금지 import 판단의 기준이다. |
| 설치된 `validate_sdd_traceability.py --format json`의 standard 검사 | Executed — PASS | 이 문서 1개, REQ 13/13의 Phase·VFY 연결, 오류·경고 0건. |
| `npm run docs:check` | Executed — PASS | tracked Markdown 189개, 상대 링크 885개. 기본 명령은 신규 미추적 파일을 포함하지 않는다. |
| 신규 파일을 명시한 `inspectDocs`와 `parseFrontMatter` 검사 | Executed — PASS | 신규 문서를 포함한 Markdown 190개·상대 링크 905개, 오류 0건. proposal 상태·날짜·승인 null 값·관련 경로를 별도로 대조했다. |
| 신규 파일 diff·공백 검사 | Executed — PASS | `git diff --no-index --check`의 오류 출력 없음. 신규 파일과 빈 파일의 차이로 종료 코드 1이 반환되는 것을 공백 오류와 구분했다. |
| 변경 범위 검사 | Executed | 신규 proposal 한 파일이며 다른 소스/계약/환경 파일 변경 없음. |
| 2026-11-03 전체 재대조와 기존 코드 검사 | Executed — PASS | 공개 HEAD/private main 동일 확인, SDD 13/13·문서·FSD/서버 경계·private 13행/6조합 렌더를 재실행했다. 새로 확인한 세 경계의 수정은 다음 Reconciliation Notes에 기록했다. |
| 2026-11-03 기존 형식 경로의 추가 대조 | Executed — mismatch found | cursorTransaction의 미결합 생성, readFacts의 미결합/프로젝트 전체 완료 조회, nextFor/codexHandoffView와 watch/역할/commitHandoff의 문맥 투영을 확인했다. 부모 결합·cutover 증거·조회/전송·VFY를 함께 보완했다. 실제 새 결합의 제품 검증은 Planned다. |
| 2026-11-03 언어 선택과 기존 회귀 대조 | Executed — mismatch found / baseline checked | 본문의 동일 묶음 영어 fallback과 REST 표의 언어 없음 404가 충돌했다. 버전 모드의 선택을 통일하고 현행 legacy REST의 404는 보존했다. 기존 회귀 138건 중 샌드박스에서 137건이 통과했고 localhost listen이 차단된 handoff 시험은 승인 후 해당 파일을 재실행해 4/4 통과했다. 새 버전 기능의 통과 증거는 아니다. |
| DB·빌드·클라이언트·배포 시험 | Not executed | 문서 작성 범위. 제품 동작 검증은 각 Phase에서 수행한다. |

## Risks and Rollback

잔여 리스크:

- 불변 템플릿이 있어도 서버 parser·역할 어댑터·플러그인이 예전 계약을 해석하지 못하면 재개할 수 없다. 지원할 계약 집합과 종료 조건을 명시하고 실제 조합으로 검증한다.
- 기존 클라이언트가 가진 사용자 수정 파일은 새 설치 표면과 다를 수 있다. 본문 버전 고정을 이유로 강제 덮어쓰지 않는다.
- 최초 이관 전의 정확한 지침 이력은 현재 DB만으로 복원할 수 없다. 이관 이후 보장과 과거 증거의 한계를 구분한다.
- 오래된 묶음은 참조가 남는 동안 보존하므로 DB 저장량이 증가한다. 용량을 측정하며 자동 정리 정책은 별도 제안으로 다룬다.
- 보존된 실행이 서로 다른 설치 표면을 요구하면 같은 checkout에서 동시에 진행하지 못할 수 있다. 필요한 설치를 명시적으로 선택하고 현재 세션 소유권·init guard를 지킨다.

복구 순서:

1. 신규 활성화와 새 dispatch를 중지하고 실제 역할·미제출 outcome·서버 reader 상태를 확인한다. 기존 소유권 잠금을 임의 삭제하지 않는다.
2. 호환성이 검증된 이전 묶음을 새 요청 ID와 예상 revision으로 재활성화한다. 포인터·이벤트·요청 결과와 이후 새 실행의 선택을 대조한다.
3. 이미 문제 묶음에 고정된 실행과 초기 cutover 후 무효화된 receipt는 별도로 식별한다. 소유자가 기존 보류·재실행 경로로 처리하며 참조를 일괄 변경하거나 보고를 삭제하지 않는다.
4. 필요한 설치 파일을 명시한 묶음으로 갱신하고 pending→보고→ready 검사를 거친다. 수정 파일·부분 생성·다른 client의 공유 문서 충돌은 보존하고 해결 전 성공을 선언하지 않는다.
5. 서버 복구가 필요하면 현재 schema와 참조된 모든 묶음을 읽을 수 있는 서버 커밋만 배포한다. 기존 제한 restore 명령이나 이전 checkout 역seed를 버전 방식의 복구로 사용하지 않는다.
6. 새 실행·기존 실행·권한 거부·실제 생성물과 원장이 보존되는지 검증한다. private 백업의 전체 복원은 별도의 운영 DB 복구이며 승인·영향 범위를 다시 확인한다.

## Reconciliation Notes

### 2026-11-03 다운로드 언어 계약 재검증

입력 SHA-256 `fd2b6124e78c6cd6a422be6f837dcaea0c1ab812fe2a67f9ad92483f8f62448e`의 전체 재검토에서 개선점 하나를 확인했다. 본문은 버전 모드의 REST와 root 선택에 같은 묶음 내 영어 fallback을 정했지만 GET 표에는 알 수 없는 언어를 404로 거부한다고 남아 있었다. 현행 templates-handler와 client-bundle-query의 REST는 실제로 fallback하지 않는다.

이미 정한 버전 모드의 언어 선택을 REQ-TPL-007·REST 표·I07·최종 body·실패 행렬·TPL3·VFY-TPL-05에 통일하고, legacy REST의 기존 404·불완전 bundle 거부는 보존했다. 명시한 R1의 언어 누락을 active R2의 언어로 보완하지 않는 사례와 두 언어 모두 없는 404도 검증 목적지에 추가했다. 새 제품 코드는 구현하지 않았다.

### 2026-11-03 기존 형식의 실행 계보 재검증

입력 SHA-256 `7691a4af2610ea38851c7e035591991b9faf4e96ba4d0aa7fcbc2264fe76d03b`에서 새 전체 대조를 수행했고, 개선점이 있었다. format:null은 부모 없이 AgentRun을 만들고 완료/재개도 미결합 실행을 찾으므로, pin 필드만 추가하는 계획으로는 REQ-TPL-004/005를 보장하지 못했다. 프로젝트 역할의 완료 조회는 다른 부모의 결과도 읽었다.

기존 graph와 역할·승인 정책을 보존하면서 명시적인 legacy/standalone 문맥, 같은 부모의 완료·재개·handoff, 전환 전 증거의 불변 집합과 원자적 bootstrap을 정의했다. I01/I04–I11/I17·공개 타입 경로·TPL0/2/3/4·VFY-04/06/08·최종 산출물과 체크리스트에 반영했다. watch의 workSignature, Codex 요청 주입/briefing, commitHandoff의 결합 대조도 포함했다. 과거 부모나 템플릿 이력을 소급한 것은 아니다.

### 2026-11-03 재검증

같은 파일을 다시 검증·개선하라는 요청이므로 이전 결과의 replay가 아닌 전체 INV-1–INV-7 대조로 진행했다. 입력 문서 SHA-256은 `92d28f19a52d46790f00c6053ef1a85848cdc0d3c3a7068cfb4b46acbddf666e`다. 공개 HEAD와 private main/tree는 기존 조사 기준과 같았다. 이번에도 다음 개선점이 있어 수정했다.

| 추가 결함 | 반영한 계약과 검증 |
| --- | --- |
| 요청 유일성과 묶음 유일성의 혼동 | non-null releaseIdentity unique·저장 tuple 대조·기존 Serializable 경계를 명시했다. 다른 요청 ID의 동일 묶음 경합을 REQ-TPL-008·I01·TPL1·VFY-TPL-01/02에 전파했다. |
| 실행 pin의 DB 변경 차단 미정의 | known pin의 null-safe 불변성, 신규 tuple 필수, 부모/프로젝트 일치와 좁은 bootstrap 예외를 I01·TPL2·VFY-TPL-04/08에 반영했다. 과거 미상 새 root의 출처는 감사 note로 기록해 상속 FK와 혼동하지 않도록 했다. |
| 환경 이름과 연결/검증 출처의 결합 부족 | dotenv 기반 legacy helper와 명시적 새 target helper를 분리했다. 실제 대상의 쓰기 전 대조·신뢰한 workflow/code SHA·검증 run의 출처를 I04·TPL1/3·VFY-TPL-01/09에 반영했다. |

이 기록은 제안서의 계약 개선이다. 미래 제품 VFY와 운영 gate를 실행 완료로 바꾸지 않았고, 처음부터 개선할 점이 없었다고 보고하지 않는다.

### 2026-11-02 초안 대조

2026-11-02 `reconciling-proposals-with-codebase`에 따른 고위험 전체 대조다. 초안에 개선할 점이 없었던 것은 아니다. 초안 SHA-256은 `f85b0ff4776ef2054b0830154c98fb78a4df4ba2bfb8018501a0178833c4d3e8`이며, 아래 결함을 요구사항·설계·inventory·Phase·VFY에 함께 반영했다.

| 결함 | 코드 근거와 반영한 수정 |
| --- | --- |
| 단계 검증 의존성 역전 | TPL1/2가 TPL3의 활성화/클라이언트 시험을 요구했다. 활성화 서비스·CLI를 TPL1로 옮겼다. 재대조에서 BLK-TPL-01의 TPL0 계약 검토와 TPL3 구현 인수, VFY-09의 staging과 production 증거도 분리했다. |
| 서버 의존 경계 위반 가능성 | pipeline→templates는 현재 금지다. root 선택의 DB 소유자를 pipeline으로 명시하고 공유 판정은 core·허용된 public API로 연결했다. |
| 생성/재개·자동 전진 경계 부족 | create 7곳, reset/change의 갱신, head/next의 쓰기를 펼쳤다. graph와 template 출처, 과거 미상 reopen·transaction admission을 구분했다. |
| 전송·strict parser 누락 | 공통 callTool만 바꾸면 독립 Claude watch가 누락되고 새 wait가 거부된다. wire·parser·skill·runtime caller와 부정 검증을 함께 지정했다. |
| 부분 init의 stale ready | 마지막 lock 쓰기만으로는 이전 ready와 부분 파일이 섞인다. 첫 쓰기 전 pending, 공유 의존 무효화, 관리 블록 hash, 보고/재대조 뒤 ready와 guard 수명을 정의했다. |
| 설치 프로토콜/보고 모호성 | native protocol·전달 protocol·lock 형식, GET 협상·실제 route metadata·유효 언어·양 client 보고를 분리했다. |
| seal·전체 backup·cutover receipt 부족 | seal 뒤 추가 행을 막고 기존 입력 대상 snapshot을 전체 DB 백업과 구분했다. snapshot drift/원자적 writer 장벽·기준 pin·단일 revision bump와 stale 재개를 정의했다. |
| 검증 대상 착오 | 기존 released-readers는 세션 lock 시험이고 smoke는 Claude 전용이다. 새 init reader 시험과 별도 Codex 리허설을 명시했다. |
| 산출물·소비자·보존 범위 미확장 | 정확한 변경/보존 파일과 symbol 경로, 실제 JSON/생성 파일의 winning source, runner 검색·fixture 정리와 부정 검증을 추가했다. |
| private 검증 기반의 실제 불일치 | 앱으로 읽은 고정 커밋의 시험은 없는 ApcH fixture·lock 1·서버 내부 import에 의존한다. 정확한 원본 inventory와 test-owned config·새 설치 형식·public API/등록된 서버 교차 시험의 목적지 및 이전 사례 보존 검증을 추가했다. |

처음부터 타당했던 방향은 private Git/DB 분리, 등록/활성화 분리, 실행 계보 pin, 현재 권한 재검사, 과거 원장 보존과 운영 승인 경계다. 이를 불필요하게 다른 구조로 바꾸지 않았다. private 원본의 접근/내용 대조는 수행했지만 새 계약의 실제 인수·출시 전체 조합·실제 DB/운영 증거는 BLK-TPL-01–04의 해당 경계에서 확인해야 한다. 문서 개선이나 기존 본문의 렌더 통과로 이를 해소했다고 기록하지 않는다.

문서 편집 pass는 clean pass가 아니다. 최종 응답의 무편집 재검토 결과와 source identity가 검증 범위를 기록하며, 위 운영/미검증 입력과 전체 구현 READY 판정을 구분한다.

## Completion or Closure Notes

사용자가 승인한 Core 코드 구현과 로컬 검증을 수행했다. 운영 적용·native 출시 조합·실제 백업 복원 인수는 남아 있어 completed로 이동하지 않는다. 공개 저장소에 private 본문을 추가하지 않았으며 기존 원본의 임의 수정·seed·운영 활성화도 수행하지 않았다.

## Review Checklist

- [x] 현행 계약, 관찰 사실, 추론, 제안과 미검증 운영 상태를 구분했다.
- [x] 원본 취득·등록·활성화·실행 고정·설치 호환성과 각 복구 경계를 구분했다.
- [x] 버전 모드의 동일 묶음 언어 선택과 legacy REST의 fallback 없는 404를 구분하고 실제 GET·생성물의 검증에 연결했다.
- [x] 프로젝트 실행 → 배정 → 작업 실행 → 에이전트와 직접 실행·보류 재개의 선택 규칙을 포함했다.
- [x] format:null의 부모 문맥·완료/재개/handoff·전송 투영과 cutover 증거를 함께 정의하고, 독립/다른 부모 결과의 배제·과거 보존·전체 rollback을 검증 목적지에 연결했다.
- [x] 권한·플랜·사용량·사용자 게이트를 템플릿 버전에 고정하지 않았다.
- [x] 원자성·동시성·응답 유실·partial init·출시 reader·최초 이관의 실제 검증 대상을 정의했다.
- [x] REQ마다 Phase 완료 소유자와 VFY를 연결하고 실행한 로컬 검증과 미실행 운영 인수를 구분했다.
- [x] 사용자 실제 코드 수정 요청으로 Core 구현을 진행했고 운영 적용 승인은 확장하지 않았다.
- [ ] BLK-TPL-01–BLK-TPL-04의 해당 Phase 진입·종료 조건을 실제 증거로 해소했다.
- [ ] 구현·운영 인수와 복구 시험을 완료했다.
