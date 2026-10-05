---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "standard"
test-levels: ["static","component","contract","integration","manual"]
test-tools: ["Node.js","Codex CLI App Server","Claude Code CLI","Windows PowerShell","Windows tar"]
created-at: "2026-10-05"
completed-at: "2026-10-05"
last-executed-at: "2026-10-05T09:54:35.974Z"
tested-revision: "21b2c7bdcacd463ffe7286d05da4dc73b1960a74"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md","docs/test-reports/active/dual-client-runtime-report.md"]
primary-area: "harness/windows-package-update"
observed-environments: ["local | isolated install profiles on Windows 11 Home 10.0.26200 | Codex 0.160.0 / Claude Code 2.1.288 / bundled Node 22.23.3 x64 | no authentication copied"]
test-summary: "pass: versioned 0.5.2 private package update, exact installed inventory, helper/skill conflict boundaries and ZIP round trip; broader minimum-install/release gates remain open"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
---

# Windows 패키지 업데이트 회귀 인수

## Summary and Decision

Claude Code는 내용이 달라도 같은 `0.5.1` 버전의 update를 `up_to_date`로 처리하고
이전 캐시를 유지했다. 두 client manifest를 함께 `0.5.2`로 올린 후 실제 업데이트와
설치된 전체 파일 대조가 통과했다. 이 보고서는 수정한 버전의 패키지 회귀 범위를
완료한다. 전체 Windows 지원이나 최소 설치·private 운영 배포의 완료 판정은
[active runtime 보고서](../active/dual-client-runtime-report.md)에 남긴다.

## Scope and Criteria

포함: 격리된 실제 client 설치/업데이트, winning loader와 설치 inventory,
bundled helper, 수정한 generated 파일·원본 verifier 보존, 같은 이름의 skill 선택,
private ZIP 추출 결과.

제외: Node가 물리적으로 없는 새 PC, 로그인/model 추론, verifier의 새 전체 검토,
실제 private Template body·운영 DB seed/복구, 승인 browser/양방향 재개, C4.
이 항목들은 아래 회귀의 선택적 검사가 아니라 상위 출시 게이트의 미완료 작업이다.

| 기준 ID | 기준 문서 | 적용 범위 | 확인 기준 |
| --- | --- | --- | --- |
| R1 | `docs/architecture/protocol.md`의 install bundle/update 계약 | REQ-MIN-002 중 버전 갱신 | 양쪽 실제 설치 캐시의 모든 파일이 새 패키지와 일치 |
| R2 | `docs/architecture/system-overview.md`의 최소 설치 기준 | helper 실행 의존성 | 전역 Node 없는 PATH에서 bundled launcher 사용 |
| R3 | `plugin/codex/skills/harness-init/SKILL.md`, `plugin/runtime/codex-thread.mjs` | 독립 verifier·generated 파일 보존 | packaged checksum, staged skill 하나 활성화, 수정 파일 미채택 |
| R4 | `scripts/package-windows-plugin.mjs` | 검토 가능한 private 배포물 | ZIP 추출 후 inventory·manifest 바이트 일치 |

## Test Target

검증 대상은 source commit에서 생성한 private 설치 디렉터리와 실제 client가 복사한
캐시다. 공개 plugin 텍스트 42개는 commit과 LF 정규화 후 일치하고, package/ZIP
해시는 실제 시험 바이트를 식별한다. CRLF 차이를 raw Git blob 동일성으로 주장하지 않는다.
기존 로그인·사용자 설정과 별도 QA worktree는 변경하지 않았다.

기계에는 Node가 설치되어 있다. 시험 subprocess PATH에서 전역 Node를 제외하고
`where node` 실패를 확인했으며, Codex npm wrapper는 패키지의 Node로 실행했다.
이 사실은 Node가 전혀 설치되지 않은 물리적 새 Windows 인수를 대신하지 않는다.

## Preconditions and Test Data

검증된 고정 Node/npm/license runtime과 변경하지 않은 완전한 verifier 8개 파일을
사용했다. 이전 설치는 별도 checkpoint의 `0.5.1` 패키지다. client 프로필·로컬
marketplace·Git fixture·합성 HTTP templates는 모두 소유한 임시 경로에 있다.
auth 파일/API key를 복사하지 않았으며 이번 시험의 model starts와 DB writes는 0이다.

각 App Server·helper·HTTP server는 종료를 기다렸다. 모델 없는 thread 생성 뒤
`turn/start` 전에 시험을 끝냈고 owned child settlement와 session release를 확인했다.
private 패키지·ZIP·원시 진단은 Git 밖에 보존했다. ZIP은 공개하거나 업로드하지 않았다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | Claude `plugin update`, 0.5.1 → 0.5.2 | `updated`, 새 cache/version과 2,209개 inventory 전량 일치 [E1] | PASS |
| T2 | R1 | required | Codex `plugin add` 갱신 후 새 App Server discovery | harness-init 경로 하나, 0.5.2 manifest와 동일 inventory [E1] | PASS |
| T3 | R2 | required | 두 설치 cache의 PowerShell helper init | 전역 Node 없는 PATH, 합성 templates로 두 client init exit 0; 기존 dry-run은 쓰기 없음 [E1] | PASS |
| T4 | R3 | required | 수정한 generated role로 init 재실행 | 두 client 모두 skip(modified), 수정 바이트와 기존 ownership hash 보존; 자동 adopt 없음 [E1] | PASS |
| T5 | R3 | required | 다른 checksum의 동일 이름 verifier 복사본 3개 | main 후보 3개, role 후보 2개, 실제 fresh thread에 원본 staged skill 하나 enabled/34개 disabled, model 0 [E1] | PASS |
| T6 | R3 | required | 외부 verifier 환경 override와 원본 보존 | Codex init metadata는 새 installed bundle을 선택; 원본/staged checksum 동일, 8개 파일, 세션 반납 [E1] | PASS |
| T7 | R4 | required | private ZIP 생성 → 새 디렉터리 추출 | manifest 바이트·정렬된 전체 inventory 정확히 일치 [E1] | PASS |
| T8 | R1 | required | 기존 token 안내/package 계약 회귀 | 8 PASS, 양쪽 manifest version 일치 [E2] | PASS |

## Commands

실제 operator 스크립트의 checksum은 E1에 기록했다. raw 진단과 private body는
공개 보고서에 넣지 않는다. 실제 실행한 명령의 핵심 계약은 다음과 같다.

| 기준 ID | Gate | 명령/검증 | 결과 | Evidence |
| --- | --- | --- | --- | --- |
| R1 | required | 격리 `claude plugin update harness@<private-local-marketplace> --scope user --json`와 `plugin list --json` | 새 버전 설치; restart 안내 후 새 process로 조회 | E1 / PASS |
| R1 | required | 격리 `codex plugin add harness@<private-local-marketplace> --json`, 새 App Server `skills/list` | 실제 loader와 새 cache 대조 | E1 / PASS |
| R2,R3 | required | installed `bin/harness.ps1 init --root <owned-fixture> --server <synthetic-loopback> --client claude/codex` | 정상 init와 modified-file 보존 | E1 / PASS |
| R3 | required | installed dispatcher의 native preflight/config/skills list/`thread/start` | actual thread accepted, turn 미요청, exact staged checksum | E1 / PASS |
| R4 | required | Windows `tar.exe` ZIP 생성/추출과 전체 hash 대조 | 왕복 일치 | E1 / PASS |
| R1 | required | `npm run check`, 최종 `npx tsc --noEmit`, token reveal test | lint/type/FSD PASS; architecture 26 PASS/2 native-fixture SKIP; availability 18 PASS; 대상 8 PASS | E2 / PASS |

## Evidence Registry

| ID | 증거 | 범위 |
| --- | --- | --- |
| E1 | [고정 필드 관찰 기록](../assets/2026-10-05-windows-package-acceptance/observations.json) | source/runtime/verifier/package/ZIP hash, 과거 cache 실패, 최신 install/helper/conflict 결과, operator hash |
| E2 | E1의 checks | 정적·대상 회귀 counts. 별도 native fixture를 지정하지 않은 architecture 두 항목은 SKIP이며 새 native regression PASS로 계산하지 않음 |

## Findings and Follow-up

초기 동일 버전 갱신은 Claude에서 FAIL이었다. 요청은 성공했지만 `up_to_date`를
반환했고 이전 source/hash를 유지했다. Codex의 같은 버전 갱신은 최신 바이트를
설치했다. 양쪽 동작이 같다고 가정하지 않으며 초기 실패는 E1과 상위 runtime의
별도 역사 행에 유지한다. 새 bundle마다 양쪽 manifest 버전을 함께 올리는 계약을
현재 아키텍처와 plugin README에 반영했다.

완성 ZIP은 37,634,175 bytes, SHA-256
`826091b129c90171d53a7fdabfd178e9b5439421277f8dabc6b9b1c651bfd7fb`다.
내부 package hash는 E1의 `current.packageSha256`이며 ZIP hash와 구분한다.
이 파일은 아직 private 검토용이다. 물리적 clean Windows와 실제 출시 bundle/service,
양방향 browser 승인·mixed host·C4 게이트는 active에 보존한다.

## Cleanup and Final State

자신의 helper/App Server/HTTP server는 종료됐고 local session lock은 반납됐다.
수정 파일 보존 시험의 canary와 동일 이름 skill 복사본은 disposable fixture에만 있다.
원본 verifier·사용자 로그인·운영 DB·private templates 저장소는 수정하지 않았다.
패키지 공개·운영 seed·main 승격을 수행하지 않았다.
