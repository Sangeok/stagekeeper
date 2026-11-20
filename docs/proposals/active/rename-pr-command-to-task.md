---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-11-20"
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
  - "docs/proposals/active/pr-worktree-closeout.md"
  - "docs/proposals/active/pr-worktree-closeout-phase-adopt.md"
  - "docs/architecture/verification.md"
---

# 작업 마무리 명령의 이름을 `npm run pr`에서 `npm run task`로

## Summary

작업 브랜치와 작업 폴더를 만들고, PR 병합을 확인하고, 폴더와 브랜치를 정리하는
명령의 이름을 `npm run pr`에서 `npm run task`로 바꾼다. 지금 이름은 PR을 만드는
명령처럼 읽히지만 이 명령은 PR을 만들지 않는다. 동작은 바꾸지 않는다. 시작 조건은
`pr-worktree-closeout`의 ADOPT 단계 완료다. 그 전에는 실행하지 않는다.

## Goal

- 명령 이름이 그 명령이 다루는 단위(작업)를 가리키게 한다.
- `gh pr create`(PR을 만든다)와 `npm run pr -- create`(작업 브랜치와 폴더를 만든다)가
  같은 작업 안에서 연달아 쓰이면서 생기는 혼동을 없앤다.
- 작업 유형: 명령 이름 변경과 그 이름을 적은 문서·시험의 수정.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 고칠 파일이 5개를 넘는다. `package.json`, `AGENTS.md`,
  `docs/architecture/verification.md`, `scripts/pr/cli-integration.test.mjs`,
  active 제안서 4개가 이 이름을 적고 있다.
- 에이전트가 따르는 명령을 바꾸므로 옛 이름을 기억한 세션이 실패할 수 있다.

## Current State

- `package.json`의 `pr` 스크립트가 `node scripts/pr/index.mjs`를 실행한다. 2026-11-18
  (`70b182a`)에 들어왔다.
- 하위 명령은 `create`, `status`, `inspect`, `complete`, `cleanup`, `recover`,
  `resume`, `retire`, `acknowledge-removal`, `recover-guard`, `migrate`다. 모두 작업
  하나의 수명을 다룬다. PR을 만드는 하위 명령은 없고, PR은 `gh pr create`로 만든다.
- 도구 안에서는 이미 작업을 단위로 부른다. 인자가 `--task <uuid>`이고 상태 파일이
  `task-state.mjs`다.
- 이름이 하는 일을 알려 주지 못한 사례가 있다. 2026-11-20의 CI 조사 대화에서 이
  도구를 한쪽은 "병합 도구"로, 다른 쪽은 "브랜치와 worktree 정리 스크립트"로
  이해하고 있었다.
- 제품 코드(`src`, `packages`, `prisma/schema.prisma`)에는 `task`라는 식별자가 없다.
  `package.json`에 `task`로 시작하는 스크립트도 없다.

## Scope

포함 범위:

- `package.json`의 스크립트 이름 `pr`을 `task`로 바꾼다.
- 그 이름을 적은 문서와 시험을 고친다.

제외 범위:

- 디렉터리 `scripts/pr/`의 이름. 그대로 둔다.
- 상태를 담는 로컬 ref `refs/stagekeeper/pr-closeout/`. 이름을 바꾸면 기존 작업
  기록의 이관이 필요해지므로 건드리지 않는다.
- CI 잡 이름 `task-worktrees`.
- 하위 명령의 이름과 동작, 출력 형식.
- 옛 이름 `pr`을 별칭으로 남기는 일. 이 저장소는 대체된 명령의 별칭을 남기지
  않는다.

## Proposal

1. `package.json`에서 `"pr": "node scripts/pr/index.mjs"`를
   `"task": "node scripts/pr/index.mjs"`로 바꾼다.
2. `scripts/pr/cli-integration.test.mjs`의 단정을 고친다. `manifest.scripts.task`가
   위 값이고 `manifest.scripts.pr`은 없어야 한다. `AGENTS.md`에 `npm run pr`이 남아
   있지 않은지도 같은 시험에서 단정한다.
3. `AGENTS.md`와 `docs/architecture/verification.md`의 `npm run pr`을 `npm run task`로
   바꾼다.
4. active 제안서와 조사 문서의 명령 표기를 바꾼다. completed 제안서와 시험 보고서는
   그때의 기록이므로 바꾸지 않는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `package.json` | update | 스크립트 이름 한 줄 | low. 옛 이름으로 부르면 npm이 실패한다 |
| `scripts/pr/cli-integration.test.mjs` | update | 스크립트 이름과 `AGENTS.md` 표기를 단정한다 | low |
| `AGENTS.md` | update | 에이전트가 따르는 명령 표기 | medium. 옛 표기가 남으면 에이전트가 없는 명령을 부른다 |
| `docs/architecture/verification.md` | update | 명령 사용법 16줄 | low |
| `docs/proposals/active/pr-worktree-closeout*.md`, `docs/investigations/active/ci-management-practices-investigation.md` | update | 진행 중 문서의 명령 표기 | low |
| `scripts/pr/**`, `refs/stagekeeper/pr-closeout/` | keep | 제외 범위 | none |

## Safety Analysis

이름만 바꾸고 실행 파일과 인자는 그대로다. 위험은 옛 이름을 부르는 쪽이 남는
경우뿐이다.

확인한 항목:

- [x] 테스트와 스크립트 참조. `npm run pr`과 `scripts.pr`을 적은 곳은 위 표의
  파일들이다(`git grep`, completed 제안서와 시험 보고서 제외).
- [x] 정적 `import` / `export from`. `scripts/pr/` 밖에서 이 디렉터리를 import하는
  코드가 없다. 디렉터리는 옮기지 않는다.
- [ ] 런타임 side effect 또는 초기화 코드. 이름 변경과 무관하지만, 진행 중인
  작업의 상태가 이름과 묶여 있지 않은지는 실행 전에 `status`로 다시 확인한다.
- [x] 워크플로 참조. `.github/workflows/`의 어떤 워크플로도 `npm run pr`을 부르지
  않는다(`grep`, 2026-11-20). `check.yml`은 `scripts/pr/`의 시험 파일 경로를 직접
  부르고, 그 경로는 바꾸지 않는다.

## Approval

승인 메모:

- 승인 전. 2026-11-20에 저장소 소유자가 "도입 작업이 끝난 뒤 `task`로 바꾼다"는
  방향을 정했다. 실행 승인은 ADOPT 완료 뒤에 따로 받는다.

## Execution Plan

1. `pr-worktree-closeout-phase-adopt.md`가 completed로 옮겨졌는지 확인한다. 아니면
   시작하지 않는다.
2. 열린 PR과 진행 중인 작업(`status`)을 확인한다. 진행 중인 작업의 소유자가 새
   이름을 알 수 있게 `AGENTS.md` 수정과 스크립트 이름 변경을 한 PR로 올린다.
3. Proposal의 1~4를 한 변경으로 적용한다.
4. 병합 뒤 control checkout을 최신 `dev`로 맞추고 `npm run task -- status`를 실행한다.

## Verification Plan

실행할 검증:

```bash
npm run check
node --test scripts/pr/cli-integration.test.mjs
npm run task -- status
git grep -n "npm run pr\b" -- . ':!docs/proposals/completed' ':!docs/test-reports'
```

검증 기준:

- `npm run check`와 `cli-integration` 시험이 통과한다.
- `npm run task -- status`가 JSON 한 문서를 내고 종료 코드가 0이다.
- 마지막 `git grep`의 결과가 이 제안서뿐이다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | Not run yet | 실행 전 |
| `npm run task -- status` | Not run yet | 실행 전 |

## Risks and Rollback

잔여 리스크:

- 옛 이름을 문맥에 가진 에이전트 세션이 `npm run pr`을 부르면 실패한다. 실패는
  즉시 드러나고 작업 상태를 바꾸지 않는다.
- 명령은 `task`이고 디렉터리는 `scripts/pr/`인 불일치가 남는다. 디렉터리 이름은
  이 제안서에서 다루지 않는다.

롤백 방법:

- 변경 커밋을 되돌린다. 상태 ref와 디렉터리를 건드리지 않으므로 되돌려도 작업
  기록은 그대로다.

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
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [x] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다. 해당 없음. 초안이다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [ ] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다. 한 항목은 실행 전에 다시 확인한다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. 아직 실행 전이다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다. 진행 중 문서라 해당 없음.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다. 진행 중 문서라 해당 없음.
