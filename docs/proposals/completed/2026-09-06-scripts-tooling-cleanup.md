---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-06"
approved-by: "Sangeok"
approved-at: "2026-09-06"
approval-scope: "전체(F01~F06, 범위 a) — 대화 승인: \"해당 문서를 바탕으로 실제 수정을 하고 끝났다면 commit하고 push 후 pr까지\""
completed-at: "2026-09-06"
verification-summary: "npm run check exit 0(plugin/lib in sync · architecture 19/19 · 기존 lint 경고 1건 유지) · npm test 123/123 · npm run test:web 157/157 · npm run build exit 0. F01 수용(고아 → exit 1 → sync \"0 copied, 1 removed\" → exit 0), F03 수용(DATABASE_URL 부재·인자 오류 모두 exit 2, DB 미접속), 삭제 대상 부재 검사와 잘못된 루트 가드 확인."
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related:
  - "docs/architecture/README.md"
  - "docs/architecture/verification.md"
  - "docs/proposals/completed/2026-09-01-harness-platform-phase-0-1.md"
  - "docs/proposals/completed/2026-09-04-harness-platform-phase-4-entitlement.md"
  - "docs/proposals/completed/2026-09-05-plugin-clean-code-findings.md"
---

# scripts/ 도구 정리 리팩토링 문서

## Summary

`scripts/`의 파일 6개를 전부 읽고 진입점·CI·문서 참조를 대조했다. **죽은 파일은 없다** — 6개 모두
`package.json`에 진입점이 있고 셋(`verify-fsd-boundaries.mjs`·그 테스트·`check-plugin-lib.mjs`)은
`.github/workflows/check.yml`의 `npm run check`에서 매 PR마다 돈다. 대신 손볼 곳 6건을 찾았다:
Should 4(플러그인 복사본 검사의 단방향 구멍, 검사/동기화 규칙 중복과 테스트 부재, DB 스크립트의
Prisma 부트스트랩 중복과 지연 실패, `scripts/`의 문서 부재)와 Consider 2(`check` 실행 순서,
`.gitkeep` 잔존). 기존 동작은 전부 보존하고 — `npm run check`의 성공 문구 `plugin/lib in sync`까지 —
검사가 **못 보던 것**(원본이 사라진 복사본, 설정되지 않은 `DATABASE_URL`)만 보이게 만든다.

## Goal

- `plugin/lib` 드리프트 검사가 양방향이 되게 한다 — 원본이 지워졌는데 복사본이 남는 경우를 잡고, 동기화가 그것을 지운다.
- 검사와 동기화가 **하나의 규칙**(`packages/core/*.mjs`, 테스트 제외)을 공유하고, 그 규칙에 테스트가 있게 한다.
- 수동 DB 스크립트 둘이 하나의 Prisma 부트스트랩을 쓰고, `DATABASE_URL`이 없으면 첫 쿼리가 아니라 **시작 즉시** 사용법 문구로 실패하게 한다.
- `scripts/`가 무엇이고 언제 돌리는지를 아키텍처 문서(source of truth)에서 읽을 수 있게 한다.
- 작업 유형: 통합(스크립트 2→1) · 추출(공용 헬퍼) · 삭제(`.gitkeep` 2, 통합 전 스크립트 2) · 문서 갱신.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 삭제가 포함된다(`scripts/check-plugin-lib.mjs`, `scripts/sync-plugin-lib.mjs`, `.gitkeep` 2개).
- 변경 파일이 5개를 넘는다(스크립트 5 추가/수정 — 신설 3·수정 2, 삭제 4, `package.json`, 문서 3).
- `npm run check`(CI 게이트)의 명령 문자열이 바뀐다. 롤백은 단순 revert지만 게이트 변경은 검토 범위가 넓다.

## Current State

### 배경/동기

이 문서의 계기는 "`scripts/`는 뭐 하는 거야?"라는 질문에 저장소 문서가 답하지 못했다는 점이다.
`docs/architecture/README.md:36-52`의 저장소 트리에 `scripts/`가 없고, `docs/architecture/verification.md:5`는
`verify-fsd-boundaries.mjs` 하나만 다룬다. `check-plugin-lib`·`seed-templates`·`grant-plan`의 존재와 실행 시점은
완료된 제안서(`2026-09-01-…phase-0-1.md:1794`, `2026-09-04-…phase-4-entitlement.md:265,279`)에만 남아 있다.

파일별 실측(2026-09-06, `git ls-files scripts` 6개 전부 추적 중):

| 파일 | 진입점(`package.json`) | CI(`check.yml`) | 마지막 커밋 |
| --- | --- | --- | --- |
| `verify-fsd-boundaries.mjs` | `lint`, `verify:fsd`, `check` | 실행 | 2026-08-29 |
| `verify-fsd-boundaries.test.mjs` | `test:architecture` | 실행(13/13) | 2026-08-29 |
| `check-plugin-lib.mjs` | `check` 마지막 단계 | 실행 | 2026-08-30 |
| `sync-plugin-lib.mjs` | `sync:plugin-lib` | 수동 | 2026-08-29 |
| `seed-templates.ts` | `seed:templates` | 수동 — `plugin/templates/`가 `.gitignore:51` | 2026-09-03 |
| `grant-plan.ts` | `plan:grant` | 수동 — 결제 경로 없음 | 2026-09-03 |

수동 3개가 CI에 없는 것은 정상이다(DB 접근·비추적 자산). `verify-fsd-boundaries.mjs` 내부 최상위 식별자
30개(상수 9·함수 21)는 전부 정의 외 최소 1회 참조된다 — 이 파일에는 손댈 것이 없다.

### 분석 결과

적용 렌즈: `typescript-clean-code`(TypeScript generalist) — `applied`. 대상이 Node 스크립트라 React 렌즈
(`frontend-cohesion`·`frontend-coupling`·`frontend-readability`·`frontend-predictability`)는 `skipped (stack — React/RSC
규칙이 적용될 코드가 없음)`. 아래 근거는 스택 중립 원칙(단일 규칙 출처, 빠른 실패, 실행 가능한 문서)을 파일·줄로 묶어 쓴다.

#### F01 · Should — `plugin/lib`의 고아 복사본을 검사도 동기화도 보지 못한다

- 위치: `scripts/check-plugin-lib.mjs:3-6`, `scripts/sync-plugin-lib.mjs:3`
- 근거: 검사는 `readdirSync("packages/core")`를 돌며 **원본 기준으로만** 비교한다. `plugin/lib`에만 있는 파일은 순회 대상이
  아니다. 동기화도 복사만 하고 지우지 않는다.
- 실측(2026-09-06): `plugin/lib/zz-orphan-probe.mjs`를 만들고 `node scripts/check-plugin-lib.mjs` → `plugin/lib in sync`, exit 0.
  `node scripts/sync-plugin-lib.mjs` 뒤에도 파일이 남았다(직후 제거, 작업본 깨끗함).
- 영향: `packages/core`의 모듈을 지우거나 이름을 바꾸면 옛 복사본이 `plugin/lib`에 남은 채 `check`가 통과한다. 플러그인은
  marketplace 설치 시 `plugin/`만 복사되므로(`docs/investigations/active/harness-platform.md:375`; 의존 방향은 `docs/architecture/system-overview.md:72`)
  죽은 모듈이 사용자에게 배포된다.
  `git log --diff-filter=DR -- packages/core`는 아직 삭제·개명 이력이 없다 — 지금은 잠재 결함이고, 처음 모듈을 정리하는
  날 터진다.

#### F02 · Should — 검사와 동기화가 같은 규칙을 따로 갖고 있고 테스트가 없다

- 위치: `scripts/check-plugin-lib.mjs:4`, `scripts/sync-plugin-lib.mjs:3` — 둘 다 `f.endsWith(".mjs") && !f.endsWith(".test.mjs")`
- 근거: 한쪽 필터만 바뀌면(예: `.ts` 모듈 추가) 검사는 통과하는데 동기화는 빠뜨리는 조합이 생긴다. 저장소의 다른 검사기
  `verify-fsd-boundaries.mjs`는 `verifyProject(root)`를 export하고 13개 테스트가 임시 디렉터리로 검증하는데(`verify-fsd-boundaries.test.mjs:13-35`),
  플러그인 복사본 검사는 테스트가 0건이다. F01 같은 구멍이 검사가 커밋된 2026-08-30부터 지금까지 테스트 없이 살아 있었다.
- 영향: 게이트 로직의 회귀를 게이트 자신이 못 잡는다.

#### F03 · Should — DB 스크립트 둘이 Prisma 부트스트랩을 복제하고 `DATABASE_URL` 부재를 늦게 안다

- 위치: `scripts/grant-plan.ts:4-7,17,31-33`, `scripts/seed-templates.ts:4,7-8,27,47-48`
- 근거: `import "dotenv/config"` → `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`
  → `try { … } finally { await prisma.$disconnect() }` → `main().catch(…)`가 두 파일에 그대로 있고, "top-level await을 쓰지 않는다 —
  `type:module`이 없어 tsx가 CJS로 변환한다"는 주석도 두 번 있다. `src/server/db.ts:1`이 `import "server-only"`라 스크립트가
  서버의 클라이언트를 재사용할 수 없어 생긴 복제다 — 복제 자체는 불가피했지만 **공유 위치가 스크립트 쪽에 없었다**.
- 실측: `new PrismaPg({ connectionString: undefined })`는 예외 없이 생성된다(2026-09-06, Node 22.13.1). 즉 `.env` 없이
  `npm run plan:grant -- someone pro`를 돌리면 사용법 검사는 통과하고 첫 쿼리에서 pg 드라이버 기본값으로 접속을 시도한다.
  실제 오류 문구는 로컬 DB에 닿을 수 있어 재현하지 않았다.
- 영향: 수동 운영 스크립트의 가장 흔한 실수(`.env` 미설정)가 가장 늦고 가장 불친절하게 실패한다.

#### F04 · Should — `scripts/`가 아키텍처 문서에 없다

- 위치: `docs/architecture/README.md:36-52`(트리)·`:60`(문서 지도)·`:107-109`(개발 시작과 종료 명령), `docs/architecture/verification.md:3-13`(자동 검사·명령 블록), `README.md:17-25`(로컬 확인)
- 근거: 트리는 `src/`·`packages/core/`·`plugin/`·`prisma/`·`docs/architecture/`만 그린다. `verification.md`는 FSD 검사기만 설명하고
  `check-plugin-lib` 드리프트 게이트는 언급이 없다. 루트 `README.md`의 로컬 확인 명령과 아키텍처 README의 개발 시작 명령 둘 다 CI 게이트인 `npm run check`가 없다.
  `AGENTS.md:13-14`는 `docs/architecture/`가 "source of truth"라고 선언한다 — 거기 없는 것은 없는 것이다.
- 영향: 새 기여자(사람이든 에이전트든)가 `scripts/`의 목적과 실행 시점을 완료 제안서를 뒤져 복원해야 한다.

#### F05 · Consider — `check`에서 가장 싼 검사가 맨 뒤에 있다

- 위치: `package.json:12` — `npm run lint && next typegen && tsc --noEmit && npm run test:architecture && node scripts/check-plugin-lib.mjs`
- 근거: 드리프트 검사는 파일 10개를 바이트 비교하는 밀리초 작업인데 ESLint·`tsc` 뒤에 있다. 드리프트만 있는 PR은 가장 느린 두
  단계를 다 기다린 뒤 실패한다.
- 영향: 작다. F01·F02로 `check` 줄을 어차피 고치므로 함께 맨 앞으로 옮긴다.

#### F06 · Consider — 채워진 디렉터리에 `.gitkeep`이 남아 있다

- 위치: `packages/core/.gitkeep`, `plugin/lib/.gitkeep`(`git ls-files` 확인)
- 근거: 두 디렉터리는 각각 모듈 10개가 추적 중이다. `.gitkeep`은 빈 디렉터리를 커밋하기 위한 것이라 역할이 끝났다.
  `docs/**`의 `.gitkeep` 8개는 문서 폴더 골격용이고(그중 `dependencies/active`·`dependencies/completed`·`test-reports/active` 셋은 아직 비어 있다)
  이 문서의 범위 밖이라 그대로 둔다.
- 영향: 없음. F01의 새 검사는 `.mjs`만 보므로 `.gitkeep` 유무는 검사 결과에 영향이 없다 — 지우는 이유는 정리다.

## Scope

포함 범위:

- `scripts/plugin-lib.mjs` 신설(검사·동기화 통합, `--check` 플래그) + `scripts/plugin-lib.test.mjs` 신설
- `scripts/check-plugin-lib.mjs`, `scripts/sync-plugin-lib.mjs` 삭제
- `scripts/lib/prisma.ts` 신설(`withPrisma`), `scripts/grant-plan.ts`·`scripts/seed-templates.ts`가 그것을 사용
- `package.json`의 `check`·`test:architecture`·`sync:plugin-lib` 갱신
- `packages/core/.gitkeep`, `plugin/lib/.gitkeep` 삭제
- `docs/architecture/README.md` 트리·문서 지도·개발 시작 명령 블록, `docs/architecture/verification.md` 명령 블록·자동 검사 항목·스크립트 표, 루트 `README.md` 로컬 확인 갱신

제외 범위(비목표):

- `scripts/verify-fsd-boundaries.mjs`의 규칙·구조 변경 — 미사용 코드가 없고 이 문서의 결함과 무관하다.
- `seed-templates.ts`의 **DB 행 프루닝**(원본 디렉터리에서 사라진 템플릿 행 삭제) — 데이터 삭제라 별도 승인 대상. Open Questions.
- `package.json`에 `"type": "module"` 도입(top-level await 허용) — Next/Prisma 설정 전반에 파급되는 별도 제안.
- `scripts/`를 FSD 검사기의 스캔 대상에 넣는 일 — `verifyProject`는 `src`·`packages/core`만 걷는다(`verify-fsd-boundaries.mjs:436-437`). 운영 스크립트가 `src/server`를 import하는 것은 의도된 예외다.
- 결제 경로·`Subscription` 자동화, `/api/templates` 동작.

## Proposal

### 목표 상태

- **구조**: 플러그인 복사본 규칙은 `scripts/plugin-lib.mjs` 한 곳에 있고 `diffPluginLib(root)`·`syncPluginLib(root)`를 export한다.
  CLI는 `--check`면 판정만, 아니면 동기화한다. Prisma 부트스트랩은 `scripts/lib/prisma.ts`의 `withPrisma(run)` 한 곳에 있다.
- **보존되는 동작**: 고아 파일이 없는 트리에서 `--check`의 exit code와 `plugin/lib in sync` 성공 문구는 지금과 같다. `sync`의 결과
  트리는 지금과 같다(같은 파일을 같은 내용으로). `plan:grant`·`seed:templates`의 인자·출력·exit code(사용법 2, 실행 실패 1)는 같다.
- **새로 보이는 것**: 원본이 없는 복사본은 `orphan: plugin/lib/<f>`로 보고되고 exit 1, 동기화가 그것을 지운다. `DATABASE_URL`이
  비어 있으면 두 DB 스크립트가 DB에 닿기 전에 exit 2로 끝난다.

### 성공 기준

- `npm run check`가 exit 0이고 로그에 `plugin/lib in sync`가 있다.
- `npm run test:architecture`가 기존 13 + 신규 6 = 19 통과.
- F01 재현 절차(아래 Verification Plan)에서 고아 파일이 exit 1 + `orphan:` 줄로 잡히고, `npm run sync:plugin-lib` 뒤 `check`가 통과한다.
- `.env` 없이 `npm run plan:grant -- x pro`가 DB 접속 없이 exit 2로 끝나고 `DATABASE_URL` 안내 문구를 낸다.
- `docs/architecture/README.md` 트리에 `scripts/`가 있고 `verification.md`에서 스크립트의 목적·실행 시점을 읽을 수 있다.

### 대안 분석

**F01·F02 — 복사본 검사/동기화**

- Option A: 두 파일을 그대로 두고 `check-plugin-lib.mjs`에 고아 검사 루프만 추가.
  장점 — 변경 최소. 단점 — 필터 규칙이 여전히 두 곳, 동기화는 여전히 지우지 않아 "검사가 실패하는데 sync로 못 고치는" 상태가 생긴다.
- Option B(선택): 한 모듈 `plugin-lib.mjs`가 diff를 계산하고 검사·동기화가 그 diff를 소비. `verifyProject(root)`처럼 `root` 인자를 받아
  테스트가 임시 디렉터리로 검증.
  장점 — 규칙 단일 출처, 동기화가 검사의 역함수가 됨, 기존 검사기와 같은 테스트 관례. 단점 — 파일 이름이 바뀌어 `package.json` 세 줄과 문서를 함께 고쳐야 한다.
- 근거: 이 저장소는 이미 "검사기는 export + 임시 디렉터리 테스트" 패턴을 갖고 있다(`verify-fsd-boundaries.*`). 같은 모양으로 맞추는 쪽이 유지비가 낮다.

**F03 — Prisma 부트스트랩**

- Option A: 두 파일 각각에 `if (!process.env.DATABASE_URL) …` 가드만 추가. 장점 — 파일 추가 없음. 단점 — 복제가 3덩이로 늘어난다.
- Option B(선택): `scripts/lib/prisma.ts`에 `withPrisma`를 두고 가드·생성·disconnect를 한 곳에서. 장점 — 세 번째 DB 스크립트가 생기면
  그대로 쓴다, 주석(CJS 변환 이유)도 한 곳. 단점 — 소비자가 둘뿐인 추출이다(rule of three 미달).
- 근거: 추출의 명분은 중복 제거보다 **빠른 실패 지점을 한 곳에 두는 것**이다. 가드가 두 파일에 흩어지면 다음 스크립트가 빠뜨린다.
  `scripts/lib/`는 FSD 검사기의 금지 폴더 규칙(`src/lib`)에 걸리지 않는다(`verify-fsd-boundaries.mjs:22,417`은 `src/` 아래만 본다).

**F04 — 문서 위치**

- Option A: `scripts/README.md` 신설. 장점 — 폴더 안에서 바로 보인다. 단점 — `AGENTS.md`가 `docs/architecture/`를 source of truth로
  선언하고 있어 두 번째 출처가 된다.
- Option B(선택): `docs/architecture/README.md` 트리 한 줄 + `verification.md`에 표. 루트 `README.md`에는 `npm run check` 한 줄.
- 근거: 기존 문서 지도의 규칙을 따른다. `verification.md`는 이미 "자동 검사"를 설명하는 문서라 드리프트 게이트가 들어갈 자리가 있다.

### 구현 계획

#### `scripts/plugin-lib.mjs` (신설 — `check-plugin-lib.mjs`·`sync-plugin-lib.mjs`를 대체)

Before (`scripts/check-plugin-lib.mjs`, 전체):

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

Before (`scripts/sync-plugin-lib.mjs`, 전체):

```js
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
mkdirSync("plugin/lib", { recursive: true });
for (const f of readdirSync("packages/core")) if (f.endsWith(".mjs") && !f.endsWith(".test.mjs")) copyFileSync(`packages/core/${f}`, `plugin/lib/${f}`);
console.log("plugin/lib synced");
```

After (`scripts/plugin-lib.mjs`, 전체):

```js
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = "packages/core";
const LIB = "plugin/lib";

// 배포 대상은 core의 모듈만이다 — 테스트는 저장소에서만 돈다. 검사와 동기화가 이 한 줄을 공유한다.
const isDeliverable = (name) => name.endsWith(".mjs") && !name.endsWith(".test.mjs");

function listModules(directory) {
  return readdirSync(directory).filter(isDeliverable).sort();
}

// drift = 복사본이 없거나 내용이 다른 원본. orphan = 원본이 사라진 복사본.
// 원본 디렉터리가 없으면 던진다 — 잘못된 cwd에서 "원본 0개"로 읽혀 복사본을 전부 지우는 일을 막는다(Before의 ENOENT와 같은 실패 방식).
export function diffPluginLib(projectRoot = process.cwd()) {
  const core = resolve(projectRoot, CORE);
  const lib = resolve(projectRoot, LIB);
  if (!existsSync(core)) throw new Error(`${CORE} not found under ${projectRoot} — run from the repository root`);
  const coreModules = listModules(core);
  const drift = coreModules.filter((name) => {
    const copy = join(lib, name);
    return !existsSync(copy) || readFileSync(copy, "utf8") !== readFileSync(join(core, name), "utf8");
  });
  const orphan = (existsSync(lib) ? listModules(lib) : []).filter((name) => !coreModules.includes(name));
  return { drift, orphan };
}

// 복사본을 원본과 같게 만든다 — 다른 것은 덮어쓰고 원본이 없는 것은 지운다.
export function syncPluginLib(projectRoot = process.cwd()) {
  const { drift, orphan } = diffPluginLib(projectRoot);
  mkdirSync(resolve(projectRoot, LIB), { recursive: true });
  for (const name of drift) copyFileSync(resolve(projectRoot, CORE, name), resolve(projectRoot, LIB, name));
  for (const name of orphan) rmSync(resolve(projectRoot, LIB, name));
  return { drift, orphan };
}

function runCli() {
  if (process.argv.includes("--check")) {
    const { drift, orphan } = diffPluginLib();
    for (const name of drift) console.log(`drift: ${LIB}/${name}`);
    for (const name of orphan) console.log(`orphan: ${LIB}/${name}`);
    if (drift.length || orphan.length) { console.log("run: npm run sync:plugin-lib"); process.exit(1); }
    console.log("plugin/lib in sync");
    return;
  }
  const { drift, orphan } = syncPluginLib();
  console.log(`plugin/lib synced (${drift.length} copied, ${orphan.length} removed)`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) runCli();
```

보존해야 할 불변식: **고아 파일이 없는 트리에서 `--check`의 exit code는 Before의 `check-plugin-lib.mjs`와 같다**(모든 core 모듈이
바이트 동일한 복사본을 가질 때만 0). 새 분기 두 개 — `orphan` 보고와 `rmSync` — 는 F01의 의도된 변경이며 실측 재현으로 근거를 댔다.
`drift:`·`orphan:` 줄은 파일 이름순으로 나온다(Before는 `readdirSync` 순서) — 보존 대상이 아니며 테스트가 이 순서를 전제한다.
CLI 가드(`process.argv[1]` 비교)는 `verify-fsd-boundaries.mjs:470-471`과 같은 관용구다. 복사본 쪽만 `existsSync`로 바꿔 Before의
`try { readFileSync } catch {}` 우회를 없앴다 — 복사본이 없을 때 결과(drift)는 같다. 원본 디렉터리(`packages/core`) 부재는 Before의 `readdirSync`
ENOENT처럼 **던진다** — 조용히 "모듈 0개"로 읽으면 복사본 전부가 고아가 되어 지워진다(Safety Analysis의 "잘못된 루트" 항목).

#### `scripts/plugin-lib.test.mjs` (신설)

`verify-fsd-boundaries.test.mjs:13-35`의 임시 디렉터리·`write`·`afterEach` 관례를 그대로 따른다. 단언값은 전부 입력으로 준 파일
이름의 집합이라 계산이 없다(no-computation). 6번째 케이스의 예외 메시지 정규식은 위 After 코드의 문자열을 그대로 가리킨다.

```js
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { diffPluginLib, syncPluginLib } from "./plugin-lib.mjs";

const temporaryProjects = [];

function project() {
  const root = mkdtempSync(join(tmpdir(), "stagekeeper-plugin-lib-"));
  temporaryProjects.push(root);
  return root;
}

function write(root, path, source = "export {};\n") {
  const target = join(root, ...path.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source, "utf8");
}

afterEach(() => {
  for (const root of temporaryProjects.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("plugin-lib", () => {
  it("reports nothing when every core module has an identical copy", () => {
    const root = project();
    write(root, "packages/core/config.mjs", "export const a = 1;\n");
    write(root, "packages/core/config.test.mjs", "test only\n");
    write(root, "plugin/lib/config.mjs", "export const a = 1;\n");

    assert.deepEqual(diffPluginLib(root), { drift: [], orphan: [] });
  });

  it("reports a changed or missing copy as drift", () => {
    const root = project();
    write(root, "packages/core/config.mjs", "export const a = 1;\n");
    write(root, "packages/core/vars.mjs", "export const v = 1;\n");
    write(root, "plugin/lib/config.mjs", "export const a = 2;\n");

    assert.deepEqual(diffPluginLib(root).drift, ["config.mjs", "vars.mjs"]);
  });

  it("reports a copy whose source is gone as orphan", () => {
    const root = project();
    write(root, "packages/core/config.mjs");
    write(root, "plugin/lib/config.mjs");
    write(root, "plugin/lib/removed.mjs");

    assert.deepEqual(diffPluginLib(root), { drift: [], orphan: ["removed.mjs"] });
  });

  it("ignores test files and non-mjs files on both sides", () => {
    const root = project();
    write(root, "packages/core/config.mjs");
    write(root, "packages/core/config.test.mjs");
    write(root, "plugin/lib/config.mjs");
    write(root, "plugin/lib/.gitkeep", "");

    assert.deepEqual(diffPluginLib(root), { drift: [], orphan: [] });
  });

  it("sync copies drift, removes orphans, and is a no-op when run again", () => {
    const root = project();
    write(root, "packages/core/config.mjs", "export const a = 1;\n");
    write(root, "plugin/lib/config.mjs", "export const a = 0;\n");
    write(root, "plugin/lib/removed.mjs");

    assert.deepEqual(syncPluginLib(root), { drift: ["config.mjs"], orphan: ["removed.mjs"] });
    assert.equal(existsSync(join(root, "plugin/lib/removed.mjs")), false);
    assert.deepEqual(diffPluginLib(root), { drift: [], orphan: [] });
    assert.deepEqual(syncPluginLib(root), { drift: [], orphan: [] });
  });

  it("refuses to run when packages/core is missing (wrong working directory)", () => {
    const root = project();
    write(root, "plugin/lib/config.mjs");

    assert.throws(() => diffPluginLib(root), /packages\/core not found/);
    assert.throws(() => syncPluginLib(root), /packages\/core not found/);
    assert.equal(existsSync(join(root, "plugin/lib/config.mjs")), true);
  });
});
```

#### `package.json` (scripts 블록 중 바뀌는 세 줄)

Before:

```json
"test:architecture": "node --test scripts/verify-fsd-boundaries.test.mjs",
"check": "npm run lint && next typegen && tsc --noEmit && npm run test:architecture && node scripts/check-plugin-lib.mjs",
"sync:plugin-lib": "node scripts/sync-plugin-lib.mjs"
```

After:

```json
"test:architecture": "node --test \"scripts/*.test.mjs\"",
"check": "node scripts/plugin-lib.mjs --check && npm run lint && next typegen && tsc --noEmit && npm run test:architecture",
"sync:plugin-lib": "node scripts/plugin-lib.mjs"
```

`node --test "scripts/*.test.mjs"`는 Node 22.13.1에서 실측 확인했다(기존 13개 통과). `test` 스크립트가 이미 같은 형태의 glob을 쓴다(`package.json:13`).
test runner의 glob 해석은 Node 21+ 기능이다 — CI는 node 22(`check.yml:21`)라 문제없고, `package.json`에 `engines`가 없으므로 Node 20 이하 로컬에서는
`test:architecture`가 파일을 못 찾는다(기존 `test` 스크립트와 같은 조건이라 새 제약은 아니다). `check`의 순서 이동이 F05다.

#### `scripts/lib/prisma.ts` (신설)

```ts
// 스크립트용 Prisma 부트스트랩. src/server/db.ts는 server-only라 스크립트에서 import할 수 없다.
// top-level await을 쓰지 않는다 — package.json에 type:module이 없어 tsx가 CJS로 변환한다.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

// DATABASE_URL이 없으면 첫 쿼리가 아니라 여기서 끝낸다 — PrismaPg는 빈 연결 문자열로도 예외 없이 만들어진다.
export async function withPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set — copy .env.example to .env and fill it in");
    process.exit(2);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
```

`.env.example:1`에 `DATABASE_URL` 항목이 있어 안내 문구의 경로가 실제와 맞는다. exit 2는 `grant-plan.ts:15`가 사용법 오류에 쓰는 코드와 같다
(`seed-templates.ts`는 인자 검증이 없어 2를 쓰지 않으며, 실행 실패는 두 스크립트 모두 1이다).

#### `scripts/grant-plan.ts`

Before (전체):

```ts
// 사용자에게 플랜을 붙인다. 결제 경로가 없는 동안 Subscription 행을 쓰는 유일한 길이다 — 손으로 돌린다.
// 사용: npm run plan:grant -- <github login> <free|pro|max> [note]
// top-level await을 쓰지 않는다 — package.json에 type:module이 없어 tsx가 CJS로 변환한다.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PLANS, isPlan } from "../packages/core/entitlement.mjs";
import { PrismaClient } from "../src/generated/prisma/client";

const [login, plan, ...rest] = process.argv.slice(2);
const note = rest.join(" ") || null;

async function main() {
  if (!login || !isPlan(plan)) {
    console.error(`usage: npm run plan:grant -- <github login> <${PLANS.join("|")}> [note]`);
    process.exit(2);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    // login은 unique가 아니다(GitHub에서 바뀔 수 있어 githubId만 unique). 둘 이상이면 손으로 고르게 한다.
    const users = await prisma.user.findMany({ where: { login }, select: { id: true, githubId: true } });
    if (users.length !== 1) {
      console.error(users.length === 0 ? `no user with login ${login} — sign in on the web once first` : `ambiguous login ${login}: githubIds ${users.map((u) => u.githubId).join(", ")}`);
      process.exit(1);
    }
    const row = await prisma.subscription.upsert({
      where: { userId: users[0].id },
      create: { userId: users[0].id, plan, source: "manual", note },
      update: { plan, source: "manual", note },
    });
    console.log(`granted: ${login} -> ${row.plan}${note ? ` (${note})` : ""}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

After (전체):

```ts
// 사용자에게 플랜을 붙인다. 결제 경로가 없는 동안 Subscription 행을 쓰는 유일한 길이다 — 손으로 돌린다.
// 사용: npm run plan:grant -- <github login> <free|pro|max> [note]
import { PLANS, isPlan } from "../packages/core/entitlement.mjs";
import { withPrisma } from "./lib/prisma";

const [login, plan, ...rest] = process.argv.slice(2);
const note = rest.join(" ") || null;

async function main() {
  if (!login || !isPlan(plan)) {
    console.error(`usage: npm run plan:grant -- <github login> <${PLANS.join("|")}> [note]`);
    process.exit(2);
  }
  await withPrisma(async (prisma) => {
    // login은 unique가 아니다(GitHub에서 바뀔 수 있어 githubId만 unique). 둘 이상이면 손으로 고르게 한다.
    const users = await prisma.user.findMany({ where: { login }, select: { id: true, githubId: true } });
    if (users.length !== 1) {
      console.error(users.length === 0 ? `no user with login ${login} — sign in on the web once first` : `ambiguous login ${login}: githubIds ${users.map((u) => u.githubId).join(", ")}`);
      process.exit(1);
    }
    const row = await prisma.subscription.upsert({
      where: { userId: users[0].id },
      create: { userId: users[0].id, plan, source: "manual", note },
      update: { plan, source: "manual", note },
    });
    console.log(`granted: ${login} -> ${row.plan}${note ? ` (${note})` : ""}`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
```

보존해야 할 불변식: **사용법 오류는 DB에 닿지 않고 exit 2, 사용자 0명/2명 이상은 exit 1, 성공 시 `granted:` 한 줄** — 검사 순서
(사용법 → 연결 → 조회 → upsert)가 Before와 같다. `Subscription.plan`은 `String`(`prisma/schema.prisma`)이라 `isPlan`이 타입 가드가 아니어도
Before처럼 컴파일된다. 콜백 안의 `process.exit(1)`이 `finally`를 건너뛰는 것도 Before와 같다.

#### `scripts/seed-templates.ts`

Before (import 블록과 `main` — `opt`·`isLangDir`·`walk`는 그대로):

```ts
import "dotenv/config";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { splitTemplate } from "../src/server/agents/steps";
```

```ts
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let total = 0;
  try {
    for (const lang of readdirSync(DIR).filter((n) => isLangDir(DIR, n))) {
      const root = join(DIR, lang);
      for (const file of walk(root)) {
        // 키는 언어를 뺀 상대 경로 — 언어는 쿼리 파라미터로 갈린다. 구분자는 URL 형태로 통일한다.
        const path = relative(root, file).split(sep).join("/");
        const body = readFileSync(file, "utf8").replace(/\r\n/g, "\n"); // autocrlf 작업본이 CRLF여도 DB에는 LF만
        // 에이전트 템플릿은 저장 전에 한 번 파싱한다 — 형식 오류는 agent_next가 500을 내기 전, 여기서 터져야 한다.
        const steps = path.startsWith("agents/") ? splitTemplate(body).steps.length : null;
        await prisma.template.upsert({
          where: { lang_path: { lang, path } },
          create: { lang, path, body },
          update: { body },
        });
        console.log(`seed: ${lang}/${path}${steps === null ? "" : ` (${steps} steps)`}`);
        total += 1;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`done: ${total} templates`);
}
```

After (같은 범위):

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { splitTemplate } from "../src/server/agents/steps";
import { withPrisma } from "./lib/prisma";
```

```ts
async function main() {
  const total = await withPrisma(async (prisma) => {
    let count = 0;
    for (const lang of readdirSync(DIR).filter((n) => isLangDir(DIR, n))) {
      const root = join(DIR, lang);
      for (const file of walk(root)) {
        // 키는 언어를 뺀 상대 경로 — 언어는 쿼리 파라미터로 갈린다. 구분자는 URL 형태로 통일한다.
        const path = relative(root, file).split(sep).join("/");
        const body = readFileSync(file, "utf8").replace(/\r\n/g, "\n"); // autocrlf 작업본이 CRLF여도 DB에는 LF만
        // 에이전트 템플릿은 저장 전에 한 번 파싱한다 — 형식 오류는 agent_next가 500을 내기 전, 여기서 터져야 한다.
        const steps = path.startsWith("agents/") ? splitTemplate(body).steps.length : null;
        await prisma.template.upsert({
          where: { lang_path: { lang, path } },
          create: { lang, path, body },
          update: { body },
        });
        console.log(`seed: ${lang}/${path}${steps === null ? "" : ` (${steps} steps)`}`);
        count += 1;
      }
    }
    return count;
  });
  console.log(`done: ${total} templates`);
}
```

파일 상단 주석 세 줄 중 "top-level await을 쓰지 않는다 …" 한 줄은 `lib/prisma.ts`로 옮겨지므로 지운다(나머지 두 줄은 유지).
보존해야 할 불변식: **템플릿마다 `seed:` 한 줄, 끝에 `done: N templates`, 파싱 실패는 upsert 전에 throw → exit 1** — Before와 같다.
`done:` 출력이 disconnect 뒤에 나오는 순서도 같다.

#### `docs/architecture/README.md` (트리)

Before (`:48-51`):

```text
├── packages/core/           # 런타임 의존성 없는 순수 규칙·프로토콜
├── plugin/                  # 사용자 저장소에 설치되는 Claude Code 플러그인
├── prisma/                  # DB schema와 migration
└── docs/architecture/       # 현재 문서
```

After:

```text
├── packages/core/           # 런타임 의존성 없는 순수 규칙·프로토콜
├── plugin/                  # 사용자 저장소에 설치되는 Claude Code 플러그인
├── prisma/                  # DB schema와 migration
├── scripts/                 # 저장소 검사·복사본 동기화·수동 운영 스크립트 (앱 런타임 아님, verification.md)
└── docs/architecture/       # 현재 문서
```

#### `docs/architecture/README.md` (개발 시작과 종료)

Before (`:107-109`):

```powershell
npm run verify:fsd
npm run lint
npm run test:architecture
```

After:

```powershell
npm run check      # CI와 같은 게이트 — 복사본 동기화 검사 · lint · 타입 · 아키텍처 테스트
npm run verify:fsd
npm run test:architecture
```

루트 `README.md`와 같은 처리다 — `lint`는 `check`에 포함된다.

#### `docs/architecture/README.md` (문서 지도)

`verification.md`에 절이 하나 늘어나므로 지도의 설명도 맞춘다.

Before (`:60`):

```markdown
- [verification.md](./verification.md): 자동 경계 검사와 리뷰 체크리스트
```

After:

```markdown
- [verification.md](./verification.md): 자동 경계 검사, 저장소 스크립트 목록, 리뷰 체크리스트
```

#### `docs/architecture/verification.md`

명령 블록(`:8-10`)에 `npm run check`를 한 줄 더하고, "## 자동 검사" 절의 검사 대상 목록 끝(`:29` 다음)에 한 항목을 추가하고, "## 변경 전 체크리스트" 앞에
절을 하나 넣는다. 여기서는 `npm run lint`를 지우지 않는다 — `:13`이 그 줄의 의미(ESLint 뒤 FSD 검사)를 설명하고 있다.

Before (`:8-10`):

```powershell
npm run verify:fsd
npm run test:architecture
npm run lint
```

After:

```powershell
npm run verify:fsd
npm run test:architecture
npm run lint
npm run check      # 위 셋 + 복사본 동기화 검사 + 타입 검사 — CI와 같은 게이트
```

After (추가되는 부분만):

```markdown
- `plugin/lib`가 `packages/core`의 배포 모듈과 바이트 동일한지 — 내용이 다른 것(drift)과
  원본이 사라진 것(orphan) 모두 (`scripts/plugin-lib.mjs --check`, `npm run check`의 첫 단계)

## 저장소 스크립트

`scripts/`는 앱 런타임 코드가 아니다. 검사기와 운영 도구만 둔다.

| 스크립트 | 진입점 | 언제 | 하는 일 |
| --- | --- | --- | --- |
| `verify-fsd-boundaries.mjs` | `npm run verify:fsd`, `npm run lint`, `npm run check` | CI마다 | 위 FSD 경계 검사 |
| `verify-fsd-boundaries.test.mjs`, `plugin-lib.test.mjs` | `npm run test:architecture` | CI마다 | 검사기 자체의 테스트 |
| `plugin-lib.mjs --check` | `npm run check` 첫 단계 | CI마다 | `plugin/lib` 드리프트·고아 판정, 실패 시 exit 1 |
| `plugin-lib.mjs` | `npm run sync:plugin-lib` | `packages/core/*.mjs`를 바꾼 뒤 | 복사본을 원본과 같게(덮어쓰기·삭제) |
| `seed-templates.ts` | `npm run seed:templates [-- --dir <dir>]` | private 템플릿을 바꾼 뒤, 로컬에서 | `plugin/templates/<lang>/**/*.md`를 `Template` 테이블에 upsert. `agents/*`는 저장 전 파싱 |
| `grant-plan.ts` | `npm run plan:grant -- <login> <free\|pro\|max> [note]` | 플랜을 붙일 때, 로컬에서 | `Subscription` upsert. 결제 경로가 없는 동안 유일한 쓰기 경로 |
| `lib/prisma.ts` | (헬퍼) | — | DB 스크립트의 Prisma 부트스트랩. `DATABASE_URL`이 없으면 exit 2 |

`plugin/lib/`는 직접 고치지 않는다 — ESLint도 그 폴더를 무시한다(`eslint.config.mjs`). 원본을 고치고 동기화한다.
```

#### 루트 `README.md` (`## 로컬 확인`)

Before (`:20-24`):

```powershell
npm run dev
npm run lint
npm run verify:fsd
npm run test:architecture
npm run build
```

After:

```powershell
npm run dev
npm run check      # CI와 같은 게이트 — 복사본 동기화 검사 · lint · 타입 · 아키텍처 테스트
npm run verify:fsd
npm run test:architecture
npm run build
```

`npm run lint`는 `check`에 포함되므로 한 줄로 합친다.

## Affected Files

| 경로 또는 영역 | 작업 | 항목 | 판단 근거 | 리스크 |
| --- | --- | --- | --- | --- |
| `scripts/plugin-lib.mjs` | add | F01·F02·F05 | 검사·동기화 규칙 단일 출처, `root` 인자로 테스트 가능 | low — 순수 파일 비교·복사 |
| `scripts/plugin-lib.test.mjs` | add | F02 | 기존 검사기 테스트 관례 미러링 | none |
| `scripts/check-plugin-lib.mjs` | delete | F01·F02 | `package.json:12` 외 참조 없음(`git grep`; 완료 제안서 본문은 이력 기록) | low — 대체 스크립트가 같은 성공 문구 출력 |
| `scripts/sync-plugin-lib.mjs` | delete | F01·F02 | `package.json:20` 외 참조 없음(같음) | low |
| `package.json` | update | F02·F05 | `check`·`test:architecture`·`sync:plugin-lib` 세 줄 | medium — CI 게이트 문자열. `check.yml`은 `npm run check`만 호출하므로 워크플로 수정 없음 |
| `scripts/lib/prisma.ts` | add | F03 | `server-only`인 `src/server/db.ts`의 스크립트용 대응물 | low — tsconfig `**/*.ts`로 타입 검사됨 |
| `scripts/grant-plan.ts`, `scripts/seed-templates.ts` | update | F03 | 부트스트랩만 교체, 본문 동일 | low — 수동 스크립트, 실행 전 tsc가 잡는다 |
| `packages/core/.gitkeep`, `plugin/lib/.gitkeep` | delete | F06 | 각 디렉터리에 추적 파일 10개 | none |
| `docs/architecture/README.md`, `docs/architecture/verification.md`, `README.md` | update | F04 | source of truth에 `scripts/` 편입 | none |

## Safety Analysis

- **삭제 파일 참조**: `git grep -n "check-plugin-lib\|sync-plugin-lib"`로 `package.json` 두 줄과 완료 제안서·조사 문서(`docs/investigations/active/harness-platform.md:359,375,1231`) 본문만
  나온다. 문서 쪽은 당시 결정 기록이라 고치지 않는다(`docs/proposals/README.md`: 완료 문서의 판단 근거는 보존).
- **CI 게이트**: `.github/workflows/check.yml`은 `npm run db:generate` → `npm run check` → `npm test` → `npm run test:web` → `npm run build`를
  호출한다. `check`의 내부 순서만 바뀌고 워크플로 파일은 건드리지 않는다. 새 첫 단계는 `plugin/lib` 파일 비교라 `db:generate` 결과에 의존하지 않는다.
- **동기화가 파일을 지운다**: 대상은 `plugin/lib/*.mjs` 중 `packages/core`에 원본이 없는 것뿐이다. `plugin/lib`는 ESLint 무시 대상이고
  문서상 "복사본 직접 수정 금지"(`2026-09-05-plugin-clean-code-findings.md` Affected Files)라 손으로 만든 파일이 있을 경로가 아니다. 지워도 `git`에 있다.
- **`--check`가 `.gitkeep`을 고아로 보지 않는다**: 필터가 `.mjs`만 통과시킨다. 테스트 4번째 케이스가 이것을 고정한다.
- **FSD 검사기**: `scripts/lib/`는 `verifyProject`의 스캔 경로(`src`, `packages/core`) 밖이고, 금지 폴더 규칙은 `src/<folder>`만 본다. `npm run verify:fsd` 결과는 변하지 않는다.
- **tsx CJS 변환·import 순서**: `withPrisma`는 top-level await을 쓰지 않는다. `import "dotenv/config"`는 헬퍼 모듈 로드 시 실행되고 `DATABASE_URL`은
  `withPrisma` 호출 시점에 읽으므로 순서 문제가 없다. After에서 `dotenv`보다 먼저 로드되는 모듈 — `grant-plan`의 `entitlement.mjs`, `seed-templates`의
  `steps.ts`와 그 import `@harness/core/deliver.mjs`·`transitions.mjs` — 에는 `process.env` 읽기가 없다(2026-09-06 `grep` 실측). import 시점의 env 의존이
  없으므로 순서 변경이 동작을 바꾸지 않는다.
- **`plan`의 타입**: `isPlan(x)`는 JSDoc 타입 가드가 없고(`packages/core/entitlement.mjs:17`) `Subscription.plan`은 `String`이다. Before가 컴파일되는
  같은 이유로 After도 컴파일된다.
- **런타임 부수효과**: 스크립트는 Next 번들·라우팅·`public/`·barrel export와 무관하다. `npm run build` 결과가 바뀔 경로가 없다.
- **재실행·부분 실패·동시 실행**: `syncPluginLib`는 diff를 소비하므로 두 번째 실행은 `(0 copied, 0 removed)`이고, 복사 도중 실패해도 재실행이 남은 diff만
  처리한다 — 테스트 5번째 케이스가 두 번째 sync의 빈 diff를 고정한다. 같은 checkout에서 동시에 돌릴 공유 집계는 없다.
  `grant-plan`·`seed-templates`의 upsert는 유일키(`Subscription.userId @unique`, `Template @@id([lang, path])`)로 재실행·중복 실행이 같은 행을
  갱신하고, 두 호출자가 동시에 돌아도 마지막 쓰기가 남을 뿐 읽고-조건부로-바꾸는 집계 불변식이 없다 — Before와 같고 이 제안이 바꾸지 않는다.
- **`rmSync`의 범위**: `plugin/bin/harness-init.mjs`·`harness-init.test.mjs`가 import하는 `../lib/*.mjs` 6개(`config`·`deliver`·`entitlement`·`manifest`·
  `render`·`vars`)는 전부 `packages/core`에 원본이 있다(2026-09-06 실측). 즉 고아 삭제가 플러그인이 import하는 파일을 지울 수 있는 상태가 아니다.
- **잘못된 루트에서의 실패 방식**: Before는 `readdirSync("packages/core")`가 ENOENT로 던져 아무것도 건드리지 않는다. After의 첫 초안은 원본 디렉터리
  부재를 `existsSync`로 삼켜 "모듈 0개"로 읽었고, 그 상태에서 `sync`가 `plugin/lib`의 복사본을 **전부 고아로 지웠다**(2026-09-06 리콘실에서 임시
  디렉터리로 재현; 빈 디렉터리에서는 `plugin/lib`를 만들어 놓기까지 했다). 그래서 `diffPluginLib`가 원본 부재를 던지도록 고쳤고 6번째 테스트가
  그것을 고정한다 — 실패 방식이 Before와 같아진다.
- **드라이런(2026-09-06, 커밋 없이 적용 후 전부 되돌림, 원본 부재 가드를 넣은 6개 테스트 버전으로 재실행)**: Phase 1~3을 작업본에 적용한 상태에서 `npm run check` exit 0(아키텍처 테스트 19/19),
  `npm test` 123/123, F01·F03 수용 절차와 부재 검사가 위 Verification Plan의 기대와 일치했다. Windows에서 `npm run` 경유(cmd.exe)로 돌린 결과라
  `test:architecture`의 glob과 CLI 가드가 그 경로에서도 동작함을 포함한다. 같은 적용 트리에서 `npm run build`도 exit 0(67초).

확인한 항목:

- [x] 테스트와 스크립트 참조(`git grep`, `package.json`, `check.yml`)
- [x] 정적 `import`(삭제 스크립트를 import하는 파일 없음 — 둘 다 export가 없는 실행 스크립트)
- [x] 런타임 side effect 또는 초기화 코드(`dotenv/config` 로드 순서, `rmSync` 대상 범위)
- [x] 타입 선언 영향(tsconfig `include: **/*.ts`가 `scripts/lib/prisma.ts`를 포함)
- [ ] 앱 진입점과 라우팅 경계 — 해당 없음
- [ ] dynamic `import()`·barrel export — 해당 없음
- [ ] 정적 자산·`public` — 해당 없음
- [ ] API, storage, analytics, 외부 SDK — 해당 없음

## Approval

승인 메모:

- 범위 (a) F01~F06 전체로 대화 승인을 받아 구현했다. 승인 기록은 front matter를 단일 기준으로 쓴다.
- F04 문서는 **항상 마지막 Phase**에서 앞선 Phase가 실제로 만든 상태만 적는다 — (b)면 Phase 2를 건너뛰고 `verification.md` 표의 `lib/prisma.ts` 행을 뺀다.
  "문서만 먼저" 선택지는 두지 않는다: F04의 After가 `plugin-lib.mjs`·`lib/prisma.ts`·`npm run check`의 새 첫 단계를 이름으로 가리키므로,
  코드보다 앞서면 source of truth가 없는 파일을 설명하게 된다.

## Execution Plan

각 Phase 끝에서 `npm run check`가 exit 0이어야 한다.

### Phase 1 — F01·F02·F05: 복사본 검사·동기화 통합

1. `scripts/plugin-lib.mjs`, `scripts/plugin-lib.test.mjs` 추가.
2. `node --test "scripts/*.test.mjs"` → 19 통과 확인.
3. `package.json` 세 줄 교체.
4. `git rm scripts/check-plugin-lib.mjs scripts/sync-plugin-lib.mjs`.
5. 검증: `npm run check` exit 0, 첫 검사 출력(npm 배너 다음)이 `plugin/lib in sync`. F01 재현(Verification Plan) 수행.

### Phase 2 — F03: Prisma 부트스트랩 추출

1. `scripts/lib/prisma.ts` 추가.
2. `grant-plan.ts`, `seed-templates.ts` 교체.
3. 검증: `tsc --noEmit`(`npm run check` 안) exit 0. `.env`를 잠시 `.env.bak`로 옮기고(셸 환경변수에도 `DATABASE_URL`이 없어야 한다 — 이 머신은
   프로세스·사용자·시스템 범위 모두 없음, 2026-09-06 확인) `npm run plan:grant -- x pro` → `DATABASE_URL is not set` + exit 2, DB 접속 없음. 원복.
   `npm run plan:grant`(인자 없음) → usage + exit 2. DB가 있는 환경이면 `npm run seed:templates`를 한 번 돌려 `seed:` N줄 + `done:` 확인(로컬 전용).

### Phase 3 — F06: `.gitkeep`

1. `git rm packages/core/.gitkeep plugin/lib/.gitkeep`.
2. 검증: `npm run check` exit 0(`--check`는 `.mjs`만 본다), `git status`에 다른 변경 없음.

### Phase 4 — F04: 문서

1. `docs/architecture/README.md` 트리 한 줄·문서 지도 한 줄·개발 시작 명령 블록, `docs/architecture/verification.md` 명령 한 줄·항목·절, 루트 `README.md` 한 줄.
2. 검증: 문서에 적힌 명령을 모두 한 번씩 실행해 출력 문구가 표와 일치하는지 확인(DB 명령은 사용법 출력까지만).

## Verification Plan

실행할 검증:

```bash
npm run check                          # plugin-lib --check → lint → typegen → tsc → test:architecture
npm run test:architecture              # 13 + 6 = 19
npm test                               # core/plugin 테스트 — plugin/lib 복사본이 import되므로 동기화 상태 회귀
npm run build                          # CI가 돌린다. scripts는 번들 대상이 아니라 변할 이유가 없다

# F01 재현·수용
echo "export const stale = 1;" > plugin/lib/zz-orphan.mjs
node scripts/plugin-lib.mjs --check    # 기대: "orphan: plugin/lib/zz-orphan.mjs", "run: npm run sync:plugin-lib", exit 1
npm run sync:plugin-lib                # 기대: "plugin/lib synced (0 copied, 1 removed)"
node scripts/plugin-lib.mjs --check    # 기대: "plugin/lib in sync", exit 0
git status --short plugin/lib          # 기대: 이 절차로 생긴 변경 없음 — Phase 3 커밋 전이면 " D plugin/lib/.gitkeep" 한 줄만 보인다

# F03 수용 (.env 없이 — 셸 환경변수에도 DATABASE_URL이 없는 상태에서)
npm run plan:grant -- x pro            # 기대: "DATABASE_URL is not set — …", exit 2

# 삭제 대상의 부재 (Phase 1·3 뒤)
git grep -n -e check-plugin-lib -e sync-plugin-lib -- package.json scripts   # 기대: 출력 없음
git ls-files packages/core/.gitkeep plugin/lib/.gitkeep                       # 기대: 출력 없음
```

위 블록은 bash 기준이지만 PowerShell 5.1에서도 그대로 동작한다 — `echo … >`의 인코딩 차이는 고아 판정에 무관하고(파일 존재와 확장자만 본다),
`--`는 npm에 그대로 전달되며, `git grep -e … -e …`는 셸 무관이다.

`npm run build`를 로컬에서 생략해도 되는 근거: `next.config.ts`는 비어 있어 `scripts/`를 끌어들이는 설정이 없고, Next 16은 빌드에서 ESLint를 돌리지
않으며, 빌드의 타입 검사는 같은 `tsconfig.json`이라 `tsc --noEmit`이 이미 같은 범위를 덮는다. 드라이런에서 적용 트리의 `npm run build`도 exit 0이었다
(2026-09-06, 67초, dev 서버 미실행 상태 — `next build`는 실행 중인 dev 서버를 죽이므로 로컬에서 돌릴 때는 먼저 확인한다).

검증 기준:

- `npm run check` exit 0. 기존 lint 경고 1건(`2026-09-05-plugin-clean-code-findings.md` verification-summary에 기록; 2026-09-06 현재도 정확히 1건 —
  `'planForUser' is defined but never used`)은 기존 실패로 분류. 경고가 2건 이상이면 신규다.
- `test:architecture` 19/19. 13 미만이면 기존 회귀, 13~18이면 신규 테스트 실패.
- F01 재현 절차의 exit code와 문구가 위 기대와 일치.
- `git status`에 이 절차가 만든 `plugin/lib` 변경이 남지 않는다(동기화가 정상 트리를 건드리지 않음). Phase 3의 `.gitkeep` 삭제가 커밋 전이면 그 한 줄은 예외다.
- 삭제 대상 부재 명령 둘 다 출력이 없다(옛 스크립트 이름이 `package.json`·`scripts/`에 남지 않고, `.gitkeep` 둘이 추적에서 빠졌다).

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | exit 0 | 첫 검사 출력 `plugin/lib in sync`. 기존 lint 경고 1건(`planForUser`) 유지 — 신규 없음 |
| `npm run test:architecture` | 19/19 | 기존 13 + 신규 6 |
| `npm test` | 123/123 | core·plugin, 변동 없음 |
| `npm run test:web` | 157/157 | 변동 없음 |
| `npm run build` | exit 0 | 라우트 수집 정상 |
| F01 재현 절차 | 기대와 일치 | `orphan: plugin/lib/zz-orphan.mjs` + exit 1 → `plugin/lib synced (0 copied, 1 removed)` → exit 0 |
| F03 `.env` 없이 `plan:grant` | exit 2 | `DATABASE_URL is not set — …`, DB 접속 없음. 인자 오류도 exit 2 |
| 삭제 대상 부재(`git grep`·`git ls-files`) | 둘 다 출력 없음 | 옛 이름·`.gitkeep` 잔존 없음 |
| 잘못된 루트 가드 | throw | 임시 디렉터리에서 `packages/core not found … — run from the repository root`, 복사본 무손실 |

## Risks and Rollback

잔여 리스크:

- 동기화가 `plugin/lib/*.mjs`를 삭제할 수 있게 된다. 원본 없는 복사본이 의도된 경우는 현재 없지만, 그런 파일을 두려는 날이 오면 이 규칙을 다시 열어야 한다.
- `check`의 첫 단계가 바뀌어 드리프트 실패가 lint 실패보다 먼저 보인다. 로그를 읽는 습관이 바뀌는 정도다.
- F03은 소비자 둘의 추출이다. 세 번째 DB 스크립트가 생기지 않으면 헬퍼 파일 하나만큼의 간접 비용이 남는다.
- `DATABASE_URL`이 없을 때의 **기존** 실패 문구는 재현하지 않았다(로컬 DB에 닿을 수 있어). 이 문서는 "늦게 실패한다"까지만 주장한다.

롤백 방법:

- 전부 한 PR이므로 `git revert <merge>`로 복구된다. Phase 단위로 커밋하면 F03만 되돌리는 것도 revert 하나다.
- 삭제된 `check-plugin-lib.mjs`·`sync-plugin-lib.mjs`·`.gitkeep`은 이 문서 Before 블록과 `git`에 있다.

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성한다.

완료 기록:

- completed-at: 2026-09-06
- verification-summary: front matter와 위 Verification Results 표 참조.
- implementation PR/commit: 브랜치 `harness/scripts-tooling-cleanup` → PR base `dev`.
- changed files summary: 신설 3(`scripts/plugin-lib.mjs`, `scripts/plugin-lib.test.mjs`, `scripts/lib/prisma.ts`) · 수정 2(`scripts/grant-plan.ts`, `scripts/seed-templates.ts`) ·
  삭제 4(`scripts/check-plugin-lib.mjs`, `scripts/sync-plugin-lib.mjs`, `packages/core/.gitkeep`, `plugin/lib/.gitkeep`) · `package.json` 3줄 ·
  문서 3(`docs/architecture/README.md`, `docs/architecture/verification.md`, `README.md`).
- remaining follow-up: 아래 Open Questions의 `seed-templates` 프루닝 1건. 이번 범위 밖이며 별도 제안이 필요하다.

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다(`active/` · `pending`).
- [x] `stage`는 pending 문서에서만 사용했다(`awaiting-approval`).
- [ ] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다. — 승인 전
- [x] `proposal-size`는 standard이고 삭제·5파일 초과 조건에 부합한다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용했다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 import·스크립트 참조·타입·런타임 side effect를 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 기존 실패(lint 경고 1건)와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다.
- [ ] 완료 문서 항목 — 해당 없음(pending)

---

<!-- doc-validation-skip -->
## Open Questions

- **[Scope · seed-templates 프루닝]** `seed-templates.ts`는 upsert만 하므로 private 저장소에서 지운 템플릿의 `Template` 행이 DB에 남는다
  (Phase 4에서 `.git` 디렉터리가 잘못 시드된 18행을 손으로 지운 이력 — `2026-09-04-…phase-4-entitlement.md:279`). F01과 같은 "고아" 부류지만
  **데이터 삭제**라 이 문서의 비목표로 두었다. `--prune` 플래그(기본 off, 지울 행을 먼저 나열)를 별도 small 제안으로 올릴지 결정이 필요하다.
<!-- doc-validation-restore -->
