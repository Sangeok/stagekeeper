---
status: "completed"
stage: null
result: "pass"
report-kind: "regression"
report-size: "standard"
test-levels: ["static", "component", "contract", "integration"]
test-tools: ["Node.js 26.4.0", "TypeScript", "Prisma", "PostgreSQL 18", "Next.js 16.4.2", "Ruby YAML"]
created-at: "2026-11-04"
completed-at: "2026-11-04"
last-executed-at: "2026-11-04T01:53:42Z"
tested-revision: "2d838de49fb9570bd6f348229f4c528552d9d117"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/template-release-versioning.md", "docs/architecture/template-releases.md", "docs/architecture/verification.md"]
primary-area: "harness/template-releases"
observed-environments: ["local | macOS arm64 | isolated worktree and PostgreSQL | synthetic accounts and source fixtures"]
test-summary: "pass: local implementation regression, immutable releases, execution pins, installation commit and operator recovery; native platform and production acceptance excluded"
follow-up: ["docs/proposals/active/template-release-versioning.md"]
---

# 템플릿 릴리스 구현 검증

## Summary and Decision

Core 구현의 로컬 검증을 통과했다. 불변 릴리스, 실행별 선택, 호환되지 않는 항목의 무전진,
부분 설치 보존, 이관의 원자성과 운영 CLI 결과 유실 복구를 확인했다.
이 결과는 native Windows/macOS 플러그인 로더·실제 모델 실행이나 운영 전환의 인수가 아니다.
제안서의 TPL4와 출시 gate는 계속 열린 상태다.

## Scope and Criteria

사용자의 실제 코드 수정 요청으로 승인된 로컬 구현·격리 검증 범위다. 운영 DB, GitHub
environment 설정, 실제 배포 workflow 실행, 원격 push/merge와 private 저장소 수정은 제외했다.
현재 계약은 architecture 문서를, 설계 의도·미실행 출시 조건은 제안서를 따른다.

| 기준 ID | 기준 | 확인 범위 |
| --- | --- | --- |
| R1 | REQ-TPL-001/002/008, INV-TPL-001 | canonical identity, 완전한 검증·seal·중복 등록·결과 복구 |
| R2 | REQ-TPL-003/009 | 활성화 CAS와 기존 pin 보존 |
| R3 | REQ-TPL-004/005/006 | root/부모 선택, 재개, 같은 부모의 완료, 항목별 호환성 |
| R4 | REQ-TPL-010 | snapshot drift, 열린 귀속, receipt 전환, 과거 기록 보존 |
| R5 | REQ-TPL-007/011 | 현재 권한·plan·usage·token과 다운로드 경계 |
| R6 | REQ-TPL-006/013 | lock v2, pending/ready, guard, 실제 파일 검증과 전송 |
| R7 | VFY-TPL-09/10 | 정확한 출시 reader와 플랫폼·배포 증거의 구분 |
| R8 | CON-TPL-001 | architecture, 타입, lint, 빌드·배포 복사본 |

## Test Target

제품 변경은 `b7678a6`까지이며 마지막 기준 commit은 실제 CLI 통합 시험을 추가했다.
보고서와 제안서의 보고서 링크만 그 이후 문서 commit에 기록한다.
작업 브랜치는 `harness/template-release-implementation-20261103`이다.
원래 문서 작업 트리의 untracked proposal은 SHA-256
`99b4cff87ad94ff7abde292f434cf4b7b68b8e3156e60cfa512e8e70c7ecd2bd`로 그대로 보존했다.

private 입력은 앱으로 읽고 Git blob hash를 확인한
`Sangeok/harness-templates@fb6ef955ba3f6fc8320e173fbafc9ef03b83281b`의 13개 원문 행이다.
공개 저장소에 원문을 복사하지 않았다. 그 저장소 자체의 기존 `templates.test.mjs` 전체는
실행하지 않았으며, 새 trusted 시험의 통과를 해당 suite의 통과로 세지 않는다.

## Preconditions and Test Data

`TEST_DATABASE_URL` 검사를 통과한 작업용 PostgreSQL만 사용했다. 신규 release 시험은
고유 schema에 전체 migration을 처음부터 적용하고 Prisma와 raw SQL의 schema를 확인했다.
운영 CLI 시험은 별도 `stagekeeper_test_template_cli_*` DB와 synthetic Git 원본·private
profile을 만들고 실제 child CLI를 실행했다. 실제 GitHub private checkout의 운영 provenance
인수와는 구분한다. 테스트가 만든 schema/별도 DB/계정/연결만 정리했다.

초기 sandbox는 loopback HTTP/DB 및 Turbopack CSS worker의 포트 생성을 거부했다.
허용된 실행으로 재검증했고 실패 cache를 보존해 옮긴 뒤 production build가 통과했다.

## Test Matrix

| ID | 기준 ID | Gate | 시나리오 | 실제 결과 및 증거 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T1 | R1 | required | 중복 import, 불변 부모/entry, 저장 후 실패 rollback | release DB 시험과 core identity 시험 E1/E2 | PASS |
| T2 | R2 | required | 두 연결 CAS 경합, lost response replay, 포인터 변경 후 기존 pin | release·execution DB 시험 E1 | PASS |
| T3 | R3 | required | R1 재개/언어 유지, R2 root, 다른 부모 결과 배제, 혼합 overview | execution DB 시험 E1 | PASS |
| T4 | R4 | required | 귀속 누락·snapshot drift rollback, R0 pin·receipt 1회 증가, 과거 ledger 보존 | bootstrap DB 시험 E1 | PASS |
| T5 | R1/R2/R4 | required | 실제 CLI import→snapshot→bootstrap→activate→status/result와 replay | 별도 DB의 operator CLI 시험 E1 | PASS |
| T6 | R5 | required | token·현재 접근·plan·request budget·usage·소유권 회귀 | 기존 전체 web/server/integration suite E1/E3 | PASS |
| T7 | R6 | required | modified 파일·보고 실패·공유 문서 변경·fallback·v1 baseline·init/session barrier | 실제 init/HTTP·helper 회귀 E2/E3 | PASS |
| T8 | R1/R3/R6 | required | private 실제 HTTP 설치 6조합, 7개 graph, 양 client의 실제 step 분기 22조합 | trusted private 계약 시험 E4 | PASS |
| T9 | R7 | required | 출시 0.5.33 init의 ready/pending lock v2 거부와 무변경 | 정확한 `f2d7196675f8ee6f7b21581eac83cdc7bc2c8ecf` reader 실행 E2 | PASS |
| T10 | R8 | required | lint/type/FSD/server, 복사본, architecture, production build, 버전 일치 | E5/E6 | PASS |
| T11 | R7 | informational | 실제 native host의 새 hook 로딩·설치/업데이트와 Windows bundle | 이 작업에서 실행하지 않음. 로컬 helper 입출력 시험과 구분 | NOT RUN |
| T12 | R2/R4/R7 | informational | 운영 inventory·백업 복원·실제 workflow·이관/복구 | 대상과 승인 미사용. TPL4에서 별도 인수 | NOT RUN |

## Commands

| 명령 | 결과 | Evidence ID |
| --- | --- | --- |
| `npm run check` | lint/type/docs/FSD/server 및 scripts 280 pass, 2 platform skip | E5 |
| `npm run test:architecture` | 195 pass, 2 platform skip | E5 |
| `npm test` | 578 pass, 29 platform/environment skip, 0 fail | E2 |
| `npm run test:web` | 794 pass | E3 |
| `npm run test:server` | 176 pass, 2 build-manifest 조건 skip | E3 |
| `npm run test:server:integration` | 174 pass; migration 포함 | E1 |
| `HARNESS_RELEASE_SOURCE=<private path> HARNESS_RELEASE_COMMIT=<full SHA> npm run test:template-release` | 2 계약 시험 pass, 6 HTTP 조합과 22 step 조합 | E4 |
| `npm run build` | production compile, TypeScript, 정적 생성 통과 | E6 |
| `npm run verify:plugin-version -- --base origin/main --head HEAD` | 두 manifest의 0.5.33 → 0.6.0 확인 | E6 |
| Ruby YAML parser로 두 workflow 로드 | 문법 통과. GitHub Actions 실행 증거는 아님 | E5 |

## Evidence Registry

| Evidence ID | 재현 근거 | 관찰 |
| --- | --- | --- |
| E1 | `tests/server/integration/template-{release,execution,bootstrap,release-cli}.test.ts`, 전체 integration runner | 실제 SQL guard·transaction과 실제 CLI child 결과 |
| E2 | core release/watch와 plugin init/watch/background/session/installation/released reader 시험 | 실제 생성 파일, HTTP/JSON, process·파일 보존 |
| E3 | `src/server/rest/harness-init.test.ts`, 전체 web/server suite | 실제 CLI와 REST handler 조합, API 조립·기존 정책 |
| E4 | `tests/templates/private-template-release.test.ts`와 위 pinned 입력 | 실제 parser/renderer/agentNext·init, private 출력 비노출 |
| E5 | 저장소 검사 명령과 `scripts/checks/` | 경계·타입·문서·workflow 구문 |
| E6 | build log와 plugin version 검사 | server bundle 생성과 동일한 상위 plugin 판 |

작업 환경의 로그는 `/private/tmp/stagekeeper-template-release-` prefix 아래
`check-final.log`, `unit-current.log`, `web-final.log`, `server-current.log`,
`integration-current.log`, `architecture-current.log`, `build-current.log`로 보존했다.
private 원문이나 snapshot을 보고서 artifact로 게시하지 않았다.

## Findings and Follow-up

로컬 required 검증의 미해결 실패는 없다. 기존
`plugin/runtime/codex-main-loop-tools.mjs`의 `_key` unused lint warning은 이 범위에서
억제하거나 바꾸지 않았다. skip을 통과로 합산하지 않았다.

private 원문을 수정하는 대신 manifest에 포함한 공개 guide와 native hook/bridge로 R0에도
같은 설치 입력을 전달한다. 본문의 trailing bytes를 유지해 기존 관리 블록의 정확한 기준
렌더를 검증한다. 이 전달 계약과 운영자가 준비할 environment·snapshot·reader evidence는
[현재 아키텍처](../../architecture/template-releases.md)에 기록했다.

출시 전에는 실제 native loader/Windows bundle, 사용 중인 나머지 구형 reader 집합,
protected environment 설정과 workflow 실행, 운영 snapshot 복원·cutover·포인터 복구를
제안서의 gate로 확인해야 한다. 코드와 로컬 회귀 통과만으로 이 인수를 완료 처리하지 않는다.
