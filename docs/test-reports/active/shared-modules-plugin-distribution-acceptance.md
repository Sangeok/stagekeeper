---
status: "active"
stage: "running"
result: null
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static", "contract", "integration", "end-to-end"]
test-tools: ["GitHub Actions", "node:test", "native Codex CLI", "PostgreSQL"]
created-at: "2026-11-17"
completed-at: null
last-executed-at: null
tested-revision: null
owners: []
related:
  - "docs/proposals/active/shared-modules-and-plugin-distribution-phase-accept.md"
  - "docs/proposals/active/shared-modules-and-plugin-distribution.md"
  - "docs/architecture/shared-modules.md"
  - "docs/architecture/verification.md"
primary-area: "plugin-distribution"
observed-environments: []
test-summary: "GitHub-hosted Windows/macOS의 모델 없는 실물 설치·서버 호환성 인수를 준비 중이다. 실제 CI 실행 전이며 PASS를 주장하지 않는다."
follow-up: []
---

# 공유 모듈 배포 — GitHub CI 인수

## Summary and Decision

사용자가 실제 작업을 요청한 뒤 GitHub CI만으로 진행하도록 실행 방식을 지정했다.
개인 로그인·개인 설치·로컬 native 인수와 모델 호출을 제외하고, GitHub-hosted
`shared-distribution-acceptance`에서 실제 번들·Codex loader·HTTP/MCP와 정리를 확인한다. private self-hosted CI의
현재 pin은 이 후보와 달라 실행하거나 개인 CI 프로필을 사용하지 않는다.

## Scope and Criteria

| 기준 ID | 근거 | 적용 범위 | 확인 기준 |
| --- | --- | --- | --- |
| R1 | REQ-SMB-002/003, TASK-ACCEPT-02 | 실제 산출물 | 명세 closure·native runtime·verifier·hash·mode와 실제 선택 cache가 일치 |
| R2 | REQ-SMB-004/005, TASK-ACCEPT-03 | 독립 갱신 | 이전 P0를 유지한 S0→S 교체에서 기존 receipt/pin과 정상/거부 동작 보존 |
| R3 | REQ-SMB-004/005, TASK-ACCEPT-01 | private 외부 입력 | 고정 T의 이전/후보 content/contract/surface/body hash와 외부 경로 검사 |
| R4 | CON-SMB-002/003, 사용자 CI-only 지시 | 실행·증거 | GitHub-hosted 실제 OS, 개인 인증 없음, 모델 호출 0, 소유 session/server/DB/fixture 정리 |

전체 실제 모델 역할·개인 PC 설치·원래 배포 archive의 재현·운영 template activation·승격은
이 CI 인수 범위가 아니다. 이전 native package는 고정 source로 **재생성한 fixture**다.
Claude source 채널은 기존 client-init-smoke의 동일 후보/입력 결과를 연결하며, 새 Codex
bundle 검증을 Claude source나 전체 모델 역할의 결과로 바꿔 기록하지 않는다.

## Test Target

- 제품·출하 bytes의 출발 기준은 MIGRATE tested head `f430e2656bef1b7cd41db3213ab02d6f8090d667`이다.
  추가 CI 코드가 들어간 실제 checkout SHA를 각 실행 summary의 sourceCommit으로 식별한다.
- 이전 source/server: `85c66fb1d9e02c3d9416710240cbfca3f0023939`, plugin 0.6.15.
- 후보 plugin version: 0.6.16. private template: `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215`.
- Codex CLI: 공식 rust-v0.167.1 archive의 플랫폼별 고정 크기와 SHA-256을 검증한다.
- 실행 예정: windows-2022 x64, macos-15 arm64, macos-15-intel x64.
- 원격 사전 조사: main/dev 존재, private CI 등록 runner 0개. private CI pin은 source `040827e…`와
  template `99245acd…`로 이 대상과 다르다. 그 성공을 이 후보의 PASS로 사용하지 않는다.
- 로컬에서는 소스·공식 archive metadata·CLI 버전 조회, 준비용 clone/download와 문법 확인만 수행했다.
  로컬 native bundle 설치·DB·모델 인수는 실행하지 않았다.

## Preconditions and Test Data

기존 native runtime 제작·회귀와 private template 읽기 권한을 재사용한다. fork/비신뢰 head 또는
template token 부재 시 shared acceptance step은 BLOCKED이며 다른 step의 green으로 대체하지 않는다.
candidate/previous checkout·schema·native recipe와 T의 HEAD/clean 상태를 확인한다.

GitHub runner의 새 전용 test DB를 한 campaign이 소유한다. 이전 source에서 한 번 seed/bootstrap하고,
S0/P0 → S/P0 → S/P 사이에는 DB·origin·token·기존 파일을 유지한다. 새 설치는 별도 빈 Codex
profile/cache와 별도 repo에서 수행한다. 실제 `agent_next`로 receipt/pin을 얻지만 LLM turn은 호출하지 않는다.

실제 CLI의 add/list 결과에서 선택된 경로·version·enabled 상태를 확인하며 candidate inventory와
bytes/mode를 비교한다. 사용자 파일 수정은 합성 fixture에만 가하고 원래 bytes/hash와 pending 거부를
검사한 뒤 해당 수정만 복구한다. private 본문·명령 원문은 runner Temp에 두고 summary만 업로드한다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1, R4 | `required` | Windows native bundle 실제 제작·빈 cache/update·MCP·session | 실제 선택 cache 일치, global Node 의존 없음, 모델 0 | CI 실행 예정 | `NOT RUN` |
| T2 | R1, R4 | `required` | macOS arm64의 같은 native 경로 | bytes·mode·runtime·선택 경로와 연결 일치 | CI 실행 예정 | `NOT RUN` |
| T3 | R1, R4 | `required` | macOS x64의 같은 native 경로 | 해당 OS/architecture에서 직접 확인 | CI 실행 예정 | `NOT RUN` |
| T4 | R2 | `required` | 실제 S0→S 교체, P0 무재init, 이후 P update | 동일 receipt/instruction/pin; bad surface 거부 시 업무 쓰기 없음 | 각 native summary로 확인 예정 | `NOT RUN` |
| T5 | R2 | `required` | 수정 파일 update·pending prepare 거부·복구 | 수정 bytes/이전 lock hash 보존, 정상 복구 후 ready | 각 native summary로 확인 예정 | `NOT RUN` |
| T6 | R3 | `required` | private corpus와 6L개 이전/후보 입력 비교 | content/contract/surface/body hash 일치, 옛 lib 참조 없음 | 각 native summary로 확인 예정 | `NOT RUN` |
| T7 | R4 | `required` | session stop/release, child/server 종료, fixture/user/DB 정리 | 종료 확인 실패는 전체 실패·보존, summary와 job 모두 성공해야 PASS | CI 실행 예정 | `NOT RUN` |
| T8 | R2 | `required` | 기존 Claude source 신규/update CI | 같은 후보·T의 실제 설치/연결 결과 | 같은 후보 실행 조회 예정 | `NOT RUN` |

## Commands and Outcomes

| 명령/실행 | 판정 | 의미 |
| --- | --- | --- |
| 새 MJS 네 파일의 `node --check`와 순수 계약 15개 | `PASS` | 로컬 문법·단위 검사. native 인수 성공이 아님 |
| `verify:ci-coverage` | `PASS` | 두 OS에 실행 명령과 coverage 행 연결. 실제 단계 실행은 별도 |
| `shared-distribution-acceptance/acceptance` Windows leg | `NOT RUN` | 준비된 native runtime·새 test DB·고정 T로 실제 인수 |
| `shared-distribution-acceptance/acceptance` macOS legs | `NOT RUN` | arm64/x64 각각 실행 |

## Evidence Registry

| Evidence ID | 위치 | 신뢰·범위 |
| --- | --- | --- |
| E1 | 새 CI 실행의 `shared-distribution-*` artifact `summary.json` | 실제 run/attempt/source/platform·package/lib 목록·명명된 검사·cleanup 결과. 실행 후 run URL을 기록 |
| E2 | 기존 MIGRATE 기록과 f430e26의 check/native/init CI | 이미 완료한 범위만 재사용. 새 실행 결과로 재표기하지 않음 |
| E3 | 공식 openai/codex rust-v0.167.1 release asset metadata | CLI archive URL·크기·SHA-256. 실제 download/검증은 runner에서 수행 |

## Findings and Follow-up

첫 실행 `909a83d`에서 고정 R1 템플릿에 최신 R2의 verifier 명칭 문구를 요구하는 corpus 검사를
적용해 실패했다. 이 campaign은 corpus의 설치·그래프 계약 두 검사로 범위를 명시하며 최신
문구 검사는 해당 문구를 포함한 release의 별도 검사로 유지한다. macOS Intel은 기존 전체 회귀와
인수를 한 job에 넣어 30분 제한에 걸려 인수를 독립 OS matrix로 분리했다. 첫 실패 run은
macOS `44043168300`, Windows `44043168411`이며 인수 PASS가 아니다.

개인 Windows host 부재는 GitHub-hosted 경로로 해결하며,
private 모델 계정 준비를 이 모델 없는 인수의 선행 조건으로 삼지 않는다. 불일치·실패·skip은
실제 결과에 따라 이 절과 위 행에 기록하고, 단순 job green이나 summary 파일 존재로 PASS하지 않는다.

## Cleanup and Residual State

실패 시에도 기록한 소유 session만 stop/release하고 서버 종료를 확인한다. 정리 미확인이 있으면
DB를 강제로 삭제하지 않고 실패로 남긴다. 성공 경로는 fixture user/repo·설치 profile과 정확한
test DB를 정리한다. workflow는 소유 PostgreSQL cluster를 별도로 종료한다. GitHub의 전체 job
결론까지 확인하며, private 원문과 profile은 artifact에 포함하지 않는다.

## Completion

모든 required 행의 실제 관찰과 cleanup을 확인한 뒤 판정한다. 이 보고서의 CI 범위 완료와
개인 설치·모델 역할·운영 승격은 별도 상태다.
