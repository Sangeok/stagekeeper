---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'standard'
test-levels: ['component', 'end-to-end', 'manual']
test-tools: ['node:test', 'Playwright MCP', 'scripts/rehearsals/rehearse-repository-disconnection.ts --interactive']
created-at: '2026-10-26'
completed-at: '2026-10-26'
last-executed-at: '2026-10-26T08:17:39Z'
tested-revision: 'c089b561cb6dcd02a141f43990ad401041f1eb8a'
owners: ['user:Sangeok']
related: ['docs/test-reports/completed/2026-10-23-repository-disconnection-browser.md', 'docs/test-reports/completed/2026-09-30-project-history-tab-regression.md', 'docs/architecture/repository-disconnection.md', 'docs/conventions/product-copy.md']
primary-area: 'web/connection-focus-and-shell-width'
observed-environments: ['local | Next.js 16.4.2 production build + throwaway PostgreSQL 18 | Playwright Chromium, 320/360/800/1280px | owner fixture session']
test-summary: 'pass: 연결 해제 컨트롤의 포커스 복귀와 좁은 화면 폭 회귀 — Cancel·완료·오류 뒤 포커스가 같은 저장소의 버튼으로 돌아오고, 앱 화면 18개와 공개·404 화면 9개가 320–1280px에서 가로로 넘치지 않음'
follow-up: []
---

# 연결 해제 포커스 복귀와 좁은 화면 폭

## Summary and Decision

[브라우저 인수 보고서](./2026-10-23-repository-disconnection-browser.md)의 F1과
[History 탭 보고서](./2026-09-30-project-history-tab-regression.md)의 F2를 고친 뒤 실제 build로 다시 확인했다.

- F1(포커스 유실): Cancel, 해제·재연결 완료, stale, 결과 불명 뒤 포커스가 같은 저장소의 ⋯ 또는
  **Reconnect repository** 버튼으로 돌아온다. 행이 다른 묶음으로 옮겨 새로 그려져도 같다. 오류 응답이면
  확인 창의 실행 버튼에 남는다. 요청 중 사용자가 포커스를 옮기면 끌어오지 않는다.
- F2(360px 헤더 넘침): 헤더가 프로젝트 묶음과 계정 묶음으로 접히고 긴 이름은 말줄임으로 줄어든다.
  확인 중 같은 증상의 원인 둘을 더 찾아 함께 고쳤다. 토큰 표의 `sr-only` 문장이 스크롤 영역 밖으로
  나가 Tokens 화면을 360px에서 388px로 넓혔다. 320px에서는 프로젝트 전환 메뉴가 열리면 27px 넘쳤다.

남은 관찰 2건은 아래 Findings에 둔다. 이번 변경과 무관한 문구 결함 1건과 fixture의 재현 한계 1건이다.

## Scope and Criteria

포함 범위:

- `/projects`와 프로젝트 화면 배너의 연결 해제·재연결 컨트롤 포커스
- `/projects`, `/p/new`, `/billing`, `/settings/tokens`, 프로젝트 두 개의 여섯 탭과 History Events 보기의 문서 폭
- `/`, `/login`, `/docs`와 하위 4개, 앱 안팎의 404 화면의 문서 폭(로그인·비로그인)

제외 범위:

- 다른 브라우저, 실제 OAuth 세션, 운영 환경
- 행 안 확인 영역의 Escape 닫기. 계약 요구가 없다(2026-10-23 보고서 F2).

판정 기준과 근거:

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | [architecture](../../architecture/repository-disconnection.md)의 포커스 문단(이번 변경에서 추가) | 연결 컨트롤 | 예외(사용자가 옮김·대상 없음·비활성)도 문단대로 | 각 경우의 `document.activeElement` |
| R2 | 2026-10-23 보고서 F1 재검증 조건 "같은 키보드 순서로 포커스 위치 재확인" | T1 | 원래 순서를 그대로 반복 | 단계별 포커스 대상 |
| R3 | 2026-09-30 보고서 F2, 2026-10-23 세션 관찰(360px 프로젝트 화면 가로 스크롤) | 360px | 문서 `scrollWidth`가 `clientWidth`를 넘지 않음 | 앱 화면 18개, 공개·404 화면 9개 |
| R4 | WCAG 2.2 SC 1.4.10 Reflow의 기준 폭 320 CSS px | 320px | R3과 같은 기준, 열린 메뉴 포함 | R3의 화면과 열린 메뉴 |
| R5 | [product-copy](../../conventions/product-copy.md) §4 App header | 모든 폭 | 항목과 순서는 그대로, 800px 이상은 한 줄 | 헤더 묶음 위치와 화면 |

## Test Target

- Working tree state: `c089b56`(dev `1051002` + 이 변경), 별도 worktree에서 `npm run build`
- Application/API target: 리허설의 `next start`(55438), 응답 지연·유실 proxy(55440), fixture 로그인 bridge(55439)
- Browser/runtime/device: Playwright MCP Chromium. 포커스 T1은 1280×900, 폭은 320/360/800/1280px
- Authentication and role: 리허설이 서명한 fixture owner 세션. 값은 기록하지 않았다.
- Environment limitations: proxy가 서버 액션 응답을 800ms 늦춘다. pending 관찰은 이 지연에 기댄다.

## Preconditions and Test Data

- Preconditions: `TEST_DATABASE_URL`이 일회용 PostgreSQL 18의 `stagekeeper_test_rdc_ui`를 가리키고 worktree에 `.env`가 없다.
  이 DB에는 dev의 새 마이그레이션 2개(`20261023150000_optional_github_repository_list`, `20261024020000_runner_client`)가
  없어 첫 리허설이 상세 화면 GET 500으로 멈췄다. 같은 DB에만 `prisma migrate deploy`로 적용한 뒤 다시 실행했다.
- Test data plan: 리허설의 owner·foreign 사용자, 저장소 2개(RDC Alpha, RDC Beta). 오류 경로와 긴 이름은
  scratchpad 도우미로 같은 DB의 fixture owner만 바꿨다. 오류 경로는 version을 올리지 않고 구독 플랜을
  Free로 낮췄고, 긴 이름은 47자 프로젝트 이름과 39자(GitHub 최대) 로그인이다. 전형 화면은 로그인 `octocat`으로 찍었다.
  T9는 별도 도우미가 실제 `disconnectProject`와 `registerProjectResultIn`으로 Beta를 해제하고 Pro 상한 5개까지
  저장소를 등록했다. 사용 중 프로젝트가 2개일 때 플랜만 Free로 낮춘 상태는 무효라 해제가
  "Project ownership is unavailable." 오류였다. 이 상태는 판정에 쓰지 않았다.
- Cleanup rule: 리허설의 `/finish`가 fixture와 서버를 정리하고 PostgreSQL은 `pg_ctl stop`으로 내린다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1, R2 | `required` | 2026-10-23 T1 순서를 키보드로 반복 | Cancel·해제·재연결 뒤 같은 저장소 버튼 | 다섯 지점 모두 해당 버튼, 같은 id (E1) | `PASS` |
| T2 | R1 | `required` | 플랜만 Free로 낮춘 뒤 Beta 재연결 | 오류 문장, 실행 버튼에 포커스, Cancel 뒤 Reconnect | 기대대로 (E2) | `PASS` |
| T3 | R1 | `required` | 두 탭 stale, 응답 유실 | 알림 뒤 새로 그려진 같은 저장소 버튼 | 기대대로 (E3) | `PASS` |
| T4 | R1 | `required` | 재연결 pending 중 다른 링크로 포커스 이동 | 완료 뒤에도 옮긴 곳 유지 | `New project` 유지 (E3) | `PASS` |
| T5 | R1 | `required` | 프로젝트 화면 배너의 Cancel, 재연결 | Cancel 뒤 배너 버튼. 성공 뒤 배너가 사라져 옮기지 않음 | 기대대로 (E4) | `PASS` |
| T6 | R3, R4, R5 | `required` | 화면 18개 × 320·360px, 긴 이름, 열린 메뉴 | 가로 넘침 없음, 헤더 두 줄과 말줄임 | 넘침 0건, 메뉴 124–300px (E5, E7–E9) | `PASS` |
| T7 | R5 | `required` | 화면 18개 × 800·1280px | 넘침 없음, 전형 이름이면 헤더 한 줄 | 넘침 0건. 800px 한 줄과 메뉴 208px 유지. 1280px 한 줄은 메뉴 폭만 다른 직전 build에서 확인 (E5, E10) | `PASS` |
| T8 | R3, R4 | `required` | 공개·404 화면 9개 × 320/360/800/1280px, 로그인·비로그인 | 가로 넘침 없음 | 넘침 0건 (E13) | `PASS` |
| T9 | R1 | `required` | 옛 화면의 탭에서 Beta 해제. 그사이 Beta는 해제되고 상한 5개가 다 찼음 | stale 알림, Beta의 Reconnect 비활성, 포커스를 옮기지 않음 | 기대대로, 페이지 오류 0 (E14) | `PASS` |

수정 전 기준선은 이전 build(`dc03640`)로 같은 fixture에서 먼저 측정했다. 포커스는 Cancel, 해제·재연결
완료, 배너 Cancel·재연결 뒤 모두 `BODY`였고 pending 중에도 `BODY`였다. 프로젝트 화면 6탭은 360px에서
문서 폭 382–390px였다(E6).

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | T1–T9 | `required` | `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-repository-disconnection.ts --interactive` | 자동 단계 통과 후 fixture 준비, `/finish`로 정리 | 마이그레이션 적용 뒤 "RDC real Next actions … passed", 정리 완료 | `PASS` |
| C2 | R1 | `required` | `node --import tsx --test src/fsd/features/manage-project-connection/ui/project-connection-control.test.ts` | 통과, 두 trigger id를 각각 지우면 실패 | 2/2 통과. id를 지운 두 변형은 각각 1건 실패 (E11) | `PASS` |
| C3 | 전체 | `required` | lint(FSD·server 경계 포함), `tsc --noEmit`, `docs:check`, `test:architecture`, web·server 시험, `next build` | 실패 0 | Evidence E12 | `PASS` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | focus log | Beta 링크 → Tab ⋯(trigger) → Enter 메뉴 항목 → Escape ⋯ → 확인 창 Cancel(Escape는 그대로) → Enter(Cancel) ⋯ → 해제 완료 **Reconnect repository**(Disconnected 묶음, 같은 trigger id) → 확인 창 Cancel → Reconnect → 재연결 완료 ⋯. 컨트롤 코드가 같은 직전 build의 같은 순서에서는 모든 지점이 `:focus-visible`이었다 | 본문, 만료 없음 |
| E2 | focus log | 알림 "project cap reached on the free plan (1). Upgrade the plan to add more.. Disconnect another repository first." 뒤 포커스는 확인 창의 **Reconnect repository**, Tab → Cancel, Enter → 행의 Reconnect | 본문, 만료 없음 |
| E3 | focus log·toast | 두 탭 stale: "Your project list changed. …" 뒤 Beta ⋯. 응답 유실: `POST net::ERR_EMPTY_RESPONSE`, "Couldn't confirm the result. …" 뒤 Beta Reconnect. pending 중 `New project`로 옮긴 포커스는 완료 뒤에도 유지 | 본문, 만료 없음 |
| E4 | focus log | 배너 Reconnect → Cancel → 배너 Reconnect. 재연결 성공 뒤 배너 0개, 포커스 `BODY`, Tab → 새 설정 패널의 "Claude Code" radio | 본문, 만료 없음 |
| E5 | DOM 측정 | 화면 18개(위 범위) × 320/360/800/1280px에서 `scrollWidth > clientWidth` 0건. Tokens 화면의 표 안 `sr-only` 1개가 있는 상태에서 래퍼 `position: relative`, 360px 345/345 | 본문, 만료 없음 |
| E6 | screenshot | 수정 전 360px 프로젝트 화면 헤더: 이름과 로그인이 줄바꿈되고 오른쪽으로 넘침 | [PNG](../assets/2026-10-26-connection-focus-and-narrow-width/E6-before-project-360.png), 저장소 보존 |
| E7 | screenshot | 수정 후 360px: 1행 `Stagekeeper / RDC Beta ▾`, 2행 오른쪽 정렬 `Tokens · Pro · octocat` | [PNG](../assets/2026-10-26-connection-focus-and-narrow-width/E7-after-project-360.png), 저장소 보존 |
| E8 | screenshot | 수정 후 360px, 47자 이름과 39자 로그인: 둘 다 말줄임 | [PNG](../assets/2026-10-26-connection-focus-and-narrow-width/E8-after-long-names-360.png), 저장소 보존 |
| E9 | screenshot | 수정 후 320px 열린 메뉴: 긴 이름이 줄바꿈되고 메뉴 오른쪽 끝 300px < 305px | [PNG](../assets/2026-10-26-connection-focus-and-narrow-width/E9-after-menu-320.png), 저장소 보존 |
| E10 | screenshot | 수정 후 800px: 기존과 같은 한 줄 헤더 | [PNG](../assets/2026-10-26-connection-focus-and-narrow-width/E10-after-project-800.png), 저장소 보존 |
| E11 | 변형 시험 | ⋯ 또는 Reconnect의 `id={triggerId}`를 지운 사본에서 C2가 `pass 1 / fail 1` | 본문, 만료 없음 |
| E12 | 명령 출력 | lint 0 · tsc 0 · docs:check 통과 · test:architecture 150개 중 148 통과·2 skip·실패 0 · test:web 778/778 · test:server 157개 중 155 통과·2 skip·실패 0 · build 성공 | 본문, 만료 없음 |
| E13 | DOM 측정 | `/`, `/login`, `/docs`, `/docs/getting-started`, `/docs/approval-gates`, `/docs/automation`, `/docs/security`, `/p/does-not-exist`, `/does-not-exist`를 로그인·비로그인 × 320/360/800/1280px로 열어 `scrollWidth > clientWidth` 0건. console 오류는 일부러 연 404 두 경로뿐 | 본문, 만료 없음 |
| E14 | focus log | stale 알림 "Your project list changed. …", "5 of 5 repositories connected on the Pro plan.", Beta의 **Reconnect repository** `disabled`(같은 trigger id), "No free slot. The Pro plan allows 5 connected repositories." 뒤 포커스 `BODY`, 다음 Tab은 Connected 묶음의 다음 행 링크. 페이지 오류·console 오류 0 | 본문, 만료 없음 |

- Existing failures versus new failures: 새 실패 없음. E2의 문구 결함과 응답 유실 재현 한계는 이번 변경 전부터 있었다.
- Sensitive-data review: 쿠키, 토큰, DB 접속 문자열을 기록하지 않았다. 화면의 로그인은 fixture 값과 `octocat`·가짜 39자 문자열이다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| N1 | low | 재연결 상한 오류 문장이 소문자로 시작하고 마침표가 두 번 붙는다(E2). `capError`가 이미 마침표로 끝나는 문장에 `src/server/projects/connection-service.ts`가 `. Disconnect another repository first.`를 덧붙인다. product-copy에 이 문장은 없다. 화면의 상한 표시와 서버 플랜이 version 변경 없이 어긋날 때만 보인다 | 2026-10-26 사용자에게 수정 여부 확인 | 문장 계약을 정한 뒤 같은 오류 경로 재확인 |
| N2 | informational | 응답 유실 fixture에서 Chromium이 재사용 keep-alive 연결의 빈 응답이면 같은 POST를 한 번 다시 보낸다. 그 재전송이 stale을 받아 결과 불명 대신 stale 알림이 뜬다. 서버 반영은 version 검사로 한 번이고 포커스 결과는 같다. 유휴 연결이 닫힌 뒤 실행하면 결과 불명 경로가 재현된다(E3) | 없음 | 응답 유실을 다시 볼 때 새 연결에서 실행 |

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| `stagekeeper_test_rdc_ui` | 마이그레이션 2개 적용, fixture 생성·변경 | 각 실행의 `/finish`(마이그레이션 전 실패 실행은 리허설의 `finally`)로 fixture 정리, PostgreSQL 정지 | 없음. 일회용 DB |
| 로컬 포트 55438–55440 | 리허설 서버 | 종료 확인(LISTEN 0개) | 없음 |

- Persistent audit/log side effects: 일회용 DB 안에서만 생겼다. 운영 DB와 서버는 건드리지 않았다.
- Cleanup limitations: 일회용 DB의 남은 행 수는 조회하지 않았다.

## Conclusion

- Result rationale: required 항목 T1–T9와 C1–C3이 모두 `PASS`라 전체 결과는 `pass`다.
- Remaining uncertainty: 다른 브라우저와 실제 OAuth 세션은 확인하지 않았다.
- Rerun decision: 헤더나 연결 컨트롤을 바꾸면 T1과 T6을 다시 한다.

## Review Checklist

- [x] 모든 TODO를 처리했고 무관한 예시 행과 선택 섹션을 삭제했다.
- [x] `status`, `stage`, `result`가 위치와 README의 생명주기 규칙에 맞는다.
- [x] metadata가 README의 값 규약을 따르고 `owners`, `report-kind`, `report-size`, `test-levels`, `test-tools`를 실제 범위에 맞게 채웠다.
- [x] `completed-at`, `last-executed-at`, `tested-revision`으로 대상을 다시 식별할 수 있다.
- [x] 모든 기준 ID가 실행 항목에 연결되고, 모든 Test Matrix 항목과 독립 Commands 항목에 기준 ID 또는 연결 대상, `required`/`informational` gate와 판정이 있다.
- [x] 전체 결과가 `fail > blocked > pass` 규칙으로 계산됐다.
- [x] 핵심 판정에 Evidence ID 또는 충분한 인라인 증거가 연결됐다.
- [x] 기존 실패와 신규 실패, 테스트 데이터 최종 상태를 구분했다.
- [x] 민감정보 검토를 실제 수행했고 비밀값이나 개인정보가 남지 않았다.
- [x] 발견 사항은 외부 추적 위치로 연결하고 보고서가 결함 생명주기를 대신하지 않는다.
- [x] 본문과 front matter의 revision, result, summary, follow-up이 모순되지 않는다.
- [x] front matter, Criteria, 실행 결과, Evidence, Findings와 Conclusion의 단일 기준 위치를 지켰고 같은 사실을 불필요하게 반복하지 않았다.
