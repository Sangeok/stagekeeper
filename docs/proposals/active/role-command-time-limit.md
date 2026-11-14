---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-13"
approved-by: "user"
approved-at: "2026-11-13"
approval-scope: "제안서의 설계 전체(기본 60초 유지, 최대 300초, 값 일치 시험, 역할 지시문, 두 빌드 리허설의 300초 요청과 시간 기록, 경계값·중단 시험, 문서, 판 상승)와 제안서의 커밋·PR. Codex 실제 모델 확인은 완료 조건에 넣지 않는다. 구현 PR과 main 승격은 실행 직전에 각각 따로 승인받는다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/ci-os-coverage.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/macos-runtime.md"
  - "docs/architecture/protocol.md"
  - "docs/proposals/completed/2026-11-12-codex-dual-client-runtime-follow-ups.md"
---

# 역할 command의 최대 실행 시간을 120초에서 300초로

## Summary

역할이 `role_command_exec`에 요청할 수 있는 최대 실행 시간을 120초에서 300초로 올린다. 기본값 60초는 그대로 둔다. 이 저장소의 전체 빌드가 느린 기기에서 120초를 넘겨, macOS CI의 빌드 리허설이 `dev`에서 반복해서 시간 초과로 실패하고 있다. 검사를 느슨하게 하지 않고 한도를 올려서 푼다. 시간 초과와 빌드 오류는 계속 실패다. 같은 변경에서 빌드에 걸린 시간을 기록해, 300초가 맞는 값인지 뒤에 판단한다.

## Goal

- 느린 runner에서 빌드 리허설이 시간 초과로 실패하는 일을 없앤다. 실제 사용자의 느린 기기에서도 역할이 전체 빌드를 끝낼 수 있게 한다.
- 시간 초과를 실패로 두는 지금의 판정을 유지한다.
- 한도를 적은 곳들이 서로 어긋나지 않게 한다.
- 작업 유형: 제품의 도구 입력 계약 변경, 시험 추가, 문서 수정, 플러그인 판 상승.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 도구 입력 계약(API 계약)을 바꾼다.
- 출하되는 플러그인 파일을 포함해 10개가량의 파일을 바꾼다.
- 출하 뒤에는 판을 내릴 수 없어 롤백이 단순 revert로 끝나지 않는다.

## Current State

**한도가 있는 곳.** `role_command_exec`의 `timeoutMs`는 기본 60000, 허용 범위 100~120000이다. 이 범위는 다섯 곳에 따로 적혀 있다.

| 위치 | 내용 |
| --- | --- |
| `plugin/runtime/role-commands.mjs` | 도구 입력 정의의 `maximum: 120000`, Windows 쪽 입력 검사와 오류 문구("100 through 120000"), 기본값 `60000` |
| `plugin/runtime/macos-commands.mjs` | macOS 쪽 입력 검사와 오류 문구, 기본값 `60000` |
| `plugin/runtime/windows/RoleProcess.cs` | Windows 실행 도우미의 자체 검사(`timeoutMs > 120000`이면 "Invalid role request") |
| `plugin/runtime/codex-thread.mjs` | 역할에게 주는 지시문의 "timeoutMs is 100..120000" |
| `plugin/runtime/codex-bridge.test.mjs` | 120001을 거부하고 문구에 "100 through 120000"이 있는지 보는 시험 |

`docs/architecture/verification.md`는 "역할 command의 120초·snapshot의 300초 제한은 유지한다"고 적는다. macOS 쪽 실행 도우미(`plugin/runtime/macos/role-process.mjs`)에는 자체 상한이 없고 받은 값으로 타이머만 건다.

**이 도구를 쓰는 곳.** `plugin/runtime/role-command-backend.mjs`를 거쳐 Codex 역할(`codex-thread.mjs`)과 Codex 상주 메인 루프(`codex-main-loop.mjs`)만 쓴다. Claude 역할은 쓰지 않는다. 두 빌드 리허설(`scripts/macos/rehearse-project-build.mjs`, `scripts/windows/rehearse-windows-project-build.mjs`)이 같은 도구를 `timeoutMs: 120000`으로 부른다.

**다른 한도.**

| 한도 | 값 | 위치 |
| --- | --- | --- |
| 역할의 도구 호출 제한 | 900초 | `codex-thread.mjs`의 `roleToolTimeout` |
| 메인 루프의 도구 호출 제한 | 1200초 | `codex-main-loop.mjs` |
| 역할 한 차례의 제한 | 15분(보고 전용 역할은 2분) | `codex-thread.mjs` |
| 복사본 준비 | 300초 | `role-commands.mjs`, `protocol.md` |
| 실행 도우미의 종료 확인 대기 | 요청한 시간 + 35초(macOS), + 45초(Windows) | `macos-commands.mjs`, `role-commands.mjs` |
| 상주 실행기의 서버 확인 유효 시간 | 120초 | `codex-main-loop.mjs`. 실행기의 60초 주기 신호가 갱신하므로 command 길이와 무관하다 |

**문제.** `macos-runtime-contracts`의 `dev` 실행 34번(2026-11-10~12) 가운데 5번이 빌드 리허설의 시간 초과였다. 모두 `macos-15-intel`이었고 다른 빌드 오류는 없었다. 2026-11-13에는 PR #338의 첫 실행에서 `macos-15`(arm64)도 같은 시간 초과로 실패했다. Windows(60번)에는 없었다.

빌드 증거에 남은 단계 시간은 다음과 같다. 시간 초과가 난 실행은 120초에서 끊겨서 전체가 얼마나 걸렸을지는 기록이 없다.

| runner | 컴파일 | 타입 검사 | 결과 |
| --- | --- | --- | --- |
| arm64, 평소 | 14~20초 | 20초 | 통과 |
| Intel, 평소 | 27~36초 | 32~44초 | 통과 |
| Intel, 느린 실행 | 55초 | 끝나기 전에 120초 | 시간 초과 |
| arm64, 느린 실행 | 64초 | 끝나기 전에 120초 | 시간 초과 |

느린 실행을 평소의 2~4배로 보면 전체는 170~220초쯤으로 추정된다. 확인된 값은 아니다.

**고르지 않은 방식.** [CI 검사의 OS 범위](./ci-os-coverage.md) 5.5절이 경위를 적는다. 느린 runner 하나에서만 시간 초과를 경고로 넘기는 방식은 arm64의 실패를 없애지 못하고 x64의 확인을 약하게 해서 쓰지 않았다. 다시 시도하는 방식은 느린 runner가 job 내내 느려서 효과가 약하다.

## Scope

포함 범위:

- `timeoutMs`의 허용 최대값 300000. 기본값 60000 유지.
- Current State의 표에 있는 다섯 곳과, 제품 코드의 값들이 같은지 보는 시험.
- 역할 지시문의 문장: 범위와 함께, 기본값을 쓰고 길게 요청할 때의 조건을 말한다.
- 두 빌드 리허설: 최대값을 요청하고 빌드에 걸린 시간을 증거 파일과 출력에 남긴다.
- 경계값, Windows 실행 도우미의 수락, 최대값으로 시작한 명령의 중단을 보는 시험(두 OS).
- 문서(`verification.md`, `macos-runtime.md`, `protocol.md`)와 플러그인 판 0.6.15.

제외 범위:

- 기본값 60초, 복사본 준비 300초, 도구 호출 제한 900초, 역할 한 차례 15분. 바꾸지 않는다.
- command 결과에 실행 시간을 넣는 것. 제품의 결과 형식은 그대로 둔다. 시간은 리허설이 잰다.
- Claude 역할. 이 도구를 쓰지 않는다.
- 비공개 템플릿. 2026-11-13 템플릿 저장소의 `main`(`99245ac`)에 이 시간 범위를 적은 파일이 없는 것을 확인했다. 지시문은 플러그인 코드에 있다.
- `main` 승격. AGENTS.md의 절차를 따로 따른다.
- Codex의 기존 수동 인수 증거가 이 변경 뒤에도 유효한지의 판정. Windows 0.5.24·0.5.25와 macOS 0.6.10의 중지·장시간 인수는 최대 120초에서 얻은 것이다. 다시 인수할지는 [Codex 공개 준비의 후속](../completed/2026-11-12-codex-dual-client-runtime-follow-ups.md)(RUN-F02, RUN-F03)이 정한다.
- 실제 Codex 모델로 하는 확인. 완료 조건으로 두지 않는다(Risks 참조).

## Proposal

요구 사항:

| ID | 요구 사항 |
| --- | --- |
| RT-01 | `timeoutMs`를 주지 않으면 60초로 돈다 |
| RT-02 | 100~300000은 받고 300001은 거부한다. 도구 입력 정의, 두 OS의 입력 검사, Windows 실행 도우미가 같은 범위를 쓴다 |
| RT-03 | 제품 코드에서 범위를 적은 곳(입력 정의, 두 OS의 검사와 오류 문구, Windows 도우미, 지시문)의 값이 하나라도 다르면 시험이 실패한다 |
| RT-04 | 역할 지시문이 기본값이 60초라는 것과, 오래 걸리는 것을 아는 빌드나 시험에만 더 길게 요청하라는 것을 말한다 |
| RT-05 | 시간 초과, 중단, 출력 한도 초과는 지금처럼 성공이 아니다. 최대값으로 시작한 명령을 중단하면 한도까지 기다리지 않고 끝나고 프로세스가 정리된다(두 OS) |
| RT-06 | 두 빌드 리허설이 최대값을 요청하고, 빌드에 걸린 시간을 증거 파일과 출력에 남긴다. 시간 초과와 빌드 오류는 모든 runner에서 실패다 |
| RT-07 | 문서가 새 범위, 다른 한도와의 관계, 올린 이유를 적는다 |
| RT-08 | 두 플러그인 manifest의 판이 같은 값으로 오른다 |

### 1. 범위

`role-commands.mjs`가 기본값과 최대값을 상수로 내보낸다. 도구 입력 정의의 `maximum`, 두 OS의 입력 검사와 오류 문구, 역할 지시문이 그 상수를 쓴다. `RoleProcess.cs`는 C# 파일이라 숫자를 직접 적고, 시험이 그 숫자가 상수와 같은지 본다. 종료 확인 대기(요청한 시간 + 35초 또는 45초)는 식이 그대로라 함께 늘어난다.

### 2. 역할 지시문

지금 문장은 범위만 알려 준다. 숫자만 바꾸면 역할이 늘 최대값을 요청할 수 있다. 멈춘 명령 하나가 역할을 붙잡는 시간이 2분에서 5분으로 늘고, 두 번 겪으면 한 차례 15분에 닿는다. 문장을 다음 뜻으로 바꾼다. 기본값은 60000이다. 100~300000을 줄 수 있다. 오래 걸리는 것을 아는 빌드나 시험에만 더 길게 요청한다. 멈춘 명령은 요청한 시간이 다 될 때까지 이 차례를 붙잡는다.

구현할 때 같은 문장을 도구 입력 정의의 `timeoutMs` 설명에도 넣었다(2026-11-14). 상주 메인 루프도 같은 도구로 빌드와 시험을 돌리는데, 메인 루프의 지시문에는 시간 범위가 없고 도구 입력 정의만 받는다. 입력 정의에 넣으면 역할과 메인 루프가 같은 문장을 본다.

### 3. 다른 한도와의 관계

- 한 번의 호출은 최악의 경우 복사본 준비 300초 + 명령 300초 + 종료 확인 45초 = 645초다. 역할의 도구 호출 제한 900초 안이다.
- 복사본 준비는 CI에서 30~50초였다. 이 경우 300초짜리 명령 둘이 한 차례 15분 안에 들어간다. 준비가 300초를 다 쓰는 최악의 경우에는 하나만 들어간다.
- 상주 실행기의 서버 확인 유효 시간 120초는 실행기의 주기 신호가 갱신하므로 영향이 없다.

### 4. 빌드 리허설

두 리허설이 최대값 상수를 요청한다. 명령 호출의 앞뒤 시각으로 걸린 시간을 재서 증거 파일에 `durationMs`로 적고 마지막 출력에도 넣는다. 판정은 그대로다. `exited`와 종료 코드 0이 아니면 실패한다.

### 5. 시험

- 경계값: 300000은 받고 300001은 거부한다. 거부 문구에 새 범위가 있다(`codex-bridge.test.mjs`의 기존 시험을 고친다).
- 값 일치: 상수, 입력 정의의 `maximum`, 두 오류 문구, 지시문, `RoleProcess.cs`의 숫자.
- Windows 실행 도우미: 300000을 준 짧은 명령이 정상으로 끝나고, 300001은 도우미가 거부한다. Windows CI의 실제 실행 시험에 넣는다.
- 중단: 최대값으로 시작한 끝나지 않는 명령을 중단하면 `stopped`로 끝나고 프로세스가 정리된다. 두 OS의 실제 실행 시험에 넣는다.
- 기존의 시간 초과 정리 시험과 출력 한도 시험은 그대로 둔다.

### 6. 300초의 판단

이 변경이 `dev`에 들어간 뒤 runner마다 30번의 빌드 시간이 쌓이면 본다. 시간 초과가 다시 나거나 기록된 최대값이 240초를 넘으면 여유가 부족한 것으로 보고 다시 제안한다. 그렇지 않으면 이 값을 유지하고 완료 처리한다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `plugin/runtime/role-commands.mjs` | update | 상수, 입력 정의의 `maximum`, Windows 쪽 검사와 문구 | medium: 출하 파일이다. 범위가 넓어진다 |
| `plugin/runtime/macos-commands.mjs` | update | macOS 쪽 검사와 문구 | medium: 출하 파일이다 |
| `plugin/runtime/windows/RoleProcess.cs` | update | 실행 도우미의 자체 검사 | medium: Windows의 실제 실행 시험으로만 확인된다. 실행할 때 `Add-Type`으로 컴파일하고, 이 파일의 해시를 고정한 곳은 없다 |
| `plugin/runtime/codex-thread.mjs` | update | 역할 지시문 | medium: 문장이 역할의 요청 습관에 영향을 준다 |
| `plugin/runtime/codex-bridge.test.mjs`, `plugin/bin/harness-role-commands.test.mjs`, `plugin/runtime/macos-commands.test.mjs` | update | 5절의 시험 | low |
| `plugin/runtime/role-commands.test.mjs` | add | 값 일치와 경계값 시험(`npm test` 대상이라 세 OS의 CI에서 돈다) | low |
| `scripts/macos/rehearse-project-build.mjs`, `scripts/windows/rehearse-windows-project-build.mjs` | update | 최대값 요청, 걸린 시간 기록 | low: 증거 파일의 모양을 읽는 다른 코드가 없다 |
| `docs/architecture/verification.md`, `docs/architecture/macos-runtime.md`, `docs/architecture/protocol.md` | update | 새 범위와 이유, 다른 한도와의 관계. `protocol.md`의 "100~120000ms timeout 범위" 문장은 구현할 때 찾았다 | low |
| `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | update | 판 0.6.15 | low: `dev`의 판이 그사이 올랐으면 그 판 + 1을 쓴다 |

## Safety Analysis

- 범위를 넓히는 변경이다. 지금 통과하는 요청은 모두 그대로 통과한다. 기본값이 같아서 `timeoutMs`를 주지 않는 호출의 동작은 바뀌지 않는다.
- 시간 초과, 중단, 출력 한도의 처리 코드는 건드리지 않는다. 바뀌는 것은 타이머에 들어가는 값의 상한뿐이다.
- 역할의 권한은 바뀌지 않는다. 복사본, 네트워크 차단, 원본 무쓰기 경계는 그대로다.
- Windows CI의 런타임 캐시 키는 빌드 스크립트와 캐시 스크립트만으로 만든다. 이 변경으로 Node를 다시 빌드하지 않는다.
- `plugin/runtime`을 바꾸므로 다음 승격 전에 AGENTS.md가 정한 `pipeline-smoke`와 `agent-eval`을 돌린다. 두 게이트는 Claude로 돌아서 이 도구와 지시문을 지나가지 않는다. 다른 것을 깨지 않았는지만 본다.

확인한 항목:

- [x] 정적 `import` / `export from`: 상수를 `role-commands.mjs`에서 내보내고 `macos-commands.mjs`, `codex-thread.mjs`, 두 리허설이 가져온다. macOS 리허설만 이 모듈을 새로 가져오고, 나머지 셋은 이미 가져오고 있다
- [x] 테스트와 스크립트 참조: 120000이나 그 문구를 고정한 시험은 `codex-bridge.test.mjs` 하나다. 지시문의 숫자를 고정한 시험은 없다
- [x] 런타임 side effect: 종료 확인 대기가 함께 늘어난다(Risks 참조). 그 밖의 타이머는 그대로다
- [x] API 영향: 도구 입력의 최대값이 늘어난다. 서버는 이 한도를 모른다. 서버의 응답과 저장 형식은 바뀌지 않는다
- [x] 출시된 plugin·서버와 함께 쓰는 상태: 바꾸지 않는다. 입력 검사, 지시문, 실행 도우미는 한 설치본 안에서 같은 판으로만 함께 돈다. 로컬 잠금과 서버 행의 형식은 그대로다

## Approval

승인 기록의 단일 기준은 front matter의 `approved-by`, `approved-at`, `approval-scope`입니다.

승인 메모:

- 승인 전에 소유자와 정한 것: 기본 60초 유지, 최대 300초, CI 빌드에 300초 적용, 실행 시간 기록과 취소·정리 검증을 같은 PR에 포함, 시간 초과와 빌드 오류는 계속 실패. 300초가 맞는 값인지는 실제 기록으로 판단한다.
- 승인 때 확인받은 것: 실제 Codex 모델로 하는 확인은 완료 조건에 넣지 않는다. 다음에 Mac에서 Codex CI를 돌릴 때 보고 기록한다.
- 구현 PR과 `main` 승격은 실행 직전에 따로 승인받는다.

## Execution Plan

1. 이 제안서를 PR로 올리고 승인받는다.
2. 구현을 PR 하나로 올린다. 코드, 시험, 문서, 판 상승을 함께 담는다. `plugin/runtime`을 바꾸므로 PR에서 Windows와 macOS workflow가 돈다. 거기서 실제 실행 시험과 300초를 요청한 두 빌드 리허설이 통과하는지, 걸린 시간이 기록되는지 확인한다.
3. 병합 뒤 `dev` 실행을 확인하고 결과를 이 문서에 적는다.
4. `main` 승격은 AGENTS.md의 절차로 따로 한다. 이 변경 때문에 `agent-eval`과 `pipeline-smoke`가 필요하다.
5. runner마다 30번의 기록이 쌓이면 6절의 기준으로 300초를 판단하고 완료 처리한다.

## Verification Plan

실행할 검증:

```bash
node --test plugin/runtime/codex-bridge.test.mjs plugin/bin/harness-role-commands.test.mjs
npm test
npm run check
npm run verify:plugin-version -- --head <구현 커밋>
```

요구 사항별 검증:

| ID | 검증 |
| --- | --- |
| RT-01 | 기존 시험이 `timeoutMs` 없는 호출을 그대로 통과시킨다. 기본값 상수가 60000인지 값 일치 시험이 본다 |
| RT-02 | 경계값 시험. Windows CI의 실제 실행 시험에서 도우미가 300000을 받고 300001을 거부한다 |
| RT-03 | 값 일치 시험. 각 곳의 숫자를 하나씩 바꾼 변형에서 시험이 실패한다 |
| RT-04 | 값 일치 시험이 지시문의 범위를 본다. 문장의 뜻은 리뷰에서 본다. 실제 Codex 역할이 그 문장대로 요청하는지는 이 저장소의 CI로는 확인되지 않는다(Risks 참조) |
| RT-05 | 두 OS의 실제 실행 시험: 최대값으로 시작한 명령의 중단. 기존의 시간 초과 정리 시험이 그대로 통과한다 |
| RT-06 | PR의 두 빌드 리허설이 통과하고 증거 파일에 `durationMs`가 있다. 리허설의 판정 코드는 바꾸지 않는다 |
| RT-07 | 문서 검토. `npm run docs:check` |
| RT-08 | `npm run verify:plugin-version -- --head <구현 커밋>` |

검증 기준:

- 새 시험은 각각 해당 규칙을 깨면 실패해야 한다.
- 실제 실행 시험은 그 OS의 CI에서만 통과로 센다. 이 PC는 Windows라서 macOS 쪽은 PR의 macOS job으로 확인한다.
- 이 PC의 `npm run check`에는 이 변경과 무관한 Windows 전용 실패가 있다(`template-release-cli`의 시험 1개와 `cleanup-task-branches`의 시험 9개). 그 밖의 실패는 신규로 본다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| 구현 전 조사(2026-11-13, `dev` `74e240b` 기준) | 한도를 적은 곳 다섯, 이 도구를 쓰는 곳, 다른 한도의 값을 코드에서 읽었다 | Current State의 표 |
| 비공개 템플릿 `main`(`99245ac`)에서 시간 범위를 적은 파일 수 | 0 | 템플릿 release가 필요 없다 |
| 구현 뒤 남은 120초 표기 찾기(2026-11-14, `dev` `ff7dd90` 기준) | 코드에서 다섯 곳, 문서에서 `protocol.md`의 한 문장, 시험에서 `harness-role-commands.test.mjs`의 120001 하나를 더 찾아 고쳤다 | 남은 120000은 상주 실행기의 서버 확인 유효 시간, 시험의 제한 시간 같은 다른 값이다 |
| `node --test plugin/runtime/role-commands.test.mjs plugin/runtime/codex-bridge.test.mjs` | 10개 통과 | RT-02, RT-03. 상수, 입력 정의의 `maximum`과 설명, 두 OS의 입력 검사와 오류 문구, 판정 함수, Windows 도우미의 숫자를 하나씩 깬 12가지 변형에서 모두 시험이 실패한다. 지시문이 공유 문장을 쓰는지는 구조로 보장하고 리뷰에서 본다 |
| `node --test plugin/bin/harness-role-commands.test.mjs`(이 PC, Windows 11의 실제 LPAC) | 15개 통과, 1개 건너뜀(준비한 런타임이 필요한 시험) | RT-02, RT-05. 새 시험: 도우미가 300000을 받아 명령을 끝내고 300001을 `validation-bounds`에서 거부한다. 도우미를 120000으로 되돌리면 이 시험이 같은 단계에서 실패한다. 중단 시험은 300000으로 시작한 명령을 2.5초에 멈춰 `stopped`와 정리를 확인한다 |
| 제품 코드 시험 전체를 한 파일씩(이 PC, Windows 11) | 683개 중 654개 통과, 29개 건너뜀, 실패 0개, 10분 33초 | 바꾸기 전보다 시험이 3개 늘었다(새 값 시험 2개, Windows 도우미 시험 1개). 건너뛴 29개는 바꾸기 전과 같다 |
| macOS의 실제 실행 시험 | Not run yet | 이 PC에서는 건너뛴다. PR의 macOS job에서 돈다 |
| 바꾼 파일의 ESLint, `plugin-lib --check`, `docs:check`, `verify:ci-coverage`, FSD·서버 경계 검사 | 통과 | RT-07 |
| 두 빌드 리허설 | Not run yet | 준비한 런타임이 필요하다. PR의 Windows와 macOS job에서 돈다 |

## Risks and Rollback

잔여 리스크:

- 300초가 맞는 값인지 모른다. 느린 실행의 전체 시간은 추정이다. 6절의 기준으로 판단한다.
- 멈춘 명령이 역할을 붙잡는 시간이 최대 2분에서 5분으로 늘어난다. 길게 요청한 명령에서만 그렇고, 지시문으로 줄인다.
- 실행 도우미가 응답 없이 멈췄을 때 포기하기까지의 대기가 최대 약 2분 45초에서 약 5분 45초로 늘어난다.
- 느린 runner에서 빌드 리허설이 실패 대신 최대 3분 더 돈다. CI 시간이 그만큼 늘 수 있다.
- 역할 지시문의 문장이 바뀐다. 이 도구는 Codex 역할만 쓰는데, 이 저장소의 실제 모델 게이트(`pipeline-smoke`, `agent-eval`)는 Claude로 돈다. 실제 Codex 역할이 새 문장대로 요청하는지는 비공개 저장소의 Codex CI나 수동 인수에서만 확인된다. 이 제안은 그 확인을 완료 조건으로 두지 않는다. Codex CI를 승격 게이트로 둘지는 Codex 공개 준비의 후속이 정하기로 되어 있고, 그 CI는 Mac에서만 돈다. 문장이 기대대로 듣지 않으면 역할이 긴 시간을 습관처럼 요청해, 멈춘 명령 하나가 5분을 붙잡을 수 있다. 한 차례 15분이 상한이다. 다음에 Mac에서 Codex CI의 파이프라인 단계를 돌릴 때 역할이 빌드에 요청한 시간을 보고 이 문서에 적는다.

롤백 방법:

- 승격 전이면 구현 PR을 revert한다.
- 승격 뒤에는 판을 내릴 수 없다. 코드를 되돌리고 판을 한 번 더 올려 낸다. 범위를 다시 좁히면 그사이 120초를 넘겨 요청하던 호출은 입력 오류(-32602)를 받고, 역할은 범위 안에서 고쳐 다시 요청할 수 있다.

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
