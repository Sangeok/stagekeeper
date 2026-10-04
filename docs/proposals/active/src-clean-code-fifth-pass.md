---
status: "pending"
stage: "implementation"
proposal-size: "standard"
created-at: "2026-10-04"
approved-by: "user"
approved-at: "2026-10-04"
approval-scope: "F5-01~14 Core 구현과 명시된 회귀·아키텍처·실제 인수 검증"
completed-at: null
verification-summary: "F5-01~14 코드 적용; check·web 570·fresh manifest/server 61·build·격리 DB 통합·HTTP/Flight 61 통과. 실제 브라우저 DOM 인수 미실행."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/protocol.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-10-04-src-clean-code-fourth-pass.md"
---

# src 클린코드 5차 검토 — 개선 제안 14건

## Summary

`frontend-clean-code-orchestrator`로 현재 `src`를 응집도·결합도·예측 가능성·가독성·TypeScript 일반의 다섯 독립 관점에서 검토했다. 별도의 중립 품질 게이트가 원시 발견 14건의 코드 근거·심각도·최소 변경안을 대조하여 **Must 5건, Should 4건, Consider 5건을 채택했다.** 이전 완료 제안의 판정을 재사용하지 않고 현재 소스를 검토했다.

우선 수정할 문제는 Board의 프로젝트 슬롯 실행 누락·보류 항목의 검증 대기 표시, 로스터 갱신 뒤의 제출 불가, Start over 뒤의 이름 잔존, 예약 문자가 포함된 문서 링크다. 나머지는 표시 계약의 소유권, Server Action 입력, 시간 표현, public API와 설명의 일관성을 개선한다. 최초 검토·reconciliation은 실행 전 제안서 작업이었다. 2026-10-04 후속 사용자 요청으로 F5-01~14를 실제 코드에 적용했으며, 현재 구현과 검증 상태는 Verification Results에 기록한다.

| 우선순위 | ID | 개선 항목 | 기여 관점 |
| --- | --- | --- | --- |
| Must | F5-03 | Board에서 key 없는 프로젝트 슬롯 실행을 확인 | Coupling |
| Must | F5-05 | 로스터 갱신 시 유효 담당자를 일관되게 파생 | Predictability |
| Must | F5-08 | 보류된 verify 항목을 검증 실행 후보에서 제외 | Readability |
| Must | F5-11 | Start over에서 Display name도 초기화 | TypeScript generalist |
| Must | F5-14 | GitHub 문서 링크의 경로 데이터를 인코딩 | TypeScript generalist |
| Should | F5-01 | 랜딩 데모와 실제 Inbox의 게이트 문구를 연결 | Cohesion |
| Should | F5-02 | 세 토큰 범위의 목록 표시 계약을 entity에 모으기 | Cohesion |
| Should | F5-12 | 게이트·제안 Action의 런타임 입력 검증 | TypeScript generalist |
| Should | F5-13 | 제안 나이를 검토 기간으로 표현하는 문구 수정 | TypeScript generalist |
| Consider | F5-04 | Inbox의 서버 composition을 서버 public API로 공개 | Coupling |
| Consider | F5-06 | 라벨 lookup의 상속 속성 접근 차단 | Predictability |
| Consider | F5-07 | 슬롯 추가·이동에서 없는 ID를 명시적으로 거부 | Predictability |
| Consider | F5-09 | 토큰 인가 주석을 현재 소유권·가용성 계약과 일치 | Readability |
| Consider | F5-10 | 게이트 버튼의 라벨 기준을 gate ID로 설명 | Readability |

## Goal

- 정상적인 상태 갱신·폼 초기화·문서 열기에서 화면과 제출 데이터의 불일치를 줄인다.
- 실행 여부와 보류 상태를 현재 서버 계약에 맞게 표시한다.
- 같은 변경 책임의 타입·표시·문구·검증을 연결하고, 입력·반환·public API의 계약을 명확하게 한다.
- 각 개선을 작은 변경으로 구현하고 독립적으로 검증할 수 있게 근거와 완료 기준을 남긴다.

## Proposal Size

`standard`. 다섯 개 이상의 파일, Server Action 입력 경계, public API 이동, 서버 조회 projection과 여러 화면의 표시 계약에 영향을 준다. 새 의존성·DB schema 변경·운영 배포는 이 제안에 필요하지 않다. 문서 크기와 별개로 reconciliation 검토 프로필은 **High-Risk**다. F5-12의 인가·쓰기·CAS와 F5-02/04의 서버 공개 경계·최종 화면 소유권이 그 근거다.

## Current State

### 검토 기준

- 작성일: 2026-10-04.
- 저장소: `C:/Users/hamso/OneDrive/Desktop/git/stagekeeper`.
- 최초 5차 리뷰 브랜치: `dev`; HEAD: `77ad552509e421402c98f509706d2410a8735a06`.
- 문서 reconciliation 시 브랜치: `harness/complete-acceptance-failure-path`; HEAD는 위와 동일하며 `src` 변경도 없다. 다른 작업의 브랜치를 전환하거나 해당 작업을 변경하지 않는다.
- 검토 시작 시 `src`의 staged/unstaged 변경은 없었다. 다른 작업의 proposal·보고서 변경은 보존했다.
- 로컬 버전: Next.js 16.3.3, React/ReactDOM 19.2.8, TypeScript 5.9.3, Prisma Client 7.10.0, Node.js 22.13.1.
- TypeScript는 `strict`, `noEmit`, `moduleResolution: bundler`, `target: ES2017`이며 `@/* → src/*`, `@harness/core/* → packages/core/*`를 사용한다.
- 현재 구조의 기준은 [architecture README](../../architecture/README.md), [FSD 규칙](../../architecture/fsd.md), [검증 규칙](../../architecture/verification.md)이다. 완료 제안서는 배경 기록이며 현재 아키텍처를 대체하지 않는다.

| 검토 영역 | 텍스트 파일 | 줄 수 | 인접 테스트 |
| --- | ---: | ---: | ---: |
| `src/app` | 28 | 731 | 0 |
| `src/fsd` | 207 | 8,961 | 49 |
| `src/server` | 99 | 8,082 | 35 |
| `src/proxy.ts` | 1 | 5 | 0 |
| 합계 | **335** | **17,779** | **84** |

다섯 렌즈 모두 위 텍스트 파일의 본문과 인접 테스트를 확인했다. `src/server`는 프런트엔드의 상태·입력·인가·실행 계약을 확인하는 근거로 사용했으며 backend-only 개선을 추가하지 않았다. Prisma 생성물과 binary favicon은 수동 개선 대상에서 제외했다. 설치된 Next 문서·설정과 관련 core 계약은 주장을 확인하는 보조 근거다.

대상은 `rg --files src -g '*.ts' -g '*.tsx' -g '*.mjs' -g '*.css'`로 열거했다. 경로를 POSIX 표기로 바꾸어 ordinal 정렬한 뒤 각 `UTF-8 경로 + NUL + 원본 파일 바이트 + NUL`을 연결한 SHA-256은 다음과 같다.

```text
c6cb01379e70fa45d58b506a2e4be64948393ff90eef97b58d52fcf097a89b7a
```

이 해시는 검토한 소스의 식별 근거이며 결함 부재를 증명하지 않는다. 아래 위치는 이 snapshot의 줄 번호다. 구현 전에 최신 승인된 `dev`와 다시 대조한다.

### 검토 방식

렌즈마다 지정된 sibling skill만 읽는 별도 `fork_turns: none` 컨텍스트를 사용했고, 다른 렌즈의 결과를 공유하지 않았다. 동시 실행 용량에 맞춰 두 배치로 진행했다. Predictability는 처음에 남겨 둔 서버 테스트 21개의 본문을 기술적 재확인에서 모두 읽었으며 발견 내용은 바뀌지 않았다.

중립 품질 게이트는 다섯 원본 출력과 인용된 소스·현재 문서를 독립 대조했다. 게이트가 335개 파일을 별도로 전수 리뷰했다는 뜻은 아니다. **실질 게이트 1라운드**에서 14건을 모두 수용했으며 병합·기각·렌즈 재지정·미해결 항목은 없다. F5-07의 실제 그래프 검증 수용 여부만 메인의 읽기 전용 probe로 확인했다.

- **Must:** 가능성이 높은 동작 결함·깨진 흐름으로 우선 수정할 항목.
- **Should:** 유지보수·검증·계약 이해에 유의미한 비용을 주는 항목.
- **Consider:** 영향이 국소적이고 작은 변경이 명확한 낮은 우선순위 항목.

심각도는 입증된 영향에 따라 정했다. 스킬의 HARD/DEFAULT/OPTIONAL 표기나 렌즈의 동의 개수로 정하지 않았다.

## Scope

포함 범위는 채택된 F5-01~F5-14와 관련 테스트다. **14건 모두 이 제안의 Core 범위**이며 Consider는 구현 제외를 뜻하지 않는다. 단계는 하나의 구현·검증 단계이며 아래 실행 순서는 작업 순서다. 후속 변경은 `src/app`의 framework composition, `src/fsd`의 제품 코드, `src/server`의 서비스 소유권, `pages → widgets → features → entities → shared` 방향과 slice public API를 따른다. 표시 문구를 바꾸는 F5-01·F5-13은 `product-copy.md`의 해당 절도 함께 갱신한다.

전역 상태·공통 validation framework·새 폴더 체계·범용 hook 도입, 백엔드 전반 재설계, 의존성 업그레이드, migration, 운영 DB 쓰기, private template 배포, Codex 지원 인증은 포함하지 않는다. Board와 Turn의 모든 정책을 통일하거나 runtime 서비스 전체를 공통화하는 작업도 포함하지 않는다.

## Proposal

### Must — F5-03: Board의 key 없는 프로젝트 슬롯 실행 확인

**기여·원시 ID:** Coupling / CPL-01.

**근거:** `src/fsd/pages/project-board/api/project-board.server.ts:13`, `:17`, `:29`는 pipeline의 node와 `key != null`인 열린 AgentRun만 읽고 `backlog key + dispatcher`로 `dispatched`를 만든다. 반면 `src/server/agents/run-query.ts:49`, `:76`, `:101`과 `docs/architecture/protocol.md:279`의 프로젝트 슬롯 실행은 `key:null`이며 pipeline/entry binding을 사용한다. `src/fsd/widgets/turn-banner/api/turn-data.server.ts:50`, `:63`은 이 binding으로 실행을 확인한다.

**영향:** `doc-auditor#2`·`feature-scout#2`가 실행 중이어도 Board Activity와 Team에는 대기 표시가 남을 수 있다. 기존 느슨한 key·agent 판정의 의도와 별개로, null-key 실행을 조회에서 배제하는 누락이다.

**최소 변경:** Board adapter가 pipeline ID·entry ID·format과 열린 AgentRun binding을 읽고, key 없는 프로젝트 슬롯을 현재 entry의 dispatcher와 연결한다. 기존 key·agent 판정의 적용 범위와 화면 표현은 보존한다. 서버 read contract 공통화는 필수 작업으로 확대하지 않는다. 정확한 추가 판정은 아래 Runtime Behavior Matrix의 OR 계약을 따른다.

**완료 기준:** 현재 entry에 결합된 null-key 실행은 작업 중으로, null-key의 다른 entry·다른 dispatcher·닫힌 실행은 현재 작업으로 표시하지 않는다. 실행이 없는 대기와 모든 버전의 기존 keyed 판정도 보존한다. 순수 모델에 `dispatched:true`만 주입하지 말고 adapter의 조회·binding부터 검증한다.

### Must — F5-05: 현재 로스터에서 유효 담당자 파생

**기여·원시 ID:** Predictability / PRE-01.

**근거:** `src/fsd/features/propose-item/ui/propose-button.tsx:16`, `:33`, `:39`, `:53`, `:57`은 최초 로스터에서 담당자를 한 번 초기화한 뒤, 최신 옵션과 이전 상태를 별도로 사용한다. `project-backlog-page.tsx:38`과 `backlog-table.tsx:56`은 같은 행의 인스턴스를 유지한다. workspace 추가와 backlog 재조회·revalidation 경로가 존재하며, 설치된 Next의 `use-router.md:46`은 갱신 시 영향받지 않은 client state의 보존을 설명한다.

**영향:** 로스터가 `[] → ["dev"]`로 갱신되면 옵션은 생겨도 상태의 담당자는 빈 문자열에 남아 제출 버튼이 계속 비활성일 수 있다. 표시·활성 조건·제출값이 서로 다른 상태를 표현한다.

**최소 변경:** 명시적 사용자 선택만 상태로 보관한다. 현재 로스터에 포함된 선택이면 유지하고, 아니면 현재 첫 담당자 또는 빈 문자열을 파생한다. select value·disabled·제출에 같은 파생값을 사용한다. 선택 state는 `string | null`로 시작하고 최초 담당자도 파생값으로 처리한다. 제거된 명시 선택을 별도의 effect로 지우지 않으며 다시 roster에 들어오면 그 선택이 유효해진다. 제출 직전에 파생 담당자와 사유를 요청의 snapshot으로 잡고, pending 중 roster 변경은 이미 시작한 요청을 바꾸거나 재제출하지 않는다.

**완료 기준:** 동일 React 인스턴스의 빈 로스터→단일 담당자 갱신에서 제출이 가능하고 payload가 제출 시점의 표시값과 같다. 유효한 명시 선택은 로스터 재정렬에도 유지하며 제거된 선택·빈 로스터는 현재 목록에 맞게 처리한다. pending 중 roster 변경 뒤의 표시와 이미 제출한 snapshot은 서로 다른 시점의 값임을 구분한다. 브라우저에서 이 갱신 경로를 아직 재현하지 않았으므로 실제 rerender 회귀 사례가 필요하다.

### Must — F5-08: 보류된 verify 항목을 실행 후보에서 제외

**기여·원시 ID:** Readability / RDB-01.

**근거:** `src/fsd/pages/project-board/model/briefing.ts:97`, `:101`의 `verifierState`는 `node === "verify"`만으로 후보를 정한다. `src/server/pipeline/board-query.ts:365`, `:369`, `:618`의 hold 경로는 AgentRun을 닫고 pipeline cursor를 유지할 수 있다. Board adapter는 열린 pipeline node를 전달한다. 같은 모델 `briefing.ts:121`과 Turn `model/turn.ts:187`은 보류를 명시적으로 제외한다.

**영향:** `{status:"on_hold", node:"verify", dispatched:false}`가 Team에서 `Ready for`로 표시된다. 보류 항목이 앞에 있으면 실제 검증 대기 항목도 가릴 수 있다.

**최소 변경:** verify 후보에서 `on_hold`를 제외하고 실행 가능한 항목을 고르는 조건이 드러나게 한다. 전역 상태 모델은 바꾸지 않는다.

**완료 기준:** 보류된 verify 항목만 있으면 검증자는 Idle이고, 그 뒤에 정상 verify 대기가 있으면 정상 항목이 선택된다. 기존 working·ready·gate·idle 판정과 Activity의 hold 표현을 보존한다. `briefing.test.mjs:124` 주변의 기존 검증자 시험에 두 조합을 추가한다.

### Must — F5-11: Start over에서 Display name 초기화

**기여·원시 ID:** TypeScript generalist / TS-01.

**근거:** `src/fsd/features/create-project/ui/new-project-form.tsx:64`, `:69`, `:90`, `:142`, `:164`와 `model/repository-entry-state.ts:34`의 reset은 상세 초기화 신호를 내지만 UI는 `slugTouched`만 초기화한다. 이름은 같은 DOM subtree에 남는 uncontrolled input이며 접힌 필드도 제출된다. `api/create-project.server.ts:21`은 비어 있지 않은 이름을 사용한다.

**영향:** 저장소 A의 이름 입력→Start over→B 선택→등록에서 접힌 필드의 A 이름이 B의 이름으로 저장될 수 있다.

**최소 변경:** Display name을 빈 문자열로 시작하는 controlled state로 관리하고 `changeEntry`의 `next.resetDetails` 분기에서 비운다. 현재 이 신호는 `reset`만 낸다. 일반 저장소 선택 변경, URL/direct 수정, picker/manual 전환, Edit/Collapse에서는 이름을 유지한다. 새 form key나 native `form.reset()`을 사용하지 않는다. 이미 pending인 등록의 FormData snapshot과 `useActionState` 결과 수명도 변경하지 않는다.

**완료 기준:** 실제 React/DOM에서 A의 이름을 입력하고 Start over 후 B를 선택하면 `FormData.name`은 빈 문자열이며 기본 이름 규칙을 따른다. Edit/Collapse·단순 저장소 전환에서는 기존 보존 정책을 유지한다. 순수 repository-entry-state 시험만으로 DOM 값 초기화를 검증했다고 취급하지 않는다.

### Must — F5-14: GitHub 문서 링크의 URL 데이터 인코딩

**기여·원시 ID:** TypeScript generalist / TS-04.

**근거:** `src/fsd/entities/board-item/model/doc-link.ts:9`, `:10`의 `blobHref`는 ref/branch/path를 그대로 이어 붙인다. MCP의 `src/server/mcp/tools.ts:199`, `:207`은 문서 path를 문자열로 허용한다. 이 builder를 Inbox `model/inbox-item.ts:106`, 항목 문서 `model/item-docs.ts:12`, `:27`, History `model/history-row.ts:60`이 함께 사용한다.

**영향:** `docs/plan#1.md`에서 `#1.md`가 fragment가 되어 요청 pathname이 실제 파일 경로와 달라진다. 기록된 계획·보고서를 열지 못하고 commit 미push 안내와도 원인이 섞인다.

**최소 변경:** entity의 builder에 비공개 `encodePathSegments(value)`를 두고 `value.split("/").map(encodeURIComponent).join("/")`로 ref/branch와 path를 각각 처리한다. owner/repo는 각각 `encodeURIComponent`로 처리한다. `ref ?? repo.branch`를 먼저 결정하며 `/` 구분자·빈 segment·대소문자를 유지한다. 입력은 원본 경로이므로 decode하거나 이미 encoded인지 추측하지 않는다. 실제 파일명의 `%23`은 `%2523`이 되어야 한다. 소비 UI마다 별도 보정하지 않는다.

**완료 기준:** `#`, `?`, `%`, 공백, 한글이 포함된 경로가 fragment/query로 분리되지 않고 원래 파일 경로로 해석된다. 기존 일반 경로·명시적 commit 우선·branch fallback·slash branch를 보존한다. `doc-link.test.ts:32` 주변에 URI 경계값을 추가하고 Inbox·항목·History의 href 소비도 확인한다. GitHub에서 실제 파일을 열어 본 결과는 이번 정적 검토에 포함되지 않는다.

### Should — F5-01: 랜딩 데모와 실제 게이트 문구 연결

**기여·원시 ID:** Cohesion / COH-01.

**근거:** `src/fsd/pages/landing/ui/landing-page.tsx:139`, `:145`는 데모를 실제 Inbox에 대한 약속으로 설명하지만 `:181`, `:184`에 label/hint를 복사한다. 데모는 `Then you run dev in Claude Code.`이고 `entities/pipeline/model/gate-copy.ts:9`와 실제 Inbox의 힌트는 `Then continue in your coding client.`다. `product-copy.md:92`와 `:1044`도 각각 다른 문구를 담는다. `landing-page.test.ts:10`은 별도 데모 잠금만 확인한다.

**최소 변경·완료 기준:** 기존 순수 공개 API `@/fsd/entities/pipeline`의 `gateActionLabel("before-implement")`·`gateActionHint("before-implement")`로 데모 문구를 읽는다. `product-copy.md` §16 잠금도 §3의 현재 문구와 맞추고, 데모 시험을 entity 문구와 연결한다. 정적 구조·headline·client 경계는 보존하며 review-gate의 서버 barrel을 데모로 가져오지 않는다.

### Should — F5-02: 토큰 목록의 표시 계약을 entity에 모으기

**기여·원시 ID:** Cohesion / COH-02.

**근거:** `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx:12`, `:33`, `:106`, `:126`과 `pages/user-tokens/ui/user-tokens-page.tsx:10`, `:23`, `:54`는 같은 7필드 row type·날짜·active/ended 분류·7열 표·usage/expiry/status·empty state를 각각 소유한다. agent·owner·user의 세 사용처에서 같은 책임과 변경 방향이 확인된다.

**최소 변경:** 기존 `entities/project-token`의 `model/token-row.ts`에 7필드 `TokenRow`, `ui/token-table.tsx`에 표시 전용 `TokenTable`을 둔다. 타입은 `index.ts`, 컴포넌트는 새 `index.server.ts`에서 명시적으로 공개한다. 두 page는 서버 public API를 사용하는 composition이 되므로 `ProjectTokensPage`·`UserTokensPage`도 각각 새 `index.server.ts`로 공개하고 두 route를 갱신한다. 기존 page `index.ts`는 타입 export만 남긴다. UI 파일의 기존 `TokenRow`/`UserTokenRow` 타입 이름은 entity 타입의 alias로 유지해 인접 시험의 계약을 깨지 않는다.

`TokenRow`는 `id: string`, `label: string`, `createdAt: Date`, `revokedAt: Date | null`, `expiresAt: Date | null`, `lastUsedAt: Date | null`, `usageTrackingStartedAt: Date | null`의 기존 7필드다. `TokenTable` props는 `tokens: readonly TokenRow[]`, `at: Date`, `reference: "token" | "owner" | "user"`, `empty: string`, `headingLevel: 2 | 3`, `renderName: (row: TokenRow) => ReactNode`, `renderRevoke: (row: TokenRow) => ReactNode`다. Table은 active/ended 분류·7열·날짜·usage/expiry/status·empty row와 revoked 행의 폐기 slot 생략을 소유한다. 두 render callback은 Server Component 사이에서만 호출한다. page가 이름 편집 feature와 `<form action={revoke.bind(null, row.id)}>`를 생성하고 Client leaf에는 기존 Server Action reference와 직렬화 가능한 값만 넘긴다. entity는 feature·page·server를 import하지 않는다. 표와 그 public API에 `"use client"`·`"use server"`·DB 접근을 추가하지 않는다. 기존 Node render 시험을 유지할 수 있도록 이 순수 표시 API에 `server-only` package marker를 새로 추가하지 않는다. client 소비 금지는 FSD 검사와 아래 전체 import 검사로 확인한다.

**완료 기준:** 세 범위에서 공통 열·날짜·expiry·usage·status·분류를 같은 계약으로 렌더한다. agent/owner/user reference, 권한에 따른 rename, revoked와 expired의 폐기 가능성, 서로 다른 empty copy와 heading은 보존한다. 공통 표시 시험은 entity 옆에 두고 page 시험은 scope·권한·feature 조합을 남긴다. 두 page 사이의 직접 import는 만들지 않는다.

### Should — F5-12: 게이트·제안 Action의 런타임 입력 검증

**기여·원시 ID:** TypeScript generalist / TS-02.

**근거:** `src/fsd/features/review-gate/api/review-gate.server.ts:14`, `:19`, `:30`, `:45`, `:56`과 `features/propose-item/api/propose-item.server.ts:7`은 객체 shape/key를 검증하기 전에 구조 분해·속성 접근·서비스 호출을 한다. 날짜 파서는 `new Date()`의 NaN만 검사한다. `src/server/pipeline/board-query.ts:300`, `:324`, `:409` 등의 조회에는 입력 key가 전달된다. 설치된 Next `02-guides/server-actions.md:78`, `:90`은 Action의 서버 입력 검증을 요구한다.

**영향:** malformed transport 입력은 기존 `ActionResult` 실패 대신 TypeError/Prisma 예외로 빠져 클라이언트의 예상 복구 경로를 벗어난다. 인가 우회·정상 요청의 데이터 손상이 입증되었다는 주장은 아니다.

**최소 변경:** 두 slice의 Action entrypoint에서 이미 설치된 Zod `safeParse`로 객체·문자열 필드·날짜 문자열·optional gateEntry shape를 검사하고 기존 `failure()`로 반환한다. 아래 Action Input Contract를 구현의 단일 기준으로 사용한다. 인증·인가, 허용 전이, CAS와 업무 규칙은 현재 경계에 유지한다. 입력을 자동 coerce해 다른 식별자로 만들거나 전역 validation/Result 체계를 도입하지 않는다.

**완료 기준:** null·누락 필드·숫자/객체 key·비문자열 timestamp·잘못된 gateEntry는 서비스 호출 없이 예상 실패를 반환한다. 정상 입력·stale·보류·read-only·소유권 거부와 기존 권한 우선순위도 보존한다. 검증 전 구조 분해를 제거하고 Action seam 시험에서 호출 수와 결과 계약을 함께 확인한다.

### Should — F5-13: 제안 나이와 검토 기간의 의미 구분

**기여·원시 ID:** TypeScript generalist / TS-03.

**근거:** `src/fsd/pages/project-board/model/briefing.ts:10`, `:61`, `:62`, `:65`는 `proposedOn`에서 계산한 기간을 `in review for N days`로 표시한다. 실제 검토 진입은 `src/server/pipeline/board-query.ts:500`의 후속 전이이며 Inbox `model/inbox-item.ts:86`, `:110`은 해당 status 전이 시각을 사용한다. `briefing.test.mjs:56`은 제안일을 검토 기간으로 기대한다.

**영향:** 제안 후 planning에 머문 시간까지 검토 대기 기간으로 읽혀 Board와 Inbox의 기간 의미가 달라진다.

**최소 변경·완료 기준:** 현재 모델과 `proposedOn`을 유지하며 Runtime Behavior Matrix의 day 0/1/N 문구로 제안 나이를 명시한다. `product-copy.md` §6과 기대값도 함께 갱신하고, 제안일과 검토 전이일이 다른 fixture로 의미를 확인한다. `statusSince` 추가와 조회 확장은 이 제안의 구현 대상이 아니다.

### Consider — F5-04: Inbox page를 서버 public API로 공개

**기여·원시 ID:** Coupling / CPL-02.

`src/fsd/pages/project-inbox/index.ts:1`은 `ProjectInboxPage`를 공개하지만 `ui/project-inbox-page.tsx:2`는 `review-gate/index.server`의 서버 composition에 의존한다. `docs/architecture/fsd.md:98`의 client-safe public API 규약에 맞게 page 진입점을 `index.server.ts`로 옮기고 `src/app/(app)/p/[slug]/inbox/page.tsx:3`의 import를 갱신한다. 현재 소비자가 Server Component이므로 현재 route 장애·DB 유출을 주장하지 않는다. 화면·권한·card boundary를 유지하고 새 build에서 서버 import 경계와 Inbox route 수집을 확인한다.

### Consider — F5-06: 라벨 lookup의 상속 속성 차단

**기여·원시 ID:** Predictability / PRE-02.

`src/fsd/entities/board-item/model/status-label.ts:3`, `:13`, `:15`와 `entities/pipeline/model/labels.ts:3`, `:5`, `:12`의 일반 객체 lookup은 `constructor`·`toString`·`__proto__`에 함수·객체를 반환할 수 있다. 문자열 fallback 계약과 `autoEdgeLabel`의 문자열 연산이 깨진다. Runtime Behavior Matrix의 own-property lookup으로 바꾸고 unknown 문자열 보존·null 상태·기존 라벨·slot suffix를 확인한다. 정상 DB writer/graph 검증을 통과한 사용자 장애는 입증하지 않았다. 공개 `STATUS_LABEL`의 객체 타입은 유지한다.

### Consider — F5-07: 없는 슬롯 ID의 조작 거부

**기여·원시 ID:** Predictability / PRE-03.

`src/fsd/features/edit-pipeline/model/rail-state.ts:22`, `:28`, `:29`, `:33`, `:36`, `:38`은 없는 destination의 `indexOf === -1`을 splice에 사용하고, 없는 source도 filter 뒤 삽입한다. 실제 core validator를 사용한 읽기 전용 probe에서 두 조작 모두 `ok:true`였다. 조작 전에 필요한 source/destination의 존재를 확인해 기존 `Step` 실패 분기로 반환한다. 실패 시 입력 그래프 보존과 정상 추가·이동·끝 이동·자기 위치 이동을 함께 확인한다. 현재 UI는 현재 nodes에서 ID를 만들므로 현재 사용자 장애로 확대하지 않는다.

### Consider — F5-09: 토큰 인가 주석 정정

**기여·원시 ID:** Readability / RDB-02.

`src/fsd/features/manage-user-token/api/manage-user-token.server.ts:12`의 설명은 네 액션과 `requireProjectWrite`를 말하지만 현재 `manage-token.server.ts:13`, `:22`, `:39`의 여섯 액션은 소유권을 검사한다. 발급·이름 변경은 서비스에서 가용성을 검사하고 소유자의 폐기는 미선택·연결 해제 상태에서도 허용한다. 액션 개수를 고정한 표현을 없애고 실제 프로젝트 소유권과 서비스 가용성·폐기 계약을 설명하도록 주석만 고친다. 동작·인가 코드를 바꾸거나 주석을 위한 새 테스트를 만들지 않는다.

### Consider — F5-10: 게이트 라벨의 기준 설명 정정

**기여·원시 ID:** Readability / RDB-03.

`src/fsd/features/review-gate/ui/gate-transition-button.tsx:12`는 목적지 status로 라벨을 정한다고 설명하지만 `:43`은 `gateActionLabel(gate)`를 호출하고 `model/gate-text.ts:14`는 gate ID가 키라고 명시한다. 주석을 현재 커서의 gate ID로 라벨을 정한다는 설명으로 고친다. 기존 모델·버튼 동작을 유지하고 새 테스트는 만들지 않는다.

## Affected Files

아래는 후속 구현의 확정 영향 목록이다. M=수정, A=신규, R=이동이다. 코드 파일의 신규 이름과 테스트 목적지는 여기서 확정하며 전역 폴더를 만들지 않는다. 반복되는 파일은 한 번만 수정한다.

| ID | 경로 또는 영역 | 제안 작업 | 주의할 경계 |
| --- | --- | --- | --- |
| F5-03 | M `src/fsd/pages/project-board/api/project-board.server.ts`; M `tests/server/project-page-loaders.test.ts` | projection·binding·실제 loader seam | 모든 버전의 keyed 판정·GET 무쓰기 |
| F5-05 | M `src/fsd/features/propose-item/ui/propose-button.tsx`; M `tests/server/fixtures/src-clean-code-browser.tsx`; M `tests/server/fixtures/src-clean-code-acceptance.ts` | 실제 ProposeButton을 같은 root에서 rerender | 선택·사유·요청 snapshot |
| F5-08/13 | M `src/fsd/pages/project-board/model/briefing.ts`; M `src/fsd/pages/project-board/model/briefing.test.mjs`; M `docs/conventions/product-copy.md` §6 | hold 필터·제안 나이 문구 | 서로 다른 회귀 사례 유지 |
| F5-11 | M `src/fsd/features/create-project/ui/new-project-form.tsx`; 위 두 React fixture M | 이름 state·reset·FormData | 일반 선택 변경 보존 |
| F5-14 | M `src/fsd/entities/board-item/model/doc-link.ts`; M `src/fsd/entities/board-item/model/doc-link.test.ts`; M `src/fsd/features/review-gate/model/inbox-item.test.ts`; M `src/fsd/features/review-gate/ui/inbox-card.test.mjs`; M `src/fsd/pages/board-item/model/item-docs.test.ts`; M `src/fsd/pages/board-item/ui/board-item-page.test.ts`; M `src/fsd/widgets/history-feed/model/history-row.test.ts`; M `src/fsd/widgets/history-feed/ui/history-list.test.ts` | builder→전체 소비 모델→렌더 href | 항목의 Failure record 직접 builder 호출도 포함 |
| F5-01 | M `src/fsd/pages/landing/ui/landing-page.tsx`; M `src/fsd/pages/landing/ui/landing-page.test.ts`; 위 copy 문서 M §16 | 순수 entity API·잠금 연결 | headline·데모 구조 유지 |
| F5-02 entity | A `src/fsd/entities/project-token/model/token-row.ts`; A `src/fsd/entities/project-token/ui/token-table.tsx`; A `src/fsd/entities/project-token/ui/token-table.test.ts`; A `src/fsd/entities/project-token/index.server.ts`; M `src/fsd/entities/project-token/index.ts` | 타입·표·서버 공개 API | 명시 export·상향 import 금지 |
| F5-02 pages | M `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx`; M `src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts`; M `src/fsd/pages/project-tokens/index.ts`; A `src/fsd/pages/project-tokens/index.server.ts`; M `src/fsd/pages/user-tokens/ui/user-tokens-page.tsx`; M `src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts`; M `src/fsd/pages/user-tokens/index.ts`; A `src/fsd/pages/user-tokens/index.server.ts` | composition·타입 alias·public API 전파 | page 간 import 금지 |
| F5-02 routes | M `src/app/(app)/p/[slug]/tokens/page.tsx`; M `src/app/(app)/settings/tokens/page.tsx`; M `tests/server/token-issuance-bindings.test.ts` | 서버 page import·seam stub key 갱신 | query·인가·action binding 보존 |
| F5-12 models | A `src/fsd/features/review-gate/model/review-gate-input.ts`; A `src/fsd/features/review-gate/model/review-gate-input.test.ts`; A `src/fsd/features/propose-item/model/propose-input.ts`; A `src/fsd/features/propose-item/model/propose-input.test.ts` | slice별 Zod schema | 모델을 Action barrel에 export하지 않음 |
| F5-12 actions | M `src/fsd/features/review-gate/api/review-gate.server.ts`; M `src/fsd/features/propose-item/api/propose-item.server.ts`; M `tests/server/review-gate-actions.test.ts` | 5개 Action entrypoint·auth/service/revalidation seam | catch-all 금지·CAS 보존 |
| F5-04 | R `src/fsd/pages/project-inbox/index.ts` → `src/fsd/pages/project-inbox/index.server.ts`; M `src/app/(app)/p/[slug]/inbox/page.tsx` | 공개 위치·소비 import | URL·props·서버 composition 유지 |
| F5-02/04/12 | M `tests/server/inbox-card-boundary.test.ts` | 전체 public API AST·fresh client/action manifest 검사 확장 | 표시 함수·schema 원격 Action 등록 금지 |
| F5-06 | M `src/fsd/entities/board-item/model/status-label.ts`; A `src/fsd/entities/board-item/model/status-label.test.ts`; M `src/fsd/entities/pipeline/model/labels.ts`; M `src/fsd/entities/pipeline/model/labels.test.ts` | own-property lookup·fallback | 공개 STATUS_LABEL 객체 유지 |
| F5-07 | M `src/fsd/features/edit-pipeline/model/rail-state.ts`; M `src/fsd/features/edit-pipeline/model/rail-state.test.ts` | 존재 검사·Step 실패·입력 불변 | normalizeSlots와 실제 core 검증 유지 |
| F5-09 | M `src/fsd/features/manage-user-token/api/manage-user-token.server.ts` | 주석 | 동작·인가 수정 없음 |
| F5-10 | M `src/fsd/features/review-gate/ui/gate-transition-button.tsx` | 주석 | 동작·gate ID 수정 없음 |
| 실제 인수 | A `scripts/rehearse-src-clean-code-fifth-pass.ts`; A `docs/test-reports/active/2026-10-04-src-clean-code-fifth-pass.md` | 아래 HTTP/화면·동일 runner의 Flight worker bootstrap/cleanup·실제 결과 기록 | 운영 DB·generated build 계측 없음 |

`src/server/agents/run-query.ts`, `pipeline/board-query.ts`, core 계약은 현재 동작의 근거이며 위 개선만을 위해 쓰기 정책을 재설계하지 않는다. URL·로스터·폼 개선도 소비 page 전반을 재구성할 필요가 없다.

### 생성·이동 preflight와 심볼 전파

구현 전 preflight에서 R 원본과 41개 M 파일의 존재, 13개 A 경로와 R 목적지의 부재, 대소문자 충돌 부재를 확인했다. `features/propose-item/model/`은 schema와 시험을 생성할 때 함께 만들었다. R 원본을 새 서버 진입점으로 이동하고 유일 소비 route도 갱신했다. 토큰 page의 기존 index는 타입 전용으로 변경했다. 후속 실행에서는 현재 산출물을 기존 계약으로 읽어 대조한다.

| 심볼 | 현재 owner / 공개 API | 구현 후 소비와 공개 위치 | 검증 목적지 |
| --- | --- | --- | --- |
| `gateActionLabel`, `gateActionHint` | `entities/pipeline/model/gate-copy.ts` → `entities/pipeline/index.ts` | Landing이 `@/fsd/entities/pipeline`에서 import; Inbox의 기존 forwarding 유지 | landing-page.test.ts·실제 `/` body |
| `TokenRow` | 두 token page UI의 중복 타입 | `entities/project-token/model/token-row.ts` → `index.ts`; page 내부 타입 alias는 유지 | entity table·두 page·route projection 시험 |
| `TokenTable` | project-token page의 비공개 함수·user page의 inline table | entity UI → `entities/project-token/index.server.ts`; 두 page만 소비 | token-table.test.ts·page render·client manifest |
| `ProjectTokensPage`, `UserTokensPage` | 두 page `index.ts` | 두 page `index.server.ts` → 두 token route; client-safe index에는 타입만 | route seam stub·AST·두 route body |
| `ProjectInboxPage` | `pages/project-inbox/index.ts` | `pages/project-inbox/index.server.ts` → Inbox route | old absence/new presence·AST·Inbox body |
| `loadProjectBoard`, `buildBriefing` | Board api/model → 기존 Board public API | 위치·서명 보존; loader의 projection과 모델 후보/문구만 수정 | project-page-loaders·briefing 시험·Board body |
| `blobHref`, `statusLabel`, `nodeLabel` | 기존 entity model → 기존 `index.ts` | 공개 서명 보존; 모든 기존 소비가 같은 builder/lookup을 사용 | 인접 모델·실제 href/label render |
| 5개 mutation Action | review-gate/propose-item api → 각 `index.server.ts` | 기존 이름·typed signature·route bind/props 보존, api에서 자기 model 상대 import | Action seam·manifest·실제 POST 반환 객체 |
| 4개 review schema·1개 propose schema | 신규 slice model | `retryAcceptanceInputSchema`, `transitionInputSchema`, `approveGateInputSchema`, `discardInputSchema`, `proposeInputSchema`; api의 상대 import만 | schema 시험·schema export 미등록 검사 |

그 외 불변 근거는 `src/fsd/widgets/turn-banner/api/turn-data.server.ts`, `src/fsd/widgets/turn-banner/model/turn.ts`, `src/fsd/features/review-gate/api/inbox-data.server.ts`, `src/fsd/features/review-gate/model/inbox-item.ts`, `src/fsd/pages/board-item/model/item-docs.ts`, `src/fsd/pages/board-item/ui/board-item-page.tsx`, `src/fsd/widgets/history-feed/model/history-row.ts`, `src/fsd/widgets/history-feed/ui/history-list.tsx`, `src/fsd/features/create-project/model/repository-entry-state.ts`, `src/fsd/features/create-project/api/create-project.server.ts`, `src/server/auth/guard.ts`, `src/server/pipeline/board.ts`, `src/server/pipeline/board-query.ts`, `src/server/agents/run-query.ts`, `src/server/token-management-query.ts`, `packages/core/pipeline.mjs`, `packages/core/transitions.mjs`, `packages/core/token-validity.mjs`다. 이들을 수정 대상이라고 해석하지 않는다.

## Action Input Contract

F5-12는 `retryAcceptance`, `humanTransition`, `approveGate`, `discardItem`, `proposeItem` **전부**를 포함한다. 현재 typed signature와 `discardItem(slug, key, timestamp)` 호출 형태는 유지하며 내부에서 unknown으로 받아 safeParse한다. 아래 string은 non-empty를 뜻하되 `result`·`reason`은 빈 문자열도 기존 서비스 규칙에 맡긴다. 모든 값은 trim/coerce/기본값 없이 원문을 전달한다. 추가 필드는 Zod object의 기본 strip 동작으로 버리고 caller/user/project/actor는 guard 값으로만 만든다.

| Action / schema | transport 필드 | 실패 반환·서비스 경계 |
| --- | --- | --- |
| retry / `retryAcceptanceInputSchema` | `{key: string, expectedUpdatedAt: dateString}` | review 실패 문구; parse 후 `board.retryAcceptance` |
| transition / `transitionInputSchema` | `{key: string, to: string, result?: string, expectedUpdatedAt: dateString}` | `to`의 허용 전이·result 의미/길이는 기존 서비스가 판정 |
| approve / `approveGateInputSchema` | `{key: string, gate: string, gateEntry?: {runId: string, entryId: string}, expectedUpdatedAt: dateString}` | gateEntry 누락은 허용; slots-v1의 필수 여부·실제 entry 일치는 서비스가 판정 |
| discard / `discardInputSchema` | `{key: string, expectedUpdatedAt: dateString}`로 두 positional 인자를 내부에서 묶음 | 폐기 상태·CAS는 기존 서비스가 판정 |
| propose / `proposeInputSchema` | `{key: string, agent: string, reason: string}` | agent roster·reason 규칙·미결 상한은 기존 서비스가 판정 |

`dateString`은 비어 있지 않은 **문자열**이며 `new Date(value).getTime()`이 NaN이 아닌 값이다. 새 ISO 정규식으로 기존 파싱 가능한 문자열을 좁히지 않는다. 실제 UI의 ISO timestamp는 그대로 통과하고 성공 후에만 Date로 만든다. 숫자 0/null/object를 Date가 받아들여도 schema는 거부한다. optional은 undefined/누락만 허용하며 null·배열·숫자 gateEntry와 비문자열 result는 거부한다.

순서는 (1) bound slug가 non-empty string인지 국소 검사 (2) `requireProjectWrite(slug)` (3) payload safeParse (4) 기존 서비스 (5) 성공에만 기존 revalidation (6) success다. 잘못된 slug는 guard/서비스/DB를 부르지 않는다. 정상 slug의 무세션 redirect·타인/없는 프로젝트 not-found는 그대로 throw되며 read-only failure가 payload 실패보다 우선한다. `humanTransition`의 현재 사전 구조 분해는 이 순서로 이동한다. schema 거부는 네 review Action에서 기존 `The board changed. Refresh and try again.`, propose에서 기존 UI의 `Couldn't put it on the board. Try again.`을 `failure()`로 반환한다. 새로운 오류 문구는 만들지 않는다.

입력 거부는 서비스 호출 0·revalidation 0·mutation 0이어야 한다. 서비스 stale와 다른 업무 거부는 현재 message mapping을 유지한다. auth exception, precommit exception, commit-unknown, revalidation exception을 catch-all로 `failure()`에 바꾸지 않는다. 응답 유실은 이미 커밋됐을 수 있으므로 자동 재제출·자동 취소를 추가하지 않는다.

## Runtime Behavior Matrix

| 경계 | 시작·변경·성공 | 실패·terminal·재시도·cleanup | 보존 기준 / 근거 |
| --- | --- | --- | --- |
| F5-03 Board binding | pipeline 조회는 열린 run의 `id, entryId, version.format, boardItemId, node`; AgentRun은 프로젝트의 열린 run 전부에서 `key, agent, pipelineRunId, pipelineEntryId`. `dispatched = 기존 keyedMatch OR nullKeyBoundMatch`. 추가 항은 project agent slot·SLOT_FORMAT·non-null current entry·동일 pipeline/entry/dispatcher·key:null에만 true | 다른 project/entry/pipeline/agent, null binding, 닫힌 run은 추가 항 false; gate·accept·pipeline 부재도 추가 항 false. 새 run이 열리거나 닫힌 후 GET 재조회로만 반영 | 기존 keyedMatch는 모든 버전에서 느슨한 key+agent 그대로. Turn 공통화·쓰기·캐시 추가 없음. run-query의 expectedKey/binding 계약 |
| F5-08 verify | `node === "verify" && status !== "on_hold"`; 실행 후보의 working을 먼저, 없으면 첫 queued | held-only는 Idle; held+queued/working은 정상 후보 선택; gate/closed node null도 Idle | 기존 순서·Activity hold·다른 team 판정 보존 |
| F5-05 roster | 명시 선택이 현재 roster에 있으면 선택, 아니면 roster 첫 항목/빈 값. 동일 root에서 roster props 변경·명시 선택·reorder를 처리 | 빈 roster는 disabled. 요청 실패/throw 시 폼·reason 보존하고 현재 roster로 retry; success는 기존 close/toast. Cancel 재개도 기존 값 수명 유지. pending prop 변경은 캡처 payload를 바꾸지 않음 | 전역 store/effect/remount/비동기 취소 도입 없음. UI double pending은 fixture cleanup에서 settle·root unmount |
| F5-11 이름 | 초기 name=""; Edit 입력→Collapse→FormData에 현재 이름. 명시 Start over→name=""→B 선택→서버 기본 slug 사용 | 일반 선택/URL 변경은 이름 보존; error 후 편집·재시도 가능. 등록 중 FormData와 이미 실행한 Action은 reset으로 취소/변경하지 않음. created/existing/disconnected 결과는 기존 terminal UI | hidden 상세 필드는 제출됨. repository-entry-state resetDetails와 create-project 서버 fallback이 근거 |
| F5-12 Action | 위 입력·guard·서비스·CAS·성공 revalidation 계약 | malformed·read-only·stale·업무 거부·redirect·not-found·precommit/commit-unknown·revalidation 실패를 구분. 성공 여부가 불명확하면 현재 UI 복구 흐름을 유지하고 자동 retry 금지. 인수 decoder의 chunk/module 거부는 root.a가 성공해도 별도 인수 실패이며 schema 실패가 아님 | 새 transaction/DB migration/인가 정책 없음. 서비스는 변하지 않음. decoder global/cache는 아래 route별 worker에 격리 |
| F5-02 token table | 같은 `at`으로 active/ended 분류; 날짜 UTC·7열·Unknown/Never used·revoked date 유지. reference는 token/owner/user, project headings h3·user h2 | empty copy는 기존 page 값을 전달. agent/owner rename은 issueAllowed, user rename은 항상 제공. 만료됐어도 not-revoked면 Revoke; revoked면 생략. unavailable/Free에서도 기존 폐기 허용 유지 | 두 route의 where/select/order·owner userId guard·feature Action binding 보존. 렌더가 usage/mutation을 쓰지 않음 |
| F5-01/13 copy | Landing label/hint는 before-implement entity 함수에서 읽음. Board in_review는 UTC dayTag=0이면 `plan submitted · in review`, 1이면 `plan submitted · proposed 1 day ago`, N이면 `plan submitted · proposed N days ago` | 미래 proposedOn도 dayTag 0 기존 clamp. 제안 후 검토 전이까지 오래 걸린 fixture도 제안 나이 문구로 표시 | §16 데모와 §6 Board 잠금을 함께 수정; statusSince/events 조회 추가 없음 |
| F5-06 labels | 두 lookup에 `Object.prototype.hasOwnProperty.call(table, key)` 사용; own label만 반환 | constructor/toString/__proto__/unknown은 기존 문자열 fallback, status null은 Not on board; autoEdgeLabel 문자열 연산 안전 | public STATUS_LABEL 객체·known labels·slot suffix 유지 |
| F5-07 rail IDs | add는 normalizeSlots 후 destination 존재 검사. move는 기존 graph의 source 존재 검사부터 하고, non-null destination 존재를 확인한 뒤 동일 위치 no-op/기존 이동 실행 | missing source는 `unknown source`, destination은 기존 `unknown destination`; source==destination이라도 없는 source는 실패. 실패에 입력 graph/nodes/gates 변경 0; 새 입력으로 retry | move의 기존 ID 표현을 임의 normalize하지 않음. add의 legacy doc-audit/scout normalization·#2 반복 identity·plan validator·attached gates 보존 |
| F5-14 URL | owner/repo·선택 ref·문서 경로의 원본 문자열을 한 번 encode; commit 우선·slash branch·segment slash 보존 | `new URL(href).hash/search`는 빈 값; segment decode로 원본 복원. 네 builder 호출 경로와 세 화면 href에 동일 결과 | 파일 존재·원격 commit push·잘못된 UTF-16/경로 정규화의 신규 정책은 범위 밖 |
| F5-04/09/10 | 공개 API 위치/주석 정정 | route params·props·empty rendering·인가·gate label 호출 불변 | 런타임 retry/cleanup 자체는 기존 UI가 소유 |

Next 16.3.3 로컬 가이드 `01-app/02-guides/server-actions.md`의 POST·single response·검증 요구, `server-and-client-boundary.md`의 function/ReactNode 경계, `03-api-reference/04-functions/use-router.md`의 refresh 시 client state 보존, `revalidatePath.md`의 성공 revalidation 의미를 확인했다. `next.config.ts`는 빈 설정이며 cacheComponents/rewrites를 새로 가정하지 않는다. React fixture의 `renderMode()`는 매번 root를 재생성하므로 F5-05의 **roster 변경에는 사용하지 않는다**. 새 parent fixture에서 useState/setRoster로 같은 ProposeButton을 rerender하고, FormFixture는 동일 NewProjectForm 인스턴스에서 최소 두 repo를 고르게 확장한다.

## Final Artifact Resolution Map

| 실제 산출물 | 최종 owner·우선순위·본문 의존성 | 확인 목적지 |
| --- | --- | --- |
| `/` Landing 데모 | `src/app/page.tsx` → pages/landing → entity gate-copy. §16은 문구 계약이며 runtime override가 아님; 기존 CSS/fonts/layout 유지 | static render와 fresh Next GET body의 label/hint·headline·데모 |
| `/p/[slug]` Activity/Team | owner guard → Board loader/prisma projection → briefing → ProjectBoardPage; Turn은 독립 기존 계약. graph/roster/runs가 표시 입력 | 실제 loader seam 결과·briefing 시험·owner GET body의 Working/Ready/Idle·제안 나이 |
| `/p/[slug]/backlog`, `/p/new` | route action bind/data → 실제 ProposeButton/NewProjectForm. 로컬 state의 단일 인스턴스가 DOM/요청값 owner | React fixture의 DOM value/disabled/payload/FormData; 실제 route body·Action 성공 대조 |
| `/p/[slug]/tokens`, `/settings/tokens` | 기존 owner/user guard와 동일 7필드 projection → page index.server → entity TokenTable; render slot은 page가 생성. 기존 token/status/usage/core validity/CSS 의존 | entity/page render와 fresh GET의 7열·reference·heading·권한·empty copy; action binding seam |
| `/p/[slug]/inbox` | app route → 새 page index.server → 기존 review-gate index.server/InboxCard → 기존 client controls/provider/boundary. 공개 위치만 이동 | owner GET 카드/empty body·기존 render 경계 시험·fresh client manifest |
| Inbox/항목/History 문서 링크 | blobHref → toInboxItems/toItemDocs/toHistoryRows 및 BoardItemPage Failure record 직접 호출. label/order/DOC_LINK_NOTE는 기존 entity가 소유 | 세 화면 anchor href(HTML entity unescape 후 URL 검사); Failure record 포함 |
| 5개 Action 반환값·갱신 화면 | route가 bind한 slug + server API mutation; model schema는 원격 Action 아님. success/failure 객체와 성공 revalidation의 RSC subtree가 같은 Flight 응답에 포함됨. 인수 소비자는 해당 fresh route의 SSR mapping과 실제 bundle loader를 사용 | schema/seam 결과 객체·fresh action manifest·실제 POST의 반환 body와 DB 전후 snapshot; 응답 EOF·RSC lazy reference·loader settlement까지 확인하는 성공/실패 대조군 |
| build의 route/client/action manifests | 현재 src/app route tree·명시 public API·Next 16.3.3 build가 생성. 이전 `.next` 파일은 현재 결과의 authority가 아님 | fresh `.next/server/app-paths-manifest.json`, 각 route `page_client-reference-manifest.js`, `server-reference-manifest.json`을 구조 파싱 |

생성 Prisma client, `prisma/schema.prisma`, migrations, package/lock/Next/TS/ESLint 설정은 변경하지 않는다. 새로운 정적 자산·metadata route·번역·analytics·storage·외부 SDK는 없다. root `app/`도 없다. generated build를 직접 수정하거나 과거 manifest 존재를 새 build 성공으로 기록하지 않는다.

## Safety Analysis

- 라우팅은 현재 `src/app`에서 유지한다. F5-04는 public API 위치와 import만 바꾸며 URL을 바꾸지 않는다.
- F5-03은 읽기 projection의 보완이다. AgentRun 개설·종료, pipeline entry 진행, 게이트 승인·보류·인수 정책을 바꾸지 않는다.
- F5-02의 공통 UI는 entity가 표시만 소유하고 feature 조합은 page에 남긴다. Server Component의 render slot은 서버 조립에서만 사용하고 client로 함수를 직렬화하지 않는다.
- F5-05·F5-11은 같은 인스턴스의 입력 상태를 다룬다. 강제 remount로 사유·다른 입력·포커스를 함께 지우는 방식보다 해당 값만 갱신한다.
- F5-12는 transport 실패 계약을 보완한다. 권한·read-only·stale·업무 거부를 validation 성공과 별도로 검증하고, 기존 CAS·서버 서비스 판단을 유지한다.
- 실제 POST의 Flight 소비자는 route별 child에서 fresh bundle loader를 준비한다. 부모 프로세스의 global loader/cache를 바꾸거나 임의 module stub으로 제품 응답을 통과시키지 않는다. worker 종료·실패·timeout을 인수 cleanup에 포함한다.
- F5-01·F5-13의 문구는 canonical copy와 코드·시험을 같은 변경에 포함한다. 문서만 수정해 화면이 뒤처지는 상태를 만들지 않는다.
- F5-06·F5-07·F5-14는 기존 정상 값의 처리와 fallback/실패 계약을 보존하는 경계값 개선이다. 새 식별자 형식이나 파일 경로 정책을 추가하지 않는다.
- F5-09·F5-10은 설명만 고친다. 설명 오류를 이유로 현재 올바른 권한·gate ID 동작을 바꾸지 않는다.

정적 import·public API·관련 시험·현재 런타임 문서를 대조했다. 이 검토는 build manifest, 브라우저 DOM, 실제 Next Action POST, DB 경합 또는 GitHub 원격 파일 열기의 실행 증거를 대신하지 않는다. 정적 자산·storage·analytics·외부 SDK 변경은 제안 범위와 무관하다.

## Approval

2026-10-04 사용자 요청으로 F5-01~14 Core의 실제 코드 수정과 명시된 검증이 승인됐다. 승인 기록은 front matter가 단일 기준이다. 운영 배포는 포함하지 않는다. 범위를 변경하면 영향 목록과 검증 계획을 함께 갱신한다.

## Execution Plan

1. 최신 승인된 `dev`와 코드·줄 근거를 다시 대조하고 기존 사용자 변경을 보존한다. 구현은 `dev`에서 분기한 `harness/src-clean-code-fifth-pass` 같은 feature branch에서 진행한다. `dev`/`main`에 직접 commit하지 않는다.
2. Must 항목을 먼저 적용한다. Board의 F5-03·F5-08은 관련 파일을 함께 다루되 서로 다른 원인과 시험을 유지한다. F5-05·F5-11은 기존 실제 React fixture로 상태 수명을 확인하고 F5-14는 entity builder에서 해결한다.
3. F5-12의 Action 입력·실패 계약을 보완한다. 서비스 호출 여부, 정상·권한·stale 대조군을 먼저 고정한다.
4. F5-01·F5-13의 문구와 canonical copy를 맞춘다. F5-02는 row model → TokenTable → 서버 공개 API → 두 page → page 공개 API → 두 route/stub → 회귀 시험 순서로 전파하고 각 page의 권한·feature 조합을 유지한다. 중간의 깨진 import를 완료 상태로 남기지 않는다.
5. F5-04의 공개 경계와 F5-06·F5-07의 국소 계약을 정리한다. F5-09·F5-10의 주석을 현재 코드와 맞춘다.
6. 관련 회귀·저장소 필수 게이트를 실행한다. 결과와 미실행·skip·기존 실패를 구분해 기록하고 PR은 `dev` 대상으로 제출한다. 실제 구현·검증이 끝난 뒤에만 완료 metadata와 문서 위치를 변경한다.

## Verification Plan

### 항목별 검증

| ID | 최소 검증 | 보존 대조군 |
| --- | --- | --- |
| F5-03 | 실제 Board loader seam에서 projection/where까지 assertion; null-key 현재 entry·다른 pipeline/entry/dispatcher·null binding·닫힌 run·gate/accept·실행 없음 | 모든 버전의 기존 keyedMatch(다른 binding이어도 loose match 유지)·GET 무쓰기 |
| F5-05 | 실제 React 동일 인스턴스 `[] → [dev]`, 명시 선택·제거·재정렬·재등장·다시 빈 목록; 표시값·disabled·payload 비교; pending roster 갱신 | 유효 명시 선택·사유·한 요청의 snapshot·failure/throw 후 retry |
| F5-08 | hold+verify 단독, hold 뒤 정상 verify 대기·작업 중 | 기존 ready/working/gate/idle |
| F5-11 | 동일 form의 A 이름→Start over→B 선택→FormData.name=""; manual/picker reset 모두; focus·name input identity 확인 | 일반 선택 전환·URL/direct 편집·picker/manual·Collapse 보존; pending FormData 불변 |
| F5-14 | #/?/%/공백/한글 경로와 예약 문자 ref; URL hash/search 빈 값·decode한 path segment 원본 일치; 세 화면 href·Failure record 포함 | commit 우선·branch fallback·slash branch·literal %23·문서 label/order·404 note |
| F5-01 | 랜딩의 실제 label/hint와 entity 함수·§16 잠금 비교 | headline·데모 구조 |
| F5-02 | entity와 두 page의 agent/owner/user active·expired·revoked·never-used·unknown·empty 실제 markup; 두 route where/select/order·guard·action binding seam | issueAllowed/ownerAllowed 조합·Free owner 폐기·reference·h2/h3·rename/revoke·GET usage 무쓰기 |
| F5-12 | 5개 schema·Action 전부의 malformed slug/payload/key/field/date/gateEntry/result; 실제 schema로 safeParse, 서비스·revalidation 호출 0; forged actor/project 필드 무시 | 정상 owner·read-only·타인·guest·stale·hold/resume/reopen·gate entry 누락/불일치·업무 거부·precommit/commit-unknown/revalidation throw |
| F5-13 | 제안일과 검토 전이일이 다른 fixture와 canonical 문구 | day 0·1·복수 경과일 |
| F5-04 | old index 없음·new index 존재·전체 소비 AST·FSD·fresh Inbox route/client/action manifest·실제 GET 카드/empty body | 같은 URL·서버 composition·기존 controls/provider/boundary |
| F5-06 | `constructor`, `toString`, `__proto__`, 일반 unknown·null | 기존 상태·노드·slot suffix·auto label |
| F5-07 | missing source/destination·missing source==before 거부; 각 실패 뒤 graph/nodes/gates deep equality | 정상 추가·이동·끝 이동·동일 위치·legacy normalization·#2 slot/attached gate·plan 거부 |
| F5-09/10 | 주석 diff와 현재 인가·gate ID 호출 대조 | 주석만 변경; 신규 시험 없음 |

상호작용 시험은 JSX 내부 탐색이나 자체 hook 모형으로 대신하지 않는다. 지정한 실제 ReactDOM fixture와 acceptance runner를 확장한다. `scripts/rehearse-src-clean-code.ts --ui-only`는 통제된 action double을 사용하는 UI 검증이며 실제 Next POST/DB 인수와 구분한다. F5-05/11 사례는 필수이며 기존 인수 사례도 함께 유지한다. `/results`의 JSON 배열을 읽어 모든 case의 `status === "Pass"`를 확인한다. 미실행·skip·결과 누락은 Pass가 아니다. fixture 종료는 root unmount·pending settle·clipboard 복원·pagehide listener 제거·Finish(`/finish`)까지 확인한다.

### 실제 Next 인수와 위험 경계

새 `scripts/rehearse-src-clean-code-fifth-pass.ts`는 기존 fourth-pass 리허설의 **현재 로컬** HTTP/session/DB safety 구성을 참고하되 이 절의 사례를 직접 구현한다. 이전 제안/리허설 결과를 위임하거나 재사용하지 않는다. 필수 계약은 다음과 같다.

1. `validateTestDatabase(process.env)`를 첫 DB 쓰기 전에 호출한다. 전용 `TEST_DATABASE_URL`의 DB명은 `stagekeeper_test_*`, 운영 DATABASE_URL과 host/port/database 조합이 달라야 한다. fixture user/project IDs는 실행별로 만들고 자신이 생성한 IDs만 정리한다. 부모 env는 finally에서 복원하고 시작한 Next child·loopback 서버·pool도 정상/오류/중단 경로에서 닫는다. 준비 실패는 쓰기 전에 종료한다. 실행 timeout과 child error도 결과 실패로 기록한다.
2. fresh production build에서 owner·foreign·guest 세션을 구성한다. fresh action manifest에서 정확한 filename/exportedName으로 네 review Action과 proposeItem ID를 찾는다. 아래 Flight 소비자 준비를 마친 뒤 route/Origin/Host/body가 같은 정상 owner 요청을 각 Action별로 먼저 성공시켜 transport/decoder를 검증한다. 기존 route의 bound signature를 사용하고 시험용 Action/route를 제품 코드에 추가하지 않는다.
3. 동일 transport에서 각 Action의 malformed payload(전체 null, 필수 누락, key number/object, timestamp number/null/invalid string, gateEntry null/array/잘못된 runId/entryId, result number, propose agent/reason 잘못된 타입)를 해당 필드가 있는 Action에 적용한다. 설치된 `next/dist/compiled/react-server-dom-webpack/client.node`의 `encodeReply`로 인자를 encode하고, 아래 worker의 `createFromFetch`로 **온전한** Flight 응답을 decode하여 root의 `a` Promise를 await한다. 아래 응답 EOF·lazy reference·loader settlement 조건까지 충족해야 decode 성공이다. malformed의 최종 객체는 review에서 `{success:false,error:"The board changed. Refresh and try again."}`, propose에서 `{success:false,error:"Couldn't put it on the board. Try again."}`와 정확히 같아야 한다. redirect/HTML 응답·transport 거부·500·TypeError·Prisma 예외·decoder chunk/module 오류를 validation 성공으로 세지 않는다. 실패 전후 해당 fixture의 BoardItem/BacklogItem/TransitionEvent/PipelineRun/AgentRun/AcceptanceFailure 상태와 개수가 그대로인지 확인한다.
4. 정상 소유자 성공·stale·hold/resume/reopen·legacy gate·slots-v1 gateEntry 누락/불일치·read-only·타인·guest는 서로 독립 fixture로 대조한다. 정상 slug의 타인/guest는 기존 not-found/redirect transport 결과, read-only는 기존 access reason이며 payload schema 응답으로 바뀌면 실패다. 정상 입력의 기존 업무 거부·서비스 CAS를 DB 통합 시험과 함께 보존한다. precommit/commit-unknown/revalidation throw는 정확한 exception identity와 revalidation count를 Action seam에서 검증한다.
5. owner GET으로 위 Artifact Map의 모든 route를 읽고 **본문**을 확인한다. Board null-key 슬롯 Working/Ready와 held verify Idle, Landing entity hint, 두 token 화면의 분류/권한/reference/headings, Inbox 카드/empty, 항목·History·Failure record 문서 href를 포함한다. Board와 token GET 전후 fixture mutation/usage snapshot도 비교한다. HTML entity를 decode한 href로 URL 데이터 계약을 확인하며 GitHub 문서 href를 실제 fetch하지 않는다. `/p/new`는 기존 `src/server/github.ts`의 미인증 공개 repo 목록 GET과 5분 cache에 의존하지만 실패 시 manual 입력을 유지한다. 목록의 원격 성공/순서를 인수 조건에 넣지 않고 picker·목록 실패 대조군은 실제 React fixture의 통제된 repos props로 검증한다. `/p/new` body는 등록 폼/기본 owner/manual 복구를 확인하고 상세 name 기본값은 별도 실제 등록 성공 fixture로 확인한다.
6. 사례별 expected/observed/status, build 기준·명령 exit·transport 대조·DB 보존·cleanup 결과를 지정한 test report에 기록한다. 실제 브라우저 DOM 사례는 UI fixture 결과임을 구분한다. 인수 실패/cleanup 실패는 nonzero exit이며 성공 결과나 완료 metadata를 쓰지 않는다. 사용한 session·credential·token 평문은 로그/보고서에 남기지 않는다.

#### Flight 소비자 준비와 수명

단순 반환값만 있는 Flight를 복원한 probe는 revalidation 응답의 준비 완료 증거가 아니다. 설치된 Node decoder는 client reference를 preload할 때 `__webpack_chunk_load__`, 해석할 때 `globalThis.__next_require__`를 호출한다. `serverConsumerManifest`만 주면 이 함수들은 생기지 않는다. Next의 `app-page` template/runtime은 컴파일된 route의 `__next_app__.require/loadChunk`를 제공하고, 서버 renderer도 이 loader를 global에 설치한 후 SSR mapping으로 Flight를 소비한다. 이 runner도 다음 준비를 **구현 범위에 포함**한다.

- 새 runner 한 파일에서 내부 `--flight-worker` 진입 모드를 구현하고 **route별 child**에 소비자를 격리한다. 부모가 1번의 DB URL 검증을 통과한 뒤에만 child를 시작하며, child는 검증된 격리 `DATABASE_URL`과 `NODE_ENV=production`으로 bundle/decoder를 import한다. decoded Server Function이나 컴포넌트를 실행해 DB 쓰기·추가 요청을 만들지 않는다. 부모의 global loader 또는 decoder module/cache를 공유·변경하지 않는다.
- fresh app-paths manifest의 정확한 route key로 page bundle을 찾고 경로가 `.next/server` 안에 있는지 확인한다. 해당 bundle을 로드하여 `__next_app__.require`와 `__next_app__.loadChunk`가 함수인지 검증한다. 같은 route의 fresh client-reference manifest에서 `ssrModuleMapping`과 `moduleLoading`을 읽는다. 설치된 webpack Node decoder는 chunk ID/filename 교대 배열을 읽으므로, bundle에서 Turbopack runtime을 확인한 경우에만 SSR mapping의 각 chunk 경로를 `[path, path]`로 복제한다. 모든 module ID·export·async 값과 chunk 경로를 보존하고 원본은 변경하지 않는다. webpack mapping은 그대로 사용한다. 소비 mapping과 기존 moduleLoading, serverModuleMap:null로 serverConsumerManifest를 구성한다. raw client manifest 객체나 `clientModules`를 moduleMap으로 전달하지 않는다.
- 설치된 `client.node` decoder에 맞춰 worker의 `globalThis.__next_require__`는 그 route bundle의 `__next_app__.require`에, `globalThis.__webpack_chunk_load__`는 `__next_app__.loadChunk`에 연결한다. 모듈 ID/chunk는 fresh mapping과 bundle loader가 해석하며 응답 문자열을 파일 경로로 직접 require하지 않는다. Next renderer의 `__next_chunk_load__` 이름만 복사해 Node decoder의 `__webpack_chunk_load__` 준비를 생략하지 않는다.
- root.a의 성공만으로 worker 성공을 반환하지 않는다. 요청 timeout 안에 원문 응답을 EOF까지 읽은 뒤 그 온전한 bytes를 decode하고, 갱신 RSC 그래프에 도달 가능한 decoder의 lazy reference/thenable도 resolve한다. lazy가 thenable을 던지면 await 후 다시 resolve하고, 순환/공유 객체는 방문 집합으로 처리한다. 설치된 decoder의 lazy `_init(_payload)`는 모듈/reference 복원에만 사용하며 반환된 컴포넌트·Server Function을 호출하거나 렌더하지 않는다. loader wrapper가 시작한 모든 Promise의 settlement와 거부/throw를 기록해, root.a가 `{success:true}`여도 RSC reference·chunk/module·stream EOF 중 하나라도 실패/timeout이면 인수 실패로 판정한다.
- 소비자 준비 시험은 loader 누락·mapping 누락·chunk/module 거부가 실패하는 대조군과, client-reference/chunk가 있는 Flight에서 loader가 호출되고 root.a와 reference가 복원되는 대조군을 포함한다. 특히 비동기 chunk 거부와 module require throw에서 root.a는 성공하지만 lazy reference 복원은 실패하는 사례를 둘 다 검사한다. 메모리 double의 성공은 준비 방식의 시험이며, 제품 응답은 **실제 fresh bundle loader**와 각 Action의 정상 owner 성공으로 다시 검증한다. 빈 mapping, no-op loader, RSC subtree 제거, 본문 문자열 검색으로 이 조건을 우회하지 않는다.
- 매 응답마다 이전 worker를 종료하고 해당 route의 새 worker를 시작해 decoder chunk cache가 정상 loader 대조군을 생략하지 않게 한다. 성공/오류/timeout/중단 모두 진행 중 stream·요청을 끝내거나 abort하고 child 종료를 await하며 자기 pool이 있다면 disconnect한다. 세션·원문 응답은 IPC/메모리로만 전달하고 report에는 판정·진단 분류만 남긴다. bundle/loader/mapping 준비 실패 또는 cleanup 실패는 Not run/failed와 nonzero exit이며 schema 실패나 Pass로 바꾸지 않는다. 제품 코드·generated bundle의 계측/수정과 새 의존성은 필요하지 않다.

### 공개 API·생성 산출물의 양성/음성 검사

`tests/server/inbox-card-boundary.test.ts`를 확장하여 다음 목록을 **전부** 검사한다. 패턴 검색만으로 대신하지 말고 TypeScript AST의 import/export/type-only 여부와 named export provenance를 확인한다. fixture의 intentional deep import는 `tests/server/fixtures/`에만 허용하며 제품 `src`의 우회 import 예외가 아니다.

| 항목 | 허용 목적지·기대 값 | 금지·분류 |
| --- | --- | --- |
| ProjectInboxPage | page index.server와 유일 Inbox route 소비 | old index.ts 존재·root page import·client graph 등록 금지 |
| ProjectTokensPage/UserTokensPage | 두 page index.server와 지정된 두 token route | page index.ts의 runtime export·root 소비·client graph 등록 금지; type-only alias 허용 |
| TokenTable | entity index.server의 명시 export와 두 page의 서버 import | entity index.ts runtime export·client imports·feature/page/@server import·export *·UI use client/use server 금지 |
| schema 5개 | 자기 slice api의 상대 import·model 시험 import | 모든 public Action barrel의 schema export·schema 원격 Action 등록 금지 |
| Action 5개 | `review-gate.server.ts:{retryAcceptance,humanTransition,approveGate,discardItem}`와 `propose-item.server.ts:proposeItem` fresh registry | loader/TokenTable/세 page composition/schema를 remote Action으로 등록 금지 |
| 인수 Flight 소비자 | fresh route `__next_app__.require/loadChunk`, `ssrModuleMapping/moduleLoading`, Node decoder의 `__next_require__/__webpack_chunk_load__`; EOF·lazy reference·loader settlement 확인 | raw manifest/clientModules를 moduleMap으로 사용·부모 global 교체·no-op loader·RSC subtree 제거·root.a만 성공 확인·chunk 실패를 schema Pass로 처리 금지 |
| Inbox client modules | 기존 inbox-card-controls·inbox-card-boundary·gate-card-lock 존재 | inbox-card.tsx와 ProjectInboxPage client module 없음 |
| token client modules | 기존 입력/rename/reveal client leaf 허용 | TokenTable·ProjectTokensPage·UserTokensPage의 client module 없음 |
| route tree | 위 Artifact Map의 모든 src/app page·fresh app-paths key/value 확인 | root app 존재·route URL 변경 금지 |
| 설정·DB·core·generated | 위 scope guard 경로는 unchanged; build 생성 자체 허용 | dependency/lock/config/schema/migration/core 소스·generated Prisma 수동 변경 금지 |

action manifest는 `tests/server/fixtures/action-manifest.ts`의 node/edge/workers 구조 검사와 `assertActions`를 사용한다. client JS manifest는 기존 시험처럼 VM에서 `globalThis.__RSC_MANIFEST`를 읽고 모든 route의 clientModules를 검사한다. route manifest는 JSON 객체를 parse하여 expected route의 key와 value 파일 존재를 확인한다. fresh build 이후의 검사에서 미존재·빈 manifest·skip은 실패다. source AST와 manifest는 서로 다른 경로의 closure 증거다.

### 구현 후 명령

```powershell
function Invoke-FifthPassCheck {
  param([string]$ScriptName)
  npm run $ScriptName
  if ($LASTEXITCODE -ne 0) { throw "Failed: $ScriptName" }
}
@('verify:fsd', 'test:architecture', 'check', 'test:web', 'test:server', 'build') |
  ForEach-Object { Invoke-FifthPassCheck $_ }

# fresh build 뒤에 조건부 manifest 검사를 반드시 활성화한다.
$fifthPassPreviousInbox = $env:SRC_CHECK_INBOX_MANIFEST
$fifthPassPreviousActions = $env:RDC_CHECK_ACTION_MANIFEST
$env:SRC_CHECK_INBOX_MANIFEST = 'true'
$env:RDC_CHECK_ACTION_MANIFEST = 'true'
try {
  Invoke-FifthPassCheck 'test:server'
} finally {
  if ($null -eq $fifthPassPreviousInbox) { Remove-Item Env:SRC_CHECK_INBOX_MANIFEST -ErrorAction SilentlyContinue }
  else { $env:SRC_CHECK_INBOX_MANIFEST = $fifthPassPreviousInbox }
  if ($null -eq $fifthPassPreviousActions) { Remove-Item Env:RDC_CHECK_ACTION_MANIFEST -ErrorAction SilentlyContinue }
  else { $env:RDC_CHECK_ACTION_MANIFEST = $fifthPassPreviousActions }
}

# 실제 React fixture를 확장한 후 브라우저에서 Run acceptance와 Finish를 실행한다.
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-src-clean-code.ts --ui-only
if ($LASTEXITCODE -ne 0) { throw 'React fixture failed.' }

# 격리 TEST_DATABASE_URL을 준비한 후에만 실행한다.
Invoke-FifthPassCheck 'test:server:integration'
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-src-clean-code-fifth-pass.ts
if ($LASTEXITCODE -ne 0) { throw 'Fifth-pass HTTP acceptance failed.' }
```

`check`에는 lint·타입 생성/검사·아키텍처 검사가 포함된다. 위 명령은 **구현 후 검증 목록**이며 현재 문서 검토에서 실행했다고 해석하지 않는다. 각 native 명령의 `$LASTEXITCODE`를 확인하고 첫 실패에서 다음 단계로 넘어가지 않는다. UI-only 명령은 브라우저 인수/Finish 전까지 계속 실행되므로 별도 실행한 뒤 종료를 확인하고 다음 명령으로 진행한다. 기존 manifest env가 있으면 이전 값을 기록해 종료 시 복원한다. build·typegen·시험은 cache/generated output·fixture를 쓸 수 있어 replay에서는 manifest-only이며 자동 실행하지 않는다. DB/HTTP/UI 인수는 volatile-non-replayable다. 격리 DB 인수와 실제 Next POST는 이 High-Risk 제안의 필수 완료 게이트이며 불가능한 환경에서는 Not run/blocked를 기록하고 구현 완료로 선언하지 않는다.

## Verification Results

### 이번 검토의 확인 결과

| 확인 | 결과 | 한계 |
| --- | --- | --- |
| 다섯 독립 렌즈의 대상 본문·인접 테스트 확인 | 완료 — 각 335개 텍스트 파일 | 생성 코드·favicon 제외 |
| 중립 품질 게이트 | 완료 — 1라운드, 14건 accept | 인용 주장 대조이며 별도 전수 리뷰 아님 |
| 원시→최종 ID·심각도·기여 관점 추적 | 완료 | 중복·병합·기각 없음 |
| F5-07 실제 rail-state/core validator probe | exit 0, 두 잘못된 조작 모두 `ok:true` 확인 | UI·DB·테스트 suite 재현 아님 |
| 대상 파일 inventory·소스 SHA-256 | 완료 | 검토 snapshot 식별용 |

F5-07 probe는 실제 `rail-state.ts`를 설치된 TypeScript로 메모리에서 CommonJS로 변환하고 VM에서 실제 `packages/core` validator와 실행했다. 파일·캐시·DB 쓰기는 하지 않았다.

```text
g = { nodes: ["plan", "implement", "accept"], gates: [] }
addSlot(g, "doc-auditor", "missing", "pro")
  -> ok:true, nodes:["plan", "implement", "doc-auditor", "accept"]
moveSlot(g, "doc-auditor", null, "pro")
  -> ok:true, nodes:["plan", "implement", "accept", "doc-auditor"]
원래 g는 변경되지 않았다.
```

### 후속 구현의 회귀 결과

| 명령·실행 | 결과 | 비고 |
| --- | --- | --- |
| `npm run verify:fsd` | Pass, exit 0 | 아키텍처 예외·suppress 없음 |
| `npm run test:architecture` | Pass, exit 0; 26/26, skip 0 | `check`에서도 통과 |
| `npm run check` | Pass, exit 0 | plugin 동기화·lint·typegen·tsc·architecture·availability 18/18 |
| `npm run test:web` | Pass, exit 0; 570/570, skip 0 | schema·순수 모델·실제 entity/page render·href·날짜 회귀 |
| `npm run test:server` 기본 실행 | Pass, exit 0; 55 통과·1 조건부 skip | build 이전 실행을 fresh manifest 검증으로 간주하지 않음 |
| fresh build 후 두 manifest env=true의 `npm run test:server` | Pass, exit 0; 61/61, skip 0 | 전체 소비 AST·5개 Action 등록·서버 표시/모델의 미등록·route/client manifest |
| `npm run build` | Pass, exit 0 | Next 16.3.3 production Turbopack; 모든 기존 route 수집 |
| `npm run test:server:integration` | Pass, exit 0 | 루프백 PostgreSQL 17.11의 별도 stagekeeper_test_* DB에 migration 후 전체 직렬 통합 시험 |
| 새 fifth-pass runner | Pass, exit 0; HTTP/Flight 61/61 | 실제 Action·화면 body·GET 무쓰기·7개 decoder 준비 대조군·fresh loader·EOF/reference/settlement·fixture/worker/Next/pool cleanup |
| 실제 React fixture 브라우저 DOM 인수 | Not run | fixture를 확장하고 실행 가능한 bundle까지 준비했으나 연결된 브라우저가 없고 `/results`가 빈 배열. 동일 인스턴스 roster/name·focus·pending UI 사례와 DOM cleanup을 Pass로 기록하지 않음 |
| GitHub 원격 문서 fetch | Not run; 완료 게이트 아님 | 실제 화면 href의 예약 문자/commit/branch round-trip은 통과 |

구현 브랜치는 최신 origin/dev의 `77ad552509e421402c98f509706d2410a8735a06`에서 분기한 `harness/src-clean-code-fifth-pass`다. 영향 목록의 41 M·13 A·1 R을 대조했고 누락·목록 밖 제품 변경은 없다. 기존 다른 작업의 문서 변경을 보존했다. F5-09/10은 설명만 정정했고, 서비스·core·schema·설정·의존성 파일은 그대로다.

실제 인수 중 runner의 Turbopack chunk 형식, guest의 일반 Location redirect, 기존 사람 전이 정책에 맞는 hold fixture, 독립 등록 repo와 40자 이하 slug를 보완했다. 제품 정책을 바꾸지 않고 최종 전체 실행으로 다시 검증했다. 정상 응답마다 새 route worker를 사용하며 실제 chunk/module 호출 횟수도 기록했다. 최초 TEST_DATABASE_URL 부재는 DB 쓰기 전 nonzero 중단으로 확인한 뒤 임시 디렉터리에 독립 루프백 DB를 준비했다. 환경 변수·운영 DB 설정은 영구 변경하지 않았다.

상세 결과: [2026-10-04 fifth-pass test report](../../test-reports/active/2026-10-04-src-clean-code-fifth-pass.md). 브라우저 DOM 게이트가 남아 있으므로 completed-at은 비워 두고 완료 문서로 이동하지 않는다. 이 결과는 위 역사적 문서 검토의 source receipt와 구분되는 새 구현 실행 증거다.

최종 inspection에서 실제 test DB 사용자 수 0, 인수/Next/PostgreSQL 프로세스 부재와 `git diff --check` 통과를 확인했다. 임시 PostgreSQL 서버와 UI fixture는 종료했고 다운로드 ZIP도 삭제했다. 자동 승인 검토가 나머지 임시 디렉터리 삭제를 `blocked by policy`로 거부해 정지된 빈 cluster와 portable binaries는 남아 있다. 정확한 경로와 두 거부의 범위는 test report에 기록했다.

## Risks and Rollback

- Board의 binding 보완이 기존 느슨한 key 판정까지 바꾸면 의도한 정책 차이가 사라질 수 있다. null-key 슬롯 누락의 보완으로 변경을 제한하고 legacy 대조군을 유지한다.
- 토큰 목록 추출에서 feature를 entity로 끌어내리거나 render slot을 client 경계로 전달하면 새 결합 문제가 생긴다. page의 서버 조합·scope별 권한을 유지한다.
- 폼/로스터 변경은 실제 DOM 값·포커스·같은 인스턴스의 상태 수명까지 확인해야 한다. 강제 remount나 모든 입력의 일괄 reset으로 범위를 확대하지 않는다.
- URL 인코딩은 slash branch·이미 `%`를 포함한 실제 파일명 등의 회귀 위험이 있다. 원본 입력을 URL 데이터로 취급하고 한 번만 인코딩하는 계약을 시험한다.
- Action 검증은 정상·권한·stale 응답 우선순위를 바꿀 수 있다. 잘못된 transport 입력 처리와 기존 서비스 판정을 구분한다.
- Flight decoder에 manifest만 전달하면 갱신 화면의 chunk/module 로딩에서 실패할 수 있다. fresh route loader를 격리 worker에 연결하고 각 Action의 정상 revalidation 응답을 대조한다. 이 내부 Next 계약은 설치 버전이 바뀌면 다시 확인하며 소비자 준비 실패를 제품 입력 거부로 세지 않는다.
- F5-13은 실제 검토 기간 제공 대신 제안 나이임을 명시하는 작은 문구 수정이다. 실제 기간 요구로 바꾸면 조회·모델·시험의 영향 목록을 다시 작성해야 한다.

각 항목 또는 작은 관련 묶음을 독립 commit으로 구현해 문제 발생 시 해당 변경을 revert할 수 있게 한다. 이 제안에는 schema/data migration이 없으므로 데이터 복구 절차를 요구하지 않는다. public API 이동을 되돌릴 때는 소비 import도 함께 되돌리고, 문구 수정 rollback은 코드·canonical copy·시험을 함께 되돌린다. 실제 인수 데이터 정리는 새 runner의 자기 fixture IDs에만 적용하며 사용자 데이터나 operating DB에 cleanup을 실행하지 않는다.

## Definition of Done

- F5-01~14가 모두 확정 inventory의 목적지에 구현되고 모든 요구가 Runtime/Artifact/Verification 표의 사례로 추적된다. 댓글 두 항목은 실제 동작 diff 없이 정정된다.
- M/A/R preflight, old absence/new presence, 타입 alias·symbol export/import 전파, prohibited list 전체 검사와 fresh manifest 조건부 사례가 통과한다. 아키텍처 suppress·same-layer/deep import·서버 표시의 client/Action 노출이 없다.
- 실제 React 동일 인스턴스의 roster/name 사례와 모든 보존 대조군, 5개 Action의 auth/shape/service/CAS/throw 우선순위, 모든 실제 화면 body/href가 확인된다.
- 필수 명령·격리 DB·실제 Next 인수가 성공하고 cleanup 결과까지 report에 기록된다. Flight worker의 fresh bundle/mapping/loader 준비, 응답 EOF·lazy reference·loader settlement, chunk를 포함한 정상 owner 대조군·root.a 성공 뒤 chunk/module 실패 대조군·worker 종료도 포함한다. 미실행·skip·이전 회귀 결과 재사용·status/header만 확인한 결과는 통과가 아니다. schema/config/dependency/generated 수동 수정은 없다.
- 구현을 시작하기 전에 승인자·승인일·승인 범위를 먼저 기록한다. 구현/검증이 끝난 뒤에만 실제 결과·완료 metadata를 기록하고 완료 디렉터리로 이동한다. 이번 문서 reconciliation은 승인이나 구현 완료 조건을 충족했다고 주장하지 않는다.

## Reconciliation Basis and Handoff

2026-10-04의 이번 요청은 이 제안서를 **수정 가능한 source**로 현재 코드에 대조하는 작업이다. 승인된 source bundle은 이 문서 한 개이며 related의 완료 4차 제안서는 배경이다. 구현을 그 문서에 위임하지 않는다. accepted architecture와 product-copy의 직접 관련 절은 현재 계약 근거로 포함했다.

최초 정합성 보완에서는 (1) 신규 파일·시험 목적지 미정 (2) 토큰 서버 UI 추출에 따른 page/public API/route 전파 누락 (3) Board OR binding·roster 요청 snapshot·폼 reset·Action shape/auth/throw·URL 인코딩 계약의 여지 (4) fresh manifest·실제 body·negative boundary·DB/HTTP 완료 게이트 누락이 있었다. 이를 수정하고 남은 문구 선택지와 등록 화면의 기존 목록 GET 의존성도 정리했다. 이후 두 번의 no-edit 검토 뒤 **이번 재검토에서 Flight 소비자의 chunk/module loader 준비와 전체 응답 성공 판정의 누락을 발견**했다. 단순 root.a probe를 전체 revalidation 응답의 준비 근거로 확대한 앞선 판단을 정정하고, 동일 runner의 route별 worker·fresh bundle/SSR mapping·실제 loader·EOF/lazy reference/settlement·실패/cleanup을 위 인수와 Runtime/Artifact/DoD에 전파했다. 14개 개선의 의도·심각도·범위는 바꾸지 않았다. 사용자 제품/인가 정책 선택이 필요한 사항은 남기지 않았으며 애플리케이션 구현 권한은 부여되지 않았다.

재대조 경계는 아래 선언형 recipe로 고정한다. repo 식별자·HEAD·candidate path-set/content signature·최종 문서 SHA-256와 no-edit pass 결과는 **이번 응답의 Minimal Replay Anchor/Durable Receipt**가 식별한다. 문서 자체 hash를 문서 안에 넣어 순환하지 않는다. 재대조 시 source 또는 근거가 바뀌거나 영수증을 잃으면 full INV-1~7을 다시 수행한다.

```json
{
  "candidateRoots": [
    "src/app",
    "src/fsd/entities/board-item", "src/fsd/entities/pipeline", "src/fsd/entities/project-token",
    "src/fsd/features/create-project", "src/fsd/features/edit-pipeline", "src/fsd/features/manage-token",
    "src/fsd/features/manage-user-token", "src/fsd/features/propose-item", "src/fsd/features/review-gate",
    "src/fsd/pages/board-item", "src/fsd/pages/landing", "src/fsd/pages/project-backlog",
    "src/fsd/pages/project-board", "src/fsd/pages/project-inbox", "src/fsd/pages/project-tokens",
    "src/fsd/pages/user-tokens", "src/fsd/widgets/history-feed", "src/fsd/widgets/turn-banner",
    "src/server/auth", "src/server/agents", "src/server/pipeline", "tests/server"
  ],
  "candidateAnchors": [
    "AGENTS.md", "package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "eslint.config.mjs",
    "docs/architecture/README.md", "docs/architecture/fsd.md", "docs/architecture/system-overview.md",
    "docs/architecture/verification.md", "docs/architecture/protocol.md", "docs/conventions/product-copy.md",
    "packages/core/pipeline.mjs", "packages/core/transitions.mjs", "packages/core/token-validity.mjs",
    "src/server/project.ts", "src/server/db.ts", "src/server/entitlement.ts", "src/server/token-management-query.ts", "src/server/github.ts",
    "src/fsd/shared/api/result.ts", "src/fsd/shared/lib/relative-time.ts", "src/fsd/shared/routes/project.ts",
    "prisma/schema.prisma", "scripts/verify-fsd-boundaries.mjs", "scripts/test-server-integration.mjs",
    "scripts/rehearse-src-clean-code.ts", "scripts/rehearse-src-clean-code-fourth-pass.ts"
  ],
  "runtimeAnchors": [
    "node_modules/next/package.json", "node_modules/react/package.json", "node_modules/react-dom/package.json",
    "node_modules/typescript/package.json", "node_modules/zod/package.json", "node_modules/@prisma/client/package.json",
    "node_modules/next/dist/docs/01-app/02-guides/server-actions.md",
    "node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md",
    "node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md",
    "node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md",
    "node_modules/next/dist/compiled/react-server-dom-webpack/client.node.js",
    "node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.development.js",
    "node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js",
    "node_modules/next/dist/server/app-render/action-handler.js",
    "node_modules/next/dist/build/templates/app-page.js",
    "node_modules/next/dist/build/templates/app-page-runtime.js",
    "node_modules/next/dist/server/app-render/app-render.js",
    "node_modules/next/dist/server/app-render/use-flight-response.js",
    "node_modules/next/dist/server/require.js",
    "node_modules/next/dist/server/app-render/react-server.node.js",
    "node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.edge.production.js"
  ],
  "observedGenerated": [
    ".next/server/app-paths-manifest.json",
    ".next/server/app/(app)/p/[slug]/backlog/page.js",
    ".next/server/app/(app)/p/[slug]/inbox/page.js",
    ".next/server/app/(app)/p/[slug]/items/[key]/page.js"
  ],
  "closure": "rg --files <all candidateRoots>; add candidateAnchors, runtimeAnchors and observedGenerated; normalize to POSIX; unique ordinal sort",
  "pathSetDigest": "SHA256(UTF8(paths.join('\\n') + '\\n'))",
  "contentDigest": "SHA256(concat(UTF8(path), NUL, raw file bytes, NUL) for each sorted path)",
  "plannedPresence": "preflight every A and R target in Affected Files, including case-insensitive collisions",
  "safeReplay": "read-only inventory, bytes/digests, TS AST imports/exports, package JSON/scripts parsing; no execution of app/Action",
  "manifestOnly": "future M/A/R contract, npm verification commands, fresh-build route/client/action manifest assertions",
  "volatileNonReplayable": "future real browser, authenticated POST, isolated DB acceptance, remote GitHub file existence"
}
```

추적 항목은 `gateActionLabel/gateActionHint`, `TokenRow/TokenTable`, 세 page composition, 5개 schema/Action, `loadProjectBoard/buildBriefing`, `blobHref/statusLabel/nodeLabel`, `addSlot/moveSlot`, 그리고 Artifact Map의 route/manifest다. inventory와 별도로 전 `src`의 import/export AST를 통해 이 심볼들의 외부 소비·public API provenance를 대조하여 같은 좁은 파일 검색만 반복하지 않는다. 이 closure 검사는 읽기 전용이다. runtimeAnchors는 ignored 설치 의존성이므로 파일별 content identity도 영수증에 포함한다. 실제 Zod safeParse의 null/date 타입 거부·추가 필드 strip과 단순 Flight의 root.a 복원에 더해, client-reference/chunk를 포함한 메모리 Flight의 loader 누락 실패 및 loader 연결 후 root.a/reference 복원·두 loader 호출·global 복원을 확인했다. 비동기 chunk 거부와 module require throw에서는 root.a가 성공해도 lazy reference 복원이 각각 실패하는 점도 확인했다. 미래 schema 구현 시험·제품 bundle 로딩·실제 Next POST를 통과했다는 뜻은 아니다. observedGenerated 4개는 과거 build의 route-map/진입 파일 구조만 읽은 관측이며 fresh build/런타임 export 준비의 authority로 쓰지 않았다.

범위 밖/미실행 근거를 분리한다. 서비스 transaction·core 정책·DB schema는 unchanged guard로 검증한다. 새로운 cache/metadata/asset/config owner는 없으며 빈 Next 설정과 기존 route tree가 근거다. GitHub 원격 존재·운영 DB·배포 성공은 제안의 로컬 인수에서 보장하지 않는다. 현재 미래 코드/새 build/브라우저/HTTP/DB 실행은 Not run이며, 구현이 지연된 후에는 fresh build와 격리 인수로 반드시 새 증거를 만든다. clean 문서 판정은 검토 범위의 구현 지시 정합성만 뜻하고 결함 부재·구현 완료·실행 승인으로 확대하지 않는다.

### Replay Anchor / Durable Receipt의 고정 근거

- opaque repository: `9facb7db567781ed63fc`; HEAD: `77ad552509e421402c98f509706d2410a8735a06`.
- 범위/단계/프로필: F5-01~14 Core · 문서 정합성 검토/후속 구현 전 · High-Risk.
- 위 closure로 얻은 candidate: **289개**; path-set SHA-256: `8539e8efbe513320a8eeacd1c14cadf282cd17cb7833764d9b7094ad9cf4f0f9`.
- candidate raw content SHA-256: `73fefaa9f67cee5dfd657f8999a6a2226bdc0b3a57648bba4e227ed3c4394069`. 이 문서의 최종 SHA-256는 no-edit 검토 후 응답에서 기록한다.
- 독립 closure: 전 src의 334개 TS/TSX/MJS AST에서 추적 심볼의 import/export 40개; ordinal 경로 순서·문장 원문을 가진 JSON 배열의 SHA-256: `8c9d2c06dfcd848b18b0494a058125491af46655efac40c1c7902dde0b756eea`.
- safe-replay는 위 inventory/AST/JSON/byte 검사다. 메모리 library probe는 Zod의 null/date 타입 거부·extra field strip과 Flight의 단순 root.a 및 chunk/module loader 누락 실패·연결 후 복원/호출/global cleanup을 확인한다. worker의 실제 제품 bundle 준비와 정상 POST는 미래 인수에서 확인한다. 미래 build/test 명령은 manifest-only, DB/HTTP/browser/원격 상태는 volatile-non-replayable이며 자동 replay하지 않는다.
- 위험 경계는 Action Input Contract와 모든 Runtime/Artifact/Verification 표의 행이다. source 결정과 현재 owner/projection/guard/exception 계약을 대조했으며 실제 인수 결과는 구현 시 새로 획득한다. 기존 Github repo 목록 조회는 실패 복구를 보존하며 원격 성공 자체를 보장하지 않는다.
- 남은 구현 위험과 폐쇄 경로는 Risks and Rollback 및 필수 Verification Plan에 연결했다. 문서 검토의 unresolved 여부·최종 no-edit 여부는 응답이 기록한다. HEAD/파일 집합/내용/설치 의존성이 바뀌면 이 근거는 다시 대조해야 한다.
- non-HEAD: 제안서는 untracked이며 최종 응답의 source hash로 식별한다. 아래 ignored runtime dependency 21개와 과거 build 관측 4개는 파일별 hash로 식별한다. 그 밖에 이 candidate 집합 안의 staged/unstaged/untracked 수정은 없다. 다른 작업의 docs 변경은 범위 밖이며 유지했다.
- Redaction: credential/원격 URL/사용자 데이터 없음; 경로는 repository-relative. Persistence: 사용자 지정 제안서의 이 절에 근거를 보존하며 최종 source identity와 판정은 응답에 보존한다.
- 한계: 기록 범위에서 과거 판정의 적용 가능성을 대조하는 근거다. 완전성·정확성·결함 부재·구현 승인/완료를 증명하지 않는다.

| ignored runtime dependency | SHA-256 |
| --- | --- |
| `node_modules/next/package.json` | `3ae720e4b8cdad7503935b27b0d14e04390068bf10d6e685797ccf1044051967` |
| `node_modules/react/package.json` | `e40c3ed9b633c9ecf188e09a4be309780a1ea0a9c068278a30ff6a27e7b2dbb6` |
| `node_modules/react-dom/package.json` | `7c82f0967114d4b5d38b1f07e543af87c9919e8d3243f9604004819319cb2200` |
| `node_modules/typescript/package.json` | `822ef7ca6452205657b6288b066481ecf508bfbf43455d715cf7d3ec457561e6` |
| `node_modules/zod/package.json` | `bf8409c9c2b90652cad4a02a2478ac618cc731318fc378ca4c3536ec502d8482` |
| `node_modules/@prisma/client/package.json` | `974ee2fedaddb6f7707ba2dc0c4d95219be80d6e952034ba9d5d10c68eddc9a7` |
| `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` | `8063a28cde0495a61c5ac195b0b769d86a10740a673facdc5f3e2f80f0e59b77` |
| `node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md` | `8f689eab26b887c81ae2dba18d681fd7af0b6ea5bcaedcfe59e807bd7da2e854` |
| `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` | `974155c3f4fa1a539b1a5fd924faaf49289b9f34742611caeaa3c0955368d0eb` |
| `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` | `82b4f0888f1d1113c2e0e1a867983a88ce02bbf9419570e3710fe7fe4ccd2c02` |
| `node_modules/next/dist/compiled/react-server-dom-webpack/client.node.js` | `704a07592993924515710e08c9365e8d6b49d96df54166b869f0210d004b8685` |
| `node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.development.js` | `45de09f2bde1c3c4424c0a54301e138d1a5e9fed3a798704aaf71b7916dd16b0` |
| `node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js` | `de4281dcc88b80e20cdb92a5716ad2add899704358a22008dfe9adfc8c729388` |
| `node_modules/next/dist/server/app-render/action-handler.js` | `d759c976167885f0d28a07d9404bf537e11b37ed14b136509165bde040b36130` |
| `node_modules/next/dist/build/templates/app-page.js` | `91aed782b425996d1baea340a4b2752ca9397c8de19a8a67d36b3b5aa4fecb04` |
| `node_modules/next/dist/build/templates/app-page-runtime.js` | `379ec94e6493f454cf8f21ead0bf43f366f911ba9f25b5e12e4fde0401dcca6e` |
| `node_modules/next/dist/server/app-render/app-render.js` | `03ad1f5daa243d67c3a1ce7d11a25db6ff7620431a993ed7d081ca61ac84d0d8` |
| `node_modules/next/dist/server/app-render/use-flight-response.js` | `391c824c655779711fba0130574ed00c5720b9c4e262d3b40d4af78daf973638` |
| `node_modules/next/dist/server/require.js` | `c4ea56c67a3f7a049f36c09d0a4ebc09ddf0ca30ea78885016033186410d3875` |
| `node_modules/next/dist/server/app-render/react-server.node.js` | `dc284f03403f0e08d2d4ef0ec797a08cbe682cdf009971771f00e7528ac9fbd5` |
| `node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.edge.production.js` | `6c316e183cd017870fde55c8fd964517f2ddbb41de7bfcb3c820f906d6a26258` |

| ignored 과거 build 관측 — 실행 결과로 사용하지 않음 | SHA-256 |
| --- | --- |
| `.next/server/app-paths-manifest.json` | `2c44cc767e59c385f6a1588975b721463b05e62210f882a8099e9937b949aae5` |
| `.next/server/app/(app)/p/[slug]/backlog/page.js` | `4f796d488036909273ffa5d540c0b0174b0a4932945debdd90dd14fad8c5a423` |
| `.next/server/app/(app)/p/[slug]/inbox/page.js` | `69abf0a9bf32f0e91ecac02565720da1c30fe7ef1800cfc97609cc06221a9d47` |
| `.next/server/app/(app)/p/[slug]/items/[key]/page.js` | `d054e7f7a4902f4f27ccddfebc754cab65957490b8fb2990948c09a03bd0bf9b` |

## Review Coverage and Traceability

**Coverage: Full applicable-lens review — 5개 applicable 완료, Gate-validated N/A 0개.** 채택 기여가 없는 렌즈, unavailable/skipped, Needs human judgment는 없다.

| 렌즈 | 상태 | 원시 발견 | 최종 기여 |
| --- | --- | ---: | --- |
| Cohesion | Complete | 2 | F5-01, F5-02 |
| Coupling | Complete | 2 | F5-03, F5-04 |
| Predictability | Complete | 3 | F5-05, F5-06, F5-07 |
| Readability | Complete | 3 | F5-08, F5-09, F5-10 |
| TypeScript generalist | Complete | 4 | F5-11, F5-12, F5-13, F5-14 |

| 원시 ID | 제안 심각도 | 최종 ID | 게이트 disposition | 최종 심각도 | 핵심 판정 근거 |
| --- | --- | --- | --- | --- | --- |
| COH-01 | Should | F5-01 | accept | Should | 실제 데모의 문구 표류와 순수 API의 기존 소유권 |
| COH-02 | Should | F5-02 | accept | Should | 세 사용처에서 동일 표시 책임·변경 방향 확인 |
| CPL-01 | Must | F5-03 | accept | Must | 지원되는 null-key 슬롯 실행이 조회에서 누락 |
| CPL-02 | Consider | F5-04 | accept | Consider | client-safe 진입점 규약과 서버 composition 불일치 |
| PRE-01 | Should | F5-05 | accept | Must | 로스터 갱신의 정상 흐름에서 제출이 막힐 수 있음 |
| PRE-02 | Consider | F5-06 | accept | Consider | 상속 속성으로 문자열 fallback 계약 위반 |
| PRE-03 | Consider | F5-07 | accept | Consider | 실제 validator가 잘못된 ID 조작을 수용 |
| RDB-01 | Must | F5-08 | accept | Must | 보류 커서를 검증 실행 자격으로 오해 |
| RDB-02 | Consider | F5-09 | accept | Consider | 인가 주석이 소유권·가용성·폐기 차이를 지움 |
| RDB-03 | Consider | F5-10 | accept | Consider | 주석의 status와 실제 gate ID 기준 충돌 |
| TS-01 | Should | F5-11 | accept | Must | 명시적 초기화 후 다른 프로젝트에 이전 이름 제출 |
| TS-02 | Should | F5-12 | accept | Should | malformed 입력의 예상 실패 계약 누락 |
| TS-03 | Should | F5-13 | accept | Should | 제안 시각을 검토 진입 시각으로 표현 |
| TS-04 | Should | F5-14 | accept | Must | 허용된 파일 경로의 예약 문자가 문서 열기를 깨뜨림 |

F5-03·F5-08·F5-13은 같은 Board 영역을 다루지만 원인은 실행 binding·hold 후보 필터·시각 의미로 달라 병합하지 않았다. F5-01과 F5-10도 문구 소유권과 낡은 주석이라는 다른 원인이다. 게이트는 PRE-01·TS-01·TS-04를 구체적인 정상 흐름의 결함에 따라 Must로 조정했으며, 렌즈 동의 수를 근거로 높이지 않았다.

## Completion or Closure Notes

F5-01~14의 애플리케이션 변경과 지정된 회귀 시험·인수 runner를 구현했다. 승인 metadata는 사용자 요청을 반영했다. 필수 검증이 모두 끝나기 전에는 `active/`, `status: pending`, `stage: implementation`을 유지한다. 현재 통과·미실행 결과는 Verification Results와 연결된 test report가 기준이며, 완료 metadata와 문서 이동은 전체 게이트 통과 후에 기록한다.

## Review Checklist

- [x] 요청된 `src`를 다섯 독립 관점과 중립 게이트로 검토했다.
- [x] 현재 소스·로컬 런타임·accepted architecture를 판단 기준으로 삼았다.
- [x] 모든 채택 항목에 줄 근거·영향·최소 변경·완료 기준을 연결했다.
- [x] 원시 ID·최종 ID·심각도 조정·기여 관점을 추적했다.
- [x] 영향 범위·안전성·실행 순서·검증·롤백을 작성했다.
- [x] 리뷰 증거 확인과 미래 구현의 테스트 결과를 구분했다.
- [x] 승인·완료 상태를 문서 위치와 일치시켰다.
- [ ] 후속 애플리케이션 구현과 필수 검증을 수행하고 실제 결과를 기록했다.
