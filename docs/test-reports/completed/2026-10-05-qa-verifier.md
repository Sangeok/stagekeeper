---
status: "completed"
stage: null
result: "pass"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["static", "component", "integration", "contract"]
test-tools: ["Node test runner", "TypeScript", "ESLint", "Next production build", "PostgreSQL", "Playwright MCP", "headless Microsoft Edge"]
created-at: "2026-10-05"
completed-at: "2026-10-05"
last-executed-at: "2026-10-05T09:57:51Z"
tested-revision: "f9211a7d473fe2036c689e129d8ac5d6c58f619b + harness/qa-verifier working tree"
owners: ["user:Sangeok"]
related: ["docs/architecture/qa-verifier.md", "docs/architecture/protocol.md"]
primary-area: "pipeline/qa-verifier"
observed-environments: ["local | core/plugin/server | Node.js/Windows/PostgreSQL | synthetic projects", "local | browser broker | isolated headless Edge/Playwright MCP 0.0.83 | disposable fixture"]
test-summary: "pass: opt-in QA 역할·실행 바인딩·실패 차단·실제 브라우저 transport 검증 완료"
follow-up: []
---

# QA verifier 구현 인수

## Summary and Decision

선택 QA 노드, 독립 보고 역할과 양쪽 클라이언트 전달 경로를 구현했다.
현재 항목·pipeline entry·구현 커밋에 맞는 pass만 QA를 완료하며, 최종 인수는
main loop가 수행한다. 이 보고서는 로컬 구현과 격리 환경 검증을 인수한다.
운영 배포, 운영 DB migration/seed, 실제 모델을 통한 전체 작업 주기는 별도 범위다.

## Scope and Criteria

| 기준 ID | 근거 | 범위 | 확인 기준 |
| --- | --- | --- | --- |
| R1 | 사용자 QA 역할 생성 요청, architecture/qa-verifier.md | 역할·pipeline | implement와 accept 사이 선택 QA, 기존 기본 graph 유지 |
| R2 | 같은 문서 Authority and evidence | 판정·서버 | 현재 entry/target의 verify·report 성공과 pass만 완료, fail/blocked/stale 차단 |
| R3 | 같은 문서 Inputs and activation | 브라우저 | 실제 MCP에서 읽기·입력·저장·reload·이미지·console·network 관찰 |
| R4 | 같은 문서 Authority and evidence | 권한·호환성 | Codex 보고서 leaf만 쓰기, shell/owner/다른 역할 browser 권한 없음 |
| R5 | AGENTS.md, docs/architecture/README.md | 회귀 | FSD·architecture·lint·types·build 및 관련 전체 테스트 성공 |

실제 모델 판정 품질, 전체 Stagekeeper UI 사용자 흐름, 운영 데이터와 제품 출시
인수는 제외한다. 브라우저 fixture 성공을 실제 모델 QA 성공으로 해석하지 않는다.

## Test Target

- Public 작업 트리: 역할 entitlement/config, QA report schema, pipeline 실행,
  MCP/report 서버, client runtime, UI 노드 표시와 관련 테스트·문서 변경.
- Private `plugin/templates`: QA 역할 추가와 runbook/agent README/test 연동.
  작업 전부터 있던 dual-client 수정은 보존했다. Private 본문은 public Git에 넣지 않는다.
- MCP는 임시 설치한 `@playwright/mcp@0.0.83`, `--isolated --headless --browser msedge`로 실행했다.
  포트마다 정확한 `--allowed-hosts`를 지정하고 지정 artifact directory만 사용했다.
- DB는 테스트 전용 PostgreSQL 인스턴스와 신규 database를 생성했다.
  실제 운영 연결과 인증정보는 사용하지 않았다.
- `harness.json.qa` 설정과 scenario/build identity, 별도 테스트 서버는 사용 전제다.

## Preconditions and Test Data

- Core/plugin/web/server 테스트는 synthetic token/project와 로컬 fixture를 사용한다.
- DB rehearsal은 loopback 임시 포트, 신규 `stagekeeper_test_qa_verifier` DB에 전체 migration을 적용한다.
- 브라우저 fixture는 `Name`, `Save`, 상태 메시지와 localStorage만 가진 임시 페이지다.
  입력값 `Fixture Alice`는 가상 테스트 데이터다.
- 종료 시 MCP child·브라우저·HTTP fixture·임시 PostgreSQL 서버를 종료한다.
  증거와 멈춘 테스트 DB 파일은 Temp에 보존한다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | graph validation/advance/editor fixture | QA 선택·정확한 위치·기존 graph 호환 | Pro/Max만 허용, Free/중복/잘못된 순서 거부 — E1 | PASS |
| T2 | R2 | required | DB pass/fail/blocked 주기 | 현재 pass만 accept 진입 | QA 3개 실제 DB case 성공; 조기 인수·잘못된 target·누락 run 거부 — E2 | PASS |
| T3 | R2 | required | stale entry/reopen/query/watch tests | 과거 증거 재사용 차단, 다른 항목 진행 유지 | entry 교체 후 이전 report 거부, 완료 근거 누락 차단, QA wait는 다른 ready item 유지 — E1/E2 | PASS |
| T4 | R3 | required | 실제 Edge/MCP save/reload | 저장 값 유지와 실제 증거 반환 | 9개 browser check 성공, 이미지·snapshot refs 사용 — E3/E4 | PASS |
| T5 | R3/R4 | required | 브라우저 경계와 파일 snapshot tests | 지정 origin/tool/output만 사용 | 외부 origin·임의 filename·잘못된/대형 snapshot 거부 — E1 | PASS |
| T6 | R4 | required | Codex scoped files/HTTP bridge/role render | 보고서만 쓰기, 실제 관찰 없이 verify/ok 거부 | 제품·다른 item·Git 쓰기 거부, raw image 전달 및 receipt 유지 — E1 | PASS |
| T7 | R1/R4 | required | actual private role + server engine | 정상/실패/차단 분기와 두 client 전달 | QA 4개 engine case 포함 전체 template 성공; MCP 설정 충돌 보존 — E1 | PASS |

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- | --- |
| C1 | R1/R2/R4/R5 | required | `npm test` | 319 pass, 0 fail, 조건부 2 skipped — E1 | PASS |
| C2 | R1/R2/R5 | required | `npm run test:web` | 577 pass, 0 fail — E1 | PASS |
| C3 | R1/R4/R5 | required | `npm run test:templates` | 36 pass, 0 fail — E1 | PASS |
| C4 | R2/R5 | required | `npm run test:server` | 55 pass, 0 fail, 명시적 build-manifest 1 skipped — E1 | PASS |
| C5 | R2/R5 | required | isolated DB migration + all integration tests | migration 성공, 98 pass, 0 fail/skip — E2 | PASS |
| C6 | R5 | required | `npm run check` | plugin mirror, lint/FSD, typegen/tsc, architecture, project availability 성공 — E1 | PASS |
| C7 | R5 | required | `npm run build` | Next production build 성공 — E1 | PASS |
| C8 | R3 | required | `node tests/browser/qa-browser.rehearsal.mjs <mcp-cli-path>` | 9개 실제 browser check 성공 — E3 | PASS |
| C9 | R5 | informational | `git diff --check` | whitespace 오류 없음 | PASS |
| C10 | R5 | required | `SRC_CHECK_INBOX_MANIFEST=true`로 inbox-card-boundary test 실행 | build-manifest 포함 4 pass, 0 skip | PASS |

Core skip은 기존 조건부 native source-snapshot smoke와 POSIX 명령 항목이다.
Server suite의 build-manifest 조건부 skip은 C10에서 실제 build 이후 실행했다.
신규 QA case와 별도 실제 DB 통합 suite는 모두 실행했다.

## Evidence Registry

| ID | 종류 | 정제된 증거 또는 참조 | 보존 위치 |
| --- | --- | --- | --- |
| E1 | 테스트/빌드 | 위 명령의 최종 실행 요약; 원본 `stagekeeper-qa-{core,web,templates,server,check,build}.log` | 실행 머신 Temp, 자동 보존 기간 없음 |
| E2 | PostgreSQL | 신규 migration 적용, QA 3개 포함 98개 통합 테스트 전체 성공 | Temp/stagekeeper-qa-postgres-kALX68/integration.log |
| E3 | 실제 browser | test identity, snapshot refs, form interaction, save, reload, screenshot, console, network, 외부 origin 거부 | [browser-results.json](../assets/2026-10-05-qa-verifier/browser-results.json) |
| E4 | UI/read-back | 새로고침 후 `Saved Fixture Alice` 상태 | [reload snapshot](../assets/2026-10-05-qa-verifier/reload.yml), [screenshot](../assets/2026-10-05-qa-verifier/save-reload.png) |

민감정보 검토: 보존 snapshot과 screenshot을 직접 확인했다. 실제 계정·토큰·cookie·
개인정보는 없으며 가상 fixture 값만 포함한다. 대형 원본 로그와 MCP 설치물은 commit하지 않는다.

## Findings and Follow-up

최종 검증에서 미해결 결함은 없다. 개발 중 발견한 최신 MCP snapshot 파일 형식과
target 인자 차이를 반영했고, 고정 역할 수가 바뀐 기존 bundle fixture도 수정했다.
기존 watch parser에 QA wait를 추가해 실패 항목 때문에 다른 ready item이 막히지 않게 했다.
서버·private bundle rollout은 [운영 절차](../../architecture/qa-verifier.md#rollout-and-verification)를 따른다.

## Test Data and Cleanup

| 리소스 | 변경 | 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| 임시 DB | migration·synthetic project/run/report | 테스트 후 자체 PostgreSQL 서버 종료 | 멈춘 DB와 로그 Temp 보존 |
| 임시 Edge/MCP/HTTP | 페이지 입력·localStorage | isolated 브라우저와 MCP child, HTTP 종료 | 증거 파일 Temp 보존 |
| Public 운영 DB/외부 계정 | 변경 없음 | migration/seed/배포 미실행 | 없음 |

## Conclusion

모든 required 실행 항목이 PASS다. 소스 구현과 테스트 환경 transport·DB 계약을
검증했다. 실제 모델 QA 실행과 운영 전체 흐름은 이 판정의 범위가 아니며 출시
인수를 대신하지 않는다. Runtime/MCP/DB 계약이 바뀌면 관련 자동 테스트와
브라우저 rehearsal을 다시 실행한다.

## Review Checklist

- [x] 범위, metadata, 기준·gate·판정과 evidence 연결을 확인했다.
- [x] pass와 platform skip을 구분하고 신규 QA 테스트 실행을 확인했다.
- [x] snapshot/screenshot의 민감정보와 데이터 최종 상태를 확인했다.
- [x] 상대 링크와 public/private 경계를 확인했다.
- [x] `docs:check` script는 이 저장소에 없으므로 문서와 링크를 수동 검토했다.
