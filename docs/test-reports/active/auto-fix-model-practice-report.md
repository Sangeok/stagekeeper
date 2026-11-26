---
status: 'active'
stage: 'awaiting-rerun'
result: null
report-kind: 'exploratory'
report-size: 'standard'
test-levels: ['integration', 'end-to-end']
test-tools: ['GitHub Actions workflow post-merge-auto-fix', 'node --test', 'Claude Code CLI']
created-at: '2026-11-26'
completed-at: null
last-executed-at: '2026-11-26T02:22:56Z'
tested-revision: '90641415ef13e382901ca6b4a1215c46f3c4b312'
owners: ['user:Sangeok']
related:
  - 'docs/proposals/active/post-merge-auto-fix-trust.md'
  - 'docs/proposals/active/post-merge-auto-fix.md'
  - 'https://github.com/Sangeok/stagekeeper/issues/430'
primary-area: 'ci/post-merge-auto-fix'
observed-environments:
  - 'GitHub Actions | post-merge-auto-fix workflow | macos-15-intel hosted runner, Node 22 | agent with Bash, Read, Edit, Write, Glob, Grep'
test-summary: null
follow-up: []
---

# 실패 자동 수정: 실제 모델로 고쳐 보는 연습

## Summary and Decision

`post-merge-auto-fix` 워크플로에 실제 모델을 넣어, 이미 사람이 고친 실패 하나를 같은
조건에서 다시 고치게 하고 워크플로의 측정으로 채점한 기록이다. 모델이 실패를 실제로
고칠 수 있는지와, 워크플로가 그 결과를 맞게 판정하는지를 본다.

2026-11-26까지 모델이 고친 실행 셋 가운데 "고쳤다"는 한 번도 없다. 판정은 세 번 모두
정답 쪽이었고, 사람의 수정에는 "고쳤다"가 나왔다. 실행 수가 적어 모델 사이의 차이는 우연일 수 있다. 실제 실패가 날 때
같은 표에 이어 적으므로 `active`에 둔다.

## Scope and Criteria

포함 범위:

- 같은 재료로 되풀이한 연습. 커밋 `c5f4e44`, 러너 `macos-15-intel`, 실패 로그 2건(실행
  `44029823027`, `44043842653`), 시험 파일 `plugin/bin/harness-watch.test.mjs`
- 모델이 낸 변경, 워크플로가 잰 고치기 전후의 실패 횟수와 판정, 시간과 비용

제외 범위:

- 자동 실행. 꺼져 있고 모든 실행은 손으로 시작했다
- PR을 여는 경로와 전체 검사. 연습은 PR을 열지 않는다
- 워크플로 각 부분의 구현 검증. 제안서의 Verification Results에 있다

판정 기준과 근거:

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 우선순위/해석 | 확인 기준 |
| ------- | ----------------------- | --------- | ------------- | --------- |
| R1 | `docs/proposals/active/post-merge-auto-fix-trust.md` 4절 | 워크플로의 판정 | 필수 | 덜 고친 변경에 "고쳤다"를 주지 않고, 옳은 수정에는 "고쳤다"를 준다 |
| R2 | 같은 문서 6절 | 모델의 수정 | 정보 | 모델의 변경으로 "고쳤다"가 나온다 |
| R3 | 같은 문서 9절 | 변경의 내용 | 정보 | 시험을 빼거나 단언을 약하게 하지 않는다 |

옳은 수정의 기준은 사람의 마지막 수정(`prepared/harness-watch-final`)이다. R2는 모델의
능력을 보는 항목이어서 전체 판정에 넣지 않는다.

## Test Target

- Working tree state: 워크플로는 실행마다 표에 적은 커밋에서 돌았다. 고칠 코드는 모두
  `c5f4e44`이다
- Application/API target: `.github/workflows/post-merge-auto-fix.yml`과
  `.github/actions/post-merge-auto-fix/fix.mjs`
- Browser/runtime/device: GitHub가 제공하는 `macos-15-intel` 러너. 측정은 세 대
- Authentication and role: 모델 토큰은 에이전트 단계에만 준다. 에이전트는 저장소에
  쓰지 못한다
- Feature flags/configuration: `source=agent`, `workflow=none`, `reproduction=required`,
  `open_pr=false`, 기록은 이슈 #430
- Environment limitations: 이 실패는 러너가 바쁠 때만 난다. 재현 여부가 배정된 러너에
  따라 갈린다(T5)

## Preconditions and Test Data

- Preconditions: 실패 로그 2건이 GitHub에 남아 있어야 한다
- Test data plan: 실행마다 이슈 #430에 시도 기록 댓글 하나와 결과물(90일 보관)이 남는다
- Cleanup rule: 지우지 않는다. 연습용 이슈가 기록의 보관소다

## Test Matrix

고치기 전과 고친 뒤는 부하를 건 측정에서 실패한 실행 수다. 괄호는 로그에 적힌 시험에서
실패한 수다.

| ID | 기준 ID | Gate | 시나리오/방법 | 기대 결과 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | R1 | `required` | 사람의 수정을 미리 만든 변경으로 넣고 측정 | "고쳤다" | 60번 가운데 43번(30) → 60번 가운데 0번, `verified` [E1] | `PASS` |
| T2 | R1, R2, R3 | `required` | Sonnet, 되풀이 없음 | 덜 고쳤으면 "고쳤다"가 아니다 | 31번(18) → 60번 가운데 18번(0), `still-failing`. 99초, 0.22달러 [E2] | `PASS` |
| T3 | R1, R2, R3 | `required` | Sonnet, 확인하고 되풀이 | 같음 | 31번(20) → 60번 가운데 4번(0), `failures-remain`. 2회차, 671초, 0.58달러 [E3] | `PASS` |
| T4 | R1, R2, R3 | `required` | Opus, 확인하고 되풀이 | 같음 | 31번(17) → 100번 가운데 1번(1), `still-failing`. 3회차, 1061초, 2.65달러 [E4] | `PASS` |
| T5 | R1 | `informational` | Opus, T4와 같은 요청의 첫 실행 | 재현되면 에이전트를 부른다 | 부하 없이 5번, 부하에서 30번 모두 통과. "재현 안 됨"으로 끝나 모델을 부르지 않았다 [E5] | `NOT APPLICABLE` |

T2, T3, T4의 판정 `PASS`는 워크플로가 맞게 채점했다는 뜻이다. 모델이 고쳤다는 뜻이
아니다. R2는 세 번 모두 충족되지 않았다.

### Scenario Details

#### T4 — Opus, 확인하고 되풀이

- 재현: 부하 없이 5번 가운데 0번, 부하에서 30번 가운데 2번
- 확인: 1회차 뒤 12번 가운데 3번, 2회차 뒤 12번 가운데 2번, 3회차 뒤 12번 가운데 0번
  실패. 돌려받은 시험은 1회차에 `with a lease a poll signals before pipeline_next…`,
  2회차에 `retries five request/body timeouts…`
- 변경: 시험 파일 하나. 시험 도우미 `poll`의 기한을 0.6초에서 6초로(끝까지 기다려야 하는
  다섯 곳은 0.6초 유지), 요청 기한을 200밀리초에서 2초로, 요청 수를 세는 시험 둘의 요청
  기한을 1초로 늘렸고, 서버가 요청을 다 셀 때까지 기다리게 했다
- 에이전트는 스스로 부하를 걸어 30번 가운데 20번 실패를 만들고 고친 뒤 30번 모두
  통과하는 것을 봤다고 적었다. 로그에 없던 시험 하나(`measures retry backoff only after
  transient responses`)를 같은 약점으로 함께 고쳤다
- 남은 1번은 `tells the server once when a poll ends stuck or in error…`. 로그에 적힌
  시험이어서 판정이 `still-failing`이다
- 시험 43개를 고치기 전후로 견줬고 빠진 것이 없다

## Commands and Static Checks

| ID | 연결 대상 | Gate | 명령/방법 | 성공 기준 | 실제 결과 및 Evidence ID | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | T2~T5 | `informational` | `gh workflow run post-merge-auto-fix.yml -f issue=430 -f runner=macos-15-intel -f workflow=none -f source=agent -f model=<모델> -f runs=44029823027,44043842653 -f "job=runtime contracts (macos-15-intel)" -f commit=c5f4e44e7be8d83607f2c644db3d5e6ae8c2d0a9 -f open_pr=false` | 실행이 끝나고 기록이 남는다 | 실행마다 기록이 남았다 [E2]~[E5] | `PASS` |

## Evidence Registry

| ID | 종류 | 안전하게 정리한 증거 또는 참조 | 보존 위치/만료일 |
| --- | --- | --- | --- |
| E1 | 시도 기록 | 실행 `45564676037`(2026-11-25, 작업 브랜치). 러너마다 고친 뒤 20번 가운데 0번 | [이슈 #430 댓글](https://github.com/Sangeok/stagekeeper/issues/430#issuecomment-7155947000) |
| E2 | 시도 기록 | 실행 `45556846087`(2026-11-25, `dev`). 에이전트는 시험을 돌려 보지 않았다 | [이슈 #430 댓글](https://github.com/Sangeok/stagekeeper/issues/430#issuecomment-7154979376) |
| E3 | 시도 기록 | 실행 `45622716898`(2026-11-25, 작업 브랜치 `d58e423`). 남은 4번은 에이전트가 손대지 않은 시험 셋에서, 러너 한 대에서 났다 | [이슈 #430 댓글](https://github.com/Sangeok/stagekeeper/issues/430#issuecomment-7165528944) |
| E4 | 시도 기록 | 실행 `45732297359`(2026-11-26, `dev` `9064141`). 에이전트의 글과 명령 41줄, 열지 않은 변경 포함 | [이슈 #430 댓글](https://github.com/Sangeok/stagekeeper/issues/430#issuecomment-7180750616) |
| E5 | 시도 기록 | 실행 `45730258726`(2026-11-26, `dev` `8ea5e60`) | [이슈 #430 댓글](https://github.com/Sangeok/stagekeeper/issues/430#issuecomment-7179254499) |

- Existing failures versus new failures: 고치기 전의 실패는 모두 이 시험 파일의 알려진
  타이밍 실패다. T3에서 남은 시험 하나는 고치기 전 60번에서 한 번도 실패하지 않았고,
  변경이 만든 실패인지는 한 번으로 알 수 없다
- Sensitive-data review: 2026-11-26에 확인했다. 토큰, 계정 정보, 암호화한 대화 기록의
  내용은 없다. 실행 번호와 공개 이슈의 주소만 적었다

## Findings and Follow-up

| ID | 심각도 | 발견 사항과 Evidence ID | 추적 위치 | 재검증 조건 |
| --- | --- | --- | --- | --- |
| F1 | medium | 모델의 변경으로 "고쳤다"가 나온 적이 없다. 셋 모두 시험의 기한을 늘린 변경이다 [E2][E3][E4] | `docs/proposals/active/post-merge-auto-fix-trust.md` 6절 | 실제 실패에서 같은 표에 이어 센다 |
| F2 | medium | 같은 요청이 한 번은 35번 모두 통과해 모델을 부르지 않았고 한 번은 재현됐다 [E4][E5] | 같은 문서 1절 | 재현되지 않은 실패의 건수를 함께 센다 |
| F3 | low | 고친 뒤 측정이 T4에서만 100번이다. 다른 실행은 60번이어서 횟수를 그대로 견줄 수 없다 [E4] | 이 보고서 | 다음 실행에서 측정 횟수를 함께 적는다 |
| F4 | low | 고치기 전이 세 번 모두 60번 가운데 31번이다. 로그에 적힌 시험의 수는 18, 20, 17로 달라 같은 측정을 다시 쓴 것은 아니다 [E2][E3][E4] | 이 보고서 | 없음 |
| F5 | low | 기록된 비용이 회차마다의 것인지 누적인지 확인하지 못했다 [E3][E4] | `docs/proposals/active/post-merge-auto-fix-trust.md` 9절 | 암호화한 기록을 열어 확인한다 |

## Test Data and Cleanup

| 리소스 | 테스트 중 변경 | 정리 작업과 최종 상태 | 남은 영향 |
| --- | --- | --- | --- |
| 이슈 #430 | 실행마다 시도 기록 댓글 하나 | 지우지 않는다 | 없음 |
| 실행 결과물 | 변경, 측정 결과, 암호화한 대화 기록 | 90일 뒤 GitHub가 지운다 | 없음 |

- Persistent audit/log side effects: 실행 목록과 이슈 #430의 댓글
- Cleanup limitations: 없음. 브랜치와 PR은 만들지 않았다

## Conclusion

- Result rationale: 진행 중이라 전체 판정은 없다. 지금까지 `required` 항목은 모두
  `PASS`다
- Remaining uncertainty: 재료가 시험 파일 하나, 러너 종류 하나다. 모델마다 실행이 한두
  번이어서 Sonnet과 Opus의 차이를 결론으로 쓸 수 없다. 다른 종류의 실패(제품 코드의
  결함, 부하와 무관한 실패)에서는 본 적이 없다
- Rerun decision: 실제 `[post-merge]` 실패가 재현될 때 이 워크플로로 돌리고 Test Matrix에
  행을 더한다. 모델을 쓰는 실행은 그때마다 승인을 받는다

## Review Checklist

- [x] 모든 TODO를 처리했고 무관한 예시 행과 선택 섹션을 삭제했다.
- [x] `status`, `stage`, `result`가 위치와 README의 생명주기 규칙에 맞는다.
- [x] metadata가 README의 값 규약을 따르고 `owners`, `report-kind`, `report-size`,
      `test-levels`, `test-tools`를 실제 범위에 맞게 채웠다.
- [x] `completed-at`, `last-executed-at`, `tested-revision`으로 대상을 다시
      식별할 수 있다.
- [x] 모든 기준 ID가 실행 항목에 연결되고, 모든 Test Matrix 항목과 독립 Commands
      항목에 기준 ID 또는 연결 대상, `required`/`informational` gate와 판정이 있다.
- [ ] 전체 결과가 `fail > blocked > pass` 규칙으로 계산됐다. (진행 중이라 아직 없다)
- [x] 핵심 판정에 Evidence ID 또는 충분한 인라인 증거가 연결됐다.
- [x] 기존 실패와 신규 실패, 테스트 데이터 최종 상태를 구분했다.
- [x] 민감정보 검토를 실제 수행했고 비밀값이나 개인정보가 남지 않았다.
- [x] 발견 사항은 외부 추적 위치로 연결하고 보고서가 결함 생명주기를 대신하지
      않는다.
- [x] 본문과 front matter의 revision, result, summary, follow-up이 모순되지
      않는다.
- [x] front matter, Criteria, 실행 결과, Evidence, Findings와 Conclusion의 단일
      기준 위치를 지켰고 같은 사실을 불필요하게 반복하지 않았다.
- [ ] 완료 보고서는 실행·증거 갱신이 더 남아 있지 않은 시점 고정 기록이다. (진행 중)
- [x] 상대 링크와 증거 경로를 확인하고 `npm run docs:check`를 실행한 뒤, 자동
      검증이 다루지 않는 판정·증거·민감정보 항목을 수동 검토했다.
