---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-11-15"
approved-by: "user"
approved-at: "2026-11-17"
approval-scope: "기존 승인: 이 명세에 따른 실제 코드 수정과 로컬 검증, Windows x64·macOS arm64 × Claude·Codex 기본 4개 조합 우선 및 Intel runtime 검증 유지, private CI 대상 SHA 고정과 공통 증거 연결. 당시 Windows runner 부재 및 Mac 사용 불가에 따라 코드·로컬 검증만 진행했다. 원격 CI 실증 계획의 문서 반영·검토에 이어 2026-11-17 해당 문서 기반 실제 수정을 승인받았다. 확정한 순수 상태·관측 summary·판정 입력 계약의 구현과 합성 검증부터 수행한다. 미확정 provider/API·권한·한도·수집 운영에 의존하는 adapter와 실제 실행은 BLK-DCP-05를 유지한다. 실제 모델 실행, credential 등록·이동, 유료 자원 생성, 개인 설치 변경, 운영 template activation, 새 PR 병합·배포를 시작하지 않는다."
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

공통 판정·요약기, 공개 eval workflow와 private macOS init 증거 연결은 `dev`에 반영됐다. 전체 동등화와 원격 실행 환경은 아직 완성되지 않았다. 다음 순서는 이 문서의 원격 실증 실행 계약 확정·검토 → 확정 범위의 코드 구현과 합성 검증 → 인증 상태의 새 runner 재사용 실증 → 설치된 제품의 native 실행 → 전체 pipeline·기록 연결이다. 개인 Mac/Windows를 준비하거나 켜 두는 것을 완료의 전제조건으로 삼지 않는다. GitHub-hosted를 우선 검증하되, 인증 갱신과 권한 경계를 실제로 확인하기 전에는 최종 runner 구성이 검증됐다고 하지 않는다.

## Goal

- Windows에서 Claude와 Codex의 필수 검증 범위와 합격 기준을 동등하게 만든다.
- macOS에서도 같은 목표를 달성하며, 아키텍처와 설치 채널별 미검증 범위를 남긴다.
- 개인 Windows·Mac이 꺼져 있거나 없어도 원격에서 네 기본 조합의 CI를 실행하고 결과를 조회할 수 있게 한다. 최초 CI 전용 로그인과 폐기 후 재인증 절차는 무인 실행의 정상 경로와 구분한다.
- 테스트한 source·template·설치물과 배포 후보가 일치하는지 확인한다.
- 빠른 회귀 시험과 실제 모델 시험을 분리하고, 실행 시간·사용량·실패 원인을 측정한다.

`proposal-size: standard`, SDD 위험도는 `HIGH-RISK`다. 여러 workflow와 비공개 실행 환경, 인증정보, 실제 모델 사용량, 승격 조건을 다룬다. 제품 동작·권한은 유지하며 CI 도구를 변경한다.

## Current State

### 조사 기준과 근거의 한계

이 절의 첫 두 표는 구현 전 조사 기준이다. 이후 구현 상태는 Verification Results의 날짜별 이력과 아래 원격 실증 조사 기준을 따른다. 과거 표의 누락·SHA·runner 상태를 현재 실행 증거로 재사용하지 않는다.

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

### 원격 실증 조사 기준 — 2026-11-16

- **Observed:** public `dev`는 `d529ec04c792e1b6f61ead5a4e48c5e8a7265ebf`, private `dev`는 `559d9d2f586201d70beacc922fc4615da2f3a2cc`다. 공개 #349와 private #10의 결과가 포함된다. public 열린 PR은 없었다. 아래 private 경로는 이 revision의 파일이다.
- **Observed:** private `ci-target.json`은 제품 `e8c212a98335a5e4fb12df915c861a1e2581c43b`, 이전 제품 `f882bb96450580d51dc63f142d19531a67185132`, template `99245acd018d26a7c1238f34323951159c41d954`다. public 문서 HEAD와 실제 제품 시험 후보를 구분한다.
- **Unresolved:** 이번에는 실제 credential, 현재 runner 가용성, hosted 구독 실행·갱신, 비용을 조회하거나 실행하지 않았다. 이전의 runner 0대 기록은 당시 관찰이며 현재 인프라 조사 결과가 아니다.

| 현재 근거 | 관찰·계약 | 원격 전환에 필요한 변경 |
| --- | --- | --- |
| private `codex-ci.yml`, `codex-auth-smoke.yml`, `start-runner.mjs` | self-hosted macOS ARM64와 Mac에서의 수동 launcher, `codex-account-auth` 직렬화 | hosted 전용 실증 진입점 추가. 기존 실행의 사용 여부와 동일 로그인 충돌을 확인하고 자동 취소하지 않음 |
| private `codex-auth-smoke.mjs` | `assertContext`는 self-hosted Mac만 허용. `authMetadata`는 POSIX mode·전용 Pro Lite 로그인, `runClient`는 POSIX process group, CLI는 0.167.1 고정 | 기존 guard를 삭제하지 않고 Windows/hosted의 출처·ACL·환경·종료 계약을 별도로 검증 |
| private `executionArguments`, `clientEnvironment`, `streamResult` | 강제 ChatGPT 인증, 도구·hooks·apps 차단, 인증 경로 deny, 환경 allowlist와 예기치 않은 도구 이벤트 거부가 함께 동작 | 새 auth 실증도 실행 전 권한 제한을 보존. 응답 문자열 일치나 사후 이벤트 거부만으로 도구 실행을 방지했다고 하지 않음 |
| private `check.yml`, `package.json` | 현재 `check`는 Ubuntu 하나이며 전체 auth 시험에는 POSIX mode·음수 PID 정리가 포함됨 | Windows에서 전체 suite를 그대로 실행하지 않음. 제안 `native-host` job에서 양 OS용 별도 인증 없는 host 시험을 실행 |
| private `run-codex-ci.mjs`, `collect-init-evidence.mjs` | Darwin arm64 준비와 고정 job/runner labels. init 기본 실행은 모델 0, 수집기는 단일 Mac init run만 판정 | auth 실증을 init 증거로 입력하지 않음. 제품 hosted 전환 시 실행기와 수집기·거부 시험을 함께 변경 |
| [verification.md](../../architecture/verification.md) | Mac private 경로에 원문·인증 보관, 재실행 전 runner 시작 | 현행 운영 계약은 유지. 원격 운영 활성화 변경에서 인증 보관과 원문 검토 경로를 함께 갱신 |
| [OpenAI 계정 인증 CI 안내](https://learn.chatgpt.com/docs/auth/ci-cd-auth) | trusted private CI에서 CLI의 인증 갱신을 사용하며 ephemeral runner는 최신 `auth.json`을 복원·재보관. 같은 인증 사용은 직렬화 | 방식의 공식 근거이며 고정 CLI·이 프로젝트에서의 성공 증거는 아님. 일반 자동화의 API key 권고가 이 프로젝트의 구독 인증 대체를 허용하지 않음 |
| [GitHub-hosted runner](https://docs.github.com/en/actions/concepts/runners/github-hosted-runners), [runner 권한](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) | Windows·macOS VM 제공. Windows는 관리자 권한/UAC 비활성 | 실증 후보는 기존 공개 CI와 같은 `windows-2022` x64·`macos-15` arm64. 일반 사용자 권한의 제품 인수는 별도 관측 필요 |

외부 안내는 조회일의 계약이다. 고정 CLI의 플랫폼별 배포물·옵션·갱신 동작은 실증 전에 확인한다. 변경이 필요하면 버전 변경 근거와 재검증 범위를 기록한다. 현재 CLI가 최신 문서와 같다고 가정하지 않는다.

### 지원 범위와 작업 소유권

[verification.md](../../architecture/verification.md)의 지원 OS는 두 클라이언트 모두 Windows와 macOS다. Linux는 공통 검사의 실행 환경이며 제품 native 인수 대상은 아니다. 이번 문서가 기존 OS 지원 결정을 다시 미확정으로 만들지 않는다.

| 환경 | 현재 확보한 소스/문서 근거 | 이번 목표 또는 미확정 사항 |
| --- | --- | --- |
| Windows x64 / Claude | 공개 init·pipeline CI | 기존 경로 유지, 공통 판정과 필요한 lifecycle 사례 보완 |
| Windows x64 / Codex | 공통 runtime CI·과거 native 인수 | native bundle 신규/update·init·실제 모델 CI 경로 확정 및 추가 |
| macOS arm64 / Claude | 공개 init CI; pipeline은 공개 표에 미충족 | 기존 승인된 macOS pipeline 작업과 연결 |
| macOS arm64 / Codex | private workflow·설치 wrapper·고정 입력, 모델 없는 init 진입점과 단일 run 증거 연결 구현 | hosted 인증 상태 실증과 현재 후보의 실제 설치/모델 실행, 최종 후보 전체 증거 연결 보완 |
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

포함: 지원 조합·검증 수준 정의, 개인 기기 독립 원격 실행과 인증 상태 실증, 설치와 update, 실제 모델 init 평가·pipeline, 승인/중지/재개/정리, 증거 정규화, 실행 정책, 기존 coverage 검사와 승격 절차 연결. 이번 편집의 write set은 이 문서 하나다. 실행 환경·인증 저장소와 모델 실증의 구현/실행 상태는 Planned로 둔다.

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

WHEN 설치 또는 모델 실행을 시작할 때, 실행기는 검토된 source와 신뢰된 runner, 해당 단계에 필요한 인증·bundle·DB·private template·현재 역할 권한을 먼저 확인해야 한다. IF 인증 부재·정상 갱신으로 복구할 수 없는 인증 실패·필수 자원 부재·신뢰되지 않은 PR이면, THEN 의존 작업을 시작하지 않고 원인을 구분해 기록해야 한다. 갱신 가능한 access token 만료는 Codex의 정상 갱신 경로로 처리하며 REQ-DCP-015의 상태 보존을 적용한다. init 단계는 모델을 호출하지 않아야 한다.

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

### REQ-DCP-014: 개인 기기와 독립된 원격 실행

WHEN 신뢰된 실행 주체가 필수 조합의 CI를 요청할 때, 실행기는 개인 PC/Mac의 상시 실행·수동 runner 시작·개인 홈의 설치물에 의존하지 않고 해당 OS/architecture의 원격 환경에서 실행하고 결과를 보관해야 한다. IF 해당 환경 또는 권한 조건을 확보하지 못하면, THEN 그 조합을 미실행으로 남겨야 한다. auth-only 성공·관리자 권한 성공·한 OS의 성공을 일반 사용자 권한의 전체 제품 인수나 다른 조합의 성공으로 확대하지 않아야 한다.

### REQ-DCP-015: 인증 갱신 상태의 보존과 재실행

WHEN 구독 인증을 사용하는 일회성 runner가 실행될 때, 인증 상태 관리자는 최신 확정 상태를 배타적으로 복원하고 Codex가 갱신한 상태를 검증·저장한 뒤 새 runner의 다음 실행으로 연결해야 한다. IF 저장 실패·경합·강제 종료로 최신 상태를 확인할 수 없으면, THEN 다음 모델 실행을 차단하고 복구 필요 상태를 남겨야 한다. 최초 seed나 오래된 상태로 자동 되돌리거나 API key로 우회하지 않아야 한다. 실제 갱신이 관찰되지 않은 연속 실행은 갱신 검증 완료로 기록하지 않아야 한다.

## Invariants and Constraints

### INV-DCP-001: 증거는 특정 실행 대상에만 유효하다

한 OS·client·architecture·설치 채널·단계의 PASS는 다른 조합을 증명하지 않는다. 이전 코드·template·bundle의 PASS도 새 후보의 PASS가 아니다. 같은 모델 답변이나 같은 시험 개수는 동등성의 조건이 아니다.

### INV-DCP-002: 제품 권한과 데이터 소유권은 그대로다

CI가 실제 사용자 승인·역할 격리·실행 pin·commit handoff 계약을 우회하지 않는다. 테스트 controller의 owner service 호출은 실제 웹 UI 인수와 구별한다. 운영 DB·개인 홈·다른 작업의 프로세스는 fixture가 아니다.

### INV-DCP-003: 실패 이력과 기존 검증은 보존한다

새 범위가 준비되지 않았다는 이유로 기존 green 조건을 약화하거나 실패/skip 기록을 지우지 않는다. 성공한 재실행도 이전 실패의 원인과 시도를 보존한다. coverage 표의 미충족 허용은 제품 인수 완료를 뜻하지 않는다.

### CON-DCP-001: 문서와 구현의 권한 경계

현재 권한은 front matter의 실제 수정 요청과 후속 범위 답변을 따른다. 기존 코드·로컬 검증 승인과 이번 문서 편집을 구분한다. runner·인증·예산·운영 선행 조건이 필요한 실제 실행은 준비 전까지 보류하며, 개인 설치 변경과 운영 배포를 자동으로 수행하지 않는다. 개인 기기의 부재는 원격 CI 설계의 차단 조건이 아니며, 실제 필요한 준비는 BLK-DCP-05로 명시한다.

### CON-DCP-002: native 설치 계약과 비밀값 경계

[system-overview](../../architecture/system-overview.md)와 [protocol](../../architecture/protocol.md)을 따른다. Codex bundle과 App Server/native 로그인 경로를 실제로 검증한다. public PR에 개인 로그인 캐시를 제공하거나 role 환경변수 allowlist·LPAC·Seatbelt를 완화하지 않는다. Claude source 설치 예외는 유지하며 bundle 인수와 구분한다.

### CON-DCP-003: 기존 도구·경계·테스트 배치

Node.js·`node:test`·tsx·기존 PostgreSQL fixture·리허설을 사용한다. `scripts/rehearsals/` 옆에 시험을 두고 서버 내부 참조가 늘면 [server.md](../../architecture/server.md)의 목록을 갱신한다. `src/app`·`src/fsd`·`packages/core`에 CI 전용 코드를 넣거나 새 framework/패키지를 도입하지 않는다.

### CON-DCP-004: 기존 승격과 병행 작업의 계약

[AGENTS.md](../../../AGENTS.md), [verification.md](../../architecture/verification.md), 승인된 [ci-os-coverage](../completed/2026-11-17-ci-os-coverage.md)를 보존한다. 같은 commit/입력의 완료된 green 실행을 재사용하고 진행 중인 gate를 중복 dispatch하지 않는다. 현재 30분 초과 gate의 사용자 보고·취소 절차를 임의로 바꾸지 않는다. 110분 idle은 일반 승격 gate와 분리된 명시적 장시간 인수로 남긴다.

### CON-DCP-005: 원격 실증의 신뢰·인증·활성화 경계

Codex 구독 실증은 `Sangeok/stagekeeper-codex-ci`의 검토된 private `dev`와 owner 수동 dispatch에서만 한다. hosted 여부는 신뢰 검사를 대체하지 않는다. CI 전용 Pro Lite 로그인, 강제 ChatGPT 인증, 개인 interactive cache와의 분리, 인증 없는 설치 홈을 유지한다. 저장소·logs·일반 Actions cache/artifact에 credential을 넣지 않는다. 새 원격 저장소는 보관·쓰기 권한·충돌 방지·복구·폐기 조건을 확정한 뒤 사용한다. API key나 Enterprise 자격으로 바꾸는 것은 이번 범위가 아니다. 기존 private CI의 guard는 유지하고 새 환경의 별도 거부 경로를 만든다. 실제 운영 활성화와 함께 architecture를 갱신하며, 이 제안만으로 현행 계약을 바꾸지 않는다.

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

현재 Codex macOS 리허설은 이미 설치된 `--package`를 받으며, private wrapper가 실제 local marketplace loader를 실행한다. 최신 wrapper는 후보만 설치하는 빈 홈과 이전 설치에서 갱신하는 홈을 분리하고 cache inventory를 대조한다. 이 구현을 재사용하되 새 host에서의 실제 실행은 다시 검증한다. 후보 생성 → 검토된 설치 채널 → 실제 설치 cache 확인 → helper init → 모델 실행의 연결을 끊김 없이 기록한다.

모델 없는 설치 검증의 phase 선택과 사전 검사는 구현됐다. `init`에서는 auth smoke·eval·pipeline을 호출하지 않고, `eval`/`pipeline`의 인증 검증은 실제 모델 사용량으로 센다. 새 hosted auth 실증도 모델 사용 단계이며 init에 끼워 넣지 않는다. 설치 실패·동일 version의 stale cache·inventory 불일치는 helper 실행 전에 거부한다.

Windows entrypoint는 기존 Mac eval 실행기를 그대로 import해 실행하지 않는다. `codex-init-eval.mjs`의 `evalTurn`은 음수 PID process-group signal, `preflightInitEval`은 `/bin/cat`·`bin/harness`, `initEvalConfiguration`은 Mac 파일 경로·POSIX 환경을 사용한다. 기본 eval host는 macOS로 유지하고 Windows에서는 설치/pipeline과 그 native 정리 경로를 검증한다. `childEnvironment`가 `CODEX_HOME`을 전달하지 않으므로 `CODEX_HOME` 설정만으로 Windows 역할의 인증 격리를 증명하지 않는다. 실제 역할 프로세스가 사용하는 홈·profile·deny 경계를 P2에서 확인한다.

Claude의 Pro 기본 pipeline과 Codex의 Max·QA·scout pipeline을 같은 역할 개수로 비교하지 않는다. 공통 baseline은 같은 백로그 요청·독립 기대값과 공통 상태 전이로 정의하고, plan/profile별 필수 역할과 추가 인수는 별도 목록으로 검증한다. 기존 Codex의 더 넓은 검증을 baseline 공통화 과정에서 축소하지 않는다.

### 원격 CI 실증과 확대 순서

GitHub-hosted는 우선 검증할 후보이며 비용·안정성까지 입증한 최종 선택이 아니다. 필요한 OS는 원격에서 실행한다. 사용자의 제품 실행에 VM·WSL을 요구하지 않는 기존 계약은 유지한다. 개인 기기 대신 원격 CI VM을 쓰는 것은 사용자 설치 경로를 바꾸지 않는다.

| 순서 | 범위와 선행 조건 | 통과로 인정할 증거 |
| --- | --- | --- |
| DCP0 | Windows x64·macOS arm64 hosted 후보, 고정 CLI, CI 전용 인증·보관 서비스·실행 한도·책임 확정 | BLK-DCP-05의 실행 계약이 구체화됨. 유료 자원 구매나 실증 성공을 문서에서 가정하지 않음 |
| DCPR 로컬 | 합성 인증/저장소/CLI로 복원·조건부 저장·경합·중단·복구 판정 구현 | 비밀값·모델·외부 쓰기 없는 거부/상태 전이 시험. 실제 갱신 인수로 세지 않음 |
| DCPR 원격 | private 수동 dispatch, 두 OS의 인증 전용 CLI 실행과 새 runner 재실행 | 각 OS의 실제 갱신·최신 상태 저장·다음 runner 복원/실행·정리. 어느 OS의 단계라도 미관측이면 DCPR 미완료 |
| DCP2 | 실제 loader·bundle·설치된 helper·App Server·role bridge | 신규/update와 일반 사용자 권한의 최소 제품 실행·인증 경계·종료. DCPR의 CLI 성공을 이 증거로 대체하지 않음 |
| DCP3/DCP4 | 기존 Claude 작업 소유권·template 선행 조건과 최종 후보 계약 | 네 기본 조합의 pipeline/lifecycle·공통 판정·허용된 기록 연결. 모델 init eval의 기존 macOS host 정책은 유지 |

실증의 정상 경로는 다음과 같다.

1. 검토된 workflow SHA·private 저장소·owner·`dev`·OS/architecture·CLI 배포물 identity·실행 한도를 확인한 뒤 저장소 접근 자격을 제공한다. PR 코드에는 제공하지 않는다. CLI/의존성 설치 과정에는 인증을 노출하지 않으며 OS·CLI 버전 drift를 기록한다.
2. CI 전용 로그인의 최신 제어 상태와 인증 version을 읽고, 조건부 쓰기로 한 실행의 소유권을 획득해 `running`을 확정한 뒤 인증을 복원한다. seed는 최초 등록/명시적 재인증에만 쓴다. 개인 홈 대신 새 전용 홈에 복원하며 macOS mode와 Windows ACL을 각각 확인한다. 제어 상태 revision과 인증 payload version은 구별한다.
3. 인증을 사용할 수 있는 CLI를 시작하기 전에 실행 시도 표시를 원격에 확정한다. 동일 인증을 쓰는 기존 Mac workflow·다른 저장소·로컬 CI 실행까지 충돌 범위에 포함한다. 같은 private 저장소의 `codex-account-auth`와 `cancel-in-progress: false`를 보존하되, GitHub concurrency만으로 교차 저장소 잠금이나 FIFO 대기를 보장했다고 하지 않는다. 기존 stream을 배타적으로 멈추거나 공통 소유권 장치를 통과시킨다.
4. 고정 Codex의 정상 실행으로 인증을 사용·갱신한다. 직접 OAuth refresh endpoint를 호출하거나 실제 인증의 시간/토큰을 편집해 갱신을 연출하지 않는다. auth 전용 최소 turn은 기존 `EXPECTED`/`VERSION`/`streamResult` 계약을 재사용할 수 있지만, POSIX `runClient`·홈 검사·환경 allowlist는 Windows에 그대로 사용하지 않는다. 아래 실행 권한 계약을 시작 전에 적용하며 저장소 쓰기 자격은 모델 프로세스와 도구에 전달하지 않는다.
5. CLI 종료와 자식 정리를 확인하고 최신 인증 파일을 검증한 뒤 읽었던 revision/실행 소유권을 조건으로 저장한다. 원격 재조회로 해당 인증 version과 쓰기 작업의 identity를 확인하고 로컬 전용 홈의 정리를 마친 뒤에만 `ready`로 전환하고 잠금을 반납한다. 평문·token/hash·JWT·개인 경로를 출력하지 않고, 별도의 비밀 아닌 상태 version과 실행 identity로 연결한다.
6. 새 VM의 새 job/run이 직전 확정 version을 복원하여 실제 모델 실행을 완료해야 한다. 같은 job의 재호출이나 같은 파일을 남겨 둔 성공은 새 runner 재실행 증거가 아니다. Windows와 macOS는 각각 이 경로를 관측하며 동일 인증을 병렬 사용하지 않는다.

빠른 연속 실행에서 갱신이 일어나지 않으면 `refresh-unobserved`로 남긴다. 현재 공식 안내의 갱신 시점은 고정 CLI의 증거를 대신하지 않는다. 그 버전의 정상 갱신 조건과 관측 방법을 확인하고 필요한 때 새 제한 실행으로 관측한다. runner를 며칠 켜 두거나 모델 호출을 반복해 갱신을 기다리지 않는다. 원격 파일 전송 성공과 실제 인증 갱신 완료는 별개다.

auth 실증은 기존 `executionArguments`의 권한 의미를 보존한다. 강제 ChatGPT/OpenAI 인증, 승인 자동 확대 금지, ephemeral·strict config, shell/unified exec·code mode·web search·apps·hooks·memories·goals·multi-agent·추가 권한 요청 차단, 프로젝트 지시문 미로딩, 도구의 네트워크 차단과 인증/저장소 자격 경로 deny를 명시한다. 모델 API 통신과 도구의 네트워크 권한을 혼동하지 않는다. OS별 경로·환경 변수를 확정하고 실제 설정 적용을 검증하며, 알 수 없는 옵션은 조용히 무시하지 않는다. `streamResult`의 도구 이벤트 거부는 추가 검출일 뿐 실행 전 차단의 대체가 아니다. credential 저장 방식은 전용 파일로 고정하고, keyring·외부 token·개인 config로의 우회가 없는지 확인한다. 고정 CLI에서 이 설정을 지원하는지는 BLK-DCP-05의 사전 확인 대상이다.

### 원격 인증 상태·실패·환경 판정

아래는 provider와 무관하게 보존할 상태 전이 계약이다. 순수 metadata schema와 입출력은 다음 절에 정의하고, 실제 서비스의 API·credential 보관·원자성 구현은 TASK-DCP0-02에서 별도로 확정한다. `ready`는 최신 인증을 안전하게 다음 실행에 제공할 수 있다는 뜻이며, 모델 또는 DCPR 전체 PASS를 뜻하지 않는다.

| 현재 상태와 사건 | 허용 전이·조건 | 금지되는 처리 |
| --- | --- | --- |
| 상태 없음 | 소유자의 최초 등록/명시적 재인증 뒤 `ready` | 일반 실행이 seed로 자동 생성 |
| `ready`, 소유권 획득 | 읽은 제어 revision과 인증 version에 묶인 조건부 쓰기로 `running`; owner와 쓰기 작업 ID 기록 | 인증을 먼저 사용한 뒤 잠금 기록, 두 실행의 동시 복원 |
| `running`, CLI 시작 전 실패 | 실행 시도 표시가 없고 자식 미시작·로컬 정리·기존 인증 payload의 유효성이 확인되면 같은 owner의 조건부 쓰기로 기존 version의 `ready` 복귀. 인증 손상/부재 또는 검증 불가는 복구 필요 처리 | 잘못된 인증을 `ready`로 되돌려 반복 실행, 정상 소유권 반납을 인증 갱신 성공으로 보고 |
| `running`, 실행 시도 표시 이후 | 최신 인증의 저장·재조회, 자식 종료와 홈 정리까지 확인한 뒤 해당 version의 `ready` | `turn.started`가 없다는 이유로 갱신이 없었다고 가정, 저장 전 잠금 해제 |
| `running`, 저장/중단/정리 결과 불명 | 조건부 `recovery-required`; 원격 쓰기 자체가 불가하면 `running`을 유지하고 다음 실행 차단 | 시간 경과나 잠금 TTL만으로 `ready`, 이전 인증으로 자동 재실행 |
| `recovery-required` 또는 남은 `running` | 이전 실행의 종료와 최신 확정 상태를 확인한 소유자가 복구 또는 명시적 재인증 | 늦은 기존 writer의 덮어쓰기, 새 실행의 임의 잠금 탈취 |

저장 응답 유실은 해당 쓰기 작업 ID·owner·revision·인증 version으로 재조회한다. 소유권 변경 여부를 확인하지 않은 재쓰기나 `finally`의 무조건적인 잠금 해제는 금지한다. 합성 시험은 각 경계 직전·직후의 중단과 늦은 응답을 제어해 다음 실행의 허용/거부와 최종 상태를 함께 확인한다.

| 사건 | 상태 소유자와 처리 | 검증·다음 실행 조건 |
| --- | --- | --- |
| 소유권 획득 전 출처/권한/예산 누락 | preflight가 인증 복원 전에 중단 | VFY-DCP-10/11. 의존 모델 호출 0, 원격 상태 무변경 |
| 소유권 획득 후 복원/ACL 검사 실패 | 모델을 시작하지 않고 위 상태 전이로 소유권·홈 정리 | 모델 호출 0. 허용된 제어 상태 갱신과 인증 payload 무변경을 구별; 결과 불명이면 다음 실행 차단 |
| 동시 실행·오래된 writer | 상태 관리자가 배타 소유권과 조건부 쓰기로 거부 | 합성 경합과 실제 저장소의 version 충돌을 각각 확인. 최신 값을 덮어쓰지 않음 |
| 모델 오류 후 인증은 갱신됨 | 모델 실패를 보존하고 갱신 상태 저장·정리는 별도로 수행 | 인증 보존 성공이 모델 실패를 PASS로 바꾸지 않음 |
| 저장 실패·응답 유실 | 확정 상태를 재조회. 확인 불가하면 복구 필요 표시 | 오래된 seed/캐시로 다음 실행 금지. 원래 실패와 마지막 확인 version 유지 |
| 강제 취소·VM 소실 | `always()` 정리가 실행된다고 가정하지 않음. 실행 중 상태를 완료로 바꾸지 않음 | 다음 실행은 상태/소유권 검증 전 모델 금지. 소유자 확인 후 복구 또는 전용 로그인 재등록 |
| 인증 폐기·갱신 불가 | 소유자가 전용 로그인 재인증·보관 상태 재등록 | 개인 interactive 로그인 재사용/API 전환 금지. 모든 실패 이력 유지 |
| Windows 관리자 실행만 성공 | OS와 권한 조건을 기록 | auth 실증으로만 인정. DCP2에서 비관리자 권한·실제 LPAC·auth deny를 검증해야 제품 인수 가능 |
| hosted 고유 제약 확인 | 원인·재현·대안의 비용/운영 책임 비교 | 권한/갱신/저장소 계약을 만족할 수 없을 때 전용 원격 runner 제안. 개인 Mac 준비를 기본 복구책으로 삼지 않음 |

시도별 timeout·최대 모델 호출·전체 사용량 한도와 외부 오류 재시도 한 번의 포함 여부를 실행 전에 정한다. 한 job의 auth CLI 시작은 최대 한 번이며 내부 재시작은 하지 않는다. CLI 시작 수·완료 turn 수·실제 모델 API 요청 수는 다른 측정값이다. 고정 CLI의 내부 retry로 실제 요청 수를 관측할 수 없으면 null로 두고 한 번이라고 추정하지 않는다. 한도의 단위·CLI 내부 retry 제한 가능 여부·한도 강제 위치를 TASK-DCP0-02에 명시한다. 저장소 과금·runner 시간·모델 사용량을 분리해 기록하고 알 수 없는 값은 null로 둔다. 한도 미설정 또는 필요한 한도의 강제 불가는 실행 거부다. 기존 30분 운영 규칙을 완화하지 않으며 스케줄·필수 승격 gate를 실증 중 자동으로 활성화하지 않는다.

상태 보관 서비스의 제품명·인증 방식·최소 권한·원자적 조건부 갱신/잠금·복구·보관 기간·폐기·비용은 BLK-DCP-05가 소유한다. GitHub secret을 매번 읽기만 하는 구성은 갱신 상태 보존을 충족하지 않는다. 선택 전에는 provider API나 실행 명령을 완성된 것으로 제시하지 않는다. auth 실증은 원문을 보관하지 않고 allowlist 요약만 남긴다. 기존 제품 리허설의 raw 진단은 VM 소멸 전에 승인된 원격 private 보관소에 검토 가능한 형태로 보존해야 하며, 그 계약이 없으면 해당 제품 phase로 확대하지 않는다.

### 순수 상태 계약과 저장소 경계

다음 순수 논리 계약은 2026-11-17 private 작업 브랜치에 구현했다. 병합·실제 저장소 연결 완료와 구분한다. private `codex-auth-state.mjs`가 metadata 검증과 전이 계산을 소유한다. provider 자격·credential bytes·파일/네트워크 접근은 이 순수 경계 밖에 둔다. 현재 `authMetadata`의 auth mode·plan·파일 검사를 재사용할 때도 OS별 검사를 분리하고 credential 본문을 순수 결과나 오류에 넣지 않는다.

`snapshot`은 `{ revision, record }`다. revision은 adapter가 반환하는 비밀 아닌 비어 있지 않은 불투명한 조건부 쓰기 문자열이며 숫자로 증가시키거나 시간과 비교하지 않는다. record는 아래 필드만 가진다. 필드 누락·추가·잘못된 타입·알 수 없는 schema/status는 거부한다. UUID는 credential·계정 ID·token hash에서 파생하지 않은 소문자 UUID v4다.

| record 필드 | 타입·계약 |
| --- | --- |
| `schemaVersion` | 정수 `1` |
| `authStreamId` | UUID. 최초 등록에서 정한 하나의 전용 로그인 stream을 식별하며 일반 실행이 변경하지 않음 |
| `status` | `ready`, `running`, `recovery-required` 중 하나 |
| `authVersion` | UUID. snapshot이 가리키는 credential payload의 논리 version. 제어 revision이나 갱신 성공 여부와 구별 |
| `owner` | null 또는 `{ repository, workflowCommit, runId, attempt, jobKey }`. repository는 private 저장소, commit은 40자리 소문자 hex, runId는 1~16자리 양의 십진 문자열, attempt는 `1`, jobKey는 소문자 영문으로 시작하는 영문·숫자·`_`·`-` 1~40자 |
| `executionAttempted` | boolean. 인증 사용이 가능한 CLI를 시작하기 전에 true를 원격에 확정 |
| `lastWriteId` | UUID. 재조회로 해당 조건부 쓰기의 적용 여부를 판별하는 작업 ID |
| `recoveryReason` | null 또는 `invalid-auth`, `write-unconfirmed`, `execution-unconfirmed`, `cleanup-unconfirmed`, `ownership-conflict` 중 하나 |

ready는 owner/recoveryReason이 null이고 executionAttempted가 false다. running은 owner가 있고 recoveryReason이 null이며, recovery-required는 이전 owner와 executionAttempted를 보존하고 recoveryReason을 가진다. 저장소가 없거나 record가 손상된 경우에는 정상 실행이 새 ready를 만들지 않는다. 최초 등록·재인증은 별도 운영 절차이며 BLK-DCP-05로 남긴다.

`parseAuthState(snapshot)`은 위 구조를 검사해 독립 복사본을 반환하고 잘못된 입력은 message/code가 `invalid-state`인 오류로 거부한다. `planAuthTransition({ snapshot, owner, writeId, event })`는 `{ kind: "write", expectedRevision, record }` 또는 `{ kind: "reject", code }`만 반환한다. 입력을 변경하지 않으며 reject에는 쓰기 의도가 없다. 잘못된 입력은 `invalid-state`, 소유권 불일치는 `owner-mismatch`, 허용되지 않은 전이는 `transition-refused`로 축약한다. 성공 intent는 입력 revision을 그대로 비교 조건으로 사용하고 새 lastWriteId를 기록한다. 현재 lastWriteId를 재사용한 intent는 `transition-refused`이며 응답 유실 시 같은 요청을 새 전이로 실행하지 않고 controller가 저장 상태를 대조해야 한다. 모든 이벤트는 아래 필드만 받는다.

| event | 허용 조건과 결과 |
| --- | --- |
| `{ type: "acquire" }` | ready에서 owner를 기록하고 running, executionAttempted=false. 인증 version 유지 |
| `{ type: "mark-execution" }` | 같은 owner의 running, executionAttempted=false에서 true로 전환. 성공 응답/재조회 전 CLI 시작 금지 |
| `{ type: "commit-auth", authVersion }` | 같은 owner의 running, executionAttempted=true에서 검증한 최신 payload의 새 version을 게시. running 유지 |
| `{ type: "release" }` | 같은 owner의 running에서 아래 controller 증거가 모두 확인된 경우 ready. owner·시도 표시를 지움 |
| `{ type: "require-recovery", reason }` | 같은 owner의 running에서 허용 recoveryReason을 기록. payload/version과 시도 표시 유지 |

순수 계산기의 입력 검증은 실제 파일 유효성·자식 종료·저장 성공의 증거가 아니다. controller는 commit-auth 전에 자식 종료와 최신 파일 검증을, release 전에 저장 재조회·로컬 홈 정리를 확인한다. CLI 시작 전 release에는 기존 payload 검증·미시작·정리 증거가 필요하고, 시작 표시 이후에는 이번 owner가 commit한 최신 version의 재조회가 필요하다. 일반 CLI 인자나 summary의 boolean을 이 증거로 사용하지 않는다. 상태 계산 시험과 controller 순서 시험을 모두 둔다. 복구·최초 등록은 위 정상 이벤트 목록에 넣지 않으며 운영 절차 없이 lock 탈취/초기화 API를 추가하지 않는다.

adapter의 논리 port는 `readCurrent(authStreamId)`의 snapshot/부재 판정과 `compareExchange({ expectedRevision, record, credential })`의 committed/conflict/indeterminate 판정이다. credential은 비공개 I/O 경계의 값이며 순수 함수·summary에 전달하지 않는다. 제어 상태만 바꾸는 쓰기는 기존 payload를 유지한다. version을 바꾸는 쓰기는 해당 payload와 record가 하나의 확정 상태로 읽히도록 게시해야 한다. 여러 물리 object를 사용하면 미완료 payload를 현재값으로 노출하지 않는 원자성·고아 object 폐기 계약까지 확인한다. conflict/응답 유실을 성공이나 무조건 재시도로 바꾸지 않으며 재조회에서 writeId·owner·version을 대조한다. 이 port가 특정 서비스에서 구현 가능하다는 증거는 아직 없으므로 실제 adapter는 BLOCKED다.

### 인증 실증 요약의 데이터 계약

private `codex-hosted-auth-proof.mjs`의 `parseHostedAuthObservation`은 아래 필드만 있는 JSON을 검증해 독립 복사본을 반환하며 잘못된 구조·모순된 성공은 message/code가 `configuration-refused`인 오류로 거부한다. `schemaVersion: 1`, `scope: "codex-hosted-auth-proof"`를 사용하며 기존 init artifact 또는 public schema 2로 자동 변환하지 않는다. 중첩 object도 추가/누락 필드를 거부한다. 미관측은 명시적 null 또는 not-run이고 성공 기본값을 채우지 않는다.

| 필드 | 본문·검증 |
| --- | --- |
| `execution` | 상태 owner와 같은 다섯 필드에 `workflow`, `actor`, `triggeringActor` 추가. workflow는 제안 hosted workflow 경로, 두 actor는 owner. 신뢰 검사를 통과하기 전 실패하면 전체 null |
| `environment` | null 또는 `{ os, architecture, runnerLabel, imageVersion, clientVersion, executableSha256, privilege }`. 허용 tuple은 `win32`/`x64`/`windows-2022`, `darwin`/`arm64`/`macos-15`. imageVersion은 숫자로 시작하는 숫자·`.`·`-`·`_` 1~80자, clientVersion은 세 부분 숫자, digest는 소문자 hex 64자, privilege는 standard/elevated/unknown |
| `state` | null 또는 `{ authStreamId, restoredVersion, committedVersion, writeId, refresh, persisted, released }`. UUID 필드는 위 규칙이며 committedVersion/writeId는 미확정이면 null. refresh는 observed/unobserved/unknown; persisted/released는 boolean |
| `model` | `{ name, cliStarts, completedTurns, apiRequests, responseMatched, usage }`. name은 실제 적용한 고정 모델 설정의 이름 또는 미확인 시 null이며 영문·숫자로 시작하는 영문·숫자·`.`·`_`·`-` 1~80자. 시작 수·완료 turn 수는 비음수 안전 정수, apiRequests는 같은 정수 또는 null, responseMatched는 boolean. usage는 `{ input_tokens, cached_input_tokens, output_tokens }`의 각 값이 비음수 안전 정수 또는 null |
| `cleanup` | `{ processes, authHome }`. 각 값은 pass/fail/not-run |
| `measurement` | `{ durationMs, runnerCostUsd, storeCostUsd, modelCostUsd }`. durationMs는 비음수 안전 정수, 비용은 비음수 유한 숫자 또는 null |
| `result`, `codes` | result는 pass/fail. codes는 아래 고정 code의 중복 없는 배열이며 pass는 빈 배열, fail은 하나 이상을 요구 |

code는 `context-refused`, `configuration-refused`, `limit-refused`, `invalid-state`, `owner-mismatch`, `transition-refused`, `invalid-auth`, `write-unconfirmed`, `execution-unconfirmed`, `cleanup-unconfirmed`, `ownership-conflict`, `model-failed`, `provenance-unverified`, `refresh-unobserved`, `proof-incomplete`, `unexpected-failure`로 제한한다. vendor 오류 본문·임의 문자열을 code로 옮기지 않는다. syntax/type 오류에도 원문을 출력하지 않고 고정 실패 code만 남긴다. execution/environment/state의 null은 실패 기록에만 허용한다. 성공 관측은 trusted preflight·확인된 권한/모델 설정·모델 완료/정확한 응답·지속 저장/소유권 반납·두 cleanup 통과를 모두 요구하고, CLI 시작/완료 turn은 각각 1이다. 성공에 privilege=unknown·model.name=null·apiRequests=0·commit version/writeId 누락을 허용하지 않는다. 단일 실행의 pass는 갱신 미관측을 허용하되 DCPR 전체 PASS와 구분한다.

숫자 REST job ID는 실행기가 추정해 넣지 않는다. 수집기가 검토한 workflow의 고유 job 이름과 jobKey, 해당 run/attempt의 REST job을 일대일로 연결한 뒤 별도 executions 입력에 붙인다. matrix job은 첫 버전의 실증 workflow에 사용하지 않고 OS별 고유 job key를 사용한다. 출처 검증된 executions는 observation의 digest, 숫자 job ID, run/job conclusion, hosted VM 확인을 포함한다. 같은 이름의 다른 job이나 검증되지 않은 환경변수를 대신 쓰지 않는다.

`evaluateHostedAuthProof({ expected, observations, executions })`는 네트워크·상태 쓰기 없이 전체 실증을 판정한다. 잘못된 입력은 `configuration-refused` 실패 결과로 축약한다. 이 세 입력의 구조는 다음과 같고 열거한 필드만 받는다. execution identity는 관측 schema의 execution과 같으며 모든 비교에서 필드 전체를 사용한다.

| 입력 | 구조와 조건 |
| --- | --- |
| `expected` | `{ workflowCommit, authStreamId, modelName, attempts, pairs }`. commit/UUID/modelName은 앞의 타입 규칙. attempts는 이번 실증의 원래 실패와 재시도를 포함한 중복 없는 실행 identity 배열 |
| `expected.pairs` | 정확히 두 개의 `{ os, architecture, runnerLabel, clientVersion, executableSha256, imageVersions, refreshExecution, successorExecution }`. Windows x64·macOS arm64 각각 하나, imageVersions는 중복 없는 비어 있지 않은 허용 version 배열. 앞뒤 identity는 attempts에 존재해야 함 |
| `observations` | 위 관측 schema의 배열. execution이 같은 충돌/중복 관측은 거부하며 실행되지 못해 관측이 없는 attempt는 executions에서 그대로 미충족 처리 |
| `executions` | `{ attempts, historyComplete }`. historyComplete는 trusted 수집기의 이력 대조 결과 boolean. attempts는 expected의 전체 시도와 일대일로 대응하는 아래 항목 배열 |
| `executions.attempts[]` | `{ execution, os, architecture, jobId, jobStartedAtMs, jobCompletedAtMs, observationSha256, runConclusion, jobConclusion, provenanceVerified, freshVmVerified, supersededBy, externalFailureReviewed }`. OS/architecture는 검토된 workflow와 해당 job으로 확인한 win32/x64 또는 darwin/arm64이며 확인 불가하면 둘 다 null. jobId는 양의 십진 문자열 또는 조회 실패 시 null. 두 시각은 해당 REST job의 유효한 started_at/completed_at을 UTC Unix epoch 밀리초로 변환한 비음수 안전 정수이며 미확인은 null. digest는 소문자 hex 64자 또는 관측 부재 시 null. 두 conclusion은 success/failure/cancelled/skipped/unknown. 세 검증/review 필드는 boolean, supersededBy는 대체 실행 identity 또는 null |

observationSha256은 credential이 아닌 허용 관측 JSON의 digest다. object key를 모든 깊이에서 사전순 정렬하고 codes만 정렬한 뒤 UTF-8 `JSON.stringify` bytes에 SHA256을 적용한다. 그 외 배열 순서는 보존한다. 수집기는 검증된 관측에서 직접 digest를 계산하고 출처를 확인한 job에 묶는다. 요약에 적힌 임의 hash를 그대로 신뢰하지 않는다. 결과는 `{ scope: "codex-hosted-auth-proof", result, codes }`뿐이며 pass의 codes는 비고 fail은 고정 code를 하나 이상 반환한다.

실행 순서는 관측 배열 위치·runId 크기·artifact 생성 시각·runner 로컬 시계로 추정하지 않는다. 수집기가 해당 run/attempt/job의 REST 시각을 대조하고, 판정기는 시작 ≤ 종료를 검사한다. 갱신 쌍의 후속 실행과 실패의 대체 실행은 각각 앞 실행의 jobCompletedAtMs보다 jobStartedAtMs가 엄격히 커야 한다. 동시 구간·같은 시각·역전·시각 미확인은 순서 증거가 아니며 `proof-incomplete`다. job 시각은 상태 저장의 증거를 대신하지 않고 version 계승·정리 확인과 함께 사용한다. 기존 `evaluateClientCandidate`의 최신 실패 거부 원칙을 새 scope에서도 유지하되 public schema 2를 바꾸지는 않는다.

각 쌍에서 같은 OS·stream·검토된 workflow/CLI·expected.modelName, 시간 순서가 확인된 서로 다른 hosted VM의 실행, 첫 실행의 refresh=observed·persisted/released, 후속 restoredVersion=첫 committedVersion, 양쪽 모델/정리 성공과 종료된 전체 run/job 성공을 모두 확인한다. 쌍 안의 관측 imageVersion은 해당 허용 집합에 있어야 하며 OS/architecture는 executions와도 일치해야 한다. 자기 참조·중복 identity·버전 불일치·한 OS 누락·갱신 미관측·출처 미검증·historyComplete=false는 거부한다. 선택한 네 실행은 서로 달라야 하며, 실제 job ID와 관측 digest가 없는 실행은 PASS에 기여하지 못한다. 관측 JSON만으로 executions를 생성하지 않는다.

선택한 두 쌍 밖의 실패를 숨기지 않는다. 수집기는 원래 실패·사유·복구 확인·선택 identity를 보존한다. 실패 실행의 supersededBy는 같은 OS/architecture에서 시간 순서상 바로 다음 시도를 가리켜야 하고 externalFailureReviewed=true가 필요하다. 대체 실행은 출처·digest·환경/모델·상태/정리의 같은 검증을 통과한 pass 관측과 전체 run/job 성공을 가져야 하며, 하나의 성공을 여러 실패의 재시도로 연결하지 않는다. 관측 artifact가 없는 실패도 executions의 출처/OS/시각으로 대조하며 어느 하나라도 미확인이면 대체를 인정하지 않는다. 원인 검토/복구가 끝나지 않았거나 실제 외부 원인이 아닌 실패, 과거 green으로 최신 실패를 대체하는 연결, 순환 대체·실패 뒤 재시도 실패를 다시 성공에 연결하는 두 번째 모델 재시도는 proof-incomplete다. 성공 실행은 supersededBy=null이며 선택하지 않은 갱신 미관측 성공도 이력에 남긴다. 순수 판정에 전달하는 boolean은 trusted 수집 결과이며 owner가 검토하지 않은 JSON 입력으로 대신하지 않는다. 이력 완전성을 확인할 조회 범위·검토 저장 위치·artifact 명칭/기간·실제 CLI 명령은 BLK-DCP-05의 수집 운영 계약으로 남는다. 데이터 구조를 정의한 사실로 trusted 수집 구현까지 준비됐다고 하지 않는다.

### identity와 기록 계약

새 공통 계약은 `client`, `clientVersion`, `os`, `architecture`, `osVersion`, `phase`, `scenario`와 workflow repository·`workflowCommit`·run ID·attempt를 식별한다. 제품 검증에는 `pluginCommit`·`pluginVersion`·`installChannel`을 더하고, 아래 phase별 자원 identity를 적용한다. 모델 실행은 model과 제공되는 usage, 모든 실행은 duration·result·소유한 자원의 cleanup·review 상태를 남긴다. 기존 `sourceCommit`은 원본 의미를 확인해 변환하고 호환 필드로 보존할 수 있지만 server/plugin/workflow SHA를 대신하지 않는다.

| phase/경로 | 필수 추가 identity | 비해당과 누락의 구분 |
| --- | --- | --- |
| 실제 설치/init 및 pipeline | `serverCommit`, `templatesCommit`, 설치 채널. bundle은 package/runtime/verifier identity, update는 이전 설치물 identity | source 설치에서 bundle hash를 꾸며 넣지 않음. 필요한 source/cache 증거는 생략 불가 |
| Claude `agent-eval` | 복사한 plugin과 `plugin/evals` fixture의 source commit·선택한 case/tag·반복 수·실제 평가한 사본. 채널은 설치가 아닌 source-copy 평가임을 구분 | 서버·외부 template을 쓰지 않으므로 그 identity는 사유가 있는 비해당. 실제 설치 성공으로 세지 않음 |
| Codex Mac eval | 실제 초기화된 설치 bundle·server/template identity와 control/3개 case·반복 수 | 현재 Mac eval은 연결된 fixture를 사용하므로 Claude eval처럼 server/template을 생략할 수 없음 |
| 독립 auth smoke | workflow commit·client executable identity·모델 완료·사용량·정리 | 제품 설치/서버/template 인수로 세지 않음. 이후 제품 실행의 인증 보조 증거일 뿐임 |

P1의 schema는 이 구분을 검증한다. `not-applicable`은 알려진 phase 계약으로만 허용하고 누락값의 자동 기본값으로 쓰지 않는다. cleanup도 실제 생성한 자원별로 검사하며, browser/DB를 만들지 않는 평가에 가짜 종료 성공을 채우지 않는다.

기존 공개 요약의 `pluginCommit`과 gate row의 `commit`, private wrapper의 `sourceCommit`, raw macOS 요약의 `codex`·`templatesExportCommit`을 의미 대조 후 정규화한다. 필드 이름만 바꾸거나 사라진 필드를 기본값으로 채우지 않는다. 구현된 summary의 실패·미완료 거부를 보존하고 raw Codex JSON은 client별 변환 뒤 엄격히 검증한다.

private auth summary의 `sourceCommit`은 `GITHUB_SHA`, 즉 **private workflow commit**이다. wrapper의 `target.sourceCommit`은 **제품 checkout commit**이다. 공개 PR init은 기본 checkout의 merge SHA와 `PLUGIN_COMMIT`의 PR head SHA가 다를 수 있다. 따라서 source 필드 이름의 일치로 연결하지 않고 실제 checkout·설치 provenance를 대조한다. branch 입력은 full SHA로 해석하고 실제 설치 commit이 다르면 실패한다. 구현된 `codex-cli 0.167.1` 버전 파싱을 재사용한다.

현재 package의 `packageSha256`은 archive bytes가 아니라 정렬된 inventory JSON의 SHA256이다. Windows row는 `[path, sha256]`, macOS row는 `[path, sha256, mode]`이고, inventory 뒤에 쓰는 `windows-package.json`/`macos-package.json` 자체는 그 목록 밖이다. OS별 규칙으로 설치 cache의 파일 집합·bytes·필요한 mode를 재계산하고, manifest sourceRevision·runtime executable digest·두 verifier 사본을 별도로 대조한다. archive digest가 필요하면 다른 필드로 기록한다. 제외한 manifest를 자기 hash에 포함하거나 두 OS의 inventory 형식을 같다고 간주하지 않는다.

새 gate row/schema에는 version을 명시하고 기존 기록 reader를 유지한다. 과거 schema가 가진 정보보다 넓은 인증을 소급하지 않는다. 정규화는 allowlist 출력만 생성하며 unknown/result 누락·`running`·부분 성공·정리 미완료를 PASS로 보정하지 않는다. private `safeResult`의 진단과 phase별 필수 항목을 보존하고 **전체 job 결론 + 모든 필수 phase/scenario + cleanup + provenance + 검토 완료**를 판정한다. `reviewRequired: false`를 검토자가 실제 검토했다는 증거로 만들지 않는다.

실행과 기록의 재시도는 별개다. 현재 gate-record action은 record job의 `GITHUB_RUN_ATTEMPT`로 행을 쓰고 매번 댓글을 추가한다. 반면 기존 계약은 record만 재실행할 때 앞 시도의 gate 출력을 재사용한다. 따라서 새 schema는 leg마다 실제 실행의 repository/run/attempt/job·leg 식별자와 결과 identity를 보존하고, record 실행의 run/attempt·게시 출처를 별도로 둔다. 현재 record attempt를 원래 gate attempt로 대입하거나 모든 leg가 같은 attempt에서 실행됐다고 가정하지 않는다. trusted consumer가 실행·출력·정리 결과의 연결을 확인하지 못하면 새 인수 증거로 채택하지 않는다.

동일한 실행 출처와 동일한 정규화 결과를 여러 번 게시한 경우에는 기록 이력을 보존하면서 필수 집합에는 한 번만 센다. 같은 출처에 내용이 다른 행, 선택한 실행 안의 중복 leg, 이전 결과를 새 실행으로 위장한 행은 거부한다. 실제 gate 재실행은 별도 시도로 보존하며, 후보 판정은 선택한 시도와 재실행 사유·검토 결과를 명시한다. 더 최근의 실패나 미해결 진단이 있는데 과거 green만 골라 통과시키지 않는다. 검토 완료도 해당 실행과 결과에 연결하며 새 진단에 자동 승계하지 않는다. record 복구는 모델 재시도 횟수나 사용량을 새로 만들지 않는다.

공개 기록에는 허용 필드만 둔다. private 결과는 승인된 private 기록에 원본 출처와 함께 남기고, 배포 판정은 접근 권한이 있는 controller/검토자가 필요한 증거를 확인한다. 성공이라고 주장하는 임의 JSON을 배포 증거로 받지 않는다. 출처를 확인하지 못하면 미충족이다. 이 문서 작성 중 issue·comment를 게시하지 않는다.

공개 `agent-eval.yml`의 shell/assistant 원문 출력은 제거됐으며 허용 필드 요약과 연결 검사를 보존한다. GitHub secret masking만으로 임의 모델 본문이 안전하다고 판정하지 않는다. 원문 진단이 필요하면 승인된 비공개 보관 경로를 사용하며, 새 보관 경로를 선택하기 전에는 출력부터 공개로 확대하지 않는다.

DCPR의 결과는 `scope: codex-hosted-auth-proof`인 별도 요약으로 기록한다. 공통 schema의 `phase: auth`도 저장소 갱신·새 runner 계승의 전부를 표현하지 못하므로 그것만으로 DCPR을 통과시키지 않는다. 필수 내용은 workflow SHA·run/attempt/job·OS/architecture/OS image·CLI version/digest·실행 권한, 비밀 아닌 상태 version의 연결, refresh/저장/재복원/정리의 판정, 사용량/시간과 실패 code다. collector는 GitHub의 실제 실행 출처·해당 SHA의 workflow 설정·앞뒤 run 연결을 확인한다. 환경변수나 요약의 자기 주장만으로 hosted 출처를 인증하지 않는다. 이 요약을 `init-evidence.json`이나 제품 설치/승격 기록으로 위장하지 않는다.

새 실증의 출처 검사는 실행 전과 수집 후에 모두 둔다. 실행 전에는 최초 `actor`와 실제 `triggering_actor`가 모두 owner인지 확인하며, 첫 버전은 `run_attempt == 1`만 허용한다. GitHub의 부분 job 재실행은 credential 접근 전에 거부하고, 허용된 외부 원인 재시도는 실패 기록·상태 복구 확인 후 별도 수동 run으로 연결한다. 기존 Mac workflow의 guard 변경과 혼동하지 않는다. `GITHUB_JOB`의 논리 job key와 REST job의 숫자 ID도 별도 필드다. 이 구분은 [GitHub contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts)와 [workflow jobs API](https://docs.github.com/en/rest/actions/workflow-jobs)를 따른다.

수집은 `codex-hosted-auth-proof.mjs`의 별도 읽기 전용 모드가 소유하고, 대상 run이 종료된 뒤 수행한다. 실행 중인 자기 run의 최종 결론을 기다리는 job을 만들지 않는다. `Actions: read`로 run/job/artifact 출처·attempt·전체 결론·필수 job을, `Contents: read`로 해당 workflow SHA의 설정을 대조한다. CLI digest·실제 OS image·권한 관측은 GitHub API가 직접 증명하는 필드가 아니므로 검토된 실행기가 만든 요약과 확정된 예상 identity를 연결한다. artifact ID·run/attempt/job 연결·허용 파일 집합을 검증하고 다운로드 후 출처를 재조회해 교체를 거부한다. 수집 실패의 재실행에는 모델 호출·인증 상태 변경·저장소 쓰기 자격이 필요 없어야 한다. 데이터 schema는 앞 절을 따르며 실제 이력 조회·artifact 이름/보관 기간·검토 기록·명령은 TASK-DCP0-02에서 확정한다. 미정인 지금은 실제 수집 가능으로 판정하지 않는다.

### 최종 산출물과 판정 위치

| 최종 산출물 | 결정하는 소스·우선순위 | 확인할 본문·의존성 | 검증 위치 |
| --- | --- | --- | --- |
| 원격 인증 상태 | 최신 확정 store version → 전용 홈 → Codex 갱신 → 소유권/조건부 저장 → 새 runner 복원 | schema 1 metadata와 credential payload를 구별하며 같은 확정 상태로 게시. credential 본문은 비공개 상태 관리자만 검증. 오래된 writer·seed 덮어쓰기 금지. provider/권한·복구는 BLK-DCP-05 미확정 | VFY-DCP-10/11의 version 전이·실제 갱신·새 VM 실행·실패 후 차단 |
| 원격 auth 실증 요약 | native 관찰 + state 저장 확인 + GitHub run/job 출처·시각 | `codex-hosted-auth-proof` allowlist와 앞뒤 실행·실패/재시도의 시간 순서 및 일대일 연결. credential·원문·token hash 제외 | VFY-DCP-10/11의 위조/누락/갱신 미관측/출처 교체·과거 성공으로 최신 실패 대체 거부. 제품 인수와 별도 판정 |
| 원격 제품 진단 | 기존 wrapper의 raw 결과 → 승인된 private 보관소 → 접근 권한이 있는 검토자 | run/attempt·제품 identity와 본문을 연결하고 credential을 제외. 보관/암호화/조회/폐기 계약은 BLK-DCP-05에서 확정 | DCP2/DCP3 확대 전 VFY-DCP-08로 VM 소멸 후 해당 원문 조회와 진단 검토 가능성을 확인. 저장 실패/검토 불가는 미충족 |
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
| 원격 auth 실증 | BLK-DCP-05 해소 후 private owner 수동 실행. 두 OS를 직렬 사용하며 자동 스케줄 없음 | DCPR 관측 범위만. 갱신 미관측은 미완료, 설치/pipeline 인수 아님 |
| 설치/패키징 관련 신뢰된 후보 | 대상 조합의 모델 없는 신규/update·init | 해당 설치 채널·identity |
| 실제 모델 정기/수동 실행 | 기존 스케줄 보존. Codex 빈도·runner 시작·계정 예산은 P0에서 확정 | 해당 commit/입력/환경 |
| pipeline 승격 대상 변경 | 기존 경로 조건과 Claude 양 OS 실행 결정을 보존하고, 대상 Codex 조합의 증거를 추가 | 정확히 같은 후보와 입력의 필수 결과 전체 |
| runtime 취소/소유권/장시간 관련 변경 | 영향을 받는 OS/client의 lifecycle 검증. 110분 idle 필요 여부는 변경 영향과 기존 인수 계약으로 결정 | 측정한 기간·payload·환경만 |

공통 정책이나 두 client에 전달되는 template 변경은 두 client의 영향을 평가한다. OS 전용 준비 코드의 변경을 좁혀 실행할 때는 근거를 남기되 승인된 Claude의 양 OS pipeline 규칙을 축소하지 않는다. 공개 PR에서는 자격 부족 skip을 허용하는 기존 정책을 유지하지만 그 결과로 배포 인수를 충족시키지 않는다.

변경 선택은 workflow 작성과 함께 연결한다. 기존 Codex macOS 리허설·eval·공통 계약·패키징 경로는 `AGENTS.md`와 init PR paths에 반영됐다. 새 Windows entrypoint와 원격 실증 경로는 아직 없으며 구현 시 영향 분류와 관련 trigger/시험을 연결한다. P4에서 `pipeline-smoke-steps.test.mjs`, `verify-ci-coverage.test.mjs`로 각 추가 경로만 바꾼 입력의 gate 선택과 양 OS 보존을 검증한다. private 저장소 변경은 public `git diff`에 나타나지 않으므로 workflow revision·`ci-target.json` 변경도 별도 후보 재검증 사유다. 경로 존재 검사만으로 선택 완전성을 주장하지 않는다.

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
| 인증 갱신 실패/모델 오류 | Codex의 정상 갱신과 그 실패를 구분하고 오류·사용량을 요약 | native 갱신은 별도 workflow 재시도가 아님. 무제한 재시도 금지; 외부 원인 확인 뒤 한 번만 재실행 |
| 기록만 실패 | 기존 gate 출력과 leg별 실행 출처를 보존해 record job만 재실행; record attempt는 별도 기록 | 동일 출처·동일 결과의 재게시만 중복 제거. 충돌/출처 누락은 실패; 모델 호출·사용량 중복 집계 없음 |
| green이지만 진단 존재 | `reviewRequired` 또는 기존 gate issue의 원인 검토 | 계약/힌트/template 결함이면 수정과 새 후보 검증, 사유 없이 검토 완료로 닫지 않음 |

## Blockers

### BLK-DCP-01: 지원 집합·승격 적용 시점과 추가 host 계약

- classification: downstream; P0의 조사 산출물이며 P2/P3 진입을 막는다.
- evidence: private workflow·고정 SHA·설치/기록 경로를 확인했다. 기본 네 조합부터 구현하고 Intel native 인수는 후속으로 둔다. hosted Windows/macOS가 우선 실증 후보이며 그 가용성·권한·운영 비용과 추가 채널·필수 승격 전환 시점은 미확정이다. 개인 Mac/Windows 부재 자체를 해결 조건으로 두지 않는다.
- affects: REQ-DCP-001, REQ-DCP-002, REQ-DCP-013, TASK-DCP0-01.
- impact: 존재하는 CI의 재작성, 누락된 leg의 오인, 다른 payload 결과 재사용 위험.
- unblock requirement: 기본 네 조합과 기존 source/local-bundle 채널의 phase/scenario 집합을 실제 runner에 연결하고, Codex 승격 적용 시점·추가 runner·예산·시간 정책을 확정한다. 수동 private CI를 정기 실행으로 임의 전환하지 않는다. Intel의 기존 검증은 유지하고 native 확대는 별도 후속으로 남긴다. 비밀값 본문은 읽거나 문서에 넣지 않는다.
- owner: 저장소 소유자와 후속 구현 담당자.
- stop condition: 해당 위치를 조회할 수 없거나 지원 범위가 충돌하면 그 조합의 구현·통과 선언을 중단한다. 다른 독립 문서/순수 계약 작업은 진행할 수 있다.

### BLK-DCP-02: Windows Codex와 추가 runner의 native 인증·실행

- classification: downstream; DCPR의 인증 상태 실증에 이어 P2의 제품 경로 실험으로 해소하며 P3의 선행 조건이다.
- evidence: 역할은 `childEnvironment`와 App Server를 사용하고 private Mac CI는 전용 로그인 홈을 직렬 사용한다. Windows CI의 지속 인증·loader 설치·browser 준비는 확인하지 않았다.
- affects: REQ-DCP-003, REQ-DCP-005, REQ-DCP-008, REQ-DCP-012, REQ-DCP-014, TASK-DCP2-01, TASK-DCP3-01.
- impact: generic CLI 성공만으로 제품 실행을 인증하거나 public PR에 자격을 노출할 위험.
- unblock requirement: BLK-DCP-05의 선행 조건으로 DCPR 인증 상태를 먼저 실증하고 P2의 후보 bundle 설치·실제 제품 경로의 최소 모델 실행·종료·재실행과 Windows 비관리자 권한을 확인한다. auth-only 성공은 이 blocker를 해소하지 않는다. 아직 얻지 않은 실험 성공을 그 실험 자체의 진입 조건으로 요구하지 않는다. live 실행은 해당 작업의 실행 지시 범위에서만 한다.
- owner: runner/계정 소유자와 후속 구현 담당자.
- stop condition: 일반 제품 경로로 인증·격리·종료를 증명하지 못하면 E2E나 스케줄 확대를 중단한다. 임의 allowlist 확장·다른 인증으로 대체하지 않는다.

### BLK-DCP-03: 기존 승인 작업과 template·이전 bundle 기준

- classification: downstream; P0에서 조정하며 P2 update/P3 Claude macOS 연결을 막는다.
- evidence: `ci-os-coverage`가 macOS Claude pipeline을 소유하고 R2 승격 뒤 진행하도록 정했다. namespace Core 문서는 completed지만 R2 활성화·Mac E2E 후속이 남고, template 설치 인수 후속 문서는 active다.
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

### BLK-DCP-05: 원격 인증 상태 보관과 실증 실행 조건

- classification: 순수 상태·관측 summary·판정 입력 계약은 저장본 검토와 2026-11-17 구현 지시를 거쳐 private 작업 브랜치에 구현했다. 이 범위의 합성 검증을 전체 readiness로 확대하지 않는다. provider/API·권한·한도·수집 운영 계약 미정은 실제 adapter·workflow 활성화·원격 실행을 별도로 막는다.
- evidence: 현재는 Mac 디스크의 전용 로그인과 로컬 raw 기록을 보존한다. private 저장소에 hosted 상태 복원/조건부 저장·원격 복구 구현은 없고 보관 서비스·권한·비용·실증 한도가 정해지지 않았다. 현재 CLI 0.167.1의 두 OS 실제 갱신 관측도 없다.
- affects: REQ-DCP-008, REQ-DCP-009, REQ-DCP-012, REQ-DCP-014, REQ-DCP-015, CON-DCP-005, TASK-DCP0-02, TASK-DCPR-01, TASK-DCPR-02.
- impact: stale credential 덮어쓰기·동시 갱신 충돌·취소 후 손실, 비밀값 유출, 원격 실행의 반복 수동 복구와 무제한 사용량 위험.
- unblock requirement: 서비스와 접근 주체, bootstrap/재인증 담당, CI 전용 로그인 사용 가능성, version 조건부 쓰기·배타 소유권·중단 상태 검출, 보관/폐기·복구 절차, 실제 native CLI 배포물과 갱신 관측 방법, 두 OS 사용 가능 여부, 실행별/전체 한도·비용과 실행 권한을 확정한다. 실제 서비스의 API·권한·실패 원자성을 확인하고 inventory/검증 명령에 반영한다. 제품 phase 확대 전에는 raw 진단의 private 원격 보관·조회·기간도 확정한다.
- owner: CI 계정/저장소 소유자와 후속 구현 담당자.
- stop condition: 모호한 보관 권한·갱신 상태·중복 소유권·실행 한도가 있으면 credential 제공과 모델 호출을 시작하지 않는다. 서비스 선택·과금·credential 이동을 문서 작성 승인으로 대신하지 않는다. 개인 기기 마련을 대기 조건으로 돌리지 않는다.

## Affected Files

2026-11-17 구현 범위는 private 순수 상태/관측 판정 모듈 두 개와 각 시험, `package.json`, `README.md`, 이 제안서의 진행 기록이다. 아래 표의 나머지는 후속 구현 inventory다. 공통 계약 두 파일은 기존 구현이며 Windows entrypoint·hosted 실행기/controller·native 시험·workflow는 아직 없다. 이동·삭제는 계획하지 않는다. private 변경은 별도 checkout과 브랜치에 보존한다. 새 hosted 순수 모듈은 private 조사 기준 revision에 없고 아직 작업 브랜치에만 있다.

| 경로/경계 | 변경 의도 | 근거·제약 |
| --- | --- | --- |
| `.github/workflows/client-init-smoke.yml`, `.github/workflows/pipeline-smoke.yml`, `.github/workflows/agent-eval.yml` | 확장 | Claude 경로·macOS 소유권 보존, PR paths·출력·private 원문 조건 연결 |
| private `.github/workflows/codex-ci.yml`, `ci-target.json`, `scripts/run-codex-ci.mjs`, `scripts/run-codex-ci.test.mjs`, `README.md`, `package.json` | 확장 | 기존 phase 선택·설치·입력 고정 재사용. DCP2 제품 hosted 전환은 인증 실증과 구분하며 OS별 준비와 check 문법 검사를 함께 연결 |
| private `.github/workflows/codex-hosted-auth-proof.yml` | 제안: DCPR 추가 | private owner/dev 수동 진입·두 OS 직렬 실행·상태 보관/정리. workflow inputs·서비스 접근 권한은 BLK-DCP-05 해소 뒤 고정 |
| private `scripts/codex-hosted-auth-proof.mjs`, `scripts/codex-hosted-auth-proof.test.mjs` | DCPR 순수 관측 parser·판정 구현, I/O 후속 | allowlist 요약·trusted 출처/시각 입력과 앞뒤 run·실패/재시도의 일대일 검증. host별 preflight·CLI 최소 실행/종료·실제 GitHub 수집은 미구현. 기존 `EXPECTED`, `VERSION`, `streamResult`는 I/O 구현 때 계약 대조 후 재사용; Mac 전용 guard/프로세스 구현을 Windows에 전용하지 않음 |
| private `scripts/codex-hosted-auth-native.test.mjs` | 제안: DCPR 추가 | 양 OS의 실제 임시 홈·ACL/mode·경로 별칭·자식 프로세스 종료를 가짜 CLI와 합성 인증으로 검증. 제품 LPAC/Seatbelt·실제 모델 인수와 구분 |
| private `scripts/codex-auth-state.mjs`, `scripts/codex-auth-state.test.mjs` | DCPR 순수 parser·전이 intent 구현, I/O 후속 | 배타 소유권 metadata·조건부 쓰기 intent·중단/복구 상태. 실제 복원·CAS 저장·controller 순서 검증은 미구현. 서비스 미정인 부분을 동작하는 것처럼 구현하지 않음 |
| private `.github/workflows/codex-auth-smoke.yml`, `scripts/codex-auth-smoke.mjs`, `scripts/codex-auth-smoke.test.mjs`, `scripts/start-runner.mjs` | 기존 Mac 계약과 구현된 phase 선택 보존 | 독립 auth-smoke workflow는 항상 실제 모델 1 turn이다. `codex-ci`/launcher의 init 선택만 모델 인증 검사를 생략하며 모델 phase는 `--run-models`를 명시한다. `executionArguments`의 실행 전 제한을 새 host에 이식하되 Mac 경로/프로세스 구현은 그대로 복사하지 않음 |
| private `scripts/init-evidence.mjs`, `scripts/init-evidence.test.mjs`, `scripts/collect-init-evidence.mjs`, `.github/workflows/check.yml` | 기존 구현 재사용·필요한 확장 | 고정 public contract를 쓰는 init adapter·단일 run 읽기 전용 수집기·출처 거부 시험. 허용 필드 artifact만 private에 보관하며 후보 전체 승격 consumer와 구분한다. 새 모델 없는 host 시험도 check와 OS coverage에 연결 |

private `check.yml`에는 기존 Ubuntu `check`를 유지하고 `native-host` job을 추가하는 계획이다. `windows-2022` x64·`macos-15` arm64, Node 22에서 `node --test scripts/codex-hosted-auth-native.test.mjs`를 실행하며 secret·실제 Codex 로그인·모델 호출·auth store 접근은 없다. 기존 POSIX 전용 auth suite 전체를 Windows로 옮기지 않는다. Linux 순수 시험에서는 native 사례의 미실행을 구분하고, 해당 OS의 `native-host`에서는 필수 사례 skip을 통과로 세지 않는다. 구현 시 private README와 `verification.md`에 외부 per-OS check로 두 leg를 기록하고 workflow 계약 시험으로 양 OS·명령·권한을 확인한다. 현재 public `verify:ci-coverage`의 13 jobs와 이 외부 검증의 증거를 섞지 않는다.

| 경로/경계 | 변경 의도 | 근거·제약 |
| --- | --- | --- |
| `scripts/rehearsals/rehearse-client-init-smoke.ts`, `scripts/rehearsals/rehearse-client-init-smoke.test.ts`, `scripts/rehearsals/client-init-smoke-steps.mjs`, `scripts/rehearsals/client-init-smoke-steps.test.mjs` | 확장 | 실제 cache·source identity·bundle/new-user/update 판정 |
| `scripts/rehearsals/rehearse-pipeline-smoke.ts`, `scripts/rehearsals/rehearse-pipeline-smoke.test.ts`, `scripts/rehearsals/pipeline-smoke-steps.mjs`, `scripts/rehearsals/pipeline-smoke-steps.test.mjs` | 확장 | 공통 사례·terminal·lifecycle·승격 선택 규칙 |
| `scripts/rehearsals/rehearse-codex-macos.mjs`, `scripts/rehearsals/rehearse-codex-macos.test.mjs` | 보존·부분 추출 | 기존 init/eval/pipeline·QA/scout와 진단 보존, cleanup 증거 보완 |
| `scripts/rehearsals/rehearse-codex-windows.mjs`, `scripts/rehearsals/rehearse-codex-windows.test.mjs` | 제안: 추가 | Windows native 설치/pipeline. eval은 검증된 Mac 경로 유지 |
| `scripts/rehearsals/client-ci-contract.mjs`, `scripts/rehearsals/client-ci-contract.test.mjs` | 기존 구현 재사용 | 명시적 expected 집합과 증거를 받는 순수 정규화·후보 판정. 네트워크·모델·게시 없음. auth 실증 상세는 별도 scope이며 제품 PASS로 입력하지 않음 |
| `scripts/rehearsals/codex-init-eval.mjs`, `scripts/rehearsals/codex-init-eval.test.mjs` | 보존·필요한 결과 연결 | Mac native preflight·쓰기 대조군·파일 판정 유지 |
| `scripts/rehearsals/gate-environment.mjs`, `scripts/rehearsals/gate-environment.test.mjs`, `scripts/rehearsals/gate-record.mjs`, `scripts/rehearsals/gate-record.test.mjs`, `.github/actions/gate-record/action.yml` | 확장 | client 버전·identity·진단·과거 row 호환, 실행/기록 attempt 분리와 최종 consumer |
| `scripts/rehearsals/agent-eval-summary.mjs`, `scripts/rehearsals/agent-eval-summary.test.mjs` | 확장 | 전체/부분 eval 구분, 허용 필드·workflow 로그 경계 검증 |
| `plugin/evals/control-real-write/case.yaml`, `plugin/evals/control-real-write/fixture.sh`, `plugin/evals/first-connection-asks-before-register/case.yaml`, `plugin/evals/first-connection-asks-before-register/fixture.sh`, `plugin/evals/first-connection-asks-before-writing/case.yaml`, `plugin/evals/first-connection-asks-before-writing/fixture.sh`, `plugin/evals/rerun-asks-first/case.yaml`, `plugin/evals/rerun-asks-first/fixture.sh`, `plugin/evals/fixtures/templates/` | 읽기·보존 | 기존 Claude 1개 대조군과 3개 gate 사례 및 fixture. 실제 목록은 source commit으로 고정하며 이번 계획에서 case 본문을 바꾸지 않음 |
| `scripts/checks/verify-ci-coverage.mjs`, `scripts/checks/verify-ci-coverage.test.mjs` | 확장 | public OS 표·job/leg와 client 계약 연결. 외부 CI provenance를 로컬 파서로 인증하지 않음 |
| `scripts/windows/package-windows-plugin.mjs`, `scripts/windows/package-windows-plugin.test.mjs`, `scripts/macos/package-plugin.mjs`, `scripts/macos/package-plugin.test.mjs` | 우선 재사용 | 기존 inventory 의미 보존. 변경 필요 시 사유·판 영향 명시 |
| `.github/actions/smoke-database/action.yml`, `scripts/rehearsals/prepare-codex-macos-database.mjs`, `scripts/rehearsals/inspect-codex-macos.mjs` | 재사용 경계 | 소유 DB·복구 조건 보존. Intel/Windows 추가 준비는 host 결정 뒤 구체화 |
| `docs/architecture/verification.md`, `docs/architecture/server.md`, `AGENTS.md` | 구현과 함께 갱신 | 새 job은 per-OS로 두 OS·client·미충족/후속을 함께 기록. private workflow 출처와 auth-only 범위를 명시하며 기존 public coverage 검사의 PASS로 외부 검증을 대신하지 않음. 운영 활성화 시 원격 인증/진단 보관 계약, 필요할 때만 server 내부 import·승격 trigger 갱신 |
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
| `executionArguments`, `clientEnvironment`, `streamResult` | private `scripts/codex-auth-smoke.mjs`의 기존 export | 새 `codex-hosted-auth-proof.mjs`는 도구/환경 차단 의미를 이식하고 event parser를 재사용. `codex-hosted-auth-proof.test.mjs`의 설정·환경 거부와 별도 native 시험으로 확인 |
| `parseAuthState`, `planAuthTransition` | private `scripts/codex-auth-state.mjs`의 작업 브랜치 구현 | 후속 hosted controller가 구조/전이 판정만 소비. 순수 시험은 구현했고 실제 상태/파일/종료와 controller 순서 시험은 남음 |
| `parseHostedAuthObservation`, `evaluateHostedAuthProof` | private `scripts/codex-hosted-auth-proof.mjs`의 작업 브랜치 구현 | 관측 요약과 trusted 수집 입력의 경계. 같은 파일의 시험에서 합성 두 OS의 앞뒤 실행·실패/재시도 순서와 일대일 연결, 허위 PASS·unknown 값 거부 |

제품 `src/`, schema, 출하 `plugin/` 동작·권한·manifest 판 변경은 기본 범위 밖이다. 결함 수정이 필요하면 별도 write set과 회귀 검증, plugin version 계약을 추가한다. 새 직접 의존성, 개인 인증/설정, 운영 template/DB와 기존 테스트의 일괄 재배치는 허용하지 않는다.

## Execution Plan

우선순위는 DCP0의 실행 계약 문서화·검토 → DCPR의 코드 구현·합성 검증 → DCPR의 실제 원격 실증 → DCP2 → DCP3/DCP4다. DCP1의 이미 구현된 판정기를 다시 만드는 작업은 없다. 합성 시험은 native 성공 증거를 요구하지 않으며, 실제 실행의 운영 선행 조건은 해당 진입 시점에 확인한다.

문서가 먼저다. 여기서 실행 조건의 구체화는 TASK-DCP0-02의 결정을 이 문서에 기록하고 검토하는 작업이며, 그 결정을 코드로 먼저 구현한 뒤 문서를 맞추는 작업을 뜻하지 않는다. 조사 과정에서 확인한 사실, 선택한 설계, 미확정 사항과 실제 실행 증거를 구분한다. 새로운 문서를 별도로 만들지 않고 이 문서의 설계·inventory·작업·검증·blocker에 같은 결정을 반영한다.

구현 진입은 범위별로 판단한다. 순수 합성 구현은 상태·summary 계약, 성공/실패/중단 판정, 대상 파일과 검증 경로를 먼저 문서화하고 검토한 뒤 진행한다. 실제 provider adapter와 원격 실행은 각각에 필요한 서비스·권한·운영 조건까지 확정해야 한다. 외부 준비가 미정이어도 문서 조사·검토는 계속할 수 있으나, 그 미정을 숨겨 의존 구현이나 실행을 시작하지 않는다. 단계 전환 때 기존 승인 범위와 남은 blocker를 확인하며, 이미 승인된 범위에 대해 승인을 반복 요청하지 않는다.

### Phase DCP0: 실행 범위와 선행 조건 확정

- status: In progress. 기본 네 조합·Intel 후속과 hosted 우선 실증 방향을 기록했다. 인증 보관 서비스·한도·필수 승격 전환·기존 template 선행 조건은 남아 있다.
- satisfies: REQ-DCP-001, REQ-DCP-008, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013, REQ-DCP-014, REQ-DCP-015
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-004, CON-DCP-005
- verifies: REQ-DCP-001, REQ-DCP-008, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013, REQ-DCP-014, REQ-DCP-015
- entry/exit: 구현 지시 → 필수 조합·private 출처·기존 작업 소유권·사전 실행 조건이 문서화됨. 이미 확인한 private revision을 재사용하되 변경 여부를 확인한다. 기본 네 조합/기존 채널과 Intel 후속 순서는 확정했다. Windows host·계정 예산·승격 적용 시점·30분 운영 규칙과 private job의 관계가 결정되지 않으면 이 단계가 완료된 것이 아니다. 이 단계의 문서 검토는 실제 CI 통과 증거가 아니다.
- blockers: BLK-DCP-01, BLK-DCP-03, BLK-DCP-05를 구체화하며 BLK-DCP-02, BLK-DCP-04는 해당 다음 단계의 선행 조건으로 남긴다. auth-only DCPR에는 제품 template·이전 bundle을 요구하지 않는다.

#### TASK-DCP0-01: 지원 조합과 외부 실행 계약 확인

- satisfies: REQ-DCP-001, REQ-DCP-008, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-004
- destination: 이 문서의 지원 표·Blockers·실행 정책, 확인된 private workflow와 기존 승인 작업의 참조.
- verification destination: VFY-DCP-01의 source/run/권한 inventory와 위험 검토.
- stop condition: 접근·지원 결정·기존 승인 범위를 추정해야 하면 의존 작업을 시작하지 않는다.

#### TASK-DCP0-02: 원격 실증의 실행 계약 확정

- work type: 문서 작업. 아래 산출물을 이 문서에 반영·검토하는 것이 먼저이며 코드·workflow 구현과 실제 실행은 DCPR의 별도 작업이다.
- satisfies: REQ-DCP-008, REQ-DCP-009, REQ-DCP-012, REQ-DCP-014, REQ-DCP-015
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-005
- destination: 이 문서의 원격 실증·BLK-DCP-05·private 파일 inventory. provider/API/권한·최초 등록/갱신/폐기·원격 상태 및 summary schema·run 연결·실행 한도·실제 명령을 확정한다. 실제 운영 활성화 변경에서는 private README와 architecture의 해당 계약을 함께 갱신한다.
- verification destination: VFY-DCP-01, VFY-DCP-10/11의 선행 계약. 서비스의 실패/충돌 의미와 credential 없이 가능한 거부 시험 경로를 확인한다.
- stop condition: 비용·접근 권한·원자성·갱신 관측 방법을 추정해야 하면 미확정 항목을 유지하고 의존 실행을 하지 않는다.

문서 확정에 필요한 산출물은 다음과 같다. 아래 표는 조사·결정할 범위를 정하며, 서비스 선택이나 구현 완료의 증거가 아니다.

| 문서 산출물 | 기록해야 할 내용 | 현재 상태와 의존 작업 |
| --- | --- | --- |
| 보관 서비스와 접근 계약 | 선택 근거, 실제 API, CI 접근 주체·최소 권한, version 조건부 쓰기·배타 소유권·충돌/응답 유실 처리 | 서비스 미정. provider adapter 구현 전에 확정 |
| 순수 상태·요약 계약 | 상태·필드·전이·소유권, 제어 revision/인증 version/쓰기 작업 ID, 오류별 판정, allowlist 결과와 앞뒤 run 연결, 합성 대조 사례 | 본문의 상태/관측 schema 1·expected/executions·함수·대조 조건을 검토한 뒤 TASK-DCPR-01의 순수 구현과 시험에 반영함. provider/수집 운영 준비 완료와 구분 |
| 인증 운영과 복구 | 전용 로그인 최초 등록·재인증 담당, 정상 갱신 후 저장·재사용, 중단 시 차단과 복구, 보관 기간·폐기 | provider별 절차 미정. credential 제공과 실제 실행 전에 확정 |
| 실행·사용량 계약 | 실제 workflow inputs, 두 OS runner 선택, 실행별·전체 한도와 단위·강제 위치, CLI 시작/완료 turn/API 요청 구분, 내부 retry 통제, 동시 실행 범위, 비용 확인과 중단 조건 | 실제 inputs와 한도 미정. workflow 구현에 필요한 계약부터 확정하고 실행 전 적용 확인 |
| 갱신 관측과 검증 인계 | 고정 CLI의 정상 갱신·파일 저장·권한 제한 관측, 갱신 미관측 처리, 실제 실행/읽기 전용 수집 명령, artifact 명칭·기간·출처 검증, 대상 파일·verifier·완료 증거 | 관측 방법과 실제 명령 미정. VFY-DCP-10/11에 연결하며 계획을 PASS로 기록하지 않음 |

- exit evidence: 각 산출물의 결정·근거·미확정 사유와 차단되는 작업을 기록하고, 영향받는 설계·파일 inventory·verifier·BLK-DCP-05를 함께 갱신한 저장본을 검토한다. 일부 계약만 확정됐으면 해당 합성 구현 범위만 구분해 인계하며 TASK-DCP0-02 전체 완료로 표시하지 않는다. 문서 형식 검사 통과만으로 계약 확정이나 실제 실행 준비 완료를 선언하지 않는다.

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
- destination: 기존 `client-ci-contract.mjs`와 시험, 환경/요약 모듈을 재사용한다. 남은 public/private 입력 adapter가 server/plugin/workflow SHA와 phase별 identity를 구분하고 명시적 expected 집합으로 판정한다. 실행 출처와 record 출처를 분리하고 같은 실행의 동일 재기록만 한 번으로 집계한다. `safeResult`의 성공 배열만 입력하는 우회 경로는 두지 않는다.
- verification destination: VFY-DCP-02; 기존 `node --test scripts/rehearsals/client-ci-contract.test.mjs`.
- stop condition: 정보 손실 없이 기존 요약을 읽을 수 없으면 schema와 consumer를 함께 수정한다. fake PASS/기본값으로 넘기지 않는다.

### Phase DCPR: hosted 인증 상태와 새 runner 재실행 실증

- status: In progress. TASK-DCPR-01의 순수 상태·관측 parser·판정기와 합성 시험을 작업 브랜치에 구현했다. controller·host adapter/native 시험·실제 provider·workflow/수집은 남았으며 실제 서비스/credential 사용의 진입 조건을 구분한다.
- satisfies: REQ-DCP-008, REQ-DCP-009, REQ-DCP-012, REQ-DCP-014, REQ-DCP-015
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-003, CON-DCP-004, CON-DCP-005
- verifies: REQ-DCP-008, REQ-DCP-009, REQ-DCP-012, REQ-DCP-014, REQ-DCP-015
- entry/exit: 합성 구현은 TASK-DCP0-02에서 순수 상태·summary 계약과 검증 경로를 문서화·검토한 뒤 시작한다. 실제 adapter/원격 실행은 BLK-DCP-05의 준비 계약 확인 뒤 시작한다. 종료 기준은 두 OS 각각의 실제 갱신·원격 상태 저장·새 VM 계승·모델 실행·정리 및 실패 후 차단 증거다. API key 대체와 제품 인수 승격은 없다.
- blockers: BLK-DCP-05. BLK-DCP-02의 제품 역할 경계·BLK-DCP-03의 update/template·BLK-DCP-04의 승격 consumer는 이 auth-only 실증의 범위 밖이며 그대로 남는다.

#### TASK-DCPR-01: 상태 관리·host adapter·실증 판정 구현

- satisfies: REQ-DCP-008, REQ-DCP-009, REQ-DCP-012, REQ-DCP-014, REQ-DCP-015
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-003, CON-DCP-005
- destination: 제안 private `codex-auth-state.mjs`, `codex-hosted-auth-proof.mjs`와 각 `.test.mjs`, `codex-hosted-auth-native.test.mjs`, `package.json`의 기존 check 및 `check.yml`의 제안 `native-host` job. 본문의 schema 1·제안 순수 함수 계약을 구현하며 기존 public schema 2의 의미는 바꾸지 않는다. 실행기와 읽기 전용 수집 모드를 분리하고, 새 workflow의 YAML inputs/permissions/job 집합도 구조적으로 검증한다. credential/실제 provider를 쓰지 않는 상태·출처·OS 권한 거부부터 구현하며, 판정기는 trusted job 시각으로 갱신 쌍과 실패/재시도의 순서·일대일 연결을 검사한다.
- verification destination: VFY-DCP-10. 새 파일 생성 후 private checkout에서 `node --test scripts/codex-auth-state.test.mjs scripts/codex-hosted-auth-proof.test.mjs`; OS별 job에서는 `node --test scripts/codex-hosted-auth-native.test.mjs`. 모두 실제 모델/외부 쓰기 없는 검사다. 가짜 CLI를 사용해도 OS ACL/프로세스 API는 실제 해당 OS에서 실행하며 모의 결과로 대체하지 않는다.
- stop condition: 순수 상태·summary 계약과 검증 경로의 문서 검토가 끝나기 전에 합성 구현을 시작하지 않는다. 실제 provider 계약이 미확정이면 adapter 연결과 외부 쓰기를 보류한다. 단위 시험 통과를 hosted/native PASS로 보고하지 않는다.

#### TASK-DCPR-02: 두 OS의 제한된 실제 실행과 판정

- satisfies: REQ-DCP-008, REQ-DCP-009, REQ-DCP-012, REQ-DCP-014, REQ-DCP-015
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-004, CON-DCP-005
- destination: 제안 private `codex-hosted-auth-proof.yml`, 확정된 auth state adapter와 allowlist 결과, private README, 구현 시 architecture의 외부 CI coverage/운영 계약. 개인 기기의 runner launcher를 사용하지 않는다.
- verification destination: VFY-DCP-11. reviewed private dev의 정확한 workflow/CLI identity와 상태 version으로 앞뒤 실행을 연결한다. remote dispatch 명령은 TASK-DCP0-02에서 실제 inputs와 실행 한도 확정 후 기록한다.
- stop condition: 복구 필요 상태·갱신 미관측·권한 미확인·저장 실패·사용량 한도 도달이면 확대를 멈춘다. hosted 고유 제약의 근거가 있어야 전용 원격 runner를 검토한다. 단순 테스트 실패를 이유로 구독/격리 기준을 낮추지 않는다.

### Phase DCP2: 실제 배포물 설치·update와 native 사전 검증

- status: Proposed; 해당 조합의 BLK-DCP-01, BLK-DCP-03과 원격 운영 조건 확인 뒤 설치 실험에 진입한다. 모델 없는 init은 인증 갱신 완료를 요구하지 않는다. 모델을 사용하는 제품 경로 확대는 DCPR 완료와 BLK-DCP-05의 원격 진단 보관 조건을 요구하며, 그 제품 실험의 성공이 BLK-DCP-02를 해소한다.
- satisfies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-008, REQ-DCP-012, REQ-DCP-014
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-003, CON-DCP-005
- verifies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-008, REQ-DCP-012, REQ-DCP-014
- entry/exit: 신뢰 runner·후보/이전 artifact·template 고정 → 필수 설치 조합의 신규/update 결과와 최소 native 인증·실행·종료 증거. 최소 모델 실험과 init 모델 없음 판정을 구분한다.

#### TASK-DCP2-01: Codex Windows 경로와 설치 검증 연결

- satisfies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-008, REQ-DCP-012, REQ-DCP-014
- preserves: INV-DCP-001, INV-DCP-002
- governed-by: CON-DCP-002, CON-DCP-003, CON-DCP-004, CON-DCP-005
- destination: 기존 init/macOS 리허설, 제안 Windows 리허설, 기존 package 생성기와 private `run-codex-ci.mjs`/`codex-ci.yml` 준비 단계. 빈 cache 후보 설치와 이전 설치의 update를 분리하고 모델 없는 init phase 선택을 연결한다. source/bundle 채널별 예상 payload와 적용할 runtime·hooks·verifier 조건을 분리한다. Windows의 홈·환경·프로세스·browser 준비는 Mac eval 코드를 복사하지 않고 해당 host 증거로 확정한다.
- verification destination: VFY-DCP-03, VFY-DCP-04. 실제 실행 명령은 runner·artifact 확정 뒤 해당 CLI와 workflow 입력에 맞춰 이 문서에 고정한다.
- stop condition: 설치 loader를 생략하거나 현재 개발 PC의 사용자 설정을 바꿔야 하면 중단한다. credential 유지/폐기와 안전한 종료를 증명하지 못하면 P3으로 가지 않는다.

### Phase DCP3: 실제 모델과 lifecycle 동등화

- status: Proposed; P2 설치·native preflight 완료 후 진행. 기존 Claude macOS leg 작업의 선행 조건 보존.
- satisfies: REQ-DCP-005, REQ-DCP-006, REQ-DCP-007, REQ-DCP-008, REQ-DCP-012
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-002, CON-DCP-003, CON-DCP-004, CON-DCP-005
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
- destination: 기존 Mac `codex-init-eval.mjs`, client별 lifecycle 리허설과 시험. Claude `agent-eval.yml`/`agent-eval-summary.mjs`와 시험의 대조군·gate 사례·구현된 허용 필드 요약을 보존한다. Windows 모델 eval 추가는 이 단계의 기본 요구가 아니다.
- verification destination: VFY-DCP-06, VFY-DCP-07; 실제 상태 checkpoint로 취소/재개 시점을 잡는다.
- stop condition: 실제 쓰기 대조군이 실패하면 평가 결과를 채택하지 않는다. 소유 process/lock 정리가 미확인이면 자원 정리 성공으로 보고하지 않는다.

### Phase DCP4: workflow·기록·배포 조건 연결과 인수

- status: Proposed; BLK-DCP-04 해소 및 필수 조합의 P2/P3 증거 필요.
- satisfies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013, REQ-DCP-014, REQ-DCP-015
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-003, CON-DCP-004, CON-DCP-005
- verifies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013, REQ-DCP-014, REQ-DCP-015
- entry/exit: private 출처/권한 계약과 설치·모델 증거 → 필수 결과 누락/검토 미해결을 거부하는 기록·승격 검사, 정확한 후보의 통과 기록, 비용/시간 및 남은 범위 보고.

#### TASK-DCP4-01: public/private 증거 수집과 배포 판단 연결

- satisfies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-013
- preserves: INV-DCP-001, INV-DCP-002, INV-DCP-003
- governed-by: CON-DCP-002, CON-DCP-003, CON-DCP-004
- destination: `gate-record.mjs`·허용 필드 필터·gate-record action·coverage 검사와 시험, private `run-codex-ci.mjs`의 결과와 연결할 trusted consumer, verification 및 AGENTS 조회 절. consumer의 정확한 실행 주체·파일·검토 기록 위치는 BLK-DCP-04 해소 시 이 inventory에 고정해야 한다. public coverage 파서에 self-hosted labels를 무검증으로 허용하지 않는다.
- verification destination: VFY-DCP-02, VFY-DCP-08. 공개/비공개 기록의 스키마·출처·필수 집합을 함께 대조. record 재실행에서도 원래 leg 실행·결과·검토 연결이 유지되는지 확인.
- stop condition: 임의 JSON·다른 후보·접근 실패를 승인 가능한 증거로 취급해야 한다면 중단한다. 기존 실패 이력과 gate issue는 보존한다.

#### TASK-DCP4-02: 실행 정책 적용과 최종 인수

- satisfies: REQ-DCP-010, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013, REQ-DCP-014, REQ-DCP-015
- preserves: INV-DCP-001, INV-DCP-003
- governed-by: CON-DCP-001, CON-DCP-003, CON-DCP-004, CON-DCP-005
- destination: 확인된 workflows와 `ci-target.json`, architecture coverage 표, AGENTS 승격 trigger 경로와 `pipeline-smoke-steps.test.mjs`, 관련 제안의 상태 조정, 실제 결과 보고서. P0의 결정 전 정기 실행 빈도나 Codex 필수 gate 적용을 임의로 활성화하지 않는다.
- verification destination: VFY-DCP-08, VFY-DCP-09. 첫 동일 후보의 필수 집합 전부를 검증하고 허용된 재사용/재시도 사유를 남긴다.
- stop condition: 모든 필수 조합이 증거와 연결되지 않으면 전체 동등화 완료를 선언하지 않는다. 구현 인수 완료와 실제 main 승격은 별개다.

## Verification Plan

아래 verifier의 전체 native 인수는 **Planned**다. VFY-DCP-02의 순수 계약과 summary 회귀 등 실행한 부분은 Implementation Progress에 따로 기록한다. 부분 검증을 verifier 전체 PASS로 확대하지 않는다.

### VFY-DCP-01: 지원·출처·운영 계약 검토

- verifies: REQ-DCP-001, REQ-DCP-008, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013
- category/destination: contract; 현재 architecture, active 소유 작업, 확인된 private workflow와 runner inventory.
- expected: Windows/macOS 양 client, architecture/channel, phase/scenario 필수 집합, server/plugin/workflow/template 고정, 계정/홈 소유권, 예산, 시간 정책, 기록 출처, 변경 선택 규칙과 승격 적용 시점이 구체적으로 결정됨. 읽은 private revision과 현재 revision의 차이를 대조함. 불명확한 사항은 blocker로 남고 실행 승인을 대신하지 않음.
- remote prerequisite: TASK-DCP0-02의 문서 산출물과 BLK-DCP-05의 provider/최소 권한·조건부 갱신·중단 복구·보관/폐기·실행 한도·고정 CLI 관측 방법을 실제 소스/공식 계약과 대조한다. 확정·미정 항목과 각각 차단되는 구현/실행 범위가 설계·inventory·verifier에 일치하는지 확인한다. 계정 토큰 본문은 조사 출력에 남기지 않는다.

### VFY-DCP-02: identity·누락·오염과 기존 기록 호환

- verifies: REQ-DCP-001, REQ-DCP-002, REQ-DCP-009, REQ-DCP-010, REQ-DCP-013
- category/destination: unit/contract; 기존 `client-ci-contract.test.mjs`, `gate-environment.test.mjs`, `gate-record.test.mjs`, summary 시험.
- expected: 실패한 raw Codex 요약, 인증 실패, package hash 변경, 다른 template/server/plugin/workflow SHA, architecture 누락, duplicate/missing leg, cancelled/skip/running, extra 필드의 secret, 미해결 review가 배포 PASS가 되지 않음. `codex-cli 0.167.1`이 누락되지 않으며 auth summary의 `sourceCommit`을 제품 SHA로 오인하지 않음. 성공 phase 배열이 완성됐어도 전체 job·fixture/DB 정리가 실패하면 거부함. `agent-eval`의 일부 case 선택 성공을 전체 gate eval 성공으로 세지 않음. 알려진 phase의 비해당 자원은 허용하지만 필요한 identity/cleanup을 비해당으로 위장하면 거부함. 기존 Claude row는 기존 의미로 읽고 과거 identity 부족 row를 새 배포 증거로 승격하지 않음.
- retry cases: gate 실행 attempt 1의 결과를 record attempt 2가 게시해도 실행 identity와 사용량은 그대로이며, 동일 결과 재게시로 필수 leg가 늘거나 실패하지 않음. 같은 출처의 충돌 결과·출처 없는 attempt 치환은 거부함. 부분 재실행으로 leg별 실행 attempt가 다른 경우 실제 출처를 보존함. 이전 green 뒤 새 실패/진단이 있거나 검토가 다른 결과에 속하면 자동 통과하지 않음. 허용된 모델 재시도는 원래 실패·사유·선택한 결과를 함께 유지함.

### VFY-DCP-03: 실제 신규 설치와 update

- verifies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-008
- category/destination: native integration; 승인된 각 runner의 실제 loader·설치 cache·기존 package 생성기와 init 리허설.
- expected: 빈 cache에서 후보만 설치한 신규 설치와 이전 연결에서 update를 각각 확인함. 실제 cache의 OS별 inventory/source/runtime/verifier·hooks 일치, 사용자 수정·양 client 설정 보존, template pin/cutover 준수, dry-run 무변경, bundle helper의 global Node 비의존. init 전용 workflow의 auth smoke까지 포함해 모델 호출 0. 이전 artifact 부재/손상, version이 같은 다른 payload, 누락/추가 파일·변조·Mac 실행 mode 손상은 거부함. manifest 자체는 inventory hash 대상 밖임을 유지하고 이전 source 재생성 fixture와 실제 배포 artifact 인수를 구분함.
- channel boundary: Claude source 설치는 검토한 commit의 source payload와 실제 cache를 대조하고 PATH Node 예외를 유지함. 생성 runtime·bundle hash·Codex용 생성 verifier 사본을 필수로 요구하지 않음. `evals/`·`.test.mjs` 제외는 현재 OS bundle 생성기의 계약이므로 source loader에도 같은 필터가 적용됐다고 가정하지 않음. 채널별 예상 payload 밖의 누락·변조는 거부함.
- private input boundary: 신뢰된 runner의 별도 template checkout과 설치 payload를 구별함. 기존 `plugin/templates` checkout이 있어도 private 원본은 설치 cache에 섞이지 않으며, bundle에는 생성기의 template·eval·test-only 제외 규칙이 적용됨. 공개 로그·기록·artifact에 private 본문이 유출되지 않음.

### VFY-DCP-04: native 인증·최소 실행·자원 정리

- verifies: REQ-DCP-005, REQ-DCP-007, REQ-DCP-008, REQ-DCP-012, REQ-DCP-014
- category/destination: native security/integration; 설치된 Codex helper·실제 App Server·역할 bridge와 승인된 CI 전용 인증 홈.
- expected: 역할 격리와 인증 경계를 유지한 최소 실행·종료·다음 실행 성공, 인증 부재/갱신 복구 불가 시 모델 의존 mutation 없이 실패, 소유 process/lock 정리. Windows 실제 역할의 effective home/profile을 확인하고 인증 파일은 합성 deny canary로 읽기 거부를 검증함. `CODEX_HOME`만 바꾸거나 개인 auth cache를 복사한 성공은 거부함. 개인 인증이나 production 환경을 사용하지 않으며 시간/제공되는 usage와 계정 점유를 기록함.
- remote boundary: DCPR과 구분해 실제 설치 cache의 helper와 App Server/role bridge를 통과한다. Windows에서 setup 관리자와 제품 실행 비관리자 identity를 분리하고 effective token·홈·ACL·LPAC deny를 관측한다. hosted 환경에서 이 경계를 만들 수 없으면 해당 제품 인수는 미충족이다. macOS도 실제 Seatbelt 경계를 유지한다.

### VFY-DCP-05: 공통 pipeline과 추가 역할

- verifies: REQ-DCP-002, REQ-DCP-005, REQ-DCP-012
- category/destination: 실제 모델 통합; 기존 `pipeline-smoke-steps.mjs`의 독립 사례, client별 native pipeline 리허설.
- expected: `slug` 공통 baseline의 독립 결과, 구성한 필수 역할의 accepted terminal outcome, 계획/보고서/구현 commit 대응, native 검증 명령 성공, runner 정리. 기존 `truncate` 회귀와 Codex QA/scout 범위 보존. 조건이 다른 결과를 역할 개수나 총 비용만으로 동등 판정하지 않음.

### VFY-DCP-06: init 스킬 모델 행동

- verifies: REQ-DCP-006, REQ-DCP-008, REQ-DCP-009
- category/destination: eval; 기존 Claude 대조군/사례와 `codex-init-eval.mjs`·시험, client별 허용된 trusted host.
- expected: 쓰기 대조군 1회와 기존 필수 사례별 3회 판정 유지. 승인 전 쓰기 금지 등 client별 계약을 실제 파일·mtime·도구/완료 이벤트로 판단. 테스트가 코드를 검출하는 양성/음성 대조 유지. public stdout/stderr/job summary에 합성 민감 문자열을 포함한 shell/assistant 원문이 나오지 않음. 이미 반영된 architecture의 원문 비공개 계약을 보존하며 새 진단 보관 경로를 추가할 때만 함께 갱신함.

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

- verifies: REQ-DCP-002, REQ-DCP-003, REQ-DCP-004, REQ-DCP-005, REQ-DCP-006, REQ-DCP-007, REQ-DCP-008, REQ-DCP-009, REQ-DCP-010, REQ-DCP-011, REQ-DCP-012, REQ-DCP-013, REQ-DCP-014, REQ-DCP-015
- category/destination: architecture/static/build 및 실제 CI; 아래 기존 명령과 필수 후보별 VFY-DCP-03부터 VFY-DCP-08까지의 기록을 조합한다.
- expected: 변경 관련 회귀와 필수 실제 결과가 같은 후보에 연결되고 미해결 review가 없음. 정적 검사만으로 이 verifier 전체를 PASS로 기록하지 않음. 비용·시간·실패/skip·보관/정리 상태를 인수 보고서에 남김.
- remote completion: 개인 기기 launcher·공유 개인 홈 없이 네 기본 조합의 실행/조회가 가능하고, DCPR의 상태 보존과 DCP2의 제품 권한/설치 검증이 실제 pipeline에서도 유지됨을 확인한다. raw 진단의 원격 검토·실패 후 차단·동일 로그인 충돌 방지와 지원 OS/권한 범위를 보고한다.

### VFY-DCP-10: 원격 인증 상태·출처·복구의 합성 검사

- verifies: REQ-DCP-008, REQ-DCP-009, REQ-DCP-012, REQ-DCP-014, REQ-DCP-015
- category/destination: unit/contract; private `codex-auth-state.test.mjs`, `codex-hosted-auth-proof.test.mjs`와 기존 Ubuntu check에 연결했다. 실제 OS ACL/process 항목은 후속 `codex-hosted-auth-native.test.mjs`와 제안 `check/native-host` 양 OS job에서 모델 없이 확인한다. 현재 합성 통과는 이 verifier의 순수 계약 부분만 충족한다.
- expected: 정상 version 계승과 오래된 writer/동시 획득/저장 응답 유실/중단 후 재진입/seed 덮어쓰기 거부. 소유권 획득 전 거부는 원격 무변경, 획득 후 실패는 허용된 제어 상태 전이·인증 payload 보존·홈 정리를 확인한다. CLI 시작 전이라도 인증 손상/부재/검증 불가는 `ready`로 되돌리지 않는다. 실행 시도 표시 전후 중단, `turn.started` 없는 종료, 저장 후 정리 실패, 원격 전체 장애와 늦은 writer에서도 복구 확인 전 모델 호출은 0이다. 모델 실패 뒤 갱신 보존과 모델 실패 판정은 독립적이다. Windows의 POSIX mode 검사 전용, 소유권 불명 프로세스 종료, 저장소 자격의 child env 유출을 거부한다.
- execution/provenance cases: 초기 actor와 재실행 actor 불일치·attempt 2·wrong repo/ref/OS/CLI·한도 누락은 credential 접근과 모델 호출 전에 거부한다. 실행 전 도구/설정 차단의 누락·상속 config·keyring 우회와 `unexpected-tool-use`를 검출한다. 수집은 종료된 run만 받으며 숫자 job ID/논리 key 혼동·실행 중 자기 run 대기·artifact 교체를 거부한다. 읽기 전용 재수집의 모델/상태 쓰기 0을 확인한다.
- artifact checks: 합성 민감 문자열·token/hash·JWT·개인 경로가 stdout/stderr/summary/artifact에 남지 않는다. 서로 다른 run/attempt/job·OS·CLI·상태 version을 바꿔 끼운 요약, 같은 VM의 재호출, refresh-unobserved를 PASS로 위장한 결과를 거부한다. private 저장소 접근과 실제 GitHub metadata 결합은 VFY-DCP-11에서 확인한다.
- state: Planned. 합성 credential/가짜 저장소/가짜 CLI로만 시험한다. 실제 갱신·클라우드 저장소의 원자성 증거가 아니다.

순수 계약의 필수 대조는 record의 status별 필드 조합·revision과 authVersion 혼동·같은 writeId 재전송/늦은 응답·reject의 쓰기 0·입력 불변이다. controller에서는 mark-execution 저장 미확정 시 spawn 0, 미검증 payload 게시 0, commit 재조회/자식 종료/홈 정리 중 하나라도 없을 때 release 0을 확인한다. proof에서는 두 OS의 정상 앞뒤 쌍과 외부 실패 뒤 한 번의 검토된 성공 재시도를 양성 대조로 두고, 각 필드 누락/추가·자기 참조·한 OS/후속 실행 누락·다른 stream/version·위조 executions·미해결 과거 실패를 각각 바꿔 거부한다. expected/실제 시도 집합 차이, observation digest 변경, 미검증 권한/모델, result와 codes의 모순, artifact 없는 실패의 OS 오인, 순환 대체/두 번째 retry도 거부한다. 과거 green 뒤 artifact 없는 최신 실패를 그 green에 연결한 사례, 두 실패를 한 성공에 연결한 사례, 실패한 관측에 run/job success만 붙인 대체, 중간 시도 생략, job 시각 누락·역전·동률·구간 겹침을 거부하고 배열 순서/runId 크기를 바꿔도 판정이 같아야 한다. CLI 시작 1을 API 요청 1로 채우거나 unknown usage/cost를 0으로 바꾸는 경우도 거부한다. 단일 실행 pass와 전체 실증 pass의 판정은 별개로 시험한다.

### VFY-DCP-11: 두 OS의 실제 갱신과 새 runner 계승

- verifies: REQ-DCP-008, REQ-DCP-009, REQ-DCP-012, REQ-DCP-014, REQ-DCP-015
- category/destination: native auth/recovery; 제안 private hosted workflow, 실제 상태 보관소, `codex-hosted-auth-proof.mjs`의 실행·출처 확인과 별도 scope 요약.
- preflight: TASK-DCP0-02 확정 사항과 VFY-DCP-10의 순수 검사 및 두 native-host leg 결과 확인. 고정 CLI의 파일 저장·도구/환경 차단 설정을 credential 제공 전에 확인하고 실제 저장소의 조건부 쓰기·충돌/응답 유실 복구는 disposable 합성 상태로 먼저 확인한다. 실제 로그인 토큰을 강제 폐기하거나 시간을 편집해 실패를 만드는 시험은 하지 않는다.
- expected: `windows-2022` x64와 `macos-15` arm64 각각에서 검토된 CLI의 ChatGPT native 실행·관측된 정상 갱신·원격 저장 재확인·새 VM의 해당 version 복원과 실행·소유 process/홈 정리를 연결한다. CLI 업데이트가 필요하면 고정값과 관련 회귀를 갱신하고 실행 identity에 남긴다. API key와 개인 홈 의존은 없다.
- refresh evidence: credential 본문을 출력하지 않는 metadata 관찰을 고정 CLI의 갱신/저장 동작과 연결한다. 단순 파일 mtime·저장소 version 증가·두 번의 모델 응답만으로 갱신 성공을 판정하지 않는다. 아직 갱신 조건이 아니면 `refresh-unobserved`로 보관하고 다음 제한 관측의 필요성을 기록한다.
- provenance/recovery: 종료된 GitHub run/job/artifact의 private/dev·두 actor·workflow SHA·attempt와 검토된 workflow의 hosted label을 대조하고, 신뢰된 실행 요약의 CLI/실제 OS 관측·직전 확정 상태·다음 실행을 연결한다. 갱신 쌍과 실패/재시도의 순서는 해당 REST job의 started_at/completed_at으로 확인하며 관측 요약이 주장하는 시각으로 대신하지 않는다. CLI digest를 REST metadata의 필드로 가정하지 않는다. 실제 중단은 credential 없는 disposable 상태로 먼저 재현하며, 정리 불실행을 모의한 다음 실행이 차단되는지 확인한다. 실제 credential의 상태가 불명확해지면 자동 재시도하지 않는다. 수집 실패만 재검증할 때 모델과 인증 상태는 바뀌지 않는다.
- state: Not executed. 서비스·권한·실행 한도·CLI 갱신 관측 조건이 미확정이다. 한 OS 또는 한 단계라도 빠지면 전체 DCPR PASS를 발행하지 않는다. 이 결과는 제품 설치·pipeline·승격 인수가 아니다.

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
- 원격 실증의 credential 저장소는 일반 빌드 cache/artifact와 분리한다. 갱신 상태가 있는 runner 소실에 대비해 실행 중/복구 필요 상태를 원격에서 확인한다. 소유권을 증명하지 못한 잠금을 시간 경과만으로 해제하지 않는다. 실제 모델에 저장소 쓰기 자격을 전달하지 않고 합성 secret으로 누출 거부를 확인한다.

## Risks and Rollback

남은 blocker는 원격 인증 상태 보관·소유권·실행 한도, 실제 갱신 및 제품 권한·정리 증거, 추가 채널·승격 적용 시점, template/이전 artifact 기준, trusted 증거 consumer와 검토 기록이다. 기본 네 조합·Intel 후속·hosted 우선 실증 방향은 정했지만 runner 구성의 비용/안정성 최적성을 주장하지 않는다. 모델 변동과 runner 지연은 VFY-DCP-04/05/09/11의 시간·사용량·실패 원인으로 관찰한다. 개발 중 실패를 timeout 확대·skip·계정 전환으로 숨기지 않는다.

이미 구현한 공통 순수 계약을 유지하고 원격 실증 → 설치/native 사전 검증 → 모델/lifecycle → 정식 gate 연결 순서로 진행한다. 비밀값 없는 코드는 기능 브랜치에서 검증하고 실제 구독 실행은 검토된 private `dev`에서만 수행한다. 이 과정에서 기존 게이트를 제거하지 않는다.

되돌릴 때는 해당 변경의 workflow·consumer·schema·coverage 표를 함께 되돌리고 추가 스케줄을 중지한다. 실패 기록과 과거 결과는 보존한다. 새 필수 검증을 사용할 수 없어진 후보는 동등화 미충족 상태로 두며, 이전의 약한 조건으로 조용히 배포하지 않는다. 출하 plugin을 수정했다면 이전 버전 번호 재사용 대신 기존 plugin version/배포 절차를 따른다. 운영 DB와 template 원본을 복원 대상으로 삼지 않는다.

hosted 실증 rollback은 새 dispatch를 멈추고 진행 중 실행의 소유권·최신 인증 상태를 먼저 확인한다. 코드 revert로 credential을 이전 version/seed로 되돌리지 않는다. 기존 Mac 경로 재사용도 최신 확정 상태·배타 소유권 확인 후에만 가능하며, 그 실행은 개인 기기 독립 완료의 증거가 아니다. 복구·폐기 책임과 원격 보관 자료의 처리 결과를 남긴다.

## Approval and Readiness

front matter는 승인 기록의 단일 기준이다. 2026-11-17 문서 기반 구현 지시에 따라 확정한 순수 계약부터 코드·합성 검증을 진행했다. 실제 모델 실행 권한과 native 인수 완료는 별도다.

- 현재 문서 산출: 확인한 불일치를 수정한 검토본. downstream blocker를 문서에 기록한 것만으로 `reconciling-proposals-with-codebase`의 clean pass를 주장하지 않는다.
- P0: 기본 네 조합과 hosted 우선 실증 방향, 순수 상태/관측·판정 입력 계약을 기록했다. TASK-DCP0-02의 남은 서비스/권한·수집 운영·실행 한도·고정 CLI 갱신 관측 계약을 확정하고 저장본을 검토해야 한다. 데이터 schema를 적었다는 이유만으로 전체 구현 준비 완료를 선언하지 않는다.
- DCPR 순수 구현: 상태 parser/전이 intent·관측 parser/판정기와 합성 시험을 구현했다. 실제 저장 원자성·controller 순서·OS ACL/process·trusted GitHub 수집을 검증한 결과가 아니다. TASK-DCPR-01 전체 및 VFY-DCP-10 전체는 미완료다.
- DCPR 실제 adapter/원격 실행: `BLOCKED`, BLK-DCP-05. 계획의 합성 검증과 실행 조건 확정은 실제 성공을 미리 요구하지 않는다. 아직 미정인 provider 명령을 복사해 실행할 수 있는 명세로 표현하지 않는다.
- 전체 구현/배포 인수: `BLOCKED`. BLK-DCP-01부터 BLK-DCP-05까지의 해당 선행 조건과 단계별 verifier가 필요하다. 상세 명세와 문서 검사 통과는 이를 해제하지 않는다.
- 구현 요청을 받으면 승인된 단계/범위만 수행하고, 범위 밖 단계·private workflow 변경·실제 모델 사용·배포를 자동으로 시작하지 않는다. 이미 승인된 다른 작업의 같은 승인을 다시 요구하지 않고 실제 소유 범위를 확인한다.

## Verification Results

### Hosted auth pure contracts — 2026-11-17

- 검토한 순수 계약에 대한 실제 수정 지시를 받아 private 최신 `dev` `559d9d2f586201d70beacc922fc4615da2f3a2cc`에서 `harness/hosted-auth-contracts`를 만들었다. 작업 경로는 `C:/Users/hamso/AppData/Local/Temp/stagekeeper-hosted-auth-contracts`다. 이전 private 작업 브랜치는 병합되어 재사용하지 않았고, 기존 public 문서 작업과 다른 worktree를 보존했다. 두 저장소 모두 조회 당시 열린 PR은 없었다. 이번 변경은 아직 커밋·push·병합하지 않았다.
- private `codex-auth-state.mjs`와 시험에 엄격한 상태/owner 검사, opaque revision을 유지하는 조건부 쓰기 intent, 실행 표시·새 인증 version·복구 상태·stale owner 및 같은 write ID 재전이 거부를 구현했다. 실제 CAS·응답 유실 readback·controller의 CLI/저장/정리 순서 검증은 이 구현에 포함하지 않았다.
- private `codex-hosted-auth-proof.mjs`와 시험에 관측 parser와 순수 판정기를 구현했다. 두 OS 쌍의 stream/버전 계승, workflow/CLI/model/image, 실행/job 중복·누락, 관측 digest, REST job 시각, 최신 실패·외부 원인 재시도의 일대일 관계를 검사한다. malformed 입력은 고정 code로 거부하고 usage의 null을 보존한다. 출처 검증 boolean은 trusted 수집기가 공급해야 하며 이 모듈 자체는 GitHub 출처를 인증하지 않는다.
- private `package.json`에 `test:hosted-auth-contracts`를 추가하고 기존 `check`에 두 모듈의 문법 검사를 넣었다. 기존 `scripts/*.test.mjs`가 새 시험을 포함한다. 새 job/OS leg는 추가하지 않았으며 기존 workflow·target SHA·모델 호출 경로는 바꾸지 않았다. private README에 API·실행 명령·남은 I/O 경계를 기록했다.
- Windows, Node `v22.13.1`에서 네 새 파일의 `node --check`가 통과했다. `node --test --test-reporter=spec scripts/codex-auth-state.test.mjs scripts/codex-hosted-auth-proof.test.mjs scripts/run-codex-ci.test.mjs`는 **103 pass, 0 fail, 0 skip**이다. 이 중 새 순수 계약 시험은 96개, 기존 wrapper 회귀는 7개다. `node --test --test-reporter=spec --test-name-pattern='excludes API keys|requires a completed' scripts/codex-auth-smoke.test.mjs`의 관련 기존 시험 2개도 통과했다. 실행 로그는 private 작업 경로의 ignored `hosted-auth-tests.log`에 보존한다.
- public `docs:check`는 Markdown 224개·상대 링크 1,160개·보고서 59개, `verify:ci-coverage`는 기존 13 jobs·11 rows, strict traceability는 15/15 REQ·오류 0으로 통과했다. 양쪽 `git diff --check`와 새 private 파일의 공백 검사도 통과했다. public 변경은 제안서뿐이며 제품 build·DB 검증을 실행하지 않았다.
- 전체 private `npm run check`는 기존 POSIX 권한/프로세스 시험을 포함하므로 이 Windows 세션에서 실행하지 않았다. Ubuntu CI 실행, 실제 provider·credential·원격 모델·native ACL/process·새 VM 갱신 계승은 미실행이다. TASK-DCPR-01/VFY-DCP-10 전체와 DCPR 완료를 선언하지 않으며 BLK-DCP-05의 운영 계약은 유지한다.

### Remote CI proof plan — 2026-11-16

- 이번 write set은 이 제안서 하나다. public `d529ec04c792e1b6f61ead5a4e48c5e8a7265ebf`와 private `559d9d2f586201d70beacc922fc4615da2f3a2cc`의 운영·guard·수집기·고정 입력을 대조했다. 개인 기기 독립 요구와 현행 self-hosted 계약의 차이를 계획에 반영했다.
- REQ-DCP-014/015, CON-DCP-005, TASK-DCP0-02, DCPR 두 작업과 VFY-DCP-10/11을 추가했다. auth-only/제품 경로·갱신 미관측/실제 갱신·정상 정리/강제 중단·Windows 관리자/비관리자 인수를 구분했다. 이미 반영된 summary·phase·cache·trigger 작업을 새 구현으로 다시 지시하던 현재형 문구도 정리했다.
- 편집 후 strict traceability는 15/15 REQ의 작업·verifier 연결, 오류 0으로 통과했다. `npm.cmd run docs:check`는 Markdown 224개·상대 링크 1,160개·보고서 59개, `npm.cmd run verify:ci-coverage`는 현행 13 jobs·11 rows를 확인했고 `git diff --check`도 통과했다. 최종 수정 뒤 같은 검사를 다시 실행한다. 이 결과는 문서 구조/연결의 검사이며 native 인수나 준비 완료 판정이 아니다.
- 코드 변경, credential 열람·이동, 저장소 등록·외부 쓰기, CI dispatch·모델·DB·배포는 실행하지 않았다. 원격 보관 서비스와 실행 조건은 BLK-DCP-05로 남으므로 전체 reconciliation의 `clean pass achieved`를 주장하지 않는다. 최신 저장본의 소스·요구·runtime/산출물·검증 경로를 수정 없이 재대조하며, 실제 운영 계약과 native 증거는 미확정으로 유지한다.

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

구현 완료는 개인 기기의 상시 실행·수동 runner 시작 없이 확정한 각 필수 조합이 실제 설치·update·해당 init 평가·pipeline·lifecycle 기준을 통과하고, 정확한 후보 identity와 검토 상태가 배포 판단에 연결됐을 때다. DCPR의 두 OS 실제 인증 갱신·보관·새 runner 계승과 제품 phase의 원격 진단 검토 경로도 필요하다. Windows 또는 macOS 한쪽만 끝내거나 auth-only만 통과하고 전체 client 동등화를 선언하지 않는다. Intel/채널·OS image/권한의 남은 범위는 명시적 지원 결정과 증거로 닫아야 한다.

보고서는 변경 파일, REQ별 verifier와 실제 command/run/attempt, source/template/package identity, 통과·실패·skip·미실행, 시간·제공되는 usage, private 증거 위치와 정리 상태, 남은 blocker를 포함한다. 실제 leg 실행과 재기록의 출처, 선택한 재시도·사유·검토를 구분해 중복 집계하지 않는다. 과거 PASS와 이번 실행을 구분한다. 구현·검증 완료 전에는 이 문서를 `completed/`로 이동하지 않는다.

## Review Checklist

- [x] 최신 소스와 architecture를 기준으로 기존 private Codex CI를 포함했다.
- [x] Windows·macOS 지원 결정과 architecture/channel 미확정을 구분했다.
- [x] 기존 승인된 OS coverage·template·gate 기록 작업의 소유권을 보존했다.
- [x] 실제 설치 loader, bundle identity, native 모델 경로와 제품 권한 경계를 명시했다.
- [x] 요구사항·단계·작업·검증 경로와 downstream blocker를 연결했다.
- [x] 계획한 실행을 실제 PASS로 기록하지 않았다.
- [x] 개인 기기 독립 목표·원격 인증 실증·중단/복구·제품 권한의 검증 경계를 연결했다.
- [ ] 원격 보관 서비스·실행 한도·고정 CLI 갱신 관측을 확정하고 두 OS의 실제 DCPR을 완료했다.
- [x] strict traceability·새 파일 링크·coverage·diff 검사를 완료했다.
