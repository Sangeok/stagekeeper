---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-09-11"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-09-10-configurable-pipeline.md"
---

# 저장소 런북이 낡았다는 것을 알린다

## Summary

`/harness:init`이 저장소의 `CLAUDE.md`에 심는 런북 블록은 버전 표시가 없어서, 템플릿이
바뀌어도 낡았다는 것을 아무도 알 수 없다. 실제로 `harness-smoke`의 런북은 설정 가능한
파이프라인 이전 판이라 사이클 순서를 문서에 고정해 놓고 있고, 여섯 사이클 동안 모든 세션이
그것을 읽었다. init이 자기가 쓴 런북 템플릿의 해시를 서버에 보고하게 하고, 서버가 현재
템플릿과 비교해 `pipeline_next`의 개요 응답에 한 줄로 싣는다.

## Goal

- 저장소의 런북이 현재 템플릿과 다를 때 세션이 그 사실을 그 턴에 알게 한다.
- 세션에 새 책임을 지우지 않는다. 보고는 init이 하고, 비교는 서버가 한다.
- 낡은 런북을 읽는 세션이 그 문서의 사이클 순서를 따르지 않도록 명시한다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 마이그레이션이 있다(`Project`에 열 하나 추가).
- API 계약이 늘어난다(새 라우트 하나, `pipeline_next` 개요 응답에 선택 필드 하나).
- 변경 파일이 5개를 넘는다.

## Current State

전달 경로는 이렇다.

1. `plugin/bin/harness-init.mjs:63`이 `/api/templates`에서 템플릿을 받는다.
   로컬 우회로(`HARNESS_TEMPLATES_DIR`)면 디스크에서 읽는다(`:54-59`).
2. `:133`이 `CLAUDE.runbook.md`를 렌더해 마커로 감싼다.
3. `:138-140`이 `CLAUDE.md`에서 마커 사이를 **통째로 갈아끼운다**. 마커가 없으면 파일 끝에 붙인다.
4. `:132` 주석이 밝히듯 런북은 `harness.lock.json`에 넣지 않는다. 병합 파일이기 때문이다.

그래서 **init을 다시 돌리기만 하면 표류는 사라진다.** 문제는 낡았다는 것을 알 방법이
하나도 없다는 것이다.

- 런북 블록에 버전이 없다. 마커는 `<!-- harness:runbook:start -->` 뿐이다.
- lock이 런북을 추적하지 않으므로 플러그인도 모른다.
- 서버는 저장소 안을 볼 수 없다.
- `doc-auditor`는 `**/CLAUDE.md`를 검사 대상에 넣지만 현재 템플릿을 볼 방법이 없다.

실측(`harness-smoke`, 2026-09-11):

| 자리 | 저장소 사본 | 현재 템플릿 |
| --- | --- | --- |
| 사이클 | `1. Dispatch pm → 2. Gate 1 → ... → 8. Dispatch doc-auditor` (순서가 문서에 고정) | `pipeline_next`에 묻고, 그 답대로 하고, 다시 묻는다 |
| 인수 검사 5 | "Open the report the `result` points to" | "Read the report records from `board_get` ... `result` is a summary, not the report location" |
| `feature-scout` | 조건 없이 표에 있다 | "only when `harness.json.scout` is configured" |

이 프로젝트의 파이프라인 v2는 게이트가 셋(`before-plan`, `before-implement`,
`before-verify`)이었다. 그동안 저장소 런북의 "게이트 1 / 게이트 2" 서술은 거짓이었고,
v3에서 우연히 다시 맞았다.

템플릿 본문은 이미 옳다. `plugin/templates/templates.test.mjs:177`이
"the runbook follows pipeline_next — no step or gate numbers"를 검사한다. 즉 이것은
내용 문제가 아니라 **전달 문제**다.

## Scope

포함 범위:

- 런북 버전 계산(순수)과 그 복사본 동기화.
- init의 보고와, 보고를 받는 라우트.
- `Project`의 저장 열과 마이그레이션.
- `pipeline_next` 개요 응답의 선택 필드.
- 런북 템플릿에 "낡았다는 답을 받으면 무엇을 하라"를 한 절 추가.
- product-copy의 해당 행.

제외 범위:

- 손으로 런북 블록을 지우거나 고친 경우의 감지. 그것은 lock과 `--adopt`의 영역이고 이번에
  건드리지 않는다. 서버는 init이 마지막으로 보고한 것만 안다.
- 다른 생성 파일(`.claude/agents/*.md`, `docs/plans/*`)의 표류. 그것들은 lock이 해시로
  추적하고 있어 이 제안의 문제와 성격이 다르다.
- 웹 화면 알림. 이번에는 `pipeline_next`에만 싣는다(결정됨).
- init을 자동으로 다시 돌리는 것. 알리기만 한다.

## Proposal

### 1. 버전의 정의

`sha256(템플릿 원문).slice(0, 12)`. 렌더된 결과가 아니라 **원문**의 해시다. `{{project.name}}`
같은 변수가 치환되기 전이라 프로젝트마다 달라지지 않는다.

```js
// packages/core/runbook.mjs (신규, 순수)
import { createHash } from "node:crypto";

export const RUNBOOK_TEMPLATE = "CLAUDE.runbook.md";

export const runbookVersion = (body) => createHash("sha256").update(body).digest("hex").slice(0, 12);

// 낡았는가. bodies는 현재 서버에 있는 모든 언어의 런북 원문이다.
// 언어를 따로 저장하지 않는 이유: 보고된 해시가 현재 어느 언어의 원문과도 맞지 않으면 낡은 것이다.
// 한 번도 보고되지 않았으면(null) 그것도 "맞다는 근거가 없다" — 같은 답을 준다.
// init은 다시 돌려도 안전하므로, 모를 때 알리는 쪽이 모르고 지나가는 쪽보다 싸다.
export const runbookIsStale = (stored, bodies) =>
  stored === null || !bodies.some((body) => runbookVersion(body) === stored);
```

`packages/core/*.mjs`는 `npm run sync:plugin-lib`이 `plugin/lib/`로 복사하고
`npm run check`가 `--check`로 검사한다(`scripts/plugin-lib.mjs:8`). 새 모듈도 그 규칙을 탄다.

### 2. init이 보고한다

파일을 다 쓴 뒤 한 번 POST한다. 실패해도 init은 성공으로 끝난다 — 파일은 이미 옳고,
보고 실패는 "낡았다"로 기울 뿐이라 안전한 방향이다.

```js
// plugin/bin/harness-init.mjs, write(...) 루프 뒤
if (!DRY && !TPL_DIR) {
  const version = runbookVersion(tpl("CLAUDE.runbook.md"));
  try {
    const res = await fetch(`${SERVER}/api/runbook`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.HARNESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
    if (!res.ok) console.log(`note: runbook version not recorded (${res.status}) — the session may report it as out of date`);
  } catch (e) {
    console.log(`note: runbook version not recorded (${e.message}) — the session may report it as out of date`);
  }
}
```

`--dry-run`은 아무것도 쓰지 않으므로 보고하지 않는다. 로컬 우회로(`TPL_DIR`)는 서버도
토큰도 없으므로 건너뛴다.

### 3. 라우트

`POST /api/runbook`. 인증은 `/api/templates`와 같은 프로젝트 토큰이다.

```ts
// src/app/api/runbook/route.ts (신규) — 배선만 한다
import { recordRunbook } from "@/server/runbook";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await recordRunbook(request.headers.get("authorization"), body);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.reason }, { status: result.status });
}
```

인증·검증은 `src/server/runbook-query.ts`에 주입받는 형태로 둔다. `templates-query.ts`와
같은 모양이라 토큰 실패가 쓰기를 막는지 DB 없이 검증된다.

### 4. 스키마

```prisma
model Project {
  // ...
  runbookVersion String?   // init이 마지막으로 심은 런북 템플릿의 해시. null = 보고된 적 없음
}
```

### 5. `pipeline_next` 개요에 싣는다

key 없는 개요에만 싣는다. 런북은 프로젝트 단위고, 메인 루프가 매 턴 부르는 것이 이 형태다.
낡지 않았으면 필드 자체가 없다 — 정상 응답은 지금과 글자 하나 다르지 않다.

```ts
// src/server/pipeline/run-rules.ts
export type PipelineOverview = {
  head: HeadNext;
  items: PipelineNext[];
  runbook?: { stale: true; note: string };
};
```

문구(product-copy §13에 같은 문장):

> This repository's runbook does not match the current template, or its version was never
> recorded. Ask the owner to run `/harness:init`. Until then take the cycle order from
> `pipeline_next`, not from `CLAUDE.md`.

조립은 `src/server/mcp/deps.ts`의 `pipelineNext` key 없는 가지에서 한다.

### 6. 런북 템플릿

"Before the cycle" 절에 한 문단을 넣는다. 낡은 런북을 읽는 세션이 바로 이 문장도 못 읽는
것은 맞지만, 다음 init 이후의 모든 세션은 읽는다.

> `pipeline_next` answers with a `runbook` field: this file was generated from an older
> template. Tell the owner to run `/harness:init`, and until they do, take the order of
> execution from `pipeline_next` alone — not from this document.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `packages/core/runbook.mjs` | create | 해시와 판정은 순수 정책 | none |
| `packages/core/runbook.test.mjs` | create | 위 모듈의 단위 검증 | none |
| `plugin/lib/runbook.mjs` | create | `sync:plugin-lib`이 만든다. 손으로 쓰지 않는다 | none |
| `prisma/schema.prisma` + migration | update | `Project.runbookVersion String?` | low — nullable 추가라 기존 행에 영향 없음 |
| `src/server/runbook-query.ts` | create | 인증·검증(순수, 주입) | none |
| `src/server/runbook.ts` | create | Prisma 배선 | low |
| `src/server/runbook-query.test.ts` | create | 토큰 실패가 쓰기를 막는지 | none |
| `src/app/api/runbook/route.ts` | create | 배선만 | low — 새 엔드포인트, 기존 경로 불변 |
| `src/server/pipeline/run-rules.ts` | update | `PipelineOverview`에 선택 필드 | low — 선택 필드라 기존 소비자 불변 |
| `src/server/mcp/deps.ts` | update | 개요 조립에서 staleness 조회 | low |
| `src/server/mcp/tools.ts` | update | `pipeline_next` 설명 한 문장 | none |
| `plugin/bin/harness-init.mjs` | update | 보고 호출 | low — 실패해도 init은 성공 |
| `plugin/bin/harness-init.test.mjs` | update | 보고가 dry-run·로컬에서 안 나가는지 | none |
| `plugin/templates/en/CLAUDE.runbook.md` | update | 세션에 줄 지시 한 문단 | none |
| `docs/conventions/product-copy.md` | update | §13 `pipeline_next` 행 | none |

## Safety Analysis

새 경로만 늘리고 기존 경로의 동작은 바꾸지 않는다. `pipeline_next`의 필드는 선택이고
정상 상태에서는 없다.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — `src/app/api/runbook/`은 새 세그먼트다. 기존 `api/templates`,
      `api/mcp`와 겹치지 않는다.
- [x] 정적 `import` / `export from` — `@harness/core/runbook.mjs`는 `token.mjs`와 같은 별칭
      경로를 쓴다. `plugin/lib` 복사본은 `scripts/plugin-lib.mjs`가 관리한다.
- [ ] dynamic `import()` 또는 lazy loading — 해당 없음
- [ ] barrel export(`index.ts`) 경유 참조 — 해당 없음
- [x] 테스트와 스크립트 참조 — `npm run check`의 `plugin-lib --check`가 새 모듈의 복사본
      누락을 잡는다. `seed-templates.ts`는 `.md`만 훑으므로 영향 없음.
- [ ] 정적 자산 URL 또는 `public` 직접 접근 가능성 — 해당 없음
- [x] 타입 선언 — `PipelineOverview`에 선택 필드 추가. 기존 소비자는 좁히기만 하므로 깨지지 않는다.
- [x] 런타임 side effect — 없다. `runbook.mjs`는 함수 셋뿐이다.
- [x] API 계약 — `POST /api/runbook`이 새로 생긴다. 구 플러그인은 부르지 않으므로 그 경우
      `runbookVersion`이 null로 남고, 판정은 "낡음"이 된다(의도한 기본값).

경계 하나를 명시한다. **`runbookIsStale(null, ...)`은 true다.** 이 기능 이전에 init을 돌린
모든 프로젝트가 한 번은 "낡았다"를 본다. 그 답이 시키는 행동(init 재실행)이 정확히 옳은
행동이고, init은 멱등하며, 한 번 돌리면 사라진다.

## Approval

승인 메모:

- 승인 전. 설계 결정 둘은 확정됐다 — 감지는 init이 서버에 보고하는 방식, 알림 위치는
  `pipeline_next` 응답 하나다(웹 배너는 이번 범위 밖).

## Execution Plan

1. `packages/core/runbook.mjs`와 테스트를 쓴다. `npm test`.
2. `npm run sync:plugin-lib`으로 복사본을 만든다.
3. 스키마에 열을 넣고 `npm run db:migrate`. dev 서버 재시작이 필요하므로 소유자에게 묻는다.
4. `src/server/runbook-query.ts`·`runbook.ts`와 테스트, 라우트를 쓴다.
5. `run-rules.ts`에 선택 필드를 넣고 `deps.ts`에서 조립한다. 테스트를 갱신한다.
6. `harness-init.mjs`에 보고를 넣고 `harness-init.test.mjs`를 갱신한다.
7. 런북 템플릿과 product-copy를 고치고, 템플릿을 리시드한다.
8. `harness-smoke`에서 실제로 init을 다시 돌려 표류가 사라지는 것을 확인한다.

## Verification Plan

실행할 검증:

```bash
npm test
npm run test:web
npm run test:templates
npm run check
npm run verify:fsd
```

그리고 실측 한 바퀴:

```bash
# 낡은 상태에서 pipeline_next가 runbook 필드를 싣는지
# init 재실행 뒤 그 필드가 사라지는지
```

검증 기준:

- 다섯 명령이 전부 통과한다.
- `runbook` 필드가 낡은 상태에서만 나오고, init 재실행 뒤 사라진다.
- `harness-smoke`의 `CLAUDE.md` 사이클 절이 `pipeline_next` 판으로 바뀐다.
- 기존 실패와 신규 실패의 구분: 지금 기준선은 `npm test` 137/137, `npm run test:web` 238/238,
  `npm run test:templates` 18/18, `npm run check` exit 0이다. 여기서 늘어난 실패만 신규다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm test` | Not run yet | 137 + 신규 |
| `npm run test:web` | Not run yet | 238 + 신규 |
| `npm run test:templates` | Not run yet | 18 + 신규 |
| `npm run check` | Not run yet | exit 0 기대 |
| `npm run verify:fsd` | Not run yet | pass 기대 |
| `harness-smoke` init 재실행 | Not run yet | 런북 사이클 절이 교체되는지 |

## Risks and Rollback

잔여 리스크:

- 손으로 런북 블록을 지우거나 고친 경우를 서버는 모른다. 제외 범위에 적었다. 이 경우
  서버는 "현재"라고 답하는데 저장소는 틀린 상태다. 그 구멍을 메우려면 세션이 로컬 스탬프를
  읽어 보내야 하고, 그것은 이번에 고른 설계가 아니다.
- 보고 POST가 실패하면 계속 "낡았다"가 나온다. 시끄럽지만 틀리지는 않는다. init 출력에
  그 사실을 한 줄로 남긴다.
- 마이그레이션 뒤 dev 서버를 재시작하지 않으면 옛 Prisma 클라이언트가 새 열을 몰라 화면이
  조용히 틀린다. 실행 계획 3번에 재시작 확인을 넣었다.

롤백 방법:

- 코드는 PR revert. 마이그레이션은 열이 nullable이라 남겨 두어도 무해하다. 되돌릴 때는
  `runbookVersion`을 읽는 코드만 빠지면 기능이 사라진다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했다.
- [x] `status`는 `pending`이고 위치는 `active/`다.
- [x] `stage`는 `draft`다.
- [x] `proposal-size`는 `standard`이고 근거를 적었다(마이그레이션·API 계약·5개 초과).
- [x] 승인 기록은 front matter를 단일 기준으로 쓴다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 있다.
- [x] 안전성 분석에서 라우팅·import·타입·side effect·API 계약을 확인했다.
- [x] 검증 명령과 성공 기준이 있다.
- [x] 기존 실패와 신규 실패를 구분하는 기준선을 적었다.
- [x] 잔여 리스크를 명시했다.
- [ ] 완료 문서 항목 — 아직 pending이다.
