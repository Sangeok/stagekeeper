---
status: "completed"
stage: "approved"
proposal-size: "standard"
created-at: "2026-09-20"
approved-by: "user (conversation)"
approved-at: "2026-09-20"
approval-scope: "D-1~D-5를 권장값으로 확정하고 서버·생성기·웹·스킬·문서 구현. 격리 DB 통합 검증과 수동 연결 인수(질문 수)는 후속. 커밋·푸시·PR 제외."
completed-at: "2026-09-20"
verification-summary: "구현은 PR #53(머지 4cc86c5 · 구현 커밋 52c7d5d)으로 dev에 들어갔다 — 20개 파일 +1213/−36. 실측: check 통과 · test 165/165 · test:web 327/327 · build 통과(라우트 표에 ƒ /api/project 수집) · test:server 2/2. 미검증 2건(격리 DB 통합검증 · 수동 연결 인수)을 남긴 채 닫는다 — 둘 다 이 환경이 제공할 수 없는 환경 의존 검증이라 Completion Notes의 ③④로 이월했다."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-09-01-harness-platform-phase-0-1.md"
  - "docs/proposals/active/agent-role-catalog.md"
  - "docs/proposals/completed/2026-09-23-src-server-clean-code-findings.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "plugin/skills/init/SKILL.md"
---

# init이 묻는 질문 줄이기 — 서버가 아는 것은 서버에서 받고, 사람만 아는 것만 묻는다

> **이후 변경으로 무효가 된 항목** (2026-09-20 닫으면서 추가)
>
> 이 제안이 만든 `GET /api/project`를 [user-scoped-project-identity](./2026-09-22-user-scoped-project-identity.md)의
> A-7이 확장했다. 그래서 아래 진술들은 **더 이상 현재 코드의 사실이 아니다** — 당시 판단의
> 기록으로만 읽어야 한다. 현재 HTTP 계약의 소유 문서는 `docs/architecture/protocol.md`다.
>
> - **"프로젝트 식별자를 입력으로 받지 않는다 · IDOR 표면이 없다"** (§1 본문, Safety Analysis의
>   인증·인가 항목, Risks, Review Checklist). A-7이 `?project=<slug>`를 더해 **바로 그 입력을
>   만들었다.** 대체 방어는 호출마다의 `ownerUserId` 일치 검사이며, 구조적 불가능에서 검사로
>   내려온 하락이라는 점을 그쪽 제안서가 자기 리스크 1번으로 명시한다.
> - **`ProjectIdentity`가 네 필드라는 것** (§1의 타입 선언, `--print-project` 예시 출력,
>   `harness.json` 초안 예시). 지금은 `slug`가 더해져 다섯이다 — 사용자 토큰(`hu_`)이
>   프로젝트를 지목하는 유일한 값이다.
> - **후속 ①("`harness.json`의 `project` 선택 필드화")은 재검토가 필요하다.** 중복을 없애려면
>   `project`를 지워야 하는데, `hu_`는 `project.slug`가 로컬에 있어야 동작한다. 두 방향이 부딪힌다.
>
> 나머지 본문은 그대로 유효하다 — 질문 수 감축, 서버 URL 3순위·정규화, 그리고 `language`를
> 옮기지 않는다는 판단(그 근거 사슬은 지금도 참이다).

## Summary

첫 연결에서 `/harness:init`은 7~9번 묻고, 워크스페이스가 셋이면 15번을 넘는다.
질문 하나하나를 스키마와 대조하면 **대부분이 필요 없다**.

- `project{owner,repo,branch,name}`은 사용자가 **웹 프로젝트 생성 폼에 이미 입력한 값**이다
  (`new-project-form.tsx:151-159`). 서버가 진실을 갖고 있는데 터미널에서 다시 묻는다.
- `knowledge`·`scout`·`readOnly`·`workspaces[].id`는 **스키마상 전부 선택**인데
  (`config.mjs:22,35`, `workspaces.mjs:5,18`) 스킬은 필수처럼 묻는다.
- 서버 URL은 웹이 계산해 화면에 보여주면서도(`public-url.ts:6-8`) 셸로 옮기는 길을
  주지 않는다(`token-reveal.tsx:19-73`).

이 제안은 **질문의 값 출처**를 코드로 고정한다. 새 읽기 전용 엔드포인트
`GET /api/project`가 토큰으로 프로젝트 정체를 돌려주고, 생성기의 `--print-project`가
그것을 꺼내 준다. 스킬은 그 값과 `package.json`에서 뽑은 후보로 `harness.json` 초안을
만들어 **한 번** 승인받는다.

**남는 질문은 워크스페이스 경계 하나다.** 0회로 줄이지 않는 이유가 있다 — roster의
유니크 키가 `agent`이므로(`schema.prisma:114`, `project-sync-query.ts:27`) 기본값으로
써버린 뒤 이름을 고치면 서버에 고아 행이 남는다. 되돌리기 어려운 값은 묻는다.

**`language`는 서버에서 가져오지 않는다.** 그 이유는 「Current State — language를
옮기면 안 되는 이유」에 있다. C11(서버 URL 기본값 금지)은 유지한다.

## Goal

- 첫 연결 질문 **7~9 → 1**(충돌이 있으면 2).
- 재연결(`--owner` 추가, 런북 갱신, 플랜 변경 후 재실행) 질문 **0**.
- 질문의 **값 출처**를 코드로 고정한다 — `project` 블록은 서버가 준다.
  질문 **횟수**는 여전히 스킬 지시문이 정하며, 그 부분의 유일한 증거는 수동 인수다
  (Risks의 첫 항목과 같은 말이다).
- 웹이 보여주는 URL과 생성기가 요구하는 값의 형태 불일치를 없앤다.
- C11 유지 — 서버 URL에 기본값은 여전히 없고, 못 찾으면 지금과 같이 멈춘다.
- 작업 유형: 읽기 전용 엔드포인트 신설, 생성기 입력 해석·신규 모드, 웹 카피·모델 확장,
  스킬 문구 변경, 문서 갱신, 테스트 추가.

## Proposal Size

`proposal-size`: `standard`

선택 근거:

- 새 공개 라우트(`/api/project`) — 인증 경계가 늘어난다.
- 5개 초과 파일 변경(서버 3 신규 + 생성기 2 + 웹 7 + 스킬 1 + 문서 2).
- 문서 계약 변경 둘 — 사용자에게 보이는 카피 정본(`product-copy.md` §9)과
  HTTP 계약을 소유한 `docs/architecture/protocol.md`.
- 롤백은 단순 revert지만 인증 표면이 포함된다.

## Current State

### 지금 발생하는 질문과, 스키마가 말하는 필요성

| # | 질문 | 스키마·코드 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | `project.owner`/`repo` | **불필요** | 웹 생성 폼이 받은 값. 서버가 갖고 있다 |
| 2 | `project.branch` | **불필요** | 〃. git 추측은 오히려 틀릴 수 있다(현재 브랜치 ≠ 통합 브랜치) |
| 3 | 워크스페이스 `id` | **불필요** | 유니크 키가 아니다(`schema.prisma:107,114`) — `agent`에서 파생해도 안전 |
| 4 | 워크스페이스 `path`·`agent` | **필요** | 사람만 아는 제품 판단. 게다가 되돌리기 어렵다(아래) |
| 5 | `verify[]` | **필요(약)** | `package.json` scripts로 후보는 뽑히나 선택은 사람 |
| 6 | `readOnly[]` | **불필요** | 생략 시 `[]` → `bullets([])` = `"none"`(`vars.mjs:3,33`) |
| 7 | knowledge doc 경로 | **불필요(init 시점)** | `vars.mjs:28-30`이 완성된 대체 문장을 준다 |
| 8 | knowledge doc 초안 | **불필요(init 시점)** | 〃. 첫 계획 때로 미룰 수 있다 |
| 9 | `scout.question` | **불필요** | 없으면 `feature-scout`만 빠진다(`harness-init.mjs:114`). 재실행하면 생긴다 |
| 10 | 서버 URL | **불필요** | 웹이 이미 계산한다 |
| 11 | dry-run 승인 | **필요(1회)** | 파일 쓰기 게이트. 단 초안 승인과 합칠 수 있다 |
| 12 | `--adopt` | 충돌 시에만 | `refuse:` + exit 3이 이미 막는다 |

`language`는 이 표에 없다 — 스킬이 지금도 묻지 않는다. 아래 이유로 **앞으로도 묻지도,
서버에서 가져오지도 않는다.**

### language를 옮기면 안 되는 이유 — init이 깨진다

DB의 기본 언어와 실제 시드된 템플릿 언어가 다르고, 두 소비자의 관용도가 다르다.

```prisma
// prisma/schema.prisma:39
  language     String          @default("ko")
```

```ts
// src/server/project-registration-query.ts:23-37 — 생성 시 language를 쓰지 않는다
const project = await transaction.project.create({ select: { id: true }, data: {
  slug: input.slug, name: input.name, repoOwner: input.owner, repo: input.repo,
  branch: input.branch, available: true, /* … language 없음 … */ } });
```

`create-project.server.ts:36-44`의 호출부도 `language`를 넘기지 않는다. 따라서
**웹에서 만든 프로젝트는 DB `language`가 `"ko"`인 채로 시작한다.**

그 값은 영원하지 않다 — `SKILL.md` step 5가 `project_sync`에 `harness.json.language`
(생략 시 `en`)를 넘기고 `project-sync-query.ts:24`가 값이 오면 `Project.language`를
갱신하므로, **첫 init이 끝나면 DB는 `en`이 된다.** 그래도 아래 결론은 바뀌지 않는다:
템플릿 요청은 DB가 아니라 `harness.json.language`를 쓰고(`harness-init.mjs:51,64`),
그 요청은 step 5보다 **먼저** 일어난다. 즉 위험한 창은 정확히 "DB가 아직 `ko`이고
init이 템플릿을 받아야 하는" 첫 연결이다.

소비자는 둘인데 한쪽만 이를 견딘다.

```ts
// src/server/agents/runs.ts:13,23
const TEMPLATE_FALLBACK_LANG = "en"; // 시드된 언어. Project.language(기본 "ko")에 템플릿이 없으면 여기로
const row = (await find(language)) ?? (language === TEMPLATE_FALLBACK_LANG ? null : await find(TEMPLATE_FALLBACK_LANG));
```

```ts
// src/server/templates-query.ts:37-40 — fallback이 없다
const templateRows = await deps.findTemplatesByLanguage(language);
if (templateRows.length === 0) {
  return { ok: false, status: 404, reason: `no templates for language: ${language}` };
}
```

만약 `--print-project`가 `language`를 돌려주고 스킬이 그것을 `harness.json`에 쓰면,
`harness-init.mjs:51,64`가 `?lang=ko`로 요청하고 **404로 init이 실패한다.**
지금 깨지지 않는 유일한 이유는 스킬이 language를 묻지 않아 `config.mjs:20`의 기본값
`"en"`이 쓰이기 때문이다.

**결론: `language`를 정체 payload에 넣지 않고, `harness.json`에도 쓰지 않는다.**
`config.mjs`의 `en` 기본에 맡긴다. DB 기본값 `ko`와 시드 언어 `en`의 불일치 자체는
이 제안의 범위 밖이며 후속 항목으로만 남긴다(Risks).

### 왜 워크스페이스만 남는가 — 되돌리기 비용

```prisma
// prisma/schema.prisma:107,114
  wsId      String
  @@unique([projectId, agent])
```

```ts
// src/server/mcp/project-sync-query.ts:27
await tx.workspace.upsert({ where: { projectId_agent: { projectId, agent: w.agent } }, create: { ...data, projectId, agent: w.agent }, update: data });
```

`wsId`에는 제약이 없고 upsert는 `agent`로 매칭한다. `id`는 마음대로 바꿔도 되지만
**`agent`를 바꾸면 옛 행이 남는다.** 그래서 워크스페이스 경계·에이전트 이름은 기본값으로
써버릴 값이 아니다. 반대로 `project` 블록은 서버가 진실을 쥐고 있으므로 물을 이유가 없다.

### 코드는 선택이라 하고, 스킬은 필수처럼 묻는다

```js
// packages/core/vars.mjs:25-30
// 지식 문서는 없을 수 있다. 템플릿이 값을 백틱으로 감싸면 없을 때 그 문장이 파일 이름처럼 읽혀…
knowledge_line: ws.knowledge
  ? `Your workspace knowledge doc is \`${ws.knowledge}\` — read it before you write.`
  : "This workspace has no knowledge doc. Say so in the plan rather than inventing its conventions.",
```

`render.mjs:5`는 값이 `undefined`일 때만 던지는데 `vars.mjs`가 항상 문자열을 채우므로
**knowledge 없이도 생성은 성공한다.** 서버도 같다 — `schema.prisma:111`이
`knowledge String?`이고 `project-sync-query.ts:26`이 null을 그대로 저장한다.
부재를 받아들이도록 전 계층이 이미 만들어져 있는데, `SKILL.md:65-66`(dev 기준)만
"없으면 사용자와 함께 초안을 작성하라"고 지시한다.

### 서버 URL — 세 구멍

1. **형태 불일치.** 웹은 `http://host/api/mcp`를 보여주고(`token-reveal.tsx:70-72`)
   생성기는 `/api/mcp`를 뗀 base를 받아 자기가 붙인다(`harness-init.mjs:32,150`).
   그대로 붙여넣으면 `.../api/mcp/api/mcp`가 되고 `:32`는 끝 슬래시만 자른다.
   토큰 페이지의 URL에는 Copy 버튼도 없다(`project-tokens-page.tsx:77-79`).
2. **재실행에도 다시 묻는다.** 생성기는 `.mcp.json`을 읽어 병합하는데(`:144-146`)
   서버 URL 검사는 그보다 95줄 앞(`:49`)에서 끝난다.
3. **그 분기에 자동 테스트가 없다.** 모든 테스트가 `--server`를 무조건 넘기고
   `HARNESS_SERVER`를 지운다(`harness-init.test.mjs:41-42`). 수동 확인 기록만 있다
   (`docs/test-reports/completed/2026-09-01-phase-1-smoke-acceptance.md:134`).

### C11 — 왜 기본값이 없는가

```
| C11 | `harness-init` 기본 서버 `https://harness.a-pch.com` | 기본값 없음 — `--server` 또는 `HARNESS_SERVER` 필수 | 스펙 Q1(도메인) 미결. 잘못된 기본값이 저장소에 박히는 것을 막는다 |
```
(`docs/proposals/completed/2026-09-01-harness-platform-phase-0-1.md:82`, 같은 문서 `:153`)

이 제안은 C11을 바꾸지 않는다. 읽는 출처를 늘릴 뿐이고, 늘어난 출처는 전부
**그 사용자가 그 셸·그 저장소에 직접 넣은 값**이다.

## Scope

포함 범위:

- **새 읽기 전용 엔드포인트 `GET /api/project`** — 라우트·서버 조회·단위 테스트
- `plugin/bin/harness-init.mjs` — 서버 URL 해석·정규화, `--print-project` 모드, 그 테스트
- `plugin/skills/init/SKILL.md` — step 1·2·6
- 웹 토큰 노출 화면의 연결 안내와 카피 정본
- `docs/architecture/protocol.md` — 새 엔드포인트의 계약 절(이 문서가 HTTP 계약을 소유한다)

제외 범위:

- **`/api/templates` 응답 계약** — 건드리지 않는다(D-2). 따라서
  `src/server/templates*.ts`와 `tests/server/integration/templates.test.ts`는
  이 제안의 변경 대상이 아니다.
- **`Project.language`의 기본값·fallback 정책** — DB 기본 `ko`와 시드 언어 `en`의
  불일치는 실재하지만(위 「language를 옮기면 안 되는 이유」) 고치는 것은 별도 결정이다.
  이 제안은 그 값을 **옮기지 않음**으로써 우회할 뿐이다.
- **토큰 자동화** — 한 번만 보여주고 해시만 저장하는 것은 의도된 보안 설계다
  (`manage-token.server.ts:11,17-18`).
- **`harness.json`의 `project`를 선택 필드로 만드는 것** — 중복·drift를 없애는 근본
  해법이지만 스키마 계약 변경이라 범위가 다르다. 이 제안 완료 후 별도 제안서로 올린다.
- 워크스페이스 경계를 자동으로 정하는 일 — 되돌리기 비용 때문에 의도적으로 묻는다.
- 프리플라이트(검증 스킬 계약) 변경.
- 소유자 토큰 흐름(`owner-token-reveal.tsx`) — 그때는 이미 셸에 값이 있다.
- `/api/runbook` · `/api/mcp` · `/api/mcp/owner` · `project_sync` 도구 — 이 제안은
  이들을 읽지도 쓰지도 않는다.

## Proposal

### 1. 서버: 읽기 전용 `GET /api/project`

`templates`와 같은 3층 구조를 따른다 — 순수 흐름(`*-query.ts`) · 주입(`*.ts`, `server-only`) ·
얇은 라우트.

```ts
// src/server/project-identity-query.ts (신규)
export type ProjectIdentity = { owner: string; repo: string; branch: string; name: string };

export type ProjectIdentityResult =
  | { ok: true; project: ProjectIdentity }
  | { ok: false; status: 401 | 403; reason: string };

export type ProjectIdentityDeps = {
  findTokenByHash(hash: string): Promise<{ projectId: string; revokedAt: Date | null } | null>;
  projectAccess(projectId: string): Promise<ProjectAccess>;
  findProjectIdentity(projectId: string): Promise<{ repoOwner: string | null; repo: string; branch: string; name: string } | null>;
};
```

`language`는 담지 않는다 — 이유는 Current State에 있다.

인증 순서는 `templates-query.ts:20-35`와 **같은 순서**다: `parseBearer` → 없으면 401 →
`findTokenByHash` → 없거나 폐기면 401 → `projectAccess` → `available`이 아니면 403 →
그 뒤에야 정체 조회. 404는 없다(언어에 매이지 않으므로).

**객체 수준 권한이 구조적으로 보장된다.** 이 엔드포인트는 프로젝트 식별자를 입력으로
받지 않는다 — `projectId`는 오직 토큰 해시 조회에서 나온다(`templates.ts:10-13`과 같은
방식). 따라서 다른 프로젝트를 가리킬 입력 자체가 없고, IDOR 표면이 생기지 않는다.

> **무효** — A-7이 `?project=<slug>`를 더해 이 속성을 의도적으로 제거했다. 문서 첫머리의
> 「이후 변경으로 무효가 된 항목」 참조.
읽기 전용(GET)이라 쓰기·멱등성·동시성 고려 대상도 아니다.

조회는 필요한 네 열만 select한다 — `repoOwner`·`repo`·`branch`·`name`.
`PROJECT_GET_SELECT`(`project-query.ts:4-28`)는 `workspaces`까지 읽으므로 재사용하지
않는다. `repoOwner → owner` 변환은 이미 있는 `repositoryOwner()`를 쓴다
(`project-access-query.ts:21-24`) — 스키마상 `repoOwner`는 non-null이지만
(`schema.prisma:53`) 기존 코드가 방어적으로 null을 다루므로 같은 형태를 따른다.

`readProjectFactsIn`(`project-access-query.ts:26-31`)의 select를 넓히지 않는 이유:
그 함수를 `planForProject`와 게이트 판정이 공유한다. 이 기능을 위해 공용 경로가 읽는
열을 늘리지 않는다.

라우트는 배선만 한다(`src/app/api/templates/route.ts:1-4`의 주석과 같은 규약).

### 2. 생성기: 서버 URL을 되찾고, 프로젝트 정체를 꺼내 준다

**서버 URL 해석 순서** — `--server` > `HARNESS_SERVER` > 기존 `.mcp.json`의
`mcpServers.harness.url`. 모든 경로에 같은 정규화를 적용한다(끝의 `/api/mcp/owner`
또는 `/api/mcp`를 떼고 끝 슬래시 제거). 셋 다 비면 **지금과 똑같은 메시지로 exit 1**이다.

**회수용 `.mcp.json` 읽기는 던지지 않는다.** 파싱에 실패하면 "회수 실패"로 취급하고
계속 간다. 권위 있는 파싱은 지금 자리(쓰기 준비 단계, `:144-147`)에 그대로 두어
`harness-init.test.mjs:186-200`이 기대하는 메시지와 종료코드를 보존한다. 회수도
실패하고 URL도 못 찾으면, 오류 문장에 `.mcp.json`을 읽지 못했다는 사실을 덧붙인다.
— 이렇게 하면 오류 우선순위가 바뀌지 않는다.

**`--print-project`(신규, 쓰기 없음)** — 실행 순서는 이렇다.

1. 플래그를 읽는다.
2. 서버 URL을 위 순서로 해석한다(회수 읽기는 던지지 않는다).
3. `HARNESS_TOKEN`을 요구한다.
4. `GET ${SERVER}/api/project`를 호출한다.
5. `project`를 JSON 한 줄로 출력하고 종료한다. **`harness.json`을 읽지 않는다** —
   설정 파싱(`:44-46`)을 건너뛴다.

```
$ node harness-init.mjs --print-project
{"owner":"Sangeok","repo":"stagekeeper","branch":"dev","name":"stagekeeper"}
```

언어를 주고받지 않으므로 "언어를 알아야 언어를 알 수 있는" 순환도, `?lang=` 404도 없다.
구버전 서버는 이 경로가 없어 404를 준다 — 그때는 그 사실을 말하고 실패한다(D-4).

테스트 보조기 주의: `harness-init.test.mjs`의 `withServer`(`:66-81`)는 GET 하나에
고정 본문을 준다. `/api/project`와 `/api/templates`를 가르려면 `req.url`로 분기해야 한다.

### 3. 스킬: 묻지 않는다, 한 번 확인한다

**step 1** — `harness.json`이 없으면:

1. `--print-project`로 `project`를 받는다(추측하지 않는다).
2. `package.json` scripts와 테스트 러너로 `workspaces` 후보를 만든다.
   `id`는 `agent`에서 파생한다(`web-dev` → `web`).
3. `knowledge`·`scout`·`readOnly`는 **초안에서 비우고 묻지 않는다.**
4. **`language`는 쓰지 않는다** — `config.mjs:20`의 `en` 기본에 맡긴다. 사용자가
   다른 언어를 명시적으로 요구할 때만 넣는다.
5. 완성된 초안을 **한 번** 보이고, 고칠 것만 말하게 한다. 승인되면 **스킬이 파일을 쓴다.**

```json
{
  "version": 1,
  "project": { "owner": "Sangeok", "repo": "stagekeeper", "branch": "dev", "name": "stagekeeper" },
  "workspaces": [ { "id": "app", "path": ".", "agent": "app-dev", "verify": ["npm run check", "npm test"] } ]
}
```

**step 2** — `--server`를 묻지 않는다. `HARNESS_SERVER`가 있으면 인자 없이 실행하고,
없으면 `.mcp.json`을 보고, 그래도 없을 때만 웹 토큰 페이지의 URL을 묻는다. 붙여넣은
값에 `/api/mcp`가 붙어 있어도 생성기가 정규화한다는 것도 적는다.

초안 승인과 dry-run 승인을 **하나로 합친다**: 초안과 함께 "다음이 쓰인다"를 보이고 한 번
승인받은 뒤, dry-run 결과에 `refuse:`가 나올 때만 다시 묻는다. 충돌이 없는 저장소에서는
질문이 한 번이다.

**step 6** — knowledge doc은 없어도 된다는 것을 먼저 말하고, 만들지 여부를 **제안**한다.
"없으면 반드시 만든다"를 "없으면 계획이 그렇게 적는다 — 지금 만들 수도 있다"로 바꾼다.

### 4. 웹: 서버 URL을 셸로 옮기는 줄을 준다

`connect-command.ts`에 토큰과 같은 모양의 명령 생성기를 더한다.

```ts
export const SERVER_VARIABLE = "HARNESS_SERVER";

export function serverCommands(serverUrl: string): ConnectCommand[] {
  return [
    { kind: "powershell", label: "PowerShell", command: `$env:${SERVER_VARIABLE} = "${serverUrl}"` },
    { kind: "posix", label: "bash · zsh", command: `export ${SERVER_VARIABLE}="${serverUrl}"` },
  ];
}
```

`TokenReveal` 2단계가 토큰 줄 바로 아래 같은 블록에서 낸다 — 이미 그 단계에서 셸에
붙여넣고 있으므로 새 행동이 아니다. 값은 `public-url.ts`에 `serverUrl()`을 더해
같은 `publicUrl()`에서 뽑는다. 두 값이 한 출처라 어긋날 수 없다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `src/server/project-identity-query.ts` | create | 순수 흐름 + 타입(`ProjectIdentity`, `language` 없음). `templates-query.ts` 구조 | medium — 새 인증 경계 |
| `src/server/project-identity.ts` | create | `server-only` 주입. `prisma`·`projectAccess`·4열 select | low |
| `src/app/api/project/route.ts` | create | 배선만. 캐시 기본값 그대로(토큰마다 응답이 갈린다). 경로 충돌 없음(현재 `api/`는 `auth`·`mcp`·`runbook`·`templates`) | low |
| `src/server/project-identity-query.test.ts` | create | 인증 순서·성공 형태 고정. `templates-query.test.ts` 패턴 | none |
| `plugin/bin/harness-init.mjs` | update | URL 3순위·정규화·비던지는 회수 읽기·`--print-project` | medium — 설정 파싱 전 분기가 생긴다 |
| `plugin/bin/harness-init.test.mjs` | update | 신규 테스트 여섯 + `withServer`를 `req.url`로 분기(`:66-81`) | low |
| `plugin/skills/init/SKILL.md` | update | step 1·2·6 (`language` 미기재 지시 포함) | low — 에이전트 행동 계약 |
| `src/server/public-url.ts` | update | `serverUrl()` export | none |
| `src/fsd/entities/project-token/model/connect-command.ts` | update | `serverCommands`·`SERVER_VARIABLE` | none |
| `src/fsd/entities/project-token/model/connect-command.test.ts` | update | 새 두 줄 고정 | none |
| `src/fsd/entities/project-token/ui/token-reveal.tsx` | update | 2단계에 서버 export 줄, `serverUrl` prop | low |
| `src/fsd/features/manage-token/ui/new-token-form.tsx` | update | prop 전달 | low |
| `src/fsd/features/create-project/ui/new-project-form.tsx` | update | prop 전달(생성 직후 같은 화면) | low |
| `src/fsd/features/create-project/ui/new-project-form.test.ts` | update | prop 추가로 타입 오류 — 예상된 신규 실패 | low |
| `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx` | update | prop 통과 | low |
| `src/app/(app)/p/[slug]/tokens/page.tsx`, `src/app/(app)/p/new/page.tsx` | update | `serverUrl()` 주입 | none |
| `docs/architecture/protocol.md` | update | HTTP 계약의 소유 문서다(`:7` `GET /api/templates`, `:31` `POST /api/runbook`). 새 엔드포인트는 같은 형식의 절이 필요하다 — 처리 순서 문장 + `\| 상태 \| 의미 \|` 표(200·401·403, **404 없음**) + 4xx 본문이 `{ error: string }`이라는 줄 | low |
| `docs/conventions/product-copy.md` §9 | update | 연결 안내 정본을 코드와 맞춘다 | low — 자동 대조 없음 |
| `src/server/templates*.ts`, `src/app/api/templates/route.ts` | keep | D-2로 응답 계약을 건드리지 않는다 | none |
| `src/server/templates-query.test.ts`, `tests/server/integration/templates.test.ts` | keep | 위와 같은 이유로 무영향. 특히 후자는 응답을 통째 `deepEqual`한다(`:40-48`) — 계약을 넓혔다면 깨졌을 자리다 | none |
| `prisma/schema.prisma`, `project-registration-query.ts`, `agents/runs.ts` | keep | `language` 정책은 제외 범위. 이 제안은 그 값을 옮기지 않을 뿐이다 | none |
| `packages/core/*`, `plugin/lib/*` | keep | 새 순수 모듈을 만들지 않는다(D-3) | none |

## Safety Analysis

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — 새 라우트 `GET /api/project` 하나. 기존 route 둘은 props만 는다.
      대상 경로 넷(`project-identity-query.ts`·`project-identity.ts`·그 테스트·`api/project/`)이
      모두 비어 있음을 확인했다.
- [x] **인증 프록시 경계** — `src/proxy.ts:5`의 매처
      `"/((?!api|_next/static|_next/image|favicon.ico).*)"`가 `/api`를 제외하므로 새 라우트가
      로그인으로 리다이렉트되지 않고 자체 토큰 검사에 도달한다(`public-routes.test.mjs:19`가
      같은 근거를 명시한다). 공개 경로 목록(`config.base.ts:6-7`)은 `/`·`/login`뿐이라
      새 항목이 필요 없고, `next.config.ts`는 비어 있어 rewrite·header 개입도 없다.
- [x] **라우트 목록 테스트 무영향** — `public-routes.test.mjs`는 `page.tsx`만 수집하고(`:22`)
      `api` 디렉터리를 건너뛴다(`:19`). 새 `route.ts`는 둘 다에 걸리지 않으므로 그 테스트가
      낡지 않는다 — 영향 파일에 추가할 필요가 없다.
- [x] **인증·인가** — 새 라우트는 `templates-query.ts:20-35`와 같은 순서로 401 → 401 →
      403을 먼저 거른 뒤에만 정체를 조립한다. 프로젝트 식별자를 입력으로 받지 않으므로
      (projectId는 토큰 해시 조회에서만 나온다) 객체 수준 권한이 구조적으로 보장되고
      IDOR 표면이 없다. 단위 테스트가 `calls` 비교로 호출 순서를 고정한다.
      **→ 뒷부분(식별자 부재·IDOR 무)은 A-7 이후 무효다.** 401/401/403 순서와 `calls` 고정은
      지금도 유효하다. 문서 첫머리의 「이후 변경으로 무효가 된 항목」 참조.
- [x] **상태 변경 없음** — GET 읽기 전용이다. 멱등성·중복 제출·부분 실패·동시성 항목은
      쓰기가 없으므로 해당 없음(증거: 제안된 코드에 write/mutation이 없다).
- [x] API 계약 — `/api/templates` 응답은 **바뀌지 않는다.** 따라서 생성기의 응답 검증
      (`harness-init.mjs:75-80`)과 `tests/server/integration/templates.test.ts:40-48`의
      통째 `deepEqual`이 영향을 받지 않는다.
- [x] **언어 전파** — 정체 payload와 `harness.json` 어느 쪽에도 `language`를 넣지 않는다.
      넣었다면 `?lang=ko` → 404로 init이 깨졌을 자리다(Current State의 증거 사슬).
- [x] 정적 `import` / `export from` — `connect-command`는 같은 slice 내부 상대 경로로만
      쓰인다(`token-reveal.tsx:4`, `owner-token-reveal.tsx:4`). slice 밖 노출은
      `project-token/index.ts`의 컴포넌트 둘뿐이라 public API가 바뀌지 않는다.
- [x] Client Component 경계 — 늘어나는 prop은 문자열 하나다. 주입은 Server Component
      route가 한다. `"use client"` 파일이 `@/server`를 import하지 않는 규칙은 그대로다.
- [x] `src/server` 경계 — `project-identity-query.ts`는 DB를 주입받는 순수 흐름이고
      `project-identity.ts`만 `server-only`다. `templates`와 같은 구분을 유지한다.
- [x] 테스트와 스크립트 참조 — 갱신 대상은 `new-project-form.test.ts`(prop 타입 오류),
      `connect-command.test.ts`(새 두 줄), `harness-init.test.mjs`(`withServer` 분기 +
      신규 여섯). 전부 **예상된 신규 실패**로 분류한다.
- [x] 런타임 side effect — `--print-project`는 쓰기가 없고 `harness.json`도 읽지 않는다.
      회수용 `.mcp.json` 읽기는 던지지 않으며, 권위 있는 파싱과 모든 쓰기는 지금 자리에
      그대로 있다(`:144-147`, `:159-170`).
- [x] 오류 우선순위 — 회수 읽기를 비던지게 두므로, 서버 URL 부재와 `.mcp.json` 파싱
      실패의 보고 순서가 지금과 같다(`harness-init.test.mjs:186-200` 기대 보존).
- [x] 다른 MCP 서버 보존 — 병합 로직(`:148-152`)은 건드리지 않는다. 회수는 `harness`
      항목만 읽는다.
- [x] 미러 동기화 — `packages/core`에 모듈을 추가하지 않으므로
      `scripts/plugin-lib.mjs --check`에 영향이 없다.
- [ ] 정적 자산 URL / `public` 접근 — 해당 없음.
- [ ] localStorage / analytics / 외부 SDK — 해당 없음.

인접 표면 — 검사 여부와 근거:

- `/api/runbook` · `/api/mcp` · `/api/mcp/owner` — 이 제안이 읽지도 쓰지도 않는다.
  `--print-project`는 `/api/project`만 부른다.
- `project_sync` MCP 도구 — **검사했고(위 「language를 옮기면 안 되는 이유」), 바꾸지
  않는다.** step 5가 넘기는 `language`가 `project-sync-query.ts:24`에서 `Project.language`를
  갱신한다는 사실은 증거로만 썼다. `workspaces` 형식과 step 5 문구는 그대로 둔다.
- `agents/runs.ts`의 언어 fallback — 읽어서 근거로만 썼고 수정하지 않는다.
- `docs/architecture/system-overview.md` — `:19`의 다이어그램은 소유자 토큰을 설명하며
  `/api/mcp/owner`만 괄호에 넣을 뿐 `/api/templates`·`/api/runbook`조차 열거하지 않는다.
  엔드포인트 레지스트리가 아니므로 갱신 대상이 아니다.
- `docs/architecture/invariants.md:45`·`README.md:16` — 각각 소유자 도구 집합과 Phase 4
  서술의 문맥에서 경로를 한 번 언급할 뿐 계약을 열거하지 않는다.
- 위 판단의 근거는 `docs/architecture/*.md` 전체에 대한 `/api/` 전수 검색이다. 계약을
  소유하는 문서는 `protocol.md` 하나뿐이다.

추가로 확인한 경계:

- **`.mcp.json` 회수가 잘못된 호스트를 되살릴 위험** — 그 파일은 사용자 저장소의
  것이고 앞선 init이 그 사용자의 값으로 썼다. 코드에 박힌 호스트가 아니므로 C11이
  막으려는 위험과 성격이 다르다. 덮으려면 우선순위 1·2를 쓴다.
- **정규화가 정당한 경로를 깎을 위험** — `.mcp.json`에 쓰는 값이 언제나
  `${SERVER}/api/mcp`(`:150`)이므로 base가 `/api/mcp`로 끝나는 배포는 형태상 없다.
- **`harness.json`의 소유자** — 생성기가 아니라 **스킬이 쓴다.** 값의 출처는 코드가
  보장하지만 파일 조립과 질문 횟수는 지시문이 정한다. Goal과 Risks가 같은 말을 한다.
- **product-copy §9 동기화** — `src/server/mcp/tools.test.mjs:41`이 대조하는 것은
  §13뿐이다. §9는 자동 게이트가 없으므로 손으로 맞추고 리뷰에서 본다.
- **불변식 위반 없음** — `invariants.md:75-78`은 선택되지 않은 프로젝트에서 agent MCP가
  `project_get`만 허용하고 templates·runbook은 "같은 이유로" 거부한다고 정한다. 새
  엔드포인트는 `available`이 아니면 403으로 거부하므로 **거부 쪽 가족에 속하고**
  `project_get` 예외를 넓히지 않는다. 불변식 4(게이트는 사람만)는 에이전트 토큰용 MCP
  서버의 **도구 부재**로 강제되는데(`:40-43`) 이 제안은 도구를 추가하지 않으므로
  무관하다. `invariants.md`는 HTTP 계약 레지스트리가 아니라 근거 문서이므로 그 문서
  자체는 수정하지 않는다(계약 레지스트리는 `protocol.md` 하나뿐).

## Approval

승인 메모:

- 승인 전.
- 아래 결정을 승인 시 확정한다.

| # | 결정 | 권장 | 근거 |
| --- | --- | --- | --- |
| D-1 | step 1을 초안 일괄 제시 + 1회 승인으로 바꾸고, 선택 필드(`knowledge`·`scout`·`readOnly`)를 **묻지 않을지** | **예** | 코드·스키마·서버가 모두 부재를 받아들인다. 스킬만 필수처럼 묻고 있었다 |
| D-2 | 정체를 `/api/templates` 확장으로 줄지, 전용 `GET /api/project`로 줄지 | **전용 라우트** | 아래 「재검토 기록」 |
| D-3 | URL 정규화를 `packages/core` 순수 모듈로 뺄지 | **아니오** | 규칙이 4줄인데 미러 대상이 늘고 `npm run check` 첫 단계가 강제한다 |
| D-4 | 구버전 서버(`/api/project` 없음 → 404)를 어떻게 다룰지 | **되돌아가기** | `--print-project`가 그 사실을 말하고 실패하면 스킬이 지금처럼 묻는다. 중단시키면 서버 배포 순서에 플러그인이 묶인다 |
| D-5 | 정규화가 `/api/mcp/owner`까지 받을지 | **예** | 같은 페이지에 소유자 URL도 표시된다(`project-tokens-page.tsx:93`) |

### 재검토 기록 — 대조 과정에서 뒤집힌 두 판단

**① `/api/templates` 확장 → 전용 라우트 (D-2).** 초판은 "이미 있는 호출을 재사용하니
새 라우트가 없다"는 이유로 확장을 권했다. 세 근거가 그 판단을 뒤집었다.

1. **언어 순환.** `/api/templates`는 `lang`을 요구하고 그 언어 템플릿이 0개면 404다
   (`templates-query.ts:37-40`). `harness.json`이 없으면 language를 모르므로 기본값으로
   불러야 하는데, 그 언어가 없으면 **정체 자체를 받지 못한다.**
2. **깨지는 계약.** `tests/server/integration/templates.test.ts:40-48`이 응답을 통째로
   `deepEqual`한다. 필드를 더하면 반드시 깨지는데, 이 테스트는
   `npm run test:server:integration`에만 있고 CI(`check.yml`)에는 없다 —
   PR은 초록인데 격리 DB에서만 드러나는 잠복 실패가 된다.
3. **낭비.** `--print-project`가 쓰지도 않을 템플릿 본문을 매번 받는다.

**② `language`를 payload에 담는다 → 담지 않는다.** 초판은 `project.language`를 받아
`harness.json`에 쓰라고 했다. `Project.language`의 DB 기본값이 `"ko"`이고 생성 경로가
그것을 덮지 않는다는 사실(`schema.prisma:39`, `project-registration-query.ts:23-37`)을
확인한 뒤, 그대로 두면 **첫 연결이 404로 실패**한다는 것이 드러나 철회했다.

## Execution Plan

1. `dev`에서 `harness/init-fewer-questions` 브랜치를 뗀다. 현재 열린 PR #52
   (`harness/init-knowledge-copy`)와 주제가 다르므로 섞지 않는다.
2. 서버를 먼저 만든다 — `project-identity-query.ts` → `project-identity.ts` →
   `app/api/project/route.ts` → `project-identity-query.test.ts`.
   `npm run test:web`으로 고정한다.
3. 생성기를 바꾼다 — URL 3순위·정규화·비던지는 회수 읽기·`--print-project`,
   `withServer` 분기, 테스트 여섯 추가. `npm test`로 고정한다.
4. 웹을 바꾼다 — `public-url.ts` → `connect-command.ts` → `token-reveal.tsx` →
   호출부 다섯. `npm run test:web`으로 고정한다.
5. `SKILL.md` step 1·2·6을 고친다(`language`를 쓰지 말라는 지시 포함).
6. `docs/architecture/protocol.md`에 `GET /api/project` 절을 더한다 — `:7`의 템플릿 절
   바로 뒤, `## 프로젝트 사용 상태`(`:22`) 앞. 같은 형식으로 처리 순서 문장,
   200·401·403 표(**404 없음** — 언어에 매이지 않는다), 4xx 본문 `{ error: string }`.
7. `product-copy.md` §9를 코드와 맞춘다.
8. 아래 Verification Plan을 돌린다.
9. 수동 인수 — 토큰을 새로 발급해 새 셸에서 2단계 줄들을 붙여넣고, 빈 저장소에서
   `/harness:init`을 돌려 **질문 수를 센다**. 목표는 1. 생성된 `harness.json`에
   `language` 키가 **없는지** 함께 확인한다.
10. `gh pr create --base dev`로 PR을 연다.

## Verification Plan

실행할 검증:

```bash
npm run check      # plugin-lib 동기화 · lint · 타입 · 아키텍처 테스트
npm test           # packages/core + plugin/bin
npm run test:web   # src/**/*.test.{ts,mjs} — 새 서버 단위 테스트가 여기 든다
npm run build
npm run test:server        # tests/server/*.test.ts — 서버 변경 시 로컬(verification.md:45)
```

**격리 DB가 필요한 검증은 이 환경에서 돌릴 수 없다.** `TEST_DATABASE_URL`이
`.env`·`.env.example` 어디에도 없어 `npm run test:server:integration`은 실행 불가다.
이 제안은 `/api/templates` 응답을 건드리지 않으므로
`tests/server/integration/templates.test.ts`가 깨질 이유는 없지만, **확인하지 못했다는
사실을 그대로 기록한다.** 격리 DB를 쓸 수 있는 환경에서 PR 전에 한 번 돌리는 것을
권한다.

**CI는 이 경로를 돌리지 않는다.** `.github/workflows/check.yml`(전문 확인)은
`npm ci` · `db:generate` · `check` · `test` · `test:web` · `build`만 실행한다 —
`test:server`도 `test:server:integration`도 없다. 따라서 위 두 줄은 **사람이 직접**
돌려야 하고, 결과를 아래 표에 적는다.

추가할 테스트:

- 생성기 — ① 세 출처가 모두 없으면 exit 1이고 아무것도 쓰지 않는다(현재 무테스트 분기)
  ② `.mcp.json`만 있으면 그 값으로 성공한다 ③ `--server …/api/mcp`를 줘도 `.mcp.json`에
  `…/api/mcp`가 들어간다(중복 방지) ④ `--print-project`가 `harness.json` 없이 동작하고
  아무것도 쓰지 않는다 ⑤ `--print-project` 출력에 **`language` 키가 없다**
  ⑥ `/api/project`가 404면 그 사실을 말하고 실패한다(D-4)
- 서버 — 성공 응답의 형태(`owner`·`repo`·`branch`·`name`, `language` 없음), 그리고
  실패 경로마다 **어디까지 호출됐는지**를 `calls` 비교로 고정한다.
  `templates-query.test.ts`가 세 부류를 **서로 다른 문장과 서로 다른 `calls`로** 가르므로
  그 구분을 그대로 복제한다:

  | 부류 | 사례 | `reason` | `calls` |
  | --- | --- | --- | --- |
  | 파싱 실패 (`:49-55`) | 헤더 없음 · 빈 헤더 · non-Bearer · 형식 오류 · **소유자 토큰(`ho_`)** | `bearer token required` | **전부 비어 있음** — 토큰 조회도 하지 않는다 |
  | 토큰 조회 실패 (`:67-74`, `:76-85`) | 미등록 · 폐기 | `invalid or revoked token` | `tokenHashes=[hash]`, 나머지 비어 있음 |
  | 접근 거부 (`:87-95`) | 미선택 프로젝트 | `projectAccess`의 사유 보존 | `tokenHashes`·`projectIds`까지, **정체 조회는 없음** |

  파싱 실패가 DB 접근 **이전에** 끊긴다는 것이 이 표의 핵심이다 — 뭉쳐서 검증하면
  그 성질이 사라진다. 소유자 토큰이 첫 부류에 드는 이유는
  `parseBearer(header, kind = "agent")`가 `hs_` 접두 정규식으로만 통과시키기
  때문이다(`token.mjs:10,17-22`). 구현 시 `kind`를 넘기지 않는다 — `"owner"`를 넘기면
  에이전트 토큰이 거부되고 소유자 토큰이 통과한다.
- 웹 — `serverCommands`의 두 줄 고정

검증 기준:

- `npm run check` 첫 단계(`plugin-lib --check`)가 `in sync`를 낸다 —
  `packages/core`를 건드리지 않으므로 drift가 없어야 한다.
- FSD 경계 검사도 통과한다. 근거: `verify-fsd-boundaries.mjs`의 `parseFsdPath`(`:92-104`)가
  `src/fsd/<layer>`가 아닌 경로에 null을 돌려주므로 신설 세 파일은 kebab-case·segment·
  public-API 규칙의 대상이 아니다. `src/server`에 적용되는 규칙은 `server/no-fsd-import`
  (`:245-253`) 하나인데 제안된 import(`prisma`·`projectAccess`·`@harness/core/token.mjs`)는
  전부 비-FSD다. 새 라우트는 `importerFsd`가 null이라 `fsd/server-import-boundary`(`:255`)가
  발화하지 않고, `next/no-server-import-in-client`(`:265`)는 `"use client"`가 있어야 한다.
- lint도 통과한다. `eslint.config.mjs:9-18`의 ignores는 `.next`·`out`·`build`·
  `next-env.d.ts`·`src/generated/**`·`plugin/lib/**`뿐이라 신설 세 파일은 정상적으로
  `next/core-web-vitals`·`next/typescript` 규칙을 받는다 — 제외 대상도, 걸릴 규칙도 없다.
- 기존 실패와 신규 실패 구분: 작업 전에 위 명령들을 돌려 기준선을 기록하고, 작업 후 새로
  생긴 실패만 이 제안의 책임으로 본다. `new-project-form.test.ts`의 타입 오류와
  `harness-init.test.mjs`의 `withServer` 분기 미적용 실패는 **예상된 신규 실패**이며
  같은 커밋에서 해소한다.
- 수동 인수: 첫 연결 질문 1회(충돌 시 2회), 재연결 0회, `harness.json`에 `language` 없음.

## Verification Results

2026-09-20, 브랜치 `harness/init-fewer-questions`(기준 `dev` `d2afacb`)에서 실행했다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | **통과** (exit 0) | `plugin/lib in sync` · eslint · `FSD architecture check passed` · `next typegen` · **`tsc --noEmit`** · 아키텍처·가용성 테스트. 미러 drift 없음(`packages/core` 무변경) |
| `npm test` | **통과 165/165** | 기준선 156 + 신규 9(서버 URL 출처 3 · 정규화 3 · `--print-project` 3). 기존 156건은 재배치 전후로 동일하게 통과 |
| `npm run test:web` | **통과 327/327** | 새 `project-identity-query.test.ts` 11건과 `serverCommands` 3건 포함 |
| `npm run build` | **통과** (exit 0) | 라우트 표에 `ƒ /api/project` 수집 확인 — 타입 통과만이 아니라 실제 수집됐다 |
| `npm run test:server` | **통과 2/2** (exit 0) | CI에 없으므로 직접 실행 |
| `npm run test:server:integration` | **실행 불가** | `TEST_DATABASE_URL` 없음. 이 제안은 `/api/templates` 응답을 건드리지 않아 영향이 없다고 **판단**하지만 확인하지 못했다 |
| 수동 연결 인수 | **미실행** | 실서버·새로 발급한 토큰·빈 저장소가 필요하다. 질문 1회·재연결 0회·`language` 키 부재는 아직 증거가 없다 |

기존 실패와 신규 실패 구분: 구현 전 `npm test` 기준선이 156/156 통과였고, 생성기 제어 흐름
재배치 직후에도 156/156이었다 — 오류 우선순위 보존이 실측으로 확인된 자리다. `new-project-form.test.ts`의
타입 오류와 `harness-init.test.mjs`의 `withServer` 분기는 **예상된 신규 실패**였고 같은 변경에서 해소했다.

## Risks and Rollback

잔여 리스크:

- **질문 횟수는 여전히 문구로만 강제된다.** 값의 출처는 코드가 보장하지만, `harness.json`
  조립과 "한 번만 묻는다"는 스킬 지시문이다. 수동 인수(질문 수 세기)가 유일한 증거다.
- **새 인증 표면이 하나 는다.** 순서를 기존 파일에서 그대로 가져오고 단위 테스트로
  고정하며 프로젝트 식별자를 입력으로 받지 않지만, 라우트가 늘어난 것 자체는 사실이다.
- **`Project.language` 불일치는 그대로 남는다.** DB 기본 `ko` · 시드 `en` ·
  `/api/templates` fallback 없음 · `agent_next`만 fallback 보유. 위험한 창은 영구적이지
  않다 — 첫 init의 step 5가 `project_sync`로 `en`을 써 넣어 DB를 수렴시키므로, 노출되는
  구간은 **"DB가 아직 `ko`인 첫 연결"** 하나다. 이 제안은 그 창에 값을 옮기지 않아
  우회할 뿐 원인을 고치지 않는다. **후속 제안서 후보** — 생성 시 `en`을 명시하거나
  `/api/templates`에 `runs.ts`와 같은 fallback을 주는 방향.
- **격리 DB 검증을 이 환경에서 못 한다.** `/api/templates`를 건드리지 않으므로 영향이
  없다고 판단하지만, 확인되지 않은 판단이다.
- **`product-copy.md` §9에는 자동 대조가 없다.** 코드와 다시 갈라질 수 있다.
- **중복은 남는다.** `harness.json`의 `project`는 여전히 서버 사본이라, 웹에서 브랜치를
  바꾸면 낡은 채 남는다. 근본 해법(선택 필드화)은 후속 제안서다.
- **형제 제안서와의 순서 의존.** 현재 코드와의 불일치는 없지만, 같은 표면을 건드리는
  활성 제안서가 둘 있다.
  - `agent-role-catalog.md`(`awaiting-approval`)는 워크스페이스에 `role`을 더해
    `role: "review"`를 **`path`·`verify` 없이** 선언하게 하고 `Workspace.path`를
    nullable로 바꾼다. 그것이 반영되면 이 제안의 **step 1 초안 지시**(항상 `path`+`verify`를
    담은 워크스페이스를 만든다)가 불완전해지므로 `SKILL.md`를 함께 고쳐야 한다.
    임박하지는 않다 — `pipeline-agent-slots.md:34-37`이 그 작업을 **2단계로 유예**하고
    별도 승인·재검증을 요구한다. 이 제안이 먼저 반영되면 충돌은 없다.
  - `src-server-clean-code-findings.md`(`stage: approved`)는 이 문서가 근거로 인용하는
    `validateWorkspaceSemantics`와 `project_sync` 합집합 상한의 소유자다(F01·F07 = E4).
    그 구현 형태는 이미 현재 코드에 반영돼 있어 이 문서의 인용은 낡지 않았다. 다만 그
    제안서도 **실제 DB 검증을 미완으로 두고 있어**(`:757`) 이 문서와 **같은 격리 DB
    블로커를 공유한다** — `TEST_DATABASE_URL`이 생기면 두 건을 함께 인수하는 편이 낫다.

롤백 방법:

- 단일 PR이므로 `git revert <merge-commit>` 한 번으로 되돌아간다. 스키마·마이그레이션·
  저장 데이터 변경이 없고, 새 라우트는 추가일 뿐이라 되돌려도 기존 연결이 그대로
  동작한다. 이미 생성된 `.mcp.json`과 `harness.json`은 형식이 바뀌지 않는다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-09-20
- verification-summary: `npm run check` 통과 · `npm test` 165/165 · `npm run test:web` 327/327 ·
  `npm run build` 통과(라우트 표에 `ƒ /api/project` 수집 확인) · `npm run test:server` 2/2.
  미검증 2건은 아래 ③④로 이월했다.
- implementation PR/commit: PR #53(머지 커밋 `4cc86c5`), 구현 커밋 `52c7d5d`
  "feat(init): ask once — serve project identity and recover the server URL"
- changed files summary: 20개 파일 +1213/−36. 서버 3 신규(`project-identity-query.ts` ·
  `project-identity.ts` · `app/api/project/route.ts`)와 단위 시험 11건, 생성기
  (`harness-init.mjs`의 URL 3순위·꼬리 정규화·비던지는 `.mcp.json` 회수·`--print-project`)와
  시험 9건, 웹(`public-url.ts`의 `serverUrl()` · `connect-command.ts`의 `serverCommands` ·
  `TokenReveal` 2단계 + 호출부 5), 문서 3(`SKILL.md` step 1·2·6 · `protocol.md`의 새 계약 절 ·
  `product-copy.md` §9).
- remaining follow-up:
  ① `harness.json`의 `project` 선택 필드화 — **재검토 필요.** `hu_`가 `project.slug`에
     의존하게 되어 중복 제거 방향과 부딪힌다(문서 첫머리 참조).
  ② `Project.language` 기본값·fallback 정리 — DB 기본 `ko` · 시드 `en` ·
     `/api/templates`에 fallback 없음 · `agent_next`만 fallback 보유.
  ③ 격리 DB에서 `npm run test:server:integration` — `TEST_DATABASE_URL`이 없어 **미실행**.
     `src-server-clean-code-findings.md`·`user-scoped-project-identity.md`와 **같은 블로커**를
     공유하므로 격리 DB가 생기면 함께 인수하는 편이 낫다.
  ④ 수동 연결 인수 — **미실행.** 빈 저장소에서 질문 수를 센다(목표 1회, 충돌 시 2회,
     재연결 0회)와 생성된 `harness.json`에 `language` 키가 없는지 확인. 실서버와 새로 발급한
     토큰이 필요하다. 이 항목이 없으면 이 제안의 **핵심 목표(질문 7~9 → 1)에 증거가 없다.**
- 닫은 근거: 구현이 `dev`에 머지됐고 남은 것은 이 환경이 제공할 수 없는 환경 의존 검증뿐이라,
  `active/`에 두면 "아직 착수하지 않은 일"로 읽힌다. ③④는 위 목록으로 이월해 추적한다.

## Implementation Results — 2026-09-20

### 실행 범위와 상태

- 사용자의 "이 문서를 바탕으로 수정을 진행하라" 요청으로 구현했다. 브랜치는
  `harness/init-fewer-questions`, 기준은 `dev` `d2afacb`다. **커밋·푸시·PR은 하지 않았다** —
  작업 트리에만 반영했고 `git status`는 아래에 남긴다.
- D-1~D-5는 이 문서의 권장값으로 확정했다: 초안 일괄 제시 · 전용 `GET /api/project` ·
  정규화는 생성기 안에 · 구버전 서버는 되돌아가기 · `/api/mcp/owner`도 정규화.
- **격리 DB 통합 검증과 수동 연결 인수는 하지 않았다.** `TEST_DATABASE_URL`이 없고, 질문 수
  측정에는 실서버와 새로 발급한 토큰이 필요하다. 그 둘이 남아 있으므로 `completed`로 올리지 않는다.

### 구현 내용

- **서버:** `project-identity-query.ts`(순수 흐름·`ProjectIdentity`·인증 순서), `project-identity.ts`
  (`server-only` 주입, 네 열만 select), `app/api/project/route.ts`(배선만), 그리고 세 부류의
  `calls` 계약을 고정하는 `project-identity-query.test.ts` 11건.
- **생성기:** 서버 URL 출처 3순위와 꼬리 정규화, **던지지 않는** `.mcp.json` 회수 읽기(권위 있는
  파싱은 쓰기 준비 단계에 그대로), `--print-project`(설정 파싱을 건너뛰고 아무것도 쓰지 않는다).
  테스트 보조기 `withServer`를 `req.url`로 분기하고 신규 9건을 더했다.
- **웹:** `public-url.ts`에 `serverUrl()`, `connect-command.ts`에 `SERVER_VARIABLE`·`serverCommands`,
  `TokenReveal` 2단계가 토큰 줄 아래 서버 줄을 함께 낸다. `serverUrl` prop을 호출부 다섯에 통과시켰다.
- **문서:** `SKILL.md` step 1(초안 1회)·step 2(URL 3순위)·step 6(knowledge doc은 제안),
  `protocol.md`에 `GET /api/project` 계약 절, `product-copy.md` §9의 2단계 문구.

### 구현 중 드러난 것

- 제안서가 인용한 `SKILL.md:50-57`은 **`dev`가 아니라 PR #52 브랜치 기준**이었다. `dev`에서는
  `:65-66`의 짧은 두 줄이다. 이 문서의 인용을 정정했다. 다섯 차례 대조에서도 못 잡은 이유는
  그때 읽은 작업 트리가 그 브랜치였기 때문이다 — 브랜치를 바꾸면 인용도 다시 봐야 한다.

### 남은 검증과 인수

- 격리 DB에서 `npm run test:server:integration`을 돌려 `tests/server/integration/templates.test.ts`가
  영향을 받지 않았음을 확인한다. `src-server-clean-code-findings.md`도 같은 블로커를 갖고 있으므로
  함께 인수하는 편이 낫다.
- 실서버에 토큰을 새로 발급하고 빈 저장소에서 `/harness:init`을 돌려 **질문 수를 센다**(목표 1회,
  충돌 시 2회, 재연결 0회). 생성된 `harness.json`에 `language` 키가 없는지도 함께 본다.
- 커밋과 `gh pr create --base dev`는 사용자의 몫이다.

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, 완료 전용 `TBD` 외에는 현재 상태에 맞게 적었다.
- [x] `status`는 `completed`이고 위치는 `completed/`다(2026-09-20 닫음). 작성 시점에는
      `pending`·`active/`였다.
- [x] `stage`는 `approved`다. (작성 시점의 이 줄은 `draft`라고 적혀 있었으나 front matter는
      승인과 함께 `approved`로 올라갔다 — 닫으면서 정정했다.)
- [x] `proposal-size`는 `standard`이며 새 인증 라우트와 파일 수에 근거한다.
- [x] 승인 기록은 front matter를 단일 기준으로 하고 본문에는 조건과 재검토 근거만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다 — `/api/templates`와 `language` 정책을 명시적으로
      제외했다.
- [x] 영향 파일별 작업과 판단 근거를 적었고, 건드리지 않는 파일도 이유와 함께 남겼다.
- [x] 안전성 분석에서 라우팅, 인증·인가(IDOR 부재), 상태 변경 없음, API 계약, 언어 전파,
      import, 클라이언트 경계, 오류 우선순위, 테스트, side effect, 미러 동기화를 확인했고,
      검사하지 않은 인접 표면에 근거를 남겼다.
- [x] 검증 명령과 성공 기준, 추가할 테스트를 적었고, **실행 불가한 검증과 CI 공백을
      명시**했다.
- [x] 기존 실패와 신규 실패를 구분하는 방법을 적었다.
- [x] 잔여 리스크를 명시했다.
