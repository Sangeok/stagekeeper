---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static","component","contract"]
test-tools: ["Node test runner","TypeScript","ESLint","Next production build","headless Microsoft Edge"]
created-at: "2026-10-04"
completed-at: "2026-10-04"
last-executed-at: "2026-10-04T05:02:22Z"
tested-revision: "e3548546076f279ddbf1e22e2a5ec563fd0a6e9e"
owners: ["user:Sangeok"]
related: ["docs/proposals/completed/2026-10-04-codex-dual-client-support.md","docs/conventions/product-copy.md"]
primary-area: "frontend/dual-client"
observed-environments: ["local | isolated React fixture | Node.js/Windows/headless Edge | synthetic tokens"]
test-summary: "pass: owner Codex connection and shared TurnBanner selection implemented and verified"
follow-up: ["docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
---

# Dual-client의 남은 두 UI 요구사항 구현 인수

## Summary and Decision

OwnerTokenReveal에 Codex 선택과 실제 owner MCP 등록 Copy를 추가했다.
TurnBanner가 프로젝트 단위 선택 상태를 소유하여 setup/next 및 탭 이동에서
같은 선택을 사용한다. 두 코드 작업은 완료됐으며 이 보고서의 PASS는 해당 UI 범위다.
Codex 실제 모델·양방향 전체 주기·private 배포 인수는 active runtime 보고서에 남는다.

## Scope and Criteria

| 기준 ID | 근거 | 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | dual-client proposal REQ-DUAL-015, §9 | OwnerTokenReveal | MUST | Claude 기본 안내, Codex owner endpoint/환경 변수 참조, 표시·Copy 일치 |
| R2 | 같은 §9 | TurnBanner | MUST | setup/next 선택 공유, 같은 프로젝트 탭 유지, slug 변경 초기화 |
| R3 | CON-DUAL-005, product-copy.md | 공개·등록 분리 및 회귀 | MUST | 등록 payload는 token-free, 선택에 mutation 없음, 기존 잠금/서버 판정 유지 |

실제 MCP 등록, 모델 호출, DB migration/seed, private template 변경, C4 watch는 이번 실행 범위 밖이다.

## Test Target

별도 `harness/codex-dual-client-ui` worktree의 위 source commit을 검증했다.
React fixture는 실제 UI 컴포넌트를 mount하고 pathname context 및 action/clipboard
외부 경계만 대체한다. production route·사용자 전역 MCP 설정은 사용하지 않는다.
전체 Next build는 접근할 수 없는 fixture DB URL로 실행하며 DB에 연결하지 않는다.

## Preconditions and Test Data

합성 hs_/hu_/ho_ 값과 두 owner URL을 사용했다. fixture가 소유한 root와
clipboard double을 정리하고 `/finish`로 HTTP listener를 종료했다.
임시 node_modules junction은 Turbopack root 밖이라 첫 build가 실패했다.
lockfile의 독립 의존성을 offline 설치하고, Prisma 사용자 캐시는 승인된 일반
사용자 권한으로 읽어 기본 `npm run build`가 통과했다. 제품 config 변경은 없다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1/R3 | required | helper·render/copy-lock tests | owner 이름/URL/변수 정확, shell-sensitive URL 안전, Claude 기본 유지 | 통과; E1/E4 | PASS |
| T2 | R1/R3 | required | 실제 owner radio/Copy | Codex 표시와 clipboard 동일, token-free 등록, 선택 mutation 0 | 통과; E2 | PASS |
| T3 | R1 | required | owner token/URL identity 변경 | Claude 초기화, 재선택 시 새 URL 사용 | 통과; E2 | PASS |
| T4 | R2/R3 | required | setup 표시와 서버 모델 비교 | client별 init·inline Code, deriveTurn 입력/판정 불변 | 통과; E1 | PASS |
| T5 | R2/R3 | required | 실제 setup↔work·board/inbox/compact·slug 변경 | 선택 유지·프로젝트 변경 초기화·Copy 일치·Codex watch 미표시 | 통과; E2 | PASS |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령 | 결과·증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| C1 | R1~R3 | required | `npm run verify:fsd`, `npm run test:architecture`, `npm run check` | plugin byte check/FSD/lint/TypeScript/architecture 26/availability 통과; E3 | PASS |
| C2 | R1~R3 | required | `npm run test:web`, `npm test` | web 559/559, core/plugin 286/286; E3 | PASS |
| C3 | R1~R3 | required | `npm run build` | Prisma generate 및 기본 Turbopack production build exit 0; E3 | PASS |
| C4 | R1~R3 | required | `node --import tsx scripts/rehearse-src-clean-code.ts --ui-only` + 허용된 headless Edge | 실제 브라우저 28/28, 신규 세 시나리오 포함; E2 | PASS |
| C5 | R1 | required | `codex.cmd --version`, `codex.cmd mcp add --help` | 0.160.0에서 url/bearer-token-env-var 인수 존재; 등록 실행 없음; E4 | PASS |
| C6 | R3 | required | strict proposal trace, active runtime report validate-only, `git diff --check` | 요구사항 phase/task·verifier 20/20, report 구조 PASS·제품 판정 미확정 유지, whitespace 통과; E5 | PASS |

## Evidence Registry

| ID | 종류 | 보존 근거 |
| --- | --- | --- |
| E1 | unit/render | connect-command.test.ts, token-reveal.test.ts, setup-detail.test.ts, turn-banner.test.ts, 기존 next-step tests |
| E2 | DOM/event/clipboard | [정제한 28개 결과](../assets/2026-10-04-codex-dual-client-ui/browser-results.json); 실제 renderer/검사: tests/server/fixtures/src-clean-code-browser.tsx 및 src-clean-code-acceptance.ts |
| E3 | 회귀 게이트 | 로컬 check/web/core/build 명령 exit 0. 전체 로그는 task Temp 경로에 있으며 credential 없이 실행 |
| E4 | CLI 계약 | Codex 0.160.0의 실제 help; owner command는 URL과 환경 변수 이름만 직렬화 |
| E5 | 문서 read-back | `validate_sdd_traceability.py --strict` exit 0; `rehearse-dual-client-runtime.ts --validate-report-only` exit 0. clean readiness나 전체 제품 PASS를 뜻하지 않음 |

## Findings and Follow-up

첫 render test의 Board URL을 잘못된 `/p/alpha/board`로 설정해 compact banner를
검사한 실패가 있었다. 실제 route builder와 일치하는 `/p/alpha`로 고친 뒤
전체 web suite 및 브라우저 시나리오가 통과했다.

이 UI follow-up은 role 권한 격리·실제 승인 후 두 CLI 전체 주기·제품 package/
private template 배포·혼합 host 취소의 미실행 gate를 해제하지 않는다.

## Test Data and Cleanup

실제 token, owner credential, 사용자 auth store, 전역 MCP 등록은 사용하지 않았다.
fixture `/finish` 후 listener를 닫았고 clipboard 및 React root를 정리했다.
task 전용 Edge profile·정제 전 로컬 로그는 Temp에 남으며 정제 결과만 commit한다.

## Conclusion

남은 두 UI 코드 요구사항의 구현·회귀 인수는 PASS다. source completion과
Codex 제품 전체 지원 인증을 구분하며 전체 proposal/runtime report는 blocked를 유지한다.

## Review Checklist

- [x] source revision과 UI 실행 범위를 고정했다.
- [x] 실제 컴포넌트의 event·Copy·identity reset을 검증했다.
- [x] 기존 Claude copy-lock 및 서버 판정을 유지했다.
- [x] 정제 결과만 보존하고 모델·DB·배포 미실행을 구분했다.
