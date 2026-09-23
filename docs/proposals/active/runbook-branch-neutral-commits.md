---
status: "pending"
stage: "approved"
proposal-size: "small"
created-at: "2026-09-24"
approved-by: "HamSangEok"
approved-at: "2026-09-24"
approval-scope: "결함 수정과 예방 규칙 둘 다 — 런북 템플릿·템플릿 시험(harness-templates), product-copy 계약(stagekeeper). 커밋·PR·재시드는 별도 지시"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/conventions/product-copy.md"
  - "docs/architecture/protocol.md"
  - "docs/proposals/completed/2026-09-01-harness-platform-phase-0-1.md"
---

# 런북의 브랜치 고정 문장 제거와 기록된 커밋 보존 규칙

## Summary

사용자 저장소에 심기는 런북(`CLAUDE.runbook.md`)의 Rules 문단에는 "The branch is `{{board_branch}}`."라는
문장이 있다. 서버는 커밋을 SHA로 기록하고 브랜치를 전혀 강제하지 않는데, 이 문장은 "커밋은 등록된 한
브랜치에만 한다"로 읽힌다. 그래서 기능 브랜치에서 작업하면 main loop가 어떻게 행동해야 할지가 모호해진다.
이 제안은 그 문장을 **지금 작업 중인 브랜치에 커밋한다**는 뜻이 분명한 문장으로 바꾼다. 함께, 기록된
계획·보고 커밋을 이력 재작성으로 잃지 않도록 **예방 규칙** 한 줄을 추가한다. 앞의 것은 결함 수정이고,
뒤의 것은 결함이 아니라 조건부 위험에 대한 방어다. 두 가지를 구분해서 적는다.

변경은 두 저장소에 걸친다. 템플릿과 템플릿 시험은 private 저장소 `Sangeok/harness-templates`
(stagekeeper 체크아웃의 `plugin/templates/`, 부모 저장소는 `.gitignore:50-51`로 무시)에 있다. 계약 문서는
stagekeeper에 있다.

## Goal

- 런북이 서버 동작(브랜치 무관, SHA 기록)과 어긋나는 지시를 하지 않게 한다 — **결함 수정**
- 게이트와 인수가 여는 기록 SHA가 이력 재작성으로 사라지지 않도록 규칙으로 막는다 — **예방 규칙**
- 작업 유형: 템플릿 문구 수정 + 계약 문서(product-copy) 동기화 + 템플릿 시험 추가

## Proposal Size

`proposal-size`: small

선택 근거:

- 변경은 템플릿 문단 하나, 계약 문서 한 곳, 시험 하나로 3개 파일이다. 저장소는 두 개(harness-templates 2개,
  stagekeeper 1개)지만, 코드·스키마·API 계약은 바뀌지 않는다.
- 롤백은 revert와 이전 판 템플릿 재시드로 끝난다.
- standard 강제 조건(삭제, 라우팅·인증, 데이터 구조, 5개 이상 파일 등) 중 해당하는 것이 없다. 다만 배포 뒤
  모든 기존 프로젝트의 런북 판정이 stale로 바뀐다(아래 Safety Analysis). 이 파급은 의도된 기존 메커니즘이다.

## Current State

### 0. 템플릿의 위치와 배포된 판

- 템플릿 원본: `Sangeok/harness-templates`(기본 브랜치 `main`, `delete_branch_on_merge: false`). 로컬 체크아웃은
  `plugin/templates/`(README: "변경 후 반영: stagekeeper 루트에서 `npm run seed:templates`").
- 2026-09-24 현재 체크아웃은 `harness/server-clean-code`(HEAD `2a42e84`)다. 이 브랜치는 `origin/main`보다
  4커밋 앞서 있고, 아직 병합되지 않은 PR #1("fix: include execution receipts in agent instructions", OPEN)의
  head다.
- **DB에 배포된 런북은 이 PR #1 판이다.** `Template(en, CLAUDE.runbook.md)` 본문의 sha256 앞 12자는
  `bfcb46d9b376`이다. `git show HEAD:en/CLAUDE.runbook.md | tr -d '\r' | sha256sum` 결과도 `bfcb46d9b376`이고,
  `origin/main` 판은 `05c4439c7704`로 다르다.
- 따라서 `harness-templates`의 `main`에서 분기해 재시드하면, 이미 배포된 PR #1의 변경(receipt 규칙,
  report-only 표)이 되돌아간다.

### 1. 브랜치 고정 문장 (결함)

`plugin/templates/en/CLAUDE.runbook.md:146-147`(`harness/server-clean-code` 기준, `origin/main`에서는 151-152):

```md
- **Commit plans, reports, and code. Nothing else.** The board's state lives in the service,
  so there's nothing of it to commit. The branch is `{{board_branch}}`.
```

`{{board_branch}}`는 `harness.json`의 `project.branch`다(`packages/core/vars.mjs:13`,
`plugin/lib/vars.mjs:13`). 예를 들어 mathgic에서는 `master`로 렌더된다.

**서버는 브랜치를 강제하지 않는다.** 확인한 근거:

- 계획서와 보고서는 SHA로 기록된다. `BoardItem.planCommit`, `Report.commit`(`prisma/schema.prisma:154,186`).
- 링크는 기록된 SHA를 연다. `blobHref`(`src/fsd/entities/board-item/model/doc-link.ts:10-12`)는 `ref`가 null일
  때만 `project.branch`로 대체하는데, 현재 쓰기 경로에서는 이 대체가 일어나지 않는다. 확인한 근거:
  - 링크를 만드는 호출은 셋뿐이다. 계획서 링크 둘(`src/fsd/pages/board-item/model/item-docs.ts:13-14`,
    `src/fsd/features/review-gate/model/inbox-item.ts:95`)은 `planPath`가 null이면 링크를 만들지 않는다.
  - `planPath`는 `plan_submit`만 기록하고, 그때 필수 입력인 `commit`을 `planCommit`에 함께 기록한다
    (`src/server/mcp/tools.ts:177`, `src/server/pipeline/board-query.ts:347`).
  - 보고서 링크(`item-docs.ts:29`)는 `Report.commit`을 쓰는데, 이 열은 NOT NULL이다.
  - 결과적으로 계획서 제출 전에는 링크 자체가 없다. `doc-link.ts:8-9`와 `inbox-item.ts:94`의 주석("제출 전에는
    브랜치 HEAD")은 현재 쓰기 경로와 맞지 않는 낡은 설명이다. 주석 정리는 이 제안의 범위가 아니다.
- 서버가 GitHub에 커밋이 어느 브랜치에 있는지 묻는 코드는 없다. GitHub API 호출은 저장소 목록 조회
  하나뿐이다(`src/server/github.ts:13`).
- 게이트 전 점검 `git branch -r --contains <planCommit>`는 모든 원격 브랜치를 본다. 그래서 기능 브랜치여도
  통과한다(`plugin/templates/en/CLAUDE.runbook.md:79`).

**이 문장은 계약에 없다.** `docs/conventions/product-copy.md:776-777`의 런북 Rules 계약은 "Commit plans,
reports, and code. Nothing else — the board isn't in the repo."까지만 있고, 브랜치 문장은 없다. 출처는
ApcH 이식 때의 파라미터화다. Phase 0-1 계획서(`docs/proposals/completed/2026-09-01-harness-platform-phase-0-1.md:1743`)에
"보드 브랜치 → `{{board_branch}}`"라고 적혀 있다. ApcH에서는 보드가 파일이라 특정 브랜치에 커밋해야
했지만, 지금은 보드가 서버에 있다. 런북도 바로 앞 문장에서 "커밋할 보드 상태가 없다"고 말한다. 문장의
이유는 사라졌고 문장만 남았다.

**관찰된 영향.** 2026-09-23 mathgic(`Sangeok/mathgic`, 등록 브랜치 `master`)에서 `/harness:init`을
`test` 브랜치에서 실행했다. init을 수행한 세션이 이 문장을 근거로 "You're on branch test, but the runbook
commits to master. Switch branches before you commit."이라고 안내했다. init 스킬과 생성기에는 그런 경고
코드가 없다(`plugin/skills/init/SKILL.md`, `plugin/bin/harness-init.mjs`, `plugin/lib/`에서 `branch` 검색으로
확인). 모델이 이 문장을 해석해서 덧붙인 말이다. 즉 해석이 갈린다는 증거가 하나 있다. 서버가 커밋을
거부하거나 데이터가 어긋난 사례는 없다.

### 2. 기록된 SHA의 보존 (조건부 위험, 결함 아님)

게이트 2 카드와 인수 검사 5는 기록된 SHA를 연다. 그 SHA가 어느 ref에서도 닿지 않게 되면 GitHub가 언젠가
정리할 수 있다. 확인한 범위:

- PR이 참조하는 커밋은 `refs/pull/<n>/head`(읽기 전용)가 붙잡는다. 브랜치를 지우거나 squash 병합해도
  SHA로 열린다. GitHub Docs "Removing sensitive data from a repository"는 PR이 참조하는 커밋을 지우려면
  Support가 PR을 역참조해야 한다고 적고 있다.
- PR 없이 push한 뒤 지운 브랜치, 그리고 기록 뒤 rebase·amend·force-push로 대체된 커밋은 보존이 보장되지
  않는다. 언제 정리되는지는 공식 문서에서 찾지 못했다(미확인).
- 이 위험은 **브랜치 운용과 무관하게** 있다. 단일 브랜치에서도 기록 뒤 force-push하면 똑같이 생긴다.
- 실측 사례는 없다. 2026-09-24 현재 서비스 DB의 `BoardItem.planCommit`과 `Report.commit` 기록이 0건이다.

## Scope

포함 범위:

- `harness-templates`: `en/CLAUDE.runbook.md` Rules 문단 수정
- `harness-templates`: `templates.test.mjs`에 문구 고정 시험 추가
- stagekeeper: `docs/conventions/product-copy.md` §`CLAUDE.runbook.md` Rules 계약에 같은 뜻의 문장 반영

제외 범위:

- 서버·DB·MCP 도구. 브랜치를 강제하거나 SHA를 보관하는 서버 기능은 만들지 않는다. 위험의 크기에 비해
  비용이 크다.
- `board_branch` 변수 자체의 제거나 이름 변경. 새 런북 문구는 `{{board_branch}}`를 더 이상 쓰지 않는다.
  이 변수를 쓰던 템플릿은 이 문장 하나뿐이었다(`rg -a -n --no-ignore "board_branch" plugin/templates` 결과 147행
  한 곳). 쓰지 않는 변수는 렌더에 해가 없다. `renderTemplate`은 **없는** 변수에만 throw한다
  (`packages/core/render.mjs:5`). 변수를 없애면 플러그인(`plugin/lib/vars.mjs`)을 다시 배포해야 하므로, 이번에는
  `packages/core/vars.mjs`, `plugin/lib/vars.mjs`, `packages/core/vars.test.mjs:15`,
  `plugin/bin/harness-init.test.mjs:30`(가짜 런북 fixture)을 그대로 둔다.
- `doc-link.ts:8-9`·`inbox-item.ts:94`의 낡은 주석과, 도달하지 않는 `blobHref`의 브랜치 대체 경로 정리.
- init 산출물을 기본 브랜치에 커밋해야 다른 브랜치가 물려받는다는 점. 이것은 파일의 성질이지 모순이
  아니므로 이번 범위가 아니다.
- product-copy §`CLAUDE.runbook.md`의 다른 낡은 부분(단계 번호, "Free is web only" 등). 현재 템플릿과 어긋나
  보이지만 이 제안과 무관하므로 따로 다룬다.
- harness-templates PR #1의 내용. 이 제안은 그 위에 쌓을 뿐 검토하거나 수정하지 않는다.

## Proposal

템플릿 Rules의 해당 항목을 아래 두 항목으로 바꾼다. 아래 문구가 확정안이다.

변경 전:

```md
- **Commit plans, reports, and code. Nothing else.** The board's state lives in the service,
  so there's nothing of it to commit. The branch is `{{board_branch}}`.
```

변경 후:

```md
- **Commit plans, reports, and code. Nothing else.** The board's state lives in the service,
  so there's nothing of it to commit. Commit on the branch you are working on — the server
  records commits by SHA, not by branch.
- **A recorded commit is evidence — don't rewrite it.** After a plan or report commit is
  recorded, don't rebase, amend, or force-push it away. Merge a feature branch through a pull
  request, or keep the branch: the gate and the acceptance check open that exact SHA.
```

product-copy 계약(`docs/conventions/product-copy.md:776-777`의 Rules 항목)은 아래처럼 바꾼다.

변경 전:

```md
- Rules: "Only the main loop dispatches agents. Agents never call each other." · "Commit plans,
  reports, and code. Nothing else — the board isn't in the repo." · "Only you open the gates.
```

변경 후:

```md
- Rules: "Only the main loop dispatches agents. Agents never call each other." · "Commit plans,
  reports, and code. Nothing else — the board isn't in the repo.
  Commit on the branch you are working on — the server records commits by SHA, not by branch." ·
  "A recorded commit is evidence — don't rewrite it. Merge a feature branch through a pull
  request, or keep the branch." · "Only you open the gates.
```

뒤따르는 줄(`In the web inbox, …`)은 그대로 둔다. `Commit on the branch you are working on`은 한 줄 안에 두어야
한다. Verification Plan의 `rg` 대조가 줄 단위로 찾기 때문이다.

동작 차이:

| 항목 | 지금 | 바뀐 뒤 |
| --- | --- | --- |
| 기능 브랜치에서 main loop가 커밋할 곳 | "The branch is master"로 읽혀 모호함. 브랜치를 옮기거나 멈출 수 있음 | 지금 작업 중인 브랜치 |
| 런북의 `{{board_branch}}` | 커밋 대상 브랜치로 읽힘 | 런북에서 쓰지 않음 |
| 기록 SHA 보존 | 규칙 없음 | 이력 재작성 금지, PR로 병합하거나 브랜치 유지 |
| 서버·DB·MCP | 변경 없음 | 변경 없음 |

## Affected Files

| 저장소 · 경로 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| harness-templates · `en/CLAUDE.runbook.md` | update | Rules 문단의 계약 밖 문장 교체와 예방 규칙 추가. `{{board_branch}}` 참조가 빠지고 새 변수는 없다 | low — 문구 변경. 배포 뒤 모든 프로젝트 런북이 stale로 판정된다(의도된 동작) |
| harness-templates · `templates.test.mjs` | update | Execution Plan 4의 단언 넷: 새 문구 둘, `The branch is` 재유입 금지, 런북 원문의 `board_branch` 참조 금지 | none |
| stagekeeper · `docs/conventions/product-copy.md` | update | §`CLAUDE.runbook.md` Rules 계약에 같은 뜻의 문장 반영. 계약이 문구의 원본이다 | none |

## Safety Analysis

- **변수 호환**: 새 문구는 `{{board_branch}}` 참조를 없애기만 하고 새 변수를 쓰지 않는다. 설치된 플러그인은
  `board_branch`를 계속 만들어 넘기지만, 쓰지 않는 변수는 무시된다. `template var missing`은 없는 변수에서만
  난다(`packages/core/render.mjs:5`). 그래서 플러그인 갱신 없이 DB 재시드만으로 배포된다.
- **배포 판 보존**: DB의 현재 판은 harness-templates PR #1 판(`bfcb46d9b376`)이다. 이 변경은 그 판 위에
  쌓아야 한다. 그렇지 않고 `main`에서 분기해 재시드하면 PR #1의 배포된 변경이 사라진다(Execution Plan 1).
- **런북 판정 파급**: 런북 판은 템플릿 원문 sha256의 앞 12자다(`packages/core/runbook.mjs:9-11`). seed는
  CRLF를 LF로 바꿔 저장한다(`scripts/seed-templates.ts:32`). 재시드하면 init을 다시 돌리기 전까지 기존
  프로젝트 전부가 `pipeline_next`에서 `runbook: { stale: true, note }`를 받는다(`src/server/mcp/deps.ts:63`,
  `docs/conventions/product-copy.md`의 `pipeline_next` 항목). 템플릿이 바뀔 때 늘 일어나는 의도된 동작이다.
  사용자가 할 일은 `/harness:init` 재실행 한 번이다.
- **다른 곳의 같은 문장 없음**: 저장소 전체에서 `The branch is`를 검색했다.
  `rg -a -n --no-ignore --hidden "The branch is" --glob '!node_modules' --glob '!.next' --glob '!.git' .`
  결과, 이 제안서 말고는 `plugin/templates/en/CLAUDE.runbook.md:147` 한 곳에만 있다. `--no-ignore`가 필요한
  이유가 있다. 기본 `rg`는 `.gitignore:51`의 `/plugin/templates/`를 건너뛰어 템플릿을 보지 못한다. 런북 판 해시를 고정한
  golden 값도 없다(`packages/core/runbook.test.mjs`는 함수 성질만 검사한다).
  `tests/server/integration/templates.test.ts`는 가짜 본문("Full runbook")을 쓰므로 영향이 없다.
- **문구 잠금과 폐기 표현 가드**: `docs/architecture/verification.md`의 변경 전 체크리스트에는 "사용자에게 말해 둔
  사실을 바꾸면 옛 표현을 `scripts/retired-copy.test.mjs`의 `RETIRED`에 더한다"는 항목이 있다. 이번에는
  `RETIRED`에 규칙을 더하지 않는다. 그 가드가 보는 곳은 웹 문구(`src/fsd`·`src/app`), `plugin/skills`의 `SKILL.md`,
  product-copy의 copy-lock 블록 셋뿐이다. 옛 문장 `The branch is`는 이 셋 어디에도 없고, private 템플릿에만
  있다(위 `--no-ignore` 검색). 그래서 규칙을 더해도 지키는 대상이 없다. 재유입은 템플릿 쪽 시험(Execution Plan
  4의 `doesNotMatch`)이 막는다. 또 product-copy의 바뀌는 줄(776-777)은 copy-lock 블록 밖이다. 블록은
  232·366·383·397·460·874행에서 시작한다. 그래서 같은 커밋에서 따라 바꿔야 할 화면 문구나 잠금 시험은 없다.
- **에이전트 정의 영향 없음**: 에이전트 템플릿 다섯(`agents/dev.md`·`pm.md`·`plan-verifier.md`·`doc-auditor.md`·
  `feature-scout.md`)과 `docs/` 템플릿에는 git 브랜치 규칙이 없다.
  `rg -a -n --no-ignore -i "branch|rebase|force-push|amend|git push|git commit" plugin/templates/en/agents plugin/templates/en/docs`
  결과는 다섯 줄이다. 전부 코드의 분기를 말하는 줄이다: `dev.md:196`·`docs/plans/template.md:52,70`의 "branch
  order"·"branch list", `feature-scout.md:122`의 "failure branches", `docs/plans/verification-paths.md:29`의
  "branches". dev는 이미 `git reset --hard` 같은 작업 트리 재설정을 금지한다. 새 규칙은 런북을 읽는 main loop에
  적용된다.
- **재시드의 재실행·실패·동시성**: 재시드는 `(lang, path)` 한 행의 `upsert`다(`scripts/seed-templates.ts:35-39`).
  같은 본문으로 다시 돌려도 결과가 같다. 한 파일만 올리므로 여러 파일 중 일부만 반영되는 부분 실패가 없다.
  실패하면 행이 이전 판 그대로 남으므로 다시 돌리면 된다. 두 사람이 동시에 재시드하면 마지막 쓰기가 이긴다.
  이 DB는 소유자 한 사람이 운영하는 서비스 DB이고, 판은 7단계의 해시 대조로 확인하므로 별도 잠금은 두지 않는다.
  재시드와 동시에 돌던 세션은 다음 `pipeline_next`에서 stale 안내를 받을 뿐, 진행 중인 run은 영향이 없다.
  서버가 런북 원문을 읽는 곳은 stale 판정 하나뿐이다(`src/server/runbook.ts:32-34`). 실행 순서는 파이프라인
  정의에서 온다(`plugin/templates/en/CLAUDE.runbook.md:67`).
- **서버 동작 불변**: 코드 변경이 없으므로 라우팅, 인증, import, 런타임 side effect와 관계가 없다.

## Approval

승인 메모:

- 2026-09-24 소유자가 "이 제안서를 바탕으로 실제 코드 수정을 진행하라"고 지시했다. 예방 규칙을 빼라는
  말이 없었으므로 두 항목 모두 적용했다.
- 예방 규칙(두 번째 항목)은 결함 수정이 아니다. 승인할 때 포함할지를 따로 정할 수 있다. 제외하면 템플릿,
  product-copy, 시험에서 해당 문장과 단언을 모두 뺀다.

## Execution Plan

1. **harness-templates 기준 판 결정**: PR #1이 병합되어 있으면 `main`에서, 아니면
   `harness/server-clean-code`에서 `harness/runbook-branch-neutral` 브랜치를 만든다. 어느 쪽이든 분기 시점의
   `en/CLAUDE.runbook.md` LF sha256 앞 12자가 DB 판(`bfcb46d9b376`)과 같아야 한다. 다르면 멈추고 배포 판을
   다시 확인한다. 두 값은 stagekeeper 루트에서 아래 읽기 전용 명령으로 얻는다(Git Bash, 2026-09-24 실행해
   둘 다 `bfcb46d9b376` 확인).

   ```bash
   # 저장소 판
   git -C plugin/templates show HEAD:en/CLAUDE.runbook.md | tr -d '\r' | sha256sum | cut -c1-12
   # DB 판 (scripts/lib/prisma.ts의 withPrisma — .env를 dotenv로 읽는다. 쓰기 없음)
   node --import tsx -e 'const { withPrisma } = require("./scripts/lib/prisma"); const { createHash } = require("node:crypto"); withPrisma(async (p) => { const t = await p.template.findUnique({ where: { lang_path: { lang: "en", path: "CLAUDE.runbook.md" } }, select: { body: true } }); console.log(createHash("sha256").update(t.body).digest("hex").slice(0, 12)); });'
   ```

   DB 판 명령은 seed와 같은 Prisma 도우미를 쓴다. 그래서 직접 의존성(`@prisma/adapter-pg`, `dotenv`, `tsx`)만
   필요하고, 간접 의존성인 `pg`에 기대지 않는다.
2. stagekeeper `harness/runbook-branch-neutral`(이 제안서의 브랜치)에서 product-copy 계약 수정(계약 먼저).
3. harness-templates 브랜치에서 `en/CLAUDE.runbook.md`의 Rules 문단 수정.
4. harness-templates `templates.test.mjs`의 "friction found by running a cycle" 묶음에 시험 하나 추가.
   단언은 줄바꿈이 바뀌어도 깨지지 않게 `\s+`로 쓴다.
   - `assert.doesNotMatch(render("CLAUDE.runbook.md"), /The branch is/)`
   - `assert.doesNotMatch(tpl("CLAUDE.runbook.md"), /board_branch/)` — 원문 검사다. 렌더 결과에서는 변수가 이미
     치환되어 보이지 않는다. `tpl`은 파일 최상위에 정의되어 있다(`templates.test.mjs:16`).
   - `assert.match(render("CLAUDE.runbook.md"), /Commit on the branch you are working on/)`
   - `assert.match(render("CLAUDE.runbook.md"), /don't rebase,\s+amend,\s+or\s+force-push/)`
5. 검증 명령 실행.
6. PR 두 개: stagekeeper는 `gh pr create --base dev`, harness-templates는 1단계의 기준 브랜치를 base로.
7. 병합 뒤 재시드: 런북 한 파일만 담은 임시 디렉터리로 부분 재시드한다. seed는 `--dir` 아래의 언어
   디렉터리를 읽으므로(`scripts/seed-templates.ts:27-29`) 구조가 `<tmp>/en/CLAUDE.runbook.md`여야 한다.
   `npm run seed:templates -- --dir <tmp>`. 재시드 뒤 1단계의 두 명령을 다시 돌려 DB 판이 새 저장소 판과 같은지
   확인한다. 저장소 판 명령의 `HEAD`는 병합된 harness-templates 커밋이어야 한다.
8. mathgic에서 `/harness:init` 재실행 → `CLAUDE.md` runbook 갱신과 stale 해제 확인.

## Verification Plan

실행할 검증(stagekeeper 루트, Git Bash 기준):

```bash
npm run test:templates
npm test
npm run check
```

`npm run test:templates`는 체크아웃된 `plugin/templates/`(harness-templates 작업 브랜치)를 읽는다. 그래서
3~4단계를 적용한 상태에서 돌려야 한다.

검증 기준:

- `test:templates`에서 새 시험이 통과하고, 기존 단언(`git branch -r --contains <planCommit>` 등)이 그대로
  통과한다.
- `npm test`, `npm run check`는 변경 전과 같은 결과여야 한다. 실패가 있으면 변경 전 상태에서 같은 명령을
  돌려 기존 실패와 신규 실패를 구분한다.
- 계약 동기화: `rg -a -n "Commit on the branch you are working on" docs/conventions/product-copy.md
  plugin/templates/en/CLAUDE.runbook.md`가 두 파일 모두에서 찾는다. `rg -a -n "The branch is" plugin/templates/en`은
  아무것도 찾지 않는다. 검색 대상을 `en/`으로 한정하는 이유가 있다. `plugin/templates/templates.test.mjs`에는
  4단계의 `/The branch is/` 단언이 들어가므로, 그 파일까지 검색하면 늘 걸린다.
- 배포 확인: 재시드 뒤 mathgic 세션(`hs_` 토큰이 있는 터미널)에서 `pipeline_next({})`가 `runbook.stale`을
  내고, init을 다시 돌리면 그 필드가 사라진다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run test:templates` | pass 27 / fail 0 (2026-09-24) | 새 시험 "the runbook does not pin commits to one branch and keeps recorded commits" 포함. 옛 문장 `The branch is \`{{board_branch}}\``을 잠시 되돌리면 pass 26 / fail 1로 실패하는 것을 확인한 뒤 복구 |
| `npm test` | pass 180 / fail 0 (2026-09-24) | |
| `npm run check` | exit 0 (2026-09-24) | lint·verify-fsd·typegen·tsc·test:architecture(retired-copy 포함)·test:project-availability |
| 계약 동기화 `rg` | 기준 충족 (2026-09-24) | `Commit on the branch you are working on`: product-copy.md:778, CLAUDE.runbook.md:147. `rg "The branch is" plugin/templates/en`, `rg "board_branch" plugin/templates/en`: 결과 없음 |
| 새 런북 판 | `a85859257e4c` | 작업 트리 `en/CLAUDE.runbook.md`의 LF sha256 앞 12자. 7단계 재시드 뒤 DB 판이 이 값이어야 한다(커밋 전 값이므로 커밋 후 1단계 명령으로 다시 확인) |

미실행: 6단계(PR), 7단계(재시드), 8단계(mathgic init)와 "배포 확인" 기준. 커밋·PR·DB 쓰기는 소유자 지시가 있을 때 한다.

## Risks and Rollback

잔여 리스크:

- 예방 규칙은 문서 규칙일 뿐이라 강제력이 없다. 사용자가 이력을 다시 쓰면 링크는 여전히 끊길 수 있다.
  PR 없이 지운 브랜치의 커밋이 GitHub에서 언제 정리되는지는 미확인으로 남는다.
- 새 문구도 모델이 해석한다. "작업 중인 브랜치"를 main loop가 어떻게 따르는지는 실제 사이클에서만 확인된다.
- 재시드 직후부터 사용자가 init을 다시 돌릴 때까지 기존 프로젝트에 stale 안내가 뜬다.
- harness-templates PR #1이 이 작업 도중 바뀌거나 병합되면 1단계의 기준 판이 달라진다. 1단계의 해시
  대조로 잡는다.

롤백 방법:

- 두 저장소의 변경을 revert한 뒤 이전 판 런북(DB 판 `bfcb46d9b376`, harness-templates `2a42e84`의
  `en/CLAUDE.runbook.md`)을 같은 방식으로 부분 재시드한다. 이미 새 판으로 init한 저장소는 다시 stale로
  판정되고, init을 한 번 더 돌리면 복구된다.

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
