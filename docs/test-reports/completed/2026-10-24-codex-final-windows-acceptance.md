---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static", "component", "contract", "integration", "manual"]
test-tools: ["Node.js", "PowerShell", "Codex CLI", "Claude Code CLI", "PostgreSQL", "headless Microsoft Edge", "GitHub Actions"]
created-at: "2026-10-24"
completed-at: "2026-10-24"
last-executed-at: "2026-10-24T13:05:44.132Z"
tested-revision: "1cae8cc0843124c25b9dc585e0ef01df63d19dd2"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md", "docs/test-reports/active/dual-client-runtime-report.md", "https://github.com/Sangeok/stagekeeper/pull/225"]
primary-area: "harness/codex-final-windows-acceptance"
observed-environments: ["local | isolated Windows product resident service | Codex native login; bundled Node 22.23.3; PostgreSQL 18.6 | disposable owner and agent", "CI | Windows native and macOS 15 arm64/x64 common contracts | pinned Windows Node 22.23.3 and hosted Node 22 | GitHub Actions"]
test-summary: "pass: 0.5.23 내부 상태 진단·실제 양쪽 설치·동일 payload의 Codex A-to-Z와 110분 idle; 전체 OS·출시 제안서는 pending/blocked"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md"]
---

# 최종 0.5.23 Windows 설치본의 상태 진단과 실제 인수

## Summary and Decision

resident 내부에서 잡힌 상태 읽기·쓰기 오류의 진단 누락을 재현하고 수정했다. 손상된
실행 중 lock과 상태 저장 거부 시험은 수정 전 2개 모두 실패하고 수정 후 통과했다.
stop 쓰기 거부 시에는 살아 있는 소유권과 원본 lock을 유지하고 이후 정상 중지를
허용한다. guard·acknowledgement·종료 확인 정책은 바꾸지 않았다.

실제 Claude/Codex 0.5.22 → 0.5.23 설치 업데이트에서 전체 2,231개 inventory를 확인했다.
같은 설치 payload로 새 계획부터 두 browser owner gate·독립 verifier·구현·보고서·최종
다섯 인수를 통과했다. 모델 실행 7회(2 main-loop, 5 fresh role)는 모두 terminal과 process close를
확인했으며 AgentRun/사용량은 3회다. 별도 프로젝트의 실제 110분 idle은 최종 확인까지
6600초, heartbeat 108회와 pipeline poll 108회가 모두 HTTP 200이었다.
idle의 모델·AgentRun·사용량 증가는 0이고 시작/끝 payload가 일치했다.

과거 native/state/Windows CI stop 오류의 개별 원인은 여전히 미확정이다. 이번에 재현한
진단 누락 수정과 반복 시험 통과를 그 과거 오류의 원인 해결로 확대하지 않는다.
전체 제안서는 pending/blocked를 유지한다.

## Scope and Criteria

현재 PC의 격리 개발·인수와 dev 반영 범위다. 운영 seed·main 승격·공개 패키지 배포는
실행하지 않는다. 물리적 clean Windows, macOS 제품 backend와 기존 인증 실제 인수,
실제 혼합 호스트 및 출시 gate는 남아 있다. macOS CI는 공통 계약 검증이다.

| 기준 ID | 기준 문서/요구 | 적용 범위 | 해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | [protocol](../../architecture/protocol.md)의 상태/소유권 계약 | resident 내부 오류 | 기존 중지·보존 판정 유지 | 실패 재현, 정제 진단, 미확인 소유권 보존 |
| R2 | [후속 계획](../../proposals/active/codex-dual-client-runtime-follow-ups.md)의 설치·C4B | 최종 현재 Windows bundle | 실제 설치와 기본 graph | 전체 inventory, 두 owner gate, 독립 검증, 서버 인수 |
| R3 | 같은 계획 C4C/E12 | 같은 payload의 실제 idle | 시간 단축·합산 없음 | 단일 6,600초, HTTP 수, 모델/usage 0, 종료 정리 |
| R4 | [검증 규칙](../../architecture/verification.md) | source·회귀·CI | runtime 성공과 지원 범위 구분 | 필수 검사와 source binding |

## Test Target

- 시작 dev: 9b758af9f4cd169a7407c0622d33cd573838142c.
- 제품 source: 1cae8cc0843124c25b9dc585e0ef01df63d19dd2. 이후 문서 변경은 이 설치 payload를 바꾸지 않는다.
- 후보 0.5.23: 2,231 files, SHA-256 902ec7cb379e80b339315e4bbbc3cfb400f5853df2c40f31cadd4393818605da.
- runtime SHA-256: 0148976b90617f693b073da4217021c8ac454fceda10485172bc5979647c4dbb.
- 완전한 verifier: 8 files, checksum 89f61697dbdd711d600c74221cbf3e4ac5fc60fd520c51c365ef8a0450b3bad6.
- clean private template source: 7f34e7b0a4e6e302b8559f54ca4894ee78b8964f; 사용자 원본의 4개 변경 파일은 보존한다.
- HTTP 서비스는 이 source 입력으로 새 production build를 수행했다. 이전 build를 재사용하지 않았다.

## Preconditions and Test Data

전역 Node가 있는 현재 Windows PC에서 helper/client PATH의 global Node를 제외했다.
이 조건은 물리적 clean host가 아니다. 임시 DB·localhost 서버·프로젝트 두 개·합성 owner
세션과 clean private template 13행을 사용했다. 모델은 기존 native Codex 로그인을
사용하며 인증 파일을 복사하지 않았다. A→Z와 idle은 서로 다른 프로젝트/사용자다.

A→Z는 문자열 greeting 함수의 기본 plan/verify/implement/accept graph다. opt-in QA나
impl-verifier, 전체 웹 서비스·OAuth·결제 인수로 확대하지 않는다. 독립 verifier는 fixture
계획의 6개 필수 경로, 43개 literal pair, 19개 mutant와 두 negative control을 확인했다.
부모 resident 제안서의 전체 reconciliation clean pass를 뜻하지 않는다.

## Test Cases and Results

| ID | 연결 | Gate | 시험 | 성공 기준 | 실제 결과/증거 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | 실행 중 lock 손상·상태 쓰기 거부 | 진단 보존, canary/path 비노출 | 전 2 FAIL; 후 기존 시작 거부 포함 3 PASS, E1 | PASS |
| T2 | R1 | required | stop write EBUSY | lock 불변·poller 생존·정상 후속 stop | bundled Node 1 PASS, E1 | PASS |
| T3 | R1 | required | native 거부·정상 resident stop 반복 | 반복 실패 0 | 각 10/10 PASS; 과거 원인 미확정, E1 | PASS |
| T4 | R2 | required | 실제 양쪽 설치 업데이트 | 새 버전·전체 payload·skill loader | 0.5.23 각 2,231 files, Codex 5 skills, E2 | PASS |
| T5 | R2 | required | 실제 Codex A→Z | 두 gate·verifier·5개 최종 인수·정리 | 2 cycles, 5 roles, 3 AgentRuns, 43 tests, E3 | PASS |
| T6 | R3 | required | 같은 설치 payload의 110분 idle | 실제 6,600초·모델/usage 0·최신 heartbeat | 6600초, HTTP 216회 모두 200, E4 | PASS |
| T7 | R2/R3 | required | owned 종료·DB 정리 | lock/guard/process/row 0 | 두 user·13 template 제거 및 listener 정리, E4 | PASS |

## Commands and Static Checks

| ID | 연결 | Gate | 명령/방법 | 성공 기준 | 실제 결과/증거 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R4 | required | npm run check | lint·type·scripts 오류 0 | local 194 PASS / 3 SKIP, E5 | PASS |
| C2 | R1/R4 | required | npm test와 최종 bundled background | 오류 0 | local 546 PASS / 2 SKIP; 마지막 stop 시험 추가 후 background 25/25, E5 | PASS |
| C3 | R4 | required | fsd/server/architecture/build | 경계·build 오류 0 | architecture 148 PASS / 2 SKIP, 나머지 PASS, E5 | PASS |
| C4 | R4 | required | 최종 제품 source CI | 모든 관련 job green | check 40089054982, Windows 40089054975, macOS 40089054915, E5 | PASS |

CI의 최종 전체 core/plugin은 Linux/macOS 각각 529 PASS / 20 SKIP,
Windows background 44 PASS와 native role 43 PASS다. Web 777개, server 155개와
격리 DB integration 146개도 통과했다. source commit의 CI와 최종 문서 전달 commit/
dev merge CI는 [PR #225](https://github.com/Sangeok/stagekeeper/pull/225)에 구분해 기록한다.

## Evidence Registry

| ID | 종류 | 안전한 증거 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | 재현·진단·실패 이력 | [failures](../assets/2026-10-24-codex-final-windows-acceptance/failures.json) | 고정 결과·해시 repo 보존 |
| E2 | 실제 client 설치 | [updates](../assets/2026-10-24-codex-final-windows-acceptance/windows-update.json), [source/payload](../assets/2026-10-24-codex-final-windows-acceptance/source-basis.json) | 버전·개수·해시 repo 보존 |
| E3 | 실제 서버·모델·브라우저 | [pipeline](../assets/2026-10-24-codex-final-windows-acceptance/pipeline.json) | ID·원문·인증 제외한 결과 repo 보존 |
| E4 | 실제 시간·HTTP·정리 | [idle](../assets/2026-10-24-codex-final-windows-acceptance/idle.json), [cleanup](../assets/2026-10-24-codex-final-windows-acceptance/cleanup.json) | 고정 측정치 repo 보존 |
| E5 | 필수 검사·CI | [checks](../assets/2026-10-24-codex-final-windows-acceptance/checks.json), [source CI](../assets/2026-10-24-codex-final-windows-acceptance/source-basis.json) | source·명령·CI link repo 보존 |

원본 helper/observer 로그와 재현 스크립트는 별도 owned 로컬 증거 디렉터리에 보존한다.
native/stop 재현은 같은 이름의 Node test를 bundled Node로 각 10회 실행한다. 장시간
observer는 전용 loopback relay에서 body를 변경하지 않고 operation·상태 코드·횟수만
집계한다. HTTP count와 DB seenAt의 서로 다른 관찰 109회를 구분한다.

## Findings and Follow-up

실행 중 손상된 lock을 읽는 lifecycle catch와 상태 저장 실패를 받는 run catch가 진단을
잃는 두 경로를 실제 자식 프로세스에서 재현했다. lifecycle·beat·run·unsettled·settle·clear의
내부 catch에 고정 필드 진단을 남겼으며, 손상 데이터나 소유권을 자동 복구하지 않는다.
과거 세 간헐 실패의 당시 원문/거부 코드가 부족해 개별 원인은 미확정으로 유지한다.

시험 도구의 초기 중복 interval 인자, 이전 cache 경로 치환 오류, 보고서 Markdown 형식
가정은 각각 교정했다. 실제 인수 보고서는 다섯 항목을 numbered paragraph로 기록했으며,
내용을 읽고 DB acceptedAt·커밋된 원본·43개 실행 결과와 다시 대조해 통과했다. 제품
산출물이나 설치 payload를 이 관찰기 수정에 맞춰 변경하지 않았다.

실제 모델 중 role_file_read 실패 한 건이 기록됐다. 제한된 observer는 해당 오류의 상세
인자를 보존하지 않아 원인을 추정하지 않는다. 이후 두 cycle과 모든 역할은 completed로
끝났고 서버 최종 인수와 정리가 통과했다. 이 기록을 실패 없는 모든 도구 호출로 바꾸지 않는다.

물리적 clean Windows, macOS의 전체 descendant 소유권·quiescence와 제품 backend,
기존 인증 실제 macOS A→Z·장시간·취소, 실제 혼합 호스트, 운영 seed/배포·복구·출시 gate가
남아 있다. 이전 macOS process-group 반례는 [이식성 보고서](./2026-10-24-codex-runtime-portability.md)에 보존한다.

## Conclusion

현재 Windows의 최종 0.5.23 설치본에 대해 실제 A→Z와 단일 110분 idle을 직접 확인했다.
이 범위는 통과했으며, 전체 제안서와 제품 공개 지원 판정은 pending/blocked다.

## Review Checklist

- [x] 수정 전 실패와 수정 후 통과를 구분했다.
- [x] 과거 미확정 오류와 처리된 도구 실패를 보존했다.
- [x] 실제 설치·source·같은 payload·실제 경과 시간을 결합했다.
- [x] 임시 데이터·프로세스·lock/guard 정리와 사용자 private 변경 보존을 확인했다.
- [x] 현재 PC의 scoped acceptance와 전체 지원·출시를 구분했다.
