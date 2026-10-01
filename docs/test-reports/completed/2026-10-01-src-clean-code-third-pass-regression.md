---
status: 'completed'
stage: null
result: 'pass'
report-kind: 'regression'
report-size: 'standard'
test-levels: ['static', 'component', 'integration', 'contract', 'end-to-end', 'manual']
test-tools: ['npm scripts', 'Node test runner', 'TypeScript', 'PostgreSQL', 'Playwright MCP']
created-at: '2026-10-01'
completed-at: '2026-10-01'
last-executed-at: '2026-10-01T04:48:39Z'
tested-revision: '02f86cbe1502508c1701c544bb229803e2c3ba69 + working tree harness/src-clean-code-third-pass'
owners: ['user:Sangeok']
related: ['docs/proposals/completed/2026-10-01-src-clean-code-third-pass.md', 'docs/architecture/verification.md', 'docs/conventions/product-copy.md', 'docs/architecture/protocol.md']
primary-area: 'frontend/src-clean-code'
observed-environments: ['local | Next production + isolated UI fixture | Windows/Chromium | project owner', 'local | REST/MCP/services | PostgreSQL | fixture owners and unauthenticated callers']
test-summary: 'pass: SRC-01~SRC-10과 B-01~B-07 회귀 검증 — 등록 입력·승인 실패 의미·RSC 경계·복사 상태 보정 및 기존 권한/CAS 보존'
follow-up: []
---

# src 클린코드 3차 구현 회귀 인수

## Summary and Decision

제안서의 10건을 구현하고 오류 경로를 포함한 인수를 수행했다. 구현 전 대조 기록의 미래 계획과
이번 실행 결과를 분리한다. 코드는 작업 브랜치의 미커밋 변경이며 커밋·PR·배포 판정은 포함하지 않는다.
다섯 독립 관점과 별도 중립 게이트의 구현 후 리뷰는 **Full applicable-lens review**, 추가 채택 발견 0건이다.

## Scope and Criteria

| 기준 ID | 근거 | 범위·확인 기준 |
| --- | --- | --- |
| R1 | proposal SRC-01~SRC-10 | 아래 구현 연결표의 타입·입력·응답·표시·비동기 계약 |
| R2 | proposal B-01~B-07 | 실제 표면의 실패/성공 body, 원장·cursor, 재조회와 무쓰기 |
| R3 | AGENTS.md, architecture/verification.md | FSD·lint·타입·회귀·빌드 및 fresh manifest |
| R4 | protocol.md, product-copy.md §12/§13/§17 | 정상 owner 응답·도구 description 전체·advice 오류·중립 fallback |

운영 DB·배포·기존 malformed slug 보정·권한 확대·스키마 변경은 범위 밖이다.
현재 accepted architecture와 canonical 문구를 기준으로 구현하며 proposal의 과거 readiness 기록을
실행 통과의 증거로 사용하지 않는다.

| 구현 | 변경과 실행 연결 |
| --- | --- |
| SRC-01 | `transitions.d.mts`에 8개 값 export/7개 kind/optional rule flag 선언. UI/server 중복 타입·단언 제거. `agents/next.ts`는 좁아진 STATUSES 타입에 맞춰 arbitrary string 비교를 `some`으로 유지. export parity·전체 actor/status matrix·타입 검사 |
| SRC-02 | propose-item Evidence의 `maxLength`를 기존 `FIELD_BUDGET`으로 연결. core text boundary와 기존 폼 렌더 시험 |
| SRC-03 | 같은 page model의 `readHistoryQuery`, public API와 route 연결. scalar/array/blank/legacy/default·독립 cursor 시험 및 실제 History GET |
| SRC-04 | Inbox Server wrapper/content, Client approve/reject leaf, server public API. fresh Client/Action manifest·HTML/RSC·실제 카드 실패/복구 |
| SRC-05 | 공통 gate는 저장 row만 반환. owner adapter만 확인된 성공 뒤 실제 advice 조회. precommit/unknown-commit 원래 예외 유지. 실제 gate 함수·웹 action·owner serializer/metadata 시험 |
| SRC-06 | URL/picker/direct 선택을 discriminated state로 소유. 현재 입력의 FormData·편집/접기/reset·pending·실제 Next 등록 |
| SRC-07 | 카드 fallback을 원인 중립 문구로 변경. canonical §17 렌더 일치와 retired literal/JSX apostrophe 가드 |
| SRC-08 | 인증 뒤, transaction 전에 명시적 slug 형식·예약어 검사. 실제 POST·DB 무쓰기, 정상/선택 입력·기존 status/body 보존 |
| SRC-09 | actor label Map의 own lookup. constructor와 복수 보고의 문서/History 링크·순서·목적 표시 시험 |
| SRC-10 | clicked text에 성공 상태 연결, ref로 동시 쓰기 방지, pending/finally/failure retry. 실제 DOM·세 token reveal/세 발급 form·명령 갱신 |

## Test Target

변경한 production 파일은 `src`/`packages`의 23개다. 기준 commit 대비 modified와 untracked 중
`.test.ts`/`.test.mjs`를 제외하고 경로를 정렬한 뒤 각 `path + NUL + SHA256(file bytes)`를 LF로
연결해 SHA256을 계산한 값은 `f176af6789ac4210d293e4054cf073a2ea330cdf46ffb00279e04fa2367d0762`다.
새 시험·리허설과 protocol/copy/검증 문서도 같은 working tree에서 실행했다.

Next 16.3.3/React 19.2.8/TypeScript 5.9.3과 설치된 Next guide를 사용했다. Next는 fresh production
build를 loopback에서 실행했다. UI fixture는 실제 컴포넌트를 React DOM에 mount하고 action/clipboard만
통제한다. fixture의 Link는 일반 anchor다. 실제 bound Server Action·등록·인가·RSC 검사는 별도로
실제 Next route에서 수행했다. production package/config/flag 변경은 없다.

## Preconditions and Test Data

별도 local PostgreSQL cluster와 `stagekeeper_test_src_clean_code`를 만들었다. 기존 URL과 다른
host/port/database인지 기존 integration guard로 확인한 뒤 child process의 DB URL만 지정했다.
`.env`는 수정하지 않았다. 각 시험이 만든 사용자·프로젝트·credential·원장만 정리한다.

리허설은 `scripts/rehearse-src-clean-code.ts`와 `tests/server/fixtures/src-clean-code-browser.tsx`를 사용한다.
실행/종료/오류 계측 절차는 architecture/verification.md에 있다. `/owner`로 로그인한 fixture 소유자의
실제 `/p/new` 및 Inbox를 시험한다. form fixture의 submit double을 실제 DB 등록 증거로 대체하지 않는다.

## Test Matrix

| ID | 기준 | Gate | 실제 결과 및 증거 | 판정 |
| --- | --- | --- | --- | --- |
| B-01 | R1/R2 | required | E1: A→blank/invalid에서 named owner/repo가 모두 빈 값이고 submit disabled. 빈 URL Edit→direct→Collapse→URL B, custom slug/branch 보존, picker 재선택/reset, 실제 FormData. pending submit 1회, created/existing/disconnected 결과의 actual slug·token 유무. 실제 Next에서 A 무효→B 등록 created, 같은 B 재등록 existing | PASS |
| B-02 | R1/R2 | required | E2: actual service/POST invalid 예약어·slash·uppercase·1/41자·내부 공백 400 JSON error, transaction double 0회. 실제 DB에서 신규/기존 repo 모두 Project/token/version/event 무변경. trim 2/40자·slash branch 201, 같은 repo 200 기존 slug 유지. 기존 연결 해제/플랜/인증 통합 시험 통과 | PASS |
| B-03 | R1/R2/R4 | required | E3: actual createBoardQueries gate 성공 event/cursor 1회, precommit 0회, commit 확인 유실 seam 원래 예외와 저장 사실 유지. web advice 0회, 확인 성공만 세 경로 revalidate. owner 정상 full saved row+real next; advice만 실패 시 canonical reason/isError, 재승인 없음. 실제 등록 metadata 전체와 canonical §13 owner 행 동등 | PASS |
| B-04 | R2 | required | E4: 실제 PostgreSQL의 기존 owner/plan/CAS/gateEntry/plan validation/rollback 시험 통과. 실제 Next에서 검증 기록 없는 before-implement 승인 implementing. 동일 요청 재전송은 stale gate entry, 추가 원장 0회 | PASS |
| B-05 | R1/R2/R4 | required | E5: fresh manifest, actual Inbox HTML/RSC content. A server content 오류·A Client render 오류·transition 요청 실패/커밋 후 응답 유실에 A만 fallback, B 유지. wrapper/loader는 parent route error. 해제 뒤 retry는 최신 GET, POST 수 증가 0회. read-only controls 숨김, hold note/클릭 날짜·bounce·resume·독립 pending 보존 | PASS |
| B-06 | R1/R2 | required | E6: actual CopyButton DOM A success→B Copy, A pending→B late success Copy, 중복 click write 1회, rejection→retry, pending unmount. hs/hu/ho reveal와 next command의 같은 instance text 변경, 간접 발급 3개 form의 reveal 복사. token plaintext console 0회 | PASS |
| B-07 | R1/R2 | required | E7: 8 runtime export/declaration parity와 3 actor×6×6 kind 집합 동등. History query/cursor와 constructor/복수 report body/link 시험. 실제 Next 7 owner 상세 route·History mode/cursor GET가 DB 무쓰기, foreign/무세션 거부 | PASS |

### Scenario Details

E5의 server content/wrapper/loader 오류는 source가 아닌 generated server chunk의 해당 함수만
일시 계측했다. 실제 content는 JSX child 위치를 유지했으며 종료 시 원본 bytes로 복원했다.
Client render 오류는 브라우저에 보내는 해당 Client leaf module 응답만 일시 계측하고 route handler를
해제했다. 마지막에는 계측이 없는 fresh build와 두 manifest 검사를 다시 통과했다.

loopback proxy는 action을 upstream 이전에 끊거나 실제 upstream 처리가 끝난 뒤 응답을 끊었다.
Chromium의 자동 wire 재시도도 전부 끊어 카드 fallback을 관찰했다. 응답 유실에서도 승인 event는
1회였으며, 오류를 해제한 후 **사용자 retry 버튼**은 action 요청을 늘리지 않았다.
commit 결과 불명은 actual gate 함수의 transaction acknowledgment seam과 web action 전파 시험으로
검증했다. 실제 PostgreSQL COMMIT acknowledgment 패킷 장애를 직접 일으켰다는 주장은 하지 않는다.

## Commands

| ID | 연결 기준 | Gate | 명령/검사 | 결과 |
| --- | --- | --- | --- | --- |
| C1 | R3 | required | `npm run verify:fsd` | PASS |
| C2 | R3 | required | `npm run check` (lint, FSD, Next typegen, tsc, architecture, availability 포함) | PASS |
| C3 | R1/R2 | required | `npm run test:web` | 478 pass, 0 fail/skip |
| C4 | R1/R2/R4 | required | `SRC_CHECK_INBOX_MANIFEST=true`, `RDC_CHECK_ACTION_MANIFEST=true`로 `npm run test:server` | 28 pass, 0 fail/skip |
| C5 | R1/R3 | required | `npm test` | 188 pass, 0 fail/skip; core/plugin runtime 정책·복사본 유지 |
| C6 | R2/R3 | required | `npm run test:server:integration` | migration 및 전체 직렬 통합 시험 PASS |
| C7 | R3 | required | `npm run build`, 계측 해제 뒤 최종 fresh build 재실행 | PASS |
| C8 | R2 | required | `rehearse-repository-disconnection.ts` | 실제 action owner/foreign/no-session/bearer/spoof/stale/flag=false 및 7 상세 GET+History PASS |
| C9 | R3 | required | `git diff --check` | PASS; CRLF 변환 안내는 whitespace 오류가 아님 |
| C10 | R1 | informational | 5개 독립 skill lens + 별도 neutral gate | 모두 Applicable, supported finding 0, coverage gap 0 |

`npm run docs:check`는 이 저장소 package.json에 존재하지 않아 실행하지 않았다. 문서 생명주기·상대
링크·민감정보는 별도로 읽고 확인했다.

## Evidence Registry

| ID | 보존한 근거 |
| --- | --- |
| E1 | repository-selection/new-project-form 시험, 이 보고서 B-01의 실제 DOM/FormData·DB read-back 결과 |
| E2 | `tests/server/project-registration.test.ts`, `tests/server/integration/project-registration.test.ts`, 기존 project-connection 통합 시험 |
| E3 | board-query/owner-gate/review-gate-actions/owner-tools 실행 시험과 canonical full metadata/body 비교 |
| E4 | 기존 `tests/server/integration/board.test.ts`, 실제 Next 승인 및 replay의 상태/event 수 비교 |
| E5 | inbox-card-boundary 시험, final build Client/Action manifest, browser fault/retry/HTML/RSC 결과 |
| E6 | copy-button 시험 및 실제 DOM fixture의 통제 가능한 clipboard와 consumer 결과 |
| E7 | gate-source/history-navigation/doc-link/item-docs/history-row 시험과 실제 Next disconnection 리허설 |

원본 HAR/session/token dump는 보존하지 않았다. 최초 시험 모형의 History public API 누락과
type narrowing, manifest global 이름, 브라우저 locator/프록시 Host 설정은 보정 후 해당 시험을 재실행했다.
최종 실패와 미실행 required 항목은 없다. 민감한 URL·cookie·token 평문은 보고서에서 제외했다.

## Findings and Follow-up

추가 결함 없음. 기존 malformed slug 데이터 조사와 실제 운영 네트워크/배포 인수는 별도 범위다.

## Test Data and Cleanup

| 리소스 | 정리와 최종 상태 |
| --- | --- |
| fixture 사용자와 자식 데이터 | 모든 리허설 `/finish` 및 통합 시험 finally 정리. User/Project/BoardItem/ProjectToken/OwnerToken/UserToken/TransitionEvent/PipelineVersion 각각 0행 확인 |
| Next/proxy | 리허설 listener 55438/55439/55451/55452 종료 확인 |
| generated fault와 marker | 원본 bytes 복원·marker 제거, 이후 fresh build 재실행 |
| local PostgreSQL | 이 작업이 시작한 cluster 종료. 비어 있는 테스트 DB/data는 local Temp에 남으며 운영 DB 변경 없음 |

## Conclusion

모든 required 행이 통과했다. 브라우저·DB 인수를 skip으로 대신하지 않았으며 CI/PR/배포 통과를
이 로컬 결과로 주장하지 않는다. application 소스가 변경되면 해당 계약 시험과 fresh build 인수를 재실행한다.

## Review Checklist

- [x] 기준·gate·실행 결과·증거 연결 및 전체 pass 판정 확인.
- [x] dirty revision·source fingerprint·실행 환경·시험 double과 실제 표면 구분.
- [x] fixture/서버/계측 정리, 문서 위치와 상대 링크, 민감정보 검토.
