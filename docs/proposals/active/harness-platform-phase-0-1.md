---
# Metadata. status value는 proposals/README.md의 세 상태만 사용합니다.
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-08-29"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
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
| 저장소 | `main` 커밋 1개(`f04c4ef` create-next-app). `docs/`는 **untracked**. `app/`이 루트(`src/` 없음), Tailwind 4, TS strict, `@/*` → `./*` |
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

- Phase 2(ApcH 임포트·첫 테넌트), Phase 3(명령 원장·루틴·배포 원장·`verify-plan`), Phase 4(구독·팀·GitHub App·marketplace) — 착수 시 별도 제안서.
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
- 에이전트 권한은 정의 파일 `tools:`로 강제(pm은 파일 도구 0).
- `packages/core`·`plugin/bin`·`plugin/lib`는 의존성 0.
- ApcH 불변식 8개(스펙 §3.2) 보존.
- 새 상수를 코드에 박지 않는다 — roster·검증 명령은 `harness.json`·DB에서.
- 언어 1차 한국어, 템플릿은 `templates/<lang>/`.
- **버전 고정**: `prisma@7.10.0 @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 mcp-handler@2.1.1 @modelcontextprotocol/server@2.0.0 zod@4.5.2 next-auth@5.0.0-beta.32 tsx@4.23.12`.

### 태스크 목록 (의존 순)

| 태스크 | 산출 | 스펙 대응 | 선행 |
| --- | --- | --- | --- |
| T0.1 저장소 레이아웃·러너 | `src/app`, tsconfig paths, 루트 스크립트, `plugin/.claude-plugin`, `scripts/sync-plugin-lib.mjs`, `examples/apch/harness.json` | 0.1 | — |
| T0.2 의존성·Prisma 7·환경 | 패키지 설치, `prisma.config.ts`, `src/server/db.ts`, `.env.example` | 0.2 | T0.1 |
| T0.3 문서 골격 | `docs/architecture/{sources,invariants,protocol,rationale}.md` | 0.3 | T0.1 |
| T1.1 `transitions.mjs` | 상태 기계(7 tests) | 1.1 | T0.1 |
| T1.2 `backlog-md.mjs` | 백로그 파서(2) | 1.2 | T0.1 |
| T1.3 `board-md.mjs` | 보드 파서(ApcH 9) | 1.3 | T0.1 |
| T1.4 `config`·`render`·`manifest`·`vars` | 23 tests | 1.4 | T0.1 |
| T1.5 `token.mjs` | 토큰(2) | 1.5 | T0.1 |
| T1.6 Prisma 스키마·마이그레이션 | `prisma/schema.prisma`, `prisma/migrations/*` | 1.6 | T0.2 |
| T1.7 전이 서비스 | `board-rules.ts`(12 tests) + `board.ts` | 1.7 | T1.1, T1.6 |
| T1.8 인증(GitHub OAuth) | `src/server/auth/*`, `src/proxy.ts`, `/login`(2 tests) | 1.9 일부 | T1.6 |
| T1.9 MCP 서버 | `src/server/mcp/*`, `src/app/api/mcp/route.ts`(4 tests + 실측) | 1.8 | T1.5, T1.7 |
| T1.10 웹 — 프로젝트 등록·토큰 | `/`, `/p/new`, `/p/[slug]/tokens` | 1.9 | T1.8 |
| T1.11 웹 — 백로그 | `/p/[slug]/backlog` | 1.9 | T1.10 |
| T1.12 웹 — 결재함(게이트) | `/p/[slug]/inbox` + 게이트 액션 | 1.9 Step 1 | T1.7, T1.10 |
| T1.13 웹 — 보드 모델 이식 | `journey`·`briefing`·`sprites`·`known-agents` + 어댑터(ApcH 테스트) | 1.9 Step 2 | T1.1, T1.3 |
| T1.14 웹 — 보드 화면·항목 상세 | `/p/[slug]`, `/p/[slug]/items/[key]` | 1.9 | T1.12, T1.13 |
| T1.15 플러그인 — 템플릿 | `plugin/templates/ko/**` + 스냅샷 테스트 | 1.10 템플릿 | T1.4 |
| T1.16 플러그인 — 생성기·스킬 | `harness-init.mjs`(6), `SKILL.md`, `check-plugin-lib` | 1.10 | T1.15 |
| T1.17 빈 저장소 실측 | Phase 1 완료 기준 | 1.11 | 전부 |

병렬 가능: T0.3·T1.1~T1.5·T1.6은 T0.2 뒤 동시 진행. T1.13은 T1.8~T1.12와 독립. T1.15는 T1.4만 있으면 된다.

---

## Phase 0 — 부트스트랩

### T0.1: 저장소 레이아웃·러너

**Files:**
- Move: `app/` → `src/app/` (`layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`)
- Modify: `tsconfig.json`(paths), `package.json`(scripts), `.gitignore`, `README.md`(제목 한 줄)
- Create: `plugin/.claude-plugin/plugin.json`, `scripts/sync-plugin-lib.mjs`, `examples/apch/harness.json`, `packages/core/.gitkeep`, `plugin/lib/.gitkeep`

**Interfaces (Produces):** 경로 별칭 `@/*` → `src/*`, `@harness/core/*` → `packages/core/*`. 루트 스크립트 `test`·`test:web`·`check`·`sync:plugin-lib`.

- [ ] **Step 1: 브랜치** — `git switch -c harness/phase-0-1` (D-E)
- [ ] **Step 2: `app/` 이동** — `New-Item -ItemType Directory src; git mv app src/app`. `src/app` 외 다른 `app/` 잔재가 없어야 한다(있으면 Next가 `src/app`을 무시한다 — `src-folder.md`).
- [ ] **Step 3: `tsconfig.json` paths**

```json
"paths": {
  "@/*": ["./src/*"],
  "@harness/core/*": ["./packages/core/*"]
}
```

- [ ] **Step 4: `package.json` scripts** (T0.2·T1.16에서 두 줄 더 붙는다)

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "check": "eslint && tsc --noEmit",
  "test": "node --test \"packages/core/*.test.mjs\"",
  "sync:plugin-lib": "node scripts/sync-plugin-lib.mjs"
}
```

- [ ] **Step 5: `plugin/.claude-plugin/plugin.json`** — 스펙 Task 0.1 Step 3 JSON 그대로(name `harness`, D-A).
- [ ] **Step 6: `scripts/sync-plugin-lib.mjs`** — 스펙 Task 0.1 Step 4 코드 그대로(4줄).
- [ ] **Step 7: `examples/apch/harness.json`** — 스펙 §6 JSON 그대로. T1.4 테스트가 `../../examples/apch/harness.json`으로 읽는다.
- [ ] **Step 8: `.gitignore`에 추가** — `nul`, `src/generated/`(Prisma 생성물, T0.2)
- [ ] **Step 9: 확인** — `npm run check` 통과, `npm run dev` 후 `http://localhost:3000` 200. 
- [ ] **Step 10: 커밋** — `docs/`(untracked)도 이 커밋에 포함한다.

```bash
git add -A
git commit -m "chore: src layout, core/plugin skeleton, root scripts; add docs"
```

### T0.2: 의존성·Prisma 7·환경

**Files:**
- Create: `prisma.config.ts`, `prisma/schema.prisma`(생성기·datasource만), `src/server/db.ts`, `.env.example`
- Modify: `package.json`(deps, scripts)

**Interfaces (Produces):** `import { prisma } from "@/server/db"` (PrismaClient 싱글턴, `@/generated/prisma/client`에서 생성). 스크립트 `db:generate`·`db:migrate`·`test:web`.

- [ ] **Step 1: 설치** (버전 고정 — `prisma`는 latest가 8 RC)

```bash
npm i @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 mcp-handler@2.1.1 @modelcontextprotocol/server@2.0.0 zod@4.5.2 next-auth@5.0.0-beta.32 server-only clsx@2.1.1 tailwind-merge@3.6.0
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

- [ ] **Step 6: scripts 추가**

```json
"build": "prisma generate && next build",
"test:web": "node --import tsx --test \"src/**/*.test.mjs\"",
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev"
```

- [ ] **Step 7: 확인** — `.env`에 Neon `DATABASE_URL` 설정 → `npm run db:generate`가 `src/generated/prisma/`를 만든다 → `npm run check` 통과(`src/server/db.ts` 타입 해석 포함).
- [ ] **Step 8: 커밋** `chore: prisma 7 (adapter-pg), mcp-handler 2, auth.js v5, tsx`

### T0.3: 문서 골격 `docs/architecture/`

**Files:** Create `docs/architecture/sources.md`, `invariants.md`, `protocol.md`, `rationale.md`. `docs/architecture/.gitkeep` 삭제.

- [ ] **Step 1: `sources.md`** — 스펙 §8 표 전체 + 머리말 `원천: Sangeok/ApcH @ de25a1c (2026-08-29)`. 경로 열은 ApcH 저장소 상대경로 그대로.
- [ ] **Step 2: `invariants.md`** — ApcH `docs/proposals/active/remote-agent-pipeline-generalization.md`의 「불변식」 절 전문을 인용(출처 줄 명기) + 스펙 §3.2 표(ApcH 구현 → v2 구현) + 보드 규칙 셋(증거 없는 상태 주장 금지 · 재독 ≠ 회상 · 정지 규칙) + pm 상한 서버 강제.
- [ ] **Step 3: `protocol.md`** — 스펙 §5 도구 표(Phase 열 추가: 1 / 3) + 「등록되지 않은 것(웹 전용)」 + 상태 기계 표(T1.1 `RULES`를 표로: from·to·actor·kind·전제) + 계획서 절 8개(ApcH `docs/plans/template.md`의 절 제목).
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

v1에서 검증된 네 모듈(오늘 재실행 23/23). 스펙은 "v1 백업에서 복사"라고만 적었는데 그 백업은 임시 디렉터리에 있으므로 여기 전문을 싣는다. `config.test.mjs` 첫 케이스의 executor 단언은 v2 예시(`local`)에 맞춘 상태다.

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

```js
import { createHash } from "node:crypto";

export function hashOf(text) { return createHash("sha256").update(text).digest("hex").slice(0, 16); }

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

- [ ] **Step 6: 통과** — `npm test` → 누적 `# pass 41` (7+2+9+11+4+5+3).
- [ ] **Step 7: 커밋** `feat(core): config, render, manifest, vars (from v1, verified)`

### T1.5: `packages/core/token.mjs` — 프로젝트 토큰

**Files:** Create `packages/core/token.mjs`, `packages/core/token.test.mjs`

**Interfaces (Produces):** `newToken() → {plain: "hs_"+43자 base64url, hash: sha256 hex}`, `hashToken(plain)`, `parseBearer(header) → plain | null`

- [ ] **Step 1: 테스트** — 스펙 Task 1.5 Step 1 그대로. **Step 2:** FAIL. **Step 3:** 스펙 Step 3 구현 그대로. **Step 4:** `npm test` → `# pass 43`.
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
  });
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
    // 낙관적 잠금: 화면이 읽은 updatedAt과 다르면 0건 갱신 → stale (ApcH sha 잠금의 대응물)
    const u = await tx.boardItem.updateMany({
      where: { id: row.id, ...(input.expectedUpdatedAt ? { updatedAt: input.expectedUpdatedAt } : {}) },
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
      where: { id: row.id, ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}) },
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
// guard.ts
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
- `prismaToolDeps: ToolDeps`
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
// deps.ts — ToolDeps의 Prisma 구현. 도구 본문은 tools.ts, 저장 규칙은 pipeline/board.ts.
import "server-only";
import { prisma } from "@/server/db";
import * as board from "@/server/pipeline/board";
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
```

```ts
// src/app/api/mcp/route.ts — mcp-handler 2.x: 이 경로에 바로 마운트. [transport]·basePath·SSE 없음.
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { prisma } from "@/server/db";
import { makeVerifyToken } from "@/server/mcp/auth";
import { prismaToolDeps } from "@/server/mcp/deps";
import { registerTools } from "@/server/mcp/tools";

const handler = createMcpHandler((server) => registerTools(server, prismaToolDeps), { serverInfo: { name: "harness", version: "0.1.0" } });

const verifyToken = makeVerifyToken((hash) =>
  prisma.projectToken.findUnique({ where: { hash }, select: { id: true, projectId: true, revokedAt: true } }),
);

const authed = withMcpAuth(handler, verifyToken, { required: true });

export { authed as GET, authed as POST };
```

- [ ] **Step 6: 통과** — `npm run test:web` → `# pass 18`(14+4). `npm run check`.
- [ ] **Step 7: 실측(HTTP)** — `npm run dev` 후:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# → 401 (토큰 없음)
```

- [ ] **Step 8: 실측(Claude Code)** — T1.10 뒤에 토큰이 생기면: 임시 폴더에 `.mcp.json` `{"mcpServers":{"harness":{"type":"http","url":"http://localhost:3000/api/mcp","headers":{"Authorization":"Bearer ${HARNESS_TOKEN}"}}}}` 두고 `HARNESS_TOKEN` 설정 → `claude` → `/mcp`에서 `harness` connected, 도구 11개 → `project_get` 호출 성공. 결과를 T1.17의 사전 확인으로 기록.
- [ ] **Step 9: 커밋** `feat(web): MCP server with agent-scoped tools (mcp-handler 2)`

### T1.10: 웹 — 프로젝트 목록·등록·토큰

**Files:**
- Create: `src/fsd/features/project/api/create-project.ts`, `src/fsd/features/project/api/tokens.ts`, `src/fsd/features/project/ui/new-project-form.tsx`, `src/fsd/features/project/ui/token-reveal.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/p/new/page.tsx`, `src/app/(app)/p/[slug]/layout.tsx`, `src/app/(app)/p/[slug]/tokens/page.tsx`
- Modify: `src/app/page.tsx` 삭제(→ `(app)/page.tsx`가 `/`)

**Interfaces (Produces):** 서버 액션 `createProject(prev, formData) → {error?} | {slug, token}`, `issueToken(slug, label) → {token}`, `revokeToken(slug, tokenId)`. `(app)` 그룹 레이아웃이 `requireUser()`로 보호. `p/[slug]/layout.tsx`가 `requireMember(slug)` + 상단 탭(보드·결재함·백로그·토큰).

- [ ] **Step 1: `create-project.ts`**

```ts
"use server";
import { newToken } from "@harness/core/token.mjs";
import { requireUser } from "@/server/auth/guard";
import { prisma } from "@/server/db";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export type CreateProjectState = { error?: string; slug?: string; token?: string };

export async function createProject(_prev: CreateProjectState, form: FormData): Promise<CreateProjectState> {
  const { userId } = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const slug = s("slug"), owner = s("owner"), repo = s("repo"), branch = s("branch") || "main", name = s("name") || slug;
  if (!SLUG_RE.test(slug)) return { error: "slug: 소문자·숫자·하이픈, 2~40자" };
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
- [ ] **Step 4: 확인** — 로그인 → 프로젝트 등록 → 토큰 1회 표시 → 새로고침 시 평문 사라짐 → 폐기한 토큰으로 T1.9 Step 7 curl → 401, 유효 토큰 → 200. `npm run check`.
- [ ] **Step 5: 커밋** `feat(web): project list, registration, token issue/revoke`

### T1.11: 웹 — 백로그

**Files:**
- Create: `src/fsd/features/backlog/api/actions.ts`, `src/fsd/features/backlog/ui/backlog-form.tsx`, `src/fsd/features/backlog/ui/backlog-table.tsx`, `src/app/(app)/p/[slug]/backlog/page.tsx`

**Interfaces (Produces):** 서버 액션 `addBacklogItem(slug, prev, form)`, `updateBacklogItem(slug, key, prev, form)`, `removeBacklogItem(slug, key)`. 검증: key `^[A-Z]+-\d+$` 프로젝트 내 유일, title 필수, area·source 자유 길이(150자 규칙 없음 — 스펙 1.9 Step 3). 제거는 `removedAt` 표기이며 **미결 보드 행이 있으면 거부**(`latestBoard(projectId, true)`에 그 key가 있으면 `"보드에 미결 행이 있어 제거할 수 없다"`).

- [ ] **Step 1: 액션** — 세 함수 모두 `requireMember(slug)` 선행, Prisma 직접(백로그는 상태 기계 밖). 끝에 `revalidatePath(\`/p/${slug}/backlog\`)`.
- [ ] **Step 2: 화면** — 표(key·title·area·최신 status 칩·제거 버튼) + 추가/편집 폼. 폼 도움말은 ApcH `TASK_BACKLOG.md` 머리말(관측/진단 분리 규칙)을 옮긴다: "`source`에는 **관측**(무엇이 보였나)과 **진단(코드 확정)**(어디가 원인인가)을 나눠 적는다". 「제거된 항목 보기」 토글(`includeRemoved`).
- [ ] **Step 3: 확인** — 항목 추가·편집·제거, 중복 key 거부, `npm run check`. MCP `backlog_list`로 같은 항목이 보인다(Claude Code 또는 curl + 토큰).
- [ ] **Step 4: 커밋** `feat(web): backlog editor`

### T1.12: 웹 — 결재함(게이트·반려·재개)

ApcH `features/transition-pipeline-gate/{ui,api}`를 이식한다. contents API 커밋 → `board.transition(…, "human", userId)`, sha 잠금 → `expectedUpdatedAt`.

**Files:**
- Create: `src/fsd/shared/api/result.ts`(ApcH `fsd/shared/api/result.ts` 복사), `src/fsd/features/gate/api/actions.ts`, `src/fsd/features/gate/model/hold-text.ts`, `src/fsd/features/gate/model/gate.ts`, `src/fsd/features/gate/ui/gate-transition-button.tsx`, `reject-actions.tsx`, `gate-card-lock.tsx`(ApcH 세 파일 이식), `src/fsd/features/gate/ui/inbox-card.tsx`, `src/app/(app)/p/[slug]/inbox/page.tsx`

**Interfaces (Produces):**
- `humanTransition(slug, key, to, result, expectedUpdatedAt: string) → ActionResult<void>`, `discardItem(slug, key, expectedUpdatedAt) → ActionResult<void>`
- `isGateSource(status)`(`gate.ts`): `STATUSES.some((to) => findRule("human", status, to)?.kind === "gate")` — T1.13의 briefing이 ApcH `isGateTransitionSource` 대신 쓴다
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
  return success(undefined);
}

export async function discardItem(slug: string, key: string, expectedUpdatedAt: string): Promise<ActionResult<void>> {
  const { userId, projectId } = await requireMember(slug);
  const r = await board.discard(projectId, key, userId, new Date(expectedUpdatedAt));
  if (!r.ok) return failure(message(r.reason));
  revalidatePath(`/p/${slug}`); revalidatePath(`/p/${slug}/inbox`);
  return success(undefined);
}
```

- [ ] **Step 2: UI 이식** — ApcH `gate-transition-button.tsx`·`reject-actions.tsx`·`gate-card-lock.tsx`를 복사해 (i) `~/` → `@/`, (ii) 액션 호출을 `humanTransition`/`discardItem`으로, (iii) props에 `updatedAt: string` 추가(카드가 읽은 값을 그대로 넘긴다), (iv) 되돌리기·보류·폐기 가능 여부는 `findRule("human", status, to)`/`canDiscard(status)`로 계산(ApcH `rejectActionsFor` 대체). 보류는 `holdResultLine(new Date())`를 result로 보낸다.
- [ ] **Step 3: `inbox/page.tsx`** — `latestBoard(projectId)`에서 `승인대기`·`검토대기` 카드(도장 = `humanTransition(…, 계획지시|구현승인)`, 되돌리기, 보류, 폐기), `보류` 카드(재개 → `계획지시` / `구현승인`). 카드에 key·title·agent·근거·검증·계획서 링크(`planPath`가 있으면 `https://github.com/{owner}/{repo}/blob/{branch}/{planPath}`).
- [ ] **Step 4: 확인** — 백로그 항목 1건을 T1.9 실측 토큰으로 `board_propose`(curl 또는 Claude Code) → 결재함에 `승인대기` 카드 → 도장 → `계획지시`. 두 탭에서 같은 카드를 열고 한쪽 도장 후 다른 쪽 도장 → "보드가 이미 바뀌었습니다". `npm run check`.
- [ ] **Step 5: 커밋** `feat(web): inbox with gate/bounce/hold/discard/resume over board service`

### T1.13: 웹 — 보드 모델 이식 (`journey`·`briefing`·`sprites`·`known-agents`)

ApcH `apps/admin/src/fsd/pages/pipeline/model/*`를 복사한다. `BoardItem`/`BoardSection` 입력 형은 유지하고 DB 행 → 그 형으로 바꾸는 **어댑터**를 둔다(스펙 "거의 무변경"의 실체). 원본 test(journey 11 · briefing 26 · sprites 15)를 가져와 통과시킨다.

**Files:**
- Create: `src/fsd/entities/board/model/board-item.ts`(어댑터), `src/fsd/entities/board/model/report.ts`, `src/fsd/entities/board/model/doc-links.ts`, `src/fsd/pages/pipeline/model/{journey,briefing,sprites,known-agents,desk-commands}.ts` + `{journey,briefing,sprites}.test.mjs`, `src/fsd/shared/lib/utils.ts`(ApcH `cn` 그대로)

**Interfaces (Produces):**
- `type BoardItem = {checked,id,title,agent,area,status,reason,result,validation}`(ApcH와 동일 형), `type BoardSection = {heading, items}`; `toBoardItem(row)`, `toBoardSections(rows) → BoardSection[]`(`proposedOn` 날짜별 내림차순, heading = `YYYY-MM-DD`)
- `type AgentReport = {actor, path, commit, at}`; `docLinksForItem(project, row) → DocLink[]`(GitHub blob URL — planPath·reports)
- `deriveJourney`, `buildBriefing`, `identityFor`, `initialOf`, sprites — ApcH 시그니처 유지. `identityFor(agentId, roster)`는 roster 인자 추가(아래).

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

- [ ] **Step 2: 복사 + 치환** — 다섯 모델 파일과 세 테스트를 복사하고 아래 표대로 바꾼다. 그 외 로직은 손대지 않는다.

| ApcH import | 대체 | 영향 |
| --- | --- | --- |
| `~/fsd/entities/pipeline` `BoardItem`·`BoardSection`·`parseBoard` | `@/fsd/entities/board/model/board-item`(형), 테스트의 `parseBoard`는 `packages/core/board-md.mjs`(픽스처가 md라서) | briefing.ts·test |
| `~/fsd/entities/agent-report` `AgentReport` | `@/fsd/entities/board/model/report` | briefing.ts |
| `~/fsd/entities/repo-doc` `docLinksForItem`·`DocLink` | `@/fsd/entities/board/model/doc-links` | briefing.ts |
| `~/fsd/features/run-pipeline-command` `describePipelineRun`·`RunPlan` | **제거**(Phase 3). `Briefing.plan` 필드·관련 테스트 케이스 삭제, 삭제한 케이스 이름을 커밋 메시지에 적는다 | briefing.ts·test |
| `~/fsd/features/transition-pipeline-gate` `isGateTransitionSource` | `@/fsd/features/gate/model/gate` `isGateSource` | briefing.ts |
| `~/fsd/shared/agents/roster` `ROSTER_AGENT_IDS` | `known-agents.ts`의 `ROSTER`를 **고정 4역**(pm·plan-verifier·doc-auditor·feature-scout)만 남기고, `identityFor(agentId, roster: readonly string[])`가 roster(=`Workspace.agent[]`)에 있는 id는 `{id, handle:id, role:"개발", emoji:"🛠️"}`로 만든다. `ROSTER_ORDER` → `rosterOrder(roster)` = 고정 4역 앞뒤에 워크스페이스 에이전트 | known-agents·briefing·test(ApcH 이름 `admin-dev` 등은 roster 인자로 넘긴다) |
| `~/fsd/shared/lib/utils` `cn` | `@/fsd/shared/lib/utils` | 없음 |

- [ ] **Step 3: 통과** — `npm run test:web` → journey 11 · sprites 15 전부, briefing은 `plan` 관련을 뺀 나머지 전부. 누적 수를 커밋 메시지에 적는다.
- [ ] **Step 4: 커밋** `feat(web): port journey/briefing/sprites models from ApcH admin (DB-row adapter, no run-plan)`

### T1.14: 웹 — 보드 화면·항목 상세

**Files:**
- Create: `src/fsd/pages/pipeline/ui/index.tsx`, `src/fsd/pages/pipeline/ui/_component/{journey-stepper,pixel-office,pixel-sprite,agent-avatar}.tsx`(ApcH 이식), `src/app/(app)/p/[slug]/page.tsx`, `src/app/(app)/p/[slug]/items/[key]/page.tsx`

- [ ] **Step 1: UI 이식** — 네 컴포넌트 + `ui/index.tsx` 복사. 치환: `~/` → `@/`; `PipelineRunControl`·`PipelineCommandButton`·`deskCommandFor`(Phase 3) **제거**; `agentProfileHref` 링크 제거(책상은 텍스트만); `OwnerBanner`는 GitHub 이슈 의존이면 제거, 아니면 유지.
- [ ] **Step 2: `p/[slug]/page.tsx`** — `requireMember` → `latestBoard(projectId)` + `report`(`prisma.report.findMany` where boardItem.projectId) + `workspace` → `toBoardSections` → `buildBriefing`/`deriveJourney` → 이식한 `PipelinePage`. `params`는 `await`(Next 16). 미결 현황(개수·N일째)은 briefing의 `daysOnBoard` 그대로.
- [ ] **Step 3: `items/[key]/page.tsx`** — `getWithHistory` → 상태·근거·결과(누적)·검증, 이벤트 타임라인(at·actor·from→to·note), 계획서·보고 링크(GitHub blob), 없으면 404.
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
  2. **수단 치환**(스펙 §9 표): pm의 두 파일 읽기 → `backlog_list`·`board_list({open:true})`, 보드 행 쓰기 → `board_propose`(형식 블록 삭제 — 서버가 행을 만든다); dev A-2 → `backlog_get`, A-4 → `plan_submit` 후 `board_transition({to:"검토대기"})`, 보류 → `board_transition({to:"보류", result})`, B-6 → `report_submit` 후 `board_transition({to:"완료", result})`, B-7 백로그 제거 절 삭제(서버 자동), "보드 커밋·푸시" 문장 삭제(계획서·기록·코드만 커밋); plan-verifier 브리핑에 `board_get` 허용; doc-auditor 백로그 읽기 → `backlog_list`; 런북 절차 9단계의 보드 갱신을 도구 호출로, 문서 지도에서 `PROJECT_BOARD.md`·`TASK_BACKLOG.md`·`docs/release-checks.md` 행 삭제 후 "보드·백로그·결재는 웹" 한 줄.
  3. **실증 산문 이동**: FEAT-xx 사례·BUG-xx 실측 문단은 `docs/architecture/rationale.md`로 옮기고 템플릿엔 규칙만.
  4. `tools:` 줄을 위 계약표대로.
- [ ] **Step 4: 통과** — `npm test` → `# pass 46`(43+3)
- [ ] **Step 5: 골든 diff 기록** — 세 워크스페이스로 렌더한 `dev.md`와 ApcH 원본 `{web,admin,backend}-dev.md`의 diff를 `docs/architecture/rationale.md` 「골든 diff」에 요약: 잔차가 (i) 유래 이동 (ii) knowledge 이동 (iii) 변수 형식 (iv) 수단 치환 **넷뿐**인지. 다섯째 부류가 나오면 템플릿을 고친다.
- [ ] **Step 6: 커밋** `feat(plugin): ko templates — MCP-based agents, runbook, plan/agent conventions`

### T1.16: 플러그인 — 생성기 `harness-init.mjs` + `/harness:init` 스킬

**Files:**
- Create: `plugin/bin/harness-init.mjs`, `plugin/bin/harness-init.test.mjs`, `plugin/skills/harness-init/SKILL.md`, `scripts/check-plugin-lib.mjs`, `plugin/lib/*.mjs`(동기화 산출)
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

- [ ] **Step 5: `SKILL.md`** — 스펙 Task 1.10 Step 5 그대로, 2단계 명령에 `--server <웹 토큰 페이지의 MCP URL에서 /api/mcp를 뺀 값>`을 넣는다.
- [ ] **Step 6: 통과** — `npm run sync:plugin-lib && npm test` → `# pass 52`(46+6). `npm run check`(plugin/lib in sync).
- [ ] **Step 7: 커밋** `feat(plugin): harness-init generator, /harness:init skill, lib sync check` (`plugin/lib/*.mjs` 포함 — marketplace 설치는 `plugin/`만 복사한다)

### T1.17: 빈 저장소 실측 — Phase 1 완료 기준

스펙 Task 1.11 그대로. 명령만 이 저장소 기준.

- [ ] **Step 1:** `npm run dev`(로컬). 웹 GitHub 로그인 → 프로젝트 `harness-smoke` 등록(owner/repo = 실제 빈 GitHub 저장소) → 토큰 1회 표시 → `HARNESS_TOKEN`으로 저장.
- [ ] **Step 2:** 빈 저장소 clone → 로컬 marketplace로 플러그인 설치(`claude plugin marketplace add <stagekeeper 경로>` 후 `claude plugin install harness@<marketplace>`; 안 되면 `.claude-plugin` 경로 직접 지정) → `/harness:init`(워크스페이스 1개 `.`, agent `dev`, 검증 `node --test`, `--server http://localhost:3000`) → Claude Code 재시작 → `mcp__harness__project_get` 성공 → `project_sync`.
- [ ] **Step 3:** 웹 백로그에 `FEAT-01: README에 설치 방법 한 절 추가`.
- [ ] **Step 4: 사이클 1회** — 런북대로: `pm`(→ `승인대기`) → **웹 도장 `계획지시`** → `dev`(계획서·커밋 → `plan_submit` → `검토대기`) → 카탈로그 경로 수동 → `plan-verifier` 무편집 무소득 → `validation_record` → **웹 도장 `구현승인`** → `dev`(구현·검증·`report_submit`·`완료`) → 인수 다섯 조건 재현 → `doc-auditor`.
- [ ] **Step 5: 완료 기준** — 웹: `완료`·`검증:`·이벤트 8건 이상·백로그에서 FEAT-01 제거됨. 저장소: `docs/plans/FEAT-01.md`·`docs/agents/dev/FEAT-01.md`·`docs/agents/main-loop/FEAT-01.md`, `git status` 청결. **에이전트가 게이트를 시도하면 도구가 없어 실패** — `dev` 세션에서 `board_transition({to:"계획지시"})`를 일부러 호출해 `not allowed` 응답을, 그리고 `mcp__harness__gate_*` 같은 도구가 목록에 없음을 기록.
- [ ] **Step 6:** 실측 로그를 `docs/architecture/rationale.md` 「첫 스모크」에, 이 제안서 Verification Results를 갱신. 커밋 `docs: first smoke cycle on harness-smoke`.

---

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `app/` → `src/app/` | move | Next 16 `src/` 규약. 루트 `app/`이 남으면 `src/app` 무시 | low — 파일 4개, T0.1 Step 9로 확인 |
| `tsconfig.json`, `package.json`, `.gitignore` | update | 별칭·스크립트·생성물 제외 | low |
| `prisma.config.ts`, `prisma/**`, `src/generated/prisma/**`(gitignore) | create | Prisma 7 형식 | medium — 마이그레이션은 DB 상태 변경 |
| `src/server/db.ts`, `src/server/pipeline/**`, `src/server/mcp/**`, `src/server/auth/**` | create | 서비스 코어 | medium — 인증·API 계약 |
| `src/proxy.ts`, `src/app/api/{auth,mcp}/**`, `src/app/login`, `src/app/(app)/**` | create | 라우팅·인증 경계 | medium |
| `src/fsd/**` | create | ApcH admin 이식 + 신규 기능 | low — 화면 |
| `packages/core/*.mjs` (+test) | create | 순수 모듈 8개, 의존성 0 | none — 43 테스트 |
| `plugin/**`, `scripts/*.mjs`, `examples/apch/harness.json` | create | 플러그인·동기화 | low |
| `docs/architecture/*.md`, `docs/proposals/active/…`, `docs/investigations/active/harness-platform.md` | create/commit | 문서(현재 untracked) | none |
| `README.md` | update | 제목·설치 절 | none |

## Safety Analysis

- **라우팅 경계**: `app/` → `src/app/` 이동은 Next 문서(`src-folder.md`)가 지원하는 경로. 루트에 `app/`·`pages/`가 남지 않는 것을 T0.1에서 확인. `route.ts`(`/api/mcp`, `/api/auth/[...nextauth]`)와 `page.tsx`가 같은 세그먼트에 겹치지 않는다.
- **인증 경계**: `proxy.ts` matcher가 `/api`를 제외하므로 MCP는 Bearer만, 웹은 JWT 세션만 검사한다. 게이트·백로그 편집 서버 액션은 모두 `requireMember` 뒤에 있고, MCP 서버에는 그 도구가 등록되지 않는다(T1.9 테스트가 집합 동일성을 단언).
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
4. **T1.10 → T1.11 → T1.12** 순차(웹 화면은 앞 화면의 데이터에 기댄다). **T1.13**은 이 줄과 독립이라 병렬.
5. **T1.14**(T1.12·T1.13 뒤).
6. **T1.15**(T1.4 뒤, 어느 때나) → **T1.16**.
7. **T1.17** 스모크 — 전부 끝난 뒤, 사람이 게이트를 연다.
8. 태스크당 커밋 1개(메시지는 각 태스크 마지막 Step). 리뷰 게이트: 태스크마다 `npm test`·`npm run test:web`·`npm run check` 셋을 다 돌린 출력이 있어야 다음 태스크로.
9. Phase 1 완료 후 이 문서를 `completed/`로 옮기고, Phase 2 제안서를 새로 연다.

## Verification Plan

실행할 검증:

```bash
npm test          # packages/core (43) + plugin/bin (6) + plugin/templates (3) = 52
npm run test:web  # board-rules (12) + auth base (2) + mcp tools/auth (4) + 이식 모델(journey 11·sprites 15·briefing N)
npm run check     # eslint && tsc --noEmit && check-plugin-lib
npx prisma migrate status
```

검증 기준:

- 위 네 명령이 모두 exit 0. 테스트 수는 각 태스크에 적힌 누적치와 일치.
- T1.9 계약 테스트가 **게이트 도구 부재**를 단언하고 통과한다(불변식 4 회귀 가드).
- T1.17 완료 기준 6개(웹 상태·저장소 산출물·게이트 시도 실패·트리 청결) 전부 충족.
- 기존 실패 없음(저장소가 초기 상태). 새 실패는 전부 신규 실패다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 스크래치패드 `node --test packages/core/*.test.mjs plugin/bin/*.test.mjs`(스펙 코드 + v1 모듈 + 스텁 템플릿) | **49/49 pass** (2026-08-29, Node 22.13.1) | 제안서 작성 시 재실행. 실제 템플릿·Prisma·MCP 라우트·웹은 미검증 |
| `npm test` | Not run yet | 목표 52 |
| `npm run test:web` | Not run yet | |
| `npm run check` | Not run yet | |
| T1.17 스모크 | Not run yet | Phase 1 완료 기준 |

## Risks and Rollback

잔여 리스크:

- **mcp-handler 2.x 실동작**: 시그니처는 문서로 확인했으나(`ctx.http?.authInfo`, `inputSchema: z.object`) 실행은 T1.9 Step 7·8이 첫 실측. `@modelcontextprotocol/server 2.0.0`은 2026-07 스펙 기준 신판 — Claude Code 클라이언트 호환은 Step 8에서 본다. 실패 시 대안: `mcp-handler@1.x` + `@modelcontextprotocol/sdk`(스펙 원 코드 형태)로 후퇴.
- **Prisma 7 + `env()`**: `prisma generate`가 `DATABASE_URL` 없이 도는지 미확인. 안 되면 `.env`에 임시 값을 두고 돌린다(T0.2 Step 7).
- **서브에이전트 `tools:`의 MCP 도구명 제한**이 기대대로 동작하는지 — T1.17 Step 5가 판정(스펙 §13과 같은 미확인).
- **Auth.js beta**: `5.0.0-beta.32`는 beta 태그. Next 16 peer는 선언돼 있다. `proxy.ts`에서 `NextAuth(config).auth` 사용은 문서 확인.
- **`node --test` 글롭**: Node 22.13에서 인용된 글롭 패턴을 자체 해석한다(스크래치패드 실행으로 확인). 패턴이 파일 0개를 매치하면 실패할 수 있으니 `test` 스크립트에는 실재하는 패턴만 둔다(T0.1·T1.15·T1.16에서 단계적으로 추가).
- **ApcH UI 이식 범위**: `briefing.ts`의 Phase 3 의존(`run-pipeline-command`) 제거로 테스트 일부 삭제 — 삭제 목록을 커밋에 남긴다.
- **Windows CRLF**: 생성기는 LF로 쓴다. `.gitattributes`는 두지 않는다(스펙 §13과 동일).

롤백 방법:

- 코드: 태스크별 커밋이므로 `git revert <commit>` 단위. 브랜치 `harness/phase-0-1` 전체 폐기도 가능(`main`은 초기 커밋 그대로).
- DB: `prisma migrate reset`(개발 DB, 데이터 없음) 또는 Neon 브랜치 삭제. 프로젝트 삭제는 cascade.
- 스모크 저장소 `harness-smoke`: 별도 GitHub 저장소라 삭제로 끝.
- ApcH: 건드리지 않으므로 롤백 대상 없음.

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성합니다.

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD (Phase 2 제안서 링크)

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
