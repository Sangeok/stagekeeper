---
status: 'active'
stage: 'running'
result: null
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['static', 'contract', 'integration', 'end-to-end']
test-tools: ['Codex CLI', 'Node test runner', 'PostgreSQL', 'Playwright MCP', 'scripts/rehearsals/rehearse-codex-macos.mjs']
created-at: '2026-11-05'
completed-at: null
last-executed-at: '2026-11-05T12:16:22.573Z'
tested-revision: '3e69c5876f94b776a4b5c951e9254ba6f8f43a92 + native candidate 0.5.37'
owners: ['user:Sangeok']
related: ['docs/architecture/macos-runtime.md', 'docs/test-reports/completed/2026-11-05-codex-macos-initial-trials.md']
primary-area: 'codex/macos-runtime'
observed-environments:
  - 'isolated loopback | installed plugin and test server | macOS 26.2 arm64, Codex 0.166.0 | synthetic owner and native roles'
test-summary: null
follow-up: []
---

# macOS Codex native 설치·전체 역할 인수

## Summary and Decision

기존 native Codex 로그인으로 설치·백그라운드·모든 선택 검증 역할을 연결하는 수정 후보를
검증한다. 이전 두 후보의 실패는 별도 완료 보고서에 보존했다. 현재 전체 실제 모델 실행과
110분 유휴 관찰이 진행 중이므로 A→Z 완료나 공개 출시를 선언하지 않는다.

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

- Working tree: 격리 task branch의 dirty candidate. 원래 사용자 worktree는 수정하지 않는다.
- Bundle: 2,071 files; SHA-256 `dfc2b02bd799180788b3ea8580b30138d8661d02e8997357a16b3e31efa1837d`.
- Runtime: Node 22.23.3; native executable SHA-256
  `68f4d07ca49e0500cc135c7e0a445093e228e42e126ac22306d045f0a8c2636b`.
- Test server: 별도 PostgreSQL 18.4와 loopback production Webpack build. helper PATH에는 global Node 없음.
- Private templates: 검증한 16파일 export, upstream `fb6ef955ba3f6fc8320e173fbafc9ef03b83281b`.
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
| T1 | R1 | `required` | 설치 inventory·실제 init | 모든 hash·mode 일치, global Node 없이 연결 | E1: 2,071 files 일치, installed-init 완료 | `PASS` |
| T2 | R2 | `required` | native 경계·종료·double-supervisor recovery | 파일·network 제한과 소유 후손 정리 | E2: native 8 tests 통과 | `PASS` |
| T3 | R2 | `required` | 실제 CLI 정책 preflight | effective config·skills·thread·정리 | E3: 모델 미호출·quiescent true | `PASS` |
| T4 | R3 | `required` | 실제 모델 전체 graph | 모든 선택 역할·인수·log 커밋 | 실행 중 | `NOT RUN` |
| T5 | R3 | `required` | 실제 Chrome QA 역할 | build commit과 시나리오·console·network 근거 | 전체 graph에서 실행 예정 | `NOT RUN` |
| T6 | R4 | `required` | 110분 idle·stop | 새 모델·run 없음, owner release | 전체 graph 뒤 관찰 예정 | `NOT RUN` |
| T7 | R2 | `required` | provenance·오래된 reader | 손상 거부, unresolved v2 lock 보존 | E4: provenance 9 tests, 출시 20개 reader 보존 | `PASS` |
| T8 | R3 | `informational` | 실제 Playwright MCP transport | 입력·snapshot·screenshot·재조회·범위 거부 | E5: 9 checks 통과; 역할 인수 대체 아님 | `PASS` |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | R5 | `required` | `npm test` | 관련 모든 회귀 통과 | E6: 610 pass, 27 platform skip, 0 fail | `PASS` |
| C2 | R5 | `required` | `npm run check` | lint·경계·type·script 통과 | E6: script 308 pass, 2 skip, 0 fail | `PASS` |
| C3 | R5 | `required` | `npm run test:architecture` | architecture subset 통과 | E6: 215 pass, 2 skip | `PASS` |
| C4 | R5 | `required` | production Webpack build | type·route build 완료 | E7: 33 routes 생성 | `PASS` |
| C5 | R5 | `informational` | 기본 `npm run build` | Turbopack build 완료 | E7: 내부 port bind EPERM, Node 22/26 host 실행에서도 동일 | `BLOCKED` |
| C6 | R2/R5 | `required` | macOS arm64/x64 CI | bundle 빌드·native 계약 통과 | PR 실행 예정 | `NOT RUN` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | installation | 실제 installed cache의 모든 정규 파일·hash·mode·extras 검사, init 성공 | 본문; raw 외부 보존 |
| E2 | native tests | allowed/denied/network/child inheritance, 내부 npm symlink, discard, detached stop, timeout/output limit, supervisor 사망 복구와 mutation assertion/restoration | 본문; `plugin/runtime/*.test.mjs` |
| E3 | host probe | actual Codex 0.166.0에서 modelStarted:false, effectiveConfig/skills/thread/quiescent:true | 본문; `scripts/macos/probe-codex-host.mjs` |
| E4 | compatibility | Node/runtime inventory 9 tests와 0.5.14–0.5.33 reader의 v2 lock 보존 | 본문; provenance·released reader 테스트 |
| E5 | browser transport | 실제 Chrome/Playwright MCP identity·snapshot refs·form·save·reload·image·console·network·외부 origin 거부 | 본문; raw 외부 보존 |
| E6 | commands | 로컬 명령 exit 0과 결과 집계. parent sandbox의 loopback EPERM은 host 실행으로 구분 | 본문; raw 외부 보존 |
| E7 | build | 기본 build 실패를 보존하며 공식 Webpack 경로의 성공을 별도 기록 | 본문; raw 외부 보존 |

현재 rehearsal source SHA-256은 `3c29ca514d2412783271e40793b4393e1e4b8dc2f093067c914544de9025d1c6`이다.
Sensitive-data review: 공개 문서에는 token·account/session·개인 경로·private 템플릿·원문 model log를 넣지 않는다.

## Findings and Follow-up

초기 후보의 dispatch 인자·불명확한 MCP 입력 거부·보고서 handoff·omissions 표시·정리 오류를
수정했다. 정확한 과거 rejected 입력을 확보하지 못한 한계는 초기 보고서에 보존했다.
native 계약 테스트 성공과 실제 모든 역할 성공을 구분하며 재시험 결과로 갱신한다.

## Test Data and Cleanup

실제 모델 실행 중이다. 현재 runner·브라우저·loopback 서버·합성 사용자와 fresh DB가 존재한다.
종료 시 자기 runner의 정지·소유권 해제를 확인하고 사용자·서버를 정리한 결과를 확정한다.
이전 실패 증거와 설치 cache는 재현용으로 보존한다.

## Conclusion

실제 전체 역할·장시간 유휴·CI가 남아 있으므로 최종 판정은 아직 내리지 않는다.
공개 bundle 배포와 clean machine 검증은 이 로컬 인수의 결과에 포함하지 않는다.

## Review Checklist

- [x] 기준과 후보 payload·rehearsal identity를 고정했다.
- [x] 초기 실패를 별도 완료 기록으로 보존했다.
- [x] 모델 없는 계약과 실제 역할 인수를 구분했다.
- [ ] 전체 역할·유휴·정리·CI 결과를 확정한다.
- [ ] docs:check와 민감정보 최종 검토 뒤 완료 경로로 이동한다.
