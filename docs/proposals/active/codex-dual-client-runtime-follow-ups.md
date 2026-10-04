---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-10-04"
approved-by: "requesting-user"
approved-at: "2026-10-04"
approval-scope: "사용자의 '니가 권고한대로 진행해' 지시에 따라 기본 Codex의 실제 실행·재개·중지 인수를 먼저 확인하고 C4 자동 watch를 구현한 뒤 장시간 대기·취소·중복 실행을 검증한다. 로컬 disposable/test 환경과 기존 사용자 CLI 인증으로 bounded 모델 시험·격리 DB/브라우저 인수를 수행한다. 운영 DB seed·서비스 배포·패키지 공개는 별도 실행 범위다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-10-04-codex-dual-client-support.md"
  - "docs/test-reports/active/dual-client-runtime-report.md"
  - "docs/test-reports/completed/2026-10-04-codex-dual-client-ui.md"
  - "docs/architecture/README.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/verification.md"
---

# Codex dual-client 실행·배포 인수와 조건부 자동 watch 후속 작업

## Summary

2026-10-04 사용자는 기본 dual-client 제안서를 코드 구현 기준으로 완료 처리하도록 지시했다.
[완료 기록](../completed/2026-10-04-codex-dual-client-support.md)의 실제 모델/CLI·설치·private 배포/복구·혼합 호스트 인수와 미구현 C4를 이 문서로 이관한다.
이관은 인수 통과나 새 실행·배포 승인을 뜻하지 않는다. 현재 실행 판정은 [active runtime 보고서](../../test-reports/active/dual-client-runtime-report.md)에 보존한다.

## Goal

기본 지원의 소스 구현 완료와 실제 실행·배포 완료를 각각 추적하고, 미구현 Codex 자동 watch의 요구사항을 보존한다.

## Proposal Size

`standard`: 실제 권한·owner credential·실행 소유권·private DB 배포/복구 및 장시간 watch 시험을 다룬다.

## Current State

- C1–C3 public 소스는 PR #104, 후속 UI는 PR #106으로 dev 통합됐다. 기존 격리 DB 계약 6개와 UI 브라우저 시험은 PASS다.
- T53–T56의 기존 NOT RUN 행은 당시 기록으로 유지한다. 2026-10-04 현재 제품 어댑터를 실제 모델로 시험해 MCP 승인 설정 결함을 수정했다. 이후 MCP 호출은 실행됐지만 허용 읽기/scratch 쓰기는 Windows sandbox의 root-read 요구로 BLOCKED다. 전체 역할 격리·verifier 인수는 미완료다.
- `plugin/templates` 별도 private 저장소에는 수정 7개와 신규 `en/CODEX.runbook.md`가 미커밋 상태다. 운영 seed·배포는 수행하지 않았다.
- 실제 PM 모델의 pending MCP 요청에서 stop → interrupt → interrupted → bridge/child 종료 → release를 확인했다. 종료 전 release와 동시 Claude session 시작은 거부됐다. fixture MCP를 사용했으므로 실제 두 CLI/browser 승인 재개나 혼합 버전 호스트 인수의 완료 근거가 아니다.
- 후속 진행 지시로 WSL2 Ubuntu 26.04.1과 별도 Linux 사용자/checkout을 준비했다. 동일한 CLI 0.160.0과 `:root="deny"` 정책으로 모델 없는 실제 파일 명령을 시험했다. 허용 읽기와 scratch 쓰기는 성공했고 저장소 밖 읽기·저장소/Git 메타데이터 쓰기는 차단됐다. 이 결과는 파일 명령 호스트의 제한된 통과이며 실제 모델/전체 verifier 인수의 완료가 아니다. Linux CLI는 Windows 인증 파일 복사 없이 별도로 로그인해야 한다.
- C4 자동 watch 어댑터·명령·skill은 미구현이다. Linux 모델 없는 파일 시험은 통과했지만 실제 역할·완전한 독립 verifier·승인 재개 인수는 남아 있으므로 C4 구현·110분 idle 시험을 시작하지 않았다. 승인 범위를 유지하고 남은 기본 인수를 먼저 실행한다.

## Scope

기존 제안서의 BLK-DUAL-01/02/03/05와 실제 E1–E11 미실행 인수, private 소스 전달·seed/복구·패키지 출시를 추적한다.
C4의 REQ-DUAL-018/019 watch 부분, BLK-DUAL-04, TASK-C4-01/02, E12와 E10의 watch 안내 부분도 명시적으로 이관한다.
기본 소스 구현을 다시 수행하거나 기존 로컬 PASS를 새 실행 결과로 승격하지 않는다. C4 실행은 기본 지원 인수와 별도 범위다.

## Proposal

| 이관 항목 | 남은 작업 | 완료 증거 |
| --- | --- | --- |
| BLK-DUAL-01, T53 | 현재 fresh App Server 어댑터의 실제 역할·모델·권한·독립 문맥 확인 | 허용 읽기/scratch 성공, 금지 쓰기·owner/nested 도구 차단, 완전한 verifier와 fresh-context canary |
| BLK-DUAL-02/03, T54 | 실제 두 CLI와 브라우저에서 양방향 승인·재개 | 동일 BoardItem/PipelineRun/open AgentRun, 승인 commit·receipt·usage 보존; DB-only PASS와 별도 기록 |
| BLK-DUAL-02/03, T55 | private 소스 커밋/전달, 승인된 seed/복구와 실제 패키지 설치 | winning body/helper revision·hash, 양쪽 client 렌더·실행, atomic seed와 제한 복구의 직접 관찰 |
| BLK-DUAL-05, T56 | 혼합 버전 host의 중지·종료 확인·소유권 이전 | pending role/tool 종료 전 잠금 보존, 종료 후 자신의 release, successor 보호 |
| BLK-DUAL-04, TASK-C4-01/02, E12 | 조건부 watch 구현·장시간/취소 인수 후 안내 | 아래 C4 요구사항 및 검증 기준 충족 |

### 이관한 C4 요구사항과 blocker

**REQ-DUAL-018 watch 부분:** 진행 가능한 작업 발견 시 검증된 native 완료 신호 또는 로컬 runner로 실행을 재개한다. 기능 검증 전에는 명시적 재개만 안내한다.

**REQ-DUAL-019 watch/실제 취소 부분:** stop 또는 ownership 상실 후 새 dispatch·결과 제출·watch 재설정을 중단한다. 늦은 이벤트로 재진입하지 않는다. stopping 중 잠금을 유지하고 실제 자식 종료 확인 뒤 release한다.

**BLK-DUAL-04:** Codex의 파일 도구 권한, watch 대상 thread/turn 재진입·취소 및 장시간 idle에 필요한 증거가 아직 부족하다. C4와 자동 watch 안내를 차단하며 기본 명시적 재개 소스의 완료를 취소하지 않는다.

2026-10-04 최초 실행: fresh thread와 pending MCP turn 취소는 직접 관찰했지만 Windows 파일 도구 실행은 차단됐다. 설치된 CLI 0.160.0의 Windows backend는 `:root` 읽기를 요구하고 현재 역할 정책은 `:root="deny"`다. [동일 버전 공식 소스](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/windows-sandbox-rs/src/resolved_permissions.rs)의 `validate_elevated_filesystem_policy`와 실제 오류가 일치한다. 당시 로컬 WSL 배포판·Docker/Podman은 없었다. 전체 디스크 읽기 허용이나 Windows 전역 설정 변경으로 대체하지 않았다.

2026-10-04 후속 실행: 사용자의 진행 지시 후 [공식 WSL 안내](https://learn.chatgpt.com/docs/windows/wsl)에 따라 WSL2 Ubuntu와 Linux 파일시스템의 별도 checkout을 준비했다. 사용자 홈에 설치된 CLI 실행 파일은 sandbox의 최소 시스템 경로 밖이라 bubblewrap에서 실행되지 않았다. 같은 hash의 CLI와 리소스를 새 Linux 배포판의 `/usr/local/lib`에 root 소유로 설치하고 `/usr/local/bin`에서 실행하자 허용 읽기/scratch와 금지 경로 시험이 통과했다. 역할 정책·커널/AppArmor 설정은 완화하지 않았다. Windows 자격 증명은 복사하지 않고 [native device 로그인](https://learn.chatgpt.com/docs/auth)을 요청했다. 실제 모델·완전한 verifier·승인 재개가 통과해야 C4 구현 순서로 넘어간다.

**TASK-C4-01:** 실제 호스트 기능을 먼저 확인하고 Codex client/hash/echo poll transport, target thread/turn/session 고정, 동일 watch session/정책 main-loop reuse, no-model idle, permission relay, active-turn 중복 방지, interrupt와 reader/timer/listener cleanup을 구현한다. 임의 앱 대화 재진입 가정·권한 우회·자동 승인·모델 idle polling은 중단 조건이다.

**TASK-C4-02 / E12:** 실제 thread/turn/session에서 110분 no-model idle, 작업 발견·재진입·gate 대기/승인·handoff·auth/cap/permission·stop/interrupt·늦은 이벤트·ownership 상실 후 rearm 없음과 Claude watch 회귀를 시험한다. latency·poll/model 호출 수·종료 이유를 기록한다. pending stop은 실제 종료 확인 전 잠금과 ownership을 유지해야 하며 확인 실패 시 잠금을 보존한다. E10의 watch 안내는 관찰한 호스트·버전·방식에 한정한다.

## Affected Files

| 영역 | 예정 작업 | 리스크 |
| --- | --- | --- |
| `plugin/runtime/codex-thread.mjs`, `codex-agent.mjs`, `local-session.mjs`; `plugin/bin/harness-session.mjs` | 실제 인수 및 발견된 결함 수정 | high — 권한·독립 문맥·소유권 |
| `plugin/templates` 별도 private 저장소; `scripts/seed-templates.ts`, `restore-dual-client-templates.ts` | 소스 전달·승인된 배포/복구 인수 | high — 데이터·배포 조합 |
| 실제 설치한 Claude/Codex package, 기존 dual-client UI | 양방향 end-to-end 인수 | high — 승인·원장·사용량 |
| C4 후보 `plugin/runtime/codex-session.mjs`, `plugin/bin/harness-codex-watch.mjs` 및 test, `plugin/codex/skills/harness-watch/SKILL.md` | 호스트 기능 확인 후 구현 위치 확정 | high — 재진입·취소·장시간 실행 |
| active runtime 보고서와 최종 watch 보고서 | revision·직접 관찰·정리 결과 기록 | medium — 증거 범위 과장 방지 |
| `plugin/bin/harness-session.test.mjs`, `plugin/codex/skills/harness-run/SKILL.md`, `docs/architecture/protocol.md` | 실제 실행 preflight·역할 MCP 승인 정책의 회귀와 사용 지침 | high — 허용 도구 실행과 권한 경계 |
| `scripts/rehearse-dual-client-runtime.ts` 및 test | 실제 기록 추가 중 발견한 CRLF 보고서 append 오류 수정 | medium — 기존 증거 행 보존 |

## Safety Analysis

기존 로컬 DB·UI PASS는 보존하고 실제 미실행 gate를 별도로 유지한다. 모델 시험은 경계가 정해진 disposable/test 환경에서 수행하며 credential·사용자 설정을 복사하지 않는다. 운영 seed·배포와 C4는 승인된 범위와 호스트 기능 증거를 확인한 뒤 수행한다.

## Approval

2026-10-04 사용자의 후속 진행 지시로 기본 실행 인수 → C4 구현 → 장시간·취소·중복 실행 검증 순서를 승인했다. 기존 세션에서 이미 승인된 작업은 해당 범위에 따른다. 로컬 시험과 구현을 수행하며 운영 DB seed·서비스 배포·패키지 공개는 완료 근거로 대신하지 않는다.

## Execution Plan

1. private working source의 상태·revision/hash와 현재 public 제품 소스를 고정한다.
2. T53/T54/T56의 실제 호스트·양방향 승인 재개·취소/소유권 시험을 수행하고 결과를 누적한다.
3. 승인된 환경에서 T55의 설치·private seed/복구·릴리스 인수를 수행한다.
4. 별도 범위인 C4는 호스트 기능과 실행 범위 확인 후 TASK-C4-01/02 및 E12를 수행한다.

## Verification Plan

기존 runtime 보고서의 T53–T56과 이관한 E1–E12 기준을 사용한다. report의 revision·실행 시각·직접 관찰·정리 결과를 기록하고 역사적 판정을 보존한다. `--validate-report-only` 통과는 문서 구조 검증이며 제품 PASS가 아니다. 발견된 코드 결함을 수정하면 해당 회귀와 저장소의 check·관련 test/build를 수행한다.

## Verification Results

2026-10-04 사용자 진행 지시에 따라 기본 인수를 실행했다. MCP 승인 결함을 수정하고 모델 없는 실제 sandbox 실행 preflight를 추가했다. Windows 실제 모델의 MCP 호출과 pending stop/잠금 반납을 확인했고 Windows 파일 명령은 BLOCKED였다. 후속 WSL2 모델 없는 실제 파일 시험에서는 허용 읽기/scratch, 금지된 외부 읽기·저장소/Git 쓰기 차단을 확인했다. Linux 실제 모델·전체 verifier·승인 재개는 별도 로그인 후 실행해야 한다. C4·110분 idle·양방향 승인/재개·실제 패키지·운영 배포는 미실행이다. 새 관찰·사용량·소스 hash와 기존 실패 이력은 [active runtime 보고서](../../test-reports/active/dual-client-runtime-report.md)에 함께 기록한다.

로컬 검증은 session 11개, core/plugin 287개, report 27개 PASS이며 Windows 파일 symlink 권한 시험 1개는 skip이다. `npm run check`, `verify:fsd`, `test:architecture`, `build`, 보고서 구조 검증과 `git diff --check`가 통과했다. 실제 기록 추가 중 발견한 CRLF append 오류도 수정해 기존 149개 실행/증거 행을 보존했다. [현재 소스 hash와 검증 기록](../../test-reports/assets/2026-10-04-codex-role-host-preflight/checks.json)은 제품 인수 통과를 대신하지 않는다.

PR [#109](https://github.com/Sangeok/stagekeeper/pull/109)은 `dev` 대상으로 생성됐고 소스 커밋 `21a1d6eb66cd0e57f94cff87de14b485f321a21e`의 CI `check`가 통과했다. 같은 커밋의 Linux checkout에서도 session 11개와 report 28개가 모두 PASS이며 skip은 없다. [WSL2 관찰 기록](../../test-reports/assets/2026-10-04-codex-wsl-host-preflight/observations.json)은 모델 없는 실제 파일 명령 결과, 동일 실행 파일 hash, 완전한 verifier 패키지 inventory/checksum 및 잠금 반납을 기록한다. 패키지 inventory는 verifier의 실제 실행 통과를 의미하지 않는다.

## Risks and Rollback

permission 상속, private/public 버전 차이, pending host 종료·잠금 반납 및 template 데이터 복구가 주요 위험이다. 새 Codex 안내 중단 → 실제 세션 종료 확인 → 호환 private 데이터의 제한 복구 → 서버/plugin 복원 → Claude 회귀 순서를 사용한다. 구 checkout 역seed나 잠금 파일 삭제만으로 복구를 선언하지 않는다. 상세 절차는 완료 기록의 Risks and Rollback을 따른다.

## Completion or Closure Notes

현재 완료되지 않았다. 기본 실행·배포 인수는 required 미실행 gate와 관련 blocker 해제의 직접 증거가 있어야 완료 처리한다. C4 완료는 TASK-C4-01/02, E12와 실제 watch 안내 검증을 추가로 요구하며 기본 지원 인수와 각각 판정한다.

## Review Checklist

- [x] 코드 구현 완료와 실제 실행·배포 인수를 구분했다.
- [x] private 미커밋 상태와 기존 FAIL/BLOCKED/NOT RUN을 보존했다.
- [x] C4 요구사항·blocker·Task·검증과 안내 범위를 명시적으로 이관했다.
- [ ] 실제 호스트·양방향 CLI·설치/배포·혼합 버전 인수 증거를 확보한다.
- [ ] C4 실행 시 실제 장시간·취소 시험과 안내 검증을 완료한다.
