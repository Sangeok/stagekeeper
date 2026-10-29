---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-10-29"
approved-by: "requesting-user"
approved-at: "2026-10-29"
approval-scope: "현재 scripts 책임별 배치를 유지하면서 두 작업 차수형 리허설을 기능별로 개명하고, 웹 HTTP 리허설의 보고서 출력·실행 정보를 정비하며, 관련 npm 명령·문서·시험을 함께 갱신한다. 제품 검증 사례의 통합·삭제·tests 이동, 새 인수 runner·CI 도입, 운영 실행·배포·PR 병합은 포함하지 않는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/ADR/0004-organize-repository-scripts.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/server.md"
  - "docs/architecture/core.md"
  - "docs/architecture/test-organization.md"
  - "docs/test-reports/README.md"
  - "docs/test-reports/template.md"
  - "docs/proposals/README.md"
---

# 리허설 이름과 웹 HTTP 보고서 실행 계약 정비

## Summary

`scripts/`의 책임별 배치를 유지하면서 두 작업 차수형 리허설을 기능별로 정리하고,
웹 HTTP 보고서의 출력·실행 정보·기록 보존을 정비한다. 개명·CLI·기본 보고서는 이미
작업 트리에 반영돼 있다. 이후 구현 지시에 따라 보고서의 원자적 공개, JSON 재실행
manifest와 본문·실패 경계 시험까지 구현했다. 남은 Core는 준비된 격리 DB에서의
실제 HTTP·DB 인수다. 사용자가 현재 준비된 테스트 DB가 없다고 확인해 이 단계만 차단돼 있다.

이 문서는 `PHASE_PLAN`과 실행 기록이며 현재 작업 트리를 기준으로 삼는다. 2026-10-29
정합성 검토 이후 사용자가 이 문서를 바탕으로 실제 코드 수정을 지시했다. 그 지시에
따라 기존 미커밋 작업을 보존하면서 남은 helper·시험·실행 문서를 수정했다.
문서의 구현 준비 상태와 실제 구현·인수 완료는 별개의 판정이다.

## Goal

- 기능별 진입점과 기존 npm 명령·호환 경로를 함께 보존한다.
- 실행 시각·revision·결과를 기록하되, 불완전한 보고서가 완료된 통과 기록처럼 남지 않게 한다.
- 실제 코드, 남은 변경, 검증 증거와 미실행 항목을 구분해 후속 작업을 재현할 수 있게 한다.

## Proposal Size and Sources

저장소 형식은 `standard`다. 기존 작업부터 5개 이상 파일과 보고서 파일 쓰기에
영향을 준다. 정합성 검토의 Review Profile은 생성된 보고서 본문·파일 공개 순서를
다루므로 `High-Risk`다. 이는 제품 권한이나 아키텍처를 변경한다는 뜻이 아니다.

규범은 [AGENTS.md](../../../AGENTS.md), [검증 계약](../../architecture/verification.md#저장소-스크립트),
[서버 내부 참조 규칙](../../architecture/server.md#내부-참조-시험-목록),
[테스트 배치](../../architecture/test-organization.md), [core 경계](../../architecture/core.md),
[ADR-0004](../../ADR/0004-organize-repository-scripts.md),
[보고서 규칙](../../test-reports/README.md)·[템플릿](../../test-reports/template.md),
[proposal 규칙](../README.md)이다. 이 문서는 이 계약들을 완화하거나 대체하지 않는다.

## Current State

원본 비교 기준은 고정 커밋 `8775d5e6b51d654a2eda5ad28d7c7c6bfbaac7f5`다.
현재 기준은 `harness/rehearsal-script-maintenance`의 같은 HEAD와 미커밋 변경이며,
구현 전 정합성 검토의 식별자는 역사적 Reconciliation Basis에 있다. 현재 구현 내용은
아래 상태와 Verification Results를 따른다. 후속 커밋 뒤에도 원본 비교는
이 고정 커밋을 사용하고, 과거 경로를 현재 HEAD에서 찾지 않는다.

| 항목 | 현재 관찰 | 후속 작업 |
| --- | --- | --- |
| 백로그·파이프라인 | `rehearse-backlog-pipeline.ts`와 npm 연결이 존재한다. 원본 `main`·cleanup은 오류 위치 파일명 외 동일하다. | 재개명하지 않고 보존·검증한다. |
| 기존 fourth-pass | 한 줄 `import "./rehearse-backlog-pipeline";`이며 완료 제안서의 직접 링크가 남아 있다. | 호환 import와 이전 호출을 유지한다. |
| 웹 HTTP·Flight | `rehearse-web-http-contracts.ts`가 존재하고 old fifth-pass 파일은 없다. 원본 `acceptanceCases` 본문은 동일하다. | 현재 파일을 수정한다. 삭제된 원본을 다시 이동하지 않는다. |
| CLI·decoder | 지원 인자·도움말·IPC 모드 구분이 있고 7개 decoder 제어가 통과한다. | 기존 입력·worker·실행 순서를 유지한다. |
| 보고서 metadata | 현행 17개 필드·11개 standard 섹션·C/T/E 참조와 JSON manifest를 생성하고 직접 검증한다. | 실제 DB 인수에서도 전체 산출물 기준을 적용한다. |
| 보고서 공개 | `writeWebHttpReport`가 같은 parent의 `publishNewReport`를 호출해 완성된 temp를 배타적 hard link로 공개한다. | 구현·IO 회귀 시험 완료. 기존 공개 함수·타입은 유지했다. |
| 실제 쓰기 실패 | ENOSPC·close·link 실패에서 최종 파일 부재와 자기 descriptor/temp 정리를 검증했다. 선점·교체된 파일과 descriptor는 보존한다. | 기존 부분 completed/pass 결함은 수정했으며 본문 음성 fixture가 이를 거부한다. |
| UTC 날짜 변경 | 저장소 안 날짜형 경로는 시작일과 완료일이 달라지면 최종 검사에서 거부된다. | 실패·재실행 계약을 명시하고 날짜를 숨겨 바꾸지 않는다. |
| 실행 증거 | 확장한 도구 시험과 저장소 게이트 결과는 Verification Results에 기록한다. 실제 HTTP·DB 전체 인수는 미실행이다. | 로컬 결과를 실제 DB 인수로 확대하지 않는다. |

## Scope

**Core**는 기존 진입점 보존, 보고서 공개·본문·명령 표현의 보완, 해당 도구 시험과
현재 실행 문서 갱신, 정적 게이트와 실제 격리 HTTP·DB 인수다. 아래 파일·symbol·
동작·산출물·VFY가 이 범위의 전체 구현 목록이다.

**Out of scope**는 제품 검증 사례의 통합·삭제·`tests/` 이동, 나머지 리허설·fixture
개명, 새 package·runner·CI·`tests/acceptance/`, 제품 코드·DB schema·migration·
plugin runtime 변경, 완료된 과거 문서 변경, 운영 DB·seed·실제 모델·native client
실행·서비스 배포·PR 병합이다. 자동 날짜 재명명이나 임의 대체 출력 경로도 도입하지 않는다.
별도 Phase 2나 외부 승인을 기다리는 추가 기능은 이 계획에 섞지 않는다.

`src/`, `packages/core/`, `.github/`의 추적 파일 diff가 없고 두 검증 본문이 원본과
동일하다는 근거로 제품 권한·라우팅·캐시 동작 변경은 제외한다. 실제 HTTP의 기존
권한·본문·정리 검증은 보존해야 하므로 검증 대상에서는 제외하지 않는다.

## Concrete Inventory and Preflight

접두사 `scripts/rehearsals/`를 아래 리허설 파일 경로에 공통 적용한다.

| 정확한 파일 | 현재 상태 | 후속 처분·확인 |
| --- | --- | --- |
| `rehearse-backlog-pipeline.ts` | 존재 | keep. `main`, `readActionIds`, 종료 처리·오류 위치 이름 보존 |
| `rehearse-src-clean-code-fourth-pass.ts` | 존재: 호환 import | keep. 구현 복제·삭제 금지 |
| `rehearse-web-http-contracts.ts` | 존재 | update. `main`의 보고서 경계만 필요한 만큼 연결; `acceptanceCases` 보존 |
| `rehearse-src-clean-code-fifth-pass.ts` | 부재 | absent 유지. 재생성·재이동하지 않음 |
| `web-http-report.ts` | 구현 완료 | keep. 공개 함수·타입 유지, 완성된 파일 공개·소유권 확인·JSON manifest 반영 |
| `web-http-report.test.ts` | 확장 완료 | keep. metadata·본문·경합·쓰기/close/link/정리 실패·UTC 경계 시험 |
| `rehearsal-cli.test.mjs` | 확장 완료 | keep. 기존 4개 시험과 CLI 저장 실패·기존 경로·실제 산출물 검증 |
| `package.json` | 새 npm 대상 반영됨 | keep. `test:acceptance:backlog-pipeline` 이름·연결을 구조적으로 검사 |
| `docs/architecture/server.md` | 새 경로 두 행 반영됨 | keep. `pipeline`·`projects`의 정확한 등록·사유 보존 |
| `docs/architecture/verification.md` | 현재 구현 설명 반영됨 | keep. 원자적 공개·실패·JSON manifest와 실행 예를 실제 동작에 맞춤 |
| 이 proposal | active/pending/blocked | update. 코드·로컬 검증 완료와 실제 DB 인수 차단을 구분 |

모든 target parent는 이미 존재한다. 후속 작업은 기존 파일 수정이며 새 entrypoint나
sidecar를 만들지 않는다. 현재 파일이 표와 다르거나 다른 작업의 변경과 겹치면
덮어쓰지 않고 차이를 먼저 기록한다. 새 임시 보고서 파일만 실행별로 생성한다.

### Symbol and Import Provenance

| 필요한 symbol | 소유·공개 경로 | 현재/후속 소비·검증 위치 |
| --- | --- | --- |
| `FLIGHT_PROBE_CASES`, `WEB_HTTP_USAGE`, `parseWebHttpArguments` | `web-http-report.ts`의 named export | `rehearse-web-http-contracts.ts:runCli/consumerSelfTest`, 두 도구 시험 |
| `prepareWebHttpReport`, `WebHttpReportRun` | 같은 helper의 함수·타입 export | `runCli` → `main` → writer, CLI·metadata 시험 |
| `renderWebHttpReport`, `WebHttpCaseResult` | 같은 helper의 함수·타입 export | `writeWebHttpReport`와 보고서 시험; 앱 public API로 올리지 않음 |
| `writeWebHttpReport` | 같은 helper의 named export | `main`의 report closure, 파일 공개·CLI 실패 시험 |
| private `publishNewReport`, `sameFileIdentity`, `removeOwnedReportTemp`, `hasFileErrorCode` | 같은 helper 내부 | writer의 open/fstat/close/lstat/link/unlink와 에러·소유권 확인. 공개 API로 올리지 않음 |
| `validateTestDatabase` | `scripts/test-server-integration.mjs` export | 두 전체 리허설·격리 인수 사전 검사 |
| `manifestEntries` | `tests/server/fixtures/action-manifest.ts` export | 웹 HTTP `main`의 실제 Action registry 확인 |
| `connections`, `fixture`, `seedPipelineVersion`, `Fixture` | `tests/server/integration/support.ts` export | 두 리허설의 dynamic import·타입; 원본 소비 유지 |
| `defaultGraph`, `PIPELINE_EDIT_PLAN_GATE`, `SLOT_FORMAT` | `packages/core/pipeline/pipeline.mjs` export | 기존 리허설 import 그대로 유지 |
| `createBoardService`, `readProjectAccessIn` | 각각 `src/server/pipeline/board.ts`, `src/server/projects/access-query.ts`의 기존 시험 내부 참조 | 웹 HTTP의 정확한 registry 두 행을 유지. 신규 제품 export·검사기 예외를 만들지 않음 |

helper 공개 함수의 계약은 parser의 mode union, prepare의 `WebHttpReportRun`, renderer의
`string`, writer의 `void`/IO 예외다. 새 일반 라이브러리·barrel을 만들지 않는다.

## Proposal

### Requirements

#### REQ-REHEARSAL-001: 기존 기능별 실행 진입점 유지

WHEN 개발자가 `npm run test:acceptance:backlog-pipeline` 또는 기존 fourth-pass CLI를
실행하면, 도구는 같은 `rehearse-backlog-pipeline.ts` 구현의 기존 검증을 실행해야 한다.

#### REQ-REHEARSAL-002: 실행 전 명시적 인자 검사

WHEN 두 리허설에 단독 `--help`가 전달되면, 도구는 사용법·필요 환경·검증 범위를
출력하고 보고서·decoder worker·DB fixture·Next 서버 없이 0으로 끝나야 한다.
IF 지원하지 않는 인자·혼합 모드·누락되거나 시작 시 유효하지 않은 출력 경로가
전달되면, THEN 같은 부수효과 전에 종료 코드 2로 거부해야 한다.

#### REQ-REHEARSAL-003: 실행별 보고서와 실제 결과

WHEN 웹 HTTP 전체 실행이 종료되고 출력 경로가 최종 검사·저장에 성공하면,
도구는 명시한 새 경로에 실행 시각·revision·항목별 결과·정리 상태와 완전한 본문을
기록해야 한다. IF 실행 중 출력 경로가 무효해지거나 저장이 실패하면, THEN 도구는
기존 기록을 보존하고 종료 코드 1로 실패를 알리며 보고서 저장 성공을 주장하지 않아야 한다.

#### REQ-REHEARSAL-004: 독립 decoder와 내부 worker 유지

WHEN `--consumer-self-test`를 실행하면, 도구는 기존 7개 Flight 제어를 검증하고
JSON을 출력해야 하며 보고서·DB·Next 서버를 만들지 않아야 한다. IF 내부 worker를
부모 IPC 없이 직접 실행하면, THEN 종료 코드 2로 거부해야 한다.

#### REQ-REHEARSAL-005: 완성된 보고서만 배타적으로 공개

WHEN 새 최종 보고서를 공개하면, 도구는 완전한 본문을 저장한 뒤 최종 경로를
배타적으로 획득해야 한다. IF 쓰기 실패나 경쟁 실행이 발생하면, THEN 부분적인
완료 보고서를 최종 경로에 남기거나 기존 파일을 덮어쓰지 않아야 한다.

### Invariants and Constraints

- INV-REHEARSAL-001: 원본 검증의 입력·권한·성공·거부·무쓰기·응답 유실 사례와 fixture·worker·DB·환경 정리를 보존한다.
- INV-REHEARSAL-002: 완료된 과거 문서, 기존 결과 파일과 다른 실행이 소유한 파일은 수정·삭제하지 않는다.
- CON-REHEARSAL-001: 책임별 경로와 `rehearse-*.ts` 인식, 정확한 서버 내부 참조 등록을 유지한다. 검사기를 완화하지 않는다.
- CON-REHEARSAL-002: 새 package·runner·CI·제품 public API를 만들지 않고 helper와 시험을 현재 소유 위치에 둔다.
- CON-REHEARSAL-003: 문서·도구 시험·decoder 통과를 실제 HTTP·DB·브라우저·운영 인수 통과로 대체하지 않는다.
- CON-REHEARSAL-004: 설명용 코드 주석·시험 나레이션을 추가하지 않는다. 직접 구현 지시의 Core 경로만 수정하고 다른 작업을 보존한다.

### CLI and Runtime Matrix

전체 실행과 self-test는 저장소 루트가 작업 디렉터리다. 도움말 시험만 빈 임시 cwd도
사용한다. 웹 HTTP 전체 실행은 `tests/server/register-server-only.mjs` bootstrap을 사용한다.

| 입력·시작 상태 | 순서·최종 결과 | 부수효과·정리 | 검증 |
| --- | --- | --- | --- |
| 두 CLI 단독 도움말 | 사용법 → 0 | decoder·DB·Next·보고서 없음 | VFY-REHEARSAL-01 |
| backlog 무인자 / 기존 alias | 새 구현 → 기존 성공 0·실패 1 | 55449/55450, 기존 fixture·proxy·환경 정리 | VFY-REHEARSAL-03 |
| 알 수 없는 인자·중복/혼합·필수 출력 누락 | parse 거부 → 2 | 실행 준비 전 | VFY-REHEARSAL-01 |
| HTTP 새 출력 | 경로·Git 정보 → decoder → dotenv·DB 검사 → fixture/Next → 사례 → cleanup → 보고서 | 새 파일만 공개, 55455, 자체 fixture만 정리 | VFY-REHEARSAL-02·03·04 |
| DB 미준비 | decoder 7개 → required NOT RUN → blocked 보고서 → 1 | DB 쓰기·Next 서버 없음 | 기존 CLI 시험·VFY-REHEARSAL-02 |
| self-test | 7개 제어 JSON → 0 | child 종료, 보고서 없음 | VFY-REHEARSAL-03 |
| private worker | `--flight-worker <route>` / `--flight-probe-worker <kind>`, IPC 필수 | 정상 통신·종료와 message listener/timer 해제 유지 | VFY-REHEARSAL-01·03 |
| 웹 HTTP main이 handler를 설치한 구간의 SIGINT/SIGTERM·사례/cleanup 실패 | 기존 abort·cleanup 후 fail 결과·1 | 원래 예외와 cleanup 실패를 보고서 저장 오류로 가리지 않음 | VFY-REHEARSAL-03·04 |
| 최종 이름을 다른 실행이 선점 | EEXIST·1 | 경쟁 파일 불변, 자기 임시 파일만 정리 | VFY-REHEARSAL-04 |
| 저장 중 ENOSPC·권한/공개 실패 | 1 | 부분 최종 파일 없음, 자기 descriptor·임시 파일 정리 | VFY-REHEARSAL-04 |
| UTC 날짜가 바뀐 저장소 안 경로 | 최종 날짜 검사 거부·1 | 날짜 metadata 위조·자동 재명명·대체 저장 없음 | VFY-REHEARSAL-02·04 |

`FLIGHT_PROBE_CASES`의 전체 집합은 `positive`, `turbopack-chunks`, `missing-loader`,
`missing-mapping`, `chunk-reject`, `module-throw`, `truncated-reference`다.
권한·API·GET 본문 검증은 두 고정 비교 본문 전체를 보존하며 표본을 추려 줄이지 않는다.
위 신호 행은 웹 HTTP main이 handler를 설치한 구간의 협조적 취소만 뜻한다. 초기
decoder 구간이나 backlog에 새 signal handler를 추가하는 요구가 아니며, 두 진입점의
기존 정리 흐름을 보존한다. 기존 Action은 `savePipeline`, `updateBacklogItem`, `removeBacklogItem`, `retryAcceptance`,
`humanTransition`, `approveGate`, `discardItem`, `proposeItem`, `createProject`다.
읽기 경로는 `/login`, `/p/{slug}`, `/p/{slug}/history`의 item/events query,
`/p/{slug}/pipeline`, `/p/{slug}/inbox`, `/p/{slug}/items/{key}`, `/p/{slug}/backlog`,
`/p/{slug}/tokens`, `/settings/tokens`, `/p/new`다. 이 경로·제품 본문을 재설계하지 않는다.

### Report Publication and Failure Contract

출력은 새 `.md`, 존재하고 쓸 수 있는 parent, 기존 leaf·symlink 부재가 조건이다.
저장소 안에서는 `docs/test-reports/completed/` 바로 아래 현재 UTC 날짜 접두사만
허용한다. 저장소 밖 새 임시 `.md`는 날짜형 이름을 요구하지 않는다. 같은 경로에
재시도하지 않고 새 경로로 실행한다. `active/`·과거 결과를 자동 갱신하지 않는다.

최종 저장은 다음 순서를 따른다.

1. 완료 시각으로 경로를 다시 검사하고 전체 Markdown을 메모리에서 생성한다.
2. 최종 parent 안에 무작위 이름의 자기 임시 파일을 `openSync`의 `wx`로 생성한다. 기존 writer와 같은 기본 생성 권한·프로세스 umask를 유지한다. open 성공 뒤 `fstatSync(fd)`의 dev/ino를 기록하며 그 전에는 소유권을 주장하지 않는다.
3. 전체 본문을 자기 descriptor에 쓰고 닫는다. 실패하면 자기 파일만 정리하고 원래 오류를 전파한다.
4. `lstatSync(temp)`의 dev/ino가 생성 시 값과 같은지 확인한 뒤 `linkSync(temp, final)`의 배타적 생성으로 완성된 파일을 공개한다. EEXIST·미지원 파일 시스템·권한 오류는 실패이며, 기존 대상을 덮어쓰는 rename/copy로 우회하지 않는다.
5. 자기 임시 링크를 정리한다. 정리 때도 생성 시 기록한 파일 identity를 확인하고 다른 파일로 바뀌었으면 삭제하지 않고 실패를 알린다.

이 순서는 `publishNewReport`에 구현했다. 자기 descriptor의 close와 임시 파일 정리는
정상·실패 모두 처리하며, 원래 IO 오류와 cleanup 오류가 함께 있으면 AggregateError로
보존한다. cleanup 오류도 종료 코드 1을 유지한다. CLI의 report closure는 저장 오류와
원래 사례/cleanup 오류를 구분해 알린다.
report의 HTTP 판정만 보고 CLI 성공을 추론하지 않고 외부 검증이 종료 코드도 확인한다.

UTC 자정을 넘으면 저장소 안 날짜형 출력은 유효하지 않을 수 있다. 정확한 사용자
경로와 완료 날짜 규칙을 보존하는 기존 실패 처리를 유지한다. 자정에 걸칠 수 있는
실행은 처음부터 저장소 밖의 새 경로를 사용한다. 저장소 안 기록이 필요하면 그
실행의 완료 날짜·형식을 확인한 별도 보존 절차를 따른다. 이 제약은 확인된
non-blocking risk이며 자동 경로 변경 기능으로 이번 범위를 넓히지 않는다.

### Final Artifact Map

| 최종 산출물 | winning source·입력 | 본문·의존성·검증 목적지 |
| --- | --- | --- |
| CLI 도움말·거부·종료 코드 | backlog 하단 dispatch, HTTP `runCli`, helper parser/usage | stdout/stderr·0/1/2, cwd·인자·IPC, `rehearsal-cli.test.mjs` |
| decoder JSON·IPC | HTTP `consumerSelfTest`·`spawnWorker`·`probeWorker` | 같은 `import.meta.url` 파일로 fork, production decoder와 7개 probe; CLI 시험·VFY-REHEARSAL-03 |
| 보고서 metadata·본문 | helper `renderWebHttpReport`, 실행 결과 배열·build·cleanup·run 정보 | 아래 17개 필드·11개 섹션·C/T/E 참조·명령 manifest, 보고서 시험·VFY-REHEARSAL-02 |
| 보고서 최종 파일 | helper `writeWebHttpReport` → private `publishNewReport` | 완성된 bytes만 최종 경로에 공개; IO 실패·EEXIST·소유 파일 정리, VFY-REHEARSAL-04 |
| 실제 HTTP·Flight·GET 본문 | 기존 Action·route source → fresh `.next` registry/route bundle → 실제 loopback 요청·route worker | `tests/server/fixtures/action-manifest.ts`, `.next/BUILD_ID`, `.next/server/server-reference-manifest.json`, `.next/server/app-paths-manifest.json`, route별 client-reference manifest. 생성물을 직접 수정하지 않고 전체 인수에서 실제 본문을 확인 |

decoder의 winning entry는 `next/dist/compiled/react-server-dom-webpack/client.node`이며
worker의 `NODE_ENV=production`이 production CJS body를 선택한다. Next `start`가 build를
요구한다는 설치 버전 CLI 문서를 확인했다. 실제 HTTP artifact의 인수 증거는 아직 없고,
source 동일성·decoder 제어와 별도로 VFY-REHEARSAL-03에서 닫아야 한다.

metadata 키의 전체 집합은 `status`, `stage`, `result`, `report-kind`, `report-size`,
`test-levels`, `test-tools`, `created-at`, `completed-at`, `last-executed-at`,
`tested-revision`, `owners`, `related`, `primary-area`, `observed-environments`,
`test-summary`, `follow-up`이다. completed/null과 pass/fail/blocked를 분리하고
required 결과는 fail > blocked > pass로 집계한다. 실행 전 차단은 NOT RUN이며 pass가 아니다.
시각은 실제 실행값, `last-executed-at`은 timezone 있는 ISO 시각, revision은 HEAD와 dirty
표시다. dirty 표시만으로 소스 전체를 재현할 수 있다는 주장은 하지 않는다.

동시 실행은 각자의 무작위 임시 이름을 사용하고 같은 최종 이름만 경쟁한다. 생성·
공개·정리에서 기존 파일 접근 권한을 새 정책으로 바꾸거나 다른 실행의 temp를 재사용하지 않는다.

standard 본문은 `Summary and Decision`, `Scope and Criteria`, `Test Target`,
`Preconditions and Test Data`, `Test Matrix`, `Commands and Static Checks`,
`Evidence Registry`, `Findings and Follow-up`, `Test Data and Cleanup`, `Conclusion`,
`Review Checklist`를 각각 한 번 포함한다. C1/C2 기준·required T/CLEANUP 행과
각 E 참조를 실제 관찰에 연결한다. CMD1은 아래 재실행 manifest를 가리키는
`informational`·`NOT RUN` 행으로 구분하고 전체 required 판정에 포함하지 않는다. 외부 브라우저·native client·운영 통과를 추론하지 않는다.

기존 Commands 행의 placeholder를 제거했다. renderer는 `Commands and Static Checks`에
정규화된 재실행 manifest를 fenced JSON으로
기록한다. `command: "node"`, `cwd: "repository-root"`, `args`에는 server bootstrap,
`--import tsx`, 현재 script, `--report`, 실제 선택한 출력 경로를 문자열 배열로 둔다.
원래 실행 argv·CLI 종료 증거와 구별해 아직 실행하지 않은 재실행용 표현임을 명시한다.
실제 실행의 pass/fail/blocked 근거는 required T/CLEANUP이고, 전체 CLI 종료 코드는
외부 검증이 따로 확인한다. shell 문자열로 합치지 않으며
공백·따옴표·`$()` 등이 든 경로도 JSON 데이터로 보존한다. 원문 응답·DB URL·token·
세션을 기록하지 않고, 재실행은 새 출력 경로를 골라 argv 배열로 실행한다.

## Safety Analysis

기존 파일을 새로 만드는 단계는 재실행하지 않는다. 기존 fourth-pass alias와 완료
문서 링크를 보존하고 old fifth-pass는 부재를 검사한다. 새 일반 helper나 앱 public
export를 추가하지 않는다. 임시 보고서는 `realpathSync(tmpdir())` 또는 명시된 기존
parent 안에만 만들고 자기 파일만 정리한다. 실제 DB·Next 실행은 보호된 사전 검사
후에만 수행하며, 인수 실패를 해결하려고 제품 사례·권한 조건을 약화하지 않는다.

## Approval

원래 승인 기록은 front matter를 유지한다. 이후 사용자의 직접 구현 지시로 Core의
잔여 코드·시험·현재 문서 정비를 수행했다. 사용자는 준비된 테스트 DB가 없다고
확인했다. 정합성 검토·로컬 게이트의 통과를 실제 DB·운영 인수 승인이나 통과로 해석하지 않는다.

## Execution Plan

### TASK-REHEARSAL-01: 현재 진입점·호환 경로 보존

- satisfies: REQ-REHEARSAL-001, REQ-REHEARSAL-002, REQ-REHEARSAL-004
- preserves: INV-REHEARSAL-001, INV-REHEARSAL-002
- governed-by: CON-REHEARSAL-001, CON-REHEARSAL-002, CON-REHEARSAL-004
- verified-by: VFY-REHEARSAL-01, VFY-REHEARSAL-03

이미 구현된 Task다. Concrete Inventory와 Symbol and Import Provenance의 파일·export·
동적 import·npm 대상·정확한 registry를 검사하고 현재 구현을 보존한다. 원본 비교는
고정 커밋을 사용한다. 부모/child mode와 bootstrap을 그대로 유지하고 리허설의 제품
사례·cleanup을 재작성하지 않는다. 예상과 다른 target·consumer가 있으면 작업을 멈추고
현재 문서의 inventory와 검증 범위를 먼저 조정한다.

### TASK-REHEARSAL-02: 완성된 보고서의 공개와 본문 검증 보강

- satisfies: REQ-REHEARSAL-002, REQ-REHEARSAL-003, REQ-REHEARSAL-005
- preserves: INV-REHEARSAL-001, INV-REHEARSAL-002
- governed-by: CON-REHEARSAL-002, CON-REHEARSAL-003, CON-REHEARSAL-004
- verified-by: VFY-REHEARSAL-02, VFY-REHEARSAL-04

코드 구현과 로컬 검증을 완료했다. Report Publication의 같은 parent 임시 파일·배타적
link 공개를 구현했고, 공개 함수·타입과 CLI mode는 유지했다. `run.path`의 JSON argv
manifest와 informational/NOT RUN CMD1을 반영했다. 17개 metadata·11개 본문·참조·
ENOSPC·close/link/정리 실패·실제 경쟁 publisher·파일/descriptor 교체·UTC 경계를
시험했다. 새로운 옵션이나 시험 전용 제품 export를 만들지 않았다.

### TASK-REHEARSAL-03: 현재 문서·도구 게이트·격리 인수 마무리

- satisfies: REQ-REHEARSAL-001, REQ-REHEARSAL-002, REQ-REHEARSAL-003, REQ-REHEARSAL-004, REQ-REHEARSAL-005
- preserves: INV-REHEARSAL-001, INV-REHEARSAL-002
- governed-by: CON-REHEARSAL-001, CON-REHEARSAL-003
- verified-by: VFY-REHEARSAL-01, VFY-REHEARSAL-02, VFY-REHEARSAL-03, VFY-REHEARSAL-04

현재 문서와 로컬 게이트 정비를 완료했다. `verification.md`의 공개·실패·manifest
설명과 실행 예를 갱신했고 registry 두 행·npm 대상은 보존했다. 기존 Node/tsx 재귀
패턴에서 새 시험을 실행했다. 준비된 테스트 DB가 없어 실제 HTTP·DB 전체 인수만
차단돼 있다. 이 증거가 생기기 전에는 전체 완료로 표시하지 않는다.

## Verification Plan

### VFY-REHEARSAL-01: 실행 연결·인자·경로 전환

- verifies: REQ-REHEARSAL-001, REQ-REHEARSAL-002
- destination: `rehearsal-cli.test.mjs`, `package.json`, `server.md`, 기존 경계 검사기
- evidence state: Executed — CLI·실행 연결·호환/부재·경계 검사 통과.

JSON으로 npm 대상과 재귀 시험 패턴을 파싱한다. 신규 두 파일 존재, alias의 한 줄
import와 이전 CLI 실행, old fifth-pass 부재를 검사한다. 기존 이름은 alias·그 시험·
현재 문서의 호환 설명·이 proposal의 비교 기록·완료 문서에서만 허용한다. old fifth-pass
리허설 경로는 현재 npm·registry·import에서 금지하되 과거 보고서 파일명과 비교 기록은
금지하지 않는다. 같은 규칙으로 post-change 위치의 export·type·동적 import를 검사한다.

### VFY-REHEARSAL-02: 보고서 내용·판정·날짜·명령 표현

- verifies: REQ-REHEARSAL-002, REQ-REHEARSAL-003
- destination: `web-http-report.test.ts`, 실제 CLI 생성 파일
- evidence state: Executed — 전체 metadata·본문·참조·manifest와 음성 fixture·UTC 경계 시험 통과.

고정 clock으로 모든 verdict 조합·빈 결과·cleanup 실패를 검사한다. 17개 metadata의
값·타입·ISO 시각·revision·dirty 표기, 11개 section의 단일 존재, C/T/E 참조와
필수 항목 집계를 직접 검사한다. JSON manifest는 파싱 후 args와 선택 경로를 대조한다. CMD1은 informational/NOT RUN이며,
모든 required가 PASS일 때 이 미실행 재실행 안내 때문에 전체 결과가 blocked로 바뀌지 않아야 한다.
`inspectDocs` 통과만으로 본문 검증을 대신하지 않는다. 본문·evidence section을 제거한
음성 fixture가 반드시 실패해야 한다. 날짜 변경은 저장소 안 경로의 거부·무산출과
저장소 밖 경로의 실제 완료 날짜를 각각 검증한다.

### VFY-REHEARSAL-03: 보존 본문·decoder·실제 HTTP/DB

- verifies: REQ-REHEARSAL-001, REQ-REHEARSAL-003, REQ-REHEARSAL-004
- destination: 두 리허설, 원본 고정 커밋, 실제 generated registry·HTTP/Flight·보고서
- evidence state: 전체 비교·decoder 7개는 Executed; 실제 HTTP·DB 전체 인수는 Not executed.

두 검증 본문 전체를 비교하고 새 self-fork에서 7개 probe의 성공·음성 제어·child 종료를
확인한다. 이후 보호된 DB와 fresh build에서 Action·권한·stale·응답 유실·GET 본문·
보고서 링크·worker 로딩·자기 fixture 정리를 실제로 실행한다. redirect/status만이 아니라
최종 HTTP/Flight 본문과 생성된 Markdown을 검사한다. source 동일성이 실행 통과는 아니다.

### VFY-REHEARSAL-04: 파일 공개·실패·경합·소유권

- verifies: REQ-REHEARSAL-003, REQ-REHEARSAL-005
- destination: `web-http-report.test.ts`, `rehearsal-cli.test.mjs`, 자기 임시/최종 파일
- evidence state: Executed — 부분 파일 방지·IO 실패·경합·파일/descriptor 보존과 실제 CLI 오류 회귀 시험 통과.

같은 helper 소스를 Node VM의 격리된 `node:fs` 경계로 실행하거나 별도 subprocess의
한정된 fs 주입으로 시험한다. 제품 전용 실패 옵션을 추가하지 않는다. 전체 본문 저장
전에 ENOSPC를 주입하면 최종 파일은 없어야 한다. close/link 실패와 final 선점도 주입하고,
이미 존재하던 결과·경쟁 결과·타인이 소유한 temp의 bytes와 identity를 보존해야 한다.
정상 공개 후 최종 bytes는 renderer 전체와 같고 자기 descriptor·temp만 정리되어야 한다.
CLI는 저장 실패 시 1이고 원래 실패 진단도 유지한다. 교체된 temp identity를 자기 파일로
삭제하거나 기존 파일을 덮어쓰는 fallback은 금지한다. 이 검증이 통과하기 전 Task 02는 미완료다.

### 실행 명령과 순서

아래 블록은 저장소 루트의 POSIX shell용이다. 기존 도구 검증은 외부 DB·모델을
호출하지 않는다. 코드 변경 후 저장소 게이트를 실행한다. native Windows 전용 skip은
해당 플랫폼 인수 통과가 아니다. CI Node 22와 이번 로컬 Node 26도 구분한다.

```sh
node --import tsx --test scripts/rehearsals/web-http-report.test.ts scripts/rehearsals/rehearsal-cli.test.mjs
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm run build
```

신규/untracked proposal까지 포함하는 문서 검증은 다음 명령을 쓴다. `docs:check`의
기본 `git ls-files`만으로 새 문서가 검사됐다고 주장하지 않는다.

```sh
node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { inspectDocs } from './scripts/checks/verify-docs.mjs';
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(path => path && existsSync(path)))];
const result = inspectDocs(process.cwd(), files);
assert.deepEqual(result.problems, []);
console.log(JSON.stringify(result));
JS
```

실제 인수는 Task 02와 도구 게이트 통과 후, 미리 준비된 격리 `TEST_DATABASE_URL`과
비어 있는 55449/55450/55455에서만 수행한다. URL을 출력하지 않으며 사전 검사가
실패하면 이후 명령도 실행하지 않는다. 이 블록은 migration·테스트 DB 쓰기를 포함해
이번 문서 검토에서는 실행하지 않았다. `npm`이 직접 실행되는 현재 POSIX 환경용이다.

```sh
node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from 'dotenv';
import { validateTestDatabase } from './scripts/test-server-integration.mjs';
import { parseFrontMatter } from './scripts/checks/verify-docs.mjs';
config({ quiet: true });
const testUrl = validateTestDatabase(process.env);
const options = { cwd: process.cwd(), env: process.env, stdio: 'inherit' };
execFileSync('npm', ['run', 'test:server:integration'], options);
execFileSync('npm', ['run', 'build'], { ...options, env: { ...process.env, DATABASE_URL: testUrl } });
execFileSync('npm', ['run', 'test:acceptance:backlog-pipeline'], options);
const reportPath = join(realpathSync(tmpdir()), 'stagekeeper-web-http-' + randomUUID() + '.md');
console.log('HTTP report path:', reportPath);
execFileSync(process.execPath, ['--import', './tests/server/register-server-only.mjs', '--import', 'tsx', 'scripts/rehearsals/rehearse-web-http-contracts.ts', '--report', reportPath], options);
const body = readFileSync(reportPath, 'utf8');
assert.equal(parseFrontMatter(body)?.result, 'pass');
assert.match(body, /retryAcceptance owner transport/);
assert.match(body, /Backlog and registration bodies\/default name/);
assert.match(body, /## Evidence Registry/);
assert.match(body, /## Test Data and Cleanup/);
console.log('Actual HTTP result and retained body verified; apply VFY-REHEARSAL-02 to the full artifact.');
JS
```

## Verification Results

| 근거 | 구현 후 실제 결과 | 해석 |
| --- | --- | --- |
| 두 도구 시험 | 26/26 PASS | metadata·본문·manifest·IO 실패·경합·파일/descriptor 소유권과 실제 CLI 오류를 포함 |
| 소스 전체 비교 | HTTP `acceptanceCases` 동일, backlog `main`·cleanup은 오류 위치 파일명 외 동일 | 제품 사례 보존 근거. 실제 HTTP·DB 통과는 아님 |
| 실제 helper의 실패 주입 | ENOSPC·close 전후 EIO·link EPERM에서 최종 파일 없음, 자기 descriptor/temp 정리 | 별도 Node subprocess에서 실제 helper를 실행. 원래 IO 오류와 cleanup 오류를 함께 보존 |
| 전체 본문·음성 fixture | 17개 metadata·11개 section·C/T/E 참조·JSON argv와 판정 검사 통과 | metadata/본문/evidence 누락·잘못된 참조·CMD1을 required로 바꾼 fixture는 거부 |
| 공개·임시 파일·descriptor 선점/교체 | 기존·경쟁 파일 bytes와 타인 descriptor 보존 | 다른 실행의 파일/descriptor를 정리하지 않음 |
| 독립 publisher 2개 | 정확히 하나만 성공, 완전한 최종 본문, 자기 temp 제거 | 실제 별도 프로세스의 배타적 공개 검증 |
| temp unlink 실패 | 오류를 전달하고 완전한 공개 본문 보존 | 보고서의 HTTP 판정과 CLI 종료를 구분 |
| 실제 CLI의 부분 쓰기·경합 | 저장 오류와 원래 실패 진단·종료 코드 1, 역사 기록 보존 | 부분 최종 파일 방지·경쟁 파일 불변과 정상 temp 정리를 확인 |
| UTC 경계 fixture | 저장소 안 날짜형 경로는 거부·최종 파일 없음, 저장소 밖은 실제 완료 날짜 기록 | 자동 재명명·대체 저장 없음 |
| `npm run check` | PASS: 256개 중 254 PASS, native Windows 전용 2 SKIP | 복사본·lint·문서·route typegen·TypeScript·스크립트 전체 시험 포함 |
| `npm run test:architecture` | PASS: 186개 중 184 PASS, native Windows 전용 2 SKIP | 이번 CLI 시험 추가분도 기존 검색 패턴에서 실행 |
| `npm run build` | PASS | Prisma 생성·Next.js 16.4.2 Turbopack production build·TypeScript 완료 |
| 실제 HTTP·DB 전체 인수 | Not executed | 사용자가 준비된 테스트 DB가 없다고 확인. 해당 증거만 남아 stage를 blocked로 유지 |
| 실제 Windows 전체 인수 | Not executed | 로컬 macOS 결과·기존 native skip을 Windows 지원 인증으로 확대하지 않음 |

2026-10-29 Node `v26.4.0`·npm `11.17.0` 로컬 근거다. CI 설정은 Node 22이며 서버
통합 job에는 build가 없다. 위 실제 인수 블록은 이 차이를 명시적으로 준비한다.
기존 `_key` lint warning 1개는 변경 밖 파일에 남아 있고 신규 lint error는 없다.
`TEST_DATABASE_URL`이 없고 PATH·Homebrew에서 PostgreSQL/Docker 실행 파일도 확인되지
않았다. 사용자의 준비된 DB가 없다는 답변에 따라 외부 인수는 실행하지 않았다.

## Risks and Rollback

- 준비된 테스트 DB가 없어 실제 인증 HTTP·DB·정리 재실행은 남아 있다. VFY-REHEARSAL-03 전 완료로 표시하지 않는다.
- UTC 날짜형 경로의 완료 시점 거부는 유지한다. 장시간 실행은 처음부터 저장소 밖 새 경로를 사용하고 VFY-REHEARSAL-02로 경계를 검증한다.
- hard link를 지원하지 않는 파일 시스템에서는 저장을 실패로 처리한다. overwrite fallback 없이 VFY-REHEARSAL-04의 파일 불변을 확인한다.
- 최종 보고서가 존재한다는 사실만으로 CLI 0·본문 유효·제품 인수를 추론하지 않는다. 종료 코드와 전체 body를 함께 검사한다.

이 문서 개정의 rollback은 이 Markdown의 개정 전 내용을 복구하는 것이다. 기존
미커밋 코드·다른 문서를 일괄 revert·stash·삭제하지 않는다. 후속 구현 rollback은
그 구현의 diff만 되돌리고 기존 완료 보고서·사용자 데이터는 그대로 둔다.

## Definition of Done and Handoff

후속 작업자는 현재 working tree와 이 문서·규범을 다시 확인하고 이미 충족된
Task 01을 재구현하지 않는다. 쓰기는 Concrete Inventory의 남은 Core에 한정한다.
원본 사례가 제품 계약과 맞지 않는 등 범위 밖 결함이 발견되면 근거를 남기고 해당
부분을 멈춘다. 권한 조건·기대값을 바꾸거나 운영 DB로 우회하지 않는다.

- [x] 새 진입점·npm·alias·old fifth-pass 부재·정확한 import/registry를 확인했다.
- [x] Task 02의 원자적 공개와 JSON 재실행 manifest를 구현하고 VFY-REHEARSAL-02·04를 통과했다.
- [x] partial write·기존 파일·경합·공개 실패·자기 temp 정리·UTC 경계가 자동 회귀 시험에 포함됐다.
- [x] helper의 전체 17개 metadata·11개 section·C/T/E 참조와 명령 데이터가 검증됐다.
- [x] 코드 변경 후 FSD·서버·아키텍처·check·build를 실행하고 해당 플랫폼의 skip을 구분했다.
- [x] 고정 원본의 HTTP 사례 본문·backlog main/cleanup 전체를 대조했다.
- [ ] 보호된 실제 HTTP·DB 인수를 완료하고 실제 HTTP·Flight·보고서 산출물 본문을 확인했다.
- [x] 완료된 과거 문서·다른 작업·제품 코드·CI·schema를 보존하고 실제 결과로 proposal lifecycle을 갱신했다.

이 조건들이 완료되기 전에는 이 proposal을 `completed/`로 이동하거나 코드 구현·인수
완료라고 표시하지 않는다. 정합성 문서의 검토 통과는 이 체크리스트 완료와 다르다.

## Reconciliation Notes

다음은 구현 전 정합성 검토에서 확인한 문제와 반영한 결정의 기록이다. 이후 사용자의
직접 구현 지시로 Core 코드·로컬 시험을 반영했으며 실제 DB 인수만 남아 있다.

| 발견된 문서 결함 | 반영 위치·결정 |
| --- | --- |
| 구현 전 기준과 현재 작업 트리가 섞여 재이동·재생성할 수 있음 | Current State·Inventory·Task 01·DoD에 이미 충족/부재/보존을 명시 |
| 배타적 생성과 완전한 보고서 공개를 같은 것으로 취급 | REQ-REHEARSAL-005·publication 순서·Task 02·VFY-REHEARSAL-04·DoD에 원자적 공개와 소유 파일 정리 반영 |
| metadata checker 통과를 standard 본문 검증처럼 기재 | Final Artifact Map·VFY-REHEARSAL-02에 17개 필드·11개 section·참조·음성 fixture를 명시 |
| 날짜 변경·IO 실패·전체 인수 실행 절차와 command placeholder가 불명확 | Runtime Matrix·Report Contract·JSON manifest·검증 명령·위험·Task 02/03에 결정 전파 |
| 과거 게이트·현재 9개 시험·미실행 인수와 전체 준비 판정이 혼재 | Verification Results·DoD·handoff에서 증거 범위와 미완료 Core 구분 |
| 첫 개정의 신호·임시 파일 권한·명령 행·replay 범위가 기존 동작과 다르게 해석될 수 있음 | handler 설치 구간·기존 umask·informational 재실행 데이터로 한정하고 prefix/consumer 발견으로 basis 추가·삭제를 검출 |

구현으로 코드·문서의 내용이 바뀌었으므로 구현 전 clean 판정과 아래 anchor를 현재
버전의 새 정합성 판정으로 재사용하지 않는다. 실제 실행 결과와 미완료 범위는 위
Verification Results와 DoD를 따른다.

## Reconciliation Basis

다음 manifest는 **구현 전 정합성 검토 당시** bounded source의 역사적 식별자다.
현재 구현의 source는 이후 변경됐으므로 이 snapshot의 내용 일치는 기대하지 않는다.
새 정합성 검토에서는 현재 저장본·구현을 다시 확인해야 한다. 이 기준은 당시의
적용 가능성 비교용이며 완전성·정확성·결함 부재의 증명이 아니다.
전체 저장소 hash나 자격 증명이 든 remote URL은 기록하지 않는다.

```json
{
  "repository": "c79487e14ae12d37",
  "head": "8775d5e6b51d654a2eda5ad28d7c7c6bfbaac7f5",
  "scope": "TASK-REHEARSAL-01..03; proposal reconciliation only",
  "profile": "High-Risk",
  "source": "docs/proposals/active/rehearsal-script-maintenance.md",
  "recipeClass": "safe-replay",
  "recipe": "Resolve the explicit staticPaths, all matching owned-directory prefixes and rg fixed-string consumers; keep live files, union source, then sort POSIX relative paths and newline-join with final newline for pathSetSha256. For each dependency SHA-256 raw file bytes; sorted path + NUL + content SHA-256 + newline yields dependencySetSha256. Compare HEAD, file absence and final source hash separately. New or removed discovered paths cause drift.",
  "pathSetSha256": "58c1c4fe52d59cc0b934b12494ddc079dbfa932e616aeeeb277e6ba798030bc8",
  "dependencySetSha256": "77ccecc5de1b56dc73484fefef532d67f99df9ab70e62b2b55b01e51f87d2b41",
  "oldFifthAbsent": true,
  "contentIdentities": {
    ".github/workflows/check.yml": "809ed362a77896e1ea0206caf2adfe46de2bd3ac02f0dac53b93f4786c2ce3c7",
    "AGENTS.md": "e0738ad52d41e984e19574165cb2594c41385f81a93666439c14b67e9bd84be1",
    "docs/ADR/0004-organize-repository-scripts.md": "437206bda2692f4e5328c46279e2b2b9ef0855d1a1ba2818519873efbda2cf02",
    "docs/architecture/README.md": "4759a2d28eba27aa47ec5c67db8f6f28589cc6032ee165a53357afa56b7668d2",
    "docs/architecture/core.md": "106d79600ee3ce122b7602e46162c8aad574896c7cf42eace229b4cccd07754e",
    "docs/architecture/server.md": "d37c0f8fe9e8ef6716ef0fb0f75d94634fb693287ae1e8215b785ea82698fae2",
    "docs/architecture/test-organization.md": "b71969bf667dd82b1133d2b822e1e2f452d713ff4117947eb7785612f5492863",
    "docs/architecture/verification.md": "9e1330e491b63c7a378e782aad6fa0357d5824733aa6835bd72a72ca51507232",
    "docs/proposals/README.md": "bf71da73a8f493ca16439bb0bcd96daf119b2483d811ca39983d640295f7dc9c",
    "docs/proposals/completed/2026-10-23-scripts-validation-cleanup.md": "abb7082de3d1679e679514db6ac34b5cf35c41e1d859af81145cff5f4fe344a8",
    "docs/proposals/template.md": "fa513361bcc3ccfe9db8f5b7164770531ce3954df13b1d3a787de5e6d0142ba7",
    "docs/test-reports/README.md": "6f55af15d407323bb565aa633a76198249622c57414c7dbc8ac42cb196cd26d2",
    "docs/test-reports/template.md": "ee559d9a228a5ee9735a99ef5af98c552bb2f875be2a47fdef759f82570600fd",
    "node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js": "8229e03550d2daa690da27c5cf1c7739b5d97280ea6721cf13ff9b2e4c39f03e",
    "node_modules/next/dist/compiled/react-server-dom-webpack/client.node.js": "704a07592993924515710e08c9365e8d6b49d96df54166b869f0210d004b8685",
    "node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md": "b1b0e34dedd8d3e3d391a9370f3f56c4e8756765de406accf6721ad7eb984006",
    "node_modules/next/package.json": "e84ada0a68191fed192392bfb8ee35ad4ed8e7439f645a40dd48cf139588ddc5",
    "node_modules/tsx/dist/loader.mjs": "49fb46730ddeb226ac4fa9fb990d3573ac8f18fa4de02f1bf723c61d715710c2",
    "node_modules/typescript/lib/typescript.js": "3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675",
    "package-lock.json": "8fb81eff94b4b8d885a57dc655db9a2c8fa5f177ae9cf91f41186cd5023767b8",
    "package.json": "52a2a491a6c8519ab2fd6c9827ad1133fc16c6d26cf706490b8f16ea8c29a592",
    "packages/core/pipeline/pipeline.mjs": "bf163509be157f9201d2d121d43ed02e04d95b66033df932ca3894880dddd13a",
    "scripts/build.mjs": "93b3691eb1ec6f1c529592c2349cbd7a88a565cc7b405a430a85a55a2190b8aa",
    "scripts/checks/verify-docs.mjs": "0b89036d4c8967c21d872604740480dc827999be037d467aa7bc2562111d8f88",
    "scripts/checks/verify-fsd-boundaries.mjs": "ea92e2f0e27e67687089e20043c80655b69a087d3837e36228be90c77f2e2e9c",
    "scripts/checks/verify-server-boundaries.mjs": "a47d86327b189789a9a6bda3327748f4152fe476d558732c422b34f8ed4b0b01",
    "scripts/rehearsals/rehearsal-cli.test.mjs": "53de9829da0b2ebfe229569040a36f8d00d1bbfa4a79da0eba4c43689ea2ce42",
    "scripts/rehearsals/rehearse-backlog-pipeline.ts": "2d8be955d3436edef2dd0b83a228a1631d852cc4a6594dcd9f35e0aa92dea18b",
    "scripts/rehearsals/rehearse-src-clean-code-fourth-pass.ts": "d68a673d25b7bf5727f788c821900e5adb5161c6a64de9563b0492948f541727",
    "scripts/rehearsals/rehearse-web-http-contracts.ts": "eb2a0aed17290d870d140a50fbfc40a6939d7f7306711b04c60eaafcfeebab01",
    "scripts/rehearsals/web-http-report.test.ts": "385559a07bf4b0fa7de3f7246c73deff05d9457e5337b23b0b6e273114351428",
    "scripts/rehearsals/web-http-report.ts": "1be1da6d7d6bb53219368a1ec80bde99eb00fea61bec2f2eb007153b8f32cbfc",
    "scripts/test-server-integration.mjs": "f34d11ddb1e472d9cb68c8c5a3ad24c069048abaaa51904f22ce219546789d13",
    "src/server/pipeline/board.ts": "33ecd69d0eaad45fc30e29909f058cea0ac7d7fb8a3277445ebf3c49bbb06fb6",
    "src/server/projects/access-query.ts": "88b1b4abb0c57ad0124386a7fcca7edd17a6bd857fa1e4316fd439740e417d5a",
    "tests/server/fixtures/action-manifest.ts": "6e0698e411a097433d11483b854709c5d3389935370756526a9de85bed83d60d",
    "tests/server/integration/support.ts": "1ca051a44679f5ddf6eece1f7b5fdd1cf11369def1139f1447ba89e360b43325",
    "tests/server/register-server-only.mjs": "49fc3b991d848c411036328f45710840613d0b068c54dc1e49067ac9deaeb04f"
  },
  "runtimeEvidenceClass": "volatile-non-replayable: local temporary-fixture tests, fs fault injection and native link probes; not live HTTP/DB acceptance",
  "manifestOnly": [
    "Remaining publication and artifact-body tests",
    "Protected full HTTP/DB command block",
    "CI configuration and Node 22 execution contract"
  ],
  "limitation": "Applicability evidence only; not a proof of completeness, correctness or absence of defects.",
  "discovery": {
    "staticPaths": [
      ".github/workflows/check.yml",
      "AGENTS.md",
      "docs/ADR/0004-organize-repository-scripts.md",
      "docs/architecture/README.md",
      "docs/architecture/core.md",
      "docs/architecture/server.md",
      "docs/architecture/test-organization.md",
      "docs/architecture/verification.md",
      "docs/proposals/README.md",
      "docs/proposals/completed/2026-10-23-scripts-validation-cleanup.md",
      "docs/proposals/template.md",
      "docs/test-reports/README.md",
      "docs/test-reports/template.md",
      "node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js",
      "node_modules/next/dist/compiled/react-server-dom-webpack/client.node.js",
      "node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md",
      "node_modules/next/package.json",
      "node_modules/tsx/dist/loader.mjs",
      "node_modules/typescript/lib/typescript.js",
      "package-lock.json",
      "package.json",
      "packages/core/pipeline/pipeline.mjs",
      "scripts/build.mjs",
      "scripts/checks/verify-docs.mjs",
      "scripts/checks/verify-fsd-boundaries.mjs",
      "scripts/checks/verify-server-boundaries.mjs",
      "scripts/rehearsals/rehearsal-cli.test.mjs",
      "scripts/rehearsals/rehearse-backlog-pipeline.ts",
      "scripts/rehearsals/rehearse-src-clean-code-fourth-pass.ts",
      "scripts/rehearsals/rehearse-web-http-contracts.ts",
      "scripts/rehearsals/web-http-report.test.ts",
      "scripts/rehearsals/web-http-report.ts",
      "scripts/test-server-integration.mjs",
      "src/server/pipeline/board.ts",
      "src/server/projects/access-query.ts",
      "tests/server/fixtures/action-manifest.ts",
      "tests/server/integration/support.ts",
      "tests/server/register-server-only.mjs"
    ],
    "ownedDirectory": "scripts/rehearsals",
    "ownedPrefixes": [
      "rehearse-backlog-pipeline",
      "rehearse-web-http-contracts",
      "rehearse-src-clean-code-fourth-pass",
      "rehearse-src-clean-code-fifth-pass",
      "web-http-report",
      "rehearsal-cli"
    ],
    "ownedExtensions": [
      ".ts",
      ".mjs",
      ".cjs"
    ],
    "consumerRoots": [
      "package.json",
      "scripts",
      "tests",
      "src",
      "packages",
      "plugin",
      ".github",
      "docs/architecture"
    ],
    "consumerNeedles": [
      "rehearse-backlog-pipeline",
      "rehearse-web-http-contracts",
      "rehearse-src-clean-code-fourth-pass",
      "rehearse-src-clean-code-fifth-pass",
      "web-http-report",
      "rehearsal-cli"
    ]
  }
}
```
