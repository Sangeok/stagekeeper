---
# Metadata. status value는 proposals/README.md의 세 상태만 사용합니다.
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-08-29"
approved-by: "Sangeok"
approved-at: "2026-08-30"
approval-scope: "전체(Phase 0·1) — PR #1·#2 머지로 승인 갈음, front matter는 사후 기록"
completed-at: "2026-09-01"
verification-summary: "check·test 스위트 전부 통과, 스모크 인수 2회(1차 blocked → 재실행 pass) — docs/test-reports/completed/2026-09-01-phase-1-smoke-acceptance.md"
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related:
  - "docs/investigations/active/harness-platform.md"
---

# 하니스 플랫폼 Phase 0·1 구축 — 이 저장소에서 바로 착수할 태스크 분해

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`로 태스크 단위 실행. 단계는 체크박스(`- [ ]`)로 추적한다. 스펙은 `docs/investigations/active/harness-platform.md`(이하 **스펙**)이며 이 문서와 **함께** 읽는다 — 스펙에 이미 있는 코드는 여기 다시 싣지 않고 `스펙 Task N.N` 으로 가리킨다.

## Summary

스펙(v2)의 Phase 0(부트스트랩)·Phase 1(핵심)을 **이 저장소(`stagekeeper`, create-next-app 초기 상태)** 에서 실행 가능한 20개 태스크로 나눈다. 스펙은 새 모노레포(`apps/web` + `packages/core` + `plugin/`)를 전제로 썼지만 이 저장소는 루트에 Next.js 16이 이미 있으므로, **단일 패키지 + `src/` 레이아웃**으로 옮겨 적었다. 또 스펙 작성 이후 확인한 라이브러리 현행 API(mcp-handler 2.x, Prisma 7, Auth.js v5, Next 16의 `next lint` 제거·`proxy`)에 맞춰 코드 블록을 교정했다. 스펙에서 "v1 백업"에만 있던 네 순수 모듈(`config`·`render`·`manifest`·`vars`)은 임시 경로가 휘발성이라 여기 본문에 실었다. Phase 2~4는 스펙대로 **별도 제안서**로 미룬다.

## Goal

- Phase 0 완료: `npm run check`·`npm test` 통과, 로컬 Neon DB 마이그레이션 적용, 플러그인 골격.
- Phase 1 완료 기준(스펙 §10): **빈 저장소** 하나를 서비스에 연결해 백로그 항목 1건이 **웹 게이트 2회**를 거쳐 `완료`가 된다 — 에이전트 토큰으로는 게이트 도구가 존재하지 않음을 실측으로 확인.
- 작업 유형: 신규 구현(서비스 코드) + 이식(ApcH `de25a1c` 원재료) + 문서.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 인증(GitHub OAuth)·DB 마이그레이션·API 계약(MCP 도구 집합)·라우팅(`app/` → `src/app/`) 전부에 닿는다.
- 파일 수십 개 신규. 롤백은 태스크별 커밋 revert지만 DB 마이그레이션은 별도 절차(§Risks).

## Current State

| 항목 | 상태(2026-08-29 실측) |
| --- | --- |
| 저장소 | `main` 커밋 2개 — `f04c4ef`(create-next-app) · `8289320 init`(`docs/` 규약·스펙·이 제안서). 코드는 아직 스캐폴드 그대로: `app/`이 루트(`src/` 없음), Tailwind 4, TS strict, `@/*` → `./*` |
| **아키텍처(신규, 미커밋)** | 이 제안서 작성 뒤 들어옴 — `docs/architecture/{README,fsd,system-overview,verification}.md`(구조의 source of truth) · `docs/ADR/0001-adopt-feature-sliced-design.md` · `CONTEXT.md` · `scripts/verify-fsd-boundaries.mjs`(+테스트). `package.json`에 `verify:fsd`·`test:architecture`가 생겼고 `lint`가 ESLint 뒤에 경계 검사를 붙인다. **C14가 이 제안서를 거기에 맞춘다** |
| 의존성 | `next 16.3.3`, `react 19.2.8`, eslint 9(flat config, `lint: eslint`). Prisma·MCP·Auth 없음 |
| Node | v22.13.1, npm 11.7.0 (스펙 사전 검증과 같은 런타임) |
| 스펙 원재료 ApcH | `C:/Users/hamso/OneDrive/Desktop/git/ApcH` HEAD = `de25a1c` — 스펙 §8의 모든 경로 실재 확인(34/34) |
| v1 검증 모듈 | ApcH 세션 스크래치패드 `…/922c2f8f-…/scratchpad/harness-check-v2/` — 오늘 재실행 **49/49 통과**. 임시 경로라 본 문서에 코드 이관 |
| 라이브러리 현행 | `mcp-handler 2.1.1`(peer `@modelcontextprotocol/server ^2`, zod 4) · `@prisma/client 7.10.0`(**`prisma`의 `latest` 태그는 `8.0.0-rc.12` — 반드시 `prisma@7.10.0` 고정**) · `next-auth 5.0.0-beta.32`(Next 16 peer 지원) · Next 16: `next lint` 제거, `middleware` → `proxy`, `params` 비동기, `RouteContext`/`PageProps` 헬퍼 |

## Scope

포함 범위:

- 스펙 Phase 0(Task 0.1~0.3)·Phase 1(Task 1.1~1.11) 전부 — 이 저장소 레이아웃에 맞게 재배치·교정.
- `packages/core`(순수 모듈 8개), `plugin/`(템플릿·생성기·`/harness:init` 스킬), 서비스(`src/`: Prisma·전이 서비스·MCP 서버·인증·웹 화면 6개), 문서 골격(`docs/architecture/`).

제외 범위:

- Phase 2(ApcH 임포트·첫 테넌트), Phase 3(명령 원장·루틴·배포 원장·`verify-plan`), Phase 4(구독·팀·GitHub App·marketplace) — 착수 시 별도 제안서. **Phase 2 제안서가 반드시 답해야 하는 것 하나:** 통일 dev 템플릿이 떨어뜨리는 워크스페이스별 절 두 개(admin의 `frontend-design` 절 + `Skill` 도구, backend의 `순수 모듈 규칙` 절)를 어떻게 되살릴지 — 근거와 선택지는 T1.15 Step 5.
- ApcH 저장소 변경 일체(스펙 D3·§14).
- 배포(Vercel 프로젝트 생성·도메인) — Phase 1 실측은 로컬 `npm run dev`로 충분. 배포는 별도.

## 스펙 대비 변경점 — 왜 스펙 그대로가 아닌가

| # | 스펙 | 이 제안서 | 이유 |
| --- | --- | --- | --- |
| C1 | 모노레포 `apps/web`·npm workspaces | **단일 패키지**, Next 앱은 루트 그대로. `app/` → `src/app/`로만 이동, `packages/core`·`plugin`은 디렉터리(workspace 아님) | 루트에 이미 Next가 있다. 이동 비용 없이 스펙의 경로(`src/app/api/mcp`, `src/server`, `src/fsd`)를 그대로 쓴다. Global Constraint(순수 모듈 의존성 0)는 tsconfig `paths`로 충족 |
| C2 | `check: next lint && tsc` | `check: eslint && tsc --noEmit` | Next 16이 `next lint`를 제거 |
| C3 | Prisma `prisma-client-js` + datasource `url` | `prisma-client` 생성기 + `output` + `prisma.config.ts` + `@prisma/adapter-pg` | Prisma 7 필수 형식(datasource `url` 제거, 드라이버 어댑터 필수) |
| C4 | `app/api/mcp/[transport]/route.ts`, `basePath`, `inputSchema: {a: z.string()}`, `extra.authInfo` | `src/app/api/mcp/route.ts`, `inputSchema: z.object({...})`, `ctx.http?.authInfo` | mcp-handler 2.x — `[transport]`·`basePath`·SSE·세션 폐지, SDK v2 시그니처 |
| C5 | `middleware.ts` | `src/proxy.ts` | Next 16 |
| C6 | ApcH `~/` 별칭 | `@/` | 이 저장소 tsconfig |
| C7 | Task 1.4 "v1 백업에서 복사" | 코드를 본 문서 T1.4에 수록 | 임시 경로 휘발 |
| C8 | 전이 서비스 = "Prisma 모듈 mock 테스트" | **순수 판정 모듈(`board-rules.ts`) + Prisma 적용 모듈(`board.ts`)** 로 분리. 규칙은 DB 없이 테스트, 저장은 스모크(T1.17)가 판정 | ApcH 관례("판단 로직은 순수 모듈로") · `--experimental-test-module-mocks` 의존 회피 |
| C9 | `discard` = 행 삭제 + 이벤트 | `BoardItem.discardedAt` 표기(스키마 열 1개 추가), 행은 남김 | 행을 지우면 이벤트가 cascade로 사라져 불변식 8(원장 = 감사 로그)에 어긋난다 |
| C10 | `docs/{SOURCES,invariants,protocol,rationale}.md` | `docs/architecture/{sources,invariants,protocol,rationale}.md` | 이 저장소의 docs 규약 |
| C11 | `harness-init` 기본 서버 `https://harness.a-pch.com` | 기본값 없음 — `--server` 또는 `HARNESS_SERVER` 필수 | 스펙 Q1(도메인) 미결. 잘못된 기본값이 저장소에 박히는 것을 막는다 |
| C12 | §9 plan-verifier `tools:`에 `Skill` 없음 | `Skill` 포함 | 정의 본문 1단계가 `reconciling-proposals-with-codebase` 스킬 로드를 요구(ApcH 원본도 `Skill` 보유) |
| C13 | 스킬 디렉터리 `plugin/skills/harness-init/`, 설치는 로컬 marketplace | 디렉터리 **`plugin/skills/init/`**, 설치는 **`claude --plugin-dir`**(+ 선택적 `marketplace.json`) | 문서 확인: `skills/` 아래 스킬의 호출 이름은 **폴더 이름**이라 `harness-init/`면 명령이 `/harness:harness-init`이 된다 — 스펙이 도처에서 쓰는 `/harness:init`이 되려면 폴더가 `init`이어야 한다. 또 `claude plugin marketplace add <경로>`는 그 경로에 `.claude-plugin/marketplace.json`을 요구하는데 어느 태스크도 만들지 않았다 |
| C15 | 상태 식별자 한국어(승인대기·계획지시·검토대기·구현승인·완료·보류), 화면·템플릿 한국어(`templates/ko/`), 루트 `/` = 프로젝트 목록 | **영문 식별자** `proposed·planning·in_review·implementing·done·on_hold`(마이그레이션 `20260830070954_english_status_identifiers`), 보이는 문자열 전부 영어·템플릿 `templates/en/`만, **공개 랜딩 `/`** + 목록 **`/projects`**, 디자인 토큰 v4(`docs/conventions/design.md`) | 사용자 결정(2026-08-30): 제품은 영어로 서비스한다. 문구의 출처는 `docs/conventions/product-copy.md`. 이 제안서 본문의 한국어 상태명·`/` 목록 서술은 작성 시점 기록이다 |
| C14 | `src/fsd/**` 경로를 이 제안서가 자유롭게 정함 | **저장소의 승인된 FSD 아키텍처를 따른다** — 아래 「C14 상세」 | 이 제안서 작성 뒤 저장소가 FSD를 채택했다(ADR-0001, `docs/architecture/{README,fsd,verification}.md`, `scripts/verify-fsd-boundaries.mjs`). `AGENTS.md`: "proposals describe future work and **do not override accepted architecture**". 게다가 `npm run lint`가 경계 검사를 돌리므로 정렬하지 않으면 **첫날부터 lint가 깨진다** |

### C14 상세 — 승인된 FSD 아키텍처에 맞춘 경로·public API

이 제안서는 `src/fsd/**` 경로를 자유롭게 정해 놓았지만, 그 뒤 저장소가 FSD를 **승인된 아키텍처**로 채택했다. `scripts/verify-fsd-boundaries.mjs`가 `npm run lint`에서 돌며 아래를 강제한다(스크립트 실측): layer는 `pages · widgets · features · entities · shared`, slice segment는 `api · config · lib · model · ui`뿐, shared segment는 `api · assets · config · i18n · lib · routes · ui`, 전부 **kebab-case**, **다른 slice는 public API로만**(deep import 금지), 같은 layer의 다른 slice import 금지, `src/server → src/fsd` 역방향 금지, Client Component의 서버 모듈 import 금지.

**이 제안서가 어기고 있던 것 — 검사기가 실제로 잡는 셋(실측: 각 위반을 일부러 만들어 확인):**

| 위반 | 검사기 코드 |
| --- | --- |
| `ui/_component/` | `naming/kebab-case` |
| `@/fsd/entities/board/model/board-item` 같은 **deep import** | `fsd/no-deep-import` |
| non-empty slice에 `index.ts` 부재(이 제안서엔 **하나도 없었다**) | `fsd/public-api-required` |

**넷째는 성격이 다르다 — `shared/lib/utils.ts`는 검사기가 잡지 않는다**(실측: 이름을 되돌려도 통과). 이건 `fsd.md`의 규약이다: "`temp.ts`·`helpers.ts`·`types.ts` 같은 맥락 없는 이름은 피한다", "`shared/lib`의 각 라이브러리도 `date`·`text`·**`class-name`**처럼 한 가지 목적을 이름으로 드러낸다". 그래서 `class-name.ts`로 바꾸되, **자동 게이트가 아니라 리뷰 대상**임을 알고 간다.

**경로 정렬표 — T1.10~T1.14의 `Files:`는 이 표를 따른다.** slice 이름은 `docs/architecture/fsd.md`가 이 제품에 대해 직접 제시한 후보를 쓴다.

| 이 문서의 옛 경로 | 정렬 후 | public API |
| --- | --- | --- |
| `features/project/api/create-project.ts` | `features/create-project/api/create-project.server.ts` | `index.ts`(폼) · `index.server.ts`(액션) |
| `features/project/api/tokens.ts` | `features/manage-token/api/manage-token.server.ts` | 〃 |
| `features/project/ui/new-project-form.tsx` | `features/create-project/ui/new-project-form.tsx` | |
| `features/project/ui/token-reveal.tsx` | `features/manage-token/ui/token-reveal.tsx` | |
| `features/backlog/**` | `features/edit-backlog/{api/edit-backlog.server.ts, ui/*}` | `index.ts`·`index.server.ts` |
| `features/gate/api/actions.ts` | `features/review-gate/api/review-gate.server.ts` | `index.server.ts` |
| `features/gate/model/gate.ts` | `features/review-gate/model/gate-source.ts` | `index.ts` |
| `features/gate/model/gate-text.ts` | `features/review-gate/model/gate-text.ts` | 〃 (`fsd.md`의 예시와 동일) |
| `features/gate/ui/*.tsx` | `features/review-gate/ui/*.tsx` | 〃 |
| `entities/board/model/board-item.ts` | `entities/board-item/model/board-item.ts` | `index.ts` |
| `entities/board/model/doc-links.ts` | `entities/board-item/model/doc-link.ts` | 〃 |
| `entities/board/model/report.ts` | `entities/report/model/report.ts` | `index.ts` |
| `shared/lib/utils.ts` | `shared/lib/class-name.ts`(`cn`) | unit별 public API |
| `shared/api/result.ts` | 그대로 | |
| `pages/pipeline/model/*` | `pages/project-board/model/*` | `index.ts` |
| `pages/pipeline/ui/index.tsx` | `pages/project-board/ui/project-board-page.tsx` | 〃 |
| `pages/pipeline/ui/_component/*.tsx` | `pages/project-board/ui/*.tsx` (**평탄화** — `_component`는 허용 segment가 아니다) | 〃 |
| (신규) `/` 화면 | `pages/project-list` | `index.ts` |
| (신규) `/p/[slug]/inbox` 화면 | `pages/project-inbox` | `index.ts` |
| (신규) `/p/[slug]/backlog` 화면 | `pages/project-backlog` | `index.ts` |
| (신규) `/p/[slug]/tokens` 화면 | `pages/project-tokens` | `index.ts` |
| (신규) `/p/[slug]/items/[key]` 화면 | `pages/board-item` | `index.ts` |

**함께 지킬 것:**
- `src/app/**`의 route 파일은 **얇은 adapter**다 — params 해석 → `requireMember` → `src/server` 조회 → FSD page에 props로 넘김. 화면 로직을 route에 쌓지 않는다(`fsd.md` 예시 그대로).
- FSD가 `src/server`를 부르는 것은 **`api` segment의 서버 전용 파일에서만**(`"use server"` 또는 `import "server-only"`), 외부에는 `index.server.ts`로만 공개한다. `"use client"` 파일은 `@/server`·`*.server`를 import하지 않는다.
- `export *` 금지 — public API는 공개할 symbol을 명시한다.
- slice **내부**는 상대 경로, **외부**는 `@/fsd/<layer>/<slice>` public API.
- `packages/core`는 `src`와 npm package에 의존하지 않는다(이미 그렇다).

경로 대응표(스펙 → 이 저장소):

| 스펙 | 이 저장소 |
| --- | --- |
| `apps/web/src/app/**` · `src/server/**` · `src/fsd/**` | `src/app/**` · `src/server/**` · `src/fsd/**` |
| `apps/web/prisma/schema.prisma` | `prisma/schema.prisma` (+ 루트 `prisma.config.ts`) |
| `packages/core/*.mjs`, `plugin/**`, `scripts/*.mjs`, `examples/apch/harness.json` | 동일 |
| `import … from "@harness/core/x.mjs"` | 동일(tsconfig `paths` → `./packages/core/*`). `.mjs` 테스트 파일에서는 상대경로 |
| `npm test -w apps/web` / `npm run check -w apps/web` | `npm run test:web` / `npm run check` |

## 착수 전 확인 (기본값으로 진행, 승인 시 뒤집을 수 있음)

| # | 질문 | 기본값 |
| --- | --- | --- |
| D-A | 프로토콜 식별자 — `harness.json`·`HARNESS_TOKEN`·MCP 서버명 `harness`·`mcp__harness__*`·플러그인명 `harness`·`/harness:init` | **스펙대로 `harness` 유지.** 저장소·패키지 이름만 `stagekeeper`. 뒤에 바꾸면 템플릿·스킬·테스트 전부 grep 치환 |
| D-B | 레이아웃 | C1(단일 패키지 `src/`). 모노레포를 원하면 T0.1이 "이동 태스크"가 되고 경로 대응표가 바뀐다 |
| D-C | DB | Neon(스펙 Q2). `@prisma/adapter-pg`로 표준 `postgresql://` TCP 접속(Neon pooled URL 그대로) |
| D-D | 서비스 URL 기본값 | 없음(C11). 웹 토큰 페이지가 URL을 보여주고 사용자가 `--server`로 넘긴다 |
| D-E | 브랜치 | `harness/phase-0-1`에서 작업, Phase 0·1 완료 시 `main` 병합 |

## Proposal

### 실행 계획서 머리

**Goal:** 사용자의 Claude가 MCP로 붙는 하니스 서비스의 Phase 0·1을 이 저장소에 세운다.

**Architecture:** 웹이 제품, 진실은 DB, 사용자 Claude는 MCP 도구로만 상태를 읽고 쓴다. 규칙(`packages/core/transitions.mjs`)은 의존성 0 순수 모듈이고 서버(MCP 도구·웹 액션)가 같은 함수로 판정한다. 게이트 도구는 에이전트 토큰용 MCP 서버에 **등록되지 않는다**(회귀 가드 테스트로 고정).

**Tech Stack:** Next.js 16.3.3(App Router, `src/`) · Prisma 7.10.0 + `@prisma/adapter-pg` · Postgres(Neon) · `mcp-handler 2.1.1` + `@modelcontextprotocol/server 2.0.0` + `zod 4` · `next-auth 5.0.0-beta.32`(GitHub) · 순수 모듈 ESM `.mjs` + `node:test` · `tsx`(TS 테스트) · Claude Code 플러그인.

**Spec:** `docs/investigations/active/harness-platform.md` §1~§9 (원천 ApcH `de25a1c`).

### Global Constraints

스펙 「Global Constraints」 전문이 그대로 적용된다. 요약:

- 실행은 사용자 Claude. 서비스는 Claude를 돌리지 않는다.
- 상태(보드·백로그·게이트·명령·이력)의 진실은 서비스 DB. 사용자 저장소에 보드·백로그 md를 두지 않는다.
- 코드 인접 산출물(`docs/plans/<ID>.md`, `docs/agents/<행위자>/<ID>.md`)만 저장소.
- 게이트①②·반려·재개는 웹 로그인 사용자만. MCP 토큰에는 그 도구가 없다.
- 사용자·에이전트에게 **보이는** 문자열은 영어(상태 식별자 포함). 문서(`docs/`)와 코드 주석은 한국어(C15).
- 에이전트 권한은 정의 파일 `tools:`로 강제(pm은 파일 도구 0).
- `packages/core`·`plugin/bin`·`plugin/lib`는 의존성 0.
- ApcH 불변식 8개(스펙 §3.2) 보존.
- 새 상수를 코드에 박지 않는다 — roster·검증 명령은 `harness.json`·DB에서.
- 언어 1차 한국어, 템플릿은 `templates/<lang>/`.
- **버전 고정**: `prisma@7.10.0 @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 mcp-handler@2.1.1 @modelcontextprotocol/server@2.0.0 zod@4.5.2 next-auth@5.0.0-beta.32 tsx@4.23.12 sonner@2.0.8 clsx@2.1.1 tailwind-merge@3.6.0`(T0.2 설치 목록과 일치).
- **용어는 `CONTEXT.md`(승인된 ubiquitous language)를 따른다.** 이 제안서는 그 문서가 생기기 전에 쓰여 어휘가 조금 다르다 — **산문과 사용자 화면 문구는 `CONTEXT.md` 낱말로**, **식별자는 계약 호환을 위해 지금 이름 그대로** 둔다:

| `CONTEXT.md`의 정식 낱말 | 이 문서가 쓰던 말 | 처리 |
| --- | --- | --- |
| **보드 항목**(Board Item) | "보드 행" | 산문·화면은 **보드 항목**으로 말한다. `BoardItem` 모델명은 이미 일치 |
| **증거**(Evidence) — 항목을 만들거나 상태를 주장할 때의 관측·진단 | `근거` 필드 | **필드명·`reason` 컬럼·`board_propose({reason})` 도구 인자는 바꾸지 않는다**(스펙 §5 계약·ApcH 임포트·템플릿이 물려 있다). 대신 화면 라벨·도움말이 「증거」의 정의대로 설명한다 |
| **인수**(Acceptance) | 인수 | 일치. `구현승인`은 **게이트 status**이지 인수가 아니다 — `CONTEXT.md`가 둘을 섞지 말라고 못박는다(`_Avoid_: 구현승인`) |
| 백로그 항목 · 워크스페이스 · 게이트 · 에이전트 · 검증 · 결과 | 동일 | 일치 |

  특히 **사용자에게 보이는 문구**(T1.11 백로그 폼 도움말, T1.12 결재함 도움말, 토큰 페이지 안내)는 이 표의 정식 낱말을 쓴다.

### 태스크 목록 (의존 순)

| 태스크 | 산출 | 스펙 대응 | 선행 |
| --- | --- | --- | --- |
| T0.1 저장소 레이아웃·러너 | `src/app`, tsconfig paths, 루트 스크립트, `plugin/.claude-plugin`, `scripts/sync-plugin-lib.mjs`, `examples/apch/harness.json` | 0.1 | — |
| T0.2 의존성·Prisma 7·환경 | 패키지 설치, `prisma.config.ts`, `src/server/db.ts`, `.env.example` | 0.2 | T0.1 |
| T0.3 문서 골격 | `docs/architecture/{sources,invariants,protocol,rationale}.md` | 0.3 | T0.1 |
| T1.1 `transitions.mjs` | 상태 기계(7 tests) | 1.1 | T0.1 |
| T1.2 `backlog-md.mjs` | 백로그 파서(2) | 1.2 | T0.1 |
| T1.3 `board-md.mjs` | 보드 파서(ApcH 9) | 1.3 | T0.1 |
| T1.4 `config`·`render`·`manifest`·`vars` | 24 tests | 1.4 | T0.1 |
| T1.5 `token.mjs` | 토큰(2) | 1.5 | T0.1 |
| T1.6 Prisma 스키마·마이그레이션 | `prisma/schema.prisma`, `prisma/migrations/*` | 1.6 | T0.2 |
| T1.7 전이 서비스 | `board-rules.ts`(12 tests) + `board.ts` | 1.7 | T1.1, T1.6 |
| T1.8 인증(GitHub OAuth) | `src/server/auth/*`, `src/proxy.ts`, `/login`(2 tests) | 1.9 일부 | T1.6 |
| T1.9 MCP 서버 | `src/server/mcp/*`, `src/app/api/mcp/route.ts`(4 tests + 실측) | 1.8 | T1.5, T1.7 |
| T1.10 웹 — 프로젝트 등록·토큰 | `/`, `/p/new`, `/p/[slug]/tokens` | 1.9 | T1.8 |
| T1.11 웹 — 백로그 | `/p/[slug]/backlog` | 1.9 | T1.10 |
| T1.12 웹 — 결재함(게이트) | `/p/[slug]/inbox` + 게이트 액션 | 1.9 Step 1 | T1.7, T1.10 |
| T1.13 웹 — 보드 모델 이식 | `journey`·`briefing`·`sprites`·`known-agents` + 어댑터(ApcH 테스트) | 1.9 Step 2 | T1.1, T1.3, **T1.12의 `gate.ts`** |
| T1.14 웹 — 보드 화면·항목 상세 | `/p/[slug]`, `/p/[slug]/items/[key]` | 1.9 | T1.12, T1.13 |
| T1.15 플러그인 — 템플릿 | `plugin/templates/ko/**` + 스냅샷 테스트 | 1.10 템플릿 | T1.4 |
| T1.16 플러그인 — 생성기·스킬 | `harness-init.mjs`(6), `SKILL.md`, `check-plugin-lib` | 1.10 | T1.15 |
| T1.17 빈 저장소 실측 | Phase 1 완료 기준 | 1.11 | 전부 |

병렬 가능: T0.3·T1.1~T1.5·T1.6은 T0.2 뒤 동시 진행. T1.15는 T1.4만 있으면 된다. **T1.13은 T1.8~T1.11과는 독립이지만 T1.12와는 아니다** — 이식하는 `briefing.ts`가 `isGateSource`를 쓰고 그건 T1.12가 만드는 **`features/review-gate/model/gate-source.ts`**(C14 정렬 후 이름)에 있다(ApcH `briefing.ts:267,270`의 `isGateTransitionSource` 대체). T1.13에 필요한 건 **그 파일 + slice의 `index.ts` 뿐**이므로, 병렬을 유지하려면 T1.12의 나머지보다 먼저 그 둘만 떼어 만들면 된다.

---

## Phase 0 — 부트스트랩

### T0.1: 저장소 레이아웃·러너

**Files:**
- Move: `app/` → `src/app/` (`layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`)
- Modify: `tsconfig.json`(paths), `package.json`(scripts — **병합**, Step 4), `.gitignore` — **`README.md`는 건드리지 않는다**(Step 8 주석)
- Create: `plugin/.claude-plugin/plugin.json`, `scripts/sync-plugin-lib.mjs`, `examples/apch/harness.json`, `packages/core/.gitkeep`, `plugin/lib/.gitkeep`

**Interfaces (Produces):** 경로 별칭 `@/*` → `src/*`, `@harness/core/*` → `packages/core/*`. 루트 스크립트 `test`·`test:web`·`check`·`sync:plugin-lib`.

> **셸 표기:** 이 문서의 `bash` 블록은 Bash 도구에서, `powershell` 블록은 PowerShell에서 실행한다. `npm`·`npx`·`git` 한 줄 명령은 양쪽에서 동일하게 동작한다.

- [ ] **Step 1: 브랜치** — `git switch -c harness/phase-0-1` (D-E)
- [ ] **Step 2: `app/` 이동** — PowerShell: `New-Item -ItemType Directory src; git mv app src/app` (Bash라면 `mkdir src && git mv app src/app`). `src/app` 외 다른 `app/` 잔재가 없어야 한다(있으면 Next가 `src/app`을 무시한다 — `src-folder.md`).
- [ ] **Step 3: `tsconfig.json` paths**

```json
"paths": {
  "@/*": ["./src/*"],
  "@harness/core/*": ["./packages/core/*"]
}
```

- [ ] **Step 4: `package.json` scripts** (T0.2·T1.16에서 두 줄 더 붙는다)

> **통째로 갈아끼우지 말고 병합한다.** 이 제안서 작성 이후 저장소에 아키텍처 검사가 들어왔다(C14) — 지금 `package.json`에는 `verify:fsd`·`test:architecture`가 있고 `lint`가 ESLint **뒤에 경계 검사**를 붙여 돌린다. **아래 블록은 그 셋을 값까지 그대로 보존한 상태**이니 그대로 쓰면 되고, 이 제안서 초기 버전처럼 `lint: "eslint"`만 있는 최소 블록으로 갈아끼우면 셋이 사라진다.

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint && node scripts/verify-fsd-boundaries.mjs",
  "verify:fsd": "node scripts/verify-fsd-boundaries.mjs",
  "test:architecture": "node --test scripts/verify-fsd-boundaries.test.mjs",
  "check": "npm run lint && tsc --noEmit && npm run test:architecture",
  "test": "node --test \"packages/core/*.test.mjs\"",
  "sync:plugin-lib": "node scripts/sync-plugin-lib.mjs"
}
```

`check`가 `npm run lint`(= ESLint + FSD 경계)와 `test:architecture`를 포함하는 이유는 `AGENTS.md`가 "코드 변경을 마치기 전에 `verify:fsd`·`test:architecture`·관련 lint/type/test/build를 돌린다"고 요구하기 때문이다. 이 문서가 여기저기서 말하는 `npm run check`는 **이제 아키텍처 게이트를 포함한다.**

- [ ] **Step 5: `plugin/.claude-plugin/plugin.json`** — 스펙 Task 0.1 Step 3 JSON 그대로(name `harness`, D-A).
- [ ] **Step 6: `scripts/sync-plugin-lib.mjs`** — 스펙 Task 0.1 Step 4 코드 그대로(4줄).
- [ ] **Step 7: `examples/apch/harness.json`** — 스펙 §6 JSON 그대로. T1.4 테스트가 `../../examples/apch/harness.json`으로 읽는다.
- [ ] **Step 8: `.gitignore`·빈 디렉터리** — `.gitignore`에 `nul`·`src/generated/`(Prisma 생성물, T0.2) 추가. `packages/core/.gitkeep`·`plugin/lib/.gitkeep`을 만든다 — 둘 다 이 커밋 시점엔 빈 디렉터리라 git이 추적하지 않는다.

> **`README.md`는 다시 쓰지 않는다 — 이미 쓰여 있다.** 이 제안서는 원래 "create-next-app 기본 문구를 지우고 제목 한 줄로 바꾼다"고 지시했는데, 그 사이 루트 `README.md`가 제품 설명 + 문서 목차(아키텍처·FSD·시스템 개요·`CONTEXT.md`·이 제안서) + 로컬 확인 명령(`dev`·`lint`·`verify:fsd`·`test:architecture`·`build`)을 갖춘 문서로 다시 쓰였다. 옛 지시를 따르면 **그걸 두 줄로 덮어써 문서 목차와 검증 명령이 사라진다**(T0.1 Step 4의 scripts 블록과 같은 사고). 손대야 할 때는 **추가만** 한다 — 예를 들어 T1.17 뒤에 설치 절을 덧붙이는 정도.
- [ ] **Step 9: 확인** — `npm run check` 통과, `npm run dev` 후 `http://localhost:3000` 200. (`check`가 이제 `verify:fsd`를 포함하지만 **이 시점에 `src/fsd`가 없어도 통과한다** — 검사기는 부분 구조를 허용한다. 실측: `src/app`만 있는 상태·`src/server`만 추가된 상태·`features`만 있고 `pages`가 없는 상태 전부 PASS.)
- [ ] **Step 10: 커밋** — `docs/`는 `8289320 init`에 이미 들어갔으므로 이 커밋은 코드만 담는다.

```bash
git add -A
git commit -m "chore: src layout, core/plugin skeleton, root scripts"
```

### T0.2: 의존성·Prisma 7·환경

**Files:**
- Create: `prisma.config.ts`, `prisma/schema.prisma`(생성기·datasource만), `src/server/db.ts`, `.env.example`
- Modify: `package.json`(deps, scripts), `eslint.config.mjs`(생성물 무시 — Step 6)

**Interfaces (Produces):** `import { prisma } from "@/server/db"` (PrismaClient 싱글턴, `@/generated/prisma/client`에서 생성). 스크립트 `db:generate`·`db:migrate`·`test:web`.

- [ ] **Step 1: 설치** (버전 고정 — `prisma`는 latest가 8 RC)

```bash
npm i @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 mcp-handler@2.1.1 @modelcontextprotocol/server@2.0.0 zod@4.5.2 next-auth@5.0.0-beta.32 server-only clsx@2.1.1 tailwind-merge@3.6.0 sonner@2.0.8
npm i -D prisma@7.10.0 tsx@4.23.12 dotenv
```

- [ ] **Step 2: `prisma.config.ts`** (루트)

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

- [ ] **Step 3: `prisma/schema.prisma`** (모델은 T1.6에서)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

- [ ] **Step 4: `src/server/db.ts`**

```ts
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: `.env.example`** (`.env*`는 gitignore. 사용자가 `.env`로 복사)

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
AUTH_SECRET=""
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""
HARNESS_PUBLIC_URL="http://localhost:3000"
```

- [ ] **Step 6: scripts 추가 + eslint 무시 목록**

```json
"build": "prisma generate && next build",
"test:web": "node --import tsx --test \"src/**/*.test.mjs\"",
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev"
```

`npm run check`의 `eslint`는 **인자가 없으면 `.`(저장소 전체)를 린트한다**(실측: `eslint --debug` → `Using file patterns: .`). Prisma 생성물과 `plugin/lib`(= `packages/core`의 바이트 복사본, T1.16)이 그대로 걸려 소음·중복 오류가 되므로 `eslint.config.mjs`의 `globalIgnores`에 두 줄을 추가한다.

```js
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 생성물 — 손으로 고치지 않는다
    "src/generated/**",   // prisma generate 산출물
    "plugin/lib/**",      // packages/core 복사본(원본만 린트한다)
  ]),
```

- [ ] **Step 7: 확인** — `.env`에 Neon `DATABASE_URL` 설정 → `npm run db:generate`가 `src/generated/prisma/`(`client.ts` 포함)를 만든다 → `npm run check` 통과(`src/server/db.ts` 타입 해석 포함). **실측(2026-08-29):** `prisma generate`는 **DB에 접속하지 않는다** — `DATABASE_URL`이 형식만 맞으면 서버가 없어도 성공한다(스크래치패드에서 Prisma 7.10.0으로 확인).
- [ ] **Step 8: 커밋** `chore: prisma 7 (adapter-pg), mcp-handler 2, auth.js v5, tsx`

### T0.3: 문서 골격 `docs/architecture/`

**Files:** Create `docs/architecture/sources.md`, `invariants.md`, `protocol.md`, `rationale.md`. Modify `docs/architecture/README.md`(문서 지도에 네 문서 연결).

> **`docs/architecture/`는 이제 비어 있지 않다.** `README.md`·`fsd.md`·`system-overview.md`·`verification.md`가 이미 있고 저장소 구조의 source of truth다(C14). `.gitkeep`은 이미 삭제됐다 — **기존 네 문서를 건드리지 말고** 새 네 문서만 더한다. `README.md`는 "Phase 0·1에서 추가할 `sources.md`·`invariants.md`·`protocol.md`·`rationale.md`는 활성 제안서가 소유한다. 그 문서가 생기면 이 인덱스에 연결한다"고 적어 두었으니, **문서 지도 절에 네 줄을 추가하는 것까지가 이 태스크다.**

- [ ] **Step 1: `sources.md`** — 스펙 §8 표 전체 + 머리말 `원천: Sangeok/ApcH @ de25a1c (2026-08-29)`. 경로 열은 ApcH 저장소 상대경로 그대로.
- [ ] **Step 2: `invariants.md`** — ApcH `docs/proposals/active/remote-agent-pipeline-generalization.md`의 「불변식」 절 전문을 인용(출처 줄 명기) + 스펙 §3.2 표(ApcH 구현 → v2 구현) + 보드 규칙 셋(증거 없는 상태 주장 금지 · 재독 ≠ 회상 · 정지 규칙) + pm 상한 서버 강제.
- [ ] **Step 3: `protocol.md`** — 스펙 §5 도구 표(Phase 열 추가: 1 / 3) + 「등록되지 않은 것(웹 전용)」 + 상태 기계 표(T1.1 `RULES`를 표로: from·to·actor·kind·전제) + **계획서 절 7개**(ApcH `docs/plans/template.md` 실측: 현재 동작 · 문제 · 고칠 파일 · 구현 스케치 · 테스트 · 범위 밖 의존 · 대안. `# <항목ID>: <제목>`은 문서 제목이지 절이 아니다).

  **여기가 ApcH `PROJECT_BOARD.md` 안내 블록의 새 집이다**(스펙 §8: "안내 블록 → `docs/protocol.md` + 웹 도움말"). 그 블록에만 있고 다른 어디에도 안 옮겨지는 것들을 반드시 함께 옮긴다 — 안 옮기면 T1.17 Step 4가 참조하는 「인수 다섯 조건」이 이 저장소 어디에도 없게 된다:

  - **인수 다섯 조건**(ApcH `PROJECT_BOARD.md:22-23`) — `완료`를 받아들이기 전 메인 루프가 **직접 재현**한다(에이전트 보고를 믿지 않는다): ① 변경 파일 목록 ↔ 계획서 「고칠 파일」 ② diff ↔ 「구현 스케치」 ③ 검증 명령 직접 재실행 ④ 백로그 제거 확인(v2에선 서버가 `removedAt`을 채우므로 웹·`backlog_list`로 확인) ⑤ `결과`가 가리키는 상세 기록(`docs/agents/<행위자>/<ID>.md`)의 실재 확인.
  - **`검증:` 줄 형식** — `검증: 클린 패스 (YYYY-MM-DD, 무편집 N라운드)`. 결재함이 **이 줄의 존재만으로** 판정하므로(있으면 통과 칩, 없으면 「검증 전」) 클린 패스가 아닌데 쓰면 거짓 통과가 된다. v2에선 `validation_record`가 `검토대기`에서만 받고, 되돌리기 시 서버가 지운다(T1.7).
  - **`근거`·`결과` 각 150자, `근거`는 행을 만든 주체가 쓰고 이후 바꾸지 않는다**, 상세는 `docs/agents/<행위자>/<ID>.md`로.
  - **`보류` 재개 규칙** — 계획부터 다시면 `계획지시`, 기존 계획으로 이어가면 `구현승인`.
  - **백로그 작성 규칙**(ApcH `TASK_BACKLOG.md` 머리말) — `source`의 **관측/진단(코드 확정) 분리**. 스펙 §8은 이 머리말을 `docs/protocol.md`와 **웹 폼 도움말 양쪽**에 두라고 한다 — 폼 쪽은 T1.11 Step 2가 맡는다.
- [ ] **Step 4: `rationale.md`** — 제목과 절 머리만: 「v1 → v2」(스펙 요약표), 「골든 diff」(T1.15가 채움), 「첫 스모크」(T1.17이 채움).
- [ ] **Step 5: 커밋** `docs(architecture): sources, invariants, protocol, rationale skeleton`

---

## Phase 1 — 핵심

### T1.1: `packages/core/transitions.mjs` — 상태 기계

**Files:** Create `packages/core/transitions.mjs`, `packages/core/transitions.test.mjs`

**Interfaces (Produces):** `STATUSES`, `TEXT_LIMIT`, `findRule(actor, from, to) → rule | null`, `canDiscard(status)`, `isOpen(status)`, `canPropose(openCount)`, `canRecordValidation(status)`, `checkText(field, text) → string | null`. rule = `{from, to, actor: "human"|"agent", kind, requiresResult?, requiresPlan?, requiresReport?, clearsValidation?}`.

- [ ] **Step 1: 테스트** — 스펙 Task 1.1 Step 1 코드 그대로.
- [ ] **Step 2: 실패 확인** — `node --test packages/core/transitions.test.mjs` → FAIL(module not found)
- [ ] **Step 3: 구현** — 스펙 Task 1.1 Step 3 코드 그대로.
- [ ] **Step 4: 통과** — 같은 명령 → `# pass 7`
- [ ] **Step 5: 커밋** `feat(core): board state machine with actor-scoped transitions`

### T1.2: `packages/core/backlog-md.mjs` — ApcH 백로그 파서(임포트 전용)

**Files:** Create `packages/core/backlog-md.mjs`, `packages/core/backlog-md.test.mjs`

**Interfaces (Produces):** `parseBacklog(markdown) → {key, title, area, source}[]`

- [ ] **Step 1: 테스트** — 스펙 Task 1.2 Step 1 그대로. **Step 2:** FAIL 확인. **Step 3:** 스펙 Step 3 구현 그대로. **Step 4:** `node --test packages/core/backlog-md.test.mjs` → `# pass 2`.
- [ ] **Step 5: 커밋** `feat(core): ApcH backlog markdown parser (import only)`

### T1.3: `packages/core/board-md.mjs` — ApcH 보드 파서(임포트 전용)

**Files:** Create `packages/core/board-md.mjs`, `packages/core/board-md.test.mjs`

**Interfaces (Produces):** `parseBoard(markdown) → BoardSection[]`(`{heading, items[]}`, item = `{checked,id,title,agent,area,status,reason,result,validation}`), `latestItemById(sections, id)`.

- [ ] **Step 1: 테스트 복사** — `C:/Users/hamso/OneDrive/Desktop/git/ApcH/apps/admin/src/fsd/entities/pipeline/model/board.test.mjs` → `packages/core/board-md.test.mjs`. 4번째 줄 `from "./board.ts"` → `from "./board-md.mjs"`. 그 외 무변경.
- [ ] **Step 2: 실패 확인** → FAIL. **Step 3: 구현** — 스펙 Task 1.3 코드 그대로. **Step 4:** `node --test packages/core/board-md.test.mjs` → `# pass 9`.
- [ ] **Step 5: 커밋** `feat(core): ApcH board markdown parser (import only)`

### T1.4: `config.mjs`·`render.mjs`·`manifest.mjs`·`vars.mjs` — v1 검증본 이관

v1에서 검증된 네 모듈(오늘 재실행 23/23 — 단 `manifest.mjs`는 아래 「줄바꿈 정규화」 한 곳을 고치고 케이스를 하나 더해 **24개**가 된다). 스펙은 "v1 백업에서 복사"라고만 적었는데 그 백업은 임시 디렉터리에 있으므로 여기 전문을 싣는다. `config.test.mjs` 첫 케이스의 executor 단언은 v2 예시(`local`)에 맞춘 상태다.

**Files:** Create `packages/core/{config,render,manifest,vars}.mjs` + 각 `.test.mjs`

**Interfaces (Produces):**
- `parseHarnessConfig(jsonOrObject) → {version, project:{owner,repo,branch,name}, language, workspaces[]:{id,path,agent,verify[],knowledge|null,readOnly[]}, executor:{kind,commandIssue|null}, release|null, scout|null}` — 실패 `Error("harness.json <필드경로>: <사유>")`
- `renderTemplate(text, vars)` — `{{a.b}}` 치환, 미정의 throw
- `hashOf(text)`, `planWrites({targets, existing, lock, adopt}) → {write[], skipModified[], refuse[]}`, `buildLock(targets) → {version:1, files:{[path]:{template,hash}}}`
- `buildVars(config)` → `project, board_branch, roster_table, roster_names, scout, release`; `buildWorkspaceVars(config, ws)` → 위 + `ws.{agent,path,knowledge,verify_block,verify_result_line,read_only_list,out_of_scope_list}`

- [ ] **Step 1: `config.mjs`**

```js
// 순수. harness.json → 정규화된 설정. 실패는 필드 경로가 붙은 Error 하나로.
const AGENT_ID_RE = /^[a-z][a-z0-9-]*$/;
const EXECUTORS = new Set(["local", "routine"]);
const RELEASE_AUTH = new Set(["none", "verifier"]);

function fail(path, msg) { throw new Error(`harness.json ${path}: ${msg}`); }
function str(v, path) { if (typeof v !== "string" || v === "") fail(path, "비어 있지 않은 문자열이어야 한다"); return v; }

export function parseHarnessConfig(input) {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  if (raw === null || typeof raw !== "object") fail("", "객체여야 한다");
  if (raw.version !== 1) fail("version", "1만 지원한다");
  if (raw.project === undefined) fail("project", "필수");
  const p = raw.project;
  const project = {
    owner: str(p.owner, "project.owner"), repo: str(p.repo, "project.repo"), branch: str(p.branch, "project.branch"),
    name: p.name === undefined ? p.repo : str(p.name, "project.name"),
  };
  const language = raw.language === undefined ? "ko" : str(raw.language, "language");
  if (!Array.isArray(raw.workspaces) || raw.workspaces.length === 0) fail("workspaces", "하나 이상이어야 한다");
  const seen = new Set();
  const workspaces = raw.workspaces.map((w, i) => {
    const at = `workspaces[${i}]`;
    const agent = str(w.agent, `${at}.agent`);
    if (!AGENT_ID_RE.test(agent)) fail(`${at}.agent`, "소문자로 시작, 소문자·숫자·하이픈만");
    if (seen.has(agent)) fail(`${at}.agent`, `중복: ${agent}`);
    seen.add(agent);
    if (!Array.isArray(w.verify) || w.verify.length === 0) fail(`${at}.verify`, "검증 명령 하나 이상");
    return {
      id: str(w.id, `${at}.id`), path: str(w.path, `${at}.path`), agent,
      verify: w.verify.map((c, j) => str(c, `${at}.verify[${j}]`)),
      knowledge: w.knowledge === undefined ? null : str(w.knowledge, `${at}.knowledge`),
      readOnly: Array.isArray(w.readOnly) ? w.readOnly.map((r, j) => str(r, `${at}.readOnly[${j}]`)) : [],
    };
  });
  const e = raw.executor === undefined ? { kind: "local" } : raw.executor;
  if (!EXECUTORS.has(e.kind)) fail("executor.kind", "local | routine");
  if (e.kind === "routine" && !Number.isInteger(e.commandIssue)) fail("executor.commandIssue", "routine이면 명령 이슈 번호(정수) 필수");
  const executor = { kind: e.kind, commandIssue: e.kind === "routine" ? e.commandIssue : null };
  let release = null;
  if (raw.release !== undefined) {
    const auth = raw.release.auth === undefined ? "none" : raw.release.auth;
    if (!RELEASE_AUTH.has(auth)) fail("release.auth", "none | verifier");
    release = { baseUrl: str(raw.release.baseUrl, "release.baseUrl").replace(/\/$/, ""), auth };
  }
  const scout = raw.scout === undefined ? null : { question: str(raw.scout.question, "scout.question") };
  return { version: 1, project, language, workspaces, executor, release, scout };
}
```

- [ ] **Step 2: `config.test.mjs`**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseHarnessConfig } from "./config.mjs";

const APCH = readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8");

describe("parseHarnessConfig", () => {
  it("accepts the ApcH example and normalizes defaults", () => {
    const c = parseHarnessConfig(APCH);
    assert.equal(c.project.name, "ApcH");
    assert.equal(c.workspaces.length, 3);
    assert.deepEqual(c.workspaces.map((w) => w.agent), ["web-dev", "admin-dev", "backend-dev"]);
    assert.equal(c.executor.kind, "local");
    assert.equal(c.executor.commandIssue, null);
    assert.equal(c.release.baseUrl, "https://admin.a-pch.com");
    assert.equal(c.release.auth, "verifier");
  });
  it("defaults: language ko, executor local, release null, scout null, name=repo", () => {
    const c = parseHarnessConfig({ version: 1, project: { owner: "o", repo: "r", branch: "main" },
      workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] });
    assert.equal(c.language, "ko");
    assert.equal(c.executor.kind, "local");
    assert.equal(c.executor.commandIssue, null);
    assert.equal(c.release, null);
    assert.equal(c.scout, null);
    assert.equal(c.project.name, "r");
  });
  const base = () => ({ version: 1, project: { owner: "o", repo: "r", branch: "main" },
    workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] });
  it("rejects wrong version", () => assert.throws(() => parseHarnessConfig({ ...base(), version: 2 }), /version/));
  it("rejects empty workspaces", () => assert.throws(() => parseHarnessConfig({ ...base(), workspaces: [] }), /workspaces/));
  it("rejects bad agent id", () => { const b = base(); b.workspaces[0].agent = "Web Dev"; assert.throws(() => parseHarnessConfig(b), /agent/); });
  it("rejects duplicate agent", () => { const b = base(); b.workspaces.push({ ...b.workspaces[0], id: "x" }); assert.throws(() => parseHarnessConfig(b), /중복/); });
  it("rejects empty verify", () => { const b = base(); b.workspaces[0].verify = []; assert.throws(() => parseHarnessConfig(b), /verify/); });
  it("routine executor requires commandIssue", () => assert.throws(() => parseHarnessConfig({ ...base(), executor: { kind: "routine" } }), /commandIssue/));
  it("rejects unknown executor kind", () => assert.throws(() => parseHarnessConfig({ ...base(), executor: { kind: "hosted" } }), /executor.kind/));
  it("release: strips trailing slash, auth default none", () => {
    const c = parseHarnessConfig({ ...base(), release: { baseUrl: "https://x.example/" } });
    assert.equal(c.release.baseUrl, "https://x.example"); assert.equal(c.release.auth, "none");
  });
  it("rejects unknown release.auth", () => assert.throws(() => parseHarnessConfig({ ...base(), release: { baseUrl: "https://x", auth: "oauth" } }), /release.auth/));
});
```

- [ ] **Step 3: `render.mjs` + `render.test.mjs`**

```js
// 순수. {{path.to.var}} 치환만 한다. 조건·반복은 없다 — 목록은 vars.mjs가 미리 문자열로 만든다(YAGNI).
export function renderTemplate(text, vars) {
  return text.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_, key) => {
    const v = key.split(".").reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), vars);
    if (v === undefined) throw new Error(`template var missing: ${key}`);
    return String(v);
  });
}
```

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderTemplate } from "./render.mjs";

describe("renderTemplate", () => {
  it("substitutes nested paths and repeats", () =>
    assert.equal(renderTemplate("{{ws.agent}} of {{project.name}} / {{ws.agent}}", { ws: { agent: "web-dev" }, project: { name: "ApcH" } }), "web-dev of ApcH / web-dev"));
  it("tolerates spaces inside braces", () => assert.equal(renderTemplate("{{ a }}", { a: 1 }), "1"));
  it("throws on missing var with its name", () => assert.throws(() => renderTemplate("{{nope}}", {}), /nope/));
  it("leaves non-template braces alone", () => assert.equal(renderTemplate("{ not } {{a}}", { a: "x" }), "{ not } x"));
});
```

- [ ] **Step 4: `manifest.mjs` + `manifest.test.mjs`**

> **v1에서 한 곳 고친다 — 줄바꿈 정규화.** `hashOf`는 생성 시점(항상 LF)과 **디스크에서 다시 읽은 내용**을 같은 잣대로 비교해야 한다. Windows에서 `core.autocrlf=true`면(이 저장소 실측값) 커밋된 LF 파일이 **체크아웃될 때 CRLF가 된다** — 실제로 ApcH에서 `PROJECT_BOARD.md`는 `w/crlf`, `.claude/agents/pm.md`는 `w/lf`로 갈려 있다(`git ls-files --eol` 실측). 정규화 없이 두면 새로 clone한 머신에서 `hashOf(디스크 CRLF) ≠ lock의 LF 해시`가 되어, **사용자가 손도 안 댄 생성 파일이 전부 `skip(modified)`로 분류되고 재생성·업그레이드가 조용히 무력화된다.** 그래서 해시 전에 CRLF→LF로 접는다.

```js
import { createHash } from "node:crypto";

// CRLF→LF 정규화 후 해시한다 — 생성물은 LF로 쓰지만 Windows 체크아웃은 CRLF로 돌려주므로,
// 정규화하지 않으면 손대지 않은 파일이 "사용자가 고쳤다"로 오분류된다(위 주석).
export function hashOf(text) { return createHash("sha256").update(String(text).replace(/\r\n/g, "\n")).digest("hex").slice(0, 16); }

export function planWrites({ targets, existing, lock, adopt }) {
  const out = { write: [], skipModified: [], refuse: [] };
  for (const path of Object.keys(targets)) {
    const cur = existing[path] ?? null;
    if (cur === null) { out.write.push(path); continue; }
    const locked = lock?.files?.[path];
    if (locked !== undefined) { (hashOf(cur) === locked.hash ? out.write : out.skipModified).push(path); continue; }
    (adopt ? out.write : out.refuse).push(path);
  }
  return out;
}

export function buildLock(targets) {
  const files = {};
  for (const [path, t] of Object.entries(targets)) files[path] = { template: t.template, hash: hashOf(t.content) };
  return { version: 1, files };
}
```

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashOf, planWrites } from "./manifest.mjs";

const t = { "a.md": { template: "x/a.md", content: "A2" } };
describe("planWrites", () => {
  it("writes when file is absent", () =>
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": null }, lock: null, adopt: false }).write, ["a.md"]));
  it("writes when locked hash matches current file", () => {
    const lock = { version: 1, files: { "a.md": { template: "x/a.md", hash: hashOf("A1") } } };
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "A1" }, lock, adopt: false }).write, ["a.md"]);
  });
  it("skips when user modified a generated file", () => {
    const lock = { version: 1, files: { "a.md": { template: "x/a.md", hash: hashOf("A1") } } };
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "A1 edited" }, lock, adopt: false }).skipModified, ["a.md"]);
  });
  it("refuses unknown existing file unless adopt", () => {
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "theirs" }, lock: null, adopt: false }).refuse, ["a.md"]);
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "theirs" }, lock: null, adopt: true }).write, ["a.md"]);
  });
  it("hash is stable and short", () => { assert.equal(hashOf("x"), hashOf("x")); assert.equal(hashOf("x").length, 16); });
  it("normalizes CRLF so a Windows checkout is not mistaken for a user edit", () => {
    assert.equal(hashOf("a\r\nb\r\n"), hashOf("a\nb\n"));
    const lock = { version: 1, files: { "a.md": { template: "x/a.md", hash: hashOf("A1\n") } } };
    // 디스크에서 CRLF로 돌아온 같은 내용 → skipModified가 아니라 write여야 한다
    assert.deepEqual(planWrites({ targets: t, existing: { "a.md": "A1\r\n" }, lock, adopt: false }).write, ["a.md"]);
  });
});
```

- [ ] **Step 5: `vars.mjs` + `vars.test.mjs`**

````js
// 순수. config → 템플릿이 그대로 붙여 넣을 문자열들. 목록은 여기서 문자열로 만든다(render.mjs에 반복문이 없는 이유).
const bullets = (xs) => (xs.length === 0 ? "없음" : xs.map((x) => `- \`${x}\``).join("\n"));

export function buildVars(config) {
  const rows = config.workspaces.map((w) => `| \`${w.agent}\` | \`${w.path}/**\` |`).join("\n");
  return {
    project: config.project,
    board_branch: config.project.branch,
    roster_table: `| agent 값 | 담당 영역 |\n| --- | --- |\n${rows}`,
    roster_names: config.workspaces.map((w) => `\`${w.agent}\``).join("·"),
    scout: config.scout ?? { question: "" },
    release: config.release ?? { baseUrl: "", auth: "none" },
  };
}

export function buildWorkspaceVars(config, ws) {
  const others = config.workspaces.filter((w) => w.agent !== ws.agent).map((w) => `${w.path}/**`);
  return {
    ...buildVars(config),
    ws: {
      agent: ws.agent, path: ws.path,
      knowledge: ws.knowledge ?? "(없음 — 워크스페이스 지식 문서가 아직 없다. 계획서에 그 사실을 적는다)",
      verify_block: "```bash\n" + ws.verify.join("\n") + "\n```",
      verify_result_line: "검증: " + ws.verify.map((c) => `${c} <결과>`).join(" / "),
      read_only_list: bullets(ws.readOnly),
      out_of_scope_list: bullets(others),
    },
  };
}
````

````js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseHarnessConfig } from "./config.mjs";
import { buildVars, buildWorkspaceVars } from "./vars.mjs";

const cfg = parseHarnessConfig(readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8"));

describe("vars", () => {
  it("roster table has one row per workspace in order", () => {
    const v = buildVars(cfg);
    assert.match(v.roster_table, /^\| agent 값 \| 담당 영역 \|\n\| --- \| --- \|\n/);
    assert.match(v.roster_table, /\| `web-dev` \| `apps\/web\/\*\*` \|\n\| `admin-dev` \| `apps\/admin\/\*\*` \|\n\| `backend-dev` \| `apps\/backend\/\*\*` \|$/);
    assert.equal(v.roster_names, "`web-dev`·`admin-dev`·`backend-dev`");
    assert.equal(v.board_branch, "dev");
  });
  it("workspace vars: verify block, result line, read-only and out-of-scope lists", () => {
    const v = buildWorkspaceVars(cfg, cfg.workspaces[2]);
    assert.equal(v.ws.agent, "backend-dev");
    assert.equal(v.ws.verify_block, "```bash\npython -m unittest discover -s apps/backend -p \"test_*.py\"\npython -m py_compile apps/backend/main.py\n```");
    assert.equal(v.ws.verify_result_line, "검증: python -m unittest discover -s apps/backend -p \"test_*.py\" <결과> / python -m py_compile apps/backend/main.py <결과>");
    assert.equal(v.ws.read_only_list, "- `apps/backend/asd/**`\n- `apps/backend/requirements.txt`");
    assert.equal(v.ws.out_of_scope_list, "- `apps/web/**`\n- `apps/admin/**`");
    assert.equal(v.ws.knowledge, "apps/backend/CLAUDE.md");
  });
  it("empty lists render as '없음'", () => {
    const one = parseHarnessConfig({ version: 1, project: { owner: "o", repo: "r", branch: "main" },
      workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] });
    const v = buildWorkspaceVars(one, one.workspaces[0]);
    assert.equal(v.ws.read_only_list, "없음"); assert.equal(v.ws.out_of_scope_list, "없음");
    assert.equal(v.ws.knowledge, "(없음 — 워크스페이스 지식 문서가 아직 없다. 계획서에 그 사실을 적는다)");
  });
});
````

- [ ] **Step 6: 통과** — `npm test` → 누적 `# pass 42` (7+2+9+11+4+**6**+3).
- [ ] **Step 7: 커밋** `feat(core): config, render, manifest, vars (from v1, verified)`

### T1.5: `packages/core/token.mjs` — 프로젝트 토큰

**Files:** Create `packages/core/token.mjs`, `packages/core/token.test.mjs`

**Interfaces (Produces):** `newToken() → {plain: "hs_"+43자 base64url, hash: sha256 hex}`, `hashToken(plain)`, `parseBearer(header) → plain | null`

- [ ] **Step 1: 테스트** — 스펙 Task 1.5 Step 1 그대로. **Step 2:** FAIL. **Step 3:** 스펙 Step 3 구현 그대로. **Step 4:** `npm test` → `# pass 44`.
- [ ] **Step 5: 커밋** `feat(core): project token generation and bearer parsing`

### T1.6: Prisma 스키마·마이그레이션

**Files:** Modify `prisma/schema.prisma`(모델 추가). Create `prisma/migrations/<ts>_init/`.

**Interfaces (Produces):** 스펙 Task 1.6 모델 전부(`User, Project, ProjectMember, ProjectToken, Workspace, BacklogItem, BoardItem, TransitionEvent, Report, Command`) + 아래 두 가지 차이.

- [ ] **Step 1: 모델** — 스펙 Task 1.6 Step 1의 `model …` 블록들을 T0.2의 `generator`·`datasource` 아래에 붙인다. **차이 두 곳:**
  1. `generator`·`datasource`는 T0.2 것을 유지(스펙의 `prisma-client-js`·`url = env(...)` 줄은 쓰지 않는다 — C3).
  2. `BoardItem`에 열 추가(C9):

```prisma
  discardedAt   DateTime?                 // 폐기(사람). 행은 남긴다 — 이벤트가 감사 로그(불변식 8)
```

  `@@index([projectId, status])`는 그대로. `Command`는 Phase 3에서 소비하지만 스키마에는 지금 넣는다(스펙대로).

- [ ] **Step 2: 마이그레이션** — `npx prisma migrate dev --name init` (Neon `DATABASE_URL`). 이어서 `npm run db:generate`(Prisma 7은 migrate가 generate를 자동 실행하지 않는다).
- [ ] **Step 3: 확인** — `npm run check` 통과. `npx prisma migrate status` → 미적용 0.
- [ ] **Step 4: 커밋** `feat(db): initial schema` (`prisma/migrations/**` 포함)

### T1.7: 전이 서비스 — `board-rules.ts`(순수) + `board.ts`(Prisma)

MCP 도구(T1.9)와 웹 액션(T1.12)이 **둘 다** 이 모듈을 부른다. 판정은 `board-rules.ts`(DB 없음, 테스트), 저장은 `board.ts`(트랜잭션·낙관적 잠금·이벤트).

**Files:**
- Create: `src/server/pipeline/board-rules.ts`, `src/server/pipeline/board-rules.test.mjs`, `src/server/pipeline/board.ts`

**Interfaces (Produces):**
- `board-rules.ts`: `type Actor = "human" | "agent"`, `type Decision<T> = {ok:true; value:T} | {ok:false; reason:string}`, `decidePropose(ProposeInput)`, `decideTransition(RowSnapshot, actor, to, result?) → Decision<{status, results, validation, completes}>`, `decideDiscard(status)`, `decideValidation(status, text)`, `decidePlanSubmit(status)`
- `board.ts`: `type BoardResult<T> = {ok:true; item:T} | {ok:false; reason:string}`; `latestBoard(projectId, openOnly?)`, `backlogWithStatus(projectId, includeRemoved)`, `getWithHistory(projectId, key)`, `propose(projectId, {key,agent,reason}, actorRef)`, `transition(projectId, {key,to,result?,expectedUpdatedAt?}, actor, actorRef)`, `discard(projectId, key, userId, expectedUpdatedAt?)`, `recordValidation(projectId, {key,text})`, `submitPlan(projectId, {key,path,commit})`, `submitReport(projectId, {key,actor,path,commit})`
- actorRef 규약: 에이전트 `token:<ProjectToken.id>`, 사람 `<User.id>`.

**상태 변경 안전성 — 이 표의 결정이 코드에 이미 반영되어 있다(구현 시 빼지 말 것):**

| 물음 | 결정 | 어디에 |
| --- | --- | --- |
| 같은 호출을 두 번 하면? | `transition`은 `from` status로 판정하므로 두 번째는 `not allowed: …`로 거부된다(멱등이 아니라 **거부**). `submitPlan`·`recordValidation`은 같은 값 덮어쓰기라 무해. `submitReport`는 **누적**이라 두 번 부르면 보고가 2건 — `완료` 전제(≥1건)는 만족하므로 해롭지 않다 | `board-rules.ts` `decideTransition` |
| 서로 다른 호출자가 같은 행에 동시에? | 트랜잭션 안에서 읽은 `row.updatedAt`으로 **항상 CAS**한다(웹은 화면이 읽은 값, 에이전트는 방금 읽은 값). 진 쪽은 `stale` | `transition`·`discard`의 `updateMany.where.updatedAt` |
| 서로 다른 호출자가 **공유 불변식**(미결 ≤ 2)에? | `propose`만 `isolationLevel: "Serializable"`. READ COMMITTED면 둘 다 `openCount=1`을 읽고 둘 다 만들어 상한이 뚫린다 — 스펙이 이 상한을 서버 강제로 규정하므로 격리 수준을 올린다. 직렬화 충돌(40001)은 도구 오류로 그대로 반환하고 에이전트가 다시 부른다 | `propose`의 `$transaction` 2번째 인자 |
| 중간에 실패하면? | 각 함수가 단일 `$transaction` — 행 갱신과 `TransitionEvent` 생성이 같이 커밋되거나 같이 롤백된다. 부분 상태가 없다 | 전 함수 |
| 되돌릴 수 없는 데이터 삭제가 있나? | 없다. `discard`는 `discardedAt` 표기, `완료`는 `removedAt` 표기 — 행도 이벤트도 지우지 않는다(불변식 8) | C9 |

- [ ] **Step 1: 테스트 `board-rules.test.mjs`**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideDiscard, decidePlanSubmit, decidePropose, decideTransition, decideValidation } from "./board-rules.ts";

const base = { backlogExists: true, hasOpenRow: false, openCount: 0, roster: ["web-dev", "admin-dev"], agent: "web-dev", reason: "근거" };
const row = (o = {}) => ({ status: "계획지시", planPath: null, reportCount: 0, results: [], validation: null, ...o });

describe("decidePropose", () => {
  it("rejects when 2 items are open", () => assert.match(decidePropose({ ...base, openCount: 2 }).reason, /max 2/));
  it("rejects agent outside roster", () => assert.match(decidePropose({ ...base, agent: "ops" }).reason, /roster/));
  it("rejects reason over 150 chars", () => assert.match(decidePropose({ ...base, reason: "x".repeat(151) }).reason, /150/));
  it("rejects an already-open key and a removed backlog item", () => {
    assert.equal(decidePropose({ ...base, hasOpenRow: true }).ok, false);
    assert.equal(decidePropose({ ...base, backlogExists: false }).ok, false);
  });
  it("accepts otherwise", () => assert.equal(decidePropose(base).ok, true));
});

describe("decideTransition", () => {
  it("agent cannot open gates", () => {
    assert.equal(decideTransition(row({ status: "승인대기" }), "agent", "계획지시", undefined).ok, false);
    assert.equal(decideTransition(row({ status: "검토대기" }), "agent", "구현승인", undefined).ok, false);
  });
  it("검토대기 needs plan_submit first", () => {
    assert.match(decideTransition(row(), "agent", "검토대기", undefined).reason, /plan_submit/);
    assert.equal(decideTransition(row({ planPath: "docs/plans/FEAT-01.md" }), "agent", "검토대기", undefined).ok, true);
  });
  it("완료 needs a report and a result; result accumulates; completes flag set", () => {
    const r = row({ status: "구현승인", results: ["첫 결과"] });
    assert.match(decideTransition(r, "agent", "완료", "끝").reason, /report_submit/);
    const d = decideTransition({ ...r, reportCount: 1 }, "agent", "완료", "끝");
    assert.equal(d.ok, true); assert.deepEqual(d.value.results, ["첫 결과", "끝"]); assert.equal(d.value.completes, true);
    assert.match(decideTransition({ ...r, reportCount: 1 }, "agent", "완료", "").reason, /비어/);
  });
  it("bounce clears validation; resume to 구현승인 keeps it; hold needs result", () => {
    const r = row({ status: "검토대기", validation: "클린 패스" });
    const b = decideTransition(r, "human", "계획지시", undefined);
    assert.equal(b.ok, true); assert.equal(b.value.validation, null);
    assert.equal(decideTransition(r, "human", "보류", undefined).ok, false);
    assert.equal(decideTransition(r, "human", "보류", "사용자 결정 — 대기").ok, true);
    const s = decideTransition(row({ status: "보류", validation: "클린 패스" }), "human", "구현승인", undefined);
    assert.equal(s.ok, true); assert.equal(s.value.validation, "클린 패스");
  });
});

describe("discard / validation / plan_submit", () => {
  it("discard only from 승인대기·검토대기", () => { assert.equal(decideDiscard("검토대기").ok, true); assert.equal(decideDiscard("구현승인").ok, false); });
  it("validation only in 검토대기 and within 150", () => {
    assert.equal(decideValidation("검토대기", "클린 패스").ok, true);
    assert.equal(decideValidation("구현승인", "x").ok, false);
    assert.equal(decideValidation("검토대기", "x".repeat(151)).ok, false);
  });
  it("plan_submit only in 계획지시", () => { assert.equal(decidePlanSubmit("계획지시").ok, true); assert.equal(decidePlanSubmit("승인대기").ok, false); });
});
```

- [ ] **Step 2: 실패 확인** — `npm run test:web` → FAIL(module not found)
- [ ] **Step 3: `board-rules.ts`**

```ts
// 순수. DB·프레임워크 없음. transitions.mjs의 규칙을 "이 행에 이 요청을 적용해도 되는가"로 번역한다.
// MCP 도구와 웹 액션이 같은 함수를 부르므로 판정이 한 곳에만 있다.
import { canDiscard, canPropose, canRecordValidation, checkText, findRule } from "@harness/core/transitions.mjs";

export type Actor = "human" | "agent";
export type Decision<T> = { ok: true; value: T } | { ok: false; reason: string };

type Rule = {
  from: string; to: string; actor: Actor; kind: string;
  requiresResult?: boolean; requiresPlan?: boolean; requiresReport?: boolean; clearsValidation?: boolean;
};

export type RowSnapshot = { status: string; planPath: string | null; reportCount: number; results: string[]; validation: string | null };

export type ProposeInput = {
  backlogExists: boolean;       // 항목이 있고 removedAt === null
  hasOpenRow: boolean;          // 이 key의 최신 행이 미결
  openCount: number;            // 프로젝트 전체 미결 수
  roster: readonly string[];    // Workspace.agent 집합
  agent: string;
  reason: string;
};

export function decidePropose(i: ProposeInput): Decision<null> {
  if (!i.backlogExists) return { ok: false, reason: "no such backlog item (or removed)" };
  if (i.hasOpenRow) return { ok: false, reason: "already open" };
  if (!canPropose(i.openCount)) return { ok: false, reason: `open items: ${i.openCount} (max 2)` };
  if (!i.roster.includes(i.agent)) return { ok: false, reason: `agent not in roster: ${i.agent}` };
  const bad = checkText("reason", i.reason);
  return bad ? { ok: false, reason: bad } : { ok: true, value: null };
}

export type TransitionPatch = { status: string; results: string[]; validation: string | null; completes: boolean };

export function decideTransition(row: RowSnapshot, actor: Actor, to: string, result: string | undefined): Decision<TransitionPatch> {
  const rule = findRule(actor, row.status, to) as Rule | null;
  if (!rule) return { ok: false, reason: `not allowed: ${actor} ${row.status} → ${to}` };
  if (rule.requiresResult) { const bad = checkText("result", result); if (bad) return { ok: false, reason: bad }; }
  if (rule.requiresPlan && !row.planPath) return { ok: false, reason: "plan_submit first" };
  if (rule.requiresReport && row.reportCount === 0) return { ok: false, reason: "report_submit first" };
  return { ok: true, value: {
    status: to,
    results: result ? [...row.results, result] : row.results,
    validation: rule.clearsValidation ? null : row.validation,
    completes: to === "완료",
  } };
}

export function decideDiscard(status: string): Decision<null> {
  return canDiscard(status) ? { ok: true, value: null } : { ok: false, reason: `cannot discard from ${status}` };
}

export function decideValidation(status: string, text: string): Decision<null> {
  if (!canRecordValidation(status)) return { ok: false, reason: `validation only in 검토대기 (now ${status})` };
  const bad = checkText("validation", text);
  return bad ? { ok: false, reason: bad } : { ok: true, value: null };
}

export function decidePlanSubmit(status: string): Decision<null> {
  return status === "계획지시" ? { ok: true, value: null } : { ok: false, reason: `plan_submit only in 계획지시 (now ${status})` };
}
```

- [ ] **Step 4: 통과** — `npm run test:web` → `# pass 12`
- [ ] **Step 5: `board.ts`** (Prisma 적용 계층. 단위 테스트 없음 — T1.17 스모크와 T1.9 실측이 판정)

```ts
import "server-only";
import { isOpen } from "@harness/core/transitions.mjs";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { decideDiscard, decidePlanSubmit, decidePropose, decideTransition, decideValidation, type Actor } from "./board-rules";

export type BoardResult<T> = { ok: true; item: T } | { ok: false; reason: string };
const fail = (reason: string): BoardResult<never> => ({ ok: false, reason });
type Db = PrismaClient | Prisma.TransactionClient;

// 항목별 최신 행 = backlogItemId마다 proposedOn 최대. 폐기 행은 없는 것으로 친다.
export async function latestBoard(projectId: string, openOnly = false, db: Db = prisma) {
  const rows = await db.boardItem.findMany({
    where: { projectId, discardedAt: null },
    orderBy: { proposedOn: "desc" },
    distinct: ["backlogItemId"],
    include: { backlogItem: { select: { key: true, title: true, area: true } } },
  });
  return openOnly ? rows.filter((r) => isOpen(r.status)) : rows;
}

async function latestRow(db: Db, projectId: string, key: string) {
  return db.boardItem.findFirst({
    where: { projectId, discardedAt: null, backlogItem: { key } },
    orderBy: { proposedOn: "desc" },
    include: { backlogItem: true, _count: { select: { reports: true } } },
  });
}

export async function backlogWithStatus(projectId: string, includeRemoved: boolean) {
  const [items, board] = await Promise.all([
    prisma.backlogItem.findMany({ where: { projectId, ...(includeRemoved ? {} : { removedAt: null }) }, orderBy: { createdAt: "asc" } }),
    latestBoard(projectId),
  ]);
  const status = new Map(board.map((b) => [b.backlogItemId, b.status]));
  return items.map((i) => ({ ...i, status: status.get(i.id) ?? null }));
}

export async function getWithHistory(projectId: string, key: string) {
  return prisma.boardItem.findFirst({
    where: { projectId, discardedAt: null, backlogItem: { key } },
    orderBy: { proposedOn: "desc" },
    include: { backlogItem: true, events: { orderBy: { at: "asc" } }, reports: { orderBy: { at: "asc" } } },
  });
}

// 미결 상한(2)은 "세고 나서 만든다" — READ COMMITTED에서는 두 호출자가 같은 수를 읽고 둘 다 만들 수 있다.
// 스펙이 이 상한을 서버 강제로 규정하므로(불변식·pm 규칙) 이 트랜잭션만 Serializable로 올린다.
// 충돌 시 Postgres가 40001로 실패시키고, 도구는 그 오류를 그대로 반환한다(에이전트는 다시 부르면 된다).
export async function propose(projectId: string, input: { key: string; agent: string; reason: string }, actorRef: string) {
  return prisma.$transaction(async (tx) => {
    const backlog = await tx.backlogItem.findUnique({ where: { projectId_key: { projectId, key: input.key } } });
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const open = await latestBoard(projectId, true, tx);
    const d = decidePropose({
      backlogExists: !!backlog && backlog.removedAt === null,
      hasOpenRow: !!backlog && open.some((r) => r.backlogItemId === backlog.id),
      openCount: open.length, roster, agent: input.agent, reason: input.reason,
    });
    if (!d.ok || !backlog) return fail(d.ok ? "no such backlog item" : d.reason);
    const item = await tx.boardItem.create({
      data: { projectId, backlogItemId: backlog.id, agent: input.agent, status: "승인대기", reason: input.reason,
        events: { create: { from: null, to: "승인대기", actor: "agent", actorId: actorRef } } },
    });
    return { ok: true as const, item };
  }, { isolationLevel: "Serializable" });
}

export async function transition(
  projectId: string, input: { key: string; to: string; result?: string; expectedUpdatedAt?: Date }, actor: Actor, actorRef: string,
) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideTransition(
      { status: row.status, planPath: row.planPath, reportCount: row._count.reports, results: row.results, validation: row.validation },
      actor, input.to, input.result,
    );
    if (!d.ok) return fail(d.reason);
    // 낙관적 잠금(ApcH sha 잠금의 대응물). 화면은 자기가 읽은 updatedAt을 보내고, 화면이 없는 호출자
    // (MCP 에이전트)는 이 트랜잭션에서 방금 읽은 row.updatedAt으로 CAS한다 — 가드를 비우면 두 에이전트가
    // 같은 행을 동시에 읽고 둘 다 전이해 이벤트가 둘, `결과:`가 두 번 누적된다.
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: input.expectedUpdatedAt ?? row.updatedAt },
      data: { status: d.value.status, results: d.value.results, validation: d.value.validation },
    });
    if (u.count === 0) return fail("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: d.value.status, actor, actorId: actorRef } });
    if (d.value.completes) await tx.backlogItem.update({ where: { id: row.backlogItemId }, data: { removedAt: new Date() } });
    return { ok: true as const, item: await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } }) };
  });
}

export async function discard(projectId: string, key: string, userId: string, expectedUpdatedAt?: Date) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, key);
    if (!row) return fail(`no such board item: ${key}`);
    const d = decideDiscard(row.status);
    if (!d.ok) return fail(d.reason);
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, updatedAt: expectedUpdatedAt ?? row.updatedAt },
      data: { discardedAt: new Date() },
    });
    if (u.count === 0) return fail("stale");
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: null, actor: "human", actorId: userId, note: "discard" } });
    return { ok: true as const, item: null };
  });
}

export async function recordValidation(projectId: string, input: { key: string; text: string }) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decideValidation(row.status, input.text);
    if (!d.ok) return fail(d.reason);
    const item = await tx.boardItem.update({ where: { id: row.id }, data: { validation: input.text } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", note: "validation" } });
    return { ok: true as const, item };
  });
}

export async function submitPlan(projectId: string, input: { key: string; path: string; commit: string }) {
  return prisma.$transaction(async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    const d = decidePlanSubmit(row.status);
    if (!d.ok) return fail(d.reason);
    const item = await tx.boardItem.update({ where: { id: row.id }, data: { planPath: input.path, planCommit: input.commit } });
    return { ok: true as const, item };
  });
}

export async function submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string }) {
  const row = await latestRow(prisma, projectId, input.key);
  if (!row) return fail(`no such board item: ${input.key}`);
  const report = await prisma.report.create({ data: { boardItemId: row.id, actor: input.actor, path: input.path, commit: input.commit } });
  return { ok: true as const, item: report };
}
```

- [ ] **Step 6: 확인** — `npm run check` 통과(Prisma 생성 타입과 맞물림 — `distinct`·`_count`·`updateMany` 시그니처가 어긋나면 여기서 잡힌다).
- [ ] **Step 7: 커밋** `feat(web): board rules (pure) + board service over prisma`

### T1.8: 인증 — Auth.js v5 + GitHub OAuth

ApcH `apps/admin/src/server/auth/*` 구조(엣지-안전 base 설정 + 전체 설정 + guard)를 따르되 provider는 GitHub, 화이트리스트(`ADMIN_EMAILS`) 대신 **프로젝트 멤버십**.

**Files:**
- Create: `src/server/auth/config.base.ts`, `src/server/auth/config.base.test.mjs`, `src/server/auth/config.ts`, `src/server/auth/index.ts`, `src/server/auth/guard.ts`, `src/server/auth/next-auth.d.ts`, `src/proxy.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/app/login/page.tsx`

**Interfaces (Produces):** `auth()`, `handlers`, `signIn`, `signOut`(`@/server/auth`); `requireUser() → {userId}`(미로그인 → `/login`), `requireMember(slug) → {userId, projectId}`(비멤버 → 404)(`@/server/auth/guard`). `session.user.id` = `User.id`(DB cuid).

- [ ] **Step 1: GitHub OAuth 앱** — GitHub Settings → Developer settings → OAuth Apps. Callback `http://localhost:3000/api/auth/callback/github`. `.env`에 `AUTH_GITHUB_ID`·`AUTH_GITHUB_SECRET`, `AUTH_SECRET`은 `npx auth secret`.
- [ ] **Step 2: 테스트 `config.base.test.mjs`**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authConfigBase } from "./config.base.ts";

const call = (pathname, user) =>
  authConfigBase.callbacks.authorized({ auth: user ? { user } : null, request: { nextUrl: new URL(`http://h.local${pathname}`) } });

describe("authorized", () => {
  it("unauthenticated: protected → false, /login → true", () => {
    assert.equal(call("/p/x", null), false);
    assert.equal(call("/login", null), true);
  });
  it("authenticated: protected → true, /login → redirect to /", () => {
    assert.equal(call("/p/x", { id: "u1" }), true);
    const r = call("/login", { id: "u1" });
    assert.ok(r instanceof Response);
    assert.equal(new URL(r.headers.get("location")).pathname, "/");
  });
});
```

- [ ] **Step 3: `config.base.ts`** (provider 없음 — proxy가 쓴다)

```ts
import type { NextAuthConfig } from "next-auth";

const PUBLIC_ROUTES = ["/login"];

export const authConfigBase = {
  providers: [],
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  callbacks: {
    // matcher가 /login을 포함하므로 미인증 /login은 true(무한 리다이렉트 방지 — ApcH config.edge 주석과 같은 이유).
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic = PUBLIC_ROUTES.some((r) => nextUrl.pathname.startsWith(r));
      if (isPublic) return isLoggedIn ? Response.redirect(new URL("/", nextUrl)) : true;
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 4: `config.ts`**

```ts
import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "@/server/db";
import { authConfigBase } from "./config.base";

export const authConfig = {
  ...authConfigBase,
  providers: [GitHub],
  callbacks: {
    ...authConfigBase.callbacks,
    // account·profile은 최초 로그인 요청에만 온다. GitHub 계정을 User로 upsert하고 DB id를 JWT에 싣는다.
    async jwt({ token, account, profile }) {
      if (account?.provider === "github" && profile) {
        const raw = profile as { id?: number | string; login?: string };
        const githubId = Number(raw.id);
        const login = typeof raw.login === "string" ? raw.login : String(githubId);
        const user = await prisma.user.upsert({ where: { githubId }, create: { githubId, login }, update: { login } });
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      return { ...session, user: { ...session.user, id: typeof token.uid === "string" ? token.uid : "" } };
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 5: `next-auth.d.ts`**, **`index.ts`**, **`guard.ts`**

```ts
// next-auth.d.ts
import type { DefaultSession } from "next-auth";
declare module "next-auth" {
  interface Session { user: { id: string } & DefaultSession["user"] }
}
declare module "next-auth/jwt" {
  interface JWT { uid?: string }
}
```

```ts
// index.ts
import "server-only";
import NextAuth from "next-auth";
import { cache } from "react";
import { authConfig } from "./config";

const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);
export const auth = cache(uncachedAuth);
export { handlers, signIn, signOut };
```

```ts
// guard.ts — DAL. page·서버 액션이 각자 부른다(레이아웃 한 번으로 대신하지 않는다 — T1.10 주석).
import "server-only";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { auth } from "./index";

export async function requireUser(): Promise<{ userId: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return { userId: session.user.id };
}

// 비멤버는 404 — 프로젝트의 존재를 드러내지 않는다(ApcH guard 관례).
export async function requireMember(slug: string): Promise<{ userId: string; projectId: string }> {
  const { userId } = await requireUser();
  const member = await prisma.projectMember.findFirst({ where: { userId, project: { slug } }, select: { projectId: true } });
  if (!member) notFound();
  return { userId, projectId: member.projectId };
}
```

- [ ] **Step 6: `src/proxy.ts`**, **라우트**, **`/login`**

```ts
// src/proxy.ts — Next 16: middleware → proxy(Node 런타임). /api/*는 자기 인증(MCP는 Bearer, auth는 Auth.js).
import NextAuth from "next-auth";
import { authConfigBase } from "@/server/auth/config.base";

export const proxy = NextAuth(authConfigBase).auth;
export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] };
```

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/server/auth";
export const { GET, POST } = handlers;
```

```tsx
// src/app/login/page.tsx
import { signIn } from "@/server/auth";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        action={async () => { "use server"; await signIn("github", { redirectTo: "/" }); }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        <h1 className="text-2xl font-semibold">Stagekeeper</h1>
        <p className="text-sm text-zinc-600">GitHub 계정으로 로그인합니다.</p>
        <button type="submit" className="w-full rounded-md bg-black px-4 py-2 text-white">GitHub로 로그인</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 7: 확인** — `npm run test:web` → `# pass 14`(12+2). `npm run check`. `npm run dev` → `/` 접근 시 `/login`으로 감 → GitHub 로그인 → `/`로 복귀, `User` 행 1건 생성(`npx prisma studio`로 확인).
- [ ] **Step 8: 커밋** `feat(web): github oauth via auth.js v5, member guard, proxy`

### T1.9: MCP 서버 — 에이전트 스코프 도구

스펙 Task 1.8을 mcp-handler 2.x로 다시 쓴다(C4). 도구 등록·인증·Prisma 접근을 세 모듈로 나눠 **DB 없이** 도구 집합과 인증을 테스트한다.

**Files:**
- Create: `src/server/mcp/tools.ts`, `src/server/mcp/tools.test.mjs`, `src/server/mcp/auth.ts`, `src/server/mcp/auth.test.mjs`, `src/server/mcp/deps.ts`, `src/app/api/mcp/route.ts`

**Interfaces (Produces):**
- `AGENT_TOOL_NAMES`(Phase 1 등록 집합 11개), `registerTools(server, deps: ToolDeps)`, `type ToolDeps`(아래), `type ToolResult<T> = {ok:true; item:T} | {ok:false; reason:string}`
- `makeVerifyToken(findByHash) → (req, bearer?) => AuthInfo | undefined` — `AuthInfo.extra = {projectId, tokenId}`
- `prismaToolDeps: ToolDeps`, `verifyProjectToken`(= `makeVerifyToken`에 Prisma 조회를 물린 것 — route가 아니라 여기서 만든다)
- 엔드포인트 `POST /api/mcp` (Streamable HTTP, 무세션). Claude Code에서 도구명 `mcp__harness__<tool>`.

- [ ] **Step 1: 테스트 `tools.test.mjs`**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_TOOL_NAMES, registerTools } from "./tools.ts";

// 웹 전용 — 에이전트 토큰용 서버에 절대 없어야 한다(불변식 4의 회귀 가드).
const WEB_ONLY = ["gate_approve", "board_approve", "board_bounce", "board_hold", "board_discard", "board_resume",
  "backlog_add", "backlog_update", "backlog_remove", "token_issue", "command_create"];

describe("agent-scoped MCP tools", () => {
  it("registers exactly the §5 Phase-1 agent scope, underscore names only", () => {
    const names = [];
    registerTools({ registerTool: (name) => { names.push(name); } }, {});
    assert.deepEqual([...names].sort(), [...AGENT_TOOL_NAMES].sort());
    for (const n of WEB_ONLY) assert.ok(!names.includes(n), `web-only tool registered: ${n}`);
    for (const n of names) assert.doesNotMatch(n, /\./);
  });
  it("handlers refuse calls that carry no project scope", async () => {
    const handlers = {};
    registerTools({ registerTool: (name, _meta, fn) => { handlers[name] = fn; } }, {});
    await assert.rejects(() => handlers.project_get({}, { http: {} }), /unauthenticated/);
    await assert.rejects(() => handlers.board_propose({ key: "X-1", agent: "dev", reason: "r" }, {}), /unauthenticated/);
  });
});
```

- [ ] **Step 2: 테스트 `auth.test.mjs`**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newToken } from "../../../packages/core/token.mjs";
import { makeVerifyToken } from "./auth.ts";

describe("makeVerifyToken", () => {
  const { plain, hash } = newToken();
  const rows = { [hash]: { id: "tok1", projectId: "proj1", revokedAt: null } };
  const verify = makeVerifyToken(async (h) => rows[h] ?? null);
  const req = () => new Request("http://h.local/api/mcp");

  it("valid token → project scope in extra", async () => {
    const info = await verify(req(), plain);
    assert.equal(info.clientId, "proj1");
    assert.deepEqual(info.extra, { projectId: "proj1", tokenId: "tok1" });
  });
  it("missing, malformed, unknown, revoked → undefined (401 by withMcpAuth)", async () => {
    assert.equal(await verify(req(), undefined), undefined);
    assert.equal(await verify(req(), "nope"), undefined);
    assert.equal(await verify(req(), newToken().plain), undefined);
    const revoked = makeVerifyToken(async () => ({ id: "t", projectId: "p", revokedAt: new Date() }));
    assert.equal(await revoked(req(), plain), undefined);
  });
});
```

- [ ] **Step 3: 실패 확인** — `npm run test:web` → FAIL
- [ ] **Step 4: `tools.ts`**

```ts
// 에이전트 토큰 스코프의 MCP 도구. 스펙 §5가 계약이다.
// 게이트·반려·백로그 편집·토큰 발급 도구는 여기 없다(D8) — 웹 전용이며 등록 자체가 없다.
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

export const AGENT_TOOL_NAMES = [
  "project_get", "project_sync", "backlog_list", "backlog_get", "board_list", "board_get",
  "board_propose", "board_transition", "plan_submit", "report_submit", "validation_record",
] as const;

export type ToolResult<T> = { ok: true; item: T } | { ok: false; reason: string };
export type WorkspaceInput = { id: string; path: string; agent: string; verify: string[]; knowledge: string | null; readOnly: string[] };

export type ToolDeps = {
  projectGet(projectId: string): Promise<unknown>;
  projectSync(projectId: string, workspaces: WorkspaceInput[]): Promise<number>;
  backlogList(projectId: string, includeRemoved: boolean): Promise<unknown>;
  backlogGet(projectId: string, key: string): Promise<unknown | null>;
  boardList(projectId: string, open: boolean): Promise<unknown>;
  boardGet(projectId: string, key: string): Promise<unknown | null>;
  propose(projectId: string, input: { key: string; agent: string; reason: string }, actorRef: string): Promise<ToolResult<unknown>>;
  transition(projectId: string, input: { key: string; to: string; result?: string }, actorRef: string): Promise<ToolResult<unknown>>;
  submitPlan(projectId: string, input: { key: string; path: string; commit: string }): Promise<ToolResult<unknown>>;
  submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string }): Promise<ToolResult<unknown>>;
  recordValidation(projectId: string, input: { key: string; text: string }): Promise<ToolResult<unknown>>;
};

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (reason: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: reason }) }], isError: true });
const unwrap = <T,>(r: ToolResult<T>) => (r.ok ? text(r.item) : fail(r.reason));

function scope(ctx: Ctx) {
  const extra = ctx.http?.authInfo?.extra;
  const projectId = extra?.projectId, tokenId = extra?.tokenId;
  if (typeof projectId !== "string" || typeof tokenId !== "string") throw new Error("unauthenticated");
  return { projectId, actorRef: `token:${tokenId}` };
}

const workspace = z.object({ id: z.string(), path: z.string(), agent: z.string(), verify: z.array(z.string()), knowledge: z.string().nullable(), readOnly: z.array(z.string()) });

export function registerTools(server: McpServer, deps: ToolDeps) {
  // inputSchema를 비워서라도 넣는다 — 콜백 인자 형이 항상 (args, ctx)로 고정된다.
  server.registerTool("project_get", { description: "프로젝트·roster·워크스페이스", inputSchema: z.object({}) }, async (_a, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text(await deps.projectGet(projectId));
  });
  server.registerTool("project_sync", { description: "harness.json.workspaces를 서비스에 반영(roster 갱신)", inputSchema: z.object({ workspaces: z.array(workspace) }) }, async ({ workspaces }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text({ synced: await deps.projectSync(projectId, workspaces) });
  });
  server.registerTool("backlog_list", { description: "백로그 항목 + 최신 보드 status", inputSchema: z.object({ includeRemoved: z.boolean().optional() }) }, async ({ includeRemoved }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text(await deps.backlogList(projectId, includeRemoved === true));
  });
  server.registerTool("backlog_get", { description: "항목 1건(source 전문)", inputSchema: z.object({ key: z.string() }) }, async ({ key }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    const item = await deps.backlogGet(projectId, key);
    return item ? text(item) : fail(`no such item: ${key}`);
  });
  server.registerTool("board_list", { description: "항목별 최신 보드 행", inputSchema: z.object({ open: z.boolean().optional() }) }, async ({ open }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return text(await deps.boardList(projectId, open === true));
  });
  server.registerTool("board_get", { description: "최신 보드 행 + 전이 이벤트 + 보고", inputSchema: z.object({ key: z.string() }) }, async ({ key }, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    const row = await deps.boardGet(projectId, key);
    return row ? text(row) : fail(`no such board item: ${key}`);
  });
  server.registerTool("board_propose", { description: "pm: 승인대기 행 생성. 거부: 미결 2건·roster 밖·근거 150자 초과·이미 미결", inputSchema: z.object({ key: z.string(), agent: z.string(), reason: z.string() }) }, async (args, ctx) => {
    const { projectId, actorRef } = scope(ctx as Ctx);
    return unwrap(await deps.propose(projectId, args, actorRef));
  });
  server.registerTool("board_transition", { description: "에이전트 전이: 계획지시→검토대기(plan_submit 선행) · 구현승인→완료(report_submit 선행) · →보류(result 필수). 게이트는 없다", inputSchema: z.object({ key: z.string(), to: z.string(), result: z.string().optional() }) }, async (args, ctx) => {
    const { projectId, actorRef } = scope(ctx as Ctx);
    return unwrap(await deps.transition(projectId, args, actorRef));
  });
  server.registerTool("plan_submit", { description: "계획서 위치 기록(계획지시에서만)", inputSchema: z.object({ key: z.string(), path: z.string(), commit: z.string() }) }, async (args, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return unwrap(await deps.submitPlan(projectId, args));
  });
  server.registerTool("report_submit", { description: "행위자 기록 위치(docs/agents/<actor>/<ID>.md)", inputSchema: z.object({ key: z.string(), actor: z.string(), path: z.string(), commit: z.string() }) }, async (args, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return unwrap(await deps.submitReport(projectId, args));
  });
  server.registerTool("validation_record", { description: "main-loop: 검증 클린 패스 기록(검토대기에서만, 150자)", inputSchema: z.object({ key: z.string(), text: z.string() }) }, async (args, ctx) => {
    const { projectId } = scope(ctx as Ctx);
    return unwrap(await deps.recordValidation(projectId, args));
  });
}
```

- [ ] **Step 5: `auth.ts`**, **`deps.ts`**, **`route.ts`**

```ts
// auth.ts — withMcpAuth의 verifyToken. 토큰 조회를 주입받아 DB 없이 테스트한다.
import type { AuthInfo } from "@modelcontextprotocol/server";
import { hashToken, parseBearer } from "@harness/core/token.mjs";

export type TokenRow = { id: string; projectId: string; revokedAt: Date | null } | null;

export function makeVerifyToken(findByHash: (hash: string) => Promise<TokenRow>) {
  return async (_req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
    const plain = parseBearer(bearer ? `Bearer ${bearer}` : null);
    if (!plain) return undefined;
    const row = await findByHash(hashToken(plain));
    if (!row || row.revokedAt) return undefined;
    return { token: plain, scopes: ["agent"], clientId: row.projectId, extra: { projectId: row.projectId, tokenId: row.id } };
  };
}
```

```ts
// deps.ts — ToolDeps의 Prisma 구현 + 토큰 검증 바인딩. 도구 본문은 tools.ts, 저장 규칙은 pipeline/board.ts.
import "server-only";
import { prisma } from "@/server/db";
import * as board from "@/server/pipeline/board";
import { makeVerifyToken } from "./auth";
import type { ToolDeps } from "./tools";

export const prismaToolDeps: ToolDeps = {
  projectGet: (projectId) => prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { workspaces: true } }),
  projectSync: async (projectId, workspaces) => {
    await prisma.$transaction(workspaces.map((w) => prisma.workspace.upsert({
      where: { projectId_agent: { projectId, agent: w.agent } },
      create: { projectId, wsId: w.id, path: w.path, agent: w.agent, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly },
      update: { wsId: w.id, path: w.path, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly },
    })));
    return workspaces.length;
  },
  backlogList: (projectId, includeRemoved) => board.backlogWithStatus(projectId, includeRemoved),
  backlogGet: (projectId, key) => prisma.backlogItem.findUnique({ where: { projectId_key: { projectId, key } } }),
  boardList: (projectId, open) => board.latestBoard(projectId, open),
  boardGet: (projectId, key) => board.getWithHistory(projectId, key),
  propose: (projectId, input, actorRef) => board.propose(projectId, input, actorRef),
  transition: (projectId, input, actorRef) => board.transition(projectId, input, "agent", actorRef),
  submitPlan: (projectId, input) => board.submitPlan(projectId, input),
  submitReport: (projectId, input) => board.submitReport(projectId, input),
  recordValidation: (projectId, input) => board.recordValidation(projectId, input),
};

// 토큰 조회도 여기 둔다 — route.ts가 Prisma를 직접 부르면 adapter가 데이터 접근을 떠안는다.
export const verifyProjectToken = makeVerifyToken((hash) =>
  prisma.projectToken.findUnique({ where: { hash }, select: { id: true, projectId: true, revokedAt: true } }),
);
```

```ts
// src/app/api/mcp/route.ts — mcp-handler 2.x: 이 경로에 바로 마운트. [transport]·basePath·SSE 없음.
// route는 transport 배선만 한다. DB 조회·정책은 전부 @/server/mcp 안에 있다
// (system-overview.md: "Route Handler와 page는 직접 정책을 재구현하지 않고 src/server를 호출한다").
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { prismaToolDeps, verifyProjectToken } from "@/server/mcp/deps";
import { registerTools } from "@/server/mcp/tools";

const handler = createMcpHandler((server) => registerTools(server, prismaToolDeps), { serverInfo: { name: "harness", version: "0.1.0" } });

const authed = withMcpAuth(handler, verifyProjectToken, { required: true });

export { authed as GET, authed as POST };
```

- [ ] **Step 6: 통과** — `npm run test:web` → `# pass 18`(14+4). `npm run check`.
- [ ] **Step 7: 실측(HTTP)** — `npm run dev` 후. **이 저장소의 기본 셸은 PowerShell이다** — `curl`은 PS 5.1에서 `Invoke-WebRequest`의 별칭이고 작은따옴표 JSON도 다르게 파싱되므로, 아래 PowerShell 형태를 쓰거나 같은 bash 명령을 Bash 도구에서 실행한다.

PowerShell:

```powershell
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
$h = @{ "Content-Type" = "application/json"; "Accept" = "application/json, text/event-stream" }
# (a) 토큰 없음 → 401
try { Invoke-WebRequest -Uri http://localhost:3000/api/mcp -Method POST -Headers $h -Body $body -UseBasicParsing | Select-Object -ExpandProperty StatusCode }
catch { $_.Exception.Response.StatusCode.value__ }
# (b) 유효 토큰 → 200 + 도구 11개  ((c) 폐기한 토큰으로 같은 요청 → 401)
$h["Authorization"] = "Bearer $env:HARNESS_TOKEN"
(Invoke-WebRequest -Uri http://localhost:3000/api/mcp -Method POST -Headers $h -Body $body -UseBasicParsing).Content
```

Bash 도구에서 실행할 때(같은 세 경우):

```bash
B='{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
A='Accept: application/json, text/event-stream'
curl -s -o /dev/null -w "no-token=%{http_code}\n" -X POST http://localhost:3000/api/mcp -H "Content-Type: application/json" -H "$A" -d "$B"
curl -s -X POST http://localhost:3000/api/mcp -H "Content-Type: application/json" -H "$A" -H "Authorization: Bearer $HARNESS_TOKEN" -d "$B"
```

(a)는 T1.9 시점에 바로 되고, (b)·(c)는 토큰이 생기는 **T1.10 Step 4**에서 돌린다.

- [ ] **Step 8: 실측(Claude Code)** — T1.10 뒤에 토큰이 생기면: 임시 폴더에 `.mcp.json` `{"mcpServers":{"harness":{"type":"http","url":"http://localhost:3000/api/mcp","headers":{"Authorization":"Bearer ${HARNESS_TOKEN}"}}}}` 두고 `HARNESS_TOKEN` 설정 → `claude` → `/mcp`에서 `harness` connected, 도구 11개 → `project_get` 호출 성공. 결과를 T1.17의 사전 확인으로 기록.
- [ ] **Step 9: 커밋** `feat(web): MCP server with agent-scoped tools (mcp-handler 2)`

### T1.10: 웹 — 프로젝트 목록·등록·토큰

**Files:**
- Create: `src/fsd/features/create-project/{api/create-project.server.ts, ui/new-project-form.tsx, index.ts, index.server.ts}`, `src/fsd/features/manage-token/{api/manage-token.server.ts, ui/token-reveal.tsx, index.ts, index.server.ts}`, `src/fsd/pages/{project-list,project-tokens}/**` + 각 `index.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/p/new/page.tsx`, `src/app/(app)/p/[slug]/layout.tsx`, `src/app/(app)/p/[slug]/tokens/page.tsx`
- Modify: `src/app/page.tsx` 삭제(→ `(app)/page.tsx`가 `/`)
- **경로·public API는 C14 정렬표를 따른다** — slice 이름과 `index.ts`/`index.server.ts` 구성이 위 표에 있다. deep import는 `verify:fsd`가 막는다.

**Interfaces (Produces):** 서버 액션 `createProject(prev, formData) → {error?} | {slug, token}`, `issueToken(slug, label) → {token}`, `revokeToken(slug, tokenId)`. `(app)/layout.tsx`는 `requireUser()`, `p/[slug]/layout.tsx`는 `requireMember(slug)`를 부르고 상단 탭(보드·결재함·백로그·토큰)을 그린다.

> **레이아웃은 인가 경계가 아니다.** Next.js 문서(`node_modules/next/dist/docs/01-app/02-guides/authentication.md`)가 "보안 검사는 데이터 소스에 최대한 가깝게(DAL)"를 요구하고, 레이아웃은 하위 탐색마다 다시 실행된다는 보장이 없다. 그래서 **데이터를 읽는 모든 page와 모든 서버 액션이 각자 `requireMember(slug)`를 부르고, 그 반환 `projectId`로만 조회한다.** 레이아웃의 호출은 탭/셸을 그리기 위한 것이고 보호는 부수 효과일 뿐이다 — 이 규칙은 T1.11·T1.12·T1.14의 각 page에도 적용된다.

- [ ] **Step 1: `create-project.ts`**

```ts
"use server";
import { newToken } from "@harness/core/token.mjs";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
// `/p/new`는 정적 라우트라 `/p/[slug]`보다 먼저 잡힌다 — slug "new"인 프로젝트는 열 수 없다.
const RESERVED_SLUGS = new Set(["new"]);
export type CreateProjectState = { error?: string; slug?: string; token?: string };

export async function createProject(_prev: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const { userId } = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const slug = s("slug"), owner = s("owner"), repo = s("repo"), branch = s("branch") || "main", name = s("name") || slug;
  if (!SLUG_RE.test(slug)) return { error: "slug: 소문자·숫자·하이픈, 2~40자" };
  if (RESERVED_SLUGS.has(slug)) return { error: `예약된 slug: ${slug}` };
  if (!owner || !repo) return { error: "GitHub owner/repo는 필수" };
  if (await prisma.project.findUnique({ where: { slug } })) return { error: `이미 있는 slug: ${slug}` };
  const { plain, hash } = newToken();
  await prisma.project.create({
    data: { slug, name, owner, repo, branch, members: { create: { userId, role: "owner" } }, tokens: { create: { hash, label: "initial" } } },
  });
  return { slug, token: plain }; // 평문은 이 응답에만 존재한다. 저장하지 않는다.
}
```

- [ ] **Step 2: `tokens.ts`** — `issueToken(slug, label)`: `requireMember` → `newToken()` → `projectToken.create` → `{token: plain}`; `revokeToken(slug, tokenId)`: `requireMember` → `updateMany({where:{id, projectId}, data:{revokedAt: new Date()}})`. 둘 다 끝에 `revalidatePath(\`/p/${slug}/tokens\`)`.
- [ ] **Step 3: 화면** — `new-project-form.tsx`(client, `useActionState(createProject, {})`): 필드 slug·name·owner·repo·branch. 성공 시 `token-reveal.tsx`: 토큰 평문 1회 표시 + 안내 3줄(`HARNESS_TOKEN` 환경변수로 저장 / MCP URL `${HARNESS_PUBLIC_URL}/api/mcp` / `/harness:init` 실행) + `/p/[slug]/tokens` 링크. `tokens/page.tsx`: 토큰 목록(label·createdAt·revokedAt·`token:<id>` 참조값), 「새 토큰」 폼(label) → 같은 `token-reveal`, 「폐기」 버튼. `(app)/page.tsx`: 내 프로젝트 목록(`projectMember` 조인) + 「새 프로젝트」.
- [ ] **Step 4: 확인** — 로그인 → 프로젝트 등록 → 토큰 1회 표시 → 새로고침 시 평문 사라짐 → **T1.9 Step 7의 (b)(유효 토큰 → 200, 도구 11개)와 (c)(폐기한 토큰 → 401)** 를 여기서 돌린다. `npm run check`.
- [ ] **Step 5: 커밋** `feat(web): project list, registration, token issue/revoke`

### T1.11: 웹 — 백로그

**Files:**
- Create: `src/fsd/features/edit-backlog/{api/edit-backlog.server.ts, ui/backlog-form.tsx, ui/backlog-table.tsx, index.ts, index.server.ts}`, `src/fsd/pages/project-backlog/**` + `index.ts`, `src/app/(app)/p/[slug]/backlog/page.tsx`
- **경로·public API는 C14 정렬표를 따른다** — slice 이름과 `index.ts`/`index.server.ts` 구성이 위 표에 있다. deep import는 `verify:fsd`가 막는다.

**Interfaces (Produces):** 서버 액션 `addBacklogItem(slug, prev, form)`, `updateBacklogItem(slug, key, prev, form)`, `removeBacklogItem(slug, key)`. 검증: key `^[A-Z]+-\d+$` 프로젝트 내 유일, title 필수, area·source 자유 길이(150자 규칙 없음 — 스펙 1.9 Step 3). 제거는 `removedAt` 표기이며 **미결 보드 행이 있으면 거부**(`latestBoard(projectId, true)`에 그 key가 있으면 `"보드에 미결 행이 있어 제거할 수 없다"`).

- [ ] **Step 1: 액션** — 세 함수 모두 `requireMember(slug)` 선행, Prisma 직접(백로그는 상태 기계 밖). 끝에 `revalidatePath(\`/p/${slug}/backlog\`)`.
- [ ] **Step 2: 화면** — `backlog/page.tsx`가 **자기 `requireMember(slug)`를 부르고**(T1.10 주석) 그 `projectId`로 `backlogWithStatus`를 읽는다. 표(key·title·area·최신 status 칩·제거 버튼) + 추가/편집 폼. 폼 도움말은 ApcH `TASK_BACKLOG.md` 머리말(관측/진단 분리 규칙)을 옮긴다: "`source`에는 **관측**(무엇이 보였나)과 **진단(코드 확정)**(어디가 원인인가)을 나눠 적는다". 「제거된 항목 보기」 토글(`includeRemoved`).
- [ ] **Step 3: 확인** — 항목 추가·편집·제거, 중복 key 거부, `npm run check`. MCP `backlog_list`로 같은 항목이 보인다(Claude Code 또는 curl + 토큰).
- [ ] **Step 4: 커밋** `feat(web): backlog editor`

### T1.12: 웹 — 결재함(게이트·반려·재개)

ApcH `features/transition-pipeline-gate/{ui,api}`를 이식한다. contents API 커밋 → `board.transition(…, "human", userId)`, sha 잠금 → `expectedUpdatedAt`.

**Files:**
- Create: `src/fsd/shared/api/result.ts`(ApcH 복사), **`src/fsd/shared/lib/class-name.ts`**(ApcH `cn` 그대로 — 아래 「이식이 끌고 오는 것」), `src/fsd/features/review-gate/{api/review-gate.server.ts, model/gate-text.ts, model/gate-source.ts, ui/gate-transition-button.tsx, ui/reject-actions.tsx, ui/gate-card-lock.tsx, ui/inbox-card.tsx, index.ts, index.server.ts}`, `src/fsd/pages/project-inbox/**` + `index.ts`, `src/app/(app)/p/[slug]/inbox/page.tsx`
- **경로·public API는 C14 정렬표를 따른다.** `"use client"`인 UI 셋은 `@/server`를 직접 부르지 않는다 — 서버 액션은 `api/review-gate.server.ts`에 두고 `index.server.ts`로만 공개한다(`verify:fsd`가 이 경계를 검사한다).
- Modify: `src/app/layout.tsx` — `<Toaster />` 마운트(아래)

> **이식이 끌고 오는 것 — ApcH 세 파일의 임포트를 실측해 정리한다.** `gate-card-lock.tsx:5`는 `cn`을, `gate-transition-button.tsx:5`·`reject-actions.tsx:5`는 `sonner`의 `toast`를, `gate-transition-button.tsx:7`은 `~/fsd/shared/ui/atoms/button`의 `Button`을 쓴다(실측).
> - **`cn`** → `src/fsd/shared/lib/class-name.ts`를 **이 태스크가 만든다**(C14 — `utils.ts`는 맥락 없는 이름이라 금지). T1.13이 아니다 — T1.13은 순수 모델만 만들고 `cn`을 쓰지 않는다. 여기 두지 않으면 T1.12↔T1.13 순환이 생긴다.
> - **`toast`** → `sonner`(T0.2에서 설치). **`<Toaster />`를 `src/app/layout.tsx`에 마운트한다** — 안 하면 `toast()`가 조용히 아무것도 안 해서 도장·반려 피드백이 사라진다. ApcH도 루트 레이아웃에 단다(`apps/admin/src/app/layout.tsx:23`).
> - **`Button`** → **가져오지 않는다.** ApcH의 것은 shadcn 방식이라 `class-variance-authority`·`@radix-ui/react-slot`과 `bg-primary`·`text-primary-foreground` 같은 **shadcn 테마 토큰**까지 끌고 오는데, 이 저장소 `globals.css`에는 `--background`·`--foreground`뿐이다. 평범한 `<button>` + Tailwind 클래스로 바꾼다(T1.8의 `/login` 버튼과 같은 방식).

**Interfaces (Produces):**
- `humanTransition(slug, key, to, result, expectedUpdatedAt: string) → ActionResult<void>`, `discardItem(slug, key, expectedUpdatedAt) → ActionResult<void>`
- `isGateSource(status)`(**`model/gate-source.ts`**, public API `@/fsd/features/review-gate`로 공개): `STATUSES.some((to) => findRule("human", status, to)?.kind === "gate")` — T1.13의 briefing이 ApcH `isGateTransitionSource` 대신 쓴다
- `holdResultLine(today: Date)`: ApcH `transitions.ts`의 같은 함수 이식, 문구의 `TASK_BACKLOG.md` → "백로그"

- [ ] **Step 1: `actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { type ActionResult, failure, success } from "@/fsd/shared/api/result";
import { requireMember } from "@/server/auth/guard";
import * as board from "@/server/pipeline/board";

const REASON_MESSAGE: Record<string, string> = { stale: "보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요" };
const message = (reason: string) => REASON_MESSAGE[reason] ?? reason;

export async function humanTransition(slug: string, key: string, to: string, result: string | undefined, expectedUpdatedAt: string): Promise<ActionResult<void>> {
  const { userId, projectId } = await requireMember(slug);
  const r = await board.transition(projectId, { key, to, result, expectedUpdatedAt: new Date(expectedUpdatedAt) }, "human", userId);
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(`/p/${slug}`); revalidatePath(`/p/${slug}/inbox`);
  return success(); // ApcH result.ts의 무인자 오버로드 = ActionResult<void>
}

export async function discardItem(slug: string, key: string, expectedUpdatedAt: string): Promise<ActionResult<void>> {
  const { userId, projectId } = await requireMember(slug);
  const r = await board.discard(projectId, key, userId, new Date(expectedUpdatedAt));
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(`/p/${slug}`); revalidatePath(`/p/${slug}/inbox`);
  return success(); // ApcH result.ts의 무인자 오버로드 = ActionResult<void>
}
```

- [ ] **Step 2: UI 이식** — ApcH `gate-transition-button.tsx`·`reject-actions.tsx`·`gate-card-lock.tsx`를 복사해 (i) `~/` → `@/`, (ii) 액션 호출을 `humanTransition`/`discardItem`으로, (iii) props에 `updatedAt: string` 추가(카드가 읽은 값을 그대로 넘긴다), (iv) 되돌리기·보류·폐기 가능 여부는 `findRule("human", status, to)`/`canDiscard(status)`로 계산(ApcH `rejectActionsFor` 대체), (v) `Button` → 평범한 `<button>`, `commitGateTransition`/`commitRejectTransition` → `humanTransition`/`discardItem`, `GATE_LOCK_LABEL`·`gateNextActionHint`·`rejectLockLabel`·`CardLock`을 ApcH `transitions.ts`에서 `gate-text.ts`로 함께 옮긴다. 보류는 `holdResultLine(new Date())`를 result로 보낸다.

  **단, `gateNextActionHint`의 문구는 그대로 옮기면 거짓말이 된다.** ApcH 원본은 "보드에 반영되면 **파이프라인 실행을 눌러** 계획서를 받으세요"인데(실측 `transitions.ts`), 그 실행 버튼은 `PipelineRunControl`이고 **T1.14 Step 1이 Phase 3라서 제거한다.** Phase 1의 실행기는 `local`이다(스펙 D10) — 도장을 찍은 뒤 다음 단계를 미는 것은 웹 버튼이 아니라 **사용자 자신의 Claude Code 세션**이다. 문구를 그에 맞게 다시 쓴다: `계획지시` → "이제 Claude Code에서 런북대로 담당 dev를 디스패치하면 계획서를 씁니다.", `구현승인` → "이제 Claude Code에서 담당 dev를 디스패치하면 구현합니다." 나머지 셋(`GATE_LOCK_LABEL`·`rejectLockLabel`·`CardLock`)은 순수 칩 문구라 그대로 쓴다.
- [ ] **Step 2b: `<Toaster />` 마운트** — `src/app/layout.tsx`의 `<body>` 안에 `import { Toaster } from "sonner"` 후 `<Toaster />` 한 줄. 이식한 두 파일이 `toast()`로 성공·실패를 알리는데 마운트가 없으면 아무 표시도 안 난다.
- [ ] **Step 2c: 결재함 도움말** — 스펙 §8은 보드 안내 블록을 `docs/protocol.md` **+ 웹 화면 도움말** 양쪽에 두라고 한다. protocol.md 쪽은 T0.3 Step 3이 맡고, **여기서는 도장을 찍는 순간에 필요한 것만** 카드 옆 접이식 도움말로 넣는다(전문 복제 금지 — 드리프트가 생긴다): ① 도장 두 개가 각각 무엇을 지시하는지(`계획지시`=계획서를 받는다, `구현승인`=코드를 고치게 한다) ② `검증:` 칩의 의미(있으면 무편집 클린 패스가 나온 것, 없으면 「검증 전」) ③ 되돌리기는 `검증:`을 지운다 ④ 폐기는 되돌릴 수 없다. 더 알고 싶으면 저장소 `docs/architecture/protocol.md`로 가라는 링크 한 줄.
- [ ] **Step 3: `inbox/page.tsx`** — 자기 `requireMember(slug)`를 부르고(T1.10 주석) 그 `projectId`로 `latestBoard(projectId)`. `승인대기`·`검토대기` 카드(도장 = `humanTransition(…, 계획지시|구현승인)`, 되돌리기, 보류, 폐기), `보류` 카드(재개 → `계획지시` / `구현승인`). 카드에 key·title·agent·근거·검증·계획서 링크(`planPath`가 있으면 `https://github.com/{owner}/{repo}/blob/{branch}/{planPath}`).
- [ ] **Step 4: 확인** — 백로그 항목 1건을 T1.9 실측 토큰으로 `board_propose`(curl 또는 Claude Code) → 결재함에 `승인대기` 카드 → 도장 → `계획지시`. 두 탭에서 같은 카드를 열고 한쪽 도장 후 다른 쪽 도장 → "보드가 이미 바뀌었습니다". `npm run check`.
- [ ] **Step 5: 커밋** `feat(web): inbox with gate/bounce/hold/discard/resume over board service`

### T1.13: 웹 — 보드 모델 이식 (`journey`·`briefing`·`sprites`·`known-agents`)

ApcH `apps/admin/src/fsd/pages/pipeline/model/*`를 복사한다. `BoardItem`/`BoardSection` 입력 형은 유지하고 DB 행 → 그 형으로 바꾸는 **어댑터**를 둔다(스펙 "거의 무변경"의 실체). 원본 test(journey 11 · briefing 26 · sprites 15)를 가져와 통과시킨다.

**Files:**
- Create: `src/fsd/entities/board-item/{model/board-item.ts(어댑터), model/doc-link.ts, index.ts}`, `src/fsd/entities/report/{model/report.ts, index.ts}`, `src/fsd/pages/project-board/model/{journey,briefing,sprites,known-agents}.ts` + `{journey,briefing,sprites}.test.mjs` + `index.ts` (모델만 — `cn`을 쓰지 않으므로 `shared/lib/class-name.ts`는 **T1.12 소유**다. 여기 두면 T1.12↔T1.13 순환이 된다)

> **테스트 확장자는 `.test.mjs`로 둔다 — `fsd.md`의 `<name>.test.ts(x)` 규약에서 의도적으로 벗어나는 유일한 지점이다.** 검사기는 확장자를 강제하지 않고(실측: `.test.mjs` 포함 구조가 `verify:fsd` PASS), 이름만 `.test.ts`로 바꿔도 `node --import tsx --test`에서 **30/30 통과한다**. 문제는 `tsc`다 — `.ts`가 되는 순간 `strict` 타입체크 대상이 되어 이식한 ApcH 테스트에 **에러 52개**가 뜬다(대부분 `TS18047: 'v' is possibly 'null'` — `deriveJourney`가 `JourneyView | null`인데 JS 테스트가 좁히지 않는다). 그걸 없애려면 **이식한 테스트 본문을 손대야 하는데, 이 태스크의 원칙은 "그 외 로직은 손대지 않는다"**이다. 그래서 포팅 충실도를 택했다. 새로 쓰는 FSD 테스트는 `fsd.md`대로 `.test.ts`로 만든다.
- **경로·public API는 C14 정렬표를 따른다.** 두 entity slice는 서로 import하지 않는다(같은 layer) — `briefing.ts`가 pages에서 둘 다 가져다 쓴다.
- **가져오지 않는 것:** `desk-commands.ts` — 실물이 `PipelineCommandKey`를 `run-pipeline-command`에서 임포트한다(ApcH `model/desk-commands.ts:1`). 그 기능은 Phase 3이고 T1.14 Step 1이 `deskCommandFor`를 제거하므로 이 태스크에서도 만들지 않는다.

**Interfaces (Produces):**
- `type BoardItem = {checked,id,title,agent,area,status,reason,result,validation}`(ApcH와 동일 형), `type BoardSection = {heading, items}`; `toBoardItem(row)`, `toBoardSections(rows) → BoardSection[]`(`proposedOn` 날짜별 내림차순, heading = `YYYY-MM-DD`)
- `type AgentReport = {actor, path, commit, at}`; `docLinksForItem(project, row) → DocLink[]`(GitHub blob URL — planPath·reports)
- ApcH 시그니처 그대로인 것들 — **정확한 형을 적어 둔다**(T1.14 구현자는 이 블록만 본다):
  - `deriveJourney(status: string | null, validation: string | null) → JourneyView | null` — **항목 하나**에 대한 함수다(보드 전체가 아니다). `완료`·`보류`·`null`은 여정 밖이라 `null`을 돌려준다. 호출은 이식한 `ui/index.tsx`가 카드마다 한다(ApcH `ui/index.tsx:173`).
  - `initialOf(identity: AgentIdentity) → string`
  - sprites: `appearanceFor(agentId: string) → Appearance`, `spriteExtra(app: Appearance) → Record<string,string>`, `bubbleColorFor(tone: Tone) → string | null`, `resolveCell(...)`, `gridToRects(...) → PixelRect[]` + 상수 `PIXEL_PALETTE`·`SPRITE_ROWS`·`PROP_GRIDS`·`BUBBLE_TONE_COLOR`. `Tone`은 `briefing.ts`에서 온다(sprites의 유일한 임포트).
- **`buildBriefing`은 시그니처가 바뀐다.** ApcH 실물은 `buildBriefing(sections, today, docs?)`이고 본문에서 `ROSTER_ORDER`와 `identityFor(id)`를 쓴다(ApcH `model/briefing.ts:256-283`). roster가 프로젝트마다 다르므로 고정 상수를 쓸 수 없다 → **`buildBriefing(sections, today, roster: readonly string[], docs?)`**. 본문의 `ROSTER_ORDER` → `rosterOrder(roster)`, `identityFor(id)` → `identityFor(id, roster)`. 반환 `Briefing`에서 **`plan` 필드는 뺀다**(`describePipelineRun`은 Phase 3).
- `identityFor(agentId: string | null, roster: readonly string[])` — roster에 있는 id는 generic `{id, handle:id, role:"개발", emoji:"🛠️"}`, 고정 4역은 ApcH 값 그대로.
- `rosterOrder(roster: readonly string[]) → string[]` = **`["pm", ...roster, "plan-verifier", "doc-auditor", "feature-scout"]`**(Step 3에서 확정한 정렬).

- [ ] **Step 1: 어댑터 `board-item.ts`**

```ts
// DB BoardItem 행 → ApcH 화면 모델이 읽던 형. 날짜 섹션은 proposedOn에서 파생한다(스펙 §3.3).
export type BoardItem = {
  checked: boolean; id: string; title: string; agent: string | null; area: string | null;
  status: string | null; reason: string | null; result: string | null; validation: string | null;
};
export type BoardSection = { heading: string; items: BoardItem[] };

type Row = { status: string; agent: string; reason: string; results: string[]; validation: string | null; proposedOn: Date;
  backlogItem: { key: string; title: string; area: string } };

export function toBoardItem(r: Row): BoardItem {
  return { checked: r.status === "완료", id: r.backlogItem.key, title: r.backlogItem.title, agent: r.agent, area: r.backlogItem.area,
    status: r.status, reason: r.reason, result: r.results.length ? r.results.join(" ") : null, validation: r.validation };
}

export function toBoardSections(rows: Row[]): BoardSection[] {
  const byDay = new Map<string, BoardItem[]>();
  for (const r of [...rows].sort((a, b) => b.proposedOn.getTime() - a.proposedOn.getTime())) {
    const day = r.proposedOn.toISOString().slice(0, 10);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(toBoardItem(r));
  }
  return [...byDay].map(([heading, items]) => ({ heading, items }));
}
```

- [ ] **Step 2: 복사 + 치환** — 모델 **네 파일**(`journey`·`briefing`·`sprites`·`known-agents`)과 테스트 세 개를 복사하고 아래 표대로 바꾼다(`desk-commands`는 위 「가져오지 않는 것」). 그 외 로직은 손대지 않는다.

| ApcH import | 대체 | 영향 |
| --- | --- | --- |
| `~/fsd/entities/pipeline` `BoardItem`·`BoardSection`·`parseBoard` | **`@/fsd/entities/board-item`**(public API — deep import 금지, C14), 테스트의 `parseBoard`는 `packages/core/board-md.mjs`(픽스처가 md라서) | briefing.ts·test |
| `~/fsd/entities/agent-report` `AgentReport` | **`@/fsd/entities/report`** | briefing.ts |
| `~/fsd/entities/repo-doc` `docLinksForItem`·`DocLink` | **`@/fsd/entities/board-item`**(같은 slice의 `model/doc-link.ts`를 public API로 공개) | briefing.ts |
| `~/fsd/features/run-pipeline-command` `describePipelineRun`·`RunPlan` | **제거**(Phase 3). `Briefing.plan` 필드·관련 테스트 케이스 삭제, 삭제한 케이스 이름을 커밋 메시지에 적는다 | briefing.ts·test |
| `~/fsd/features/transition-pipeline-gate` `isGateTransitionSource` | **`@/fsd/features/review-gate`** `isGateSource`(public API) | briefing.ts — pages→features라 방향 OK |
| `~/fsd/shared/agents/roster` `ROSTER_AGENT_IDS` | `known-agents.ts`의 `ROSTER`를 **고정 4역**(pm·plan-verifier·doc-auditor·feature-scout)만 남기고, `identityFor(agentId, roster: readonly string[])`가 roster(=`Workspace.agent[]`)에 있는 id는 `{id, handle:id, role:"개발", emoji:"🛠️"}`로 만든다. `ROSTER_ORDER` → `rosterOrder(roster)` = 고정 4역 앞뒤에 워크스페이스 에이전트 | known-agents·briefing·test(ApcH 이름 `admin-dev` 등은 roster 인자로 넘긴다) |
| `~/fsd/shared/lib/utils` `cn` | **`@/fsd/shared/lib/class-name`** — T1.12가 만든 것을 그대로 쓴다 | 이 태스크의 모델 4파일은 `cn`을 쓰지 않는다. 쓰는 쪽은 T1.14의 `journey-stepper`·`agent-avatar` |

- [ ] **Step 3: 통과** — `npm run test:web` → journey 11 · sprites 15는 **그대로 전부**(둘 다 roster 비의존이라 손댈 게 없다). briefing은 `plan` 관련 삭제 **외에 두 케이스의 기대값을 고쳐야 한다** — 실측으로 확인된 것이라 "그대로 이식하면 통과"가 아니다:

  1. **team 정렬**(ApcH `briefing.test.mjs:243-255`)은 `["pm","admin-dev","web-dev","backend-dev","plan-verifier","doc-auditor","feature-scout"]`를 `deepEqual`한다. 그건 ApcH `ROSTER_AGENT_IDS`의 고정 순서인데, 우리 `rosterOrder(roster)`는 roster를 인자로 받는다. **`rosterOrder`를 이렇게 확정한다:** `["pm", ...roster, "plan-verifier", "doc-auditor", "feature-scout"]` — pm이 먼저(선정), 그다음 워크스페이스 dev들이 `harness.json` 순서대로, 그다음 보고 전용 3역. `examples/apch/harness.json`의 workspaces는 **web → admin → backend** 순이므로 기대값은 `["pm","web-dev","admin-dev","backend-dev","plan-verifier","doc-auditor","feature-scout"]`로 바꾼다(ApcH와 web/admin 순서만 다르다).
  2. **`identityFor("backend-dev")`**(같은 파일 `:387-391`)는 `{role:"백엔드 개발", emoji:"⚙️"}`를 `deepEqual`한다. 그 값은 삭제하는 ApcH `known-agents.ts`의 dev별 고정 identity에서 온다. 우리 모델에선 워크스페이스 에이전트가 generic `{role:"개발", emoji:"🛠️"}`이므로 그 기대값으로 바꾼다. 고정 4역(`pm`·`plan-verifier`·`doc-auditor`·`feature-scout`)의 identity 단언은 그대로 통과한다.

  고친 케이스 이름과 최종 누적 수를 커밋 메시지에 적는다.
- [ ] **Step 4: 커밋** `feat(web): port journey/briefing/sprites models from ApcH admin (DB-row adapter, no run-plan)`

### T1.14: 웹 — 보드 화면·항목 상세

**Files:**
- Create: `src/fsd/pages/project-board/ui/project-board-page.tsx`, `src/fsd/pages/project-board/ui/{journey-stepper,pixel-office,pixel-sprite,agent-avatar,owner-banner}.tsx`(ApcH 이식 **5개**), `src/fsd/pages/project-board/index.ts`, `src/fsd/pages/board-item/**` + `index.ts`, `src/app/(app)/p/[slug]/page.tsx`, `src/app/(app)/p/[slug]/items/[key]/page.tsx`
- **경로는 C14 정렬표를 따른다.** 특히 `ui/_component/`는 **쓰지 않는다** — 허용 segment가 아니라 `verify:fsd`가 실패한다. 다섯 컴포넌트를 `ui/` 바로 아래 평탄하게 둔다. route 파일은 얇은 adapter로 두고 화면은 page slice의 public API로 넘긴다.

- [ ] **Step 1: UI 이식** — **다섯** 컴포넌트 + `ui/index.tsx` 복사. 치환: `~/` → `@/`; `PipelineRunControl`·`PipelineCommandButton`·`deskCommandFor`(Phase 3) **제거**; `agentProfileHref` 링크 제거(책상은 텍스트만). **`OwnerBanner`는 유지한다** — ApcH에서 임포트가 `gridToRects` 하나뿐이라 GitHub·이슈 의존이 없다(`owner-banner.tsx:1`). 나머지 임포트는 전부 조달된다: `cn`←T1.12, `AgentReport`·`DocLink`←T1.13, gate 익스포트←T1.12.

  **평탄화하면 상대 경로 깊이를 반드시 같이 고친다(빠뜨리기 쉬운 곳).** ApcH는 이 파일들이 `ui/_component/`에 한 단계 더 들어가 있어 `../../model/*`로 올라간다 — 실측: `agent-avatar:2`·`journey-stepper:2`·`owner-banner:1`·`pixel-sprite:6`·`pixel-office:6,13` **다섯 전부**. C14가 `ui/` 바로 아래로 평탄화하므로:
  - 다섯 컴포넌트의 `../../model/…` → **`../model/…`**
  - `ui/index.tsx`의 `./_component/{agent-avatar,journey-stepper,owner-banner,pixel-office}` → **`./{…}`**

  고치지 않으면 `../../model/sprites`가 `pages/model/sprites`로 해석돼 `verify:fsd`가 `fsd/no-cross-slice-import`·`fsd/no-deep-import`로 잡고(실측 재현), `tsc`는 module-not-found를 낸다.
- [ ] **Step 2: `p/[slug]/page.tsx`** — 자기 `requireMember(slug)`(T1.10 주석) → `latestBoard(projectId)` + `report`(`prisma.report.findMany` where boardItem.projectId) + `workspace`(= roster) → `toBoardSections` → `buildBriefing(sections, new Date(), roster, docs?)` → 이식한 `PipelinePage`. **`deriveJourney`는 page에서 부르지 않는다** — 항목별 함수라 이식한 `ui/index.tsx`가 카드마다 부른다(T1.13 Interfaces). `params`는 `await`(Next 16). 미결 현황(개수·N일째)은 briefing의 `daysOnBoard` 그대로.
- [ ] **Step 3: `items/[key]/page.tsx`** — 자기 `requireMember(slug)` → `getWithHistory(projectId, key)` → 상태·근거·결과(누적)·검증, 이벤트 타임라인(at·actor·from→to·note), 계획서·보고 링크(GitHub blob), 없으면 404.
- [ ] **Step 4: 확인** — T1.12에서 만든 항목이 보드에 날짜 섹션으로 보인다. 결재함 도장 후 새로고침 없이(revalidatePath) 보드가 바뀐다. `npm run check`.
- [ ] **Step 5: 커밋** `feat(web): board page (journey/office) and item detail`

### T1.15: 플러그인 — 템플릿 `plugin/templates/ko/`

스펙 Task 1.10 「템플릿」 절차 + §9 수단 치환. ApcH 원본 → 파라미터화 → 실증 산문은 `docs/architecture/rationale.md` → 파일 동작을 MCP 도구로 → `tools:`를 역할별 허용 도구로.

**Files:**
- Create: `plugin/templates/ko/CLAUDE.runbook.md`, `plugin/templates/ko/agents/{pm,dev,plan-verifier,doc-auditor,feature-scout}.md`, `plugin/templates/ko/docs/plans/{README,template,verification-paths}.md`, `plugin/templates/ko/docs/agents/README.md`, `plugin/templates/templates.test.mjs`
- Modify: `package.json` `test` 패턴에 `"plugin/templates/*.test.mjs"` 추가

**Interfaces (Produces):** 템플릿 변수는 T1.4 `buildVars`/`buildWorkspaceVars` 키만 쓴다. `tools:` 줄 계약(정확히 이 집합):

| 템플릿 | `tools:` |
| --- | --- |
| `pm.md` | `mcp__harness__backlog_list, mcp__harness__board_list, mcp__harness__board_propose` (파일 도구 0) |
| `dev.md` | `Read, Write, Edit, Glob, Grep, Bash, mcp__harness__backlog_get, mcp__harness__board_get, mcp__harness__board_transition, mcp__harness__plan_submit, mcp__harness__report_submit` |
| `plan-verifier.md` | `Read, Glob, Grep, Bash, Skill, mcp__harness__board_get` (C12) |
| `doc-auditor.md` | `Read, Glob, Grep, mcp__harness__backlog_list` |
| `feature-scout.md` | ApcH 원본의 읽기·웹 도구 그대로, `mcp__harness__*` 없음, `Write`·`Edit` 없음 |

- [ ] **Step 1: 테스트 `templates.test.mjs`**

```js
// 렌더 스냅샷: ApcH 예시로 전 템플릿을 렌더해 (1) 미치환 없음 (2) tools: 집합이 역할별 계약과 같음 (3) 상태 파일 참조 없음.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseHarnessConfig } from "../../packages/core/config.mjs";
import { renderTemplate } from "../../packages/core/render.mjs";
import { buildVars, buildWorkspaceVars } from "../../packages/core/vars.mjs";

const cfg = parseHarnessConfig(readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8"));
const tpl = (rel) => readFileSync(new URL(`./ko/${rel}`, import.meta.url), "utf8");
const tools = (md) => (/^tools:\s*(.+)$/m.exec(md)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean).sort();
const MCP = (...t) => t.map((x) => `mcp__harness__${x}`);

const EXPECTED = {
  "agents/pm.md": MCP("backlog_list", "board_list", "board_propose"),
  "agents/plan-verifier.md": ["Bash", "Glob", "Grep", "Read", "Skill", ...MCP("board_get")],
  "agents/doc-auditor.md": ["Glob", "Grep", "Read", ...MCP("backlog_list")],
};
const DEV = ["Bash", "Edit", "Glob", "Grep", "Read", "Write", ...MCP("backlog_get", "board_get", "board_transition", "plan_submit", "report_submit")];
const ALL = ["CLAUDE.runbook.md", "agents/pm.md", "agents/plan-verifier.md", "agents/doc-auditor.md", "agents/feature-scout.md",
  "docs/plans/README.md", "docs/plans/template.md", "docs/plans/verification-paths.md", "docs/agents/README.md"];

describe("templates", () => {
  const vars = buildVars(cfg);
  it("render with no leftover {{ }} and no state-file references", () => {
    for (const rel of ALL) {
      const out = renderTemplate(tpl(rel), vars);
      assert.doesNotMatch(out, /\{\{/, rel);
      assert.doesNotMatch(out, /PROJECT_BOARD\.md|TASK_BACKLOG\.md|release-checks\.md/, rel);
    }
    for (const ws of cfg.workspaces) assert.doesNotMatch(renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(cfg, ws)), /\{\{/);
  });
  it("tools: lines match the per-role contract exactly", () => {
    for (const [rel, expected] of Object.entries(EXPECTED)) assert.deepEqual(tools(renderTemplate(tpl(rel), vars)), [...expected].sort(), rel);
    assert.deepEqual(tools(renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(cfg, cfg.workspaces[0]))), [...DEV].sort());
    const scout = tools(renderTemplate(tpl("agents/feature-scout.md"), vars));
    assert.ok(scout.every((t) => !t.startsWith("mcp__harness__") && t !== "Write" && t !== "Edit"), scout.join(","));
  });
  it("dev template carries workspace verify commands and roster", () => {
    const out = renderTemplate(tpl("agents/dev.md"), buildWorkspaceVars(cfg, cfg.workspaces[2]));
    assert.match(out, /python -m unittest discover/);
    assert.match(out, /`web-dev`/);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test` → FAIL(템플릿 없음)
- [ ] **Step 3: 템플릿 작성** — 원본 `C:/Users/hamso/OneDrive/Desktop/git/ApcH/{.claude/agents/*.md, CLAUDE.md, docs/plans/*, docs/agents/README.md}`에서:
  1. **파라미터화**: 프로젝트명 → `{{project.name}}`, roster 표 → `{{roster_table}}`, 이름 나열 → `{{roster_names}}`, `dev` 계열(web/admin/backend-dev 셋을 하나로) → `{{ws.agent}}`·`{{ws.path}}`·`{{ws.knowledge}}`·`{{ws.verify_block}}`·`{{ws.verify_result_line}}`·`{{ws.read_only_list}}`·`{{ws.out_of_scope_list}}`, 보드 브랜치 → `{{board_branch}}`, scout 질문 → `{{scout.question}}`.
  2. **수단 치환**(스펙 §9 표): pm의 두 파일 읽기 → `backlog_list`·`board_list({open:true})`, 보드 행 쓰기 → `board_propose`(형식 블록 삭제 — 서버가 행을 만든다); dev A-2 → `backlog_get`, A-4 → `plan_submit` 후 `board_transition({to:"검토대기"})`, 보류 → `board_transition({to:"보류", result})`, B-6 → `report_submit` 후 `board_transition({to:"완료", result})`, B-7 백로그 제거 절 삭제(서버 자동), "보드 커밋·푸시" 문장 삭제(계획서·기록·코드만 커밋); plan-verifier 브리핑에 `board_get` 허용; doc-auditor 백로그 읽기 → `backlog_list`.
  2b. **런북(`CLAUDE.runbook.md`)은 9단계를 단계별로 손본다** — "보드 갱신을 도구 호출로"만으로는 부족하다(실측: ApcH `CLAUDE.md`의 7·8단계가 Phase 1에 없는 것을 지시한다):
   - **문서 지도**: `PROJECT_BOARD.md`·`TASK_BACKLOG.md`·`docs/release-checks.md` 행 삭제 → "보드·백로그·결재는 웹" 한 줄. `docs/plans/`·`docs/agents/`·`.claude/agents/`·`apps/*/CLAUDE.md` 행은 유지.
   - **1~6단계**: 보드 읽기·쓰기를 위 도구 호출로. 게이트①② 문구는 그대로(웹에서 연다).
   - **7단계**: "보드 안내 블록의 인수 조건 다섯" → **`docs/architecture/protocol.md`의 인수 다섯 조건**으로 참조를 옮긴다(T0.3 Step 3). 그리고 「범위 밖 의존」 후속을 "`TASK_BACKLOG.md`에 등재한다" → **"웹 백로그에 사용자가 등재한다"**(백로그 편집은 웹 전용이라 에이전트도 메인 루프도 못 쓴다).
   - **8단계(배포 확인 원장 등재)**: **통째로 삭제한다.** `docs/release-checks.md`도 `release-verify` 루틴도 Phase 3다. 삭제하면 런북은 **8단계**가 된다 — 남은 단계 번호를 다시 매긴다.
   - **9단계(doc-auditor·feature-scout)**: 유지. 8단계 삭제로 번호만 8이 된다.

   Step 1의 스냅샷 테스트가 이 둘을 **강제한다** — 렌더 결과에 `PROJECT_BOARD.md|TASK_BACKLOG.md|release-checks.md`가 남아 있으면 실패하는데, 7단계의 "`TASK_BACKLOG.md`에 등재"와 8단계 전체가 정확히 거기 걸린다. 즉 테스트가 빨간 것을 보고 여기로 돌아오게 되어 있다.
  3. **실증 산문 이동**: FEAT-xx 사례·BUG-xx 실측 문단은 `docs/architecture/rationale.md`로 옮기고 템플릿엔 규칙만.
  4. `tools:` 줄을 위 계약표대로.
  5. **`feature-scout.md`의 두 표를 구분해서 다룬다**(실측: 이 파일이 `apps/*`를 가장 많이 참조한다). 「담당 표」(`apps/web | web-dev` …)는 `{{roster_table}}`로 그대로 치환된다. 하지만 **「읽을 곳」 표**(경로 → *거기서 무엇을 볼지*)는 대응하는 변수가 없다 — `roster_table`은 `agent | 경로/**`만 준다. 새 변수를 만들지 말고, 그 표를 **roster 기반의 일반 문장**으로 바꾼다: "각 워크스페이스(`{{roster_table}}`)의 코드와 그 워크스페이스의 지식 문서를 읽는다. 무엇을 볼지는 `{{scout.question}}`이 정한다." ApcH 고유의 항목별 설명(팟캐스트·Gemini·렌더러…)은 3번 규칙대로 rationale로 뺀다.
- [ ] **Step 4: 통과** — `npm test` → `# pass 47`(44+3)
- [ ] **Step 5: 골든 diff 기록** — 세 워크스페이스로 렌더한 `dev.md`와 ApcH 원본 `{web,admin,backend}-dev.md`의 diff를 `docs/architecture/rationale.md` 「골든 diff」에 요약: 잔차가 (i) 유래 이동 (ii) knowledge 이동 (iii) 변수 형식 (iv) 수단 치환 **넷뿐**인지. 다섯째 부류가 나오면 템플릿을 고친다.

  **미리 아는 잔차 — 이건 "다섯째 부류"가 아니라 알려진 예외로 기록한다. 실측(2026-08-29)으로 세 dev 정의는 골격이 같지 않다:**

| 파일 | 줄 | `##` 절 | 공통 골격에 없는 것 |
| --- | --- | --- | --- |
| `web-dev.md` | 186 | 9 | 없음 — 이것이 공통 골격이다 |
| `admin-dev.md` | 210 | 10 | `## UI 작업이면 frontend-design 스킬을 로드한다`(admin `:55`) + `tools:`의 `Skill` |
| `backend-dev.md` | 231 | 10 | `## 순수 모듈 규칙 — 이 에이전트의 핵심 제약`(backend `:42`) |

  (절 수는 `grep -cE '^## '` 기준이다 — `# 역할` 제목은 절이 아니다. T0.3의 「계획서 절 7개」와 같은 세는 법.)

  두 절은 장식이 아니다. admin 쪽은 "UI 항목이면 계획 전·구현 전에 `frontend-design`을 로드하고 디자인 방향을 계획서 절로 남긴다"는 **절차 규칙**이고(그래서 `Skill` 도구가 붙어 있다 — 절과 도구는 한 몸이다), backend 쪽은 "판단 로직을 stdlib만 쓰는 모듈로 떼어낸다 + 금지 import 목록 + `backend-purity-contract` 토큰"이라는 **검증 게이트의 전제**다. 통일 템플릿은 이 둘을 **떨어뜨린다.**

  **Phase 1 결정: 떨어뜨린 채 간다.** Phase 1의 스모크 저장소는 워크스페이스가 하나(`dev`)뿐이라 잃을 절이 없고, 스펙 §9의 dev 도구 목록도 그대로 지킨다(도구 추가는 권한 확대라 임의로 하지 않는다). 대신 **이 표를 `docs/architecture/rationale.md` 「골든 diff」에 그대로 남긴다.**

  **Phase 2로 넘기는 결정(별도 제안서에서 답할 것):** ApcH를 첫 테넌트로 붙일 때 이 두 절을 어떻게 되살릴지 — (a) `harness.json` 워크스페이스에 `extra` 절 경로/본문 필드를 추가, (b) 워크스페이스별 템플릿 오버레이 파일, (c) 되살리지 않고 각 워크스페이스 `CLAUDE.md`(= `ws.knowledge`)로 옮김. **Phase 1에서 고르지 않는다** — 셋 다 `harness.json` 스키마나 생성기 계약을 건드려서 여기 범위 밖이다.
- [ ] **Step 6: 커밋** `feat(plugin): ko templates — MCP-based agents, runbook, plan/agent conventions`

### T1.16: 플러그인 — 생성기 `harness-init.mjs` + `/harness:init` 스킬

**Files:**
- Create: `plugin/bin/harness-init.mjs`, `plugin/bin/harness-init.test.mjs`, **`plugin/skills/init/SKILL.md`**(폴더 이름이 곧 명령 이름 — C13), `.claude-plugin/marketplace.json`(저장소 루트), `scripts/check-plugin-lib.mjs`, `plugin/lib/*.mjs`(동기화 산출)
- Modify: `package.json`(`test`에 `"plugin/bin/*.test.mjs"`, `check`에 `&& node scripts/check-plugin-lib.mjs`)

**Interfaces (Produces):** CLI `node harness-init.mjs [--config harness.json] [--root .] --server <url> [--adopt] [--dry-run]`, 종료코드 0/1/3(스펙). 생성물 = 스펙 §4 표(보드·백로그·원장·스크립트 없음). `.mcp.json`은 `mcpServers.harness`만 병합.

- [ ] **Step 1: 테스트** — 스펙 Task 1.10 Step 1 코드 그대로(`--server https://h.example`를 이미 넘긴다).
- [ ] **Step 2: 실패 확인** — `npm run sync:plugin-lib && node --test plugin/bin/harness-init.test.mjs` → FAIL
- [ ] **Step 3: 구현** — 스펙 Task 1.10 Step 3 코드 그대로, **한 줄만 교체**(C11):

```js
const SERVER = (opt("--server", process.env.HARNESS_SERVER) ?? "").replace(/\/$/, "");
// config 파싱 직후에 추가:
if (!SERVER) { console.log("서버 URL 필요: --server <url> 또는 HARNESS_SERVER (웹 토큰 페이지에 표시된 값)"); process.exit(1); }
```

- [ ] **Step 4: `scripts/check-plugin-lib.mjs`** — `plugin/lib`가 `packages/core`와 바이트 동일한지(드리프트면 exit 1):

```js
import { readdirSync, readFileSync } from "node:fs";
let drift = 0;
for (const f of readdirSync("packages/core")) {
  if (!f.endsWith(".mjs") || f.endsWith(".test.mjs")) continue;
  let lib = null; try { lib = readFileSync(`plugin/lib/${f}`, "utf8"); } catch {}
  if (lib !== readFileSync(`packages/core/${f}`, "utf8")) { console.log(`drift: plugin/lib/${f}`); drift++; }
}
if (drift) { console.log("run: npm run sync:plugin-lib"); process.exit(1); }
console.log("plugin/lib in sync");
```

- [ ] **Step 4b: `.claude-plugin/marketplace.json`** (저장소 루트 — C13). `claude plugin marketplace add`가 이 파일을 요구한다. `source`는 marketplace 파일 기준 상대경로다.

```json
{
  "name": "stagekeeper-local",
  "owner": { "name": "Sangeok" },
  "plugins": [
    { "name": "harness", "source": "./plugin", "description": "사람이 게이트를 쥐는 에이전트 개발 파이프라인 — 저장소를 하니스 서비스에 연결한다" }
  ]
}
```

- [ ] **Step 5: `SKILL.md`** — 스펙 Task 1.10 Step 5 그대로 **`plugin/skills/init/SKILL.md`** 에 넣고(C13 — 폴더가 `init`이라야 명령이 `/harness:init`이 된다), **세 곳을 고친다**: (i) 2단계 명령에 `--server <웹 토큰 페이지의 MCP URL에서 /api/mcp를 뺀 값>`을 넣는다(C11). (i-b) frontmatter의 `name: harness-init` → **`name: init`** — 폴더명과 맞춘다. 명령 이름은 폴더가 정하므로 안 맞춰도 로드는 되지만, 스킬이 스스로를 `harness-init`이라 부르면서 명령은 `/harness:init`인 상태가 된다. (ii) 4단계의 재시작 안내에 **최초 승인**을 덧붙인다 — 재시작 뒤 `/mcp`에서 `harness`가 `⏸ Pending approval`로 보이면 프로젝트 스코프 MCP 서버의 1회 승인 절차이므로 사용자가 승인해야 하고, 거절했다면 `claude mcp reset-project-choices`로 초기화한다. 이 단계를 빼면 `project_get`이 이유 없이 실패하는 것처럼 보인다(Claude Code 문서 확인 사항, §Risks).
- [ ] **Step 6: 통과** — `npm run sync:plugin-lib && npm test` → `# pass 53`(47+6). `npm run check`(plugin/lib in sync).
- [ ] **Step 7: 커밋** `feat(plugin): harness-init generator, /harness:init skill, lib sync check` (`plugin/lib/*.mjs` 포함 — marketplace 설치는 `plugin/`만 복사한다)

### T1.17: 빈 저장소 실측 — Phase 1 완료 기준

스펙 Task 1.11 그대로. 명령만 이 저장소 기준.

- [ ] **Step 1:** `npm run dev`(로컬). 웹 GitHub 로그인 → 프로젝트 `harness-smoke` 등록(owner/repo = 실제 빈 GitHub 저장소) → 토큰 1회 표시 → `HARNESS_TOKEN`으로 저장.
- [ ] **Step 2a: 플러그인 로드** — 둘 중 하나(어느 쪽이든 이후 절차는 같다).
  - **1차, 권장(문서상 개발용 경로):** 빈 저장소에서 `claude --plugin-dir <stagekeeper 경로>/plugin` — 그 세션에만 로드되고 marketplace도 설치도 필요 없다.
  - **2차, 영속 설치:** `claude plugin marketplace add <stagekeeper 경로>` → `claude plugin install harness@stagekeeper-local`. T1.16 Step 4b의 루트 `.claude-plugin/marketplace.json`이 있어야 동작한다.
  - 로드됐는지는 `/harness:init`이 명령 목록에 보이는지로 확인한다(폴더가 `skills/init/`이라 이 이름이다 — C13).
- [ ] **Step 2b: 연결** — `/harness:init`(워크스페이스 1개 `.`, agent `dev`, 검증 `node --test`, `--server http://localhost:3000`) → Claude Code **재시작**(`.mcp.json`은 세션 시작 시에만 읽힌다. `--plugin-dir`로 로드했다면 재시작할 때 그 플래그를 다시 준다) → `/mcp`에서 `harness` **승인**(`⏸ Pending approval`) → `mcp__harness__project_get` 성공 → `project_sync`. 로컬 `http://` URL은 문서상 허용된다.
- [ ] **Step 3:** 웹 백로그에 `FEAT-01: README에 설치 방법 한 절 추가`.
- [ ] **Step 4: 사이클 1회** — 런북대로: `pm`(→ `승인대기`) → **웹 도장 `계획지시`** → `dev`(계획서·커밋 → `plan_submit` → `검토대기`) → 카탈로그 경로 수동 → `plan-verifier` 무편집 무소득 → `validation_record` → **웹 도장 `구현승인`** → `dev`(구현·검증·`report_submit`·`완료`) → **인수 다섯 조건 재현**(`docs/architecture/protocol.md`, T0.3 Step 3에 옮겨 둔 것) → `doc-auditor`.
- [ ] **Step 5: 완료 기준** — 웹: `완료`·`검증:`·이벤트 8건 이상·백로그에서 FEAT-01 제거됨. 저장소: `docs/plans/FEAT-01.md`·`docs/agents/dev/FEAT-01.md`·`docs/agents/main-loop/FEAT-01.md`, `git status` 청결. **에이전트가 게이트를 시도하면 도구가 없어 실패** — `dev` 세션에서 `board_transition({to:"계획지시"})`를 일부러 호출해 `not allowed` 응답을, 그리고 `mcp__harness__gate_*` 같은 도구가 목록에 없음을 기록. 이때 서브에이전트 `tools:` 제한이 실제로 개별 도구 단위로 먹는지도 함께 관측한다(§Risks의 문서 공백).
- [ ] **Step 5b: 인가 격리** — Verification Plan의 「인가 격리」 표 4행을 그대로 실행하고 결과를 기록한다(두 번째 GitHub 계정 필요). 하나라도 404가 아니면 Phase 1 미완으로 본다.
- [ ] **Step 6: 결과를 규약대로 나눠 적는다** — 실측 로그를 `rationale.md`에 몰아넣지 않는다. `docs/test-reports/README.md`의 Classification이 "기능 인수, 회귀, **smoke test**, release gate와 contract acceptance 결과"와 "수동 테스트와 자동 명령을 합친 판정 보고서"를 이 디렉터리 것으로 규정하는데, 이 태스크가 정확히 그것이다. 반면 `docs/architecture/`는 "현재 적용할 구조와 규칙만" 두는 곳이다.
  - **실행·판정 기록** → `docs/test-reports/active/phase-1-smoke-acceptance.md`. front matter는 그 디렉터리 `template.md`를 따르고 `report-kind: acceptance`(스모크 겸 인수), `test-levels`에 `end-to-end`·`manual`, `tested-revision`에 커밋 해시, `result`는 `pass`/`fail`/`blocked`. Step 5·5b의 항목별 판정과 증거를 여기 남긴다. 끝나면 `completed/YYYY-MM-DD-…`로 옮긴다.
  - **설계가 무엇을 증명했나(왜)** → `docs/architecture/rationale.md` 「첫 스모크」에 **요약 몇 줄 + 위 보고서 링크**만.
  - 이 제안서의 Verification Results도 갱신.
  - 커밋 `docs: phase-1 smoke acceptance report`.

---

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `app/` → `src/app/` | move | Next 16 `src/` 규약. 루트 `app/`이 남으면 `src/app` 무시 | low — 파일 4개, T0.1 Step 9로 확인 |
| `tsconfig.json`, `package.json`, `.gitignore` | update | 별칭·스크립트·생성물 제외 | low |
| `eslint.config.mjs` | update | 무인자 `eslint`가 `.` 전체를 린트한다(실측) → 생성물 `src/generated/**`·`plugin/lib/**` 무시 | low — T0.2 Step 6 |
| `prisma.config.ts`, `prisma/**`, `src/generated/prisma/**`(gitignore) | create | Prisma 7 형식 | medium — 마이그레이션은 DB 상태 변경 |
| `src/server/db.ts`, `src/server/pipeline/**`, `src/server/mcp/**`, `src/server/auth/**` | create | 서비스 코어 | medium — 인증·API 계약 |
| `src/proxy.ts`, `src/app/api/{auth,mcp}/**`, `src/app/login`, `src/app/(app)/**` | create | 라우팅·인증 경계 | medium |
| `src/fsd/**` | create | ApcH admin 이식 + 신규 기능 | low — 화면 |
| `packages/core/*.mjs` (+test) | create | 순수 모듈 8개, 의존성 0 | none — 44 테스트 |
| `plugin/**`, `.claude-plugin/marketplace.json`(루트), `scripts/*.mjs`, `examples/apch/harness.json` | create | 플러그인·로컬 marketplace·동기화 | low |
| `docs/architecture/*.md` | create | T0.3 문서 골격(`docs/`의 나머지는 `8289320 init`에 이미 커밋됨) | none |
| `README.md` | **건드리지 않음** | 이미 제품 설명·문서 목차·검증 명령을 갖춘 문서다. 덮어쓰면 소실(T0.1 Step 8 주석) | none |
| `docs/ADR/README.md` | 건드리지 않음 | ADR 목록은 이미 `0001`이 등재됨. 이 제안서는 ADR을 만들지 않는다 | none |

## Safety Analysis

- **라우팅 경계**: `app/` → `src/app/` 이동은 Next 문서(`src-folder.md`)가 지원하는 경로. 루트에 `app/`·`pages/`가 남지 않는 것을 T0.1에서 확인. `route.ts`(`/api/mcp`, `/api/auth/[...nextauth]`)와 `page.tsx`가 같은 세그먼트에 겹치지 않는다.
- **인증 경계**: `proxy.ts` matcher가 `/api`를 제외하므로 MCP는 Bearer만, 웹은 JWT 세션만 검사한다. 게이트·백로그 편집 서버 액션은 모두 `requireMember` 뒤에 있고, MCP 서버에는 그 도구가 등록되지 않는다(T1.9 테스트가 집합 동일성을 단언).
- **인가는 목적지에서**: `proxy.ts`와 레이아웃은 로그인 여부만 거른다. **프로젝트 소유권(object-level)은 데이터를 읽는 page·서버 액션이 각자 `requireMember(slug)`로 판정**하고, 그 반환 `projectId`로만 조회한다 — 레이아웃 한 번에 기대지 않는 이유는 Next 문서가 DAL을 요구하기 때문(T1.10 주석). MCP 쪽은 토큰 → `projectId` 스코프가 모든 `board.*`·`backlog*` 조회의 `where`에 들어간다. 비멤버는 404(존재를 드러내지 않음).
- **동시성**: `propose`는 `Serializable`(미결 ≤ 2 상한 보호), `transition`·`discard`는 항상 `updatedAt` CAS. 근거와 나머지 물음은 T1.7의 「상태 변경 안전성」 표.
- **API 계약**: 도구명·입력·효과는 스펙 §5. Phase 3 도구(`command_*`, `release_*`)는 미등록 — 스키마의 `Command` 테이블만 선행.
- **DB**: 초기 마이그레이션 1개. 데이터 없는 상태에서 적용. `discardedAt` 추가는 스펙 스키마 확장(C9).
- **생성물·비밀**: 토큰 평문은 저장·로그하지 않는다(해시만). `.env*` gitignore. `src/generated/` gitignore.
- **의존성 버전**: `prisma`는 `latest`가 8 RC라 고정 필수(Global Constraints).
- **테스트/스크립트 참조**: 순수 모듈 테스트는 `examples/apch/harness.json`을 상대경로로 읽는다 — T0.1에서 먼저 만든다.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 (`src/` 이동, `route.ts`/`page.tsx` 충돌 없음)
- [x] 정적 `import` / `export from` (별칭 두 개, `.mjs` from TS는 `allowJs`)
- [ ] dynamic `import()` 또는 lazy loading — 해당 없음(사용 계획 없음)
- [ ] barrel export(`index.ts`) 경유 참조 — 신규 코드에 barrel을 두지 않는다
- [x] 테스트와 스크립트 참조 (스크래치패드 49/49 재실행, 픽스처 경로)
- [x] 타입 선언, 전역 선언, ambient module 영향 (`next-auth.d.ts` 증강, Next `LayoutProps`/`PageProps` 헬퍼는 `next typegen`)
- [x] 런타임 side effect 또는 초기화 코드 (`db.ts` 싱글턴, `proxy.ts` 전 경로 실행 — DB 조회 없음)
- [x] API, 외부 SDK 영향 (GitHub OAuth 앱 필요, Neon 연결 문자열)

## Approval

승인 기록의 단일 기준은 front matter입니다. 이 섹션에는 승인 조건과 참고 메모만 적습니다.

승인 메모:

- 승인 전. 「착수 전 확인」 D-A~D-E는 기본값으로 진행하며, 승인 시 뒤집는 항목이 있으면 `approval-scope`에 적는다.
- 승인 범위 제안: "Phase 0·1 전 태스크(T0.1~T1.17), 이 저장소 한정, ApcH 무변경".

## Execution Plan

1. **T0.1 → T0.2** 순차(레이아웃 → 의존성). 여기까지 하루 안.
2. 병렬 묶음 A: **T0.3 · T1.1 · T1.2 · T1.3 · T1.4 · T1.5 · T1.6** — 서로 독립. 서브에이전트에 태스크당 하나씩 배정 가능(`superpowers:subagent-driven-development`), 각 태스크는 자기 테스트 명령으로 종료.
3. **T1.7**(T1.1·T1.6 뒤) → **T1.9**(T1.5·T1.7 뒤). 동시에 **T1.8**(T1.6 뒤).
4. **T1.10 → T1.11 → T1.12** 순차(웹 화면은 앞 화면의 데이터에 기댄다). **T1.13**은 T1.10·T1.11과는 병렬이지만 **T1.12의 `gate.ts`를 기다린다**(위 「병렬 가능」). 완전 병렬로 돌리려면 `gate.ts`를 T1.12 착수 시 가장 먼저 만들어 T1.13에 풀어 준다.
5. **T1.14**(T1.12·T1.13 뒤).
6. **T1.15**(T1.4 뒤, 어느 때나) → **T1.16**.
7. **T1.17** 스모크 — 전부 끝난 뒤, 사람이 게이트를 연다.
8. 태스크당 커밋 1개(메시지는 각 태스크 마지막 Step). 리뷰 게이트: 태스크마다 **그 시점에 존재하는** 검증 명령을 다 돌린 출력이 있어야 다음 태스크로 — `npm run check`는 T0.1부터, `npm test`도 T0.1부터(빈 글롭은 exit 0), **`npm run test:web`은 T0.2 Step 6에서 스크립트가 생긴 뒤부터**다. 없는 스크립트를 부르면 `Missing script`로 실패한다.
9. Phase 1 완료 후 이 문서를 `completed/`로 옮기고, Phase 2 제안서를 새로 연다.

## Verification Plan

실행할 검증:

```bash
npm test          # packages/core (44) + plugin/bin (6) + plugin/templates (3) = 53
npm run test:web  # board-rules (12) + auth base (2) + mcp tools/auth (4) + 이식 모델(journey 11·sprites 15·briefing N)
npm run check     # eslint && tsc --noEmit && check-plugin-lib
npx prisma migrate status
```

검증 기준:

- 위 네 명령이 모두 exit 0. 테스트 수는 각 태스크에 적힌 누적치와 일치.
- T1.9 계약 테스트가 **게이트 도구 부재**를 단언하고 통과한다(불변식 4 회귀 가드).
- T1.17 Step 5(웹 상태·저장소 산출물·게이트 시도 실패·트리 청결)와 **Step 5b(인가 격리 4행)** 전부 충족.
- 기존 실패 없음(저장소가 초기 상태). 새 실패는 전부 신규 실패다.

**인가 격리 — 자동 명령으로 안 잡히므로 T1.17에서 손으로 확인한다(High-Risk 목적지 검사):**

| 확인 | 기대 | 어디서 |
| --- | --- | --- |
| 두 번째 GitHub 계정으로 로그인해 남의 `/p/<slug>`·`/inbox`·`/backlog`·`/items/<key>` 직접 접근 | **전부 404**(리다이렉트나 빈 화면이 아니라) — 각 page의 `requireMember` | T1.17 Step 5 |
| 남의 프로젝트 slug로 게이트 서버 액션 호출 | 404 — 액션의 `requireMember` | 〃 |
| 프로젝트 A 토큰으로 프로젝트 B의 key를 `board_get`·`board_transition` | `no such …` (모든 조회가 토큰의 `projectId`로 스코프) | 〃 |
| 미로그인 상태로 `/p/<slug>` | `/login`으로 리다이렉트 — `proxy.ts` | 〃 |

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 스크래치패드 `node --test packages/core/*.test.mjs plugin/bin/*.test.mjs`(스펙 코드 + v1 모듈 + 스텁 템플릿) | **49/49 pass** (2026-08-29, Node 22.13.1) | 제안서 작성 시 재실행. 실제 템플릿·MCP 라우트·웹은 여전히 미검증 |
| 스크래치패드 `prisma generate` + `tsc --noEmit`(Prisma 7.10.0 실제 생성 클라이언트에 대한 API 프로브) | **exit 0** (2026-08-29) | `Prisma.TransactionClient`·`isolationLevel:"Serializable"`·`distinct`+`orderBy`·`updateMany` 스칼라 리스트/CAS·`include._count` 통과. DB 접속 없이 generate 성공 |
| `node --test` 빈 글롭 | **exit 0, `# tests 0`** | T0.1에서 스크립트를 미리 넣어도 안전 |
| `npx eslint --debug` (이 저장소) | `Using file patterns: .` | 무인자 실행이 저장소 전체를 린트 → 생성물 무시 필요(T0.2 Step 6) |
| 스크래치패드 `tsc --noEmit` — 이 제안서의 tsconfig(`paths`+`allowJs`+`bundler`)로 `.ts`가 `@harness/core/*.mjs`를 임포트 | **exit 0** (2026-08-29) | 별칭이 `.mjs`를 가리켜도 해석된다. `npm run check`(T1.7·T1.9)의 전제 |
| 스크래치패드 `node --import tsx --test` — `.mjs` 테스트 → `.ts` 모듈 → 별칭 `.mjs` | **3/3 pass** | `board-rules.test.mjs`(T1.7 Step 4)가 도는 경로를 그대로 재현 |
| 스크래치패드 `next build` (Next 16.3.3) — `src/` 밖 `packages/core/*.mjs`를 별칭으로 임포트하는 `server-only` 모듈 + `/api/mcp` route | **exit 0**, `/api/mcp` = ƒ(동적) | 번들러도 별칭 `.mjs`를 처리한다. T0.1 레이아웃 + T1.9 라우트의 전제 |
| ApcH `.claude/agents/*.md`의 `tools:` 줄 실측 | pm `Read, Edit` · plan-verifier `…, Skill` · doc-auditor `Read, Glob, Grep` · feature-scout `…, WebSearch, WebFetch` · dev 3종(admin-dev만 `Skill`) | T1.15 `tools:` 계약이 전부 충족 가능함을 확인. admin-dev의 `Skill`은 알려진 잔차(T1.15 Step 5) |
| ApcH `docs/plans/template.md` 절 수 실측 | `##` **7개** | T0.3 Step 3의 "8개"가 틀렸음 — 7개로 교정 |
| Claude Code 플러그인 로드 경로(공식 문서) | `marketplace add`는 `.claude-plugin/marketplace.json` 필수 · `--plugin-dir`은 무설치 로드 · `skills/<폴더>` 이름이 곧 명령 이름 | C13의 근거. T1.16 Step 4b·T1.17 Step 2a에 반영 |
| ApcH 세 dev 정의의 골격 실측(`grep -cE '^## '`) | web **9**절 · admin **10**절(+`frontend-design`) · backend **10**절(+`순수 모듈 규칙`) | **통일 dev 템플릿이 절 두 개를 떨어뜨린다.** T1.15 Step 5의 「미리 아는 잔차」 표로 기록, 복구는 Phase 2 결정 |
| **`board.ts` 138줄 전체 타입체크** — 스펙 model 10개로 실제 스키마 생성 후 문서의 `db.ts`·`board-rules.ts`와 함께 | **`tsc --noEmit` exit 0** | 서비스 코어가 **처음으로 컴파일 확인됨**(3패스는 API 표면 프로브였다). `$transaction` 콜백 타입·`row._count.reports`·`fail()`과 성공 분기 union·`updateMany` CAS 전부 통과 |
| 문서의 `board-item.ts` 어댑터 추출 실행 | **3/3 pass**, `strict`+`noUncheckedIndexedAccess`로 `tsc` 0 | 날짜 그룹핑 내림차순과 `(byDay.get(day) ?? byDay.set(day,[]).get(day)!)` 관용구가 항목을 잃지 않음 |
| 테스트 확장자를 `fsd.md` 규약(`.test.ts`)에 맞추면? | 이름만 바꿔도 **실행은 30/30 통과**, 그러나 `tsc --strict`에서 **에러 52개**(대부분 `TS18047 'v' is possibly 'null'`) | 이식 테스트 본문을 고쳐야 해서 "손대지 않는다" 원칙과 충돌 → `.test.mjs` 유지를 **근거 있는 의도적 이탈**로 기록(T1.13) |
| **독립 교차검토 #3**(C14 정렬 이후 내용만, 판정 비공개) | **ISSUES 4건 · blocker 0.** 리뷰어가 C14 뼈대를 직접 만들어 `verifyProject` 재현 → **PASS(0 problems)** 로 정렬 주장 확인 | ① 평탄화 시 `../../model/*` 깊이 수정 누락 ② `gate.ts`/`gate-source.ts` 이름 불일치 ③ 테스트 확장자 규약 이탈 ④ Step 4 경고문 자기모순 — 넷 다 반영 |
| 위험 가설 4종을 실측으로 닫음 | ① `packages/core`의 `node:` 빌트인 → **허용**(진짜 npm package만 `core/no-external-dependency`로 잡힘) ② 중간 단계에서 `verify:fsd` → `src/app`만·`src/server`만·`pages` 없는 `features`만 전부 **PASS** ③ 의존 그래프 → **사이클 0, 없는 선행 0**(DAG) ④ 「스펙 Task N.N」 참조 15건 → 전부 C1~C14가 덮음 | 넷 다 결함이 아니었지만, 방치하면 구현 중 "왜 안 되지"로 돌아올 것들이라 닫아 둔다 |
| **내부 상호참조 기계 검사** — 태스크·Step·편차(C*) 앵커를 수집해 문서 전체의 참조를 대조 | 태스크 20 · 편차 C1~C14 · Step 참조 전부 해소. **깨진 참조 2건 발견** — 둘 다 T1.17의 **없어진 옛 Step 2**를 가리켰다(8패스에서 2a·2b로 쪼갠 뒤 남은 dangling) | 각각 2a·2b로 교정. 편차 표가 C12→C14→C13 순이던 것도 오름차순으로 복구 |
| 저장소 자체 게이트 실행(`npm run lint` · `verify:fsd` · `test:architecture`) | 전부 **exit 0**, 아키텍처 테스트 **13/13** | 이 문서의 "기존 실패 없음" 주장이 실측으로 확인됨 — 앞으로 나오는 실패는 전부 신규 실패다 |
| **소스 번들 전수 감사** — 저장소의 제안서 영향 문서·설정 29개를 열거해 읽은 것/안 읽은 것을 대조 | 미독 2건 발견: 루트 `README.md`(이미 다시 쓰여 있었다) · `docs/ADR/0001`. `verify-fsd-boundaries.test.mjs`로 검사기 규칙이 **정확히 10종**임을 확인(9종은 실측, 10번째 `fsd/no-technical-top-level-folder`는 `src/{app,fsd,server,generated}`라 해당 없음) | **T0.1 Step 8이 파괴적이었다** — 이미 문서 목차·검증 명령을 갖춘 README를 두 줄로 덮어쓰라고 지시. 「건드리지 않는다」로 교정. ADR-0001은 모순 없음(오히려 이 제안서를 실행 문서로 링크) |
| `docs/test-reports/README.md` Classification 대조 | "기능 인수, 회귀, **smoke test**, release gate와 contract acceptance 결과"가 그 디렉터리 것 | **T1.17 스모크 기록을 `rationale.md`에 넣게 되어 있었다** → 실행·판정은 `docs/test-reports/`, 「왜」만 rationale로 분리 |
| `CONTEXT.md`·`system-overview.md` 정독(이전 패스들이 빠뜨린 소스) | `CONTEXT.md`가 승인된 ubiquitous language(보드 항목·증거·인수 정의와 `_Avoid_` 목록). `system-overview.md`: "Route Handler와 page는 직접 정책을 재구현하지 않고 `src/server`를 호출한다" | **route.ts가 Prisma를 직접 조회하고 있었다** → 토큰 조회를 `@/server/mcp/deps.ts`로 옮김. 용어 정렬표를 Global Constraints에 추가 |
| **C14 정렬 구조를 실제 `verify-fsd-boundaries.mjs`에 먹여봄** — 정렬표대로 뼈대(pages/features/entities/shared + `src/app` route + `src/server` + `packages/core`)를 만들어 `verifyProject(root)` 실행 | **PASS — 위반 0** | 정렬이 주장이 아니라 실측이다. layer 방향·public API·`api` segment의 `"use server"`→`@/server`·`"use client"` 경계·kebab-case 전부 통과 |
| 같은 뼈대에 **위반 10종을 일부러 주입**(negative test) | **9종 CAUGHT** — `naming/kebab-case`(`_component`) · `fsd/no-deep-import` · `fsd/public-api-required` · `fsd/no-cross-slice-import` · `fsd/server-import-boundary`+`next/no-server-import-in-client` · `server/no-fsd-import` · `core/no-external-dependency`(npm·src 둘 다) · `fsd/layers-import`(상향). **`shared/lib/utils.ts`만 NOT CAUGHT** | 위 PASS가 공허하지 않음을 증명하고, C14가 주장하는 규칙이 전부 실제 게이트임을 확인. 유일한 예외인 `utils.ts` 이름은 검사기가 아니라 `fsd.md` 규약이라 C14 문구를 그에 맞게 교정했다 |
| **저장소 아키텍처 변경 감지**(`git status` + `AGENTS.md` + `docs/architecture/**` + `scripts/verify-fsd-boundaries.mjs` 실측) | FSD가 승인 아키텍처로 채택됨(ADR-0001). `package.json`에 `verify:fsd`·`test:architecture` 신설, `lint`가 경계 검사 포함 | **이 제안서가 어긋나 있었다** — T0.1 Step 4의 scripts 블록이 새 스크립트 셋을 지웠고, `ui/_component/`·deep import·`index.ts` 부재·`shared/lib/utils.ts`가 `verify:fsd`에 걸린다 → **C14로 전면 정렬** |
| 문서의 코드 블록을 **md에서 바이트 그대로 추출**해 실행 | `transitions 7 · backlog-md 2 · board-md 9 · config 11 · render 4 · manifest 6 · vars 3 · token 2` = **core 44/44**, `plugin/bin` **6/6** | 지난 패스의 숫자 전파(42/44/47/53)가 실측과 일치. CRLF 정규화도 문서 원본 바이트로 동작 확인 |
| 독립 실행 시뮬레이션 리뷰(신규 컨텍스트, 판정 비공개) | **ISSUES 2건** — T1.13 briefing 기대값 2개가 새 roster 모델에서 필연 실패(blocker) · feature-scout 「담당 표」 열 구성 불일치(minor) | 첫째는 T1.13 Step 3에 `rosterOrder` 확정 + 고칠 기대값 2개를 명시해 해소. 둘째는 T1.15 Step 3-5가 이미 일반 문장으로 바꾸라 지시 |
| **이 제안서가 직접 쓴 TS 모듈 4개를 스크래치패드에서 실행** — `board-rules.ts`+테스트(12) · `mcp/tools.ts`+테스트(2) · `mcp/auth.ts`+테스트(2) · `auth/config.base.ts`+테스트(2) | **18/18 pass** (2026-08-29, `node --import tsx --test`) | 구현과 테스트가 실제로 맞물린다. 게이트 도구 부재 가드(`registerTools`가 등록한 집합 = `AGENT_TOOL_NAMES`, 웹 전용 11개 부재)와 무스코프 호출 거부가 **실행으로** 확인됨. T1.9까지의 `test:web` 누적 18과 일치 |
| 줄바꿈 — `git ls-files --eol` 실측 + `manifest.mjs` 스크래치패드 재현 | 이 저장소 `core.autocrlf=true`, `.gitattributes` 없음. ApcH에서 `PROJECT_BOARD.md`=`w/crlf`, `.claude/agents/pm.md`=`w/lf`로 **갈려 있다**. 정규화 없는 `hashOf`는 `hashOf("A1\r\n") !== hashOf("A1\n")` | **새로 clone한 Windows 머신에서 생성 파일이 전부 `skip(modified)`로 오분류돼 재생성·업그레이드가 무력화된다.** `hashOf`에 CRLF→LF 정규화 + 회귀 테스트 1건 추가 → 스크래치패드 **6/6 pass** |
| ApcH `gateNextActionHint` 본문 실측 | `"보드에 반영되면 **파이프라인 실행을 눌러** …"` — Phase 3 실행 버튼(`PipelineRunControl`)을 가리킨다 | 그대로 이식하면 T1.14가 **제거하는** 버튼을 누르라고 안내하게 된다 → T1.12 Step 2에서 `local` 실행기(사용자의 Claude Code)에 맞게 문구 재작성 |
| ApcH `PROJECT_BOARD.md` 안내 블록·`CLAUDE.md` 9단계 실측 | 인수 다섯 조건은 `PROJECT_BOARD.md:22-23`에만 존재 · 런북 7단계가 `TASK_BACKLOG.md` 등재를, 8단계가 `docs/release-checks.md`(Phase 3)를 지시 | **T1.17이 참조하는 「인수 다섯 조건」이 새 저장소에 집이 없었다** → T0.3 Step 3(protocol.md)로 이전. 런북 7·8단계 처리를 T1.15에 명시(테스트가 강제) |
| T1.12가 이식하는 gate UI 3파일의 임포트 실측 | `cn`(gate-card-lock:5) · `sonner`의 `toast`(button:5, reject:5) · `Button`(button:7) | **셋 다 어느 태스크도 제공하지 않았다** — `cn`은 T1.13 소유라 T1.12↔T1.13 **순환**, `sonner`는 설치 목록에 없음, `Button`은 아무도 안 만듦. 셋 다 T1.12에서 해소 |
| 독립 교차검토(신규 컨텍스트 리뷰어, 판정 비공개로 반증 지시) | **ISSUES 3건** — 절 수 오기(위 행에서 교정) · T1.13→T1.12 `gate.ts` 의존 누락(교정) · SKILL frontmatter `name` 불일치(교정) | 세 건 다 이 문서에 반영됨. 리뷰어가 독립 확증하지 못한 것: tsx 별칭 해석·`next build`·라이브 마이그레이션(라이브 셋업 필요) |
| `templates.test.mjs`의 `tools()` 파서를 ApcH 7개 정의에 실제 실행 | 7/7 정확히 파싱(pm `[Edit,Read]` … admin-dev `[…,Skill,…]`) | T1.15 `tools:` 계약 검사가 실물에서 동작함 |
| `npm test` | **53/53 pass** (2026-08-30) | core 44 + plugin/templates 3 + plugin/bin 6. Verification Plan의 53과 일치 |
| `npm run test:web` | **73/73 pass** (2026-08-30) | board-rules 12 + auth base 2 + mcp 4 + 이식 모델 55(journey 11·sprites 15·briefing 29) |
| `npm run check` | **exit 0** (2026-08-30) | eslint + `verify:fsd` + `tsc --noEmit` + 아키텍처 13/13 + `check-plugin-lib`. `npm run build`도 exit 0 — 라우트 11개 |
| T1.17 스모크 | **1차 2026-08-30 blocked(T8 잔여) → 재실행 2026-09-01 전체 pass** | 판정·증거: docs/test-reports/completed/2026-09-01-phase-1-smoke-acceptance.md — T8 4행·F1~F5 닫힘, Phase 1 완료 기준 충족 |

## Risks and Rollback

잔여 리스크:

- **mcp-handler 2.x 실동작**: 시그니처는 문서로 확인했으나(`ctx.http?.authInfo`, `inputSchema: z.object`) 실행은 T1.9 Step 7·8이 첫 실측. `@modelcontextprotocol/server 2.0.0`은 2026-07 스펙 기준 신판 — Claude Code 클라이언트 호환은 Step 8에서 본다. 실패 시 대안: `mcp-handler@1.x` + `@modelcontextprotocol/sdk`(스펙 원 코드 형태)로 후퇴.
- ~~**Prisma 7 API**~~ — **해소(2026-08-29 실측).** 스크래치패드에서 `prisma@7.10.0`으로 실제 생성해 `tsc --noEmit` 통과: `prisma generate`는 DB 접속 없이 성공(형식만 맞는 `DATABASE_URL`이면 됨), 클라이언트 모듈은 `<output>/client`, `Prisma.TransactionClient` 존재(`internal/prismaNamespace.ts`), `$transaction(..., { isolationLevel: "Serializable" })`·`distinct`+`orderBy`·`updateMany`에 스칼라 리스트 `set`·`updatedAt` CAS·`include._count` 전부 타입 통과.
- **서브에이전트 `tools:`의 개별 MCP 도구명 제한**: Claude Code 문서는 도구 이름 규약(`mcp__harness__<tool>`)과 `tools:`에 MCP 도구를 적을 수 있다는 것까지만 밝히고, **개별 도구 단위로 제한되는지(서버 단위가 아니라)는 명시하지 않는다**(문서 공백 확인됨). 그래서 이 계층은 **2차 방어선으로만 취급한다** — 1차는 서버가 게이트 도구를 아예 등록하지 않는 것(T1.9 계약 테스트가 고정)이고, 도구 구성이 느슨해도 게이트는 열리지 않는다. 실제 제한 동작은 T1.17 Step 5가 판정한다.
- **Auth.js beta**: `5.0.0-beta.32`는 beta 태그. Next 16 peer는 선언돼 있고 `nodemailer`·`@simplewebauthn/*` peer는 **optional**이라 설치를 막지 않는다(실측). `proxy.ts`에서 `NextAuth(config).auth` 사용은 문서 확인.
- ~~**`.mcp.json` 형식**~~ — **해소(2026-08-29, Claude Code 공식 문서 확인).** 원격 서버 항목은 `"type": "http"` + `url` + `headers`가 맞고, `${VAR}`·`${VAR:-default}` 확장이 `url`과 `headers` 양쪽에서 동작하며(미설정 시 경고 후 계속), `http://localhost`도 허용된다. 다만 **변수는 Claude Code를 띄운 셸 환경에서 와야 하고**, `.mcp.json` 변경은 **세션 재시작**이 필요하며 프로젝트 스코프 서버는 **최초 1회 승인**을 받는다 — 셋 다 T1.16 Step 5·T1.17 Step 2b에 반영했다.
- ~~**`node --test` 글롭**~~ — **해소(2026-08-29 실측).** Node 22.13.1은 인용된 글롭을 자체 해석하고, **매치가 0건이어도 exit 0 · `# tests 0`** 이다(빈 `packages/core/`로 확인). 따라서 T0.1에서 `test` 스크립트를 미리 넣어도 실패하지 않는다.
- **ApcH UI 이식 범위**: `briefing.ts`의 Phase 3 의존(`run-pipeline-command`) 제거로 테스트 일부 삭제 — 삭제 목록을 커밋에 남긴다.
- ~~**Windows CRLF**~~ — **쓰기 쪽은 그대로, 읽기 쪽은 해소(2026-08-29 실측).** 생성기는 계속 LF로 쓰고 `.gitattributes`도 두지 않는다(스펙 §13과 동일). 다만 **다시 읽을 때**가 문제였다: 이 저장소는 `core.autocrlf=true`라 커밋된 LF가 체크아웃에서 CRLF가 되고(ApcH 실측: `PROJECT_BOARD.md`=`w/crlf` vs `pm.md`=`w/lf`), 정규화 없는 해시 비교는 손대지 않은 생성 파일을 `skip(modified)`로 오분류해 재생성·업그레이드를 무력화한다. T1.4의 `hashOf`가 CRLF→LF로 접고 회귀 테스트가 고정한다. 남은 리스크: 파일 **내용**을 CRLF로 바꾸는 도구(일부 에디터)가 개입하면 여전히 diff가 커진다 — 그건 사용자 환경 몫.

롤백 방법:

- 코드: 태스크별 커밋이므로 `git revert <commit>` 단위. 브랜치 `harness/phase-0-1` 전체 폐기도 가능(`main`은 `8289320`에서 그대로 — 코드 변경이 하나도 없다).
- DB: `prisma migrate reset`(개발 DB, 데이터 없음) 또는 Neon 브랜치 삭제. 프로젝트 삭제는 cascade.
- 스모크 저장소 `harness-smoke`: 별도 GitHub 저장소라 삭제로 끝.
- ApcH: 건드리지 않으므로 롤백 대상 없음.

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성합니다.

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-09-01
- verification-summary: check exit 0 · core 50/50 · web 87/87 · templates 3/3 · 스모크 인수 재실행 전체 pass(T8 4행·F1~F5 닫힘, 신규 F6 low)
- implementation PR/commit: PR #1·#2(Phase 0·1 본체) · #3(frontend clean-code) · #4(원장 일관성) · #5(스모크 재실행·마감)
- changed files summary: src/(app·fsd·server·generated) 신설, packages/core 8모듈, plugin(생성기·스킬·lib·템플릿), prisma 스키마·마이그레이션 3, docs 골격 — 상세는 각 PR
- remaining follow-up: 배포(Vercel·도메인, 스펙 Q1) → Phase 2 별도 제안서 · F6(project_sync language 미동기화 — 다음 계약 변경 묶음에 합류) · T8 행1·2 실계정 재확인(선택)

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다(`active/` = `pending`).
- [x] `stage`는 pending 문서에서만 사용했다(`awaiting-approval`).
- [x] `stage: "approved"`가 아니므로 승인 metadata는 null이다.
- [x] `proposal-size`는 `standard`이며 강제 조건(인증·API 계약·마이그레이션·5개 이상 파일)에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 조건과 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다(Phase 0·1 / Phase 2~4·ApcH·배포 제외).
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 타입, 런타임 side effect, 외부 SDK를 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 기존 실패와 신규 실패를 구분했다(기존 실패 없음).
- [x] 잔여 리스크를 명시했다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 갱신되어 있다 — 해당 없음(pending).
- [ ] 닫힌 문서라면 `closed-*`가 닫힘 결정과 일치한다 — 해당 없음(pending).
