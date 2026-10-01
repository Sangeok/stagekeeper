---
status: "completed"
stage: "acceptance"
result: "passed"
report-kind: "regression"
report-size: "standard"
test-levels: ["static", "unit", "component", "contract", "integration", "runtime", "browser"]
test-tools: ["Node.js test runner", "TypeScript", "ESLint", "Prisma", "PostgreSQL", "Next.js production build", "Playwright"]
created-at: "2026-10-01"
completed-at: "2026-10-01"
last-executed-at: "2026-10-01"
tested-revision: "14380ec940f6c65e33e154df1bc53346162534d7 + harness/remove-repository-connection-flag working tree"
source-test-sha256: "e56c00608294500875749c115be255d516d2727ff78f3009dd19679472d26764"
owners: []
related: ["docs/architecture/repository-disconnection.md", "docs/architecture/verification.md"]
test-summary: "연결 feature flag 완전 제거. 웹 495·서버 27 시험, 정적 검사·build·격리 DB 통합·실제 Next transport·브라우저 해제/재연결 통과."
---

# 저장소 연결 기능 상시 제공 검증

2026-10-01 사용자 결정에 따라 연결 해제·재연결의 환경 변수, 설정 모듈, disabled 결과, UI의 writesEnabled 및 임시 비활성 안내를 제거했다. 소유자 세션·입력·version·무결성·재연결 한도 검사는 유지한다. 최초 제안서와 이전 보고서의 스위치 정책은 당시 기록이며, 현재 계약은 [아키텍처](../../architecture/repository-disconnection.md)를 따른다.

## 대상과 환경

- 기준 커밋 위의 변경된 `.env.example`·`src/`·`tests/`·`scripts/` 14개 경로가 검증 대상이다. 경로순 `경로\tSHA256(원본 바이트)` 또는 삭제된 경로의 `경로\tdeleted`를 LF로 결합하고 마지막 LF를 포함해 지문을 계산했다.
- Node 22.13.1, Next.js 16.3.3, React 19.2.8, Prisma 7.10.0, 격리 PostgreSQL을 사용했다.
- 테스트 DB는 루프백 포트 55449의 `stagekeeper_test_connection_flag`다. runner의 운영 URL과 host/port/database 분리 검사를 통과했다. 공유 `.env`는 변경하지 않았다.
- 실제 Next production server는 55438, fixture 로그인 bridge는 55439, 지연·응답 유실 proxy는 55440을 사용했다. 테스트용 세션·token 값은 로그나 보고서에 기록하지 않았다.

## 결과

| 검증 | 결과 |
| --- | --- |
| `npm run check` | 통과: plugin 동기화·lint·타입·아키텍처 26·availability 18 시험. 기존 browser fixture의 unused variable 경고 1개, 오류 0개 |
| `npm run verify:fsd` | 통과 |
| `npm run test:web` | 495개 통과, 실패·skip 0 |
| `npm run build` | 통과 |
| `npm run test:server` | fresh build의 두 manifest 검사까지 27개 통과, 실패·skip 0 |
| `npm run test:server:integration` | 격리 DB migration·전체 통합 시험 통과 |
| 실제 Next 리허설 `--transport-loss --interactive` | 별도 연결 설정 없이 해제·재연결 성공. 타인·무세션·bearer·위조 userId·stale, 7개 상세 GET과 History의 읽기 보존 통과 |
| 응답 유실 | 실제 commit/event 1회, stale replay 무쓰기, History Items/펼침/Events pagination, 0개 연결과 명시적 재연결 통과 |
| 현재 참조 검색·`git diff --check` | runtime·tests·scripts·env 예시·현재 architecture/copy에 제거된 flag 참조 없음, whitespace 오류 없음 |

리허설의 0개 연결 검증은 목록 개편 전 문구를 기대하고 있었다. 현재 문구 `0 of 5 repositories connected on the Pro plan.`으로 수정한 뒤 리허설 전체를 다시 실행해 통과했다.

## 브라우저 인수

1. 테스트 소유자의 Projects에서 RDC Alpha의 ⋯ 메뉴를 열었다. Disconnect 메뉴 항목의 `disabled=false`, 임시 비활성 문구 없음, 메뉴 항목 focus를 확인했다.
2. Disconnect 메뉴 → 확인 버튼을 클릭했다. 성공 알림과 Connected 0개, RDC Alpha의 Disconnected 목록 이동을 확인했다.
3. 해제된 Alpha의 상세 화면에서 읽기 보존 배너와 기존 Board 항목을 확인했다.
4. 상세 배너의 Reconnect → 확인 버튼을 클릭했다. 성공 알림, 해제 배너 제거, 기존 항목 보존을 확인했다.
5. Projects를 다시 열어 같은 Alpha의 Connected 복원과 연결 수 1개를 확인했다. 브라우저 console 오류·경고는 0개다.

## 정리

`/finish` 후 fixture 사용자·프로젝트·보드·availability event·hs_/ho_/hu_ 테이블의 행 수가 모두 0임을 확인했다. 테스트 Next/proxy/bridge와 이번 검증에서 시작한 PostgreSQL을 종료했다. 기존 localhost:3000 개발 서버는 유지했다. 운영 DB mutation·배포는 수행하지 않았다.
