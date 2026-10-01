---
status: "pending"
stage: "acceptance"
result: "blocked"
report-kind: "regression"
report-size: "standard"
test-levels: ["static", "unit", "component", "contract", "integration", "runtime"]
test-tools: ["Node.js test runner", "TypeScript", "ESLint", "Prisma", "PostgreSQL", "Next.js production build"]
created-at: "2026-09-30"
completed-at: null
last-executed-at: "2026-09-30"
tested-revision: "7a43fd56465d9f6a597bcf9c45e8cc8805364359 + harness/repository-disconnection working tree"
source-test-sha256: "491ba8c8b13fe127bca07f4953e5d0f30daa1786f2a572e1aff2dd13a3004bea"
owners: []
related: ["docs/proposals/completed/2026-10-01-repository-disconnection.md", "docs/architecture/repository-disconnection.md"]
test-summary: "자동·격리 DB·실제 Next transport 통과. 실제 브라우저 인수 미실행과 운영 BLK-RDC-01/02로 전체 완료 보류."
---

# 저장소 연결 해제 구현 검증

## 판정과 대상

연결 해제·명시적 재연결·등록 한도 반환·토큰 폐기·보존된 웹 읽기·CLI 안내를 구현했다.
로컬 자동 검사와 실제 PostgreSQL/Next transport는 통과했다. 실제 브라우저의 클릭·키보드·두 탭 화면
인수는 실행하지 못했으므로 전체 인수 완료는 보류한다. 운영 활성화는 BLK-RDC-01/02 미해결로 차단한다.
제안서는 2026-10-01 사용자 요청에 따라 코드 구현 완료 기록으로 completed에 보관한다.
이 보고서는 미실행 수동 인수의 후속 검증을 위해 active/pending으로 유지하며, 운영 배포 승인이나 운영 데이터 검증 증거가 아니다.

- 기준: [구현 완료 기록](../../proposals/completed/2026-10-01-repository-disconnection.md)의 REQ-RDC-001–014 및 V-SERVICE–V-MIGRATION.
- 환경: Windows PowerShell, Node 22.13.1, Next.js 16.3.3, React 19.2.8, Prisma 7.10.0, PostgreSQL 18.4.
- DB: 루프백 전용 `stagekeeper_test_rdc`. 기존 runner의 DB명과 운영 URL host/port/database 분리 검사를
  유지했다. child 프로세스만 DATABASE_URL/TEST_DATABASE_URL을 테스트 DB로 맞췄다. 공유 `.env`는 수정하지 않았다.
- 서버: 현재 production build를 루프백에서 실행했다. fixture JWT는 테스트용 secret으로 발급해 메모리에만
  보관했고 cookie·Authorization·평문 token을 보고서/로그에 남기지 않았다.
- 지문: Git 변경/미추적 `src/`, `tests/`, `packages/core/`, `plugin/`, `scripts/`, `prisma/`의 61개 파일을
  경로순으로 정렬하고 각 `경로\tSHA256(원본 바이트)`를 LF로 연결한 뒤 SHA256했다. 문서·ignored generated client는 제외했다.
- 검증 대상은 커밋 전 working tree였다. 운영 migration·배포·flag 활성화는 수행하지 않았다.
  후속 사용자 요청으로 이 검증된 변경의 커밋·feature branch 푸시·dev 대상 PR 생성을 진행한다.

## 실행 결과

| 명령/검사 | 결과 | 증거 범위 |
| --- | --- | --- |
| `npm run db:validate` | PASS | 현재 Prisma schema 유효 |
| `npm run db:generate` | PASS | Prisma 7.10 client 생성; 수동 생성 파일 수정 없음 |
| `npm run test` | 188/188 PASS | core·CLI, offline/dry-run/skip/URL·기존 호환과 신규 거부 안내 |
| `npm run test:web` | 466/466 PASS | 서버 정책·등록 mapper·실제 UI 결과 body·readonly 라벨/안내·control 동작 |
| `RDC_CHECK_ACTION_MANIFEST=true npm run test:server` | 19/19 PASS | session/action 배선·14+1 도구 차단·Prisma 오류 형태·새 build manifest |
| `npm run test:server:integration` | PASS | runner의 migrate deploy와 전체 격리 PostgreSQL 통합 suite |
| `npm run verify:fsd` | PASS | slice 공개 API·의존 방향·서버 경계 |
| `npm run test:architecture` | 25/25 PASS | FSD 검사기·plugin mirror·폐기 문구·DB runner 안전 검사 |
| `npm run check` | PASS | mirror 일치, ESLint/FSD, Next typegen, tsc, architecture 25개, availability 18개 |
| `npm run build` | PASS | production build, 상세 7개 경로 포함; manifest의 새 mutation 정확히 2개 |
| `rehearse-repository-disconnection.ts --transport-loss` | PASS | 실제 Next action·GET·flag false·응답 유실·채운 History pagination |
| `git diff --check` | PASS | patch 공백/충돌 표식 검사 |

실제 Next 리허설의 재실행은 [verification.md](../../architecture/verification.md)를 따른다.
현재 build를 먼저 만들고 별도 TEST_DATABASE_URL을 지정한다. DB는 runner가 reset하지 않는다.

## 권한·데이터·경쟁 관찰

| 요구사항 | 실제 확인한 관찰 | 검사 목적지 |
| --- | --- | --- |
| 001/002/006/011 | 마지막 연결 해제·0개 정상·Free 새 등록/재연결 경쟁·동일 id/slug 복원·downgrade 연결 보존 | connection service/unit·DB competition·Next 리허설 |
| 003 | Workspace/Backlog/Board/Event/Report/Command/AgentRun/Step/PipelineVersion/Run을 채우고 해제/복원 전후 비교. 소유자 상세 7개 GET 200, 타인 404, 무세션 로그인, GET 전후 state 동일 | connection integration·실제 Next HTTP |
| 003 | 보존된 Items에 removed backlog/On hold/Discarded 포함. Items 50개 다음 페이지·K-1 펼침의 독립 itemBefore·Events 다음 페이지·유효한 과거 빈 페이지의 Newest 링크를 실제 href로 이동. 기존 cutoff/정렬/동일시각 SQL 회귀 유지 | Next 리허설·기존 history/items 통합 suite |
| 004 | 대상의 유효 hs_/ho_만 폐기. 기존 폐기 시각·다른 프로젝트 hs_/ho_·hu_ 불변. 재연결 후 폐기 credential 401, 새 hs_ 성공, 기존 hu_ 재사용 성공 | populated DB integration·token service |
| 005 | REST 4개와 agent MCP 14개/owner MCP 1개를 실제 Request로 호출. 정상 성공 대조 뒤 유지된 hu_는 정확한 disconnected 사유만 받고 domain 진입 없음. 폐기 hs_/ho_는 일반 401 | route/MCP integration·registry unit |
| 007 | 동일 소유자 repo 대소문자 비교가 cap/slug보다 먼저 실행. 해제된 repo 등록 409와 실제 reconnectPath, 중복 2개는 error-only. 동시 등록은 created/existing 한 쌍과 새 행/event 1개 | registration unit·actual REST·DB competition |
| 008/014 | 이미 승인된 runbook 저장은 해제 뒤 완료 가능, 새 요청은 무쓰기 거부. A 해제 뒤 B의 계정 dispatch 합계에 A의 기존 실행이 남음 | in-flight DB checkpoint·usage integration |
| 009 | 실제 첫 User 잠금 안에서 두 번째 잠금 시도 확인 후 해제. 등록/플랜/선택/두 credential 발급과 양방향 경쟁, 재연결/새 등록 cap 경쟁·동일 repo 경쟁 통과. event/CAS 실패 rollback, 재시도 후 event 1개 | connection integration 7개 상위 시험 |
| 010 | Connected/Disconnected·두 개수·Use 제한·정확한 Inbox 라벨·버튼/실행 안내 숨김을 실제 React render로 검사. Cancel·pending·success·사업 오류·stale·예외 시 reset/refresh/재제출 금지는 실제 control handler를 VM/hook 경계 double로 실행 | project-list/inbox/form render·connection-control 4개 시험 |
| 012 | 실제 CLI + 실제 REST 정책을 로컬 HTTP에 연결해 templates 거부의 무파일·runbook 거부 뒤 이미 생성된 파일 보존/stop 안내·재연결 hu_ 재사용 확인. status만으로 해제로 오인하지 않음 | harness-init/web·plugin CLI suite |
| 013 | 이전 migration 17개를 전용 pg connection/격리 search_path에서 파일 전체로 재생한 뒤 18개 모델의 테이블을 SQL로 채움. RDC additive migration 뒤 기존 행/FK/index 유지, nullable 기본값과 CHECK 검증. 일부 열/index/default/미검증 CHECK는 partial 거부 | migration integration 3개 시험·cleanup catalog/unit |

Prisma 7 adapter의 실제 raw User 잠금 충돌은 `P2010`과
`meta.driverAdapterError.cause.originalCode=40001`로 전달됐다. 이를 P2034/AvailabilityConflict와 같은
최대 3회 전체 transaction 재시도에 포함했고, SQLSTATE 40001/40P01만 허용한다.
기존 meta.code 형태와 무관한 P2010 즉시 전파·재시도 소진은 unit으로 확인했다.

## 실제 Next transport와 응답 유실

AST는 ordinary loader가 module-level server-only 경계에 있고 mutation 2개에만 inline use server가
있음을 확인한다. 새 production manifest도 해당 adapter의 `$$RSC_SERVER_ACTION_*` 등록이 2개다.
loader 이름의 문자열 부재만으로 이 판정을 대체하지 않았다.

소유자의 유효한 action ID/본문/Origin/Host로 성공을 먼저 증명했다. 같은 transport에 타인 세션을 넣으면
Project not found와 무쓰기, 세션 없이 hu_/hs_ bearer만 넣으면 로그인과 무쓰기였다. client userId 위조는
소유권을 바꾸지 못했다. stale은 무쓰기이며 flag=false의 유효 요청은 disabled로 거부됐다.

루프백 proxy가 실제 disconnect 커밋 뒤 응답 소켓을 끊었다. 요청자는 fetch 실패를 받았지만 DB의
disconnectedAt/version/event는 정확히 한 번 변경됐다. 같은 오래된 요청은 stale이고 추가 쓰기는 없었다.
후속 실제 GET은 저장된 해제 상태와 보존 이력에 도달했다. 양쪽을 해제한 0개 연결 화면 이후 Alpha를
명시적으로 복원했고 기존 hs_는 폐기 상태였다. 이를 브라우저 client의 화면·hydration 검증으로 기록하지 않는다.

## 독립 코드 리뷰

frontend-clean-code-orchestrator의 다섯 lens(응집도·결합도·예측 가능성·가독성·TypeScript)는 모두
Applicable이며 결과를 완전 수신했다. neutral gate는 supported finding 0개의 코드 품질 PASS를 반환했다.

| Canonical finding | 조치와 검증 |
| --- | --- |
| FQ-01 | ho_ 플랜 문구를 core 한 곳에서 소유하고 웹/서버가 재사용; plugin mirror byte 일치 |
| FQ-02 | review-gate가 readonly 라벨 타입/매핑을 소유하고 기존 prop 전달 유지; 3개 상태 렌더 회귀 |
| FQ-03 | 그룹의 emptyMessage를 데이터로 표현; 두 빈 그룹 렌더 회귀 |
| FQ-04 | 등록 주석을 현재 결과·직렬화 계약과 일치시킴 |
| FQ-05 | Prisma P2002 legacy/driver slug 형태 재시도; 실제 오류 객체로 성공/소진/무관 제약 전파 확인 |

추가 P2010 보완도 TypeScript lens가 수정 없이 재검토해 supported finding 없음을 확인했다.
기존 URL 입력의 이전 상태 보존 문제(PRD-01)는 gate에서 이번 연결 수명 변경 범위 밖으로 판단해 제외했다.
그 제외를 이번 범위의 미해결 코드 결함이나 신규 수정 완료로 세지 않았다.

## 미실행과 활성화 조건

CUA의 getBrowser는 No browser is available, getState는 apps/browsers 빈 배열,
createBrowserTab(iab)는 unavailable을 반환했다. 따라서 실제 클릭·키보드·두 탭 stale·pending 화면·
응답 유실 후 client refresh의 화면 관찰은 **NOT RUN**이다. VM/component/HTTP 결과로 브라우저 인수를
PASS 처리하지 않는다. `--interactive` 도구는 owner/foreign fixture 로그인과 응답 유실 스위치를 제공하며,
Enter 또는 루프백 `/finish`로 정리할 수 있다.

실제 `/harness:init` 세션에서 거부 note 뒤 에이전트가 MCP 등록/sync/성공 보고를 중단하는 수동 인수와
운영 설치 plugin 버전 확인도 미실행이다. 자동 CLI 시험과 init skill의 stop 지침은 통과/반영했지만
private Template 게시나 사용자의 설치본 갱신은 수행하지 않았다.

BLK-RDC-01(운영 상태·중복·backup 복원 리허설)과 BLK-RDC-02(전 writer drain·호환 bundle·설치본 버전)는
로컬 통과로 해소되지 않는다. 기본 PROJECT_CONNECTION_WRITES_ENABLED=false를 유지한다.
문제 발생 시 flag=false와 state-aware 호환 bundle을 사용하며 과거 코드 복귀·토큰 부활·D2 복구 SQL의
무조건 적용을 금지한다. 상세 절차는 [운영 문서](../../architecture/repository-disconnection.md)를 따른다.

최종 정리에서 테스트 DB의 fixture User 0개와 격리 schema 0개를 확인했고, 리허설 Next process와
이 작업의 임시 PostgreSQL 서버를 종료했다. 테스트 바이너리/데이터는 작업용 TEMP 경로에만 있으며
프로젝트 의존성이나 운영 DB를 변경하지 않았다. 최종 source/test 지문과 diff 공백 검사를 다시 확인했다.
