---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-09-23"
approved-by: "Sangeok"
approved-at: "2026-09-23"
approval-scope: "묶음 1~5 전부(F01~F42)를 브랜치 harness/src-clean-code-second-pass 하나에서. 제품 결정은 모두 권고안 — ① F01 입력란 유지 + 파싱 결과 표시, ② F03 인라인 오류, ③ F02 border-rule, ④ F15 canWrite 필수, ⑤ F17 주석 정정까지(파생 통일 안 함), ⑥ F10 product-copy.md 잠금 블록 추가, ⑦ F39 hasPropose 삭제, ⑧ F41 첫 호출 로그 + fallback 유지, ⑨ F21 packages/core/pipeline.d.mts 추가, ⑪ F42 1단계만. 커밋·PR은 요청 시."
completed-at: "2026-09-23"
verification-summary: "42건 전부(F42는 1단계) PR #76(구현 커밋 55424bc, 머지 67b48ff)으로 dev에 들어갔다. CI check(55424bc) 녹색 — check 25·17, npm test 180, test:web 386(기준선 380 + 새 시험 6), npm run build; 빌드 로그에 F41 오설정 로그 0회. 로컬: npm run check exit 0, test:server 2, NUL 0, F21 선언 적용 탐침 실패 확인. 화면: F01 재현 불가(:3100), F04는 편집 레일 렌더로, F07 배너는 실제 DB 읽기 렌더로 확인. 미실행: test:server:integration(TEST_DATABASE_URL 없음; 이 변경의 원장 경로는 diff 대조로 동작 동일)."
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related:
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-09-02-src-clean-code-findings.md"
  - "docs/proposals/completed/2026-09-23-src-server-clean-code-findings.md"
  - "b416d14 — 리뷰 기준 커밋 (커밋 2026-09-22 · 리뷰 2026-09-23)"
---

# src 전역 클린코드 2차 리뷰 — 채택된 42건

## Summary

`src` 전체(추적 파일 231개·12,966 LOC, `src/generated` 제외)를 다섯 개의 독립 렌즈(응집도·결합도·
예측가능성·가독성·TypeScript 일반)로 다시 검토하고, 중립 게이트가 원시 발견 54건을 하나씩 코드와
대조해 판정한 결과다. **채택 42건 — Must 2, Should 21, Consider 19.** 병합으로 흡수된 원시 발견이
10건, 기각 1건, 렌즈 재검토 2건 — 재검토는 2라운드에서 하나는 철회(COH-8), 하나는 축소 채택(F42)으로
끝났고 3라운드는 필요 없었다.

이 문서는 **발견 등록부이자 실행 제안서**다. 코드는 한 줄도 바꾸지 않았다. 42건을 성격별 5개
묶음으로 나눴고, 묶음 단위로 승인하거나 잘라내면 된다. 실행 전에 **제품 결정 10건**이
필요하다(Approval 절의 ①~⑪ 중 ⑩은 결정이 아닌 순서 메모) — 특히 F01·F03·F15·F17·F42는 구현자가 임의로 방향을 정하면 안 된다.

Must 둘 중 하나(F17)는 렌즈가 아니라 오케스트레이터의 대조에서 드러났다. 보드 라우트와 배너
어댑터가 "누가 이 항목을 하고 있나"를 판정할 때 쓰는 집합 키의 구분자가 **보이지 않는 NUL(0x00)
바이트**다 — 편집기에는 빈칸으로 보이고, 그대로 다시 타이핑되면 두 화면 중 하나가 조용히 영원히
"아무도 안 함"이 되며, grep 계열 도구는 그 두 파일을 아예 건너뛴다.

1차 패스(2026-09-02, 30건)와 서버 패스(2026-09-07 → 2026-09-16 구현, 10건) 이후 처음 `src`
전역을 다시 본 것이다. 이번에 나온 것 가운데 넷(F16·F22·F35·F40)은 서버 패스 구현
(`60070e0`, 2026-09-16)이 남긴 가독성 부채이고, F20(`closedTerminal`)은 그 이틀 뒤 반복 슬롯 기능
(`ce19203`, 2026-09-18 — `agents/run-query.ts`를 새로 만든 커밋)에서 생겼다. 나머지는 그 전부터 있었거나
그 뒤에 새로 생긴 코드(`select-project-for-use`, `edit-pipeline`, 랜딩)에서 나왔다.

## Goal

- `src` 전역의 클린코드 결함을 근거(파일:줄) 있는 형태로 등록하고, 실행 순서를 정한다.
- 1차·서버 패스 이후 새로 들어온 슬라이스와 서버 재작업분의 검토 공백을 닫는다.
- 실행은 묶음 단위로 분리해, 승인자가 전부/일부/보류를 고를 수 있게 한다.

## Proposal Size

`proposal-size`: standard

선택 근거: 라우팅(revalidatePath 대상 문자열, `not-found` 분기), 인가 플래그(`canWrite`),
서버 모듈의 공개 표면(`board.ts` 재export), MCP 도구 회귀 시험, barrel export 이동(F08),
`packages/core`의 타입 선언 추가 여부(F21), 5개를 훨씬 넘는 파일이 대상이다. 강제 조건 다수에
해당한다.

## Current State

### 리뷰가 돌아간 방식

다섯 개 렌즈 에이전트가 **서로의 출력을 보지 못한 채** 같은 대상과 같은 프로젝트 컨텍스트만 받고
`src`의 텍스트 파일을 전수로 읽었다(각 렌즈가 "229 of 229"를 보고했다 — 다만 `b416d14`에서 `src`(generated
제외)의 추적 파일 231개 중 텍스트가 아닌 것은 `favicon.ico` 하나라 텍스트 파일은 230개다. 렌즈 기록만으로는
어느 한 파일이 세어지지 않았는지 확인할 수 없고, 렌즈가 보고한 수와 실제 수가 하나 다르다는 사실만 남긴다). 이어서 렌즈 스킬을
주지 않은 중립 게이트가 다섯 원본을 받아 **54건 모두의 인용 줄을 직접 열어** 채택·병합·재검토·
기각을 발부했다. 게이트는 판정에 필요한 근거 파일(`scripts/verify-fsd-boundaries.mjs`,
`scripts/plugin-lib.mjs`, `next.config.ts`, 설치된 Next 문서)도 스스로 읽었다.

| 렌즈 | 원시 | 정본 채택 | 병합 흡수 | 재검토 → 2라운드 | 기각 |
| --- | --- | --- | --- | --- | --- |
| 응집도 (`frontend-cohesion`) | 8 | 4 | 3 | 1 (COH-8) → 렌즈 철회 | 0 |
| 결합도 (`frontend-coupling`) | 9 | 6 + 1 (F42) | 2 | 1 (CPL-6) → 축소 채택 | 0 |
| 예측가능성 (`frontend-predictability`) | 12 | 10 | 1 | 0 | 1 (PRD-12) |
| 가독성 (`frontend-readability`) | 15 | 13 | 2 | 0 | 0 |
| TypeScript 일반 (`typescript-clean-code`) | 10 | 8 | 2 | 0 | 0 |

전 렌즈 Applicable·완주 — **Full applicable-lens review**(부분 리뷰 아님).

원시 54건 → 정본 42건(기각 1, 철회 1, 병합 흡수 10). 병합 관계(같은 근본 원인·같은 최소 수정)는
다음 여덟 묶음이다.

- `F02` ← COH-6 · RDB-7 · TS-6 (`border-line` 토큰 부재)
- `F06` ← COH-4 · CPL-3 (로스터 읽기의 소유자 부재)
- `F07` ← COH-5 · CPL-2 (잠금 배너가 레이아웃에 조립됨)
- `F10` ← COH-2 · CPL-5 (랜딩의 문구 복제)
- `F12` ← COH-7 · CPL-4 (슬러그 규칙 이중화)
- `F13` ← PRD-1 · RDB-5 · TS-9 (`useProject` 이름)
- `F15` ← PRD-7 · RDB-10 (`canWrite` 기본값·극성)
- `F16` ← PRD-10 · RDB-13 (`transitionIn`의 throw/return 계약 분리)
- 나머지 34건은 렌즈 하나씩만 짚었다.

세 렌즈가 독립적으로 같은 지점을 짚은 것이 둘(F02·F13), 두 렌즈가 여섯이다. 합의는 커버리지
신뢰도일 뿐 심각도를 올리지 않는다는 규칙을 그대로 적용했다 — F02·F13 모두 Should다.

### 판정의 한계 (읽는 사람이 알아야 할 것)

1. **게이트가 렌즈 권고 넷을 "실행 불가능"으로 정정했다.** 렌즈는 권고를 코드 독해로 냈고, 게이트는
   검사기 소스를 읽어 그 권고가 `npm run lint`를 깨뜨린다는 것을 잡았다. F10(랜딩 시험이 다른
   슬라이스 내부를 import — `fsd/no-deep-import`), F12(server↔FSD 어느 방향 import도 금지 —
   `server/no-fsd-import`·`fsd/server-import-boundary`), F13(제안한 새 이름 `selectProjectForUse`가
   같은 파일 `:6`의 import와 충돌), F11(`config.base.ts`는 `src/server`라 FSD 라우트 모듈을 못 가져옴).
   이 문서의 권고는 전부 정정된 판이다. **렌즈 원문을 그대로 실행하면 안 된다.**
2. **줄 번호·수량 보정 넷.** PRD-6의 `pipeline/page.tsx:22-23`은 `:23-24`, TS-4의 `next.ts:184`는
   `:186`, PRD-10·RDB-13의 "reportFailure로 감싼 9개"는 **8개**, CPL-5의 `gate-text.ts:32`는 `:30`. 이 문서는
   보정된 값을 쓴다. (게이트는 COH-8의 "`inbox-card.tsx` 264줄"도 265줄로 고쳤으나 10차 재대조에서 되돌렸다 —
   파일은 줄바꿈 264개로 끝나는 264줄이고, 265는 마지막 줄바꿈 뒤의 빈 조각까지 센 값이다. 렌즈 값이 맞았다.)
3. **심각도 조정 다섯.** TS-2를 Should → **Must**(재현되는 입력 흐름 파손), RDB-1·RDB-9를 Should →
   Consider(주석·이름만), TS-3을 Should → Consider(문서화된 의도적 fallback + 토큰은 선택 가능),
   그리고 2라운드에서 F17을 Should → **Must**(아래 4 — 보이지 않는 구분자 위에서 편집을 권하게
   되므로).
4. **grep 기반 근거가 두 파일에서 빠졌다.** 오케스트레이터가 렌즈 주장을 대조하려고 돌린 `rg`가
   `src/app/(app)/p/[slug]/page.tsx`와 `src/fsd/widgets/turn-banner/api/turn-data.server.ts`의
   일치를 조용히 누락했다. 원인은 두 파일의 소스 안에 **NUL(0x00) 바이트가 실제로 들어 있어서**
   ripgrep·grep이 바이너리로 분류한 것이다(디렉터리 검색에서는 경고 없이 건너뛴다). 위치와 의미는
   F17에 적었고, 게이트가 2라운드에서 바이트 스캔으로 재확인해 F17에 붙이고 Must로 올렸다. 게이트는
   파일을 직접 열어 대조했으므로 다른 판정에는 영향이 없었지만, **이 저장소에서 grep 결과를 "없음"의
   증거로 쓸 때는 F17-A가 들어가기 전까지 `rg -a`(또는 `--binary`)가 필요하다.**
5. **검증대기 0건.** 게이트가 렌즈들이 요청한 확인(검사기 규칙, `plugin-lib` 동기 범위, PPR 설정,
   `revalidatePath`의 라우트 그룹 문자열 유효성, `notFound()`의 Server Function 허용 여부)을 설치된
   문서·검사기 소스를 직접 읽어 해소했다. 따라서 **렌즈가 요청한 확인 가운데 실행 전에 남은 것은 없다.**
   이것이 실행 때 확인할 것이 없다는 뜻은 아니다 — 코드 독해나 최소 재현으로만 확인해 실행 시 다시 봐야 하는
   항목(F01·F04의 화면 재현, F21 선언의 적용 여부와 `.d.mts`에 대한 `eslint` 동작, F41의 CI 빌드 로그)은
   Safety Analysis의 "오탐 경계"와 Verification Plan에 있다.

### 기준선

리뷰 기준 커밋 `b416d14`(커밋 2026-09-22, `main` = `dev` = `origin/dev`)에서 2026-09-23에
오케스트레이터가 측정했다.

| 명령 | 결과 |
| --- | --- |
| `npm run lint` | 통과 — FSD architecture check passed |
| `npx tsc --noEmit` | 통과 |
| `npm run test:web` | 380 pass / 0 fail (suites 75) |

기준선이 전부 통과이므로 **어떤 실패든 신규**다.

### 이전 패스와의 관계

- 1차 패스(2026-09-02, 30건)의 보류 1건(F24 — 토큰 검증 세 번째 소비자가 생기면 추출)은 조건이
  여전히 미충족이고, 이번 렌즈들은 그것을 재보고하지 않았다(일관됨).
- 1차 F19(`projectPath` 우회 링크 8곳)는 프로젝트 하위 경로만 다뤘다. 이번 F11은 그 밖의 두 URL
  (`/projects`, `/p/new`)과 revalidation 대상 문자열을 짚는다 — 회귀가 아니라 남은 틈이다.
- 1차 F10·F8(새 프로젝트 폼의 상태 9개·판별 유니온)은 반영됐다. 이번 F01·F36은 같은 파일의 **다른
  결함**(입력 중 언마운트·모드 미명명)이다.
- 서버 패스 구현(`60070e0`)이 만든 코드에서 F16(`createBoardService`의 재export), F40(`receipt!`
  단언), F35(revision 상한 리터럴), F22(`github.ts`·`next.ts`의 로그가 원인을 버림)가 나왔다. F20(receipt 재전송
  판정식 `closedTerminal`)은 `ce19203`(반복 슬롯, 2026-09-18)에서 생겼다 — `git log -S closedTerminal`로 확인.
  그 패스의 남은 후속(격리 DB 통합 시험·D3 리허설·배포 인수)은 이 문서와 무관하게 그대로다.

## Scope

포함 범위:

- `src/app`, `src/fsd`, `src/server` 전체와 그 안의 테스트(`*.test.ts`, `*.test.mjs`)
- 위 코드가 참조하는 타입·계약의 형태 변경, 시험 추가
- F10이 건드리는 문서 둘 — `docs/conventions/product-copy.md`(§16에 잠금 블록)와
  `docs/architecture/verification.md`(`:70-75` 잠금 표에 행). 둘 다 **추가만**이고 문구 재작성은 없다.

제외 범위:

- `packages/core` — 리뷰 대상 밖. F21의 선언 파일(`pipeline.d.mts`) 추가는 **결정 대상**이고, 거절되면 src 안의 대안을
  쓴다. `.mjs` 본문은 어떤 발견도 바꾸지 않는다.
- 사용자 노출 문구의 재작성 — `docs/conventions/product-copy.md`가 계약이다. F09·F10은 문구를
  바꾸자는 게 아니라 **출처를 하나로 묶자**는 것이고, F10의 잠금 블록은 이미 있는 문장을 인용만 한다.
- `plugin/`, `scripts/`, `prisma/`, `tests/server/`.
- 성능·번들 튜닝(F08의 번들 결과는 판정 근거로 쓰지 않았다), 스트리밍 설계(PRD-12 기각 참조),
  폴더 구조 재설계.

## Proposal

42건을 성격별 5묶음으로 나눈다. 묶음 번호는 권장 실행 순서다. 각 건의 줄 번호는 `b416d14` 기준이며
게이트가 대조한 값이다.

### 묶음 1 — 지금 사용자에게 보이는 결함과 변경 위험 (Must ×2, Should ×3)

**F01 — 저장소 URL 입력란이 타이핑 도중 사라진다** · TypeScript · **Must**
`src/fsd/features/create-project/ui/new-project-form.tsx:37,58-72,100,118-128`(특히 `:126`) ·
`src/fsd/features/create-project/model/repo-url.ts:13,20`
비제어 입력이 키 하나마다 `applyPaste`를 부르고(`:126`), 그것이 `owner`·`repo`·`slug`를 채우며
(`:69-71`), `isRepoChosen = slug !== "" && owner !== "" && repo !== ""`(`:37`)가 **입력란을 그릴지
말지의 분기 조건**이다(`:100`). `repo-url.ts:20`의 패턴은 repo 이름 한 글자만 있어도 맞고
`SEGMENT`(`:13`)는 한 글자를 받으므로, `https://github.com/acme/harness-smoke`를 **붙여넣지 않고
타이핑하면** `h`를 치는 순간 입력란이 요약 블록으로 바뀌고 `slug`는 `h`가 된다. 이 경로는 picker가
비었거나 GitHub이 안 될 때 남는 **유일한 온보딩 경로**다(`:34`, `:133-135`). `new-project-form.test.ts`
는 정적 마크업만 렌더한다.
→ 파싱과 분기 조건을 분리한다: `isManualEntry`인 동안 입력란을 유지하고 파싱 결과를 **옆에** 보여
준다. (대안인 "제어 입력 + blur/paste/Enter에서 적용"은 붙여넣기 동작을 바꾸므로 제품 결정 ①.)

**F17 — 보드와 배너가 `dispatched`를 다르게 파생하는데 주석은 같다고 하고, 두 파생 모두 보이지 않는 NUL 바이트를 키로 쓴다** · 가독성 + 오케스트레이터 대조 · **Must** (2라운드에서 Should → Must)
`src/app/(app)/p/[slug]/page.tsx:16-17,21,26-30`(특히 `:21`, `:29`) · `src/fsd/widgets/turn-banner/api/turn-data.server.ts:41,43-63`(특히 `:41`, `:46`, `:54`, `:56`, `:58-62`, `:61`)
**(1) 파생 불일치 — 1라운드 근거.** `page.tsx:16`은 "배너와 같은 사실(turn-data.server.ts)"이라고
적는다. 보드는 `:29`에서 `who !== null && running.has(...)`로, 배너는 `:60`에서 `slots-v1`이면
`boundRun`(`pipelineRunId`·`pipelineEntryId`·`agent`까지 일치, `:46`)을 요구한다. 새 버전은
`SLOT_FORMAT`으로 만들어지므로(`src/server/pipeline/run-query.ts:29`, `edit-pipeline.server.ts:19`) 갈라지는 경로가 정상
경로다. IIFE 안에서 `node`(`:58`)는 `:56`을 다시 계산하고, `who`(`:59`)는 슬롯 경로에서 안 쓰이며,
`"slots-v1"`이 세 번 쓰여 있다(`:46,:54,:60` — `SLOT_FORMAT`은 이미 `@harness/core/pipeline.mjs`가
export한다). `:54`는 중첩 삼항에 `boundRun!`을 섞는다.
**(2) 보이지 않는 구분자 — 2라운드에서 바이트 스캔으로 확인한 근거.** 두 `running` 집합의 키에서
key와 agent를 잇는 문자는 공백이 아니라 **U+0000(NUL) 바이트**다: `page.tsx` 오프셋 1343·1794(줄 21·29),
`turn-data.server.ts` 오프셋 2761·4066(줄 41·61), 네 곳 모두 템플릿 리터럴 안(`${r.key}` + NUL +
`${r.agent}`). 추적 파일 전수 스캔에서 NUL이 든 텍스트 파일은 **이 둘뿐**(각 2개)이고, 네 줄 모두 한
커밋(`cc422f3`, 2026-09-11)에서 왔으며, 어떤 주석·문서도 구분자를 언급하지 않는다. Read 도구·편집기·
diff는 이 바이트를 빈칸으로 그려 다섯 렌즈 전부 공백으로 읽었다.
**영향.** 지금의 정확성 문제는 없다 — 네 곳이 같은 바이트를 쓰므로 집합이 맞고 `tsc`·`lint`·
`test:web` 380이 통과한다. **Must인 이유는 변경 위험이다:** 이 구분자는 사람이 보는 어떤 렌더링에서도
보이지 않아, 한 곳이라도 다시 타이핑되거나·복사되거나·정규화 도구를 거치거나·편집기/에이전트가
재구성하면 공백이 되고, 그 표면의 `running.has()`가 **영원히 거짓**이 되어 보드 또는 배너가 조용히
"아무도 이 항목을 하고 있지 않다"고 보고한다. 이를 잡는 시험은 없다. 그리고 이 위험은 가정이 아니다
— **F17 자신의 정리(B)가 `turn-data.server.ts:56-62`를 편집하며, 61행에 그 바이트가 있다.** 바이트를
보이게 만들지 않고 그 편집을 권하는 것은 조용한 실패의 함정으로 편집을 보내는 것이다. 도구 위험도
실증됐다: ripgrep 14·grep이 두 파일을 바이너리로 분류해 디렉터리 검색에서 **경고 없이 건너뛰고**,
이번 리뷰에서 이미 두 번 놓쳤다(`page.tsx:14`, `turn-data.server.ts:67`). 디렉터리 단위로 훑는 감사·
코드모드·리팩터링 도구는 앞으로도 `dispatched` 계약을 쥔 두 파일을 계속 건너뛴다.
→ **A(Must, 가장 먼저).** 네 개의 NUL 바이트를 템플릿 리터럴 안의 이스케이프 시퀀스(역슬래시 뒤
`u0000`)로 바꾼다. 만들어지는 문자열은 **런타임에서 바이트 단위로 동일**(동작 변화 0)하고, 소스에서
0x00이 사라지며, 구분자가 읽히고 grep된다. 선택: `p/[slug]/page.tsx:21`·`turn-data.server.ts:41`에 구분자를
이름 짓고 두 복사본이 같아야 한다고 적는 주석 하나. 구분자 **문자** 자체는 이 단계에서 바꾸지
않는다 — `|`·`:`로 바꾸는 것은 어떤 key·agent 값에도 그 문자가 없다는 증명이 필요한 실제 동작
변경이라 별도 결정이다. 검증: 바이트 스캔 0, `npx tsc --noEmit`, `npm run test:web`.
→ **B(Should, 동작 보존 — 1라운드 권고 그대로).** `node`를 반환 객체 위로 올려 두 곳에서 재사용,
`SLOT_FORMAT`을 import해 `isSlotRun` 하나로, `page.tsx:16` 주석을 실제로 무엇이 다른지 말하도록 정정.
→ **보류(제품 결정 ⑤, A 뒤).** 두 파생을 통일할지, 보드의 느슨한 쪽을 의도로 남길지.

**F02 — `border-line`은 토큰이 아니다** · 가독성·응집도·TypeScript · Should
`src/app/(app)/p/[slug]/layout.tsx:34` · `src/fsd/features/review-gate/ui/inbox-card.tsx:85` ·
토큰 출처 `src/app/globals.css:41-54`
`globals.css:42`가 팔레트를 비우고(`--color-*: initial`) 열두 색만 선언한다(`:43-54`) — `line`은
없다. Tailwind 4 CSS-first, 스타일시트 하나, `tailwind.config.*` 없음이라 `border-line`은 유틸리티를
만들지 않고 `border`만 기본 색으로 남는다. 형제 크롬은 `border-rule`(`card.tsx:10`, `chip.tsx:9,12`)
또는 `border-edge`다. 영향받는 두 곳은 **프로젝트가 사용 불가일 때만 보이는** 잠금 배너와 "Not
selected" 칩이다. `lint`·`tsc`·`test:web` 어느 것도 잡지 않는다.
→ 두 곳을 `border-rule`로 바꾼다(제품 결정 ③). 토큰-소비자 대조 시험(COH-6 제안)은 오탐이 많아
채택하지 않았다.

**F03 — `useProject`가 선언한 반환 타입 밖으로 `notFound()`를 던진다** · 예측가능성 · Should
`src/fsd/features/select-project-for-use/api/select-project-for-use.server.ts:16,20,22-25` ·
`model/select-project-state.ts:3` · `ui/use-project-control.tsx:27-43` ·
`src/server/project-availability-service.ts:119,132`
액션은 `Promise<SelectProjectState>`(`success | stale | error{reason}`)를 선언하지만 `:23`에서
`code === "not-found"`만 `notFound()`로 던지고 `:24`는 값으로 돌려준다. 서비스는 `not-found`를
**값으로** 만든다. 유일한 소비자는 모든 throw를 catch해 "Couldn't confirm the selection…"으로
보여 준다(`:38-42`). `switch (result.status)`가 완전해 보여도 한 분기가 빠지며, 그 분기는 대체
프로젝트가 없을 때(`:132`)도 발화하므로 라우트 전체 404는 그 경우에 틀린 표면이다.
→ `:23`을 지우고 `:24`가 `result.reason`을 싣게 한다. 404 화면 vs 인라인 오류는 제품 결정 ②.

**F04 — `apply`가 거부된 `Step`을 조용히 버린다** · 예측가능성 · Should
`src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx:54-59,90,99-100,115,121,195-202,251-272` ·
`model/rail-state.ts:6,33-36`
`Step = { ok: true; graph } | { ok: false; reason }`. 메뉴 경로는 이를 지킨다
(`disabled={!editable || !move.step.ok}` `:115`, `{move.step.reason}` `:121`). 그런데 `apply`는
`!step.ok`면 아무 것도 안 하고 돌아오고(`:55`), 세 호출부(`:90`, `:99`, `:100`)는 `Step`을 인라인으로
만들며, 그 버튼들은 `editable`로만 잠긴다(`:197`, `:256`, `:266`). `removable`·`swappable`은
`REQUIRED_NODES`/`TAIL_NODES` 소속으로만 정해진다(`:97-98`).
→ 버튼마다 `Step`을 한 번 계산해(`:128-135`가 이미 그렇게 한다) `disabled={!step.ok}`와
`title={step.reason}`을 묶고, `apply`의 이름이 무시를 드러내게 한다. 문구는 이미 `validateGraph`가
준다. `!editable`은 다시 넣지 않는다 — 세 버튼은 `editable`이 참일 때만 그려지는 가지 안에 있다
(`:195`·`:251`, `pipeline-rail.test.mjs:13-15`가 `editable` 거짓이면 `<button>`이 없음을 단언; F34 참조).

### 묶음 2 — 단일 출처 복구와 경계 정리 (Should ×7)

**F06 — 워크스페이스 로스터 읽기에 소유자가 없다 (두 트리에 4벌)** · 결합도·응집도 · Should
`src/app/(app)/p/[slug]/page.tsx:14` · `backlog/page.tsx:19` · `pipeline/page.tsx:16` ·
`src/server/agents/runs.ts:18-19` · 관련: `layout.tsx:18` vs `widgets/app-header/ui/app-header.tsx:8`,
`tokens/page.tsx:12-17` vs `pages/project-tokens/ui/project-tokens-page.tsx:7`, `settings/tokens/page.tsx:15-19`
`prisma.workspace.findMany({ where: { projectId }, orderBy: { wsId: "asc" }, select: { agent: true } })`
가 네 번 쓰여 있고 각각 `roster`로 매핑된다. `wsId: "asc"`는 의미가 있다 — `propose-button.tsx:17`이
`roster[0]`을 기본 담당자로, `entities/pipeline/model/labels.ts:18`이 순서대로 이어 붙인다.
`layout.tsx:12`의 주석은 반대 원칙을 선언한다("배너·머리의 읽기는 각 위젯의 server adapter가
소유한다 — 여기는 조합만 한다"). 로스터의 뜻(순서·필터·스키마)이 바뀌면 두 트리의 네 곳을 찾아야
하고, 하나를 놓치면 Board·Backlog·Pipeline 탭이 기본 담당자를 두고 어긋난다.
→ `src/server/project.ts`(이미 `loadProjectRepository`를 소유)에 `loadProjectRoster(db, projectId)`
하나를 두고 세 라우트와 `runs.ts`가 쓴다. **`src/server`가 넷이 공유할 수 있는 유일한 자리**다
(`runs.ts`는 FSD를 import할 수 없다). **클라이언트는 인자로 받는다** — `runs.ts:15`의
`createNextDeps(db)`는 주입된 클라이언트로 읽어야 하고(`tests/server/integration/agent-runs.test.ts`가
다른 클라이언트를 주입한다), 전역 `prisma`로 읽으면 로스터만 그 주입을 우회한다. 세 라우트는 `prisma`를,
`runs.ts:18-19`는 `db`를 넘긴다. 순서 없이 읽는 트랜잭션 안의 멤버십 검사(`agents/run-query.ts:28`,
`pipeline/board-query.ts:164,369`, `mcp/project-sync-query.ts:19`)는 순서가 뜻이 없고 `tx`로 읽으므로
대상이 아니다. 헤더·토큰 읽기를 각 슬라이스의 `api/*.server.ts`로 옮기는 것은 같은 원인의 후속이다.

**F07 — 잠금 배너(마크업·수량 파생·계정 전체 읽기)가 라우트 레이아웃에 산다** · 응집도·결합도 · Should
`src/app/(app)/p/[slug]/layout.tsx:8,17-24,33-35` · `features/select-project-for-use/api/select-project-for-use.server.ts:11-14` ·
`model/select-project-state.ts:7-9` · `ui/use-project-control.tsx:10,18-22` ·
`pages/project-list/ui/project-list-page.tsx:20` · `src/server/project-availability-service.ts:163-185`
`layout.tsx:34`가 사유를 그리고 수량을 인라인으로 계산해(`{selection.projects.filter((p) =>
p.available).length} / {selection.limit ?? "unlimited"} available`) `UseProjectControl`을 붙인다.
같은 사실을 주인 페이지는 다르게 그린다(`project-list-page.tsx:20`). 서비스는 이미 `availableCount`를
계산하지만(`:176`) 로더가 버린다(`:11-13`). `selection`은 **`!access.available` 분기 안에서만** 읽히는데
`loadProjectSelection`은 무조건 `Promise.all`에 들어 있고(`:23`) 읽기 전용 트랜잭션으로 쿼리 다섯을
낸다 — 배너를 안 그리는 정상 경로도 매번 낸다.
→ 슬라이스 안에 async Server Component `LockedProjectBanner`(`ui/locked-project-banner.tsx`, `"use client"`
없음)를 두어 스스로 `loadProjectSelection`을 부르고 수량 라벨(`model`에서 파생, `availableCount` 통과)과
`UseProjectControl` 조립을 소유한다. **prop은 `userId`·`projectId`·`reason` 셋이다** — 로더가
`loadProjectSelection(userId)`(`select-project-for-use.server.ts:11`)라 `userId`가 필요하고, 사유 문장은
레이아웃이 이미 읽는 `projectAccess(projectId)`의 `access.reason`(`layout.tsx:22,34`)이며,
`projectId`는 `UseProjectControl`의 `targetId`·`selectionControlKey`에 쓴다. 이 컴포넌트는 `../api/…server.ts`를
import하므로 `index.ts`가 아니라 **`index.server.ts`**로 공개한다(`fsd.md` Public API — 서버 전용 export).
레이아웃은 `{!access.available ? <LockedProjectBanner userId={userId} projectId={projectId} reason={access.reason} /> : null}`만
그리고 `selection`을 `Promise.all`에서 뺀다(레이아웃의 `useProject`·`UseProjectControl`·`selectionControlKey`
import도 배너로 옮겨 간다). F02의 `border-rule` 수정은 이 마크업과 함께 옮겨 간다.

**F08 — 세 줄짜리 술어가 `review-gate` 클라이언트 배럴 전체를 배너의 모듈 그래프로 끌어온다** · 결합도 · Should
`src/fsd/widgets/turn-banner/model/turn.ts:7` · `features/review-gate/index.ts:3-5` ·
`widgets/turn-banner/ui/turn-banner.tsx:1,11` · `src/app/(app)/p/[slug]/layout.tsx:36` ·
`widgets/turn-banner/api/turn-data.server.ts:4`
`turn.ts:7`이 `pendingInboxCount`를 배럴로 가져오는데, 그 배럴의 첫 두 export는 `InboxCard`와
`ReopenActions`(`sonner`, `next/navigation`, `gate-text`, `reject-actions` 등을 끄는 `"use client"`
트리)다. `turn-banner.tsx`는 `"use client"`이고 `HEADLINE`을 런타임 값으로 import하므로(`:11`)
`turn.ts`와 배럴이 **모든 프로젝트 라우트**에서 렌더되는 배너의 클라이언트 그래프에 들어간다.
`landing-page.tsx:147-148`은 이 간선이 비싸다는 걸 팀이 이미 안다고 적어 두고 문구를 복제하는
비용을 치른다.
→ `pendingInboxCount`와 그것이 기대는 것 전부 — `GateRow`·`isAtGate`·`needsHumanDecision`·
`pendingInboxCount`·`resumeTargetsFor` 다섯 — 를 `entities/board-item`의 새 `model` 파일로 내리고 엔티티
`index.ts`로 내보낸다. 다섯인 이유: `needsHumanDecision`(`gate-source.ts:25-27`)이 `isAtGate`(`:19-21`)와
`resumeTargetsFor`(`:36-38`)를 부르고, 엔티티는 feature를 import할 수 없다. `features/review-gate/index.ts`는
자기 소비자를 위해 재export한다. `turn.ts:7`과 `turn-data.server.ts:4`는 엔티티를 가리킨다. 방향은 계속
아래로(widgets→entities, features→entities), 단일 출처는 유지된다. 번들 결과는 판정 근거로 쓰지 않았다.
`resumeTargetsFor`는 엔티티 안에서 `findRule("human", status, to)?.kind === "resume"`로 core를 직접 읽는다(엔티티의 core import 선례 `text-budget.ts:5`, `labels.ts:1`); `RuleKind`와
`ruleKind`는 `reopenTargetsFor`·`rejectActionsFor`가 계속 쓰므로 `gate-source.ts`에 남는다(표는 여전히
core 하나다). `gate-source.ts`는 옮긴 다섯을 엔티티에서 import해 재export한다 — `inbox-item.ts:6`,
`inbox-card.tsx:14`(F42 뒤에는 `resume-buttons.tsx`), `gate-source.test.ts:8`의 import 경로가 그대로
유효하다.

**F09 — 플랜 게이트 거절 문장마다 주인이 둘이다** · 응집도 · Should
`features/edit-pipeline/api/edit-pipeline.server.ts:14` ↔ `ui/pipeline-rail.tsx:144` ·
`features/manage-token/api/manage-token.server.ts:35` ↔ `pages/project-tokens/ui/project-tokens-page.tsx:100`
각 문장이 `src`에 정확히 두 번 — 서버 액션의 `failure(...)`와 UI의 선제 안내 — 있고 공유 상수도
묶는 시험도 없다(대조: `token-reveal.test.ts`, `turn.test.ts:231`). 하나를 고치면 다른 하나가 낡고,
사용자는 클릭 전과 후에 다른 문장을 본다. `pipeline-rail.tsx:144`는 `unavailableReason`이 없을 때만
리터럴로 떨어지므로 어긋남이 플랜 게이트 경로에서만 드러난다.
→ 쌍마다 슬라이스 `model` 세그먼트에 상수 하나(클라이언트 안전, 서버 import 없음).
`edit-pipeline`은 어댑터와 레일이 상대 경로로 import; `manage-token`은 `index.ts`로 내보내
`project-tokens-page.tsx`(이미 그 index를 import)가 쓴다. 문구 값은 그대로.

**F10 — 랜딩 데모가 제품 문구 셋을 주석 하나로만 묶어 복제한다** · 응집도·결합도 · Should
`pages/landing/ui/landing-page.tsx:141-148,167,182,185` · `widgets/turn-banner/model/turn.ts:50` ·
`features/review-gate/model/gate-text.ts:30,34`
파일 스스로 불변식을 말하고(`:142` "문구가 제품과 갈라지면 랜딩이 거짓말이 된다") 주인 셋을 이름으로
적었지만(`:144-146`), `pages/landing`에는 시험이 없고 `src`에서 쓰이는 copy-lock id는
`token-reveal-shared`·`-project`·`-user`·`owner-token-reveal`·`turn-banner-connect`뿐이다. `gate-text.ts`의 라벨을 바꾸면 공개 페이지가
존재하지 않는 화면을 설명하게 되고 아무 것도 실패하지 않는다 — `copy-lock.ts:2-3`이 이런 드리프트가
이미 두 번 있었다고 기록한 바로 그 종류다.
→ **(정정된 권고)** `docs/conventions/product-copy.md` §16에 `<!-- copy-lock:landing-demo -->`와
`<!-- /copy-lock -->` **사이의 인용 블록**을 두고(닫는 표기가 없으면 `copy-lock.ts:28`이 "not closed"로
던진다 — `copy-lock.test.ts:28`이 그걸 단언한다), 랜딩이 실제로 그리는 세 문장을 **한 줄에 하나씩**
`> `로 적는다: `Waiting on you` · `Approve implementation` · `Approving lets dev change code. Then you
run dev in Claude Code.` 문구는 재작성하지 않는다. **다만 `:176`·`:78`·`:92`를 줄째로 옮기면 안 된다**
— 앞의 둘은 표의 행이고 `:92`는 화살표가 붙은 목록 줄이며, `lockUnits`가 ` · `로 단위를 가르므로
("2 plans need verification" 등) 랜딩에 없는 단위가 쏟아져 시험이 첫날부터 떨어진다. 그 셋은 문장의
**주인**을 가리키는 것이지 옮겨 적을 원문이 아니다. 이어서 `pages/landing` 옆에 `LandingPage`를 렌더해
`missingUnits(copyLock("landing-demo"), html)`이 비었는지 보는 시험을 둔다
(`token-reveal.test.ts:13-18`과 같은 모양, 실패 메시지는 `lockFailure`). `LandingPage`의 prop은
`{ signedIn, signInAction }`(`landing-page.tsx:38`)이라 `{ signedIn: false, signInAction: async () => {} }`로
그린다 — 데모 카드는 `signedIn`과 무관하게 그려진다(`:87`, `:149-189`). 파일은 `ui/landing-page.test.ts`
(`test:web`의 `src/**/*.test.ts` 글롭에 잡힌다). 마지막으로
**`docs/architecture/verification.md:70-75`의 잠금 표에 행 하나를 더한다** — product-copy.md `:13-14`가
그 표를 id·시험의 등록처로 지정한다. 렌즈 원안(시험이 `turn.ts`·`gate-text.ts`를 직접 import)은 다른 슬라이스 내부 import라
검사기가 `lint`를 실패시킨다(두 심볼 모두 슬라이스 index에 없다). `src` 밖 파일 **둘**:
`docs/conventions/product-copy.md`(§16 블록)와 `docs/architecture/verification.md`(잠금 표 행).
둘 다 추가만 — 제품 결정 ⑥.

**F11 — revalidation 대상 둘과 `/projects` URL이 모듈 자신의 규칙을 어기고 손으로 쓰여 있다** · 응집도 · Should
`features/select-project-for-use/api/select-project-for-use.server.ts:27-28` · 규칙 `shared/routes/project.ts:1-3` ·
선례 `billing.ts`, `user-tokens.ts` · 리터럴 `app-header.tsx:25,77,82`, `project-list-page.tsx:22`,
`landing-page.tsx:47,74`, `src/app/(app)/error.tsx:26`, `src/app/(app)/not-found.tsx:15`
`project.ts:1-3`이 규칙을 말한다("revalidatePath는 … 손으로 쓰지 않는다 — 어긋나도 컴파일 오류가
아니라 조용히 낡은 화면이 남는다"). 다른 모든 액션(14곳)은 `projectPath()`/`userTokensPath()`를
쓰는데 이 어댑터만 `revalidatePath("/projects")`와 `revalidatePath("/(app)/p/[slug]", "layout")`을
직접 쓴다. 라우트 그룹 형식 자체는 설치된 Next 문서(`revalidatePath.md:160-162`)상 유효하다 —
지금 버그가 아니라 드리프트 위험이다. `src/app/(app)/p/[slug]`가 옮겨지거나 그룹 이름이 바뀌면
아무도 모르고 선택 변경 뒤 레이아웃이 낡은 배너를 낸다.
→ `shared/routes/project.ts`의 `projectPath` 옆에 `PROJECT_LAYOUT_REVALIDATE_PATH`를, `billing.ts`를
본뜬 `shared/routes/projects.ts`에 `projectsPath()`/`newProjectPath()`를 두고 어댑터와 FSD·`src/app`
리터럴이 쓴다. **`src/server/auth/config.base.ts:9`(`AFTER_SIGN_IN`)는 제외** — `src/server`는
`@/fsd`를 import할 수 없다.

**F12 — 슬러그·저장소 이름 규칙이 server/FSD 경계 양쪽에 있고 묶는 것이 없다** · 결합도·응집도 · Should
`src/server/project-slug-rule.ts:11,12,15,20` · `features/create-project/model/project-slug.ts:3,4,8` ·
`features/create-project/model/repo-url.ts:13`
`SLUG_MAX = 40`, `SLUG_RE`, `RESERVED_SLUGS`, GitHub 세그먼트 정규식이 두 트리에 바이트 동일하고,
`project-slug-rule.ts:8-10,18-19`가 그렇다고 명시한다("두 곳을 함께 고쳐야 한다 … 다르면 웹 폼이
받는 슬러그와 에이전트가 만드는 슬러그가 갈린다"). 각 복사본에 시험이 있지만 서로를 import하지
않는다. 한쪽만 고치면 `POST /api/projects`와 웹 폼이 다른 입력을 받고, 그 실패는 운영에서만
드러난다.
→ **(정정된 권고)** `project-slug-rule.test.ts` 옆에 형제 파일의 **소스 텍스트**를 읽어 네 상수가
같은지 단언하는 시험(선례: `copy-lock.ts:9`가 시험에서 파일을 읽는다). 직접 import는 양방향 모두
불가능하다 — server→FSD는 `server/no-fsd-import`(검사기 `:245`), FSD→server는
`fsd/server-import-boundary`(`:255`, `/api/` 세그먼트의 서버 경계 파일만 예외).
`gate-source.test.ts`의 선례는 FSD↔`packages/core`라 옮겨 오지 않는다. 중복은 유지하고 드리프트만
시끄럽게 만든다.

### 묶음 3 — 계약을 이름·타입·시험으로 고정 (Should ×7)

**F13 — Server Action이 React의 `use` 접두사로 export되어 컴포넌트 서명까지 흘러간다** · 예측가능성·가독성·TypeScript · Should
`features/select-project-for-use/api/select-project-for-use.server.ts:16` · `index.server.ts:1` ·
`pages/project-list/ui/project-list-page.tsx:14,43` · `src/app/(app)/projects/page.tsx:3,10` ·
`src/app/(app)/p/[slug]/layout.tsx:8,34` · `project-list-page.test.mjs:14,26`
`export async function useProject(input: unknown)`이 일반 로더 옆에 재export되고, 컴포넌트 본문에서
`ProjectListPage({ model, useProject })`로 구조분해된 뒤 `action={useProject}`로 넘어간다 — 잎 컴포넌트는
이미 `action`이라 부른다(`use-project-control.tsx:8,10`). 형제 액션은 `humanTransition` 하나를 빼면
동사 우선이다(`createProject`, `issueToken`, `savePipeline`, `proposeItem`, `approveGate`, `discardItem`) —
`humanTransition`도 `use` 접두사처럼 다른 뜻으로 읽히지는 않으므로 이 건의 대상이 아니다.
`eslint-plugin-react-hooks` 권장 규칙이 `eslint-config-next`로 전역 활성이다. 컴포넌트 본문 첫머리의
`use*` 바인딩은 읽는 사람과 훅 린트에 훅으로 읽히고, 조건부로 부르는 순간 훅이 아닌 함수에
`rules-of-hooks` 오류가 난다.
→ 동사로 바꾸고 prop은 `action`으로 통일한다. **세 렌즈가 제안한 `selectProjectForUse`는 같은 파일
`:6`의 import·`:21`의 호출과 충돌하므로** 다른 이름(예: `selectProject`)을 쓰거나 import에 별칭을
준다. 바뀌는 곳: 정의 `select-project-for-use.server.ts:16`, 재export `index.server.ts:1`,
`project-list-page.tsx:14,43`, `projects/page.tsx:3,10`, `layout.tsx:8,34`, fixture `project-list-page.test.mjs:14,26`
(prop 키 `useProject` → `action`). 기계적 변경, 문구 무관. F07(묶음 2)이 먼저 들어가 있으면
`layout.tsx:8,34`의 두 곳은 `ui/locked-project-banner.tsx`로 옮겨 가 있다.

**F14 — 한 레이어에 실패 규약이 넷이고, 하나는 필드 부재로 성공을 표현한다** · 예측가능성 · Should
`shared/api/result.ts:5-7` · `features/edit-backlog/model/backlog-form-state.ts:3,6-7` ·
`features/create-project/model/create-project-state.ts:6-9` ·
`features/select-project-for-use/model/select-project-state.ts:3` · `features/manage-token/api/manage-token.server.ts:12-13`
`ActionResult<T>`는 어댑터 다섯이 쓰고, `BacklogFormState = { error?: string }`은 `{}`가 성공이라
payload를 실을 수 없으며, 두 슬라이스는 `status` 태그 유니온이다. 규약을 하나로 두자는 주장은 코드가
스스로 한다(`manage-token.server.ts:12` "같은 layer에서 실패 규약이 두 벌이 되지 않게",
`create-project-state.ts:2-5`). `BacklogFormState`는 `edit-backlog/index.ts:4`가 내보내는
`BacklogFormAction`·`RemoveBacklogAction`의 반환형으로 공개된 슬라이스 간 계약이고, 같은 화면
(`ProjectBacklogPage`)이 `{error?}` 폼과 `ActionResult` 버튼을 나란히 그린다.
→ `BacklogFormState`만 판별 유니온 `{ status: "idle" } | { status: "saved" } | { status: "error"; error: string }`
으로 옮긴다 — 같은 레이어의 `useActionState` 폼 선례 `CreateProjectState`와 같은 모양이고 `idle`이
`useActionState` 초기값이 된다. 바뀌는 곳: 계약 `model/backlog-form-state.ts:3,6-7`; **생산자**
`api/edit-backlog.server.ts`(`return {}` 셋 `:48,:65,:84` → `{ status: "saved" }`, `{ error: … }` 반환 전부
`:17,21,22,24,39,43,55,58,63,71,76,82` → `{ status: "error", error: … }`); 소비자 `backlog-form.tsx:19-25,47`
(`!next.error` → `next.status !== "error"`, 초기값 `{}` → `{ status: "idle" }`, `state.error` 읽기)와
`remove-backlog-button.tsx:25-26`. 두 `status` 폼 상태는 그대로.

**F15 — `canWrite`가 optional에 허용 기본값이고 극성이 섞여 읽힌다** · 가독성·예측가능성 · Should
`features/review-gate/ui/inbox-card.tsx:32,35,84,87,95,97,102,117` · `pages/project-inbox/ui/project-inbox-page.tsx:3,11` ·
대조 `features/edit-backlog/ui/backlog-table.tsx:21`, `pages/board-item/ui/board-item-page.tsx:49` ·
유일 호출자 `src/app/(app)/p/[slug]/inbox/page.tsx:20`
`InboxCard`는 `canWrite?: boolean`에 기본값 `true`, `ProjectInboxPage`가 optional로 받아 그대로
넘긴다. 형제 둘은 필수다. 90줄 남짓한 return(`:60-151`) 안에서 `!canWrite`(`:84`, `:117`)와 `canWrite`(`:87,:95,
:97,:102`)가 섞이고 `:117`만 `null`을 참 가지에 둔다. 인가 플래그의 기본값이 **fail-open**이라 prop을
빠뜨린 새 호출부가 서버가 거부할 프로젝트에서 Approve/Resume/Send back/Hold/Discard를 다 그린다.
→ 두 컴포넌트 모두 `canWrite: boolean` 필수로(유일 라우트는 이미 넘긴다), `:117`을
`{canWrite ? <RejectActions … /> : null}`로. 기본값을 두려면 `false`여야 한다(제품 결정 ④).

**F16 — 거부 시 throw하는 함수 셋이 결과형 서명으로 공개 재export된다** · 예측가능성·가독성 · Should
`src/server/pipeline/board-query.ts:17-26,184,188,202,204,213,435` · `board.ts:6` · `board-query.test.ts:92-96`
`reportFailure`(`:18-26`)가 `BoardRejection`을 `{ ok: false, reason }`으로 바꾸는데, `:435`의
약 500자짜리 한 줄이 열아홉 멤버 중 **여덟**에만 인라인으로 적용한다. `transitionIn`은 감싸지지 않았지만
같은 결과 모양이라 `:188`·`:204`에서는 `fail(...)`을 돌려주고 `:202`(`decideTransition` 거부)·
`:213`(CAS 실패 `stale`)에서는 던진다. `board.ts:6`이 열아홉을 평평하게 재export해 구분을 지운다.
기존 시험은 값 경로만 본다. 미래의 `board.transitionIn` 호출자는 `r.ok`로 분기하다 대부분의 거부
경로에서 잡히지 않은 `BoardRejection`을 새게 된다.
→ `board.ts:6`에서 `transitionIn`·`advanceRun`·`resetRun` 재export를 뺀다 — grep으로
`board-query.ts`와 그 시험 밖에는 소비자가 없음을 확인했다. 선택: `:435`를 `throwsOnRejection` /
`reads` / `returnsResult`로 묶어 정의에서 보이게 한다.

**F21 — `packages/core` 값이 `src`로 `any`로 넘어와 검사 없는 캐스팅과 무효 단언을 강요한다** · TypeScript · Should
`features/edit-pipeline/model/rail-state.ts:9,34` · `features/edit-pipeline/api/edit-pipeline.server.ts:15-16` ·
`entities/pipeline/model/labels.ts:6-8` · `pages/project-board/model/briefing.ts:145` ·
`widgets/turn-banner/model/turn.ts:188` · `src/server/pipeline/run-rules.ts:76-77`
(출처 `packages/core/pipeline.mjs:16-21` — 근거로만)
`tsconfig`는 `allowJs`·`strict`에 `checkJs` 없음이고 `packages/core`에 선언 파일(`.d.ts`·`.d.mts`)이 없다.
`PROJECT_AGENTS.includes(slotAgent(...))`가 `strict`에서 컴파일되는 것(`rail-state.ts:9`,
`turn.ts:188`)은 반환이 `any`일 때만 가능하고, 따라서 `rail-state.ts:9`·`briefing.ts:145`의 `!`는
아무 것도 검사하지 않는다. `validateGraph`의 실제 모양은 판별 유니온인데 두 곳이 똑같이
`as { ok: boolean; reason?: string }` 뒤 `v.reason ?? "invalid"`로 받는다 — `reason`이 개명되면
**모든** 거부 문장이 "invalid"로 바뀌어 `rail-state.ts:1-2`의 목표("이유를 그대로 보여 준다")가
무너진다. core의 이름 변경이 컴파일 실패 대신 조용히 틀린 라벨·로스터·저장 오류가 된다.
→ TS로 건너오는 함수(`slotAgent`, `validateGraph`, `advance`, `sequence`, `defaultGraph`,
`dispatcherFor` — 전부 `pipeline.mjs`)에 형제 선언 파일 **`packages/core/pipeline.d.mts`**를 손으로 쓴다 —
기존 캐스팅과 `!`를 지울 수 있다. **확장자는 `.d.ts`가 아니라 `.d.mts`여야 한다:** TypeScript는 `.mjs`
import에 대해 `.mts` → `.d.mts` → `.mjs`만 찾고 `pipeline.d.ts`는 **조용히 무시**한다. 이 저장소의
`tsconfig`(allowJs·strict·`moduleResolution: "bundler"`·`paths`)와 같은 설정의 최소 재현에서 확인했다
(2026-09-23): `.d.ts`를 두면 반환이 여전히 `any`라 틀린 대입이 통과하고, `.d.mts`를 두면 오류가 난다.
`.d.ts`로 넣으면 캐스팅을 지워도 `tsc`가 통과해 "통과 = 증명"이라는 이 건의 검증이 거짓 녹색이 된다.
**선언 파일이 생기면 그 모듈의 타입은 선언 파일만으로 정해진다** — 그래서 `src`·`tests`·`scripts`의 TS가
`pipeline.mjs`에서 import하는 18개 이름(`advance`·`allowsPipelineEdit`·`BOUNDARY`·`boundaryOf`·
`cursorForStatus`·`defaultGraph`·`dispatcherFor`·`gateId`·`gateKind`·`isGateId`·`NODE_KINDS`·
`PROJECT_AGENTS`·`REQUIRED_NODES`·`sequence`·`SLOT_FORMAT`·`slotAgent`·`TAIL_NODES`·`validateGraph`)을
전부 선언해야 하며, 빠진 이름은 `tsc`가 "has no exported member"로 잡는다. `transitions.d.mts`는 이 건에
필요 없다(위 여섯 함수가 모두 `pipeline.mjs`에 있다); 넣는다면 같은 이유로 TS가 import하는 8개
(`canDiscard`·`canPropose`·`canRecordValidation`·`checkText`·`findRule`·`isOpen`·`STATUSES`·
`TEXT_LIMIT`)를 전부 선언한다. **선언이 들어가면 `any`가 숨기던 `null`이 컴파일 오류로 드러나는 곳이 있다**
— 캐스팅을 지우는 것만으로 끝나지 않는다. `slotAgent`를 실제 모양대로 `string | null`로, `PROJECT_AGENTS`를
문자열 배열로 선언하면 `PROJECT_AGENTS.includes(slotAgent(…))` 일곱 곳이 `string | null`을 `string` 자리에
넘겨 실패한다: `rail-state.ts:9,25`, `pipeline-rail.tsx:44,50,132`, `briefing.ts:48`, `turn.ts:188`. 이것이 이 건이
노리는 효과다(지금은 `null`이 `includes`로 흘러가도 아무도 모른다). 각 자리를 `const agent = slotAgent(id);
agent !== null && PROJECT_AGENTS.includes(agent)` 모양으로 고친다. 선언 뒤 불필요해지는 단언도 함께 지운다:
`!` 둘(`rail-state.ts:9`, `briefing.ts:145`), `validateGraph` 캐스팅 둘(`rail-state.ts:34`,
`edit-pipeline.server.ts:15`), `as string | null` 둘(`board-query.ts:423`의 `cursorForStatus`,
`p/[slug]/page.tsx:28`의 `dispatcherFor` — NUL 바이트가 든 파일이므로 F17-A 뒤), 배열 `as string[]` 넷
(`pipeline-rail.tsx:25-27`, `project-pipeline-page.tsx:42`; 시험 파일의 같은 캐스팅은 그대로 둬도 된다).
**`src` 밖 변경이라 제품 결정 ⑨.** 안전 근거(`.d.mts` 기준으로 재확인):
`scripts/plugin-lib.mjs:9`는 이름이 `.mjs`로 끝나는 파일만 미러하므로 `.d.mts`는 `plugin/lib`에 실리지
않고 `plugin-lib --check`를 깨지 않는다; `verify-fsd-boundaries.mjs:16`의 `SOURCE_EXTENSIONS`에 `.mts`가
없어 검사기는 이 파일을 읽지 않는다. `eslint`가 `.d.mts`를 린트하는지는 `npm run lint`로 확인한다. 거절되면
src 안 대안: `validateGraph` 결과 타입을 `rail-state.ts`에 한 번 선언하고
`edit-pipeline.server.ts`가 import한다.

**F22 — 실패 핸들러 둘이 밋밋한 리터럴만 남기고 원인을 버린다** · TypeScript · Should
`src/server/agents/next.ts:186-189` · `src/server/github.ts:40-46`
둘 다 바인딩 없는 `catch {}`로 미리 아는 컨텍스트만 로그한다. `github.ts:41-43`의 주석은 코드와
반대다("조용히 삼키지는 않는다 … 그 이유는 로그에만 남는다") — 실제로는 `{ category: "request" }`
리터럴만 남는다. `next.ts`가 감싸는 것은 `commitOutcome`, 즉 `StaleCursor`·`CursorRollback`·15초
트랜잭션 예산으로 지키는 원장/CAS 쓰기라, P2034 직렬화 실패·타임아웃·제약 위반이 로그에서 구분되지
않는다. `next.test.ts:555-563`이 이 분기가 닿는다는 걸 확인한다.
→ `catch (error)`로 바인딩하고 로그에 `error`를 싣는다(`github.ts`도 한 토큰 변경). 문구 무관.

**F23 — MCP 사용 불가 프로젝트 게이트가 핸들러마다 opt-in이고, 시험이 대상 도구를 손으로 나열한다** · TypeScript · Should
`src/server/mcp/tools.ts:67-70,118-122`(+ `:212-216`까지 11회 반복) · `tools.test.mjs:96-112`, `:31-37`
등록된 열세 핸들러 중 열둘이 같은 다섯 줄(`scope` → `guardUnavailable`)로 시작한다; `project_get`은
의도적으로 예외(`:110-114`). 회귀 시험은 열두 이름을 리터럴 배열로 적고(`:97-105`), 구조 시험은
등록 이름이 `AGENT_TOOL_NAMES`와 같은지만 본다 — 새 도구가 게이트를 빼먹어도 둘 다 통과한다.
`:81-84`의 주석이 `scope()`에 대해 경고하는 바로 그 드리프트 종류다.
→ **(시험만)** `tools.test.mjs:97`이 손으로 쓴 배열 대신 `AGENT_TOOL_NAMES`에서 허용 목록
(`project_get`)을 뺀 집합을 순회하게 한다. `scopedTool(deps, handler)` 래퍼 추출은 시험이 불변식을
덮은 뒤의 선택적 후속이다.

### 묶음 4 — 읽기 비용 (Should ×4)

**F05 — `addNode`의 주석이 설명하는 가지가 죽은 코드다** · 가독성 · Should
`features/edit-pipeline/model/rail-state.ts:46-62`(특히 `:49`, `:58-60`)
`:49`가 `TAIL_NODES`에 없는 모든 kind를 early-return하므로 `:58`의 삼항은 항상 참이고 `:60`의 거짓
가지(`NODE_KINDS`로 앞머리를 다시 세우는 한 줄)는 닿지 않는다. 함수의 유일한 설명(`:46-47` "앞머리는 골격 순서로 다시 세우고")은 바로 그
죽은 가지를 설명한다; 살아 있는 경로는 `:50-52`의 `splice`이고 `rail-state.test.ts:91-96`이 고정한다.
→ `:58-60`을 `const nodes = [...head, ...tail, kind];`로 줄이고 "골격 순서" 문장을 `:49-53`으로 올린다.
`:60`이 `NODE_KINDS`의 유일한 사용처이므로 `:3`의 import에서 `NODE_KINDS`도 뺀다.

**F18 — "에이전트가 일하는 중" 헤드라인 세부를 다섯 갈래 중첩 삼항이 만든다** · 가독성 · Should
`widgets/turn-banner/model/turn.ts:194-204`(대조 `:131-138`)
반환 객체 리터럴 안에서 삼항 네 개가 중첩되어 다섯 가지로 갈리고 `w.node === "verify"`가 두 가지에서 다른 문구로 검사된다
(`:197`, `:200-201`) — 손으로 평탄화해야 보인다. 같은 파일이 형제 문제를 `NODE_LINE` 매핑
(`:131-138`)으로 이미 풀었다.
→ `workingLine(w: TurnItem)`을 뽑아 `!w.dispatched` early return, 또는 `NODE_LINE` 관용구를
`WORKING_LINE` 맵으로 확장. 문구 무관.

**F19 — 인접한 두 줄이 한 결정을 서로 뒤집힌 다른 모양으로 적는다** · 가독성 · Should
`widgets/turn-banner/ui/turn-banner.tsx:60,63` · 타입 `model/turn.ts:39`
`:60`은 `turn.kind === "mine" && tab === "inbox" && turn.open.kind === "inbox"`일 때 세부를 숨기고,
`:63`은 `turn.kind === "mine" && (tab !== "inbox" || turn.open.kind === "item")`일 때 버튼을 보인다.
`TurnTarget`이 `{kind:"inbox"} | {kind:"item"}`이므로 후자는 전자의 정확한 드모르간 부정이다.
`FullBanner`는 `turn.kind === "mine"`을 네 번 재좁힌다(`:60-63`); 같은 파일의 `compactView`
(`:89-108`)가 나은 모양을 보여 준다. 한쪽만 고치면 버튼은 있는데 세부가 없는 배너가 된다.
→ `const inboxCardsAreBelow = …` 하나를 두 곳에서 쓴다.

**F20 — 원장의 재전송 수락 판정이 이름 없는 열 항 결합식이다** · 가독성 · Should
`src/server/agents/run-query.ts:45-48`(정제 `:49-55`, 소비 `:57,:69,:71,:76`, 전제 `:32`)
`closedTerminal`이 네 줄에 걸쳐 outcome 소속·`prior?.closedAt`·`receipt!`/`entry`에 대한 일곱 항등
비교·`plan`/`hold` 상태 분기를 한 식으로 묶고, `:71`이 조건 셋에 네 갈래 선언을 더한 가드를 붙인다. 이름은 주어도 물음도
말하지 않고, `receipt!` 셋은 `:32`에서 멀리 강제되는 전제를 숨긴다. 이 술어가 닫힌 run에 대한 재전송
outcome을 기록할지 버릴지 정한다(`next.ts:191`, `next.test.ts:312-347`) — 대상 안에서 결과가 가장
큰 이름 없는 조건이다.
→ 같은 클로저 안에서 `receiptMatchesPriorRun`, `priorStepIsRecordedTerminal`, `closedTerminal`
세 개의 이름 있는 `const`로 나눈다. 제어 흐름 변화 없음.

### 묶음 5 — 표면 정리 (Consider ×19)

**F24 — `remove`가 쓰지 않는 두 컴포넌트를 통과한다** · 결합도
`src/app/(app)/p/[slug]/backlog/page.tsx:33` · `pages/project-backlog/ui/project-backlog-page.tsx:15,32` ·
`features/edit-backlog/ui/backlog-table.tsx:24,68`(슬롯 선례 `:26,67`)
→ `renderRowActions?: (row) => ReactNode` 슬롯으로 `ProjectBacklogPage`가 `<ProposeButton/>`과
`<RemoveBacklogButton remove={remove}/>`를 조합; `BacklogTable`은 `remove`를 버린다. 구현 주의:
`renderAction`은 `row.status === null`일 때만 그린다(`:67`) — 그 조건이 같이 옮겨가야 하고,
`backlog-table.test.mjs:8`이 `remove`를 넘긴다. `RemoveBacklogButton`은 지금 `edit-backlog/index.ts`에 없으므로
(`BacklogTable`만 `./remove-backlog-button`을 상대 경로로 쓴다, `backlog-table.tsx:9`) pages 층이 조합하려면
**`index.ts`에 export를 더해야 한다** — 없으면 `fsd/no-deep-import`로 `lint`가 실패한다. `BacklogTable`의 머리
주석(`backlog-table.tsx:29-30` "상호작용하는 조각은 마지막 열의 RemoveBacklogButton 하나뿐")도 그 버튼이
슬롯으로 빠지므로 고친다. 삭제됨 행의 "Removed"와 `canWrite` 분기(`:64-70`)는 표에 남는다.

**F25 — 대상 안의 유일한 `export *`가 한 모듈에 공개 표면 둘을 준다** · 결합도
`src/server/pipeline/run.ts:1-2` · 소비자 `page.tsx:5`, `pipeline/page.tsx:7`, `turn-data.server.ts:8`, `mcp/deps.ts:11` ·
우회 `board-query.ts:8`, `run-rules.ts:6`, `agents/next.ts:6` · 대조 `board.ts:4-6`
`run-query.ts`의 열한 export 중 배럴 소비자 다섯 — 위 넷과 범위 밖 `tests/server/integration/board.test.ts:4` —
은 넷(`loadCurrentVersionView`·`headFor`·`nextFor`·`ensureRun`)만 쓴다. → `board.ts`처럼 명시 목록으로
바꾼다. **`ensureRun`을 목록에서 빠뜨리면 범위 밖 통합 시험이 깨진다** — `tsconfig`가 `tests/`를
포함하므로 `tsc --noEmit`이 누락을 잡는다. F39가 먼저 들어가면 `turn-data.server.ts:8`의 import가
사라지지만 두 라우트가 `loadCurrentVersionView`를 계속 쓰므로 목록은 같다.

**F26 — 보드 UI의 정확한 Tailwind 클래스 단언이 모델의 시험 파일에 산다** · 결합도
`pages/project-board/model/briefing.test.mjs`의 `describe("ProjectBoardPage")`(`:267-316`, 클래스 단언은 `:277-282`) · `ui/project-board-page.tsx:42`
`/<span class="text-sm text-quiet">/` 같은 정확 일치가 `cn("text-sm", isQuiet && "text-quiet")`에
묶여, 유틸리티 하나만 더해도 `buildBriefing` 이름의 파일이 실패한다. → `describe("ProjectBoardPage")`
(`:267-316`)와 그것만 쓰는 도우미 `renderBoard`·`activityLinks`(`:257-266`)를 `ui/project-board-page.test.mjs`로
옮긴다. **단순 이동으로는 안 된다** — 그 블록이 쓰는 고정값 `ROSTER`·`TODAY`·`row`·`BOARD`(`:10-38`)는
`describe("buildBriefing")`(`:54-255`)도 쓴다. 두 벌로 베끼지 않도록 이 넷을 `model/briefing.fixture.mjs`로 빼서
두 시험이 import한다(`test:web` 글롭 `src/**/*.test.mjs`에 잡히지 않는 이름). 새 시험은 `buildBriefing`을
`../model/briefing.ts`에서, 컴포넌트를 `./project-board-page.tsx`에서 가져온다. 시험 수는 옮기기 전과 같다. `project-list-page.test.mjs`·
`pipeline-rail.test.mjs`의 구조 가드는 의도된 것(`project-list-page.test.mjs:27`)이라 범위 밖.

**F27 — 원격 호출 가능한 엔드포인트가 "server-only" 파일 열한 줄 안쪽에 `unknown` 매개변수로 선언돼 있다** · 예측가능성
`features/select-project-for-use/api/select-project-for-use.server.ts:1,9,11,16-17` · `model/select-project-state.ts:4`
`import "server-only"` 머리에 `"use server"`는 `:17` 함수 본문 안; 형제 어댑터 일곱은 전부 1행에
둔다. `(input: unknown) => …`는 타입된 `SelectProjectAction`에 대입 가능해 어긋남이 컴파일에서
안 드러난다. → 매개변수를 `z.input<typeof inputSchema>`로 타입한다(zod 검증은 그대로).

**F28 — 함께 와야 하는 prop 둘이 독립 optional/nullable로 선언돼 있다** · 예측가능성
`pages/project-backlog/ui/project-backlog-page.tsx:11,13-14,33` + `src/app/(app)/p/[slug]/backlog/page.tsx:30-32` ·
`pages/project-pipeline/ui/project-pipeline-page.tsx:10-11,28` + `pipeline/page.tsx:23-24`
불변식이 타입 대신 주석(`:13` "편집할 항목이 있을 때만 온다 — 없을 때 add로 대신 채우면 '수정'이
조용히 새 항목을 만든다")에 있고 렌더에서 `editing && update ? … : …`로 화해한다. 타입이
`{ editing }`만 있는 값을 허용하므로 URL이 `?edit=FEAT-01`인데 Add 폼이 그려지는 바로 그 실패를
막지 못한다. → `editing?: { item; update }`, `saved?: { version; at }`로 합친다. 호출자 각 하나.

**F29 — `cardClass`가 이름 없는 위치 불리언을 받고, 호출부 넷 중 하나만 우회한다** · 예측가능성
`shared/ui/card.tsx:7,15,17` · `pages/landing/ui/landing-page.tsx:138-139,168` · `features/review-gate/ui/inbox-card.tsx:63` ·
`backlog-form.tsx:28` · `inbox-card-boundary.tsx:17`
랜딩만 `const IS_DECISION_CARD = true`와 주석으로 뜻을 살렸다. → 옵션 객체
(`cardClass({ decision, className })`)로 바꾸고 우회를 지운다. 호출부 넷.

**F30 — `registerProjectIn`이 `Promise<string | null>`을 돌려주는데 문자열이 실패다** · 예측가능성
`src/server/project-registration-query.ts:22-26,28-34,38` · 호출자 `features/create-project/api/create-project.server.ts:36,45`
래퍼는 `result.status === "capped" ? result.reason : null`이고 형제 `registerProjectResultIn`은
판별된 `RegisterProjectResult`를 준다. 웹 호출자는 값을 `capped`로 개명해 뜻을 복원한다.
`null`=성공 극성은 `src/server`의 다른 모든 `ok`/`status` 계약과 반대다. → `create-project.server.ts`가
`registerProjectResultIn`을 직접 쓰고 `result.status === "capped"`로 분기한다(`:36`, `:45`). **래퍼 삭제는
이 문서에서 하지 않는다** — 범위 밖 `scripts/rehearse-project-availability-d3.ts`가 null=성공 계약으로
네 곳(`:10` import, `:140`, `:152`, 그리고 `:85-92`의 문자열로 만든 자식 스크립트)에서 쓰며, 지우면 `tsc`가
그 스크립트에서 실패한다(`tsconfig`의 `**/*.ts`가 `scripts/`를 포함). 대신 래퍼의 주석(`:36-37` "기존
호출자(웹 폼)는 … registerProjectIn을 그대로 쓰고")을 "D3 리허설 스크립트 전용 — 새 호출자는
`registerProjectResultIn`"으로 고친다. 래퍼 삭제는 그 스크립트를 함께 고치는 후속이다.
`project-registration-query.test.ts:38-68`은 래퍼가 남으므로 그대로 유효하다.

**F31 — "이 게이트를 승인할 수 있나"가 느슨한 필드 셋에서 세 곳에서 재파생된다** · 예측가능성
`features/review-gate/model/inbox-item.ts:9-12,17,88-89,106-107` · `ui/inbox-card.tsx:92` · `src/server/pipeline/board-query.ts:274`
`format?`·`gateEntry?`·`gate`가 독립 선언이고 빌더는 `gateEntry`를 두 id가 있을 때만 붙인다(`:89`)
— `{ gate, format: "slots-v1", gateEntry: undefined }`가 표현 가능하다. `gateCardKey`(`:107`)와 카드의
승인 payload(`:92`), 서버 거부(`:274`)가 각자 조합을 다시 판단한다. 지금 위험은 낮다(`:89`가 유일한
생산자, `src/server/pipeline/run-query.ts:61`이 런타임 방어). → **(축소된 권고)** `inbox-item.ts`에
`slotGateEntry(item): GateEntry | null` 하나를 두어 `gateCardKey`와 승인 payload가 같이 쓴다. 세 파일에
걸친 판별 유니온 재작성은 근거보다 크다.

**F32 — `gate-source.ts`의 복제된 doc 주석이 다른 함수를 설명한다** · 가독성
`features/review-gate/model/gate-source.ts:22,46-53`(정본 `:23-24`, `:29-30`)
`:22`는 빈 `// …`; `:46-52`는 `needsHumanDecision`·`pendingInboxCount`의 doc을 그대로 옮겨 놓았는데
`rejectActionsFor`(`:55`) 위에 있고, 그 안의 "§7 순서" 언급은 `inbox-item.ts:49`의 것이다.
→ `:22`와 `:46-53`을 지운다(복제본 쪽). 동작 변화 없음. F08이 먼저 들어가면 `:22`는 엔티티로 옮기는
구간(`:16-38`) 안에 있으므로 옮기면서 버리고, 남는 것은 `:46-53`뿐이다.

**F33 — 타입 이름 셋이 서로 import하는 두 디렉터리에서 다른 모양으로 두 번 선언돼 있다** · 가독성
`src/server/agents/next.ts:21,26,210` vs `pipeline/run-rules.ts:17`, `pipeline/run-query.ts:13,15` ·
교차 `agents/next.ts:6` · 만나는 곳 `mcp/deps.ts:4,11`
`NextInput`·`RunRow`·`Facts`(한쪽은 캐시 클래스, 한쪽은 export된 레코드); `run-query.ts`도 두 개.
→ pipeline 쪽 셋을 `PipelineNextInput`·`PipelineRunRow`·`PipelineFacts`로(덜 참조되는 쪽이고, 같은
파일의 공개 이름 `PipelineNext`·`PipelineEntry`·`PipelineOverview`와 접두사가 맞는다). 순수 개명, 공개
`PipelineNext`는 그대로. 개명이 닿는 곳: `run-rules.ts:17,50`, `run-query.ts:13,15,59`,
`run-query.test.ts:4,6`(`mcp/deps.ts`는 두 모듈의 함수만 import하고 이 타입 이름은 쓰지 않는다).

**F34 — `editable`이 참일 때만 그려지는 가지 안의 `disabled={!editable}` 넷** · 가독성
`features/edit-pipeline/ui/pipeline-rail.tsx:150-151,195-197,251-259,263-271`
`pipeline-rail.test.mjs:13-15`가 `editable`이 거짓이면 `<button>`이 아예 없음을 단언한다.
→ 넷에서 `!editable`만 지운다: `:151`은 `disabled={!dirty || pending}`으로, 세 버튼(`:197`, `:256`, `:266`)은
F04 전이면 `disabled` 속성째 지우고, **F04 뒤면 이미 `disabled={!step.ok}`이므로 손대지 않는다** —
어느 순서든 F04의 `!step.ok`는 남아야 한다. 동작 동일.

**F35 — Int32 상한이 두 모듈과 시험에 맨 리터럴로 있다** · 가독성
`src/server/agents/next.ts:121-123` · `src/server/mcp/tools.ts:211` · `tools.test.mjs:232`
`> 2147483647`와 `.max(2147483647)`이 한 저장 제약(`AgentRun.revision` Int)을 이름 없이 두 번 말하고,
`next.ts:121-123`은 zod 스키마를 손으로 다시 쓴 여덟 항 조건이다. → `next.ts`에 `REVISION_MAX`를
`NOTE_MAX`·`RATE_LIMIT` 옆에 export(`tools.ts`는 이미 거기서 `NOTE_MAX`·`OUTCOMES`를 import),
`:121-123`을 `isWellFormedReceipt(receipt)`로.

**F36 — 상태 아홉 조각과 부분 초기화 헬퍼 다섯이 이름 없는 3방향 모드를 인코딩한다** · 가독성
`features/create-project/ui/new-project-form.tsx:25-35,41-84,100,118,137`
`isRepoChosen`은 파생(`:37`), `isManualEntry`는 독립 상태라 `isRepoChosen && isManualEntry`가 표현
가능하고 삼항 순서로만 해소된다. 파일의 버그 주석 둘(`:39-40`, `:81`)이 그 물음이 틀리게 답해진
사례다. → `type Mode = "picker" | "manual" | "chosen"`을 한 곳에서 파생해 분기한다. `query`를
`RepoPicker`로, `pasteError`를 수동 입력 블록으로 옮기는 것은 후속이며 **F01 뒤**에 한다(같은 분기
조건을 바꾼다).

**F37 — 접두사 없는 불리언 다섯과 리터럴로 갈리는 플랜 축** · 가독성
`features/select-project-for-use/ui/use-project-control.tsx:12,15-21,30,49,53`
`confirming`·`submitting`·`refreshing`·`pending`·`full` — 형제 클라이언트 컴포넌트는 `isPanelOpen`·
`isPending`(`reject-actions.tsx:38,41`), `isNoteMissing`, `isManualEntry`를 쓴다. `full`은 배열
`current`(`:18`) 바로 아래라 컬렉션 둘로 읽힌다. `model.plan`을 `:21`·`:53`에서 리터럴로 갈라 `"max"`가
암묵적이다. → `isConfirming`/`isSubmitting`/`isRefreshing`/`isPending`/`isSelectionFull`,
`current` → `availableProjects`; 선택적으로 `needsReplacementChoice`.

**F38 — 클립보드 실패 경로가 아무 신호도 내지 않는다** · TypeScript
`shared/ui/copy-button.tsx:25-32` · 소비자 `entities/project-token/ui/token-reveal.tsx:23,34,118,129`, `owner-token-reveal.tsx:15,28`
`catch { setCopied(false); }` — 오류 값은 바인딩·로그·보고 어느 것도 안 되고 첫 클릭에서는 no-op이다.
비보안 origin에서 `navigator.clipboard`는 `undefined`라 `TypeError`가 삼켜진다. 사용자 fallback은
의도된 것(`copy-button.tsx:7`이 문서화, `token-reveal.tsx:22`가 토큰을 선택 가능한 `CodeBlock`으로
그림)이라 막다른 길이 아니라 진단 손실이다. → `catch (error) { setCopied(false); console.error(error); }`.

**F39 — `SetupState.hasPropose`가 실제 쿼리로 계산되지만 아무도 읽지 않는다** · TypeScript
`widgets/turn-banner/model/turn.ts:25,58-86` · `api/turn-data.server.ts:67` · fixture `model/turn.test.ts:7,39,228`
`setupSteps`는 `tokenIssued`·`rosterSynced`·`backlogCount`만 읽는다. 살아 있는 쌍둥이는
`run-rules.ts:82,90`이다. → `SetupState`, `turn-data.server.ts:67`, fixture 셋에서 지운다(쓰는 쪽을
택하면 문구가 바뀐다 — 제품 결정 ⑦). 지우면 `turn-data.server.ts`에서 `version`(`:15`의 구조분해,
`:25`의 `loadCurrentVersionView(prisma, projectId)`)을 읽는 곳이 `:67`뿐이었으므로 그 읽기와 `:8`의 import도
함께 지우고, `:13` 주석의 "hasPropose는 현재 버전의 nodes에서"도 뺀다 — 남기면 배너가 모든 프로젝트
라우트에서 쓰지 않는 쿼리를 계속 낸다.

**F40 — 타입 시스템이 못 보는 가드를 `receipt!` 단언만이 잇는다** · TypeScript
`src/server/agents/next.ts:121-127,157` · `src/server/agents/run-query.ts:32,42,44,46,65,71`
검증이 복합 조건(`if (input.outcome && (!input.receipt || …)) return fail(...)`) 안에 있어 좁힘이
없고, 이어서 `input.receipt!.runId`(`:127`)·`const receipt = input.receipt!`(`:157`)이 온다.
가드가 완화되거나 순서가 바뀌면 컴파일 오류 대신 트랜잭션 안의 `undefined.runId`가 된다
(`agents/next.test.ts:502-535`, `agents/run-query.test.ts:39-52`가 존재하는 이유). → `const { outcome, receipt } =
input;` 뒤 중첩 검증으로 컴파일러가 좁히게 하고 좁혀진 `const`를 쓴다. `run-query.ts`도 같은 모양.

**F41 — 금지한다는 주석 바로 밑의 하드코딩 localhost 기본값** · TypeScript
`src/server/public-url.ts:1,3` · 렌더 `pages/project-tokens/ui/project-tokens-page.tsx:78,93`, `token-reveal.tsx:62`, `owner-token-reveal.tsx:41`
`:1` "기본값을 코드에 박지 않는다(C11) — .env의 HARNESS_PUBLIC_URL을 쓴다", `:3` `?? "http://localhost:3000"`.
배포 환경에 변수가 없으면 오류·로그·이상 징후 없이 모든 사용자가 `http://localhost:3000/api/mcp`를
받아 적는다. → **(제약된 권고)** 주석을 코드에 맞추고(fallback이 있다는 사실과 그것이 로컬 개발용이라는 것), 프로덕션
(`NODE_ENV === "production"`)에서 변수가 없으면 **`publicUrl()`의 첫 호출 때 한 번** `console.error`를 내되
**fallback 값은 그대로 돌려준다** — 프로덕션에서 값을 주지 않으면 화면이 그릴 주소가 없어 throw와 같은 결과가
된다. 로그를 모듈 로드 시점에 두지 않는 이유: CI의 `check` 워크플로(`.github/workflows/check.yml`)는 PR마다
`HARNESS_PUBLIC_URL` 없이 `npm run build`(프로덕션 모드)를 돌리고, 빌드가 라우트 모듈을 평가하면 모듈 로드 로그는
실제 오설정이 없는 CI에서도 매번 찍힌다. 첫 호출 시점이면 세 라우트는 전부 요청 시 렌더(`check.yml`의 주석)라
실제 서버에서만 발화한다. **throw는 권하지 않는다** — `publicUrl()`은 `mcpUrl()`·`ownerMcpUrl()`을 거쳐 세
라우트(`p/new/page.tsx:19`, `p/[slug]/tokens/page.tsx:21,25`, `settings/tokens/page.tsx:25`)의 렌더 중에 불리므로
조용한 오설정을 깨진 페이지와 맞바꾸게 되고, 모듈 로드 시 throw는 CI 빌드에서 변수가 없으면 `check`를 실패시켜
PR 병합까지 막을 수 있다. 플랫폼이 변수를 강제하는지, 그리고 그 대가(CI에 변수 추가 포함)를 치르고 throw를
고를지는 제품 결정 ⑧.

**F42 — 결재함 카드에서 훅을 가진 유일한 조각이 카드 파일 안에 인라인이라 경계의 이유가 드러나지 않는다** · 결합도 · Consider (2라운드, CPL-6 축소 채택)
`features/review-gate/ui/inbox-card.tsx:1,3-5,9,14,21-23,35-151,51-58,88-93,92,95,117,227-264` · 계약 자리(이번에 바꾸지 않음) `gate-transition-button.tsx:22,31`, `reject-actions.tsx:34,48` ·
조합 `gate-card-lock.tsx:25-28`, `inbox-card-boundary.tsx`, 호출자 `pages/project-inbox/ui/project-inbox-page.tsx:11`
`inbox-card.tsx:1`이 파일 전체를 `"use client"`로 선언하지만 `InboxCard`(`:35-151`)는 **훅을 하나도
부르지 않는다** — 불리언을 계산하고 클로저 하나를 만들고 마크업(정적 도움말 `<details>` `:119-146`,
`StatusLine`·`PlanRow`·`Kv`)을 그린다. 훅을 가진 것은 `ResumeButtons`(`:227-264`, `useRouter`·
`useTransition`)뿐이고, 이 슬라이스의 상호작용 잎 다섯(`gate-transition-button`, `reject-actions`,
`gate-card-lock`, `inbox-card-boundary`, `reopen-actions`)은 전부 자기 파일에 산다(`index.ts:1-2`가
그 구조를 기록). 카드가 클라이언트 잎에 넘기는 prop 가운데 직렬화 불가·서버 액션 아닌 함수는
**정확히 둘** — `commit={() => approve({…})}`(`:92`)와 `reject`(`:51-58` → `:117`)(직렬화 규칙은 설치된
`use-client.md:50,56,70`). `GateCardLock`은 장애물이 아니다(서버가 만든 `children`을 받는 클라이언트
Provider는 문서화된 패턴, `05-server-and-client-components.md:352-424`). **게이트가 렌즈의 영향
주장을 정정했다:** 카드를 Server Component로 만들어도 `gate-source.ts`·`gate-text.ts`·
`@harness/core`의 두 모듈은 클라이언트 그래프에 남는다 — `reopen-actions.tsx:1,10,11-20`(별도
`"use client"` 잎, 배럴 export, `board-item-page.tsx:115`에서 렌더)이 값으로 import한다. 실제로 빠지는
것은 `inbox-item.ts`, `entities/pipeline`, `shared/lib/relative-time`, `entities/board-item` 일부, 카드
마크업 ~150줄이다.
→ **게이트가 승인한 최소 변경(1단계만):** `ResumeButtons`를 `ui/resume-buttons.tsx`로 분리하고
`inbox-card.tsx`에서 안 쓰게 되는 import(`useRouter`, `useTransition` — `type ReactNode`는 유지, `toast`,
`Button` — `ExternalButtonLink`는 유지, `resumeTargetsFor` — `rejectActionsFor`는 유지, `resumeLabel`·
`resumeToast`)를 지운다. `resumePrimaryFor`(`:103`)·`resumeHint`는 남는다. **이 변경은 경계를 옮기지
않는다** — `"use client"`와 번들은 그대로이고, 얻는 것은 카드에 없는 훅이 카드 안에 숨지 않게 되고
"왜 클라이언트인가"가 두 줄(`:92`, `:117`)로 좁혀지는 것뿐이다. 순수 이동, 계약·동작·마크업 변화 없음.
2·3단계(두 잎이 자기 호출을 스스로 조립하도록 `commit`·`reject` 썽크를 재료로 바꾸는 것)는 경계를
옮기는 유일한 길이지만 공개 계약 변경이라 **제품 결정 ⑪**이다.

### 기각·재검토

**PRD-12 기각** — "프로젝트 셸에 스트리밍 경계(Suspense)가 없다." 전제는 맞다(`layout.tsx:17-24`의
독립 읽기 여섯 대기, `src`에 `Suspense` 0, `loading/template/default.tsx` 없음, `next.config.ts`가
비어 PPR 없음). 그러나 권고가 코드와 모순된다: `TurnBanner`는 `"use client"`(`turn-banner.tsx:1`)이고 `TurnBar`는
지시어 없는 동기 Server Component(`turn-bar.tsx:12-14`)인데, 둘 다 레이아웃이 이미 await한 `turn`을 prop으로
받으므로(`layout.tsx:21,28,36`) 그 둘을 `<Suspense>`로 감싸도 아무 것도 스트리밍되지 않는다 — 기다림은
감싼 안쪽이 아니라 레이아웃의 `Promise.all`에 있다. 남는 것은
측정되지 않은 지연 전제 위의 주석 요청이고, 이 줄에서 실제로 뺄 수 있는 읽기 하나는 F07이 이미
다룬다.

**COH-8 · CPL-6 재검토** — 둘 다 `inbox-card.tsx`의 `"use client"` 경계가 필요보다 높다는 발견이다.
게이트가 근거는 확인했지만 권고가 실제 import 그래프와 맞지 않았다: `inbox-card.tsx:26` →
`inbox-item.ts:6` → `gate-source.ts` → `@harness/core/transitions.mjs` 경로가 남아 클라이언트 그래프에서
빠지지 않고, `:92`의 `commit={() => approve({...})}`도 서버→클라이언트를 못 건너는 함수 prop이다.
원 렌즈에 되돌렸다.

#### 2라운드 렌즈 재검토 결과

| 원시 | 렌즈 | 처분 | 근거 | 정본 |
| --- | --- | --- | --- | --- |
| COH-8 | 응집도 | **철회 → 기각 확정** | 렌즈가 스스로 철회했다("이득이 닿지 않으면 배치 결함이 아니라 경계 취향"). 게이트가 독립 재확인: `reopen-actions.tsx:1,10`(별도 `"use client"` 잎, 배럴 export, `board-item-page.tsx:115`에서 렌더)이 `gate-source.ts`를 값으로 import하므로 어떤 형태의 변경으로도 `transitions.mjs`는 클라이언트 그래프에서 안 빠진다 | — |
| CPL-6 | 결합도 | **채택(1단계로 축소)** | 근거 재확인. 렌즈가 요청한 확인 (a) 직렬화 규칙은 `use-client.md:50,56,70`, (b) 서버 자식을 받는 클라이언트 Provider는 `05-server-and-client-components.md:352-424,:182`로 해소. 렌즈의 영향 주장은 과장 — 위와 같은 이유로 `gate-source`·`gate-text`·core 두 모듈은 어떻게 해도 남는다. 2·3단계는 계약 변경이라 승인하지 않고 제품 결정 ⑪로 | F42 · Consider |
| F17 | (재진술) | **근거 확장 + Should → Must** | 오케스트레이터가 제출한 NUL 근거를 게이트가 바이트 스캔으로 재확인(오프셋 1343·1794 / 2761·4066 = 줄 21·29 / 41·61). RDB-2의 인용 구간 안이라 새 발견이 아니라 F17의 확장 | F17 · Must |
| F01–F16, F18–F41 | — | 불변 | 새 근거 없음, 병합 전부 유지 | — |

2라운드에 revise·pending-verification이 없어 3라운드는 열지 않았다. **최종 42건: Must 2(F01·F17),
Should 21(F02–F16, F18–F23), Consider 19(F24–F42).**

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `src/app/(app)/p/[slug]/layout.tsx` | update | F02·F07·F17(주석)·F11(revalidate 문자열 소비) — 잠금 배너 추출, 토큰 수정 | medium — 모든 프로젝트 라우트의 셸. 회귀 시 배너·헤더 전체 |
| `src/app/(app)/p/[slug]/{page,backlog/page,pipeline/page}.tsx` | update | F06(로스터 소유자), F17(주석·NUL 구분자), F21(`page.tsx:28`의 `as string \| null` 제거, F17-A 뒤), F24·F28(prop 형태) | low — 라우트는 조합만 남는다 |
| `src/app/(app)/{error,not-found}.tsx`, `projects/page.tsx` | update | F11(`projectsPath`), F13(액션 개명) | low |
| `src/fsd/features/create-project/**` | update | F01·F36 — 입력 유지·모드 명명 | **high** — 프로젝트 생성 진입 흐름. 제품 결정 ① 선행 |
| `src/fsd/features/select-project-for-use/**` | update/create | F03·F07·F11·F13·F27·F37 — 배너 컴포넌트 신설(`ui/locked-project-banner.tsx`, `index.server.ts`로 공개), 액션 개명, `notFound` 제거 | medium — 사용 선택 흐름·404 분기(제품 결정 ②) |
| `src/fsd/features/edit-pipeline/**` | update | F04·F05·F09·F21·F34 — Step 표면화, 죽은 가지, 문구 상수, 캐스팅 제거와 선언 뒤 드러나는 `includes(slotAgent(…))` 오류 수정 | low~medium — 파이프라인 편집(Pro) |
| `src/fsd/features/review-gate/**` | update/create | F02·F08·F15·F31·F32·F42 — 술어 재export, `canWrite` 필수, 파생 통합, `resume-buttons.tsx` 분리 | medium — 결재함. `canWrite` 극성(제품 결정 ④), 잎 계약(⑪) |
| `src/fsd/features/edit-backlog/**`, `manage-token/**` | update/create | F09·F14·F24 — 문구 상수(`manage-token`에는 `model` 세그먼트가 아직 없어 새로 만든다), `BacklogFormState` 유니온, 슬롯(`edit-backlog/index.ts`에 `RemoveBacklogButton` export 추가) | low |
| `src/fsd/entities/board-item/**` | update/create | F08의 수용처(`GateRow`·`isAtGate`·`needsHumanDecision`·`pendingInboxCount`·`resumeTargetsFor` — 새 `model` 파일 + `index.ts` export) | low — 하위 레이어 |
| `src/fsd/widgets/turn-banner/**` | update | F08·F17·F18·F19·F21·F39(`hasPropose`와 함께 `version` 읽기·`run` import 제거) | low~medium — 배너 문구는 값 불변 |
| `src/fsd/pages/{landing,project-list,project-board,project-tokens,project-backlog,project-pipeline}/**` | update/create | F10(잠금 시험 신설)·F11·F13·F21(`briefing.ts:48,145`, `project-pipeline-page.tsx:42`)·F26(시험 이동)·F28·F29 | low |
| `src/fsd/shared/{routes,ui}/**` | update/create | F11(`projects.ts` 신설·`PROJECT_LAYOUT_REVALIDATE_PATH`)·F29·F38 | low |
| `src/server/pipeline/{board,board-query,run}.ts` | update | F16(재export 축소)·F21(`board-query.ts:423`의 `as string \| null` 제거)·F25(명시 export)·F33(타입 개명) | medium — 서버 공개 표면. F16 소비자 0 확인, F25는 범위 밖 `tests/server/integration/board.test.ts:4`(`ensureRun`)까지 소비자 다섯 |
| `src/server/agents/{next,run-query}.ts` | update | F20·F22·F35·F40 — 가독성·로그·상수·좁힘 | medium — 원장 쓰기 경로. 동작 불변이어야 함 |
| `src/server/mcp/tools.test.mjs` | update | F23 — 게이트 회귀 시험을 집합 기반으로 | none — 시험만 |
| `src/server/{project,project-registration-query,project-slug-rule,public-url,github}.ts` (+ 시험) | update/create | F06(`loadProjectRoster(db, projectId)`)·F30(래퍼 유지, 주석만)·F12(시험)·F41·F22 — `src/server/agents/runs.ts`도 F06으로 바뀐다 | low~medium — F41은 배포 설정 결정(⑧). F30 래퍼는 범위 밖 `scripts/rehearse-project-availability-d3.ts`가 쓰므로 지우지 않는다 |
| `docs/conventions/product-copy.md` | update (추가만) | F10 잠금 블록 | low — 문장 재작성 없음(제품 결정 ⑥) |
| `docs/architecture/verification.md` | update (추가만) | F10 — `:70-75` 잠금 표에 `landing-demo` 행. product-copy.md `:13-14`가 그 표를 id·시험 등록처로 지정한다 | low — 표에 한 줄 |
| `packages/core/pipeline.d.mts` (선택: `transitions.d.mts`) | **결정 필요** | F21 — 리뷰 범위 밖. `.d.ts`가 아니라 `.d.mts`(TS가 `.mjs`에 대해 찾는 확장자). TS가 import하는 이름 전부(18 / 8)를 선언. `plugin/lib`·검사기에 영향 없음 확인 | low — 거절 시 src 안 대안 |

## Safety Analysis

이 제안서는 **실행 전 문서**이므로 아래는 실행 시 확인해야 할 경계다. 이번 리뷰에서 게이트가 이미
근거로 확인한 항목은 그렇게 표시한다.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — F11의 `"/(app)/p/[slug]"` 라우트 그룹 문자열은 설치된 Next 문서
      (`revalidatePath.md:160-162`)상 유효함을 확인했다(현재 버그 아님). F03의 `notFound()`는
      Server Function에서 허용됨을 확인했다(`03-api-reference/04-functions/not-found.md:15` — 같은
      이름의 `03-file-conventions/not-found.md`가 아니다) — 문제는 합법성이 아니라 서명 불일치다.
- [x] 정적 `import` / `export from` — F16의 소비자 0을 grep으로 확인했다(단, 판정의 한계 4 참조:
      최종 확인은 `rg -a` 또는 `tsc`). F25의 `run.ts` 소비자는 범위 밖 `tests/server/integration/board.test.ts:4`
      까지 다섯이고, F30의 래퍼는 범위 밖 `scripts/rehearse-project-availability-d3.ts`가 쓰므로 지우지 않는다
      — 둘 다 `tsconfig`의 `**/*.ts`가 `tests/`·`scripts/`를 포함해 `tsc`가 잡는 자리다. F08·F13·F33은
      import 재작성이 따른다.
- [x] barrel export(`index.ts`) 경유 참조 — 공개 API를 바꾸는 건: F08(`review-gate/index.ts`·
      `entities/board-item/index.ts`), F07(`select-project-for-use/index.server.ts`에 `LockedProjectBanner`),
      F09(`manage-token/index.ts`에 문구 상수), F24(`edit-backlog/index.ts`에 `RemoveBacklogButton`),
      F13(`select-project-for-use/index.server.ts`의 액션 이름). F10·F12의 렌즈 원안이 검사기 규칙(`fsd/no-deep-import`, `server/no-fsd-import`,
      `fsd/server-import-boundary`)을 어긴다는 것을 게이트가 검사기 소스로 확인하고 권고를 정정했다.
- [x] 타입 선언, 전역 선언, ambient module 영향 — F21의 선언 파일은 **`.d.mts`**여야 한다(`.d.ts`는 `.mjs`
      import에 적용되지 않아 조용히 무시된다 — 최소 재현으로 확인). `.d.mts`는 `scripts/plugin-lib.mjs:9`가
      `.mjs`로 끝나는 이름만 미러하므로 `plugin/lib`에 실리지 않고, `verify-fsd-boundaries.mjs:16`의
      `SOURCE_EXTENSIONS`에 `.mts`가 없어 경계 검사가 읽지 않는다.
- [x] 테스트와 스크립트 참조 — 시험 변경: F10(신설), F12(신설), F23(집합 기반), F24(`backlog-table.test.mjs:8`),
      F26(이동 + 공유 고정값을 `model/briefing.fixture.mjs`로), F33(`pipeline/run-query.test.ts:4,6` 개명), F34, F39(fixture 셋). F30은 래퍼를 남기므로
      `project-registration-query.test.ts:38-68`을 바꾸지 않는다. 범위 밖 참조: `tests/server/integration/board.test.ts:4`
      (F25), `scripts/rehearse-project-availability-d3.ts`(F30).
- [x] dynamic `import()` 또는 lazy loading — 해당 없음.
- [x] 정적 자산 URL 또는 `public` 직접 접근 가능성 — 해당 없음.
- [x] 런타임 side effect 또는 초기화 코드 — F41의 권고는 **프로덕션에서 변수가 없을 때 `publicUrl()` 첫 호출 시
      로그 한 번, fallback 값은 유지**(모듈 로드 시 로그는 변수 없는 CI `npm run build`에서도 찍히고, throw는 세 라우트와
      CI 빌드를 깨뜨릴 수 있으므로 결정 ⑧에서만). F22는
      로그 인자 추가뿐. F03은 액션의 throw 제거(제품 결정 ②).
- [x] API, 외부 SDK 영향 — MCP 와이어 계약 변경 없음(F23은 시험만, F35는 상수 추출). `board.ts`의
      재export 축소(F16)는 컴파일 타임 표면만 줄인다.
- [x] **소스의 NUL 바이트(F17-A)** — 게이트가 바이트 스캔으로 두 파일·네 줄을 확인했다. 이 문서의
      grep 기반 "소비자 0" 주장은 그 두 파일을 놓칠 수 있으므로 실행 시 `rg -a`로 재확인하고,
      F17-A(이스케이프 치환, 동작 변화 0)를 어떤 묶음보다 먼저 넣는다.

오탐 경계로 남는 것:

- F01·F04의 "지금 어긋난다"는 코드 독해로 확인했으나 **실제 화면으로는 재현하지 않았다**(dev 서버
  기동은 소유자 권한). F01은 실행 전 재현을 권한다(picker가 빈 계정으로 `/p/new`에서 URL을 타이핑).
- F21의 "반환이 `any`"는 `strict`에서 컴파일된다는 사실로부터의 추론이다. 실행 시 `.d.mts`를 넣었을 때
  `includes(slotAgent(…))` 일곱 곳이 실패하는 것이 그 추론의 확인이고, 그 자리를 고치고 캐스팅을 지운 뒤
  `tsc --noEmit`이 통과하는지가 최종 근거다 — 단 **선언이 실제로 적용됐다는
  확인이 먼저**다(Verification Plan의 F21 항목): `.d.ts`처럼 적용되지 않은 선언은 같은 녹색을 낸다.

## Approval

승인 기록의 단일 기준은 front matter다. 이 절에는 조건과 메모만 적는다.

승인 메모:

- 2026-09-23 승인. 아래 결정 10건은 전부 권고안으로 정해졌다(front matter `approval-scope`). 묶음별 PR 대신
  브랜치 하나에서 묶음 1~5를 순서대로 구현하고 묶음마다 검증했다 — 커밋·PR은 요청 시.
- 아래 **제품 결정 10건**(①~⑨·⑪)은 구현자가 임의로 정하면 안 된다. 각 결정이 붙은 건은 결정 전까지
  착수하지 않는다. F17-A(NUL → 이스케이프)는 결정 대상이 아니다 — 동작 변화 0인 Must이며 먼저 들어간다.
  본문·Affected Files·Safety Analysis·Execution Plan이 부르는 **①~⑪가 아래 1~11과 같은 순서**다.
  ⑩만 결정이 아니라 순서 메모여서 다른 절에서 인용하지 않는다.
  1. **F01** 수정 형태 — 입력란을 유지하고 파싱 결과를 옆에 보이기(권고) vs 제어 입력 + blur/paste/
     Enter에서 적용(붙여넣기 동작이 바뀜).
  2. **F03** `not-found`를 라우트 404로 둘지, 인라인 오류로 바꿀지(대체 프로젝트가 없을 때도 발화한다).
  3. **F02** `border-line`을 `border-rule`(권고, 형제 크롬)로 할지 `border-edge`로 할지.
  4. **F15** `canWrite`를 필수로(권고) vs 기본값 유지 시 `false`.
  5. **F17** 보드의 느슨한 `dispatched` 파생이 의도인가 — 주석 정정(권고)에서 멈출지, 파생을
     통일할지(보드 출력이 바뀐다). **F17-A 뒤에** 결정한다 — B와 통일 모두 보이지 않는 바이트가 든
     줄을 편집하기 때문이다.
  6. **F10** `product-copy.md`에 잠금 블록 추가(문장 재작성 없음) — 문구 소유자 승인.
  7. **F39** `hasPropose` 삭제(권고) vs 사용(설정 단계 문구가 바뀜).
  8. **F41** `HARNESS_PUBLIC_URL`이 프로덕션에서 보장되는가 — 보장되면 주석 정정만, 아니면 첫 호출 시
     로그 한 번 + fallback 유지(권고) vs throw(그 대가로 `/p/new`·두 Tokens 화면이 깨지고, 모듈 로드 시 throw라면
     `check.yml`의 CI 빌드에도 변수를 넣어야 한다).
  9. **F21** `packages/core`에 `pipeline.d.mts`(선택: `transitions.d.mts`) 추가 승인 vs src 안 대안.
  10. **순서 메모(결정 아님)** — F36의 상태 이동은 F01 뒤. F08이 먼저 들어가면 랜딩의 복제(F10)를
      import로 바꿀 여지가 생긴다(F10의 잠금 시험은 F08과 무관하게 지금 유효).
  11. **F42 2·3단계** — 결재함 카드의 두 클라이언트 잎이 자기 호출을 스스로 조립하게 할 것인가:
      `GateTransitionButton`의 `commit: () => Promise<ActionResult<void>>`를 `approve: GateAction` +
      `gateEntry` + `expectedUpdatedAt`으로, `RejectActions`의 `reject` 썽크를 재료(`itemKey`·
      `updatedAt`·`transition`·`discard`)로 바꾸되 `holdResultLine(new Date(), note)`는 잎 안에 둔다
      (`inbox-card.tsx:53` — 클릭 시각이어야 한다). 이것이 `"use client"` 경계를 `inbox-card.tsx`에서
      떼는 유일한 길이다. **판단은 렌즈 원안이 아니라 정정된 이득으로** — `gate-source`·`gate-text`·
      core 두 모듈은 어떻게 해도 클라이언트에 남고(`reopen-actions.tsx`), 실제로 빠지는 것은
      `inbox-item.ts`·`entities/pipeline`·`relative-time`·카드 마크업이다. 반론도 기록한다: 범용 썽크
      `commit`은 잎을 `GateAction`에서 떼어 두려는 의도일 수 있다.

## Execution Plan

1. **묶음 1**(F17-A → F01·F02·F03·F04·F17-B) — F17-A(네 NUL 바이트를 이스케이프로, 동작 변화 0)를
   **가장 먼저** 넣고 바이트 스캔 0을 확인한다. 이후 제품 결정 ①②③ 뒤 나머지 착수. F01은 수정 전
   화면 재현 → 수정 → 재현 불가 확인. F17-B는 동작 보존 정리이며 A 뒤에.
2. **묶음 2**(F06·F07·F08·F09·F10·F11·F12) — 단일 출처·경계. 이동·배럴 변경이 있으므로 단계마다
   `npm run verify:fsd`. 제품 결정 ⑥ 뒤 F10.
3. **묶음 3**(F13·F14·F15·F16·F21·F22·F23) — 계약 고정. 제품 결정 ④⑨ 뒤. F21은 `.d.mts` 투입 →
   선언이 적용되는지 확인(Verification Plan) → 새로 드러나는 `includes(slotAgent(…))` 일곱 곳 수정 → 캐스팅·단언
   제거 → `tsc` 통과가 곧 증명.
4. **묶음 4**(F05·F18·F19·F20) — 읽기 비용. 전부 동작 보존이어야 하며 `test:web`·`test:server`가
   기준선과 같아야 한다.
5. **묶음 5**(F24~F42) — 표면 정리. 제품 결정 ⑦⑧이 붙은 F39·F41은 결정 뒤. F42는 1단계(분리)만;
   2·3단계는 결정 ⑪ 뒤.

묶음마다 별도 PR을 권한다(현재 규칙: `harness/<topic>` → `dev` → `main`, `--base dev`). **실행 PR에
이 문서의 갱신(Verification Results, 체크박스)을 같이 담는다** — 1차 패스가 늦게 닫힌 원인이 그것이었다.

## Verification Plan

실행할 검증:

```bash
npm run check         # plugin-lib 동기 · eslint + FSD 경계 · next typegen · tsc --noEmit · 아키텍처 · project-availability
npm test              # packages/core + plugin/bin
npm run test:web      # src 전역 (기준선 380)
npm run test:server   # 서버 전용 bootstrap 교차 모듈 (DB 불필요)
npm run verify:fsd    # 이동·배럴 변경이 있는 묶음 2·3에서 단계마다
```

검증 기준:

- 위 명령이 전부 통과. 기준선은 `b416d14`에서 측정한 `lint` 통과 · `tsc` 통과 · `test:web` 380 pass /
  0 fail이다. 기준선이 전부 통과이므로 **어떤 실패든 신규**다.
- 게이트가 지정한 묶음별 최소 검사: `tsc --noEmit` — F06·F14·F25·F30·F40 뒤; `npm run lint`(FSD 포함)
  — F07·F10·F11·F12·F13·F24 뒤; `npm run test:web` — F10·F12·F15·F23·F24·F26·F34·F39 뒤.
- F17-A 뒤: 두 파일에 NUL 바이트가 0개인지 바이트 스캔(`git ls-files -z` + Node `Buffer.indexOf(0)`;
  grep 계열은 이 판정에 쓰지 않는다) + `tsc --noEmit` + `npm run test:web`. F42 1단계 뒤: `tsc --noEmit` +
  `npm run lint`(안 쓰는 import는 린트가 잡는다) + `npm run test:web`.
- F21 뒤: 선언이 실제로 적용되는지 먼저 본다 — 임시 TS 파일에서 `const n: number = slotAgent("x");`처럼
  선언과 어긋나는 대입이 `tsc --noEmit`에서 **실패**해야 한다(확인 뒤 지운다). 통과하면 선언이 무시된
  것(`.d.ts`로 넣은 경우 등)이다. 선언이 적용되면 `includes(slotAgent(…))` 일곱 곳이 먼저 실패하는 것이
  정상이다(F21 본문의 목록) — 그 자리를 고치고 캐스팅·`!` 제거 → `tsc --noEmit` + `npm run lint` + `npm run check`
  (`plugin-lib --check`가 `.d.mts`를 미러 대상으로 보지 않는지 포함).
- F04·F34 뒤: `pipeline-rail.test.mjs`가 기준선대로 통과하고, 세 버튼의 `disabled`가 `!step.ok`를 싣고
  있는지(F34가 F04의 `!step.ok`까지 지우지 않았는지) 코드에서 확인한다.
- F01·F04는 타입·시험으로 잡히지 않는다 — 화면 재현으로만 확인 가능하다.
- `npm run build`는 로컬에서는 어떤 채택 발견도 요구하지 않는다(`.next/`를 쓰는 명령이라 별도 확인 후에만).
  단 `check` 워크플로가 PR마다 `npm run build`를 돌리므로(`check.yml`) 실행 PR은 CI 빌드가 녹색이어야 병합된다 —
  F07(새 async Server Component)·F41(`public-url.ts`)이 든 PR은 CI 빌드 로그에 F41의 오설정 로그가 **찍히지
  않는지**도 본다(찍히면 로그가 첫 호출이 아니라 모듈 로드 시점에 있는 것이다).
- grep으로 "소비자 없음"을 재확인할 때는 `rg -a`를 쓴다(판정의 한계 4).

## Verification Results

구현은 2026-09-23 브랜치 `harness/src-clean-code-second-pass`(베이스 `b416d14`)에서 했고 PR #76으로 `dev`에 머지됐다 — 표 끝의 "구현"·"CI" 행들.
아래 표의 앞 세 줄은 **리뷰 시점의 기준선**이다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run lint` | 통과 (2026-09-23, `b416d14`) | 기준선 — FSD architecture check passed |
| `npx tsc --noEmit` | 통과 (2026-09-23, `b416d14`) | 기준선 |
| `npm run test:web` | 380 pass / 0 fail | 기준선 — suites 75 |
| 게이트 근거 대조 (1·2라운드) | 54건 전부 파일을 열어 확인 | 줄 번호 보정 5, 권고 정정 4, 심각도 조정 5, NUL 근거 바이트 스캔 재확인 |
| 제안서 ↔ 코드 재대조 (2026-09-23) | 인용 파일 103개 · 인용 구간 475건 전수 대조 | HEAD `b416d14`, `src`·`packages`·`scripts` 작업본 clean. 범위 밖 인용 0건. 사실·인용 정정 6건 반영(커밋 날짜, F23 `:118-122`, F25 열한 export, F17 경로 한정, F15 return 길이, `not-found.md` 경로 한정) |
| 제안서 ↔ 코드 2차 재대조 (2026-09-23) | 문서가 주장하는 수량을 직접 계수 | 정정 5건: F11 14곳, F14 어댑터 다섯, F35 여덟 항, F20 `:71` 가드 구조, F13 fixture `:26` 추가. F16 소비자 0 · F18 5단 삼항 · F20 열 항/일곱 항등 · F31 유일 생산자 · F39 미사용 필드는 문서대로 확인 |
| 제안서 ↔ 코드 3차 재대조 (2026-09-23) | 문서 내부 정합성과 F10 지시의 실행 가능성 | 정정 8건: F10에 닫는 표기 `<!-- /copy-lock -->`·인용 블록·한 줄 한 단위 규칙 추가, `:176`·`:78`·`:92`는 주인이지 옮겨 적을 원문이 아님을 명시, `verification.md:70-75` 잠금 표 등록 추가, F10의 "`src` 밖 파일"을 둘로 정정, id 목록에 `owner-token-reveal` 추가, Approval ①~⑪ 대응 키 추가, Scope·Affected Files에 `verification.md` 추가. 자체 집계는 전부 정합 — heading 42개 중복·결번 0, 심각도 합계가 Summary와 일치, 묶음 다섯의 선언 수와 구성원 일치, Execution Plan과 묶음 일치, 렌즈 표 54 = 42+10+1+1 |
| 제안서 ↔ 코드 4차 재대조 (2026-09-23) | 42건 전부의 인용 줄·수량·권고 실행 가능성, 인용 경로·줄 범위 기계 대조, 범위 밖(`tests/`·`scripts/`) 소비자 검색, 기준선 재측정(`test:web` 380 pass / 0 fail, `tsc` 통과, NUL 스캔 두 파일·네 곳 그대로) | HEAD `b416d14`, `src`·`packages`·`scripts` 작업본 clean. 실행을 틀리게 만들 결함 10건 정정: F07 배너가 `projectId`만 받아서는 `loadProjectSelection(userId)`와 사유 문장을 얻을 수 없음 → prop `userId`·`projectId`·`reason`과 `index.server.ts` 공개 명시, F21 선언 파일 확장자 `.d.ts` → `.d.mts`(최소 재현으로 `.d.ts`가 무시됨을 확인)와 선언해야 할 이름 18/8, F08 옮기는 집합 셋 → 다섯(`isAtGate`·`resumeTargetsFor` 의존), F06 `loadProjectRoster`가 클라이언트를 인자로(`runs.ts` 주입 우회 방지), F14 생산자 `edit-backlog.server.ts`와 유니온 모양 명시, F04↔F34가 같은 `disabled`를 반대로 고치던 충돌, F25 범위 밖 소비자 `ensureRun`, F30 래퍼 삭제가 범위 밖 D3 리허설 스크립트를 깨뜨림 → 래퍼 유지, F39 뒤 남는 `version` 쿼리·import 제거, F41 권고의 fallback/throw 모순. 사실 정정 10건: F16 한 줄 길이(약 500자), F05 거짓 가지 한 줄과 `NODE_KINDS` import, F18 삼항 넷·다섯 갈래(2차 행의 "5단"을 대체), F33 주석 근거가 사실이 아님, F17·F31 `run-query.ts` 경로 한정, F40 시험 경로 한정, F38 소비자 `:34`, F28 optional/nullable, F14 공개 경로, F10 시험 prop·파일명 |
| 제안서 ↔ 코드 5차 재대조 (2026-09-23) | 4차에서 얕게 본 항목(F09·F13·F24·F26·F28·F29)과 4차가 새로 쓴 문장의 인용을 다시 대조, 검증 명령의 실제 동작(`check`·CI 워크플로) 확인 | HEAD `b416d14`, 코드 변경 없음. 실행을 틀리게 만들 결함 3건 정정: F24 `RemoveBacklogButton`이 슬라이스 공개 API에 없어 pages 조합이 `lint`에 막힘 → `index.ts` export 추가와 낡는 주석 명시, F26 "파일 이동뿐"이 사실이 아님(고정값 넷을 `buildBriefing` 시험과 공유) → fixture 모듈로 분리, F41 모듈 로드 시 로그는 변수 없는 CI 빌드(`check.yml`)에서도 찍힘 → 첫 호출 시 한 번. 누락 2건: F09 `manage-token`에 `model` 세그먼트 신설을 Affected Files에 명시, Safety Analysis의 barrel 항목·롤백 절에 공개 API를 바꾸는 F07·F09·F13·F24 추가 |
| 제안서 ↔ 코드 6차 재대조 (2026-09-23) | 선언 파일(F21)을 넣은 뒤의 타입 결과, core 반환값에 기대는 호출 지점 전수 검색(`includes(slotAgent(…))`·`!`·`as` 단언), 아키텍처 문서의 로깅 규칙 유무 | HEAD `b416d14`, 코드 변경 없음. 실행을 틀리게 만들 결함 1건 정정: F21은 "캐스팅 제거"만 적었지만 정확한 선언은 `PROJECT_AGENTS.includes(slotAgent(…))` 일곱 곳을 새 컴파일 오류로 만든다 → 일곱 곳과 고치는 모양, 함께 지울 단언 열 개를 명시하고 Verification Plan·Affected Files(edit-pipeline·pages·`p/[slug]` 라우트·`server/pipeline` 행)에 반영 |
| 제안서 ↔ 코드 7차 재대조 (2026-09-23) | 본문의 서술형 주장("전부 ~다", "각 ~에 있다", 개수)을 코드와 하나씩 대조, 앞 패스가 고친 내용이 다른 절에 전파됐는지 | HEAD `b416d14`, 코드 변경 없음. 정정 3건: "제품 결정 11건"은 ⑩이 순서 메모라 결정 10건(Summary·Approval), F13 "형제 액션은 전부 동사 우선"의 예 `humanTransition`은 동사 우선이 아님 → 예외로 명시하고 "호출부 다섯"을 바뀌는 곳 목록으로 대체, 6차의 F21 일곱 곳 수정이 Execution Plan·Safety의 F21 문장에 빠져 있던 것 반영. F12 "각 복사본에 시험"(`project-slug-rule.test.ts`, `repo-url.test.ts`)·F37 `isNoteMissing`(`reopen-actions.tsx:43`)·F09 "정확히 두 번"(문장별 파일 둘)은 문서대로 확인 |
| 제안서 ↔ 코드 8차 재대조 (2026-09-23) | 이력 주장(커밋 해시·날짜·출처)을 `git log -S`·`git show`로 대조, 1차·서버 패스 문서의 건수·보류·F19·F10/F8 서술 대조, F02 구성(`globals.css` 하나, Tailwind 4.3.3, config 없음)·F01 시험 범위(`renderToStaticMarkup`) 확인 | HEAD `b416d14`, 코드 변경 없음. 정정 1건: F20(`closedTerminal`)은 서버 패스 `60070e0`(09-16)이 아니라 `ce19203`(반복 슬롯, 09-18)에서 생겼다 → Summary·"이전 패스와의 관계" 정정. `cc422f3`(09-11)이 두 파일에 NUL을 각 2개 넣은 것(부모 0개)·`b416d14`(09-22)·F16·F22·F35·F40의 `60070e0` 출처는 문서대로 확인 |
| 제안서 ↔ 코드 9차 재대조 (2026-09-23) | 그때까지 대조하지 않은 세부 주장: F22의 `StaleCursor`·`CursorRollback`·15초 예산(`agents/run-query.ts:8-14`), F35의 `AgentRun.revision Int`(`prisma/schema.prisma:220`), F42의 `<details>`·`StatusLine`·`PlanRow`·`Kv`, F20·F40이 인용한 시험 구간(`next.test.ts:312`, `:502`), PRD-12 기각 근거 | HEAD `b416d14`, 코드 변경 없음. 정정 1건: PRD-12 기각 근거가 `TurnBar`도 `"use client"`라고 했지만 `turn-bar.tsx`는 지시어 없는 동기 Server Component다 → 근거 문장 정정(두 컴포넌트 모두 이미 await된 prop을 받으므로 기각이라는 결론은 그대로) |
| 제안서 ↔ 코드 10차 재대조 (2026-09-23) | 문서 머리의 수량·집계 주장: 렌즈 표 합계(54 = 42 + 10 + 1 + 1, 렌즈별 행 합), 심각도(Must 2·Should 21·Consider 19)와 묶음별 선언 수, `src` 파일 수(추적 231 = ts 157 + tsx 61 + mjs 11 + css 1 + ico 1), 게이트의 줄 번호 보정, `rg` 버전(14.1.1) | HEAD `b416d14`, 코드 변경 없음. 정정 2건: 게이트의 "COH-8 264줄 → 265줄" 보정은 틀렸다(`inbox-card.tsx`는 줄바꿈 264개로 끝나는 264줄) → 판정의 한계 2를 "보정 넷"으로 고치고 되돌림을 기록(1·2라운드 행의 "줄 번호 보정 5"는 당시 기록으로 둔다), "`src`의 229개 텍스트 파일"은 실제 230개 → 렌즈 보고 수와 실제 수의 차이를 명시. 나머지 집계는 문서대로 확인 |
| 제안서 ↔ 코드 11차 재대조 (2026-09-23) | 한 번도 열지 않았던 인용 줄(F41 `project-tokens-page.tsx:93`·`owner-token-reveal.tsx:41`, F09 `turn.test.ts:231`, F15 return `:60-151`), 문서 형식과 `docs/proposals/README.md`·`template.md` 규칙(front matter 필드, `stage`, 필수 절), 문서 안의 단정 문장과 다른 절의 일관성 | HEAD `b416d14`, 코드 변경 없음. 정정 1건: 판정의 한계 5의 "실행 전 미해결 근거는 없다"가 같은 문서의 실행 시 확인 항목(F01·F04 화면, F21 eslint·선언 적용, F41 CI 빌드 로그)과 어긋났다 → 렌즈 요청 확인에 한정된 말임을 밝히고 실행 시 확인 항목의 위치를 적음. 인용 줄·형식 규칙은 문서대로 확인 |
| 구현 — 묶음별 게이트 (2026-09-23) | 묶음마다 `tsc --noEmit` · `npm run lint`(FSD 포함) · `npm run test:web` 통과 | 묶음 1 뒤 381, 묶음 2 뒤 385, 묶음 3·4 뒤 385(+ `npm test` 180, `test:server` 2), 묶음 5 뒤 386. 실패 0 |
| 구현 — `npm run check` | 통과 (exit 0) | plugin-lib in sync(`.d.mts`는 미러 대상 아님) · eslint + FSD 경계 · next typegen · tsc · 아키텍처 25/25 · project-availability 17/17 |
| 구현 — `npm run test:web` | 386 pass / 0 fail, suites 75 | 기준선 380 + 새 시험 6: F01 `formMode`, F07 `availabilityLabel`, F10 `landing-demo` 잠금, F12 대조 둘, F41 `public-url`. F26은 이동이라 수 불변(38 → 38) |
| 구현 — `npm test` · `npm run test:server` · `npm run verify:fsd` | 180/180 · 2/2 · 통과 | |
| 구현 — NUL 바이트 스캔 | `src`·`packages/core` 0개 | F17-A 뒤부터 유지. Node `Buffer.includes(0)` 전수 |
| 구현 — F21 선언 적용 확인 | 임시 `const n: number = slotAgent("x")`가 `tsc`에서 TS2322로 **실패** | 선언이 적용된다. 탐침 파일은 지웠다. 선언 투입 직후 `includes(slotAgent(…))` 일곱 곳 + 두 곳(아래 편차 1)이 실패했고 그 자리를 고쳤다 |
| 구현 — 잠금이 실제로 무는지 | F12: `SLUG_MAX`를 41로 바꾸면 대조 시험이 "drifted"로 실패(되돌림) | F10 잠금은 `copy-lock` 도우미의 기존 시험에 기댄다 |
| 화면 — F01 (`/p/new`, dev `:3100`, 2026-09-23) | 재현 불가 확인 | 수동 입력에서 `https://github.com/acme/hello-world`를 **한 글자씩** 입력: 입력란이 끝까지 남고 포커스 유지, 파싱 결과(`acme/hello-world · main · /p/hello-world`)가 아래에 나오고 Create 활성. Start over는 입력값까지 비우고 Create 비활성. 목록에서 고르면 요약만 보이는 chosen 모드. 프로젝트는 만들지 않았다 |
| 화면 — F04 | 렌더로 확인(브라우저 아님) | DB의 유일한 사용자가 Free라 편집 레일이 화면에 안 나온다 — 구독을 바꾸지 않고 `PipelineRail`을 `editable`·다운그레이드 그래프(free + doc-audit·scout)로 렌더: 거부될 Remove(게이트)·Swap·scout Remove는 `disabled`에 `title="doc-audit is not on the free plan"`, 그래프를 되살리는 doc-audit Remove만 활성 |
| 화면 — 나머지 탭 | 200, 서버 로그·콘솔 오류 0 | `/p/mathgic`·`/backlog`(F24·F28)·`/pipeline`(F06 로스터, F09 문장, F28 "not saved yet")·`/inbox`(F15)·`/tokens`(F09)·`/projects`(F07 라벨 `1 / 1 available`, F11 `/p/new` 링크)·`/`(F10 데모 문장, F11 링크). F07의 잠금 배너 자체는 잠긴 프로젝트가 없어 화면에서 보지 못했다 |
| 미실행 — `test:server:integration` | 실행 안 함 | `TEST_DATABASE_URL` 없음. F06(`loadProjectRoster(db, …)`는 코드로 확인)·F20·F40의 원장 경로는 단위 시험(`agents/next.test.ts`·`agents/run-query.test.ts`)만 통과 |
| CI — PR #76 `check` (run 35859477924, `55424bc`) | 통과 | `npm ci` · `db:generate` · `npm run check`(25/25 · 17/17) · `npm test` 180/180 · `npm run test:web` 386/386 · `npm run build`. 빌드 로그(4812줄)에 `HARNESS_PUBLIC_URL is not set` 0회 — F41 로그가 모듈 로드가 아니라 첫 호출에 있다. `npm run build`는 로컬에서 돌리지 않았다 |

구현 중 문서와 달라진 점(전부 동작 보존 또는 문서가 허용한 범위 안):

1. **F21** — `dispatcherFor`를 `node: string | null`로 선언했다(런타임은 `slotAgent(null)`을 거쳐 null을 돌려준다). 그래서
   일곱 곳 외에 `turn.ts`의 working 줄과 `turn-data.server.ts`의 `dispatcherFor(at, …)`가 캐스팅 없이 통과한다.
   선언은 TS가 쓰는 18개가 아니라 `pipeline.mjs`의 export 25개 전부를 담았다. `includes(slotAgent(…))` 자리는
   `rail-state.ts`의 `isProjectSlot`(레일도 import)과 `turn.ts`의 지역 함수로 고쳤고, `pipeline-rail.tsx`는 캐스팅이
   사라지면서 뜻이 없어진 별칭 `KINDS`·`REQUIRED`·`TAIL`·`BOUNDARIES`도 지웠다.
2. **F07** — 수량 라벨을 `model`의 `availabilityLabel`로 두고 프로젝트 목록 페이지도 같은 함수를 쓴다. 문구는
   product-copy.md §10(`3 available · unlimited`)을 따른다 — 레이아웃이 쓰던 `N / unlimited available`은 §10에 없던
   형태다. 제한 없는 플랜에서는 잠긴 프로젝트가 생기지 않으므로 배너에서는 사실상 닿지 않는 갈래다.
   `ProjectSelectionModel`에 `availableCount`가 더해졌다.
3. **F05** — `[...head, ...tail, kind]`는 `g.nodes`에 `kind`를 붙인 것과 같아 `[...g.nodes, kind]`로 줄였다.
4. **F24** — 슬롯은 `canWrite`일 때만 부른다(표의 `Removed`·`canWrite` 분기는 표에 남음). 보드에 올리기의
   `row.status === null` 조건은 `ProjectBacklogPage`의 조합으로 옮겼다.
5. **F12** — 시험 파일 이름은 `src/server/project-slug-rule-sync.test.ts`. F16 — 재export를 뺀 이유를 `board.ts`에 주석으로 남겼다.
6. **F40** — `next.ts`·`agents/run-query.ts` 모두 영수증을 `claim`(outcome이 없으면 null)으로 받아 좁힌다.
   `next.ts`의 분기는 `if (!outcome || !claim)`이다. F35의 `isWellFormedReceipt`는 형 가드다.
7. **F41** — 첫 호출 로그를 `src/server/public-url.test.mjs`로 고정했다(모듈 로드 때 0회, 첫 호출 뒤 1회).
8. **F32**는 F08과 함께 처리했다(`gate-source.ts`를 다시 쓰며 복제 주석을 버림).

## Risks and Rollback

잔여 리스크:

- **F01은 프로젝트 생성 경로다.** 회귀하면 저장소 등록 불가. 붙여넣기(주 경로)와 타이핑(대체 경로)
  둘 다 화면으로 확인해야 한다.
- **F03·F15는 인가·404 표면이다.** `canWrite` 기본값을 `true`로 남기면 fail-open이 유지된다.
- **F17-A는 보이지 않는 바이트를 만진다.** 이스케이프로 바꾸면 런타임 문자열은 바이트 단위로 같지만,
  구분자 **문자**를 바꾸는 것(`|`·`:` 등)은 어떤 key·agent 값에도 그 문자가 없다는 증명이 필요한 별개
  결정이라 이 문서는 권하지 않는다. 치환 뒤 바이트 스캔 0과 `test:web` 기준선 유지가 증거다.
- **F16·F25는 서버 공개 표면을 줄인다.** F16의 소비자 0은 grep 기준이며, NUL 바이트 파일을 놓칠 수
  있으므로 `tsc`가 최종 근거다. F25의 명시 목록은 범위 밖 통합 시험이 쓰는 `ensureRun`까지 담아야 한다.
- **F06은 `runs.ts`의 로스터 읽기를 옮긴다.** 주입된 `db`를 넘기지 않으면 단위 시험은 통과해도 통합
  시험(`tests/server/integration/agent-runs.test.ts`)의 주입이 로스터에서만 빠진다 — 그 시험은 이 문서에서도
  미실행이므로 코드에서 `loadProjectRoster(db, …)` 호출을 직접 확인한다.
- **F20·F40은 원장 쓰기 경로의 순수 리팩터링이다.** `agents/next.test.ts`·`agents/run-query.test.ts`가 기준선과
  동일해야 하며, 격리 DB 통합 시험(`test:server:integration`)은 서버 패스의 후속과 마찬가지로 이
  문서에서도 미실행이다.
- **기존 공백(이번 변경이 만든 것 아님):** 슬롯 경로(`cursorTransaction`)의 재전송 수락 판정 `closedTerminal`의 참
  갈래 — `pipeline-agent-slots.md` V4의 "plan_submit/hold 뒤 지정된 닫힌 run/step 최종 응답 1회" — 를 실행하는 자동
  시험이 없다(`ce19203`에서 생김). `next.test.ts`의 닫힌 run 시험은 `withCursor` 없는 레거시 경로이고,
  `agents/run-query.test.ts`의 가짜 run은 늘 `closedAt: null`이며, 통합 시험 셋은 CAS 경쟁만 본다. F20·F40의 변경은
  diff 대조로 모든 입력에서 동작이 같음을 확인했으므로 새 시험은 전후 코드 모두에서 통과해 이번 변경의 증거가 되지
  못한다 — 그래서 이 문서에서 추가하지 않고 후속으로 남긴다. 채울 때는 가짜 트랜잭션으로 관문 판정(통과 / stale)을
  보는 단위 시험이면 되고, 전이 이벤트 쿼리 조건(`from`·`to`·`at`)은 통합 시험의 몫이다.
- 이 리뷰의 게이트는 54건 중 1건만 기각했다. 게이트가 모든 인용 줄을 직접 열었고 오케스트레이터가
  표본(토큰 부재, 문구 쌍, 라우트 리터럴, 라우트별 Prisma 읽기, `hasPropose`, `export *`, 로스터 4벌)
  을 grep·파일 읽기로 재확인했으나, 그 밖의 항목은 게이트의 대조를 신뢰한 것이다.

롤백 방법:

- 묶음별 PR이므로 `git revert <merge-commit>` 단위로 되돌린다.
- 파일 이동·배럴 변경(F07·F08·F09·F13·F24·F26)은 되돌릴 때 `index.ts`/`index.server.ts`와 F26의
  `briefing.fixture.mjs`도 함께 복원해야 한다 — 이동만 되돌리면 `verify:fsd`·`test:web`이 잡는다.
- `product-copy.md`의 잠금 블록(F10)은 추가만이라 삭제로 되돌린다.
- DB 스키마·마이그레이션 변경은 없다.

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성한다.

완료 기록(`status: "completed"`일 때 작성):

- completed-at: 2026-09-23
- verification-summary: front matter 참조. 명령별 결과는 Verification Results의 표가 단일 기준이다.
- implementation PR/commit: PR #76(`harness/src-clean-code-second-pass`, 구현 커밋 `55424bc`, 머지 `67b48ff`). 묶음별 PR 대신 한 PR에 묶음 1~5를 담았다(승인 메모).
- changed files summary: 80개 — `src/` 76개(새 파일 11: 배너·엔티티 게이트 모델·플랜 문장 상수 둘·`resume-buttons`·`shared/routes/projects`·시험 넷과 보드 fixture), `packages/core/pipeline.d.mts`, `docs/conventions/product-copy.md`(§16 잠금 블록), `docs/architecture/verification.md`(잠금 표 행), 이 문서.
- remaining follow-up: F42 2·3단계(제품 결정 ⑪), F30 래퍼 삭제(D3 리허설 스크립트와 함께), F06 후속(머리·토큰 읽기를 슬라이스 server adapter로), F36 후속(`query`·`pasteError`를 쓰는 블록으로), F23 후속(`scopedTool` 래퍼), 슬롯 경로 `closedTerminal` 참 갈래의 자동 시험(Risks의 기존 공백), 격리 DB 통합 시험 실행.

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, 닫힘 전용 `TBD` 외에는 완료 상태에 맞게 갱신했다.
- [x] `status`는 `completed`이고 `stage`는 `null`이다.
- [x] 문서 위치(`completed/2026-09-23-…`)와 `status`(`completed`)가 일치한다.
- [x] 승인 3필드(`approved-by`·`approved-at`·`approval-scope`)는 승인 기록으로 남긴다.
- [x] `proposal-size`는 `standard`이며 강제 조건(라우팅·인가·barrel export·서버 공개 표면·5개 이상 파일)에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 쓰고, 본문에는 조건과 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, barrel, 타입, 런타임 side effect, 외부 SDK를 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 기준선이 전부 통과이므로 신규 실패 판별 기준을 명시했다.
- [x] 잔여 리스크를 명시했다.
- [x] 완료 문서 항목 — `completed-at`·`verification-summary`·완료 기록·실제 검증 결과(CI 포함)와 문서와 달라진 점을 적었다.
- [ ] 닫힌 문서 항목 — 완료 문서라 해당 없음.
