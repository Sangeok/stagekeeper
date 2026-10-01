---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-01"
approved-by: "요청자(현재 대화)"
approved-at: "2026-10-01"
approval-scope: "SRC-01~SRC-10 실제 코드 수정 및 B-01~B-07 로컬 검증. 커밋·PR·배포는 별도 요청 시."
completed-at: "2026-10-01"
verification-summary: "10건 구현 완료. check/FSD, web 478, server 28(manifest 포함·skip 0), core/plugin 188, 격리 PostgreSQL 통합 시험, 실제 Next·DOM 브라우저 인수, 최종 fresh build 통과. 구현 후 Full applicable-lens review의 추가 채택 발견 0건. 상세 결과는 2026-10-01-src-clean-code-third-pass-regression.md."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/repository-disconnection.md"
  - "docs/conventions/product-copy.md"
  - "docs/test-reports/completed/2026-10-01-src-clean-code-third-pass-regression.md"
  - "docs/proposals/completed/2026-09-23-src-clean-code-second-pass.md"
---

# src 전역 클린코드 3차 리뷰 — 채택된 10건

## Summary

`src`의 유지보수 대상 **280개 파일·15,345줄**을 `frontend-clean-code-orchestrator`에 따라
응집도·결합도·예측가능성·가독성·TypeScript 일반의 다섯 독립 관점으로 검토했다.
별도의 중립 게이트가 원시 발견 13개를 코드·호출부·테스트·현재 계약과 대조하여
**10건을 채택했다 — Must 3, Should 5, Consider 2.** 중복 기여 3개는 근거와 관점 표시를
보존하여 병합했고, 기각·수정 요청·추가 검증 대기·미결 판단은 없다. 실질 게이트는 1라운드다.

현재 동작 문제로 우선 처리할 항목은 다음 세 가지다.

- **SRC-06:** 수동 저장소 URL을 지우거나 무효 주소로 바꿔도 이전 저장소를 등록할 수 있다.
- **SRC-08:** REST 등록의 명시적 slug가 예약어·형식 검사를 우회하여 현재 웹 URL 계약을 깨뜨린다.
- **SRC-05:** 승인 저장은 커밋됐지만 웹이 사용하지 않는 후속 조언 조회의 실패로 성공 응답과 갱신이 막힌다.

이 문서는 채택된 발견의 등록부와 후속 수정 제안이다. **이번 작업은 문서 작성까지이며
애플리케이션·테스트·설정 코드는 수정하지 않았다.** 아래 회귀 시험은 향후 구현의 검증 계획이다.
현재 frontmatter의 `awaiting-approval`은 후속 코드 구현 상태를 뜻한다.

2026-10-01의 `reconciling-proposals-with-codebase` 대조에서는 **처음부터 개선할 점이
있었다.** 발견 자체뿐 아니라 구현 지침을 검증한 결과, 입력 출처 전이, REST 정규화,
커밋 후 MCP 오류 응답, 타입 선언의 전체 export, RSC 오류 격리, History 기본값,
복사 동시 실행, 수정·시험 위치와 최종 산출물의 연결을 구체화할 필요가 있었다.
아래 「구현 계약과 구체적 변경 목록」이 그 보완 결과다. 앞의 13→10 판정과 1라운드는
최초 클린코드 리뷰 기록이며, 제안서 reconciliation이나 구현 후 인수의 통과 기록이 아니다.
같은 날의 재대조에서는 MCP 문구 변경에 필요한 canonical §12·§13과 실제 도구 metadata의
검증 연결, 기존 `board-rules.test.mjs`의 정확한 검증 경로도 보완했다.
추가 재대조에서는 commit 전 작업 실패와 commit 확인 실패를 분리했다. commit 호출이
예외로 끝났다는 사실만으로 rollback이나 승인 저장 완료를 단정하지 않도록 계약과 시험을 보완했다.

## 검토 기준과 범위

리뷰는 2026-09-30에 시작하여 2026-10-01에 완료했다. 기준 브랜치는 `dev`, 기준 커밋은
`02f86cbe1502508c1701c544bb229803e2c3ba69`다. 리뷰 시작과 문서 작성 직전에 소스 내용이
같음을 확인했다.

| 영역 | 파일 수 | 줄 수 |
| --- | ---: | ---: |
| `src/app` | 28 | 773 |
| `src/fsd` | 168 | 7,535 |
| `src/server` | 83 | 7,032 |
| `src/proxy.ts` | 1 | 5 |
| 합계 | **280** | **15,345** |

확장자는 `.ts` 194개, `.tsx` 70개, `.mjs` 15개, `.css` 1개다.
테스트 61개·5,410줄도 포함했다. Prisma 생성 코드 `src/generated/**` 26개와
바이너리 `src/app/favicon.ico`는 수동 검토에서 제외했다.
`packages/core`, Prisma schema, 설치된 의존성·문서는 주장 검증의 보조 근거로 읽었다.

현재 아키텍처의 source of truth는 `docs/architecture/`다. 수정안은 FSD의
`pages → widgets → features → entities → shared` 방향, slice public API,
서버 서비스와 FSD 사이의 경계, core의 순수 계약 소유권을 따른다.
설치된 Next.js **16.3.3**, React **19.2.8**, TypeScript **5.9.3**, Prisma **7.10.0**과
실제 strict/bundler 설정을 기준으로 판정했다.

검토 대상의 SHA-256은 다음과 같다. 대상 파일을 POSIX 상대 경로 순으로 정렬한 뒤
각 `UTF-8 경로 + NUL + 파일 원본 바이트 + NUL`을 차례로 해시했다.

```text
b602c9c214aabac0519708ae98191f00fa04df40ae38eadd06dc617ac8afa47f
```

## 채택된 발견 — Must

### SRC-06 — 현재 수동 URL과 제출할 저장소 상태를 일치시키기

**관점:** Predictability, Readability, TypeScript generalist.
**원시 ID:** PRD-01, READ-01, TS-02. **확신:** 높음.

**코드 근거:** `src/fsd/features/create-project/ui/new-project-form.tsx:82`의 `applyPaste`는
유효한 URL에서 `owner/repo/slug`를 갱신한다. 하지만 빈 값과 파싱 실패 분기는 오류 표시만
변경하고 기존 식별자를 유지한다. 같은 파일 `:60`의 `isRepoChosen`과 `:203`의 버튼은 현재
URL의 유효성을 확인하지 않는다. URL 입력에는 제출 `name`이 없고, `:173` 이후의 숨겨진
상세 입력이 전송된다. `src/fsd/features/create-project/api/create-project.server.ts:17`과
`:36`은 이 식별자를 읽어 실제 등록 함수에 넘긴다.

**실패 경로:** 수동 입력으로 `https://github.com/acme/first`를 입력한 뒤 URL을 비우거나
무효 주소로 변경한다. 이전 `acme/first`의 요약과 활성화된 Create 버튼이 남아 있고,
그대로 제출하면 이전 저장소가 등록 대상이 된다. 현재 입력과 mutation 대상이 달라지는
동작 문제이므로 Must다. 세 관점의 합의가 심각도를 높인 근거는 아니다.

**최소 수정안:** URL에서 파생된 선택은 현재 URL이 유효할 때만 제출 대상으로 인정한다.
상세 `Edit`로 직접 입력하는 경로는 명시적인 별도 입력 출처로 유지한다. 제출 식별자와
제출 가능 여부를 같은 현재 상태에서 파생시키고, 사용자 지정 slug는 입력 의도를 보존한다.
같은 `create-project` slice의 model/UI 안에서 해결한다.

**완료·회귀 기준:** 실제 폼 상태 전이와 제출 값을 확인한다.

- 유효 URL A → 무효 URL, 유효 URL A → 빈 문자열에서 A가 제출되지 않는다.
- 이후 유효 URL B를 입력하면 B의 식별자가 제출된다.
- picker 선택과 유효한 상세 직접 입력이 계속 동작한다.
- 사용자 지정 slug를 유지하면서 저장소 선택의 유효성을 정확히 판정한다.

기존 `new-project-form.test.ts:9`의 모드·초기 렌더 시험은 이 상호작용 전이를 다루지 않는다.
순수 모드 함수만 검사하는 시험으로 위 제출 경로 검증을 대체하지 않는다.

### SRC-08 — REST 등록의 명시적 slug를 기존 서버 정책으로 검증하기

**관점:** TypeScript generalist. **원시 ID:** TS-01. **확신:** 높음.

**코드 근거:** `src/server/project-registration.ts:44`는 owner/repo만 검사하고,
`:54`는 `body.slug`를 그대로 전달한다. `src/server/project-registration-query.ts:79`는
slug가 생략됐을 때만 안전한 자동 파생을 수행하며, 명시적 값은 `:89`에서 바로 저장한다.
`prisma/schema.prisma:36`은 일반 unique String이다. 반면 서버의
`src/server/project-slug-rule.ts:12`와 `:15`에는 형식과 예약어 정책이 이미 있고,
웹 action `create-project.server.ts:22`는 두 정책을 검사한다.

**실패 경로와 영향:** 인증된 사용자가 새 저장소를 `slug: "new"`로 등록하면 현재 경로에서
생성될 수 있다. 하지만 `src/app/(app)/p/new/page.tsx:9`는 프로젝트 생성 화면이다.
`a/b`도 저장 가능하고 `src/fsd/shared/routes/project.ts:17`은 `/p/a/b`를 만들어
단일 `[slug]` URL 계약과 어긋난다. 성공 응답과 한도 소비가 발생하면서 프로젝트의 루트
화면이 올바르게 열리지 않는다.

**최소 수정안:** REST service 경계에서 제공된 slug 문자열을 기존 서버 `SLUG_RE`와
`RESERVED_SLUGS`로 검증하고, 실패는 현재 응답 계약의 `400`으로 반환한다.
자동 파생과 웹 폼 정책을 유지하며, 검증은 기존 서버 정책 소유 위치를 사용한다.

**완료·회귀 기준:** 인증된 새 저장소 등록에서 `new`, slash 포함, 대문자, 길이 초과 slug를
저장 전에 거부한다. 거부에는 프로젝트·availability version/event 쓰기가 없어야 한다.
정상 명시적 slug, slug 생략 시 자동 파생, 기존 등록의 멱등 결과를 확인한다.

**로컬 런타임 근거:** 설치된
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`의
단일 segment 계약과 `node_modules/next/dist/shared/lib/router/utils/sorted-routes.js:43`의
정적 경로 우선 정렬을 대조했다.

### SRC-05 — 승인 저장 결과와 커밋 후 조언 조회를 분리하기

**관점:** Coupling. **원시 ID:** CPL-02. **확신:** 높음.

**코드 근거:** `src/server/pipeline/board-query.ts:400`의 `gate()`는 transaction에서
승인 이벤트와 커서를 변경하고 `:423`에서 커밋 결과를 받는다. 이후 `:430`에서
`nextFor()`를 기다려야 성공 응답을 반환한다. `src/server/pipeline/run-query.ts:111`의
후속 조회에는 DB 접근과 throw 경로가 있으며, `board-query.ts:21`의 오류 래퍼는
예상 밖 예외를 전파한다.

웹의 `src/fsd/features/review-gate/api/review-gate.server.ts:39`는 반환된 `next`를
사용하지 않는다. 그럼에도 후속 조회가 실패하면 `:41`의 재검증과 성공 응답에 도달하지 못한다.
MCP는 `src/server/mcp/owner-deps.ts:12`와 `owner-tools.ts:15`에서 실제로
`{ item, next }` 응답 계약을 사용한다.

**영향:** 승인 기록과 커서는 저장됐는데 웹은 승인 실패 화면으로 이동할 수 있다.
웹이 필요로 하지 않는 MCP용 조언 조회의 장애와 변경이 mutation의 성공 경로를 막는다.
현재 제어 흐름으로 확인한 실패 가능성이며, 장애 빈도를 측정하거나 실제 DB 장애를
재현했다는 뜻은 아니다.

**최소 수정안:** 공통 승인 mutation은 저장 결과를 반환하고, MCP adapter는 커밋 후
조언을 합성한다. 조언 실패와 승인 저장 완료를 구분하여 이미 저장된 승인을 미기록 실패로
표현하지 않는다. 기존 주석에 기록된 원격 DB transaction 시간 초과를 피하도록
조언 조회는 커밋 이후에 유지한다. MCP 정상 `{ item, next }` 계약을 보존하고,
조언 실패의 응답 의미를 구현·계약·시험에서 일치시킨다.

**완료·회귀 기준:** 실제 성공 mutation 경로를 지나는 테스트 double에서 커밋 후 조회만
실패시킨다. 승인 이벤트·커서 저장이 유지되고 웹이 저장 성공에 따라 갱신되는지 확인한다.
MCP 정상 조언과 조언 실패 시 승인 완료 사실도 검증한다. 기존
`src/server/pipeline/board-query.test.ts:8`은 커밋 후 `nextFor`를 시험하지 않는다고 명시한다.
mutation 자체의 거부·rollback·CAS 시험도 유지한다. commit 확인 실패는 별도로 검증하여
저장 여부가 불명인 예외를 저장 완료 advice 오류나 rollback 확정으로 바꾸지 않는다.

## 채택된 발견 — Should

### SRC-09 — 보고 actor의 조회와 정렬을 own-property 기준으로 처리하기

**관점:** TypeScript generalist. **원시 ID:** TS-03. **확신:** 높음.

**코드 근거:** `src/fsd/entities/board-item/model/doc-link.ts:21`의 `REPORT_LABEL`은
일반 객체다. `:36`의 조회에서 `constructor`는 상속된 함수를 반환하며,
`:42`의 `in`도 참이 된다. 그 결과 actor가 일반 목록에서 제외되고 고정 역할 목록에도
없어 `src/fsd/pages/board-item/model/item-docs.ts:24`의 순회에서 빠진다.
`src/fsd/widgets/history-feed/model/history-row.ts:57`도 잘못된 라벨 값을 받는다.

**입력의 유효성·영향:** `packages/core/workspaces.mjs:2`와 `:12`는 `constructor`를
정상 workspace agent 이름으로 허용한다. roster에 있으면
`src/server/pipeline/board-rules.ts:109`와 `:136`에서도 보고를 허용한다.
저장된 해당 actor의 보고서 링크가 Documents에서 누락되는 표시 결함이다. 저장 데이터는 유지된다.

**최소 수정안:** 고정 역할 라벨을 `Map<string, string>`으로 관리하고 조회와 membership을
`Map.get/has`로 통일한다. 기존의 정상 agent 이름과 보고서 저장 계약을 보존한다.

**완료·회귀 기준:** `constructor`의 라벨이 문자열이고 actor 정렬에서 유지되는지,
같은 actor의 여러 보고서가 Documents 링크에 모두 남는지 확인한다.
History의 기본 보고 라벨과 고정 역할의 기존 라벨·순서도 확인한다.

### SRC-07 — Inbox 오류 경계가 저장 여부를 단정하지 않도록 수정하기

**관점:** Predictability, TypeScript generalist. **원시 ID:** PRD-02, TS-04. **확신:** 높음.

**코드 근거:** `src/fsd/features/review-gate/ui/inbox-card-boundary.tsx:19`는 항상
`The decision wasn't recorded. Try again.`을 표시한다. 하지만
`inbox-card.tsx:54`의 경계는 하위 렌더 실패도 받고, `gate-transition-button.tsx:28`의
transition에서는 action의 처리되지 않은 예외도 받는다. SRC-05의 커밋 후 조언 조회뿐 아니라
저장 뒤 revalidation·응답 실패에서도 이 경계는 저장 여부를 판정할 수 없다.
`:13`의 “결정을 시도했다는 걸 알 수 있다”는 주석도 하위 렌더 실패에는 맞지 않는다.

**영향:** 사용자가 저장 여부를 확인하지 못한 상태를 저장 미실행·rollback으로 해석한다.
기존 CAS·gateEntry의 방어가 있으므로 중복 커밋이 입증됐다는 지적은 아니다.

**최소 수정안:** 기록 상태를 단정하지 않는 오류 문구와 최신 상태 확인 안내를 제공하고,
주석과 `docs/conventions/product-copy.md:985`의 canonical §17을 함께 수정한다.
기존 `retry()`는 데이터를 다시 가져오고 렌더하는 복구 동작으로 유지한다.

**완료·회귀 기준:** 최초 카드 하위 렌더 실패와 승인 저장 후 실패 모두에서 “미기록”을
단정하지 않는다. retry 후 최신 Inbox 상태를 확인하며 이를 mutation 재제출로 설명하지 않는다.
화면 문구와 product-copy 계약의 정합성을 확인한다.

**로컬 런타임 근거:** 설치된 error-handling 문서의 `startTransition` 오류 전파와
`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/catchError.md:200`의
retry 재조회·재렌더링 계약을 대조했다.

SRC-05와 별도로 유지한다. 서비스의 불필요한 조언 의존성을 제거해도 하위 렌더와 응답 실패의
불확실성은 남으므로, 서비스 책임 분리와 오류 안내는 각각 수정해야 한다.

### SRC-01 — 전이 kind와 반환 규칙 타입을 core가 소유하기

**관점:** Cohesion. **원시 ID:** COH-01. **확신:** 높음.

**코드 근거:** `src/fsd/features/review-gate/model/gate-source.ts:13`과
`src/server/pipeline/board-rules.ts:13`이 같은 `RuleKind` union을 독립 선언한다.
FSD의 `:16`과 서버의 `:44`, `:172`는 실제 core 반환값을 로컬 타입으로 단언한다.
값의 출처는 `packages/core/transitions.mjs:8`의 RULES다.

`src/fsd/features/review-gate/model/gate-source.test.ts:10`은 두 목록을 묶는다고 설명하지만,
실제로 서버 타입을 검증하지 않는다. `:13`의 FSD 로컬 목록에 core에서 나온 kind가
포함되는지만 검사한다. 두 union에는 현재 생성되지 않는 `done`도 남아 있다.

**영향:** core 어휘 변경 시 UI·서버·테스트 목록을 따로 수정해야 하고, 단언이 변경 누락을
가릴 수 있다. 현재 분류 오류가 확인됐다는 지적은 아니다.

**최소 수정안:** `packages/core/transitions.d.mts`에 kind·반환 규칙 계약을 두고
양쪽에서 가져다 쓴다. 로컬 union·반환 단언을 제거하고 실제 RULES와 타입 계약의 정합성을
검증한다. core 소유는 현재 아키텍처가 허용하며 기존 `packages/core/pipeline.d.mts`가 선례다.

**완료·회귀 기준:** UI와 서버가 같은 core 타입을 사용하고 실제 반환 어휘와 계약이 일치한다.
주석의 테스트 범위 설명도 실제 검증과 맞춘다. `.d.mts`는 `scripts/plugin-lib.mjs:9`의
`.mjs` 배포 대상이 아니므로 타입 선언 추가 자체로 플러그인 runtime 배포 모듈은 늘지 않는다.

### SRC-03 — History query의 생성과 해석 계약을 같은 모델에서 관리하기

**관점:** Cohesion. **원시 ID:** COH-03. **확신:** 근거 높음, 긴급성 중간.

**코드 근거:** `src/fsd/pages/project-history/model/history-navigation.ts:7`의 encoder는
`mode/view/before/item/itemBefore`를 쓴다. route
`src/app/(app)/p/[slug]/history/page.tsx:16`, `:18`, `:24`, `:27`, `:40`, `:41`은
같은 키·기본값·legacy bookmark 규칙을 별도로 해석한다. 기존
`project-history-page.test.ts:36`과 `:89`는 생성 query를 확인하지만 reader와 연결하지 않는다.

**영향:** 한쪽만 query 키나 기본값을 변경하면 타입 오류 없이 탐색·상세 pagination이
달라질 수 있다. 현재 탐색 실패가 확인됐다는 뜻은 아니다.

**최소 수정안:** 기존 `history-navigation.ts`에 순수 `readHistoryQuery`를 함께 두고 page의
public API로 공개한다. 모드·뷰·키·legacy 기본값을 함께 관리한다.
Next `await searchParams`, 인증, DB 조회와 cursor token 해석은 현재 route/server 책임을 유지한다.

**완료·회귀 기준:** 생성 URL과 reader의 왕복, 목록·상세 cursor의 독립성,
`?view=key/all` 기존 북마크를 보존한다. `string | string[] | undefined` 입력과
잘못된 query에 대한 현재 기본값 처리도 확인한다. 이 입력 범위는 설치된 Next `page.md`와 일치한다.

### SRC-04 — InboxCard의 Client 경계를 상호작용 컨트롤로 좁히기

**관점:** Coupling. **원시 ID:** CPL-01. **확신:** 높음.

**코드 근거:** `src/fsd/features/review-gate/ui/inbox-card.tsx:1`은 카드 전체를 Client 모듈로
선언한다. 자체 hook은 없고 `:44`의 반려 callback, `:84`의 승인 callback을 만들기 위해
정적 머리말·증거·설명과 `:142`의 `StatusLine`, `:178`의 `PlanRow`, `:202`의 `Kv`까지 포함한다.
상호작용 state/context는 기존 버튼과 패널에 있다. 상위
`src/fsd/pages/project-inbox/ui/project-inbox-page.tsx:6`은 Server Component이며
route `src/app/(app)/p/[slug]/inbox/page.tsx:18`은 bound Server Actions를 전달한다.

**영향:** 정적 표시의 변경과 의존성도 브라우저 모듈 그래프에 포함된다.
이는 현재 작은 Client leaf 원칙과 관련된 결합도 문제다. 번들 크기나 성능 저하를 실측한 주장은 아니다.

**최소 수정안:** 같은 review-gate slice에서 정적 server view를 두고 payload callback 생성은
Client 컨트롤로 옮긴다. 필요한 직렬화 데이터와 Server Actions를 전달한다.
카드별 `GateCardLock`과 오류 경계는 children 조합으로 유지하고 server export를
`index.server.ts`로 공개한다. UI 동작과 현재 카드별 Context 책임을 보존한다.

**완료·회귀 기준:** read-only 표시, 검증 상태, 승인·반려·재개, 카드별 잠금과 오류 격리,
Server/Client public API 경계를 확인한다. 새 server view에서 일반 callback 함수를
Client props로 직렬화하지 않도록 실제 Next build로 확인한다.

**로컬 런타임 근거:** 설치된
`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`의
Client import graph·작은 상호작용 경계·server children/provider 조합 계약을 대조했다.

## 채택된 발견 — Consider

### SRC-02 — Evidence 입력 상한을 기존 정책 값에서 읽기

**관점:** Cohesion. **원시 ID:** COH-02. **확신:** 높음.

**코드 근거:** `src/fsd/features/propose-item/ui/propose-button.tsx:11`의 독립
`REASON_MAX = 150`이 `:48`의 `maxLength`를 정한다. 서버의
`src/server/pipeline/board-rules.ts:36`은 core `checkText("reason", ...)`를 사용하고
실제 상한은 `packages/core/transitions.mjs:6`의 `TEXT_LIMIT`이다.

**영향:** 현재 값은 일치하지만 정책 변경 때 UI가 허용·차단하는 범위와 서버의 거부 범위가
달라질 수 있다. 다른 보드 표시와 게이트 노트는 이미 core 값에서 파생된다.

**최소 수정안:** 독립 숫자를 이미 공개된 board-item public API의 `FIELD_BUDGET`으로 대체한다.

**완료·회귀 기준:** 입력 maxLength가 기존 정책 값과 같고 Evidence의 경계값 거부 동작이 유지된다.
이 상수 연결만 바꾸는 경우에는 기존 정책 시험과 해당 렌더 대조로 충분하다.

### SRC-10 — Copy 성공 상태를 복사한 문자열에 연결하기

**관점:** TypeScript generalist. **원시 ID:** TS-05. **확신:** 높음.

**코드 근거:** `src/fsd/shared/ui/copy-button.tsx:19`의 boolean `copied`는 성공 뒤
현재 `text`와 관계없이 남는다. `src/fsd/features/manage-token/ui/new-token-form.tsx:31`,
`:48`은 같은 위치의 unkeyed TokenReveal에 새 토큰을 전달한다. 사용자·소유자 토큰 폼도
같은 방식이다(`new-user-token-form.tsx:35`, `:52`; `new-owner-token-form.tsx:30`, `:47`).
내부 CopyButton은 새 text prop을 받는다.

**영향:** A를 복사한 뒤 B를 발급하면 B의 평문·명령 옆에 이전 `Copied` 표시가 남는데
클립보드에는 A가 있다.

**최소 수정안:** 마지막으로 성공적으로 복사한 문자열을 상태에 저장하고 현재 `text`와
같을 때만 `Copied`를 표시한다. 이전 text의 비동기 복사가 늦게 완료되어도 새 text의 성공으로
표시되지 않도록 클릭 당시 복사 대상과 성공 상태를 연결한다. 같은 버튼의 복사는 한 번에
하나만 실행한다. ref로 재진입을 차단하고 pending 동안 버튼을 비활성화하여, 늦게 완료된
이전 쓰기가 더 최근 성공 표시와 클립보드 내용을 어긋나게 만드는 경쟁도 막는다.

**완료·회귀 기준:** A 복사 → B prop 변경에서 `Copy`로 표시되고 B 복사 성공 뒤에만
`Copied`로 바뀐다. A의 늦은 완료와 복사 실패도 확인하며, 기존 선택 가능한 텍스트 fallback과
토큰을 로그에 포함하지 않는 처리를 유지한다.

## 구현 계약과 구체적 변경 목록

이 절은 위 10건의 후속 구현 범위를 확정한다. Must/Should/Consider는 우선순위이며,
Consider를 자동으로 제외하거나 별도 승인 없는 Phase 2로 보내지 않는다. 현재 요청의
권한은 **제안서 검증·편집**이다. 코드 구현·commit·push·PR·배포 권한을 부여하지 않는다.
후속 구현 요청이 오면 아래 전체 범위와 최신 코드 기준을 다시 확인한다.

등록·인가·승인 원장·외부 MCP 응답·RSC 산출물에 닿으므로 reconciliation의 Review Profile은
**High-Risk**다. frontmatter의 `proposal-size: standard`는 문서 분류이며 이 위험 판정을 낮추지 않는다.
현재 accepted architecture는 README/FSD/system-overview/verification/invariants/
repository-disconnection이고, MCP wire 계약은 protocol과 실제 owner-tools serializer를 함께 대조한다.
transaction 실패 의미는 실제 board wrapper와 설치된 Prisma client/pg adapter를 대조한다.
product-copy는 SRC-05의 §12 오류 문장·§13 owner 도구 설명/응답 계약, SRC-07의 §17과
기존 라벨을 보존할 §11이 직접 범위다. related의 완료된 2차 리뷰는
역사적 배경이며 현재 구현 지침을 위임받은 문서가 아니다.

### 수정·생성·보존 위치

경로는 repository root 기준이다. 아래 표의 새 파일은 현재 없고 부모 디렉터리는 존재한다.
기존 파일명과의 충돌은 없다. 기존 파일을 통째로 다른 slice로 옮기거나 새 slice를 만들지 않는다.
시험은 `test:web`가 실제로 선택하는 `.test.ts`/`.test.mjs`, 또는 서버 bootstrap을 쓰는
`tests/server/*.test.ts`에 둔다. `.test.tsx`는 현재 script glob에 포함되지 않는다.

| 대상 | 변경 위치·새 목적지 | 함께 확인할 소비자·public API | 구현 후 검증 목적지 |
| --- | --- | --- | --- |
| SRC-06 | `src/fsd/features/create-project/ui/new-project-form.tsx`; 새 `src/fsd/features/create-project/model/repository-selection.ts`와 `repository-selection.test.ts` | 같은 slice의 `model/repo-url.ts`, `model/project-slug.ts`, `api/create-project.server.ts`, `index.ts`, `index.server.ts`; `src/app/(app)/p/new/page.tsx` 배선 보존 | 기존 `ui/new-project-form.test.ts` 보존·보강; 아래 B-01의 실제 폼 제출 인수 |
| SRC-08 | `src/server/project-registration.ts`에서 서버 slug 상수 import·입력 검사 | `project-slug-rule.ts`, `project-registration-query.ts`, `project-availability-service.ts`, `rest-scope.ts`, `user-scope-query.ts`; `src/app/api/projects/route.ts` transport 보존 | 새 `tests/server/project-registration.test.ts`; 기존 `src/server/project-registration-query.test.ts`, `src/server/project-slug-rule-sync.test.ts`, `tests/server/integration/project-connection.test.ts` |
| SRC-05 | `src/server/pipeline/board-query.ts`; 새 `src/server/mcp/owner-gate.ts`의 `createOwnerGate`; `src/server/mcp/owner-deps.ts`의 실제 의존성 주입; `src/server/mcp/owner-tools.ts`, `docs/architecture/protocol.md`의 owner 표와 `docs/conventions/product-copy.md` §12·§13 | `src/server/pipeline/board.ts`의 `gate` facade, `run.ts`의 `nextFor`, `run-rules.ts`의 `PipelineNext`; 웹 `src/fsd/features/review-gate/api/review-gate.server.ts` | 기존 `board-query.test.ts`, `owner-tools.test.mjs`의 실제 metadata·오류 body와 canonical 문구 대조; 새 `tests/server/owner-gate.test.ts`, `tests/server/review-gate-actions.test.ts`; 기존 `tests/server/integration/board.test.ts` |
| SRC-07 | `src/fsd/features/review-gate/ui/inbox-card-boundary.tsx`; `docs/conventions/product-copy.md` §17; `scripts/retired-copy.test.mjs`의 폐기 표현 등록 | 같은 slice `ui/inbox-card.tsx`, `ui/gate-transition-button.tsx`; 상위 `src/app/(app)/p/[slug]/error.tsx`의 불확실성 원칙 보존 | 기존 `ui/inbox-card.test.mjs`에서 실제 fallback 문구와 canonical 문서 대조; 아래 B-05의 Next 오류·retry 인수 |
| SRC-09 | `src/fsd/entities/board-item/model/doc-link.ts` | `src/fsd/entities/board-item/index.ts`; `src/fsd/pages/board-item/model/item-docs.ts`; `src/fsd/widgets/history-feed/model/history-row.ts` | 기존 `doc-link.test.ts`, `item-docs.test.ts`, `history-row.test.ts` |
| SRC-01 | 새 `packages/core/transitions.d.mts`; `src/fsd/features/review-gate/model/gate-source.ts`, `src/server/pipeline/board-rules.ts`의 중복 타입·단언 제거 | 아래 전체 transitions 소비자 목록; `packages/core/transitions.mjs`의 실행 표·export는 보존 | 기존 `gate-source.test.ts`의 완전성 시험을 core 타입에 연결; `packages/core/transitions.test.mjs`, `src/server/pipeline/board-rules.test.mjs`; `npm run check` |
| SRC-03 | `src/fsd/pages/project-history/model/history-navigation.ts`와 새 `history-navigation.test.ts`; 같은 slice `index.ts`에 reader 명시적 export | `src/app/(app)/p/[slug]/history/page.tsx`가 public API로 reader import; 같은 slice `ui/project-history-page.tsx`, `ui/history-items-list.tsx`의 encoder 소비 유지 | 새 model 시험과 기존 `ui/project-history-page.test.ts`; `tests/server/project-history.test.ts`, `tests/server/integration/history-items.test.ts`, `tests/server/integration/project-history.test.ts` |
| SRC-02 | `src/fsd/features/propose-item/ui/propose-button.tsx`의 `REASON_MAX` 제거·`FIELD_BUDGET` 사용 | `src/fsd/entities/board-item/index.ts`의 기존 export와 `model/text-budget.ts`; `src/server/pipeline/board-rules.ts`의 기존 `checkText` | 기존 `packages/core/transitions.test.mjs`의 제한 검사와 실제 입력 `maxLength` 대조 |
| SRC-04 | `src/fsd/features/review-gate/ui/inbox-card.tsx`의 server wrapper/content; 새 같은 디렉터리 `inbox-card-controls.tsx`; `index.ts`, `index.server.ts`; `src/fsd/pages/project-inbox/ui/project-inbox-page.tsx` | 기존 Client `gate-card-lock.tsx`, `inbox-card-boundary.tsx`, `gate-transition-button.tsx`, `reject-actions.tsx`, `resume-buttons.tsx`; `model/inbox-item.ts`; route `src/app/(app)/p/[slug]/inbox/page.tsx`의 bound Actions 보존 | 기존 `ui/inbox-card.test.mjs`; 새 `tests/server/inbox-card-boundary.test.ts`에서 public API·Client import graph 검사; fresh Next build와 B-05 |
| SRC-10 | `src/fsd/shared/ui/copy-button.tsx`; 새 같은 디렉터리 `copy-button.test.ts` | 직접 소비자 전부: `src/fsd/entities/project-token/ui/token-reveal.tsx`, `owner-token-reveal.tsx`, `src/fsd/widgets/turn-banner/ui/next-step.tsx`; 간접 소비자인 `src/fsd/features/manage-token/ui/new-token-form.tsx`, `new-owner-token-form.tsx`, `src/fsd/features/manage-user-token/ui/new-user-token-form.tsx` | 새 시험의 제어 가능한 clipboard promise·반복 클릭·prop 전이; 기존 `src/fsd/entities/project-token/ui/token-reveal.test.ts`와 B-06 |

서버 전용 시험이 singleton을 mock할 필요가 생기면 DB 연결 없이 주입 seam을 사용한다.
`createOwnerGate`는 latest-row 조회, gate mutation, 후속 advice 함수를 주입받는 adapter이며,
운영 바인딩은 owner-deps만 맡는다. 새 전역 mutable registry나 운영 코드의 test-only switch는 만들지 않는다.
mock/clipboard 교체는 각 시험의 finally 또는 test cleanup에서 복원하고 매 시험의 deferred promise를 종료한다.

### SRC-06: 입력 출처와 제출 상태

`repository-selection.ts`는 URL/picker/direct 상태와 유효 제출 식별자를 순수하게 판정한다.
URL의 파싱 결과와 현재 URL이 서로 다른 독립 state로 제출 권한을 갖지 않게 한다.
slug/branch/name은 별도 사용자 설정이며, 최종 slug·GitHub segment 검사는 기존 action에 남는다.
URL 실재 여부를 GitHub에 확인하는 새 기능은 만들지 않는다.

| 사용자 동작 | 다음 입력 출처·유효 선택 | 제출·표시 결과 |
| --- | --- | --- |
| URL A 입력 | URL, 현재 `parseRepoUrl(A)` | A의 owner/repo; untouched slug만 A에서 파생. 입력란은 유지 |
| URL A → 빈 값/무효 값 | URL, 선택 없음 | A 요약 제거·Create 비활성; owner/repo 제출 필드는 비우거나 disabled하여 A가 FormData에 남지 않음. 사용자 지정 slug는 보존 |
| 이후 URL B 입력 | URL, 현재 B | B만 제출. 사용자 지정 slug·사용자 branch 설정 보존 |
| picker에서 저장소 선택 | picker, 선택한 option | `defaultOwner`/option name/defaultBranch 사용; untouched slug만 파생 |
| URL 입력 모드로 전환 | URL, 현재 URL의 파싱 결과 | picker/direct의 오래된 선택을 현재 URL의 유효성으로 인정하지 않음 |
| picker 모드로 전환 | 선택 대기, 선택 없음 | 이전 URL 오류·선택 권한 제거; 실제로 새 option을 선택하기 전에는 제출 불가 |
| Edit 진입·owner/repo 직접 변경 | direct, 현재 상세 필드 | URL이 무효/빈 값이어도 명시적 직접 입력으로 등록 가능. 수동 모드에서는 선택이 없어도 Edit 진입점을 제공 |
| 상세 영역 Collapse | 출처 유지 | 접는 동작만으로 direct 선택을 오래된 URL로 되돌리지 않음 |
| slug만 수정 | 기존 출처 유지, slugTouched=true | 무효 URL을 유효 선택으로 바꾸지 않음 |
| direct 편집 후 URL 재입력 | URL, 새 URL의 파싱 결과 | 상세 필드의 이전 식별자가 새 무효 URL을 대신 제출하지 않음 |
| Start over | 선택 없음 | 현재 reset의 repo/slug/branch/owner/slugTouched/query/url/error/edit 초기화 보존 |
| action pending/expected error/terminal success | 현재 제출 snapshot/재시도/완료 화면 | pending 중 추가 제출 불가. error에서는 재편집 가능. created/existing/disconnected의 실제 저장 slug와 1회 token 노출 구분 보존 |

비활성 버튼만으로 완료하지 않는다. 유효 선택이 없을 때 실제 `<form>`의 owner/repo 제출 값도
이전 대상에서 분리한다. 직접 유효 action payload를 보내는 요청의 서버 검사는 기존 경계가 맡는다.

### SRC-08: REST 입력·쓰기 경계

기존 순서 `hu_ 인증 → owner/repo 검사 → slug 검사 → transaction`을 사용한다.
slug 검사에는 `field(body, "slug")`의 **trim된 비어 있지 않은 문자열**을 사용한다.
생략·null·빈/공백 문자열·비문자열이 현재처럼 undefined로 정규화되는 계약은 보존한다.
이는 새로운 엄격 JSON schema 정책을 추가하는 작업이 아니다.

- 명시적 문자열이 `SLUG_RE`에 실패하거나 `RESERVED_SLUGS`에 있으면 transaction을 시작하기 전에
  `400` service 결과를 반환한다. route의 실제 JSON body는 `{error: reason}`이다.
- `new`, `a/b`, `Ab`, 한 글자, 41자, 내부 공백을 거부하고 정상 두 글자·40자·trim 가능한 slug는 허용한다.
  인증 실패는 잘못된 slug보다 먼저 `401`이며, Git branch의 slash는 계속 허용한다.
- 거부 시 Project/token/availability version/event 쓰기 0회와 transaction 호출 0회를 확인한다.
  helper를 직접 시험하는 것으로 REST service/route 검증을 대체하지 않는다.
- 정상 명시적 slug, 자동 파생, 대소문자를 무시하는 기존 repository의 `200` 멱등 결과,
  새 repository의 `201`, 연결 해제 `409 {error,reconnectPath}`, 무결성 `409`, 상한 `403`을 보존한다.
  유효하지만 기존 값과 다른 slug를 보내도 기존 repository를 rename하지 않는다.
  명시적 무효 slug는 기존 repository 요청에서도 입력 오류로 `400`이다.
- `registerProjectResultIn`의 User 잠금·Serializable 재시도·전역 slug 충돌 처리·원장 원자성은 변경하지 않는다.
  과거 잘못 저장된 slug의 rename/데이터 보정, Prisma schema·migration·연결 해제 flag 변경은 범위 밖이다.

### SRC-05/SRC-07: 커밋 결과, MCP body, 불확실한 화면

공통 `board.gate`는 `ServerResult<BoardItem>` 형태의 **저장 결과**를 반환한다.
기존 transaction 안의 owner/availability/plan/channel/gateEntry/validation/planCommit/CAS 판정,
경계 전이와 same-status 승인 원장, cursor 전진, 15초 timeout과 rollback 경계는 보존한다.
`nextFor`의 import·호출은 board-query에서 제거하고 MCP adapter에서 커밋 뒤에만 수행한다.
다른 board method의 transaction 의미를 변경하지 않는다.

| 경로 | 최종 결과·body | 추가 쓰기·조언 조회 |
| --- | --- | --- |
| mutation의 expected rejection | 현재 `ok:false/reason`; 웹 failure; MCP `isError:true`, text JSON `{error: reason}` | 커밋 없음; advice 0회 |
| mutation 작업 중 예상 밖 예외(commit 시도 전) | 기존 예외 전파 경로 | commit 시도 없음; rollback 시도; advice 0회. 실제 rollback 시험에서는 원장·cursor 쓰기 0회 확인 |
| commit 확인 실패·연결 오류로 결과 불명 | 기존 예외 전파 경로. 저장 완료/미기록/rollback 확정으로 바꾸지 않음 | rollback 시도가 실패할 수도 있음; advice 0회; 자동 mutation 재시도 없음. 최신 상태 읽기로 복구 |
| 웹 승인 커밋 성공 | `approveGate`가 `/p/<slug>`, `/p/<slug>/inbox`, 해당 item 경로를 재검증하고 `success()` | advice 0회; 승인 1회 |
| MCP 승인 커밋·advice 성공 | 현재처럼 `isError` 없는 text JSON `{item: writtenRow, next: PipelineNext}` | advice는 transaction 뒤 1회; 정상 item 필드·next shape 보존 |
| MCP 승인 커밋·advice 실패 | 아래 고정 reason을 기존 `{error}` serializer로 보내며 `isError:true`. `next`를 만들거나 `null`로 확장하지 않음 | 승인 커밋 유지; 자동 mutation 재시도 없음 |
| 저장 후 revalidation/응답 유실/하위 render 실패 | 화면은 저장 여부 불명으로 안내; 최신 데이터 조회 | retry는 action 재실행이 아님; 후속 승인 시 기존 CAS/gateEntry로 stale 방어 |

MCP advice 실패 reason은 다음으로 고정한다. 이 catch는 성공 mutation이 반환된 **이후의
advice await만** 감싼다. mutation 전체를 잡아서 이 문장으로 바꾸면 안 된다.

```text
The gate approval was recorded, but next advice could not be loaded. Call pipeline_next with the item key; do not retry gate_approve.
```

`pipeline_next`는 기존 agent 서버의 읽기/지연 전진 도구다. owner 서버에 새 도구를 등록하지 않는다.
이 문장은 기존 계획의 「조언 실패와 승인 저장 완료 구분」을 기존 오류 envelope 안에서 명확히 한다.
미확인 node/version을 사용해 가짜 `PipelineNext`, `done`, `wait/cap`을 합성하지 않는다.
원본 DB 예외·credential은 wire 문장에 넣지 않는다.

`src/server/db.ts`는 PrismaPg adapter를 사용한다. 설치된 Prisma 7.10.0의
`_transactionWithCallback`은 commit 오류 뒤 rollback을 시도하지만 그 시도가 실패하면
로그만 남기고 원래 예외를 전파한다. 따라서 transaction Promise의 reject 자체는
rollback 확인이 아니다. 성공 mutation 결과를 받지 못한 경로에서는 위 「approval was recorded」
고정 reason을 사용하지 않는다. 기존 예외·중립 화면·재조회 경로를 유지하며 새로운 응답 필드나
자동 승인 재시도를 추가하지 않는다.

B-03에서는 실제 gate 함수에 주입한 transaction seam으로 commit 전 작업 실패와
원장/cursor 저장 뒤 commit 확인 응답만 실패하는 경우를 각각 실행한다. 후자는 rollback도
확인되지 않는 double을 사용하여 원래 예외 전파, advice 0회, 웹 success/revalidate 0회와
저장 완료 advice 오류 미생성을 확인한다. 실제 DB 장애를 재현했다는 주장으로 쓰지 않는다.

구현과 같은 변경에서 `docs/architecture/protocol.md`의 owner 도구 표를 정정한다.
현재 표의 `step: 3|6`는 `owner-tools.test.mjs`의 **no runbook step** 계약 및 실제
`PipelineNext`와 어긋난 오래된 설명이다. 실제 `{item,next:PipelineNext}` 정상 body와 위 advice 오류
의미, slots-v1의 선택적 `gateEntry` 입력을 명시한다. `owner-tools.ts`의 도구 설명·타입 주석도
정상 응답과 실패 뒤 `pipeline_next` 복구 안내를 일치시킨다. 새로운 tool/response field는 추가하지 않는다.

`docs/conventions/product-copy.md`는 MCP 도구 설명·오류 문구도 코드보다 우선하는 원본이다.
§12에 위 advice 실패 reason을 그대로 등록하고, §13 owner 표의 기존 정상 설명 뒤에 다음 문장을
덧붙여 `owner-tools.ts`의 실제 description과 일치시킨다.

```text
If next advice fails after approval, the error says the gate approval was recorded. Call pipeline_next with the item key; do not retry gate_approve.
```

§13의 정상 `{item,next}` 설명은 유지하면서, advice 실패 시 이미 승인된 상태와
`isError:true`/text JSON `{error}` 및 mutation 재시도 금지를 함께 설명한다.
기존 `src/server/mcp/owner-tools.test.mjs`에서 실제 `registerOwnerTools`가 등록한 metadata를
수집해 description 전체를 §13 owner 행과 대조한다. 비교는 현재 도구 문구 시험처럼 Markdown
백틱·굵은글 서식만 제거하며, 복구 문장을 포함 검사로만 확인하지 않는다. 실제 handler의 advice
오류 body 문장이 §12와 위 고정 reason 모두에 일치하고 `next`가 없는지도 검증한다.
canonical 문서만 고치거나 코드에만 새 안내를 추가하면 이 시험이 실패해야 한다.

Inbox fallback은 key를 그대로 보여 주고, 본문을 다음으로 정한다. 버튼은 **Try again**을 유지한다.

```text
This card couldn't be loaded. Try again to check the latest Inbox state.
```

canonical §17의 「이 경계에 도달하면 결정을 시도한 사실을 안다」라는 예외 설명과 코드 주석을
제거하고 render/action 양쪽의 불확실성을 설명한다. `scripts/retired-copy.test.mjs`에 이전
미기록 단정 문장을 web 대상으로 추가한다. 현재 `shownText`는 HTML entity를 decode하지 않으므로
금지 pattern은 `/The decision wasn(?:'|&apos;|&#39;|&#x27;)t recorded/`처럼 raw/JSX 표현을 모두 잡아야 한다.
현재 fallback 원문과 plain apostrophe 변형을 넣어 금지 guard가 둘 다 실패하는지 검사한다.
historical proposal의 인용은 런타임 금지 검사의
대상이 아니다. 화면 문구와 canonical 문서를 함께 바꾸고 실제 fallback 렌더를 대조한다.

### SRC-01/SRC-02: 전체 core 타입 계약

`transitions.d.mts`는 `.mjs`의 TypeScript 타입을 대체하므로 일부 export만 선언하면 안 된다.
다음 **현재 runtime export 8개 전부**를 원래 호출 범위와 반환값으로 선언한다:
`STATUSES`, `TEXT_LIMIT`, `findRule`, `canDiscard`, `isOpen`, `canPropose`,
`canRecordValidation`, `checkText`. `findRule(actor: string, from: string, to: string)`은
`TransitionRule | null`; Rule에는 from/to/actor/kind와 기존 네 optional boolean
`requiresResult/requiresPlan/requiresReport/clearsValidation`을 모두 포함한다.
`checkText`의 text는 unknown을 받아 `string | null`을 반환하며, status를 받는 기존 판정 함수는
임의 문자열을 거부할 수 있어야 한다. `canPropose`는 number→boolean이다.

`RuleKind`는 실제 7종 `gate/auto/bounce/hold/resume/plan/reopen`이고 `done`은 status이지 kind가 아니다.
현재 RULES 15개와 상태 전이/증거 정책은 그대로 둔다. UI의 type 사용·시험 import와 서버의
`TransitionPatch.kind`를 core 타입으로 연결하고 두 로컬 union, 서버 `Rule` 복제,
`as Rule | null`·`as RuleKind | null`을 제거한다.

기존 gate-source의 타입 시험은 `Record<RuleKind, true>`로 완전한 kind 집합을 요구하고,
세 actor × 모든 STATUSES from/to를 순회해 나온 runtime kind 집합과 **동등성**을 검사한다.
한쪽 집합이 다른 쪽에 포함되는지 또는 단언한 배열만 검사하면 새 kind/폐기 kind를 놓친다.
typecheck는 UI·서버 둘 다 새 declaration을 소비하고 optional flags를 null narrowing 후 읽는지 확인한다.
runtime export 이름도 선언 목록과 대조하여 새 export를 놓치지 않는다.

직접 transitions import 소비자는 다음 **13개 파일 전부**다. 반환값/argument 호환성 검증에서 생략하지 않는다.

- `src/fsd/entities/board-item/model/inbox-gate.ts`, `text-budget.ts`
- `src/fsd/features/review-gate/model/gate-source.ts`, `gate-source.test.ts`, `gate-text.ts`
- `src/fsd/widgets/turn-banner/model/turn.ts`
- `src/server/agents/next.ts`, `steps.ts`
- `src/server/pipeline/board-query.ts`, `board-rules.ts`, `run-rules.ts`
- `src/server/project-availability-service.ts`
- `packages/core/transitions.test.mjs`

Evidence UI에서는 `@/fsd/entities/board-item`에서 `FIELD_BUDGET`을 가져와 기존 input의
maxLength만 연결한다. declaration 추가는 runtime module 추가가 아니며, 이번 범위에서는
`transitions.mjs`와 `plugin/lib/transitions.mjs`를 바꾸지 않는다. 불가피한 `.mjs` 변경이 생기면
먼저 범위를 재평가하고 `npm run sync:plugin-lib` 뒤 원본/복사본 바이트 일치 검사를 수행한다.
`plugin/lib`는 직접 편집하지 않는다.

### SRC-03: History decoder 기본값과 소유권

`readHistoryQuery`는 plain object `Record<string, string | string[] | undefined>`를 받고
`{mode, view, before, item, itemBefore}`를 반환한다. view는 `key|all`, 나머지 세 query 값은
string 또는 undefined다. cursor token의 의미/유효성은 서버 parser가 판정한다.

- `mode === "events"`면 events. mode가 **undefined일 때만** `view === "key" || "all"`을 legacy events로 읽는다.
  나머지는 items다. `mode="bad"`, 빈 문자열, 배열은 view=all이어도 items다.
- view는 정확한 scalar `"all"`만 all, 그 밖에는 key다. before/item/itemBefore는 scalar string만 넘긴다.
  배열을 첫 원소로 임의 정규화하지 않는다. 빈 string의 cursor 처리도 현재 server parser에 위임한다.
- items의 before는 `parseHistoryItemCursor`, 펼친 항목의 itemBefore는 `parseHistoryCursor`,
  events의 before는 `parseHistoryCursor`를 계속 사용한다. 두 종류를 공통 parser로 합치지 않는다.
- item은 현재 items 페이지의 row에서 찾은 key만 펼친다. 없는/다른 페이지의 item은 expanded=null이다.
  펼친 항목 event/report·currentRoundIds·별도 nextCursor와 history cutoff를 유지한다.
- `historyHref`의 canonical URL을 reader로 해석하는 왕복을 검사한다. 기본값 생략을 하므로 문자열이나
  입력 object의 그대로 왕복이 아니라 **정규화된 의미**가 같아야 한다. legacy URL도 별도 검사한다.
- route의 await params/searchParams, requireProjectOwner, plan cutoff·DB read·cursor formatter는 보존한다.
  FSD model은 `@/server`를 import하지 않는다. 해제된 소유자 History GET은 읽기 전용이며 쓰기 0회다.

### SRC-04: Server wrapper와 Client leaf

`inbox-card.tsx`의 `use client`를 제거한다. exported `InboxCard`는 boundary/provider를 조합하고,
같은 파일의 별도 **Server Component `InboxCardContent`를 JSX 자식으로** 둔다.
정적 판정·StatusLine/PlanRow/Kv 렌더는 이 자식에서 한다. wrapper에서 content 함수를 직접 호출해
오류가 boundary를 만들기 전에 발생하게 하지 않는다. wrapper 자체의 오류·route loader 오류는
기존 상위 경계가 맡으며 카드 경계가 모든 오류를 잡는다고 주장하지 않는다.

새 Client `inbox-card-controls.tsx`는 승인 payload와 반려 callback을 만드는 두 leaf를 제공한다.
Server view는 일반 함수 `commit`/`reject`를 Client props로 보내지 않는다. scalar/array/평문 object
형태의 최소 카드 데이터와 route가 bind한 실제 Server Action reference만 전달한다.
승인은 key/gate/slotGateEntry/expectedUpdatedAt을 유지하고, 반려는 discard 인자, bounce 노트와
hold의 **클릭 시각 `new Date()`**를 유지한다. 서버 렌더의 now로 hold 기록 날짜를 만들지 않는다.
기존 ResumeButtons는 bound transition Action을 그대로 받는다.

카드마다 `InboxCardBoundary → GateCardLock(key=gateCardKey(item)) → InboxCardContent`를 구성한다.
Client leaf들이 같은 provider를 소비하고 Server 자식은 Context를 읽지 않는다.
슬롯/legacy lock key, toast, pending, 성공 후 refresh, 승인·반려 간 잠금, read-only chip·컨트롤 제거,
검증 없음의 중립 표시와 기존 재개 동작을 유지한다. 서버 분리만으로 재개에 새 잠금 정책을 추가하지 않는다.

`InboxCard`는 `features/review-gate/index.server.ts`에서만 export한다. `index.ts`에서는 제거하고
기존 client-safe 타입·ReopenActions·모델 export를 유지한다. project-inbox page는 Server API에서
카드를, client-safe API에서 타입을 import한다. client leaf가 server barrel을 import하면 실패다.
기존 카드 markup 시험은 같은 slice 내부 파일을 사용하며, server-only marker를 추가했다면
저장소 server bootstrap이 있는 시험 위치로 옮겨 실행한다. 시험을 삭제하거나 SSR 결과만으로
RSC serialization·오류 격리·클릭 동작의 인수를 완료하지 않는다.

### SRC-09/SRC-10: 표시 결과와 비동기 상태

Map 변경은 고정 역할의 라벨·순서, dev 이름순, main-loop acceptance 판정과 기록된 commit 링크를
그대로 보존한다. 유효한 `constructor` actor를 일반 dev로 처리한다.
동일 actor의 복수 보고서, 서로 다른 acceptance purpose와 현재/과거 round 구분을 버리지 않는다.
actor 이름을 금지하거나 저장된 report를 정리하는 방식으로 표시 문제를 피하지 않는다.

CopyButton은 성공한 **클릭 당시 문자열**을 저장해 현재 text와 비교한다. pending 중 text가 A→B로
바뀌면 A 완료가 B의 Copied가 될 수 없다. 한 번에 하나의 clipboard promise만 실행하므로
B를 복사한 뒤 A가 늦게 clipboard를 덮는 동일 버튼 경쟁을 만들지 않는다. 성공·실패 모두 finally에서
pending/ref 잠금을 해제하고, 실패 시 현재 성공 표시를 지운다. unmount 뒤 별도 timer/listener는 남기지 않는다.
이 표시는 마지막으로 이 버튼에서 복사한 값에 관한 것이며 다른 앱/버튼의 clipboard 변경 감시는 하지 않는다.
기존 text/variant/size/className API, Copy/Copied 문구, 선택 가능한 텍스트 fallback을 유지한다.
시험은 실제 Component handler와 prop 갱신을 실행해야 하며, 상태 판정 함수를 재구현한 시험으로 대체하지 않는다.

### 최종 산출물과 검증 연결

| 최종 산출물 | 값의 출처·우선순위 | 최종 body/내용·의존성 | 검증 목적지 |
| --- | --- | --- | --- |
| 생성 폼 action payload | 현재 입력 출처 → 유효 선택 → 실제 form control → 기존 Server Action validation | 현재 owner/repo/slug/branch/name만 제출; 기존 created/existing/disconnected 결과와 token 노출 | model·폼 시험 + B-01; token reveal 기존 시험 |
| REST `/api/projects` JSON | 인증·service 정규화/검사 → 기존 transaction → route status/body adapter | 성공 `{project}` 201/200; 오류 `{error}` 400/401/403/409, disconnected만 reconnectPath | service 시험과 실제 POST 통합 시험; status만으로 합격하지 않음 |
| owner MCP `gate_approve` metadata·text JSON | canonical §12·§13 → owner-tools description/serializer; 확인된 공통 mutation 성공 → owner adapter advice | 정상 full written item/실제 PipelineNext; 조언 실패는 위 고정 `{error}` + isError, 가짜 next 없음; commit 결과 불명은 기존 예외이며 저장 완료 reason 금지; 등록된 description 전체가 canonical owner 행과 일치 | owner adapter 성공/작업 실패/commit 확인 실패 seam + owner-tools 실제 handler의 content[0].text parse 및 registerTool metadata/canonical 대조 |
| Inbox HTML·RSC·Client graph·Action refs | route bound Actions → Server public API → server content + 기존 client children; Next 기본 config | static 카드 머리/계획/증거는 server render, controller/provider/boundary는 client; action 직렬화 가능. fallback은 canonical §17과 일치 | 카드 렌더·AST/import graph·fresh `npm run build` 후 해당 inbox의 client-reference manifest와 실제 브라우저 B-05 |
| History URL과 response body | Next query object → pure decoder → route별 cursor parser → owner/cutoff query → page encoder | Items/펼침/Events/key/all, legacy/default, 두 cursor와 report/event body 보존 | model 왕복 + page links + GET integration의 HTML 내용과 DB 무쓰기 |
| Documents/History 보고 링크 | report actor/acceptance purpose → own Map label/order → 기존 repo/ref/path encoder | constructor 포함 전부 표시, 복수 report와 고정 라벨/순서 보존 | doc-link/item-docs/history-row의 실제 값·링크 회귀 |
| TypeScript module 계약·플러그인 | `.d.mts`가 `.mjs` 타입 추론보다 우선; runtime은 기존 `.mjs`; plugin은 동기화 복사본 | 타입 export 전체, kind 7개, RULES 15개; runtime/배포 bytes 변화 없음 | 전체 소비자 typecheck, runtime kind/exports, plugin-lib --check |
| Copy/Evidence UI | 클릭 snapshot·직렬 실행·현재 text / core TEXT_LIMIT→FIELD_BUDGET | 정확한 Copy/Copied 표시와 기존 입력 상한; token·명령 평문은 로그에 추가하지 않음 | actual handler/prop 전이 + 실제 maxLength 및 core 경계값 |

fresh build의 `.next/server/app/**/page_client-reference-manifest.js`는 자동 생성된 검증 산출물이다.
그중 `(app)/p/[slug]/inbox`에 해당하는 파일을 실제로 찾아 검사하고, server `inbox-card.tsx`가
Client entry로 남지 않고 `inbox-card-controls.tsx`·기존 provider/boundary가 들어가는지 확인한다.
현재 cache의 manifest로 새 build 결과를 대신하지 않는다. Server Action manifest에는 새 일반
controller callback이나 정적 content가 remote action으로 추가되지 않아야 한다.
manifest 검사와 함께 실제 Inbox의 HTML/RSC body·상호작용도 확인한다. 번들 감소량은 별도 측정
없이는 수치로 주장하지 않는다. generated Prisma client/schema는 이번 변경 대상이 아니다.

### 회귀 인수 시나리오와 음성 검사

| ID | 준비·동작 | 필수 관찰 결과 |
| --- | --- | --- |
| B-01 | 테스트 계정·별도 repository 이름으로 실제 폼에서 A→무효/빈 값→B, picker 전환, 빈 URL에서 Edit, direct→URL, custom slug, Start over | 현재 effective 선택의 실제 FormData 확인; 무효 선택에는 이전 owner/repo 없음; B/유효 direct만 등록. 각 등록의 상태/token/id/slug 확인·자기 fixture 정리 |
| B-02 | REST service 및 실제 POST에 인증 종류별 invalid/normal/omitted slug와 existing/disconnected/capped fixture | 위 status와 **JSON body** 일치; invalid는 transaction/Project/token/version/event 0쓰기; 나머지는 기존 등록 원자성·멱등성 보존 |
| B-03 | 실제 `createBoardQueries(...).gate`의 성공 커밋, commit 전 작업 실패, 저장 뒤 commit 확인 실패/rollback 불명 seam과 `createOwnerGate`의 advice만 실패하는 double; 웹 action에 각 mutation 결과; 실제 registerOwnerTools의 metadata·handler 결과를 canonical §12·§13과 대조 | 성공은 이벤트·cursor 변경/commit 각 1회; web advice 0회·세 경로 revalidate·success; MCP 정상 body와 saved-approval 오류 body·description 전체 일치. gate 거부/tx 예외에서는 advice 0회. commit 확인 실패는 원래 예외 전파, web success/revalidate 0회, 저장 완료 reason·자동 mutation 재시도 없음 |
| B-04 | stale updatedAt/gateEntry, 잘못된 소유자, disconnected/미선택, Free session, validation/planCommit 불일치, 이벤트/커서 쓰기 실패 | 기존 거부와 rollback; 승인 원장 추가 없음. 기존 실제 PostgreSQL board CAS 시험 보존. 성공 후 동일 승인 재전송도 두 번째 쓰기 없음 |
| B-05 | fresh production Next에서 카드 A/B, read-only/검증 없음/보류; A의 server content·Client 렌더·transition action 각각 실패, commit 확인 실패·커밋 뒤 응답 유실 | 카드 A fallback·B 유지; wrapper/loader 오류는 상위 경계. 저장 성공/미기록/rollback을 단정하지 않음. retry가 최신 Inbox를 재조회하고 mutation 재전송하지 않음. 승인/반려 payload·클릭 날짜·provider 잠금·재개·route 갱신 보존 |
| B-06 | 실제 CopyButton과 통제 가능한 clipboard promise: A 성공→B prop, A pending→B, 연속 클릭, 거부, unmount; hs_/hu_/ho_ reveal과 turn-banner 명령 갱신 | B 복사 전 Copy; B 성공 후 Copied; 한 버튼 동시 write 최대 1회, 실패 후 재시도 가능, token plaintext 로그 없음·fallback 보존 |
| B-07 | core 전이 전체 matrix, History query의 scalar/array/empty/legacy/unknown 조합, constructor·복수 report fixture | 선언/runtime kind 동등, 모든 export 호환; 정확한 default·cursor 독립성과 링크/body 보존; 해제된 owner History GET 쓰기 0회 |

브라우저 인수는 설치되지 않은 새 테스트 프레임워크를 전제로 하지 않는다. 현재 Next를 격리 테스트
DB로 띄운 뒤 위 동작과 request payload/화면/DB 결과를 관찰하여 실행 기록을 남긴다.
소스의 승인 실패 재현과 구현 후 B-03 인수는 구분한다. 기존 통합 시험의 `connections/fixture/cleanup`
패턴을 사용하고 finally에서 자기 user/fixture만 지우고 모든 연결·barrier를 종료한다.
시스템/운영 DB reset·기존 사용자의 토큰 발급/폐기는 검증에 사용하지 않는다.

| 검색/검사 항목 | 변경 뒤 허용·금지 목적지 |
| --- | --- |
| `RuleKind`, `TransitionRule` | core declaration과 type import/실제 소비·시험에 허용; UI/server 로컬 union·복제 Rule 선언 금지 |
| `as Rule`, `as RuleKind`, 시험의 `"done"` kind | gate-source/board-rules의 반환 단언과 kind 목록의 done 금지; status done과 무관한 단언은 이 금지 범위 아님 |
| `nextFor` | run module과 MCP 운영 advice 바인딩에 허용; board-query의 import/호출 금지. 다른 agent pipeline_next 경로는 보존 |
| `gate_approve` description·advice 오류 reason | 실제 owner metadata와 canonical §13 owner 행 전체 일치, 오류 body와 §12 문장 일치; owner tools에 pipeline_next 신규 등록·가짜 next·자동 gate 재시도 금지. commit 결과 불명에는 저장 완료 고정 reason 금지 |
| `InboxCard` export/import와 `use client` | index.server/server page import 허용; client barrel export·client→server import 금지; inbox-card의 directive 금지, controller/provider/boundary는 허용 |
| `The decision wasn't recorded` | web fallback과 canonical §17의 현재 계약에서 금지; retired-copy의 금지 패턴·이 proposal의 과거 근거 인용은 허용 |
| `REASON_MAX` | propose-button의 선언·사용 제거; FIELD_BUDGET existing public API 사용 |
| `readHistoryQuery` | 같은 page model/public API/route 사용·시험에 존재; route의 복제 mode/legacy decoder 제거. route의 auth/cursor parser는 유지 |
| `REPORT_LABEL[actor]`, `actor in REPORT_LABEL` | doc-link의 상속 property 접근/판정 제거; 새 Map.get/has와 복수 actor 출력 존재 |
| copied boolean·clipboard write 호출 | 이전 boolean-only 성공 state 제거; clicked text 비교·단일 pending 쓰기·finally 해제 존재 |

위 음성 검사는 정규식 하나의 성공으로 완료하지 않는다. symbol 검색 결과마다 위 목적지를 분류하고
TypeScript AST로 import/export/call provenance를 대조한다. 모든 이동은 이전 의미·export의 부재와
새 소유자·호출부·실행 시험의 존재를 동시에 확인한다. 문서 grep만으로 code 이행을 인수하지 않는다.

### 완료 조건과 범위 경계

- 위 10건과 B-01~B-07을 모두 연결하여 구현·실행 결과를 기록한다. SRC-06/SRC-08/SRC-05의
  실패 경로를 실제 변경 뒤 표면에서 검증하고, kind/HTML/RSC/JSON의 body까지 확인한다.
  SRC-05는 commit 전 작업 실패·확인된 성공 뒤 advice 실패·commit 결과 불명을 별도 검증한다.
  commit 결과 불명을 rollback/저장 성공으로 단정하거나 advice 실패 응답으로 바꾸면 완료하지 않는다.
- 아래 저장소 필수 검사와 실제 DB가 필요한 B-02/B-04/History 보존의 통합 검사를 수행한다.
  skip된 DB/브라우저 인수를 passing으로 쓰지 않는다. fresh build가 실패하면 RSC 분리를 완료 처리하지 않는다.
- protocol owner 표·product-copy §12/§13/§17과 해당 구현/시험을 같은 변경에 갱신한다.
  실제 owner 도구 metadata 전체와 오류 body를 canonical 원본에 묶는다. 이 문서 수정만으로 현재
  accepted architecture나 canonical 제품 문구가 이미 바뀌었다고 간주하지 않는다.
- route 이동, 인증/플랜 권한 확대, actor 제한, 데이터 rename/migration, core 실행 정책 변경,
  플러그인 배포/private template 변경, 운영 flag 활성화/배포는 포함하지 않는다.
- 알려진 기존 malformed slug 데이터의 존재·규모는 조사하지 않았다. 이 입력 guard는 신규 요청을
  막으며 기존 데이터 보정을 약속하지 않는다. 필요하면 별도 근거·소유자 결정으로 범위를 추가한다.

### 문서 대조에서 확인한 실행 근거와 인계

이번 대조는 static symbol 검색과 TypeScript AST import/export/call 탐색을 각각 수행했다.
transitions 직접 import 13개, CopyButton 직접 소비자 3개, gate 호출 8개(운영 3개·기존 시험/리허설 5개)를
확인했다. gate의 facade/웹/MCP/시험/리허설과 declaration의 다른 소비자를 빠뜨리지 않고 범위에 연결했다.
현재 유지보수 src fingerprint와 HEAD는 앞의 최초 리뷰 기준과 동일하다.

파일을 emit하지 않는 TypeScript transpile+VM 및 순수 core import로 다음을 재현했다.

- 현재 `createBoardQueries`의 슬롯 before-accept 승인에 주입한 transaction double은
  이벤트 1회·cursor 변경 1회·commit 완료 뒤 `nextFor` 오류로 호출을 reject했다.
  DB 장애 빈도나 실제 PostgreSQL 성질을 입증한 시험은 아니다.
- 실제 `reportDocLabel("constructor")`는 function을 반환했고 실제 actor 정렬 결과에서는 누락됐다.
- 실제 owner-tools handler는 위 고정 reason을 기존 `isError:true`/text JSON `{error}`로
  직렬화할 수 있었다. 미래 adapter 구현이 완료됐다는 뜻은 아니다.
- 실제 core export는 위 8개, 전이는 15개, kind는 위 7종이었다.
- 설치된 Prisma client의 실제 `_transactionWithCallback` method를 AST로 추출하여
  in-memory engine double로 실행했다. commit 전 작업 실패는 commit 0회·rollback 확인 1회였다.
  저장 완료 뒤 commit 확인만 실패하고 rollback도 실패하는 double에서는 commit 1회·rollback 시도
  1회 뒤 원래 예외를 전파했고 저장된 상태가 남았다. 실제 PostgreSQL/network 장애 시험이 아니며,
  transaction reject만으로 저장 결과를 단정할 수 없다는 제어 흐름 근거다.

설치된 Next 16.3.3의 Server/Client guide, page/dynamic-routes, catchError, error-handling,
revalidatePath 문서와 실제 serializer를 기준으로 입력 promise/array, Server Action reference,
Client import graph·children/provider, 자식 오류 범위·transition throw, retry 재조회, 캐시 갱신을 대조했다.
catchError를 Server module에서 호출하거나 일반 callback을 직렬화하는 지침은 없다.

인계 시 replay anchor는 **적용 기준 비교용**이며 완전성·정확성·무결함 증명이 아니다.
bounded discovery는 위 slice/서비스/route/시험/설정/참조 문서와 관련 symbol 소비자에 한정한다.
문서/파일 내용·후보 path 집합·HEAD·설치 문서가 바뀌면 이전 결과를 그대로 재사용하지 않고 전체 대조를 한다.
최종 무편집 pass의 source identity는 최종 응답에, 후보 path/content digest와 ignored 설치 근거의
개별 digest는 아래 receipt에 남긴다. 이 문서는 durable 구현 계약이며 별도 sidecar는 만들지 않는다.
정적 읽기·AST·해시는 safe-replay, npm check/test/build와 계획된 생성 산출물은 manifest-only다.
DB/브라우저·운영 상태는 이번 대조에서 실측하지 않았으며 후속 구현의 인수 대상으로 남는다.

## 후속 구현 순서와 검증 계획

아래 순서는 같은 원인을 한 번에 해결하고 확인할 수 있도록 묶은 권고다.
구현은 `dev`에서 만든 `harness/<topic>` 브랜치에서 진행하고 PR의 base는 `dev`로 한다.

| 순서 | 대상 | 구현 범위 | 핵심 검증 |
| --- | --- | --- | --- |
| 1 | SRC-06, SRC-08 | 잘못된 저장소 선택·명시적 slug 등록 차단 | 실제 폼 상태 전이/제출 값, REST 입력 거부와 zero-write, 정상·멱등 등록 |
| 2 | SRC-05, SRC-07 | 승인 mutation·조언 분리, protocol owner 표·canonical §12/§13/§17·실제 도구/화면 문구 동시 정정 | commit 전 실패·commit 결과 불명·확인된 성공 뒤 조회 실패 구분, 웹 갱신, MCP 정상/조언 실패 body와 metadata/canonical 일치, retry 최신 상태 |
| 3 | SRC-09 | 보고 라벨·actor 순서의 자료구조 처리 | 정상 constructor actor의 라벨과 복수 Documents 링크·History 표시 |
| 4 | SRC-01, SRC-03, SRC-02 | 공유 타입·History URL·Evidence 한도의 계약 정리 | core 타입 정합성, URL 왕복과 legacy/default, 정책 값 재사용 |
| 5 | SRC-04, SRC-10 | Client 경계 축소·복사 상태 의미 수정 | RSC 경계와 카드 상호작용, text 변경·비동기 복사 완료 |

각 변경은 관련 기존 시험과 위 실패 경로를 검증한다. 코드 변경 종료에는 저장소 AGENTS의
필수 `npm run verify:fsd`, `npm run test:architecture`와 관련 lint·type·test·build를 수행한다.
실제 스크립트 기준 권고 명령은 다음과 같다.

```powershell
npm run verify:fsd
npm run test:architecture
npm run check
npm run test:web
npm run test:server
npm test
npm run build
```

`npm run check`에는 lint, Next type generation, `tsc --noEmit`, 아키텍처·availability 검사가
포함된다. 별도의 `npm run typecheck` 스크립트는 현재 없다. 실제 transaction·등록 서비스
경계를 바꾸는 묶음에는 안전 조건을 만족한 격리 PostgreSQL에서
`npm run test:server:integration`을 추가한다. 폼·승인·복사 동작은 실제 브라우저에서
해당 실패 경로를 확인하며, 정적 렌더 시험을 상호작용 인수로 간주하지 않는다.

## 원시 발견에서 최종 항목으로의 판정 기록

아래 ID는 이 리뷰 안에서 고정된다. TypeScript의 내부 HARD/DEFAULT/OPTIONAL 우선순위나
여러 관점의 동의 수를 Must/Should/Consider로 자동 변환하지 않았다.

| Raw ID | 관점 | 제안 중요도 | 게이트 판정 | 최종 ID | 최종 중요도 | 판정 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| COH-01 | Cohesion | Should | accept | SRC-01 | Should | core 계약의 독립 선언·단언과 서버를 검증하지 않는 시험 |
| COH-02 | Cohesion | Consider | accept | SRC-02 | Consider | 현재 일치하는 정책 숫자의 중복 소유, 국소 수정 |
| COH-03 | Cohesion | Should | accept | SRC-03 | Should | 다섯 query 키·기본값의 생성과 해석을 별도 관리 |
| CPL-01 | Coupling | Should | accept | SRC-04 | Should | callback 때문에 정적 표시까지 Client module graph에 포함 |
| CPL-02 | Coupling | Must | accept | SRC-05 | Must | 커밋 후 불필요한 조언 조회가 웹 성공·갱신을 차단 |
| PRD-01 | Predictability | Must | accept | SRC-06 | Must | 현재 입력과 다른 저장소의 등록 가능 |
| PRD-02 | Predictability | Should | accept | SRC-07 | Should | 렌더·커밋 후 실패를 받는 경계의 미기록 단정 |
| READ-01 | Readability | Must | merge-accept(SRC-06) | SRC-06 | Must | 같은 상태 전이·제출 경로, 입력 출처를 명시하는 호환 수정 |
| TS-01 | TypeScript generalist | Must | accept | SRC-08 | Must | REST의 명시적 slug가 형식·예약어 정책 우회 |
| TS-02 | TypeScript generalist | Should | merge-accept(SRC-06) | SRC-06 | Must | 같은 잘못된 대상 mutation 경로를 근거로 최종 Must |
| TS-03 | TypeScript generalist | Should | accept | SRC-09 | Should | 허용된 actor의 저장된 보고서가 목록에서 누락 |
| TS-04 | TypeScript generalist | Should | merge-accept(SRC-07) | SRC-07 | Should | 같은 오류 의미·copy 계약·호환 수정 |
| TS-05 | TypeScript generalist | Consider | accept | SRC-10 | Consider | 새 text에서도 이전 boolean 성공 표시 유지 |

기각, 원래 관점에 돌려보낸 수정 요청, 추가 검증 대기, 사람이 판단할 미결 항목은 모두 0개다.

## Coverage와 검증 한계

**Coverage: Full applicable-lens review — 5 applicable, 0 gate-validated N/A.**

| 관점 | 지정 스킬 | 상태 | 채택된 기여 |
| --- | --- | --- | --- |
| Cohesion | frontend-cohesion | Completed | SRC-01, SRC-02, SRC-03 |
| Coupling | frontend-coupling | Completed | SRC-04, SRC-05 |
| Predictability | frontend-predictability | Completed | SRC-06, SRC-07 |
| Readability | frontend-readability | Completed | SRC-06 |
| TypeScript generalist | typescript-clean-code | Completed | SRC-06, SRC-07, SRC-08, SRC-09, SRC-10 |

다섯 관점은 서로의 산출물을 공유하지 않는 격리된 초기 컨텍스트에서 지정 스킬 전문과
동일한 전체 소스 범위를 읽었다고 보고했다. 가독성의 최초 실행은 모델 용량 오류로 실패하여
불완전 결과를 폐기했다. 종료 상태를 확인한 뒤 동일 입력으로 격리된 기술 재시도를 한 번
실행했고, 완료한 재시도 결과만 사용했다. 이는 미검토 관점을 생략한 Partial review가 아니다.

중립 게이트는 다섯 관점의 원시 결과를 받은 별도 격리 컨텍스트에서 13개 주장에 필요한
코드·호출부·테스트·계약을 독립 대조했다. 게이트가 전체 소스를 또 읽거나 새로운 발견을
생성했다고 주장하지 않는다.

- **No accepted findings:** 해당 관점 없음. 다섯 관점 모두 채택된 기여가 있다.
- **Not applicable:** 없음.
- **Unavailable or skipped:** 없음.
- **Needs human judgment:** 없음.
- **Review-mode substantiation:** pending-verification 요청이 없어 추가 실행 검증은 불필요했다.
  근거 검증은 소스·설정·설치 문서의 읽기 대조와 소스 동일성 확인으로 수행했다.
- **구현 후 회귀 검증:** 미실행. 이번 작업은 문서 작성이며 코드 개선의 테스트·빌드·실제 브라우저
  인수를 완료했다고 주장하지 않는다. 위 항목별 시험과 명령은 후속 구현 시 수행할 계획이다.


## Reconciliation 기준 receipt — 2026-10-01

이 기록은 후속 구현 인계를 위한 bounded 기준이며 실행 완료 보고서가 아니다.
제안서 자체의 최종 SHA-256은 자기 참조를 피하기 위해 최종 응답에 별도로 기록한다.
repository identity는 git directory의 절대 경로를 소문자로 정규화한 문자열의 SHA-256이며
원격 URL·credential을 기록하지 않는다. 현재 기준은 다음과 같다.

```text
repository: 5626cbbb8f7629377d6a5d46c46023cba9822b89fda03f6dbbec3ffd861587dd
HEAD: 02f86cbe1502508c1701c544bb229803e2c3ba69
profile: High-Risk; phase: proposal reconciliation / implementation awaiting approval
candidate-files: 317 (proposal itself excluded)
candidate-path-set-sha256: f2a41e01015116b5eafa21b961bc696e3c2facc82c746ba65ab15a41eac72567
candidate-path-and-content-sha256: 9bd0cbf72cb073298ed5632b1f682d10daee51884e4053d01d8a664556cf15e7
maintained-src-sha256: b602c9c214aabac0519708ae98191f00fa04df40ae38eadd06dc617ac8afa47f
node: v22.13.1; Next: 16.3.3; React: 19.2.8; TypeScript: 5.9.3
```

**safe-replay의 정확한 후보 수집 manifest:**

1. 아래 scope roots를 재귀 열거한다. 파일 확장자는 `.ts/.tsx/.mjs/.mts`이며
   이름이 `generated`인 디렉터리는 제외한다. POSIX 상대 경로로 정규화한다.
2. discovery roots `src`, `packages/core`, `tests/server`, `scripts`, `plugin/bin`의
   같은 확장자 파일을 TypeScript `createSourceFile(..., ScriptTarget.Latest, true)`로 파싱한다.
   top-level ImportDeclaration/ExportDeclaration의 string moduleSpecifier가
   `/(transitions\.mjs|review-gate|history-navigation|doc-link|copy-button)/`에 맞거나,
   AST 전체의 CallExpression callee가 PropertyAccessExpression이고 property name이 정확히
   `gate`이면 해당 파일을 후보에 추가한다. 선언 이름만으로 추정하지 않는다.
3. 아래 extra files, 직접 source identities 8개와 ignored identities의 Next guide 7개,
   `sorted-routes.js`, Next/React/react-dom/TypeScript/Prisma/Zod의 `package.json` 6개를 추가한다.
   Prisma transaction 근거인 `node_modules/@prisma/client/runtime/client.js`,
   `node_modules/@prisma/client/package.json`, `node_modules/@prisma/adapter-pg/dist/index.js`,
   `node_modules/@prisma/adapter-pg/package.json`도 추가한다.
   설치 runtime 도구 의존성은 `require("typescript")`와 `require("zod")` 후 `require.cache`에서
   POSIX 절대 경로에 `/node_modules/`가 있는 로드 파일을 repository 상대 경로로 바꿔 추가한다.
   로드된 파일의 증감도 후보 집합에 반영한다. 이 로드는 로컬 parser/schema library만 사용하며
   DB·Next 서버·외부 transport를 시작하지 않는다.
4. 중복 제거·경로 순 정렬 뒤 proposal 자체를 제외한다. path-set digest는 정렬된 경로들의
   `UTF-8 path + NUL` 연결, content digest는 각각 `UTF-8 path + NUL + 원본 bytes + NUL` 연결의 SHA-256이다.
   기존 path의 소실은 실패이며 신규 source/consumer 파일은 새로운 후보·digest로 드러나야 한다.
   HEAD가 같아도 dirty/untracked/ignored 내용이 바뀌면 content digest가 달라진다.
5. 문서의 미래 생성 파일은 현재 부재/부모 존재를 확인한 목적지다. 생성 후에는 해당 root에 포함한다.
   문서 자체는 마지막 응답의 SHA-256을 비교한다. 아래 직접 source와 전체 후보 내용도 모두 비교한다.
   동일 digest는 과거 기준의 적용 가능성만 뜻하며 새 clean pass나 무결함 증명이 아니다.

Scope roots:

`src/fsd/features/create-project`, `src/fsd/features/review-gate`, `src/fsd/features/propose-item`
`src/fsd/features/manage-token`, `src/fsd/entities/board-item`, `src/fsd/entities/project-token`
`src/fsd/pages/board-item`, `src/fsd/pages/project-history`, `src/fsd/pages/project-inbox`
`src/fsd/widgets/history-feed`, `src/fsd/widgets/turn-banner`, `src/server/pipeline`
`src/server/mcp`, `packages/core`, `tests/server`

Extra files:

`AGENTS.md`, `package.json`, `package-lock.json`
`tsconfig.json`, `next.config.ts`, `eslint.config.mjs`
`prisma/schema.prisma`, `scripts/verify-fsd-boundaries.mjs`, `scripts/verify-fsd-boundaries.test.mjs`
`scripts/plugin-lib.mjs`, `scripts/plugin-lib.test.mjs`, `scripts/retired-copy.test.mjs`
`scripts/test-server-integration.mjs`, `scripts/test-server-integration.test.mjs`, `scripts/rehearse-pipeline-agent-slots.ts`
`tests/server/register-server-only.mjs`, `plugin/lib/transitions.mjs`, `src/server/result.ts`, `src/server/db.ts`
`src/server/project-registration.ts`, `src/server/project-registration-query.ts`, `src/server/project-registration-query.test.ts`
`src/server/project-slug-rule.ts`, `src/server/project-slug-rule.test.ts`, `src/server/project-slug-rule-sync.test.ts`
`src/server/project-access-query.ts`, `src/server/project-availability-service.ts`, `src/server/project-availability-service.test.ts`
`src/server/rest-scope.ts`, `src/server/user-scope-query.ts`, `src/server/auth/guard.ts`
`src/fsd/shared/ui/copy-button.tsx`, `src/fsd/shared/ui/button.tsx`, `src/fsd/shared/ui/code.tsx`
`src/fsd/shared/lib/copy-lock.ts`, `src/fsd/shared/routes/project.ts`, `src/app/(app)/p/new/page.tsx`
`src/app/(app)/p/[slug]/history/page.tsx`, `src/app/(app)/p/[slug]/inbox/page.tsx`, `src/app/(app)/p/[slug]/error.tsx`
`src/app/api/projects/route.ts`

직접 source의 content identities(역사적 완료 proposal은 제외):

```text
docs/architecture/README.md	e36c96f69af316a7441a0713a1476931e6a7ca258fcdbf81520b2751910b64d9
docs/architecture/fsd.md	b29fcacba7821efb85aeae9ac08a4cbdc2c08ee8b70105a1acc98b30fd5c9a91
docs/architecture/system-overview.md	be68d8bf4aeb2f904b31d566c9f30a9093af6525c648044b605583075f96e4f0
docs/architecture/verification.md	d69f7060b18ac8420c8acbdced3ab332fad00670172030d311c70080039ae067
docs/architecture/invariants.md	701e2190df0faa8cad6dcfac1247b19f787e0c27cdc78173a02a2df2030af4ef
docs/architecture/protocol.md	be5f5ce1205f7684b940bd64f715fcad462b8cc19a9de2346e38cce175eed846
docs/architecture/repository-disconnection.md	a7572da6c253ab998c51c3891ac85e30ac13cd5c039e9d649f3e19e05d5a5c56
docs/conventions/product-copy.md	cac63a1e05ca0c8b2ccbd2cb3bce5d7c4ac3b76539448872b3b0a1d1982555f7
```

ignored 설치 근거의 repository-relative path와 개별 content identity:

```text
node_modules/@prisma/client/runtime/client.js	c444040cf5d0a8bb0edde2d482e2865360671d1609349ce626506ae198bcee29
node_modules/@prisma/client/package.json	974ee2fedaddb6f7707ba2dc0c4d95219be80d6e952034ba9d5d10c68eddc9a7
node_modules/@prisma/adapter-pg/dist/index.js	d57ac2ea38047c648b0f3b4b8012031b5adaa9f919dbb21419a4153f7e02d3c4
node_modules/@prisma/adapter-pg/package.json	8256e8a778b798a5552a3b795409ec23a1c629ee94c308ad2d5909a29fe03e5b
node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md	c3f53d13af341d19a601a846082f34abcea2b599c805ab9cd2f32173295e5914
node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md	c8b6a034f078db4c35907e04bae47a7878b247671f58ccad252b88b3f50c3c37
node_modules/next/dist/docs/01-app/02-guides/server-actions.md	8063a28cde0495a61c5ac195b0b769d86a10740a673facdc5f3e2f80f0e59b77
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md	387f5dfd9a0400c38ed4ee143df7917abf1ef2a3c258c9eca2aa41bf02249130
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md	63cbb7aa79f3c375ce838bf35ac317f6a26749cf9ddf547eb841f04b986e607b
node_modules/next/dist/docs/01-app/03-api-reference/04-functions/catchError.md	14fc6c1c8496a8114461f708e82f6235e6222140c8a25ded806a7b95a63dd00e
node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md	82b4f0888f1d1113c2e0e1a867983a88ce02bbf9419570e3710fe7fe4ccd2c02
node_modules/next/dist/shared/lib/router/utils/sorted-routes.js	b73719b9dc8aceaab503df9d26b7c1d8819fda8a31091ef77d7fb2d337c42752
node_modules/next/package.json	3ae720e4b8cdad7503935b27b0d14e04390068bf10d6e685797ccf1044051967
node_modules/prisma/package.json	e0d96b7612a7592e62b1e2ba5b40e686e96af588bf9dafe74799b99d0b31abed
node_modules/react-dom/package.json	7c82f0967114d4b5d38b1f07e543af87c9919e8d3243f9604004819319cb2200
node_modules/react/package.json	e40c3ed9b633c9ecf188e09a4be309780a1ea0a9c068278a30ff6a27e7b2dbb6
node_modules/typescript/lib/typescript.js	3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675
node_modules/typescript/package.json	822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6
node_modules/zod/index.cjs	9215109ec960156cd1417c8fb61b9d34d7fc534b03a6eba183b3aa4a133d8e85
node_modules/zod/package.json	bf8409c9c2b90652cad4a02a2478ac618cc731318fc378ca4c3536ec502d8482
node_modules/zod/v4/classic/checks.cjs	1dec361b17a7552a58b536f741641083b070c938eaf8a78d7154059fdb4cc68a
node_modules/zod/v4/classic/coerce.cjs	d25b07eead67ff339c3e2a6d5b7364647e11f57fff3e82055d49575304dce057
node_modules/zod/v4/classic/compat.cjs	dcd3c3b05fbc82ed0241ec7e015071a528a1e2e8025e96259be932e7340608e7
node_modules/zod/v4/classic/deep-partial.cjs	f45d35a8184ba7af4e104c658fddadc837ff30453c27e862bc0aee8bf47cd587
node_modules/zod/v4/classic/errors.cjs	588aceb7021cbb86b2f2fc58625f79abe75f4cf057f6206d275f72d9b2b476f7
node_modules/zod/v4/classic/external.cjs	5c8ea54a5d5f57f2ddbf82b89e4a6917d7f2e1050fcaf2acc98986b45014d0cc
node_modules/zod/v4/classic/from-json-schema.cjs	044c45a9d1df155da2feb264fa56ef37e9188b28be33f2ad130edde94d07c66f
node_modules/zod/v4/classic/in-out.cjs	d84887919b2a939a7abae814e5f30244b02ca85b4446ab00b39b71c32f77ebb6
node_modules/zod/v4/classic/iso.cjs	0cd758ee569c1baf3d1d4158e1a7a50f3292bb727b231d282fe983b2aaee25a7
node_modules/zod/v4/classic/parse.cjs	ceb52e7993662d7e7054f3bcebc006140b57191acbbeb306b138ff0dd24979f2
node_modules/zod/v4/classic/schemas.cjs	a6faf3299a83c19be7be4139fc1862b7a07bf95bf7346921adb67e9986b4c7a1
node_modules/zod/v4/core/api.cjs	07e5c72e1c3c78ea8d568595fadfb35a2f86b215fd13587f9bb0a3469ec5b2b9
node_modules/zod/v4/core/checks.cjs	88ffa9c3ba85ed5db247377d4bba0a81bad4d826f1663c0e2cc81f259efd2c1b
node_modules/zod/v4/core/compile.cjs	6e7601cffb40e1abf2d20eebbdd3afc07d3bd1ffe1f5066adced9621e0ebace6
node_modules/zod/v4/core/core.cjs	ed74c8fe9a2c1daa46f22f2e38417f0261dbf9646f370ad66f53ff8e285f9c94
node_modules/zod/v4/core/doc.cjs	4f2edba853f1c01595e985ae6539905a9a381da646cce40a663a2d8846e1bb5e
node_modules/zod/v4/core/errors.cjs	7edbc714c70df7aaa2cbfe6c60c5aabe5a7afa00808db7a03ee764f4374b733a
node_modules/zod/v4/core/index.cjs	b8ba97e931ac526e35e354bb117529cea97d17a3bdce975fd3692abfe4e66120
node_modules/zod/v4/core/json-schema-generator.cjs	ca3783ef2375a1ac4be25f4b5c9ab63d89ed07aaf546bfab906dea38fda8c3c5
node_modules/zod/v4/core/json-schema-processors.cjs	5e8231b49bb4f27143ccd342a2c73ccddf8583446192ea4f7ce94b5bd3687118
node_modules/zod/v4/core/json-schema.cjs	d43aa81f5bc89faa359e0f97c814ba25155591ff078fbb9bfd40f8c7c9683230
node_modules/zod/v4/core/memoizer.cjs	bb131279b26f3e4b06cadddcdf0c4c4b0d3e63f088cea4e461dcd0b3b2901a9a
node_modules/zod/v4/core/parse.cjs	f511d86ebeb784d71d72d6c2096b514dc8fbcbabba8a6df2d3ac8db923aad46f
node_modules/zod/v4/core/regexes.cjs	3ca6a329e02e1a88cf98842e9f2ca82044d2b596cbef4b80eb2e95569a1d356c
node_modules/zod/v4/core/registries.cjs	674a7d7f25a3db1589776b868bbb07116974198ad159ca28e66fb20616946bbd
node_modules/zod/v4/core/schemas.cjs	1018fc2c15be2df7cc2e49834cc32e3b1f590a73f6c9c1593ac2180ec0718f53
node_modules/zod/v4/core/to-json-schema.cjs	a266fa89a65e00017c7e787fc825ee42b904387cb00f0901be5c4a7f42fa01a3
node_modules/zod/v4/core/util.cjs	13c69e544f0c7135dcba1e657fb975ad46208fc20f83ff350a3595f399a5080c
node_modules/zod/v4/core/versions.cjs	d6616c63c51d54ff49b29cfc5270a35a6374434eda6cea6e59f250e766b6b76e
node_modules/zod/v4/core/visit.cjs	fb391d21af3c5a7b5f8bd2f8bb67ead16962a9b644645a7054684667244ceb38
node_modules/zod/v4/locales/ar.cjs	f38035cf9cb72a74c7e3cfe376456978f77a01fe2c99f1b893dee84983a06f97
node_modules/zod/v4/locales/az.cjs	82127fe245a6b29ddf9f97ba99367e438e3fab1da99b09e2c05a055bf43ea65d
node_modules/zod/v4/locales/be.cjs	e84d3934cf3f63d4a2b675a750b20f361123c96a39021cf7ce431fe6212f8235
node_modules/zod/v4/locales/bg.cjs	f5ccd1b20b6182b4b943b15ddde7931e312dfb2f5399891feac065e0cfcf1f90
node_modules/zod/v4/locales/bn.cjs	a6593b684579c8c3de2cb738ec0fc9165b33ad6838637011628dcb93e655151a
node_modules/zod/v4/locales/ca.cjs	83088ebfdfa3635d542e12393f324bb30cdd394e61caf525621a696a507c0e92
node_modules/zod/v4/locales/ckb.cjs	87c2280047b9aa44ecde223431a4a7719d01ae6e48208ab911bc9a195be05fba
node_modules/zod/v4/locales/cs.cjs	445c642eea42be8c11102f4c008399d79fe38112b7baa47599dad2c86e18a3c6
node_modules/zod/v4/locales/da.cjs	c61251235096e97d3237557535e37860463213ff634f0dcb5afba0b1d3be84be
node_modules/zod/v4/locales/de.cjs	fd69270e869475f524e5df39fc6d7c05b33744b93934d6a9cc30c064c8d40d32
node_modules/zod/v4/locales/el.cjs	4b404762fcc20f3df424674e931d743863f1e6ad456e264dad9b77e32acbb375
node_modules/zod/v4/locales/en.cjs	0b1c7734e845b405400702e7137e001a54bbaacbeee5ec0bc1cf049ab17a9f94
node_modules/zod/v4/locales/eo.cjs	2cbbfb51395cbf56b5d2a5f2167cc27801797e0dd6985a214969041c96365efe
node_modules/zod/v4/locales/es.cjs	0c275b2dd8519f9fd22bb17e9d5a56ee40de6e807b4ec1eaca1d859830912243
node_modules/zod/v4/locales/fa.cjs	226c736bf9a0bad99154639622b76dbc6bc2ad2e0be51d904e467f340a0a8d2b
node_modules/zod/v4/locales/fi.cjs	a8b768a212e933cab93e3789d6b264f95eab197e98135a4a742dfd476ecd22fd
node_modules/zod/v4/locales/fr-CA.cjs	19804fd804658312deb10c8d97c1245edd45c56132f6578521f79095c78128ad
node_modules/zod/v4/locales/fr.cjs	787afe4e41bec900dd825bb0cf4ad9ae6df13acd681ace32966d27044d54ee50
node_modules/zod/v4/locales/gu.cjs	c5325a2138f427679ce0ef17510ffc235c47c0a4c6eb33e1d4e71cb42e9ff784
node_modules/zod/v4/locales/he.cjs	3e9843200e3a8f2c912b5fb582b263014270316b4b5a21a52e62d02e739e4354
node_modules/zod/v4/locales/hi.cjs	4ad28962eeaf9d9308ab3dfee7d1aa5fa3498a0c6303b44bcbc159e8d189485b
node_modules/zod/v4/locales/hr.cjs	99dece0fe4cb93d67293880aea364091efc5bf3b416e5f158b58b97cc67ac282
node_modules/zod/v4/locales/hu.cjs	4c58eb7ddb74f48b462b564f122fd12fa201b67217ffe0bd9c43515ad5d122ea
node_modules/zod/v4/locales/hy.cjs	bb80057d006e492b5d44172389998b5572d482ef65aaed1706b2f0c14aa18d9e
node_modules/zod/v4/locales/id.cjs	8c4fdaa2091404f2ccabf98afffde37bf0082cafcc162b3926f548ff36ea9c2c
node_modules/zod/v4/locales/index.cjs	61786c7e714e2d24348e43015dc7857fd6cf1fc530aea614f35d9b520a70c54c
node_modules/zod/v4/locales/is.cjs	71d9028a8b4a83461eec77d1d540438367c0e0af5b4cd2d1b6a6d28dc95fff24
node_modules/zod/v4/locales/it.cjs	03e5e15bbb37b27d8ac0473bd78a0c88633134d3bff01a2dab50671e4ad2e8c4
node_modules/zod/v4/locales/ja.cjs	ef4710b12f81e27d5c15215709b98fd73ad5595d72a70b2ae805ccb3b18975cb
node_modules/zod/v4/locales/ka.cjs	27ae372ab22831006bd87809aea2485712a5ed8245a5fa9e96c9501aa7f2faf6
node_modules/zod/v4/locales/kh.cjs	5a5f3a63e4e97a25b44692b0910f73cf15e54fc5b03c61f9d87e2a9eb6e2a098
node_modules/zod/v4/locales/km.cjs	90f8d1a0e6a9ddc9ca0065b51a830f3b16875ae8bca4b04abfd785fb28089d74
node_modules/zod/v4/locales/kn.cjs	57181a65b94648d45106504e87ea530d645a57c4e73375ae97c7ee24b41d322a
node_modules/zod/v4/locales/ko.cjs	5271e0dff142f0340c2fe57598c54cbe06fdc3f7a5eb09331b2996aabf553023
node_modules/zod/v4/locales/lt.cjs	635f992e4d585939542a52f5e0dae66f0b2b34ffbbd14137f599da6bda9173c1
node_modules/zod/v4/locales/mk.cjs	aaae6087291493ec11aca7ca0bda035a03d8d2374698d2027bdd9c29da3d28be
node_modules/zod/v4/locales/ms.cjs	d23ef2fca5779e18bd4b9d040e14462f6e0cd14799a04b52ebbbf1fc55323c00
node_modules/zod/v4/locales/ne.cjs	58548d3bedcac584ecb8247cd30bee50d1f529f86f5183f5040de5ec6a6ebbcf
node_modules/zod/v4/locales/nl.cjs	a38049af2c055c8ec873ecf99ff4f65dc22c6e6a3ec8cabdba1cda89b0609e63
node_modules/zod/v4/locales/nn.cjs	237b1de0f5a7ca3e0e5732cee2caecf59a42c20db68893a3dd234e533c0a486c
node_modules/zod/v4/locales/no.cjs	4b11cdaf522a33f7450ee438d1daba0e87e6c012d0dff4112cc90bd5bb63c233
node_modules/zod/v4/locales/ota.cjs	7106c310b2fe16857a0ea13fe26ba36db3e2862e3891385342e0d8587ac6bc73
node_modules/zod/v4/locales/pl.cjs	8efcb5bcbcc48f45cca96be987766ea41de69cf9e446fd0ddffeb69da236b5f0
node_modules/zod/v4/locales/ps.cjs	ba1f48c4292b7586b7b0d5b61ff8f5e330bcd489066c98a6cf64376714f03bb9
node_modules/zod/v4/locales/pt-BR.cjs	5983ed8fc5fe21361e2e484a793b66713aa479fec304ea20e3f9a7a8baae3956
node_modules/zod/v4/locales/pt.cjs	47a05faa1d0db4637b855194f931b1753a73b3dd429d8a4fe5941d18a5f96af2
node_modules/zod/v4/locales/ro.cjs	ebdd57d2f9b4298ee144c7c0d01c917c70213f5a5ab10436b2469cfe5d6196af
node_modules/zod/v4/locales/ru.cjs	a4114d59759b25b6c63516d44bedda1fa7a21d024e2da7ac1862fdc30f8525e1
node_modules/zod/v4/locales/sk.cjs	b1e9512d423612b31775525737bd0c8584553a61fcd07296b516e64a63322722
node_modules/zod/v4/locales/sl.cjs	dabe543ca80d571503710553504627883d9b00131a56cddb33d8328c022dff96
node_modules/zod/v4/locales/sv.cjs	09b5976c0aaced6dd9996b73cb15847ba05a8649cd8870afd8f4368d08e7b101
node_modules/zod/v4/locales/ta.cjs	9652816e45cd62ee501bc6bd5459c6f0b00a57576c09a9b5a96c6d899fae9158
node_modules/zod/v4/locales/th.cjs	ecf264702bd82a5c79b1fbb67006e98542a472361166f22b89118e6c7ff31037
node_modules/zod/v4/locales/tk.cjs	9b75824cc71979e890192987e315d863fb1388c008a7b418ab38ca3a6869cc0d
node_modules/zod/v4/locales/tr.cjs	a5fa4182288eb9b9f4cc48c47070697c7cae97e85f1743871dd0d098cce5d263
node_modules/zod/v4/locales/ua.cjs	0565126e33d30fd26046fd5399fe6293e8827fa846c3a7ff414e4e63acbfbf0a
node_modules/zod/v4/locales/uk.cjs	231de1278ed64dbf25d45ce1649ec514575158d7481dc8467fd66227b74be2c6
node_modules/zod/v4/locales/ur.cjs	6e492253e5a992c74370a41da8def925797a9d5685731b3a9a69fd282f53720f
node_modules/zod/v4/locales/uz.cjs	85713563a843d94d6ba839f55284441e156676d5bb901a0d264f810ea1cafc1d
node_modules/zod/v4/locales/vi.cjs	61069f57b1da818b9a1df03ab030e902359e3d5d032fbc6a4ef6863bfaae13f4
node_modules/zod/v4/locales/yo.cjs	f63d0429f92f8cb1ba1b98294018c1f8fa234d851907c02707e338215278da12
node_modules/zod/v4/locales/zh-CN.cjs	9622d60e7089d5da18ff6ddefe78a835323e0de10bad335551cdc6528afdd707
node_modules/zod/v4/locales/zh-TW.cjs	0f59a25c5a0ef12a2c7fc7dc638ceebb0b8a8c0a8191885ac6030bdf0fb40ab9
```

**Durable Receipt의 위험 경계·검증 기록:**

| 위험 경계 | 폐쇄 근거·반증 경로 | 구현 뒤 필수 검증 |
| --- | --- | --- |
| 잘못된 등록 대상·slug·availability | form→action 및 REST→transaction→route body 추적; URL/direct 상태와 입력 정규화 표; static route와 단일 segment 계약 | B-01/B-02, 기존 registration/availability/connection 시험 |
| 승인 commit·권한·CAS·후속 조언 | symbol 검색과 별도의 AST gate 호출 폐쇄; 실제 gate VM probe의 commit 뒤 reject; 설치된 Prisma method의 commit 확인/rollback 실패 VM; owner-tools의 실제 serializer로 기존 error envelope 확인; canonical 원본 우선순위와 owner metadata 추적 | B-03/B-04, commit 결과 불명의 원래 예외·advice 0회·저장 완료 reason 금지, 실제 PostgreSQL CAS·원장 rollback, metadata 전체/§13 및 error body/§12 대조 |
| RSC 출력·오류·cache | 설치 guide의 Client graph/children/provider, catchError 자식·retry, action/revalidate 계약과 현재 route/barrel/leaf 대조 | B-05, fresh build의 HTML/RSC·Client/Action manifest |
| core type·배포 복사본 | import 13개 AST 폐쇄; 실제 exports 8·RULES 15·kind 7 순회; plugin-lib의 .mjs 선택 규칙 | 전체 typecheck/runtime kind 및 plugin-lib --check |
| History/read-only GET·링크 | encoder와 route decoder의 5키/default/cursor 추적; owner/cutoff/연결 해제 GET 보존 계약 | B-07, 실제 HTML/JSON body·DB zero-write |
| report actor·복사 비동기/평문 | 실제 constructor VM 출력; Map/acceptance/복수 report 계약; CopyButton 모든 직접·간접 소비와 pending 전이 | doc-link/item-docs/history-row, B-06 |

Coverage Stability는 가장 영향이 큰 승인 경계를 **source flow/AST와 실행 VM·wire serializer**라는
서로 다른 경로로 확인한다. 나머지 위험 경계도 위 구체적 입력·소유자·산출물·시험으로 대조한다.
범위 밖인 운영 DB·외부 GitHub·private template·기존 malformed 데이터 보정은 기존 source가
수정하지 않도록 명시한 경계이며 이번 readiness 판단의 실측 근거로 사용하지 않는다.
미래 browser/DB/build 결과는 manifest-only 검증 계획이다. 현재 운영 상태는 volatile이며
조회·배포·재실행하지 않았으므로 그 상태에 대한 통과나 freshness를 주장하지 않는다.

현재 dirty/untracked 파일은 이 proposal뿐이다. generated Prisma나 기존 .next cache를 검증 근거로
사용하지 않았다. ignored 설치 근거는 위 개별 digest로 식별했다. 모든 receipt는 이 MD와 최종
응답에 저장하며 새 파일/sidecar는 없다. raw remote/환경 변수/토큰 평문은 기록하지 않았다.
비차단 한계는 구현 후 DB·browser·fresh build 인수와 기존 malformed slug 데이터의 별도 조사다.

## 구현 완료 기록

위 대조 receipt는 **구현 전 시점**의 기록이다. 현재 코드는 `harness/src-clean-code-third-pass`에서
SRC-01~SRC-10을 반영했고, B-01~B-07의 실제 실행과 필수 검사 결과를
[회귀 인수 보고서](../../test-reports/completed/2026-10-01-src-clean-code-third-pass-regression.md)에 기록했다.
보고서에는 시험 double/실제 DB·Next 표면, generated build/브라우저 응답의 일시 오류 계측과 복원,
최종 fresh build, fixture 정리와 구현 후 독립 리뷰 결과를 구분했다.
일반 MCP helper는 Action manifest에 추가하지 않았으며 core/plugin runtime·스키마·운영 flag는 변경하지 않았다.
기존 malformed slug 데이터 조사, 커밋·PR·배포는 이번 완료 판정에 포함하지 않는다.
