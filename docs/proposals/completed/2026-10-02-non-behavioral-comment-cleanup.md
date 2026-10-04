---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-02"
approved-by: "사용자(채팅 실행 지시)"
approved-at: "2026-10-02"
approval-scope: "Option B 전체: 부록 A의 삭제 196건·정정 22건 및 미러 동기화·생성물 검증"
completed-at: "2026-10-02"
verification-summary: "218행·102개 파일 적용, JS/TS 99개 파일의 코드·타입 보존, 스키마 diff 빈 마이그레이션, Prisma 생성물 26개 경로 검증, check·test·test:web·test:server·verify:fsd·test:architecture·build 통과"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-09-07-dead-code-removal-candidates.md"
  - "docs/proposals/completed/2026-09-10-configurable-pipeline.md"
  - "docs/proposals/completed/2026-09-22-user-scoped-project-identity.md"
  - "docs/conventions/product-copy.md"
  - "docs/architecture/verification.md"
---

# 동작과 무관한 주석 정리

## Summary

- **지금**: 저장소의 JS/TS 주석 1,831개(이 중 127개는 `plugin/lib` 미러)는 대부분 "코드가 왜 이렇게 동작하는가"를
  설명한다. 그 사이에 날짜·사건 기록, 이미 닫힌 제안서의 절 번호(`§E.7`, `A-10`), ApcH 이식 출처, "예전에는 …" 같은
  변경 시점 서술, 파일 이름을 되풀이하는 머리표가 섞여 있다. 파일이 나뉜 뒤 가리키는 곳이 사라진 참조도 있다.
- **제안**: 동작과 무관한 196건을 지우고(주석 통째 13건, 줄·조각 183건), 가리키는 곳이 틀린 참조 22건을 고친다.
  원본 96개 파일과 `plugin/lib` 미러 6개에서 주석만 바뀐다. 전체 목록은 [부록 A](#부록-a-후보-목록)다.
- **지키는 것**: 지우면 동작·형 검사·시험이 바뀌는 주석(`.mjs`의 JSDoc 형 주석 9개, 마이그레이션 SQL 주석 67줄 등)과
  "왜"를 설명하는 주석은 손대지 않는다. "주석만 바뀌었다"는 형을 유지한 소스 출력·transpile 결과·JS JSDoc 전체를 기준 커밋과 비교해, "목록대로
  지웠다"는 부록 A의 문자열 개수를 기준 커밋과 비교해 증명한다([부록 B](#부록-b-검증-스크립트)).

## Goal

목표:

- 주석이 지금의 동작과 그 이유만 말하게 한다. 과거 사건·작업 관리 식별자·출처·변경 전후 비교는 git 이력과
  `docs/proposals/completed/`에 이미 있으므로 코드에서 뺀다.
- 가리키는 곳이 사라진 참조(줄 번호·파일 이름·주석 위치)를 고친다.
- 작업 유형: 주석 삭제와 정정. 코드 변경은 없다.

비목표:

- "왜"를 설명하는 주석을 다시 쓰거나 줄이거나 번역하지 않는다. 주석은 한국어로 둔다(`docs/conventions/product-copy.md:8-9`).
- `docs/` Markdown의 HTML 주석은 다루지 않는다 — `<!-- copy-lock -->`은 시험이 읽는 기능 표식이다
  (`docs/conventions/product-copy.md:11`).
- `plugin/templates/`(gitignore된 별도 private 저장소, 에이전트가 읽는 본문)는 다루지 않는다.
- 이름 변경, 파일 이동, 동작 변경, 주석 규칙의 lint 강제는 하지 않는다. 조각 삭제는 주석 구분자(`//`, `/* */`, JSX의 `{/* */}`)를 보존한다.

성공 기준:

- 부록 A의 196건이 지워지고 22건이 정해진 문구로 고쳐졌으며, 그 밖의 파일은 바뀌지 않았다(부록 B-2 검사 exit 0).
- 바뀐 JS/TS 파일 전부에서 주석만 바뀌었다(부록 B-1 검사가 `comments only`로 끝난다, exit 0).
- `prisma/schema.prisma` 변경이 데이터 모델을 바꾸지 않았다(`prisma migrate diff`가 빈 마이그레이션).
- CI와 같은 게이트(`.github/workflows/check.yml:26-33`의 `npm run check`·`npm test`·`npm run test:web`·`npm run build`)와
  `npm run test:server`가 통과한다.
- 생성 클라이언트의 `inlineSchema` 전체가 기준 본문에 스키마 정정 3건만 반영한 문자열과 같고, `runtimeDataModel`은 구조적으로 같다.
  생성 경로 26개(모델 18개), `class.ts`의 나머지 본문과 다른 25개 파일도 기준 사본과 같다(부록 B-3 exit 0).
- 부록 C의 "손대지 않을 주석"이 diff에 없다. 부록 A의 조각·비고·이동 이외의 주석을 바꾸지 않았는지도 전체 diff로 확인한다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 삭제 작업이고 5개 이상(96개) 파일을 바꾼다. 롤백은 단순 revert이고, 라우팅·인증·API 계약·데이터 구조·
  마이그레이션·플러그인 배포 계약에는 영향이 없다. Prisma 생성물과 미러의 내용은 바뀌므로 그 최종 본문도 검증한다.

## Current State

이번 구현 범위는 부록 A의 218행(원본 96개 파일)과 그 원본에서 동기화하는 미러 6개로 고정한다.
아래 측정은 `03876dd24fab12c63542b4565f087b79a877f7ef`의 조사 기록이며, 저장소 전체에서 모든 불필요한 주석을 없앤다는 완료 조건은 아니다.
`related`의 완료 제안서는 배경 자료다. 현행 규칙은 `AGENTS.md`·`docs/architecture/README.md`·`fsd.md`·`verification.md`·`docs/conventions/product-copy.md`를 따른다.

### 측정

TypeScript 파서로 추적 파일의 주석을 전부 뽑았다(문자열·정규식·JSX 텍스트 안의 `//`는 주석으로 세지 않는다).

| 대상 | 수 |
| --- | --- |
| 추적 JS/TS 파일 / 그중 주석이 있는 파일 | 387 / 260 |
| JS/TS 주석 | 1,831 (`plugin/lib` 미러 127 포함) |
| 연속한 `//` 줄을 한 덩어리로 본 주석 덩어리(미러 제외) | 981 (시험·픽스처 281) |
| 주석 처리된 코드 · `TODO`/`FIXME`/`XXX`/`HACK` · `eslint-disable`/`@ts-*` 지시어 | 0 · 0 · 0 |
| `prisma/schema.prisma`의 `//` 주석 / `///` 문서 주석 | 63 / 0 |
| `prisma/migrations/*/migration.sql`의 `--` 주석 | 67줄(19개 중 14개 파일) |
| 그 밖: `src/app/globals.css` · `.github/workflows/check.yml` · `.gitignore` · `migration_lock.toml` | 18 · 11줄 · 16 · 2 |

주석 처리된 코드와 억제 주석이 0인 것은 2026-09-07 dead-code 제안서의 결과와 같다
(`docs/proposals/completed/2026-09-07-dead-code-removal-candidates.md:244`).

### 주석이 하는 일

대부분은 코드만 읽어서는 알 수 없는 "왜"다. 계약 문서와 코드를 잇고(`product-copy.md §N`, `불변식 N`, `protocol.md`),
두 벌로 둔 규칙을 함께 고치라고 알리고(`src/server/project-slug-rule.ts:1-10`), 프레임워크 동작의 근거 문서를
가리킨다(`src/app/(app)/p/[slug]/error.tsx:7-17`). 이런 주석은 지워도 실행 결과는 같지만 이유가 사라지므로
"동작과 관련 있는" 주석으로 보고 이번 범위에서 뺀다.

### 동작과 무관한 것 — 196건

| 범주 | 무엇인가 | 예 | 건수 |
| --- | --- | --- | --- |
| A. 주석 통째 | 정보가 없는 주석 — 파일 이름만 적은 머리 주석, create-next-app 보일러플레이트, 함수 이름을 되풀이하는 JSDoc, 참조만 남은 끝 주석 | `// index.ts`, `/* config options here */`, `Creates a success result`, `// §E.3` | 13 |
| B1. 날짜·사건·검증 기록 | 그 규칙이 생긴 날의 사건, 렌더 확인 로그, `(실측)` 표식 | `(2026-09-22 mathgic: …)`, `(F7 실측)` | 36 |
| B2. 작업 ID·제안서 참조 | 닫힌 제안서의 절·항목 번호와 "제안서에 그렇게 적었다" 같은 언급. 문서 이름이 없어 코드만 보고는 찾을 수 없다(`C11`은 완료 제안서 5개에 나온다) | `(§E.7)`, `(A-10)`, `(B-1 선택지 3)`, `T4.6`, `D3` | 83 |
| B3. ApcH 이식 출처 | v1 저장소에서 옮겨 온 출처와 커밋 | `(ApcH FEAT-20)`, `(de25a1c)` | 8 |
| B4. 변경 시점 서술 | 그 커밋의 diff를 기준으로 쓴 문장. 지금 코드에는 비교 대상이 없다 | `예전에는 …`, `기존 동작이 그대로다`, `오늘과 같은 쿼리다`, `지금까지처럼` | 40 |
| B5. 파일 이름 머리표 | 첫 줄 주석 앞의 `파일명 — ` | `deps.ts — ToolDeps의 …` | 15 |
| B6. 같은 문장 반복 | 한 주석 안에서 같은 말을 두 번 | `런북 단계 번호는 없다. 런북에 번호가 없다.` | 1 |

B1·B4는 문장 전체가 아니라 사건 부분만 지운다. 예를 들어 "노드만 보면 '작업 중'이 된다(실측: on_hold인 FEAT-07에 …)"는
괄호만 지우고 앞 문장(이유)은 남긴다.

### 낡은 참조 — 22건

| 종류 | 건수 | 내용 |
| --- | --- | --- |
| 분리 뒤 남은 파일 이름 | 9 | `board.ts`는 `board-query.ts`를 다시 내보내는 8줄 파일, `run.ts`는 3줄 파일이 됐는데 주석은 여전히 그 파일이 로직을 가진다고 말한다(`board.ts resetRun`, `board.ts(closeRuns)` 등) |
| 틀린 줄 번호 | 7 | `board.ts:52`·`:71`·`:368`(파일이 8줄), `owner-deps.ts:19`(빈 줄, 2곳), `create-project.server.ts:26-27`(한 줄 밀림), `deliver.test.mjs`의 `:46`(단언은 `:47`) |
| 가리킬 곳이 없는 말 | 2 | `packages/core/manifest.mjs:4`의 "(위 주석)"(위에 주석이 없다), `src/server/pipeline/board-rules.ts:97`의 "런북 7단계"(런북에 번호 붙은 7단계가 없다) |
| 틀린 파일 이름 · 잘못된 위치 | 각 1 | `src/server/pipeline/run-query.ts:1`이 자기를 `run.ts`라고 부른다. `src/server/pipeline/board-query.ts:143-145`·`:148`의 네 줄은 `latestBoardWithEvents`(:158)의 설명인데 `walkingKeys`(:149) 위에 붙어 있다 |
| 옛 상태 이름 | 1 | `prisma/schema.prisma:160`의 "검토대기에서만" — 상태 식별자는 `in_review`다(`packages/core/transitions.mjs`의 `STATUSES`) |
| 이 계획이 밀어낼 줄 번호 | 1 | `src/server/rest-scope.ts:58`의 "(위 :46)" — 지금은 맞지만 이 계획이 같은 파일 위쪽 줄(5–6·10·29행 등)을 지워 밀린다 |

이 22건은 지우지 않고 고친다. 주석이 말하는 이유는 맞고 주소나 이름만 틀렸기 때문이다. **고친 문구에는 줄 번호를 새로 쓰지 않는다**:
줄 번호는 이 계획의 다른 행(주석 이동·줄 삭제)만으로도 곧 밀리므로, 부록 A C표의 "바꿀 문구"(파일·함수 이름)를 그대로 쓴다.
두 행(`create-project.server.ts`의 branch 판단, `deliver.test.mjs`의 런북 단언)도 위치를 설명하는 이름으로 바꾼다.

### 품질 기준 분석

`typescript-clean-code` 기준 분석
- 적용 여부: applied (CMT 절)
- 발견된 문제: 변경 이력 주석(B1·B4)과 작업 관리 참조(B2·B3)가 "Why" 주석에 섞여 있다. 기준은 "주석은 Why에 사용한다.
  주석 처리된 코드와 변경 이력 주석은 제거한다"이다.
- 심각도: Low — 동작에는 영향이 없고 읽는 비용과 낡은 참조로 인한 오도만 있다.
- 위치: 부록 A
- 근거: 위 측정과 부록 A의 줄별 인용

`frontend-readability` 기준 분석
- 적용 여부: skipped — 주석에 관한 규칙이 없어 이 작업에 쓸 기준을 주지 않는다.

## Scope

포함 범위:

- `packages/core`(원본만 고치고 `plugin/lib`은 동기화로 따라간다), `plugin/bin`, `src/app`, `src/fsd`, `src/server`의
  주석, 그리고 시험·픽스처 파일(`*.test.*`, `*.fixture.mjs`, `tests/`, `scripts/retired-copy.test.mjs`)의 주석.
- `prisma/schema.prisma`의 `//` 주석 3곳, `src/app/globals.css` 1곳, `.gitignore` 1곳, `next.config.ts` 1곳.

제외 범위:

- 부록 C의 "손대지 않을 주석" 전부.
- "왜"를 설명하는 주석의 재서술. 부록 A의 "비고"에 적은 최소한의 문장 맺음(조각을 뺀 뒤 끊긴 문장 잇기)만 한다.
- 아래 [판정 기준](#판정-기준)의 "남기는 것"에 해당하는 주석.
- `docs/` Markdown, `plugin/templates/`, `plugin/skills/` 본문.
- 판단을 미룬 회색 지대(Open Questions 5번).

## Proposal

### 판정 기준

주석 하나를 두 질문으로 가른다.

1. **지우면 실행·빌드·형 검사·시험 결과가 바뀌는가?** 바뀌면 기능 주석이다 — 손대지 않는다(부록 C).
2. **지우면 "지금 코드가 왜 이렇게 동작하는가"에 대한 정보가 사라지는가?** 사라지면 동작 설명이다 — 남긴다.
   둘 다 아니면 동작과 무관하다 — 지운다.

| 분류 | 지우면 | 수 | 조치 |
| --- | --- | --- | --- |
| 기능 주석 | 형 검사·시험·마이그레이션 판정이 바뀐다 | JSDoc 형 주석 9, 마이그레이션 SQL 67줄, 그 외 부록 C | 유지 |
| 동작 설명 | 실행은 같고 이유가 사라진다 | 대다수 | 유지 |
| 동작과 무관 | 실행도 이유도 같다 | 196 | 삭제 |
| 낡은 참조 | 이유는 맞지만 주소나 이름이 틀렸다 | 22 | 정정 |

이력처럼 보여도 지금 코드의 동작을 설명하면 남긴다. 이번 목록에서 남긴 것의 기준은 다음과 같다.

- **호환 대상을 가리키는 말**: "옛 템플릿 호환용"(`packages/core/vars.mjs:50`), "옛 스킬이 그대로 넘길 수 있고"
  (`plugin/bin/harness-init.mjs:67`), "구버전 서버"(`:108`), "Phase 4 이전에 init한 프로젝트"
  (`src/server/pipeline/board-rules.ts:128`), "옛 `CLAUDE.runbook.free.md` 행"(`src/server/templates-query.ts:4`).
  그 코드가 지금도 그 대상을 처리한다.
- **시험이 지키는 보존 약속**: "기존 오류 문장과 종료코드를 보존한다"(`plugin/bin/harness-init.mjs:48`),
  "위 hs_ 단언은 그대로 통과해야 한다"(`src/server/mcp/auth.test.mjs:26`). 반면 "한 줄도 바뀌지 않는다"처럼 그 커밋의
  diff를 말하는 문장은 B4다.
- **도메인 낱말**: "커밋"(git 커밋), "계획서"(plan 문서), "기존 행"(DB에 이미 있는 행), "옛 상태"(전이 직전 상태)는 이력이 아니다.
- **반사실 근거**: "파싱 결과로 입력란을 바꾸면 … 입력란이 사라졌다"(`src/fsd/features/create-project/ui/new-project-form.tsx:25-27`)는
  과거형이지만 지금 설계의 이유다. "예전에는"으로 옛 구현을 말하는 문장만 B4다.
- **경로까지 적힌 참조**: `src/server/runbook.ts:33`, `tests/server/runbook-stale.test.ts:7`의
  `docs/proposals/completed/2026-09-24-init-any-branch.md C-3`은 찾을 수 있으므로 B2가 아니다.

### 대안

#### Option A: 기능 주석만 남기고 전부 지운다

- 장점: 판정이 기계적이다. 주석 유지 비용이 사라진다.
- 단점: 1,700개 가까운 "왜"가 사라진다. 이 저장소의 주석은 두 벌로 둔 규칙의 동기화 지점(`project-slug-rule.ts:1-10`),
  계약 문서의 절 번호, 경쟁 조건의 근거를 들고 있어 지우면 다음 변경에서 회귀할 위험이 커진다. 사용자가 말한
  "동작과 무관한 주석"이라는 범위도 넘는다.

#### Option B: 동작과 무관한 조각만 지우고, 낡은 참조를 고친다

- 장점: 이유는 그대로 두고 읽는 비용과 오도만 줄인다. 모든 변경을 줄 단위로 나열해 검토할 수 있다.
- 단점: 196건을 손으로 지워야 한다. 조각을 뺀 뒤 문장을 잇는 판단이 일부 필요하다(부록 A에서 "비고"가 붙은 35건).

#### Option C: B에 더해 지우는 이력을 문서로 옮긴다

- 장점: 사건 기록이 한곳에 모인다.
- 단점: 같은 기록이 이미 `docs/proposals/completed/`·`docs/test-reports/`와 git 이력에 있다. 옮기면 세 번째 사본이 된다.

#### 선택: Option B

- 근거: 사용자가 정한 범위("동작과 무관한 주석")와 정확히 맞고, 모든 삭제가 줄 단위로 검토·검증 가능하다.
  B2의 절 번호는 지워도 `git log -S'§E.7'`이나 `git blame`으로 그 줄을 만든 커밋과 제안서를 다시 찾을 수 있다.

### 변경 예시

#### `src/server/agents/next.ts` — B2·B4

불변식: `Scope` 형 선언은 한 글자도 바뀌지 않는다.

Before:

```ts
// userScoped: 주체가 hu_라 프로젝트가 토큰이 아니라 인자에서 왔다는 뜻. 한도 집계의 분모를
// 좁히는 데만 쓴다(A-10) — hs_는 토큰이 곧 프로젝트라 생략하고, 생략하면 오늘과 같은 집계다.
export type Scope = { projectId: string; tokenId: string; userScoped?: boolean };
```

After:

```ts
// userScoped: 주체가 hu_라 프로젝트가 토큰이 아니라 인자에서 왔다는 뜻. 한도 집계의 분모를
// 좁히는 데만 쓴다 — hs_는 토큰이 곧 프로젝트라 생략한다.
export type Scope = { projectId: string; tokenId: string; userScoped?: boolean };
```

#### `src/fsd/entities/board-item/ui/not-verified-chip.tsx` — B4

불변식: 컴포넌트 본문과 렌더 결과가 같다.

Before:

```tsx
import { Chip } from "@/fsd/shared/ui/chip";

// 검증 기록이 없다는 사실. 결재함 카드와 항목 페이지가 같은 칩을 쓴다 — 예전에는 두 화면이 각자
// risk 칩을 그렸다. 검증은 사용자가 파이프라인으로 고르는 것이라 부재는 위험이 아니다(design.md 규칙 2).
// 문구는 product-copy.md §6·§7·§11.
export function NotVerifiedChip({ verifyIsNext = false }: { verifyIsNext?: boolean }) {
  return (
    <Chip tone="done" title={verifyIsNext ? "The Verify step comes next." : "No independent validation is on record."}>
      Not verified
    </Chip>
  );
}
```

After:

```tsx
import { Chip } from "@/fsd/shared/ui/chip";

// 검증 기록이 없다는 사실. 결재함 카드와 항목 페이지가 같은 칩을 쓴다.
// 검증은 사용자가 파이프라인으로 고르는 것이라 부재는 위험이 아니다(design.md 규칙 2).
// 문구는 product-copy.md §6·§7·§11.
export function NotVerifiedChip({ verifyIsNext = false }: { verifyIsNext?: boolean }) {
  return (
    <Chip tone="done" title={verifyIsNext ? "The Verify step comes next." : "No independent validation is on record."}>
      Not verified
    </Chip>
  );
}
```

#### `src/server/pipeline/board-query.ts` — C(위치 정정)·B1·B2

불변식: 두 함수의 본문과 순서가 같다. 143–145행과 148행의 설명 네 줄이 `latestBoardWithEvents` 바로 위로 옮겨 간다.
148행은 `latestBoard`의 JSON 계약을 유지하면서 이벤트를 따로 읽는 이유이므로 `walkingKeys` 위에 남기지 않는다. B2의 절 번호 삭제도 함께 반영한다.

Before:

```ts
// 결재함용: 최신 행 + 최근 전이 몇 개. 상태 줄("dev submitted a plan 3 days ago")과 보류 전 상태("was Implementing")를
// 이벤트에서 읽는다 — BoardItem에는 "언제 이 status가 됐나"가 없다. note 있는 이벤트(validation·plan·report·discard)는
// 전이가 아니므로 제외한다 — 증거 제출이 쌓여도 진짜 전이가 take 창 밖으로 밀리지 않는다.
// 파이프라인이 아직 걷고 있는 항목의 key. 미결(isOpen)과 다르다 — 인수까지 끝난 done 항목도 꼬리 노드
// (doc-audit·scout)를 남겨 두고 런이 열려 있다. 개요(pipeline_next({}))가 미결만 훑으면 그 꼬리는 영영 디스패치되지 않는다(실측).
// latestBoard는 board_list의 JSON이기도 해서 include를 더하지 않고 따로 읽는다(§E.3과 같은 이유).
async function walkingKeys(projectId: string): Promise<string[]> {
  const runs = await prisma.pipelineRun.findMany({
    where: { closedAt: null, boardItem: { projectId, discardedAt: null } },
    select: { boardItem: { select: { status: true, backlogItem: { select: { key: true } } } } },
  });
  // on_hold는 커서가 잠든다 — 깨우지 않는다(배너와 같은 규칙).
  return runs.filter((r) => r.boardItem.status !== "on_hold").map((r) => r.boardItem.backlogItem.key);
}

async function latestBoardWithEvents(projectId: string) {
  return prisma.boardItem.findMany({
    where: { projectId, discardedAt: null },
    orderBy: { proposedOn: "desc" },
    distinct: ["backlogItemId"],
    include: {
      backlogItem: { select: { key: true, title: true, area: true, type: true } },
      events: { where: { note: null }, orderBy: { at: "desc" }, take: 8, select: { from: true, to: true, at: true, actor: true } },
      run: { select: { id: true, entryId: true, node: true, closedAt: true, version: { select: { format: true } } } },
    },
  });
}
```

After:

```ts
// 파이프라인이 아직 걷고 있는 항목의 key. 미결(isOpen)과 다르다 — 인수까지 끝난 done 항목도 꼬리 노드
// (doc-audit·scout)를 남겨 두고 런이 열려 있다. 개요(pipeline_next({}))가 미결만 훑으면 그 꼬리는 영영 디스패치되지 않는다.
async function walkingKeys(projectId: string): Promise<string[]> {
  const runs = await prisma.pipelineRun.findMany({
    where: { closedAt: null, boardItem: { projectId, discardedAt: null } },
    select: { boardItem: { select: { status: true, backlogItem: { select: { key: true } } } } },
  });
  // on_hold는 커서가 잠든다 — 깨우지 않는다(배너와 같은 규칙).
  return runs.filter((r) => r.boardItem.status !== "on_hold").map((r) => r.boardItem.backlogItem.key);
}

// 결재함용: 최신 행 + 최근 전이 몇 개. 상태 줄("dev submitted a plan 3 days ago")과 보류 전 상태("was Implementing")를
// 이벤트에서 읽는다 — BoardItem에는 "언제 이 status가 됐나"가 없다. note 있는 이벤트(validation·plan·report·discard)는
// 전이가 아니므로 제외한다 — 증거 제출이 쌓여도 진짜 전이가 take 창 밖으로 밀리지 않는다.
// latestBoard는 board_list의 JSON이기도 해서 include를 더하지 않고 따로 읽는다.
async function latestBoardWithEvents(projectId: string) {
  return prisma.boardItem.findMany({
    where: { projectId, discardedAt: null },
    orderBy: { proposedOn: "desc" },
    distinct: ["backlogItemId"],
    include: {
      backlogItem: { select: { key: true, title: true, area: true, type: true } },
      events: { where: { note: null }, orderBy: { at: "desc" }, take: 8, select: { from: true, to: true, at: true, actor: true } },
      run: { select: { id: true, entryId: true, node: true, closedAt: true, version: { select: { format: true } } } },
    },
  });
}
```

위 세 예시가 부록 A의 6행(`next.ts:34`의 B2·B4, `not-verified-chip.tsx:3`, `board-query.ts:143`·`:147`·`:148`)을
보여 준다. 나머지 212행은 부록 A의 "지울 것" 문자열과 "비고"대로 한다. "지울 것"은 그 줄에 그대로 있는 문자열이라,
다른 커밋이 먼저 들어와 줄 번호가 밀려도 문자열로 찾을 수 있다.

## Affected Files

| 경로 또는 영역 | 작업 | 건수(파일) | 판단 근거 | 리스크 |
| --- | --- | --- | --- | --- |
| `src/server` | update | 75 (23) | B2 28 · B4 16 · C 12 등 | low — 주석만 바뀐다. 부록 B 검사 |
| `src/fsd` | update | 48 (28) | B2 15 · B1 11 · B4 9 등 | low — JSX 주석 안의 조각(`backlog-form.tsx:59`)은 조각만 지우고 `{/* */}`는 남긴다 |
| 시험·픽스처(`*.test.*`, `*.fixture.mjs`, `tests/`) | update | 61 (25) | B2 32 · B1 15 · B4 11 등 | low — 시험 이름·단언은 건드리지 않는다 |
| `src/app` | update | 11 (10) | B5 6 · A 2 · B1 2 · B2 1 | low |
| `packages/core` | update + sync | 10 (6) | C 3 · B 7 | low — 고친 뒤 `npm run sync:plugin-lib`. `plugin/lib`을 직접 고치지 않는다 |
| `plugin/lib` | sync only | — | `packages/core/vars.mjs`·`deliver.mjs`·`transitions.mjs`·`repo-url.mjs`·`pipeline.mjs`·`manifest.mjs`의 복사본 | low — `npm run check` 첫 단계가 드리프트를 잡는다 |
| `plugin/bin/harness-init.mjs` | update | 8 (1) | B2 5 · B4 2 · B1 1 | low — 동작이 같으므로 `plugin.json` 판을 올리지 않는다 |
| `prisma/schema.prisma` | update | 3 (1) | C 2 · B3 1 | low — 데이터 모델은 같다(`prisma migrate diff`가 빈 마이그레이션). 다만 `//` 주석도 생성 클라이언트의 `inlineSchema` 문자열(`src/generated/prisma/internal/class.ts`, gitignore)에 원문째 들어가므로 `npm run db:generate` 뒤 그 생성물의 텍스트는 바뀐다 |
| `next.config.ts`, `.gitignore` | update | 2 (2) | A 1 · B4 1 | none |

## Safety Analysis

주석만 바뀐다는 것은 의도이고, 그것이 사실인지는 부록 B 검사가 파일마다 증명한다. 오탐이 생길 수 있는 경계는
아래처럼 확인했다.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — `src/app/api`의 `route.ts` 7개는 첫 줄 주석만, `page.tsx` 2개(`login/page.tsx:1`,
  `(app)/p/[slug]/page.tsx:19`)는 주석 한 곳씩만 바뀐다. 라우트 파일 위치·export는 그대로다.
- [x] 정적 `import` / `export from` — 바뀌지 않는다. 부록 B 검사가 transpile 결과로 확인한다.
- [x] dynamic `import()` / lazy loading — 해당 없음. `webpackChunkName`·`turbopackIgnore` 같은 기능 주석이 저장소에 0개다.
- [x] barrel export(`index.ts`) — 해당 없음. `src/server/auth/index.ts:1`은 파일 이름 주석만 지운다.
- [x] 테스트와 스크립트 참조 — 소스 텍스트를 읽는 시험을 전부 확인했다(부록 C-4). 후보 줄 중 텍스트 단언에 걸리는 것은 없다.
  `src/server/project-slug-rule-sync.test.ts:14`는 `export const` 줄 끝까지를 정규식으로 읽으므로 그 줄들에는 끝 주석을
  붙이거나 떼지 않는다(부록 A에 없다).
- [x] 정적 자산 URL / `public` — 해당 없음.
- [x] 타입 선언·전역 선언 — `tsconfig.json:5`가 `allowJs: true`라 TS 호출부는 `.mjs`의 JSDoc 형 태그로 형을 얻는다.
  형 태그가 든 JSDoc 주석 9개(`packages/core/backlog.mjs`·`deliver.mjs`·`entitlement.mjs`)는 부록 A에 없고, 부록 B-1 검사가
  JSDoc 블록 전체도 비교한다. TS 파일은 형 선언·형 import까지 유지한 printer 출력과 transpile 출력을 함께 비교한다. `packages/core/pipeline.d.mts`는 이번에 손대지 않는다.
- [x] 생성물 — `prisma/schema.prisma`의 `//` 주석은 `prisma generate`가 만드는 `inlineSchema` 문자열에 원문째 들어간다
  (`src/generated/prisma/internal/class.ts`, gitignore). 데이터 모델(`runtimeDataModel`)에는 주석이 없고, 주석만 고친 사본과의
  `prisma migrate diff`는 빈 마이그레이션이다. 그 생성물의 소스·모델 파일을 검사하는 `scripts/project-availability-runtime.test.ts`는 `ProjectMember` 부재와 모델 파일 18개를 확인한다.
  이번 정정은 그 구조를 바꾸지 않으며, 부록 B-3은 `inlineSchema` 전체의 정확한 치환 결과, `runtimeDataModel`의 JSON 구조,
  생성 경로와 그 밖의 생성 본문을 기준 디렉터리 사본과 비교한다. 정정 문구 존재만으로 손상되거나 다른 스키마인 본문을 통과시키지 않는다.
- [x] 런타임 side effect / 초기화 코드 — 없다. 바뀌는 것은 주석 trivia뿐이다.
- [x] API·저장소·외부 SDK — 없다. MCP 도구 설명·화면 문구는 문자열이라 주석 정리와 무관하다.
- [x] 마이그레이션 — SQL 주석은 손대지 않는다(부록 C-2). 스키마 주석 변경은 새 마이그레이션을 만들지 않는다(위 생성물 항목).
- [x] 플러그인 배포 — `plugin/bin`·`plugin/lib`은 주석만 바뀌므로 사용자에게 다시 배포할 이유가 없다.

## Approval

승인 기록의 단일 기준은 front matter의 `approved-by`, `approved-at`, `approval-scope`입니다. 승인 후에는 `stage: "approved"`로 바꿉니다.

승인 메모:

- 현재 실행 범위는 Option B 전체(삭제 196건·정정 22건)다. Open Questions 1–4는 범위를 바꿀 때 검토할 수 있는 대안이다.
- 대안을 선택하면 먼저 해당 범위·부록 A·단계·검사기 행 수·성공 기준을 함께 수정하고 전체 재대조를 마친다. 검사를 생략해 범위 변경을 대신하지 않는다.
- 문서 대조·개선과 실제 구현 승인은 별개다. 실제 실행 지시에 따른 승인 기록은 front matter를 따른다.

## Execution Plan

`dev`에서 `harness/comment-cleanup`을 따서 진행하고 PR은 `--base dev`로 연다(AGENTS.md "Branching and pull requests").
먼저 Verification Plan의 준비 명령으로 기준 SHA와 기준 생성물을 고정한다. 스크립트 세 개를 저장한 뒤 B-2 `--preflight`가 218행의 기준 위치를 확인해야 주석을 편집한다.
각 phase는 커밋 하나이고, 끝날 때마다 시스템이 정상이어야 한다. phase의 검증에 나오는 B-1·B-2·B-3·스키마 확인·`$CleanupBase`는
[Verification Plan](#verification-plan)의 해당 명령과 변수다.

### Phase 1: 낡은 참조 정정 — 부록 A의 C 22건

- 작업 내용: C표의 "지금 적힌 것"을 "바꿀 문구" 그대로 바꾼다(줄 번호를 새로 적지 않는다). 다른 커밋이 먼저 들어왔다면
  "근거" 열의 위치를 다시 확인한다. 이 phase는 `packages/core`의 `pipeline.mjs`·`transitions.mjs`·`manifest.mjs`를 고치므로 끝에
  `npm run sync:plugin-lib`를 돌린다(안 돌리면 `npm run check` 첫 단계가 드리프트로 실패한다).
- 검증: 부록 B-1 exit 0 → 스키마 확인(`prisma migrate diff --exit-code` exit 0, `npm run db:validate`) → `npm run db:generate` → `npm run check` →
  `npm test`(`packages/core/deliver.test.mjs`) → `npm run test:web` → `npm run test:server`.

이 시점에는 스키마 ApcH 주석 삭제(부록 A B3 행)가 아직 남아 있다. 세 스키마 행 전체를 요구하는 B-3은 Phase 3 이후 실행한다.

### Phase 2: `packages/core`와 `plugin/bin`의 A·B 행(시험 제외)

- 작업 내용: 해당 행을 지우고 `npm run sync:plugin-lib`.
- 검증: 부록 B-1 exit 0(미러 파일도 비교 대상에 들어간다) → `npm run check`(첫 단계가 `plugin-lib.mjs --check`) → `npm test`.

### Phase 3: `src/server`·`src/app`·`src/fsd`·`prisma`·설정 파일의 A·B 행(시험·픽스처 제외)

- 작업 내용: 해당 행을 지운다. JSX 주석 안의 조각(`src/fsd/features/edit-backlog/ui/backlog-form.tsx:59`)은 조각만 지우고
  `{/* … */}`는 남긴다.
- 검증: 부록 B-1 exit 0 → `git diff "$CleanupBase" -- prisma/schema.prisma src/app/globals.css .gitignore next.config.ts`를 눈으로
  확인(B-1 밖의 파일과 설정) → 스키마 확인 → `npm run db:generate` → B-3 exit 0 → `npm run check` → `npm run test:web` → `npm run test:server`.

### Phase 4: 시험·픽스처의 A·B 행

- 작업 내용: 시험 파일의 행을 지운다. `describe`/`it` 이름과 단언 문자열은 건드리지 않는다.
- 검증: 부록 B-1 exit 0 → 부록 B-2 exit 0(여기서 전체 적용을 확인한다) → `npm test` → `npm run test:web` →
  `npm run test:server` → `npm run check` → 마지막에 `npm run build` → B-3 재확인. 구현 완료 시 전체 diff로 비고 35건·주석 구분자 보존·그 밖의 주석 보존을 리뷰한다.

## Verification Plan

실행할 검증은 PowerShell(저장소 루트) 기준이다. 외부 프로그램은 exit가 0이 아니면 즉시 중단한다. 부록 B 스크립트는 저장소 밖 임시 디렉터리에만 둔다.

준비는 **주석 편집 전에 한 번만** 한다. 원격 `dev`의 존재와 작업 트리를 확인하고 `dev`에서 `harness/comment-cleanup`을 만든 직후의 SHA를 기준으로 고정한다.
다른 작업 변경이 있으면 별도 checkout에서 진행한다. 이 문서 이외의 변경을 기준에 섞지 않는다. 기준 SHA가 조사 커밋과 다르면 218행과 정정 근거를 먼저 재대조한다.

```powershell
function Invoke-CleanupCheck([string]$Program, [string[]]$Parameters) {
  & $Program @Parameters
  if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit $LASTEXITCODE" }
}
$CleanupOtherChanges = @(git status --porcelain=v1 --untracked-files=all -- . ':(exclude)docs/proposals/active/non-behavioral-comment-cleanup.md')
if ($LASTEXITCODE -ne 0 -or $CleanupOtherChanges.Count -ne 0) { throw 'Other tracked or untracked changes exist; use a separate clean checkout.' }
Invoke-CleanupCheck 'git' @('fetch', 'origin')
$CleanupRemoteDev = @(git ls-remote --heads origin dev)
if ($LASTEXITCODE -ne 0 -or $CleanupRemoteDev.Count -ne 1) { throw 'Remote dev is missing; restore the integration branch before branching.' }
Invoke-CleanupCheck 'git' @('switch', 'dev')
Invoke-CleanupCheck 'git' @('merge', '--ff-only', 'origin/dev')
Invoke-CleanupCheck 'git' @('switch', '-c', 'harness/comment-cleanup')
$CleanupBase = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve the baseline' }
$CleanupScratch = Join-Path ([System.IO.Path]::GetTempPath()) ('stagekeeper-comment-cleanup-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $CleanupScratch -ErrorAction Stop | Out-Null
[System.IO.File]::WriteAllText((Join-Path $CleanupScratch 'baseline.txt'), $CleanupBase, [System.Text.UTF8Encoding]::new($false))
# 이 디렉터리에 부록 B-1·B-2·B-3의 세 파일을 UTF-8로 저장한 뒤 계속한다.
Invoke-CleanupCheck 'node.exe' @("$CleanupScratch/appendix-applied-check.mjs", $CleanupBase, 'docs/proposals/active/non-behavioral-comment-cleanup.md', '--preflight')
Invoke-CleanupCheck 'node.exe' @('scripts/plugin-lib.mjs', '--check')
$CleanupSchema = @(git show "${CleanupBase}:prisma/schema.prisma")
if ($LASTEXITCODE -ne 0) { throw 'Cannot read the baseline schema' }
[System.IO.File]::WriteAllText((Join-Path $CleanupScratch 'schema-base.prisma'), (($CleanupSchema -join "`n") + "`n"), [System.Text.UTF8Encoding]::new($false))
Invoke-CleanupCheck 'npm.cmd' @('run', 'db:generate')
Copy-Item -LiteralPath 'src/generated/prisma' -Destination (Join-Path $CleanupScratch 'client-base') -Recurse -ErrorAction Stop
```

최종 검증은 같은 `$CleanupScratch`와 고정 SHA를 사용한다. 새 세션이면 준비 블록의 `Invoke-CleanupCheck` 함수만 다시 정의하고, 그 디렉터리 경로를 지정한 뒤 `baseline.txt`를 읽는다. fetch·branch 생성·기준 생성물 저장을 다시 실행하지 않는다.

```powershell
$CleanupBase = (Get-Content -LiteralPath (Join-Path $CleanupScratch 'baseline.txt') -Encoding UTF8 -Raw).Trim()
Invoke-CleanupCheck 'node.exe' @("$CleanupScratch/comment-only-check.mjs", $CleanupBase)
Invoke-CleanupCheck 'node.exe' @("$CleanupScratch/appendix-applied-check.mjs", $CleanupBase, 'docs/proposals/active/non-behavioral-comment-cleanup.md')
Invoke-CleanupCheck 'npx.cmd' @('prisma', 'migrate', 'diff', '--from-schema', "$CleanupScratch/schema-base.prisma", '--to-schema', 'prisma/schema.prisma', '--script', '--exit-code')
Invoke-CleanupCheck 'npm.cmd' @('run', 'db:validate')
Invoke-CleanupCheck 'npm.cmd' @('run', 'db:generate')
Invoke-CleanupCheck 'node.exe' @("$CleanupScratch/generated-schema-check.mjs", "$CleanupScratch/client-base", 'src/generated/prisma')
Invoke-CleanupCheck 'npm.cmd' @('run', 'verify:fsd')
Invoke-CleanupCheck 'npm.cmd' @('run', 'test:architecture')
Invoke-CleanupCheck 'npm.cmd' @('run', 'check')
Invoke-CleanupCheck 'npm.cmd' @('test')
Invoke-CleanupCheck 'npm.cmd' @('run', 'test:web')
Invoke-CleanupCheck 'npm.cmd' @('run', 'test:server')
Invoke-CleanupCheck 'npm.cmd' @('run', 'build')
# build가 다시 생성한 최종 클라이언트도 확인한다.
Invoke-CleanupCheck 'node.exe' @("$CleanupScratch/generated-schema-check.mjs", "$CleanupScratch/client-base", 'src/generated/prisma')
```

Prisma 설정은 `env("DATABASE_URL")`을 즉시 평가한다. 로컬 설정이 없으면 CI와 같은 접속하지 않는 placeholder URL을 해당 검사 세션에 지정한다.
`migrate diff --from-schema/--to-schema`·`validate`·`generate`는 DB 조회·migration 적용을 하지 않는다. 이 작업에 `db:migrate`·`migrate deploy`는 사용하지 않는다.

검증 기준:

- B-1의 마지막 줄이 `N file(s): comments only`, B-2의 마지막 줄이 `218 rows (… anchors) applied; …, none outside the list`이고
  둘 다 exit 0이다.
- B-2가 추가·복사·삭제·이름 변경·파일 종류 변경·충돌과 목록 밖의 추적/미추적 변경을 거부한다. 제외하는 문서는 이 제안서 하나뿐이다.
- 준비 명령은 기준 SHA·생성물을 저장하기 전에 이 제안서 이외의 staged·작업 트리·미추적 변경이 있으면 중단한다. ignored 생성물은 기준 스키마에서 새로 생성한다.
- B-3가 `inlineSchema: all 3 corrections applied; runtimeDataModel unchanged; other generated content unchanged`로 끝나고 exit 0이다.
  문구 존재만 확인하지 않는다. `inlineSchema` 전체의 정확한 치환 결과와 생성 경로·나머지 본문을 기준 디렉터리와 비교한다.
- `prisma migrate diff --exit-code`가 exit 0이고 출력이 `-- This is an empty migration.`이다. 모델 차이는 exit 2로 중단된다.
- 게이트 명령이 모두 exit 0이다. 실패가 있으면 같은 명령을 `$CleanupBase`에서 돌려 기존 실패인지 먼저 가른다 —
  주석만 바뀐 브랜치에서 새로 생긴 실패라면 텍스트를 읽는 시험(부록 C-4)부터 의심한다.
- 설치된 Next.js 16.3.3은 개발 출력 경로를 `.next/dev`로 분리한다(`node_modules/next/dist/server/config.js`의 `distDirRoot`·개발용 `distDir` 설정).
  빌드만을 이유로 dev 서버를 종료할 필요는 없다. Prisma 클라이언트는 공용 생성물이므로 생성 명령을 서로 겹쳐 실행하지 않는다.
- `npm run test:server:integration`(격리 DB 필요)은 이번 변경의 게이트가 아니다. 그 디렉터리에서 바뀌는 것은
  `tests/server/integration/agent-runs.test.ts`·`migration.test.ts`·`templates.test.ts`의 주석뿐이고, 이 세 파일은 B-1과 `npm run check`의
  `tsc --noEmit`(`tsconfig.json`의 `**/*.ts`)이 확인한다.

### 최종 검증 목적지

| 대상 / 보존 계약 | 최종 소유자·본문 | 검사 |
| --- | --- | --- |
| 원본 JS/TS 93개 파일의 실행 코드·형·import/export·directive | 부록 A의 같은 파일·같은 public API. 위치·함수 순서는 유지 | B-1의 printer·emit·JSDoc·기능 표식 비교, 전체 diff, check·test·test:web·test:server·build |
| 주석 이동 네 줄 | board-query.ts의 latestBoardWithEvents 바로 위. walkingKeys의 설명 두 줄은 유지 | B-2의 네 줄 전체 존재·중복 부재·목적지 인접 검사 |
| packages/core 배포 모듈 6개와 미러 | 원본 deliver·manifest·pipeline·repo-url·transitions·vars.mjs → 같은 이름의 plugin/lib 파일 | B-1·B-2, plugin-lib.mjs --check의 전체 모듈 동일성 |
| schema.prisma와 생성 클라이언트 | generator가 src/generated/prisma에 출력. inlineSchema 전체는 정정 3건만 반영한 기준 문자열과 동일. class.ts의 나머지 본문·25개 파일·경로 26개·모델 18개 유지 | schema-only diff exit 0, B-3의 전체 본문·경로·모델 비교, project-availability-runtime.test.ts, check의 tsc, build 뒤 B-3 |
| globals.css·.gitignore | 같은 CSS 선언·같은 ignore 패턴. 원본 두 파일의 주석만 삭제 | 전체 diff에서 선언·패턴 보존 확인, B-2 허용 목록 |
| 다음 줄 처리·문장 맺음과 보존 주석 | 부록 A 비고 35건과 각 변경 파일의 나머지 주석 | 전체 diff 리뷰. 행 문자열 개수 검사만으로 완료하지 않는다 |
| migration SQL/lock·pipeline.d.mts·문서 잠금·templates·회색 지대 3곳 | 부록 C와 Open Questions 5의 기존 원본. 직접 변경 없음 | B-2 허용 목록 밖 변경 거부, B-1 JSDoc 보존, check의 생성 모델 검사. ignored templates는 손대지 않는 scope guard |

## Verification Results

아래는 제안서 작성 당시의 사전 검사와 이후 갱신한 실행 기록이다.
실제 구현 완료와 전체 검증 결과는 Completion or Closure Notes에 기록한다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 부록 B-1 수정본의 자기 시험 | 16/16 통과 | 주석 변경 허용, TS 형 alias·매개변수·interface·형 import·여러 줄 JS JSDoc·실행 코드·directive·JSX 텍스트·형 검사 지시어 변경 거부, 문법 오류 거부 |
| 부록 B-2 수정본의 자기 시험(메모리에서만 적용) | 14/14 통과 | 218행 전체 적용 성공, 빈/잘못된 표·미적용·기준 drift·치환 누락·이동 네 줄 각각의 누락·목록 밖 미러/문서 변경 거부 |
| 부록 A 전체 적용을 독립적으로 모의 실행 | 96개 원본 / 93개 JS·TS 파일 통과 | 비고도 전개한 메모리 사본에서 B-1·B-2 통과. 실제 소스는 편집하지 않았다 |
| 부록 B-2 실제 CLI(임시 Git 저장소) | 통과 | preflight·미적용 거부·원본+미러 102개 전체 적용·목록 밖 미추적/추적/문서/미러·파일 작업 거부 |
| 부록 B-3 자기 시험과 생성물 전수 비교 | 13/13 통과, 26개 경로 동일 | 실제 생성 결과 허용. 낡은 생성물·치환 누락·모델 변경·본문 누락/잘림·스키마 내용/보존 주석 변경·class.ts의 다른 본문 변경·다른 생성 파일 변경·경로 추가/누락·기준 drift 거부. class.ts 이외의 25개 파일은 바이트 동일 |
| 부록 A 218행의 "지울 것"·"지금 적힌 것"이 그 줄에 있는가 | 218/218 일치 | 문서 저장본의 표를 직접 파싱했다. 2026-10-02 `dev`(03876dd) 기준 |
| 주석 속 `파일:줄` 인용 대조 | 낡은 것 7건 → 부록 A C | 맞는 것(예: `guard.ts:14`, `owner-tools.ts:38`, Next 문서 줄)은 그대로 둔다 |
| 두 번째 경로: 이력·참조 낱말 패턴으로 모든 주석 줄(JS/TS·`schema.prisma`·CSS·YAML·`.gitignore`)을 훑어 부록 A 밖 적중을 전부 판정 | 적중 91건 → B2 2건·B4 3건·C 1건을 더함 | 나머지는 [판정 기준](#판정-기준)의 "남기는 것", Open Questions 5번, 이미 있는 행의 "비고"가 덮는 다음 줄, 또는 같은 줄의 코드 문자열에 걸린 오탐 1건(`src/fsd/pages/board-item/model/item-docs.test.ts:36`의 URL 속 커밋 해시)이다 |
| 같은 패턴으로 부록 A 행에서 조각을 뺀 뒤 남는 말을 훑음 | B4 2건을 더함 | `plugin/bin/harness-init.test.mjs:373`·`:450`의 "지금까지…". 나머지 잔여는 "비고"가 다루거나 "남기는 것"이다 |
| 줄 번호 참조 점검: 이 계획이 줄을 지우는 파일을 가리키는 주석·현행 문서의 줄 인용 | C에 1건을 더함 | `src/server/rest-scope.ts:58`의 "(위 :46)". 현행 계약 문서(`docs/architecture`·`docs/conventions`)에는 해당 인용이 없다. 다른 active 제안서의 인용 1곳은 리스크에 적었다 |
| `prisma migrate diff --exit-code`와 부록 B-3 | exit 0, 빈 마이그레이션 / 생성물 검사 통과 | 저장소 밖의 같은 출력 경로에서 기준·정정 스키마를 차례로 생성해 각각 보관. generator output 설정까지 같은 inlineSchema 전체, 모델 JSON·경로·나머지 본문을 비교. DB 접속 없음 |
| 검증 명령의 실행성(PowerShell) | 실행 완료 | 고정 SHA·기준 생성물 보관·별도 worktree의 harness/comment-cleanup 분기·네 단계 구현과 검증을 완료. 아래 완료 기록 참조 |
| 준비 명령의 작업 트리 검사(임시 Git 저장소·실제 PowerShell) | 4/4 통과 | 제안서만 변경된 상태는 허용하고, 다른 tracked·untracked·staged 변경은 기준 저장 전에 거부 |
| `npm run check` · `npm test` · `npm run test:web` · `npm run test:server` · `npm run build` | 모두 exit 0 | 단계별 게이트와 최종 빌드 실행 완료. 아래 완료 기록 참조 |

## Risks and Rollback

잔여 리스크:

- **조각을 뺀 뒤 문장이 어색해진다.** "비고"가 붙은 35건에 이어지는 줄과 맺음 방법을 적었다. 그 밖의 행에서 문장이 끊기면 구현자가
  최소한으로 잇되 새 내용을 더하지 않는다.
- **줄 번호가 밀린다.** 이 문서의 줄 번호는 03876dd 기준이다. "지울 것" 문자열로 찾고, C표 "근거" 열의 줄 번호(`:296` 등)는
  고치기 직전에 다시 확인한다. 기준 SHA는 준비 때 한 번 저장하고 이후 `origin/dev`나 merge-base로 다시 계산하지 않는다. 같은 줄에 겹치는 조각(예: `src/server/mcp/tools.ts`의 `§D.1 — `와 `§D.1 `)은 줄 번호로
  구분한다.
- **목록의 사각지대.** 부록 A는 두 경로(주석 981 덩어리를 한 번 읽어 분류 + 이력·참조 낱말 패턴의 전수 조사)로 만들었고,
  이번에 돌린 두 경로로는 더 찾지 못했다. 패턴에 없는 낱말로 쓴 이력은 남아 있을 수 있다. "코드를 그대로 되풀이하는
  주석(What 주석)"은 명백한 4건(`result.ts` JSDoc 3, `next.config.ts`)만 넣었고 그 기준의 전수 판정은 하지 않았다.
  B1·B4 경계와 "남기는 것"의 판단은 리뷰에서 바뀔 수 있다.
- **텍스트를 읽는 시험.** 후보 줄과 겹치는 단언은 확인되지 않았지만, 시험이 소스를 읽는 방식이 바뀌면 다시 본다(부록 C-4).
- **다른 제안서의 줄 인용.** 이 계획은 여러 파일에서 주석 줄을 지우므로, 코드 줄 번호를 인용한 문서는 밀린다. 현행 계약
  문서에는 해당 인용이 없고, 당시 `agent-role-catalog.md:127`의 `tools.ts:75`·`:17`은 이미
  어긋나 있다(지금 `WorkspaceInput`은 `src/server/mcp/tools.ts:19`, `project_sync` 등록은 `:119`). 이 계획의 `tools.ts:23` 삭제로
  한 줄 더 밀리니 당시에는 그 제안서 대조 시 함께 수정할 대상으로 기록했다. 해당 미구현 제안서는 2026-10-04 사용자 지시로 삭제했다.

롤백 방법:

- 해당 phase 커밋을 `git revert`한다. 스키마 주석을 되돌렸다면 `npm run db:generate`로 ignored 클라이언트의 `inlineSchema`도 되돌린 스키마와 맞춘다.
  `node scripts/plugin-lib.mjs --check`로 함께 커밋된 미러의 일치를 확인한다. DB·마이그레이션·플러그인 배포·템플릿 시드에 되돌릴 것은 없다.

## Completion or Closure Notes

기준 커밋 `03876dd24fab12c63542b4565f087b79a877f7ef`에서 분기한 `harness/comment-cleanup`의 별도 worktree에서 구현했다.
네 단계 코드 커밋은 다음과 같다. 원본 96개 파일과 동기화 미러 6개에 부록 A의 삭제 196건·정정 22건을 모두 적용했다.

| 단계 | 커밋 | 실제 변경 |
| --- | --- | --- |
| Phase 1 | `55e5470` | 낡은 참조 22건 정정, 주석 네 줄 이동, 미러 3개 동기화 |
| Phase 2 | `c8ad544` | 코어·플러그인 생산 코드의 이력 주석 삭제, 미러 동기화 |
| Phase 3 | `e65e9f5` | 서버·화면·스키마·설정의 이력 주석 삭제 |
| Phase 4 | `e9ffef020522cd3bcad08f625023227276c5a135` | 시험·픽스처의 이력 주석 삭제 |

실제 검증 결과:

| 검사 | 결과 |
| --- | --- |
| B-1 | `99 file(s): comments only` — 실행 출력·타입 선언·import/export·directive·JS JSDoc 보존 |
| B-2 | `218 rows (213 anchors) applied; 102 changed file(s), none outside the list` |
| 스키마 | `prisma migrate diff --exit-code` exit 0, 빈 마이그레이션; `db:validate`·`db:generate` exit 0 |
| B-3 | Phase 3과 최종 build 후 모두 exit 0. inlineSchema 전체에 스키마 주석 3건만 반영; runtimeDataModel·나머지 생성 본문·26개 경로 동일 |
| `npm run check` | 모든 단계 통과 — 미러·lint·Next typegen·tsc·아키텍처·project availability 검사 포함 |
| `npm test` | 188/188 통과 |
| `npm run test:web` | 504/504 통과 |
| `npm run test:server` | 26개 통과, 1개 기존 skip, 실패 0 |
| `npm run verify:fsd` / `npm run test:architecture` | 경계 검사 통과 / 26개 시험 통과 |
| `npm run build` | 기준 커밋과 최종 변경본 모두 exit 0 |
| 비 JS/TS·보존 대상 | CSS AST·gitignore 규칙 동일; migration SQL·lock과 보호 대상 23개 파일 동일; 전체 diff·비고 35건·주석 구분자·목록 밖 주석 보존 리뷰 완료 |

처음 빌드는 worktree의 `node_modules` junction이 Turbopack 파일시스템 경계 밖을 가리켜 실패했다.
worktree에 `npm ci --offline --no-audit --no-fund`로 의존성을 직접 설치하고 같은 빌드 명령을 재실행했다.
이후 기준 커밋과 최종 변경본 모두 통과했다. Phase 3 미러 검사에서 발견한 혼합 LF/CRLF 차이도 원본으로 재동기화해 해소했다.

검증 스크립트·로그·고정 SHA·기준 클라이언트 사본은 저장소 밖 임시 작업 디렉터리에 보관했다.
위 Verification Plan의 active 문서 경로는 실행 당시 경로다. 완료 후 B-2 재검증에는 이 문서의
`docs/proposals/completed/2026-10-02-non-behavioral-comment-cleanup.md` 경로를 넘긴다.

이번 승인 범위의 미완료 항목은 없다. Open Questions 5의 세 회색 지대는 명시한 범위 밖으로 유지한다.
[PR #98](https://github.com/Sangeok/stagekeeper/pull/98)은 2026-10-02 dev에 병합됐다
(`2f4bbd67698144a778ce43e9aa40a02d5e7a6a75`).

## Review Checklist

- [x] 모든 `{placeholder}`와 완료 기록의 `TBD`를 실제 결과로 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `completed/`는 `completed`이다.
- [x] `stage`는 pending 문서에서만 사용했다.
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `standard`이고, 강제 조건(삭제 작업, 5개 이상 파일)에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다(부록 A는 줄 단위).
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분하는 방법을 적었다.
- [x] 잔여 리스크를 명시했다.
- [x] 완료 문서의 완료일·검증 결과·구현 커밋·변경 요약·후속 범위를 기록했다.

---

<!-- doc-validation-skip -->
## Open Questions

1. **[범위]** 시험·픽스처 파일의 61건도 이번에 지울지 — 권장: 포함. 같은 기준이고, 시험 주석의 사건 기록도 git 이력에 있다.
    현재 기준안에 포함한다(삭제 59건·정정 2건). 삭제를 제외한다면 부록 A·건수·Phase 4·B-2의 행 수와 파일 수를 함께 수정해 다시 대조한다. Phase 1 정정 2건은 유지한다. B-2를 생략하지 않는다.
2. **[B2]** 작업 ID·제안서 참조 83건을 지울지, `docs/proposals/completed/<파일>.md §E.7`처럼 전체 경로로 바꿀지 — 권장: 삭제.
   번호만으로는 어느 문서인지 모르고(`§E.x`·`§C.x`·`§D.x`는 `2026-09-10-configurable-pipeline.md`, `A-x`·`3-a`·`3-g`는
   `2026-09-22-user-scoped-project-identity.md`, `C11`은 완료 제안서 5개), 경로로 바꾸면 83곳이 문서 이름을 계속 들고
   다닌다. 경로까지 적힌 참조는 [판정 기준](#판정-기준)대로 남긴다.
3. **[B1]** `(실측)` 표식 — "관찰로 확인된 실패"라는 신호로 남기고 싶은지 — 권장: 삭제. 그 실패가 무엇이었는지는 앞 문장이 이미 말한다.
4. **[C]** 정정 22건을 같은 PR에 넣을지 — 권장: 같은 브랜치의 별 커밋(Phase 1). 주석만 바꾸는 점은 같아 검증을 공유한다.
5. **[회색 지대 — Out of scope]** 아래 세 곳은 이번 기준안에서 유지한다. 변경 여부는 후속 사실 확인·별도 제안서에서 판단한다. 이번 구현의 미결 조건이 아니다.
   - `src/fsd/entities/project-token/model/connect-command.ts:53`의 "이 머신(Windows)에서는 검증하지 못했다." — 세션 기록이지만
     "macOS·Linux 경로는 미검증"이라는 정보이기도 하다. 남기려면 그 뜻으로 바꿔 쓴다.
   - `src/server/github.ts:8`의 "GitHub App(Phase 4)까지 미룬다" — Phase 4는 entitlement로 이미 끝났다. GitHub App 계획이
     아직 유효한지(`docs/architecture/sources.md`에 언급이 있다) 확인한 뒤 고친다.
   - `prisma/schema.prisma:210`의 `model Command { // 명령 원장 (Phase 3에서 소비)` — 앱 코드(`src`·`scripts`·`tests`)에
     `prisma.command` 사용이 없다. 주석보다 모델 자체의 존속을 따로 판단할 일이다.

<!-- doc-validation-restore -->

---

## 부록 A. 후보 목록

- 줄 번호는 2026-10-02 `dev`(03876dd) 기준이고 "지울 것"은 그 줄에 그대로 있는 문자열이다.
- 단위: **주석 통째** = 그 줄을 포함한 주석 전체(연속한 `//` 줄 또는 `/** */` 블록), **그 줄** = 주석 한 줄,
  **조각** = 주석 안의 그 문자열만. "비고"가 있으면 다음 줄까지 이어지거나 문장을 맺는 방법이다.
- 조각을 지운 뒤 빈 `//` 줄만 남으면 그 줄도 지운다. 그래서 같은 파일의 아래쪽 줄 번호는 밀린다 — 위치는 "지울 것"
  문자열로 찾는다.
- 조각 삭제는 `//` 등 주석 구분자를 남긴다. A표의 끝 주석은 주석 범위만 지우고 같은 줄의 코드는 남긴다.
- 같은 줄에 범주가 둘이면 행도 둘이다(예: `src/server/agents/next.ts:15`의 B2·B4).
- C표의 "바꿀 문구"가 코드로 적혀 있으면 그 문자열을 그대로 쓴다(부록 B-2가 그 문자열이 들어갔는지 본다). "근거" 열의
  줄 번호는 03876dd 기준 위치 안내이고 주석에 옮겨 적지 않는다.

### A. 주석 통째 삭제 — 13건

| # | 위치 | 지울 것 | 단위 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | `src/app/api/auth/[...nextauth]/route.ts:1` | `// src/app/api/auth/[...nextauth]/route.ts` | 주석 통째 |  |
| 2 | `src/app/login/page.tsx:1` | `// src/app/login/page.tsx` | 주석 통째 |  |
| 3 | `src/server/auth/index.ts:1` | `// index.ts` | 주석 통째 |  |
| 4 | `src/server/auth/next-auth.d.ts:1` | `// next-auth.d.ts` | 주석 통째 |  |
| 5 | `next.config.ts:4` | `/* config options here */` | 주석 통째 |  |
| 6 | `src/fsd/shared/api/result.ts:2` | `Unified result type for server actions` | 주석 통째 | 1–4행 `/** */` 블록 |
| 7 | `src/fsd/shared/api/result.ts:10` | `Creates a success result` | 주석 통째 | 9–11행 블록 |
| 8 | `src/fsd/shared/api/result.ts:23` | `Creates a failure result` | 주석 통째 | 22–24행 블록 |
| 9 | `src/fsd/widgets/turn-banner/model/turn.ts:23` | `// §E.3` | 주석 통째 |  |
| 10 | `src/fsd/features/review-gate/api/review-gate.server.ts:30` | `// ApcH result.ts의 무인자 오버로드 = ActionResult<void>` | 주석 통째 |  |
| 11 | `src/fsd/features/review-gate/api/review-gate.server.ts:54` | `// ApcH result.ts의 무인자 오버로드 = ActionResult<void>` | 주석 통째 |  |
| 12 | `src/fsd/entities/project-token/ui/token-reveal.test.ts:20` | `// 2026-09-21: product-copy.md §9가 두 번 고쳐지는 동안` | 주석 통째 | 20–21행 |
| 13 | `src/server/rest-scope.ts:29` | `// 첫 가지는 기존 경로 그대로다 — hs_의 동작이 한 줄도 바뀌지 않는다.` | 주석 통째 |  |

### B1. 날짜·사건·검증 기록 — 36건

| # | 위치 | 지울 것 | 단위 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | `packages/core/vars.mjs:25` | `— 2026-09-22 mathgic 실사용에서 free 런북이 하드코딩된` | 조각 | 26행 `…행을 들고 있었다.`까지 |
| 2 | `packages/core/vars.mjs:53` | `(실측)` | 조각 |  |
| 3 | `plugin/bin/harness-init.mjs:240` | `(2026-09-22 mathgic: free 런북이 하드코딩된 네 행을 들고 있었다)` | 조각 |  |
| 4 | `src/app/(app)/p/[slug]/page.tsx:19` | `(2026-09-23 결정)` | 조각 |  |
| 5 | `src/app/globals.css:3` | `mock v4(2026-08-30 승인)의 값 그대로 — ` | 조각 |  |
| 6 | `src/fsd/entities/board-item/model/doc-link.ts:16` | `네 사이클의 게이트 2가 죽은 링크였다(실측)` | 조각 | 남는 말: "화면이 그 조건을 말하지 않으면 죽은 링크로 보인다." |
| 7 | `src/fsd/entities/project-token/model/connect-command.ts:36` | `// 두 줄 모두 2026-09-22에 더미 변수로` | 그 줄 |  |
| 8 | `src/fsd/features/edit-backlog/ui/backlog-form.tsx:59` | `(실측)` | 조각 |  |
| 9 | `src/fsd/pages/landing/ui/landing-page.tsx:11` | `(landing-v2, 2026-08-30 승인)` | 조각 |  |
| 10 | `src/fsd/pages/project-board/model/briefing.ts:95` | `(실측)` | 조각 |  |
| 11 | `src/fsd/pages/user-tokens/ui/user-tokens-page.tsx:23` | `(2026-09-22 렌더 확인에서 발견, dev에도 있던 것)` | 조각 |  |
| 12 | `src/fsd/shared/lib/copy-lock.ts:3` | `// §13(PR #34, tools.test.mjs가 막는다)과 §9(2026-09-21` | 그 줄 | 2행 끝 `두 번 어긋났다 —`를 `두 번 어긋났다.`로 맺는다. 같은 사실이 product-copy.md:18-19에 있다 |
| 13 | `src/fsd/widgets/turn-banner/api/turn-data.server.ts:38` | `(실측)` | 조각 |  |
| 14 | `src/fsd/widgets/turn-banner/model/turn.ts:187` | `(실측: on_hold인 FEAT-07에 "waiting for dev"가 떴다)` | 조각 |  |
| 15 | `src/fsd/widgets/turn-banner/model/turn.ts:198` | `(실측)` | 조각 |  |
| 16 | `src/fsd/widgets/turn-banner/ui/turn-banner.tsx:51` | `(2026-09-07 사이클 실측 F-B)` | 조각 |  |
| 17 | `src/server/pipeline/board-query.ts:147` | `(실측)` | 조각 |  |
| 18 | `src/server/pipeline/board-query.ts:358` | `(실측)` | 조각 |  |
| 19 | `src/server/pipeline/run-rules.ts:45` | `(실측)` | 조각 |  |
| 20 | `src/server/pipeline/run-rules.ts:56` | `accept만 hint가 없었다 —` | 조각 | `(실측)`도 지우고 현재형으로: "accept는 메인 루프가 에이전트 없이 직접 하는 유일한 동작이라 hint를 따로 단다." |
| 21 | `src/server/public-url.ts:3` | `(제품 결정 ⑧, 2026-09-23)` | 조각 |  |
| 22 | `packages/core/vars.test.mjs:25` | `(F3 실측)` | 조각 |  |
| 23 | `plugin/bin/harness-init.test.mjs:352` | `(2026-09-22 mathgic)` | 조각 |  |
| 24 | `plugin/bin/harness-init.test.mjs:471` | `(2026-09-20)` | 조각 |  |
| 25 | `scripts/retired-copy.test.mjs:1` | `— 2026-09-21에 서버 등록이` | 조각 | 3행 `…들고 남았다.`까지 |
| 26 | `src/fsd/pages/project-board/model/briefing.test.mjs:123` | `(F7 실측)` | 조각 |  |
| 27 | `src/fsd/pages/project-board/model/briefing.test.mjs:198` | `(실측)` | 조각 |  |
| 28 | `src/fsd/widgets/turn-banner/model/turn.test.ts:139` | `(실측)` | 조각 |  |
| 29 | `src/fsd/widgets/turn-banner/model/turn.test.ts:151` | `(실측)` | 조각 |  |
| 30 | `src/server/agents/next.test.ts:304` | `(실측에서 메인 루프가 항목을 두고 넘어갔다)` | 조각 |  |
| 31 | `src/server/agents/next.test.ts:321` | `(실측)` | 조각 |  |
| 32 | `src/server/mcp/tools.test.mjs:49` | `// PR #34가 plan_submit에 전이를 합치고` | 그 줄 | 49–50행. 51행 규칙 문장은 남긴다 |
| 33 | `src/server/pipeline/board-rules.test.mjs:155` | `(실측)` | 조각 |  |
| 34 | `src/server/pipeline/run-rules.test.mjs:59` | `accept만 빠져 있었다 —` | 조각 | `(실측)`도 지우고 현재형으로(위 run-rules.ts:56과 같은 문장) |
| 35 | `src/server/pipeline/run-rules.test.mjs:62` | `다섯 사이클 동안 한 번도 안 남았다(F6 실측)` | 조각 | 남는 말: "verify hint는 경로 목록을 남길 자리를 말한다." |
| 36 | `src/server/pipeline/run-rules.test.mjs:95` | `실측에서 나온 것: ` | 조각 |  |

### B2. 작업 ID·제안서 참조 — 83건

| # | 위치 | 지울 것 | 단위 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | `packages/core/deliver.mjs:2` | `(제안서 "에이전트 전달")` | 조각 |  |
| 2 | `packages/core/transitions.mjs:25` | ` — dev A-4·B-6` | 조각 |  |
| 3 | `plugin/bin/harness-init.mjs:65` | `(B-1 선택지 3)` | 조각 |  |
| 4 | `plugin/bin/harness-init.mjs:86` | `(C11)` | 조각 |  |
| 5 | `plugin/bin/harness-init.mjs:293` | `B-1 선택지 3 — ` | 조각 | 남는 말: `(사용자 범위에 머신당 1회 등록한다)` |
| 6 | `plugin/bin/harness-init.mjs:324` | `(3-a의 원칙)` | 조각 |  |
| 7 | `plugin/bin/harness-init.mjs:335` | `(제안서 "저장소 런북")` | 조각 |  |
| 8 | `src/app/api/projects/route.ts:1` | `(C)` | 조각 |  |
| 9 | `src/fsd/entities/board-item/model/doc-link.ts:2` | `// slug 라우팅(locationFromSlug·isWhitelistedDocPath)은 문서 뷰어의 것이라 Phase 1 범위 밖이다.` | 그 줄 |  |
| 10 | `src/fsd/features/edit-backlog/ui/backlog-table.tsx:25` | `§E.7 — ` | 조각 |  |
| 11 | `src/fsd/features/edit-pipeline/model/rail-state.ts:2` | `(§E.6)` | 조각 |  |
| 12 | `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx:29` | `(§E.6)` | 조각 |  |
| 13 | `src/fsd/features/propose-item/ui/propose-button.tsx:13` | `(§E.7)` | 조각 |  |
| 14 | `src/fsd/features/review-gate/api/review-gate.server.ts:33` | `§E.2 ` | 조각 |  |
| 15 | `src/fsd/features/review-gate/api/review-gate.server.ts:33` | `(§C.7)` | 조각 |  |
| 16 | `src/fsd/features/review-gate/model/gate-text.ts:15` | `(§E.1)` | 조각 |  |
| 17 | `src/fsd/features/review-gate/model/inbox-item.ts:25` | `(§E.2)` | 조각 |  |
| 18 | `src/fsd/features/review-gate/model/inbox-item.ts:32` | `(§E.7)` | 조각 |  |
| 19 | `src/fsd/features/review-gate/model/inbox-item.ts:52` | `(§E.2 배선)` | 조각 |  |
| 20 | `src/fsd/features/review-gate/ui/inbox-card.tsx:38` | `(§E.2)` | 조각 |  |
| 21 | `src/fsd/pages/project-board/model/briefing.ts:12` | `(§E.4)` | 조각 |  |
| 22 | `src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx:24` | `(§C.1)` | 조각 |  |
| 23 | `src/fsd/widgets/turn-banner/api/turn-data.server.ts:12` | `§E.3: ` | 조각 |  |
| 24 | `src/server/agents/next.ts:15` | `(A-10)` | 조각 |  |
| 25 | `src/server/agents/next.ts:34` | `(A-10)` | 조각 |  |
| 26 | `src/server/agents/runs.ts:33` | ` — A-10` | 조각 |  |
| 27 | `src/server/auth/guard.ts:1` | ` — T1.10 주석` | 조각 |  |
| 28 | `src/server/mcp/auth.ts:25` | `(A-2)` | 조각 |  |
| 29 | `src/server/mcp/deps.ts:38` | `(§E.7)` | 조각 |  |
| 30 | `src/server/mcp/deps.ts:51` | `(§D.1)` | 조각 |  |
| 31 | `src/server/mcp/owner-deps.ts:13` | `(§C.7)` | 조각 |  |
| 32 | `src/server/mcp/tools.ts:54` | `(A-10)` | 조각 |  |
| 33 | `src/server/mcp/tools.ts:56` | `§D.1 — ` | 조각 |  |
| 34 | `src/server/mcp/tools.ts:215` | `§D.1 ` | 조각 |  |
| 35 | `src/server/pipeline/board-query.ts:148` | `(§E.3과 같은 이유)` | 조각 |  |
| 36 | `src/server/pipeline/board-query.ts:181` | `(§D.2)` | 조각 |  |
| 37 | `src/server/pipeline/board-query.ts:338` | ` — §C.7 viaGate` | 조각 |  |
| 38 | `src/server/pipeline/board-query.ts:537` | `(§C.2·§C.3)` | 조각 |  |
| 39 | `src/server/pipeline/board-query.ts:549` | `(§C.8)` | 조각 |  |
| 40 | `src/server/pipeline/board-rules.ts:76` | `(F3)` | 조각 |  |
| 41 | `src/server/pipeline/board-rules.ts:114` | `(후보 (a), G1에서 hold 사례가 0건이라 설계 근거로 택함)` | 조각 |  |
| 42 | `src/server/pipeline/run-query.ts:14` | `(§C.2의 표)` | 조각 |  |
| 43 | `src/server/pipeline/run-query.ts:18` | `(§C.8)` | 조각 |  |
| 44 | `src/server/pipeline/run-query.ts:54` | `(§C.2의 표, §D.1의 판정 순서)` | 조각 |  |
| 45 | `src/server/pipeline/run-query.ts:113` | `(D.1 "key 있음: 그 항목의 PipelineNext")` | 조각 |  |
| 46 | `src/server/pipeline/run-query.ts:117` | `(§D.1)` | 조각 |  |
| 47 | `src/server/pipeline/run-query.ts:133` | `§D.1; ` | 조각 |  |
| 48 | `src/server/project-identity-query.ts:8` | `C(git remote 기반 조회·등록)` | 조각 | `git remote 기반 등록(--register)`으로 바꾼다 |
| 49 | `src/server/project-identity-query.ts:13` | `(A-8)` | 조각 |  |
| 50 | `src/server/public-url.ts:1` | `(C11)` | 조각 |  |
| 51 | `src/server/rest-scope.ts:45` | `(A-8의 전환 경로)` | 조각 |  |
| 52 | `plugin/bin/harness-init.test.mjs:75` | `(C의 등록)` | 조각 |  |
| 53 | `plugin/bin/harness-init.test.mjs:108` | `(B-1 선택지 3)` | 조각 |  |
| 54 | `plugin/bin/harness-init.test.mjs:126` | `(3-g)` | 조각 |  |
| 55 | `plugin/bin/harness-init.test.mjs:373` | `C11: ` | 조각 |  |
| 56 | `plugin/bin/harness-init.test.mjs:385` | `(3-a)` | 조각 |  |
| 57 | `plugin/bin/harness-init.test.mjs:400` | `(B-1 선택지 3)` | 조각 |  |
| 58 | `plugin/bin/harness-init.test.mjs:424` | `(A-8)` | 조각 |  |
| 59 | `plugin/bin/harness-init.test.mjs:450` | `(D-4)` | 조각 |  |
| 60 | `plugin/bin/harness-init.test.mjs:463` | `C — ` | 조각 |  |
| 61 | `src/fsd/features/edit-pipeline/model/rail-state.test.ts:2` | `(§E.6)` | 조각 |  |
| 62 | `src/fsd/features/review-gate/model/gate-source.test.ts:64` | `(§E.1)` | 조각 |  |
| 63 | `src/fsd/features/review-gate/model/inbox-item.test.ts:31` | `(§E.2)` | 조각 |  |
| 64 | `src/fsd/pages/project-board/model/briefing.fixture.mjs:13` | `(§E.4)` | 조각 |  |
| 65 | `src/fsd/widgets/turn-banner/model/turn.test.ts:30` | `(§D.1의 done)` | 조각 |  |
| 66 | `src/server/agents/next.test.ts:102` | `(A-10)` | 조각 |  |
| 67 | `src/server/agents/next.test.ts:565` | `A-10. ` | 조각 |  |
| 68 | `src/server/agents/next.test.ts:588` | ` 그게 A-10이 막는 것이다.` | 조각 |  |
| 69 | `src/server/mcp/auth.test.mjs:26` | `(A-2의 (o))` | 조각 |  |
| 70 | `src/server/mcp/tools.test.mjs:99` | `T4.8. ` | 조각 |  |
| 71 | `src/server/pipeline/board-rules.test.mjs:67` | `(F3)` | 조각 |  |
| 72 | `src/server/pipeline/board-rules.test.mjs:79` | `T4.6 ` | 조각 |  |
| 73 | `src/server/pipeline/board-rules.test.mjs:100` | `후보 (a): ` | 조각 |  |
| 74 | `src/server/project-identity-query.test.ts:95` | `(A-8)` | 조각 |  |
| 75 | `src/server/project-identity-query.test.ts:131` | `(A-7)` | 조각 |  |
| 76 | `src/server/project-identity-query.test.ts:166` | `그 경로는 C가 git remote로 채운다.` | 조각 | "그 경로는 --register가 git remote로 채운다."로 바꾼다 |
| 77 | `src/server/project-registration-query.test.ts:71` | `C — ` | 조각 |  |
| 78 | `src/server/project-registration-query.test.ts:74` | `, 제안서도 그렇게 적었다.` | 조각 | `있어야 하고`를 `있어야 한다`로 맺는다 |
| 79 | `src/server/runbook-query.test.ts:78` | `(A-7)` | 조각 |  |
| 80 | `tests/server/integration/agent-runs.test.ts:42` | `A-10 뒤에도 ` | 조각 |  |
| 81 | `tests/server/integration/migration.test.ts:31` | `after replaying D3.` | 조각 | `after replaying them.`(28행에서 재생한 옛 마이그레이션)으로 바꾼다 |
| 82 | `tests/server/integration/templates.test.ts:55` | `(A-7)` | 조각 |  |
| 83 | `tests/server/integration/templates.test.ts:75` | `마지막 둘이 A-7이 더한 것이다: ` | 조각 | "마지막 둘은 슬러그 없는 hu_와 모르는 hu_다. 둘 다 401이다." |

### B3. ApcH 이식 출처 — 8건

| # | 위치 | 지울 것 | 단위 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | `packages/core/transitions.mjs:15` | ` (ApcH REJECT_TRANSITIONS + 보드 안내 블록 재개 규칙)` | 조각 |  |
| 2 | `src/fsd/entities/board-item/model/doc-link.ts:1` | `ApcH entities/repo-doc/model/doc-location.ts(de25a1c) 이식 — ` | 조각 |  |
| 3 | `src/fsd/features/review-gate/model/gate-source.ts:2` | `// ApcH의 GATE_TRANSITIONS·rejectActionsFor 화이트리스트를 대체한다` | 그 줄 |  |
| 4 | `src/fsd/features/review-gate/model/gate-text.ts:2` | `// ApcH transition-pipeline-gate/model/transitions.ts(de25a1c)` | 그 줄 |  |
| 5 | `src/fsd/features/review-gate/ui/gate-card-lock.tsx:8` | `(ApcH FEAT-20)` | 조각 |  |
| 6 | `src/server/auth/config.base.ts:16` | ` — ApcH config.edge 주석과 같은 이유` | 조각 |  |
| 7 | `src/server/pipeline/board-query.ts:340` | `(ApcH sha 잠금의 대응물)` | 조각 |  |
| 8 | `prisma/schema.prisma:159` | `(ApcH 결과: 두 줄 누적 규칙)` | 조각 |  |

### B4. 변경 시점 서술 — 40건

| # | 위치 | 지울 것 | 단위 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | `packages/core/deliver.test.mjs:43` | `이름이 단언과 반대였다: ` | 조각 |  |
| 2 | `packages/core/repo-url.mjs:9` | `이번 변경에서 통합하지 않았으므로(범위 밖 리팩터),` | 조각 |  |
| 3 | `plugin/bin/harness-init.mjs:108` | `지금까지처럼 ` | 조각 |  |
| 4 | `plugin/bin/harness-init.mjs:142` | `(예전 동작)` | 조각 |  |
| 5 | `plugin/bin/harness-init.test.mjs:109` | `그래서 "없어야 할 것" 쪽으로 옮겼고,` | 조각 |  |
| 6 | `plugin/bin/harness-init.test.mjs:373` | `지금까지와 같은 문장으로 ` | 조각 |  |
| 7 | `plugin/bin/harness-init.test.mjs:374` | `// 이 분기는 그동안 자동 테스트가 없었다` | 그 줄 |  |
| 8 | `plugin/bin/harness-init.test.mjs:400` | `` 관측 지점이 `.mcp.json`에서 stdout의 `server:` 줄로 옮겨졌다 `` | 조각 | 같은 줄 B2와 함께. 남는 말: "stdout의 `server:` 줄 값이 스킬을 거쳐 `claude mcp add`에 그대로 들어가므로 …" |
| 9 | `plugin/bin/harness-init.test.mjs:450` | `지금까지처럼 ` | 조각 |  |
| 10 | `src/fsd/entities/board-item/model/verification.ts:2` | `// 예전에는 status === "in_review" && validation !== null` | 그 줄 |  |
| 11 | `src/fsd/entities/board-item/ui/not-verified-chip.tsx:3` | `— 예전에는 두 화면이 각자` | 조각 | 4행 `…그렸다.`까지 |
| 12 | `src/fsd/entities/board-item/ui/over-budget-chip.tsx:4` | `— 예전에는 두 화면에 마크업이` | 조각 | 5행 `…달랐다.`까지 |
| 13 | `src/fsd/entities/project-token/model/connect-command.ts:5` | `이제 저장소의 .mcp.json이 아니라 ` | 조각 | 6행 `그래도 참조만 저장된다는 규칙은 같다.`를 `등록에도 참조만 저장된다.`로 바꾼다 |
| 14 | `src/fsd/entities/project-token/model/connect-command.test.ts:29` | `서버 주소를 셸로 옮기는 줄은 없앴다 — ` | 조각 |  |
| 15 | `src/fsd/features/create-project/api/create-project.server.ts:28` | `규칙을 새로 지어내는 건 이 변경의 범위 밖이다.` | 조각 |  |
| 16 | `src/fsd/features/create-project/ui/new-project-form.tsx:68` | `예전에는 붙여넣기 오류가` | 조각 | 69행 끝까지 |
| 17 | `src/fsd/features/review-gate/model/gate-source.test.ts:3` | `예전에는 뱃지가 배너 쪽을 따라가서` | 조각 | 4행 끝까지 |
| 18 | `src/fsd/pages/board-item/model/item-docs.test.ts:1` | `예전에는 라우트가` | 조각 | 2행 끝까지 |
| 19 | `src/fsd/pages/board-item/model/item-docs.ts:2` | `// 예전에는 라우트가 "Plan"·"<actor> report"를 직접 지어서` | 그 줄 | 2–3행 |
| 20 | `src/fsd/pages/project-board/model/briefing.ts:43` | `기존 화면처럼 ` | 조각 |  |
| 21 | `src/fsd/pages/user-tokens/ui/user-tokens-page.tsx:19` | `, 그 화면은 이번 변경이 건드리지 않는다` | 조각 | 앞 절 `없고`를 `없다.`로 맺는다 |
| 22 | `src/server/agents/next.ts:15` | `오늘의 ` | 조각 |  |
| 23 | `src/server/agents/next.ts:34` | `생략하면 오늘과 같은 집계다.` | 조각 | `생략하고,`를 `생략한다.`로 맺는다 |
| 24 | `src/server/agents/next.ts:91` | `예전에는 dev 템플릿의 라우터 단계가 board_get으로 보고 스스로 확인했다 —` | 조각 |  |
| 25 | `src/server/agents/next.ts:102` | `, 쿼리도 오늘 그대로다` | 조각 |  |
| 26 | `src/server/agents/runs.ts:33` | `오늘과 같은 쿼리다(hs_)` | 조각 | `토큰 전체를 센다(hs_)`로 바꾼다 |
| 27 | `src/server/mcp/tools.ts:23` | `// 예전에는 전부 unknown이라` | 그 줄 | 24행 `깨졌다.`까지. 뒤 문장(BoardRow와 같은 이유)은 남긴다 |
| 28 | `src/server/mcp/tools.ts:84` | `(기존 경로 — 분기의 첫 가지라 동작이 그대로다)` | 조각 |  |
| 29 | `src/server/mcp/tools.ts:104` | ` — 기존 호출이 그대로 통한다` | 조각 |  |
| 30 | `src/server/pipeline/board-query.ts:34` | `예전에는 expectedUpdatedAt이 actor와 무관하게 optional이라,` | 조각 | 35행 `…꺼졌다.`까지 — 35행이 비므로 그 줄도 지운다 |
| 31 | `src/server/pipeline/board-query.ts:491` | `예전에는 에이전트가 board_transition을 따로 불러야 했고,` | 조각 | 492행 `…디스패치됐다.`까지 |
| 32 | `src/server/project-identity-query.ts:29` | ` — hs_(hs_ 접두)가 첫 가지라 기존 동작이 그대로다` | 조각 |  |
| 33 | `src/server/public-url.ts:19` | `base를 따로 내보내던 serverUrl()은` | 조각 | 20행 `없앴다:`까지. 남는 말: "HARNESS_SERVER는 /harness:init이 직접 설정한다." |
| 34 | `src/server/rest-scope.ts:5` | `// 세 경로가 각자 토큰 파싱을 복제하던 모양을 여기로 모은다` | 그 줄 | 5–6행과 그 앞뒤 빈 `//` 줄 하나 |
| 35 | `src/server/rest-scope.ts:10` | `// 그래서 기존 주입 시험이 한 줄도 바뀌지 않고 통과한다.` | 그 줄 |  |
| 36 | `src/server/result.ts:1` | `예전에는 pipeline/board.ts의` | 조각 | 1행 둘째 문장부터 4행 `…없었다.`까지 |
| 37 | `src/server/templates-query.test.ts:155` | ` 위 hs_ 단언은 한 줄도 바뀌지 않는다.` | 조각 |  |
| 38 | `src/server/templates-query.ts:18` | ` — 기존 호출이 그대로 통한다` | 조각 |  |
| 39 | `src/server/agents/next.test.ts:588` | `(오늘의 집계)` | 조각 |  |
| 40 | `.gitignore:55` | `# 이 줄이 없던 동안에는` | 그 줄 |  |

### B5. 파일 이름 머리표 — 15건

| # | 위치 | 지울 것 | 단위 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | `packages/core/pipeline.mjs:1` | `packages/core/pipeline.mjs — ` | 조각 |  |
| 2 | `src/app/api/mcp/owner/route.ts:1` | `src/app/api/mcp/owner/route.ts — ` | 조각 |  |
| 3 | `src/app/api/mcp/route.ts:1` | `src/app/api/mcp/route.ts — ` | 조각 |  |
| 4 | `src/app/api/project/route.ts:1` | `src/app/api/project/route.ts — ` | 조각 |  |
| 5 | `src/app/api/projects/route.ts:1` | `src/app/api/projects/route.ts — ` | 조각 |  |
| 6 | `src/app/api/runbook/route.ts:1` | `src/app/api/runbook/route.ts — ` | 조각 |  |
| 7 | `src/app/api/templates/route.ts:1` | `src/app/api/templates/route.ts — ` | 조각 |  |
| 8 | `src/server/agents/runs.ts:1` | `runs.ts — ` | 조각 |  |
| 9 | `src/server/agents/vars.ts:1` | `vars.ts — ` | 조각 |  |
| 10 | `src/server/auth/guard.ts:1` | `guard.ts — ` | 조각 |  |
| 11 | `src/server/mcp/auth.ts:1` | `auth.ts — ` | 조각 |  |
| 12 | `src/server/mcp/deps.ts:1` | `deps.ts — ` | 조각 |  |
| 13 | `src/server/mcp/owner-deps.ts:1` | `owner-deps.ts — ` | 조각 |  |
| 14 | `src/server/mcp/owner-tools.ts:1` | `owner-tools.ts — ` | 조각 |  |
| 15 | `src/server/pipeline/run-rules.ts:1` | `src/server/pipeline/run-rules.ts — ` | 조각 |  |

### B6. 같은 문장 반복 — 1건

| # | 위치 | 지울 것 | 단위 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | `src/server/mcp/owner-tools.ts:14` | ` 런북에 번호가 없다.` | 조각 |  |

### C. 정정 대상(지우지 않고 고친다) — 22건

| # | 위치 | 지금 적힌 것 | 바꿀 문구 | 근거(03876dd 기준, 주석에 옮겨 적지 않는다) |
| --- | --- | --- | --- | --- |
| 1 | `src/fsd/features/create-project/api/create-project.server.ts:35` | `board.ts:71` | `board-query.ts propose` | board.ts는 8줄 재수출 파일이다. 미결 상한은 board-query.ts의 propose(:296) |
| 2 | `src/fsd/widgets/turn-banner/model/turn.test.ts:138` | `board.ts:368` | `board-query.ts resetRun` | board-query.ts의 resetRun(:559) |
| 3 | `src/fsd/widgets/turn-banner/model/turn.ts:188` | `board.ts:52` | `board-query.ts walkingKeys` | board-query.ts의 walkingKeys(:149) |
| 4 | `src/server/mcp/tools.ts:60` | `owner-deps.ts:19` | `owner-deps.ts의 owner` | owner-deps.ts:19는 빈 줄이다. 같은 술어는 owner(:16-17) |
| 5 | `src/server/user-scope-query.ts:7` | `owner-deps.ts:19` | `owner-deps.ts의 owner` | owner-deps.ts:19는 빈 줄이다. 같은 술어는 owner(:16-17) |
| 6 | `src/server/project-registration.ts:41` | `create-project.server.ts:26-27` | `create-project.server.ts의 branch 판단` | branch 판단 문장이 27–28행이다. 줄 번호 대신 동기화하는 판단을 가리킨다 |
| 7 | `packages/core/deliver.test.mjs:43` | `(:46이 그것을 확인한다)` | `(아래 CLAUDE.runbook.md 단언이 확인한다)` | :46은 deliverable 호출이고 단언은 :47이다. 줄 번호 대신 확인 대상을 가리킨다 |
| 8 | `packages/core/manifest.mjs:4` | `(위 주석)` | 지운다 | 위에 주석이 없다(1행 import, 2행 빈 줄) |
| 9 | `src/server/pipeline/board-rules.ts:97` | `런북 7단계` | `런북 accept 단계` | 런북 The cycle에는 7단계가 없다. 인수 등록은 accept 단계의 report_submit({ actor: "main-loop" })이다(plugin/templates/en/CLAUDE.runbook.md:106-107) |
| 10 | `src/server/pipeline/run-query.ts:1` | `src/server/pipeline/run.ts — ` | 머리표만 지운다 | 이 파일은 run-query.ts다(run.ts는 3줄 재수출 파일) |
| 11 | `src/server/pipeline/board-query.ts:143` | `// 결재함용: 최신 행 + 최근 전이 몇 개.` | 143–145행과 148행을 `latestBoardWithEvents` 함수 바로 위로 옮긴다 | 그 네 줄은 latestBoardWithEvents(:158)의 설명이다. 148행도 이벤트 별도 조회의 이유다 |
| 12 | `packages/core/pipeline.mjs:3` | `서버(run.ts)가 커서를 옮길 때` | `서버(board-query.ts·run-query.ts)가 커서를 옮기거나 세울 때` | board-query.ts의 advance(:330·:546)·cursorForStatus(:564), run-query.ts ensureRun의 cursorForStatus(:47) |
| 13 | `packages/core/transitions.mjs:22` | `board.ts가 같은 트랜잭션에서 한다` | `board-query.ts의 transitionIn이 같은 트랜잭션에서 한다` | transitionIn(:319) — acceptedAt 쓰기 :346, 백로그 복원 :356 |
| 14 | `src/fsd/widgets/turn-banner/model/turn.ts:186` | `(board.ts resetRun)` | `(board-query.ts resetRun)` | resetRun(:559) |
| 15 | `src/server/agents/runs.ts:2` | `board.ts(closeRuns)` | `board-query.ts(closeRuns)` | closeRuns(:431) |
| 16 | `src/server/mcp/tools.ts:22` | `board.ts의 select/include` | `board-query.ts의 select/include` | latestBoard 등의 select/include가 board-query.ts에 있다 |
| 17 | `src/server/mcp/tools.ts:30` | `(board.ts propose)` | `(board-query.ts propose)` | propose(:296) |
| 18 | `src/server/pipeline/board-rules.ts:30` | `(board.ts)` | `(board-query.ts transitionIn)` | 백로그 복원 :356(transitionIn 안) |
| 19 | `src/server/pipeline/board-rules.ts:118` | `board.ts의 acceptedAt 쓰기` | `board-query.ts의 acceptedAt 쓰기` | acceptedAt 쓰기 :529 |
| 20 | `prisma/schema.prisma:233` | `board.ts가 닫는다` | `board-query.ts closeRuns가 닫는다` | closeRuns(:431) |
| 21 | `prisma/schema.prisma:160` | `검토대기에서만` | `in_review에서만` | 상태 식별자는 in_review다(transitions.mjs STATUSES). board-rules.ts:67이 다른 상태의 기록을 거부한다 |
| 22 | `src/server/rest-scope.ts:58` | `(위 :46)` | `(위 slug === null 분기)` | 지금은 맞다(:46이 그 분기). 이 계획이 같은 파일의 5–6행·빈 줄·10행·29행을 지워 :46이 밀린다 |

## 부록 B. 검증 스크립트

세 파일 모두 저장소에 커밋하지 않는 일회용 검사다. 저장소 밖 디렉터리(`$CleanupScratch`)에 아래 파일 이름으로 저장하고 저장소 루트에서
[Verification Plan](#verification-plan)의 명령으로 돌린다(`typescript`는 저장소의 `node_modules`에서 푼다).

### B-1. 주석만 바뀌었는가 — `comment-only-check.mjs`

- 형 선언을 보존한 TypeScript printer 출력과 주석 없는 transpile 결과를 함께 비교한다. `.d.ts`·`.d.mts`·`.d.cts`도 printer로 비교한다.
- JS 파일의 JSDoc 블록 전체와 형 검사·린트·번들러 등 기능 표식은 보존한다. TS 형 선언 변경이나 여러 줄 JSDoc 형 변경을 "주석만"으로 통과시키지 않는다.
- CRLF/LF를 정규화하고 JSX 주석 구분자는 유지한다. 문법 오류는 실패다. 원본과 동기화한 미러 모두 검사한다.
- 비교 대상은 수정된 JS/TS 파일이다. 파일 추가·삭제·이동·종류 변경은 B-2가 거부한다. 스키마·CSS·`.gitignore`는 전체 diff를 리뷰하고 스키마는 diff와 B-3도 확인한다.

```js
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ts = createRequire(join(process.cwd(), "package.json"))("typescript");
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

export function normalized(text, fileName) {
  text = text.replace(/\r\n/g, "\n");
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  if (sf.parseDiagnostics.length) throw new Error(`parse error: ${fileName}`);
  // JS의 JSDoc은 형 계약이다. 태그 첫 줄뿐 아니라 여러 줄 형 본문도 보존한다.
  const docs = new Map();
  const visit = (node) => {
    if (/\.(mjs|cjs|jsx?)$/.test(fileName)) {
      for (const doc of node.jsDoc ?? []) docs.set(doc.pos, text.slice(doc.pos, doc.end).replace(/\r\n/g, "\n"));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // TypeScript 형 선언·형 import도 남기는 printer와 실제 실행 출력 양쪽을 비교한다.
  const emitted = /\.d\.(m|c)?ts$/.test(fileName) ? "" : ts.transpileModule(text, {
    fileName, compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, allowJs: true },
  }).outputText;
  const controls = (text.match(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g) ?? []).filter((comment) => /@ts-|eslint-|istanbul|\bc8\b|[#@]__PURE__|webpack|turbopack|@vite-ignore|@preserve|@license|source(?:Mapping)?URL/.test(comment));
  return JSON.stringify([printer.printFile(sf), emitted, [...docs].sort((a, b) => a[0] - b[0]).map(([, doc]) => doc), controls]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const base = process.argv[2];
  if (!base) throw new Error("usage: node comment-only-check.mjs <fixed-base>");
  const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=M", "-z", base], { encoding: "utf8" })
    .split("\0").filter((f) => /\.(ts|tsx|mts|cts|mjs|cjs|jsx?)$/.test(f));
  let bad = 0;
  for (const file of changed) {
    const before = execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8", maxBuffer: 64 << 20 });
    const same = normalized(before, file) === normalized(readFileSync(file, "utf8"), file);
    if (!same) bad++;
    console.log(`${same ? "same " : "DIFF "} ${file}`);
  }
  console.log(bad ? `${bad} file(s) changed more than comments` : `${changed.length} file(s): comments only`);
  process.exitCode = bad ? 1 : 0;
}
```

### B-2. 부록 A대로 적용됐는가 — `appendix-applied-check.mjs`

- A·B1–B6·C의 행 수, 순서, 코드 span, 단위와 원본 96개 파일을 검증한다. 빈 표·잘못된 표·기준 위치 drift는 실패다. 범위를 바꾸면 표와 검사기 상수도 함께 수정한다.
- 각 기준 문자열의 삭제 개수와 C표의 치환 문자열 19개의 정확한 증가 개수를 본다. 겹치는 조각과 비고에 명시된 추가 `(실측)` 삭제도 계산한다.
- 이동 행은 143–145·148행 네 줄 모두가 정정된 채 `latestBoardWithEvents` 바로 위에 정확히 한 번 있는지 확인한다. B2의 절 번호 삭제를 적용한 최종 네 줄을 검사한다.
- 원본 96개와 해당 배포 모듈의 미러 6개만 허용한다. `docs/` 전체를 예외로 두지 않고 이 제안서 하나만 제외하며, 목록 밖 미추적 파일도 거부한다. ignored 생성물은 B-3과 `npm run check`로 확인한다.
- `--preflight`는 편집 전에 기준 커밋의 218행 위치를 확인하는 모드다. 최종 적용 증명을 대신하지 않는다.
- 비고의 다음 줄 삭제·문장 맺음, 같은 파일 안의 다른 주석 보존, CSS·`.gitignore`의 실행 내용 보존은 **전체 diff 리뷰**로 확인한다. 문자열 개수 검사는 이 리뷰를 대신하지 않는다.

```js
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sizes = { A: 13, B1: 36, B2: 83, B3: 8, B4: 40, B5: 15, B6: 1, C: 22 };
const count = (text, fragment) => text.split(fragment).length - 1;
function codeSpan(cell) {
  const match = cell.match(/^(`{1,2})([\s\S]*?)\1$/);
  if (!match) throw new Error(`invalid code span: ${cell}`);
  return match[1].length === 2 ? match[2].replace(/^ | $/g, "") : match[2];
}

export function parseRows(doc) {
  const start = doc.indexOf("## 부록 A."); const end = doc.indexOf("## 부록 B.", start);
  if (start < 0 || end <= start) throw new Error("appendix headings missing");
  const rows = []; const seen = new Map(); let category;
  for (const line of doc.slice(start, end).split(/\r?\n/)) {
    const heading = line.match(/^### (A|B[1-6]|C)\./);
    if (heading) {
      category = heading[1];
      if (seen.has(category)) throw new Error(`duplicate category: ${category}`);
      seen.set(category, 0);
    }
    if (!/^\| \d+ \|/.test(line)) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, "|"));
    const at = cells[1]?.match(/^`(.+):(\d+)`$/);
    if (!category || cells.length !== 5 || !at || Number(cells[0]) !== seen.get(category) + 1) throw new Error(`invalid appendix row: ${line}`);
    seen.set(category, Number(cells[0]));
    const frag = codeSpan(cells[2]); if (!frag) throw new Error("empty anchor");
    if (category !== "C" && !["주석 통째", "그 줄", "조각"].includes(cells[3])) throw new Error(`unknown unit: ${cells[3]}`);
    if ((cells[3] === "조각" || cells[3] === "머리표만 지운다") && frag.startsWith("//")) throw new Error("fragment must preserve //");
    let move = null; let replace = null;
    if (category === "C") {
      const moving = cells[3].match(/^(\d+)–(\d+)행과 (\d+)행을 `(\w+)` 함수 바로 위로 옮긴다$/);
      if (moving) move = { symbol: moving[4], lines: [...Array(Number(moving[2]) - Number(moving[1]) + 1)].map((_, i) => Number(moving[1]) + i).concat(Number(moving[3])) };
      else if (cells[3].startsWith("`")) replace = codeSpan(cells[3]);
      else if (!["지운다", "머리표만 지운다"].includes(cells[3])) throw new Error(`unknown correction: ${cells[3]}`);
    }
    const extraRemove = /`?\(실측\)`?도 지우고/.test(cells[4]) ? ["(실측)"] : [];
    rows.push({ category, id: Number(cells[0]), file: at[1], line: Number(at[2]), frag, move, replace, extraRemove, unit: category === "C" ? null : cells[3], notes: cells[4] });
  }
  for (const [label, size] of Object.entries(sizes)) if (seen.get(label) !== size) throw new Error(`row count: ${label} ${seen.get(label) ?? 0}/${size}`);
  if (new Set(rows.map((r) => r.file)).size !== 96) throw new Error("expected 96 source files");
  return rows;
}

export function evaluate(rows, readBase, readNow, changedFiles) {
  const problems = [];
  if (rows.length !== 218) return { anchors: 0, problems: ["expected 218 rows"] };
  const groups = new Map();
  for (const r of rows) {
    if (!readBase(r.file).split(/\r?\n/)[r.line - 1]?.includes(r.frag)) problems.push(`baseline drift: ${r.file}:${r.line}`);
    const key = `${r.file}\n${r.frag}`; groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const rs of groups.values()) {
    const { file, frag, move } = rs[0]; const before = readBase(file); const now = readNow(file);
    if (move) {
      const lines = before.split(/\r?\n/);
      const block = move.lines.map((line) => {
        let value = lines[line - 1];
        for (const r of rows.filter((r) => r.file === file && r.line === line && !r.move)) value = value.replace(r.frag, r.replace ?? "");
        return value.trim();
      });
      const current = now.split(/\r?\n/); const at = current.findIndex((line) => new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?function ${move.symbol}\\b`).test(line));
      if (at < block.length || current.slice(at - block.length, at).map((line) => line.trim()).join("\n") !== block.join("\n") || block.some((line) => count(now, line) !== 1)) problems.push(`move not applied: ${file} -> ${move.symbol} (all ${block.length} lines exactly once)`);
      continue;
    }
    const removed = rows.filter((r) => r.file === file && !r.move).reduce((n, r) => n + count(r.frag, frag) + r.extraRemove.reduce((sum, part) => sum + count(part, frag), 0), 0);
    const added = rows.filter((r) => r.file === file && r.replace).reduce((n, r) => n + count(r.replace, frag), 0);
    const want = count(before, frag) - removed + added; const got = count(now, frag);
    if (want < 0 || got !== want) problems.push(`not applied: ${file} «${frag}» (found ${got}, want ${want})`);
    const { replace } = rs[0];
    if (replace) {
      const need = count(before, replace) + rows.filter((r) => r.file === file && r.replace === replace).length;
      if (count(now, replace) !== need) problems.push(`replacement count: ${file} «${replace}»`);
    }
  }
  const allowed = new Set(rows.map((r) => r.file));
  for (const file of [...allowed]) if (file.startsWith("packages/core/") && file.endsWith(".mjs") && !file.endsWith(".test.mjs")) allowed.add(file.replace("packages/core/", "plugin/lib/"));
  for (const file of changedFiles) if (!allowed.has(file)) problems.push(`unexpected change: ${file}`);
  return { anchors: groups.size, problems };
}

export function preflight(rows, readBase) {
  for (const r of rows) if (!readBase(r.file).split(/\r?\n/)[r.line - 1]?.includes(r.frag)) throw new Error(`baseline drift: ${r.file}:${r.line}`);
  return `${rows.length} rows / ${new Set(rows.map((r) => r.file)).size} files: baseline anchors match`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [base, docPath] = process.argv.slice(2);
  if (!base || !docPath) throw new Error("usage: node appendix-applied-check.mjs <fixed-base> <proposal.md>");
  const rows = parseRows(readFileSync(docPath, "utf8")); const cache = new Map();
  const readBase = (file) => {
    if (!cache.has(file)) cache.set(file, execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8", maxBuffer: 64 << 20 }));
    return cache.get(file);
  };
  const readNow = (file) => existsSync(file) ? readFileSync(file, "utf8") : "";
  if (process.argv.includes("--preflight")) {
    console.log(preflight(rows, readBase));
  } else {
  const gitPaths = (args) => execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
  const changed = [...new Set([...gitPaths(["diff", "--name-only", "-z", base]), ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z"])])].filter((file) => file !== docPath);
  const { anchors, problems } = evaluate(rows, readBase, readNow, changed);
  const forbidden = execFileSync("git", ["diff", "--name-status", "--diff-filter=ACDRTUXB", base, "--", ".", `:(exclude)${docPath}`], { encoding: "utf8" });
  if (forbidden.trim()) problems.push(`forbidden file operation: ${forbidden.trim()}`);
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(problems.length ? `${problems.length} problem(s) in ${rows.length} rows` : `${rows.length} rows (${anchors} anchors) applied; ${changed.length} changed file(s), none outside the list`);
  process.exitCode = problems.length ? 1 : 0;
  }
}
```

### B-3. 생성 클라이언트의 실제 본문 — `generated-schema-check.mjs`

준비 단계에서 생성한 `src/generated/prisma` 디렉터리 전체를 `client-base`에 보관하고 구현 뒤 실제 생성 디렉터리와 비교한다.
TypeScript AST로 `internal/class.ts`의 `inlineSchema` 문자열과 `config.runtimeDataModel = JSON.parse(...)`를 읽는다.
`inlineSchema` 전체가 기준 문자열에 정정 3건만 적용한 결과와 정확히 같아야 한다. 문구가 존재해도 스키마가 잘렸거나 다른 내용이면 실패다.
모델 JSON 구조, 생성 경로 26개(모델 18개), `class.ts`에서 해당 문자열 밖의 본문, 나머지 25개 파일도 모두 보존한다.
`class.ts` 파싱에서는 CRLF/LF를 정규화하고 다른 파일은 바이트로 비교한다. 기준 사본과 최종 생성물은 같은 generator output 설정에서 생성한다.
빌드 뒤에도 같은 실제 디렉터리를 검사한다. 생성 파일을 직접 편집하지 않는다.

```js
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const ts = createRequire(join(process.cwd(), "package.json"))("typescript");

export function artifact(file) {
  const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  assert.equal(sf.parseDiagnostics.length, 0);
  let inlineSchema; let schemaRange; let model;
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(sf).replaceAll('"', "") === "inlineSchema") {
      assert.equal(inlineSchema, undefined, "duplicate inlineSchema");
      assert.ok(ts.isStringLiteral(node.initializer)); inlineSchema = node.initializer.text;
      schemaRange = [node.initializer.getStart(sf), node.initializer.end];
    }
    if (ts.isBinaryExpression(node) && node.left.getText(sf) === "config.runtimeDataModel") {
      assert.equal(model, undefined, "duplicate runtimeDataModel assignment");
      assert.ok(ts.isCallExpression(node.right) && node.right.expression.getText(sf) === "JSON.parse");
      assert.ok(ts.isStringLiteral(node.right.arguments[0])); model = JSON.parse(node.right.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf); assert.ok(inlineSchema && model, "missing inlineSchema/runtimeDataModel");
  const outsideSchema = source.slice(0, schemaRange[0]) + '"<inlineSchema>"' + source.slice(schemaRange[1]);
  return { inlineSchema, model, outsideSchema };
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.ok(entry.isDirectory() || entry.isFile(), `unexpected generated entry: ${entry.name}`);
    return entry.isDirectory() ? files(join(directory, entry.name)).map((file) => `${entry.name}/${file}`) : [entry.name];
  }).sort();
}

export function compare(beforeRoot, afterRoot) {
  const beforeFiles = files(beforeRoot); const afterFiles = files(afterRoot);
  assert.equal(beforeFiles.length, 26, "baseline generated file count changed");
  assert.equal(beforeFiles.filter((file) => file.startsWith("models/") && file.endsWith(".ts")).length, 18, "baseline model count changed");
  assert.deepEqual(afterFiles, beforeFiles, "generated path set changed");
  const before = artifact(join(beforeRoot, "internal/class.ts")); const after = artifact(join(afterRoot, "internal/class.ts"));
  assert.deepEqual(after.model, before.model, "runtimeDataModel changed");
  let expectedSchema = before.inlineSchema;
  for (const [old, replacement] of [["(ApcH 결과: 두 줄 누적 규칙)", ""], ["검토대기에서만", "in_review에서만"], ["board.ts가 닫는다", "board-query.ts closeRuns가 닫는다"]]) {
    assert.equal(expectedSchema.split(old).length - 1, 1, `baseline schema drift: ${old}`);
    expectedSchema = expectedSchema.replace(old, replacement);
  }
  assert.ok(after.inlineSchema === expectedSchema, "inlineSchema differs beyond the 3 approved corrections");
  assert.ok(after.outsideSchema === before.outsideSchema, "class.ts changed outside inlineSchema");
  for (const file of beforeFiles.filter((file) => file !== "internal/class.ts")) {
    assert.ok(readFileSync(join(afterRoot, file)).equals(readFileSync(join(beforeRoot, file))), `generated content changed: ${file}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [beforeRoot, afterRoot] = process.argv.slice(2);
  assert.ok(beforeRoot && afterRoot, "usage: node generated-schema-check.mjs <base-client-directory> <new-client-directory>");
  compare(beforeRoot, afterRoot);
  console.log("inlineSchema: all 3 corrections applied; runtimeDataModel unchanged; other generated content unchanged");
}
```

## 부록 C. 손대지 않을 주석

### C-1. `.mjs`의 JSDoc 형 주석 — 9개

`@type`·`@param`·`@returns`·`@typedef` 태그가 든 `/** */` 주석 9개 — `packages/core/backlog.mjs`·`deliver.mjs`·`entitlement.mjs`(와 `plugin/lib`의 복사본). `tsconfig.json:5`가 `allowJs: true`라
TS 호출부는 이 태그로 `.mjs` export의 형을 얻는다. 지우면 호출부의 형이 바뀐다.

### C-2. 마이그레이션 SQL의 `--` 주석 — 67줄, 14개 파일

이미 적용된 마이그레이션은 파일 바이트가 판정에 쓰인다. Prisma 스키마 엔진은 적용 뒤 바뀐 마이그레이션을 "was modified after it was
applied"로 알리고(문구는 `node_modules/@prisma/engines`의 엔진에서 확인), 복구 스크립트는 SQL의 sha256과 `_prisma_migrations.checksum`을 대조한다
(`scripts/restore-project-ownership-shadow.ts:45-46`, `:96`). 통합 시험은 이 파일을 그대로 실행하고
(`tests/server/integration/migration.test.ts:28`, `:67`, `:110`), `scripts/project-availability-cleanup.test.ts:84-92`도
cleanup SQL을 읽는다.

### C-3. `prisma/migrations/migration_lock.toml`

Prisma가 만든 파일이다("Please do not edit this file manually").

### C-4. 소스 텍스트를 읽는 시험

후보 줄 중 아래 단언에 걸리는 것은 없다. 주석을 더 지우는 후속 작업이 생기면 이 목록부터 본다.

- `src/server/project-slug-rule-sync.test.ts:13-16` — `project-slug-rule.ts`·`create-project/model/project-slug.ts`·
  `create-project/model/repo-url.ts`의 `export const` 줄을 끝 `;`까지 정규식으로 읽어 비교한다. 그 줄에 끝 주석을 붙이거나 떼면 비교가 바뀐다.
- `tests/server/project-connection-bindings.test.ts:36-52` — 여러 파일의 텍스트를 `assert.match`로 본다. 주석 안 문자열이
  단언을 대신 채우고 있었다면 지울 때 드러난다.
- `tests/server/inbox-card-boundary.test.ts:46-47` — `review-gate/index.server.ts`와 `project-inbox-page.tsx`의 export·import 줄.
- `scripts/retired-copy.test.mjs:75-84`의 `shownText` — 주석을 떼고 보므로 주석 정리와 무관하다.
- transpile해서 실행하는 시험(`tests/server/project-history.test.ts:25-26`, `tests/server/project-registration.test.ts:26`,
  `tests/server/review-gate-actions.test.ts:12`, `tests/server/automatic-scout-actions.test.ts:11-12`,
  `src/fsd/shared/ui/copy-button.test.ts:26`, `src/fsd/features/manage-project-connection/ui/project-connection-control.test.ts:44-45`,
  `src/fsd/features/edit-pipeline/ui/automatic-scout-control.test.ts:38-39`) — 주석은 실행 결과에 영향이 없다.

### C-5. `plugin/lib/*.mjs`

`packages/core`의 복사본이다. 직접 고치지 않는다 — 린트도 이 디렉터리를 뺀다(`eslint.config.mjs:17`). 원본을 고치고
`npm run sync:plugin-lib`로 맞추며, `npm run check`의 첫 단계(`scripts/plugin-lib.mjs --check`)가 어긋남을 잡는다.

### C-6. 이번 범위 밖의 주석 표식

- `docs/` Markdown의 `<!-- copy-lock:<id> -->`·`<!-- /copy-lock -->` — 시험이 읽는다(`docs/conventions/product-copy.md:11`).
- `plugin/templates/` — gitignore된 별도 private 저장소. 에이전트가 읽는 본문이라 주석도 지시가 될 수 있다.
