---
status: 'completed'
stage: null
result: 'fail'
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['integration', 'end-to-end']
test-tools: ['Codex CLI', 'PostgreSQL', 'scripts/rehearsals/rehearse-codex-macos.mjs']
created-at: '2026-11-05'
completed-at: '2026-11-05'
last-executed-at: '2026-11-05T06:56:44.355Z'
tested-revision: '3e69c5876f94b776a4b5c951e9254ba6f8f43a92 + dirty native candidate 0.5.35/0.5.36'
owners: ['user:Sangeok']
related: ['docs/architecture/macos-runtime.md']
primary-area: 'codex/macos-runtime'
observed-environments:
  - 'isolated loopback | installed plugin and test server | macOS 26.2 arm64, Codex 0.166.0 | synthetic owner and native roles'
test-summary: 'fail: macOS 설치·전체 역할 최초 인수 — 두 후보 모두 구현 검증 단계에서 미완료'
follow-up: ['docs/test-reports/completed/2026-11-10-codex-macos-native-acceptance.md']
---

# macOS Codex 최초 전체 역할 시험

## Summary and Decision

두 설치 후보 모두 실제 로그인한 Codex 모델로 배정·계획·계획 독립 검증·구현까지 진행했다.
첫 후보는 구현 검증 dispatch 입력에서, 다음 후보는 구현 검증 결과 제출과 보고서 handoff에서
멈췄다. 이 결과로 전체 A→Z나 공개 지원을 승인할 수 없다. 원본 실패 summary는 수정하지 않았으며
수정 후보의 재시험은 별도 보고서로 연결한다.

## Scope and Criteria

포함: bundled Node 설치·init, resident, owner gate, 모든 선택 역할을 포함한 단일 항목 인수.
제외: 운영 DB·공개 배포, 실제 웹 Inbox 조작, clean Mac 설치, Intel 실제 모델 수행.

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | [macOS runtime](../../architecture/macos-runtime.md) | 설치·실행 | MUST | global Node 없이 설치본으로 연결 |
| R2 | 사용자 요청: 설치·백그라운드·모든 선택 검증 역할 | 전체 graph | MUST | 모든 역할 종료·acceptedAt·로그 커밋 |
| R3 | [종료 계약](../../architecture/macos-runtime.md#종료와-복구) | 정리 | MUST | 소유 runner 정지 후 합성 fixture 제거 |

## Test Target

- Working tree: 기준 commit에서 격리 task branch의 미커밋 변경. 원래 작업 트리는 보존했다.
- Test server: production Webpack build의 loopback Next 서버와 별도 PostgreSQL 18.4.
- Runtime: bundled Node 22.23.3, 기존 Codex ChatGPT 로그인. Claude·WSL·별도 사용자 Node 미사용.
- Graph: assign-work → plan → verify → implement → impl-verify → qa → accept → doc-audit → scout.
- Gates: 시험 controller가 실제 owner service로 before-plan·before-implement를 승인했다.
- Private templates: upstream commit `fb6ef955ba3f6fc8320e173fbafc9ef03b83281b`의 16개 파일을
  blob SHA로 확인한 외부 export. 본문·원장·모델 raw log는 공개 저장소 밖에 보존했다.

| 후보 | payload SHA-256 | 파일 수 |
| --- | --- | --- |
| 0.5.35 | `5cb653060bf68ae50ebc77f476200df80c181532469be286b96af9554290957e` | 2,070 |
| 0.5.36 | `84ee1322a75ab755b3991dc8727f56408a1d6728fd3deb1e5792658554a5f926` | 2,071 |

## Preconditions and Test Data

새 synthetic GitHub 사용자·프로젝트와 disposable Git 저장소를 사용했다. 테스트 DB 이름은
`stagekeeper_test_*`이며 운영 연결과 분리했다. 서버 template release는 immutable이므로
후보마다 새 DB가 필요했다. 모델 호출은 명시한 `--run-models`로 실행했다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | v35 설치·init·기본 역할 | 실제 설치본 연결·역할 수행 | E1: 4 AgentRun 종료, 구현 보고까지 기록 | `PASS` |
| T2 | R2 | `required` | v35 모든 역할 graph | 구현 검증 이후 인수 | E1: plan 전용 인자를 impl dispatch에 전달, 3회 policy 중단, acceptedAt 없음 | `FAIL` |
| T3 | R1 | `required` | v36 설치·기본 역할 | 실제 설치본 연결·역할 수행 | E2: 배정·계획·계획 검증·구현 완료 | `PASS` |
| T4 | R2 | `required` | v36 구현 독립 검증 | mutation·보고서 제출 후 진행 | E2: baseline 7/7 통과 뒤 start/ok 거부, blocked 보고 handoff 미완료 | `FAIL` |
| T5 | R2 | `required` | QA·인수·감사·scout·유휴 | 전체 종료 | E1/E2: 앞 단계 미완료로 실행되지 않음 | `NOT RUN` |
| T6 | R3 | `required` | runner·fixture 정리 | 자기 소유 자원 정리 | E3: v35 후속 수동 정리, v36 자동 정리 확인 | `PASS` |
| T7 | R1 | `informational` | v36 첫 setup | fresh catalog seed | E4: 이전 immutable DB 재사용으로 seed 거부, 모델 미호출 | `FAIL` |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | T1/T3 | `required` | native package → `codex plugin add` → 파일 inventory 대조 | hash·mode 일치 | E1/E2: 설치본과 패키지 전수 일치 | `PASS` |
| C2 | T2/T4 | `required` | `rehearse-codex-macos.mjs --run-models` | 모든 역할·인수·유휴 완료 | E1/E2: 두 실행 모두 실패 exit | `FAIL` |
| C3 | T6 | `required` | 설치 helper status·stop, fixture inspector | 소유권 정리 뒤 synthetic user 제거 | E3 | `PASS` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | summary·ledger | v35는 04:33–05:00 UTC 실행. 4개 run 종료, impl run 미개설, acceptedAt null | 본문; raw는 로컬 외부 증거 디렉터리, 자동 만료 없음 |
| E2 | summary·ledger·report | v36 재시험 06:11–06:56 UTC. 5개 run 중 impl만 blocked-report에서 미종료. 실제 baseline 7/7 | 본문; raw는 로컬 외부 증거 디렉터리, 자동 만료 없음 |
| E3 | status·cleanup | v35 summary의 runnerStopped:false는 그대로 보존. 이후 dead runner 부재 확인·합성 사용자 제거·cwd/port가 일치하는 자기 Next 종료. v36 runnerStopped:true | 본문 |
| E4 | setup | v36 06:04 UTC seed 실패. fresh DB 준비 후 동일 payload 재시험 | 본문 |

v36 rehearsal source SHA-256은 `68a1c2769633582df8e301b10f2761ac1f56895e469d4068c7045645f6d1fb31`이다.
Sensitive-data review: 본문에는 토큰·session·계정 식별자·개인 경로·private 본문을 넣지 않았다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | high | plan 전용 dispatch 인자 오용이 역할 개설 전 cycle을 중단 — E1 | 후속 시험 보고서 | 도구 설명·schema와 정정 가능한 입력 오류로 재시험 |
| F2 | high | v36 start/ok 거부 원인이 generic error로 숨겨짐 — E2 | 후속 시험 보고서 | SDK 입력 검증 형식·receipt·note 제한의 안전한 분류 |
| F3 | high | blocked 보고서가 handoff에서 멈춤 — E2 | 후속 시험 보고서 | 같은 run의 보고서만 커밋·재개하고 검증을 반복하지 않음 |
| F4 | medium | 보호된 client metadata 누락이 복원 차이로 보임 — E2 | 후속 시험 보고서 | 허용 target 파일 상태와 최초 omissions 분리 |
| F5 | medium | 이미 정지한 runner를 정리 실패로 취급 — E3 | 후속 시험 보고서 | not-running·held 없음 확인 후 fixture 정리 |

v36에서 거부된 원래 MCP 인자는 기록되지 않았고 서버 원장에도 해당 rejection row가 없다.
SDK plaintext 입력 검증 형식은 설치된 SDK에서 확인했지만, 이를 당시 오류의 확정 원인으로
단정하지 않는다. 후보 수정은 실제 회귀 계약과 새 전체 실행으로 확인한다.

## Test Data and Cleanup

두 실제 실행의 runner를 정지하고 자기 synthetic user/project를 제거했다. setup 실패는
모델이나 사용자 fixture를 만들기 전에 발생했다. raw evidence·disposable Git 저장소와
시험 template DB는 외부 임시 작업 영역에 남아 있으며 운영 데이터는 변경하지 않았다.
작성 당시 구버전 설치 cache는 실패 재현용으로 보존했다.

2026-11-10 보존 상태 재확인: OS 임시 디렉터리의 파일 정리로 당시 raw 로그·시험 DB는
유실되었다. 이 보고서의 관찰 결과와 Git 기록은 남아 있으며 raw 재조회가 가능하다는
의미로 해석하지 않는다. 재개 후 모든 새 증거는 영구 작업 경로에 저장한다.

## Conclusion

필수 T2·T4·C2가 FAIL이므로 전체 판정은 fail이다. 후속 후보의 성공이 이 판정을 소급해서
바꾸지 않는다. 전체 역할과 장시간 유휴는 새 설치 payload와 fresh DB에서 다시 실행한다.

## Review Checklist

- [x] 실행이 끝난 후보의 실패와 미실행 항목을 보존했다.
- [x] 필수 기준·명령·증거와 전체 결과를 연결했다.
- [x] private 로그와 식별자를 공개 문서에서 제외했다.
- [x] 실제 정리와 원본 summary의 차이를 명시했다.
- [x] `npm run docs:check`와 최종 수동 검토를 완료했다.
