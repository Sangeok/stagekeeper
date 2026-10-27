---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'standard'
test-levels: ['component', 'integration', 'end-to-end', 'manual']
test-tools: ['node:test', 'tests/server/integration on throwaway PostgreSQL 18', 'Playwright MCP', 'scripts/rehearsals/rehearse-repository-disconnection.ts --interactive / --transport-loss']
created-at: '2026-10-26'
completed-at: '2026-10-26'
last-executed-at: '2026-10-26T08:54:35Z'
tested-revision: 'e540f133beb0c71db72cd7211f89dff2ffff975b'
owners: ['user:Sangeok']
related: ['docs/test-reports/completed/2026-10-26-connection-focus-and-narrow-width.md', 'docs/conventions/product-copy.md', 'docs/architecture/repository-disconnection.md', 'docs/architecture/verification.md']
primary-area: 'projects/repository-disconnection'
observed-environments: ['local | Next.js 16.4.2 production build + throwaway PostgreSQL 18 | Playwright Chromium, 1280px | owner fixture session']
test-summary: 'pass: 재연결 상한 오류 문장과 응답 유실 fixture — 서버 상한 거부가 "No free slot … Disconnect another repository first."로 보이고, 응답 유실이 매번 결과 불명 경로를 탐'
follow-up: []
---

# 재연결 상한 오류 문장과 응답 유실 fixture

## Summary and Decision

[포커스·폭 보고서](./2026-10-26-connection-focus-and-narrow-width.md)의 N1과 N2를 고친 뒤 확인했다.

- N1: 서버가 재연결을 상한으로 거부하면 확인 창에
  `No free slot. The Free plan allows 1 connected repository. Disconnect another repository first.`가 보인다.
  예전 문장은 `project cap reached on the free plan (1). Upgrade the plan to add more.. Disconnect another repository first.`였다.
  서버는 플랜과 상한만 돌려주고, feature가 비활성 Reconnect 옆 문장과 같은 함수로 문장을 만든다.
  문구는 product-copy에 적었다.
- N2: 리허설 proxy가 응답마다 연결을 닫는다. 페이지를 막 연 직후처럼 연결이 살아 있을 때 응답을 잃어도
  세 번 모두 결과 불명 경로였다. `--transport-loss` 자동 단계도 그대로 통과했다.

## Scope and Criteria

포함 범위: 재연결 상한 거부의 결과 모양과 화면 문장, 응답 유실 fixture의 재현성.
제외 범위: 다른 브라우저, 실제 OAuth 세션, 운영 환경.

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| --- | --- | --- | --- | --- |
| R1 | [product-copy](../../conventions/product-copy.md)의 연결 절 "Server cap on reconnect" 줄(이번 변경에서 추가) | 재연결 상한 거부 | 글자 단위 | 단위 시험, 서비스 결과, 화면 alert |
| R2 | 포커스·폭 보고서 N2 재검증 조건 "응답 유실을 다시 볼 때 새 연결에서 실행"을 fixture가 보장 | `--interactive` 응답 유실 | 연결이 살아 있을 직후에도 결과 불명 | toast, 실패한 요청, 반복 |
| R3 | [verification.md](../../architecture/verification.md)의 리허설 행 | 기존 자동 단계 | 바뀐 proxy로도 그대로 통과 | `--interactive`·`--transport-loss` 출력 |

## Test Target

- Working tree state: `e540f13`(dev `a4572b2` + 이 변경), 별도 worktree에서 `npm ci`·`npm run build`
- Application/API target: 리허설의 `next start`(55438), 응답 지연·유실 proxy(55440), fixture 로그인 bridge(55439)
- Browser/runtime/device: Playwright MCP Chromium, 1280×900
- Authentication and role: 리허설이 서명한 fixture owner 세션. 값은 기록하지 않았다.

## Preconditions and Test Data

- Preconditions: `TEST_DATABASE_URL`이 일회용 PostgreSQL 18의 `stagekeeper_test_rdc_ui`를 가리키고 worktree에 `.env`가 없다.
  `prisma migrate status`는 최신이었다.
- Test data plan: 리허설의 owner·foreign 사용자와 저장소 2개. 상한 거부는 Beta를 해제한 화면을 연 채
  scratchpad 도우미로 같은 DB의 구독 플랜만 Free로 낮춰 만들었다(version 변경 없음).
- Cleanup rule: 리허설의 `/finish`가 fixture와 서버를 정리하고 PostgreSQL은 `pg_ctl stop`으로 내린다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | `reconnectCapReason` 단위 시험 | Free 1개 단수, Pro 5개 복수 문장 | 두 문장 글자 일치 (E1) | `PASS` |
| T2 | R1 | `required` | 서비스 단위 시험과 실제 PostgreSQL 통합 시험의 상한 거부 | `{ status: "error", code: "capped", plan: "free", limit: 1 }`, 상태 불변 | 기대대로 (E1, E2) | `PASS` |
| T3 | R1 | `required` | Pro로 연 화면에서 플랜만 Free로 낮춘 뒤 Beta 재연결 | 확인 창 alert에 새 문장, 실행 버튼에 포커스 | 기대대로 (E3) | `PASS` |
| T4 | R2 | `required` | 페이지를 연 직후 응답 유실을 걸고 해제·재연결 3회 | 매번 결과 불명 알림과 `ERR_EMPTY_RESPONSE`, 재전송 없음 | 3회 모두 기대대로 (E4) | `PASS` |
| T5 | R3 | `required` | `--transport-loss`와 `--interactive` 자동 단계 | 기존 출력 그대로 통과 | 기대대로 (E5) | `PASS` |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | 전체 | `required` | lint(FSD·server 경계 포함), `tsc --noEmit`, `docs:check`, `test:architecture`, web·server 시험, 통합 시험 2개 파일, `next build` | 실패 0 | Evidence E6 | `PASS` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | 시험 출력 | `project-connection-state.test.ts`와 `connection-service.test.ts` 10/10 통과. 새 시험은 "No free slot. The Free plan allows 1 connected repository. Disconnect another repository first."와 Pro 5개 복수형을 고정 | 본문, 만료 없음 |
| E2 | 시험 출력 | `tests/server/integration/project-connection.test.ts`, `token-management.test.ts`를 실제 PostgreSQL에서 12/12 통과. 상한 거부 결과를 deepEqual로 확인 | 본문, 만료 없음 |
| E3 | screenshot·focus log | alert "No free slot. The Free plan allows 1 connected repository. Disconnect another repository first.", 포커스는 확인 창의 **Reconnect repository** | [PNG](../assets/2026-10-26-reconnect-cap-message/E3-cap-message.png), 저장소 보존 |
| E4 | toast·network | 해제·재연결·해제 3회 모두 "Couldn't confirm the result. …"와 `POST net::ERR_EMPTY_RESPONSE`, 포커스는 같은 저장소의 새 버튼. proxy 직접 응답의 `connection` 헤더는 `close`. 헤더가 다른 응답은 브라우저 캐시에서 온 정적 파일뿐 | 본문, 만료 없음 |
| E5 | 명령 출력 | "RDC transport loss: commit/event once, stale replay, … passed.", "RDC real Next actions: owner/foreign/no-session/bearer/spoof/stale passed …" | 본문, 만료 없음 |
| E6 | 명령 출력 | lint 0(기존 Codex 파일 경고 1건) · tsc 0 · docs:check 통과 · test:architecture 150개 중 148 통과·2 skip · test:web 779/779 · test:server 157개 중 155 통과·2 skip · build 성공 | 본문, 만료 없음 |

- Existing failures versus new failures: 새 실패 없음.
- Sensitive-data review: 쿠키, 토큰, DB 접속 문자열을 기록하지 않았다.

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| O1 | informational | 상한 거부 alert 위의 확인 창 문장은 화면을 연 때의 값("1 / 5 connected")을 그대로 보인다(E3). 오류 응답은 화면을 새로 고치지 않는 기존 계약이고 예전 문장에서도 같았다. 플랜이 version 변경 없이 바뀐 경우에만 생긴다 | 없음 | 없음 |

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| `stagekeeper_test_rdc_ui` | 리허설 fixture 생성·변경, 통합 시험 fixture | 각 실행의 `/finish`와 시험의 cleanup, PostgreSQL 정지 | 없음. 일회용 DB |
| 로컬 포트 55438–55440 | 리허설 서버 | 종료 확인(LISTEN 0개) | 없음 |

- Persistent audit/log side effects: 일회용 DB 안에서만 생겼다. 운영 DB와 서버는 건드리지 않았다.
- Cleanup limitations: 일회용 DB의 남은 행 수는 조회하지 않았다.

## Conclusion

- Result rationale: required 항목 T1–T5와 C1이 모두 `PASS`라 전체 결과는 `pass`다.
- Remaining uncertainty: 다른 브라우저와 실제 OAuth 세션은 확인하지 않았다.
- Rerun decision: 연결 상한 판정이나 확인 창 문구를 바꾸면 T1–T3을 다시 한다.

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
