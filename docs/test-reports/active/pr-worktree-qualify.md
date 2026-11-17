---
status: "active"
stage: "awaiting-rerun"
result: null
report-kind: "exploratory"
report-size: "standard"
test-levels: ["static", "component", "integration"]
test-tools: ["node:test", "Git", "lsof", "PowerShell Core"]
created-at: "2026-11-17"
completed-at: null
last-executed-at: "2026-11-17T09:06:35.497Z"
tested-revision: "285de226d8815c0604af21be826ada5b7febbcfb"
owners: []
related:
  - "docs/proposals/active/pr-worktree-closeout-phase-qualify.md"
  - "docs/proposals/active/pr-worktree-closeout.md"
primary-area: "tooling/pr-worktree-qualify"
observed-environments: ["macOS arm64 / Darwin 25.2.0 / Node 26.4.0", "GitHub macos-15 / Node 22.23.4", "GitHub windows-2022 x64 / Node 22.23.4"]
test-summary: "fail: QUALIFY 후보 — macOS 통과, Windows 필수 clear/busy 대조군이 cwd 접근 거부로 미충족"
follow-up: ["Windows cwd 조회 후보 재선정 후 native 재검증", "기존 codex-init-eval 150ms 시험의 CI 타이밍 실패 별도 확인", "REPLACE 착수 보류"]
---

# PR worktree 사용 관측 QUALIFY 실행

## Summary and Decision

공통 Node ESM 관측 모듈과 macOS lsof/ps 후보, Windows PowerShell Core/C# 후보를 구현했다. 운영 정리기에 연결하지 않았으며 worktree·branch 삭제와 PR 병합은 하지 않는다. Windows 실제 실행에서 같은 계정의 process 1건에 대한 cwd 조회가 권한 거부로 실패했다. 필수 정상 대조군을 만족하지 못했으므로 QUALIFY는 미통과이며 REPLACE는 보류한다.

## Scope and Criteria

상위 REQ-PWC-014 / TASK-PWCQ-01 / VFY-PWC-09를 기준으로 한다. 관측은 현재 계정의 모든 세션에 있는 non-zombie process cwd로 제한한다. 다른 계정·특권·remote host·cwd 밖의 파일 사용을 인증하지 않는다. 이것은 삭제 허가가 아니다.

## Test Target

기준 commit 대비 새 scripts/pr 모듈·시험·CI step·coverage 설명이 추가된 working tree다. .sh/Bash와 OpenClaw runtime을 사용하지 않는다. Windows는 설치된 PowerShell Core 7과 Server 2022 x64/build 20348만 후보이며 자동 설치·권한 상승이 없다.

## Test Matrix

| 구분 | required | 현재 결과 |
| --- | --- | --- |
| protocol·입력·실패 경계 | yes | 로컬 통과 |
| macOS native clear/busy·부모/sibling·독립 process group | yes | 최신 실행 통과 |
| population 변경의 unknown 보존 | yes | 실제 변경을 관측했고 fresh snapshot 횟수 기록 |
| Windows native | yes | FAIL — 필수 clear/busy 대조군 7건 모두 unknown, missingCount=1 |
| 권한·profile 한계와 구현 범위 | yes | BLOCKED — 현재 PEB 후보를 운영에 채택할 근거 부족 |

## Commands

- STAGEKEEPER_USAGE_NATIVE_REQUIRED=1 node --test scripts/pr/process-usage.test.mjs: 최신 21 PASS, 1 SKIP, 0 FAIL. SKIP은 unsupported OS 전용 common 사례이며 macOS native 사례는 실행했다.
- npx eslint scripts/pr/*.mjs scripts/pr/testing/*.mjs: PASS.
- npm run verify:fsd, npm run verify:server: PASS.
- npm run verify:shared: 처음에는 generated Prisma client 부재로 실패. 생성 후 npm run check의 동일 검사 통과.
- npm run check: 로컬 PASS, 581 PASS / 4 SKIP.
- npm run test:architecture: 로컬 PASS, 472 PASS / 4 SKIP.
- npm run build: 첫 실행은 Next.js 안내로 중단, 같은 명령의 재실행 PASS. 의존성 upgrade는 하지 않음.
- npm run verify:ci-coverage: PASS, 13 jobs / 15 rows.

## Evidence Registry

[macOS 관측 기록](../assets/2026-11-17-pr-worktree-qualify/macos-observations.json)은 실패한 첫 확장 실행과 수정 후 실행을 함께 보존한다. source hash는 기록을 모은 시점의 구현이다. 실행별 code 변화는 Findings에 구분한다. process 이름·명령·env·관계없는 cwd는 기록하지 않는다.

## Findings

- 첫 확장 실행의 실패 3건은 외부 population 변경을 unknown으로 보존한 결과였다. 정상 대조를 얻을 수 없는 가용성 문제가 있었다.
- 관측 budget을 유지한 채 fresh snapshot을 수집하며 population이 안정됐는지 재확인하도록 수정했다. 바뀐 population을 무시하거나 불완전한 결과를 clear로 만들지 않는다.
- macOS cwd는 libproc의 vnode 경로를 사용한다. 삭제된 무관한 cwd pathname을 다시 stat하지 않으며 대상 identity는 관측 전후 대조한다.
- Windows 첫 실행은 missingCount=1을 관측했다. 단계 진단을 추가한 두 번째 실행에서 cwd-open-5(Access denied) 1건으로 좁혔다.
- PROCESS_QUERY_INFORMATION 대신 PROCESS_QUERY_LIMITED_INFORMATION과 VM_READ의 최소 조합으로 바꾼 세 번째 실행도 동일했다. 해당 process를 무시하거나 SeDebugPrivilege를 활성화하지 않았다.
- 첫 Windows 실행에서 실패한 fixture의 holder 종료 전에 directory를 정리하여 EBUSY가 발생한 시험 문제는 자기 holder를 먼저 종료하도록 수정했다. 후속 실행에서는 EBUSY 없이 원래 coverage 실패가 보고됐다.
- 최신 check/static 실패는 변경하지 않은 scripts/rehearsals/codex-init-eval.test.mjs:41의 150ms timeout 사례에서 synthetic stdout/stderr가 비어 있던 것이다. 초기 CI와 로컬 check는 통과했다. 타이밍 영향은 추론이며 baseline 재현을 완료한 것으로 표시하지 않는다. 해당 파일은 이번 범위에서 수정하지 않았다.

## Conclusion

필수 Windows 대조군 FAIL이 있으므로 현재 시험의 전체 판정은 fail이다. 실행은 후속 후보 수정/재검증을 기다리므로 active/awaiting-rerun으로 유지한다. 계획의 Windows 사용 확인 blocker는 해소되지 않았고, Phase 실행은 보류다.

다음 작업은 Windows에서 프로세스 메모리 조회에 의존하는 현재 후보를 대체할 방법을 검증하거나, 관측 범위·권한 계약 변경이 필요한지 설계로 결정하는 것이다. 새로운 권한 상승이나 실패 process 제외로 gate를 통과시키지 않는다. 양 OS의 모든 필수 사례를 충족한 뒤에만 REPLACE 상세 구현으로 진행한다.

## CI Evidence

| Run / source commit | macOS native | Windows native | 기타 |
| --- | --- | --- | --- |
| [44049597103](https://github.com/Sangeok/stagekeeper/actions/runs/44049597103) / 0cd239a | PASS | FAIL, coverage 누락 1건 | 나머지 job PASS |
| [44051768584](https://github.com/Sangeok/stagekeeper/actions/runs/44051768584) / 32daabc | native step PASS | FAIL, cwd-open-5 | 진단 및 fixture 정리 수정 확인 |
| [44052440547](https://github.com/Sangeok/stagekeeper/actions/runs/44052440547) / 285de22 | PASS | FAIL, 최소 권한에도 cwd-open-5 | build/test/web/server/integration PASS, static 기존 timeout 사례 FAIL |

[macOS CI](../assets/2026-11-17-pr-worktree-qualify/macos-ci.json), [Windows 최초](../assets/2026-11-17-pr-worktree-qualify/windows-first.json), [Windows 진단](../assets/2026-11-17-pr-worktree-qualify/windows-diagnostic.json), [최소 권한 재검증](../assets/2026-11-17-pr-worktree-qualify/windows-minimal-rights.json)을 보존한다. 각 파일의 commit·run/job ID를 기준으로 결과를 해석한다.
