---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-05"
updated-at: "2026-11-10"
approved-by: "requesting-user"
approved-at: "2026-11-10"
approval-scope: "Core CC-009·CC-004·CC-007 및 필요한 문서·fixture·검사 갱신, 테스트, 커밋과 dev 대상 PR. Phase 2·병합·배포 제외."
completed-at: "2026-11-10"
verification-summary: "Core CC-009·004·007 구현; check·web 802·server 171·integration 180·build·fresh manifest·prod/dev DOM 각 146+25·실제 Next 저장 복구/Run 인수 통과. 별도 모바일 긴 이름 overflow 기존 실패 1건 보존."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/server.md"
  - "docs/architecture/pipeline-execution.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
---

# src 프런트엔드 클린 코드 검토 및 Core 개선 완료 기록

## Summary

승인된 **Core CC-009·004·007**을 구현하고 검증했다. Phase 2의 6건은 미선택이며 구현하지 않았다.
아래 최초 검토·Proposal·Execution Plan·reconciliation은 구현 전 판단을 보존한 기록이다.
구현 완료 여부는 front matter와 아래 Core Implementation Results 및 Completion or Closure Notes를 따른다.

`frontend-clean-code-orchestrator`의 여섯 독립 렌즈와 별도 중립 품질 게이트로 지정된
`src`를 검토했다. 원시 후보 12건 중 **Should 3건, Consider 6건**을 채택했다.
Must는 없으며, 최신 `dev`에서 이미 해결된 3건은 신규 개선 작업에서 제외했다.

우선 개선할 항목은 초안 복원 확인의 실패 응답 처리, 파이프라인 실행·중지·승인의
진행 상태 구분, 현재 화면에서 사용하지 않는 자동 Scout/Pick 웹 계약 정리다.
최초 작업은 검토와 제안서 작성이었으며 당시 제품 코드·테스트는 변경하지 않았다.
2026-11-05 코드베이스 대조에서 구현 목록·검증 목적지·비동기 복구 조건의 보완점을 발견해
아래 실행 계약에 반영했다. 2026-11-10에는 최신 dev의 소비자·검증 근거를 갱신하고 실제
브라우저 인수에서 확인한 gate 선택·응답 완료 대기 공백을 보완했다. 후속 전체 검증에서는
삭제 후 깨지는 근거 링크 5개를 각 문서의 원관측 커밋으로 보존하는 계약도 반영했다.
최초 clean-code 판정과 문서 정합성 검증은 구분한다.

| 우선순위 | ID | 개선 항목 | 기여 렌즈 |
| --- | --- | --- | --- |
| Should | CC-009 | 초안 복원 확인의 실패 envelope 처리 | TypeScript generalist |
| Should | CC-004 | 실행·중지·승인에 맞는 진행 상태와 문구 | Readability |
| Should | CC-007 | 폐기된 자동 Scout/Pick의 남은 웹 계약 정리 | Simplicity |
| Consider | CC-006 | 초안 dirty 판정을 기존 모델로 통일 | Simplicity |
| Consider | CC-002 | 실행 대상별 필수 데이터 조합을 타입·schema에 표현 | Predictability |
| Consider | CC-001 | GitHub 바인딩 쿠키 이름의 소유권 통일 | Cohesion |
| Consider | CC-008 | 실행 그래프 재사용 비교를 서버 모듈 내부에서 공유 | Simplicity |
| Consider | CC-005 | 보고 허용 조건을 긍정형 조건으로 풀기 | Readability |
| Consider | CC-003 | 실행 생성·전진을 공개 함수 이름에 표시 | Predictability |

현재 장애·데이터 손상·보안 우회를 재현했다는 결론은 없다. CC-009·004는 소스와 실제
호출 연결로 확인한 오류 처리·화면 피드백 문제이며, 나머지는 아래에 적은 유지보수 비용을
줄이는 제안이다. 자동 검사 통과는 이 개별 문제의 DOM·DB 인수 결과를 대신하지 않는다.

## Goal

- 요청의 업무 실패와 실제 진행 중인 동작이 화면에 일관되게 드러나게 한다.
- 현재 제품 화면과 공개 props·Action·시험의 기능 범위를 맞춘다.
- 같은 정책의 중복 정의와 입력·함수 이름에서 복원해야 하는 문맥을 줄인다.
- FSD·서버 경계, 요청 수명주기, 중복 제출 방지, legacy 실행 호환성을 보존한다.

## Proposal Size

`standard`. 전체 항목을 구현하면 5개 이상 파일, 웹 Action/public export 삭제,
입력 schema, 인증 관련 실패 처리, 서버 공개 함수 이름과 소비처에 영향을 준다.
문서 정합성 검토의 위험 분류는 **High-Risk**다. 세션 종료, Server Action 제거, 실행 원장·
버전 보존과 생성 manifest 검증에 닿기 때문이다. 저장소의 `proposal-size: standard`와는
별도 분류다. 사용자에게 설명한 UX 변화는 수용됐으며 후속 Core 구현 승인은 front matter에 기록한다. Phase 2는 미선택이다.

## Current State

### 최초 검토 기준과 환경 — 이력

| 항목 | 값 |
| --- | --- |
| 사용자가 지정한 원본 | `/Users/hamsangeok/Desktop/git/stagekeeper/src` |
| 원본 HEAD | `14d605599a92e8b242f7e20073281f97aa4d56c1` |
| 원본 src tree | `46bd4c22396f9f3e16e77055ea3cfe0911491246` |
| 해결 여부를 대조한 origin/dev | `3e69c5876f94b776a4b5c951e9254ba6f8f43a92` |
| 대조한 dev의 src tree | `306bebeccd94d5c8b9e1c2205385701f7519ac94` |
| 버전 차이 | 원본 작업 브랜치는 대조한 dev보다 40개 커밋 뒤에 있음 |
| 설치 환경 | Node `v26.4.0`, Next.js `16.4.2`, React `19.2.8`, TypeScript `5.9.3` |
| 타입·런타임 | `strict: true`, bundler module resolution, Next App Router/RSC |

원본의 추적 중인 소스는 검토 시작 시 깨끗했다. 기존 미추적 문서는 보존했다.
본문의 파일·줄 근거는 별도 표시가 없으면 **원본 HEAD 기준**이다. 최신 dev는 후보의
잔존·해결 여부만 대조했으며, 최신 dev 전체를 다시 검토하거나 그 버전에서 아래 검사를
실행한 것은 아니다.

### 현재 구현 기준 — 2026-11-10

이번 reconciliation의 구현 기준은 fetch해 확인한 origin/dev
`af8be6c1e1535aba982614a5a2e9a68425fc75a6`이며 src tree는
`389d6e03e92cbb86888aedbf3a7b6c4596a8ef01`이다. 아래 기존 발견 근거 링크의 줄 번호와
최초 집계는 원본을 보존한다. 실행 목록·공개 API·검증 목적지는 이 dev 기준으로 대조하고
격리 작업 트리에서 명령을 재실행했다. 기준 커밋 이후 변경이 있으면 해당 소스·소비자·
검증 목록을 재대조한다. 오래된 원본에 최신 계획을 그대로 적용하지 않는다.
직전 e2cc5f4 이후 제품 src·core·schema·의존성은 그대로이며 DB 검증 helper와 시험 연결
준비가 변경됐다. 현행 `scripts/lib/test-database.mjs`·`scripts/lib/prisma.ts`와 통합 runner/
support의 입력·정리 계약을 대조하고 아래 최신 Command Ledger를 다시 실행했다.

구현 source bundle은 이 제안서 하나이며 다른 제안서에 결정을 위임하지 않는다. 규범 입력은
같은 dev의 `AGENTS.md`, `docs/proposals/README.md`, `docs/proposals/template.md`,
`docs/architecture/{README,fsd,server,pipeline-execution,test-writing,test-organization,verification,protocol,template-releases}.md`,
`docs/conventions/product-copy.md`의 해당 계약이다. 중괄호는 각 명시 파일의 집합이다.
직접 코드·schema·fixture·명령 입력은 아래 Inventory와 V1–V9의 정확한 경로다.
최초 review의 완료 문서들은 배경이며 추가 구현 요구로 상속하지 않는다. 다만 I-007에
명시한 완료 문서 두 개의 근거 링크 목적지만 삭제 후에도 유효하도록 갱신한다. 해당 문서의
과거 판단·구현 계획·결과·metadata를 새 요구로 상속하거나 다시 작성하지 않는다.

| 영역 | 코드 파일 수 | 그중 테스트 | 코드 줄 | 검토 방식 |
| --- | ---: | ---: | ---: | --- |
| `src/app` | 50 | 0 | 973 | 진입점·route composition·서버/클라이언트 연결 |
| `src/fsd` | 294 | 77 | 12,163 | 전체 구조·패턴 탐색, 주요 상태·UI·adapter·소비 흐름 상세 확인 |
| `src/server` | 159 | 44 | 11,527 | 공개 경계·위험 패턴 탐색, 관련 서비스·소비 계약 추적 |
| `src/proxy.ts` | 1 | 0 | 7 | 인증 진입 경계 |
| 작성 코드 합계 | **504** | **121** | **24,670** | TS/TSX/MJS/CSS 기준 |
| 로컬 `src/generated` | 37 | 0 | 57,851 | 생성 코드 존재·소비 문맥만 확인; 직접 리팩터링 대상 아님 |

코드 집계 밖에 폰트 3개, 라이선스 2개, 폰트 README가 있다. 모든 파일의 모든 줄을
동일한 깊이로 검증한 것은 아니다. 전체 영역을 탐색한 뒤 후보와 실제 사용처·요구사항을
상세 추적했으며 서버 전체 도메인·보안·동시성 감사는 수행하지 않았다.

### 방법과 coverage

각 렌즈를 `fork_turns="none"`인 별도 에이전트로 실행했다. 같은 원본 대상·프로젝트
문맥·사용자 의도를 제공하고, 각 에이전트는 자신의 스킬과 필요한 분석 참조만 읽었다.
동시 실행 용량에 맞춰 두 배치로 진행했으며 이전 렌즈의 결과를 다음 렌즈에 전달하지 않았다.
중립 품질 게이트가 여섯 원시 출력과 원본·소비처·최신 dev를 대조해 1라운드에서 판정했다.

**Coverage: Full applicable-lens review — Applicable 6, gate-validated N/A 0.**

| 렌즈 | 게이트 상태 | 원시 후보 | 채택 기여 |
| --- | --- | ---: | --- |
| Cohesion | Completed | 2 | CC-001 |
| Coupling | No supported findings | 0 | 없음 |
| Predictability | Completed | 3 | CC-002·003 |
| Readability | Completed | 3 | CC-004·005 |
| Simplicity | Completed | 3 | CC-006·007·008 |
| TypeScript generalist | Completed | 1 | CC-009 |

Coupling은 적용 대상이 있지만 근거가 충분한 개선점을 찾지 못했다. 카드별 잠금 Context,
Action prop 전달, 서버 children 조합, token 발급 공통 폼과 repository picker의 연결된
수명주기를 단순히 파일 크기·전달 단계 수로 분리하지 않았다. N/A·Unavailable·Skipped,
수정 재요청, pending-verification, 미해결 충돌은 없다.

## Scope

포함 범위는 원본 `src`의 프런트엔드 클린 코드와 관련 소비·공개 계약이다.
`src/server`에 대해서도 관찰된 국소 타입·명명·조건·정책 중복을 평가하되 FSD layer를
강제로 적용하지 않는다. `packages/core`, 루트 `tests`, `scripts`, 아키텍처 문서는 계약과
후속 영향 범위를 확인하는 근거로만 참조했다.

생성 코드·바이너리 직접 수정, 새 전역 store·범용 mutation/dirty/equality 프레임워크,
새 의존성·폴더 구조 재설계, DB schema/legacy 실행 데이터 제거, 전체 보안·성능 감사는
제외한다. 이번 전체 재검증은 기준 소스의 로컬 명령 실행과 작업 전용 DB baseline 검사를
포함한다. 검토 단계에는 제품 코드 구현, 실제 GitHub·모델 사용, 운영 DB·커밋·PR·병합·배포를 포함하지 않았다.
후속 구현 요청에 따라 Core 3건과 필요한 문서·fixture·검사를 수정하고 테스트·커밋·dev 대상 PR을 수행한다.
Phase 2, 실제 GitHub·모델 사용, 운영 DB·병합·배포는 현재 구현 범위에서도 제외한다.
변경할 코드의 브라우저·DB 인수는 구현 후 완료 조건이며 현재 baseline과 구분한다.

### 구현 단계와 UX 경계

| 분류 | ID | 완료 범위 |
| --- | --- | --- |
| Core | CC-009·004·007 | 우선 권고한 오류 처리·진행 표시·미사용 웹 계약 정리와 해당 검증 |
| Phase 2 | CC-001·002·003·005·006·008 | 기존 Consider 항목. 선택한 ID만 구현하며 Core 완료 조건에 섞지 않음 |
| Approval-after | 없음 | 이번 문서 안에 외부 승인으로 미룬 기술 결정을 두지 않음 |
| Out of scope | 미선택 Phase 2와 운영 변경 | DB migration, template 활성화, 실제 GitHub·모델 사용, 배포·병합 제외 |

문서의 9건 모두 대조했으며 Phase 2 분류는 기존 선택적 권고를 명확히 한 것이다.
후속 구현 범위를 명시하지 않은 요청에서 선택적 항목까지 자동으로 수행하지 않는다.

사용자가 수용한 UX 범위는 CC-009의 실패 안내·401 시 재로그인 안내, CC-004의 작업별
진행 문구, CC-002를 선택했을 때 비정상 board 입력의 오류 문구 변화다. CC-009는 자동
로그인 이동이 아니라 기존 `NewProjectForm`의 폼 대체 화면이다. CC-002는 null timestamp가
후단의 stale 대신 Action의 `Check the selected work and try again.`으로 거부될 수 있다.
정상 실행 입력과 다른 여섯 항목에는 의도한 UX 변화가 없다. CC-007은 이미 렌더하지 않는
웹 표면만 제거하며 현재 Run rules·Run·승인·중지와 legacy 저장 데이터를 유지한다.
아래 §18 문구 원본 정합성 작업도 현행 표시·정렬을 보존하는 문서 동기화이며 새 UX 변경이 아니다.

## Proposal

### Should — CC-009: 초안 복원 확인의 실패 envelope 처리

기여 렌즈: **TypeScript generalist**. 신뢰도: 높음. 최신 dev에도 동일하게 남아 있다.

근거는 [acknowledge:149](../../../src/fsd/features/create-project/model/use-repository-picker.ts#L149),
[요청 반환 계약:17](../../../src/fsd/features/create-project/api/repository-picker.ts#L17),
[인증·제한 응답:18](../../../src/app/api/github/request.ts#L18),
[세션 종료 화면:48](../../../src/fsd/features/create-project/ui/new-project-form.tsx#L48)이다.

`repositoryPickerRequest`는 유효한 실패 envelope를 `{ ok: false, code, message, retryAfter }`로
반환한다. 복원 확인 `acknowledge()`는 성공 시 저장 키를 지우는 분기와 예외 `catch`만 가진다.
따라서 429·503은 확인 실패 안내가 없고, 401도 같은 hook의 다른 요청들이 사용하는
`lostSession()`으로 연결되지 않는다. 이는 정상 실패 반환을 소비자가 빠뜨린 문제다.

**최소 변경:** 응답이 현재 flow에 속하는지 먼저 확인하고 `!result.ok`를 분기한다.
`UNAUTHENTICATED`는 기존 세션 종료 경로로 연결한다. 나머지 실패는 기존 복원 확인 실패
문구를 표시하고 재시도용 저장 키를 보존한다. 새 전역 오류 처리 계층은 필요 없다.

응답 적용 조건은 effect의 생존 여부, 요청을 시작한 `flowGeneration`, 현재 `flowKey`의
값과 복원된 `flowId` 일치다. 성공·업무 실패·예외 모두 이전 flow의 결과를 현재 UI에
적용하지 않는다. effect 정리에서 자신의 요청을 abort하고, 요청 helper의 timeout/listener
정리를 유지한다. storage 접근 실패는 기존 확인 실패 안내로 처리하되 성공으로 키를 지우지 않는다.
`lostSession`을 참조하는 effect의 의존성도 갱신하며 안정된 callback을 유지한다.

429·503 후 자동 재전송·새 Retry 버튼·목록용 cooldown 정책은 추가하지 않는다. 현재 mount의
복원된 입력은 계속 사용할 수 있다. 같은 사용자로 다시 열었을 때는 남은 flow 키로 GET을
시도하지만, 서버에 유효한 초안이 남아 있을 때만 복원과 POST 확인을 다시 수행할 수 있다.

`store.server.ts`의 `acknowledge`는 일치하는 id/user/browser/generation의 `draft`를 즉시
null로 만든다. POST가 commit된 뒤 응답이 유실되거나 200 수신 후 local key 제거가 실패하면
키는 남아도 서버 초안은 없을 수 있다. 이 경우 재진입의 `connectionDraft`는 null을 반환하고
`applied`가 생기지 않아 POST를 다시 보내지 않는다. 기존 in-memory 입력의 보존과 reload
이후의 복원은 구별하며, 새 mount에서 입력이 다시 복원된다고 약속하지 않는다. 사용자는
기존 정상 폼에서 수동 입력·새 연결 흐름을 사용할 수 있다. GET-null만으로 local key를 지우는
새 정책이나 서버 초안의 보관 기간 연장은 추가하지 않는다. 복원할 수 없는 현재 입력은
기존 restore/cancel 우선순위를 따른다.
401은 기존 폼 unmount·세션 안내로 종료하며, 이후 로그인·재진입은 현재 사용자 키로 복구한다.
서버 `acknowledgeDraft`의 id/generation·user/browser 결합과 멱등 처리도 변경하지 않는다.

**확인할 계약:** POST `/connection/draft`의 401·429·503·network failure를 구분한다.
401에서는 기존 세션 종료 화면을 확인한다. 복원 폼 내용 보존은 429·503·network failure에
적용하며, 401에서도 폼을 계속 표시하라는 요구로 바꾸지 않는다. 실패 시 저장 키 보존,
성공 시 해당 키 제거, 이전 flow의 늦은 응답이 현재 화면을 바꾸지 않는지도 확인한다.
POST 전 실패로 서버 초안이 남은 경우와 commit 후 응답 유실/200 뒤 storage 제거 실패로
GET-null이 되는 경우를 나눠 검증한다. 후자는 fake 서버의 `draft = null`과 flow 키를 유지한 채
client만 unmount/remount하고, 복원·추가 POST가 없으며 정상 수동 입력은 가능한지 확인한다.
서버 fixture·sessionStorage를 remount마다 새 초안으로 초기화해 실패를 가리지 않는다.
[기존 fixture:138](../../../tests/server/fixtures/github-picker-browser.ts#L138)는 이 POST를
항상 성공시키므로 기존 GET draft 실패 시험만으로 이 회귀를 검증할 수 없다.

### Should — CC-004: 실행·중지·승인의 진행 상태 구분

기여 렌즈: **Readability**. 신뢰도: 높음. 최신 dev에도 동일하게 남아 있다.

근거는 [상태:16](../../../src/fsd/features/edit-pipeline/ui/pipeline-run-panel.tsx#L16),
[세 핸들러:38](../../../src/fsd/features/edit-pipeline/ui/pipeline-run-panel.tsx#L38),
[버튼 문구:107](../../../src/fsd/features/edit-pipeline/ui/pipeline-run-panel.tsx#L107)와
[실제 Action 연결:34](../../../src/app/(app)/p/[slug]/pipeline/page.tsx#L34)이다.

`stop`, `approve`, `start`는 모두 같은 `pending` Boolean을 켠다. 이 값이 Start 버튼의
`Starting…` 문구를 선택하므로 중지·승인 중에도 시작 중이라고 표시한다. 코드를 읽을 때도
어떤 작업이 진행 중인지 세 핸들러를 함께 추적해야 한다. mutation의 실행 자체가
잘못됐다는 주장은 아니다.

**최소 변경:** 이 컴포넌트 안에서 `null | "starting" | "stopping" | "approving"`으로
진행 작업을 구분하고 공통 잠금 여부를 파생한다. 해당 작업의 버튼만 맞는 진행 문구를
표시한다. 표시 문구는 start의 `Starting…`, stop의 `Stopping…`, approve의
`Approving ${gateLabel(projectRun.node)}…`로 정한다. idle 문구는 그대로다.
`pending = operation !== null`을 모든 기존 disable·guard와 `PipelinePanel.busy`에 적용한다.
기존 중복 제출 ref, unmount 보호, unknown 이후 재시도 차단은 보존한다.
`docs/conventions/product-copy.md` §18과 실제 DOM 기대값을 같은 변경에서 맞춘다.
`frontend-ux-acceptance.ts`의 세 작업 모두 `Starting…`을 요구하는 기존 assertion은 작업별로
바꾸며, pending의 Close/Escape 잠금·unknown 후 Close 가능·재진입 prepare를 함께 유지한다.

**확인할 계약:** 제어 가능한 Promise와 실제 DOM으로 세 동작 각각의 문구, 전체 컨트롤
잠금, 중복 제출 방지, 성공·업무 실패·응답 유실 이후 복구를 관찰한다. 정적 렌더 검사로
pending 검증을 대신하지 않는다. 범용 mutation hook이나 새 slice를 만들지 않는다.

### Should — CC-007: 폐기된 자동 Scout/Pick의 남은 웹 계약 정리

기여 렌즈: **Simplicity**. 판정: 개선 권장. 원칙: YAGNI·KISS. 신뢰도: 높음.

근거는 [필수 Action 타입:18](../../../src/fsd/features/edit-pipeline/ui/pipeline-list.tsx#L18),
[route binding:25](../../../src/app/(app)/p/[slug]/pipeline/page.tsx#L25),
[Pick 컨트롤:6](https://github.com/Sangeok/stagekeeper/blob/14d605599a92e8b242f7e20073281f97aa4d56c1/src/fsd/features/edit-pipeline/ui/automatic-pick-control.tsx#L6),
[Scout 컨트롤:11](https://github.com/Sangeok/stagekeeper/blob/14d605599a92e8b242f7e20073281f97aa4d56c1/src/fsd/features/edit-pipeline/ui/automatic-scout-control.tsx#L11),
[client 공개 API](../../../src/fsd/features/edit-pipeline/index.ts),
[server 공개 API](../../../src/fsd/features/edit-pipeline/index.server.ts),
[Pick Action:35](https://github.com/Sangeok/stagekeeper/blob/14d605599a92e8b242f7e20073281f97aa4d56c1/src/fsd/features/edit-pipeline/api/pipeline-settings.server.ts#L35),
[Scout Action:9](https://github.com/Sangeok/stagekeeper/blob/14d605599a92e8b242f7e20073281f97aa4d56c1/src/fsd/features/edit-pipeline/api/automatic-scout.server.ts#L9)이다.

[현재 실행 모델](../../architecture/pipeline-execution.md)은 Discover work·Assign work를
일반 노드로 실행하며 별도 전역 스위치를 사용하지 않는다. 실제 Run rules는 기본 선택과
유형별 예외만 렌더하지만 `setAutomaticPick`은 필수 callback으로 남아 route에서 전달된다.
두 예전 컨트롤에는 제품 렌더 소비자가 없고 시험·fixture·공개 export가 남아 있다.
현재 화면을 조합하고 검증할 때 지원하지 않는 웹 기능 표면까지 이해해야 한다.

**최소 변경:** 남아 있는 웹 props/binding, 미사용 UI/export/Action과 해당 시험·fixture를
함께 정리한다. legacy 동작 검증은 그 동작의 서버/core 소유 범위에 보존한다.
삭제 파일을 가리키는 현재 제안서와 완료 문서의 근거 링크는 I-007의 원관측 커밋 고정
목적지로 보존한다. 문서 검사를 끄거나 과거 기술 판단을 고쳐 삭제를 정당화하지 않는다.
`Project.autoScoutEnabled`·`autoProposeEnabled`, 저장되지 않은 Default의 초기 변환,
과거 실행·템플릿, 서버 호환 API는 삭제하지 않는다.

삭제·수정의 정확한 범위는 I-007이다. 특히 `frontend-ux-boundaries.test.mjs`가 다섯 settings
Action을 요구하고 `pipeline-save.test.ts`가 Scout manifest 등록을 요구하는 기존 계약을
네 settings Action 및 두 제거 Action의 부재 검사로 바꾼다. 검사 자체를 비활성화하지 않는다.

최신 dev는 이미 page의 scout props와 page/list/panel의 `autoProposeEnabled`·
`automationControls`를 제거했다. 그것을 다시 작업에 넣지 않는다. 이번 제안은 남아 있는
필수 `setAutomaticPick`, route binding, 두 컨트롤·export·웹 Action에 한정한다.

유지는 현재 사용하지 않는 웹 계약과 시험 비용을 남긴다. 국소 정리는 실제 제품 표면과
시험을 맞춘다. 스위치를 다시 표시하거나 현재 Run 제어와 공통화할 요구는 없다.
`protocol.md`의 예전 Pipeline 탭 스위치 설명도 현행 `pipeline-execution.md`와 맞추되
legacy 데이터 보존 설명과 구분해야 한다.

**확인할 계약:** `pipeline-settings`, `automatic-scout-actions`, `project-guard`,
`pipeline-save` 시험과 `src-clean-code-browser`·관련 rehearsal 소비 관계를 함께 확인한다.
변경 후 fresh build에서 Action 노출을 확인하고 현재 Run rules, 프로젝트 실행 승인·중지,
legacy Default 변환을 각각 검증한다. 소비자 부재만으로 서버 기능까지 삭제하지 않는다.

#### CC-007에 포함하는 Pipeline 문구 원본 정합성

`docs/conventions/product-copy.md`는 코드보다 우선하는 문구 원본이지만 §18의 일부 문장은
현행 Pipeline 카탈로그·버전 표시·노드 명칭과 충돌한다. 기존 UI를 보존한다는 승인 범위를
따라 **아래 현행 계약을 §18에 먼저 명시하고 같은 구현 변경에서 정합성을 확인한다.**
예전 문장을 근거로 화면·정렬을 되돌리지 않는다. 이는 §18의 확인된 충돌을 해소하는 작업이며
문구 원본의 일반적인 우선순위 규칙이나 다른 절의 계약을 폐기하는 예외가 아니다.

| §18에서 교체할 지시 | 보존할 현행 계약 | 코드 소유자 |
| --- | --- | --- |
| `Pipelines` 목록에 Default/Runs items/Used inside 배지를 표시한다는 설명 | 목록 제목은 `All pipelines`. 이름·펼친 단계 요약·step 수로 탐색하며 `Runs items`·`Used inside` 배지는 없다. `Default`는 실제 pipeline 이름/기본 선택 값으로 계속 표시될 수 있다 | `src/fsd/features/edit-pipeline/ui/pipeline-list.tsx`, `ui/pipeline-catalog.tsx` |
| default → 생성 시각 → id의 카탈로그 정렬 | 카탈로그는 `catalogEntries`의 `name.localeCompare` 순서를 보존한다. 서버 조회·Run rules 옵션·저장 순서를 새로 바꾸지 않는다 | `src/fsd/features/edit-pipeline/model/pipeline-catalog.ts` |
| 저장 버전의 `applies to items proposed from now on` 및 옛 미저장 안내 | 저장본은 `Version … · saved … · changes apply to future runs.`, 가상 Default는 `Initial configuration · changes apply to future runs.`, 새 초안의 상태 줄은 `Not saved yet`. 버전/상대 시각 계산과 별도 제목은 그대로다 | `src/fsd/features/edit-pipeline/ui/pipeline-list.tsx` |
| 화면 노드·반복 슬롯의 `Scout` 및 `auto → scout` 표기 | 화면은 `Discover work`, 반복 번호를 유지한 `Discover work #2`, edge의 `auto → discover work` 형식이다. 다른 노드 명칭은 기존 mapper를 유지한다 | `src/fsd/entities/pipeline/model/labels.ts`의 `nodeLabel`·`autoEdgeLabel`·`gateLabel` |
| 옛 `No gate: plan and implementation start …` 경고 | `No approval gates: these steps continue automatically once the run starts.`를 유지한다. 게이트 없는 저장의 확인 단계와 `Save without a gate` 버튼 동작은 그대로다 | `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` |
| 참조 삽입/열기의 `Use <name> here`·`Edit <name>`와 Add/Use 명칭 | 삽입 메뉴는 `Add step`/`Insert pipeline`, 선택지는 `Insert pipeline: <name>`, 참조 카드의 버튼은 `Open pipeline`을 유지한다 | 같은 rail의 moves·삽입 메뉴·`ReferencedPipelineCard` |

`…`와 `<name>`는 현재 동적 값 자리의 설명이며 그대로 출력할 새 문구가 아니다.
이 표의 `ui/pipeline-catalog.tsx`는 `src/fsd/features/edit-pipeline/` 아래 파일이다.
실행자 ID인 `scout`·`feature-scout`·`work-discoverer`, 호환 alias와 `Swap` 설명의 내부 ID,
다른 문서 절과 과거 완료 기록의 판정·서술은 변경하지 않는다. 근거 링크 목적지는 I-007의
명시된 예외만 적용한다. `Scout`를 전역 금지 문자열로 등록하지 않는다.
`pipeline-save-recovery` copy-lock과 기존 stale/unknown 복구 문구도 유지한다.
CC-004의 새 진행 문구 세 개는 같은 §18에 함께 기록하되, 그 외 현재 문구·동작은 바꾸지 않는다.

### Consider — CC-006: 초안 dirty 판정을 기존 모델로 통일

기여 렌즈: **Simplicity**. 판정: 선택적 개선. 원칙: DRY·KISS. 신뢰도: 중복 사실에 높음.

근거는 [모델 비교:21](../../../src/fsd/features/edit-pipeline/model/pipeline-draft-state.ts#L21),
[Save용 dirty:45](../../../src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx#L45),
[부모 보고:104](../../../src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx#L104),
[부모 소비:49](../../../src/fsd/features/edit-pipeline/ui/pipeline-list.tsx#L49)이다.

Save 버튼은 `isPipelineDirty`의 steps·gates·selectionPolicy 비교를 사용하지만 Run 버튼과
이탈 확인에 전달하는 값은 definition 전체를 `JSON.stringify`로 비교해 계산한다.
현재 입력에서 실제 불일치는 재현하지 않았다. 동일한 초안 변경 규칙을 두 곳에서 관리하는
비용과 필드별 의미 비교·전체 직렬화 비교의 차이가 개선 근거다.

**최소 변경:** 이벤트에서 `editPipelineDraft`로 구한 다음 초안 상태를 `isPipelineDirty`로 평가해
부모에게 전달한다. 기존 baseline/request reconciliation을 우회하지 않는다. state updater 안에서
부모 callback을 호출하는 부수효과를 추가하지 않는다. 기존 구현을 유지하면 비교 두 개를
계속 관리해야 하고, 기존 모델 재사용은 새 hook 없이 그 비용을 줄인다. 다른 feature용
범용 dirty-state 추상화는 필요 없다. 최신 dev에도 이 별도 비교가 남아 있다.

**확인할 계약:** 변경 후 원복, selectionPolicy 편집, version 0 snapshot, 저장 중 새 snapshot,
stale/unknown 복구에서 Save·Run·이탈 확인의 판정이 일치해야 한다. 기존 draft 모델 시험과
pipeline 브라우저 인수를 활용한다.

### Consider — CC-002: 실행 대상별 필수 데이터 조합 표현

기여 렌즈: **Predictability**. 신뢰도: 높음. 최신 dev에도 남아 있다.

근거는 [프런트엔드 타입·schema:4](../../../src/fsd/features/edit-pipeline/model/run-pipeline-input.ts#L4),
[서버 계약:10](../../../src/server/pipeline/run-request.ts#L10),
[생성부:42](../../../src/server/pipeline/run-request.ts#L42),
[입력 조립:65](../../../src/fsd/features/edit-pipeline/ui/pipeline-run-panel.tsx#L65),
[서버 timestamp 거부:413](../../../src/server/pipeline/board-service.ts#L413)이다.

board 대상의 생산자는 agent·updatedAt을 채우고 backlog에는 null을 넣는다. 그러나
`RunTarget`은 kind와 무관하게 nullable 필드를 허용하고, 입력 schema도 board의 null
timestamp를 허용한다. 호출자는 종류별 불변식을 타입 대신 주변 분기에서 알아야 하며,
잘못된 board timestamp는 후단에서 stale 오류로 거부된다. 서버가 잘못된 쓰기를 막고 있어
현재 저장 결함으로 분류하지 않는다.

**최소 변경:** `RunTarget`을 kind 기반 union으로 좁히고 입력 schema에 board timestamp의
필수성을 반영한다. UI 입력 조립을 종류별로 명시한다. 서버의 직접 호출 입력 타입과
재검증도 함께 대조하되 FSD가 서버 내부 타입을 직접 import하게 만들지 않는다.

**확인할 계약:** 두 정상 종류, board timestamp 누락·null 거부, 기존 정상·stale 직접 실행을
검증한다. 타입·schema의 경계 사례와 기존 `pipeline-direct-run` 시험을 활용한다.

`RunTarget`의 board 가지는 agent·updatedAt 문자열, backlog 가지는 두 값 null을 명시한다.
`StartPipelineInput`은 공통 필드를 유지하고 board의 `expectedUpdatedAt`을 ISO datetime,
backlog의 값을 null로 좁힌다. 두 종류 모두 실제 assignee 문자열을 전송한다. 서버의
`run-request.ts` 선언도 대응시키되 `createBoardService.startPipeline`의 소유권·그래프 해시·
최신 행·timestamp 재검증은 남긴다. 신규 schema 시험과 Action 경계 시험은 I-002/V2가 소유한다.

### Consider — CC-001: GitHub 바인딩 쿠키 이름의 소유권 통일

기여 렌즈: **Cohesion**. 신뢰도: 높음. 최신 dev에도 동일하게 남아 있다.

근거는 [API의 쿠키 선택·생성:34](../../../src/app/api/github/request.ts#L34)와
[초기 폼의 쿠키 조회:6](../../../src/fsd/features/create-project/api/repository-picker.server.ts#L6)이다.
두 경로가 `__Host-stagekeeper-github`·`stagekeeper-github`를 각각 정의한다.
이름 변경 시 한 경로만 갱신할 유지보수 위험이며 현재 장애·보안 문제를 뜻하지 않는다.

**최소 변경:** 기존 GitHub 서버 공개 API를 통해 이름 계약만 공유한다. API의 origin별
선택·형식 검증·생성과 폼의 두 이름 fallback 정책은 각각 보존한다. 범용 cookie abstraction은
필요 없다. 새 `src/server/github/browser-binding-cookies.ts`가
`GITHUB_BROWSER_BINDING_COOKIES`의 `secure`·`insecure` 두 이름을 소유하고,
`src/server/github/api.server.ts`에서 명시적으로 재수출한다. 두 기존 서버 adapter만 이
공개 API를 소비한다. `contracts.ts`에는 값 export를 넣지 않는다.
기존 `github-connection.test.ts`와 `github.test.ts`의 VM 의존성에도 이 공개 상수를 공급한다.
실제 public export를 읽을 때는 기존 `tests/server/fixtures/load-module.ts`로
`src/server/github/api.server.ts`를 읽고 `@/server/db`를 stub으로 주입한다. 실제 API 서비스
함수를 호출하거나 DB singleton을 직접 import하지 않아 기존 시험 격리를 유지한다. HTTP/HTTPS 쿠키 선택·
재사용·flags와 초기 폼의 secure 우선 fallback을 검증하며 import 문자열만 고정하지 않는다.

### Consider — CC-008: 실행 그래프 재사용 비교 공유

기여 렌즈: **Simplicity**. 판정: 선택적 개선. 원칙: DRY·KISS. 신뢰도: 정책 중복에 높음.

근거는 [저장 비교:25](../../../src/server/pipeline/save-definition.ts#L25),
[저장 소비:59](../../../src/server/pipeline/save-definition.ts#L59),
[실행 시작의 비교:180](../../../src/server/pipeline/run-service.ts#L180)이다.
두 경로가 format, 순서 있는 nodes, 순서 없는 gates, selectionPolicy 기본값 정규화로
실행 버전 재사용 여부를 정한다. 한쪽은 배열·Set 비교, 다른 쪽은 정렬·직렬화 비교다.
현재 유효한 그래프에서 결과가 다르다는 결함은 확인하지 않았다.

**최소 변경:** 새 `src/server/pipeline/execution-graph-equality.ts`의
`hasSameExecutionGraph(before, after)`를 `save-definition.ts`와 `run-service.ts`에서 상대
경로로 사용한다. `before.format === SLOT_FORMAT`, nodes의 순서·값, 정렬한 gates의 값·개수,
`selectionPolicy ?? DEFAULT_SELECTION_POLICY`가 같을 때만 true다. 배열은 복사해 정렬한다.
현재 저장 경로는 `loadPipelinesViewIn`의 `validateGraph`를 통과한 runnable만 비교하며,
실행 경로는 펼친 graph 검증을 먼저 한다. 이 선행 조건을 유지하면 Set 비교와 정렬 비교의
유효 입력 결과가 일치한다. 중복 gates가 있는 저장 행은 실행 경로에서 재사용하지 않는다.
서버 pipeline 모듈 내부의 목적이 좁은 순수 비교 함수만 공유한다.
현재 구현은 짧고 지역적이라는 장점이 있지만 같은 정책 변경 지점이 둘이다. 국소 공유로
그 비용을 줄이고, 프런트엔드 dirty 비교와의 통합·core 이동·public API 확대는 하지 않는다.
최신 dev의 주변 template pinning 변경을 보존하며 비교 자체만 정리한다.

**확인할 계약:** 동일 그래프 재사용, nodes 순서 변경, gates 순서만 변경, 정책 누락과
기본값, 정책 변경, format 변경을 대조한다. 중복 gates의 기존 거부와 실제 버전 생성 수를
보존해야 한다. DB 결과는 격리된 저장·직접 실행 시험으로 확인한다.

### Consider — CC-005: 보고 허용 조건을 긍정형으로 풀기

기여 렌즈: **Readability**. 신뢰도: 가독성 관찰에 높음.

근거는 [QA 조건:620](../../../src/server/pipeline/board-service.ts#L620)과
[impl-verifier 조건:628](../../../src/server/pipeline/board-service.ts#L628)이다.
두 조건은 null 검사·부정·verdict별 단계·성공 verify 원장을 한 식에서 해석하게 한다.
현재 판정 오류는 확인하지 않았으며 성공/실패/차단 보고의 서로 다른 요구를 바꿀 때의
독자 부담이 개선 근거다. 최신 dev에서도 같은 조건이 629·637행에 남는다.

**최소 변경:** 각 분기에서 run 부재를 먼저 거부하고 긍정형 조건에 이름을 붙인다.
QA와 impl-verifier의 계약 차이를 유지하며 공통 검증기로 합치지 않는다. 공개 API·파일
이동은 필요 없다. 기존 `qa-verifier`·`impl-verifier`의 pass/fail/blocked·stale entry 회귀를
재사용하고, 조건식을 복제한 새 시험은 추가하지 않는다.

### Consider — CC-003: 실행 생성·전진을 공개 함수 이름에 표시

기여 렌즈: **Predictability**. 부수효과 근거 신뢰도는 높고 향후 오용 가능성은 중간이다.

근거는 [ensureRunIn:162](../../../src/server/pipeline/run-service.ts#L162),
[nextFor:263](../../../src/server/pipeline/run-service.ts#L263),
[headFor:289](../../../src/server/pipeline/run-service.ts#L289),
[프로젝트 실행 전진:51](../../../src/server/pipeline/work-run.ts#L51),
[MCP 소비:66](../../../src/server/mcp/deps.ts#L66)이다.
`nextFor`는 실행 생성·currentRunId 연결을 할 수 있고 `headFor`는 프로젝트 실행을
생성·종료·전진한다. 이름과 반환값만으로 변경 책임을 파악하기 어렵다.

**최소 변경:** `nextFor`를 `ensureItemRunAndGetNext`, `headFor`를
`advanceProjectWorkAndGetNext`, 내부 `projectWorkNext`를 `advanceProjectWork`로 바꾼다.
공개 API·소비처·시험·문서는 I-003의 목록을 함께 갱신한다. 기존 함수 이름 alias는 남기지 않는다.
세 함수의 기존 인자 순서와 `context: TemplateRunContext = {}`를 그대로 전달한다.
MCP 도구 이름 `pipeline_next`, deps의 wire 계약, 응답 shape·template metadata·transaction·
진행 정책은 그대로 둔다. 읽기 API `loadExecutionFacts`에는 변경 함수 의존성을 추가하지 않는다.

현재 웹 조회는 이미 `loadExecutionFacts`로 분리되어 있고 실제 소비자는 MCP다.
품질 게이트는 원시 Should를 **Consider로 낮췄다**. 현행 UI 결함이 아닌 API 사용 시의
문맥 부담을 줄이는 선택적 정리다. 최신 dev의 template context·pinning 인자를 보존하고,
기존 materialization·owner-gate·pipeline 회귀와 타입·경계 검사로 연결을 확인한다.

## Affected Files — Concrete Inventory

모든 경로는 구현 기준 dev의 저장소 루트 기준이다. `I-` 번호는 CC와 같고 V1–V9가 검증
목적지를 명시한다. 아래 생성 대상 4개는 현재 부재하고 부모 디렉터리가 존재하며 충돌이
없음을 확인했다. 삭제 대상은 현재 존재한다. 실행 직전에도 충돌·사용자 변경을 다시 확인한다.

| ID / 단계 | 정확한 제품 수정·생성 경로 | 공개 경로·보존 경계 | 검증 |
| --- | --- | --- | --- |
| I-009 / Core | 수정 `src/fsd/features/create-project/model/use-repository-picker.ts` | 기존 `api/repository-picker.ts`, `ui/new-project-form.tsx`, `src/app/api/github/connection/draft/route.ts`, `src/server/github/draft-service.ts`는 계약 보존 | V9 |
| I-004 / Core | 수정 `src/fsd/features/edit-pipeline/ui/pipeline-run-panel.tsx`, `docs/conventions/product-copy.md` §18 | `PipelinePanel.busy`, 현재 5개 Run Action, 기존 route binding 유지 | V4 |
| I-006 / Phase 2 | 수정 `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx` | 기존 `model/pipeline-draft-state.ts`의 `editPipelineDraft`·`isPipelineDirty` 상대 import; `ui/pipeline-list.tsx`가 소비하는 Boolean 의미 보존 | V6 |
| I-002 / Phase 2 | 수정 `src/fsd/features/edit-pipeline/model/run-pipeline-input.ts`, `ui/pipeline-run-panel.tsx`, `src/server/pipeline/run-request.ts`; 생성 `src/fsd/features/edit-pipeline/model/run-pipeline-input.test.ts`, `tests/server/pipeline-run-actions.test.ts` | FSD와 서버 선언은 각 소유 영역에 유지. `api/run-pipeline.server.ts`가 기존 schema를 소비하고 board-service는 서버 재검증 유지 | V2 |
| I-001 / Phase 2 | 생성 `src/server/github/browser-binding-cookies.ts`; 수정 `src/server/github/api.server.ts`, `src/app/api/github/request.ts`, `src/fsd/features/create-project/api/repository-picker.server.ts`, `docs/architecture/server.md` 공개 symbol 목록 | 상수 owner → `github/api.server.ts` 명시 export → 두 서버 adapter. 쿠키를 만들거나 읽는 정책은 이동하지 않음 | V1 |
| I-008 / Phase 2 | 생성 `src/server/pipeline/execution-graph-equality.ts`; 수정 `src/server/pipeline/save-definition.ts`, `src/server/pipeline/run-service.ts` | 순수 helper를 두 내부 소비자가 상대 import. `pipeline/api.ts`·core·FSD에 export하지 않음 | V8 |
| I-005 / Phase 2 | 수정 `src/server/pipeline/board-service.ts`의 QA/impl-verifier 조건 두 곳 | 기존 run/entry·accepted verify·오류 문구·쓰기 이전 거부 순서·template pinning 보존 | V5 |
| I-003 / Phase 2 | 수정 `src/server/pipeline/run-service.ts`, `src/server/pipeline/work-run.ts`, `src/server/pipeline/api.ts`, `src/server/mcp/deps.ts`, `src/server/mcp/owner-deps.ts`, `docs/architecture/server.md`, `docs/architecture/verification.md`, `scripts/rehearsals/rehearse-pipeline-smoke.ts` | owner → 명시 public export → MCP/운영 소비자. 내부 위임은 상대 import. 외부 MCP 이름·응답은 유지. verification의 pipeline-smoke 설명도 새 함수 이름으로 갱신 | V3 |

I-002 표의 `ui/pipeline-run-panel.tsx`와 `api/run-pipeline.server.ts`, I-006의 `model/`·`ui/`는
모두 `src/fsd/features/edit-pipeline/` 아래 파일이다. 임의의 새 slice·barrel은 만들지 않는다.

### I-007 / Core: 삭제·수정·보존 목록

삭제할 파일은 다음 7개로 한정한다.

- `src/fsd/features/edit-pipeline/ui/automatic-pick-control.tsx`
- `src/fsd/features/edit-pipeline/ui/automatic-pick-control.test.ts`
- `src/fsd/features/edit-pipeline/ui/automatic-scout-control.tsx`
- `src/fsd/features/edit-pipeline/ui/automatic-scout-control.test.ts`
- `src/fsd/features/edit-pipeline/api/automatic-scout.server.ts`
- `tests/server/automatic-scout-actions.test.ts`
- `scripts/rehearsals/rehearse-automatic-scout.ts`

다음 파일에서는 해당 계약·참조만 수정한다. 다른 기능의 테스트·보호 조건은 유지한다.

| 경로 | 변경 |
| --- | --- |
| `src/fsd/features/edit-pipeline/ui/pipeline-list.tsx` | `PipelineSettingsActions.setAutomaticPick` 제거; 나머지 4개 member 유지 |
| `src/app/(app)/p/[slug]/pipeline/page.tsx` | `setAutomaticPickAction` import/bind 제거 |
| `src/fsd/features/edit-pipeline/api/pipeline-settings.server.ts` | `setAutomaticPickAction`와 서버 함수 import 제거; 다른 4개 Action 유지 |
| `src/fsd/features/edit-pipeline/index.ts`, `index.server.ts` | `AutomaticScoutControl`, `SaveAutomaticScoutAction`, `saveAutomaticScout`, `setAutomaticPickAction`만 제거 |
| `src/fsd/features/edit-pipeline/ui/pipeline-list.test.ts`, `src/fsd/pages/project-pipeline/ui/project-pipeline-page.test.ts` | 삭제된 callback fixture 제거, 실제 렌더 계약 유지 |
| `tests/server/pipeline-settings.test.ts`, `tests/server/project-guard.test.ts` | 삭제된 Action case·mock·source 경로 제거; 남은 Action의 권한/거부 무변경 검사 유지 |
| `scripts/checks/frontend-ux-boundaries.test.mjs` | settings member 4개 확인, 제거 symbol의 route/public API 부재 확인; 삭제한 Scout 시험의 `routerTests` 등록 제거 |
| `tests/server/pipeline-save.test.ts` | 아래 manifest의 유지 10개·제거 2개·draft 비공개 계약 검사 |
| `tests/server/fixtures/src-clean-code-browser.tsx` | Scout import/fixture/mode 및 dummy callback 제거. 아래 유지 시험의 SearchParamsContext·URL/history·초기 snapshot 전제를 맞춘다. pipeline·GitHub·token·기타 mode 유지. 새 `item-actions` mode와 DocumentsFixture의 `discard` 전달도 보존 |
| `tests/server/fixtures/src-clean-code-acceptance.ts` | 독립 Scout 토글 사례 제거. 아래 현재 편집 진입·표시 selector·노드/삽입 위치 전제로 dirty/snapshot/CAS/응답 순서 사례를 보존 |
| `tests/server/fixtures/multiple-pipelines-browser.tsx`, `tests/server/fixtures/frontend-ux-browser.tsx` | settings fixture의 미사용 callback만 제거 |
| `scripts/rehearsals/rehearse-src-clean-code.ts` | Scout Action ID 요구·호출 계수 제거. `/pipeline-state`의 legacy flag 읽기는 보존; graph-save 전후 응답 유실·정리 유지 |
| `scripts/rehearsals/rehearse-multiple-pipelines.ts` | 기존 8개 mutation 중 Pick만 제거해 7개 유지. guest는 남은 `setPipelineRuleAction`으로 검증. `Runs items`·`Automatic picking`/off의 양성 본문 기대를 부재 검사로 교체. 현재 `All pipelines`·`Run rules`·저장된 pipeline 이름·무쓰기 GET 검증 유지 |
| `docs/conventions/product-copy.md` §18 | 위 표의 카탈로그·정렬·버전/미저장·노드/edge·경고·참조 버튼 지시를 현행 계약으로 동기화. CC-004의 진행 문구 반영과 함께 처리 |
| `src/fsd/features/edit-pipeline/model/pipeline-catalog.test.ts`, `src/fsd/pages/project-pipeline/ui/project-pipeline-page.test.ts`, `src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs` | 아래 V7의 구별 가능한 정렬·상태 줄·경고/참조 표시 사례를 기존 시험에 보완. 제품 UI를 바꾸는 시험은 아님 |
| `docs/architecture/protocol.md`, `docs/architecture/verification.md` | 옛 스위치 설명·삭제한 rehearsal 명령·두 Action 등록 요구를 현재 계약으로 변경. multi-pipeline HTTP mutation 수를 7로 맞춤 |
| `docs/proposals/active/src-frontend-clean-code-review.md`, `docs/proposals/completed/2026-10-15-fsd-architecture-improvements.md`, `docs/proposals/completed/2026-10-15-fsd-frontend-clean-code-follow-up.md` | 아래 5개 근거 링크 목적지를 원관측 commit으로 고정. 현재 제안서의 3개는 이번 문서 수정에 반영했고 완료 문서의 2개는 CC-007 삭제와 같은 변경에서 처리 |

삭제된 Scout와 graph의 동시 저장 시험을 통째로 대체해 coverage를 잃지 않는다.
`pipeline page dirty snapshot`은 `Receive version 4` 주입만으로 원래 baseline·초안·stale를
확인하고, 두 응답 순서 사례는 보존할 graph-save와 독립 snapshot 도착 순서로 검증한다.
순수 Scout 토글·graph/Scout 독립성은 폐기된 웹 기능의 시험이므로 제거한다.
이 fixture 정리는 Core에 포함되며 CC-006 선택 여부와 무관하다.

**유지 목록:** `src/server/pipeline/{automatic-scout,settings-service,run-service,api}.ts`의
`setAutomaticScout`·`setAutomaticPick`·초기 Default 변환, `prisma/schema.prisma`의 두 flag,
`tests/server/integration/{automatic-scout,pipeline-settings,pipeline-materialization}.test.ts`,
`src/server/pipeline/run-service.test.ts`의 기존 legacy 검사. 이 파일들의 보존은 V7이 확인한다.
과거 완료 제안서의 판단·서술·결과·metadata와 test-report·관찰 JSON은 당시 기록으로 보존한다.
완료 문서에 허용하는 변경은 아래 2개 근거 링크 목적지뿐이다. 과거 본문의 옛 symbol·경로를
전역 제거하거나 기록 전체를 최신 구현처럼 다시 쓰지 않는다.

### I-007의 삭제 후 문서 링크 보존

`scripts/checks/verify-docs.mjs`의 `inspectDocs`는 완료 문서도 검사한다. 삭제 7개를 반영한
파일 목록에서 기존 근거 링크 5개가 끊기는 것을 확인했다. 각 문서에 기록된 관측 SHA와
그 commit의 파일·행을 대조했으며 아래 고정 링크로만 변경한다.

| 문서 / 근거 링크 | 고정할 관측 SHA와 목적지 |
| --- | --- |
| 현재 제안서의 Pick 컨트롤:6 | `14d605599a92e8b242f7e20073281f97aa4d56c1`의 `src/fsd/features/edit-pipeline/ui/automatic-pick-control.tsx#L6`; 위 CC-007에 고정 링크 반영 |
| 현재 제안서의 Scout 컨트롤:11 | 같은 SHA의 `src/fsd/features/edit-pipeline/ui/automatic-scout-control.tsx#L11`; 위 CC-007에 반영 |
| 현재 제안서의 Scout Action:9 | 같은 SHA의 `src/fsd/features/edit-pipeline/api/automatic-scout.server.ts#L9`; 위 CC-007에 반영 |
| `2026-10-15-fsd-architecture-improvements.md`의 automatic-scout.server.ts:9 | `https://github.com/Sangeok/stagekeeper/blob/087a8bedddae1e36aa4ffbd8046ed799386ee598/src/fsd/features/edit-pipeline/api/automatic-scout.server.ts#L9` |
| `2026-10-15-fsd-frontend-clean-code-follow-up.md`의 Scout Action:14 | `https://github.com/Sangeok/stagekeeper/blob/ef9d8f4f3dc26a0473ab0fa856c86c1ef711fd98/src/fsd/features/edit-pipeline/api/automatic-scout.server.ts#L14` |

표의 완료 문서 두 개는 모두 `docs/proposals/completed/` 아래다. 최신 branch URL이나 현재
af8be6c 하나로 원관측 기준을 덮지 않는다. 이 제안서를 완료 폴더로 옮겨도 고정 링크는 유지한다.
삭제 후 전체 문서 검사와 5개 원관측 git object의 파일·행 확인을 함께 수행한다. 미추적
제안서는 `inspectDocs` 입력에도 명시적으로 포함해 검사 누락을 방지한다.

### I-007의 유지 browser 시험 전제

`src-clean-code-acceptance.ts`의 보존할 pipeline 사례는 Scout 제거만으로 실행 가능해지지
않는다. `PipelinePageFixture`가 초기 카탈로그에서 rail을 찾고, 옛 `Propose`와
`Add doc-auditor here`를 찾는 전제도 아래처럼 수정한다. 제품의 기본 화면·nodeLabel·
`usePipelineNavigation`은 시험을 통과시키기 위해 바꾸지 않는다.

- `src-clean-code-browser.tsx`의 `pipeline-page`·`pipeline-page-default`는 합법적인 deep link인
  `pipeline=default`로 초기화한다. 기존 query(mode/autorun/private-only/ux-only 등)를 유지한
  URL과 그 값에 맞는 `SearchParamsContext`를 제공한다. 프로젝트 identity로 page가 재마운트된
  뒤에도 같은 선택 전제를 제공한다. 카탈로그 자체는 별도 기존 catalog/frontend-ux 사례가 검증한다.
- 이 fixture가 바꾸기 전의 URL/history.state를 보관하고 root unmount 뒤에 자기 변경만 복원한다.
  다음 case·Finish·예외 종료에서 pipeline query나 `pipelinePosition`이 새 case로 새지 않게 한다.
  기존 frontend-ux 전용 history cleanup은 유지하며 두 fixture의 수명을 섞지 않는다.
- acceptance의 `pipeline-page*`는 `Pipeline editor` 영역과 해당 node group이 실제로 생긴 뒤
  진행한다. standalone `pipeline`은 raw rail만 렌더하므로 editor 영역 대신 해당 node group을
  기다린다. 변경할 노드는 현재 기본 그래프의 `discover-work`이며 화면의 `Discover work` group 안에서 Remove를
  선택한다. 첫 번째 Remove 버튼이나 `Propose` 문자열에 의존하지 않는다. 다른 도메인의
  ProposeButton·legacy ID를 전역 치환하지 않는다.
- 삽입 메뉴의 현재 표시명 `Add Doc audit here`를 사용한다. 현재 Pro 기본 그래프 앞에는
  Discover work·Assign work가 있으므로 before Plan 삽입을 배열의 0/1번으로 판정하지 않는다.
  `doc-auditor#2`가 Plan 바로 앞에 있고 기존 prefix가 유지되는지, end 삽입은 마지막인지 확인한다.
- 새 고정 sleep으로 초기화나 응답 순서를 추정하지 않고 editor/버튼/노드 상태를 기다린다.
  기존 제어 가능한 Promise, 제출 definition·expectedVersion, 호출 수, old-project 응답 격리를
  그대로 검사한다. 시험을 삭제하거나 payload 검사를 문구 존재 검사로 약화하지 않는다.
- standalone `pipeline success/error/stale/unknown`도 Discover work를 명시적으로 제거하고,
  기존 두 gate와 CAS=3이 제출본에 남는지 확인한다. 제어된 응답 후에는 `Saving…` 종료를
  기다린 다음 error의 Save 활성화, stale/unknown의 Save 비활성화·복구 문구를 검사한다.
  고정 80ms 뒤 버튼 이름이 바뀌었다고 가정하거나 제품의 pending/reset 정책을 바꾸지 않는다.
- `pipeline zero gates`의 `Remove.parentElement`에는 gate 표시가 없다. 기존
  `Insert before Plan`·`Insert before Implement` 컨트롤에서 각각의 gate card를 특정해 그 안의
  Remove를 누르고 두 gate의 제거를 확인한다. 첫 Save는 mutation 0회, `Save without a gate`
  중복 클릭은 mutation 1회이며 제출본의 `gates: []`·CAS=3을 확인한다. 제품 markup·승인 정책을
  바꾸거나 이 사례를 제거하지 않는다.

현재 `defaultGraph("pro")`는 Discover work·Assign work·Plan·Verify·Implement·Accept·Doc audit,
Free는 Discover work·Assign work·Plan·Implement·Accept다. 아래 local draft는 Pro 기본값에서
Discover work만 제거하고, 원격 v4/v5 snapshot은 Pro 기본값에서 Verify만 제거한 기존 fixture다.
이는 시험 데이터 설명이며 제품 기본값을 바꾸라는 지시가 아니다.

| 보존 case | 현재 데이터/상태로 확인할 결과 |
| --- | --- |
| dirty snapshot | local draft의 Discover work 부재·Verify 존재 유지, v4 수신은 stale/reload 안내, snapshot만으로 save 요청 없음 |
| clean snapshot / late older snapshot | v4를 clean 기준으로 채택한 뒤 다음 제출 CAS=4. 성공 후 더 오래된 v3가 제출된 draft를 되돌리지 않음 |
| plan/roster/readonly | 동일 definition의 메타데이터 갱신이 draft를 지우지 않음. readonly local discard는 mutation 없이 원래 Discover work 복원 |
| version-zero default plan | Free snapshot 수신 중 dirty Pro draft 보존. fingerprint 변경으로 external-change 경로가 되면 실제 `Discard changes and reload`의 표시·활성/무제출을 확인. Free snapshot으로 새 client를 mount해 회복 상태를 확인하되 이를 실제 reload 수행으로 보고하지 않음 |
| pending success/error/stale/unknown | 응답 전 local draft·제출본/CAS 고정. 새 snapshot이 있는 전제에서 success는 더 최신 v5를 채택하고 error/stale는 stale, unknown은 unknown 복구를 유지 |
| graph response / snapshot 두 순서 | save 성공과 v5 snapshot을 양쪽 순서로 정산해 최종 v5와 단일 제출본을 확인. Scout용 두 번째 mutation은 없음 |
| project switch / unmount | 새 프로젝트는 초기 Discover work를 가지며 이전 프로젝트의 늦은 응답이 draft·경고·lock·refresh를 변경하지 않음 |

version-zero의 client remount는 제어된 props 경계 시험이다. 실제 `window.location.reload()`와
서버 재조회는 이미 V7에 있는 실제 Next의 공통 recovery 경로에서 검증하고, fixture router의
refresh counter만으로 통과를 주장하지 않는다. 현재 선택 전제·표시명 정리는 Core I-007에
포함하며, dirty 계산 자체를 통일하는 선택적 CC-006과 구별한다.

## Runtime Behavior Matrix

| 대상 | 초기 상태와 이벤트 | 성공/업무 실패/예외 | 종료·재진입·cleanup | 검증 목적지 |
| --- | --- | --- | --- | --- |
| CC-009 | 현재 사용자의 flow 키로 GET 복원, `applied` 생성 후 POST 확인 | 성공만 일치 키 삭제. 401은 `lostSession` → 폼 unmount·로그인 안내. 429/503은 폼과 키를 유지하고 확인 실패 표시. 네트워크/storage 실패도 기존 안내 | 이전 flow·이전 사용자·unmount 응답은 현재 UI 변경 금지. 자체 요청 abort·timeout/listener 정리. 자동 retry 없음. 재진입은 서버 초안이 남을 때만 복원/POST; commit 후 GET-null이면 정상 폼만 표시하고 추가 POST 없음 | V9 DOM·sessionStorage·요청 로그 |
| CC-004 | prepare → ready → start/stop/approve 중 하나 | operation별 문구·전체 잠금. 성공은 기존 push/refresh/close, 업무 실패는 오류 후 잠금 해제, 예외는 unknown 후 재요청 차단 | pending Close/Escape 불가; unknown은 Close 가능. 닫고 다시 열면 새 prepare. 이전 mount의 완료는 refresh/close 금지; ref 잠금 finally 정리 | V4 실제 dialog·버튼·호출 수 |
| CC-007 | 현재 Pipeline 화면·Run rules·직접 Action | 현재 표시·정렬·카드/참조 동작은 유지하고 §18의 낡은 지시를 이에 맞춘다. 삭제된 두 웹 Action을 새 build에서 노출하지 않음. 남은 Action은 매 호출 권한/입력 재검증 | legacy flag·Default·서버 API는 그대로. fixture가 소유한 root·pending 응답·fetch·storage·history·listener·프로세스만 정리. 문서의 과거 근거는 원관측 commit 링크로 보존 | V7 source/AST·manifest·HTTP body·DB snapshot·문서 링크 |
| CC-006 | 편집 이벤트 → 다음 draft state | 모델 dirty를 Save·Run·이탈 확인이 공유; snapshot·stale/unknown 원본 의미 보존 | updater에 callback 금지. save/취소/재진입의 기존 보고 시점과 프로젝트별 key 유지 | V6 모델·DOM |
| CC-002 | prepare의 board/backlog union → 실제 선택 → start schema | 정상 두 종류 보존. board null은 Action 입력 오류; 유효하지만 오래된 timestamp는 기존 stale. 권한 검사가 schema보다 먼저인 순서 유지 | 서버 직접 호출도 소유권·CAS 검증 유지. 새 자동 재시도 없음 | V2 schema/Action/직접 실행 |
| CC-001 | HTTP/HTTPS 이름 선택·초기 폼 cookie 읽기 | 실제 문자열·secure 우선 fallback·43자 검증·cookie flags·production insecure 생성 거부 유지 | cookie 생성·갱신 부수효과를 상수 모듈로 옮기지 않음 | V1 실제 adapter의 jar 입출력 |
| CC-003·005·008 | MCP next·보고 제출·저장/실행 시작 | 이름·조건 표현·순수 비교만 변경. 원장·승인·버전·거부 무변경·release context 보존 | 현재 transaction/rollback/잠금/호출 수 유지, 새 retry 없음 | V3·V5·V8 DB/반환값 |

Next `router.refresh()`는 영향을 받지 않는 client state를 보존하므로 reset 수단으로 쓰지
않는다. Run의 unknown 복구는 실제 close/remount, 초안 복원 재진입은 기존 페이지 흐름으로
검증한다. Server Action은 페이지 인가와 별도로 매 호출 검증하며 `use server` export와
최종 build registry를 함께 확인한다. 이 의미는 설치된 Next 16.4.2의
`use-router.md`, `use-server.md`, `data-security.md`와 현재 컴포넌트·Action에서 대조했다.

### 중복·경합·부분 실패의 보존 계약

- 같은 ack의 반복은 `src/server/github/store.server.ts:acknowledge`의 id/user/browser/
  expectedRevision 조건부 `updateMany`로 draft를 null로 만드는 기존 멱등 처리다. 응답 유실을
  서버 미반영으로 해석하지 않는다. 서로 다른 사용자의 행을 읽거나 지우는 경로는 추가하지 않는다.
- pipeline의 start/stop/approve/save 및 next/report 경로는
  `src/server/pipeline/lock-pipeline.ts:withPipelineWrite`와
  `src/server/pipeline/board-service.ts:inProjectTransaction`의 User → Project 잠금 순서,
  잠금 후 소유권·가용성·현재 실행 재검사, 기존 CAS/transaction을 유지한다.
  서로 다른 정상 호출자 두 명의 경합을 client ref의 중복 클릭 방지로 대신하지 않는다.
- 프로젝트 실행의 단일 open-run은 잠금 안의 조회·생성과
  `prisma/migrations/20261031120000_pipeline_work_nodes/migration.sql`의
  `PipelineWorkRun_one_open_per_project` unique index가 함께 보호한다. 승인 후에는 entry가
  바뀌어 이전 entry 재전송을 거부하고, 종료한 run의 stop 반복도 기존 거부 결과를 유지한다.
- V2·V3·V8의 기존 `pipeline-direct-run.test.ts`, `pipeline-save.test.ts`,
  `pipeline-work-nodes.test.ts`가 두 연결의 실행·저장·승인 경합을 검사한다. source에는 새
  재시도나 잠금 이동을 요구하지 않으며 해당 검증 책임을 남긴다. 보존하는 함수 본문·transaction을
  이름 정리나 순수 비교 공유 때문에 다른 경계로 옮기지 않는다.
- 검증은 pre-commit 거부, commit 후 응답 유실, unknown을 구별한다. 전자는 금지된 도메인
  쓰기 0, 후자는 커밋된 결과 보존·자동 재전송 없음·실제 최종 상태 확인이 기준이다.

## Final Artifact Map

| 최종 표면 | winning source와 body 의존성 | 구현 후 확인 |
| --- | --- | --- |
| `/p/new`의 복원 결과 | `src/app/(app)/p/new/page.tsx` → create-project 공개 API → `NewProjectForm`/picker hook. API의 `ok/code`가 분기하며 서버 notice보다 후속 실패 상태가 화면을 결정 | 401의 로그인 링크/폼 부재, 429·503의 기존 입력·확인 실패 문구, 올바른 flow 키와 POST body. commit 후 유실/키 제거 실패는 재진입 GET-null·추가 POST 부재를 확인. V9 |
| `/p/[slug]/pipeline` Run dialog | route의 Run Action props → page → PipelineList → PipelineRunPanel → PipelinePanel/공유 Button. operation이 label과 disabled를 결정 | 실제 동작별 문구·잠금·unknown 복구·Close/Escape·focus. V4 |
| Pipeline 편집·Run rules | 같은 page/list와 rail/rules panel; 저장 graph·정의·권한 props. CSS·폰트·공유 Button은 현행 그대로 | dirty/저장본 구분, 현재 Run rules·Run 동작 유지, 자동 스위치·옛 배지 부재. §18이 실제 카탈로그 정렬·상태 줄·노드/edge·경고·참조 문구와 일치. V6·V7 |
| `.next/server/server-reference-manifest.json` | 수정된 source의 production `next build`가 node/edge registry를 생성. 기존 `.next`나 export grep은 최종 권위가 아님 | JSON parser로 workers와 filename/exportedName 대조. 아래 유지 10개·제거 2개·draft 미노출. V7 |
| 실행 graph/보고/MCP 결과 | 서버 helper·서비스·기존 Prisma schema와 transaction; 현재 template selection이 실행 pin을 결정 | 반환 body, 버전 생성 수, report·event·원장·pin 보존과 거부 무쓰기. V3·V5·V8 |
| 제안서·완료 기록의 코드 근거 | I-007의 문서 3개와 각 문서가 명시한 원관측 git commit. 고정 링크가 삭제 전 코드의 본문·행을 소유 | 삭제 뒤 끊긴 상대 링크 없음, 5개 파일·행·symbol 의미 일치, 완료 기록의 판단/결과/metadata 보존. V7 |

CC-007 뒤 유지할 Action은 `edit-pipeline.server.ts`의 `savePipeline`,
`pipeline-settings.server.ts`의 `archivePipelineAction`, `renamePipelineAction`,
`setDefaultPipelineAction`, `setPipelineRuleAction`, `run-pipeline.server.ts`의
`prepareRunAction`, `startRunAction`, `startProjectRunAction`, `stopProjectRunAction`,
`approveProjectGateAction`이다. 세 경로는 모두 `src/fsd/features/edit-pipeline/api/` 아래다.
제거할 exportedName은 `saveAutomaticScout`, `setAutomaticPickAction`이며 node·edge 모두
검사한다. `pipeline-draft-state.ts`는 계속 Action 등록 대상이 아니다. 전체 앱 Action을
이 10개로 제한한다는 뜻은 아니다. raw Action ID·encryption key를 고정하거나 출력하지 않는다.

## Safety Analysis

- route→page→feature의 실제 연결, public export와 Action binding을 확인했다.
  프런트엔드에서 서버 내부 타입을 직접 참조하거나 같은 layer slice를 연결하지 않는다.
- 렌더 소비자 검색과 현재 실행 모델 문서를 함께 확인했다. CC-007의 삭제 범위는 웹
  계약에 한정하며, 데이터 필드·초기 변환·서버 호환 API의 사용처를 별도 보존한다.
- 요청 취소·generation·현재 flow·중복 제출 ref·unknown 복구는 제거 대상이 아니다.
- draft dirty와 저장된 실행 그래프 동등성은 서로 다른 정책이다. CC-006·008을 하나의
  범용 equality 계층으로 합치지 않는다.
- 표시 문구를 바꾸면 `product-copy.md`의 소유권·잠금 규칙을 확인하고 관련 잠금을 함께
  맞춘다. 주석을 늘려 의미를 설명하기보다 이름·타입·분기로 표현한다.
- 정적 자산 URL, 폰트, ambient 타입, 새 의존성, DB migration은 제안 범위에 없다.
  서버 호출 이름을 바꾸더라도 출시된 MCP wire 이름과 plugin 응답 계약은 유지한다.

## Approval

승인 기록의 기준은 front matter다. I-007의 기술적 삭제·보존 경계를 지켰으며,
미선택 Phase 2를 완료로 처리하지 않았다.

## Execution Plan

1. 최신 dev에서 채택한 후보의 잔존 여부와 현재 호출자를 다시 확인한다. 원본 작업 트리를
   갱신하는 것만으로 해결되는 3건은 재구현하지 않는다.
2. CC-009와 CC-004를 우선 구현하고 실제 실패 응답·pending DOM 사례로 확인한다.
3. CC-007은 §18의 확인된 충돌을 현행 UI 계약으로 먼저 정리하고 I-007의 웹 소비·시험·
   Action·문서·AST 검사기를 같은 구현 변경에서 맞춘다. 낡은 문구에 맞추려고 UI를 되돌리지
   않으며 V7의 문구 원본/실제 렌더 대조, negative/positive 검증과 legacy 회귀를 유지한다.
   삭제와 같은 변경에서 I-007의 완료 문서 2개 링크 목적지도 고정하고 전체 문서 검사를 통과시킨다.
4. Consider 항목은 필요에 따라 선택한다. CC-006·002·001은 해당 feature의 유지보수 시,
   CC-008·005·003은 서버 모듈 변경 시 독립적인 작은 변경으로 다룰 수 있다.
5. 선택한 항목의 검증과 공통 게이트를 실행하고 결과·남은 환경 검증을 기록한다.

## Verification Plan

코드 구현 시 [테스트 작성](../../architecture/test-writing.md),
[배치](../../architecture/test-organization.md), [실행 규칙](../../architecture/verification.md)을
따른다. 제품 시험은 소유 slice/서버 모듈 근처, framework·서버 조합 시험은 책임별 루트
`tests/`에 둔다. 기존 시험을 재사용하고 이름 추출·상수 import 등 구현만 복제하는 시험은
추가하지 않는다.

공통 검증은 다음과 같다. 아래 명령 중 이번에 실행한 것은 다음 절에 별도로 기록했다.

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm run test:web
npm run test:server
npm run build
```

### 검증 목적지 V1–V9

아래 경로는 모두 기존 파일이며, I-002의 두 시험만 신규다. 이번 전체 재검증에서는 기준
코드의 명령 실행을 확인했다. 그 결과는 아래 Command Ledger에 기록하며, 후속 구현은
선택한 ID의 해당 행을 변경 후 다시 완료해야 한다.

| ID / 단계 | 정확한 검증 소유 파일 | 구현 후 관찰·거부 조건 |
| --- | --- | --- |
| V9 / Core | `tests/server/fixtures/github-picker-browser.ts`, `tests/server/fixtures/src-clean-code-acceptance.ts`, `tests/server/fixtures/src-clean-code-browser.tsx` | POST acknowledge만 제어하는 401/429/503/network/held response 추가. GET 실패와 구분. 현재 flow 성공/실패·키 보존/삭제·폼/로그인 화면·commit 후 유실 또는 키 제거 실패의 GET-null 재진입·추가 POST 부재·늦은 old flow·사용자 변경·unmount·StrictMode·다시 열기 확인. cleanup에서 등록한 제어함수·pending·fetch·storage 원상복구 |
| V4 / Core | `tests/server/fixtures/frontend-ux-browser.tsx`, `tests/server/fixtures/frontend-ux-acceptance.ts` | 기존 start/stop/approve assertion 수정. success/error/unknown 각각 label·Close/Escape·잠금·중복 요청·후속 push/refresh/close·unmount 응답 확인. fixture의 성공 처리는 실제 RSC 보존 증거가 아님 |
| V7 / Core | I-007의 수정/삭제 시험·fixture·rehearsal 전부, `tests/server/fixtures/action-manifest.ts`는 기존 parser 재사용 | 전 제거 목록의 source·export·AST 부재, 남은 4 settings+5 Run+save 및 private draft 규칙, legacy 유지 목록의 존재·회귀. `rehearse-multiple-pipelines.ts`의 남은 7 mutation, Runs items/자동 스위치 부재와 All pipelines/Run rules GET body·권한 거부의 도메인 무쓰기. `rehearse-src-clean-code.ts`의 save fault/recovery와 fixture 정리 |
| V6 / Phase 2 | `src/fsd/features/edit-pipeline/model/pipeline-draft-state.test.ts`, `tests/server/fixtures/frontend-ux-browser.tsx`, `tests/server/fixtures/frontend-ux-acceptance.ts`, `tests/server/fixtures/src-clean-code-acceptance.ts` | 원복·policy·0/새/오래된 snapshot·저장 중 수신·stale/unknown에서 dirty·버튼·이탈 판정과 submitted definition/CAS 확인. 모델 단위 시험만으로 부모 UI 동기화를 판정하지 않음 |
| V2 / Phase 2 | 신규 `src/fsd/features/edit-pipeline/model/run-pipeline-input.test.ts`, 신규 `tests/server/pipeline-run-actions.test.ts`, `tests/server/integration/pipeline-direct-run.test.ts`, `tests/server/fixtures/frontend-ux-browser.tsx`, `tests/server/fixtures/frontend-ux-acceptance.ts` | 두 정상 종류·board 누락/null/잘못된 timestamp·backlog null·Action 입력 오류와 zero service call·유효 stale. 권한 거부는 기존 순서 유지. 실제 DOM의 board/backlog 선택을 각각 확인 |
| V1 / Phase 2 | `tests/server/github-connection.test.ts`, `tests/server/github.test.ts` | 실제 두 adapter의 cookie jar·API 입력을 관찰. DB stub으로 로드한 public export를 adapter mock에 제공. HTTPS/HTTP·secure 우선 fallback·기존 flags/재사용 확인. DB·GitHub 실제 호출은 없음 |
| V8 / Phase 2 | `src/server/pipeline/run-service.test.ts`, `tests/server/integration/pipeline-save.test.ts`, `tests/server/integration/pipeline-direct-run.test.ts` | nodes 순서·gates 순서/중복·policy 누락/default/변경·format 불일치·입력 배열 비변경; 저장/실행의 실제 버전 재사용·생성 수 |
| V5 / Phase 2 | `tests/server/integration/qa-verifier.test.ts`, `tests/server/integration/impl-verifier.test.ts` | 기존 pass/fail/blocked 및 stale entry·누락 run·verify 없음의 거부/무쓰기. 단계별 계약 차이·원래 오류 문구·승인 결과 보존 |
| V3 / Phase 2 | `src/server/pipeline/run-service.test.ts`, `tests/server/review-gate-actions.test.ts`, `tests/server/integration/acceptance-failure.test.ts`, `tests/server/integration/impl-verifier.test.ts`, `tests/server/integration/automatic-scout.test.ts`, `tests/server/integration/qa-verifier.test.ts`, `tests/server/integration/pipeline-materialization.test.ts`, `tests/server/integration/head.test.ts`, `tests/server/integration/pipeline-work-nodes.test.ts`, `tests/server/integration/pipeline-direct-run.test.ts`, `tests/server/integration/verify-stall.test.ts` | 옛 함수 이름 import/call/test title·VM sentinel까지 갱신. 옛 공개 alias와 잘못된 웹 호출 없음. `docs/architecture/verification.md`의 pipeline-smoke 함수 참조도 갱신; plugin 내부의 동명 nextFor는 다른 symbol이므로 유지. 기존 반환값·materialization·owner advice/commit 순서와 verify-stall의 dispatch/ready-set·on_hold·owner 복구 단언 유지 |

V6·V7의 src-clean-code browser 사례는 I-007의 현재 편집 진입·selector·snapshot 표와
standalone 저장 응답 완료·zero-gate 확인 절차를 따른다.
V7은 I-007의 문서 3개·근거 링크 5개도 검사한다. `npm run check`의 `docs:check`가 삭제 후
전체 문서를 검사하며, 고정 URL의 파일·행·symbol은 표의 원관측 git object로 확인한다.
과거 기록의 metadata·판정·서술·결과가 바뀌지 않았는지도 diff로 확인한다.
`src-clean-code-browser.tsx`와 `src-clean-code-acceptance.ts`를 함께 갱신하며 제품 코드를 옛
fixture에 맞추지 않는다. V7의 §18 동기화는 다음 목적지까지 확인한다. 기존 시험에 필요한 최소 사례를 추가하고
문구 원본과 실제 결과를 함께 읽는다. 소스 문자열만 바뀌었는지 보는 검사로 대체하지 않는다.

- `src/fsd/features/edit-pipeline/model/pipeline-catalog.test.ts`: 기본 Pipeline 이름이 Z로 시작하고
  다른 Pipeline 이름이 A로 시작하는 사례로 name 정렬과 default 우선 정렬을 구별한다.
  실제 sort 함수·검색·기본 선택 동작은 수정하지 않는다.
- `src/fsd/features/edit-pipeline/ui/pipeline-list.test.ts`와
  `src/fsd/pages/project-pipeline/ui/project-pipeline-page.test.ts`: 현재 제목/배지 부재를 유지하고,
  저장본·가상 Default·새 초안의 상태 줄을 각각 렌더해 현행 문구와 대조한다.
- `src/fsd/entities/pipeline/model/labels.test.ts`와
  `src/fsd/features/edit-pipeline/ui/pipeline-rail.test.mjs`: 기존 Discover work·반복 번호·edge·
  Open pipeline 사례를 유지하고, 게이트 없는 그래프의 현행 경고 본문을 확인한다.
  Insert pipeline 메뉴는 기존 `tests/server/fixtures/frontend-ux-acceptance.ts`의 실제 메뉴
  사례와 대조하며 fixture와 제품의 현재 버튼 이름을 옛 Use/Edit로 바꾸지 않는다.
- 수정한 `docs/conventions/product-copy.md` §18에는 표의 낡은 **표시·정렬 지시**가 남지 않아야
  한다. 내부 alias 설명의 `scout` 같은 유효 ID까지 없애거나 다른 절을 일괄 치환하지 않는다.
  `pipeline-save-recovery` copy-lock은 기존 `pipeline-save-state.test.ts`와 함께 보존한다.

CC-003·005·008의 최신 template 경계는 추가로
`tests/server/integration/template-execution.test.ts`의 pin·상속·installation mismatch 거부와
무변경 사례로 확인한다. `TemplateRunContext`를 지우거나 `{}`로 바꿔 전달하지 않는다.
I-003의 `scripts/rehearsals/rehearse-pipeline-smoke.ts`는 이름 연결·타입 검사 대상이다.
실제 모델을 쓰는 smoke/배포 workflow 실행은 이번 리팩터링의 로컬 검증이나 문서 검토에
자동 포함하지 않으며 release 시 현재 AGENTS의 게이트를 따른다.

### 실행 순서와 환경

저장소 루트의 zsh/POSIX shell에서 실행한다. 먼저 공통 check와 선택 항목 시험을 수행한다.
manifest 검사는 **동일 수정 소스의 fresh build 뒤**에만 실행한다.

```sh
npm run build
RDC_CHECK_ACTION_MANIFEST=true npm run test:server
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only
```

UI 서버가 뜨면 `http://127.0.0.1:55452/fixture?mode=copy&autorun`에서 src-clean-code 인수를,
`http://127.0.0.1:55452/fixture?mode=ux-pipeline&ux-only&autorun`에서 frontend-ux 인수를 실행한다.
이 진입점은 `runSelectedAcceptance`가 `ux-only`의 존재로 suite를 선택하므로 해당 플래그를
생략하지 않는다. 각 suite의 결과 body와 fail/skip을 확인하고, 브라우저 Finish와 `/finish`로 종료한다.
개발 lifetime/StrictMode 검증은 같은 서버를 종료한 뒤 다음 명령으로 다시 수행한다.

```sh
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only --fixture-development
```

fixture의 `next/link`, router, Action, GitHub fetch는 double이며 실제 인증·RSC·DB 성공을
증명하지 않는다. CSS/폰트 변경은 없고, 실제 Next 페이지에서는 기존 스타일·body·dialog
작동과 자산 응답도 확인한다. 기존 suite의 별도 실패는 숨기거나 전체 통과로 덮지 않는다.

실제 저장·권한·전송 검증은 기존 안전 검사에 통과하는 격리 `TEST_DATABASE_URL`과 현재
migration·Prisma client·production build를 준비한 뒤 수행한다. URL을 출력하거나 production
DB로 대체하지 않는다. 통합 runner는 migration deploy 후 **전체** integration suite를 실행한다.
시험명 필터 인자를 받는다고 가정하지 않는다.

```sh
npm run test:server:integration
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-multiple-pipelines.ts
node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-src-clean-code.ts
```

마지막 실제 Next 리허설은 `/owner-pipeline`의 save 전후 응답 유실과 복구를 검사한다.
삭제한 Scout 클릭을 선행 조건으로 삼지 않고 두 페이지의 저장/snapshot 차이로 검증한다.
CC-009는 API/서버 계약을 바꾸지 않는 hook 변경이므로 제어된 실제 DOM이 해당 실패 처리의
직접 검증이다. 외부 GitHub 서비스의 장애를 실제로 일으키는 시험은 필요하지 않다.

## Definition of Done

- Core는 CC-009·004·007과 I/V 목록의 필요한 문서·fixture·검사 갱신을 모두 포함한다.
  Phase 2는 선택된 ID에만 해당 I/V 완료 조건을 적용하며 미선택 ID를 완료로 기록하지 않는다.
- 승인된 두 UX 변화와 CC-002의 조건부 오류 문구 외 현재 화면·권한·입력·복구는 보존한다.
  자동 retry·새 전역 상태·새 제품 UI를 추가하지 않는다.
- I-007 삭제 7개, 제거 symbol 6개(`AutomaticPickControl`, `AutomaticScoutControl`, `SaveAutomaticScoutAction`,
  `saveAutomaticScout`, `setAutomaticPickAction`, settings의 `setAutomaticPick`), 두 Action registry 부재와
  유지 10개 Action을 모두 확인한다. legacy flags/서버 API/회귀는 남는다.
- §18의 카탈로그·정렬·상태 줄·노드/edge·경고·참조 문구와 현재 렌더/모델 결과가 일치한다.
  UI를 낡은 문구로 되돌리지 않으며 recovery copy-lock과 내부 legacy ID를 보존한다.
- 보존한 pipeline browser 사례가 선택된 editor에 진입하고 현재 노드·문구·snapshot을
  검사한다. standalone rail은 자체 node scope를 사용한다. fixture의 URL/history 정리·
  제출 graph/CAS·응답 완료 대기·zero-gate 명시 확인·응답 순서 보장을 유지한다.
- 새 owner/public export/consumer와 rename provenance가 일치하며, 기존 경로·alias를
  요구하는 live source·시험·명령은 남지 않는다. 과거 완료 기록은 historical 예외다.
- 삭제 후 전체 문서 링크 검사가 통과하고 I-007의 5개 근거가 원관측 commit의 파일·행으로
  연결된다. 완료 기록의 옛 symbol/서술은 보존하되 삭제된 작업 트리 파일로 연결되는 링크는 남지 않는다.
- V1–V9 중 선택 범위의 실제 관찰과 공통 게이트 결과를 남긴다. DOM·DB·fresh manifest가
  필요한 항목은 그 환경에서 완료해야 하며 static/double 통과로 대체하지 않는다.
- 권한·입력·stale 거부와 commit 전 차단에서는 금지된 도메인 쓰기가 없어야 한다.
  계약상 요청 예산·감사 기록은 기존 정책을 따른다. commit 후 응답 유실이나 unknown은
  이미 반영된 쓰기를 허용하며, 이를 rollback이나 미반영으로 간주하지 않는다. 자동 중복
  mutation 부재·최종 상태 재조회·명시적 복구와 old flow/mount 격리, fixture 정리를 확인한다. 필수 환경 미준비는 미실행으로 기록하며 구현 검증 완료로 처리하지 않는다.

## Verification Results

아래는 **최초 원본 HEAD의 검토 baseline 기록**이다. 이번 reconciliation에서 재실행한
결과나 최신 dev·개선 구현 후의 회귀 결과가 아니다. 42개 링크 수 역시 당시 문서 기준이다.

| 실행 명령 | 결과 | 범위와 한계 |
| --- | --- | --- |
| `npm run verify:fsd` | Pass | FSD 경계 |
| `npm run verify:server` | Pass | 서버 모듈 경계 |
| `node node_modules/eslint/bin/eslint.js src` | Pass | `src` lint; 전체 저장소 lint로 확대하지 않음 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Pass | 기존 생성 타입 사용; fresh Next typegen/build는 미실행 |
| `npm run test:architecture` | Pass | 총 193개: 191 pass, 0 fail, 2 skip |
| `npm run test:web` | Pass | 792 pass, 0 fail, 0 skip |
| `git diff --check` | Pass | 추적 중인 변경의 공백 검사; 신규 문서는 별도 검사 |
| 신규 문서를 포함한 `inspectDocs` 및 메타데이터·근거 링크 검사 | Pass | 신규 문서를 명시적으로 포함; 상대 링크 42개·9개 canonical ID·승인 전 메타데이터 확인 |
| 실제 DOM·브라우저·격리 DB 인수, fresh build | Not run | 제품 코드를 변경하지 않은 정적 검토 범위 |

architecture의 2개 skip은 Windows LPAC 실제 런타임의 readlink·spawn diagnostics 시험이며
현재 macOS 환경에서 실행하지 않았다. `test:web` 첫 실행은 sandbox의 loopback listen
`EPERM`으로 실패했고, 같은 명령을 허용된 sandbox 밖에서 재실행해 792개가 통과했다.
이를 제품 결함이나 코드 수정으로 해결한 실패로 집계하지 않는다.

**Review-mode substantiation:** 게이트가 요청한 pending-verification은 없어서 별도 후보
입증 명령은 필요하지 않았다. 위 실행은 baseline 확인이다. 실제 DOM/DB에서 개별 finding을
재현하지 않았다는 한계는 남는다. **Post-edit regression:** 제품 코드 변경이 없어 해당 없음.

### 2026-11-05 전체 재검증의 Command Ledger — 이력

기준 코드는 `3e69c58`이며 모든 제품 source는 변경하지 않았다. 설치·생성 준비는 기존
README 설치 절과 `.github/workflows/check.yml`의 `npm ci` 및 현재 schema의 Prisma Client
생성 계약을 따랐다. 명령은 격리 작업 트리에서 실행했다. DB 명령에는 공유·운영 DB 대신
이번 작업만 소유한 loopback PostgreSQL 18.4와 `stagekeeper_test_` DB를 사용했다.
이 준비 방식은 프로젝트 의존성 추가나 새 운영 DB 정책이 아니다.

아래 `local`은 해당 격리 환경에서 실행 가능함을 뜻한다. baseline의 통과가 아직 구현하지
않은 변경의 통과를 뜻하지 않는다. 동일한 build 명령의 두 본문 위치는 같은 소스에 대해
실행한 fresh build를 사용했으며 이후 제품 source 변경은 없었다.

| 명령 / 원문 위치 | 분류 | 실행 | baseline 결과 |
| --- | --- | --- | --- |
| `npm ci` / 기존 설치·CI 준비 | local | Yes | 의존성 설치 완료 |
| `npm run db:generate` / 기존 설치·CI 준비 | local | Yes | 현재 schema로 생성 완료; DB 연결 불필요 |
| `npm run verify:fsd` / 공통 | local | Yes | Pass |
| `npm run verify:server` / 공통 | local | Yes | Pass |
| `npm run test:architecture` / 공통 | local | Yes | 213 pass, 2 Windows 전용 skip |
| `npm run check` / 공통 | local | Yes | 통과; test:scripts 306 pass/2 skip. 기존 codex-main-loop-tools의 unused-var 경고 1개 |
| `npm run test:web` / 공통 | local | Yes | 794 pass |
| `npm run test:server` / 공통 | local | Yes | 176 pass, 2 조건부 skip |
| `npm run build` / 공통 및 manifest 선행 | local | Yes | fresh production build 통과 |
| `RDC_CHECK_ACTION_MANIFEST=true npm run test:server` / manifest | local | Yes | 185 pass, 2 조건부 skip. 현재 12개 edit-pipeline export를 관찰했으며 구현 후에는 10개 유지/2개 제거를 검사 |
| `node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only` / UI | local | Yes | 서버 시작·HTML/JS 본문·의존성 응답·`/finish` 정리 확인, exit 0 |
| 같은 명령 + `--fixture-development` / 개발 UI | local | Yes | 개발 bundle·HTML/JS 응답·`/finish` 정리 확인, exit 0 |
| `npm run test:server:integration` / DB | local | Yes | migration 및 174개 테스트 모두 통과 |
| `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-multiple-pipelines.ts` / 실제 HTTP | local | Yes | exit 1: 기존 63행의 `/Runs items/` assertion에서 실패. 변경 전 fixture drift이며 I-007/V7에 수정 범위로 반영. mutation·뒤따르는 HTTP 사례 통과로 보고하지 않음 |
| `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-src-clean-code.ts` / 실제 Next | local | Yes | 실제 서버·DB fixture 시작, fixture 본문·pipeline-state JSON 구조, `/finish` 정리 확인, exit 0 |

웹 테스트·Prisma cache·local listen/connect의 sandbox 제한은 같은 격리 명령을 허용된
권한으로 재실행하여 구분했다. fixture 사용자 잔여 수는 0이었고 작업 PostgreSQL을 종료했다.
브라우저 접근 호스트가 사용 불가여서 실제 DOM 자동 인수와 수동 키보드·focus는 **미실행**이다.
UI 서버/본문 검증을 DOM 인수 통과로 확대하지 않는다. 이는 구현 후 V4·V6·V9 및 관련 V7에서
닫아야 할 runtime 검증이며, 별도의 `proposal-runtime-validator` 또는 실제 구현 인수를 대신하지 않는다.

### 2026-11-10 e2cc5f4 기준의 Command Ledger — 이력

`e2cc5f4`의 제품 source를 변경하지 않은 격리 작업 트리에서 설치·Prisma 생성·fresh build와
작업 전용 loopback PostgreSQL 18.4를 준비해 아래 local 명령을 다시 실행했다. 준비 계약과
실행 argv는 위와 같으며 URL·인증 값은 기록하지 않는다. 과거 결과를 최신 결과로 재사용하지 않았다.

| 명령 | 분류 / 실행 | 현재 baseline 결과 |
| --- | --- | --- |
| `npm ci` | local / Yes | 설치 완료 |
| `npm run db:generate` | local / Yes | 현재 schema의 Client 생성 완료 |
| `npm run verify:fsd` | local / Yes | Pass |
| `npm run verify:server` | local / Yes | Pass |
| `npm run test:architecture` | local / Yes | 216 pass, 2 Windows 전용 skip |
| `npm run check` | local / Yes | Pass; test:scripts 310 pass/2 skip, 기존 `_key` unused-var 경고 1개 |
| `npm run test:web` | local / Yes | 801 pass |
| `npm run test:server` | local / Yes | 176 pass, 2 조건부 skip |
| `npm run build` | local / Yes | fresh production build 통과 |
| `RDC_CHECK_ACTION_MANIFEST=true npm run test:server` | local / Yes | 185 pass, 2 조건부 skip; 구조화 registry의 현재 edit-pipeline 12개 export 확인 |
| `node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only` | local / Yes | 서버 exit 0. 실제 DOM: src-clean-code 102 pass/22 fail, frontend-ux 15 pass/1 fail |
| 같은 명령 + `--fixture-development` | local / Yes | 서버 exit 0. 실제 DOM: src-clean-code 103 pass/21 fail, frontend-ux 15 pass/1 fail |
| `npm run test:server:integration` | local / Yes | migration 및 179개 테스트 모두 통과 |
| `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-multiple-pipelines.ts` | local / Yes | exit 1: 기존 `/Runs items/` assertion 실패 재현. I-007/V7 교체 대상이며 이후 mutation 사례는 미검증 |
| `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-src-clean-code.ts` | local / Yes | 순차 실행에서 exit 0. 실제 Pipeline catalog/Run rules DOM, stylesheet·font 로드, fixture HTML/JS·pipeline-state 구조·save/scout 호출 0·종료 확인 |

실제 브라우저는 사용 가능했다. src-clean-code의 공통 실패 20개는 옛 삽입 selector·선택되지
않은 pipeline page·zero-gate 선택 문제이며 I-007의 fixture 수정 범위다. production에서는
추가로 `pipeline error/stale`의 `Save` 탐색 두 건이 실패했고 development에서는 이 두 건이
통과했다. 정확한 실패 순간의 DOM 상태는 보존하지 않아 원인을 단정하지 않으며, 고정 sleep
대신 응답 완료 상태를 기다리는 검증 지시를 반영했다.

development의 `private restoration focus and current failure` 1건과 양쪽 frontend-ux의
`catalog and rules` focus 복원 1건은 별도의 baseline 실패다. 이번 조사에서는 원인을 확정하지
않았고 새 제품 수정 요구로 확대하지 않았다. 구현 시 V9·V7에서 각각 다시 실행·분리 진단하며
기존 실패와 신규 회귀를 구별한다. suite 전체 통과 또는 실제 focus 인수 완료로 보고하지 않는다.
아직 없는 CC-009의 POST 실패 제어와 변경 후 V1–V9 인수도 현재 결과로 대체하지 않는다.

실제 Next 첫 시도는 UI 서버와 같은 포트의 충돌로 중단됐다. 작업 소유 Next 프로세스와
격리 DB fixture 1개를 정리한 뒤 UI 서버 종료를 확인하고 순차 재실행했다. 마지막 fixture
사용자 잔여 수는 0이고 작업 PostgreSQL도 종료했다. 명령·준비 계약 결함이나 제품 수정으로
해결한 실패로 집계하지 않는다. 실제 save 응답 유실·reload 복구는 아직 미실행이며 구현 후
V7에서 완료한다. 모델 smoke·배포·운영 DB 명령은 이 문서 작업에 포함하지 않았다.

### 2026-11-10 최신 af8be6c 기준의 Command Ledger

직전 검토 이후 DB helper 분리가 병합되어 새 격리 작업 트리와 작업 전용 PostgreSQL 18.4에서
명령을 다시 실행했다. 제품 src tree·core·schema·lockfile은 e2cc5f4와 같지만, 현재 검증
의존성은 `scripts/lib/test-database.mjs`, `scripts/lib/prisma.ts`, 통합 runner 및 support다.
명령·제품 구현 지시는 그대로이며 아래 결과는 변경 전 baseline이다.

| 명령 | 분류 / 실행 | 현재 baseline 결과 |
| --- | --- | --- |
| `npm ci` | local / Yes | 설치 완료 |
| `npm run db:generate` | local / Yes | 현재 schema의 Client 생성 완료 |
| `npm run verify:fsd` | local / Yes | Pass |
| `npm run verify:server` | local / Yes | Pass |
| `npm run test:architecture` | local / Yes | 220 pass, 2 Windows 전용 skip |
| `npm run check` | local / Yes | Pass; test:scripts 320 pass/2 skip, 기존 `_key` unused-var 경고 1개 |
| `npm run test:web` | local / Yes | 801 pass |
| `npm run test:server` | local / Yes | 176 pass, 2 조건부 skip |
| `npm run build` | local / Yes | fresh production build 통과 |
| `RDC_CHECK_ACTION_MANIFEST=true npm run test:server` | local / Yes | 185 pass, 2 조건부 skip; 현재 edit-pipeline 12개 export·workers 구조와 private draft 부재 확인 |
| `node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only` | local / Yes | 서버 exit 0. 실제 DOM: src-clean-code 104 pass/20 fail, frontend-ux 16 pass/0 fail |
| 같은 명령 + `--fixture-development` | local / Yes | 서버 exit 0. 실제 DOM: src-clean-code 104 pass/20 fail, frontend-ux 16 pass/0 fail |
| `npm run test:server:integration` | local / Yes | migration 및 180개 테스트 모두 통과 |
| `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-multiple-pipelines.ts` | local / Yes | exit 1: 기존 63행 `/Runs items/` assertion 실패. 뒤의 mutation 사례는 미검증 |
| `node --import ./tests/server/register-server-only.mjs --import tsx scripts/rehearsals/rehearse-src-clean-code.ts` | local / Yes | exit 0. 실제 catalog/Run rules DOM·stylesheet 2개·font 로드·fixture HTML/JS·pipeline-state 구조·save/scout 호출 0·종료 확인 |

양쪽 UI의 20개 실패는 기존 I-007에 반영한 삽입 selector·편집 진입·zero-gate 전제다.
직전 실행의 Save 탐색·private query/focus·Rules focus 실패는 이번 실행에서 통과했으나,
제품·fixture를 고친 결과는 아니므로 해결 완료로 재분류하지 않는다. 기존 대기·격리 조건과
구현 후 V7·V9 인수를 유지한다. 실제 save 응답 유실·reload와 아직 구현하지 않은 POST 실패
분기도 현재 결과로 대체하지 않는다. 서버와 DB는 종료했고 fixture 사용자 잔여 수는 0이다.

문서 검사는 미추적 제안서를 포함해 수행했다. 최초 삭제 후 파일 목록 가정에서는 링크 오류
5개가 재현됐다. 현재 제안서의 3개 고정 링크와 완료 문서 2개의 계획된 링크 목적지를 적용한
임시 Markdown 사본에서는 삭제 대상 7개를 제외해도 전체 `inspectDocs` 오류가 0개였다.
5개 원관측 git object의 파일·행도 확인했다. 이는 링크 수정 계획의 검증이며 제품 파일 삭제나
완료 문서의 실제 편집을 수행했다는 뜻은 아니다.

## Gate Decisions

1라운드에서 원시 후보 12건을 모두 판정했다. accept 9, reject 3이며 merge-accept는 없다.
Canonical ID는 원시 ID와 아래처럼 고정한다. 중복 동의 수로 심각도를 높이지 않았다.

| Raw ID | 렌즈 | 원시 우선순위 | 판정 | Canonical ID / 최종 우선순위 | 이유 |
| --- | --- | --- | --- | --- | --- |
| COH-001 | Cohesion | Should | reject | — | 최신 dev의 board-item/backlog page loader로 해결 |
| COH-002 | Cohesion | Consider | accept | CC-001 / Consider | 쿠키 이름의 단일 계약을 두 경로에서 재정의 |
| PRD-001 | Predictability | Consider | accept | CC-002 / Consider | 생산자 불변식과 타입·schema 불일치 |
| PRD-002 | Predictability | Should | accept | CC-003 / Consider | 부수효과는 있으나 현재 웹 조회는 분리되어 있어 낮춤 |
| PRD-003 | Predictability | Consider | reject | — | 지적한 미사용 props는 최신 dev에서 제거 |
| RDB-001 | Readability | Should | accept | CC-004 / Should | 세 동작의 pending 의미와 실제 표시 불일치 |
| RDB-002 | Readability | Consider | accept | CC-005 / Consider | 복합 부정 조건의 국소 가독성 개선 |
| RDB-003 | Readability | Consider | reject | — | 최신 dev에 ReferencedPipelineCard 분리 반영 |
| SIM-001 | Simplicity | Consider | accept | CC-006 / Consider | 같은 dirty 정책의 두 계산 경로 |
| SIM-002 | Simplicity | Should | accept | CC-007 / Should | 현재 화면이 사용하지 않는 웹 계약·검증 비용 |
| SIM-003 | Simplicity | Consider | accept | CC-008 / Consider | 실행 그래프 재사용 정책의 중복 |
| TS-001 | TypeScript generalist | Should | accept | CC-009 / Should | 실패 envelope와 기존 세션 복구의 처리 누락 |

기각한 세 건은 원본 관찰이 틀렸다는 의미가 아니다. `14d6055 → 3e69c58`에서 해결을
확인한 이력이며 신규 개선점 수에 포함하지 않는다. PRD-003을 CC-007에 합쳐 이미 없어진
props를 다시 제거 대상으로 나열하지 않는다. 추가 revision·pending-verification·
사람 판단이 필요한 미해결 충돌은 없다.

## Reconciliation Notes

### 앞선 검토 기록

처음부터 개선할 점이 없었던 것은 아니다. 코드베이스 대조의 첫 pass에서 다음 문서 보완점을
확인했고 하나의 편집 pass에 반영했다. 새 제품 결함 8건을 추가한 것이 아니라 기존 9개
개선안을 잘못 구현하거나 잘못 검증할 수 있는 문서상 공백을 해소한 기록이다.

| 보완점 | 코드 근거 | 반영 위치 |
| --- | --- | --- |
| R1: 최초 원본과 구현 기준·선택 범위 혼동 | 원본 14d6055와 dev 3e69c58, 이미 해결된 세 후보 | Current State·Core/Phase 2·Execution·DoD |
| R2: 웹 삭제 소비자·검사기 누락 | `frontend-ux-boundaries.test.mjs`가 5 settings/Scout 시험 요구; 추가 fixture callback | I-007·V7·manifest map |
| R3: 실제 DOM 시험이 기존 잘못된 문구를 잠금 | `frontend-ux-acceptance.ts:179`는 세 작업 모두 Starting 요구 | CC-004·I-004·V4·UX 경계 |
| R4: ack의 현재 요청·재진입·cleanup 조건 부족 | picker의 flowGeneration·flowKey, effect cleanup, 기존 서버 acknowledge | CC-009·Runtime·V9 |
| R5: manifest positive 검사와 삭제 요구 충돌 | `pipeline-save.test.ts:57`의 Scout 등록 assertion, 실제 registry의 두 구형 Action | 10개 유지/2개 제거 목록·fresh build 순서·V7 |
| R6: 삭제 후 인수 시나리오·본문 목적지 공백 | HTTP rehearsal의 Automatic picking/off·Scout 전제, snapshot 시험 | I-007·Runtime·Artifact·실행 명령 |
| R7: 새 owner·rename·schema 검증 목적지가 미정 | cookie의 두 adapter/VM mock, 3개 next 함수 소비자, RunTarget/schema | I-001·002·003·008 및 V1·2·3·8 |
| R8: UX 수용·문구 소유권·완료 기준 전파 부족 | 사용자의 UX 수용, product-copy §18, 기존 선택적 범위 | Scope·Approval·Runtime·DoD |

소스 판정은 아키텍처·타입/schema·실제 소비·내장 Next 문서와 구조화 manifest에서 대조했다.
기존 `.next` manifest는 최초 작업 트리에 있던 관찰 자료로만 읽었으며 fresh dev artifact로
간주하지 않는다. 새 소스의 실제 body·DB·manifest 검증은 위 실행 계획의 구현 완료 조건이다.
편집 후 재검토에서 R9도 확인했다. fixture의 `runSelectedAcceptance`는 화면 mode가 아니라
`ux-only` query로 suite를 고르므로 frontend-ux 실행 URL에 이 플래그를 추가했다.
R7의 VM 시험에도 실제 public export를 DB stub으로 읽는 방법을 명시했다.

| Pass | source 편집 | 판정과 다음 작업 |
| --- | --- | --- |
| 1 | R1–R8을 통합 반영 | readiness reset; 전체 무수정 검토 필요 |
| 2 | R9 진입점 수정·R7 시험 격리 구체화 | 무수정 pass 시도가 편집 pass로 전환; 전체 검토 재시작 |
| 3 | 최종 응답의 hash로 확인 | 최신 저장본을 무수정으로 검증하며 결과는 응답에 기록 |

이번 문서 수정 후에는 최신 저장본 전체를 INV-1–INV-6으로 다시 대조하고, coverage stability와
INV-7 무수정 final pass를 수행한다. 최종 판정·문서 hash·재검증 anchor는 응답에서 기록한다.

### 2026-11-05 반복 요청의 전체 검증 — 이력

이 요청은 이전 anchor 일치 여부만 묻는 요청이 아니므로 full INV-1–INV-7을 다시 적용했다.
시작 문서의 SHA-256은 `ee3527567bc38fc65215e133b7c83e01c1cbff7d99cd3526b340d77ce1086274`이고
코드 기준은 그대로 `3e69c58`이다. 코드 이동에 따른 refresh로 분류하지 않는다.

| 이번 발견 | 분류 | 반영 |
| --- | --- | --- |
| Q1: ack commit 뒤 응답 유실/키 제거 실패에도 재진입 복원·POST를 보장한 문장 | blocker | CC-009·Runtime·Artifact·V9에서 서버 초안 존재 여부와 GET-null을 구분 |
| Q2: 모든 응답 실패를 무쓰기로 요구한 완료 조건 | blocker | pre-commit 거부와 post-commit/unknown을 구분하고 커밋 보존·중복 요청 방지·복구를 검사 |
| Q3: HTTP rehearsal의 `Runs items` 양성 assertion 누락 | blocker | 실제 baseline 실패를 확인하고 I-007·V7의 교체 대상과 현재 본문 기대에 반영 |
| Q4: rename의 live `verification.md` 소비자 누락 | blocker | I-003·V3에 pipeline-smoke 설명의 함수 참조 갱신 추가 |
| E1: 문서 작업에서 명령을 재실행하지 않는다는 현시제 설명 | editorial | 새 baseline Command Ledger와 최초 baseline 기록을 분리 |

독립 검토자는 source bundle과 실행 근거를 받아 별도 문맥에서 read-only로 검토했다.
발견한 위 항목은 같은 편집 pass에 반영하고 그 뒤 latest source 전체에 대한 무수정 final pass를
별도로 수행한다. 명령 문자열·준비 계약은 변경하지 않았으므로 이미 실행한 baseline의
명령 증거는 유지하며, 향후 제품 구현 뒤의 결과는 현재 증거로 대체하지 않는다.

### 2026-11-05 문구 원본까지 대조한 후속 전체 검증 — 이력

시작 source는 `a14ff79a9512e6ed593c8414d239fc6db545bebf5167fe2dae190a0d1fc2d0d9`,
코드 기준은 동일한 `3e69c58`이다. 새 repository drift는 없지만 다음 blocker 2건을 발견했다.

| 발견 | 근거 | 해결 |
| --- | --- | --- |
| Q5: 현재 UI 보존 요구와 우선권이 있는 product-copy §18의 옛 표시·정렬 지시가 충돌 | product-copy 머리의 우선순위 규칙, §18, pipeline-list/catalog/model, entities/pipeline/labels, pipeline-rail 및 현재 렌더 시험 | CC-007의 정확한 동기화 표, I-007, 실행 순서, artifact map, V7, DoD에 전파. 제품 동작은 유지 |
| Q6: 유지할 browser 시험이 카탈로그에서 rail을 찾고 옛 표시명·기본 그래프 위치를 가정 | PipelinePageFixture·renderMode의 context, usePipelineNavigation 초기화, src-clean-code-acceptance의 Propose/Add doc-auditor/삽입 index·snapshot 사례 | fixture-only deep link/context·history 정리, 현재 node/selector와 snapshot/CAS 기대를 I-007·V6/V7·DoD에 명시 |

동일 근본 원인의 문구·정렬 사례를 여러 새 제품 결함으로 늘리지 않았다. 명령 문자열과
준비 계약은 그대로이며, 같은 코드·의존성·생성물·로그의 content identity를 확인해 이미
실행한 Command Ledger 증거를 유지한다. 이번 문서 편집은 실제 product-copy나 제품 코드의
구현 완료를 뜻하지 않는다. 편집 후 source 전체를 다시 읽는 별도 무수정 final pass가 필요하다.

### 2026-11-10 e2cc5f4와 실제 DOM을 대조한 전체 검증 — 이력

시작 문서 SHA-256은 `086928f2648da884a1bcd18d6dd02802935df645f4c0edb46f4aa45940e0458d`다.
이번에도 단순 anchor 비교가 아닌 전체 INV-1–INV-7 검증을 적용했다. 처음부터 문서 보완점이
없었던 것은 아니다. 기존 9개 제품 개선안의 방향은 유지하되 아래 문서 공백 1건과 코드 이동에
따른 갱신 2건을 반영했다.

| 발견 | 분류 | 반영 |
| --- | --- | --- |
| Q7: 보존할 standalone/zero-gate 시험의 scope·gate 선택·응답 완료 대기 지시 부족 | blocker | I-007·V6/V7·DoD에 node/rail scope, 실제 gate card 선택, 응답 후 버튼 상태, 호출 수·graph/gates/CAS 관찰 명시 |
| F1: 새 `verify-stall.test.ts`의 `nextFor` 소비자와 fixture 표면 | refresh | V3 rename 목록·기존 stall/owner 회귀 보존, I-007의 item-actions와 DocumentsFixture discard 보존 |
| F2: 3e69c58의 기준·검증 증거가 현재 기준처럼 읽힘 | refresh | 최신 e2cc5f4와 새 실행 근거를 분리하고 2026-11-05 결과는 이력으로 보존 |

독립 read-only 검토와 실제 DOM 결과·제품/fixture 소유 구조를 함께 대조했다. Q7은 새 제품
결함이나 UX 변경이 아니라 기존 시험을 의도대로 유지하기 위한 문서 보완이다. 별도 baseline
실패는 위 ledger에 남겼다. 편집 후 최신 저장본 전체에 대한 독립 검토·coverage stability와
무수정 final pass를 수행하며 최종 문서 identity와 판정은 응답에 기록한다.

### 2026-11-10 af8be6c 기준 후속 전체 검증

시작 source는 `886da7acad96f1754da2119b851332b00356708a73c0c55e4cfbd0c0db6e5b55`다.
전체 INV-1–INV-7을 적용했으며 처음부터 보완점이 없었던 것은 아니다. 삭제 후 문서 검사의
관점에서 Q8을 발견했고, 새 코드 기준에 따른 F3도 반영했다. 제품 개선안 9개의 동작·UX 범위는 유지한다.

| 발견 | 분류 | 반영 |
| --- | --- | --- |
| Q8: 삭제 파일로 향하는 근거 링크 5개와 완료 문서 무수정 지시의 충돌 | blocker | 원관측 commit 고정, I-007의 문서 3개·링크 5개 inventory와 보존 예외, 실행 순서·Runtime/Artifact·V7·DoD에 전파. 현재 제안서 3개는 수정하고 완료 문서 2개는 후속 삭제와 같은 변경으로 지정 |
| F3: DB helper 분리 이후 기준·명령 증거 갱신 | refresh | af8be6c와 현행 helper/support 계약을 대조하고 최신 ledger를 분리 |

이전 완료 기록의 구현 요구를 새 작업으로 상속하지 않는다. 링크 목적지 외 과거 metadata·
판정·서술·결과는 보존한다. 두 차례 연속 coverage 보완이 발견되어 section-to-surface와
검증 destination ledger를 최신 source에서 다시 구성한다. 편집 후 전체 무수정 검토와
독립 대조·coverage stability를 완료한 판정과 identity는 응답에 기록한다.

## Risks and Rollback

원본과 최신 dev 사이에 template release/pinning 등의 변경이 있으므로 특히 CC-003·005·008은
현재 계약을 재대조했다. 이후 기준 변경 시 다시 확인해야 한다. 정적 검토는 실제 응답 순서·브라우저 수명·DB 원자성을
증명하지 않는다. CC-007은 웹 계약과 legacy 서버 계약을 혼동하면 삭제 범위가 커질 수 있다.

후속 구현은 항목별로 되돌릴 수 있는 변경으로 나눈다. 회귀가 발견되면 해당 항목의 코드·
시험·문서를 함께 revert하고 기존 동작을 복구한다. DB 필드·wire 응답·저장된 실행 형식을
변경하지 않는 범위이므로 이 제안 자체는 데이터 복구 migration을 요구하지 않는다.

## Core Implementation Results — 2026-11-10

구현 기준은 `323ce9e51b2a92ad1f00be6ae6a4f95c56cd69e6`이다. 현재 요청의 Core 3건만 구현했으며
서버의 legacy Scout/Pick 함수·DB flag·기존 실행과 Phase 2 코드에는 기능 변경을 하지 않았다.

| 항목 | 구현과 확인 |
| --- | --- |
| CC-009 | POST 확인의 실패 envelope 처리, 401의 기존 세션 종료, 나머지 실패의 입력/key 보존, flow/key/lifetime 검사와 owned abort. 서버 초안이 이미 소비된 재진입은 GET-null·추가 POST 없음 |
| CC-004 | 작업별 Starting…·Stopping…·Approving gate… 표시와 공통 잠금. 성공/거부/unknown·재진입·늦은 unmount 응답, 실제 Escape 입력 확인 |
| CC-007 | 지정 파일 7개와 웹 계약 제거. fresh node/edge manifest의 live Action 10개와 폐기 Action·private draft 부재 확인. 현행 문구·legacy 서버 회귀·근거 링크 보존 |

유지할 browser 시험은 현재 catalog/editor 진입, node label, gate card, snapshot/CAS와 응답 완료
상태를 관찰하도록 갱신했다. 별도 `scripts/rehearsals/rehearse-multiple-pipelines-browser.mjs`에도
남아 있던 옛 sidebar·스위치·표시 기대를 현재 catalog/switcher/Run rules로 갱신했다. 실제 HTTP의
항목 pipeline 변경 시험은 현재 project-work Default 대신 완전한 task pipeline 두 개를 사용해
정상 변경·stale·권한 거부를 검사한다. 제품 동작을 옛 fixture에 맞추지는 않았다.

| 실행 | 결과 |
| --- | --- |
| `npm run verify:fsd`, `npm run verify:server` | Pass |
| `npm run test:architecture` | 222 pass, 2 환경 skip |
| `npm run check` | Pass; scripts 322 pass/2 skip, 기존 `_key` unused-var 경고 1개 |
| `STAGEKEEPER_RELEASED_READERS=required npm test` | 599 pass, 30 환경/설정 조건 skip |
| `npm run test:web` | 802 pass |
| `npm run test:server` | 171 pass, 2 조건부 skip |
| `npm run test:server:integration` | 격리 PostgreSQL 18.4에서 migration·180개 모두 통과 |
| `npm run build` | fresh production build 통과 |
| `RDC_CHECK_ACTION_MANIFEST=true npm run test:server` | 180 pass, 2 조건부 skip |
| CI와 같은 세 manifest flag 및 fresh-name filter | 28 pass |
| src-clean-code 실제 DOM | production/development 각각 146 pass, 0 fail |
| frontend-ux 실제 DOM | production/development 각각 25 pass, 0 fail |
| 복원 확인 regression 대조 | 현재 fixture에 수정 전 hook을 주입하면 26개 중 13 fail, 수정 후 26 pass |
| multiple-pipelines 실제 Next HTTP | live Action 7종, owner/foreign/guest·Free·미선택·연결 해제·stale·GET 무쓰기 통과 |
| 실제 Next 브라우저·DB | 두 탭 stale 초안 보존, 저장 전/후 응답 유실의 version +0/+1, reload의 mutation 0, 실제 Start/Approve/Stop 문구·Escape 잠금·서버 상태 재조회 통과 |
| 별도 multiple-pipelines browser 리허설 | 28 pass, 아래 기존 모바일 overflow 1 fail; 시험을 삭제하거나 skip하지 않음 |

실제 Next는 fresh build와 작업 전용 DB/세션을 사용했고 모델·GitHub 서비스를 호출하지 않았다.
DOM fixture의 Action/GitHub 응답 double과 실제 Next/DB 결과를 구분한다. 모든 임시 UI/Next 서버와
DB를 종료했으며 fixture 사용자 잔여 수는 0이었다.

기존 한계: 390px viewport에서 40자 Default 이름의 요약 줄이 571px까지 늘어나는 mobile overflow가
있다. catalog 항목의 이름은 줄바꿈되며 넘치는 요소는 `Default selection` 요약이다. `PipelineList`의
수정 전후 실행 JS를 TypeScript 변환으로 대조해 바이트가 같은 것을 확인했다. 이번 변경은 해당
타입의 폐기 member만 제거했으므로 이 현상을 신규 회귀나 해결 완료로 분류하지 않는다.
모바일 assertion은 유지했고 독립 후속 수정 대상으로 남긴다. 초기 source-level 재검증의 browser/HTTP
실패와 위 구현 후 결과는 서로 다른 시점의 기록이다.

## Completion or Closure Notes

승인된 Core 3건과 필요한 문서·fixture·검사 갱신을 완료했다. 이 완료 기록은 Core에 한정하며
CC-001·002·003·005·006·008은 구현하지 않았다. 병합·배포·운영 DB 변경은 수행하지 않았다.
기존 완료 문서 두 개는 지정한 근거 링크 목적지만 고정했고 과거 metadata·판정·결과를 보존했다.
