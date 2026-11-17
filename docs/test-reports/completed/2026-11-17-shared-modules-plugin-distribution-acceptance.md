---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static", "contract", "integration", "end-to-end"]
test-tools: ["GitHub Actions", "node:test", "native Codex CLI", "PostgreSQL", "Claude Code CLI"]
created-at: "2026-11-17"
completed-at: "2026-11-17"
last-executed-at: "2026-11-17T08:51:18Z"
tested-revision: "4c5ccd6d616495c644d7a26be7afc4bbceaff030"
owners: ["user:Sangeok"]
related:
  - "docs/proposals/completed/2026-11-17-shared-modules-and-plugin-distribution-phase-accept.md"
  - "docs/proposals/completed/2026-11-17-shared-modules-and-plugin-distribution.md"
  - "docs/architecture/shared-modules.md"
  - "docs/architecture/verification.md"
  - "https://github.com/Sangeok/stagekeeper/pull/363"
primary-area: "plugin/distribution"
observed-environments:
  - "GitHub Actions | Codex bundle | Windows Server 10.0.20348 x64, Codex 0.167.1 | isolated fixture"
  - "GitHub Actions | Codex bundle | macOS 15.8.2 arm64, Codex 0.167.1 | isolated fixture"
  - "GitHub Actions | Codex bundle | macOS 15.7.9 x64, Codex 0.167.1 | isolated fixture"
  - "GitHub Actions | Claude source | Windows x64 and macOS arm64, Claude 2.1.326 | isolated fixture"
test-summary: "pass: GitHub CI 공유 배포 인수 — 3개 native 대상의 설치·서버 교체·pin·pending·정리와 Claude source 4개 leg 통과, 모델 호출 0"
follow-up: []
---

# 공유 모듈 배포 — GitHub CI 인수

## Summary and Decision

사용자의 GitHub CI-only 지시에 따라 개인 로그인이나 전용 PC 없이 인수했다.
[공유 배포 CI](https://github.com/Sangeok/stagekeeper/actions/runs/44048937201)의 Windows x64,
macOS arm64·x64 세 job과 각 summary가 모두 성공했다. 필수 T1–T8이 PASS이므로
이 보고서에 명시한 **모델 없는 배포 인수**의 결과는 pass다.

실제 Codex loader가 선택한 cache에서 구버전·업데이트·빈 cache 설치를 실행했다.
같은 DB와 origin에서 S0를 종료하고 S를 시작한 뒤 P0를 재init하지 않고 receipt·instruction·pin을
재확인했다. 이 결과는 private 모델 로그인·모델 역할 수행·개인 PC 지원 인증이나 운영 승격의 결과가 아니다.
기존 모델 기반 출시 gate는 출시 작업에서 별도로 판단한다.

## Scope and Criteria

| 기준 ID | 근거 | 범위 | 성공 기준 |
| --- | --- | --- | --- |
| R1 | REQ-SMB-002/003, TASK-ACCEPT-02 | 실제 산출물 | closure·native runtime·verifier·hash·macOS mode와 실제 선택 cache 일치 |
| R2 | REQ-SMB-004/005, TASK-ACCEPT-03 | 독립 갱신 | 이전 P0를 유지한 S0→S 교체에서 receipt/pin 보존, 불일치 요청의 업무 전진 거부 |
| R3 | REQ-SMB-004/005, TASK-ACCEPT-01 | private 입력 | 고정 T의 이전/후보 content·contract·surface·body hash 일치와 외부 경로 검사 |
| R4 | CON-SMB-002/003, 사용자 CI-only 지시 | 실행·증거 | 실제 OS, 개인 인증 없음, 모델 호출 0, 소유 session/server/DB/fixture 정리 |

이전 native package는 고정 source로 **재생성한 fixture**다. 원래 배포 archive라고 주장하지 않는다.
Claude는 기존 source 채널의 설치 증거이며 Codex bundle 인수와 구분한다.
private T의 완전한 언어 집합은 `en` 하나다. 다른 언어의 성공을 추정하지 않는다.

## Test Target

- 인수 source S/P: `4c5ccd6d616495c644d7a26be7afc4bbceaff030`, plugin 0.6.16.
- 이전 S0/P0: `85c66fb1d9e02c3d9416710240cbfca3f0023939`, plugin 0.6.15.
- T: `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215`, 13개 template row, `en`.
- Codex: 공식 0.167.1 archive의 플랫폼별 크기·SHA-256을 고정하고 download 후 재검증했다.
- native helper runtime: 검증된 Node 22.23.3 기반 번들. 인수 controller의 runner Node는
  Windows/arm64 22.23.4, macOS x64 22.23.2다. 소비자 PATH에는 global Node가 없다.
- 모든 candidate/previous/T checkout의 HEAD와 clean 상태를 검사했다. S0/S schema·migration과
  native 제작 recipe가 같음을 확인한 후 같은 DB를 재사용했다.
- MIGRATE `f430e26` 이후 제품·출하 코드 차이는 없다. 후속 `harness-watch.test.mjs`의
  시험 deadline 수정은 제품 코드와 구분한다.

## Preconditions and Test Data

GitHub-hosted runner에서 기존 native 제작기와 검증된 Windows cache를 재사용했다.
fork/비신뢰 head 또는 template token 부재 시 단계는 BLOCKED이며 다른 검사의 green으로 대체하지 않는다.

새 전용 test DB를 생성하고 S0 source에서 T를 한 번 seed/bootstrap했다. S0/P0 → S/P0 → S/P
사이에 DB·origin·token을 유지했다. 새 설치는 별도 빈 Codex profile/cache와 별도 fixture repo다.
`agent_next`로 실제 receipt/pin을 얻었지만 모델 turn을 실행하지 않았다.

CLI add/list에서 선택 경로·version·enabled 상태를 확인하고 완성 bundle과 bytes/mode를 비교했다.
모든 private 명령 원문·본문은 runner Temp에만 두고 summary만 업로드했다.
새 profile에는 시작과 종료 시 `auth.json`이 없음을 확인했다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오 | 실제 관찰·Evidence | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1, R4 | `required` | Windows x64 실물 bundle 신규/update | 2245개 payload 파일, lib 15개, 실제 선택 cache·native helper 일치 — E1 | `PASS` |
| T2 | R1, R4 | `required` | macOS arm64 실물 bundle 신규/update | 2065개 payload 파일, lib 15개, bytes·mode·선택 cache 일치 — E2 | `PASS` |
| T3 | R1, R4 | `required` | macOS x64 실물 bundle 신규/update | 2065개 payload 파일, lib 15개, 해당 OS에서 직접 실행 — E3 | `PASS` |
| T4 | R2 | `required` | P0 무재init S0→S 교체와 이후 P update | 동일 receipt·instruction·release metadata·AgentRun/step 상태; bad surface 거부 후 pin/원장 불변 — E1–E3 | `PASS` |
| T5 | R2 | `required` | 수정 파일 update·pending prepare 거부·복구 | 수정 bytes/이전 lock hash 보존, pending에서 prepare 거부, 시험 수정만 복구 후 ready — E1–E3 | `PASS` |
| T6 | R3 | `required` | private corpus와 이전/후보 결과 비교 | 1언어 × 3plan × 2client의 6입력·13row hash 일치, 옛 lib 참조 0; 설치·그래프 corpus 두 검사 실제 실행 — E1–E3 | `PASS` |
| T7 | R4 | `required` | 설치본 session start/check/stop/release, background status·정리 | 두 fixture의 세션 소유/해제, background 미실행, server/user/repo/profile/DB 정리와 PostgreSQL 종료 성공 — E1–E3 | `PASS` |
| T8 | R2 | `required` | Claude source 신규/update | Windows/macOS × 신규/update 4개 leg, 실제 연결·재init·project sync 성공 — E4 | `PASS` |

## Commands and Outcomes

| ID | Gate | 명령·실행 | 관찰 | 판정 |
| --- | --- | --- | --- | --- |
| C1 | `required` | `shared-distribution-acceptance` run 44048937201, attempt 1 | 3/3 job 성공, 각 7개 named check와 cleanup PASS | `PASS` |
| C2 | `required` | `check` run 44048937150, source 4c5ccd6 | 8/8 job 성공: 경계·lint·type·architecture/script 시험·제품·웹·서버·DB 통합·build·양 OS task 관리 | `PASS` |
| C3 | `required` | `client-init-smoke` run 44044069195, source 909a83d | 4/4 Claude leg PASS, templates T와 이전 P0 동일 | `PASS` |
| C4 | `informational` | 로컬 순수 계약·문법·docs·CI coverage | 계약 15개 PASS, coverage 14 jobs/15 rows. 최종 문서 검사 exit 0 | `PASS` |
| C5 | `informational` | 로컬 전체 architecture 실행 시도 | 의존성 미설치와 sandbox listen 제한으로 완료 불가. 같은 suite는 C2에서 검증 | `BLOCKED` |

C3의 source를 최신 SHA로 바꿔 기록하지 않았다. `909a83d..4c5ccd6` 사이의 `src`,
`packages`, `plugin`, `prisma`, package/lock 파일 diff가 없음을 확인해 동일 제품 bytes의
Claude source 증거로 재사용했다. 그 뒤 통합한 dev 문서와 결과 보고서도 제품을 변경하지 않는다.

## Evidence Registry

| ID | 실행·보존된 요약 | summary 파일 SHA-256 |
| --- | --- | --- |
| E1 | [Windows job](https://github.com/Sangeok/stagekeeper/actions/runs/44048937201/job/133921852112), [windows-x64.json](../assets/2026-11-17-shared-modules-plugin-distribution-acceptance/windows-x64.json) | `e60c7d438644b6d2d6f36872fb5ad0aa9f00ad8ff4f61149d9ce680bf83b8619` |
| E2 | [macOS arm64 job](https://github.com/Sangeok/stagekeeper/actions/runs/44048937201/job/133921851764), [macos-arm64.json](../assets/2026-11-17-shared-modules-plugin-distribution-acceptance/macos-arm64.json) | `780b862f911a7385e348ff6a2a4b040947d8894901c6e45ccb5eb76c562ee09b` |
| E3 | [macOS x64 job](https://github.com/Sangeok/stagekeeper/actions/runs/44048937201/job/133921852674), [macos-x64.json](../assets/2026-11-17-shared-modules-plugin-distribution-acceptance/macos-x64.json) | `6d457f539229ca0a0d1869ba61feec6543ecbd85cc764d275e57a01610d11ded` |
| E4 | [Claude 4-leg run](https://github.com/Sangeok/stagekeeper/actions/runs/44044069195), [정제한 4개 job summary](../assets/2026-11-17-shared-modules-plugin-distribution-acceptance/claude-source.json) | run/job와 원래 source를 파일에 보존 |
| E5 | [공통 check](https://github.com/Sangeok/stagekeeper/actions/runs/44048937150) | 완료된 job/명령 결과 |
| E6 | [공식 Codex 0.167.1](https://github.com/openai/codex/releases/tag/rust-v0.167.1) | platform별 archive 크기·SHA는 E1–E3의 cliArchive |

GitHub artifact는 2026-12-01 만료 예정이며 정제된 summary를 위 파일에 영구 보존했다.
각 파일에는 package/runtime/verifier digest와 lib 전수 목록이 있다. 위 SHA는 **원문 summary
파일 bytes의 보관 해시**이며 DCP schema 2의 `evidenceDigest`라고 부르지 않는다.
이 모델 없는 campaign은 별도 `stagekeeper-shared-distribution-acceptance-v1` 형식이다.

## Findings and Follow-up

- 첫 source `909a83d`는 고정 R1 corpus에 최신 R2 verifier 명칭 문구를 요구하는 검사로 실패했다.
  호환성에 필요한 corpus 설치·그래프 두 검사로 명시적으로 좁혔으며 실제 2개 PASS도 assert한다.
  최신 문구 검사는 해당 release용 기존 시험에 유지했다.
- 기존 회귀에 인수를 덧붙인 macOS Intel job은 30분 제한에 걸렸다. 인수를 독립 matrix로
  분리했고 최종 Intel job은 성공했다. 기존 회귀 workflow의 변경은 되돌렸다.
- Windows에서 macOS launcher 선택을 모의 시험할 때 host 구분자를 사용하던 검증 도구 오류를
  수정했다. 명시한 platform의 path 함수를 사용하며 최종 Windows 계약·실물 인수가 통과했다.
- 최초 실패 run 44043168300/44043168411과 중간 실패·취소는 최종 성공으로 덮어쓰지 않는다.
  제품 코드 수정은 없었다.
- 전체 모델 역할·watch/background의 모델 기반 장시간 실행·운영 template activation·main 승격은
  이 변경 인수의 범위가 아니다. 기존 출시 gate 및 별도 후속 문서에서 계속 소유한다.

## Cleanup and Residual State

세 native summary 모두 server/fixture/client/database가 pass, errors가 빈 배열이다.
session을 stop/release하고 server child 종료를 확인한 뒤 fixture user와 repo/profile을 제거했다.
정확한 전용 test DB를 FORCE 없이 삭제했으며 workflow의 PostgreSQL stop step도 성공했다.
종료 확인 실패라면 DB 강제 삭제나 성공 판정을 하지 않도록 구성했다.

private 원문·배포 bundle·다운로드·이전 source는 disposable runner Temp에만 남겼다가 runner
폐기 시 제거된다. 개인 환경·운영 DB는 변경하지 않았다. 로컬에는 소스 준비용 clone/download와
정제된 CI 증거가 별도 임시 작업 디렉터리에 있으며 로컬 native 설치·DB·모델 인수는 실행하지 않았다.

## Completion

필수 T1–T8 및 C1–C3가 PASS다. 저장소 경계 변경의 모델 없는 CI 인수는 완료했다.
PR 병합과 운영 승격의 상태는 이 테스트 판정과 별도로 관리한다.

2026-11-17 후속 종료 시 최종 head `d5c6714`의
[check 941](https://github.com/Sangeok/stagekeeper/actions/runs/44051075589)와
[공유 배포 인수 4](https://github.com/Sangeok/stagekeeper/actions/runs/44051075608)가 모두 성공했음을
확인하고 PR #363을 `99378292893a2f0dd75aa5473ef5f92d406f57fe`로 dev에 병합했다.
완료된 상위 SDD와 ACCEPT의 링크를 갱신했으며 이 보고서의 원래 시험 identity와 summary는
변경하지 않았다. 운영 승격은 실행하지 않았다.
