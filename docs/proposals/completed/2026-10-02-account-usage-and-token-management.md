---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-02"
approved-by: "user"
approved-at: "2026-10-02"
approval-scope: "USAGE·TOKEN·RATE 코드 구현, 검증, commit 및 dev 대상 PR. RATE 수치는 리허설 후 프로젝트 300회·계정 1,200회/10분으로 사용자 확정. 운영 migration·배포·병합 제외."
completed-at: "2026-10-02"
verification-summary: "check·build PASS; core/CLI 264, web 529, fresh manifest 포함 server 35, private templates 30 PASS; 격리 PostgreSQL migration·전체 integration PASS; 실제 Next HTTP·브라우저·응답 유실·1,168회 부하 인수 PASS. 운영 배포 제외."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "../../architecture/README.md"
  - "../../architecture/protocol.md"
  - "../../architecture/invariants.md"
  - "../../architecture/fsd.md"
  - "../../architecture/verification.md"
  - "../../conventions/product-copy.md"
  - "../completed/2026-10-02-token-management-ux.md"
---

# 계정 사용량 5시간 한도와 토큰 관리

## Summary

계정 전체의 새 에이전트 실행을 첫 실행부터 5시간 단위로 제한한다. 기존 최근 30일 dispatch 한도를 대체하고, Free 20회·Pro 100회·Max 무제한을 적용한다. 사용량 화면은 퍼센트와 진행 막대로 표시하고, 한도에 도달하면 회복 시각을 알려 준다.

여러 토큰 발급은 계속 허용한다. 마지막 인증 사용 시각, 이름 변경, 활성·종료 목록, 선택적 만료를 추가한다. 별도로 실제 MCP 도구 호출과 토큰 인증 REST 요청을 계정·프로젝트 단위로 제한하여 토큰을 추가 발급해도 단기 호출 제한을 우회할 수 없게 한다.

초기 요청은 문서와 새 브랜치 준비였으나 현재는 전체 코드 구현·검증·commit·dev 대상 PR이 승인되었다. 단기 제한은 리허설 뒤 계정 1,200회·프로젝트 300회/10분으로 확정하였다. 운영 DB migration·배포·병합은 포함하지 않는다.

## Goal / 기준 상태

- 사용자는 어느 프로젝트·토큰을 이용하든 하나의 계정 사용량을 확인한다.
- 이미 열린 실행은 한도 이후에도 마무리하고, 새 실행은 정확한 회복 시각까지 기다린다.
- 토큰은 접속 자격으로 관리하며 사용량·권한·기기 정체와 혼동하지 않는다.
- 기준 커밋: `03876dd24fab12c63542b4565f087b79a877f7ef`, 조사일: 2026-10-02.
- 브랜치: `harness/account-usage-token-management`. 원격 `dev` 실재 여부 확인 및 `git fetch origin dev` 후 같은 커밋의 로컬 `dev`에서 생성했다.
- 문서 규모: `standard`. SDD 위험도: `HIGH-RISK`; 인증 만료, 여러 인스턴스의 동시 실행, 원자적 사용량 반영, 추가 DB migration이 포함되기 때문이다.
- 현재 아키텍처의 권위는 [architecture/README.md](../../architecture/README.md)와 연결 문서에 있다. 구현과 함께 protocol·product-copy·verification 계약을 갱신한다.
- 기존 다른 제안서 `local-watch-executor.md`, `non-behavioral-comment-cleanup.md`는 변경하지 않는다. 선행 토큰 UX의 커밋 `b0a2b30` 위에 구현하며 tracking 열·recorder를 재사용한다.

## 합의한 정책과 용어

아래의 제품 정책은 사용자 질의응답에서 합의한 내용이다. 초기 설계와 코드 대조 이력은 보존하고, 실제 구현 목적지와 검증 결과는 실행 기록에 연결한다.

| 용어 | 의미 |
| --- | --- |
| 계정 | `Project.ownerUserId`로 식별한 사용자. 다른 프로젝트·토큰·기기에서도 같은 사용자면 같은 한도를 이용한다. |
| 새 실행 | 트랜잭션이 성공하여 새 `AgentRun` 행이 저장된 사건. MCP 호출 한 번, 단계 하나, 보드 항목 하나와 같지 않다. |
| 사용량 구간 | 첫 새 실행 시각 `startedAt`부터 `startedAt + 5시간` 직전까지. 월별·매일 정시·최근 5시간 이동 집계가 아니다. |
| 회복 | 현재 시각이 종료 시각 이상이면 이전 구간의 사용량이 효력을 잃는 것. 다음 새 실행이 새 구간을 시작한다. |
| 단기 요청 제한 | 짧은 시간 동안 처리하는 실제 요청 수를 제한하는 서버 보호 정책. 5시간 제품 사용량과 별개다. |
| 활성 토큰 | `revokedAt = null`이고 `expiresAt = null` 또는 `now < expiresAt`인 토큰. |
| 종료 토큰 | 폐기되었거나 현재 시각이 만료 시각 이상인 토큰. 폐기와 만료가 겹치면 폐기 상태를 우선 표시한다. |
| 마지막 사용 | 서버가 토큰을 인증 자격으로 받아들인 기록. 작업 성공, 기기 접속, 실행 횟수의 증거가 아니다. |

| 정책 | 합의 내용 |
| --- | --- |
| 초기 제품 한도 | Free 20회 / Pro 100회 / Max 무제한, 계정 전체에 적용 |
| 집계 | 새 `AgentRun` 생성에만 1회. PM·dev·검증·리포트·Scout와 재작업의 새 실행을 모두 포함 |
| 제외 | 조회, 기존 실행 재개, 결과 제출, 게이트 승인, 토큰 발급·이름 변경·폐기 |
| 한도 도달 | 이미 열린 `AgentRun`만 계속 처리. 같은 보드 항목이어도 다음 단계가 새 실행을 요구하면 대기 |
| 환급 | 저장된 실행은 실패·취소·보류·폐기되어도 사용량을 돌려주지 않음. 저장 실패·transaction rollback은 미집계 |
| 기존 정책 | 30일 dispatch 한도를 제거하여 대체. 월간·주간·프로젝트별 5시간 제품 한도는 추가하지 않음 |
| 사용량 UI | 퍼센트 + 진행 막대. 사용한 횟수/전체 횟수는 사용량 영역에 노출하지 않음. Max는 `Unlimited` |
| 토큰 수 | 여러 개 허용, 활성 토큰 개수 상한 없음 |
| 토큰 수명 | 사용자가 발급 시 만료를 선택할 수 있음. 기본은 만료 없음, 기존 토큰에 소급 만료 없음 |
| 자동 처리 | 자동 교체·일괄 폐기·미사용 자동 폐기·강제 90일 만료 없음 |

기본 파이프라인의 정상 진행은 항목당 Free 약 3개, Pro 약 5개의 실행을 만들 수 있고 재작업·Scout 실행이 더해질 수 있다. 이는 코드 구조에서의 설명용 추론이며 항목별 고정 비용이나 완료 가능한 항목 수를 보장하는 정책이 아니다.

## Initial State / 구현 전 코드와 계약 대조 이력

아래 표는 기준 HEAD와 2026-10-02 재검토 시점 working tree를 구분한다. 선행 token UX의 미커밋 사용 기록·인증 연결·목록 UI·시험이 이미 존재한다. 앞선 검토에서 관련 단위/markup/binder 27개 시험은 통과했지만 그 작업 전체의 완료나 DB 검증을 대신하지 않으며 이번 문서 검사에서는 재실행하지 않았다. 다른 작업의 변경은 수정하지 않으며 후속 TOKEN은 최신 저장본을 대조하여 기존 목적지를 재사용해야 한다.

| 관심사 | 확인한 근거 | 현재 상태와 변경 영향 | 분류 |
| --- | --- | --- | --- |
| 플랜 한도 | `packages/core/entitlement.mjs`: `LIMITS`, `DISPATCH_WINDOW_DAYS`, `dispatchCutoff` | Free 60 / Pro 600 / Max 무제한, 최근 30일. 해당 축만 대체하고 `historyDays`·프로젝트·워크스페이스·백로그 한도는 유지 | Observed |
| 실행 집계 | `src/server/agents/runs.ts`, `agents/run-query.ts:cursorTransaction` | 소유자 전체 프로젝트의 `AgentRun.openedAt`을 count. writer는 기존 `User` 행 잠금 아래 다시 검사 | Observed |
| 재개 | `src/server/agents/next.ts`, `next.test.ts` | 열린 실행은 새 dispatch cap 검사를 하지 않음. 이 동작과 receipt/CAS 원자성을 보존 | Observed / Contracted |
| 파이프라인 안내 | `src/server/pipeline/run-query.ts:nextFor, headFor`, `run-rules.ts` | 별도 30일 집계로 다음 동작을 안내. 새 사용량 스냅샷과 회복 시각으로 맞춰야 함 | Observed |
| 기존 단기 제한 | `agents/next.ts:RATE_LIMIT`, `agents/runs.ts:recentSteps` | 최근 10분 60개 `AgentRunStep` 기록을 호출 토큰 기준으로 검사. 실제 모든 요청을 세지 않으며 토큰을 바꿔 분리 가능 | Observed |
| 인증 | `mcp/auth.ts`, `rest-scope.ts`, `user-scope-query.ts` | 세 접두·폐기 검사와 미커밋 인증 직후 recorder 연결이 있음. REST credential id도 이미 전달한다. 만료 열·검사는 없으며 `resolveUserScope`까지 추가해야 함 | Observed, working tree |
| 발급 | `project-token-service.ts`, `manage-user-token.server.ts`, `project-registration-query.ts` | 분산된 전체 writer에 미커밋 tracking 시작값이 연결됨. 그 연결을 유지하고 선택 만료만 확장해야 함 | Observed, working tree |
| 목록·사용 기록 | 두 tokens route/page, `token-usage-query.ts`, entity `TokenUsage` | 미커밋 nullable tracking 열·60초 원자적 recorder·Last used/Unknown/Never used와 public export가 있음. 만료·이름 수정·활성/종료 분리는 아직 없음 | Observed, working tree |
| 사용량 화면 | `src/app/(app)/billing/page.tsx`, `pages/billing/ui/billing-page.tsx` | 읽기 전용 플랜 비교 화면만 존재. 같은 계정 화면에 사용량 영역을 추가하는 것이 이번 제안 | Observed / Inferred |
| 경계 | [fsd.md](../../architecture/fsd.md), [repository-disconnection.md](../../architecture/repository-disconnection.md) | owner·availability·plan·토큰 종류·User 잠금 순서를 보존해야 함 | Contracted |
| 제품 계약 | [protocol.md](../../architecture/protocol.md), [product-copy.md](../../conventions/product-copy.md) | 30일 한도·토큰 기준 단기 집계·폐기 전까지 유효하다는 계약 유지. 미커밋 사용 기록/재사용 설명도 함께 존재하므로 이를 보존하며 새 기간·만료 계약을 갱신 | Contracted, working tree |

위 표는 구현 전 조사 이력이다. 당시에는 새 정책의 브라우저·DB 경쟁·migration·요청량 검증을 수행하지 않았다. 후속 구현의 실제 결과는 Verification Results에 별도로 기록하며 운영 트래픽 측정과 구분한다.

### 기존 토큰 UX 제안서와의 관계

[완료된 토큰 UX 문서](../completed/2026-10-02-token-management-ux.md)는 이름 설명·재사용 안내·마지막 인증 사용 기록의 COPY·USAGE 구현과 로컬 인수를 기록하고, 호출 제한·이름 변경·만료는 제외한다. 기준 커밋에는 없지만 현재 working tree에는 `prisma/migrations/20261002000000_token_usage_tracking/migration.sql`, recorder/query/binder, 인증/발급 연결, entity/page 표시와 관련 시험이 존재한다. 이를 덮어쓰거나 tracking 열을 중복 추가하지 않는다. 아래 inventory는 기존 issuer/binder 및 tracking DB 시험도 재사용 대상으로 포함한다. 선행 문서의 DB·build·브라우저 인수 기록은 그 작업의 증거이며 이번 문서 검토에서 재실행한 결과나 운영 배포 증거로 보고하지 않는다.

두 제안에서 `lastUsedAt`·`usageTrackingStartedAt`, 인증 직후 기록, 60초 갱신 간격, 기존 토큰의 `Unknown`, 부가 기록 실패 시 인증 유지 설계를 공유한다. 완료된 선행 구현을 재사용하며 같은 열·기록기를 두 번 만들지 않는다. 후속 구현의 checkout에 선행 결과가 포함됐는지 먼저 확인하고 누락된 부분이 있으면 기존 목적지·계약과 대조한다. 앞선 제안의 재사용 문구와 이 제안의 선택적 만료를 함께 적용할 때에는 “폐기 전까지 유효”를 “폐기 또는 선택한 만료 시각까지 유효”로 갱신한다. 다른 제안서의 상태·내용을 이번 문서 작업에서 수정하지 않는다.

## Scope

포함: 계정 5시간 사용량의 저장·원자적 집계·파이프라인 안내·퍼센트 UI, 세 토큰 종류의 관리·만료 인증, 계정/프로젝트 실제 요청 제한, 관련 계약·플러그인 오류 안내·검증.

제외: 결제 시스템, 플랜 자동 변경, 일간·주간·월간 추가 사용량, 프로젝트별 제품 사용량, 새로운 권한 종류, 토큰 개수 제한, 자동 회전, IP·기기 수집, 대시보드 전역 store·지속 polling, cron 초기화 작업, Redis/외부 과금 서비스, private 템플릿 본문의 개편, 다른 proposal의 실행.

## Behavioral Requirements

### REQ-USAGE-001: 최초 실행부터 5시간 구간

WHEN 현재 유효한 사용량 구간이 없는 계정의 새 실행 저장이 커밋될 때, the system shall 그 실행의 서버 기준 시각에서 시작하는 5시간 구간을 만들고 사용량을 1로 저장한다.

IF 구간 종료 시각 이상이 되면, THEN the system shall 사용량 조회에서 0%를 반환하고 다음 새 실행 저장에서 새 구간을 시작한다. 조회·거부·rollback·기존 실행 재개만으로 구간을 시작하거나 연장하지 않는다.

### REQ-USAGE-002: 계정 전체 플랜 한도

WHEN 사용자가 어느 소유 프로젝트에서든 새 실행을 요청할 때, the system shall 같은 계정 구간의 사용량에 현재 플랜의 Free 20 / Pro 100 / Max 무제한 정책을 적용한다. 토큰·프로젝트·에이전트·기기 변경으로 별도 제품 한도를 만들지 않는다.

### REQ-USAGE-003: 저장된 새 실행만 집계

WHEN 새 `AgentRun`이 커밋될 때, the system shall 사용량에 정확히 1을 반영한다. IF 저장 transaction이 rollback되면, THEN the system shall 구간 시작과 증가를 함께 취소한다.

WHILE 이미 저장된 실행이 실패·취소·보류·폐기되거나 토큰이 폐기될 때, the system shall 기존 사용량을 줄이지 않는다. 같은 열린 실행을 응답 유실 후 재조회하는 것은 신규 저장이 아니다.

### REQ-USAGE-004: 한도 이후 기존 실행 처리

WHILE 제품 한도에 도달한 상태일 때, the system shall 기존 열린 실행의 조회·재개·결과 제출과 게이트 승인을 제품 한도로 차단하지 않으며 새 실행 생성만 거부한다.

WHEN 같은 항목의 다음 단계가 새 실행을 필요로 할 때, the system shall 구간 종료까지 대기하도록 안내한다. 기존 인증·인가·availability·receipt 규칙과 단기 요청 제한은 계속 적용한다.

### REQ-USAGE-005: 파이프라인과 생성 거부의 일치

WHEN `agent_next` 또는 `pipeline_next`가 제품 한도로 새 실행을 보류할 때, the system shall 회복 시각을 포함하는 같은 계정 정책을 사용한다. 열린 실행을 이어갈 수 있으면 신규 생성 대기로 잘못 안내하지 않는다.

동시 요청 때문에 사전 안내 이후 한도가 소진될 수 있다. 최종 생성 판단은 transaction 내부의 최신 값이며 안내가 자리를 예약하지 않는다. 생성 거부는 기존 `error` 키에 새 기간에 맞는 문장을 담고 `code: "USAGE_LIMIT_REACHED"`, UTC ISO `resetAt`을 함께 반환한다. 기존 `capReason(..., "dispatches")`의 숫자·업그레이드·30일 문장을 그대로 재사용하지 않는다. 다른 한도 축의 문구는 유지한다.

`pipeline_next`의 항목별 `action: "wait", on: "cap"` 및 head의 `action: "none"`에는 해당 제품 cap일 때만 `code`, `resetAt`을 추가한다. head의 미결 항목 수·자동 Scout 비활성 등 다른 `none` 사유에는 이 필드를 넣지 않는다. 게이트 승인 후 `next`에 같은 대기 결과가 들어가더라도 승인 자체는 성공이다.

### REQ-USAGE-006: 계정 사용량 표시

WHEN 사용자가 플랜 화면을 볼 때, the system shall 현재 사용량을 정수 퍼센트와 접근 가능한 진행 막대로 표시하고 사용한 횟수/전체 횟수를 사용량 영역에 표시하지 않는다.

유한 플랜은 `floor(min(used / limit, 1) * 100)`을 사용한다. 구간이 없거나 만료되면 0%, 100%이면 회복 시각을 표시한다. Max는 `Unlimited`로 표시하고 퍼센트·진행 막대를 표시하지 않는다. 서버 조회 실패 시 “확인할 수 없음”과 새로고침 안내를 표시하며 가짜 0%를 만들지 않는다.

### REQ-USAGE-007: 재시작·플랜 변경 시 보존

WHEN 서버 재시작·토큰 재발급·프로젝트 전환·연결 해제/재연결이 일어날 때, the system shall 아직 유효한 계정 구간과 사용량을 유지한다.

WHEN 유효 구간 중 플랜이 바뀔 때, the system shall 구간·사용량을 유지하고 다음 생성과 조회에 새 한도를 적용한다. Max에서의 새 실행도 내부 사용량을 기록하여 낮은 플랜으로 변경해 한도를 초기화하지 않게 한다. 낮아진 한도 이상이면 100%와 기존 회복 시각을 표시한다.

### REQ-RATE-001: 실제 요청의 계정·프로젝트 집계

WHEN 유효한 토큰 인증과 대상 소유권 확인을 통과한 보호 요청이 도메인 처리에 진입할 때, the system shall 계정 단기 요청량을 기록하고 프로젝트가 확정된 요청이면 프로젝트 요청량도 기록한다.

대상은 `/api/mcp`의 14개 등록 도구, `/api/mcp/owner`의 `gate_approve`, `GET /api/project`, `GET /api/templates`, `POST /api/runbook`, `POST /api/projects`다. 후자는 계정만 집계한다. 인증 → 프로젝트 소유 범위 → 해당 경로의 공통 접근/플랜 판정 → limiter → 도메인 처리 순서로 연결한다. 조회·실행 재개·결과 제출·승인과 이후 도메인 실패도 요청이다. 인증 실패·다른 사용자 프로젝트·공통 경계의 접근 거부/owner sessionApprovals 거부·웹 화면 조회·MCP 초기화/도구 목록/알림·SDK input schema 거부는 포함하지 않는다. limiter 이후 agent 종류·개별 entitlement cap·도메인 입력 검증의 실패는 집계하며 이를 제외하기 위해 검증을 앞당기거나 요청량을 환급하지 않는다. selected-out의 허용된 `project_get`은 집계하고 disconnected/integrity에서는 기존 접근 오류를 유지한다.

### REQ-RATE-002: 거부·회복과 우회 방지

WHEN 계정 또는 프로젝트 단기 한도가 소진된 요청이 도착할 때, the system shall 도메인 변경과 신규 실행 집계 전에 요청을 거부하고 재시도 가능 시간을 알린다.

토큰 추가 발급·교체로 같은 subject의 요청량을 초기화하지 않는다. REST는 HTTP 429, `{ error, code: "RATE_LIMITED", retryAfterSec }`, `Retry-After` 정수 초를 반환하고 MCP 도구는 `isError: true`와 같은 JSON 필드를 반환한다. 둘 이상의 budget이 소진되면 각 종료까지의 시간 중 최댓값을 올림한 1 이상의 초를 사용한다. 거부된 요청은 허용 요청 수를 증가시키거나 구간 종료를 연장하지 않는다. 여러 인스턴스가 한도를 초과해 허용하지 않도록 DB에서 원자적으로 판단한다.

### REQ-RATE-003: 기존 제한 대체와 클라이언트 안내

WHEN 새 단기 제한이 활성화될 때, the system shall 기존 토큰별 `recentSteps` 제한을 제거하고 새 제한 하나를 사용한다. 결과 원장·receipt·검증 근거는 계속 보존한다.

WHEN 플러그인이 429 또는 MCP 제한 오류를 받을 때, the system shall 회복 시각/대기 시간을 설명하고 즉시 반복 요청하거나 변경 요청을 자동 재전송하지 않도록 안내한다. init의 runbook 기록이 제한으로 실패하면 완료로 단정하지 않고 후속 기록 필요 상태를 알린다.

### REQ-TOKEN-001: 여러 토큰과 선택적 만료 발급

WHEN 사용자가 권한이 있는 종류의 토큰을 발급할 때, the system shall 기존 토큰을 유지한 채 새 토큰을 발급하고 만료 없음 또는 미래의 만료 시각을 선택할 수 있게 한다.

유효하지 않은 날짜·과거/현재 시각은 저장 전에 거부한다. 입력은 `Expires at (UTC)`와 고정 텍스트 형식 `YYYY-MM-DD HH:mm`을 사용한다. 브라우저 언어에 따른 한국어 날짜 입력기 대신 이 형식을 쓰도록 사용자가 확정했다. 폼에서 UTC ISO 문자열로 바꿔 전달하며 서버는 정규 ISO 형식·실제 날짜·저장 직전의 미래 시각을 검증한다. 초기 프로젝트 자동 토큰은 만료 없음으로 발급한다. 기존 repo 조회·재연결·등록 거부·hu_ REST 등록은 새 hs_ 토큰을 만들지 않는다. 토큰 수 상한이나 강제 기본 만료는 적용하지 않는다.

### REQ-TOKEN-002: 모든 토큰 인증의 만료 검사

WHEN MCP 또는 REST가 토큰을 검증할 때, the system shall 해당 토큰의 폐기 여부와 `expiresAt <= now`를 검사하고 만료 토큰을 미등록·폐기 토큰과 같은 인증 실패로 거부한다.

세 접두의 허용 endpoint는 그대로 유지하고 `POST /api/projects`의 사용자 토큰도 검사한다. 현재 stateless MCP transport의 매 HTTP 요청 검증에서 폐기/만료를 확인하며 후속 요청에서도 다시 검사한다. credential 조회 후 한 번 캡처한 `at`으로 밀리초 단위 `<=` 경계를 검사하고 같은 시각을 recorder에 전달한다. 유효하게 인증된 요청은 recorder 대기로 만료 시각을 넘었다는 이유만으로 재검사·중단하지 않으며 기존 인가/writer 검사는 유지한다. 이미 도메인 처리에 진입한 요청의 완료 정책도 유지한다. AuthInfo의 초 단위 만료값을 새로 설정하여 조기 거부나 같은 요청의 추가 만료 판정을 만들지 않는다.

### REQ-TOKEN-003: 이름 변경과 소유권

WHEN 소유자가 토큰 이름을 변경할 때, the system shall trim한 비어 있지 않은 이름만 저장하며 토큰 ID·비밀값·권한·만료·발급/사용 시각을 유지한다.

IF 토큰이 해당 사용자/프로젝트 소유 범위에 없으면, THEN the system shall 변경 없이 거부한다. 프로젝트/owner token 이름 변경은 User 잠금 안에서 현재 소유권과 `available`을 재확인한다. selected-out/disconnected에서는 기존 읽기·개별 폐기만 유지하며 새 이름 변경은 허용하지 않는다. 종료 토큰의 이름 수정은 이 접근 조건을 만족할 때만 허용한다. 계정 token 이름 변경은 현재 userId 범위로 제한한다. 발급 때의 빈 이름 기본값과 중복 이름 허용은 유지한다. 여러 이름 수정이 경합하면 마지막으로 저장된 이름을 표시한다.

### REQ-TOKEN-004: 활성·종료 목록

WHEN 사용자가 프로젝트 또는 계정 토큰 목록을 볼 때, the system shall 활성 목록과 폐기/만료된 종료 목록을 구분하고 이름·발급·마지막 사용·만료·상태를 표시한다.

발급일 내림차순과 기존 조회 범위를 유지한다. 만료 없음은 `No expiry`, 폐기는 `Revoked`, 만료는 `Expired`로 표시한다. 빈 목록·저장 중·저장 실패를 구분하고 실패 후 기존 이름을 성공처럼 표시하지 않는다. 조회와 이름 수정으로 평문을 다시 보여 주지 않는다.

### REQ-TOKEN-005: 인증 사용 기록

WHEN 토큰이 유효한 인증 자격으로 수락될 때, the system shall 해당 토큰의 최초 인증 사용을 기록하고 이후 저장된 사용 시각에서 60초 이상 지난 인증에서 갱신한다. 이후 인가·도메인 실패가 인증 사용 사실을 취소하지 않는다.

인증 실패·웹 목록 조회·발급·복사·이름 수정·폐기는 사용 기록을 갱신하지 않는다. 시각이 존재하면 UTC 분으로 표시하고, 신규 추적 토큰의 기록 없음은 `Never used`, 과거 추적 근거가 없는 기존 토큰의 기록 없음은 `Unknown`으로 표시한다. 이 기록이 작업 완료나 완전한 미사용 보증이 아님을 설명한다.

### REQ-TOKEN-006: 기록 실패·동시성 처리

IF 마지막 사용의 부가 기록만 실패하면, THEN the system shall 유효한 인증과 기존 요청 결과를 유지하고 비밀값 없는 실패 진단을 남긴다. 최초 인증 DB 조회 실패나 만료 확인 실패를 허용으로 바꾸지 않는다.

WHEN 인증 기록이 동시에 저장될 때, the system shall 더 오래된 시각으로 되돌리지 않고 갱신 시 이미 폐기된 토큰 또는 인증 시각 `at`에 만료된 토큰에는 사용 기록을 쓰거나 재활성화하지 않는다. 만료 전 인증의 `at`이 뒤늦게 저장되는 것은 그 인증 사실의 기록이며 만료 이후 새 인증을 허용하는 것이 아니다. 발급·이름 수정·폐기 응답 실패 시 화면은 목록 재조회로 상태를 확인하며 평문 복원을 시도하지 않는다.

## Domain Invariants

### INV-ACCOUNT-001: 한 계정 한 구간

아직 유효한 제품 구간과 사용량은 계정에 하나만 있다. `used`는 그 구간에서 커밋된 새 실행 수이며 토큰·프로젝트·결과 상태의 수와 무관하다. 플랜·연결·메타데이터 변경으로 감소하지 않는다.

### INV-RUN-001: 원자성과 실행 정체

새 실행 저장, 제품 구간 시작/증가는 같은 transaction이다. 동일한 기존 실행 재개는 증가하지 않는다. 기존 User → PipelineRun → AgentRun 잠금 순서와 receipt/CAS·accepted outcome·rollback 계약을 보존한다.

### INV-AUTH-001: 자격과 인가 경계

`hs_`는 프로젝트 agent, `hu_`는 자신의 프로젝트를 호출별 지정하는 user agent, `ho_`는 프로젝트와 발급 사용자에 묶인 승인 자격이다. 이름·마지막 사용은 권한 근거가 아니며 만료 없음도 소유권·플랜·availability를 면제하지 않는다.

### INV-TOKEN-001: 비밀과 과거 기록

평문은 발급 응답에서 한 번만 보여 주고 서버에는 해시만 저장한다. 기존 토큰은 소급 만료하거나 사용 이력을 추정 backfill하지 않는다. 새 발급은 다른 토큰을 폐기하지 않는다.

## Engineering Constraints

### CON-ARCH-001: 기존 경계와 배포 복사본

route composition은 `src/app`, 제품 UI는 기존 FSD slice, application service는 `src/server`, DB 없는 정책은 `packages/core`에 둔다. public API와 layer 방향을 보존한다. `plugin/lib`는 직접 수정하지 않고 원본 변경 후 `npm run sync:plugin-lib`로 동기화한다.

### CON-DATA-001: 저장·migration·오류 경계

기존 migration을 수정하지 않고 추가 migration으로 확장한다. 사용량/제한 판정은 PostgreSQL이 소유하며 process-local counter·timer·fire-and-forget에 의존하지 않는다. 인증/한도 저장 DB 실패는 성공 처리하지 않으며 사용 기록의 부가 실패만 별도로 허용한다. 로그·UI·오류에는 토큰 평문·해시·Authorization header·연결 문자열을 남기지 않는다.

### CON-SCOPE-001: 단순한 변경 범위

일반적인 quota framework, 이벤트 스트림, 별도 billing 서비스, 프로젝트별 제품 한도, 전역 store, cron, 새로운 실행 상태를 도입하지 않는다. 실제 요청 limiter와 제품 한도는 책임과 오류 코드를 구분하고 중복 limiter를 남기지 않는다. `/billing`의 기존 정적 플랜 비교에서는 계약상 한도를 보여 줄 수 있지만 사용량 영역은 퍼센트만 표시한다.

### CON-VERIFY-001: 구현·검증 권한

현재는 이 문서만 수정한다. 후속 구현은 별도 구현 지시의 범위 안에서 진행하며 당시 AGENTS·설치된 Next 가이드·architecture·branch/dirty tree를 다시 확인한다. 검증은 기존 Node/tsx runner와 격리 PostgreSQL을 사용한다. DB 없는 query/factory 모듈과 `server-only` production binder를 분리하여 일반 `test:web`에서 DB singleton이나 marker를 import하지 않는다. 운영 DB 변경·배포를 검증 수단으로 실행하지 않는다. PR은 `dev` 대상이며 check green 조건을 따른다.

## Concrete Examples

### EX-USAGE-001A: 5시간 경계

- illustrates: REQ-USAGE-001, REQ-USAGE-003, INV-ACCOUNT-001
- Given: 유효 구간 없는 계정이 09:10 UTC에 첫 새 실행을 커밋한다.
- When: 14:09:59.999에 한도를 확인하고 14:10:00에 사용량을 다시 조회한다.
- Then: 전자는 기존 구간, 후자는 0%다. 14:20에 기존 실행을 재개해도 새 구간은 없고, 14:30의 첫 새 실행 커밋이 19:30까지의 구간을 만든다.

### EX-USAGE-004A: 항목이 진행 중이어도 다음 새 실행은 대기

- illustrates: REQ-USAGE-004, REQ-USAGE-005, INV-RUN-001
- Given: Free 계정이 20번째 실행을 열어 구현 중이고 같은 항목의 검증 단계에는 새 실행이 필요하다.
- When: 구현 결과를 제출하고 다음 파이프라인 동작을 조회한다.
- Then: 구현 결과는 수락되고 검증 새 실행은 resetAt까지 대기한다. 항목이 이미 시작됐다는 이유로 21번째 실행을 열지 않는다.

### EX-USAGE-003A: 마지막 자리 경쟁과 rollback

- illustrates: REQ-USAGE-002, REQ-USAGE-003, INV-RUN-001
- Given: Pro 계정의 사용량은 99이고 두 토큰이 서로 다른 사용 가능한 프로젝트에서 동시에 새 실행을 요청한다.
- When: 두 writer가 같은 사용자 잠금을 순서대로 얻는다.
- Then: 정상 커밋이면 하나만 새 실행을 저장하고 100이 된다. 첫 transaction이 rollback하면 두 번째가 자리를 사용할 수 있고 존재하지 않는 실행 비용은 남지 않는다. Free의 마지막 자리 경쟁은 같은 사용 가능한 프로젝트의 서로 다른 실행에서 19→20으로 검증한다.

### EX-TOKEN-002A: 연결 중 만료

- illustrates: REQ-TOKEN-002, REQ-TOKEN-006, INV-AUTH-001
- Given: 만료 1ms 전에 인증된 HTTP 요청이 recorder를 기다리는 동안 만료 시각에 도달한다.
- When: recorder가 종료되고 이후 같은 토큰으로 새 도구 요청을 보낸다.
- Then: 첫 요청은 기존 인가/처리 경계를 계속 따르고 기록 시각은 만료 전 `at`이다. 새 요청은 최신 만료 검사로 거부하며 기록하지 않는다. 이전 요청의 인증 성공이 새 요청으로 이어지지 않는다.

## Proposal / Technical Design

### 1. 제품 사용량의 최소 저장 모델

새 열 이름 제안은 `User.usageWindowStartedAt DateTime?`, `User.usageRunCount Int @default(0)`다. 기존 User owner 잠금을 재사용하여 새 실행 writer 한곳에서 갱신한다. 결과 원장을 다시 세는 방식은 구간 상태를 표현하지 못하고 프로젝트 삭제 등에 따라 사용량이 줄 수 있으므로 계정 counter를 둔다. 별도 실행 과금 원장이나 중복 시간 구간 테이블은 만들지 않는다.

순수 정책은 `packages/core/entitlement.mjs`의 dispatch 축과 **신규 제안** `packages/core/usage-window.mjs`에 둔다. 종료 판정·퍼센트·플랜 한도 판단은 같은 입력에서 같은 결과를 반환한다. `historyDays`는 수정하지 않는다. 신규 core 파일도 기존 복사본 동기화 대상이다.

writer는 `agents/run-query.ts:cursorTransaction`에서 기존 availability·agent·entry·receipt 검증과 열린 run 판정을 유지한다. 열린 실행이면 사용량 갱신 없이 재개한다. 새 실행이 필요하면 User 및 필요한 기존 잠금·검사가 끝난 `createRun` 안에서 현재 UTC 시각을 읽고 구간·현재 플랜을 확인한다. 여러 인스턴스의 기준을 맞추기 위해 PostgreSQL `clock_timestamp()`의 현재 시각을 사용하며 잠금 대기 이전의 transaction 시작 시각인 `now()`를 사용하지 않는다. 빈/만료 구간은 시작+count 1, 유효 구간은 count +1과 새 `AgentRun` 저장을 같은 transaction으로 처리한다. `openedAt`에도 같은 시각을 사용한다. 순수 정책 시험에서는 시각을 주입한다.

`ServerResult.ok = false`는 transaction rollback과 같지 않다. 현재 writer는 일반적인 `work(deps)`의 실패 결과를 커밋할 수 있으며 `CursorRollback`/예외만 rollback한다. 새 run이 실제 커밋된 뒤 instruction 제공이 실패했다면 1회를 유지한다. 기존 outcome·receipt의 수락 결과를 이유 없이 rollback하는 정책을 추가하지 않는다. User에는 count 비음수와 `anchor = null => count = 0`의 CHECK를 추가하여 손상된 저장값을 정상 0%로 숨기지 않는다.

읽기 query **신규 제안** `src/server/account-usage-query.ts`는 DB를 주입받고 만료된 저장값을 논리적 0으로 해석한다. 조회만으로 구간을 시작하지 않는다. production binder **신규 제안** `src/server/account-usage.ts`가 prisma와 결합한다. UI용 읽기는 기존 `READ_OPTIONS` 패턴의 읽기 전용 snapshot에서 User·Subscription·DB 현재 시각을 함께 읽고 플랜과 percent를 같은 snapshot에서 계산한다. cursor transaction 내부는 같은 helper의 `In(tx, ...)` 경로를 사용하며 별도 client transaction을 중첩하지 않는다. `agents/next.ts`와 `pipeline/run-query.ts`의 사전 안내는 같은 정책을 이용하고 writer가 최종 권위다. 30일 count 의존성과 문구는 제거하되 `AgentRunStep` 원장은 보존한다.

UI DTO 제안은 `{ kind: "limited", percent: number, resetAt: string | null } | { kind: "unlimited" } | { kind: "unavailable" }`이며 원시 counter·limit·Infinity를 client props로 보내지 않는다. 유효 구간이 없으면 resetAt은 null이다. `/billing` route는 기존 `requireUser`와 `loadHeaderUser`를 유지하고 추가 snapshot을 읽어 기존 billing page에 전달한다. snapshot 성공 시 server query 결과의 plan을 헤더/플랜 표에도 사용하여 percent와 일치시킨다. 추가 snapshot 읽기만 실패하면 이미 읽은 header의 plan은 유지하고 사용량만 unavailable로 변환한다. 인증 redirect/notFound와 기존 header 로딩 실패는 삼키지 않으며 Free나 0%로 대체하지 않는다. UI usage DTO와 기존 PlanId prop을 구분하므로 사용량 영역에 counter/limit를 보내기 위한 새 public endpoint나 userId 입력 action은 필요 없다.

현재 `next.config.ts`에는 cacheComponents·rewrite가 없고 billing/tokens는 요청 인증과 직접 DB 읽기를 사용한다. account snapshot에 `use cache`/장기 캐시를 붙이지 않는다. 서버 새로고침으로 갱신하며 자동 polling·timer는 추가하지 않는다. 조회 시점의 정보임을 표시하고 브라우저의 뒤로 가기·다른 탭을 실시간 계량기로 설명하지 않는다. token metadata 변경 성공은 현재의 literal `revalidatePath` 경로를 유지하며 recorder는 Next 캐시를 변경하지 않는다. refresh가 발급 폼 client state의 평문을 반드시 지운다고 주장하지 않는다.

### 2. 단기 실제 요청 제한

단기 구간은 10분이며 제품의 5시간 구간과 별도다. 계정/프로젝트 각 subject의 첫 허용 요청부터 10분 동안 같은 counter를 이용한다. baseline 리허설 후 계정 1,200회·프로젝트 300회로 사용자 확정을 받았다. 플랜별·토큰별·승인 전용 예외 budget은 만들지 않는다. 수치 결정 근거는 BLK-RATE-01에 보존한다.

저장 모델 **신규 제안** `RequestRateWindow`는 `(scope, subjectId)` unique key와 `startedAt`, `count`로 계정/프로젝트마다 현재 구간 한 행만 유지한다. scope는 account/project만 허용한다. ownerUserId를 User cascade FK로 저장하고 project scope에는 projectId를 Project cascade FK로 저장한다. CHECK로 account의 subjectId=ownerUserId 및 projectId IS NULL, project의 projectId IS NOT NULL 및 subjectId=projectId, 비음수 count를 확인한다. SQL CHECK의 NULL 결과가 통과하므로 projectId의 비어 있지 않음을 별도로 명시한다. cascade로 사용자/프로젝트 삭제 후 budget만 남는 경로를 막는다. subjectId는 확인된 내부 ID이며 공개 DTO에 추가하지 않는다.

`src/server/request-rate-limit.ts`는 DB를 주입받는 `consumeRequestBudget(client, ownerUserId, projectId)`와 `consumeProjectRequestBudget(client, projectId)`를 제공한다. `request-rate.ts`의 production binder가 prisma로 조합한다. 같은 transaction 안에서 account → project 순서로 insert-on-conflict/row lock하여 **없는 행의 동시 최초 생성**도 직렬화한다. 필요한 모든 잠금 후 `database-clock.ts`에서 DB 현재 시각을 UTC timestamp로 한 번 읽어 두 budget을 검사한다. 둘 다 허용 가능한 경우에만 구간 시작/회복과 증가를 저장한다. 어느 쪽이든 거부하면 전용 rollback 결과를 transaction 밖에서 429/MCP 오류로 변환하여 다른 subject의 증가·reset·초기 행 생성도 커밋하지 않는다. 단순 return-false를 부분 rollback으로 취급하지 않는다. 구간 경계에서는 첫 허용 요청이 새 구간을 시작한다. 배열 큐·요청별 원장·cron은 필요 없다.

limiter transaction은 도메인 writer transaction 전에 완료하여 User/PipelineRun/AgentRun 잠금과 섞지 않는다. 이후 도메인 실패는 실제 처리 요청으로 남기되 제품 실행 저장 실패는 제품 사용량에서 제외한다. limiter DB 실패는 도메인 변경 전에 요청 실패로 반환한다.

MCP는 transport POST 수가 아니라 등록된 callback의 invocation을 센다. agent 목록은 `project_get`, `project_sync`, `backlog_list`, `backlog_get`, `backlog_add`, `board_list`, `board_get`, `board_propose`, `board_transition`, `plan_submit`, `report_submit`, `validation_record`, `agent_next`, `pipeline_next`; owner는 `gate_approve`다. 공통 scope/access 경계에서 요청당 한 번만 호출하며 agentNext/board/advice 내부에 추가 집계를 붙이지 않는다. hu_는 userId와 프로젝트 소유자를 대조하고 hs_/ho_는 확인된 Project.ownerUserId를 subject로 사용한다. `ProjectAccess` 현재 반환값에는 ownerUserId가 없으므로 확인된 project 조회/select 또는 내부 scope DTO를 확장하되 공개 `ProjectView`에 유출하지 않는다.

REST project scope의 내부 성공값에는 ownerUserId를 전달할 수 있지만 외부 JSON의 기존 project/template 키는 유지한다. account-only registration은 resolveUserScope의 userId를 사용한다. 인증 → scope → access 순서와 owner의 sessionApprovals 검사를 그대로 유지한 뒤 limiter를 적용한다. 보호 대상의 정확한 순서는 REQ-RATE-001을 따른다. 미인증/접근 거부의 네트워크 abuse 대응은 이 limiter의 범위 밖이며 현재 저장소에서 별도의 인프라 보호가 제공된다고 가정하지 않는다.

현재 `src/server/result.ts:ServerResult`의 실패는 reason만 담고 `tools.ts:fail/unwrap`, `owner-tools.ts:fail`이 외부 `{ error }`로 변환한다. 여기에 typed failure union으로 plain reason / USAGE_LIMIT_REACHED+resetAt / RATE_LIMITED+retryAfterSec을 구분한다. unknown 예외나 다른 도메인 실패를 문자열로 추측하여 limit 오류로 바꾸지 않는다. 해당 fail/unwrap이 실패 객체의 metadata를 JSON body로 전달하도록 수정하고 원래 성공 응답은 유지한다. pipeline cap DTO는 `PipelineNext`, `HeadNext`와 입력의 typed cap 값까지 연결하여 중간에서 resetAt이 사라지지 않게 한다.

REST의 `ProjectIdentityResult`, `TemplateResult`, `RunbookResult`, `RegisterProjectResponse`에는 429 분기를 추가한다. 네 route의 실패 serializer가 code/retryAfterSec과 Retry-After를 실제 HTTP body/header에 전달해야 한다. `reconnectPath`와 기존 200/201/400/401/403/404/409 body는 보존한다. 정책을 route에서 다시 구현하지 않는다.

plugin의 `responseFailure`는 Retry-After 또는 typed retryAfterSec을 읽어 양의 대기 시간을 표시한다. `--print-project`, `--register`, templates 다운로드, runbook 기록의 네 fetch 경로를 모두 다룬다. 앞선 세 경로의 실패는 기존 비정상 종료를 유지하고, 파일 생성 뒤 runbook 429에서는 파일을 보존한 채 버전 미기록/대기 안내와 비정상 종료로 init 완료를 방지한다. 401/403/409 처리와 local templates/--dry-run의 네트워크 부재는 유지한다. mutation 자동 재전송이나 5시간 대기 loop는 추가하지 않는다. `gate_approve` 성공 뒤 advice 실패는 기존 “이미 승인됨”과 pipeline_next 재조회 경로를 유지하며 승인 요청을 재전송하지 않는다.

### 3. 토큰 metadata·인증

세 테이블에 `expiresAt DateTime?`를 추가하고 선행 `lastUsedAt DateTime?`, `usageTrackingStartedAt DateTime?`와 tracking migration을 재사용한다. expiry의 기존 행은 null이며 이미 저장된 사용 시각/표식은 보존한다. 신규 발급 writer는 tracking 시작 시각과 선택한 expiry만 명시하고 lastUsedAt은 null로 둔다. expiresAt의 null은 만료 없음이다. 발급 폼의 고정 UTC 텍스트 입력은 빈 값이면 만료 없음이며 신규 토큰의 적용 시각을 보여 준다. 기존 토큰의 만료 변경/연장 기능은 이번 범위가 아니다.

`mcp/auth.ts`의 agent/user/owner 검증, `rest-scope.ts`의 두 resolver, production select에 만료를 연결한다. credential 조회 뒤 캡처한 하나의 `at`으로 revokedAt 우선·expiresAt <= at 거부를 판정하며 종류 판정을 유지한다. `TokenRow`, `OwnerTokenRow`, `UserTokenRow`, REST credential row와 production select/fixture에 `expiresAt: Date | null`을 명시하여 필드 누락을 무기한으로 취급하지 않는다. REST agent/user row의 recorder용 id는 이미 있으므로 유지하고 추가 lookup을 만들지 않는다.

이 타입을 주입하는 기존 `src/server/harness-init.test.ts`와 `tests/server/integration/project-connection.test.ts`의 credential fixture도 null expiry를 명시한다. `tests/server/project-connection-bindings.test.ts`의 발급 adapter 인자 검사는 선택 expiry 전달을 포함하도록 갱신하되 세션 userId·service 경유·직접 credential 생성 금지 검사를 보존한다. 기존 연결 시험을 삭제하거나 타입을 느슨하게 만들어 변경을 통과시키지 않는다.

설치된 `mcp-handler@2.1.1`의 `dist/index.mjs:withMcpAuth`는 매 GET/POST마다 verifyToken을 await하고 `createMcpHandler`는 `legacy: "stateless"`와 현재 req.auth를 SDK에 전달한다. 2026-10-02 격리 메모리 Request 검증에서 두 요청 모두 verifier 호출, 두 번째 인증 거부 시 callback 미호출을 확인했다. 현재 버전에는 세션용 auth cache나 callback의 중복 DB 재검증이 필요 없다. 기존 wrapper 안의 makeVerifyToken/makeVerifyOwnerToken에서 expiresAt을 검사하고, future SDK 변경 시 transport 시험 실패를 중단 조건으로 삼는다. AuthInfo.expiresAt은 초 단위 `< Date.now()/1000`로 verifier 완료 후 검사되므로 DB 시각을 내림해 전달하면 최대 1초 일찍 거부하고 recorder 대기 뒤 첫 요청도 다시 거부할 수 있다. 현재처럼 AuthInfo.expiresAt을 설정하지 않고 애플리케이션의 `at` 기반 밀리초 판정을 사용한다. 새 wrapper/transport 종류는 만들지 않는다.

암호 생성용 `packages/core/token.mjs`는 node:crypto를 import하므로 client 만료 폼에서 import하지 않는다. 신규 순수 `packages/core/token-validity.mjs`에 `isTokenActive`와 `parseTokenExpiry`를 두고 auth/REST/issuer 및 필요 시 client에서 사용한다. 발급 함수의 기존 label 인자는 유지하고 expiresAt ISO/null을 선택적인 추가 인자로 전달하며 생략은 무기한이다. 기존 ActionResult의 success/data/error 형식은 유지한다.

마지막 사용은 앞선 UX 문서의 `TokenUsageRecorder`, `makeRecordTokenUsage`, `tryRecordTokenUsage`, `recordTokenUsage` 책임과 인자 순서를 재사용한다. `token-usage-query.ts`는 주입 가능한 query, `token-usage.ts`는 server-only binder다. production 여섯 인증 연결이 recorder를 제공해야 한다. 인증에 사용한 `at`을 그대로 전달하여 명시적으로 await하며 첫 인증은 즉시, 이후 저장값에서 60초 이상 지나면 갱신한다. 원자적 updateMany 조건은 ID·현재 미폐기·`expiresAt IS NULL OR expiresAt > at`·기존 시각 없음 또는 `lastUsedAt <= at - 60초`다. 저장 시점의 별도 clock으로 이미 수락한 인증의 만료를 재판정하지 않는다. DB lookup 함수에 부수효과를 숨기지 않는다. 부가 recorder 오류만 분리하고 logger 실패도 인증 결과를 바꾸지 않게 한다. SDK가 verifyToken의 thrown error를 그대로 console.error하는 경계에는 비밀 없는 고정 예외를 전달하여 원시 credential query 오류를 출력하지 않되 인증은 계속 거부한다.

60초 조건은 행 변경 횟수를 줄이며 DB query/await 자체를 없애지 않는다. 현재 db.ts에는 별도 query timeout이 없으므로 recorder 지연 중 즉시 응답을 보장하지 않는다. 지연·rejection·역순·폐기/만료 경합을 검증하고 별도 pool·timer·timeout 인프라를 추가하지 않는다.

프로젝트/owner 발급은 기존 project-token-service의 User 잠금·availability·Pro 자격을 유지한다. 사용자 발급/rename은 각 feature의 server adapter가 현재 세션 userId를 전달하며 client userId를 받지 않는다. `token-management-query.ts`의 project/owner rename은 기존 availability transaction과 User 잠금 안에서 소유권/access를 검사하고 ID+projectId(+owner token의 userId)로만 label을 갱신한다. user rename은 ID+현재 userId다. 이름 변경은 projectAvailabilityVersion/event/lastSyncedAt을 변경하지 않는다.

client-safe `RenameTokenForm`, `RenameUserTokenForm`은 각 feature index.ts로 export하고 server mutation은 index.server.ts로 export한다. route가 바인딩한 callback을 page→form으로 전달한다. `TokenUsage`의 상태·시간 표현만 entity public API로 공유하며 같은 layer page/feature 내부를 cross-import하지 않는다. 날짜/이름 form을 위한 범용 CRUD framework를 만들지 않는다.

## Runtime Lifecycle / Safety Analysis

| 사건·경계 | 기대 처리 | 근거 요구 |
| --- | --- | --- |
| 새 구간의 마지막 자리 동시 실행 | User 잠금으로 하나만 허용. 기존 availability/plan 경쟁도 같은 최신 계정 상태로 판정 | REQ-USAGE-002, REQ-USAGE-003 |
| 구간 끝에서 긴 잠금 대기 | 잠금 획득 이후 시각 기준으로 새 구간 여부 결정 | REQ-USAGE-001 |
| 응답 유실·transaction 재시도 | 기존 open run 재사용이면 추가 집계 없음. rollback retry에는 존재하지 않는 비용 없음 | REQ-USAGE-003, INV-RUN-001 |
| run 커밋 후 instruction/render 실패 | 실제 저장된 run과 1회 사용량 유지. failed result를 rollback으로 오해하지 않음 | REQ-USAGE-003 |
| 한도 100%인 기존 run의 완료 | receipt 검증과 기존 write 허용. 다음 새 실행은 대기 | REQ-USAGE-004 |
| 제한된 query·승인 | 제품 사용량은 증가하지 않음. 단기 limiter는 적용되므로 짧은 대기가 생길 수 있음 | REQ-RATE-001, REQ-RATE-002 |
| 토큰 만료 직전 인증·recorder 대기 | 동일 `at`으로 유효성/기록 판정, 기존 인가·완료 정책 유지. 다음 요청은 최신 만료 검사. 초 단위 AuthInfo 추가 검사 없음 | REQ-TOKEN-002, REQ-TOKEN-006 |
| 이름 수정 중 폐기 | 폐기를 되돌리지 않고 label만 저장. 재조회 결과의 종료 상태 유지 | REQ-TOKEN-003, INV-TOKEN-001 |
| 이름 수정과 사용 해제/플랜 변경 경합 | User 잠금 후 최신 available 확인. 사용 불가면 수정 없이 읽기/revoke만 유지 | REQ-TOKEN-003, INV-AUTH-001 |
| 최초 두 요청이 없는 budget 행에 경합 | unique key와 insert/lock으로 단일 counter. 양쪽 budget 거부 시 증가/reset 모두 rollback | REQ-RATE-002 |
| User/Project 삭제 | FK cascade로 대응 budget 제거. 살아 있는 계정 구간은 token/repo 해제로 삭제하지 않음 | REQ-USAGE-007, CON-DATA-001 |
| 과거 토큰의 사용 시각 null | `Unknown`; createdAt이나 outcome 원장으로 최초 사용 추정 없음 | REQ-TOKEN-005 |
| 기록 DB 실패 | 사용량·인증 판정 실패는 실패 처리. 부가 lastUsed 실패만 요청 결과 유지 | CON-DATA-001, REQ-TOKEN-006 |
| 서버/페이지 재시작 | DB 상태 재조회, 자동 발급·counter 초기화·평문 복원 없음 | REQ-USAGE-007, REQ-TOKEN-004 |

도메인 scope·availability는 기존 조회 및 writer 검사를 계속 수행한다. 이 기능이 권한 체크를 대체하지 않는다. 인증·단기 limiter·제품 cap의 거부 진단은 이유와 시각만 다루며 비밀이나 개인 기기 정보는 수집하지 않는다. 사용 기록은 완전한 감사 로그가 아니므로 이를 기준으로 자동 폐기하거나 보안 미사용 판정을 하지 않는다.

라우트 집합과 토큰 접두는 유지한다. public 정적 자산 URL, dynamic import, 결제/analytics/외부 SDK, localStorage/sessionStorage는 변경 대상이 아니다. FSD public export와 client/server 경계는 기존 검사기로 검증한다. 실측하지 않은 요청 수치·부하·운영 상태는 검증 완료로 주장하지 않는다.

## Blockers / Readiness

### BLK-RATE-01: 단기 계정·프로젝트 요청 수치 — Resolved

후속 구현 중 사용자가 리허설 후 RATE까지 포함하도록 선택했고, baseline 준비 뒤 프로젝트 300회·계정 1,200회/10분을 확정했다. `scripts/rehearse-request-rate-baseline.ts`는 현재 MCP callback/schema와 private 템플릿 단계에 근거한 scripted burst다. 도메인 IO는 fixture이며 운영 트래픽 peak를 측정한 것으로 주장하지 않는다. PM 8·Scout 10·계획 4·검증 7·구현 6·감사 5·승인 포함 항목 33회, 전체+재시도 59회였다. CLI의 별도 registration 1·init 2회는 실제 HTTP 시험으로 확인했다. 세션당 62회, 프로젝트당 4세션 248회, 같은 계정 4프로젝트 992회를 가정하여 각 300/1,200회에 약 20% 여유를 확보한다. 모든 플랜에 동일하며 별도 승인 budget은 없다. 실제 DB 부하·응답 경계 재검증은 V-RATE-DB의 별도 실행 증거로 남긴다.

아래는 수치 확정 전 blocker와 처리 방식의 이력이다. 현재 RATE 실행을 막지 않는다.

- classification: downstream — Phase RATE
- evidence: 현재 코드의 60/10분은 실제 호출 수가 아니라 토큰별 outcome 기록 수다. 이를 계정/프로젝트 모든 요청에 그대로 적용할 근거와 합의가 없다.
- affects: REQ-RATE-001, REQ-RATE-002, REQ-RATE-003, TASK-RATE-01
- impact: 정상 init·파이프라인·여러 프로젝트를 불필요하게 차단하거나 보호가 부족할 수 있다.
- unblock requirement: RATE 구현 전에 현재 정상 init, PM/Scout, 항목 진행과 결과 제출, 실패·재시도, 복수 프로젝트의 요청 시퀀스를 리허설하여 10분 peak를 계산한다. REQ-RATE-001의 집계 대상 callback/REST만 외부 관측으로 분류하고 인증·접근/SDK 거부는 제외한다. DB 없는 현재 MCP callback 시험과 `src/server/harness-init.test.ts`의 mock HTTP 클라이언트가 기준이며 필요 시 별도로 승인된 격리 환경에서 정상 전체 시퀀스를 측정한다. 같은 계정의 복수 프로젝트 요청을 합산할 수 있도록 시각·내부 scope·시퀀스 종류만 기록하고 credential은 기록하지 않는다. 계정 cap·프로젝트 cap, peak 근거·여유분·허용할 동시 세션 수를 이 절에 기록하고 사용자와 확정한다. 제품 5시간 상한으로 단기 수치를 대신 계산하지 않는다.
- owner: 후속 구현 담당자가 근거를 준비하고 사용자와 수치를 확정한다.
- stop condition: 값이 정해지기 전 RATE의 실행 한도와 production 설정을 구현·활성화하지 않는다. 수치 결정에 필요한 baseline 측정은 limiter 구현에 의존하지 않는다. V-RATE-DB는 확정 후 원자성과 정상 부하를 재검증하며 선행 수치 결정의 조건으로 삼지 않는다. 이번 문서 작업은 측정을 수행하지 않는다. 안전한 문서 작성 및 별도로 승인된 USAGE/TOKEN 작업은 막지 않는다.
- accepted handling: 이번 대조 검토 중 사용자가 “측정 후 확정하도록 유지”를 선택했다. 이 문서 검토에서 임의 숫자를 넣거나 limiter를 삭제하여 blocker를 감추지 않는다. 숫자 미정은 의도적으로 보류한 실행 결정이며 추가적인 문서 결함으로 해석하지 않는다.

BLK-RATE-01은 해소되었고 현재 구현 차단 사항은 없다. 아래 과거 reconciliation 기록은 문서 전용 요청 당시의 상태다. 이후 전체 구현·검증·commit·PR 지시 및 수치 확정을 받았으며 실행 결과로 갱신한다. 운영 배포의 혼합 writer·expiry verifier 전환은 별도 배포 조건이다.

## Affected Files / 후속 허용 범위

아래는 초기 구현 inventory이며 `신규 제안`·`미커밋 기존`은 작성 시점의 분류다. 최종 구현은 이 목적지를 사용하고 재사용 가능한 기존 테스트에 검증을 합쳤다. 별도 추가 목적지는 `src/server/database-clock.ts`, `src/server/request-rate.ts`, `packages/core/request-rate.mjs`, `plugin/lib/request-rate.mjs`, baseline/Next HTTP 리허설 스크립트와 실행 기록에 명시한다.

| 정확한 경로 | 후속 변경 | 책임·주요 위험 |
| --- | --- | --- |
| `packages/core/entitlement.mjs`, `packages/core/entitlement.test.mjs` | dispatch 축/기간 대체 | 다른 축·historyDays 유지 |
| `packages/core/usage-window.mjs`, `packages/core/usage-window.test.mjs`, `packages/core/token-validity.mjs`, `packages/core/token-validity.test.mjs`(신규 제안) | 순수 시간/만료 정책 | client-safe, clock 주입, node:crypto 분리 |
| `prisma/schema.prisma` | User/token 열·RequestRateWindow·relation | 기존 모델/데이터 유지 |
| `prisma/migrations/20261002010000_account_usage_window/migration.sql`, `prisma/migrations/20261002020000_token_management_metadata/migration.sql`, `prisma/migrations/20261002030000_request_rate_window/migration.sql`(신규 제안) | additive migration와 CHECK/FK | TOKEN tracking 선행 적용 시 expiry만 추가, RATE는 blocker 해소 후 |
| `src/server/account-usage-query.ts`, `src/server/account-usage-query.test.ts`, `src/server/account-usage.ts`(신규 제안) | snapshot·writer helper·production binder | runtime DB와 단위 시험 분리 |
| `src/server/agents/next.ts`, `src/server/agents/runs.ts`, `src/server/agents/run-query.ts`, `src/server/agents/next.test.ts`, `src/server/agents/run-query.test.ts` | quota 연결·old limiter 제거 | User 잠금·resume·receipt/CAS 유지 |
| `src/server/pipeline/run-query.ts`, `src/server/pipeline/run-rules.ts`, `src/server/pipeline/run-query.test.ts`, `src/server/pipeline/run-rules.test.mjs` | cap DTO/resetAt | 값이 head/item/승인 후 next까지 전달됨 |
| `src/server/request-rate-limit.ts`, `src/server/request-rate.ts`, `src/server/database-clock.ts`, `tests/server/integration/request-rate-limit.test.ts` | DB 주입 limiter와 production binder | 없는 행 경쟁·부분 commit 금지·UTC clock |
| `src/server/result.ts`, `src/server/mcp/tools.ts`, `src/server/mcp/owner-tools.ts`, `src/server/mcp/tools.test.mjs`, `src/server/mcp/owner-tools.test.mjs` | typed failure 및 callback 집계 | metadata serializer·15개 callback 한 번씩 |
| `src/server/mcp/auth.ts`, `src/server/mcp/deps.ts`, `src/server/mcp/owner-deps.ts`, `src/server/mcp/auth.test.mjs` | 만료·recorder·limiter wiring | stateless wrapper 유지, 고정된 진단 |
| `src/server/rest-scope.ts`, `src/server/rest-scope.test.ts`, `src/server/user-scope-query.ts` | expiresAt/id·내부 scope | 공개 project JSON과 분리 |
| `src/server/project-token-service.ts`, `src/server/project-token-service.test.ts`, `src/server/project-token.ts`, `src/server/project-registration-query.ts`, `src/server/project-registration-query.test.ts` | 발급/initial metadata | User 잠금·Pro 자격·기존 repo 무발급 |
| `src/server/token-usage-query.ts`, `src/server/token-usage-query.test.ts`, `src/server/token-usage.ts`(미커밋 기존), `src/server/token-management-query.ts`, `src/server/token-management-query.test.ts`(신규 제안) | 기존 recorder의 expiry predicate 확장·scoped rename | 앞선 UX 결과와 동일 symbol 재사용 |
| `src/server/project-identity-query.ts`, `src/server/project-identity-query.test.ts`, `src/server/project-identity.ts` | identity 429/recorder·scope | 200 project body 유지 |
| `src/server/templates-query.ts`, `src/server/templates-query.test.ts`, `src/server/templates.ts` | templates 429/recorder | 성공 deliverable 본문/entitlement 유지 |
| `src/server/runbook-query.ts`, `src/server/runbook-query.test.ts`, `src/server/runbook.ts` | runbook 429/recorder | version 저장과 lastSyncedAt 분리 |
| `src/server/project-registration.ts`, `tests/server/project-registration.test.ts` | account-only limiter/expiry | 200/201·reconnectSlug 의미 유지 |
| `src/server/harness-init.test.ts`, `tests/server/project-connection-bindings.test.ts`, `tests/server/integration/project-connection.test.ts` | 기존 credential fixture·발급 인자·연결 회귀 시험 갱신 | expiry 필드/전달·권한 보존, old recentRuns 검사를 새 계정 구간 보존 검사로 대체 |
| `src/app/api/project/route.ts`, `src/app/api/templates/route.ts`, `src/app/api/runbook/route.ts`, `src/app/api/projects/route.ts` | 429 body/header 전달 | route는 정책 없는 composition |
| `src/app/(app)/billing/page.tsx`, `src/fsd/pages/billing/ui/billing-page.tsx`, `src/fsd/pages/billing/ui/billing-page.test.ts`(시험 신규 제안), `src/fsd/shared/lib/entitlement-copy.ts`, `src/fsd/shared/lib/entitlement-copy.test.ts` | snapshot DTO·진행 막대·기간 문구 | unavailable와 Unlimited 구분 |
| `src/app/(app)/p/[slug]/tokens/page.tsx`, `src/app/(app)/settings/tokens/page.tsx`, `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx`, `src/fsd/pages/user-tokens/ui/user-tokens-page.tsx` | metadata select·callback·목록 | 기존 목록 scope 유지 |
| `src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts`, `src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts`(미커밋 기존) | 최종 markup 시험 확장 | 빈/종료/UTC/secret 미노출 |
| `src/fsd/features/manage-token/api/manage-token.server.ts`, `src/fsd/features/manage-token/ui/new-token-form.tsx`, `src/fsd/features/manage-token/ui/new-owner-token-form.tsx`, `src/fsd/features/manage-token/index.ts`, `src/fsd/features/manage-token/index.server.ts` | 선택 만료·rename action export | client는 server 모듈 직접 import 금지 |
| `src/fsd/features/manage-user-token/api/manage-user-token.server.ts`, `src/fsd/features/manage-user-token/ui/new-user-token-form.tsx`, `src/fsd/features/manage-user-token/index.ts`, `src/fsd/features/manage-user-token/index.server.ts` | user 발급/rename | 현재 세션 사용자만 전달 |
| `src/fsd/features/manage-token/ui/rename-token-form.tsx`, `src/fsd/features/manage-user-token/ui/rename-user-token-form.tsx`(신규 제안) | 관리용 rename UI | pending/실패/재조회, 비밀 재표시 없음 |
| `src/fsd/entities/project-token/ui/token-usage.tsx`, `src/fsd/entities/project-token/ui/token-usage.test.ts`(미커밋 기존), `src/fsd/entities/project-token/index.ts`, `src/fsd/entities/project-token/ui/token-reveal.tsx`, `src/fsd/entities/project-token/ui/owner-token-reveal.tsx`, `src/fsd/entities/project-token/ui/token-reveal.test.ts` | 기존 공용 표시 재사용·만료 수명 copy | copy-lock ID와 셸 참조 유지 |
| `src/fsd/features/manage-token/ui/token-names.test.ts`, `src/fsd/features/manage-user-token/ui/token-name.test.ts`(미커밋 기존) | 발급 form markup 시험 확장 | 기존 이름 설명 유지·UTC 만료 입력 확인 |
| `src/fsd/features/create-project/api/create-project.server.ts` | initial writer 필요 시 조정 | 이미 있는 repo/plaintext 재표시 없음 |
| `plugin/bin/harness-init.mjs`, `plugin/bin/harness-init.test.mjs`, `plugin/skills/init/SKILL.md`, `plugin/.claude-plugin/plugin.json` | 429/부분 완료 안내·patch version | 등록/생성 성공 여부 구분 |
| `tests/server/token-usage-bindings.test.ts`, `tests/server/token-issuance-bindings.test.ts`, `tests/server/account-usage-bindings.test.ts`, `scripts/rehearse-account-usage-and-tokens.ts` | 기존 production/issuer/route binder 및 실제 rename/snapshot 경계 | 일반 test:web에서 DB 모듈 import 금지·실제 Server Action 세션 확인 |
| `tests/server/integration/agent-runs.test.ts`, `tests/server/integration/migration.test.ts`, `tests/server/integration/head.test.ts`, `tests/server/integration/project-registration.test.ts` | 기존 DB 시나리오 확장 | baseline fixture/receipt 유지 |
| `tests/server/integration/token-usage.test.ts`, `tests/server/integration/token-usage-migration.test.ts`(미커밋 기존) | tracking 경합/nullable migration 회귀 재사용 | 기존 추적 값 보존·expiry 추가 대조 |
| `tests/server/integration/account-usage.test.ts`, `tests/server/integration/token-management.test.ts`, `tests/server/integration/request-rate-limit.test.ts`(신규 제안) | 실제 동시성·migration·transport | TEST_DATABASE_URL 격리·fixture 정리 |
| `docs/architecture/protocol.md`, `docs/architecture/invariants.md`, `docs/architecture/verification.md`, `docs/conventions/product-copy.md`, `scripts/retired-copy.test.mjs` | 계약/copy/old-absence 검사 | 구현과 같은 변경에서 갱신 |

신규 파일의 parent는 기존 디렉터리이며 신규 migration의 폴더는 생성해야 한다. `신규 제안`은 현재 working tree에도 없는 목적지이고 `미커밋 기존`은 HEAD에는 없지만 저장된 재사용 대상이다. 생성물은 아래 생성 명령의 목적지다. 구현 직전에 모든 create 목적지의 collision과 선행 token UX migration/열을 다시 확인하고 충돌 시 다른 사람의 파일을 덮어쓰지 않는다. 이미 구현된 tracking을 IF NOT EXISTS로 임의 건너뛰지 않고 타입/nullable/default/기록 계약을 먼저 대조한다.

보존/읽기 목적지: `src/app/api/mcp/route.ts`, `src/app/api/mcp/owner/route.ts`의 wrapper, `src/server/pipeline/run.ts`의 headFor/nextFor export, `src/server/project-access-query.ts`의 READ_OPTIONS/access, `src/server/project-availability-service.ts`의 User 잠금, `src/fsd/shared/api/result.ts`의 ActionResult, `src/fsd/shared/lib/copy-lock.ts`, `packages/core/deliver.mjs`, `.claude-plugin/marketplace.json`, `scripts/plugin-lib.mjs`, `scripts/test-server-integration.mjs`, `.github/workflows/check.yml`, `package.json`, `prisma.config.ts`, `tsconfig.json`, `next.config.ts`는 새 기능 때문에 계약을 바꾸지 않는다. `.claude-plugin/marketplace.json`의 source는 `./plugin`을 유지한다. 최초 구현은 선행 UX의 0.3.7 다음 0.3.8이었으나, 최종 dev의 watch 0.4.0을 반영하여 최종 patch는 0.4.1이다. watch 기능을 되돌리거나 같은 version을 재사용하지 않는다. 게시/배포는 수행하지 않는다.

billing의 기존 `AppHeader`/`loadHeaderUser`는 `src/fsd/widgets/app-header/index.ts`, `src/fsd/widgets/app-header/index.server.ts`의 public API를 유지한다. 소유 파일 `src/fsd/widgets/app-header/ui/app-header.tsx`, `src/fsd/widgets/app-header/api/app-header.server.ts`는 보존하고 route가 plan 값을 조합한다. V-USAGE-UI의 route binding과 최종 header/table markup에서 이를 검증한다.

generated 목적지는 `src/generated/prisma/client.ts`, `src/generated/prisma/browser.ts`, `src/generated/prisma/models.ts`, `src/generated/prisma/commonInputTypes.ts`, `src/generated/prisma/enums.ts`, `src/generated/prisma/internal/class.ts`, `src/generated/prisma/internal/prismaNamespace.ts`, `src/generated/prisma/internal/prismaNamespaceBrowser.ts`, `src/generated/prisma/models/User.ts`, `src/generated/prisma/models/Project.ts`, `src/generated/prisma/models/ProjectToken.ts`, `src/generated/prisma/models/OwnerToken.ts`, `src/generated/prisma/models/UserToken.ts`, 신규 `src/generated/prisma/models/RequestRateWindow.ts`다. 기존 다른 model의 생성 파일은 generator 결과를 보존하며 직접 편집하지 않는다. `plugin/lib/entitlement.mjs`, 신규 `plugin/lib/usage-window.mjs`, `plugin/lib/token-validity.mjs`는 sync 명령 결과다. 둘 다 생성 명령으로만 갱신한다.

금지: `.env`·비밀 설정의 직접 읽기/편집/출력, private 템플릿 본문 변경, generated 직접 편집, 기존 migration 수정, root app 추가, unrelated architecture/디자인 개편, 다른 active proposal 수정·실행. 공식 명령의 기존 환경 로딩은 허용하되 비밀값을 보고서에 기록하지 않는다. 새로운 공용 primitive는 실제 재사용 책임이 확인될 때만 허용한다.

### Symbol / public API 연결

| symbol 책임 | 현재 소유/제안 목적지 | 후속 소비·검증 |
| --- | --- | --- |
| usage 계산·snapshot | usage-window, account-usage-query; runtime binder account-usage | next/runs/run-query, pipeline run-query, billing route. V-USAGE-POLICY/DB/UI |
| token validity/expiry | core token-validity의 isTokenActive/parseTokenExpiry/parseTokenExpiryInput | auth/rest/issuer 및 고정 UTC client 입력; token.mjs crypto는 client에 import하지 않음. V-TOKEN-AUTH/DB/UI |
| limit failure | 기존 result.ts의 ServerResult 실패 union 확장 | next → createToolDeps → tools.fail/unwrap; owner-tools 및 REST result/route serializer. V-RATE-BOUNDARY/USAGE-POLICY |
| pipeline cap/reset | run-rules의 PipelineNext/HeadNext와 cap 입력, run-query의 nextFor/headFor | run.ts 기존 re-export → mcp deps와 owner-deps의 advice → 최종 JSON. V-USAGE-POLICY/DB |
| request limiter | request-rate-limit의 consumeRequestBudget/consumeProjectRequestBudget, request-rate의 runtime binder | MCP deps/owner-deps와 REST production binder만 prisma로 조합. V-RATE-BOUNDARY/DB |
| 사용 기록 | token-usage-query의 factory/type/tryRecord, token-usage의 recordTokenUsage | 2 MCP wrapper binder + 4 REST binder, entity TokenUsage → index.ts → 두 page. V-TOKEN-AUTH/DB/UI |
| rename action/UI | manage-token/manage-user-token의 api와 ui, 각각 index.server.ts/index.ts | route에서 server export bind → page에서 client-safe UI export에 callback 전달. V-TOKEN-DB/UI와 binder 시험 |

### Final Artifact Resolution Map

| 최종 산출물 | winning source·본문 의존성 | 후속 검증 목적지 |
| --- | --- | --- |
| 두 MCP endpoint의 인증과 JSON text body | route withMcpAuth → auth/deps; 설치 mcp-handler stateless transport. 도구 실패 본문은 tools/owner-tools serializer, pipeline 성공값은 run-rules DTO | V-TOKEN-AUTH의 실제 메모리 transport, V-RATE-BOUNDARY 및 DB; status만 아닌 content/isError/code/resetAt/retryAfterSec 검사 |
| 네 REST의 429/정상/기존 거부 | 각 route serializer가 winning body/header, query/service가 정책. templates 성공 본문은 deliverable과 기존 Template rows | V-RATE-BOUNDARY/DB; full JSON key와 Retry-After, 정상 template stub/entitlement, 기존 reconnectPath 대조 |
| billing/tokens HTML 및 client form | src/app의 세 session route → 정확한 FSD page → feature public API/entity. DB snapshot과 product-copy가 데이터/문구 출처이며 cache/rewrite override 없음 | V-USAGE-UI/TOKEN-UI의 최종 markup·실제 화면·입력/오류/refresh, secret/횟수 미노출 |
| Prisma delegate/types/catalog | schema + additive SQL → db:generate → src/generated/prisma. SQL CHECK/FK와 과거 rows는 actual catalog/DB에서 판정 | V-USAGE-DB/TOKEN-DB/RATE-DB와 check/build; generated field/model만 확인하고 migration 통과로 대체하지 않음 |
| plugin 배포 모듈·init 출력/파일 | packages/core → sync:plugin-lib → plugin/lib, CLI/공개 SKILL과 plugin.json. 기존 runbook/agent stub의 본문은 deliverable/render/fixture로 유지 | V-RATE-CLIENT/CROSS-CHECK; plugin copy 바이트, 네 fetch 오류 본문/exit code, 생성 파일 보존과 manifest JSON의 version/source 대조 |

private Template 재게시, 기존 HTML 자산/전역 stylesheet, 새로운 HTTP route/권한/스토리지는 최종 artifact의 변경 대상이 아니다. templates의 성공 body와 init 생성 파일은 그 경계를 지킨 보존 검증 대상이다.

## Execution Plan / Phases and Tasks

아래 Phase/Task는 승인된 전체 구현의 추적 기록이다. USAGE → TOKEN → RATE 순서로 구현·검증했고, RATE 구현 전 baseline 수치를 확정했다. 초기 entry/stop 조건은 설계 근거로 보존한다.

### Phase USAGE: 계정 5시간 사용량과 표시

- status: Implemented
- entry criteria: 실행 지시, 기준 코드/문서/dirty tree 재확인, 현재 User 잠금과 모든 AgentRun 생성 writer 대조.
- satisfies: REQ-USAGE-001, REQ-USAGE-002, REQ-USAGE-003, REQ-USAGE-004, REQ-USAGE-005, REQ-USAGE-006, REQ-USAGE-007
- preserves: INV-ACCOUNT-001, INV-RUN-001, INV-AUTH-001
- governed-by: CON-ARCH-001, CON-DATA-001, CON-SCOPE-001, CON-VERIFY-001
- verifies: REQ-USAGE-001, REQ-USAGE-002, REQ-USAGE-003, REQ-USAGE-004, REQ-USAGE-005, REQ-USAGE-006, REQ-USAGE-007
- downstream blockers: none — BLK-RATE-01 resolved
- exit criteria: V-USAGE-POLICY, V-USAGE-DB, V-USAGE-UI, V-CROSS-CHECK의 관련 검증 통과. 30일 cap 소비자 없음, historyDays 보존.

### TASK-USAGE-01: 계정 구간 저장과 생성 원자성

- satisfies: REQ-USAGE-001, REQ-USAGE-002, REQ-USAGE-003, REQ-USAGE-004, REQ-USAGE-007
- preserves: INV-ACCOUNT-001, INV-RUN-001, INV-AUTH-001
- governed-by: CON-ARCH-001, CON-DATA-001, CON-SCOPE-001, CON-VERIFY-001
- implementation destination: Affected Files의 core entitlement/usage-window, USAGE migration, account-usage-query/account-usage binder, agents next/runs/run-query. User CHECK와 DB clock, commit된 failed-result 집계 및 기존 project-connection DB 시험의 recentRuns 의존성 대체도 포함한다.
- verification destination: V-USAGE-POLICY, V-USAGE-DB.
- depends on: none
- stop condition: 별도 AgentRun writer나 변경된 lock 계약을 발견하면 새 요구/목적지와 검증을 먼저 대조한다. 다른 실행에 중복 과금하는 임시 경로를 만들지 않는다.

### TASK-USAGE-02: 파이프라인 안내·계정 퍼센트 UI

- satisfies: REQ-USAGE-005, REQ-USAGE-006
- preserves: INV-ACCOUNT-001, INV-RUN-001
- governed-by: CON-ARCH-001, CON-SCOPE-001, CON-VERIFY-001
- implementation destination: pipeline run-query/run-rules의 cap DTO, result.ts와 tools serializer, billing route/page의 unavailable DTO, entitlement-copy, protocol/product-copy와 관련 회귀 검사. 정확한 경로는 Affected Files를 따른다.
- verification destination: V-USAGE-POLICY, V-USAGE-UI, V-CROSS-CHECK.
- depends on: TASK-USAGE-01
- stop condition: 숫자 usage DTO나 전역 polling이 필요해 보이면 범위를 넓히지 않고 현재 서버 조회 설계와 비교한다.

### Phase TOKEN: 세 토큰 관리와 만료 인증

- status: Implemented
- entry criteria: 실행 지시, 완료된 선행 토큰 UX 결과가 현재 checkout에 포함됐는지 확인. 조사된 stateless/request verifier 경계와 설치 버전의 유지 여부 재확인.
- satisfies: REQ-TOKEN-001, REQ-TOKEN-002, REQ-TOKEN-003, REQ-TOKEN-004, REQ-TOKEN-005, REQ-TOKEN-006
- preserves: INV-AUTH-001, INV-TOKEN-001, INV-RUN-001
- governed-by: CON-ARCH-001, CON-DATA-001, CON-SCOPE-001, CON-VERIFY-001
- verifies: REQ-TOKEN-001, REQ-TOKEN-002, REQ-TOKEN-003, REQ-TOKEN-004, REQ-TOKEN-005, REQ-TOKEN-006
- exit criteria: V-TOKEN-AUTH, V-TOKEN-DB, V-TOKEN-UI, V-CROSS-CHECK의 관련 검증 통과, 인증/발급 writer 누락 없음.

### TASK-TOKEN-01: 저장 열·발급·현재 자격 검사·사용 기록

- satisfies: REQ-TOKEN-001, REQ-TOKEN-002, REQ-TOKEN-005, REQ-TOKEN-006
- preserves: INV-AUTH-001, INV-TOKEN-001, INV-RUN-001
- governed-by: CON-ARCH-001, CON-DATA-001, CON-SCOPE-001, CON-VERIFY-001
- implementation destination: TOKEN migration과 token-validity, token services/writers, token-usage-query/token-usage binder, mcp auth/deps/owner-deps, rest-scope와 네 REST production adapters. 기존 harness-init/project-connection credential fixture 및 발급 adapter 인자 검사도 함께 갱신한다. 정확한 경로와 exports는 Affected Files/Symbol 표를 따른다.
- verification destination: V-TOKEN-AUTH, V-TOKEN-DB, V-TOKEN-UI.
- depends on: none — USAGE와 migration이 겹치므로 적용 순서와 중복 열을 확인한다.
- stop condition: 설치 SDK/route가 조사된 요청별 검증과 달라지면 재대조하고 연결 최초 검증만으로 완료 처리하지 않는다. 별도 auth cache·중복 lookup을 선제적으로 추가하지 않으며 과거 이력 복원이나 secret 로그로 진단하지 않는다.

### TASK-TOKEN-02: 소유권을 지키는 rename과 목록

- satisfies: REQ-TOKEN-003, REQ-TOKEN-004
- preserves: INV-AUTH-001, INV-TOKEN-001
- governed-by: CON-ARCH-001, CON-DATA-001, CON-SCOPE-001, CON-VERIFY-001
- implementation destination: token-management-query, 두 feature의 server adapter/rename form/public API, 두 token route/page, TokenUsage entity, product-copy/reveal 수명 문구. 정확한 목적지는 Affected Files 표를 따른다.
- verification destination: V-TOKEN-DB, V-TOKEN-UI, V-CROSS-CHECK.
- depends on: TASK-TOKEN-01
- stop condition: 종료 토큰의 재활성화·만료 연장·다른 user/project 변경, selected-out/disconnected rename을 허용하는 query로 우회하지 않는다.

### Phase RATE: 실제 계정·프로젝트 요청 제한

- status: Implemented
- entry criteria: 별도 실행 지시, limiter 구현 전 baseline 요청 시퀀스 측정과 BLK-RATE-01 수치 확정. 이후 모든 보호 요청 경계 및 실제 클라이언트 시퀀스 재확인.
- satisfies: REQ-RATE-001, REQ-RATE-002, REQ-RATE-003
- preserves: INV-ACCOUNT-001, INV-RUN-001, INV-AUTH-001, INV-TOKEN-001
- governed-by: CON-ARCH-001, CON-DATA-001, CON-SCOPE-001, CON-VERIFY-001
- verifies: REQ-RATE-001, REQ-RATE-002, REQ-RATE-003
- current blockers: none — BLK-RATE-01 resolved
- exit criteria: V-RATE-BOUNDARY, V-RATE-DB, V-RATE-CLIENT, V-CROSS-CHECK 통과. outcome 기반 old limiter 제거 및 정상 부하 관측 완료.

### TASK-RATE-01: 수치 확정 후 단기 limiter 대체

- satisfies: REQ-RATE-001, REQ-RATE-002, REQ-RATE-003
- preserves: INV-ACCOUNT-001, INV-RUN-001, INV-AUTH-001, INV-TOKEN-001
- governed-by: CON-ARCH-001, CON-DATA-001, CON-SCOPE-001, CON-VERIFY-001
- implementation destination: RATE migration, request-rate-limit service, result.ts/15 MCP callback serializer, 네 REST result/query/service/route, agents old limiter plumbing, plugin init/공개 안내/patch manifest, protocol/product-copy. 정확한 경로는 Affected Files 표를 따른다.
- verification destination: V-RATE-BOUNDARY, V-RATE-DB, V-RATE-CLIENT, V-CROSS-CHECK.
- depends on: BLK-RATE-01, TASK-USAGE-01, TASK-TOKEN-01
- stop condition: 수치 미확정·실제 callback 누락·중복 집계·원자적 경합 검증 실패이면 활성화하지 않는다.

## Verification Plan / Traceability

아래 요구별 검증을 구현·실행했다. 최종 명령 결과와 브라우저 인수는 Verification Results에 연결한다. 신규 token-management-bindings/request-rate-limit 단위 파일을 별도로 늘리는 대신 기존 issuance/usage/connection binder 시험, 실제 DB 시험 및 Next HTTP 리허설에 경계 검증을 합쳤다. 외부 관찰과 실제 잠금·rollback·권한을 검사하며 운영 DB·트래픽 검증은 포함하지 않는다.

### V-USAGE-POLICY

- category: unit / contract
- destination: `packages/core/entitlement.test.mjs`, `packages/core/usage-window.test.mjs`(신규 제안), `src/server/agents/next.test.ts`, `src/server/agents/run-query.test.ts`, `src/server/pipeline/run-rules.test.mjs`, `src/server/pipeline/run-query.test.ts`, `src/fsd/shared/lib/entitlement-copy.test.ts`, `src/server/mcp/tools.test.mjs`.
- verifies: REQ-USAGE-001, REQ-USAGE-002, REQ-USAGE-004, REQ-USAGE-005, REQ-USAGE-006, REQ-USAGE-007
- expected observation: 종료 직전/정각, idle 조회, Free/Pro 마지막 자리·Max, 기존 run 재개·다음 run 대기, 플랜 변경을 고정 시각으로 검증한다. 실제 MCP text JSON에서 product 실패의 code/resetAt·숫자 미노출을 검사한다. pipeline head/items/owner 승인 후 next에 metadata가 보존되고 일반 none 사유에는 없음을 검증한다. 30일 dispatch 함수·소비자 제거와 historyDays 보존은 양방향으로 확인한다.
- state: Passed

### V-USAGE-DB

- category: integration / migration / recovery
- destination: 기존 `tests/server/integration/agent-runs.test.ts`, `migration.test.ts`, `head.test.ts`, `tests/server/integration/project-connection.test.ts`; `account-usage.test.ts`(신규 제안).
- verifies: REQ-USAGE-001, REQ-USAGE-002, REQ-USAGE-003, REQ-USAGE-004, REQ-USAGE-005, REQ-USAGE-007
- setup/fixture: 별도 `stagekeeper_test_*` PostgreSQL, 동일 user의 두 프로젝트·서로 다른 토큰, 실제 row-lock barrier.
- expected observation: Free 같은 프로젝트 19→20, Pro 두 available 프로젝트 99→100 경쟁에서 하나만 신규 생성, 첫 저장 rollback 시 다른 요청 성공, 첫 실행 rollback 시 anchor 없음, DB clock 경계 대기 후 새 구간, 응답 유실 재조회 미과금, 커밋된 run의 instruction 실패 시 1회 유지, 플랜/availability 경합, Max 내부 count·다운그레이드, 재진입 보존을 확인한다. 채운 이전 데이터에서 신규 열/CHECK와 기존 행/FK/이력을 actual catalog와 full rows로 대조하고 고의 count 손상 거부·읽기 무쓰기를 검증한다.
- preserved regression: project-connection 시험의 `createNextDeps(...).recentRuns(...)` 호출은 제거하고 실제 신규 실행으로 채운 계정 구간을 검사한다. 프로젝트 해제·다른 프로젝트 등록·재연결·플랜 변경으로 anchor/count가 초기화되지 않으며 기존 실행 원장도 보존된다.
- state: Passed

### V-USAGE-UI

- category: UI / accessibility / authorization
- destination: 신규 `src/fsd/pages/billing/ui/billing-page.test.ts`, 기존 `src/fsd/shared/lib/entitlement-copy.test.ts`, 신규 `tests/server/account-usage-bindings.test.ts`, 실제 `/billing` 수동 프로토콜.
- verifies: REQ-USAGE-006
- expected observation: 0%·중간·100%의 native progress 의미, reset 시각, Max Unlimited, 원시 횟수 미노출, unavailable 표시를 최종 HTML로 검사한다. fixture의 두 사용자 세션으로 별도 percent를 조회하고 route에 client userId 입력이 없음을 확인한다. 추가 snapshot 실패 주입에서는 로그인 redirect와 이미 읽은 plan을 유지하고 사용량 영역만 unavailable가 된다. 기존 header 로딩 자체의 실패는 삼키지 않는다. full reload와 서버 재조회, 뒤로 가기/다른 탭, 좁은 화면을 확인하며 장기 cache/timer 부재를 검증한다. 성공 시 헤더/플랜 표와 percent는 같은 snapshot의 plan이다.
- state: Passed

### V-TOKEN-AUTH

- category: unit / contract / security
- destination: 신규 `packages/core/token-validity.test.mjs`, 기존 `src/server/token-usage-query.test.ts`, `src/server/mcp/auth.test.mjs`, `src/server/mcp/tools.test.mjs`, `src/server/mcp/owner-tools.test.mjs`, `src/server/rest-scope.test.ts`, `src/server/project-identity-query.test.ts`, `src/server/templates-query.test.ts`, `src/server/runbook-query.test.ts`, `src/server/project-token-service.test.ts`, `src/server/project-registration-query.test.ts`, `src/server/harness-init.test.ts`, `tests/server/project-connection-bindings.test.ts`, `tests/server/project-registration.test.ts`, `tests/server/token-issuance-bindings.test.ts`.
- verifies: REQ-TOKEN-001, REQ-TOKEN-002, REQ-TOKEN-005, REQ-TOKEN-006
- expected observation: 세 접두 × 허용/거부 endpoint, 미등록/폐기/만료 1ms 전/정각/이후/null expiry, REST user 등록을 검증한다. 실제 설치 withMcpAuth/createMcpHandler의 메모리 Request에서 만료 전 첫 인증을 recorder로 지연해도 기존 처리를 유지하고, 다음 요청은 401·callback 미호출·record 미기록임을 확인한다. auth/recorder가 같은 `at`을 쓰고 AuthInfo 초 단위 필드로 조기 거부하지 않음을 검사한다. recorder 지연·rejection·logger 실패는 원 credential 조회 실패와 분리하고 출력에 header/hash/원시 예외가 없는지 검사한다.
- preserved regression: 실제 REST factory를 사용하는 harness-init mock HTTP 시험의 null-expiry hs_/hu_ 인증·slug/plan/접근 거부·파일 보존을 유지하고 만료 credential의 후속 거부를 확인한다. 기존 project-connection binding 시험은 expiry가 발급 service에 전달됨과 현재 세션 userId 사용·직접 create 금지를 함께 검사한다.
- state: Passed

### V-TOKEN-DB

- category: integration / migration / security
- destination: `tests/server/integration/token-management.test.ts`(신규 제안), 기존 `tests/server/integration/token-usage.test.ts`, `tests/server/integration/token-usage-migration.test.ts`, `tests/server/integration/project-connection.test.ts`와 migration/registration 시험.
- verifies: REQ-TOKEN-001, REQ-TOKEN-002, REQ-TOKEN-003, REQ-TOKEN-005, REQ-TOKEN-006
- expected observation: tracking 적용 전 rows의 nullable 초기값, 적용 후 기존 사용 시각/표식 보존과 expiry null, 신규 발급의 lastUsedAt null·tracking/선택 expiry 설정, initial writer와 기존 repo/재연결/hu 등록의 무발급, 동일 token 사용 시각 단조성·60초 경계를 확인한다. 만료 전 `at`의 지연 저장은 허용되지만 만료 정각/이후 `at`은 zero-write이고 폐기가 먼저 커밋되면 지연 저장도 zero-write다. recorder 오류·지연, label trim/빈 값·타인 거부·종료 token rename 미재활성화, selected-out/disconnected 거부와 기존 revoke 허용, 해제/플랜 변경과의 User 잠금 경합을 검증한다. rename으로 hash/expiry/count/availability version/event/lastSyncedAt이 바뀌지 않는다.
- preserved regression: project-connection의 유효 credential fixture와 이미 접근 검사를 통과한 runbook 요청의 완료·후속 disconnected 거부, 두 token issuer와 해제의 잠금 순서별 폐기/무발급 검사를 유지한다.
- state: Passed

### V-TOKEN-UI

- category: UI / accessibility / contract
- destination: 기존 `src/fsd/entities/project-token/ui/token-reveal.test.ts`, `src/fsd/entities/project-token/ui/token-usage.test.ts`, `src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts`, `src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts`, `src/fsd/features/manage-token/ui/token-names.test.ts`, `src/fsd/features/manage-user-token/ui/token-name.test.ts`, `tests/server/token-usage-bindings.test.ts`, `tests/server/token-issuance-bindings.test.ts`; `scripts/rehearse-account-usage-and-tokens.ts`; 실제 세 종류 토큰 화면/프로젝트 생성 reveal 수동 프로토콜.
- verifies: REQ-TOKEN-001, REQ-TOKEN-003, REQ-TOKEN-004, REQ-TOKEN-005, REQ-TOKEN-006
- expected observation: UTC 입력→ISO 전달·null 기본·invalid/현재 시각 거부, Unknown/Never used/UTC 시각, Active와 Revoked/Expired의 경계를 full markup으로 검사한다. 실제 브라우저에서 세 종류 각각 발급→rename→실패→재조회→개별 revoke 순서, 종료 token rename, 사용 불가 프로젝트의 rename 부재와 revoke 유지, 좁은 화면/스크린리더 label을 확인한다. 응답 유실은 목록에 생성 token이 있지만 비밀 복원이 없는 상태를 확인하며 재발급은 다른 토큰을 폐기하지 않는다. server action binder는 current session ID 사용·타인/무세션 거부와 public API를 대조한다.
- state: Passed

### V-RATE-BOUNDARY

- category: unit / contract / security
- destination: `tests/server/integration/request-rate-limit.test.ts`, `scripts/rehearse-account-usage-and-tokens.ts`, 기존 `src/server/mcp/tools.test.mjs`, `src/server/mcp/owner-tools.test.mjs`, `src/server/rest-scope.test.ts`, 세 REST `project-identity-query.test.ts`/`templates-query.test.ts`/`runbook-query.test.ts`, `tests/server/project-connection-bindings.test.ts`, `tests/server/project-registration.test.ts`; 최종 HTTP route도 함께 검사한다.
- verifies: REQ-RATE-001, REQ-RATE-002, REQ-RATE-003
- expected observation: 명시된 15개 callback 전체를 호출하여 scope/access 뒤 limiter 한 번, agent/개별 cap/도메인 검증 실패도 한 번, 내부 advice/transaction retry에 추가 집계 없음, 공통 접근/owner plan 거부와 SDK schema/초기화 제외를 확인한다. hu 계정 전체·hs/ho 같은 owner 집계, selected-out get, 기존 401/403 reason/성공 body를 보존한다. MCP text JSON의 RATE_LIMITED와 product code를 구분하고 raw 사용량/ownerUserId 누출이 없다. old RATE_LIMIT/recentSteps 제거, callerTokenId/receipt ledger 보존을 확인한다.
- state: Passed

### V-RATE-DB

- category: integration / load / fault
- destination: `tests/server/integration/request-rate-limit.test.ts`(신규 제안), 확정 수치를 적용한 실제 클라이언트 요청 시퀀스 리허설.
- verifies: REQ-RATE-001, REQ-RATE-002
- expected observation: 최초 빈 budget 행 및 마지막 자리에서 복수 client/token 경쟁, 계정/project 한쪽 소진 시 다른 쪽 insert/reset/count rollback, 서로 다른 종료 시각의 최댓값 Retry-After, 경계·재시작·FK cascade·DB 실패를 증명한다. projectId=null인 project scope, subjectId 불일치, 음수 count를 actual CHECK가 거부함을 확인한다. 실제 네 REST route의 429 body/header와 기존 성공/거부/reconnect body, MCP 최종 content를 검사하고 거부가 도메인/AgentRun/제품 구간을 만들지 않는다. BLK-RATE-01의 구현 전 측정/확정 근거를 입력으로 삼아 정상 10분 peak·동시 세션에서 잘못 차단하지 않는지와 DB 왕복 지연을 재검증한다.
- state: Passed

### V-RATE-CLIENT

- category: client / contract
- destination: `plugin/bin/harness-init.test.mjs`, `src/server/harness-init.test.ts`, MCP 반환 fixture 및 공개 init 안내 대조.
- verifies: REQ-RATE-003
- expected observation: print-project/register/templates/runbook 네 fetch 각각의 429에서 retry 정보를 본문까지 검사하고 즉시 재요청이 없음을 확인한다. runbook 429는 생성된 파일 전체 바이트를 보존하고 버전 미기록+대기+비정상 exit code로 표시한다. 기존 401/403/409, local templates와 dry-run의 무네트워크, 정상 runbook/stub/manifest 생성은 유지한다. public SKILL/CLI 안내와 plugin.json의 patch version, marketplace의 source를 parser로 대조한다. 플러그인 배포 version과 생성 runbook의 본문 hash/lock format version은 별개이며 동시에 바꾸지 않는다. 게시 여부를 통과 근거로 쓰지 않는다. 평문/header 출력 없음도 확인한다.
- preserved regression: harness-init의 기존 runbook 401/403은 파일을 유지하고 후속 작업 중단을 안내하는 best-effort exit 0 계약을 유지한다. 새 429의 비정상 exit와 구분하며 mock HTTP serializer도 429 metadata를 누락하지 않게 갱신한다.
- state: Passed

### V-CROSS-CHECK

- category: architecture / lint / type / build / contract
- destination: 아래 기존 npm 명령, protocol/product-copy 및 retired-copy 검토.
- verifies: REQ-USAGE-005, REQ-USAGE-006, REQ-TOKEN-002, REQ-TOKEN-004, REQ-RATE-003
- expected observation: FSD/public API와 server/client 경계, 생성 Prisma 타입, core/plugin 바이트 동기화, Next route 수집, copy locks·관련 회귀 검증이 모두 통과한다. 이 검증은 DB 동시성·실제 브라우저·부하 검증을 대체하지 않는다.
- state: Passed

후속 구현에서 실행할 기존 명령:

```powershell
npm run db:validate
npm run db:generate
npm run sync:plugin-lib
npm run verify:fsd
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:server
npm run test:server:integration
npm run build
```

`check`에 lint·typegen·tsc·architecture·project-availability 검사가 포함된다. `prisma.config.ts`가 DATABASE_URL을 요구하므로 validate/generate/build에도 환경값이 필요하다. 비연결 검사에는 CI의 비밀 없는 dummy URL을 사용할 수 있고 공식 환경 로딩을 유지한다. 값이나 원시 실패 출력을 보고서에 붙이지 않는다. `test:server:integration`은 URL 분리 검사 후 전용 DB에 migrate deploy와 직렬 시험을 수행한다. TEST_DATABASE_URL은 stagekeeper_test_*이며 기존 DATABASE_URL과 host/port/database가 달라야 한다. 실제 test runner가 fixture를 정리하는지 확인하고 새 mock 서버는 close/finally, env·Date stub은 원복, DB fixture는 테스트 소유 rows/schema만 정리한다.

기존 CI는 일반 check/core/web/build를 실행하지만 DB integration은 실행하지 않으므로 격리 DB 증거를 별도로 남긴다. `test:web` glob은 `.test.ts`/`.test.mjs`이며 `.test.tsx`를 새로 만들어 자동 실행된다고 가정하지 않는다. 명령 정의와 목적지 존재 검사를 통과해도 실행하지 않은 product test/build는 통과로 보고하지 않는다.

후속 old-absence/보존 대조는 `src/server/agents/next.ts`, `src/server/agents/runs.ts`, `src/server/agents/run-query.ts`, `src/server/pipeline/run-query.ts`, `src/fsd/shared/lib/entitlement-copy.ts`, `packages/core/entitlement.mjs`, 동기화된 plugin/lib에서 수행한다. DISPATCH_WINDOW_DAYS/dispatchCutoff/recentRuns의 30일 product 경로와 RATE_LIMIT/recentSteps는 제거 대상으로, historyDays/historyCutoff 및 callerTokenId/receipt/accepted 원장은 보존 대상으로 분류한다. 옛 문장을 인용하는 역사 문서나 이 proposal 자체를 전역 검색 결과만으로 삭제하지 않는다. userScoped가 old limiter의 분모에만 남으면 RATE에서 관련 Scope/ToolDeps/deps 인자와 fixture도 제거하되 hu_의 owner scope 판정은 유지한다.

## Risks and Rollback / 배포 준비

1. 추가 migration은 기존 User count를 0, anchor를 null로 둔다. 과거 30일 실행을 새 구간에 소급 과금하지 않는다. token expiry는 null로 두고 선행 tracking에 이미 저장된 사용 시각/표식과 기존 rows·평문 hash·폐기·run 원장을 보존한다. 아직 tracking이 없는 이전 스키마에는 nullable 열을 추가하고 backfill하지 않는다. 이 전환에서 첫 새 실행부터 사용량을 시작하는 것은 의도한 정책 변경이다.
2. DB 확장 → client 생성/호환 코드 검증 → 새 정책 writer/verifier 배포 순서를 따른다. 구버전 writer의 30일 집계와 신규 counter 집계가 섞이지 않게 모든 인스턴스를 전환하거나 전환 중 신규 실행을 차단한다. 선택 만료 토큰의 발급을 시작하기 전에 여섯 production 인증 연결 전체에 만료 검사 코드를 배포한다. 이미 만료 토큰을 발급했다면 구버전 verifier로 인증 요청이 들어가지 않게 트래픽 전환/drain 절차를 갖춰야 하며 신규 실행 차단만으로 이를 대신하지 않는다. 실제 topology에 맞는 전환 절차를 리허설하고 만료 토큰의 후속 MCP/REST 요청이 모두 거부되는지 확인한다. 이 문서는 운영 배포를 승인하지 않는다.
3. 격리 DB에서 기존 데이터가 채워진 migration 전/후 보존, 최신/이전 bundle의 열 호환, transaction rollback과 응답 유실을 검증한다. expiry를 이용하기 시작한 이후에는 만료 검사가 없는 과거 코드로 단순 revert하지 않는다. 구버전 스키마 호환과 보안 정책 호환은 다르다.
4. 관측은 기존 서버 진단에 제품 cap 거부, request cap 거부, 부가 lastUsed 기록 실패를 구분하여 남긴다. 운영에서 정상 요청이 단기 제한으로 막히거나 product snapshot/writer가 어긋나면 activation을 중단하고 호환된 수정본으로 복구한다. 새로운 metrics 플랫폼이나 요청별 비밀 감사 원장은 추가하지 않는다.
5. 복구는 현재 유효 구간·counter·token expiry와 폐기를 유지하는 수정본으로 진행한다. 만료 검사를 우회하거나 counter를 수동으로 지워 해결하지 않는다. 확장 열은 즉시 삭제하지 않고 미사용 열로 남길 수 있다. 소스 되돌리기만으로 DB를 원상복구했다고 보고하지 않는다. 운영 data 복원은 별도 승인·백업 근거가 필요한 후속 행위다.

잔여 운영 리스크는 실제 배포의 혼합 writer 및 expiry verifier 전환과 운영 요청량·지연이 로컬 fixture 가정과 다를 수 있다는 점이다. BLK-RATE-01, 격리 DB 경쟁/부하 시험은 해소했다. MCP 요청별 인증은 설치 소스·메모리 transport·실제 Next HTTP로 검증했으며 이중 인증 구조는 추가하지 않는다. 운영 activation은 이번 코드·PR 승인에 포함하지 않는다.

## Approval / 완료 기준

실행 승인과 범위의 단일 출처는 front matter다. 전체 USAGE·TOKEN·RATE 코드, 검증, commit, dev 대상 PR을 수행한다. 별도 private 테스트 fixture 변경은 사용자가 main 대상 PR을 승인했다. 운영 migration·배포·PR 병합은 이번 범위가 아니다.

구현 이전 문서 개선 완료 기준: 합의 정책과 현재 코드 차이, 정확한 inventory/public API/final artifact 목적지, failed-result와 rollback의 차이, 경합/실패/만료 lifecycle, Phase–Task–검증 연결, downstream blocker, rollout/복구 조건을 기록한다. strict 구조 검증과 목적지/링크/working tree 확인 후 최신 저장본을 편집 없이 INV-1~6 재대조한다. 당시 BLK-RATE-01을 숨기지 않으며 수치 미정 상태에서 전체 implementation clean pass나 INV-7 통과를 주장하지 않는다. 후속 수치 확정과 구현 결과는 아래 완료 기록에 연결한다.

후속 구현 완료 기준: 각 요구의 계획 verifier에 실제 실행 증거를 붙이고 BLK-RATE-01을 해소한다. raw 사용 횟수 미노출, 단일 계정 quota, 모든 expiry 경로, old limiter/30일 cap 제거를 확인하며 관련 계약을 함께 갱신한다. 당시 승인 범위 밖의 Phase로 자동 확대하지 않는다.

## Verification Results / Execution Evidence

| Evidence | 상태 | 명령/확인 | 결과와 한계 |
| --- | --- | --- | --- |
| EV-DOC-BASE | Historical, Executed | remote heads 확인, `git fetch origin dev`, branch 생성, HEAD/dirty tree 조사 | 앞선 문서 작성에서 기준 커밋의 새 harness 브랜치 생성. 기존 미추적 제안서 세 개 보존 대상 확인 |
| EV-CODE-BASE | Historical, 기존 코드만 | `node --import tsx --test packages/core/token.test.mjs src/server/mcp/auth.test.mjs src/server/project-token-service.test.ts src/server/agents/next.test.ts` | 앞선 코드 조사에서 64 tests / 13 suites 통과. 이번 미커밋 tracking 코드나 제안한 새 기능의 증거가 아니며 이후 구현은 별도 검증 필요 |
| EV-DOC-STRICT | Historical, 편집 pass | `python C:/Users/hamso/.codex/skills/write-sdd-spec/scripts/validate_sdd_traceability.py --strict docs/proposals/active/account-usage-and-token-management.md` | 당시 PASS. REQ 16/16이 Phase/Task와 verifier에 연결됨. 구조 검증은 의미·코드·보안 검증을 대신하지 않는다. 완료 경로의 최종 검증은 아래 EV-DOC-FINAL에 기록 |
| EV-DOC-HYGIENE | Historical, Executed | 최초 문서의 상대 링크·공백·미완성 표기·사용자 파일 해시·git 상태 검사 | 최초 링크 6개 정상, tracked source diff 없음. 검토 후반에는 다른 작업의 tracking source/migration 변경이 생겼으므로 현재 workspace 전체 불변을 주장하지 않는다. 이 검토의 쓰기는 이 문서에만 수행했다 |
| EV-MCP-RUNTIME | Historical, 당시 설치 버전 | 설치 dist/index.mjs 대조 및 DB 없는 메모리 Request 2개 | 첫 요청 200·도구 호출, verifier 거부로 바뀐 둘째 요청 401·도구 미호출, verifier 총 2회. live server·DB·실제 token 없이 요청별 검증을 확인했으며 새 expiry 구현 시험은 아님 |
| EV-REPEAT-TOKEN | Historical, 앞선 반복 검토 | Node/tsx로 recorder·MCP auth·REST scope·entity/two-page 시험, server-only bootstrap으로 token-issuance/token-usage binder 시험 | 22 + 5 = 27 tests 통과. 당시 tracking/목록/발급·여섯 인증 연결의 재사용 근거이며 새 expiry/rename/quota 및 실제 DB 검증은 아님 |
| EV-REPEAT-MCP | Historical, 앞선 반복 검토의 설치 버전 | DB/네트워크 없는 withMcpAuth Request probe, Date.now는 finally에서 원복 | 만료 전 verifier를 수락하고 recorder 대기 중 시각을 넘기면 AuthInfo.expiresAt 없이 첫 요청 200, 다음 요청 401, verifier 2회/handler 1회. expiry 초 내림 필드를 넣으면 만료 전에도 401. 설치 wrapper 의미의 증거이며 제품 만료 구현 통과는 아님 |
| EV-CLOSURE-REGRESSION | Historical, 앞선 반복 검토 | `node --import tsx --test src/server/harness-init.test.ts`; `node --import ./tests/server/register-server-only.mjs --import tsx --test tests/server/project-connection-bindings.test.ts` | 13 + 4 = 17 tests 통과. 당시 기존 REST→CLI 동작·발급/session binding·전체 disconnected callback 계약의 기준선이며 이번 문서 검사에서 재실행하지 않음. 새 expiry/5시간 quota/429 구현이나 DB 시험 통과는 아님 |
| EV-RECON-INVENTORY | Executed, 편집 pass | literal 목적지/parent/collision, relative link, package script, tsconfig path, manifest/marketplace JSON, generated 파일 목록, `node scripts/plugin-lib.mjs --check` | 명령 정의·경로·생성 책임을 대조하고 현재 plugin/lib in sync 확인. 선행 tracking 목적지 생성은 재사용 대상으로 반영. product build/generation/integration의 실행 결과는 아님 |
| EV-RATE-DECISION | Historical, 당시 Accepted | 사용자 답변: 측정 후 확정하도록 유지 | 당시 수치를 임의 확정하지 않고 BLK-RATE-01 및 RATE 구현 차단을 유지. 이후 EV-RATE-BASELINE으로 측정·사용자 확정 완료 |
| EV-SOURCE-RELOCATION | Observed, 이번 반복 검토 | 선행 제안의 완료 metadata·이동 경로·공유 계약 및 현재 코드 대조 | 검토 중 선행 문서가 completed로 이동하여 끊어진 front matter/본문 참조를 갱신하고 완료된 tracking 재사용 조건을 반영. 그 문서의 구현 인수 결과를 이번 실행 결과로 전용하지 않음 |
| EV-IMPLEMENTATION | Historical, 당시 Not executed | 문서 전용 요청 당시 V-USAGE-POLICY부터 V-CROSS-CHECK까지 | 당시 신규 테스트·migration·브라우저·부하·build는 미실행. 아래 후속 구현 결과로 대체 |

Reconciliation Pass State (구현 이전 반복 검토의 편집 pass 이력):

- Pass type: editing pass
- Source bundle reviewed: 최신 이 문서, 직접 연결된 architecture/product-copy, completed로 이동한 선행 토큰 UX의 공유 계약·완료 기록, 같은 HEAD 및 현재 미커밋 recorder/issuer/auth/목록/시험.
- Source changed in this pass: yes
- New blockers found: yes — 검토 시작 시 추가 문서 결함은 없었으나 검토 중 선행 토큰 UX 문서가 active에서 completed로 이동하여 직접 참조가 끊어짐.
- Blockers resolved into source: front matter·본문을 실제 완료 경로로 연결하고 완료된 tracking 구현의 재사용과 checkout 포함 여부 확인을 관계·Phase에 반영했다. 선행 인수 증거·앞선 회귀 시험과 이번 문서 검사·운영 배포 증거를 구분했다. 기존 정책·구현 목적지·verifier는 유지한다.
- Remaining blockers: BLK-RATE-01; 요청 수치의 의도적인 측정 후 결정.
- User decision required: no — 보류 방식에 사용자 답변을 받았으며 이 문서 작업에서 추가 결정은 요청하지 않는다.
- Next required action: 최신 저장본 무편집 INV-1~6 재대조. 전체 INV-7/clean readiness는 후속 수치 결정·코드 최신성 대조 후에만 진행한다.
- Status: clean pass not completed

후속 결과에는 변경 파일/커밋, 요구별 verifier·명령·결과, 미실행과 편차, blocker 상태, 사용자 변경 보존, 운영 검증의 한계를 보고한다. 실행 승인과 증거가 생기기 전에는 이 문서를 completed로 이동하거나 제품 구현 완료로 기록하지 않는다.

## Completion or Closure Notes / 구현 완료 기록

초기 구현은 `d29d722`이고 최신 원격 dev `0aec9ab`를 `b01a200`으로 반영했다. dev에 먼저 병합된 선행 token UX·주석 정리·watch 기능을 보존했으며 최종 plugin patch는 0.4.1이다. User의 5시간 counter, 세 종류 토큰의 nullable expiry, RequestRateWindow migration을 추가했고 기존 tracking migration은 재사용했다. 이름 변경 실패 시 실제 저장된 이름으로 입력을 복원한다. 기본 날짜 입력기의 한국어 표시 문제는 사용자가 선택한 고정 UTC 텍스트 형식으로 해결했다.

| 실행 근거 | 명령·목적지 | 실제 결과와 범위 |
| --- | --- | --- |
| EV-USAGE | V-USAGE-POLICY/DB/UI; account-usage 및 billing 시험 | Free 19→20와 Pro 99→100을 두 실제 DB 연결·User 잠금 barrier로 검증. 잠금 대기 중 5시간 경계를 넘긴 뒤 회복, run 저장 rollback, 저장 후 instruction 실패의 과금 유지, 삭제 후 미환급, 재개 무과금, Max 다운그레이드·readonly 조회 통과. billing의 세션별 snapshot·헤더/표 플랜 일치·부가 조회 실패 fallback·auth/header 예외 보존 통과 |
| EV-TOKEN | V-TOKEN-AUTH/DB/UI; token-management·tracking migration·production binder·Next HTTP | 세 종류 발급/rename/revoke, label만 변경, 타인·빈 이름·사용 불가 프로젝트 거부, 종료 credential 미재활성화, 해제 경합 양순서 통과. 만료 1ms 전/정각/이후 및 캡처 시각 recorder 지연을 검사. 기존 전체 row/FK/index/이력과 nullable 초기값 보존. 실제 여섯 인증 경로에서 만료 401·미기록 확인 |
| EV-RATE-BASELINE | `node --import tsx scripts/rehearse-request-rate-baseline.ts` | fixture callback burst 59회 + 별도 CLI 3회 = 세션 62, 프로젝트 248, 계정 992 가정. 사용자 300/1,200 확정. 운영 peak 측정은 아님 |
| EV-RATE | V-RATE-BOUNDARY/DB/CLIENT; request-rate-limit 통합 시험 | 최초 없는 budget 경쟁·마지막 자리·다른 budget insert/reset/increment rollback·긴 Retry-After·DB 실패·CHECK/FK 통과. 확정 부하 992회와 최신 dev의 네 watch 세션/프로젝트(각 시작 1 + 기본 60초 poll 10) 추가 176회를 모두 허용. 프로젝트 292/계정 1,168. 992회 본 부하의 로컬 DB 평균 약 4.8ms/요청이며 운영 지연을 의미하지 않음 |
| EV-HTTP | `scripts/rehearse-account-usage-and-tokens.ts` | 최신 production build의 실제 Server Action에서 세 종류 발급·rename·타인/무세션·빈 이름·폐기/종료 rename 검증. 실제 네 REST와 두 MCP endpoint의 RATE JSON·Retry-After, 15개 callback 각 1회 집계와 도메인 실패 집계, SDK 초기화/list/schema·타인 scope 제외 검증. Free/Pro/Max/만료된 사용량 HTML snapshot 확인 |
| EV-BROWSER | 격리 loopback Next·Playwright; interactive fixture | 세 종류 발급→rename→실패 시 이름 복원→응답 유실 후 실제 이름 재조회→개별 revoke 통과. UTC 형식과 날짜 rollover 거부. 발급 커밋 뒤 잘린 RSC 응답에서도 목록을 다시 읽고 새로고침으로 비밀을 복원하지 않음. 390px 화면과 progress 접근성 label 확인. 마지막 병합 build에서 발급 응답 유실 및 agent/owner 흐름 재확인 |
| EV-CROSS | `npm run check`, `npm test`, `npm run test:web`, `npm run build` | FSD·lint·typegen·tsc·architecture·project availability·core/plugin 동기화 통과. core/CLI 264, web 529 통과. 기존 clean-code browser fixture의 unused 변수 경고 1개는 유지하며 신규 lint 오류/경고 없음 |
| EV-SERVER | fresh build 후 SRC_CHECK_INBOX_MANIFEST/RDC_CHECK_ACTION_MANIFEST=true, `npm run test:server` | 35/35 통과, skip 없음. 일반 실행에서 제외되는 fresh manifest 검사를 명시적으로 활성화 |
| EV-INTEGRATION | 격리 TEST_DATABASE_URL, `npm run test:server:integration` | 전체 migration deploy와 직렬 integration 통과. watch 부하 추가 후 request-rate-limit 5개도 별도 통과. 운영 DATABASE_URL과 분리된 stagekeeper_test_*만 사용 |
| EV-PRIVATE | `npm run test:templates`; private commit `95ace9d`, [PR #6](https://github.com/Sangeok/harness-templates/pull/6) | 30/30 통과. NextDeps fixture의 recentSteps/recentRuns를 usageCap으로 바꾼 3줄만 수정. 사용자 승인으로 별도 main 대상 PR 생성. template 본문·seed·재게시 변경 없음 |
| EV-DOC-FINAL | strict validator; `docs/proposals/completed/2026-10-02-account-usage-and-token-management.md` | 완료 경로에서 REQ 16/16 Phase–Task–verifier 연결 PASS. 상대 링크·공백 확인. 다른 두 active proposal의 원본 해시 일치 확인 |

최종 편차: 구체 factory 이름 대신 작은 DB 주입 함수와 binder를 사용했다. rename 별도 binder 테스트 파일을 늘리는 대신 기존 issuance/usage binder와 실제 Next Server Action 리허설에서 검증했다. DB clock은 PostgreSQL 세션 시간대와 Prisma 변환의 차이를 피하도록 UTC timestamp를 반환한다. 제품 퍼센트는 정수 한도에서 부동소수점 내림 오류가 나지 않게 `used * 100 / limit` 순서로 계산한다. 새 라이브러리·cron·Redis·전역 store·polling은 추가하지 않았다.

BLK-RATE-01 및 구현 차단 사항은 해소했다. 코드와 검증 완료 범위에서 문서를 completed로 이동한다. 운영 배포·혼합 writer/drain·과거 expiry 미검증 bundle로의 rollback·운영 트래픽 측정은 이 완료 기록이 승인하거나 검증하지 않는다. 별도 배포 담당자는 위 Risks and Rollback 조건을 적용해야 한다.

사용자 소유의 다른 active proposal 원본은 별도로 보관하고 byte 단위로 복원했다. 최신 dev에서 local-watch-executor.md가 새로 tracked가 되어 로컬 원본과 차이가 생겼지만 그 로컬 차이는 이번 commit/PR에 포함하지 않는다. non-behavioral-comment-cleanup.md 원본도 보존한다. 다른 proposal의 승인·상태를 이번 기능의 근거로 변경하지 않는다.
