---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-02"
approved-by: "user"
approved-at: "2026-10-02"
approval-scope: "COPY·USAGE 전체 코드 구현, 검증, commit 및 dev 대상 PR 작성. 운영 DB 변경·배포·병합 제외."
completed-at: "2026-10-02"
verification-summary: "COPY·USAGE 구현 완료. FSD·architecture·check·core 188·web 518·server 32·격리 PostgreSQL 통합·production build 및 실제 앱 브라우저 인수 통과. 운영 migration·배포·병합은 별도 작업."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "../../conventions/product-copy.md"
  - "../../architecture/fsd.md"
  - "../../architecture/protocol.md"
  - "../../architecture/verification.md"
---

# 토큰 이름·재사용 안내·사용 기록 개선

## Summary

토큰을 여러 개 발급하고 개별 폐기하는 구조를 유지하면서, 사용자가 이름의 의미를 이해하고 기존 토큰을 재사용하며 사용 기록을 보고 정리할 수 있도록 개선한다. 사용자 피드백의 1번(`Label` 설명), 2번(새 터미널과 새 토큰의 구분), 3번(`Last used`와 미사용 표시)을 대상으로 한다.

프로젝트·소유자·사용자 토큰 화면의 안내를 일관되게 정리하고, 기존 인증 경계에 사용 시각 기록을 추가한다. 만료일 강제, 자동 폐기, 토큰 교체 기능, 호출량 제한 변경은 이번 구현에 포함하지 않는다.

## Goal

- 이름을 보고 토큰의 용도를 구분하고, 이름이 권한이나 기기 바인딩을 결정하지 않는다는 사실을 이해한다.
- 터미널을 다시 열었을 때 환경변수가 사라지는 것과 인증 토큰의 유효성을 구분한다.
- 토큰 목록에서 최근 사용, 추적 이후 기록 없음, 과거 기록을 알 수 없는 상태를 구분한다.
- 기존 토큰의 인증·인가·폐기와 평문 1회 노출 규약을 유지한다.

## Proposal Size / 기준 상태

- SDD 크기 분류: `STANDARD`. 여러 화면, 인증 경계의 부가 기록, 세 토큰 테이블의 추가 migration이 필요하다. 이번 reconciliation의 검토 profile은 인증·DB migration·generated client를 포함하므로 **High-Risk**다. 두 분류는 목적이 다르다.
- 기준 저장소: `stagekeeper`.
- 조사일: 2026-10-02.
- 기준 커밋: `03876dd24fab12c63542b4565f087b79a877f7ef`.
- 최초 작성 브랜치: `harness/token-management-ux`; 원격 `dev`의 실재 여부를 확인하고 `git fetch origin dev` 후 `origin/dev`에서 생성했다.
- 구현 브랜치: `harness/account-usage-token-management`. 위 기준 커밋에서 구현했다. PR 생성 후 `dev`가 `6c363d0fa364c0456491bba6f56ac7cc21a3f4df`로 전진하여 별도 `harness/token-management-ux-pr-sync` worktree에서 통합했다. 공유 작업 폴더에 새로 생긴 account usage 작업은 그대로 보존했다.
- 현재 실행 범위는 front matter의 승인 기록을 따른다. 소스 구현·격리 DB 검증·commit·dev PR이 대상이며 운영 DB·배포·병합은 수행하지 않는다.
- 기존 미추적 문서 `account-usage-and-token-management.md`, `local-watch-executor.md`, `non-behavioral-comment-cleanup.md`는 사용자 작업으로 보존하며 이 제안서의 변경 범위에서 제외한다.
- 현재 architecture의 source of truth는 [architecture/README.md](../../architecture/README.md)와 관련 문서다. 이 제안서의 미래 설계가 현재 계약을 자동으로 대체하지 않는다.

## Current State / 구현 전 계약 대조

| 항목 | 확인한 사실과 근거 | 분류 | 변경 영향 |
| --- | --- | --- | --- |
| 발급 이름 | `NewTokenForm`, `NewOwnerTokenForm`, `NewUserTokenForm`은 `Label`과 placeholder만 표시한다. | Observed | 이름의 목적을 설명하는 hint와 `Token name` 표기가 필요하다. |
| 이름 저장 | `project-token-service.ts`와 `manage-user-token.server.ts`는 공백을 trim하고 빈 값에 기본 이름을 넣는다. 이름은 토큰 생성 입력이나 권한 판정에 사용되지 않는다. | Observed | DB 열 이름 `label`, 빈 값의 기본값, 중복 이름 허용은 유지한다. |
| 토큰 수명 | `ProjectToken`, `OwnerToken`, `UserToken`에는 `revokedAt`이 있고 만료 열은 없다. MCP/REST 검증기는 폐기 여부를 확인한다. | Observed | 현재 토큰은 폐기 전까지 유효하다고 안내한다. 재시작으로 자동 만료된다고 설명하지 않는다. |
| 새 터미널 안내 | `TokenReveal`은 새 터미널에 토큰이 없으면 다른 토큰을 발급하거나 사용자 토큰을 쓰도록 안내한다. | Observed | 저장해 둔 기존 토큰을 다시 설정할 수 있다는 안내가 빠져 있다. |
| 문구 계약 | [product-copy.md §9](../../conventions/product-copy.md)는 위 문구를 잠그며, `token-reveal.test.ts`는 프로젝트 토큰 화면의 `you don't need a new token` 문장을 금지한다. | Contracted | 의도한 계약 변경이다. 문구 원본·화면·회귀 검증을 같은 작업에서 갱신한다. |
| 플러그인 안내 | `plugin/skills/init/SKILL.md`는 프로젝트 토큰을 머신 전역에 저장하지 말고 같은 터미널에서 재시작하라고 안내한다. | Observed / Contracted | 저장해 둔 값을 새 터미널에 다시 넣는 방법을 설명하되, 전역 저장 금지·값을 대화에 넣지 않는 규칙은 유지한다. |
| 현재 목록 | 프로젝트 및 계정 토큰 route는 `id`, `label`, `createdAt`, `revokedAt`만 읽는다. 목록은 발급일 내림차순이다. | Observed | 사용 기록을 select와 page props에 추가한다. 정렬·폐기 상태는 유지한다. |
| 마지막 사용 | 세 토큰 테이블에는 `lastUsedAt`이나 추적 시작 정보가 없다. | Observed | 과거 사용 여부를 복원할 근거가 없어 migration 이전 토큰을 `Never used`로 단정할 수 없다. |
| 인증 경로 | MCP 두 검증기 외에 `resolveRestScope`와 `resolveUserScope`를 쓰는 REST 경로가 있다. | Observed | MCP에만 기록을 붙이면 init에서만 사용된 토큰을 놓친다. 아래 경로 전체를 다룬다. |
| 기록 ID | 에이전트 이벤트의 `token:<id>`, 단계 원장의 호출 토큰 ID는 이미 존재한다. | Observed | 이 원장을 임의로 합산하거나 토큰 평문을 복원하지 않는다. 신규 인증 기록만 기준으로 삼는다. |

위 표는 기준 커밋의 구현 전 관찰이다. 이후 실제 구현과 격리 DB·브라우저 인수 결과는 아래 Verification Results에 별도로 기록한다.

## Scope

### 포함

- `/p/[slug]/tokens`의 프로젝트 토큰·소유자 토큰과 `/settings/tokens`의 사용자 토큰에 동일한 이름 설명 원칙 적용.
- 발급 전 토큰 종류의 범위 안내와 발급 후 재사용·보관·분실 시 대처 안내.
- 프로젝트 생성 후에도 사용되는 공용 `TokenReveal`에 같은 안내 적용.
- 세 종류의 인증 토큰에 사용 기록 저장, 목록 표시, 구버전 데이터 호환.
- product-copy 잠금, 폐기 문구 회귀 검사, 관련 단위·통합·브라우저 검증.

### 제외

- 앞선 피드백의 4번인 토큰별·프로젝트별·계정별 호출량 제한 변경.
- `expiresAt`, 강제 만료일, 자동 폐기, 자동 교체, 토큰 개수 상한.
- 이름 필수화, 이름 중복 금지, 기존 토큰 이름 수정 기능.
- 토큰의 기기 바인딩, 새로운 권한 scope, 토큰 종류 통합.
- 토큰 평문의 서버 재표시, 브라우저 저장소 보관, 자동 비밀 저장, IP·기기·위치 수집.
- private 템플릿 본문이나 에이전트 실행 절차 변경. 공개 init 스킬의 연결 안내 수정만 허용한다.

## Behavioral Requirements

### REQ-TOKENUX-001: 토큰 이름의 의미 표시

WHEN 사용자가 세 종류 중 하나의 토큰 발급 폼을 볼 때, the system shall 입력 label을 `Token name`으로 표시하고 기기나 용도를 적는 관리용 이름이라는 hint를 함께 표시한다.

프로젝트·사용자 토큰의 예시는 `personal laptop`, `CI`; 소유자 토큰의 예시는 `my laptop session`이다. 사용자에게 보이는 표의 이름 열도 `Token name`으로 맞춘다. 내부 field 이름과 저장 열은 `label`을 유지한다.

### REQ-TOKENUX-002: 발급 전 토큰 범위 안내

WHEN 사용자가 토큰 발급 화면을 볼 때, the system shall 해당 토큰의 접근 범위와 여러 토큰을 개별 폐기할 수 있다는 사실을 발급 버튼 이전에 설명한다.

프로젝트 화면은 특정 프로젝트용 토큰과 계정 토큰 페이지의 차이를 설명하고 `/settings/tokens`로 연결한다. 소유자 토큰은 게이트 승인용이라는 기존 설명을 유지한다. 사용자 토큰은 자신의 여러 프로젝트에 사용할 수 있지만 게이트 승인용 소유자 토큰을 대체하지 않는다고 설명한다.

### REQ-TOKENUX-003: 토큰 재사용과 환경변수 수명 구분

WHEN 사용자가 발급 후 연결 안내를 볼 때, the system shall 토큰은 폐기 전까지 유효하고 터미널의 환경변수 수명과 별개라는 사실을 설명한다.

`hs_`와 `ho_`는 새 터미널에서 안전하게 보관한 기존 값을 다시 설정하면 재사용할 수 있다. `hu_`는 이미 안내하는 머신 단위 저장으로 새 터미널에서도 사용할 수 있다. 이 안내는 토큰의 머신 전역 자동 저장이나 재발급을 실행하지 않는다.

### REQ-TOKENUX-004: 안전한 보관과 분실 시 대처 안내

WHEN 사용자가 토큰 평문을 처음 볼 때, the system shall 평문은 다시 표시되지 않으므로 재사용할 값은 사용자가 안전한 비밀 보관 장소에 보관하고 대화·Git·저장소 `.env`에 넣지 않도록 안내한다.

IF 사용자가 기존 값을 보관하지 않아 재사용할 수 없다면, THEN the system shall 새 토큰을 발급하고 사용하지 않는 이전 토큰을 폐기하도록 설명한다. 새 발급 자체가 이전 토큰을 폐기한다고 안내하지 않는다.

### REQ-TOKENUX-005: 인증 시 마지막 사용 기록

WHEN 서버가 토큰의 형식·등록·미폐기 상태를 확인하여 인증 자격으로 받아들일 때, the system shall 해당 토큰의 내부 ID로 사용 기록을 시도한다. 최초 기록과 60초 갱신 조건은 아래 원자적 기록 규칙을 따르며, 저장 실패는 REQ-TOKENUX-008을 따른다.

기록 대상은 아래 인증 경로 표 전체다. 요청 body 오류, 프로젝트 인가 거부, 플랜 제한, 도구 실패는 이후 단계의 결과이며 이미 받아들인 인증 자격의 사용 기록을 취소하지 않는다. 사용 시각은 작업 완료 시각이나 에이전트 실행 횟수를 뜻하지 않는다.

`hu_`가 유효하지만 프로젝트 slug가 없어 `PROJECT_REQUIRED`로 401을 받는 경우도 기록한다. HTTP 상태 코드만으로 credential 검증 실패 여부를 판단하지 않는다. MCP는 검증기를 호출하는 GET/POST HTTP 요청마다 기록을 시도하며 도구별 호출 횟수나 SSE 메시지마다 기록하는 기능은 추가하지 않는다.

### REQ-TOKENUX-006: 인증 실패와 화면 조회의 분리

IF 토큰이 누락·형식 오류·미등록·폐기 또는 다른 종류의 endpoint용이라 인증에 실패한다면, THEN the system shall 그 요청으로 토큰 사용 시각을 갱신하지 않는다.

WHEN 사용자가 웹에서 토큰을 발급·조회·복사·폐기할 때, the system shall 그 행위만으로 마지막 인증 사용 시각을 변경하지 않는다.

### REQ-TOKENUX-007: 목록의 사용 상태 표시

WHEN 사용자가 프로젝트 또는 계정 토큰 목록을 볼 때, the system shall `Last used` 열에 아래 규칙에 따른 사용 기록을 표시한다.

| 저장 상태 | 표시 | 의미 |
| --- | --- | --- |
| `lastUsedAt` 존재 | `YYYY-MM-DD HH:mm UTC` | 마지막으로 기록된 인증 시각. `utcMinute`의 반환값에 ` UTC`를 붙인다(기존 함수는 timezone 접미사 없이 반환). |
| `lastUsedAt = null`, `usageTrackingStartedAt` 존재 | `Never used` | 추적 시작 이후 기록된 인증 사용이 없음. 실제 사용 부재를 보증하는 보안 판정이 아니다. |
| 두 값 모두 `null` | `Unknown` | 이 토큰의 추적 시작 전 사용 기록을 알 수 없음. |

목록에 `Usage reflects recorded authentication, not task completion.` 설명을 둔다. `Never used`의 보조 설명은 `No authentication use recorded since tracking began.`이고, `Unknown`은 `Usage before tracking began is unavailable.`로 설명한다. 실패나 지연으로 기록이 누락될 수 있는 부가 정보이므로 자동 폐기의 근거로 사용하지 않는다.

폐기된 토큰에도 기존 사용 기록을 보여 주며 `Status`는 계속 폐기 상태를 나타낸다. 빈 목록의 `colSpan`, 좁은 화면의 표 레이아웃, 스크린리더용 열 이름을 함께 갱신한다. 자동 polling은 추가하지 않는다. HTTP 재조회·브라우저 새로고침·`router.refresh()`로 새 Server Component 응답을 받은 때 최신 저장값을 보여 준다. 이미 열어 둔 탭과 뒤로 가기의 Client Cache에 즉시 전파되는 것으로 설명하지 않는다.

### REQ-TOKENUX-008: 부가 기록 실패 시 기존 처리 유지

IF 사용 기록 저장이 실패한다면, THEN the system shall 기록 실패만으로 유효한 토큰의 인증이나 기존 요청 결과를 실패시키지 않고 서버에 비밀값 없는 진단을 남긴다.

이 요구사항은 인증을 위한 최초 DB 조회 실패를 허용으로 바꾸는 규칙이 아니다. 기록 실패는 부가 기록 단계에만 적용한다. 진단에는 토큰 평문·해시·Authorization header·원시 DB 오류를 넣지 않는다.

### REQ-TOKENUX-009: 동시 사용과 폐기 처리

WHEN 같은 토큰의 인증 요청이 동시에 기록될 때, the system shall 더 오래된 요청이 저장된 사용 시각을 과거로 되돌리지 않게 한다.

WHILE 토큰이 폐기 상태일 때, the system shall 사용 기록 갱신으로 해당 토큰을 재활성화하거나 폐기 이후 사용 기록을 새로 쓰지 않는다. 폐기와 경합한 이미 인증된 요청의 완료 허용 여부는 기존 정책을 유지한다.

## Domain Invariants

### INV-TOKENUX-001: 이름은 표시용 메타데이터다

`label`은 인증값, 사용자 정체, 권한, 특정 기기의 증거가 아니다. 이름이 같아도 서로 다른 토큰이며 개별 폐기한다.

### INV-TOKENUX-002: 평문 노출·저장 규약 유지

평문은 발급 응답에서만 노출하고 서버에는 해시만 저장한다. 연결 설정에는 환경변수 참조를 남기며 사용 기록에도 비밀값을 넣지 않는다.

### INV-TOKENUX-003: 토큰 종류와 소유권 경계 유지

`hs_`는 프로젝트의 agent 자격, `ho_`는 프로젝트와 발급 사용자에 묶인 승인 자격, `hu_`는 호출마다 프로젝트 소유권을 확인하는 사용자 agent 자격이다. 형식·endpoint·인가·플랜·폐기 판정을 바꾸지 않는다.

### INV-TOKENUX-004: 과거 기록을 만들어 내지 않는다

migration 이전 토큰의 사용 시각을 `createdAt`이나 원장 추정값으로 채우지 않는다. 기록되지 않은 과거 사용을 `Never used`로 표현하지 않는다.

### INV-TOKENUX-005: 여러 토큰과 수명 유지

새 토큰 발급은 다른 토큰을 만료·폐기하지 않는다. 재시작은 토큰 만료가 아니다. 사용 기록으로 자동 폐기하거나 사용 가능한 프로젝트를 변경하지 않는다.

## Engineering Constraints

### CON-TOKENUX-001: 아키텍처와 문구 계약

`src/app`은 composition, 제품 UI는 기존 FSD slice, DB 기록은 `src/server`에 둔다. slice 간 import는 public API로 한다. 인증 판정의 주입 가능한 구조를 유지하고 read 함수에 기록 부작용을 숨기지 않는다. 변경할 문구는 `product-copy.md`와 화면·잠금 검증을 같은 커밋에서 갱신한다.

### CON-TOKENUX-002: 추가 migration과 배포 순서

기존 migration을 수정하지 않고 추가 nullable 열로 확장한다. 새 열을 읽는 코드보다 DB 확장을 먼저 적용한다. 추적 시작 표식은 새 코드가 명시적으로 저장하며 DB 기본값으로 기존 행이나 구버전 writer에 추적 완료를 주장하지 않는다.

### CON-TOKENUX-003: 검증과 작업 범위

구현 시 root `AGENTS.md`, 해당 architecture 문서와 설치된 Next.js 관련 가이드를 다시 읽는다. 기존 사용자 변경을 보존한다. `dev` 대상 PR과 `check` green 규칙을 따르며 운영 DB·배포는 구현 검증을 대신하는 수단으로 사용하지 않는다.

## Proposal / Technical Design

### 1. 화면 문구

UI는 현재 제품 언어인 영어를 유지한다. 다음 문구를 `product-copy.md §9`에 반영하고 실제 화면에 연결한다.

| 자리 | 제안 문구 |
| --- | --- |
| 발급 이름 | `Token name` |
| 이름 hint | `Name the device or purpose so you can recognize this token later.` |
| 여러 토큰 안내 | `Create separate tokens for different devices or uses. You can revoke each one independently.` |
| 프로젝트 범위 | `A project token connects agents to this project. For your own machine across multiple projects, use a user token.` — `user token`은 `/settings/tokens` 링크 |
| 수명 | `This token stays valid until you revoke it. Restarting a terminal or Claude Code does not expire it.` |
| 프로젝트 재사용 | `This environment variable lasts only in this terminal. In a new terminal, set the same token again from your secure storage before starting Claude Code.` |
| 보관 | `Save the token in a secure secret store if you want to reuse it. Do not paste it into a chat or commit it to your repository.` |
| 분실 | `If you did not save the token, issue a new one and revoke the old token when you no longer use it.` |

소유자 토큰도 같은 보관·재사용 원칙을 적용하되 변수는 `HARNESS_OWNER_TOKEN`, 연결은 owner 서버다. 사용자 토큰의 머신 단위 저장 설명과 평문 저장 위치의 기존 고지는 유지한다. 프로젝트 토큰을 머신 전역에 저장하거나 `.env`를 읽으라고 안내하지 않는다.

`token-reveal.test.ts`의 기존 blanket 부정 단언은 제거하거나 수정하고, 프로젝트 토큰의 전역 저장 안내가 새로 섞이지 않는다는 검증을 유지한다. `scripts/retired-copy.test.mjs`에는 현재 `token-reveal.tsx`의 새 터미널 재발급 유도 문장 전체를 기준으로 좁은 패턴을 추가한다. 허용된 새 재사용·분실 문장까지 금지하는 `issue a new token` 같은 일반 패턴은 쓰지 않는다. `where`는 `web`, `skill`, `locks`로 하고 기존 `shownText` 정규화 후 옛 문장 부재·새 문장 존재를 함께 확인한다. 잠금 ID `token-reveal-shared`, `token-reveal-project`, `token-reveal-user`, `owner-token-reveal`는 유지한다.

`plugin/skills/init/SKILL.md`와 `product-copy.md §15`의 연결 안내도 같은 원칙으로 갱신한다. protocol의 별도 플러그인 배포 단위에 따라 `plugin/.claude-plugin/plugin.json`의 현재 `0.3.6`에서 patch version을 올린다(현재 기준 `0.3.7`; 구현 시 다른 변경이 먼저 올렸으면 그 다음 patch). marketplace의 `source: "./plugin"`은 유지하며 이번 작업에 plugin 게시·private Template 재게시를 포함하지 않는다.

### 2. 데이터 모델과 기록 의미

`ProjectToken`, `OwnerToken`, `UserToken`에 다음 두 열을 추가한다.

| 열 | 제안 타입 | 초기값과 용도 |
| --- | --- | --- |
| `lastUsedAt` | `DateTime?` | 기존·신규 모두 `null`; 인증 사용 기록만 저장 |
| `usageTrackingStartedAt` | `DateTime?` | 기존 행은 `null`; 추적이 활성화된 신규 발급은 서버 시각을 명시적으로 저장 |

두 열 모두 DB 기본값 없이 nullable로 추가한다. 초기 프로젝트 토큰을 만드는 `project-registration-query.ts`, 프로젝트·소유자 토큰을 만드는 `project-token-service.ts`, 사용자 토큰을 만드는 `manage-user-token.server.ts`에서 표식을 설정한다. 초기 프로젝트 토큰은 `initialTokenHash`가 있는 웹 생성의 nested `tokens.create`에만 표식을 넣는다. 이미 존재하는 프로젝트 조회, 등록 실패·한도 초과·해제 상태와 `hu_`로 하는 REST 프로젝트 등록에서는 새 `hs_`를 만들지 않는다. 기존 토큰은 첫 기록 후 실제 `lastUsedAt`을 표시할 수 있으므로 추적 시작값을 추정해 backfill하지 않는다.

갱신은 서버가 캡처한 UTC 시각으로 한다. 첫 기록은 즉시 쓰고, 이후 동일 토큰은 저장된 시각에서 60초 이상 지난 인증에서 갱신한다. `Last used`는 최대 분 단위로 갱신되는 기록이며 모든 요청의 정밀 감사 로그가 아니다. UI 정밀도도 UTC 분으로 맞춘다.

DB에서는 `id` 일치, `revokedAt IS NULL`, `lastUsedAt IS NULL OR lastUsedAt <= 요청시각 - 60초` 조건을 가진 원자적 갱신을 사용한다. 최초 조회값에만 의존한 read-then-write나 process-local throttle은 사용하지 않는다. 오래된 요청이 뒤늦게 도착하거나 인스턴스가 여럿이어도 시각이 역행하지 않게 검증한다. 이 작업에서 불필요한 검색용 index는 추가하지 않는다.

### 3. 인증 경로와 기록 책임

| 요청 경로 | 인증 경계 | 토큰 종류 | production 연결 지점 |
| --- | --- | --- | --- |
| `GET/POST /api/mcp` | `makeVerifyToken` | `hs_`, `hu_` | `src/server/mcp/deps.ts` |
| `GET/POST /api/mcp/owner` | `makeVerifyOwnerToken` | `ho_` | `src/server/mcp/owner-deps.ts` |
| `GET /api/templates` | `resolveRestScope` | `hs_`, `hu_` | `src/server/templates.ts` |
| `GET /api/project` | `resolveRestScope` | `hs_`, `hu_` | `src/server/project-identity.ts` |
| `POST /api/runbook` | `resolveRestScope` | `hs_`, `hu_` | `src/server/runbook.ts` |
| `POST /api/projects` | `resolveUserScope` | `hu_` | `src/server/project-registration.ts` |

기록 쿼리와 production 연결을 분리하여 일반 `test:web`이 `server-only` 또는 DB singleton을 가져오지 않게 한다.

| 신규 symbol / 계약 | 소유·import 목적지 | 검증 목적지 |
| --- | --- | --- |
| `TokenUsageRecorder = (kind: "agent" \| "owner" \| "user", tokenId: string, at: Date) => Promise<void>` | `src/server/token-usage-query.ts`; auth와 REST가 type import | `src/server/token-usage-query.test.ts`, `src/server/mcp/auth.test.mjs`, `src/server/rest-scope.test.ts` |
| `makeRecordTokenUsage(db)` | 같은 query module. Prisma delegate를 주입받아 종류별 `updateMany` 실행; runtime DB import 없음 | query 단위 시험과 실제 DB integration |
| `tryRecordTokenUsage(recorder, kind, tokenId, at)` | 같은 query module. recorder가 있으면 await하고 이 호출의 오류만 처리; auth와 REST가 직접 import | 실패·진단 회귀 시험 |
| `recordTokenUsage` | 신규 `src/server/token-usage.ts`의 `server-only` production binder. `prisma`와 `makeRecordTokenUsage` 조합 | `tests/server/token-usage-bindings.test.ts` |
| `TokenUsage` | 신규 `src/fsd/entities/project-token/ui/token-usage.tsx`, 기존 `index.ts`에서 export. 두 page는 `@/fsd/entities/project-token`으로 import | entity markup·page render 시험 |

인증 함수의 기존 인자 순서를 유지한다. `makeVerifyToken(findByHash, findUserByHash?, recordUsage?)`, `makeVerifyOwnerToken(findByHash, recordUsage?)`, `resolveUserScope(findUserByHash, authorizationHeader, recordUsage?)`로 recorder를 추가하고 `RestTokenDeps.recordTokenUsage?`에도 같은 타입을 쓴다. 생략은 기존 순수 시험의 명시적 구성에만 허용하며 production 여섯 연결 지점은 모두 binder를 제공해야 한다.

credential 조회가 성공하고 `revokedAt`이 없는 것을 확인한 직후 서버 UTC 시각을 한 번 캡처한다. downstream scope/body/access/tool 검사 전에 `tryRecordTokenUsage`를 호출한다. REST agent row 타입과 세 production select에는 `id`가 필요하다. `findUserTokenByHash`는 **이미 `id`를 select**하므로 조회 동작을 바꾸지 않고 REST user row 타입·fixture만 맞춘다. 기존 REST JSON, MCP `AuthInfo`의 scopes/clientId/extra와 내부 token 전달은 유지한다. 조회 함수나 웹 목록 읽기에 기록 부작용을 넣지 않는다.

진단은 고정된 실패 메시지와 토큰 종류만 남긴다. 토큰 값·해시·header·원시 예외를 logger에 전달하지 않으며 진단 자체의 실패도 인증 결과를 바꾸지 않는다. 원래 credential DB 조회의 실패는 이 catch 범위 밖에 둔다. detached fire-and-forget·timer·queue·재시도는 추가하지 않는다.

await는 요청당 추가 DB 왕복과 대기 시간을 만든다. 원자적 60초 조건은 **행 변경 횟수**를 줄이며 query 횟수를 줄이지 않는다. 현재 `src/server/db.ts`에는 별도 pool/query timeout이 없으므로 이 제안은 추가 지연의 최대치나 DB 장애에서 즉시 응답하는 것을 보장하지 않는다. 이를 V-AUTH의 지연/rejection 시험과 V-DB의 잠금·응답 시간 측정에서 확인하고 배포 증거에 남긴다. 전역 DB timeout·별도 pool·운영 SLA 변경은 이번 범위에 추가하지 않는다.

웹 page는 두 새 열을 select해 props로 전달한다. `TokenUsage`는 두 nullable Date를 받아 UTC 분·`Never used`·`Unknown`과 접근 가능한 보조 설명을 렌더한다. `pages/user-tokens`가 다른 page 내부를 import하지 않는다. 기존 발급 Action의 `revalidatePath`는 유지한다. recorder는 Next 캐시 API를 호출하지 않는다. 현재 `next.config.ts`에는 `cacheComponents`가 없고 페이지에 데이터 캐시 wrapper가 없다. 목록은 새 서버 렌더에서 DB를 읽는다. `router.refresh()`는 발급 폼의 client state를 보존할 수 있으므로 이미 표시 중인 발급 평문을 반드시 지운다고 주장하지 않는다.

### 4. 기존 데이터·실패·재진입

| 상황 | 기대 처리 |
| --- | --- |
| 새 토큰 발급 직후 | 추적 시작값은 존재하고 `lastUsedAt`은 `null`; `Never used`의 기록 기준 설명 제공 |
| 기존 토큰을 아직 새 경로로 사용하지 않음 | `Unknown`; 과거 미사용으로 단정하지 않음 |
| init의 REST 조회만 사용 | 해당 토큰의 사용 기록 표시; MCP를 호출해야만 사용으로 보이는 문제 방지 |
| 유효한 `hu_`로 다른 사람의 프로젝트 지정 | 기존 인가 거부 유지; credential 자체가 사용된 기록은 남음 |
| 유효한 `hu_`로 slug 누락 | 기존 `PROJECT_REQUIRED` 401 유지; 사용 기록 시도는 먼저 수행 |
| 새 터미널에서 저장해 둔 같은 토큰 설정 | 같은 ID로 인증; 추가 토큰 발급·기존 폐기 없음 |
| 새 토큰을 추가 발급 | 이전 토큰과 새 토큰이 각각 유지되고 목록에 나타남 |
| recorder만 실패 | 기존 요청 처리 유지; 기록은 오래되거나 비어 있을 수 있고 비밀값 없는 진단 생성 |
| recorder 지연 | await 종료 후 기존 요청 처리; 60초 throttle로 추가 query나 대기가 없어지는 것은 아님 |
| 폐기·동시 인증 | 원자적 기록 조건으로 폐기 상태와 기존 사용 기록을 보호; 기존 요청 완료 정책 유지 |
| 새로고침·재진입 | 저장된 목록을 다시 조회; 평문을 복원하거나 자동 재발급하지 않음 |
| 뒤로 가기·이미 열어 둔 탭 | 즉시 최신화 보장 없음; 서버 재조회로 갱신하며 client state는 기존 수명 유지 |

## Affected Files

아래는 후속 구현의 허용 대상이며, 이번 문서 작성에서 실제 변경한 파일 목록이 아니다. 새 파일은 `신규 제안`으로 표시한다.

| 정확한 경로 | 계획 | 책임·위험 |
| --- | --- | --- |
| `docs/conventions/product-copy.md` §9·§15 | 수정 | 화면·공개 init 스킬 안내의 계약 갱신 |
| `docs/architecture/protocol.md` | 수정 | 토큰 사용 기록의 인증 기준·경로·갱신 해상도 기록 |
| `src/fsd/features/manage-token/ui/new-token-form.tsx`, `src/fsd/features/manage-token/ui/new-owner-token-form.tsx` | 수정 | 이름 hint; 발급 동작 유지 |
| `src/fsd/features/manage-user-token/ui/new-user-token-form.tsx` | 수정 | 계정 토큰 이름 hint |
| `src/fsd/entities/project-token/ui/token-reveal.tsx`, `src/fsd/entities/project-token/ui/owner-token-reveal.tsx`, `src/fsd/entities/project-token/ui/token-reveal.test.ts` | 수정 | 재사용·보관 문구와 잠금 검사 |
| `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx`, `src/fsd/pages/user-tokens/ui/user-tokens-page.tsx` | 수정 | 범위 안내·`Token name`·사용 상태 열·빈 상태 |
| `src/fsd/entities/project-token/ui/token-usage.tsx`, `src/fsd/entities/project-token/ui/token-usage.test.ts` | 신규 제안 | 새 열의 도메인 표시 및 회귀 검증 |
| `src/fsd/entities/project-token/index.ts` | 수정 | 필요한 표시 symbol만 공개 |
| `src/app/(app)/p/[slug]/tokens/page.tsx`, `src/app/(app)/settings/tokens/page.tsx` | 수정 | 권한을 유지한 새 열 select와 props 전달 |
| `prisma/schema.prisma` | 수정 | 세 토큰 테이블의 nullable 확장 |
| `prisma/migrations/20261002000000_token_usage_tracking/migration.sql` | 신규 제안 | 각 테이블 두 열만 추가; 현재 해당 폴더 없음 |
| `src/server/token-usage-query.ts`, `src/server/token-usage-query.test.ts`, `src/server/token-usage.ts` | 신규 제안 | 주입 쿼리·오류 격리와 server-only binder 분리 |
| `src/server/mcp/auth.ts`, `src/server/mcp/deps.ts`, `src/server/mcp/owner-deps.ts`, `src/server/mcp/auth.test.mjs` | 수정 | credential 인증 이후 recorder 주입 |
| `src/server/rest-scope.ts`, `src/server/rest-scope.test.ts` | 수정 | 내부 ID·recorder 타입과 인자; 외부 계약 보존 |
| `src/server/templates.ts`, `src/server/project-identity.ts`, `src/server/runbook.ts`, `src/server/project-registration.ts` | 수정 | REST production recorder 연결·agent ID select |
| `src/server/templates-query.test.ts`, `src/server/project-identity-query.test.ts`, `src/server/runbook-query.test.ts`, `src/server/harness-init.test.ts` | 수정 | agent/user fixture ID와 recorder; CLI→REST 회귀 |
| `src/server/project-token-service.ts`, `src/server/project-registration-query.ts`, `src/fsd/features/manage-user-token/api/manage-user-token.server.ts` | 수정 | 신규 발급 표식; 기존 사용자 잠금·폐기 scope 유지 |
| `src/server/project-token-service.test.ts`, `src/server/project-registration-query.test.ts` | 수정 | 발급 경로·초기 nested create 기대값과 no-write 검증 |
| `tests/server/project-registration.test.ts`, `tests/server/project-connection-bindings.test.ts`, `tests/server/integration/project-connection.test.ts` | 수정 | production import mock·REST ID fixture 호환; 기존 연결 해제/등록 회귀 보존 |
| `tests/server/token-usage-bindings.test.ts`, `tests/server/token-issuance-bindings.test.ts` | 신규 제안 | 실제 production 조합·두 웹 목록 route select·사용자 Action/초기 웹 발급 연결 검사 |
| `src/fsd/features/manage-token/ui/token-names.test.ts`, `src/fsd/features/manage-user-token/ui/token-name.test.ts`, `src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts`, `src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts` | 신규 제안 | slice 옆 실제 form/page markup·권한별 열과 문구 검증 |
| `tests/server/integration/token-usage.test.ts`, `tests/server/integration/token-usage-migration.test.ts` | 신규 제안 | 실제 DB 동시성·데이터 보존 검증 |
| `plugin/skills/init/SKILL.md`, `plugin/.claude-plugin/plugin.json`, `scripts/retired-copy.test.mjs` | 수정 | 공개 연결 안내·plugin version·폐기 문구 검증 |

신규 목적지는 위 목록으로 고정한다. 2026-10-02 preflight에서 기존 대상·신규 TS/TSX 파일의 부모 디렉터리는 존재하고 신규 파일·migration 폴더는 충돌하지 않았다. `prisma/migrations`는 존재하며 신규 날짜 폴더를 만든 뒤 SQL을 추가한다. 구현 직전에 재확인하며 날짜 충돌 시 migration 디렉터리 이름과 V-DB의 참조를 함께 갱신한다. 임의의 추가 `*.test.ts`나 다른 proposal 편집을 허용 목록에 포함하지 않는다.

아래는 **읽기·보존 대상**이며 계획된 변경이 아니다. 현재 입력·소비자·검증 실행기까지 대조하는 데 포함한다.

- `AGENTS.md`, `docs/architecture/README.md`, `docs/architecture/fsd.md`, `docs/architecture/verification.md`, `docs/architecture/repository-disconnection.md`, `docs/architecture/invariants.md`.
- `src/app/api/mcp/route.ts`, `src/app/api/mcp/owner/route.ts`, `src/app/api/templates/route.ts`, `src/app/api/project/route.ts`, `src/app/api/runbook/route.ts`, `src/app/api/projects/route.ts`.
- `src/app/(app)/layout.tsx`, `src/app/(app)/p/[slug]/layout.tsx`, `src/server/auth/guard.ts`, `src/server/auth/config.ts`, `src/server/user-scope-query.ts`, `src/server/db.ts`, `src/server/project-availability-service.ts`, `src/server/project-access-query.ts`, `src/server/scope-copy.ts`.
- `src/server/templates-query.ts`, `src/server/project-identity-query.ts`, `src/server/runbook-query.ts`, `src/server/mcp/tools.ts`, `src/server/mcp/owner-tools.ts`.
- `src/fsd/features/create-project/api/create-project.server.ts`, `src/fsd/features/create-project/ui/new-project-form.tsx`, `src/fsd/features/create-project/index.server.ts`, `src/fsd/features/manage-token/api/manage-token.server.ts`, `src/fsd/features/manage-token/index.ts`, `src/fsd/features/manage-token/index.server.ts`, `src/fsd/features/manage-user-token/index.ts`, `src/fsd/features/manage-user-token/index.server.ts`, `src/fsd/pages/project-tokens/index.ts`, `src/fsd/pages/user-tokens/index.ts`.
- `src/fsd/shared/lib/relative-time.ts`, `src/fsd/shared/lib/copy-lock.ts`, `src/fsd/shared/ui/field.tsx`, `src/fsd/shared/ui/table.tsx`, `src/fsd/shared/routes/project.ts`, `src/fsd/shared/routes/user-tokens.ts`, `src/fsd/entities/project-token/model/connect-command.ts`, `src/fsd/entities/project-token/model/connect-command.test.ts`, `tests/server/fixtures/src-clean-code-browser.tsx`.
- `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `prisma.config.ts`, `prisma/migrations/migration_lock.toml`, `.claude-plugin/marketplace.json`, `.gitignore`, `.github/workflows/check.yml`, `scripts/test-server-integration.mjs`, `tests/server/register-server-only.mjs`, `tests/server/integration/support.ts`, `tests/server/integration/migration.test.ts`, `tests/server/integration/project-registration.test.ts`, `scripts/verify-fsd-boundaries.mjs`.

generated Prisma 파일은 `npm run db:generate`로만 갱신하며 직접 수정하지 않는다. 생성 목적지·내용 검증은 아래 artifact map을 따른다. 관련 없는 proposal, pipeline/agent rate-limit 구현, private 템플릿, 환경변수 파일, 기존 migration은 변경 금지다.

## Final Artifact Resolution

| 노출 결과 | 최종 소유·본문·의존성 | 확인 목적지 |
| --- | --- | --- |
| 프로젝트 토큰 목록 HTML/RSC | `src/app/(app)/p/[slug]/tokens/page.tsx`의 소유자 guard·project/user scope select → `ProjectTokensPage` → 공개 `TokenUsage` 및 세부 발급/reveal. 부모 layout의 연결 상태·TurnBanner 유지 | V-COPY-FORMS, V-USAGE-UI, V-AUTH의 route select 검사, V-BROWSER |
| 사용자 토큰 목록 HTML/RSC | `src/app/(app)/settings/tokens/page.tsx`의 `requireUser`·user scope select → 기존 AppHeader와 `UserTokensPage` → 공개 entity. header/plan과 폐기 Action 연결 유지 | 같은 UI/route 검증 및 V-BROWSER |
| 프로젝트 생성 후 reveal | `create-project.server.ts` → `NewProjectForm`의 생성 성공 분기 → 기존 공유 `TokenReveal`. 중복 등록/실패 시 새로운 평문·토큰 없음 | V-ISSUANCE, V-COPY-REVEAL, V-BROWSER |
| REST 응답·MCP AuthInfo | 위 여섯 API route → 실제 production binder → 기존 순수 인증·인가·body/tool 처리. usage 필드를 응답에 추가하지 않음 | V-AUTH, V-DB; 상태뿐 아니라 JSON keys와 MCP scopes/clientId/extra 대조 |
| PostgreSQL 모델·generated client | schema → 신규 SQL → 세 테이블의 6 nullable/no-default 열; generator `../src/generated/prisma`. `client.ts`, `models.ts`, `models/ProjectToken.ts`, `models/OwnerToken.ts`, `models/UserToken.ts`, `internal/prismaNamespace.ts`, `internal/class.ts`의 입력·select·모델 타입을 생성 후 확인 | V-DB, `db:validate`, `db:generate`, `check`, `build` |
| 사용자 노출 문구 | product-copy §9·§15의 잠금 → 실제 form/page/reveal markup와 공개 init SKILL 본문. lock ID 유지; retired guard는 옛 문장만 금지 | V-COPY-FORMS, V-COPY-REVEAL; source regex만으로 렌더 검증을 대신하지 않음 |
| 공개 plugin package | marketplace의 `./plugin` → JSON으로 파싱한 plugin name/source/version → 갱신된 init SKILL. DB의 private Template 본문은 별도이며 변경·seed 없음 | V-COPY-REVEAL, `check`, `npm test`; 실제 게시·사용자 설치본 갱신은 이 제안 구현의 인수가 아님 |

새 route·handler·환경 변수·callback registry·queue는 만들지 않는다. 기존 core token 생성/해시·entitlement, MCP domain 도구, private Template body, 토큰별 rate-limit과 웹 owner/session 경계는 보존 대상으로 해당 회귀 검사를 유지한다.

## Safety Analysis

- 인증/인가의 입력·결과는 그대로 두고 기록만 별도 의존성으로 넣는다. 인증 허용 여부는 recorder의 성공 여부로 판단하지 않는다.
- 신규 데이터는 내부 ID와 시각뿐이다. 평문·해시·IP·기기 정보 수집을 확장하지 않는다.
- 이름과 사용 시각의 공용 표시를 entity public API에 두어 same-layer page import와 client/server 경계 위반을 피한다.
- 기존 목록 scope를 유지한다. 프로젝트 토큰은 소유 프로젝트, 소유자 토큰은 프로젝트+현재 사용자, 계정 토큰은 현재 사용자로 조회한다.
- 정적 자산 URL, dynamic import, 외부 SDK, 브라우저 저장소, 결제·승인 권한은 변경 대상이 아니다.
- 가장 큰 위험은 구버전 서버가 기록하지 않는 배포 구간과 부가 기록 실패다. 기록 표시를 완전한 감사·미사용 보증으로 표현하지 않고 아래 배포·검증 조건을 적용한다.

## Execution Plan

### Phase COPY: 이름과 재사용 안내

- status: Completed
- entry criteria: 구현 요청에서 이 Phase의 범위가 승인되고 기준 커밋·dirty tree를 재확인한다.
- satisfies: REQ-TOKENUX-001, REQ-TOKENUX-002, REQ-TOKENUX-003, REQ-TOKENUX-004
- preserves: INV-TOKENUX-001, INV-TOKENUX-002, INV-TOKENUX-003, INV-TOKENUX-005
- governed-by: CON-TOKENUX-001, CON-TOKENUX-003
- verifies: REQ-TOKENUX-001, REQ-TOKENUX-002, REQ-TOKENUX-003, REQ-TOKENUX-004
- exit criteria: 세 발급 폼·목록·reveal와 공개 init 스킬의 안내가 일치하고 문구 잠금·폐기 문구 검증 및 화면 확인이 통과한다.
- approval gate: 후속 구현 요청이 COPY만 승인하면 이 Phase에서 멈춘다. COPY·USAGE 전체를 승인한 요청이면 COPY 검증 후 USAGE로 이어갈 수 있다.

#### TASK-COPY-01: 토큰 이름과 발급 전 범위 안내

- satisfies: REQ-TOKENUX-001, REQ-TOKENUX-002
- preserves: INV-TOKENUX-001, INV-TOKENUX-003
- governed-by: CON-TOKENUX-001, CON-TOKENUX-003
- implementation destination: 세 발급 form, 두 token page, `product-copy.md §9`.
- verification destination: V-COPY-FORMS, V-BROWSER, V-GATES.
- stop condition: 이름 필수화·권한 변경·자동 저장이 필요하다고 판단하면 이 범위를 확장하지 않고 설계를 다시 검토한다.

#### TASK-COPY-02: 재사용·보관·분실 안내와 계약 동기화

- satisfies: REQ-TOKENUX-003, REQ-TOKENUX-004
- preserves: INV-TOKENUX-002, INV-TOKENUX-005
- governed-by: CON-TOKENUX-001, CON-TOKENUX-003
- implementation destination: 두 reveal, `token-reveal.test.ts`, `product-copy.md §9·§15`, 공개 init 스킬과 plugin manifest patch version, `retired-copy.test.mjs`.
- verification destination: V-COPY-REVEAL, V-BROWSER, V-GATES.
- stop condition: 프로젝트 토큰의 머신 전역 저장·평문 대화 입력·private 템플릿 변경을 요구하는 우회는 중단한다.

### Phase USAGE: 사용 기록 저장과 목록 표시

- status: Completed
- entry criteria: COPY의 토큰 의미를 유지하며 이 Phase의 구현 범위가 승인된다. DB 검증과 배포 조건을 분리해 확인한다.
- satisfies: REQ-TOKENUX-005, REQ-TOKENUX-006, REQ-TOKENUX-007, REQ-TOKENUX-008, REQ-TOKENUX-009
- preserves: INV-TOKENUX-001, INV-TOKENUX-002, INV-TOKENUX-003, INV-TOKENUX-004, INV-TOKENUX-005
- governed-by: CON-TOKENUX-001, CON-TOKENUX-002, CON-TOKENUX-003
- verifies: REQ-TOKENUX-005, REQ-TOKENUX-006, REQ-TOKENUX-007, REQ-TOKENUX-008, REQ-TOKENUX-009
- exit criteria: 모든 인증 경로에 recorder가 연결되고 DB·화면·보안 회귀 검증이 통과한다. 기존 토큰과 신규 토큰의 기록 의미가 구분된다.
- approval gate: 이 Phase의 승인 범위와 DB·배포 권한을 구분한다. 기능 구현 승인이 운영 migration·배포까지 자동으로 허용하지 않으며, 만료·교체 후속 작업은 시작하지 않는다.

#### TASK-USAGE-01: 스키마 확장과 발급 초기값

- satisfies: REQ-TOKENUX-007
- preserves: INV-TOKENUX-002, INV-TOKENUX-004, INV-TOKENUX-005
- governed-by: CON-TOKENUX-002, CON-TOKENUX-003
- implementation destination: Prisma schema·신규 migration, 세 발급 경로와 초기 프로젝트 토큰 발급.
- verification destination: V-ISSUANCE, V-DB, V-GATES.
- stop condition: 기존 행에 생성일을 사용일로 넣거나 새 nullable 열을 역으로 삭제하는 배포가 필요하면 중단한다.

#### TASK-USAGE-02: 공통 기록과 모든 인증 경로 연결

- satisfies: REQ-TOKENUX-005, REQ-TOKENUX-006, REQ-TOKENUX-008, REQ-TOKENUX-009
- preserves: INV-TOKENUX-002, INV-TOKENUX-003, INV-TOKENUX-005
- governed-by: CON-TOKENUX-001, CON-TOKENUX-002, CON-TOKENUX-003
- implementation destination: 주입 가능한 `token-usage-query.ts`와 server-only `token-usage.ts`, MCP 검증기·production deps, REST scope·production deps와 내부 ID select. 목록 GET과 순수 user 조회에 기록을 붙이지 않는다.
- verification destination: V-AUTH, V-DB, V-GATES.
- depends on: TASK-USAGE-01
- stop condition: recorder/진단 오류가 인증 판정에 섞이거나 표에 있는 인증 경로를 검증할 수 없으면 완료로 처리하지 않는다. await의 부가 query·지연을 숨기거나 60초 조건을 요청 수 제한으로 구현하지 않는다.

#### TASK-USAGE-03: 사용 상태 표시와 전체 인수

- satisfies: REQ-TOKENUX-007
- preserves: INV-TOKENUX-001, INV-TOKENUX-003, INV-TOKENUX-004
- governed-by: CON-TOKENUX-001, CON-TOKENUX-002, CON-TOKENUX-003
- implementation destination: 두 page route·page props, entity 표시·public API, 문구 및 protocol 계약.
- verification destination: V-USAGE-UI, V-BROWSER, V-GATES.
- depends on: TASK-USAGE-01, TASK-USAGE-02
- stop condition: 기존 데이터의 null을 무조건 `Never used`로 표시하거나 사용자 범위 밖 데이터를 노출하면 중단한다.

## Verification Plan

아래 항목은 구현에 적용한 검증 계약이다. 실행 결과와 시험 환경의 한계는 Verification Results에 기록한다. 잠금된 사용자 안내와 사용 기록의 중요한 경계에 집중했다.

### V-COPY-FORMS

- category: component / contract
- destination: 신규 `src/fsd/features/manage-token/ui/token-names.test.ts`, `src/fsd/features/manage-user-token/ui/token-name.test.ts`, `src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts`, `src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts`; `npm run test:web`.
- verifies: REQ-TOKENUX-001, REQ-TOKENUX-002
- expected observation: 실제 form/page를 `createElement`·`renderToStaticMarkup`로 그려 세 종류의 `Token name`·hint·올바른 범위와 `/settings/tokens` 링크를 검사한다. 허용 화면에는 발급 전 설명이 있고 Free owner·selected-out·disconnected에서는 기존 form 숨김/기존 행의 폐기 기능을 보존한다. input의 내부 name은 `label`이며 required·unique 제약이 새로 생기지 않는다. 기본 이름·trim·중복 저장은 V-ISSUANCE에서 검사한다.

### V-COPY-REVEAL

- category: contract / regression
- destination: `src/fsd/entities/project-token/ui/token-reveal.test.ts`, `scripts/retired-copy.test.mjs`, `plugin/skills/init/SKILL.md`, `plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`; `npm run test:web`, `npm run test:architecture`, `npm test`.
- verifies: REQ-TOKENUX-003, REQ-TOKENUX-004
- expected observation: 기존 네 lock ID가 실제 reveal markup와 일치하고 저장한 값 재사용·분실 후 재발급/개별 폐기가 설명된다. `hs_`에 머신 전역 저장 안내가 없고 `hu_`에 터미널 한정 안내가 없다. 옛 재발급 유도 문장 부재와 새 안내 존재를 모두 검사한다. `ho_`는 owner 변수·owner endpoint만 안내한다. 공개 init SKILL 본문에서 비밀을 대화에 요구하지 않으며 JSON으로 파싱한 plugin version이 기준보다 증가하고 marketplace source/name은 일치한다.

### V-AUTH

- category: unit / security / cross-module
- destination: `src/server/mcp/auth.test.mjs`, `src/server/rest-scope.test.ts`, `src/server/templates-query.test.ts`, `src/server/project-identity-query.test.ts`, `src/server/runbook-query.test.ts`, `src/server/harness-init.test.ts`, 신규 `src/server/token-usage-query.test.ts`, `tests/server/token-usage-bindings.test.ts`; 기존 `tests/server/project-registration.test.ts`, `tests/server/project-connection-bindings.test.ts`, `tests/server/integration/project-connection.test.ts`의 fixture 호환. `npm run test:web`, `npm run test:server`, `npm run test:server:integration`.
- verifies: REQ-TOKENUX-005, REQ-TOKENUX-006, REQ-TOKENUX-008, REQ-TOKENUX-009
- expected observation: 여섯 경로와 허용된 모든 kind의 실제 production 조합에서 내부 ID 기록을 확인한다. MCP 양쪽 GET/POST export가 같은 실제 검증기를 사용함을 확인하고 REST는 route까지 실행해 기존 상태·JSON keys를 비교한다. 주입된 recorder 호출만 확인하는 시험으로 production 연결 검사를 대체하지 않는다. binder와 순수 auth는 실제 함수를 사용하고 DB IO·외부 MCP transport/domain IO만 대체한다.
- failure matrix: 누락·형식 오류·미등록·폐기·잘못된 kind는 기록 0회; 유효 `hu_`의 slug 누락(`PROJECT_REQUIRED` 401)·타 소유/없는 slug(`NOT_YOURS` 403)·접근 제한·body 오류는 기록 시도 후 기존 응답. 유효 자격은 요청당 1회 시도하며 MCP AuthInfo 결과는 기존과 같다. recorder의 reject·지연 후 reject·진단 throw는 원래 결과를 바꾸지 않고, 초기 token 조회 reject는 기존대로 전파된다.
- isolation: 일반 query/auth 시험은 server-only/DB singleton을 import하지 않는다. production/route 시험은 기존 server-only bootstrap 아래에서 실행한다. VM/mock/console 교체는 시험마다 생성하고 `finally`로 복원한다. 미해결 Promise·서버·DB 연결을 남기지 않는다. 웹 목록 route를 실행해 소유자 guard와 세 scope select·두 새 필드·생성일 내림차순·usage write 0회를 검사한다.

### V-ISSUANCE

- category: action / service / transaction regression
- destination: `src/server/project-token-service.test.ts`, `src/server/project-registration-query.test.ts`, 신규 `tests/server/token-issuance-bindings.test.ts`, 기존 `tests/server/integration/project-registration.test.ts`, `tests/server/integration/project-connection.test.ts`; `npm run test:web`, `npm run test:server`, `npm run test:server:integration`.
- verifies: REQ-TOKENUX-001, REQ-TOKENUX-004, REQ-TOKENUX-007
- expected observation: 실제 사용자 Action·프로젝트/owner 발급 service·웹 초기 토큰 nested create는 새 행의 시작값만 설정하고 `lastUsedAt`은 null이다. label trim/default/중복과 해시만 저장하는 기존 계약을 보존한다. 새 발급은 다른 토큰을 폐기하지 않는다. 기존 프로젝트·실패·해제·한도 초과·REST 등록은 추가 초기 토큰을 만들지 않는다. 웹 세션 guard·owner user lock·plan 검사·revoke user/project scope·`revalidatePath`를 보존한다. recorder가 웹 발급·조회·복사·폐기에 붙지 않는다.

### V-DB

- category: migration / integration / concurrency
- destination: 신규 `tests/server/integration/token-usage.test.ts`, `tests/server/integration/token-usage-migration.test.ts`; `npm run test:server:integration`.
- verifies: REQ-TOKENUX-005, REQ-TOKENUX-006, REQ-TOKENUX-007, REQ-TOKENUX-009
- setup/fixture: 운영과 다른 `stagekeeper_test_*` PostgreSQL DB. 기존 runner는 최신 migration을 먼저 deploy하므로 단순 fixture 삽입으로 이전 schema 인수를 주장하지 않는다. `tests/server/integration/migration.test.ts`의 방식대로 시험 전용 무작위 schema와 한 `pg.Client` 연결에서 신규 migration 직전까지의 SQL 파일을 정렬해 전체 재현한다. SQL로 세 종류의 active/revoked 토큰과 관계 fixture를 넣고 실제 신규 `migration.sql`을 실행해 전후 snapshot·catalog를 비교한다. 새 열이 없는 단계에서 최신 Prisma model로 조회하지 않는다. `TEST_DATABASE_URL` 검증, 원래 search_path 복원, 시험 schema만 삭제, client 종료를 `finally`로 보장한다. 현재 기준 이전 migration은 19개이며 마지막은 `20261001000000_automatic_scout_control`이다.
- expected observation: 기존 id·label·hash·createdAt·revokedAt·관계·기존 index/FK가 보존되고 정확히 6 nullable/no-default 열이 추가된다. legacy writer가 새 필드를 생략해도 저장되며 두 열은 null이다. 신규 발급은 시작값만 설정한다. 최초 기록, 정확히 59,999ms/60,000ms 경계, 동시·역순 기록을 세 종류 모두 검사한다. 실제 두 연결과 barrier로 기록-before-revoke / revoke-before-record 양방향을 고정하여 폐기 후 늦은 기록 0행과 시각 비역행을 확인한다. DB 잠금으로 await 지연을 재현하고 해제/오류 후 요청 결과·연결 정리를 확인한다. 행 변경 횟수와 query 횟수를 별도로 관찰한다.

### V-USAGE-UI

- category: component / data contract
- destination: 신규 `src/fsd/entities/project-token/ui/token-usage.test.ts`, `src/fsd/pages/project-tokens/ui/project-tokens-page.test.ts`, `src/fsd/pages/user-tokens/ui/user-tokens-page.test.ts`; V-AUTH의 두 route select 검사; `npm run test:web`, `npm run test:server`.
- verifies: REQ-TOKENUX-007
- expected observation: 신규 미기록·기존 미상·사용·폐기 상태와 보조 설명을 실제 markup에서 검사한다. `lastUsedAt`이 있으면 시작값 null 여부와 무관하게 UTC 분을 표시한다. 프로젝트 agent/owner와 사용자 표 모두 6개 열, 빈 목록 `colSpan={6}`, 기존 이름/reference/status/revoke 조합·정렬을 확인한다. route가 새 열을 실제 props로 넘기는 검사까지 포함하고 formatter의 출력과만 비교하지 않는다.

### V-BROWSER

- category: manual end-to-end / visual / accessibility
- destination: 구현 후 연결 가능한 브라우저의 `/p/mathgic/tokens`, `/settings/tokens`와 프로젝트 생성 후 reveal.
- verifies: REQ-TOKENUX-001, REQ-TOKENUX-002, REQ-TOKENUX-003, REQ-TOKENUX-004, REQ-TOKENUX-007
- expected observation: desktop·좁은 화면에서 hint·링크·열이 읽히고 keyboard로 입력·복사·폐기 조작이 가능하다. 보관한 동일 토큰으로 두 번째 터미널에서 인증하고 목록을 실제 서버 재조회하여 같은 행의 사용 기록을 확인한다. 별도 탭·뒤로 가기가 자동 최신화한다고 기대하지 않는다. Free/연결 해제 상태와 생성 성공/기존 프로젝트 분기를 확인한다. 발급 전 설명과 발급 후 설명의 의미가 일치한다. 시험 비밀값은 출력·스크린샷·보고서에서 제외한다.

### V-GATES

- category: type / lint / architecture / build / regression
- destination: 아래 저장소 명령과 `AGENTS.md`의 완료 기준.
- verifies: REQ-TOKENUX-001, REQ-TOKENUX-002, REQ-TOKENUX-003, REQ-TOKENUX-004, REQ-TOKENUX-005, REQ-TOKENUX-006, REQ-TOKENUX-007, REQ-TOKENUX-008, REQ-TOKENUX-009
- expected observation: 관련 동작 시험과 함께 실행하고, FSD·Server/Client·Prisma·route 조합이 깨지지 않는다. 정적 검사만으로 사용자 동작이 검증됐다고 주장하지 않는다.

```powershell
npm run db:validate
npm run db:generate
npm run verify:fsd
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:server
npm run test:server:integration
npm run build
```

`npm run check`에 lint·Next typegen·TypeScript 검사가 포함된다. DB integration은 위 격리 DB 조건이 만족될 때만 실행한다. 이번 범위에서 private 템플릿을 변경하지 않으므로 `test:templates`는 완료 조건이 아니다. 실패는 기준 커밋의 기존 실패와 신규 실패를 구분해 기록하며 미실행 검증을 통과로 표기하지 않는다.

## Risks and Rollback

### 잔여 리스크와 배포 조건

- 기록은 60초 단위 부가 정보다. 저장 실패·시계 편차·구버전 서버 처리 구간 때문에 완전한 감사 증거가 되지 않는다. 토큰 삭제나 권한 결정의 근거로 사용하지 않는다.
- 배포는 nullable DB 확장 → generated client 포함 새 앱 → 구버전 worker의 처리 종료 확인 순서다. 별도 추적 활성화 flag는 만들지 않는다. 시작값은 신규 writer가 발급 시 저장하는 표식이며 전체 배포 완료 표식이 아니다. 구버전 writer가 만든 행은 두 열 null로 호환된다. mixed deployment에서는 사용 누락이 가능하고 `Never used`는 계속 **기록 없음**만 뜻한다. 모든 bearer 경로가 새 recorder를 쓰고 구버전 처리가 종료된 증거 없이 운영 전환 완료를 주장하지 않는다.
- 원자 조건은 토큰별 60초 미만 간격의 행 변경을 막는다. 요청당 query·await는 남으므로 recorder 오류 빈도, 잠금·pool 대기와 인증 응답 지연을 확인하며 원래 인증 조회 오류와 별개로 분류한다. 지연 상한·추가 pool·전역 timeout은 이 제안에서 결정하지 않는다. 기록만 실패해도 인증은 통과하지만 장애 시 무지연이라는 보장은 없다.
- 브라우저 연결이나 격리 DB가 준비되지 않으면 소스 구현 검증은 진행할 수 있지만 해당 인수·배포 단계를 완료로 처리하지 않는다.

### 롤백

앱과 문구를 이전 버전으로 되돌리되 추가 nullable 열과 기존 토큰·기록 데이터를 유지한다. 평문 복원·토큰 일괄 폐기·DB 열 즉시 삭제·시각 backfill·추적 표식 일괄 초기화는 수행하지 않는다. 구버전으로 돌아간 동안 기록 공백이 생길 수 있으므로 재배포 이후에도 이 표시를 실제 미사용 보증으로 해석하지 않는다. `Never used`/`Unknown`의 판정은 저장된 두 필드에 대한 REQ-TOKENUX-007을 그대로 적용한다. nullable 필드를 생략하는 구버전 writer의 호환은 V-DB로 검증한다. 향후 표식 초기화나 기록 완전성 보장이 필요하면 데이터/운영 정책을 별도로 승인받는 후속 제안으로 분리한다.

## 후속 결정: 만료와 교체 정책

피드백 3번에서 언급한 만료·교체는 이번 `Last used` 기능 다음의 별도 제안 대상으로 남긴다. 시행 전에 만료 기간, 기존 무기한 토큰의 호환, 만료 전 알림, 자동화의 비밀 갱신 방법, 교체 중 두 토큰의 유예 기간, 실패 복구를 정해야 한다. 기간을 임의로 정하거나 기존 토큰을 자동 만료시키지 않는다. 이는 이번 두 Phase의 blocker가 아니다.

## Approval / 구현 준비도

실행 승인 기록은 front matter만 기준으로 삼는다. 두 Phase의 코드와 로컬 인수를 완료했다. 실제 PostgreSQL 검증은 새로 만든 격리 DB에서 수행했으며, 운영 migration·구버전 worker 종료·배포는 실행하거나 완료로 주장하지 않는다. 이 문서의 완료 상태는 소스 구현과 로컬 검증을 뜻하며 운영 전환은 Risks and Rollback의 조건을 충족해야 한다.

## Verification Results / 작성 단계의 역사적 증거

| 항목 | 상태 | 결과 |
| --- | --- | --- |
| 원격 `dev` 실재·기준 커밋·dirty tree 확인 | Executed | 원격 dev 확인, fetch 후 기준 커밋에서 새 브랜치 생성; 기존 미추적 문서 보존 |
| source·schema·문구 잠금·architecture·검증 명령 대조 | Executed | 위 근거와 경로 표에 반영 |
| SDD strict 추적성 검사 | Executed | `python C:/Users/hamso/.codex/skills/write-sdd-spec/scripts/validate_sdd_traceability.py --strict docs/proposals/active/token-management-ux.md`: PASS. REQ 9개, INV 5개, CON 3개, TASK 5개; 작업·verifier coverage 각 9/9. |
| 요구사항·계약·범위·실패·기존 데이터의 의미 검토 | Executed | 문구 계약 변경을 명시하고 인증 경로 누락, 기존 null의 미사용 오판, 기록 실패의 인증 영향, 동시 갱신·폐기, 승인 범위와 운영 검증 조건을 대조했다. 소스·문서 기준 검토이며 실제 동작 인수를 대체하지 않는다. |
| reconciliation에서 발견한 개선점 | Resolved in source | 모호한 파일/시험 범주를 정확한 경로로 전개; server-only binder와 순수 query/import 계약 분리; REST user ID가 이미 select되는 사실 반영; 유효 hu_의 `PROJECT_REQUIRED` 401도 기록; 실제 production 연결/웹 route/발급 Action 검증 추가; 구 schema 재현 migration 검증; plugin version·본문 전달 경로; await의 추가 왕복/지연과 cache/state 한계; 존재하지 않던 활성화 단계·표식 초기화 가정 제거. 처음부터 개선점이 없던 문서는 아니었다. |
| 실행 명령·신규 경로 preflight·artifact 목적지 | Source inspected | 저장소 scripts와 설치된 Next 16.3.3/mcp-handler/Prisma adapter를 대조하고 신규 파일의 부모/충돌, public API, generated client 출력, 실제 route 본문/props 검증 목적지를 명시했다. |
| 애플리케이션 시험·실제 DB·브라우저 인수 | Not executed at proposal review | 당시 문서 작성만 수행했다. 후속 구현 요청의 실행 결과는 다음 표를 따른다. |

## Verification Results / 구현 인수 (2026-10-02)

| 검증 | 실제 결과 |
| --- | --- |
| V-COPY-FORMS / V-COPY-REVEAL / V-USAGE-UI | 실제 컴포넌트 markup, 기존 copy lock ID, 옛 문장 회귀 검사, plugin manifest `0.3.7`과 공개 init 안내 검사 통과. 세 상태·UTC·6열·빈 목록·기존 폐기/플랜/연결 상태를 확인했다. |
| V-AUTH / V-ISSUANCE | 여섯 production 인증 연결과 실제 REST route·MCP GET/POST 조합, 웹 발급 Action·등록 service·목록 route 시험 통과. 인증 이후 401/403/body 오류, 기록/진단 실패, 최초 조회 실패, 내부 ID select, 기존 응답 계약과 발급 no-write 분기를 확인했다. |
| `npm run db:validate`, `npm run db:generate` | PASS. 세 모델의 두 nullable 필드와 generated client의 모델·입력·select 타입을 확인했다. generated 파일은 직접 편집하거나 커밋하지 않는다. |
| V-DB: 전체 integration runner | `npm run test:server:integration`과 동일한 `runIntegration()`의 migration deploy → 전체 integration 순서를 새 로컬 PostgreSQL 테스트 DB에서 실행해 PASS. 운영 연결은 사용하지 않았으며 runner의 DB 이름·분리 guard를 유지했다. |
| V-DB: migration / 동시성 | 이전 migration 19개를 별도 schema에 재생하고 기존 active/revoked 데이터·index·FK가 보존됨을 확인했다. 정확히 6 nullable/no-default 열, 구버전 writer 생략 호환, 세 kind의 최초/59,999ms/60,000ms/역순/동시 기록과 양방향 폐기 경합 통과. |
| V-DB: 추가 지연 / query 비용 | 실제 row lock으로 인증의 await 대기 `>=75ms`를 관찰했다. 인증 2회에 query 2회, 행 변경 1회였다. 기록 오류 이후에도 기존 인증 결과가 유지됨을 확인했다. 무지연·query 생략을 주장하지 않는다. |
| `npm run verify:fsd`, `npm run test:architecture` | PASS. architecture 26 tests 통과. |
| `npm run check`, `npx tsc --noEmit` | PASS. lint·Next typegen·TypeScript·architecture·project availability 검사 통과. 기존 `tests/server/fixtures/src-clean-code-browser.tsx`의 `_success` 미사용 lint warning 1개는 유지되며 새 오류는 없다. |
| `npm test`, `npm run test:web` | PASS. 각각 188 / 518 tests, 실패·skip 없음. |
| `npm run test:server` | `SRC_CHECK_INBOX_MANIFEST=true`로 opt-in 검증도 실행: 32 tests PASS, 실패·skip 없음. |
| `npm run build` | PASS. sandbox의 Google font 다운로드 제한 이후 네트워크가 허용된 실행에서 production build를 완료했다. |
| V-BROWSER: 실제 production 앱 | 격리 DB와 임시 인증 fixture를 사용하는 실제 Next production 서버를 Edge headless에서 검증했다. desktop 1440px / mobile 390px의 hint·표·링크·사용 상태·키보드 발급/복사/폐기, 서버 재조회 후 UTC 표시, Free owner 잔여 토큰·unavailable/disconnected 제한, 프로젝트 생성의 신규/기존 분기를 확인했다. |
| V-BROWSER: 재사용 / 증거 경계 | 동일하게 발급한 `hs_` 값으로 독립 HTTP 요청 2회를 보내 인증 성공과 추가 발급 0행을 확인했다. 이는 credential 재사용 인수이며 실제 두 OS 터미널이나 Claude Code 연결을 실행한 증거는 아니다. 스크린샷은 평문 reveal을 제외한 화면만 저장했고 토큰·쿠키·DB URL은 보고서에 넣지 않았다. |
| 시험 정리 / 변경 범위 | VM·console·DB 연결은 finally로 복원하고 임시 브라우저·Next 서버·fixture·PostgreSQL host도 인수 후 종료했다. 기존 사용자 proposal 3개의 로컬 작성본은 구현 commit에서 제외했다. `dev`에서 별도로 추가된 local-watch 문서를 통합하면서 로컬 원본을 임시 보관 후 동일 blob hash로 복원했다. `git diff --check` PASS. |
| SDD strict traceability | 완료 경로에서 strict validator PASS. REQ 9 / INV 5 / CON 3 / TASK 5, phase/task와 verifier coverage 모두 9/9. |
| 최신 `dev` 통합 검증 | 격리 worktree에 독립 dependency/client를 준비하고 `check`, core 188, web 518, server 32(새 production manifest opt-in), production build, strict traceability를 다시 실행해 모두 PASS. 충돌 marker가 없고 dev 대비 변경은 승인된 토큰 UX 파일 54개뿐이다. |

브라우저 증거는 로컬 임시 artifact `tokenux-browser-result.json`, `tokenux-project-desktop.png`, `tokenux-project-mobile.png`, `tokenux-user-mobile.png`로 확인했다. 시험 fixture의 입력 누락·플랜 설정·credential 형식 가정으로 발생한 초기 harness 실패는 수정 후 실제 앱 인수를 통과했다. 운영 데이터를 바꾸거나 실패한 시험을 통과로 바꾸는 제품 수정은 하지 않았다.

## Completion or Closure Notes

COPY와 USAGE의 TASK 5개를 구현했고 요구사항 9개를 위 verifier와 실행 결과로 확인했다. 완료 기록으로 이 문서를 `completed/2026-10-02-token-management-ux.md`로 이동한다. 이름은 기존 `label` 메타데이터이고, 기존 토큰의 수명·종류·권한·개별 폐기·평문 1회 노출 계약을 보존한다. 사용 기록은 부가 인증 기록이며 기존 토큰의 과거 기록을 backfill하지 않는다.

승인 범위에 따라 feature branch를 commit/push하고 `dev` 대상 PR을 작성한다. 병합은 `check` green 이후 별도 작업이며 운영 migration·배포·공개 plugin 게시도 실행하지 않았다. 운영에서는 DB 확장 선행과 구버전 worker 처리 종료를 확인해야 한다. 롤백 시 추가 열과 기록 데이터는 보존한다.

최신 `dev` 통합은 다른 대화에서 진행 중인 account usage 변경과 섞이지 않도록 격리 worktree에서 수행했다. 충돌은 `rest-scope.ts`의 주석 정리와 새 recorder 호출이 겹친 부분이며, 최신 주석과 인증 직후 기록을 함께 유지한다. 공유 작업 폴더의 현재 브랜치·작성 중인 코드·제안서는 바꾸지 않는다.

## Completion Conditions

- 승인된 범위의 모든 요구사항이 Task와 verifier에 연결되고 실제 구현·검증 증거가 기록된다.
- 기존 토큰·폐기·플랜·소유권 회귀가 없으며 토큰 평문이 문서·로그·보고서에 남지 않는다.
- 이름·재사용 안내와 `Last used` 표현을 화면에서 확인하고 문구 원본과 잠금 시험이 일치한다.
- 격리 DB migration·동시성·구버전 데이터 호환을 검증하고 운영 배포 조건을 명시한다. 운영 환경과 구버전 worker 종료는 별도 배포 단계에서 확인하며 미확인 상태를 숨기지 않는다.
- 여섯 production 인증 연결·허용 kind·유효 credential 이후 401/403·기록/진단 실패·초기 조회 실패·웹 read/write 구분·발급 no-write 경로가 구체적인 verifier를 통과한다. await 지연을 무지연으로 보고하지 않는다.
- SQL 이전 schema 재현과 세 모델의 정확한 6개 열·generated client 타입을 검증하고, 문구 잠금과 공개 plugin version이 최종 노출 본문과 일치한다. 롤백에서는 기록·추적 표식을 임의로 삭제/변경하지 않는다.
- 구현 PR은 `dev`를 대상으로 하고 `check`가 green인 상태에서 병합한다. 완료 시 이 문서의 metadata·실제 검증 요약을 갱신하고 저장소 규칙에 따라 `completed/`로 이동한다.

## Reconciliation Evidence Boundary

이 절과 아래 receipt는 구현 전 제안서 호환성 대조의 역사적 기록이다. 당시 검토 단위는 이 파일 하나와 위 Affected Files의 변경/보존 목록, 직접 참조한 architecture·product-copy 계약이었다. 다른 미추적 proposal은 source bundle에 포함하지 않았다. 구현으로 source·generated client·candidate set이 바뀌었으므로 아래 digest와 no-edit 판정을 현재 구현의 증거로 재사용하지 않는다. 구현 인수는 Verification Results의 실제 실행 결과를 따른다. 이 anchor는 과거 검토 범위의 기록이며 결함 부재의 증명이나 구현 승인이 아니다.

재현 가능한 candidate discovery는 다음 두 read-only `safe-replay` 명령의 출력 경로와 위의 정확한 변경/보존 경로 manifest의 합집합이다. 존재하는 파일을 `/` 구분자로 정규화·중복 제거·문자순 정렬하고 LF로 연결해 SHA-256을 계산한다. 신규 제안 파일은 preflight에서 absence/parent를 별도 검사하며 구현 직전 추가/충돌을 확인한다.

```powershell
rg -l 'makeVerifyToken|makeVerifyOwnerToken|resolveRestScope|resolveUserScope|findUserTokenByHash|findTokenByHash|TokenReveal|OwnerTokenReveal|initialTokenHash|projectToken\.create|ownerToken\.create|userToken\.create' src tests
rg --files prisma/migrations src/fsd/features/manage-token src/fsd/features/manage-user-token src/fsd/entities/project-token src/fsd/pages/project-tokens src/fsd/pages/user-tokens
```

설치된 framework/runtime 근거는 `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`, `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `node_modules/mcp-handler/dist/index.js`, `node_modules/@prisma/adapter-pg/dist/index.d.ts`다. Next·mcp-handler·Prisma adapter의 설치 package metadata와 artifact map의 현 generated Prisma 파일도 bounded non-HEAD basis에 포함한다. raw 환경변수·remote URL·DB 연결 문자열·토큰 값은 identity나 receipt에 넣지 않는다.

가장 큰 경계인 인증 기록 연결은 symbol/call-site 검색과 여섯 route→production module→credential/auth/body 처리의 별도 추적으로 대조한다. UI는 props/select와 실제 markup 시험 목적지를 함께 확인하고, migration은 runner 순서와 이전 SQL schema 재현을 별도로 확인한다. generated 타입·plugin JSON은 출력 경로와 parser/생성 검증 목적지를 확인한다. 외부 OAuth 정책·private Template 수정·만료·rate-limit 변경·실제 운영 배포는 이 제안 scope 밖이며 승인이나 실행 증거를 만들지 않는다.

`db:generate`, `build`, 구현 시험, plugin 게시·migration·운영 확인은 `manifest-only` 또는 운영 상태에 대한 `volatile-non-replayable` 검증이다. 과거 reconciliation의 replay 중 자동 실행하지 않는다. 실제 구현 요청에서는 지정된 V-* 인수와 최신 환경 확인이 별도로 필요하다.


<details>
<summary>2026-10-02 대조 근거와 replay receipt</summary>

- Repository identity: `57ff314a91e0b808`.
- HEAD: `03876dd24fab12c63542b4565f087b79a877f7ef`.
- Scope / phase / profile: 토큰 UX 1·2·3, COPY·USAGE, High-Risk. 문서 편집만 승인된 상태.
- Source bundle: 이 문서와 아래 계약 파일. 이 파일 전체의 SHA-256 및 최종 no-edit 판정은 검토 종료 응답에 기록한다. 자기 자신을 포함하는 hash를 이 파일 안에 저장하지 않는다.
- Candidate closure: 위 두 safe-replay 명령 + Affected Files 변경/보존 manifest. 존재하는 파일 120개; sorted LF path-set SHA-256: `1f946102b92c80d5f59142bb8fd230f65b39b3a957ad1bc87c2afb2b2cacb2ca`.
- Non-HEAD basis: 이 미추적 제안서와 아래 generated/installed 파일. 기준 검토 시 이 후보 범위의 tracked diff는 없었다. 다른 미추적 proposal은 제외하고 보존한다.
- Runtime / artifact evidence: 여섯 route의 production 인증 연결·credential 이후 scope/body 검사, schema와 생성 목적지, HTML/RSC props·cache/state 의미, plugin JSON/source/body를 소스로 대조. 예정된 새 동작은 V-*에서 실제 인수해야 한다.
- Verification evidence: 현재 scripts 존재와 strict traceability PASS(9/9)를 확인. SQL schema replay·실제 DB 경합·최종 브라우저·build 검증은 manifest-only이며 아직 실행하지 않았다.
- Freshness: HEAD·source identity·candidate set·설치 파일이 변하면 기존 판정의 적용 범위를 다시 확인한다. DB·배포·구버전 worker 종료의 실시간 근거는 이번 검토에 없다.
- Remaining risks / closure: 부가 query 대기·best-effort 누락·시계 편차는 V-AUTH/V-DB/V-BROWSER 및 운영 전환 증거로 확인. 완전한 감사·무지연·미사용 보증은 제공하지 않는다.
- Exclusions: scope 밖 OAuth 정책·private Template body 변경·만료·rate-limit·실제 운영 배포. 새 queue/timer/registry 없음; mock/VM/console와 DB 연결 정리는 해당 verifier에 명시.
- Redaction: 적용. 토큰/환경변수/연결 문자열/remote URL/절대 경로 없음.
- Persistence: 사용자 요청으로 개선하는 이 제안서에 대조 근거 저장. 최종 응답이 이 근거를 참조하여 Minimal Replay Anchor와 Durable Receipt를 완성한다. 적용성 근거이며 결함 부재나 실행 승인의 증명이 아니다.

| Source / dependency | SHA-256 |
| --- | --- |
| `docs/conventions/product-copy.md` | `7b6d13f624b2ae62157f79205c5a7e53fd6da60fb1bcee75cc8b1e8fac94e717` |
| `docs/architecture/README.md` | `2bdd416745002e6111f23045bc0c75e330b63cb9bda77fd9a1593ad2cc59ba9a` |
| `docs/architecture/fsd.md` | `b29fcacba7821efb85aeae9ac08a4cbdc2c08ee8b70105a1acc98b30fd5c9a91` |
| `docs/architecture/protocol.md` | `87624eb1078f1068b571e43dbfd8d6f485e954d5597202acef289c6c8a9a440a` |
| `docs/architecture/verification.md` | `39d233e860fe368c3104a7222803d785c52fca8ec2c27ed2b536b6e06f78fd52` |
| `docs/architecture/repository-disconnection.md` | `945f4e02732e3e23b250b7f9aad4726216080a0e384288410182b8b39088d157` |
| `docs/architecture/invariants.md` | `701e2190df0faa8cad6dcfac1247b19f787e0c27cdc78173a02a2df2030af4ef` |
| `AGENTS.md` | `e16a0346affdffd71df1ec8ea982a77e93e5d0d6aeb7f72dffb99690b08d25ed` |
| `src/generated/prisma/client.ts` | `9965ae0acc75ee6124f70541b0afdada8fea2b0f69c0a6ff1cf4dde87643a7fe` |
| `src/generated/prisma/models.ts` | `48ccdc053edc5537ceb0de1839774cd374be32e7f59f11eb32ce7ec3d11eb520` |
| `src/generated/prisma/models/ProjectToken.ts` | `245075e501375efaebaec953ac046873f5e3c3e8b4b686ab19e4ec840b148292` |
| `src/generated/prisma/models/OwnerToken.ts` | `12127f3d0e87f1532ed103f228b0183975050dfc21fdc0822bbef289ad01cec3` |
| `src/generated/prisma/models/UserToken.ts` | `ed7349198d0a2e83dd873cadca1842c6adeea45c1114e39ccbaf2695cff1f20b` |
| `src/generated/prisma/internal/prismaNamespace.ts` | `da75953f538556283675cf60e2cf0fbb834eb82e8a7098456e15893c1c3388b0` |
| `src/generated/prisma/internal/class.ts` | `740786c4ac5937deb5e2af9edfc6472577709c9e48271c748c5a19ec9ea62b0f` |
| `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md` | `0fbf6ac3672a1c9f195945abbf294c5f64e04a3706319b149bc901d9bd447062` |
| `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` | `974155c3f4fa1a539b1a5fd924faaf49289b9f34742611caeaa3c0955368d0eb` |
| `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` | `82b4f0888f1d1113c2e0e1a867983a88ce02bbf9419570e3710fe7fe4ccd2c02` |
| `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` | `b2cffc8116b25978f5ec03ea18577550b2a6dc11a49b9dc68892bfa42464cfd0` |
| `node_modules/mcp-handler/dist/index.js` | `3cecec4e2024396f90596e3f5782028257f57d878dac157c16e24f6871c8e595` |
| `node_modules/@prisma/adapter-pg/dist/index.d.ts` | `55917f3d5b339d0a8e57c4898dfbc19d3941643f716f4830187068e799159ea4` |
| `node_modules/next/package.json` | `3ae720e4b8cdad7503935b27b0d14e04390068bf10d6e685797ccf1044051967` |
| `node_modules/mcp-handler/package.json` | `35c443f06f5f349e2158d90a8eaa5b0bd06147264994d136746cdd60bac72e80` |
| `node_modules/@prisma/adapter-pg/package.json` | `8256e8a778b798a5552a3b795409ec23a1c629ee94c308ad2d5909a29fe03e5b` |

</details>
