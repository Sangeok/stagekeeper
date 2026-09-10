---
status: "pending"
stage: "awaiting-approval"
proposal-size: "small"
created-at: "2026-09-10"
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
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-09-10-configurable-pipeline.md"
---

# Pipeline 레일의 `+` 메뉴가 레일을 밀지 않게 한다

## Summary

Pipeline 탭 레일에서 간선의 `+`를 열면 그 간선이 30px에서 208px로 넓어지면서 오른쪽 카드가 전부
밀린다. 메뉴를 띄우면(`absolute`) 가로 스크롤 영역에 잘려 아예 안 보이므로, 구현 당시 "밀리더라도
보이는" 쪽을 골랐다. 이 제안서는 둘 중 하나를 고르지 않고 **밀지도 잘리지도 않는** 세 번째 방법을
적는다: 메뉴를 레일 밖 고정 자리에 그리고, 어느 간선의 메뉴인지는 그 간선을 강조해서 말한다.

## Goal

`+`를 열어도 레일의 카드 위치가 움직이지 않는다. 메뉴는 잘리지 않는다. 어느 간선을 편집 중인지
화면에서 분명하다.

## Proposal Size

`proposal-size`: `small`

선택 근거:

- 파일 1개(`pipeline-rail.tsx`)와 그 테스트만 바뀐다. 순수 규칙(`rail-state.ts`)과 서버 액션은
  손대지 않는다.
- 삭제·라우팅·인증·결제·마이그레이션·API 계약과 무관하다. 롤백은 단순 revert다.

## Current State

`src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx`

- 66행 — 레일은 한 줄이고 넘치면 가로로 스크롤한다.

```tsx
<div className="flex items-stretch gap-2 overflow-x-auto pb-1">
```

- 161–182행 — `EdgeSlot`의 메뉴는 `<details>` 안에 **흐름대로** 놓인다. 열리면 `w-52`가 그 열의
  너비가 되어 뒤의 카드를 민다.

```tsx
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      {boundary ? <span className="text-[11px] text-quiet">auto → {boundary.to}</span> : null}
      {/* 메뉴는 자리를 차지한다 — 레일이 가로로 스크롤하므로 띄우면 잘려 안 보인다. 열면 그 간선이 잠깐 넓어진다. */}
      <details>
        <summary className="cursor-pointer list-none rounded-md border border-rule px-2 py-1 text-center text-xs text-quiet">+</summary>
        <div className="mt-1 flex w-52 flex-col gap-1 rounded-md border border-edge bg-paper p-2">
```

왜 띄우지 못했는가: CSS에서 `overflow-x: auto`는 `overflow-y`를 `visible`로 둘 수 없다. 두 축이
함께 `auto`가 되므로, 스크롤 컨테이너 안의 `absolute` 자식은 위아래로도 잘린다. 그래서 66행의
스크롤과 "띄운 메뉴"는 같은 컨테이너 안에서 양립하지 않는다.

## Scope

포함:

- `pipeline-rail.tsx`의 `EdgeSlot` 메뉴 렌더 위치와 선택 상태.
- 그 동작을 잠그는 테스트.

제외:

- `rail-state.ts`의 순수 규칙(`insertGate`·`removeGate`·`removeNode`·`addNode`·`swapTail`)과
  그 사유 문장. 지금 그대로다.
- `edit-pipeline.server.ts`의 저장 경로, `validateGraph`, 게이트 0개 경고, Free 안내.
- 노드 카드·게이트 카드의 문구(`product-copy.md` §18).

## Proposal

메뉴를 `EdgeSlot` 밖으로 옮긴다. `PipelineRail`이 "지금 열린 간선"을 상태로 하나 들고,
레일 **아래** 고정 자리에 그 간선의 메뉴 하나만 그린다.

- `PipelineRail`에 `const [openEdge, setOpenEdge] = useState<string | null>(null)` 하나를 더한다.
  값은 노드 kind다(그 노드 앞 간선).
- `EdgeSlot`은 `<details>`를 버리고 `+` 버튼 하나만 그린다. 누르면 `setOpenEdge(kind)`, 이미
  열려 있으면 `null`로 닫는다. 열린 간선의 `+`는 눌린 상태로 보인다(`border-mine bg-mine-soft`).
- 레일 바로 아래에 `openEdge !== null`일 때만 패널을 그린다. 제목은 그 자리를 말한다 —
  "Before Plan" 같은 한 줄. 항목은 지금과 같은 `moves`이고, 비활성 사유도 그대로 `validateGraph`의
  문장이다.
- 조작을 하나 적용하면(`apply`) `openEdge`를 `null`로 되돌린다. 지금 `apply`가 `confirmingNoGate`를
  되돌리는 자리와 같다.

이렇게 하면 레일은 폭이 변하지 않고, 패널은 스크롤 컨테이너 밖이라 잘리지 않는다. 한 번에 하나만
열리는 것도 지금 `<details>` 여럿이 동시에 열릴 수 있던 것보다 낫다.

## Affected Files

| 파일 | 작업 | 근거 |
| --- | --- | --- |
| `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` | update | `EdgeSlot`에서 메뉴를 들어내고 `PipelineRail`에 `openEdge` 상태와 패널을 둔다 |
| `src/fsd/features/edit-pipeline/model/rail-state.ts` | none | 순수 규칙은 그대로다 |
| `docs/conventions/product-copy.md` §18 | update | "간선마다 `+`" 문장에 "선택한 간선의 메뉴는 레일 아래에 열린다"를 더한다 |

## Safety Analysis

`+` 메뉴는 이 파일 안에서만 쓰인다. 밖으로 새는 것이 없다.

확인한 항목:

- [x] 정적 `import` / `export from` — `pipeline-rail.tsx`가 공개하는 것은 `PipelineRail`과
  `SavePipelineAction`뿐이고(`index.ts`), 둘 다 시그니처가 바뀌지 않는다.
- [x] barrel export(`index.ts`) 경유 참조 — `ProjectPipelinePage` 하나가 `PipelineRail`을 쓴다.
- [x] 테스트와 스크립트 참조 — `rail-state.test.ts`는 순수 함수만 부른다. 이 변경과 겹치지 않는다.
- [x] 런타임 side effect 또는 초기화 코드 — 없다. `useState` 하나가 늘 뿐이다.
- [x] 앱 진입점과 라우팅 경계 — `src/app/(app)/p/[slug]/pipeline/page.tsx`가 넘기는 props가
  그대로다.

## Approval

승인 메모:

- 승인 전.

## Execution Plan

1. `pipeline-rail.tsx`: `EdgeSlot`에서 `<details>`를 걷어내고 `+` 버튼과 `onOpen`·`open` prop을
   둔다. `PipelineRail`에 `openEdge` 상태와 레일 아래 패널을 더한다. `apply`에서 `openEdge`를 닫는다.
2. `product-copy.md` §18의 `+` 문장을 새 동작에 맞춘다.
3. `npm run check`와 `npm run test:web`으로 잠근다.
4. 브라우저 실측: `+`를 열고 닫을 때 레일의 첫 카드 좌표가 움직이지 않는지, 패널이 잘리지 않는지,
   비활성 사유가 그대로 보이는지.

## Verification Plan

| 명령 | 성공 기준 |
| --- | --- |
| `npm run check` | exit 0 |
| `npm run test:web` | 전부 통과 |
| `npm run verify:fsd` | 통과 |
| 브라우저 실측 | `+` 개폐 전후로 레일 카드 위치가 같다. 패널이 잘리지 않는다. `gate before-propose has no node after it`이 그대로 보인다 |

`npm run build`는 dev 서버가 살아 있으면 건너뛰고 그 사실을 보고한다.

## Verification Results

아직 실행 전이면 `Not run yet`으로 둔다.

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | Not run yet | |
| `npm run test:web` | Not run yet | |
| `npm run verify:fsd` | Not run yet | |
| 브라우저 실측 | Not run yet | |

## Risks and Rollback

잔여 리스크:

- **패널이 레일에서 멀어진다.** 어느 간선인지 제목과 `+`의 눌린 표시로만 말한다. 노드가 많아
  가로로 스크롤한 상태라면 그 표시가 화면 밖일 수 있다. 완화: 패널 제목이 간선 이름을 그대로 쓴다.
- 되돌리기: 파일 하나의 revert다.

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
- [x] `stage`는 `awaiting-approval`이고 승인 기록은 비어 있다.
- [x] `proposal-size`는 `small`이고 standard 강제 조건에 걸리지 않는다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 import, barrel export, 라우팅, side effect를 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. (실행 전)
- [x] 잔여 리스크를 명시했다.
- [ ] 완료 문서라면 완료 기록이 갱신되어 있다. (해당 없음)
- [ ] 닫힌 문서라면 닫힘 기록이 일치한다. (해당 없음)
