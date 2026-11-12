---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-11"
updated-at: "2026-11-12"
approved-by: "user"
approved-at: "2026-11-12"
approval-scope: "Core 구현 완료 확인에 따른 문서 완료 처리. Windows 설치 기록과 macOS 설치 미확인·자연 발생 한도 관찰 대기를 보존한다. 새 설치·배포·모델 호출은 포함하지 않는다."
completed-at: "2026-11-12"
verification-summary: "Core 구현과 최신 dev·main 포함을 재확인했다. 관련 회귀 86개 통과, plugin/lib 일치, #308 CI 성공. Windows 0.6.11 설치 완료 기록을 보존하며 macOS 설치와 실제 한도 관찰은 미확인 잔여 사항으로 남긴다."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-11-11-runner-usage-limit.md"
  - "docs/test-reports/completed/2026-11-10-codex-macos-native-acceptance.md"
  - "docs/architecture/protocol.md"
---

# Claude 사용 한도 대기 — 설치 적용 기록

## Summary

한도 대기 기능의 [코드 구현과 CI](./2026-11-11-runner-usage-limit.md)는 완료됐다.
2026-11-12 코드·회귀·병합 이력을 재확인했고, 소유자의 완료 처리 요청에 따라 이 문서를
완료 기록으로 전환했다. Windows 설치 결과와 자연 발생 한도 관찰 방법을 보존한다.
macOS의 현재 설치본과 실제 한도 후 재개는 미확인 잔여 사항이며, 이번 완료 처리가
모든 PC의 설치나 실제 한도 인수까지 통과했다는 뜻은 아니다.

## Goal

Core 구현 완료 근거와 확인된 설치 결과, 미확인 범위를 구분해 기록한다.

## Current State

- #308의 병합 commit `21439d6`은 2026-11-11 확인한 `origin/dev` `b64643f`와 `origin/main` `1eddbc2`에 포함돼 있다. main 승격을 새 미완료 항목으로 두지 않는다.
- 원래 PR의 plugin 0.6.6은 후속 macOS 통합에서 0.6.11로 올라갔다.
- [macOS 인수 보고서](../../test-reports/completed/2026-11-10-codex-macos-native-acceptance.md)의 마지막 설치 관측은 검증한 0.6.10 유지다. 0.6.11의 회귀 통과를 그 설치본 갱신으로 간주하지 않는다.
- Windows의 현재 설치본과 이후 변경은 이번 문서 정리에서 직접 조회하지 않았다.
- 2026-11-11 이후 갱신: 소유자의 Windows PC(로컬 marketplace `harness@stagekeeper-windows`)는 main `1eddbc2`의 0.6.11로 갱신됐다. 결과는 Verification Results에 있다. macOS 설치본은 여전히 위의 0.6.10 관측뿐이다.
- 2026-11-12 재확인: #308의 병합 commit `21439d6`은 최신 `origin/dev` `df27c78`과 `origin/main` `1bbc940`에도 포함돼 있다. 검토한 core·runtime·CLI·웹·smoke 구현은 두 원격 ref와 현재 검토 코드가 같다. 저장소의 두 plugin manifest는 0.6.14이며, 이를 각 PC의 설치 버전으로 간주하지 않는다.

## Scope

완료 범위는 Core 구현 재확인, 기존 Windows 설치 결과와 관찰 안내의 기록이다.
macOS 설치 확인·갱신과 실제 한도 관찰은 잔여 사항으로 보존한다. Codex 사용 한도 대응,
대화형 watch와 `CLAUDE_CODE_RETRY_WATCHDOG`는 원래 제외 범위다.

## Proposal

| 후속 | 최종 기록 | 완료 판단과 잔여 사항 |
| --- | --- | --- |
| LIMIT-F01 | Windows 완료(2026-11-11, 0.6.11). macOS 미확인 | Windows의 inventory·helper·상태 조회와 기능 포함 증거를 보존한다. macOS는 완료로 판정하지 않고 별도 설치 작업에서 확인할 잔여 사항으로 남긴다. 갱신이 필요하면 원래 설치 승인 범위에서 후보 hash·전체 inventory·helper 상태·사용자 수정 보존을 확인한다 |
| LIMIT-F02 | 관찰 방법 기록 완료. 실제 한도 관찰 대기, informational | 다음 실제 한도에서 알림·`limitedUntil`·새 실행 없는 heartbeat·해제 후 재개를 관찰한다. 실제 한도 미발생은 문서 완료를 막지 않는다 |

## Affected Files

완료 처리에서는 이 문서의 metadata·수행 기록과 이동에 따른 참조만 변경했다.
제품 코드는 변경하지 않았다. 이후 설치 기록은 이 문서 또는 연결된 인수 보고서에 남긴다.
동작 기준은 완료 제안서, 현재 `plugin/runtime/background.mjs`, CLI·웹 배너와 protocol이다.

## Safety Analysis

소유자 작업이 진행 중인 runner를 임의로 중단하거나 설치 cache를 바꾸지 않는다.
계정 한도를 소진하려고 모델을 호출하지 않으며 사용자 인증을 복사하지 않는다.

## Approval

완료 처리의 승인 범위는 front matter를 따른다. 문서 정리 요청은 원래 별도로 남긴 PC 설치 승인을 대신하지 않는다.
설치가 이미 승인·수행된 기록이 있으면 그 범위와 결과를 사용한다.

## Execution Plan

1. Core 구현을 완료 제안서·현재 코드·회귀 테스트·병합 이력과 대조했다.
2. LIMIT-F01의 Windows 설치 결과를 확인하고 macOS 설치 미확인을 보존했다.
3. LIMIT-F02의 관찰 방법을 유지하고 문서를 완료 기록으로 이동했다.

## Verification Plan

Core 구현 확인은 공용 형식·loop·CLI·웹·smoke 회귀와 배포 사본 일치 검사로 수행했다.
이후 개별 PC 설치 확인에서는 inventory·manifest 버전·bundled helper와 `--status`를 확인한다.
한도 발생 시에는 기존 상태·로그·웹 배너로 대기와 재개를 관찰한다. 실제 한도 발생을
재현하기 위해 사용량을 늘리지 않는다. 원래 공용 형식·loop·CLI·웹·smoke 회귀는 완료 기록을 따른다.

## Verification Results

2026-11-11 문서 정리에서는 소스·병합 이력·기존 CI와 설치 보고서만 확인했다.
그 정리 작업에서 설치·runner 실행·모델 호출은 수행하지 않았다.

2026-11-12 Core 재확인은 검토 checkout `eabd138`에서 수행했다. 검토 대상 구현이
최신 `origin/dev` `df27c78`·`origin/main` `1bbc940`과 같음을 대조했다.

| 확인 | 결과 |
| --- | --- |
| 공용 형식·runner loop·pipeline-smoke | `node --test packages/core/execution/runner.test.mjs plugin/bin/harness-background-loop.test.mjs scripts/rehearsals/pipeline-smoke-steps.test.mjs`: 55개 통과 |
| 웹 데이터·배너 모델·렌더 | `node --import tsx --test src/fsd/widgets/turn-banner/api/turn-data.test.ts src/fsd/widgets/turn-banner/model/runner.test.ts src/fsd/widgets/turn-banner/ui/turn-banner.test.ts`: 30개 통과 |
| CLI 통합 | `node --test --test-name-pattern="waits on Claude's usage limit" plugin/bin/harness-background.test.mjs`: 1개 통과. localhost 포트가 샌드박스에서 EPERM으로 차단돼 승인된 샌드박스 밖 실행으로 확인했다. 가짜 Claude와 격리 시험 서버만 사용했다 |
| 배포 사본 | `node scripts/plugin-lib.mjs --check`: 일치 |
| 병합·CI | [#308](https://github.com/Sangeok/stagekeeper/pull/308) 병합과 최종 head `34acf054`의 check·client-init-smoke·Windows·macOS workflow success를 다시 확인했다 |

전체 build·전체 회귀·실제 모델 호출·설치 갱신은 이 재확인에서 수행하지 않았다.

Windows, LIMIT-F01 (2026-11-11). 설치는 소유자가 승격 뒤 따로 승인했다("진행해"). 모델 호출과 runner 실행은 없었다.

| 확인 | 결과 |
| --- | --- |
| 갱신 전 설치본 | `harness@stagekeeper-windows` 0.6.5(user 범위). 한도 대기가 없는 판이다 |
| 실행 중인 사용처 | 번들을 쓰는 프로세스, 예약 작업, Run 키가 없음을 확인한 뒤 바꿨다 |
| 후보 | main `1eddbc2`의 깨끗한 detached worktree에서 `scripts/windows/package-windows-plugin.mjs`로 묶었다. 2,252개 파일, packageSha256 `f06b77e0…`. 0.6.5 이후 runtime·포장 스크립트·verifier 변경이 없어 설치된 runtime(`0148976b…`)을 재사용했다(verifier `de1120a5…`, 7파일) |
| inventory | 0.6.5 대비 추가 13·변경 27·삭제 0. `git diff 4b06779 1eddbc2 -- plugin`의 배포 대상 40개와 정확히 같다 |
| 설치 | 이전 묶음은 로컬 백업으로 보존했다. `claude plugin marketplace update stagekeeper-windows`와 `claude plugin update harness@stagekeeper-windows --scope user`로 0.6.5 → 0.6.11. 같은 marketplace의 local 범위 설치(옛 smoke 저장소) 하나도 0.5.33 → 0.6.11로 올라갔다 |
| 설치 cache | 2,252/2,252 sha256 일치. inventory 밖 파일은 `windows-package.json`뿐이다 |
| bundled helper | 설치된 `harness.ps1 session`이 runtime 검증을 통과하고 `session-refused` JSON으로 답했다. `background --status`(읽기 전용, 멈춘 harness-smoke runner)의 결과에 `limitedUntil` 키가 있고 값은 `null`이다 |
| 기능 포함 | 설치 cache의 `runtime/background.mjs`에 한도 판정과 대기, `bin/harness-background.mjs`에 `--status`의 `limitedUntil`이 들어 있다 |

LIMIT-F02의 실제 관찰은 대기 상태다. 다음에 이 PC의 runner가 실제 한도에 걸리면 다음 순서로 본다.

1. Windows 알림 "Runner waiting for Claude"가 한 번 뜨는지
2. `--status`의 `limitedUntil`과 웹 배너 줄
3. `background.log`에 그 시각 전까지 새 run이 없는지
4. 해제 뒤 첫 run이 이어지는지

## Risks and Rollback

서버 코드의 main 포함과 로컬 bundle 갱신은 별개다. 설치 문제는 고정한 이전 검증 bundle과
기존 설치·복구 절차로 처리하며 진행 중인 local session이나 사용자의 변경을 버리지 않는다.
macOS 설치 미확인과 자연 발생 한도의 실제 대기·재개 미관찰은 이 완료 기록의 한계로 남는다.

## Completion or Closure Notes

- 소유자의 요청에 따라 Core 구현 완료 재확인과 기존 설치·관찰 기록 정리를 기준으로 완료 처리했다.
- LIMIT-F01의 Windows 설치 증거와 LIMIT-F02의 관찰 안내는 기록돼 있다. macOS 설치는 미확인 상태를 유지하며, 별도 설치 작업에서 확인한다.
- 실제 한도 관찰은 informational이다. 한도 미발생 때문에 Core 구현 완료를 되돌리지 않는다.
- 완료일은 문서 정리 날짜다. 새 설치·배포·실제 모델 실행을 뜻하지 않는다.
