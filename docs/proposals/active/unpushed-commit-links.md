---
status: "pending"
stage: "draft"
proposal-size: "small"
created-at: "2026-09-11"
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
  - "docs/proposals/active/runbook-drift.md"
---

# 푸시되지 않은 커밋을 가리키는 링크

## Summary

게이트 2 카드의 **Read the plan ↗** 와 항목 페이지의 문서 링크 셋은 기록된 커밋의 GitHub
blob 주소다. 그런데 파이프라인 어디에도 푸시하라고 말하는 자리가 없어서, 그 커밋이 원격에
없을 수 있다. 그러면 링크는 조용히 404가 되고, 소유자가 승인 전에 계획서를 읽을 통로가
사라진다. 실측으로 `harness-smoke`에 18개가 쌓여 있었고 네 사이클의 게이트 2가 전부 죽은
링크였다. 서버는 이것을 알 수 없다 — GitHub 접근이 미인증뿐이라 비공개 저장소를 못 본다.
그래서 **알 수 있는 자리(메인 루프)가 게이트를 알리기 전에 확인하게 하고**, 화면은 링크가
푸시에 달렸다는 것을 말하게 한다.

## Goal

- 소유자가 게이트 2에서 죽은 링크를 누르는 일을 없앤다.
- 푸시가 누구의 일이고 언제 필요한지를 파이프라인 안에서 한 번은 말하게 한다.
- 서버에 GitHub 자격을 새로 들이지 않는다. 그건 별도 결정이다.

## Proposal Size

`proposal-size`: small

선택 근거:

- 마이그레이션 없음, API 계약 변경 없음, 새 엔드포인트 없음.
- 변경은 런북 한 절, 카드 힌트 한 줄, product-copy 두 항목이다.
- 롤백은 단순 revert다.

## Current State

링크는 이렇게 만들어진다.

- `src/fsd/entities/board-item/model/doc-link.ts:10-12` — `blobHref(repo, path, ref)`가
  `https://github.com/<owner>/<repo>/blob/<ref>/<path>`를 만든다. `ref`가 있으면 그 커밋이다.
- `src/fsd/features/review-gate/model/inbox-item.ts:90` — `planUrl`은
  `blobHref(repo, row.planPath, row.planCommit)`이다.
- `src/fsd/features/review-gate/ui/inbox-card.tsx:81-83` — 게이트 2 카드의
  **Read the plan ↗** 버튼이 그 주소를 연다.

푸시는 규칙상 소유자만 한다.

- `plugin/templates/en/CLAUDE.runbook.md:62` — "A pipeline step never grants commit or push
  permission."
- `plugin/templates/en/agents/dev.md:53` — "Commit permission does not grant push permission."

그런데 **소유자에게 푸시하라고 말하는 자리가 없다.** 게이트 2 카드도, 런북의 게이트 안내도,
`pipeline_next`의 답도 푸시를 언급하지 않는다. 그 사이에 카드는 원격 blob URL을 승인 전
유일한 읽기 통로로 내민다.

실측(2026-09-11, `harness-smoke`): 푸시 전 `git rev-list --count origin/main..HEAD` = **18**.
FEAT-03·04·05·06 네 사이클의 계획서·보고·인수 기록이 전부 로컬에만 있었고, 게이트 2가
가리킨 커밋도 그 안에 있었다. 푸시한 뒤에야 세 링크가 열렸다.

| 커밋 | 파일 | 푸시 후 |
| --- | --- | --- |
| `bae83c0` | `docs/plans/FEAT-06.md` | 3154 bytes |
| `c06268f` | `docs/agents/main-loop/FEAT-06.md` | 3093 bytes |
| `63e5931` | `docs/agents/dev/FEAT-06.md` | 1268 bytes |

**서버는 확인할 수 없다.** `src/server/github.ts:5-7`이 그 이유를 적어 두었다. 서버의 GitHub
호출은 미인증이라 토큰도 스코프도 쓰지 않고, 비공개 저장소를 보려면 `repo` 스코프가 필요해서
저장소 단위로 권한을 주는 GitHub App까지 미뤄 두었다. 저장소 내용도 읽지 않는다. 그래서
`GET /repos/{o}/{r}/commits/{sha}` 같은 확인은 공개 저장소에서만 되고, 이 문제를 처음 드러낸
프로젝트가 비공개다.

## Scope

포함 범위:

- 런북: 메인 루프가 게이트를 알리기 전에 그 커밋이 원격에 있는지 확인하고, 없으면 푸시를
  요청하게 한다. 함께 `git show <planCommit>:<planPath>`를 건네 소유자가 푸시를 기다리지
  않고도 **승인 대상 커밋의 원문**을 읽게 한다. 세션이 계획서를 요약하지는 않는다.
- 게이트 2 카드: 링크가 푸시된 커밋을 필요로 한다는 것을 한 줄로 말한다.
- 항목 페이지 Documents: 같은 한 줄.
- product-copy §7·§11.

제외 범위:

- 서버가 커밋 도달 가능성을 확인하는 것. GitHub App이 필요하고, 그건 이 제안서가 정할 일이
  아니다(아래 Alternatives에 근거를 적었다).
- 자동 푸시. 규칙이 금지하고, 이 제안은 그 규칙을 바꾸지 않는다.
- 계획서 본문을 서비스에 저장하는 것(아래 Alternatives).

## Proposal

### 1. 메인 루프가 게이트 전에 확인한다 (런북)

메인 루프는 소유자의 셸에서 돌고 git을 읽을 수 있다. dev와 달리 `git fetch`도 할 수 있고,
소유자에게 말을 걸 수도 있다. 확인할 수 있는 유일한 자리다.

`CLAUDE.runbook.md`의 `wait` on a `gate` 항목(`:81`)에 한 문장을 더한다.

> Before you name the gate, check that the commit the card will link is on the remote:
> `git fetch` then `git branch -r --contains <planCommit>`. If nothing comes back, say so and
> ask the owner to push — the card's **Read the plan ↗** opens that commit on GitHub and 404s
> until it is pushed. Give them `git show <planCommit>:<planPath>` as well, so they can read
> exactly what they would be approving without waiting for the push. Print nothing of your own
> about the plan: the owner is reviewing it independently, and a summary from the session that
> wrote and verified it is that session grading itself. Pushing is the owner's job; a pipeline
> step never grants it.

틀리는 방향이 안전하다. 원격 추적 ref가 낡아서 "없다"고 말할 수는 있어도, 그 답이 시키는
행동(푸시)은 해로운 적이 없다.

### 2. 카드가 링크의 조건을 말한다

게이트 2 카드의 링크 옆(또는 아래 힌트 줄)에 한 문장을 둔다. 문구:

> Opens the recorded commit on GitHub. If it 404s, that commit is not pushed yet.

`inbox-card.tsx:81-83`의 버튼과 같은 줄에 사는 힌트 자리는 이미 있다(`:97-101`이 게이트
힌트를 렌더한다). 항목 페이지 Documents 블록(`board-item-page.tsx`)에도 같은 문장을 한 번
둔다.

### 3. product-copy

§7(인박스)와 §11(항목 상세)에 위 문장을 기록한다. 링크 라벨은 그대로다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `plugin/templates/en/CLAUDE.runbook.md` | update | 확인을 아는 자리에 둔다 | none — 문서 |
| `plugin/templates/templates.test.mjs` | update | 그 문장을 고정 | none |
| `src/fsd/features/review-gate/ui/inbox-card.tsx` | update | 힌트 한 줄 | low — 정적 문자열 |
| `src/fsd/pages/board-item/ui/board-item-page.tsx` | update | 같은 한 줄 | low |
| `docs/conventions/product-copy.md` | update | §7 · §11 | none |

## Safety Analysis

정적 문자열과 문서만 는다. 링크 주소, 라우팅, 데이터는 그대로다.

확인한 항목:

- [x] 앱 진입점과 라우팅 경계 — 변경 없음. `blobHref`도 그대로다.
- [x] 정적 `import` / `export from` — 새 import 없음.
- [x] 테스트와 스크립트 참조 — 템플릿 테스트에 한 줄 고정을 더한다.
- [x] 런타임 side effect — 없음.
- [x] API 계약 — 변경 없음.
- [ ] dynamic import · barrel export · 정적 자산 · 타입 — 해당 없음

경계 하나: 1번은 **에이전트가 아니라 메인 루프**에 건다. dev의 Bash는 읽기·검증 전용이라
`git fetch`가 규칙 밖이고, 원격 추적 ref만 보면 방금 푸시된 것을 못 본다. 메인 루프는 둘 다
할 수 있다.

## Approval

승인 메모:

- 승인 전. 결정할 것은 하나다 — 이 제안대로 "아는 자리에 확인을 두는" 선에서 멈출지,
  아니면 서버가 직접 알게 하는 GitHub App까지 이번에 열지.

## Alternatives

**서버가 미인증으로 확인한다.** `GET /repos/{o}/{r}/commits/{sha}`는 공개 저장소에서만
동작한다. 이 문제를 드러낸 프로젝트가 비공개다. 절반만 맞는 답을 화면이 확신 있게 말하면
지금 고치려는 것과 같은 종류의 거짓이 된다. 안 한다.

**제출하는 에이전트가 도달 가능성을 보고한다.** `plan_submit`에 `pushed` 같은 값을 더하는
안이다. dev는 fetch를 못 해 원격 추적 ref가 낡고, 규칙상 푸시도 못 한다. 알 수 없는 자에게
묻는 꼴이다. 안 한다.

**계획서 본문을 서비스에 저장한다.** 링크 의존을 통째로 없애지만, "저장소가 내용을 갖고
서비스가 상태를 갖는다"는 구조를 뒤집는다. 어느 쪽이 진실인지 두 곳이 갈릴 수 있다.
이 제안의 범위가 아니다.

**카드에서 로컬 경로를 일급으로 올린다.** 검토했고 안 한다. 웹 페이지는 `file://`를 열 수
없어서 경로는 누를 수 없는 텍스트로 남는다 — 무게를 바꿔도 소유자는 어차피 편집기로 옮겨
가야 한다. 더 큰 문제는 버전이다. 게이트 2가 승인하는 것은 특정 커밋인데 디스크의 파일은
그것과 다를 수 있고, 경로를 올리면 승인 대상이 아닌 판을 읽으라고 부추긴다. 같은 필요를
위 `git show <planCommit>:<planPath>`가 정확한 판으로 채운다. 그래서 카드는 건드리지 않는다.

**GitHub App(Phase 4).** 서버가 확실히 아는 유일한 길이고, `github.ts:5-7`이 이미 그리로
미뤄 두었다. 저장소 목록의 비공개 누락도 같이 풀린다. 크기가 이 제안과 다르므로 별도
제안서로 연다.

## Execution Plan

1. 런북에 확인 문장을 넣고 `templates.test.mjs`에 고정한다. `npm run test:templates`.
2. 템플릿을 `Sangeok/harness-templates`에 올리고 리시드한다.
3. 카드와 항목 페이지에 힌트 한 줄을 넣는다.
4. product-copy §7 · §11을 갱신한다.
5. 다섯 검증 명령을 돌린다.
6. `harness-smoke`에서 게이트 2 카드를 실제로 띄워 문장을 읽는다.

## Verification Plan

실행할 검증:

```bash
npm test
npm run test:web
npm run test:templates
npm run check
npm run verify:fsd
```

검증 기준:

- 다섯 명령이 전부 통과한다.
- 게이트 2 카드와 항목 페이지에 그 문장이 한 번씩 렌더된다.
- 기준선: `npm test` 147, `npm run test:web` 251, `npm run test:templates` 22,
  `npm run check` exit 0. 여기서 늘어난 실패만 신규다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm test` | Not run yet | 147 유지 기대 |
| `npm run test:web` | Not run yet | 251 + 신규 |
| `npm run test:templates` | Not run yet | 22 + 1 |
| `npm run check` | Not run yet | exit 0 기대 |
| `npm run verify:fsd` | Not run yet | pass 기대 |
| 게이트 2 카드 실측 | Not run yet | 문장이 보이는지 |

## Risks and Rollback

잔여 리스크:

- 1번은 세션이 지시를 따라야 동작한다. 서버가 강제하지 않는다. 이 제안이 서버 확인을 범위
  밖에 둔 결과이고, 그 한계를 그대로 안고 간다.
- 낡은 원격 추적 ref 때문에 "푸시되지 않았다"를 잘못 말할 수 있다. `git fetch`를 먼저
  시키는 이유이고, 틀려도 해로운 행동을 부르지 않는다.
- 2번은 링크를 누르기 **전에** 읽히지 않을 수 있다. 404를 본 뒤에 읽히더라도 원인을
  알려 주므로 지금보다는 낫다.

롤백 방법:

- PR revert. 상태도 스키마도 안 건드린다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: GitHub App 제안서

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했다.
- [x] `status`는 `pending`이고 위치는 `active/`다.
- [x] `stage`는 `draft`다.
- [x] `proposal-size`는 `small`이고 근거를 적었다(마이그레이션·API 계약·삭제 없음, 5개 미만).
- [x] 승인 기록은 front matter를 단일 기준으로 쓴다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 있다.
- [x] 안전성 분석에서 관련 항목을 확인하고 무관한 것은 표시만 남겼다.
- [x] 검증 명령과 성공 기준이 있다.
- [x] 기존 실패와 신규 실패를 구분하는 기준선을 적었다.
- [x] 잔여 리스크를 명시했다.
- [ ] 완료 문서 항목 — 아직 pending이다.
