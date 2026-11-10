---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['static', 'contract', 'integration', 'end-to-end']
test-tools: ['Codex CLI', 'Node test runner', 'PostgreSQL', 'Playwright MCP', 'scripts/rehearsals/rehearse-codex-macos.mjs']
created-at: '2026-11-05'
completed-at: '2026-11-10'
last-executed-at: '2026-11-10T12:31:22.876Z'
tested-revision: 'f882bb96450580d51dc63f142d19531a67185132 payload 0.6.10; aefcebb1c20717fa16be9d357dcd585617e35c71 test fixtures and CI'
owners: ['user:Sangeok']
related: ['docs/architecture/macos-runtime.md', 'docs/test-reports/completed/2026-11-05-codex-macos-initial-trials.md']
primary-area: 'codex/macos-runtime'
observed-environments:
  - 'isolated loopback | installed plugin and test server | macOS 26.2 arm64, Codex 0.167.0 | synthetic owner and native roles'
test-summary: 'pass: macOS native 설치·전체 역할·110분 유휴 — 필수 기준 통과, 과거 환경 build 차단은 참고 이력으로 보존'
follow-up: []
---

# macOS Codex native 설치·전체 역할 인수

## Summary and Decision

기존 native Codex 로그인과 0.6.10 설치본으로 설치·백그라운드·모든 선택 검증 역할을
실제 완주했다. 8개 AgentRun 모두 성공 terminal을 기록했고, 인수 보고서 4개와
감사·탐색 로그의 커밋도 확인했다. 같은 실행의 110분 유휴 동안 새 모델·AgentRun은 0건이었다.
runner 소유권 반납, 합성 데이터 삭제와 시험 서버 정리까지 끝나 이 로컬 인수 범위를 통과로 판정한다.

과거 후보의 제품·시험 결함, 덮개 닫힘 절전, 진단 코드에 의한 중단과 raw 증거 유실은
별도 초기 보고서와 아래 이력에 보존했다. 실패를 현재 실행의 통과로 소급해서 바꾸지 않는다.

## Scope and Criteria

포함: bundled Node·완전 verifier 설치, init, 권한 경계, 명령·후손 종료·복구, 모든 역할과
인수, 고정 audit/scout log, 장시간 idle. 제외: 운영 seed·배포, clean Mac, Intel 실제 모델,
다른 클라이언트로의 교차 재개, macOS 로그인 시 자동 시작, 실제 웹 Inbox UI 승인.

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | [최소 설치](../../architecture/system-overview.md) | 설치 | MUST | 기존 Codex 로그인·설치 bundle만으로 helper 연결 |
| R2 | [macOS 경계](../../architecture/macos-runtime.md) | 실행·복구 | MUST | 허용 파일만 읽고 network 거부, 명령 산출물 폐기·후손 정리 |
| R3 | 사용자 요청: 모든 선택 역할까지 | 전체 graph | MUST | 독립 역할 완료·acceptedAt·원장·보고서 커밋 일치 |
| R4 | [runtime 계약](../../architecture/protocol.md) | resident | MUST | 유휴 110분 중 새 모델·AgentRun 없음, 정지 후 소유권 반납 |
| R5 | [저장소 검증](../../architecture/verification.md) | 회귀 | MUST | 경계·lint·type·테스트와 build 결과 보존 |

## Test Target

- Working tree: 격리 task branch에서 실행하며 원래 사용자 worktree는 보존했다.
- Bundle: 2,072 files; SHA-256 `3867f8eff90be2860a6c3859008afceaa4916b560ab67e4e0bf24e7f15a461c8`.
- Runtime: Node 22.23.3; native executable SHA-256
  `68f4d07ca49e0500cc135c7e0a445093e228e42e126ac22306d045f0a8c2636b`.
- Test server: 별도 PostgreSQL 18.4와 loopback production Turbopack build. helper PATH에는 global Node 없음.
- Private templates: 현재 production/설치 CI의 R1 commit `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215`.
  이전 실행은 R0 `fb6ef955ba3f6fc8320e173fbafc9ef03b83281b`를 사용했다.
- Graph: assign-work → plan → verify → implement → impl-verify → qa → accept → doc-audit → scout.
- QA: 구현 보고의 실제 commit을 표시하고 해당 Git blob을 제공하는 disposable Chrome 페이지.
- Gate: fixture controller가 실제 owner service로 승인하며 에이전트에 owner 도구를 주지 않는다.

## Preconditions and Test Data

macOS arm64에서 bundle을 실제 local marketplace에 설치하고 전수 hash·mode를 확인했다.
새 `stagekeeper_test_*` DB를 자기 portable cluster 안에 만들었다. 자기 합성 사용자·프로젝트·
Git 저장소만 생성하고 runner 정지 확인 후 DB fixture를 제거한다. private raw evidence는
저장소 밖에 보존하며 운영 서버·DB와 기존 사용자 프로젝트를 실행 대상으로 사용하지 않는다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | 설치 inventory·실제 init | 모든 hash·mode 일치, global Node 없이 연결 | E1: 2,072 files 일치, installed-init 완료 | `PASS` |
| T2 | R2 | `required` | native 경계·종료·double-supervisor recovery | 파일·network 제한과 소유 후손 정리 | E2: native 계약 통과, 외부·금지·변경된 hardlink 거부 포함 | `PASS` |
| T3 | R2 | `required` | 실제 CLI 정책 preflight | effective config·skills·thread·정리 | E3: 모델 미호출·quiescent true | `PASS` |
| T4 | R3 | `required` | 실제 모델 전체 graph | 모든 선택 역할·인수·log 커밋 | E17: 8 AgentRun 성공·종료, 4개 보고서·인수, audit/scout log 커밋 일치 | `PASS` |
| T5 | R3 | `required` | 실제 Chrome QA 역할 | build commit과 시나리오·console·network 근거 | 0.6.10의 네 시나리오 통과, 실제 commit 표시·console 0·page/module 200 확인, QA report/ok 수락·종료 | `PASS` |
| T6 | R4 | `required` | 110분 idle·stop | 새 모델·run 없음, owner release | E18: 6,600초, 새 모델·AgentRun 0, 최대 표본 간격 60.831초, runnerStopped true·held false | `PASS` |
| T7 | R2 | `required` | provenance·오래된 reader | 손상 거부, unresolved v2 lock 보존 | E4: provenance 거부 검사와 출시 25개 reader 보존 | `PASS` |
| T8 | R3 | `informational` | 실제 Playwright MCP transport | 입력·snapshot·screenshot·재조회·범위 거부 | E5: 9 checks 통과; 역할 인수 대체 아님 | `PASS` |
| T9 | R2/R5 | `required` | Stagekeeper 전체 repository build | 역할 network·DB URL·원본 쓰기 없이 빌드 | E9: 36,507파일 snapshot의 실제 Prisma·Next build 통과 | `PASS` |
| T10 | R1/R2 | `required` | bundled launcher의 commit guard | global Node 없이 역할 커밋 거부·main 유지 | E12: 실제 stdin/launcher 통과 | `PASS` |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R5 | `required` | npm test 전체 패턴을 bundled Node 22에서 직렬 실행 | 관련 모든 회귀 통과 | E6: f882bb9에서 637 pass, 28 platform skip, 0 fail | `PASS` |
| C2 | R5 | `required` | `npm run check` | lint·경계·type·script 통과 | E6: f882bb9에서 script 330 pass, 2 skip, 0 fail | `PASS` |
| C3 | R5 | `required` | `npm run test:architecture` | architecture subset 통과 | E6: f882bb9에서 230 pass, 2 skip, 0 fail | `PASS` |
| C4 | R5 | `required` | 기본 `npm run build` | type·route build 완료 | E7: Turbopack production build exit 0 | `PASS` |
| C5 | R5 | `informational` | 이전 후보 build | 기존 환경 제한 보존 | E7: 11월 5일 기본 build는 port bind EPERM, Webpack은 통과 | `BLOCKED` |
| C6 | R2/R5 | `required` | macOS arm64/x64 CI | bundle 빌드·native 계약·전체 project build 통과 | aefcebb의 두 아키텍처에서 계약과 offline 전체 build 통과 | `PASS` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | installation | 실제 installed cache의 모든 정규 파일·hash·mode·extras 검사, init 성공 | 본문; raw 외부 보존 |
| E2 | native tests | allowed/denied/network/child inheritance, 내부 npm symlink, discard, detached stop, timeout/output limit, supervisor 사망 복구와 mutation assertion/restoration | 본문; `plugin/runtime/*.test.mjs` |
| E3 | host probe | actual Codex 0.167.0에서 modelStarted:false, effectiveConfig/skills/thread/quiescent:true | 본문; `scripts/macos/probe-codex-host.mjs` |
| E4 | compatibility | Node/runtime inventory 검사와 origin/main 이력의 25개 reader(0.5.14–0.5.33, 0.6.0/0.6.2/0.6.3/0.6.4/0.6.5)의 v2 lock 보존 | 본문; provenance·released reader 테스트 |
| E5 | browser transport | 실제 Chrome/Playwright MCP identity·snapshot refs·form·save·reload·image·console·network·외부 origin 거부 | 당시 관찰은 본문; 11월 5일 raw는 유실 |
| E6 | commands | 로컬 명령 exit 0과 결과 집계. parent sandbox의 loopback EPERM은 host 실행으로 구분 | 본문; raw 외부 보존 |
| E7 | build | 현재 기본 build 성공. 이전 제한 환경의 실패와 Webpack 성공도 보존 | 본문; 현재 raw 외부 영구 경로 보존 |
| E9 | native project build | 889,157,502 bytes의 snapshot에서 Prisma generate·Webpack production build exit 0, quiescent:true, 원본 source hash·BUILD_ID 보존 | 본문; `native-project-build-final.json`은 외부 영구 경로 |
| E10 | CI | aefcebb의 [check](https://github.com/Sangeok/stagekeeper/actions/runs/42796382900), [macOS](https://github.com/Sangeok/stagekeeper/actions/runs/42796382855), [Windows](https://github.com/Sangeok/stagekeeper/actions/runs/42796382874), [설치](https://github.com/Sangeok/stagekeeper/actions/runs/42796382612) 모두 성공. macOS 양쪽의 실제 offline 전체 build와 설치 네 job의 실제 smoke 단계도 성공 | GitHub Actions |
| E11 | live ledger·host | 첫 0.6.7 실행은 인수·모든 선택 역할 종료 뒤 assignment report 누락을 별도 감사에서 검출했다. 강화된 재시험은 7개 AgentRun 모두 실제 성공·종료, 인수·감사까지 완료. 다음 main-loop 모델은 도구를 호출하지 못했고 scout AgentRun은 없음. pmset은 12:50:15+09:00 Clamshell Sleep, 14:22:13+09:00 전체 Wake를 기록 | 외부 영구 경로의 두 final ledger·terminal-record-audit·host-sleep-evidence |
| E12 | installation/guard | 최신 dev 보호 훅 5개를 native launcher로 연결. 정확한 inventory·mode 검증과 PATH=/usr/bin:/bin의 실제 commit-guard 호출에서 report role deny·main no-decision 확인 | 외부 영구 경로의 bundle-v68-check·installation-v68 |
| E13 | R1 replay | 0.6.8은 세 독립 검토의 결함 보고 뒤 owner service로 planning에 반환했다. 개발 역할이 이전 plan을 현재 handoff 없이 다시 제출한 사실을 확인해 후보를 중단했다. 0.6.9에서 현재 handoff 없는 제출 거부와 검토 on_hold의 제한된 proxy를 추가 검증했다 | 외부 영구 경로의 v68 final ledger·owner-plan-return, 단위·계약 시험 |
| E14 | implementation check | 0.6.9에서 숫자 보존·숫자 단어 경계와 ASCII 문자 40개 사례를 별도 native snapshot으로 실행해 exit 0, quiescent:true, originalRepositoryWrites:false 확인 | 외부 영구 경로의 v69-independent-digit-check |
| E15 | diagnostic interruption | 첫 0.6.9 실행의 긴 code-mode 대기는 해소되어 09:33:11Z 인수, 09:33:27Z 문서 감사 dispatch까지 진행했다. 이후 시험자가 붙인 임시 loopback inspector의 cleanup 표현식에서 동적 import 거부를 처리하지 않아 runner가 종료됐다. 제품 결함이나 통과로 바꾸지 않고 시험 도구 실패로 보존했다 | 외부 영구 경로의 diagnostic-interruption·원본 summary·final ledger |
| E16 | file policy regression | 커밋된 합성 `.azure`·명시적 제외 디렉터리·환경 파일을 직접 파일 정책은 거부하지만 구현 Git이 일부 되살리는 결함을 재현했다. 원래 구현은 Missing expected rejection으로 실패했고, 동일 원본 broker를 checkout/show/history/restore에 적용한 뒤 정상 baseline·mutation과 함께 2개 시험 통과 | 외부 영구 경로의 implementation-policy-before-corrected·after-corrected; source regression test |
| E17 | live ledger·Git | 0.6.10의 8개 실행 모두 accepted terminal ok·closedAt, refused 0. 10:35:32.330Z 인수, 보고서 4개의 기록 commit이 HEAD 조상이고 현재 파일 bytes와 일치. audit/scout 고정 log도 marker와 HEAD bytes 일치 | 외부 영구 경로의 v610 ledger·report-commit-audit·summary |
| E18 | idle·cleanup | 10:41:20.505Z부터 6,600초 관찰, baseline 8 AgentRun·3 main-loop starts 유지, 최대 표본 간격 60.831초. pmset의 관찰 구간 Sleep/Wake 기록 0. runner 종료·소유권 반납, 시험 DB 8개의 사용자·프로젝트 0, 시험 포트 4개 닫힘, 자기 PostgreSQL·caffeinate 종료. 설치 2,072파일 hash·mode도 시험 뒤 재확인 | 외부 영구 경로의 final ledger·summary·power-observation·final-fixture-audit·cleanup-final·installation-v610-final |

현재 rehearsal source SHA-256은 `2c5ea56edac31ba926419fd4564a086926c52456738a9cba8c4bed3a3eb401fe`이다.
현재 실행 payload는 f882bb9다. 이전 84e6053 이후 9a7ed15는 두 시험 fixture의 누락된 repository binding만 고쳤다.
시험 서버 build는 애플리케이션 파일이 같은 fa973e2의 build를 유지했다.
이전 강화된 재시험은 `668cd507e6288ab7d81ea46aae3f51e4b912e45202603c05f0ca1c894abdb6ab`였다.
처음 0.6.7 실행은 `9babd6b891b86ccf3b34992f4798611f5360f4153d88312fc48eba25e583bce6`였으며
그 실행 도중 DB 유틸 import 경로를 통합했다. source-basis에 실제 실행한 revision·tree·build ID를
보존했으며, 나중의 수정으로 실행 identity를 소급해서 바꾸지 않았다.
Sensitive-data review: 공개 문서에는 token·account/session·개인 경로·private 템플릿·원문 model log를 넣지 않는다.

### 이전 후보와 증거 보존 상태

- 0.5.37의 payload는 `dfc2b02bd799180788b3ea8580b30138d8661d02e8997357a16b3e31efa1837d`였다.
  8 AgentRun이 모두 종료했고 4개 보고서·인수·audit/scout 커밋을 직접 확인했다.
  2026-11-05T12:49:22.177Z에 인수되었으며 2,188초 유휴 확인 뒤 최신 dev 통합을 위해 정지했다.
  정지 후 raw summary가 fail을 기록한 사실은 보존하며, 110분 통과로 해석하지 않는다.
- 0.6.3은 설치·build 뒤 시작했지만 재개 시 최종 raw 결과를 확인할 수 없었다.
  해당 revision의 [check](https://github.com/Sangeok/stagekeeper/actions/runs/42037070016),
  [macOS 두 아키텍처](https://github.com/Sangeok/stagekeeper/actions/runs/42037070200),
  [Windows](https://github.com/Sangeok/stagekeeper/actions/runs/42037070069),
  [설치 스모크](https://github.com/Sangeok/stagekeeper/actions/runs/42037070010)는 모두 성공했다.
- 11월 10일 재개 시 `/private/tmp` 파일이 정리되어 이전 raw 로그·DB는 더 이상 열 수 없었다.
  Git commit과 공개 정제 기록·CI는 남아 있다. 이후 source·DB·package·증거는 영구 작업
  디렉터리에 두며 새 유휴 관찰은 실제 model-start 수와 경과 시간도 매분 보존한다.
- 0.6.5는 계획 검증 중 실제 프로젝트 빌드의 dependency hardlink 문제를 확인해 정지했다.
  단순 명령 테스트와 실제 889 MB repository build를 구분했고, 외부·금지된 연결 및 enumeration
  이후 바뀐 연결의 거부를 추가 검증한 뒤 내부 링크만 독립 파일로 복사하도록 수정했다.
- 같은 build의 Turbopack CSS 처리는 network deny에서 내부 port bind가 거부되어 실패했다.
  native macOS 역할의 build만 Webpack을 선택한 후 E9가 통과했다. 원래 두 실패 로그도 보존했다.
- 0.6.6에서는 작업 배정의 비교 목록 입력이 거부되어 work-assigner가 propose:failed로 종료했다.
  보드 항목은 생성되지 않았다. 선택 항목 제외·단일 후보의 빈 comparisons를 schema·step 안내·
  안전한 거부 이유에 명시했고, 거부 검증은 유지했다. 이를 감지하면 시험도 즉시 실패하도록 보강했다.
- 공통/Windows CI의 alias 거부 문구 회귀를 수정했다. 이어 최신 dev에서 DB 검증 함수가
  이동해 생긴 static import 실패도 통합했다. 이력의 실패를 재시도로 덮지 않고 수정 commit과 연결한다.
- 두 번째 0.6.9 실행은 E16을 수정하기 위해 계획 단계에서 명시적으로 중단했다. 중단이
  unsettled ownership을 남겨 프로세스 부재 확인·정확한 session 반납·fixture 삭제를 따로 수행했다.
- 첫 0.6.10 전체 unit 실행은 이전 설치 cache의 Node 경로로 시작했다. 설치 업데이트가
  그 cache를 제거하면서 이후 자식 시험의 spawn ENOENT가 발생했다. 원래 실패 로그는 보존하고,
  업데이트와 무관한 source runtime의 동일 Node 22.23.3으로 전체 패턴을 다시 실행해
  637 pass·28 platform skip·0 fail을 확인했다.
- f882bb9의 arm64 CI는 Git 시험 fixture의 자동 유지보수가 `objects/maintenance.lock`을
  제거하는 시점과 읽기가 겹쳐 실패했다. Intel의 계약·전체 build와 다른 CI는 통과했다.
  시험 fixture의 Git 호출에만 maintenance.auto=false·gc.auto=0을 적용했으며,
  관련 13개 시험 통과·2개 환경별 제외를 확인했다. 제품의 변경 중 객체 거부 정책은 유지한다.
  구현 복사본 시험에도 같은 fixture 설정을 적용했다. aefcebb의 양쪽 macOS 계약·전체 build가
  통과했으며, 설치 payload와 당시 실제 모델 실행은 f882bb9 그대로 유지했다.

## Findings and Follow-up

초기 후보의 dispatch 인자·불명확한 MCP 입력 거부·보고서 handoff·omissions 표시·정리 오류를
수정했다. 정확한 과거 rejected 입력을 확보하지 못한 한계는 초기 보고서에 보존했다.
native 계약 테스트와 실제 모든 역할 성공은 E2와 E17에서 각각 확인했다.

실행 원장의 closedAt만으로 역할 완료를 판정하지 않는다. 시험 controller가 새 작업을
멈출 때 미완료 work-assigner 보고 단계까지 닫을 수 있음을 확인했다. 수정한 재생은
이미 배정한 실행의 보고 단계가 끝나기를 기다리고, 모든 역할의 accepted terminal outcome을
확인한다. 처음 0.6.7 실행은 이 감사에서 실패했으며, 결과를 전체 통과로 처리하지 않았다.
강화된 재시험은 배정 보고를 실제로 마쳤다. 이후 scout 전 모델 시작과 거의 동시에
호스트가 Clamshell Sleep에 들어갔다. 해당 실행의 idle 방지용 caffeinate도 덮개 닫힘 절전을 막지 못했다.
최종 재생은 완료 전 deadline을 명확히 실패시키고, 60초 유휴 표본 간격이 90초를 초과하거나
시계가 역행하면 관찰을 중단한다. 절전 구간을 110분의 정상 유휴로 계산하지 않는다.

## Test Data and Cleanup

최종 실행은 runnerStopped:true를 기록했고, 설치 helper의 추가 조회에서도 running:false·
held:false·session:null을 확인했다. 자기 합성 사용자·프로젝트를 삭제하고 Next·QA·브라우저
MCP를 종료했다. 자기 portable cluster의 시험 DB 8개를 다시 읽어 사용자·프로젝트가 모두
0건임을 확인한 뒤 PostgreSQL도 정지했다. 시험 포트 45438·45441·45442·45443은 모두 닫혔다.

첫 0.6.9의 진단 중단과 두 번째 실행의 명시적 중단은 conservative ownership을 남겼다.
각 helper의 release-check가 프로세스 부재를 확인한 뒤 같은 session을 명시적으로 반납했고,
잠금 파일을 직접 제거하지 않았다. 이전 실패 summary와 모든 후속 정리 증거는 보존했다.

사용자가 요청한 임시 caffeinate는 시험 종료 시 함께 끝났으며 자기 assertion 프로세스의
부재를 확인했다. 사용자의 전역 전원 설정·원래 worktree와 운영 DB는 변경하지 않았다.
시험 DB 파일·package 사본·정제 전 원장은 저장소 밖의 영구 작업 디렉터리에 보존한다.

## Conclusion

설치·native 경계·전체 repository build·모든 선택 역할·최종 인수와 CI가 통과했다.
T6의 같은 실행 유휴·정리까지 통과하여 모든 필수 gate를 충족했다.
C5의 과거 제한 환경 build 차단은 informational 기록이며 현재 판정을 뒤집지 않는다.
공개 bundle 배포와 clean machine 검증은 이 로컬 인수의 결과에 포함하지 않는다.

## Review Checklist

- [x] 기준과 후보 payload·rehearsal identity를 고정했다.
- [x] 초기 실패를 별도 완료 기록으로 보존했다.
- [x] 모델 없는 계약과 실제 역할 인수를 구분했다.
- [x] 전체 역할·유휴·정리·CI 결과를 확정했다.
- [x] docs:check와 민감정보 최종 검토 뒤 완료 경로로 이동했다.

## 완료 후 통합 메모

검증 중 `dev`에 들어온 화면·문서 개선 `295082ceb5349aab189518779286c7449f862cfc`를
통합하면서 verification 문서의 목록 충돌만 해결했다. 설치 payload·서버·MCP route·
공통 정책·의존성·DB schema·실제 모델 리허설은 검증 시점과 같은 바이트를 유지한다.
그 통합 시점의 플러그인 트리 차이는 앞서 기록한 두 Git 시험 fixture 설정뿐이다.

통합 후 `check` 330 pass·2 skip, architecture 230 pass·2 skip, FSD·server 경계와
기본 Turbopack build가 다시 통과했다. 이 통합은 위 실제 모델 실행의 identity를 바꾸지 않으며,
비교 결과와 새 build ID는 외부 `post-acceptance-integration.json`에 보존했다.

통합 CI에서는 기존 정지 요청 시험이 lock 삭제와 stop 파일 삭제 사이를 관찰해 실패했다.
두 삭제가 모두 끝나기를 같은 제한 시간 안에서 기다리도록 시험 완료 조건만 수정했다.
실제 종료·파일 삭제 조건을 제거하거나 제품의 정리 순서를 변경하지 않았다.

Intel CI의 기존 재시도 시험은 정상 응답 이후의 조회도 실패 재시도 간격에 포함하고 있었다.
정상 조회는 요청 시작 기준으로 주기를 계산하므로 서버 도착 간격으로 같은 기준을 보장할 수 없다.
실패 응답의 request ID로 실제 재시도 6개를 구분하고, 기존 최소 간격·8회 요청·성공 후 실패
횟수 초기화·종료 정리 검사를 유지했다. 이 변경도 시험에만 적용했다.

추가로 `dev`의 `21439d6150397dc29a020331d663c9efa1e8f55c`에는 Claude 사용 한도
대기 기능이 들어왔다. 이를 통합한 PR 버전은 0.6.11이다. Codex 전용 실행·역할·native
backend는 그대로이고, 공유 루프에는 Claude adapter가 반환하는 limited 결과 처리가 추가됐다.
Codex adapter는 이 결과를 반환하지 않는다. 통합 후 회귀 647 pass·28 platform skip,
`check` 330 pass·2 skip, 기본 build와 모델 미호출 Codex host probe가 통과했다.

이 추가 통합을 위 0.6.10의 실제 모델·110분 기록으로 소급하지 않는다. 이 Mac에는 검증한
0.6.10 bundle을 유지했으며 0.6.11 bundle 설치나 실제 모델 재생은 하지 않았다.
추가 Claude 기능의 배포·이 PC 설치 승인은 해당 작업 범위에 남는다.
