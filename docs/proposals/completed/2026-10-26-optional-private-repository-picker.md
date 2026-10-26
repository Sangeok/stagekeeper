---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-23"
updated-at: "2026-10-26"
approved-by: "user:Sangeok"
approved-at: "2026-10-23"
approval-scope: "제안서 기반 코드·계약·마이그레이션·시험 구현, 별도 worktree에서 commit·push·dev PR 생성 및 worktree 제거. 실제 App 생성·운영 비밀 공급·운영 활성화는 제외"
completed-at: "2026-10-26"
verification-summary: "PR #214의 서버·UI·마이그레이션·시험 구현과 로컬 검증 기록 확인. 2026-10-23 dev 병합(6cc102a), 2026-10-26 최신 dev 포함 확인. 실제 App 설정·운영 비밀 공급·외부 인수·활성화는 후속 작업으로 유지"
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/ADR/0006-optional-github-repository-list.md"
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/server.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-10-22-public-docs-pages.md"
---

# 선택형 Private 저장소 목록 연동 구현 완료 기록

## Summary

승인된 서버·UI·마이그레이션·시험 구현과 로컬 검증을 완료했다.
[PR #214](https://github.com/Sangeok/stagekeeper/pull/214)는 2026-10-23 `dev`에 병합됐으며,
2026-10-26 사용자의 완료 처리 요청에 따라 이 문서를 `completed/`로 이동했다.
완료 범위는 기본 OFF인 코드 구현과 검증·병합이다. 실제 App 설정·운영 인수·활성화는
[완료 기록과 후속 작업](#completion-or-closure-notes)에 남긴다. 아래 설계·Phase·VFY는 당시 요구사항과 검증 계획의 기록이다.

기존 GitHub 로그인·Public 저장소 선택·URL 직접 입력·등록된 프로젝트 사용을 유지하면서,
원하는 사용자에게만 GitHub App을 통한 Private 저장소 목록 선택을 제공한다.
처음에는 사용자 인증과 설치 대상 저장소의 허용 절차가 추가되고, 이후 허용된 저장소는
목록에서 선택하여 소유자·이름·기본 브랜치를 채울 수 있게 한다.

기본 로그인에 OAuth `repo` 권한을 추가하지 않는다. 별도 GitHub App은 저장소의
`Metadata: read`만 요청하며, 목록은 App과 현재 GitHub 사용자 모두에게 허용된 범위로 제한한다.
추가 연동을 하지 않거나 조직 승인이 필요한 경우에도 URL 입력으로 등록할 수 있다.

- Drafting mode: `WHOLE_SDD`.
- 위험 분류: `HIGH-RISK`; 선택형 인증, 외부 토큰 보관, Private 메타데이터와 조직 권한을 다룬다.
- 전체 설계 상태: 승인된 제품 방향에 따라 서버·UI·마이그레이션·검증 코드를 구현했다. 실제 App 등록과 일반 공개는 별도 게이트다.
- 구현 상태: 기본 OFF인 코드와 로컬 검증을 완료하고 `dev`에 병합했다. 운영 자격 증명·App·조직 인수는 후속 작업으로 남아 있다.
- 근거 기준: `e3fd4f939bb27271ab86cb904ef7c16e2218a0e8`, 2026-10-23, Next.js 16.3.3.
- 작성 시작 브랜치: `harness/private-repository-picker-spec`; 시작 시 미커밋·미추적 변경 없음. 구현 시에는 브랜치·커밋·작업 트리를 다시 확인한다.
- 현재 쓰기 권한은 front matter의 implementation approval-scope를 따른다. 실제 App 등록·운영 비밀 공급·배포·live 사용자 API 인수는 수행하지 않는다.

## Goal

- Private 저장소 사용자가 목록에 저장소가 없다는 이유로 연결 불가로 오해하지 않게 한다.
- 반복 등록 시 URL 복사와 기본 브랜치 수동 입력을 줄인다.
- 사용자가 목록 연동의 편의와 추가 권한 승인 여부를 직접 선택하게 한다.
- Stagekeeper 로그인, GitHub 목록 연동, 프로젝트 등록·연결 해제를 서로 구분한다.

## Proposal Size

`proposal-size: standard`. 인증·권한·서버 모듈·DB·캐시·콜백·입력 상태·제품 문구가 함께 바뀐다.
`HIGH-RISK`는 실패의 개인정보·인가 영향을 나타내며, 문서 길이나 구현 파일 수로 정한 등급이 아니다.
이 문서는 전체 요구사항과 Phase 완료 책임을 소유한다. 각 Phase의 상세 구현 계획은 착수 전에 별도로 정합화한다.

## Current State

이 절의 Observed 기록은 설계 기준 커밋의 구현 전 상태다. 현재 구조는 `docs/architecture/`와 이 문서의 Implementation Results를 따른다.

### 근거와 계약 대조

| 관심사 | 현재 관찰·계약 | 제안과의 관계 | 구현 영향 |
| --- | --- | --- | --- |
| 기본 로그인 | Observed: `src/server/auth/config.ts`는 기존 GitHub provider와 `githubId` 기반 사용자 upsert를 사용한다. 설치된 provider 기본 scope는 `read:user user:email`이다 | aligned | 현재 로그인 provider·세션 식별자를 유지한다 |
| 로그인과 저장소 연동 | Observed: JWT에는 `uid`를 넣으며 GitHub access/refresh token을 DB·세션 DTO에 보관하는 구현은 없다 | absent | 목록 연동 전용 토큰 저장·갱신·해제 수명주기가 필요하다 |
| Public 목록 | Observed: `src/server/github.ts:listPublicRepos`는 인증 없이 `/users/{login}/repos` 한 페이지를 조회하고 `revalidate: 300`을 사용한다 | 부분 충돌 | Public 동작은 보존하되 Private 요청에 이 캐시·응답 타입을 재사용하지 않는다 |
| 웹 진입점 | Observed: `src/app/(app)/p/new/page.tsx`가 로그인 사용자의 Public 목록을 읽어 `NewProjectForm`에 전달한다 | 부분 충돌 | 선택형 연동 상태와 사용자 범위 목록을 추가한다 |
| 저장소 정체성 | Observed: `RepoOption`은 `name/defaultBranch`만 가지며 `pick`은 `defaultOwner`를 소유자로 사용한다 | conflict | 조직·다른 소유자의 저장소를 선택하려면 실제 owner와 GitHub repository ID를 운반해야 한다 |
| URL 입력 | Observed: `create-project.server.ts`는 URL에서 나온 owner/repo 이름을 검증하고 등록하며 공개 여부나 GitHub 접근 가능 여부를 확인하지 않는다 | aligned | 수동 등록에 GitHub App 승인을 새 전제조건으로 붙이지 않는다 |
| 프로젝트 소유권 | Contracted: `Project.ownerUserId`는 Stagekeeper 사용자, `repoOwner`는 GitHub 저장소 소유자다. 등록·상한·재연결은 projects 서비스가 소유한다 | aligned | GitHub App 설치 권한으로 Stagekeeper 프로젝트 권한을 부여하지 않는다 |
| 서버 경계 | Contracted: `github.ts`는 기능 모듈을 참조하지 않는 루트 기반 파일이다. 현재 서버 모듈 목록에는 `github` 기능 모듈이 없다 | conflict | 루트 파일에 인증·DB 기능을 누적하지 않고 먼저 새 모듈 경계를 승인받는다 |
| 문구 | Contracted: `product-copy.md` §10은 Private 미노출과 URL 대안을 명시한다 | conflict | 기능 활성화 시 §10과 실제 UI·문구 검증을 같은 변경에서 갱신한다 |
| 브라우저/서버 시험 | Observed: `test:web`, `test:server`, 격리 DB의 `test:server:integration`, 스크립트 기반 브라우저 fixture가 있다. 전용 E2E runner는 없다 | aligned | 기존 실행 환경을 사용하고 테스트 위치만 근거로 새 runner를 도입하지 않는다 |

확인한 주요 원본:
[로그인](../../../src/server/auth/config.ts), [이전된 Public 목록](../../../src/server/github/public-repositories.ts),
[등록 Action](../../../src/fsd/features/create-project/api/create-project.server.ts),
[입력 상태](../../../src/fsd/features/create-project/model/repository-entry-state.ts),
[등록 서비스](../../../src/server/projects/registration-service.ts),
[스키마](../../../prisma/schema.prisma), [서버 경계](../../architecture/server.md),
[FSD 경계](../../architecture/fsd.md), [제품 문구](../../conventions/product-copy.md).

### 외부 계약과 근거 한계

2026-10-23 공식 문서를 읽어 다음 계약을 확인했다. 실제 Stagekeeper용 GitHub App 설정과 운영 비밀 값은 조회하지 않았다.

| 공식 출처 | 확인한 계약 | 설계 적용 |
| --- | --- | --- |
| [OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) | OAuth `repo`는 Private 저장소의 코드 읽기·쓰기를 포함한다 | 기존 로그인에 이 scope를 추가하지 않는다 |
| [GitHub App 사용자 인증](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user) | 사용자 토큰의 접근 범위는 사용자의 접근권한과 App 설치·권한의 교집합이다 | 설치 전체에 접근하는 토큰으로 사용자별 목록을 대신 만들지 않는다 |
| [사용자 토큰 발급](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) | web flow의 state·PKCE와 사용자 토큰, 만료 응답을 지원한다. `offline_access`는 만료·refresh 동작 선택이며 저장소 권한 scope가 아니다 | 별도 연동 flow에서 PKCE S256을 사용하고 만료 가능한 사용자 토큰을 요구한다 |
| [사용자별 installation/repository API](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token) | `/user/installations`와 `/user/installations/{installation_id}/repositories`로 범위를 조회한다. 후자는 `Metadata: read`를 요구한다 | 현재 사용자의 사용자 토큰으로만 조회하고 페이지를 나눈다 |
| [Setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url) | 설치 후 setup URL과 사용자 승인 후 callback URL은 다르다. 전달된 installation ID 자체는 신뢰 근거가 아니다 | 두 콜백을 구분하고 설치 ID는 사용자 토큰으로 재검증한다 |
| [토큰 refresh](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens) | refresh 시 기존 토큰 쌍이 더 이상 유효하지 않게 된다 | DB 기준 단일 갱신과 응답 유실 처리가 필요하다 |
| [브랜치 API](https://docs.github.com/en/rest/branches/branches#list-branches) | Private 브랜치 목록·조회는 `Contents: read`를 요구한다 | 기본 브랜치 메타데이터만 자동 입력하고 전체 브랜치 목록 기능은 추가하지 않는다 |
| [Webhook 검증](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) | webhook 비밀을 이용해 전달 서명을 검증한다 | 원문 body 검증 후 폐기·무효화만 처리한다 |
| [설치 URL의 state](https://docs.github.com/en/apps/sharing-github-apps/sharing-your-github-app) | 설치 URL에 별도 state를 전달해 복귀 시도를 식별할 수 있다 | OAuth 시도와 설치 시도에 서로 다른 일회 state를 사용한다 |
| [App 등록 옵션](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-using-url-parameters) | `request_oauth_on_install: true`이면 setup URL을 사용할 수 없다 | 이 문서의 두 callback 구조는 `request_oauth_on_install: false`를 전제로 한다 |
| [App 배포 범위](https://docs.github.com/en/apps/sharing-github-apps/sharing-your-github-app) | 다른 사용자·조직이 설치하려면 App이 public이어야 한다 | 일반 사용자 활성화 전 App의 `public: true`를 확인한다. 저장소의 공개 여부와는 별개다 |
| [설치 허용 범위 변경](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps) | 기존 설치의 저장소 추가·제거는 GitHub의 Configure에서 수행하며 사용자별 관리 권한이 다르다 | 연동이 유효한 관리 동작은 OAuth 재승인을 강제하지 않고, 복귀 후 실제 목록을 다시 검증한다 |
| [개별 사용자 토큰 폐기](https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token) | GitHub App도 client 인증으로 개별 토큰을 폐기할 수 있다 | `/token`과 전체 사용자 grant를 지우는 `/grant`를 구분한다 |
| [Webhook payload](https://docs.github.com/en/webhooks/webhook-events-and-payloads#github_app_authorization) | 사용자 권한 철회는 action/sender를 제공하며 모든 이벤트에 installation/app ID가 있지는 않다 | 이벤트별 스키마와 App 전용 서명 키로 처리하고 공통 app ID 필드를 강제하지 않는다 |

Inferred: 현재 불편은 URL 복사 외에도 Public 전용 목록을 전체 저장소 목록으로 받아들이는 기대 차이에서 발생할 수 있다.
이탈률·등록 시간 개선은 아직 측정하지 않았다. 추가 승인 단계가 모든 사용자에게 더 빠르다고 가정하지 않는다.
Unresolved: 실제 App 등록, 조직 승인·SSO 사례, 비밀 저장·키 교체 운영은 Phase별 blocker다.

## Scope

포함 범위:

- 기존 로그인과 분리된 GitHub App의 선택형 사용자 승인·설치 관리·목록 조회.
- Public/허용된 Private 저장소의 실제 owner/name/defaultBranch 표시·선택·등록 연계.
- 취소·재진입·초안 복원·권한 변경·토큰 갱신·목록 연동 해제와 URL 대안.
- 전용 토큰 저장 모델, 인증 콜백과 webhook, 부가 기능 배포·복구 절차.

제외 범위:

- GitHub 코드·파일·커밋·브랜치 전체 목록 읽기, 쓰기, PR 생성 및 저장소 수정.
- 기존 OAuth 로그인 교체, 모든 사용자에 대한 GitHub App 설치 강제, PAT 직접 입력.
- GitHub 설치를 Stagekeeper 팀·프로젝트 멤버십으로 해석하는 권한 모델 변경.
- URL 직접 등록에 새로운 GitHub 소유권 검사를 강제하는 변경.
- 공개 저장소 검색 API의 기존 페이지 제한을 전면 개편하는 별도 작업.
- GitHub Enterprise Server의 별도 host, `internal` 전용 UX, 브랜치 목록 선택을 지원한다고 주장하는 확장.
  현재 URL parser의 GitHub.com 경계는 유지한다. 허용하지 않은 visibility는 Public으로 추정하지 않고 부분 실패로 구분한다.
- CLI를 웹 사용의 필수 선행 단계로 만드는 변경. 기존 로컬 자동 등록은 보조 경로로 유지한다.
- 이번 문서 작성 중 코드·계약 문서·환경 설정·마이그레이션·운영 자원 수정.

### 구현 분류와 범위 보호

| 분류 | 적용 항목 | 적용 경계 |
| --- | --- | --- |
| Core | 18개 요구사항을 위한 선택형 연동·URL 대안·계정 격리·시도·토큰 갱신·해제·webhook·복구와 그 시험 | 사용자에게 선택 기능이라는 이유로 보안·수명주기를 선택 구현으로 빼지 않는다. P1/P2/P3는 의존 단계이며 모두 최종 완료에 필요하다 |
| Approval-after | P0의 아키텍처·vault/보존 정책 승인, App 생성·비밀 공급·실제 계정/조직 인수·운영 활성화 | Core의 기능을 제거하는 분류가 아니다. 해당 쓰기·외부 작업 전 필요한 승인/입력이며 BLK-PRV-01부터 BLK-PRV-04와 연결한다 |
| Phase 2 선택 개선 | 이번 제안에는 별도 배정하지 않음 | 문서의 Phase PRV-P2 UI 단계와 이 분류는 다르다. 필수 보안을 후속 선택 개선으로 미루지 않는다 |
| Out of scope | 기존 Scope의 코드/브랜치 내용 접근·로그인 교체·PAT·강제 CLI·팀 권한 변경·별도 host 확장 | 파일 목록·API·설정·검증·완료 조건에도 구현 대상으로 추가하지 않는다 |

구체 파일 목록은 Core 구현의 경계다. 실제 변경 권한은 front matter에 기록하며 외부 App·운영 활성화는 포함하지 않는다.

## User Stories

### US-PRV-01: 반복 등록하는 Private 저장소 선택

Private 저장소 사용자로서, 목록 연동을 선택해 허용한 저장소를 이름으로 찾고
기본 브랜치를 확인한 뒤 프로젝트를 등록하고 싶다.

### US-PRV-02: 추가 연동 없이 등록

추가 연동을 원하지 않거나 조직 승인을 기다리는 사용자로서,
URL 입력으로 프로젝트를 등록하고 기존 프로젝트를 계속 사용하고 싶다.

## Behavioral Requirements

### REQ-PRV-001: 기존 로그인과 프로젝트 사용

The system shall 기존 GitHub 로그인·세션과 이미 등록된 프로젝트의 접근·사용 흐름을 유지한다.
추가 목록 연동을 하지 않아도 로그인과 기존 프로젝트 접근이 가능해야 한다.

### REQ-PRV-002: 명시적 선택 후 추가 권한 요청

WHEN 사용자가 Private 저장소 목록 연동을 선택하면, the system shall 요청 정보와 허용 범위를 안내한 뒤에만
외부 승인 화면으로 이동하며, 화면 방문·기존 로그인·프로젝트 열기만으로 승인 절차를 시작하지 않는다.

### REQ-PRV-003: 동일 계정과 유효한 연동 시도

WHEN 승인 또는 설치 콜백이 도착하면, the system shall 현재 Stagekeeper 사용자와 동일한 GitHub numeric ID,
해당 브라우저에 묶인 해당 종류의 미소비·미만료 시도 및 허용된 App을 확인한 경우에만 연동 결과를 반영한다.
OAuth 승인 시도와 설치 시도는 각각 소비하며, 소비된 OAuth state를 설치 callback에 재사용하지 않는다.
같은 사용자·브라우저의 다른 탭에서 새 시도를 시작하면 이전 시도는 superseded로 거부한다.
이전 탭의 취소·콜백은 새 시도나 현재 grant를 변경하지 않는다.

### REQ-PRV-004: 사용자 범위의 허용 저장소 목록

WHILE 목록 연동이 유효하면, the system shall 사용자와 App 모두가 접근 가능한 저장소만 페이지 단위로 제공하고,
검색 범위와 추가 페이지 유무를 표시하며, 이름·소유자·Private 표시로 선택 대상을 구분한다.

### REQ-PRV-005: 올바른 저장소·브랜치 입력

WHEN 사용자가 연동 목록에서 허용된 저장소를 명시적으로 선택하면, the system shall 그 저장소의 실제 owner/name과 제공된 default branch를 입력하고
확인 가능한 요약을 보여준다. 기본 브랜치를 확인할 수 없으면 임의의 `main`을 확정하지 않고 브랜치 직접 입력을 요구한다.
목록 갱신·콜백 복귀만으로 기존 slug·표시 이름·직접 입력한 브랜치를 덮어쓰지 않는다.

### REQ-PRV-006: 항상 사용할 수 있는 수동 등록

WHILE 추가 연동이 없거나 거부·취소·오류·승인 대기·재승인 필요·기능 비활성 상태이면,
the system shall 기존 URL·직접 입력 등록을 제공하고 App 권한을 등록 전제조건으로 요구하지 않는다.

### REQ-PRV-007: 외부 승인 전후의 입력 복원

WHEN 사용자가 외부 승인에서 돌아오거나 취소·만료 결과를 확인하면, the system shall 동일 사용자에게만
유효 기간 내 저장한 입력 초안을 복원하며, 명시적 Start over 이후에는 이전 초안을 되살리지 않는다.

### REQ-PRV-008: Public 선택과 저장소 중복 표시

WHILE Public 목록을 사용하는 동안, the system shall 기존 선택·기본 브랜치 입력을 유지한다.
WHEN 같은 저장소가 Public 목록과 추가 연동 목록에 함께 포함되면, the system shall 동일 저장소를 한 번만 표시한다.

### REQ-PRV-009: 선택의 재검증과 등록 부수효과

WHEN 연동 목록에서 선택한 저장소의 프로젝트 생성 요청을 받으면, the system shall 현재 연동 revision과
사용자 범위의 repository ID·현재 정체성을 재검증한 뒤 기존 등록 서비스를 호출한다.
검증 실패와 승인 콜백만으로는 프로젝트·Stagekeeper 토큰을 생성하지 않는다.

### REQ-PRV-010: 실패와 부분 결과의 구분

IF 목록 조회가 실패하거나 일부 설치 범위만 조회되면, THEN the system shall 빈 목록·전체 성공과 구분하여
다시 시도·추가 허용·URL 입력 중 가능한 동작을 제공하고 오래된 실패 응답으로 최신 목록을 덮어쓰지 않는다.

### REQ-PRV-011: 만료와 반복 사용

WHEN 사용자 토큰이 만료되고 갱신이 가능하면, the system shall 유효한 연동 세대에서 한 번의 갱신 결과를 공유하여
사용자가 목록 조회를 계속하게 한다. IF 갱신이 불가능하거나 결과가 불확실하면, THEN the system shall
재승인 또는 다시 조회할 상태를 표시하고 무한 재승인·자동 재전송 루프를 만들지 않는다.

### REQ-PRV-012: 목록 연동 해제와 권한 철회

WHEN 사용자가 목록 연동을 해제하거나 GitHub가 권한 철회를 알리면, the system shall 해당 범위의 토큰 사용과
Private 목록 제공을 중지하고, 기존 Stagekeeper 프로젝트·이력·hs_/hu_/ho_ 토큰을 변경하지 않는다.

### REQ-PRV-013: 계정·세션 간 격리

IF 세션이 만료되거나 사용자가 바뀌면, THEN the system shall 이전 사용자의 Private 목록·초안·선택 정보를
다음 사용자에게 제공하지 않으며, 이전 사용자 요청의 늦은 응답을 현재 화면에 적용하지 않는다.

### REQ-PRV-014: 조직 승인·SSO·허용 범위 부족

IF 조직 승인이나 추가 허용·SSO 절차가 필요하면, THEN the system shall 확인된 원인에 맞는 안내와
URL 대안을 제공하고 설치 완료·Private 조회 성공·프로젝트 연결 완료로 표시하지 않는다.

### REQ-PRV-015: 기능 비활성화와 장애 격리

WHILE 추가 목록 기능이 비활성화되거나 구성에 문제가 있으면, the system shall 추가 연동만 사용할 수 없게 하고
기존 로그인·Public 선택·URL 등록·기존 프로젝트 사용을 계속 제공한다.

### REQ-PRV-016: 키보드와 상태 전달

The system shall 연동 선택·목록 검색·저장소 선택·URL 전환·복구를 키보드로 수행할 수 있게 하고,
loading·결과·오류 상태를 보조 기술에 전달하며 외부 승인 복귀 후 초점 위치를 정한다.

### REQ-PRV-017: 민감정보를 제외한 관측

The system shall 연동 시작·완료·취소·실패 분류와 등록 소요 시간을 비밀 값·Private 저장소 이름·URL을
로그와 분석 이벤트에 포함하지 않고 관측할 수 있게 한다.

### REQ-PRV-018: 호환 배포와 복구

WHILE 스키마·애플리케이션을 단계적으로 배포하거나 되돌리는 동안, the system shall 기존 사용자·프로젝트·등록 결과를
보존하고, 추가 연동을 중지해도 기존 서버와 수동 등록을 사용할 수 있게 한다.

## Domain Invariants

### INV-PRV-001: 사용자 정체성

Stagekeeper `User.id`와 `User.githubId`가 연동의 소유자를 결정한다. 변경 가능한 login 문자열이나 브라우저가 보낸
사용자 ID·installation ID만으로 소유권을 바꾸지 않는다.

### INV-PRV-002: 조회 권한의 교집합

Private 목록의 허용 집합은 현재 사용자의 접근 가능 저장소와 해당 App의 설치·권한 범위의 교집합이다.
조직에 App이 설치됐다는 사실은 그 조직의 모든 사용자가 모든 저장소를 볼 수 있다는 뜻이 아니다.

### INV-PRV-003: 두 연결의 독립성

GitHub 목록 연동과 `Project.disconnectedAt` 기반 프로젝트 연결은 독립적이다.
GitHub 목록 연동은 프로젝트 생성, 소유자 변경, 플랜 상한 우회, 재연결 또는 게이트 승인이 아니다.

### INV-PRV-004: 메타데이터 전용 권한

추가 App의 저장소 권한은 `Metadata: read`만 허용한다. `Contents`, Issues, Pull requests, Administration 등의
추가 권한과 기존 OAuth의 `repo`·`public_repo` scope는 이 기능의 필요 권한으로 확장하지 않는다.

### INV-PRV-005: 외부 자격 증명 비노출

GitHub access/refresh token·client secret·PKCE verifier는 서버의 승인된 저장·처리 경계 밖으로 내보내지 않는다.
이를 Stagekeeper 토큰 테이블, JWT/session DTO, Client Component props, URL, localStorage 또는 분석 이벤트에 저장하지 않는다.

### INV-PRV-006: 안정적인 저장소 선택

연동 저장소의 정체성은 GitHub repository ID와 현재 canonical owner/name으로 대조한다.
동명이거나 여러 installation 경로로 조회된 저장소를 이름만으로 병합하거나 로그인 사용자의 owner로 치환하지 않는다.

## Engineering Constraints

### CON-PRV-001: 아키텍처 변경 승인과 원자적 이전

현재 계약은 [server.md](../../architecture/server.md)·[fsd.md](../../architecture/fsd.md)다.
새 서버 모듈과 루트 `github.ts` 이전은 Phase PRV-P0의 ADR·계약 승인 후에만 구현한다.
P0는 목표 경계와 전환 순서를 승인한다. 실제 rootFiles 제거·현재 구조 문서 갱신은 파일 이동·caller 수정과 같은 P1 변경에서 적용한다.
원본이 아직 루트에 있는데 검사기에서 먼저 허용을 제거하는 중간 상태를 만들지 않는다.
이 제안서 자체는 현재 아키텍처를 덮어쓰지 않는다.

### CON-PRV-002: 기존 등록 정책 재사용

신규 목록 선택도 `registerWebProject`의 owner lock·상한·기존 프로젝트·disconnected 처리·최초 토큰 발급 계약을 사용한다.
`POST /api/projects`와 CLI 등록, 기존 URL 입력 및 등록 결과 DTO는 호환성을 유지한다.

### CON-PRV-003: 분리된 GitHub App 인증

기존 `AUTH_GITHUB_ID/SECRET`과 별도의 App client 설정을 사용한다. App 승인에는 PKCE S256과
서버 검증 state를 사용한다. 만료 토큰을 위해 공식 지원되는 `offline_access`만 선택할 수 있으며,
이를 코드 읽기·쓰기 권한 요청으로 설명하지 않는다. 기본 로그인 scope는 바꾸지 않는다.

### CON-PRV-004: Private 요청의 캐시·수명

Private 조회와 콜백은 `fetch(..., { cache: "no-store" })`, `Cache-Control: private, no-store`를 사용한다.
기존 Public `revalidate: 300`을 승계하지 않으며 세션·연동 세대가 다른 RSC/클라이언트 결과를 재사용하지 않는다.
설치 버전의 async `cookies()`와 Route Handler cookie 변경 경계를 따른다.

### CON-PRV-005: 비밀 저장과 회전

복호화 가능한 GitHub 토큰은 승인된 별도 키를 사용해 인증 암호화하고 key ID를 함께 보관한다.
기존 해시 전용 Stagekeeper 토큰 저장 방식을 전용하지 않고 `AUTH_SECRET`을 암호화 키로 재사용하지 않는다.
단일 refresh·연동 해제·늦은 콜백은 DB의 세대/version 검사를 통해 여러 서버 인스턴스에서도 일관되게 처리한다.

### CON-PRV-006: 검증 도구와 테스트 위치

기존 Node test·tsx·서버 bootstrap·격리 PostgreSQL 및 브라우저 fixture 환경을 사용한다.
신규 단위 시험은 소유 코드 옆, 서버 bootstrap/라우트 시험은 `tests/server`, DB 시험은 `tests/server/integration`에 둔다.
`src/`·`src/app/` 바로 아래에 테스트나 테스트 전용 디렉터리를 만들지 않는다.

### CON-PRV-007: 문구와 기능 배포의 일치

현재 §10의 Private 미노출 문구를 실제 기능 상태에 맞춰 같은 구현 변경에서 갱신한다.
전체 코드가 같은 문구를 쓰도록 [product-copy.md](../../conventions/product-copy.md)와 관련 시험을 함께 수정한다.
미구성·비활성 환경에서는 Private 선택 가능 여부를 성공으로 광고하지 않는다.

### CON-PRV-008: 문서 작성 권한과 외부 작업 경계

현재 요청으로 제품 코드·schema/migration·계약·시험과 PR 제출이 승인됐다. 새 제품 의존성은 추가하지 않는다.
App 생성·설정, 운영 비밀 값 등록, live GitHub API 인수와 운영 활성화는 별도 범위다.

## Proposal

### 사용자 경험과 문구 방향

| 사용자 상황 | 제안 동작 |
| --- | --- |
| 기존 사용자·기존 프로젝트 | 재로그인·App 설치 없이 기존 경로를 사용한다 |
| Public 저장소를 새로 등록 | 기존 선택을 유지하고 Public 범위임을 명시한다 |
| Private 저장소를 처음 목록에서 선택 | `Connect private repositories` 선택 → 안내 → GitHub 사용자 승인·설치 범위 지정 → 허용 목록 확인 → 명시적 프로젝트 생성 |
| 이미 허용한 Private 저장소 추가 | 현재 유효한 연동으로 목록을 조회하고 저장소를 선택한다. 토큰 갱신은 유효한 범위에서 서버가 처리한다 |
| 추가 권한 거부·조직 승인 대기 | `Paste a repository URL`을 동일 화면에서 사용할 수 있다 |
| 신규 저장소가 허용 범위 밖 | `Manage repository access`로 GitHub의 설치·설정 화면을 열고, 허용 변경 후 목록을 다시 조회한다. 관리 권한이 없으면 요청 안내·URL 대안을 제공한다 |
| 목록 연동 해제 | `Disconnect repository list`로 표시하여 기존 프로젝트의 `Disconnect repository…`와 구분한다 |

문구는 제안 초안이며 Phase PRV-P2의 §10 정합화 대상이다. 권한 안내에는 사용 정보와 코드 읽기·쓰기 권한을
요청하지 않는다는 사실, GitHub에서 선택한 허용 범위, 연동 거부 시 URL 등록 가능함을 포함한다.
처음 한 번 등록하는 사용자에게 추가 승인보다 URL 입력이 빠를 수 있으므로 강제 전환하지 않는다.

### 제안 서버·프런트엔드 소유권

다음은 승인된 소유권과 이전 계약이다. 실제 변경·검증 기록은 Implementation Results에 연결한다.

1. 새 기능 모듈 `src/server/github/`가 Public adapter, 선택형 승인, 사용자 범위 목록, token vault와 refresh를 소유한다.
   주입형 서비스·직접 타입을 정의한 `contracts.ts`와 `server-only`인 `api.server.ts`를 구분한다.
   현재 계획의 제품 소비자는 runtime API만 필요하므로 시험을 위해 빈 `api.ts`나 재수출 API를 추가하지 않는다.
   환경·DB singleton·비밀 값·HTTP provider는 runtime 바인딩에서만 조립한다.
2. 기존 `src/server/github.ts`는 `github/public-repositories.ts`로 옮긴다. 루트 기반 파일이 새 기능 모듈을
   재수출하는 영구 우회 wrapper는 만들지 않는다. Public의 이름·기본 브랜치·archived 제외와 오류 분류는 유지한다.
   repository ID·owner를 추가하는 내부 DTO 변경은 page·form·기존 `tests/server/github.test.ts`를 함께 갱신한다.
3. `src/app`의 새 API Route Handler는 세션 확인·요청 제한·HTTP 변환만 조합한다.
   정확한 제안 method/route는 아래 HTTP 계약 표를 따른다. 현재 존재하는 route나 승인된 운영 URL이라는 뜻은 아니다.
4. 새 `github` 모듈은 다른 기능 모듈에 의존하지 않는 방향을 우선한다.
   서비스는 DB·clock·GitHub client·vault를 주입받는다. auth·usage guard의 호출은 진입점 조합에서 수행한다.
   방향표·rootFiles·공개 API 목록과 검사기 fixture를 동시에 갱신해야 하며 모듈 예외로 검사를 끄지 않는다.
5. UI와 입력 상태는 기존 `features/create-project`에 둔다. 다른 feature를 직접 import하는 새 feature 분리는 하지 않는다.
   사용자별 목록용 server adapter는 같은 slice의 `api`에 두고 public API를 통해 page에 연결한다.

### 브라우저 전이와 HTTP 계약

아래는 새 endpoint의 제안 계약이다. 기존 `/api/projects`의 응답은 변경하지 않는다.
JSON 오류는 `ok: false`, 제한된 `code`, 사용자용 `message`를 가지며 provider 원본 body·URL·예외를 포함하지 않는다.
성공 JSON은 `{ ok: true, value: ... }`이며 아래 표의 결과 필드는 `value` 안에 둔다. callback/webhook의 redirect·204 응답은 이 envelope를 쓰지 않는다.
공통 code는 `UNAUTHENTICATED`, `INVALID_INPUT`, `INVALID_STATE`, `STALE_CONNECTION`,
`ACCOUNT_MISMATCH`, `REAUTH_REQUIRED`, `PERMISSION_REQUIRED`, `RATE_LIMITED`, `UNAVAILABLE`로 제한한다.

| Method / route | 입력·인증 | 성공 body·브라우저 동작 | 실패·권한 경계 |
| --- | --- | --- | --- |
| POST `/api/github/connection/start` | 현재 세션, 동일 Origin/CSRF, action `authorize` 또는 `manage`, 초안 allowlist. `manage`는 유효한 현재 grant 필요 | `authorize`는 승인 시도, `manage`는 현재 revision에 묶인 새 설치 시도를 만든다. 200 JSON의 `redirectTo`로 client가 top-level navigation 수행 | 잘못된 요청 400, 세션 없음 401 JSON, 재승인 필요한 manage는 409/`REAUTH_REQUIRED`, 구성/flag 불가 503. fetch의 cross-origin redirect에 의존하지 않음 |
| GET `/api/github/connection/callback` | OAuth code/state, 해당 종류의 시도·브라우저 binding·현재 세션 | 코드 검증·grant 저장 후 303으로 깨끗한 `/p/new` 또는 새 state의 설치 URL로 이동 | 잘못된/소비된 code를 재교환하지 않음. session 만료는 비밀 query를 제거한 고정 로그인 경로로 이동 |
| GET `/api/github/connection/installation` | 설치 state, installation ID, 현재 grant·세션·브라우저 binding | 설치를 사용자 토큰으로 검증한 뒤 303 `/p/new` | 설치 ID나 setup_action만으로 성공하지 않음. 거부/대기는 안전한 결과로 복귀 |
| GET `/api/github/connection/draft` | 현재 세션과 시도 binding, 해당 탭이 보관한 flow ID | 복원 가능한 초안만 200 JSON; 없으면 `draft: null` | 읽기만으로 소비하지 않음. 다른 사용자·브라우저·flow·만료 시도 비노출 |
| POST `/api/github/connection/draft` | 현재 세션·Origin/CSRF, draft ID와 세대 | 적용 확인을 idempotent하게 처리하고 민감 초안 제거 | stale 응답이 새 초안을 지우지 못함 |
| POST `/api/github/connection/cancel` | 현재 세션·Origin/CSRF, 해당 시도 ID | 서버가 소유권을 확인한 같은 flow의 시도·초안을 idempotent하게 취소 | 이전 탭의 ID로 새 flow·grant를 취소하지 않음. 단순 GET·뒤로 가기로 서버 권한 변경하지 않음 |
| POST `/api/github/connection/disconnect` | 현재 세션·Origin/CSRF, 확인한 connection revision | 로컬 중지와 개별 provider 토큰 폐기 결과를 구분해 반환 | stale revision은 409로 거부. 공유 installation·전체 grant 삭제 금지, provider 폐기 실패를 성공으로 표시하지 않음 |
| GET `/api/github/repositories` | 현재 세션, 고정 installation 범위와 opaque cursor | 상태·검증된 `repositories`·`nextCursor`·부분 실패 범위만 200 JSON | 세션 없음 401, stale 409, rate limit 429/Retry-After, 실패 503. 실패에 이전 Private rows를 섞지 않음 |
| POST `/api/github/webhook` | App 전용 서명, 원문 body, event별 schema | 처리/검증된 중복/무관 이벤트에 204, body 없음 | 세션 불필요. 서명 오류 401, 잘못된 body 400, 크기 초과 413; 중지 기능은 flag와 분리 |

페이지용 `requireUser()`는 `redirect("/login")`을 수행한다. 따라서 JSON API는 이 guard의 redirect를 그대로 재사용하지 않고
기존 `auth()`의 `session.user.id`를 확인해 401 JSON을 반환한다. callback의 top-level navigation만 정해진 redirect 응답을 사용한다.
GitHub ID는 session에 새로 공개하지 않고, 신뢰한 userId로 서버에서 현재 User row를 조회한다.
client는 기대 Stagekeeper user ID를 요청 header와 form에 싣고 서버는 현재 세션과 다르면 거부한다. 이 값으로 인증 주체를 선택하지 않는다.

현재 `NewProjectForm`은 생성용 `<form>` 하나다. 연동·관리·해제·취소·Load more 버튼은 `type="button"`으로 두고,
client adapter가 JSON API를 호출한다. 중첩 form이나 기본 submit 버튼으로 승인 시작이 Create project를 실행하게 만들지 않는다.
`redirectTo`는 서버가 만든 GitHub의 고정 authorize/App-install 경로만 허용하며 임의 return URL·브라우저 owner 값을 조립하지 않는다.
SSR은 초기 상태와 초안을 읽기만 하고 cookie 설정·삭제나 초안 적용 확인을 수행하지 않는다.

### 데이터와 비밀 저장 경계

제안 모델명은 Phase PRV-P1 상세 계획에서 기존 Prisma 규약과 정합화한다.

| 제안 소유 데이터 | 필요한 정보·수명 | 보존 금지·경계 |
| --- | --- | --- |
| `GitHubConnection` | User 참조, 확인된 githubId, sealed access/refresh token, 두 만료 시점, key ID, grant version, 해제 상태, refresh lease | 토큰을 Project/UserToken/JWT에 복제하지 않는다. 해제 시 비밀 값을 제거하고 늦은 쓰기를 막는 세대 정보만 유지한다 |
| `GitHubConnectAttempt` | 종류 `authorization`/`installation`, state hash, 사용자·브라우저 binding hash, 기대 grant version, PKCE verifier 또는 초안의 sealed payload, 만료·소비 시각 | 각 종류의 시도를 따로 소비한다. 유효 기간 제안은 10분. raw state·token·복귀 URL을 DB 일반 문자열이나 로그에 남기지 않는다 |
| 설치 연관 정보 | 사용자 연동과 검증된 installation ID의 관계, 무효화 세대 | 조직 전체 설치의 권한을 사용자별 접근권한으로 재사용하지 않는다 |
| webhook 중복 처리 정보 | delivery ID의 unique key와 처리 상태·유한 보존 기간 | 전체 payload, Private 저장소 이름, 토큰을 증거 자료로 저장하지 않는다 |

`User`·`Project`·Stagekeeper 토큰 데이터는 새 컬럼 기본값을 전제하지 않는 additive migration으로 보존한다.
기존 사용자에게는 GitHubConnection이 없는 상태가 정상이다. 전체 저장소 목록을 DB에 복제하는 영구 캐시는 초기 범위에서 제외한다.
만료 시도·초안·webhook 중복 처리 기록의 물리 정리 방식과 보존 기간은 Phase PRV-P0에서 운영 계약으로 확정한다.

### 정상 승인·설치 흐름

1. 화면의 명시적 POST만 연동 시도를 만든다. 현재 세션·Origin/CSRF·계정 요청 제한을 확인하고,
   허용된 입력 필드만 크기를 제한해 초안으로 보존한다. 복귀 대상은 서버가 정한 `/p/new`로 고정한다.
2. state는 추측 불가능한 일회성 값으로 만들고, 요청 브라우저의 HttpOnly·Secure·SameSite=Lax binding cookie와 묶는다.
   사용자·브라우저별 최신 시도만 완료할 수 있게 하며 이전 시도는 superseded 처리한다.
   같은 cookie를 쓰는 두 탭도 이 규칙을 공유한다. 탭별로 승인 flow가 독립 완료된다고 약속하지 않는다.
   cookie 수명은 20분이며 새 start는 값을 바꾸지 않고 만료만 갱신한다. 각 시도의 10분 수명과 두 단계 복귀를 수용한다.
   binding 값은 유효한 flow 동안 재사용하고 개별 callback이 이를 회전·삭제하여 다른 최신 시도를 깨뜨리지 않는다.
   cookie에는 GitHub 토큰을 넣지 않는다. 실서비스의 callback URL·cookie 범위는 등록 manifest와 일치해야 한다.
   로컬 HTTP 인수의 cookie 이름/secure 예외와 production의 secure 정책은 P0 운영 계약에 분리해 기록한다.
3. 기존 로그인과 별개인 App의 사용자 승인 flow를 PKCE S256으로 수행한다.
   `login` hint는 편의 기능이고 계정 확인의 근거는 아니다. 코드 교환 뒤 `/user`의 numeric ID를 `User.githubId`와 대조한다.
   다른 GitHub 계정이면 저장하지 않고 기존 Stagekeeper 로그인·연동 소유자도 바꾸지 않는다.
4. 사용자 승인 성공은 access/refresh 쌍·새 grant version 저장과 **authorization 시도만의 소비**를 원자적으로 처리한다.
   이미 설치된 허용 범위는 이 사용자 토큰으로 조회한다. 필요한 설치가 없으면 **새 installation 시도와 새 state**를 발급하고
   같은 브라우저·복원할 초안·새 grant version에 묶어 설치 화면으로 이동한다.
   OAuth state나 이미 소비한 authorization 시도를 재사용하지 않는다. setup URL의 installation ID는
   이 사용자 토큰의 installation/repository API로 검증하기 전에는 사용하지 않는다.
5. 단순 callback query를 권한·승인 완료의 증거로 저장하지 않는다. 설치 후 복귀·업데이트 복귀·승인 거부·취소는
   각각 검증된 시도와 현재 grant version으로 대조한다. 검증 실패·중복 callback은 프로젝트를 만들지 않는다.
6. 설치 성공은 installation 시도와 허용 범위 검증을 완료하고 해당 시도만 소비한다. 취소·승인 부족이면
   OAuth 사용자 승인만 된 상태와 설치 완료를 구별해 `/p/new`로 돌아온다. 자동 설치 redirect는 한 시도에 한 번만 허용한다.
   초안 복원과 안전한 안내 결과만 반환하고 OAuth code·state가 붙은 주소는 추가 페이지 이동에 전달하지 않는다.
   callback 응답은 no-store 및 referrer 제한을 적용한다.

이 순서를 사용하는 App의 제안 설정은 `request_oauth_on_install: false`, 별도 callback URL과 setup URL,
`setup_on_update: true`다. `true`인 자동 OAuth-on-install과 이 두 callback 구조를 섞지 않는다.
실제 설정 일치와 권한 allowlist는 BLK-PRV-03의 인수 자료로 확인한다.

### 기존 연동의 허용 범위 관리

`start`의 `action: manage`는 유효한 현재 사용자 grant를 확인하고, 그 revision·브라우저·초안에 묶인
새 installation 시도를 만든다. 고정된 `https://github.com/apps/{configured-slug}/installations/new`에
이 시도의 state를 붙여 이동하며, 유효한 연동에 OAuth 재승인을 덧붙이지 않는다.
grant 갱신이 불가능하면 `REAUTH_REQUIRED`를 반환하고 사용자가 명시적으로 재승인하도록 한다.
설치·설정 화면을 열었다는 사실을 저장소 추가 성공이나 사용자의 관리 권한으로 해석하지 않는다.

GitHub의 Configure·저장소 변경은 GitHub가 허용한 권한으로만 수행한다. 정상 setup callback은 기존 설치 검증 절차를 따르며,
callback·state 없이 돌아왔거나 변경하지 않고 뒤로 온 경우에는 성공으로 표시하지 않고 초안 복원·명시적 목록 재조회를 제공한다.
재조회는 현재 사용자 토큰의 교집합을 다시 읽는다. setup query·브라우저 복귀·webhook만으로 새 접근권한을 부여하지 않는다.
관리 권한 부족·조직 요청 대기는 확인된 상태만 안내하며 URL 대안을 유지한다.
일반 사용자·다른 조직에 제공하는 App은 `public: true`여야 한다. owner 전용 private App으로 수행한 인수를 일반 사용자 설치 증거로 대체하지 않는다.

### 목록 API와 UI 계약

연동 variant DTO의 필수 항목은 `repositoryId`, `installationId`, `owner`, `name`, `fullName`,
`repositoryPage`, `defaultBranch`, `visibility`, `connectionRevision`이다. ID는 손실 없는 문자열로 정규화한다.
연동 DTO의 `defaultBranch`는 확인된 문자열 또는 null이며 null을 자동으로 `main`으로 바꾸지 않는다.
클라이언트에 토큰·암호화 envelope·provider 원본 body·숨겨진 사용자 목록을 전달하지 않는다.

통합 입력 모델은 source별 discriminated union으로 둔다. Public variant는 실제 repository ID·owner와 기존 기본 브랜치를 가지며
installation ID·grant revision을 요구하지 않는다. 연동 variant만 검증된 installation ID·connection revision과 nullable default branch를 가진다.
수동 URL/direct variant에는 연동 검증 필드를 붙이지 않는다. 브라우저가 source를 바꾼 경우 서버가 그 출처의 계약으로 다시 검증한다.

- Public provider도 GitHub 응답의 repository ID와 실제 `owner.login`을 검증하여 통합 선택 DTO에 포함한다.
  Public와 연동 목록 모두 이름만으로 정체성을 추정하지 않는다. 기존 UI의 이름·기본 브랜치 선택 결과와 오류 분류는 보존한다.
  조직의 동명 저장소는 `owner/name`으로 구별하고 동일 repository ID는 한 번만 표시한다.
- 사용자 토큰으로 installation과 repository의 페이지를 조회한다. GitHub `Link` 값은 서버의 고정 origin·경로와 대조한다.
  브라우저에는 사용자·grant revision·조회 범위에 묶인 opaque cursor만 보내 임의 URL fetch를 허용하지 않는다.
- 검색은 **현재 불러온 목록 내 검색**으로 명시하고, 남은 페이지가 있으면 `Load more`를 제공한다.
  첫 100개만 읽고 전체 목록이라고 표시하지 않는다. 여러 설치 결과가 같은 repository ID를 포함하면 한 항목으로 합친다.
- 설치별 부분 오류는 그 범위를 실패로 표시한다. 현재 응답에서 검증된 다른 설치 항목은 사용할 수 있지만
  실패 범위의 이전 Private 결과를 정상 항목으로 재사용하지 않는다. 재시도 시 현재 요청 세대만 적용한다.
- `not-connected`·`needs-installation`·`loading`·`ready`·`empty`·`partial`·`reauth-required`·`error`를 구분한다.
  credential 상태와 query 상태는 분리해 보관하고 boolean 조합으로 불가능한 상태를 만들지 않는다.
- 빈 목록만으로 조직 승인 대기·SSO 문제를 단정하지 않는다. 원인이 검증되지 않으면
  허용 범위 확인·재조회·URL 입력을 안내한다. 특정 승인 대기는 제공자가 확인해 준 상태일 때만 표시한다.

### 선택과 프로젝트 생성

`RepositorySelection`은 기존 URL/direct와 Public picker 동작을 보존하면서 연동 출처를 구분한다.
연동 항목을 선택하면 canonical owner/name과 확인된 기본 브랜치를 채운다. 초기 slug 자동 제안은 기존 `slugFromRepo`를 따른다.
입력 우선순위는 다음과 같이 고정한다.

- 명시적으로 다른 저장소를 pick하면 현재 Public `pick` 동작처럼 새 기본 브랜치로 바꾸고 `branchTouched`를 초기화한다.
  사용자가 수정한 slug는 `slugTouched`에 따라 보존하고 표시 이름은 기존처럼 Start over 전까지 보존한다.
- 같은 저장소의 재조회·토큰 갱신·OAuth 복귀는 사용자 branch를 바꾸는 명시적 pick이 아니다.
  `branchTouched`인 값과 현재 입력 초안을 우선하고, 없는 필드만 기본값으로 채운다.
- 연동 metadata에 기본 브랜치가 없으면 브랜치를 비워 확인 가능한 직접 입력을 요구한다.
  이 분기의 서버 검증도 기본값이 없는 상태를 임의 `main`으로 통과시키지 않는다. 수동 URL의 기존 기본값 계약은 유지한다.
- Start over는 slug/name/branch와 touched 값을 기존 초기 상태로 되돌리고 서버 초안도 취소한다.

새 생성 요청의 연동 분기는 repository ID·검증된 installation·grant revision을 전달한다.
서버는 현재 사용자 토큰으로 저장소 접근과 canonical identity를 확인하며 브라우저의 owner/private 플래그를 신뢰하지 않는다.
목록이 준 repositoryPage는 권한이 아닌 조회 위치 힌트다. 서버는 해당 installation/page를 사용자 토큰으로 다시 읽고 ID가 실제로 있는지 확인하므로 전체 설치를 재순회하지 않는다.
페이지 구성이 바뀌어 ID가 사라졌으면 stale로 재조회·확인을 요구하며 client의 페이지 값만으로 접근을 승인하지 않는다.
선택 당시와 owner/name·허용 범위가 달라졌다면 새 내용을 보여주고 다시 확인하게 한다.
GitHub 권한 변경과 DB transaction 사이의 원자성은 보장할 수 없으므로 이를 GitHub 소유권 인증으로 표현하지 않는다.

사용자가 owner/repo를 직접 수정하면 해당 선택은 수동 출처가 된다. 수동 등록의 기존 계약은 유지한다.
기본 브랜치는 메타데이터로 채우며 사용자가 다른 브랜치를 입력할 수 있다. Private 브랜치 목록 API를 호출하거나,
그 편의를 위해 Contents 권한을 추가하지 않는다. 현재 수동 브랜치의 존재 검증을 새 보안 보장으로 광고하지 않는다.

검증된 입력은 기존 `registerWebProject`로 넘긴다. existing/disconnected 결과, 상한, 소유자 잠금,
초기 토큰 reveal, 응답 유실 후 목록 확인과 재연결 방식은 기존 결과 모델을 보존한다.

### 초안·동시성·토큰 갱신

- 초안은 서버 측 단기 시도에만 저장한다. URL/direct 입력, 선택 참조, slug·표시 이름·브랜치와 직접 수정 여부만
  allowlist로 보존하고 token·임의 객체·provider body를 받지 않는다. draft 조회도 동일 사용자·브라우저에 묶는다.
  초안은 클라이언트가 적용을 확인하거나 포기·만료한 뒤 제거 대상이 된다. 단순 SSR 읽기만으로 소비하여 재렌더 때 초안을 잃지 않는다.
  Start over는 기존 클라이언트 상태와 함께 서버의 복원 가능한 시도를 취소한다. draft 확인·취소 POST는 idempotent하게 처리한다.
- 다른 계정, 새 Start over, superseded 시도, 만료 시도는 복원하지 않는다. 새 시도 발급은 해당 브라우저의 이전 시도를 무효화한다.
  뒤로 가기·중복 callback·늦은 응답이 새 선택을 되살리지 않도록 클라이언트 request generation도 사용한다.
  두 탭 A→B 순서로 시작했다면 B만 완료할 수 있다. A의 Start over·취소·초안 적용 확인은 A의 ID·세대로 한정하며
  B의 시도·초안·공유 binding cookie를 지우지 않는다. superseded 탭은 안내와 URL 입력 또는 명시적 새 시작으로 복구한다.
  OAuth와 설치 시도는 일회 state를 따로 가지되 같은 flow ID로 연결한다. 탭의 sessionStorage에는 random flow/cancel ID만 두며 초안·Private 메타데이터·토큰은 저장하지 않는다.
  Start over는 탭의 복원 ID를 먼저 지워 취소 응답 유실 뒤에도 이전 초안을 적용하지 않는다. 복원 요청 중 새로 입력한 값이 있으면 그 초안을 적용·ack하지 않고 해당 flow를 취소한다.
- 토큰 만료는 응답의 만료 필드로 저장한다. non-expiring token이나 필요한 refresh 값이 없는 응답은 구성 오류로 거부한다.
- refresh는 DB lease와 grant version으로 하나만 수행한다. 새 access/refresh 쌍과 만료를 하나의 CAS로 저장한다.
  같은 요청을 기다린 다른 인스턴스는 저장된 새 세대를 사용한다.
- refresh 응답이 유실돼 이전 토큰이 소비됐을 수 있으면 같은 refresh token을 무조건 재전송하지 않는다.
  다른 요청이 성공 저장한 새 세대를 먼저 읽고, 없으면 재승인 상태로 전환한다.
- 해제·계정 변경·새 승인 이후 도착한 예전 refresh/callback은 version 비교로 폐기한다.
  그 결과가 이미 발급한 외부 토큰이라면 승인된 폐기 절차로 제거하되 현재 연동을 덮어쓰지 않는다.

### 해제·webhook·세션 만료

목록 연동 해제는 인증된 사용자 자신의 POST 동작이다. 사용자가 확인한 connection revision에 해당하는 개별 access token을
요청의 비공개 메모리에 확보한 뒤, 같은 revision의 CAS로 grant를 tombstone 처리하고 세대를 올려 관련 시도·초안·저장 토큰을 제거한다.
동시에 새 승인 세대가 저장되어 CAS가 실패하면 stale로 반환하고 새 grant나 provider 토큰을 폐기하지 않는다.
같은 grant의 refresh도 tokenVersion·refresh lease snapshot으로 fence한다. 확보한 토큰이 바뀌었으면 stale이며, 이미 refresh가 진행 중이면 개별 토큰 삭제가 성공해도 외부 정산 전체는 미확인으로 표시한다.
확보한 토큰은 해당 App client 인증으로 `DELETE /applications/{client_id}/token`에 한 번 폐기 요청하고 버린다.
전체 grant를 지우는 `/applications/{client_id}/grant`나 installation uninstall을 이 동작에 사용하지 않는다.
늦은 callback/refresh에서 얻은 폐기 대상도 개별 토큰에 한정하여 새 승인까지 취소하지 않게 한다.
제공자 오류·응답 유실·로컬 중지 후 프로세스 중단은 외부 폐기 미확인으로 기록하며 로컬 재사용을 허용하지 않는다.
실패한 외부 폐기를 성공으로 표시하거나 폐기 재시도를 위해 토큰을 무기한 보관하지 않고 GitHub 관리 화면에서 확인할 수 있게 한다.
조직 전체 App이나 다른 사용자의 허용 범위는 변경하지 않는다.

webhook은 일반 로그인 예외 경로가 아니라 별도의 서명 인증 경로다.
body 크기 제한 뒤 원문 body의 `X-Hub-Signature-256`을 timing-safe하게 확인하고 스키마를 해석한다.
App 전용 webhook secret과 이벤트별 schema로 처리한다. `github_app_authorization`은 `action: revoked`와 `sender.id`를
확인한다. 이 이벤트에 없는 공통 installation/app ID를 요구하지 않는다. 설치 이벤트는 `installation.id`와
그 payload에 정의된 App 정보를 대조한다. delivery ID로 중복 처리한다.
`github_app_authorization` 철회는 사용자 grant를 중지하고, installation 제거·정지·저장소 범위 변경은
관련 조회·선택을 무효화한다. webhook은 새로운 권한을 생성하거나 해제된 grant를 복구하지 않는다.
설치 범위 이벤트는 관련 조회를 무효화하고 실제 허용 여부를 이후 사용자 토큰으로 재확인한다.
사용자 단위 철회 이벤트에는 grant 세대가 없으므로 늦게 도착한 경우에도 보수적으로 해당 사용자의 조회를 중지하고 재승인을 안내한다.
이를 이벤트의 발행 순서를 알아냈거나 최신 grant만 정밀하게 철회한 것으로 표현하지 않는다.

세션 만료는 Private 데이터를 반환하지 않는 상태로 종료한다. 다시 로그인한 뒤 새 세션에서 목록을 조회한다.
API 경로는 기존 proxy matcher가 제외하므로 handler에서 인증을 직접 적용한다.
GitHub callback 전체를 `PUBLIC_EXACT`에 추가하거나 일반 인증 guard를 완화하지 않는다.

## Runtime Lifecycle

| 상태·사건 | 소유자 | 전이·관찰 결과 | 실패·취소·재진입 |
| --- | --- | --- | --- |
| 연동 없음 | create-project UI | Public/URL + 선택형 연동 버튼 | 기존 등록을 계속 제공 |
| 연동 시작 | github service | 단기 시도·브라우저 binding·초안 저장 후 redirect | 중복 클릭은 최신 시도 하나만 유효 |
| 다른 GitHub 계정 승인 | callback service | 계정 불일치로 거부, Stagekeeper 계정 불변 | 기존 연결과 수동 입력 유지 |
| 사용자 승인만 완료 | github service | authorization 시도 소비·grant 저장, 필요 시 새 installation 시도 발급 | 소비한 state 재사용 금지, 승인과 프로젝트 등록 구분 |
| 기존 연동의 허용 범위 관리 | connection service + GitHub | 현재 grant의 새 installation 시도→설치·설정 화면→callback 검증 또는 명시적 재조회 | 유효 grant의 OAuth 재승인 강제 금지. 변경 없음·권한 부족·callback 없는 복귀는 성공으로 추정하지 않음 |
| 같은 브라우저의 두 탭 | connection service + UI | 새 시도가 이전 시도를 superseded 처리 | 이전 탭의 취소·ack·callback은 새 시도·초안·binding·grant를 변경하지 않음 |
| 조직 승인 필요 | provider 결과 + UI | 확인된 대기·관리 안내 | URL 등록 가능, 빈 목록에서 원인 추정 금지 |
| 목록 로딩·추가 페이지 | slice adapter | 현재 세대의 허용 데이터만 합침 | 취소/늦은 요청을 폐기하고 실패 범위를 표시 |
| 선택 후 권한 변경·이름 변경 | create Action | stale 선택 거부 후 재조회 | 새 프로젝트·토큰 생성 없음 |
| 토큰 만료 | refresh service | 단일 갱신 후 재사용 | 결과 유실은 새 DB 세대 확인 후 재승인 |
| 사용자 해제·webhook 철회 | connection service | tombstone·민감정보 제거·Private 결과 폐기 | 늦은 callback/refresh로 되살아나지 않음 |
| 브라우저 복귀·계정 전환 | UI + session guard | 동일 사용자·유효 시도만 초안 복원 | 다른 사용자에게 선택·초안 비노출 |
| 기능 OFF | composition root | 새 승인·목록 제공만 중지, 기존 시도 무효화·해제·webhook·삭제 유지 | 기존 프로젝트·Public/URL 등록 유지. OFF를 모든 새 route 비활성으로 구현하지 않음 |

생성용 form의 보조 버튼에서 POST 시작→JSON 확인→top-level 이동까지가 하나의 사용자 전이다.
API fetch가 GitHub로 303을 따라가는 것을 화면 이동으로 간주하지 않는다.

## Safety Analysis

| 위협·회귀 | 통제 | 계획 검증 |
| --- | --- | --- |
| 설치 ID를 바꿔 조직의 다른 Private 저장소 열람 | 사용자 토큰 교집합 조회, App·계정·repository ID 확인 | 두 사용자·동일 조직에서 서로 다른 권한 대조 |
| 로그인 CSRF·다른 계정으로 grant 결합 | 일회 state·PKCE·브라우저 binding·현재 numeric ID·CAS | 잘못된 state/code/account, 재전송·만료 거부 |
| Private 응답의 공용 캐시 유입 | 서버/HTTP no-store, grant/user 기반 클라이언트 세대 | 두 사용자 RSC·API 응답과 브라우저 재진입 대조 |
| secret·Private 이름이 로그/URL로 유출 | DTO allowlist·callback 주소 정리·로그 redaction | canary 값을 로그·응답·HTML·storage에서 검색 |
| 해제 후 늦은 응답으로 재연결 | grant tombstone·세대 비교 | callback/refresh/조회 순서를 역전시켜 확인 |
| refresh 경쟁·응답 유실 | DB lease·원자 토큰 쌍 갱신·불확실 시 재승인 | 별도 DB connection의 경쟁·fault 검사 |
| callback만으로 프로젝트·토큰 생성 | 최종 Create project Action만 기존 등록 호출 | callback 전후 DB row 수·토큰 수 대조 |
| 추가 기능 장애가 전체 등록 차단 | 독립 feature config·Public/URL 대안 | 설정 없음·오류·OFF·GitHub 장애 회귀 |
| 목록 해제가 프로젝트 연결 해제로 오작동 | 용어·endpoint·service 분리 | project, tokens, history 쓰기 없음 확인 |

공개 여부를 클라이언트가 보낸 flag로 결정하거나 `internal`·알 수 없는 visibility를 Public으로 축소하지 않는다.
현재 Public schema의 archived 제외는 유지하고, 새 연동 목록의 archived 처리 규칙은 P0 권한·UX 계약에서 명시한다.
실제 접근 가능한 항목과 현재 picker가 선택 대상으로 지원하는 항목을 구분하며, 미지원 항목을 전체 성공의 빈 결과로 감추지 않는다.

## Blockers and Readiness

### BLK-PRV-01: 새 서버 모듈과 공개 경계 승인

- classification: resolved for this code change. 현재 구현 요청과 ADR-0006, 아키텍처·검사기·caller의 원자적 이전으로 반영했다.
- evidence: 현재 `server.md`·검사기의 방향표와 rootFiles에는 루트 `github.ts`만 있다.
- affects: CON-PRV-001, INV-PRV-003, Phase PRV-P1.
- impact: 이를 무시하면 아키텍처 위반을 임시 예외로 숨기거나 루트 기반 파일에 기능 의존성을 넣게 된다.
- unblock requirement: 제안 `github` 모듈·공개 API·루트 파일 이전의 ADR 및 현재 아키텍처·검사기 변경 범위 승인.
  입력 우선순위·지원 visibility와 새 연동 목록의 archived 처리도 P0의 선택 동작 계약으로 확정한다.
- owner: 저장소 소유자.
- stop condition: 승인 전 새 서버 모듈 구현·검사 예외·기존 계약 문서 수정 금지.

### BLK-PRV-02: 비밀 저장·삭제·회전 운영 계약

- classification: 코드 계약과 격리 DB 시험은 구현됨. 실제 운영 key 공급·회전·복구·주기 실행 증거는 활성화 전 남아 있다.
- evidence: 현재 reversible token vault, 해당 암호화 키와 만료 시도 정리 방식이 없다.
- affects: CON-PRV-005, REQ-PRV-011, REQ-PRV-012, REQ-PRV-013, REQ-PRV-018.
- impact: 평문 보관, 회전 중 복호화 실패, 무기한 초안·비밀 보존 또는 refresh 경쟁을 초래할 수 있다.
- unblock requirement: key 공급·접근 주체·회전·복구·만료 데이터 물리 삭제 주기·사용자 토큰 폐기 계약을 확정한다.
  제안은 별도 versioned AEAD key와 유한 TTL이며 실제 값은 문서나 채팅에 기록하지 않는다.
- owner: 저장소 소유자 및 배포 운영자.
- stop condition: 승인된 비밀 공급·삭제 경계 없이 실제 토큰을 저장하거나 P1을 출시하지 않는다.

### BLK-PRV-03: 실제 GitHub App 등록과 환경별 callback

- classification: downstream, Phase PRV-P3의 실제 연결·출시를 막으며 fixture 기반 P1/P2 설계를 막지는 않는다.
- evidence: `.env.example`에는 기존 OAuth App 설정만 있고 추가 App ID/slug/client 설정·webhook secret은 확인되지 않았다.
- affects: CON-PRV-003, INV-PRV-004, REQ-PRV-002, REQ-PRV-003, REQ-PRV-015.
- impact: 잘못된 callback·App 권한·토큰 만료 설정으로 승인 실패나 과도한 권한 요청이 발생할 수 있다.
- unblock requirement: 개발/인수/운영 App, 고정 callback·setup·webhook URL, metadata-only manifest,
  일반 사용자 설치를 위한 `public: true`, 만료 토큰 정책과 secret 공급을 운영자가 준비하고 기록한다.
  설치 관리·허용 변경과 callback 없는 복귀도 실제 App에서 확인한다. 이번 문서에서는 실제 App을 생성하지 않는다.
- owner: GitHub App 관리자·배포 운영자.
- stop condition: fixture 통과만으로 실제 인증 성공·권한 최소화·제품 출시 완료를 선언하지 않는다.

### BLK-PRV-04: 실제 조직·철회·복구 인수 증거

- classification: downstream, Phase PRV-P3의 일반 공개 전 해결한다.
- evidence: 실제 개인 Private·조직·승인 대기/SSO·권한 철회·키 회전·callback 재진입은 관찰하지 않았다.
- affects: REQ-PRV-004, REQ-PRV-011, REQ-PRV-012, REQ-PRV-014, REQ-PRV-018.
- impact: 조직 설치 권한과 사용자 접근을 혼동하거나 수동 대안·복구가 실제 환경에서 동작하지 않을 수 있다.
- unblock requirement: 허가된 테스트 계정·저장소의 권한 매트릭스, 실제 결과와 정리 증거를 확보한다.
- owner: 저장소 소유자·인수 담당자.
- stop condition: 미실행 조직/철회 인수를 unit pass로 대체하거나 승인 대기를 성공으로 처리하지 않는다.

## Execution Plan and Phase Map

### Phase PRV-P0: 권한·모듈·운영 계약 확정

- outcome: 사용자 선택 동선, 새 서버 경계와 원자적 이전 순서, 토큰 vault·삭제·갱신, 실제 App의 최소 권한 manifest를 승인 가능한 계약으로 고정한다.
- split rationale: 기존 서버 경계 변경과 비밀 보관 결정은 제품 코드보다 먼저 검토해야 한다.
- predecessor artifacts: 이 SDD와 현재 아키텍처·제품 문구·공식 GitHub 계약.
- completion ownership: 제품 요구사항 완료를 주장하지 않는 계약 준비 단계. 후속 Phase 전체의 입력을 만든다.
- intermediate validity: 제품·스키마·현재 검사 규칙은 기존 상태로 동작한다. 목표 ADR과 변경 범위를 승인하고,
  실제 현재 구조 문서·rootFiles 제거는 P1의 파일 이동·caller 전환과 함께 반영한다. 관련 문서 쓰기에도 별도 승인 범위가 필요하다.
- blockers: BLK-PRV-01, BLK-PRV-02.
- verification/exit: 권한 allowlist, 새 공개 API·의존 방향, 최초 승인/기존 설치 관리·두 탭 최신 시도 규칙,
  App 배포 범위·콜백·비밀 저장·rollback 계약과 담당자를 기록한다.
- detailed plan: 별도 파일 없음. 착수 승인 후 이 기준과 실제 코드를 재대조해 범위를 확정한다.
- readiness: ADR-0006와 이번 코드 변경의 계약으로 반영. 실제 운영 준비는 BLK-PRV-02/03/04의 배포 게이트다.

### Phase PRV-P1: 비활성 상태의 서버 기반과 저장 수명주기

- outcome: 승인된 모듈·additive migration·vault·콜백·사용자 범위 provider·단일 refresh를 서버 fixture로 검증한다.
  루트 GitHub 파일·caller·현재 아키텍처·검사기의 전환은 이 단계의 같은 변경 단위로 적용한다.
- split rationale: Private 자격 증명과 DB 경쟁 처리는 사용자 UI와 별도로 검증할 수 있는 안전 경계다.
- predecessor artifacts: P0의 확정된 계약과 BLK-PRV-01/02 해소 기록. 이후 API·UI가 이 결과를 소비한다.
- completion ownership: 후속 P2/P3 요구사항에 기여하며, 화면·실제 GitHub 성공의 전체 완료를 주장하지 않는다.
- intermediate validity: 추가 기능은 기본 OFF이고 기존 로그인·Public/URL 등록은 이전 경로로 제공한다.
- verification/exit: 주입형 provider의 실패·계정·설치 조작, 실제 DB의 lease/CAS·시도 소비·migration을 검증한다.
- detailed implementation: 아래 구체 파일·symbol 목록과 Implementation Results에 현재 요청의 실제 변경을 기록한다.
- readiness: 기본 OFF인 구현·격리 DB 검증 완료. App·운영 환경의 실설정과 실제 공개 게이트는 미완료다.

### Phase PRV-P2: 선택형 목록 UI와 기존 등록 연결

- outcome: 개발·인수 환경의 명시적 활성화에서 목록 연동·선택·초안·URL 대안·등록을 검증한다.
- split rationale: 백엔드 권한 계약을 바탕으로 입력 모델·접근성·등록 부수효과를 함께 검증한다.
- predecessor artifacts: P1의 API·DTO·마이그레이션·vault 계약; UI adapter와 생성 Action이 소비한다.
- requirement contribution: REQ-PRV-001부터 REQ-PRV-011, REQ-PRV-013, REQ-PRV-014, REQ-PRV-016의 UI·등록 동작을 준비한다.
- completion ownership: fixture·격리 환경의 구현 산출물을 완료한다. canonical 제품 요구사항의 최종 완료 책임은 실제 인수·출시를 담당하는 P3에 둔다.
  VFY-PRV-01부터 VFY-PRV-08을 해당 환경에서 수행한 증거를 P3에 전달한다. P3의 실제 인수 전에는 제품 전체 완료를 주장하지 않는다.
- intermediate validity: 일반 환경은 OFF. 승인된 인수 환경에서만 동작하며 Public/URL은 항상 사용할 수 있다.
- blockers: P1 완료 필요. BLK-PRV-03/04는 실제 연결·일반 공개에 적용한다.
- verification/exit: 기존 등록 결과·토큰 수·draft·키보드·두 사용자 격리와 새 UI 상태를 실제 컴포넌트/Next 경로로 확인한다.
- detailed plan: P1 코드와 canonical 요구사항을 다시 읽어 PHASE_PLAN을 별도 작성한다.

### Phase PRV-P3: 철회·운영 복구·실제 인수와 점진 활성화

- outcome: 해제·서명 webhook·관측·키 회전·복구를 검증하고 실제 GitHub 인수를 통과한 범위만 활성화한다.
- split rationale: 실제 외부 권한·secret 운영과 일반 공개는 fixture UI 완성과 다른 승인 경계다.
- predecessor artifacts: P1/P2 검증 결과, 실제 App 등록, 운영·인수 권한. 배포·인수 담당자가 소비한다.
- satisfies: REQ-PRV-001, REQ-PRV-002, REQ-PRV-003, REQ-PRV-004, REQ-PRV-005, REQ-PRV-006, REQ-PRV-007, REQ-PRV-008, REQ-PRV-009, REQ-PRV-010, REQ-PRV-011, REQ-PRV-012, REQ-PRV-013, REQ-PRV-014, REQ-PRV-015, REQ-PRV-016, REQ-PRV-017, REQ-PRV-018.
- preserves: INV-PRV-001, INV-PRV-002, INV-PRV-003, INV-PRV-004, INV-PRV-005, INV-PRV-006.
- governed-by: CON-PRV-001, CON-PRV-002, CON-PRV-003, CON-PRV-004, CON-PRV-005, CON-PRV-006, CON-PRV-007, CON-PRV-008.
- verified-by: VFY-PRV-01, VFY-PRV-02, VFY-PRV-03, VFY-PRV-04, VFY-PRV-05, VFY-PRV-06, VFY-PRV-07, VFY-PRV-08, VFY-PRV-09.
- completion ownership: 18개 canonical 제품 요구사항 전체의 최종 완료. P1/P2의 구현·검증 증거를 재사용하고,
  해제·관측·운영 복구·실제 환경 인수를 더해 출시 여부를 판정한다. 앞 단계에 제품 완료를 중복 배정하지 않는다.
- intermediate validity: 기능 OFF→승인된 테스트 계정→관찰된 범위 순서로 확대한다. 실패하면 OFF로 복구한다.
- blockers: BLK-PRV-03, BLK-PRV-04.
- verification/exit: 두 계정·개인/조직·거부·철회·재연동·키 회전·rollback의 실제 증거와 민감정보 없는 보고를 남긴다.
- approval gate: 실제 App 설정·비밀 공급·인수 범위·활성화 승인을 확인한 뒤에만 실행한다.

## Affected Files

아래는 **향후 구현의 영향 목록**이다. 이번 작성에서 이 파일들을 수정했다는 뜻이 아니다.

| 경로·영역 | 제안 작업 | 이유·위험 |
| --- | --- | --- |
| `docs/architecture/server.md`, `verification.md`, `protocol.md`, 관련 ADR | P0에서 승인 후 변경 | 신규 모듈·목록 연동 계약을 현재 계약과 일치시킴; 이번 SDD로 자동 승인되지 않음 |
| `scripts/checks/verify-server-boundaries.mjs`와 짝 테스트 | 승인된 github 모듈·루트 파일 이전을 정확히 반영 | 검사 억제·디렉터리 면제 금지 |
| `src/server/github.ts` | 기존 Public 구현을 새 기능 모듈로 이동 | 값·오류 계약과 서버 테스트 호출부 보존 |
| `src/server/github/` 신규 제안 | contracts, 주입형 서비스·파서·token refresh, server-only 바인딩·provider·vault | GitHub 외부 권한과 Stagekeeper 프로젝트 권한 분리 |
| `prisma/schema.prisma`, 신규 migration | 연동·시도·설치 연관·중복 처리 저장 모델 추가 | 기존 rows·토큰·구형 앱과 호환; generated client는 정상 생성 명령만 사용 |
| `src/app/api/github/**/route.ts` 신규 제안 | 얇은 승인·설치·목록·해제·webhook 진입점 | `/api`는 proxy 인증에서 제외되므로 handler 인증 필수 |
| `src/app/(app)/p/new/page.tsx` | 새 Public 공개 경로·사용자별 초기 상태 연결 | framework composition 유지, 비밀 값 전달 금지 |
| `src/fsd/features/create-project/model/` | RepoOption·RepositorySelection·entry state 확장 | 실제 owner, 안정 ID, 현재 세대, touched 상태 보존 |
| `src/fsd/features/create-project/api/` | 목록 adapter와 생성 Action의 연동 선택 재검증 | URL/direct 분기·기존 등록 서비스 보존 |
| `src/fsd/features/create-project/ui/new-project-form.tsx`와 public API | 선택형 CTA·상태·목록·관리/해제·복원·키보드 | 동명 저장소와 pending/partial 상태 구분 |
| 기존 create-project `.test.ts` 파일들 | 기존 회귀에 새 상태·정체성·늦은 응답 사례 추가 | 구현과 함께 발견되는 의미 있는 동작 시험 |
| `tests/server/github.test.ts`, 신규 `tests/server/github-connection.test.ts` 제안 | 기존 Public import 이전·실제 route/auth/비밀 경계 | server-only bootstrap을 기존 test:server에 연결 |
| 신규 `src/server/github/*.test.ts`, `tests/server/integration/github-connection.test.ts` 제안 | 단위·provider 계약·DB 경쟁·migration | 실제 소유 위치와 실행 패턴을 함께 확인 |
| `tests/server/fixtures/`와 기존 브라우저 리허설 | 실제 UI의 취소·복원·교차 계정·응답 유실 fixture | 새 E2E runner가 존재한다고 가정하지 않음 |
| `.env.example`, `README.md` | 제안 App·flag·vault key·webhook 설정 이름과 운영 절차 | 실제 비밀 값은 기록하지 않음; P0에서 정확한 이름 확정 |
| `docs/conventions/product-copy.md` §10·관련 검사 | 조건부 문구·권한 설명과 코드 동시 갱신 | 비활성 환경과 실제 능력 불일치 방지 |

보존 대상: 기존 GitHub 로그인 provider/uid 계약, projects 등록·연결 서비스, `POST /api/projects`,
MCP·core·plugin 및 hs_/hu_/ho_ 계약. 이 목록 밖의 변경은 Phase 정합화에서 근거와 승인을 먼저 확인한다.

### 파일·symbol·실행 경로의 구체 목록

앞 표는 요약이며 아래 목록을 구현의 구체 경계로 사용한다. 현재 파일·검증과 추가된 adapter/helper는 Implementation Results에서 확인한다.
외부 구성·DB DDL의 미확정 항목은 BLK-PRV-01부터 BLK-PRV-04로 남기며, 이 목록으로 구현 승인을 대신하지 않는다.

| 분류 | 정확한 경로·symbol | 변경·보존과 후속 검증 |
| --- | --- | --- |
| move | `src/server/github.ts` → `src/server/github/public-repositories.ts`; `listPublicRepos`, `PublicRepo`, `PublicReposResult` | 원본 root 파일 삭제, 새 모듈 내부 구현·contracts와 runtime 공개 경로로 이전. Public의 기존 값 의미·오류 분류는 보존하고 ID/owner를 추가하는 DTO 기대값을 시험과 함께 수정 |
| create | `src/server/github/contracts.ts`, `api.server.ts` | DTO·결과 타입은 contracts, 실제 제품이 호출하는 함수만 api.server에서 명시적으로 공개. wildcard·시험 전용 공개 API 금지 |
| create | `src/server/github/connection-service.ts`, `repositories.ts`, `token-refresh.ts`, `webhook.ts` | 승인/설치 관리·두 탭 최신 시도·초안·grant 수명주기, 목록/선택 검증, DB 갱신 경쟁, 이벤트별 서명·무효화 처리. pure 단위 시험에서 runtime singleton을 읽지 않음 |
| create | `src/server/github/provider.server.ts`, `token-vault.server.ts`, `configuration.server.ts` | 실제 HTTP·개별 토큰 폐기·비밀 암호화·lazy 구성 검증. server-only 표식과 별도 서버 bootstrap 시험 사용 |
| current caller | `src/app/(app)/p/new/page.tsx`, `tests/server/github.test.ts` | 현재 root GitHub import 2곳. page는 feature의 server public API로 초기 상태를 받고, Public 서버 시험은 새 runtime 공개 경로를 검증 |
| modify | `src/fsd/features/create-project/model/repo-url.ts`, `repository-selection.ts`, `repository-entry-state.ts` | source별 option/selection, stable ID·실제 owner, 명시적 pick과 reconcile 분리, nullable default branch와 touched 우선순위 |
| preserve/modify | `model/create-project-state.ts`, `create-project-result.ts`, `project-slug.ts` | 기존 created/existing/disconnected와 slug 의미 보존. 새 선택 오류를 기존 결과에 일관되게 매핑 |
| modify | `api/create-project.server.ts`, `index.server.ts`, `index.ts`, `ui/new-project-form.tsx` (모두 create-project slice 내부) | 실제 생성 Action의 재검증과 helper 분리, runtime helper의 원격 Action 오등록 금지, 기존 UI public API 유지 |
| create | `src/fsd/features/create-project/api/repository-picker.server.ts` | `loadRepositoryPickerState`를 server-only helper로 제공. server DTO를 slice 모델로 변환하고 `index.server.ts`에서 page용으로 공개. use-server Action으로 만들지 않음 |
| create | `src/fsd/features/create-project/api/repository-picker.ts`, `model/github-connection-state.ts` | client의 JSON API 호출·top-level navigation·요청 세대·query 상태·초안 적용 확인. model/ui에서 server contracts를 직접 import하지 않음 |
| create routes | `src/app/api/github/connection/start/route.ts`, `callback/route.ts`, `installation/route.ts`, `draft/route.ts`, `cancel/route.ts`, `disconnect/route.ts` | 위 HTTP 표의 method·세션·Origin·callback 종류를 그대로 사용. 각 축약 경로는 같은 `connection/` 아래이며 총 6개 route 파일 |
| create routes | `src/app/api/github/repositories/route.ts`, `src/app/api/github/webhook/route.ts` | 사용자 JSON 목록과 외부 서명 webhook을 분리. 총 8개 새 route 파일이며 `draft/route.ts`만 GET/POST 두 method 제공 |
| modify contract/guard | `docs/architecture/server.md`, `protocol.md`, `verification.md`, `docs/ADR/README.md`, 신규 ADR | 새 github 모듈·rootFiles 이전·공개 함수·HTTP·수명주기 계약 승인 후 반영. ADR 경로·번호는 P0 산출물로 확정하며 현재의 실행 가능한 변경 목록에 포함하지 않음 |
| modify checker | `scripts/checks/verify-server-boundaries.mjs`, `verify-server-boundaries.test.mjs` | `directions.github = []`, rootFiles에서 github.ts 제거, 새 공개 경로 및 순환/초기화·private import 거부 검증. 다른 모듈 runtime import가 생기지 않는 설계를 우선 |
| modify existing tests | create-project의 `model/repository-entry-state.test.ts`, `repository-selection.test.ts`, `repo-url.test.ts`, `create-project-result.test.ts`, `ui/new-project-form.test.ts` | 기존 5개 시험 파일의 의미를 유지하고 새 source/ID/branch·UI 상태 사례 추가. package의 test:web 검색 확인 |
| create pure tests | `src/server/github/connection-service.test.ts`, `repositories.test.ts`, `token-refresh.test.ts`, `webhook.test.ts` | test:web에서 실행 가능하도록 provider/vault/clock을 주입하며 server-only 구현을 transitive import하지 않음 |
| create runtime tests | `tests/server/github-connection.test.ts`, `github-create-project.test.ts`, `github-provider.test.ts`, `github-token-vault.test.ts`, `github-configuration.test.ts` | 각각 실제 route와 callback, 실제 생성 Action, HTTP 오류/폐기, vault·키 교체, lazy config와 OFF 격리를 서버 bootstrap으로 시험 |
| create manifest test | `tests/server/github-action-manifest.test.ts` | fresh build 뒤 `GITHUB_CHECK_ACTION_MANIFEST=true`에서 생성 registry의 실제 body를 검사. 일반 test:server는 이 별도 인수 조건의 미실행을 구분 |
| create DB test | `tests/server/integration/github-connection.test.ts` | 기존 `support.ts:connections/fixture/cleanup`와 검증된 TEST_DATABASE_URL로 CAS·migration·삭제를 확인. 지연 작업·연결·주입 mock은 finally/t.after로 정리 |
| modify browser fixture | `tests/server/fixtures/src-clean-code-browser.tsx`, `src-clean-code-acceptance.ts` | `NewProjectForm`의 현재 private UI import를 기존 public API `@/fsd/features/create-project`로 바꾸고 2개 Public option fixture에 ID/owner 반영. form/picker 모드를 보존하며 무관한 fixture import는 변경하지 않음 |
| modify rehearsal | `scripts/rehearsals/rehearse-src-clean-code.ts` | 기존 `--ui-only`, `--fixture-development`, `/fixture`, `/fixture.js`, `/results`, `/finish`를 유지하고 승인된 provider fixture를 연결 |
| preserve regression | `tests/server/project-registration.test.ts`, `src/server/projects/registration-command.test.ts`, `registration-service.test.ts`, `src/server/auth/config.base.test.mjs`, `public-routes.test.mjs` | REST 등록·프로젝트 트랜잭션·기존 인증의 보존 시험. 이 시험만으로 새 Web Action 검증을 대신하지 않음 |
| schema/generated | `prisma/schema.prisma`, `prisma.config.ts`, `src/generated/prisma/client.ts`, `models.ts` 및 generator 출력 | P0/P1에서 확정한 additive 모델과 신규 migration만 추가. generation 경로는 기존 설정 유지, generated 파일 직접 편집 금지. DDL·테이블별 제약은 P1 상세 계획의 선행 산출물 |
| config/copy | `.env.example`, `README.md`, `docs/conventions/product-copy.md` §10, `scripts/checks/retired-copy.test.mjs` | 설정 키·본문·조건부 문구를 정확히 반영. OFF에서 여전히 참인 기존 안내를 전역 retired regex로 금지하지 않음 |

공개 API의 필수 provenance는 다음과 같다. 나열한 runtime 함수 이름은 제안 계약이며 P0 승인 시 확정한다.

| 현재 owner/소비자 | 이후 owner → 공개 경로 → 소비자 | 검증 목적지 |
| --- | --- | --- |
| `github.ts:listPublicRepos` → page/`tests/server/github.test.ts` | `github/public-repositories.ts` → `@/server/github/api.server:listPublicRepos` → `api/repository-picker.server.ts:loadRepositoryPickerState` → create-project `index.server.ts` → page | 기존 github 서버 시험, 새 adapter/runtime 시험, root 파일 부재·TypeScript 경로 해석 |
| `github.ts:PublicRepo/PublicReposResult` | `github/contracts.ts` → 새 모듈 public 타입 경로 → server adapter에서 slice의 RepoOption으로 변환 | Public 성공/empty/shape/http/request body 및 compiler 검사. UI/model은 server 타입을 직접 참조하지 않음 |
| 신규 승인·설치·초안·해제 | `connection-service.ts` → `api.server.ts`의 `startRepositoryConnection`, `completeRepositoryAuthorization`, `completeRepositoryInstallation`, `loadConnectionDraft`, `acknowledgeConnectionDraft`, `cancelRepositoryConnection`, `disconnectRepositoryList` → 위 6개 connection route | `tests/server/github-connection.test.ts`에서 모든 method와 body·redirect·무쓰기 검사 |
| 신규 허용 목록·선택 검증 | `repositories.ts` → `api.server.ts:listAuthorizedRepositories/validateRepositorySelection` → repositories route, 초기 adapter, `create-project.server.ts:createProject` | repositories 단위 시험과 `github-create-project.test.ts`의 실제 Action |
| 신규 webhook | `webhook.ts` → `api.server.ts:handleGitHubWebhook` → webhook route | webhook 단위 시험 및 실제 handler의 서명·event body·중복·OFF 검사 |
| 기존 `registerWebProject` | `projects/registration-service.ts` → 기존 `projects/api.server.ts:registerWebProject` → 기존 create Action | 기존 REST/DB 회귀 + 새 Web Action binding 시험. 새 github 모듈이 projects를 import하지 않음 |
| 기존 `auth` / `requireUser` | `auth/index.ts:auth`는 JSON route의 세션 확인, `auth/guard.ts:requireUser`는 기존 page/Action redirect 계약 | 새 JSON 401 시험과 기존 로그인/page 회귀 |
| fixture의 `ui/new-project-form:NewProjectForm` private import | 기존 create-project `index.ts:NewProjectForm` → `@/fsd/features/create-project` → 기존 browser fixture | fixture 실제 bundle·브라우저 form 시험, 해당 private import 부재. 제품 public API에 시험용 symbol을 추가하지 않음 |

filesystem 결과: `src/server/github/`와 `src/app/api/github/`를 생성하고 루트 `src/server/github.ts`를 제거했다.
기존 부모와 충돌하지 않으며 page·서버 시험은 새 공개 경로를 사용한다. browser fixture도 create-project의 기존 public API를 사용한다.
P1은 새 디렉터리 생성→구현/공개 경로 작성→두 기존 import와 fixture 갱신→root github.ts 제거 순서로 하나의 검증 가능한 변경을 만든다.
이동 중 파일과 같은 이름의 디렉터리가 함께 남아 root import를 가리는 상태로 완료하지 않는다.
실제 착수 시 충돌 여부를 다시 검사하고, 다른 사람이 만든 대상이 있으면 덮어쓰지 않고 재정합화한다.

### 최종 노출 산출물과 확인 위치

| 최종 산출물 | 우선하는 source·의존성 | 확인할 실제 내용 | 검증 목적지 |
| --- | --- | --- | --- |
| `/p/new`의 HTML·RSC·client props | page → feature server adapter → contracts/local DTO → form; 기존 Button/Field/Input/TokenReveal과 §10 | ON/OFF·Public/Private·초안·상태·실제 owner/branch, 비밀 값과 다른 계정 메타데이터 비노출 | 새 runtime 시험 + 실제 Next/브라우저 fixture; 단순 HTTP 200만으로 통과 금지 |
| 새 JSON API와 callback | 정확한 8개 route와 표의 methods → runtime service → 현재 session/grant/provider schema | allowlist된 JSON body·오류 code·고정 redirect Location·no-store; 수신 code/state의 전달 금지, 새 installation 시도의 새 state만 설치 URL에 허용 | 실제 route 호출 시험과 외부 인수 |
| GitHub App 설정 | 별도 App client·승인 callback·setup URL·redirect-on-update·metadata-only 권한 | `request_oauth_on_install=false`와 setup/callback 공존, 일반 사용자 설치용 `public=true`, 만료 토큰 정책, 실제 등록 origin 일치 | BLK-PRV-03의 manifest 점검 및 VFY-PRV-09. 현재 값은 not verified |
| Prisma 저장·생성 코드 | 승인된 schema → 신규 migration → 기존 prisma.config.ts의 generator | grant/attempt/설치 관계·expiry·lease·unique delivery 제약과 기존 데이터 보존 | schema/SQL 구조 검사, db:generate, 실제 DB 경쟁/rollback. 단순 generated 파일 존재 검사 금지 |
| Next route/Action registry | 실제 route.ts와 use-server export → fresh build의 `.next/server/app-paths-manifest.json`, `server-reference-manifest.json` | 8개 새 route와 생성 Action 등록, secret helper/초기 loader가 원격 Action으로 추가되지 않음 | 제안 manifest 시험과 fresh build 식별자·mtime 대조. 예전 `.next`는 현재 설계의 통과 증거로 사용하지 않음 |
| 설정·로그·삭제 결과 | lazy config/vault + `.env.example`/README + provider 오류 매핑 | secret 없는 상태 분류·키 누락 시 추가 기능만 unavailable·실제 credential null/삭제 | runtime config/vault 시험, provider canary, DB·운영 인수 |

현재 작업에는 새 API·schema·migration과 Next build 산출물이 있다. 위 표의 destination/body 계약은 실제 시험과 연결한다.
실제 GitHub App 설정과 운영 산출물은 미확인 상태이며 로컬·fixture 성공으로 대체하지 않는다.

## Verification Plan

이하 VFY는 canonical 인수 계획이다. 실행한 local/fixture/DB 범위와 미실행 외부·운영 인수는 Verification Results와 Implementation Results에서 구분한다.

### VFY-PRV-01: 로그인·등록 대안과 구성 회귀

- category: contract / integration.
- verifies: REQ-PRV-001, REQ-PRV-002, REQ-PRV-006, REQ-PRV-015.
- destination: 기존 `src/server/auth/config.base.test.mjs`, `tests/server/github.test.ts`, 제안 connection 시험과 create-project UI 시험.
- expected: App 미설정·flag OFF·거부·실패에서 로그인/Public/URL이 유지되고 화면 진입만으로 외부 승인 요청은 0건이다.

### VFY-PRV-02: 계정·callback·초안의 부정 경로

- category: security / contract.
- verifies: REQ-PRV-002, REQ-PRV-003, REQ-PRV-007, REQ-PRV-013.
- destination: 제안 `src/server/github` 서비스 단위 시험과 `tests/server/github-connection.test.ts`의 실제 handler 시험.
- expected: 잘못된 code/state/PKCE·다른 githubId·만료·소비·superseded 시도·세션 만료·다른 브라우저를 거부한다.
  사용자 승인→authorization 시도 소비→새 설치 시도→설치 callback의 정상 전이를 확인하고 이전 state 재사용을 거부한다.
  start fetch는 JSON 후 top-level 이동이며 callback만 303을 사용한다. 무세션 JSON API는 로그인 HTML 대신 401을 반환한다.
  유효 grant의 manage는 새 installation 시도를 만들고 OAuth 교환은 하지 않으며, 재승인 필요 시 409로 복구 동작을 제공한다.
  성공/취소/Start over의 초안 복원과 다른 계정 비노출을 대조하고 callback 전후 Project/Stagekeeper 토큰 증가는 0이다.

### VFY-PRV-03: 허용 집합·페이지·정체성 계약

- category: provider contract / unit.
- verifies: REQ-PRV-004, REQ-PRV-005, REQ-PRV-008, REQ-PRV-009, REQ-PRV-010, REQ-PRV-014.
- destination: 제안 `src/server/github/repositories.test.ts`, 기존 repository selection/entry state 시험.
- expected: 사용자 두 명의 조직 권한 차이, 다른 설치 ID, 동명 repo, 중복 installation, 101개 이상과 다음 페이지,
  malformed/부분 실패·403 rate limit·권한 부족·SSO·정상 빈 목록을 구분한다. owner와 기본 브랜치는 실제 항목을 사용한다.
  Public fixture의 ID/owner 추가, 기본 브랜치 null, 명시적 새 pick, 같은 항목 refresh, touched branch·slug·표시 이름 보존을 대조한다.
  P0의 archived 규칙과 미지원 visibility 처리, 실제 공개 API export와 root import 부재도 확인한다.

### VFY-PRV-04: 갱신·해제·늦은 결과 수명주기

- category: lifecycle / security.
- verifies: REQ-PRV-007, REQ-PRV-010, REQ-PRV-011, REQ-PRV-012, REQ-PRV-013, REQ-PRV-014.
- destination: 제안 connection/refresh 단위 시험과 DB 시험, UI의 지연 응답 fixture.
- expected: refresh 경쟁·성공 후 응답 유실·해제 뒤 callback/refresh·로그아웃/계정 변경·Start over 순서를 역전한다.
  하나의 유효한 새 세대만 남고 무한 retry·다른 사용자 결과 적용·프로젝트 해제·토큰 추가 발급은 없다.
  개별 토큰 폐기를 위한 값 확보→로컬 tombstone/비밀 제거→provider 폐기 순서를 관찰한다.
  provider 실패·유실·중단에서 외부 폐기 미확인을 표시하고 `/grant`·installation uninstall 호출 수는 0인지 확인한다.
  이전 revision의 해제 요청이 새 승인 뒤에 도착하면 409이며 새 grant·새 토큰 폐기 호출 수는 0인지 확인한다.
  새 시도 발급 뒤 예전 callback이 도착해도 브라우저 binding이 바뀌지 않으며, 등록한 timer·listener·mock은 종료 후 복원한다.
  같은 브라우저의 A→B 시작 뒤 A의 cancel·draft ack·callback을 역순으로 보내 B의 시도·초안·현재 grant가 보존되는지 확인한다.

### VFY-PRV-05: 생성 Action과 기존 등록 결과

- category: integration / regression.
- verifies: REQ-PRV-005, REQ-PRV-006, REQ-PRV-009, REQ-PRV-015.
- destination: 새 `tests/server/github-create-project.test.ts`가 실제 `api/create-project.server.ts:createProject`를 로드해
  auth·GitHub 선택 검증·`registerWebProject` 호출을 관찰한다. 기존 `tests/server/project-registration.test.ts`는 REST 보존용이다.
  기존 projects registration·create-project result 시험도 유지한다.
- expected: 조작된 source/owner/repository ID·stale grant·권한 제거는 연동 분기에서 쓰기 0건으로 거부한다.
  수동 분기의 기존 입력·상한·기존 프로젝트·disconnected·응답 미확인·최초 생성 시 한 번의 reveal을 유지한다.
  기존 REST 시험의 통과를 Web Action의 허용 집합 검증 통과로 대체하지 않는다. 기본 브랜치가 없는 연동 선택의 누락 branch는 쓰기 0건이다.

### VFY-PRV-06: DB 경쟁·migration·비밀 저장

- category: database / migration / recovery.
- verifies: REQ-PRV-011, REQ-PRV-012, REQ-PRV-013, REQ-PRV-018.
- destination: 제안 `tests/server/integration/github-connection.test.ts`; 검증된 `TEST_DATABASE_URL`만 사용.
- expected: 서로 다른 DB connection에서 attempt consume·refresh lease·grant 해제의 CAS를 경쟁시킨다.
  token pair 원자성·키 교체·삭제·lease timeout·구형 앱과 additive schema 호환을 확인하고 기존 User/Project/토큰 rows는 보존한다.

### VFY-PRV-07: 실제 화면·접근성·복귀

- category: browser / accessibility.
- verifies: REQ-PRV-002, REQ-PRV-004, REQ-PRV-005, REQ-PRV-006, REQ-PRV-007, REQ-PRV-008, REQ-PRV-010, REQ-PRV-012, REQ-PRV-014, REQ-PRV-016.
- destination: 기존 `tests/server/fixtures/src-clean-code-browser.tsx`, `src-clean-code-acceptance.ts`와
  `scripts/rehearsals/rehearse-src-clean-code.ts`의 form 모드·ui-only 및 실제 Next `/p/new` 인수.
- expected: Public/Private 첫 연결·반복 사용·URL·부분 오류·취소·외부 복귀·두 탭·동명 조직 repo를 확인한다.
  실제 키보드, focus 복귀, live status/error, 모바일 폭과 확대에서 동작을 확인한다. fixture 성공을 실제 GitHub 승인으로 해석하지 않는다.
  연동·관리·해제 버튼이 root form을 제출하지 않는지, 버튼 한 번당 의도한 POST만 생기는지 확인한다.
  두 탭은 cookie를 공유하며 최신 B만 완료된다. 이전 A의 취소·ack·callback은 B에 영향을 주지 않고 A에는 superseded 복구 안내가 보인다.
  기존 연동의 관리 진입·권한 부족·변경 없음·callback 없는 뒤로 복귀에서 초안·명시적 재조회·URL 대안을 확인한다.

### VFY-PRV-08: 비밀·Private 메타데이터 격리

- category: security / privacy.
- verifies: REQ-PRV-003, REQ-PRV-004, REQ-PRV-009, REQ-PRV-011, REQ-PRV-012, REQ-PRV-013, REQ-PRV-017.
- destination: server/API/SSR 응답·브라우저 storage·로그 수집 시험과 서명 webhook 부정 입력 시험.
- expected: canary token·secret·PKCE와 다른 사용자의 repository 이름을 HTML/RSC/JSON/header/redirect/로그에서 검색한다.
  cache header와 no-store 요청을 대조하고 잘못된 webhook 서명·다른 App·중복 delivery·순서 역전은 권한 확대를 일으키지 않는다.
  `github_app_authorization`은 installation/app ID 없는 실제 schema도 처리한다. 설치 이벤트와 같은 공통 schema를 강제하지 않는다.
  로그 검증은 `Error.message`, stack/cause 및 중첩 필드를 포함한 실제 console 포맷을 검사한다.
  현재 github 서버 시험의 `JSON.stringify(logs)`만으로는 Error의 message가 빠질 수 있어 비노출 증거로 충분하지 않다.
  새 provider와 이동한 Public provider 모두 제한된 오류 분류만 기록하고 raw 예외·요청/응답 body를 logger에 전달하지 않는다.
  Public 성공·오류 category는 보존하되, 현재 catch의 raw Error 인자를 보존 대상으로 오인하지 않는다.

### VFY-PRV-09: 실제 App·조직·점진 배포·복구

- category: external acceptance / deployment / recovery.
- verifies: REQ-PRV-001, REQ-PRV-002, REQ-PRV-004, REQ-PRV-006, REQ-PRV-011, REQ-PRV-012, REQ-PRV-014, REQ-PRV-015, REQ-PRV-017, REQ-PRV-018.
- destination: 승인된 테스트 계정·개인 Private/조직 저장소·인수 배포의 수동 프로토콜과 증거 보고서.
- expected: 실제 App의 metadata-only 권한·현재 사용자 교집합, 승인 거부·대기·추가 허용·SSO·철회·refresh·재연동을 확인한다.
  App의 public 설정과 owner 외 테스트 계정·다른 조직의 설치 가능 여부를 확인한다. Private 저장소가 공개되는 설정으로 설명하지 않는다.
  기존 설치의 저장소 추가·제거 후 callback과 직접 복귀·재조회 모두에서 실제 허용 집합을 대조한다.
  기능 OFF·키 회전·구버전 rollback 뒤에도 기존 로그인·Public/URL·프로젝트가 동작하고 secret·Private 이름 없는 결과를 기록한다.
  이전 callback·미정산 refresh가 남은 rollback과 모두 정리된 rollback을 따로 확인한다.
  보안 handler를 포함하지 않은 구버전으로 즉시 돌아간 상태를 webhook·삭제 계약 통과로 기록하지 않는다.

### 향후 구현 시 실행 명령

다음은 저장소에서 발견한 명령이다. 신규 시험이 실제 glob에 포함되는지 확인한 뒤 실행한다.

```bash
npm run db:generate
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:server
npm run test:server:integration
npm run build
```

`test:server:integration`은 별도 검증된 테스트 DB가 필요하다. `test:server`는 기본 check workflow와 별도이므로
구현 PR에서 실제 실행 결과 또는 필요한 CI 연결을 기록한다. 실제 OAuth·조직·배포 인수는 위 자동 명령으로 대체하지 않는다.

이동·공개 API·runtime 시험의 목적지는 다음 고정 명령으로 추가 확인한다. 따옴표 안 glob은 현재 Node test와 기존 package 명령의 형태를 따른다.

```bash
node --import tsx --test "src/fsd/features/create-project/**/*.test.ts" "src/server/github/*.test.ts"
node --import ./tests/server/register-server-only.mjs --import tsx --test "tests/server/github*.test.ts"
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only
```

첫 명령의 새 github pure 시험은 server-only 구현을 import하지 않아야 한다.
두 번째 명령은 runtime/server-only·실제 Action/route 시험의 목적지이며 기존 Public 시험을 포함한다.
마지막 명령은 loopback fixture를 시작한다. `/fixture?mode=form&picker`와 `/results`의 실제 DOM·동작 결과를 확인하고
`/finish`로 listener·지연 작업을 종료한다. 서버를 띄우거나 200/HTML shell만 확인한 것을 브라우저 통과로 기록하지 않는다.

fresh build Action/route registry 인수는 일반 시험과 구분한다.

```bash
npm run build
GITHUB_CHECK_ACTION_MANIFEST=true npm run test:server
```

위 두 줄은 zsh/bash용이다. PowerShell에서는 build 후 `$env:GITHUB_CHECK_ACTION_MANIFEST = 'true'`를 설정해
`npm run test:server`를 실행하고 `Remove-Item Env:GITHUB_CHECK_ACTION_MANIFEST`로 정리한다.
새 manifest 시험은 build identity를 기록하고 전체 export를 읽어 기존 createProject 외 비밀 처리 helper가 Action에 등록되지 않았음을 확인한다.
모든 선언 route의 body·Location·auth 시험은 별도로 실행한다. registry 존재는 실제 응답의 정확성을 증명하지 않는다.

## Verification Results

설계 작성 시 검증 기록은 아래와 같다. 후속 승인 구현의 실제 자동·DB·브라우저·build 결과는 Implementation Results에 기록한다.
실제 App·조직·운영 배포 인수는 미실행이다.

| 항목 | 결과 | 의미 |
| --- | --- | --- |
| 현재 코드·계약·설치 버전 읽기 | Executed | 로그인·목록·등록·권한·테스트 배치의 근거 확인 |
| 공식 GitHub 문서 읽기 | Executed | 사용자 토큰 교집합·metadata 권한·콜백·PKCE·refresh 계약 확인; live API 미호출 |
| SDD 구조·추적성 검사 | PASS, standard | 18개 요구사항 모두 Phase·canonical VFY 연결, 중복·누락·경고 없음 |
| 로컬 Markdown 링크 검사 | PASS | 이 파일에서 참조한 저장소 문서·원본 경로의 존재 확인 |
| 작성 시 의미 검토 | Executed | SDD 작성 기준의 권한·DTO·초안·완료 책임 검토이며, 이후 정합화 clean pass나 구현 준비 완료의 증거는 아님 |
| 제품 VFY-PRV-01부터 VFY-PRV-09 | Not executed | 향후 구현·실제 인수 계획이며 통과 증거가 아님 |

표준 validator를 사용한다. 이 문서는 HIGH-RISK 전체 설계 제안과 downstream outline이며,
구현 승인·외부 구성·Phase 상세 계획이 남아 있으므로 finalized executable bundle용 strict 판정은 적용하지 않는다.
의미 검토에서는 P1/P2의 기여와 P3의 최종 요구사항 완료 책임, 기존 동작 보존, 실패·철회·복구와 실제 인수 게이트를 별도로 확인했다.

## Risks and Rollback

- 목록 편의만을 위한 첫 승인·App 설치는 URL 입력보다 오래 걸릴 수 있다. URL 대안을 숨기지 않고 완료 시간·취소율을 함께 관찰한다.
- 조직 설치·사용자 승인·SSO·설치 저장소 선택은 서로 다른 상태다. 조직 전체 접근권한이나 항상 한 번의 승인으로 끝나는 흐름을 약속하지 않는다.
- 새로운 암호화·refresh·콜백은 기존 서비스에 없던 보안 경계다. P0/P1 증거 없이 화면만 구현해 공개하지 않는다.
- GitHub의 허용 범위가 등록 직전 바뀔 수 있다. 이 기능을 저장소 소유권 인증이나 GitHub 코드 접근 권한 부여로 표현하지 않는다.
- feature flag의 제안 이름은 `GITHUB_REPOSITORY_PICKER_ENABLED`다. App·vault·webhook 설정 이름과 운영 전달 경로는 P0에서 고정한다.

롤아웃: additive migration → 기능 OFF인 서버 → fixture·격리 DB → 실제 인수 계정 → 승인된 범위 확대 순서다.
OFF 상태에서도 incoming webhook의 서명 검증·폐기 처리와 비밀 삭제는 유지한다. 새 연동·목록 제공만 중지한다.
구성 오류는 전체 app startup 실패 대신 추가 연동 unavailable로 격리하되, 활성화 gate는 열지 않는다.

롤백: flag OFF → 새 승인·목록 요청 중지 → 진행 중 시도 무효화 → Private 메모리 결과·비밀 제거 정책 수행 순서다.
신규 callback/webhook/삭제 handler가 없는 버전으로의 binary rollback은 이 절차와 동일하지 않다.
우선 handler가 남아 있는 비활성 버전을 유지하고, 모든 시도·refresh lease·외부 발급 결과가 정산되고
남은 비밀·복원 초안·처리 중 delivery가 없다는 DB/외부 인수 증거를 확인한 뒤에만 해당 handler가 없는 버전으로 돌아간다.
이 증거가 없으면 callback·webhook 경로를 유지한다. OFF가 credential 정리나 webhook 인증을 끄는 설정이 되지 않게 한다.
기존 Project와 Stagekeeper 토큰을 되돌리거나 폐기하지 않는다. 구형 앱이 읽지 않는 추가 테이블은 먼저 유지하고,
데이터·회전·삭제 증거 없이 down migration으로 제거하지 않는다. App uninstall은 일반 사용자별 해제의 대체 절차가 아니다.

## Approval

원래 구현 승인 기록은 front matter에 보존한다. 승인된 코드·계약·마이그레이션·시험·PR 제출은 완료됐고,
이후 확인한 병합 결과는 Completion or Closure Notes에 기록한다. 이번 완료 처리는 운영 활성화 승인을 포함하지 않는다.

## Definition of Done

완료 판정은 승인된 코드 구현·검증·`dev` 병합 범위에 적용한다. 제품 출시를 위한 실제 외부·운영 인수는
다음 절의 후속 작업이며, 기존 Behavioral Requirements·VFY의 인수 기준은 유지한다.

- [x] ADR-0006, 서버 모듈·공개 API, schema·migration·정리 정책과 선택형 UI·등록 재검증을 구현했다.
- [x] 기존 로그인·Public/URL 등록 보존과 시도·토큰·철회·초안 수명주기의 로컬·fixture·격리 DB 검증 결과를 Implementation Results에 기록했다.
- [x] 경계 검사·lint·타입·테스트·production build와 Action manifest·Private 브라우저 인수의 통과 기록을 확인했다.
- [x] 공통 Pipeline 리허설의 기존 실패 11개와 미실행 외부·운영 인수를 구분해 남겼다.
- [x] PR #214의 `dev` 병합과 최신 `dev`의 병합 커밋 포함을 확인했다.
- [x] 완료 metadata·문서 위치를 갱신하고 운영 활성화 전 후속 작업과 담당자를 남겼다.

## Completion or Closure Notes

2026-10-26 승인된 구현 범위의 수행 기록으로 완료 처리했다.

- 구현 PR: [#214](https://github.com/Sangeok/stagekeeper/pull/214), `feat: add optional private repository picker`.
- 병합: 2026-10-23 16:51:51 KST, 대상 `dev`, 커밋 `6cc102aa3a5c04a7943cb230b5618c9cfd52b690`.
- 완료 확인 기준: `origin/dev`의 `105100232119381a2729a847fad2fac5ea504820`. 병합 커밋이 해당 이력의 조상임을 확인했다.
- 구현 당시 자동·DB·브라우저·build 검증은 아래 Implementation Results와 PR 기록을 근거로 한다. 이번 문서 정리에서 제품 시험을 재실행한 것으로 표기하지 않는다.
- 문서 정리 검증: `npm run docs:check`, 완료 metadata와 파일명 일치 확인, `git diff --check`.

### 운영 활성화 전 후속 작업

아래 항목은 미완료다. 기능과 operations-ready gate의 기본 OFF를 유지하며,
실행 기준은 [ADR-0006](../../ADR/0006-optional-github-repository-list.md), README의 운영 설정,
기존 BLK-PRV-02/03/04와 VFY-PRV-09를 따른다.

- [ ] 배포 운영자: 운영 migration 적용, 별도 keyring·webhook secret 공급, 키 회전·복구 및 최소 10분마다 maintenance 실행 증거 확보(BLK-PRV-02).
- [ ] GitHub App 관리자: 실제 App의 public·Metadata read·만료 토큰 정책과 환경별 callback/setup/webhook URL 검증(BLK-PRV-03).
- [ ] 저장소 소유자·배포 운영자: 실제 개인·조직/SSO·owner 외 설치·허용 범위 변경·철회·rollback 인수 후 승인된 범위에서 활성화(BLK-PRV-04).

## Review Checklist

- [x] 문서 한 파일의 작성과 향후 구현 범위를 구분했다.
- [x] 현재 로그인·Public/URL·기존 프로젝트·프로젝트 토큰 계약을 근거와 연결했다.
- [x] GitHub App 사용자 토큰의 교집합, owner/ID, metadata-only와 브랜치 API 제한을 구분했다.
- [x] 계정·세션·초안·callback·refresh·해제·webhook·부분 실패의 수명주기를 정의했다.
- [x] 새 서버 모듈·비밀 운영·실제 App·조직 인수 blocker를 필요한 Phase에 연결했다.
- [x] 전체 설계, Phase 준비 상태, fixture 검증과 실제 제품 인수 완료를 구분했다.
- [x] 기존 runner·명령·테스트 배치를 사용하고 제안 경로는 신규로 표시했다.
- [x] 요구사항 완료 책임과 canonical VFY를 연결했다.
- [x] 문서 구조 validator와 최종 의미 검토 결과를 확인했다.
- [x] authorization/installation 시도와 App 설정의 callback 구성을 구분했다.
- [x] JSON fetch·top-level redirect·단일 form·서버 인증 응답의 실제 전이를 고정했다.
- [x] 명시적 pick과 비동기 reconcile의 입력 우선순위, nullable 기본 브랜치를 구분했다.
- [x] 개별 토큰 폐기 순서·event별 webhook body·구버전 rollback 중 보안 handler 보존을 명시했다.
- [x] Web Action·REST·runtime/pure 시험·브라우저·최종 body 검증의 목적지를 구분했다.
- [x] 구현 완료와 미완료 외부 App 설정·운영 인수·활성화를 구분해 기록했다.

## Reconciliation Review

2026-10-23 `reconciling-proposals-with-codebase`의 High-Risk 기준으로 문서 전체를 대조했다.
최초 문서에 개선점이 없었던 것은 아니다. 아래 항목은 승인된 제품 방향을 변경하지 않고 현재 코드·공식 계약으로 보완한 내용이다.

| 확인 영역 | 최초의 문제·근거 | 반영한 해결 |
| --- | --- | --- |
| 승인·설치 시도 | OAuth 성공 시 소비한 시도를 설치 callback에서도 미소비 상태로 요구함 | 종류별 일회 state·시도와 grant 저장/설치 검증 순서를 분리 |
| App·브라우저 전이 | setup URL과 자동 OAuth-on-install의 설정 전제가 없고, fetch POST의 redirect·기존 form 제출 의미가 불명확함 | 호환 App 옵션, start의 JSON→navigation, 8개 route/9개 method, 버튼 타입 고정 |
| 인증·초안 | page redirect guard와 JSON API 인증을 구분하지 않음 | API는 auth 기반 401 JSON, top-level callback만 고정 redirect, SSR read/POST ack·cancel 구분 |
| 선택 우선순위 | 현재 pick은 새 기본 브랜치를 적용하지만 문서는 touched 보존과 새 선택의 우선순위를 구분하지 않음 | 새 pick/동일 항목 reconcile 분리, nullable 기본 브랜치와 수동 branch 전제 명시 |
| 폐기·webhook | 비밀 제거 뒤 provider 폐기에 필요한 토큰과 event별 필수 필드가 불명확함 | 메모리 확보→로컬 tombstone→개별 token 폐기, 서명과 event별 schema, 늦은 철회의 한계 명시 |
| 구버전 복구 | webhook/삭제 유지 요구와 handler 없는 이전 앱 복구가 충돌함 | 비활성 호환 버전 유지와 정산 후 binary rollback을 구분 |
| 이동·산출물 | 디렉터리 단위 영향 목록과 공개 API·생성 산출물 검증이 섞여 있음 | 구체 경로·symbol provenance·filesystem preflight·최종 body/생성 경로 지도 추가 |
| 검증·판정 | REST 시험을 Web Action 증거로 오인할 수 있고, Error의 JSON 변환은 실제 console 노출을 놓칠 수 있음 | 실제 Action binding·서버 bootstrap·console formatter·브라우저·manifest 목적지 분리, 작성 검증과 준비 상태 구분 |

같은 날 전체 재검토에서는 다음 세 항목을 추가로 보완했다. 기존 정합화 결과를 clean pass로 재사용하지 않았다.

| 재검토 영역 | 추가로 확인한 문제 | 반영한 해결 |
| --- | --- | --- |
| 두 탭의 시도 | 브라우저별 최신 시도 규칙과 VFY의 포괄적인 탭 격리 표현이 충돌함 | cookie 공유·이전 시도 superseded를 명시하고 cancel/ack/callback의 시도별 영향과 복구 검증을 고정 |
| 기존 연동 관리 | start에 manage가 있으나 유효 grant에서 설치 관리로 가는 전이와 callback 없는 복귀가 불명확함 | OAuth 재승인과 설치 관리 분기, 변경 없음·권한 부족·명시적 재조회·초안 복원을 연결 |
| App 배포 범위 | metadata-only와 callback 설정만으로 다른 사용자·조직의 설치 가능 여부를 검증할 수 없음 | 일반 사용자 제공에 필요한 App public 설정과 owner 외 설치 인수를 BLK-PRV-03·VFY-PRV-09에 반영 |

위 문서 정합화 당시 상태는 `clean pass not completed`였으며 당시에는 제품 코드를 변경하지 않았다.
이후 승인된 코드·계약 변경은 다음 구현 기록에 따른다. 실제 외부·운영 인수가 남아 있으므로 제품 전체 출시 완료를 선언하지 않는다.


## Implementation authorization — 2026-10-23

현재 사용자의 구현 요청으로 코드·계약·검증 변경을 진행한다. 원본 작업 트리는 보존하고 최신 origin/dev의 별도 worktree를 사용한다.
P0의 모듈 경계와 기본 OFF 구현 계약은 ADR-0006에 기록한다. public/private만 선택 대상으로 지원하고 archived는 두 목록 모두 제외하되 미지원 건수를 표시한다.
토큰은 별도 AES-256-GCM keyring으로 암호화하고, state·브라우저 binding은 해시만 보관한다. 시도는 10분, delivery 중복 기록은 24시간 뒤 정리한다.
만료 자료 물리 삭제와 keyring 회전은 운영 maintenance 명령으로 수행하며 운영자는 주기 실행을 설정해야 한다. 기능 ON의 조건에 운영 준비 확인을 포함한다.
connection revision은 승인·철회·허용 범위 변경을 fence하고 tokenVersion은 refresh 경쟁을 fence한다. 정상 refresh만으로 사용자 선택을 stale로 만들지 않는다.
BLK-PRV-03/04의 실제 App 설정·외부 인수와 운영 key 공급·주기 실행 증거는 이 PR의 로컬 구현 검증과 구분해 남긴다. 일반 공개는 수행하지 않는다.

## Implementation Results — 2026-10-23

코드는 별도 `harness/optional-private-repository-picker-20261023` worktree에서 구현했고 PR #214로 `dev`에 병합됐다. 기본 로그인 scope와 기존 프로젝트 권한·등록 서비스를 바꾸지 않았다.
기능과 operations-ready gate는 기본 OFF다. 실제 App·비밀·운영 DB·배포를 설정하거나 활성화하지 않았다.

| 구현 대상 | 현재 산출물과 검증 |
| --- | --- |
| 서버 경계 | 루트 github.ts 제거, github/api.server 공개 진입점과 contracts·주입형 서비스·runtime store/provider/vault/configuration. 검사기에 github 방향만 추가하고 다른 경계는 유지 |
| 저장 수명주기 | GitHubConnection/ConnectAttempt/Installation/WebhookDelivery의 additive migration. 사용자 FK cascade, 시도 소비·grant/token version·refresh lease·webhook 중복과 정리/회전의 실제 PostgreSQL 시험 |
| HTTP 조합 | 8개 route/9개 method, app/api/github/request.ts의 세션·기대 사용자·Origin·body 제한·binding·JSON/redirect/no-store 처리. webhook은 별도 서명 경로 |
| 프런트엔드 | 기존 slice의 server/client adapter, github-connection-state/use-repository-picker, repository-connection-panel. 실제 owner/ID·nullable branch·명시적 동의·flow 복원·지연 응답·해제와 URL 대안 |
| 등록 | 실제 createProject Action에서 authorized 선택만 현재 사용자 범위로 재검증한 뒤 토큰을 만든다. branch/name 편집만으로 authorized 출처가 사라지지 않음. 수동 등록에는 App 권한을 요구하지 않음 |
| 운영 도구 | scripts/maintain-github-connections.ts와 github:maintenance. --apply가 필요하며 --rotate는 active key 재봉인을 수행. 실제 운영 실행은 별도 |

로컬 검증: verify:fsd, verify:server, test:architecture, check, npm test, test:web, test:server, 격리 PostgreSQL의 test:server:integration과 production build가 통과했다.
fresh build 뒤 GITHUB_CHECK_ACTION_MANIFEST=true 인수에서 createProject만 원격 Action으로 남고 8개 route가 실제 registry에 있음을 확인했다.
SDD standard 추적성 18/18, docs:check의 로컬 Markdown 참조, git diff --check도 통과했다. 테스트의 플랫폼·선택 실행 skip은 해당 환경의 통과로 해석하지 않는다.

독립 frontend-clean-code-orchestrator 검토는 6개 applicable lens와 중립 gate를 모두 수행했다. 7개 canonical 항목을 반영했다.
Edit의 authorized 출처 보존, 세션 만료의 복원 fence, 취소된 loading 종료, 오류 문구 우선순위, 최신 로컬 입력 보존, 해제 후 선택 제거, 복원 focus와 문구의 분리를 포함한다.
원본 브라우저 fixture의 첫 Private 사례 8개는 Chrome에서, 최종 Private 전용 9개는 Safari에서 통과했다.
공통 리허설의 Pipeline 실패 11개는 기준 cd07b0f에서도 동일하게 재현되어 구분했다. Private 전용 실행은 `?private-only&autorun`으로 선택한다.
조회한 page 힌트의 실제 membership 확인, 세션 변경 시 늦은 생성 응답의 token reveal 차단, refresh와 disconnect 사이의 credential/lease fence도 단위·브라우저·실제 DB에서 해당 범위로 확인했다.
이 기록은 live OAuth·실제 조직/SSO·운영 key 공급·정기 실행·운영 rollback의 통과 증거가 아니다. BLK-PRV-02의 운영 증거와 BLK-PRV-03/04가 남아 있다.
