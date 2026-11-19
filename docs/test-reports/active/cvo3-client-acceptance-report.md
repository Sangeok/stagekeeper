---
status: "active"
stage: "blocked"
result: null
report-kind: "acceptance"
report-size: "standard"
test-levels: ["contract", "integration", "end-to-end"]
test-tools: ["Git", "GitHub Actions", "GitHub CLI", "node:test", "Python zipfile"]
created-at: "2026-11-19"
completed-at: null
last-executed-at: "2026-11-19T00:08:01Z"
tested-revision: "596f5e3d71dd49bc1c226498b02458679efffd36"
owners: ["user:Sangeok"]
related:
  - "docs/proposals/active/ci-verification-code-organization-phase-cvo3.md"
  - "docs/proposals/active/ci-verification-code-organization.md"
  - "docs/proposals/active/dual-client-ci-parity.md"
primary-area: "ci/client-acceptance"
observed-environments:
  - "dev | Windows native·설치 | windows-2022 x64 | CI"
  - "dev | macOS native·설치 | macos-15 ARM64 | CI"
  - "dev | macOS native·공유 배포 | macos-15-intel x64 | CI"
  - "private dev | Codex 신규·업데이트 | macOS ARM64 전용 러너·Codex 0.167.1 | CI"
test-summary: null
follow-up: ["docs/proposals/active/ci-verification-code-organization-phase-cvo3.md", "https://github.com/Sangeok/stagekeeper-codex-ci/pull/15"]
---

# CVO3 클라이언트 인수 실행 기록

## Summary and Decision

준비 시점의 공개 `dev`를 새 후보로 고정했다. 기존 push 3건에서 native 결과를 확인하고, 같은 후보에 없던 공개 Codex 공유 배포와 Claude 설치 검사를 각각 한 번 실행했다. private CI의 pin을 병합한 뒤 전용 Mac에서 모델 없는 신규 설치와 업데이트도 실행했다. 기존 init 동작과 별도 schema 2 판정은 E7·E8에 각각 기록했다. 이전 후보의 인수 결과는 [#384에 보존한 보고서](https://github.com/Sangeok/stagekeeper/blob/bef1bab326f5694118a4b046e543ba57c178e8a9/docs/test-reports/active/cvo3-client-acceptance-report.md)에서 따로 조회할 수 있다.

## Scope and Criteria

| 기준 | 요구사항 | 합격에 필요한 관측 |
| --- | --- | --- |
| R1 | REQ-CVO-007 · VFY-CVO-08 | Windows x64, macOS ARM64·Intel 각각의 필수 native 시험 및 offline build, Windows·macOS 작업 트리 검사 |
| R2 | REQ-CVO-007 · VFY-CVO-09 | 공개 Claude 두 OS 각각 신규·업데이트, private macOS Codex 신규·업데이트. 공개 Codex 공유 배포는 bundle 경로의 보조 증거 |
| R3 | REQ-CVO-007 · VFY-CVO-10 | 공개 Claude 전체 eval 및 두 OS의 `slug`·`truncate` pipeline, private macOS Codex eval·pipeline |

기존 게이트가 확인한 동작을 판정한다. schema 2 판정 범위는 같은 실행에서 관측된 설치물 식별·자원 정리·출처가 있는 항목으로 한정한다. [CVO3 실행 계획](../../proposals/active/ci-verification-code-organization-phase-cvo3.md)

## Test Target

공개 서버와 플러그인은 `tested-revision`에 고정했다. PR #385는 후보를 선택할 때 열려 있어 포함하지 않았다. 공개 Claude는 `github-branch`, 공개 Codex는 네이티브 bundle로 검증했다.

## Preconditions and Test Data

- 공개 템플릿은 `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215`로 고정했다. Claude update 직전 `main`에서 확인한 기대 SHA는 `c7c0a1314f680124196d9338eb94a46759ec4437`다. Codex 공유 배포의 이전 설치물은 `85c66fb1d9e02c3d9416710240cbfca3f0023939`의 재생성 fixture다.
- 실행 전 후보별 Actions 이력, 동일 설치 workflow의 미완료 실행, #319와 열린 gate 이슈를 조회했다. 조회 시 기존 push 3건, 후보의 공유 배포·공개 설치·모델 실행 0건, 열린 gate 이슈 0건이었다.
- private Mac ARM64에서 전용 CLI와 runner 아카이브를 검증했고 템플릿 checkout을 확인했다. private `dev` 병합 SHA·제품/이전 소스/템플릿 pin을 대조한 뒤 `--phase init`으로 한 번 실행했다. 구독 모델 로그인 확인은 이 phase에서 건너뛴다. E6–E8.

## Test Matrix

| ID | 기준 | Gate | 시나리오 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- | --- |
| T01 | R1 | required | Windows native 및 격리 빌드 | 실제 LPAC 사례와 새 snapshot의 test/build, smoke 서버 및 전체 제품 시험 통과. E1 | PASS |
| T02 | R1 | required | macOS ARM64 native 및 격리 빌드 | 필수 probe·제품 시험·offline build 통과. E2 | PASS |
| T03 | R1 | required | macOS Intel native 및 격리 빌드 | 필수 probe·제품 시험·offline build 통과. E2 | PASS |
| T04 | R1 | required | Windows·macOS ARM 작업 트리 검사 | 해당 OS의 필수 step과 job 통과. E3 | PASS |
| T05 | R2 | informational | 공개 Codex 신규·update, 세 OS | OS별 7개 검사, 모델 호출 0, 설치 후 inventory와 정리 확인. E4 | PASS |
| T06 | R2 | required | 공개 Claude Windows 신규 | 예상 소스·템플릿·단계 일치. E5 | PASS |
| T07 | R2 | required | 공개 Claude Windows 업데이트 | 예상 소스·템플릿·단계 일치. E5 | PASS |
| T08 | R2 | required | 공개 Claude macOS ARM 신규 | 예상 소스·템플릿·단계 일치. E5 | PASS |
| T09 | R2 | required | 공개 Claude macOS ARM 업데이트 | 예상 소스·템플릿·단계 일치. E5 | PASS |
| T10 | R2 | required | private Codex 신규 설치 | 빈 설치 cache에서 후보 bundle 검증, dry-run·연결·기존 파일 보존·fixture 정리 통과. E7 | PASS |
| T11 | R2 | required | private Codex 이전 bundle → 후보 update | 0.6.10 → 0.6.16 연결·업데이트와 fixture 정리 통과. 공통 계약의 실행 pin 보존은 별도 미확인. E7·E8 | PASS |
| T12 | R3 | required | Claude eval, ARM64 전체 gate | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T13 | R3 | required | Claude pipeline, Windows x64 / slug | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T14 | R3 | required | Claude pipeline, macOS ARM64 / slug | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T15 | R3 | required | Claude pipeline, Windows x64 / truncate | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T16 | R3 | required | Claude pipeline, macOS ARM64 / truncate | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T17 | R3 | required | private Codex eval, macOS ARM64 | 실제 모델 실행 범위·예산 확인 대기. F1 | NOT RUN |
| T18 | R3 | required | private Codex pipeline, macOS ARM64 | 실제 모델 실행 범위·예산 확인 대기. F1 | NOT RUN |

## Commands and Static Checks

| ID | 대상 | Gate | 실행한 명령·대조 | 결과 |
| --- | --- | --- | --- | --- |
| C1 | R1–R3 | informational | `git ls-remote origin`, 후보 SHA로 Actions runs 조회, job/attempt 및 원장 대조 | E1–E5의 후보와 출처를 식별했다. |
| C2 | R1–R2 | informational | `gh api`로 native job 로그·공유 배포 artifact를 읽고 허용 필드 검증 | Windows 필수 TAP 사례, 세 환경의 빌드 조건, 공유 배포 SHA·해시·정리 일치. E1–E4 |
| C3 | R2/T06–T09 | required | `gh workflow run client-init-smoke.yml --ref dev -f template_commit=8ccb37a4ab91de527e6a23caa6d415c7cdc6f215` | PASS. 네 leg 및 record job 완료, E5. |
| C4 | R2/T05 | informational | `gh workflow run shared-distribution-acceptance.yml --ref dev` | PASS. 세 OS의 실제 인수 step·artifact 대조, E4. |
| C5 | R2/T10–T11 | informational | 고정한 공개 소스를 checkout하고 private PR head에서 `npm run check` | PASS. Node 22 테스트 120개 통과, skip 0. E6. |
| C6 | R2/T10–T11 | required | 병합된 private `dev`에서 `node scripts/start-runner.mjs --dispatch --phase init` 1회 | PASS. 신규 설치·업데이트·최종 정리와 runner 해제를 확인했다. E7. |
| C7 | R2/T10–T11 | informational | `collect-init-evidence.mjs`에 private run ID, workflow SHA 및 고정 public checkout 입력 | FAIL. 단일 run schema 2 판정에 미충족 항목 3건. 실제 재실행은 하지 않았다. E8. |

## Evidence Registry

**E1 · Windows.** 300,000 ms 한도로 요청한 전체 빌드는 115,186 ms에 완료됐다. native 전용 step에서 `uses actual LPAC file denial and leaves the original repository unchanged`와 `passes real pipe/network/path preflight and runs npm test/build on a fresh source snapshot`가 모두 skip 없이 통과했다. [Windows native job · 시도 1](https://github.com/Sangeok/stagekeeper/actions/runs/44421676532/job/135215977335)

**E2 · macOS.** ARM64 76,507 ms, Intel 140,207 ms. 두 빌드 artifact에서 300,000 ms 요청, 종료 코드 0, 자식 종료 확인, snapshot 쓰기 폐기, 원본 저장소 쓰기·역할 네트워크·DB URL 제공 없음, 모델 호출 0을 대조했다. 두 job에서 Seatbelt 및 sandbox identity probe와 smoke 서버 단계도 성공했다. push에서 제외되는 수동 조사 3개는 이 실행에 해당하지 않는다. 빌드 artifact ID는 ARM `14482517622`, Intel `14482358659`이며 만료일은 2027-02-16 UTC다. [ARM64 job](https://github.com/Sangeok/stagekeeper/actions/runs/44421676621/job/135215979183) · [Intel job](https://github.com/Sangeok/stagekeeper/actions/runs/44421676621/job/135215977391)

**E3 · 작업 트리.** Windows의 directory observation counterexamples와 macOS의 native usage qualification이 각각 성공했다. 다른 OS 전용 step의 skip은 해당 runner에서 의도된 동작이다. [Windows job](https://github.com/Sangeok/stagekeeper/actions/runs/44421677870/job/135215982667) · [macOS job](https://github.com/Sangeok/stagekeeper/actions/runs/44421677870/job/135215982381)

**E4 · 공개 Codex 공유 배포.** 세 `summary.json`을 직접 읽어 후보·previous·templates SHA, `result=pass`, Codex `0.167.1`, 플러그인 `0.6.16`, 실제 loader·신규 설치·업데이트·수정 파일 거부/복구·모델 없는 세션을 포함한 검사 7개를 대조했다. 이전 및 후보 package/runtime/verifier 해시 필드도 확인했다. 각 OS 요약을 해당 job의 실제 실행 시도에 연결했다. 아래 artifact의 만료일은 2026-12-02 UTC다. [공유 배포 실행](https://github.com/Sangeok/stagekeeper/actions/runs/44424425015)

| OS | 결과를 만든 job / attempt | Artifact ID | 후보 package SHA256 |
| --- | --- | --- | --- |
| Windows x64 | [135225466498](https://github.com/Sangeok/stagekeeper/actions/runs/44424425015/job/135225466498) / 1 | 14483621493 | `e356f6476b50b7adef97f5a25c5ec51eaf66f834903f63a7d726ce910b1d432b` |
| macOS Intel | [135225466222](https://github.com/Sangeok/stagekeeper/actions/runs/44424425015/job/135225466222) / 1 | 14483607281 | `75fd116715b39af563d5bb5ebafda0cd13bb9b3f81018878dcff75b36db61fcc` |
| macOS ARM64 | [135225466432](https://github.com/Sangeok/stagekeeper/actions/runs/44424425015/job/135225466432) / 1 | 14483143370 | `be64be34ec0d1fd631a9ba0453ea6adc621fd193106bc8fb3293d1a9a8c5eb99` |

**E5 · 공개 Claude init.** 각 leg의 서버 checkout SHA, `pluginCommit`, `templatesCommit`, OS·시나리오, 실제 smoke step, 전체 단계 결과와 정리 경고를 확인한다. update는 `previousCommit`도 대조한다. 신규의 재실행 무변경·Pro 전환과 update의 기존 MCP 연결·동기화가 대상이다. 아래 시간은 각 리허설의 `seconds`다. 공개 설치는 인증 모델을 호출하지 않는 helper 경로로 실행했다. `modelCalls` 과금 계측값은 공개 설치 요약에 포함되지 않는다. [수동 실행 44424437116](https://github.com/Sangeok/stagekeeper/actions/runs/44424437116)

| 시나리오 | 최초 실행 job / attempt | Claude 버전 | 통과 단계 / 초 | 검토 |
| --- | --- | --- | --- | --- |
| Windows 신규 | [135225508219](https://github.com/Sangeok/stagekeeper/actions/runs/44424437116/job/135225508219) / 1 | 2.1.327 | 23 / 21 | 정리 실패 경고 0 |
| Windows 업데이트 | [135225508277](https://github.com/Sangeok/stagekeeper/actions/runs/44424437116/job/135225508277) / 1 | 2.1.327 | 22 / 21 | 이전 SHA 일치. 정리 실패 경고 0 |
| macOS ARM 신규 | [135225507696](https://github.com/Sangeok/stagekeeper/actions/runs/44424437116/job/135225507696) / 1 | 2.1.327 | 23 / 14 | 정리 실패 경고 0 |
| macOS ARM 업데이트 | [135225508192](https://github.com/Sangeok/stagekeeper/actions/runs/44424437116/job/135225508192) / 1 | 2.1.327 | 22 / 7 | 이전 SHA 일치. 정리 실패 경고 0 |

기록 Action이 게시한 schema 1 행에서 후보 SHA·템플릿·네 leg의 성공을 대조했다. [게이트 원장 행](https://github.com/Sangeok/stagekeeper/issues/319#issuecomment-6995190643)

**E6 · private 러너 준비와 대상 변경.** 전용 macOS ARM64에서 Codex CLI `0.167.1`과 launcher가 사용하는 runner archive SHA256을 검증했다. 실제 템플릿 checkout은 기대 SHA와 일치하며 tracked·untracked 변경이 없었다. owner 조회에서 기존 등록 runner와 진행 중 dispatch가 없었다. private PR #15는 `sourceCommit`과 `templateCommit`을 이번 후보 입력으로 변경하고 `previousCommit`은 `f882bb96450580d51dc63f142d19531a67185132`로 유지한다. 해당 공개 checkout·private PR head 조합으로 로컬 테스트 120개가 통과했고 별도 Ubuntu PR 검사도 성공했다. 이 PR을 private `dev`에 병합한 SHA `7bf51ce986ebc0570ad1bbe5f2e558c0ee2ba02b`에서 세 pin을 재확인했다. [대상 변경 PR #15](https://github.com/Sangeok/stagekeeper-codex-ci/pull/15) · [private PR 검사](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44424643579/job/135226197841)

**E7 · private Codex 실제 init.** run `44425864335`, 시도 1에서 `context`와 `macos`가 성공했고 구독 인증 모델 step은 skip됐다. 신규 설치는 5.357초, 업데이트는 7.983초였고 Codex `0.167.1`, 후보 플러그인 `0.6.16`, 후보 package SHA256 `53b7810da611eadf682b03742e8478c72c14d633d731bd9ba398823962ac515f`를 확인했다. 각 시나리오에서 실제 캐시 inventory·기존 설정·roster 보존·모델 호출 0, update는 재생성된 이전 `0.6.10` bundle identity까지 대조했다. [private Mac job](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44425864335/job/135230466388)

**E8 · 같은 private run의 공통 계약 판정.** 읽기 전용 수집기는 `scope=codex-macos-init-single-run`, `result=fail`(종료 코드 1)을 반환했다. 보관한 workspace에 대해 두 행 모두 `cleanup-incomplete`, update에서 관측하지 않은 `pins-preserved`에 대해 `incomplete-checks`가 남았다. 두 행의 모델 호출 수와 비용은 각각 0이다. 정규화된 evidence digest는 신규 `8b06ab2fba0f83a120606eda521ae8093345c2fb7ae5459dbc285a3f5063e33d`, update `f17c968f6332cee05bf713e16c81727d04bcca222e1385032285e1e8e926e471`이다. 허용 필드만 담은 private artifact ID는 `14484751243`이며 만료는 2026-12-19 UTC다. [원본 run](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44425864335)

공개 job 로그의 만료 시각은 조회 결과에 없어 미확인으로 기록한다. 위 표에는 해당 시점의 검토 결과와 재조회 가능한 job 번호를 보존했다.

## Findings and Follow-up

| ID | 영향 | 근거와 해소 조건 |
| --- | --- | --- |
| F1 | 실제 모델 인수 | 공개 Claude 및 private Codex의 실제 모델 실행 범위·예산 확인 대기. 구독을 공유하는 게이트는 직렬로 실행하고 해당 후보·입력만 판정한다. |
| F2 | private schema 2 미충족 | E6에서 대상 불일치를 해소했다. E7의 init 동작은 통과했다. E8의 workspace 보존과 업데이트 pin 미관측은 [dual-client 작업](../../proposals/active/dual-client-ci-parity.md)에서 추적한다. |
| F3 | 결과의 증명 범위 | 공개 Claude source 설치의 `pluginCommit`은 marketplace checkout에서 확인한 값이다. 해당 실행의 설치 cache `payloadSha256`은 공개 요약에 없어 schema 2 설치물 일치는 미검증이다. |

## Test Data and Cleanup

공개 Codex 공유 배포 세 요약에서 server·fixture·client·database 정리가 모두 `pass`이고 `cleanup.errors`는 비었다. 공개 Claude init의 fixture 삭제 실패·서버 정지 실패는 smoke job의 전체 로그와 요약을 대조한다. 네 공개 설치 job의 전체 로그에서 `cleanup: the fixture user was not deleted` 및 `server-cleanup failed; fixture preserved` 경고는 0건이었다. DB에 직접 접속해 잔류 행을 조회한 증거는 수집하지 않았다. 공개 보고서에는 job·artifact 식별자, 해시와 허용된 요약값만 기록했다.

private init은 시나리오별 정리 후 DB에서 fixture 사용자 수가 0인지 검사했다. 두 시나리오의 로그에서 삭제·서버 정리 경고는 없었다. 최종 wrapper의 `runnerSettled`와 `databaseStopped`는 모두 `true`였고 launcher 종료 뒤 GitHub의 등록 runner 수는 0이었다. private workspace는 정책에 따라 진단용으로 보관했다.

## Conclusion

기존 CVO3 동작 기준으로 필수 17개 중 native·설치 10개가 통과했다. 실제 모델 7개 행이 남아 전체 인수는 진행 중이다. 추가 판정 C7은 `FAIL`이며 F2를 추적한다. 운영 승격은 별도 결정이다.

## Review Checklist

- [x] 모든 실행 행에 기준과 필수 여부를 연결했다.
- [x] 후보·입력·원래 attempt를 대조했고, 결과 보관 범위와 원문 비공개 조건을 확인했다.
- [x] 미실행·차단 행과 공개 검사에서 실제로 관측한 동작을 구분했다.
- [ ] 모든 필수 행의 증거와 정리·검토 결정을 수집해 최종 판정을 내린다.
