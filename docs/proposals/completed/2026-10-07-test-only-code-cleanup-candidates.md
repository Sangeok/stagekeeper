---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-06"
approved-by: "requester"
approved-at: "2026-10-07"
approval-scope: "C02·C03 구현; C01은 제외하고 기존 구현·테스트 유지"
completed-at: "2026-10-07"
verification-summary: "FSD/check/build 통과; architecture 44 pass·2 skip, web 579 pass, server 55 pass·1 skip; 실제 ui-only 인수 35 Pass와 상태·복사·종료·재진입 확인"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-10-05-dead-code-removal-candidates.md"
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
---

# 테스트에서만 사용하는 제품 코드 정리 후보

## Summary

2026-10-06 추가 감사에서는 삭제를 확정할 고립 파일이나 불필요한 의존성을 새로
발견하지 못했다. 현재 제품 실행 경로에서는 호출되지 않고 테스트·브라우저 fixture가
사용하는 함수·컴포넌트·상수 3개를 낮은 우선순위 정리 후보로 확인했다.

이 제안은 `codexMcpCommand`의 미사용 제품 경로 제거, `NextStepBox`의 테스트 fixture
이동, `PLAN_COUNT` 계산의 테스트 이동을 다룬다. 테스트의 존재만으로 코드가 제품에서
사용된다고 판단하지 않되, 현재 테스트 소비자를 무시하고 즉시 삭제하지도 않는다.
최초 요청의 산출물은 이 문서였으며, 후속 구현 요청에 따라 C02·C03를 실제 코드에
적용하고 검증했다. C01은 명시적인 제거 선택이 없는 Approval-after 항목이므로
이번 적용 범위에서 제외하고 기존 구현·테스트를 유지했다.

아래 후보 표와 실행·검증 계획은 구현 전 기준을 보존한 기록이다. 실제 완료 범위와
최신 코드 기준은 `Verification Results — 실제 구현 후` 및 `Completion or Closure Notes`를 따른다.

## Goal

테스트 편의를 위한 코드를 실제 사용처 가까이 두고 제품 모듈의 공개 범위를 줄인다.
토큰 연결 안내, 클라이언트 선택, 다음 단계 안내, 플랜 표와 관련 회귀 검증은 보존한다.
번들 크기나 성능 개선을 목표로 삼지 않으며, 그러한 개선량을 측정한 근거도 없다.

## Proposal Size

저장소 기준의 `proposal-size`는 **standard**다. 이번 reconciliation의 Review Profile은
**High-Risk**다. 변경의 제품 중요도는 낮지만 C02가 상태 소유권을 fixture로 옮기고,
브라우저 최종 산출물과 검증 목적지를 함께 확인해야 하기 때문이다.
개별 후보의 중요도는 낮지만 삭제와 테스트 이동이 있고, 모두 적용하면 기존 파일
7개를 함께 수정해야 한다. 새로운 파일·폴더나 배포 단계는 필요하지 않다.

## Current State and Evidence Baseline

### 최초 감사의 역사적 기준

- 감사일 및 문서 작성일: 2026-10-06.
- branch: `harness/dead-code-cleanup`.
- HEAD: `13a39b14009d672868d2a2b3df1566ccb2651505`.
- 문서 작성 전 추적·미추적 작업 트리: clean.
- HEAD에는 [2026-10-05 정리](../completed/2026-10-05-dead-code-removal-candidates.md)의
  미사용 선언·재export 제거가 반영되어 있다. 그 문서의 제거 전 후보는 이번 신규 대상이 아니다.
- TypeScript Compiler API의 미사용·도달 불가 진단 검사: 추적 TS/JS 파일 485개.
  생성 코드와 `plugin/lib` 복사본, private 템플릿은 해당 검사에서 제외했다.
- 전체 참조 그래프: 기존 저장소 밖 Temp에 설치된 Knip `6.39.0`을 사용했다.
  테스트·운영 스크립트 진입점을 포함한 분석과 제품 경로 분석을 대조했다.
  프로젝트 의존성이나 설정에는 도구를 추가하지 않았다.
- 후보별로 선언, 정적 import, 재export, 테스트·스크립트·fixture 및 로컬 private
  템플릿의 문자열 참조를 검색하고 실제 소비자 코드를 읽었다.

위 항목과 아래 `Verification Results — 변경 전 감사`는 최초 조사 기록이다.
현재 checkout이 그 HEAD이거나 clean이라는 뜻은 아니다.

### 직전 문서 검증의 역사적 기준

- 검증일: 2026-10-06.
- branch: `harness/qa-verifier`.
- 최종 기준 HEAD: `c54ee73d2f85b7064a169ac908829c92c1261a76`.
- 최종 기준 작업 트리: 추적 파일은 clean이고 이 제안서만 untracked다.
  검증 시작 시에는 `f0dd023eff4ae83e778e39d1db720005c3bb3bf6`에 다른 작업의 staged
  변경과 `plugin/runtime/codex-thread.mjs`의 병합 충돌이 있었으나, 검증 중 다른 작업의
  병합 커밋에 반영됐다. 이번 문서 작업은 그 변경·충돌·index를 수정하지 않았다.
- 후보별 현재 소스·전체 소비자 검색·public API·테스트·브라우저 진입점을 재확인했다.
  당시 수정은 이 문서 하나에 한정한다. 최초 Knip·485개 파일 검사·전체 lint 결과를
  현재 checkout에서 다시 실행한 결과로 표시하지 않는다.
- 실행 전에는 승인 범위에 맞는 `harness/<topic>` 작업 공간을 `dev`에서 준비하고,
  병합 충돌과 다른 작업의 변경을 분리한 뒤 새로운 구현 기준 HEAD를 기록한다.
  충돌이 새로 발생하면 이 정리 작업에서 임의 해결하지 않는다.

### 2026-10-06 문서 재검증의 역사적 기준

- 재검증일: 2026-10-06.
- branch: `harness/agent-corrections`.
- HEAD: `c78b8d013de14a3c63955faa60802b29dec5710d`.
- 추적 파일은 clean이다. 이 문서와 별도 작업의 `docs/proposals/active/impl-verifier.md`가
  untracked이며, 별도 문서는 이번 검증·수정 범위에서 제외한다.
- C01–C03의 선언·소비자·공개 경로를 재확인했다. 실제 제품·테스트 파일은 수정하지 않고,
  7개 파일의 제안 변경을 메모리 overlay로만 적용해 타입·번들·브라우저 동작을 비교했다.
  이 검증은 C01 제거 승인이나 실제 코드 구현을 대신하지 않는다.
- 설치 도구는 Next.js 16.3.3, React/ReactDOM 19.2.8, TypeScript 5.9.3,
  esbuild 0.28.2, tsx 4.23.12다. 새 의존성·설정·인증을 추가하지 않았다.

이 문서에서 **Observed**는 해당 기준의 소스와 실행 출력에서 확인한 사실,
**Contracted**는 현재 저장소 규칙, **Inferred**는 그 근거 범위 안의 정리 권고다.
후보 표의 줄 번호는 탐색 보조이며, 구현과 판정은 경로·심볼을 기준으로 한다.

현재 구현 계약은 이 문서, `AGENTS.md`, `docs/architecture/README.md`, `fsd.md`,
`verification.md`, `docs/proposals/README.md`와 제품 문구 잠금 규칙이다.
완료된 정리 제안서는 역사적 참고이며 현재 작업 지시를 위임하는 상세 계획이 아니다.
브라우저 검증은 아래에 특정한 `--ui-only` 경로만 사용한다. 아키텍처 문서의 DB·fault
리허설 전체를 이 제안의 필수 인수에 추가하지 않는다.

## Scope

포함 범위는 아래 C01–C03과 그 소비자 테스트·fixture의 정합화다.
각 후보는 독립적으로 선택할 수 있으나, 선택한 후보의 테스트 정리는 같은 변경에 포함한다.

- **Core 검토 범위:** C02·C03. 적용 승인 시 기존 파일 5개를 수정한다.
- **Approval-after:** C01. 후속 구현 지시에서 제거를 명시적으로 선택한 경우에만
  기존 파일 2개를 추가한다. 선택하지 않으면 구현·테스트를 그대로 유지한다.
- C01의 향후 제품 표시 의도가 미확정이어도 C02·C03의 계획 검증을 막지 않는다.
  이 구분은 구현 승인을 대신하지 않으며 C02·C03 각각을 제외할 수도 있다.

다음은 제외한다.

- 제품에서 사용 중인 `codexOwnerMcpCommand`, `codexConnectionCommand`,
  `NextStepContent`, `TurnBanner`, `PLAN_IDS`, `planMatrix`의 동작 변경.
- 라우트, 인증, MCP·Server Action 계약, DB schema·migration, 제품 문구 변경.
- core 원본 및 `plugin/lib` 복사 정책 변경, 생성 코드·private 템플릿 변경.
- 의존성 추가·삭제·업그레이드, CI·프로젝트 설정 변경, 릴리스·배포.

## Proposal

| ID | 후보와 현재 위치 | Observed 근거 | Inferred 권고 및 보존 조건 |
| --- | --- | --- | --- |
| C01 | `src/fsd/entities/project-token/model/connect-command.ts:75` — `codexMcpCommand` | 저장소에서 호출하는 곳은 `connect-command.test.ts:11`뿐이다. 실제 `token-reveal.tsx`는 이 함수를 import하지 않는다. `owner-token-reveal.tsx:27`은 별도 `codexOwnerMcpCommand`를 사용한다. | 에이전트 MCP 등록 명령을 제품에 표시할 계획이 없다면 wrapper를 제거한다. 테스트에서 해당 import와 agent 명령 assertion만 정리하고 owner 명령 생성·URL 검증과 관련 테스트는 유지한다. |
| C02 | `src/fsd/widgets/turn-banner/ui/next-step.tsx:15` — `NextStepBox` | `next-step.test.mjs:13,27`과 `tests/server/fixtures/src-clean-code-browser.tsx:109`만 사용한다. 실제 `turn-banner.tsx:41`은 자신의 client 상태를 `NextStepContent`에 전달한다. | 독립 client 상태 wrapper를 기존 브라우저 fixture 안의 컴포넌트로 옮긴다. 단위 테스트는 `NextStepContent`에 client와 handler를 전달한다. 제품의 `NextStepContent`와 `TurnBanner`는 유지한다. |
| C03 | `src/fsd/shared/lib/entitlement-copy.ts:44` — `PLAN_COUNT` | `entitlement-copy.test.ts:7`의 플랜 누락 검증에서만 사용한다. 값은 `Object.keys(LIMITS).length`다. | 계산을 테스트로 옮겨 core의 `LIMITS`를 직접 대조한다. 제품 모듈의 상수와 전용 `LIMITS` import를 정리하되, 모든 플랜·표 행이 포함되는 검증은 유지한다. |

C01의 제품 표시 계획은 **Unresolved**다. 현재 참조 부재는 확인됐지만 향후 사용 의도를
코드만으로 확정할 수는 없다. 후속 구현 지시에서 C01 제거를 선택하면 현재 제품 경로
기준으로 정리하고, 유지 의도가 있으면 C01만 제외한다. 문서 작성에는 영향이 없다.
따라서 C01은 Core 구현의 미해결 placeholder가 아니라 승인 이후의 선택 항목이다.

## Affected Files

| 후보 | 수정 가능한 파일 | 변경 경계 |
| --- | --- | --- |
| C01 | `src/fsd/entities/project-token/model/connect-command.ts` | `codexMcpCommand`만 제거. 다른 명령 생성·검증은 보존. |
| C01 | `src/fsd/entities/project-token/model/connect-command.test.ts` | C01의 import·assertion과 부정확해진 테스트 이름만 정리. |
| C02 | `src/fsd/widgets/turn-banner/ui/next-step.tsx` | `NextStepBox`와 그 전용 `useState` import만 제거. |
| C02 | `src/fsd/widgets/turn-banner/ui/next-step.test.mjs` | 기존 렌더·문구·Copy 개수·빈 목록 검증을 `NextStepContent`로 유지. |
| C02 | `tests/server/fixtures/src-clean-code-browser.tsx` | 기존 wrapper를 fixture 안으로 이동하고 `id="next"`, 기본 client와 선택 동작 유지. |
| C03 | `src/fsd/shared/lib/entitlement-copy.ts` | `PLAN_COUNT`, 바로 위 전용 설명 주석, 전용 `LIMITS` import만 제거. |
| C03 | `src/fsd/shared/lib/entitlement-copy.test.ts` | `LIMITS`의 플랜 수를 테스트에서 계산해 기존 누락 검증 유지. |

### 파일 작업 사전 확인과 import/export 경로

7개 파일과 부모 디렉터리는 현재 모두 존재한다. 파일 자체의 생성·이동·삭제·rename은
없고, C02의 **컴포넌트 선언만** 기존 fixture로 이동한다. `NextStepFixture`라는 선언은
현재 검색 범위에 없어 충돌하지 않는다. 적용 직전 같은 확인을 반복한다.

| 심볼 | 현재 owner / 공개 경로 | 적용 후 목적지·import | 판정 목적지 |
| --- | --- | --- | --- |
| `codexMcpCommand` | C01 모델의 named export; entity `index.ts`에서 재export하지 않음 | C01 선택 시 모델 export·같은 폴더 테스트 import·agent assertion 제거. 대체 제품 export 없음 | 전체 소비자 재검색, C01 모델·테스트 diff, owner 모델/화면 테스트 |
| `codexOwnerMcpCommand`, `codexConnectionCommand`, `AGENT_TOKEN_VARIABLE` | 같은 모델; owner UI는 상대 경로로 owner 함수 import; 공통 helper는 private | 현재 위치 유지. `AGENT_TOKEN_VARIABLE`은 connect/save/profile의 기본값에도 필요하므로 제거 금지 | `connect-command.test.ts`, `ui/token-reveal.test.ts`, 변경 범위 diff |
| `NextStepBox` → `NextStepFixture` | C02 UI의 named export; widget `index.ts`에는 없음 | fixture 파일의 모듈 최상위 private 함수. 기존 상대 경로 import를 `NextStepContent`로 바꾸고 `#next`에서 private 함수 사용 | C02 단위 테스트, fixture 소스·번들, 브라우저 `#next`, 이전 심볼 부재 |
| `NextStepContent` | C02 UI의 named export; 제품은 같은 slice에서 `./next-step` import | 제품 public API·body 유지. 단위 테스트는 `./next-step.tsx`, fixture는 `../../../src/fsd/widgets/turn-banner/ui/next-step`에서 import | `next-step.test.mjs`, `turn-banner.test.ts`, 브라우저 결과 |
| `useState`, client/steps 타입 | React 및 `NextStepContent` props | UI의 `useState` import만 제거. fixture의 기존 `useState`와 `Parameters<typeof NextStepContent>[0]`을 사용; 새 모델 deep import 불필요 | 대상 타입 검사·fixture 번들. UI의 `ReactElement`, `NextStep`, `RuntimeClient`는 유지 |
| `PLAN_COUNT` → 테스트 내부 계산 | C03 제품 라이브러리의 named export | 테스트에 `import { LIMITS } from "@harness/core/entitlement.mjs"`; 기존 assertion의 우변만 `Object.keys(LIMITS).length`로 교체 | C03 테스트·전체 소비자 재검색, 제품 모듈의 상수/전용 import 부재 |

테스트 fixture의 제품 내부 상대 경로 import는 현재 검증 도구의 기존 경로다.
이를 제품 public API로 재export하거나 제품 slice에 fixture를 넣지 않는다.
`src/fsd/entities/project-token/index.ts`와 `src/fsd/widgets/turn-banner/index.ts`는 수정하지 않는다.

## Safety Analysis

**Observed:** 세 후보 모두 소비자가 있으므로 저장소 전체에서 완전히 사용되지 않는
코드로 분류하지 않는다. 제품의 일반 화면 경로에는 연결되지 않으며 소비자는 테스트
또는 테스트 fixture로 한정된다. 파일 전체 삭제나 FSD public API 배럴 수정은 제안하지 않는다.

**Contracted:** 제품 코드는 `src/fsd`에 두고 다른 slice는 public API를 통해 사용한다.
테스트 fixture는 기존 `tests/server/fixtures`에서 유지한다. 아키텍처 경계의 예외를
새로 만들거나 검사기를 우회하지 않는다.

C02 이동 후 fixture는 기존과 같이 client를 `claude`로 시작하고 선택 값을
`NextStepContent`에 전달해야 한다. 제품 `TurnBanner`의 client 상태·slug 변경 시
remount 동작과 Copy 버튼의 비동기 성공·실패·unmount 처리에는 변경을 가하지 않는다.
빈 단계 목록에서는 상자와 안내가 표시되지 않아야 한다.

### 런타임 보존 계약

| 입력·상태 / 동작 | 적용 후 기대 전이 | 검증과 경계 |
| --- | --- | --- |
| fixture를 새로 mount | 모듈 최상위 `NextStepFixture`의 client가 `claude`; radio 변경은 setter를 거쳐 content와 Copy payload에 반영 | 브라우저 client copy matrix. wrapper를 `CopyFixture` 내부에 선언하거나 매 렌더 다른 key를 부여하지 않음 |
| 같은 fixture에서 `Change text` | steps의 A→B 변경에도 선택 client 유지; 다음 명령에 최신 note 사용 | `#next` 수동 확인. props 변경에 따른 불필요한 remount 금지 |
| 빈 steps | `NextStepContent`가 `null`; 상자·radio·안내·Copy 없음 | 기존 빈 목록 단위 테스트를 controlled content 대상으로 유지 |
| Copy 중 연속 클릭 / 실패 | 기존 ref lock·disabled 유지; 실패 시 `Copy`로 돌아와 재시도 가능; 새 문구에 이전 성공의 `Copied` 표시 없음 | 브라우저 copy lifetime 및 `#next`의 pending 중 text 변경 수동 확인. `copy-button.tsx`는 수정하지 않음 |
| Copy pending 중 fixture 종료·재진입 | 기존 cleanup에서 root unmount·pending resolve·clipboard 복구. 새 root는 기본 Claude 상태이며 이전 pending 잠금 없음 | acceptance의 case별 cleanup, `Finish`/pagehide, 수동 재진입 확인. 타이머·listener·effect 추가 없음 |
| 제품 TurnBanner의 setup→work / 탭 변경 / slug 변경 | setup·work와 Board·Inbox·compact 탭 사이에는 선택 유지; `key={slug}` 변경 시 Claude로 reset | 기존 banner client lifecycle. 실제 `turn-banner.tsx`와 모델은 수정하지 않음 |
| owner Codex 연결 | 기존 owner endpoint·환경 변수 참조·URL 거부/quoting 유지; client 선택 자체는 서버 mutation을 만들지 않음 | owner 모델·화면 테스트와 owner client selection / owner identity reset |
| 플랜 렌더 | `PLAN_IDS`, `planMatrix`, 행 순서·값·Unlimited·BILLING_NOTE 동일; 계산은 테스트에서만 수행 | C03 테스트 및 BillingPage 소비 경로/body 확인 |

Next.js 16.3.3의 설치 문서
`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`와
`node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md`에 따라
제품 content의 `"use client"`를 유지한다.
fixture는 Next route가 아닌 `createRoot` 브라우저 진입점이므로 새 route/directive를 만들지 않는다.
React의 [상태 보존·초기화 규칙](https://react.dev/learn/preserving-and-resetting-state)도
대조했다. 같은 위치의 같은 컴포넌트는 상태를 유지하고 key/컴포넌트 identity가 바뀌면
초기화되므로, 새 wrapper는 모듈 최상위에 두고 props 변경마다 key를 바꾸지 않는다.

### 최종 산출물과 검증 위치

| 최종 산출물 | 실제 body의 출처·우선순위 | 본문 의존성 / 인수 목적지 |
| --- | --- | --- |
| 제품 다음 단계 안내 | `turn-banner.tsx`의 상태 → `NextStepContent` → `formatNextStep`. fixture wrapper는 제품 경로를 덮어쓰지 않음 | `model/turn.ts`, `model/next-step.ts`, core `client-runtime.mjs`, shared Code/CopyButton/RuntimeClientChoice. UI 단위 테스트 및 실제 TurnBanner를 mount하는 banner client lifecycle |
| 브라우저 `#next` | `src-clean-code-browser.tsx`의 private wrapper → 기존 content. `rehearse-src-clean-code.ts --ui-only`가 이 entry를 esbuild로 bundle하고 `/fixture.js`로 제공 | 기존 acceptance runner와 React/ReactDOM·Next context. `next/link`만 스크립트의 fixture link stub 사용; clipboard/action은 double. 브라우저에서 표시 본문·선택·복사 payload와 `/results` JSON을 확인 |
| owner 연결 안내·플랜 표 | 기존 `owner-token-reveal.tsx` / `pages/billing/ui/billing-page.tsx`가 각각 기존 모델을 소비 | owner public API·core entitlement·제품 문구 잠금 유지. owner 렌더 테스트 및 C03 모델 테스트와 BillingPage의 `PLAN_IDS`/rows 렌더 경로. 새 route·generated output·asset 없음 |

번들 생성 성공과 정적 HTML 검사만으로 hydration·클릭·clipboard 인수를 완료했다고
판정하지 않는다. 제품 route·auth·DB와 fixture의 다른 화면은 코드 변경 대상이 아니며,
기존 fixture 전체 acceptance에서 회귀 여부를 확인한다.

확인한 경계는 Next.js 진입점, 정적 import·export와 배럴, literal dynamic import,
타입 선언, 테스트·운영 스크립트, core/플러그인 복사본, 후보의 초기화·상태 관리다.
계산된 동적 경로나 외부 설치 환경의 임의 deep import까지 무사용을 증명한 것은 아니다.
자산 URL·스토리지·외부 API 동작은 이번 수정 대상에 포함되지 않는다.

### 유지해야 할 분석 후보

| 대상 | 유지 근거 |
| --- | --- |
| `plugin/lib/backlog.mjs`, `pipeline.mjs`, `request-rate.mjs`, `token-validity.mjs`, `transitions.mjs`, `usage-window.mjs` | 플러그인에서 직접 참조하지 않는 복사본 6개다. `scripts/plugin-lib.mjs`는 테스트를 제외한 core의 모든 `.mjs`를 복사·검사한다. 복사본만 삭제하면 drift로 실패하며 원본은 사용 중이다. |
| `@prisma/client` | 생성된 `src/generated/prisma/client.ts:18` 등이 `@prisma/client/runtime/client`를 사용한다. 생성 코드 제외로 발생한 미사용 보고다. |
| `tailwindcss` | `src/app/globals.css:1`의 CSS import와 `postcss.config.mjs`의 PostCSS 경로에서 사용한다. |
| Next.js 예약 파일·설정 export | 설치된 Next.js 문서의 framework 진입점이다. 일반 import가 없다는 이유로 삭제하지 않는다. |
| `packages/core/*.d.mts` | `.mjs`에 대응하는 타입 계약이다. 런타임 함수와 함께 사용 여부를 판단해야 한다. |
| `copy-lock.ts`, `briefing.fixture.mjs`, 테스트 전용 계약 목록 | 실제 테스트가 사용하는 지원 코드다. 테스트 전용이라는 이유만으로 삭제하지 않는다. |

### 의존성 관리 후속 사항

**Observed:** `tests/server/integration/token-usage-migration.test.ts:5`는 `pg`를,
`scripts/rehearse-src-clean-code.ts:12`와 `scripts/rehearse-acceptance-failure.ts:12`는
`esbuild`를 직접 import한다. 두 패키지는 현재 `package.json`에 직접 선언되지 않았다.

**Inferred:** 간접 의존성 변경에 대비해 직접 의존성 선언을 검토하는 편이 좋다.
이는 불필요한 패키지 삭제 문제가 아니다. [제안서 관리 규칙](../README.md)의 의존성
문서 분류에 따라 별도 작업으로 다루며 이 제안의 구현 범위에는 포함하지 않는다.
패키지 종류·버전·lockfile 변경은 이 감사에서 결정하지 않았다.

## Acceptance Criteria and Constraints

### REQ-TESTONLY-001: 소유자 토큰 연결 안내 보존

WHEN 사용자가 소유자 토큰 화면에서 Codex를 선택하면, 시스템은 기존과 같은 owner
endpoint와 `HARNESS_OWNER_TOKEN` 환경 변수 참조를 사용하는 등록 명령을 표시해야 한다.
잘못된 URL scheme·credential·query·fragment를 거부하는 기존 검증도 유지해야 한다.

### REQ-TESTONLY-002: 다음 단계 안내와 클라이언트 선택 보존

WHEN 사용자가 프로젝트의 다음 단계 안내에서 클라이언트를 선택하면, 시스템은 기존과
같은 클라이언트별 명령과 Copy 동작을 제공해야 한다. IF 단계 목록이 비어 있으면,
THEN 시스템은 다음 단계 상자와 안내를 표시하지 않아야 한다.

### REQ-TESTONLY-003: 플랜 표와 누락 검증 보존

The system shall core에 정의된 모든 플랜의 기존 표 행·값·무제한 문구를 유지해야 한다.
기존 테스트의 `PLAN_IDS.length === Object.keys(LIMITS).length`와 각 행의
`PLAN_IDS`별 비어 있지 않은 값 검증을 그대로 유지해야 한다.
개수 비교 하나가 같은 개수의 서로 다른 플랜 ID 집합까지 검증한다고 주장하지 않는다.

### CON-TESTONLY-001: 변경 범위 제한

제품·테스트 변경은 Affected Files의 선택된 후보별 파일로 한정한다.
core·플러그인·라우트·인증·DB·의존성·설정·제품 문구·FSD 배럴은 변경하지 않는다.
후보를 유지하기로 결정하면 그 후보의 구현과 테스트를 모두 유지한다.

## Approval

후속 코드 구현 지시에 따른 승인 범위는 front matter에 기록했다.
C02·C03를 적용하고 C01은 제외했다. 문서 재검증의 완료만으로 코드를 제거한 것이
아니며, 아래 실제 구현 후 결과를 근거로 선택 범위의 완료를 판정했다.

## Execution Plan

### Phase CLEANUP: 선택한 후보와 테스트 소비자 정리

- status: Completed — C02·C03 적용, C01 제외.
- satisfies: REQ-TESTONLY-001, REQ-TESTONLY-002, REQ-TESTONLY-003
- governed-by: CON-TESTONLY-001
- entry criteria: 적용 후보가 승인 범위로 정해지고 현재 소스·참조·작업 트리를 재확인한다.
  충돌 없는 격리 작업 공간에서 기존 변경을 기준 HEAD에 보존하고 `$cleanupBase`를 기록한다.
- exit criteria: 선택한 후보가 제품 모듈에서 정리되고 해당 테스트와 필수 검증이 통과한다.
- stop condition: 새 제품 소비자나 범위 밖 수정 필요가 발견되면 해당 후보를 중단하고 기록한다.

### TASK-CLEANUP-01: C01 wrapper와 테스트 정리

- status: Skipped — 승인된 적용 범위에서 제외하고 기존 모델·테스트 유지.
- satisfies: REQ-TESTONLY-001
- governed-by: CON-TESTONLY-001
- classification: Approval-after. C01 제거가 승인 범위에 없으면 이 Task를 건너뛰고 기존 구현·테스트를 유지한다.
- implementation destination: Affected Files의 C01 두 경로. 함수와 해당 테스트 import·agent assertion만 제거하고 첫 테스트 이름의 `preserves the agent command`를 정리한다.
- verification destination: `src/fsd/entities/project-token/model/connect-command.test.ts`,
  `src/fsd/entities/project-token/ui/token-reveal.test.ts`의 owner 화면 검증.
- stop condition: C01의 제품 사용 의도가 확정되지 않거나 새 제품 소비자가 발견되면 제거하지 않는다.

### TASK-CLEANUP-02: C02 wrapper를 기존 브라우저 fixture로 이동

- status: Completed.
- satisfies: REQ-TESTONLY-002
- governed-by: CON-TESTONLY-001
- implementation destination: C02의 기존 제품 UI·단위 테스트·브라우저 fixture 세 파일.
- verification destination: `src/fsd/widgets/turn-banner/ui/next-step.test.mjs`,
  `src/fsd/widgets/turn-banner/ui/turn-banner.test.ts`, 기존 브라우저 fixture의 `#next`와 실제 TurnBanner 화면.
- stop condition: client 선택·Copy·빈 목록 동작을 보존할 수 없거나 실제 제품 소비자가 생겼으면 이동을 중단한다.

fixture의 import를 아래처럼 교체하고, 함수를 기존 `CopyFixture` **앞의 모듈 최상위**에
둔다. React의 기존 `useState` import를 그대로 사용한다.

```tsx
import { NextStepContent } from "../../../src/fsd/widgets/turn-banner/ui/next-step";

function NextStepFixture({ steps }: Pick<Parameters<typeof NextStepContent>[0], "steps">) {
  const [client, setClient] = useState<Parameters<typeof NextStepContent>[0]["client"]>("claude");
  return <NextStepContent steps={steps} client={client} onClientChange={setClient} />;
}
```

기존 `#next`의 `<NextStepBox steps={...} />`를 `<NextStepFixture steps={...} />`로
교체하고 steps·key·note·섹션 ID는 유지한다. 제품 파일에서는 wrapper 선언과 전용
`useState` import만 제거한다. wrapper 바로 앞의 content 설명은 content에 남긴다.
단위 테스트의 기본/빈 목록 호출은 각각
`createElement(NextStepContent, { steps, client: "claude", onClientChange: () => {} })`와
`createElement(NextStepContent, { steps: [], client: "claude", onClientChange: () => {} })`로
바꾸고 기존 Codex 호출과 모든 assertion은 유지한다.

### TASK-CLEANUP-03: C03 플랜 수 계산을 테스트로 이동

- status: Completed.
- satisfies: REQ-TESTONLY-003
- governed-by: CON-TESTONLY-001
- implementation destination: C03의 기존 라이브러리·테스트 두 파일.
- verification destination: `src/fsd/shared/lib/entitlement-copy.test.ts`.
- stop condition: 테스트의 플랜 누락 검증이 사라지거나 core 수정이 필요해지면 중단한다.

테스트에서 core `LIMITS`를 직접 import하고 첫 assertion을
`assert.equal(PLAN_IDS.length, Object.keys(LIMITS).length)`로 교체한다.
제품 파일의 `PLAN_COUNT`와 그 위 전용 설명 주석, 전용 `LIMITS` import만 제거한다.
`PLANS`, `UNLIMITED`, `limitsFor`, `PLAN_IDS` 및 나머지 테스트는 유지한다.

## Verification Plan

아래는 구현 전 작성한 검증 계획이며 실행 가능한 절차를 보존한다.
실제로 수행한 결과는 각 state와 `Verification Results — 실제 구현 후`에 구분해 기록한다.

### 토큰 연결 회귀

- destination: `src/fsd/entities/project-token/model/connect-command.test.ts`,
  `src/fsd/entities/project-token/ui/token-reveal.test.ts`의 owner 화면 검증 — `npm run test:web`에 포함.
- verifies: REQ-TESTONLY-001
- expected observation: owner 명령·URL 검증·화면 안내 유지. C01 선택 시 제거된 함수의 참조가 없고,
  C01 제외 시 기존 agent 명령 assertion도 유지된다.
- state: Executed — C01을 유지한 모델·owner 화면 검증이 전체 웹 테스트에서 통과했다.

### 다음 단계 안내 회귀

- destination: `src/fsd/widgets/turn-banner/ui/next-step.test.mjs`,
  `src/fsd/widgets/turn-banner/ui/turn-banner.test.ts` — `npm run test:web`에 포함.
  브라우저 fixture 확인은 기존 `node --import tsx scripts/rehearse-src-clean-code.ts --ui-only`를 사용한다.
- verifies: REQ-TESTONLY-002
- expected observation: 기존 문구 잠금·Copy 개수·Codex 명령·빈 목록 테스트가 유지된다.
  fixture의 `id="next"` 화면에서 기본 Claude 상태, Codex 전환, 표시 명령과 복사 값의 일치를 확인한다.
- state: Executed — 기존 단위 테스트와 실제 ui-only 인수 35개, `#next` 상태·Copy·종료·재진입을 확인했다.

### 플랜 표 회귀

- destination: `src/fsd/shared/lib/entitlement-copy.test.ts` — `npm run test:web`에 포함.
- verifies: REQ-TESTONLY-003
- expected observation: 플랜 수를 테스트에서 직접 대조하고 모든 행·플랜 값과 무제한 표시가 유지된다.
- state: Executed — core LIMITS 직접 비교와 기존 모든 assertion을 유지하고 웹 테스트에서 통과했다.

### 이동·삭제의 양방향 및 변경 범위 검증

아래 명령은 C02·C03를 모두 선택한 경우 저장소 루트의 PowerShell에서 실행한다.
하나를 제외했다면 해당 제거 심볼은 검사에서 빼고, 그 후보 파일이 그대로인지 diff로 확인한다.
`rg`의 exit 1은 **일치 없음**, exit 0은 **참조가 남음**, 1보다 큰 값은 **검사 실패**다.

```powershell
rg -l --hidden --no-ignore -g '*.{ts,tsx,mts,mjs,js,cjs,md,json,yaml,yml}' '\b(NextStepBox|PLAN_COUNT)\b' src tests scripts packages plugin .claude-plugin
if ($LASTEXITCODE -ne 1) { throw '제거 심볼이 남았거나 참조 검사가 실패했습니다.' }
```

C01 제거를 선택한 경우에만 같은 검색 명령의 패턴을 `\bcodexMcpCommand\b`로 바꿔
일치 없음과 exit 1을 요구한다. `docs/`의 역사적 설명은 제거 대상이 아니다.
제품·테스트 외의 script·plugin·private template에 새 소비자가 있으면 해당 후보를 중단한다.

| 검색/검토 항목 | 적용 후 허용 목적지 | 금지 또는 보존 판정 |
| --- | --- | --- |
| `NextStepBox`, `PLAN_COUNT` | 선택한 후보의 코드 범위에는 없음 | old export·import·호출·재export·template 참조가 모두 없어야 함 |
| `codexMcpCommand` | C01 제외 시 현재 모델·테스트 두 파일 | C01 선택 시 위 검색 범위 전체에서 없어야 함 |
| `NextStepFixture` | `tests/server/fixtures/src-clean-code-browser.tsx`의 private 선언과 `#next` 호출만 | 제품 파일/public API export, 렌더 내부 선언, 신규 key로 reset하는 구현 금지 |
| `NextStepContent`, `useState` | 기존 제품 content/TurnBanner; fixture는 content import와 기존 React `useState` 사용 | content body·directive·타입 import 보존; C02 UI의 전용 `useState`만 없어야 함 |
| `LIMITS`, `Object.keys(LIMITS).length` | core owner 유지; C03 테스트의 직접 import·첫 assertion | C03 제품 모듈의 전용 import/상수/주석만 없어야 함; 다른 제품 사용처는 유지 |
| `codexOwnerMcpCommand`, `codexConnectionCommand`, `AGENT_TOKEN_VARIABLE` | 기존 모델과 실제 제품 소비 경로 | C01 선택 여부와 무관하게 유지 |
| FSD public API 및 금지 파일 목록 | 기존 export·import 경로 그대로 | 배럴, core/plugin, route/auth/DB, 설정/의존성/문구 변경 금지 |

문자열 검색은 보조 근거다. 실제 import/export 선언, wrapper의 위치·props 전달,
기존 assertion 보존을 diff로 확인하고 타입 검사·번들·행동 시험으로 연결한다.
새 목적지의 선언이 있다는 사실만으로 이동 완료라고 판정하지 않는다.

구현 시작 시 충돌 없는 기준 HEAD를 `$cleanupBase = (git rev-parse HEAD).Trim()`으로
기록하고, 이후 **그 기준에 대한** 변경 목록을 Affected Files의 승인된 후보 경로와
대조한다. staged/unstaged 변경과 untracked 파일을 모두 포함한다.

```powershell
git diff --name-only $cleanupBase --
if ($LASTEXITCODE -ne 0) { throw '기준 HEAD에 대한 diff를 확인할 수 없습니다.' }
git ls-files --others --exclude-standard
if ($LASTEXITCODE -ne 0) { throw '미추적 파일을 확인할 수 없습니다.' }
git diff --check $cleanupBase --
if ($LASTEXITCODE -ne 0) { throw '변경 범위의 공백 또는 충돌 표시 검사가 실패했습니다.' }
```

제품·테스트 변경은 **승인된 후보별 경로의 합집합** 안이어야 하고, 제외한 후보는
원래대로 남아야 한다. C02·C03를 함께 선택하면 5개, 세 후보 모두 선택하면 7개가
허용 경로다. 일부만 선택한 경우에도 그 후보의 Affected Files 행만 적용한다.
실행 결과 기록을 위한 이 제안서의 metadata·검증 결과 갱신은
별도 문서 변경으로 허용하되 제품 문구/계약 문서는 수정하지 않는다. ignored 파일은
Git 목록에 나타나지 않으므로 source/generated·private templates를 별도로 바꾸지 않았는지
확인한다. 현재 다른 작업의 diff를 정리 후보의 diff로 간주하지 않는다.

### C02 실제 브라우저 인수 절차

1. `node -e "require.resolve('esbuild')"`로 현재 도구를 확인한다. 없으면 환경 미준비로
   기록하고 중단한다. 이 제안의 범위에서 설치·package/lockfile 변경은 하지 않는다.
2. `node --import tsx scripts/rehearse-src-clean-code.ts --ui-only`를 실행한다.
   `--ui-only`는 DB 초기화·Next 서버·fault 계측 전에 분기한다. DB URL과 fresh build는
   이 fixture 실행의 선행 조건이 아니다. port 55452가 점유돼 있으면 임의 기존 서버를 종료하지 않는다.
3. startup 메시지를 확인한 뒤 `http://127.0.0.1:55452/fixture?mode=copy`를 브라우저에서
   열고 **Run acceptance**를 한 번 누른다. 화면에 `#acceptance-results`가 나타날 때까지 기다린다.
4. `/results`의 JSON을 아래 명령으로 판정한다. 빈 결과·필수 case 누락/중복·Pass 이외의
   status는 실패다. 전체 runner의 다른 case 실패도 숨기지 않고 기준 결과와 비교한다.
5. 새로 copy fixture를 열고 `#next`에서 Codex 선택 → 첫 Copy 연속 클릭 → `Change text`
   A→B → `window.fixture.finishCopy(true)` 순서로 확인한다. write는 한 번, 선택은 Codex,
   현재 note는 `docs/B.md`, 이전 성공은 새 문구에 `Copied`로 표시되지 않아야 한다.
   새 명령 Copy를 실패(`finishCopy(false)`)시킨 뒤 재시도 가능함도 확인한다.
6. Copy pending 상태에서 **Finish**를 누르면 root·pending·clipboard·pagehide handler와
   서버가 정리돼야 한다. fixture를 다시 실행·진입하면 Claude로 시작한다.
   결과 JSON과 이 수동 관찰은 저장소 테스트 보고서 관례로 기록한 뒤 종료한다.

서버가 `/results`를 받거나 **Finish**로 exit 0이 됐다는 사실은 인수 통과가 아니다.
현재 스크립트는 JSON을 저장·출력할 뿐 Fail 행을 종료 코드에 반영하지 않는다.

```powershell
$uiResults = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:55452/results').Content | ConvertFrom-Json
$uiResults = @($uiResults)
$requiredCases = @('copy lifetime', 'client copy matrix', 'owner client selection', 'owner identity reset', 'banner client lifecycle')
if ($uiResults.Count -eq 0) { throw '브라우저 인수 결과가 비어 있습니다.' }
foreach ($caseName in $requiredCases) {
  $caseRows = @($uiResults | Where-Object { $_.case -eq $caseName })
  if ($caseRows.Count -ne 1 -or $caseRows[0].status -ne 'Pass') {
    throw "필수 브라우저 인수가 통과하지 않았습니다: $caseName"
  }
}
if (@($uiResults | Where-Object { $_.status -ne 'Pass' }).Count -ne 0) {
  throw '브라우저 인수에 실패 또는 알 수 없는 status가 있습니다.'
}
```

Windows PowerShell 5.1에서는 `ConvertFrom-Json`이 배열을 하나의 pipeline 객체로
반환하므로 JSON 변환과 배열 정규화를 두 문장으로 나눈다. 변환 pipeline 전체를
`@(...)`로 감싸면 중첩 배열이 되어 필수 case의 중복을 놓칠 수 있다.

자동 case들은 `tests/server/fixtures/src-clean-code-acceptance.ts`에 이미 있으므로
그 파일이나 리허설 스크립트를 새로 수정하지 않는다. copy lifetime은 일반 Copy fixture의
비동기 시험이고, `#next`의 같은 인스턴스 props 변경은 위 수동 관찰로 보완한다.
이 loopback fixture는 실제 제품의 인증·DB·네트워크 clipboard 권한 인수를 대신하지 않는다.

선택한 변경을 적용한 뒤 저장소의 정적·아키텍처·프레임워크 검증을 실행한다.

```powershell
npm run verify:fsd
npm run test:architecture
npm run check
npm run test:web
npm run test:server
npm run build
git diff --check
```

코드 변경 전에 적용 영역의 아키텍처와 설치된 Next.js 관련 문서를 다시 읽는다.
새 테스트를 추가해 구현 형태만 검사하기보다 기존 동작 검증을 보존한다.
실패나 skip은 명령·환경·원인을 기록하고, 새 실패를 기존 실패로 임의 분류하지 않는다.
실제 브라우저 확인 없이 C02의 fixture 동작 검증까지 완료했다고 보고하지 않는다.

## Verification Results — 변경 전 감사

다음은 같은 대화의 2026-10-06 감사에서 **실제로 실행한 변경 전 결과**다.
최초 감사 HEAD에서의 결과이며, 이번 checkout이나 코드 제거 후 회귀 결과와 구분한다.

| 명령 또는 검사 | 상태·결과 | 한계 |
| --- | --- | --- |
| `npm run lint` | Executed — exit 0. ESLint와 FSD 검사 통과. | 미사용 export 전체를 증명하는 검사 아니다. |
| `./node_modules/.bin/tsc.cmd --noEmit --incremental false --noUnusedLocals --noUnusedParameters` | Executed — exit 0. | 현재 tsconfig의 타입·미사용 지역 선언·인자 검사다. |
| TypeScript Compiler API, 추적 TS/JS 485개 | Executed — `checkJs`, 미사용 검사, `allowUnreachableCode: false` 적용 시 관련 진단 0건. | 진단 코드 `6133`, `6192`, `6196`, `6138`, `7027`, `7028`만 집계했다. 다른 JS 타입 진단의 통과를 주장하지 않는다. |
| Knip `6.39.0`, 전체 및 제품 경로 분석 | Executed — 정상 JSON, unresolved 0. 후보가 남아 exit 1. | 파일·의존성 후보는 위 유지 근거와 대조했다. 모든 보고 항목을 dead code로 판정하지 않는다. |
| 후보별 저장소 검색과 소비자 코드 대조 | Executed — C01–C03의 제품 외 소비자 확인. | 정적·문자열 검색으로 임의의 동적 접근까지 증명하지 않는다. |
| `node scripts/plugin-lib.mjs --check` | Executed — exit 0, `plugin/lib in sync`. | 복사본 제거 승인의 근거가 아니다. |
| `npm run test:architecture` | Executed — 26 pass, 2 skip, 0 fail. | 실제 Windows LPAC readlink·spawn 시험 두 개는 runtime 환경 미지정으로 skip했다. |
| 아래 대상 테스트 명령 | Executed — 21 pass, 0 skip, 0 fail. | 세 대상 파일의 현재 테스트 결과다. 전체 웹·서버 시험을 대신하지 않는다. |
| production build·DB·실제 브라우저·private 템플릿 시험 | Not executed. | 이번 감사에서 코드 변경 없이 참조와 정적 품질을 확인했다. 해당 인수 완료를 주장하지 않는다. |

실행한 대상 테스트 명령:

```powershell
node --import tsx --test src/fsd/entities/project-token/model/connect-command.test.ts src/fsd/shared/lib/entitlement-copy.test.ts src/fsd/widgets/turn-banner/ui/next-step.test.mjs
```

Knip의 전체 분석 설정과 도구 재현 방식은
[기존 완료 제안서의 Reproduction Notes](../completed/2026-10-05-dead-code-removal-candidates.md#reproduction-notes)를
역사적 참고로만 둔다. 그 문서의 과거 제거 후 결과를 이번 감사 결과로 재사용한 것은 아니다.

## Verification Results — 직전 문서 reconciliation

위 직전 문서 검증 기준의 작업 트리에서 다음 대상 명령을 실행했다.

```powershell
node --import tsx --test src/fsd/entities/project-token/model/connect-command.test.ts src/fsd/entities/project-token/ui/token-reveal.test.ts src/fsd/shared/lib/entitlement-copy.test.ts src/fsd/widgets/turn-banner/ui/next-step.test.mjs src/fsd/widgets/turn-banner/ui/turn-banner.test.ts src/fsd/shared/ui/copy-button.test.ts
```

- **Executed:** 32 pass, 0 fail, 0 skip. 이 결과는 당시 소스의 변경 전 기준이다.
- **Executed:** 7개 파일의 제안 변경을 디스크에 쓰지 않는 메모리 overlay로 구성했다.
  현재 tsconfig를 적용한 변경 대상 TS/TSX 파일의 구문·타입 진단은 0건이었다.
  프로젝트 전체 타입 검사나 실제 수정 후 시험 결과로 표시하지 않는다.
- **Executed:** 현재 및 제안 overlay의 브라우저 fixture를 실제 `--ui-only`와 같은
  esbuild 옵션·fixture link stub으로 메모리에 bundle했다. 두 번 모두 성공했고,
  제안 번들의 151개 입력을 통해 entry→최종 JS의 의존 경로를 확인했다.
  제품 `NextStepContent` export와 fixture private wrapper의 목적지도 확인했다.
- **Not executed:** 실제 브라우저 상호작용, 코드 적용 후 테스트, 현재 작업 트리의
  전체 check/build/server/DB 시험. 다른 작업의 변경을 해결하거나 이 문서 검증 결과로
  승인·배포 상태를 바꾸지 않는다. 검증 중 HEAD 변경 후에도 후보 참조와 현재/제안
  fixture 번들의 내용 identity가 같은지 재확인했다.

직전 검증 당시 초기 문서에는 실제 개선점이 있었다. 현재 기준과 최초 감사 결과 분리, C01의 선택
경계, 정확한 이동/import 목적지, 기존 위치의 부재 검증, 상태/cleanup 보존,
최종 번들·브라우저 결과의 판정, 플랜 개수 검증의 한계를 본문에 반영했다.
이 단락은 직전 검증의 역사적 결과이며 아래 재검증에서 새로 실행한 결과와 구분한다.

## Verification Results — 2026-10-06 문서 재검증

현재 재검증 기준에서 위의 6개 파일 대상 테스트를 다시 실행했다. **32 pass,
0 fail, 0 skip**이다. strict SDD 구조 검증도 오류 0건이며 요구사항의 Task/검증
연결은 각각 3/3이다. 최초 Knip·485개 파일 감사나 전체 check/build 결과를 재사용한
것은 아니다.

| 검증 경로 | 새 실행 결과 | 판정 범위와 한계 |
| --- | --- | --- |
| 전체 후보 참조·public API·보존 소비자 | 세 후보의 참조는 Affected Files의 7개 파일에 한정되고 `NextStepFixture` 선언은 없음 | source·테스트·script·core·plugin·private template의 문자열 검색과 실제 선언/import 대조. 임의 외부 deep import의 부재 증명은 아님 |
| 제안 7개 파일의 메모리 overlay | 변경 대상 TS/TSX 6개 파일의 구문·타입 진단 0건, 기존 제품 content body 보존 | 가상 파일을 compiler host에 제공했으며 제품·테스트 원본 파일에 쓰지 않음. 프로젝트 전체 타입 인수와 실제 코드 적용 후 시험은 아님 |
| 현재/overlay 최종 fixture bundle | 각 151개 입력에서 번들 생성 성공, 입력 경로 집합 동일 | 실제 ui-only와 같은 esbuild 옵션·link stub 사용. overlay의 private wrapper와 product content 연결 확인 |
| 현재/overlay의 실제 headless 브라우저 | 각각 전체 인수 **35 Pass / 0 Fail** | 격리 context와 loopback 서버 사용. 제안 코드의 가상 실행이며 실제 제품 배포·인증·DB 인수는 아님 |
| 두 변형의 `#next` 추가 동작 확인 | client 유지, A→B note 반영, 연속 클릭 write 1회, stale 성공 숨김, 실패 후 재시도, Finish unmount, fresh 진입 Claude 확인 | 브라우저 관찰로 props 변경·pending·종료/재진입 경계를 확인. 실제 clipboard 권한은 기존 double로 대체 |
| 원본 `--ui-only` 명령 | 현재 bundle hash 일치, 실제 `/results` read-back의 35개 case 모두 Pass; pending Copy에서 Finish 후 root unmount와 서버 종료 | 원본 명령의 제공/결과/종료 경로 확인. overlay 서버 검증과 구분 |
| 브라우저 JSON 판정 명령 | Windows PowerShell 5.1에서 실제 결과 35개를 행 단위로 판정하고 정상 결과는 수락, 필수 case 중복·누락·Fail·빈 배열은 거부 | 이미 읽어 둔 실제 JSON과 변형한 반례를 사용해 문서 명령을 검증. 추가 브라우저 실행이나 제품 변경은 없음 |
| 원본 불변·정리 | 7개 원본 바이트 불변, 추적 파일 clean, owned 브라우저 context·서버 종료 | 다른 작업 문서·private 본문·설정·DB 변경 없음 |

이번 요청 시작 시에도 개선점이 있었다. 설치 문서의 `02-guides/server-and-client-boundary.md`
경로에는 `01-app`이 빠져 실제 설치 파일을 찾을 수 없었다. 브라우저 결과를 읽는
명령도 Windows PowerShell 5.1에서 35개 행을 중첩 배열 하나로 받아 필수 case 중복을
통과시켰다. 가이드 전체 경로와 JSON 변환·정규화 명령을 바로잡고 실제 결과 및
중복·누락·실패·빈 배열의 반례로 확인했다. 이전 검증 기준·결과를 역사적 기록으로
구분해 새 기준과 실행 근거를 추가했다.
검증 helper의 첫 overlay 구성은 파일별 LF/CRLF 차이로 중단됐으며, 메모리 입력만
정규화한 뒤 통과했다. 이 준비 오류를 제품 결함이나 문서의 추가 blocker로 분류하지 않는다.

문서 수정 이후 INV-1–INV-6 전체를 저장본에서 다시 확인하는 무수정 최종 pass,
Coverage Stability Check와 INV-7의 판정·source identity는 최종 응답에 기록한다.
재검증 도구와 원본 로그는 저장소 밖 Temp에 두며 공개 문서에는 민감한 실행 식별자나
인증·private 본문을 포함하지 않는다.

## Verification Results — 실제 구현 후

- 실행 기준일: 2026-10-07.
- branch: `harness/test-only-code-cleanup`.
- 구현 기준 `$cleanupBase`: `450176ab683d70108d382651b1dacbbd56dfd3b5` (`origin/dev`).
- 적용 범위: C02·C03의 기존 코드·테스트 5개 파일. C01의 모델·테스트는 기준 HEAD와 동일하다.
- 구현은 실제 작업 트리에 적용했다. 아래 결과는 과거 감사·메모리 overlay 결과를
  재사용한 것이 아니라 실제 수정 후 수행한 검증이다.

| 명령 또는 검증 | 실제 결과 | 범위·한계 |
| --- | --- | --- |
| `npm run verify:fsd` | exit 0 | FSD 경계 통과, 예외·배럴 변경 없음 |
| `npm run test:architecture` | exit 0 — 44 pass, 2 skip, 0 fail | LPAC readlink·IPC spawn 두 시험은 `STAGEKEEPER_TEST_WINDOWS_RUNTIME` 미지정으로 skip. 이번 UI/테스트 정리의 대상이 아님 |
| `npm run check` | exit 0 | plugin 복사본·ESLint/FSD·Next typegen·전체 타입 검사·아키텍처·project availability 통과. 후자의 18개 시험 모두 pass |
| `npm run test:web` | exit 0 — 579 pass, 0 skip, 0 fail | 수정한 단위 테스트와 owner/TurnBanner/Copy 회귀 검증 포함 |
| `npm run test:server` | exit 0 — 55 pass, 1 skip, 0 fail | `SRC_CHECK_INBOX_MANIFEST` 미지정에 따른 선택적 build 후 Inbox manifest 시험 1개 skip. Inbox 경계·생성 manifest는 이번 변경 대상이 아님 |
| `npm run build` | exit 0 | 실제 production build 성공. 기존 Prisma 생성 및 Next build 절차 사용; 제품 인증·DB 통합·배포 완료를 뜻하지 않음 |
| 실제 `rehearse-src-clean-code.ts --ui-only`와 격리 headless 브라우저 | 전체 35개 case Pass, 필수 5개 각각 1회 Pass, 실제 `/results` read-back 일치 | 저장소의 원본 명령과 실제 수정한 fixture 사용. 별도 가상 변경이나 추가 설치 없음 |
| 실제 `#next` props·Copy 확인 | Codex 선택 유지, A→B의 `docs/B.md` 반영, 연속 클릭 write 1회, stale Copied 숨김, 실패 후 재시도 통과 | 실제 DOM·복사 double의 payload를 관찰. 기존 CopyButton·제품 content body 유지 |
| 종료·재실행 | pending Copy 중 Finish → root unmount와 서버 종료; 원본 CLI를 다시 실행하면 Claude·빈 writes로 시작하고 Copy 가능 | 두 owned CLI·브라우저 context 모두 종료. 기존 pending·clipboard·pagehide cleanup 사용 |
| 최종 JS와 소비자·변경 범위 | 실제 제공 bundle과 같은 옵션의 메모리 bundle hash 일치, 입력 151개; 제거 심볼 부재·private wrapper 목적지 확인 | `NextStepBox`/`PLAN_COUNT`는 코드 검색 범위에서 없음. `NextStepFixture`는 기존 fixture 선언·호출만 존재 |
| 보존 범위와 diff | 제품 NextStepContent body·플랜 표 body·fixture의 wrapper 외 body 동일; C01·TurnBanner·CopyButton·BillingPage·public API 불변; `git diff --check` 통과 | 제품·테스트 diff는 승인된 5개 파일에 한정. 다른 작업의 `impl-verifier.md`는 보존 |

실제 제공 bundle SHA-256은
`638d06a1d3ba95e5e232c86e9f7cdf72d7dba40a1749899b04edcb161e4febd1`이다.
정리 전 메모리 overlay의 예측과도 동일하지만 완료 근거는 위 실제 구현 후 관찰이다.
원본 JSON·검증 로그·브라우저 helper는 저장소 밖 Temp에 두었으며,
이 문서에는 인증 정보·private 본문을 기록하지 않았다.

## Risks and Rollback

- 테스트만 호출하는 코드도 검증 도구에는 유효하다. C02를 삭제만 하면 기존 브라우저
  fixture가 깨지고, C03 검증까지 지우면 새 플랜의 표 누락을 감지하지 못한다.
- C01은 향후 제품 사용 의도를 확인한 뒤 선택한다. 현재 참조 부재만으로 미래 요구가
  없다고 단정하지 않는다.
- 이번 변경으로 인증·영속 데이터·네트워크 프로토콜을 바꾸지 않으므로 DB 복구나
  migration 롤백은 필요하지 않다.
- 회귀가 확인되면 해당 후보의 모델/UI와 연결된 테스트·fixture 변경을 함께 되돌린다.
  커밋 후라면 정리 커밋을 revert하고, 커밋 전이라면 해당 작업 diff만 되돌려 사용자 변경을 보존한다.
- 복구 뒤 해당 후보의 대상 테스트와 정적 검증을 다시 실행한다.

## Completion or Closure Notes

C02·C03의 실제 변경·필수 검증·실제 브라우저 관찰을 완료했다. C02는 제품 wrapper를
제거하고 기존 fixture의 private `NextStepFixture`로 상태를 옮겼으며, C03는 플랜 수
계산을 테스트로 옮겼다. 제품의 다음 단계 content·client 선택·Copy·플랜 표 동작과
기존 테스트 assertion은 보존했다.

C01은 이번 승인 범위에서 제외했고 현재 구현·테스트를 유지한다. C01까지 제거했다고
보고하지 않으며, 이를 선택한 범위의 미완료 작업으로 간주하지 않는다.
선택 범위의 old absence/new presence, import·public API, 행동·최종 번들·JSON·종료
경계와 금지 파일 보존을 확인하고 skip의 조건·범위를 위에 기록했다.

저장소 lifecycle에 따라 `completed/2026-10-07-test-only-code-cleanup-candidates.md`로
이동한다. 이번 완료 기록은 로컬 코드·검증 결과이며 커밋·PR·통합·배포 상태를
대신하지 않는다. 인증·DB 통합과 실제 clipboard 권한, LPAC 제품 인수는 수행하지 않았다.

문서 구조 검증 명령:

```powershell
$sddValidator = Join-Path $env:USERPROFILE '.codex/skills/write-sdd-spec/scripts/validate_sdd_traceability.py'
python $sddValidator --strict --format json docs/proposals/completed/2026-10-07-test-only-code-cleanup-candidates.md
```

최초 문서 구조 검증은 오류 0건, 요구사항의 Phase/Task 연결 3/3,
검증 연결 3/3이다. 이 검사는 문서 구조만 확인하며 실제 동작의 회귀 검증을 대신하지 않는다.

## Review Checklist

- [x] 현재 HEAD·작업 트리와 최초 감사 결과를 구분했다.
- [x] 제품 미사용과 테스트·운영 소비자 사용을 구분했다.
- [x] 유지할 구현, 수정 파일 7개, 제외 범위와 중단 조건을 명시했다.
- [x] 실제 실행한 감사와 구현 후 계획을 구분했다.
- [x] 요구사항–Task–검증 연결을 작성했다.
- [x] 정확한 import 목적지·이전 심볼 부재·최종 산출물·브라우저 합격 기준을 명시했다.
- [x] C01을 Core 범위의 필수 결정보다 별도 선택 항목으로 구분했다.
- [x] 설치 가이드 실제 경로와 현재/가상 변경의 타입·최종 번들·브라우저 검증 근거를 확인했다.
- [x] Windows PowerShell의 JSON 배열 처리와 필수 인수 case의 중복·누락·실패 판정을 확인했다.
- [x] 적용 범위를 C02·C03로 확정하고 C01은 제외·유지했다.
- [x] 선택 범위의 코드 변경과 구현 후 회귀·실제 브라우저 검증을 완료했다.
