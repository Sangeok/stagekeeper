---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-12"
approved-by: "requesting-user"
approved-at: "2026-11-12"
approval-scope: "제안서의 코드·테스트·문구 구현, 검증, 관련 문서 보존과 dev 대상 PR 생성. 병합·main 승격은 제외한다."
completed-at: "2026-11-12"
verification-summary: "모델·UI 67개, 웹 815개, 서버 177개, 아키텍처 321개 통과. 경계·check·build·문구 검사 통과. PR #336의 구현 commit 15b03c0에 대한 check 6개 job 통과(run 43177591010)."
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related:
  - "docs/investigations/active/session-gate-approval-unavailable-investigation.md"
  - "docs/conventions/product-copy.md (§6 Activity lines)"
  - "docs/proposals/completed/2026-09-08-board-model-simplification.md (현재 요약 규칙을 정한 문서)"
  - "docs/proposals/active/claude-verifier-skill-namespace.md (R1에 고정된 열린 실행)"
---

# 보드 활동 줄이 가장 최근 결과를 요약하게 한다

## Summary

보드의 활동 줄은 이전에 항목의 `results`를 모두 이어 붙인 뒤 첫 문장을 보여 줬다. `results`는 전이마다 뒤에
쌓이므로, 앞선 결과(보류 사유, 되돌리기 노트, reopen 노트)가 있는 항목은 완료된 뒤에도 가장 오래된 결과가
요약으로 남았다.
요약의 출처를 가장 최근 결과 하나로 바꾸고, 제품 문구 규약과 회귀 테스트를 함께 갱신했다.

## Goal

- 활동 줄이 결과 요약을 쓰는 자리(`briefing.ts`의 `done`·`on_hold`·기본 분기)에서 항목의 가장 최근 결과를
  보여 준다.
- 작업 유형: 표시 규칙 수정(모델 함수 1개, 모델·정적 렌더 테스트, 규약 문서).

## Proposal Size

`proposal-size`: standard

선택 근거:

- 구현 대상 4개 파일, 이 제안서의 검증·완료 기록, 직접 참조한 미추적 조사 기록 보존까지 6개 파일이므로
  README의 standard 기준을 따른다.
- 제품 변경은 모두 보드 활동 줄의 표시 규칙에 속한다.
- 서버 데이터, API 응답, 저장 형식은 바뀌지 않는다. 롤백은 단순 revert다.

## Current State

대조 기준은 2026-11-12의 `origin/dev` `278c986976f791f35f8803883cb12ab68dd9c837`이다.
원문 작업 트리의 `df27c78`과 이 기준 사이에서 아래 제품 코드·테스트·§6은 바뀌지 않았다.
줄 번호는 이 기준의 탐색 보조이며, 구현 직전에는 최신 `dev`의 함수·절 이름과 열린 PR을 다시 확인한다.
최종 대조 때 `origin/dev`는 `6cf37cdd32ed107623eeacfdf48b555863837af6`로 이동했다. 그 사이 변경은
출시 reader CI와 관련 문서뿐이며 이 제안의 코드·테스트·문구·check 명령은 같았다.
조사 기록의 운영 관측은 당시 증거로만 사용하며 이번 대조에서 운영 DB를 다시 조회하지 않았다.

- `src/fsd/pages/project-board/model/briefing.ts:42-45`의 `summaryLine`은
  `row.results.join(" ")`의 첫 문장을 쓴다. `done`, `on_hold`, 기본(muted) 분기가 이 함수를 쓴다(84-89행).
  그 앞의 54-62행은 `on_hold`가 아닌 항목이 project agent나 `impl-verify`·`qa` 슬롯에 있으면 상태와
  무관하게 `waiting for <agent> · <node>` 또는 `working: <agent> · <node>`를 돌려준다. 이 분기는 바꾸지 않는다.
- `src/server/pipeline/board-rules.ts:45`는 전이의 `result`를 `results` 끝에 덧붙이기만 한다.
  보류 사유, 되돌리기 노트, reopen 노트, 완료 기록이 한 배열에 순서대로 쌓인다. 웹의 보류·되돌리기는
  `src/fsd/features/review-gate/ui/inbox-card-controls.tsx:22`, reopen은
  `src/fsd/features/review-gate/ui/reopen-actions.tsx:60-66`에서 `result`를 보낸다.
- 구현 구간이 끝나면 서버가 `Implementation span completed.`를 덧붙인다
  (`src/server/pipeline/board-service.ts:717`).
- `docs/conventions/product-copy.md`의 §6 Activity lines는 현재 규칙을 적고 있다. 표의 `done`·`on_hold`
  행(382-383행)이 "first sentence of joined results"이고, 387행이 "Results are joined with one space in
  recorded order before taking the first sentence."다. `briefing.test.mjs:71-76`의 테스트가 이 동작을 고정한다.
- 이 규칙은 `docs/proposals/completed/2026-09-08-board-model-simplification.md:224-225`에서 정했다. 그 문서는
  동작을 보존하는 모델 정리였고 "결과들을 다시 정렬하거나 개별 trim/filter하지 않는다"고 적었다. 이 제안은
  그 요약 규칙을 바꾼다.
- `done`으로 가는 전이는 pipeline의 `implementing → done` 하나뿐이고
  (`packages/core/pipeline/transitions.mjs:20`), 서버는 그 `result`가 정확히
  `Implementation span completed.`일 때만 받는다(`src/server/pipeline/board-service.ts:449`). 전이의
  `result`는 공백일 수 없다(`transitions.mjs:33-37`의 `checkText`).
- 같은 데이터를 읽는 Inbox 카드는 보류 노트에 이미 마지막 결과를 쓴다
  (`src/fsd/features/review-gate/ui/inbox-card.tsx:54`).

관찰된 사례(2026-11-12, 프로덕션 `stagekeeper-macos-e2e`의 ITEM-09):

| 시각(UTC) | 기록 |
| --- | --- |
| 02:19 | agent `planning → on_hold`. 결과는 `Open: İstanbul→i-stanbul (lowercase first) or stanbul (ASCII filter first)? …` |
| 02:22 | human `on_hold → planning` |
| 04:43 | human `in_review → implementing` |
| 05:00 | pipeline `implementing → done`, main-loop 인수 기록 |
| 05:02 | 파이프라인 런 완료 |

완료 뒤 보드 활동 줄은 `ITEM-09 · Open: İstanbul→i-stanbul (lowercase first) or stanbul (ASCII filter first)?`
와 `Done` 배지를 함께 보여 줬다. 이미 답한 질문이 열려 있는 것처럼 읽힌다. 같은 프로젝트에서 보류된
적이 없는 ITEM-01·ITEM-06은 `Implementation span completed.`로 나온다.

## Scope

포함 범위:

- `summaryLine`의 요약 출처.
- 그 규칙을 고정하는 모델·정적 렌더 테스트와 `product-copy.md` §6의 문장.

제외 범위:

- `results`의 저장 방식과 서버 전이 규칙.
- Inbox 카드와 항목 상세 페이지의 결과 표시(`src/fsd/features/review-gate/ui/inbox-card.tsx:80`,
  `src/fsd/pages/board-item/ui/board-item-page.tsx:66-74`). Inbox의 보류 노트는 마지막 결과를,
  Evidence and result는 결과 전체를 표시한다. 상세 페이지도 전체 결과를 표시하며 모두 그대로 둔다.
- 템플릿 릴리스가 맞지 않아 대기 중인 항목의 웹 표시. 아래 "범위 밖 관찰"에 적는다.

## Proposal

1. `summaryLine`이 배열의 기록 순서를 유지한 채 마지막 원소를 요약 출처로 쓴다. `results`가 비어
   있을 때만 `reason`을 쓴다. 결과를 정렬·역순 변경·필터링하거나 원소를 제거하지 않는다.
2. 선택된 출처가 공백이면 항목 키를 본문으로 쓴다. 마지막 결과 앞에 유효한 결과가 있어도 그 결과나
   `reason`으로 대체하지 않는다. 기존 단일 공백 결과의 key fallback을 유지하고 다중 결과에도 적용한다.
   `briefing.test.mjs:106-112`는 단일 공백 결과만 검사하므로, 앞선 결과와 reason이 모두 있는 사례를 더한다.
3. `firstSentence`, `isOverBudget([row.reason, ...row.results])`, 상태별 tone, 행 순서와 Team은 바꾸지 않는다.
   `activityItem`의 슬롯 분기를 먼저 적용하는 순서도 유지한다. `on_hold`는 그 분기를 건너뛰고 요약한다.
4. `product-copy.md` §6 Activity lines의 `done`·`on_hold` 행에서 괄호 안 문구를 각각
   `first sentence of the latest result, or reason when results are empty`로 바꾼다. 표 아래의 결과 요약
   설명 문단은 다음으로 교체한다. `in_review`의 문구와 §6의 다른 UI 규칙은 유지한다.

   > Only the latest recorded result is summarized; earlier results are not joined in.
   > This summary rule applies to done, on_hold, and fallback status rows that reach the summary branch.
   > Project-agent and impl-verify/qa slot activity takes precedence unless the item is on hold.
   > An empty results array falls back to reason. If the selected summary is blank, the existing row repeats
   > the item key in the body as well as the key label; it does not fall back to an earlier result or reason,
   > or replace the body with "Done" or "On hold".

5. `briefing.test.mjs:71-76`을 가장 최근 결과만 고르는 테스트로 바꾸고, 아래 표의 변경·경계 사례를
   `buildBriefing`의 출력으로 검사한다. 기존 테스트를 확장해도 되며 같은 계약의 중복 테스트는 만들지 않는다.
6. `project-board-page.test.mjs`의 기존 정적 렌더 도구를 사용해 보류 뒤 완료된 행의 링크 본문에
   `Implementation span completed.`와 `Done` 배지가 함께 있고, 옛 보류 질문은 없는지 검사한다.
   별도 key span, 항목 링크와 pipelineName은 유지한다. 제품 UI 파일은 바꾸지 않는다.

아래 표의 요약 대상은 슬롯 우선 분기를 통과한 `done`·`on_hold`·기본(muted) 분기다.
`node: null`을 기본 조건으로 두고, 슬롯 사례에서는 node와 dispatched를 명시한다.

| 입력·분기 | 지금 | 변경 후 및 검증 |
| --- | --- | --- |
| `done`, `["Open: A or B? Answer in Source.", "Implementation span completed."]` | `Open: A or B?` | `Implementation span completed.`, tone `done`; 정적 렌더에서도 최신 문구·Done 배지와 옛 질문의 부재 확인 |
| `on_hold`, `["First hold reason.", "Second hold reason. More."]` | `First hold reason.` | `Second hold reason.`, tone `hold` |
| `done` 및 알 수 없는 status, `["First part", "second part. Later."]` | `First part second part.` | `second part.`; 각각 tone `done`·`muted` |
| `done`, `["Shipped the fix. Verified in prod."]` | `Shipped the fix.` | 그대로 |
| 요약 대상 세 분기, `[]`, reason `Reason first. Later.` | `Reason first.` | 그대로; proposed/planning/in_review/implementing에는 이 fallback을 적용하지 않음 |
| 요약 대상 세 분기, `["Earlier result.", "   "]`, reason `Nonempty reason.` | `Earlier result.` | 항목 키; 이전 결과·reason으로 대체하지 않음 |
| 요약 대상, `[]`와 공백 reason 또는 `["   "]` | 항목 키 | 그대로 |
| `done`, 이전 결과가 151자, 마지막 결과 `Done.` | 이전 결과, overBudget `true` | `Done.`, overBudget은 여전히 `true`; reason·모든 원본 결과를 개별 검사 |
| project-agent 또는 impl-verify/qa 슬롯의 non-hold 행, 결과 2개 | dispatched에 따라 `waiting for` 또는 `working:` | 그대로; `done`이어도 슬롯 문구가 우선 |
| 같은 슬롯의 `on_hold`, 결과 2개 | 첫 결과 요약 | 마지막 결과 요약, tone `hold`; dispatched와 무관 |
| proposed/planning/in_review/implementing, 슬롯 우선 조건 없음 | 해당 상태의 문구 | 그대로; 빈 배열 또는 결과 2개가 있어도 결과 요약을 사용하지 않음 |

슬롯 검증은 `slotAgent`가 해석하는 project agent(`doc-auditor`, `feature-scout`, `work-discoverer`;
번호가 붙은 슬롯과 `discover-work` 별칭 포함)와 `impl-verify`·`qa`, dispatched 양쪽을 기존 순회 테스트에 맞춰 다룬다.
`firstSentence`의 문장 종결·파일명 마침표, 150/151자 예산, gate 우선 순서, Team 및 입력 불변성은
기존 회귀를 유지한다. 새 요약 규칙은 `ActivityItem.line`만 바꾸며 원본 `results`를 변경하지 않는다.

이 규칙에서는 파이프라인으로 완료된 항목 가운데 `done` 요약 분기에 도달하는 행의 활동 줄이 보류 이력과
무관하게 모두 `Implementation span completed.`가 된다(위 Current State의 `done` 전이 규칙).
다른 완료 문장은 과거 저장 행이나 fixture일 수 있으므로 임의로 고정 문구로 치환하지 않는다.

`["First part", "second part. Later."]`는 기존 테스트 입력이다. 현행 전이는 전달받은 result 하나를
원소 하나로 추가하며 문장을 분할하지 않는다. 이 입력의 기대값도 새 규칙에 따라 `second part.`로 바꾼다.

### 범위 밖 관찰

같은 조사에서 다음도 확인했다. 이 제안서의 수정 대상이 아니다.

- `stagekeeper-macos-e2e`의 ITEM-06(`accept`)과 ITEM-08(`before-plan`)은 템플릿 릴리스 `fc5e5f59…`에
  고정돼 있고, 그 저장소의 설치는 `f3273f54…`다. 서버는 두 항목에 `wait`/`template`을 돌려준다(2026-11-12
  04:17–05:02Z의 `pipeline_next` 응답 6회). `docs/architecture/template-releases.md:48-51`의 설계대로이고,
  `claude-verifier-skill-namespace.md`가 이 열린 실행을 추적한다.
- 그동안 웹 보드는 `Continue the pipeline for ITEM-06: accept — accept.`를 다음 단계로 안내하고 Inbox는
  ITEM-08의 `Request plan`을 보여 준다. 웹에는 이 대기가 드러나지 않는다.
- 웹에 표시를 더하는 수정은 여기서 제안하지 않는다. `claude-verifier-skill-namespace.md`의 "영향을 받는
  설치본"은 서버가 설치 기록을 저장하지 않는다고 적는다. 이 문서에서 그 사실을 코드로 다시 확인하지는
  않았다. 호환성은 릴리스 ID가 아니라 client·언어별 `clientSurfaceHash`로 판정한다
  (`template-releases.md:43-49`).
  고정 릴리스(`PipelineRun.templateReleaseId`)와 활성 릴리스(`templateChannel.activeReleaseId`)를 비교하는
  표시는 "설치가 활성 릴리스와 같다"는 가정에 기대므로 별도 설계가 필요하다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `src/fsd/pages/project-board/model/briefing.ts` | update | `summaryLine`의 출처를 마지막 결과로 바꾼다. 호출부는 같은 파일의 세 분기뿐이다 | low: 표시 문자열만 바뀐다 |
| `src/fsd/pages/project-board/model/briefing.test.mjs` | update | 마지막 결과 선택, 기본 분기, 공백 마지막 결과, 전체 원본 예산과 슬롯 우선순위의 회귀를 검사한다 | low: 출력 계약으로 검사한다 |
| `docs/conventions/product-copy.md` | update | §6의 `done`·`on_hold` 행과 요약 설명 문단. 적용 분기·슬롯 우선순위·공백 fallback도 명시한다 | low: 기존 테스트가 읽는 `in_review` 줄은 유지한다 |
| `src/fsd/pages/project-board/model/briefing.fixture.mjs` | keep | `results`가 원소 하나뿐이라(19·22·23행) 새 규칙에서 같은 줄이 나온다 | none |
| `src/fsd/pages/project-board/ui/project-board-page.test.mjs` | update | 보류 뒤 완료 행의 최종 HTML 본문과 Done 배지, 옛 질문의 부재를 검사한다 | low: 기존 정적 렌더 도구를 사용한다 |
| `tests/server/project-page-loaders.test.ts` | keep | `buildBriefing`을 쓰지만 모든 행의 `results`가 비어 있다(16·57-58행) | none: `npm run test:server`로 확인한다 |
| `docs/proposals/completed/2026-11-12-board-activity-latest-result.md` | move + update | 구현 검증과 PR CI 통과를 기록하고 완료 경로로 옮긴다 | none |
| `docs/investigations/active/session-gate-approval-unavailable-investigation.md` | add (기존 기록 보존) | 제안서가 직접 참조하는 미추적 원문을 함께 보존한다. 새 조사·운영 작업은 하지 않는다 | none |

제품 코드의 변경·새 파일·이동은 위 표 밖으로 넓히지 않는다. 제품 관련 네 파일과 제안서·원문 조사 기록을 함께 검토한다. 완료 시 조사 기록의 제안서 참조도 새 경로로 맞춘다.

최종 표시의 연결 경로(모두 keep):

| 경로 | 책임·보존할 계약 | 검증 목적지 |
| --- | --- | --- |
| `src/app/(app)/p/[slug]/page.tsx` | `/p/[slug]`에서 소유자 확인 뒤 로더 호출 | `tests/server/project-page-loaders.test.ts` |
| `src/fsd/pages/project-board/index.ts`, `index.server.ts` | UI와 서버 로더의 기존 public API | `verify:fsd`, 로더 회귀 |
| `src/fsd/pages/project-board/api/project-board.server.ts` | 결과 배열을 그대로 모델에 전달하고 실행 사실을 node/dispatched로 합성 | 로더 회귀; 새 읽기·인증·캐시 동작 없음 |
| `src/fsd/pages/project-board/ui/project-board-page.tsx` | `ActivityRow`가 `item.line`을 재가공 없이 렌더 | 수정할 `project-board-page.test.mjs`의 실제 링크 본문 |
| `src/fsd/entities/board-item/index.ts`, `model/text-budget.ts` | 기존 public API와 전체 원본 필드의 길이 예산 | `briefing.test.mjs`, `test:web` |

같은 파일을 바꾸는 진행 중 제안서: `docs/proposals/active/claude-verifier-skill-namespace.md`가
`product-copy.md:980`의 문구와 안내문 표를 바꾼다. §6과 다른 구역이라 내용은 겹치지 않는다. 먼저 병합된 쪽
위에 다른 쪽을 rebase하고, 그 뒤 이 문서의 함수·절과 줄 번호를 다시 확인한다. 조회 당시 열린 PR #334는
출시 reader의 CI 범위만 다루며 이 네 변경 파일과 겹치지 않았다. PR 상태는 구현 직전에 다시 확인한다.

## Safety Analysis

`summaryLine`은 export되지 않고 `activityItem` 안에서만 쓰인다. `results` 자체는 읽기만 하므로 다른
화면과 서버 기록에 영향이 없다.

확인한 항목:

- [x] 정적 `import` / `export from`: `summaryLine`은 모듈 내부 함수다. `firstSentence`의 export는 그대로다.
- [x] 테스트와 스크립트 참조: `buildBriefing`과 fixture를 쓰는 곳은 `briefing.test.mjs`,
  `project-board-page.test.mjs`, `tests/server/project-page-loaders.test.ts`, 서버 로더
  `src/fsd/pages/project-board/api/project-board.server.ts`다. 원소가 둘 이상인 `results`로 활동 줄을
  단언하는 기존 테스트는 `briefing.test.mjs:71-76` 하나다. §6의 옛 문구 세 곳과 이 테스트의 기대값이
  갱신 대상이며, fixture의 단일 결과 기대값은 그대로다.
- [x] API, localStorage/sessionStorage, analytics, 외부 SDK 영향: 없음. 서버 응답과 저장 형식을 바꾸지 않는다.
- [x] 출시된 plugin·서버와 함께 쓰는 상태: 바꾸지 않는다.

런타임 경계:

- 같은 입력은 재계산해 같은 활동 줄을 만든다. 입력이 바뀌면 새 입력으로 계산하며 별도 상태·effect가 없다.
- 저장·mutation·새 외부 진입점이 없으므로 중복 제출, 부분 저장 실패 복구, 서로 다른 호출자의 경합은
  새 요구가 아니다. 기존 서버 전이·인가를 유지하고 frozen 입력 회귀로 모델의 비변경을 확인한다.
- 라우트와 로더가 소유한 인증·조회·RSC 갱신 경계는 그대로다. 이번 표시는 순수 모델과 기존 React 정적
  렌더로 검증하며, 이 검증을 운영 갱신·브라우저 조작 검증으로 확대하지 않는다.
- `package.json`·lockfile의 Next 16.4.2, React 19.2.8과 기존 tsx/node:test를 그대로 사용한다.
  새 라이브러리 API·설정·환경 변수·번역 키·생성 산출물·로그/metric 이름은 도입하지 않는다.
  활동 줄을 집계하는 관측 코드도 없어 별도 observability 변경은 없다.

## Approval

승인 메모:

- 요청자가 이 문서를 바탕으로 실제 코드 수정과 dev 대상 PR 생성을 지시했다. 승인 범위는 front matter를 따른다.

## Execution Plan

1. 구현 승인이 기록된 뒤 AGENTS.md의 시작 정리·열린 PR 확인·protected remote 확인을 수행한다.
   최신 `dev`에서 새 `harness/<topic>` 작업 트리를 만든다. 기존 작업 트리의 미커밋 파일은 보존한다.
   이 제안서와 직접 참조하는 조사 기록이 아직 미추적이면 내용과 소유자를 확인해 함께 보존한 뒤 옮긴다.
2. 아래 준비 명령을 실행하고 수정 전 기준 결과를 기록한다. Next 관련 코드를 쓰기 전에는 설치된
   `node_modules/next/dist/docs/`의 해당 가이드를 읽는다.
3. Proposal의 모델 경계 사례와 정적 렌더 사례를 기존 테스트에 반영하고 새 기대값에서 실패를 확인한다.
4. `summaryLine`과 `product-copy.md` §6을 맞춘다. Proposal 표의 유지 조건도 함께 확인한다.
5. 아래 검증을 순서대로 실행하고 기존 실패와 신규 실패를 구분한다. 승인된 구현 범위에서 `dev` 대상
   PR을 열고, 머지·출시·작업 종료 정리는 AGENTS.md의 절차와 승인 범위를 따른다.

## Verification Plan

저장소 루트에서 실행한다. 새 작업 트리는 CI와 같이 의존성 설치 뒤 Prisma Client를 먼저 생성해야 한다.
`npm ci`만으로 `src/generated/prisma`는 생기지 않는다. `.github/workflows/check.yml`도 build 이외에는
`db:generate`를 먼저 실행한다. DB 접속이나 migration은 필요하지 않다.

```bash
npm ci
npm run db:generate
node --import tsx --test "src/fsd/pages/project-board/model/briefing.test.mjs"
npm run test:web
npm run test:server
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm run build
```

`npm run check`가 lint·문서·타입·스크립트 회귀를 포함한다. build도 Prisma Client를 생성하지만 위 순서의
테스트·check보다 늦으므로 준비 단계의 생성을 대체하지 못한다. build와 check는 같은 작업 트리에서
동시에 실행하지 않는다. 기존 환경 파일·다른 작업 트리의 generated 파일을 복사해 누락을 가리지 않는다.

§6 문구 검증(아래는 이번에 실행한 POSIX shell 명령):

```bash
node --input-type=module -e 'import assert from "node:assert/strict"; import {readFileSync} from "node:fs"; const text=readFileSync("docs/conventions/product-copy.md","utf8"); const section=text.split("## 6. Board")[1]?.split("## 7.")[0]; assert.ok(section,"Board section exists"); assert.doesNotMatch(section,/joined results|Results are joined/); assert.equal(section.split("first sentence of the latest result, or reason when results are empty").length-1,2); assert.ok(section.includes("Only the latest recorded result is summarized; earlier results are not joined in.")); console.log("Board copy check passed.");'
```

수정 전에는 옛 문구가 있어 이 명령이 exit 1이어야 하고, 수정 후에는 `Board copy check passed.`와
exit 0이어야 한다. 문서 검사·build만으로는 이 규칙 변경을 증명하지 못한다.

완료 기준:

- Proposal 표의 변경 사례와 유지 조건을 모델 테스트에서 확인한다. 특히 공백 마지막 결과, 기본 status,
  과거 원소의 길이 예산, 슬롯과 on_hold의 우선순위를 빠뜨리지 않는다.
- 정적 렌더에서 완료 행의 최신 문구·Done 배지·항목 링크가 유지되고 옛 보류 질문은 없다.
- `firstSentence`, gate 순서·Team·입력 불변성, 빈 배열·단일 결과의 기존 회귀가 통과한다.
- §6의 두 상태 행과 설명 문단이 새 규칙을 반영하고 `in_review` 및 나머지 문구는 유지한다.
- 변경 diff가 Affected Files의 네 제품 관련 파일과 제안서·원문 조사 기록에 한정된다. 서버·API·plugin·Inbox·상세 결과 목록의
  동작과 저장 데이터는 바꾸지 않는다.
- 수정 전 같은 명령의 결과와 비교해 신규 실패가 없어야 한다. 구현 후 검증과 PR의 CI 결과를 기록한
  뒤에만 완료 처리한다. 문서 대조의 통과는 구현 완료나 운영 인수의 통과가 아니다.

## Verification Results

2026-11-12, `278c986976f791f35f8803883cb12ab68dd9c837`의 격리 작업 트리에서 실행했다.
환경은 macOS, Node 26.4.0, npm 11.17.0이며 CI의 Node 22 실행 결과와 구분한다.
아래 표는 제품 코드·테스트·규약을 바꾸기 전 제안서 대조의 기준 검증이다. 당시 결과를 이력으로 유지한다.
이후 구현 결과는 아래 구현 검증 절에 기록하며, 이 기준 결과만으로 완료·승인 처리하지 않는다.

| 명령 또는 확인 | 기준 결과 | 해석·구현 후 확인 |
| --- | --- | --- |
| `npm ci` | Passed | lockfile대로 설치. 설치만으로 Prisma Client는 생성되지 않음 |
| `npm run db:generate` | Passed | Prisma 7.10.1 Client 생성. 생성 전 서버 테스트의 `@/generated/prisma/client` 로딩 실패를 재현함 |
| `node --import tsx --test "src/fsd/pages/project-board/model/briefing.test.mjs"` | Passed, 50/50 | 현재 join 규칙의 회귀. 새 규칙의 통과가 아님 |
| `npm run test:web` | Passed, 805/805 | 첫 실행은 loopback bind EPERM으로 14개 실패. 실행 권한을 확보한 재실행에서 전부 통과 |
| `npm run test:server` | Passed, 177 passed / 2 skipped | 서버 대역 기반 회귀. 실제 DB·운영 인수 아님 |
| `npm run verify:fsd` | Passed | 기존 경계 |
| `npm run verify:server` | Passed | 기존 서버 경계 |
| `npm run test:architecture` | Failed, 319 passed / 2 failed / 2 skipped | 제한 밖 재실행 결과. 아래 시간 제한 관련 기준 실패를 분리 기록함 |
| `npm run check` | Passed | lint·문서·CI 범위·타입 통과, 스크립트 421 passed / 2 skipped |
| `npm run build` | Passed, fresh build | 첫 실행은 Turbopack CSS 처리의 port bind EPERM. 실패 산출물을 보존해 작업 트리 밖으로 옮기고 제한 밖 fresh build 후 통과 |
| Verification Plan의 §6 Node 문구 검사 | 수정 전 예상 실패(exit 1) | 옛 문구를 검출함. 별도 문구 fixture에 제안한 변경을 적용하면 exit 0; 실제 규약은 아직 변경 전 |
| 제안한 마지막 원소 선택의 메모리 내 시뮬레이션 | Passed, 60 cases | 세 요약 분기·공백·슬롯/별칭·예산·정적 HTML 검사. 소스 파일을 바꾸지 않았으며 실제 구현 후 회귀를 대체하지 않음 |

아키텍처 기준 실패는 `scripts/rehearsals/codex-init-eval.test.mjs`의 timeout 시 자식 출력 보존과
`scripts/rehearsals/rehearsal-cli.test.mjs`의 partial-write 사례다. 전자는 제한 시간 안에 출력이 없었고,
후자는 30초 child timeout으로 종료 상태가 null이었다. 최초 제한 환경에서는 같은 묶음의 7개가 실패했다.
두 파일만 분리 실행하면 11/11 통과했고, 같은 파일을 포함한 `npm run check`도 통과했다.
전체 `test:architecture`의 실패를 통과로 바꾸어 기록하지 않는다. 구현 후 같은 실행 환경에서 기준과 비교하고,
반복되면 별도 테스트 안정성 문제로 추적한다. 이 제안에서 unrelated 테스트를 고치거나 실패를 숨기지 않는다.

문서 대조에서 보완한 항목은 요약의 적용 분기·공백 결과 계약, 빠진 회귀·최종 HTML 검증,
fresh 작업 트리의 Prisma 준비 순서다. 테스트 파일 추가 범위와 제안서 기록을 포함해 `proposal-size`도
standard로 맞췄다. 운영 데이터·템플릿 관측은 당시 조사 기록의 범위이며 새 운영 조회나 쓰기는 하지 않았다.

### 구현 검증 (2026-11-12)

구현 기준은 `407be0b37758385a3086071f047efd790e27cd64`이고 브랜치는
`harness/board-activity-latest-result`다. 위 기준 검증과 같은 macOS·Node 26.4.0·npm 11.17.0 환경이다.
저장 방식·서버/API·Inbox·상세 페이지를 바꾸지 않고 네 제품 관련 파일을 수정했다.
미추적 제안서와 연결된 조사 기록은 PR에서 함께 보존한다. 조사 기록의 내용은 유지하고 제안서의 완료 경로를 가리키는 참조만 갱신한다.

| 검증 | 결과 |
| --- | --- |
| 모델·정적 렌더 회귀의 수정 전 실패 | 67개 중 10개 실패. 최신 결과·공백 마지막 결과·보류 뒤 완료·재보류·held 슬롯·HTML의 옛 질문 제거를 검출 |
| 모델·정적 렌더 회귀의 수정 후 성공 | 67/67 통과. 모델 59개, UI 8개 |
| `npm run test:web` | 815/815 통과 |
| `npm run test:server` | 177 passed / 2 skipped / 0 failed |
| `npm run verify:fsd`, `npm run verify:server` | Passed |
| `npm run test:architecture` | 321 passed / 2 skipped / 0 failed. 이전 기준 실행의 시간 제한 실패는 재현되지 않음 |
| `npm run check` | lint·문서·CI 범위·타입 통과, 스크립트 421 passed / 2 skipped |
| `npm run build` | Passed, Next 16.4.2 |
| Verification Plan의 §6 Node 문구 검사 | Passed, 실제 변경된 규약에서 exit 0 |
| `git diff --check` | Passed |
| PR의 `check` workflow | Passed: [run 43177591010](https://github.com/Sangeok/stagekeeper/actions/runs/43177591010), 구현 commit `15b03c0ae23c2f708edffb8348ecb59930ffb1a8`의 6개 job 모두 성공. Node 22의 static·제품·웹·서버·DB 통합·build 및 fresh manifest 검사 포함 |

서버 suite의 skip은 조건부 fresh manifest 검사이며 아키텍처 suite의 skip은 Windows LPAC 검사다.
서버 대역·정적 렌더 검증을 실제 DB·운영 데이터 전수 검사나 다른 OS의 통과로 확대하지 않는다.
제품 코드의 로컬 구현·검증과 PR CI 확인을 완료했다. 병합·배포는 이 요청의 범위 밖이다.

## Risks and Rollback

잔여 리스크:

- `proposed`·`in_review`·`planning`·`implementing`은 슬롯 분기 또는 상태 문구를 쓰므로 이 변경의 영향을
  받지 않는다. 슬롯 조건이 맞는 `done`도 기존 슬롯 문구를 유지한다.
- 앞선 결과(보류 사유, 되돌리기 노트, reopen 노트)는 항목이 완료되면 활동 줄에서 사라지고 항목 상세의
  결과 목록에만 남는다. 의도한 결과다.
- 과거 저장 데이터의 모든 원소가 한 완결된 기록인지는 전수 확인하지 않았다. 현행 전이 코드에는 문장
  분할이 없으며 새 규칙은 과거 데이터에도 마지막 원소를 그대로 적용한다. 구현·출시 때 해당 사례가
  발견되면 상세 결과 목록과 비교해 기록하고, 재결합·backfill이 필요하면 별도 범위로 결정한다.

롤백 방법:

- 구현 커밋을 revert한다. 데이터 변경이 없다.

## Completion or Closure Notes

- 구현 PR: [#336](https://github.com/Sangeok/stagekeeper/pull/336), base `dev`. 열린 PR이며 병합하지 않았다.
- 구현 commit: `15b03c0ae23c2f708edffb8348ecb59930ffb1a8`.
- 구현 결과: 마지막 결과의 첫 문장을 표시한다. 빈 배열은 reason, 공백 요약은 항목 키를 유지한다.
  슬롯 우선순위·원본 길이 예산·결과 배열·서버 전이는 유지한다.
- 검증 결과: 위 구현 검증 표와 CI run 43177591010. 이 완료 기록 커밋은 제품 코드를 추가로 바꾸지 않는다.
- 문서 보존: 원래 미추적이던 제안서와 직접 참조한 조사 기록을 함께 포함했다. 제안서는 이 완료 경로로,
  조사 기록의 제안서 참조도 같은 경로로 맞췄다. 원본 작업 트리의 미커밋 파일은 보존했다.
- remaining follow-up: PR 리뷰·dev 병합과 main 승격은 별도다. 운영 데이터 전수 검증은 수행하지 않았다.
  원문 조사의 세션 설정·웹 승인 위협 모델·템플릿 대기 표시는 별도 조사 범위로 유지한다.

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [x] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 문서 대조의 기준 검증과 구현 후 미실행 검증을 구분했다. 구현 뒤 기존·신규 실패를 다시 대조한다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [x] `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
