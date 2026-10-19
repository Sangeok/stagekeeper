---
# Metadata. status value는 proposals/README.md의 세 상태만 사용합니다.
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-10-13"
updated-at: "2026-10-19"
approved-by: "user:Sangeok"
approved-at: "2026-10-19"
approval-scope: "2026-10-14: Proposal 0–6 설계와 본문 보관 예외 승인. 2026-10-19 현재 요청: 제안서 기반 구현·검증 후 commit·push·dev 대상 PR 생성 승인. 본문은 PR 검토 대상으로 제출한다. 병합·main 승격은 이번 요청 범위 밖"
completed-at: null
verification-summary: "구현 및 로컬 자동 검사 완료. check, test:web 657개, core/plugin 388개 통과. Webpack production build와 공개 HTTP·브라우저 인수 확인. 로컬 기본 Turbopack build는 포트 권한 EPERM; PR check와 사용자 본문 검토는 제출 후 확인"
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/server.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/protocol.md"
  - "docs/conventions/product-copy.md"
  - "docs/conventions/design.md"
---

# 검색 유입을 위한 공개 문서 페이지(`/docs`)

## Summary

검색으로 Stagekeeper를 처음 알게 되는 사람이 제품을 이해하고 첫 실행까지 갈 수 있도록 `/docs` 아래에 영어 문서 다섯 개를 만든다.
문서는 로그인 없이 읽을 수 있는 정적 페이지이며 검색 색인을 허용한다. 비공개 화면의 인증과 noindex는 유지한다.
설치 명령, 실제 기본 단계, 게이트 이름, 플랜 차이, 인수 확인 이름은 현재 코드에서 가져온다.

## Goal

- Claude Code로 개발 흐름을 자동으로 돌리고 원하는 지점에서 확인하려는 개발자가 제품을 이해하게 한다.
- 문서 다섯 경로, 사이트맵, 랜딩과 문서 사이의 링크를 추가한다.
- 문서가 현재 제품과 어긋나지 않도록 사실 출처, 문구 잠금, 실행 결과의 검증 기준을 둔다.

## Proposal Size

`proposal-size`: standard. 공개 라우팅·인증 목록·정적 URL·public API가 바뀌고 여러 파일에 걸친다.
정합화 검토 프로필은 **High-Risk**다. 공개 경로의 인증 경계와 메타데이터·XML·JSON-LD의 최종 산출물 우선순위를 대조한다.
DB schema, migration, 서버 권한 정책, 요금·플랜 정책은 변경하지 않는다.

## Current State

이 절은 구현 전 대조 기준이다. 이후 실제 구현과 검증 결과는 Verification Results의 구현 기록에 구분해서 남긴다.

### 대조 기준과 선행 조건

- 2026-10-19의 로컬 `dev` **`78adc6b371e1b1736c528cd0d01bee2f0eb0ddaf`**를 구현 대상 기준으로 삼는다.
  `harness/public-docs`의 기존 HEAD `320590d`는 이 기준의 커밋 34개를 포함하지 않는다. 현재 브랜치만 읽으면 최신 제품 동작을 놓친다.
- 이번 정합화에서는 `git show dev:<path>`와 해당 커밋의 읽기 전용 사본으로 코드를 확인하고 이 문서만 수정한다.
  **실제 구현 전에는 문서 변경을 보존한 상태로 최신 dev를 작업 브랜치에 통합하고 다시 대조한다.**
  dev가 위 기준에서 바뀌면 관련 파일·정책·실행 명령을 재확인한다. 이 문서 검토는 브랜치 통합·구현·커밋·PR·배포를 수행했다는 뜻이 아니다.
- 선행 SEO 설정(PR #150), README 영어화(PR #160), 여러 파이프라인(PR #163–165), 서버 모듈 정리(PR #167)는 이미 기준 dev에 있다.
  완료된 작업을 다시 구현하거나 예전 구조로 되돌리지 않는다.

직접 구현 입력은 이 문서, front matter의 related 문서 8개, `docs/proposals/README.md`, 기준 dev의 package.json·실제 소스다.
다른 과거 제안서의 예시를 현재 구현 지시로 가져오지 않는다. Next 특수 파일을 작성하기 전에는 설치 버전의 다음 자료를 확인한다.

- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
- `node_modules/next/dist/docs/01-app/02-guides/json-ld.md`
- `node_modules/next/dist/docs/01-app/02-guides/public-static-pages.md`

문서와 실제 export가 다르면 해당 버전의 `next/dist/lib/metadata/resolve-metadata.js`와
`next/dist/experimental/testing/server/middleware-testing-utils.d.ts`·실제 export도 함께 대조한다.

### 확인한 현재 동작

- 공개 화면은 `/`와 `/login`이다. `src/server/auth/config.base.ts`의 `PUBLIC_EXACT`는 `/`만,
  `PUBLIC_PREFIXES`는 `/login`만 갖는다. 후자는 로그인한 방문자를 `/projects`로 보내므로 문서 공개에 쓰면 안 된다.
- `src/app/docs/`, `src/fsd/pages/docs/`, `src/app/sitemap.ts`는 없다. `robots.ts`, 로컬 폰트, 루트 아이콘·공유 카드,
  `siteUrl()`, 랜딩 메타데이터는 있다. `src/proxy.ts`는 메타데이터와 정적 자산 경로를 인증 검사에서 제외한다.
- README는 이미 영어이며 Codex·Windows 패키징·플랜의 현재 상태를 구분한다. 영어로 재작성하지 않고 문서 링크만 추가한다.
- 제품은 이름 있는 여러 Pipeline, 기본·항목 종류별 선택, 다른 Pipeline을 사용하는 블록, 반복 가능한 Doc audit·Scout 슬롯을 지원한다.
  실행 가능한 펼친 그래프에는 Plan·Implement·Accept가 각각 한 번 필요하다. 앵커가 없는 재사용 블록에는 같은 규칙을 직접 적용하지 않는다.
- `propose`는 새 정의의 단계가 아니다. 자동 선택은 `autoProposeEnabled`, 빈 백로그의 자동 발굴은 `autoScoutEnabled`라는 별도 설정이다.
  전자는 Pro·Max의 편집 권한을 따르고, 후자는 Free에서도 바꿀 수 있다. 항목 안의 Scout 슬롯과 자동 발굴은 구별한다.
- 인수는 메인 세션이 다섯 확인을 수행하고 기록하는 단계다. `done`과 `acceptedAt`은 다르다.
  Verify는 선택 가능하며, 웹 승인과 소유자 토큰의 세션 승인은 전제가 같지 않다(`protocol.md`의 소유자 스코프·파이프라인 절).
- Codex 소스가 있다는 사실은 지원 완료를 뜻하지 않는다. 공개 문서는 승인된 Claude Code 범위를 유지하며 Codex·Windows 지원을 약속하지 않는다.
- 2026-10-13의 검색 결과 기록은 당시 관측일 뿐이다. 이번 코드 대조에서 현재 검색 색인 상태를 확인하지 않았으며 검색 성과를 완료 기준으로 삼지 않는다.

### 사실 출처와 소비 경로

| 사실 | 현재 출처 | 구현 후 소비 경로 / 주의 |
| --- | --- | --- |
| 기본 단계·게이트 | `packages/core/pipeline.mjs`: `defaultGraph`, `DEFAULT_GATES` | 문서 `model/docs-facts.ts`가 `@harness/core/pipeline.mjs`에서 import. `NODE_KINDS` 전체를 실제 흐름으로 표시하지 않는다. 호환용 `propose`가 남아 있다. |
| 선택 단계·필수 앵커·담당자 | 같은 모듈의 `OPT_IN_NODES`, `REQUIRED_NODES`, `STEP_KINDS`, `nodeAllowed`, `dispatcherFor` | 표시 가능한 종류는 STEP_KINDS와 nodeAllowed로 제한하고 기본 흐름은 defaultGraph(plan)에서 계산한다. Plan·Implement의 담당자는 사용자 dev, Accept는 메인 세션이라고 설명한다. |
| 플랜별 기능·실행 한도 | `packages/core/entitlement.mjs`: `PLANS`, `limitsFor` | 위 문서 모델에서 import. Free 20회·Pro 100회·Max 무제한의 **계정 전체 5시간 신규 실행** 한도이며 기존 실행 재개는 별개임을 설명한다. |
| 단계·게이트·승인 버튼 | `src/fsd/entities/pipeline/index.ts`: `nodeLabel`, `gateLabel`, `gateActionLabel`, `gateActionHint` | 문서 모델·화면이 entity public API로 import. 반복 슬롯 표시는 nodeLabel을 사용한다. |
| 인수 확인 1–5 이름 | `src/fsd/features/review-gate/model/gate-text.ts`: `ACCEPTANCE_CHECK_LABELS` | §4에서 `entities/pipeline/model/acceptance-checks.ts`로 이동하고 entity public API를 통해 문서와 기존 실패 화면이 함께 읽는다. |
| Claude 설치 명령 | `src/fsd/entities/project-token/model/connect-command.ts`: `PLUGIN_MARKETPLACE`, `PLUGIN_ID`, `installCommands` | §4에서 `shared/config/plugin-install.ts`로 이동. 문서와 토큰 화면이 같은 공개 unit 경로로 읽는다. |
| 시작·감시 명령 | `packages/core/client-runtime.mjs`: `clientRuntime("claude")` | 문서 모델에서 init_command·resume_command를 읽는다. 다른 클라이언트의 명령을 문서에 노출하지 않는다. |
| 자동 선택·발굴·버전·재사용 블록 | `docs/architecture/protocol.md` 파이프라인 절, product-copy.md §18, `packages/core/pipeline.mjs` | 설명문은 근거와 함께 검토한다. 편집은 새 항목에 적용되고 진행 중 항목은 실행 판에 고정된다는 기본 규칙과, 아직 실행하지 않은 Proposed 항목의 웹 변경 예외를 구분한다. |
| 감시·정지·커밋 대기 | `docs/architecture/protocol.md` 로컬 감시 절, product-copy.md §5·§15 | 메인 대화에서 실행되며 게이트를 자동 승인하거나 push하지 않는다. 실제 세션 완료 통지·재무장 등은 제품 인수 범위를 넘어 약속하지 않는다. |
| 토큰 범위·저장·만료 | protocol.md의 agent/owner 스코프·토큰 절, product-copy.md §9, `src/server/mcp/auth.ts`, `src/server/mcp/tools.ts`, `src/server/mcp/owner-tools.ts`, `packages/core/token.mjs`, `packages/core/token-validity.mjs` | 근거를 보고 본문을 작성한다. 문서 FSD에서 서버 구현이나 node:crypto를 사용하는 token 모듈을 import하지 않는다. |

## Scope

**Core**는 문서 다섯 페이지와 탐색 UI, 경로 목록·메타데이터·사이트맵, 명시적 인증 공개 목록,
랜딩 링크·새 제목/설명·WebSite JSON-LD, §4의 두 상수 이동, 문구 관리, README 링크, 아래 검증 전체다.

보존할 표면: 기존 로그인·GitHub callback과 `/projects` 도착지, API·Server Action의 인증·인가,
기존 루트 noindex와 제목, 랜딩 본문·데모·로그인별 CTA, 로컬 폰트·아이콘·공유 카드,
Claude/Codex 토큰 화면과 기존 기능·플랜 정책. 설치 명령은 이동만 하며 값·순서를 바꾸지 않는다.
구현 전부터 존재한 staged·unstaged·untracked 변경도 별도로 기록해 보존한다.
이전부터 있던 경로라는 이유로 추가 변경까지 허용하거나, 범위 밖이라는 이유로 기존 변경을 지우지 않는다.

**Out of scope**: 블로그·변경 기록·about·가격·개인정보처리방침·이용약관·다국어,
페이지별 공유 카드·추가 구조화 데이터, MDX·새 의존성·전용 E2E runner,
Codex·Windows 공개 안내, 결제·토큰 저장 방식·권한 정책·DB·private 템플릿·플러그인 실행 코드 변경,
CONTEXT.md 등 기존 문서 전체의 용어 정정, 공개 UI 전체 재설계.
Search Console 등록, 저장소 홈페이지 주소, 외부 목록 등록과 운영 배포는 이 구현의 완료 조건 밖이다.
이번 범위에 Phase 2로 미룰 Core 항목은 없다. 최신 요청에 따라 구현·검증 후 commit·push·dev PR 제출까지 수행한다.
본문은 PR 검토 대상으로 제출하고, PR 병합·릴리스는 수행하지 않는다.

## Proposal

### 0. 유지하는 결정

- 대상은 Claude Code로 개발 흐름을 자동 진행하고 고른 지점에서 확인하려는 개발자다. 공개 문서는 영어로 작성한다.
- 한 번 만들고 제품이 바뀌면 갱신한다. 상시 글 발행 기능은 만들지 않는다.
- AI 등 금지어 정책을 유지하고 가격·구매·지원 완료를 임의로 약속하지 않는다.
- 본문은 TSX에 두고 product-copy.md에 복제하지 않는다. 제목·설명·메뉴·공통 버튼은 product-copy.md가 소유한다.
  실제 제품 사실은 코드에서 계산하고, 설명문은 근거와 함께 별도로 검토한다.
- 랜딩과 문서의 셸은 각자의 책임으로 유지한다. 소비처 수만으로 공통화를 강제하지 않는 현재 FSD 기준을 따른다.

### 1. 페이지와 내용

아래 설명은 메타데이터의 구현 초안이다. 본문 첫 문단은 그 설명을 뒷받침하며, 본문 검토 때 두 내용을 함께 확인한다.
제목·설명·탐색 이름은 같은 구현에서 product-copy.md §20과 문서 레지스트리에 반영한다.

| id / 경로 | 탐색 이름 / 제목(템플릿 적용 전) | 설명(description, 155자 이내) | 본문 필수 내용 |
| --- | --- | --- | --- |
| `overview` / `/docs` | Overview / `Stagekeeper docs — Claude Code pipeline with approval gates` (absolute) | `Learn how Stagekeeper connects Claude Code to a development pipeline, approval gates, and records in your own repository.` | 제품 개요, 실제 기본 흐름과 담당자, Verified의 기록 요건, 플랜별 차이, 네 문서 링크 |
| `getting-started` / `/docs/getting-started` | Get started / `Get started` | `Connect a repository to Stagekeeper, install the Claude Code plugin, and run your first backlog item.` | GitHub 로그인 → 프로젝트 생성 → 토큰 화면의 안내 → 플러그인 설치·토큰 설정 → 같은 터미널에서 Claude Code 시작 → init·재시작/연결 확인 → 백로그·watch |
| `automation` / `/docs/automation` | Automation / `Run Claude Code on your backlog` | `See what Claude Code runs automatically, where your pipeline waits, and how picking, scouting, and acceptance work.` | 게이트 없는 구간, 감시, 자동 선택·자동 발굴·항목 Scout의 구별, 인수 다섯 확인, 게이트·커밋·실패·실행 한도에서의 대기 |
| `approval-gates` / `/docs/approval-gates` | Approval gates / `Approval gates for Claude Code` | `Choose where Claude Code waits for approval, edit pipelines, and open gates in the Inbox or from your own session.` | 기본 게이트 둘과 버튼·힌트, Pipeline 선택·재사용·반복 슬롯, 편집 적용 시점, 필수 앵커와 블록의 차이, 0게이트 경고, 웹/세션 승인 차이와 권한 |
| `security` / `/docs/security` | Security / `MCP tokens and agent permissions` | `Understand project, user, and owner tokens, their permissions, expiry, revocation, and where Stagekeeper stores records.` | hs_/hu_/ho_ 범위와 엔드포인트 구분, hu_도 게이트 승인 불가, 소유자 연결을 에이전트에 전달하지 않음, 해시·1회 노출·선택 만료·폐기, 상태와 파일의 위치 |

각 페이지의 h1은 하나이며 나머지 본문 절은 h2로 구성한다. 제목과 설명은 다섯 페이지마다 고유하다.
Verify는 선택임을 설명하고, Verified 표시는 실제 검증 기록이 있을 때만 쓴다. Free 기본 흐름은 Plan·Implement·Accept다.
Pro·Max 기본 흐름과 opt-in 여부는 계산 결과로 표시하며 모든 플랜에 모든 단계를 약속하지 않는다.

시작 안내에서 토큰을 설정하기 전에 플러그인을 설치하고, init 이후 안내된 재시작·연결 확인을 마친 뒤 watch로 간다.
명령이 터미널용인지 Claude Code 대화용인지 구분한다. **실제 토큰 값이나 토큰 설정 명령은 공개 문서에 복사하지 않는다.**
방문자는 토큰 화면이 보여 주는 셸별 안내를 따른다. 문서의 Copy는 공개 설치·init·watch 명령만 복사한다.

자동화 설명은 완전 무인 실행·자동 push·자동 게이트 승인을 약속하지 않는다. Accept는 메인 세션의 기록이며 done만으로 인수됐다고 하지 않는다.
자동 발굴은 모든 플랜에서 별도로 켜고 끌 수 있고, 자동 선택과 파이프라인 편집은 Pro부터다.
세션 승인은 Pro·Max 소유자 토큰이 필요하다. 웹·세션 모두 현재 게이트와 새 형식의 실행 회차를 확인한다.
세션의 구현 승인에는 검증 기록과 승인할 커밋 일치가 추가로 필요하다. 웹 Inbox는 이 두 추가 전제 없이 승인할 수 있다.
승인 후 다음 안내 조회가 실패했을 때 승인이 이미 저장될 수 있으므로 무조건 재승인하도록 안내하지 않는다.

### 2. 구조·공개 API·라우팅

- `src/fsd/shared/routes/docs.ts`: 다섯 id의 경로 매핑 `DOCS_PATHS`, 그 키 타입 `DocsId`, `docsPath(id)`.
  문서 레지스트리와 랜딩이 함께 사용한다. 서버 인증 설정은 FSD를 import하지 않고 다섯 경로를 명시하며 테스트가 실제 라우트와 대조한다.
- `src/fsd/pages/docs/model/docs-pages.ts`: 순서 있는 `DOCS_PAGES` 레지스트리 `{ id, path, nav, title, description }`.
  path는 docsPath(id)에서 가져온다. 사이드바·이전/다음·사이트맵·메타데이터가 이 레지스트리를 따른다.
- 같은 model의 `docs-metadata.ts`: `docsMetadata(id)`가 제목·설명·alternates.canonical을 반환한다.
  canonical은 상대 경로이며 루트 metadataBase가 절대 주소로 해석한다. FSD model이 `@/server/public-url`을 import하지 않는다.
- 같은 model의 `docs-facts.ts`: 사실 출처 표의 순수 core 함수·entity public API·설치 config를 조합한다.
  DB·세션·네트워크·요청 헤더·현재 시각을 읽지 않는다. 새 서버 정책을 중복 정의하지 않는다.
- `ui/docs-shell.tsx`: 브랜드 → `/`, Docs → `/docs`, **Open Stagekeeper** → `projectsPath()`, 꼬리를 그린다.
  `ui/docs-frame.tsx`: 페이지 id로 현재 항목을 표시하고 이전/다음을 계산한다. 첫 페이지에는 이전, 마지막에는 다음 링크가 없다.
- 화면 파일은 `ui/overview-page.tsx`, `ui/getting-started-page.tsx`, `ui/automation-page.tsx`,
  `ui/approval-gates-page.tsx`, `ui/security-page.tsx`다. 각 화면이 자기 id를 DocsFrame에 전달한다.
- `index.ts`는 실제 외부 소비자가 쓰는 DOCS_PAGES, docsMetadata만 명시적으로 공개한다.
  `index.server.ts`는 DocsShell, DocsOverviewPage, DocsGettingStartedPage, DocsAutomationPage,
  DocsApprovalGatesPage, DocsSecurityPage를 명시적으로 공개한다. 테스트 전용 export·export *는 추가하지 않는다.
- `src/app/docs/layout.tsx`는 문서 메타데이터와 DocsShell만 조합한다. 다섯 page.tsx는 docsMetadata(id)와 해당 화면을 연결한다.
  동적 `[slug]`를 쓰지 않고 실제 정적 경로 다섯 개를 만든다. 라우트 파일의 경로는 Affected Files에 전부 열거한다.
- PUBLIC_EXACT에 문서 다섯 경로만 추가한다. 기존 `/`·`/login`의 판정, PUBLIC_PREFIXES, AFTER_SIGN_IN은 보존한다.
  `/docs-private`, `/docs/security/private`까지 접두사로 열지 않는다.

문서 화면·셸은 Server Component이며 CopyButton만 기존 client leaf를 사용한다. auth(), cookies, headers,
usePathname이나 로그인별 문구를 추가하지 않는다. 루트의 기존 Toaster 같은 client leaf는 prerender와 양립한다.
Open Stagekeeper를 누르면 비로그인 방문자는 기존 proxy를 통해 `/login?callbackUrl=…`로, 로그인 방문자는 `/projects`로 간다.
현재 로그인 폼은 callbackUrl을 임의로 복원하지 않고 AFTER_SIGN_IN을 사용한다. 그 흐름을 바꾸지 않는다.
기존 trailing-slash 설정을 유지하고 다섯 문서 경로의 끝 `/`는 308로 정규화되는지 실행 서버에서 확인한다.

작은 화면에서는 별도 상태를 가진 접이식 메뉴 대신 본문 위에 동일한 탐색 링크를 배치하고 큰 화면에서는 사이드바로 배치한다.
현재 링크에 aria-current="page", 탐색 영역에 이름, 본문 건너뛰기 링크와 목적지를 둔다.
320px·768px·1280px, 200% 확대, 키보드 Tab/Shift+Tab/Enter, 라이트·다크에서 링크와 본문을 읽을 수 있어야 한다.
긴 명령은 줄바꿈 또는 코드 영역 내부 스크롤로 전부 볼 수 있게 하며 페이지 전체의 가로 넘침·명령 잘라내기를 허용하지 않는다.
Copy 성공·거부·연속 클릭은 기존 CopyButton을 재사용하고, 클립보드가 없어도 원문 선택·복사가 가능해야 한다.
디자인은 기존 토큰·서체·프리미티브를 사용하고 새 테마·모션·전역 CSS 규칙은 추가하지 않는다.

### 3. 검색 노출과 최종 산출물

- 제목 템플릿 `{ default: "Docs · Stagekeeper", template: "%s · Stagekeeper" }`와 `robots: { index: true, follow: true }`를
  **문서 layout에만** 둔다. 개요는 title.absolute, 네 하위 페이지는 문자열 제목을 사용한다.
  루트 `src/app/layout.tsx`의 기본 제목·noindex·metadataBase·폰트는 보존한다.
- 문서 페이지가 openGraph·twitter 객체나 이미지 파일을 새로 정의하지 않게 한다. 루트의 siteName·type·이미지·아이콘을 상속하고
  최종 og/twitter 제목·설명은 각 문서의 값으로 채워진다. 설치된 Next의 resolve-metadata.js의 inheritFromMetadata와 정적 이미지 병합을 근거로 한다.
  객체 병합은 얕으므로 일부 필드만 덮어써서 루트 값을 잃지 않는다.
- `src/app/sitemap.ts`: siteUrl()과 DOCS_PAGES로 `/`와 문서 다섯 개의 절대 URL만 반환한다.
  날짜를 추측한 lastModified, changeFrequency, priority, 비공개·로그인 경로는 넣지 않는다.
- `src/app/robots.ts`: 기존 `rules: { userAgent: "*", disallow: "/api/" }`를 보존하고
  `new URL("/sitemap.xml", siteUrl()).href`를 sitemap에 추가한다. 비공개 페이지를 robots로 새로 차단하지 않는다.
- `src/proxy.ts`: 기존 제외 항목을 보존하고 **정확히 `/sitemap.xml`**만 추가 제외한다.
  matcher는 분석 가능한 문자열 리터럴을 유지한다. 문자열 안의 추가 분기는 `sitemap\\.xml$`이며
  `/sitemapXxml`, `/sitemap.xml-private`, `/sitemap.xml/extra`는 계속 proxy를 통과해야 한다.
- `HARNESS_PUBLIC_URL=https://stagekeeper.dev`는 **빌드 때와 실행 때 모두** 지정한다.
  siteUrl의 기존 로컬 fallback은 바꾸지 않는다. 빌드 후 실행 환경변수만 바꿔 이미 생성된 canonical/XML을 고칠 수 있다고 가정하지 않는다.
- 랜딩 `src/app/page.tsx`에서 siteUrl().href를 url로 하는
  `{ "@context": "https://schema.org", "@type": "WebSite", name: "Stagekeeper", url }`를 일반 script 태그로 렌더한다.
  위 객체를 JSON.stringify로 직렬화한 뒤 `.replace(/</g, "\\u003c")`를 적용한다.
  URL 객체를 값으로 내보내지 않고 파싱한 최종 JSON의 키·문자열 값을 확인한다.
- 내부 링크는 랜딩 머리·꼬리 → Docs, 문서 브랜드 → `/`, 문서 탐색·이전/다음·본문 관련 링크다.
  랜딩은 문서 page slice를 import하지 않고 shared/routes/docs만 사용한다.
- 승인된 랜딩 제목은 `Stagekeeper — Automate Claude Code with approval gates`, 설명은
  `Your Claude Code runs plan → verify → implement → accept. Gates are where you put them, and nothing passes without a record.`다.
  landing-copy.ts에 별도 LANDING_INTRO로 **기존 본문 전체를 그대로** 보관하고 landing-page.tsx가 이를 렌더하게 한다.
  새 LANDING_DESCRIPTION을 본문에 대입하지 않는다. 기존 데모·순환 설명·CTA도 보존한다.

최종 산출물은 다음 표를 모두 확인한다. 아직 구현되지 않은 결과를 이번 대조에서 실행·배포한 것으로 기록하지 않는다.

| 최종 산출물 | 최종 내용의 소유자 / 우선순위 | 본문·의존성 확인 | 구현 후 검증 목적지 |
| --- | --- | --- | --- |
| 문서 HTML 5개 | root layout → docs layout → 각 page metadata·TSX | h1·본문·계산된 사실·탐색·명령, root CSS·폰트, CopyButton hydration | docs-copy.test.ts + production 응답·실제 DOM |
| 문서 head | overview absolute / 나머지 docs template, 상대 canonical + root metadataBase | 각 title·description·robots·canonical, og/twitter 제목·설명·기존 카드·아이콘 | docs-pages.test.ts + 다섯 production 페이지 head |
| `/sitemap.xml` | 새 sitemap.ts, Next metadata Route Handler | XML의 urlset 아래 loc **6개 정확 일치**, 중복·비공개 URL 없음 | sitemap.test.ts 반환 구조 + production XML 파싱 |
| `/robots.txt` | 기존 robots.ts에 sitemap만 추가 | User-Agent·기존 Disallow와 Sitemap의 실제 행 | robots.test.ts + production text |
| 랜딩 `/` | 기존 auth 분기·본문 + 새 metadata·링크·JSON-LD | 기존 본문·로그인별 CTA, JSON.parse한 WebSite·url·이스케이프, Docs 링크 | landing-page.test.ts·src/app/page.test.ts + production DOM |
| 공유 카드·아이콘·폰트 | 기존 `src/app/opengraph-image.tsx`, `icon.tsx`, `apple-icon.tsx`, `fonts/image-fonts.ts`, root layout·globals.css | 기존 카드 내용·크기·정적 SemiBold, 화면용 로컬 두 폰트·CSS 응답 | 문서 head가 가리키는 실제 이미지·CSS·폰트 요청 및 브라우저 렌더 |

### 4. 상수 이동과 import/export 정합성

설치 상수 이동은 외부 CLI 연결 구성 값을 함께 쓰기 위한 것이며 제품 정책을 shared로 옮기지 않는다.
entities/project-token/index.ts는 client UI를 공개하지만 파일 자체에 use client가 선언된 것은 아니다.
문서가 토큰 UI의 모듈 그래프를 읽지 않도록 별도 순수 config를 사용한다. 이동하는 값·순서·공개 제품 동작은 같다.

| symbol | 현재 소유자 | 새 소유자·공개 경로 | 바뀌는 전체 소비자 / 보존 | 검증 목적지 |
| --- | --- | --- | --- | --- |
| PLUGIN_MARKETPLACE, PLUGIN_ID | entities/project-token/model/connect-command.ts | shared/config/plugin-install.ts → `@/fsd/shared/config/plugin-install` | connect-command.ts의 codexInstallCommands가 새 경로로 import. 기존 Codex 명령 배열은 그 파일에 유지한다. | 새 plugin-install.test.ts, 기존 connect-command.test.ts·token-reveal.test.ts |
| installCommands | 같은 파일 | 같은 config 공개 경로 | token-reveal.tsx와 문서 docs-facts.ts가 새 경로로 import. 이전 파일에서 재수출하지 않는다. | 새 config 시험·docs-copy.test.ts·기존 토큰 렌더 잠금 |
| ACCEPTANCE_CHECK_LABELS | features/review-gate/model/gate-text.ts | entities/pipeline/model/acceptance-checks.ts → entity index.ts 명시적 export | acceptance-failure.tsx와 docs-facts.ts가 `@/fsd/entities/pipeline`에서 import. gate-text.ts에 재수출을 남기지 않는다. | docs-copy.test.ts의 1–5 이름, 기존 acceptance-failure.test.ts |

connect-command.test.ts에서 설치 명령 값·순서, 설치 ID와 marketplace JSON의 일치, 공개 저장소 형식 검사만 새 config 시험으로 옮긴다.
새 시험에서 루트 manifest는 `new URL("../../../../.claude-plugin/marketplace.json", import.meta.url)`로 읽어 **JSON.parse**하고
plugins[0].name·name으로 설치 ID를 대조한다. 이전 model 디렉터리의 다섯 단계 상대 경로를 그대로 복사하지 않는다.
토큰 변수·scope·셸 명령·Codex 등록 명령 검사는 기존 connect-command.test.ts에 보존한다.
ACCEPTANCE_RETRY_HINT 등 나머지 동작 문구는 gate-text.ts에 남긴다.

파일 생성 전 새 docs·config·route·acceptance 파일의 충돌을 검사한다. 기준 커밋에서 새 파일은 없고
src/app, src/fsd/pages, shared/config, shared/routes, entities/pipeline/model 부모는 있다.
없는 src/app/docs와 src/fsd/pages/docs 및 하위 디렉터리를 먼저 만든다. 이미 생긴 파일이 있으면 덮어쓰지 않고 재대조한다.
이동 후에는 옛 선언·export·import의 부재와 새 선언·공개 경로의 존재를 모두 확인한다.

### 5. 문구 관리와 시험

- product-copy.md 머리말에 **공개 제품 문서 TSX 본문만** 중복 보관하지 않는 예외를 추가한다.
  저장소 내부 docs/ 문서는 한국어라는 규칙과 다른 화면 문구의 소유권은 유지한다.
- §20 `Docs — public /docs`에는 표의 제목·설명·탐색 이름, Open Stagekeeper, Docs 링크, 이전/다음·건너뛰기 UI 문구와 금지 주장 범위를 둔다.
  copy-lock:docs-meta에는 순서대로 제목·설명 10개 단위를 두고 글자 일치로 검사한다. 공통 탐색·버튼 문구는 별도 docs-shell 잠금으로 렌더 결과를 확인한다.
- §16과 landing-meta를 새 제목·설명에 맞춘다. 기존 본문은 바꾸지 않고 landing-intro 잠금으로 실제 본문 보존을 검사한다.
  기존 landing-demo 잠금도 유지한다. “설명은 본문 첫 두 문장”이라는 옛 지시와 시험만 교체한다.
- docs-copy.test.ts는 다섯 **실제 페이지 컴포넌트**를 DocsShell과 함께 렌더한다. 메타데이터·본문 사실·탐색 링크와
  설치 명령·init/watch·인수 이름을 비교한다. 사실은 defaultGraph/limitsFor 등 원본 결과와 대조하고 propose를 기본 단계로 내보내지 않는지도 검사한다.
- 금지어 검사는 렌더 HTML에서 code/pre/script/style 요소와 그 내용을 먼저 제거하고 visibleText로 본문 글자를 읽는다.
  AI·LLM은 대문자 단어 단위로, stamp/stamps/stamped/stamping, reject/rejects/rejected/rejecting/rejection/rejections,
  ticket/tickets, harness는 대소문자를 무시한 단어 단위로 검사한다. 단어 경계만으로 활용형이 잡힌다고 가정하지 않는다.
  프로토콜 식별자는 code 안에서만 허용한다. 일반 영어와 겹치는 issue/task/model 등은 §2와 대조해 본문 검토에서 확인한다.
- scripts/retired-copy.test.mjs의 기존 모든 소스·잠금 검사도 유지한다. 새 금지어 검사를 문서 밖 화면까지 확대하지 않는다.
- docs/architecture/verification.md에 새 잠금·시험·실행 서버 인수를, fsd.md의 shared config 목록에 외부 CLI 설치 구성을 기록한다.
  새 경계 예외나 검사 억제는 도입하지 않는다.

### 6. README

현재 영어 소개와 Status·개발 안내를 보존한다. 소개 근처에 `https://stagekeeper.dev/docs`와
`https://stagekeeper.dev/docs/getting-started` 링크만 추가한다. 실제 문서 라우트가 없는 상태로 링크만 먼저 배포하지 않는다.

## Affected Files

경로는 저장소 루트 기준이다. 아래 열거가 생성·수정 범위이며 `**`나 동적 id 표기를 구현 파일 목록 대신 쓰지 않는다.

| 경로 | 작업 | 책임 / 검증 |
| --- | --- | --- |
| `src/app/docs/layout.tsx` | add | 문서 한정 제목 템플릿·색인·DocsShell |
| `src/app/docs/page.tsx` | add | overview 연결 |
| `src/app/docs/getting-started/page.tsx` | add | 시작 안내 연결 |
| `src/app/docs/automation/page.tsx` | add | 자동화 연결 |
| `src/app/docs/approval-gates/page.tsx` | add | 승인 연결 |
| `src/app/docs/security/page.tsx` | add | 토큰·권한 연결 |
| `src/fsd/pages/docs/index.ts`, `src/fsd/pages/docs/index.server.ts` | add | 순수 값·metadata / 화면 공개 API 분리 |
| `src/fsd/pages/docs/model/docs-pages.ts`, `src/fsd/pages/docs/model/docs-metadata.ts`, `src/fsd/pages/docs/model/docs-facts.ts` | add | 레지스트리·canonical·계산된 제품 사실 |
| `src/fsd/pages/docs/model/docs-pages.test.ts` | add | 다섯 id·경로·순서·제목·설명·metadata와 실제 라우트 일치 |
| `src/fsd/pages/docs/ui/docs-shell.tsx`, `src/fsd/pages/docs/ui/docs-frame.tsx` | add | 공통 탐색·현재 항목·본문·이전/다음 |
| `src/fsd/pages/docs/ui/overview-page.tsx`, `src/fsd/pages/docs/ui/getting-started-page.tsx`, `src/fsd/pages/docs/ui/automation-page.tsx`, `src/fsd/pages/docs/ui/approval-gates-page.tsx`, `src/fsd/pages/docs/ui/security-page.tsx` | add | 다섯 본문과 근거 |
| `src/fsd/pages/docs/ui/docs-copy.test.ts` | add | 다섯 실제 렌더·사실·잠금·금지어·탐색 경계 |
| `src/fsd/shared/routes/docs.ts`, `src/fsd/shared/routes/docs.test.ts` | add | 공유 경로의 다섯 정확한 매핑 |
| `src/fsd/shared/config/plugin-install.ts`, `src/fsd/shared/config/plugin-install.test.ts` | add(move) | 설치 상수와 manifest·순서 시험 |
| `src/fsd/entities/project-token/model/connect-command.ts`, `src/fsd/entities/project-token/model/connect-command.test.ts`, `src/fsd/entities/project-token/ui/token-reveal.tsx` | update | 설치 상수 import·시험 이동. Codex·토큰 동작 보존 |
| `src/fsd/entities/pipeline/model/acceptance-checks.ts`, `src/fsd/entities/pipeline/index.ts` | add / update | 인수 이름의 단일 선언·명시적 공개 |
| `src/fsd/features/review-gate/model/gate-text.ts`, `src/fsd/features/review-gate/ui/acceptance-failure.tsx` | update | 기존 선언 제거·entity import |
| `src/app/sitemap.ts`, `src/app/sitemap.test.ts`, `src/app/robots.test.ts` | add | URL 여섯 개·robots 반환 구조 |
| `src/app/robots.ts`, `src/proxy.ts`, `src/proxy.test.ts` | update / update / add | sitemap 행·정확한 인증 제외·matcher 경계 시험 |
| `src/server/auth/config.base.ts`, `src/server/auth/config.base.test.mjs`, `src/server/auth/public-routes.test.mjs` | update | 공개 목록과 로그인 전후·비공개 보호·목록 양방향 검사 |
| `src/fsd/pages/landing/model/landing-copy.ts`, `src/fsd/pages/landing/ui/landing-page.tsx`, `src/fsd/pages/landing/ui/landing-page.test.ts` | update | 새 meta·독립된 기존 본문·문서 링크·본문/데모/CTA 보존 |
| `src/app/page.tsx`, `src/app/page.test.ts` | update / add | 기존 auth·Action 연결 보존, WebSite 직렬화·metadata 검증 |
| `docs/conventions/product-copy.md`, `docs/architecture/verification.md`, `docs/architecture/fsd.md`, `README.md` | update | 본문 예외·잠금·검증·설치 config 위치·공개 링크 |

기존 `src/fsd/entities/project-token/ui/token-reveal.test.ts`,
`src/fsd/features/review-gate/ui/acceptance-failure.test.ts`, `src/server/public-url.test.mjs`,
`scripts/retired-copy.test.mjs`는 그대로 실행하는 회귀 검증 표면이다. 기존 기대값을 느슨하게 만들지 않는다.
packages/core·플러그인 manifest·Next 설정·루트 layout·CSS·폰트·이미지·DB·private 템플릿은 읽기·보존 대상이다.
이 제안서 자체는 별도 검토 입력이다. 현재 요청으로 허용된 정합화 변경과 이후 승인된 검증·상태 기록은
제품 구현 파일 목록과 구분해 기록한다. 기존 제안서 변경을 제품 범위 밖 변경으로 오인해 되돌리지 않는다.

## Safety Analysis

| 동작 / 입력 | 기대 경로·종료·실패 복구 | 검증 |
| --- | --- | --- |
| 비로그인·로그인 문서 직접 요청·새로고침 | 두 경우 모두 같은 공개 본문. 로그인으로 보내거나 DB 조회를 하지 않음 | auth 단위 시험 + production 문서 5개 |
| 비공개·비슷한 접두사 요청 | 비로그인의 `/projects`, `/p/new`, `/p/x`, `/docs-private`, `/docs/security/private`는 공개 목록으로 통과하지 않음 | auth와 실제 라우트 목록 대조. 없는 공개 문서를 추가했다고 해석하지 않음 |
| Open Stagekeeper / 로그인 재진입 | 비로그인은 기존 로그인 경유, 로그인은 프로젝트 목록. 새 callback·세션 정책 없음 | `/projects` redirect·기존 로그인 흐름 보존 |
| 이전/다음·직접 URL 이동 | registry 순서·현재 id로 갱신. 첫/끝 경계에 잘못된 링크 없음 | 실제 렌더 링크·각 URL 재진입 |
| Copy 성공·거부·클립보드 부재 | 공개 명령 전체를 복사, 실패해도 원문을 읽고 선택 가능 | 브라우저 실제 clipboard·수동 선택. 토큰·비밀을 인자로 보내지 않음 |
| 메타데이터·XML·JSON 생성 | 요청별 개인화 없이 빌드 기준 절대 URL. 문서 robots만 index, private 기본값 noindex | §3 최종 산출물 표 전체 |
| 탭 이탈·새로고침·재시도 | 문서가 타이머·poller·서버 쓰기·구독·mutation을 만들지 않음. registry·props 외 상태는 기존 Copy leaf뿐 | import 검토·브라우저 네트워크·console. fixture global mock은 시험 뒤 복원 |

공개 문서에서 API·토큰 발급·게이트 변경 같은 mutation을 호출하지 않는다. 새 Server Action을 만들지 않는다.
레지스트리와 메타데이터는 모듈 내부 불변 값이며, 시험에서 환경변수·auth double을 바꾸면 t.after 등으로 복원한다.
단순 공개 GET의 추가이므로 DB transaction·migration·backfill·외부 등록·private 번들 생성은 범위 밖이다.
기존 인증된 기능이 사용하는 인가를 공개 목록으로 대체하지 않는다.

## Approval

승인 기록은 front matter가 기준이다. 기존 페이지 목적·언어·범위·본문 예외를 유지한다.
2026-10-19의 문서 검증·개선 요청에 따라 최신 코드의 사실·파일 경로·검증 절차를 보정한다.
최신 요청은 구현·검증 후 commit·push·dev 대상 PR 생성을 명시적으로 허용한다. 본문은 해당 PR의 검토 대상으로 제출한다.
PR 병합과 dev → main 승격은 이번 요청에 포함되지 않는다.
이번 정합화의 clean 판정은 구현 완료나 새로운 실행 권한을 뜻하지 않는다.

## Execution Plan

1. **기준 통합:** 문서 변경을 보존하고 작업 브랜치에 최신 dev를 통합한다. Current State와 비교하고 파일 충돌·권한·명령 변경을 재대조한다.
   새 브랜치를 같은 이름으로 다시 만들지 않는다. 아래 단계는 통합 전 옛 코드에서 수행하지 않는다.
   통합 전에 기존 index·작업 트리·미추적 파일의 경로와 변경 식별값을 기록한다. 통합 뒤, 첫 구현 변경 전에
   `public_docs_scope_base="$(git rev-parse HEAD)"`와 당시 기존 변경 식별값을 범위 검사 기준으로 보관한다.
   이후 검증 때 이 변수를 현재 HEAD로 다시 잡지 않는다. 다른 셸에서는 기록한 SHA를 복원해 사용한다.
2. **출처 정리:** §4의 두 상수 이동, 전체 import·공개 API·manifest 상대 경로·기존 동작 보존을 함께 반영한다.
3. **문서 기반:** 공유 경로, registry·metadata·facts, 셸·프레임, 여섯 route 파일, 정확한 인증 공개 목록과 시험을 만든다.
4. **본문:** §1의 다섯 페이지 초안을 작성한다. 사실별 근거 파일·symbol을 붙인 검토 목록을 구현 보고에 포함한다.
   그 목록은 구현 보고에 두며 공개 화면에 내부 검증 절차를 싣지 않는다.
5. **검색·연결:** sitemap·robots·정확한 proxy 예외·문서 한정 head·랜딩 JSON-LD와 문서 링크를 반영한다.
6. **문구·회귀:** 새 랜딩 meta와 기존 본문 분리, product-copy §20·잠금·본문 예외, 아키텍처 문서와 README 링크를 갱신한다.
7. **검증:** 아래 자동 명령과 production body·head·자산·인증·모바일·키보드 기준을 모두 확인하고 근거를 남긴다.
8. **PR 제출:** 최신 요청에 따라 구현·검증을 마치면 commit·push하고 dev 대상 PR을 만든다.
   사용자는 PR에서 다섯 본문·주장·플랜 표현을 검토한다. 검토 전에는 본문이 최종 승인됐다고 기록하지 않는다.
   PR 병합·릴리스는 수행하지 않는다.

필수 구현·검증 결정은 이 문서에 있다. 별도 상세 계획의 작성을 미충족 선행 조건으로 남기지 않는다.

## Verification Plan

아래는 **구현 후** 실행할 검증이다. 이 문서 정합화의 실행 결과와 구분한다.

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm run test:web
npm test
HARNESS_PUBLIC_URL=https://stagekeeper.dev npm run build
```

check는 lint·타입·아키텍처 검사도 포함한다. 새 시험은 기존 src/**/*.test.ts·src/**/*.test.mjs 패턴에 포함되게 한다.
기존 macOS tmpdir 별칭 문제는 현재 dev의 realpathSync(tmpdir()) 보정이 이미 반영되어 있으므로 전체 TMPDIR를 임의로 덮어쓰지 않는다.
환경 실패가 있으면 같은 기준 dev와 비교하고 이번 변경의 실패와 구분해 기록한다. 기대값이나 경계를 완화하지 않는다.

### 변경 범위와 기존 변경 보존

Execution Plan 1단계에서 보관한 기준을 사용해 아래 세 입력을 **모두** 확인한다.
단일 `git diff --name-only`는 staged 변경과 새 untracked 파일을 누락하므로 전체 범위 검사로 사용하지 않는다.

```bash
: "${public_docs_scope_base:?Restore the scope baseline recorded before implementation}"
git diff --name-status --no-renames -z "$public_docs_scope_base"
git diff --cached --name-status --no-renames -z "$public_docs_scope_base"
git ls-files --others --exclude-standard -z
```

각 명령이 성공했는지 확인한 뒤 NUL 구분 필드로 읽는다. 첫 둘은 상태·경로를, 셋째는 미추적 경로를 제공한다.
rename 감지를 끄므로 이동은 이전 경로 삭제와 새 경로 추가를 모두 확인한다. 생성 파일을 미리 staging해야 검사에 잡히는 방식으로 만들지 않는다.
세 경로 집합의 합집합을 Affected Files와 대조하고, 기존 변경은 경로뿐 아니라 내용·index 변경 식별값까지 기준과 비교한다.
기존 변경이 그대로인 경우에만 이번 구현의 추가 변경에서 제외한다. 기존 경로의 새 수정·삭제·staging 변경은 별도 delta로 검사한다.
제안서의 허용된 문서 변경은 따로 분류하고, 허용하지 않은 새 파일·수정·삭제가 있으면 범위 검사를 통과시키지 않는다.
ignored build 산출물은 이 소스 범위 검사 대신 §3의 산출물 인수에서 확인하며, ignore 정책을 바꿔 소스 변경을 숨기지 않는다.

### 자동 검증의 목적지

| 검증 파일 | 최종 위치에서 확인할 내용 |
| --- | --- |
| `src/fsd/shared/routes/docs.test.ts` | 다섯 id의 정확한 경로·고유성 |
| `src/fsd/pages/docs/model/docs-pages.test.ts` | 다섯 경로·순서·고유 제목·155자 이하 설명, 실제 page.tsx 경로와 일치, docsMetadata의 title/description/상대 canonical |
| `src/fsd/pages/docs/ui/docs-copy.test.ts` | 다섯 실제 컴포넌트의 body·h1·제품 사실·기본/선택 구분·설치 명령·인수 이름·탐색 경계·잠금·전체 금지어 목록 |
| `src/fsd/shared/config/plugin-install.test.ts` | 새 위치의 설치 명령·순서·manifest JSON 구조와 일치, machine-specific 경로 없음 |
| `src/fsd/entities/project-token/model/connect-command.test.ts`와 기존 token-reveal.test.ts | 토큰·Codex 명령·화면 보존, 이동한 상수를 옛 파일이 재수출하지 않음 |
| `src/fsd/features/review-gate/ui/acceptance-failure.test.ts`와 docs-copy.test.ts | 동일한 entity 상수의 실제 실패 UI·문서 표시, 옛 gate-text 선언·재수출과 소비자 옛 import 부재 |
| `src/server/auth/config.base.test.mjs` | 문서 5개 × 비로그인/로그인 허용, 기존 `/` 허용·`/login` 분기, 위 비공개·접두사 목록의 비로그인 거부 |
| `src/server/auth/public-routes.test.mjs` | 실제 page.tsx와 공개 목록 양방향 비교. 기존 검사는 공개 페이지 누락만 보므로, **PUBLIC_EXACT에만 남은 죽은 예외**도 잡는 역방향 검사 추가 |
| `src/proxy.test.ts` | 실제 config로 sitemap.xml·query 포함 요청 제외, sitemapXxml·sitemap.xml-private·sitemap.xml/extra 보호, 문서·프로젝트·login은 proxy 대상, 기존 API·static·image·robots·아이콘·공유 카드 제외 보존 |
| `src/app/sitemap.test.ts`, `src/app/robots.test.ts` | 반환 구조 deep equality. 사이트맵 URL 6개·금지 필드 부재, robots 기존 rules·새 sitemap 문자열 |
| `src/fsd/pages/landing/ui/landing-page.test.ts` | 새 landing-meta, 기존 landing-intro·landing-demo, 로그인 전후 CTA·머리/꼬리 Docs href. 다른 page slice import 없음 |
| `src/app/page.test.ts` | async 라우트의 auth·signIn을 double로 격리하고 CTA 연결 보존, script body를 JSON.parse하여 WebSite 키·문자열 url 확인. 시험 입력에 `<`가 있어도 raw `<`가 남지 않고 파싱 값은 보존되는 직렬화 경계 확인 |

구조 부재 검사는 TypeScript AST 또는 명시적 import/export 목록으로 옛 선언·재수출·전체 소비자의 경로를 대조한다.
문서 UI가 project-token barrel·서버 구현·crypto token 모듈을 import하지 않음도 확인한다.
새 경로 단위와 public API는 verify:fsd·verify:server·build에서 함께 해석되어야 한다.

src/app/page.test.ts는 기존 VM 주입형 시험 패턴을 사용한다. TypeScript의 transpileModule로 실제 page.tsx를 변환하고
node:vm에서 auth/index·auth/config.base·public-url만 공개 import 경로의 double로 제공한다.
LandingPage는 실제 public API로 로드하며 server-only 인증 모듈·DB singleton을 직접 로드하지 않는다.
두 로그인 상태에서 await Page()의 결과를 렌더하고, 전달된 signInAction을 호출해 GitHub·AFTER_SIGN_IN 인자를 대조한다.
이스케이프 경계는 siteUrl double이 `<`를 포함한 href 문자열을 반환하는 경우도 검사한다. 정상 URL의 자동 인코딩에만 기대지 않는다.
VM context·double·환경 변경은 시험별로 격리·복원한다. 이를 위해 테스트용 제품 export나 새 실행 환경을 만들지 않는다.

proxy 시험은 설치된 Next 16.3.3의 실제 export **unstable_doesMiddlewareMatch**를
next/experimental/testing/server에서 사용한다. 동봉 문서의 unstable_doesProxyMatch라는 이름을 그대로 복사하지 않는다.
시험 진입점은 next/dist/server/node-environment를 먼저 로드해 AsyncLocalStorage를 준비하고 파일별 격리 프로세스에서 실행한다.
Next를 갱신하면 이 실험 API·bootstrap·matcher를 다시 대조한다. 별도 보안 예외를 추가하지 않는다.

### production 응답·브라우저 인수

위 환경변수로 fresh build한 뒤 다음 명령으로 별도 터미널에서 실행한다.

```bash
HARNESS_PUBLIC_URL=https://stagekeeper.dev npm run start -- --hostname 127.0.0.1 --port 3000
```

이 저장소의 기존 auth 설정에 필요한 개발 환경을 사용한다. 운영 DB·운영 세션·실제 토큰을 fixture로 사용하지 않는다.
문서 자체는 개인 데이터나 DB를 읽지 않는다. 로그인된 상태의 실제 화면 확인은 기존 테스트 계정 환경에서만 수행한다.

1. 문서 다섯 URL을 비로그인으로 직접 요청하고 새로고침한다. 모두 200이며 로그인 폼 대신 각 본문·h1·명령·탐색이 실제 HTML에 있어야 한다.
   JavaScript를 끈 상태에서도 본문과 링크는 읽혀야 한다. 로그인된 테스트 세션에서도 다섯 문서가 그대로 열린다.
2. 실제 head에서 각 title·description·canonical·robots를 확인한다. 개요는 absolute, 나머지는 ` · Stagekeeper`가 한 번 붙는다.
   canonical은 로컬 주소가 아니라 빌드 기준 https://stagekeeper.dev 아래 각 정확한 경로다.
   og/twitter 제목·설명과 루트 카드·아이콘 URL도 확인한다. 브라우저와 크롤러 요청에서 index/noindex가 충돌하지 않아야 한다.
3. sitemap.xml은 인증 redirect 없이 XML을 반환한다. 브라우저 DOMParser 등 XML parser로 urlset/loc를 읽어 URL 집합이 `/`와 문서 5개뿐인지 확인한다.
   loc 문자열 검색만으로 통과시키지 않는다. robots.txt의 실제 Disallow·Sitemap 행도 §3과 대조한다.
4. 랜딩 WebSite script를 **JSON.parse**하여 정확한 키·값을 대조하고 기존 본문·데모·로그인별 CTA·문서 링크를 확인한다.
   script가 보인다는 사실만으로 통과시키지 않는다. 내부 문서 탐색 링크는 실제 문서 경로로, 브랜드는 `/`, CTA는 `/projects`로 연결된다.
5. 비로그인 `/projects`와 `/p/new`의 로그인 redirect를 확인하고 `/login`의 noindex를 확인한다.
   인증된 비공개 화면도 noindex를 유지해야 한다. Open Stagekeeper와 기존 로그인 완료 목적지는 `/projects`다.
   다섯 문서 경로의 끝 `/`는 308 정규화 후 본문을 연다.
6. 다섯 페이지 모두 320px·768px·1280px 및 200% 확대, 라이트·다크에서 확인한다.
   현재 항목·이전/다음·건너뛰기·포커스·Tab/Shift+Tab/Enter, 긴 명령 원문과 Copy 성공·권한 거부 후 수동 선택을 검증한다.
   이미지·CSS·로컬 폰트 요청이 인증으로 막히지 않고 렌더되며 hydration·console 오류·페이지 전체 가로 넘침이 없어야 한다.
7. 사용한 프로세스·브라우저 fixture·환경 mock을 종료·복원하고 결과를 기록한다. 아직 구현 전인 현재는 위 인수를 통과했다고 쓰지 않는다.

### Definition of Done

- 자동 명령이 통과하고 build 결과에서 문서 다섯 개와 sitemap·robots가 정적으로 생성된다.
- §3 최종 산출물 표와 production 인수 1–7이 실제 body·head·XML·JSON·자산에서 확인된다.
- §4 새 선언·공개 API·전체 import가 연결되고 옛 선언·재수출은 사라지며 기존 토큰·실패 UI·랜딩 동작은 보존된다.
- 인증 공개 범위는 정확한 다섯 문서 경로이며 기존 private 보호·noindex·로그인 callback은 보존된다.
- 문구·README·아키텍처 설명·본문 사실 근거가 같은 구현과 일치하고 본문을 PR 검토 대상으로 제출한다.
- Out of scope 파일·정책을 변경하지 않는다. 미실행·환경 실패·남은 관측은 통과와 구별해 기록한다.
  변경 범위 검사의 working tree·index·untracked 세 집합과 구현 전 식별값을 대조해 읽기·보존 대상의 추가 수정이 없음을 확인한다.
  기존 사용자 변경과 허용된 제안서 변경은 별도 기록으로 보존한다.

## Verification Results

| 대상 | 상태 | 근거 / 한계 |
| --- | --- | --- |
| 초기 제안서 대조 | 개선점 있음 | 오래된 dev 전제·파이프라인·상수 이동·산출물 검증 공백을 확인하고 문서에 반영 |
| 기준 코드·계약·Next 구현 확인 | 실행함 | 기준 dev 파일·symbol·public API·경로·config와 Next 16.3.3 문서·resolver를 읽음 |
| 제안된 sitemap matcher 경계 | 실행함 | 기준 config를 AST로 읽어 정확한 제외 분기만 추가한 사본을 실제 Next helper로 검사. 문서·보호·기존 자산을 포함한 14개 URL 기대값 일치. 운영 proxy 실행 증거는 아님 |
| 문서 파일 구조·경로·전파 검증 | 정합화에서 확인 | 구현 파일 생성 완료나 기능 테스트 통과를 뜻하지 않음 |
| 반복 정합화의 변경 범위 검사 | 개선점 있음 | 임시 Git 저장소에서 단일 diff가 untracked·staged 변경을 놓치는 조건을 재현. 기준 SHA·기존 변경 식별값과 세 경로 집합을 함께 검사하도록 보완 |
| 정합화 단계의 구현 검증 | 당시 미실행 | 아래 구현 기록과 구분한다. 정합화 당시에는 제안서만 수정했음 |

### 구현 기록 — 2026-10-19

`origin/dev`의 `78adc6b`를 fetch하고 기존 제안서 변경을 autostash로 보존한 채
`harness/public-docs`를 rebase했다. 첫 코드 수정 전 범위 기준은 `7cf2e21fce6420ff080af81d6e251684d3fb77be`다.
통합 직전·직후 기존 제안서 내용의 SHA-256은
`04b80bad71fc84459da1d0f3365979b03a1f839c1571a6f582e914344b363913`으로 같았다.
그 뒤 이 제안서에는 최신 구현 권한과 실제 결과만 추가했다.
§Affected Files의 소스·문서 49개와 이 제안서 1개를 변경했으며, core·plugin·DB schema·루트 layout/CSS·공개 이미지·폰트는 변경하지 않았다.

다섯 정적 문서, 공통 탐색과 Copy, 현재 코드에서 계산하는 제품 사실, 정확한 공개 경로 목록,
사이트맵·robots·문서 metadata·랜딩 JSON-LD 및 진입 링크를 구현했다.
두 상수의 소유자 이동과 전체 소비자·공개 API·기존 화면 회귀 검사도 반영했다.

| 실행 / 관측 | 결과 | 근거와 한계 |
| --- | --- | --- |
| 집중 시험 14개 파일 | 44개 통과 | 문서·상수 이동·기존 token/acceptance/landing·인증·proxy·sitemap·robots·JSON-LD |
| `npm run verify:fsd`, `npm run verify:server` | 통과 | 새 slice와 이동한 public API/import 경계 |
| `npm run check` | 통과 | lint·타입·아키텍처 82개 통과/Windows 전용 2개 skip·availability 18개 통과 |
| `npm run test:web` | 657개 통과 | sandbox의 listen EPERM 후 같은 명령을 허용된 실행 환경에서 재실행 |
| `npm test` | 388개 통과, 플랫폼 시험 14개 skip | sandbox의 listen EPERM 후 같은 명령을 허용된 실행 환경에서 재실행 |
| 기본 `HARNESS_PUBLIC_URL=https://stagekeeper.dev npm run build` | 로컬 환경 실패 | 기본 Turbopack이 기존 `globals.css` 처리용 worker의 포트 bind에서 EPERM. sandbox 밖 재시도도 같았음. 성공으로 기록하지 않으며 PR의 기본 build 결과와 구분 |
| `HARNESS_PUBLIC_URL=https://stagekeeper.dev next build --webpack` | 통과 | 설치된 Next CLI의 대체 bundler. 타입 검사와 24개 정적 페이지 생성 완료. 문서 5개·sitemap·robots 모두 정적 산출물. 저장소 build 설정은 변경하지 않음 |
| production HTTP 34건 | 통과 | 로컬 start, guest/서명된 fixture session/Googlebot의 문서 본문 동일·200, 끝 `/` 308, private·유사 접두사 보호, 기존 로그인 분기 |
| 실제 head·XML·JSON | 통과 | HTMLParser로 다섯 head 대조, XML parser로 정확한 URL 6개 및 loc 외 필드 부재, robots 행 대조, WebSite JSON.parse 및 키·값 대조 |
| 정적 자산 19개 | 통과 | JS 13·CSS 1·로컬 폰트 2·PNG 3 모두 200. HTML 로그인 응답 아님. 폰트 형식과 PNG 크기, CSS 테마·font-face 확인 |
| 실제 Chrome 레이아웃 | 통과 | 5개 페이지 × 320/768/1280px × light/dark 총 30건. scrollWidth가 viewport와 같고 h1 하나·현재 항목·폰트 loaded 확인. 200% 확대에서 5개 본문·탐색 읽기 확인 |
| JavaScript 비활성 | 통과 | DevTools에서 끈 뒤 다섯 URL 직접 탐색. 본문·문서 링크가 유지됨. 이후 JavaScript·확대를 복원하고 검증용 시크릿 창 종료 |
| 키보드·복사 | 확인 | Tab/Shift+Tab/Enter와 Skip to content → main, Copy 네 버튼의 Copied 상태, 첫 설치 명령의 실제 clipboard 내용 확인. 문서가 포커스를 잃은 거부 사례에서는 기존 helper의 NotAllowedError 로그·Copy 라벨·명령 원문 유지와 이후 정상 복구 확인 |
| 범위·기존 변경 보존 | 통과 | 보관한 기준의 working tree/index/untracked 합집합 50개와 허용 목록 일치. `git diff --check` 통과 |

브라우저 조작 과정에서 console에 잘못 붙여 넣은 검증 보조 문자열의 SyntaxError와 의도적으로 관측한 clipboard 거부 로그는
애플리케이션의 hydration 오류와 구분했다. 새 문서에서 그 밖의 console/hydration 오류는 관측하지 않았다.
복사 거부 뒤 실제 OS 수동 선택·복사 전체 과정은 별도 관측하지 않았다.
운영 DB·운영 OAuth·실제 토큰을 사용하지 않았다. 서명된 테스트 session은 로컬 auth 분기 확인용이며 실제 계정 로그인 시험을 뜻하지 않는다.
`/login`과 인증된 unknown route의 noindex, 기존 private layout의 noindex 보존을 확인했지만 DB를 읽는 인증된 프로젝트 화면의 브라우저 인수는 하지 않았다.
사용한 로컬 start 프로세스는 종료했다.

### 공개 본문의 사실 출처

| 본문 | 근거 파일 / symbol |
| --- | --- |
| Overview의 단계·기본 파이프라인·플랜 | `packages/core/pipeline.mjs`의 `STEP_KINDS`, `defaultGraph`, `REQUIRED_NODES`, `OPT_IN_NODES`, `nodeAllowed`, `dispatcherFor`; pipeline entity의 label public API |
| Get started의 명령·연결 | `shared/config/plugin-install.ts`의 `installCommands`와 plugin marketplace/manifest, `packages/core/client-runtime.mjs`의 `clientRuntime("claude")`; 기존 token 화면·init/watch 지침 |
| Automation의 선택·발굴·제한·인수 | `src/server/pipeline/automatic-scout.ts`, `settings-service.ts`, `docs/architecture/protocol.md`; `packages/core/entitlement.mjs`의 `PLANS`, `limitsFor`; pipeline entity의 `ACCEPTANCE_CHECK_LABELS` |
| Approval gates의 기본 위치·편집·승인 차이 | core의 `DEFAULT_GATES`, `PROJECT_AGENTS`, `limitsFor`; `src/server/pipeline/board-rules.ts`, `board-service.ts`; `src/server/mcp/owner-tools.ts`, `owner-gate.ts` |
| Security의 토큰 종류·범위·폐기 | `src/server/mcp/auth.ts`, `tools.ts`, `owner-tools.ts`; `src/server/tokens/project-token-service.ts`; `prisma/schema.prisma`의 ProjectToken/UserToken/OwnerToken 관계와 만료·폐기 필드 |

Owner token의 범위는 실제 schema와 인증/owner handler의 **userId와 projectId 모두**를 따른다.
공개 본문은 account 전체 승인 권한으로 설명하지 않는다. 이 구현에서 서버의 기존 권한 정책은 변경하지 않았다.

## Risks and Rollback

- 코드에서 계산하지 않는 감시·토큰·권한 설명은 제품 변경 때 낡을 수 있다. 사실별 근거 검토와 docs-copy·기존 계약 시험을 함께 수행한다.
- 메타데이터 최종 병합과 proxy 실험 API는 Next 버전에 의존한다. 설치 버전 재대조와 production head·XML·자산 인수로 확인한다.
- 검색 노출·순위·검색량 증가 자체는 보장하지 않는다. 외부 색인 상태와 성과 확인은 배포 뒤 별도 작업이다.
- 롤백은 문서 라우트·인증 목록·sitemap·robots·proxy·링크·metadata·상수 이동을 **같은 변경 단위로** 되돌린다.
  상수 옛 소유자와 소비자 import도 함께 복원하고 기존 core·DB·토큰 정책은 유지한다. 자동 검사와 공개/private 응답을 다시 확인한다.

## Completion or Closure Notes

코드 구현과 로컬 자동 검증은 완료했다. 기본 Turbopack의 로컬 환경 실패와 미실행 인수는 위 표에 구분했다.
commit·push 후 `harness/public-docs` → `dev` PR로 제출하며, PR의 check 결과와 사용자 본문 검토가 남아 있다.
본문이 최종 승인됐거나 병합·릴리스됐다고 기록하지 않는다. 이 검토가 끝나기 전에는 completed-at을 채우거나 completed/로 이동하지 않는다.

## Review Checklist

- [x] 기존 승인 목적·범위와 본문 별도 검토 조건을 보존했다.
- [x] 최신 dev 기준과 옛 브랜치 차이, 구현 전 통합·재대조 조건을 적었다.
- [x] 완료된 SEO·README 작업과 새 구현을 구분했다.
- [x] 실제 파이프라인·자동 선택/발굴·플랜·인수·웹/세션 권한 차이를 출처와 연결했다.
- [x] 생성·수정·이동·보존 파일, 전체 소비자, 공개 경로와 이전 위치 부재의 검증을 구체화했다.
- [x] 최종 body·head·XML·JSON·이미지·CSS·폰트의 소유자와 검증 목적지를 적었다.
- [x] runtime·명령·metadata·인증·접두사·Copy·모바일·키보드 경계를 검증 기준에 반영했다.
- [x] 정합화 당시 코드 대조와 실제 구현 후 자동·production 검증 결과를 구분했다.
- [x] 범위 검사가 working tree·index·untracked 파일을 모두 포함하며 구현 전 변경을 보존하도록 했다.
- [x] 코드 구현·로컬 자동 검사와 기록된 production 관측을 마쳤고, 환경 실패·미실행 인수를 별도로 적었다.
- [ ] PR의 기본 build를 포함한 check와 미실행 수동 인수를 확인했다.
- [ ] 사용자가 다섯 본문 초안을 검토했다.
- [ ] 완료 또는 닫힘 기록을 실제 결과로 채웠다.

## Open Questions

현재 구현 방향을 바꿔야 하는 미결 제품 결정은 없다. 본문·메타데이터 설명 초안은 Execution Plan 8단계의 기존 사용자 검토를 따른다.
기준 dev·Next 버전·대상 파일이 달라지면 변경된 경계를 다시 정합화한다.
