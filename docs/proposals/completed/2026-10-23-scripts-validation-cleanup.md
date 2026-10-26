---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-23"
approved-by: "repository owner"
approved-at: "2026-10-23"
approval-scope: "Core TASK-SVC-01~03 구현 및 VFY-SVC-01~04 검증; 운영 실행·추가 삭제·PR 병합 제외"
completed-at: "2026-10-23"
verification-summary: "Core 구현 완료. FSD/server 경계·architecture·check·fresh manifest/server 148·PostgreSQL integration 139·build·실제 HTTP 인수·실패 주입 7종 통과. Windows native 2개는 해당 플랫폼 전용 skip."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "../../architecture/verification.md"
  - "../../architecture/test-organization.md"
  - "../../architecture/server.md"
  - "../../ADR/0004-organize-repository-scripts.md"
---

# scripts 검증 유효성 점검과 단계적 정리

## Summary

`scripts/`의 기존 책임별 배치를 유지하면서 현재 코드와 맞지 않는 리허설을 복구하고,
중복 또는 사용 종료를 입증할 수 있는 항목만 제거한다. 파일 수 감소를 완료 조건으로
삼지 않는다. 현재 확정한 구현 범위인 **Core는 fourth-pass HTTP 리허설의 계약 복구와
실패 시 자원 정리·실행 경로 명시**다. 이번 조사로 새롭게 삭제를 확정한 파일은 없다.

초기 대화에서 후보였던 D3 복구 도구 삭제와 브라우저 리허설 실행 절차 정리는 최신
`dev`에 이미 반영되어 있다. 이를 재구현하지 않는다. 나머지 리허설의 통합·삭제는
검증 사례와 대체 경로를 대조한 뒤 이 문서의 범위를 갱신할 때 판단한다.

이 문서는 `write-sdd-spec`의 독립 구현 계획 형식인 `PHASE_PLAN`을 적용한다.
상위 별도 SDD를 만들지 않고 사용자 요청과 아래 아키텍처 문서를 근거로 제한된
요구사항·작업·검증을 정의한다. 최초 문서 작성 요청과 이후 Core 구현 승인을 구분하며, 구현 승인 기록은 front matter를 따른다.
PR 병합·운영 실행은 이번 승인에 포함하지 않는다.

## Goal

- 유지할 도구, 현재 계약에 맞춰 고칠 도구, 추가 근거가 필요한 후보를 구분한다.
- 잘못된 입력을 성공 사례로 사용하던 리허설을 현재 저장 계약으로 복구한다.
- 기존의 인증·입력 거부·경합·응답 유실·읽기 전용 검증을 보존한다.
- 실행 명령과 필요한 환경을 명시해 재실행 가능한 상태를 만든다.

## Proposal Size

`standard`. 스크립트 정리는 삭제·통합 판단을 포함하고, Core도 실제 HTTP·DB 상태와
수동 실행 절차를 함께 다룬다. 제품 API나 데이터 구조를 바꾸는 작업은 아니다.
[제안서 기준](../README.md)의 삭제·여러 파일 정리 원칙을 따른다. 현재 책임 배치를
유지하므로 새 ADR, 테스트 프레임워크, 범용 리허설 실행기를 도입하지 않는다.

## Current State

### 근거와 기준 리비전

| 구분 | 기준과 확인 범위 |
| --- | --- |
| 사용자 요청 | 필요한 검증을 보존하면서 scripts의 불필요한 부분을 정리하는 제안서를 `docs/proposals/active/`에 작성 |
| 최초 조사 checkout | `a9c361a4b1c20cbbfe2e09d1823aef5d20003f3a`, `harness/dead-code-cleanup-proposal-20261023` |
| 최초 작성 기준 | `origin/dev`: `c6e2fd3a49cd3b817dbdc02600e7fc6ee6d021bf` |
| 이번 정합화 기준 | 원격 main/dev 존재 확인과 fetch 후 `59585553e0d6340f81e9fa4bef63be15e824e911` (PR #212 core 배치 반영) |
| 격리 branch | 최초 작성 `harness/scripts-validation-proposal-20261023`; 이번 검토 `harness/scripts-validation-reconcile-20261023`, 각각 기록한 dev 기준에서 생성 |
| 사용자 작업 보존 | 최초 checkout의 미추적 `optional-private-repository-picker.md`, `2026-10-23-fsd-frontend-clean-code-review.md`는 변경하지 않음 |
| 현재 구조의 근거 | [architecture README](../../architecture/README.md), [검증 규칙](../../architecture/verification.md), [테스트 배치](../../architecture/test-organization.md), [서버 경계](../../architecture/server.md), [ADR-0004](../../ADR/0004-organize-repository-scripts.md) |
| 실행 연결의 근거 | [package.json](../../../package.json), [check workflow](../../../.github/workflows/check.yml), [Windows workflow](../../../.github/workflows/windows-role-runtime.yml) |

Observed는 소스·명령 출력에서 확인한 사실, Contracted는 저장소 규칙,
Inferred는 그 근거에 따른 제안, Unresolved는 실행 또는 추가 대조가 필요한 항목이다.
소스가 존재한다는 사실과 실제 실행 성공은 구분한다.

### 최신 dev와 최초 조사 결과의 차이

| 항목 | Observed | 이번 처리 |
| --- | --- | --- |
| D3 복구 | PR #208의 병합 커밋 `7a76bd3`이 `dev`에 포함됨. 복구 CLI·보조 모듈·SQL·D3 리허설 4개와 두 npm 명령이 제거됨 | 완료된 정리로 분류. 삭제 재실행·복원·운영 복구 종료 재승인 요청 없음 |
| project-ownership 잔여 | 읽기 전용 검사·보조 코드·테스트 4개가 남음 | 복구 도구와 구별하여 유지 |
| QA 브라우저 리허설 | PR #210의 병합 커밋 `28c8d07`이 포함됨. 실행 방법과 브라우저 사례가 보완됨 | 기존 문서·실행 계약을 재사용. 동일 정리 반복 금지 |
| CI | `test:server` 및 PostgreSQL 18의 `test:server:integration` job이 존재함 | 서버 통합 시험의 CI 신설을 제안하지 않음 |
| 의존성 | 최신 manifest는 Next 16.4.2, 최초 checkout은 16.3.3 | 실제 리허설 실행은 최신 dev 의존성·fresh build로 수행. 이전 실행 결과로 대체하지 않음 |
| core 배치 | PR #212에서 `packages/core/pipeline.mjs`가 `packages/core/pipeline/pipeline.mjs`로 이동했고 소비 import가 갱신됨 | 새 실제 경로 유지. 호환 barrel이나 옛 경로 복원 금지 |
| 파일 집합 | 정합화 기준은 49개·테스트 16개·6,941줄. c6e2fd3 당시 6,894줄은 과거 관측 | 경로 집합과 내용 리비전을 함께 판단 |

### 전수 경로 분류

아래 경로는 모두 `scripts/` 기준이다. 동일 셀의 파일은 동일한 책임을 가지며,
총 49개를 중복 없이 포함한다. **유지**는 이번 변경에서 보존한다는 뜻이며 모든
플랫폼·DB·모델 환경에서 실행을 인증했다는 뜻은 아니다.

| 파일 또는 파일 묶음 | 수 | 실행·소비 근거 | 이번 판단 |
| --- | ---: | --- | --- |
| `build.mjs` | 1 | `npm run build`: Prisma 생성 후 Next 빌드 | 유지 |
| `cleanup-task-branches.mjs`, `cleanup-task-branches.test.mjs` | 2 | 작업 시작·종료 절차, `test:scripts` | 유지 |
| `plugin-lib.mjs`, `plugin-lib.test.mjs` | 2 | `check`, `sync:plugin-lib`, 복사본 동기화 | 유지 |
| `test-server-integration.mjs`, `test-server-integration.test.mjs` | 2 | CI의 PostgreSQL 통합 시험 및 URL 격리 검사 | 유지 |
| `grant-plan.ts` | 1 | `plan:grant`, 수동 플랜 변경 | 유지; 운영 실행 제외 |
| `checks/verify-fsd-boundaries.mjs`, `checks/verify-fsd-boundaries.test.mjs` | 2 | `verify:fsd`, lint/check | 유지 |
| `checks/verify-server-boundaries.mjs`, `checks/verify-server-boundaries.test.mjs` | 2 | `verify:server`, lint/check | 유지 |
| `checks/verify-docs.mjs`, `checks/verify-docs.test.mjs` | 2 | `docs:check`, check | 유지 |
| `checks/verify-plugin-version.mjs`, `checks/verify-plugin-version.test.mjs` | 2 | 릴리스 승격 전 판 검사; 테스트는 check에 포함 | 유지 |
| `checks/frontend-contract-owners.test.mjs`, `checks/retired-copy.test.mjs` | 2 | 공개 계약·폐기 문구 검사, `test:scripts` | 유지 |
| `windows/build-windows-role-node.ps1` | 1 | native runtime CI 빌드 | 유지 |
| `windows/windows-role-runtime-cache.mjs`, `windows/windows-role-runtime-cache.test.mjs` | 2 | Windows CI 캐시 키·artifact 검증 | 유지 |
| `windows/windows-role-readlink.cjs`, `windows/windows-role-readlink.test.mjs` | 2 | Windows 역할 빌드 preload와 native 검증 | 유지 |
| `windows/windows-role-spawn-diagnostics.cjs`, `windows/windows-role-spawn-diagnostics.test.mjs` | 2 | Windows child 실행 진단과 검증 | 유지 |
| `windows/rehearse-windows-project-build.mjs`, `windows/package-windows-plugin.mjs` | 2 | native 전체 빌드·배포물 조립 | 유지; 실제 패키징 제외 |
| `templates/seed-templates.ts`, `templates/restore-dual-client-templates.ts` | 2 | private 템플릿 DB 배포·제한 복구 | 유지; seed/restore 실행 제외 |
| `templates/template-seed-query.ts`, `templates/template-seed-query.test.ts` | 2 | seed/restore 공유 쿼리와 도구 시험 | 유지 |
| `project-ownership/check-project-ownership-cleanup.ts`, `project-ownership/project-ownership-cleanup.ts` | 2 | 읽기 전용 소유권 검사와 검사 규칙 | 유지 |
| `project-ownership/project-availability-cleanup.test.ts`, `project-ownership/project-availability-runtime.test.ts` | 2 | 현행 소유권·폐기 경로 회귀 검사 | 유지 |
| `lib/prisma.ts` | 1 | 여러 운영 스크립트의 Prisma 연결 | 유지 |
| `rehearsals/rehearse-dual-client-runtime.ts`, `rehearsals/rehearse-dual-client-runtime.test.ts` | 2 | capability/acceptance 명령, 보고서 검사와 도구 테스트 | 유지; 실제 모델·설치 인수 제외 |
| `rehearsals/rehearse-multiple-pipelines.ts` | 1 | 현행 파이프라인 Action 8종의 실제 HTTP 인수 | 유지; fourth-pass와 사례 비교에 참조 |
| `rehearsals/rehearse-multiple-pipelines-browser.mjs` | 1 | 실제 컴포넌트의 pending·dirty·응답 유실·선택 상태 검증 | 유지; 최근 보완 완료 |
| `rehearsals/rehearse-account-usage-and-tokens.ts` | 1 | 실제 Next 토큰·요청 제한·사용량 인수 | 유지 |
| `rehearsals/rehearse-acceptance-failure.ts` | 1 | 실제 Next 인수 실패·재시도·응답 유실 | 유지 |
| `rehearsals/rehearse-automatic-scout.ts` | 1 | 실제 Next 자동 발굴 설정·접근 거부 | 유지 |
| `rehearsals/rehearse-repository-disconnection.ts` | 1 | 실제 Next 연결 해제·재연결·응답 유실 | 유지 |
| `rehearsals/rehearse-src-clean-code.ts` | 1 | Inbox·폼·클립보드·렌더 오류 및 브라우저 fixture | 유지; 이름만으로 삭제하지 않음 |
| `rehearsals/rehearse-src-clean-code-fourth-pass.ts` | 1 | 이전 파이프라인 저장 형식과 HTTP 사례가 함께 남음 | **Core 수정** |
| `rehearsals/rehearse-src-clean-code-fifth-pass.ts` | 1 | Action 결과의 Flight 응답·chunk/module 해석과 화면 검증 | 유지; 차수별 통합은 추가 대조 필요 |
| `rehearsals/rehearse-pipeline-agent-slots.ts` | 1 | 이전 데이터의 migration·실행 원장·사용량 경합 검증 | 유지; 완전 대체 여부 미확인 |
| `rehearsals/rehearse-request-rate-baseline.ts` | 1 | private 템플릿과 MCP callback을 이용한 호출량 가정 검증 | 유지; 실트래픽 측정으로 해석하지 않음 |

### 확인된 불일치와 대체 검증의 한계

**F01 — 파이프라인 입력 계약 불일치, Observed.**
[fourth-pass](../../../scripts/rehearsals/rehearse-src-clean-code-fourth-pass.ts)의
성공·경합·응답 유실 요청은 `{ graph, expectedVersion }`을 보낸다.
현재 [입력 schema](../../../src/fsd/features/edit-pipeline/model/save-pipeline-input.ts)는
`pipelineId`, `definition: { steps, gates }`, `expectedVersion`을 요구한다.
실제 schema 검사에서 이전 요청은 `pipelineId`·`definition` 누락으로 거부됐다.
이는 전체 HTTP 인수 실행 결과가 아니라 입력 검증의 재현 결과다.
최초 조사와 c6e2fd3 사이에는 세 파일이 동일했다. 이번 5958555에서는 core import
경로가 바뀌었지만 입력 schema와 저장 알고리즘의 해당 계약은 유지된다.

**F02 — 저장 버전 관측 대상 불일치, Observed / Inferred.**
같은 리허설은 성공할 때마다 `PipelineVersion`이 하나 늘어난다고 기대한다.
현재 [savePipelineDefinition](../../../src/server/pipeline/save-definition.ts)은
성공할 때 `PipelineDefinition.version`을 증가시키고, 실행 graph가 같으면
`PipelineVersion`을 재사용한다. 요청 필드만 교체하면 이 잘못된 기대가 남는다.
정의 버전과 실행 버전의 관측을 함께 수정해야 한다.

**F03 — 자동 게이트가 HTTP 리허설을 실행하지 않음, Observed.**
`test:scripts`는 `.test.mjs`·`.test.ts`를 실행한다. check workflow의 서버 통합
시험은 `tests/server/integration/*.test.ts`를 실행한다. fourth-pass를 직접 실행하는
CI 단계는 없다. TypeScript의 `unknown[]` 기반 HTTP helper 때문에 입력 객체가
현재 Action 타입과 달라도 타입 검사만으로 이 불일치를 잡는다고 보장할 수 없다.

**검증 범위 비교, Observed.**
[mutation-identifiers](../../../tests/server/integration/mutation-identifiers.test.ts)는
서비스 직접 호출에서 잘못된 식별자의 무쓰기를 검증한다. fourth-pass는 실제 인증과
multipart Action 요청을 포함한다. [pipeline-save](../../../tests/server/integration/pipeline-save.test.ts)는
DB 연결 간 잠금·경합을 검증하지만 HTTP 응답 유실 전후를 대신하지 않는다.
[multiple-pipelines](../../../scripts/rehearsals/rehearse-multiple-pipelines.ts)는 현행 입력
형식을 쓰지만 fourth-pass의 commit 전후 연결 단절 사례 전체를 대체하지 않는다.
fifth-pass의 실제 Flight 소비도 단순 응답 문자열 비교와 동등하지 않다.

**F04 — 리소스 정리 범위 누락, Observed.** 현재 fourth-pass는 환경 변수 변경,
pool 생성, manifest 읽기를 `try` 밖에서 수행한다. owner·foreign fixture를 모두 만든
뒤에야 정리 목록에 추가하며, 공유 `fixture`는 여러 쓰기를 transaction 없이 수행한다.
따라서 초기화·부분 생성 실패는 기존 `finally`만으로 처리되지 않는다. 정리 중 한 작업이
실패하면 다음 정리와 환경 복원도 건너뛸 수 있다. REQ-SVC-004를 충족하도록 같은
리허설 안에서 획득 순서·transaction·독립 정리·timeout을 보완한다.

**F05 — 검증 대상 구체화 누락, Observed.** 이전 문서는 다른 pipeline 보존을 요구했지만
대조군 fixture를 지정하지 않았고, 파이프라인 타인·익명 거부의 응답 형태도 명시하지
않았다. 현재 `requireUser`는 로그인 redirect, `requireProjectOwner`는 notFound를
사용한다. 모든 거부를 `{status: "error"}`로 기대하면 실제 권한 실패와 맞지 않는다.
또한 `.next`의 name-only Action 탐색과 `/settings/tokens` 일괄 POST를 그대로 둘지
불명확했다. 아래 호출·산출물 표와 검증 행렬로 실제 대상 route와 결과를 고정한다.

참고로 기존 백로그 form의 `type: "feature"`와 `typeBefore: "feature"`는 모두
`toItemType`에서 null로 정규화된다. 현재 제목 수정 성공을 막는 결함은 아니다.
이 사례를 유효한 `feat` 타입 변경의 증거로 확대하지 않으며, 제목만 수정하는 본래
관측 범위를 유지한다.

### Core의 구체적인 의존성과 최종 산출물

다음 표는 수정할 네 파일이 읽거나 호출하는 **검토 대상**이다. 추가 수정 허용 목록이
아니다. `scripts/`의 나머지 48개는 전수 경로·실행 연결과 불변 조건을 확인하며,
각 도구의 모든 내부 동작을 이 Core에서 재인수하지 않는다.

| 경계 | 현재 owner → 공개 경로/소비자 → 검증 위치 |
| --- | --- |
| graph | `packages/core/pipeline/pipeline.mjs`: `defaultGraph`, `SLOT_FORMAT`, `validateDefinition`; 직접 모듈 경로 → fourth-pass의 definition 입력 → VFY-SVC-01/02 |
| 입력·저장 | `save-pipeline-input.ts:savePipelineInputSchema`, `pipeline-save-state.ts:SavePipelineInput/SavePipelineResult` → `edit-pipeline.server.ts:savePipeline` → `edit-pipeline/index.server.ts` → `/p/[slug]/pipeline` |
| DB 저장 | `src/server/pipeline/save-definition.ts:savePipelineDefinition` → `pipeline/api.ts`; `lock-pipeline.ts:withPipelineWrite`, `run-service.ts:loadPipelinesViewIn/ensureDefaultPipeline`가 소유자 잠금·정의/실행 버전 처리 |
| 백로그 | `src/server/pipeline/board-service.ts:updateBacklog/removeBacklog` → `board.ts` singleton → `api.server.ts` → `src/fsd/features/edit-backlog/api/edit-backlog.server.ts:updateBacklogItem/removeBacklogItem` → `edit-backlog/index.server.ts` → `/p/[slug]/backlog` |
| 권한 | `src/server/auth/guard.ts:requireUser/requireProjectOwner/requireProjectWrite`; `src/server/projects/access-query.ts`의 접근 상태 → 위 Action 및 네 GET route |
| fixture·격리 | `tests/server/integration/support.ts:connections/fixture/cleanup/pipelineState`, `scripts/test-server-integration.mjs:validateTestDatabase`, `tests/server/register-server-only.mjs`, `prisma/schema.prisma` |
| build | `package.json`, `package-lock.json`, `scripts/build.mjs`, `next.config.mjs`, `prisma.config.ts` → 설치 버전·Prisma 생성·Next build → `.next/BUILD_ID`, `.next/server/server-reference-manifest.json` |
| 기존 비교 시험 | `tests/server/integration/pipeline-save.test.ts`, `mutation-identifiers.test.ts`; `scripts/rehearsals/rehearse-multiple-pipelines.ts`, `rehearse-src-clean-code-fifth-pass.ts` |

| 최종 산출물 | winning source / 내용·의존성 | 검증 목적지 |
| --- | --- | --- |
| 수동 npm 명령 | 기존 `package.json.scripts`에 단일 key를 병합; runner 파일 경로·server-only bootstrap·tsx | JSON parse 후 key 값 동일, 나머지 scripts key/value 불변; VFY-SVC-04 |
| Action 식별자 | 같은 checkout의 fresh build manifest. 아래 세 export와 정확한 filename으로 한 entry씩 선택하고 worker 구조 확인. 옛 build의 ID 재사용 금지 | `savePipeline` → `src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts`; `updateBacklogItem`, `removeBacklogItem` → `src/fsd/features/edit-backlog/api/edit-backlog.server.ts`; VFY-SVC-01/02 |
| Action 요청·응답 | 저장은 `/p/${owner.id}/pipeline`, 백로그는 `/p/${owner.id}/backlog`. `owner.id`는 fixture의 slug이며 DB 키 `owner.projectId`와 구별. `encodeReply`와 실제 HTTP body·status·redirect header가 관측 대상 | 성공·오류·stale 내용과 DB 효과를 함께 확인. route/status만으로 성공 판정 금지. 전체 Flight chunk 소비 인증은 fifth-pass에 남김 |
| Board HTML | `src/app/(app)/p/[slug]/page.tsx` → `project-board/index.server.ts:loadProjectBoard` → `api/project-board.server.ts` → `ui/project-board-page.tsx` | owner key·현재 항목 href·Activity 내용과 DB snapshot; VFY-SVC-03 |
| History HTML | `src/app/(app)/p/[slug]/history/page.tsx` → `project-history/index.server.ts:loadProjectHistory` → `api/project-history.server.ts`, `model/history-navigation.ts` → `ui/project-history-page.tsx`, `ui/history-items-list.tsx` | Items 확장과 Events/all 각각의 body, event note·report anchor·DB snapshot; VFY-SVC-03 |
| report 링크 | `widgets/history-feed/model/history-row.ts:toHistoryRows` → `entities/board-item/index.ts:blobHref` (`model/doc-link.ts`) → `widgets/history-feed/ui/history-list.tsx`의 실제 anchor. `loadProjectRepository`가 공급하는 repoOwner/repo와 저장된 commit/path가 URL 원본 | 두 History body의 실제 `href`를 fixture의 owner/repo·`abcdef123456`·`docs/fixture-report.md`로 만든 전체 URL과 대조. 문자열의 단순 출현·외부 GitHub 접속은 대체 증거가 아님 |
| pipeline HTML | `src/app/(app)/p/[slug]/pipeline/page.tsx` → `src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx` → `AutomaticScoutControl`, `PipelineList` (edit-pipeline public API) | `Pipeline`, `Automatic scouting`, `Default` 및 저장한 정의가 나타나는 body와 DB 불변; VFY-SVC-03 |

네 GET 요청은 `/p/${owner.id}`, `/p/${owner.id}/history?item=${encodeURIComponent(owner.key)}`,
`/p/${owner.id}/history?mode=events&view=all`, `/p/${owner.id}/pipeline`이다. 각 응답의
HTTP 200뿐 아니라 위 내용까지 확인한다. HTML shell의 폰트·CSS·이미지 및 클라이언트
hydration은 수정하지 않으며 이 시험은 시각·전체 브라우저 검증을 주장하지 않는다.

현재 격리 checkout에는 `.next`가 없으므로 최신 16.4.2의 실제 manifest·HTTP body를
이미 관측했다고 기록하지 않는다. 로컬 16.3.3의 `redirect`/`notFound` 문서와
`action-handler.js`는 fetch Action의 redirect header·404 처리 배경 확인에만 사용했다.
설치할 16.4.2의 구조·응답은 VFY-SVC-02 preflight와 실제 body에서 확인하고, 불일치하면
검증을 약화하지 않고 중단한다. 이 표는 구현 후 산출물의 소유권과 관측 계약이다.

## Scope

### Core

- fourth-pass의 입력·정의 버전·실행 버전 검증을 현재 계약에 맞춘다.
- 아래 보존 행렬의 기존 HTTP·DB 검증 사례를 유지한다.
- 같은 리허설 안에서 부분 초기화·fixture 생성 실패와 독립적인 자원 정리를 보완한다.
- 해당 리허설에 고정 npm 진입점 하나와 검증 문서의 실행 행을 추가한다.
- 이번 제안서에 변경 결과와 실행 근거를 기록한다.

### 보류와 제외

- **보류:** 차수별 리허설의 개명·분할·통합·삭제, slots migration 리허설 및 호출량
  baseline의 완전 대체 판정. 현재 고유 사례가 없다는 증거가 확보되지 않았다.
- **이미 완료:** D3 복구 도구 폐기, QA 브라우저 실행 절차 정리, 서버 시험 CI 연결.
- **제외:** 제품 코드·API·DB schema·migration 변경, 새 runner/의존성/전역 helper,
  전체 리허설 CI 자동화, Windows runtime 수정, 운영 DB·seed·배포·플랜 변경.
- Core에서 새 파일 삭제는 제안하지 않는다. 다른 도구를 삭제하려면 해당 사례의
  대체 검증과 수정할 참조를 이 문서에 먼저 확정하고 그 범위의 승인을 기록한다.

## Proposal

### 요구사항과 제약

#### REQ-SVC-001: 현행 파이프라인 저장 검증

WHEN 소유자의 유효한 파이프라인 저장 요청을 실제 Next Action에 제출하면,
리허설은 성공 응답·해당 pipeline의 정의 버전 증가·다른 pipeline 보존을 검증해야 한다.
IF 입력이 잘못되거나 사용자·플랜·프로젝트 상태가 쓰기를 허용하지 않으면,
리허설은 거부 결과와 owner·foreign 대조군의 관측 대상 DB 상태 불변을 검증해야 한다.
타인/익명의 framework 응답과 service가 반환하는 error 객체를 구별해야 한다.

#### REQ-SVC-002: 경합과 실행 버전 재사용 검증

WHEN 같은 정의 버전으로 두 저장 요청을 보내면, 리허설은 성공 하나·stale 하나와
정의 버전 하나 증가를 검증해야 한다. WHEN 같은 실행 graph를 다시 저장하면,
리허설은 정의 버전 증가와 기존 실행 버전 재사용을 각각 검증해야 한다.

#### REQ-SVC-003: 응답 유실 검증

IF 요청이 origin에 도달하기 전에 연결이 끊기면, 리허설은 저장되지 않았음을
검증해야 한다. IF origin의 저장 완료 뒤 응답 전달이 끊기면, 리허설은 클라이언트
실패와 DB의 정확히 한 번 저장을 함께 검증해야 하며 요청을 자동 재전송하지 않아야 한다.

#### REQ-SVC-004: 기존 HTTP 검증 보존

WHEN fourth-pass를 실행하면, 리허설은 기존 백로그 multipart 입력·익명/타인 거부·
열린 항목 제거 거부·정상 한 대상 변경과 Board/History/pipeline 읽기 사례를 계속
검증해야 한다. WHEN 실행이 성공하거나 실패하면, 자기 fixture와 시작한 프로세스·
연결을 정리하고 변경한 프로세스 환경을 복원하며 실행 결과를 종료 코드로 구분해야 한다.
부분 초기화·fixture 생성 실패도 포함하고, 하나의 정리 실패가 나머지 정리를 막지 않아야 한다.
외부 DB 장애 등으로 정리를 완료하지 못하면 남은 자기 fixture 식별자와 실패 단계를
비밀 값 없이 기록하고 비정상 종료해야 하며 정리 성공으로 보고해서는 안 된다.

#### INV-SVC-001: 제품 계약 보존

제품의 저장·권한·요금제·이력 계약과 migration은 변경하지 않는다. 리허설의
잘못된 기대를 제품 동작 변경으로 통과시키지 않는다. HTTP, DB, 브라우저, 모델
검증을 서로 대체 가능한 증거로 취급하지 않는다.

#### CON-SVC-001: 변경 범위와 구조

Core의 허용 파일은 Affected Files의 수정 행 네 개다. 기존 scripts 책임별 폴더,
서버 내부 참조 제한, 테스트 배치 규칙을 보존한다. 이름 변경·새 공용 helper 모듈·새 framework를
Core에 추가하지 않는다. 제품 API를 시험 편의로 넓히지 않는다.

#### CON-SVC-002: 실행 환경과 증거

현재 의존성을 설치한 격리 checkout·fresh production build·운영 DB와 분리된
`TEST_DATABASE_URL`에서 실제 HTTP 인수를 수행한다. 비밀 값은 문서·로그에 기록하지
않는다. 미실행·실패·skip을 성공으로 집계하지 않는다. 이전 Next 버전의 build를
재사용하지 않는다. 구현 전 설치된 Next의 관련 로컬 문서를 확인한다.

### 보존할 사례와 관측 대상

| 사례 | 현재 문제 또는 가치 | 수정 후 관측 |
| --- | --- | --- |
| 백로그 malformed·multipart | 서비스 시험과 다른 실제 전송 경계 | 기존 요청 묶음·거부·전체 대상 행 불변 유지 |
| 백로그 타인·익명·열린 항목 | 권한 및 삭제 보호 | DB 무쓰기, 정상 변경은 지정 항목만 반영 |
| 최초 저장 | 이전 `graph` 입력 | `default_<projectId>`와 `definition` 사용, baseline 0→1 |
| 동일 정의 재저장 | 실행 버전이 매번 늘어난다는 기대 | 정의 버전만 증가하고 실행 버전 행은 동일 |
| invalid 입력 | 모든 사례가 누락 필드 한 종류로 실패할 수 있음 | 유효한 기본 입력에서 필드 하나씩 변조; 구조 오류와 의미 오류 분리 |
| 순차·동시 stale | `PipelineVersion`을 저장 카운터로 사용 | 정의 버전 기준 stale와 무쓰기, 동시 요청에서 성공 1·stale 1 |
| 요청 전 연결 단절 | 고유 HTTP 실패 사례 | origin 미도달, 전체 파이프라인 상태 불변 |
| commit 후 응답 유실 | 고유 HTTP 실패 사례 | 클라이언트 reject, 정의 버전 정확히 1 증가, 기존 행 보존 |
| 미선택·연결 해제·Free | 접근 제한 유지 | 유효 payload도 거부; 파이프라인·백로그 상태 불변 |
| Board·History Items/Events·pipeline GET | 실제 화면 연결과 report URL | 현행 화면 계약·보고서 목적지 확인, GET 전후 DB 무쓰기 |
| 초기화·부분 생성·정리 실패 | try 밖 초기화·fixture ID 늦은 등록·정리 중단 | 부분 생성 rollback, 획득한 자원별 독립 정리, 환경 복원, 남은 실패의 비정상 종료 |

## Affected Files

| 경로 | 작업 | 근거와 경계 | 리스크 |
| --- | --- | --- | --- |
| `scripts/rehearsals/rehearse-src-clean-code-fourth-pass.ts` | 수정 | 요청·snapshot·assertion을 현행 계약으로 조정. 기존 사례 보존, 초기화·정리 보완 | medium: 실제 DB·HTTP 실행 |
| `package.json` | 수정 | 제안 명령 `test:acceptance:backlog-pipeline` 하나 추가. 기존 test/check 검색 패턴 불변 | low: 수동 명령 연결 |
| `docs/architecture/verification.md` | 수정 | 해당 수동 명령·선행 조건·검증 범위·관련 변경 시 실행 기준 명시 | low: 현재 절차 문서 |
| `docs/proposals/completed/2026-10-23-scripts-validation-cleanup.md` | 갱신 | 승인 범위·실행 결과·완료 판단 기록 | low |
| `src/**`, `packages/**`, `prisma/**`, `plugin/**`, `.github/**`, lockfile | 읽기 전용 | 계약·소비자·비교 증거. Core에서 수정하지 않음 | 변경 발견 시 중단 |
| `tests/server/**`, 나머지 `scripts/**` | 읽기 전용 | 기존 fixture와 검증 사례 재사용·대조. 변경이 필요하면 범위 재평가 | 변경 발견 시 중단 |

## Safety Analysis

- **Contracted:** scripts 이름만으로 테스트 권한이 생기지 않는다. Core는 현재 파일
  경로와 공개 경로를 유지하므로 서버 내부 참조 목록을 넓힐 필요가 없다.
- **Observed:** 실행 스크립트는 직접 CLI로 호출할 수 있다. import 소비자나 CI 호출이
  없다는 사실만으로 삭제하지 않는다. package 명령·workflow·문서의 수동 실행을 함께 본다.
- **Observed:** fourth-pass는 함수 직접 호출 대신 HTTP payload를 `unknown[]`로 만든다.
  타입 검사 성공만으로 전송 계약의 일치를 판정하지 않는다.
- **Inferred:** 현재 복구는 다른 파일을 통합하는 것보다 변경 범위가 작다. 같은 Node/Next
  setup이 있다는 이유만으로 범용 공통 실행기를 추출하지 않는다.
- **격리:** 기존 URL 검증·loopback·자기 fixture 정리를 유지한다. 운영 데이터 변경은 없다.
  `--apply`를 사용하는 운영 도구나 template seed/restore는 검증 명령에 넣지 않는다.
- **비관련:** 라우팅·public 자산·타입 공개·사용자 저장소·외부 SDK 제품 계약은 수정 대상이 아니다.
- **Unresolved:** 모든 수동 리허설의 최신 환경 성공이나 중복 완전 제거는 아직 입증하지
  않았다. 이 한계는 나머지 파일의 삭제 보류 근거이며 Core 설계의 결정을 막지 않는다.

## Approval

사용자가 이 문서를 바탕으로 실제 코드 수정과 완료 후 검증을 요청했다.
구현 승인 기록은 front matter를 단일 기준으로 사용한다. 미확정 삭제·운영 실행·
PR 병합은 승인 범위에 포함하지 않는다.

## Execution Plan

### TASK-SVC-01: 저장 입력과 버전 관측 복구

- satisfies: REQ-SVC-001, REQ-SVC-002
- preserves: INV-SVC-001
- governed-by: CON-SVC-001, CON-SVC-002
- verified-by: VFY-SVC-01, VFY-SVC-02

대상은 fourth-pass의 파이프라인 저장 구간이다. 기본 ID `default_${owner.projectId}`와
`{ pipelineId, definition: { steps: graph.nodes, gates: graph.gates }, expectedVersion }`을
사용한다. graph는 현행 `packages/core/pipeline/pipeline.mjs`에서 읽는다.
`pipelineId: null`은 name이 필요한 신규 생성이므로 default 수정의 대체값으로 쓰지 않는다.

owner와 foreign 각각에 default를 참조하지 않는 독립 pipeline 대조군을 하나 둔다.
초기 fixture 설정에서 `Pipeline`과 version 1의 `PipelineDefinition`을 만들며, 정의는
`steps: ["doc-auditor"], gates: []`인 fragment로 두어 실행 버전·참조·rule을 만들지 않는다.
이를 매 요청 전후 비교하여 "다른 pipeline 보존"이 빈 집합 비교가 되지 않게 한다.
대조군 설정을 마친 뒤 owner default의 정의·실행 버전이 없는 baseline 0을 확인한다.

`pipelineState`는 기본 참조·autoProposeEnabled·pipeline/definition/version/rule·board/run/event를
포함한다. 로컬 snapshot은 여기에 해당 project scalar 필드와 BacklogItem·Report를
ID순으로 더한다. owner·foreign를 각각 비교하고, 플랜·available·disconnectedAt을 시험
준비로 바꿀 때는 변경 후 snapshot을 기준으로 삼는다. "무쓰기"는 이 명시한 관측 범위를
뜻하며 데이터베이스의 모든 테이블에 대한 SQL 감사를 뜻하지 않는다.

다음 순서를 고정한다.

1. baseline 0에서 invalid 입력을 검증한다. 외부 값 `null`·`{}`, pipelineId 누락·숫자,
   definition 누락·null, steps/gates 누락·비배열·비문자열 원소, expectedVersion 누락·null·
   문자열·-1·1.5·2_147_483_647을 각기 유효한 기본 입력에서 한 항목씩 바꾼다.
   구조상 유효한 빈 steps와 존재하지 않는 pipelineId는 의미 오류로 따로 거부를 확인한다.
2. 정상 baseline 0 저장: 정의 version 1, 실행 버전 1개. baseline 0 재요청: stale·무쓰기.
3. 같은 정의를 baseline 1로 재저장: 정의 version 2, 실행 버전의 ID·본문·개수 불변.
4. baseline 2 요청 두 개를 동시에 보낸다. 하나는 원래 gates, 하나는 `gates: []`이다.
   성공 1·stale 1, 정의 version 3을 요구한다. 승자의 저장된 정의를 읽어 실행 graph와
   대조한다. 실행 버전 수는 원래 graph가 이기면 유지, 다른 graph가 이기면 하나 증가한다.
5. 승자 정의를 다음 응답 유실 시험의 payload로 사용한다. 경합 순서에 따른 임의 결과를
   원래 graph가 반드시 이겼다고 가정하지 않는다.

정의 증가는 해당 pipeline의 `PipelineDefinition`으로, 실행 버전 재사용은 별도 행
snapshot으로 판정한다. 공유 helper·제품 코드는 수정하지 않는다.

### TASK-SVC-02: 전송·실패·권한·기존 HTTP 사례 보존

- satisfies: REQ-SVC-001, REQ-SVC-003, REQ-SVC-004
- preserves: INV-SVC-001
- governed-by: CON-SVC-001, CON-SVC-002
- verified-by: VFY-SVC-02, VFY-SVC-03

**전송과 권한.** `post`에 실제 대상 path를 전달하고, 위 산출물 표의 filename+export로
Action ID를 찾는다. `/settings/tokens`에 모든 Action을 보내거나 이름만 일치하는 entry를
선택하지 않는다. `encodeReply`가 반환한 문자열/FormData와 content-type 처리는 유지한다.
응답은 status·body와 `x-action-redirect`/`location`을 보관하고 자동 redirect를 따르지 않는다.

| 요청 조건 | 기대 응답과 검증 |
| --- | --- |
| owner의 정상 저장/백로그 변경 | HTTP 200, Action 성공 결과와 정확한 DB 변경 동시 확인 |
| owner의 invalid/stale | HTTP 200, 해당 error/stale 내용과 snapshot 불변 |
| foreign 사용자로 owner 자원 요청 | 404 또는 실제 `NEXT_HTTP_ERROR_FALLBACK;404` 응답. 500·단순 무쓰기만으로 통과 금지 |
| 무세션 | `x-action-redirect` 또는 Location의 `/login` 목적지. 응답 형식은 설치 버전으로 확인; 다른 200 body의 `/login` 문자열만으로 통과 금지 |
| 미선택/연결 해제/Free 저장 | 유효한 payload에서도 실제 접근/플랜 reason이 반환되고 snapshot 불변. 입력 오류 reason으로 대체 금지 |

백로그의 malformed key·foreign·익명·열린 항목 보호·정상 제목 변경·soft removal을
보존한다. 현재 `feature` form 값은 null 정규화이므로 타입 변경 검증을 추가했다고
주장하지 않는다. 위 권한 대조군을 파이프라인 저장에도 각각 실행한다.

**응답 유실.** proxy는 요청 경로·body·인증을 유지하고 upstream host/origin을 일치시킨다.
`before`는 upstream 호출 횟수 0과 snapshot 불변, `after`는 upstream 호출 1·응답 body
소비 완료 후 연결 단절과 정의 version 3→4를 확인한다. payload는 승자 정의이므로
실행 버전은 재사용한다. proxy가 upstream 오류를 단순 연결 단절로 숨겼는지도 로컬
상태로 확인한다. client는 두 경우 모두 실패하며 자동 재전송하지 않는다.

**GET.** report와 event를 준비한 뒤 네 route의 actual body·anchor와 매 GET 전후 snapshot을
검증한다. 문구를 맞추려고 UI를 수정하지 않는다. History Items와 Events 각각에서
전체 report href를 확인하며 둘 중 하나만 맞아도 통과하는 OR 조건을 제거한다.

**자원 수명.** 아래 변경은 REQ-SVC-004를 충족하는 로컬 정리이며 범용 child 관리
재설계가 아니다. 환경을 변경하기 전부터 단일 try/finally로 보호하고 자원 획득 여부를
기록한다. URL·manifest/Action 구조를 검증한 다음 DB fixture와 child를 준비한다.

- `fixture`는 User→Subscription→Project→Workspace→BacklogItem→BoardItem만 사용하는
  것을 확인했다. 로컬 transaction wrapper에서 `db.$transaction(tx => fixture(tx as
  Parameters<typeof fixture>[0], options))`로 호출하고 성공한 결과의 userId를 즉시 등록한다.
  타입 단언은 이 helper의 model delegate 사용 범위로만 제한하며 root `$transaction` 등은
  transaction client에서 호출하지 않는다. 실패 시 부분 생성은 rollback한다.
- owner 결과 등록 후 foreign 생성을 시작한다. foreign 실패로 owner ID가 정리 목록에서
  빠지지 않아야 한다. 공유 support.ts 자체는 수정하지 않는다.
- fetch·body 소비는 요청별 20초 AbortSignal로 제한한다. Next spawn `error`와 exit를
  처리하고 startup deadline을 둔다. 점유된 고정 포트의 타인 프로세스를 종료하지 않는다.
- 정리는 proxy·자기 Next child·fixture 삭제·pool disconnect를 개별 시도하고 실패를 모은다.
  child 종료는 5초 TERM 대기 후 같은 child handle만 KILL하고 다시 5초 내 종료를 확인한다.
  proxy 미시작 상태도 처리한다. 실패를 숨기거나 무한정 기다리지 않는다.
- `DATABASE_URL` 복원은 가장 바깥 finally에서 보장한다. 주 실패와 정리 실패가 있으면
  둘 다 비밀 값 없이 진단하고 비정상 종료한다. 정리 성공이 시험 실패를 덮어쓰지 않는다.

### TASK-SVC-03: 수동 실행 연결과 결과 기록

- satisfies: REQ-SVC-001, REQ-SVC-002, REQ-SVC-003, REQ-SVC-004
- preserves: INV-SVC-001
- governed-by: CON-SVC-001, CON-SVC-002
- verified-by: VFY-SVC-01, VFY-SVC-02, VFY-SVC-03, VFY-SVC-04

`package.json`에 다음 **제안 명령**을 추가한다.

아래는 병합할 부분 객체이며 기존 `scripts` 객체 전체를 교체하지 않는다. 현재 같은 key는 없다.

```json
{
  "scripts": {
    "test:acceptance:backlog-pipeline": "node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-src-clean-code-fourth-pass.ts"
  }
}
```

`verification.md`의 저장소 스크립트 목록에 이 진입점, fresh build·격리 DB·포트
55449/55450의 선행 조건, 백로그 Action·파이프라인 저장 계약 변경 시 수동 실행해야 함을
명시한다. npm alias는 실행 발견성을 개선할 뿐 자동 CI 검증이라고 적지 않는다.
기존 check·test:scripts·server-integration 및 Windows job은 변경하지 않는다.

정리 결과는 이 문서의 분류와 결과 표에 갱신한다. 합의한 Core가 끝나도 보류 후보를
임의로 삭제하거나 모든 리허설의 유효성이 검증됐다고 기록하지 않는다.

## Verification Plan

### VFY-SVC-01: 입력·변경 범위 대조

- verifies: REQ-SVC-001, REQ-SVC-002, REQ-SVC-003, REQ-SVC-004
- category: static / contract
- state: Planned

현재 schema와 실제 리허설 payload를 TASK-SVC-01의 전체 invalid 목록에 대해 대조한다. 성공 요청의 parse 성공, 각 invalid
필드의 독립 거부, 정의·실행 버전 분리, 보존 행렬의 각 사례가 수정 후에도 존재함을
확인한다. payload만 통과한 결과로 DB 권한·경합·HTTP 성공을 선언하지 않는다.
git diff가 허용 네 파일 안에 있고 제품·fixture·migration·CI·기존 테스트 검색 패턴은
불변이어야 한다. schema 진단은 아래 과거 재현과 현재 구현 검증을 구분해 기록한다.

### VFY-SVC-02: 실제 Next 저장·경합·응답 유실

- verifies: REQ-SVC-001, REQ-SVC-002, REQ-SVC-003
- category: HTTP / integration
- state: Planned

최신 dev의 의존성과 Prisma client를 준비하고 격리 test DB에 migration을 적용한 뒤
fresh build를 생성한다. `TEST_DATABASE_URL`은 기존 검증기가 허용하는 별도 DB여야 한다.
구체 URL은 안전한 실행 환경에서 제공하며 문서에 저장하지 않는다.
실행 shell은 Bash/zsh, 저장소 루트 기준이다. TEST_DATABASE_URL은 안전한 환경에서
export되어 있어야 한다. `validateTestDatabase`로 먼저 분리를 확인하며 값을 출력하지 않는다.
BUILD_ID와 manifest가 같은 fresh build에서 생성됐는지 확인하고 Node/Next 실제 버전을
기록한다. 다른 checkout의 `.next`나 node_modules를 공유하여 실행 증거를 만들지 않는다.

```bash
npm ci
npm run db:generate
npm run test:server:integration
env DATABASE_URL="$TEST_DATABASE_URL" npm run build
```

`test:server:integration`은 전용 URL을 검증한 뒤 child에만 DATABASE_URL을 전달한다.
build에도 위처럼 child 환경만 지정한다. rehearsal의 부모 DATABASE_URL을 test URL과
같게 export하면 기존 분리 검증이 거부하므로 그렇게 설정하지 않는다.

수정 전 baseline은 이미 재현한 schema 거부와 소스 대조 결과로 기록한다. 초기화·정리
결함이 있는 이전 리허설 전체의 실행을 필수 선행 조건으로 두지 않는다. 과거 전체 인수
미실행을 실패 실행으로 꾸미지 않는다. 수정 후 필요한 fresh build를 확인하고 새 명령으로 실행한다.

```bash
npm run test:acceptance:backlog-pipeline
```

마지막 명령은 TASK-SVC-03 구현 후 사용한다. URL을 준비하지 않은 채 명령을 실행하거나
기존 운영 URL로 대체하지 않는다. 수정 전 확인한 불일치와 수정 후 실제 실행의 실패를
구분해 기록한다. 기존 실패를 숨기려고 assertion을 삭제하지 않는다.

기대 결과: 최초 정의 0→1, stale 무쓰기, 같은 graph의 정의 증가·실행 버전 재사용,
동일 baseline의 성공 1·stale 1, 연결 단절 전 무쓰기·commit 후 한 번 저장, 올바른
payload의 권한/플랜/가용성 거부가 모두 통과한다. 실행 버전이 증가하는 경우에는
실제 저장 graph가 일치해야 한다. 전체 리허설 종료 코드는 0이어야 한다.

### VFY-SVC-03: 백로그·GET·정리 회귀

- verifies: REQ-SVC-004
- category: HTTP / integration
- state: Planned

VFY-SVC-02의 같은 실제 실행에서 multipart malformed·익명/타인·열린 항목 제거 거부,
정상 단일 대상 변경과 Board/History/pipeline GET·report URL을 확인한다. 각 GET 전후
명시한 관측 대상 DB 상태가 동일해야 한다. 정상 실행 외에 임시 사본에서 다음 실패를
각각 주입한다: manifest preflight 실패, 두 번째 fixture의 transaction 중간 실패,
child startup 실패, 생성 완료 후 assertion 실패, fixture 정리 한 단계의 실패.
각 경우 원래 실패가 비정상 종료로 남고 이미 생성한 ID는 정리되며 나머지 정리·pool
disconnect·환경 복원이 시도되어야 한다. 의도적으로 실패시킨 삭제는 해당 ID를 이용해
별도 정리하고 이를 실패 주입 결과와 함께 기록한다. timeout 경로는 임시 사본의 deadline을
줄여 abort·자기 child 종료가 유한 시간 내 일어나는지 확인한다. 실패 주입 변경은 최종
diff에 포함하지 않는다. 단순 성공 실행만으로 실패 정리를 통과 처리하지 않는다.

### VFY-SVC-04: 저장소 게이트와 문서 연결

- verifies: REQ-SVC-001, REQ-SVC-002, REQ-SVC-003, REQ-SVC-004
- category: regression / architecture / build / documentation
- state: Planned

아래는 변경에 필요한 저장소 게이트이며, 각 요구사항의 행동 증거는 VFY-SVC-02/03이
담당한다. 이 게이트 통과만으로 실제 HTTP 인수 완료를 선언하지 않는다.

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm run test:server
npm run test:server:integration
env DATABASE_URL="$TEST_DATABASE_URL" npm run build
git diff --check
```

`check`의 lint·타입·test:scripts·docs:check를 확인한다. 새 alias는 parsed package.json에서
문서의 값과 비교하고 나머지 scripts key/value가 기준과 동일한지 확인한다. 허용 네 경로의
집합을 기준으로 tracked diff와 untracked 파일을 모두 확인한다. `git diff --check`만으로
미추적 제안서가 검사됐다고 보고하지 않는다. 위 준비/인수 단계에서 동일
최종 코드로 이미 성공한 명령은 이유 없이 재실행하지 않는다. 새 테스트를 만드는
것보다 기존 실제 리허설과 관련 서버 통합 검증을 우선 사용한다.

## Readiness and Stop Conditions

**Core 구현 및 검증 완료.** 아래 조건을 준수하여 구현했고, 실제 실행 결과는
Verification Results의 구현 후 기록을 따른다. 미래 변경에는 같은 중단 조건을 적용한다.

| 조건 | 영향·해소 기준 | 중단 지점 |
| --- | --- | --- |
| 승인과 기준 재확인 | 승인 범위가 Core 네 파일인지 확인하고 최신 dev에서 인용 계약을 재대조 | 코드 편집 전 |
| 격리 DB·현재 build·포트 | 별도 test DB, 최신 의존성/Prisma, fresh build, 사용 가능한 loopback 포트 확보 | 실제 HTTP/DB 실행 전; 미준비 시 완료 주장 금지 |
| 허용 범위 밖 수정 필요 | 제품·fixture·CI 수정 또는 추가 삭제가 필요하면 이유와 영향 파일을 문서에 반영 | 해당 편집 전 |
| 의미 있는 검증 실패 | 입력·권한·경합·응답 유실 중 하나라도 예상과 다르면 원인을 분류 | 통과 기준 완화·삭제로 진행 금지 |

### BLK-SVC-01: 추가 리허설 삭제의 대체 근거 미확보

- classification: downstream
- evidence: 차수별 HTTP, Flight, 브라우저, DB migration 사례의 전체 대응표·최신 실행 증거 없음.
- impact: fifth-pass·slots·baseline 등 보류 항목을 삭제·통합하면 검증을 잃을 수 있음.
- resolution: 후보별 사례 → 대체 경로 → 동등한 실행 환경 → 실제 결과를 기록하고 변경 목록 확정.
- stop condition: 근거 없는 삭제·통합 금지. 이 조건은 Core 계약 복구를 막지 않음.

## Verification Results

문서 작성 중 수행한 조사와 향후 구현 검증을 분리한다.

| 증거 | 상태 | 결과와 한계 |
| --- | --- | --- |
| 원격 main/dev 존재 확인, dev fetch | Executed | 두 보호 ref 확인. 이번 정합화 기준 `5958555` 확보; 최초 작성 기준은 `c6e2fd3` |
| scripts 파일 집합·명령·workflow·문서 대조 | Executed | 5958555에서 49개·테스트 16개·6,941줄. D3 폐기·브라우저 절차·서버 CI·core 이동의 선행 완료 확인 |
| 이전 저장 입력의 schema 검사 | Executed | 최초 checkout에서 old payload 거부, `pipelineId`·`definition` 누락 진단. 현재 필드 형식은 parse 성공. DB/HTTP 실행 아님 |
| 기준 간 관련 소스 비교 | Executed | 최초 조사→c6e2fd3 동일. 5958555에서 core 경로 변경을 확인하고 현행 import·schema·저장 알고리즘을 다시 대조 |
| 최초 작성의 SDD traceability 검사 | Historical | 당시 standard PASS, REQ/Task/VFY 4/4. 이번 수정 이후 결과는 아래 정합화 검증으로 구분 |
| 최초 작성의 파일 분류·문서 구조 | Historical | 당시 inventory 49/49, 상대 링크 15개, fence 균형 통과. 현재 문서는 다시 검사 |
| 최초 작성의 문서 검사·metadata | Historical | 당시 미추적 제안서 포함 Markdown 138개·링크 532개·보고서 34개, 문제 0. 현재 수치로 재사용하지 않음 |
| 저장 service의 독립 대조 | Executed | 5958555의 실제 save-definition 소스를 TypeScript transpile+VM으로 실행하고 IO만 대체: 최초 정의/실행 1/1, 같은 graph 2/1, stale 2/1, 변경 graph 3/2. 실제 DB·HTTP·잠금 증거는 아님 |
| 현재 source 의미 대조 | Executed | auth→schema→owner/project lock→정의/실행 저장→revalidation, 네 GET body와 report href, 부분 fixture rollback·독립 cleanup의 구현/검증 목적지를 대조 |
| VFY-SVC-01~04의 구현 후 검증 | Executed | 아래 실제 구현 검증 기록 참조. 제품 코드·운영 DB·모델·Windows runtime 변경 없음 |

문서 검사 재현 명령:

```bash
python3 /Users/hamsangeok/.codex/skills/write-sdd-spec/scripts/validate_sdd_traceability.py docs/proposals/completed/2026-10-23-scripts-validation-cleanup.md
```

위 skill 경로는 작성 환경의 설치 위치다. 다른 환경에서는 설치된 동일 skill의 경로로
실행한다. 저장소 `docs:check`는 추적 파일만 읽으므로 이번 미추적 제안서는 검사 API의
파일 목록에 직접 포함했다. staging 없이 새 문서까지 검사한 결과이며 구현 gate 결과가 아니다.

### 구현 후 검증 기록 — 2026-10-23

구현 기준은 `dc03640b7b097c11ba98b39609d33609b6388754`이며 계획 기준 5958555와
추적 파일 내용이 동일했다. 구현 branch는 `harness/scripts-validation-implementation-20261023`다.
환경은 macOS arm64, Node 26.4.0, Next 16.4.2, Prisma 7.10.1, 별도 데이터 디렉터리와
loopback 포트의 PostgreSQL 18.4다. 새 worktree에서 `npm ci`와 Prisma 생성을 수행했고
기존 checkout의 node_modules·build·운영 DB를 사용하지 않았다.

| 검증 | 실제 결과 | 범위와 한계 |
| --- | --- | --- |
| `npm run verify:fsd`, `npm run verify:server` | PASS | 예외 추가 없음 |
| `npm run test:architecture` | 148 pass, 0 fail, 2 skip | Windows native 시험 2개는 macOS에서 실행하지 않음 |
| `npm run check` | PASS: lint·typegen·tsc·문서 검사·195 pass, 0 fail, 2 skip | 기존 Windows skip; 최종 기록은 아래 완료 검사와 함께 확인 |
| `npm run test:server:integration` | 139 pass, 0 fail, 0 skip | 격리 DB migration 후 실제 PostgreSQL 시험 |
| `npm run build` | PASS | Next 16.4.2 fresh build, TypeScript, 정적 페이지 25개 |
| `RDC_CHECK_ACTION_MANIFEST=true SRC_CHECK_INBOX_MANIFEST=true npm run test:server` | 148 pass, 0 fail, 0 skip | fresh Action 및 inbox manifest 검사 포함 |
| `npm run test:acceptance:backlog-pipeline` | PASS | 실제 인증·세 Action·definition/executable 버전·동시 stale·두 응답 유실 경계·네 GET body·두 History href |
| 임시 사본의 실패 주입 7종 | 7/7 PASS | 아래 실패 유형별 종료·환경 복원·fixture·포트 검사 |
| 범위·본문 검사 | PASS | package의 새 key 하나 외 기존 명령 불변, 제품·공용 fixture·migration·lockfile·CI 불변 |

실패 주입은 저장소 밖 임시 사본에서만 수행했다. manifest preflight, 두 번째 fixture의
transaction 도중 실패, Next spawn 실패, startup 후 assertion, fixture 삭제 한 단계 실패,
요청 timeout, SIGTERM을 무시하는 자기 child의 SIGKILL 전환을 각각 검증했다.
모두 exit 1로 실패를 보존하고 `DATABASE_URL` 복원과 나머지 정리를 확인했다.
삭제 실패 사례는 남은 자기 userId 하나를 진단에 남겼고 그 ID만 검증 절차에서 정리했다.
각 사례 종료 후 test DB의 User 수는 0, 두 HTTP 포트는 다시 bind 가능했다.
테스트용 fault 파일·실행기·symlink는 Git 변경에 포함하지 않았다.

최종 리허설 소스 SHA-256: `0a4570a42c1a2916df9d367dbac3e3016fdc333c44b09b7d4a301d19b7dddf34`.
마지막 코드 수정은 startup stdout이 chunk 경계에서 나뉘어도 Ready 신호를 읽도록
512자 버퍼를 둔 것이다. 그 뒤 정상 HTTP 인수와 실패 주입 7종을 재실행하여 통과했다.
제품 build 입력은 바뀌지 않았으며 최종 lint·타입·저장소 게이트로 script를 확인했다.

### PR 제출 준비와 최신 dev 재검증 — 2026-10-26

사용자의 `dev` 대상 PR 게시 요청에 따라 원격 main/dev를 확인하고 최신 dev
`105100232119381a2729a847fad2fac5ea504820`에서
`harness/scripts-validation-pr-20261026`을 만들었다. 기존 구현 worktree의 스테이징된
네 파일을 새 worktree에 적용했고 원래 작업 폴더와 승인 대기 사본은 보존했다.
위 2026-10-23 결과는 당시 실행 기록이며 아래 표는 이번 PR 제출 전 재실행 결과다.

리허설 소스의 SHA-256은 위 기록과 동일하다. 저장 Action·서비스·공유 fixture·관련
화면의 구현 계약도 기존 구현 기준과 동일했다. 최신 package.json의 기존 명령을 모두
보존하고 `test:acceptance:backlog-pipeline` 하나만 추가했다. 제품 코드·의존성·CI 변경은 없다.

새 worktree에서 `npm ci`, Prisma 생성을 실행했다. 환경은 macOS arm64,
Node 26.4.0, Next 16.4.2, Prisma 7.10.1, PostgreSQL 18.4다. 별도 데이터 디렉터리와
loopback 포트의 새 PostgreSQL 인스턴스에 전용 `stagekeeper_test_*` DB를 생성했다.
운영 환경 파일·DB는 사용하지 않았으며 다른 checkout의 의존성이나 build를 공유하지 않았다.

| 검증 | 이번 결과 | 범위와 한계 |
| --- | --- | --- |
| `npm run verify:fsd`, `npm run verify:server` | PASS | 기존 경계와 예외 목록 보존 |
| `npm run test:architecture` | 148 pass, 0 fail, 2 skip | Windows native 시험 2개는 macOS에서 skip |
| `npm run check` | PASS; 195 pass, 0 fail, 2 skip | lint·타입·문서·도구 시험. 기존 `plugin/runtime/codex-main-loop-tools.mjs`의 `_key` unused 경고 1개 유지 |
| `npm run test:server:integration` | 146 pass, 0 fail, 0 skip | 새 격리 PostgreSQL에서 migration과 전체 통합 시험 |
| `npm run build` | PASS | 새 production build와 TypeScript, 정적 페이지 33개 |
| `RDC_CHECK_ACTION_MANIFEST=true SRC_CHECK_INBOX_MANIFEST=true GITHUB_CHECK_ACTION_MANIFEST=true npm run test:server` | 165 pass, 0 fail, 0 skip | 최신 dev의 추가 manifest 검사까지 활성화 |
| `npm run test:acceptance:backlog-pipeline` | PASS | 실제 HTTP 저장·경합·응답 유실·권한·GET·보고서 링크 |
| 실행 후 자원 확인 | PASS | 테스트 User 0개, 55449/55450 재바인딩 성공, 자기 PostgreSQL 인스턴스 종료 |

실패 주입 7종은 소스가 동일한 2026-10-23 실행 증거를 보존하며 이번에는 재실행하지 않았다.
이번 작업 범위는 커밋·push·`dev` 대상 PR 게시까지이며 PR 병합·릴리스 승격은 포함하지 않는다.

## Reconciliation Notes

이번 요청은 prior-result replay가 아닌 `reconciling-proposals-with-codebase` 전체 검토다.
최초 문서에는 개선점이 있었다. 기준 리비전·core import, fixture/관측 대상, 권한 응답,
Action/HTML 산출물, 부분 실패 정리, 명령 실행 순서를 함께 정합화했다. 제품 동작이나
Core 네 파일 경계는 바꾸지 않았다.

Review Profile은 High-Risk다. 제품 변경은 없지만 실제 DB 무결성·인증·생성된 Action
manifest·응답 body와 정리 경계를 검증하는 계획이기 때문이다. 수정한 pass 자체를
clean pass로 취급하지 않는다. 마지막 저장본에 대한 INV-1~INV-7 무수정 검토와
Coverage Stability Check 결과·파일 식별자는 최종 응답의 receipt로 제공한다.
당시 미실행이던 최신 환경의 DB/HTTP 인수는 이후 VFY-SVC-02/03에서 실행했다.
그 결과는 위 구현 후 기록에 구분했다.

## Risks and Rollback

- 남겨 둔 수동 리허설 전체가 최신 의존성에서 정상 동작한다고 보장하지 않는다.
  이번 완료 주장은 Core의 계약과 보존 행렬로 제한한다.
- 고정 포트·Next 내부 전송 모듈 의존은 유지된다. deadline과 소유한 child 정리로
  실패를 유한 시간 내 드러내며 실행 환경 실패와 제품 회귀를
  분리하여 기록한다. 이 계획을 실행 환경 재설계로 확대하지 않는다.
- 입력 schema를 통과하는 것과 실제 서비스 저장 성공은 다르다. `pipelineId: null`
  신규 생성의 name 요구나 실행 graph 규칙을 schema 결과만으로 판단하지 않는다.
- 이번 검토에서는 선택한 제안서만 갱신한다. 원래 checkout의 사용자 변경과 다른
  작업 branch/worktree를 정리하거나 덮어쓰지 않는다.

롤백은 구현 커밋의 네 파일 변경을 되돌린다. 제품·schema·migration·운영 데이터를
수정하지 않으므로 운영 데이터 역이관은 없다. 정상 cleanup 실패 시에는 해당 실행이
생성한 fixture ID와 프로세스만 확인해 정리하며 DB reset·타인 process 종료를 사용하지
않는다. 롤백 후 `git diff --check`와 기존 실행 명령 연결을 다시 확인한다.

## Completion or Closure Notes

2026-10-23 Core 구현과 검증을 완료했다. 제안서 작성·정합화 결과와 실제 구현 증거를
위 표에서 구분한다. 코드 변경은 fourth-pass 리허설, npm 진입점, 검증 절차 문서에
한정했고 이 제안서는 완료 기록으로 이동했다. 추가 삭제·통합·운영 실행·PR 병합은 수행하지 않았다.

Core 완료에는 승인 범위 내 네 파일 변경, VFY-SVC-01~04의 실제 결과, 고유 사례 보존,
partial fixture rollback·실패/timeout의 독립 cleanup·환경 복원, owner/foreign 및 다른
pipeline 대조군 보존, 각 GET의 실제 body와 report anchor, 정확한 명령 문서화가 필요하다. 변경 파일 수나 삭제 줄 수는
완료 기준이 아니다. 완료 시 front matter와 이 절에 최종 커밋·실행 환경·잔여 보류를
기록하고 저장소 규칙에 따라 `completed/`로 이동한다.

보류 후보에 착수하려면 이 문서의 후보·영향 파일·대체 증거를 구체화하고 해당 범위의
승인을 기록한다. Core 완료가 후속 삭제나 PR 병합을 자동 승인하지 않는다.

## Review Checklist

- [x] 최초 checkout과 최신 dev의 차이를 구분했고 이미 완료된 작업을 재계획하지 않았다.
- [x] 49개 현재 파일을 빠짐없이 분류하고 유지와 실행 성공을 구분했다.
- [x] 사용자 요청과 현재 구조를 근거로 범위를 정했으며 새 구조·runner를 만들지 않았다.
- [x] 입력뿐 아니라 정의 버전과 실행 버전의 의미 차이를 작업에 반영했다.
- [x] 독립 pipeline·타인·익명 대조군과 명시한 DB snapshot 범위를 지정했다.
- [x] manifest 선택·실제 route·본문·보고서 href의 최종 검증 위치를 지정했다.
- [x] 초기화·부분 생성·정리 실패·timeout과 부모 환경 복원 경로를 작업·검증·완료 기준에 연결했다.
- [x] HTTP·DB·브라우저·Flight 검증의 대체 한계를 기록했다.
- [x] Core 요구사항·작업·검증 연결과 허용 파일·중단 조건을 명시했다.
- [x] 보류 후보의 미확인 사항이 독립적인 Core를 막지 않도록 분리했다.
- [x] 작성 승인과 구현 승인을 구분하고 운영 실행을 제외했다.
- [x] 구현 후 실제 HTTP·DB 인수와 필수 저장소 게이트를 통과했다.
