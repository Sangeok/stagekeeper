---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-02"
updated-at: "2026-11-02"
approved-by: "user"
approved-at: "2026-11-02"
approval-scope: "SRC-CC-005–009 코드 구현·로컬 검증·commit·push·dev 대상 PR 생성. 사용자 경험 불변. 병합·배포 제외"
completed-at: "2026-11-02"
verification-summary: "005–009 구현 완료. check·경계·아키텍처·web 792건·server 176건·실제 DB 162건·build·fresh manifest 통과. 브라우저 production/development 각 16건, 실제 Next 본문·링크·키보드·포커스·스크롤 및 전후 캡처 4개 동일 확인."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/server.md"
  - "docs/architecture/pipeline-execution.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/completed/2026-10-28-src-frontend-clean-code-review.md"
  - "docs/proposals/completed/2026-10-28-src-frontend-clean-code-follow-up.md"
---

# 사용자 경험을 유지하는 src 프런트엔드 클린 코드 개선 완료 기록

## Summary

**SRC-CC-005–009의 코드 구현과 로컬 검증을 완료했다.** 필수 Core 005–007과 선택적 Phase 2
008–009를 모두 수행했다. UX가 달라지는 001–004는 제외 상태를 유지했다.
검증한 문구·외형·조작·상태 수명·오류 복구와 실제 Server Action 계약이 기준선과 일치했다.

2026-11-02 코드 대조에서 006과 009의 변경 폭을 더 좁혔다. 006은 미사용 표시 props만 제거하고
기존 다섯 설정 Action의 타입·바인딩·노출을 유지한다. 009는 미사용 배너 입력만 제거하고
프로젝트 존재 확인 조회를 유지한다. 원래의 Action 전달 삭제·조회 전체 삭제 권고는 이 문서에서 대체한다.

| 분류 | ID | 현재 제안 | 최초 심각도·기여 렌즈 |
| --- | --- | --- | --- |
| Core | SRC-CC-005 | 상세·Backlog 조회와 화면 투영을 각 page의 서버 adapter로 이동 | Should / Cohesion |
| Core | SRC-CC-006 | Pipeline UI의 미사용 표시 props 정리 | Should / Predictability, Simplicity |
| Core | SRC-CC-007 | PipelineRail의 축약 참조 카드 표현만 같은 파일에서 분리 | Should / Readability |
| Phase 2 | SRC-CC-008 | 13개 정적 테스트의 router 환경을 테스트 전용 unit으로 격리 | Consider / Coupling |
| Phase 2 | SRC-CC-009 | 배너의 미사용 SetupState 입력 제거·존재 확인 유지 | Consider / Simplicity |

최초 요청은 제안서 검증·개선이었다. 이후 코드 구현 요청으로 005–009를 모두 수행했다.
아래 구현 계약·계획·inventory는 당시 판단 근거로 보존하며, 실제 결과는 Implementation Results를 기준으로 한다.
최초 발견 9건의 판정은 뒤의 이력에 보존한다.

## Implementation Results

구현·로컬 검증 기준은 당시 dev의 `f89d4e617b7bb168263ae28d9bd005bfe3a2f24f`다. 최초 검토 기준과 이 커밋 사이
이번 제품 코드·계약에는 차이가 없음을 확인했다. 같은 미병합 작업 브랜치를 fast-forward하여 미커밋 제안서를 보존했다.
변경은 제품·검증 코드 39개 파일과 이 완료 기록·검증 문서다. 로컬 구현 완료 당시에는 원격 작업을 수행하지 않았다.
이후 사용자가 commit·push·dev 대상 PR 생성을 요청하여 승인 범위를 확장했다. 병합·배포는 포함하지 않는다.

| ID | 구현 결과 |
| --- | --- |
| 005 | 상세·Backlog 서버 loader 두 개와 서버 public API를 추가했다. guard·notFound·Action bind는 route에 유지하고 전체 DTO·조회 순서·null/실패를 검증했다. |
| 006 | 미사용 표시 props와 fixture 준비만 제거했다. 다섯 설정 Action의 타입·bind·구현·fresh registry를 보존했다. |
| 007 | 축약 참조 카드만 같은 파일의 비공개 component로 추출했다. parent key/ref·ARIA·상태·저장/복구를 유지했다. |
| 008 | 테스트 전용 router unit을 만들고 13개 정적 소비처를 전환했다. 운영 module graph 비유입을 검사했다. |
| 009 | 배너의 미사용 입력을 제거하고 같은 위치의 project 존재 확인 조회를 id 선택으로 유지했다. 실패 전파와 실제 DB 조회 무쓰기를 확인했다. |

새 browser fixture는 기존 entry에서 내부 PipelineRail 참조를 prop으로 받는다. 새 비공개 FSD import나
제품 export를 추가하지 않았다. `docs/architecture/verification.md`에 실제 검사·fixture 경로를 등록했다.

### 실행한 검증

| 명령·환경 | 결과 |
| --- | --- |
| `npm run verify:fsd`, `npm run verify:server` | Passed |
| `npm run test:architecture` | 195 pass, 2 platform skip |
| `npm run check` | lint·문서·타입·scripts 완료; scripts 271 pass, 2 platform skip |
| `npm run test:web` | 792 pass, 0 fail/skip |
| `npm run test:server` | 176 pass, 0 fail, fresh 검증 조건에 따른 2 skip |
| `npm run test:server:integration` | 격리 PostgreSQL에서 162 pass, 0 fail/skip. 새 loader 조회 전후 저장 상태 비교 포함 |
| `npm run build` | Passed. 오래된 로컬 Prisma 생성물은 정식 generate 단계로 동기화했으며 schema를 수정하지 않음 |
| 세 manifest flag를 켠 `--test-name-pattern='\bfresh\b'` | 29 pass, 0 fail/skip. 일반 server 실행의 fresh 조건 skip도 이 단계에서 검증 |
| production/development DOM fixture | 각각 16 pass, 0 fail. native Enter/Tab 동작과 기준선 DOM·case 결과 일치 |
| 실제 Next + 격리 DB + Chrome | 상세·Backlog·Pipeline 본문/링크 일치. 실제 keyboard·충돌 scroll·panel 종료 focus 복구 통과 |
| 전후 화면 캡처 | 상세·Backlog·Pipeline·좁은 viewport 총 4개 PNG가 각각 바이트 동일 |

기존 001–004의 제품 파일과 server/core 정책·schema·package/lock·설정·CSS·font에 변경이 없음을 diff로 확인했다.
스크린샷과 DOM 비교는 고정 업무 입력·고정 이력 시각·동일 viewport에서 수행했다. 첫 HTTP 비교의 차이는
fixture가 생성한 실행 시각뿐이었으며, 해당 시각을 고정한 뒤 변경 전·후 build 모두를 다시 실행했다.
스크린샷의 진행 중 CSS 애니메이션도 비활성화하여 캡처 시점 차이를 제거했다. 제품 코드를 바꿔 차이를 숨기지 않았다.

### 검증 대상과 산출물 식별

- 변경 전 production build: `NvUoJ25U3DnNZThCauM5c`.
- 실제 Next 전후 비교에 사용한 변경 후 build: `edm3cVhtrvaTHwquiC9Sr`.
- 같은 제품 소스의 최종 build 및 manifest 재확인: `LcBNiPVn5Xrd56TSdV6bh`.
- 변경한 코드·테스트 39개 파일의 정렬된 경로/내용 SHA-256 manifest digest: `54b60a6c3dbdbb7038dde5880f03b2b398669fddc23ad01193c69df3296046ba`.
- 로컬 산출물은 OS 임시 디렉터리의 `stagekeeper-ux-implementation-vlv13pkd`에 기록했다. `implementation-evidence.json`, `ui-*.json`, `http-*.json`, 검사 로그와 캡처를 보존했다.

| 동일한 전후 PNG | SHA-256 |
| --- | --- |
| detail | `fc6b034cf52609cd7279de62d1f4524c762039aff03bc90364c93771c1c4f4e9` |
| backlog | `2e58d9d608b6cccc7312947cd778b3f205fa87e6fc7a9b3ea71750acff1038b1` |
| pipeline | `46b833a16aeb4acb1454466f5165178ebe18792d1260e99e01a36af6ccce6279` |
| narrow | `4ea6138404b57f93509fdfd3b59bf6ba962d16adb2e4976b8cba70e7493fbdbe` |

DB는 저장소 밖 임시 PostgreSQL 18.6 cluster를 loopback에만 띄워 사용했다. 저장소 의존성이나 운영 연결을 변경하지 않았다.
모든 fixture·Next 서버와 임시 PostgreSQL을 종료하고 사용한 세 listener의 종료를 확인했다.
검증 범위는 로컬 macOS·Chrome·Node 26.4.0이며 원격 CI·다른 OS 실행을 통과했다고 주장하지 않는다.

## Goal and Scope

화면 데이터의 소유권, 표시 코드의 읽기 흐름과 테스트 환경 준비를 개선한다.
현재 사용자 경험과 서버 계약을 바꾸는 버그 수정은 이 작업에 포함하지 않는다.

- Core 완료에는 005–007과 그 검증만 필요하다. Phase 2는 별도로 선택한 ID만 구현·검증한다.
- Approval-after 작업은 이 문서에 없다. 코드 구현 자체는 후속 구현 요청 범위에 따른다.
- 001–004, 서버 정책·DB schema·migration·plugin·권한·요금제 정책·cache·새 polling·새 의존성은 범위 밖이다.
- 새 검증 fixture는 검증 도구 안에만 둔다. 새 제품 route나 공개 테스트 endpoint를 만들지 않는다.
- 검증 도구의 현재 화면과 맞지 않는 사례를 제품 요구사항으로 되살리지 않는다.

`standard` 규모의 proposal이다. 여러 파일과 공개 진입점·Server Action 전달·검증 도구에 걸친다.
정합성 검토 프로필은 **High-Risk**다. 서버 조회 소유권 이동, 프레임워크 생성 Action 산출물과 검증 목적지가
관련되므로 상세 대조를 적용한다. 이 프로필은 최초 finding의 심각도를 올리는 분류가 아니다.

## Source Bundle and Baseline

- 기준 HEAD: `80e565c531420047becc35a8bc56f71cf9fdfee2`.
- 기준 `src` tree: `71cb6bcbdf2899a68ad0e1f13e0fa55143464d98`.
- 제안서는 미추적 파일이므로 HEAD만으로 판을 식별하지 않는다. 최종 대조 결과에는 문서 내용 digest를 별도로 기록한다.
- 선언·설치 Next.js `16.4.2`, React `19.2.8`, 설치 TypeScript `5.9.3`, strict 모드다.
- shell은 zsh이며 아래 명령은 저장소 root에서 실행한다.

현재 구현 지시의 소유자는 **이 문서 하나**다. 규칙은 `AGENTS.md`,
`docs/proposals/README.md`, `docs/proposals/template.md`와
[아키텍처 개요](../../architecture/README.md), [FSD](../../architecture/fsd.md),
[서버 경계](../../architecture/server.md), [파이프라인 실행](../../architecture/pipeline-execution.md),
[테스트 작성](../../architecture/test-writing.md), [테스트 배치](../../architecture/test-organization.md),
[검증](../../architecture/verification.md)을 따른다.
관련 completed 제안서는 과거 실행·제한 기록이며 구현 단계나 승인을 위임하는 문서가 아니다.

코드 근거 bundle은 아래 inventory, provenance, runtime·artifact, 검증 파일 목록이다.
설치 문서는 다음 경계를 확인하는 근거이며 수정하지 않는다.

- `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md`: RSC/Client 조합·직렬화.
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`: Action과 서버 조회의 구분.
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`: 미사용 Action의 build 제거·직접 POST.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`: refresh 시 client state 보존.
- `node_modules/next/dist/shared/lib/app-router-context.shared-runtime.d.ts`: 여섯 메서드와 필수 `bfcacheId`.

최초 전체 검토는 hand-authored 504파일·24,650줄의 inventory와 주요 코드의 상세 확인이었다.
이번 대조는 현재 005–009와 직접 소비·보존·검증 경계로 한정하며 전체 서버 감사를 재수행한 것으로 보지 않는다.

## UX Preservation Contract

정상·빈 데이터·읽기 전용·로딩·오류·복구 상황에서 같은 데이터와 사용자 입력에 같은 관찰 결과를 유지한다.

| 경계 | 보존 조건 |
| --- | --- |
| 표시 | 문구·작성자 label·색상·간격·아이콘·순서·링크·버튼 위치와 존재 여부 |
| 데이터 | 정렬·초기 선택·유형별 기본값·날짜·이력 제한·acceptance·assignment·문서 URL |
| 조작 | 버튼 활성화 범위, pending 중 허용/차단, 미저장 확인, 승인·거절·재개·Run 의미 |
| 상태 수명 | 입력·선택·details·메뉴의 유지/초기화, 포커스·가로 스크롤·키보드·ARIA |
| 비동기 | 조회 순서·병렬성·로딩 조건, 중복 제출 방어, 성공 후 이동/refresh, stale·unknown·재시도 |
| 서버 | guard 선행, notFound 시점, Action bind·입력·인가·다섯 설정 Action 노출, GET 무쓰기 |
| 자동 갱신 | 기존 timer·조회·refresh 유지. 새 자동 갱신·실시간 상태 판정 없음 |

외부 지연으로 달라지는 벽시계 시간을 동일하게 맞추려는 요구는 아니다. 로딩·공개 순서와
조작 가능 조건을 바꾸지 않는다. 보존할 수 없는 변경은 해당 항목을 보류하고 독립 항목만 진행한다.

### 제외한 발견 사항

| ID / 최초 심각도 | 제외 이유 | 이번 처리 |
| --- | --- | --- |
| 001 / Must | `backlog-table.tsx:60` 작성자 수정은 `You` 표시를 바꿈 | 기존 매핑 유지; 오표시를 해결했다고 보고하지 않음 |
| 002 / Should | 목록 clock 추가는 조회값 갱신 없이 표시만 만료시킴 | 현재 목록/배너 clock 유지 |
| 003 / Should | 카드 pending 공유는 형제 버튼 조작 범위를 바꿈 | 현재 pending·잠금·복구 유지 |
| 004 / Should | Run 작업별 안내는 현재 진행 문구를 바꿈 | 현재 문구·busy·닫기·복구 유지 |

002의 clock-only 권고는 철회했다. 순수 모델에서 같은 4분 후 시각에 고정 snapshot은 `silent`,
최신 heartbeat를 반영한 snapshot은 `live`였다. 서버 최신성과 시계 진행은 같은 사실이 아니다.
001–004는 Core의 선행·완료 조건이 아니며, 다시 다루려면 별도 UX 변경 범위를 정한다.

## Concrete File Inventory

M은 수정, N은 계획 당시 신규, K는 보존·검증 대상이다. **N 파일은 현재 구현·검증되었다.**
목록 밖 제품 파일 수정이 필요하면 먼저 이 문서의 범위·근거·검증을 갱신한다.

### Core 제품 코드

| ID | 작업 | 정확한 경로 |
| --- | --- | --- |
| 005 | M | `src/app/(app)/p/[slug]/items/[key]/page.tsx` |
| 005 | M | `src/app/(app)/p/[slug]/backlog/page.tsx` |
| 005 | M | `src/fsd/pages/board-item/index.ts` |
| 005 | N | `src/fsd/pages/board-item/api/board-item-page.server.ts` |
| 005 | N | `src/fsd/pages/board-item/index.server.ts` |
| 005 | N | `src/fsd/pages/project-backlog/api/project-backlog-page.server.ts` |
| 005 | N | `src/fsd/pages/project-backlog/index.server.ts` |
| 006 | M | `src/app/(app)/p/[slug]/pipeline/page.tsx` |
| 006 | M | `src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx` |
| 006 | M | `src/fsd/features/edit-pipeline/ui/pipeline-list.tsx` |
| 006 | M | `src/fsd/features/edit-pipeline/ui/pipeline-rules-panel.tsx` |
| 007 | M | `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` |

005의 기존 type·UI·표시 본문 소유 파일은 보존한다:
`src/fsd/pages/board-item/ui/board-item-page.tsx`, `src/fsd/pages/board-item/model/item-docs.ts`,
`src/fsd/pages/project-backlog/ui/project-backlog-page.tsx`, `src/fsd/pages/project-backlog/ui/backlog-table.tsx`.
`src/fsd/pages/project-backlog/index.ts`와 `src/fsd/pages/project-pipeline/index.ts`도 K다.

006–007의 K 파일은 다음과 같다. 아래 경로는 모두 `src/fsd/features/edit-pipeline/`를 기준으로 한다.

```text
index.ts
index.server.ts
api/pipeline-settings.server.ts
api/automatic-scout.server.ts
api/run-pipeline.server.ts
api/edit-pipeline.server.ts
ui/pipeline-run-panel.tsx
ui/automatic-scout-control.tsx
ui/pipeline-panel.tsx
model/use-pipeline-navigation.ts
model/pipeline-draft-state.ts
model/pipeline-save-state.ts
model/rail-state.ts
model/insertion-conflicts.ts
model/run-pipeline-input.ts
```

### Phase 2 제품·helper 코드

| ID | 작업 | 정확한 경로 |
| --- | --- | --- |
| 008 | N, 테스트 전용 | `src/fsd/shared/lib/testing/index.ts` |
| 008 | N, 테스트 전용 | `src/fsd/shared/lib/testing/app-router.ts` |
| 009 | M | `src/fsd/widgets/turn-banner/api/turn-data.server.ts` |
| 009 | M | `src/fsd/widgets/turn-banner/model/turn.ts` |
| 009 | K | `src/fsd/widgets/turn-banner/index.ts`, `src/fsd/widgets/turn-banner/index.server.ts` |
| 009 | K | `src/fsd/widgets/turn-banner/ui/turn-banner.tsx`, `src/fsd/widgets/turn-banner/ui/runner-line.tsx`, `src/fsd/widgets/turn-banner/model/runner.ts` |
| 009 | K | `src/app/(app)/p/[slug]/layout.tsx`, `src/server/runners/api.server.ts`, `src/server/runners/runner-service.ts` |

008은 도메인 fixture 없는 shared 테스트 unit이다. `@/fsd/shared/lib/testing`만 소비하며
unit의 `index.ts`는 테스트용 공개 경로다. 제품 barrel에 재수출하거나 운영 코드에서 import하지 않는다.

### 수정·추가할 검증 코드

| ID | 작업 | 정확한 경로와 책임 |
| --- | --- | --- |
| 005 | N | `tests/server/frontend-page-data.test.ts`: 두 loader, route guard/Action 조합, 필드·순서·실패 |
| 005·선택 009 | N | `tests/server/integration/frontend-page-data.test.ts`: 실제 조회 데이터·프로젝트 격리·저장 상태 불변 |
| 005–009 | N | `scripts/checks/frontend-ux-boundaries.test.mjs`: 공개 경로·옛 투영 부재·helper 운영 유입 금지 |
| 006 | M | `src/fsd/pages/project-pipeline/ui/project-pipeline-page.test.ts`, `src/fsd/features/edit-pipeline/ui/pipeline-list.test.ts`: 제거된 표시 props 준비만 정리 |
| 006 | M | `tests/server/fixtures/src-clean-code-browser.tsx`, `tests/server/fixtures/multiple-pipelines-browser.tsx`: 같은 표시 props 전달만 정리, 다섯 Action 유지 |
| 006–007 | N | `tests/server/fixtures/frontend-ux-browser.tsx`: 현재 Pipeline page/rail 독립 fixture |
| 006–007 | N | `tests/server/fixtures/frontend-ux-acceptance.ts`: 현재 UI pending·전환·ref·focus·details 검증 |
| 006–007 | M | `tests/server/fixtures/src-clean-code-browser.tsx`: 새 `ux-pipeline`·`ux-rail` mode와 `ux-only` 실행·cleanup 연결 |
| 007 | M | `src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs`: 참조 카드 초기 본문·오류·읽기 전용 |
| 009 | M | `src/fsd/widgets/turn-banner/api/turn-data.test.ts`, `src/fsd/widgets/turn-banner/model/turn.test.ts`: 입력 축소·존재 확인/실패·표시 |
| 선택 범위 | M | `docs/architecture/verification.md`: 새 검사 목적지·fixture mode·실행 경로만 등록 |

008 선택 시 아래 **13개 전부**의 AppRouterContext 준비를 교체한다.
PathnameContext·SearchParamsContext와 화면 assertion은 유지한다.

```text
src/fsd/features/change-item-pipeline/ui/change-pipeline-control.test.ts
src/fsd/features/edit-pipeline/ui/automatic-scout-control.test.ts
src/fsd/features/edit-pipeline/ui/pipeline-list.test.ts
src/fsd/features/manage-project-connection/ui/project-connection-control.test.ts
src/fsd/features/manage-token/ui/token-names.test.ts
src/fsd/features/review-gate/ui/acceptance-failure.test.ts
src/fsd/features/review-gate/ui/inbox-card.test.mjs
src/fsd/pages/board-item/ui/board-item-page.test.ts
src/fsd/pages/project-list/ui/project-list-page.test.mjs
src/fsd/pages/project-pipeline/ui/project-pipeline-page.test.ts
src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts
src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts
src/fsd/widgets/turn-banner/ui/turn-banner.test.ts
```

공통 보존 검증은 `src/fsd/pages/board-item/model/item-docs.test.ts`,
`src/fsd/pages/project-backlog/ui/backlog-table.test.mjs`,
`tests/server/project-guard.test.ts`, `tests/server/pipeline-settings.test.ts`,
`tests/server/pipeline-save.test.ts`, `tests/server/inbox-card-boundary.test.ts`다.
검증 기반 `tests/server/fixtures/load-module.ts`, `tests/server/fixtures/action-manifest.ts`,
`tests/server/register-server-only.mjs`, `tests/server/integration/support.ts`,
`scripts/test-server-integration.mjs`, `scripts/rehearsals/rehearse-src-clean-code.ts`는 K다.

### 생성·이동 preflight

구현 전 preflight에서 N 파일 11개가 없고 충돌이 없음을 확인했다. page 두 곳의 `api/`와 shared `lib/testing/`만
부모 생성이 필요하고 나머지 부모는 있다. 구현 직전에 재확인하고 다른 작업의 파일을 덮어쓰지 않는다.

제품 파일 전체 삭제·route 이름 변경은 없다. 이동하는 것은 route의 조회·투영 책임과 `toItemDocs` 소비 경로다.
옛 route의 해당 구현 부재, 새 loader의 존재, public API 연결을 함께 검사한다.
새 loader에는 `import "server-only"`를 쓰고 `"use server"`를 쓰지 않는다.

## Import / Export Provenance

표의 pages/features/shared는 `src/fsd` 아래다. 서버·core export와 기존 Action 구현은 수정하지 않는다.

| 필요한 symbol | 현재 owner → 공개 경로 | 변경 후 소비·검증 |
| --- | --- | --- |
| `loadBoardItemPage` (신규) | 상세 route → `pages/board-item/api/board-item-page.server.ts` → 새 `index.server.ts` | 상세 route가 `@/fsd/pages/board-item/index.server`에서 import; V-005·V-BND |
| `loadProjectBacklogPage` (신규) | Backlog route → `pages/project-backlog/api/project-backlog-page.server.ts` → 새 `index.server.ts` | Backlog route가 해당 `index.server`에서 import; V-005·V-BND |
| `toItemDocs` | `pages/board-item/model/item-docs.ts` → 현재 `index.ts` | 새 loader에서 `../model/item-docs` 상대 import. 외부 제품 소비가 없어지는 `index.ts` 재수출만 제거; 내부 테스트 유지 |
| `BoardItemView`, `BoardItemPage`, `ProjectBacklogPage`, `BacklogRow` | 각 기존 ui 파일; component만 기존 `index.ts` 공개 | loader는 같은 slice에서 type-only 참조. UI 구현을 런타임 import하지 않음 |
| `prisma` | `src/server/db.ts` | 두 loader api segment에서 기존 `@/server/db` import |
| `projectAccess`, `planForProject` | `src/server/projects/entitlement.ts` → `projects/api.server.ts` | 상세 loader는 둘 다, Backlog loader는 access만; 순서 유지 |
| `loadProjectRepository`, `loadProjectRoster` | `projects/repository-query.ts` → 각각 `projects/api.server.ts`, `projects/api.ts` | 상세는 Repository, Backlog는 Roster; 동일 projectId |
| `getWithHistory`, `hasHistoryBefore`, `backlogWithStatus` | `pipeline/board-service.ts` → `board.ts` → `pipeline/api.server.ts` | 상세는 앞의 둘, Backlog는 마지막; 동일 읽기 |
| `loadItemPipelineView`, `loadPipelinesView`, `loadPipelineChanges` | `pipeline/run-service.ts` → `pipeline/api.ts` | 상세는 셋 모두, Backlog는 View만 |
| `historyCutoff`, `readSelectionDecision`, `routePipeline` | `packages/core/plans/entitlement.mjs`, `pipeline/work-selection.mjs`, `pipeline/pipeline.mjs` | 기존 `@harness/core/...` 경로로 각 loader에서 import |
| `readBacklogQuery`, `BacklogQuery` | `src/fsd/shared/routes/project.ts` | 파서는 route 유지. Backlog loader는 query 데이터와 필요한 공개 타입만 참조 |
| `addBacklogItem`, `removeBacklogItem`, `updateBacklogItem` | `features/edit-backlog/api/edit-backlog.server.ts` → `features/edit-backlog/index.server.ts` | Backlog route의 add/remove 및 선택 key의 update bind 유지 |
| `proposeItem`, `changeItemPipeline` | 각각 `features/propose-item/api/propose-item.server.ts`, `features/change-item-pipeline/api/change-item-pipeline.server.ts` → 각 `index.server.ts` | Backlog·상세 route의 기존 slug bind 유지 |
| `humanTransition`, `retryAcceptance` | `features/review-gate/api/review-gate.server.ts` → `features/review-gate/index.server.ts` | 상세 route의 transition/retryAcceptance bind 유지 |
| `archivePipelineAction`, `renamePipelineAction`, `setDefaultPipelineAction`, `setPipelineRuleAction`, `setAutomaticPickAction` | `features/edit-pipeline/api/pipeline-settings.server.ts` → `features/edit-pipeline/index.server.ts` | Pipeline route의 다섯 settings bind·V-MAN 유지 |
| `savePipeline`, `prepareRunAction`, `startRunAction`, `startProjectRunAction`, `stopProjectRunAction`, `approveProjectGateAction` | `features/edit-pipeline/api/edit-pipeline.server.ts`, `api/run-pipeline.server.ts` → 기존 `index.server.ts` | Pipeline route의 save/runActions bind 유지. 일반 서버 callback으로 감싸지 않음 |
| `PipelineSettingsActions`, `SaveAutomaticScoutAction` | edit-pipeline의 `ui/pipeline-list.tsx`, `ui/automatic-scout-control.tsx` → `index.ts` | 다섯 설정 멤버 유지. Page의 미사용 Scout type import만 제거; public export 유지 |
| `ReferencedPipelineCard` (신규 내부) | rail 축약 참조 JSX → 같은 `pipeline-rail.tsx` top-level 함수 | export 없음; parent key/ref/상태 유지; V-007 |
| `withAppRouterTestContext` (신규) | `shared/lib/testing/app-router.ts` → `testing/index.ts` | 13개 테스트의 공개 unit import; V-008·V-BND |

## Implementation Contracts

### SRC-CC-005 — page 조회·투영 소유권

새 loader는 조회만 수행하며 auth·redirect·notFound·Action bind를 소유하지 않는다.

`loadBoardItemPage(projectId, key)`는 `{ item, pipelineChoices, canWrite } | null`을 반환한다.
반환 타입은 기존 BoardItemView/Page props의 type-only 참조로 표현한다.

1. `projectAccess` → `planForProject` → 그 시점의 `new Date()`로 cutoff → Repository/getWithHistory 병렬 조회 순서를 유지한다.
2. row가 없으면 즉시 null. 있으면 ItemPipeline/View/Changes를 병렬 조회하고 cutoff가 있을 때만 hasHistoryBefore를 호출한다.
3. query 병합·catch·cache·retry를 추가하지 않는다. route는 params→requireProjectOwner→loader→null이면 notFound→Page 조합을 담당한다.
4. item은 현재 route의 `id/pipeline/key/title/area/agent/status/reason/selectionDecision/results/validation/proposedOn/acceptedAt/acceptanceFailure/updatedAt/docs/events/reports/repo/historyTruncated` 전부를 보존한다.
5. updatedAt만 기존 ISO 변환, 나머지 Date 유지, 첫 failure/null, report acceptance와 event pipeline 이름 결합·순서를 유지한다.
6. pipelineChoices는 runnable이 null이 아니고 현재 pipeline과 다른 항목의 id/name을 기존 순서로 반환한다.
7. changePipeline/retryAcceptance/transition의 기존 slug bind는 route에 유지한다.

`loadProjectBacklogPage(projectId, query: BacklogQuery)`는
`{ rows, roster, pipelines, preselected, canWrite, editingItem }`을 반환한다.
editingItem은 기존 editing.item 데이터 또는 undefined이며 Action이 아니다.

- items/roster/view의 기존 병렬 조회 후 access를 읽고 editKey 검색·rows 투영·runnable 필터·preselected를 계산한다.
- rows의 key/title/area/source/status/removedAt/type/addedBy/removedReason과 editingItem의 key/title/area/source/type,
  roster 순서·routePipeline/Default 선택을 그대로 유지한다.
- route는 params/searchParams→guard→readBacklogQuery→loader 순서다. includeRemoved를 그대로 Page에 전달한다.
- editingItem이 있을 때만 `updateBacklogItem.bind(null, slug, editingItem.key)`로 기존 editing 객체를 조립한다.
  add/remove/propose bind, Page key·입력 reset 조건을 유지한다.

근거는 [상세 route](../../../src/app/(app)/p/[slug]/items/[key]/page.tsx)와
[Backlog route](../../../src/app/(app)/p/[slug]/backlog/page.tsx)다.
서버 정책을 복제하지 않고 adapter의 정확한 데이터 전달·거부 선행·실패 전파를 검증한다.

### SRC-CC-006 — 미사용 표시 props만 제거

제거 집합은 Page의 `autoScoutEnabled/canChangeAutoScout/saveAutoScout/autoProposeEnabled`,
List·RulesPanel의 `autoProposeEnabled/automationControls`다.
Page의 미사용 SaveAutomaticScoutAction import와 List/RulesPanel의 해당 ReactNode import도 정리한다.
route의 `...view`는 `pipelines={view.pipelines}`, `rules={view.rules}`로 좁힌다.

**유지 집합:** PipelineSettingsActions의 archive/rename/setDefault/setRule/setAutomaticPick 다섯 멤버,
route의 다섯 bind, setAutomaticPickAction import·export·구현, saveAutomaticScout 구현·export,
서버 auto flags·initialGraph·DB 필드다.
[기존 fresh 검사](../../../tests/server/pipeline-settings.test.ts)는 다섯 설정 Action의 registry 노출을 요구한다.
Next 문서도 미사용 Action의 build 제거를 설명하므로 UI 미사용만으로 이 계약을 삭제하지 않는다.

두 정적 테스트와 두 브라우저 fixture의 제거 대상 props만 정리한다.
automationControls 부재 assertion은 `Object.hasOwn(list.props, "automationControls") === false`처럼
실제 속성 부재를 검사하도록 유지한다. 사라진 타입의 필드 접근은 남기지 않는다.
Action identity·project key·saved definition·read-only·Run/Run rules의 본문 기대값은 바꾸지 않는다.

### SRC-CC-007 — 축약 참조 카드 표현만 추출

같은 파일 top-level의 비공개 ReferencedPipelineCard로 현재 rail 171–178행의 내부 div만 옮긴다.
**펼침 branch·NodeCard·EdgeSlot은 이번에 추출하지 않는다.**

parent에서 이름, expand 결과, canEdit, busy || pending, removeNode의 Step과 좁은 callback을 계산한다.
Open pipeline의 활성 조건, Remove의 가시성/disabled를 그대로 전달한다.
child는 같은 div·class·details·summary·본문·버튼을 반환하며 wrapper DOM을 추가하지 않는다.
parent의 key/registerStep/ARIA group·describedby/conflict span/showConflicts/저장본·초안 계산은 유지한다.

동일 항목의 rerender에서 details·focus를 보존한다. 원래 expanded 전환으로 바뀌는 트리와
새 remount를 혼동하지 않는다. 렌더 함수 안에 component를 정의하거나 key를 바꾸지 않는다.

### SRC-CC-008 — 테스트 전용 router unit

`withAppRouterTestContext(element, overrides?)`는 완전한 기본 router와 override를 사용한
AppRouterContext.Provider ReactElement를 반환한다. 각 테스트가 기존 renderToStaticMarkup을 호출한다.
타입은 설치 AppRouterInstance 또는 Context value의 non-null 타입을 따르며 bfcacheId와
back/forward/refresh/push/replace/prefetch를 모두 제공한다. 객체는 호출마다 만들어 전역 mutable 상태를 공유하지 않는다.

helper는 React createElement·Next 내부 Context만 의존하고 DOM root·timer·listener를 등록하지 않는다.
PathnameContext·SearchParamsContext는 실제 값을 소유한 테스트에서 기존 nesting대로 유지한다.
.mjs 두 테스트를 포함한 13개는 현재 node --import tsx 경로로 검증한다.
browser fixture와 운영 코드를 이 helper로 통합하지 않는다.

### SRC-CC-009 — 미사용 SetupState 입력 제거, 존재 확인 보존

SetupState.autoScoutEnabled와 deriveTurn 호출의 해당 값만 제거한다.
loadTurn의 project findUniqueOrThrow는 **원래 Promise.all 위치와 await 경계를 유지**하고
select를 `{ id: true }`로 좁힌다. 조회 결과를 표시 모델에 전달하지 않는다.
쿼리 수 감소가 목적이 아니며 존재 확인·DB 실패 전파를 보존한다.

[readRunnerState](../../../src/server/runners/runner-service.ts)도 별도 transaction에서 프로젝트를 읽지만
서로 다른 시점의 조회가 항상 같은 실패를 보인다는 보장은 없다. layout guard/조회가 있다는 이유로 삭제하지 않는다.
server/core 자동화 flag는 별개로 유지한다.

turn-data 테스트에 project 조회 reject 시 loader가 실패를 그대로 전파하는 사례를 보완한다.
turn 모델 테스트는 제거 입력 준비만 정리하고 setup·acceptance·runner 기대값을 보존한다.
schema·generated·layout·clock은 변경하지 않는다.

## Runtime Behavior Matrix

| 경계 | 시작·전이·종료 및 실패 보존 | 검증 |
| --- | --- | --- |
| 상세 GET | guard 실패는 loader 전 종료; row null은 후속 pipeline 조회 없이 route notFound; 성공은 전체 DTO; DB 오류는 기존 boundary로 전파 | V-005·V-DB·V-HTTP |
| Backlog GET | 같은 removed/edit; 기존 병렬 읽기 후 access; 편집 존재 여부에 따른 form key·bind | V-005·V-DB·V-HTTP |
| Pipeline settings | 같은 다섯 Action·인가·플랜·입력·성공 revalidation; no-op 표시 props만 제거 | V-006·V-MAN |
| Rail 편집 | 저장본·초안 분리, pending 차단, stale/unknown 명시적 복구, 새 snapshot/plan/roster/project 처리 유지 | V-007·V-UX |
| Rail ref·focus | parent key/ref·conflict scroll, details·keyboard·menu; 기존 map/effect cleanup. 호출/DOM 정체성은 fixture, 실제 이동·배치는 production CSS 화면에서 확인 | V-UX·V-HTTP·V-BND |
| 테스트 router | render마다 독립 context; pathname/search params 유지; 실제 navigation 보장 아님 | V-008 |
| Banner | 기존 병렬 읽기·존재 확인·실패 전파; 같은 turn/inboxCount/runner·clock | V-009·V-DB·V-HTTP |

새 state machine·subscription·polling·cache·transaction 정책은 없다.
refresh가 client state를 초기화한다고 가정하지 않는다. 새 fixture의 owned root·Promise·listener·history/location·
global 상태는 매 사례 종료·pagehide·Finish에서 정리한다. 상태 보존 검증 중에는 같은 root를 유지한다.

## Final Artifact Resolution Map

| 최종 산출물 | 변경 후 승자와 본문 의존성 | 검증 |
| --- | --- | --- |
| `/p/[slug]/items/[key]` HTML/RSC | route→새 loader→기존 BoardItemPage. item-docs/entities board-item, history-feed, review-gate의 표시·URL | 전체 field/link/order·escaping·읽기 전용·없음/오류; V-005·V-HTTP |
| `/p/[slug]/backlog` HTML/RSC | route→새 loader→기존 ProjectBacklogPage/Table/Form/ProposeButton | rows·작성자·removed/edit·기본 pipeline·form key·bind; V-005·V-HTTP |
| `/p/[slug]/pipeline` 초기·갱신 본문 | 기존 route→Page→List/Rules/Run/Rail; 참조 카드만 내부 component | 문구·정의 순서·저장본 텍스트·controls·query·조작; V-006·V-007·V-UX·V-HTTP |
| 프로젝트 배너 | 기존 project layout→loadTurn→deriveTurn/runnerFacts→TurnBanner | 동일 데이터·접근별 노출·기존 clock; V-009·V-HTTP |
| Action/client registry | `.next/server/server-reference-manifest.json`의 filename/exportedName/worker와 route client-reference manifest | 다섯 settings·기존 mutation 유지, loader/helper 비노출; V-MAN·V-BND |
| 정적 테스트 HTML | 기존 component/데이터→새 Context wrapper | 동일 assertion, helper 자체 DOM 없음; V-008 |

route/config 우선순위 변경은 없다. `src/app/layout.tsx`, `src/app/(app)/layout.tsx`,
`src/app/(app)/p/[slug]/layout.tsx`, `src/app/globals.css`,
`src/app/_fonts/schibsted-grotesk-normal.ttf`, `src/app/_fonts/fragment-mono-regular.ttf`,
공용 UI·label·URL formatter는 그대로 승리한다.
bare fixture HTML은 production CSS/font/RSC 증거가 아니므로 시각·본문 확인은 실제 Next route에서 수행한다.

`prisma/schema.prisma`, `src/generated/prisma/client.ts`와 연결 generated types,
`package.json`, `package-lock.json`, `tsconfig.json`, `next.config.mjs`, `eslint.config.mjs`,
`scripts/build.mjs`, `.github/workflows/check.yml`은 읽기 전용 기반이다.
metadata image·public 자산·외부 OAuth·plugin 배포는 이 변경의 내용·소비·검증 경계가 아니므로 제외한다.

## Execution and Verification Plan

1. 기본 Core 005–007과 추가 선택할 Phase 2를 구분한다. 현재 component를 쓰는 browser fixture와 기존 route 관찰 사례를 먼저 준비한다.
2. **제품 수정 전** 기존 정적 테스트·현재 route 데이터/본문·새 opt-in DOM 사례를 실행해 기준 결과를 기록한다. 아직 없는 loader/helper와 옛 위치 부재 검사는 이 단계에서 실행하지 않는다. 구형 suite 실패는 새 UX 사례와 합산하지 않는다.
3. 005→006→007을 각각 구현하고 신규 loader·경계·실제 DB 테스트를 연결해 검증한다. 선택된 008·009도 구현과 함께 목적지 검증을 추가한다.
4. 실제 Next build·registry·HTTP·browser 결과와 scope guard를 대조한다. 차이가 나면 수정하거나 되돌린다.
5. 실제 수행한 범위·환경·보류를 기록한다. 문서 clean pass와 제품 회귀 통과는 별개다.

### 검증 목적지

| ID | 목적지·구체적 assertion |
| --- | --- |
| V-005 | 신규 `tests/server/frontend-page-data.test.ts`에서 load-module double로 두 새 loader의 전체 DTO·nullable·Date/null/order·조회 순서·실패를 검사. 실제 route의 guard 선행·notFound·Action 참조/bind도 확인. 서버 공개 API를 mock하며 private export를 늘리지 않음 |
| V-006 | 기존 page/list 정적 테스트: props 부재, 동일 Action object·project key·saved/read-only HTML. 기존 다섯 settings 동작 시험 유지 |
| V-007 | 기존 rail 테스트에 축약 참조의 성공/누락·단계/게이트·disabled·문구 보완. Read as text 저장본/초안 독립성 유지 |
| V-008 | 13개 전체의 기존 assertion·발견·타입, Context 독립성·운영 graph 비유입 |
| V-009 | 기존 turn-data/turn 테스트: SetupState 축소·존재 확인 성공/실패 전파·기존 결과 |
| V-DB | 신규 `tests/server/integration/frontend-page-data.test.ts`: 격리 DB의 실제 loader 결과와 프로젝트 격리, 조회 전후 저장 상태 불변. 선택 009는 loadTurn도 같은 방식으로 확인 |
| V-BND | 신규 `scripts/checks/frontend-ux-boundaries.test.mjs`: 아래 존재/부재 표를 AST·모듈 해석으로 검사. test:architecture/test:scripts에서 발견 |
| V-MAN | fresh build 후 기존 manifest 검사. 두 loader와 helper의 Action 비노출·영향 route client graph 비유입을 신규 frontend-page-data 시험의 `fresh` 사례로 보완 |
| V-UX | 새 frontend-ux fixture 두 파일과 기존 entry의 opt-in 연결. 현재 catalog→editor→Rules/Run/ref card의 DOM·상태·callback을 확인. CSS에 의존하는 실제 이동 거리·레이아웃은 증명하지 않음 |
| V-HTTP | 기존 실제 Next 인수 서버에서 owner/item/pipeline/backlog의 최종 body·CSS/font·필드·실제 focus/scroll/keyboard를 전후 대조. 저장 상태 불변은 V-DB로 별도 입증하며 화면 관찰만으로 무쓰기를 주장하지 않음 |

V-BND의 전체 조건은 다음과 같다.

| symbol·경계 | 허용 목적지 | 금지·부재 |
| --- | --- | --- |
| 두 새 loader | 각 api/index.server·해당 route·검증 | client index 재수출, use server, client import 없음 |
| 이동 query/투영 | loader의 provenance 표 전체 symbol | route의 prisma/query/core 투영·toItemDocs 제거; guard/notFound/파서/Action bind 유지 |
| toItemDocs | 원래 model·같은 slice loader·내부 테스트 | board-item index.ts 재수출·route 호출 없음 |
| 제거 표시 props | server/core 정책과 독립 Scout control은 유지 | Page/List/Rules의 지정 타입·전달·본문에 006 제거 집합 없음 |
| setAutomaticPickAction | 기존 route bind·index.server·구현·테스트 | 삭제·이름 변경·registry 기대 완화 없음 |
| ReferencedPipelineCard | 같은 파일 top-level 비공개 | 새 export·slice·wrapper DOM·렌더 내부 정의 없음 |
| withAppRouterTestContext | 테스트 unit과 13개 테스트 | 운영 import/re-export 없음; 13곳 AppRouterContext 직접 import 없음 |
| SetupState.autoScoutEnabled | server/core 동명 정책은 유지 | turn 입력·호출에서만 제거; project findUniqueOrThrow 유지 |

008 미선택이면 helper/13개 교체는 검사하지 않는다. 009 미선택이면 기존 입력·조회 유지가 scope guard다.
API·본문 소유권의 구조 자체가 계약인 부분만 구조 검사로 고정한다.

V-DB는 기존 `tests/server/integration/support.ts`의 connections/fixture/cleanup을 사용하고,
`index.server.ts`의 실제 loader를 호출한다. 사용자·프로젝트 두 개를 만들어 같은 key의 타 프로젝트 데이터가
섞이지 않는지, missing key·removed/edit·선택·history/report/acceptance 결과를 확인한다.
조회 전후 자기 fixture의 Project, BacklogItem, BoardItem, Pipeline, PipelineDefinition, PipelineVersion,
PipelineRule, PipelineRun, TransitionEvent, Report, AcceptanceFailure 행을 snapshot하여 같음을 검사한다.
Project는 fixture projectId로 단건 조회하고, BacklogItem/BoardItem/Pipeline/PipelineVersion/PipelineRule은
projectId, PipelineDefinition은 pipeline.projectId, 나머지는 boardItem.projectId 관계로 범위를 제한한다.
복수 행은 id 순서로 정렬하되, id가 없는 PipelineRule은 실제 복합 기본키인 projectId/type 순서로 정렬한다.
현재 GET이 호출하는 읽기 서비스·READ ONLY transaction을 실행하며 그 결과를 double로 대체하지 않는다.
선택 009는 존재하는 project와 삭제된 자기 fixture project의 loadTurn 성공/거부를 확인한다.
테스트 finally에서 자기 fixture 사용자와 연결만 정리한다. 시험이 만들지 않은 사용자 데이터는 조회·삭제하지 않는다.

### 브라우저 fixture 보완

기존 src-clean-code-acceptance의 일부 pipeline-page 사례는 현재 보이지 않는 Automatic scouting과
옛 직접 editor 진입을 전제로 한다. `scripts/rehearsals/rehearse-multiple-pipelines-browser.mjs`도
초기 Pipelines heading을 기대하지만 현재는 All pipelines다. 이 suite를 그대로 새 UX의 성공 기준으로 쓰지 않는다.

새 frontend-ux-browser는 ux-pipeline/ux-rail을 제공한다. Page fixture는 실제 ProjectPipelinePage,
완전한 local router, SearchParamsContext, 현재 PipelineSnapshot을 사용하고 catalog부터 정의를 연다.
Run 준비·응답은 기존 `model/run-pipeline-input.ts`의 PipelineRunActions/RunPreparation 계약을 사용한다.
rail fixture는 실제 참조·누락·충돌을 포함한다. 공개 component는 public API를 사용한다. 내부 rail은 기존 entry의 참조를 prop으로 전달하여 새 비공개 FSD import를 추가하지 않는다.
Phase 2 helper에 의존하지 않는다.

새 frontend-ux-acceptance는 동일 root props 갱신, details·activeElement·스크롤 대상 ref/호출 인자, readonly,
pending success/error/stale/unknown, 미저장 확인·뒤로가기·project 교체·unmount를 확인한다.
응답은 제어 가능한 Promise로 보류/정산하고 bounded 조건 assertion을 사용한다.
Run의 시작/중지/승인 문구는 현재 그대로 기대한다.
scrollIntoView 관찰이 필요하면 fixture가 소유한 관찰 범위에서 대상과 현재 `{ block: "nearest", inline: "center" }`를
확인하고 원래 메서드를 finally에서 복원한다. 이 결과를 실제 CSS에서의 가로 스크롤 위치로 해석하지 않는다.

기존 entry는 ux-only query에서 새 suite만 선택하고 autorun·Run acceptance·Finish·cleanup에 연결한다.
기본 suite와 과거 결과는 유지한다. partial router·SearchParams 부재를 제품 코드 수정으로 해결하지 않는다.
결과는 case/expected/observed/Pass-or-Fail로 /results에 기록한다.

### 명령·준비 조건

다음은 **후속 구현 후** 실행한다. 신규 파일은 아직 없으므로 지금 통과했다고 표시하지 않는다.

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm run test:web
npm run test:server
npm run build

RDC_CHECK_ACTION_MANIFEST=true SRC_CHECK_INBOX_MANIFEST=true GITHUB_CHECK_ACTION_MANIFEST=true \
  node --import ./tests/server/register-server-only.mjs --import tsx \
  --test --test-name-pattern='\bfresh\b' "tests/server/*.test.ts"
```

새 .test.ts는 tests/server 패턴, .test.mjs는 scripts 재귀 패턴에 포함한다.
실제 DB의 새 파일은 별도의 `tests/server/integration/*.test.ts` 패턴에 포함되며 다음 명령으로 실행한다.
이 명령은 격리 TEST_DATABASE_URL 안전 검사 후 migration을 적용하고 테스트를 실행하므로 문서 검토·replay에서 자동 실행하지 않는다.

```bash
npm run test:server:integration
```

새 .test.tsx runner·CI 변경은 필요 없다. check의 typegen/tsc, build의 Prisma/Next 출력은 쓰기 동작이므로
읽기 전용 replay 명령으로 분류하지 않는다.

DOM fixture는 DB 없이 기존 서버를 사용한다. 한 번에 하나씩 실행하고 Finish 후 다음 모드를 실행한다.

```bash
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only --fixture-development
```

각 실행에서 `http://127.0.0.1:55452/fixture?mode=ux-pipeline&ux-only&autorun`을 열고
/results에 새 suite의 모든 사례가 있는지 확인한 뒤 /finish로 종료한다.
plain fixture는 CSS/font를 포함하지 않으므로 DOM·상태 검증에만 사용한다.
레이아웃·overflow·포커스 이동의 시각적 결과·CSS에 따라 달라지는 키보드 도달성은 아래 실제 Next 화면에서 확인한다.

실제 Next body·시각 비교는 fresh build와 migration이 적용된 격리 TEST_DATABASE_URL을 준비한다.
환경값은 저장소 밖 설정으로 주입하고 운영 DATABASE_URL을 대체 사용하지 않는다.
기존 validateTestDatabase를 통과해야 하며 포트 55451·55452는 비어 있어야 한다.

```bash
node --import ./tests/server/register-server-only.mjs --import tsx \
  scripts/rehearsals/rehearse-src-clean-code.ts
```

/owner, /owner-item, /owner-pipeline에서 fixture owner 세션을 열고 같은 project의 Backlog 탭도 확인한다.
최종 body의 Documents/History/Assignment/Acceptance·Backlog 편집/removed·Run rules/rail·공통 배너를 대조한다.
기존 fixture에 없는 선택적 섹션은 부재 상태를 비교한다. 전체 DTO의 양성/음성 사례는 V-005·V-DB가 맡으며,
해당 데이터를 실제 HTTP로 관찰하지 않았다면 그 사례까지 통과했다고 보고하지 않는다.
권한·missing·일시 오류는 V-005 경계 시험으로 보완하고, 실제 HTTP에서 확인하지 않은 실패는 구분해 기록한다.
같은 데이터·viewport·폰트 준비 상태·색상 모드의 전후 화면과 keyboard 동작을 비교한다.
참조 카드·충돌·가로 overflow 사례가 기본 fixture에 없으면 격리된 자기 project의 기존 UI로 보조 정의를 만들고,
그 설정·진입·조작 순서를 변경 전후 동일하게 재현한다. 이 준비에는 실제 runner 실행을 포함하지 않는다.
실제 CSS에서 details 열기·키보드 이동·충돌 대상의 가로 스크롤·panel 닫힘 후 포커스를 관찰해야 하며,
사례를 만들거나 관찰하지 못했으면 해당 검증은 미실행으로 남긴다.
실행마다 생성되는 fixture ID·시각은 원시 HTML/이미지 바이트의 일치 대상에서 구분한다.
각 실행의 원본 값과 렌더된 값의 정확한 대응·형식·정렬은 별도로 검사하고, 비교용 값 정규화가
문구·순서·선택값·레이아웃 차이를 숨기지 않게 적용 범위를 기록한다. 고정 가능한 업무 입력은 동일하게 둔다.
build/fixture 식별자·관찰 결과를 남기고 /finish 후 자기 사용자·DB fixture·Next child·listener 정리를 확인한다.

기존 runner는 새 fixture를 번들링할 뿐 제품 route를 추가하지 않는다.
다른 오래된 HTTP suite의 Automatic scouting assertion을 완화해서 이 작업 검증을 대체하지 않는다.

## Definition of Done and Scope Guard

- 선택된 Core/Phase 2의 파일·symbol·post-change 목적지 검증이 모두 연결되어 있다.
- 005의 전체 DTO·guard 선행·null/notFound·조회 순서·Action bind가 기준과 같다.
- 006의 제거 집합만 사라지고 다섯 설정 Action·현재 UI·서버 초기 호환은 유지된다.
- 007의 동일 입력·동작에 DOM 의미·문구·상태 수명·focus/scroll/ARIA가 유지된다.
- bare fixture의 callback 검사와 production CSS에서의 실제 위치·키보드·포커스 관찰을 구분하며, 하나로 다른 하나를 대체하지 않는다.
- 선택 008의 13개 테스트가 발견·통과하며 helper는 운영 graph에 없다.
- 선택 009의 존재 확인·오류·await 경계와 turn/inboxCount/runner가 유지된다.
- 관련 테스트·V-DB 실제 저장 상태 비교·fresh build·registry·최종 body/DOM/시각 비교의 실행/미실행을 구분한다.
- 필수 검증이 미실행이면 제품 UX 보존 완료를 주장하지 않는다. 기존/신규 실패·skip을 분리한다.
- 001–004, server/core 정책·schema·generated 수동 편집·config·CSS·font·UI copy·새 timer 변경이 없다.
- build의 ignored 생성물과 수동 변경을 구분하고 의도하지 않은 추적 파일 변경을 포함하지 않는다.
- 실제 선택 범위·보류를 기록하며 미선택 Phase 2를 Core 완료 조건으로 되살리지 않는다.

## Verification Results and Reconciliation Notes

이 절은 구현 전 reconciling-proposals-with-codebase의 INV-1–INV-7 문서 대조 기록이다.
당시 no-edit 판정·source digest는 해당 응답의 anchor/receipt에 기록했다.
실제 코드 구현·검증 결과는 위 Implementation Results와 구분한다.

| 해결한 문서 문제 | 반영 위치 |
| --- | --- |
| 목적지·helper·13개 소비처가 모호함 | inventory·preflight·provenance |
| route의 null/notFound·조회 순서·Action 구분 누락 | 005·runtime·V-005·DoD |
| Action 전달 삭제와 다섯 registry 검사 충돌 | 006 props만 정리·V-MAN·scope guard |
| query 삭제의 오류 의미가 미해결 | 009 존재 확인 유지·실패 전파 |
| 구형 fixture·bare HTML 검증 한계 | 현재 UI opt-in suite·실제 Next body/visual 분리 |
| optional/Core·목적지·존재/부재 연결 부족 | 실행 분류·V-BND·검증·DoD |
| 기준선 전에 미존재 목적지를 검사할 수 있는 단계 혼동·GET 무쓰기 관찰 부족 | 현재 화면 기준선과 신규 목적지 검증 분리·V-DB 추가 |
| CSS 없는 fixture의 scroll/배치 보장과 실행별 ID·시각 비교가 혼재 | V-UX 호출/DOM 검사와 V-HTTP 실제 화면 관찰 분리·비교 입력 기록 |

기준 router 테스트 13개와 rail·item-docs·turn-data·turn·backlog-table 5개,
총 18개 기존 파일을 `TSX_DISABLE_CACHE=1 node --import tsx --test`로 실행해 종료 코드 0을 확인했다.
이는 기존 정적·모델 계약의 기준 결과이며 새 loader·fixture·UX 불변 구현의 통과가 아니다.
이 단계에서는 DB·실제 browser·production build를 실행하지 않았으며, 후속 구현에서 위 표처럼 실행했다.

## Risks and Rollback

DTO의 선택적 필드, live DOM component identity, generated registry와 실제 화면 도달성이 구현 위험이다.
각각 V-005, V-UX, V-MAN으로 확인한다. 기존 fixture 한계를 새 제품 동작으로 숨기지 않는다.

항목별 코드·public API·소비처·테스트를 함께 되돌릴 수 있게 구현한다.
UX 차이가 나면 해당 변경을 revert하고 기준 동작을 복구한다. schema·저장 형식을 바꾸지 않으므로
data rollback은 필요하지 않다. 제외된 작성자 오표시 등은 후속 문제로 남고 해결했다고 보고하지 않는다.

## Original Review Traceability

최초 독립 렌즈 6개(Applicable 6, N/A/Unavailable/Skipped 0)와 중립 게이트 1라운드 기록이다.
전체 파일 줄별 감사나 이번 정합성 검토의 대체 증거는 아니다.
최초 11개 후보→9개 finding의 ID를 유지하며 사용자 제약과 코드 대조로 실행 범위를 좁혔다.

| Raw ID | 최초 렌즈·처분 | Canonical ID / 최초 심각도 | 현재 처리 |
| --- | --- | --- | --- |
| COH-01 | Cohesion / accept | SRC-CC-002 / Should | UX 변경 제외 |
| COH-02 | Cohesion / accept | SRC-CC-005 / Should | Core |
| CPL-01 | Coupling / accept | SRC-CC-008 / Consider | Phase 2 |
| PRE-01 | Predictability / accept | SRC-CC-003 / Should | UX 변경 제외 |
| PRE-02 | Predictability / merge-accept(SRC-CC-006) | SRC-CC-006 / Should | Core, 표시 props만 정리 |
| READ-01 | Readability / accept | SRC-CC-004 / Should | UX 변경 제외 |
| READ-02 | Readability / accept | SRC-CC-007 / Should | Core, 축약 참조 카드만 분리 |
| SIM-01 | Simplicity / accept | SRC-CC-006 / Should | 위와 같음 |
| SIM-02 | Simplicity / accept | SRC-CC-009 / Consider | Phase 2, 존재 확인 유지 |
| TS-02 | TypeScript generalist / accept | SRC-CC-001 / Must | UX 변경 제외 |
| TS-01 | TypeScript generalist / reject | 없음 | REST 등록 전용으로 최초부터 범위 밖 |

## Approval and Completion

사용자의 UX 불변 지시는 최우선 구현 제약이다. 후속 코드 구현과 commit·push·dev 대상 PR 생성 요청의 승인 기록은 front matter를 따른다.
문서의 과거 clean reconciliation과 실제 코드 검증 결과는 구분한다. 배포는 이번 범위에 포함하지 않는다.

005–009의 실제 코드·로컬 검증을 완료하여 완료 metadata를 갱신하고 completed로 이동했다.
001–004는 제외 상태이며 해결했다고 보고하지 않는다. PR은 검증한 작업 브랜치에서 dev를 대상으로 생성하며 병합·배포는 별도 범위다.
