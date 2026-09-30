---
status: 'completed'
stage: null
result: 'blocked'
report-kind: 'regression'
report-size: 'standard'
test-levels: ['static', 'component', 'contract', 'manual']
test-tools: ['Node.js test runner', 'TypeScript', 'ESLint', 'Next.js production build', 'Playwright MCP']
created-at: '2026-09-30'
completed-at: '2026-09-30'
last-executed-at: '2026-09-30T12:52:36+09:00'
tested-revision: '53817b0ab8cdd025c9d6f14e1bd9c53360db8e6c + working tree; source/test SHA256 95f71245fdb4031e933db768946575ccf33df120ac7f27974110f328eadbffd6'
owners: ['user:Sangeok']
related: ['docs/proposals/completed/2026-09-30-project-history-tab.md']
primary-area: 'project/history'
observed-environments:
  - 'local | source and component fixture | Windows / Node 22.13.1 / Next.js 16.3.3 / headless Chrome | synthetic fixture'
  - 'local | production HTTP request | Next.js 16.3.3 | anonymous'
test-summary: 'blocked: History 탭 구현 회귀 검증 — 자동 검사와 컴포넌트 화면 검토 통과, 격리 DB·로그인 인수 환경 없음'
follow-up: ['docs/proposals/completed/2026-09-30-project-history-tab.md']
---

# Project History Tab Regression

## Summary and Decision

History 탭, 두 원천의 커서 조회, 공용 이력 위젯과 항목 상세 연결을 구현한 작업 트리를 검증했다.
가능한 로컬 검사는 끝났으나 실제 PostgreSQL 결과와 로그인 사용자의 응답 본문은 검증하지 못했다.
따라서 이 초기 실행 시점에는 보고서만 완료하고 제안서는 `pending`으로 남겼다. 이후 검증 및 완료 이동은 Conclusion의 후속 기록을 따른다.
사용자는 별도 시험 환경이 없으며 가능한 자동 검증을 진행하도록 답했다.

## Scope and Criteria

기준은 [제안서](../../proposals/completed/2026-09-30-project-history-tab.md)의 D1–D8 및 V1–V8이다.
포함 범위는 읽기 전용 History, 항목 상세 이력, 여섯 탭, 랜딩 데모와 회귀 검사다.
운영 데이터 변경, 배포, 스키마·인덱스·요금제 변경은 포함하지 않는다.

| 기준 ID | 기준 문서 위치 | 확인 기준 |
| --- | --- | --- |
| R1 | V1·V8 | 저장소 게이트 통과, 공개 API와 기존 쓰기·상세 기능 보존 |
| R2 | V2–V4 | key/all, NULL 보존, 보고서 중복 제거, 50행 커서, Free 창, 현재 회차 링크 |
| R3 | V5·V7 | 공용 행·문구·UTC·보고서 링크·페이지 탐색·작은 화면 탭 |
| R4 | V6·V7 | 조회 전 소유권 확인, 타 프로젝트 격리, 실제 인가·응답·최신성·retry |

## Test Target

- 작업 브랜치: `harness/project-history-tab`. 기준 커밋 위의 미커밋 구현·테스트 28개 파일을 검사했다.
- 소스 지문은 변경·미추적 `src/`, `tests/` 파일 목록을 정렬하고 각 `경로\tSHA256(원본 바이트)`를 LF로 연결한 뒤 SHA256한 값이다. 문서·스크린샷은 제외한다.
- 실제 요청: 별도 production 서버의 `/p/sample/history`. 이 요청은 미로그인 조건만 검증한다.
- 화면 검토: 실제 React 컴포넌트와 production CSS/font를 정적 fixture 서버에서 렌더했다. Next 라우팅·RSC·DB·OAuth를 포함하는 E2E가 아니다.
- 800px light History, 360px dark History, 800px dark 상세, 360px light 랜딩을 검토했다. 각 화면의 모든 테마·크기 조합을 검증한 것은 아니다.
- 공유 `.env`는 수정하지 않았다. 빌드·익명 요청에는 자식 프로세스에 비연결용 CI DB 설정을 전달했다. 익명 요청 서버에만 해당 localhost의 `AUTH_URL`, `AUTH_TRUST_HOST=true`를 설정했다.

## Preconditions and Test Data

- 설치된 의존성·Prisma Client를 사용했다. 실제 DB 연결이나 로그인 세션은 없다.
- 화면 입력은 가상 프로젝트·항목과 고정 이력이다. unit/contract 시험은 Prisma·인증 경계의 반환값을 주입한다.
- 실제 DB 시험은 기존 안전 검사 runner를 사용하는 `tests/server/integration/project-history.test.ts`에 작성했다. 소유자별 fixture, 동일 시각 55+55행, cutoff 경계, SQL 검사, 추가 2,000행 비용 측정 및 finally 정리를 포함한다.
- 이 DB 시험은 `TEST_DATABASE_URL` 부재로 실행하지 않았다. 가상 데이터를 운영 DB에 만들지 않았다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오·기대 결과 | 실제 결과 및 Evidence | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R2 | required | 엄격한 cursor, 4개 source 조합, 0/49/50/51행, 같은 시각 여러 페이지의 누락·중복 없음 | 순수 함수 시험에서 입력 불변·전체 기대 순서 일치 — E5 | PASS |
| T2 | R2 | required | 두 조회의 project·view·since·before 조건 보존, 각 51행, 현재 회차와 잘림 조회 | spy DB 시험에서 where/orderBy/take/select, Free/Pro/Max 및 쿼리 생략 확인 — E5 | PASS |
| T3 | R2·R4 | required | 실제 DB에서 정렬·격리·과거 회차·cutoff·SQL·성능 확인 | 격리 PostgreSQL 없음. 테스트 작성·타입 검사까지만 완료 — E8 | NOT RUN |
| T4 | R3 | required | 같은 상태 라벨, report 문서·commit, UTC, 키 링크, 상세 Documents/Reopen 보존 | 모델·컴포넌트·copy-lock 시험 통과 — E3·E5 | PASS |
| T5 | R3 | required | fixture 화면의 Key/All, Older/Newest, 토글 초기화, 빈 과거 페이지 복귀, 여섯 탭 접근 | 50행→Older 12행→Newest 50행; 토글 cursor 제거; Tokens 키보드 접근; 랜딩 장식 aria-hidden 유지 — E1·E2·E4·E6 | PASS |
| T6 | R4 | required | 실제 route 본문이 guard 실패 시 조회 중단, 성공 시 guard의 projectId 사용 | 격리 VM에서 route 실행. 중복·잘못된 검색값 기본값, plan/cutoff 및 props 확인 — E5 | PASS |
| T7 | R4 | required | 실제 미로그인 GET이 로그인으로 이동 | HTTP 307, Location pathname `/login`; 최종 서버 로그에 auth 오류 없음 — E7 | PASS |
| T8 | R3·R4 | required | 실제 로그인 owner/타인/없는 slug/선택 제외 접근, HTML·RSC의 Free 창, 재조회·retry | DB·OAuth 환경 없음. 정적 fixture로 이 조건을 통과 처리하지 않음 — E8 | NOT RUN |
| T9 | R3 | informational | 기존 앱 헤더까지 모바일 페이지 폭 확인 | 기존 사용자 이름 영역에서 약 7px 수평 넘침 관찰; 이 작업의 탭 스크롤 영역은 정상 — E2·E6 | FAIL |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령·방법 | 실제 결과 및 Evidence | 판정 |
| --- | --- | --- | --- | --- | --- |
| C1 | R1 | required | `npm.cmd run verify:fsd` | exit 0 — E5 | PASS |
| C2 | R1 | required | `npm.cmd run check` | lint·FSD·typegen·tsc, 아키텍처 25개, availability 17개 통과; exit 0 — E5 | PASS |
| C3 | R1–R4 | required | `npm.cmd test` | 187개 통과, exit 0 — E5 | PASS |
| C4 | R1–R3 | required | `npm.cmd run test:web` | 437개 통과, exit 0 — E5 | PASS |
| C5 | R2·R4 | required | `npm.cmd run test:server` | 10개 통과, exit 0 — E5 | PASS |
| C6 | R1 | required | `npm.cmd run build` | exit 0; `/p/[slug]/history` 동적 route 생성 — E5 | PASS |
| C7 | R1 | required | V8 검색·diff 리뷰 | 옛 상세 helper/type 제거, 새 공개 API 소비 확인; 쓰기·MCP·schema·revalidate 목록 변경 없음 — E5 | PASS |
| C8 | 문서 | informational | front matter·로컬 링크·`git diff --check` 검사 | 구조·경로 일치 및 공백 오류 없음 — E9 | PASS |
| C9 | 문서 | informational | `npm run docs:check` | package.json에 해당 script 없음. C8과 수동 checklist로 확인 — E9 | NOT RUN |

## Evidence Registry

| ID | 종류 | 정제된 증거 또는 참조 | 보존 위치·만료 |
| --- | --- | --- | --- |
| E1 | UI | History 800px light, 기본 Key events·보고서·잘림 문구 | [PNG](../assets/2026-09-30-project-history-tab-regression/E1-history-800-light.png), 저장소 보존 |
| E2 | UI | History 360px dark, 마지막 Tokens 탭의 키보드 focus·가로 스크롤 | [PNG](../assets/2026-09-30-project-history-tab-regression/E2-history-360-dark.png), 저장소 보존 |
| E3 | UI | 상세 800px dark, Documents·Reopen·공용 History | [PNG](../assets/2026-09-30-project-history-tab-regression/E3-item-800-dark.png), 저장소 보존 |
| E4 | UI | 랜딩 360px light, 여섯 탭을 담은 데모 | [PNG](../assets/2026-09-30-project-history-tab-regression/E4-landing-360-light.png), 저장소 보존 |
| E5 | command·contract | C1–C7의 종료 결과. 회귀 소스: `history-page.test.ts`, `history-row.test.ts`, `history-list.test.ts`, 두 page 시험, `tests/server/project-history.test.ts` | 본문 결과와 저장소 테스트 소스, 만료 없음 |
| E6 | DOM·keyboard | 앱 탭 width 345/scrollWidth 449, clientHeight=scrollHeight=41; Tokens focus 후 scrollLeft 104. 랜딩 수정 후 문서 scrollWidth=clientWidth=345, 데모 탭은 311/401 및 세로 넘침 없음 | 본문, 만료 없음 |
| E7 | HTTP·console | 최종 production 익명 요청 결과 `{status:307, redirectPath:"/login"}`. 요청 후 서버 종료까지 추가 오류 출력 없음 | 본문, 만료 없음 |
| E8 | environment | 사용자 답변: 설정된 시험 환경 없음, 가능한 자동 검증 진행. 실제 DB·로그인 E2E 미실행 | 본문 및 제안서, 만료 없음 |
| E9 | document | package.json script 목록, YAML 구조·링크 존재·전체 diff 공백 검사 | 본문, 만료 없음 |

초기 build의 외부 font 접근 실패는 네트워크 허용 후 재실행해 해결했다.
초기 익명 smoke는 localhost trust 설정이 없어 `UntrustedHost`가 출력되어 증거에서 제외했고, E7은 로컬 시험 프로세스에 host 설정을 넣은 최종 재실행이다.
이미지는 합성 데이터만 포함하며, 쿠키·토큰·실제 계정·DB URL·원본 SQL 바인딩은 보존하지 않았다.

## Findings and Follow-up

| ID | 구분 | 발견 사항·Evidence | 추적 위치·재검증 조건 |
| --- | --- | --- | --- |
| F1 | 필수 인수 차단 | 실제 DB·로그인 응답 검증 미실행 — E8 | [제안서 V3·V4·V6·V7](../../proposals/completed/2026-09-30-project-history-tab.md#verification-plan). 격리 DB·OAuth 준비 후 새 보고서에서 실행 |
| F2 | 기존 범위 밖 UI | `app-header.tsx`의 사용자 이름 영역이 360px에서 약 7px 넘침 — E2·E6 | 이 보고서의 T9 기록. 공용 헤더 반응형 개선 범위에서 사용자 이름 길이별 재검토; 이 작업에서 해당 파일 변경 없음 |
| F3 | 수정 완료 | 여섯 탭 추가 시 세로 scrollbar와 랜딩 grid 확장 발견 — E6 | 탭의 음수 margin 제거·세로 넘침 차단·landing grid 자식 `min-w-0` 적용 후 재렌더 확인 |

## Test Data and Cleanup

| 리소스 | 변경·정리 | 최종 영향 |
| --- | --- | --- |
| DB·사용자·Subscription | 연결·fixture 생성·플랜 변경 없음 | 없음 |
| 로컬 서버 | 이 작업의 fixture 서버와 production smoke 서버를 종료 | 상시 실행 프로세스 없음 |
| 공유 환경 설정 | 수정 없음, 시험 서버의 환경 값만 지정 | 사용자 서버·인증 설정 변경 없음 |
| 증거 | 정제한 PNG 4개만 저장소에 추가 | 의도한 검증 산출물 |

## Conclusion

이 결론은 초기 실행 시점의 기록이다. 이후 실제 DB 및 합성 서명 세션의 production 앱 검증을 수행한
[후속 보고서](./2026-09-30-history-items-regression.md)가 추가되었고, 구현은 CI 통과 후 PR #87로 머지됐다.
제안서는 완료 기록으로 이동했으며 실제 GitHub OAuth·전체 오류/retry 등 미실행 인수는 후속 점검으로 남아 있다.

필수 T3·T8의 `NOT RUN` 때문에 전체 인수 판정은 `blocked`다. 자동 검사 결과와 정적 화면 검토는 구현을 검토할 근거이며 실제 DB·로그인 E2E의 대체 증거가 아니다.
F1 환경이 마련되면 제안서의 격리·정리 절차에 따라 다시 검증한다. 현재 실행은 문서화까지 끝났으며 구현 코드와 제안서는 작업 트리에 남긴다.

## Review Checklist

- [x] 완료 보고서 위치·metadata와 제안서의 잔여 검증 상태가 일치한다.
- [x] 모든 기준과 독립 명령에 gate·실제 결과·판정이 있다.
- [x] 필수 미실행을 pass로 계산하지 않았고 기존 UI 관찰을 구분했다.
- [x] 합성 화면과 실제 서버 요청의 범위를 구분하고 증거의 민감정보를 검토했다.
- [x] 데이터 변경·서버 정리·후속 검증 위치를 기록했다.
- [x] docs:check 부재를 명시하고 YAML·로컬 링크·공백 및 수동 판정 검토를 수행했다.
