---
status: "active"
stage: "running"
result: null
report-kind: "exploratory"
report-size: "standard"
test-levels: ["static", "component", "integration"]
test-tools: ["node:test", "Git", "lsof", "PowerShell Core"]
created-at: "2026-11-17"
completed-at: null
last-executed-at: "2026-11-17T08:42:34Z"
tested-revision: "8e0f880c13c2a0dce02c9246c983dffff898bc77 + QUALIFY working tree"
owners: []
related:
  - "docs/proposals/active/pr-worktree-closeout-phase-qualify.md"
  - "docs/proposals/active/pr-worktree-closeout.md"
primary-area: "tooling/pr-worktree-qualify"
observed-environments: ["macOS arm64 / Darwin 25.2.0 / Node 26.4.0"]
test-summary: "blocked: QUALIFY 후보 — macOS 관측 경로 통과, Windows 및 전체 인수 진행 중"
follow-up: ["Windows 2022 native gate", "전체 프로젝트 검사", "미지원 profile·권한 사례 판정"]
---

# PR worktree 사용 관측 QUALIFY 실행

## Summary and Decision

공통 Node ESM 관측 모듈과 macOS lsof/ps 후보, Windows PowerShell Core/C# 후보를 구현했다. 운영 정리기에 연결하지 않았으며 worktree·branch 삭제와 PR 병합은 하지 않는다. Windows 실제 결과 전에는 양 OS qualification 성공을 선언하지 않는다.

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
| Windows native | yes | 미실행 |
| 권한·profile 한계와 구현 범위 | yes | qualification 최종 판정 전 대조 필요 |

## Commands

- STAGEKEEPER_USAGE_NATIVE_REQUIRED=1 node --test scripts/pr/process-usage.test.mjs: 최신 21 PASS, 1 SKIP, 0 FAIL. SKIP은 unsupported OS 전용 common 사례이며 macOS native 사례는 실행했다.
- npx eslint scripts/pr/*.mjs scripts/pr/testing/*.mjs: PASS.
- npm run verify:fsd, npm run verify:server: PASS.
- npm run verify:shared: 처음에는 Prisma generated client가 없어 실패. 생성 후 재검증 예정.
- npm run verify:ci-coverage: PASS, 13 jobs / 15 rows.

## Evidence Registry

[macOS 관측 기록](../assets/2026-11-17-pr-worktree-qualify/macos-observations.json)은 실패한 첫 확장 실행과 수정 후 실행을 함께 보존한다. source hash는 기록을 모은 시점의 구현이다. 실행별 code 변화는 Findings에 구분한다. process 이름·명령·env·관계없는 cwd는 기록하지 않는다.

## Findings

- 첫 확장 실행의 실패 3건은 외부 population 변경을 unknown으로 보존한 결과였다. 정상 대조를 얻을 수 없는 가용성 문제가 있었다.
- 관측 budget을 유지한 채 fresh snapshot을 수집하며 population이 안정됐는지 재확인하도록 수정했다. 바뀐 population을 무시하거나 불완전한 결과를 clear로 만들지 않는다.
- macOS cwd는 libproc의 vnode 경로를 사용한다. 삭제된 무관한 cwd pathname을 다시 stat하지 않으며 대상 identity는 관측 전후 대조한다.
- Windows PID ownership·cwd layout·가시성은 실제 CI 결과를 기다린다.

## Conclusion

현재는 구현 후보와 macOS 부분 증거다. Windows와 전체 필수 사례·검사 결과를 기록한 뒤 QUALIFY 완료 또는 보류를 판정한다. REPLACE/ADOPT는 시작하지 않았다.
