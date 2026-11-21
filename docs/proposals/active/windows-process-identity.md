---
status: "pending"
stage: "awaiting-approval"
proposal-size: "standard"
created-at: "2026-11-21"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/post-merge-failure-record.md"
  - "docs/architecture/protocol.md"
  - "docs/investigations/active/ci-management-practices-investigation.md"
---

# Windows에서 죽은 실행기를 살아 있다고 판단하지 않게 한다

## Summary

플러그인은 실행기와 그 자식 프로세스가 살아 있는지를 프로세스 번호로만 판단한다.
Windows는 죽은 프로세스의 번호를 몇 초 안에 새 프로세스에 다시 주므로, 죽은
실행기가 살아 있다고 판정되어 해제와 재시작이 "아직 실행 중"으로 거부된다. 이
제안은 프로세스를 기록할 때 시각을 함께 적고, Windows에서 번호가 살아 있다고
나오면 지금 그 번호를 쓰는 프로세스의 생성 시각과 비교해 다른 프로세스인지
가린다. 두 단계로 넣는다. 먼저 사람이 확인하는 경로에, 그다음 자동으로 정리하는
경로에 적용한다.

## Goal

- Windows에서 실행기가 비정상 종료된 뒤 `--release`, `--status`, 붙잡힘 안내가
  실제 상태를 말하게 한다.
- 살아 있는 실행기를 죽었다고 판단하는 일은 지금보다 늘리지 않는다.
- 배포된 플러그인 판과 같은 잠금 파일을 계속 함께 쓸 수 있게 한다.
- 작업 유형: 플러그인 런타임의 판단 방식 변경, 규약 문서 수정, 시험 수정.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 배포되는 플러그인 파일과 잠금 파일의 내용이 바뀐다.
- 고칠 파일이 5개를 넘는다.
- 잘못 판단하면 살아 있는 실행기의 잠금을 지울 수 있다.

## Current State

- 생존 판단은 `plugin/runtime/local-session.mjs`의 `isAlive(pid)` 하나다.
  `process.kill(pid, 0)`이 `ESRCH`가 아니면 살아 있다고 본다. `EPERM`도 살아
  있다고 본다. `docs/architecture/protocol.md`는 "ESRCH만 죽음 증거로 쓴다"고
  적는다.
- 잠금 파일(`watch.lock.json`)의 `poller`와 `children` 항목은 `{pid, nonce}`다.
  시각이 없다. `nonce`는 임의의 값이고, 살아 있는 프로세스가 그것을 쥐고 있다는
  증거는 어디에도 없다.
- 2026-11-21에 `windows-2022` 러너에서 확인했다(실행 `44762001736`).

  | 실험 | 결과 |
  | --- | --- |
  | 90초 동안 프로세스를 계속 띄웠다 끝냄 | 띄운 5,133 / 5,151 / 6,426개 중 4,491 / 3,730 / 4,988개가 20초 안에 죽은 프로세스의 번호를 받았다 |
  | 같은 실험에서 죽은 번호를 `isAlive`로 다시 확인 | 3 / 3 / 4개가 무관한 프로세스 때문에 살아 있다고 나왔다. 죽은 지 0.6~16초 뒤였다 |
  | 같은 실험, `macos-15-intel` | 2,539개 중 0개 |
  | `plugin/bin/harness-background.test.mjs` 반복, 한 개씩 | 300회 중 실패 0 |
  | 같은 반복, 두 개 동시 | 120회 중 25회 실패 |
  | 같은 반복, 세 개 동시 | 120회 중 41회 실패 |

- 가장 많이 실패한 시험은 "holds an unconfirmed child settlement until the owner
  releases it"다. 이 시험은 실행기가 죽은 것을 확인한 뒤 명령을 여러 번 실행하고,
  그중 `--release`가 `still-running`을 돌려준다. 같은 시험이 2026-11-03의 병합 후
  실행에서도 같은 값으로 실패했다.
- 실제 사용자에게는 Windows에서 실행기가 비정상 종료된 뒤에 나타난다. 번호를
  물려받은 프로세스가 끝날 때까지 해제와 재시작이 거부된다.
- 생존 판단을 쓰는 곳은 다음과 같다(`plugin/bin/harness-background.mjs` 기준).

  | 판단 | 쓰는 곳 | 잘못 "살아 있음"일 때 | 잘못 "죽음"일 때 |
  | --- | --- | --- | --- |
  | `processLeft` | `--release`, 붙잡힘 안내, `--status`의 `held` | 해제가 거부된다 | 사람이 확인한 뒤 해제된다 |
  | `staleResident` | 시작과 `--stop`의 자동 정리 | 시작이 막힌다 | 살아 있는 실행기의 잠금이 지워진다 |
  | 실행기 시작 시의 기존 poller 확인 | 새 실행기 시작 | 새 실행기가 끝난다 | 한 세션에 실행기가 둘 등록된다 |
  | `harness-watch`의 `poller-active` | 감시 폴링 시작 | 폴링이 거부된다 | 폴링이 둘이 된다. 약 1초 안에 하나가 물러난다 |

## Scope

포함 범위:

- 프로세스를 기록할 때 등록 시각을 함께 적는 일.
- Windows에서 번호가 살아 있다고 나올 때 생성 시각으로 다시 가리는 일.
- 1단계: `processLeft`를 쓰는 경로. 2단계: 자동 정리와 나머지 경로.
- 시험이 "죽은 프로세스 번호"로 쓰는 값을 재사용될 수 없는 번호로 바꾸는 일.
- `docs/architecture/protocol.md`의 생존 판단 서술 수정, 플러그인 버전 올림.

제외 범위:

- macOS와 Linux의 동작. 번호 재사용이 관찰되지 않았다.
- 잠금 파일의 `schemaVersion`. 올리지 않는다.
- 주기적인 신호로 생존을 판단하는 방식, 이름 붙은 파이프로 판단하는 방식.
- `harness-background` 시험의 남은 실패 중 이 원인으로 설명되지 않는 것.

## Proposal

### 방식

- `poller`와 `children` 항목에 선택 항목 `at`(등록 시각, ISO 형식)을 더한다.
  `registerChild` 한 곳과 poller를 쓰는 두 곳에서 적는다. 예전 판과의 호환을 위해
  두는 고정 항목(`legacy-reclaim-guard`)에는 적지 않는다.
- 판단 순서는 다음과 같다.
  1. `process.kill(pid, 0)`이 `ESRCH`면 죽었다. 지금과 같다.
  2. 기록된 번호가 확인하는 프로세스 자신의 번호면 죽었다. 자기 자신이 그 번호를
     물려받은 것이다.
  3. Windows이고 기록에 `at`이 있으면, 살아 있다고 나온 번호들의 생성 시각을
     PowerShell 한 번으로 묻는다. 생성 시각이 `at`보다 허용 오차 넘게 늦으면 다른
     프로세스이므로 죽었다고 본다.
  4. 그 밖에는 살아 있다고 본다. 질의가 실패하거나, 답이 없거나, 시간 한도를
     넘기거나, `at`이 없거나, 형식이 맞지 않는 경우가 모두 여기에 든다.
- 질의에는 시간 한도를 둔다. PowerShell이 늦게 뜨거나 멈춰도 명령이 끝없이
  기다리지 않게 하기 위해서다. 한도를 넘기면 살아 있다고 본다.
- 질의는 PowerShell의 기본 명령(`Get-Process`)으로 쓴다. .NET 형식을 직접 부르는
  방식은 제한된 언어 모드가 걸린 환경에서 막힐 수 있다. 실험은 .NET 형식으로
  했으므로 구현할 때 기본 명령으로 다시 잰다.
- 생성 시각 질의는 잠금(`withGuard`) 밖에서 한다. 잠금 안에서는 `kill(pid, 0)`만
  다시 확인한다. "지금 번호를 쓰는 프로세스가 `at`보다 늦게 만들어졌다"는 사실은
  한 번 참이면 계속 참이므로 미리 구해도 틀리지 않는다.

### 단계

1. 1단계. `processLeft`를 쓰는 경로에만 적용한다. `--release`, 붙잡힘 안내,
   `--status`다. 새로 "죽음"으로 판정되는 경우는 사람이 한 번 확인한 뒤에야 잠금이
   지워진다.
2. 2단계. `staleResident`, 실행기 시작 시의 확인, `harness-watch`의
   `poller-active`, 포그라운드 해제에 같은 판정을 적용한다. 1단계가 `dev`에서
   실제로 맞게 동작하는 것을 본 뒤에 한다.

### 실험으로 확인한 전제

2026-11-21에 `windows-2022` 러너 세 대에서 쟀다(실행 `44869989304`).

| 확인한 것 | 결과 |
| --- | --- |
| 생성 시각 질의의 첫 호출 | 3.0초, 3.9초, 10.0초 |
| 그 뒤의 호출 | 0.21~0.26초 |
| 번호 20개를 한 번에 물을 때 | 0.23~0.25초 |
| 생성 시각과 등록 직후 시각의 차이 | 2~8밀리초 |
| `kill`이 `EPERM`인 시스템 프로세스(`csrss.exe`, `services.exe`)의 생성 시각 | 얻어졌다. 러너는 관리자 권한이라 일반 사용자에서는 다를 수 있다 |
| 번호 2147483644에 대한 `kill(pid, 0)` | `ESRCH` |
| 종료 직후의 `isAlive` | 죽음으로 나왔다 |

첫 호출이 길게는 10초다. 잠금의 대기 한도가 5초이므로 질의를 잠금 안에서 하면 안
된다는 것이 이 숫자로 확인된다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `plugin/runtime/local-session.mjs` | update | `at` 기록, 판정 함수 추가 | medium. 배포 코드다 |
| `plugin/bin/harness-background.mjs` | update | `processLeft` 등이 미리 구한 판정을 받게 한다 | medium |
| `plugin/bin/harness-watch.mjs` | update | poller에 `at` 기록. 2단계에서 판정 적용 | medium |
| `plugin/runtime/*.test.mjs`, `plugin/bin/harness-background.test.mjs`, `plugin/bin/harness-released-readers.test.mjs`, `plugin/bin/harness-watch.test.mjs` | update | 판정 시험 추가, 죽은 번호를 재사용될 수 없는 값으로 교체 | low |
| `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | update | 배포 파일이 바뀐다 | low |
| `docs/architecture/protocol.md` | update | "ESRCH만 죽음 증거로 쓴다"는 서술과 잠금 항목 설명 | low |
| `scripts/windows/package-windows-plugin.mjs` | update | PowerShell을 파일로 둘 때만 | low |

## Safety Analysis

- 지금보다 "죽음" 판정이 늘어나는 것은 Windows에서, 기록에 `at`이 있고, 번호를
  쓰는 프로세스의 생성 시각이 그보다 늦은 경우뿐이다. 그 프로세스는 기록된
  프로세스일 수 없다.
- 살아 있는 프로세스를 죽었다고 볼 수 있는 경우는 `at`을 적는 순간과 프로세스
  생성 사이에 시계가 허용 오차 넘게 뒤로 간 때뿐이다. 둘의 간격은 밀리초다.
- 질의가 실패하면 지금과 같은 답(살아 있음)을 낸다. 더 나빠지지 않는다.
- 예전 판이 쓴 기록에는 `at`이 없으므로 지금과 똑같이 동작한다.

확인한 항목:

- [x] 출시된 plugin·서버와 함께 쓰는 상태. 아래 표와 시험 실행으로 확인했다.
  2026-11-21에 `plugin/bin/harness-released-readers.test.mjs`가 만드는 잠금의
  `poller`와 `children` 항목에 `at`을 넣고 `STAGEKEEPER_RELEASED_READERS=required`로
  돌렸다. 0.5.14부터 0.6.16까지의 배포된 판이 모두 통과했다(macOS). 0.5.13 이전
  판은 이 시험의 대상이 아니고, 코드를 읽은 결과만 있다.
- [x] 테스트와 스크립트 참조. 죽은 번호를 손으로 만드는 시험 세 곳을 찾았다.
- [x] 런타임 side effect. 질의는 사용자가 명령을 실행할 때와 실행기 시작 시에만
  한다. 매초 도는 반복에서는 하지 않는다. `--status`는 `plugin/skills/background`가
  사용자의 요청으로 부르는 명령이고 반복해서 부르는 곳은 없다.
- [ ] API, 외부 SDK 영향. 서버는 이 파일을 읽지 않는다고 코드 검색으로 확인했으나
  구현 때 다시 본다.

배포된 판이 새 항목을 다루는 방식:

| 판 | `poller`와 `children` 항목의 모르는 키 | 근거 |
| --- | --- | --- |
| 0.4.0 이후의 읽기 | 받아들인다. `pid`와 `nonce`만 검사한다 | 각 판의 `readState` |
| 예전 판의 쓰기 | 읽은 객체를 통째로 다시 써서 키가 남는다. poller를 새로 등록하면 키가 빠지고, 그때는 번호만으로 판단한다 | `atomicWrite(files.lock, state.lock)` |
| 예전 판의 판단 | 번호만 본다. 새 판보다 정리에 엄격하다 | `isAlive` |
| `binding` | 키 수를 정확히 비교한다. 여기에는 키를 더하지 않는다 | `matchesBinding` |

`protocol.md`의 규칙은 예전 판이 무시하는 키에는 잃어도 안전한 정보만 담으라고
한다. `at`은 잃으면 번호만으로 판단하게 될 뿐이라 이 규칙에 맞는다.

## Approval

승인 메모:

- 승인 전.

## Execution Plan

1. 구현 전 실험. 기본 명령으로 쓴 질의의 시간, 시간 한도의 값, 관리자가 아닌
   권한에서의 결과를 `windows-2022`에서 잰다. 임시 PR #405에서 한다.
2. 1단계 구현. 판정 함수, `at` 기록, `processLeft` 경로 적용, 시험, 규약 문서,
   버전. PR 하나.
3. `windows-2022`에서 고치기 전과 후를 같은 실행에서 비교한다. `harness-background`
   시험을 두 개와 세 개 동시로 돌린다.
4. 병합하고 병합 후 실행을 본다.
5. 2단계 구현. 자동 정리 경로와 나머지. PR 하나. 같은 비교를 한다.
6. 임시 PR #405를 닫는다.

## Verification Plan

실행할 검증:

```bash
npm test
npm run test:architecture
node --test plugin/bin/harness-released-readers.test.mjs
node scripts/plugin-lib.mjs --check
npm run verify:shared
npm run docs:check
```

검증 기준:

- 판정의 단위 시험: 생성 시각이 늦으면 죽음, 질의 실패면 살아 있음, `at`이 없으면
  번호만으로 판단, 자기 번호면 죽음, Windows가 아니면 질의하지 않음.
- 살아 있는 보조 프로세스를 `at`이 그보다 이른 값으로 기록해 "번호가 재사용된"
  상황을 기다리지 않고 재현한다.
- 배포된 판의 읽기 시험이 `at`이 든 잠금으로도 통과한다.
- `windows-2022`의 전후 비교에서 1단계 뒤 `--release`와 붙잡힘 관련 실패가
  없어진다. 자동 정리 관련 실패는 2단계 뒤에 없어진다.
- 한 개씩 300회 반복에서 실패가 여전히 0이다.

확인하지 못한 것:

- 일반 사용자 권한에서 시스템 프로세스의 생성 시각을 얻을 수 있는지. 얻지 못하면
  그 경우는 지금처럼 살아 있다고 남는다.
- 사용자 기기에서의 첫 질의 시간. 러너에서는 3~10초였다.
- 남은 실패 중 이 원인으로 설명되지 않는 것의 비중.
- 1단계만으로 없어지는 실패의 비중. 실패한 시험 87건 중 실행기의 생존 판단을
  다루는 것이 46건이었으나, 그중 어느 것이 `processLeft` 경로이고 어느 것이 자동
  정리 경로인지는 나누지 않았다.
- 일반 사용자 권한에서 생성 시각을 얻지 못할 때 WMI(`Win32_Process`의
  `CreationDate`)로 다시 묻는 것이 필요한지. 더 느리다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `windows-2022`의 번호 재사용 실험 | 위 Current State의 표 | 실행 `44762001736` |
| `windows-2022`의 생성 시각 질의 실험 | 위 Proposal의 표 | 실행 `44869989304` |
| 구현 뒤의 검증 | Not run yet | |

## Risks and Rollback

잔여 리스크:

- `--status`와 `--release`가 Windows에서 느려진다. 살아 있는 실행기가 있을 때마다
  0.2초, 첫 호출은 몇 초가 든다.
- 2단계에서 판정이 틀리면 살아 있는 실행기의 잠금이 지워진다. 서버의 실행기
  임대가 두 번째 방어선이다.
- 번호를 물려받은 프로세스가 기록된 프로세스보다 먼저 만들어졌을 수는 없으므로
  방향은 한쪽뿐이지만, 허용 오차 안에서 재사용되면 살아 있다고 남는다.

롤백 방법:

- 각 단계의 PR을 되돌리고 플러그인 버전을 다시 올린다. 잠금에 남은 `at`은 예전
  판과 되돌린 판 모두 무시한다.

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
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다. 지금은 승인 전이다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. 구현 전이다.
- [x] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다. 완료 전이다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다. 닫힌 문서가 아니다.
