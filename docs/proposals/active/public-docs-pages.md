---
# Metadata. status value는 proposals/README.md의 세 상태만 사용합니다.
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-10-13"
approved-by: "user:Sangeok"
approved-at: "2026-10-14"
approval-scope: "Proposal 0–6 전체(문서 본문을 product-copy.md에 옮기지 않는 예외 포함) — 대화 승인. 문서 본문 초안은 Execution Plan 8단계에서 따로 검토. 커밋·PR 생성·병합·main 승격은 단계마다 따로 확인"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "src/server/auth/config.base.ts"
  - "packages/core/pipeline.mjs"
  - "packages/core/entitlement.mjs"
---

# 검색 유입을 위한 공개 문서 페이지(`/docs`)

## Summary

검색으로 Stagekeeper를 처음 알게 되는 사람이 들어올 곳으로 `/docs` 아래에 영어 문서 페이지 다섯 개를 만든다.
각 페이지는 서로 다른 검색 의도 하나를 맡고, 제품과 어긋나면 안 되는 사실(설치 명령, 단계·게이트 이름, 플랜 차이,
인수 확인 이름)은 코드에서 직접 가져와 렌더한다. 문서는 전부 정적이고 색인되며, 비공개 화면은 지금처럼 noindex로 남는다.
선행 작업(메타데이터 기준 주소·robots·아이콘·공유 카드)은 PR #150으로 `dev`에 병합되었다.

## Goal

- Claude Code로 개발 흐름을 자동으로 돌리고 원하는 지점에서만 확인하려는 개발자가 검색으로 Stagekeeper에 도착하게 한다.
- 새 공개 라우트 다섯 개, 사이트맵, 랜딩 ↔ 문서 내부 링크를 추가한다(라우팅·인증 공개 목록 변경 포함).
- 문서가 제품 동작과 어긋나지 않게 하는 장치(코드에서 가져오는 사실, 잠금, 금지어 시험)를 둔다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 라우팅과 인증 공개 목록(`src/server/auth/config.base.ts`)을 바꾼다.
- 정적 URL 여섯 개(`/docs` 다섯, `/sitemap.xml`)가 새로 생긴다.
- barrel export 두 곳(`entities/pipeline`, `entities/project-token`)의 공개 범위가 바뀐다.
- 5개를 훨씬 넘는 파일이 바뀐다.

## Current State

- **공개 페이지:** 랜딩 `/` 하나와 `/login`뿐이다. `/login`은 로그인한 사람을 `/projects`로 보내는 "손님 전용" 접두사 목록
  (`PUBLIC_PREFIXES`)에 있고, `/`는 정확 일치 목록(`PUBLIC_EXACT`)에 있다(`src/server/auth/config.base.ts:6-7, 21-23`).
- **검색 노출 기반(`dev`에 병합, `main` 승격 전):** PR #150(`2a608c9`)으로 `dev`에 들어갔다 — 루트 기본 noindex와 랜딩만 index,
  `siteUrl()`(`src/server/public-url.ts`), `robots.ts`, 아이콘·공유 카드, proxy 제외 목록(`robots.txt|icon|apple-icon|opengraph-image`),
  랜딩 제목·설명 상수(`src/fsd/pages/landing/model/landing-copy.ts`)와 `copy-lock:landing-meta`.
- **검색 현황(2026-10-13 확인):** 사용 가능한 검색 도구에서 `site:stagekeeper.dev` 결과가 0건이다. "Stagekeeper Claude Code"
  검색에는 GitHub 저장소·PR과 이름이 비슷한 다른 제품(Stagehand)이 나온다. 게이트·자동화 주제의 검색 결과는 비슷한 플러그인과
  글이 이미 채우고 있다. 구글의 실제 색인 상태는 Search Console로만 알 수 있다.
- **README:** 첫 화면이 한국어 내부 개발 안내이고 제품 소개가 예전의 "통제" 관점이다. 영어로 찾아온 사람에게 막다른 길이다.
- **문서가 기댈 사실의 위치:**

| 사실 | 위치 | 문서에서 쓰는 방법 |
| --- | --- | --- |
| 단계 종류, 필수 단계, 선택 단계, 단계별 에이전트 | `packages/core/pipeline.mjs` `NODE_KINDS`·`REQUIRED_NODES`·`OPT_IN_NODES`·`NODE_AGENT` | `@harness/core/pipeline.mjs`에서 import |
| 기본 게이트(Plan 앞·Implement 앞) | `packages/core/pipeline.mjs` `DEFAULT_GATES` | import |
| 플랜별 차이(에이전트, 파이프라인 편집, 세션 승인, 실행 한도) | `packages/core/entitlement.mjs` `limitsFor` | import |
| 단계·게이트 이름, 게이트 버튼 이름·힌트 | `src/fsd/entities/pipeline` `nodeLabel`·`gateLabel`·`gateActionLabel`·`gateActionHint` | 공개 API에서 import |
| 인수 확인 다섯 가지 이름 | `src/fsd/features/review-gate/model/gate-text.ts:17-19` `ACCEPTANCE_CHECK_LABELS` | entities로 옮긴 뒤 import(아래 4절) |
| 플러그인 설치 명령 | `src/fsd/entities/project-token/model/connect-command.ts:61-67` `installCommands` | 클라이언트 컴포넌트가 없는 곳으로 옮긴 뒤 import(아래 4절) |
| watch 동작 | product-copy.md §5 `copy-lock:turn-banner-watch`, §15 "Local watch" | 문장으로 쓰고 근거를 단다 |
| 자동 일감 찾기 | product-copy.md §18 Scout 절 | 문장으로 쓰고 근거를 단다 |
| 토큰 세 종류(`hs_`·`hu_`·`ho_`) | `docs/architecture/protocol.md:13-15`, product-copy.md §9 | 문장으로 쓰고 근거를 단다 |

- **어긋난 정의 하나:** `CONTEXT.md`는 인수(Acceptance)를 "사람의 확인"으로 정의하지만, 2026-10-03부터 인수는 사용자의 세션(main loop)이
  다섯 가지 확인을 재현하고 실패가 기록될 때만 소유자를 기다린다(`scripts/retired-copy.test.mjs`의 `needs acceptance` 항목).
  문서는 현재 동작을 따른다. `CONTEXT.md` 정정은 이 제안의 범위 밖이다.

## Scope

포함 범위:

- `/docs` 문서 페이지 다섯 개와 문서 공통 틀(머리·꼬리), 사이드바, 이전/다음 링크
- 문서 페이지 목록(레지스트리)과 그것으로 만드는 메타데이터·사이트맵
- 인증 공개 목록에 문서 경로 추가와 인증 시험
- 루트 제목 템플릿, 문서 구간 색인, 페이지별 canonical, `sitemap.ts`, robots의 `Sitemap:` 줄, proxy 제외 목록의 `sitemap.xml`
- 랜딩: 제목·설명 변경, 머리의 "Docs" 링크, 꼬리의 문서 링크, WebSite 구조화 데이터(JSON-LD)
- 사실 출처 정리: 설치 명령을 `shared/config`로, 인수 확인 이름을 `entities/pipeline`으로 이동
- product-copy.md §20 신설, 머리말의 본문 예외, `landing-meta` 갱신, `docs-meta` 잠금, 문서 금지어 시험
- README 맨 위 영어 소개와 `stagekeeper.dev/docs` 링크

제외 범위:

- 페이지별 공유 카드, Breadcrumb 등 다른 구조화 데이터
- 블로그·변경 기록, 가격 페이지, 개인정보처리방침·이용약관, about 페이지, 다국어
- Codex·Windows 지원 안내(출시 전)
- `CONTEXT.md`의 인수 정의 정정(별도 작업)
- MDX 도입
- 코드 밖 작업: Search Console 등록(DNS TXT), GitHub 저장소 홈페이지 주소 변경, 플러그인·스킬 목록 등록 — 사용자가 직접 한다

## Proposal

### 0. 대화에서 확정한 결정

| 결정 | 내용 | 근거 |
| --- | --- | --- |
| 목적 | 검색 유입(Stagekeeper를 모르던 사람) | 사용자 선택 |
| 언어 | 영어만 | 사용자 선택. 제품 UI·문구 규칙이 영어 |
| 운영 | 한 번 만들고 제품이 바뀔 때만 고친다. 블로그·변경 기록 없음 | 사용자 선택 |
| 대상 검색자 | Claude Code로 흐름을 자동으로 돌리고, 고른 지점에서만 확인하려는 개발자 | 사용자 정정. 자기 승인 방지·증거는 신뢰 근거로 본문에 |
| about 페이지 | 만들지 않는다 | 검색 가치가 작다 |
| "AI" 단어 | §2 금지를 지킨다. 예외 없음 | 대상은 "Claude Code …"로 검색한다. "AI coding agent" 검색자는 대개 지금 제품을 쓸 수 없다 |
| 본문 위치 | 문서 본문은 product-copy.md에 옮기지 않고 문서 코드에 둔다 | 사용자 승인. 잠금은 포함 검사라 두 곳에 적어도 동기화가 보장되지 않는다(`verification.md` 문구 잠금 절) |
| 플랜 표현 | 앱 안 문구와 같은 사실만 쓰고 가격·구매 방법은 쓰지 않는다 | 결제가 없고 플랜은 수동 부여다 |

### 1. 페이지

| 경로 | 제목(템플릿 적용 전) | 역할 | 주요 내용 |
| --- | --- | --- | --- |
| `/docs` | `Stagekeeper docs — Claude Code pipeline with approval gates`(absolute) | 개요·허브, 브랜드 검색 | 무엇인지, 단계와 역할, 증거 규칙("Verified only with a record"), 플랜별 기본 단계, 각 문서로 가는 링크 |
| `/docs/getting-started` | `Get started` | 가입 후 첫 실행(전환용) | GitHub 로그인 → 프로젝트 만들기 → 토큰 화면 → 플러그인 설치 → `/harness:init` → 백로그 항목 → `/harness:watch` |
| `/docs/automation` | `Run Claude Code on your backlog` | "자동화" 검색 | 자동으로 도는 것(게이트 없는 구간, `/harness:watch`, 자동 일감 찾기, 세션이 하는 인수 확인 다섯 가지)과 멈추는 곳(게이트, 커밋 정책, 기록된 실패), 플랜별 실행 한도 |
| `/docs/approval-gates` | `Approval gates for Claude Code` | "승인 게이트" 검색 | 기본 게이트 두 개와 각 게이트의 버튼·힌트, 승인하는 곳(Inbox, Pro·Max는 소유자 토큰으로 세션에서도), Pipeline 탭 편집(Pro·Max), 게이트 0개와 그때의 경고, 뺄 수 없는 단계(Plan·Implement·Accept), 에이전트가 게이트를 열 수 없는 이유 |
| `/docs/security` | `MCP tokens and agent permissions` | "권한·토큰" 검색, 신뢰 | 토큰 세 종류와 범위, 에이전트 토큰에 없는 도구(게이트·설정), 해시 저장·선택 만료·폐기, 서버는 모델을 돌리지 않는다, 상태는 Stagekeeper에·파일은 사용자 저장소에 |

- 제목은 루트 템플릿 `%s · Stagekeeper`가 붙는다. `/docs` 개요만 `title.absolute`를 써서 브랜드가 두 번 나오지 않게 한다.
- 각 페이지에는 h1이 하나(페이지 제목)이고 나머지 소제목은 h2다.
- 설명(description)은 페이지 첫 문단을 155자 이내로 요약한 문장이고, 메뉴 이름과 함께 §20에 적고 잠근다.
- **토큰 설정 명령은 문서에 옮기지 않는다.** 토큰 화면의 명령은 실제 토큰 값과 셸(PowerShell·bash)에 따라 만들어진다
  (`connect-command.ts:29, 41`). 문서는 "프로젝트를 만들면 토큰 화면이 셸에 맞는 명령을 보여 준다"고만 안내하고,
  바뀌지 않는 명령(플러그인 설치, `/harness:init`, `/harness:watch`)만 보여 준다.
- 플랜 차이는 `limitsFor`에서 읽어 렌더한다: Free는 Verify·Doc audit·Implementation check·QA가 없고(에이전트 `pm`·`feature-scout`),
  파이프라인 편집과 세션 승인(소유자 토큰)이 Pro부터다.

### 2. 구조와 라우팅

라우트 파일(`src/app/docs/`) — 얇은 어댑터:

- `layout.tsx`: 문서 구간 메타데이터(`robots: { index: true, follow: true }`)와 문서 머리·꼬리(`DocsShell`).
- `page.tsx`, `getting-started/page.tsx`, `automation/page.tsx`, `approval-gates/page.tsx`, `security/page.tsx`:
  각자 `export const metadata = docsMetadata("<id>")`와 FSD 화면 하나를 렌더한다. 동적 `[slug]`를 쓰지 않는다 —
  `public-routes.test.mjs`가 `page.tsx` 경로를 글자 그대로 공개 목록과 대조하기 때문이다.

FSD(`src/fsd/pages/docs/` 슬라이스 하나):

- `model/docs-pages.ts`: 순서 있는 페이지 목록 `{ id, path, nav, title, description }` — 사이드바, 이전/다음, 메타데이터, 사이트맵의 단일 원천.
- `model/docs-metadata.ts`: `docsMetadata(id)` → `title`(개요는 absolute), `description`, `alternates.canonical`.
- `ui/docs-shell.tsx`: 머리(브랜드 → `/`, "Docs" → `/docs`, `/projects`로 가는 버튼)와 꼬리.
- `ui/docs-frame.tsx`: 사이드바(현재 페이지 표시)와 이전/다음. **각 페이지가 자기 id를 넘겨 그린다** — 레이아웃에서 현재 경로를
  알려면 클라이언트 컴포넌트가 필요하므로, 페이지 쪽에서 그려 서버 컴포넌트로 끝낸다.
- `ui/<id>-page.tsx` 다섯 개, `index.ts`(공개 API).
- 경로 함수: `src/fsd/shared/routes/docs.ts`의 `docsPath(id)` — 랜딩도 같은 함수로 링크한다(같은 layer의 다른 slice를 import할 수 없으므로).

머리·꼬리는 랜딩과 공유하지 않는다. 랜딩 머리는 로그인 상태에 따라 버튼이 바뀌는 동적 화면이고 문서는 정적이며, 쓰는 곳이 두 곳뿐이다
(fsd.md "세 곳 이상에서 확인된 뒤 공통화"). 랜딩 머리·꼬리에는 문서 링크만 더한다.

렌더링: 문서는 `auth()`·cookies를 쓰지 않아 전부 정적(○)이다. 머리의 버튼은 `/projects` 링크다 — 로그인하지 않은 사람은 proxy가
`/login?callbackUrl=…`로 보내고 로그인 후 `AFTER_SIGN_IN`(`/projects`)으로 돌아오며, 로그인한 사람은 바로 간다. 문구는 두 경우 모두
맞는 말로 §20에서 정한다(예: "Open Stagekeeper").

인증 공개 목록: `PUBLIC_EXACT`에 `/docs`, `/docs/getting-started`, `/docs/automation`, `/docs/approval-gates`, `/docs/security`를
추가한다. `PUBLIC_PREFIXES`는 로그인한 사람을 `/projects`로 보내므로 쓰지 않는다. 끝에 `/`가 붙은 주소는 proxy보다 먼저 308로
정규화된다(실행 서버에서 `/projects/` → 308 `/projects` 확인, Next 문서 proxy.md "Execution order").

콘텐츠 형식: TSX. 새 의존성이 없고, Windows 역할 빌드가 webpack 로더를 직접 고치는 구조(`next.config.mjs`)라 로더를 더하는 MDX는
그 빌드까지 다시 검증해야 한다. 명령에는 기존 `shared/ui/code`·`copy-button`을 쓴다.

### 3. 검색 노출 설정

- 루트 레이아웃 제목: `{ default: "Stagekeeper", template: "%s · Stagekeeper" }`. 같은 폴더의 랜딩에는 적용되지 않는다.
- 문서 페이지는 openGraph를 쓰지 않는다. 메타데이터는 얕게 병합되어 루트의 `siteName`이 사라지고, og:title·og:description은 Next가
  제목·설명에서 채운다(`node_modules/next/dist/lib/metadata/resolve-metadata.js` `inheritFromMetadata`).
- 공유 이미지: 루트 카드를 물려받는다. 페이지별 카드는 주소가 `/docs/…/opengraph-image`가 되어 지금 proxy 제외 규칙(경로 맨 앞만 본다)에
  걸리므로 만들지 않는다.
- `src/app/sitemap.ts`: `/`와 문서 다섯 페이지, `siteUrl()`로 만든 절대 주소. `lastModified`·`changeFrequency`·`priority`는 넣지 않는다
  (구글은 뒤의 둘을 무시하고, lastmod는 꾸준히 정확할 때만 쓴다). 빌드 때 만들어지므로 배포 빌드 환경에 `HARNESS_PUBLIC_URL`이 필요하다.
- `src/app/robots.ts`에 `sitemap: <siteUrl>/sitemap.xml`, `src/proxy.ts` 제외 목록에 `sitemap.xml`.
- 내부 링크: 랜딩 머리 "Docs", 꼬리의 문서 링크, 문서 사이드바·이전/다음, 본문 속 관련 페이지 링크, 문서 머리 브랜드 → `/`.
- 랜딩 WebSite 구조화 데이터: `{ "@context": "https://schema.org", "@type": "WebSite", name: "Stagekeeper", url }`를 `src/app/page.tsx`에서
  렌더한다(주소가 서버 함수 `siteUrl()`에서 오므로 라우트 어댑터에 둔다). Next JSON-LD 가이드대로 `<`를 `\u003c`로 바꾼다.
- 랜딩 제목·설명 변경:
  - 제목 `Stagekeeper — Automate Claude Code with approval gates`
  - 설명 `Your Claude Code runs plan → verify → implement → accept. Gates are where you put them, and nothing passes without a record.`
  - 설명은 더 이상 본문 문단의 앞 두 문장이 아니므로 `LANDING_DESCRIPTION`을 본문 문단에서 떼고, `landing-page.test.ts`의
    "설명이 본문 문단에 있다" 검사를 지운다. 본문 문단 문구는 바꾸지 않는다.

### 4. 사실 출처 정리

- **설치 명령 이동:** `PLUGIN_MARKETPLACE`·`PLUGIN_ID`·`installCommands`를 `entities/project-token/model/connect-command.ts`에서
  `src/fsd/shared/config/plugin-install.ts`로 옮긴다. `entities/project-token`의 공개 API는 `"use client"`인 `TokenReveal`·`OwnerTokenReveal`을
  내보내므로, 공개 페이지가 그 barrel을 모듈 그래프로 끌어오지 않게 한다(랜딩 `InboxDemo` 주석과 같은 선택). 함께 고치는 곳:
  - `connect-command.ts`(Codex 설치 명령이 두 상수를 쓴다)와 `ui/token-reveal.tsx`(`installCommands`)는 새 위치에서 가져온다. 다시 내보내지 않는다 — 같은 값의 경로가 둘이 된다.
  - `connect-command.test.ts`의 `installCommands` 값·`PLUGIN_ID`와 `.claude-plugin/marketplace.json` 대조·`PLUGIN_MARKETPLACE` 형식 검사는
    `shared/config/plugin-install.test.ts`로 옮긴다.
- **인수 확인 이름 이동:** `ACCEPTANCE_CHECK_LABELS`를 `features/review-gate/model/gate-text.ts`에서 `entities/pipeline/model/`로 옮기고
  `entities/pipeline` 공개 API로 내보낸다. `review-gate/ui/acceptance-failure.tsx`는 그것을 `@/fsd/entities/pipeline`에서 가져온다.
  두 slice가 쓰는 도메인 이름이므로 아래 layer가 맞다. `ACCEPTANCE_RETRY_HINT` 등 나머지 문구는 `gate-text.ts`에 남는다.

### 5. 문구 관리와 시험

- product-copy.md:
  - §20 "Docs — public `/docs`": 페이지 제목·설명·메뉴 이름, 문서 머리 버튼과 꼬리 링크, 랜딩의 문서 링크, 문서용 "Claims we don't make"
    (완전 자동이라 말하지 않는다, Codex·Windows 지원과 가격을 말하지 않는다).
  - `copy-lock:docs-meta`: 다섯 페이지의 제목과 설명, 글자 일치.
  - §16과 `copy-lock:landing-meta`: 새 랜딩 제목·설명.
  - 머리말: 문서 본문은 이 파일에 옮기지 않는다는 예외와 그 대신 지키는 장치(아래).
- 본문 예외 대신 지키는 장치:
  - 사실은 코드에서 가져온다(Current State 표, 4절).
  - `scripts/retired-copy.test.mjs`가 `src/fsd`·`src/app`의 모든 `.ts`·`.tsx`를 이미 검사한다 — 문서도 자동 대상이다.
  - 새 문서 금지어 시험: 렌더한 문서 HTML에서 `<code>`·`<pre>` 요소 밖에 `AI`·`LLM`(대문자 그대로, 단어 단위)이나
    `stamp`, `reject`, `ticket`, `harness`(대소문자 무시, 단어 단위 — `rejects` 같은 활용형 포함)가 있으면 실패한다.
    `/harness:init`·`harness@stagekeeper-local`은 코드 요소 안에만 쓴다. `issue`·`task`·`model`처럼 일반 영어와 겹치는 낱말은
    오탐이 많아 사람 검토로 둔다.
- 새 시험과 고치는 시험:

| 시험 | 위치 | 확인하는 것 |
| --- | --- | --- |
| 페이지 목록 ↔ 라우트 파일 | `src/fsd/pages/docs/model/docs-pages.test.ts` | `src/app/docs` 아래 `page.tsx` 경로와 목록 경로가 같다 |
| 사이트맵 | `src/app/sitemap.test.ts` | 사이트맵 주소가 `/`와 목록 경로의 절대 주소와 같다 |
| `docs-meta` 잠금 | `src/fsd/pages/docs/ui/docs-copy.test.ts` | 목록의 제목·설명이 잠금과 글자 일치 |
| 문서 금지어 | 같은 파일 | 위 목록 |
| 인증 | `src/server/auth/config.base.test.mjs` | 문서 경로가 로그인 전·후 모두 열린다 |
| `landing-meta` | `src/fsd/pages/landing/ui/landing-page.test.ts` | 새 제목·설명, "본문 문단" 검사 삭제 |
| 공개 목록(변경 없음) | `src/server/auth/public-routes.test.mjs` | 문서 경로 다섯 개가 `PUBLIC_EXACT`에 있다 |

- `docs/architecture/verification.md` 문구 잠금 표에 `docs-meta`와 금지어 시험을 더하고 `landing-meta` 설명을 고친다.

### 6. README

맨 위에 영어 소개(무엇인지 두세 문장, `https://stagekeeper.dev/docs`와 시작 페이지 링크)를 두고, 기존 한국어 개발 안내는 그 아래에 그대로 둔다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `src/app/docs/**` (layout 1, page 5) | add | 새 공개 라우트, 얇은 어댑터 | low — 정적, 공개 목록 시험이 보호 |
| `src/app/sitemap.ts`, `src/app/sitemap.test.ts` | add | 사이트맵 | low |
| `src/app/robots.ts`, `src/app/layout.tsx`, `src/app/page.tsx` | update | `Sitemap:` 줄, 제목 템플릿, JSON-LD | low |
| `src/proxy.ts` | update | `sitemap.xml` 제외 | low — 제외 목록 한 단어 |
| `src/server/auth/config.base.ts`, `config.base.test.mjs` | update | 문서 경로 공개 | medium — 인증 경계, 양방향 시험으로 보호 |
| `src/fsd/pages/docs/**` | add | 문서 슬라이스 | low |
| `src/fsd/pages/landing/**` | update | 제목·설명, 문서 링크, 설명과 본문 분리 | low |
| `src/fsd/shared/routes/docs.ts` | add | 경로 함수 | none |
| `src/fsd/shared/config/plugin-install.ts`, `plugin-install.test.ts` | add(move) | 설치 명령의 클라이언트 없는 출처, 옮겨 온 값·매니페스트 대조 시험 | low — 같은 값, `token-reveal.test.ts`가 토큰 화면을 렌더해 `token-reveal-shared` 잠금(설치 명령 포함)으로 확인 |
| `src/fsd/entities/project-token/model/connect-command.ts`, `connect-command.test.ts`, `ui/token-reveal.tsx` | update | 이동한 상수를 새 위치에서 가져옴, 옮긴 시험 제거 | low |
| `src/fsd/entities/pipeline/**`, `src/fsd/features/review-gate/model/gate-text.ts`, `ui/acceptance-failure.tsx` | update(move) | 인수 확인 이름을 entities로 | low — barrel 공개 범위 변경, review-gate 시험이 보호 |
| `docs/conventions/product-copy.md` | update | §20, 예외, 잠금 | low |
| `docs/architecture/verification.md`, `docs/architecture/fsd.md` | update | 잠금 표, shared config 목록 | none |
| `README.md` | update | 영어 소개 | none |

## Safety Analysis

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — 문서 경로는 `PUBLIC_EXACT`에만 넣고, 로그인 전·후 시험과 `public-routes.test.mjs`가 양방향으로 막는다.
  `[slug]`를 쓰지 않아 기존 시험의 가정이 유지된다. 끝 `/` 주소는 proxy 전에 308로 정규화된다.
- [x] 정적 `import` / `export from` — 문서는 클라이언트 컴포넌트가 없는 공개 API만 가져온다
  (`entities/pipeline`, `shared/config`, `shared/routes`, `@harness/core`). `entities/project-token` barrel은 가져오지 않는다.
- [x] barrel export(`index.ts`) 경유 참조 — `entities/pipeline`에 `ACCEPTANCE_CHECK_LABELS` 추가, `entities/project-token`은 공개 API 변화 없음
  (내부 상수만 shared로 이동).
- [x] 테스트와 스크립트 참조 — `retired-copy.test.mjs`가 새 파일을 자동으로 읽는다. 금지어 시험은 문서 페이지에만 적용한다.
- [x] 정적 자산 URL — `public/`을 쓰지 않는다. 새 정적 URL은 문서 다섯과 `/sitemap.xml`.
- [x] 런타임 side effect — 문서는 정적이고 `auth()`를 부르지 않는다. JSON-LD는 정적 문자열이다.
- [ ] dynamic `import()`, 타입 선언·ambient module, API·storage·analytics — 해당 없음.

## Approval

승인 메모:

- 설계 1/4–4/4는 대화에서 승인되었다(본문 예외 포함). 이 문서의 승인 기록은 front matter에 있다.
- 승인 후에도 커밋, PR 생성·병합, `dev` → `main` 승격은 단계마다 따로 확인한다.

## Execution Plan

1. 선행(완료): `harness/seo-metadata`는 PR #150으로 `dev`에 병합되었다. `main` 승격은 이 작업과 별개로 진행한다.
2. `dev`에서 `harness/public-docs` 브랜치를 만든다.
3. 사실 출처 정리(4절)와 시험을 먼저 녹색으로 만든다.
4. 페이지 목록·메타데이터·라우트·문서 틀(2절)과 인증 공개 목록·시험을 넣는다.
5. 다섯 페이지 본문 초안을 쓴다. 각 사실 옆에 근거 파일을 단 검토용 목록을 함께 낸다.
6. 검색 노출 설정(3절)과 랜딩 변경을 넣는다.
7. 문구 관리(5절)와 README(6절)를 갱신한다.
8. 검증 후 사용자가 본문 초안을 검토하고, 승인되면 `dev`로 PR을 연다.

세부 단계는 이 문서가 승인된 뒤 구현 계획으로 따로 쓴다.

## Verification Plan

실행할 검증:

```bash
npm run verify:fsd
npm run check
npm run test:web
npm test
HARNESS_PUBLIC_URL=https://stagekeeper.dev npm run build
```

macOS에서는 `TMPDIR`를 실제 경로로 바꿔 실행한다(`export TMPDIR="$(cd "$TMPDIR" && pwd -P)"`). `/var`가 심볼릭 링크라 init·Windows 런타임
시험이 임시 디렉터리를 거부하는 기존 환경 문제다. 깨끗한 `dev`에서도 같은 실패가 나는지로 기존 실패와 신규 실패를 구분한다.

검증 기준:

- 위 명령이 모두 성공하고, 빌드 결과에서 문서 다섯 경로와 `/sitemap.xml`이 정적(○)이다.
- 실행 서버(`next start`)에서:
  - 문서 다섯 페이지가 로그인 없이 200이고, `<title>`·canonical(`https://stagekeeper.dev/docs/...`)·`robots: index, follow`가 `<head>`에 있다.
  - `/sitemap.xml`이 200이고 주소 여섯 개를 담는다. `/robots.txt`에 `Sitemap:` 줄이 있다.
  - 랜딩에 문서 링크와 WebSite JSON-LD가 있고, `/login`·비공개 경로는 여전히 noindex·리다이렉트다.
  - 문서 머리 버튼(`/projects`)이 로그인 전에는 `/login?callbackUrl=…`로 간다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | Not run yet | 구현 후 |
| `npm run test:web` | Not run yet | 구현 후 |
| `npm test` | Not run yet | 구현 후 |
| `npm run build` | Not run yet | 구현 후 |

## Risks and Rollback

잔여 리스크:

- 본문 문장 중 코드에서 가져오지 않는 사실(watch 동작, 토큰 범위 설명 등)은 제품이 바뀌면 낡을 수 있다. 폐기 표현 시험은 사람이 옛 표현을
  등록해야 잡는다. 제품 동작을 바꾸는 PR의 체크리스트에 문서 확인을 더하는 것으로 줄인다.
- 검색 성과는 보장되지 않는다. 검색량 데이터 없이 검색 결과를 보고 정한 구성이라, 배포 후 Search Console의 실제 검색어로 제목과 페이지를 조정한다.
- 랜딩 설명이 본문 문단과 분리되면서 "설명 = 본문" 보장이 사라진다. 설명은 §16 잠금으로만 지킨다.

롤백 방법:

- 구현 PR을 되돌린다. 문서 경로가 `PUBLIC_EXACT`에서 빠지면 `public-routes.test.mjs`가 남은 `page.tsx`를 잡으므로 라우트 파일과 함께 되돌린다.
  사이트맵 항목은 페이지 목록에서 만들어지므로 따로 정리할 것이 없다.

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

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [x] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.

## Open Questions

- 없음. 문구(페이지 설명, 메뉴 이름, 문서 머리 버튼)는 5단계 초안 검토 때 §20에 확정한다.
