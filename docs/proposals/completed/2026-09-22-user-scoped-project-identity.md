---
status: "completed"
stage: "approved"
proposal-size: "standard"
created-at: "2026-09-20"
approved-by: "user (conversation)"
approved-at: "2026-09-20"
approval-scope: "A(Execution Plan 1~7) 구현. B-1은 2026-09-21에 선택지 3(사용자 범위 등록)으로 결정됐다 — 개명 0곳이고 이 저장소 하나로 닫힌다, B-2는 배포 부재로 실행 불가, C는 A가 녹색이 된 뒤 별도 판단. 커밋·푸시·PR은 별도 지시."
completed-at: "2026-09-22"
verification-summary: "A(Execution Plan 1~7) 구현 완료, 게이트 전부 녹색 — check pass · test:web 350/350(+14) · test 165/165 · test:templates 25/25 · test:server 2/2. 마이그레이션 20260920000000 리허설 후 적용 완료. A-9 화면(/settings/tokens)은 세션 쿠키 민팅으로 200 렌더와 헤더 진입점까지 확인했다(1차 500은 dev 서버의 globalThis 캐시 client였고 코드 수정 없이 재기동으로 해소). hu_는 /api/mcp에 실호출해 initialize 200 · 내 슬러그 성공 · PROJECT_REQUIRED · NOT_YOURS · 폐기 후 401을 실물로 확인했다(토큰은 삭제, 전후 0행). CI check(PR #55)는 build 포함 success. C-1(POST /api/projects)과 C-2(생성기 --register · SKILL 토큰 분기)는 구현·시험 완료 — test 176/176, test:web 369/369, CI check(PR #57) success(1차는 픽스처가 git 기본 브랜치를 환경에서 물려받아 CI에서만 실패했고, git init -b main으로 고정해 해소). REST 3종(/api/templates·/api/runbook·/api/project)의 hu_ 경로도 실토큰으로 확인했다 — 성공·PROJECT_REQUIRED·NOT_YOURS에 hs_ 회귀까지 15개 단언, runbook은 쓰기라 원값을 복원했다. 미실행: test:server:integration(격리 DB 부재 — templates·agent-runs 갱신이 미검증으로 들어감) · 발급·폐기 서버 액션 · C의 동시성 판정((g)(i)) · init 재실행 수동 인수. C-3(셸 설정)은 **제안서보다 좁게 완료**했다 — HARNESS_SERVER는 에이전트가 직접 설정하고, 토큰은 값을 받지 않는다(붙여넣으면 transcript에, setx는 셸 히스토리에 남는다). 그래서 '프로젝트마다 0회'는 달성하고 토큰은 '머신당 1회'로 남는다. 제안서가 목표한 '설정 0회'를 원하면 그 맞교환을 명시적으로 승인해야 한다 — 미결 결정이다. B-1은 2026-09-21에 선택지 3(사용자 범위 등록)으로 구현·머지됐다(PR #66) — 개명 0곳이고 이 저장소 하나로 닫혔다. **2026-09-22 `mathgic`에서 실사용 인수까지 통과했다**(PR #72): `.mcp.json` 미생성 · `server:` 줄 출력 · 진짜 `harness` 이름으로 사용자 범위 등록·연결(재시작 불필요) · `harness_owner` 올바르게 생략 · `project_sync` 성공(보드에 `web-dev` 로스터 생성 — 조건이 요구한 `project_get`보다 강한 증거다). 전달 경로는 플러그인 0.3.0 상승 + `main` 승격이 전제였고(3-h), 실사용이 웹 문구 드리프트와 토큰 배치 문제를 드러내 별도 작업으로 이어졌다(3-i). B-2는 배포 부재로 여전히 미착수다."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-09-20-init-fewer-questions.md"
  - "docs/proposals/completed/2026-09-15-individual-project-availability.md"
  - "docs/proposals/completed/2026-09-09-session-approval-channel.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/invariants.md"
  - "docs/conventions/product-copy.md"
  - "plugin/skills/init/SKILL.md"
---

# 프로젝트 정체를 토큰에서 떼어낸다 — 설정은 머신당 한 번, 그것도 에이전트가 한다

## Summary

`/harness:init`의 질문은 [init-fewer-questions](../completed/2026-09-20-init-fewer-questions.md)로 7~9 → 1이 됐지만,
**질문 이전의 설정**은 그대로다. 프로젝트마다 웹에서 토큰을 발급하고, 셸에 `HARNESS_TOKEN`을
넣고, 저장소마다 `.mcp.json`을 쓰고 재시작·승인한다.

뿌리는 하나다 — **토큰이 곧 프로젝트다.** `makeVerifyToken`이 `extra.projectId`를 싣고
(`src/server/mcp/auth.ts:15`), 13개 도구 전부가 `scope(ctx)`로 그 값을 꺼낸다
(`src/server/mcp/tools.ts:68-73`). 그래서 토큰은 프로젝트 단위일 수밖에 없고, 셸 하나에
프로젝트 하나만 살 수 있다.

이 제안은 프로젝트 정체를 **토큰에서 인자로** 옮긴다(A). 그러면 토큰이 사용자 단위가 될 수 있고
(`hu_`), 에이전트가 등록과 셸 설정까지 대신할 수 있으며(C), 플러그인이 MCP 서버를 직접 선언하는
길도 열린다(B).

**A+C의 도착점**은 프로젝트마다 남는 일이 `/harness:init` 한 번과 워크스페이스 확인, 그리고
재시작·`/mcp` 승인뿐이고 **토큰·URL 설정은 0**이다. **완전한 "프로젝트마다 0회"는 B-1이
필요하고, B-1은 2026-09-21에 선택지 3(사용자 범위 등록)으로 결정됐다**(Approval) — "비용이 이
저장소 밖에 걸쳐 있다"는 우려는 **선택지 1에만** 해당했고, 3번은 이 저장소 하나로 닫힌다.

A는 새 패턴을 만들지 않는다. `gate_approve`가 이미 호출마다 `ownerUserId`로 소유를 확인하고
(`src/server/mcp/owner-tools.ts:38-39`, `protocol.md:92`), 웹은 `requireProjectOwner`로 같은
판정을 한다(`src/server/auth/guard.ts:15-20`). A는 그 술어를 에이전트 스코프로 넓히는 일이다.

## Goal

- 프로젝트 정체의 출처를 **토큰 → 도구 인자**로 옮긴다. 토큰은 "누구냐"만 말한다.
- 사용자 단위 토큰(`hu_`)을 도입해 **토큰 발급·설정을 머신당 1회**로 만든다.
- *(B-1, 2026-09-21 결정: 선택지 3)* **저장소마다의 `.mcp.json`·재시작·승인을 없앤다.** 목표는
  그대로이고 **수단이 바뀌었다** — 플러그인이 서버를 선언하는 대신 **사용자 범위로 머신당 1회**
  등록한다. 도구 이름이 안 바뀌므로 저장소 밖 비용이 사라진다.
- 에이전트가 프로젝트 등록과 셸 변수 설정을 **직접 수행**한다 — 명령을 화면에 띄워 사용자에게
  복사시키지 않는다.
- 기존 `hs_` 토큰으로 연결된 저장소는 **변경 없이 계속 동작**한다.
- 작업 유형: 인증·인가 경계 변경, 데이터 구조 추가(마이그레이션), API 계약 변경, 플러그인 패키징
  변경, 웹 UI·카피 추가, 문서 갱신, 테스트 추가.

## Proposal Size

`proposal-size`: `standard`

선택 근거 — 강제 조건에 다수 해당한다.

- **인증·인가 흐름 영향**: 토큰 종류 추가, 검증기 확장, 요청마다의 새 소유 판정.
- **마이그레이션·데이터 구조**: `UserToken` 표 신설.
- **API 계약 변경**: MCP 도구 13종의 입력, 기존 REST 3종의 인증 방식, 신규 쓰기 라우트 1종
  (`POST /api/projects`).
- **5개 이상 파일 변경**: 아래 Affected Files 참조.
- **롤백이 단순 revert 이상**: 마이그레이션과 발급된 토큰이 남는다.

## Current State

### 프로젝트는 셸의 전역 상태다

```ts
// src/server/mcp/auth.ts:15 — 토큰이 프로젝트를 말한다
return { token: plain, scopes: ["agent"], clientId: row.projectId,
         extra: { projectId: row.projectId, tokenId: row.id } };

// src/server/mcp/tools.ts:68-73 — 13개 도구가 전부 여기를 지난다
function scope(ctx: Ctx) {
  const projectId = extra?.projectId, tokenId = extra?.tokenId;
  if (typeof projectId !== "string" || typeof tokenId !== "string") throw new Error("unauthenticated");
  return { projectId, tokenId, actorRef: `token:${tokenId}` };
}
```

생성기가 저장소에 쓰는 `.mcp.json`에는 **프로젝트가 없다**(`plugin/bin/harness-init.mjs:204`):

```js
harness: { type: "http", url: `${SERVER}/api/mcp`, headers: { Authorization: "Bearer ${HARNESS_TOKEN}" } }
```

내용이 모든 저장소에서 사실상 같다. 프로젝트를 정하는 건 오직 `HARNESS_TOKEN` **값**이다.

귀결:

- 토큰이 프로젝트 단위여야 한다 → 프로젝트마다 웹에서 발급.
- 셸 하나에 프로젝트 하나 → 바꿀 때마다 재설정.
- 토큰이 유출되면 프로젝트 수만큼 교체.

### REST 세 경로도 같은 토큰에 묶여 있다

셋 다 `parseBearer(header)`(기본 kind `agent`)로 시작해 `hs_`만 통과시킨다.

| 경로 | 근거 |
| --- | --- |
| `GET /api/templates` | `src/server/templates-query.ts:21-31` |
| `POST /api/runbook` | `src/server/runbook-query.ts:27-33` |
| `GET /api/project` | `src/server/project-identity-query.ts:27-37` |

사용자 토큰만 가진 사람은 이 셋이 전부 막힌다. A의 범위가 MCP 밖으로 한 번 새는 지점이다.

### 화면은 사용자에게 명령을 복사시킨다

`product-copy.md:354-359`(2단계)가 `$env:HARNESS_TOKEN = "hs_…"`과 `$env:HARNESS_SERVER = "http://…"`를
보여 주고 사용자가 복사·실행한다. 5단계(`:369-372`)는 재시작과 `/mcp` 승인을 요구한다.
**명령을 출력해 사용자에게 시키는 것은 자동화가 아니다** — 이 제안이 없애려는 행위다.

### 이미 있는 것: 호출마다의 소유 판정

A가 필요로 하는 술어는 저장소에 두 번 구현돼 있다.

```ts
// src/server/auth/guard.ts:15-20 (웹)
const project = await prisma.project.findFirst({ where: { ownerUserId: userId, slug }, select: { id: true } });
if (!project) notFound();   // 없는 프로젝트와 남의 프로젝트를 같은 답으로 돌려준다

// src/server/mcp/owner-deps.ts:18-19 (소유자 MCP)
owner: async (projectId, userId) =>
  (await prisma.project.findFirst({ where: { id: projectId, ownerUserId: userId }, select: { id: true } })) !== null,
```

그리고 `protocol.md:92`가 이미 계약으로 적어 두었다 — *"호출마다 도구 층에서 직접
소유권(ownerUserId) → 사용 가능 여부 → 플랜 순으로 검사한다."* A는 이 문장을 에이전트
스코프로 확장한다.

### 확인된 클라이언트 역량 (이 제안의 전제)

이 세션에서 실측·문서로 확인했다.

- **플러그인이 MCP 서버를 선언할 수 있다.** 플러그인 루트의 `.mcp.json`이 자동 발견된다 —
  `plugin.json`에 필드가 없어도 된다(설치된 context7 플러그인이 그 형태다).
- **플러그인 선언 서버는 프로젝트 승인을 거치지 않는다.** 이 저장소에는 `.mcp.json`이 없고
  `~/.claude.json`의 이 프로젝트 항목은 `enabledMcpjsonServers: []`·`mcpServers: {}`인데도
  `mcp__plugin_context7_context7__*`가 동작한다.
- **`${VAR:-기본값}` 확장이 `url`·`headers` 둘 다에서 동작한다.** context7이
  `"Authorization": "${CONTEXT7_API_KEY:-}"`를 프로덕션에서 쓴다.
- **MCP OAuth는 이 제안에서 채택하지 않는다.** 명세상 자원 서버 의무는 가볍지만(RFC 9728 문서
  제공 + audience 검증 + 401 challenge), 인가 서버는 제3자여야 한다. GitHub은 그 역할을 못 한다 —
  `/.well-known/oauth-authorization-server`·`/.well-known/openid-configuration` 모두 404이고
  동적 클라이언트 등록·RFC 8707 audience 바인딩이 없다. 설치된 v2 패키지에도 인가 서버 구현이
  없다. 하려면 **인가 서버를 직접 지어야 하고**, 그것이 없애는 건 "머신당 한 번의 클릭" 하나다.

## Scope

포함 범위:

- **A**: `UserToken`(`hu_`) 신설, MCP 검증기 확장, `scope()`의 프로젝트 해석·소유 인가,
  도구 13종 입력에 `project` 추가, REST 3종의 사용자 토큰 수용, `harness.json`에 `project.slug`.
- **B-1**(2026-09-21 결정: **선택지 3**): `plugin/.mcp.json`은 **만들지 않는다** — 그것은 선택지 1의
  수단이었다. 대신 스킬이 `claude mcp add --scope user`로 머신당 1회 등록하고,
  생성기는 `harness` 항목 쓰기를 중단한다(`--owner`일 때만 `harness_owner`를 쓴다),
  **에이전트 도구 이름 변경 — 이 저장소 + `Sangeok/harness-templates`(별도 저장소) + DB 재시드**.
- **B-2**(배포 뒤): 서버 URL 기본값.
- **C**: `POST /api/projects`(사용자 토큰 인증, 조회·생성을 한 Serializable 트랜잭션에) 신설,
  init의 `git remote` 기반 등록, 에이전트가 셸 변수 설정·브라우저 열기 수행.
- 위 각각에 대응하는 문서 갱신과 테스트: `protocol.md`·`invariants.md`·`product-copy.md`·
  `SKILL.md`, 그리고 **`docs/investigations/active/harness-platform.md:920`(v2 스펙 본문의 검증기
  코드 — A-2와 함께, B-1 승인과 무관)**. B-1이 실행될 때만 `rationale.md`·`system-overview.md`·
  같은 문서의 **도구 이름 일곱 곳**(`:176,181,189,322,1128,1129,1206` — `:920`과는 별개다)·
  `agent-role-catalog.md`(활성 제안서).

제외 범위:

- **MCP OAuth / 인가 서버 구축.** 위 근거로 보류한다.
- **토큰 발급 MCP 도구.** `token_issue`는 `tools.test.mjs:23-24`의 WEB_ONLY 가드에 있고
  불변식 4가 지키는 대상이다 — 에이전트 서버에 등록하지 않는다. 발급은 웹과 (C에서) 브라우저뿐이다.
- **저장소 소유권 검증.** 현재도 없다(`create-project.server.ts:28-30`은 형식만 본다).
  C가 그 상태를 악화시키지 않지만, 개선도 이 제안의 범위가 아니다 — GitHub App(Phase 4) 과제다.
- **팀·다중 사용자 권한.** `ownerUserId` 단일 소유 모델을 유지한다.
- **`hs_`·`ho_` 토큰의 폐기.** 둘 다 계속 동작한다.

## Proposal

### A. 프로젝트를 인자로, 토큰을 사용자로

**A-1. `UserToken` 표.** `OwnerToken`에서 `projectId`만 뺀 모양이다.

```prisma
model UserToken {
  id        String    @id @default(cuid())
  userId    String
  hash      String    @unique   // sha256(plain). 평문은 저장하지 않는다
  label     String
  createdAt DateTime  @default(now())
  revokedAt DateTime?
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

`User`에 `userTokens UserToken[]` 추가. `TOKEN_KINDS`에 한 항목:

```js
export const TOKEN_KINDS = { agent: "hs_", owner: "ho_", user: "hu_" };
```

`packages/core/token.mjs`를 고치고 `npm run sync:plugin-lib`으로 `plugin/lib/token.mjs`에
반영한다. 이 미러는 확인했다 — `scripts/plugin-lib.mjs:9`의 `isDeliverable`이 `packages/core`의
비테스트 `.mjs`를 전부 복사하므로 `token.mjs`·`config.mjs` 둘 다 대상이고, `--check`는 drift를
출력하고 exit 1 한다(`:40-46`).

**마이그레이션 순서.** `UserToken`은 순수 additive다 — 기존 표·열·행을 건드리지 않고 FK는
`User`를 향한다. 따라서 배포 순서 제약이 없다: 마이그레이션이 코드보다 먼저 가도(새 표가 놀고
있음) 코드가 먼저 가도(`hu_` 검증이 없는 표를 조회해 실패) 기존 `hs_` 경로는 영향받지 않는다.
권장 순서는 마이그레이션 → 코드다. 백필은 없다. 온라인 잠금도 없다(새 표 생성뿐).

**A-2. 검증기는 두 종류를 받는다.** `/api/mcp`의 `verifyToken`이 `hs_`와 `hu_`를 모두 수용한다.
접두로 먼저 갈리므로 표 조회는 한 번뿐이다.

- `hs_` → `extra: { projectId, tokenId }` (오늘과 동일)
- `hu_` → `extra: { userId, tokenId }`

**`clientId`도 정해야 한다 — 빠뜨리기 쉬운 필드다.** `auth.ts:15`는 `extra`와 별개로
`clientId: row.projectId`를 싣는다. `hu_`에는 프로젝트가 없으므로 **`clientId`는 토큰 id(`row.id`)로
둔다** — 소비자가 없어 동작에는 영향이 없지만(**코드에서** `clientId`를 쓰는 곳은 `auth.ts:15,26`과
`auth.test.mjs:14`뿐이고 `mcp-handler`도 읽지 않는다), **값을 정해 두지 않으면 구현자가 임의로
고르거나 `undefined`를 넣는다.** 굳이 `userId`를 쓰지 않는 이유는 그 필드가 원래 "이 연결이 무엇을
대표하는가"이지 "누구인가"가 아니기 때문이다.

**문서에도 같은 줄이 있다.** `docs/investigations/active/harness-platform.md:920`이 v2 스펙 본문에
`clientId: row.projectId`를 그대로 싣는다(그 밖은 완료된 제안서 넷뿐 — 역사 기록이라 고치지
않는다). 그 문서는 B-1에서 이미 갱신 대상이므로(Affected Files), `hu_` 분기를 넣을 때 **`:920`도
같이 손봐야 스펙이 코드와 어긋나지 않는다.**

`ho_`는 여기서 계속 거부된다 — 소유자 서버는 별도 엔드포인트·별도 검증기다(`protocol.md:83-86`).

`auth.test.mjs`는 **`clientId`와 `extra`를 둘 다 고정한다**(`:14`는 `clientId`, `:15`는 `extra`
전체를 `deepEqual`). 그래서 `hu_` 분기는 그 파일에 **자기 케이스를 새로 가져야 한다** — 기존 두
단언은 `hs_` 것이므로 수정하지 않는다.

**A-3. `scope()`가 유일한 인가 지점이 된다.**

```ts
async function scope(args: { project?: string }, ctx: Ctx, deps: ToolDeps) {
  const extra = ctx.http?.authInfo?.extra;
  const tokenId = extra?.tokenId;
  if (typeof tokenId !== "string") throw new Error("unauthenticated");
  // 기존 경로: 토큰이 프로젝트를 안다
  if (typeof extra?.projectId === "string") {
    return { ok: true as const, projectId: extra.projectId, tokenId, actorRef: `token:${tokenId}` };
  }
  if (typeof extra?.userId !== "string") throw new Error("unauthenticated");
  if (typeof args.project !== "string") return { ok: false as const, reason: PROJECT_REQUIRED };
  // 인가는 목적지에서, 호출마다 — owner-tools.ts:38과 같은 판정
  const projectId = await deps.projectFor(args.project, extra.userId);
  if (projectId === null) return { ok: false as const, reason: NOT_YOURS };
  return { ok: true as const, projectId, tokenId, actorRef: `token:${tokenId}` };
}
```

**미인증은 계속 throw한다** — `tools.test.mjs:54-58`이 `/unauthenticated/`를 단언하고, 그 뜻
("주체가 아예 없다")은 변하지 않는다. 새로 생기는 "내 것이 아니다"는 `fail()` 반환이다. 둘을
섞지 않는 것이 이 설계의 핵심이다.

새 dep 하나 — `ToolDeps`에 15번째 멤버로 추가한다. 기존 두 구현과 같은 쿼리다:

```ts
projectFor: async (slug, userId) =>
  (await prisma.project.findFirst({ where: { slug, ownerUserId: userId }, select: { id: true } }))?.id ?? null,
```

위 `scope()` 스니펫의 두 상수는 **A-5가 정하는 문구로 고정한다** — 구현자가 새로 지어내면 안 된다:

```ts
const NOT_YOURS = "not the owner of this project";        // product-copy.md:486의 기존 문장
// 슬러그가 아예 없는 옛 harness.json이 이 오류의 주된 원인이다(A-8) — 고치는 법을 문장에 담는다.
const PROJECT_REQUIRED = "project required: add project.slug to harness.json (rerun /harness:init once to write it)";
```

**A-4. 도구 13종의 입력에 `project`를 더한다.** `z.string().optional()` — 없으면 `hs_` 경로,
있으면 `hu_` 경로다. 호출부는 한 줄씩 바뀐다:

```ts
const s = await scope(args, ctx, deps);
if (!s.ok) return fail(s.reason);
const { projectId, actorRef } = s;
```

`ToolDeps`의 **기존 14개 메서드는 한 줄도 바뀌지 않는다** — 이미 전부 `projectId`를 첫 인자로
받는다(타입 선언은 `src/server/mcp/tools.ts:39-55`이고, `deps.ts`는 그 구현이다).
`board.ts`·`pipeline/run.ts`·`project-query.ts`도 그대로다 — **`agents/runs.ts`와 혼동하지 말 것.**
한 글자 차이지만 다른 파일이고, 그쪽은 A-10이 고친다. 다만 **타입 자체는 바뀐다** —
A-3의 `projectFor`가 15번째 멤버로 들어간다.

**`next.ts`는 예외다** — A-10이 `NextDeps.recentSteps`를 고친다. `ToolDeps`가 아니라 `NextDeps`라
위 "15번째 멤버" 계산에는 영향이 없지만, "그대로인 파일" 목록에서는 빼야 한다.

**A-5. 거부 문구는 기존 문장을 재사용하되, 카피 사양의 범위를 넓혀야 한다.**
`not the owner of this project`는 이미 존재하지만 `product-copy.md:486`의 행은
**`(owner server, gate_approve)`로 범위가 한정돼 있다.** A는 같은 문장을 에이전트 서버에서
쓰므로 그 괄호 주석을 넓히거나 `(agent server)` 행을 §12 표에 더한다 — 문장을 재사용하는 것과
사양이 그 사용을 허용하는 것은 다른 문제다.

없는 슬러그와 남의 프로젝트를 같은 문장으로 답하는 것은 기존 규칙을 따른다(`guard.ts:14` 주석,
`product-copy.md:847`) — 존재 여부를 흘리지 않는다.

**`PROJECT_REQUIRED`는 아예 새 문구이므로 §12에 행을 새로 만든다.** A-3에 적은 문장을 그대로
쓴다 — `project required: add project.slug to harness.json (rerun /harness:init once to write it)`,
범위는 `(agent server)`. 거부 문구의 단일 출처는 `product-copy.md §12`이고, 구현자가 코드에만
새 문장을 넣으면 그 규칙이 깨진다. 이 문구는 A-8의 전환 경로를 사용자에게 알려 주는 **유일한
런타임 창구**이기도 하다.

**A-6. 조회는 순증 없이 합친다.** `guardUnavailable`이 이미 매 호출 `deps.access(projectId)`를
부르고, 그 안의 `readProjectFactsIn`은 **이미 `ownerUserId`를 select한다**
(`src/server/project-access-query.ts:29`). `projectFor`와 `access`를 슬러그 하나로 받는 한
조회로 합치면 호출당 쿼리 수는 그대로다.

**A-7. REST 세 경로가 사용자 토큰을 받는다.**

| 경로 | 지금 | A 이후 |
| --- | --- | --- |
| `GET /api/templates` | `hs_` → 토큰의 프로젝트 | `hs_` 유지 · `hu_`면 `?project=<slug>` 필수 |
| `POST /api/runbook` | `hs_` → 토큰의 프로젝트 | `hs_` 유지 · `hu_`면 본문에 `project` 필수 |
| `GET /api/project` | `hs_` → "이 토큰은 어느 프로젝트냐" | `hs_` 유지 · `hu_`면 `?project=<slug>`로 "이 프로젝트를 확인해 달라" |

`/api/project`의 의미가 뒤집히는 점을 명시한다. 첫 연결에는 `harness.json`이 없으므로 슬러그도
없다 — 그 경로는 C가 `git remote` 기반 조회·등록으로 채운다.

**이 변경은 문서화된 보안 속성 하나를 의도적으로 제거한다.** `protocol.md:26-27`이 지금 이렇게
못박고 있다:

> 쿼리 인자가 없고 프로젝트 식별자도 받지 않는다 — `projectId`는 토큰에서만 나오므로
> **다른 프로젝트를 가리킬 입력이 없다.**

A-7은 `?project=<slug>`를 더해 바로 그 입력을 만든다. 없어지는 보호는 "입력이 없어서 불가능"이고,
대체하는 보호는 `projectFor`의 `ownerUserId` 일치 검사다 — 구조적 불가능에서 검사로 내려가는
같은 하락이 Risks 첫 항목에 적혀 있다. **이 문장은 반드시 함께 고쳐야 한다** — 고치지 않으면
아키텍처 문서가 코드와 반대를 말한다(AGENTS.md: 아키텍처 문서가 상위 규범).

**A-8. `harness.json`에 `project.slug`.** `packages/core/config.mjs:16-19`에 추가하되 **선택**으로
둔다. 생성기는 `--print-project` 결과에 슬러그를 담아 초안에 쓴다.

**"선택"의 뜻을 정확히 해 둔다 — `hs_`에만 해당한다.** 기존 토큰으로 연결된 저장소는 슬러그가
없어도 그대로 동작한다(프로젝트가 토큰에서 나오므로). 그러나 **`hu_`로 전환하려면 슬러그가
반드시 있어야 한다** — 없으면 넘길 값이 없어 모든 호출이 `PROJECT_REQUIRED`로 떨어진다.
따라서 전환 경로는 **"`hu_` 발급 전에 init을 한 번 재실행해 슬러그를 심는다"**이고, 이건
문서·스킬에 적어야 한다. A-8의 optional은 **하위호환을 위한 것이지 `hu_`가 슬러그 없이
동작한다는 뜻이 아니다.**

**A-9. 사용자 토큰 화면은 기존 토큰 페이지를 고치는 게 아니라 새로 만든다.**
기존 네 액션은 **구조상 프로젝트에 묶여 있다**(`manage-token.server.ts`):

```ts
export async function issueToken(slug: string, label: string) {
  const w = await requireProjectWrite(slug);          // :14  프로젝트 권한
  await prisma.projectToken.create({ data: { projectId, ... } });  // :18  projectId 필수
  revalidatePath(projectPath(slug, "/tokens"));       // :19  프로젝트 경로
}
```

`hu_`에는 **slug도, projectId도, 검사할 프로젝트 가용성도 없다.** 게다가 화면은
`/p/[slug]/tokens`이고 `tokens`는 `PROJECT_TABS`의 한 탭이다(`shared/routes/project.ts`) —
거기에 두면 계정 단위 자격이 **프로젝트 수만큼 중복 표시**된다.

그러므로 A는 다음을 **새로 만든다**(기존 네 액션·프로젝트 탭은 건드리지 않는다):

- `src/app/(app)/settings/tokens/page.tsx` — `requireUser()`만으로 인가. `(app)` 아래의
  계정 단위 경로는 `/billing`이 선례다.
- `src/fsd/shared/routes/user-tokens.ts` — `billing.ts`와 같은 모양의 경로 단일 출처.
  `project.ts:2-3`이 경고하듯 `revalidatePath` 문자열을 손으로 쓰면 조용히 낡은 화면이 남는다.
- 사용자 토큰 발급·폐기 액션 — `requireProjectWrite`가 아니라 `requireUser`를 쓰고
  `UserToken`에 쓴다.
- **진입점.** `(app)/layout.tsx`는 셸만 그리고 내비게이션이 없다 — `/billing`처럼 머리의
  배지나 `/projects`에서 링크를 걸어 주어야 도달 가능하다. 링크를 안 걸면 화면이 있어도 없다.

재사용하는 것은 `entities/project-token`의 **공개 UI뿐**이다(`token-reveal.tsx`의 1회 노출
규약과 `connect-command.ts`). 그 규약은 토큰 종류와 무관하다.

**A-10. 호출 한도의 분모가 바뀐다 — 같이 고치지 않으면 조용히 빡빡해진다.**
`agent_next`는 매 호출 앞에서 토큰 단위 한도를 본다:

```ts
// src/server/agents/next.ts:14
export const RATE_LIMIT = { calls: 60, windowMs: 10 * 60_000 }; // 토큰당
// :87-88
if ((await deps.recentSteps(tokenId, …)) >= RATE_LIMIT.calls)
  return fail(`rate limit: 60 calls per 10 minutes per token`);
```

그 집계에 **프로젝트 조건이 없다**(`runs.ts:33` — `callerTokenId` 또는 `run.tokenId`로만 센다).
지금은 `hs_`가 프로젝트 단위라 결과적으로 **프로젝트당 60회/10분**이다. `hu_`는 그 사람의 모든
프로젝트에 쓰이므로, 바꾸지 않으면 **프로젝트 셋을 동시에 돌릴 때 셋이 60회를 나눠 쓴다**(각 20회).
거부 문장은 "per token"이라 여전히 사실이지만, 읽는 사람이 아는 "토큰"의 뜻이 달라진다.

**해결: 사용자 스코프 주체일 때는 집계에 `projectId`를 함께 건다.** 그러면 오늘의
"프로젝트당 60회" 의미가 그대로 보존된다 — 새 정책을 만드는 게 아니라 **기존 의미를 유지하는**
쪽이다. `hs_` 경로는 지금 그대로 둔다.

바로 옆의 `recentRuns`가 **이미 소유자 단위로 범위를 건다**(`runs.ts:34-38`의
`project: { ownerUserId }`). 두 집계의 기준이 서로 다르다는 점이, `recentSteps`의 무(無)범위가
의도가 아니라 누락으로 보이는 근거다.

### B. 플러그인이 MCP 서버를 선언한다

B는 **두 조각이고 막는 것이 서로 다르다.** B-1을 막는 것은 배포가 아니라 **범위 결정**이고
(비용이 이 저장소 밖에 있다 — Approval), B-2를 막는 것은 **배포의 부재**다. 둘을 한 덩어리로
승인하거나 보류하면 안 된다.

**B-1 선택지 1 — 기술적으로는 가능하지만 비용이 크다. 2026-09-21에 채택되지 않았다(Approval 참조).**
아래 분석은 그 비용이 실제로 얼마인지의 기록이자, 선택지 3이 그것을 어떻게 피하는지의 근거다.
`plugin/.mcp.json`(루트, 자동 발견), 기본값 없이. **선언하는 서버는 `harness` 하나뿐이다:**

```json
{
  "mcpServers": {
    "harness": {
      "type": "http",
      "url": "${HARNESS_SERVER}/api/mcp",
      "headers": { "Authorization": "Bearer ${HARNESS_TOKEN:-}" }
    }
  }
}
```

**`harness_owner`를 여기 넣으면 안 된다.** 매니페스트는 조건부가 될 수 없는데 그 서버는 조건부여야
한다 — 지금 생성기는 `--owner`가 있을 때만 쓴다(`harness-init.mjs`의 `OWNER` 플래그와 조건부
전개). `/api/mcp/owner`는 `withMcpAuth(..., { required: true })`이고(`owner/route.ts:9`) 소유자
토큰은 **Pro 이상에서만 발급된다**(`manage-token.server.ts:35`). 그러므로 무조건 선언하면
**Free 사용자 전원과 소유자 토큰을 발급한 적 없는 Pro 사용자 전원이, 모든 저장소에서, 영구히
실패하는 서버 하나를 `/mcp`에 달고 다니게 된다.** context7 선례는 여기 적용되지 않는다 — 그쪽
서버는 익명 접근을 허용하고 우리 것은 인증을 요구한다.

**따라서 `harness_owner`만 저장소 수준 `.mcp.json`에 남긴다.** 생성기는 `--owner`일 때만 그
파일을 쓰고, 그 외에는 아무것도 쓰지 않는다. 대가: 소유자 토큰을 쓰는 사용자에게는 저장소
`.mcp.json`·재시작·승인이 그대로 남아 **B-1의 이득이 부분적으로만 적용된다**(Risks에 기록).

그래서 생성기의 동작은 이렇게 갈린다: **`harness` 항목은 더 이상 쓰지 않고**, `--owner`일 때만
`harness_owner` 하나짜리 `.mcp.json`을 쓴다. 소유자 토큰을 쓰지 않는 **대다수 사용자에게는
저장소마다의 `.mcp.json`·재시작·승인이 사라지고**, 소유자 토큰 사용자에게는 남는다.
`HARNESS_SERVER`는 여전히 필요하지만 그건 머신당 1회이고 C가 에이전트에게 맡긴다.
기본값이 없으므로 **C11을 깨지 않는다.**

#### B-1의 실제 비용 — 도구 이름 변경이 저장소 둘과 DB에 걸쳐 있다

**에이전트 서버 이름만 바뀐다:** `mcp__harness__*` → `mcp__plugin_harness_harness__*`.
**`mcp__harness_owner__*`는 그대로다** — 위에서 정한 대로 소유자 서버는 플러그인이 선언하지
않고 저장소 수준에 남기 때문이다. 두 패턴은 문자열로 깔끔히 갈린다(`mcp__harness__`는
`mcp__harness_owner__`에 걸리지 않는다 — 실측 확인). 실제 대상을 **패턴별로 나눠** 전수 조사한
결과는 이렇다.

**(1) 이 저장소 안 (5개 문서 + 1개 스킬, 에이전트 이름 23곳):** `protocol.md:52` ·
`rationale.md:40` · `system-overview.md:50` · `product-copy.md:40` ·
**`docs/investigations/active/harness-platform.md:176,181,189,322,1128,1129,1206`**(7곳) ·
`plugin/skills/init/SKILL.md:57,63,80`(3곳).

**바꾸지 않는 소유자 이름(같은 파일들 안에 섞여 있다):** `protocol.md:84` ·
`product-copy.md:674,751` · `SKILL.md:59`. 행 단위로 가려서 고쳐야 한다 — 파일 단위로
일괄 치환하면 소유자 이름까지 바꿔 `harness_owner` 연결이 깨진다.

마지막 것을 빼면 안 된다 — 그 문서는 **v2 스펙 본문**이고(§1~§9 + 구축 계획), `:189`가
`protocol.md:52`와 **같은 문장**으로 도구 이름 규칙을 못박으며 `:322`는 생성되는 `tools:` 예시를,
`:1128-1129`는 init 절차를 적어 둔다. B-1은 이 일곱 곳을 전부 거짓으로 만든다.

**(2) 다른 저장소 (템플릿 9개 + 시험 1개 = 10개 파일 44곳).** `plugin/templates/`는 **이
저장소의 파일이 아니다** — `.gitignore:50-51`이 제외하고(`git ls-files plugin/templates/` = 0),
`plugin/templates/.git`의 remote는 `Sangeok/harness-templates.git`인 **별도 private 저장소**다.
에이전트 이름 대상: `agents/dev.md`(10) · `agents/pm.md`(5) · `agents/doc-auditor.md`(3) ·
`agents/plan-verifier.md`(3) · `CLAUDE.runbook.md`(3) · `agents/feature-scout.md`(2) ·
`docs/agents/README.md`(1) · `docs/plans/README.md`(1) · `docs/plans/template.md`(1), 그리고
`templates.test.mjs`의 `:18`(`MCP()` 헬퍼)·`:165`·`:184`·`:286`.

**여기서도 소유자 이름은 그대로 둔다:** `CLAUDE.runbook.md:129`와 `templates.test.mjs:177,187`.
특히 `templates.test.mjs:174-180`·`:182-188`은 **소유자 서버를 단언하는 블록**이므로 건드리지
않는다 — 앞선 판에서 이 두 블록을 변경 대상으로 적었던 것은 과잉이었다.

이 아홉은 디렉터리 순회로 파일별 개수를 따로 세어 확인했다(첫 조사의 `grep -rln`과 다른 경로).
`en/docs/plans/verification-paths.md`와 `plugin/templates/README.md`는 **0곳**이라 대상이 아니다.

**(3) DB 재시드.** `/api/templates`는 `Template` 표에서 내려준다. 템플릿 원문을 고쳐도
`npm run seed:templates`(`scripts/seed-templates.ts`, 주석대로 **손으로 돌리는** 스크립트)를
돌리기 전에는 아무 저장소에도 도달하지 않는다.

**(4) 이미 생성된 저장소.** 연결된 저장소의 `.claude/agents/*.md` 스텁에는 **옛 이름이 박혀
있다.** 재실행하면 lock 관리 파일은 덮어쓰지만 사용자가 손댄 파일은 `skip(modified)`로 남아
옛 이름을 계속 들고 있다(`SKILL.md` 3단계).

즉 B-1은 **한 PR이 아니라 두 저장소의 조율된 릴리스 + 수동 재시드 + 기존 저장소 재실행 안내**다.
A·C와 같은 결로 묶을 수 없다.

**대안(참고용, 이번 범위 밖):** 도구 이름을 유지하려면 플러그인이 아니라 **사용자 범위 MCP
등록**(`claude mcp add --scope user`)을 쓰는 길이 있다. 승인 프롬프트도 없고 이름도 `harness`
그대로이지만, 플러그인이 아니라 사용자가(또는 C의 에이전트가) 한 번 실행해야 한다.
**2026-09-21 검증 완료** — Verification Results의 해당 행을 보라. 이 경로는 C-3과 결이 같다:
비밀이 아닌 설정은 에이전트가 대신하고 토큰 값은 건드리지 않는다.
**실행 시 함정**: 헤더를 큰따옴표로 감싸면(`-H "Authorization: Bearer ${HARNESS_TOKEN}"`)
**셸이 먼저 치환해** 평문(또는 빈 값)이 설정 파일에 저장된다. 참조를 남기려면 작은따옴표여야 한다.

**B-2 — 배포 뒤로 보류.** `"url": "${HARNESS_SERVER:-<production-url>}/api/mcp"`로 기본값을 넣어
`HARNESS_SERVER`마저 없애는 조각이다. **전제가 부재함을 확인했다** — 이 저장소에는 배포가 없다:
`.github/workflows/`에 `check.yml` 하나뿐이고 그 안의 유일한 URL은 CI용 Postgres DSN이며,
vercel·netlify·fly·docker 설정이 없고, `.env.example:5`는 `http://localhost:3000`이고, 문서
어디에도 배포 주소가 없다. 가리킬 호스트가 생기기 전에는 이 조각을 실행할 수 없다.

B-2를 실행할 때는 **C11(서버 URL 기본값 금지)의 예외를 명시적으로 승인받아야 한다.** 그 원칙은
*생성기가 남의 저장소에 잘못된 호스트를 박는 것*을 막는 규칙이고(`harness-init.mjs:63` 주석),
플러그인 자신의 매니페스트가 우리 서비스를 가리키는 것은 다른 사안이며 `${VAR:-}`가 자체 호스팅
경로를 남긴다 — 그러나 그 판단은 승인자의 것이다.

**B-1은 A 없이 실행하면 안 된다.** 지금 구조로 플러그인 수준에 올리면 머신의 모든 저장소에 서버가
붙고, 쓰는 곳은 그 순간 `HARNESS_TOKEN`이 가리키는 프로젝트다 — Stagekeeper와 무관한 저장소에서
돌린 에이전트가 **다른 프로젝트의 보드에 조용히 쓴다.**

### C. 에이전트가 등록과 설정을 수행한다

- `POST /api/projects` — `hu_` 인증. 본문 `{ owner, repo, branch, slug?, name? }` →
  `registerProjectIn`. 슬러그 미지정이면 `repo`에서 생성하고 충돌 시 접미사를 붙인다.
- `/harness:init`이 `git remote get-url origin`에서 owner·repo를, `git branch --show-current`에서
  branch를 읽어 호출한다. **웹 폼 5필드가 0이 된다.**
- 토큰이 없으면 에이전트가 발급 페이지를 **직접 열고**, 받은 값으로 `setx`(Windows) /
  셸 프로필 추가(POSIX)를 **직접 실행**한다. 명령을 출력해 복사시키지 않는다.

`product-copy.md §9`의 2·5단계는 이 단계에서 다시 쓴다 — 복사할 명령이 사라지기 때문이다.

#### C의 쓰기 안전성 — `POST /api/projects`

이 경로는 **상태를 바꾸는 유일한 신규 표면**이고, 프로젝트 상한이라는 **공유 집계를 읽고 조건부로
생성**한다(`registerProjectIn`이 `capError(owner.plan, "projects", owner.projects.length)`로 세고
통과하면 `create`). 네 가지를 명시한다.

- **동시성(서로 다른 호출자).** 웹 경로가 이미 답을 갖고 있다 — `create-project.server.ts:34-36`이
  상한 검사와 생성을 `withAvailabilityTransaction`(Serializable) **한 트랜잭션**에 넣는 이유를
  주석으로 적어 두었다: "따로 두면 동시에 온 두 요청이 둘 다 '아직 여유 있음'을 읽고 둘 다 만든다."
  새 라우트는 **같은 함수·같은 트랜잭션을 그대로 호출한다** — 상한 판정을 라우트에서 새로
  구현하지 않는다.
- **멱등성(같은 호출자 재실행).** `/harness:init`은 재실행이 정상 흐름이다(런북 갱신, 플랜 변경).
  그러므로 이 라우트는 **먼저 `(ownerUserId, repoOwner, repo)`로 기존 프로젝트를 조회하고, 있으면
  그것을 돌려준다**(생성 없이 200). 없을 때만 생성한다. 이 조회가 없으면 init 재실행이
  `<repo>-2`를 만들어 조용히 두 번째 프로젝트를 만든다.

  **그 조회는 반드시 생성과 같은 트랜잭션 안에 있어야 한다.** 스키마에
  `@@unique([ownerUserId, repoOwner, repo])`가 **없으므로**(현재 `@@unique`는
  `[ownerUserId, version]`·`[projectId, agent]`·`[projectId, key]`·`[projectId, version]`뿐이고
  `Project`의 유일 키는 `slug`다), 트랜잭션 밖에서 조회하면 그 자체가 무방비 read-then-create
  경쟁이 된다. `withAvailabilityTransaction`은 `Serializable`이고 P2034를 세 번까지 재시도하며
  (`project-availability-service.ts:6,19`), `readOwnerAvailabilityIn:41`이 이미 그 사용자의 프로젝트
  전체를 같은 스냅샷에서 읽는다 — **조회를 이 안으로 넣으면 두 번째 요청은 P2034로 직렬화 실패 후
  재시도해 첫 요청이 만든 행을 본다.** `appendAvailabilityEventIn:62-66`의 version CAS가 두 번째
  방어선이다.

  `@@unique([ownerUserId, repoOwner, repo])`를 더하면 DB가 마지막 방어선이 되지만, **기존 데이터에
  중복이 있으면 마이그레이션이 실패한다** — 추가하려면 먼저 중복 조회가 필요하다. 이번 범위에서는
  트랜잭션 안 조회로 충분하다고 보고, 제약 추가는 후속으로 남긴다.
- **중복 제출.** 위 조회로 흡수된다. 경쟁에서 져서 `slug` 유니크 충돌(P2002)이 나면 **이 라우트는
  웹과 다르게 동작해야 한다**: `create-project.server.ts:47-51`은 P2002를 사용자에게
  `'<slug>' is already taken.` **오류로 돌려준다**(사람이 슬러그를 고르는 폼이므로 옳다). 반면
  에이전트 경로는 슬러그를 스스로 만들므로, 충돌 시 **조회로 되돌아가 기존 행을 돌려준다** —
  사용자에게 오류를 보이지 않는다.
- **부분 실패.** 생성은 단일 트랜잭션이라 중간 상태가 없다. 토큰 발급은 이 라우트가 하지 않는다
  (제외 범위) — 실패 시 사용자는 그냥 다시 부른다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `prisma/schema.prisma` | update | `UserToken` 신설 + `User.userTokens` | medium — 마이그레이션. additive라 기존 행은 불변 |
| `packages/core/token.mjs` · `plugin/lib/token.mjs` | update | `TOKEN_KINDS`에 `user`. 미러는 `sync:plugin-lib` | low — 추가만, 기존 접두 불변 |
| `packages/core/config.mjs` · `plugin/lib/config.mjs` | update | `project.slug` 선택 필드 | low — optional |
| `src/server/mcp/auth.ts` | update | 검증기가 `hs_`·`hu_` 수용. `hu_`의 `clientId`는 토큰 id(A-2) | **high** — 인증 경계 |
| `src/server/mcp/auth.test.mjs` | update | `:14`가 `clientId`를, `:15`가 `extra` 전체를 `deepEqual`로 고정한다 — `hu_` 분기의 케이스를 **추가**한다(기존 `hs_` 단언은 불변) | low — 시험 |
| `src/server/mcp/tools.ts` | update | `scope()` 재작성 + 13종 입력·호출부 | **high** — 새 인가 지점 |
| `src/server/mcp/deps.ts` | update | `projectFor` dep, 검증기 바인딩 | medium |
| `src/server/agents/next.ts` · `runs.ts` | update | **A-10.** 한도 집계(`recentSteps`)에 프로젝트 범위 추가 — `next.ts:35,87` 시그니처·호출부와 `runs.ts:33` 쿼리. 안 고치면 `hu_` 사용자의 모든 프로젝트가 60회/10분을 나눠 쓴다 | **high** — 런타임 동작 변화 |
| `src/server/mcp/tools.test.mjs` | update | `ctx` 픽스처(`:26`), 미인증/내것아님 분리 시험 | low — 시험 |
| `src/server/{templates,runbook,project-identity}-query.ts` + 각 `.ts` 바인딩 | update | `hu_` + 슬러그 수용 | **high** — 인증 경계 3곳 |
| `src/app/api/{templates,runbook,project}/route.ts` | update | 파라미터 전달 | low — 배선만 |
| `src/app/api/projects/route.ts` | create | C의 등록 경로 | **high** — 쓰기·신규 라우트 |
| `src/fsd/entities/project-token` | update | `token-reveal.tsx`·`connect-command.ts`의 1회 노출 규약만 재사용 — 토큰 종류와 무관하다 | low — 기존 UI 재사용 |
| `src/app/(app)/settings/tokens/page.tsx` | **create** | 사용자 토큰은 계정 단위라 `/p/[slug]/tokens`에 둘 수 없다 — `tokens`는 `PROJECT_TABS`의 탭이고 거기 두면 프로젝트 수만큼 중복된다. `/billing`이 계정 단위 경로의 선례 | medium — 신규 라우트 |
| `src/fsd/shared/routes/user-tokens.ts` | **create** | `billing.ts`와 같은 경로 단일 출처. 손으로 쓴 `revalidatePath`는 조용히 낡은 화면을 남긴다(`project.ts:2-3`) | low |
| 사용자 토큰 발급·폐기 액션(신규) | **create** | 기존 넷은 `requireProjectWrite(slug)`+`projectId`+`projectPath`로 **구조상 프로젝트에 묶여 있다**(`manage-token.server.ts:14,18,19`). `hu_`에는 셋 다 없다 — `requireUser` 기반으로 새로 만든다 | **high** — 인증 경계 |
| 새 페이지의 진입점(머리 배지 또는 `/projects` 링크) | update | `(app)/layout.tsx`는 셸만 그리고 내비가 없다 — 링크를 걸지 않으면 화면이 있어도 도달 불가 | low |
| `src/fsd/{features/manage-token,pages/project-tokens}` | **keep** | 프로젝트 토큰·소유자 토큰 화면은 그대로 둔다 — 이번 변경이 건드리지 않는다 | none |
| `plugin/.mcp.json` | **만들지 않음** | 선택지 1의 수단이었고 2026-09-21에 **선택지 3**으로 결정돼 이 파일은 생기지 않는다. (당시 설계 기록: `harness` 하나만 선언하고 `harness_owner`는 조건부라 제외 — `owner/route.ts:9` required + Pro 게이트. 기본값을 안 쓰므로 C11 예외도 불필요했다.) | none — 3번은 플러그인 선언을 쓰지 않는다 |
| `plugin/bin/harness-init.mjs` | update | `.mcp.json` 쓰기 중단, 슬러그 전달, 등록 호출 | medium |
| `plugin/skills/init/SKILL.md` | update | **A-8 전환 안내**(`hu_` 발급 전 init 1회 재실행으로 슬러그 심기) + 설정 수행 지시 + B-1일 때 **에이전트** 도구 이름 `:57,63,80`만 변경(`:59`는 소유자라 유지) | medium — 전환 안내가 없으면 `hu_` 사용자가 `PROJECT_REQUIRED`에 막힌다 |
| `plugin/.claude-plugin/plugin.json` | update | 버전 상승(설치본이 갱신되려면 필수) | low |
| `docs/architecture/protocol.md` | update | 도구 13행의 `입력` 열, REST 3절, `:26-27`의 제거되는 보안 속성, **에이전트 도구 이름 `:52`만**(`:84`는 소유자라 유지) | low — 문서 |
| `docs/architecture/invariants.md` | update | `:75-78`의 "agent MCP는 project_get만" 문구 | low — 문서 |
| `docs/conventions/product-copy.md` | update | §9 토큰 페이지 2·5단계, **A-9의 새 화면 절**, **§12에 `PROJECT_REQUIRED` 신규 행 추가(agent server)**, **§12 `not the owner…` 행의 범위(`:486`은 owner server 한정)**, §13 표, **에이전트 도구 이름 `:40`만(B-1)** — `:674,751`은 소유자 이름이라 유지 | low — 문서 |
| `tests/server/integration/templates.test.ts` | update | `:40-48`이 `/api/templates` 응답 전체를 `deepEqual`하고 `:60-63`이 401 목록을 고정한다 — A-7이 둘 다 바꾼다 | **high** — 격리 DB 없이는 실행 불가라 조용히 썩는다 |
| `packages/core/deliver.test.mjs` · `src/server/agents/{next,steps}.test.ts` | update | 스텁 fixture에 `mcp__harness__agent_next`가 문자열로 박혀 있다(`deliver.test.mjs:6,21`) — B-1이 깨뜨린다 | medium — fixture staleness |
| `docs/architecture/{rationale,system-overview}.md` | update | 도구 이름 `rationale.md:40` · `system-overview.md:50`(B-1) | low — 문서 |
| `docs/investigations/active/harness-platform.md` | update | **v2 스펙 본문 — 두 시점에 손댄다.** **A-2에서 `:920`**(`clientId: row.projectId`를 싣는 검증기 코드)에 `hu_` 분기를 반영한다 — **B-1 승인과 무관하다.** B-1이 실행될 때 추가로 `:189` 도구 이름 규칙·`:322` 생성 `tools:` 예시·`:1128-1129` init 절차·`:176,181,1206` | medium — 스펙 문서라 코드와 어긋나면 상위 규범이 틀린다. **A만 하고 `:920`을 빼면 스펙이 코드와 반대를 말한다** |
| `docs/proposals/active/agent-role-catalog.md` | update | `:246-247`이 새 에이전트의 `tools:`를 `mcp__harness__*`로 지정한다 — B-1과 충돌하는 **활성 제안서** | medium — 제안서 간 조율 |
| **`Sangeok/harness-templates` (별도 저장소)** | update | 템플릿 9개 + `templates.test.mjs` = **10개 파일 44곳**(2026-09-20 실측). **`CLAUDE.runbook.md:129`와 `templates.test.mjs:177,187`은 소유자 이름이라 유지**(B-1) | **high** — 별도 PR이 필요하다(이 저장소의 PR에 담을 수 없다). 작업 자체는 가능하다: `plugin/templates/`가 로컬 작업트리이고 remote가 그 저장소다. **다만 착수 전에 그 저장소가 깨끗한지 확인할 것** — 2026-09-20 기준 `harness/server-clean-code` 브랜치에서 **8개 파일이 미커밋 상태**였고, 그 위에 44곳 일괄 변경을 얹으면 두 작업이 엉킨다 |
| **DB `Template` 표** | reseed | `npm run seed:templates` 수동 실행 없이는 템플릿 변경이 전달되지 않는다 | **high** — 배포 절차, 자동화 없음 |

## Safety Analysis

이 변경의 위험은 **삭제 오탐이 아니라 인가 누락**이다. 따라서 근거는 "참조가 없다"가 아니라
"모든 경로가 같은 판정을 지난다"로 세운다.

- **단일 관문.** 13개 도구가 전부 `scope()`를 첫 줄에서 부른다(`tools.ts:79-164`에서 확인).
  프로젝트를 다른 곳에서 얻는 도구는 없다. 인가를 이 함수에 두면 우회 경로가 없다.
- **기존 술어 재사용.** `findFirst({ slug, ownerUserId })`는 `guard.ts:17`·`owner-deps.ts:19`와
  같은 쿼리다. 새로 추론하는 값이 아니라 이미 FK로 존재하는 `Project.ownerUserId`를 읽는다.
- **하위호환 경로가 분기의 첫 가지다.** `extra.projectId`가 있으면 즉시 반환하므로 기존 `hs_`
  토큰의 **관측 동작이 변하지 않는다** — 프로젝트 해석도, 한도도(프로젝트당 60회/10분), 거부 문구도
  그대로다. 다만 **코드 경로는 한 군데 공유한다**: A-10이 `recentSteps` 시그니처를 바꾸므로
  `next.ts:87`의 한도 관문은 `hs_`도 지나간다. 그래서 "무변화"의 증명은 코드 경로가 아니라
  **단언 (m)**(수치·문구 무변화)이 진다.
- **미인증과 비소유를 분리한다.** 전자는 throw(기존 시험 유지), 후자는 `fail()`. 섞으면
  "남의 프로젝트"가 500이 되거나 "미인증"이 조용한 거부가 된다.
- **불변식 4는 영향받지 않는다.** 등록 집합은 그대로이고 `tools.test.mjs:31-37`의
  WEB_ONLY 가드가 계속 단언한다. `token_issue`를 추가하지 않는다.
- **`ho_`의 경계는 그대로다.** `parseBearer(header, "owner")`가 에이전트 서버에서 계속 거부한다.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — `src/app/api/*` 4개 라우트, `proxy.ts:5`의 matcher가 `/api` 제외
- [x] 정적 `import` / `export from` — `ToolDeps` 소비자(`deps.ts`)와 검증기 바인딩 확인
- [x] dynamic `import()` 또는 lazy loading — `src/server/`·`src/app/api/`·`plugin/bin/`·
      `packages/core/`에 동적 import 없음(유일한 일치는 `packages/core/config.test.mjs:67`로
      시험 파일이다). 토큰 UI 세 경로에 `next/dynamic`·`React.lazy` 없음
- [x] barrel export(`index.ts`) 경유 참조 — `src/fsd/entities/project-token/index.ts`
- [x] 테스트와 스크립트 참조 — `tools.test.mjs`의 `ctx` 픽스처, `plugin-lib.mjs --check`
- [ ] 정적 자산 URL 또는 `public` 직접 접근 — 해당 없음
- [x] 타입 선언, 전역 선언 — `ToolDeps`·`Ctx`·`AuthInfo.extra`
- [x] 런타임 side effect 또는 초기화 코드 — `prismaToolDeps` 모듈 수준 생성(`deps.ts:67`)
- [x] API, 외부 SDK 영향 — `mcp-handler`의 `withMcpAuth`, MCP 도구 이름 변경(B)

## Approval

승인 메모:

- **승인 전.**
- 승인 시 확정해야 할 것은 **둘**이다. (C11 예외는 지금 결정할 대상이 아니다 — 아래 참조.)
  1. **A·C 착수 여부.** A만으로는 사용자가 체감하는 변화가 없다 — C까지 갈 계획이 아니면
     A를 시작하지 않는 편이 낫다. A와 C는 이 저장소 하나로 닫힌다.
  2. **B-1의 세 선택지 중 하나**(아래).
- **B-2는 승인 대상이 아니다.** 이 저장소에 배포가 없음을 확인했으므로(§B 근거), 기본 서버 URL을
  넣는 조각은 실행할 수 없다. C11 예외 승인은 배포가 생긴 뒤 다시 요청한다.
- **B-1은 별도 결정이 필요하다(운영 결정 — 제가 대신 정하지 않는다).** 대조 과정에서 B-1의 실제
  비용이 드러났다: 도구 이름 변경이 **이 저장소 + `Sangeok/harness-templates`(별도 private
  저장소) + 수동 DB 재시드 + 이미 연결된 저장소의 옛 스텁**에 걸쳐 있다(§B-1의 실제 비용).
  선택지는 셋이다.
  1. **B-1 실행** — 두 저장소 조율 릴리스 + 재시드. 얻는 것: 저장소마다의 `.mcp.json`·재시작·승인 0.
  2. **B-1 보류** — A·C만 한다. 저장소마다 `.mcp.json`·재시작·승인이 남지만 그 외 설정은 0이 된다.
  3. **사용자 범위 MCP 등록으로 대체** — 도구 이름이 안 바뀌므로 (2)(3)(4)번 비용이 전부 사라진다.
     **2026-09-21에 검증했다**(Verification Results의 해당 행): `--scope user` 실재 · 승인 프롬프트
     생략 · 이름 `mcp__harness__*` 보존 · 헤더의 `${VAR}`가 **참조로 저장되고 접속 시점에 풀린다**
     (평문으로 굳지 않는다). 남은 것은 채택 결정뿐이다.
     **A가 이 선택지의 전제다** — 머신 하나에 서버를 한 번 거는 것은 토큰이 저장소를 가로지를 때만
     성립하고, 그게 `hu_`다(`hs_`는 저장소마다 토큰이 달라 불가능하다). 그리고 §B-1 끝의 경고
     (머신의 모든 저장소에 서버가 붙어 엉뚱한 프로젝트에 쓴다)는 A-3/A-7이 슬러그 없는 저장소를
     `PROJECT_REQUIRED`로 **거부**하게 만들어 해소된다 — 조용한 오기록이 아니라 명시적 거부다.
  **A와 C는 이 결정과 무관하게 진행할 수 있다.**

## Execution Plan

1. **A-1** `UserToken` 마이그레이션 + `TOKEN_KINDS` + `sync:plugin-lib`. 시험: 토큰 접두 분리.
2. **A-2·A-3** 검증기 확장과 `scope()` 재작성, `projectFor` dep. 시험을 **먼저** 쓴다 —
   미인증 throw 유지, 비소유 `fail`, `hs_` 경로 무변화, 슬러그 누락 거부.
   **여기서 `docs/investigations/active/harness-platform.md:920`도 함께 고친다** — v2 스펙 본문이
   `clientId: row.projectId`를 실은 검증기 코드를 그대로 담고 있어서, `hu_` 분기를 넣고 그 줄을
   두면 **스펙이 코드와 반대를 말한다**. 9.2의 같은 문서 갱신은 B-1에 묶여 있으므로, B-1이
   보류되면(Approval 선택지 2) 이 한 줄은 영영 안 고쳐진다.
3. **A-4 · A-10** 도구 13종 입력·호출부와 `tools.test.mjs` 픽스처 갱신. **A-10을 여기 붙인다** —
   `scope()`가 사용자 스코프 여부를 알아야 `agent_next`가 한도 분모에 프로젝트를 걸 수 있고, 그 값은
   `ToolDeps.agentNext` → `NextDeps.recentSteps` → `runs.ts` 쿼리까지 한 줄로 이어지기 때문이다.
   (**이 목록의 누락이었다**: A-10은 Affected Files의 `next.ts`·`runs.ts` 행과 Verification Plan의
   (k)(l)(m)에는 있었는데 Execution Plan에만 단계가 없었다. 번호를 1~7로 유지해야 Approval의
   `A(Execution Plan 1~7)` 참조가 깨지지 않으므로 새 단계가 아니라 이 단계에 합친다.)
4. **A-7** REST 3종. 각 `*-query.ts`의 주입 시험을 같은 모양으로 확장.
5. **A-8** `config.mjs` 슬러그 + 생성기 `--print-project` 확장. **그리고 전환 안내를 `SKILL.md`와
   `product-copy.md`에 쓴다** — "`hu_` 발급 전에 init을 한 번 재실행해 슬러그를 심는다".
   **이 단계는 B-1 승인과 무관하게 수행한다**: 9.2의 `SKILL.md` 갱신은 B-1에 묶여 있어,
   B-1이 보류되면(Approval 선택지 2) 전환 안내가 영영 안 써진다.
6. **A-9** 웹: `/settings/tokens` 신규 라우트 + `user-tokens.ts` 경로 헬퍼 + `requireUser` 기반
   발급·폐기 액션 + 진입점 링크. 기존 `/p/[slug]/tokens`와 네 액션은 **그대로 둔다**.
   `product-copy.md`에 새 화면 절 추가.
7. **A** 문서: `protocol.md` 입력 열 13행, `invariants.md:75-78`.
8. **C** `POST /api/projects`(조회·생성을 한 `withAvailabilityTransaction` 안에), init의
   `git remote` 등록, 셸 설정 수행.
   - **C-1 완료** — 라우트 + `project-registration.ts`(hu_ 전용 `resolveUserScope`) +
     `registerProjectResultIn`(멱등 조회를 **트랜잭션 안에서**) + `project-slug-rule.ts`.
     **슬러그를 트랜잭션 안에서 미리 고른다** — 제안서 초안은 "P2002가 나면 조회로 되돌아가
     기존 행을 돌려준다"였으나 그러면 **다른 사용자**가 그 슬러그를 쥔 경우 남의 프로젝트를
     돌려주게 된다(`Project.slug`는 전역 유니크다). 그래서 충돌을 미리 피하고 P2002는 최후 재시도로만 둔다.
   - **C-2 완료** — 생성기 `--register`(git `origin`·현재 브랜치 → `POST /api/projects`,
     출력 모양은 `--print-project`와 동일) + `SKILL.md` step 1의 토큰 접두 분기
     (`hs_` → `--print-project`, `hu_` → `--register`). `--print-project`에 끼워 넣지 않았다 —
     그 모드의 계약이 "아무것도 쓰지 않는다"인데 서버에 행을 만들면 거짓이 된다.
   - **C-3 완료 — 다만 제안서보다 좁게 했다.** 원문은 "토큰이 없으면 에이전트가 **받은 값으로**
     `setx`/셸 프로필 추가를 직접 실행한다"였다. 그대로 하면 보안이 두 군데서 나빠진다:
     붙여넣은 토큰이 **세션 transcript에 남고**, `setx HARNESS_TOKEN <값>`은 값이 명령줄에 실려
     **셸 히스토리에도 남는다.** 지금 방식은 토큰이 에이전트 문맥에 아예 들어오지 않으며,
     `SKILL.md`의 기존 규칙 "Never print the token value"와도 정면으로 충돌한다.
     그래서 **비밀이 아닌 것만 에이전트가 대신한다**: `HARNESS_SERVER`는 직접 설정(중복 줄 방지
     포함), 토큰은 발급 페이지를 열어 주고 히스토리에 안 남는 입력 방법을 안내하는 데까지만.
     **귀결: "프로젝트마다 0회"는 달성하고 토큰은 "머신당 1회"로 남는다** — 제안서의 "설정 0회"
     보다 약하지만, 토큰을 대화에 통과시키는 대가를 치르지 않는다. 0회를 원하면 그 맞교환을
     명시적으로 승인해야 한다. `product-copy.md` §9의 2단계에서 서버 줄을 빼고 그 근거를 적었다.
9. **B-1 — 2026-09-21에 선택지 3(사용자 범위 등록)으로 결정됐다.** 도구 이름을 바꾸지 않으므로
   아래 "실행하지 않는 1번 절차"는 기록으로만 남긴다. 검증 근거는 Verification Results의
   해당 행에 있다. **3번의 절차는 이렇다.**
   - **(3-a)** 스킬이 `claude mcp add --transport http --scope user harness <SERVER>/api/mcp -H 'Authorization: Bearer ${HARNESS_TOKEN}'`을 **머신당 1회** 수행한다.
     헤더는 **작은따옴표**여야 한다 — 큰따옴표면 셸이 먼저 치환해 평문이 설정 파일에 저장된다.
     **생성기가 아니라 스킬이 한다**: 생성기의 계약은 "이 저장소에 파일을 물질화한다"이고 머신
     전역 설정을 바꾸면 그 계약이 거짓이 된다. C-3에서 `HARNESS_SERVER`를 에이전트가 직접
     설정한 것과 같은 결이다.
   - **(3-b)** 생성기가 `.mcp.json`에 `harness`를 **쓰지 않는다. 다만 읽기는 남긴다** —
     `recoverServerFromMcp`(`harness-init.mjs:38-45`)는 이미 연결된 저장소를 위한 비용 없는
     레거시 폴백이고, (3-c)의 제거 로직이 어차피 그 파일을 권위 있게 파싱해야 한다.
     **초안의 "`claude mcp get`의 `URL:` 줄로 대체한다"는 철회한다** — 그러면 생성기가 `claude`를
     실행하게 되어, (3-a)에서 정한 원칙(생성기는 파일만 물질화하고 머신 설정은 스킬이 건드린다)과
     정면으로 어긋난다. 계획이 자기모순이었다.
   - **(3-b-2)** 대신 생성기는 **해석된 서버 URL을 출력한다.** 스킬이 `claude mcp add`에 넘길 주소를
     알 길이 그것뿐이다 — 출처 순서(`--server > HARNESS_SERVER > .mcp.json`)와 꼬리 정규화
     (`normalizeServer`)가 전부 생성기 안에 있기 때문이다. (3-a)에 이 고리가 빠져 있었다.
     이 출력은 정규화 시험(`harness-init.test.mjs:349-357`)의 **새 관측 지점**도 된다 — 그 시험은
     지금 `.mcp.json`에 실린 값으로 정규화를 확인하므로, 쓰기를 멈추면 관측 지점이 사라진다.
   - **(3-c)** 이미 연결된 저장소는 **깨지지 않는다.** 범위 우선순위가 `local > project > user`라
     기존 `.mcp.json`이 계속 이긴다. 그래서 3번의 이득도 자동으로 오지 않는다 — 재실행 시
     `harness`(`--owner`였다면 `harness_owner`도) 항목만 **제거**하고 다른 서버는 보존한다.
     **이 제거는 검토 대상이다**: `.mcp.json`은 lock 대상이 아닌 병합 파일이라, 항목을 빼는 것은
     지금까지 없던 종류의 연산이다.
   - **(3-c-2) 제거는 서버 URL 기록도 함께 없앤다 — 계획이 예견하지 못한 귀결이다(구현 중 발견).**
     `harness` 항목은 (3-b)가 남기기로 한 **URL 폴백의 실체**다. 생성기는 같은 실행에서 그 값을
     읽은 뒤 그 항목을 지우므로, 이후 `--server`도 `HARNESS_SERVER`도 없는 재실행은
     `Server URL required`로 멈춘다(`harness-init.test.mjs:337-346`이 이 경로를 잠그고 있었다).
     생성기가 사용자 범위 설정을 읽어 보완하는 것은 (3-a)의 원칙 위반이므로 **보완하지 않고 알린다**:
     지운 항목이 URL 출처이기도 했고 다른 출처가 없을 때 그 사실과 현재 주소를 출력한다.
     실무에서는 C-3이 `HARNESS_SERVER`를 심어 두므로 드물지만, **생성기가 자기 폴백을 말없이
     파괴하게 두지는 않는다.**
   - **(3-d)** 저장소마다 다른 서버를 가리켜야 하면 그 저장소에만 `.mcp.json`을 남긴다 — 우선순위가
     그대로 **덮어쓰기 탈출구**가 된다. "머신당 URL 하나"라는 제약의 해소책이다.
   - **(3-e)** `SKILL.md` 2·3·4단계(재시작·`/mcp` 승인)와 `product-copy.md`(8곳)·
     `harness-platform.md`를 갱신한다. `connect-command.ts:2-5`와 `public-url.ts:16`은
     **주석만** 낡는다(동작 무변). `SKILL.md`은 frontmatter `description:`까지 봐야 한다 —
     거기에도 "register .mcp.json"이 있어서 본문과 정면으로 모순된다.
   - **(3-e 정정 — 추정이 6배 빗나갔다)** 초안은 `harness-platform.md`를 "D7 `:52`, 파일표 `:172`,
     `:154,162,249`" 다섯 곳으로 적었는데 실제 언급은 **32곳**이다. 다만 **전부 고치면 안 된다**:
     - **살아 있는 규범 9곳(고친다)**: 물질화 표 `:23` · D5 `:50` · **D7 `:52`** · P3 `:68` ·
       저장소 구조도 `:122` · 파일표 `:154`·`:172` · local 디스패치 `:162` ·
       "서버 URL은 `.mcp.json`에 있다" `:249`.
     - **과거 기록 23곳(손대지 않는다)**: `:985-1114`는 **옛 시험·생성기 소스를 그대로 인용한
       스냅샷**이고 `:1128`·`:1138`은 옛 SKILL 본문, `:939`·`:1162`·`:1242`는 지난 실행의 인수
       결과다. 고치면 기록의 위조다. 같은 이유로 `rationale.md:95`("이 실행이 지나가지 않았다 —
       보고서 F4·T8")도 그대로 둔다 — 그 실행에 대해서는 여전히 참이다.
     **규칙: 이 문서에서 고칠 것은 규범 진술이지 인용된 과거가 아니다.**
   - **(3-f)** `harness-init.test.mjs`의 `.mcp.json` 단언(32줄)을 재작성한다.
   - **(3-h) 배포 경로 — 계획에서 빠졌던 항목이다(실사용 시도에서 드러났다).** 구현이 `dev`에
     머무는 한 사용자에게 도달하지 않는다. 마켓플레이스 `stagekeeper-local`의 source가
     **`GitHub (Sangeok/stagekeeper)`**이고, `claude plugin marketplace add`에는 브랜치·ref를
     고르는 선택지가 **없다**(`--claudeai`·`--scope`·`--sparse`뿐). 따라서 기본 브랜치 `main`을 받으며,
     **`dev` → `main` ff-only 승격이 전달의 전제**다. 그리고 `plugin/.claude-plugin/plugin.json`의
     **버전을 올려야 한다**(`0.2.0` → `0.3.0`) — 제안서 `:719`가 선택지 1 절차에서 이미 지적한 것인데
     선택지 3 계획에서 누락했다. 사용자 쪽 갱신 순서는
     `claude plugin marketplace update stagekeeper-local` → `claude plugin update harness@stagekeeper-local`
     → **재시작**(도움말이 "restart required to apply"라고 명시한다).
   - **(3-i) 웹 문구가 따라오지 않았다 — 2026-09-22 실사용(mathgic 연결)에서 드러났다.** (3-a)~(3-c)와 C-3은
     `product-copy.md`와 `SKILL.md`만 고쳤고(`a766a0e`·`6871680`) 화면은 한 줄도 건드리지 않았다. 그래서 웹은
     서버 줄·"generated `.mcp.json`"·"approve the server"를 그대로 보여 줬고, 계약 자신도 §9의 5단계·§5 배너·§15의
     `--owner` 문단에 옛 문장을 들고 있었다. 고친 것: 화면 다섯 군데와 계약의 세 절, 웹 안내는 `/harness:init`에서
     끝낸다(재시작·확인은 스킬의 것 — 두 곳에 적지 않는다). **재발 방지**: 계약의 해당 블록을 시험이 읽어 화면과
     대조하고(`copy-lock`), 옛 표현이 보이는 문구에 남았는지 따로 본다(`scripts/retired-copy.test.mjs`) —
     `docs/architecture/verification.md`의 "문구 잠금".
     **같이 드러난 것 — 토큰을 두는 곳은 종류가 정한다.** "머신당 1회"는 `hu_`의 것이다(위 (3)의 "A가 이 선택지의
     전제다"와 같은 이유): `HARNESS_TOKEN`은 변수 하나인데 `hs_`는 저장소마다 달라, 전역에 저장하면 두 번째 저장소가
     첫 번째를 덮어쓴다. 웹과 스킬이 이제 그렇게 나눠 말한다 — `hu_`는 히스토리에 안 남는 입력으로 영구 저장(평문으로
     남는다는 것을 화면이 말한다), `hs_`는 그 터미널에만. 스킬이 바뀌었으므로 플러그인은 `0.3.0` → `0.3.1`이고,
     전달 경로는 (3-h)와 같다.
     **남은 것**: 프로젝트 생성이 여전히 `hs_`를 발급하므로 새 사용자는 다음 날 새 터미널에서 토큰을 잃는다 — 화면이
     미리 말해 줄 뿐이다. 없애려면 생성 흐름의 기본을 `hu_`로 바꾸는 제품 결정이 필요하다.
   - **(3-g) `--owner`는 생성기에서 사라진다 — CLI 계약 변경이다.** 그 플래그는 생성기가
     `.mcp.json`을 썼기 때문에 존재했고, 쓰기가 없어지면 할 일이 없다. 소유자 서버도 사용자 범위에
     등록되며, 그 판단은 스킬이 `HARNESS_OWNER_TOKEN` 유무로 직접 한다(이미 `SKILL.md:82`가 그렇게
     한다). 주소는 생성기가 출력하는 `server: <base>`에서 `/api/mcp`·`/api/mcp/owner` 둘 다 파생된다.
     **조용히 무시하지 않는다**: `args.includes` 방식이라 모르는 인자는 소리 없이 버려지므로, 옛
     스킬이 `--owner`를 계속 넘기면 사용자가 소유자 서버를 잃고도 모른다. 그래서 넘어오면 어디로
     옮겼는지 알리는 줄을 낸다. `harness-init.test.mjs:121-131`(`--owner` 시험)이 이 계약을 따라간다.
   - **(3-a의 전제 — 2026-09-21 실측)** 같은 이름이 이미 있으면 `claude mcp add`는 **덮어쓰지 않고
     실패한다**(`... already exists in user config`, exit 1). 기존 항목은 **손대지 않은 채 남는다**.
     귀결이 둘이다. ① `claude mcp get harness` 선행 확인은 방어가 아니라 **필수**다 — 없으면 init
     재실행이 매번 exit 1로 실패하고, init은 routine하게 재실행되는 명령이다. ② **서버 URL이
     바뀌면 재등록만으로 고쳐지지 않는다** — 저장된 URL을 읽어 비교하고, 다르면
     `claude mcp remove harness -s user` 후 다시 add해야 한다. 그냥 add하면 **옛 주소가 조용히
     남는다**(실패는 보이지만 고쳐지지는 않는다).

   **실행하지 않는 1번(개명) 절차 — 기록용:**
   1. `Sangeok/harness-templates`에서 템플릿 9개 + `templates.test.mjs` = **10개 파일 44곳**의
      **에이전트** 도구 이름 변경 — `CLAUDE.runbook.md:129`·`templates.test.mjs:177,187`은 건드리지 않는다.
      **착수 전에 그 저장소가 깨끗한지 먼저 본다**(2026-09-20에는 8개 파일이 미커밋이었다) —
      진행 중인 작업 위에 일괄 변경을 얹으면 되돌리기 어렵게 엉킨다
   2. 이 저장소에서 `plugin/.mcp.json` 생성(**`harness` 하나만**), 생성기의 `harness` 항목 쓰기
      중단(`--owner` 경로는 유지), `SKILL.md`·문서 5종
      (`protocol`·`rationale`·`system-overview`·`product-copy`·`investigations/harness-platform`)·
      `agent-role-catalog.md` 갱신, `deliver.test.mjs`·`agents/{next,steps}.test.ts` fixture 갱신
   3. `npm run seed:templates` 수동 실행
   4. `plugin/.claude-plugin/plugin.json` 버전 상승 — 올리지 않으면 설치본에 전달되지 않는다
   5. 이미 연결된 저장소에 재실행 안내(`skip(modified)` 스텁은 옛 이름을 유지한다)
10. **B-2(서버 URL 기본값)는 배포가 생기기 전까지 실행하지 않는다.**

각 단계는 독립 커밋으로 둔다. **A(1~7)가 녹색이 되기 전에는 C를 시작하지 않는다.**
B-1은 2026-09-21에 선택지 3으로 결정됐고, **A와 무관하지 않다** — 머신 하나에 서버를 한 번 거는
것은 토큰이 저장소를 가로지를 때만 성립하므로 `hu_`(A)가 전제다(`hs_`로는 불가능하다).
그리고 **선택지 1과 달리 3번은 이 저장소 하나로 닫힌다**: `plugin/templates/`는 `.mcp.json`을
한 번도 언급하지 않으므로(실측) 별도 저장소도, DB 재시드도 필요 없다.

## Verification Plan

실행할 검증:

```bash
npm run check                 # plugin-lib --check · lint · typegen · tsc · architecture · project-availability
npm run test:web              # src/**/*.test.{mjs,ts} — tools.test.mjs 포함
npm run test                  # packages/core · plugin/bin — deliver.test.mjs의 스텁 fixture 포함
npm run test:templates        # plugin/templates/*.test.mjs — B-1의 도구 이름 계약을 단언한다
npm run test:server           # tests/server/*.test.ts (board-history · github 둘뿐)
npm run test:server:integration   # tests/server/integration/ — 격리 DB 필요, 아래 기준 참조

# B-1 전용 — 옛 **에이전트** 이름 부재 확인(살아 있는 표면에만). 출력이 없어야 통과다.
# mcp__harness_owner__는 **의도적으로 제외**한다 — 소유자 서버는 저장소 수준에 남아 이름이 안 바뀐다.
grep -rn "mcp__harness__" \
  plugin/skills plugin/templates docs/architecture docs/conventions \
  docs/investigations/active packages/core/deliver.test.mjs \
  src/server/agents/next.test.ts src/server/agents/steps.test.ts
```

검증 기준:

- `npm run check`가 녹색 — 특히 `plugin-lib.mjs --check`가 `packages/core` ↔ `plugin/lib` 동일성을
  확인해야 한다(`token.mjs`·`config.mjs`를 두 곳 다 고쳤다는 증거).
- `tools.test.mjs`의 기존 단언이 **수정 없이** 통과해야 하는 것: 등록 집합 동일성(`:31-37`),
  WEB_ONLY 가드, `product-copy §13` 바이트 일치(`:41-47`). 설명문을 바꾸지 않으므로 그대로여야 한다.
- 새로 추가할 단언(A): (a) `hs_` 토큰 + `project` 인자 없음 → 기존과 동일 동작, (b) `hu_` +
  내 프로젝트 → 성공, (c) `hu_` + 남의 슬러그 → `not the owner of this project`,
  (d) `hu_` + `project` 누락 → 거부, (e) 주체 없음 → `/unauthenticated/` throw 유지,
  (f) `ho_` → 에이전트 서버에서 401.
- **C 단언의 현재 상태(2026-09-20)**: (g) **구조만 고정됨** — 주입 시험이 재등록에 `create`가
  0회임을 단언하지만 동시성은 아니다. (h) **완료** — `resolveUserScope` 시험이 `hu_` 부재 401을
  고정하고 **`hs_`도 401**임을 함께 못박는다(두 해석기를 나중에 "통합"하면 프로젝트 토큰으로 새
  프로젝트를 만들 수 있게 되므로). (i) **미검증** — 상한 문구 경로는 기존 시험이 덮지만 동시 경쟁은 아니다.
  (j) **완료** — 다른 저장소가 같은 이름을 쥐면 접미사를 붙인다. 원문 계약은 아래와 같았다:
- **새로 추가할 단언(C — `POST /api/projects`)**: (g) 같은 `(owner, repo)`로 두 번 호출 →
  프로젝트가 **하나**만 생기고 두 번 다 같은 슬러그를 돌려준다(멱등성), (h) `hu_` 없이 호출 →
  401, (i) 상한이 찬 사용자 → `capError` 문구로 거부, (j) 슬러그 자동 생성이 기존 슬러그와
  충돌 → 오류가 아니라 기존 행 또는 새 접미사 슬러그를 돌려준다.
  **(g)와 (i)의 동시성 판정은 실제 PostgreSQL 없이는 증명되지 않는다** — Serializable 재시도와
  version CAS가 걸린 경로이므로 격리 DB가 생길 때 `tests/server/integration/`에서 닫는다.
- **새로 추가할 단언(A-10 — 한도 분모)**: (k) `hu_`로 프로젝트 A에서 한도만큼 호출한 뒤
  **프로젝트 B 호출이 거부되지 않아야 한다**, (l) 같은 프로젝트에서 한도를 넘기면 기존과 같은
  문구로 거부된다, (m) `hs_` 경로의 한도 동작은 **수치·문구 모두 무변화**.
  (k)가 실패하면 A-10을 구현하지 않은 것이다 — 이 단언이 "조용히 빡빡해짐"을 잡는 유일한 장치다.
- **새로 추가할 단언(A-2 — 검증기)**: (n) `hu_` 유효 토큰 → `extra`가 `{ userId, tokenId }`이고
  `clientId`가 **토큰 id**다, (o) `hs_`의 `clientId`·`extra`는 **기존 단언 그대로 통과**한다
  (`auth.test.mjs:14-15`를 고치지 않는다는 뜻이다), (p) `ho_`는 에이전트 검증기에서 계속
  `undefined`다(`auth.test.mjs:37-41`의 교차 거부와 같은 성격).
- **A-9에는 자동 단언이 없다 — 빠뜨린 것이 아니라 저장소 관례다.** `src/fsd`의 시험 16건은 전부
  `model/`의 순수 함수이거나 `ui/` 컴포넌트이고, **서버 액션을 시험하는 선례가 0건이다**(기존
  `issueToken`·`revokeToken`도 시험이 없다). 그래서 A-9은 타입·FSD 경계·lint로만 검증되며 화면과
  발급·폐기 액션의 동작은 **한 번도 실행된 적이 없다**. 실사용 확인은 마이그레이션 적용 뒤 수동 1회다.
  A-9에 굳이 시험을 붙인다면 대상은 순수 함수인 `userTokensPath()` 정도이고, 그것은 이 변경의
  위험한 부분이 아니다 — 위험한 곳은 `requireUser` 기반 인가이고 그건 실행으로만 확인된다.
- **A-7이 깨뜨리는 기존 시험**: `tests/server/integration/templates.test.ts:40-48`은 응답 전체를
  `deepEqual`하고, `:60-63`은 401이 나야 하는 헤더 목록을 `[null, 모르는 hs_, ho_]`로 고정한다.
  A-7 이후 그 목록에 **`hu_` + `project` 누락**이 추가돼야 하고, 200 경로에는 `?project=<slug>`
  변형이 추가돼야 한다. **이 시험은 격리 DB 없이는 돌지 않으므로, 고치지 않으면 깨진 줄도 모른다** —
  코드와 함께 고치되 미실행으로 기록한다.
- **B-1이 깨뜨리는 기존 시험**: `plugin/templates/templates.test.mjs`(`:18`의 `MCP()`,
  `:20-21`의 `EXPECTED`, `:160-166`·`:283-289`의 단언)와
  `packages/core/deliver.test.mjs:6,21`, `src/server/agents/{next,steps}.test.ts`의 스텁 fixture.
  앞의 것은 **별도 저장소**에 있다.
- **B-1의 옛 이름 부재 확인(신규 존재 확인만으로는 부족하다).** 에이전트 이름이 **19개 파일
  71곳**·두 저장소·DB에 흩어져 있어 **일부만 바꾸고 끝내는 것**이 가장 흔한 실패다(2026-09-20 실측
  내역: 이 저장소 27곳 = 문서·스킬 23 + fixture 4, 별도 저장소 44곳 = 71. **파일 수 19는 맞았고
  occurrence만 늘었다** — 처음 셀 때 이후 템플릿이 자라서일 가능성이 크니, 착수 시점에 **다시 센다**).
  위 `grep`이 **아무것도 출력하지 않아야** 통과다. 각 경로의 기대 판정은 이렇다.

  | 경로 | 판정 |
  | --- | --- |
  | `plugin/skills/`·`plugin/templates/`·`docs/architecture/`·`docs/conventions/`·`docs/investigations/active/` | **금지** — 남아 있으면 미완 |
  | `packages/core/deliver.test.mjs`·`src/server/agents/{next,steps}.test.ts` | **금지** — fixture가 옛 이름을 고정한다 |
  | `docs/proposals/completed/`·`docs/test-reports/completed/` | **허용** — 역사 기록이라 고치지 않는다 |
  | 이 제안서 자신 | **허용** — 변경 전후를 대조하는 문서다 |
  | **`mcp__harness_owner__` 전부** | **허용** — 소유자 서버는 저장소 수준에 남아 이름이 안 바뀐다. 이걸 금지에 넣으면 **영원히 통과할 수 없는 검사**가 된다 |

  `plugin/templates/`는 별도 저장소이므로 그 확인은 **그 저장소에서 따로** 돌린다 — 이 저장소의
  CI는 그 경로를 보지 않는다(`.gitignore:50-51`).
- **기존 실패와 신규 실패의 구분**: `npm run test:server:integration`은 `TEST_DATABASE_URL`이 없어
  현재 실행 불가다([src-server-clean-code-findings](./src-server-clean-code-findings.md)가 같은
  제약을 7곳에서 기록한다). 이 제안 때문에 생긴 실패가 아니며, 격리 DB가 생기기 전까지
  "미실행"으로 기록한다.

## Verification Results

아직 실행 전이면 `Not run yet`으로 둔다. 아래는 **A(Execution Plan 1~7) 구현 직후**의 실측(2026-09-20)에
**2026-09-21의 후속 검증**을 더한 것이다 — REST 3종의 `hu_` 경로 · A-10 범위 쿼리의 생성 SQL ·
B-1 선택지 3의 실현 가능성.
**C-1·C-2는 완료**다. **B-1도 2026-09-21에 선택지 3으로 구현·머지됐다**(PR #66) — 다만 **개명은
이 저장소에서도 템플릿 저장소에서도 한 곳도 하지 않았다.** 그래서 선택지 1의 개명을 전제한 행들은
`Not run yet`이 아니라 **해당 없음**이다: 실행될 날이 오지 않는 검사를 미실행으로 적어 두면
영원히 빚처럼 남는다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | **Pass** | `plugin/lib in sync` · FSD 통과 · typegen · `tsc --noEmit` · 21/21 · 17/17. 파이프 없이 종료 코드를 직접 확인했다(`tail`에 물리면 실패가 0으로 읽힌다) |
| `npm run test:web` | **350/350 pass** | 착수 시 336 → **+14**: A-7 주입 시험 11종(templates 5 · runbook 3 · project-identity 3) + A-10 (k)(l)(m) 3종 |
| `npm run test` | **165/165 pass** | 토큰 접두 분리 · `config.mjs` 슬러그 · 생성기 `--print-project` fixture |
| `npm run test:templates` | **25/25 pass** | A는 도구 이름을 바꾸지 않는다. `{{project.slug}}`가 새 템플릿 변수로 새지 않았음을 함께 확인했다 |
| `npm run test:server` | **2/2 pass** | 예상대로 A와 무관했다 |
| CI `check` 워크플로 (PR #55) | **success** | `npm ci` · `db:generate` · `check` · `test` · `test:web` · **`build`** 전부 녹색(run `35513082679`). **`npm run build`는 로컬에서 돌리지 않았으므로 이 행이 유일한 증거다** — `tsc --noEmit`이 잡지 못하는 빌드 시점 문제(새 라우트의 타입 수집, client/server 경계)가 없음을 확인한 자리다 |
| `npm run test:server:integration` | **미실행** | `TEST_DATABASE_URL` 부재 — 기존 제약. **`templates.test.ts`·`agent-runs.test.ts` 갱신이 미실행인 채로 들어간다.** 다만 그 시험들이 덮으려던 **제품 코드**(A-10의 범위 쿼리)는 생성 SQL 대조로 따로 닫았다(아래 행) — 여기 미검증으로 남은 것은 **시험 파일 자체**이지 쿼리가 아니다 |
| **마이그레이션 적용** | **적용 완료** | `20260920000000_user_scoped_tokens` **1건만** 적용됐다(`migrate status`로 다른 미적용 건이 없음을 먼저 확인 — `deploy`는 대기 중인 것을 **전부** 적용하므로). 대상이 격리 DB가 아니라 라이브 `neondb`라, 같은 DDL을 `COMMIT` 대신 `ROLLBACK`으로 끝내는 사본으로 먼저 리허설했다(성공 = 표 이름 충돌 없음 + `User.id` FK 타입 호환). 적용 뒤 표·인덱스 3종·`ON DELETE CASCADE` FK·`OwnerToken` 보존을 프로브로 확인했고 `migrate status`가 `Database schema is up to date!`다. **`migrate dev`는 쓰지 않았다** — drift를 만나면 DB reset을 제안하기 때문이다 |
| 수동: `hu_`로 실제 MCP 연결 1회 | **통과** | 임시 `hu_`를 발급해 `/api/mcp`에 JSON-RPC로 실호출했다(`initialize` → `notifications/initialized` → `tools/call`). **`initialize`가 200** — 검증기의 `hu_` 분기가 단위 시험이 아니라 실제 요청에서 동작한다. `project_get`으로 (b) 내 슬러그 → 성공(올바른 프로젝트 반환) · (d) `project` 누락 → `project required: add project.slug to harness.json (rerun /harness:init once to write it)` · (c) 남의 슬러그 → `not the owner of this project`를 **실물로** 확인했고, 폐기 후 같은 토큰은 401이다. 토큰은 끝나고 삭제했다(전후 `UserToken` 0행, 평문은 프로세스 밖으로 내보내지 않았다). **범위: MCP만이다** — 이 행이 받치는 것은 `scope()` 하나다. REST 3종의 `hu_` 경로는 **다른 코드**(`resolveRestScope`)라 아래 별도 행에서 따로 확인했다. 발급·폐기 **서버 액션**은 여전히 미실행이다(이 검증은 액션이 쓰는 것과 같은 `newToken("user")` + `userToken.create`를 직접 불렀다) |
| 수동: A-9 화면(`/settings/tokens`) 실사용 | **통과** (dev 서버 재기동 후) | 세션 쿠키를 민팅해 서버 렌더를 호출했다. **1차는 500**이었고 원인은 `src/server/db.ts:12`의 `globalThis` memoize였다 — 9-19에 뜬 dev 서버가 `UserToken` **이전** generated client 인스턴스를 들고 있어 `prisma.userToken`이 undefined였다(`TypeError: … reading 'findMany'`). 라우트는 정상 컴파일된 뒤 던진 것이었다. **코드를 한 줄도 고치지 않고** 서버만 새로 띄우자(마이그레이션·client 재생성 이후 기동) **200**이 나왔다: `h1 Tokens` · intro 문구 · 전환 안내 · 빈 표 문구 · Issue 버튼 · MCP URL 모두 확인, 오류 마커 없음. 같은 실행에서 `/projects`도 200이고 머리의 `/settings/tokens` 링크가 렌더된다(**진입점 확인** — "링크를 안 걸면 화면이 있어도 없다"의 반대 증거). 발급·폐기 **액션**은 여전히 미실행이다 — 화면 렌더와는 별개이고 자동 시험도 없다(저장소 관례상 서버 액션 시험 선례 0건) |
| C-1·C-2 자동 시험 | **통과** | `npm test` **176/176**(생성기 `--register` 6건 신규: 등록·이미 등록됨(200)·`hs_` 401 안내·404·origin 없음·GitHub 아님) · `npm run test:web` **369/369**(`registerProjectResultIn` 멱등/접미사/토큰 미생성 4건 + `resolveUserScope` 4건 + 슬러그 규칙 11건) |
| 수동: init 재실행 2회(같은 저장소) | **미실행** | 멱등성의 **구조**는 주입 시험이 고정했다(재등록에 `create` 0회). 실제 두 프로세스 경쟁은 격리 DB가 필요하다 |
| CI `check` (PR #57) | **1차 실패 → 수정 후 success** | **로컬 176/176이었는데 CI에서만 깨졌다.** `--register` 픽스처가 `git init`의 기본 브랜치를 환경에서 물려받았는데, 개발 머신은 `init.defaultBranch=main`이고 **러너는 그 설정이 없어 `master`**였다. 실패는 한 줄(요청 본문의 `branch`)이었고 제품 코드가 아니라 픽스처의 환경 가정이었다. `git init -b main`으로 이름을 고정해 해소했고, `init.defaultBranch=master`를 강제한 재현 환경에서 56/56으로 확인했다. **기대값을 "실제로 읽은 값"으로 바꾸지 않았다** — 그러면 시험이 자기가 만든 값을 자기가 확인하는 꼴이라 `branch`가 서버에 전달되는지를 증명하지 못한다. 교훈: **로컬 녹색은 환경 의존 시험의 증거가 못 된다** |
| 수동: REST 3종의 `hu_` 경로 | **통과** | 임시 `hu_`로 `/api/project`·`/api/templates`·`/api/runbook`에 실호출했다(**15개 단언 전부 ok**). 셋 다 내 슬러그 → **200**, `project` 누락 → 401 `PROJECT_REQUIRED`, 남의 슬러그 → 403 `not the owner of this project`. **`hs_` 회귀도 함께 확인**했다(`project` 인자 없이 200, 같은 프로젝트) — "`hs_` 경로는 한 줄도 바뀌지 않는다"는 주장을 실물로 받친 자리다. `/api/runbook`은 **쓰기**라 원래 `runbookVersion`을 읽어 두고 검증 뒤 되돌렸다(`null` → 값 → `null`); 임시 `hu_`·`hs_` 토큰도 삭제했다. **MCP 검증이 이것을 대신하지 못한다** — 그쪽은 `scope()`, 이쪽은 `resolveRestScope`로 다른 코드다. 덤으로 `/api/templates`가 200이라 라이브 DB에 `en` 템플릿이 시드돼 있음도 확인됐다 |
| 수동: A-10 범위 쿼리의 생성 SQL | **통과** | `recentSteps`의 `hu_` 분기는 **단위 시험이 원리상 닿지 못한다** — `next.test.ts:578`이 그 함수를 배열 필터로 통째로 대체해 Prisma가 한 번도 불리지 않는다. 시험이 증명하는 건 "프로젝트로 거른다면 맞다"는 전제이지 전제 자체가 아니다. 그래서 쿼리 로깅을 켜 **생성 SQL을 직접 비교**했다. 우려는 `OR` 안쪽 `run: { tokenId }`와 최상위 `run: { projectId }`가 **같은 키**라 뒤엣것이 삼켜지는 것이었고, 삼켜지면 사용자 토큰의 rate limit이 프로젝트를 넘어 샌다 — A-10이 막으려던 바로 그 표면이다. 결과: Prisma는 **별도 별칭으로 조인**한다(`LEFT JOIN AgentRun j1 … AND ("j1"."projectId" = $4)`). projectId 술어가 범위 없는 쪽 0회 · 있는 쪽 1회 — **필터는 적용된다.** 곁가지로 `j1.id IS NOT NULL`이 `hs_`/`hu_`의 집계 대상을 가를 뻔했으나 `AgentRunStep.runId`가 non-nullable이라(`schema.prisma:239`) 항상 참이다. **격리 DB 없이 닫혔다** — SQL 생성은 데이터와 무관해 `AgentRunStep` 0행에서도 판정된다. 먼저 시도한 개수 대조는 **0행이라 공허했다**(대조군이 필터 적용 여부를 못 가른다) |
| 수동: B-1 선택지 3(사용자 범위 등록) | **통과** | 가짜 변수·가짜 URL(`127.0.0.1:9`)·임시 이름으로 `claude mcp add --transport http --scope user`를 **실제로 실행**해 확인하고 즉시 제거했다(설정 잔여 0행, 진짜 토큰은 쓰지 않았다). ① `-s/--scope`에 `local\|user\|project`가 실재한다. ② 저장된 헤더가 `Authorization: Bearer ${HARNESS_PROBE_FAKE}` — **`${VAR}`가 글자 그대로 남는다**(설정 파일 직접 `grep`으로 교차 확인). 즉 토큰이 정지 상태로 저장되지 않아 `.mcp.json` 계약(`harness-init.mjs:255`)과 **같은 보안 성질**이다. ③ 승인 프롬프트는 사용자 범위에 걸리지 않는다(저장소 `.mcp.json`에만 적용). ④ 이름은 `mcp__harness__*`로 보존된다 — 플러그인 경유만 `mcp__plugin_…__*`이고, 이는 이 세션의 실제 도구 목록(`mcp__plugin_context7_context7__*`)으로도 확인된다. **함정: 헤더를 큰따옴표로 쓰면 셸이 먼저 치환해 평문이 저장된다** — 작은따옴표 필수 |
| 수동: 선택지 3의 **생성기→스킬 절차 인수** | **통과** | 임시 이름으로 8단계를 끝까지 돌렸다(끝나고 제거, 설정 잔여 0). ① 생성기 exit 0 → ② **`server:` 줄을 기계적으로 파싱**(`grep '^server: ' \| sed`)해 `https://h.example`를 얻었다 — 사람이 눈으로 읽는 게 아니라 **스킬이 파싱할 모양인지**를 본 자리다. 생성기가 `/api/mcp` 꼬리를 떼므로 스킬이 다시 붙인다 → ③ 없는 이름에 `get`은 명확히 실패 → ④ **작은따옴표** `add` 성공 → ⑤ 저장 형태가 `Authorization: Bearer ${HARNESS_TOKEN}`(**참조이지 평문이 아니다**) → ⑥ 다른 주소로 `add`는 `already exists`(exit 1) → ⑦ `remove` 후 `add`로 주소가 **실제로** 바뀌었다(`https://other.example/api/mcp`) — `SKILL.md` 4단계가 지시하는 분기이고 **절차로서는 이때 처음 실행됐다** → ⑧ 정리 후 잔여 0. **실사용 인수 — 2026-09-22 `mathgic`에서 통과했다.** 전날 여기 적어 둔 인수 조건("다음에 실제로 `/harness:init`을 돌릴 때 확인한다")을 그대로 이행한 결과다. 조건이었던 셋이 전부 닫혔다. ① **`.mcp.json`이 쓰이지 않았다** — 커밋 대상 목록에 없다(생성물은 `.claude/agents/*`·`CLAUDE.md`·`docs/*`·`harness.lock.json`뿐). ② 생성기가 `server: http://localhost:3000`을 냈다. ③ `harness`가 **진짜 이름으로 사용자 범위에 올바른 URL로 등록돼 연결됐고**, 이미 등록돼 있어 재시작조차 필요 없었다. ④ `harness_owner`는 `HARNESS_OWNER_TOKEN`이 없어 등록되지 않았다 — (3-g) 설계대로다. ⑤ **MCP 도구가 실제로 서버에 닿았다**: `project_sync`가 성공해 보드에 `web-dev` 로스터가 생겼다 — 조건에 적었던 `project_get`보다 **강한 증거**다(읽기가 아니라 쓰기가 통과했다). **같은 실행이 드러낸 것들은 (3-i)에 있다**(웹 문구 드리프트, 토큰을 두는 곳은 종류가 정한다) — 이 행은 "선택지 3이 실사용에서 도는가"만 판정한다. **별개로 드러난 미해결 하나**: `plan: free`라 `plan-verifier`·`doc-auditor`가 `skip(plan)`인데 런북은 여전히 `plan-verifier`를 언급한다. 선택지 3과 무관한 플랜 게이팅 불일치다 |
| B-1 옛 이름 부재 `grep`(이 저장소) | **해당 없음** | 선택지 3은 개명하지 않는다 — 이 검사는 선택지 1 전용이었다 |
| B-1 옛 이름 부재 `grep`(`harness-templates`) | **해당 없음** | 선택지 3은 그 저장소를 건드리지 않는다 — `.mcp.json`을 한 번도 언급하지 않음을 실측했다 |
| 수동: `npm run seed:templates` | **해당 없음** | DB 재시드는 선택지 1(개명)의 비용이었다. 선택지 3은 템플릿을 한 글자도 바꾸지 않으므로 필요 없다 |

구현 중 계획서 자체에서 찾은 것(모두 반영했다):

1. **A-2가 미완이었다** — Execution Plan 2단계가 지시한 `harness-platform.md:920`이 고쳐지지 않아,
   v2 스펙 본문이 `hu_` 분기 없는 검증기를 담은 채 코드와 반대를 말하고 있었다.
2. **A-10에 Execution Plan 단계가 없었다** — Affected Files와 (k)(l)(m)에는 있었다. 3단계에 합쳤다.
3. **A-9에 검증 단언이 없었다** — 관례상 없는 것이 맞지만, 그 사실이 문서에 적혀 있지 않았다.
4. **A-8이 REST 계약 변경을 요구한다는 점이 빠져 있었다** — `--print-project`는 `/api/project`의
   응답을 그대로 출력하므로, 초안에 슬러그를 넣으려면 `ProjectIdentity`에 `slug`가 늘어야 한다.
5. **Affected Files에 `tests/server/integration/agent-runs.test.ts`가 없었다** — `recentSteps`를
   위치 인자로 부르고 있어 A-10의 시그니처 변경에 깨진다(격리 DB가 없어 조용히 썩을 자리였다).

## Risks and Rollback

잔여 리스크:

- **구조적 보장이 검사로 바뀐다.** 지금은 토큰이 프로젝트라서 교차 접근이 *불가능*하다.
  A 이후에는 `scope()`의 검사가 유일한 방어선이다. 완화: 관문이 하나이고, 시험 (b)(c)가
  양방향을 고정하며, 기존 술어를 재사용한다. 그래도 **성격상 하락이며 이 문서의 가장 큰 리스크다.**
- **사용자 토큰의 피해 범위가 넓다.** `hu_` 하나가 그 사람의 모든 프로젝트를 연다. 완화: 폐기
  UI를 같은 화면에 두고, `ho_`와 달리 게이트 권한은 없다(에이전트 스코프 도구뿐).
- **토큰 하나가 여러 프로젝트를 덮으면 "토큰당" 집계의 뜻이 전부 흔들린다.** 이번에 찾은 것은
  `recentSteps` 하나지만(A-10), 같은 종류가 더 있는지는 **전수 확인하지 않았다**. 구현 시
  `tokenId`로 집계·판정하는 코드를 한 번 훑어야 한다 — `recentRuns`처럼 이미 소유자 범위인
  것도 있어 일률적이지 않다.
- **배포가 없다는 사실이 목표의 일부를 제한한다.** "머신당 한 번"이라는 목표는 호스팅된 서비스를
  암묵적 전제로 삼는다. 현재는 각자 로컬 인스턴스를 띄우는 형태이므로 `HARNESS_SERVER`는
  `http://localhost:3000`이고, B-2가 없는 동안 이 변수는 남는다(단, 설정은 C가 대신한다).
- **B-1의 도구 이름 변경은 한 커밋으로 닫히지 않는다.** 대상이 이 저장소 밖(별도 private 저장소
  10개 파일 — 템플릿 9 + 시험 1)과 DB(수동 재시드)에 걸쳐 있고, 이미 연결된 저장소의 `skip(modified)` 스텁은 옛
  이름을 계속 들고 있다. 완화책이 "같은 커밋으로 고친다"가 될 수 없다는 것이 이 항목의 요지다 —
  Approval의 결정 사항으로 올렸다.
  **접근성은 막힌 곳이 아니다**(2026-09-20 확인): `plugin/templates/`는 로컬 작업트리이고 remote가
  그 저장소이며 권한도 있다. 실제 블로커는 **그 저장소의 상태**다 — 확인 시점에 `harness/server-clean-code`
  브랜치에서 **8개 파일이 미커밋**이었다(다른 활성 제안서의 진행 중 작업으로 보인다). 그 작업이
  정리되기 전에 44곳 일괄 이름 변경을 얹으면 두 작업이 엉켜 되돌리기 어려워진다.
- **`agent-role-catalog.md`(활성 제안서)와 충돌한다.** `:246-247`이 새 에이전트의 `tools:`를
  `mcp__harness__*`로 지정한다. B-1을 하면 두 제안서 중 하나가 먼저 상대를 갱신해야 한다.
- **B-1의 이득이 소유자 토큰 사용자에게는 부분적이다.** `harness_owner`는 조건부여야 해서
  플러그인 매니페스트에 넣을 수 없다(§B-1). 그 사용자에게는 저장소 `.mcp.json`·재시작·승인이
  그대로 남는다. 완화책 없음 — 매니페스트가 조건부가 될 수 없는 것이 원인이다.
- **사용자 토큰 화면은 새 인증 경계다.** 기존 토큰 액션을 재사용하지 못하고 `requireUser` 기반
  액션을 새로 만들므로(A-9), 프로젝트 권한 검사를 우회하는 경로가 하나 늘어난다. 그 액션은
  프로젝트를 전혀 읽지 않아야 한다 — 읽는 순간 인가 누락의 자리가 된다.
- **C의 자동 등록은 소유를 검증하지 않는다.** 현재 웹 폼과 같은 신뢰 수준이며 악화는 아니지만,
  개선도 아니다.
- **실물 검증이 남은 것은 서버 액션과 동시성 판정뿐이다.** MCP(`/api/mcp`)와 REST 3종
  (`/api/templates`·`/api/runbook`·`/api/project`)을 **모두** 실토큰으로 확인했다(성공 ·
  `PROJECT_REQUIRED` · `NOT_YOURS` · 폐기 후 401, `hs_` 회귀 포함). 두 벌을 따로 확인한 이유는
  **코드 경로가 다르기 때문이다** — MCP는 `scope()`, REST는 `resolveRestScope`다.
  이로써 [init-fewer-questions](../completed/2026-09-20-init-fewer-questions.md)의 잔여 항목이던
  "`/api/project`의 200이 한 번도 실행된 적 없다"도 함께 닫혔다. 남은 것은 발급·폐기 **서버 액션**
  (저장소 관례상 자동 시험 선례가 0건이라 실행으로만 확인된다)과 (g)(i)의 **동시성 판정**(격리 DB 필요)이다.

롤백 방법:

- **A**: 코드는 revert. 마이그레이션은 `UserToken` 표만 남으며 additive라 기존 동작에 영향이
  없다 — 되돌릴 필요가 없고, 되돌리려면 표를 drop하는 별도 마이그레이션을 쓴다. 발급된 `hu_`
  토큰은 revert 후 인증되지 않으므로 사용자에게 폐기를 안내한다.
- **B**: `plugin/.mcp.json` 삭제 + 생성기의 쓰기 복원 + 플러그인 버전 재상승. 이미 설치된
  사본은 버전 비교로 갱신되므로 버전을 올리지 않으면 롤백이 전달되지 않는다.
- **C**: 라우트 삭제 + init의 등록 호출 제거. 이미 생성된 프로젝트 행은 웹에서 지운다.

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성한다.

완료 기록(`status: "completed"`일 때 작성):

- **completed-at**: 2026-09-22
- **verification-summary**: 앞마당 참조 — A·C·B-1을 모두 담도록 갱신했다(B-1의 실사용 인수 포함).
- **implementation PR/commit**: A = PR #55 · C-1·C-2 = #57 · 검증 기록 = #62(REST `hu_`)·#63(A-10 생성 SQL) ·
  B-1 = #64(선택지 3 검증)·#65(결정·계획)·**#66(구현)**·#67(절차 인수)·#68(인용 주석)·#69(플러그인 0.3.0) ·
  실사용 인수 = #72.
- **changed files summary**: 서버(`scope`·검증기·REST 3종·`agents/{next,runs}`) · 웹(`/settings/tokens`) ·
  생성기(`harness-init.mjs` — `.mcp.json` 쓰기 중단, 우리 항목 제거, `server:` 출력) · 스킬(`SKILL.md` 2·3·4단계) ·
  마이그레이션 1건(`UserToken`) · 문서(`protocol`·`rationale`·`system-overview`·`product-copy`·`harness-platform`).
- **remaining follow-up**: ① `test:server:integration`(격리 DB 부재) ② 발급·폐기 **서버 액션**(자동 시험 선례 0건)
  ③ C의 동시성 판정 (g)(i)(격리 DB 필요) ④ init 재실행 수동 인수 ⑤ **B-2**(배포가 생기기 전까지 실행 불가)
  ⑥ **플랜 게이팅 결함 — 이 제안서 밖으로 넘긴다**(아래 Implementation Results 참조).

## Implementation Results — 2026-09-22

### 실행 범위와 상태

A(Execution Plan 1~7) · C(C-1·C-2·C-3) · **B-1(선택지 3)** 완료. B-2만 남았고 그것은 **일이 없어서가 아니라
전제가 없어서**다 — 이 저장소에 배포가 없어 가리킬 호스트가 생기기 전에는 실행할 수 없다.

B-1은 세 선택지 중 **3번(사용자 범위 MCP 등록)**으로 결정됐다. 1번(개명)이었다면 두 저장소 67곳 + DB 재시드 +
이미 연결된 저장소의 옛 스텁 처리였고, 그 착수는 `plugin/templates/`의 미커밋 작업에 막혀 있었다. 3번은
**개명 0곳**이고 이 저장소 하나로 닫힌다 — `plugin/templates/`가 `.mcp.json`을 한 번도 언급하지 않음을 실측해
확인했다. 다만 3번은 **A가 전제**다: 머신당 서버 1개는 토큰이 저장소를 가로지를 때만 성립하고, 그게 `hu_`다.

### 구현 중 드러난 것

- **계획이 자기모순이었다.** 초안 3-b는 "생성기가 `claude mcp get`을 읽어 URL을 얻는다"였는데, 이는 3-a가
  정한 원칙(생성기는 파일만 물질화하고 머신 설정은 스킬이 건드린다)과 정면으로 어긋났다. 구현 전에 철회하고,
  대신 **생성기가 해석된 주소를 `server:` 줄로 출력**하게 했다 — 스킬이 등록 주소를 알 유일한 경로였다.
- **제거가 URL 기록도 함께 없앤다**(3-c-2). `.mcp.json`의 `harness` 항목은 서버 URL의 최후 폴백이기도 해서,
  같은 실행에서 읽고 지우면 이후 재실행이 `Server URL required`로 멈춘다. 보완하지 않고 **알리게** 했다.
- **`--owner`는 할 일이 없어졌다**(3-g). 조용히 무시하면 옛 스킬이 넘길 때 사용자가 소유자 서버를 잃고도
  모르므로, 어디로 옮겼는지 출력한다.
- **전달 경로가 계획에 없었다**(3-h). 구현이 `dev`에 머무는 한 사용자에게 도달하지 않는다 — 마켓플레이스가
  기본 브랜치를 받고 브랜치 선택지가 없어 `main` 승격이 전제였고, 플러그인 버전도 올려야 했다.
- **검증 기법**: 격리 DB 없이도 닫히는 것이 있었다. A-10의 범위 쿼리는 단위 시험이 함수를 통째로 목으로
  갈아끼워 검증되지 않았는데, **생성 SQL 대조**로 행 0개에서 판정했다(#63). 반대로 개수 대조는 빈 표에서
  공허했다 — `ALL CHECKS PASSED`가 아무것도 증명하지 못한 사례다.

### 남은 검증과 인수

① `test:server:integration` ② 발급·폐기 서버 액션 ③ C의 동시성 (g)(i) ④ init 재실행 수동 인수 — 넷 다
**격리 DB 또는 자동 시험 선례의 부재**라는 환경 제약이고, 이 제안 때문에 생긴 것이 아니다.

### 이 제안서 밖으로 넘기는 결함 — 런북의 하드코딩된 report-only 표

2026-09-22 `mathgic` 실사용에서 드러났다. 런북 템플릿은 `{{roster_table}}`을 쓰지만(`:23`), 그 아래
**"Report only:" 표는 `pm`·`doc-auditor`·`feature-scout`·`plan-verifier` 네 행을 하드코딩**한다.
`free` 플랜은 `agents: ["pm", "feature-scout"]`이므로(`entitlement.mjs:11`) **`doc-auditor`·`plan-verifier`
두 행이 거짓**이고, 생성되지도 않은 에이전트를 런북이 시킨다. `feature-scout` 행만 산문으로 조건을 달아 둔
것을 보면 조건성은 인지했으나 게이팅이 아니라 말로 처리한 것이다.
**고칠 파일은 `plugin/templates/en/CLAUDE.runbook.md`로 별도 private 저장소에 있고, 그 워크트리는
`harness/server-clean-code`에서 미커밋 8개 파일을 들고 있다** — 그 위에 얹으면 두 작업이 엉킨다(`:703`의 경고).
그래서 이 제안서에서 고치지 않고 넘긴다.

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `completed`다(2026-09-22 닫음). 작성 시점에는 `pending`이었다.
- [x] 문서 위치(`completed/`)와 `status`(`completed`)가 일치한다.
- [x] `stage`는 `approved`다 — 2026-09-20에 승인받았다. (이 줄은 템플릿의 `draft` 전제가 남아 있어 승인 이후 줄곧 거짓이었고, 닫으면서 바로잡았다.)
- [x] `stage`가 `approved`이므로 승인 metadata(`approved-by`·`approved-at`)를 채웠다. (앞줄과 같은 이유로 거짓이던 것을 닫으면서 바로잡았다.)
- [x] `proposal-size`는 `standard`이며 강제 조건(인증·마이그레이션·API 계약·5파일 초과)에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 쓰고, 본문에는 승인 조건만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅·import·타입·side effect를 확인했고, 해당 없는 한 항목
      (정적 자산 URL)만 체크하지 않은 채로 두었다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 기존 실패(`test:server:integration`의 격리 DB 부재)를 신규 실패와 구분해 적었다.
- [x] 잔여 리스크를 명시했다.
