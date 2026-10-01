---
status: "completed"
stage: null
proposal-size: "standard"
risk: "high"
created-at: "2026-09-27"
approved-by: "user (conversation; product decisions and local implementation)"
approved-at: "2026-09-30"
approval-scope: "제품 정책 및 RDC1–RDC3 로컬 코드 수정·검증·출시 절차 작성. 후속 요청으로 구현 변경의 커밋·feature branch 푸시·dev 대상 PR 생성 승인. 운영 DB 변경·배포·활성화·PR 병합은 포함하지 않음."
completed-at: "2026-10-01"
verification-summary: "RDC1–RDC3의 코드·migration·운영 검사·출시 절차 구현 완료. 구현 커밋 3add350은 PR #89로 dev에 병합됨. 자동 검사·격리 PostgreSQL·실제 Next transport 통과 기록과 2026-10-01 관련 단위 시험 22개 통과를 확인. 사용자 요청에 따라 구현 완료 기록으로 종료하며, 브라우저·실제 init 수동 인수와 BLK-RDC-01/02 운영 활성화 증거는 후속 점검으로 유지."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/completed/2026-09-15-individual-project-availability.md"
  - "docs/proposals/completed/2026-09-22-user-scoped-project-identity.md"
  - "docs/architecture/README.md"
  - "docs/architecture/invariants.md"
  - "docs/conventions/product-copy.md"
---

# 저장소 연결 해제와 재연결

## Completion or Closure Notes

연결 해제·명시적 재연결·등록 한도 반환·토큰 폐기·읽기 보존·UI·CLI·migration과 운영 검사 구현을 완료했다.
구현 커밋 `3add350`은 [PR #89](https://github.com/Sangeok/stagekeeper/pull/89)로 `dev`에 병합됐다
(merge commit `02f86cb`, 2026-09-30). 2026-10-01 사용자의 구현 완료 처리 요청에 따라 이 제안서를
`completed` 수행 기록으로 정리했다. 현재 계약은 `docs/architecture/repository-disconnection.md`가 소유한다.

아래 최초 설계·Task·검증 계획과 완료 조건은 판단 근거로 보존한다. 실제 수행 결과와 이 문서의 완료 범위는
이 절 및 구현·검증 기록을 따른다. 코드 구현과 수행한 자동·DB·Next 검증의 완료를 기록하며,
미실행 수동 인수나 운영 활성화의 통과를 뜻하지 않는다.

- 브라우저의 연결 관리 클릭·키보드·두 탭 stale·응답 유실 후 화면 갱신과 실제 `/harness:init` 수동 인수는
  [검증 보고서](../../test-reports/active/2026-09-27-repository-disconnection.md)의 후속 검증으로 남긴다.
- BLK-RDC-01/02의 운영 데이터·backup 복원·전체 writer drain·호환 배포·설치본 버전 증거는 별도 운영 작업이다.
  기본 `PROJECT_CONNECTION_WRITES_ENABLED=false`와 기존 활성화 조건을 유지한다.
- 2026-10-01 현재 `dev`의 연결 service·접근·등록·확인 UI/model 관련 단위 시험 22개가 모두 통과했다.
  2026-10-01 [후속 회귀 보고서](../../test-reports/completed/2026-10-01-src-clean-code-third-pass-regression.md)에도
  실제 연결 action·일곱 상세 GET·History와 DB 회귀 통과가 기록되어 있다.

## 목표와 결정 기록

연결된 repo를 해제하여 프로젝트 등록 한도를 반환하고, 확보한 자리에 다른 repo를 연결할 수 있게 한다.
Free의 대표 흐름은 **A 연결(1/1) → A 해제(0/1) → B 연결(1/1)**이다.
GitHub 저장소를 삭제하거나 GitHub 로그인·계정 전체 연동을 해제하는 기능은 아니다.

사용자와의 인터뷰에서 확정한 정책:

| 결정 | 확정 내용 |
| --- | --- |
| 데이터 | 보드·백로그·설정·실행 이력을 삭제하지 않고 소유자에게 읽기 전용으로 보존 |
| 등록 한도 | 해제된 프로젝트는 등록 개수에서 제외. 마지막 연결도 해제 가능 |
| 같은 repo 재연결 | 새 프로젝트를 만들지 않고 기존 프로젝트·데이터를 복원. 등록 한도를 다시 점유 |
| 사용자 토큰 | 계정에 묶인 hu_는 유지. 해제한 프로젝트 접근만 차단 |
| 프로젝트 토큰 | 해당 프로젝트의 hs_·ho_는 해제 시 폐기. 재연결해도 부활시키지 않고 필요 시 새로 발급 |
| 재연결 의사 | 사용자의 명시적인 재연결만 허용. 에이전트 재시도·동기화·초기화가 자동 복구하지 않음 |
| 진행 중 작업 | 작업 수와 영향을 안내한 뒤 해제 허용. 새 요청을 막고 이미 서버가 허용한 요청은 완료될 수 있음 |
| 로컬 환경 | 로컬 Claude Code를 강제 종료하거나 repo 파일을 삭제하지 않음. 재연결 시 유효한 설정 재사용 |

마지막 정책은 사용자가 해제 허용 선택지 1번으로 확정했다. 추가 제품 결정 질문은 남기지 않는다.
아래의 DB 필드, 웹 전용 재연결 진입점, 화면 배치는 합의된 동작을 실현하기 위한 **설계 제안**이다.
이 문서를 작성한 것이 제품 코드를 구현하거나 운영 변경을 승인한 것은 아니다.

## 구현·검증 기록 — 2026-09-30

사용자의 후속 요청 **“좋다 해당 문서를 바탕으로 실제 코드 수정을 진행하라.”**로 로컬 구현 권한을 받았다.
`harness/repository-disconnection`의 `7a43fd56465d9f6a597bcf9c45e8cc8805364359` 위 working tree에
RDC1–RDC3의 코드·migration·운영 검사·문서를 반영했다. 현재 계약은 갱신한 architecture 문서가 소유하며,
실행 결과는 [검증 보고서](../../test-reports/active/2026-09-27-repository-disconnection.md)에 기록한다.

필수 npm gate, 격리 PostgreSQL 경쟁·보존·전체 migration 체인, 실제 Next action/GET·커밋 뒤 응답 유실은 통과했다.
실제 User 잠금 대기에서 확인한 Prisma P2010/40001도 기존 P2034와 같은 transaction 재시도 경계로 보완했다.
브라우저 provider가 없어 클릭·키보드·두 탭의 화면 인수는 **미실행**이다. component/transport 통과로 이를 대체하지 않는다.
따라서 구현 코드는 반영했지만 RDC3의 전체 인수 완료와 운영 활성화 완료는 선언하지 않는다.
기본 스위치는 false이며 BLK-RDC-01/02의 운영 증거는 여전히 필요하다. 로컬 검증 시점에는 운영 DB·배포·커밋·푸시를 수행하지 않았다.
후속 사용자 요청 **“dev에 pr날려라”**로 이 구현의 커밋·feature branch 푸시·dev 대상 PR 생성을 승인받았다.
이 추가 승인은 PR 병합이나 운영 변경·활성화를 포함하지 않는다.

## 근거와 위험 분류

아래 Observed·baseline은 구현 전 문서 대조 기록이다. 위 후속 구현·검증 기록이 당시의 문서 전용 작업 범위를 확장한다.

- Evidence baseline: 2026-09-30, commit `7a43fd56465d9f6a597bcf9c45e8cc8805364359`와 검토 시 저장된 working tree. branch는 `harness/complete-project-history-doc`, 이 제안서는 untracked다. History 구현 `d0c1077`은 `139f05b`에서 dev에 병합되었고, 현재 HEAD는 완료 문서 정리 커밋까지 포함한다. `docs/proposals/completed/2026-09-30-project-history-tab.md`는 별도 작업의 역사적 계획이므로 source bundle에 포함하지 않는다. 현재 커밋된 History의 Items 요약·항목 펼침·Events·공용 UI·시험·문구를 아래 보존 inventory에 포함하며, 과거 Events 전용 화면이나 여섯 상세 경로를 현재 상태로 간주하지 않는다.
- 과거 기준 `bad4d58883520b94f3ee99c903ee833587fdcf21` 이후 초기화 계약이 바뀌었으므로 HEAD만으로 동일성을 판단하지 않는다. 최종 검토는 저장된 문서와 경계 내 파일 내용 기준이며, 쓰기 범위는 이 문서 하나다.
- Source bundle: 이 제안서가 신규 동작의 유일한 구현 계획이다. 현재 구조·불변식은 AGENTS.md 및 아래 I-OPS/I-KEEP의 architecture·CONTEXT·product-copy를 함께 대조한다. frontmatter의 completed 제안서 두 개는 소유권/토큰 도입의 역사적 근거이며 그 실행 계획을 재실행하지 않는다.
- Scope: RDC1·RDC2·RDC3의 로컬 구현·검증·출시 절차 작성은 모두 Core다. 번호는 구현 순서이며 RDC2를 선택적 후속 기능으로 분류하지 않는다. 실제 운영 데이터 점검·활성화는 별도 배포 권한과 BLK 증거가 필요한 Approval-after다.
- 언어·도구: Next.js 16.3.3, React 19.2.8, TypeScript, Prisma 7.10, PostgreSQL, npm, node:test/tsx.
- Risk: **HIGH-RISK**. 인증·프로젝트 접근·등록 한도·영구 토큰 폐기·DB 마이그레이션·동시 요청이 교차한다.
- Observed는 아래 코드에서 직접 읽은 사실, Contracted는 현재 아키텍처 문서의 규칙이다. 운영 환경의 현재 데이터와 실행 결과는 조사하지 않았다.

| 관심사 | Observed / Contracted 근거 | 이번 변경 |
| --- | --- | --- |
| 선택과 해제 | `src/fsd/features/select-project-for-use/ui/use-project-control.tsx`: available이면 컨트롤을 숨김 | 연결 해제를 별도 동작으로 추가 |
| 저장된 상태 | `prisma/schema.prisma`: Project.available만 있고 연결 해제 상태는 없음 | 연결 수명을 나타내는 상태 추가 |
| 등록 한도 | `src/server/project-registration-query.ts:registerProjectResultIn`: owner.projects.length로 검사 | 연결된 프로젝트 수로 검사 |
| 최소 선택 1개 | `src/server/project-availability-service.ts:readOwnerAvailabilityIn`: 소유 프로젝트가 있으면서 available 0개면 오류 | 0개를 정상 상태로 허용 |
| 기존 repo 등록 | 동일 사용자의 repoOwner/repo를 찾으면 existing 반환. DB 복합 unique는 없음 | 해제된 기존 repo는 별도 거부 상태, 중복 생성 금지 |
| 웹 생성 결과 | `create-project.server.ts`는 capped 이외 결과를 created/token으로 반환 | existing·disconnected를 명시 분기해 저장되지 않은 토큰 노출 방지 |
| 접근 | `project-access-query.ts`, `auth/guard.ts`: 소유권·available 검사 | disconnected 사유를 not-selected와 구분 |
| MCP 예외 | `mcp/tools.ts:project_get`는 not-selected에 프로젝트 본문도 반환 | disconnected에는 본문 없이 거부 |
| 토큰 | `schema.prisma`, `mcp/auth.ts`, `manage-token.server.ts`: hs_/ho_는 project, hu_는 user에 귀속 | 프로젝트 토큰만 폐기하고 발급 경쟁도 차단 |
| 실행 주체 | `docs/architecture/system-overview.md`: Claude Code는 사용자의 환경에서 실행 | 서버 접근 차단을 로컬 강제 종료라고 표현하지 않음 |
| 허용된 요청 | `docs/architecture/invariants.md`: access를 통과한 요청은 완료될 수 있음 | 이 경계를 유지하고 해제 확인창에 설명 |
| 사용 선택 계약 | `docs/architecture/invariants.md`, `CONTEXT.md`: not-selected는 연결·토큰 보존 | 해당 계약 유지. disconnected만 별도 정책 적용 |
| 플랜 변경 | `availabilityAfterPlanChange`: downgrade만 선택 집합을 줄임 | 연결 해제나 자동 재연결을 플랜 변경에 섞지 않음 |
| 초기화 | `plugin/skills/init/SKILL.md`, `plugin/bin/harness-init.mjs`: --register 멱등 조회, 일반 hu_의 project 전달·slug 누락 차단·기존 설정 보완이 이미 구현됨 | 스코프 계약을 보존하고 해제 거부·재연결 안내 추가 |
| 운영 검사 | `scripts/lib/project-ownership-cleanup.ts`: available 0개를 손상으로 판단 | 새 스키마의 정상 해제 상태를 인정하되 과거 D2 검사 보존 |
| 웹 이력 | `p/[slug]/history/page.tsx`, `pipeline/board-query.ts`, `pipeline/history-items.ts`, `pages/project-history`, `widgets/history-feed`: 기본 Items 요약·항목 펼침·Events, 소유자 조회·플랜별 cutoff·독립 cursor·보고 링크 | 해제 뒤에도 두 mode와 펼친 이력의 조회/표시 계약 보존. 연결 수 필터를 이력 조회에 전파하지 않음 |

현재 아키텍처가 우선이다. 구현 시 이 문서의 계약 변경을 함께 반영할 문서는
`docs/architecture/README.md`, `system-overview.md`, `invariants.md`, `protocol.md`,
`CONTEXT.md`, `docs/conventions/product-copy.md`다. 과거 완료 제안서를 현재 계약으로 덮어쓰지 않는다.

## 용어와 상태

**연결됨**은 등록 한도를 점유하는 상태다. **사용 가능**은 연결된 프로젝트 중 현재 작업이 허용된 상태다.
**연결 해제됨**은 데이터·소유권은 남지만 등록 한도를 점유하지 않고 연동 요청이 차단된 상태다.

| 연결 상태 | available | 등록 한도 점유 | 웹 | 에이전트 |
| --- | --- | --- | --- | --- |
| 연결됨 | true | 예 | 기존 권한에 따른 읽기·쓰기 | 기존 플랜·권한에 따른 접근 |
| 연결됨 | false | 예 | 읽기·사용 선택·토큰 폐기·연결 해제 | 기존 project_get 예외만 유지 |
| 연결 해제됨 | false | 아니오 | 소유자 읽기·명시적 재연결·토큰 폐기 | project_get을 포함한 프로젝트 데이터 읽기·쓰기 거부 |
| 연결 해제됨 | true | 허용 불가 | 무결성 오류 | 거부 |

다운그레이드로 연결 개수가 플랜 한도보다 많은 기존 상태는 계속 보존한다.
예를 들어 Pro의 5개 연결을 Free로 내리면 기존처럼 사용 가능한 1개를 고르고, 연결 개수는 5개다.
이후 4개를 해제해도 1/1이므로 새 연결 자리는 없으며, 마지막 하나까지 해제하면 0/1이 된다.
등록 상한의 수치는 바꾸지 않고, 세는 대상을 전체 보존 프로젝트에서 연결된 프로젝트로 바꾼다.

## 요구사항

### US-RDC-01: 다른 저장소로 연결 자리 옮기기

소유자로서 작업 기록을 잃지 않고 repo 연결을 해제하여, 플랜을 바꾸지 않고 다른 repo를 연결하고 싶다.

### REQ-RDC-001: 소유자의 연결 해제

WHEN 로그인한 소유자가 연결된 프로젝트의 해제를 확인하면, 시스템은 그 프로젝트를 연결 해제 상태로 변경해야 한다.
Available과 Not selected 모두 대상이며, 타인의 프로젝트·없는 프로젝트는 동일한 not-found 응답으로 거부해야 한다.

### REQ-RDC-002: 한도 반환과 0개 상태

WHEN 해제가 커밋되면, 시스템은 그 프로젝트를 등록 개수에서 즉시 제외해야 한다.
WHILE 연결된 프로젝트 또는 사용 가능한 프로젝트가 0개이면, 시스템은 목록 조회·신규 등록·재연결·플랜 변경을 무결성 오류 없이 처리해야 한다.
다른 프로젝트를 임의로 선택해 빈자리를 채우지 않는다.

### REQ-RDC-003: 데이터와 웹 읽기 보존

WHILE 프로젝트가 해제되어 있으면, 시스템은 소유자에게 기존 URL에서 보드·백로그·설정·실행 이력을 읽기 전용으로 제공해야 한다.
일반 편집·게이트 승인·토큰 발급은 서버에서 거부해야 하며, 페이지 GET이 파이프라인 상태를 생성하거나 전진시켜서는 안 된다.
기존 플랜의 이력 조회 기간은 유지한다. 보존과 무제한 열람은 같은 뜻이 아니다.
현재 일곱 상세 경로(보드·백로그·Inbox·Pipeline·Tokens·항목 상세·History)를 모두 포함한다.
History의 기본 Items 요약·항목 펼침, Events의 Key events/All, 목록 Older/Newest와 펼친 이력 Older events/Newest events를 모두 유지한다.
목록과 펼친 이력의 독립 cursor, 제목·최신 회차 상태·UTC Last activity, 기존 공용 이력 본문·보고서/현재 항목 링크도 보존한다.
해제 여부로 이력 행을 숨기거나 조회를 쓰기 권한으로 막지 않는다. 타인/무세션에는 이 읽기 예외를 적용하지 않는다.

### REQ-RDC-004: 자격증명 처리

WHEN 해제가 커밋되면, 시스템은 해당 프로젝트의 폐기되지 않은 ProjectToken과 OwnerToken을 폐기해야 한다.
UserToken과 다른 프로젝트의 토큰은 변경해서는 안 된다.
WHEN 같은 프로젝트를 재연결하면, 폐기한 토큰은 계속 거부하고 유효한 hu_는 새 발급·재설정 없이 허용해야 한다.
hs_/ho_를 다시 사용할 사람은 기존 플랜 규칙에 따라 새로 발급받아 설정한다.

### REQ-RDC-005: 해제 상태의 연동 차단

WHILE 프로젝트가 해제되어 있으면, 시스템은 모든 프로젝트 범위 MCP 도구, owner MCP, project identity,
templates, runbook 읽기·기록 및 sync 요청에 대해 프로젝트 데이터 반환·변경을 거부해야 한다.
project_get도 예외가 아니다. 유효한 인증과 소유 확인 뒤에만 해제 사유와 웹 재연결 안내를 반환한다.
해제로 폐기된 hs_/ho_는 그 이전 인증 단계에서 일반 401로 거부하며, 그 응답에 repo·slug·해제 여부를 싣지 않는다.

### REQ-RDC-006: 명시적 재연결과 복원

WHEN 소유자가 웹의 재연결을 확인하고 현재 연결 개수가 한도보다 작으면, 시스템은 같은 Project.id와 slug로 재연결하고 available=true로 만들어야 한다.
기존 보드·백로그·워크스페이스·설정·이력·진행 위치를 보존하며 새 프로젝트나 초기 토큰을 만들지 않는다.
IF 한도가 차 있거나 초과되어 있으면, THEN 상태와 토큰을 바꾸지 않고 다른 연결을 먼저 해제하도록 안내해야 한다.
재연결은 접근 권한을 복원한다. 로컬 에이전트를 실행하는 기능이나 별도의 작업 재개 승인 단계를 추가하지 않는다.

### REQ-RDC-007: 자동 재연결과 중복 우회 방지

WHEN 신규 등록 API·웹 생성 폼·초기화가 같은 사용자의 해제된 repo를 발견하면,
시스템은 신규 생성·성공 위장·재연결 없이 기존 프로젝트의 웹 재연결 위치를 안내해야 한다.
같은 GitHub repo 이름의 대소문자 차이도 이 경로를 우회해서는 안 된다.
이미 연결된 동일 repo의 등록 재시도는 기존 프로젝트를 반환하되 새 토큰이나 중복 행을 만들지 않는다.

### REQ-RDC-008: 진행 중 작업의 해제 경계

WHEN 미완료 보드 항목이나 열린 실행이 있는 프로젝트를 해제하면, 시스템은 그 사실을 확인창에 표시하고 해제를 허용해야 한다.
해제 커밋 뒤 현재 상태를 검사하는 신규 접근은 거부해야 하며, 커밋 전에 서버가 접근을 허용한 요청은 완료될 수 있다.
후속 트랜잭션에서 접근을 재검사하여 거부하는 기존 경로를 완화하지 않으며, 사전 허용이 완료를 보장한다는 뜻은 아니다.
해제 자체는 실행을 done·failed·cancelled·on_hold로 바꾸거나 로컬 프로세스를 종료해서는 안 된다.

### REQ-RDC-009: 중복·경쟁·실패 처리

WHEN 해제·재연결 요청의 목록 version이 현재와 다르면, 시스템은 어떤 상태도 변경하지 않고 새로고침을 요구해야 한다.
WHEN 현재 version으로 이미 목표 상태인 동작을 요청하면, 시스템은 토큰·이력·version을 다시 바꾸지 않는 성공을 반환해야 한다.
IF 트랜잭션 커밋 전에 오류가 발생하면, THEN 연결 상태·토큰 폐기·목록 version·감사 이벤트는 함께 롤백되어야 한다.
커밋 뒤 응답 전달·캐시 무효화가 실패한 경우에는 롤백을 단언하지 않고, 최신 서버 상태를 다시 읽어 결과를 확인한다.
동시에 마지막 자리를 차지하려는 신규 등록·재연결은 하나만 성공해야 한다.

### REQ-RDC-010: 발견 가능한 UI와 결과 피드백

WHEN 소유자가 Projects를 열면, 시스템은 연결된 목록과 해제된 목록, 연결 개수와 사용 가능 개수를 구분해 보여 주어야 한다.
연결된 행에는 Disconnect repository, 해제된 행에는 Reconnect repository와 읽기 링크를 제공해야 한다.
확인 취소는 상태를 바꾸지 않으며, 처리 중 중복 제출을 막고 실패·stale·성공을 구분해 알려야 한다.
모든 연결을 해제한 화면에서도 새 연결과 보존된 기록에 접근할 수 있어야 한다.

### REQ-RDC-011: 기존 선택·플랜 계약과 공존

WHILE 프로젝트가 해제되어 있으면, 시스템은 Use this project나 플랜 상향으로 이를 다시 연결해서는 안 된다.
연결된 Not selected 프로젝트에 대한 기존 사용 선택·교체는 유지한다.
WHEN 사용 가능한 마지막 프로젝트를 해제하고 연결된 Not selected 프로젝트가 남으면,
시스템은 사용 가능 0개를 유지하고 사용자가 선택하도록 해야 한다.
플랜 하향의 선택 후보에서 해제된 프로젝트를 제외해야 한다.

### REQ-RDC-012: 로컬 설정과 초기화 안내

WHEN 서버에서 연결을 해제하면, 시스템은 사용자 repo의 harness.json, 생성 파일, 환경 변수, 공용 MCP 등록을 삭제하거나 변경해서는 안 된다.
WHEN 서버 기반 초기화의 등록/identity/templates 단계가 해제된 repo의 접근 거부를 받으면, 플러그인은 자동 재연결·파일 생성·후속 sync 없이 종료해야 한다.
이미 허용된 templates로 파일을 생성한 뒤의 runbook 기록 거부는 파일을 되돌리지 않고 경고하며, init skill은 후속 등록/sync를 멈추고 연결 완료로 보고하지 않는다.
유효 hu_의 해제 사유와 폐기 hs_의 일반 인증 오류를 구분하며, 토큰으로 소유 확인에 실패한 서버는 프로젝트 상태를 노출하지 않는다.
명시적으로 재연결한 뒤에는 기존 초기화의 설정 검증·갱신을 사용할 수 있고 hu_ 재발급을 요구하지 않는다.

### REQ-RDC-013: 기존 데이터의 호환 이행

WHEN 새 스키마로 이행하면, 시스템은 모든 기존 프로젝트를 연결된 상태로 해석하고 available·소유권·토큰·실행 데이터·기존 이벤트를 그대로 유지해야 한다.
해제 기능을 켜기 전 모든 접근 경로가 새 상태를 이해해야 한다.
새 상태를 모르는 구버전으로 돌아가 해제된 프로젝트를 다시 노출해서는 안 된다.

### REQ-RDC-014: 다른 사용량 한도 보존

WHEN 프로젝트를 해제하거나 재연결하면, 시스템은 프로젝트 연결 개수 이외의 플랜 한도·사용량을 초기화하거나 할인해서는 안 된다.
해제된 프로젝트에서 이미 소비한 사용자 단위 dispatch 사용량도 원래 집계 기간 동안 계속 포함해야 한다.

## 불변식과 구현 제약

### INV-RDC-001: 연결과 사용 가능 상태

available=true이면 반드시 연결된 프로젝트다. 연결 해제는 소유권 포기나 프로젝트 삭제가 아니다.
연결 수와 available 수 모두 0 이상이다. available 수는 플랜 한도 이하이며 연결 수 이하이다.
연결 수가 이미 한도 이상이면 신규 등록·재연결로 그 수를 늘릴 수 없다.
다운그레이드로 보존된 초과 연결은 오류로 취급하지 않는다.

### INV-RDC-002: 동일 프로젝트의 정체 보존

재연결은 기존 id·slug·ownerUserId·repoOwner·repo·branch를 보존한다.
사용자별 repo 정체 비교는 GitHub 이름의 대소문자를 구분하지 않는다. 표시용 원문은 유지한다.
동일 사용자에게 같은 repo의 보존 행이 여러 개면 임의로 고르거나 병합하지 않고 무결성 오류로 처리한다.
repo rename·transfer와 GitHub numeric repository ID 도입은 이번 범위 밖이다.

### INV-RDC-003: 연결 전이의 원자성

연결 상태, available, 프로젝트 토큰 폐기, 사용자 목록 version, 정확한 available 집합 이벤트는 하나의 트랜잭션에서 바뀐다.
Not selected 프로젝트 해제처럼 available 집합이 같아도 연결이 바뀌면 version 증가와 이벤트 기록이 필요하다.
hu_와 다른 프로젝트의 자격증명은 이 트랜잭션의 변경 대상이 아니다.

### INV-RDC-004: 기록과 사용량 보존

해제·재연결만으로 Project 및 그 하위 도메인 행을 삭제하거나 실행 커서를 초기화하지 않는다.
토큰 폐기는 되돌릴 수 없으며 재연결이 revokedAt을 비우지 않는다.
dispatch 사용량은 연결 상태와 무관하게 사용자 전체 이력을 기준으로 계산한다.

### INV-RDC-005: 권한의 범위

연결 변경은 소유자의 로그인된 웹 세션에서만 시작한다. hu_/hs_/ho_ 및 MCP 도구는 연결 변경 권한을 얻지 않는다.
웹 읽기 보존은 에이전트 데이터 읽기 허용을 뜻하지 않는다.
소유 확인을 먼저 수행해 타인의 프로젝트 존재·해제 상태를 노출하지 않는다.

### CON-RDC-001: 저장소 구조와 변경 범위

AGENTS.md와 docs/architecture/fsd.md를 따른다. src/app은 조합·라우팅, 제품 UI는 src/fsd, 서비스는 src/server에 둔다.
같은 FSD layer의 다른 slice 내부를 import하지 않는다. 새 전역 store·의존성·별도 라우트 시스템은 도입하지 않는다.
Next.js 코드를 작성하기 전 설치된 node_modules/next/dist/docs의 해당 가이드를 읽는다.

### CON-RDC-002: 공통 트랜잭션과 토큰 발급 경쟁

기존 Serializable 재시도와 projectAvailabilityVersion CAS를 재사용한다.
연결·등록·선택·플랜 변경 및 프로젝트 토큰 발급은 동일 소유자 User 행 잠금을 먼저 잡는 순서를 맞춘다.
hs_/ho_ 발급은 현재의 트랜잭션 밖 requireProjectWrite 판정만으로 저장하지 않고,
잠금 안에서 소유권·연결·available·필요한 플랜을 재검사한다.
쓰기 전용 lockProjectOwnerIn(tx, userId)를 project-availability-service.ts에 추가한다.
readOwnerAvailabilityIn/readProjectAccessIn에는 FOR UPDATE를 넣지 않는다. 두 함수는 SET TRANSACTION READ ONLY 조회에서도 사용된다.
기존 보드·실행 writer의 User → Project → PipelineRun/AgentRun 잠금 순서를 유지하고 역순 잠금을 추가하지 않는다.
발급이 먼저 커밋되면 해제가 해당 토큰을 폐기하고, 해제가 먼저 커밋되면 발급을 거부한다.

### CON-RDC-003: 변경하지 않을 외부 상태

GitHub repo·OAuth 로그인·사용자 PC·다른 repo·공용 사용자 토큰을 변경하지 않는다.
기존 요청 강제 취소, 모든 쓰기 경로의 커밋 직전 중단 장벽, 영구 삭제·보존 기간·별도 과금 모델은 추가하지 않는다.

### CON-RDC-004: 배포와 롤백 안전성

스키마 확장과 해제 상태를 이해하는 서버 배포를 먼저 완료하고, 구버전 요청을 배출한 뒤 해제 쓰기를 활성화한다.
첫 해제 후에는 disconnected 상태를 무시하는 코드로 롤백하지 않는다.
상세 활성화·롤백 절차와 운영 증거는 Phase RDC3의 출시 조건이다.

### CON-RDC-005: 검증과 작업 권한

구현은 별도 요청 이후 dev 기반 harness/<topic>에서 수행하고 PR base는 dev로 지정한다.
관련 unit·DB 통합·UI·마이그레이션 검증과 저장소의 check·build를 수행한다.
이 문서 작성 중에는 제품 코드·테스트·설정·의존성·기존 문서를 수정하거나 운영 API/DB를 호출하지 않는다.

## 기술 설계

### 저장 상태와 이벤트

- 제안 신규 열: Project.disconnectedAt DateTime?; null은 연결됨, non-null은 해제 시각.
- DB CHECK 이름: Project_disconnected_available_check, 식: ("disconnectedAt" IS NULL OR "available" = false). 신규 열은 nullable이고 기본값/백필이 없어 기존 행은 null이다. 과거 migration은 수정하지 않는다.
- ownerUserId/disconnectedAt 조회 index를 추가한다. 기존 owner/available index와 기존 slug unique는 유지한다.
- ProjectAvailabilityEvent.targetProjectId String?를 추가한다. 과거 이벤트는 null로 보존하고 기존 reason의 호출자는 targetProjectId를 생략할 수 있다. 감사용 대상 식별자이며 새 FK/cascade나 새 model은 추가하지 않는다.
- reason에 disconnect-project와 reconnect-project를 추가한다. 대상 id, actor=user, 현재 plan, 변경 후 availableProjectIds를 기록한다.
- addedProjectIds/removedProjectIds는 기존대로 **available 집합의 차이**다. 연결 자체의 변화는 reason/targetProjectId로 표현한다.
- disconnectedAt은 현재 상태이며 반복 이력은 이벤트에 남는다. 재연결은 이를 null로, available을 true로, lastSelectedAt을 현재 시각으로 설정한다.
- connectedCount와 availableCount는 같은 owner snapshot에서 파생한다. 별도 누적 카운터를 저장하지 않는다.

readOwnerAvailabilityIn은 모든 보존 프로젝트를 읽되 상태 무결성을 검사하고 0개 선택을 허용한다.
등록 한도와 UI 연결 카운트에는 disconnectedAt=null만 사용한다.
플랜·이력·dispatch 집계 전체에 연결 필터를 일괄 적용하지 않는다.
특히 src/server/agents/run-query.ts, agents/runs.ts, pipeline/run-query.ts의 사용자 단위 사용량에는 해제 이력이 계속 포함된다.

### 서비스와 입력

새 서버 모듈(제안) `src/server/project-connection-service.ts`에
`disconnectProject`, `reconnectProject`를 두고 Prisma client를 주입해 기존 서비스 테스트 패턴을 따른다.
실제 DB 연결은 `src/server/project-connection.ts`(제안)가 소유한다.
FSD feature의 서버 adapter에서 requireUser와 입력 schema를 적용하며 userId를 클라이언트에서 받지 않는다.
`api/manage-project-connection.server.ts`는 기존 선택 adapter처럼 `import "server-only"`를 사용하고,
`disconnectRepository`·`reconnectRepository` 함수에만 inline `"use server"`를 둔다.
신뢰된 서버 호출자의 userId를 받는 `loadProjectConnection`은 일반 서버 함수다. 파일 전체에 `"use server"`를 붙여 조회 함수를 원격 action으로 노출하지 않는다.
입력 schema는 비어 있지 않은 targetProjectId와 0 이상 Number.MAX_SAFE_INTEGER 이하 정수 expectedVersion만 허용하고,
명시적으로 선택한 입력 필드와 세션의 userId만 service에 전달한다.
토큰 저장은 신규 project-token-service.ts의 issueProjectToken/issueProjectOwnerToken(주입 client, userId/projectId/label 입력)으로 옮긴다.
project-token.ts는 singleton facade다. 기존 issueToken/issueOwnerToken은 검증된 세션 ID로 위임하고, 새 서비스가 User 잠금 후 대상 소유권·접근·ho_ 플랜을 다시 검사한다.
평문은 성공한 발급 결과에만 반환한다. 해제·재연결 서비스는 평문을 만들거나 반환하지 않는다.

- 입력: targetProjectId, expectedVersion. reconnect/disconnect는 별도 action으로 호출한다.
- 결과: success(changed, version), stale, error(invalid-input/not-found/capped/integrity/conflict/disabled). 활성화된 동작의 stale/no-op 순서는 아래와 같다.
- 공통 순서: 입력 검사 → Serializable transaction → User 행 잠금 → owner snapshot/소유 확인 → version 검사 → 대상 repo 정체의 중복 검사 → 목표 상태 확인 → 변경 → event/CAS → commit.
- 해제: disconnectedAt 설정, available=false, 해당 projectId의 revokedAt=null인 두 프로젝트 토큰 종류 폐기.
- 재연결: 이미 연결되어 있으면 no-op. 해제 상태이면 connectedCount < limit 검사 후 기존 행 복원. 토큰 생성·복구 없음.
- stale 검사는 no-op보다 앞선다. 오래된 Disconnect 요청이 재연결 이후 도착해 다시 끊어서는 안 된다.
- 응답 유실 후 자동 반대 동작이나 자동 재제출을 하지 않는다. UI 새로고침으로 실제 상태를 확인한다.
- 목록 버전은 연결·사용 선택을 함께 나타내도록 의미를 넓히되 기존 필드 이름과 호출 계약을 재사용한다.

### 오류 변환과 커밋 경계

현재 registerProject는 AvailabilityConflict만 409로 바꾸고, createProject는 slug P2002만 처리한다.
새 findOwnedRepository가 던지는 ProjectIntegrityError를 추가하기만 하면 의도한 오류 응답 대신 예외가 새어 나간다.
아래 위치에서 명시적으로 변환하며 메시지 문자열로 예외 종류를 추측하거나 모든 예외를 integrity로 바꾸지 않는다.

| 발생 위치 | 변환 위치와 최종 결과 | 보존할 경계 |
| --- | --- | --- |
| 등록의 owner snapshot/repo 중복 사전 검사 | registerProjectResultIn의 **첫 쓰기 전 검사 블록만** ProjectIntegrityError를 잡아 `{ status: "integrity", reason }` 반환 | created/existing/capped/disconnected와 판별 가능한 결과. slug 조회·project/token 생성·event/CAS 없음 |
| 등록 결과 또는 후속 identity 읽기의 무결성 오류 | project-registration.ts가 integrity 결과 및 ProjectIntegrityError를 409 `{ error: reason }`로 전달; create-project-result.ts는 integrity를 error 상태로 변환 | reconnectPath/project/token 키 없음. registerProjectIn도 integrity를 오류 문자열로 반환 |
| 연결 변경의 무결성 오류·재시도 소진 | project-connection-service.ts가 **await withAvailabilityTransaction 바깥**에서 ProjectIntegrityError/AvailabilityConflict를 각각 integrity/conflict로 변환 | selectProjectForUse의 기존 패턴처럼 rollback/retry가 끝난 다음 결과 반환 |
| 등록의 재시도 소진 | project-registration.ts의 기존 409 처리를 유지하고 create-project.server.ts도 AvailabilityConflict를 error 상태로 변환 | 토큰 평문·created 결과 없음. 자동 재등록 없음 |

withAvailabilityTransaction의 최대 3회 시도와 100/200ms 간격을 유지한다.
P2034/AvailabilityConflict 외에 User 행의 raw `FOR UPDATE`에서 Prisma 7 PostgreSQL adapter가 반환하는
P2010의 SQLSTATE `40001`(serialization failure)·`40P01`(deadlock)도 같은 transaction 전체 재시도 대상이다.
현재 `meta.driverAdapterError.cause.originalCode`와 기존 `meta.code`를 읽으며 다른 P2010은 그대로 전파한다.
실제 두 요청의 User 잠금 대기를 확인하는 격리 DB 시험과 metadata별 unit 시험으로 이 호환 경계를 검증한다.
트랜잭션에서 쓰기를 시작한 뒤에는 오류를 catch하여 정상 결과로 반환하지 않는다. event/CAS·DB 오류는 밖으로 던져 rollback되게 한다.
재시도 대상이 아닌 예외는 그대로 전파한다. 연결·등록 adapter에서 SQL·연결 정보 등 원시 오류를 사용자 응답에 넣지 않는다.
revalidatePath는 커밋된 success/no-op 뒤에만 실행한다. 커밋 후 예외나 네트워크 응답 유실은 DB 실패와 구분하여
확인 패널을 닫고 refresh하는 기존 결과 미확인 경로로 처리한다. 역방향 보상 쓰기·자동 재제출·롤백 완료 안내는 하지 않는다.

### 등록 경로

registerProjectResultIn이 연결·해제 양쪽을 포함해 같은 사용자/repo를 먼저 확인한다.
판정은 owner snapshot 내 repoOwner/repo의 대소문자 비구분 비교로 통일한다.
기존 중복 행이 발견되면 integrity 실패로 닫고 자동 병합하지 않는다.
`project-availability-service.ts`의 신규 순수 helper `findOwnedRepository`가 snapshot과 owner/repo를 받아
각 이름의 `toLowerCase()` 결과를 비교한다. 일치 0개는 없음, 1개는 해당 행, 2개 이상은 ProjectIntegrityError다.
등록은 cap/slug 처리 전에, 연결 service는 소유 확인·version 검사 뒤 목표 상태/no-op 전에 같은 helper를 호출한다.
따라서 id로 해제·재연결하거나 현재-version no-op을 요청해도 모호한 repo를 임의로 선택하지 않는다.
새 등록도 같은 잠금·Serializable 경로를 써서 동시 등록의 중복을 막는다.

| 등록 결과 | POST /api/projects | 웹 생성 폼 |
| --- | --- | --- |
| 새로운 repo, 여유 있음 | 기존 201 + project DTO | created와 실제 저장한 초기 토큰만 표시 |
| 같은 repo, 연결됨 | 기존 200 + 기존 project DTO | 기존 프로젝트 링크 표시, 신규 토큰 노출 금지 |
| 같은 repo, 해제됨 | 409 + error/reconnect 안내, 자동 변경 없음 | 해제 상태와 기존 프로젝트 재연결 링크 표시 |
| 신규 repo, 한도 가득 참 | 기존 403 cap 사유 | 한도 오류와 연결 해제 안내 |
| 동일 repo 보존 행 중복 | 409 무결성 오류 | 변경 없이 오류 |

web create action은 현재의 선행 slug 중복 검사 때문에 해제된 자신의 repo 안내가 가려지지 않도록
repo 정체 판정과 slug 충돌 처리 순서를 조정한다. 실제 신규 생성일 때만 slug를 예약한다.
REST의 성공 DTO와 기존 오류의 `{ error: string }`는 유지한다. 인증된 자신의 해제 repo에만
409 body `{ error: DISCONNECTED_REASON, reconnectPath: projectPath(existingSlug) }`를 반환한다.
서버 registration 결과의 이 실패 분기는 기존 slug를 운반하고, `src/app/api/projects/route.ts`가
`@/fsd/shared/routes/project`의 projectPath로 링크를 조합한다. src/server에서 FSD를 import하지 않는다.
다른 오류에는 reconnectPath 키를 넣지 않으며 어느 오류에도 project·token·workspaces를 넣지 않는다.
CLI는 error와 재연결 위치를 안내하고, HTTP 409만으로 해제로 판단하지 않는다. 새 자동 reconnect 옵션·MCP 도구는 만들지 않는다.
POST의 후속 identity 읽기에서도 해제 상태가 되었다면 성공 DTO 대신 409를 반환한다.
등록 자체의 201/200은 연결 당시 사실이며 이후 경쟁 해제까지 계속 연결되어 있음을 보증하지 않는다.
웹 상태는 created / existing / disconnected / error를 구분하고 신규 create-project-result.ts의 순수 결과 mapper를 action에서 사용한다.
created의 slug는 실제 서비스 결과를 쓰며, 이 분기만 저장에 사용한 토큰 평문을 받을 수 있다. existing/disconnected에는 token 키 자체가 없어야 한다.
registerProjectIn은 D3 rehearsal 전용 string|null 호환 adapter다. created/existing만 null, capped/disconnected/integrity는 오류 문자열로 매핑하여 새 실패를 성공으로 삼키지 않는다.
서로 다른 소유자의 전역 slug 충돌은 기존 P2002 경로로 처리하며 타인의 행을 반환하지 않는다. retry budget은 기존대로 유지한다.

### 접근 경계

ProjectAccess에 available=false/code=disconnected 분기를 추가한다.
소유권/필수 필드 및 disconnected+available의 무결성을 먼저 확인한 뒤 disconnected를 not-selected보다 먼저 판정한다.
기존 NOT_SELECTED_REASON은 그대로 두고 별도의 DISCONNECTED_REASON을 사용한다.
예상 문구: “This repository is disconnected. Open Stagekeeper → Projects and choose Reconnect repository.”

| 경로 | 담당 위치 | 변경/검증 |
| --- | --- | --- |
| 웹 읽기 | auth/guard.ts의 requireProjectOwner, 프로젝트 pages | 소유자는 계속 읽음. GET은 zero-write |
| 웹 일반 쓰기 | requireProjectWrite와 feature server actions | disconnected 거부. 직접 action 호출도 동일 |
| 사용 선택 | selectProjectForUse | 해제 대상을 target/replacement로 제출하면 거부 |
| 토큰 발급 | features/manage-token/api/manage-token.server.ts | 공통 잠금 내부 재검사. 해제 후 발급 불가 |
| agent MCP | mcp/tools.ts, mcp/deps.ts, project-access-query.ts | 공통 차단 + project_get 예외 분기 수정 |
| owner MCP | mcp/owner-tools.ts, mcp/owner-deps.ts | 폐기 토큰 인증 거부 + 현재 상태 검사 |
| REST 조회/기록 | project-identity-query.ts, templates-query.ts, runbook-query.ts, rest-scope.ts | 인증→소유→현재 연결 판정 순서 유지 |
| 실행/sync | agents/run-query.ts, mcp/project-sync-query.ts 및 기존 접근 호출부 | 연결 중 새 요청만 허용; 사전 허용 요청의 완료 경계 유지 |

요청 허용의 기준은 서버가 해당 요청의 접근 검사를 수행한 시점이다.
과거 agent_next가 작업을 전달했다는 사실은, 해제 후 별도 HTTP 요청으로 보내는 outcome·report의 승인이 아니다.
이미 연결된 MCP 클라이언트에서도 후속 요청마다 인증·프로젝트 접근을 재검사해야 한다.
재연결 이후 유효한 hu_를 가진 기존 세션도 다시 접근할 수 있다. 기기별 재승인이나 로컬 세션 강제 폐기는 이번 범위가 아니다.
보존된 cursor/receipt는 현재의 stale 검증을 계속 따른다. 이 기능 자체는 실행을 호출하거나 완료 판정을 바꾸지 않는다.
실제 설치된 mcp-handler 2.1.1의 dist/index.mjs는 withMcpAuth에서 HTTP 요청마다 verifyToken을 호출하고,
SDK handler에 요청 authInfo를 넘긴다(legacy: stateless). 도구 인가를 인증 시점의 캐시로 옮기지 않는다.
REST의 소유 확인 projectForUser는 해제 행을 조회할 수 있어야 한다. 여기서 연결 필터를 걸면 올바른 disconnected 사유가 not-owner로 바뀐다.

MCP 검증 대상은 agent 14개 전부다:
project_get, project_sync, backlog_add, backlog_list, backlog_get, board_list, board_get, board_propose,
board_transition, plan_submit, report_submit, validation_record, pipeline_next, agent_next.
owner endpoint는 gate_approve 하나다. 연결 변경 도구를 두 registry에 추가하지 않는다.
웹 직접 쓰기 검증은 addBacklogItem/updateBacklogItem/removeBacklogItem, humanTransition/approveGate/discardItem,
proposeItem, savePipeline, issueToken/issueOwnerToken을 모두 포함한다. revokeToken/revokeOwnerToken은 소유자에게 계속 허용한다.

### 초기화와 실제 전달물

- harness.json이 없는 hu_ 경로의 --register만 고치지 않는다. 이미 설정이 있는 일반 실행과 --dry-run은 templates 경로를 사용한다.
- **이미 충족됨:** 현재 생성기는 hu_의 config.project.slug를 GET /api/templates의 project query와 POST /api/runbook의 project body에 전달한다.
  slug 누락·공백은 네트워크/파일 쓰기 전에 거부하며, `src/server/harness-init.test.ts`가 실제 makeTemplatesFor/makeRecordRunbook으로 검증한다.
- 일반 hosted 실행의 이 전달 계약을 유지한다.
  lang/project는 URLSearchParams 등으로 인코딩한다. hs_는 기존처럼 토큰의 project가 우선하며 추가 인자를 무시한다.
- hu_인데 slug가 없는 과거 설정은 로컬 파일을 쓰기 전에 멈춘다. 기존 init skill의 보완 경로를 유지한다:
  origin과 설정의 owner/repo를 먼저 대조하고 --register의 반환 identity도 확인한 뒤, 사용자 확인을 거쳐 slug만 추가한다.
  불일치는 먼저 해소하며 다른 설정 필드를 덮어쓰거나, 이미 slug가 있는 설정을 다시 등록하지 않는다.
  disconnected 409이면 보완/생성/등록/sync를 이어가지 않고 웹 재연결을 기다린다. 호스트 없음·404 구버전 fallback을 401/403/409에 적용하지 않는다.
- 유효 hu_에 대한 해제 사유의 templates 403 또는 등록 409만 웹 재연결을 안내한다. HTTP 상태만으로 해제를 추정하지 않고 서버 error 사유를 보존한다.
  not-selected 403은 Use this project, cap 403은 한도 안내, integrity/conflict 409는 해당 실패로 남기며 재연결로 오안내하지 않는다.
  폐기 hs_의 --print-project 및 일반 초기화는 401로 종료한다.
  클라이언트에는 “연결을 해제했다면 웹에서 재연결하고 프로젝트 토큰을 새로 발급”이라는 조건부 안내만 덧붙인다. 서버가 401로 해제 여부를 증명하지 않는다.
- hosted templates 거부는 파일 생성 전에 끝나야 한다. templates 허용 후 해제가 발생하면 이미 허용된 생성은 끝날 수 있고, 뒤의 runbook 기록/sync는 거부될 수 있다.
  현재 생성기의 best-effort runbook 기록은 유지한다. 접근 거부 note를 받은 init skill은 이미 쓴 파일을 되돌리지 않고 후속 MCP 등록/sync 전에 멈춘다.
  파일 생성의 done 줄/exit 0만으로 초기화 전체를 연결 성공으로 표시하지 않는다. 일시적 기록 실패는 기존 경고로 구분한다.
- HARNESS_TEMPLATES_DIR는 명시적 로컬 개발/시험 우회다. 서버 권한을 확인하지 않는 기존 offline 생성은 유지하며 이것을 재연결로 취급하지 않는다.
- URL 출처 --server > HARNESS_SERVER > 기존 .mcp.json, 언어 기본 en, dry-run 무쓰기, skip(modified), 머신 공용 MCP 등록은 보존한다.
  plugin/skills/init/references/reconciliation-contract.md의 사전 검증 요구도 유지한다. private template 본문과 plugin/lib 복사본을 이 기능 때문에 바꾸지 않는다.
- 배포 산출물은 plugin/bin/harness-init.mjs와 init skill이다. plugin/.claude-plugin/plugin.json의 현재 0.3.5보다 높은 다음 patch version을 사용하고(동시 릴리스가 없으면 0.3.6),
  .claude-plugin/marketplace.json의 source ./plugin을 유지한다. 전달은 dev의 green commit을 main으로 fast-forward하는 기존 릴리스 절차를 따른다.

### 화면과 FSD 조합

- 신규 feature의 정확한 파일과 public API는 아래 I-NEW 및 import/export 표를 따른다.
- 기존 project-list page가 사용 선택 feature와 연결 관리 feature를 나란히 조합한다. feature끼리 import하지 않는다.
- 연결된 행: Available 또는 Not selected 배지, 필요한 Use this project, Disconnect repository.
- 해제된 행: Disconnected 배지, 읽기 링크, Reconnect repository. Use this project는 표시하지 않는다.
- Projects에서 Connected와 Disconnected 그룹을 제공한다. 연결 수는 “1 / 1 connected”, 사용 가능 수는 별도로 표시한다.
- 해제된 프로젝트 상세에는 읽기 전용 배너와 재연결 컨트롤을 둔다. 기존 LockedProjectBanner를 무조건 재사용해 사용 선택을 노출하지 않는다.
- Inbox의 현재 InboxCard는 canWrite=false를 모두 Not selected로 표시한다. layout 배너만 바꾸어 이 오표시를 남기지 않는다.
  inbox/page.tsx가 확인한 ProjectAccess에서 canWrite와 readOnlyLabel을 구성하고 ProjectInboxPage → 공개 InboxCard API로 전달한다.
  읽기 전용 라벨은 disconnected이면 Disconnected, not-selected이면 기존 Not selected, integrity이면 Read only다.
  card는 canWrite=false일 때 받은 라벨만 표시하고 기존 변경 버튼·실행 안내 숨김은 유지한다. client가 서버 모듈을 import하거나 별도 권한을 판단하지 않는다.
- 헤더 전환 목록은 연결된 프로젝트만 보여 주고, 해제된 기록은 Projects에서 찾는다. 현재 해제 프로젝트 상세의 제목과 URL은 유지한다.
- 헤더의 프로젝트 전환 목록과 현재 프로젝트의 탭은 별개다. 해제 상세에서도 History 탭과 기존 탭을 유지한다.
  history/page.tsx는 requireProjectOwner → planForProject/historyCutoff → mode별 projectHistoryItems/projectHistory·hasProjectHistoryBefore·currentRoundIds 순서의 읽기 경계를 유지한다.
  소유자에게 허용된 이력 조회에 requireProjectWrite 또는 connected/available 필터를 추가하지 않는다. 조회의 projectId와 플랜 cutoff는 클라이언트 cursor로 대체하지 않는다.
  기본 `/history`는 Items이며 `mode=events` 또는 mode 없이 유효한 `view=key/all`을 가진 기존 링크는 Events로 해석한다. 잘못된/배열 mode는 현재 Items 처리 규칙을 유지한다.
  Items는 모든 회차의 event/report를 backlog 항목별로 묶어 기간 안 마지막 활동으로 정렬한 뒤 50개씩 읽는다. 제목·최신 회차 상태(또는 Discarded)·UTC Last activity를 표시한다.
  done/on_hold/폐기 회차·제거된 backlog의 기록은 포함하고, 기록된 보드 활동이 없는 backlog는 제외한다. event 수가 많은 항목도 한 행만 차지한다.
  펼침 대상은 현재 Items 페이지의 key에서만 고른다. 상세는 projectId와 그 key 및 동일 cutoff로 제한해 과거/폐기 회차까지 50행씩 읽고, 현재 비폐기 회차가 있을 때만 View current item 링크를 제공한다.
  `history-items.ts`의 바인딩된 SQL, 그룹화 후 cursor/limit, 동일 시각의 id `COLLATE "C"` 정렬을 유지한다. 연결 필터나 문자열로 결합한 client 입력을 SQL에 추가하지 않는다.
  Events는 기존 50행·Key events/All·Older/Newest와 현재 회차 레코드에만 붙는 항목 링크를 보존한다.
  Items 목록의 `before`(.i cursor), 펼친 이력의 `itemBefore`(.r/.e cursor), Events의 `before`를 구분한다.
  Items/Events 전환은 cursor 둘과 펼침을 초기화한다. 항목 펼침/닫기는 목록 cursor를 유지하고, Older events/Newest events는 목록 페이지와 항목을 유지한다.
  목록 Older/Newest는 mode/filter를 보존하고 펼침을 닫으며, Events filter/Show all은 event cursor를 초기화한다. 비어 있는 과거 목록·상세 페이지에서도 해당 Newest로 복귀할 수 있다.
  reports와 events는 기존 공용 HistoryList/toHistoryRows를 통해 표시한다. report 중복 이벤트 제외, 기록된 commit의 GitHub 링크·안내, 보고 목적 라벨과 cutoff 안내를 그대로 유지한다.
  상세 GET·view 전환·페이지 이동·refresh는 DB 상태를 변경하지 않는다. 열린 화면이나 브라우저 뒤로 가기에 실시간 갱신을 약속하지 않는다.
- 연결 해제 확인은 repo 이름, 미완료 항목·열린 실행 수, 데이터 보존, 토큰 폐기, 로컬 작업 비종료, 사전 허용 요청의 완료 가능성을 설명한다.
- 확인창 수치는 loadProjectAvailability와 같은 read-only snapshot에서 읽는다. openItems는 폐기되지 않은 각 backlog의 최신 BoardItem 중 isOpen(status)인 수,
  openRuns는 closedAt=null인 AgentRun 수다. 문구는 “open board items / open agent runs”로 구분한다.
  PipelineRun을 더해 이중 집계하거나 실제로 살아 있는 로컬 프로세스 수라고 표현하지 않는다. 확인 이후 늘어난 작업의 강제 중단을 보장하지 않는다.
- 재연결 확인은 현재 연결 개수, 기록 복원, hu_ 재사용, hs_/ho_ 재발급 필요성을 안내한다.
- 버튼 pending/disabled, 오류 role=alert, stale 시 확인 패널 초기화·목록 갱신을 구현한다.
- 성공 action은 revalidatePath(projectsPath())와 revalidatePath(PROJECT_LAYOUT_REVALIDATE_PATH, "layout")를 호출한다. 상수의 현재 값은 /(app)/p/[slug]다.
  공통 헤더는 해당 layout의 loadHeaderProjects가 다시 읽는다. root layout 무효화나 다른 탭으로의 실시간 push는 도입하지 않는다.
- 설치된 Next 가이드상 router.refresh()는 client useState를 보존한다. stale/응답 유실 시 확인 패널을 명시적으로 닫고 refresh하며,
  연결 컨트롤 key에는 targetProjectId/version/plan/writesEnabled를 포함하여 새 snapshot을 받으면 확인 내용을 초기화한다.
  성공한 no-op도 서버 무효화와 닫기를 수행한다. 다른 탭의 오래된 UI는 다음 서버 요청의 version 검사로 보호한다.
- loadProjectListPage는 하나의 OwnerAvailability snapshot에서 전체 목록·connectedCount·availableCount·version을 구성한다.
  Use this project용 model은 connected 행만 전달한다. 연결 관리용 model은 보존 행 전체와 쓰기 활성화 상태를 가진다.
  기존 selectionControlKey도 유지하여 다른 연결 변경으로 version이 바뀌면 선택 확인이 초기화된다.
- 취소는 클라이언트 확인 패널만 닫는다. 네트워크 제출 후에는 취소로 서버 변경을 되돌렸다고 표시하지 않는다.
- 플랜이 내려가 connectedCount > limit이면 실제 수를 숨기거나 cap으로 잘라 표시하지 않는다.

## 시나리오와 수명 주기

### EX-RDC-001A: A에서 B로 연결 자리 이동

- illustrates: REQ-RDC-001, REQ-RDC-002, REQ-RDC-003, REQ-RDC-004, REQ-RDC-006
- Given: Free, A connected/available, 유효한 hu_와 A의 hs_/ho_ 존재.
- When: A를 해제한 뒤 B를 등록.
- Then: A 데이터는 남고 A 토큰은 폐기, hu_는 유효. 연결 수 1/1의 대상은 B. A 재연결은 한도 초과로 거부.
- When: B도 해제한 뒤 A를 웹에서 재연결.
- Then: A의 기존 id/slug/기록이 복원되고 hu_로 접근 가능. 예전 hs_/ho_는 계속 거부.

### EX-RDC-002A: 남은 자리에 동시 연결

- illustrates: REQ-RDC-006, REQ-RDC-009, INV-RDC-001, INV-RDC-003
- Given: Free, 연결 0개, 해제된 A와 신규 B.
- When: A 재연결과 B 등록을 서로 다른 DB 연결에서 동시에 요청.
- Then: 하나만 자리를 점유. 패자는 stale 또는 capped이고, 연결·available·event·토큰 상태에 부분 변경이 없음.

### EX-RDC-003A: 허용된 요청과 후속 보고

- illustrates: REQ-RDC-005, REQ-RDC-008
- Given: A 작업을 로컬 Claude Code가 수행 중이고, 유효 hu_를 사용하는 별도 서버 요청 R1은 접근 검사를 이미 통과.
- When: A 해제를 커밋한 뒤 R1 완료, 이어 새 요청 R2로 report/outcome 제출.
- Then: R1은 완료 가능, R2는 해제 사유로 거부. 폐기 hs_/ho_의 후속 요청이라면 인증 401이다. 로컬 코드가 자동 복구·취소되었다고 표시하지 않음.

| 사건 | 결과 | 실패/재진입 |
| --- | --- | --- |
| 마지막 연결 해제 | 연결 0, available 0, 기록 유지 | 신규 연결·재연결 화면 정상 |
| 마지막 available 해제, Not selected 잔존 | available 0, 남은 연결 한도 점유 | 자동 선택 없음 |
| 확인창이 열린 동안 다른 탭 변경 | stale, zero-write | 최신 영향 다시 확인 |
| 해제 직후 같은 repo에서 --register | 409, 웹 재연결 안내 | 로컬 파일 변경·새 토큰 없음 |
| 해제와 hs_/ho_ 발급 경쟁 | 먼저 발급되면 폐기, 먼저 해제되면 발급 거부 | 유효한 프로젝트 토큰이 해제 이후 새로 남지 않음 |
| 이미 해제된 대상, 현재 version | no-op 성공 | 폐기 시각·event/version 추가 변경 없음 |
| 예전 Disconnect가 재연결 후 도착 | stale | 의도하지 않은 재해제 없음 |
| 세션 만료/타인 요청 | 기존 로그인/권한 실패 | 상태 변경 없음 |
| 사전 무결성 오류/재시도 소진 | integrity/conflict 실패, 성공·토큰 body 없음 | 사유를 보존하고 사용자의 새 요청을 기다림 |
| 쓰기 뒤 event/CAS 실패 | 트랜잭션 전체 롤백 | 재시도 대상만 제한된 횟수로 재시도 |
| 커밋 후 캐시/응답 실패 | 변경은 저장되었을 수 있음 | 자동 재제출 없이 refresh로 결과 확인 |
| 해제 후 History 직접 방문·Items/Events 전환·항목 펼침·목록/상세 페이지 이동 | 소유자에게 기존 플랜 범위의 요약·이력·링크 제공, 독립 cursor와 zero-write 유지 | malformed/배열 cursor는 해당 첫 페이지 처리. 유효한 외부 cursor도 project/key/cutoff 범위를 넓히지 않으며 빈 페이지일 수 있음. 타인/무세션은 기존 인가 실패 |
| 업그레이드/다운그레이드 | 기존 연결 수명 보존, available 규칙만 적용 | 해제된 프로젝트 자동 복구 없음 |

## 구체적 변경·검증 inventory

아래는 Core의 닫힌 파일 목록이다. “수정 또는 전파 검증”은 실제 동작이 이미 맞으면 변경하지 않고 지정된 시험으로 보존함을 뜻한다.
문서의 짧은 파일명은 이 목록의 단일 절대 위치가 아니라 **저장소 상대 경로**로 해석한다. 이 목록 밖 구현 파일이 필요하면 먼저 목적과 검증을 제안서에 반영한다.

### I-STATE: 수정: 상태·등록·토큰 서비스

- `prisma/schema.prisma`
- `src/server/project-availability-service.ts`
- `src/server/project-availability.ts`
- `src/server/project-access-query.ts`
- `src/server/entitlement.ts`
- `src/server/project-registration-query.ts`
- `src/server/project-registration.ts`
- `src/fsd/features/manage-token/api/manage-token.server.ts`
- `src/fsd/features/create-project/api/create-project.server.ts`
- `src/fsd/features/create-project/model/create-project-state.ts`
- `src/fsd/features/create-project/ui/new-project-form.tsx`

### I-ACCESS: 수정 또는 전파 검증: 모든 외부 접근의 판정·바인딩

- `src/server/auth/guard.ts`
- `src/server/rest-scope.ts`
- `src/server/user-scope-query.ts`
- `src/server/scope-copy.ts`
- `src/server/mcp/auth.ts`
- `src/server/mcp/tools.ts`
- `src/server/mcp/deps.ts`
- `src/server/mcp/owner-tools.ts`
- `src/server/mcp/owner-deps.ts`
- `src/server/mcp/project-query.ts`
- `src/server/mcp/project-sync-query.ts`
- `src/server/project-identity-query.ts`
- `src/server/project-identity.ts`
- `src/server/templates-query.ts`
- `src/server/templates.ts`
- `src/server/runbook-query.ts`
- `src/server/runbook.ts`
- `src/server/agents/runs.ts`
- `src/server/agents/run-query.ts`
- `src/server/pipeline/board-query.ts`
- `src/server/pipeline/history-page.ts`
- `src/server/pipeline/history-items.ts`
- `src/server/pipeline/run-query.ts`

### I-ROUTES: 라우트 조합·직접 호출 검증; 새 HTTP 경로 없음

- `src/app/api/projects/route.ts`
- `src/app/api/project/route.ts`
- `src/app/api/templates/route.ts`
- `src/app/api/runbook/route.ts`
- `src/app/api/mcp/route.ts`
- `src/app/api/mcp/owner/route.ts`
- `src/app/(app)/projects/page.tsx`
- `src/app/(app)/p/new/page.tsx`
- `src/app/(app)/p/[slug]/layout.tsx`
- `src/app/(app)/p/[slug]/page.tsx`
- `src/app/(app)/p/[slug]/backlog/page.tsx`
- `src/app/(app)/p/[slug]/inbox/page.tsx`
- `src/app/(app)/p/[slug]/pipeline/page.tsx`
- `src/app/(app)/p/[slug]/tokens/page.tsx`
- `src/app/(app)/p/[slug]/items/[key]/page.tsx`
- `src/app/(app)/p/[slug]/history/page.tsx`

### I-WEB: 수정 또는 읽기 전용 전파 검증: FSD

- `src/fsd/pages/project-list/api/project-list.server.ts`
- `src/fsd/pages/project-list/ui/project-list-page.tsx`
- `src/fsd/pages/project-list/index.ts`
- `src/fsd/pages/project-list/index.server.ts`
- `src/fsd/widgets/app-header/api/app-header.server.ts`
- `src/fsd/widgets/app-header/ui/app-header.tsx`
- `src/fsd/widgets/app-header/ui/project-tabs.tsx`
- `src/fsd/widgets/app-header/index.ts`
- `src/fsd/widgets/app-header/index.server.ts`
- `src/fsd/features/select-project-for-use/api/select-project-for-use.server.ts`
- `src/fsd/features/select-project-for-use/model/select-project-state.ts`
- `src/fsd/features/select-project-for-use/ui/use-project-control.tsx`
- `src/fsd/features/select-project-for-use/ui/locked-project-banner.tsx`
- `src/fsd/features/select-project-for-use/index.ts`
- `src/fsd/features/select-project-for-use/index.server.ts`
- `src/fsd/features/edit-backlog/api/edit-backlog.server.ts`
- `src/fsd/features/review-gate/api/review-gate.server.ts`
- `src/fsd/features/review-gate/ui/inbox-card.tsx`
- `src/fsd/features/review-gate/index.ts`
- `src/fsd/features/propose-item/api/propose-item.server.ts`
- `src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts`
- `src/fsd/pages/project-board/ui/project-board-page.tsx`
- `src/fsd/pages/project-backlog/ui/project-backlog-page.tsx`
- `src/fsd/pages/project-inbox/ui/project-inbox-page.tsx`
- `src/fsd/pages/project-pipeline/ui/project-pipeline-page.tsx`
- `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx`
- `src/fsd/pages/board-item/ui/board-item-page.tsx`
- `src/fsd/pages/board-item/index.ts`
- `src/fsd/pages/board-item/model/item-docs.ts`
- `src/fsd/pages/project-history/index.ts`
- `src/fsd/pages/project-history/ui/project-history-page.tsx`
- `src/fsd/pages/project-history/ui/history-items-list.tsx`
- `src/fsd/pages/project-history/model/history-view.ts`
- `src/fsd/pages/project-history/model/history-navigation.ts`
- `src/fsd/widgets/history-feed/index.ts`
- `src/fsd/widgets/history-feed/model/history-row.ts`
- `src/fsd/widgets/history-feed/ui/history-list.tsx`
- `src/fsd/entities/board-item/index.ts`
- `src/fsd/entities/board-item/model/doc-link.ts`
- `src/fsd/entities/board-item/model/status-label.ts`
- `src/fsd/entities/pipeline/index.ts`
- `src/fsd/entities/pipeline/model/labels.ts`
- `src/fsd/shared/lib/relative-time.ts`
- `src/fsd/shared/routes/project.ts`
- `src/fsd/shared/routes/projects.ts`

### I-VERIFY: 기존 검증 목적지·runner (변경 필요 여부는 계약별 결정)

- `src/server/project-availability-service.test.ts`
- `src/server/project-access-query.test.ts`
- `src/server/project-registration-query.test.ts`
- `src/server/mcp/tools.test.mjs`
- `src/server/mcp/owner-tools.test.mjs`
- `src/server/mcp/auth.test.mjs`
- `src/server/mcp/project-sync-query.test.ts`
- `src/server/project-identity-query.test.ts`
- `src/server/templates-query.test.ts`
- `src/server/runbook-query.test.ts`
- `src/server/rest-scope.test.ts`
- `src/server/harness-init.test.ts`
- `src/server/agents/run-query.test.ts`
- `src/server/pipeline/board-query.test.ts`
- `src/server/pipeline/history-page.test.ts`
- `src/server/pipeline/history-items.test.ts`
- `tests/server/project-history.test.ts`
- `tests/server/board-history.test.ts`
- `tests/server/integration/project-history.test.ts`
- `tests/server/integration/history-items.test.ts`
- `src/server/pipeline/run-query.test.ts`
- `src/fsd/pages/project-list/ui/project-list-page.test.mjs`
- `src/fsd/pages/project-board/ui/project-board-page.test.mjs`
- `src/fsd/pages/project-history/ui/project-history-page.test.ts`
- `src/fsd/pages/board-item/ui/board-item-page.test.ts`
- `src/fsd/pages/board-item/model/item-docs.test.ts`
- `src/fsd/widgets/history-feed/model/history-row.test.ts`
- `src/fsd/widgets/history-feed/ui/history-list.test.ts`
- `src/fsd/entities/board-item/model/doc-link.test.ts`
- `src/fsd/shared/routes/project.test.ts`
- `src/fsd/shared/lib/relative-time.test.ts`
- `src/fsd/features/select-project-for-use/model/select-project-state.test.ts`
- `src/fsd/features/create-project/ui/new-project-form.test.ts`
- `src/fsd/features/review-gate/ui/inbox-card.test.mjs`
- `plugin/bin/harness-init.test.mjs`
- `tests/server/integration/support.ts`
- `tests/server/integration/migration.test.ts`
- `tests/server/integration/templates.test.ts`
- `scripts/test-server-integration.mjs`
- `scripts/test-server-integration.test.mjs`
- `tests/server/register-server-only.mjs`
- `scripts/project-availability-cleanup.test.ts`
- `scripts/project-availability-runtime.test.ts`

### I-OPS: CLI·운영 검사·문서의 구현 목적지

구현 중 독립 리뷰에서 확인한 문구 소유권 보완: `packages/core/entitlement.mjs`의 OWNER_TOKEN_PLAN_GATE를 서버 발급 service와 기존 `manage-token/model/plan-gate.ts`의 re-export가 함께 사용한다. 플랜 규칙·기존 export/copy는 유지하며 `npm run sync:plugin-lib`로 배포 복사본을 동기화하고 token unit/copy-lock/check로 검증한다.

- `plugin/bin/harness-init.mjs`
- `plugin/skills/init/SKILL.md`
- `plugin/.claude-plugin/plugin.json`
- `.env.example`
- `scripts/lib/project-ownership-cleanup.ts`
- `packages/core/entitlement.mjs` 및 동기화된 `plugin/lib/entitlement.mjs`
- `scripts/check-project-ownership-cleanup.ts`
- `docs/architecture/README.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/invariants.md`
- `docs/architecture/protocol.md`
- `docs/architecture/verification.md`
- `CONTEXT.md`
- `docs/conventions/product-copy.md`

### I-KEEP: 보존/호환 근거: 무단 변경 금지

- `AGENTS.md`
- `docs/architecture/fsd.md`
- `package.json`
- `package-lock.json`
- `prisma.config.ts`
- `next.config.ts`
- `src/server/project.ts`
- `src/fsd/features/manage-user-token/api/manage-user-token.server.ts`
- `src/fsd/entities/project-token/ui/token-reveal.tsx`
- `src/fsd/entities/project-token/ui/token-reveal.test.ts`
- `src/fsd/pages/user-tokens/ui/user-tokens-page.tsx`
- `packages/core/entitlement.mjs`
- `packages/core/token.mjs`
- `packages/core/config.mjs`
- `packages/core/deliver.mjs`
- `plugin/lib/entitlement.mjs`
- `plugin/lib/config.mjs`
- `plugin/lib/deliver.mjs`
- `scripts/grant-plan.ts`
- `scripts/rehearse-project-availability-d3.ts`
- `scripts/rehearse-pipeline-agent-slots.ts`
- `scripts/lib/project-ownership-recovery.ts`
- `scripts/restore-project-ownership-shadow.ts`
- `scripts/recovery/individual-project-availability-d3/restore-d2-shadow.sql`
- `.claude-plugin/marketplace.json`
- `plugin/skills/init/references/reconciliation-contract.md`
- `src/server/pipeline/board.ts`
- `src/server/pipeline/run.ts`
- `src/fsd/widgets/turn-banner/api/turn-data.server.ts`
- `src/fsd/widgets/turn-banner/index.server.ts`
- `src/fsd/features/review-gate/api/inbox-data.server.ts`
- `src/fsd/features/manage-token/index.server.ts`
- `src/fsd/features/create-project/index.ts`
- `src/fsd/features/create-project/index.server.ts`
- `src/server/db.ts`
- `src/fsd/shared/lib/copy-lock.ts`
- `packages/core/pipeline.mjs`

V-MIGRATION의 이전 스키마 fixture 입력(원본 보존, 순서대로 전체 SQL 실행):

- `prisma/migrations/20260829143353_init/migration.sql`
- `prisma/migrations/20260830070954_english_status_identifiers/migration.sql`
- `prisma/migrations/20260831074438_add_template/migration.sql`
- `prisma/migrations/20260903040038_subscription/migration.sql`
- `prisma/migrations/20260903055754_agent_run/migration.sql`
- `prisma/migrations/20260907050756_board_item_accepted_at/migration.sql`
- `prisma/migrations/20260907054533_board_item_accepted_at_backfill/migration.sql`
- `prisma/migrations/20260908234021_owner_token_and_channel/migration.sql`
- `prisma/migrations/20260910044819_pipeline_version_and_run/migration.sql`
- `prisma/migrations/20260911011905_project_runbook_version/migration.sql`
- `prisma/migrations/20260913090000_add_individual_project_availability_foundation/migration.sql`
- `prisma/migrations/20260914090000_remove_individual_project_ownership_shadow/migration.sql`
- `prisma/migrations/20260915090000_agent_receipts_and_callers/migration.sql`
- `prisma/migrations/20260917000000_pipeline_agent_slots/migration.sql`
- `prisma/migrations/20260917010000_report_acceptance_purpose/migration.sql`
- `prisma/migrations/20260920000000_user_scoped_tokens/migration.sql`
- `prisma/migrations/20260926134848_backlog_authorship/migration.sql`

### I-NEW: 신규 목적지와 생성 전 점검

- `prisma/migrations/20260927000000_repository_disconnection/migration.sql`
- `src/server/project-connection-service.ts`
- `src/server/project-connection.ts`
- `src/server/project-connection-config.ts`
- `src/server/project-token-service.ts`
- `src/server/project-token.ts`
- `src/server/project-connection-service.test.ts`
- `tests/server/project-connection-config.test.ts`
- `src/server/project-token-service.test.ts`
- `src/fsd/features/manage-project-connection/model/project-connection-state.ts`
- `src/fsd/features/manage-project-connection/model/project-connection-state.test.ts`
- `src/fsd/features/manage-project-connection/ui/project-connection-control.tsx`
- `src/fsd/features/manage-project-connection/ui/project-connection-control.test.ts` — 실제 client component를 기존 TypeScript/VM과 hook 경계 double로 실행하여 Cancel·pending·사업 오류·success·stale·커밋 뒤 응답 예외의 확인 패널/refresh/재제출 금지를 검사한다. 새 DOM/브라우저 프레임워크는 추가하지 않는다. 검증 목적지: test:web/V-UI-PLUGIN. 실제 브라우저 조작을 대신하는 통과 증거로 표기하지 않는다.
- `src/fsd/features/manage-project-connection/ui/disconnected-project-banner.tsx`
- `src/fsd/features/manage-project-connection/api/manage-project-connection.server.ts`
- `src/fsd/features/manage-project-connection/index.ts`
- `src/fsd/features/manage-project-connection/index.server.ts`
- `src/fsd/features/create-project/model/create-project-result.ts`
- `src/fsd/features/create-project/model/create-project-result.test.ts`
- `tests/server/integration/project-connection.test.ts`
- `tests/server/project-connection-bindings.test.ts`
- `scripts/rehearse-repository-disconnection.ts` — 격리 DB·현재 build로 로컬 Next 앱을 실행하고 실제 세션/action POST·7개 상세 GET·flag true/false를 재현한다. `--transport-loss`는 루프백 proxy에서 실제 커밋 뒤 응답을 버리고 event 1회·stale 재제출·0개 연결·채운 History의 두 pagination을 검사한다. `--interactive`는 화면 확인용 fixture 로그인과 응답 유실 스위치를 제공한다. 새 테스트 프레임워크 없이 기존 JWT/HTTP/DB 의존성만 사용하며 fixture·앱 process·환경을 finally에서 정리한다. 검증 목적지: V-TRANSPORT/V-UI-PLUGIN의 런타임 권한·readonly·운영 flag 증거와 새 test report.
- `docs/test-reports/active/2026-09-27-repository-disconnection.md`
- `docs/architecture/repository-disconnection.md`

신규 경로는 대조 당시 모두 부재하며 기존 파일과 충돌하지 않았다. migration의 부모 prisma/migrations,
서비스 src/server, feature의 부모 src/fsd/features, tests/server/integration, docs/test-reports/active,
docs/architecture는 존재한다. 신규 feature의 model/ui/api 디렉터리와 migration 디렉터리는 구현 시 생성한다.
기존 파일 이동·삭제는 없다. 동시에 다른 migration이 추가되어 순서가 역전되거나 같은 이름이 생기면 신규 디렉터리 이름과 이 문서의 목적지를 함께 갱신한다.
시험용 process 환경/HTTP 서버/DB 연결/대기 barrier는 finally에서 원복·종료·해제한다. 전역 mutable registry는 만들지 않는다.
server-only config 시험은 tests/server에 두어 기존 register-server-only.mjs shim으로 실행한다.
src/server의 순수 주입 service 시험은 test:web로 실행하며 server-only singleton을 직접 import하지 않는다.

### 공용 export와 이전 책임의 새 목적지

| 책임 | 현재 소유 / 최종 import·export | 검증 |
| --- | --- | --- |
| 연결 동작 | 신규 project-connection-service.ts → singleton project-connection.ts → feature api/manage-project-connection.server.ts | service unit·실제 DB·action 직접 호출 |
| repo 정체 조회 | project-availability-service.ts의 신규 findOwnedRepository → project-registration-query.ts와 project-connection-service.ts에서 import | 대소문자·중복 0/1/2개와 연결 no-op 이전 integrity 거부 |
| REST 재연결 링크 | 기존 shared/routes/project.ts의 projectPath → api/projects/route.ts에서 import; registration 실패의 기존 slug만 사용 | owned disconnected 409의 reconnectPath 값·다른 실패에서 키 부재 |
| 쓰기 스위치 | 신규 project-connection-config.ts의 projectConnectionWritesEnabled → connection facade와 서버 loader만 import | config unit·disabled 직접 action |
| 토큰 발급 저장 | 현재 manage-token.server.ts의 직접 create → project-token-service.ts → project-token.ts → 기존 action | 기존 action에서 비트랜잭션 create 제거와 새 service 사용을 binding 검사; DB 양방향 경쟁 |
| 연결 UI | feature index.ts는 ProjectConnectionControl, connectionControlKey, ProjectConnectionModel/ProjectConnectionAction 타입만 공개 | FSD 검사·model test·브라우저 |
| 연결 서버 API | feature index.server.ts는 disconnectRepository, reconnectRepository, loadProjectConnection, DisconnectedProjectBanner 공개; 원격 action은 두 mutation만 | route composition·inline directive·빌드 action manifest의 loader 부재·세션 경계 검사 |
| 목록/상세 조합 | pages/project-list는 feature index.ts로 두 feature를 조합; src/app의 projects/page.tsx와 p/[slug]/layout.tsx는 index.server.ts에서 action/서버 banner를 가져와 props로 전달 | client가 index.server.ts를 직접 import하지 않음; 기존 선택 feature와 새 feature 사이 import 없음 |
| 생성 응답 | 기존 createProject → 신규 model/create-project-result.ts의 toCreateProjectState → 기존 CreateProjectState/NewProjectForm | mapper unit + 실제 created/existing/disconnected 렌더링 |
| 실패 결과 변환 | project-access-query.ts의 ProjectIntegrityError·project-availability-service.ts의 AvailabilityConflict → 등록 query/REST facade/create action/연결 service의 위 오류 경계 | query·service unit, create mapper, binding AST와 실제 등록 409 body; 트랜잭션 쓰기 이후 예외는 외부로 전파 |
| 읽기 전용 데이터 | requireProjectOwner, loadCurrentVersionView, loadTurn, loadInboxItems와 board 조회 유지 | GET 전후 version·cursor·도메인 row 불변; ensureRun/nextFor를 GET에 추가하지 않음 |
| History 조회 | board-query.ts의 createBoardQueries → board.ts의 projectHistoryItems/projectHistory/hasProjectHistoryBefore/currentRoundIds → history/page.tsx; history-items.ts의 historyItemsQuery/parseHistoryItemCursor/formatHistoryItemCursor 및 history-page.ts의 event cursor/filter/merge와 entitlement의 historyCutoff 유지 | project-history.test.ts·history-items.test.ts·history-page.test.ts, 두 History DB integration과 binding 검사, 실제 두 mode/펼침 GET의 소유/기간/zero-write 인수 |
| History 요약·이동 | route의 mode별 props → project-history/index.ts의 ProjectHistoryPage → 같은 slice의 history-view.ts/history-navigation.ts 및 HistoryItemsList; status-label.ts의 statusLabel은 entities/board-item/index.ts public API로 import | project-history-page.test.ts의 Items/Events·상태/UTC·독립 cursor·펼침/빈 상세·복귀 링크·history-tab copy-lock, 실제 해제/재연결 화면 |
| 공용 이력 본문 | history-feed/index.ts의 HistoryList/toHistoryRows/타입/안내 → project-history(Events/펼친 항목) 및 board-item page; entities/board-item의 reportIsAcceptance/reportDocLabel/blobHref/DOC_LINK_NOTE, entities/pipeline의 gateLabel, shared의 utcMinute/itemPath가 본문·링크 소유 | history-row/history-list·두 page·item-docs/doc-link/relative-time/project route tests; 기존 public API를 통한 import와 실제 링크 body 유지 |
| Inbox 읽기 전용 라벨 | inbox/page.tsx의 ProjectAccess → ProjectInboxPage → review-gate/index.ts의 InboxCard, readOnlyLabel prop | 실제 card 렌더에서 disconnected/not-selected 구분·변경 버튼 부재; binding 검사에서 route/page 전달 확인 |

### 생성 산출물과 구조 검사

Prisma의 winning source는 prisma/schema.prisma, 출력은 src/generated/prisma다.
Project.disconnectedAt과 ProjectAvailabilityEvent.targetProjectId를 추가하면
src/generated/prisma/models/Project.ts, src/generated/prisma/models/ProjectAvailabilityEvent.ts,
src/generated/prisma/internal/prismaNamespace.ts 및 internal/class.ts의 런타임 schema에도 반영되어야 한다.
client.ts, browser.ts, models.ts는 같은 generator 실행의 산출물이다. 수동 수정하지 않는다.
모델 수는 현재 18개를 유지하므로 scripts/project-availability-runtime.test.ts의 모델 수 검사를 새 기능 때문에 늘리지 않는다.
DB 검사에서는 information_schema/pg_constraint로 nullability·CHECK·index·기존 unique/FK를 확인하고, 실제 위반 INSERT/UPDATE의 실패를 확인한다.
단순 문자열 검색이나 생성 파일 존재만으로 이 검증을 대체하지 않는다.

## 최종 산출물·런타임·검증 연결

| 산출물 / winning source | 허용 body·의존성 / 차단 body | 구현 후 검증 목적지 |
| --- | --- | --- |
| Projects 및 프로젝트 상세 HTML/RSC | I-ROUTES → I-WEB → availability snapshot 및 각 page의 owner-scoped 조회. 연결/해제 그룹, 두 count, 현재 해제 URL/제목·읽기 데이터 보존. Inbox 카드에도 정확한 해제 라벨, 편집/실행 안내 숨김 | project-list-page.test.mjs, project-board-page.test.mjs, inbox-card.test.mjs·binding 검사 + 일곱 상세 경로 브라우저 인수 |
| History 및 항목 상세 이력 HTML/RSC | owner guard → plan cutoff → historyItemsQuery/board 조회 → mode별 page public API·HistoryItemsList → history-feed → status/목적 라벨·UTC·commit 링크. Items 요약/펼침·Events·탭/필터·독립 페이지 이동 유지, 연결 필터·변경 컨트롤·기간 우회 없음 | I-VERIFY의 history-items/history-page 및 두 DB integration·History page/widget·항목 문서·route 시험과 V-ACCESS/V-UI-PLUGIN의 실제 해제/재연결 GET·body·DB 불변 인수 |
| 연결 Server Action 결과 | 새 feature action → session guard → server flag → owner lock/service. error/stale/success 구분; client userId 신뢰 금지 | project-connection-state.test.ts, project-connection-bindings.test.ts, 로그인/타인/무세션 직접 POST 수동 인수 |
| 등록 DTO/생성 폼 | POST /api/projects 성공은 project identity만, 자신의 해제 repo는 error/reconnectPath만; integrity/conflict는 error만, create mapper는 created에만 token | project-registration-query.test.ts, create-project-result.test.ts, new-project-form.test.ts, binding AST와 통합 route 응답 JSON |
| REST identity/templates/runbook | route.ts → singleton facade → make* query → scope/access. 정상 응답은 기존 project/템플릿 stub·entitlement/ok body 유지; 해제는 error만 | query unit에서 downstream 호출 0; 실제 route GET/POST + 실제 DB integration에서 응답 body·저장 상태 대조 |
| MCP tool body | 두 route의 withMcpAuth → 요청 authInfo → registerTools/registerOwnerTools. disconnected는 isError와 error 문자열만; not-selected project_get 본문 예외 보존 | auth/tools/owner-tools unit의 14+1 registry·dep 호출 0; 실제 두 Route Handler에 후속 Request를 보내 인증·응답·DB 검증 |
| CLI 생성 파일 / runbook 기록 | 이미 구현된 config.project.slug → query/body 유지; deliverable의 기존 template·plan·stub 규칙 유지. 초기 등록/identity/templates 거부 전후 파일 불변; 이미 허용된 생성 후 runbook 거부는 경고/후속 sync 중단 | plugin/bin/harness-init.test.mjs 및 src/server/harness-init.test.ts의 실제 REST 판정·HTTP request·파일 snapshot; offline/skip(modified)/dry-run 회귀; init skill 수동 인수 |
| 저장 상태 / generated client | 새 migration → DB, schema.prisma → Prisma client; 문서 열만 있고 DB/타입에는 없는 상태 금지 | db:validate → db:generate → unit/type/build 및 migration.test.ts |
| 감사/보존/사용량 | 연결 service만 토큰·상태·version/event 변경. 다른 Project 자식 데이터와 UserToken/다른 프로젝트 자격증명 불변 | project-connection.test.ts의 전후 row 비교·dispatch 집계·실패 주입 |
| 운영 checker / 배포 flag | 새 스키마 capability 분기와 project-connection-config. flag=false여도 읽기 접근 거부는 계속 적용 | cleanup/runtime/config tests + 격리 rehearsal 결과를 새 test report/운영 문서에 기록 |
| 실제 배포 plugin | marketplace manifest가 가리키는 ./plugin 안의 생성기·init skill과 plugin manifest version | JSON 구조로 두 manifest의 version/source 확인, 배포 후보 main commit과 설치본 버전/기본·dry-run 재실행 인수 |

## Phase와 Task

### Phase RDC1: 상태·공통 정책·트랜잭션

- status: Implemented; 로컬 schema/service/unit/실제 DB 경쟁 검증 통과. 기본 writer 스위치는 false다.
- entry criteria: 이 문서의 제품 정책, AGENTS.md, 현재 코드 기준을 재확인하고 별도 구현 요청을 받음.
- satisfies: REQ-RDC-001, REQ-RDC-002, REQ-RDC-004, REQ-RDC-006, REQ-RDC-009, REQ-RDC-011, REQ-RDC-013, REQ-RDC-014
- preserves: INV-RDC-001, INV-RDC-002, INV-RDC-003, INV-RDC-004, INV-RDC-005
- governed-by: CON-RDC-001, CON-RDC-002, CON-RDC-003, CON-RDC-004, CON-RDC-005
- verifies: REQ-RDC-001, REQ-RDC-002, REQ-RDC-004, REQ-RDC-006, REQ-RDC-009, REQ-RDC-011, REQ-RDC-013, REQ-RDC-014
- exit criteria: 신규 상태와 atomic service 검증. 아직 UI/외부 해제 writer를 활성화하지 않음.
- current blockers: 없음. downstream blockers: BLK-RDC-01, BLK-RDC-02.

#### TASK-RDC1-01: 스키마와 공통 상태 모델

- satisfies: REQ-RDC-002, REQ-RDC-011, REQ-RDC-013, REQ-RDC-014
- preserves: INV-RDC-001, INV-RDC-004
- governed-by: CON-RDC-001, CON-RDC-004
- implementation destination: I-STATE의 schema/availability/access, I-NEW의 명명된 migration, I-OPS의 계약 문서.
- change intent: additive migration, 기존 snapshot/0개 검증/조회 모델 수정. 구현과 함께 현재 아키텍처·용어 계약 갱신.
- verification destination: project-availability-service.test.ts, project-access-query.test.ts, tests/server/integration/migration.test.ts.
- stop condition: 과거 데이터 삭제·선택 재계산·계정 토큰 변경이 필요해지면 중단.

#### TASK-RDC1-02: 연결 전이와 발급 경쟁

- satisfies: REQ-RDC-001, REQ-RDC-004, REQ-RDC-006, REQ-RDC-009
- preserves: INV-RDC-002, INV-RDC-003, INV-RDC-005
- governed-by: CON-RDC-002, CON-RDC-003
- implementation destination: I-NEW의 project-connection-service/connection/config 및 project-token-service/token 모듈; I-STATE의 공통 writer 잠금과 manage-token adapter; I-OPS의 .env.example.
- change intent: 연결·발급 transaction service와 서버 기능 스위치 추가. 기존 등록·플랜·사용 선택 writer의 잠금 순서 통일; 읽기 함수는 read-only 유지. 연결 오류 결과는 rollback/retry 바깥에서 변환한다.
- verification destination: 신규 src/server/project-connection-service.test.ts; 신규 tests/server/integration/project-connection.test.ts.
- depends on: TASK-RDC1-01.
- stop condition: 서비스마다 다른 잠금 순서, 한도 초과, 부분 토큰 폐기, stale 쓰기가 검증에서 나오면 다음 단계로 가지 않음.

### Phase RDC2: 경로 연결과 사용자 흐름

- status: Implemented; 등록·CLI·웹 UI와 실제 action/GET 검증 통과. 브라우저 클릭·키보드 인수는 미실행이다.
- entry criteria: RDC1 통과. RDC2는 기능의 필수 Core이며 해제 writer를 아직 활성화하지 않음.
- satisfies: REQ-RDC-003, REQ-RDC-005, REQ-RDC-007, REQ-RDC-008, REQ-RDC-010, REQ-RDC-012
- preserves: INV-RDC-001, INV-RDC-002, INV-RDC-003, INV-RDC-004, INV-RDC-005
- governed-by: CON-RDC-001, CON-RDC-002, CON-RDC-003, CON-RDC-004, CON-RDC-005
- verifies: REQ-RDC-003, REQ-RDC-005, REQ-RDC-007, REQ-RDC-008, REQ-RDC-010, REQ-RDC-012
- exit criteria: 모든 접근 경로와 웹/CLI 흐름 검증. 해제 상태를 모르는 reader/writer가 없음.

#### TASK-RDC2-01: 등록·초기화의 자동 복구 차단

- satisfies: REQ-RDC-007, REQ-RDC-012
- preserves: INV-RDC-002, INV-RDC-005
- governed-by: CON-RDC-001, CON-RDC-003
- implementation destination: I-STATE의 등록 및 create-project 파일, I-NEW의 create-project-result mapper, I-ROUTES의 api/projects, I-OPS의 생성기·init skill·plugin manifest.
- change intent: 공통 repo 정체 helper와 disconnected/existing/integrity 결과·정확한 409 body, legacy registerProjectIn 오류 전파. 사전 검사·REST facade·create action의 오류 변환 및 재시도 소진 처리를 연결한다. 이미 구현된 일반 hu_ init의 project 전달·설정 보완을 보존하고 모든 CLI 모드의 거부/재연결 경계와 실제 플러그인 전달물을 갱신.
- verification destination: project-registration-query.test.ts, rest-scope.test.ts, create-project/ui/new-project-form.test.ts, plugin/bin/harness-init.test.mjs, src/server/harness-init.test.ts; 통합 등록의 정확한 JSON body와 중복 repo 연결/no-op 시나리오.
- stop condition: 기존 해제 프로젝트를 신규 생성하거나 저장하지 않은 토큰을 성공 응답으로 노출하면 중단.

#### TASK-RDC2-02: 접근 경계와 읽기 전용

- satisfies: REQ-RDC-003, REQ-RDC-005, REQ-RDC-008
- preserves: INV-RDC-004, INV-RDC-005
- governed-by: CON-RDC-001, CON-RDC-003
- implementation destination: I-ACCESS 전체와 I-ROUTES의 실제 HTTP/프로젝트 페이지, I-WEB의 기존 mutation actions. 불필요한 형식적 변경 없이 guard 전파와 body 차단을 검증한다.
- change intent: 공통 disconnected 판정 연결, project_get 예외 축소, 일곱 상세 페이지 GET의 zero-write와 현재 권한 검사 보장. History의 Items 요약/펼침·Events, owner guard·플랜 cutoff·독립 cursor·공용 이력 본문/링크를 보존한다.
- verification destination: 기존 MCP·identity·templates·runbook unit tests, tests/server/integration/project-connection.test.ts, I-VERIFY의 History/항목 상세 query·widget·page tests와 실제 GET 인수.
- stop condition: 해제 후 새 호출에서 본문 노출·도메인 변경이 확인되거나 타인 상태가 노출되면 중단.

#### TASK-RDC2-03: 연결 관리 UI

- satisfies: REQ-RDC-008, REQ-RDC-010
- preserves: INV-RDC-001, INV-RDC-005
- governed-by: CON-RDC-001
- implementation destination: I-NEW의 manage-project-connection 파일 전부, I-WEB의 project-list/app-header/select-project-for-use와 project-inbox/InboxCard 공개 경로, I-ROUTES의 projects/page.tsx·p/[slug]/layout.tsx·inbox/page.tsx.
- change intent: 연결/해제 목록, 확인·재연결·stale UI, 상세 배너, Inbox 상태 라벨, 헤더 목록, cache invalidation. 커밋 후 결과 미확인은 롤백으로 안내하지 않고 refresh로 복구한다. docs/conventions/product-copy.md 동시 갱신.
- verification destination: project-list-page.test.mjs, inbox-card.test.mjs, 신규 feature model/binding tests; 검증 절의 브라우저 수동 시나리오.
- stop condition: feature 간 같은-layer import, UI에서만 권한 제한, 새 전역 상태/의존성이 필요해지면 범위를 재검토.

### Phase RDC3: 통합 검증과 출시 준비

- status: Implementation complete; 통합 검증 코드·자동·격리 DB·실제 Next transport 검증과 출시 절차 작성 완료. 브라우저·실제 init 수동 인수는 검증 보고서의 후속 작업이며, 실제 운영 활성화는 별도 배포 작업이다.
- entry criteria: RDC1/RDC2 전체 검증 가능, 격리 PostgreSQL 준비.
- satisfies: REQ-RDC-001, REQ-RDC-002, REQ-RDC-003, REQ-RDC-004, REQ-RDC-005, REQ-RDC-006, REQ-RDC-007, REQ-RDC-008, REQ-RDC-009, REQ-RDC-010, REQ-RDC-011, REQ-RDC-012, REQ-RDC-013, REQ-RDC-014
- preserves: INV-RDC-001, INV-RDC-002, INV-RDC-003, INV-RDC-004, INV-RDC-005
- governed-by: CON-RDC-004, CON-RDC-005
- verifies: REQ-RDC-001, REQ-RDC-002, REQ-RDC-003, REQ-RDC-004, REQ-RDC-005, REQ-RDC-006, REQ-RDC-007, REQ-RDC-008, REQ-RDC-009, REQ-RDC-010, REQ-RDC-011, REQ-RDC-012, REQ-RDC-013, REQ-RDC-014
- exit criteria: 전체 검증 증거, 호환 배포·복구 절차, 운영 blocker 상태 기록. 통과하지 않은 항목을 완료로 표시하지 않음.

#### TASK-RDC3-01: DB 경쟁·보존·회귀 검증

- satisfies: REQ-RDC-001, REQ-RDC-002, REQ-RDC-003, REQ-RDC-004, REQ-RDC-005, REQ-RDC-006, REQ-RDC-007, REQ-RDC-008, REQ-RDC-009, REQ-RDC-010, REQ-RDC-011, REQ-RDC-012, REQ-RDC-014
- preserves: INV-RDC-001, INV-RDC-002, INV-RDC-003, INV-RDC-004, INV-RDC-005
- governed-by: CON-RDC-005
- implementation destination: I-VERIFY 및 I-NEW의 명명된 unit/binding/integration 시험과 docs/test-reports/active/2026-09-27-repository-disconnection.md.
- change intent: 아래 검증 시나리오와 결과 증거 작성. 필요 없는 테스트 도구를 추가하지 않음.
- verification destination: 기존 npm scripts 및 브라우저 수동 검증.
- stop condition: 실제 DB 경쟁 시험 없이 mock만으로 원자성 통과를 선언하지 않음.

#### TASK-RDC3-02: 마이그레이션·운영 검사·복구

- satisfies: REQ-RDC-013
- preserves: INV-RDC-001, INV-RDC-003, INV-RDC-004
- governed-by: CON-RDC-004, CON-RDC-005
- implementation destination: I-OPS의 cleanup checker·verification.md, I-VERIFY의 migration/cleanup/runtime tests, I-NEW의 docs/architecture/repository-disconnection.md.
- change intent: V-MIGRATION의 실제 이전 migration 체인 fixture와 아래 운영 검사 호환 계약·fail-closed 활성화 절차를 구현한다. 완전한 새 스키마와 부분 적용 오류를 구분하되 과거 D2/pre fingerprint·artifact 검증 계약을 보존한다.
- verification destination: test:project-availability, 격리 DB migration/recovery rehearsal.
- stop condition: BLK-RDC-01 또는 BLK-RDC-02가 미해결이면 운영 활성화 금지. 기존 recovery SQL을 무심코 현재 스키마에 적용하지 않음.

## 검증 계획

아래 모든 제품 검증은 **Planned**이며 문서 작성 중 실행하지 않았다.

### V-SERVICE: 연결 상태와 실패 단위 시험

- category: unit
- destination: I-NEW의 project-connection-service.test.ts, project-token-service.test.ts, project-connection-config.test.ts; I-VERIFY의 availability/access/registration unit tests.
- verifies: REQ-RDC-001, REQ-RDC-002, REQ-RDC-004, REQ-RDC-006, REQ-RDC-007, REQ-RDC-009, REQ-RDC-011, REQ-RDC-014
- expected observation: available/not-selected 양쪽 해제, 마지막 연결, 0개 선택에서 신규 등록·플랜 변경, 다른 사용자 거부, 한도별 재연결, 대소문자 동일 repo, stale/no-op, 이벤트 내용, 보존 데이터/토큰 불변 범위.
- boundary: Free 0/1·1/1, Pro 4/5·5/5·다운그레이드 초과 연결, Max 무제한, 모든 프로젝트가 해제된 사용자.
  같은 owner의 대소문자 중복 repo 2개 fixture로 등록·해제·재연결·현재-version no-op이 integrity/zero-write인지 검사한다. 서로 다른 owner의 같은 repo는 중복이 아니다.
- error boundary: 등록 query의 사전 ProjectIntegrityError는 integrity 결과이고 legacy adapter에서는 오류 문자열이다. 첫 쓰기 뒤 event/CAS 예외는 반환값으로 삼키지 않고 reject한다.
  기존 availability-service test의 재시도 3회/비대상 오류 1회 검사를 유지한다. 연결 service는 재시도 소진 후 conflict, 일반 저장 오류는 reject이며 어느 실패에도 success/token 결과가 없어야 한다.
  create-project-result.test.ts는 integrity 결과의 error 매핑도 검사한다. binding test는 REST facade의 integrity/409 처리, create action의 AvailabilityConflict 처리 및 실제 mapper 사용을 AST로 확인한다.

### V-ACCESS: API/MCP/웹 권한 행렬

- category: contract/security
- destination: src/server/mcp/tools.test.mjs, owner-tools.test.mjs, auth.test.mjs; project-identity-query.test.ts, templates-query.test.ts, runbook-query.test.ts; 신규 통합 시험.
- verifies: REQ-RDC-003, REQ-RDC-004, REQ-RDC-005, REQ-RDC-007, REQ-RDC-008, REQ-RDC-012
- expected observation: 유효 hu_로 소유/타인/해제/미선택/재연결 상태를 각각 호출. disconnected project_get에는 본문 없음, not-selected 예외는 유지. 모든 새 쓰기·템플릿 요청 차단.
- reconnect observation: 옛 hs_/ho_는 401, 유지된 hu_는 허용, 재발급한 프로젝트 토큰은 기존 규칙에 따라 허용.
- web observation: 로그인 소유자의 해제 프로젝트 GET 전후 DB 도메인 row와 version이 불변. I-ROUTES의 일곱 상세 page와 layout 전체를 확인한다. 일반 mutation action 직접 호출도 거부하고 revoke는 허용한다.
  History의 Items/Events 및 항목 펼침은 소유자 connected/not-selected/disconnected/reconnected와 타인/무세션을 구분한다. layout에만 기대지 않는 route 자체의 requireProjectOwner를 binding 검사로 확인하고 실제 로그인 앱에서도 직접 URL 인가를 확인한다.
  같은 소유자라도 연결 상태를 이유로 History 행을 제외하지 않는다. Free cutoff 밖 레코드·다른 프로젝트 레코드를 cursor의 시각/id로 제출해도 노출하지 않는다.
  `before`/`itemBefore`는 범위 안 조회의 상한만 정하며 소유권·cutoff를 대체하지 않는다. `item`에 다른 프로젝트/현재 목록 밖 key 또는 배열을 제출하면 펼친 조회를 실행하지 않는다.
  query unit의 where 검사만으로 실제 페이지 인가·본문 보존을 입증하지 않는다. V-UI-PLUGIN의 populated 화면과 GET 전후 DB 비교를 함께 기록한다.
- failure observation: 인증 없는 요청/폐기 토큰은 일반 401, hu_의 타인/없는 slug는 같은 실패, hu_의 소유 해제 요청만 disconnected 사유. REST에 project/templates/entitlement가 없어야 하고 MCP JSON text에 도메인 body가 없어야 한다.
- route integration: 신규 project-connection.test.ts는 I-ROUTES의 REST 네 파일에서 GET/POST와 MCP 두 파일에서 POST를 직접 import한다.
  tests/server/integration/templates.test.ts처럼 실제 Request를 전달하고 실제 Response를 읽는다. facade·인증·scope·access·DB 바인딩을 mock으로 교체하지 않는다.
  기존 runner는 Next HTTP 서버를 띄우지 않으므로 이 시험은 Route Handler 통합시험이다. 브라우저/네트워크/Next action 런타임까지 검증했다고 보고하지 않는다.
  MCP는 설치된 SDK가 받는 JSON-RPC·Content-Type·Accept·protocol/초기화 절차를 지키고 응답 Content-Type에 따라 JSON 또는 SSE의 JSON-RPC result를 파싱한다.
  정상 연결 fixture의 성공 body로 요청 형식과 바인딩을 먼저 확인한 뒤, 같은 handler와 bearer로 연결→해제→재연결의 새 Request를 매번 보낸다.
  transport 400/404/405·JSON-RPC invalid params·임의 예외를 disconnected 거부로 인정하지 않는다. 도구의 isError와 content의 error 사유를 정확히 비교한다.
  14개 agent 도구의 권한 거부에는 각각 유효한 입력을 사용한다. owner gate의 정상 대조에는 Pro 이상·현재 소유자·실제 승인 가능한 gate fixture를 쓴다.
  해제로 폐기된 hs_/ho_의 후속 HTTP 401은 tool result와 구분한다. 유지된 hu_는 재연결 뒤 같은 자격으로 다시 허용되어야 한다.
  도메인 dep 호출 0은 주입 unit에서 검사하고, 실제 route 통합시험에서는 응답 내용과 populated DB 전후 상태로 확인한다.
  등록에는 정상 연결 대조와 별도로 소유자의 대소문자 중복 repo fixture를 만들고 실제 POST의 409 `{ error: reason }`를 검사한다.
  reconnectPath/project/token 키 부재와 등록 전후 상태·토큰·version/event 불변을 함께 확인한다. 예외 발생 자체를 이 409 계약의 통과로 세지 않는다.
- binding observation: tests/server/project-connection-bindings.test.ts는 실제 import/export·action의 session guard/위임/revalidate 배선과 registry를 검사한다.
  TypeScript AST로 connection adapter의 module-level server-only와 두 mutation의 inline use server를 구분한다.
  build 뒤 새 `.next/server/server-reference-manifest.json`의 node/edge 항목을 구조적으로 파싱한다.
  filename이 connection adapter인 등록은 두 mutation에 해당하는 2개여야 한다. inline action은 exportedName이
  `$$RSC_SERVER_ACTION_*`로 바뀌므로 loader 이름의 문자열 부재만으로 통과시키지 않고 AST의 두 inline 함수와 함께 대조한다.
  빌드 산출물 검사는 build 뒤 수행하여 새 test report에 기록하며, build 전에 실행하는 binding unit test는 AST/배선만 검사한다.
  이것만으로 action 런타임 인가를 통과로 삼지 않는다.
  cookie/Server Action ID가 Next가 생성하는 값이므로 별도 새 테스트 프레임워크 없이 격리 DB를 사용하는 로컬 실행 앱에서 세션별 실제 POST를 수행한다.
  flag=true에서 소유자의 정상 action 제출을 먼저 확인하고, 같은 빌드의 action ID·직렬화된 인자·Origin/Host를 유지한 요청에서 세션만 타인/무세션으로 바꾼다.
  타인/무세션 요청에 대상 소유자의 userId를 추가해도 인가를 얻지 못하며, bearer만 있는 무세션 요청도 거부해야 한다.
  잘못된 action ID·CSRF·인자 인코딩 오류로 난 프레임워크 거부를 세션 인가 성공으로 세지 않는다.
  foreign/not-found·무세션·stale·disabled 거부를 구분하고, 각 경우 변경 전후 상태·토큰·version/event가 불변인지 새 test report에 기록한다.
  flag=false 시험은 별도로 수행한다. 수동 증거에는 cookie·Authorization·토큰 평문을 남기지 않는다.

### V-DATABASE: 실제 트랜잭션과 이력 보존

- category: integration
- destination: 신규 tests/server/integration/project-connection.test.ts; npm run test:server:integration.
- verifies: REQ-RDC-001, REQ-RDC-002, REQ-RDC-003, REQ-RDC-004, REQ-RDC-006, REQ-RDC-007, REQ-RDC-008, REQ-RDC-009, REQ-RDC-011, REQ-RDC-014
- setup: 기존 runner의 부모 환경에서 DATABASE_URL과 구분된 stagekeeper_test_* PostgreSQL을 검증한 뒤 실행한다. 서로 다른 DB connections와 명시적 barrier를 사용한다.
  runner는 검증 이후 자식의 DATABASE_URL과 TEST_DATABASE_URL을 같은 테스트 URL로 설정한다. 이 정상 상태에서 validateTestDatabase(process.env)를 다시 호출하지 않는다.
  통합시험은 support.ts의 testDatabaseUrl()/connections()를 사용하고 npm run test:server:integration을 통해 실행한다. 검사를 통과시키려고 DATABASE_URL을 지우거나 runner의 동일 DB 거부를 완화하지 않는다.
- expected observation: 동시 등록/재연결, 해제/선택, 해제/플랜 변경, 해제/토큰 발급, 동일 repo 동시 등록에서 불변식 유지.
- fault injection: event/CAS 단계에서 실패시 연결 상태·token revokedAt·version 모두 rollback한다.
  재시도 가능한 CAS/P2034 실패 후 성공은 이벤트 하나, 재시도 소진은 해당 요청의 이벤트 0개와 conflict,
  재시도 대상이 아닌 event 저장 예외는 즉시 reject와 해당 요청의 이벤트 0개다. 어떤 실패도 transaction 내부의 정상 반환으로 부분 변경을 커밋해서는 안 된다.
- preservation: fixture에 Workspace, BacklogItem, BoardItem, TransitionEvent, Report, Command, AgentRun, AgentRunStep, PipelineVersion, PipelineRun을 실제로 채우고 해제/재연결 전후 행·cursor를 비교한다.
  Project는 disconnectedAt/available/lastSelectedAt의 허용 변경만 제외하고 비교한다. User의 version과 ProjectAvailabilityEvent는 정확한 증가/내용을 검사한다.
  ProjectToken/OwnerToken은 해당 프로젝트의 기존 미폐기 행 revokedAt만 바뀌고, 기존 폐기 시각·UserToken·다른 프로젝트 토큰은 그대로여야 한다. 비어 있는 표 개수 비교로 보존을 증명하지 않는다.
- ordering: User 잠금을 잡는 두 writer 모두 owner snapshot 뒤 barrier에 모이도록 만들면 서로 대기한다.
  먼저 실행한 writer가 잠금을 가진 checkpoint에서 두 번째를 시작하고, 첫 transaction을 해제/커밋한 뒤 두 번째를 관찰한다. 양방향 순서와 P2034 retry를 각각 검증한다.
- in-flight: makeRecordRunbook의 projectAccess 이후 saveRunbookVersion 전에 멈춘 R1 fixture로 허용된 요청의 완료 가능성을 검증한다.
  반대로 User 잠금 안에서 접근을 재검사하는 board/agent 경로는 기존 거부를 유지한다. 모든 경로가 반드시 완료된다고 단언하지 않는다.
- usage: A에서 dispatch 사용 후 해제하고 B를 연결해도 사용자 dispatch 합계가 줄지 않음.

### V-UI-PLUGIN: 실제 사용 흐름

- category: UI/contract/manual
- destination: project-list-page.test.mjs, 신규 connection model tests, plugin/bin/harness-init.test.mjs, src/server/harness-init.test.ts; 로컬 브라우저 수동 검증.
- verifies: REQ-RDC-003, REQ-RDC-006, REQ-RDC-007, REQ-RDC-008, REQ-RDC-010, REQ-RDC-012
- expected observation: A→해제→B→B 해제→A 복원, Cancel, pending, 두 탭 stale, 응답 유실 후 새로고침, 키보드 조작, 해제 상세 읽기·배너, 0개 연결 화면.
- CLI observation: 유효 hu_의 --register(409), config가 있는 일반/--dry-run templates(403), 폐기 hs_의 --print-project와 일반 실행(401)을 각각 시험한다.
  종료 코드/안내/호출 순서/파일 snapshot을 검사한다. 401은 조건부 안내만 하고 서버의 repo 정보를 요구하지 않는다.
  같은 HTTP 상태의 not-selected/cap/integrity/conflict를 해제로 오인하지 않는 음성 시험을 포함한다.
  재연결 후 같은 hu_로 templates project query·runbook project body와 정상 생성/기록을 확인한다. hu_의 slug 누락은 무쓰기 종료, hs_의 slug 없는 기존 설정은 유지한다.
  HARNESS_TEMPLATES_DIR 우회, URL 우선순위, 명시적 en 기본 언어, offline/skip(modified)/dry-run도 기존 시험에서 유지한다.
  templates를 이미 허용한 뒤의 해제와 runbook 403은 별도 fixture로 확인하며 생성된 파일이 무조건 0개라고 잘못 기대하지 않는다.
  src/server/harness-init.test.ts에서는 실제 makeTemplatesFor/makeRecordRunbook을 유지하고 DB IO·접근 상태만 fixture로 바꾼다.
  연결→해제→재연결에 같은 hu_를 사용해 거부 시 template query/saveRunbookVersion 0회와 복원 뒤 성공을 확인한다.
  항상 성공하는 가짜 HTTP 서버만으로 이 계약을 통과시키지 않는다. origin/config 불일치 해결·slug만 보완하는 기존 수동 흐름도 유지한다.
  수동 init 인수에서는 이 접근 거부 note 뒤 후속 MCP 등록/sync와 성공 보고를 하지 않는지 확인한다.
- token observation: 신규 create-project-result.test.ts에서 모든 등록 결과의 실제 action mapper를 검사하고 new-project-form.test.ts에서 각 결과 body를 렌더링한다.
  기존 formMode/초기 폼 시험만으로 이 분기를 대체하지 않는다. existing/disconnected에는 token 키/평문/TokenReveal이 없고 created만 저장한 토큰을 1회 표시한다.
- refresh observation: 성공·현재-version no-op·stale·응답 유실 모두 확인창/버튼 상태를 실제 브라우저에서 검증한다. server flag를 false로 바꾸면 UI와 직접 action 모두 차단되지만 archive 접근 거부는 유지된다.
  응답 유실 인수는 격리 앱에서 실제 커밋을 DB로 확인한 뒤 응답을 받지 못하게 한 경우를 포함한다. DB 변경·이벤트는 한 번만 남고,
  UI는 롤백 완료/자동 재시도를 표시하지 않으며 새로고침으로 저장된 상태에 도달해야 한다. 응답 유실을 흉내 낸 rejected action과 캐시 무효화 예외도 같은 확인 패널 reset 경로를 사용하는지 binding/model 검사로 대조한다.
- read-only label observation: inbox-card.test.mjs에서 동일 항목을 disconnected와 not-selected로 각각 렌더해 Disconnected/Not selected가 서로 섞이지 않고 승인·재개·반려·폐기 버튼이 없는지 검사한다.
  integrity는 Read only이며 연결 상태를 추정하지 않는다. project-connection-bindings.test.ts는 inbox route → ProjectInboxPage → InboxCard prop 전달을 검사하고, 브라우저에서 상세 배너와 카드 라벨이 일치하는지 확인한다.
- history preservation observation: I-VERIFY의 History items/event query·cursor·mode별 page/widget, 항목 상세/문서, route/UTC 회귀를 유지한다. server-only 조회 시험은 test:server, 나머지 colocated 시험은 test:web에서 실행한다.
  tests/server/integration/project-history.test.ts와 history-items.test.ts의 실제 DB 정렬·cursor·기간·프로젝트 격리·과거 회차 회귀도 test:server:integration에서 유지한다. Items의 항목별 집계·동일 시각 정렬·report-only/cutoff 경계·기록 없는 backlog 제외를 포함한다. 이 query 시험은 로그인 세션이나 연결 해제 전후의 실제 page GET을 대신하지 않는다.
  실제 소유자 화면은 해제 전후 같은 populated fixture로 대조한다. Free 30일 경계 안/밖과 Pro/Max, 과거/폐기 회차, 보고서만 있는 이력, 50행을 넘는 혼합 이력과 빈 페이지를 포함한다.
  History 탭·기본 Items 직접 URL·Events 및 기존 view 링크·Key events/All·Older/Newest·refresh에서 기존 cutoff/정렬/페이지 이동과 현재 회차 링크가 유지되고,
  기록된 commit의 보고서 링크·목적 라벨·GitHub 안내가 공용 위젯과 항목 상세에 남는지 body로 확인한다. 원격 GitHub의 가용성이나 push를 보장하거나 자동 수행하지 않는다.
  Items에는 활동이 많은 한 항목도 한 행만 나타나고, 제목·최신 상태/Discarded·UTC Last activity·done/on_hold/제거된 항목·빈 목록 문구가 해제 전과 같아야 한다.
  목록의 과거 페이지에서 항목 펼침/닫기와 Older events/Newest events를 수행해 `before`가 보존되고 상세 `itemBefore`만 바뀌는지 확인한다.
  Items/Events 전환은 두 cursor와 펼침을 초기화하고, 목록 페이지 이동은 펼침을 닫는다. 비어 있는 목록/상세 과거 페이지에서도 Newest/Newest events로 복귀한다.
  펼침 key는 현재 목록에서만 유효하고 조회는 project/key/cutoff를 모두 유지한다. View current item은 현재 비폐기 회차가 있을 때만 제공한다.
  malformed/배열 cursor 또는 잘못된 source(.i와 .r/.e 혼용)는 해당 parser의 null/첫 페이지 처리로 돌아간다.
  문법상 유효한 다른 프로젝트/cutoff 이전 cursor는 상한으로 사용될 수 있고 빈 페이지일 수 있다. 이를 자동 첫 페이지 복귀로 기대하지 않으며 소유 프로젝트/key·플랜 기간 바깥 데이터가 없는지를 검사한다. Events view 변경은 event cursor를 초기화한다.
  위 GET마다 populated 도메인 row·run cursor·Project 상태·User version·availability event/token이 불변이어야 한다. 재연결 후에도 같은 기록을 읽고, 해제 중 항목 상세의 Reopen 같은 변경 컨트롤은 숨기고 직접 action은 거부한다.

### V-MIGRATION: 이행과 복구 검증

- category: migration/recovery
- destination: tests/server/integration/migration.test.ts, scripts/project-availability-cleanup.test.ts, 기존 통합 runner.
- verifies: REQ-RDC-013
- fixture construction: I-KEEP에 열거한 기존 migration 17개를 순서대로 적용한 **RDC 이전 schema**에 populated fixture를 넣고,
  새 migration SQL을 적용한 전후를 대조한다. runner의 migrate deploy가 이미 적용한 최신 public schema만 읽어서는 이행 보존을 증명할 수 없다.
  scripts/rehearse-pipeline-agent-slots.ts의 pg 드라이버 사용을 참고하되 그 스크립트를 실행하거나 수정하지 않는다.
  V-DATABASE의 부모 runner 검증을 통과한 testDatabaseUrl()로 단일 pg connection을 확보한다. 자식 환경에서 validateTestDatabase를 재호출하지 않는다.
  충돌 없는 테스트 전용 schema를 만들고 search_path에는 그 schema만 지정한다. 생성한 안전한 식별자를 quote하며 public fallback을 넣지 않는다.
  원본 SQL은 파일 전체를 query로 실행한다. D3 SQL의 dollar-quoted DO 블록 및 BEGIN/COMMIT 때문에 기존 statementsOf의 세미콜론 split과 바깥 단일 transaction을 재사용하지 않는다.
  이전 schema의 fixture 작성·snapshot도 같은 connection의 SQL로 수행해 최신 generated client가 아직 없는 열을 읽지 않게 한다.
  SQL 파일의 직접 실행은 Prisma의 _prisma_migrations 원장을 만들지 않는다. 이 fixture는 migration SQL과 행 보존 검증에만 사용한다.
  원장을 조회하는 readCleanupFactsIn의 실제 DB 검사는 runner가 migrate deploy한 최신 테스트 schema에서 별도로 수행한다.
  과거 D2/pre·RDC 이전 post·부분 이행의 checker 분기는 cleanup unit fixture로 검증하고, 이 결과를 운영 migration/복구 receipt로 취급하지 않는다.
  finally에서 열린 transaction을 rollback하고 search_path를 복원한 뒤 자신이 만든 schema만 제거하고 connection/pool을 닫는다. public·다른 시험 schema는 변경하지 않는다.
- expected observation: 기존 행의 disconnectedAt=null, 기존 available/토큰/도메인 행 불변, 과거 event의 targetProjectId=null과 기존 내용 불변.
  CHECK의 실제 위반 INSERT/UPDATE, index 열 순서, nullable 열·default 없음, 기존 FK/unique를 catalog와 실행으로 검사한다.
  CHECK 실패는 별도 transaction 또는 savepoint에서 격리하여 이후 검사가 aborted transaction에서 실행되지 않게 한다.
- compatibility: 새 스키마·writer 활성화 전 구버전 호환, 활성화 후 구버전 복귀 금지, 새 스키마 0개 검사와 과거 pre 검사 각각 검증.
- recovery: 폐기된 토큰을 되살리지 않는 복구, 해제 기록 보존, 인증/본문 누출 없이 기능 비활성화.

### 저장소 검증 명령

발견된 기존 명령만 사용한다. 단위 시험 선별 실행 후 최종 전체 게이트를 수행한다.

~~~powershell
npm run db:validate
npm run db:generate
npm run test
npm run test:web
npm run test:server
npm run test:server:integration
npm run verify:fsd
npm run test:architecture
npm run check
npm run build
~~~

check는 lint/FSD·Next typegen·tsc·architecture·project-availability 검사를 포함한다.
db:generate는 스키마 수정 뒤 필수 선행 단계다. build가 마지막에 생성하므로 그것만 믿고 앞의 type/unit 검사를 실행하지 않는다.
core의 상한·플랜 정책 수치는 변경하지 않는다. 구현 리뷰에서 공용 OWNER_TOKEN_PLAN_GATE 문구를 core로 옮겨
서버와 웹이 재사용하게 했으며, I-OPS에 목적지를 추가한 뒤 sync:plugin-lib와 복사본 일치 검사를 통과했다.
격리 DB가 없으면 통합 검증은 미실행으로 기록하고 출시 준비 완료를 선언하지 않는다.
프라이빗 plugin/templates 본문을 이번 기능 때문에 변경하는 것은 계획하지 않는다.

## 배포·복구와 blocker

### 서버 활성화와 운영 검사 호환 계약

- server-only project-connection-config.ts에서 PROJECT_CONNECTION_WRITES_ENABLED를 정확히 "true"인 경우에만 켠다. 미설정/"false"/오타는 false다.
  .env.example에는 false를 기록한다. Next public 환경 변수나 client bundle에 읽기 로직을 두지 않는다.
- connection facade는 매 요청 flag를 확인하고 disabled를 반환한다. UI loader도 같은 값을 사용한다.
  flag는 disconnect/reconnect 신규 동작만 제어한다. 인증·연결 상태 판정·폐기 토큰 거부·일반 등록의 disconnected 거부에는 조건을 걸지 않는다.
- 설정은 운영 프로세스에 반영되어야 하므로 실제 환경의 재시작/drain 절차는 운영 문서에 기록한다. 메모리의 환경 변수 변경만으로 배포 전체에 적용됐다고 판단하지 않는다.
- 기존 cleanup checker는 현재 스키마에서도 실행되는 유지보수 경로다. 같은 read-only snapshot에서 두 신규 열의 존재·nullable/default,
  Project_disconnected_available_check의 식·검증 상태와 ownerUserId/disconnectedAt index의 열 순서를 검사한다.
  완전한 RDC 스키마일 때만 별도 연결 상태 snapshot을 읽어 0개를 허용하고 disconnected+available을 거부한다.
  열·CHECK·index의 일부만 있거나 모양이 다르면 부분 이행 무결성 오류로 실패한다. 두 열 모두 없는 과거 스키마는 기존 판정 경로다.
  D2/pre와 RDC 이전 post 스키마는 기존 검사를 유지한다. 기존 CleanupCatalog/catalogFingerprint의 키·직렬화 및 과거 복구 artifact checksum을 재정의하지 않는다.
  연결 capability/result는 기존 fingerprint 밖의 별도 검사 결과로 다룬다. 각 스키마 단계 fixture로 예상 통과/실패와 fingerprint 불변을 검사한다.
- project-ownership-cleanup.ts의 역사적 PRESERVED_TABLES는 UserToken을 포함하지 않으므로 RDC의 보존 증명으로 재사용하지 않는다.
  V-DATABASE의 명시된 populated fixture로 UserToken까지 따로 대조한다.
- scripts/rehearse-project-availability-d3.ts와 historical restore-d2-shadow.sql은 D3 증거 전용으로 유지한다.
  이를 새 RDC 스키마의 rollback으로 실행하지 않는다. 새 rehearsal은 격리 DB에서 신규 migration 및 flag off/on/off를 검증하고,
  새 운영 문서에는 첫 해제 이후 사용할 상태 인식 복구 버전과 감사/폐기 유지 절차를 기록한다.

### BLK-RDC-01: 운영 데이터와 마이그레이션 증거

- classification: downstream; Phase RDC3의 운영 출시 판정.
- evidence: 이번 조사에서는 운영 DB의 case-insensitive repo 중복, 기존 state 무결성, 백업/복구 결과를 확인하지 않음.
- affects: REQ-RDC-007, REQ-RDC-013, INV-RDC-002, TASK-RDC3-02.
- impact: 기존 중복을 임의로 재연결하거나 이행 중 데이터 손상을 놓칠 수 있음.
- unblock requirement: 승인된 운영 사전 점검, 사용자별 정규화 repo 중복 0건 또는 별도 승인된 정리 완료, 격리 DB migration/recovery rehearsal 및 백업 증거.
- owner: 구현·배포 담당자.
- stop condition: 운영 증거 없이 활성화하지 않음. 자동 삭제·병합으로 해소하지 않음. 로컬 구현을 막는 blocker는 아님.

### BLK-RDC-02: 구버전 reader/writer 퇴출과 활성화 절차

- classification: downstream; Phase RDC3의 운영 출시 판정.
- evidence: 기존 서버는 disconnectedAt을 모르고 project_get·등록·사용 선택 등에서 잘못된 동작을 할 수 있음. 실제 배포 환경의 drain/rollback 절차는 미확인.
- affects: REQ-RDC-005, REQ-RDC-013, CON-RDC-004, TASK-RDC3-02.
- impact: 혼합 배포 중 해제된 데이터 노출·토큰 재발급·자동 재연결 가능.
- unblock requirement: 위 PROJECT_CONNECTION_WRITES_ENABLED 구현·false 검증, 모든 instance 갱신·요청 drain 확인, 안전한 복구 버전 확보, plugin 설치본 전달 확인을 docs/architecture/repository-disconnection.md에 기록.
- owner: 구현·배포 담당자.
- stop condition: 구버전이 남아 있을 때 해제 writer를 활성화하지 않음.

권장 배포 순서:

1. nullable 열·CHECK/index를 추가한다. 기존 데이터는 모두 connected로 보존한다.
2. disconnected 상태를 이해하는 모든 reader/writer와 CLI project 식별자/안내를 배포한다. PROJECT_CONNECTION_WRITES_ENABLED=false로 둔다.
3. 구버전 요청 배출, DB 사전 점검, 권한·토큰·동시성 smoke 결과를 확인한다.
4. PROJECT_CONNECTION_WRITES_ENABLED=true를 모든 대상 프로세스에 적용해 연결 변경 action을 활성화한다. UI 숨김만으로 writer를 통제하지 않는다.
5. disconnect/reconnect의 결과별 로그와 event/version, connected/available 불변식을 확인한다. 토큰 평문·Authorization은 기록하지 않는다.

문제 발생 시 신규 연결 변경 action을 먼저 비활성화하되, disconnected 접근 차단은 유지한다.
첫 해제 이전에는 additive 열을 남긴 채 구버전 복귀를 검토할 수 있으나, 첫 해제 이후에는 상태를 이해하는 복구 버전으로만 전진 수정한다.
연결을 일괄 복구하거나 revokedAt을 되돌리는 방식의 rollback은 금지한다.
데이터 복원이 필요하면 폐기된 자격증명과 해제 감사 기록까지 과거로 되돌리지 않는 별도 복구 절차를 적용한다.

## 최초 완료 조건과 문서 검증 범위

아래는 최초 전체 인수 목표와 구현 전 문서 검증 기록이다. 구현 완료 처리의 범위와 남은 수동 인수·운영 작업은
위 Completion or Closure Notes를 따른다. 미실행 항목을 통과로 바꾸거나 운영 활성화 조건을 완화하지 않는다.

- REQ 14개가 해당 Phase·Task·V-SERVICE/V-ACCESS/V-DATABASE/V-UI-PLUGIN/V-MIGRATION 및 위 artifact map의 실제 목적지에서 검증되어야 한다.
- RDC1–RDC3는 모두 필수 Core다. 소유권·두 종류의 개수·토큰 세 종류·동시성·0개·재연결·초기화·UI 갱신 중 일부를 후속 작업으로 넘겨 완료 처리하지 않는다.
- 허용 상태 변경 외 populated 도메인 데이터와 사용량 보존, revoked 토큰 미복원, 두 endpoint의 후속 요청 차단, 모든 웹 읽기의 zero-write를 입증한다.
- History를 포함한 일곱 상세 경로의 소유자 읽기·플랜 cutoff·공용 이력/보고서 링크를 실제 body와 DB 불변으로 확인한다. 기본 Items 요약·항목 펼침·Events·독립 cursor·빈 페이지 복귀와 history-tab copy-lock도 보존한다. 별도 History 제안서의 미래 계획이나 이력 정책 변경은 RDC 구현에 합치지 않는다.
- I-NEW의 public API/생성 파일/실제 응답 body, 기존 발급 action의 직접 create 제거와 새 transaction service 호출을 확인한다.
- Next 공식 로컬 가이드의 revalidatePath/useRouter/server action 의미에 맞게 서버 무효화와 client 확인창 reset을 모두 확인한다.
- hu_의 기존 설정·토큰 재사용은 일반 hosted init까지 포함하고 src/server/harness-init.test.ts의 실제 REST 판정 경로로 검증한다. 폐기된 hs_/ho_는 인증 오류이며, 로컬 offline 우회나 이미 허용된 생성까지 서버가 취소한다고 주장하지 않는다.
- 스키마 generation, 이전 migration 체인의 populated fixture와 부분 이행 거부, 이름이 확정된 신규 목적지, 기존 historical checker/fingerprint/복구 계약, 설치본 plugin version을 확인한다.
- 연결 loader의 비공개 경계, repo 중복의 연결/no-op 우회 금지, 등록 실패의 정확한 reconnectPath body·키 부재를 해당 action/API/DB 목적지에서 검증한다.
- 사전 integrity 결과·트랜잭션 이후 오류 변환·재시도 소진·일반 event 저장 실패를 구분해 검사하고, 커밋 후 결과 미확인을 롤백으로 보고하지 않음을 확인한다.
- I-KEEP의 계정 토큰 수명 안내 등 별도 사용자 작업과 기존 동작을 덮어쓰지 않는다. 기존 파일 이동·삭제, private template·MCP tool 이름·새 과금/보존 정책 변경은 범위 밖이다.
- 각 npm gate의 실제 결과와 브라우저/DB 인수 증거를 새 test report에 기록한다. 미실행은 미실행으로 남기고 unit 통과를 운영 안전성 증거로 대체하지 않는다.
- BLK-RDC-01/02가 남으면 실제 운영 활성화는 미승인이다. 운영 데이터·배포 인프라의 사실을 문서 대조로 확인했다고 쓰지 않는다.

이 절은 로컬 구현 요청 이전의 **제안서 검증·개선 기록**이다. 당시 문서 작업은 제품 구현·운영 변경·커밋/푸시를 승인하지 않았다.
2026-09-29 대조에서 반영한 hu_ 스코프/설정 보완, plugin 버전, CLI 시험, 서버 loader 비공개 경계,
중복 repo/no-op 판정, 등록 실패 body, 이전 스키마 fixture·부분 이행 계약을 현재 코드에서 다시 확인했다.
2026-09-30 대조에서는 **검증 절차의 개선점이 발견되었다**: 부모 runner와 자식 DB 환경 검사의 책임 구분,
실제 Route Handler·DB를 지나는 REST/MCP 시험과 정상 요청 대조, 유효한 Next action POST를 이용한 세션 인가 시험,
SQL 전용 migration fixture와 Prisma 원장을 필요로 하는 checker 시험의 분리를 위 계약에 반영했다.
coverage stability 점검에서 추가로 발견한 InboxCard의 Not selected 고정 라벨도 실제 prop 전달 경로·변경 inventory·렌더 검증에 반영했다.
추가 대조에서는 등록 helper의 예외와 409/폼 결과 사이 변환 위치, 재시도 소진과 일반 저장 오류의 차이,
커밋 후 응답·캐시 실패의 결과 미확인 경계를 명시하고 service/route/UI 검증과 완료 조건에 연결했다.
이전 working tree 대조에서는 추가된 History route와 공용 이력 표시가 기존 여섯 상세 경로 검증에서 누락된 것을 수정했다.
현재 코드·문구의 보존 범위를 inventory·public API·runtime/artifact map·RDC2-02·권한/화면 검증·완료 조건에 반영했다.
이번 현재 HEAD 대조에서는 **추가 개선점이 발견되었다**: 이전 브랜치·미커밋 History 기준이 오래되었고,
이미 병합된 Items 요약·항목 펼침·독립 cursor와 이를 구현/검증하는 파일 여섯 개가 Events 중심 보존 범위에서 빠져 있었다.
현재 근거와 history-items SQL·mode별 UI/props/이동·상태 라벨 public API를 inventory·요구사항·시나리오·Task·artifact/검증·완료 조건에 반영했다.
malformed cursor의 첫 페이지 복귀와 유효한 외부 cursor의 범위 제한/빈 페이지 가능성도 실제 parser·route·query에 맞춰 구분했다.
별도 작업의 코드·시험·문구는 수정하지 않으며, 이후 동시 변경으로 이 경계가 달라지면 저장된 내용 기준으로 다시 대조한다.
runner의 환경 전달은 이전 대조에서 합성 URL과 실행하지 않는 callback으로 확인했다. 이번에는 그 코드/계약을 재독했고 실제 프로세스·migration·DB 연결은 실행하지 않았다.
토큰 폐기·원자성·사전 허용 요청·UI reset·운영 활성화에 관한 기존 합의는 유지한다.
최종 clean 판정은 마지막 저장본에 대한 **수정 없는 INV-1–INV-7 재검토**와 coverage stability/High-Risk closure 결과를 완료 응답에 기록한다.
문서 수정 자체나 추적성 검사 하나를 그 판정으로 대신하지 않는다.

| 증거 | 이번 문서 작업의 범위 |
| --- | --- |
| 코드/계약·runtime 대조 | I-STATE–I-KEEP, 명명된 route/action/registry, 설치된 Next·mcp-handler, schema/manifest/package scripts 읽기 |
| 생성 전 점검 | I-NEW의 신규 경로 부재·부모 존재·공용 API 목적지 확인. 파일 생성은 구현 작업 |
| 문서 추적성 | `python C:/Users/hamso/.codex/skills/write-sdd-spec/scripts/validate_sdd_traceability.py --strict docs/proposals/completed/2026-10-01-repository-disconnection.md`로 최신 저장본 검사 |
| 실행하지 않은 제품 검증 | 제품 test/build, Prisma generation/migration, 운영 DB/API, 실제 브라우저 동작·plugin 배포. 전부 후속 구현 검증 대상 |
| 남는 운영 증거 | BLK-RDC-01/02. 코어 설계 누락을 이 blocker로 넘기지 않음 |

완료 보고는 최초 발견점·반영 내용·최종 대조 증거·운영 미확인 범위를 구분한다.
당시 문서 대조만으로 구현 완료나 배포 승인을 선언하지 않았다. 후속 로컬 구현과 남은 검증은 위 구현·검증 기록 및 검증 보고서를 따른다.
