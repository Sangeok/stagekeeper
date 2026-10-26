---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static", "contract", "integration", "manual"]
test-tools: ["Node.js", "PowerShell", "Codex CLI", "Claude Code CLI", "PostgreSQL", "headless Microsoft Edge", "GitHub Actions"]
created-at: "2026-10-26"
completed-at: "2026-10-26"
last-executed-at: "2026-10-26T01:21:03.886Z"
tested-revision: "af2b1d3aefc27b404b89165baca8ef0336d55ef6"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md", "docs/test-reports/active/dual-client-runtime-report.md", "docs/test-reports/completed/2026-10-25-runtime-state-and-role-diagnostics.md"]
primary-area: "harness/codex-0524-windows-acceptance"
observed-environments: ["local | Windows x64 10.0.26200 | codex-cli 0.164.0; 2.1.310 (Claude Code); bundled Node v22.23.3 | disposable owner/project/service", "CI | existing immutable source checks | Windows native and macOS common contracts | reused source evidence, no new macOS model acceptance"]
test-summary: "pass: 0.5.24 양쪽 신규 설치·업데이트, 실제 Codex A-to-Z·실행 중 중지/재개 및 동일 패키지 110분 idle"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/proposals/active/codex-resident-runner-plan.md"]
---

# 0.5.24 Windows 설치·실제 A→Z·110분 인수

## Summary and Decision

사용자가 요청한 현재 Windows의 세 시험을 모두 완료했다. Claude/Codex 양쪽의 신규
0.5.24 설치와 0.5.23 → 0.5.24 업데이트에서 각 설치본의 2,232개 파일을 확인했다.
같은 payload로 실제 Codex A→Z와 실행 중 중지·재개를 통과했고, 별도 프로젝트에서
단일 연속 6623초 유휴 시험을 완료했다. 제품 payload 수정은 없었다.

A→Z는 모델 7회(2 main-loop·5 fresh role), AgentRun/사용량 각 3회,
테스트 47개와 최종 인수 5개가 통과했다. 모든 모델 turn의 terminal과 process close,
정상 stop 뒤 로컬 잠금·서버 실행기 정리를 확인했다. 유휴 heartbeat 107회와
pipeline poll 107회는 모두 HTTP 200이며 모델·AgentRun·사용량 증가는 0이었다.

이 PASS는 현재 PC의 세 시험에 한정한다. 과거 네 관찰의 개별 원인 미확정과 물리적
clean Windows·macOS 제품 backend/실제 인수·혼합 호스트·운영 출시 gate는 그대로 추적한다.

## Scope and Criteria

| 기준 | 통과 조건 |
| --- | --- |
| R1 설치 | 양쪽 실제 loader·신규 설치·버전 업데이트·전체 inventory·verifier를 확인하고 PATH에 별도 Node를 요구하지 않는다 |
| R2 A→Z | 원래 native Codex 인증으로 계획·독립 검증·두 owner gate·구현·보고·최종 다섯 인수를 완료한다 |
| R3 lifecycle | 실행 중 두 turn의 interrupt/terminal/close, successor 보존, 같은 AgentRun 재개와 사용량 중복 방지를 확인한다 |
| R4 장시간 | 동일 설치본을 실제 110분 유지하며 모델 없는 idle·정상 heartbeat/poll과 종료를 확인한다 |
| R5 정리 | 본인 fixture의 데이터·실행기·잠금·프로세스를 정리하고 원본 private 변경을 보존한다 |

## Test Target

시험 기준은 `af2b1d3aefc27b404b89165baca8ef0336d55ef6`, bundle의 원래 source는
`0d63e2c6745fee3b4049b118f27b63bbd5a1c016`다. 기준 이후 제품 파일을 바꾸지 않았으며 65개 shipped source
파일을 bundle inventory와 대조했다. package SHA-256은
`82e9b0cb6abf76ace6f23ef22421ac1e5c8148ee56ad6e636ccaaa41d6534248`다. 실제 양쪽 loader가 선택한 설치 경로에서도 전체 hash를
검사했다. verifier는 별도 사용자 설치 없이 같은 bundle에 포함됐다.

서비스는 같은 application source로 빌드한 격리 Next.js와 새 PostgreSQL DB를 사용했다.
기존 빌드 이후 application/core/schema 차이가 없음을 확인했고 build ID hash를 E6에 남겼다.
사용자 저장소와 별개의 fixture·owner·token·CLI 설정 디렉터리를 사용했다.

## Preconditions and Test Data

선택한 Codex의 기존 native 로그인을 사용하고 인증 파일은 복사하지 않았다. 설치 CLI와
helper의 PATH에서 전역 Node 경로를 제외했다. 물리적 Node 미설치 PC를 시험한 것은 아니다.
서비스와 측정 relay는 loopback에만 바인딩했다. 원본 private 변경 네 건은 보존하고
별도 worktree의 committed template source를 disposable DB에만 넣었다.

A→Z의 결함은 인수를 무시하고 고정 인사말을 반환하는 작은 함수다. 계획은 추가 이름
32개를 포함한 47개 literal 문자열 쌍을 명시했다. 모델이 선택한 올바른 테스트 표현과 Markdown
형식에 맞게 기존 관찰기 파서를 조정했으며 제품 요구사항이나 payload는 바꾸지 않았다.
독립 verifier의 여섯 경로·23개 변이 검증 기록과 별도로, owner는 최종 47개 literal,
추가 문자열 76개, 올바른 대조군과 변이 19개를 직접 확인했다.
이 유한 집합을 모든 문자열에 대한 전수 시험으로 주장하지 않는다.

## Test Cases and Results

| ID | 기준 | 실제 결과 | 판정 | 증거 |
| --- | --- | --- | --- | --- |
| T1 | R1 | 양쪽 신규 0.5.24 설치 및 0.5.23 → 0.5.24 갱신; 각각 2,232개 hash·실제 loader 확인 | PASS | E1 |
| T2 | R2 | 두 browser owner gate, 새 계획·독립 verifier·구현/report handoff, 최종 다섯 인수; 47 tests | PASS | E2 |
| T3 | R2 | 모델 7개 terminal/close, AgentRun/usage 3개; committed plan/report hash와 clean Git 일치 | PASS | E2 |
| T4 | R3 | pending takeover 후 두 turn interrupt, successor·receipt 보존; 새 두 context로 같은 AgentRun 재개·정상 stop | PASS | E3 |
| T5 | R4 | 같은 package의 단일 연속 6623초; heartbeat 107·poll 107, 모두 HTTP 200; 모델/AgentRun/usage 0 | PASS | E4 |
| T6 | R5 | fixture DB와 서비스/DB process, ownership 파일 정리; 원본 private 변경 네 건 보존 | PASS | E5 |

## Commands and Static Checks

관찰 스크립트와 원본 로그의 hash는 E6에 있다. 실제 설치·갱신은 각 CLI의 marketplace/
plugin 명령으로 수행했고, A→Z와 idle은 설치된 `harness.ps1`가 bundled Node를 호출했다.
장시간 관찰기는 duration 6600으로 한 번 연속 실행했다. 별도 relay는 본문을 그대로
전달하고 고정 operation·phase·HTTP 상태·지연·횟수만 보존했다.

제품 source는 바뀌지 않았다. 기준 dev의 check·Windows native·macOS 공통 계약 CI가
모두 green임을 E6에서 확인한다. source의 lint/type/test/build 회귀는
[수정 보고서](./2026-10-25-runtime-state-and-role-diagnostics.md)에 연결한다. 이번 문서 변경은
docs:check와 PR의 check workflow로 검증한다. macOS 공통 계약 PASS를 제품 backend
또는 인증된 macOS A→Z로 확대하지 않는다.

## Evidence Registry

| ID | 자료 | 내용 |
| --- | --- | --- |
| E1 | [설치](../assets/2026-10-26-codex-0524-windows-acceptance/installation.json) | 양쪽 신규·이전 버전·업데이트 및 inventory |
| E2 | [A→Z](../assets/2026-10-26-codex-0524-windows-acceptance/pipeline.json) | 실제 final acceptance, literal/owner checks, terminal·commit·사용량 |
| E3 | [중지·재개](../assets/2026-10-26-codex-0524-windows-acceptance/lifecycle.json) | 두 turn 취소·successor 보존·같은 AgentRun 재개 |
| E4 | [110분](../assets/2026-10-26-codex-0524-windows-acceptance/idle.json) | 단일 실행의 관찰·HTTP count/status·latency·동일 hash |
| E5 | [정리](../assets/2026-10-26-codex-0524-windows-acceptance/cleanup.json) | fixture 데이터·process·잠금 정리 |
| E6 | [source/검사](../assets/2026-10-26-codex-0524-windows-acceptance/source-and-checks.json) | source·실행 환경·CI·로그 hash·private 보존 |
| E7 | [관찰과 범위](../assets/2026-10-26-codex-0524-windows-acceptance/findings.json) | 경로 부재 처리·관찰기 조정·기존 미완료 gate |

원본 trace·모델 검증 기록·명령 출력은 로컬 외부 증거 폴더에 보존했다. 공개 자산에는
token·인증·본문·개인 경로·서버 식별자를 넣지 않았다. fixture 사용자·프로젝트·실행기·
AgentRun·템플릿을 정리한 뒤 해당 서비스와
PostgreSQL만 종료했다. 실제 설치 cache와 증거 파일은 재검토용으로 보존한다.

## Findings and Follow-up

없던 허용 경로에 대한 목록 조회 1회와 파일 읽기 1회가 있었다. 전자는 새 역할 진단의
`path-missing`, 후자는 기존 main-loop의 고정 경로 부재 응답으로 원인을 확인했다.
두 경우 모두 권한을 넓히지 않고 현재 계약의 생성 절차로 처리한 뒤 최종 인수까지
완료했다. 이를 숨겨 도구 실패 0회라고 기록하지 않는다. 미처리 제품 오류는 없었다.
이번 관찰을 상세 정보가 없던 과거 네 건의 동일 원인이라고 단정하지 않는다.

이전 관찰기가 특정 예시 수·따옴표·이름 접두사·Markdown 표기만 허용하던 부분을
관찰 대상의 실제 유효한 표현에 맞췄다. 실제 literal 값·필수 범주·32개 sequence·다섯
인수·receipt·원본/commit hash·terminal/close 확인은 유지했다. 제품 수정은 없었다.

## Conclusion

요청된 현재 Windows의 세 시험은 같은 0.5.24 설치본으로 모두 통과했다. 전체 OS·출시
제안서는 기존 외부 환경 및 release 조건 때문에 pending/blocked를 유지한다.

## Review Checklist

- [x] 신규 설치와 업데이트를 실제 양쪽 loader에서 확인했다.
- [x] 실제 모델 A→Z·중지/재개와 동일 package의 실제 110분을 완료했다.
- [x] 경로 부재 두 건과 처리 결과를 숨기지 않았다.
- [x] source/plan/report·snapshot·terminal·사용량과 fixture 정리를 확인했다.
- [x] 유한 fixture 인수와 전체 OS/출시 gate를 구분했다.
