---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-11-15"
approved-by: "user"
approved-at: "2026-11-16"
approval-scope: "이 명세에 따른 실제 코드 수정과 로컬 검증. Windows x64·macOS arm64 × Claude·Codex 기본 4개 조합부터 진행하고 Intel은 기존 runtime 검증을 유지한다. 후속 지시로 private CI 대상 SHA 고정과 공통 증거 연결을 진행한다. Windows runner 부재 및 Mac 사용 불가를 확인했으므로 현재는 코드·로컬 검증을 수행한다. 개인 설치 변경·운영 template activation·새 PR 병합·배포는 포함하지 않는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/verification.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/proposals/completed/2026-11-17-ci-os-coverage.md"
  - "docs/proposals/completed/2026-11-12-claude-verifier-skill-namespace.md"
  - "docs/proposals/active/template-release-acceptance-follow-ups.md"
  - "docs/proposals/completed/2026-11-12-gate-run-records.md"
  - "docs/proposals/completed/2026-11-12-codex-dual-client-runtime-follow-ups.md"
---

# Windows·macOS Claude/Codex CI 검증 동등화

## Summary

Windows와 macOS에서 Claude Code와 Codex가 지원하는 설치 경로와 실제 제품 실행 경로를 검증하고, 공통 합격 기준과 배포 판단을 적용한다. 기존 공통 시험·OS별 런타임 시험·Claude 게이트를 유지하면서 누락된 조합을 채운다. 워크플로 파일, 모델 응답, 시험 개수를 같게 만드는 작업은 아니다.

macOS Codex에는 별도 비공개 CI와 `init`·`eval`·`pipeline` 리허설이 이미 문서화되어 있다. 이를 재사용하며 Windows Codex 경로, macOS Claude 파이프라인, 공개·비공개 실행의 증거 연결을 보완한다. 공개 `.github/workflows/`에 Codex job이 없다는 사실을 전체 Codex CI 부재로 해석하지 않는다.

문서 검토 후 실제 구현 요청을 받아 공통 판정·요약기, 공개 eval workflow와 private macOS CI 실행기를 수정 중이다. 코드·로컬 시험과 실제 native CI 인수를 구분한다. Windows 전용 runner 부재와 아래 남은 선행 조건 때문에 전체 동등화는 아직 완료되지 않았다.

## Goal

- Windows에서 Claude와 Codex의 필수 검증 범위와 합격 기준을 동등하게 만든다.
- macOS에서도 같은 목표를 달성하며, 아키텍처와 설치 채널별 미검증 범위를 남긴다.
- 테스트한 source·template·설치물과 배포 후보가 일치하는지 확인한다.
- 빠른 회귀 시험과 실제 모델 시험을 분리하고, 실행 시간·사용량·실패 원인을 측정한다.

`proposal-size: standard`, SDD 위험도는 `HIGH-RISK`다. 여러 workflow와 비공개 실행 환경, 인증정보, 실제 모델 사용량, 승격 조건을 다룬다. 제품 동작·권한은 유지하며 CI 도구를 변경한다.

## Current State

### 조사 기준과 근거의 한계

이 절의 Current State 표는 구현 전 조사 기준이다. 이번 변경 상태는 아래 Implementation Progress에 별도로 기록한다.

- 조사일: 2026-11-15. 소스 기준은 `a671f5887657fc6a74d6e1d106929ef7284740e7`; 조회 당시 원격 `dev`와 `main`이 같은 commit이었다.
- 작업 시작 시 주 worktree는 변경 없는 로컬 `dev`였고 원격보다 101 commit 뒤였다. 원격 두 보호 브랜치를 확인·fetch한 뒤 최신 `origin/dev`에서 `harness/dual-client-ci-spec`을 만들었다. 다른 작업의 worktree는 보존했다.
- `gh pr list --state open` 결과는 빈 목록이었다. active 제안서의 승인 범위와 이번 작업의 겹침은 아래 표에 기록한다. 구현 시작 때 다시 확인한다.
- **Observed**는 읽은 소스·명령 결과, **Contracted**는 현재 architecture/AGENTS의 계약, **Documented**는 기존 보고서의 과거 기록이다. **Unresolved**는 이번에 직접 확인하지 못한 사항이다.
- 재검토에서 비공개 `Sangeok/stagekeeper-codex-ci`의 `dev` revision `b086ec055f8de32760b93668480b7747de952527`을 읽었다. workflow·실행기·설치 절차·요약·최근 run metadata는 Observed다. runner의 현재 가용성, 실제 인증 만료 상태, 로컬 private 증거와 검토 완료는 확인하지 않았다. 비밀값 본문이나 모델 전사는 읽지 않았다.

| 근거 | 분류 | 관찰 또는 계약 | 설계에 미치는 영향 |
| --- | --- | --- | --- |
| [check](../../../.github/workflows/check.yml), [package.json](../../../package.json) | Observed | Ubuntu에서 static·제품/웹/서버 시험·build·DB integration 실행 | 공통 회귀 검증을 보존한다 |
| [Windows runtime](../../../.github/workflows/windows-role-runtime.yml), [macOS runtime](../../../.github/workflows/macos-runtime-contracts.yml) | Observed | Windows x64와 macOS arm64/x64의 제품 시험·격리 명령·offline build; 모델 인증 없는 검증 | 모델 없는 통과를 실제 클라이언트 인수로 확대하지 않는다 |
| [client init workflow](../../../.github/workflows/client-init-smoke.yml), [리허설](../../../scripts/rehearsals/rehearse-client-init-smoke.ts) | Observed | Claude의 Windows/macOS 신규·update. `parseArguments`는 Codex와 bundle을 미구현으로 거부하며 `installPlugin`은 Claude 설치 명령 사용 | 기존 entrypoint의 인자만 바꾸어 Codex를 지원했다고 판정할 수 없다 |
| [pipeline workflow](../../../.github/workflows/pipeline-smoke.yml), [리허설](../../../scripts/rehearsals/rehearse-pipeline-smoke.ts) | Observed | Windows Claude, Pro, owner gate 없는 기본 흐름, `slug`/`truncate`, 독립 사례와 역할 기록 판정 | macOS Claude leg 및 공통 판정 보완 필요. 승인 게이트 인수는 별도 사례 필요 |
| [Codex macOS 리허설](../../../scripts/rehearsals/rehearse-codex-macos.mjs) | Observed | real macOS guard, 설치 bundle, `--phase init/eval/pipeline`, `--previous-package`, `--run-models`; Max·QA·scout·owner gate·owner stop·종료 정리·선택 idle | 기존 동작 보존. 실행 중 프로세스 중지→재개 사례는 별도로 추가한다 |
| [검증 계약](../../architecture/verification.md) | Contracted | 신뢰된 private Mac runner, CI 전용 홈·native 로그인 직렬 사용, private raw 기록, `reviewRequired` 검토. 공개 기록에 Codex CI 결과 미연결 | public PR에 로그인 캐시를 전달하지 않는다. 같은 저장소로 옮기는 것을 동등화 조건으로 삼지 않는다 |
| [시스템 개요](../../architecture/system-overview.md), [Codex 역할 실행](../../../plugin/runtime/codex-thread.mjs) | Contracted / Observed | native 로그인·설치 bundle·역할 격리. Claude source 설치는 PATH Node 예외가 있고 Codex는 bundle 필수. Codex 역할은 제한된 환경변수로 App Server 실행 | 일반 CLI 호출의 성공이나 임의 API key 주입을 제품 경로의 인증 성공으로 간주하지 않는다 |
| [게이트 기록](../../../scripts/rehearsals/gate-record.mjs), [환경 요약](../../../scripts/rehearsals/gate-environment.mjs) | Observed | 현재 공개 3개 workflow만 기록. 환경 측정은 Claude 명령에 결합되고 `architecture`·bundle identity의 공통 판정은 없음 | 기존 허용 필드 필터와 기록 계약을 확장하며 과거 기록의 의미를 보존한다 |
| [macOS Codex 인수](../../test-reports/completed/2026-11-10-codex-macos-native-acceptance.md) | Documented | 당시 macOS arm64·0.6.10 설치·실제 역할·110분 통과. clean Mac·Intel 실제 모델 등 제외 | 역사적 PASS를 새 payload·Intel·현재 CI로 전용하지 않는다 |

### 재검토에서 확인한 private CI

아래 외부 경로는 모두 `Sangeok/stagekeeper-codex-ci`의 위 고정 revision 기준이다. 저장소 접근 권한이 없는 독자는 내용을 검증한 것으로 간주하지 않는다.

| 확인한 소스/결과 | 실제 계약 | 남은 차이 |
| --- | --- | --- |
| [`.github/workflows/codex-ci.yml`](https://github.com/Sangeok/stagekeeper-codex-ci/blob/b086ec055f8de32760b93668480b7747de952527/.github/workflows/codex-ci.yml) | owner·private·`dev`의 수동 실행만 허용. self-hosted macOS ARM64, `codex-account-auth` 직렬화, job 165분 | Windows·Intel leg와 정기 실행은 없다. 165분 설정이 공개 승격 게이트의 30분 운영 규칙을 대체하지 않는다 |
| [`ci-target.json`](https://github.com/Sangeok/stagekeeper-codex-ci/blob/b086ec055f8de32760b93668480b7747de952527/ci-target.json) | source `997b29a1fc4318bfca96045af254f56360ed438d`, previous `f882bb96450580d51dc63f142d19531a67185132`, template `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215` 고정 | 현재 public HEAD `a671f58…`와 다른 입력이다. 고정 파일을 갱신하지 않은 성공 run으로 현재 후보를 승인할 수 없다 |
| [`scripts/run-codex-ci.mjs`](https://github.com/Sangeok/stagekeeper-codex-ci/blob/b086ec055f8de32760b93668480b7747de952527/scripts/run-codex-ci.mjs)의 `targetConfiguration`, `safeResult`, `main` | source/previous/template checkout SHA·clean 상태 확인. 이전·후보 bundle 생성, 실제 Codex local marketplace 설치, cache에서 helper 사용. init 신규/update → eval → pipeline 순서 | 설치를 처음부터 만드는 작업은 불필요하다. 새 연결과 빈 설치 cache에서의 신규 설치는 구분해야 한다. 현재 wrapper는 모든 phase를 한 번에 실행하며 독립적인 모델 없는 init dispatch는 없다 |
| [`scripts/codex-auth-smoke.mjs`](https://github.com/Sangeok/stagekeeper-codex-ci/blob/b086ec055f8de32760b93668480b7747de952527/scripts/codex-auth-smoke.mjs), [`scripts/start-runner.mjs`](https://github.com/Sangeok/stagekeeper-codex-ci/blob/b086ec055f8de32760b93668480b7747de952527/scripts/start-runner.mjs) | Codex 0.167.1, 별도 로그인 홈, 인증 없는 설치 홈, ephemeral runner. auth smoke는 실제 모델 1 turn이며 launcher가 runner 시작과 dispatch를 담당 | `init` 리허설의 모델 0과 workflow 전체의 모델 0은 다르다. Windows의 홈·권한·프로세스 구현 근거로 전용할 수 없다 |
| `results.json`와 job summary | `{ target, results }`, summary에는 `completed` 추가. `safeResult`는 실패/runner 정리 실패를 거부하고 eval 10회·pipeline terminal·진단을 검사 | 전체 job 결론, phase/scenario 완전성, runtime/verifier/이전 설치물 identity, 검토 완료까지 묶는 새 판정이 필요하다. 성공 phase 결과는 fixture 정리 전에 배열에 들어가므로 배열만으로 최종 성공을 판정하지 않는다 |
| [run 42975322701 / attempt 1](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/42975322701) | 2026-11-11 수동 실행, 위 private revision, API상 `completed/success`. 직전 두 실행은 failure | run metadata만 확인했다. 원문·diagnostics 검토 완료·현재 후보 성공은 미확인이다 |

private wrapper의 인증 홈과 설치 홈 분리는 보존한다. 이전 bundle은 고정 이전 commit으로 **재생성**한 설치물이지 과거 배포 archive를 그대로 받은 것이 아니다. update의 요구 대상이 재생성된 호환성 fixture인지 실제 배포 artifact인지 구분해 기록하고, 후자를 요구하는 채널은 원래 artifact 없이는 충족으로 세지 않는다.

### 지원 범위와 작업 소유권

[verification.md](../../architecture/verification.md)의 지원 OS는 두 클라이언트 모두 Windows와 macOS다. Linux는 공통 검사의 실행 환경이며 제품 native 인수 대상은 아니다. 이번 문서가 기존 OS 지원 결정을 다시 미확정으로 만들지 않는다.

| 환경 | 현재 확보한 소스/문서 근거 | 이번 목표 또는 미확정 사항 |
| --- | --- | --- |
| Windows x64 / Claude | 공개 init·pipeline CI | 기존 경로 유지, 공통 판정과 필요한 lifecycle 사례 보완 |
| Windows x64 / Codex | 공통 runtime CI·과거 native 인수 | native bundle 신규/update·init·실제 모델 CI 경로 확정 및 추가 |
| macOS arm64 / Claude | 공개 init CI; pipeline은 공개 표에 미충족 | 기존 승인된 macOS pipeline 작업과 연결 |
| macOS arm64 / Codex | private workflow·설치 wrapper·고정 입력·최근 성공 run metadata 확인 | 현재 후보로 입력 정렬, 모델 없는 init 진입점·공통 판정·증거 연결 보완 |
| macOS x64 / 두 클라이언트 | 공통 runtime CI. 실제 모델/설치 전체 지원 범위는 조사 자료만으로 확정 불가 | 기존 x64 검사를 유지한다. 필수 native 인수 여부·runner·설치 채널을 P0에서 결정한다 |

앞의 네 조합을 이번 구현 순서로 확정했다. Intel은 기존 runtime 검증을 유지하며 실제 모델 인수는 후속이다. 이는 Intel 지원 삭제나 전체 macOS 인수 완료 선언이 아니다. Claude의 기존 source 채널과 Codex의 local bundle 채널을 우선 유지한다.

기본 목표에서 설치/new-user·update와 pipeline·lifecycle은 각 OS/client에 필요하다. 모델 init eval은 client마다 검증된 macOS 경로를 한 번 사용한다. Windows 모델 pipeline의 성공이 macOS를 대체하지 않지만, 모델 eval을 두 OS에 중복하는 것도 기본 요구는 아니다. Intel native 인수를 채택하면 runner뿐 아니라 Node bundle·브라우저·DB 준비까지 확정해야 한다. 현재 공개 smoke의 DB 입력은 `windows-x64`/`darwin-arm64`, private wrapper의 DB 패키지는 `darwin-arm64`로 고정돼 있다.

| 기존 작업 | 관계와 보존할 경계 |
| --- | --- |
| [ci-os-coverage](../completed/2026-11-17-ci-os-coverage.md) | 승인된 OS 분류·검사기를 재사용한다. Claude macOS pipeline leg는 이 작업이 소유하며, 모든 pipeline 실행에 두 OS를 포함한다는 기존 결정을 보존한다. R2 승격 이후 진행 조건과 현재 이행 상태를 확인하고 중복 PR을 만들지 않는다 |
| [Claude verifier namespace](../completed/2026-11-12-claude-verifier-skill-namespace.md) | template pin·client-init workflow와 겹친다. 현재 원본과 R2 활성 상태를 확인하되 이 작업에서 R2를 import/activate하지 않는다 |
| [role-command-time-limit](./role-command-time-limit.md) | runtime 시간 한도와 재인수 근거의 소유자다. 옛 120초 문서나 과거 bundle을 현재 값으로 가정하지 않으며 이 제안에서 한도를 다시 바꾸지 않는다 |
| [template acceptance](./template-release-acceptance-follow-ups.md) | 설치 source/template/lock tuple과 운영 인수의 경계를 재사용한다. 격리 CI를 운영 전환·복구 완료로 보고하지 않는다 |
| [runner installation](../completed/2026-11-12-runner-usage-limit-installation.md) | 개인 PC 설치와 자연 발생 사용 한도 관찰은 범위 밖이다. CI를 위해 개인 설치를 갱신하거나 한도를 소진하지 않는다 |
| [gate run records](../completed/2026-11-12-gate-run-records.md) | private Codex 결과 연결은 기존에 남겨 둔 후속이다. 공개/비공개 기록을 연결하되 원문과 인증은 private 경계에 남긴다 |

## Scope

포함: 지원 조합·검증 수준 정의, 설치와 update, 실제 모델 init 평가·pipeline, 승인/중지/재개/정리, 증거 정규화, 실행 정책, 기존 coverage 검사와 승격 절차 연결.

제외: 제품 기능 확대, Linux native 지원, 개인 PC 설치 변경, 공개 marketplace 출시·서명, 운영 DB/migration/template activation, 모델 공급자 변경, 새 테스트 프레임워크, 모든 PR의 전체 모델 실행, 모든 게이트의 110분 idle 의무화. 발견한 제품 결함은 영향 범위와 회귀 검증을 별도로 명시한 후 처리하며 테스트를 위해 권한 정책을 완화하지 않는다.

## Behavioral Requirements

### REQ-DCP-001: 필수 검증 조합의 명시

WHEN CI 후보를 평가할 때, 검증기는 확정한 client·OS·architecture·설치 채널·검증 수준·scenario의 필수 집합과 실제 결과를 대조해야 한다. 빠진 조합은 미충족으로 표시하며 다른 조합의 성공으로 채우지 않아야 한다.

### REQ-DCP-002: 실행 대상 식별

WHEN 인수 결과를 기록할 때, 검증기는 서버·플러그인·workflow SHA를 구분하고 해당 phase의 template 또는 eval fixture identity, client/OS/architecture/version, plugin version, scenario, workflow 저장소·run/attempt를 기록해야 한다. 실제 gate leg를 실행한 출처와 그 결과를 게시한 record job의 출처를 분리하며, 재기록으로 실행 identity를 바꾸지 않아야 한다. bundle 경로에는 package/runtime/verifier hash와 설치 후 inventory 대조 결과를, update에는 이전 설치물 identity도 기록해야 한다. 그 단계가 사용하지 않는 자원은 명시적 비해당 사유로 구분하며, 필요한 identity 누락이나 서로 다른 의미의 SHA 치환은 배포 증거로 거부해야 한다.

### REQ-DCP-003: 실제 신규 설치와 초기화

WHEN 신규 설치 scenario를 실행할 때, 리허설은 승인된 배포 채널의 실제 client loader로 후보를 설치·발견하고 설치 cache의 payload를 확인한 뒤 그 helper로 등록·dry-run·생성·연결을 수행해야 한다. dry-run 및 다른 client의 관리 파일은 보존되어야 하며, bundle 계약인 경우 global Node 없는 helper 환경에서도 성공해야 한다.

### REQ-DCP-004: 이전 판에서 업데이트

WHEN update scenario를 실행할 때, 리허설은 identity가 확인된 이전 지원 설치본으로 연결한 상태에서 후보로 갱신해야 한다. 사용자 수정·다른 client 설정·기존 실행 pin 보존과 새 연결 상태를 확인해야 한다. 이전 설치물 또는 필요한 template 전환 근거가 없으면 신규 설치로 대체하지 않고 미실행 원인을 보고해야 한다.

### REQ-DCP-005: 실제 모델의 전체 파이프라인

WHEN pipeline scenario를 실행할 때, 리허설은 설치된 helper·native client·resident runner를 통해 지정한 백로그를 실행해야 한다. 완료 상태, 해당 plan/profile의 필수 역할의 accepted terminal outcome, 계획·구현 commit과 보고서 연결, 독립 산출물 사례 및 테스트 성공을 모두 확인해야 한다. 닫힌 AgentRun 또는 모델의 완료 문장만으로 통과시키지 않아야 한다.

### REQ-DCP-006: 클라이언트별 init 스킬 평가

WHEN init 스킬 평가를 실행할 때, 평가기는 실제 쓰기를 검출하는 대조군을 통과한 뒤 해당 client의 승인·dry-run·수정 보존·불완전 package 거부 계약에 해당하는 사례를 실행해야 한다. 모델 출력만이 아니라 도구 이벤트와 실제 파일 변화를 관찰해야 하며, 다른 client의 고유 대화 절차를 강제하지 않아야 한다.

### REQ-DCP-007: 승인·중지·재개·정리

WHEN owner gate 대기 또는 실행 중 중지 scenario를 실행할 때, 리허설은 승인 전 금지된 다음 단계가 실행되지 않음, 실제 owner service의 승인 후 진행, 소유 프로세스 종료·잠금 반납, 재개 후 기존 실행과 결과의 일관성을 확인해야 한다. IF timeout·취소·종료 실패가 발생하면, THEN 성공으로 기록하지 않고 자신이 만든 자원만 정리하거나 안전하게 보존한 사유를 남겨야 한다.

### REQ-DCP-008: 인증과 실행 사전 검사

WHEN 설치 또는 모델 실행을 시작할 때, 실행기는 검토된 source와 신뢰된 runner, 해당 단계에 필요한 인증·bundle·DB·private template·현재 역할 권한을 먼저 확인해야 한다. IF 인증 만료·필수 자원 부재·신뢰되지 않은 PR이면, THEN 의존 작업을 시작하지 않고 원인을 구분해 기록해야 한다. init 단계는 모델을 호출하지 않아야 한다.

### REQ-DCP-009: 공통 결과와 비공개 진단

WHEN 어느 저장소에서든 CI 결과를 수집할 때, 기록기는 client/환경/단계별 허용 필드 요약과 원본 run 출처를 보존해야 한다. 도구 오류·step 거부·추가 역할 호출·`reviewRequired`를 누락하지 않아야 하며, 인증·template 본문·대화 원문은 공개 로그/issue/artifact에 포함하지 않아야 한다.

### REQ-DCP-010: 배포 증거의 엄격한 판정

WHEN 배포 후보를 판정할 때, 판정기는 필수 집합 전체의 해당 identity 성공과 요구된 검토 완료를 확인해야 한다. IF 결과가 실패·취소·skip·누락·identity 불일치이거나 미해결 검토가 있으면, THEN 그 후보를 통과시키지 않아야 한다. 기록 job만 재실행할 때 모델을 다시 호출하지 않아야 한다. 출처와 내용이 같은 재기록은 한 실행의 증거로 취급하고, 서로 충돌하는 기록이나 출처를 확인할 수 없는 중복은 거부해야 한다.

### REQ-DCP-011: 실행 빈도와 기존 정책 보존

WHEN 변경 또는 정기/수동 실행이 발생할 때, workflow는 공통·OS별·client별 분류에 따라 필요한 검증을 선택하고 선택 이유를 남겨야 한다. 새 리허설·판정·패키징 파일만 바뀌어도 필요한 검증이 선택되어야 한다. 기존 필수 PR/승격 검사와 승인된 Claude 양 OS pipeline 정책을 보존해야 한다. 자격 없는 PR의 비밀값 없는 검사와 배포 인수를 구분해야 한다.

### REQ-DCP-012: 사용량·동시 실행·재시도

WHEN 실제 모델 job을 실행할 때, 실행기는 계정/인증 홈의 소유권과 승인된 시간·사용량 한도를 지키고 시간·모델·제공되는 사용량/비용을 기록해야 한다. 동일 계정의 충돌 실행을 직렬화하며 알 수 없는 사용량을 0으로 기록하지 않아야 한다. 재시도는 원래 실패를 보존하고 외부 원인으로 확인된 경우 한 번만 허용해야 한다.

### REQ-DCP-013: 커버리지와 기록의 누락 검출

WHEN job 또는 gate leg를 추가·삭제·이동할 때, 검증기는 architecture의 OS 분류표, client별 필수 집합, workflow 출력, record의 leg 집합 간 차이를 검출해야 한다. private 결과를 조회하지 못한 경우 확인 완료로 표시하지 않아야 한다.

## Invariants and Constraints

### INV-DCP-001: 증거는 특정 실행 대상에만 유효하다

한 OS·client·architecture·설치 채널·단계의 PASS는 다른 조합을 증명하지 않는다. 이전 코드·template·bundle의 PASS도 새 후보의 PASS가 아니다. 같은 모델 답변이나 같은 시험 개수는 동등성의 조건이 아니다.

### INV-DCP-002: 제품 권한과 데이터 소유권은 그대로다

CI가 실제 사용자 승인·역할 격리·실행 pin·commit handoff 계약을 우회하지 않는다. 테스트 controller의 owner service 호출은 실제 웹 UI 인수와 구별한다. 운영 DB·개인 홈·다른 작업의 프로세스는 fixture가 아니다.

### INV-DCP-003: 실패 이력과 기존 검증은 보존한다

새 범위가 준비되지 않았다는 이유로 기존 green 조건을 약화하거나 실패/skip 기록을 지우지 않는다. 성공한 재실행도 이전 실패의 원인과 시도를 보존한다. coverage 표의 미충족 허용은 제품 인수 완료를 뜻하지 않는다.

### CON-DCP-001: 문서와 구현의 권한 경계

현재 구현 권한은 front matter의 실제 수정 요청과 후속 범위 답변을 따른다. public/private CI의 코드·workflow 수정과 로컬 검증을 진행한다. runner·인증·예산·운영 선행 조건이 필요한 실제 실행은 준비 전까지 보류하며, 개인 설치 변경과 운영 배포를 자동으로 수행하지 않는다.

### CON-DCP-002: native 설치 계약과 비밀값 경계

[system-overview](../../architecture/system-overview.md)와 [protocol](../../architecture/protocol.md)을 따른다. Codex bundle과 App Server/native 로그인 경로를 실제로 검증한다. public PR에 개인 로그인 캐시를 제공하거나 role 환경변수 allowlist·LPAC·Seatbelt를 완화하지 않는다. Claude source 설치 예외는 유지하며 bundle 인수와 구분한다.

### CON-DCP-003: 기존 도구·경계·테스트 배치

Node.js·`node:test`·tsx·기존 PostgreSQL fixture·리허설을 사용한다. `scripts/rehearsals/` 옆에 시험을 두고 서버 내부 참조가 늘면 [server.md](../../architecture/server.md)의 목록을 갱신한다. `src/app`·`src/fsd`·`packages/core`에 CI 전용 코드를 넣거나 새 framework/패키지를 도입하지 않는다.

### CON-DCP-004: 기존 승격과 병행 작업의 계약

[AGENTS.md](../../../AGENTS.md), [verification.md](../../architecture/verification.md), 승인된 [ci-os-coverage](../completed/2026-11-17-ci-os-coverage.md)를 보존한다. 같은 commit/입력의 완료된 green 실행을 재사용하고 진행 중인 gate를 중복 dispatch하지 않는다. 현재 30분 초과 gate의 사용자 보고·취소 절차를 임의로 바꾸지 않는다. 110분 idle은 일반 승격 gate와 분리된 명시적 장시간 인수로 남긴다.

## Proposal

### 검증 수준과 재사용 구조

| 수준 | 판정 대상 | 구현 방향 |
| --- | --- | --- |
| 공통 회귀·native 계약 | 순수 로직, 격리·파일·process·offline build | 기존 `check` 및 OS runtime workflows 유지 |
| 설치·init | 실제 loader 선택, 설치물 inventory, 신규/update·dry-run·MCP 연결 | Claude 현재 경로 유지, Codex macOS 경로 재사용, Windows host 어댑터 추가 |
| 모델 init 평가 | 각 스킬 계약에 따른 행동과 실제 쓰기/보존 | 기존 Claude eval과 Codex eval 유지. 공통 형식으로 결과를 연결하되 모델 동작 평가 자체를 OS마다 무조건 복제하지 않음 |
| 실제 pipeline | 공통 백로그·계획·독립 검증·구현·인수·정리 | 기존 `pipeline-smoke-steps.mjs`의 독립 사례 재사용. client/OS 실행 차이는 리허설 경계에서 처리 |
| lifecycle·추가 능력 | owner gate, 중지/재개, QA/scout, 선택 idle | 공통 필수 lifecycle 사례 추가. 기존 Codex QA/scout/role 증거를 삭제하지 않고 profile별 추가 사례로 보존 |

한 개의 거대한 workflow나 공통 실행기 재작성은 목표가 아니다. DB fixture, 독립 산출물 검사, identity와 결과 판정을 먼저 재사용한다. `rehearse-codex-macos.mjs`의 Darwin runtime 로딩·POSIX PATH·`bin/harness`·browser 준비를 `process.platform` guard 제거만으로 Windows에 이식하지 않는다. Windows는 `harness.ps1`, Windows bundle/runtime, 경로·프로세스·브라우저 준비를 실제로 검증한다.

현재 Codex macOS 리허설은 이미 설치된 `--package`를 받으며, private wrapper가 실제 local marketplace loader를 실행한다. 이 연결을 재사용한다. 다만 wrapper는 이전 설치 → 후보 설치를 한 cache에서 수행한 뒤 신규 프로젝트 연결과 update를 시험한다. 빈 설치 홈에 후보만 설치하는 사례와 이전 연결을 후보로 갱신하는 사례를 분리해, 신규 설치와 신규 연결을 혼동하지 않는다. 후보 생성 → 검토된 설치 채널 → 실제 설치 cache 확인 → helper init → 모델 실행의 연결을 끊김 없이 기록한다.

모델 없는 설치 검증에는 private workflow/실행기의 phase 선택과 사전 검사를 분리한다. `init`에서는 auth smoke·eval·pipeline을 호출하지 않고, `eval`/`pipeline`의 인증 검증은 실제 모델 사용량으로 센다. 현재 private `--run-models` 전체 실행을 init 전용 명령으로 기재하지 않는다. 설치 실패·동일 version의 stale cache·inventory 불일치는 helper 실행 전에 거부한다.

Windows entrypoint는 기존 Mac eval 실행기를 그대로 import해 실행하지 않는다. `codex-init-eval.mjs`의 `evalTurn`은 음수 PID process-group signal, `preflightInitEval`은 `/bin/cat`·`bin/harness`, `initEvalConfiguration`은 Mac 파일 경로·POSIX 환경을 사용한다. 기본 eval host는 macOS로 유지하고 Windows에서는 설치/pipeline과 그 native 정리 경로를 검증한다. `childEnvironment`가 `CODEX_HOME`을 전달하지 않으므로 `CODEX_HOME` 설정만으로 Windows 역할의 인증 격리를 증명하지 않는다. 실제 역할 프로세스가 사용하는 홈·profile·deny 경계를 P2에서 확인한다.

Claude의 Pro 기본 pipeline과 Codex의 Max·QA·scout pipeline을 같은 역할 개수로 비교하지 않는다. 공통 baseline은 같은 백로그 요청·독립 기대값과 공통 상태 전이로 정의하고, plan/profile별 필수 역할과 추가 인수는 별도 목록으로 검증한다. 기존 Codex의 더 넓은 검증을 baseline 공통화 과정에서 축소하지 않는다.

### identity와 기록 계약

새 공통 계약은 `client`, `clientVersion`, `os`, `architecture`, `osVersion`, `phase`, `scenario`와 workflow repository·`workflowCommit`·run ID·attempt를 식별한다. 제품 검증에는 `pluginCommit`·`pluginVersion`·`installChannel`을 더하고, 아래 phase별 자원 identity를 적용한다. 모델 실행은 model과 제공되는 usage, 모든 실행은 duration·result·소유한 자원의 cleanup·review 상태를 남긴다. 기존 `sourceCommit`은 원본 의미를 확인해 변환하고 호환 필드로 보존할 수 있지만 server/plugin/workflow SHA를 대신하지 않는다.

| phase/경로 | 필수 추가 identity | 비해당과 누락의 구분 |
| --- | --- | --- |
| 실제 설치/init 및 pipeline | `serverCommit`, `templatesCommit`, 설치 채널. bundle은 package/runtime/verifier identity, update는 이전 설치물 identity | source 설치에서 bundle hash를 꾸며 넣지 않음. 필요한 source/cache 증거는 생략 불가 |
| Claude `agent-eval` | 복사한 plugin과 `plugin/evals` fixture의 source commit·선택한 case/tag·반복 수·실제 평가한 사본. 채널은 설치가 아닌 source-copy 평가임을 구분 | 서버·외부 template을 쓰지 않으므로 그 identity는 사유가 있는 비해당. 실제 설치 성공으로 세지 않음 |
| Codex Mac eval | 실제 초기화된 설치 bundle·server/template identity와 control/3개 case·반복 수 | 현재 Mac eval은 연결된 fixture를 사용하므로 Claude eval처럼 server/template을 생략할 수 없음 |
| 독립 auth smoke | workflow commit·client executable identity·모델 완료·사용량·정리 | 제품 설치/서버/template 인수로 세지 않음. 이후 제품 실행의 인증 보조 증거일 뿐임 |

P1의 schema는 이 구분을 검증한다. `not-applicable`은 알려진 phase 계약으로만 허용하고 누락값의 자동 기본값으로 쓰지 않는다. cleanup도 실제 생성한 자원별로 검사하며, browser/DB를 만들지 않는 평가에 가짜 종료 성공을 채우지 않는다.

기존 공개 요약의 `pluginCommit`과 gate row의 `commit`, private wrapper의 `sourceCommit`, raw macOS 요약의 `codex`·`templatesExportCommit`을 의미 대조 후 정규화한다. 필드 이름만 바꾸거나 사라진 필드를 기본값으로 채우지 않는다. 현재 `summarize`는 알려진 failure 유무로 결과를 계산하므로 raw Codex JSON을 직접 넣어 실패가 PASS로 바뀌지 않게 client별 변환 뒤 엄격히 검증한다.

private auth summary의 `sourceCommit`은 `GITHUB_SHA`, 즉 **private workflow commit**이다. wrapper의 `target.sourceCommit`은 **제품 checkout commit**이다. 공개 PR init은 기본 checkout의 merge SHA와 `PLUGIN_COMMIT`의 PR head SHA가 다를 수 있다. 따라서 source 필드 이름의 일치로 연결하지 않고 실제 checkout·설치 provenance를 대조한다. branch 입력은 full SHA로 해석하고 실제 설치 commit이 다르면 실패한다. `clientVersion('codex-cli 0.167.1')`은 현재 Claude 파서에서 누락되므로 client별 버전 파서도 필요하다.

현재 package의 `packageSha256`은 archive bytes가 아니라 정렬된 inventory JSON의 SHA256이다. Windows row는 `[path, sha256]`, macOS row는 `[path, sha256, mode]`이고, inventory 뒤에 쓰는 `windows-package.json`/`macos-package.json` 자체는 그 목록 밖이다. OS별 규칙으로 설치 cache의 파일 집합·bytes·필요한 mode를 재계산하고, manifest sourceRevision·runtime executable digest·두 verifier 사본을 별도로 대조한다. archive digest가 필요하면 다른 필드로 기록한다. 제외한 manifest를 자기 hash에 포함하거나 두 OS의 inventory 형식을 같다고 간주하지 않는다.

새 gate row/schema에는 version을 명시하고 기존 기록 reader를 유지한다. 과거 schema가 가진 정보보다 넓은 인증을 소급하지 않는다. 정규화는 allowlist 출력만 생성하며 unknown/result 누락·`running`·부분 성공·정리 미완료를 PASS로 보정하지 않는다. private `safeResult`의 진단과 phase별 필수 항목을 보존하고 **전체 job 결론 + 모든 필수 phase/scenario + cleanup + provenance + 검토 완료**를 판정한다. `reviewRequired: false`를 검토자가 실제 검토했다는 증거로 만들지 않는다.

실행과 기록의 재시도는 별개다. 현재 gate-record action은 record job의 `GITHUB_RUN_ATTEMPT`로 행을 쓰고 매번 댓글을 추가한다. 반면 기존 계약은 record만 재실행할 때 앞 시도의 gate 출력을 재사용한다. 따라서 새 schema는 leg마다 실제 실행의 repository/run/attempt/job·leg 식별자와 결과 identity를 보존하고, record 실행의 run/attempt·게시 출처를 별도로 둔다. 현재 record attempt를 원래 gate attempt로 대입하거나 모든 leg가 같은 attempt에서 실행됐다고 가정하지 않는다. trusted consumer가 실행·출력·정리 결과의 연결을 확인하지 못하면 새 인수 증거로 채택하지 않는다.

동일한 실행 출처와 동일한 정규화 결과를 여러 번 게시한 경우에는 기록 이력을 보존하면서 필수 집합에는 한 번만 센다. 같은 출처에 내용이 다른 행, 선택한 실행 안의 중복 leg, 이전 결과를 새 실행으로 위장한 행은 거부한다. 실제 gate 재실행은 별도 시도로 보존하며, 후보 판정은 선택한 시도와 재실행 사유·검토 결과를 명시한다. 더 최근의 실패나 미해결 진단이 있는데 과거 green만 골라 통과시키지 않는다. 검토 완료도 해당 실행과 결과에 연결하며 새 진단에 자동 승계하지 않는다. record 복구는 모델 재시도 횟수나 사용량을 새로 만들지 않는다.

공개 기록에는 허용 필드만 둔다. private 결과는 승인된 private 기록에 원본 출처와 함께 남기고, 배포 판정은 접근 권한이 있는 controller/검토자가 필요한 증거를 확인한다. 성공이라고 주장하는 임의 JSON을 배포 증거로 받지 않는다. 출처를 확인하지 못하면 미충족이다. 이 문서 작성 중 issue·comment를 게시하지 않는다.

현재 공개 `agent-eval.yml`은 shell 명령과 마지막 assistant 메시지 일부를 로그에 출력한다. 이는 REQ-DCP-009의 목표와 다르므로 보존 대상으로 취급하지 않는다. 해당 출력의 제거/허용 필드 요약 전환, `agent-eval-summary.mjs`와 workflow 연결 검사, architecture의 기존 로그 설명 갱신을 같은 구현에 포함한다. GitHub secret masking만으로 임의 모델 본문이 안전하다고 판정하지 않는다. 원문 진단이 필요하면 승인된 비공개 보관 경로를 사용하며, 새 보관 경로를 선택하기 전에는 출력부터 공개로 확대하지 않는다.

### 최종 산출물과 판정 위치

| 최종 산출물 | 결정하는 소스·우선순위 | 확인할 본문·의존성 | 검증 위치 |
| --- | --- | --- | --- |
| client가 선택한 설치 cache | 검토된 source → 선택한 source 또는 OS bundle 채널 → 실제 loader가 선택한 cache. export 디렉터리보다 cache가 최종 대상 | source는 해당 commit의 plugin payload·helper·hooks·검증 스킬을 비교. bundle은 두 manifest·전체 inventory·native launcher/Node·hooks 변환·두 verifier 사본 및 template/eval/test-only 제외를 추가 검증 | VFY-DCP-03의 채널별 실제 cache 비교와 기존 package 시험. 캐시 파일 누락/변조·동일 version 잔존을 거부. source에 생성 runtime이나 bundle 전용 사본을 요구하지 않음 |
| 연결 결과 | 설치 helper + 고정 template + 서버의 설치/실행 pin 계약 | runbook·client 설정·lock·MCP 연결 body·기존 실행 pin·사용자 수정. 다른 client 파일 보존 | VFY-DCP-03의 신규/update 저장 상태·파일 비교. 기존 `export` 분기처럼 export root만 확인하는 것으로 대체하지 않음 |
| init 평가 결과 | Claude는 source-copy plugin/eval fixture와 shell 대조군, Codex는 설치 bundle·연결된 fixture와 native 대조군 | 실제 평가 사본·선택 사례·반복 수·쓰기 검출·파일 보존. Claude fixture 의존성은 아래 inventory의 case/fixture 경로 | VFY-DCP-06 및 VFY-DCP-02. 일부 case 성공이나 source-copy 평가를 전체 설치 인수로 승격하지 않음 |
| pipeline 산출물 | 서버 accepted 원장 + 해당 보고서 commit + 독립 fixture | 필수 역할 terminal, 보고서/plan/구현 commit 대응, `slug`/`truncate` 기대값, QA가 읽는 구현 commit | VFY-DCP-05/07. checkout의 우연한 최신 파일이나 닫힌 run만으로 승인하지 않음 |
| 공개·private 요약 | client별 원본 → 정규화 → 허용 필드 직렬화. 원본 성공 주장만으로 승격 불가 | identity, 필수 phase/scenario, 진단, 전체 job 결론, runner/browser/server/DB 정리 결과. `results.json`, job output/summary, gate row 모두 비교 | VFY-DCP-02/08. stdout·stderr·summary·artifact·issue 각각에서 합성 민감 문자열과 원문이 노출되지 않는지 확인 |
| 후보의 최종 판정 | 확정한 필수 집합 + leg별 실제 실행 출처 + 별도 기록/검토 이력 | 동일 실행의 동일 재기록은 한 번만 셈. 빠진/충돌하는 중복 leg, 다른 candidate, partial eval, cleanup 실패, review 미해결을 거부 | P4의 기존 승격 절차와 공통 판정 연결. 선택한 실행과 재시도 사유 확인. 로컬 순수 검사에는 네트워크/게시 부작용 없음 |

### 실행 시점

| 상황 | 기본 정책 | 완료로 세는 범위 |
| --- | --- | --- |
| 일반 PR | 기존 `check`와 경로 조건에 맞는 native runtime, 기존 init smoke 유지 | 실행된 범위만 |
| 설치/패키징 관련 신뢰된 후보 | 대상 조합의 모델 없는 신규/update·init | 해당 설치 채널·identity |
| 실제 모델 정기/수동 실행 | 기존 스케줄 보존. Codex 빈도·runner 시작·계정 예산은 P0에서 확정 | 해당 commit/입력/환경 |
| pipeline 승격 대상 변경 | 기존 경로 조건과 Claude 양 OS 실행 결정을 보존하고, 대상 Codex 조합의 증거를 추가 | 정확히 같은 후보와 입력의 필수 결과 전체 |
| runtime 취소/소유권/장시간 관련 변경 | 영향을 받는 OS/client의 lifecycle 검증. 110분 idle 필요 여부는 변경 영향과 기존 인수 계약으로 결정 | 측정한 기간·payload·환경만 |

공통 정책이나 두 client에 전달되는 template 변경은 두 client의 영향을 평가한다. OS 전용 준비 코드의 변경을 좁혀 실행할 때는 근거를 남기되 승인된 Claude의 양 OS pipeline 규칙을 축소하지 않는다. 공개 PR에서는 자격 부족 skip을 허용하는 기존 정책을 유지하지만 그 결과로 배포 인수를 충족시키지 않는다.

변경 선택은 workflow 작성과 함께 연결한다. 현재 `AGENTS.md`의 pipeline 승격 경로에는 `rehearse-codex-macos.mjs`, `codex-init-eval.mjs`, 제안 Windows entrypoint와 공통 계약이 없다. P4에서 새 파일·package 생성기·gate 정규화·검사기까지 영향 분류하고 `AGENTS.md`, `client-init-smoke.yml`의 PR paths, `pipeline-smoke-steps.test.mjs`, `verify-ci-coverage.test.mjs`를 함께 맞춘다. 각 추가 경로만 바꾼 입력으로 필요한 gate 선택과 양 OS 보존을 검증한다. private 저장소 변경은 public `git diff`에 나타나지 않으므로 workflow revision·`ci-target.json` 변경도 별도 후보 재검증 사유다. 파일이 존재하는지만 확인하는 현재 trigger 시험으로 선택 완전성을 주장하지 않는다.

Codex CI의 필수 승격 게이트 전환은 기존 공개 준비 작업의 결정과 연결한다. 현재 정책은 공개 전 Codex CI를 필수 게이트로 두지 않는다. 이 명세는 동등화 후의 강화된 조건을 제안하지만, P0에서 적용 시점·필수 집합·운영 책임을 확정하기 전에는 현행 승격 규칙을 이미 바꿨다고 기재하지 않는다. private 165분 job과 공개 gate 30분 초과 보고/취소 규칙의 적용 범위도 P0에서 명시하고, job timeout과 운영 취소 기준을 같은 값으로 읽지 않는다.

같은 계정/홈을 쓰는 모델 작업은 저장소가 달라도 직렬화한다. GitHub `concurrency` 이름을 두 저장소에서 같게 적는 것으로 교차 저장소 잠금이 생겼다고 가정하지 않는다. 기존 private runner의 소유권과 실행 순서를 확인하고, 처음에는 소유자를 확인하는 직렬 dispatcher로 시작할 수 있다. 비용을 줄이기 위해 검증되지 않은 권한·인증 우회를 만들지 않는다.

### Runtime Lifecycle

| 사건 | 소유자와 기대 결과 | 실패 처리 |
| --- | --- | --- |
| 인증/runner/template 준비 실패 | workflow preflight가 모델·설치 의존 단계 전에 종료 | 원인·미실행 leg를 기록; 자동으로 다른 로그인/API 경로로 전환하지 않음 |
| init 실패 또는 update 충돌 | 설치 adapter가 이전 상태·사용자 수정·양 client 설정을 관찰 | 충돌을 덮어쓰지 않고 실패; 신규 설치로 바꿔 통과시키지 않음 |
| owner gate 대기 | 시험 controller가 gate와 금지된 진행 부재를 확인한 뒤 실제 owner service 호출 | 상태를 DB 직접 수정해 건너뛰지 않음; 웹 UI 인수로 보고하지 않음 |
| 중복 실행/인증 홈 점유 | workflow/controller가 소유권 확인·직렬 실행 | 진행 중 run을 취소해 새 후보를 끼워 넣지 않음 |
| 중지/timeout/취소 | runner stop → 소유 process tree·브라우저·서버 정리 → 잠금 반납 → fixture/DB 정리 확인 | 정리 미확인은 실패; `runnerStopped` 하나로 전체 정리를 증명하지 않음. 운영 프로세스 일괄 종료 금지, 소유 자원 보존 사유 기록 |
| 인증 만료/모델 오류 | 실제 오류와 사용량을 가능한 범위에서 요약 | 무제한 재시도 금지; 외부 원인 확인 뒤 한 번만 재실행 |
| 기록만 실패 | 기존 gate 출력과 leg별 실행 출처를 보존해 record job만 재실행; record attempt는 별도 기록 | 동일 출처·동일 결과의 재게시만 중복 제거. 충돌/출처 누락은 실패; 모델 호출·사용량 중복 집계 없음 |
| green이지만 진단 존재 | `reviewRequired` 또는 기존 gate issue의 원인 검토 | 계약/힌트/template 결함이면 수정과 새 후보 검증, 사유 없이 검토 완료로 닫지 않음 |

## Blockers

### BLK-DCP-01: 지원 집합·승격 적용 시점과 추가 host 계약

- classification: downstream; P0의 조사 산출물이며 P2/P3 진입을 막는다.
- evidence: private workflow·고정 SHA·설치/기록 경로를 확인했다. 기본 네 조합부터 구현하고 Intel native 인수는 후속으로 두는 순서를 확정했다. Windows host는 아직 없으며 추가 채널과 필수 승격 전환 시점은 미확정이다.
- affects: REQ-DCP-001, REQ-DCP-002, REQ-DCP-013, TASK-DCP0-01.
- impact: 존재하는 CI의 재작성, 누락된 leg의 오인, 다른 payload 결과 재사용 위험.
- unblock requirement: 기본 네 조합과 기존 source/local-bundle 채널의 phase/scenario 집합을 실제 runner에 연결하고, Codex 승격 적용 시점·추가 runner·예산·시간 정책을 확정한다. 수동 private CI를 정기 실행으로 임의 전환하지 않는다. Intel의 기존 검증은 유지하고 native 확대는 별도 후속으로 남긴다. 비밀값 본문은 읽거나 문서에 넣지 않는다.
- owner: 저장소 소유자와 후속 구현 담당자.
- stop condition: 해당 위치를 조회할 수 없거나 지원 범위가 충돌하면 그 조합의 구현·통과 선언을 중단한다. 다른 독립 문서/순수 계약 작업은 진행할 수 있다.

### BLK-DCP-02: Windows Codex와 추가 runner의 native 인증·실행

- classification: downstream; P2의 제한된 실험으로 해소하며 P3의 선행 조건이다.
- evidence: 역할은 `childEnvironment`와 App Server를 사용하고 private Mac CI는 전용 로그인 홈을 직렬 사용한다. Windows CI의 지속 인증·loader 설치·browser 준비는 확인하지 않았다.
- affects: REQ-DCP-003, REQ-DCP-005, REQ-DCP-008, REQ-DCP-012, TASK-DCP2-01, TASK-DCP3-01.
- impact: generic CLI 성공만으로 제품 실행을 인증하거나 public PR에 자격을 노출할 위험.
- unblock requirement: 먼저 격리된 신뢰 runner, credential provisioning/갱신/폐기·원문 보관·계정 소유권·시간/사용량 한도와 실험 실행 범위를 확정한다. 그 조건에서 P2의 후보 bundle 설치·실제 제품 경로의 최소 모델 실행·종료·재실행으로 해소한다. 아직 얻지 않은 실험 성공을 그 실험 자체의 진입 조건으로 요구하지 않는다. live 실행은 해당 작업의 실행 지시 범위에서만 한다.
- owner: runner/계정 소유자와 후속 구현 담당자.
- stop condition: 일반 제품 경로로 인증·격리·종료를 증명하지 못하면 E2E나 스케줄 확대를 중단한다. 임의 allowlist 확장·다른 인증으로 대체하지 않는다.

### BLK-DCP-03: 기존 승인 작업과 template·이전 bundle 기준

- classification: downstream; P0에서 조정하며 P2 update/P3 Claude macOS 연결을 막는다.
- evidence: `ci-os-coverage`가 macOS Claude pipeline을 소유하고 R2 승격 뒤 진행하도록 정했다. template namespace 후속과 설치 인수 문서도 active다.
- affects: REQ-DCP-004, REQ-DCP-005, REQ-DCP-011, CON-DCP-004, TASK-DCP0-01.
- impact: 중복 구현, 승인 범위 침범, 잘못된 template pin·가공한 이전 설치물로 update를 검증할 위험.
- unblock requirement: 최신 source/template/설치 채널·지원 이전 bundle identity와 병행 작업 상태를 확정한다. 기존 작업이 macOS leg를 구현하면 본 명세는 그 결과를 연결한다. 소유권 이관 시 두 문서에 범위와 근거를 명시한다.
- owner: 관련 제안의 소유자와 후속 구현 담당자.
- stop condition: 기존 작업의 선행 조건이나 이전 artifact가 미확인인 경우 해당 실제 실행을 중단한다. 운영 template activation으로 시험 준비를 대신하지 않는다.

### BLK-DCP-04: private 결과의 승격 증거 연결

- classification: downstream; P4의 필수 선행 조건.
- evidence: 현재 공개 `gate-record`는 3개 workflow만 받는다. private wrapper의 `results.json`/job summary와 `safeResult`는 확인했지만, trusted run 조회·후보별 필수 집합·검토 완료 기록을 결합하는 consumer는 확인되지 않았다. 기존 gate 기록 제안도 이를 별도 후속으로 남겼다.
- affects: REQ-DCP-009, REQ-DCP-010, REQ-DCP-013, TASK-DCP4-01.
- impact: 진단/identity 유실, 위조 성공 요약 수용, 확인하지 못한 조합의 배포 승인 위험.
- unblock requirement: private 원본 run과 검토 완료 상태를 확인하는 주체·권한·schema·기록 위치·실패 처리와 기존 row 호환성을 확정한다. leg별 실행 attempt와 record attempt의 연결, 동일 재게시·충돌·실제 재실행의 구분 및 검토 귀속을 포함한다. 공개로 원문을 복사하지 않는 경로를 선택한다.
- owner: 저장소/배포 소유자와 후속 구현 담당자.
- stop condition: 출처·필수 leg·검토 상태를 확인하지 못하면 새 동등화 완료 및 해당 증거에 의존한 승격을 인정하지 않는다.

## Affected Files

아래는 구현의 허용 후보이다. 공통 계약 두 파일은 생성했으며 Windows entrypoint 두 파일은 runner·native 조건이 미확정이라 아직 생성하지 않았다. 이동·삭제는 계획하지 않는다. private 변경은 별도 checkout과 브랜치에 보존한다.

| 경로/경계 | 변경 의도 | 근거·제약 |
| --- | --- | --- |
| `.github/workflows/client-init-smoke.yml`, `.github/workflows/pipeline-smoke.yml`, `.github/workflows/agent-eval.yml` | 확장 | Claude 경로·macOS 소유권 보존, PR paths·출력·private 원문 조건 연결 |
| private `.github/workflows/codex-ci.yml`, `ci-target.json`, `scripts/run-codex-ci.mjs`, `scripts/run-codex-ci.test.mjs`, `README.md`, `package.json` | 확장 | phase 선택·설치·정규화·기록·입력 고정. package의 기존 check에 변경 실행기의 문법 검사를 포함한다. 새 Windows workflow 경로는 host 결정 후 이 표에 추가해야 구현 가능 |
| private `.github/workflows/codex-auth-smoke.yml`, `scripts/codex-auth-smoke.mjs`, `scripts/codex-auth-smoke.test.mjs`, `scripts/start-runner.mjs` | 기존 Mac 계약 보존; launcher phase 선택 추가 | 인증 격리·같은 계정 직렬화·ephemeral runner. init에서는 모델 인증 검사를 생략하고 기본 dispatch도 init으로 제한한다. 모델 phase는 `--run-models`를 명시한다. Windows에 그대로 복사하지 않음 |
| private `scripts/init-evidence.mjs`, `scripts/init-evidence.test.mjs`, `scripts/collect-init-evidence.mjs`, `.github/workflows/check.yml` | 후속 추가·확장 | 고정 public contract를 쓰는 init adapter·단일 run 읽기 전용 수집기·출처 거부 시험. 허용 필드 artifact만 private에 보관하며 후보 전체 승격 consumer와 구분한다 |
| `scripts/rehearsals/rehearse-client-init-smoke.ts`, `scripts/rehearsals/rehearse-client-init-smoke.test.ts`, `scripts/rehearsals/client-init-smoke-steps.mjs`, `scripts/rehearsals/client-init-smoke-steps.test.mjs` | 확장 | 실제 cache·source identity·bundle/new-user/update 판정 |
| `scripts/rehearsals/rehearse-pipeline-smoke.ts`, `scripts/rehearsals/rehearse-pipeline-smoke.test.ts`, `scripts/rehearsals/pipeline-smoke-steps.mjs`, `scripts/rehearsals/pipeline-smoke-steps.test.mjs` | 확장 | 공통 사례·terminal·lifecycle·승격 선택 규칙 |
| `scripts/rehearsals/rehearse-codex-macos.mjs`, `scripts/rehearsals/rehearse-codex-macos.test.mjs` | 보존·부분 추출 | 기존 init/eval/pipeline·QA/scout와 진단 보존, cleanup 증거 보완 |
| `scripts/rehearsals/rehearse-codex-windows.mjs`, `scripts/rehearsals/rehearse-codex-windows.test.mjs` | 제안: 추가 | Windows native 설치/pipeline. eval은 검증된 Mac 경로 유지 |
| `scripts/rehearsals/client-ci-contract.mjs`, `scripts/rehearsals/client-ci-contract.test.mjs` | 제안: 추가 | 명시적 expected 집합과 증거를 받는 순수 정규화·후보 판정. 네트워크·모델·게시 없음 |
| `scripts/rehearsals/codex-init-eval.mjs`, `scripts/rehearsals/codex-init-eval.test.mjs` | 보존·필요한 결과 연결 | Mac native preflight·쓰기 대조군·파일 판정 유지 |
| `scripts/rehearsals/gate-environment.mjs`, `scripts/rehearsals/gate-environment.test.mjs`, `scripts/rehearsals/gate-record.mjs`, `scripts/rehearsals/gate-record.test.mjs`, `.github/actions/gate-record/action.yml` | 확장 | client 버전·identity·진단·과거 row 호환, 실행/기록 attempt 분리와 최종 consumer |
| `scripts/rehearsals/agent-eval-summary.mjs`, `scripts/rehearsals/agent-eval-summary.test.mjs` | 확장 | 전체/부분 eval 구분, 허용 필드·workflow 로그 경계 검증 |
| `plugin/evals/control-real-write/case.yaml`, `plugin/evals/control-real-write/fixture.sh`, `plugin/evals/first-connection-asks-before-register/case.yaml`, `plugin/evals/first-connection-asks-before-register/fixture.sh`, `plugin/evals/first-connection-asks-before-writing/case.yaml`, `plugin/evals/first-connection-asks-before-writing/fixture.sh`, `plugin/evals/rerun-asks-first/case.yaml`, `plugin/evals/rerun-asks-first/fixture.sh`, `plugin/evals/fixtures/templates/` | 읽기·보존 | 기존 Claude 1개 대조군과 3개 gate 사례 및 fixture. 실제 목록은 source commit으로 고정하며 이번 계획에서 case 본문을 바꾸지 않음 |
| `scripts/checks/verify-ci-coverage.mjs`, `scripts/checks/verify-ci-coverage.test.mjs` | 확장 | public OS 표·job/leg와 client 계약 연결. 외부 CI provenance를 로컬 파서로 인증하지 않음 |
| `scripts/windows/package-windows-plugin.mjs`, `scripts/windows/package-windows-plugin.test.mjs`, `scripts/macos/package-plugin.mjs`, `scripts/macos/package-plugin.test.mjs` | 우선 재사용 | 기존 inventory 의미 보존. 변경 필요 시 사유·판 영향 명시 |
| `.github/actions/smoke-database/action.yml`, `scripts/rehearsals/prepare-codex-macos-database.mjs`, `scripts/rehearsals/inspect-codex-macos.mjs` | 재사용 경계 | 소유 DB·복구 조건 보존. Intel/Windows 추가 준비는 host 결정 뒤 구체화 |
| `docs/architecture/verification.md`, `docs/architecture/server.md`, `AGENTS.md` | 구현과 함께 갱신 | coverage·로그·승격 조회 및 trigger 경로·필요한 내부 import 등록 |
| `docs/proposals/completed/2026-11-17-ci-os-coverage.md`, `docs/proposals/completed/2026-11-12-claude-verifier-skill-namespace.md`, `docs/proposals/active/template-release-acceptance-follow-ups.md` | 조정 필요 시만 | 소유권·선행 조건 변경 근거가 있을 때 갱신. 완료/과거 보고서는 다시 쓰지 않음 |

새 실제 인수 보고서의 경로는 실행 후보·날짜가 정해진 뒤 `docs/test-reports/README.md`에 맞춰 고정한다. 지금 빈 보고서를 만들거나 예상 성공을 기록하지 않는다.

주요 symbol의 소유권과 소비 경로:

| symbol/계약 | 현재 소유자 | 후속 소비·검증 |
| --- | --- | --- |
| `BACKLOG_ITEM`, `FIXTURE_FILES`, `caseResults`, `SMOKE_SCENARIOS` | `pipeline-smoke-steps.mjs`의 기존 export | 각 리허설의 직접 import 유지. 기대값을 모델 구현으로 재생성하지 않음. 같은 파일의 시험 및 VFY-DCP-05 |
| `Run`, `seedTemplates`, `bootstrapSmokeTemplates`, fixture user/server 함수 | `rehearse-client-init-smoke.ts`의 기존 export | Codex entrypoint에서 재사용. `bootstrapSmokeTemplates`의 서버 내부 참조는 현재 소유 파일에 유지. 추출 시 실제 새 경로를 server 참조 목록에 등록 |
| `AppServer`, `childEnvironment` | `plugin/runtime/codex-thread.mjs` | 제품 export·allowlist 보존. Windows P2는 설치된 runtime의 native 동작으로 검증하며 시험 편의 export 추가 금지 |
| `managedSnapshot`, `gradeInitEvaluation`, `evaluateCodexInit` | `codex-init-eval.mjs` | Mac eval 경계 유지. Windows native 실행기로 취급하지 않음 |
| `environmentFields`, `clientVersion`, `summarize`, `summarizePipeline`, `summarizeEval`, `gateRow` | 위 inventory의 환경·client-init·pipeline·eval·gate 모듈 | client별 의미를 보존한 정규화 결과를 새 계약과 기록기에 연결. 과거 reader 회귀와 실패가 PASS로 바뀌지 않는 사례 검증 |
| `targetConfiguration`, `safeResult` | private `scripts/run-codex-ci.mjs` | 검토한 public checkout의 공통 순수 계약을 사용하고 private run provenance는 trusted 수집 경계에서 확인. main branch의 가변 모듈을 원격 import하지 않음 |

제품 `src/`, schema, 출하 `plugin/` 동작·권한·manifest 판 변경은 기본 범위 밖이다. 결함 수정이 필요하면 별도 write set과 회귀 검증, plugin version 계약을 추가한다. 새 직접 의존성, 개인 인증/설정, 운영 template/DB와 기존 테스트의 일괄 재배치는 허용하지 않는다.

## Execution Plan

### Phase DCP0: 실행 범위와 선행 조건 확정

- status: In progress. 기본 네 조합과 Intel 후속 순서를 확정했다. Windows runner 부재, 예산·필수 승격 전환·기존 template 선행 조건은 남아 있다.
- satisfies: REQ-DCP-001, REQ-DCP-008, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-004
- verifies: REQ-DCP-001, REQ-DCP-008, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- entry/exit: 구현 지시 → 필수 조합·private 출처·기존 작업 소유권·사전 실행 조건이 문서화됨. 이미 확인한 private revision을 재사용하되 변경 여부를 확인한다. 기본 네 조합/기존 채널과 Intel 후속 순서는 확정했다. Windows host·계정 예산·승격 적용 시점·30분 운영 규칙과 private job의 관계가 결정되지 않으면 이 단계가 완료된 것이 아니다. 이 단계의 문서 검토는 실제 CI 통과 증거가 아니다.
- blockers: BLK-DCP-01, BLK-DCP-03을 조사하며 BLK-DCP-02, BLK-DCP-04는 다음 단계의 선행 조건으로 남긴다.

#### TASK-DCP0-01: 지원 조합과 외부 실행 계약 확인

- satisfies: REQ-DCP-001, REQ-DCP-008, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-004
- destination: 이 문서의 지원 표·Blockers·실행 정책, 확인된 private workflow와 기존 승인 작업의 참조.
- verification destination: VFY-DCP-01의 source/run/권한 inventory와 위험 검토.
- stop condition: 접근·지원 결정·기존 승인 범위를 추정해야 하면 의존 작업을 시작하지 않는다.

### Phase DCP1: 공통 판정과 증거 계약

- status: In progress. 명시적 expected 집합을 받는 순수 schema/판정과 기존 summary 결함 수정은 구현했다. 실제 실행별 adapter·trusted 수집 연결까지 끝난 것은 아니다.
- satisfies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-013
- preserves: INV-DCP-001, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-003, CON-DCP-004
- verifies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-013
- entry/exit: 확정한 입력 계약 → 누락·실패·identity 오염을 거부하는 순수 시험과 기존 row 호환 통과. 모델 호출 없음.

#### TASK-DCP1-01: 필수 집합·identity·요약 판정 구현

- satisfies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-013
- preserves: INV-DCP-001, INV-DCP-003
- governed-by: CON-DCP-003, CON-DCP-004
- destination: 제안 `client-ci-contract.mjs`와 시험, 기존 환경/요약 모듈. public/private 입력 adapter가 server/plugin/workflow SHA와 phase별 identity를 구분하고 명시적 expected 집합으로 판정한다. 실행 출처와 record 출처를 분리하고 같은 실행의 동일 재기록만 한 번으로 집계한다. `safeResult`의 성공 배열만 입력하는 우회 경로는 두지 않는다.
- verification destination: VFY-DCP-02; `node --test scripts/rehearsals/client-ci-contract.test.mjs`는 파일 생성 후 실행할 제안 명령.
- stop condition: 정보 손실 없이 기존 요약을 읽을 수 없으면 schema와 consumer를 함께 수정한다. fake PASS/기본값으로 넘기지 않는다.

### Phase DCP2: 실제 배포물 설치·update와 native 사전 검증

- status: Proposed; 해당 조합의 BLK-DCP-01, BLK-DCP-03 및 BLK-DCP-02의 runner·인증 제공·소유권·실험 범위가 정해진 뒤 제한된 설치/실행 실험에 진입한다. 이 실험의 성공이 BLK-DCP-02를 해소한다.
- satisfies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-008, REQ-DCP-012
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-003
- verifies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-008, REQ-DCP-012
- entry/exit: 신뢰 runner·후보/이전 artifact·template 고정 → 필수 설치 조합의 신규/update 결과와 최소 native 인증·실행·종료 증거. 최소 모델 실험과 init 모델 없음 판정을 구분한다.

#### TASK-DCP2-01: Codex Windows 경로와 설치 검증 연결

- satisfies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-008, REQ-DCP-012
- preserves: INV-DCP-001, INV-DCP-002
- governed-by: CON-DCP-002, CON-DCP-003, CON-DCP-004
- destination: 기존 init/macOS 리허설, 제안 Windows 리허설, 기존 package 생성기와 private `run-codex-ci.mjs`/`codex-ci.yml` 준비 단계. 빈 cache 후보 설치와 이전 설치의 update를 분리하고 모델 없는 init phase 선택을 연결한다. source/bundle 채널별 예상 payload와 적용할 runtime·hooks·verifier 조건을 분리한다. Windows의 홈·환경·프로세스·browser 준비는 Mac eval 코드를 복사하지 않고 해당 host 증거로 확정한다.
- verification destination: VFY-DCP-03, VFY-DCP-04. 실제 실행 명령은 runner·artifact 확정 뒤 해당 CLI와 workflow 입력에 맞춰 이 문서에 고정한다.
- stop condition: 설치 loader를 생략하거나 현재 개발 PC의 사용자 설정을 바꿔야 하면 중단한다. credential 유지/폐기와 안전한 종료를 증명하지 못하면 P3으로 가지 않는다.

### Phase DCP3: 실제 모델과 lifecycle 동등화

- status: Proposed; P2 설치·native preflight 완료 후 진행. 기존 Claude macOS leg 작업의 선행 조건 보존.
- satisfies: REQ-DCP-005, REQ-DCP-006, REQ-DCP-007, REQ-DCP-008, REQ-DCP-012
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-003, CON-DCP-004
- verifies: REQ-DCP-005, REQ-DCP-006, REQ-DCP-007, REQ-DCP-008, REQ-DCP-012
- entry/exit: 동일 후보의 실제 설치 증거 → 공통 pipeline·각 client eval·승인/중지/재개/정리의 필수 조합 통과. 기존 Codex QA/scout 검증도 보존.

#### TASK-DCP3-01: 실제 실행과 공통 pipeline 판정 연결

- satisfies: REQ-DCP-005, REQ-DCP-008, REQ-DCP-012
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-002, CON-DCP-003, CON-DCP-004
- destination: 기존 Claude/Codex 리허설, Windows entrypoint, `pipeline-smoke-steps.mjs`와 시험, 기존 소유 작업의 macOS Claude leg.
- verification destination: VFY-DCP-04, VFY-DCP-05; 검토한 source/template SHA와 실제 package identity로 실행.
- stop condition: 역할 terminal 실패·독립 산출물 실패·검토되지 않은 진단을 green으로 숨기지 않는다. template 재작성·권한 완화로 시험을 통과시키지 않는다.

#### TASK-DCP3-02: init 모델 평가와 lifecycle 검증

- satisfies: REQ-DCP-006, REQ-DCP-007
- preserves: INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-002, CON-DCP-003, CON-DCP-004
- destination: 기존 Mac `codex-init-eval.mjs`, client별 lifecycle 리허설과 시험. Claude `agent-eval.yml`/`agent-eval-summary.mjs`와 시험에서 기존 대조군·gate 사례는 유지하면서 shell/assistant 원문 공개 출력을 허용 필드 요약으로 바꾼다. Windows 모델 eval 추가는 이 단계의 기본 요구가 아니다.
- verification destination: VFY-DCP-06, VFY-DCP-07; 실제 상태 checkpoint로 취소/재개 시점을 잡는다.
- stop condition: 실제 쓰기 대조군이 실패하면 평가 결과를 채택하지 않는다. 소유 process/lock 정리가 미확인이면 자원 정리 성공으로 보고하지 않는다.

### Phase DCP4: workflow·기록·배포 조건 연결과 인수

- status: Proposed; BLK-DCP-04 해소 및 필수 조합의 P2/P3 증거 필요.
- satisfies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-003, CON-DCP-004
- verifies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- entry/exit: private 출처/권한 계약과 설치·모델 증거 → 필수 결과 누락/검토 미해결을 거부하는 기록·승격 검사, 정확한 후보의 통과 기록, 비용/시간 및 남은 범위 보고.

#### TASK-DCP4-01: public/private 증거 수집과 배포 판단 연결

- satisfies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-013
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-002, CON-DCP-003, CON-DCP-004
- destination: `gate-record.mjs`·허용 필드 필터·gate-record action·coverage 검사와 시험, private `run-codex-ci.mjs`의 결과와 연결할 trusted consumer, verification 및 AGENTS 조회 절. consumer의 정확한 실행 주체·파일·검토 기록 위치는 BLK-DCP-04 해소 시 이 inventory에 고정해야 한다. public coverage 파서에 self-hosted labels를 무검증으로 허용하지 않는다.
- verification destination: VFY-DCP-02, VFY-DCP-08. 공개/비공개 기록의 스키마·출처·필수 집합을 함께 대조. record 재실행에서도 원래 leg 실행·결과·검토 연결이 유지되는지 확인.
- stop condition: 임의 JSON·다른 후보·접근 실패를 승인 가능한 증거로 취급해야 한다면 중단한다. 기존 실패 이력과 gate issue는 보존한다.

#### TASK-DCP4-02: 실행 정책 적용과 최종 인수

- satisfies: REQ-DCP-010, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- preserves: INV-DCP-001, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-003, CON-DCP-004
- destination: 확인된 workflows와 `ci-target.json`, architecture coverage 표, AGENTS 승격 trigger 경로와 `pipeline-smoke-steps.test.mjs`, 관련 제안의 상태 조정, 실제 결과 보고서. P0의 결정 전 정기 실행 빈도나 Codex 필수 gate 적용을 임의로 활성화하지 않는다.
- verification destination: VFY-DCP-08, VFY-DCP-09. 첫 동일 후보의 필수 집합 전부를 검증하고 허용된 재사용/재시도 사유를 남긴다.
- stop condition: 모든 필수 조합이 증거와 연결되지 않으면 전체 동등화 완료를 선언하지 않는다. 구현 인수 완료와 실제 main 승격은 별개다.

## Verification Plan

아래 verifier의 전체 native 인수는 **Planned**다. VFY-DCP-02의 순수 계약과 summary 회귀 등 실행한 부분은 Implementation Progress에 따로 기록한다. 부분 검증을 verifier 전체 PASS로 확대하지 않는다.

### VFY-DCP-01: 지원·출처·운영 계약 검토

- verifies: REQ-DCP-001, REQ-DCP-008, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- category/destination: contract; 현재 architecture, active 소유 작업, 확인된 private workflow와 runner inventory.
- expected: Windows/macOS 양 client, architecture/channel, phase/scenario 필수 집합, server/plugin/workflow/template 고정, 계정/홈 소유권, 예산, 시간 정책, 기록 출처, 변경 선택 규칙과 승격 적용 시점이 구체적으로 결정됨. 읽은 private revision과 현재 revision의 차이를 대조함. 불명확한 사항은 blocker로 남고 실행 승인을 대신하지 않음.

### VFY-DCP-02: identity·누락·오염과 기존 기록 호환

- verifies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-013
- category/destination: unit/contract; 제안 `client-ci-contract.test.mjs`, 기존 `gate-environment.test.mjs`, `gate-record.test.mjs`, summary 시험.
- expected: 실패한 raw Codex 요약, 인증 실패, package hash 변경, 다른 template/server/plugin/workflow SHA, architecture 누락, duplicate/missing leg, cancelled/skip/running, extra 필드의 secret, 미해결 review가 배포 PASS가 되지 않음. `codex-cli 0.167.1`이 누락되지 않으며 auth summary의 `sourceCommit`을 제품 SHA로 오인하지 않음. 성공 phase 배열이 완성됐어도 전체 job·fixture/DB 정리가 실패하면 거부함. `agent-eval`의 일부 case 선택 성공을 전체 gate eval 성공으로 세지 않음. 알려진 phase의 비해당 자원은 허용하지만 필요한 identity/cleanup을 비해당으로 위장하면 거부함. 기존 Claude row는 기존 의미로 읽고 과거 identity 부족 row를 새 배포 증거로 승격하지 않음.
- retry cases: gate 실행 attempt 1의 결과를 record attempt 2가 게시해도 실행 identity와 사용량은 그대로이며, 동일 결과 재게시로 필수 leg가 늘거나 실패하지 않음. 같은 출처의 충돌 결과·출처 없는 attempt 치환은 거부함. 부분 재실행으로 leg별 실행 attempt가 다른 경우 실제 출처를 보존함. 이전 green 뒤 새 실패/진단이 있거나 검토가 다른 결과에 속하면 자동 통과하지 않음. 허용된 모델 재시도는 원래 실패·사유·선택한 결과를 함께 유지함.

### VFY-DCP-03: 실제 신규 설치와 update

- verifies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-008
- category/destination: native integration; 승인된 각 runner의 실제 loader·설치 cache·기존 package 생성기와 init 리허설.
- expected: 빈 cache에서 후보만 설치한 신규 설치와 이전 연결에서 update를 각각 확인함. 실제 cache의 OS별 inventory/source/runtime/verifier·hooks 일치, 사용자 수정·양 client 설정 보존, template pin/cutover 준수, dry-run 무변경, bundle helper의 global Node 비의존. init 전용 workflow의 auth smoke까지 포함해 모델 호출 0. 이전 artifact 부재/손상, version이 같은 다른 payload, 누락/추가 파일·변조·Mac 실행 mode 손상은 거부함. manifest 자체는 inventory hash 대상 밖임을 유지하고 이전 source 재생성 fixture와 실제 배포 artifact 인수를 구분함.
- channel boundary: Claude source 설치는 검토한 commit의 source payload와 실제 cache를 대조하고 PATH Node 예외를 유지함. 생성 runtime·bundle hash·Codex용 생성 verifier 사본을 필수로 요구하지 않음. `evals/`·`.test.mjs` 제외는 현재 OS bundle 생성기의 계약이므로 source loader에도 같은 필터가 적용됐다고 가정하지 않음. 채널별 예상 payload 밖의 누락·변조는 거부함.
- private input boundary: 신뢰된 runner의 별도 template checkout과 설치 payload를 구별함. 기존 `plugin/templates` checkout이 있어도 private 원본은 설치 cache에 섞이지 않으며, bundle에는 생성기의 template·eval·test-only 제외 규칙이 적용됨. 공개 로그·기록·artifact에 private 본문이 유출되지 않음.

### VFY-DCP-04: native 인증·최소 실행·자원 정리

- verifies: REQ-DCP-005, REQ-DCP-007, REQ-DCP-008, REQ-DCP-012
- category/destination: native security/integration; 설치된 Codex helper·실제 App Server·역할 bridge와 승인된 CI 전용 인증 홈.
- expected: 역할 격리와 인증 경계를 유지한 최소 실행·종료·다음 실행 성공, 인증 부재/만료 시 모델 의존 mutation 없이 실패, 소유 process/lock 정리. Windows 실제 역할의 effective home/profile을 확인하고 인증 파일은 합성 deny canary로 읽기 거부를 검증함. `CODEX_HOME`만 바꾸거나 개인 auth cache를 복사한 성공은 거부함. 개인 인증이나 production 환경을 사용하지 않으며 시간/제공되는 usage와 계정 점유를 기록함.

### VFY-DCP-05: 공통 pipeline과 추가 역할

- verifies: REQ-DCP-002, REQ-DCP-005, REQ-DCP-012
- category/destination: 실제 모델 통합; 기존 `pipeline-smoke-steps.mjs`의 독립 사례, client별 native pipeline 리허설.
- expected: `slug` 공통 baseline의 독립 결과, 구성한 필수 역할의 accepted terminal outcome, 계획/보고서/구현 commit 대응, native 검증 명령 성공, runner 정리. 기존 `truncate` 회귀와 Codex QA/scout 범위 보존. 조건이 다른 결과를 역할 개수나 총 비용만으로 동등 판정하지 않음.

### VFY-DCP-06: init 스킬 모델 행동

- verifies: REQ-DCP-006, REQ-DCP-008, REQ-DCP-009
- category/destination: eval; 기존 Claude 대조군/사례와 `codex-init-eval.mjs`·시험, client별 허용된 trusted host.
- expected: 쓰기 대조군 1회와 기존 필수 사례별 3회 판정 유지. 승인 전 쓰기 금지 등 client별 계약을 실제 파일·mtime·도구/완료 이벤트로 판단. 테스트가 코드를 검출하는 양성/음성 대조 유지. public stdout/stderr/job summary에 합성 민감 문자열을 포함한 shell/assistant 원문이 나오지 않음. 원문 진단은 REQ-DCP-009의 비공개 경로에서만 제공하고 architecture의 이전 공개 로그 설명도 함께 변경함.

### VFY-DCP-07: 승인 대기·중지·재개·취소

- verifies: REQ-DCP-007, REQ-DCP-009, REQ-DCP-012
- category/destination: recovery/native integration; client별 lifecycle 리허설과 관련 unit 시험.
- expected: gate 대기에서 금지된 진행 0, owner service 승인 후 진행, 관찰된 실행 중 중지, 소유 자원 정리, 기존 실행 재개와 중복 accepted 결과 부재. 기존 Mac script는 완료 후 background stop과 owner stop을 수행하지만 실행 중 process stop→재개를 증명하지 않으므로 별도 checkpoint 사례가 필요함. 초기화 실패/진행 중 취소/browser 또는 server 종료 미확인/DB cleanup 실패는 성공 불가. 오류·signal·timeout 경로에서 자기 자원만 정리하고 소유권 미확인 시 fixture를 보존함. 명시적 idle 인수는 실제 관측 기간과 gap/시계 검사를 유지.

### VFY-DCP-08: 커버리지·실행 정책·증거 출처

- verifies: REQ-DCP-001, REQ-DCP-009, REQ-DCP-010, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- category/destination: contract/workflow integration; `verify-ci-coverage.test.mjs`, `gate-record.test.mjs`, 확인된 public/private workflows와 실제 기록.
- expected: leg 추가 후 record 누락, 출력 충돌, 한 OS/client 삭제, 지원되지 않는 workflow 모양, private 접근 실패, 출처 불일치가 검출됨. private self-hosted array를 기존 `readWorkflow`에 넣어 통과한 것으로 처리하지 않음. 각 추가/변경 파일을 단독 변경한 선택 사례로 필요한 gate를 검증하고, 특히 Mac/Windows Codex 리허설·init eval·공통 계약·package 생성기·정규화/기록 변경 누락을 검출함. private workflow/target revision만 바뀐 경우도 다시 대조함. 기록만 재실행하면 모델 호출 0. 다른 저장소의 같은 인증 홈 사용도 충돌하지 않음. 기존 게이트/스케줄/Claude 양 OS 정책 보존.
- retry destination: gate 성공 뒤 record 게시 실패·재실행 및 이미 게시한 행의 재게시를 실제 job 출력/기록 경로에서 확인함. trusted consumer가 원래 실행과 재기록을 연결하고 사용량·필수 leg를 중복 집계하지 않으며, gate/cleanup 실패를 record 성공으로 덮지 않음. 실행 identity와 검토 연결을 확인하지 못하면 미충족으로 남김.

### VFY-DCP-09: 변경 범위 회귀와 최종 후보

- verifies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-005, REQ-DCP-006, REQ-DCP-007, REQ-DCP-008, REQ-DCP-009, REQ-DCP-010, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- category/destination: architecture/static/build 및 실제 CI; 아래 기존 명령과 필수 후보별 VFY-DCP-03부터 VFY-DCP-08까지의 기록을 조합한다.
- expected: 변경 관련 회귀와 필수 실제 결과가 같은 후보에 연결되고 미해결 review가 없음. 정적 검사만으로 이 verifier 전체를 PASS로 기록하지 않음. 비용·시간·실패/skip·보관/정리 상태를 인수 보고서에 남김.

후속 코드 변경 시 기존 검증 명령:

```sh
npm run verify:fsd
npm run verify:server
npm run test:architecture
npm run docs:check
npm run verify:ci-coverage
npm run db:generate
npm run check
npm test
npm run build
```

`npm run check`는 lint·type·`test:scripts`를 포함한다. 서버 fixture·동작을 바꾸면 기존 `test:server` 및 안전한 격리 DB의 `test:server:integration`을 추가한다. 새 시험은 기존 `scripts/**/*.test.mjs`/`.test.ts` 탐색에 포함됐는지 확인한다. DB 준비·native 설치·모델 명령은 신뢰 runner와 안전 조건을 확정한 뒤 실행한다.

## Safety Analysis

- 제품 라우팅·UI·public 자산·DB schema 변경은 없다. CI는 product API의 소비자이며 테스트 편의를 위한 서버 공개 API 확대를 하지 않는다.
- 실제 리허설은 runner 홈, 설치 cache, 임시 DB, process tree를 바꾸므로 사용 중인 개발 PC에서 실행하지 않는다. 작업별 새 private evidence 경로와 loopback `stagekeeper_test_*` DB를 사용한다.
- 신뢰된 runner에 unreviewed PR 코드를 실행시키지 않는다. 비공개 template은 검토한 SHA의 별도 checkout으로 격리된 runner에서 사용한다. 현재 Claude workflow의 `plugin/templates`는 이 private 입력 경로이며 공개 저장소에 커밋하거나 설치 payload로 출하하는 경로가 아니다. 인증과 raw 모델 출력은 source checkout에 쓰지 않고, private template 본문을 포함한 이 자료를 공개 로그·artifact·issue에 넣지 않는다. 공개 요약의 enum/숫자/hash 필터를 유지한다.
- package 생성/재사용은 sourceRevision·inventory·runtime provenance를 확인한다. 같은 이름의 artifact 또는 manifest의 자기 주장만으로 인증하지 않는다.
- 실제 모델 자동화가 제품의 승인/격리 계약을 바꾸지 않는다. CI 계정 자격과 역할이 읽을 수 있는 경로를 구별한다. 복구 과정에서 전체 client process 종료나 개인 설정 삭제를 하지 않는다.
- private 결과 연결 실패와 모델/제품 실패를 구분한다. 원문 접근 권한 부재를 green으로 바꾸지 않으며, 기록 실패만 복구할 때는 모델을 다시 실행하지 않는다.

## Risks and Rollback

남은 blocker는 추가 native runner의 인증·권한·정리 증거, 추가 채널·승격 적용 시점·예산 결정, template/이전 artifact 기준, trusted 증거 consumer와 검토 기록이다. 기본 네 조합과 Intel 후속 순서·private workflow 소스 위치·고정 revision은 확인했다. 모델 변동과 runner 지연은 비차단 운영 위험이며 VFY-DCP-04/05/09의 실행 시간·사용량·실패 원인으로 관찰한다. 개발 중 모델 실패를 timeout 확대·skip·계정 전환으로 숨기지 않는다.

구현은 공통 순수 계약 → 설치/native 사전 검증 → 모델/lifecycle → 정식 gate 연결 순서로 나눈다. 새 leg는 기능 브랜치에서 확인한 뒤 기존 작업의 승인 범위에 맞춰 병합하고, `dev`의 정확한 후보에서 기록과 판정을 검증한다. 이 과정에서 기존 게이트를 제거하지 않는다.

되돌릴 때는 해당 변경의 workflow·consumer·schema·coverage 표를 함께 되돌리고 추가 스케줄을 중지한다. 실패 기록과 과거 결과는 보존한다. 새 필수 검증을 사용할 수 없어진 후보는 동등화 미충족 상태로 두며, 이전의 약한 조건으로 조용히 배포하지 않는다. 출하 plugin을 수정했다면 이전 버전 번호 재사용 대신 기존 plugin version/배포 절차를 따른다. 운영 DB와 template 원본을 복원 대상으로 삼지 않는다.

## Approval and Readiness

front matter는 구현 승인 기록의 단일 기준이다. 현재는 실제 구현 요청에 따른 코드 작업을 진행하며, 구현 승인과 native 인수 완료를 구분한다.

- 현재 문서 산출: 확인한 불일치를 수정한 검토본. downstream blocker를 문서에 기록한 것만으로 `reconciling-proposals-with-codebase`의 clean pass를 주장하지 않는다.
- P0: 기본 네 조합부터 진행하는 순서는 확정했다. 추가 운영 조건은 미확인으로 남긴다.
- 전체 구현/배포 인수: `BLOCKED`. BLK-DCP-01부터 BLK-DCP-04까지의 해당 선행 조건과 단계별 verifier가 필요하다. 상세 명세와 문서 검사 통과는 이를 해제하지 않는다.
- 구현 요청을 받으면 승인된 단계/범위만 수행하고, 범위 밖 단계·private workflow 변경·실제 모델 사용·배포를 자동으로 시작하지 않는다. 이미 승인된 다른 작업의 같은 승인을 다시 요구하지 않고 실제 소유 범위를 확인한다.

## Verification Results

### Init evidence follow-up — 2026-11-16

- 공개 #342와 private #9가 각각 `dev`에 병합된 것을 확인했다. 이번 public 기준은 `e8c212a98335a5e4fb12df915c861a1e2581c43b`, private 기준은 `d5f1ea4209d5a205ef09b02d88d50fee5cc375db`다. 열린 PR은 없었다.
- private 등록 runner 조회는 0대였고 사용자가 지금은 Mac을 사용할 수 없다고 답했다. 실제 init dispatch·설치·모델 실행을 하지 않고 코드·로컬 검증을 진행한다.
- `ci-target.json`의 제품 후보를 위 public SHA, template을 검토된 R2 원본 `99245acd018d26a7c1238f34323951159c41d954`로 고정한다. 이전 제품 source `f882bb96450580d51dc63f142d19531a67185132`는 유지한다. 두 설치 fixture는 같은 R2를 사용하며 과거 R1 설치의 전환이나 운영 activation 인수가 아니다.
- private init wrapper가 검증한 bundle identity·이전 설치물·phase 결과·cleanup을 고정 public contract로 정규화한다. 허용 필드 `init-evidence.json` 하나만 private artifact에 30일 보관한다. raw summary·로그·template·credential은 올리지 않는다.
- private 읽기 전용 collector는 GitHub run/job/artifact 출처와 원격 `ci-target.json`을 대조한다. 재조회 중 attempt/artifact가 바뀌거나 출처·필수 leg·identity가 맞지 않으면 거부한다. attempt 2 이상은 이 단계에서 받지 않는다. 실제 기록 수집은 Mac 실행 후 가능하다.
- 단일 run의 두 init scenario만 공통 판정기에 연결했다. 기존 리허설은 workspace를 보관하고 update의 실행 pin 보존을 관찰하지 않으므로 이를 각각 `preserved`/`fail`로 남긴다. 성공 workflow만으로 공통 PASS를 만들지 않는다. 모든 client/OS·다른 실행의 실패·review/retry를 합치는 후보 전체 consumer는 후속이며 BLK-DCP-04 전체가 해소된 것은 아니다.
- `ci-os-coverage`와 template 후속의 소유권은 유지한다. Claude namespace 제안이 completed로 이동한 것은 Core 정리이며 R2 운영 활성화·Mac E2E 후속이 남았다는 현재 기록을 확인했다.
- 로컬 검증: private phase/cache 시험과 새로운 producer/collector 시험 16개 통과. 실제 pinned public contract와 합성 설치물·GitHub metadata를 사용하며, 실제 Mac/인증/원격 artifact 수집 통과가 아니다. Git checkout의 LF/CRLF 차이는 허용하지만 실제 source 수정은 Git 상태에서 숨겨도 거부한다. 공개 contract 기존 시험 16개, 문서·CI coverage·FSD·server 경계 검사도 통과했다.
- 후속 코드는 [private PR #10](https://github.com/Sangeok/stagekeeper-codex-ci/pull/10), commit `b87fa2d58c9d8c94c90c74827861195b56c19d27`에 보존했다. [Linux check](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/43861429531)에서 전체 23개 시험이 통과했고 실패·skip은 0개다. Mac native init과 모델 실행은 이 검사에 포함되지 않는다.

### Implementation Progress — 2026-11-16

- **확정한 순서:** Windows x64·macOS arm64 × Claude·Codex 네 조합부터 진행한다. Intel의 기존 runtime 검사는 유지한다. Windows 전용 runner는 없으며 사용자가 준비 전 코드·로컬 검증 진행을 선택했다. BLK-DCP-01의 이 두 항목은 결정됐지만 승격 적용 시점·운영 예산과 BLK-DCP-02의 native 인증 증거는 남는다.
- **P1 구현:** `client-ci-contract.mjs`/시험을 추가했다. phase별 identity·필수 집합·허용 필드·전체 job 결론·cleanup·eval 완전성·역할/commit 연결·review·실행/기록 attempt·동일 재게시·외부 원인 재시도를 검증한다. expected와 독립 executions 입력을 요구한다. trusted collector와 실제 client별 schema adapter는 아직 연결하지 않았으므로 P1/P4 전체 완료가 아니다.
- **기존 요약기:** Codex 버전 형식을 별도로 읽는다. init/pipeline의 명시적 실패·skip·미완료가 failure 문자열 부재 때문에 pass로 바뀌지 않게 했다. 과거 schema 1 gate row는 기존 의미로 읽으며, identity 부족을 schema 2 증거로 보정하지 않는다.
- **Claude eval:** 대조군과 알려진 사례별 grader를 검증한다. 결과 없음·grader 실패는 exit 0이어도 실패한다. 전체 3개 사례 × 3회와 대조군 통과를 `gateComplete`로 구분하고 부분 eval은 기록 finding으로 남긴다. 모델 CLI 원문·shell log·assistant 본문의 공개 출력을 제거했으며 허용 필드만 요약하고 임시 원본을 정리한다. 실제 모델 eval 재실행은 하지 않았다.
- **private Mac 코드:** `Sangeok/stagekeeper-codex-ci`의 `b086ec055f8de32760b93668480b7747de952527`에서 `harness/dual-client-ci-parity`를 만들었다. 로컬 checkout은 `C:/Users/hamso/AppData/Local/Temp/stagekeeper-codex-ci-parity`다. workflow/launcher의 기본 phase는 init이며 auth model turn·eval·pipeline을 호출하지 않는다. 모델 phase에는 명시적 `--run-models`가 필요하다. 이전·후보 설치 cache 전체 inventory/bytes/mode/manifest/runtime을 대조하고, 후보만 설치하는 별도 빈 홈을 사용한다. fixture cleanup 뒤에만 phase 결과를 추가하고 final runner/DB cleanup과 필수 phase 집합으로 wrapper 결과를 판정한다. wrapper schema 2는 public 증거 schema와 다른 envelope이며 자동 연결하지 않는다. `ci-target.json`의 기존 SHA는 갱신하지 않았다.
- **변경 선택:** 새 공통 계약과 기존 Codex 리허설/eval·패키징·요약/기록을 init PR paths 및 AGENTS pipeline 승격 경로에 포함했다. 공개 job/leg 수는 유지한다. Windows workflow 추가와 private target 변경을 수집하는 controller는 후속이다.
- **남은 실행:** Windows native entrypoint/runner·인증, macOS Claude pipeline의 R2 선행 조건, lifecycle 실제 중지/재개, source 설치의 실제 cache 대조, trusted private consumer와 최종 동일 후보 인수는 완료하지 않았다. 기본 네 조합의 전체 CI가 같아졌다고 선언하지 않는다.

| 이번 코드 검증 | 결과 | 해석 |
| --- | --- | --- |
| `node --test`에 `client-ci-contract`, `agent-eval-summary`, `client-init-smoke-steps`, `gate-environment`, `gate-record`, `pipeline-smoke-steps`의 여섯 `.test.mjs` 전달 | PASS, 66 tests | 실제 모델 없는 순수 정책·summary·workflow 연결 회귀. 새로운 계약의 모든 실행 adapter/collector 구현을 뜻하지 않음 |
| private `node --check scripts/run-codex-ci.mjs`, `node --check scripts/start-runner.mjs`, `node --test scripts/run-codex-ci.test.mjs` | PASS, 7 tests | phase 선택·완전성·실패 정리·synthetic 설치 cache. Windows에서 POSIX mode 변경 하위 사례는 실행하지 않음 |
| `npm run verify:fsd`, `npm run verify:server`, `npm run lint`, `tsc --noEmit` | PASS | 제품/서버 코드나 경계 예외 변경 없음 |
| `npm run db:generate`, `npm run build` | PASS | Prisma client 생성과 production build; DB migration/모델/배포 없음 |
| `npm run docs:check`, `npm run verify:ci-coverage`, strict traceability | PASS | 새 문서 포함 219 Markdown·1,095 links, 공개 12 jobs·10 rows, 13/13 REQ 연결 |
| `npm run check` | FAIL: 431 pass, 10 fail, 6 skip | 기존 cleanup의 Windows path/CLI 테스트 9건과 template target의 POSIX private-file mode 테스트 1건. 관련 네 원본/시험 파일은 HEAD blob과 일치. cleanup 9건은 HEAD 두 파일만 별도 Temp에 꺼내 동일 실패를 재현함 |
| `npm run test:architecture` | FAIL: 333 pass, 9 fail, 5 skip | 같은 기존 cleanup 9건. 이번 변경의 순수 시험은 별도 66개 결과로 확인 |
| `npm test` | 최초 644 pass, 10 fail, 29 skip; 실패 10건 재검증 PASS | 샌드박스에서 예약 작업/LPAC profile 생성·poller 관측 실패. 허용된 샌드박스 밖에서 해당 10개만 다시 실행해 모두 통과. 전체 명령을 재실행해 green을 얻었다고 기재하지 않음 |
| private `npm run check` | Windows에서 미완료 | 기존 auth 테스트의 POSIX mode 검사가 실패하고 음수 PID process-group timeout 사례가 종료되지 않아 중단. 잔여 소유 테스트 process가 없음을 조회함. 전체 private suite는 Linux/macOS에서 재검증 필요 |
| 실제 loader·native CI·모델·원격 기록·병합/배포 | Not executed | runner 및 운영 선행 조건·같은 후보 인수가 남아 있음 |

로컬 로그는 Temp의 `dcp-public-check.log`, `dcp-architecture.log`, `dcp-targeted-tests.log`, `dcp-product-tests.log`, `dcp-native-recheck.log`, `dcp-baseline-check.log`, `dcp-final-lint.log`, `dcp-build.log`에 보존했다. 실제 credentials나 모델 원문을 포함한 로그가 아니다.

아래 표는 **앞선 문서 검토 당시**의 이력이다. 현재 코드 검증은 작업 결과에 명령·범위·미실행을 별도로 기록한다.

이번 실행 근거는 문서와 소스의 대조이며 제품 인수 결과가 아니다. 초안 작성 시의 검사와 이번 재검토를 구분한다.

| 검사 | 상태 | 범위/결과 |
| --- | --- | --- |
| 보호 브랜치 확인·fetch·작업 상태·열린 PR 조회 | Executed | 기준 SHA 확인, 시작 dirty 없음, 열린 PR 없음, 별도 worktree 보존 |
| architecture·공개 workflows·리허설·package/gate 소스·active 제안 대조 | Executed | macOS Codex private CI 계약 확인, 기존 CI 소유 작업과 공통/OS/client 검증 경계 기록 |
| 설치된 `write-sdd-spec/scripts/validate_sdd_traceability.py --strict --format json`에 이 파일 전달 | Executed / PASS | 요구사항 13개 모두 Phase/Task 및 verifier 연결, 오류 0. 의미와 실제 실행 준비 상태는 별도로 검토 |
| `npm run docs:check` | Executed / PASS (초안) | 기존 tracked Markdown 218개, 상대 링크 1,066개, 보고서 59개. 새 untracked 문서는 기본 명령에 포함되지 않음 |
| 기존 `inspectDocs`에 `git ls-files`와 새 문서 경로를 전달 | Executed / PASS (초안) | 초안 포함 Markdown 219개, 상대 링크 1,094개, 문제 0. 재검토본도 같은 방식으로 별도 검사해야 함 |
| `npm run verify:ci-coverage` | Executed / PASS | 현행 12 jobs·10 rows. 새 native/model CI의 성공을 뜻하지 않음 |
| 의미 검토 | Executed | private 실제 설치 wrapper·phase·target pin 확인. SHA 의미 분리, 신규 설치/연결 구분, Windows auth/eval 이식 경계, cleanup, 원문 로그, 승격 선택과 판정 위치를 구현·검증 항목에 반영 |
| 문서 형식 검사 | Executed | `git diff --check`에서 tracked 변경 오류 없음. 새 파일의 `git diff --no-index --check -- NUL`은 차이 존재로 종료 코드 1, 공백 오류 출력 없음; 저장소의 LF→CRLF 변환 안내만 출력 |
| private workflow/runner launcher/실행기/요약 시험/최근 run metadata | Executed | 고정 revision `b086ec05…`와 run 42975322701 확인. 코드로 확인한 경로와 관측하지 않은 실제 상태를 구분 |
| 순수 함수 재현·새 파일 preflight | Executed | raw Codex failure를 Claude `summarize`에 넣으면 `pass`, 기존 Codex 버전 파싱은 누락, 새 판정/리허설 4경로는 승격 목록에 없음. 제안 4파일 없음·부모 존재 확인. 제품 파일 변경 없음 |
| 추가 재검토의 실행/기록 provenance·private 입력 경계 | Executed | gate-record action의 record attempt·반복 게시와 이전 gate 출력 재사용 계약을 대조함. 실행/기록 identity·동일 재게시·충돌·검토 귀속의 판정/검증을 보완하고, 기존 private template checkout과 공개·출하 금지를 구분함 |
| 설치 채널별 최종 산출물 대조 | Executed | source marketplace/`exportPlugin` 경로와 OS package 생성기를 대조함. bundle 전용 runtime·verifier 생성·파일 제외 조건을 Claude source 설치에 일괄 적용하지 않도록 산출물 표와 P2/VFY-DCP-03을 보완함 |
| 실제 credential·현재 runner 가용성·private 로컬 결과/검토 상태 | Not executed | 읽기 전용 소스/API 조회로 인증 성공·모델 동작·검토 완료를 대신하지 않음. BLK-DCP-01/02/04 유지 |
| 신규 설치·모델·DB·배포·CI dispatch | Not executed | 문서 요청 범위 밖; 향후 verifier의 Planned 상태 유지 |

재검토 판정은 `clean pass not completed`다. 초안에는 개선점이 있었으며 위에서 확인한 source/identity/실행·산출물·검증 연결을 보완했다. 전체 구현에 필요한 운영 결정과 native 증거는 아직 없으므로 “개선점 없음” 또는 “즉시 구현 가능”으로 바꾸지 않는다. 최종 저장본의 strict traceability·untracked 포함 링크·coverage 검사는 수정 후 다시 실행하고, 실제 결과와 수정 없는 마지막 대조 여부를 작업 응답에 남긴다.

## Completion Conditions

구현 완료는 확정한 각 필수 조합이 실제 설치·update·해당 init 평가·pipeline·lifecycle 기준을 통과하고, 정확한 후보 identity와 검토 상태가 배포 판단에 연결됐을 때다. Windows 또는 macOS 한쪽만 끝내고 전체 client 동등화를 선언하지 않는다. Intel/채널의 남은 범위는 명시적 지원 결정과 증거로 닫아야 한다.

보고서는 변경 파일, REQ별 verifier와 실제 command/run/attempt, source/template/package identity, 통과·실패·skip·미실행, 시간·제공되는 usage, private 증거 위치와 정리 상태, 남은 blocker를 포함한다. 실제 leg 실행과 재기록의 출처, 선택한 재시도·사유·검토를 구분해 중복 집계하지 않는다. 과거 PASS와 이번 실행을 구분한다. 구현·검증 완료 전에는 이 문서를 `completed/`로 이동하지 않는다.

## Review Checklist

- [x] 최신 소스와 architecture를 기준으로 기존 private Codex CI를 포함했다.
- [x] Windows·macOS 지원 결정과 architecture/channel 미확정을 구분했다.
- [x] 기존 승인된 OS coverage·template·gate 기록 작업의 소유권을 보존했다.
- [x] 실제 설치 loader, bundle identity, native 모델 경로와 제품 권한 경계를 명시했다.
- [x] 요구사항·단계·작업·검증 경로와 downstream blocker를 연결했다.
- [x] 계획한 실행을 실제 PASS로 기록하지 않았다.
- [x] strict traceability·새 파일 링크·coverage·diff 검사를 완료했다.
