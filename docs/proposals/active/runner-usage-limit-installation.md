---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-11-11"
updated-at: "2026-11-11"
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
  - "docs/proposals/completed/2026-11-11-runner-usage-limit.md"
  - "docs/test-reports/completed/2026-11-10-codex-macos-native-acceptance.md"
  - "docs/architecture/protocol.md"
---

# Claude 사용 한도 대기 — 설치 적용 후속

## Summary

한도 대기 기능의 [코드 구현과 CI](../completed/2026-11-11-runner-usage-limit.md)는 완료됐다.
이 문서는 원래 별도 승인으로 남긴 개별 PC의 설치 적용과 이후 관찰을 추적한다.
구현을 다시 수행하거나 실제 한도를 일부러 소진하는 작업은 하지 않는다.

## Goal

사용 중인 설치본에 기능이 포함됐는지 확인하고 설치 적용의 결과와 한계를 기록한다.

## Current State

- #308의 병합 commit `21439d6`은 2026-11-11 확인한 `origin/dev` `b64643f`와 `origin/main` `1eddbc2`에 포함돼 있다. main 승격을 새 미완료 항목으로 두지 않는다.
- 원래 PR의 plugin 0.6.6은 후속 macOS 통합에서 0.6.11로 올라갔다.
- [macOS 인수 보고서](../../test-reports/completed/2026-11-10-codex-macos-native-acceptance.md)의 마지막 설치 관측은 검증한 0.6.10 유지다. 0.6.11의 회귀 통과를 그 설치본 갱신으로 간주하지 않는다.
- Windows의 현재 설치본과 이후 변경은 이번 문서 정리에서 직접 조회하지 않았다.

## Scope

설치 대상 확인·승인된 갱신·상태 조회와 기록만 포함한다. Codex 사용 한도 대응,
대화형 watch와 `CLAUDE_CODE_RETRY_WATCHDOG`는 원래 제외 범위다.

## Proposal

| 후속 | 상태 | 종료 조건 |
| --- | --- | --- |
| LIMIT-F01 | 설치 대상·현재 package 미확정 | 대상 PC별 현재 bundle/source와 기능 포함 여부를 확인한다. 이미 적용됐다면 근거만 남기고 재설치하지 않는다. 갱신이 필요하면 원래 설치 승인 범위에서 후보 hash·전체 inventory·helper 상태·사용자 수정 보존을 확인한다 |
| LIMIT-F02 | 자연 발생 한도 관찰 대기, informational | 다음 실제 한도에서 알림·`limitedUntil`·새 실행 없는 heartbeat·해제 후 재개를 관찰한다. 한도 미발생은 설치 완료를 막지 않으며 원래 구현 시험과 관찰 안내를 남길 수 있다 |

## Affected Files

제품 코드는 변경하지 않는다. 설치 후 기록은 이 문서 또는 연결된 인수 보고서에 남긴다.
동작 기준은 완료 제안서, 현재 `plugin/runtime/background.mjs`, CLI·웹 배너와 protocol이다.

## Safety Analysis

소유자 작업이 진행 중인 runner를 임의로 중단하거나 설치 cache를 바꾸지 않는다.
계정 한도를 소진하려고 모델을 호출하지 않으며 사용자 인증을 복사하지 않는다.

## Approval

이번 문서 정리 요청은 원래 별도로 남긴 PC 설치 승인을 대신하지 않는다.
설치가 이미 승인·수행된 기록이 있으면 그 범위와 결과를 사용한다.

## Execution Plan

1. LIMIT-F01의 대상·현재 설치·기능 포함 여부를 확인한다.
2. 필요한 갱신만 원래 승인 범위에서 수행하고 설치 결과를 기록한다.
3. LIMIT-F02의 다음 자연 발생 관찰 방법을 남기고 설치 후속을 완료한다.

## Verification Plan

설치 inventory·manifest 버전·bundled helper와 `--status`를 확인한다.
한도 발생 시에는 기존 상태·로그·웹 배너로 대기와 재개를 관찰한다. 실제 한도 발생을
재현하기 위해 사용량을 늘리지 않는다. 원래 공용 형식·loop·CLI·웹·smoke 회귀는 완료 기록을 따른다.

## Verification Results

이번에는 소스·병합 이력·기존 CI와 설치 보고서만 확인했다. 설치·runner 실행·모델 호출은 수행하지 않았다.

## Risks and Rollback

서버 코드의 main 포함과 로컬 bundle 갱신은 별개다. 설치 문제는 고정한 이전 검증 bundle과
기존 설치·복구 절차로 처리하며 진행 중인 local session이나 사용자의 변경을 버리지 않는다.

## Completion or Closure Notes

LIMIT-F01을 완료하고 LIMIT-F02의 관찰 방법을 남기면 완료 처리한다.
실제 한도가 아직 발생하지 않았다는 이유로 코드 구현이나 설치를 미완료로 되돌리지 않는다.
