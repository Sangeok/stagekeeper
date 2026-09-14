---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-09-12"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-09-04-harness-platform-phase-4-entitlement.md"
---

# 개인 프로젝트 사용 목록과 소유권 단순화 SDD

- Risk: HIGH-RISK
- Drafting mode: WHOLE_SDD
- Design status: Complete
- Implementation readiness: Phase D1 `CONDITIONALLY READY` — 대상 DB 무결성 preflight 통과 필요
- Requested output language: Korean
- Evidence baseline: `/Users/hamsangeok/Desktop/git/stagekeeper`, `dev@0eef5cb`, 작성 전 working tree clean, 2026-09-12 읽기 전용 조사
- Authority: 이 proposal 문서만 작성. 구현·마이그레이션·계약 문서 수정은 승인 후 별도 작업

## Summary

현재 프로젝트 상한은 `createdAt` 오름차순 앞 N개를 자동 활성화하고, `ProjectMember`가 사용자와
프로젝트를 연결한다. 이 구조는 개인 플랜에서 사용자가 어떤 기존 프로젝트를 계속 사용할지
결정할 수 없고, 아직 제품에 없는 Member 개념을 현재 권한 모델에 미리 들여온다.

Free·Pro·Max를 개인 플랜으로 한정하고 프로젝트를 한 사용자에게 직접 귀속시킨다. 플랜은 등록
가능한 프로젝트 수와 동시에 사용할 수 있는 프로젝트 수의 최대치를 유지하되, 다운그레이드로
초과한 기존 프로젝트 중 어떤 것을 사용할지는 자동 근거 또는 사용자의 명시적 교체로 정한다.
저장소 연결·토큰·실행 커서는 보존하고, 사용 목록에서 제외된 프로젝트만 읽기 전용으로 만든다.

## Goal

- 개인 사용자가 다운그레이드 후에도 자신의 중요한 프로젝트를 직접 사용 목록에 넣을 수 있게 한다.
- 자동 다운그레이드 선택을 최근 실제 작업 신호에 근거시키고 선택 이유를 감사 가능하게 만든다.
- Free·Pro·Max 도메인에서 `ProjectMember`와 Member 역할을 완전히 제거한다.
- GitHub 저장소 소유자와 Stagekeeper 프로젝트 소유자를 이름과 데이터 관계에서 분리한다.
- 플랜 변경, 프로젝트 사용 목록, 접근 차단을 하나의 일관된 서버 판정으로 강제한다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- `ProjectMember` 제거와 `Project` 소유권 backfill을 포함한 데이터 마이그레이션이다.
- 웹·MCP·템플릿·런북·에이전트 실행의 권한 판정이 바뀐다.
- 동시 교체, in-flight 요청, 토큰·실행 커서 보존과 같은 lifecycle 계약이 있다.
- 5개 이상의 파일과 현재 아키텍처·제품 문구 계약을 함께 수정한다.
- 최종 cleanup은 단순 revert만으로 복구할 수 없는 파괴적 스키마 변경이다.

## Feature Intent

### US-IPA-01: 사용할 프로젝트를 직접 정한다

개인 플랜 사용자로서, 플랜 한도를 초과해 보유한 프로젝트 중 실제로 사용할 프로젝트를 직접
정하고 싶다. 그래야 시스템이 오래됐다는 이유만으로 중요하지 않은 프로젝트를 남기지 않는다.

### US-IPA-02: 선택되지 않은 프로젝트를 잃지 않는다

개인 플랜 사용자로서, 사용 목록에서 제외된 프로젝트의 데이터와 연결 상태를 보존하고 싶다.
그래야 나중에 다시 선택했을 때 토큰 재발급이나 `/harness:init` 재실행 없이 이어갈 수 있다.

### 용어

| 용어 | 정의 | 피해야 할 표현 |
| --- | --- | --- |
| 프로젝트 소유자 | `Project.ownerUserId`로 연결된 유일한 Stagekeeper 사용자 | Member, 플랜 Owner |
| 저장소 소유자 | GitHub의 `owner/repo` 중 `owner`; DB 내부 이름은 `repoOwner` | 프로젝트 소유자 |
| 사용 가능 | 현재 사용 목록에 포함되어 웹 쓰기와 MCP·에이전트 작업이 허용된 프로젝트 | Active — 에이전트 실행과 혼동 |
| 선택되지 않음 | 소유하고 연결은 유지하지만 현재 사용 목록에는 포함되지 않은 프로젝트 | Paused, Locked |
| 최근 에이전트 활동 | `AgentRun.openedAt` 또는 `AgentRunStep.at`으로 서버가 관측한 최근 `agent_next` 활동 | 로컬 프로세스가 현재 실행 중이라는 주장 |
| 최근 저장소 동기화 | 성공한 `project_sync`가 기록한 `Project.lastSyncedAt` | 파일만 생성한 시각 |

`사용 가능`은 최대 개수 안에서 선택된 권한 상태다. `선택되지 않음`은 사용자가 프로젝트 선택으로
해결할 수 있는 상태다. `잠김`은 향후 계정 정지처럼 프로젝트 선택으로 해결할 수 없는 정책 제한에
남겨 둔다.

## Behavioral Requirements

### REQ-IPA-001: 개인 프로젝트 등록

WHEN 인증된 사용자가 현재 플랜의 등록 프로젝트 상한 안에서 유효한 GitHub 저장소를
Stagekeeper 프로젝트로 등록하면, 시스템은 그 사용자를 유일한 프로젝트 소유자로 연결하고 새
프로젝트를 즉시 `사용 가능`으로 저장하며 최초 프로젝트 토큰을 한 번 반환해야 한다.

### REQ-IPA-002: 등록 상한 유지

IF 사용자가 소유한 전체 프로젝트 수가 현재 플랜의 `projects` 상한에 도달했다면, THEN 시스템은
프로젝트가 `선택되지 않음`인지와 무관하게 새 프로젝트 등록을 기존 `capError` 문구로 거부해야 한다.

### REQ-IPA-003: 저장소 동기화 시각

WHEN 사용 가능한 프로젝트의 `project_sync`가 성공하면, 시스템은 Workspace·언어 변경과 같은
트랜잭션에서 `lastSyncedAt`을 갱신해야 한다. 실패하거나 접근 판정에서 거부된 호출은 이 시각을
변경하지 않아야 한다.

### REQ-IPA-004: 다운그레이드 자동 선택

WHEN 플랜 하향으로 현재 사용 가능 프로젝트 수가 새 상한을 초과하면, 시스템은 같은 플랜 변경
트랜잭션에서 새 상한만큼의 실제 사용 목록을 선택·저장하고 나머지를 `선택되지 않음`으로 변경해야
한다. 사용자 확인을 기다리는 임시 상태는 만들지 않아야 한다.

### REQ-IPA-005: 자동 선택 순서

WHEN REQ-IPA-004의 자동 선택이 필요하면, 시스템은 현재 사용 가능 목록 안에서 다음 우선순위를
적용해야 한다: 최근 사용자가 `이 프로젝트 사용`으로 고른 시각, 최근 `agent_next` 활동 시각,
최근 성공한 `project_sync` 시각, 최근 프로젝트 등록 시각, 마지막으로 프로젝트 ID 오름차순.
자동 선택은 이전에 선택되지 않은 프로젝트를 다시 추가하지 않아야 한다.

### REQ-IPA-006: 업그레이드 보존

WHEN 플랜 상향으로 사용 가능 상한이 늘어나면, 시스템은 현재 사용 목록을 그대로 유지하고 기존의
선택되지 않은 프로젝트를 자동으로 추가하지 않아야 한다. Max의 무제한 전환도 같은 규칙을 따른다.

### REQ-IPA-007: 빈자리에 프로젝트 추가

WHEN 소유자가 `선택되지 않음` 프로젝트에서 `이 프로젝트 사용`을 요청하고 현재 사용 가능 개수가
플랜 상한보다 작으면, 시스템은 다른 프로젝트를 제외하지 않고 그 프로젝트를 즉시 사용 목록에
추가해야 한다.

### REQ-IPA-008: 가득 찬 목록에서 프로젝트 교체

WHEN 소유자가 상한이 가득 찬 상태에서 `이 프로젝트 사용`을 요청하면, 시스템은 Free에서는 유일한
기존 프로젝트를 교체 대상으로 제시하고, Pro에서는 소유자가 현재 사용 가능 프로젝트 중 하나를
직접 교체 대상으로 고르게 해야 한다. 시스템은 사용자가 확인한 대상만 제외하고 목표 프로젝트를
사용 가능하게 해야 한다.

### REQ-IPA-009: 교체 영향 확인

WHEN 교체로 제외될 프로젝트에 미결 보드 항목 또는 열린 `AgentRun`이 있으면, 시스템은 확인 전에
그 수와 영향을 표시해야 한다. 소유자가 명시적으로 계속 진행하면 교체를 허용하되, 이미 접근 검사를
통과해 처리 중인 요청은 완료될 수 있고 교체 commit 뒤의 새 요청부터 차단해야 한다.

### REQ-IPA-010: 선택되지 않은 프로젝트의 접근

WHILE 프로젝트가 `선택되지 않음`이면, 시스템은 소유자에게 웹 읽기를 허용하고 웹 쓰기를
거부해야 한다. 프로젝트 토큰 MCP에서는 상태와 해결 방법을 돌려주는 `project_get`만 허용하고,
그 밖의 읽기·쓰기·`agent_next` 도구와 템플릿·런북 기록 요청을 이유와 함께 거부해야 한다.
보안상 토큰 폐기는 웹에서 계속 허용해야 한다.

### REQ-IPA-011: 연결과 실행 상태 보존

WHEN 프로젝트가 사용 목록에서 제외되거나 다시 추가되면, 시스템은 프로젝트 데이터,
`Workspace`, 프로젝트 토큰, 소유자 토큰, `AgentRun`, `PipelineRun`과 각 커서를 삭제·폐기·종료하지
않아야 한다. 다시 사용 가능해지면 기존 연결과 커서로 재개할 수 있어야 한다.

### REQ-IPA-012: 동시 교체의 stale 거부

IF 프로젝트 사용 목록이 화면이 읽은 버전 이후 다른 요청으로 변경됐다면, THEN 시스템은 이전
버전을 보낸 교체 요청을 적용하지 않고 최신 목록을 다시 확인하라는 명시적 stale 결과를 반환해야
한다.

### REQ-IPA-013: 선택 원장

WHEN 사용자 교체, 프로젝트 등록 또는 플랜 변경이 사용 목록을 바꾸면, 시스템은 actor, reason,
이전·이후 플랜, 추가·제외 프로젝트 ID, 변경 뒤 전체 사용 목록, 선택 근거, 단조 증가 버전과 시각을
감사 원장에 기록해야 한다. 사용자 교체와 시스템 자동 선택은 actor로 구분해야 한다.

### REQ-IPA-014: 목록 UI와 진입점

WHEN 소유자가 `/projects` 또는 선택되지 않은 프로젝트를 열면, 시스템은 현재 사용 개수와 플랜
상한, 각 프로젝트의 `사용 가능` 또는 `선택되지 않음` 상태, `이 프로젝트 사용` 동작을 제공해야
한다. 다운그레이드 자동 선택 뒤에는 선택 근거를 알리되 화면 이용을 차단하거나 별도 확정 버튼을
요구하지 않아야 한다.

### REQ-IPA-015: 기존 데이터 보존 마이그레이션

WHEN 새 소유권·사용 목록 스키마가 기존 데이터에 적용되면, 시스템은 현재 플랜 상한 안의 기존
프로젝트를 모두 사용 가능하게 유지하고, 상한 초과 목록만 REQ-IPA-005의 순서로 줄여야 한다.
프로젝트 데이터와 토큰·원장은 삭제하지 않아야 한다.

### REQ-IPA-016: 소유자 전용 접근

IF 인증 사용자가 요청한 프로젝트의 `ownerUserId`와 일치하지 않으면, THEN 웹은 프로젝트 존재 여부를
구분하지 않는 기존 not-found 흐름을 유지하고 소유자 토큰 MCP는 소유자가 아니라는 오류로
거부해야 한다.

## Domain Invariants

### INV-IPA-001: 프로젝트는 개인 사용자 한 명에게 귀속된다

Free·Pro·Max의 모든 프로젝트에는 정확히 하나의 `ownerUserId`가 있다. 현재 도메인에는 프로젝트
Member, 초대, 공유, 좌석이 없다.

### INV-IPA-002: 사용 목록은 정확한 집합이다

저장된 `available` 값들의 집합이 현재 실제 사용 목록이다. 별도의 임시·암묵적 목록은 없다.

### INV-IPA-003: 사용 가능 개수는 상한을 넘지 않는다

모든 commit된 상태에서 사용자의 사용 가능 프로젝트 수는 `limitsFor(plan).projects` 이하이며,
소유 프로젝트가 하나 이상이고 상한이 1 이상이면 적어도 하나는 사용 가능하다. 독립적인
`일시 중지` 또는 명시적 0개 선택 기능은 존재하지 않는다.

### INV-IPA-004: 등록 상한과 사용 목록은 다른 사실이다

등록 상한은 소유한 모든 프로젝트를 세고, 사용 목록은 그중 현재 작업이 허용된 프로젝트를
나타낸다. 다운그레이드는 등록 데이터를 삭제하지 않으므로 소유 개수는 현재 상한을 초과할 수 있다.

### INV-IPA-005: 사용자 선택이 자동 신호보다 우선한다

현재 사용 가능 목록 안에서 사용자가 직접 선택한 프로젝트는 자동 다운그레이드 선택에서
에이전트 활동·동기화·등록 시각보다 우선한다. 자동 신호는 사용자의 정확한 교체 결과를 재작성하지
않는다.

### INV-IPA-006: 연결은 사용 가능 상태와 독립적이다

저장소 연결, 토큰, Workspace와 실행 커서는 프로젝트가 사용 목록에서 제외되어도 유지된다.

### INV-IPA-007: 플랜 변경과 사용 목록은 원자적이다

플랜 값, 사용 가능 집합, 선택 버전과 원장 행은 하나의 트랜잭션에서 함께 commit되거나 함께
rollback된다.

## Engineering Constraints

### CON-IPA-001: 중앙 접근 판정

웹, MCP, 템플릿, 런북과 에이전트 실행은 `src/server`의 단일 프로젝트 접근 판정을 사용해야 한다.
각 소비자가 별도의 사용 목록 규칙을 구현해서는 안 된다.

### CON-IPA-002: FSD 경계

새 사용자 동작은 `src/fsd/features`의 독립 slice에 두고, `src/app`은 params·인가·조합만 담당해야
한다. 순수 정렬·상한 규칙은 `packages/core`, DB·트랜잭션은 `src/server`가 소유해야 한다.

### CON-IPA-003: 외부 저장소 계약 호환

DB와 내부 타입은 `repoOwner`를 사용하되, 기존 사용자 저장소의 `harness.json` 키
`project.owner`와 템플릿 변수 `{{project.owner}}`, MCP의 GitHub 저장소 owner 필드는 이번 범위에서
변경하지 않는다. 서버·플러그인 adapter가 `repoOwner`를 기존 외부 키로 변환해야 한다.

### CON-IPA-004: 연결 완료 신호

`lastSyncedAt`은 성공한 `project_sync`만 갱신한다. `/harness:init`의 파일 생성이나
`POST /api/runbook`, 단순 MCP 조회는 연결 완료 또는 에이전트 활동으로 세지 않는다.

### CON-IPA-005: 에이전트 활동 신호

최근 에이전트 활동은 기존 `AgentRun.openedAt`과 `AgentRunStep.at`에서 plan-change 시점에
파생한다. 로컬 Claude 프로세스의 생존 여부를 추정하거나 페이지 조회를 활동으로 기록하지 않는다.

### CON-IPA-006: Member cleanup 전 호환 창

`ProjectMember`와 레거시 `Project.owner` 제거는 새 직접 소유권을 모든 소비자가 사용하고 rollback
rehearsal이 끝난 뒤 별도 cleanup Phase에서 수행해야 한다. additive migration 직후 삭제해서는 안 된다.

### CON-IPA-007: 새 클라이언트 상태 계층 금지

이 기능은 기존 Server Component·Server Action·`revalidatePath` 흐름을 사용한다. TanStack Query,
전역 store 또는 별도 브라우저 데이터 캐시를 도입하지 않는다.

## Concrete Examples

### EX-IPA-001A: 최근 작업 프로젝트를 Free에서 유지

- illustrates: REQ-IPA-004, REQ-IPA-005, INV-IPA-005
- Given: Pro 사용자가 A·B·C를 사용 중이고 직접 교체 기록은 없으며, B의 `AgentRunStep.at`이 가장 최근이다
- When: 플랜을 Free로 변경한다
- Then: B만 사용 가능해지고 A·C는 선택되지 않으며, `basis: recent-agent-activity`인 system 원장이 남는다

### EX-IPA-002A: Free 프로젝트 교체

- illustrates: REQ-IPA-008, REQ-IPA-009, REQ-IPA-011
- Given: Free에서 A가 사용 가능하고 B는 선택되지 않았으며 A에 열린 AgentRun이 있다
- When: 소유자가 B의 `이 프로젝트 사용`을 누르고 A의 영향 경고 뒤 교체를 확인한다
- Then: B가 사용 가능하고 A가 선택되지 않으며 A의 토큰·Workspace·AgentRun 커서는 보존된다

### EX-IPA-003A: Pro 빈자리와 가득 찬 목록

- illustrates: REQ-IPA-007, REQ-IPA-008
- Given: Pro에서 A·B·C가 사용 가능하고 D·E·F가 선택되지 않았다
- When: 소유자가 D를 사용한다
- Then: D가 즉시 추가되어 4/5가 되고 교체 확인은 없다
- And when: 소유자가 E를 추가해 5/5인 뒤 F를 사용한다
- Then: 소유자가 A·B·C·D·E 중 하나를 직접 제외 대상으로 고른 뒤에만 F가 추가된다

### EX-IPA-004A: 두 창의 교체 충돌

- illustrates: REQ-IPA-012, INV-IPA-007
- Given: 두 창이 사용 목록 version 7을 읽었다
- When: 창 A가 B를 사용해 version 8을 commit한 뒤 창 B가 version 7로 C를 사용하려 한다
- Then: 창 B의 요청은 아무 프로젝트도 바꾸거나 원장을 남기지 않고 stale 결과를 반환한다

## Current State

현재 동작은 다음과 같다.

1. `packages/core/entitlement.mjs:45-49`의 `activeProjectIds()`가 `createdAt` 오름차순 앞 N개를
   활성으로 계산한다.
2. `src/server/entitlement.ts:17-37`이 `ProjectMember.role = "owner"`를 찾아 소유자의 플랜과
   잠금 상태를 매 요청 계산한다.
3. `src/app/(app)/projects/page.tsx:10-26`이 membership 목록과 같은 `activeProjectIds()`를
   다시 사용해 `locked` UI 값을 만든다.
4. `src/server/auth/guard.ts:15-29`의 `requireMember()`와 `requireProjectWrite()`가 웹 접근과
   쓰기를 분리한다.
5. `src/server/mcp/tools.ts:60-93`은 `project_get`에서 잠금 이유를 알리고 일부 도구에
   `guardLocked()`를 적용한다. 현재 읽기 도구 일부는 열린 채라 REQ-IPA-010과 다르다.
6. `Workspace`에는 동기화 시각이 없고 `project_sync`는 Workspace·언어만 갱신한다.
7. `AgentRun.openedAt`과 `AgentRunStep.at`은 이미 프로젝트별 `agent_next` 시작·결과 활동을
   기록한다.
8. `scripts/grant-plan.ts:21-25`는 `Subscription`만 직접 upsert하므로 플랜과 프로젝트 목록을
   원자적으로 바꿀 application service가 없다.
9. `/projects`는 행 전체가 Link이고 상태 변경 버튼·버전·교체 영향 모델이 없다.

## Codebase / Contract Reconciliation

| Concern | Feature intent | Codebase evidence | Contract evidence | Status | Implementation impact |
| --- | --- | --- | --- | --- | --- |
| 프로젝트 소유권 | 개인 사용자 한 명의 직접 소유 | `ProjectMember`, `requireMember`, membership query | `system-overview.md`, `protocol.md`가 멤버십을 현재 계약으로 기술 | conflict | additive 소유권 이행 뒤 모든 소비자와 문서를 cutover |
| 사용 목록 | 사용자가 고른 정확한 집합 | `activeProjectIds()`가 매번 오래된 N개 계산 | `invariants.md:72-75`가 오래된 N개를 불변식으로 규정 | conflict | 기존 불변식은 구현 cutover와 같은 변경에서 명시적으로 갱신 |
| 등록 한도 | Free 1, Pro 5, Max 무제한 유지 | `LIMITS.projects`, `createProject()`의 owned count | Phase 4 entitlement proposal | aligned | 상한 수치는 바꾸지 않고 소유 count 배선만 변경 |
| 연결 신호 | 성공한 sync 시각 | `project_sync`는 timestamp 미저장 | protocol의 sync 의미만 존재 | absent | `lastSyncedAt` 추가, 과거 시각은 복원 불가 |
| 에이전트 활동 | 서버 관측 `agent_next` 시각 | `AgentRun.openedAt`, `AgentRunStep.at` | protocol의 AgentRun 원장 | aligned | plan change에서 파생해 사용, 별도 process-live 추정 없음 |
| 동시 교체 | stale 요청 거부 | 보드에는 `updatedAt` CAS 선례, 프로젝트 목록에는 없음 | protocol의 stale 보드 규약 | partial | 사용자 단위 단조 증가 version과 CAS 추가 |
| 연결 보존 | 선택 제외 시 데이터·토큰·cursor 유지 | 기존 초과 프로젝트도 삭제하지 않음 | `invariants.md:72-75` | aligned | 잠금 명칭·도구 범위만 새 계약으로 조정 |
| 외부 `owner` 키 | GitHub owner 호환 유지 | `harness.json project.owner`, 템플릿·MCP DTO가 사용 | config parser와 private template 계약 | aligned with constraint | DB·내부 이름만 repoOwner, adapter에서 legacy key 유지 |

### Evidence status

- Observed: 관련 schema, entitlement, guard, MCP, AgentRun, project list, create-project, plan grant,
  architecture와 product-copy를 `dev@0eef5cb`에서 읽었다.
- Contracted: `docs/architecture/`가 현재 구조의 source of truth이며, 현재는 오래된 N개와
  `ProjectMember`를 계약한다. 이 SDD는 승인 후 그 계약을 바꾸는 제안이다.
- Inferred: 저장된 exact set을 두면 정상 접근마다 AgentRun 원장을 다시 집계하지 않아도 되고,
  활동 집계는 드문 plan-change 시점으로 한정할 수 있다.
- Assumption: Free·Pro·Max의 `projects` 수치와 등록 상한 의미는 그대로 유지한다.
- Unresolved: 실제 대상 DB가 프로젝트마다 owner membership 정확히 하나, 일반 membership 0개라는
  조건을 만족하는지는 문서 권한으로 live DB를 조회하지 않아 확인하지 않았다.

## Scope

### Included

- 개인 프로젝트 직접 소유권과 `ProjectMember` 제거.
- `Project.owner` DB 필드의 `repoOwner` 이행과 외부 `owner` 계약 adapter.
- exact 사용 가능 집합, 사용자 선택 시각, 사용자 단위 selection version과 선택 원장.
- 성공한 `project_sync`의 `lastSyncedAt`.
- 플랜 변경 application service와 `plan:grant` 배선.
- 다운그레이드 자동 선택과 업그레이드 비자동 추가.
- `/projects`와 프로젝트 배너의 사용·교체 UX.
- 선택되지 않은 프로젝트의 웹/MCP/템플릿/런북 접근 규칙.
- 기존 데이터 preflight, backfill, 호환 기간과 파괴적 cleanup.
- 현재 아키텍처, 도메인 용어와 product-copy 갱신.

### Excluded

- Business, Organization, 좌석, 초대, 공유와 Member 역할.
- 프로젝트 삭제·보관, 독립적인 일시 중지, 사용 가능 프로젝트 0개 선택.
- 플랜 가격·결제 UI·checkout·자동 갱신.
- Free·Pro·Max 상한 수치 변경 또는 등록 프로젝트와 사용 가능 프로젝트를 별도 과금 축으로 분리.
- 토큰 자동 폐기, AgentRun/PipelineRun 취소·초기화.
- 로컬 Claude 프로세스 생존 감지, 모든 MCP 조회의 활동 추적.
- `harness.json project.owner`, 템플릿 변수와 공개 MCP 저장소 필드의 breaking rename.
- TanStack Query, 실시간 push/SSE, 전역 클라이언트 상태 관리.

## Technical Design

### 1. 목표 데이터 모델

최종 Prisma 모양은 다음 책임을 가져야 한다. 필드명은 Phase 상세 계획에서 Prisma 관계 이름과
생성 클라이언트 충돌을 재검증하되 의미를 바꾸지 않는다.

```prisma
model User {
  // 기존 필드
  projectAvailabilityVersion Int @default(0)
  projects                   Project[] @relation("ProjectOwner")
  projectAvailabilityEvents ProjectAvailabilityEvent[]
}

model Project {
  // 기존 id/slug/name 등
  ownerUserId   String
  repoOwner     String
  repo          String
  available     Boolean   @default(true)
  lastSelectedAt DateTime?
  lastSyncedAt  DateTime?
  createdAt     DateTime  @default(now())
  ownerUser     User      @relation("ProjectOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)

  @@index([ownerUserId, available])
}

model ProjectAvailabilityEvent {
  id                  String   @id @default(cuid())
  ownerUserId         String
  version             Int
  actor               String   // user | system
  reason              String   // registration | use-project | plan-downgrade | migration-backfill
  fromPlan            String?
  toPlan              String?
  addedProjectIds     String[]
  removedProjectIds   String[]
  availableProjectIds String[]
  basis               String?  // user-selection | recent-agent-activity | recent-project-sync | recent-registration
  at                   DateTime @default(now())
  ownerUser            User     @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)

  @@unique([ownerUserId, version])
  @@index([ownerUserId, at])
}
```

`available`이 exact set을 소유하고 `lastSelectedAt`은 사용자가 직접 `이 프로젝트 사용`을 실행한
프로젝트의 다운그레이드 우선순위다. 프로젝트 등록은 `available = true`지만
`lastSelectedAt = null`이다. plan change는 기존 `available = true` 후보만 줄이며, 과거에
선택되지 않은 프로젝트를 자동 복원하지 않는다.

`lastAgentActivityAt`은 중복 저장하지 않는다. plan change 또는 migration backfill에서 프로젝트별
`max(AgentRun.openedAt, AgentRunStep.at)`을 계산한다. 정상 `projectAccess()`는 저장된
`available`만 읽는다.

### 2. 개인 소유권과 저장소 이름

- `Project.ownerUserId`가 Stagekeeper 소유권의 단일 source다.
- 현재 `Project.owner` DB 열은 additive 호환 Phase에서 `repoOwner` 사본을 만든 뒤 제거한다.
- `requireMember()`는 `requireProjectOwner()`로 바꾸고 `ownerUserId + slug`를 직접 확인한다.
- `loadHeaderProjects`, `/projects`, 프로젝트 생성 count, plan lookup, dispatch count와 owner MCP
  검사는 직접 관계를 사용한다.
- `harness.json.project.owner`와 `{{project.owner}}`는 GitHub owner라는 기존 외부 계약을
  유지하고 내부 `repoOwner`를 adapter에서 매핑한다.

### 3. 사용 목록 판정

`packages/core`의 순수 정책은 다음 입력만 받아 정렬된 ID를 반환한다.

```ts
type AvailabilityCandidate = {
  id: string;
  lastSelectedAt: Date | null;
  lastAgentActivityAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
};
```

정렬은 REQ-IPA-005 순서의 내림차순이며 마지막 ID만 오름차순이다. 입력을 mutate하지 않는다.
현재 `activeProjectIds()`의 오래된 N개 정책과 테스트는 이 정책으로 대체하고 명칭도
`availableProjectIds` 계열로 바꾼다.

### 4. 플랜 변경 service

`scripts/grant-plan.ts`의 직접 upsert를 `src/server`의 단일 plan-change application service로
옮긴다. service는 interactive transaction 안에서 다음 순서를 지킨다.

1. 사용자 row와 현재 selection version을 CAS 대상으로 읽는다.
2. 현재 플랜, 목표 플랜, 현재 `available = true` 프로젝트를 읽는다.
3. 상향 또는 같은 상한이면 목록을 바꾸지 않는다.
4. 하향으로 현재 목록이 새 상한을 넘을 때만 REQ-IPA-005로 상위 N개를 고른다.
5. `Subscription`, Project.available 집합과 selection version을 함께 갱신한다.
6. 변경이 있으면 system `ProjectAvailabilityEvent`를 같은 transaction에 남긴다.

향후 결제 adapter가 생겨도 이 service만 호출하며 Subscription을 직접 쓰지 않는다.

### 5. 사용자 선택 service

제안 경계는 `src/fsd/features/select-project-for-use`의 Server Action과 `src/server` transaction
service다.

입력:

```ts
type SelectProjectForUseInput = {
  targetProjectId: string;
  replacementProjectId?: string;
  expectedVersion: number;
};
```

서버는 입력 shape, 로그인 사용자, target/replacement의 `ownerUserId`, 현재 available 집합과
version을 다시 검증한다.

- target이 이미 available이면 상태를 바꾸지 않는 멱등 성공을 반환한다.
- 빈자리가 있으면 target만 추가한다.
- Free가 가득 찼으면 현재 유일한 available 프로젝트를 replacement로 사용하되 클라이언트가
  확인한 ID와 서버 최신 ID가 다르면 stale로 거부한다.
- Pro가 가득 찼으면 `replacementProjectId`가 필수이며 현재 available이고 target과 달라야 한다.
- Max는 상한 때문에 replacement를 요구하지 않는다.
- 성공하면 target의 `lastSelectedAt`, exact set, version과 user event를 한 transaction에서 쓴다.
- 실패·stale는 partial update나 원장을 남기지 않는다.

### 6. 읽기 모델과 UI

`/projects`용 server-only adapter가 프로젝트 목록, plan limit, available count, selection version,
최근 자동 선택 안내와 교체 영향 요약을 조립한다. `src/app/(app)/projects/page.tsx`는 인증과 조합만
담는다.

현재 행 전체가 `<Link>`이므로 버튼을 Link 안에 중첩하지 않는다. 프로젝트 정보 Link와 상태,
`이 프로젝트 사용` control을 sibling으로 둔다.

- 빈자리: 한 번의 Server Action으로 즉시 추가하고 pending·오류·성공 feedback을 보인다.
- 가득 참 Free: 현재 프로젝트와 영향 요약이 있는 확인 UI를 보인다.
- 가득 참 Pro: 현재 available 프로젝트 중 replacement를 고른 뒤 영향 요약과 최종 확인을 보인다.
- 프로젝트 내부 배너: 같은 action과 model을 사용하며 별도 선택 규칙을 만들지 않는다.
- 다운그레이드 안내: 자동 선택 결과와 `basis`를 설명하지만 페이지를 막거나 승인 버튼을 요구하지
  않는다.

### 7. 접근 판정과 MCP

`ProjectAccess`는 `locked`가 아니라 `available`을 명시하는 discriminated union으로 바꾼다.
`requireProjectWrite()` 또는 후속 명칭은 소유권과 availability를 각각 검사한다.

선택되지 않은 프로젝트:

- 웹 route: 소유자는 읽을 수 있다.
- 웹 mutation: 프로젝트 사용 선택과 agent/owner token revoke를 제외하고 거부한다.
- `/api/mcp`: `project_get`만 허용한다. 응답은 `available: false`와 사람이 해결할 문장을 싣는다.
- 나머지 MCP tool, `/api/templates`, `/api/runbook`, `agent_next`: 같은 중앙 사유로 거부한다.
- 기존 token·run row는 변경하지 않는다.

### 8. Member 제거 migration

파괴적 migration 전에 모든 대상 환경에서 아래 preflight가 통과해야 한다.

```text
각 Project에 role=owner ProjectMember가 정확히 1개
role!=owner ProjectMember가 0개
owner가 없는 Project가 0개
owner가 여러 명인 Project가 0개
```

실패하면 대상 ID를 출력하고 migration을 중단한다. 첫 행 선택, 일반 Member 삭제 또는 소유자 추측은
금지한다.

호환 Phase에서는 새 열·관계·event를 추가하고 기존 `ProjectMember`와 `Project.owner`를 유지한다.
새 코드가 직접 소유권과 `repoOwner`만 읽고 모든 생성 경로가 필요한 legacy shadow도 함께 쓴다는
것을 확인한 뒤 최종 Phase에서 `ProjectMember`, `User.members`, `Project.members`, 레거시 owner 열과
관련 코드·문구를 제거한다.

## Permission and Abuse Analysis

| 위협 또는 오용 | 방어 |
| --- | --- |
| 다른 사용자의 project ID로 `이 프로젝트 사용` 호출 | target·replacement 모두 `ownerUserId`를 서버 transaction 안에서 재검증 |
| 오래된 확인창이 다른 프로젝트를 제외 | 사용자 단위 `expectedVersion` CAS, stale 시 zero-write |
| UI에서 replacement를 생략해 Pro 임의 제외 | full Pro에서는 명시적 replacement 필수, 서버가 current available membership 검증 |
| 선택되지 않은 프로젝트 token으로 작업 지속 | 인증은 통과시키되 `project_get` 외 모든 tool에서 중앙 사유로 거부 |
| 사용 목록 제외와 token revoke 혼동 | selection 변경은 token row를 수정하지 않고 revoke는 availability와 무관하게 허용 |
| migration이 임의 소유자를 선택 | preflight 불일치 시 hard stop |
| plan만 먼저 바뀌어 상한 초과 access 노출 | plan·exact set·version·event 단일 transaction |
| in-flight 요청이 교체 뒤 늦게 commit | 이미 access를 통과한 한 요청은 허용한다는 계약을 UI에 알리고, 새 요청부터 차단 |

새 event는 기존 user/project 식별자와 시각만 저장하며 새로운 secret·token 평문을 저장하지 않는다.

## Runtime Lifecycle

| 상태 또는 이벤트 | 소유자 | 전이 | 실패·재진입 동작 | Requirement |
| --- | --- | --- | --- | --- |
| 프로젝트 등록 | create-project service | 새 Project available=true, token 발급 | cap·중복 slug 실패는 기존 명시 상태, partial create 없음 | REQ-IPA-001, REQ-IPA-002 |
| 첫/재 project_sync | MCP project service | lastSyncedAt 갱신 | 거부·실패는 timestamp 불변 | REQ-IPA-003 |
| 플랜 상향 | plan-change service | exact set 유지 | plan·event transaction 실패 시 전체 rollback | REQ-IPA-006 |
| 플랜 하향 | plan-change service | current available set을 N개로 trim | 자동 basis가 없으면 createdAt/id fallback, partial state 없음 | REQ-IPA-004, REQ-IPA-005 |
| 빈자리에서 사용 | selection service | target 추가 | 중복 요청은 멱등, stale는 zero-write | REQ-IPA-007, REQ-IPA-012 |
| 가득 찬 목록 교체 | selection service | target 추가 + confirmed replacement 제외 | invalid replacement·stale는 zero-write | REQ-IPA-008, REQ-IPA-012 |
| 선택되지 않은 상태 | central access | 웹 read/project_get만 허용 | 사용 선택 또는 plan change 뒤 재평가 | REQ-IPA-010 |
| 제외 당시 열린 run | AgentRun/PipelineRun | 커서 보존 | reselect 뒤 같은 cursor 재개 | REQ-IPA-011 |
| 동시 브라우저 교체 | selection version | 첫 commit만 version 승리 | 뒤 요청은 refresh 안내 | REQ-IPA-012 |
| 프로세스 재시작 | Postgres | exact set/version/event 유지 | 브라우저 local state에 의존하지 않음 | REQ-IPA-013 |

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/*` | update/create | 직접 소유권, exact set, sync 시각, version, event; legacy cleanup | high — 데이터·FK·drop |
| `packages/core/entitlement.mjs`, `packages/core/entitlement.test.mjs` | update | 오래된 N개를 새 selection order로 대체 | high — 모든 plan 판정의 순수 정책 |
| `plugin/lib/entitlement.mjs` | generated update | core 배포 복사본 동기화 | medium — `npm run sync:plugin-lib` 필수 |
| `src/server/entitlement.ts` | replace responsibility | direct owner/available 중앙 판정 | high — 웹·MCP 공통 gate |
| `src/server/auth/guard.ts`와 모든 `requireMember` caller | rename/update | owner-only route·mutation access | high — 인증·인가 |
| `src/server`의 plan-change/availability service (proposed) | create | atomic plan·selection·ledger·CAS | high |
| `scripts/grant-plan.ts` | update | 직접 Subscription write 제거 | high — 현재 유일한 plan mutation |
| `src/server/mcp/{tools,deps,owner-tools,owner-deps}.ts`와 tests | update | project_get-only, owner direct check, unavailable reason | high — public MCP behavior |
| `src/server/{templates-query,runbook-query}.ts`와 tests | update | 선택되지 않은 프로젝트 거부 명칭·계약 | medium |
| `src/server/agents/{runs,next}.ts`, `src/server/pipeline/run.ts`와 tests | update | owner relation, activity 집계, unavailable 판정 | high |
| `src/fsd/features/create-project` | update | direct owner, repoOwner, available 등록 | high — transaction |
| `src/fsd/features/select-project-for-use` (proposed) | create | 사용자 선택·replacement·confirmation | high — 새 권한 action |
| `src/fsd/pages/project-list`, `src/app/(app)/projects/page.tsx` | update | exact list·상한·상태·control | medium |
| `src/app/(app)/p/[slug]/layout.tsx`와 관련 page/action | update | 선택되지 않음 배너·owner guard·read-only | medium |
| `src/fsd/widgets/app-header`, repo DTO·문서 링크·agent vars adapters | update | DB repoOwner와 외부 owner 매핑 | medium — 이름 전파 |
| `CONTEXT.md`, `docs/architecture/{README,system-overview,fsd,invariants,protocol,verification}.md` | update | Member 제거와 새 current contract | high — source of truth |
| `docs/conventions/product-copy.md` | update | Available/Not selected, Use this project, stale·MCP 문구 | medium |
| private template source와 template tests | inspect/update if referenced | Member/locked copy가 있으면 현재 계약과 맞춤 | medium — workspace 밖 원본 |

## Safety Analysis

- [x] 앱 진입점과 라우팅 경계 — 새 URL 없이 `/projects`와 기존 프로젝트 layout에 동작을 넣는다.
- [x] 정적 import/export와 barrel — 새 FSD feature는 public API를 통해 page/layout에서 사용한다.
- [x] dynamic import/lazy — 관련 경로에 사용 없음.
- [x] 테스트·스크립트 — entitlement, MCP, server action, migration, plugin copy 검증 경로를 확인했다.
- [x] 정적 자산 URL — 영향 없음.
- [x] 타입·전역 선언 — Prisma 생성 타입과 `ProjectAccess`, project DTO가 전파된다.
- [x] 런타임 side effect — plan grant, project sync, selection action의 transaction 경계를 설계했다.
- [x] API·외부 계약 — MCP unavailable 동작은 바뀌지만 `harness.json project.owner`와 token prefix는 유지한다.
- [x] 인증·인가 — direct owner check, unavailable gate와 token revoke 예외를 명시했다.

가장 큰 안전장치는 destructive cleanup을 마지막 Phase로 미루고, 그전까지 legacy owner relation을
rollback shadow로 보존하는 것이다.

## Blockers

### BLK-IPA-D1-01: 대상 DB 소유권 무결성 미확인

- classification: current-phase condition
- evidence: schema는 owner 수 1과 일반 Member 0을 DB constraint로 강제하지 않는다. live DB는 문서 작성 범위에서 조회하지 않았다.
- affects: REQ-IPA-015, REQ-IPA-016, Phase D1
- impact: 잘못된 ownerUserId backfill은 접근권한 손실 또는 노출을 만든다.
- unblock requirement: 모든 대상 환경에서 owner 정확히 1·일반 Member 0 preflight 결과를 보관한다.
- owner: implementation/operations owner
- stop condition: 한 행이라도 조건을 어기면 backfill과 schema cutover를 시작하지 않는다.

### BLK-IPA-D2-01: private template corpus의 용어 확인

- classification: downstream
- evidence: 에이전트 템플릿 원본은 별도 private 저장소이고 현재 workspace에서 Member/locked 문구 전체를 확인할 수 없다.
- affects: REQ-IPA-010, REQ-IPA-014, Phase D2
- impact: MCP 오류와 에이전트 안내가 새 Available/Not selected 계약과 어긋날 수 있다.
- unblock requirement: private template 원본과 tests에서 Member, locked, project owner 문구를 검색하고 필요한 변경을 D2 범위에 포함한다.
- owner: template repository owner
- stop condition: corpus 확인 없이 D2의 copy/contract cutover를 완료 처리하지 않는다.

### BLK-IPA-D3-01: destructive cleanup 복구 증거

- classification: downstream
- evidence: `ProjectMember`와 레거시 owner 열 drop 뒤 단순 code revert는 예전 schema를 복구하지 못한다.
- affects: REQ-IPA-015, INV-IPA-001, Phase D3
- impact: rollback 시 owner relation을 복구하지 못할 수 있다.
- unblock requirement: ownerUserId→legacy owner membership 재구성 rehearsal과 대상 DB backup/restore 위치를 기록한다.
- owner: implementation/operations owner
- stop condition: 복구 rehearsal과 backup 증거 없이 D3 migration을 실행하지 않는다.

## Phase Map

### Phase D1: Additive ownership and availability foundation

- status: Proposed
- split rationale: 새 구조를 추가·backfill하되 런타임을 바꾸지 않아 데이터 검증과 rollback을 독립적으로 확인한다.
- predecessor artifacts: 이 SDD 승인, BLK-IPA-D1-01 preflight
- entry criteria: 대상 DB owner 무결성 통과, clean migration rehearsal DB 준비
- satisfies: REQ-IPA-015
- completion ownership: REQ-IPA-015의 비파괴 backfill·기존 접근 보존
- preserves: INV-IPA-004, INV-IPA-006
- governed-by: CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D1-01, VFY-IPA-D1-02
- verification strategy: additive migration 전후 row count·owner mapping·현재 availability 결과를 비교한다.
- intermediate validity: 기존 코드가 legacy `ProjectMember`와 owner 열을 계속 읽으며 새 열은 inactive shadow다.
- current blockers: BLK-IPA-D1-01
- downstream blockers: BLK-IPA-D2-01, BLK-IPA-D3-01
- exit criteria: 모든 프로젝트 direct owner/repoOwner/backfill 값이 검증되고 기존 동작이 변하지 않으며 rollback rehearsal이 통과한다.
- detailed plan: 승인 후 별도 Phase D1 plan 작성
- approval gate: migration SQL, preflight 결과와 rollback rehearsal을 사람이 승인하기 전 실행 금지

### Phase D2: Atomic server policy and user workflow cutover

- status: Proposed
- split rationale: exact set이 없는 UI나 UI가 없는 새 access gate를 배포하지 않도록 서버 정책·action·UI·현재 계약 문서를 한 cutover로 묶는다.
- predecessor artifacts: Phase D1 exit evidence, private template corpus 확인
- entry criteria: 새 schema backfill 완료, D1 rollback 가능, D2 copy 확정
- satisfies: REQ-IPA-001, REQ-IPA-002, REQ-IPA-003, REQ-IPA-004, REQ-IPA-005, REQ-IPA-006, REQ-IPA-007, REQ-IPA-008, REQ-IPA-009, REQ-IPA-010, REQ-IPA-011, REQ-IPA-012, REQ-IPA-013, REQ-IPA-014, REQ-IPA-016
- completion ownership: 사용자에게 보이는 selection 흐름, 중앙 권한, plan-change transaction과 원장 전체
- preserves: INV-IPA-002, INV-IPA-003, INV-IPA-004, INV-IPA-005, INV-IPA-006, INV-IPA-007
- governed-by: CON-IPA-001, CON-IPA-002, CON-IPA-003, CON-IPA-004, CON-IPA-005, CON-IPA-006, CON-IPA-007
- verified-by: VFY-IPA-D2-01, VFY-IPA-D2-02, VFY-IPA-D2-03, VFY-IPA-D2-04
- verification strategy: pure selection, transactional service, permission matrix, UI/manual lifecycle과 stale 충돌을 각각 관측한다.
- intermediate validity: runtime은 새 direct owner/available을 사용하지만 legacy relation은 rollback shadow로 남고 생성 경로는 호환 데이터를 유지한다.
- current blockers: BLK-IPA-D2-01
- downstream blockers: BLK-IPA-D3-01
- exit criteria: 모든 REQ-IPA-D2 관계 verifier, repository check와 실제 Free·Pro 시나리오가 통과하고 새 문서 계약이 runtime과 일치한다.
- detailed plan: D1 완료·승인 후 별도 Phase D2 plan 작성
- approval gate: D2 verifier와 수동 접근 matrix evidence 승인 전 D3 시작 금지

### Phase D3: Remove Member and legacy owner storage

- status: Proposed
- split rationale: 되돌리기 어려운 drop을 새 경로가 실측된 뒤 분리 실행한다.
- predecessor artifacts: Phase D2 운영·회귀 evidence, BLK-IPA-D3-01 복구 evidence
- entry criteria: legacy read 0건 정적 검사, shadow write 일치 검사, backup과 역 migration rehearsal
- satisfies: REQ-IPA-015, REQ-IPA-016
- completion ownership: INV-IPA-001의 최종 물리 모델과 Member 용어 완전 제거
- preserves: INV-IPA-001, INV-IPA-002, INV-IPA-006
- governed-by: CON-IPA-003, CON-IPA-006
- verified-by: VFY-IPA-D3-01, VFY-IPA-D3-02
- verification strategy: schema·코드·문서에서 membership/legacy owner 의존이 없고 복구가 가능한지 검사한다.
- intermediate validity: 최종 상태이며 Business 모델은 추가하지 않는다.
- current blockers: BLK-IPA-D3-01
- downstream blockers: none
- exit criteria: `ProjectMember`와 Member 계약이 제거되고 direct owner만으로 전체 check·MCP·웹 접근이 통과한다.
- detailed plan: D2 승인 후 별도 Phase D3 plan 작성
- approval gate: 완료 evidence 승인 전 proposal을 completed로 이동하지 않는다.

## Test / Eval Mapping

### VFY-IPA-D1-01: 소유권 migration rehearsal

- category: migration
- destination: proposed migration preflight/backfill verifier under `scripts/`, Prisma migration on an isolated DB
- verifies: REQ-IPA-015
- setup/fixture: owner 정확히 1인 정상 행, owner 없음·다중 owner·일반 Member가 있는 거부 fixtures
- expected observation: 정상 DB는 row·token·run 손실 없이 backfill되고, 비정상 fixture는 대상 ID와 함께 변경 전 중단한다.
- state: Planned
- evidence: Not executed — document-only task

### VFY-IPA-D1-02: 기존 availability 결과 비교

- category: integration
- destination: proposed server migration fixture plus `packages/core/entitlement.test.mjs`
- verifies: REQ-IPA-015
- setup/fixture: Free 1, Pro 4, Max 8, 각 plan의 초과 project set과 AgentRun activity
- expected observation: 한도 안은 전부 사용 가능하고 초과 set만 새 우선순위로 trim되며 프로젝트 데이터 수는 같다.
- state: Planned
- evidence: Not executed — document-only task

### VFY-IPA-D2-01: 순수 selection policy

- category: unit
- destination: `packages/core/entitlement.test.mjs` 또는 proposed colocated policy test
- verifies: REQ-IPA-004, REQ-IPA-005, REQ-IPA-006
- setup/fixture: user selection/activity/sync/create timestamp의 모든 우선순위·null·tie 조합
- expected observation: current available 후보만 안정 정렬되고 downgrade만 trim하며 upgrade는 집합을 바꾸지 않는다.
- state: Planned
- evidence: Not executed — document-only task

### VFY-IPA-D2-02: plan과 selection transaction

- category: integration
- destination: proposed `src/server/*availability*.test.ts`와 plan-change service test
- verifies: REQ-IPA-001, REQ-IPA-002, REQ-IPA-003, REQ-IPA-004, REQ-IPA-006, REQ-IPA-007, REQ-IPA-008, REQ-IPA-012, REQ-IPA-013
- setup/fixture: registration, sync success/failure, spare/full cap, invalid replacement, duplicate request, concurrent expectedVersion
- expected observation: 성공은 exact set·version·event를 한 번 commit하고 실패·stale는 zero-write다.
- state: Planned
- evidence: Not executed — document-only task

### VFY-IPA-D2-03: 웹·MCP permission matrix

- category: security
- destination: existing `src/server/mcp/*.test.mjs`, `src/server/{templates-query,runbook-query}.test.ts`, proposed guard/action tests
- verifies: REQ-IPA-009, REQ-IPA-010, REQ-IPA-011, REQ-IPA-016
- setup/fixture: owner/다른 사용자, available/not-selected, agent token/owner token, token revoke와 열린 run
- expected observation: 웹 read와 project_get만 남고 허용 예외 외 mutation은 같은 사유로 거부되며 token/run rows는 보존된다.
- state: Planned
- evidence: Not executed — document-only task

### VFY-IPA-D2-04: 프로젝트 선택 UX

- category: end-to-end
- destination: manual browser protocol on `/projects` and `/p/[slug]` plus focused component tests where harness exists
- verifies: REQ-IPA-007, REQ-IPA-008, REQ-IPA-009, REQ-IPA-012, REQ-IPA-014
- setup/fixture: Free full, Pro spare/full, 열린 item/run, 두 browser sessions
- expected observation: 상태·count·basis가 보이고 올바른 confirm/replacement가 실행되며 stale 두 번째 요청은 목록을 바꾸지 않는다.
- state: Planned
- evidence: Not executed — document-only task

### VFY-IPA-D3-01: Member·legacy owner 제거 검사

- category: architecture
- destination: `npm run verify:fsd`, `npm run test:architecture`, repository `rg` audit
- verifies: REQ-IPA-015, REQ-IPA-016
- setup/fixture: final generated Prisma client
- expected observation: `ProjectMember`, `requireMember`, membership query와 DB `Project.owner` 참조가 없고 외부 `project.owner` adapter만 명시적으로 남는다.
- state: Planned
- evidence: Not executed — document-only task

### VFY-IPA-D3-02: 전체 회귀와 복구

- category: recovery
- destination: `npm test`, `npm run test:web`, `npm run test:templates`, `npm run check`, isolated DB restore/reconstruction rehearsal
- verifies: REQ-IPA-015, REQ-IPA-016
- setup/fixture: D2 snapshot과 final D3 schema
- expected observation: 전체 gate가 통과하고 backup 또는 ownerUserId/repoOwner를 이용한 legacy schema 복구가 재현된다.
- state: Planned
- evidence: Not executed — document-only task

## Verification Plan

각 Phase의 VFY 외에 구현 완료 전에 다음 repository gate를 실행한다.

```bash
npm run sync:plugin-lib
npm test
npm run test:web
npm run test:templates
npm run check
npm run verify:fsd
npm run test:architecture
```

성공 기준:

- 명령이 모두 exit 0이다.
- generated Prisma client가 목표 schema와 일치한다.
- 새 failure는 해당 VFY와 REQ에 연결해 신규/기존을 구분한다.
- 수동 시나리오는 사용 가능 set, 선택 원장, MCP 거부, cursor 보존을 DB 증거와 함께 기록한다.

## Verification Results

| 명령 또는 검토 | 결과 | 비고 |
| --- | --- | --- |
| SDD traceability validator | PASS (standard) | canonical ID·관계·REQ coverage 통과 |
| strict traceability diagnostic | PASS | 승인 전 문서이므로 readiness 근거가 아닌 추가 구조 진단으로만 실행 |
| semantic review checklist | PASS with recorded gates | HIGH-RISK lifecycle·permission·migration·rollback 검토; BLK와 stop condition은 유지 |
| 구현 test/build/migration 명령 | Not run yet | 문서 작성만 승인됨 |
| live DB preflight | Not run yet | BLK-IPA-D1-01; 구현 전 대상 환경에서 필요 |

## Allowed / Forbidden Files

### Allowed after Phase approval

- 위 Affected Files 표의 bounded schema, core, server, FSD, route, test, script와 current-contract 문서.
- `src/generated/prisma`는 Prisma command가 생성하며 직접 수정하지 않는다.
- private template 원본은 BLK-IPA-D2-01 확인 결과 필요한 문구에 한정한다.

### Forbidden

- Business/Organization/Member 기능 또는 좌석 과금 구현.
- Free·Pro·Max 수치 변경과 결제 UI.
- `harness.json project.owner`의 breaking rename.
- 프로젝트 삭제, token 자동 revoke, run 자동 close.
- TanStack Query·전역 store·실시간 전송 도입.
- 사용자 소유의 관련 없는 working-tree 변경.

## Rollout, Observability, and Recovery

### Rollout

1. D1 additive migration과 backfill을 isolated DB에서 rehearsal한다.
2. legacy read 경로를 유지한 채 새 shadow data의 owner·available 결과를 비교한다.
3. D2에서 runtime과 UI를 함께 cutover하고 `ProjectMember`는 rollback shadow로 유지한다.
4. selection stale, unavailable 거부, plan-change event와 owner mismatch를 기존 서버 로그에서
   식별 가능한 문구로 남긴다. 새 monitoring SDK는 추가하지 않는다.
5. D2 회귀·수동 시나리오와 shadow 일치가 승인된 뒤에만 D3를 실행한다.

### Rollback

- D1: 새 열·table은 nullable/additive 상태로 남겨도 기존 runtime에 영향이 없다. code를 되돌리고
  legacy relation을 계속 사용한다.
- D2: legacy `ProjectMember`와 owner shadow가 유지되는 동안 runtime을 이전 판정으로 되돌릴 수 있다.
  D2 동안 생성한 프로젝트는 dual-write로 legacy owner row도 가져야 한다.
- D3: 단순 code revert 금지. 실행 직전 backup으로 복구하거나 `ownerUserId`와 `repoOwner` snapshot으로
  legacy ProjectMember owner 행과 owner 열을 재구성한 뒤 이전 code를 배포한다.

Rollback 검증은 owner별 프로젝트 목록, 프로젝트 token 수, AgentRun/PipelineRun 수, 웹 owner access와
MCP project_get 결과를 D3 전 snapshot과 비교한다.

## Completion Conditions

- 모든 REQ·INV·CON의 completion owner가 Phase map과 일치한다.
- current architecture 문서와 runtime이 Member 제거, direct ownership, Available/Not selected 계약으로
  같은 내용을 말한다.
- plan 변경과 선택 action이 exact set·version·event를 원자적으로 쓴다.
- 기존 데이터와 연결·token·run이 migration 및 selection 전후 보존된다.
- D3가 끝날 때 repository와 DB에 현재 도메인의 ProjectMember가 남지 않는다.
- Business membership은 구현되지 않고 후속 독립 설계로 남는다.

## Stop Conditions

- owner가 정확히 하나가 아니거나 일반 ProjectMember가 존재한다.
- plan change와 selection set/event를 한 transaction으로 묶을 수 없는 구현이 제안된다.
- UI가 확인한 replacement와 server가 제외할 project가 달라질 수 있다.
- 선택되지 않은 프로젝트의 token·run을 삭제·종료하는 방향으로 범위가 바뀐다.
- 외부 `harness.json project.owner` rename 또는 Business 모델이 현재 Phase에 들어온다.
- D3 rollback rehearsal·backup evidence가 없다.
- 관련 사용자 변경과 proposal 범위가 겹쳐 안전하게 보존할 수 없다.

## Approval

승인 메모:

- 승인 전. 승인 범위는 Phase별로 분리한다. 전체 SDD 승인은 D1 실행만 자동 승인하지 않으며,
  각 Phase의 entry evidence와 상세 plan을 별도로 승인해야 한다.

## Execution Plan

1. Phase D1 상세 plan과 migration preflight를 작성하고 승인받는다.
2. D1 additive schema·backfill·rehearsal을 수행하고 기존 runtime 불변을 증명한다.
3. Phase D2 상세 plan을 현재 D1 schema와 private template 확인 결과에 맞춰 작성·승인한다.
4. D2 중앙 policy·plan service·selection action·UI·계약 문서를 함께 cutover하고 회귀를 관측한다.
5. Phase D3 상세 plan과 recovery rehearsal을 승인받는다.
6. `ProjectMember`와 legacy owner storage를 제거하고 전체 gate·복구 검증을 수행한다.

## Risks and Rollback

잔여 리스크:

- 과거 `project_sync` 시각은 복원할 수 없다. 기존 행은 AgentRun 활동, 없으면 최근 등록 시각으로
  fallback한다.
- `AgentRun.closedAt = null`은 로컬 프로세스 생존을 보장하지 않는다. 경고는 열린 cursor라는 사실만
  말하고 현재 실행 중이라고 단정하지 않는다.
- D2 cutover 직전에 통과한 in-flight mutation 하나는 selection 변경 뒤 완료될 수 있다. 제품 문구와
  requirement가 이를 명시한다.
- private template 원본의 관련 문구는 별도 저장소 확인 전까지 D2 blocker다.
- 최종 Member drop은 복구 rehearsal과 backup 없이는 실행할 수 없다.

롤백 방법은 위 Rollout, Observability, and Recovery 절을 따른다. Phase별 rollback evidence가 없으면
다음 Phase로 진행하지 않는다.

## Result Format

각 Phase 구현 결과는 다음을 보고한다.

- 변경 파일과 migration 목록.
- TASK/REQ별 구현 요약과 VFY별 실행 command·결과.
- owner/project/token/run row count 비교와 selection event 예시(식별자는 마스킹).
- 기존 실패와 신규 실패의 구분.
- 계획과 달라진 사항, 남은 blocker와 rollback 가능 상태.
- 현재 branch/commit과 보존한 사용자 변경.

## Execution Evidence

| Evidence ID | State | Command/review | Revision/environment | Outcome | Verifier | Verifies |
| --- | --- | --- | --- | --- | --- | --- |
| EV-IPA-SDD-01 | Executed | `python3 /Users/hamsangeok/.codex/skills/write-sdd-spec/scripts/validate_sdd_traceability.py docs/proposals/active/individual-project-availability.md` | `dev@0eef5cb`, 2026-09-12 | PASS; REQ phase/task·verifier coverage 16/16 | SDD structure | canonical ID graph |
| EV-IPA-SDD-02 | Executed | semantic review checklist | `dev@0eef5cb`, 2026-09-12 | PASS with three explicit implementation gates; unresolved product decision 없음 | SDD semantics | HIGH-RISK design |
| EV-IPA-SDD-03 | Executed | traceability validator `--strict` diagnostic | `dev@0eef5cb`, 2026-09-12 | PASS; awaiting-approval 문서의 readiness 근거로 사용하지 않음 | SDD structure diagnostic | canonical ID graph |
| EV-IPA-D1-01 | Not executed | live DB ownership preflight | target DB unresolved | implementation authority 없음 | VFY-IPA-D1-01 | REQ-IPA-015, REQ-IPA-016 |

## Next Phase Approval Gate

이 문서는 전체 설계를 정의하지만 구현을 승인하지 않는다. Phase D1을 시작하려면 이 proposal의
front matter를 승인 상태로 바꾸는 것만으로 끝내지 않고, 대상 DB preflight 결과, additive migration
SQL, backfill/rollback rehearsal과 D1 상세 plan을 함께 검토해 명시적으로 승인해야 한다. D1 완료가 D2
또는 D3의 자동 시작 권한이 되지 않는다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: Business/Organization/member model은 별도 SDD

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] front matter와 active/pending/awaiting-approval 상태가 proposal 규칙과 일치한다.
- [x] `proposal-size`는 migration·인가·5개 이상 파일 변경 때문에 standard다.
- [x] intent, 현재 코드, architecture contract의 충돌을 분리했다.
- [x] observable requirement와 domain invariant, engineering constraint를 구분했다.
- [x] 권한, 동시성, in-flight 요청, retry/idempotency, 재연결과 보존 lifecycle을 다뤘다.
- [x] additive rollout, destructive cleanup, backup과 rollback stop condition을 분리했다.
- [x] REQ→Phase→VFY 추적과 planned/not-executed evidence를 구분했다.
- [x] Business, 결제, 삭제, pause, client cache와 외부 config rename을 제외했다.
- [x] 문서 작성 범위에서 구현·live DB·test 결과를 통과했다고 주장하지 않았다.
- [ ] Phase D1 실행 승인 — 아직 승인 전이다.
- [ ] 구현 완료 항목 — 아직 pending이다.
