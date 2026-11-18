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
last-executed-at: "2026-11-18T16:06:56Z"
tested-revision: "373dcca19143a1612969fcc94f50069643efa328"
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
test-summary: null
follow-up: ["docs/proposals/active/ci-verification-code-organization-phase-cvo3.md"]
---

# CVO3 클라이언트 인수 실행 기록

## Summary and Decision

CVO3 실행 요청 시점의 원격 `dev`를 후보로 선택했다. 기존 push CI의 실제 job·로그·배포 요약을 확인해 native와 공개 Codex 공유 배포 증거를 재사용했다. 공개 Claude 설치는 동일 후보의 기존 실행이 없어 `client-init-smoke`를 수동 실행했다. 공개 설치 네 조합 가운데 4개의 job 요약·정리 로그를 검증했다.

## Scope and Criteria

| 기준 | 요구사항 | 합격에 필요한 관측 |
| --- | --- | --- |
| R1 | REQ-CVO-007 · VFY-CVO-08 | Windows x64, macOS ARM64·Intel 각각의 필수 native 시험 및 offline build, Windows·macOS 작업 트리 검사 |
| R2 | REQ-CVO-007 · VFY-CVO-09 | 공개 Claude 두 OS 각각 신규·업데이트, private macOS Codex 신규·업데이트. 공개 Codex 공유 배포는 bundle 경로의 보조 증거 |
| R3 | REQ-CVO-007 · VFY-CVO-10 | 공개 Claude 전체 eval 및 두 OS의 `slug`·`truncate` pipeline, private macOS Codex eval·pipeline |

기존 게이트가 확인한 동작을 판정한다. schema 2 판정 범위는 같은 실행에서 관측된 설치물 식별·자원 정리·출처가 있는 항목으로 한정한다. [CVO3 실행 계획](../../proposals/active/ci-verification-code-organization-phase-cvo3.md)

## Test Target

서버·플러그인 소스 후보는 front matter의 `tested-revision`이다. 결과를 작성하는 문서 브랜치와 CVO2 병합 SHA `634f70d`의 CI 결과는 이 후보에 합산하지 않았다. 공개 Claude 설치 채널은 `github-branch`, 공개 Codex는 네이티브 bundle이다.

## Preconditions and Test Data

- 공개 템플릿은 `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215`로 고정했다. Claude update 직전 `main`에서 확인한 기대 SHA는 `c7c0a1314f680124196d9338eb94a46759ec4437`다. Codex 공유 배포의 이전 설치물은 `85c66fb1d9e02c3d9416710240cbfca3f0023939`의 재생성 fixture다.
- 실행 전 후보별 Actions 이력, 동일 설치 workflow의 미완료 실행, #319와 열린 gate 이슈를 조회했다. 조회 시 기존 push 4건, 후보의 공개 설치·모델 실행 0건, 열린 gate 이슈 0건이었다.
- private CI의 현재 pin은 E6에서 확인했다. 러너의 실시간 가용성과 구독 사용 승인은 미확인이다. 제품 시험용 계정·DB·설치 홈은 각 리허설이 담당한다.

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
| T10 | R2 | required | private Codex 신규 설치 | 현재 private workflow의 제품·템플릿 pin 불일치. E6·F2 | BLOCKED |
| T11 | R2 | required | private Codex 이전 bundle → 후보 update | private 대상 제품과 템플릿이 후보와 다름. E6·F2 | BLOCKED |
| T12 | R3 | required | Claude eval, ARM64 전체 gate | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T13 | R3 | required | Claude pipeline, Windows x64 / slug | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T14 | R3 | required | Claude pipeline, macOS ARM64 / slug | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T15 | R3 | required | Claude pipeline, Windows x64 / truncate | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T16 | R3 | required | Claude pipeline, macOS ARM64 / truncate | 실제 모델 사용 범위·예산 확인 대기. | NOT RUN |
| T17 | R3 | required | private Codex eval, macOS ARM64 | E6의 대상 불일치, private 실행 범위 미확정 | BLOCKED |
| T18 | R3 | required | private Codex pipeline, macOS ARM64 | E6의 대상 불일치, private 실행 범위 미확정 | BLOCKED |

## Commands and Static Checks

| ID | 대상 | Gate | 실행한 명령·대조 | 결과 |
| --- | --- | --- | --- | --- |
| C1 | R1–R3 | informational | `git ls-remote origin`, 후보 SHA로 Actions runs 조회, job/attempt 및 원장 대조 | E1–E5의 후보와 출처를 식별했다. |
| C2 | R1–R2 | informational | `gh api`로 native job 로그·공유 배포 artifact를 읽고 허용 필드 검증 | Windows 필수 TAP 사례, 세 환경의 빌드 조건, 공유 배포 SHA·해시·정리 일치. |
| C3 | R2/T06–T09 | required | `gh workflow run client-init-smoke.yml --ref dev -f template_commit=8ccb37a4ab91de527e6a23caa6d415c7cdc6f215` | PASS. 네 leg 및 record job 완료, E5. |

## Evidence Registry

**E1 · Windows.** 300,000 ms 한도로 요청한 전체 빌드는 152,360 ms에 완료됐다. native 전용 step에서 `uses actual LPAC file denial and leaves the original repository unchanged`와 `passes real pipe/network/path preflight and runs npm test/build on a fresh source snapshot`가 모두 skip 없이 통과했다. [Windows native job · 시도 1](https://github.com/Sangeok/stagekeeper/actions/runs/44323638799/job/134877922922)

**E2 · macOS.** ARM64 118,451 ms, Intel 130,364 ms. 두 빌드 artifact에서 300,000 ms 요청, 종료 코드 0, 자식 종료 확인, snapshot 쓰기 폐기, 원본 저장소 쓰기·역할 네트워크·DB URL 제공 없음, 모델 호출 0을 대조했다. 두 job에서 Seatbelt 및 sandbox identity probe와 smoke 서버 단계도 성공했다. push에서 제외되는 수동 조사 3개는 이 실행에 해당하지 않는다. 빌드 artifact ID는 ARM `14438491832`, Intel `14437474073`이며 만료일은 2027-02-16 UTC다. [ARM64 job](https://github.com/Sangeok/stagekeeper/actions/runs/44323638486/job/134879762997) · [Intel job](https://github.com/Sangeok/stagekeeper/actions/runs/44323638486/job/134879762127)

**E3 · 작업 트리.** Windows의 directory observation counterexamples와 macOS의 native usage qualification이 각각 성공했다. 다른 OS 전용 step의 skip은 해당 runner에서 의도된 동작이다. [Windows job](https://github.com/Sangeok/stagekeeper/actions/runs/44323638532/job/134868948146) · [macOS job](https://github.com/Sangeok/stagekeeper/actions/runs/44323638532/job/134868947953)

**E4 · 공개 Codex 공유 배포.** 세 `summary.json`을 직접 읽어 후보·previous·templates SHA, `result=pass`, Codex `0.167.1`, 플러그인 `0.6.16`, 실제 loader·신규 설치·업데이트·수정 파일 거부/복구·모델 없는 세션을 포함한 검사 7개를 대조했다. 이전 및 후보 package/runtime/verifier 해시 필드도 확인했다. 첫 시도에서 ARM 러너 미배정으로 취소됐고 ARM만 다시 실행했다. 각 OS의 결과는 한 번씩 집계한다. 아래 artifact의 만료일은 2026-12-02 UTC다. [공유 배포 실행](https://github.com/Sangeok/stagekeeper/actions/runs/44323638605)

| OS | 결과를 만든 job / attempt | Artifact ID | 후보 package SHA256 |
| --- | --- | --- | --- |
| Windows x64 | [134868948024](https://github.com/Sangeok/stagekeeper/actions/runs/44323638605/job/134868948024) / 1 | 14435213598 | `e356f6476b50b7adef97f5a25c5ec51eaf66f834903f63a7d726ce910b1d432b` |
| macOS Intel | [134868947613](https://github.com/Sangeok/stagekeeper/actions/runs/44323638605/job/134868947613) / 1 | 14435928944 | `75fd116715b39af563d5bb5ebafda0cd13bb9b3f81018878dcff75b36db61fcc` |
| macOS ARM64 | [134882629752](https://github.com/Sangeok/stagekeeper/actions/runs/44323638605/job/134882629752) / 2 | 14439465557 | `be64be34ec0d1fd631a9ba0453ea6adc621fd193106bc8fb3293d1a9a8c5eb99` |

**E5 · 공개 Claude init.** 각 leg의 서버 checkout SHA, `pluginCommit`, `templatesCommit`, OS·시나리오, 실제 smoke step, 전체 단계 결과와 정리 경고를 확인한다. update는 `previousCommit`도 대조한다. 신규의 재실행 무변경·Pro 전환과 update의 기존 MCP 연결·동기화가 대상이다. 아래 시간은 각 리허설의 `seconds`다. 공개 설치는 인증 모델을 호출하지 않는 helper 경로로 실행했다. `modelCalls` 과금 계측값은 공개 설치 요약에 포함되지 않는다. [수동 실행 44340935279](https://github.com/Sangeok/stagekeeper/actions/runs/44340935279)

| 시나리오 | 최초 실행 job / attempt | Claude 버전 | 통과 단계 / 초 | 검토 |
| --- | --- | --- | --- | --- |
| Windows 신규 | [134930393334](https://github.com/Sangeok/stagekeeper/actions/runs/44340935279/job/134930393334) / 1 | 2.1.327 | 23 / 21 | 정리 실패 경고 0 |
| Windows 업데이트 | [134930392445](https://github.com/Sangeok/stagekeeper/actions/runs/44340935279/job/134930392445) / 1 | 2.1.327 | 22 / 26 | 이전 SHA 일치. 정리 실패 경고 0 |
| macOS ARM 신규 | [134930393024](https://github.com/Sangeok/stagekeeper/actions/runs/44340935279/job/134930393024) / 1 | 2.1.327 | 23 / 9 | 정리 실패 경고 0 |
| macOS ARM 업데이트 | [134930393268](https://github.com/Sangeok/stagekeeper/actions/runs/44340935279/job/134930393268) / 1 | 2.1.327 | 22 / 6 | 이전 SHA 일치. 정리 실패 경고 0 |

기록 Action이 게시한 schema 1 행에서 후보 SHA·템플릿·네 leg의 성공을 대조했다. [게이트 원장 행](https://github.com/Sangeok/stagekeeper/issues/319#issuecomment-6984078703)

**E6 · private 실행 대상(읽기 전용).** GitHub 연결로 private `dev`의 workflow revision `9c947d48b5908ef38b4cb911d3163a658500ddc7`에서 `ci-target.json`과 `codex-ci.yml`을 대조했다. 고정된 제품 SHA는 `040827e3c3bb876c413025bdf4ed491d0383790a`, 이전 소스는 `f882bb96450580d51dc63f142d19531a67185132`, 템플릿은 `99245acd018d26a7c1238f34323951159c41d954`이다. 수동 입력은 phase 선택이며 workflow가 이 파일에서 제품·이전 판 pin을 읽어 checkout한다. 현재 구성으로는 이번 후보와 템플릿을 검사할 수 없다. [대상 설정](https://github.com/Sangeok/stagekeeper-codex-ci/blob/9c947d48b5908ef38b4cb911d3163a658500ddc7/ci-target.json) · [workflow](https://github.com/Sangeok/stagekeeper-codex-ci/blob/9c947d48b5908ef38b4cb911d3163a658500ddc7/.github/workflows/codex-ci.yml)

공개 job 로그의 만료 시각은 조회 결과에 없어 미확인으로 기록한다. 위 표에는 해당 시점의 검토 결과와 재조회 가능한 job 번호를 보존했다.

## Findings and Follow-up

| ID | 영향 | 근거와 해소 조건 |
| --- | --- | --- |
| F1 | 공개 실제 모델 실행 범위 | 실제 모델 사용 범위·예산 확인 대기. 공개 eval 전체, pipeline의 두 시나리오를 구독 사용 한도 내에서 직렬로 수행하고 후보·입력이 일치하는 결과를 기록한다. |
| F2 | private 인수 차단 | E6에서 현재 pin 불일치를 확인했다. 소유 작업에서 후보에 맞는 pin과 이전 bundle을 검토해 반영한 뒤 신뢰 러너·실행 범위를 확인하거나, 담당자가 이미 실행한 동일 후보의 검토 가능한 증거를 제공해야 한다. |
| F3 | 결과의 증명 범위 | 공개 Claude source 설치의 `pluginCommit`은 marketplace checkout에서 확인한 값이다. 해당 실행의 설치 cache `payloadSha256`은 공개 요약에 없어 schema 2 설치물 일치는 미검증이다. |

## Test Data and Cleanup

공개 Codex 공유 배포 세 요약에서 server·fixture·client·database 정리가 모두 `pass`이고 `cleanup.errors`는 비었다. 공개 Claude init의 fixture 삭제 실패·서버 정지 실패는 smoke job의 전체 로그와 요약을 대조한다. 네 공개 설치 job의 전체 로그에서 `cleanup: the fixture user was not deleted` 및 `server-cleanup failed; fixture preserved` 경고는 0건이었다. DB에 직접 접속해 잔류 행을 조회한 증거는 수집하지 않았다. 공개 보고서에는 job·artifact 식별자, 해시와 허용된 요약값만 기록했다.

## Conclusion

공개 native 및 Claude 설치 인수와 Codex 공유 배포 보조 증거를 확보했다. 실제 모델·private 검증의 미충족 행은 같은 캠페인에서 이어서 기록한다. 이 보고서의 판정 범위에는 병합과 운영 승격이 포함되지 않는다.

## Review Checklist

- [x] 모든 실행 행에 기준과 필수 여부를 연결했다.
- [x] 후보·입력·원래 attempt를 대조했고, 결과 보관 범위와 원문 비공개 조건을 확인했다.
- [x] 미실행·차단 행과 공개 검사에서 실제로 관측한 동작을 구분했다.
- [ ] 모든 필수 행의 증거와 정리·검토 결정을 수집해 최종 판정을 내린다.
