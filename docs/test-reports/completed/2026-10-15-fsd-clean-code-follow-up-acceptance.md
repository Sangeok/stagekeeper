---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static", "component", "integration", "contract", "end-to-end"]
test-tools: ["Node.js test runner", "TypeScript", "ESLint", "Next.js build", "Playwright MCP", "PostgreSQL"]
created-at: "2026-10-15"
completed-at: "2026-10-15"
last-executed-at: "2026-10-15T05:43:54Z"
tested-revision: "131cb7444bfd61d82f492f0cf9bc5046a30609a3 + harness/fsd-clean-code-follow-up working tree"
owners: ["user:Sangeok"]
related:
  - "docs/proposals/completed/2026-10-15-fsd-frontend-clean-code-follow-up.md"
  - "docs/architecture/verification.md"
primary-area: "frontend/fsd-clean-code-follow-up"
observed-environments:
  - "local | macOS/Chromium | React 19.2.8 production/development fixtures"
  - "local | Next 16.3.3 production + isolated PostgreSQL | fixture owner"
test-summary: "pass: FSD-R02/R03/R04 구현, 웹 628·브라우저 각 56·실제 두 탭/응답 유실과 DB read-back 검증 완료"
follow-up: []
---

# FSD 클린코드 후속 개선 인수 결과

## Summary and Decision

서버 snapshot 갱신과 편집 초안의 수명을 분리했고, Board의 다른 에이전트 실행을 dev에게 잘못 표시하는 조건을 수정했다.
Billing의 공개 API 검사는 필요한 계약과 금지된 선언만 검사하도록 좁혔다.
제안서의 Core 세 항목을 구현·검증 완료했다. 커밋·PR·배포는 이 작업에 포함하지 않았다.

## Scope and Criteria

판정 기준은 [완료 제안서](../../proposals/completed/2026-10-15-fsd-frontend-clean-code-follow-up.md)의 V02–V06 및 DoD다.
서버 인증·플랜·가용성·CAS·DB schema·의존성·Next 설정은 변경하지 않았다.

| 기준 | 범위 | 확인 기준 |
| --- | --- | --- |
| R02 | Billing 모델 시험 | 적법한 export 확장 허용, 필수 planLabel 및 금지된 세 이름/소유권 검사 유지 |
| R03 | pipeline route/page/rail·내부 상태 모델 | 초안·CAS·최신 snapshot·pending·recovery·프로젝트 identity 분리, 읽기 전용 로컬 폐기 |
| R04 | Board 모델·loader·본문 | 현재 plan/implement 노드의 workspace agent만 Working/Ready 후보 |
| V05 | 공통 게이트·fresh registry | 기존 경계 통과, 두 Action 등록, 내부 모델 비등록 |
| V06 | 실제 Next/DB | 두 탭 충돌, Scout 독립성, 저장 전/후 응답 유실, reload 추가 쓰기 없음 |

## Test Target

원격 dev와 최초 검토 기준 사이의 앱 소스 차이가 없음을 확인하고 새 feature 브랜치에서 작업했다.
대상은 해당 기준 대비 dirty working tree다. 실행한 코드·시험·리허설 15파일의 SHA-256을
[관찰 기록](../assets/2026-10-15-fsd-clean-code-follow-up-acceptance/observations.json)에 보존한다.

실제 React 컴포넌트 fixture에서는 Action과 router를 대역으로 사용했다.
실제 서버 인수에서는 fresh production build의 Action registry와 동일한 서버 코드를 사용했다.
운영 계정·운영 DB·배포 환경을 사용한 시험은 아니다.

## Preconditions and Test Data

기존 임시 도구 디렉터리에 준비되어 있던 embedded-postgres 실행 파일을 재사용하고 새 데이터 디렉터리를 만들었다.
loopback 전용 임시 PostgreSQL의 별도 `stagekeeper_test_follow_up` DB에 기존 migration을 적용했다.
무작위 암호는 권한 0600의 임시 파일에만 저장했고 저장소 의존성은 변경하지 않았다.

실제 Next/DB 시험은 기존 리허설의 fixture 소유자를 사용했다. 최초 pipeline은 version 1이며,
두 탭 저장과 응답 유실 후 최종 version은 3이었다. 세션·토큰·DB 자격 정보는 증거에 넣지 않았다.
`/finish`에서 fixture 사용자를 cascade 삭제하고 연결·자식 서버를 종료한 뒤 임시 PostgreSQL도 종료했다.

## Test Matrix

| ID | 기준 | Gate | 시나리오 | 실제 결과 / 근거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R04 | required | 실제 슬롯 4종×실행/대기, dev 자신의 작업·gate/null cursor·기존 우선순위 | 새 모델 회귀는 수정 전 9개 실패, 수정 후 통과. 모델·HTML·실제 loader에 dev 단언 추가 | PASS |
| T2 | R02 | required | 정상 type/value export 추가, 필수 값 누락, 금지된 PlanRow/planMatrix/BILLING_NOTE | 메모리 소스 검증과 기존 Billing/planLabel 렌더 통과 | PASS |
| T3 | R03 | required | clean/dirty·version 0·pending·stale/unknown·낮은 snapshot | 새 순수 상태 모델 9개 시험 통과, immutable 요청과 CAS baseline 보존 | PASS |
| T4 | R03 | required | page key·Action 참조·서버 설명 본문 | 신규 page 시험 2개 통과, projectId만 key에 사용 | PASS |
| T5 | R03 | required | 실제 page의 snapshot/plan/roster/readonly·동시 응답·프로젝트 전환 | 신규 14개를 포함한 전체 fixture 56개가 production/development 각각 통과. development pageerror 0 | PASS |
| T6 | R03/V06 | required | A 초안 → B 저장 → A Scout 변경 | version 수 1→2, graph Save 1회·Scout 1회. A의 제거한 Propose와 유지한 Verify가 보존되고 stale 복구 표시 | PASS |
| T7 | R03/V06 | required | savePipeline 전달 전 응답 유실 | version 수 2→2, 해당 Save 요청 1회. unknown 안내와 Save 차단, 명시적 reload도 2 유지 | PASS |
| T8 | R03/V06 | required | 저장 후 응답 유실 | version 수 2→3, 해당 Save 요청 1회. unknown 복구의 reload도 3 유지, 자동 재제출 없음 | PASS |
| T9 | R03/V06 | required | 최종 실제 화면과 DB 일치 | rail·Version 3·Read as text가 DB graph와 일치. GET 추가 쓰기 0 | PASS |
| T10 | V05 | required | fresh Action registry | savePipeline/saveAutomaticScout 등록 및 private pipeline-draft-state 비등록 시험 실행·통과 | PASS |
| T11 | V06 | required | cleanup | User·Project·PipelineVersion 각각 0, 세 listener 종료, 임시 DB data·자격 파일 제거 | PASS |

실제 HTTP 인수의 숫자·graph·호출 수와 최종 본문은 관찰 기록의 `http`, `finalBody`, `cleanup`에 있다.
T5는 실제 컴포넌트 시험이며 T6–T9의 Next revalidation·DB read-back을 대신하지 않는다.

## Commands and Static Checks

| 명령/확인 | 결과 | 비고 |
| --- | --- | --- |
| 집중 모델·UI·Billing 시험 | 77 pass, 이후 신규 page 시험 2 pass | 이후 전체 web에도 포함 |
| `env TMPDIR=/private/tmp npm run check` | PASS | 복사본·ESLint·typegen·TypeScript·architecture 44 pass/2 skip·가용성 18 pass |
| `npm run verify:fsd` | PASS | 예외 추가 없음 |
| `env TMPDIR=/private/tmp npm run test:architecture` | 44 pass, 2 skip | Windows 전용 실행 2건 제외 |
| `env TMPDIR=/private/tmp npm run test:web` | 628 pass, 0 fail | 신규 모델·page·Board·Billing 포함 |
| `env TMPDIR=/private/tmp npm run build` | PASS | Prisma generate·Turbopack·TypeScript·정적 페이지 18개 |
| `RDC_CHECK_ACTION_MANIFEST=true npm run test:server` | 138 pass, 1 skip | 별도 opt-in Inbox client manifest 시험만 skip. 새 pipeline registry 시험은 PASS |
| `npm run test:server:integration` | PASS | 격리 DB의 migration + 전체 통합 시험, 실제 CAS 경쟁 포함 |
| UI 리허설 `--ui-only`, `--ui-only --fixture-development` | 각각 56 pass | `/results`와 최종 DOM 결과 수집 |
| 실제 DB 리허설 | PASS | 아래 명령과 임시 TEST_DATABASE_URL 사용 |
| 최종 diff·문서 metadata·링크·증거 구조 확인 | PASS | 코드 검증 이후 문서만 마무리 |

실제 DB 리허설의 실행 명령:

```bash
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearse-src-clean-code.ts
```

`--ui-only`는 서버 서비스를 import하지 않아 기존 `node --import tsx ... --ui-only`를 사용한다.
DB URL은 전용 임시 wrapper가 주입했으며 이 보고서에는 기록하지 않는다.

## Findings and Retest History

- Board의 신규 9개 실패는 수정 전 결함 재현이다. worker 후보에 현재 노드/실행 주체 조건을 추가한 뒤 기존·신규 시험이 모두 통과했다.
- 최초 실제 DB 리허설은 server-only bootstrap을 누락한 명령으로 실패했다. 기존 테스트 bootstrap을 명시한 명령으로 재실행해 통과했고 제안서·검증 지침도 고쳤다. 앱의 server-only 경계를 제거하지 않았다.
- 최초 브라우저 driver가 결과 POST 전에 빈 `/results`를 읽은 시도는 통과로 집계하지 않았다. `#acceptance-results`와 결과 전달 완료를 기다린 실행에서 56개를 확인했다.
- 인수 중 발견한 미해결 제품 결함은 없다. 위 검증은 모든 브라우저나 운영 환경의 보장을 뜻하지 않는다.

## Evidence Registry

| ID | 증거 | 역할 |
| --- | --- | --- |
| E1 | 인접 모델·page·Board·Billing 및 서버 시험 | 반복 가능한 동작/계약 회귀 |
| E2 | 관찰 기록의 source_sha256·ui | dirty source identity 및 실제 컴포넌트 인수 |
| E3 | 관찰 기록의 http·finalBody | 실제 두 탭·응답 유실·DB/read-only GET·본문 일치 |
| E4 | 관찰 기록의 cleanup | 데이터·listener·임시 DB/자격 파일 정리 |

## Cleanup and Residual Risks

실제 인수 fixture의 User·Project·PipelineVersion은 모두 0건이었다.
55451(Next), 55452(proxy/fixture), 55491(DB)의 listener가 모두 닫혔고 임시 DB data와 자격 파일이 제거됐다.
브라우저 인수 context/tab과 보류 응답도 정리했다. 소스와 빌드 chunk에 fault 계측은 남기지 않았다.

애플리케이션과 증거는 작업 트리에 있으며 배포되지 않았다. 별도 운영 배포 또는 다른 브라우저에서의 확인은 이 완료 범위 밖이다.

## Completion Notes

Core 세 항목과 제안서의 검증 범위를 모두 수행했다. 제안서를 completed로 이동했다.
재검토 시 현재 소스가 관찰 기록의 SHA-256과 다른지 먼저 확인한다. 과거 통과 기록을 다른 소스의 결과로 재사용하지 않는다.
