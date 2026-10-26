---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'acceptance'
report-size: 'standard'
test-levels: ['end-to-end', 'manual']
test-tools: ['Playwright MCP', 'scripts/rehearsals/rehearse-repository-disconnection.ts --interactive', 'read-only PostgreSQL query']
created-at: '2026-10-23'
completed-at: '2026-10-23'
last-executed-at: '2026-10-23T07:42:30Z'
tested-revision: 'dc03640b7b097c11ba98b39609d33609b6388754'
owners: ['user:Sangeok']
related: ['docs/test-reports/completed/2026-10-23-repository-disconnection.md', 'docs/architecture/repository-disconnection.md', 'docs/conventions/product-copy.md']
primary-area: 'projects/repository-disconnection'
observed-environments: ['local | Next.js 16.4.2 production build + throwaway PostgreSQL 18 | Playwright Chromium, 1280px | owner fixture session']
test-summary: 'pass: 저장소 연결 해제 브라우저 인수 — 키보드 조작, pending, 두 탭 stale, 응답 유실 후 화면 갱신이 계약대로 동작하고 자동 재전송이 없음'
follow-up: []
---

# 저장소 연결 해제 — 브라우저 인수

## Summary and Decision

[최초 검증 보고서](./2026-10-23-repository-disconnection.md)에서 브라우저가 없어 **NOT RUN**으로 남은 화면 인수를
실제 브라우저로 실행했다. 키보드 조작, pending 화면, 두 탭 stale, 응답 유실 뒤 화면 갱신이 모두
[product-copy](../../conventions/product-copy.md)의 연결 계약과 같았고, stale·응답 유실 뒤 자동 재전송은 없었다.
계약에 없는 키보드 포커스 복귀 1건을 낮은 심각도의 발견 사항으로 남긴다. 실제 `/harness:init` 거부 인수는
이 보고서의 범위가 아니며 최초 보고서의 **NOT RUN** 그대로다.

## Scope and Criteria

포함 범위:

- `/projects`의 연결 해제·재연결 컨트롤을 키보드만으로 조작
- 서버 액션 응답 지연 중 pending 화면
- 같은 세션의 두 탭에서 오래된 화면으로 해제를 시도한 경우
- 커밋된 서버 액션의 응답이 유실된 경우

제외 범위:

- 실제 `/harness:init` 세션의 거부 note 뒤 중단 확인. 플러그인 MCP 설정을 로컬 서버로 바꿔야 해서 실행하지 않았다.
- 운영 환경, 실제 GitHub OAuth 로그인, 다른 브라우저

판정 기준과 근거:

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | product-copy "Connected rows keep disconnect in a ⋯ menu …" | 메뉴·확인 창·재연결 | 문구는 글자 단위로 대조 | 접근성 이름, 확인 문구, 버튼, 하단 안내 |
| R2 | product-copy "Pending is **Updating…**" | 해제·재연결 | 응답 전까지 중복 조작 불가 | "Updating…"과 버튼 비활성 |
| R3 | product-copy Stale 문구와 "Both close confirmation and refresh; neither resubmits automatically" | 두 탭 | 서버 기록으로 재전송 여부 확인 | 문구, 확인 창 닫힘, 최신 상태, 이벤트 수 |
| R4 | product-copy Unknown response 문구와 같은 규칙 | 응답 유실 | 서버 기록으로 재전송 여부 확인 | 문구, 확인 창 닫힘, 커밋된 상태, 이벤트 수 |
| R5 | [architecture](../../architecture/repository-disconnection.md) "stale/결과 불명에서는 확인 창을 닫고 로컬 상태를 버린 뒤 refresh" | R3·R4 | R3·R4와 같은 확인 | 위와 같음 |

## Test Target

- Working tree state: `dev` `dc03640` clean, 별도 worktree에서 `npm ci` 후 `npm run build`
- Application/API target: `next start`(127.0.0.1:55438), 리허설의 응답 지연·유실 proxy(55440), fixture 로그인 bridge(55439)
- Browser/runtime/device: Playwright MCP Chromium, 1280×900
- Authentication and role: 리허설이 서명한 fixture owner 세션. 값은 기록하지 않았다.
- Feature flags/configuration: 없음. 연결 스위치는 2026-10-01에 제거됐다.
- Environment limitations: proxy가 모든 서버 액션 응답을 800ms 늦춘다. pending 관찰은 이 지연에 기댄다.

## Preconditions and Test Data

- Preconditions: `TEST_DATABASE_URL`이 일회용 PostgreSQL 18의 `stagekeeper_test_rdc_ui`를 가리키고, 작업 트리에 `.env`가 없다.
- Test data plan: 리허설이 만든 owner·foreign 사용자, 연결된 저장소 2개(RDC Alpha, RDC Beta), 보존 이력 55개
- Cleanup rule: 리허설의 `/finish`가 fixture와 서버를 정리하고, PostgreSQL은 `pg_ctl stop`으로 내린다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | 키보드만으로 메뉴 열기·닫기, 확인 창 열기, 해제, 재연결 | Tab 순서로 ⋯ 도달, Enter로 메뉴, Escape로 닫힘, 계약 문구, 해제·재연결 완료 | 계약대로 동작 (E1, E2) | `PASS` |
| T2 | R2 | `required` | 해제와 재연결 중 화면 기록 | "Updating…", 두 버튼과 해당 행 ⋯ 비활성 | 약 0.9초 동안 계약대로 (E3) | `PASS` |
| T3 | R3, R5 | `required` | 탭 A에서 Beta 해제 뒤, 옛 화면의 탭 B에서 Beta 해제 | stale 문구, 확인 창 닫힘, 최신 상태 표시, 서버 쓰기 없음 | 계약대로, 해제 이벤트는 탭 A의 1건만 (E4, E6) | `PASS` |
| T4 | R4, R5 | `required` | 응답 유실을 건 뒤 탭 B에서 Beta 재연결 | unknown 문구, 확인 창 닫힘, 커밋된 상태 표시, 재전송 없음 | 계약대로, 재연결 이벤트 정확히 1건 (E5, E6) | `PASS` |

### Scenario Details

#### T1 — 키보드 조작

- Steps: Beta 링크에 포커스 → Tab → Enter → Escape → Enter → Enter(메뉴 항목) → Escape → Enter(Cancel) → 다시 열어 Shift+Tab → Enter(해제) → Tab으로 "Reconnect repository" → Enter → Shift+Tab → Enter(재연결)
- Read-back: 포커스 대상의 `aria-label`·`aria-expanded`, 확인 영역의 문구와 버튼, 완료 알림과 묶음 제목

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | T1–T4 | `required` | `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-repository-disconnection.ts --interactive` | 자동 단계 통과 후 fixture 준비, `/finish` 뒤 종료 코드 0 | "RDC real Next actions … passed", 종료 코드 0 (E7) | `PASS` |
| C2 | T3, T4 | `informational` | `ProjectAvailabilityEvent`의 `disconnect-project`·`reconnect-project` 건수 조회 | 사용자 조작 수와 같음 | E6 | `PASS` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | UI | Tab 뒤 포커스 `More actions for RDC Beta`(`aria-haspopup="menu"`). Enter 뒤 `aria-expanded="true"`, 포커스 `menuitem "Disconnect repository…"`. Escape 뒤 메뉴 닫힘, 포커스 ⋯로 복귀 | 이 보고서 |
| E2 | UI | 확인 영역 `region "Disconnect repository"`: "Disconnect rdc-fixture/beta?", "Project tokens (hs_/ho_) are revoked. Your data stays readable, and hu_ keeps working.", 버튼 "Disconnect repository"/"Cancel"(초기 포커스 Cancel), "New requests stop. Approved ones may finish, and local Claude Code keeps running." 해제 뒤 "Repository disconnected", 묶음 "Connected"/"Disconnected", "Disconnected 2026-10-23", "1 of 5 repositories connected on the Pro plan." 재연결 확인 문구 "1 / 5 connected. Reconnect this project with its preserved data and settings. Your user token (hu_) still works; project tokens (hs_/ho_) must be issued again." 뒤 "Repository reconnected", 묶음 제목 사라짐 | 이 보고서 |
| E3 | UI(MutationObserver) | 해제: +526ms "Updating…(disabled)", "Cancel(disabled)", Beta ⋯ disabled, Alpha ⋯ 활성 → +1426ms 알림 → +1430ms Disconnected 묶음. 재연결도 같은 순서(+528ms → +1415ms) | 이 보고서 |
| E4 | UI | 탭 B: +545ms "Updating…" → +1419ms "Your project list changed. Review the latest connection details and try again." → +1468ms 확인 창 닫힘, "1 of 5", Beta "Disconnected 2026-10-23 · Reconnect repository" | 이 보고서 |
| E5 | UI·console | +1429ms "Couldn't confirm the result. Refresh to check the latest repository connection." → +1476ms 확인 창 닫힘, "2 of 5", Beta 연결됨. console 오류는 fixture가 끊은 응답의 `net::ERR_EMPTY_RESPONSE` 1건뿐 | 이 보고서 |
| E6 | read-back | 이벤트 수: 시작 전 해제 2·재연결 2(리허설 자동 단계 1쌍 + T1 1쌍) → T3 뒤 해제 3·재연결 2 → T4 뒤 해제 3·재연결 3 | 이 보고서 |
| E7 | log | 리허설 출력 "RDC UI fixture ready …", "RDC real Next actions: owner/foreign/no-session/bearer/spoof/stale passed …" | 이 보고서 |

- Existing failures versus new failures: 기존 실패 없음. 아래 F1은 계약 밖의 접근성 관찰이다.
- Sensitive-data review: 세션 쿠키, 토큰, DB 접속 문자열을 기록하지 않았다. fixture 사용자·프로젝트 이름만 남겼다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | low | 확인 창에서 Cancel을 누르거나 해제·재연결이 끝나면 포커스가 `BODY`로 빠진다. 메뉴의 Escape(`closeMenu`)는 ⋯로 포커스를 돌려주지만 확인 창의 `reset`은 돌려주지 않는다(`src/fsd/features/manage-project-connection/ui/project-connection-control.tsx`). 계약 문서에는 포커스 규칙이 없다 (E1, E2) | 2026-10-23 사용자에게 수정 여부 확인. 2026-10-26 수정·재확인: [후속 보고서](./2026-10-26-connection-focus-and-narrow-width.md) | 수정 시 같은 키보드 순서로 포커스 위치 재확인 |
| F2 | informational | 행 안 확인 영역은 dialog가 아니며 Escape로 닫히지 않는다. 계약에 Escape 요구는 없다 | 없음 | 없음 |

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| `stagekeeper_test_rdc_ui` | 리허설 fixture 생성, 해제·재연결 이벤트 추가 | `/finish`로 fixture 정리, PostgreSQL 정지 | 없음. 일회용 DB |
| 로컬 포트 55438–55440 | 리허설 서버 | 종료 확인(LISTEN 0개) | 없음 |

- Persistent audit/log side effects: 일회용 DB 안에서만 생겼다. 운영 DB와 서버는 건드리지 않았다.
- Cleanup limitations: 없음

## Conclusion

- Result rationale: required 항목 T1–T4와 C1이 모두 `PASS`라 전체 결과는 `pass`다.
- Remaining uncertainty: 다른 브라우저와 실제 OAuth 세션은 확인하지 않았다. `/harness:init` 거부 인수는 최초 보고서의 **NOT RUN**으로 남는다.
- Rerun decision: F1을 고치면 T1의 포커스 확인만 다시 한다.

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
