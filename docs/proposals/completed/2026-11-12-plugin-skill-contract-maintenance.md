---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-11-12"
approved-by: "requesting-user"
approved-at: "2026-11-12"
approval-scope: "Phase DOC의 README·protocol 보완, 후보 평가·검증과 완료 기록 정리 및 후속 요청에 따른 커밋·푸시·dev 대상 PR 제출. 스킬·runtime·manifest 변경, 병합·출시·설치는 제외한다."
completed-at: "2026-11-12"
verification-summary: "Phase DOC 완료. README 책임표·검증 위치와 protocol 유지보수 원칙 반영, 후보 판정 완료. 계약 시험 3/3, 문서·상대 링크·공백·변경 범위 검사 통과. 스킬·runtime·manifest 불변, 배포 미실행."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/protocol.md"
  - "docs/architecture/macos-runtime.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-writing.md"
  - "docs/proposals/active/codex-dual-client-runtime-follow-ups.md"
  - "docs/proposals/active/claude-verifier-skill-namespace.md"
---

# 플러그인 스킬의 책임 명시와 계약 유지보수

## Summary

Claude와 Codex의 스킬 분리를 유지하고, 각 경로의 책임과 수정할 원본을 명확하게 한다.
실행 직전에 필요한 짧은 중단·권한 조건은 각 진입점에 남긴다. 공통화는 실제 불일치나
반복 수정 비용이 확인된 긴 절차에 한정하며, 문장 중복만으로 추출하지 않는다.

Phase DOC를 완료했다. 기존 README에 편집 책임과 검증 위치를 보완하고, protocol에
유지보수 원칙을 반영했다. 후보를 다시 평가한 결과 추가로 수정하거나 추출할 스킬은 없었다.
스킬 본문·런타임·manifest는 그대로다. 후속 변경은 실제 근거가 확인됐을 때 별도 계획으로
진행하며, 공통 문서나 생성기를 만들기 위한 작업은 남기지 않는다.

## Goal

- 유지보수자가 클라이언트별 진입점, 공통 원본, 배포 복사본을 구분하고 올바른 파일을 수정한다.
- 같은 계약을 바꿀 때 함께 확인할 소비자와 검증 위치를 찾을 수 있게 한다.
- 설치 경로, 호출 이름, 승인·중단·재개 동작을 보존한다.
- 중복 줄 수 대신 변경 누락과 실행 오류를 줄이는지를 개선 기준으로 삼는다.

## Proposal Size

`proposal-size`: standard. 작성 모드는 `PHASE_PLAN`, 검토 위험도는 `STANDARD`다.
현재 실행 가능한 범위는 문서 보완과 후보 평가지만 설치·실행 계약을 함께 대조해야 한다.
또한 `plugin/README.md`는 출하 파일이므로 실제 배포까지 포함하면 두 manifest의 버전 관리도
영향을 받는다. 문서 변경을 이유로 패키징·출시 규칙을 면제하지 않는다.

## Current State

작성 당시 관측 기준은 2026-11-12의 `origin/dev`
`eabd1381169a2692e9b29317c31047bbb4027c7d`이며, 문서용 브랜치는
`harness/plugin-skill-contract-plan`이었다.

실행 기준은 같은 날 다시 fetch한 `origin/dev`
`62e5898037e65b3145290a7bb5320d750f773615`다. 원래 작업 폴더의 다른 미추적 문서를
보존하기 위해 `harness/plugin-skill-contract-maintenance`의 별도 worktree에서 수행했다.
작성 기준 이후 변경은 이번 범위 밖인 `packages/core/README.md` 한 파일이고, 제안서에서
참조한 계약·스킬·패키징 코드는 동일했다. 실제 변경은 README·protocol과 이 완료 기록뿐이다.

현재 구조의 근거:

| 구분 | 관측한 원본과 소비자 | 판단 |
| --- | --- | --- |
| Claude 진입점 | `plugin/skills/init`, `watch`, `background` | Claude의 경로 치환, 백그라운드 완료 알림과 호출 방식을 담는다. 독립 유지 |
| Codex 진입점 | `plugin/codex/skills/harness-init`, `harness-run`, `harness-resume`, `harness-background` | 실제 스킬 경로 해석, foreground 세션, App Server 역할 실행을 담는다. 독립 유지 |
| 스킬 탐색 | `plugin/.codex-plugin/plugin.json`의 `skills: ./codex/skills/` | 경로 이동은 manifest·설치·시험의 변경이다. 이번 작업에서 이동하지 않음 |
| 공통 검증 원본 | `plugin/skills/reconciling-proposals-with-codebase/` | Claude에서 직접 제공하고 양 OS 패키징이 Codex 경로에 완전 복사한다. 이미 단일 원본 |
| 배포와 실행 검증 | `scripts/windows/package-windows-plugin.mjs`, `scripts/macos/package-plugin.mjs`, `plugin/runtime/codex-agent.mjs:verifierPackage`, `plugin/runtime/codex-thread.mjs:stageVerifierPackage` | checksum, 완전한 리소스, staging을 검증한다. 복사본을 별도 원본으로 관리하지 않음 |
| 기존 문서 | [plugin/README.md](../../../plugin/README.md), [protocol.md](../../architecture/protocol.md#dual-client-소스-계약) | 분리 이유와 공통 실행 구조는 이미 설명한다. 신규 설명 체계 대신 수정 책임과 판단 기준을 보완 |
| 기존 회귀 | `plugin/bin/harness-skill-references.test.mjs`, `harness-session.test.mjs` | 경로·Claude 검증기 이름·Codex OS 거부 문구 등을 검사한다. 전체 자연어 의미나 실제 모델의 준수까지 증명하지 않음 |

### 현재 단계에서 대조할 정확한 경로

아래는 읽기 전용 근거 목록이다. 관련 파일을 읽는 것과 그 파일을 변경 대상으로 삼는 것은
구분한다. 스킬은 각 디렉터리의 `SKILL.md` 전체를 읽고, 공통 verifier는 그 패키지 안의
`SKILL.md`와 `references/*.md`를 하나의 완전한 원본으로 취급한다.

| 확인할 계약 | 경로·소유 심볼 | 소비·검증 위치 |
| --- | --- | --- |
| Claude 진입점 | `plugin/skills/init/SKILL.md`, `plugin/skills/watch/SKILL.md`, `plugin/skills/background/SKILL.md` | `plugin/.claude-plugin/plugin.json`, `plugin/bin/harness-skill-references.test.mjs` |
| Codex 진입점 | `plugin/codex/skills/harness-init/SKILL.md`, `plugin/codex/skills/harness-run/SKILL.md`, `plugin/codex/skills/harness-resume/SKILL.md`, `plugin/codex/skills/harness-background/SKILL.md` | `plugin/.codex-plugin/plugin.json`, `plugin/bin/harness-session.test.mjs`의 OS 문구 검사 |
| 두 init 검증 계약 | `plugin/skills/init/references/reconciliation-contract.md`, `plugin/codex/skills/harness-init/references/reconciliation-contract.md` | 위 init과 watch, `plugin/runtime/codex-agent.mjs:verifierPackage`, `plugin/runtime/codex-thread.mjs:stageVerifierPackage`와 `skills/list` 확인 |
| verifier 원본·배포 복사본 | `plugin/skills/reconciling-proposals-with-codebase/` → 설치 bundle의 `codex/skills/reconciling-proposals-with-codebase/` | `scripts/windows/package-windows-plugin.mjs:packageWindowsPlugin`, `scripts/macos/package-plugin.mjs:packageMacosPlugin` |
| 직접 편집하는 실행 코드 | `plugin/bin/harness-init.mjs`, `plugin/bin/harness-watch.mjs`, `plugin/bin/harness-session.mjs`, `plugin/bin/harness-codex.mjs`, `plugin/bin/harness-background.mjs`; 역할·OS 근거는 `plugin/runtime/codex-thread.mjs`, `plugin/runtime/codex-platform.mjs` | 스킬의 명령 안내와 대응 런타임. 이번에는 코드 동작을 다시 설계하거나 실행하지 않음 |
| 생성 lib의 편집 원본 | `packages/core/`의 생산 `.mjs` → `plugin/lib/`, `packages/github/`의 생산 `.mjs` → `plugin/lib/github/` | `scripts/plugin-lib.mjs:SOURCES`, `sourceModules`, `diffPluginLib`; `scripts/plugin-lib.test.mjs` |
| 문서 검사·출하 분류 | `scripts/checks/verify-docs.mjs:inspectDocs`, `scripts/checks/verify-plugin-version.mjs:inspectPluginVersion` | `package.json`의 `docs:check`, 양 OS 패키징의 출하 파일 선택; README도 출하 대상 |

lib 표는 동기화 경로의 소유권을 설명하는 범위다. 각 모듈의 업무 동작을 검토하거나
동기화 스크립트를 쓰기 모드로 실행하는 일은 포함하지 않는다.

`plugin/skills` 전체를 Claude 전용이라고 부르면 공통 verifier 원본을 놓친다.
반대로 이 경로를 공통 스킬 폴더라고 부르면 Claude 전용 진입점을 오해하게 된다.
현재 README의 설명에 경로별 편집 책임을 더하는 것이 첫 번째 개선이다.

변경 이력에서도 분리 근거가 보인다. `55f9ebd`는 Claude의 검증기 namespace,
`9cc60d5`는 Claude 사용량 제한 안내를 수정했다. `4e5643a`와 `9f213c6`에서는 Codex의
OS·native 실행 계약 때문에 Codex 스킬 네 개가 함께 바뀌었다. 이는 클라이언트별 경계를
유지할 근거이며, 모든 반복 문장을 추출해야 한다는 근거는 아니다.

관측한 코드와 문서는 현재 계약의 근거다. 이번 작업에서는 설치본·실제 모델을 실행하지
않았으며, 공통 참조 추출이 모델의 지침 준수율을 높인다는 주장은 미검증이다.

### 다른 작업과의 경계

- [dual-client 후속](../active/codex-dual-client-runtime-follow-ups.md)은 공개 패키지·OS·실제 설치 인수를 소유한다. 해당 인수를 이 문서로 옮기거나 완료 처리하지 않는다.
- [Claude namespace 변경](../active/claude-verifier-skill-namespace.md)이 정한 `harness:reconciling-proposals-with-codebase` 호출을 보존한다. 템플릿 릴리스 작업을 재수행하지 않는다.
- [CI OS 범위](../active/ci-os-coverage.md)와 [게이트 기록](./2026-11-12-gate-run-records.md)의 workflow·운영 정책은 변경하지 않는다. 이후 실행 때 최신 `AGENTS.md`와 검증 문서를 다시 읽는다.
- [사용 한도 설치](../active/runner-usage-limit-installation.md)와 [템플릿 인수](../active/template-release-acceptance-follow-ups.md)의 운영 환경 변경은 포함하지 않는다.
- 작성 시 열린 PR은 [#325](https://github.com/Sangeok/stagekeeper/pull/325)의 core README 경로 수정이다. 이 제안은 그 파일을 수정하지 않는다. 구현 시작 때 열린 PR과 active 제안서를 다시 확인한다.

실행 시작 시 열린 PR은 #326의 Windows 제품 시험 범위 변경이었다. 이번 변경과 겹치지 않으며
그 PR의 workflow·승인 범위는 건드리지 않았다.

## Scope

현재 단계의 변경 범위는 기존 `plugin/README.md`, `docs/architecture/protocol.md`의 보완과
이 제안서의 평가 결과·검증 기록 갱신이다. README는 빠른 경로 안내를, protocol은 유지보수
원칙을 소유한다. 두 문서에 전체 운영 규칙을 중복 기재하지 않는다.

다음은 현재 단계에서 바꾸지 않는다.

- 스킬 경로·이름·manifest의 탐색 설정, verifier 원본과 배포 복사 경로.
- `SKILL.md`, 두 `reconciliation-contract.md`, helper·runtime·패키징 코드·테스트 본문.
- 서버 API, 원장·receipt·승인, 로컬 세션·잠금, 권한·중단·재개·자동 시작 정책.
- private 템플릿, 생성 런북, 설치본, 사용자 설정, DB와 외부 서비스 상태.
- 폴더 대칭화를 위한 이동, 스킬 전체 생성기, 일반적인 Markdown include 체계와 신규 CI 게이트.

문서 보완 후 `plugin/` 출하 변경을 실제 출시할 때는 양쪽 manifest 버전을 함께 처리한다.
구체적인 버전은 출시 대상의 최신 버전을 기준으로 정하며 이 계획에 고정하지 않는다.

## Proposal

### 요구사항과 제약

#### REQ-SKILL-001: 수정할 원본을 찾을 수 있다

WHEN 유지보수자가 플러그인 경로 안내를 읽으면, 문서는 각 진입점의 대상 클라이언트,
공통 verifier의 편집 원본, Codex 배포 복사본의 생성 주체와 관련 검증 위치를 제시해야 한다(SHALL).
아키텍처 문서는 분리 유지·단일 원본·짧은 실행 조건 유지·근거 있는 선별 추출의 원칙을
제시해야 한다(SHALL).

#### REQ-SKILL-002: 후보 평가의 결론을 추적할 수 있다

WHEN 중복된 스킬 지침을 검토하면, 평가 기록은 후보별로 유지·추출 보류·문서 보완·불일치 수정 필요 중
하나의 판정과 근거, 관련 소비자, 필요한 검증을 남겨야 한다(SHALL).
수정 대상이 없다는 결론도 유효한 완료 결과다.

#### CON-SKILL-001: 실행 계약 보존

클라이언트별 경로 탐색·도구·명령·승인 차이를 유지한다. runtime이 판정하는 계약은 해당
코드가 계속 강제하고, 스킬은 그 결과에 따라 행동하도록 안내한다. 문서가 비슷하다는 이유로
helper 동작이나 제품 권한을 통일하지 않는다.

#### CON-SKILL-002: 직접 읽히는 조건과 패키지 완전성

짧은 OS 거부·권한·잠금·중단 조건은 진입점에서 읽을 수 있게 남긴다. verifier는 원본 하나와
완전한 배포 복사본을 유지한다. `verifierPackage`는 verifier 패키지 밖으로 나가는 상대 링크를
거부하므로 공통 문서를 verifier 바깥에 두어 의존시키지 않는다. 일반 스킬 참조와 verifier
패키지 내부 리소스는 별도의 경계다.

#### CON-SKILL-003: 변경 근거와 범위

기존 테스트가 문장을 요구한다는 사실만으로 현 구조가 최적이라고 결론내리지 않는다.
반대로 추출을 통과시키려고 시험을 먼저 약화하지 않는다. 후속 변경은 실제 계약 불일치나
동일한 이유의 반복 수정 근거가 있어야 하며, 이미 만족한 계약을 재구현하지 않는다.

### 유지할 차이

| 영역 | 유지할 계약 |
| --- | --- |
| root 해석 | Claude의 `${CLAUDE_PLUGIN_ROOT}` 치환과 Codex의 실제 `SKILL.md` 경로 해석 |
| 실행·재개 | Claude watch의 완료 알림과 Codex foreground의 `next`·`dispatch`; Codex resume의 기존 run 스킬 참조 |
| 검증기 로딩 | Claude의 namespace 호출과 Codex staged 경로·실제 `skills/list` 검사 |
| background 시작 | Claude 스킬의 사용자 직접 실행 안내와 Codex 스킬의 명시적 요청에 따른 helper 실행 |
| 지원 환경 | 클라이언트별 런처·runtime·OS·자동 시작 조건; source 설치와 native bundle의 구분 |

### 후보의 최종 판정

아래는 실행 기준 revision에서 다시 확인한 최종 판정이다. 실제 모델 비교 시험의 결과는 아니다.

| 후보 | 최종 판정 | 이유와 후속 검증 |
| --- | --- | --- |
| 공통 verifier 원본과 Codex 복사본 | 유지 | 이미 단일 원본·패키징 복사·완전성 검사 구조다. 경로와 checksum 계약을 보존 |
| Codex 네 진입점의 OS 거부 문장 | 유지 | helper 전 중단 조건이며 runtime과 일치하는지 기존 시험이 검사한다. 공통 참조로 옮기지 않음 |
| 두 reconciliation 계약의 짧은 검증 기준 | 추출 보류 | 기준은 같지만 로더·복구가 다르고 절감량이 작다. 새 참조 비용보다 이득이 크다는 근거가 없음 |
| Codex 설치·런처 안내의 긴 반복 절차 | 추출 보류 | 같은 OS 변경에서 함께 수정됐으나 지침 누락·오류가 발생했다는 증거는 아직 없음. 실제 설치 경로에서 참조 접근을 확인해야 함 |
| init/run/resume/background의 권한·소유권 안내 | 유지 | 문구 일부가 비슷해도 실행 모드와 허용 행위가 다르다. 명령·중단·재개 계약을 따로 검토 |
| README의 경로별 편집 책임 | 문서 보완 | 기존 개요를 유지하고 공통 원본·배포 복사본·진입점의 책임표와 검사 위치를 추가 완료 |

## Affected Files

| 경로 | 현재 단계의 작업 | 리스크 |
| --- | --- | --- |
| `plugin/README.md` | 기존 개요에 경로별 책임표와 원본·복사 관계를 보완 | 낮음. 출하 파일이므로 출시 시 버전 관리 필요 |
| `docs/architecture/protocol.md` | dual-client 절에 스킬 유지보수 원칙을 추가 | 낮음. 실행 계약을 바꾸는 표현을 넣지 않음 |
| 이 제안서 | 후보 판정, 실행한 검증과 미실행 범위 기록 | 낮음 |
| 양쪽 plugin manifest | 현재 단계에서 탐색 설정 불변. 실제 출시 시 버전만 함께 갱신 | 출시 작업이며 이 문서 작성에 포함하지 않음 |

## Safety Analysis

현재 단계에는 새 상태나 API, 데이터 마이그레이션, runner 시작, 사용자 프로젝트의 생성 파일 쓰기가 없다.
기존 성공·거부·재시도·중단·잠금 해제와 클라이언트 전환 절차는 모두 보존 대상이다.
앱 라우팅·정적 자산·타입 경계는 변경하지 않는다.

README는 유지보수 안내이며 스킬 실행 중 새로 읽어야 하는 필수 의존성이 되지 않는다.
새 runtime 참조를 만들지 않으므로 설치본의 참조 해석 경로도 바뀌지 않는다.
검증기의 외부 상대 링크 거부와 완전 복사 경계를 유지한다.

## Approval

제안서를 바탕으로 실제 수정하라는 후속 요청에 따라 Phase DOC를 실행했다.
후속 추출·runtime 수정과 실제 출시를 이 단계에 포함하지 않는다. 승인된 작업을 진행하기 위해
같은 승인을 다시 요청하지 않는다.

## Execution Plan

아래 작업과 검증은 승인된 실행 범위다. 두 Task의 수행 결과는 Verification Results와
Completion or Closure Notes에 기록했다.

### Phase DOC: 책임 명시와 후보 평가

- satisfies: REQ-SKILL-001, REQ-SKILL-002
- governed-by: CON-SKILL-001, CON-SKILL-002, CON-SKILL-003
- verified-by: VFY-SKILL-01, VFY-SKILL-02
- 진입 조건: 최신 코드·적용 지침·열린 PR·active 제안서를 확인하고 기존 작업을 보존한다.
- 종료 조건: README 책임표와 protocol 유지보수 원칙의 실제 본문을 각각 검토하고, 후보별 판정·검증 결과와 변경 범위 보존을 기록한다.
- 중간 유효성: 문서 보완만으로 완료할 수 있다. 후속 스킬 추출 없이도 설치·실행은 그대로 유효하다.

#### TASK-SKILL-01: 기존 안내에 수정 책임을 명시한다

- satisfies: REQ-SKILL-001
- governed-by: CON-SKILL-001, CON-SKILL-002
- verified-by: VFY-SKILL-01

`plugin/README.md`의 첫 개요를 보완한다. Claude 진입점, Codex 진입점, 공통 verifier 원본,
Codex 배포 복사본, 공통 helper/runtime, 생성된 `plugin/lib`를 표로 구분한다.
각 행에 편집할 원본과 생성·소비 주체를 적고 관련 기존 검사 파일을 안내한다.
이미 있는 설치 방법·지원 상태 설명을 반복하거나 이번 작업과 무관하게 고치지 않는다.

`protocol.md`의 dual-client 절에는 클라이언트별 스킬 분리, verifier 단일 원본,
짧은 실행 조건 유지, 근거 있는 선별 추출의 원칙만 추가한다.
세부 호출·설치 절차는 기존 계약을 참조하고 별도의 운영 규칙 사본을 만들지 않는다.

#### TASK-SKILL-02: 후보 판정과 검증 결과를 확정한다

- satisfies: REQ-SKILL-002
- governed-by: CON-SKILL-001, CON-SKILL-002, CON-SKILL-003
- verified-by: VFY-SKILL-02

앞의 후보 표를 현재 코드와 대조한다. 변경 이력·소비자·기존 시험에서 확인한 근거를 남기고,
단순 반복과 실제 불일치를 구별한다. 수정 필요 항목이 없으면 그 사실을 기록하고 종료한다.
작업 전 변경 목록을 기록하고 현재 단계의 문서 diff가 스킬·runtime·설치 계약을 바꾸지 않았는지
확인한다. staged·unstaged·untracked를 구분하며, 시작부터 있던 다른 작업의 파일은 비교 기준으로
보존한다. 확인을 위해 다른 파일을 stage·정리·삭제하지 않는다.
이미 있는 문장을 확인하기 위한 새 snapshot 시험이나 일반 문서 프레임워크를 추가하지 않는다.

### 후속 수정의 시작 조건

현재 소스 검토만으로 확정한 스킬 추출·runtime 수정 작업은 없다. 발견 시 해당 후보에 대해
다음 내용을 이 문서의 후속 계획 또는 별도 제안에 먼저 확정한다.

1. 실제 불일치 사례 또는 같은 계약의 반복 수정 이력, 영향을 받는 명령·소비자.
2. 유지·직접 수정·추출 중 선택과 근거, 정확한 변경 파일·참조 경로·삭제 범위.
3. 설치 번들에 포함되는지, 해당 클라이언트가 필요한 문서를 실제로 읽을 수 있는지.
4. 정상·거부·중단 조건을 관찰하는 기존 시험과 추가할 최소 회귀 사례.
5. 참조 구조를 바꾸면 실제 클라이언트에서 검증할 시나리오와 실행 환경.

문서가 현재 계약과 어긋나면 소유 계약을 확인해 해당 문서를 바로잡는다. 계약끼리 충돌하거나
승인·잠금·권한·지원 범위를 바꾸어야 하면 단순 문구 수정으로 처리하지 않고 해당 변경을
별도로 설계한다. 특정 스킬의 추출을 선결론으로 두지 않는다.

## Verification Plan

### VFY-SKILL-01: 책임 안내를 실제 경로와 대조한다

- verifies: REQ-SKILL-001
- 방식: 문서·소스 대조와 상대 링크 검사. 실행 상태: PASS (2026-11-12).

README만 보고 각 클라이언트 진입점, verifier 편집 원본, Codex 복사본 생성기,
공통 runtime, `plugin/lib` 원본과 관련 검사를 찾을 수 있어야 한다.
두 manifest, 양 OS 패키징 코드와 `verifierPackage`·`stageVerifierPackage`를 대조한다.
새 문서가 구현되지 않은 지원 범위나 실행 절차를 약속하면 실패다.

`protocol.md`의 추가된 본문에서 네 원칙을 각각 확인한다. 기존 OS 허용 범위, Claude namespace,
Codex staged loader, 승인·중단·재개 의미가 유지되는지도 변경 전 본문과 대조한다.
README와 protocol이 서로 다른 기준을 제시하거나 기존 계약과 충돌하면 실패다.

최종 산출물은 저장소의 README, protocol, 후보 평가를 담은 이 제안서다. 이번 단계에는
설치 bundle 생성·배포가 없으므로 설치물의 변경 완료를 주장하지 않는다. README에 추가하는
링크는 저장소 유지보수용이며 스킬의 새 실행 의존성이 되지 않는다.

`npm run docs:check`는 Git 추적 파일만 검사하고 anchor는 검사하지 않는다.
새 미추적 문서와 수정 대상 세 파일의 본문도 아래 보조 명령으로 검사한다.
문서 사이의 heading 링크는 실제 heading을 읽어 별도로 확인한다.

### VFY-SKILL-02: 후보 판정과 보존 범위를 검토한다

- verifies: REQ-SKILL-002
- 방식: 후보표 의미 검토와 변경 범위 검사. 실행 상태: PASS (2026-11-12).

후보마다 근거·소비자·판정·검증 범위가 있어야 한다. 후속 검증이 필요한 항목을 통과로
기록하거나 수정할 필요가 없는 항목을 필수 추출 과제로 바꾸면 실패다.
작업 시작 시점과 비교해 현재 단계가 만든 변경이 허용 파일 세 개에만 있는지 확인한다.
다른 작업의 기존 변경을 이 단계의 실패로 세거나 제거하지 않는다. 현재 단계에서는 manifest도
그대로여야 한다. 실제 출시 작업은 후속 범위다.

아래 명령은 저장소 루트에서 Node.js·npm·Git이 PATH에 있는 환경으로 실행한다.
선택한 계약 시험과 문서 검사에는 외부 npm 패키지 설치·DB·인증·native bundle이 필요 없다.
아래 인용·여러 줄 명령은 POSIX shell(bash/zsh) 기준이다. Windows·PowerShell에서의 실행은
이번 확인 범위에 포함하지 않는다. 여러 명령을 실행할 때 각 종료 코드를 따로 확인하며
뒤의 성공으로 앞의 실패를 덮지 않는다.

```bash
git status --short --untracked-files=all
git diff --name-status HEAD
node --test plugin/bin/harness-skill-references.test.mjs
npm run docs:check
git diff --check
git diff --cached --check
```

`git diff --check` 두 명령은 각각 unstaged·staged 변경을 검사하며 미추적 파일은 검사하지
않는다. 다음 명령은 index를 바꾸지 않고 미추적 상태인 이 제안서까지 포함해 상대 링크와
대상 세 파일의 줄 끝 공백을 검사한다. 다른 작업의 미추적 문서를 검사 대상에 자동 추가하지 않는다.

```bash
node --input-type=module -e '
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { inspectDocs } from "./scripts/checks/verify-docs.mjs";
const targets = [
  "plugin/README.md",
  "docs/architecture/protocol.md",
  "docs/proposals/completed/2026-11-12-plugin-skill-contract-maintenance.md"
];
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0").filter(Boolean);
const result = inspectDocs(process.cwd(), [...new Set([...tracked, ...targets])]);
const whitespace = targets.flatMap(file => readFileSync(file, "utf8")
  .split(/\r?\n/).flatMap((line, index) => /[ \t]+$/.test(line) ? [`${file}:${index + 1}`] : []));
console.log(JSON.stringify({ ...result, whitespace }, null, 2));
if (result.problems.length || whitespace.length) process.exitCode = 1;
'
```

성공 조건은 선택 시험의 실패0건, 문서 검사의 `problems`와 `whitespace`가 빈 배열,
허용한 변경만 추가된 상태, 그리고 양쪽 문서의 의미 검토 완료다.
실패를 기존 실패로 분류하려면 같은 baseline·환경에서 재현한 근거를 남긴다.

이 시험은 일부 경로·이름 계약만 검사한다. 일반적인 링크 해석, 실제 설치·모델 준수 또는
Windows/macOS 인수를 증명하지 않는다. 문서만 보완하는 현재 단계에서는 실제 runner를
시작하거나 전체 모델 인수를 새로 실행하지 않는다.

후속 코드·시험 변경이 확정되면 `test-writing.md`, `test-organization.md`, `verification.md`를
다시 읽고 해당 파일의 기존 회귀를 사용한다. `npm run verify:fsd`, `npm run verify:server`,
`npm run test:architecture`, 관련 lint·type·test·build를 실행한다. `npm run check`의 타입 검사는
`next typegen`과 `tsc --noEmit`을 포함한다. OS 의존 검사는 실제 대상 OS의 실행·skip을 구분한다.

출시할 때는 README도 출하 파일이라는 점을 반영하고, 최신 `AGENTS.md`의 버전·기존 게이트
조회·승격 규칙을 따른다. 문서 점검의 통과를 출시 게이트 통과로 확대하지 않는다.

## Verification Results

이 절은 제안서 작성·정합성 검토와 Phase DOC 구현 후 검증을 구분한다.

| 대상 | 상태 | 근거·한계 |
| --- | --- | --- |
| 기준 소스·패키징·기존 문서·변경 이력 | 확인 | 위 Current State의 revision 기준 읽기 전용 조사 |
| 계획의 ID·참조 구조 검사 | PASS | SDD validator standard: 요구사항 2개, 작업 2개, 검증 2개; 요구사항의 작업·검증 연결 각각 2/2 |
| 제안서 포함 상대 링크·형식 검사 | PASS | `inspectDocs`에 Git 추적 목록과 이 새 파일을 함께 전달: Markdown 214개, 상대 링크 1,047개, 문제 0개. front matter도 파싱 확인 |
| Phase DOC의 문서 수정 후 인수 | PASS | README의 7개 책임 행·검증 위치와 protocol의 네 원칙을 소스 및 서로의 본문과 대조. 기존 본문·실행 계약 보존 확인 |
| Phase DOC의 계약 시험 | PASS | `node --test plugin/bin/harness-skill-references.test.mjs`: 3/3 통과 |
| Phase DOC의 문서 검사 | PASS | `npm run docs:check` 및 위 보조 명령. 완료 기록을 포함한 상대 링크·줄 끝 공백 오류 없음 |
| Phase DOC의 변경 범위 | PASS | tracked 변경은 `plugin/README.md`, `docs/architecture/protocol.md`; 새 문서는 이 완료 기록 하나. 스킬·helper·runtime·패키징·manifest·테스트 파일 변경 없음 |
| 정합성 검토의 baseline 명령 | PASS | 격리 복사본에서 이 문서의 로컬 명령 7개 실행. 계약 시험 3/3, 기본 문서 검사 213개, 보조 검사 214개 모두 통과 |
| 보조 검사의 실패 검출 | PASS | 격리 사본의 미추적 제안서에 깨진 링크·줄 끝 공백을 넣으면 보조 명령이 실패. staged 공백은 `git diff --cached --check`가 검출. 복원 후 다시 통과 |
| 실제 설치·모델·양 OS 실행 비교 | 미실행 | 정적 검토로 대체하지 않음 |

계획 검사는 설치된 `write-sdd-spec`의 `scripts/validate_sdd_traceability.py`에
이 파일을 전달해 실행했다. 아직 실행 승인 전인 제안서이므로 strict 모드는 적용하지 않았다.
의미 검토에서는 현재 단계의 요구사항별 작업·검증 연결, 변경 허용 파일, 실행 계약 보존과
후속 후보의 보류 조건을 확인했다. 이는 독립 에이전트 검토나 실제 동작 인수 결과가 아니다.

2026-11-12 정합성 검토의 첫 pass에서 개선점이 있었다. 미추적·staged 변경과 실제 수정할
protocol 본문의 검증이 충분히 구체적이지 않았다. 정확한 읽기 전용 근거 목록, 양쪽 문서의
본문 인수 기준, 기존 변경 보존, 실행 가능한 보조 명령을 보완했다. 검사 환경은 macOS zsh,
Node.js 26.4.0, npm 11.17.0, Git 2.50.1이며 기준 소스는 위 revision의 격리 복사본이다.
이 기록은 명령의 실행 가능성과 실패 검출 근거이며, 아직 수행하지 않은 Phase DOC의 구현
완료나 실제 클라이언트 검증을 의미하지 않는다. 최종 정합성 판정은 저장된 문서에 대한
별도의 수정 없는 pass로 확인한다.

## Risks and Rollback

- 짧은 반복을 없애면 필수 조건이 간접 참조 뒤로 숨을 수 있다. 현재 단계에서는 추출하지 않는다.
- 문서와 코드가 다른 작업으로 함께 바뀔 수 있다. 구현 시작 때 기준 revision과 후보 표를 갱신한다.
- 기존 시험은 자연어 의미를 모두 검증하지 않는다. 의미 검토를 병행하고 실제 읽기 경로 변경은 별도 클라이언트 검증 없이는 완료로 판정하지 않는다.
- runtime과 코드로 판정할 수 없는 에이전트 행동을 구별한다. 후자를 검사기 하나로 강제할 수 있다고 주장하지 않는다.
- 현재 단계의 복구는 해당 문서 변경만 되돌리면 된다. 다른 작업의 변경은 보존한다. 출시 후 되돌리기가 필요하면 이전 버전 캐시를 덮어쓰지 않고 기존 패키지 업데이트·버전 정책을 따른다.

## Readiness

Phase DOC는 구현과 검증을 마쳤다. 문서의 완료는 병합·배포·설치 완료를 뜻하지 않는다.

후속 추출·코드 수정은 확정된 작업이 아니며 현재 단계의 완료 조건도 아니다.
검증 환경을 확보하지 못한 후속 후보는 보류로 기록하고, 독립적인 문서 보완을 막지 않는다.

## Completion or Closure Notes

2026-11-12, TASK-SKILL-01과 TASK-SKILL-02를 완료했다.

- `plugin/README.md`: 7개 책임 행과 기존 검증 위치를 추가했다. 설치·실행 안내 본문은 보존했다.
- `docs/architecture/protocol.md`: dual-client 절에 스킬 유지보수 원칙을 추가했다. 기존 계약 본문은 보존했다.
- 후보 판정: 유지 3건, 추출 보류 2건, 문서 보완 완료 1건. 새 스킬 추출·runtime 수정 과제는 확정하지 않았다.
- 실행 환경: macOS zsh, Node.js 26.4.0, npm 11.17.0, Git 2.50.1.
- 상태: 별도 worktree에서 Phase DOC의 구현·검증을 완료했으며, 후속 요청에 따라 dev 대상 PR로 제출한다. 병합·출시·설치는 이 기록의 완료 범위 밖이다.
- 출시 후속: README도 출하 대상이므로 실제 출시 때 최신 대상에 맞춰 양쪽 manifest 버전과 기존 게이트를 처리한다. 이번 완료의 잔여 구현 과제는 아니다.

완료 기록으로 이동하면서 내부의 제안서 링크와 보조 검사 대상 경로도 새 위치에 맞췄다.
기존 공개 설치 인수와 다른 제안서의 미완료 작업은 각 소유 문서에 남긴다.
