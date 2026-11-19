---
status: "completed"
stage: null
result: "fail"
report-kind: "acceptance"
report-size: "standard"
test-levels: ["contract", "integration", "end-to-end"]
test-tools: ["GitHub Actions", "GitHub CLI", "node:test", "Python zipfile"]
created-at: "2026-11-19"
completed-at: "2026-11-19"
last-executed-at: "2026-11-19T04:40:07Z"
tested-revision: "84d801654128e2f02e3f607463cbfcdac02b817c"
owners: ["user:Sangeok"]
related:
  - "docs/proposals/active/ci-verification-code-organization-phase-cvo3.md"
  - "docs/proposals/active/ci-verification-code-organization.md"
  - "docs/test-reports/completed/2026-11-19-cvo3-client-acceptance-report.md"
primary-area: "ci/client-acceptance"
observed-environments:
  - "dev | Claude Code | Windows Server 2022 x64 | CI"
  - "dev | Claude Code | macOS 15 ARM64 | CI"
  - "dev | native runtime 및 공유 배포 | macOS 15 Intel | CI"
  - "private dev | Codex CLI | macOS ARM64 전용 러너 | CI"
test-summary: "fail: 필수 17개 중 통과 10개, 실패 1개, 미실행 6개"
follow-up: ["docs/proposals/active/ci-verification-code-organization-phase-cvo3.md", "docs/proposals/active/dual-client-ci-parity.md"]
---

# CVO3 후보 84d8016 클라이언트 인수

## Summary and Decision

**FAIL.** 필수 17개 중 native·설치 10개가 통과했다. private Codex eval이 첫 `dry-run-only`에서 실패했다. 선행 실패로 private pipeline이 시작되지 않았고, 승인된 중단 조건에 따라 공개 모델 항목 5개도 미실행으로 마감했다.

## Scope and Criteria

REQ-CVO-007은 하나의 후보에서 VFY-CVO-08의 native·작업 트리 검사, VFY-CVO-09의 실제 설치, VFY-CVO-10의 실제 모델 평가 및 시나리오별 파이프라인을 모두 요구한다. T01–T18 중 T05는 보조 증거이며 나머지 17개를 필수 항목으로 집계한다. 별도 schema 2 수집기는 설치물·출처·정리가 공통 증거 계약까지 충족하는지 따로 판정한다. [CVO3 상세 실행 계획](../../proposals/active/ci-verification-code-organization-phase-cvo3.md)

## Test Target

공개 후보는 [#390 병합 커밋](https://github.com/Sangeok/stagekeeper/commit/84d801654128e2f02e3f607463cbfcdac02b817c)이다. 공개 Claude는 GitHub marketplace를 통해 설치하고 Codex는 네이티브 배포 번들을 사용한다. 직전 후보의 12개 통과는 새 후보 집계에서 제외했다. [직전 후보 결과](../completed/2026-11-19-cvo3-client-acceptance-report.md)

## Preconditions and Test Data

- 템플릿은 `8ccb37a4ab91de527e6a23caa6d415c7cdc6f215`로 고정했다. 공개 Claude 업데이트의 이전 `main`은 `c7c0a1314f680124196d9338eb94a46759ec4437`, 공개 Codex 공유 배포의 이전 fixture는 `85c66fb1d9e02c3d9416710240cbfca3f0023939`다.
- private `ci-target.json`에서 제품 SHA를 바꾸고 이전 제품 `f882bb96450580d51dc63f142d19531a67185132`와 템플릿을 확인했다. 로컬 Node 22 테스트 133개와 PR 검사가 통과했다. 병합된 private workflow SHA는 `5f4b10deb626882f231ff822fcf9157edb0976fe`다. [비공개 PR #17](https://github.com/Sangeok/stagekeeper-codex-ci/pull/17)
- 시작할 때 후보의 push CI 3개와 수동 게이트 0개를 확인했다. 열린 [#388](https://github.com/Sangeok/stagekeeper/issues/388)과 [#387](https://github.com/Sangeok/stagekeeper/issues/387)은 후보가 다르다. 소유자는 공개 `truncate`가 끝날 때까지 다른 `dev` 병합 보류, 유료 워크플로 최대 4회·재시도 0회를 승인했다. 필수 실패 또는 후보 변경 시 후속 유료 실행을 중단한다.

## Test Matrix

| ID | 기준 | Gate | 확인한 대상 | 판정 | 근거 |
| --- | --- | --- | --- | --- | --- |
| T01 | VFY-CVO-08 | required | Windows x64 native·offline build | PASS | E1 |
| T02 | VFY-CVO-08 | required | macOS ARM64 native·offline build | PASS | E1 |
| T03 | VFY-CVO-08 | required | macOS Intel native·offline build | PASS | E1 |
| T04 | VFY-CVO-08 | required | Windows·macOS 작업 트리 | PASS | E1 |
| T05 | VFY-CVO-09 | informational | 공개 Codex 공유 배포, 세 OS | PASS | E2 |
| T06 | VFY-CVO-09 | required | 공개 Claude Windows 신규 설치 | PASS | E3 |
| T07 | VFY-CVO-09 | required | 공개 Claude Windows 업데이트 | PASS | E3 |
| T08 | VFY-CVO-09 | required | 공개 Claude macOS 신규 설치 | PASS | E3 |
| T09 | VFY-CVO-09 | required | 공개 Claude macOS 업데이트 | PASS | E3 |
| T10 | VFY-CVO-09 | required | private Codex 신규 설치 | PASS | E4 |
| T11 | VFY-CVO-09 | required | private Codex 업데이트 | PASS | E4 |
| T12 | VFY-CVO-10 | required | 공개 Claude 전체 eval | NOT RUN | E6 |
| T13 | VFY-CVO-10 | required | 공개 Claude Windows slug | NOT RUN | E7 |
| T14 | VFY-CVO-10 | required | 공개 Claude macOS slug | NOT RUN | E7 |
| T15 | VFY-CVO-10 | required | 공개 Claude Windows truncate | NOT RUN | E7 |
| T16 | VFY-CVO-10 | required | 공개 Claude macOS truncate | NOT RUN | E7 |
| T17 | VFY-CVO-10 | required | private Codex eval | FAIL | E5 |
| T18 | VFY-CVO-10 | required | private Codex pipeline | NOT RUN | E5 |

## Commands and Static Checks

- `gh api`와 `gh run view`로 실제 후보, 입력, attempt, job, 실행 단계, artifact와 원장을 대조했다. Windows TAP 로그와 macOS 빌드 JSON을 별도로 읽었다. E1.
- 공개 `shared-distribution-acceptance.yml`와 고정 `template_commit`으로 `client-init-smoke.yml`을 수동 실행했다. 비공개 `start-runner.mjs --dispatch --phase init`과 동일 run의 읽기 전용 `collect-init-evidence.mjs` 결과를 분리했다. E2–E4.
- 비공개에서 `node scripts/start-runner.mjs --dispatch --phase all --run-models`를 1회 실행했다. 공개 `agent-eval`·`pipeline-smoke`를 포함해 후보별 실행 목록을 다시 조회했고 실제 dispatch를 원래 attempt와 대조했다. E5–E7.

## Evidence Registry

**E1. Native 및 작업 트리.** Windows에서 실제 LPAC 접근 거부와 새 snapshot의 네트워크·경로·빌드 TAP 사례가 skip 없이 성공했다. offline build는 93,482ms였다. macOS ARM64와 Intel에서 필수 Seatbelt·sandbox identity probe, smoke 서버, 제품 시험과 300초 한도의 격리 빌드가 성공했다. 두 artifact에서 모델 호출 0, 원본 쓰기 없음, 자식 종료, snapshot 쓰기 폐기를 대조했다. 각각 61,530ms와 143,657ms였고 artifact ID는 `14494627147`·`14494508093`, 만료일은 2027-02-17 UTC다. 작업 트리 검사도 두 OS에서 성공했다. 모두 원래 attempt 1이다. [Windows](https://github.com/Sangeok/stagekeeper/actions/runs/44446952082/job/135307489026) · [macOS ARM64](https://github.com/Sangeok/stagekeeper/actions/runs/44446951841/job/135305666173) · [macOS Intel](https://github.com/Sangeok/stagekeeper/actions/runs/44446951841/job/135305665750) · [Windows 작업 트리](https://github.com/Sangeok/stagekeeper/actions/runs/44446951964/job/135301294765) · [macOS 작업 트리](https://github.com/Sangeok/stagekeeper/actions/runs/44446951964/job/135301295131)

**E2. 공개 Codex 공유 배포.** 세 OS에서 후보·이전·템플릿 SHA와 package·runtime·verifier 해시를 확인했다. 각 artifact의 7개 검사가 통과했고 모델 호출과 정리 오류는 0이었다. [원본 실행](https://github.com/Sangeok/stagekeeper/actions/runs/44458542403)

- macos-15-intel, attempt 1. 후보 package SHA256 `75fd116715b39af563d5bb5ebafda0cd13bb9b3f81018878dcff75b36db61fcc`. [artifact 14499256478](https://github.com/Sangeok/stagekeeper/actions/runs/44458542403/artifacts/14499256478) (만료 2026-12-03 UTC)

- macos-15, attempt 1. 후보 package SHA256 `be64be34ec0d1fd631a9ba0453ea6adc621fd193106bc8fb3293d1a9a8c5eb99`. [artifact 14499135910](https://github.com/Sangeok/stagekeeper/actions/runs/44458542403/artifacts/14499135910) (만료 2026-12-03 UTC)

- windows-2022, attempt 1. 후보 package SHA256 `e356f6476b50b7adef97f5a25c5ec51eaf66f834903f63a7d726ce910b1d432b`. [artifact 14498504296](https://github.com/Sangeok/stagekeeper/actions/runs/44458542403/artifacts/14498504296) (만료 2026-12-03 UTC)

**E3. 공개 Claude 설치.** 네 leg에서 서버 checkout, marketplace SHA, 고정 템플릿 SHA, 업데이트의 이전 SHA를 확인했다. Claude `2.1.328`, 플러그인 `0.6.16`으로 신규 시나리오는 23단계, 업데이트는 22단계가 모두 통과했다. 네 로그에서 fixture 삭제·서버 정리 경고 0건을 확인했다. 공개 설치 요약에는 설치 캐시의 payload 해시가 없다. [Windows 신규](https://github.com/Sangeok/stagekeeper/actions/runs/44458526583/job/135339389199) · [Windows 업데이트](https://github.com/Sangeok/stagekeeper/actions/runs/44458526583/job/135339389162) · [macOS 신규](https://github.com/Sangeok/stagekeeper/actions/runs/44458526583/job/135339388860) · [macOS 업데이트](https://github.com/Sangeok/stagekeeper/actions/runs/44458526583/job/135339389177) · [원장](https://github.com/Sangeok/stagekeeper/issues/319#issuecomment-6999741112)

**E4. Private Codex 설치.** Codex codex-cli 0.167.1, 플러그인 0.6.16. 신규 설치 7.436초, 이전 0.6.10에서 업데이트 7.809초. 실제 설치 캐시의 inventory, Claude 설정·roster 보존, fixture 삭제와 runner·DB 종료를 확인했다. 후보 package SHA256은 `53b7810da611eadf682b03742e8478c72c14d633d731bd9ba398823962ac515f`이며 두 시나리오의 모델 호출은 0회다. [비공개 Mac job](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44458783806/job/135340280372)

같은 실행의 schema 2 수집기 결과는 `FAIL`이다. init-new-user의 `cleanup-incomplete`, init-update의 `incomplete-checks`, init-update의 `cleanup-incomplete`를 보고했다. 이전 설치물에서 부여된 실행 pin 보존은 관측되지 않았고 진단 workspace는 보관됐다. 보조 판정은 필수 설치 결과와 분리했다. [비공개 인수 artifact](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44458783806/artifacts/14499270577)

**E5. Private Codex 실제 모델.** [private 전체 실행 · attempt 1](https://github.com/Sangeok/stagekeeper-codex-ci/actions/runs/44459543327/job/135342719666)에서 구독 인증, 신규 설치와 업데이트가 성공했다. 반복된 설치는 T10·T11에 중복 집계하지 않았다. 코드 사본은 #390 병합 후보, private workflow는 E4와 같은 SHA였다.

평가의 실제 쓰기 대조군은 통과했다. 첫 `dry-run-only`에서 모델 턴과 패키지 검사는 끝났지만 설치된 런처로 `init --client codex --dry-run`을 호출한 도구 이벤트가 없었다. 평가기는 파일 보존과 스킬 읽기를 확인한 후 `The model must execute the native dry run`에서 실패했다. 코드 파일을 읽은 출력에 포함된 완료 문구는 명령 실행 증거에 포함하지 않았다. 보호된 기록에서 모델은 native 명령이 서버 URL을 출력하기 때문에 무필터 출력 보존과 환경값 출력 금지가 충돌한다고 해석했다. 이는 그 턴이 보고한 판단 근거다. 이전 후보에서 실패했던 `modified-file`에는 도달하지 않았다.

wrapper는 init 두 단계만 완료해 `2/4`, `result=fail`이었다. 보존된 eval 이벤트 두 턴의 입력은 225,298 tokens(캐시 176,896 포함), 출력은 1,613 tokens였다. 구독 인증은 별도 단계다. 전체 모델 호출·청구액은 wrapper에서 미관측이다.

**E6. 공개 Claude eval.** 기본 전체 Claude eval은 private 필수 eval 실패 후 중단 조건이 적용되어 dispatch 0회다. T12는 미실행이다.

**E7. 공개 Claude pipeline.** 공개 `slug` 및 `truncate`는 각각 dispatch 0회다. 두 OS의 4개 필수 행을 미실행으로 기록했다. 이번 후보에서 [#388](https://github.com/Sangeok/stagekeeper/issues/388)의 macOS 설치 경합은 재검증되지 않았다.

## Findings and Follow-up

1. **F1 · native dry-run 실행 누락.** 한 턴에서 원본 진단을 남기라는 안내와 환경값 출력 금지를 함께 해석하면서 실행이 중단됐다. 후속 수정은 native 명령이 내보내는 진단, 툴 결과에 보존할 안전한 실행 증거, 사용자에게 공개할 요약의 경계를 일치시켜야 한다. 후속 무모델 시험에서는 직접 실행한 명령의 종료 상태와 비민감 완료 증거로 통과하는 경우, 소스에서 문구만 읽어 실패하는 경우를 대조한다. E5.
2. **F2 · schema 2.** 전용 Mac의 작업 폴더 보존과 업데이트 실행 pin 미관측으로 공통 증거 판정은 실패했다. 실제 설치 동작 두 건은 통과했다. [dual-client 후속 작업](../../proposals/active/dual-client-ci-parity.md)

## Test Data and Cleanup

공개 Claude 설치 네 건의 fixture 삭제·서버 정리 경고는 0건이었다. 공개 Codex의 세 배포 artifact에서 client·DB·fixture·server 정리를 확인했다. 비공개 단독 init과 `all`의 두 설치 시나리오는 삭제 후 fixture DB 검사에 통과했다. 실패한 eval 리허설은 서버·fixture 삭제 경고 없이 끝났고 `runnerStopped=true`였다. 선행 실패 때문에 wrapper의 eval 전용 DB 행 수 검사는 실행되지 않았다. 두 비공개 작업 종료 후 `runnerSettled=true`, `databaseStopped=true`와 임시 등록 러너 0개를 확인했다. 진단 원본은 private 보관 위치에 남겼다.

## Conclusion

REQ-CVO-007은 미충족이다. 후보 `84d8016`에서 유료 워크플로 4회 중 private `all` 1회만 사용했고 재시도는 0회다. 나머지 3회는 미사용으로 종료했다. 모델 인수 과정 전체의 비용은 측정되지 않았다. 완료 보고서는 이 후보와 시점의 판정을 보존한다.

## Review Checklist

- [x] 필수 항목과 보조 증거, 실제 실행의 SHA·입력·원본 시도를 대조했다.
- [x] 보존된 이전 후보의 결과를 합산하지 않았고 모델 사용량은 실행 단위로 집계했다.
- [x] 공개 기록에는 허용된 요약만 남겼다.
