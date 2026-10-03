---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-03"
approved-by: "user:Sangeok"
approved-at: "2026-10-04"
approval-scope: "F4-01~10 실제 코드 구현·검증·commit 및 dev 대상 PR 제출"
completed-at: "2026-10-04"
verification-summary: "F4-01~10 구현 완료. FSD/check/web/server/fresh manifest/build/core, 격리 DB 통합 95건, 실제 Next HTTP 및 headless Edge UI 25건 통과. 상세 결과는 연결된 인수 보고서 기준."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/test-reports/completed/2026-10-04-src-clean-code-fourth-pass.md"
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/protocol.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-10-01-src-clean-code-third-pass.md"
  - "docs/proposals/active/codex-dual-client-support.md"
---

# src 클린코드 4차 검토 — 개선 제안 10건

## Summary

`frontend-clean-code-orchestrator`에 따라 `src`를 응집도·결합도·예측 가능성·가독성·TypeScript 일반의 다섯 독립 관점에서 검토했다. 중립 품질 게이트가 원시 발견 11개를 현재 코드와 대조하여 **10건을 채택했다: Must 2건, Should 7건, Consider 1건.** 토큰 ID와 백로그 key의 런타임 검증 누락은 같은 원인을 가진 한 작업으로 병합하고, 두 영역의 근거와 영향을 보존했다.

먼저 처리할 항목은 **F4-01 단일 대상 쓰기의 식별자 검증**과 **F4-02 파이프라인 저장 중 편집 잠금**이다. 나머지는 오래된 탭의 저장 기준, 클라이언트별 행동 안내, 화면 조립의 소유권, 조회·props·테스트 결합, 폼 상태 전환을 개선한다. 원래 검토는 정적 코드 검토와 제안서 작성이었다. 해당 계약을 구현하고 아래 실행 검증 및 Implementation Completion에 결과를 기록했다.

**후속 코드 대조에서 처음 문서에 보완할 점이 있었다.** 변경 파일·public API·시험 목적지가 일부 미정이었고, 기본 그래프 물질화 경쟁, 저장 결과 불명, handoff fixture, 실제 React harness, picker의 editing 보존 규칙이 충분히 명시되지 않았다. 아래 계약과 inventory로 이를 구체화했다. 최초 렌즈 리뷰의 10건·심각도는 유지하며, 이 보완은 코드 구현이나 제품 지원 인증을 뜻하지 않는다.

2026-10-04의 반복 요청도 이전 판정의 재사용이 아닌 전체 재검증으로 진행했다. **이번 시작 문서에도 개선할 점이 있었다.** F4-01 검증표의 포괄적 read-only 거부 표현, F4-03과 canonical 저장 경합 문구의 충돌, 환경변수로 활성화되는 fresh manifest 검사의 실행 경로 누락을 아래 요구·검증·DoD에 반영했다.

| ID | 심각도 | 개선 항목 | 기여 관점 |
| --- | --- | --- | --- |
| F4-01 | Must | 토큰 ID·백로그 key를 쓰기 전에 런타임 검증 | TypeScript generalist |
| F4-02 | Must | Pipeline 저장 중 모든 draft 변경·Discard 잠금 | Predictability |
| F4-03 | Should | Pipeline 저장 입력에 편집 기준 version 포함 | Predictability |
| F4-04 | Should | Codex 안내·복사에서도 handoff의 커밋 전제 보존 | Predictability |
| F4-05 | Should | Board/History 화면 조립을 각 page slice로 모으기 | Cohesion |
| F4-06 | Should | 클라이언트 목록·명령 계약과 공통 안내 연결 | Cohesion |
| F4-07 | Should | 연결 컨트롤의 조회·props를 대상 projection으로 축소 | Coupling |
| F4-08 | Should | 주요 UI 상호작용 시험을 실제 React 동작에 연결 | Coupling |
| F4-09 | Should | 저장소 입력 방식의 상태 전환 규칙을 한곳에 표현 | Readability |
| F4-10 | Consider | Resume input을 실제 사용하는 네 필드로 제한 | Coupling |

## Goal

- 단일 토큰·백로그 조작의 대상 범위와 저장 중 draft의 수명을 명확하게 보장한다.
- 이름·입력·타입에서 저장 기준과 다음 행동의 전제를 파악할 수 있게 한다.
- 같은 변경 책임의 화면 모델·조회·테스트를 가까이 두고, 사용하지 않는 모델과 구현 세부사항의 변경 파급을 줄인다.
- 후속 작업을 항목별로 적용·검증할 수 있도록 코드 근거와 보존 동작을 기록한다.

## Proposal Size

`proposal-size`: standard.

Server Action 입력, 토큰·백로그 mutation, 저장 API 계약, page의 server public API, 다섯 개 이상의 파일에 영향을 준다. F4-08은 기존 ReactDOM·esbuild 브라우저 fixture를 확장하며 새 시험 라이브러리를 추가하지 않는다. 문서 템플릿의 `standard` 크기와 reconciliation의 **High-Risk** 검증 profile은 별개다. 후자는 인증·데이터 무결성·경합·최종 화면 본문을 다루기 때문에 적용한다.

## Current State

### 검토 기준

- 작성일: 2026-10-03.
- 작업 트리 브랜치: `harness/codex-dual-client-support`.
- HEAD: `aef6353776b9d481380b06e397594225fcf43725`.
- 설치된 버전: Next.js 16.3.3, React 19.2.8, TypeScript 5.9.3, Prisma 7.10.0.
- 설정: TypeScript `strict`, `noEmit`, `moduleResolution: bundler`; `@/* → src/*`, `@harness/core/* → packages/core/*`.
- 현재 구조의 기준은 [architecture README](../../architecture/README.md), [FSD](../../architecture/fsd.md), [검증 규칙](../../architecture/verification.md)이다. 완료 제안서는 배경 자료로 참조했다.

| 검토 영역 | 텍스트 파일 | 줄 수 |
| --- | ---: | ---: |
| `src/app` | 28 | 800 |
| `src/fsd` | 197 | 9,034 |
| `src/server` | 98 | 7,990 |
| `src/proxy.ts` | 1 | 5 |
| 합계 | **324** | **17,829** |

위 합계에는 인접 테스트 **81개·6,635줄**이 포함된다. Prisma 생성물 28개는 역할·import 경계와 주장에 필요한 생성 계약만 확인했다. 생성물과 `src/app/favicon.ico`는 수동 개선 대상에서 제외했다. TypeScript 관점은 CSS 한 파일을 규칙 비해당으로 구분하여 코드·테스트 323개를 검토했다.

검토 대상 텍스트의 SHA-256은 다음과 같다. `rg --files src`의 대상에서 generated/favicon을 제외하고 POSIX 상대 경로를 ordinal 순으로 정렬한 뒤, 각 `UTF-8 경로 + NUL + 원본 파일 바이트 + NUL`을 차례로 해시했다.

```text
be42422efb8b468880cf17f3e7a45bf717ac7687f35b8867cfb08e5c85979ba7
```

### 검토 방식과 판정 기준

다섯 렌즈는 각각 지정된 sibling skill을 읽고, 다른 렌즈의 결과를 받지 않은 독립 컨텍스트에서 동일한 대상과 프로젝트 정보를 검토했다. 동시 실행 용량에 맞춰 두 배치로 진행했다. 별도의 중립 게이트는 substantive lens skill 없이 다섯 원본 출력의 주장·인용 코드·설정·로컬 문서를 대조했다. 게이트가 `src` 전체를 다시 전수 검토했다는 의미는 아니다.

- **Must:** 현재 코드에서 가능성이 높은 동작 결함·위험한 부작용으로 우선 수정할 항목.
- **Should:** 유지보수·시험·결합·행동 추론에 유의미한 비용을 주는 항목.
- **Consider:** 영향이 국소적이고 작은 변경으로 줄일 수 있는 낮은 우선순위 항목.

심각도는 입증된 영향에 따라 정했다. 스킬의 HARD/DEFAULT/OPTIONAL 표기나 여러 관점의 동의 수로 심각도를 높이지 않았다. 최초 렌즈 리뷰의 게이트는 **1라운드**로 끝났으며, 당시 발견의 기각·수정 요청·추가 검증 대기는 없었다. 이후 proposal reconciliation의 문서 보완은 별도 기록으로 구분한다.

## Scope

포함 범위는 `src/app`, `src/fsd`, `src/server`, `src/proxy.ts`의 현재 작성 코드와 인접 테스트에서 채택된 F4-01~F4-10이다. `packages/core`, Prisma schema·생성 타입, 설치된 Next 문서는 주장과 변경 경계를 확인하는 보조 근거다.

현재 구현 계획의 **Core는 F4-01~F4-10**이다. Consider는 낮은 우선순위를 뜻하며 완료 기준에서 제외하지 않는다. 현재 source bundle은 이 문서와 architecture README/FSD/system-overview/verification/protocol 및 product-copy의 적용 절이다. 완료된 3차 제안서는 역사적 배경, dual-client 제안서는 별도 작업의 경계 확인용이다. 이들의 미완료 전체 과제를 이번 계획에 위임하거나 흡수하지 않는다. 후속 수정 범위는 Affected Files의 정확한 manifest다.

후속 수정은 현재 FSD 의존 방향 `pages → widgets → features → entities → shared`, slice public API, `src/app`의 framework composition, `src/server`의 서비스 소유권을 따른다. 새 전역 상태 관리·폴더 체계·대규모 서비스 재설계·의존성 업그레이드·운영 DB 변경은 이 제안의 범위에 포함하지 않는다. Codex의 실제 모델 인수와 배포 완료 여부는 기존 dual-client 제안서·검증 보고서의 별도 과제다.

## Proposal

### Must — F4-01: 쓰기 식별자의 런타임 검증으로 단일 대상 범위 보장

**관점·원시 ID:** TypeScript generalist — TS-01, TS-02. **확신:** 높음.

**토큰 근거:** `src/fsd/features/manage-token/api/manage-token.server.ts:21`, `:23`, `:37`, `:39`, `:43`, `:51`과 `src/fsd/features/manage-user-token/api/manage-user-token.server.ts:34`, `:36`, `:40`은 `tokenId: string`을 런타임 검사 없이 사용한다. `src/server/token-management-query.ts:9`, `:18`, `:19`, `:29`, `:30`은 label만 검사하고 `updateMany`의 ID 조건에 입력을 전달한다.

**백로그 근거:** `src/fsd/features/edit-backlog/api/edit-backlog.server.ts:23`, `:26`, `:35`, `:38`은 key를 검사 없이 서비스에 넘긴다. `src/server/pipeline/board-query.ts:93`, `:100`, `:101`, `:112`, `:116`, `:119`는 열린 항목 여부를 문자열 동등성으로 검사하고 같은 key를 Prisma 조건에 사용한다.

**영향:** 현재 Prisma 계약에서 `undefined`는 조건을 생략하며 객체는 StringFilter로 해석될 수 있다. 잘못된 ID/key가 들어오면 기존 소유 프로젝트·사용자 범위 안의 여러 행이 변경될 수 있다. 토큰 rename은 여러 행을 바꾼 뒤 `count !== 1`이라 실패를 반환하지만 반환 객체 자체로 transaction이 rollback되지는 않는다. 백로그 제거에서는 문자열과 객체/undefined가 같지 않아 열린 항목 보호를 지나고, DB 조건은 넓어질 수 있다. 백로그의 제거는 `removedAt`을 쓰는 논리 제거다.

**확정 계약:** 작은 guard로 `typeof value === "string" && value.trim().length > 0`를 검사하고 원본 문자열을 DB 조건에 쓴다. 식별자를 trim/coerce하거나 새 key 형식 제약을 추가하지 않는다. Action은 기존 인증·인가를 먼저 수행한다. 세 revoke는 `Promise<void>`를 유지하며 invalid ID에는 `Error("Invalid token ID.")`를 던지고 revalidation과 DB 쓰기를 하지 않는다. 세 rename은 `failure("Token not found.")`, 백로그 Action은 `{status:"error",error:"Invalid backlog key."}`를 반환한다. `renameProjectToken`/`renameUserToken` 및 board factory의 `updateBacklog`/`removeBacklog`에도 guard를 두어 직접 호출을 보호한다(서버 실패는 기존 `ServerResult` 모양). 기존 label 검증·소유권 조건·열린 항목 보호·정상 없는 ID의 처리 방식은 유지한다. revoke에는 별도의 public 서비스가 없으므로 현재 Action 본문이 쓰기 경계다.

**로컬 계약:** `src/generated/prisma/models/ProjectToken.ts:208`, `:824`, `models/UserToken.ts:208`, `models/BacklogItem.ts:238`, `:1110`과 `internal/class.ts:19`에서 필터·undefined 생략·빈 previewFeatures를 확인했다. 설치된 Next `01-app/02-guides/data-security.md:310`, `:609`는 Action/DAL의 입력 검증을 요구한다. 실제 DB에서 대량 변경을 재현한 결과는 아니다.

**완료 기준:** 세 종류의 토큰 폐기·이름 변경과 백로그 편집·제거에서 누락/undefined/null/객체/빈 문자열 입력을 **DB 쓰기 0건**으로 거부한다. 정상 입력은 정확히 한 대상만 바꾸고 다른 소유자의 데이터는 유지한다. 정상 열린 백로그 제거는 계속 거부한다.

권한 대조군은 작업별로 구분한다. revokeToken/revokeOwnerToken은 `requireProjectOwner`, revokeUserToken은 `requireUser`를 유지한다. 유효한 자기 토큰은 프로젝트가 미선택·연결 해제 상태이거나 Free여도 계속 폐기할 수 있다. 프로젝트 rename 두 개와 백로그 mutation은 미선택·해제 상태에서 쓰기 0건으로 거부하며, user rename은 프로젝트 가용성과 무관하게 자기 userId 범위에서 허용한다. 익명 호출·다른 소유자 프로젝트 slug는 인증·소유권 경계에서 차단한다. 자기 slug에 다른 scope의 유효 tokenId를 넣은 revoke는 기존 `void`/변경 0건 계약을 유지하므로 오류 반환을 요구하지 않는다. 이 정상적인 범위 제한과 invalid ID의 예외를 구분한다.

누락 인수와 undefined는 직접 Action/서비스 시험, JSON으로 표현 가능한 null·객체·빈 문자열은 fresh-build 실제 Action POST에서도 확인한다. 인증된 정상 POST 대조군을 먼저 통과시켜 transport 거부를 guard의 성공으로 오인하지 않는다. 각 scope에 두 행 이상을 둔 뒤 label/revokedAt/removedAt 전체를 비교하고 invalid 호출의 delegate write 횟수도 0으로 검사한다. 실패 반환을 transaction rollback으로 취급하지 않는다.

`Invalid token ID.`의 정확한 throw는 직접 Action 시험에서 검사한다. 설치된 Next `error.md`의 production 서버 오류 소거 계약 때문에 실제 POST나 error boundary에서 같은 문구의 노출을 필수로 요구하지 않는다. 실제 POST의 invalid 폐기는 인증된 transport 대조군·예외 응답·DB 무변경을 함께 확인한다.

### Must — F4-02: Pipeline 저장 중 draft 변경과 Discard 잠금

**관점·원시 ID:** Predictability — PRE-01. **확신:** 높음; 브라우저 재현 미수행.

**근거:** `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx:65`는 클릭 당시 `state`를 제출한다. `:146`의 Save만 pending으로 잠그고 카드·메뉴·끝의 Add/Move·`:153`의 Discard는 계속 조작할 수 있다. `api/edit-pipeline.server.ts:20`, `:25`는 version 증가 후 경로를 재검증하고, `src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx:38`의 rail key에는 version이 들어간다.

**영향:** graph A를 저장하는 동안 B로 더 편집하면 성공 응답의 새 version이 rail을 remount하여 B를 잃는다. 저장 중 Discard도 이미 제출된 A의 저장을 취소하지 못한다. 설치된 Next `revalidatePath.md:19`의 현재 경로 갱신 계약과 코드의 연결로 확인한 경로다.

**확정 계약:** 제출 직전에 graph snapshot과 ref 잠금을 잡고 pending 동안 Edge/Node Remove·Swap·Add·Move, 이미 열린 메뉴, Discard, 게이트 0개 확인과 Save 재진입을 모두 막는다. `editable && !busy`를 하위 UI에 전달하고 graph 변경·메뉴 toggle·Discard·Save handler에도 guard를 둔다. 같은 이벤트 루프의 연속 클릭은 pending 렌더보다 먼저 ref로 차단한다. success/error/stale 뒤 잠금을 해제하며 rejected Promise는 F4-03의 결과 불명 상태로 처리한다. Automatic scouting은 별도 설정이므로 graph 잠금에 묶지 않는다.

**완료 기준:** 지연된 save 동안 모든 편집과 Discard가 차단되고, 성공 뒤 제출한 graph가 baseline이 된다. 실패하면 기존 draft를 유지한다. `pipeline-rail.test.mjs:12` 이후의 정적 markup 시험만으로 이 비동기 동작을 보장하지 않는다.

### Should — F4-03: Pipeline 저장에 편집 기준 version 포함

**관점·원시 ID:** Predictability — PRE-02. **확신:** 높음.

**근거:** `pipeline-rail.tsx:14`의 save는 graph만 받는다. `edit-pipeline.server.ts:11`, `:18`, `:20`, `:22`는 제출 시점의 latest에 다음 번호를 붙인다. `project-pipeline-page.tsx:11`, `:38`과 `src/app/(app)/p/[slug]/pipeline/page.tsx:25`, `:31`에는 읽은 version이 있지만 저장 입력에 포함되지 않는다.

**영향:** 두 탭이 version 3을 읽고 A가 4를 저장한 뒤 B가 제출하면, B의 오래된 graph가 5로 성공한다. 과거 immutable version은 남지만 이후 신규 항목에 적용할 최신 설정이 오래된 편집으로 바뀐다. 기존 P2002 처리는 같은 번호를 만드는 동시 경쟁만 구별한다.

**확정 계약:** 새 `model/pipeline-save-state.ts`에 `SavePipelineInput = {graph: Graph; expectedVersion: number}`와 `SavePipelineResult = {status:"success";version:number} | {status:"stale"} | {status:"error";reason:string}`를 둔다. `SavePipelineAction`은 입력 하나를 받고 `savePipeline(slug,input)`으로 연결한다. page가 `saved?.version ?? 0`을 rail baseline으로 전달하며 현재 version/plan/editable key는 유지한다. 서버는 원본 input/graph 구조·문자열 배열·expectedVersion을 검사하고 현재 plan의 `validateGraph`를 적용한다. version은 Prisma Int의 다음 값까지 고려해 **0 이상 2,147,483,646 이하 정수**만 허용하며 문자열·null·누락·NaN·소수·음수·범위 초과를 거부한다. 공통 `ActionResult`는 변경하지 않는다.

DB 작업은 새 `src/server/pipeline/version-save-query.ts`의 `savePipelineVersion`으로 옮긴다. server 소유의 구조 타입을 쓰고 입력 version의 같은 정수 guard를 직접 호출에도 적용한다. invalid는 `{status:"error",reason:"Invalid pipeline save request."}`이며 DB 접근 전에 반환한다. 최신 version을 읽어 `(latest?.version ?? 0) !== expectedVersion`이면 create 없이 stale이다. 일치하면 **expectedVersion + 1**만 create하고 기존 `@@unique([projectId,version])`의 P2002를 stale로 변환한다. P2002를 잡은 PostgreSQL transaction 안에서 계속 읽거나 쓰지 않는다. 다른 오류는 전파한다. `loadCurrentVersionView`는 쓰기 없이 기본 그래프를 baseline 0으로 읽고 `ensureCurrentVersion`은 첫 런에서 version 1을 ON CONFLICT DO NOTHING으로 물질화한다. 이 writer와 baseline 0 저장도 같은 unique 제약으로 직렬화된다. 런에 고정된 기존 version/graph는 수정하지 않는다.

Action은 기존 `requireProjectWrite`·현재 plan 검사 후 인증된 projectId/userId를 서비스에 전달하고 success에서만 pipeline 경로를 revalidate한다. stale/error는 revalidate/자동 refresh/자동 재제출 없이 draft를 보존한다. stale 또는 응답 유실·commit 이후 revalidation 실패를 만난 rail은 재저장을 막고 draft를 화면에 남긴 채 **Discard changes and reload**를 명시적으로 누를 때만 현재 경로를 새로 로드한다. 이 버튼은 기존 Discard의 복구 용도를 분명히 표현한다. 결과 불명을 실패/rollback으로 표시하지 않는다. 명시적 reload 전에는 최신 graph를 자동 합치거나 baseline만 올리지 않는다.

canonical 문구도 같은 계약으로 갱신한다. product-copy §12의 기존 pipeline race 문장 `The pipeline changed. Refresh and try again.`은 이 저장 흐름에서 폐기하고, §18에 stale 안내 `The pipeline changed. Your draft is still here. Discard changes and reload to edit the latest version.`, 결과 불명 안내 `Couldn't confirm whether the pipeline was saved. Your draft is still here. Discard changes and reload to check the latest version.`, 복구 버튼 `Discard changes and reload`를 기록한다. 일반 validation error는 반환 reason을 그대로 표시하며 재편집·재저장이 가능하다. rail은 stale/결과 불명 안내를 복구 버튼과 함께 화면에 유지하고, 자동 재시도나 저장 실패 확정을 안내하지 않는다. 기존 board race·scouting·connection의 refresh 계약은 유지한다.

**완료 기준:** baseline 3을 읽은 두 탭의 순차 저장은 4 한 건 성공 후 두 번째가 stale/create 0건이다. 동시 동일 baseline은 한 건만 성공한다. baseline 0의 save/save와 save/기본 version 물질화 경쟁도 최신 graph를 덮어쓰지 않는다. stale/error/응답 유실 때 draft가 남고 명시적 reload 후 새 baseline으로 재진입한다. 동일 graph 저장의 응답 유실도 무조건 재시도하지 않는다.

### Should — F4-04: Codex handoff 안내에서 커밋 전제와 준비 경로 보존

**관점·원시 ID:** Predictability — PRE-03. **확신:** 높음.

**근거:** `src/fsd/widgets/turn-banner/model/turn.ts:34`, `:147`, `:148`, `:160`은 다음 행동을 `{key, line}`으로 만든다. `ui/next-step.tsx:25`, `:28`, `:29`의 Codex 분기는 handoff의 `Commit <path>, then continue...`를 일반 resume 문장으로 교체한다. `next-step.test.mjs:10`, `:28`, `:31`도 handoff fixture에서 같은 누락을 기대한다.

**영향:** 클라이언트 선택만 바꿔도 표시와 복사 payload에서 어떤 파일을 먼저 커밋해야 하는지 빠진다. [protocol의 handoff 계약](../../architecture/protocol.md)은 준비 경로 표시와 확인된 커밋 후 재개를 설명한다(`:320`~`:323`, `:441`~`:444`).

**확정 계약:** `NextStep`은 `{kind:"continue";key:string;line:string} | {kind:"handoff";key:string;line:string;note:string|null}`로 만든다. `nextSteps`는 원본 `TurnItem.handoff`로 kind/note를 만들며 기존 `nextStepLine`의 Claude 문자열 계약은 유지한다. 새 `model/next-step.ts`의 `formatNextStep(step,client)`를 표시와 Copy payload의 단일 출처로 쓴다. Claude는 기존 line, Codex continue는 core의 resume 명령 + `Continue the pipeline for <key>.`, Codex handoff는 `Commit <note 또는 the prepared file>, then <resume 명령> Continue the pipeline for <key>.`로 표현한다. note는 React의 escaped text로 표시하며 URL·HTML·실행 명령으로 해석하지 않는다. `tests/server/fixtures/src-clean-code-browser.tsx`의 `{key,line}` fixture도 갱신한다.

**완료 기준:** ready/handoff/null-note × Claude/Codex의 표시와 실제 복사에서 커밋 전제·준비 경로가 보존된다. Codex에 자동 watch 안내가 표시되지 않는다.

### Should — F4-05: Board/History 화면 조립을 page slice 가까이에 배치

**관점·원시 ID:** Cohesion — COH-01. **확신:** 높음.

**근거:** `src/app/(app)/p/[slug]/page.tsx:13`, `:23`, `:27`, `:32`는 조회와 cursor/dispatched 파생을 조합하지만 입력 모델은 `src/fsd/pages/project-board/model/briefing.ts:5`가 소유한다. `briefing.fixture.mjs:15`도 route의 파생을 별도 fixture로 구성한다. History는 route `history/page.tsx:16`, `:23`, `:31`, `:39`, `:47`의 조회·cursor·확장 처리와 slice의 `history-navigation.ts:18`, `:28`, `history-view.ts:7`, `:12`가 나뉜다. `project-history-page.test.ts:10`, `:60`, `:89`는 조립된 props부터 시험한다.

**영향:** 화면 계약 변경 때 route·slice·fixture를 함께 찾아야 하며 slice 시험이 실제 매핑 누락을 잡기 어렵다. 현재 표시 오류가 확인됐다는 주장은 아니다.

**확정 계약:** 새 `project-board/api/project-board.server.ts`의 `loadProjectBoard(projectId,now)`는 briefing을, 새 `project-history/api/project-history.server.ts`의 `loadProjectHistory({slug,projectId,searchParams,now})`는 `ProjectHistoryProps`를 반환한다. 각각 server-only와 명시적인 `index.server.ts` export를 둔다. params/searchParams await·`requireProjectOwner(slug)`·JSX composition은 route에 남는다. 인증 성공 전에는 loader를 호출하지 않으며 projectId를 URL 입력에서 만들지 않는다. 현재 query/map/커서 계약은 아래 provenance대로 이전하고 영속성 서비스는 이동하지 않는다. `index.ts`의 client-safe 화면·`buildBriefing`/`readHistoryQuery` 공개 계약은 유지하되 loader는 export하지 않는다. 현재 `project-list/api/project-list.server.ts:5`의 구조를 참고한다.

**보존·완료 기준:** Board route `:17`~`:19`의 느슨한 key/agent 실행 판정과 banner의 slot binding 판정은 의도적으로 다르므로 통합하지 않는다. 실제 조회 입력→props, gate/project slot/dispatch 상태, History의 잘못된 cursor·현재 페이지 밖 item·list/detail cursor 분리를 시험한다.

### Should — F4-06: 클라이언트 목록·명령과 공통 안내의 계약 연결

**관점·원시 ID:** Cohesion — COH-02. **확신:** 높음.

**근거:** `src/fsd/shared/ui/runtime-client-choice.tsx:3`, `:9`, `:12`, `src/fsd/entities/project-token/ui/token-reveal.tsx:30`, `:31`, `:50`, `:77`, `src/fsd/widgets/turn-banner/ui/next-step.tsx:9`, `:23`, `:25`, `:34`가 client별 값을 독립 선택한다. 기존 `packages/core/client-runtime.mjs:3`, `:17`에는 목록과 init/resume 계약이 있다. 반면 `turn.ts:54`, `:69`, `:74`, `turn-banner.tsx:47`, `:135`, `src/fsd/entities/pipeline/model/gate-copy.ts:7`, `:9`, `:26`, `src/fsd/features/review-gate/model/gate-text.ts:19`는 Claude/watch에 고정된다.

**영향:** Codex 선택 화면과 이어지는 공통 setup·gate·acceptance 안내가 서로 다른 흐름을 말한다. 명령 변경 때 여러 UI 트리의 사본을 함께 수정해야 한다.

**확정 계약:** 제품 사용처가 core의 `CLIENTS`와 `clientRuntime(client).init_command/resume_command`를 직접 사용하고 client 타입은 `NonNullable<Parameters<typeof clientRuntime>[0]>`로 파생한다. JS의 CLIENTS는 string[]로 추론될 수 있으므로 `CLIENTS.map(parseClient)`로 기존 core parser를 통과시켜 typed 선택지를 만든다. unchecked union cast나 새 문자열 목록을 두지 않는다. core JS/JSDoc 계약은 그대로 둔다. `RuntimeClientChoice`는 문자열 value/label options를 받는 generic UI로 좁혀 제품 목록·명령을 shared 안에 복제하지 않는다. 표시 이름은 제품 표시 계층에 둔다. TokenReveal/NextStep의 초기 Claude·국소 선택·token/mcpUrl 또는 slug reset key는 유지한다. OwnerTokenReveal은 현재 Claude 전용으로 유지한다.

선택 없는 setup/none/gate/Inbox 설명은 `coding client` 또는 명시적인 양쪽 명령으로 표현한다. setup 연결은 `Open the repository in your coding client with the token set. Use /harness:init in Claude Code or $harness-init in Codex; it connects the repository and tells you the next steps.`를 core 명령으로 구성한다. gate는 `Then continue in your coding client.` 계열로 표현한다. acceptance retry는 이미 실행 중인 Claude watch의 계속과 Codex `$harness-resume`의 명시적 재개를 함께 안내한다. 웹 승인이 dev를 직접 시작하거나 Codex watch가 자동으로 돈다고 표현하지 않는다.

product-copy §3 actions/gate, §5 setup/none/next step, §6 Board에 기록된 decision 설명·§7 Inbox, §8 Backlog의 writable 빈 상태, §9 token 계약, §11 Item detail의 acceptance retry, §18 gate tooltip/scouting-off checklist 및 마지막 Codex source UI 절을 해당 화면·잠금 시험과 함께 갱신한다. Backlog의 빈 상태도 `coding client`로 중립화하고 read-only 빈 상태는 유지한다. §16 Landing의 Claude 예시·`landing-demo`, plugin/런북/배포 문구는 포함하지 않는다. 같은 옛 문장을 retired-copy 검사에 무차별 등록하여 보존 대상 Landing/Claude 전용 안내를 실패시키지 않는다.

F4-01/F4-03의 문구도 이 문서의 같은 M 경로에서 함께 다룬다. §8/§9/§12에 `Invalid backlog key.`·`Token not found.`·`Invalid pipeline save request.`의 반환 경계와 `Invalid token ID.`의 서버 예외 경계를 기록하고, §12/§18의 pipeline stale·결과 불명·복구 문구는 F4-03과 일치시킨다. 예외 메시지의 production 노출을 보장하는 문구는 추가하지 않는다. 문서만 먼저 바꾼 별도 코드 커밋으로 처리하지 않는다.

**완료 기준:** token/setup/승인 이후/acceptance retry의 client별 안내 matrix와 copy-lock을 확인한다. 기존 `token-reveal.test.ts:22`, `next-step.test.mjs:28`의 개별 분기 검사와 화면 간 일관성 검사를 구분한다.

### Should — F4-07: 연결 컨트롤의 조회·props를 실제 필요 값으로 축소

**관점·원시 ID:** Coupling — CPL-01. **확신:** 높음.

**근거:** `src/fsd/features/manage-project-connection/ui/disconnected-project-banner.tsx:6`, `:9` → `api/manage-project-connection.server.ts:13`~`:15` → `src/server/project-availability-service.ts:193`, `:198`~`:201`은 한 프로젝트의 배너를 위해 전체 목록의 board/run/event 집계까지 읽는다. `project-connection-control.tsx:29`, `:41`, `:54`, `:63`, `:80`은 대상 한 행과 cap/version summary만 사용한다. `project-connection-state.ts:4`~`:6`과 `src/fsd/pages/project-list/ui/project-list-page.tsx:30`, `:54`는 전체 모델 전달을 보여 준다.

**영향:** 목록 전용 조회의 변경·실패가 상세 연결 배너에 파급되고, Client 계약과 fixture가 실제 조작보다 넓다. 전송량이나 성능 수치는 측정하지 않았다.

**확정 계약:** `ProjectConnectionTarget = {id,name,repoOwner,repo,disconnectedAt}`와 `ProjectConnectionSummary = {plan,limit,version,connectedCount}`로 나눈다. Control props는 `{target,summary,disconnect,reconnect}`이며 실제 객체도 이 key들만 만든다. 대상 부재 시 배너는 control을 렌더하지 않는다. `connectionControlKey(target.id,summary)`의 `connection:<id>:<version>:<plan>` 모양을 유지하고 `reconnectBlock`도 summary만 받는다. Projects 목록은 기존 view에서 이 projection을 만들며 목록 조회 자체는 유지한다.

기존 `project-availability-service.ts`에 `loadProjectConnection(client,userId,targetProjectId)`를 추가하고 `project-availability.ts`의 server-only facade로 공개한다. feature loader도 `(userId,projectId)`를 받는다. 서버가 feature 타입을 import하지 않는다. 조회는 기존 `READ_OPTIONS`(RepeatableRead) + SET TRANSACTION READ ONLY + `readOwnerAvailabilityIn`을 유지하고 전체 owner project facts에서 target/connectedCount를 만든다. repositoryOwner·plan normalization·limitsFor의 무제한→null·무결성 예외를 유지한다. boardItem/agentRun/projectAvailabilityEvent 집계, User FOR UPDATE/write/event는 실행하지 않는다. owner snapshot을 한 project만 읽는 것으로 바꾸라는 지시가 아니다. mutation 잠금·최신 cap·CAS·토큰 폐기·revalidation은 변경하지 않는다.

**보존·완료 기준:** version/plan 변경의 confirmation reset, 서버 CAS·최신 cap·stale/결과 불명 복구를 유지한다. Free/Pro/Max·대상 부재·목록/상세 payload를 검증하고, 상세 조회 double은 board/run/event delegate 없이 동작해야 한다.

### Should — F4-08: 주요 UI 시험을 실제 React 렌더링과 공개 행동에 연결

**관점·원시 ID:** Coupling — CPL-03. **확신:** 구조 결합 높음, 전환 비용 중간.

**근거:** `src/fsd/widgets/turn-banner/ui/next-step.test.mjs:22`, `:24`, `:31`은 내부 JSX 배열과 `CopyButton` 함수명을 탐색한다. `src/fsd/shared/ui/copy-button.test.ts:20`, `:21`, `:31`, `src/fsd/features/edit-pipeline/ui/automatic-scout-control.test.ts:19`, `:22`, `:40`, `src/fsd/features/manage-project-connection/ui/project-connection-control.test.ts:24`, `:27`, `:30`, `:46`은 VM transpile·import 허용 목록·직접 만든 hook 모형을 사용한다. setter는 실제 React의 함수 updater를 실행하지 않고 저장하며 connection fixture의 effect는 무시되고 ref도 다시 생성된다.

**영향:** 동작을 보존하는 wrapper·row·hook 추출에도 시험 구현을 고쳐야 한다. 시험 모형에서 얻은 결과를 hydration·focus·navigation 보장으로 확대할 수 없다.

**확정 harness:** 기존 `tests/server/fixtures/src-clean-code-browser.tsx`는 실제 createRoot/ReactDOM·clipboard deferred·AppRouterContext를 사용하고 `scripts/rehearse-src-clean-code.ts`가 esbuild로 제공한다. 이를 확장하며 새 DOM 시험 라이브러리·전역 module mock·자체 hook 모형은 추가하지 않는다. runner에 **`--ui-only`**를 추가하여 DB URL 검증·DB import·Next child 시작 전에 분기하고 loopback `127.0.0.1:55452`의 fixture만 제공한다. 브라우저에서 mode=copy/pipeline/scout/connection/form을 실제 click/input/keydown/pointerdown으로 조작한다. 기존 DB/Next/`--render-faults` 경로는 유지한다.

case별 expected/observed와 Pass/Fail/미실행을 runner의 결과 표에 기록한다. fixture mode 전환·browser Finish·pagehide에서 root.unmount·pending double 해소·clipboard 원본 복원·listener 제거를 한다. browser Finish는 cleanup 뒤 `/finish`를 요청하고, runner는 `/finish`·SIGINT·실패에서 server를 닫는다. SIGINT의 서버 종료를 브라우저 root cleanup의 관측으로 대신하지 않는다. DB 모드의 fixture cleanup/child 종료/env 복원도 유지한다. fake router/action은 React 상호작용 증거이며 실제 Next navigation/commit 인수는 별도 DB 모드다. 네 VM 시험은 대응 browser case 통과를 먼저 기록한 뒤 JSX/hook 내부 의존 부분만 제거한다. 순수 모델·정적 markup·copy-lock은 유지하고 `test:web`만으로 browser case를 Pass 처리하지 않는다.

**완료 기준:** client 전환 후 실제 Copy 클릭/payload, 빠른 중복 복사·실패 후 재시도, scouting 거절/결과 불명, connection pending/stale/confirmation와 effect·focus·외부 클릭을 해당 실제 환경에서 확인한다.

### Should — F4-09: 저장소 입력 방식의 전환 규칙을 한곳에 표현

**관점·원시 ID:** Readability — RDB-01. **확신:** 독자 비용 높음, UX 결함 여부 중간.

**근거:** `src/fsd/features/create-project/ui/new-project-form.tsx:49`, `:54`, `:57`, `:58`, `:65`, `:69`, `:73`, `:91`, `:141`, `:173`과 `model/repository-selection.ts:3`에는 selection.source, manual 여부, editing, URL 초안이 분산돼 있다. `URL → Edit → picker`를 정적으로 따라가면 picker 진입에서 editing을 초기화하지 않아 직접 편집 필드도 노출될 수 있다.

**영향:** 입력 방식 하나를 바꿀 때 선택 식별자·표시 mode·editing·URL 초안·slug 자동 생성의 관계를 여러 handler와 JSX에서 교차 추론해야 한다. 이 조합이 의도하지 않은 UX 버그인지는 실행 검증하지 않았다.

**확정 계약:** 새 local `model/repository-entry-state.ts`에서 selection/manual/editing/query/urlDraft의 transition을 표현한다. **showPicker에서 editing을 유지하는 현재 동작**을 보존하고 주석을 실제 전환별 초기화 규칙으로 고친다. picker/직접 편집 필드의 동시 노출을 버그로 단정하거나 UI 정책을 바꾸지 않는다. showPicker는 manual=false·selection=빈 picker만, showManualEntry는 manual=true·query 초기화·보관 URL 재파싱만 바꾼다. Edit 진입은 현재 owner/repo 또는 defaultOwner로 direct selection, Collapse는 selection/URL을 되돌리지 않고 editing=false만 적용한다. pick은 picker 선택·defaultBranch·untouched slug 자동 생성, reset은 현재 manual 방식 보존·selection/slug/query/urlDraft 비움·branch=main·slugTouched/editing=false다. 유효 URL 타이핑 중 manual 입력은 계속 보인다. slug/branch/slugTouched와 useActionState 결과는 별도 상태로 유지하고 transition의 명시적 출력만 적용한다.

**보존·완료 기준:** `formMode(:25`~`:31)`의 유효 URL 타이핑 중 manual 입력 유지, URL→Edit→picker→선택, Collapse, Start over, 실제 제출 owner/repo 일치를 확인한다. 현재 `new-project-form.test.ts:9`, `:16`은 handler 전환 검증이 아니다.

### Consider — F4-10: Resume input을 사용하는 네 필드로 제한

**관점·원시 ID:** Coupling — CPL-02. **확신:** 높음.

**근거:** `src/fsd/features/review-gate/ui/resume-buttons.tsx:13`, `:16`, `:17`, `:22`, `:27`은 key/status/heldFrom/updatedAt만 읽지만 `inbox-card.tsx:74`는 `model/inbox-item.ts:16`~`:37`의 전체 item을 전달한다. 같은 카드의 approve/reject는 `:72`, `:92`에서 필요한 값을 명시한다.

**영향·최소 개선:** 서버 카드 표시 모델 변경이 Resume input·fixture·Client 경계에 불필요하게 파급된다. `Pick<InboxItem, "key" | "status" | "heldFrom" | "updatedAt">` 또는 동등 계약을 두고 실제 네 필드 객체를 만들어 전달한다.

**완료 기준:** heldFrom별 primary/secondary Resume, read-only 숨김, key/to/expectedUpdatedAt payload, stale 실패와 성공 refresh를 보존한다.

## Affected Files

아래 표는 변경 책임 요약이며, 그 다음 manifest가 정확한 파일 목록이다. 경로는 저장소 root 기준이다. M은 기존 파일 수정, A는 신규 생성, R은 변경하지 않고 계약·보존을 확인할 파일이다. 생성물은 수동 수정하지 않는다.

| 항목 | 경로 또는 영역 | 예정 작업 | 리스크·보존 경계 |
| --- | --- | --- | --- |
| F4-01 | `features/manage-token/api`, `features/manage-user-token/api`, `features/edit-backlog/api`, `server/token-management-query.ts`, `server/pipeline/board-query.ts` 및 관련 시험 | ID/key 입력 검증, invalid 입력의 쓰기 차단 | 중간: 기존 소유권·정상 단일 조작·열린 항목 보호 유지 |
| F4-02, F4-03 | `features/edit-pipeline/ui/pipeline-rail.tsx`, `api/edit-pipeline.server.ts`, feature public API, `pages/project-pipeline`, pipeline route 및 관련 시험 | pending 잠금, baseline 저장 계약 | 중간: 실패/stale의 draft 수명과 기본 그래프 호환 |
| F4-04, F4-06 | `widgets/turn-banner/model`, `ui`, `shared/ui/runtime-client-choice.tsx`, `entities/project-token`, `entities/pipeline/model/gate-copy.ts`, `features/review-gate/model/gate-text.ts` | 의미 있는 다음 행동 계약, client 명령 파생·안내 | 중간: handoff 전제·copy-lock·client별 지원 차이 보존 |
| F4-05 | Board/History route, 각 `pages/project-board`, `pages/project-history`의 api/model/test 및 server public API | page 전용 loader/adapter 추가, 조립 이동 | 중간: 인증·query 기본값·cursor·판정 차이 보존 |
| F4-07 | `features/manage-project-connection`, `pages/project-list`, `server/project-availability-service.ts` 및 서버 facade/시험 | 좁은 대상 projection, 상세 전용 조회 | 중간: read-only snapshot·무결성·CAS·cap 보존 |
| F4-08 | 아래 네 UI 시험·기존 browser fixture/runner | 실제 React fixture 확장, ui-only 모드 | 중간: 순수/정적 시험 보존·double cleanup |
| F4-09 | `features/create-project/ui/new-project-form.tsx`, 해당 model/시험 | local 전환 규칙 정리 | 낮음~중간: URL 초안·slug 입력 의도·제출 값 보존 |
| F4-10 | `features/review-gate/ui/resume-buttons.tsx`, `inbox-card.tsx` 및 관련 시험 | Resume props의 실제 projection | 낮음: mutation payload 보존 |
| 문구 변경 | `docs/conventions/product-copy.md`, 해당 copy-lock·mutation·pipeline 시험 | client 안내와 F4-01 입력 오류/F4-03 복구의 canonical 문구를 코드와 함께 갱신 | 중간: 지원 범위·권한·저장 결과를 확대해 표현하지 않음 |

`packages/core/client-runtime.mjs`는 기존 계약의 재사용 출처다. 계약 변경 자체는 필수 작업이 아니다. Prisma 생성 코드·DB schema 변경은 현재 최소 수정안에 필요하지 않다.

### 변경 manifest

```text
M src/fsd/features/manage-token/api/manage-token.server.ts
M src/fsd/features/manage-user-token/api/manage-user-token.server.ts
M src/fsd/features/edit-backlog/api/edit-backlog.server.ts
M src/fsd/features/edit-backlog/ui/backlog-table.tsx
M src/fsd/features/edit-backlog/ui/backlog-table.test.mjs
M src/server/token-management-query.ts
M src/server/pipeline/board-query.ts
A tests/server/mutation-identifiers.test.ts
A tests/server/integration/mutation-identifiers.test.ts
M tests/server/token-issuance-bindings.test.ts
M tests/server/integration/token-management.test.ts
M scripts/rehearse-account-usage-and-tokens.ts
M src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts
M src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx
M src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs
M src/fsd/features/edit-pipeline/index.ts
M src/fsd/features/edit-pipeline/index.server.ts
A src/fsd/features/edit-pipeline/model/pipeline-save-state.ts
A src/fsd/features/edit-pipeline/model/pipeline-save-state.test.ts
A src/server/pipeline/version-save-query.ts
A tests/server/pipeline-save.test.ts
A tests/server/integration/pipeline-save.test.ts
M src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx
M src/app/(app)/p/[slug]/pipeline/page.tsx
M src/fsd/widgets/turn-banner/model/turn.ts
M src/fsd/widgets/turn-banner/model/turn.test.ts
A src/fsd/widgets/turn-banner/model/next-step.ts
A src/fsd/widgets/turn-banner/model/next-step.test.ts
M src/fsd/widgets/turn-banner/ui/next-step.tsx
M src/fsd/widgets/turn-banner/ui/next-step.test.mjs
M src/fsd/widgets/turn-banner/ui/turn-banner.tsx
M src/fsd/shared/ui/runtime-client-choice.tsx
M src/fsd/entities/project-token/ui/token-reveal.tsx
M src/fsd/entities/project-token/ui/token-reveal.test.ts
M src/fsd/entities/pipeline/model/gate-copy.ts
M src/fsd/entities/pipeline/model/gate-copy.test.ts
M src/fsd/features/review-gate/model/gate-text.ts
M src/fsd/features/review-gate/ui/acceptance-failure.test.ts
M src/fsd/features/review-gate/ui/inbox-card.tsx
M src/fsd/features/review-gate/ui/inbox-card.test.mjs
M docs/conventions/product-copy.md
M src/app/(app)/p/[slug]/page.tsx
M src/app/(app)/p/[slug]/history/page.tsx
A src/fsd/pages/project-board/api/project-board.server.ts
A src/fsd/pages/project-board/index.server.ts
A src/fsd/pages/project-history/api/project-history.server.ts
A src/fsd/pages/project-history/index.server.ts
A tests/server/project-page-loaders.test.ts
M tests/server/project-history.test.ts
M src/fsd/pages/project-board/model/briefing.fixture.mjs
M src/fsd/pages/project-board/model/briefing.test.mjs
M src/fsd/pages/project-board/ui/project-board-page.test.mjs
M src/fsd/pages/project-history/ui/project-history-page.test.ts
M src/fsd/features/manage-project-connection/api/manage-project-connection.server.ts
M src/fsd/features/manage-project-connection/model/project-connection-state.ts
M src/fsd/features/manage-project-connection/model/project-connection-state.test.ts
M src/fsd/features/manage-project-connection/ui/project-connection-control.tsx
M src/fsd/features/manage-project-connection/ui/project-connection-control.test.ts
M src/fsd/features/manage-project-connection/ui/disconnected-project-banner.tsx
M src/fsd/features/manage-project-connection/index.ts
M src/fsd/pages/project-list/ui/project-list-page.tsx
M src/server/project-availability-service.ts
M src/server/project-availability-service.test.ts
M src/server/project-availability.ts
M tests/server/project-connection-bindings.test.ts
M tests/server/integration/project-connection.test.ts
M src/fsd/shared/ui/copy-button.test.ts
M src/fsd/features/edit-pipeline/ui/automatic-scout-control.test.ts
M tests/server/fixtures/src-clean-code-browser.tsx
M scripts/rehearse-src-clean-code.ts
A scripts/rehearse-src-clean-code-fourth-pass.ts
A tests/server/fixtures/action-manifest.ts
A tests/server/fixtures/load-module.ts
A tests/server/fixtures/src-clean-code-acceptance.ts
M tests/server/integration/account-usage.test.ts
M src/fsd/features/create-project/ui/new-project-form.tsx
M src/fsd/features/create-project/ui/new-project-form.test.ts
A src/fsd/features/create-project/model/repository-entry-state.ts
A src/fsd/features/create-project/model/repository-entry-state.test.ts
M src/fsd/features/review-gate/ui/resume-buttons.tsx
```

fixture/runner는 F4-02/03/04/06/07/08/09/10의 공동 검증 목적지다. 네 VM 시험 파일은 next-step/copy-button/automatic-scout-control/project-connection-control이다. Resume payload 시험은 browser의 mode=resume와 inbox-card 정적 read-only 시험에 둔다. 위 manifest는 구현 전 계획이다. 실제 변경과 실행 결과는 Implementation Completion 및 연결된 인수 보고서에 기록한다. 기존 public export·route signature와 보존 시험을 그대로 재사용할 수 있는 M 항목은 불필요한 diff를 만들지 않았다.

### 보존 계약·검증 기반 manifest

아래 파일은 직접 수정하지 않는다. 이 목록과 다음 dependency closure가 reconciliation의 bounded code basis다.

```text
R AGENTS.md
R package.json
R package-lock.json
R tsconfig.json
R next.config.ts
R eslint.config.mjs
R docs/architecture/README.md
R docs/architecture/fsd.md
R docs/architecture/system-overview.md
R docs/architecture/verification.md
R docs/architecture/protocol.md
R src/server/auth/guard.ts
R src/server/db.ts
R src/server/result.ts
R src/server/project-access-query.ts
R src/server/project-connection.ts
R src/server/project-connection-service.ts
R src/server/pipeline/board.ts
R src/server/pipeline/run.ts
R src/server/pipeline/run-query.ts
R src/server/pipeline/history-page.ts
R src/server/pipeline/history-items.ts
R src/server/project.ts
R src/server/entitlement.ts
R src/fsd/features/manage-token/index.server.ts
R src/fsd/features/manage-user-token/index.server.ts
R src/fsd/features/edit-backlog/index.server.ts
R src/fsd/features/manage-project-connection/index.server.ts
R src/fsd/features/edit-pipeline/ui/automatic-scout-control.tsx
R src/fsd/shared/ui/copy-button.tsx
R src/fsd/pages/project-board/index.ts
R src/fsd/pages/project-board/model/briefing.ts
R src/fsd/pages/project-history/index.ts
R src/fsd/pages/project-history/model/history-navigation.ts
R src/fsd/pages/project-history/model/history-view.ts
R src/fsd/pages/project-history/ui/project-history-page.tsx
R src/fsd/pages/project-list/api/project-list.server.ts
R src/fsd/pages/project-list/ui/project-list-page.test.mjs
R src/fsd/features/create-project/model/repository-selection.ts
R src/fsd/features/create-project/model/repository-selection.test.ts
R src/fsd/features/review-gate/model/inbox-item.ts
R src/fsd/features/review-gate/model/gate-source.ts
R src/fsd/features/review-gate/api/review-gate.server.ts
R src/fsd/entities/project-token/ui/owner-token-reveal.tsx
R src/fsd/entities/project-token/model/connect-command.ts
R src/fsd/shared/lib/copy-lock.ts
R src/fsd/pages/landing/ui/landing-page.tsx
R src/fsd/pages/landing/ui/landing-page.test.ts
R src/app/(app)/p/[slug]/layout.tsx
R src/app/(app)/p/[slug]/tokens/page.tsx
R src/app/(app)/p/[slug]/backlog/page.tsx
R src/app/(app)/settings/tokens/page.tsx
R packages/core/client-runtime.mjs
R packages/core/pipeline.mjs
R packages/core/entitlement.mjs
R prisma/schema.prisma
R tests/server/register-server-only.mjs
R tests/server/integration/support.ts
R scripts/test-server-integration.mjs
R scripts/verify-fsd-boundaries.mjs
R scripts/retired-copy.test.mjs
R node_modules/next/package.json
R node_modules/react/package.json
R node_modules/react-dom/package.json
R node_modules/typescript/package.json
R node_modules/prisma/package.json
R node_modules/esbuild/package.json
R node_modules/next/dist/docs/01-app/02-guides/data-security.md
R node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md
R node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
R node_modules/next/dist/build/webpack/plugins/flight-client-entry-plugin.d.ts
```

closure recipe는 M/R manifest의 기존 파일 + `src/generated/prisma`의 전체 파일 열거 + M/R에 명시된 src production 파일에서 repository-local import/export를 재귀 추적한 집합이다. 테스트·스크립트의 동적/VM import는 아래 provenance와 named-symbol 검색으로 별도 확인한다. package 외부 의존성은 lockfile 및 위 설치 package identity로 제한하고 node_modules 전체를 해시하지 않는다. 생성 schema/모델(특히 ProjectToken/OwnerToken/UserToken/BacklogItem/PipelineVersion 및 internal class/namespace)은 Prisma 입력 계약의 읽기 근거로만 사용한다.

### 생성·이동 preflight와 import/export provenance

2026-10-03 현재 M/R 경로는 존재하고 A 경로는 없다. Board/History의 api directory도 아직 없어 구현 시 각 api directory를 먼저 만든다. 나머지 A의 parent는 이미 존재한다. A는 kebab-case이며 기존 파일 덮어쓰기·schema/generated 수동 수정·root app 재생성은 필요하지 않다. 착수 시 동일 preflight를 다시 검사하여 다른 작업의 신규 파일과 충돌하면 재대조한다. 기존 route/모델 파일을 삭제·rename하지 않고 조립 책임만 옮긴다.

| 이동/연결 symbol | 현재 owner·public API | 후속 import/소유 위치 | 목적지 검증 |
| --- | --- | --- | --- |
| savePipeline / SavePipelineAction / Graph | feature api·index.server / rail·index / rail-state·index | route는 feature index.server, page는 feature index, rail/API는 local pipeline-save-state; DB 저장은 server version-save-query | pipeline-save.test.ts + integration + rail browser; feature client barrel에 서버 저장 export 금지 |
| latestBoard; loadProjectRoster; loadCurrentVersionView; pipelineRun/agentRun 조회 | server pipeline/board; project; pipeline/run; prisma | Board loader의 server imports, route는 `pages/project-board/index.server`의 loadProjectBoard만 | project-page-loaders.test.ts에서 실제 loader→briefing; route의 query/map 부재 |
| dispatcherFor/isGateId; buildBriefing | core pipeline; Board model·index | Board loader는 core 및 `../model/briefing`; route의 buildBriefing 호출 제거 | gate/node/NUL key-agent dispatched mapping 및 banner와의 판정 차이 |
| historyCutoff/planForProject; projectHistory/projectHistoryItems/hasProjectHistoryBefore/currentRoundIds; loadProjectRepository | core entitlement; server entitlement; pipeline/board; project | History loader의 같은 owner imports | 실제 loader 양 mode·cutoff·현재 페이지 밖 item·auth-before-load |
| parse/formatHistoryCursor; parse/formatHistoryItemCursor | server pipeline/history-page; history-items | History loader로 import 이동 | 잘못된 cursor를 null 처리, list/detail cursor 분리, route에서 해당 호출 부재 |
| readHistoryQuery; ProjectHistoryProps | History model/history-navigation·index; model/history-view | loader는 local model import; route는 index.server loader + index 화면 | project-history.test.ts의 옛 route VM 조립 시험을 실제 새 loader 시험으로 연결; 얇은 route auth/scope 시험 유지 |
| loadProjectConnection; connectionControlKey/reconnectBlock; Control | feature api·index.server; model·index; UI·index | feature API→server project-availability facade→service; 배너/목록→대상+summary | narrow-query unit/integration·control browser·AST/manifest 비원격 loader |
| CLIENTS/parseClient/clientRuntime; RuntimeClientChoice | core client-runtime; shared UI | 제품 formatter/TokenReveal에서 core 직접 import; generic UI에 typed 표시 options 전달 | core 값과 실제 명령/Copy matrix, shared 제품 계약 사본 부재·타입 게이트 |
| NextStep/nextSteps/nextStepLine | turn model, slice 내부 사용 | turn→local next-step formatter→next-step UI; browser fixture shape 갱신 | 새 formatter test·기존 turn/copy-lock·실제 Copy payload |
| selectedRepository/formMode 및 입력 handler | create-project model/기존 UI | local repository-entry-state→new-project-form; 기존 parser/submit 상태 유지 | transition test + 실제 FormData·focus/URL typing |
| ResumeButtons/TransitionAction | review-gate UI; inbox-item model | 같은 slice에서 네 필드 projection을 전달, action 계약은 유지 | Inbox SSR read-only + browser resume의 key/to/expectedUpdatedAt |

모든 신규 page loader는 일반 async server-only 함수다. module-level use server를 붙여 원격 Action으로 만들지 않는다. src/server는 FSD 타입을 import하지 않고, slice 외부 production import는 public API만 사용한다. 시험 fixture의 기존 deep import는 시험 대상 연결이며 production 우회 import의 선례가 아니다.

## Safety Analysis

소스·호출부·테스트·생성 계약을 함께 대조했다. 현재 결함과 유지보수 위험의 확신은 정적 근거의 범위이며 실제 사용자 장애 빈도·payload 크기·hydration 실패를 측정한 결과가 아니다.

- Action의 인증·프로젝트/사용자 범위는 유지하고 그 안의 단일 대상 식별자를 검증한다. F4-01은 다른 사용자 데이터 변경 가능성을 주장하지 않는다.
- 저장 중 편집 유실과 여러 탭의 오래된 baseline 제출은 별개 원인이므로 F4-02/F4-03을 구분한다.
- handoff 의미 손실과 클라이언트 안내 사본의 소유권은 최소 변경이 달라 F4-04/F4-06을 구분한다.
- F4-05에서 Board와 banner의 의도적인 실행 판정 차이를 통합하지 않는다.
- F4-07의 좁은 조회도 기존 read-only owner snapshot·무결성 판정·서버 쓰기 CAS를 보존한다.
- 현재 public API와 Server/Client 경계로 변경을 연결한다. 같은 layer의 slice를 직접 import하거나 검사 예외를 추가할 필요는 없다.
- 현재의 순수 모델·copy-lock·정적 렌더 시험은 보존하면서 F4-08의 제한된 상호작용 fixture를 개선한다.

## Approval

사용자의 실제 코드 수정·commit·dev PR 지시를 근거로 구현을 진행했다. 승인 기록은 front matter를 단일 기준으로 사용한다. PR 병합·배포는 요청 범위 밖이다.

F4-09는 기존 editing 보존, F4-08은 기존 ReactDOM 브라우저 fixture 확장으로 정했다. 새로운 제품 정책·라이브러리 비용·전역 client 선호는 이번 계획에 추가하지 않는다.

## Execution Plan

1. 착수 시 최신 `dev`와 현재 소스를 재대조하고 별도 `harness/<topic>` 브랜치를 만든다. 기존 사용자 변경은 보존한다.
2. F4-01의 토큰·백로그 입력 검증과 zero-write 시험을 먼저 적용한다. 정상 단일 조작·작업별 권한 matrix·미선택/해제 상태의 폐기 허용·열린 항목 보호와 canonical 오류 계약을 확인한다.
3. F4-02/F4-03의 model·server 저장 함수·public API·route/page/rail과 product-copy §12/§18을 함께 연결한다. expectedVersion + 1·기본 version 물질화 경쟁·pending/ref 잠금·stale/결과 불명·명시적 reload와 실제 복구 문구를 검증한다.
4. F4-04를 우선 해결하고 F4-06의 client 안내·core 계약·canonical 문구를 정리한다.
5. F4-05의 api parent를 생성하고 server-only loader/public API를 추가한 뒤 조립을 이동한다. 기존 History route 시험을 목적지 loader 시험과 얇은 route 시험으로 연결한다. F4-07은 기존 owner snapshot으로 좁은 조회·실제 전달 projection을 만든다.
6. F4-09의 기존 transition·F4-10의 네 필드 payload를 보존한다. F4-08의 기존 fixture/runner에 ui-only와 copy/pipeline/scout/connection/form/resume mode 및 cleanup을 연결한다. 대응 browser case 통과 후 네 VM 시험의 내부 의존 부분을 제거한다.
7. 관련 시험과 저장소 필수 게이트를 수행하고, 아래 fresh build 이후 manifest 환경변수를 활성화한 서버 시험을 별도로 실행하여 실제 결과를 기록한다. PR을 만들 경우 base는 `dev`이며 `check` workflow 녹색 이후 병합한다.

## Runtime Behavior Matrix

| 요구 | 초기 상태·이벤트 | 성공 | 거절/실패·복구 | 입력 변경·cleanup/보존 |
| --- | --- | --- | --- | --- |
| F4-01 | 인증된 owner 또는 user가 ID/key mutation; direct 서비스 호출도 별도 경계 | 유효 자기 ID는 한 대상만 변경; 미선택/해제/Free의 폐기·user rename도 기존 권한대로 허용 | invalid는 DB write 0; 익명/다른 owner slug는 기존 guard 차단; 프로젝트 rename/백로그만 read-only에서 거부; foreign-scope tokenId revoke는 void·변경 0건 | revoke는 owner/user 세션 범위와 읽기 권한, user rename은 userId 범위 유지; 열린 항목 보호·기존 transaction 재시도 유지; production 서버 예외 원문 노출은 보장하지 않음 |
| F4-02/03 | baseline 0 또는 persisted version에서 dirty draft를 제출 | expected+1 한 건 생성 후 revalidate→새 version key가 제출 graph baseline을 렌더 | validation/권한 오류는 draft와 baseline 유지·재편집 가능; stale/응답 유실은 canonical 안내와 복구 버튼을 유지, 자동 refresh/재제출 없이 저장 잠금, 명시적 Discard changes and reload로 재진입 | ref 잠금으로 연속 클릭 차단; 완료/실패/unmount에서 오래된 비동기 callback이 새 instance 상태에 적용되지 않음; plan/editable/route 변경의 현재 remount 계약 유지 |
| F4-04/06 | Claude 기본 선택에서 continue/handoff; 클라이언트 radio 변경 후 Copy | 선택 client formatter의 표시=clipboard; handoff note/null 전제 보존 | clipboard 거절은 Copy 유지·재시도, stale 성공을 다른 text의 Copied로 표시하지 않음 | token/mcpUrl 또는 slug 변경 reset 유지; escaped note; Codex watch 없음·OwnerTokenReveal/landing Claude 전용 보존 |
| F4-05 | owner guard 성공 후 projectId와 query/now를 loader에 전달 | Board briefing·History Items/Events body와 링크 동일 | guard 실패는 loader 0회; 배열/잘못된 cursor는 기존 parser fallback; 현재 list 밖 item은 상세 조회 안 함 | query/cutoff/now 입력을 요청별로 사용; 캐시를 추가하지 않음; 실행 판정 차이·list/detail cursor 유지 |
| F4-07 | owner read-only snapshot에서 대상+summary; control confirmation | 동일 CAS/최신 cap mutation; 성공 toast·현재 revalidation | 대상 부재 control 없음; error는 confirmation 안의 사유; stale/결과 불명은 기존 reset+refresh | id/version/plan key로 confirmation reset; 메뉴 focus/Escape/외부 pointerdown·effect cleanup 유지; hs_/ho_ 폐기·hu_ 보존 그대로 |
| F4-08 | 실제 React root + 외부 경계 deferred double | 실제 DOM/event와 observed payload별 Pass | fake router의 성공을 실제 Next navigation/commit으로 기록하지 않음; 실패·미실행은 Pass 아님 | fixture별 고유 root/state; pending 완료·unmount·listener/clipboard 복원·server/child/DB/env 정리 |
| F4-09 | repos 유무로 picker/manual 초기화; paste/edit/picker/pick/collapse/reset | 현재 보이는 selection만 제출; untouched slug/branch의 현재 자동 값 | invalid URL은 이전 성공 파싱값을 제출하지 않음; action 오류 후 입력 유지 | picker 진입 editing 유지; URL draft 보존; typing focus와 reset 규칙을 실제 FormData로 검사 |
| F4-10 | on_hold + canWrite 카드의 Resume | 기존 primary/secondary to와 key/expectedUpdatedAt; 성공 refresh | 실패/stale toast, refresh 없음; read-only 버튼 없음 | 네 필드 객체만 Client 경계를 통과; 기존 transition payload/서버 승인·검증 계약 유지 |

서버 오류나 클라이언트 navigation이 새 정책을 의미하지 않는다. Action 직접 POST는 설치된 Next data-security 문서의 공개 HTTP 경계이며 bound form만 확인해서는 충분하지 않다. `revalidatePath`의 현재 화면 갱신과 React key remount는 별도 원인이므로 둘 다 검증한다. 구현 전의 runtime 근거는 현재 코드와 설치 문서이고 실행 관측은 아래 미실행 항목이다.

## Final Artifact Resolution Map

| 최종 노출물·winning source | body/의존 계약 | 구현 후 확인 목적지 |
| --- | --- | --- |
| `/p/[slug]/pipeline` route→ProjectPipelinePage→PipelineRail + Action→version-save-query | saved version/default, graph 카드·메뉴·pending/error/stale/결과 불명 안내와 명시적 복구 버튼; product-copy §12/§18·core graph 규칙·Prisma unique·plan·roster·Next revalidation | fresh-build 실제 GET/RSC body·2탭 저장·지연/응답 유실·DB graph/version 전량; browser pipeline mode의 실제 안내/버튼/재시도 부재 |
| Board `/p/[slug]`, History `/p/[slug]/history` route→각 새 page loader→기존 page UI | gate/node/dispatch briefing·slot, Items/Events rows·확장·커서·GitHub 경로; cutoff·repo·현재 round IDs | 새 loader의 실제 query 결과→props 시험 + 실제 GET 본문의 행/링크; route 조립 부재를 AST로 검사 |
| `/projects`와 project layout의 연결 control/배너 | 직렬화된 target/summary key 집합·cap/version·확인 문구; server snapshot과 기존 mutation | 목록·상세 실제 전달 객체 비교, 좁은 조회 double/DB snapshot, control focus·stale·미확인 결과 |
| Tokens/TurnBanner/Inbox/acceptance retry 안내 | core init/resume→제품 formatter→escaped JSX→동일 Copy text; product-copy가 canonical 문구, slice별 로컬 선택이 winning client | TokenReveal hs_/hu_ × 두 client, NextStep ready/handoff/note=null × 두 client의 DOM+Copy; setup/none/gate/read-only/retry body·copy-lock |
| 새 프로젝트 Form와 Resume | repository-entry-state→NewProjectForm→FormData; 네 필드 projection→ResumeButtons→기존 humanTransition | 실제 browser form/resume mode, Inbox read-only SSR, 잘못된 URL/중복 제출·stale payload |
| build 산출 Action registry와 client/server bundles | `.next/server/server-reference-manifest.json`의 node/edge registry를 fresh build에서만 읽음; filename/exportedName·workers shape는 설치된 ActionManifest 계약과 대조; loader는 원격 action 아님 | 빌드 후 RDC_CHECK_ACTION_MANIFEST=true의 기존 connection-bindings 및 새 mutation-identifiers/pipeline-save/project-page-loaders 시험; JSON 구조·목적지 export 검사 + FSD/타입/build. 과거 `.next`·조건부 검사 미실행은 통과 근거가 아님 |

route 우선순위는 현재 단일 `src/app`, 빈 next.config, 명시적인 route→page 연결로 확인했다. 새 metadata/asset/font·template delivery·generated route override는 추가하지 않는다. 기존 Code/CopyButton/Link·전역 layout/CSS가 화면 의존이며 변경하지 않는다. Prisma 산출물은 build의 generate가 schema에서 다시 만들고 수동 변경은 금지한다. 최종 body 검사는 상태 코드·manifest 존재 확인으로 대체하지 않는다.

## Verification Plan

각 항목의 「완료 기준」을 동작별 검증 행렬로 사용한다. 특히 F4-01은 DB delegate 호출/쓰기 0건과 정상 단일 대상 변경을 검사하고, F4-02/F4-03은 실제 React 상호작용·저장 지연·서버 version 경쟁을 구분하여 검증한다. UI 개선이 사용하는 같은 handler·adapter·서비스를 통과하는 시험을 선택한다.

후속 코드 변경에 필요한 공통 게이트:

```powershell
npm run verify:fsd
npm run test:architecture
npm run check
npm run test:web
npm run test:server
npm run build
```

`check`에는 lint·Next typegen·TypeScript·아키텍처·plugin 사본 검사가 포함된다. 모든 명령은 repo root의 PowerShell에서 실행한다. 코드 게이트 통과 후 별도 `stagekeeper_test_*` DB에서 아래 DB 인수를 실행한다. 부모 DATABASE_URL과 host/port/database가 같은 URL은 validator가 거부해야 한다. core/schema/plugin 원본은 이 계획에서 변경하지 않으며 예기치 않은 diff는 범위 이탈로 기록한다.

위 `build`가 성공한 직후 다음 명령으로 manifest 검사를 활성화한다. 현재 connection-bindings의 해당 시험은 이 환경변수가 없으면 등록되지 않는다. 새 `mutation-identifiers.test.ts`·`pipeline-save.test.ts`·`project-page-loaders.test.ts`에도 같은 명시적 flag로 registry 검사를 연결한다. flag가 켜졌는데 산출물이 없거나 현재 export를 역추적할 수 없는 구조이면 실패하며 skip하지 않는다. 실행 전의 환경변수 값을 종료 때 복원한다.

```powershell
$fourthPassPreviousManifestFlag = $env:RDC_CHECK_ACTION_MANIFEST
try {
  $env:RDC_CHECK_ACTION_MANIFEST = 'true'
  npm run test:server
  if ($LASTEXITCODE -ne 0) { throw 'Fresh-build Action manifest checks failed.' }
} finally {
  if ($null -eq $fourthPassPreviousManifestFlag) {
    Remove-Item Env:RDC_CHECK_ACTION_MANIFEST
  } else {
    $env:RDC_CHECK_ACTION_MANIFEST = $fourthPassPreviousManifestFlag
  }
}
```

```powershell
# 후속 구현 후: 실제 React fixture만 시작한다. 현재 runner에는 이 옵션이 아직 없다.
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-src-clean-code.ts --ui-only
# 위 runner를 /finish로 종료한 뒤 격리 DB를 사용하는 아래 단계를 실행한다.
npm run test:server:integration
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-account-usage-and-tokens.ts
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-src-clean-code.ts
```

ui-only 주소는 `http://127.0.0.1:55452/fixture?mode=copy`이며 pipeline/scout/connection/form/resume mode로 반복한다. form의 picker 조건은 기존 `&picker`를 쓴다. runner끼리는 동시에 같은 port를 사용하지 않는다. DB runner는 직전 fresh build를 사용하고 실제 Board/History/pipeline·Action POST 시나리오를 추가한다. 종료 시 `/finish`와 fixture cleanup을 확인한다. 이번 문서 검증에서는 이 명령들을 실행하지 않았다. 테스트·build/typegen은 DB/캐시/생성물을 쓸 수 있으므로 anchor replay에는 manifest-only로 분류한다.

### 요구–시험–목적지 coverage

| 요구 | 정확한 시험 목적지 | 필수 positive/negative 결과 |
| --- | --- | --- |
| F4-01 | 새 tests/server/mutation-identifiers.test.ts, integration/mutation-identifiers.test.ts; 기존 token-issuance-bindings/integration token-management; 두 rehearsal runner | 3 revoke+3 rename+2 backlog; invalid/누락/공백/객체는 write 0, 정상은 한 행. 익명/다른 owner slug 차단; 프로젝트 rename/백로그 read-only 거부; 유효 자기 토큰은 미선택/해제/Free에서도 폐기, user rename은 프로젝트 상태와 무관. foreign-scope ID revoke는 void/변경 0; 열린 key 보호. 실제 POST는 같은 build/auth/Origin/Host의 정상 대조군을 사용하고 production 예외 원문을 요구하지 않음. backlog FormData는 multipart/RSC로 전송. canonical 반환 오류·직접 throw 및 flag 활성 manifest의 8 export 확인 |
| F4-02/03 | 새 pipeline-save-state.test.ts·tests/server/pipeline-save.test.ts·integration/pipeline-save.test.ts; rail 정적 시험·browser pipeline; DB runner | graph 구조/version 경계·Free/미선택/해제 권한·stale 순차/동시·0 baseline 물질화 경쟁을 barrier로 검사. 오류별 create/revalidate 0, 성공 1. menu/Add/Move/Remove/Swap/Discard/연속 Save 차단, gate0 확인 유지, 자동 scouting 독립; commit 전/후 transport 단절과 명시적 reload. §12/§18과 실제 stale/결과 불명/복구 문구 일치, 이 rail에서 옛 Refresh and try again 부재; flag 활성 manifest의 savePipeline export 확인 |
| F4-04/06 | 새 turn-banner/model/next-step.test.ts; turn/next-step/token-reveal/gate-copy/inbox-card/acceptance-failure/rail/backlog-table의 기존 시험; browser copy | typed kind/note/null/공백·특수문자 경로; 표시=Copy. 공통 hint에서 Claude만 요구하는 옛 문장 부재; Backlog writable 빈 상태 중립화/read-only 유지; Claude watch·OwnerTokenReveal·landing-demo 정상 유지; Codex watch 없음. turn-banner-connect/watch·token-reveal shared/project/user/codex 블록과 UI 동시 갱신 |
| F4-05 | 새 tests/server/project-page-loaders.test.ts; 기존 tests/server/project-history.test.ts; briefing fixture/model/page·History page 시험; DB runner의 Board/History GET | loader를 실제 실행해 query→props·body/링크 검사. route AST에서 query/map/커서 조립 호출 0, 새 server public export/import 있음, client barrel loader 없음, flag 활성 manifest에 새 loader 두 개 없음. Board loose binding·History array/invalid cursor·outside item·cutoff·list/detail 분리·auth-first 보존 |
| F4-07 | project-connection-state/control·project-availability-service 기존 시험; project-list-page.test.mjs; tests/server/project-connection-bindings 및 integration/project-connection; browser connection | target+summary 정확한 key 집합, board/run/event delegate 없는 조회, READ ONLY/RepeatableRead·owner integrity·Free/Pro/Max·대상 없음. 기존 server CAS·cap·hs_/ho_ 폐기·hu_ 보존. id/version/plan reset·selection/connection key 분리·Escape/focus/outside click/listener cleanup |
| F4-08 | 기존 네 VM 시험의 대체 case와 tests/server/fixtures/src-clean-code-browser.tsx + scripts/rehearse-src-clean-code.ts | 실제 renderer/browser 모든 mode 통과와 cleanup을 따로 기록. 클릭 payload·중복/실패/재시도·props 변경/unmount·scouting 거절/결과 불명·connection 확인/pending/stale. fake router 결과와 실제 Next DB 인수 분리 |
| F4-09 | 새 repository-entry-state.test.ts; 기존 repository-selection/new-project-form 시험; browser form | repos 없음/있음, 유효 URL typing·Edit→picker→선택·Collapse·Start over·직접 입력·untouched/touched slug·defaultBranch; focus와 제출 owner/repo 일치. editing 보존·URL 초안·invalid URL의 옛 selection 제출 금지 |
| F4-10 | 기존 inbox-card.test.mjs + browser resume | 네 필드 객체만 전달; heldFrom별 primary/secondary·key/to/expectedUpdatedAt, pending 중 중복 차단·stale 실패 refresh 0·성공 refresh 1·read-only 숨김 |

### 목적지와 금지 경계 검사

- M/A/R manifest 전체를 구현 후 다시 비교한다. A는 모두 존재하고 M/R은 삭제되지 않아야 한다. 신규 api 부모·index.server export와 route public import를 AST로 검사한다.
- 이동한 조립의 old absence는 route에서 latestBoard/Prisma 조회/buildBriefing 호출, History query/parse/format/cutoff 호출이 사라지는 것이다. 순수 모델 public export는 보존 대상이므로 부재를 요구하지 않는다. new presence는 실제 새 loader 입력→props 시험이다. 저장 create/version 계산은 새 server 함수에 있고 feature API는 인증·검증·서비스 호출·revalidation만 조립한다.
- fresh build manifest를 JSON parse하여 page loader 등록이 0인지, connection loader 등록이 0인지, disconnect/reconnect의 두 inline action은 남는지, token/backlog/save의 실제 Action ID가 현재 filename/exportedName에 연결되는지 검사한다. connection inline action의 generated exportedName을 일반 함수 이름으로 고정하지 않는다.
- registry의 node/edge를 모두 검사한다. mutation-identifiers의 positive 목록은 manage-token.server의 revokeToken/revokeOwnerToken/renameToken/renameOwnerToken, manage-user-token.server의 revokeUserToken/renameUserToken, edit-backlog.server의 updateBacklogItem/removeBacklogItem이다. pipeline-save는 edit-pipeline.server의 savePipeline을 검사한다. project-page-loaders는 새 Board/History api 경로와 loadProjectBoard/loadProjectHistory의 원격 등록 부재를, 기존 connection-bindings는 두 inline action과 loadProjectConnection의 부재를 검사한다. 현재 flag 명령을 실제 실행하지 않았으면 이 항목은 미실행이다.
- client-safe index에는 DB/loader/새 version-save-query export가 없어야 하며 src/server→FSD·동일 layer 다른 slice·deep production import·root app과 src/app 동시 존재는 금지한다. `verify:fsd`와 `check/build`가 목적지 경계를 검사한다.
- copy의 옛 문장 부재 검사는 변경한 setup/none/gate/Inbox/retry 표면에 한정하고 Landing/Claude 전용 화면은 유지한다. `scripts/retired-copy.test.mjs`의 광역 RETIRED 목록을 이번에 바꾸지 않는다. copy-lock 포함 검사 외에 Codex watch 금지·실제 복사 payload를 별도로 검사한다.
- pipeline race의 옛 문장은 §12의 해당 행과 변경한 rail에서만 부재를 검사한다. board/scouting/connection의 refresh 문장은 보존한다. §8/§9/§12의 입력 오류와 §18 복구 문구를 Action/모델 및 browser의 실제 노출에 연결하며, production에서 소거되는 서버 throw 원문은 direct 시험으로 구분한다.
- DB runner의 auth·transport·barrier·후처리 증거를 결과표에 남긴다. Promise.all만으로 경쟁을 입증하거나 HTTP 실패 status만으로 write 0을 주장하지 않는다. 테스트 schema/DB/credential을 결과 문서에 노출하지 않는다.

구현 전 기준선과 구현 후 결과를 구분하고 실패·skip·미실행을 Pass로 기록하지 않는다. F4-08의 모형 시험 통과와 실제 브라우저/React 검증도 구분한다.

## Verification Results

### 이번 리뷰에서 완료한 확인

| 확인 | 결과 | 의미 |
| --- | --- | --- |
| 대상 inventory·줄 수·원본 해시 | 확인 완료 | 위 Current State의 source snapshot |
| 다섯 독립 렌즈의 applicable 범위 검토 | 완료 | 생성물 경계·인접 테스트 포함, TS는 CSS 비해당 구분 |
| 중립 게이트의 원시 11건 대조 | 10건 채택 | Must 2 / Should 7 / Consider 1; 1라운드 |
| Action→서비스→Prisma 조건과 생성 계약 | 정적 대조 완료 | F4-01의 범위 확대 가능성 근거; DB 실행 미수행 |
| 저장→revalidation→version key 및 handoff formatter | 정적 대조 완료 | F4-02/F4-04 근거; 실제 브라우저 재현 미수행 |
| 제안서 metadata·필수 섹션·상대 링크·최종 ID | 확인 완료 | 10건·Must 2/Should 7/Consider 1; 누락 섹션·깨진 링크 없음 |
| 문서 작성 전후 authored source hash | 일치 | 위 SHA-256 동일; 앱·core·schema·설정의 tracked diff 없음 |

**Review-mode substantiation:** 게이트의 추가 검증 대기 요청은 없었다. 읽기 전용 소스·설정·로컬 문서 대조 외의 실행 검증은 수행하지 않았다.

### 구현의 실행 검증

| 명령/검증 | 결과 | 비고 |
| --- | --- | --- |
| verify:fsd / test:architecture / check | Pass | FSD·lint·타입·plugin 사본·availability |
| test:web / test:server / build / npm test | Pass | 실제 renderer·서버·production build·core/plugin |
| fresh build 후 RDC_CHECK_ACTION_MANIFEST=true | Pass | 8 mutation + save 등록, 새 일반 loader 비등록 |
| 격리 DB 통합 시험 | Pass, 95건 | baseline 저장 및 default 물질화 양방향 경합, narrow snapshot |
| 두 실제 Next HTTP rehearsal | Pass | malformed raw 값·권한·정상 대조군, Flight multipart, commit 전/후 응답 유실, GET 본문 |
| 실제 headless Edge React fixture | Pass, 25건 | Copy·pending·canonical recovery·focus·폼·Resume·unmount |

세부 증거·재현 조건·한계·정리는 [인수 보고서](../../test-reports/completed/2026-10-04-src-clean-code-fourth-pass.md)에 있다. 위 리뷰 기준선·정적 확인 표는 원래 제안서 작성 당시 기록으로 보존한다. 실제 두 브라우저 탭 동시 인수는 별도로 실행하지 않았고 서버 경합은 SQL barrier 및 동시 HTTP로 검증했다.

## Risks and Rollback

transport 입력 거부, 저장 지연·version 경쟁, UI 상태 전환은 격리 DB·실제 Next·React browser 인수로 확인했다. harness와 editing 보존 계약은 확정했으며 재선택을 구현자에게 남기지 않는다. Codex source UI 안내의 정합성 개선을 제품 지원 인증으로 해석하지 않는다.

후속 수정은 항목별로 작게 커밋하여 문제가 생긴 변경을 개별 revert할 수 있게 한다. 현재 제안에 schema migration은 필요하지 않다. 코드 revert는 이미 변경된 토큰·백로그·pipeline 데이터까지 복구하지 않으므로 검증은 fixture/격리 DB에서 수행한다. 운영 데이터에 영향이 있었다면 해당 사실과 별도 복구 절차를 기록한다.

## Proposal Reconciliation Record

2026-10-03, `reconciling-proposals-with-codebase`, editable source mode / High-Risk / full reconciliation. 처음 문서에 보완할 점이 있었으며, 아래 문서 blocker를 한 묶음으로 반영했다. 최초 렌즈의 발견 10건을 다시 수집하거나 심각도를 바꾼 기록이 아니다.

| 문서 blocker | 반영한 해소 | 닫는 검증 경계 |
| --- | --- | --- |
| R1: invalid ID/key의 실패 계약과 직접 호출 경계 미정 | 원본 문자열 guard·8 Action/서비스·void/실패 반환·정상 POST 대조군 | generated filter 계약 + Action→service 쓰기 추적 + zero-write/전량 DB 비교 계획 |
| R2: 저장 signature/baseline·기본 물질화·결과 불명 누락 | feature input/result·server 저장 함수·expected+1·stale/명시적 reload | route/page/rail key + 두 writer/unique 제약 + 지연/경합/transport case |
| R3: 이동/신규 파일·export·시험 목적지 미정 | M/A/R manifest·parent/collision·symbol provenance·old absence/new presence | filesystem 열거 + TypeScript import/export 추적 + 실제 새 loader 시험 |
| R4: handoff 소비 fixture 및 canonical copy 범위 누락 | typed NextStep·formatter·browser fixture·section/lock/보존 범위 | 원본 handoff 데이터→UI/Copy + 모든 named consumer 검색 + 실제 body matrix |
| R5: 좁은 조회의 snapshot과 serialization 계약 불충분 | 기존 owner snapshot·READ ONLY/RepeatableRead·target/summary 실제 projection | 조회 delegate 없이 시험 + key 집합·CAS/권한·최종 body |
| R6: renderer/harness 재선택과 cleanup 공백 | 기존 ReactDOM/esbuild fixture·ui-only·mode/cleanup·Next 인수 구분 | createRoot/runner 실제 import + lifecycle·브라우저 observed 결과 |
| R7: picker editing 유지/초기화 결정 미정 | 현행 유지·전환별 정확한 상태·FormData 계약 | 모든 현재 handler의 setter inventory + transition/실제 입력 시험 |
| R8: 검증 명령·산출 본문·실패 경로 및 완료 추적 공백 | runtime/artifact/coverage 행렬·fresh manifest parse·PowerShell 명령·범위 금지·DoD | package scripts/설치 Next 문서 + 목적지/실패·보존 경계 전체 대조 |

2026-10-04 반복 요청의 **새 전체 대조**에서는 아래 세 항목을 추가 보완했다. 이전 clean 판정을 그대로 재사용하지 않았고, 이번 시작 문서의 개선 필요 여부는 「있음」이다.

| 추가 문서 blocker | 현재 코드/문서의 충돌 | 반영한 해소·검증 목적지 |
| --- | --- | --- |
| R9: F4-01 검증표의 blanket read-only/foreign 거부 | revoke는 owner/user 세션만 필요하며 미선택·해제에서도 허용; foreign-scope ID revoke는 void·변경 0 | 8 Action의 작업별 auth matrix와 반환 경계를 요구·runtime·coverage·DoD에 연결; mutation-identifiers/unit/integration 및 정상 실제 POST 대조군 |
| R10: canonical 입력·저장 복구 문구의 수정 범위 누락 | product-copy §12 pipeline race가 Refresh and try again이며 새 draft 보존·명시적 폐기 계약과 충돌; 새 오류의 문서 목적지 누락 | §8/§9/§12/§18의 변경과 정확한 stale/결과 불명/복구 문자열, production throw 소거·기존 refresh 보존 범위를 명시; rail/browser·직접 Action 시험 |
| R11: fresh manifest 검사의 활성화·시험 소유자 누락 | connection-bindings가 RDC_CHECK_ACTION_MANIFEST 조건부인데 명령은 build 전 일반 test:server만 실행 | fresh build 직후 flag 활성/기존 값 복원 명령; 기존 connection 및 새 mutation/pipeline/page-loader 시험의 node/edge·positive/negative export 목록 |

### 증거 안정성·재검증 basis

이 절은 durable handoff의 **basis**다. 최종 no-edit pass 결과와 이 제안서 자신의 최종 SHA-256은 자기 해시 순환을 피하기 위해 최종 응답에 기록한다. 문서가 다시 바뀌면 그 최종 판정은 재사용할 수 없다. 이 basis는 적용 범위의 비교 증거이며 완전성·정확성·결함 부재의 증명이 아니다.

- Repository identity: `stagekeeper-fourth-pass-aef63537`; HEAD: `aef6353776b9d481380b06e397594225fcf43725`.
- Scope/phase/profile: F4-01~F4-10 Core 구현 제안의 문서 대조 / 구현 승인 전 / High-Risk.
- Manifest: 기존 수정 59개, 신규 16개, 보존·기반 71개. M/R 경로 부재 0·A 충돌 0; 신규 api 부모 두 곳의 생성 순서는 위 preflight에 반영했다. 2026-10-04에는 installed Next error/ActionManifest 계약 두 파일을 기반에 추가했다.
- Bounded recipe (`safe-replay`): 위 M/R 경로 + `rg --files --no-ignore src/generated/prisma` + M/R production src의 static import/export를 TypeScript AST로 재귀 추적. `@/→src/`, `@harness/core/→packages/core/`, 상대 경로 및 .ts/.tsx/.mjs/index 해석; .test/.fixture는 출발점에서 제외한다. repo 내부만 추적하며 Next 설치 문서/package identity는 명시된 파일에 한정한다.
- 후보 경로 259개. POSIX 상대 경로 ordinal 정렬 후 각 UTF-8 경로+NUL의 SHA-256: `dccb850795bf9c3682afe217d9ed2e2615c4c366a5eeee1442dcd2548fd82252`.
- 같은 정렬의 경로+NUL+원본 바이트+NUL SHA-256: `a4cb4f1b30d2bf072bca4bb878f15b6b70da14acf3f0f84cdea6ef404fab0de4`. 제안서 자신은 이 code basis에서 제외하고 최종 응답의 source identity로 별도 비교한다.
- Stability closure: 식별자는 Action/service 추적과 별도로 generated WhereInput/undefined 계약을 검사했다. version은 저장 호출 추적과 별도로 schema unique 및 default materializer를 검사했다. loader/copy/projection은 파일 열거와 별도로 named-symbol consumer 및 public export를 검사했다. 검증 runner는 package 명령뿐 아니라 createRoot·DB validator·cleanup 구현을 검사했다. 아래 고정 identity와 이 bounded digest가 관측 signature다.
- 추가 closure: auth matrix를 guard 함수와 rename 서비스의 접근 판정 및 canonical 폐기 계약으로 교차 확인했다. 저장 복구는 §12의 현재 race 행과 제안된 rail terminal state를 대조했다. manifest는 설치된 구조 타입·기존 조건부 시험·package 실행 순서를 별도로 대조하고 flag 명령을 PowerShell 구문으로 검사한다. 이들은 정적 문서 대조이며 production 실행 통과가 아니다.
- `manifest-only`: future A 파일·post-change exports/body/checks, npm test/check/build/typegen·DB integration·rehearsal. 이 명령의 실행을 replay 관측으로 추정하거나 자동 실행하지 않는다.
- Runtime/artifact/verification evidence: 위 provenance, Runtime Behavior Matrix, Final Artifact Resolution Map, 요구–시험–목적지 coverage. 현재 코드/설치 문서의 정적 대조이며 미래 구현의 실행 통과가 아니다.
- Exclusions: migration/backfill/배포/template 원문·실제 Codex 모델 인수는 명시된 별도 과제이고 이번 code manifest에 변경이 없다. Landing/OwnerTokenReveal·core/schema/generated 원본은 보존 계약으로 검사한다. 운영 DB/외부 API/사용자 credential은 실행하지 않아 volatile 운영 증거가 없다.
- Remaining execution risks: 실제 Next 입력 transport, version 경합/commit 후 응답 유실, React focus/effect/lifetime은 후속 격리 인수로 확인한다. 이 미실행은 문서의 계약 미정과 구분한다.
- Redaction: credential·remote URL·raw token·사용자 데이터 없음. Persistence: 사용자가 지정한 이 proposal에 basis를 저장; 최종 source identity와 판정 receipt는 최종 응답.

다음 identity는 source bundle의 직접 적용 문서와 relevant ignored/generated dependency **각 파일**의 SHA-256이다. package 버전/HEAD만으로 로컬 생성물의 내용을 대신하지 않는다.

| 저장소 상대 경로 | SHA-256 |
| --- | --- |
| `docs/architecture/README.md` | `ec7570d2b72b0392f568552cd28375c49e95e0d217cdce8e19878776b9dc213e` |
| `docs/architecture/fsd.md` | `b29fcacba7821efb85aeae9ac08a4cbdc2c08ee8b70105a1acc98b30fd5c9a91` |
| `docs/architecture/system-overview.md` | `05f3ef03899150a06550f2493f9b67ec91e45464510f1c2c1f80d1e37af6491f` |
| `docs/architecture/verification.md` | `d5f4746607063b6d0708a6309f9e6a787f20cbb78b596517d594a88c1541dc41` |
| `docs/architecture/protocol.md` | `2d69bf8edca757d8bc21ac0f7aaeb08e4c74e092d5cf432fdc9904879330c469` |
| `docs/conventions/product-copy.md` | `29c55278ec405b7cf8204ce1b603a2dd9e496d818c31ddb8d38e72be7afe5115` |
| `node_modules/esbuild/package.json` | `9d0bc453f4e791553c4cc2298ba023b409241fd9801e494741666eb0f6051490` |
| `node_modules/next/dist/build/webpack/plugins/flight-client-entry-plugin.d.ts` | `4392bf33b7d242fa22b23d679cd2d21c954fb88fda0271c84fc4f94966836025` |
| `node_modules/next/dist/docs/01-app/02-guides/data-security.md` | `54ee97dcf636bcd2f8300925ee181747431d6c635ae4e948e3dbf8db3ee7eeee` |
| `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` | `9eb9b3da39244096bb13962b9142e5caaf9832ed8addfc1996133145339a6b72` |
| `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` | `82b4f0888f1d1113c2e0e1a867983a88ce02bbf9419570e3710fe7fe4ccd2c02` |
| `node_modules/next/package.json` | `3ae720e4b8cdad7503935b27b0d14e04390068bf10d6e685797ccf1044051967` |
| `node_modules/prisma/package.json` | `e0d96b7612a7592e62b1e2ba5b40e686e96af588bf9dafe74799b99d0b31abed` |
| `node_modules/react-dom/package.json` | `7c82f0967114d4b5d38b1f07e543af87c9919e8d3243f9604004819319cb2200` |
| `node_modules/react/package.json` | `e40c3ed9b633c9ecf188e09a4be309780a1ea0a9c068278a30ff6a27e7b2dbb6` |
| `node_modules/typescript/package.json` | `822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6` |
| `src/generated/prisma/browser.ts` | `08af4f27b96d9c65fc95997333107ea0d16fc0b4417fe45df8ce5d953314188a` |
| `src/generated/prisma/client.ts` | `690090cc31199f6052c33e9a8d4c4f446defad6b9a4f2c267ea8392cd68791b4` |
| `src/generated/prisma/commonInputTypes.ts` | `206184a7768e83b50aa6eb4d39ef22db209ef9c90679b5ab25600e93453dd96c` |
| `src/generated/prisma/enums.ts` | `ebbdce75bbdd503c5172913fdc7b0523216ce8a6e6ed3ee4611ab10bea9c1e20` |
| `src/generated/prisma/internal/class.ts` | `50c694aa4921ac18bf3be8c53b004a4ca4a91818be246a4758fb528d0982b27b` |
| `src/generated/prisma/internal/prismaNamespace.ts` | `2e419687c291aa0b98e285ab785fcaf371b97f334ac34d1396c5dfbaf3ca52d4` |
| `src/generated/prisma/internal/prismaNamespaceBrowser.ts` | `fb8595bb7be2928ec3b7e12b45dc614b99a8e1bc68b91127d6280d3fd25c58c7` |
| `src/generated/prisma/models.ts` | `6857b56b9cd11d5733e4320f5641bbe8f33a6d83cab6916a673cfd7b51aaf680` |
| `src/generated/prisma/models/AcceptanceFailure.ts` | `9794fe58be87e45fa641f0d72ae8ebedc1c3cad5e205300c97cd5ce73bc8c16b` |
| `src/generated/prisma/models/AgentRun.ts` | `108da56de9e4c61f6bd22abe93cc314204ee85536e4e8fde2b3af3c5f7673567` |
| `src/generated/prisma/models/AgentRunStep.ts` | `3d644d19019a4d369e5c960cc4b3573c2e780a16ad69361bf80feda20686f0fc` |
| `src/generated/prisma/models/BacklogItem.ts` | `978d51c2b5015008c28bdfd993657a5c59bf98b2c76151b6487795191f35d0b3` |
| `src/generated/prisma/models/BoardItem.ts` | `4d0dd1d33fae6a84dc7d2a22a8385957ce051c6f499cb13f2002b02e8d2909a9` |
| `src/generated/prisma/models/Command.ts` | `185693dbf265a984604932da58a80df30310f2bac8b02b7ca75def40dec7dd5f` |
| `src/generated/prisma/models/OwnerToken.ts` | `4efad292d74b0edd0cd1bc0d44e6e0622465804af91ce41f6bd16c921ee8a9e4` |
| `src/generated/prisma/models/PipelineRun.ts` | `fe323c0e3f9b6e8bf5b3106151af72cd516a25efe9365a7d61aab6249d8503de` |
| `src/generated/prisma/models/PipelineVersion.ts` | `30716530a924ea1159a77a18193afc1ed03c52b3013931293fe5041dd90c7fa5` |
| `src/generated/prisma/models/Project.ts` | `6619ed89bed5d834d1e7cfa9b6cc6b1f72d79f08eac794c8089d9f153fda1be0` |
| `src/generated/prisma/models/ProjectAvailabilityEvent.ts` | `f9215f82ab9ca3ff214b80d10dedb0994831a729c515f3647becda6e95dffd57` |
| `src/generated/prisma/models/ProjectToken.ts` | `56f9997e35bd197aa13edbfedb0985fd7635b502c9c39e19dac9a226310f5e1b` |
| `src/generated/prisma/models/Report.ts` | `9df85f7bf579edf5c479fbd42435518d293929e89816ba425d9fd4bcde4a8611` |
| `src/generated/prisma/models/RequestRateWindow.ts` | `82d6a2a637306eb65d52b87a6902105b99f8d382eeda1ed3c0168afc621d4fd6` |
| `src/generated/prisma/models/Subscription.ts` | `59b40d2305c054becbe6c2907db6a089256fea1954f66c480f4a6a9c87b71e34` |
| `src/generated/prisma/models/Template.ts` | `bc66c7945ba3775b12d1fe04b7af67c0ea4bb51a6d1880e6916d74284304b1a6` |
| `src/generated/prisma/models/TransitionEvent.ts` | `f6fdfc44930c7843b6ec779b6addfacca6f6d9379769d1affb1424e47c8fb5c3` |
| `src/generated/prisma/models/User.ts` | `4f607c3ff623200cd58fe1a9875fadcf30ad9cd795dce813b1da7b60a0cb88eb` |
| `src/generated/prisma/models/UserToken.ts` | `910b53eeafef0bf8272d08d69b611598b7b344208f86340f7c140dfa2427305e` |
| `src/generated/prisma/models/Workspace.ts` | `176dc2776a3ac25f965b013e6929773c94fac4717de723d35bf8c3eedc0d5c78` |

### 최종 패스와 구현 DoD

최종 패스는 마지막 문서 저장 뒤 INV-1~INV-6 전체 재대조 → Coverage Stability Check/High-Risk Closure → INV-7 순서로 수행하며 수정이 한 번이라도 생기면 재시작한다. 결과는 문서를 다시 수정하지 않고 최종 응답의 Pass State/Receipt에 남긴다.

후속 구현 완료는 다음 조건을 모두 요구한다.

- F4-01~F4-10 Core와 M/A manifest를 구현하고 source/public API·목적지 시험·실제 body/payload를 연결했다.
- 이동한 조립의 old absence/new presence, server-only/nonremote loader, narrow serialized object와 모든 보존 경계가 coverage대로 확인됐다.
- invalid/권한/경합/stale/응답 불명·retry/re-entry·props 변경/unmount·focus/listener/runner cleanup을 각각 확인했다.
- 유효 자기 토큰의 미선택/해제/Free 폐기와 user rename을 보존하고, foreign-scope revoke의 void/변경 0건을 invalid 예외·프로젝트 read-only mutation 거부와 구분해 검증했다.
- product-copy의 입력 오류·pipeline stale/결과 불명·복구 문구와 실제 코드/화면이 일치하고, 이 흐름의 옛 재시도 안내만 제거했다. 서버 예외 원문의 production 노출을 완료 조건으로 삼지 않았다.
- mandatory gates·격리 DB·fresh-build 실제 Next·React browser case의 실제 결과와 실패/skip/미실행을 구분해 기록했다.
- fresh build 이후 manifest flag를 활성화한 서버 시험을 실행하여 두 inline action·8 identifier action·savePipeline의 positive와 세 loader의 negative를 node/edge 양쪽에서 확인하고 기존 환경변수를 복원했다.
- 전역 선호/새 DOM library·schema migration·core/plugin/배포 변경·새 UX 정책을 추가하지 않았다.
- 구현 승인·필수 검증·완료 metadata의 실제 근거를 기록한 뒤 proposal 완료 이동을 한다. 문서 reconciliation만으로 이 항목들을 완료 처리하지 않는다.

## Completion or Closure Notes

검토와 문서 작성은 완료했다. 제안된 코드 구현과 회귀 검증은 실행 전이므로 문서는 `active/`, `status: pending`에 유지한다. 구현·필수 검증이 끝난 뒤 실제 결과와 완료일을 기록하고 완료 문서로 이동한다.

## Review Coverage and Traceability

**Coverage: Full applicable-lens review — 5개 applicable 완료, Gate-validated N/A 0개.** 채택 기여가 없는 렌즈, unavailable/skipped, Needs human judgment는 없다. TS의 CSS 제외는 해당 규칙의 적용성 구분이며 렌즈 누락이 아니다.

| 렌즈 | 검토 범위 | 원시 발견 | 최종 기여 |
| --- | --- | ---: | --- |
| Cohesion | authored text 324개 | 2 | F4-05, F4-06 |
| Coupling | authored text 324개 | 3 | F4-07, F4-08, F4-10 |
| Predictability | authored text 324개 | 3 | F4-02, F4-03, F4-04 |
| Readability | authored text 324개 | 1 | F4-09 |
| TypeScript generalist | 적용 코드·테스트 323개 | 2 | F4-01에 두 근거 병합 |

| 원시 ID | 제안 심각도 | 게이트 disposition | 최종 ID·심각도 | 판정 근거 |
| --- | --- | --- | --- | --- |
| COH-01 | Should | accept | F4-05 / Should | route와 page 모델·fixture 사이의 조립 분산 |
| COH-02 | Should | accept | F4-06 / Should | core 명령 계약·UI 사본·고정 안내 불일치 |
| CPL-01 | Should | accept | F4-07 / Should | 단일 대상 UI가 전체 목록 조회·모델에 결합 |
| CPL-02 | Consider | accept | F4-10 / Consider | Resume가 읽는 네 필드보다 넓은 계약 |
| CPL-03 | Should | accept | F4-08 / Should | JSX 탐색·자체 hook 모형에 따른 변경 파급 |
| PRE-01 | Must | accept | F4-02 / Must | 저장 중 추가 draft를 version remount가 초기화 |
| PRE-02 | Should | accept | F4-03 / Should | 순차적인 오래된 baseline 제출 구별 불가 |
| PRE-03 | Should | accept | F4-04 / Should | Codex 표시·복사에서 handoff 전제 소실 |
| RDB-01 | Should | accept | F4-09 / Should | 입력 전환 규칙의 분산과 겹치는 상태 경로 |
| TS-01 | Must | accept | F4-01 / Must | tokenId가 검증 없이 다중 변경 필터에 전달 |
| TS-02 | Must | merge-accept(F4-01) | F4-01 / Must | 같은 원인과 최소 수정; 백로그 보호 우회 근거 보존 |

게이트의 증거 위치 보정도 반영했다: `briefing.fixture.mjs:15`, `project-history-page.test.ts:60`. 추가 실질 라운드·기각·렌즈 재검토는 필요하지 않았다.

## Review Checklist

- [x] 저장소 proposal 템플릿의 상태·범위·영향·안전성·검증·롤백 정보를 작성했다.
- [x] `active/`와 `pending`, `awaiting-approval`, null 승인 기록을 일치시켰다.
- [x] 채택된 모든 항목에 현재 코드 위치·영향·최소 개선·완료 기준을 연결했다.
- [x] 다섯 독립 관점, 중립 게이트, 원시→최종 ID 및 병합 기여를 기록했다.
- [x] 현재 아키텍처·로컬 버전·생성물 경계를 기준으로 작성했다.
- [x] 정적 리뷰와 실제 테스트·브라우저·DB 검증을 구분했다.
- [x] 잔여 리스크와 항목별 실행·롤백 방법을 기록했다.
- [x] 정확한 M/A/R 파일·생성 preflight·symbol provenance·변경 후 시험 목적지를 연결했다.
- [x] 저장/입력/조회/폼의 실패·복구·보존 계약과 최종 body/payload 검증 기준을 명시했다.
- [x] 최초 문서에 보완할 점이 있었음을 기록하고 R1~R8을 요구·실행·검증·DoD에 반영했다.
- [x] 2026-10-04 시작 문서에도 보완할 점이 있었음을 기록하고 R9~R11의 권한·문구·manifest 실행 해소를 전파했다.
- [ ] 후속 코드 구현과 관련 시험·필수 게이트를 완료하고 실제 결과를 기록했다.

## Implementation Completion

최신 origin/dev의 4660d42를 기준으로 harness/src-clean-code-fourth-pass에서 구현했다. 원래 제안서의 aef6353 snapshot·reconciliation 해시와 이후 검증 근거는 역사적 기록이며 현재 코드 해시로 재사용하지 않는다.

| ID | 적용 |
| --- | --- |
| F4-01 | 인증 이후 원본 ID/key guard, 서비스 direct boundary guard, 8 Action·DB/HTTP 전량 비교 |
| F4-02/03 | ref 잠금·제출 snapshot·version baseline·immutable append·stale/unknown recovery·명시적 reload |
| F4-04/06 | typed handoff note, core client/init/resume, generic choice, 중립 copy·canonical lock |
| F4-05 | Board/History server-only page loader와 얇은 owner route; 기존 body/링크·cursor 유지 |
| F4-07 | target/summary 전달과 read-only owner snapshot; list-only query 제거 |
| F4-08 | 실제 React fixture에서 25개 DOM/event case를 확인한 뒤 네 VM/hook/JSX 내부 의존 시험 제거 |
| F4-09 | repository-entry-state에 전환 소유; picker editing·URL draft·FormData·focus 보존 |
| F4-10 | ResumeButtons의 네 필드 projection과 양 heldFrom/primary/secondary payload 확인 |

원래 계획에 추가한 검증 helper·전용 HTTP runner는 설치된 encoder와 기존 test DB guard를 재사용한다. 최신 dev는 template render를 과금 전에 검증하므로 기존 account-usage 시험의 옛 예외/과금 기대값만 현재 실패 반환/과금 0 계약에 맞게 수정했다. 해당 제품 코드는 변경하지 않았다.

추가 diff review는 isolated spawn thread limit으로 전체 오케스트레이션을 완료하지 못했다. 두 독립 응집도·결합도 검토와 main-agent 수동 검토에서 명령 소유권 및 narrow 조회 시험을 보완했으며, 이를 새 다섯 렌즈·중립 게이트의 전체 검토와 동등하게 기록하지 않는다.
