---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-23"
approved-by: "user"
approved-at: "2026-10-23"
approval-scope: "Core FSD-REV-001·002의 실제 코드 수정·관련 회귀·브라우저 검증 및 후속 사용자 요청에 따른 commit·push·dev 대상 PR 생성. Phase 2 003–008, 배포·설치 bundle 생성·병합은 포함하지 않음"
completed-at: "2026-10-23"
verification-summary: "승인된 Core 001·002 구현·검증 완료 및 PR #202 dev 병합. check CI 성공, 로컬 check·build·웹/서버/core 시험과 브라우저 회귀 29건 통과. 기존 UI-only 11건 실패는 production·development 변경 전후 동일. 미선택 Phase 2 003–008은 완료 범위에서 제외"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/server.md"
  - "docs/conventions/product-copy.md"
  - "plugin/README.md"
  - "docs/proposals/completed/2026-10-22-frontend-clean-code-review.md"
---

# src/fsd 프런트엔드 클린 코드 검토·Core 개선 완료 기록

## Summary

승인된 Core 001·002의 구현·검증을 완료했고 [PR #202](https://github.com/Sangeok/stagekeeper/pull/202)가
`check` CI 성공 후 `dev`에 병합됐다. 선택 항목 003–008은 미선택·미구현이며 이번 완료
범위에 포함하지 않는다. 아래 검토·제안·실행 계획은 당시 근거와 후속 후보를 보존한 기록이다.

`frontend-clean-code-orchestrator`의 여섯 독립 렌즈와 별도 중립 품질 검토로
`src/fsd` 전체를 검토했다. 최종 채택 항목은 **Must 1건, Should 1건, Consider 6건**이다.
저장된 파이프라인의 텍스트 설명에 편집 초안이 사용되는 계약 불일치를 우선 수정하고,
중복된 slug 정책을 순수 공통 정책으로 모으는 것을 권고한다. 나머지는 선택적 국소 개선이다.

최초 작업은 검토와 제안서 작성이었다. 당시 애플리케이션·테스트·설정은 수정하지 않았다.
표시 불일치는 소스 데이터 흐름과 명시적 제품 계약으로 확인했으며 브라우저 재현 결과는 아니다.

| 우선순위 | 정규 ID | 개선 항목 | 기여 렌즈 |
| --- | --- | --- | --- |
| Must | FSD-REV-001 | 저장본 설명과 편집 초안의 그래프 분리 | Readability |
| Should | FSD-REV-002 | slug 정책의 단일 소유권과 행동 중심 검증 | Simplicity |
| Consider | FSD-REV-003 | 토큰 이름 변경 폼의 중복 소유 정리 | Cohesion, Simplicity |
| Consider | FSD-REV-004 | 배너의 소유자·세션 차례 판정 명명 | Readability |
| Consider | FSD-REV-005 | 검증 노드 삽입 anchor의 중첩 분기 정리 | Readability |
| Consider | FSD-REV-006 | 공개 UI의 반환 계약 명시 | TypeScript generalist |
| Consider | FSD-REV-007 | 동형 위치 인자에 이름 있는 입력 사용 | TypeScript generalist |
| Consider | FSD-REV-008 | History의 독립 조회 병렬 시작 | TypeScript generalist |

## Goal

- 저장본·초안·편집 기준 버전의 의미를 구분하여 파이프라인 설명을 제품 계약과 일치시킨다.
- 동일 정책을 두 곳에서 수정하고 소스 문자열까지 동기화해야 하는 비용을 줄인다.
- 현재 동작을 유지하면서 작은 중복·판정·호출 계약의 읽기와 변경 비용을 줄인다.

## Proposal Size

`standard`. 전체 범위의 리뷰이며, 후속 구현에는 표시 동작 변경, shared policy의
소유권 이동과 자동 미러링, 중복 UI 삭제, 여러 공개 UI·내부 함수의 계약 변경이 포함될 수 있다.
Consider 6건을 모두 수행해야 한다는 뜻은 아니다. 구현 승인 시 선택한 ID를 명시한다.

후속 구현의 권고 **Core는 001·002**, **Phase 2는 003–008**이다. 기존 Must/Should와
선택 개선의 구분을 실행 범위로 명시한 것이며, 어느 항목도 아직 구현 승인된 것은 아니다.
Phase 2는 승인된 ID만 수행하고 Core 완료 조건에 섞지 않는다. 006은 아래 전체 후보
목록에서 승인한 symbol까지 기록한다. 배포·설치 bundle 생성과 실제 설치 인수는
별도 승인 후 작업이며, 저장소의 core 미러 동기화는 002 Core에 포함한다.

## Current State

### 기준 소스와 범위

- 검토 기준 커밋: `56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf`.
- `src/fsd` tree: `6210fdfda7289a161a38b85f8d93aa0e073df28f`.
- 환경: Node 26.4.0, Next.js 16.3.3, React 19.2.8, TypeScript 5.9.3, `strict: true`.
- 공개 API, 운영 코드, colocated 테스트와 fixture를 포함했다. 검토 종료 시 기준 대비
  `src/fsd` diff가 없음을 확인했다. 아래 소스 permalink는 위 커밋에 고정한다.

| Layer | 전체 파일 | 테스트 파일 | 줄 |
| --- | ---: | ---: | ---: |
| entities | 33 | 9 | 906 |
| features | 116 | 28 | 4,245 |
| pages | 68 | 17 | 3,244 |
| shared | 31 | 9 | 669 |
| widgets | 28 | 9 | 1,871 |
| 합계 | **276** | **72** | **10,935** |

### 검토 방식과 coverage

각 렌즈를 `fork_turns="none"`의 별도 에이전트로 실행하고 같은 원본 대상과 프로젝트
문맥만 전달했다. 실행 용량에 따라 나누어 실행했으며, 앞선 렌즈의 결과를 다음 렌즈에
제공하지 않았다. 별도 독립 품질 검토가 원시 지적 9개를 대조해 정규 항목 8개로 정리했다.
중복인 COH-001·SIM-002는 두 기여를 보존했다. 품질 검토는 1라운드에서 종료됐고
수정 요청·반려·pending-verification은 없다.

**Coverage: Full applicable-lens review — applicable 6, gate-validated N/A 0.**

| 렌즈 | 최종 상태 | 원시 지적 | 채택 기여 |
| --- | --- | ---: | --- |
| Cohesion | Completed | 1 | FSD-REV-003 |
| Coupling | No supported findings | 0 | 없음 |
| Predictability | No supported findings | 0 | 없음 |
| Readability | Completed | 3 | FSD-REV-001·004·005 |
| Simplicity | Completed | 2 | FSD-REV-002·003 |
| TypeScript generalist | Completed | 3 | FSD-REV-006·007·008 |

N/A·Unavailable·Skipped 렌즈와 미해결 품질 검토 충돌은 없다. TypeScript generalist는
타입·오류뿐 아니라 VAR/FN/OBJ/ERR/ASYNC/FMT/CMT/TS/TEST/REACT의 관련 범위를 읽었다.
스킬의 내부 규칙 등급, 단순성 판정, 여러 렌즈의 동의 수를 심각도에 직접 대응시키지 않았다.

[이전 완료 기록](../completed/2026-10-22-frontend-clean-code-review.md)의 토큰 발급
복구 통합·실행 조회 소유권 개선을 미완료 작업으로 재등록하지 않았다. 이번 이름 변경
폼 중복은 발급 폼과 다른 구현이다. 일반 오류 경계와 토큰 unknown의 수동 재제출 허용은
제품 계약을 대조한 뒤 결함으로 채택하지 않았다.

## Scope

포함: `src/fsd` 전체의 프런트엔드 클린 코드 문제와 이를 설명하는 직접 소비처·
아키텍처·서버/순수 정책·제품 문구 계약. 실제 개선 후보와 최소 영향 범위를 아래에 기록한다.

최초 리뷰 산출물은 이 제안서 하나다. 당시 후속 코드 변경, 새 의존성·전역 패턴·라우팅·DB 변경,
서버 전체 감사, 성능/번들 측정, 실제 브라우저·운영 인수는 수행하지 않았다.
특히 `src/server`·`packages/core`의 제안은 FSD가 이미 소비하는 동일 정책을 정리하는
범위이며 별도 백엔드 재설계를 승인하는 내용이 아니다.

현재 코드 대조는 8개 항목과 직접 소비·생성·시험 경로까지 포함한다. 구현 범위는
위 Core/Phase 2 구분과 승인 metadata가 결정한다. 006의 미선택 후보, 새 라우트·자산·
DB 변경, 권한 정책 변경, plugin 설치 배포는 Core 작업이나 완료 조건으로 추가하지 않는다.

## Proposal

### Must — FSD-REV-001: 저장본 설명과 편집 초안 분리

**기여: Readability / READ-001. 정적 근거의 확신도: High.**

근거:

- [pipeline-rail.tsx:34](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx#L34): `state = editor.definition`은 초안이다.
- [같은 파일:57](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx#L57): 초안을 덮어쓴 `activeDefinitions`로 `flat`을 계산한다. 72줄의 편집도 초안만 변경한다.
- [같은 파일:162](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx#L162): Read as text가 같은 `flat.graph`를 출력한다.
- [제품 계약:1525](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/docs/conventions/product-copy.md#L1525): version line과 Read as text는 저장된 server graph를 설명해야 한다.
- [pipeline-list.tsx:97](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/edit-pipeline/ui/pipeline-list.tsx#L97): version line은 서버의 `current.saved`를 사용한다.

저장 전에 노드나 gate를 편집하면 텍스트 설명도 초안으로 바뀌는 데이터 흐름이다.
저장 버전 설명과 텍스트 그래프가 다른 snapshot을 설명한다. Must의 근거는 이름
취향이 아니라 명시적인 표시 계약과 구현의 불일치다. 실제 브라우저 장애를 재현했다고
해석하지 않는다.

최소 변경:

1. `draftDefinition`·`expandedDraft`처럼 초안의 출처를 명확히 한다.
2. Read as text는 최신 서버 prop의 `definition`·`pipelines`로 계산한 별도 그래프를 사용한다.
3. `editor.baseline`은 편집 시작/CAS 기준이므로 최신 서버 설명의 대체물로 사용하지 않는다.
4. 새 미저장 pipeline과 version 0 기본값도 전달된 서버 snapshot을 기준으로 처리한다.
   기존 invalid composition 표시, draft 보존, Save·CAS·stale/unknown 복구는 유지한다.

구현은 기존 `pipeline-rail.tsx` 안에서 끝낸다. `definitions`에 선택 ID의 서버
`definition`을 덮어쓴 `savedDefinitions`를 만들고 기존 `expand`·`sequence`로 텍스트를
계산한다. 현재 `activeDefinitions`의 초안 덮어쓰기는 rail·tooltip·`usersOf`에 유지한다.
`pipelines[].runnable`은 텍스트의 원본으로 쓰지 않는다. fragment도 같은 `expand` 경로를
따른다. 새 pipeline의 빈 서버 입력은 빈 목록이며, 첫 저장 응답부터 새 snapshot 도착
전까지 초안을 저장본으로 위장하지 않는다. `expand` 실패는 저장본의 오류 이유를 표시하고
초안의 `check`/`preview` 오류와 구분한다. 새 상태·effect·model 공개 API는 추가하지 않는다.

완료 기준: Save 전에는 rail만 편집 결과를 보여 주고 version line·Read as text는 같은
서버 snapshot을 설명한다. dirty 상태에서 새 서버 snapshot을 받아도 초안과 원래 저장
기준은 보존하고, 두 저장본 설명은 최신 서버 입력을 따른다. 이름 변경만으로 완료하지 않는다.

### Should — FSD-REV-002: slug 정책의 단일 소유권

**기여: Simplicity / SIM-001. 판정: 개선 권장. 확신도: High.**

근거:

- [project-slug.ts:1](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/create-project/model/project-slug.ts#L1), [서버 slug-rule.ts:1](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/server/projects/slug-rule.ts#L1): `SLUG_MAX`·`SLUG_RE`·`RESERVED_SLUGS`를 각각 소유한다.
- [slug-rule-sync.test.ts:11](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/server/projects/slug-rule-sync.test.ts#L11): 선언문을 정규식으로 추출하여 소스 문자열을 비교한다.
- 실제 소비는 FSD 생성 Action·기본 slug 생성과 서버 REST 등록·자동 slug 생성이다.
  [아키텍처](../../architecture/README.md)는 UI와 서버가 공유하는 순수 정책을 core에 둔다.

현재 불일치는 없고 동기화 시험도 존재한다. 다만 같은 정책을 두 곳에서 수정해야 하며
행동이 같은 리팩터링도 선언문 형태 때문에 시험을 깨뜨릴 수 있다.

세 상수만 순수 core 모듈로 옮겨 기존 두 모듈이 가져오게 한다. 신규
`packages/core/project-slug.mjs`와 행동 시험은 제안 경로다. 현재 `allowJs: true`와
bundler 해석에서 세 export가 `number`·`RegExp`·`Set<string>`으로 추론되는 것을
메모리 compiler host로 확인했다. 별도 `.d.mts`는 만들지 않고 실제 소비자 타입 검사를
완료 조건으로 둔다. FSD의 안내·오류 문구와 서버의
기존 공개 export는 유지한다. 웹 기본값 생성과 서버 suffix/충돌 회피 알고리즘은 합치지 않는다.

양쪽 기존 모듈은 세 상수를 `@harness/core/project-slug.mjs`에서 import하고 명시적으로
re-export한다. `SLUG_HINT`·`SLUG_ERROR`는 FSD에, `REPO_SEGMENT`·`slugCandidate`·
`availableSlug`는 서버에 남긴다. Set의 원소·가변 타입과 RegExp의 source/flags를
유지하고 정책에 쓰기나 환경 의존성을 추가하지 않는다.

현상 유지도 현재 동작을 보장한다. FSD나 서버 한쪽을 직접 공유하면 경계를 침범하므로
세 상수의 core 공유가 작은 변경안이다. 새 core `.mjs`는 자동 미러링 대상이므로
`npm run sync:plugin-lib`와 검증을 포함한다. 기존 `slug-rule-sync.test.ts`의 별도
`REPO_SEGMENT` 대조 시험은 삭제하지 않는다.

완료 기준: 길이 1/2/40/41, 허용 문자와 예약어 `new`, 웹 기본값, 서버 suffix 생성
결과가 유지된다. 문자열 비교의 보장은 행동 시험으로 먼저 옮긴다.

### Consider — FSD-REV-003: 토큰 이름 변경 폼 재사용

**기여: Cohesion / COH-001, Simplicity / SIM-002. 단순성 판정: 선택적 개선.**

[RenameTokenForm:8](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/manage-token/ui/rename-token-form.tsx#L8)과
[RenameUserTokenForm:8](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/manage-user-token/ui/rename-user-token-form.tsx#L8)은
이름 외에 동일하다. 필수 입력·pending·서버 거절·예외·reset/refresh·문구까지 같다.
[사용자 토큰 page:4](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/pages/user-tokens/ui/user-tokens-page.tsx#L4)는
이미 발급 UI를 `manage-token`에서 가져오고, 49줄에서 이름 변경 Action을 주입한다.
공통 이름 변경/복구 계약을 수정할 때 두 구현을 찾아 함께 수정해야 한다.

사용자 토큰 page에서도 기존 `manage-token` public API의 `RenameTokenForm`을 사용한다.
소비자를 옮긴 뒤 중복 UI와 미사용 client export만 정리한다. 사용자 토큰의 서버 Action·
인증 범위는 `manage-user-token`에 유지하고 page에서 원래 Action을 주입한다.
feature 사이 import나 새 Hook·옵션·shared layer는 추가하지 않는다.
현상 유지도 동작상 유효하며, 서버 Action까지 합치면 서로 다른 권한 책임을 섞게 된다.

`manage-user-token/index.ts`의 유일한 export가 이 폼이므로 소비자를 옮긴 뒤 그 파일도
삭제한다. `index.server.ts`는 유지한다. `tests/server/inbox-card-boundary.test.ts`에는
삭제할 `rename-user-token-form.tsx`의 client manifest 존재를 요구하는 시험이 있다.
이 기대값을 기존 폼의 존재·중복 폼의 부재로 바꾸고, 서버 page와 TokenTable의 client
미유입 조건은 보존한다. fresh build 뒤 opt-in manifest 시험까지 수행한다.

완료 기준: 프로젝트·소유자·사용자 토큰의 필수 입력, `Saving…`, 거절·예외 복구,
프로젝트 read-only 시 이름 변경 숨김과 원래 Action 주입을 보존한다.

### Consider — FSD-REV-004: 배너 판정의 의도 명명

**기여: Readability / READ-002.**

[turn.ts:158](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/widgets/turn-banner/model/turn.ts#L158)의
owner pending과 163–168줄의 세션 작업·Inbox 계산을 읽으려면 gate·보류·노드 종류·
project slot·미인수 Accept 예외를 함께 추적해야 한다. 현재 오분류는 확인되지 않았다.
같은 파일의 작은 순수 판정으로 owner 차례와 세션 진행 가능 여부를 명명한다.
현행 조건·결과 순서·handoff·acceptance 우선순위를 보존하고, 별도 계약인 Inbox 판정과
무리하게 공통화하지 않는다. 기존 `turn.test.ts`의 보류·실패 인수·handoff·반복 slot·
다른 ready work 보존 사례가 회귀 기준이다.

### Consider — FSD-REV-005: 삽입 anchor 분기 정리

**기여: Readability / READ-003.**

[rail-state.ts:79](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/edit-pipeline/model/rail-state.ts#L79)의
중첩 삼항은 Verify→Implement, Implementation check→QA/Accept, QA→Accept,
그 외→끝의 규칙을 한 표현식에 모은다. 현재 삽입 순서 오류는 확인되지 않았다.
같은 파일의 작은 anchor 판정 함수에 명시적 분기를 두고 기존 anchor 부재 fallback과
`check` 호출을 유지한다. 새 slice나 범용 그래프 추상화는 필요 없다.
`rail-state.test.ts:86–95`의 QA 유무에 따른 위치 검증을 유지한다.

### Consider — FSD-REV-006: 공개 UI 반환 계약 명시

**기여: TypeScript generalist / TS-001.**

품질 검토의 읽기 전용 AST·symbol 조회에서 공개 API/shared unit으로 노출되는 UI 함수
44개의 반환 타입 생략을 확인했다. 예시는
[Button:34](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/shared/ui/button.tsx#L34),
[ChangePipelineControl:9](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/change-item-pipeline/ui/change-pipeline-control.tsx#L9),
[PipelineRail:25](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx#L25),
[DisconnectedProjectBanner:5](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/manage-project-connection/ui/disconnected-project-banner.tsx#L5),
[BoardItemPage:33](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/pages/board-item/ui/board-item-page.tsx#L33)다.

구현의 우발적인 추론 변경과 의도한 공개 계약을 구별하기 쉽게 하는 선택적 개선이다.
현재 타입 추론이나 소비자가 잘못됐다는 뜻은 아니다. 실제 공개 함수에 현재 반환을
표현하는 `ReactElement`, nullable/비동기 형태 등을 명시하되 `null`·Promise·허용되는
반환을 좁혀 동작을 바꾸지 않는다. 내부·시험 전용 export까지 확대하거나 **44개 일괄
처리를 merge 요건으로 삼지 않는다.** 관련 파일을 수정할 때 범위를 골라 적용할 수 있다.
전체 후보와 공개 경로는 아래 Inventory에 고정한다. 이 목록 밖의 함수나 시험 전용
export를 006이라는 이유만으로 수정하지 않는다.

### Consider — FSD-REV-007: 동형 위치 인자의 의미 명시

**기여: TypeScript generalist / TS-002.**

[rail-state.ts:40](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/features/edit-pipeline/model/rail-state.ts#L40)의
`addSlot(definition, agent, before, plan, context)` 계열은 역할이 다른 문자열 인자가
연속된다. 실제 호출은 `pipeline-rail.tsx:65–68`이다.
[briefing.ts:126](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/pages/project-board/model/briefing.ts#L126)의
`buildBriefing`도 `roster`·`nodes`가 모두 `readonly string[]`인 다섯 위치 인자이며,
호출은 `project-board.server.ts:24–31`에 있다. 일부 순서 변경을 타입만으로 막을 수 없어
호출부를 선언과 대조해야 한다. 현재 순서 오류는 발견하지 않았다.

해당 slice 내부 API에서 혼동 가능한 입력만 이름 있는 객체로 바꾼다. core API·도메인
타입·slice 배치는 유지하고, null destination·optional context와 실제 반환 결과를 보존한다.

대상은 `addSlot(definition, { agent, before, plan, context? })`,
`moveSlot(definition, { id, before, plan, context? })`,
`insertRef(definition, { pipelineId, before, plan, context? })`,
`buildBriefing(rows, { today, roster, nodes, autoProposeEnabled? })` 네 함수다.
`autoProposeEnabled` 생략 시 true를 유지한다. 이 네 함수는 slice 내부 경로로만 소비하며
새 barrel export는 만들지 않는다. `addNode` 등 나머지 함수의 인자 형태는 바꾸지 않는다.

### Consider — FSD-REV-008: History 독립 조회 병렬 시작

**기여: TypeScript generalist / TS-003.**

[project-history.server.ts:47](https://github.com/Sangeok/stagekeeper/blob/56ce42d27d4dbaf5ddec680cc28fe8d065f8f4cf/src/fsd/pages/project-history/api/project-history.server.ts#L47)은
`currentRoundIds` 완료 뒤 49줄의 `withPipelineNames`를 시작한다. 두 작업은 이미 읽은
`page.rows`·`projectId`만 필요하다. 관련 서버 함수는 각각 board와 pipeline 이름을
조회하며, 후자는 pipeline-change note가 없으면 DB 조회 없이 반환한다.

page 조회 이후 두 작업을 함께 시작하여 `Promise.all`로 받는다. 반환 구조·정렬과
조회 실패 시 전체 요청 실패 동작을 유지한다. pipeline-change 이벤트가 포함된 경로의
직렬 대기를 제거할 기회는 있으나 **실측 지연·체감 개선량은 확인하지 않았다.**
이미 시작한 다른 읽기 작업까지 취소된다고 가정하지 않는다.

변경은 `mode === "events"` 분기에 한정한다. `page` 이후
`currentRoundIds(projectId, page.rows.map(row => row.key))`와 기존 event 필터를 적용한
`withPipelineNames`를 같은 `Promise.all`에서 시작한다. items·확장 상세 분기, 최초
page/cutoff/repo 조회, 인증·페이지네이션·이름 fallback은 유지한다. 거절 시 형제 읽기가
추가로 실행될 수 있지만 둘 다 조회이고 새 쓰기·retry·transaction은 없다.
검증은 기존 `tests/server/project-page-loaders.test.ts`의 VM loader를 확장한다.
`server-only` bootstrap이 필요한 시험을 FSD 아래 새 `.test.ts`로 만들지 않는다.

## Affected Files

아래 경로의 `features`·`pages`·`widgets`·`shared`는 `src/fsd` 기준이며 그 밖은
저장소 기준이다. `ui/foo.tsx`와 `ui/foo.test.ts`처럼 나란히 쓴 이름은 각각 실제 파일이다.
소비·보존 파일은 필요 없이 수정하지 않는다. 신규 경로는 제안이며 현재 생성하지 않았다.

| Phase / ID | 변경·추가 대상과 직접 검증·소비처 |
| --- | --- |
| Core / 001 | `features/edit-pipeline/ui/pipeline-rail.tsx`, `pipeline-rail.test.mjs`, `pipeline-list.tsx`; 같은 slice `model/pipeline-draft-state.ts`, `pipeline-draft-state.test.ts`, `rail-state.ts`, `rail-state.test.ts`; `pages/project-pipeline/ui/project-pipeline-page.tsx`, `project-pipeline-page.test.ts`; `scripts/rehearsals/rehearse-multiple-pipelines-browser.mjs`, `tests/server/fixtures/multiple-pipelines-browser.tsx` |
| Core / 001 회귀 | `scripts/rehearsals/rehearse-src-clean-code.ts`, `tests/server/fixtures/src-clean-code-browser.tsx`, `src-clean-code-acceptance.ts`; 기존 project identity·pending·version 0 사례 유지 |
| Core / 002 | `features/create-project/model/project-slug.ts`; 신규 `packages/core/project-slug.mjs`, `packages/core/project-slug.test.mjs`, `features/create-project/model/project-slug.test.ts`; `src/server/projects/slug-rule.ts`, `slug-rule.test.ts`, `slug-rule-sync.test.ts`; 생성 `plugin/lib/project-slug.mjs` |
| Core / 002 소비·회귀 | `features/create-project/model/repo-url.ts`, `repo-url.test.ts`; `features/create-project/ui/new-project-form.tsx`, `new-project-form.test.ts`; `features/create-project/api/create-project.server.ts`; `src/server/projects/api.ts`, `registration-command.ts`, `registration-command.test.ts`, `registration-service.ts`, `registration-service.test.ts`; `src/server/rest/project-registration.ts`; `tests/server/project-registration.test.ts`, `token-issuance-bindings.test.ts`; `scripts/plugin-lib.mjs`, `plugin-lib.test.mjs` |
| Phase 2 / 003 | `features/manage-token/ui/rename-token-form.tsx`, `token-names.test.ts`, `features/manage-token/index.ts`; 삭제 `features/manage-user-token/ui/rename-user-token-form.tsx`, `features/manage-user-token/index.ts`; `pages/user-tokens/ui/user-tokens-page.tsx`, `user-tokens-page.test.ts`; `pages/project-tokens/ui/project-tokens-page.tsx`, `project-tokens-page.test.ts`; `tests/server/inbox-card-boundary.test.ts`, `token-issuance-bindings.test.ts`; 브라우저는 위 src-clean-code fixture/acceptance에 rename 사례 추가 |
| Phase 2 / 004 | `widgets/turn-banner/model/turn.ts`, `turn.test.ts`; 결과를 소비하는 같은 slice `ui/turn-bar.tsx`, `index.ts`의 공개 계약 유지 |
| Phase 2 / 005 | `features/edit-pipeline/model/rail-state.ts#addNode`, `rail-state.test.ts`; 호출은 `features/edit-pipeline/ui/pipeline-rail.tsx` |
| Phase 2 / 006 | 아래 44 symbol 중 승인된 것만. 소유 파일·기존 public API 유지, 해당 기존 시험과 `npm run check`로 소비자 검증 |
| Phase 2 / 007 | `features/edit-pipeline/model/rail-state.ts`, `rail-state.test.ts`, `features/edit-pipeline/ui/pipeline-rail.tsx`; `pages/project-board/model/briefing.ts`, `briefing.test.mjs`, `pages/project-board/api/project-board.server.ts`, `pages/project-board/ui/project-board-page.test.mjs`; `tests/server/project-page-loaders.test.ts` |
| Phase 2 / 008 | `pages/project-history/api/project-history.server.ts`, `tests/server/project-page-loaders.test.ts`; 보존 `pages/project-history/model/history-navigation.ts`, `history-navigation.test.ts`, `history-view.ts`, `pages/project-history/ui/project-history-page.tsx`, `project-history-page.test.ts`, `pages/project-history/index.server.ts` |

### 생성·삭제 preflight와 symbol 경로

현재 신규 세 원본 경로와 `plugin/lib/project-slug.mjs`는 없고 부모 디렉터리는 존재한다.
003의 두 삭제 원본은 존재하며 client 소비자는 UserTokensPage 하나다. 구현 직전에 충돌·
추가 소비자를 다시 확인하고 사용자 파일이 생겼으면 덮어쓰지 않는다.

| Symbol | 현재 소유 → 구현 후 소유 / import·export | 검증 도착점 |
| --- | --- | --- |
| `SLUG_MAX`, `SLUG_RE`, `RESERVED_SLUGS` | FSD `project-slug.ts`와 서버 `slug-rule.ts` → core `project-slug.mjs`; 두 adapter는 같은 이름을 명시적으로 re-export. FSD 내부 상대 import, REST의 `@/server/projects/api`는 유지 | core 행동 시험 + FSD 신규 `project-slug.test.ts` + 서버 `slug-rule.test.ts`에서 각 adapter export와 core의 값/참조 일치. 두 adapter에 로컬 정책 선언이 남지 않는지 확인 |
| `RenameUserTokenForm` → `RenameTokenForm` | 기존 `manage-token/index.ts` export → UserTokensPage의 `@/fsd/features/manage-token` import. `renameUserToken`은 `manage-user-token/index.server.ts` → 원래 route/page의 binding 유지 | 사용자·프로젝트 page 시험, rename 브라우저 사례, fresh client manifest. 삭제 경로 import와 옛 symbol 사용은 0 |
| 007의 네 함수 | 현재 소유 파일 유지, 같은 slice 상대 import 유지; `buildBriefing`의 루트 서버 시험은 기존 직접 참조 유지 | Inventory의 모든 호출·시험을 객체 입력으로 전환. 옛 위치 인자 호출은 0. 새 public export 없음 |

### 006 전체 후보 목록

AST에서 slice `index.ts`·`index.server.ts`의 alias를 실제 선언까지 해석하고 shared UI의
직접 export를 더해, 반환 타입이 없는 PascalCase 함수 선언을 중복 제거했다. 44개다.
표의 UI 경로는 각 slice의 `ui/` 아래다. 일반 slice는 `index.ts`, `서버` 표시는
`index.server.ts`, shared는 표시한 파일 자체가 공개 경로다. 모두 현 위치를 유지한다.

| Slice / unit | 소유 파일 → symbol |
| --- | --- |
| entities/board-item | `not-verified-chip.tsx` → NotVerifiedChip; `over-budget-chip.tsx` → OverBudgetChip |
| entities/project-token | `token-reveal.tsx` → TokenReveal |
| features/change-item-pipeline | `change-pipeline-control.tsx` → ChangePipelineControl |
| features/create-project | `new-project-form.tsx` → NewProjectForm |
| features/edit-backlog | `backlog-form.tsx` → BacklogForm; `remove-backlog-button.tsx` → RemoveBacklogButton |
| features/edit-pipeline | `automatic-scout-control.tsx` → AutomaticScoutControl; `pipeline-list.tsx` → PipelineList; `pipeline-rail.tsx` → PipelineRail |
| features/manage-project-connection | `disconnected-project-banner.tsx` → DisconnectedProjectBanner (서버); `project-connection-control.tsx` → ProjectConnectionControl |
| features/pause-runner | `pause-runner-button.tsx` → PauseRunnerButton |
| features/propose-item | `propose-button.tsx` → ProposeButton |
| features/review-gate | `acceptance-failure.tsx` → AcceptanceFailure |
| features/select-project-for-use | `locked-project-banner.tsx` → LockedProjectBanner (서버); `use-project-control.tsx` → UseProjectControl |
| pages/board-item | `board-item-page.tsx` → BoardItemPage |
| pages/landing | `landing-page.tsx` → LandingPage; `landing-share-card.tsx` → LandingShareCard |
| pages/project-backlog | `project-backlog-page.tsx` → ProjectBacklogPage |
| pages/project-board | `project-board-page.tsx` → ProjectBoardPage |
| pages/project-inbox | `project-inbox-page.tsx` → ProjectInboxPage (서버) |
| pages/project-list | `project-list-page.tsx` → ProjectListPage |
| pages/project-pipeline | `project-pipeline-page.tsx` → ProjectPipelinePage |
| shared/ui/button.tsx | Button, ButtonLink, ExternalButtonLink |
| shared/ui/card.tsx | Card |
| shared/ui/chip.tsx | Chip |
| shared/ui/code.tsx | Code, CodeBlock |
| shared/ui/field.tsx | Field, Input, Textarea |
| shared/ui/monogram.tsx | Monogram |
| shared/ui/section-label.tsx | SectionLabel |
| shared/ui/table.tsx | Table, Td, Th, Tr |
| widgets/app-header | `app-header.tsx` → AppHeader; `project-tabs.tsx` → ProjectTabs |
| widgets/turn-banner | `turn-bar.tsx` → TurnBar |

## Safety Analysis

- 서버 snapshot과 편집 기준 버전은 서로 다른 책임이다. 001에서 초안 보존·CAS 기준을
  지우거나 최신 서버 입력으로 덮어써 설명만 맞추는 방식은 금지한다.
- slug는 순수 core만 공유한다. frontend model에서 서버 모듈을 import하거나 반대
  의존성을 추가하지 않는다. 기존 모듈의 공개 이름과 문구를 보존한다.
- core의 생성 미러는 직접 수정하지 않는다. 기존 동기화 도구와 `check`를 사용한다.
  저장소 산출물은 `plugin/lib/project-slug.mjs`까지다. 별도 승인 후 설치 bundle을 만들면
  `plugin/README.md`에 따라 `plugin/.claude-plugin/plugin.json`과
  `plugin/.codex-plugin/plugin.json`의 버전을 함께 새 버전으로 올리고 새 inventory를
  생성한다. 현재 값은 둘 다 `0.5.18`이지만 미래 후보의 버전으로 고정하지 않는다.
  배포·캐시 갱신·실제 설치 인수는 이 Core의 완료 조건이 아니다.
- 토큰 폼 공유는 UI만 대상으로 한다. 각 Action의 검증·인증·가용성 판정과 page의
  Action prop 주입은 유지한다. feature 간 직접 import와 page 전체 client 전환은 필요 없다.
- 삭제할 UI의 정적 import·barrel·테스트 참조를 확인한 후 client export만 정리한다.
- 선택 개선에서 새로운 전역 상태·Hook 체계·폼 라이브러리·의존성을 도입하지 않는다.
- 라우트·정적 자산 URL·DB schema·토큰/승인/사용량 저장 계약의 변경은 포함하지 않는다.

## Approval

사용자의 실제 코드 수정 요청에 따라 Core 001·002를 수행한다. 승인 기록은 front matter를
기준으로 한다. Phase 2 003–008은 미선택이며 별도 구현 범위에 넣지 않는다.
후속 사용자 요청에 따라 commit·push·dev 대상 PR 생성까지 포함한다.
배포·설치 bundle 생성과 병합은 이번 실행에 포함하지 않는다.

## Execution Plan

1. 승인된 Core/Phase 2 ID와 006의 선택 symbol을 metadata에 기록한다. 신규·삭제 경로와
   import 소비자를 다시 확인하고 변경 전 관련 시험·브라우저 기준선을 기록한다.
2. Core 001의 저장 전 편집·서버 갱신 사례를 먼저 고정하고 저장본 설명을 수정한다.
   기존 초안·CAS·stale/unknown·readonly 계약을 함께 보존한다.
3. Core 002에서 core와 양쪽 adapter의 행동·export 시험을 추가하고 세 상수를 이동한다.
   문자열 비교 시험과 그 전용 read/initializer helper만 제거하고 REPO_SEGMENT 시험은
   유지한다. `sync:plugin-lib`로 정확한 미러를 생성하고 검증한다.
4. 승인된 Phase 2만 별도 묶음으로 수행한다. 003은 page 소비자 전환 → 중복 UI/barrel
   삭제 → manifest 기대값 갱신 순서다. 007은 네 선언과 Inventory의 모든 호출을 함께
   바꾼다. 008은 events 분기와 서버 로더 시험만 변경한다. 006의 일괄 수정은 요구하지 않는다.
5. 각 묶음의 관련 회귀와 필수 검사를 실행하고 기존 실패·새 실패·skip을 나누어 기록한다.
   실행 조건이 부족하거나 새 실패가 남으면 해당 ID는 완료 처리하지 않는다.

### Runtime behavior matrix

| ID / 조건 | 유지·변경할 동작과 확인 지점 |
| --- | --- |
| 001 / 저장본·초안 | 초기 일치 → 노드/gate 편집 후 rail만 변경. Read as text의 `<ol>` 노드·gate·순서와 version line은 서버 입력 유지. Show expanded·tooltip·Also changes는 초안 사용 |
| 001 / dirty 갱신 | 자기 version 상승 시 최신 서버 텍스트·version, 원래 초안/CAS·stale 유지. 참조 child만 바뀌면 최신 child를 saved/draft 각각 확장하고 external-change 경고·no-gate 재확인 유지. rules 변경도 기존 복구 경로 유지 |
| 001 / clean·저장 | clean 새 snapshot을 따라감. 저장 중 중복 요청 0; success 응답만으로 서버 prop을 바꾸지 않고 부모 refresh로 받은 snapshot에서 두 설명 갱신. 더 최신 snapshot을 먼저 받은 경우와 뒤늦은 응답도 현재 draft 모델의 역행 방지 유지 |
| 001 / 예외·재진입 | error는 현재 draft 재시도, stale/unknown은 초안 보존·자동 retry 금지·명시 reload. selected/project key 변경 시 remount, 이전 요청이 다른 선택을 갱신하지 않음. 기존 alive/saving cleanup 유지 |
| 001 / 미저장·제약 | 새 pipeline은 빈 서버 목록, 저장 후 생성 ID snapshot으로 전환. version 0 default의 plan 갱신은 서버 기본값으로 설명. plan/roster/readonly 갱신은 초안 보존·편집 제한. fragment·참조 누락·loop·중복 노드의 saved 확장 결과/오류를 표시하고 draft validation은 별도 유지 |
| 002 | 1/2/40/41자, 첫 문자·대소문자·기호·예약어, 힌트·오류 문구, 웹 기본값과 서버 충돌 suffix/상한/예외가 동일. Action/REST의 인증·입력 검증·등록 transaction·응답은 유지. 정책에는 IO나 가변 상태 갱신을 추가하지 않음 |
| 003 (선택 시) | hs/ho/hu별 기존 Action·row ID binding 유지. 빈 값은 브라우저 required에서 차단, pending 입력/제출 잠금, success는 폼에서 router.refresh를 추가하지 않고 서버 Action의 revalidate 유지, 거절·예외는 reset+refresh. label prop 변경 시 Input key로 최신 이름 표시. 권한·read-only 판정은 기존 page/Action 소유 |
| 004·005·007 (선택 시) | 현재 결과·순서·오류 이유 보존. 004는 held/gate/acceptance/handoff/Inbox의 서로 다른 판정을 유지. 005는 anchor 부재 시 끝 삽입 후 check. 007은 null before·optional context·autoProposeEnabled 기본값 true 유지 |
| 006 (선택 시) | 선언만 추가하고 현재 null·Promise·JSX 반환 경로를 모두 허용. client/server 경계·런타임 출력·public export 목록은 유지 |
| 008 (선택 시) | page 완료 후 두 조회 시작; 각각의 rejection은 전체 loader로 전파. 빈 events/이름 note 없음·누락 version의 null fallback·혼합 event/report 순서와 모든 cursor 유지. items 분기와 route의 owner guard 선행 유지; sibling 조회 취소나 일관 snapshot transaction을 새로 보장하지 않음 |

Next.js 16.3.3의 로컬 `05-server-and-client-components.md`, `forms.md`, `use-router.md`를
대조했다. `router.refresh()`는 서버 데이터를 다시 받아도 보존된 client state를 초기화하지
않으므로 001의 key/수신 상태 모델을 유지한다. bound Action은 그대로 전달하고 화면 전체를
client로 바꾸지 않는다. 이 작업은 새 auth/cache/redirect/timer/subscription을 만들지 않는다.

### Final artifact map

| 최종 출력 | 원본·의존성·우선순위 | 구현 후 검사 |
| --- | --- | --- |
| 001 Pipeline DOM | route → ProjectPipelinePage → project key의 PipelineList → selected key의 PipelineRail. saved props의 definitions + core expand/sequence + entities/pipeline label이 텍스트 본문을 결정; editor.baseline/draft는 저장본 원본 아님 | 브라우저에서 version·rail·`details ol li`를 구분해 실제 본문/순서 대조. 저장·편집 Action 호출 수와 expectedVersion도 확인 |
| 002 순수 정책·미러 | core `.mjs`가 단일 원본, 두 adapter는 같은 export 소비; `scripts/plugin-lib.mjs`가 non-test `.mjs` 전체를 바이트 그대로 복사. 테스트·타입 선언은 미러 대상 아님 | core/adapter 행동·참조 동일, `plugin/lib/project-slug.mjs` 전체 바이트·export·무의존 본문 확인, drift/orphan 0. 설치 배포물은 별도 승인 범위 |
| 003 token DOM·client manifest | 기존 RenameTokenForm + 각 page가 주입하는 bound Action + shared Button/Input. Next fresh build가 client-reference manifest를 결정 | 세 scope 폼 본문/상호작용, 기존 폼 포함·삭제 폼 부재. TokenTable/page의 client 미유입. 오래된 `.next` 결과 사용 금지 |
| 004–007 표시·함수 계약 | 현재 소유 파일·public API·소비자 유지. 새 route/config/generated asset 없음 | 선택 ID의 실제 소비 시험·타입 검사와 아래 보존 기준 |
| 008 History props·DOM | owner route → index.server의 loadProjectHistory → events query/round map/pipeline name map → ProjectHistoryPage. filters/cursor/label fallback은 기존 원본 유지 | 서버 loader 반환값·시작 순서·거절과 UI의 event/report 본문·링크 대조. loader의 Action registry 미등록 유지 |

## Verification Plan

아래는 **후속 구현 시 실행할 계획**이다. 이번 리뷰의 통과 결과가 아니다.

| ID | 검증 도착점과 기대 관찰 |
| --- | --- |
| 001 | 기존 `pipeline-draft-state.test.ts`, `pipeline-rail.test.mjs`, `project-pipeline-page.test.ts` 보존. SSR 초기 렌더만으로 완료하지 않고 실제 브라우저 fixture에서 저장 전 노드/gate 편집, dirty 중 새 서버 snapshot, 저장 성공 후 갱신, 미저장/default, readonly와 invalid composition을 확인 |
| 002 | Inventory의 신규 core·FSD 시험과 기존 서버 slug/등록 시험. adapter와 core의 세 export 동일, 로컬 중복 선언 부재, 경계값·기본값·충돌 suffix·문구·REPO_SEGMENT 보존. 미러 전체 바이트와 runtime export도 확인 |
| 003 | `token-names.test.ts`는 현재 발급 문구만 검사하므로 rename 초기 렌더·required 검증을 추가. 두 page 시험은 각 scope의 row ID/Action binding·read-only를 검증. src-clean-code browser/acceptance에 세 scope의 rename 성공·pending·거절·예외·label 갱신을 추가. opt-in client manifest에서 중복 폼 부재도 검증 |
| 004 | `turn.test.ts`에서 보류 cursor·failed acceptance·handoff·반복 slot·다른 ready 항목·Inbox 목적지와 결과 순서 동일 |
| 005 | `rail-state.test.ts`에서 QA 유무, anchor 부재, 나머지 노드의 삽입 위치와 실패 이유 동일 |
| 006 | 선택한 함수와 실제 소비자 타입 검사. nullable·비동기 반환과 초기 렌더 계약 유지 |
| 007 | `rail-state.test.ts`, `briefing.test.mjs`, `tests/server/project-page-loaders.test.ts` 등 실제 소비 시험에서 인자 변환 전후 결과 동일 |
| 008 | 기존 `tests/server/project-page-loaders.test.ts`의 `loadModule`로 실제 loader를 VM 실행. 두 deferred 조회가 release 전 시작됐는지, 각각 거절 시 전체 reject인지 확인하고 모든 보류 Promise를 settle. 빈/혼합 rows·이름 note 없음/누락·items 비변경·커서/반환을 확인. 기존 History UI 시험과 fresh Action registry의 loader 미등록도 유지 |

001의 브라우저 검증은 기존 `rehearse-multiple-pipelines-browser.mjs`를 확장한다.
이 스크립트는 설치된 playwright-core 경로를 인자로 받고 임시 산출물을 만든다.
이번 검토에서는 실행하지 않았으며, 새로운 브라우저 의존성을 자동 설치하는 계획이 아니다.
`PLAYWRIGHT_CORE_ENTRY`는 기존 설치의 `playwright-core/index.mjs` 절대 경로,
`CHROMIUM_EXECUTABLE`은 그 버전과 호환되는 기존 Chromium 실행 파일 절대 경로로
설정한다. 두 파일·esbuild가 준비되지 않으면 브라우저 인수는 blocked로 기록한다.
저장소 루트의 zsh에서 다음 순서로 실행하며 경로는 따옴표로 보존한다:

```bash
test -f "${PLAYWRIGHT_CORE_ENTRY:?Set the installed playwright-core/index.mjs path}"
test -x "${CHROMIUM_EXECUTABLE:?Set the compatible Chromium executable path}"
node -e 'require.resolve("esbuild")'
node scripts/rehearsals/rehearse-multiple-pipelines-browser.mjs "$PLAYWRIGHT_CORE_ENTRY" "$CHROMIUM_EXECUTABLE"
```

preflight가 하나라도 실패하면 뒤 명령을 실행하지 않는다. 이 runner는 development
bundle이며 CSS는 기존 `.next`가 있으면 읽는다. 따라서 동작·텍스트 검증으로 사용하고
현재 production 스타일/최종 Next 인수의 증거로 쓰지 않는다. 종료 시 browser·HTTP
server를 닫고 임시 results.json/스크린샷 경로를 기록한다.

001의 기존 page 회귀와 선택한 003의 rename 사례는 다음 UI-only runner에서도 production과
development 각각 검사한다. 두 실행은 동시에 띄우지 않는다:

```bash
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only
node --import tsx scripts/rehearsals/rehearse-src-clean-code.ts --ui-only --fixture-development
```

각 실행 후 `http://127.0.0.1:55452/fixture?mode=copy&autorun`에서 결과를 만들고
`/results`의 각 사례를 확인한다. Finish(`/finish`)로 root·보류 응답·대체한 전역 객체·
listener를 정리한 뒤 다음 실행을 시작한다. 003이 미선택이면 rename 사례 추가는 없다.

코드 변경의 공통 검사:

```bash
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run check
npm run test:web
npm run test:server
npm run build
```

002에서 core/미러를 변경하면 `npm run sync:plugin-lib` 후 `npm test`도 실행한다.
003·007·008을 선택한 경우 fresh build 직후 다음 opt-in 검사를 추가한다. 003은 client
manifest, 007·008은 기존 loader의 Action registry 미등록을 확인하며 skip을 pass로 세지 않는다:

```bash
SRC_CHECK_INBOX_MANIFEST=true RDC_CHECK_ACTION_MANIFEST=true npm run test:server
```

현재 날짜의 기준선과 구현 후 결과를 비교한다. 이전 보고서의 UI 실패 11건이나 build
EPERM 기록을 재실행 없이 최신 상태의 기존 실패라고 단정하지 않는다.

### Definition of Done

- 승인된 Core 001·002의 Inventory·Runtime matrix·Final artifact map·검증 도착점을
  모두 충족하고 실제 명령·사례별 결과를 기록한다. saved/draft/CAS 보존과 core/미러
  바이트 일치를 단순 SSR·타입 검사만으로 대체하지 않는다.
- 승인된 Phase 2만 해당 기준을 추가한다. 003의 옛 symbol/import/manifest 항목 부재와
  기존 UI 존재, 007의 모든 호출 전환, 008의 두 시작/두 실패 경로, 006의 선택 symbol별
  기존 반환 허용을 확인한다. 미선택 Phase 2와 설치 bundle은 Core 미완료 사유가 아니다.
- 공통 검사와 선택 ID의 추가 검사를 실행한다. 기존 실패·skip·환경 차단은 근거와 영향,
  후속 해소 경로를 남기며 새 회귀가 남은 ID를 완료로 쓰지 않는다. 실제 설치·운영 인수나
  성능 향상을 실행하지 않고 통과했다고 보고하지 않는다.
- 새 의존성·상태 체계·권한·DB·라우트 변경 없이 소유권과 공개 경계를 보존한다.
  구현 완료 metadata와 lifecycle 이동은 실제 수행·검증 이후에만 적용한다.

## Verification Results

아래 첫 표는 최초 리뷰 당시 결과다. 이번 코드 대조의 추가 근거와 구분한다.

| 검토/검사 | 결과 | 의미 |
| --- | --- | --- |
| 여섯 독립 렌즈의 전체 대상 읽기 | Completed | 276파일, public API·코드·테스트·fixture 포함 |
| 중립 품질 검토 1라운드 | 9개 원시 → 8개 정규 채택 | 중복 1쌍 병합, pending/revise/reject 0 |
| `npm run verify:fsd` | PASS | 읽기 전용 경계 검사. 표시 동작의 정확성을 입증하지 않음 |
| 품질 검토의 메모리 AST·symbol 조회 | 공개 UI 44개 집계 | 타입 검사 통과 결과가 아님 |
| 문서 standard 검사·metadata·링크·정규 ID | PASS | 리뷰 문서의 형식·참조 확인. 실행 SDD의 요구사항 coverage 판정은 아님 |
| 리뷰 채택을 위한 추가 substantiation | 필요 없음/미실행 | pending-verification이 없어 별도 재현 명령을 실행하지 않음 |
| 애플리케이션 lint·타입·회귀·build·브라우저 | Not run | 이번은 코드 수정 없는 리뷰이며 위 표의 검증은 후속 계획 |

### 2026-10-23 제안서와 코드 대조

최초 문서에 보완점이 있었다. `reconciling-proposals-with-codebase`로 확인한 차이는
다음과 같이 본문·Inventory·실행 순서·검증·완료 기준에 반영했다. 리뷰의 심각도와
채택 8개 자체를 바꾼 것은 아니다.

| 보완 영역 | 원문의 부족한 점 → 반영 내용 |
| --- | --- |
| 범위·목록 | 선택 항목과 관련 시험이 포괄적 → Core/Phase 2 구분, 44 symbol 전체 후보, 네 API의 정확한 변경·호출 범위 명시 |
| 001 상태·본문 | saved/draft 분리는 맞으나 참조 갱신·빈 신규 graph·저장 응답/refresh 사이 기준이 부족 → 기존 expand와 상태 모델에 맞춰 각각 명시 |
| 002 정책·생성물 | 타입 선언 판단과 미러 도착점이 미정 → 현재 설정의 추론 확인, 세 export의 provenance·신규 시험·정확한 미러와 별도 설치 배포 경계 확정 |
| 003 삭제·빌드 | 삭제 파일의 존재를 요구하는 opt-in 시험 누락 → `inbox-card-boundary.test.ts`의 fresh client manifest 기대값 전환 포함. 기존 `token-names.test.ts`는 발급 시험이므로 rename 검증 추가 명시 |
| 008 시험 위치 | FSD 아래 새 server loader 시험 제안 → 저장소의 bootstrap 규칙에 따라 기존 루트 서버 로더 시험 확장 |
| 인수·완료 | 브라우저 실행 조건·최종 출력·완료 판정 부족 → 실행 가능한 명령, runtime/artifact map, 실패·skip·미선택 범위 처리 명시 |

대조 기준 HEAD는 `e3fd4f939bb27271ab86cb904ef7c16e2218a0e8`이고 FSD tree는 최초
검토의 `6210fdfda7289a161a38b85f8d93aa0e073df28f`와 같다. permalink는 역사적
근거로 유지한다. 제안서 크기는 standard이나, 이번 **대조 프로파일은 High-Risk**다.
core 생성 미러, client manifest의 삭제 반영, 기존 CAS·권한 경계 보존까지 검토해야 하기
때문이다. 구현/브라우저 인수 완료를 뜻하지 않는다.

| 이번 대조의 실행 근거 | 결과·한계 |
| --- | --- |
| TypeScript AST·alias 재조회 | 공개 UI 반환 타입 생략 44개 재확인. typecheck 전체 통과를 뜻하지 않음 |
| 실제 draft 모델·core의 메모리 실행 | 저장본/초안 차이, dirty 새 version의 원래 CAS 보존, 빈 신규 graph, 참조 확장·누락, 저장 성공 전이 확인. 브라우저 재현 아님 |
| 가상 파일 compiler host | 제안 `.mjs`의 세 export를 현재 tsconfig로 소비하여 semantic diagnostics 0. `.d.mts` 불필요. 파일 emit·전체 프로젝트 타입 검사 없음 |
| 실제 History loader의 VM 실행 | 현재 직렬 시작과 메모리에서만 변환한 Promise.all의 동시 시작·반환·각 거절 전파 확인. DB·지연 측정·제품 코드 수정 없음 |

재검증 경계는 이 문서의 모든 ID·Inventory·symbol 경로·runtime/artifact/검증 표다.
추가·삭제 탐지는 다음 manifest의 파일 집합을 UTF-8 경로 오름차순으로 정렬해
LF로 연결한 SHA-256, 내용 탐지는 각 경로의 SHA-256을 담은 정렬 JSON의 SHA-256으로
구분한다. 이 문서의 최종 content identity와 최종 무수정 통과 여부는 대조 최종 응답에
기록한다. 서명은 과거 근거의 적용 여부를 비교하기 위한 것이며 결함 부재를 보장하지 않는다.

- 재귀 파일 집합: `src/fsd/`, `packages/core/`, `plugin/lib/`, `scripts/checks/`,
  `tests/server/fixtures/`의 일반 파일. 앞의 두 집합은 public API·정책의 후보 추가/삭제,
  뒤 집합은 미러·경계 검사·브라우저 body 의존성을 확인한다.
- 명시적 파일 집합: front matter의 `related` 경로와 `docs/proposals/README.md`,
  `package.json`, `package-lock.json`, `tsconfig.json`, `.github/workflows/check.yml`,
  `scripts/plugin-lib.mjs`, `scripts/plugin-lib.test.mjs`, `scripts/build.mjs`,
  `scripts/rehearsals/rehearse-multiple-pipelines-browser.mjs`,
  `scripts/rehearsals/rehearse-src-clean-code.ts`,
  `src/server/projects/slug-rule.ts`, `slug-rule.test.ts`, `slug-rule-sync.test.ts`, `api.ts`,
  `registration-command.ts`, `registration-command.test.ts`, `registration-service.ts`,
  `registration-service.test.ts` (직전의 `src/server/projects/` 기준),
  `src/server/rest/project-registration.ts`, `src/server/pipeline/board-service.ts`,
  `run-service.ts`, `api.ts`, `api.server.ts`, `contracts.ts` (직전의 `src/server/pipeline/` 기준),
  `tests/server/register-server-only.mjs`, `project-page-loaders.test.ts`,
  `inbox-card-boundary.test.ts`, `project-registration.test.ts`, `token-issuance-bindings.test.ts`
  (직전의 `tests/server/` 기준), `plugin/.claude-plugin/plugin.json`,
  `plugin/.codex-plugin/plugin.json`, `src/app/(app)/p/[slug]/page.tsx`,
  `src/app/(app)/p/[slug]/pipeline/page.tsx`, `src/app/(app)/p/[slug]/history/page.tsx`,
  `src/app/(app)/p/[slug]/tokens/page.tsx`, `src/app/(app)/settings/tokens/page.tsx`.
- 로컬 runtime 문서: `node_modules/next/dist/docs/01-app/`의
  `01-getting-started/05-server-and-client-components.md`, `02-guides/forms.md`,
  `03-api-reference/04-functions/use-router.md`. 무시된 의존성이므로 내용 identity도 포함한다.
- 모든 후보 탐색·내용/AST 조회는 `safe-replay`, build/test/동기화/브라우저 명령은 실행
  계획만 비교하는 `manifest-only`다. 실제 설치·DB·네트워크·운영 성능 관찰은 이번
  대조의 근거가 아니므로 replay로 실행하지 않는다. `.next` 기존 내용은 최종 산출물
  검증 근거로 사용하지 않았다. 구현 인수 때 fresh build로 생성해 검사한다.

### Core 001·002 구현 기록

사용자의 실제 코드 수정 요청에 따라 `harness/fsd-review-core-20261023`에서 구현했다.
기준은 최신 `origin/dev`의 `e3fd4f939bb27271ab86cb904ef7c16e2218a0e8`이다.
원래 checkout의 미커밋 문서와 다른 작업은 보존하고 별도 worktree를 사용했다.
위 리뷰·코드 대조 표는 구현 전의 기록이며, 이 절이 후속 실행 결과다.

- 001: PipelineRail의 초안 정의·확장과 저장본 확장을 분리했다. rail·Show expanded의
  gate·tooltip·영향 목록·검증·저장 입력은 초안을 유지하고 Read as text만 서버 props의
  정의와 참조를 확장한다. 상태 모델·CAS·복구·server/client public API는 변경하지 않았다.
- 002: 세 slug 상수를 `packages/core/project-slug.mjs`로 옮기고 FSD·서버가 같은
  export를 소비하게 했다. 웹 문구·서버 생성 알고리즘은 유지했다. 문자열 initializer
  비교를 제거하고 행동·adapter export 검증으로 대체했으며 REPO_SEGMENT 시험은 보존했다.
  `sync:plugin-lib`로 미러 한 파일을 생성하고 전체 바이트·독립 import·export를 확인했다.
- Phase 2 003–008, 새 의존성·DB·권한·라우트·plugin 배포 변경은 수행하지 않았다.

| 실제 검사 | 결과 |
| --- | --- |
| 변경 전 관련 단위 시험 | 35 pass, 0 fail |
| 변경 후 집중 시험 | 24 pass, 0 fail |
| `verify:fsd`, `verify:server` | PASS |
| `test:architecture` | 136 pass, 0 fail, Windows 전용 2 skip |
| `check` | 미러·lint·Next typegen·타입·scripts 시험 통과. scripts 186 pass, 0 fail, Windows 전용 2 skip |
| `test:web` | 745 pass, 0 fail |
| `test:server` | 139 pass, 0 fail, opt-in client manifest 1 skip |
| fresh build의 관련 opt-in 서버 시험 | inbox 경계·pipeline save·page loader 14 pass, 0 fail, 0 skip |
| `npm test` | 480 pass, 0 fail, 플랫폼/전용 runtime 등 17 skip |
| `build` | Next.js 16.3.3 Turbopack production build 통과 |
| 수정 전 실제 브라우저 재현 | 새 첫 회귀 사례가 원본 dev에서 실패. 저장하지 않은 before Plan gate와 Doc audit가 텍스트에 섞이는 것을 확인 |
| multiple-pipelines 브라우저 | 기존 15 + 신규 14 = 29 pass, pageerror 0. 새 사례는 편집 전후 텍스트, stale·참조 갱신, 저장 응답/refresh, 세 실패, 신규 생성, clean/dirty version 0, fragment·누락·loop·중복 노드를 검증 |
| UI-only production 전체 suite | 변경 전 fresh dev baseline과 변경 후가 사례·기대값·관찰·결과까지 동일: 각각 54 pass / 11 fail |
| UI-only development 전체 suite | 같은 방식으로 변경 전후 직접 비교. 각각 54 pass / 11 fail, 모든 결과 동일 |

multiple-pipelines 변경 전 첫 실행은 `.next` CSS가 없어 모바일 폭 시험이 실패했다.
fresh build의 CSS가 있는 변경 후 실행은 모바일 사례를 포함해 29건 모두 통과했다.

production·development UI-only의 기존 실패 11건은 readonly discard 1, version 0 default 1,
pending 응답 4, project switch 4, zero-gate 확인 1이다. 과거 보고서 수치를 재사용하지
않고 동일 dev 소스의 별도 baseline에서 재실행해 비교했다. 이 실패를 해결했다고
주장하지 않으며, 본 변경으로 추가되거나 달라진 실패는 없다.

## 품질 검토 추적

| 원시 ID | 정규 ID | 최종 판정 | 심각도 |
| --- | --- | --- | --- |
| READ-001 | FSD-REV-001 | accept | Must |
| SIM-001 | FSD-REV-002 | accept | Should |
| COH-001 | FSD-REV-003 | merge-accept(FSD-REV-003) | Consider |
| SIM-002 | FSD-REV-003 | merge-accept(FSD-REV-003) | Consider |
| READ-002 | FSD-REV-004 | accept | Consider |
| READ-003 | FSD-REV-005 | accept | Consider |
| TS-001 | FSD-REV-006 | accept | Consider |
| TS-002 | FSD-REV-007 | accept | Consider |
| TS-003 | FSD-REV-008 | accept | Consider |

READ-001은 이름 문제에 그치지 않는 제품 계약 불일치 때문에 Should에서 Must로
조정됐다. READ-002는 짧은 함수 안의 국소 읽기 비용이고 현재 오류가 없어 Consider로
낮췄다. 중복 기여를 합쳤다는 이유로 심각도를 높이지 않았다.

## Risks and Rollback

최초 리뷰는 정적 검토였으며, 이후 Core의 브라우저 회귀와 검증 결과는 실행 기록에
남겼다. 운영 DB 지연·실제 설치·번들/렌더 비용은 측정하지 않았다. 미선택 008의 지연
크기와 006/007의 우선순위는 후속 구현·측정 맥락에서 정한다. 기존 UI-only 실패 11건은
fresh dev baseline과 production·development 모두 직접 비교했고 변경 전후 동일했다.

후속 구현은 ID 또는 작은 묶음별 커밋으로 나눈다. 문제가 생기면 해당 묶음을 되돌려
UI·소비자·시험을 함께 복구한다. core 이동을 되돌릴 때는 원래 정책 소유 모듈을 복구하고
동기화 도구로 미러를 다시 생성한다. DB/데이터 복구 작업은 필요하지 않다.
최초 리뷰에는 실행 코드 변경이 없었다. 후속 Core 구현을 되돌릴 때는 표시 변경과
정책 이동의 소비자·시험·생성 미러를 각각 함께 복구한다.

## Completion or Closure Notes

승인된 Core 001·002의 코드 변경·관련 단위·브라우저 회귀 검증을 완료했다.
PR #202의 최종 head `8a28d753b8a120718c654e2b8a3f38f5da2073d6`은 `check` CI가
성공했고 merge commit `e55e141acd58b709695576da8cd5689bef7e67fe`로 `dev`에 병합됐다.

Core 완료 기준에 포함하지 않은 선택 항목 003–008 때문에 문서를 active에 남기지 않는다.
이 문서는 `completed/`의 `completed` 기록으로 정리하고, 해당 항목은 미구현 후속 후보로
보존한다. 실제 수행하려면 새 후속 제안서에서 범위·현재 코드·검증 계획을 다시 확정한다.
전체 UI-only suite의 기존 실패는 실행 기록에 분리했으며 전체 인수 통과나 배포 완료를
뜻하지 않는다.
