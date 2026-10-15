# Multiple pipelines — 첫 release 구현·검증

## 최신 dev 통합 검증

2026-10-15 원격 dev `645e312de12c54e50d273287ac869c81c900da82`를 첫 release
브랜치에 통합했다. dev의 초안 상태 모델, 소유자 guard, page/action 주입,
읽기 전용 회복과 테스트 배치 규칙을 유지했다. 편집 레일은 프로젝트·Pipeline이
바뀔 때만 초기화하고, 요금제·쓰기 권한 변경은 초안을 보존한 채 반영한다.
자기 정의의 새 판과 참조 정의만 바뀐 snapshot을 구분하고, 저장 중 받은 더 최신
판은 응답 처리 후에도 유지한다. 제안서의 레일 identity 계약도 이에 맞췄다.

통합 후 다시 실행한 결과:

| 검사 | 결과 |
| --- | --- |
| `npm run check` (FSD·lint·타입·architecture 포함) | pass |
| `npm test` | 347 pass, 기존 환경 조건 2 skip |
| `npm run test:web` | 633 pass |
| `npm run test:server`, fresh build manifest 검사 포함 | 143 pass |
| `npm run test:server:integration` | migration A와 전체 DB 테스트 pass |
| fresh production build | pass |
| 실제 Next HTTP 인수 | 8개 액션·권한·읽기 전용 GET·5개 화면 pass |
| 브라우저 인수 | 15개 시나리오 pass, page error 0 |
| 폐기 심볼·경로·문구 검사 3개, `git diff --check` | pass |

새 브라우저 회귀는 요금제·읽기 전용 전환 후 초안과 CAS 보존, 읽기 전용 상태의
stale 회복, pending 중 받은 최신 자기 정의의 버전 보존을 포함한다.
기존 fifth-pass HTTP 인수의 제안 입력에도 필수 pipelineId와 완전한 기본
Pipeline fixture를 적용했다. 운영 DB와 운영 배포는 이 검증에 포함하지 않았다.

아래는 최초 구현 당시의 기록이다.

2026-10-15, [제안서](../../proposals/active/multiple-pipelines.md)의 Phase 1–5를 구현했다.
기준선은 원격 dev `c60a906498964ee2d72234b114319ddbc98a1bce`, 작업 브랜치는
`harness/multiple-pipelines`다. 원래 checkout의 미커밋 plugin-clean-code 작업과
겹치는 core·protocol 파일이 있어 별도 worktree에서 작업했다.

## 구현

- 이름 있는 Pipeline, 원본 Definition, type Rule, 기본 선택, 보관과 이름 변경을 추가했다.
- 참조·조각·중첩·이음매 게이트를 펼쳐 실행 판을 만들고, 직접·간접 사용처도 같은 트랜잭션에서 재조립한다. 기존 런은 기존 실행 판을 유지한다.
- PM 자동 선택을 프로젝트 설정으로 분리했다. Scout의 설정·중단 계약은 유지한다.
- 웹 제안에서 Pipeline을 고르고, 아직 실행하지 않은 Proposed 항목의 Pipeline을 바꿀 수 있다. 새 entry와 감사 이벤트를 함께 기록한다.
- Pipeline 편집 화면, 규칙, 보드 Team·파이프라인 이름, Item·History 표시를 연결했다. Free·미선택·연결 해제의 읽기 전용 상태와 stale·응답 유실 회복을 처리한다.
- migration A만 포함했다. `PipelineVersion.pipelineId`는 첫 release에서 nullable이다. 정의·판 없는 기본 Pipeline은 쓰기 때만 생성하며 GET/head는 쓰지 않는다.
- 웹 전용 정보와 변경 액션을 MCP schema에 추가하지 않았다. plugin/lib는 core와 일치한다.

## 검증 결과

Node 22.13.1, 저장소에 설치된 Next 16.3.3·Prisma 7.10.0, 별도 PostgreSQL 18과
루프백 production Next 서버를 사용했다. 운영 DB·실제 사용자 세션은 사용하지 않았다.

| 검사 | 결과 |
| --- | --- |
| 코어·플러그인 전체 (`npm test`와 같은 node test 대상) | 347 pass, 기존 환경 조건 2 skip |
| 웹 전체 (`npm run test:web`와 같은 node test 대상) | 598 pass |
| 서버 전체, fresh build action manifest 검사 포함 | 64 pass, 기존 환경 조건 1 skip |
| PostgreSQL 통합 전체 | 125 pass |
| 이후 추가한 timeout·동시 중복 변경 포함 관련 통합 파일 | 9 pass; 전체 실행 뒤 새로 추가한 사례 2개도 통과 |
| `npm run check` | pass; lint 경고 없음, FSD·타입·architecture 44 pass/2 skip·project availability 18 pass 포함 |
| `verify:fsd`, 추가 타입 검사, 최종 UI 회귀 | pass; UI 8 pass |
| fresh production build | pass |
| `rehearse-multiple-pipelines.ts` | pass; 실제 액션 8종과 Pipeline·Backlog·Board·Item·History 본문 |
| `rehearse-multiple-pipelines-browser.mjs` | Edge headless에서 12개 시나리오 pass, page error 0 |
| 제안서의 옛 심볼·경로·사유 검색 3개 | 모두 무일치; untracked 소스 포함 |
| `git diff --check`, core/plugin mirror | pass |

통합 검증에는 migration A의 모든 predecessor 재생, populated legacy/slots/빈 프로젝트
백필, 원장·커서·run 보존, rollback SQL, 버전 상한, 부분 저장 실패, 실제 DB timeout,
최초 생성 경합, 양방향 저장 경합, 잠금 대기 중 downgrade, 간접 재조립, 기존 실행 판
재사용, 변경/에이전트 시작 경합, CAS 중복 클릭, 프로젝트 전체 미결 상한과 MCP 응답의
정확한 key 집합을 포함했다.

실제 HTTP 검증은 소유자 대조군과 타인·무세션·Free·미선택·연결 해제 거부를 확인했다.
Free에서도 기존 Pipeline 선택과 항목 변경은 허용되며, 편집과 설정은 거부된다.
History Items 펼침과 Events 모두 변경 이름을 표시한다.

브라우저 검증은 새 초안의 첫 단계·끝 연결, 조각 저장, dirty 초안 보존, 보관 후 기본으로
이동, pending 중 이동·중복 쓰기 방지, stale/unknown 명시적 reload, unmount 후 응답 무시,
의존 정의만 바뀐 snapshot, 무게이트 확인 초기화, 연결 내부 슬롯 id 예약, 40자 이름의
390px 화면 배치를 확인했다. 데스크톱·모바일 캡처를 직접 검토했다.

재실행:

```sh
# TEST_DATABASE_URL은 운영 DATABASE_URL과 다른 격리 DB여야 한다.
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-multiple-pipelines.ts
node scripts/rehearse-multiple-pipelines-browser.mjs <playwright-core/index.mjs> <browser-executable>
```

## 구현 중 확인한 차이

Prisma PostgreSQL adapter는 raw INSERT/FOR UPDATE의 SQLSTATE 40001을 P2010으로
감싼다. 기존 delegate 충돌과 같은 P2034 계약을 유지하도록 이 두 transaction conflict
상태(40001·40P01)만 정규화했다. 자동 재시도는 하지 않는다. 최초 제안이 Project의 기본
id를 생성하는 경우에도 경쟁 삭제는 기존의 “The item changed” 거부로 돌아간다.

## 별도 release·운영 절차

Phase 6의 migration B와 required Prisma schema는 아직 적용하지 않았다. 제안서대로
첫 release가 dev에 병합된 뒤 별도 cleanup release로 추가하고 B 전후 검증을 수행한다.
첫 release에 B 디렉터리를 함께 넣으면 `migrate deploy`가 한 번에 실행하므로 금지한다.

운영 maintenance·백업·DB migration·서버 배포·private bundle 지원 인증·dev/main 승격은
이 로컬 구현 검증으로 완료 처리하지 않는다. 제안서의 배포·롤백 순서를 따른다. 원래
checkout의 plugin-clean-code 작업과 늦게 통합하는 쪽은 dev 위에서 충돌을 해결하고 다시
검증해야 한다. 이 때문에 제안서는 active에 유지한다.
