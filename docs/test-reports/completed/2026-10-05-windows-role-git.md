---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "standard"
test-levels: ["contract","integration","manual"]
test-tools: ["Node.js test runner","Git for Windows","Codex CLI App Server","Claude Code installed helper","PostgreSQL","headless Microsoft Edge","GitHub Actions"]
created-at: "2026-10-05"
completed-at: "2026-10-05"
last-executed-at: "2026-10-05T12:52:42.471Z"
tested-revision: "97f03030206f075ae6b7f4308da3314adb01478a"
owners: ["user:Sangeok"]
related: ["docs/architecture/protocol.md","docs/test-reports/completed/2026-10-05-windows-private-template-acceptance.md","docs/test-reports/active/dual-client-runtime-report.md","docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
primary-area: "harness/windows-role-git"
observed-environments: ["local | native Windows 11 Home disposable installed package and service | Codex 0.160.0, Claude Code 2.1.288 helper, bundled Node 22.23.3/x64, Git 2.47.1.windows.2, PostgreSQL 18.4 | existing native Codex login; no authentication copied","CI | source check and production build | Ubuntu GitHub Actions | check workflow"]
test-summary: "pass: scoped Windows Git inspection regression — actual private dev verification passed; full verifier, controlled same-case stop/resume and latest native CI remain open"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md","docs/test-reports/active/dual-client-runtime-report.md"]
---

# Windows 역할 Git 조회 회귀 검증

## Summary and Decision

명령 snapshot에 Git metadata가 없어 실제 dev 본문이 Git 확인에서 멈추는 문제를
재현하고, 허용 파일만 읽는 고정 `role_git_read` 도구로 해결했다. 실제 private dev는
중간 후보에서 코드 수정·Git 확인·native 테스트를 수행해 서버의 `verify: ok`를 받았다.
최종 후보는 설치된 helper의 실제 HTTP bridge와 Windows host 회귀 시험으로 확인했다.
이 보고서는 Git 조회 회귀만 완료하며 전체 Windows 서비스 인수와 출시를 승인하지 않는다.

## Scope and Criteria

포함: 고정 Git 조회, 파일·ref·원본 metadata 경계, 세션 소유권과 종료, 실제 설치본의
receipt 기반 서비스 연결, private dev의 Git 확인 및 native 테스트, public source CI.

제외: 전체 독립 verifier, owner 보고서 커밋·최종 accept, 동일 private 항목의 제어된
pending 중지/재개 완주, released private 본문, 물리적 clean Windows, native Claude 모델,
혼합 호스트·C4·배포. 새 native-runtime CI 완료도 이 시점의 판정 범위에 포함하지 않는다.
이들은 [active 캠페인](../active/dual-client-runtime-report.md)에 유지한다.

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | `docs/architecture/protocol.md` 고정 Git 데이터 조회 | 허용 연산·파일·ref | 허용된 구체적 파일에 한정 | head/show/diff/status 동작, 금지 경로·과거 tree·임의 ref 거부 |
| R2 | `docs/architecture/protocol.md` 원본 불변·세션 소유권 | Git process와 metadata | 기존 command snapshot 및 owner 권한 유지 | 원본 불변, config/filter 미실행, 중지 후 호출 거부와 실제 process 종료 |
| R3 | 후속 제안서 REQ-MIN-001/002 | 설치 helper의 Git 호환성 | 추가 사용자 설치·인증 없이 검증 | 양쪽 설치본 일치, 실제 dev Git 확인/native 테스트, 최종 설치본 HTTP 조회 |
| R4 | `AGENTS.md` 검증 규칙, `docs/test-reports/README.md` | public source 및 증거 | 소스 검증과 제품 전체 인수를 구분 | 필수 check 통과, 결과·링크·민감정보 검토 |

## Test Target

Public source는 기준 commit의 별도 worktree이며 실행 당시 application 코드 변경은
없었다. 서비스는 최초 Git 수정 checkpoint `f74ee8f09c74ee8b19bd2c7dabb5ed2d4ff7c35b`의
production build를 사용했다. 이후 수정은 설치된 역할 runtime 및 시험/문서에 적용했다.
최종 private package는 0.5.7이며 두 client의 실제 cache 2,210개 파일을 비교했다.
원본 bundled Node와 완전한 verifier 8개 파일의 hash는 그대로 유지했다. [E1]

실제 모델 검증은 0.5.3과 0.5.6 후보로 수행했다. **최종 0.5.7의 실제 HTTP bridge
시험은 새 모델 호출 없이 수행했으며, 0.5.7로 전체 private dev를 다시 실행한 시험은 아니다.**
private 본문은 별도 저장소의 미배포 working snapshot 12행이다. future QA 참조가 있어
현재 integration의 released 본문으로 간주하지 않는다. host에 Node는 설치돼 있으나
client PATH에서 제외했다. Claude helper 설치·초기화는 native Claude 모델 실행과 구분한다.

## Preconditions and Test Data

Fresh loopback PostgreSQL DB에 현재 migration을 적용하고 synthetic Max 계정과 작은
JavaScript 저장소를 만들었다. 실제 계획 파일의 필수 제목·verification paths를 확인하고
owner가 먼저 commit했다. private 본문은 원본 working copy를 수정하지 않고 이 DB에만
연결했으며, 운영 DB와 실제 GitHub OAuth에는 접근하지 않았다.

실제 Inbox 승인은 격리 headless Edge에서 진행했다. Codex는 기존 Windows 인증으로
실행했고 WSL·다른 client 로그인·인증 파일 복사를 요구하지 않았다. 중지 시 owned child의
실제 종료와 세션 반납을 확인한 뒤 DB를 제한 복구하고 서비스·DB를 종료하도록 했다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1,R2 | required | Windows host에서 고정 Git 연산과 경계 시험 | 허용 파일 조회, 원본 metadata 불변, 금지 조회·실행 거부 | 최종 12개 시험 통과; worktree/packed 객체, config/filter, index flags, 과거 tree, alias, stale 데이터, abort/owner 거부 확인 [E1][E2] | PASS |
| T2 | R3 | required | 실제 양쪽 CLI cache에 최종 후보 설치 | winning 설치본과 전체 package 파일 일치 | 0.5.7의 2,210개 파일 일치; runtime/verifier 원본 hash 유지, 인증 복사 없음 [E1] | PASS |
| T3 | R1,R2,R3 | required | 최종 설치 helper와 실제 서비스의 HTTP role bridge | receipt 필요, 기록한 plan show/source diff/status, 범위·stop 제한 | 같은 server run에서 모두 확인; foreign/managed 경로 및 stop 후 조회 거부, owned Git process 10개 종료·반납, 새 모델 0회 [E1] | PASS |
| T4 | R3 | required | 실제 private dev의 구현 및 검증 단계 | Git 확인과 native 테스트 수행 후 서버가 verify ok 수락 | 깨끗한 0.5.6 fixture에서 Git 조회 3회, 실제 테스트 exit 0/quiescent, implement ok와 verify ok 수락 [E1] | PASS |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R1/R2/T1 | required | `node --test plugin/bin/harness-role-git.test.mjs` | 최종 소스의 Windows host 시험 통과 | 12 PASS / 0 FAIL / 0 SKIP [E1][E2] | PASS |
| C2 | R4 | required | `check` CI: `npm run check`, `npm test`, `npm run test:web`, `npm run build` | 필수 소스 workflow 성공 | 최종 코드 revision에서 성공; check에 FSD/type/architecture 검증 포함 [E3] | PASS |
| C3 | R4 | required | 저장된 보고서 구조/링크/판정 검증, projected JSON 검토, `git diff --check` | 메타데이터·기준·실행·증거 연결 유효, 비밀·private body 없음 | 기존 표준 보고서 parser로 검증; campaign marker는 검증 입력에만 추가, 실제 문서에는 추가하지 않음; 상대 링크/소스 hash 일치 확인 [E1][E2] | PASS |

`npm run docs:check`는 저장소에 정의돼 있지 않아 기존 구조 parser와 수동 검토를 사용했다.
새 [native-runtime CI](https://github.com/Sangeok/stagekeeper/actions/runs/37312063277)는
증거 고정 시점에 실행 중이었다. 이전 [전체 Windows CI](https://github.com/Sangeok/stagekeeper/actions/runs/37293546260)의
통과는 변경하지 않은 LPAC command/runtime와 전체 프로젝트 빌드의 근거이며 새 Git
broker의 최종 native CI 통과로 대체하지 않는다.

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | 설치/모델/서비스/cleanup projection | [관찰 JSON](../assets/2026-10-05-windows-role-git/observations.json): phase별 버전·연산·종료·서버 outcome·hash·실패와 미인수 범위 | Git 보존; private 본문·인증·run/session/account ID·raw transcript 없음 |
| E2 | 소스 및 재현 가능한 회귀 시험 | [고정 Git broker](../../../plugin/runtime/role-git.mjs), [host 시험](../../../plugin/bin/harness-role-git.test.mjs), [역할 연결](../../../plugin/runtime/codex-thread.mjs); hash는 E1 | Git 보존; 일회성 원본 operator/log는 Git 밖에 유지 |
| E3 | 최종 코드 필수 CI | [check 실행](https://github.com/Sangeok/stagekeeper/actions/runs/37312063293) | GitHub Actions 보존 정책 |
| E4 | 수정 전 실패 기록 | [이전 bounded FAIL 보고서](./2026-10-05-windows-private-template-acceptance.md) | Git 보존; 이전 결과를 수정하지 않음 |

민감정보 검토: 고정 필드 projection만 공개하며 private 본문, credential, 인증 state,
raw 모델 출력, 계정·세션 식별자는 포함하지 않는다. 실제 모델 4회가 보고한 token 합계
800,812는 서버 신규 run 청구 3회나 금액과 다른 값이다. 모델 실패와 operator 오류도 E1에 보존한다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | high | 독립 verifier는 read failed/blocked 후 report ok로 닫혔으며 원본 skill 검토를 완료하지 못했다. dev verify ok는 전체 verifier 통과 근거가 아니다. [E1] | [후속 계획](../../proposals/active/codex-dual-client-runtime-follow-ups.md) | 고정 released 본문·실제 plan/verification paths로 독립 verifier 전체 실행 |
| F2 | high | 초기 0.5.3 dev의 실제 pending command stop은 exit 124/quiescent였으나, 그 resume은 owner control/generated 파일이 scope 밖에 있어 verify failed였다. 깨끗한 다음 항목은 테스트를 완료했지만 observer가 preflight를 포함해 실제 pending test를 중지하지 못했다. [E1] | [active 캠페인](../active/dual-client-runtime-report.md) | 동일 private 항목의 실제 active-command 식별 후 stop·종료·fresh resume·검증 완주 |
| F3 | high | 마지막 dev는 verify ok 후 report failed/handoff로 owner를 기다린다. 최종 accept·released private 본문·clean Windows·native Claude·C4는 미인수다. [E1] | [후속 계획](../../proposals/active/codex-dual-client-runtime-follow-ups.md) | 최소 설치 조건을 유지한 owner 보고서 commit 및 전체 제품 인수 |
| F4 | medium | 새 native-runtime CI 결과는 이 시점에 미확정이다. 최종 local Windows Git 시험과 required check는 통과했다. [E1][E3] | [PR #117](https://github.com/Sangeok/stagekeeper/pull/117) | 해당 native CI 완료 후 별도 결과 확인 |

첫 resume의 receipt 필드 사용, stopping 전 release, 최종 HTTP dispatch의 agentKey 누락은
모델 호출 없는 operator 오류였다. 잘못된 실행은 보존하고 올바른 fixture에서 다시 확인했다.
0.5.2 Git 누락 재현과 E4의 실패 이력은 이 좁은 회귀 통과로 삭제하지 않는다.

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| 격리 PostgreSQL | candidate 12행과 synthetic 프로젝트/원장 | baseline 제한 복구, Codex row 제거·무관 row 보존, DB 종료 | 운영 DB 영향 없음; 3 runs/3 charges/11 steps는 일회성 DB에만 남음 |
| Native service/역할 process | production Next, 모델/App Server, Git reader, local session | owned process 종료·세션 반납, Next 종료 | 사용자 기존 process에는 조작 없음 |
| private 원본 저장소 | 읽기 및 source hash 고정 | 종료 시 snapshot hash 일치, 원본 쓰기 없음 | 사용자의 기존 미커밋 working copy 유지 |
| 일회성 source/package/profile | 실제 role 구현 및 설치·시험 | source 변경과 정제된 증거 보존 | private 원문·인증/log는 공개 Git에 추가하지 않음 |

실패·중지된 모델 결과와 원장은 성공으로 변환하지 않았다. candidate·계정·프로젝트와
승인 fixture는 격리 DB 안에만 있었으며 복구 및 shutdown acknowledgement를 확인했다. [E1]

## Conclusion

Result rationale: pass

Git 조회 회귀의 required T1–T4/C1–C3가 모두 통과했다. 설치본의 고정 조회와 actual
private dev의 테스트 증거를 구분했고, Git 수정 전 실패와 이번 실행의 한계를 보존했다.
전체 Windows 지원의 완료 여부는 이 결과와 별도로 active 캠페인에서 판단한다.
추가 Git 코드 변경이나 native CI 실패가 있으면 새 회귀 기록으로 재검증하고, 남은
verifier·중지/재개·최종 accept는 그 캠페인의 새 실행 증거로 기록한다.

## Review Checklist

- [x] 완료된 Git 회귀만 판정 범위에 포함하고 전체 서비스 인수는 active에 유지했다.
- [x] 표준 metadata·기준·required 실행·Evidence ID와 결과 계산을 검토했다.
- [x] 최종 코드/설치본과 중간 후보의 실제 모델 검증을 구분했다.
- [x] 이전 실패·operator 오류·모델 사용량·미인수 범위를 보존했다.
- [x] 정제 JSON의 민감정보·상대 링크·소스 hash와 cleanup 최종 상태를 확인했다.
- [x] 정의되지 않은 docs:check 대신 기존 구조 parser와 diff 검증을 수행했다.
