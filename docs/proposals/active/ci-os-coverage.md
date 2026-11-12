---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-12"
approved-by: "user"
approved-at: "2026-11-12"
approval-scope: "제안서의 설계 전체(지원 OS, 분류 기준, 분류표와 검사, 불일치 두 건의 해소 방법)와 제안서의 커밋·PR. 단계별 구현 PR, 이슈 생성, main 승격은 실행 직전에 각각 따로 승인받는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "AGENTS.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-writing.md"
  - "docs/proposals/completed/2026-11-12-gate-run-records.md"
---

# CI 검사의 OS 범위 분류와 불일치 해소

## Summary

CI 검사가 어느 OS에서 도는지가 검사마다 다르고, 그 차이가 의도한 것인지 빠진 것인지 적힌 곳이 없다. 같은 제품 코드 시험을 macOS는 전부 돌리고 Windows는 손으로 고른 일부만 돌린다. 파이프라인 전체는 Windows에서만 돈다.

이 제안은 세 가지를 한다. 검사마다 OS 범위를 분류하는 기준을 정한다. 그 분류를 문서의 표 하나에 두고, 시험이 workflow와 표를 대조해 분류가 빠졌거나 반대쪽 OS가 빠진 변경을 `check`에서 막는다. 지금 있는 불일치 두 건을 해소한다.

## Goal

- CI 검사를 추가하거나 바꿀 때 "OS와 무관한가, OS마다 필요한가, 한 OS에만 두는가"를 반드시 정하게 한다.
- OS마다 필요한 검사는 한쪽 OS만 추가한 채로 머지되지 않게 한다.
- 지원하는 OS 목록을 한곳에 적고, 그 목록과 CI가 어긋나면 드러나게 한다.
- 작업 유형: 검사 스크립트와 분류표 추가, workflow 확장, 승격 절차 문서 한 줄.

## Proposal Size

`proposal-size`: standard

선택 근거:

- workflow 2개, 새 검사 스크립트와 시험, `package.json`, 문서 2개로 5개 이상 파일이 바뀐다.
- 승격 게이트 `pipeline-smoke`에 다리가 늘어난다. 새 다리가 실패하면 승격이 막힌다.
- `pipeline-smoke`의 macOS 다리는 실행마다 구독 사용량을 더 쓴다.

## Current State

2026-11-12 `origin/dev` `1bbc940` 기준이다.

이미 있는 규칙:

- [test-writing.md](../../architecture/test-writing.md)는 플러그인의 파일·프로세스·OS 권한을 해당 OS에서 검사하라고 정하고, 다른 OS에서의 통과를 그 환경의 통과로 보고하지 말라고 한다.
- [verification.md](../../architecture/verification.md)는 OS별로 검사 부분 집합이 다르면 같은 테스트를 명시적인 명령으로 선택하고 차이를 기록하라고 한다.
- 이 두 규칙을 지켰는지 확인하는 장치는 없다.

지금의 job(workflow 7개, job 12개)과 도는 OS:

| workflow / job | 도는 OS | 보는 것 |
| --- | --- | --- |
| `check` / `check`, `server-integration` | Linux | 정적 검사, 타입, 문서, 전체 단위 시험, 빌드, DB 통합 시험 |
| `windows-role-runtime` / `native-runtime` | Windows | Windows 역할 런타임과, 손으로 고른 플러그인 시험 파일 |
| `macos-runtime-contracts` / `contracts` | macOS(Apple Silicon, Intel) | macOS 런타임 계약과 제품 코드 시험 전체 |
| `client-init-smoke` / `claude` | Windows, macOS | 실제 클라이언트로 설치와 init(모델 없음) |
| `agent-eval` / `init-skill` | macOS | 실제 모델이 init 스킬을 따르는지 |
| `pipeline-smoke` / `pipeline` | Windows | 실제 모델과 실행기로 항목 하나를 끝까지 |
| 세 게이트의 `record` | Linux | 게이트 실행 기록 |
| `template-release` / `validate`, `deploy` | Linux | 템플릿 release 운영 |

지원 OS:

- 2026-11-12 소유자가 지원 OS를 Windows와 macOS로 정했다. Linux는 지원 목록에 넣지 않는다. 목록에 넣으면 앞으로의 OS별 검사 전부에 Linux를 맞춰야 하고, 지금은 그 부담을 질 이유가 없다는 판단이다.
- Linux에서도 단위 시험과 빌드는 돈다(`check`). Claude용 플러그인 코드의 OS 분기는 `win32`인지 아닌지 둘뿐이어서 Linux는 macOS와 같은 코드 경로를 탄다. 다만 Linux에서 실제 클라이언트로 설치와 init을 확인한 적은 없다.
- 웹의 토큰 설정 안내 문구([product-copy.md](../../conventions/product-copy.md)의 `token-reveal-user`)에는 "macOS · Linux" 줄이 있다. 설정 방법을 알려 주는 줄이고, 이 제안은 그 문구를 바꾸지 않는다.
- `darwin`을 따로 보는 코드는 Codex 쪽(`codex-thread.mjs`, `implementation-copy.mjs`, macOS 역할 런타임)과 macOS 설치 번들의 진입점(`harness-platform.mjs`)에만 있다. Codex는 코드에서도 Windows와 macOS만 받는다(`codex-platform.mjs`).

불일치 두 건:

1. **제품 코드 시험.** macOS는 `packages/core`, `packages/github`, `plugin/bin`, `plugin/runtime`의 시험 전체를 한 파일씩 순서대로 돌린다. Windows는 `windows-role-runtime`이 이름을 적은 시험 파일만 돌린다. 목록에 없는 파일에서 Windows만의 문제가 나면 CI가 잡지 못한다. 2026-11-12 Windows 11에서 같은 범위를 같은 방식으로 돌렸더니 680개 가운데 651개 통과, 29개 건너뜀, 실패 0개였고 9분 35초가 걸렸다. 동시 실행 수 4로 돌렸을 때는 `harness-background.test.mjs`의 시험 하나가 시간 초과로 실패했고, 따로 돌리면 통과했다.
2. **파이프라인 전체.** `pipeline-smoke`는 Windows에서만 돈다. 실행기가 Windows가 아닌 OS에서 실제 Claude와 함께 도는 경로는 어떤 CI도 지나가지 않는다. [pipeline-smoke 제안서](../completed/2026-11-04-pipeline-smoke-workflow.md)는 "모델 쪽 결함은 OS와 무관하므로 한 OS면 충분하다"는 근거로 Windows 하나를 골랐다. 이 근거는 모델 동작에는 맞지만 실행기의 OS별 경로는 다루지 않는다.

의도한 차이:

- `agent-eval`이 macOS에서만 도는 것은 [클라이언트 E2E 제안서](../completed/2026-10-30-client-e2e-smoke-workflow.md)가 정했다. `claude plugin eval`은 셸 명령을 OS 샌드박스로 가두는데 Windows에는 그 샌드박스가 없다. 2026-11-12 현재 공식 문서도 샌드박스가 macOS, Linux, WSL2에서 동작한다고 적는다.
- `windows-role-runtime`과 `macos-runtime-contracts`의 런타임 검사는 OS마다 구현이 달라서 내용이 다르다.

그 밖에 확인한 것:

- `scripts/templates/template-target.ts`는 설정 파일의 POSIX 권한 값(`mode & 0o077`)으로 비공개 여부를 검사한다. Windows에서는 이 조건에 항상 걸려 어떤 파일이든 거부한다. 그래서 `template-release-cli.test.ts`의 "profile selection…" 시험이 Windows에서만 실패한다. `test:scripts`는 Linux에서만 돌아서 CI에는 보이지 않는다.
- 세 게이트의 `record` job은 다리 이름을 `legs` 입력으로 직접 받는다([gate-run-records](../completed/2026-11-12-gate-run-records.md)). gate job에 다리를 추가하고 `legs`를 고치지 않으면, 그 다리는 기록에서 조용히 빠지고 발견으로도 잡히지 않는다.
- workflow를 읽을 YAML 패키지는 직접 의존성에 없다. `js-yaml`이 ESLint를 통해 간접으로만 설치돼 있다.

## Scope

포함 범위:

- 지원 OS 목록과 분류 기준의 문서화.
- 분류표(verification.md)와, workflow와 표를 대조하는 검사 스크립트.
- AGENTS.md에 CI를 추가하거나 바꿀 때의 규칙 한 줄.
- 불일치 두 건의 해소: Windows의 제품 코드 시험 전체, `pipeline-smoke`의 macOS 다리.
- macOS 다리에 맞춘 `record` job의 다리 목록.

제외 범위:

- Linux 지원. 지원 목록 밖에 두고, 설치와 init의 Linux 확인을 추가하지 않는다. 안내 문구의 Linux 줄도 바꾸지 않는다. Linux 사용자가 실제로 생기면 따로 제안한다.
- Windows의 `agent-eval`. 표에 이유와 함께 남긴다.
- Codex의 CI. 비공개 저장소에서 돌고, 공개 뒤의 범위는 [Codex 공개 준비](../completed/2026-11-12-codex-dual-client-runtime-follow-ups.md)가 정한다.
- `template-target.ts`의 Windows 동작. 템플릿 release 도구의 소유 작업에 이슈로 넘긴다.
- 두 검사가 "같은 것을 보는지"의 자동 판정. 표의 설명 칸과 리뷰가 맡는다.

## Proposal

요구 사항:

| ID | 요구 사항 |
| --- | --- |
| OC-01 | 지원 OS 목록과 분류 기준이 verification.md에 있다 |
| OC-02 | workflow의 모든 job이 분류표에 있고, 표에 없는 job이 생기면 `npm run check`가 실패한다 |
| OC-03 | "OS별" 검사에 지원 OS의 job이 없으면 `npm run check`가 실패한다. 아직 없는 OS는 표의 "미충족" 칸에 적은 경우에만 통과한다 |
| OC-04 | "단일 OS" 검사와 "공통" 검사 가운데 특정 OS에서만 도는 것은 이유가 비어 있으면 실패한다 |
| OC-05 | 표가 적은 확인 문자열이 해당 OS의 job에 없으면 실패한다 |
| OC-06 | 게이트의 `record` job이 받는 `legs`가 gate job이 선언한 `summary_<다리>` 출력들과 다르거나, `matrix`의 `leg` 값에 선언되지 않은 것이 있으면 실패한다 |
| OC-07 | Windows CI가 제품 코드 시험 전체를 macOS와 같은 범위로 돌린다 |
| OC-08 | `pipeline-smoke`가 macOS에서도 항목 하나를 끝까지 처리하고, 그 다리가 게이트 기록에 남는다 |
| OC-09 | AGENTS.md가 CI를 추가하거나 바꿀 때 분류표를 함께 고치라고 적는다 |

### 1. 지원 OS와 분류 기준

지원 OS:

| 클라이언트 | 지원 OS | 근거 |
| --- | --- | --- |
| Claude Code | Windows, macOS | 2026-11-12 소유자 결정. Linux는 목록 밖이다 |
| Codex | Windows, macOS | 소유자 결정. CI는 비공개 저장소에 있어 이 표의 검사 대상이 아니다 |

분류:

| 분류 | 뜻 | 필요한 job |
| --- | --- | --- |
| 공통 | 결과가 OS에 따라 달라지지 않는다 | 한 번. 특정 OS에서만 돌 수 있으면 이유를 적는다 |
| OS별 | OS에 따라 달라질 수 있다 | 지원 OS마다 |
| 단일 OS | 그 OS에만 있는 구현을 본다 | 그 OS에서. 이유를 적는다 |

OS와 무관한 것을 여러 OS에서 돌리면 시간과 구독 사용량만 늘고 더 잡히는 것이 없다. OS에 따라 달라지는 것이 한쪽에서만 돌면 빈틈이다. 표는 이 둘을 가르는 판단을 검사마다 적게 한다.

### 2. 한 번 정의하고 OS 목록으로 돌린다

양쪽 OS에서 같은 내용을 보는 검사는 job 하나에 OS 목록(`matrix`)을 달아 정의한다. 그러면 그 검사를 고칠 때 모든 OS가 함께 바뀐다. `client-init-smoke`가 이미 이 방식이다. 이 제안의 macOS 다리도 새 job을 만들지 않고 `pipeline-smoke`의 기존 job에 목록을 달아 더한다.

OS마다 구현이 달라 한 job으로 묶을 수 없는 검사(런타임 계약)와, 다른 준비 단계 뒤에 돌아야 하는 검사(런타임을 빌드한 뒤 도는 제품 코드 시험)는 workflow가 따로 있다. 이런 검사는 3절의 표와 4절의 검사가 지킨다.

### 3. 분류표

verification.md의 자동 검사 절에 표를 둔다. 표가 분류의 단일 기준이고, 4절의 검사가 이 표를 읽는다. 처음 넣을 내용은 다음과 같다.

| 검사 | 분류 | Windows | macOS | Linux | 미충족 | 이유 또는 확인 문자열 |
| --- | --- | --- | --- | --- | --- | --- |
| 정적 검사, 타입, 문서, 도구 시험 | 공통 | | | `check` / `check` | | |
| 웹·서버 시험, 빌드, DB 통합 시험 | 공통 | | | `check` / `check`, `server-integration` | | |
| 제품 코드 시험 | OS별 | `windows-role-runtime` / `native-runtime` | `macos-runtime-contracts` / `contracts` | `check` / `check` | Windows | `package.json`의 `test`가 가리키는 네 묶음 |
| Windows 역할 런타임 | 단일 OS | `windows-role-runtime` / `native-runtime` | | | | Windows에만 있는 구현(전용 Node 빌드, 격리된 역할 명령) |
| macOS 런타임 계약 | 단일 OS | | `macos-runtime-contracts` / `contracts` | | | macOS에만 있는 구현(Seatbelt, launchd, 후손 프로세스 추적) |
| 설치와 init | OS별 | `client-init-smoke` / `claude` | `client-init-smoke` / `claude` | | | 리허설 `rehearse-client-init-smoke.ts` |
| init 스킬의 모델 동작 | 공통 | | `agent-eval` / `init-skill` | | | 모델 동작은 OS와 무관하다. eval은 샌드박스가 있는 OS에서만 돌고 Windows에는 없다 |
| 파이프라인 전체 | OS별 | `pipeline-smoke` / `pipeline` | | | macOS | 리허설 `rehearse-pipeline-smoke.ts` |
| 게이트 실행 기록 | 공통 | | | `client-init-smoke` / `record`, `agent-eval` / `record`, `pipeline-smoke` / `record` | | |
| 템플릿 release 운영 | 공통 | | | `template-release` / `validate`, `deploy` | | |

Linux 칸은 OS와 무관한 검사가 도는 자리로 남는다. 지원 OS가 아니므로 "OS별" 검사는 Linux의 job을 요구하지 않는다. 제품 코드 시험은 Linux에서도 돌지만 그것은 `check`가 전체 단위 시험을 돌리기 때문이다.

"미충족" 칸은 아직 job이 없는 OS다. 5절의 각 단계가 끝날 때 그 칸을 비운다. 두 건이 모두 끝나면 칸 전체가 빈다.

### 4. 검사 스크립트

`scripts/checks/verify-ci-coverage.mjs`와 그 시험을 추가하고 `npm run check`에 넣는다.

- **읽는 것.** `.github/workflows/*.yml`의 job 이름과 job 블록, verification.md의 분류표, `package.json`의 `test` 스크립트.
- **workflow 읽기.** YAML 패키지를 쓰지 않는다. 이 저장소의 workflow는 `jobs:` 아래 들여쓰기 두 칸의 job 이름과, `runs-on`에 직접 적은 runner 또는 `matrix`의 `os`·`runner` 값이라는 같은 모양을 쓴다. 검사는 그 모양만 읽고, 모양이 다른 workflow를 만나면 통과시키지 않고 실패한다. runner 이름은 `windows-*`, `macos-*`, `ubuntu-*`로 OS를 정한다. 2026-11-12 이 방식의 시험용 읽기 코드로 workflow 7개를 읽어, job 12개와 각 job의 OS, `matrix`의 `leg` 값이 실제와 같게 나오는 것을 확인했다.
- **실패 조건.**
  - 표에 없는 job이 있다. 또는 표가 없는 job을 가리킨다.
  - "OS별" 행에 지원 OS(Windows, macOS)의 job이 없고 그 OS가 "미충족" 칸에도 없다.
  - "미충족" 칸에 적힌 OS에 실제로는 job이 있다. 표가 낡은 것이다.
  - "단일 OS" 행이나 특정 OS에서만 도는 "공통" 행의 이유가 비어 있다.
  - 행이 적은 확인 문자열이 그 OS의 job 블록에 없다. 제품 코드 시험은 `package.json`의 `test`가 가리키는 네 묶음이 job 블록에 모두 있거나, job이 `npm test`를 부르는지로 본다.
  - 게이트의 `record` job이 넘기는 `legs`가 gate job이 `outputs`에 선언한 `summary_<다리>` 이름들과 다르다. 또는 gate job의 `matrix`에 있는 `leg` 값이 그 선언에 없다.
- **하지 않는 것.** 두 job이 같은 것을 보는지는 판정하지 않는다. 분류가 맞는지도 판정하지 않는다.

### 5. 불일치 해소

**5.1 Windows의 제품 코드 시험 전체.** `windows-role-runtime`에 macOS와 같은 범위를 한 파일씩 순서대로 돌리는 단계를 더한다. 런타임을 준비하고 의존성을 설치한 뒤에 둔다. 이름을 적어 돌리던 기존 단계는 런타임 환경 변수를 주고 도는 시험이므로 그대로 둔다. CI 시간이 약 10분 늘어난다(이 PC 실측 9분 35초).

**5.2 `pipeline-smoke`의 macOS 다리.** job에 OS 목록을 달아 `windows-2022`와 `macos-15`에서 돈다.

- 출력 이름을 다리별(`summary_windows`, `summary_macos`)로 바꾸고 `record` job의 `legs`를 맞춘다.
- 봉인 전사 artifact의 이름에 다리를 붙인다.
- 리허설에서 Windows에만 맞춘 부분이 나오면 이 단계에서 고친다. 실행기의 Windows 아닌 경로가 실제 Claude와 CI에서 처음 도는 것이므로, 제품 결함이 나올 수 있다.
- 실행마다 구독 사용량이 약 두 배가 된다(2026-11-11 실행 기준 정가 환산 약 $1.7 추가). macOS runner는 대기 시간이 있다(2026-11-11 약 10분).
- 주 1회 정기 실행도 두 다리가 함께 돈다.

**5.3 넘기는 것.** `template-target.ts`가 Windows에서 모든 설정 파일을 거부하는 문제는 이슈로 남긴다. 그 도구가 Windows를 지원할지, POSIX 전용으로 표시하고 시험을 건너뛸지는 템플릿 release 작업이 정한다.

### 6. 규칙 한 줄

AGENTS.md에 다음 뜻의 항목을 넣는다. CI job이나 게이트의 다리를 추가·삭제·이동할 때는 verification.md의 분류표를 같은 변경에서 고친다. "OS별"로 분류한 검사는 지원 OS의 job을 같은 변경에 넣거나, 넣지 못한 OS를 "미충족" 칸에 적고 후속 작업을 남긴다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `scripts/checks/verify-ci-coverage.mjs`와 시험 | add | 표와 workflow의 대조. `checks/`가 문서·판 검사기를 소유한다 | low |
| `package.json` | update | 새 스크립트 `verify:ci-coverage`를 더하고 `check`에 넣는다 | low |
| `README.md` | update | Development 절의 명령 표에 `verify:ci-coverage`를 더한다. 다른 `verify:*` 스크립트가 그 표에 있다 | none |
| `docs/architecture/verification.md` | update | 지원 OS, 분류 기준, 분류표, workflow 설명 | low |
| `AGENTS.md` | update | 6절의 항목 | low |
| `.github/workflows/windows-role-runtime.yml` | update | 제품 코드 시험 전체 단계 | medium: CI 시간이 늘고, Windows에서만 나는 실패가 처음 드러날 수 있다 |
| `.github/workflows/pipeline-smoke.yml` | update | macOS 다리, 다리별 출력과 artifact 이름, `record`의 `legs` | high: 실제 모델 게이트다. 첫 macOS 실행이 실패할 수 있다 |
| `scripts/rehearsals/rehearse-pipeline-smoke.ts`, `pipeline-smoke-steps.mjs` | update(필요하면) | macOS에서 드러나는 차이 | medium |
| GitHub 이슈 | add | 5.3의 인계 | none |

## Safety Analysis

- 새 검사는 파일을 읽기만 한다. 네트워크와 쓰기가 없다.
- 표의 "미충족" 칸 덕분에 검사와 표를 먼저 넣어도 지금의 CI가 실패하지 않는다. 불일치는 드러난 채로 남고, 해소할 때마다 칸을 비워야 통과한다.
- macOS 다리는 기존 job의 목록에 더하므로 권한과 비밀값 사용이 Windows 다리와 같다. 새 권한은 없다.
- macOS 다리를 더하는 단계는 다른 세션이 진행 중인 템플릿 R2 승격이 끝난 뒤에 머지한다. 첫 실행의 실패가 그 승격을 막지 않게 하려는 것이다.
- 플러그인 출하 파일은 5.2에서 macOS 결함이 나와 고치는 경우에만 바뀐다. 그때는 판을 올리고 `verify:plugin-version`을 따른다.

확인한 항목:

- [x] 테스트와 스크립트 참조: `check`의 실행 순서(`package.json`), `test:scripts`의 검색 범위가 `scripts/**`인 것, `pipeline-smoke-steps.test.mjs`가 AGENTS.md의 경로 목록 줄을 읽는 것을 확인했다. 새 항목은 그 줄을 바꾸지 않는다
- [x] 런타임 side effect: 새 검사는 읽기 전용이다. 게이트의 새 다리는 기존 다리와 같은 부작용(임시 DB, 임시 저장소, 게이트 기록 댓글)을 낸다
- [x] API, 외부 SDK 영향: 없다. YAML 패키지를 추가하지 않는다
- [x] 출시된 plugin·서버와 함께 쓰는 상태: 바꾸지 않는다
- [ ] macOS에서 `harness-background.mjs --start`가 실제 Claude와 끝까지 도는지는 5.2의 첫 실행으로 확인한다

## Approval

승인 기록의 단일 기준은 front matter의 `approved-by`, `approved-at`, `approval-scope`입니다.

승인 메모:

- 승인 전에 소유자와 정한 것: OS와 무관한 검사는 한 번, OS에 따라 달라지는 검사는 지원 OS마다 돌린다. 지원 OS는 Windows와 macOS다. Linux는 넣지 않는다. CI를 추가할 때 분류를 함께 정하게 하는 장치를 둔다.
- 승인 때 확인받은 것 하나. `pipeline-smoke`의 macOS 다리는 조건 없이 모든 실행에서 함께 돈다.
- 단계별 구현 PR과 이슈는 실행 직전에 따로 승인받는다.

## Execution Plan

1. **장치.** 분류 기준과 표(verification.md), 검사 스크립트와 시험, `check` 연결, AGENTS.md 항목. 표의 "미충족" 칸에 두 건을 적는다. 게이트를 건드리지 않으므로 바로 진행할 수 있다.
2. **Windows의 제품 코드 시험.** `windows-role-runtime`에 단계를 더하고 표의 칸을 비운다. PR이 workflow 파일을 바꾸므로 PR에서 그 workflow가 돈다. 거기서 통과와 걸린 시간을 확인한다.
3. **이슈.** 5.3의 인계 이슈를 연다(소유자 승인 뒤).
4. **macOS 다리.** 템플릿 R2 승격이 끝난 뒤에 올린다. 기능 브랜치에서 `pipeline-smoke`를 수동으로 돌려 두 다리가 통과하는지 먼저 본다(기능 브랜치 실행은 기록에 남지 않는다). 머지 뒤 `dev`에서 돌려 기록에 다리 둘이 남는지 본다.
5. 두 칸이 모두 비면 완료 처리한다.

각 단계는 PR 하나다. 구현 PR과 이슈는 실행 직전에 따로 승인받는다.

## Verification Plan

실행할 검증:

```bash
node --test scripts/checks/verify-ci-coverage.test.mjs
node scripts/checks/verify-ci-coverage.mjs
npm run check
gh workflow run pipeline-smoke.yml --ref <기능 브랜치>
gh workflow run pipeline-smoke.yml --ref dev
```

요구 사항별 검증:

| ID | 검증 |
| --- | --- |
| OC-01, OC-09 | 문서 검토. `npm run docs:check` |
| OC-02 | 검사 시험: 표에 없는 job을 넣은 workflow, 없는 job을 가리키는 표가 각각 실패한다. 지금의 저장소는 통과한다 |
| OC-03 | 검사 시험: "OS별" 행에서 OS 하나를 뺀 경우와 "미충족"에 적은 경우, "미충족"에 적혔는데 job이 있는 경우 |
| OC-04 | 검사 시험: 이유가 빈 "단일 OS" 행, 특정 OS에서만 도는데 이유가 빈 "공통" 행 |
| OC-05 | 검사 시험: 확인 문자열을 job에서 지운 경우. 제품 코드 시험의 네 묶음 가운데 하나가 빠진 경우 |
| OC-06 | 검사 시험: gate job에 다리를 더하고 `legs`를 그대로 둔 경우 |
| OC-07 | PR의 `windows-role-runtime` 실행에서 새 단계가 통과한다. 시험 수와 건너뛴 수가 이 PC의 결과(680, 29)와 크게 다르지 않은지 본다 |
| OC-08 | 기능 브랜치와 `dev`의 `pipeline-smoke`에서 두 다리가 통과한다. `dev` 실행의 기록 행에 다리 둘이 있다 |

검증 기준:

- 새 검사의 시험은 각각 해당 규칙을 지우면 실패해야 한다.
- 로컬 `npm run check`의 `template-release-cli` 실패는 5.3이 다루는 기존 실패다. 그 밖의 실패는 신규로 본다.
- 게이트의 기존 다리 결과가 변경 전과 같아야 한다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| Windows 11에서 제품 코드 시험 전체를 한 파일씩 순서대로(2026-11-12, `dev` `58850a9`에 문서 변경만 더한 상태) | 680개 중 651개 통과, 29개 건너뜀, 실패 0개, 9분 35초 | 5.1의 사전 확인 |
| 같은 범위를 동시 실행 수 4로 | 시험 하나가 시간 초과 | 따로 돌리면 통과. 순서대로 돌리는 이유 |
| 1단계: `node --test scripts/checks/verify-ci-coverage.test.mjs` (2026-11-12, `dev` `8925e4c` 기준) | 10개 통과 | OC-02~OC-06 |
| 1단계: 검사의 규칙과 읽기 코드를 한 곳씩 지운 28가지 변형 | 28가지 모두 시험이 실패 | 새 시험이 규칙을 실제로 지키는지 확인 |
| 1단계: `npm run verify:ci-coverage` | 통과(job 12개, 행 10개) | "미충족" 칸 둘을 비우면 Windows의 제품 코드 시험과 macOS의 파이프라인 전체, 두 건을 정확히 보고한다 |
| 1단계: `npm run check` | lint·경계 검사·문서 검사·새 검사·typegen·`tsc` 통과. `test:scripts` 369개 중 363개 통과, 5개 skip, 1개 실패 | 실패는 5.3이 다루는 `template-release-cli`의 Windows 전용 실패다 |
| 1단계: PR #323의 CI | `check`, Windows 런타임, macOS 런타임 둘 모두 통과 | 정적 검사 job에서 새 검사가 통과했다(job 12개, 행 10개). 2026-11-12 `dev` `eabd138`로 병합 |
| 2단계: `npm run verify:ci-coverage` (2026-11-12, `dev` `eabd138` 기준) | 통과 | 제품 코드 시험의 "미충족" 칸을 비운 상태. workflow의 새 단계를 빼면 "a per-OS check needs a Windows job that runs npm test"로 실패한다 |
| 2단계: PR #326의 `windows-role-runtime` 첫 실행(run 43140530258) | 실패. 680개 중 647개 통과, 31개 건너뜀, 2개 실패. 새 단계 5분 6초 | 실패한 둘은 `codex-resident-session.test.mjs`와 `resident-commit.test.mjs`의 시험 하나씩이다. 두 시험은 임시 저장소 경로를 `realpathSync(tmpdir())`로 만든다. runner의 임시 폴더 경로에는 8.3 짧은 이름(`RUNNER~1`)이 있고 이 함수는 그것을 풀지 않는다. Git은 긴 이름으로 답하므로 시험이 비교하는 경로가 어긋난다. 제품 코드는 저장소 경로를 Git에서 받아 쓰므로 영향이 없다. 건너뛴 수가 이 PC보다 2개 많은 것은 checkout이 최신 커밋만 받아 출시 이력을 읽는 시험 둘이 건너뛰기 때문이다(macOS CI도 같다) |
| 2단계: 이 PC에서 임시 폴더를 8.3 짧은 이름 경로로 주고 두 파일 실행 | 고치기 전에는 같은 두 시험이 같은 오류로 실패, `realpathSync.native(tmpdir())`로 고친 뒤에는 10개 모두 통과 | 원인의 재현과 수정 확인. 이미 Windows CI에서 돌던 시험들은 같은 이유로 `realpathSync.native`를 쓴다 |
| 2단계: 수정 뒤 PR #326의 `windows-role-runtime` 실행(run 43154442374) | 통과. 680개 중 649개 통과, 31개 건너뜀, 실패 0개. 새 단계 5분 35초, job 전체 12분 12초 | OC-07. 이 PC의 결과(680개, 건너뜀 29개)와 시험 수가 같다. job 전체는 전에 6분 30초에서 7분쯤이었다. PR의 `check`, `client-init-smoke`, macOS 런타임 둘도 통과했다. 2026-11-12 `dev` `68f3d49`로 병합 |
| 2단계: 병합 뒤 `dev` `68f3d49`의 실행 | `check`, Windows 런타임(run 43158463839), macOS 런타임(run 43158463867) 모두 통과 | Windows의 새 단계는 680개 중 649개 통과, 31개 건너뜀, 5분 39초. macOS는 두 runner 모두 680개 중 650개 통과, 30개 건너뜀. 출시 이력을 읽는 시험 둘은 macOS 실행 로그에서도 건너뛴 것으로 나온다. 이 둘은 CI에서 전체 이력을 받는 `check`에서만 돈다 |
| 3단계: 인계 이슈(2026-11-12) | [#329](https://github.com/Sangeok/stagekeeper/issues/329) 생성 | 5.3의 인계. 만들기 전에 이 PC(Node 22.13.1)에서 `template-release-cli.test.ts`를 따로 돌려 2개 중 1개가 "Template profiles must be private regular files outside the repository"로 실패하는 것과, `0600`으로 만든 파일과 `chmod 600` 뒤의 파일이 모두 `666`으로 보고되는 것을 다시 확인했다 |
| 4단계 | Not run yet | 구현 전 |

## Risks and Rollback

잔여 리스크:

- 분류가 맞는지는 사람이 판단한다. 검사는 판단을 빠뜨리지 못하게 할 뿐이다.
- workflow를 좁은 모양으로 읽으므로, 새로운 모양의 workflow를 쓰려면 검사의 읽기 코드를 함께 고쳐야 한다.
- macOS 다리의 첫 실행이 여러 번 실패하면 4번 단계가 길어진다. 그동안 `pipeline-smoke`는 기능 브랜치에서만 바뀐 상태이므로 승격 게이트는 영향을 받지 않는다.
- 게이트 실행의 구독 사용량이 늘어 사용 한도에 더 빨리 닿을 수 있다. `agent-eval`과 `pipeline-smoke`를 이어서 돌리는 기존 순서는 그대로다.
- Linux는 지원 목록 밖이라 설치와 init을 확인하지 않는다. 안내 문구에는 Linux 줄이 남아 있다.

롤백 방법:

- 단계마다 PR 하나이므로 그 PR을 revert한다. 다리를 되돌리면 표의 "미충족" 칸에 그 OS를 다시 적어야 `check`가 통과한다.
- 장치 자체를 되돌리려면 1번 단계의 PR을 revert한다. workflow의 동작은 바뀌지 않는다.

## Completion or Closure Notes

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [x] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
