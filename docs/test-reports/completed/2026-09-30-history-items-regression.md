---
status: 'completed'
result: 'pass'
report-kind: 'regression'
created-at: '2026-09-30'
completed-at: '2026-09-30'
related: ['docs/proposals/active/project-history-tab.md', 'docs/conventions/product-copy.md']
primary-area: 'project/history'
---

# History Items regression

History 기본 보기를 ITEM당 한 행으로 변경했다. Items는 제목·최신 회차 상태·최신 활동 시각을 표시하고,
행을 누르면 과거/폐기 회차를 포함한 상세 이벤트를 읽는다. Events의 Key events/All도 유지한다.
항목 목록과 상세는 서버에서 각각 50개씩 페이지를 나누고 별도 커서를 사용한다.

## Automated checks

| 검사 | 결과 |
| --- | --- |
| `npm run check` | Pass: lint, FSD, Next typegen, TypeScript, architecture, availability |
| `npm run verify:fsd` | Pass |
| `npm run test:architecture` | 25 pass |
| `npm test` | 187 pass |
| `npm run test:web` | 442 pass |
| `npm run test:server` | 13 pass |
| 실제 PostgreSQL 통합 시험 | 37 pass, 신규 항목 조회 및 기존 이력·트랜잭션 시험 포함 |
| `npm run build` | 별도 임시 복사본에서 Pass, `/p/[slug]/history` dynamic route |
| `git diff --check` | Pass |

신규 통합 시험 `tests/server/integration/history-items.test.ts`는 많은 이벤트의 항목별 집계,
동일 시각 55개 항목의 모든 페이지 순서·누락·중복, 최신 폐기 상태, 완료/보류/제거 항목 보존,
과거 회차의 상세 조회, report-only 항목, Free 경계의 동일/직전 시각, Pro/Max 전체 조회,
이력이 없는 백로그 제외, 타 소유자/프로젝트 격리를 실제 DB에서 검사한다.
서버 계약 시험은 guard 실패 전 조회 중단, 잘못된/중복 query 값 처리, 화면에 없는 item 조회 생략,
목록과 상세에 동일 cutoff 전달, lookahead 커서, 기존 Events 링크 호환을 확인한다.

## Production app browser checks

복사본의 프로덕션 앱, 격리 DB의 합성 프로젝트 56개 항목과 다회차 ITEM-01, 시험용 서명 세션으로 실행했다.
시험 세션은 해당 임시 앱의 별도 AUTH_SECRET으로 발급했고 사용자 개발 서버·계정·공유 `.env`를 변경하지 않았다.
실제 GitHub OAuth 로그인 흐름은 실행하지 않았다.

| 동작 | 확인 결과 |
| --- | --- |
| Items 기본 및 목록 페이지 | 50개 → 6개, ITEM 중복 및 페이지 간 겹침 없음 |
| ITEM-01 펼치기·상세 Older/Newest·접기 | 50행 → 17행 → 50행, 목록 커서 유지 |
| 다음 목록 페이지에서 ITEM-51 펼치기 | 같은 목록 커서 유지, 접기 URL도 유지 |
| Items → Events → All → Items | 커서·펼친 항목 초기화, Events 필터 동작 |
| 미로그인 및 타 소유자/없는 프로젝트 | 로그인 redirect, 타인/없는 프로젝트 모두 404 |
| Free HTTP HTML/RSC | 40일 전 합성 이력 marker가 응답에 없음 |
| 360px dark 키보드 Enter | 펼치기 성공, main 345/345px 및 상세 303/303px로 가로 넘침 없음 |
| 브라우저 console | errors/warnings 0 |

800px light와 360px dark 화면을 시각 검토했다.
기존 공용 헤더의 좁은 화면 넘침은 이전 보고서의 범위 밖 관찰과 같으며 새 History 본문에서는 관찰되지 않았다.

- [Items 800px light](../assets/2026-09-30-history-items-regression/items-800-light.png)
- [Expanded item 360px dark](../assets/2026-09-30-history-items-regression/expanded-360-dark.png)

## Environment and cleanup

기존 로컬 PostgreSQL 18 바이너리로 새 임시 data 디렉터리·loopback 포트와 `stagekeeper_test_*` DB를 만들었다.
기존 `validateTestDatabase`로 원래 DB와 다름을 확인한 뒤 `runIntegration`의 migration→직렬 시험을 실행했다.
생성 fixture는 각 시험의 finally에서 제거하고, 브라우저용 합성 사용자/프로젝트도 종료 시 제거했다.
임시 앱 서버와 PostgreSQL을 종료했다. 빌드 산출물·시험 로그는 Temp에 있고 증거 PNG만 저장소에 남긴다.

최초 build는 샌드박스의 Google Fonts 접근 제한으로 실패했으며 네트워크 허용 후 동일 명령이 통과했다.
초기 브라우저 fixture의 event id에 실제 cuid 규약 밖의 하이픈을 사용하여 기존 커서가 거부했다.
합성 id를 실제 커서 규약에 맞춘 뒤 위 탐색을 통과했다. 제품의 이벤트 커서 계약은 변경하지 않았다.

원래 History 제안서의 실제 GitHub OAuth 및 전체 오류/retry 인수는 이 후속 기능의 통과와 별도로 남아 있다.
