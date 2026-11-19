---
status: "completed"
stage: null
result: "fail"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["contract", "integration", "end-to-end"]
test-tools: ["Git", "GitHub Actions", "GitHub CLI", "node:test", "Python zipfile"]
created-at: "2026-11-19"
completed-at: "2026-11-19"
last-executed-at: "2026-11-19T01:19:16Z"
tested-revision: "a2acd9a2b9df3c316cfc947977413016743161b1"
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
test-summary: "fail: 동일 후보 필수 17개 중 12개 통과, macOS Claude slug·Codex eval 2개 실패, 3개 미실행"
follow-up: ["https://github.com/Sangeok/stagekeeper/issues/388", "docs/proposals/active/ci-verification-code-organization-phase-cvo3.md", "docs/proposals/active/dual-client-ci-parity.md"]
---

# CVO3 클라이언트 인수 실행 기록

## Summary and Decision

후보의 무모델 인수와 실제 모델 검증을 마감했다. 유료 workflow는 공개 Claude 전체 평가, `slug` 파이프라인, 비공개 Codex `all`을 각각 한 번 실행했다. `dev`가 이동한 뒤 사용자가 남은 `truncate` 1회를 사용하지 않기로 했다. [직전 후보의 보고서](https://github.com/Sangeok/stagekeeper/blob/55c1c3913bdf252fcaf6bf2d9c45b26098b18166/docs/test-reports/active/cvo3-client-acceptance-report.md)는 이번 판정에 합산하지 않았다.

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
- 실행 전 후보별 Actions 이력, 동일 설치 workflow의 미완료 실행, #319와 열린 gate 이슈를 조회했다. 조회 시 기존 push 3건, 후보의 공유 배포·공개 설치·모델 실행 0건, 이전 `main`의 [#387](https://github.com/Sangeok/stagekeeper/issues/387)이 열려 있었다. 그 실행은 후보·템플릿이 달라 본 판정에서 제외했다.
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
| T12 | R3 | required | Claude eval, ARM64 전체 gate | 대조군 통과, gate 3사례 × 3회에서 실패 0. E9 | PASS |
| T13 | R3 | required | Claude pipeline, Windows x64 / slug | 5개 역할·계획 검증 1회·독립 사례 검증·종료 완료. E10 | PASS |
| T14 | R3 | required | Claude pipeline, macOS ARM64 / slug | marketplace SHA가 기대값과 달라 `plugin-install`에서 실패. 모델 파이프라인 시작 전. E10 | FAIL |
| T15 | R3 | required | Claude pipeline, Windows x64 / truncate | 사용자 결정으로 남은 유료 dispatch를 생략했다. F1 | NOT RUN |
| T16 | R3 | required | Claude pipeline, macOS ARM64 / truncate | 사용자 결정으로 남은 유료 dispatch를 생략했다. F1 | NOT RUN |
| T17 | R3 | required | private Codex eval, macOS ARM64 | `modified-file` 2회차에서 native dry-run의 필수 출력 미관측. E11·F4 | FAIL |
| T18 | R3 | required | private Codex pipeline, macOS ARM64 | `all`이 앞 단계 eval에서 중단됐다. E11 | NOT RUN |

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
| C8 | R3/T12 | required | `gh workflow run agent-eval.yml --ref dev` 기본 전체 gate 1회 | PASS. checkout·control·전체 사례·정리·원장을 대조했다. E9. |
| C9 | R3/T13–T14 | required | `gh workflow run pipeline-smoke.yml --ref dev -f templates-ref=<고정 SHA> -f scenario=slug` 1회 | FAIL. Windows 성공, macOS 설치 SHA 불일치. E10. |
| C10 | R3/T17–T18 | required | private `start-runner.mjs --dispatch --phase all --run-models` 1회 | FAIL. 인증 smoke와 init 두 시나리오 성공, eval 실패로 pipeline 미진입. E11. |

## Evidence Registry

**E1 · Windows.** 300,000 ms 한도로 요청한 전체 빌드는 85,458 ms에 완료됐다. native 전용 step에서 `uses actual LPAC file denial and leaves the original repository unchanged`와 `passes real pipe/network/path preflight and runs npm test/build on a fresh source snapshot`가 모두 skip 없이 통과했다. [Windows native job · 시도 1](https://github.com/Sangeok/stagekeeper/actions/runs/44429373659/job/135242497926)

**E2 · macOS.** ARM64 56,452 ms, Intel 115,821 ms. 두 빌드 artifact에서 300,000 ms 요청, 종료 코드 0, 자식 종료 확인, snapshot 쓰기 폐기, 원본 저장소 쓰기·역할 네트워크·DB URL 제공 없음, 모델 호출 0을 대조했다. 두 job에서 Seatbelt 및 sandbox identity probe와 smoke 서버 단계도 성공했다. push에서 제외되는 수동 조사 3개는 이 실행에 해당하지 않는다. 빌드 artifact ID는 ARM `14485981357`, Intel `14487350488`이며 만료일은 2027-02-17 UTC다. [ARM64 job](https://github.com/Sangeok/stagekeeper/actions/runs/44429373376/job/135242496313) · [Intel job](https://github.com/Sangeok/stagekeeper/actions/runs/44429373376/job/135242496666)

**E3 · 작업 트리.** Windows의 directory observation counterexamples와 macOS의 native usage qualification이 각각 성공했다. 다른 OS 전용 step의 skip은 해당 runner에서 의도된 동작이다. [Windows job](https://github.com/Sangeok/stagekeeper/actions/runs/44429373543/job/135242497331) · [macOS job](https://github.com/Sangeok/stagekeeper/actions/runs/44429373543/job/135242497284)

**E4 · 공개 Codex 공유 배포.** 세 `summary.json`을 직접 읽어 후보·previous·templates SHA, `result=pass`, Codex `0.167.1`, 플러그인 `0.6.16`, 실제 loader·신규 설치·업데이트·수정 파일 거부/복구·모델 없는 세션을 포함한 검사 7개를 대조했다. 이전 및 후보 package/runtime/verifier 해시 필드도 확인했다. 각 OS 요약을 해당 job의 실제 실행 시도에 연결했다. 아래 artifact의 만료일은 2026-12-03 UTC다. [공유 배포 실행](https://github.com/Sangeok/stagekeeper/actions/runs/44430850534)

| OS | 결과를 만든 job / attempt | Artifact ID | 후보 package SHA256 |
| --- | --- | --- | --- |
| Windows x64 | [135247543704](https://github.com/Sangeok/stagekeeper/actions/runs/44430850534/job/135247543704) / 1 | 14485917408 | `e356f6476b50b7adef97f5a25c5ec51eaf66f834903f63a7d726ce910b1d432b` |
| macOS Intel | [135247543229](https://github.com/Sangeok/stagekeeper/actions/runs/44430850534/job/135247543229) / 1 | 14486217980 | `75fd116715b39af563d5bb5ebafda0cd13bb9b3f81018878dcff75b36db61fcc` |
| macOS ARM64 | [135247543636](https://github.com/Sangeok/stagekeeper/actions/runs/44430850534/job/135247543636) / 1 | 14486032504 | `be64be34ec0d1fd631a9ba0453ea6adc621fd193106bc8fb3293d1a9a8c5eb99` |

**E5 · 공개 Claude init.** 각 leg의 서버 checkout SHA, `pluginCommit`, `templatesCommit`, OS·시나리오, 실제 smoke step, 전체 단계 결과와 정리 경고를 확인한다. update는 `previousCommit`도 대조한다. 신규의 재실행 무변경·Pro 전환과 update의 기존 MCP 연결·동기화가 대상이다. 아래 시간은 각 리허설의 `seconds`다. 공개 설치는 인증 모델을 호출하지 않는 helper 경로로 실행했다. `modelCalls` 과금 계측값은 공개 설치 요약에 포함되지 않는다. [수동 실행 44430863653](https://github.com/Sangeok/stagekeeper/actions/runs/44430863653)

| 시나리오 | 최초 실행 job / attempt | Claude 버전 | 통과 단계 / 초 | 검토 |
| --- | --- | --- | --- | --- |
| Windows 신규 | [135247583981](https://github.com/Sangeok/stagekeeper/actions/runs/44430863653/job/135247583981) / 1 | 2.1.327 | 23 / 20 | 정리 실패 경고 0 |
| Windows 업데이트 | [135247584040](https://github.com/Sangeok/stagekeeper/actions/runs/44430863653/job/135247584040) / 1 | 2.1.327 | 22 / 22 | 이전 SHA 일치. 정리 실패 경고 0 |
| macOS ARM 신규 | [135247583720](https://github.com/Sangeok/stagekeeper/actions/runs/44430863653/job/135247583720) / 1 | 2.1.327 | 23 / 14 | 정리 실패 경고 0 |
| macOS ARM 업데이트 | [135247583507](https://github.com/Sangeok/stagekeeper/actions/runs/44430863653/job/135247583507) / 1 | 2.1.327 | 22 / 7 | 이전 SHA 일치. 정리 실패 경고 0 |

기록 Action이 게시한 schema 1 행에서 후보 SHA·템플릿·네 leg의 성공을 대조했다. [게이트 원장 행](https://github.com/Sangeok/stagekeeper/issues/319#issuecomment-6996055254)

**E6 · private 러너와 대상.** 고정된 전용 Codex CLI 및 러너 archive, 분리된 인증 프로필 metadata, 템플릿 checkout을 확인했다. private PR #16에서 제품 SHA만 갱신했다. 이전 제품 `f882bb96450580d51dc63f142d19531a67185132`와 템플릿 SHA는 유지했다. 해당 후보 checkout에서 로컬 테스트 120개와 Ubuntu PR 검사가 통과했다. 병합된 private workflow SHA는 `c02b88730e584962e28f8f07d4446a5086d2815a`다. [pin 변경 PR](https://github.com/Sangeok/stagekeeper-codex-ci/pull/16) · [private PR 검사](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44431096922/job/135248368291)

**E7 · private Codex 실제 init.** run `44431263529`, 시도 1에서 `context`와 `macos`가 성공했고 구독 인증 모델 step은 skip됐다. 신규 설치는 5.158초, 업데이트는 8.790초였고 Codex `0.167.1`, 후보 플러그인 `0.6.16`, 후보 package SHA256 `53b7810da611eadf682b03742e8478c72c14d633d731bd9ba398823962ac515f`를 확인했다. 각 시나리오에서 실제 캐시 inventory·기존 설정·roster 보존·모델 호출 0, update는 재생성된 이전 `0.6.10` bundle identity까지 대조했다. [private Mac job](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44431263529/job/135248969584)

**E8 · 같은 private run의 공통 계약 판정.** 읽기 전용 수집기는 `scope=codex-macos-init-single-run`, `result=fail`(종료 코드 1)을 반환했다. 보관한 workspace에 대해 두 행 모두 `cleanup-incomplete`, update에서 관측하지 않은 `pins-preserved`에 대해 `incomplete-checks`가 남았다. 두 행의 모델 호출 수와 비용은 각각 0이다. 정규화된 evidence digest는 신규 `fa7f40bc9d39a316c0828722496cb297e782872ede1728a757218c85e228137b`, update `19699ac4114b5a5b9747a22cdd4f9149cb2323013e27ea048fef018f9b451db8`이다. 허용 필드만 담은 private artifact ID는 `14486378035`이며 만료는 2026-12-19 UTC다. [원본 run](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44431263529)

**E9 · 공개 Claude eval.** 기본 gate를 선택한 후보 checkout의 `init-skill`과 정리·기록 job이 성공했다. `selection=gate`, `controlPassed=true`, `gateComplete=true`이며 세 사례 모두 score 1, 3회 실행, 실패 0회다. 본 평가 결과가 기록한 시간은 104초, 예상 비용은 USD 4.37다. 대조군 비용 및 전체 청구액은 미관측이다. 현재 workflow는 실행 복사본의 `copySha256`을 출력하지 않는다. [eval job](https://github.com/Sangeok/stagekeeper/actions/runs/44432277897/job/135252378804) · [원장 행](https://github.com/Sangeok/stagekeeper/issues/319#issuecomment-6996242107)

**E10 · 공개 Claude pipeline / slug.** run·서버 checkout은 `a2acd9a2b9df3c316cfc947977413016743161b1`, 템플릿은 `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215`였다. Windows에서 설치된 소스가 후보와 일치했고 `runner-stop`·`implementation-check`·`secret-scan`을 포함한 단계가 모두 통과했다. `claude-sonnet-5-5` 사용, 639초, 정가 환산 USD 1.94, `stepRefusals=0`, 도구 오류 0이었다. macOS에서는 서버를 같은 후보로 빌드했지만 나중에 받은 marketplace HEAD가 `ae8bb8ae07465e1cb56aa7337523a3253b296e20`여서 설치를 거부했다. 요약에는 6초, 사용 모델 빈 배열·USD 0이 기록됐고 실제 역할 실행 단계에는 도달하지 않았다. 두 leg 모두 봉인 업로드 성공, 확인한 정리 경고는 0건이다. artifact ID는 Windows `14488615423`, macOS `14488940598`, 만료일은 2026-11-26 UTC다. [Windows job](https://github.com/Sangeok/stagekeeper/actions/runs/44432698578/job/135253784024) · [macOS job](https://github.com/Sangeok/stagekeeper/actions/runs/44432698578/job/135253784953) · [원장 행](https://github.com/Sangeok/stagekeeper/issues/319#issuecomment-6996507835)

**E11 · private Codex all.** [private #14](https://github.com/Sangeok/stagekeeper-codex-ci/pull/14) 병합 뒤 실행한 workflow SHA는 `0b2f55cf3a260391207c64a9a9d6249cdb4d5aff`다. 단독 init 시점과 `ci-target.json`, `codex-ci.yml`, launcher, auth smoke, 검증 실행기·수집기 코드가 일치했다. 두 실행 모두 같은 공개 후보·이전 설치물·템플릿을 사용했다. [Mac job · 시도 1](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44435022051/job/135261639199)

- 인증 모델 1턴이 성공했다. 신규·업데이트 init도 완료했고 두 fixture 사용자 정리 검사가 통과했다. 반복된 init은 T10·T11에 한 번씩만 집계했다.
- Eval은 native preflight 뒤 쓰기 대조군, `dry-run-only` 3회, `modified-file` 첫 회가 통과했다. 두 번째 `modified-file`의 모델 턴은 완료됐고 관측된 명령의 종료 코드도 0이었다. 필터링된 도구 출력에 판정기가 요구하는 `planned: no installation changes` 문구가 없었다. 관리 파일 보존 검사는 그 직전에 통과했다.
- 실행기 결과 코드는 `eval-new-user-failed`, 완료 단계는 2/4(init 두 개)였다. `incomplete-package` 평가와 private pipeline은 실행되지 않았다. 전체 모델 호출 수와 전체 비용은 wrapper에서 미관측이다. 관측된 eval 6턴의 입력은 1,196,567 tokens(캐시 960,128 포함), 출력은 8,001 tokens였다. 별도 인증 턴의 입력 9,990·출력 12 tokens는 이 값에 포함하지 않았다.

공개 job 로그의 만료 시각은 조회 결과에 없어 미확인으로 기록한다. 위 표에는 해당 시점의 검토 결과와 재조회 가능한 job 번호를 보존했다.

## Findings and Follow-up

| ID | 영향 | 근거와 해소 조건 |
| --- | --- | --- |
| F1 | 공개 후보 분기 | #385 병합으로 공개 `dev`가 `ae8bb8a`로 이동했다. 기존 `slug` run의 macOS job이 새 `dev`의 플러그인을 발견하여 거부했다. 사용자가 남은 1회 미사용을 선택해 `truncate`는 다른 SHA에도 dispatch하지 않았다. [#388](https://github.com/Sangeok/stagekeeper/issues/388) · [#385](https://github.com/Sangeok/stagekeeper/pull/385) |
| F2 | private schema 2 미충족 | E6에서 대상 불일치를 해소했다. E7의 init 동작은 통과했다. E8의 workspace 보존과 업데이트 pin 미관측은 [dual-client 작업](../../proposals/active/dual-client-ci-parity.md)에서 추적한다. |
| F3 | 결과의 증명 범위 | 공개 Claude source 설치의 `pluginCommit`은 marketplace checkout에서 확인한 값이다. 해당 실행의 설치 cache `payloadSha256`은 공개 요약에 없어 schema 2 설치물 일치는 미검증이다. |
| F4 | private eval의 관측 실패 | `modified-file` 2회차에서 도구 출력이 필터링돼 grader가 요구한 문구가 관측되지 않았다. 재검증 전에 native 출력과 판정기의 관찰 계약을 검토해야 한다. E11. |

## Test Data and Cleanup

공개 Codex 공유 배포 세 요약에서 server·fixture·client·database 정리가 모두 `pass`이고 `cleanup.errors`는 비었다. 공개 Claude init의 fixture 삭제 실패·서버 정지 실패는 smoke job의 전체 로그와 요약을 대조한다. 네 공개 설치 job의 전체 로그에서 `cleanup: the fixture user was not deleted` 및 `server-cleanup failed; fixture preserved` 경고는 0건이었다. DB에 직접 접속해 잔류 행을 조회한 증거는 수집하지 않았다. 공개 보고서에는 job·artifact 식별자, 해시와 허용된 요약값만 기록했다.

private init은 시나리오별 정리 후 DB에서 fixture 사용자 수가 0인지 검사했다. 두 시나리오의 로그에서 삭제·서버 정리 경고는 없었다. 최종 wrapper의 `runnerSettled`와 `databaseStopped`는 모두 `true`였고 launcher 종료 뒤 GitHub의 등록 runner 수는 0이었다. private workspace는 정책에 따라 진단용으로 보관했다.

private `all` 종료 시 `runnerSettled=true`, `databaseStopped=true`였으며 임시 Actions runner도 등록 해제됐다. 실패한 eval 리허설은 서버·fixture 삭제 경고 없이 종료했다. 실패로 인해 wrapper의 eval 전용 DB 행 수 점검은 실행되지 않았다. private 원문·인증값은 공개 위치로 옮기지 않았다.

## Conclusion

필수 시나리오 17개 중 12개는 `PASS`, T14·T17은 `FAIL`, T15·T16·T18은 `NOT RUN`이다. F1과 F4로 이번 후보의 REQ-CVO-007은 미충족이다. 공통 판정 C7도 별도로 `FAIL`이다. 공개 요약에 기록된 예상 비용의 합은 USD 6.31(Claude eval 4.37 + Windows slug 1.94)이다. 대조군과 private 구독 사용을 포함한 전체 비용은 미상이다. 유료 재시도 없이 이 후보의 관측을 종료했다.

## Review Checklist

- [x] 모든 실행 행에 기준과 필수 여부를 연결했다.
- [x] 후보·입력·원래 attempt를 대조했고, 결과 보관 범위와 원문 비공개 조건을 확인했다.
- [x] 미실행·차단 행과 공개 검사에서 실제로 관측한 동작을 구분했다.
- [x] 실패한 필수 행과 사용자 결정·선행 실패로 실행하지 않은 행을 표시하고 전체 판정을 확정했다.
