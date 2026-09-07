---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-07"
approved-by: "Sangeok"
approved-at: "2026-09-07"
approval-scope: "전체 — 묶음 A·B1·B2, C1(b) 삭제, C2(b) 삭제, C3(a) 정책 유지. tools.ts 구성 타입 7개는 유지"
completed-at: "2026-09-07"
verification-summary: "묶음 A·B1·B2·C1(b)·C2(b) 실행, C3(a)는 변경 없음. 커밋 5개. npm run check(19/19)·npm test(112/112)·npm run test:web(142/142)·npm run test:templates(16/16)·npm run build 전부 통과, tsc --noUnusedLocals 오류 1건→0건. 테스트 수 감소(123→112, 157→142)는 함께 지운 테스트 파일 3개의 26건이다. 신규 실패 없음."
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related:
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-09-02-src-clean-code-findings.md"
  - "docs/proposals/completed/2026-09-06-scripts-tooling-cleanup.md"
  - "docs/investigations/active/harness-platform.md"
---

# 미사용·불필요 코드 제거 후보

## Summary

`dev` `a9b4bf2`(2026-09-07) 기준으로 저장소 전체(`src` git 추적 `.ts/.tsx/.mjs` 146파일 6,844 LOC, `packages/core`,
`plugin`, `scripts`, `public`, `prisma`)에서 **어디서도 쓰이지 않는 코드와 자산**, 그리고 **내부에서만
쓰이는데 공개 API로 열려 있는 export**를 찾았다. 도구(knip, `tsc --noUnusedLocals`)가 낸 후보 전부를
저장소 전역 참조 검색으로 하나씩 대조해 오탐을 걸러냈다.

결과는 세 묶음이다. **묶음 A** — 소비자가 0인 것 4건(스캐폴드 SVG 5개, 미사용 import 1, 죽은 함수 1,
죽은 export 1): 바로 지워도 된다. **묶음 B** — slice 밖에서 아무도 안 쓰는 barrel re-export 16줄과
파일 안에서만 쓰이는 `export` 18개 심볼: `fsd.md`의 "공개할 symbol을 명시한다" 규칙에 따라 공개 API에서
뺀다. **묶음 C** — 코드는 죽어 있지만 문서가 의도를 남긴 3건(`deriveJourney`, Phase 2 임포트 모듈 2개,
플러그인 복사본 배포 정책): 승인자의 결정이 필요하다.

**의존성·`src` 파일 단위·CSS 토큰·TODO/억제 주석에서는 미사용이 나오지 않았다.** 이 문서는 발견
등록부이자 실행 제안서다 — 이번 패스에서 코드는 바꾸지 않았다.

## Goal

- 소비자가 없는 코드·자산을 근거(파일:줄) 있는 형태로 등록하고 삭제한다.
- slice public API를 실제 외부 소비자에 맞게 좁힌다(`fsd.md` §Public API).
- 코드는 죽었으나 문서가 의도를 남긴 항목은 "배선/삭제/유지"를 결정해 문서와 코드를 일치시킨다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 삭제 작업이다(강제 조건).
- `public/` 자산이 포함된다(강제 조건).
- barrel export 변경이 포함된다(강제 조건).
- 5개를 훨씬 넘는 파일이 대상이다.

## Current State

### 감사가 돌아간 방식

| 단계 | 명령/방법 | 결과 |
| --- | --- | --- |
| 1 | `npx knip@6.34.0 --reporter compact` (설정 없음) | 미사용 파일 5 · 의존성 1 · export 20 · 타입 20 후보 |
| 2 | `DATABASE_URL=<placeholder> npx prisma generate && npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | `src/generated` 제외 **오류 1건** — `billing/page.tsx:5` |
| 3 | 후보 심볼마다 `grep -rnw <symbol>` (ts/tsx/mjs/md, `node_modules`·`.next`·`src/generated` 제외) — 정의 파일·barrel·테스트·`plugin/lib` 복사본·문서 참조를 분리해 표기 | 아래 오탐 3건 제거, 나머지 확정 |
| 4 | 테스트가 아닌 모든 모듈에 대해 "테스트 외 importer" 존재 여부 검사 | `packages/core/backlog-md.mjs`·`board-md.mjs` 둘만 importer 0 |
| 5 | `package.json` 의존성 14개의 소스 참조 grep | 전부 사용 중 |
| 6 | `public/*.svg` 파일명, `examples/`, CSS 토큰·클래스, Prisma 모델·필드, `TODO|FIXME|eslint-disable|@ts-ignore|주석 처리된 코드` grep | 아래 §"검토했으나 제안하지 않음" |

knip은 `.gitignore`를 따르므로 `src/generated/`를 보지 못하고, `prisma.config.ts`가 `DATABASE_URL`을
즉시 요구해 Prisma 플러그인이 실패한다. 그래서 knip 출력은 **후보**로만 쓰고 3단계로 전부 대조했다.

### knip 오탐(제안에서 제외)

| knip 보고 | 실제 |
| --- | --- |
| 의존성 `@prisma/client` 미사용 | 생성 클라이언트가 `@prisma/client/runtime/client`를 import한다(`src/generated/prisma/client.ts:18`, `internal/class.ts:14`). 런타임 필수 |
| `packages/core/manifest.mjs: buildLock` 미사용 | `plugin/bin/harness-init.mjs:11`이 복사본 `plugin/lib/manifest.mjs`에서 import한다 |
| `prisma/schema.prisma` 미사용 파일 | Prisma 플러그인 로드 실패의 부산물 |

`plugin/lib/*`에 대한 보고(미사용 export 14개, 미사용 파일 4개)는 복사본에 대한 것이다 — `plugin/lib`는
`packages/core`의 바이트 동일 사본이라(`scripts/plugin-lib.mjs --check`) 판단은 원본 기준으로만 했다. 원본에서도
미사용인 export는 B2(`RUNBOOK`·`RUNBOOK_FREE`·`AXES`)에, 플러그인이 import하지 않는 파일은 C2·C3에 있다.
이 보고는 제거 후에도 knip에 그대로 남는다.

### 확인된 미사용 코드의 성격

- **묶음 A**는 `create-next-app` 잔재(SVG), Phase 4 제안서에 계획됐지만 배선되지 않은 함수
  (`limitsForProject`), 로그아웃 UI가 없어 소비자가 없는 `signOut`, 그리고 상단 import 잔재다.
- **묶음 B**는 slice 안에서 상대 경로로 쓰이는 심볼을 barrel이 함께 공개한 경우다.
  `features/review-gate/index.ts:1`은 "slice 밖에서 실제로 쓰는 것만 공개한다"고 적어 두고도 3개를
  더 공개하고 있다.
- **묶음 C**는 2026-09-02 제안서 F20이 옮겨 둔 `deriveJourney`(런타임 소비자 여전히 0), 미착수
  Phase 2를 위해 미리 이식한 파서 2개, 그리고 그 파서까지 사용자 저장소로 배포하는 복사본 정책이다.

## Scope

포함 범위:

- `src/`(`src/generated` 제외), `packages/core`, `plugin/bin`·`plugin/lib`, `scripts`, `public`
- 소비자 0인 심볼·파일·자산, slice 외부 소비자 0인 barrel export, 파일 내부에서만 쓰이는 `export`
- 코드는 죽었으나 문서가 의도를 남긴 항목의 결정 요청

제외 범위:

- `src/generated/`(생성물, git 미추적), `plugin/templates/`(private 저장소)
- Prisma 스키마 변경 — `Command` 모델·`Project.executorKind`·`commandIssue`는 아래 §"검토했으나 제안하지
  않음"에 기록만 한다(Phase 3 예약, `invariants.md:27`)
- 코드 품질(응집·결합·가독성) 일반 — 2026-09-02·09-05·09-06 제안서가 다뤘다
- 문서 정리(`docs/**/.gitkeep` 8개 중 5개가 비어 있지 않은 폴더에 남아 있음 — 나머지 3개는 빈 폴더 유지용, `docs/proposals/README.md` 인벤토리
  명령의 경로가 `proposals/`로 적혀 있음) — 코드가 아니라 이 문서 범위 밖
- `docs/investigations/active/harness-platform.md`의 `board-md`·`backlog-md`·`journey` 언급(`:261-262` 트리 등 여러 곳) —
  조사 문서는 source of truth가 아니다(AGENTS.md는 `docs/architecture/`만 지정). C1·C2 실행 시 갱신하지 않는다

## Proposal

### 묶음 A — 소비자 0. 삭제 (4건, Should)

**A1 — `public/` 스캐폴드 SVG 5개** · `public/file.svg` `globe.svg` `next.svg` `vercel.svg` `window.svg`
`f04c4ef`(Create Next App 초기 커밋)에서 왔다. 저장소 전체(`src`·`docs`·설정 포함)에 파일명 참조가
없다. `src/app/favicon.ico`는 Next.js 규약 파일이라 대상이 아니다.
→ 5개 파일 삭제.

**A2 — 미사용 import** · `src/app/(app)/billing/page.tsx:5`
`planForUser`를 import하지만 본문은 `loadHeaderUser`가 돌려준 `user.plan`을 쓴다. `tsc --noUnusedLocals`가
낸 유일한 오류다.
→ 5행 삭제.

**A3 — 죽은 함수와 타입** · `src/server/entitlement.ts:28-30` `limitsForProject`, `:9` `Limits`
Phase 4 제안서(`2026-09-04-…-entitlement.md:264`)가 만들기로 한 함수지만 아무 데서도 부르지 않는다.
상한 검사는 전부 `@harness/core/entitlement.mjs`의 `withinLimit`·`capError`가 `planForProject` 결과를
직접 받아 한다(`src/server/mcp/deps.ts:2,7`). `Limits`는 이 함수의 반환 타입으로만 쓰인다. 둘을 지우면 `:5`의 `limitsFor` import도 소비자가 없어진다 —
같은 커밋에서 import 목록에서 함께 뺀다(eslint-config-next는 `no-unused-vars`를 `warn`으로 두므로 lint가 막지는 않지만,
지우는 코드의 import를 남기는 것이 이 제안의 취지와 어긋난다).
→ 함수·타입·`:5`의 `limitsFor` import 삭제.

**A4 — 죽은 export** · `src/server/auth/index.ts:7,9` `signOut`
`signIn`은 `src/app/page.tsx:3`·`login/page.tsx:3`, `handlers`는 `api/auth/[...nextauth]/route.ts:2`가
쓴다. `signOut`은 소비자가 없다 — 로그아웃 UI가 없다.
→ 구조 분해와 export에서 제거. 로그아웃을 만들 때 다시 연다.

### 묶음 B — 공개 API 좁히기 (Should: B1 / Consider: B2)

**B1 — slice 밖 소비자가 0인 barrel re-export 16줄** · 10개 `index.ts`
아래 심볼은 모두 slice 내부에서 상대 경로로 쓰이고(또는 자기 파일 안에서만 쓰이고), `@/fsd/<slice>`로
가져가는 외부 소비자가 없다. `fsd.md:101` "공개할 symbol을 명시한다"에 따라 줄에서 해당 심볼만 뺀다
(같은 줄의 다른 심볼은 소비자가 있으니 남긴다). 심볼이 모두 빠지는 줄은 줄 자체를 지운다.

| barrel | 줄 | 뺄 심볼 | 남길 심볼 | 내부 사용처 |
| --- | --- | --- | --- | --- |
| `src/fsd/entities/board-item/index.ts` | 1 | `toBoardItem` | `toBoardSections` | `model/board-item.ts:25` |
| 〃 | 5 | `STATUS_LABEL` | `statusLabel` | `model/status-label.ts:15` |
| 〃 | 9-10 | `deriveJourney`, `JourneyActor` `JourneyStage` `JourneyView` `StageState` | — | **C1로 이관** |
| `src/fsd/entities/project-token/index.ts` | 2 | `connectCommands` | — | `ui/token-reveal.tsx:4` |
| 〃 | 3 | `ConnectCommand`, `ShellKind` | — | `model/connect-command.ts` 안 |
| `src/fsd/features/create-project/index.ts` | 2 | `SLUG_HINT`, `SLUG_MAX` | — | `ui/new-project-form.tsx:10`, `model/repo-url.ts:3` |
| 〃 | 3 | `CreateProjectState` | — | `ui/new-project-form.tsx:9`, `api/create-project.server.ts:8` |
| `src/fsd/features/edit-backlog/index.ts` | 4 | `BacklogFormState` | `BacklogFormAction`, `RemoveBacklogAction` | `api/edit-backlog.server.ts:10` |
| `src/fsd/features/review-gate/index.ts` | 4 | `needsHumanDecision` | `isGateSource`, `pendingInboxCount` | `model/inbox-item.ts:5`, `model/gate-source.ts:39` |
| 〃 | 5 | `toInboxItems` | — | `api/inbox-data.server.ts:5` |
| 〃 | 6 | `TransitionInput` | `DiscardAction`, `InboxItem`, `TransitionAction` | `api/review-gate.server.ts:7` |
| `src/fsd/pages/board-item/index.ts` | 2 | `BoardItemView`, `ItemDoc`, `TimelineEvent` | — | `ui/board-item-page.tsx`, `model/item-docs.ts:5` |
| `src/fsd/pages/project-list/index.ts` | 2 | `ProjectSummary` | — | `ui/project-list-page.tsx` 안 |
| `src/fsd/pages/project-tokens/index.ts` | 2 | `TokenRow` | — | `ui/project-tokens-page.tsx` 안 |
| `src/fsd/widgets/app-header/index.ts` | 2 | `HeaderProject` | — | `api/app-header.server.ts:6` |
| `src/fsd/widgets/turn-banner/index.ts` | 3 | `deriveTurn`, `nextStepLine`, `HEADLINE` | — | `api/turn-data.server.ts:6`, `ui/turn-banner.tsx:11`, `model/turn.ts` 안 |
| 〃 | 4 | `NextStep` `SetupState` `SetupStep` `Turn` `TurnItem` | — | `ui/*`, `api/*`, `model/turn.ts` 안 |

주의 둘:
- `HEADLINE`은 랜딩이 가져가라고 열어 둔 것으로 보이지만(2026-09-02 F21), 랜딩은 Client Component를
  모듈 그래프로 끌어오지 않기 위해 **의도적으로 import하지 않고** 값을 복제했다
  (`src/fsd/pages/landing/ui/landing-page.tsx:144-148` 주석). 의도된 소비자가 거절한 export다.
- `pages/*`의 props 타입(`ProjectSummary`·`TokenRow`·`BoardItemView`…)은 라우트가 객체 리터럴로
  넘겨 추론에 맡기고 있어 지금은 소비자가 없다. 라우트가 명시 주석을 원하면 그때 다시 연다.

빈 barrel이 되는 slice는 없다 — 모든 barrel에 export가 남는다. 참고로 검사기의 `fsd/public-api-required`는
index 파일의 존재만 보고 내용은 보지 않으므로(`verify-fsd-boundaries.mjs:363-399`) 이 변경을 잡지도, 막지도 않는다.

**B2 — 파일 안에서만 쓰이는 `export` 18개 심볼(10개 파일)** · Consider
바깥 소비자가 없는 심볼의 `export` 키워드만 뗀다. 동작 변화 없음. barrel을 거치지 않는 module-level
export는 `fsd.md`가 규제하지 않으므로 선택 사항이다. 마지막 두 행은 `packages/core` 원본이라 고친 뒤
`plugin/lib` 복사본 동기화가 따라야 한다(실행 계획 3).

| 파일:줄 | 심볼 | 내부 사용 |
| --- | --- | --- |
| `src/fsd/shared/routes/billing.ts:3` | `BILLING_PATH` | `billingPath()`(:5-7)만. 외부는 `billingPath`를 쓴다(`app-header.tsx:4`) |
| `src/fsd/shared/ui/field.tsx:6` | `INPUT_CLASS` | `Input`·`Textarea`(:11,15)만 |
| `src/server/agents/steps.ts:21` | `DERIVED_REQUIREMENTS` | `REQUIREMENTS`(:22)만 |
| `src/server/pipeline/board-rules.ts:81` | `MAIN_LOOP` | `knownReporter`(:83)만 |
| `src/server/pipeline/board-rules.ts:12` | `RuleKind` | `Rule`(:15)만. 화면 쪽은 `features/review-gate/model/gate-source.ts:10`에 자기 `RuleKind`를 두고 테스트(`gate-source.test.ts:15-28`)로 묶는다 — fsd는 `src/server`를 import할 수 없어서다 |
| `src/server/public-url.ts:2` | `publicUrl` | `mcpUrl`(:6)만. 두 라우트가 `mcpUrl`을 쓴다 |
| `src/server/agents/next.ts:32` | `RunRow` | 같은 파일 `:40-41`만 |
| `src/fsd/pages/project-board/model/briefing.ts:10` | `Tone` | 같은 파일 `:23,29,126,138,175`만. 원래 소비자 sprites는 이미 제거됨(Phase 0·1 제안서 `:1603`) |
| `src/server/mcp/tools.ts:14,20,24,25,27,31,32` | `WorkspaceInput` `ProjectView` `BacklogView` `BacklogWithStatusView` `BoardItemView` `BoardRowView` `BoardDetailView` | `ToolDeps`(:37)의 구성 타입. `deps.ts:10`은 `ToolDeps`만 import한다. 계약의 구성 타입을 공개하는 것은 합리적 선택일 수 있어 **유지도 무방** |
| `packages/core/deliver.mjs:7-8` | `RUNBOOK`, `RUNBOOK_FREE` | `deliverable`(:29,35)만. src·plugin·scripts 어디도 안 씀 |
| `packages/core/entitlement.mjs:15` | `AXES` | `withinLimit`·`capReason`(:25,33)만 |

### 묶음 C — 결정 필요 (3건)

**C1 — `deriveJourney` 여정 스테퍼** · `src/fsd/entities/board-item/model/journey.ts`(97줄) ·
`journey.test.mjs`(131줄) · barrel `index.ts:9-10`
런타임 소비자 0 — 부르는 곳은 자기 테스트뿐이다. 2026-09-02 F20이 `pages/project-board`에서 여기로
내렸지만 배선은 되지 않았다. `docs/conventions/product-copy.md:214-217`은 "7-stage model … stays in
`deriveJourney` for the item page"라고 적어 두었는데, 항목 페이지(`pages/board-item/ui/board-item-page.tsx`)는
이 함수를 부르지 않는다. 즉 **문서는 배선 의도를, 코드는 미배선을** 말한다.
`docs/architecture/sources.md:14`의 ApcH 매핑 행(`{journey,briefing,desk-commands,sprites}.ts`)도 journey를 포함한다.
→ 결정지 셋: (a) 항목 페이지에 배선 (b) 파일 2개 + barrel 2줄 삭제하고 `product-copy.md` §6 문장을
"removed" 로, `sources.md:14`의 변환 열 끝에 "journey 제거(`a9b4bf2`)"를 덧붙여 갱신 (c) 유지 — 그 경우 barrel에서만 빼고 다음 클린코드 패스에 다시 올린다.
**권고: (b).** 7단계 스테퍼는 design v4에서 보드에서 빠졌고(같은 문서 §6), 두 패스 연속 소비자가 없다.
git에 남으니 필요하면 되살린다.

**C2 — Phase 2 임포트 전용 파서** · `packages/core/backlog-md.mjs`(16줄) · `board-md.mjs`(41줄) ·
테스트 2개(211줄) · 복사본 `plugin/lib/backlog-md.mjs`·`board-md.mjs`
두 파일 머리말이 "임포트 전용 / Phase 2 임포트 전용"이라고 밝힌다. 소비자로 계획된
`scripts/import-apch.mjs`(`harness-platform.md:1151`)는 존재하지 않고, Phase 2는 "착수 시 별도 계획서"
상태다. 테스트 외 importer 0.
`docs/architecture/sources.md:12`는 ApcH `board.ts`의 도착지로 `packages/core/board-md.mjs`를 적고 있다 — 아키텍처
문서는 source of truth(AGENTS.md)라 삭제와 같은 커밋에서 그 행의 새 위치 열을 "제거됨(`a9b4bf2`에서 복구)"로 고친다.
→ 결정지 둘: (a) Phase 2 착수까지 유지 (b) 삭제 — 착수 시 `a9b4bf2`에서 되살린다.
**권고: (b).** 순수 모듈이라 되살리기가 `git checkout <commit> -- <path>` 두 번이고, 남겨 두면 C3의
배포 문제가 그대로 남는다. 삭제하면 `npm run sync:plugin-lib`이 복사본 2개를 자동으로 지운다
(`scripts/plugin-lib.mjs:35`의 orphan 처리).

**C3 — 플러그인이 import하지 않는 복사본 배포** · `scripts/plugin-lib.mjs:9` `isDeliverable`
동기화 정책은 "core의 모든 `.mjs`"다. 그런데 `plugin/bin/harness-init.mjs:8-13`이 import하는 것은
`config` `deliver` `entitlement` `manifest` `render` `vars` 여섯이고, core 내부 import도
`deliver→entitlement`, `config→entitlement`뿐이다(`packages/core/*.mjs` 헤더 확인). 따라서
`plugin/lib/backlog-md.mjs`·`board-md.mjs`·`token.mjs`·`transitions.mjs`(합 109줄)는 사용자 저장소에
설치되지만 실행되지 않는다. `token.mjs`는 토큰 해시 — 서버 전용 코드가 사용자 쪽에 배포되는 셈이다.
→ 결정지 둘: (a) 정책 유지(단순함 우선, C2 채택 시 남는 건 `token`·`transitions` 2개) (b) `isDeliverable`을
harness-init의 import 목록 기준 allowlist로 바꾸고 `plugin-lib.test.mjs`·`verification.md` 표를 갱신.
**권고: (a) + C2(b).** 옵션 (b)는 목록을 손으로 유지해야 하고 private 템플릿이
`$CLAUDE_PLUGIN_ROOT/lib/*`를 참조할 가능성을 먼저 배제해야 한다(아래 리스크). 2개 파일 52줄은
정책을 복잡하게 만들 만큼의 비용이 아니다.

### 검토했으나 제안하지 않음 (문제 없음 또는 범위 밖)

| 검토 대상 | 결과 |
| --- | --- |
| npm 의존성 14개(`@modelcontextprotocol/server` `@prisma/adapter-pg` `@prisma/client` `clsx` `mcp-handler` `next-auth` `server-only` `sonner` `tailwind-merge` `zod` `dotenv` `tsx` `@tailwindcss/postcss` `tailwindcss`) | 전부 소스에서 참조됨. **미사용 의존성 없음** |
| `src/` 파일 단위 미사용 | 0 — knip 미사용 파일 목록에 `src/*` 없음, importer 분석에서도 `src/*`는 전부 importer 있음 |
| `TODO` `FIXME` `XXX` `HACK` `@deprecated` `eslint-disable` `@ts-ignore` `@ts-expect-error` 주석 처리된 코드 | 0건 |
| `src/app/globals.css` 토큰·클래스(`--color-*` 12개, `.type-display`, `.animate-breathe`, 폰트 변수 2개) | 전부 `src/**/*.tsx`에서 사용 |
| `examples/apch/harness.json` | 테스트 4개가 읽는다(`packages/core/config.test.mjs:6`, `vars.test.mjs:7`, `plugin/bin/harness-init.test.mjs:13`, `src/server/agents/vars.test.ts:12`) |
| `src/proxy.ts` | Next.js 16 `proxy` 규약 파일. `proxy`·`config` export는 프레임워크가 읽는다 |
| `src/fsd/shared/ui/chip.tsx:6` `ChipTone` export | 파일 안에서만 쓰이지만 shared UI의 prop 타입 공개는 관례. 유지 |
| Prisma `Command` 모델(`schema.prisma:147-158`), `Project.executorKind`·`commandIssue`(`:38-39`) | 쿼리 호출 0, 필드 읽기·쓰기 0(`packages/core/config.mjs:42-43`이 harness.json에서 파싱만 한다). 스키마 주석 "Phase 3에서 소비", `invariants.md:27`이 불변식 1의 구현체로 `Command` 테이블을 지목. **아키텍처 예약이라 제안하지 않는다.** Phase 3를 폐기하기로 결정하면 그때 마이그레이션과 함께 별도 제안서 |
| `docs/**/.gitkeep` 8개 | 코드 아님. 5개는 비어 있지 않은 폴더에 있어 원하면 A1과 같은 커밋에서 지운다. `dependencies/active`·`dependencies/completed`·`test-reports/active`의 3개는 빈 폴더를 git에 남기는 용도라 **남긴다** |

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `public/{file,globe,next,vercel,window}.svg` | delete | 저장소 전체 참조 0, 초기 스캐폴드 산출물 | none — 정적 URL로 직접 접근하는 곳도 없음(`src`·`docs` grep) |
| `src/app/(app)/billing/page.tsx:5` | update | tsc TS6133 | none |
| `src/server/entitlement.ts:5,9,28-30` | update | 소비자 0. `limitsFor` import는 지우는 둘만 쓰던 것 | none |
| `src/server/auth/index.ts:7,9` | update | 소비자 0 | none |
| `src/fsd/**/index.ts` 10개(B1 표) | update | slice 외부 소비자 0, `fsd.md:101` | low — 빠뜨린 소비자가 있으면 `tsc`가 즉시 잡는다 |
| B2 표의 10개 파일 | update | 파일 외부 소비자 0 | low — 같은 이유 |
| `plugin/lib/deliver.mjs`, `plugin/lib/entitlement.mjs` | regenerate (B2 채택 시) | core 원본을 고치면 `npm run sync:plugin-lib`로 복사본을 맞춘다(`verification.md:47`) | low — 빠뜨리면 `npm run check` 첫 단계가 실패해 바로 드러난다 |
| `src/fsd/entities/board-item/model/journey.ts`, `journey.test.mjs`, `index.ts:9-10`, `docs/conventions/product-copy.md:214-217` | delete/update (C1 결정 후) | 런타임 소비자 0 | low — 문서 갱신 누락 시 규약 문서가 없는 코드를 가리킨다 |
| `packages/core/backlog-md.mjs`, `board-md.mjs`, 두 테스트, `plugin/lib/backlog-md.mjs`, `board-md.mjs` | delete (C2 결정 후) | 테스트 외 importer 0, Phase 2 미착수 | low — `sync:plugin-lib`이 복사본을 지우고 `--check`가 확인 |
| `docs/architecture/sources.md:12,14` | update (C1/C2 결정 후) | 삭제되는 `board-md.mjs`·`journey.ts`를 ApcH 원재료의 도착지로 적은 행 | low — 빠뜨리면 source of truth가 없는 파일을 가리킨다 |
| `scripts/plugin-lib.mjs:9` | keep (C3 권고) | 정책 단순성 | — |

## Safety Analysis

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — `src/app/**` 라우트 파일은 대상이 아니다. A2는 라우트 파일의 import 한 줄이고
  본문이 그 심볼을 쓰지 않음을 `tsc`가 증명한다.
- [x] 정적 `import` / `export from` — 후보 심볼마다 저장소 전역 `grep -rnw`로 대조했다(ts/tsx/mjs/md).
  B1 표의 "내부 사용처" 열은 상대 경로 import이며 barrel을 거치지 않는다(`fsd.md:102` 규칙대로).
- [x] dynamic `import()` 또는 lazy loading — 저장소에 `import(` 호출이 없다(`grep -rn --exclude-dir=generated "import(" src packages plugin scripts` 0건 — `src/generated`의 Prisma 런타임 3건은 생성물).
- [x] barrel export(`index.ts`) 경유 참조 — `@/fsd/<slice>` 형태의 import를 slice별로 전수 확인했다. 지운 뒤에도
  모든 barrel에 export가 남는다.
- [x] 테스트와 스크립트 참조 — `journey.test.mjs`(C1)·`backlog-md.test.mjs`·`board-md.test.mjs`(C2)는 대상 모듈과
  함께 지운다. `examples/apch/harness.json`은 테스트가 읽으므로 대상에서 뺐다. `scripts/*`는 대상 없음.
- [x] 정적 자산 URL 또는 `public` 직접 접근 가능성 — 다섯 SVG 파일명이 `src`·`docs`·설정 어디에도 없다.
  `<img src="/next.svg">` 같은 문자열 참조도 없다.
- [x] 타입 선언, 전역 선언, ambient module 영향 — `src/server/auth/next-auth.d.ts`는 대상이 아니다. 지우는
  타입은 전부 정의 파일 안에서만 참조된다.
- [x] 런타임 side effect 또는 초기화 코드 — 지우는 심볼은 상수·순수 함수·타입이다. `signOut`은
  `NextAuth()` 반환값의 구조 분해에서만 빠지고 `NextAuth()` 호출 자체는 그대로다.
- [x] API, localStorage/sessionStorage, analytics, 외부 SDK 영향 — 없음. MCP 도구 계약(`ToolDeps`)은
  B2에서 구성 타입의 `export` 키워드만 대상이고 형은 바뀌지 않는다.
- [x] 아키텍처·규약 문서의 참조 — `docs/architecture/**`·`docs/conventions/**`·`README.md`·`CONTEXT.md`를 삭제 대상 이름으로
  grep했다. 해당하는 곳은 `sources.md:12`(board-md)·`:14`(journey)·`product-copy.md:214-217`(deriveJourney) 셋이고 모두
  C1·C2의 실행 계획에 들어 있다. `fsd.md:87`의 `toBoardItem` deep-import 예시는 "나쁜 예"라 barrel 변경과 무관하다.
- [x] **private 템플릿의 참조**(2026-09-07 확인) — `Sangeok/harness-templates`를 클론해 전수 검색했다. `plugin/lib`
  참조는 0건이다. 다만 경계는 예상보다 넓었다: `templates.test.mjs:7-13`이 `../../packages/core/{config,render,transitions,vars}.mjs`와
  `../../src/server/agents/{steps,next}.ts`·`../../src/server/pipeline/board-rules.ts`를 **상대 경로로 직접 import한다**.
  가져가는 심볼은 `parseHarnessConfig` `renderTemplate` `STATUSES` `buildVars` `buildWorkspaceVars` `DONE` `REQUIREMENTS`
  `splitTemplate` `agentNext` `decideReportSubmit` `decideTransition` 열하나이고, 이 제안의 삭제·비공개 대상과 **교집합이 없다**
  (B2가 건드리는 `DERIVED_REQUIREMENTS`·`RunRow`·`MAIN_LOOP`·`RuleKind`·`RUNBOOK`·`RUNBOOK_FREE`·`AXES`는 하나도 쓰지 않는다).
  `board-md`·`backlog-md`·`journey`·`deriveJourney`도 0건이라 C1·C2·C3가 안전하다.

## Approval

승인 메모:

- 승인 전. 묶음 단위(A / B1 / B2 / C1 / C2 / C3)로 채택 또는 보류할 수 있다.
- C1·C2·C3는 각각 결정지 중 하나를 골라야 실행할 수 있다. 권고는 C1(b) · C2(b) · C3(a).

## Execution Plan

`dev`에서 `harness/dead-code-removal`을 따서 진행하고 `gh pr create --base dev`로 올린다(AGENTS.md).

1. **묶음 A** 한 커밋 — SVG 5개 삭제, `billing/page.tsx:5` 삭제, `entitlement.ts`의 `limitsForProject`·`Limits`·`:5`의
   `limitsFor` import 삭제, `auth/index.ts`에서 `signOut` 제거.
2. **묶음 B1** 한 커밋 — 표대로 10개 barrel에서 심볼 제거. `entities/board-item/index.ts:9-10`(`deriveJourney`와 타입 4개)은
   C1(a) 배선이면 남기고, C1(b)·(c)면 지운다. C1이 미결이면 남기고 그 두 줄만 B1에서 제외한다고 커밋 메시지에 적는다.
3. **묶음 B2** 한 커밋(채택 시) — `export` 키워드 제거. `tools.ts` 구성 타입 7개는 승인 메모에 "제거"가 명시된
   경우에만 뗀다(없으면 유지). `packages/core/deliver.mjs`·`entitlement.mjs`를 고치면 복사본이 어긋나므로 **같은 커밋에서**
   `npm run sync:plugin-lib` → `node scripts/plugin-lib.mjs --check`가 `plugin/lib in sync`를 찍는지 확인한다 — 빠뜨리면
   `npm run check`가 첫 단계에서 `drift: plugin/lib/deliver.mjs`로 exit 1.
4. **C1**(채택 시) — `journey.ts`·`journey.test.mjs` 삭제, barrel `:9-10` 삭제(2단계에서 이미 지웠으면 생략), `product-copy.md:214-217`의
   4줄 단락 전체를 볼드 라벨은 남기고 한 문장으로 교체 — ``**Journey stepper** — removed with the design v4 board
   (`deriveJourney` deleted; the 7-stage model is in git history).`` — 하고, `docs/architecture/sources.md:14`의
   변환 열 끝에 "journey 제거(`a9b4bf2`)"를 덧붙여 갱신(그 행의 새 위치 열 `apps/web/...`은 이미 낡았지만 이 제안 범위 밖).
5. **C2**(채택 시) — `packages/core/backlog-md.mjs`·`board-md.mjs`·테스트 2개 삭제 → `npm run sync:plugin-lib`
   (복사본 2개 자동 삭제) → `node scripts/plugin-lib.mjs --check`가 `plugin/lib in sync` → `docs/architecture/sources.md:12`의 새 위치 열을
   "제거됨(`a9b4bf2`에서 복구)"로 갱신.
6. 각 묶음의 커밋 **전에** 아래 검증을 돌린다. 마지막에 knip을 다시 돌려 남은 보고가 §"knip 오탐" 3건 + `plugin/lib` 복사본 보고 + 보류한 묶음뿐임을 확인한다.

## Verification Plan

실행할 검증(`prisma.config.ts`가 `DATABASE_URL`을 즉시 읽으므로 CI와 같은 placeholder를 먼저 export한다 — 연결은 열리지 않는다):

```bash
export DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci   # .github/workflows/check.yml과 동일
npm run db:generate                             # src/generated가 없거나 낡았을 때
npm run check                                   # plugin-lib --check · lint(+verify:fsd) · typegen · tsc · test:architecture
npm test && npm run test:web                    # core·plugin 테스트, src 테스트
npm run build                                   # 라우트 수집·서버/클라이언트 경계
DATABASE_URL=postgresql://ci:ci@127.0.0.1:5432/ci npx prisma generate \
  && npx tsc --noEmit --noUnusedLocals --noUnusedParameters   # 기대: src/generated 외 오류 0
npx knip@6.34.0 --reporter compact              # 기대: 오탐 3건 + plugin/lib 복사본 보고 + 보류 묶음만
grep -rn -E '(file|globe|next|vercel|window)\.svg' --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=proposals .   # 기대: 0 (파일명을 적은 이 제안서만 제외)
```

검증 기준:

- `npm run check`·`npm test`·`npm run test:web`·`npm run build` 모두 exit 0.
- `tsc --noUnusedLocals`가 `src/generated` 밖에서 오류 0(현재 1).
- `verify:fsd`의 "public API 누락" 검사가 그대로 통과(모든 barrel에 export가 남는다).
- 기존 실패와의 구분: 감사 시점(`a9b4bf2`)에 `npm run check`·`npm test`(123)·`npm run test:web`(157)·`npm run build`는
  전부 통과했고, 실패하는 것은 `tsc --noUnusedLocals`의 A2 1건뿐이다(아래 표). 다른 실패가 나오면 신규 실패다.

## Verification Results

감사 시점 실측(`a9b4bf2`, 2026-09-07). 제거 후 검증은 아직 실행 전이다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npx knip@6.34.0 --reporter compact` | 실행됨(감사) | 후보 46건 → 대조 후 오탐 3, 확정 A 4 · B1 16줄 · B2 18 · C 3 |
| `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | 실행됨(감사) | `src/generated` 외 오류 1 — `billing/page.tsx(5,1) TS6133 planForUser` |
| 후보 심볼 전수 `grep -rnw` 대조 | 실행됨(감사) | 본문 표의 "내부 사용처"·"소비자 0" 근거 |
| 테스트 외 importer 분석(모든 비테스트 모듈) | 실행됨(감사) | importer 0: `packages/core/backlog-md.mjs`, `board-md.mjs` 둘만 |
| 의존성·자산·CSS·Prisma·억제주석 grep | 실행됨(감사) | §"검토했으나 제안하지 않음" |
| `npm run check` (기준선) | 실행됨(감사) | 통과 — plugin-lib in sync · lint · typegen · tsc · test:architecture 19/19 |
| `npm test` (기준선) | 실행됨(감사) | 123/123 통과 |
| `npm run test:web` (기준선) | 실행됨(감사) | 157/157 통과 |
| `npm run build` (기준선, `DATABASE_URL` placeholder) | 실행됨(감사) | 통과 — Compiled successfully, 10/10 static pages |
| `npm run check` (제거 후) | 통과 | `plugin/lib in sync` · FSD 통과 · test:architecture 19/19 |
| `npm test` (제거 후) | 통과 | 112/112. 기준선 123에서 −11 = 지운 `board-md.test.mjs`·`backlog-md.test.mjs` |
| `npm run test:web` (제거 후) | 통과 | 142/142. 기준선 157에서 −15 = 지운 `journey.test.mjs` |
| `npm run test:templates` (제거 후) | 통과 | 16/16(기준선도 16). private 템플릿을 임시 배치해 돌렸다 — CI가 못 돌리는 게이트 |
| `npm run build` (제거 후) | 통과 | Compiled successfully, 10/10 static pages |
| `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` (제거 후) | 통과 | `src/generated` 밖 오류 **0건**(기준선 1건 → A2가 닫았다) |
| SVG grep (제거 후) | 통과 | 0건 |
| `npx knip@6.34.0` (제거 후) | 통과 | 후보 46건 → 14건. 남은 것은 §"knip 오탐" 3건 + `plugin/lib` 복사본 보고 + C3(a)로 유지한 `token`·`transitions` + 아래 후속 5건 |

## Risks and Rollback

잔여 리스크:

- **`npm run test:templates`는 CI가 돌리지 않는다**(`check.yml`의 마지막 주석 — `plugin/templates/`가 이 저장소에
  없어서다). 그 테스트가 `packages/core`와 `src/server`를 직접 import하므로, 이 제안의 범위 밖에서 누군가
  `splitTemplate`·`agentNext`·`decideTransition`·`decideReportSubmit`의 시그니처를 바꾸면 로컬에서만 드러난다.
  이번 실행에서는 templates를 임시로 배치해 이 테스트까지 돌려 확인한다(검증 결과 표).
- B1에서 뺀 `pages/*` props 타입을 라우트가 나중에 명시하고 싶어질 수 있다 — 그때 한 줄 다시 연다.
- `tsc --noUnusedLocals`는 `npm run check`에 없어 A2 같은 잔재가 다시 생길 수 있다. tsconfig에 켤지는
  이 문서 범위 밖의 후속 결정이다(감사 시점 실측: `src/generated`를 포함해도 이 옵션의 오류는 A2 1건뿐이라 켜는 비용은 낮다).
- C1(b) 채택 시 `product-copy.md`를 함께 고치지 않으면 규약 문서가 없는 함수를 가리킨다 — 실행 계획 4에 포함.

롤백 방법:

- 묶음별 커밋이므로 `git revert <commit>`.
- SVG는 `f04c4ef`, `journey.ts`·`backlog-md.mjs`·`board-md.mjs`는 `a9b4bf2`에서
  `git checkout <commit> -- <path>`로 되살린다. 복사본은 `npm run sync:plugin-lib`이 다시 만든다.

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성합니다.

완료 기록:

- completed-at: 2026-09-07
- verification-summary: front matter 참조. 다섯 게이트 전부 통과, 신규 실패 없음.
- implementation commits: `2902b96`(A) · `6fcba68`(B1) · `5dccde0`(B2) · `81d6858`(C1) · `bb024f3`(C2). C3(a)는 변경 없음.
- changed files summary: 삭제 9파일(SVG 5, `journey.ts`+테스트, `board-md`·`backlog-md`+테스트 4) + 동기화가 지운 복사본 2 ·
  수정 22파일(barrel 10, B2 대상 10, 문서 `sources.md`·`product-copy.md`). 약 −573줄 / +6줄.
- 실행 중 달라진 것:
  1. **`plugin/templates` 경계가 예상보다 넓었다.** 제안 시점의 미확인 항목은 "private 템플릿이 `plugin/lib`을
     참조하는가"였는데, 실제로는 `templates.test.mjs:7-13`이 `../../packages/core/*.mjs`와 `../../src/server/**/*.ts`를
     **상대 경로로 직접 import**한다. 가져가는 심볼 열하나는 이 제안의 대상과 교집합이 없어 결론은 바뀌지 않았지만,
     검증에 `npm run test:templates`를 더해 실제로 돌렸다(16/16).
  2. **B2의 복사본 동기화 필요성이 실측으로 확인됐다.** 동기화 전 `node scripts/plugin-lib.mjs --check`가
     `drift: plugin/lib/deliver.mjs`·`entitlement.mjs`로 exit 1을 냈고, `npm run sync:plugin-lib` 뒤 통과했다.
  3. **`tools.ts` 뷰 타입 7개는 승인 범위대로 유지했다**(한 번 잘못 제거했다가 되돌렸다).
- remaining follow-up: **B1이 barrel을 좁힌 결과로 새로 "파일 안에서만 쓰이는 export"가 된 5건** —
  `board-item.ts`의 `toBoardItem`, `status-label.ts`의 `STATUS_LABEL`, `connect-command.ts`의 `ShellKind`,
  `board-item-page.tsx`의 `TimelineEvent`, `project-tokens-page.tsx`의 `TokenRow`. 감사 시점에는 barrel이
  소비자였으므로 B2 표에 없었다. 승인 범위 밖이라 손대지 않았고, 다음 클린코드 패스의 B2 후보다.
  `chip.tsx`의 `ChipTone`은 이 문서가 이미 "shared UI prop 타입 공개는 관례"로 유지 판정했다.

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `completed/`의 수행 완료 기록이므로 `completed`다.
- [x] `stage`는 완료와 함께 `null`로 되돌렸다.
- [x] 승인 metadata(`approved-by`/`approved-at`/`approval-scope`)가 채워져 있다.
- [x] `proposal-size`는 standard — 삭제·`public/` 자산·barrel export 강제 조건에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 확인했다. 확인 못 한 경계(private 템플릿) 1건은 체크하지 않고 리스크에 남겼다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 기존 실패(A2 1건)와 신규 실패를 구분하는 기준을 적었다.
- [x] 잔여 리스크를 명시했다.
- [x] 완료 문서로서 `completed-at`·`verification-summary`·Completion Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서 — 해당 없음.
