---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-10-10"
approved-by: "user:Sangeok"
approved-at: "2026-10-10"
approval-scope: "CORE-001~005의 코드 수정과 제안된 회귀 검증"
completed-at: "2026-10-10"
verification-summary: "CORE-001~005 구현 완료. core 208, npm test 394, web 588, server 55, seed 4 통과; check·FSD·build·20개 미러 통과. 환경 조건에 따른 기존 skip은 본문 기록."
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/architecture/README.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/fsd.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/verification.md"
---

# packages/core 클린 코드 검증 및 개선 제안

## 최신 dev 통합 · 2026-10-16

CORE-001~005의 공개 변경을 plugin 개선과 함께 `dev`의 `45b51d3` 위에 통합했다.
Multiple pipelines의 파이프라인 조합 타입 검증과 이번 `NodeFacts.validation` 타입 검증을
모두 유지했다. 최신 lint·type·FSD·architecture·미러·build 및 core/plugin·web·server·격리 DB·
템플릿·Windows 검증 결과와 private 저장소 분리는
[plugin 완료 기록의 2026-10-16 통합 검증](2026-10-10-plugin-clean-code-findings.md)을 따른다.
아래 2026-10-10의 발견·검증 횟수·hash·독립 리뷰는 당시 이력으로 보존한다.

## Summary

**CORE-001~005의 코드 수정과 제안된 회귀 검증을 완료했다.** 단계 경계는 새 순수
`template-boundary.mjs`로 공유하고 기존 deliver API를 보존했다. 검증 증거를
`string | null`과 문자열 완료 판정으로 정렬하고, 중첩 설정 오류에 필드 경로를 추가했다.
이미 적용된 웹 repo 위임을 유지하며 core JSDoc을 보완했고 done 설명을 현행 계약에 맞췄다.

Current State·Review Findings·Proposal·Execution Plan 및 앞선 검증 결과는 검토·승인
시점의 근거와 계획을 보존한 기록이다. 실제 수행 범위와 최종 결과는 Post-edit regression과
Completion or Closure Notes를 기준으로 읽는다.

`frontend-clean-code-orchestrator`의 다섯 독립 렌즈와 별도 중립 품질 게이트로
`packages/core` 전체를 검토했다. 원시 발견 9개를 개선 항목 5개로 통합·채택했으며,
최종 등급은 **Should 3개, Consider 2개**다. 최초 검토에서 기존 core 테스트 188개와 FSD 경계·plugin
복사본 검사는 통과했지만, 별도 메모리 재현에서 단계 경계와 검증 증거의 계약 차이를 확인했다.
제안서 대조 검증에서는 seed 테스트의 기존 fixture 누락도 확인했다. 이 실패의 보완과
명시적 실행을 후속 구현 계획에 포함한다.

문서 검증 당시에는 전체 구현 완료 전이었고, 별도 작업의 부분 구현을 보존하도록
계획했다. 이후 사용자의 코드 수정 요청을 받아 남은 구현·회귀 검증을 수행했다.
제안서 검증의 Review Profile은
**High-Risk**다. 번들 거부/허용, 완료 증거, plugin 복사본과 생성 파일 본문까지 닿기
때문이며, 저장소 metadata의 `proposal-size: standard`와는 별도 분류다.

## Review Findings

실질 영향 순서로 정리했다. ID는 중립 게이트가 부여한 값을 유지한다.

| 우선순위 | ID | 등급 | 개선 항목 | 기여 렌즈 | 주요 근거 |
| --- | --- | --- | --- | --- | --- |
| 1 | CORE-002 | Should | Codex 검증과 스텁 배포의 단계 경계 통일 | Cohesion, Coupling | `packages/core/client-runtime.mjs:35`, `packages/core/deliver.mjs:7` |
| 2 | CORE-003 | Should | 검증 완료 증거의 타입과 런타임 판정 정렬 | Predictability, TypeScript generalist | `packages/core/pipeline.d.mts:14`, `packages/core/pipeline.mjs:116` |
| 3 | CORE-001 | Should | 저장소 주소 해석 정책을 core에서 공유 | Cohesion, Coupling | `packages/core/repo-url.mjs:8`, `:13`, `:16`, `:25` |
| 4 | CORE-004 | Consider | 중첩 설정의 null 오류에 필드 경로 제공 | Predictability, TypeScript generalist | `packages/core/config.mjs:18`, `:30`, `:35`, `:39` |
| 5 | CORE-005 | Consider | done의 설명을 현재 pipeline 계약에 맞춤 | Readability | `packages/core/transitions.mjs:21`, `packages/core/transitions.test.mjs:24` |

등급 기준은 다음과 같다. 렌즈 간 합의 횟수나 하위 스킬의 HARD/DEFAULT/OPTIONAL 표시는
등급을 올리는 근거로 사용하지 않았다.

- **Must:** 현재 흐름의 버그·중단·위험한 부작용·심각한 구조 위반 등 병합을 막을 근거가 충분함.
- **Should:** 유지보수·오용·계약 변경에 의미 있는 비용이나 위험이 있으나 현재 제품 흐름의 장애로 단정하기 어려움.
- **Consider:** 근거가 분명하고 수정이 국소적이지만 긴급도가 낮음.

이번 검토에서 채택한 Must 항목은 없다.

## Goal

- 검증하는 템플릿 경계와 실제 배포하는 경계를 같은 규칙으로 판단한다.
- 검증 증거의 부재를 공개 타입과 런타임에서 일관되게 표현한다.
- 웹·CLI가 동일한 저장소 주소 정책을 사용하도록 동시 수정 책임을 줄인다.
- 설정 오류의 위치와 보드 상태의 의미를 읽는 사람이 정확히 이해할 수 있게 한다.

## Proposal Size

`proposal-size`: standard.

공유 공개 타입과 내부 모듈 소유권을 바꾸고, 웹 소비자·인접 테스트·plugin 배포 복사본까지
5개 이상 파일에 영향이 있다. 정책 자체의 재설계나 DB migration은 필요하지 않다.

## Current State

검토 기준은 **2026-10-10**, 소스 커밋
`6d16410487c4a4ff5e991ee5024e44f9fb9b4ec5`다. 문서 작성 브랜치는
`harness/core-clean-code-proposal`이며 원격 `dev`와 같은 커밋에서 분기했다.
후속 구현 시 기준 커밋 이후의 변경과 근거 행 번호를 다시 확인한다.
아래 40개 파일의 발견과 구현 전 Verification Results는 해당 검토 시점의 기록이다.
같은 HEAD라도 작업 트리의 변경으로 일부 요구가 이미 충족될 수 있다. 실제 구현의
충족 상태와 검증 결과는 완료 기록에 정리했다.

| 확인 집합 | 파일 | 수 |
| --- | --- | --- |
| 구현·인접 테스트 쌍 | `backlog`, `client-runtime`, `config`, `deliver`, `entitlement`, `manifest`, `pipeline`, `qa`, `render`, `repo-url`, `runbook`, `token-validity`, `token`, `transitions`, `usage-window`, `vars`, `watch`, `workspaces` 각각의 `.mjs`, `.test.mjs` | 36 |
| 구현 단독 | `request-rate.mjs` | 1 |
| 공개 선언 | `pipeline.d.mts`, `qa.d.mts`, `transitions.d.mts` | 3 |
| 전체 | 모든 추적 대상 본문 확인 | **40** |

로컬 설정은 Next.js `16.3.3`, React `19.2.8`, TypeScript 의존성 범위 `^5`다.
`tsconfig.json`에는 `strict: true`, `allowJs: true`, `moduleResolution: "bundler"`가 있고
`checkJs`는 설정되어 있지 않다. 따라서 타입 선언이 있는 모듈은 `.d.mts`와 실제 JS
구현의 계약을 함께 확인해야 한다. 검증에 사용한 Node는 `v22.13.1`이다.

아키텍처의 기준은 [README](../../architecture/README.md),
[시스템 개요](../../architecture/system-overview.md), [FSD 규칙](../../architecture/fsd.md),
[불변식](../../architecture/invariants.md), [프로토콜](../../architecture/protocol.md),
[검증 규칙](../../architecture/verification.md)이다. `packages/core`는 프레임워크와 무관한
순수 domain kernel이며 FSD layer가 아니다. `src`와 외부 npm 의존성을 추가하지 않고,
웹·서버·plugin이 필요한 순수 판정을 소비하는 현재 구조를 따른다.

`scripts/plugin-lib.mjs:9–12`는 테스트를 제외한 core `.mjs`를 `plugin/lib`로 미러한다.
`.d.mts`는 배포 대상이 아니며, 복사본을 직접 편집하는 대신 core 구현 수정 후 동기화한다.

### Review coverage

**Full applicable-lens review: 적용 렌즈 5개 완료, gate-validated N/A 0개.**
모든 렌즈는 독립 컨텍스트에서 담당 스킬과 전체 대상을 읽었다. 중립 게이트는 원시
발견·소스·계약·소비자를 확인해 중복과 등급을 판정했으며 새로운 발견을 추가하지 않았다.

| 렌즈 | 상태 | 적용한 관점 | 채택 ID |
| --- | --- | --- | --- |
| Cohesion | Applicable·Completed | 공통 정책·검증 경계의 변경 책임과 소유권 | CORE-001, CORE-002 |
| Coupling | Applicable·Completed | 순수 정책 의존성과 수동 동시 수정의 영향 범위 | CORE-001, CORE-002 |
| Predictability | Applicable·Completed | 입력·공개 타입·완료 판정·오류 계약 | CORE-003, CORE-004 |
| Readability | Applicable·Completed | 상태 의미와 설명을 이해하는 데 필요한 맥락 | CORE-005 |
| TypeScript generalist | Applicable·Completed | JS 구현·선언·테스트에 관련된 전체 클린 코드 규칙 | CORE-003, CORE-004 |

채택 기여 없는 적용 렌즈, N/A, unavailable, skipped, Needs human judgment 항목은 모두 없다.
대상에 없는 JSX·Hook·Props·Context·Store·React/Next 실행 경계와 비동기 구현의 직접 규칙은
적용하지 않았다. 이런 개별 규칙의 비적용을 렌즈 전체의 N/A로 처리하지 않았다.

품질 게이트는 1회 substantive round에서 모든 원시 발견을 다음과 같이 처리했다.

| Raw ID | Disposition | Canonical ID | 최종 등급 |
| --- | --- | --- | --- |
| COH-001 | accept | CORE-001 | Should |
| CPL-001 | merge-accept(CORE-001) | CORE-001 | Should |
| COH-002 | accept | CORE-002 | Should |
| CPL-002 | merge-accept(CORE-002) | CORE-002 | Should |
| PRD-001 | accept | CORE-003 | Should |
| TS-001 | merge-accept(CORE-003) | CORE-003 | Should |
| PRD-002 | accept | CORE-004 | Consider |
| TS-002 | merge-accept(CORE-004) | CORE-004 | Consider |
| RDB-001 | accept | CORE-005 | Consider |

중복 병합은 같은 원인과 호환되는 최소 수정안을 기준으로 했다. CORE-004는 입력 거부가
유지되는 진단 개선이고 CORE-005는 실행 규칙이 올바른 주석 정정이므로 Consider로 확정했다.
수정 요청·거절·검증 대기 항목은 없다.

## Scope

포함 범위는 채택된 다섯 개선 항목의 core 구현·선언·인접 테스트, 웹 위임과 동기화
테스트, 서버·seed·init의 계약 회귀 테스트, 변경된 core 구현의 plugin 미러다.
seed 테스트의 Max 역할 fixture를 먼저 보완한다. `done` 설명을 맞출 때는 같은 오래된
표현이 남아 있는 프로토콜 문장도 정정한다. 정확한 대상은 Affected Files에 고정한다.

UI 디자인 변경, FSD 폴더 재배치, 전체 TypeScript 전환, 전역 `checkJs` 활성화,
플랜·권한·게이트·상태 전이 정책 변경, DB migration, private 템플릿 본문 변경과 배포는
이번 제안 범위에 포함하지 않는다. `src`, `plugin`, `scripts`의 주변 코드 검토는 core
근거와 영향 확인에 한정했다.

## Proposal

### CORE-002 · Should · Codex 단계 경계의 단일 규칙

기여 렌즈: **Cohesion, Coupling**.

`client-runtime.mjs:35`의 `split(/^## step:/m)[0]`는 모든 `## step:` 접두사에서 본문을
자른다. 반면 `deliver.mjs:7`의 `STEP_HEADING = /^## step:(\S+)(.*)$/`와 `:13`의
`stubOf()`는 콜론 바로 뒤에 공백 없는 ID가 있을 때만 단계 제목으로 인정한다.
`deliver.test.mjs:26–29`도 `## step: start`를 경계로 인정하지 않는 계약을 명시한다.

따라서 Codex marker 검증이 보는 스텁과 실제 배포 스텁의 범위가 다르다.
완전한 Free 번들의 `agents/dev.md`를 바꿔 실제 함수로 확인한 결과는 다음과 같다.
`marker`는 `<!-- harness-runtime:harness-runtime-v1 -->`를 뜻하며 마지막 정상 단계에는
본문과 필수 `next: done` 지시어가 있다. 재현용 런북은 marker와 일반 본문만 포함한다.

| 에이전트 원문 순서 | `validateCodexBundle` | `deliverable` 실제 결과 |
| --- | --- | --- |
| marker → `## step: start` → marker → `## step:start` → 본문 | 통과 | 배포 스텁에 marker **2개**가 남음 |
| `## step: start` → marker → `## step:start` → 본문 | protocol mismatch 거부 | 배포 거부. 공용 `stubOf` 결과에는 marker **1개**가 있음 |

초기 `CODEX.runbook.md` 확인은 validator와 공용 스텁 함수의 경계 비교였다. 런북은
`deliver.mjs:34`에서 본문 전체를 배포하므로, 실제 에이전트 스텁 영향은 위
`agents/dev.md` 보강 재현의 결과로 판단했다. 운영 템플릿에서 같은 입력이 존재하는지는
확인하지 않았으므로 제품 장애나 출시 차단으로 확대하지 않는다.

서버 단계 파서는 `src/server/agents/steps.ts:15`, `:39`, `:48`에서 공용 경계를 사용한다.
`src/server/client-bundle-query.ts:19–22`와 `scripts/lib/template-seed-query.ts:21–25`는
번들 검증과 단계 존재 검사를 함께 하지만, 위 입력에는 후속 정상 단계가 있으므로
단계 존재 검사만으로 경계 차이를 해소할 수 없다.

**최소 수정안:** `STEP_HEADING`과 `stubOf()`만 의존성 없는 인접 모듈
`packages/core/template-boundary.mjs`로 옮겨 검증·배포가 함께 사용한다.
`deliver.mjs`의 기존 두 export는 명시적 re-export로 유지해 서버 소비자 변경을 줄인다.
`deliver.mjs`는 `import { stubOf } from "./template-boundary.mjs"`와
`export { STEP_HEADING, stubOf } from "./template-boundary.mjs"`를 사용한다.
호출에 필요한 stubOf만 로컬로 import하고 STEP_HEADING은 re-export만 한다.
`client-runtime.mjs`는 같은 모듈의 `stubOf`를 import해 기존 split 표현식을 대체한다.
`src/server/agents/steps.ts`의 `@harness/core/deliver.mjs` import는 유지한다.
`client-runtime`에서 `deliver`를 직접 import하면 현재 역방향 의존성과 순환을 만들므로,
양쪽이 독립 경계 모듈을 import한다. 기존 정규식, 단계가 없는 본문의 원문 반환,
첫 정상 경계 앞 스텁의 LF 정규화·끝 개행 처리를 그대로 옮긴다.

**완료 기준:** 두 함수의 스텁 경계가 일치하고, 두-marker 사례는 거부하며 한-marker
사례는 공용 스텁 규칙에 따라 허용한다. 기존 정상 번들·플랜별 역할 집합·LF/CRLF 입력·
런북 본문 보존·에이전트 단계 본문 제외 동작도 유지한다. 경계 소유권 이동 뒤에는
`deliver`의 로컬 정규식·함수 정의와 validator의 별도 split 규칙이 없어야 한다.
런북의 배포는 계속 전체 본문이며, 이 작업은 런북 스텁 배포나 단계 파서의 grammar·
fence 처리 재설계가 아니다. marker 검사 대상과 플랜별 필수 파일도 유지한다.

### CORE-003 · Should · 검증 증거 타입과 완료 판정의 일치

기여 렌즈: **Predictability, TypeScript generalist**.

`pipeline.d.mts:14`의 `NodeFacts.validation: unknown`은 `undefined`를 허용하지만,
`pipeline.mjs:116`의 `facts.validation !== null`은 그 값을 완료로 판정한다.
같은 판정은 `advance()`에서도 사용한다(`:137`). 메모리 확인 결과는
`validation: null → false`, `"ok" → true`, `undefined → true`다.

현재 서버의 `src/server/pipeline/run-query.ts:17`, `:58`은 `string | null` 계약이고
`readFacts()`는 DB의 해당 값을 공급한다(`:69`, `:75`, `:83`, `:116`). 현재 정상 서버
경로에서 검증 우회가 발생했다고 주장할 근거는 없다. 문제는 공개 타입을 따르는 새
호출부도 증거 부재를 `undefined`로 표현해 verify를 완료시킬 수 있다는 점이다.
`docs/architecture/protocol.md:296`은 verify 완료를 `validation_record`로 정의한다.

**최소 수정안:** 선언을 `validation: string | null`로 좁히고 런타임은 문자열 기록을
완료 증거로 판정하도록 `typeof facts.validation === "string"`으로 맞춘다.
빈 문자열을 포함한 모든 문자열과 null의 기존 결과를 유지한다. 문자열의 길이·내용
정책은 기존 서버의 기록 검증 책임이며 이 판정에 새로운 내용 검사를 추가하지 않는다.
새로운 상태 모델이나 전체 파이프라인 재설계는 필요하지 않다.

**완료 기준:** null·undefined·문자열이 아닌 값은 완료로 인정하지 않고 문자열은
기존처럼 완료로 인정한다. `nodeDone`뿐 아니라 `advance`도 증거 없는 verify에서 멈춘다.
legacy(`format: null`)와 `slots-v1` 모두 입력별 cursor·entered·transitions 전체를 단언한다.
게이트 유무에 따른 기존 전이와 다른 노드의 완료 규칙을 보존한다. 신규 compile-only
`packages/core/pipeline-types.test.ts`에서 `NodeFacts["validation"]`에 문자열·null은
허용되고 undefined·number·boolean·object는 허용되지 않음을 타입 단언한다.
이 파일은 `tsconfig.json`의 `**/*.ts`와 `npm run check`의 `tsc --noEmit`으로 검증하며,
`.mjs` 런타임 테스트 개수에 합산하지 않는다. 기존 서버·웹 소비자도 같은 타입 검사를 받는다.

### CORE-001 · Should · 저장소 주소 정책의 공유

기여 렌즈: **Cohesion, Coupling**.

기준 커밋의 `repo-url.mjs:8–10`은 웹 파서와 정규식을 함께 수정하라고 명시했다. `:13`, `:16`, `:25`의
`SEGMENT`, 세 패턴과 파싱 순서는
`src/fsd/features/create-project/model/repo-url.ts:13–34`에 반복됐다.
CLI는 core 미러를 사용하고 웹의 `repository-entry-state.ts`, `repository-selection.ts`는
웹 parser를 소비한다.
웹 서버 액션도 `create-project.server.ts:10`, `:29`에서 웹의 `SEGMENT`를 소비한다.

기준 검토에서 문자열 입력 결과의 불일치를 발견한 것은 아니다. 허용 주소 형식을 바꿀 때 두
구현과 테스트를 함께 찾아 수정해야 하고, 한쪽 누락을 plugin 복사본 검사만으로 잡을
수 없다는 유지보수 문제다. core 파서는 외부 import가 없어 브라우저·CLI의 공유에 적합하다.

이번 문서 검증 중 들어온 별도 작업 트리 변경에서는 웹의 core parser 위임·SEGMENT
re-export, 웹의 상수 identity·위임 결과 테스트, 서버의 regex source/flags 비교와 core의
동시 수정 안내 제거가 이미 적용됐다. 이 부분은 `already satisfied`로 보존한다.
core parser의 아래 JSDoc은 아직 없으므로 남은 작업이며, 전체 타입·회귀 검증 완료를
이 부분 구현만으로 선언하지 않는다. 구현 시작 시 변경 여부를 다시 확인한다.

**최소 수정안:** 기존 core의 `parseRepoUrl`·`SEGMENT`를 공통 정책으로 사용한다.
core `parseRepoUrl`에 JSDoc `@param {unknown} input`과
`@returns {{ owner: string, repo: string } | null}`을 명시하고, 웹의 기존 모듈은
`RepoRef`와 문자열 입력 계약을 유지하는 현재의 얇은 위임을 보존한다. `RepoOption`,
`slugFromRepo` 같은 웹 고유 책임은 현재 위치에 둔다. 웹은
`@harness/core/repo-url.mjs`의 `parseRepoUrl as parseCoreRepoUrl`과 `SEGMENT` re-export를
사용한다. 기존 `parseRepoUrl(input: string): RepoRef | null` 위임을 유지한다.
웹의 로컬 `PATTERNS`·SEGMENT 정규식·파싱 루프와 core의 동시 수정 안내가 없는 상태를 유지한다.
새 `.d.mts`는 만들지 않는다. 서버 `project-slug-rule.ts`의 `REPO_SEGMENT`는 이번 범위에서
유지하며, 아래 동기화 테스트가 서버 상수와 core 정책의 일치를 계속 강제한다.

기준 커밋의 `src/server/project-slug-rule-sync.test.ts:25–26`은 웹 `SEGMENT`의 **소스 초기값 문자열**을
비교했다. 현재 작업 트리에서는 새 소유권에 맞게 갱신됐으며 이 검증을 되돌리지 않는다.
기존 slug 규칙 비교도 유지한다. 서버 테스트는 FSD 내부를 import하지 않고 core `SEGMENT`와
서버 `REPO_SEGMENT`의 `.source`·`.flags`를 비교한다. 웹 테스트는 자신의 `SEGMENT`가 core
상수와 동일 객체인지 확인하고 허용·거부 입력으로 위임 결과를 확인한다.

**완료 기준:** 기존 웹/core 입력 사례가 같은 결과를 내고 웹 고유 slug 생성과 repository
선택 동작이 유지된다. parser·SEGMENT의 정책 원본은 core에 있으며 기존 동기화 검증을
삭제하거나 우회하지 않는다.

### CORE-004 · Consider · null 설정 오류의 필드 경로

기여 렌즈: **Predictability, TypeScript generalist**.

`config.mjs:1`, `:8`은 필드 경로가 붙은 오류를 약속한다. 그러나 정상 설정의 `project`,
`executor`, `release`, `scout` 중 하나를 null로 바꾸면 각각 `:18`, `:30`, `:35`, `:39`의
속성 접근에서 native TypeError를 낸다. 네 경우 모두 메모리 실행으로 확인했다.
`plugin/bin/harness-init.mjs:197–198`은 오류 메시지를 그대로 표시하므로 사용자에게
수정할 설정 경로가 전달되지 않는다. 잘못된 설정을 거부하는 동작 자체는 유지된다.

**최소 수정안:** `project`와 제공된 `executor`·`release`·`scout`를 처음 역참조하기 전에
null·배열·객체 여부를 검사하고, 비객체는 기존 `fail(field, "must be an object")`로
거부한다. `project === undefined`의 required 진단과 선택 필드의 undefined 기본값 분기를
먼저 유지한다. throw 기반 반환 계약을 유지하며
새 검증 의존성을 도입하지 않는다.

**완료 기준:** 네 null 입력 모두 `harness.json <field>:` 진단을 제공한다. 선택 필드가
생략된 경우의 기존 기본값과 정상 설정의 정규화 결과는 유지한다. 네 필드 각각 null·
배열·문자열·숫자·boolean을 거부하며 필드 경로를 단언한다. 정상 객체의 내부 필드 오류,
release의 끝 slash 제거·auth 기본값, routine executor, scout, workspace·qa 동작도 유지한다.

### CORE-005 · Consider · done 설명의 정정

기여 렌즈: **Readability**.

`transitions.mjs:21`은 done을 “dev가 끝났다고 보고했다”로 설명하고,
`transitions.test.mjs:24`는 “done은 검증을 거친 에이전트만”이라고 적는다. 실제 규칙은
`transitions.mjs:28`의 `actor: "pipeline"`이고 테스트 `:20–21`도 이를 단언한다.
`docs/architecture/invariants.md:54`, `:61–62`, `protocol.md:258`, `:297`은 서버가
구현 구간 증거를 확인한 뒤 pipeline이 done을 기록한다고 설명한다.

**최소 수정안:** 두 주석을 “done은 pipeline이 구현 구간 완료 증거를 확인한 상태이며,
인수는 별도 acceptedAt으로 기록한다”는 현재 계약에 맞춘다. `protocol.md:325`의 동일한
오래된 표현도 “done은 pipeline이 구현 구간 완료 증거를 확인한 상태이며 인수는 아니다”로
정정한다. 전이 표·인수 조건·acceptedAt 계약을 다시 정의하지 않는다.

**완료 기준:** 완료 전이의 주체와 구현 완료·인수의 차이가 구현·테스트 설명에서 일치한다.
실행 규칙과 API를 바꾸거나 주석만을 검사하는 새 테스트를 추가할 필요는 없다.

## Affected Files

아래 경로를 이 제안의 전체 변경 범위로 고정한다. 이미 충족된 경로를 다시 수정할
필요는 없으며 남은 구현의 diff는 이 목록의 부분집합일 수 있다. 한 행의 축약된 파일명은 같은
디렉터리의 파일이다. 생성 파일은 sync 명령으로만 변경한다. 계획에 없는 생산 코드
변경이 필요해지면 구현 전에 제안서와 검증 경로를 다시 대조한다. 구현 시작 전의
별도 변경은 내용·diff identity와 요구별 충족 상태를 기록하며 이 제안의 diff와 구분한다.

| 경로 또는 영역 | 작업 | 관련 ID·판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `packages/core/template-boundary.mjs`, `template-boundary.test.mjs` | 추가 | CORE-002의 단계 경계만 소유 | low: 순수 내부 모듈이나 기존 경계 동작 보존 필요 |
| `packages/core/client-runtime.mjs`, `client-runtime.test.mjs` | 수정 | CORE-002의 Codex 스텁 검증 경계 공유 | medium: 번들 거부/허용 결과 변경 |
| `packages/core/deliver.mjs`, `deliver.test.mjs` | 수정 | CORE-002의 기존 export·배포 결과 유지 | medium: 런북과 agent 스텁 구분 필요 |
| `packages/core/pipeline.mjs`, `pipeline.d.mts`, `pipeline.test.mjs` | 수정 | CORE-003의 증거 타입·런타임·전진 검증 | medium: 완료 판정과 선언 소비자 영향 |
| `packages/core/pipeline-types.test.ts` | 추가 | CORE-003의 compile-only 양성·음성 타입 단언 | low: core 외부 import 없음, plugin 미러 대상 아님 |
| `packages/core/repo-url.mjs`, `repo-url.test.mjs` | JSDoc·안내 정정·검증 | CORE-001의 공유 파서와 typed 소비 | low: 문자열 입력의 기존 결과 보존 |
| `src/fsd/features/create-project/model/repo-url.ts`, `repo-url.test.ts` | 위임·검증 | CORE-001의 웹 공개 이름·타입 유지 | medium: parser와 slug 책임 분리 보존 |
| `src/server/project-slug-rule-sync.test.ts` | 수정 | CORE-001의 새 정책 소유권을 검증 | low: 기존 slug 비교 유지 |
| `packages/core/config.mjs`, `config.test.mjs` | 수정 | CORE-004의 필드 경로 진단 | low: 기존 생략 기본값 보존 |
| `packages/core/transitions.mjs`, `transitions.test.mjs` | 주석 정정 | CORE-005의 현재 상태 계약 | low: 실행 코드 변경 없음 |
| `docs/architecture/protocol.md:325` | 설명 정정 | CORE-005와 같은 오래된 표현 | low: 현행 정책 보존 |
| `src/server/agents/steps.test.ts`, `src/server/client-bundle-query.test.ts`, `src/server/templates-query.test.ts` | 회귀 보강 | CORE-002의 parser·읽기·직렬화된 REST 결과 | medium: raw 검증과 배포 결과의 연결 |
| `scripts/template-seed-query.test.ts` | fixture 수정·회귀 보강 | CORE-002의 Max 전체 역할과 쓰기 전 검증 | medium: 기존 실패를 숨기지 않음 |
| `plugin/bin/harness-init-dual.test.mjs` | 회귀 보강 | CORE-002의 생성된 역할 instructions·런북·lock | medium: 실제 생성 결과 본문 검사 |
| `plugin/bin/harness-init.test.mjs` | 회귀 보강 | CORE-004의 네 필드 경로를 CLI에서 표시 | low: 별도 tmp fixture에서 실행 |
| `plugin/lib/template-boundary.mjs` | 자동 생성 | 새 core 경계 모듈의 실제 CLI 의존 경로 | medium: 누락 시 CLI import 실패 |
| `plugin/lib/client-runtime.mjs`, `deliver.mjs`, `pipeline.mjs`, `repo-url.mjs`, `config.mjs`, `transitions.mjs` | 자동 동기화 | 변경 원본 6개와 동일한 배포 복사본 | medium: 원본·복사본 불일치 방지 |

추가 4개(경계 구현·테스트, 타입 fixture, plugin 경계 복사본), 기존 수정 29개로 총 **33개**다.
현재 신규 경로 4개가 모두 비어 있고 부모 디렉터리는 존재한다. 구현 시작 시 다시 확인한다.

유지하며 검증할 생산 소비자는 `src/server/agents/steps.ts`,
`src/server/client-bundle-query.ts`, `src/server/templates-query.ts`,
`src/server/pipeline/run-query.ts`, `src/server/project-slug-rule.ts`,
`scripts/lib/template-seed-query.ts`, `plugin/bin/harness-init.mjs`,
`plugin/runtime/codex-agent.mjs`, `plugin/runtime/codex-thread.mjs`다.
웹의 `repository-entry-state.ts`, `repository-selection.ts`, `project-slug.ts`(같은 model),
`src/fsd/features/create-project/api/create-project.server.ts`와 slice public API
`src/fsd/features/create-project/index.ts`, `index.server.ts`도 공개 경로·행동을 유지한다.
변경하지 않는 core 나머지 13개 `.mjs`와 plugin 미러는 sync의 기존 19개 목록에서 변경
원본 6개를 뺀 정확한 집합이며, 새 모듈 포함 후 총 20개 `.mjs`가 서로 같아야 한다.

## Safety Analysis

- **구조:** core를 FSD로 옮기지 않는다. 새 경계 모듈도 core 내부의 순수 코드이며
  `src`·외부 npm 의존성을 만들지 않는다. 예외 승인이나 architecture 검사 억제가 필요하지 않다.
- **import·공개 계약:** `deliver` export와 웹 `repo-url`의 기존 타입·이름을 유지한다.
  경계 모듈은 두 소비자가 아래로 참조해 순환을 피한다. 소스 문자열을 검사하는 기존
  동기화 테스트의 영향까지 확인했다.
- **런타임·배포:** 원본 `.mjs` 변경과 새 모듈을 plugin 미러에 반영하고 바이트 동기화를
  확인한다. 기존 `.d.mts`와 신규 타입 fixture는 plugin 배포 파일로 취급하지 않는다.
- **권한·상태:** 검증 증거의 부재 판정을 좁힐 뿐 사람 게이트·acceptedAt·실행 entry 결합·
  플랜별 허용 역할 규칙을 변경하지 않는다.
- **설정:** null 설정은 계속 거부한다. 정상 입력·선택 필드 생략·기본값을 보존하고 오류
  진단만 경로를 포함하도록 보완한다.

라우트 이동, 정적 자산 URL, 저장소 데이터 구조, DB migration, 브라우저 저장소,
외부 SDK 변경은 제안에 없다. Next.js 진입점을 후속 구현에서 추가로 바꾸게 된다면
저장소 지침에 따라 설치된 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽는다.

## Approval

사용자의 실제 코드 수정 요청으로 구현 승인을 받았다. 승인 기록은 front matter가
단일 기준이다. 제안된 코드 수정·검증을 수행하며 배포는 이번 요청 범위에 없다.

## Execution Plan

1. 구현 승인과 기준 커밋 이후 변경을 확인한다. Affected Files의 신규 4개 경로와 기존
   소비자·scripts를 재열거한다. 요구별 `already satisfied`와 남은 작업, 별도 변경을
   구분한다. CORE-002·003·004가 미구현이면 아래 재현을 before 모드로 실행한다.
   해당 계약이 이미 구현됐다면 after 단언과 각 검증 목적지로 확인하며 before 실패를
   제품 회귀로 오인하지 않는다.
   `scripts/template-seed-query.test.ts`의 역할 fixture를
   `["dev", ...limitsFor("max").agents]`로 고쳐 정상 seed·snapshot·restore 테스트부터
   통과시킨다. qa-verifier·impl-verifier 누락 상태에서 거부 테스트만 통과한 것을 경계
   검증 성공으로 간주하지 않는다. 실제 DB를 사용하는 seed/restore 명령은 실행하지 않는다.
2. CORE-002의 두 사례를 parser-valid fixture로 core·server·seed 테스트에 추가한다.
   경계를 공유하고 기존 export를 유지한다. 두-marker 거부는 seed의 writes=[]와 REST
   404 결과로, 한-marker 허용은 정상 단계 파싱과 직렬화된 스텁 본문으로 확인한다.
   init 테스트에는 유효한 role frontmatter·tools를 둔 동일한 경계 사례를 추가한다.
3. CORE-003의 선언과 런타임 판정을 함께 수정하고 compile-only 타입 fixture를 추가한다.
   verify에서 멈추는 경우와 정상 문자열의 전진을 legacy·slots-v1 모두에서 단언한다.
4. CORE-001의 JSDoc을 보완하고 이미 적용된 웹 위임·export·서버 동기화 테스트를
   보존·검증한다. 시작 시 미충족으로 확인된 부분만 같은 변경에서 적용한다.
   core 입력 정책·웹 slug·선택 책임·서버의 FSD import 금지 경계를 유지한다.
5. CORE-004의 필드 경로 진단과 CLI 표시 테스트, CORE-005의 세 설명을 정정한다.
   정상 설정·기본값·상태 규칙을 보존한다.
6. `npm run sync:plugin-lib`로 신규 1개와 수정 6개 복사본을 반영하고 차이를 확인한다.
   Verification Plan의 모든 게이트와 생성 결과 검사를 수행한다. 아래의 after 모드도
   통과시킨다. 신규 테스트 개수·skip 사유·기존/신규 실패를 별도로 기록하며 실패가 남은
   상태로 완료 처리하지 않는다. 확인이 끝나면 proposal 생명주기 규칙대로 기록한다.

### Symbol provenance and destination checks

| 심볼·책임 | 현재 소유자 → 후속 소유자·공개 API | 후속 import와 유지 소비자 | 존재·부재 검증 |
| --- | --- | --- | --- |
| `STEP_HEADING`, `stubOf` | core deliver 정의 → core template-boundary 정의, deliver 명시적 re-export | deliver·client-runtime의 `./template-boundary.mjs`; 서버 steps는 기존 deliver API | 신규 경계 테스트와 deliver export 동일 객체 단언; deliver 로컬 정의와 client-runtime split 규칙 없음 |
| repo parser·`SEGMENT` | 현재 core 원본·웹 typed wrapper와 re-export → 같은 소유권 유지, core JSDoc 보완 | 웹 `@harness/core/repo-url.mjs`, 기존 웹 호출부 유지, CLI는 미러 | core/web 사례·상수 identity; web `PATTERNS`·로컬 regex·파싱 루프 없음; 서버 regex source/flags 비교 |
| `NodeFacts.validation`, verify 완료 | core 선언+runtime → `string \| null`과 typeof 판정 | 기존 서버 run-query와 웹 pipeline 소비자 유지 | 타입 fixture+check; nodeDone/advance 입력별 전체 결과 |
| 중첩 설정 진단 | core config `fail` → 같은 함수·필드 경로 | CLI는 plugin config 미러를 계속 소비 | core 오류 prefix·정규화; CLI 비정상 종료와 해당 `Config error: harness.json <field>:` 표시 |
| done 설명 | core 두 주석+protocol 보드 설명 → pipeline 완료·별도 인수 | 전이 API·actor 변경 없음 | 기존 transitions 테스트, 세 설명과 protocol 상태 표·구간 종료 절 대조 |

아래 검색은 구현 후 구조 검사다. 검색 결과의 존재만으로 통과하지 않으며 표의 모든
용어를 각각 분류한다. 읽기 전용이며 저장소 루트에서 실행한다.

```powershell
rg -n 'STEP_HEADING|stubOf|template-boundary|split\(' packages/core/client-runtime.mjs packages/core/deliver.mjs packages/core/template-boundary.mjs src/server/agents/steps.ts
rg -n 'PATTERNS|SEGMENT|parseRepoUrl|parseCoreRepoUrl' packages/core/repo-url.mjs src/fsd/features/create-project/model/repo-url.ts src/server/project-slug-rule.ts src/server/project-slug-rule-sync.test.ts
rg -n 'validation|case "verify"' packages/core/pipeline.mjs packages/core/pipeline.d.mts packages/core/pipeline-types.test.ts src/server/pipeline/run-query.ts
```

첫 검색의 `split(`은 template-boundary의 줄 분리와 서버 steps의 기존 단계·지시어 파싱에
허용하며 client-runtime·deliver의 별도 스텁 분리에는 금지한다.
`STEP_HEADING`·`stubOf` 정의는 신규 모듈에만 둔다. deliver는 stubOf import/호출과 두
심볼의 re-export만, steps는 두 심볼의 import/사용만 허용한다. `template-boundary` 경로는
core의 두 소비자에 있어야 하며 신규 파일의 존재도 확인한다. 둘째 검색에서 `PATTERNS`·repo regex 정책과
파싱 루프는 core에만 허용한다. 서버의 `REPO_SEGMENT` 정의는 유지 대상이고 웹의
`SEGMENT` import/export와 wrapper는 허용 대상이다. 셋째 검색의 declaration과 서버
validation은 `string | null`, verify 분기는 typeof 판정이어야 하며 타입 fixture의
부적절한 값은 거부 단언이어야 한다. 다른 노드·필드의 validation 사용은 기존 책임이다.

### Runtime and final artifact checks

| 경계·입력 | 기대 결과와 보존할 결과 | 실제 검증 목적지 |
| --- | --- | --- |
| 완전한 Free/Pro/Max 번들, LF/CRLF, 잘못 띄운 제목 앞뒤 marker | 두-marker 스텁은 거부, 한-marker 스텁은 허용; 정상 제목의 단계 본문은 배포하지 않음; 플랜 밖 역할·다른 client 런북 제외 | core boundary/client-runtime/deliver 테스트, 서버 steps·client-bundle 테스트 |
| Codex 번들 읽기·언어 | 잘못된 bundle은 ok:false; REST는 404와 reason, runtime/templates 없음; REST 언어 fallback 없음; MCP bundle reader의 기존 source 부재 시 en fallback 유지 | client-bundle-query.test.ts, templates-query.test.ts |
| seed·snapshot·restore | Max 필수 역할 모두 포함; 두-marker와 invalid graph는 첫 upsert 전에 거부, writes=[]; 한-marker 정상 graph는 seed 가능; 기존 snapshot hash·body drift·외부 행 보존 유지 | scripts/template-seed-query.test.ts의 Map store |
| verify 증거 null·undefined·number·boolean·object | nodeDone=false; legacy/slots-v1 advance가 verify에 정지, entered=[]·transitions=[] | core pipeline.test.mjs; 기존 서버 run-query.test.ts |
| verify 증거 문자열(빈 문자열 포함), gate 유무 | 기존 cursor·entered·자동 전이 그대로; 다른 slot entry 증거 소비 방지·human gate·acceptedAt 보존 | core pipeline.test.mjs, test:web/test:server, check의 타입 검사 |
| config 네 중첩 필드의 null·비객체와 생략 | 필드 경로 Error와 CLI 비정상 종료; 정상 입력·undefined 기본값·qa/release/workspace 정규화 보존 | core config.test.mjs, plugin harness-init.test.mjs |
| core parser와 기존 web 호출부 | 기존 허용·거부 URL 동일, 비문자열은 core에서 null; 웹 문자열 타입·slug·선택·public API 보존 | core repo-url.test.mjs, 웹 repo-url·repository-entry-state·repository-selection 테스트, check |

최종 본문은 “raw → 검증 → 배포 → render → 파일” 순서로 해석한다. 서버의
`readCodexBundle`이 graph를 검증하고 `deliverable`이 플랜/client를 선택·절단한다.
init의 REST 경로는 이미 절단된 응답을 받아 marker를 재검증하며, 로컬 template 경로는
같은 mirrored deliverable을 거친 뒤 remote runtime/version/entitlement도 대조한다.
공통 `renderTemplate`의 변수 치환 다음 Codex 역할은 `renderCodexRole`로 변환한다.
기존 사용자 수정 파일·다른 client 파일·lock의 이전 hash 보존 규칙은 그대로다.

| 최종 산출물 | 본문 의존성·우선순위 | 확인할 실제 내용 | 검증 목적지 |
| --- | --- | --- | --- |
| REST JSON `templates["agents/dev.md"]`와 플랜별 roles | 요청 client/lang·access plan → raw validator/parser → deliverable | JSON.stringify/parse 후 본문이 공용 stubOf 결과와 같음, marker 1개, PRIVATE STEP·정상 step heading 없음; 잘못 띄운 heading은 기존 stub 규칙상 남을 수 있음 | src/server/templates-query.test.ts |
| `.codex/agents/<workspace.agent>.toml` 및 허용 report roles | 전달 스텁 → workspace/report 변수 → role frontmatter/tools 변환 | `readCodexRole`로 decode한 developer_instructions에 예상 스텁·marker 1개, private step 없음; sandbox_mode·allowed tools·nested/owner disabled 보존 | plugin/bin/harness-init-dual.test.mjs |
| `.claude/agents/<name>.md`, CLAUDE.md managed runbook | 같은 스텁 → 변수 치환; 런북은 전체 본문 | 기존 Claude 기본값·frontmatter·스텁·managed block, Codex 전환 시 Claude 내용 보존 | 기존 init/dual 테스트, npm test |
| `docs/harness/codex-runbook.md`, codex-package.json | 전체 선택 런북 → LF 기반 version → 변수 치환, 별도 metadata | runbook 전체를 renderTemplate 기대값과 비교; package의 client/protocol/runbook/language/verifier 구조 확인. source hash만 맞는 것을 본문 검증으로 대체하지 않음 | plugin/bin/harness-init-dual.test.mjs |
| `docs/plans/{README,template,verification-paths}.md`, docs/agents/README.md | COMMON_DOCS 원문 → 공통 변수 | 정상 fixture의 각 렌더 결과 유지; 다른 client 런북·플랜 밖 agent는 생성하지 않음 | 기존 init/dual 테스트 |
| harness.lock.json·기존 사용자 파일 | planned content → safeTarget/lock 계획, 수정 파일은 skipModified | 새로운 파일 hash와 본문 대응, 다른 client/외부 entry·skip된 이전 hash 보존; 재실행·두 client 순서·dry-run 동작 유지 | 기존 manifest.test.mjs, init/dual 테스트 |
| plugin/lib의 20개 runtime `.mjs` | packages/core가 유일한 원본, sync filter 적용 | 신규 template-boundary 존재, 수정 6개와 유지 13개 모두 동일; orphan 없음; 테스트·선언·타입 fixture 복사 없음 | plugin-lib --check, test:architecture, npm test |

생성 파일 검증은 기존 init 테스트의 임시 root·mock HTTP·fixture verifier를 사용한다.
malformed heading 사례도 유효한 name/description/tools frontmatter와 `next: done`을
제공한다. 정상 허용 사례는 parsed steps가 실제로 존재함을 별도로 확인한다.
거부 사례는 정상 bundle을 제공하는 fixture 응답에 두-marker dev 스텁을 삽입해 CLI가
비정상 종료하고 `.codex`·codex runbook/package·lock을 생성하지 않음을 확인한다.
CLI config 실패 네 사례도 기존 정상 fixture의 필드 하나만 바꾸고 생성 대상 부재를
확인한다. mocked server·Map store는 운영 DB나 실제 모델 격리의 인수 증거가 아니다.

## Verification Plan

후속 구현의 회귀 검증이며, 아래 명령은 이번 문서 작성만으로 통과했다고 기록하지 않는다.

```powershell
# core의 행동 변경과 새 경계 모듈
node --test "packages/core/*.test.mjs"

# 실제 plugin 소비와 웹/서버 소비의 회귀
npm test
npm run test:web
npm run test:server

# npm test/test:web/test:server/check에 포함되지 않는 seed-query TS 테스트
node --import tsx --test scripts/template-seed-query.test.ts

# 배포 복사본과 필수 저장소 게이트
node scripts/plugin-lib.mjs --check
npm run verify:fsd
npm run test:architecture
npm run lint
npm run check
npm run build
```

`npm run check`는 복사본 검사·lint·Next typegen·`tsc --noEmit`·아키텍처·사용 가능성
테스트를 포함한다. 중복 실행이 되는 게이트는 기존 CI 실행 결과와 함께 기록할 수 있다.
check의 Next typegen/증분 타입 캐시와 build의 Prisma generate·Next 출력은 파일을 만든다.
문서의 no-edit 대조에서는 명령 정의만 검사했으며 구현 후 게이트로 남긴다.

다음은 **구현·sync 후에만 실행할** 미러의 정확한 목록·raw bytes 검사다. 현재 원본은
19개이므로 구현 전에는 20개 단언을 충족하지 않는다. sync의 `.mjs` 필터 검사 외에
plugin 디렉터리 전체를 대조해 불필요한 선언·테스트 복사도 잡는다.

```powershell
@'
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
const modules = readdirSync('packages/core')
  .filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).sort();
assert.equal(modules.length, 20);
assert.ok(modules.includes('template-boundary.mjs'));
assert.deepEqual(readdirSync('plugin/lib').sort(), modules);
for (const name of modules) {
  assert.deepEqual(readFileSync(`plugin/lib/${name}`), readFileSync(`packages/core/${name}`), name);
}
console.log('20 runtime mirrors match exactly');
'@ | node --input-type=module -
```

| ID | 의미 있는 회귀 기준 |
| --- | --- |
| CORE-002 | 잘못 띄운 제목 뒤의 정상 경계에서도 검증·배포가 같은 스텁을 본다. marker 개수, CRLF, 플랜 역할 집합, 단계 본문 제외를 확인한다. |
| CORE-003 | `nodeDone`와 `advance`가 null·undefined 증거를 완료로 인정하지 않는다. 기존 문자열 증거의 정상 전진과 타입 소비자 호환성은 유지된다. |
| CORE-001 | 웹/core의 기존 허용·거부 입력 결과가 일치하고 웹 slug·선택 기능은 유지된다. 서버의 repository 규칙 검사와 기존 slug 비교도 유효하다. |
| CORE-004 | 네 null 입력 오류에 해당 필드 경로가 있고 선택 필드 생략과 기본값은 유지된다. |
| CORE-005 | 주석은 현행 행위자·구현 완료·인수 구분과 일치한다. 기존 상태 규칙 테스트로 행동 보존을 확인한다. |

### 읽기 전용 재현

저장소 루트 PowerShell에서 실행한다. 실제 core 함수를 메모리에서 호출하며 파일·캐시·
DB를 쓰지 않는다. 기본은 before 모드로 현재 차이를 단언한다. 후속 수정 뒤에는 마지막
명령에 `--after`를 붙여 `node --input-type=module - --after`로 실행한다. 단언 실패는
비정상 종료하므로 오류를 출력하고도 성공으로 종료하는 재현이 아니다. 이 작은 재현은
core 경계만 확인하며 위 서버·생성 파일·타입 회귀를 대체하지 않는다.

```powershell
@'
import assert from 'node:assert/strict';
import { COMMON_DOCS, RUNTIME_MARKER, validateCodexBundle } from './packages/core/client-runtime.mjs';
import { limitsFor } from './packages/core/entitlement.mjs';
import { deliverable, stubOf } from './packages/core/deliver.mjs';
import { advance, nodeDone } from './packages/core/pipeline.mjs';
import { parseHarnessConfig } from './packages/core/config.mjs';

const after = process.argv.includes('--after');
const normal = `${RUNTIME_MARKER}\nStub\n## step:start\nPRIVATE STEP\nnext: done\n`;
const runbook = `${RUNTIME_MARKER}\nFull runbook\n`;
const rows = [{ path: 'CODEX.runbook.md', body: runbook },
  ...COMMON_DOCS.map(path => ({ path, body: 'Shared documentation\n' })),
  ...['dev', ...limitsFor('free').agents].map(role => ({ path: `agents/${role}.md`, body: normal }))];
const bodies = [
  `${RUNTIME_MARKER}\n## step: start\n${RUNTIME_MARKER}\n## step:start\nPRIVATE STEP\nnext: done\n`,
  `## step: start\n${RUNTIME_MARKER}\n## step:start\nPRIVATE STEP\nnext: done\n`,
];
for (const [index, body] of bodies.entries()) {
  const candidate = rows.map(row => row.path === 'agents/dev.md' ? { ...row, body } : row);
  const rejected = after ? index === 0 : index === 1;
  assert.equal((stubOf(body).match(/<!-- harness-runtime:[^>]+ -->/g) ?? []).length, index === 0 ? 2 : 1);
  if (rejected) {
    assert.throws(() => validateCodexBundle(candidate, 'free'), /Codex bundle protocol mismatch: agents\/dev\.md/);
    assert.throws(() => deliverable(candidate, 'free', 'codex'), /Codex bundle protocol mismatch/);
  } else {
    validateCodexBundle(candidate, 'free');
    const result = JSON.parse(JSON.stringify(deliverable(candidate, 'free', 'codex')));
    assert.equal(result.templates['agents/dev.md'], stubOf(body));
    assert.equal(result.templates['CODEX.runbook.md'], runbook);
    assert.doesNotMatch(result.templates['agents/dev.md'], /PRIVATE STEP|^## step:\S/m);
  }
}
const graph = { nodes: ['plan', 'verify', 'implement', 'accept'], gates: [] };
for (const format of [null, 'slots-v1']) for (const validation of [null, 'ok', '', undefined, 0, false, {}]) {
  const facts = { format, status: 'in_review', validation, accepted: false, closedAgents: [], approvedGates: [] };
  const done = after ? typeof validation === 'string' : validation !== null;
  assert.equal(nodeDone('verify', facts), done);
  assert.deepEqual(advance(graph, 'verify', facts), done
    ? { cursor: 'implement', entered: ['implement'], transitions: [{ from: 'in_review', to: 'implementing' }] }
    : { cursor: 'verify', entered: [], transitions: [] });
}
const base = () => ({ version: 1, project: { owner: 'o', repo: 'r', branch: 'main' },
  workspaces: [{ id: 'app', path: '.', agent: 'dev', verify: ['npm test'] }] });
for (const field of ['project', 'executor', 'release', 'scout']) {
  assert.throws(() => parseHarnessConfig({ ...base(), [field]: null }), after
    ? new RegExp(`^Error: harness\\.json ${field}:`)
    : TypeError);
}
console.log(`${after ? 'after' : 'before'} assertions passed`);
'@ | node --input-type=module -
```

## Verification Results

아래 결과는 각각 기록한 검토 시점의 관측이며 최신 작업 트리의 인증이 아니다.
이번 검증 중 발생한 별도 코드 변경 이후에는 미러와 관련 테스트를 새 기준으로
확인한다. 기존 PASS 횟수를 새 실행 결과로 재사용하지 않는다.

### Review-mode substantiation · 2026-10-10

| 검증 | 실제 결과 | 범위 |
| --- | --- | --- |
| `node --test "packages/core/*.test.mjs"` | **PASS: 188/188**, fail 0, skipped 0 | 수정 전 기존 core 테스트 |
| `npm run verify:fsd` | **PASS** | 현재 저장소의 정적 의존 경계 |
| `node scripts/plugin-lib.mjs --check` | **PASS: plugin/lib in sync** | 현재 core 구현과 배포 복사본 |
| 메모리 재현: `agents/dev.md`의 단계 경계 | 두-marker 원문은 검증·배포 통과 후 실제 스텁에 marker 2개. 한-marker 원문은 거부되지만 공용 스텁에는 marker 1개 | CORE-002의 계약 차이 확인 |
| 메모리 재현: `nodeDone("verify", facts)` | null=false, 문자열=true, undefined=true | CORE-003의 오용 가능한 입력 확인 |
| 메모리 재현: 네 중첩 필드 각각 null | 모두 native TypeError, 해당 필드 경로 진단 없음 | CORE-004의 오류 계약 차이 확인 |
| 정책·주석·소비자·타입 정적 대조 | 중립 gate 채택 | CORE-001·005와 재현 결과의 영향 범위 확인 |
| 문서 산출물 검사 | **PASS**: metadata·UTF-8·상대 링크·공백·본문 재현 스크립트 실행 | 이 문서의 형식과 재현 가능성 |

위 188개 기존 테스트 통과는 별도 재현 사례의 계약 문제를 부정하지 않는다. 실제 DB,
private 운영 템플릿, 모델 실행이나 배포 환경은 이번 검증에 사용하지 않았다.

### Proposal reconciliation baseline · 2026-10-10

`reconciling-proposals-with-codebase`로 문서 개선을 시작하기 전에 측정했다.
생산 코드와 기존 테스트 본문은 이 작업에서 바꾸지 않았다.

| 검증 | 실제 결과 | 의미 |
| --- | --- | --- |
| core 전체 `.test.mjs` 재실행 | **PASS 188/188**, fail/skip 0 | 기존 review 기준을 재확인 |
| `node --import tsx --test src/server/client-bundle-query.test.ts src/server/agents/steps.test.ts src/fsd/features/create-project/model/repo-url.test.ts src/server/project-slug-rule-sync.test.ts` | **PASS 26/26**, fail/skip 0 | 현재 소비자 계약 기준 |
| `node --import tsx --test src/server/templates-query.test.ts` | **PASS 19/19**, fail/skip 0 | 현재 최종 REST 응답 기준 |
| `node --test plugin/bin/harness-init-dual.test.mjs` | **PASS 5/5**, fail/skip 0 | 현재 실제 생성·두 client·lock 기준, 임시 파일 사용 |
| `node --import tsx --test scripts/template-seed-query.test.ts` | **FAIL: pass 1, fail 2, skip 0**, exit 1 | 기존 fixture에 qa-verifier·impl-verifier 누락; `Codex bundle missing: agents/qa-verifier.md`. Execution Plan 1에 보완 포함 |

seed 테스트는 npm test의 core/plugin glob, test:web의 src glob, test:server의 tests/server
glob, test:architecture의 scripts/*.test.mjs 어디에도 속하지 않는다. check 역시 이 TS
테스트를 실행하지 않는다. 따라서 독립 명령을 생략하면 이 실패와 신규 경계 회귀를
놓친다. seed/restore의 실제 DB 실행은 수행하지 않았다.

### REC-005 재검증 관측 · 2026-10-10

REC-005의 증거 경계 보완 후 아래 검증을 수행했다. 테스트는 현재 코드 기준이며,
메모리 시뮬레이션은 제안의 실행 가능성 확인이다. 생산 파일이나 기존 테스트 본문에
제안 변경을 적용하지 않았으므로 구현 후 통과 결과로 취급하지 않는다.

| 검증 | 실제 결과 | 범위 |
| --- | --- | --- |
| `node --import tsx --test src/server/templates-query.test.ts src/server/rest-scope.test.ts src/server/token-usage-query.test.ts` | **PASS 27/27**, fail/skip 0 | REST 최종 응답·거부 문구·선택적 사용 기록 실패 격리 |
| `node --test plugin/bin/harness-init-dual.test.mjs` | **PASS 5/5**, fail/skip 0 | 실제 생성 파일·lock·동시 init·dry-run·실패 시 생성 부재 |
| 본문 before 단언, 두 인라인 JS 스크립트 구문·경로·형식·19개 현재 미러 대조 | **PASS** | 현재 기준과 구현 전/후 명령의 용도 구분 |
| 제안 변경을 메모리 모듈에만 적용한 after·서버 parser/REST·역할 decode·seed·config 단언 | **PASS**: 3플랜×2개행, Max 쓰기 전 거부, 비객체 입력 20개 | 실제 함수와 제안 변경의 연결; 운영·설치 인수 아님 |
| 메모리 compile-only 타입 fixture | 현재 선언: 의도한 음성 단언 오류 4개, 제안 선언: 오류 0개 | string/null 허용, undefined/number/boolean/object 거부 |

### Post-edit regression (application)

**완료 · 2026-10-10.** 아래는 승인된 코드 수정 후 실제 실행 결과다. 새 런타임 회귀
테스트는 30개이며 compile-only 타입 fixture는 이 수와 분리한다. 기존 seed fixture의
Max 역할 누락도 보완해 정상 seed·snapshot·restore와 쓰기 전 거부를 함께 통과시켰다.

| 검증 | 결과 | 확인 범위 |
| --- | --- | --- |
| `node --test "packages/core/*.test.mjs"` | **PASS 208/208**, skip 0 | 공유 단계 경계·기존 deliver export·두 pipeline 형식·설정·repo·상태 규칙 |
| `npm test` | **PASS 394**, fail 0, skip 2 / total 396 | core와 실제 plugin CLI·생성 역할·런북·package·공통 docs·lock·실패 시 쓰기 부재 |
| `npm run test:web` | **PASS 588/588**, skip 0 | 웹·서버 소비자, parser·bundle·직렬화 REST 결과·공유 repo 정책 |
| `npm run test:server` | **PASS 55**, fail 0, skip 1 / total 56 | 서버 composition·인증·행동·기존 acceptedAt/entry 계약 |
| `node --import tsx --test scripts/template-seed-query.test.ts` | **PASS 4/4**, skip 0 | Max 전체 역할·marker/graph 검증·쓰기 전 거부·snapshot·restore |
| `npm run sync:plugin-lib` | **PASS**, 7 copied, 0 removed | 신규 경계 1개와 수정 6개의 배포 복사본 |
| `npm run verify:fsd` | **PASS** | 기존 의존 방향·public API·서버/FSD 경계 |
| `npm run check` | **PASS** | 미러·lint/FSD·Next typegen·tsc(타입 fixture 포함)·architecture·project availability |
| check 안의 `npm run test:architecture` | **PASS 44**, fail 0, skip 2 / total 46 | 경계 검사·미러·실행 스크립트 계약 |
| check 안의 project availability 테스트 | **PASS 18/18**, skip 0 | 기존 소유권·사용 가능성 계약 |
| `npm run build` | **PASS** | Prisma generate·Next production build·TypeScript·15개 정적 페이지 생성 |
| 본문 after 재현·소유권 이동 구조 검사·raw bytes 비교 | **PASS** | 기존 정의 부재·새 import/public export·20개 전체 runtime 미러·orphan 부재 |

환경 조건에 따른 기존 skip은 오류를 숨기기 위해 추가한 예외가 아니다. npm test의
실제 Windows native preflight/snapshot 인수는 별도 runtime 설정이 필요하고 POSIX PATH
검사는 Windows에서 제외된다. architecture의 실제 LPAC readlink·silent IPC spawn 검사는
별도 Windows runtime 환경을 요구한다. 서버의 fresh Inbox manifest 검사는
`SRC_CHECK_INBOX_MANIFEST=true`일 때만 실행된다. 이 환경별 인수는 core 제안의
실제 모델·Windows 설치 인증·Next UI 수명 제외 범위에 속하며, 로컬 통과를 해당 인증으로 확대하지 않는다.

## Risks and Rollback

CORE-002는 비정상 단계 제목이 섞인 번들의 거부/허용 결과를 바꾸므로 기존 정상 번들과
에이전트 스텁 계약을 함께 확인해야 한다. CORE-003은 그동안 공개 타입이 허용하던 값의
범위를 좁히므로 현재 서버 계약뿐 아니라 새 타입 소비자의 오류도 확인한다.
CORE-001의 웹 소스 초기값 검사는 현재 작업 트리에서 새 소유권에 맞게 바뀌었으므로
그 테스트와 기존 slug 검증을 보존·재실행한다. 별도 코드 변경을 포함한 기준이 바뀌면
과거 실행 결과와 재검증 anchor를 최신 인증으로 취급하지 않는다. 운영 템플릿에서의
발생 빈도와 사용자 장애는 아직 확인하지 않았다.

각 개선 항목을 구분 가능한 변경 단위로 구현한다. 문제가 생기면 해당 core 구현·선언·
소비자·테스트·plugin 복사본을 함께 revert한다. 경계 모듈을 제거하는 revert에서는 소비
import도 함께 복원하고 복사본의 orphan이 남지 않도록 동기화한다. DB나 저장 데이터
계약 변경은 없어 데이터 복구 절차는 필요하지 않다.

## Completion or Closure Notes

사용자의 실제 코드 수정 요청을 승인으로 기록하고 CORE-001~005를 구현·검증했다.
구현 시작 시 웹 `repo-url.ts`·웹 테스트·서버 규칙 동기화 테스트는 이미 충족돼 있어
보존했다. 승인된 33개 코드/architecture 경로 중 이번에 추가·수정한 경로는 30개
(신규 4개·기존 수정 26개)다. 앞서 존재한 plugin 개선 변경은 시작 전 내용 identity와
대조해 보존했고 이 제안의 변경으로 계산하지 않았다.

CORE-001은 core JSDoc·비문자열 회귀와 기존 공유 정책을 확인했다. CORE-002는
공유 경계·public re-export, 3플랜×LF/CRLF 거부/허용, 서버 parser·REST·seed·실제 CLI
decoded instructions와 전체 런북·package·공통 문서·lock을 확인했다. CORE-003은
타입·두 형식의 cursor/entered/transitions·문자열/사람 게이트 보존을 검증했다.
CORE-004는 비객체 20개와 네 null 설정의 실제 CLI 진단·쓰기 부재를 확인했다.
CORE-005는 세 설명을 pipeline 완료·별도 인수 계약에 맞췄으며 실행 정책은 보존했다.

기존 seed fixture 실패는 해결됐고 최종 실행 실패는 없다. private 템플릿의 실제 발생
빈도, 실제 DB seed/restore·모델·Windows 설치/제품 인수는 이 작업의 잔여 구현 항목이
아니며 별도 운영/runtime 검증 대상이다. 코드 변경과 테스트는 작업 트리에 남겨 두었고
2026-10-10 완료 당시에는 커밋·PR·배포를 수행하지 않았다. 이 문서는 완료 기록으로 `completed/`에 이동했다.
후속 공개 코드 통합은 위 2026-10-16 기록을 따른다.

## Review Checklist

- [x] 원본 40개 파일과 관련 architecture·소비자·배포 경계를 확인했다.
- [x] 다섯 독립 렌즈와 중립 gate의 처리 결과·ID·기여 렌즈를 기록했다.
- [x] 개선안별 정확한 근거 위치, 현재 영향의 한계, 최소 수정안을 연결했다.
- [x] 현재 리뷰의 실행 결과와 후속 구현의 검증 계획을 구분했다.
- [x] 상태·승인 metadata, 영향 파일, 위험과 롤백을 기록했다.
- [x] 고정된 변경 33개와 공개 API·새 import·기존 정의 부재 검사를 연결했다.
- [x] seed의 기존 실패와 독립 실행 명령, parser-valid 재현을 반영했다.
- [x] REST·역할 instructions·런북·lock의 최종 본문 검증 목적지를 명시했다.
- [x] 구현 승인을 받고 코드 변경·후속 검증 결과를 반영했다.

후속 구현의 완료 판정에는 다음을 모두 요구한다.

- [x] CORE-001~005의 요구가 모두 충족되고 이 제안에서 추가한 diff가 고정 범위 안에 있다. 시작 전 별도 변경과 이미 충족된 경로를 구분해 계획 밖 변경을 숨기지 않는다.
- [x] 경계 새 정의·기존 export는 존재하고 별도 validator split·web parser 중복은 없다.
- [x] verify의 잘못된 증거가 두 format에서 정지하고 문자열·gate·acceptedAt 계약이 유지된다.
- [x] 타입 fixture가 check에 포함되며 잘못된 값은 거부하고 정상 소비자는 컴파일된다.
- [x] seed fixture와 신규 경계·쓰기 전 검증 테스트가 독립 명령으로 모두 통과한다.
- [x] 생성된 decoded instructions·전체 런북·package·공통 docs·lock 내용을 검사했다.
- [x] config의 네 오류가 CLI에서 필드 경로로 표시되고 생성 파일을 남기지 않는다.
- [x] plugin 미러 20개가 정확히 동기화되고 테스트·선언·orphan 복사본은 없다.
- [x] Verification Plan 전체와 after 재현을 통과하고 skip·기존/신규 실패를 기록했다.
- [x] 인수/출시 인증과 로컬 fixture 결과를 구분하고 완료 metadata를 실제 결과로 채웠다.

## Reconciliation Evidence

### 앞선 최초 검증과 문서 보완

**처음부터 개선할 점이 없었던 문서는 아니다.** 아래 네 실행 계획상의 보완점을 발견해
본문의 범위·작업·검증·완료 기준에 반영했다. 원래 클린 코드 발견 5개의 등급을 변경하거나
이 문서 개선을 애플리케이션 구현 완료로 취급하지 않는다.

| 대조 항목 | 최초 문서의 문제 | 반영 위치·해결 |
| --- | --- | --- |
| REC-001 | 모듈 이름·JSDoc/선언·서버 상수 공유를 나중에 결정, 복사본과 음성 타입 검사 목적지 누락 | 각 Proposal의 선택 확정, Affected Files 33개, provenance·타입 fixture |
| REC-002 | seed 회귀를 언급했지만 npm 명령이 실행하지 않음; 실제 baseline fixture 역할 누락 | Execution Plan 1의 fixture 보완, 독립 seed 명령, 기존 실패 기록 |
| REC-003 | 재현 단계에 필수 next가 없어 서버 graph 경로 증거가 되지 않음; catch 출력이 실패도 성공 종료시킴 | parser-valid fixture, before/after 모드의 실패하는 assert, 서버·seed 목적지 |
| REC-004 | 최종 생성 본문·실패 시 쓰기 부재·이동 후 기존 정의 부재와 DoD 연결이 부족 | runtime/artifact 표, 구조 검색 용어 분류, 생성 파일·완료 checklist |

### 이번 재검증에서 보완한 증거 경계

**REC-005 재검증은 시작 시점에 보완점이 있었다.** 변경 대상 33개와 행동·검증 계획은
유효하지만, 아래 유지 계약의 직접 소유자 3개가 재검증용 고정 증거 목록에서 빠져
있었다(REC-005). 이 파일들은 코드 변경 대상에 추가하지 않고 증거 목록에 포함한다.

- `plugin/runtime/file-ownership.mjs`: init의 `safeTarget`, `acquireInitGuard`,
  `writeGenerated`, `atomicWrite`를 소유한다. 최종 파일·lock의 경로 제한, 쓰기 경합,
  안전한 기록 계약을 대조하는 직접 입력이다.
- `src/server/scope-copy.ts`: REST의 소유권·프로젝트 누락 거부 문구를 소유한다.
  `rest-scope.ts`를 통한 최종 응답의 reason 보존 근거다.
- `src/server/token-usage-query.ts`: REST 인증 중 선택적인 사용 기록과 기록 실패의
  격리를 소유한다. `rest-scope.ts`의 조회·거부 분기를 대조할 때 함께 읽는 입력이다.

이 소유자들의 import·호출 경로와 기존 init/REST 테스트를 대조하고, 아래 candidate
집합·내용 identity에 포함한다. 사용 기록 실패 격리의 검증 목적지
`src/server/token-usage-query.test.ts`도 고정 증거에 포함한다.
제안의 권한·쓰기 정책을 확대하거나 실제 DB·filesystem
격리의 제품 인수를 완료했다고 해석하지 않는다.

### 후속 검증 중 코드 변경 대응 · 2026-10-10

이번 후속 검증의 시작 시점에는 추가 문서 개선점을 발견하지 않았다. 최종 대조 중
별도 작업에서 core·웹·plugin 코드가 변경돼, CORE-001의 현재 소유권·이미 충족된 작업과
dirty 증거 기록 기준을 보완했다. 원래 발견 5개를 새 발견으로 계산하지 않으며,
REC-005의 과거 보완 이력도 시작 시점에 문제가 없었다는 이번 판단과 구분한다.
변경 범위·실행 순서·provenance·과거 결과의 유효 시점·위험·완료 기준에 같은 구분을 반영했다.

| 별도 코드 변경 후 측정 시점의 확인 | 결과 | 한계 |
| --- | --- | --- |
| `node --import tsx --test src/server/templates-query.test.ts src/server/rest-scope.test.ts src/server/token-usage-query.test.ts src/fsd/features/create-project/model/repo-url.test.ts src/server/project-slug-rule-sync.test.ts` | **PASS 36/36**, fail/skip 0 | REST·거부·사용 기록·공유 repo 정책; 전체 구현 검증 아님 |
| `node --test plugin/bin/harness-init-dual.test.mjs` | **PASS 7/7**, fail/skip 0 | 두 client의 실제 생성 본문·lock·사용자 파일·동시 init·실패 시 생성 부재; 별도 작업이 추가한 Codex의 CLAUDE.md 비접근 사례 포함 |
| 메모리 after·parser/직렬화 REST·역할 decode·seed·config·타입 fixture | **PASS** | 3플랜×2개행, Max 쓰기 전 거부, 비객체 20개, 제안 선언 오류 0개; 운영·설치 인수 아님 |

관련 코드의 내용 identity가 바뀌면 이 결과도 새 기준에서 필요한 검증을 재실행한다.
최종 미러 동등성과 전체 source/경로/내용 기준은 최종 no-edit 응답의 anchor에 기록한다.

### 검증 범위와 재검증 기준

제안 source bundle은 이 파일 전체, front matter가 참조한 architecture 6개,
`docs/proposals/README.md`, `docs/proposals/template.md`, 루트 `AGENTS.md`다.
architecture가 현재 규칙이고 이 문서는 후속 변경 범위다. architecture에서 링크한
별도 운영 계획·역사 보고서는 구현 입력으로 위임하지 않으므로 이 대조의 source bundle에
추가하지 않는다. 명령·예제·fixture는 이 파일의 인라인 내용도 함께 검사한다.

코드 증거의 정확한 집합은 아래 세 discovery 집합의 중복 없는 합집합이다.
첫 두 명령은 현재 존재하는 전체 파일을 열거하며 세 번째는 공유 모듈의 모든 직접
소비자를 잡는다. 소비자가 상수·타입만 쓰는 경우도 공개 계약·타입 검사 보존 대상이다.

```powershell
rg --files packages/core plugin/lib
rg --files src/fsd/features/create-project
rg -l '@harness/core/(client-runtime|deliver|pipeline|repo-url|config|transitions)\.mjs|\.\./lib/(client-runtime|deliver|pipeline|repo-url|config|transitions)\.mjs' src plugin/bin plugin/runtime scripts tests/server -g '*.ts' -g '*.tsx' -g '*.mjs'
```

추가 고정 증거는 다음 경로다. 이는 전체 저장소의 일반 품질 검토로 확장하는 목록이
아니라 제안의 이동·소비·최종 본문·명령·검증 목적지를 닫는 목록이다.

```text
package.json
package-lock.json
tsconfig.json
eslint.config.mjs
scripts/plugin-lib.mjs
scripts/plugin-lib.test.mjs
scripts/verify-fsd-boundaries.mjs
scripts/verify-fsd-boundaries.test.mjs
scripts/build.mjs
tests/server/register-server-only.mjs
src/server/agents/steps.test.ts
src/server/client-bundle-query.test.ts
src/server/templates-query.test.ts
src/server/rest-scope.ts
src/server/rest-scope.test.ts
src/server/scope-copy.ts
src/server/token-usage-query.ts
src/server/token-usage-query.test.ts
src/server/entitlement.ts
src/server/result.ts
src/server/pipeline/run-query.test.ts
src/server/pipeline/board-query.test.ts
src/server/project-slug-rule.ts
src/server/project-slug-rule-sync.test.ts
plugin/runtime/codex-agent.mjs
plugin/runtime/codex-thread.mjs
plugin/runtime/file-ownership.mjs
```

현재 source와 모든 candidate를 `rg`로 재열거한 정렬 경로 집합의 SHA-256으로 비교한다.
식별자는 저장소 상대 경로를 `/`로 통일하고 중복 제거·ordinal 정렬한 뒤 LF로 join한
UTF-8 bytes의 digest다. 현재 본문 identity는 각 파일의 raw bytes SHA-256이고
aggregate는 정렬한 `path:sha256` 행을 LF join해 같은 방식으로 계산한다.
source 문서의 최종 digest와 candidate signature는 최종 검증 응답의 replay anchor에
남긴다. source 자체 hash를 본문에 적어 자기 참조 hash를 만들지는 않는다.

현재 신규 4개 파일은 부재 상태도 목록·state로 기록하고, 구현 뒤에는 존재와 import
해결을 확인한다. tracked 증거는 HEAD와 각 파일의 raw bytes identity를 비교한다.
dirty 파일은 상대 경로별 내용 identity와 `git diff --no-ext-diff HEAD -- <path>`의
정확한 diff identity도 기록한다. clean 상태를 전제로 하지 않으며, dirty 여부만으로
동일한 코드라고 판단하지 않는다. 검증 중 코드가 바뀌면 요구·소비자·검증 목적지를
다시 대조하고 최종 no-edit pass의 기준을 새로 확정한다.
이 문서는 untracked source이므로 최종 내용 digest로 비교한다. 실제 실행에 사용한
ignored tsx runtime 의존성도 상대 경로별 내용 identity로 비교한다. 이와 무관한
`docs/proposals/active/plugin-clean-code-findings.md`는 source/의존성이 아니며 수정하지 않는다.

### Coverage stability와 실행 제한

높은 영향의 단계 경계는 모듈/심볼 추적과 별개로 parser graph, 직렬화된 REST 본문,
init의 실제 생성 파일을 대조한다. verify는 선언과 별개로 nodeDone/advance 결과를
legacy·slots-v1에서 대조한다. 설정은 core 진단과 CLI 출력, repo 정책은 core owner와
웹 identity·서버 regex 의미, 미러는 전체 목록과 동기화 filter를 각각 대조한다.
최종 기록은 init의 file-ownership 직접 호출과 해당 소유자를, REST 응답은 scope-copy와
선택적 token-usage 호출·실패 격리를 함께 확인한다. 이 세 파일도 위 고정 목록에 포함해
source의 주장과 재검증 identity 사이에 빠진 직접 의존성이 없도록 한다.
이렇게 구조가 다른 경로로 증거를 확인하며 정상 사례 하나만으로 전체를 대신하지 않는다.

| 미실행/제외 경계 | 근거와 후속 검증 경로 |
| --- | --- |
| 실제 DB seed/restore·운영 private 템플릿 | 생산 본문·schema·배포를 바꾸지 않음. Map fixture에서 validate-before-write 계약을 검사하고 실제 배포는 별도 승인·기존 운영 절차 |
| 실제 Codex 모델·Windows sandbox·설치 인수 | thread/LPAC/MCP 정책 구현을 바꾸지 않음. 변환된 역할의 readCodexRole 계약과 기존 init fixture를 검사하며 제품 인증은 별도 runtime 보고서 |
| Next route/cache/async UI 수명 | 라우트·렌더 경계·콜백을 이동하지 않음. core 순수 함수와 기존 typed wrapper만 변경; 소비자 check/build는 구현 후 필수 |
| 단계 parser grammar·fence 재설계, 런북 절단 | 기존 STEP_HEADING/stubOf를 그대로 이동하고 parser·런북 전달을 보존. 기존 steps/deliver 테스트와 전체 런북 본문 검사 |
| auth/access/rate·서버 transaction·권한·인수 | 기존 validator/완료 판정만 사용하며 관련 생산 서비스·actor를 유지. 현재 templates-query 인증·거부 분기와 기존 test:web/test:server로 보존 검증 |

Discovery·파일 hash·형식/경로 검사·메모리 단언은 `safe-replay`다. npm test 계열,
check, build, sync와 새 테스트의 계약은 `manifest-only`로 기록하며 재검증 anchor 비교에서
자동 실행하지 않는다. 현재 테스트 결과는 2026-10-10의 코드 기준 관측이며, 구현 승인
뒤에는 실제 명령을 새로 실행한다. DB·private 운영/모델 결과는 확보하지 않았으며
`volatile-non-replayable`로 취급한다. 이후 그 결과가 필요해지면 승인된 범위에서 갱신한다.

앞선 대조의 pass 1은 최초 진단·보완이다. pass 2의 전체 대조에서 제안한 import와 별도 re-export가
불필요한 로컬 STEP_HEADING binding을 만든다는 점을 찾아 stubOf만 import하도록 정리했다.
이에 따라 pass 2는 최종 clean 결과로 취급하지 않고, 저장된 문서를 pass 3에서 다시
전체 no-edit 대조했다. 이번 재검증의 REC-005 보완은 그 결과를 최신 source의 clean
결과로 재사용하지 않고 전체 대조를 다시 요구한다. 최종 결과와 source digest는
이번 최종 검증 응답을 기준으로 확인한다.
최종 pass에서 추가 편집하면 깨끗한 결과를 선언하지 않고 최신 source로 다시 검증한다.
앞선 clean 결과는 당시 제안서 정합성 판정이며 무결함 증명이나 구현·배포 승인으로
해석하지 않는다. 그 source의 replay anchor와 High-Risk durable receipt는 당시 검증
응답에 남겼다. 이후 실제 코드와 완료 문서가 바뀌었으므로 과거 anchor를 현행 검증으로
재사용하지 않는다. 이번 구현의 기준은 Post-edit regression과 완료 기록이며,
실제 애플리케이션의 남은 위험은 Risks and Rollback 및 위 검증 경로로 관리한다.
