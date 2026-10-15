---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-15"
approved-by: "user:Sangeok"
approved-at: "2026-10-15"
approval-scope: "FSD-R02·R03·R04 전체 구현과 V02–V06 검증 — 대화의 실제 코드 수정 요청"
completed-at: "2026-10-15"
verification-summary: "FSD-R02·R03·R04 구현 완료; check·web 628·server 138 pass/1 unrelated skip·production build·DB 통합·브라우저 prod/dev 각 56·실제 두 탭/응답 유실 인수 통과"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/test-reports/completed/2026-10-15-fsd-clean-code-follow-up-acceptance.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-10-15-fsd-frontend-clean-code-review.md"
  - "docs/proposals/completed/2026-10-15-fsd-architecture-improvements.md"
---

# src/fsd 후속 클린코드 개선 제안

## Summary

`frontend-clean-code-orchestrator`로 `src/fsd` 전체를 독립적인 다섯 관점에서 검토하고 중립 품질 검증을 수행했다.
채택한 개선점은 **3건: Must 2건, Consider 1건**이다.
파이프라인 편집 초안의 암묵적 폐기, 보드의 실행 주체 오표시를 우선 수정하고, Billing 테스트의 불필요한 공개 API 결합을 줄이는 것을 제안한다.
최초 작업은 검토와 문서 작성이었다. 이후 실제 구현 요청으로 Core 세 항목을 모두 구현·검증했다.
최종 결과는 [인수 보고서](../../test-reports/completed/2026-10-15-fsd-clean-code-follow-up-acceptance.md)에 기록했다.
아래 문제 근거·계획·정합성 검토는 구현 전 기록이며, 완료 판정은 metadata와 구현 후 결과를 따른다.
후속 정합성 검토에서 세 지적은 유지하고, 프로젝트 identity·초안/CAS 상태 전이·검증 도착점의 누락을 보완했다.

## Goal

- 같은 프로젝트의 서버 데이터가 갱신되어도 사용자가 저장하거나 폐기하지 않은 파이프라인 초안을 보존한다.
- Board의 Team 상태가 현재 노드를 실행하는 에이전트를 정확하게 나타내게 한다.
- Billing이 사용하지 않는 entity API 변경 때문에 Billing 테스트까지 수정하는 비용을 줄인다.

## Proposal Size

`standard`. 후속 구현은 React 상태 수명, 편집 충돌 복구, 서버 데이터와 화면의 조합 및 여러 테스트 파일에 걸친다.
새 의존성, DB migration, FSD 계층 재편은 필요하지 않다.

## Current State

검토 기준은 **2026-10-15, HEAD `ef9d8f4f3dc26a0473ab0fa856c86c1ef711fd98`**다.
시작 시 `harness/trim-inbox-gate-public-api` 작업 트리는 깨끗했다. 아래 행 번호는 이 기준 소스를 가리킨다.
후속 정합성 검토도 같은 HEAD에서 수행했다. 당시 변경 사항은 이 미추적 제안서 하나였으며,
최초 검토 결과와 이번 정합성 검토에서 추가 실행한 결과를 구분한다.

| 영역 | 파일 수 | 줄 수 |
| --- | ---: | ---: |
| entities | 32 | 1,016 |
| features | 100 | 4,032 |
| pages | 53 | 2,587 |
| shared | 27 | 675 |
| widgets | 25 | 1,437 |
| 합계 | **237** | **9,747** |

각 렌즈는 테스트·fixture·public API를 포함한 전체 대상을 읽었다.
검토 환경은 Next.js 16.3.3, React 19.2.8, TypeScript 5.9.3 및 strict 설정이다.
프레임워크 근거는 설치된 `node_modules/next/dist/docs/`를 사용했다.
FSD 자동 경계 검사는 통과했다. 이는 아래 상태 수명·표시 동작이 올바르다는 보장은 아니다.

기존 완료 제안서의 해결된 항목을 재등록하지 않았다.
특히 기존 FSD-001은 여러 적격 항목 중 실행 중인 항목을 우선하는 문제였고,
이번 FSD-R04는 **다른 에이전트의 현재 실행을 담당 dev의 실행으로 해석하는 문제**다.

## Scope

검토 대상은 `src/fsd` 전체다. 직접 연결된 route·server·core 계약, 테스트 및 제품 문구는 근거 확인에 사용했다.
후속 구현의 **Core는 FSD-R02·R03·R04 세 항목 전부**다. Consider는 우선순위이며 실행 범위에서 제외한다는 뜻이 아니다.
Phase 2·Approval-after 항목은 없다. 아래 모델·UI·route의 identity 연결, 테스트·fixture·리허설 및 관련 문구/검증 지침을 함께 수정한다.

서버 권한·토큰·DB 저장 정책, 파이프라인 실행 규칙, 배포, 전역 상태 도입 및 대규모 파일 이동은 범위 밖이다.
Board와 turn-banner의 서로 다른 실행 매칭 계약을 통합하지 않는다.

### 구현 기준 문서와 검토 범위

현재 구현 지침은 이 문서와 `AGENTS.md`, `docs/architecture/README.md`·`fsd.md`·`test-organization.md`·`verification.md`,
`docs/proposals/README.md`·`template.md`, `docs/conventions/product-copy.md`의 Team 및 Pipeline 절이다.
`docs/architecture/protocol.md`의 슬롯·구현 구간 종료 계약과 아래 명시한 코드·시험·리허설도 직접 근거에 포함한다.
`related`의 두 completed 제안서는 과거 완료 기록이며 이번 구현을 위임하는 추가 계획서가 아니다.

정합성 검토 프로필은 **High-Risk**다. 초안 보존과 CAS 기준, 편집 권한 변경, 비동기 응답 및 실제 화면 검증 경로가 연결된다.
이는 저장소의 `proposal-size: standard`와 별개다. 운영 배포·전체 앱의 재감사는 포함하지 않는다.

## Proposal

| ID | 심각도 | 개선 항목 | 기여 렌즈 |
| --- | --- | --- | --- |
| FSD-R03 | Must | 서버 snapshot 갱신과 파이프라인 초안 초기화 분리 | Predictability |
| FSD-R04 | Must | Team에서 현재 노드 실행 주체와 담당 dev 구분 | Readability |
| FSD-R02 | Consider | Billing 테스트의 entity export 구조 고정 완화 | Coupling |

Must는 실제 버그 또는 사용자 흐름 손상, Consider는 근거가 있는 낮은 우선순위 개선이다.
FSD-R03은 원 렌즈의 Should에서, 명시적 폐기 없이 사용자 편집을 잃는 영향에 따라 중립 검증이 Must로 조정했다.
관점 간 동의 수나 스킬의 내부 우선순위는 심각도 근거로 사용하지 않았다.

### FSD-R03 — 서버 snapshot 갱신과 파이프라인 초안 초기화 분리

**근거:** [ProjectPipelinePage:38](../../../src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx#L38)는
`PipelineRail`의 key를 `saved.version`, `plan`, `editable`로 만든다.
[PipelineRail:32](../../../src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx#L32)는 초안 graph와 저장 기준 graph/version을 초기 상태로 보관한다.
따라서 동일 프로젝트에서 위 prop이 바뀌면 새 key로 rail이 재생성되어 초안과 복구 상태가 초기화된다.

같은 화면의 [Scout Action:14](../../../src/fsd/features/edit-pipeline/api/automatic-scout.server.ts#L14)는 프로젝트 layout을 revalidate한다.
[파이프라인 route:14](../../../src/app/(app)/p/[slug]/pipeline/page.tsx#L14)는 현재 version을 다시 조회한다.
**탭 A에서 graph 편집 → 탭 B에서 새 version 저장 → 탭 A에서 Scout 설정 변경 → 새 snapshot 수신** 순서에서는
A가 graph를 저장하거나 폐기하지 않았어도 초안이 사라진다.

이 동작은 [stale/unknown 안내](../../../src/fsd/features/edit-pipeline/model/pipeline-save-state.ts#L9)의 초안 보존과
[명시적 폐기 동작](../../../src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx#L178)에 어긋난다.
기존 [PipelineFixture:66](../../../tests/server/fixtures/src-clean-code-browser.tsx#L66)는 rail을 직접 렌더하므로 page의 key를 거치는 경로를 검증하지 않는다.

**확인 수준:** 원본 page를 메모리에서 호출해 실제 React element의 key가
`3:pro:true` → `4:pro:true`로 바뀌는 것을 확인했다. plan 및 editable 변경도 key를 바꾼다.
이 최초 확인에서 저장 Action 호출은 0회였다. 최초 확인 자체는 브라우저 재현이 아니다.
설치 문서 `revalidatePath.md:19,42`의 현재 화면·하위 page 갱신과 `preserving-ui-state.md:281`의 key 기반 초기화 계약을 함께 근거로 삼았다.
두 문서는 각각 `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/`, `01-app/02-guides/` 아래에 있다.

**후속 정합성 검토의 추가 확인:** 원본 page와 rail을 로컬 메모리 번들로 실제 브라우저에 렌더했다.
Propose 노드를 제거한 뒤 version·plan·editable 변경 또는 Scout 응답에 의한 version 변경을 각각 주입했다.
네 경우 모두 rail 본문에서 Propose가 다시 나타나고 Discard가 사라졌다. 파이프라인 저장 호출은 모두 0회,
Scout 호출은 마지막 경우만 1회였다. props/Action 응답은 시험 대역이며 실제 Next revalidation·DB 인수는 아니다.

**identity와 소유권:** route가 `requireProjectOwner`로 얻은 `projectId`를 `ProjectPipelinePage`의 필수 prop으로 전달한다.
page는 `PipelineRail key={projectId}`를 사용한다. version/plan/editable은 key에 넣지 않는다.
다른 프로젝트로 바뀐 동일 렌더 위치에는 새 rail이 생긴다. 프로젝트 A의 상태를 B에 적용해서는 안 된다.
현재 `next.config.mjs`에는 `cacheComponents`가 없으므로 설치 문서의 Activity 기반 route 보존을 현재 동작으로 가정하지 않는다.
Cache Components 도입이나 페이지 이탈 후 초안 영구 보존은 범위 밖이다. 이 변경은 UI identity이며 Action의 권한 입력을 대체하지 않는다.
`savePipeline.bind(null, slug)`와 `saveAutomaticScout.bind(null, slug)`는 기존대로 서버 조합 지점에서 전달한다.

**상태 계약:** `features/edit-pipeline/model/pipeline-draft-state.ts`에 내부 순수 상태 전이를 둔다.
draft graph, baseline graph/version, 관찰한 최신 서버 snapshot, 저장 중인 요청의 graph/version, stale/unknown 복구 상태를 구분한다.
`Graph`는 기존 `rail-state.ts`의 타입을 재사용하고, Action 입력·결과는 기존 `pipeline-save-state.ts` 계약을 유지한다.
UI가 이 전이를 소비하며 모델은 React·Next·서버·toast에 의존하지 않는다. 외부 public API로 내보내지 않는다.
`dirty`만으로 동기화 허용을 판단하지 않고 **저장 중 아님·복구 중 아님·초안 변경 없음**을 모두 확인한다.
새 props를 관찰하는 경로는 같은 내용의 재렌더를 무시하고, 초안 변경만으로 반복 동기화하지 않는다.

| 상태/입력 | 처리 | 저장·복구 조건 |
| --- | --- | --- |
| 최초 진입 | draft와 baseline을 서버 graph/version으로 초기화. 미저장 기본 graph의 version은 0 | GET에서 버전을 생성하지 않음 |
| 미편집 상태에서 새 snapshot | draft·baseline을 함께 수용 | 버전뿐 아니라 graph 내용도 비교. version 0에서 plan 변경으로 기본 graph가 달라지는 경우 포함 |
| 편집 중 더 높은 서버 version | 최신 snapshot만 기록하고 draft·기존 baseline 유지, 기존 `PIPELINE_STALE` 안내로 명시적 복구 요구 | 새 version으로 초안을 자동 재기준화하거나 저장하지 않음 |
| 편집 중 같은 version의 plan/권한/roster 갱신 | draft·baseline 유지, 현재 props의 편집 가능 여부와 graph 검증을 즉시 적용 | 메뉴·게이트 없는 저장 확인을 해제. 새 제한을 위반하는 저장은 서버에서도 기존대로 거부 |
| 저장 시작 | 제출 graph와 baseline.version을 고정하고 중복 저장·graph 변경·폐기를 잠금 | 기존 `saving` 동기 잠금 유지. Scout는 자체 pending 조건만 적용 |
| 저장 중 snapshot 수신 | 최신 snapshot만 기록. 성공으로 추정하거나 초안을 지우지 않음 | 동일 version·graph라도 응답 성공을 대신하지 않음 |
| 저장 성공 | 제출 graph와 반환 version을 baseline으로 확정하고 pending 해제 | 확정 version보다 낮은 늦은 snapshot은 무시. 대기 중 더 높은 snapshot이 있으면 미편집 상태에서만 수용 |
| 명시적 error | 초안 유지, pending 해제, 기존 오류 표시 | 새 충돌 snapshot이 없다면 사용자 재시도 허용. 이미 더 높은 snapshot을 관찰했다면 stale 복구로 전환 |
| stale 또는 Promise reject | 각각 stale/unknown 상태와 원래 초안·baseline 유지 | Save 차단. 이후 snapshot이 도착하거나 초안을 원값으로 되돌려도 자동 복구·재제출하지 않음 |
| 일반 Discard | 저장 중이 아닐 때 관찰한 최신 snapshot으로 draft·baseline을 함께 교체 | Action 0회. 최신 snapshot이 없으면 현재 baseline 사용 |
| stale/unknown의 Discard changes and reload | 저장 중이 아닐 때 현재 route를 명시적으로 새로 읽음 | 기존 `window.location.reload()` 유지. mutation 재시도 없음 |
| editable=false | graph 편집·Save 차단, 초안 보존 | 로컬 Discard/명시적 reload는 쓰기가 아니므로 pending이 아니면 제공. 다시 writable이 되어도 자동 저장하지 않음 |
| 프로젝트 변경·unmount | 이전 인스턴스의 응답이 새 인스턴스의 상태·toast·잠금에 영향을 주지 못하게 함 | `alive` cleanup과 요청 소유권 유지. 이미 보낸 서버 mutation이 취소됐다고 간주하지 않음 |

서버 version이 있는 graph는 version 단위로 불변이다. 동일 버전의 단순 객체 재생성을 새 snapshot으로 취급하지 않는다.
미저장 기본 graph(version 0)는 plan에 따라 바뀔 수 있으므로 별도로 비교한다.
기존 zero-gate 이중 확인, snapshot 복사, Action의 인증·플랜·가용성 검사와 `expectedVersion + 1` CAS는 보존한다.
새 전역 store·로컬 영구 저장·자동 저장·자동 mutation 재시도는 만들지 않는다.

**최종 화면:** rail은 draft를, page의 version/format과 Read as text는 최신 서버 snapshot을 나타내는 기존 소유권을 유지한다.
서버가 앞선 편집 중 상태에서는 stale 안내가 이 차이를 설명한다. 새 snapshot 수용·폐기 때 rail의 열린 메뉴와 zero-gate 확인은 초기화한다.
읽기 전용에서도 로컬 폐기/복구만 가능한 예외를 `product-copy.md` §18에 반영하되,
`pipeline-save-recovery` 잠금 블록의 기존 세 문장은 변경하지 않는다.

**완료 기준:** 아래 V03 표의 모든 상태와 실제 page 조합·서버 revalidation 인수를 통과한다.
key 제거 또는 rail 단독 정적 렌더 통과만으로 완료하지 않는다.

### FSD-R04 — Team에서 현재 노드 실행 주체와 담당 dev 구분

**근거:** [workerState:106](../../../src/fsd/pages/project-board/model/briefing.ts#L106)는 담당 agent와
`planning | implementing` 상태를 기준으로 working/queued 후보를 고른다.
반면 [Board loader:29](../../../src/fsd/pages/project-board/api/project-board.server.ts#L29)의 `dispatched`는
현재 노드의 `dispatcherFor(node, agent)`에 해당하는 실행이 열려 있는지 뜻한다.

`plan → implement → doc-auditor#2 → accept`는 허용되는 그래프다.
implement 완료 후 auditor에 진입해도 구현 구간이 끝나기 전이므로 상태는 `implementing`이다.
근거는 [core 회귀:23](../../../packages/core/pipeline.test.mjs#L23)과 [구현 구간 종료 계약](../../architecture/protocol.md#L297)이다.
현재 모델에 `agent=web-dev`, `node=doc-auditor#2`, `status=implementing`을 전달하면 다음 결과를 얻는다.

| 현재 노드 실행 여부 | Activity | Team / doc-auditor | Team / web-dev |
| --- | --- | --- | --- |
| `true` | auditor 작업 중 | `Working on K-1` | **`Working on K-1` — 잘못된 실행 주체** |
| `false` | auditor 대기 | `Ready for K-1` | **`Ready for K-1` — dev 차례가 아님** |

**재현:** 원본 `validateGraph`는 위 graph를 허용했고, `advance`는 상태 전이 없이 auditor 노드로 이동했다.
원본 `buildBriefing`과 기존 row fixture를 메모리에서 실행해 두 결과를 확인했다.
실제 DB나 UI를 사용한 재현은 아니다.
[제품 문구:316](../../conventions/product-copy.md#L316)는 현재 노드를 도는 에이전트의 열린 실행을 기준으로 삼고,
dev의 `Working on`은 자기 실행이 열린 경우로 한정한다.

**최소 변경:** workspace agent의 working/queued 후보를 현재 노드가 `plan | implement`이고
해당 agent를 디스패치하는 행으로 제한한다. 이 조건에 의미가 드러나는 이름을 붙이고,
`dispatched` 필드 이름은 유지하고 주석을 현재 노드 실행 여부라는 뜻으로 고친다.
기존 review/hold/done 우선순위와 같은 우선순위의 서버 목록 순서는 유지한다.
loader의 keyed/null-key 매칭 정책이나 core 상태 기계는 바꾸지 않는다.

**완료 기준:** auditor/scout가 앵커 사이에서 실행·대기하는 실제 허용 그래프에 workspace roster를 함께 넣어 검증한다.
해당 슬롯 때문에 dev가 같은 작업의 Working/Ready로 표시되지 않고, dev 자신의 plan/implement 작업은 기존대로 표시되어야 한다.
기존 [슬롯 상태 시험:254](../../../src/fsd/pages/project-board/model/briefing.test.mjs#L254)은 `[node]`만 전달하므로,
새 회귀는 plan/implement와 슬롯을 함께 포함해야 한다.
도달 가능한 `implementing` 구간의 `doc-auditor`·`doc-auditor#2`·`feature-scout`·`feature-scout#2`를 각각 true/false로 검사한다.
각 단일 항목 fixture에서 dev는 `Idle`, 현재 슬롯 담당자는 Working/Ready가 되어야 한다.
별도의 dev plan/implement 항목이 있으면 그 항목을 선택해야 한다. null/gate cursor, review·hold·done 우선순위, 동순위 순서도 보존한다.
기존 `tests/server/project-page-loaders.test.ts`에 실제 loader → 모델 → Team의 dev 단언을 추가하고,
keyed 매칭과 slots-v1 null-key entry 매칭의 차이를 그대로 유지한다.

### FSD-R02 — Billing 테스트의 entity export 구조 고정 완화

**근거:** [plan-matrix.test.ts:16](../../../src/fsd/pages/billing/model/plan-matrix.test.ts#L16)는 account-plan의
export 선언이 정확히 하나이며 내부 경로와 전체 export 목록이 특정 값일 것을 요구한다.
Billing 화면이 사용하는 계약은 공개된 `planLabel`이다.

**재현:** 원본 index 소스를 메모리에서 파싱한 뒤, 문자열에 적법한 `Plan` type export 하나를 추가했다.
`planLabel`은 그대로인데 export 선언 수가 1에서 2로 바뀌어 현재 고정 개수 assertion이 실패함을 확인했다.
실제 파일이나 public API는 변경하지 않았다.

**최소 변경:** export 개수·정확한 내부 경로·전체 이름 목록 검사를
필요한 `planLabel` 계약과 금지된 Billing 전용 export(`PlanRow`, `planMatrix`, `BILLING_NOTE`)의 부재 검사로 좁힌다.
Billing 자체 선언 소유권, 화면의 올바른 import 및 표의 동작 시험은 유지한다.
같은 테스트의 11–15행에는 내부 파일을 읽는 다른 검사가 남을 수 있으므로, 이 변경으로 내부 이동에 대한 모든 결합을 제거한다고 주장하지 않는다.

**완료 기준:** Billing과 무관한 적법한 export 추가는 실패시키지 않고,
필수 공개 계약 누락·Billing 전용 선언 유출·잘못된 import는 계속 탐지한다.
새 제품 export를 실제로 추가할 필요는 없다.
같은 테스트 파일 안에서 export 이름 수집을 국소 helper로 정리하고, 메모리 소스의 정상 추가·필수 export 누락·금지된 세 이름 노출을 검증한다.
type-only export도 금지 이름 검사에 포함하며, 실제 `planLabel` 값은 기존 entity 테스트와 Billing 렌더 시험으로 확인한다.
현재 내부 `plan-label.ts` 읽기와 과거 파일 부재 검사는 그대로 두므로 이 작업을 entity 내부 구조 전체의 독립화로 확대하지 않는다.

## Affected Files

| 항목 | 예정 변경 경로 또는 영역 | 작업과 리스크 |
| --- | --- | --- |
| FSD-R03 | `src/app/(app)/p/[slug]/pipeline/page.tsx`, `src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx` | 필수 projectId 전달·rail key 변경. medium — 프로젝트 격리 |
| FSD-R03 | `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx`, `src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs` | 상태 모델 연결·읽기 전용 복구·기존 렌더 회귀. medium — CAS와 권한 보존 |
| FSD-R03 | 신규 `src/fsd/features/edit-pipeline/model/pipeline-draft-state.ts`, `src/fsd/features/edit-pipeline/model/pipeline-draft-state.test.ts` | snapshot·요청·복구의 내부 순수 전이와 모든 전이 표 시험 |
| FSD-R03 | 신규 `src/fsd/pages/project-pipeline/ui/project-pipeline-page.test.ts` | projectId 기반 key, 서버 snapshot 본문, Action 참조 전달 시험 |
| FSD-R03 | `tests/server/fixtures/src-clean-code-browser.tsx`, `tests/server/fixtures/src-clean-code-acceptance.ts` | 실제 page의 snapshot/권한/projectId 갱신 모드와 자동 단언 추가. 기존 rail 단독 시험 유지 |
| FSD-R03 | `scripts/rehearse-src-clean-code.ts` | 실제 pipeline route 인증 진입·DB read-back·Action별 fault seam 추가. 테스트 환경 전용 |
| FSD-R03 | `tests/server/pipeline-save.test.ts` | 기존 CAS/Action 시험 보존, fresh manifest의 두 Action 등록·내부 모델 비등록 검사 확장 |
| FSD-R03·R04 | `docs/conventions/product-copy.md` §18, `docs/architecture/verification.md`의 클린코드 인수 절 | 읽기 전용 로컬 복구와 새 검증 진입/종료/판정 방법 반영. 기존 copy-lock 유지 |
| FSD-R04 | `src/fsd/pages/project-board/model/briefing.ts`, `src/fsd/pages/project-board/model/briefing.test.mjs`, `src/fsd/pages/project-board/ui/project-board-page.test.mjs` | 실행 주체 조건 및 모델·Team 본문 회귀 |
| FSD-R04 | `tests/server/project-page-loaders.test.ts` | 실제 loader의 dev 오표시 방지 단언 추가, 현재 dispatch 정책 보존 |
| FSD-R02 | `src/fsd/pages/billing/model/plan-matrix.test.ts` | 공개 표면 assertion 축소. low — 소유권 회귀를 제거하지 않음 |

신규 3파일은 현재 없고 부모 디렉터리는 모두 존재하며 충돌은 없다. 이동·삭제할 파일은 없다.
새 slice·export symbol 확대·core 테스트 이동은 없다. page의 필수 prop 추가는 route와 신규 fixture/test를 같은 변경으로 갱신한다.

### 공개 계약과 보존할 직접 의존성

| Symbol/계약 | 현재 소유·공개 경로 | 변경 후 소비/검증 |
| --- | --- | --- |
| `ProjectPipelinePage` | page UI → `src/fsd/pages/project-pipeline/index.ts` | route와 새 fixture는 `@/fsd/pages/project-pipeline` 사용. `projectId` 필수화, export symbol은 유지 |
| `PipelineRail`, `SavePipelineAction`, `AutomaticScoutControl`, `SaveAutomaticScoutAction`, `Graph` | `src/fsd/features/edit-pipeline/index.ts` | page import 유지. 새 draft 모델은 같은 slice의 상대 import이며 barrel에 추가하지 않음 |
| `savePipeline`, `saveAutomaticScout` | 각 `api/*.server.ts` → feature `index.server.ts` | route의 bind와 Action prop 그대로. Client에서 서버 모듈 import 금지 |
| 입력/schema·CAS | `model/pipeline-save-state.ts`, `model/save-pipeline-input.ts`; `src/server/pipeline/version-save-query.ts` | 데이터 계약·서버 구현 유지. 기존 schema·server·DB 통합 시험으로 회귀 |
| 서버 snapshot/권한 | `src/server/pipeline/run.ts` → `run-query.ts:loadCurrentVersionView`; `src/server/auth/guard.ts`, `src/server/entitlement.ts` | route의 guard 선행과 조회 전용 계약 유지. guard·save 시험 및 실제 GET read-back |
| `buildBriefing` | `src/fsd/pages/project-board/model/briefing.ts` | 같은 slice loader/UI 시험, 기존 서버 loader 시험이 소비. public API 확대 없음 |
| `ProjectBoardPage`, `loadProjectBoard` | page `index.ts` / `index.server.ts` | `src/app/(app)/p/[slug]/page.tsx`의 조합 유지. Activity·Team·item href 실제 본문 확인 |
| `planLabel` | `src/fsd/entities/account-plan/model/plan-label.ts` → `index.ts` | Billing의 공개 경로 import 유지. 실제 함수 테스트와 Billing 본문 검증 |
| Billing 모델·UI | `src/fsd/pages/billing/model/plan-matrix.ts`, `ui/billing-page.tsx` | 내용·순서·사용량 표시 유지. 변경은 해당 모델 테스트의 API assertion뿐 |

`packages/core/pipeline.mjs`·`pipeline.d.mts`·`pipeline.test.mjs`·`entitlement.mjs`,
`src/fsd/pages/project-board/api/project-board.server.ts`, `src/fsd/entities/pipeline/model/labels.ts`,
`src/fsd/features/edit-pipeline/model/rail-state.ts`, `src/fsd/features/edit-pipeline/ui/automatic-scout-control.tsx`,
`src/fsd/features/edit-pipeline/api/automatic-scout.server.ts`는 동작 보존 대상이다.
공유 본문 의존성은 `src/fsd/shared/ui/button.tsx`·`chip.tsx`·`section-label.tsx`,
`src/fsd/shared/lib/class-name.ts`·`relative-time.ts`, `src/fsd/shared/routes/project.ts`다.
Next 설정·의존성·Prisma schema는 변경하지 않는다.

## Runtime and Final Artifacts

| 최종 산출물 | 최종 소유 경로와 본문 | 의존성/우선순위 | 검증 도착점 |
| --- | --- | --- | --- |
| `/p/[slug]/pipeline`의 rail | route → page → Client rail의 draft·메뉴·Save·복구 표시 | projectId가 인스턴스 identity. state 표가 snapshot과 응답 충돌을 결정. 현재 plan/editable은 제어 가능 여부에 즉시 적용 | V03의 실제 page DOM, 제출 payload, 두 탭 인수 |
| 같은 화면의 version/format·Read as text·Scout | page의 최신 서버 snapshot, Scout의 현재 enabled | rail 초안으로 서버 설명을 덮어쓰지 않음. `sequence`·labels·서버 Action 참조 유지 | 최신 version과 목록 본문, rail 초안, Scout 호출을 각각 단언 |
| `/p/[slug]` Activity·Team | loader → `buildBriefing` → `ProjectBoardPage` | 기존 status·slot labels·itemPath 유지. Team dev 자격만 좁힘 | V04 모델·loader 결과와 정적 HTML의 handle별 상태·링크 |
| `/billing` 표·플랜 표시 | 기존 Billing page와 모델, account-plan의 공개 `planLabel` | core 플랜 값과 기존 문구 우선, 새 표/값 없음 | V02 기존 Billing·planLabel 테스트 본문 |
| production Action registry | fresh build의 `.next/server/server-reference-manifest.json` | source module·export의 node/edge registry 및 worker 구조. 오래된 `.next`는 근거 아님 | V05의 parser 기반 검사에서 `savePipeline`·`saveAutomaticScout` 등록, draft 모델 등록 없음 |

이들 본문은 기존 텍스트·React 컴포넌트·CSS로 구성되며 새 이미지·폰트·정적 URL·환경설정은 없다.
원본 UI 본문은 정적 렌더/브라우저에서 확인했고, 변경 후 승리하는 상태와 검증 도착점은 위와 같이 고정한다.

## Safety Analysis

- route의 조회 → page → rail 연결과 Scout Action의 revalidation을 확인했다. 권한 검사는 서버에 유지한다.
- Board loader가 만드는 `dispatched`와 순수 모델 소비, 실제 core 전이 및 제품 문구를 대조했다.
- Billing의 public API 소비와 소스 기반 assertion을 구분했다. 검사 삭제로 경계를 약화하지 않는다.
- 기존 테스트가 놓치는 조합 경로를 확인했다. 브라우저 이벤트와 서버 통합이 검증됐다고 과장하지 않는다.
- 정적 자산 URL, 동적 import, DB schema, 외부 SDK 및 운영 데이터 변경은 필요하지 않다. V06의 격리 시험 DB에는 fixture 데이터를 만들고 종료 시 정리한다.
- 읽기 전용의 로컬 Discard는 graph·baseline/페이지 읽기만 바꾸고 Server Action을 호출하지 않는다. 서버 쓰기 권한을 넓히지 않는다.
- pending/stale/unknown 중 snapshot만 보고 성공으로 간주하지 않는다. 브라우저 이탈은 서버 취소/rollback 증거가 아니다.
- 시험 대역은 실제 컴포넌트와 Action 참조의 경계를 보존한다. 실제 RSC·DB 인수는 별도 V06으로 닫는다.

## Approval

대화의 실제 코드 수정 지시로 Core 전체와 검증을 승인받아 수행했다. 승인 기록은 front matter를 단일 기준으로 사용한다.

## Execution Plan

1. 원격 `dev`에서 `harness/<topic>` 구현 브랜치를 준비하고 기준 소스·소비처·신규 파일 충돌을 재확인한다. 문서만 검토한 현재 작업에서는 브랜치·코드를 바꾸지 않는다.
2. FSD-R04의 실제 허용 graph와 roster를 모델·loader·본문 회귀로 고정하고 dev 후보 조건/주석만 수정한다.
3. FSD-R03의 page 조합 회귀를 먼저 추가해 원본 실패를 확인한다. 새 내부 상태 모델과 전이 시험을 작성하고 route→page의 projectId, rail key/상태/로컬 복구를 같은 변경에서 연결한다.
4. `src-clean-code-browser.tsx`에 `pipeline-page` 모드, `src-clean-code-acceptance.ts`에 V03 단언을 추가한다. 프로젝트·props 설정과 graph/Scout 응답 완료를 각각 제어하고 cleanup에서 setter·보류 Promise·root를 정리한다. 기존 단독 pipeline/scout 모드는 보존한다.
5. `rehearse-src-clean-code.ts`에 아래 V06의 인증 진입·read-back·일회성 Action 응답 유실을 추가한다. 범용 socket 파괴를 새 시나리오의 근거로 사용하지 않는다. 제품 문구 §18 및 검증 지침에 새 복구/실행 경로를 반영한다.
6. FSD-R02의 API assertion을 좁히고 세 금지 이름·필수 값·올바른 import를 계속 검증한다.
7. V02–V06과 공통 게이트를 실행한다. 초기 실패/수정 후 결과, 실제 DB·브라우저와 fixture 대역, 정리 상태를 구분하고 DoD를 판정한다.

## Verification Plan

다음은 **후속 구현 시 실행할 명령**이다. 이미 실행한 변경 전 기준선은 Verification Results에 따로 기록한다.
명령은 저장소 루트의 POSIX shell을 기준으로 한다. `/private/tmp`는 macOS 임시 경로 별칭 문제를 피하는 조건이다.

| ID | 변경 후 검증 도착점 | 반드시 관찰할 결과 |
| --- | --- | --- |
| V02 | Billing 모델 시험·실제 Billing/planLabel 렌더 | 공개 API에 정상 type/value export가 추가되어도 통과; `planLabel` 누락 및 `PlanRow`·`planMatrix`·`BILLING_NOTE` 노출은 모두 실패. 표·사용량·import·옛 파일 부재 유지 |
| V03 | 새 draft 모델 시험, 새 page 시험, 실제 page 브라우저 `pipeline-page` 모드 | 상태 표 전체: clean/dirty/pending/stale/unknown × 동일/새/낮은 snapshot, version 0의 plan 기본값, plan/권한/roster 변화, 프로젝트 변경, 저장 응답 순서, zero-gate 확인, 로컬 Discard. graph/Scout의 호출 수·각 payload·baseline·rail DOM을 함께 확인 |
| V04 | briefing 모델·Board HTML·실제 Board loader | 슬롯 4종 × dispatched 2종의 실제 implementing 경로에서 dev Idle·슬롯 Working/Ready. dev 자신의 plan/implement, 다중 항목 순서, review/hold/done, gate/null cursor, keyed/null-key entry 조건 유지 |
| V05 | 전체 정적/단위 게이트와 fresh production 산출물 | 기존 검사 통과, 새 파일 실행 확인, Client graph에 서버 값 import 없음, 기존 두 pipeline Action 등록 및 내부 draft 모델 비등록 |
| V06 | fresh Next의 실제 `/p/[slug]/pipeline`, 두 탭, fixture DB read-back | 별개 Scout 저장 후 A의 초안·기존 baseline 보존; B의 version만 추가, A 저장은 stale 또는 이미 표시된 복구로 차단. before/after 응답 유실 각각 DB +0/+1; 명시적 reload는 +0, 최신 본문 수용 |

V03에서는 한 번에 두 응답을 보류하여 Scout 응답이 graph 응답보다 먼저/나중인 경우를 모두 확인한다.
이전 프로젝트 응답의 success/error/stale/reject는 새 프로젝트의 state·toast·잠금에 영향을 주지 않아야 한다.
읽기 전용에서는 편집/Save가 없거나 비활성이고, 로컬 Discard는 동작하지만 Action 호출은 늘지 않아야 한다.
실제 reload로 브라우저 문맥이 사라지는 복구 완료는 V06에서 확인하며, V03의 버튼 존재만으로 대체하지 않는다.

집중 시험의 정확한 실행 경로:

```bash
TSX_DISABLE_CACHE=1 node --import tsx --test \
  src/fsd/pages/project-board/model/briefing.test.mjs \
  src/fsd/pages/project-board/ui/project-board-page.test.mjs \
  src/fsd/pages/project-pipeline/ui/project-pipeline-page.test.ts \
  src/fsd/features/edit-pipeline/model/pipeline-draft-state.test.ts \
  src/fsd/features/edit-pipeline/model/pipeline-save-state.test.ts \
  src/fsd/features/edit-pipeline/model/save-pipeline-input.test.ts \
  src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs \
  src/fsd/features/edit-pipeline/ui/automatic-scout-control.test.ts \
  src/fsd/pages/billing/model/plan-matrix.test.ts \
  src/fsd/pages/billing/ui/billing-page.test.ts \
  src/fsd/entities/account-plan/model/plan-label.test.ts

TSX_DISABLE_CACHE=1 node --import ./tests/server/register-server-only.mjs --import tsx --test \
  tests/server/pipeline-save.test.ts \
  tests/server/automatic-scout-actions.test.ts \
  tests/server/project-page-loaders.test.ts \
  tests/server/project-guard.test.ts
```

첫 명령의 신규 시험 두 개는 구현 후 존재해야 한다. 신규 모델·시험은 `test:web`/타입 검사 탐색 범위에도 포함된다.
기존 `pipeline-save`의 auth·plan·schema·CAS 거부와 성공에만 revalidate하는 계약,
`automatic-scout-actions`의 별도 설정/프로젝트 layout 갱신, `project-guard`의 인증 선행·소유권·읽기 전용을 유지한다.

공통 게이트와 fresh registry:

```bash
npm run verify:fsd
env TMPDIR=/private/tmp npm run test:architecture
npm run lint
node_modules/.bin/tsc --noEmit --incremental false
env TMPDIR=/private/tmp npm run check
env TMPDIR=/private/tmp npm run test:web
npm run build
env TMPDIR=/private/tmp RDC_CHECK_ACTION_MANIFEST=true npm run test:server
```

기존 `tests/server/fixtures/action-manifest.ts`의 구조 파서를 사용한다.
`tests/server/pipeline-save.test.ts`의 조건부 manifest 시험을 확장해 `api/edit-pipeline.server.ts:savePipeline`과
`api/automatic-scout.server.ts:saveAutomaticScout`의 등록, 새 `model/pipeline-draft-state.ts`의 비등록을 확인한다.
등록 ID의 고정 문자열이나 이전 빌드 manifest를 사용하지 않는다. 이 추가 시험 변경도 FSD-R03 범위다.

브라우저 실행:

```bash
env TMPDIR=/private/tmp node --import tsx scripts/rehearse-src-clean-code.ts --ui-only
# 위 실행을 Finish로 종료한 다음 development에서도 같은 V03을 실행:
env TMPDIR=/private/tmp node --import tsx scripts/rehearse-src-clean-code.ts --ui-only --fixture-development
```

`http://127.0.0.1:55452/fixture?mode=pipeline-page`는 새 모드의 직접 확인 경로다.
Run acceptance 또는 `?mode=copy&autorun`에서 기존 전체 시험과 새 V03을 실행하고 `/results`의 개별 결과를 확인한다.
숨겨진 Read as text 목록까지 세어 rail의 draft와 혼동하지 않도록 rail DOM과 서버 설명 DOM을 분리해 단언한다.
Finish는 root unmount → 보류 응답 정리·컨트롤 초기화 → pagehide listener 제거 → `/finish`로 서버 종료를 완료해야 한다.

V06은 `scripts/test-server-integration.mjs:validateTestDatabase`가 허용한 별도의 `stagekeeper_test_*` PostgreSQL이 필요하다.
`TEST_DATABASE_URL`은 기존 `DATABASE_URL`과 host/port/database 기준으로 달라야 하며 자격 정보는 기록하지 않는다.
해당 환경을 준비한 후에만 다음을 실행한다. 이번 정합성 검토에서 DB 인수를 실행했다는 뜻은 아니다.

```bash
env TMPDIR=/private/tmp npm run test:server:integration
# fresh production build 및 위 DB 준비 후:
env TMPDIR=/private/tmp node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-src-clean-code.ts
```

`rehearse-src-clean-code.ts`의 기존 fixture 소유자/cleanup을 재사용하여 다음 시험 전용 경로를 추가한다.

- `/owner-pipeline`: 기존 `/owner`와 같은 시험 세션을 설정하고 `/p/<fixture-slug>/pipeline`으로 이동한다. 두 탭은 같은 fixture 프로젝트를 연다.
- `/pipeline-state`: fixture 프로젝트의 version 수·최신 version/graph·autoScoutEnabled·Action별 호출 수만 반환한다. 기존 `/state`·기존 Inbox/Reopen 경로는 보존한다.
- `/arm/pipeline-before-once`, `/arm/pipeline-after-once`: fresh manifest에서 찾아낸 **다음 savePipeline POST 한 건만** 서버 전달 전/후에 정상 HTTP 응답의 RSC frame을 잘라 낸다. Scout와 다른 Action에는 적용하지 않는다. 원본 소스·빌드 chunk를 수정하지 않는다.

두 탭 시험은 A의 초안 작성, B의 graph 저장 성공, A의 Scout toggle 뒤 RSC 수신을 순서대로 확인한다.
오류 주입은 위 시나리오와 분리하고, 각 before/after 기준 version과 재시도·reload 전후 DB 수를 비교한다.
실제 새로고침 후 최종 rail·version·Read as text와 DB graph가 일치해야 한다.
포트 55451/55452 충돌은 사전에 확인한다. 종료 시 보류 proxy 요청, 양쪽 탭, listener, Next 자식 프로세스,
fixture 사용자와 그 데이터, DB connection을 기존 `finally` 경로로 정리한다.

## Verification Results

### 구현 후 결과

구현 기준은 원격 dev `131cb7444bfd61d82f492f0cf9bc5046a30609a3`이며 검토 기준과 소스 tree가 같음을 확인했다.
`harness/fsd-clean-code-follow-up`에서 세 항목을 적용했다. FSD 경계, check(ESLint·타입·아키텍처·가용성),
전체 web 628건, fresh manifest를 포함한 server 138건, production build, 격리 PostgreSQL 통합이 통과했다.
server의 1개 skip은 별도 opt-in Inbox manifest 시험, architecture의 2개 skip은 Windows 전용이다.
새 pipeline Action 두 개의 등록 및 draft 모델 비등록 검사는 실제 실행·통과했다.

브라우저 production/development fixture 각각 56건, 실제 Next/DB 두 탭의 Scout revalidation과
savePipeline 응답 유실 전/후 인수가 통과했다. 명시적 reload는 mutation을 추가하지 않았으며 최종 rail·version·Read as text가 DB와 일치했다.
fixture 데이터 0건과 프로세스·connection·임시 DB/자격 파일 정리를 확인했다. 상세 증거는 인수 보고서를 따른다.

실제 DB 리허설의 최초 명령은 server-only bootstrap 누락으로 실패했다. 위 실행 명령에 기존 테스트 bootstrap을 명시해 해결했다.
production entrypoint나 서버 경계 정책을 수정하지 않았다. 최초 브라우저 driver의 결과 수집이 너무 빨라 빈 배열을 읽은 시도도
통과로 계산하지 않고, 최종 DOM 결과와 POST 완료를 기다린 새 실행만 집계했다.


### 최초 클린코드 검토의 근거 확인

아래는 최초 검토의 역사적 기록이며, 후속 정합성 검토 또는 구현 후 회귀로 바꿔 읽지 않는다.

| 확인 | 결과 | 한계 |
| --- | --- | --- |
| `node scripts/verify-fsd-boundaries.mjs` | PASS | 자동 검사기가 지원하는 현재 경계 |
| FSD-R04 원본 core·모델 메모리 실행 | 허용 graph·상태 전이 없음 확인, Working/Ready 오표시 두 입력 재현 | 실제 DB·브라우저 미사용 |
| FSD-R03 원본 page React element 확인 | version/plan/editable 변화에 key 변경, Action 호출 0회 | 브라우저 초안 유실 직접 재현 아님; 코드·설치 문서 근거로 채택 |
| FSD-R02 TypeScript AST 메모리 확인 | 기존 공개 함수 유지 + type export 추가 시 고정 개수 검사 실패 | 실제 API 변경·수정 후 시험 아님 |
| 제안서 YAML·로컬 링크·행 범위·공백 확인 | PASS: 본문 링크 14개, related 경로 6개, 승인 전 metadata 일치 | 문서 검증이며 제품 동작 검증 아님 |
| 전체 lint·typecheck·test·build 및 브라우저 인수 | Not run | 애플리케이션 변경 없이 제안서만 작성. 후속 검증 대상 |

이전 완료 제안서의 테스트 통과 기록을 이번 실행 결과로 가져오지 않았다.

### 후속 정합성 검토에서 추가 실행한 확인

| 확인 | 결과 | 한계 |
| --- | --- | --- |
| 기존 프런트엔드 집중 시험 8파일 | 64 pass, 0 fail | 새 모델/page 시험은 아직 없으며 위 집중 명령 전체의 통과가 아님 |
| 위 서버 집중 명령 4파일 | 83 pass, 0 fail | guard·Action·CAS·loader 계약의 대역 시험. 실제 DB/HTTP 아님 |
| 원본 ProjectPipelinePage + PipelineRail 브라우저 확인 | version/plan/editable/Scout snapshot 변경 4경로에서 rail의 제거한 Propose가 복원됨. pipeline Action 0회, Scout 경로만 Scout 1회 | 실제 컴포넌트와 DOM 사용, 서버 props/응답은 대역. 수정 후 성공 또는 실제 Next revalidation 인수 아님 |
| 신규 경로 preflight | 신규 3파일 없음·부모 존재·충돌 없음 | 구현 시 다시 확인 |
| 전체 check/build·fresh manifest·실제 DB 두 탭 인수 | Not run | 문서만 수정하는 작업. 후속 구현의 V05/V06으로 남김 |

브라우저 harness의 초기 환경 설정 누락과 selector 오류는 수정해 다시 확인했다.
첫 Remove는 gate가 아니라 Propose 노드를 제거하며, 숨겨진 Read as text에도 같은 라벨이 있으므로
최종 판정은 rail 안의 Propose 카드와 Action 횟수를 사용했다. 임시 root·탭·로컬 서버는 종료했다.
이 문서의 초안 손실 수정·신규 fixture·시험 전용 endpoint는 아직 구현하지 않았다.

## Review Coverage

**Full applicable-lens review — 5개 관점 전체 완료, N/A 0, Unavailable 0, Skipped 0.**
렌즈마다 독립 context를 사용했고, 중립 품질 검증이 원시 지적을 평가했다.
중립 검증은 2차까지 수행했다. 중복 병합, 미해결 충돌, 수정 요청, 검증 보류 및 Needs human judgment는 없다.

| 렌즈 | 최종 상태 | 채택 결과 |
| --- | --- | --- |
| Cohesion | No supported findings | 이동 권고를 보완 검토한 뒤 철회 |
| Coupling | Completed | FSD-R02 |
| Predictability | Completed | FSD-R03 |
| Readability | Completed | FSD-R04 |
| TypeScript generalist | No supported findings | 추가로 충분히 입증된 지적 없음 |

| 원시 ID | Canonical ID | 최종 판정 | 심각도 |
| --- | --- | --- | --- |
| COH-001 | FSD-R01 예약 후 미채택 | reject — 원 작성자 철회 | 해당 없음 |
| CPL-001 | FSD-R02 | accept | Consider |
| PRE-001 | FSD-R03 | accept | Must |
| READ-001 | FSD-R04 | accept | Must |

COH-001은 core 계약 검사를 이동하는 비용과 현재 `core/no-external-dependency`·테스트 실행 규칙의 충돌을 해결할
최소 안전 변경을 입증하지 못해 제외했다. 기존 검증을 약화하거나 경계 예외를 만들지 않는다.
미채택 ID는 재사용하지 않으며, 나머지 세 항목은 동일한 canonical ID를 유지한다.

## Risks and Rollback

- 파이프라인 초안을 보존하면서 최신 서버 graph를 무조건 덮어쓰면 CAS 기준을 잘못 바꿀 수 있다. 초안과 baseline은 함께 관리해야 한다.
- key 제거만으로 프로젝트 사이의 identity와 저장 응답 순서가 해결되는 것은 아니다. 실제 route 조합과 늦은 응답을 검증한다.
- Board 후보를 좁힐 때 기존 review/hold/done 우선순위를 의도치 않게 바꾸지 않도록 회귀를 유지한다.
- Billing assertion 축소 후에도 금지된 선언 유출을 탐지해야 한다.

구현은 항목별로 분리하고, 문제가 생기면 해당 코드·테스트·직접 소비처 변경을 함께 revert한다.
운영 DB migration이나 운영 외부 데이터 변경은 없으므로 운영 데이터 복구 단계는 필요하지 않다.
시험 중단·실패 시에는 V06의 fixture DB·프로세스·listener 정리를 수행한다.

## Definition of Done

- [x] Core 세 항목 모두의 구현 및 V02–V06 결과를 기록한다. 미실행 인수를 통과로 처리하지 않는다.
- [x] projectId route→page→rail identity와 신규 모델/시험 3파일의 존재·실행, 기존 public API/Action 경계를 확인한다.
- [x] snapshot/저장 응답의 순서, dirty가 false인 recovery, version 0, 읽기 전용 로컬 폐기 및 이전 프로젝트의 늦은 응답을 모두 검증한다.
- [x] 서버 auth·plan·가용성·CAS와 Scout 독립성·zero-gate 확인·명시적 reload를 보존한다.
- [x] Board 실제 loader·모델·HTML에서 dev와 슬롯의 상태 및 기존 순서/링크를 확인한다.
- [x] Billing의 허용 확장과 세 금지 이름·필수 값·import·표 본문 회귀를 확인한다.
- [x] fixture와 실제 Next/DB 인수를 구분하고, fresh registry·문구/검증 지침·리허설 cleanup까지 완료한다.
- [x] 위 결과와 잔여 위험을 기록한 뒤에만 완료 metadata를 갱신하고 completed로 이동한다.

## Reconciliation Notes

처음 정합성 검토를 시작했을 때 보완할 점이 있었다. 채택 3건과 우선순위는 유지하면서 다음 공백을 본문에 반영했다.

1. 조건부였던 프로젝트 identity 전달을 필수 prop과 key 계약으로 확정하고 전체 직접 소비처를 연결했다.
2. 저장 중·stale/unknown·version 0·권한 변경·늦은 응답의 snapshot 처리와 읽기 전용 로컬 복구를 상태 표로 명시했다.
3. 누락된 acceptance runner·실제 HTTP 리허설·server loader/manifest 시험·문구 지침을 변경 목록과 검증 도착점에 포함했다.
4. source/public API/최종 본문 연결, 새 파일 preflight, Core 범위, 실행 가능한 명령·인수 기대값·cleanup·완료 조건을 구체화했다.

정합성 검토는 구현 준비 문서에 대한 검증이며, 새로운 5렌즈 리뷰나 애플리케이션 수정 완료를 의미하지 않는다.
최종 no-edit pass와 재검토 기준의 hash는 이번 응답의 검증 기록으로 남긴다.

## Completion or Closure Notes

FSD-R02·R03·R04 모두 구현·검증하여 completed로 이동했다.
프로젝트 identity와 내부 draft 상태 모델, Board dev 조건, Billing API 검사 및 관련 fixture/리허설/문구를 함께 반영했다.
새 모델·시험 3파일과 기존 소비/검증 경로를 확인했으며 미실행 Core는 없다.
현재 작업 트리에 변경 사항이 있으며 커밋·PR·배포는 수행하지 않았다.
