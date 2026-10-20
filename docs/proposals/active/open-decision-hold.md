---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-10-20"
approved-by: "HamSangEok"
approved-at: "2026-10-20"
approval-scope: "템플릿 저장소의 dev.md step:plan·plans/template.md·시험 import 경로 변경, 커밋·PR·머지까지. 공유 DB 시드(운영 출시)는 실행 직전 별도 확인"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: ["HamSangEok"]
related:
  - "docs/test-reports/active/2026-10-02-local-watch-executor.md"
  - "docs/proposals/completed/2026-10-03-local-watch-executor.md"
---

# 열린 결정이 있으면 dev가 계획 전에 보류한다

## Summary

자동 실행(게이트 없는 파이프라인)에서 dev가 계획서에 "주인이 구현 게이트에서 판단"이라고 적은 제품 결정이, 판단할 게이트가 없어 그대로 구현·인수됐다(2026-10-20 watch smoke, ITEM-01). dev 템플릿의 계획 단계에 **열린 결정(open decision)** 규칙을 넣는다. 바깥에서 보이는 동작이 선택에 따라 갈리는데 요구사항이 정해 주지 않으면, dev는 계획을 쓰지 않고 그 항목을 보류한다. 질문은 보류 사유(150자)로 Inbox에 뜨고, 주인은 Backlog의 Source에 답을 적은 뒤 재개한다. 서버·화면·런북은 바꾸지 않는다. 템플릿 두 개와 템플릿 시험의 import 경로 한 줄만 바꾼다.

## Goal

- 자동 실행이 주인이 내려야 할 제품 결정을 혼자 내리지 않게 한다. 그 항목만 멈추고 다른 항목은 계속 돈다.
- 이미 있는 보류·재개 경로와 Backlog 편집만으로 질문과 답이 오가게 한다. 새 상태, 새 전이, 새 화면은 만들지 않는다.
- 작업 유형: 템플릿 문구 변경(행동 규칙 추가).

## Proposal Size

`proposal-size`: standard

선택 근거:

- 되돌리기가 단순 revert가 아니다. 템플릿은 공유 DB(localhost와 운영이 같은 Neon)에 시드해야 적용되므로, 되돌릴 때도 옛 본문을 다시 시드해야 한다.
- 시드하는 순간 운영의 모든 프로젝트가 다음 `agent_next` 호출부터 새 규칙을 쓴다.

## Current State

**smoke에서 일어난 일.** ITEM-01의 원문은 "maxLength를 넘지 말 것"과 "단어를 자르지 말 것"을 함께 요구했다. 두 규칙은 한 단어가 maxLength보다 긴 입력에서 동시에 지킬 수 없다. dev는 `""`를 고르고 계획서에 "the owner can judge it at the implementation gate"라고 적었다. 그 파이프라인에는 게이트가 없어서, 메인 루프가 인수 기록에 "no owner decision was recorded"라고 남긴 채 그대로 인수됐다.

**템플릿이 게이트를 전제한다.** 다음 문장들이 모두 사람이 게이트에서 판단한다고 전제하고, 게이트가 없을 때의 경로는 없다.

- `plugin/templates/en/agents/dev.md:122-125`(템플릿 저장소 main `356ce8d`): source가 비면 가정을 Problem 절에 "for the owner to judge at the implementation gate"로 적으라고 한다.
- `plugin/templates/en/docs/plans/template.md:27-28`: 백로그와 코드가 어긋나면 "say so here"라고 한다.
- 같은 파일 `:32-33`: "The owner checks those assumptions at the implementation gate."

**보류·재개·답 경로는 이미 있다.**

- 에이전트는 planning에서 보류할 수 있다(`packages/core/transitions.mjs:27`). 사유는 150자 이내로 필수다(`:6`).
- 재개는 사람이 한다(`:19`). planning으로 재개하면 검증 기록이 지워진다.
- 보류된 항목은 게이트와 상관없이 Inbox 카드와 탭 뱃지에 뜬다(`src/fsd/entities/board-item/model/inbox-gate.ts:15-16`). 카드는 마지막 보류 사유를 보여 준다(`src/fsd/features/review-gate/ui/inbox-card.tsx:61`).
- 주인은 Backlog 항목의 **Source**를 상태와 상관없이 고칠 수 있다(`src/server/pipeline/board-service.ts:104`, 문구는 `docs/conventions/product-copy.md:374`). dev는 계획 단계에서 항상 Source를 먼저 읽는다(`dev.md:118-120`).
- 보류된 항목은 pm이 다시 올리지 않는다(`src/server/pipeline/board-rules.ts:35`).

**전달 경로.**

- dev 파일 중 첫 `## step:` 앞까지(stub)만 사용자 저장소에 생성된다. 단계 본문은 DB에서 `agent_next`로 내려온다(`src/server/templates/steps.ts:4`, `src/server/agents/next.ts:102`).
- 템플릿 테이블은 `(lang, path)`당 판본 하나다(`prisma/schema.prisma:252`).
- `docs/plans/template.md`는 init 때 사용자 저장소에 쓰는 관리 파일이다(`plugin/bin/harness-init.mjs:298`).
- 런북 판은 런북 원문 해시로만 정해진다(`packages/core/runbook.mjs:9-16`).
- 2026-10-20 대조 결과, DB의 `en/agents/dev.md`와 `en/docs/plans/template.md`는 템플릿 main(`356ce8d`)과 LF sha256이 같다.

**템플릿 시험이 이미 깨져 있다.** `plugin/templates/templates.test.mjs:18`이 `src/server/agents/steps.ts`를 import하는데, 이 파일은 서버 모듈 재배치(#167)로 `src/server/templates/steps.ts`로 옮겨졌다. 지금 dev 기준으로 `npm run test:templates`는 모듈을 찾지 못해 실패한다.

## Scope

포함 범위:

- 템플릿 저장소 `en/agents/dev.md`의 `step:plan`: 열린 결정 규칙, A-4 보류 갈래, 출력 안내.
- 템플릿 저장소 `en/docs/plans/template.md`의 Problem 절 두 문단.
- 템플릿 저장소 `templates.test.mjs:18`의 import 경로(선행 조건).
- 공유 DB 시드(운영 출시)와 출시 뒤 smoke 검증.

제외 범위:

- 서버·화면 변경. Inbox 이름표("Your note" → 보류 주체별)와 main-loop 보고 규칙은 별도 PR(B)에서 한다.
- 런북(`CLAUDE.runbook.md`, `CODEX.runbook.md`). 바꾸면 런북 해시가 바뀌어 모든 프로젝트에 재 init이 요구된다. 이 규칙에는 필요 없다.
- dev 파일의 stub 부분(역할 설명 "plan → owner approval → implement"). 바꾸면 기존 저장소에 재 init이 필요하고, 문장 자체도 여전히 참이다.
- 메인 루프나 plan-verifier가 검증 단계에서 보류하는 규칙. in_review의 에이전트 보류 전이가 없고(`transitions.mjs:18`은 사람만), 이번 결정 범위가 아니다.
- 상주 실행기(2단계) 설계.

## Proposal

### 1. dev 계획 단계(`en/agents/dev.md`, step:plan)

**1-a. A-2의 source가 빈 경우 문장**(`:122-125`)에서 게이트 전제를 뺀다.

Before:

```text
code, and write "source empty — problem inferred from title and code" plus your assumptions
in the plan's **Problem** section for the owner to judge at the implementation gate.
```

After:

```text
code, and write "source empty — problem inferred from title and code" plus your assumptions
in the plan's **Problem** section. The title is then the requirement.
```

**1-b. A-2 끝**(`:132` 다음, A-3 앞)에 열린 결정 문단을 더한다.

```text
**Open decisions.** Before you write the plan, list the choices this item forces that change
what users or callers observe — output values, errors, screens and their wording, public APIs,
stored data — and that the requirement (the source, or the title when the source is empty)
doesn't settle. Edge cases count: when two rules in the source can't both hold for some input,
which one wins is such a choice. So is a source whose premise the code contradicts — which one
to follow is the owner's call. Internal choices — names, structure, algorithm, test layout —
are yours; don't hold for them. A choice the source already answers is settled, including an
answer the owner added before resuming the item.

If an open decision remains, **don't write the plan** — put the item on hold in A-4. This
applies whether or not a gate follows: a plan built on the owner's answer beats one built on
your guess. If one surfaces while you write the plan, stop writing and hold the same way.
```

**1-c. A-4 보류 갈래**(`:159-160` 다음)를 더한다.

```text
- Open decision → the same `board_transition` to `on_hold`; there is no plan to commit. The
  owner reads `result` in the Inbox, so make it the question, its options and where the answer
  goes, **under 150 characters**. Don't call plan_submit. For example:
  `Open: a word longer than maxLength → "", cut it, or keep it whole? Answer in the item's Source, then resume.`
```

예시 사유는 108자다.

**1-d. A-5 출력**(`:169`)의 note에 "or the open decision"을 더하고, 출력 블록 설명(`:180-181`) 다음에 한 줄을 더한다.

```text
On an open-decision hold, `Notes:` lists each open decision and what each option would do.
```

### 2. plan 템플릿(`en/docs/plans/template.md`, Problem 절)

Before(`:27-28`):

```text
**If what the backlog points at and what you found in the code disagree, say so here.** Don't
quietly switch to the code's version — what to solve is the owner's decision.
```

After:

```text
**If what the backlog points at and what you found in the code disagree,** don't quietly switch
to the code's version — what to solve is the owner's decision. When the difference changes what
gets built, it is an open decision and the plan step holds the item. Otherwise say so here.
```

Before(`:32-33`의 마지막 문장):

```text
"source empty — problem inferred from title and code" with your assumptions here. The owner
checks those assumptions at the implementation gate.
```

After:

```text
"source empty — problem inferred from title and code" with your assumptions here. An
assumption that changes what users or callers observe is an open decision, not an assumption —
the plan step holds the item for the owner instead.
```

이 파일은 사용자 저장소에 생성되므로 기존 프로젝트에는 재 init 때 반영된다. 규칙의 효력은 DB에서 내려오는 1번이 내고, 2번은 새로 init하는 프로젝트의 문서 일관성을 위한 것이다.

### 3. 템플릿 시험 import 경로(`templates.test.mjs:18`)

`../../src/server/agents/steps.ts` → `../../src/server/templates/steps.ts`. 선행 조건이며 동작 변경은 없다.

### 결정 기록

2026-10-20 사용자가 확정한 결정이다.

1. 빈틈이면 그 항목만 보류한다.
2. 보류는 dev가 계획 단계에서 한다.
3. 게이트가 있든 없든 항상 보류한다.
4. 기준은 바깥에서 보이는 동작이 갈리는데 원문(빈 경우 제목)이 정하지 않을 때다.
5. 질문은 보류 사유로 Inbox에 뜨고, 답은 Source에 적은 뒤 재개한다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| 템플릿 저장소 `en/agents/dev.md` | update(step:plan만) | 규칙의 본체. DB에서 내려오므로 시드 즉시 모든 프로젝트에 적용된다 | medium — 너무 자주 멈추거나, 멈춰야 할 때 안 멈출 수 있다. smoke 세 경우로 확인한다 |
| 템플릿 저장소 `en/docs/plans/template.md` | update(Problem 두 문단) | 게이트 전제 문장을 새 규칙과 맞춘다 | low — 기존 저장소는 재 init 전까지 옛 문장을 갖지만, 규칙은 1이 낸다 |
| 템플릿 저장소 `templates.test.mjs` | update(import 한 줄) | #167 뒤 깨진 시험 복구 | low |
| 공유 DB `Template(en, agents/dev.md)`, `(en, docs/plans/template.md)` | seed | 전달 경로 | medium — 운영 출시다. 되돌리기는 아래 |
| `docs/proposals/active/open-decision-hold.md` | add | 이 문서 | none |

## Safety Analysis

확인한 항목:

- [x] **stub 불변.** 새 문장은 모두 `## step:plan` 안에 있다. 편집본을 `splitTemplate`으로 파싱한 결과, 단계는 `plan,implement,verify,report,hold` 그대로이고 stub에는 새 문장이 없다. 그래서 기존 저장소의 `.claude/agents/<dev>.md`는 바뀌지 않고, 재 init도 필요 없다.
- [x] **런북 판 불변.** 런북을 건드리지 않으므로 어떤 프로젝트에도 runbook stale이 생기지 않는다(`runbook.mjs:9-16`). Codex 묶음의 판도 `CODEX.runbook.md` 해시라서 같다.
- [x] **자리표시자.** 새 문장에 `{{…}}`가 없다. `npm run test:templates`의 미치환 검사가 통과한다.
- [x] **보류 경로.** 새 갈래는 기존 "Couldn't identify the target"과 같은 `board_transition(on_hold)`를 쓴다. 서버 규칙은 바뀌지 않는다.
- [x] **재보류 고리.** 주인이 Source에 답하지 않고 재개하면 dev는 같은 질문으로 다시 보류한다. 의도된 동작이다. 사유 문장이 "Answer in the item's Source"라고 안내한다.
- [x] **Codex.** 같은 `agents/dev.md` 본문을 쓴다. 단계 본문이 DB에서 오는 것도 같다.
- [ ] **실제 모델 판단.** 문장만으로는 dev가 기준을 지킬지 보장할 수 없다. 출시 뒤 smoke(D)로 확인한다.

## Approval

승인 메모:

- **시드(운영 출시)는 PR 머지 뒤 실행 직전에 따로 확인받는다.**

## Execution Plan

1. 템플릿 저장소 `harness/open-decision-hold` 브랜치(main `356ce8d`에서)에 1·2·3을 커밋한다. 주인 승인 뒤에 한다.
2. dev 기준 worktree에서 `npm run test:templates`를 돌린다.
3. PR을 열고(`harness/open-decision-hold` → 템플릿 main) 머지한다.
4. **시드 직전 확인을 받는다.** 머지된 main을 **깨끗한 checkout**에 꺼낸다. `git status --porcelain` 출력이 비어 있어야 한다. 그 checkout에서 `npm run seed:templates -- --dir <그 checkout> --snapshot <공개 저장소 밖 경로>`를 실행한다.
   - 시드 스크립트는 폴더의 작업 트리 파일을 전부 올린다. 본 checkout의 템플릿 저장소에는 런북을 고친 다른 미커밋 변경이 있으므로 **그 폴더에서는 시드하지 않는다.** 거기서 시드하면 런북 해시가 바뀌어 모든 프로젝트가 stale이 된다.
   - 스냅숏에는 시드 직전 DB 행이 남는다.
5. 읽기 전용으로 전체 행을 대조한다. 바뀐 행은 `agents/dev.md`와 `docs/plans/template.md` 둘뿐이고 새 main과 같아야 한다. 나머지 11행(런북 `b5257ea7e9cd`·`ef5cb547c8c2` 포함)은 그대로여야 한다.
6. smoke D를 돌린다(아래).

## Verification Plan

실행할 검증:

```bash
npm run test:templates
```

검증 기준:

- 53개 시험 모두 통과(편집 전 기준선도 import 경로를 고치면 53/53).
- 시드 뒤 `Template(en, agents/dev.md)`와 `(en, docs/plans/template.md)`의 LF sha256이 새 템플릿 main과 같다.

**smoke D(출시 뒤, localhost `harness-watch-smoke`, 게이트 없는 Version 1, 자동 발굴 끔).** 2026-10-20 smoke와 같은 방식으로 돌리고, 결과 브랜치는 끝난 뒤 main에 머지한다.

| 항목 | Source | 기대 결과 |
| --- | --- | --- |
| ITEM-02 빈틈 | `slugify(text, { maxWords }) keeps only the first maxWords words. The result must never be an empty slug. Without maxWords, behavior stays the same. Add tests.` | dev가 계획을 쓰지 않고 보류한다(actor agent). 사유는 150자 이내에 질문과 선택지가 들어 있다(`maxWords: 0`과 "never empty"의 충돌, maxLength와 함께 쓸 때 빈 결과). Inbox에 카드가 뜬다. 커밋된 계획서는 없다 |
| ITEM-02 답·재개 | Source 끝에 결정을 덧붙인다(예: maxWords가 1 미만이면 RangeError, maxLength와 함께면 maxWords를 먼저 적용하고 maxLength가 비우면 `""`). Inbox에서 재개 | dev가 다시 보류하지 않고 계획 → 검증 → 구현 → 완료 → 인수까지 간다. 구현과 시험이 답(RangeError)을 따른다 |
| ITEM-03 대조군 | `Export isSlug(text) from src/slug.js. It returns true exactly when text === slugify(text), and false otherwise. Add tests.` | 보류 이벤트 없이 완료·인수된다. ITEM-02가 보류된 동안에도 진행된다 |

판정:

- 셋 다 기대대로면 완료로 본다.
- ITEM-02가 보류되지 않으면 규칙이 약한 것이다.
- ITEM-03이 보류되면 너무 자주 멈추는 것이다.
- 둘 중 어느 쪽이든 주인과 문구 수정이나 되돌리기를 정한다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run test:templates`(dev `c72b5ec`, 템플릿 main `356ce8d`, 편집 전) | 실패 | `src/server/agents/steps.ts`를 찾지 못함(#167 뒤 기존 실패) |
| 같은 명령, 3번(import 경로)만 적용 | 53/53 통과 | 기준선 |
| 같은 명령, 1·2·3 적용(승인 전 시험용, 커밋 안 함) | 53/53 통과 | 2026-10-20 |
| 편집본 `splitTemplate` 파싱 | 단계 `plan,implement,verify,report,hold`, 새 문장은 plan 단계에만, stub에는 없음 | 2026-10-20 |
| DB 대 템플릿 main LF sha256(읽기 전용, 전체 행) | 13행 모두 일치. `agents/dev.md` `6099d0fbf6d63938`, `docs/plans/template.md` `34156a40dc8329c5` | 되돌리기 기준. 깨끗한 checkout에서 시드하면 바뀌는 건 두 행뿐 |
| 템플릿 PR | Sangeok/harness-templates#13 머지, main `2951fdf` | 커밋 `0b8eb74`. 템플릿 저장소에는 CI가 없다 |
| 시드 | Not run yet | 실행 직전 별도 확인 |
| smoke D | Not run yet | 출시 뒤 |

## Risks and Rollback

잔여 리스크:

- **모델 판단의 편차.** 기준을 문장으로만 주므로 너무 자주 멈추거나 덜 멈출 수 있다. smoke D의 두 방향 판정으로 확인한다.
- **운영 노출.** 시드하면 운영의 모든 프로젝트에 즉시 적용되고, 시드 전에 localhost에서만 시험할 방법이 없다(공유 DB, 판본 하나). 바뀌는 건 텍스트뿐이고 실패하면 멈추는 쪽이다.
- **쓰다 만 계획 파일.** 계획을 쓰는 도중에 열린 결정을 발견해 보류하면, 커밋되지 않은 계획 파일이 남을 수 있다. 지금의 다른 보류도 같고, 다시 계획할 때 A-3이 덮어쓴다. 상주 실행기(2단계)의 미커밋 검사는 이 경우를 다뤄야 한다.
- **잘못된 재개 대상.** 계획 단계에서 보류된 항목을 주인이 implementing으로 재개하면 계획 없이 구현 단계로 간다. 지금도 같은 경로이고, 주 Resume 버튼은 보류된 자리(planning)로 돌아간다. 보류가 잦아지면 노출이 늘어난다.
- **Inbox 이름표.** B가 들어가기 전까지 dev의 질문 앞에 "Your note"가 붙는다.
- **템플릿 저장소의 다른 미커밋 작업.** 본 checkout의 템플릿 저장소에 `templates.test.mjs`를 고치는 다른 미커밋 변경이 있다. 이 PR의 import 한 줄과 겹치면 그쪽에서 맞춰야 한다.

롤백 방법:

- 템플릿 저장소에서 `en/agents/dev.md`와 `en/docs/plans/template.md` 두 파일만 `356ce8d` 본문으로 되돌리는 커밋을 만든다. 시험 import 경로 수정은 남긴다. 그 main의 깨끗한 checkout에서 `seed:templates`를 다시 실행한다. 또는 4단계 스냅숏의 본문으로 두 행을 되돌린다.
- 되돌린 뒤 두 행의 LF sha256이 `6099d0fbf6d63938`과 `34156a40dc8329c5`인지 확인한다.
- 이미 보류된 항목은 주인이 Inbox에서 재개하면 된다. 데이터 구조 변경은 없다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다.
- [x] `stage`는 pending 문서에서만 사용했다.
- [x] `stage: "approved"`이고 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 standard다(롤백이 재시드).
- [x] 승인 기록은 front matter를 단일 기준으로 사용한다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 stub, 런북 판, 자리표시자, 보류 경로, Codex를 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 기존 실패(import 경로)와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다.
