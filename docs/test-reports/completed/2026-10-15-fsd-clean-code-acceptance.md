---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static", "component", "integration", "contract", "end-to-end", "manual"]
test-tools: ["Node.js test runner", "TypeScript", "ESLint", "Next.js build", "Playwright MCP", "curl"]
created-at: "2026-10-15"
completed-at: "2026-10-15"
last-executed-at: "2026-10-14T22:54:09Z"
tested-revision: "c60a906498964ee2d72234b114319ddbc98a1bce + harness/fsd-clean-code working tree"
owners: ["user:Sangeok"]
related:
  - "docs/proposals/completed/2026-10-15-fsd-frontend-clean-code-review.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/verification.md"
primary-area: "frontend/fsd-clean-code"
observed-environments:
  - "local | Next production + isolated PostgreSQL | macOS/Chrome 153 | fixture owner"
  - "local | actual component fixtures | React 19.2.8 production/development | no production account"
test-summary: "pass: FSD-001~008 구현 인수 — 상태 계산·계약·국소 복구·토큰 결과·목록 identity·모델 이동·키보드 검증 통과"
follow-up: []
---

# FSD 클린코드 개선 인수 결과

## Summary and Decision

제안서의 8개 항목을 구현한 작업 트리를 검증했다. 자동 게이트와 실제 컴포넌트 시험,
격리 DB를 사용하는 Next Server Action·응답 유실 시험을 통과했다.
실행 결과는 로컬 구현 인수이며 운영 배포나 다른 브라우저의 지원 인증을 뜻하지 않는다.

## Scope and Criteria

| 기준 ID | 기준 문서 | 확인 기준 |
| --- | --- | --- |
| R1 | 제안서 FSD-001 | Team에서 실행 우선, 같은 우선순위 순서·on_hold 제외 유지 |
| R2 | 제안서 FSD-002 | schema 입력 타입의 단일 출처, 기존 payload/auth/CAS·Action 등록 보존 |
| R3 | 제안서 FSD-003 | Reopen 실패만 국소 복구, retry는 재조회만 수행 |
| R4 | 제안서 FSD-004 | 토큰 거부/결과 미확인 구분, 이전 평문·만료 보존, 수동 조회·폐기 |
| R5 | 제안서 FSD-005 | 같은 URL의 별개 제출과 Plan을 안정적인 ID로 보존 |
| R6 | 제안서 FSD-006 | Billing 표·시험 소유권 이동, 값·공용 planLabel 보존 |
| R7 | 제안서 FSD-007 | export 개수 고정 제거, 선언/runtime·RuleKind 집합 검증 유지 |
| R8 | 제안서 FSD-008 | radio 인스턴스별 name 및 실제 키보드 탐색 분리 |

운영 데이터·배포·Windows 실제 역할 실행·모바일 및 다른 브라우저는 범위 밖이다.
새 DB migration·권한 정책·외부 API·앱 의존성 변경은 없다.

## Test Target

기준 commit 대비 이 제안의 앱·시험·문구 변경을 포함한 dirty working tree를 사용했다.
최초 검토 브랜치와 구현 기준 dev의 앱 코드는 같았으며 다른 공개 문서 제안서만 달랐다.
Next 16.3.3과 설치된 React를 사용했고 production build의 실제 Action registry를 검사했다.
서버는 loopback에서만 실행했다. 실제 계정 대신 시험 소유자와 외부 소유자 fixture를 사용했다.

## Preconditions and Test Data

환경에 DB URL과 PostgreSQL 실행 파일이 없어 임시 폴더에만
[embedded-postgres](https://github.com/leinelissen/embedded-postgres) 18.4.0-beta.17을 준비했다.
저장소 package.json·lockfile은 변경하지 않았다. 무작위 암호는 권한 0600의 임시 파일에만 두고,
`stagekeeper_test_fsd` DB에 저장소의 기존 migration을 적용했다.

Reopen은 기존 Inbox fixture와 함께 별도 done 항목을 준비했다. 토큰은 종류별 기존 항목이 있는 상태에서
새 발급 응답을 유실시키고, 같은 이름의 기존 항목과 새 항목을 Reference로 구분했다.
모든 fixture는 `/finish`에서 자기 사용자를 cascade 삭제한다. 마지막 read-back 후 임시 DB도 종료했다.

## Test Matrix

| ID | 기준 | Gate | 시나리오·기대 결과 | 실제 결과 / 증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | qa·impl-verify·project agent/번호 slot에서 working 우선 | 모델 회귀 통과 — E1 | PASS |
| T2 | R2 | required | 네 feature의 validation·type-only 의존·기존 권한/예외/등록 유지 | 정적·서버·fresh registry 통과 — E1, E2 | PASS |
| T3 | R3 | required | 저장 전 실패와 retry | 전이 증가 없이 done 유지, 본문 보존 — E4 | PASS |
| T4 | R3 | required | 저장 후 응답 유실과 retry | 전이 한 건, retry 추가 전이 없음, 최신 implementing 표시 — E4 | PASS |
| T5 | R3 | required | read-only 및 non-done Reopen 제한 | read-only에서 버튼 없음, 복구 후 non-done에서 Reopen 없음 — E4 | PASS |
| T6 | R4 | required | 세 폼의 성공→실패/unknown→refresh→명시적 재시도 | 이전 토큰·만료 유지, 성공만 교체 — E3 | PASS |
| T7 | R4 | required | 세 종류 실제 발급의 커밋 후 유실·재조회·개별 폐기 | 각각 +1, refresh +0, 새 Reference만 폐기 — E5 | PASS |
| T8 | R5 | required | 같은 URL의 Plan/보고 추가·삭제·재정렬 | 행·DOM identity 유지, development duplicate-key 경고 0 — E3 | PASS |
| T9 | R6, R7 | required | Billing 이동의 새 존재/옛 부재, core 계약 집합 | 모델·렌더·구조 시험 통과 — E1 | PASS |
| T10 | R8 | required | 실제 ArrowLeft/Right·Tab/Shift+Tab | 같은 그룹 안에서 순환, 다른 선택값 유지 — E6 | PASS |
| T11 | R2, R4 | required | 실제 토큰 인증/권한·사용량·요청 제한 보존 | 기존 HTTP 리허설 전체 통과 — E5 | PASS |
| T12 | R1~R8 | required | fixture/DB/자격 정보 정리 | 사용자·프로젝트 0, 서버·DB 종료 — E7 | PASS |

## Commands and Static Checks

테스트의 `TMPDIR`는 macOS 경로 별칭을 피하는 `/private/tmp`였다.

| ID | 연결 대상 | Gate | 명령/방법 | 실제 결과 / 증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| C1 | R1~R8 | required | `npm run verify:fsd`, `npm run check` | lint·typegen·tsc·architecture·availability 통과 — E1 | PASS |
| C2 | R1~R8 | required | `npm run test:web` | 606/606 — E1 | PASS |
| C3 | R2, R3, R4 | required | `npm run test:server` | 56 통과·manifest 조건부 1 skip — E2 | PASS |
| C4 | R2 | required | fresh build 후 `SRC_CHECK_INBOX_MANIFEST=true RDC_CHECK_ACTION_MANIFEST=true npm run test:server` | 62/62, skip 0 — E2 | PASS |
| C5 | R1~R8 | required | `npm test` | 333 통과·플랫폼/환경 조건부 10 skip — E1 | PASS |
| C6 | R1~R8 | required | `npm run build` | 깨끗한 production build 통과 — E2 | PASS |
| C7 | R2, R3, R4 | required | `npm run test:server:integration` | 테스트 DB migration 및 전체 통합 시험 통과 — E2 | PASS |
| C8 | R3~R5, R8 | required | UI-only production/development fixture + Playwright | 각각 42/42 — E3 | PASS |
| C9 | 보고서·제안서 | required | YAML parser·상대 경로·상태/날짜·diff 검사 | 구조·링크·변경 범위 확인 — E8 | PASS |

`npm run docs:check`는 현재 package.json에 정의되어 있지 않다. C9는 직접 구조 검증이며 존재하지 않는 명령의 통과를 주장하지 않는다.

## Evidence Registry

| ID | 종류 | 정제된 증거 | 보존 |
| --- | --- | --- | --- |
| E1 | 자동 검사 | FSD 경계 통과. architecture 44 통과·Windows 전용 2 skip, availability 18/18. FSD 집중 시험 276/276, 전체 src 시험 606/606. core/plugin 333 통과·10 skip | 본문 |
| E2 | build/contract/DB | Next production compile·타입·route 수집 성공. fresh registry의 기존 Action과 inline mutation 수 유지, schema/loader/boundary 원격 등록 없음. 전체 DB 통합 runner exit 0 | 본문 |
| E3 | 브라우저 컴포넌트 | production와 development 각각 42건 Pass/0 Fail. 기존 form/copy/turn 시험과 신규 토큰 6개 시나리오·Documents 시나리오 포함. 문서 DOM을 재정렬해도 같은 보고 node 보존, duplicate-key 0 | 본문 |
| E4 | 실제 Next/DB read-back | 초기 done/이벤트 1/요청 0 → precommit fault 뒤 done/1/1 → retry 뒤 done/1/1 → postcommit fault 뒤 implementing/2/2 → retry 뒤 implementing/2/2. 매 fallback에서 Evidence·Documents·History 유지. read-only에서는 Reopen 버튼 없음 | 본문 |
| E5 | 실제 토큰/DB read-back | HTTP 리허설: 3 token lifecycle·6 auth/rate 경로·15 request boundary·SDK 제외·plan snapshot 통과. UI 유실 시험은 각 종류 기준 6→7건, 평문 미표시·unknown 안내. Refresh list 뒤 7건 유지. 지정한 새 항목만 revoked, 같은 이름의 모든 기존 항목 revoked 값 불변 | 본문 |
| E6 | 실제 키 입력 | hs 선택기 ArrowRight 두 번은 Codex→Claude로 내부 순환. Shift+Tab 복귀·ArrowLeft도 hs 내부 유지. ho의 첫 옵션에서 ArrowLeft는 ho의 Codex로 이동하고 hu는 Claude 유지. Tab은 선택 안 된 같은 그룹 radio를 건너 Copy로 이동 | 본문 |
| E7 | 정리 | 두 실제 리허설 `/finish` exit 0. DB query 결과 users=0/projects=0. PostgreSQL 종료 후 data directory 없음 확인. signal 종료 뒤 남은 임시 credential 파일은 별도 삭제 확인 | 본문 |
| E8 | 문서 | 평면 YAML metadata, 날짜/경로, 승인·완료 상태, 상대 문서 링크와 whitespace를 직접 검증. 앱 수정 없이 문서 검증 수행 | 본문 |

원본 로그·브라우저 snapshot·세션·토큰·DB URL은 저장소에 넣지 않았다. fixture 식별자도 본문에서 제거했다.

## Findings and Follow-up

열린 제품 결함은 발견하지 않았다. 초기 sandbox에서는 localhost 시험과 Turbopack의 포트 바인딩이 거부됐다.
권한을 허용한 시험은 통과했고, build는 실패가 남은 기존 `.next`를 임시 위치로 보존한 뒤 깨끗하게 다시 실행해 통과했다.
프로젝트 build 설정이나 검사기를 완화하지 않았다.

추가로 시도한 익명 브라우저 fetch는 로컬 proxy의 다른 포트 로그인 redirect 때문에 CORS 오류가 났으므로 인증 통과 근거로 사용하지 않았다.
인증·비소유자·CAS 보존의 근거는 서버 계약 시험과 실제 토큰 HTTP 리허설이며, Reopen의 실제 화면 인수는 T3~T5 범위다.
다른 브라우저와 운영 배포는 이 보고서의 범위 밖이다.

## Test Data and Cleanup

| 리소스 | 정리와 최종 상태 | 남은 영향 |
| --- | --- | --- |
| Reopen·token fixture 사용자/프로젝트/토큰/이력 | `/finish` 후 users=0/projects=0 read-back | 없음 |
| UI fixture의 React root·보류 Promise·clipboard/console 대체 | Finish 및 cleanup 수행, 두 모드 정상 종료 | 없음 |
| 임시 PostgreSQL data와 credential 파일 | 서버 종료·data 제거 확인, credential 별도 삭제 | 없음 |
| Playwright 작업 탭 | 닫음 | 없음 |
| 임시 설치 도구·캐시·이전 `.next` 백업 | `/private/tmp`의 비배포 로컬 자료, 자격 정보 없음 | 저장소 변경 없음 |

## Conclusion

required T1~T12와 C1~C9가 모두 통과했다. 제안의 구현을 완료 처리할 수 있다.
작업 트리의 변경을 대상으로 한 판정이며 커밋·PR·운영 배포는 별도 단계다.

## Review Checklist

- [x] 기준 ID, gate, 실제 결과와 증거를 연결했다.
- [x] 역사적 기준선과 이번 구현 검증을 구분했다.
- [x] 오류 주입에 따른 의도된 console error와 제품 결함을 구분했다.
- [x] 민감정보를 제외하고 데이터·서버 정리를 확인했다.
- [x] metadata·문서 링크를 구조적으로 확인했다.
