---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-10-07"
approved-by: "HamSangEok"
approved-at: "2026-10-07"
approval-scope: "Phase 0(단계별 시간 기록), Phase 1(빈 루트 선부여)"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/protocol.md"
  - "docs/architecture/verification.md"
  - "docs/test-reports/active/dual-client-runtime-report.md"
---

# 역할 명령 스냅숏 준비 시간 단축 — 보안 계약 유지형

## Summary

Windows 역할 명령(`role_command_exec`)은 실행할 때마다 저장소 전체를 새 복사본으로 만든다.
`node_modules`를 포함한 이 저장소에서는 복사 67~89초, 복사 뒤 ACL 상속 전파 약 16초,
정리 약 15초가 명령마다 붙는다(CI 실측). 파일당 약 2~2.6ms라서 파일 수 상한(10만 개)에
가까운 프로젝트는 준비 상한 300초에 다시 걸릴 수 있다.

이 문서는 `docs/architecture/protocol.md`의 보안 계약을 바꾸지 않는 개선만 다룬다.
1. 단계별 소요 시간을 결과에 기록한다(Phase 0).
2. 역할 SID 권한을 복사 **전** 빈 디렉터리에 부여해 상속 전파를 없앤다(Phase 1).
3. 경로 검사는 그대로 두고 비동기로 바꿔 복사와 겹치게 하되, 측정으로 이득이 확인될 때만 채택한다(Phase 2).
4. 선택: 스냅숏 삭제를 결과 반환 뒤로 미룬다(Phase 3).

검사를 줄이거나 캐시하는 안, `node_modules` 재사용은 범위에서 제외한다.

## Goal

### 목표

- 역할 명령 1회의 준비 시간(스냅숏, ACL, 정리)을 줄인다.
  - 사용자는 검증 역할의 `npm test`/`npm run build`마다 이 시간을 기다린다.
  - Windows CI의 전체 빌드 리허설도 같은 경로를 쓴다.
- 줄인 만큼을 수치로 확인할 수 있게, 명령 결과에 단계별 소요 시간을 남긴다.
- 다음 보장은 지금과 같게 유지한다.
  - 명령마다 새 복사본과 새 LPAC profile을 만든다.
  - 파일마다 IO 전후로 경로와 identity를 확인하고, 그 결과를 캐시하지 않는다.
  - ACL은 소유한 스냅숏에만 부여한다.

### 비목표

- 파일마다 하는 조상 경로 검사를 디렉터리 단위로 묶거나 결과를 캐시하는 것.
  - `protocol.md:504`와 `plugin/runtime/role-files.mjs:84-86`의 계약을 바꾸게 된다.
- native 경로 표기가 일치할 때 조상 검사를 생략하는 것.
  - `a44cb8c`에서 도입했다가 `fa42731`에서 되돌린 방식이다(Current State 참고).
- `node_modules`를 명령 사이에서 재사용하거나 복사에서 빼는 것(`protocol.md:499` "새 복사본").
- 런타임 복사본을 명령 사이에서 재사용하는 것.
- 파일 128MiB, 10만 개, 총 2GiB, 준비 300초 상한 변경.
- macOS/Linux. 이 경로는 Windows native backend 전용이다(`role-commands.mjs:113`).

### 성공 기준

수치 목표는 Phase 0 기준선(Current State)으로 정한다. 이 문서의 머지가 목표 확정이다.

- **Phase 1 목표:** CI 리허설 3회 중앙값에서 `timings.grantMs + aclMs`가 3,000ms 이하.
  - 기준선 `aclMs` 중앙값은 15,626ms다. 80% 이상 줄이는 목표다.
  - `grantMs`에는 도우미 기동 1회가 들어간다(#122 이후 0.4~2.5초). 문서 적용본 로컬 검증은 `grantMs` 1.1초, `aclMs` 5ms였다.
- **Phase 2 채택 게이트:** 같은 날 번갈아 잰 5회씩의 중앙값에서 `snapshotMs`가 Phase 2 직전 `dev`보다 20% 이상 줄어야 한다.
  - 기준선 3회의 `snapshotMs`가 43.6~81.7초로 크게 흩어져, 3회 중앙값으로는 20% 차이를 가리기 어렵다.
- Phase 0 뒤 `role_command_exec` 결과와 CI 리허설 출력에 단계별 시간이 숫자로 남는다.
  - 항목: `timings.snapshotMs`·`scratchMs`·`runtimeMs`·`commandMs`, 도우미의 `aclMs`. Phase 1부터 `timings.grantMs`가 더해진다.
  - `dev` CI 리허설 표본으로 기준선을 문서에 기록한다.
- 기존 보안 시험이 의미 변경 없이 통과한다(fixture 준비 순서만 바뀜).
  - `plugin/bin/harness-role-files.test.mjs`
  - `plugin/bin/harness-role-commands.test.mjs`
  - `scripts/windows-role-readlink.test.mjs`
  - `scripts/windows-role-spawn-diagnostics.test.mjs`
- Verification Plan의 새 시험이 통과한다.
  - 비동기 경로 검사 동치성
  - 선부여 SID·권한·profile 불일치 시 실패
  - 전역 복사 대기열의 실패 전파
  - 단계별 시간 필드
- 각 Phase 전후의 리허설 시간을 같은 방식으로 기록한다.
  - Phase 2는 위 게이트를 넘을 때만 채택한다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 5개 이상 파일을 변경한다(Affected Files 11개).
- 보안 경계에 닿는 런타임 동작이 바뀐다. 신뢰된 helper의 실행 모드, ACL 부여 순서, 경로 검사 구현이다.
- 롤백에 플러그인 버전 재상승이 필요해 단순 revert 이상이다.

## Current State

### 측정

CI 값은 측정용으로만 쓰고 닫은 PR #120의 두 실행(37387573737, 37388624569)에서 뽑았습니다.
같은 저장소(33,900개 파일, 764.6MB)에 대한 전체 빌드 리허설입니다.

| 단계 | 실행 1 | 실행 2 |
| --- | --- | --- |
| 저장소 스냅숏(`snapshotRepository`) | 67.6초 | 89.0초 |
| 런타임 복사(`copyRuntime`) | 3.8초 | 9.8초 |
| 도우미의 `snapshot-acl` 단계(복사 후 상속 권한 부여) | 16.8초 | 15.9초 |
| 실제 `npm run build`(`job-execution`) | 41.7초 | 35.1초 |
| 스냅숏 삭제(`rm`) | 14.8초 | 14.5초 |

- 실행 1에는 그 뒤 #122로 고친 도우미 기동 지연(약 21.5초)이 따로 있었고, 위 표에서는 뺐습니다.

로컬 값은 Windows 11(Defender 켜짐)에서 OneDrive 밖에 받은 `dev` worktree(33,916개 파일)로 쟀습니다. 측정 스크립트는 저장소에 넣지 않은 임시 스크립트입니다.

| 측정 | 1회차 | 2회차 |
| --- | --- | --- |
| 제품 `snapshotRepository` | 102.0초 | 99.3초 |
| 같은 파일 단순 복사+SHA-256, 동시성 8 | 59.7초 | 58.2초 |
| 같은 파일 단순 복사+SHA-256, 동시성 32 | 57.5초 | 57.8초 |
| 같은 파일 단순 복사+SHA-256, 동시성 64 | 57.1초 | 55.3초 |
| 경로 검사만(파일당 2회 + 디렉터리당 1회) | 20.4초 | — |

- 경로 검사만 따로 잰 것은 한 번뿐이고, 복사는 하지 않았습니다.
- 동시성은 결과에 영향이 없었습니다. 제품 경로는 단순 복사보다 약 40초 더 걸렸고, 그중 20초가 경로 검사였습니다.
- 러너는 Defender 실시간 검사가 꺼져 있어 절대값이 다릅니다. 이 차이 때문에 Phase 2는 측정 게이트를 둡니다.

**상한 여유:** 300초 상한에 걸린 전례가 있습니다(`docs/test-reports/active/dual-client-runtime-report.md:394`, E102).
- 같은 규모의 스냅숏이 처음에는 120초, 이어 300초 상한에 걸렸습니다.
- native 경로 해석과 8개 단위 묶음 복사를 넣은 뒤에야 통과했습니다.
- 지금 파일당 2.0~2.6ms이면 10만 개 상한에서 200~263초입니다.

### Phase 0 기준선 (CI, 2026-10-07)

`dev` `c8e81c1`(#130 머지)의 push 실행 37579574253과 같은 커밋 재실행 2회입니다. 단위는 ms이고, 마지막 행만 초입니다.

| 항목 | 1회 | 2회 | 3회 | 중앙값 |
| --- | --- | --- | --- | --- |
| `snapshotMs` | 81,695 | 60,584 | 43,557 | 60,584 |
| `scratchMs` | 1 | 1 | 1 | 1 |
| `runtimeMs` | 3,028 | 2,945 | 3,083 | 3,028 |
| `commandMs` | 50,660 | 56,488 | 37,683 | 50,660 |
| 그 안의 `aclMs` | 17,612 | 15,626 | 11,497 | 15,626 |
| 리허설 step 전체(초) | 152 | 132 | 93 | 132 |

- `aclMs`는 `commandMs` 중앙값의 약 31%, 리허설 전체의 약 12%입니다.
- step 전체에서 `timings` 합을 뺀 약 9~17초는 결과 반환 뒤 스냅숏 삭제와 스크립트 기동 등이라 `timings`에 잡히지 않습니다.
- 참고로 PR #130 실행(37579053926)은 `snapshotMs` 65,736, `runtimeMs` 3,412, `commandMs` 57,988, `aclMs` 14,318이었습니다.

### 문서 적용본 예비 검증 (로컬, 2026-10-07)

이 문서의 Phase 0~2 코드 블록을 `dev`(`1dce256`) 사본에 그대로 적용해 돌렸습니다. 커밋하지 않은 임시 사본이며, 런타임은 CI artifact를 무결성 검증 후 사용했습니다(실행 파일 SHA-256 `033f9ac…`).

- **컴파일·연결:** C# 블록은 도우미와 같은 PowerShell 5.1 `Add-Type`로 컴파일됐고, JS 모듈은 import 연결까지 통과했습니다.
- **시험:** `harness-role-files` 10개, `harness-role-commands` 14개(런타임 필요 시험 포함), readlink·spawn 시험이 모두 통과했습니다.
- **변형 확인:** 조상 검사를 건너뛰게 바꾸면 새 동치 시험과 기존 시험이 함께 실패합니다.

이 저장소 전체를 대상으로 한 네트워크 차단 빌드 리허설(각 1회)입니다.

| 측정 | 원본 | 적용본 |
| --- | --- | --- |
| 리허설 전체 | 369초 | 267초 |
| `prepare` (`grantMs`) | — | 1.1초 |
| `Run`의 `snapshot-acl` (`aclMs`) | 측정 안 함(CI 기준 15.9~16.8초) | 5ms |
| 저장소 스냅숏 (`snapshotMs`) | 리허설 안에서는 측정 안 함 | 164.2초 |
| 도우미와 실제 빌드 (`commandMs`) | — | 85.2초 |

- Phase 1이 ACL 단계를 없앤다는 것은 확인됐습니다(`aclMs` 5ms).
- 적용본의 스냅숏 164.2초는 같은 PC에서 원본 함수만 따로 쟀던 99~102초보다 깁니다. Phase 2(비동기 검사)가 이 환경에서는 오히려 느릴 수 있다는 신호입니다.
- 원본과 적용본의 스냅숏을 번갈아 재는 비교는 PC 메모리 부족으로 원본 1회(237초)에서 중단돼 결론을 내지 못했습니다. 로컬 수치는 Defender와 시스템 부하의 영향을 크게 받으므로, Phase 2 채택 여부는 CI 측정 게이트로만 판단합니다.

### 현재 코드 경로

명령 한 번(`plugin/runtime/role-commands.mjs:202-228`, `execute`)은 다음 순서로 돕니다.

1. 소유 디렉터리를 만들고(`:210-211`) 저장소를 스냅숏합니다(`:214`).
2. scratch를 스냅숏하고(`:216-217`) 런타임을 복사합니다(`:218`).
3. 도우미를 실행합니다(`:220`, `runNativeCommand`).
4. `finally`에서 소유 디렉터리를 삭제할 때까지 기다립니다(`:226`).

`snapshotRepository`(`role-commands.mjs:33-88`)가 파일 하나에 하는 일:
- `fileBroker.permission`과 `fileBroker.resolveRead`를 부르고(`:75-76`) 동기 `lstatSync`로 상태를 읽습니다(`:77`).
- 복사가 끝나면 `resolveRead`를 다시 부르고 `lstatSync`로 identity·mtime·size를 비교합니다(`:54-55`).
- 디렉터리마다 `resolveRead`(`:61`)와 `readdir`(`:62`)를 부릅니다.
- 복사는 버퍼 8개(`:35`)로 최대 8개씩 돌고, **디렉터리 경계마다** 모두 끝나길 기다립니다(`flush`, `:64-71`, `:78`, `:84`).

`resolveRead`(`plugin/runtime/role-files.mjs:169`)는 `resolveTarget`(`:56-89`)을 동기로 실행합니다.
- `realpathSync.native` 1회를 부릅니다(`:72`).
- 드라이브 루트부터 대상까지 **모든 조상에** `lstatSync`를 합니다(`:75-83`).
- 표기가 다르면 JS `realpathSync`를 한 번 더 부릅니다(`:87`).
- 깊은 `node_modules` 경로에서는 파일당 수십 번의 동기 시스템 호출이 메인 스레드를 막습니다.

도우미의 ACL 부여(`plugin/runtime/windows/RoleProcess.cs:147-156`)는 이렇게 동작합니다.
- `Run`이 새 AppContainer profile을 만든 **뒤**, 이미 채워진 `repo`·`scratch`·`runtime`에 상속 규칙을 붙입니다(`Grant`, `:86-90`, `inherit: true`).
- 그러면 Windows가 트리 전체(3.4만 개 파일)로 권한을 전파합니다. 이것이 `snapshot-acl` 약 16초입니다.
- 같은 단계의 root 권한(`:151`)은 상속되지 않는 규칙인데도, 채워진 트리에 쓰면 하위 트리를 다시 훑습니다. 로컬 실측(2만 개 파일, `RoleProcess.cs`와 같은 `Directory.SetAccessControl`) 결과는 다음과 같습니다.
  - 채워진 root에 상속되지 않는 규칙 추가: 1,839ms / 2,001ms
  - 채워진 하위 디렉터리에 상속 규칙 추가: 1,807ms
  - **빈** 디렉터리에 상속 규칙 추가: 5ms. 그 뒤 2만 개 파일을 채우는 시간은 규칙이 없을 때와 같았고(12.7초 / 11.8~12.7초), 가장 깊은 파일에서 상속된 규칙을 확인했습니다.
- profile 이름은 `Run`에서 무작위로 정하므로(`:138`) 복사 전에는 SID를 알 수 없습니다.

### 지켜야 할 계약과 이력

- **새 복사본:** `protocol.md:499` "명령은 같은 파일 정책으로 내보낸 repository와 role scratch의 새 복사본에서 실행한다."
- **검사 방식:** `protocol.md:503-504`
  - "실제 경로와 IO 전후 identity·mtime·size를 매번 확인하며 권한·경로 결과를 cache하지 않는다."
  - 코드 주석 `role-files.mjs:84-86`: "No path/permission result is cached: callers recheck before and after IO, including aliases above the policy root."
- **조상 검사 생략 금지 이력:**
  - `a44cb8c`는 native 표기가 같으면 조상 `lstat`를 건너뛰었습니다.
  - `fa42731`이 이를 되돌리고 시험(`harness-role-files.test.mjs:64-71`)을 추가했습니다. 시험 주석: "An OS canonical spelling may preserve a mounted path. Real on-disk ancestor metadata must still refuse its junction"
- **도우미 계약:** `protocol.md:544-546`, `:554`, `:560-561`
  - 새 LPAC profile을 쓰고, ACL은 새 owned root의 metadata와 복사본에만 부여한다.
  - 소유권 등록·active 확인 뒤에만 컴파일·실행한다.
  - 명령이 끝난 트리에 ACL 변경을 전파하지 않는다.
- 브로커 생명주기: 역할 실행 1회마다 `createRoleCommands`로 브로커를 만들고, 그 전에 `verifyNativeRuntime` 사전 점검을 돌립니다(`plugin/runtime/codex-thread.mjs:324-325`).

## Scope

포함 범위:

- Phase 0: 명령 결과의 단계별 시간(`timings`)과 도우미 결과의 `aclMs`.
- Phase 1: 도우미 `prepare` 모드(빈 루트에 역할 SID 선부여), `Run`의 SID·부여 확인, 호출부의 준비 순서.
- Phase 2: `resolveTarget`의 단일 구현을 동기·비동기 두 방식으로 실행하는 구조, `snapshotRepository`의 전역 복사 대기열. 측정 게이트를 통과해야 채택한다.
- Phase 3(선택, Open Question): 결과 반환 뒤 스냅숏 삭제와 `close()`에서의 합류.
- `protocol.md`의 해당 문장 갱신, 플러그인 버전 상승.

제외 범위:

- Goal의 비목표 전부.
- `role_git_read`(`plugin/runtime/role-git.mjs`)의 동기 `resolveRead` 사용. 이 경로는 바꾸지 않는다.
- Linux `check` 워크플로와 CI 설정.

## Alternatives

### Option A: 계약 유지 묶음 — 선부여 + 비동기 검사(게이트) + 선택적 정리 지연

- 장점
  - 보장 내용이 같다. 검사 횟수·순서·대상, 명령별 profile, ACL 범위가 그대로다.
  - 선부여는 트리 전파를 없애 "명령이 끝난 트리에 ACL을 전파하지 않는다"보다 더 강해진다.
  - 단계별로 따로 PR과 측정을 할 수 있다.
- 단점
  - 도우미에 실행 모드가 하나 늘고 명령마다 도우미가 1회 더 뜬다. #122 이후 도우미 1회는 0.4~2.5초였고, `prepare`는 명령 실행이 없어 더 짧을 것으로 본다.
  - 비동기 검사는 이득이 불확실하다.

### Option B: 디렉터리 단위 조상 검사

- 장점: 파일당 검사가 O(경로 깊이)에서 O(1)로 줄어 효과가 가장 클 수 있다.
- 단점
  - 경로 바꿔치기 감지 창이 파일 단위에서 디렉터리 단위로 넓어진다.
  - `protocol.md:504`와 `role-files.mjs:84-86`을 바꿔야 한다.
- 사용자가 "현 계약 유지"를 골라 제외한다.

### Option C: `node_modules` 재사용 또는 제외

- 장점: 파일의 약 97%를 건너뛴다(로컬 작업 트리 집계 33,203/34,323).
- 단점
  - "새 복사본" 계약(`protocol.md:499`)이 바뀌고 명령 사이 격리가 약해진다.
  - 의존성 폴더에 캐시를 쓰는 도구와 충돌할 수 있다.
- 제외한다.

### Option D: native 표기가 같으면 조상 검사 생략

- 이미 시도했다가 되돌린 방식이다(`a44cb8c` → `fa42731`). 제외한다.

### Option E: 그룹 SID(ALL RESTRICTED APPLICATION PACKAGES)에 미리 부여

- 장점: SID를 미리 알 수 있어 도우미 추가 실행이 필요 없다.
- 단점: 같은 머신의 다른 LPAC 샌드박스도 스냅숏에 접근하게 된다. `RoleProcess.cs:155-163`의 경계 canary가 지키는 격리와 충돌한다. 제외한다.

### Option F: Node가 AppContainer SID를 직접 계산하고 `icacls`로 부여

- 장점: 도우미 추가 실행이 없다.
- 단점: 문서화되지 않은 SID 파생 규칙에 기대야 한다. 제외한다.

### Option G: 도우미 1회 실행 안에서 "권한 준비 → 복사 완료 신호 → 실행" 핸드셰이크

- 장점: 도우미 실행을 1회 아낀다.
- 단점
  - 정지 신호를 받는 stdin 제어 프로토콜(`RoleProcess.cs:145`, `role-process.ps1:13`)이 바뀐다.
  - profile 수명이 복사 시간만큼 늘고 중단 시 정리 경로가 생긴다.
  - 도우미 시간 제한(`role-commands.mjs:145`)을 재배치해야 한다.
- 보류한다.

### Option H: 복사 동시성 상향

- 로컬 측정에서 8, 32, 64 사이 차이가 없었다. 제외한다.

### 선택: Option A

- 근거
  - 계약 유지가 사용자 결정이다.
  - Phase 1은 측정된 16초를 구조적으로 없앤다.
  - Phase 2·3은 측정과 결정에 따라 넣거나 뺄 수 있다.
  - 선부여 방식으로는 기존 `Run` 실행 경로와 stdin 제어 프로토콜을 그대로 두는 별도 `prepare` 실행을 Option G보다 우선한다.

## Proposal

### Phase 0 — 단계별 시간 기록

- `execute`에 `performance.now()` 기반 단계 측정(`timings`)을 넣습니다. 아래 Phase 1 After의 `lap`과 같습니다.
  - Phase 0 시점의 항목: `snapshotMs`, `scratchMs`, `runtimeMs`, `commandMs`
  - Phase 1 뒤에 추가되는 항목: `grantMs`
- 도우미 `Result`에 `aclMs`를 추가합니다(Phase 1 After의 `RoleProcess.cs` 참고).
  - Phase 0에서는 `Run`의 기존 `snapshot-acl` 단계를 `Stopwatch`로 감쌉니다.
  - 숫자만 기록합니다. "Numeric diagnostics and fixed stages only"(`role-process.ps1:35`) 원칙과 같습니다.
- 리허설 스크립트는 이미 `result` 전체를 출력하므로 바꿀 필요가 없습니다(`scripts/rehearse-windows-project-build.mjs`의 `evidence.result`).
- 기준선: 기록했습니다(Current State "Phase 0 기준선"). 수치 목표는 성공 기준에 있습니다.

### Phase 1 — 역할 SID를 빈 루트에 먼저 부여

흐름: `execute`가 빈 `repo`·`scratch`·`runtime`을 만들고 → 도우미를 `prepare` 모드로 실행합니다 → 그다음 복사합니다.
- `prepare`는 역할 SID를 파생해 root의 Traverse 계열 규칙과 세 루트의 상속 규칙을 붙입니다. profile·토큰·프로세스는 만들지 않습니다.
- 새 파일은 생성 시점에 규칙을 상속합니다.
- `Run`은 지금처럼 profile을 새로 만들고, 그 SID가 준비 때 SID와 같은지와 네 규칙이 있는지 **읽기만** 해서 확인합니다.
- root 규칙까지 `prepare`로 옮기는 이유: 상속되지 않는 규칙이라도 채워진 트리에 쓰면 하위 트리를 다시 훑기 때문입니다(Current State 실측). 그래서 `Run`은 채워진 트리에 ACL을 전혀 쓰지 않습니다.

#### `plugin/runtime/windows/role-process.ps1`

Before (`:26-27`, `:34`):

```powershell
  $phase = 'launch'
  $result = [StagekeeperRoleProcess]::Run($request.root, $request.command, $request.cwd, $request.timeoutMs)
```

```powershell
  if ($phase -eq 'launch') { $phase = [StagekeeperRoleProcess]::FailedStage; if (-not $phase) { $phase = [StagekeeperRoleProcess]::Stage } }
```

After:

```powershell
  $phase = 'launch'
  # Prepare grants the role SID on the still-empty snapshot roots before the owner copies files.
  if ($request.mode -eq 'prepare') { $result = [StagekeeperRoleProcess]::Prepare($request.root, $request.profile) }
  else { $result = [StagekeeperRoleProcess]::Run($request.root, $request.profile, $request.sid, $request.command, $request.cwd, $request.timeoutMs) }
```

`:34`는 그대로 둡니다. `Prepare` 실패 시 `FailedStage`가 비어 있으므로 `Stage`(`prepare-empty` 등)가 진단에 나갑니다.

- 지켜야 할 것: `prepare` 모드도 `start` 활성화(`:13`)와 컴파일 뒤에만 동작합니다.

#### `plugin/runtime/windows/RoleProcess.cs`

Before (`:17-22`, `:36-37`, `:86-90`):

```csharp
  public sealed class Result {
    public uint exitCode;
    public uint maxActiveProcesses;
    public string status, stdout, stderr;
    public bool quiescent, outputTruncated;
  }
```

```csharp
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name, string display, string description, IntPtr capabilities, uint count, out IntPtr sid);
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
```

```csharp
  static void Grant(string directory, SecurityIdentifier sid, FileSystemRights rights, bool inherit) {
    var acl = Directory.GetAccessControl(directory);
    acl.AddAccessRule(new FileSystemAccessRule(sid, rights, inherit ? InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit : InheritanceFlags.None, PropagationFlags.None, AccessControlType.Allow));
    Directory.SetAccessControl(directory, acl);
  }
```

After (새 필드·선언·함수. `Grant`는 그대로 두고, 새 함수는 `Grant`(`:86-90`) 바로 다음에 둡니다):

```csharp
  public sealed class Result {
    public uint exitCode;
    public uint maxActiveProcesses;
    public string status, stdout, stderr, sid;
    public bool quiescent, outputTruncated;
    public long aclMs;
  }
```

```csharp
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name, string display, string description, IntPtr capabilities, uint count, out IntPtr sid);
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
  [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);
```

```csharp
  // Shared by Prepare and Run. The trusted broker created this owned directory. .NET and
  // Node differ in Windows path canonicalization (including system TEMP's 8.3 spelling).
  // Normalize the same physical target; never accept UNC/device roots or grant
  // permissions to an original/model-selected path.
  static string[] SnapshotRoots(string root) {
    Stage = "validation-local-path";
    if (root == null || root.Length < 4 || !Char.IsLetter(root[0]) || root[1] != ':' || root[2] != '\\' || !Path.IsPathRooted(root)) throw new Exception("A local owned snapshot is required");
    root = Path.GetFullPath(root);
    string[] roots = { root, Path.Combine(root, "repo"), Path.Combine(root, "scratch"), Path.Combine(root, "runtime") };
    Stage = "validation-alias";
    foreach (string dir in roots) if ((File.GetAttributes(dir) & FileAttributes.ReparsePoint) != 0) throw new Exception("Snapshot alias refused");
    return roots;
  }
  static string ProfileName(string name) {
    Stage = "validation-profile";
    if (name == null || !System.Text.RegularExpressions.Regex.IsMatch(name, "^stagekeeper\\.role\\.[0-9a-f]{32}$")) throw new Exception("Invalid role profile");
    return name;
  }
  const FileSystemRights RootRights = FileSystemRights.ReadAttributes | FileSystemRights.ReadExtendedAttributes | FileSystemRights.Traverse | FileSystemRights.Synchronize;
  // Read-only check. Any DACL write on a populated directory re-walks its subtree, even
  // for a non-inheritable rule, so Run never writes ACLs on the copied trees.
  static void RequireGrant(string directory, SecurityIdentifier sid, FileSystemRights rights, bool inherit) {
    var flags = inherit ? InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit : InheritanceFlags.None;
    foreach (FileSystemAccessRule rule in Directory.GetAccessControl(directory).GetAccessRules(true, false, typeof(SecurityIdentifier)))
      if (rule.IdentityReference.Equals(sid) && rule.AccessControlType == AccessControlType.Allow && rule.InheritanceFlags == flags && (rule.FileSystemRights & rights) == rights) return;
    throw new Exception("Prepared snapshot grant missing");
  }
  // Grants the role SID on the still-empty snapshot roots so files copied afterwards
  // inherit it at creation. No profile, token or process exists yet; Run creates the profile.
  public static Result Prepare(string root, string profileName) {
    string[] roots = SnapshotRoots(root);
    string name = ProfileName(profileName);
    Stage = "prepare-empty";
    for (int i = 1; i < roots.Length; i++) using (var entries = Directory.EnumerateFileSystemEntries(roots[i]).GetEnumerator()) if (entries.MoveNext()) throw new Exception("Snapshot root is not empty");
    Stage = "prepare-sid";
    IntPtr sid;
    int status = DeriveAppContainerSidFromAppContainerName(name, out sid);
    if (status != 0) Marshal.ThrowExceptionForHR(status);
    try {
      var identifier = new SecurityIdentifier(sid);
      Stage = "prepare-acl";
      var clock = System.Diagnostics.Stopwatch.StartNew();
      Grant(roots[0], identifier, RootRights, false);
      Grant(roots[1], identifier, FileSystemRights.Modify, true);
      Grant(roots[2], identifier, FileSystemRights.Modify, true);
      Grant(roots[3], identifier, FileSystemRights.ReadAndExecute, true);
      return new Result { status = "exited", stdout = "", stderr = "", quiescent = true, sid = identifier.Value, aclMs = clock.ElapsedMilliseconds };
    } finally { FreeSid(sid); }
  }
```

`Run` Before (`:123-156` 중 바뀌는 부분 전체. `:139-146`은 표시만 하고 바뀌지 않습니다):

```csharp
  public static Result Run(string root, string command, string cwd, int timeoutMs) {
    Stage = "validation-bounds";
    if (timeoutMs < 100 || timeoutMs > 120000 || command == null || command.Length > 4096 || command.IndexOf('\0') >= 0) throw new Exception("Invalid role request");
    Stage = "validation-local-path";
    if (root == null || root.Length < 4 || !Char.IsLetter(root[0]) || root[1] != ':' || root[2] != '\\' || !Path.IsPathRooted(root)) throw new Exception("A local owned snapshot is required");
    // The trusted broker created this owned directory. .NET and Node differ in
    // Windows path canonicalization (including system TEMP's 8.3 spelling).
    // Normalize the same physical target; never accept UNC/device roots or grant
    // permissions to an original/model-selected path.
    root = Path.GetFullPath(root);
    Stage = "validation-cwd";
    if (cwd == null || cwd.StartsWith("\\") || cwd.IndexOf(':') >= 0 || Array.Exists(cwd.Split('\\', '/'), part => part == ".." || part == ".")) throw new Exception("Invalid snapshot cwd");
    string repo = Path.Combine(root, "repo"), scratch = Path.Combine(root, "scratch"), runtime = Path.Combine(root, "runtime");
    Stage = "validation-alias";
    foreach (string dir in new string[] { root, repo, scratch, runtime }) if ((File.GetAttributes(dir) & FileAttributes.ReparsePoint) != 0) throw new Exception("Snapshot alias refused");
    string name = "stagekeeper.role." + Guid.NewGuid().ToString("N"), drive = null;
    // ... (unchanged: :139-146, byte-identical)
      Stage = "profile-create";
      int status = CreateAppContainerProfile(name, name, "Disposable Stagekeeper role", IntPtr.Zero, 0, out sid);
      if (status != 0) Marshal.ThrowExceptionForHR(status); profile = true; identifier = new SecurityIdentifier(sid);
      Stage = "snapshot-acl";
      Grant(root, identifier, FileSystemRights.ReadAttributes | FileSystemRights.ReadExtendedAttributes | FileSystemRights.Traverse | FileSystemRights.Synchronize, false);
      Grant(repo, identifier, FileSystemRights.Modify, true);
      Grant(scratch, identifier, FileSystemRights.Modify, true);
      Grant(runtime, identifier, FileSystemRights.ReadAndExecute, true);
```

`Run` After:

```csharp
  public static Result Run(string root, string profileName, string expectedSid, string command, string cwd, int timeoutMs) {
    Stage = "validation-bounds";
    if (timeoutMs < 100 || timeoutMs > 120000 || command == null || command.Length > 4096 || command.IndexOf('\0') >= 0) throw new Exception("Invalid role request");
    Stage = "validation-cwd";
    if (cwd == null || cwd.StartsWith("\\") || cwd.IndexOf(':') >= 0 || Array.Exists(cwd.Split('\\', '/'), part => part == ".." || part == ".")) throw new Exception("Invalid snapshot cwd");
    string[] roots = SnapshotRoots(root);
    root = roots[0];
    string repo = roots[1], scratch = roots[2], runtime = roots[3];
    string name = ProfileName(profileName), drive = null;
    long aclMs = 0;
    // ... (unchanged: :139-146, byte-identical)
      Stage = "profile-create";
      int status = CreateAppContainerProfile(name, name, "Disposable Stagekeeper role", IntPtr.Zero, 0, out sid);
      if (status != 0) Marshal.ThrowExceptionForHR(status); profile = true; identifier = new SecurityIdentifier(sid);
      Stage = "profile-sid";
      if (!String.Equals(identifier.Value, expectedSid, StringComparison.Ordinal)) throw new Exception("Profile SID differs from prepared grants");
      Stage = "snapshot-acl";
      var aclClock = System.Diagnostics.Stopwatch.StartNew();
      // Prepare wrote these rules before the owner copied files, and copied files inherited
      // them at creation. Only read them here: a write would re-walk the populated tree.
      RequireGrant(root, identifier, RootRights, false);
      RequireGrant(repo, identifier, FileSystemRights.Modify, true);
      RequireGrant(scratch, identifier, FileSystemRights.Modify, true);
      RequireGrant(runtime, identifier, FileSystemRights.ReadAndExecute, true);
```

`Run`의 이후 부분은 두 군데만 바뀝니다.
- 경계 canary 끝(`:163` 다음)에 `aclMs = aclClock.ElapsedMilliseconds;`를 둡니다.
- 반환문(`:239`)의 `Result` 초기화에 `aclMs = aclMs`를 더합니다.
- `finally`(`:240-260`)와 profile 삭제(`:258-259`)는 그대로입니다.

- 지켜야 할 것: 명령마다 새 profile을 만들고 삭제하며, ACL은 소유 루트에만 둡니다.
- 설계로 새로 생기는 실패 분기(Open Questions에서 검토):
  - `validation-profile`, `profile-sid`, `RequireGrant` 실패
  - `prepare-empty`, `prepare-sid`
- 검사 순서가 바뀝니다. 지금은 local-path → cwd → alias 순이고, 바꾼 뒤에는 cwd → local-path → alias 순입니다. 둘 다 잘못됐을 때 보고되는 첫 오류만 달라집니다.

#### `plugin/runtime/role-commands.mjs`

`copyRuntime` Before (`:107`):

```js
  await mkdir(destination); await visit(runtime.directory);
```

After:

```js
  // prepareNativeRoot created this root empty so copied files inherit the role grant.
  await mkdir(destination, { recursive: true }); await visit(runtime.directory);
```

새 함수(`runNativeCommand` 다음):

```js
// Grants the role SID on the still-empty roots before any snapshot bytes exist, with the
// same ownership registration and activation fencing as a command launch.
export async function prepareNativeRoot(root, lifecycle = {}) {
  for (const name of ["repo", "scratch", "runtime"]) await mkdir(path.join(root, name));
  const profile = "stagekeeper.role." + randomUUID().replaceAll("-", "");
  // command/cwd keep the shared request shape; the helper ignores them in prepare mode.
  const prepared = await runNativeCommand({ mode: "prepare", root, profile, command: "prepare", cwd: "", timeoutMs: 10000 }, lifecycle);
  if (prepared.status !== "exited" || prepared.exitCode !== 0 || !/^S-1-15-2(?:-\d+){7}$/.test(prepared.sid ?? "")) throw new Error("Native snapshot grant preparation failed");
  // The launch writes its own helper sources and request into the same owned root.
  for (const name of ["role-process.ps1", "RoleProcess.cs", "request.json"]) await rm(path.join(root, name));
  return { profile, sid: prepared.sid };
}
```

- 근거: `runNativeCommand`는 helper 소스와 `request.json`을 `request.root`에 `wx`로 씁니다(`:115-117`). 그래서 준비 실행이 남긴 세 파일을 지워야 같은 루트에서 다음 실행이 가능합니다.
- `prepare` 결과는 `runNativeCommand`의 응답 검증(`:157-158`)을 통과하도록 `status`·`exitCode`·`stdout`·`stderr`·`quiescent`·`outputTruncated`를 채웁니다(위 C# `Prepare`).

`verifyNativeRuntime` Before (`:169-171`, `:186-189`, `:195`):

```js
  let connections = 0, listener, acknowledged = false, helperStarted = false; const sockets = new Set();
  try {
    await mkdir(path.join(directory, "repo")); await mkdir(path.join(directory, "scratch"));
```

```js
    await writeFile(path.join(directory, "repo/probe.cjs"), probe);
    helperStarted = true;
    const result = await runNativeCommand({ root: directory, command: "node probe.cjs", cwd: "", timeoutMs: 10000 }, lifecycle);
    acknowledged = true;
```

```js
    if ((!helperStarted || acknowledged) && realpathSync(directory) === directory) await rm(directory, { recursive: true });
```

After:

```js
  let connections = 0, listener, unacknowledged = false; const sockets = new Set();
  try {
    unacknowledged = true; const prepared = await prepareNativeRoot(directory, lifecycle); unacknowledged = false;
```

```js
    await writeFile(path.join(directory, "repo/probe.cjs"), probe);
    unacknowledged = true;
    const result = await runNativeCommand({ root: directory, ...prepared, command: "node probe.cjs", cwd: "", timeoutMs: 10000 }, lifecycle);
    unacknowledged = false;
```

```js
    if (!unacknowledged && realpathSync(directory) === directory) await rm(directory, { recursive: true });
```

- 지켜야 할 것: 확인 응답(ack)을 받지 못한 도우미가 하나라도 있으면 소유 디렉터리를 보존하고, 모두 확인되면 삭제합니다. 지금의 `(!helperStarted || acknowledged)`와 같은 규칙을 도우미 두 번에 적용한 것입니다.

`execute` Before (`:202-228`, 전체):

```js
  async function execute(args, signal) {
    if (closed || !args || Array.isArray(args) || Object.keys(args).some(key => !["command", "cwd", "timeoutMs"].includes(key))
      || typeof args.command !== "string" || !args.command.trim() || args.command.length > 4096 || args.command.includes("\0")) throw new Error("Invalid native command");
    const cwd = args.cwd ?? "", timeoutMs = args.timeoutMs ?? 60000;
    if (typeof cwd !== "string" || path.isAbsolute(cwd) || /[<>:"|?*\x00-\x1f]/.test(cwd) || cwd.split(/[\\/]/).some(part => [".", ".."].includes(part) || /[. ]$/.test(part))
      || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new Error("Invalid native command bounds");
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    combined.throwIfAborted();
    const directory = await mkdtemp(path.join(realpathSync(tmpdir()), "harness-command-"));
    const own = randomUUID(); await writeFile(path.join(directory, "owner.json"), JSON.stringify({ own }), { flag: "wx" });
    let acknowledged = false, helperStarted = false;
    try {
      const snapshot = await snapshotRepository(root, path.join(directory, "repo"), fileBroker, combined);
      if (cwd && !lstatSync(fileBroker.resolveRead(path.resolve(root, cwd))).isDirectory()) throw new Error("Command workspace directory required");
      const scratchSnapshot = scratch ? await snapshotRepository(scratch, path.join(directory, "scratch"), fileBroker, combined) : null;
      if (!scratchSnapshot) await mkdir(path.join(directory, "scratch"));
      await copyRuntime(runtime, path.join(directory, "runtime"), combined);
      helperStarted = true;
      const result = await runNativeCommand({ root: directory, command: args.command, cwd: cwd.replaceAll("/", "\\"), timeoutMs }, { ...lifecycle, signal: combined });
      acknowledged = true;
      return { ...result, nonce: undefined, ...snapshot, repositorySnapshotHash: snapshot.snapshotHash, scratchSnapshot,
        snapshotHash: hash(JSON.stringify([snapshot.snapshotHash, scratchSnapshot?.snapshotHash ?? null])), snapshotWrites: "discarded", originalRepositoryWrites: false };
    } finally {
      // Failed acknowledgements preserve the owned directory for explicit recovery.
      if ((!helperStarted || acknowledged) && realpathSync(directory) === directory && JSON.parse(readFileSync(path.join(directory, "owner.json"), "utf8")).own === own) await rm(directory, { recursive: true });
    }
  }
```

After (Phase 0의 `timings` + Phase 1의 준비 순서):

```js
  async function execute(args, signal) {
    if (closed || !args || Array.isArray(args) || Object.keys(args).some(key => !["command", "cwd", "timeoutMs"].includes(key))
      || typeof args.command !== "string" || !args.command.trim() || args.command.length > 4096 || args.command.includes("\0")) throw new Error("Invalid native command");
    const cwd = args.cwd ?? "", timeoutMs = args.timeoutMs ?? 60000;
    if (typeof cwd !== "string" || path.isAbsolute(cwd) || /[<>:"|?*\x00-\x1f]/.test(cwd) || cwd.split(/[\\/]/).some(part => [".", ".."].includes(part) || /[. ]$/.test(part))
      || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new Error("Invalid native command bounds");
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    combined.throwIfAborted();
    const directory = await mkdtemp(path.join(realpathSync(tmpdir()), "harness-command-"));
    const own = randomUUID(); await writeFile(path.join(directory, "owner.json"), JSON.stringify({ own }), { flag: "wx" });
    // Numeric phase durations only; monotonic so every lap is non-negative.
    let unacknowledged = false, clock = performance.now(); const timings = {};
    const lap = name => { const now = performance.now(); timings[name] = Math.round(now - clock); clock = now; };
    try {
      unacknowledged = true;
      const prepared = await prepareNativeRoot(directory, { ...lifecycle, signal: combined });
      unacknowledged = false; lap("grantMs");
      const snapshot = await snapshotRepository(root, path.join(directory, "repo"), fileBroker, combined); lap("snapshotMs");
      if (cwd && !lstatSync(fileBroker.resolveRead(path.resolve(root, cwd))).isDirectory()) throw new Error("Command workspace directory required");
      const scratchSnapshot = scratch ? await snapshotRepository(scratch, path.join(directory, "scratch"), fileBroker, combined) : null; lap("scratchMs");
      await copyRuntime(runtime, path.join(directory, "runtime"), combined); lap("runtimeMs");
      unacknowledged = true;
      const result = await runNativeCommand({ root: directory, ...prepared, command: args.command, cwd: cwd.replaceAll("/", "\\"), timeoutMs }, { ...lifecycle, signal: combined });
      unacknowledged = false; lap("commandMs");
      return { ...result, nonce: undefined, sid: undefined, ...snapshot, repositorySnapshotHash: snapshot.snapshotHash, scratchSnapshot,
        snapshotHash: hash(JSON.stringify([snapshot.snapshotHash, scratchSnapshot?.snapshotHash ?? null])), snapshotWrites: "discarded", originalRepositoryWrites: false, timings };
    } finally {
      // Failed acknowledgements preserve the owned directory for explicit recovery.
      if (!unacknowledged && realpathSync(directory) === directory && JSON.parse(readFileSync(path.join(directory, "owner.json"), "utf8")).own === own) await rm(directory, { recursive: true });
    }
  }
```

- 지켜야 할 것: 스냅숏 해시, 누락 목록, `snapshotWrites`/`originalRepositoryWrites` 필드와 소유 디렉터리 정리 규칙은 그대로입니다.
- 결과에 `timings`가 더해지고, 도우미의 `sid`는 결과에서 지웁니다.
- `scratch`는 `prepareNativeRoot`가 만들기 때문에 `:217`의 `mkdir`는 없어집니다.

#### 문서 `docs/architecture/protocol.md`

- `:503-504` 다음에 문장을 추가합니다. "역할 SID 권한은 복사 전에 부여한다(helper `prepare`). 상속 권한은 빈 repository·scratch·runtime 루트에, root의 상속되지 않는 Traverse 권한은 복사 전 root에 둔다. 복사된 파일은 생성 시 상속한다. 채워진 트리에는 ACL을 쓰지 않는다."
- `:544-546` 다음에 문장을 추가합니다. "실행 helper는 새 profile을 만든 뒤 그 SID가 준비한 SID와 같은지, root와 세 루트에 준비한 규칙이 있는지 읽기만으로 확인하고 다르면 실행하지 않는다."
- `:554`의 "소유권 등록·active 확인 뒤에만 컴파일/실행" 규칙은 `prepare` 실행에도 그대로 적용된다고 명시합니다.

### Phase 2 — 경로 검사 비동기화와 전역 복사 대기열 (측정 게이트)

검사 내용, 순서, 횟수는 바꾸지 않습니다. `resolveTarget`의 검사 로직은 **하나만** 두고, 그 로직을 동기·비동기 두 방식으로 실행합니다. 스냅숏은 비동기 방식을 써서 이벤트 루프를 막지 않고, 디렉터리 경계에서 복사를 기다리지 않게 합니다.

#### `plugin/runtime/role-files.mjs`

Before (import `:2`, `resolveTarget` `:56-89`, 반환 객체 `:169`):

```js
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
```

```js
  function resolveTarget(name, write = false) {
    if (typeof name !== "string" || name.length > 4096 || !path.isAbsolute(name) || /[\x00-\x1f]/.test(name)) throw new Error("Absolute file path required");
    const target = path.resolve(name), parsed = path.parse(target);
    if (process.platform === "win32") {
      if (!/^[A-Za-z]:\\$/.test(parsed.root) || name.startsWith("\\\\")) throw new Error("Device and network paths refused");
      for (const part of name.slice(parsed.root.length).split(/[\\/]/)) {
        if (part === "." || part === ".." || /[<>:"|?*]/.test(part) || /[. ]$/.test(part)
          || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw new Error("Ambiguous Windows path refused");
      }
    }
    if (access(target) === "deny" || (write && access(target) !== "write")) throw new Error("File permission refused");
    // Resolve once through the OS, but always inspect every ancestor's alias/link
    // metadata: a canonical spelling alone is not a reparse-point authority check.
    // Differing spellings (including Windows short names) get the JS fallback.
    let nativeExact = false;
    try {
      nativeExact = canonical(realpathSync.native(target)) === canonical(target);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    let current = parsed.root, existing = parsed.root;
    for (const segment of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      try {
        const stat = lstatSync(current, { bigint: true });
        if (stat.isSymbolicLink()) throw new Error("File alias refused");
        if (stat.isFile() && stat.nlink !== 1n) throw new Error("Hard-linked file refused");
        existing = current;
      } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    // Resolve the complete existing chain once; resolving every prefix repeats
    // its ancestors for each dependency file. No path/permission result is cached:
    // callers recheck before and after IO, including aliases above the policy root.
    if (!nativeExact && canonical(realpathSync(existing)) !== canonical(existing)) throw new Error("File alias refused");
    return target;
  }
```

```js
    resolveRead(name) { if (closed) throw new Error("Role file broker closed"); return resolveTarget(name); },
```

After (바뀌는 import 줄, 모듈 수준 실행기, 생성기와 두 진입점):

```js
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, opendirSync, promises, readSync, realpath, realpathSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
```

```js
// One path policy, two drivers. Each yielded step is one filesystem call that the driver
// performs and returns, or throws back into the policy. Resolvers are looked up per call.
const syncStep = {
  native: target => realpathSync.native(target),
  lstat: target => lstatSync(target, { bigint: true }),
  realpath: target => realpathSync(target),
};
const realpathAsync = promisify(realpath);
const asyncStep = {
  native: target => promises.realpath(target),
  lstat: target => promises.lstat(target, { bigint: true }),
  realpath: target => realpathAsync(target),
};
function runSteps(steps) {
  let next = steps.next();
  while (!next.done) {
    const [kind, target] = next.value; let value, failed = false;
    try { value = syncStep[kind](target); } catch (error) { failed = true; value = error; }
    next = failed ? steps.throw(value) : steps.next(value);
  }
  return next.value;
}
async function runStepsAsync(steps) {
  let next = steps.next();
  while (!next.done) {
    const [kind, target] = next.value; let value, failed = false;
    try { value = await asyncStep[kind](target); } catch (error) { failed = true; value = error; }
    next = failed ? steps.throw(value) : steps.next(value);
  }
  return next.value;
}
```

```js
  function* resolveSteps(name, write) {
    if (typeof name !== "string" || name.length > 4096 || !path.isAbsolute(name) || /[\x00-\x1f]/.test(name)) throw new Error("Absolute file path required");
    const target = path.resolve(name), parsed = path.parse(target);
    if (process.platform === "win32") {
      if (!/^[A-Za-z]:\\$/.test(parsed.root) || name.startsWith("\\\\")) throw new Error("Device and network paths refused");
      for (const part of name.slice(parsed.root.length).split(/[\\/]/)) {
        if (part === "." || part === ".." || /[<>:"|?*]/.test(part) || /[. ]$/.test(part)
          || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw new Error("Ambiguous Windows path refused");
      }
    }
    if (access(target) === "deny" || (write && access(target) !== "write")) throw new Error("File permission refused");
    // Resolve once through the OS, but always inspect every ancestor's alias/link
    // metadata: a canonical spelling alone is not a reparse-point authority check.
    // Differing spellings (including Windows short names) get the JS fallback.
    let nativeExact = false;
    try {
      nativeExact = canonical(yield ["native", target]) === canonical(target);
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    let current = parsed.root, existing = parsed.root;
    for (const segment of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      try {
        const stat = yield ["lstat", current];
        if (stat.isSymbolicLink()) throw new Error("File alias refused");
        if (stat.isFile() && stat.nlink !== 1n) throw new Error("Hard-linked file refused");
        existing = current;
      } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    // Resolve the complete existing chain once; resolving every prefix repeats
    // its ancestors for each dependency file. No path/permission result is cached:
    // callers recheck before and after IO, including aliases above the policy root.
    if (!nativeExact && canonical(yield ["realpath", existing]) !== canonical(existing)) throw new Error("File alias refused");
    return target;
  }
  const resolveTarget = (name, write = false) => runSteps(resolveSteps(name, write));
```

```js
    resolveRead(name) { if (closed) throw new Error("Role file broker closed"); return resolveTarget(name); },
    // The same policy without blocking the event loop; used by the trusted snapshot exporter.
    async resolveReadAsync(name) { if (closed) throw new Error("Role file broker closed"); return runStepsAsync(resolveSteps(name, false)); },
```

- 지켜야 할 것: 동기 `resolveTarget`은 Before와 같은 순서·횟수의 시스템 호출을 하고 같은 오류를 던집니다.
  - `realpathSync.native`는 호출 시점에 찾으므로 `harness-role-files.test.mjs:64-71`의 바꿔 끼우기 시험도 그대로 성립합니다.
- 비동기 방식은 같은 생성기를 쓰므로 검사 내용이 같습니다.
  - native 해석은 `fs.promises.realpath`(native 의미)를, 표기가 다를 때의 대체 해석은 JS 구현 `fs.realpath`를 씁니다. 동기 쪽 `realpathSync.native`·`realpathSync`와 짝을 이룹니다.

#### `plugin/runtime/role-commands.mjs` — `snapshotRepository`

Before: 위 Current State의 `:33-88` 전체(`flush`로 디렉터리마다 기다리고, `resolveRead`/`lstatSync`를 동기로 부름).

After (import는 `node:fs/promises`에 `lstat` 추가):

```js
import { lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
```

```js
export async function snapshotRepository(root, destination, fileBroker, signal) {
  const hashes = [], omitted = []; let bytes = 0, count = 0, omittedCount = 0, failure = null;
  const free = Array.from({ length: 8 }, () => Buffer.alloc(1024 * 1024)), running = new Set();
  const started = Date.now();
  function checkpoint() {
    signal?.throwIfAborted();
    if (Date.now() - started > 300000) throw new Error("Snapshot preparation deadline exceeded");
  }
  async function copy({ source, target, before, row }, buffer) {
    const input = await open(source, "r"), digest = createHash("sha256"); let output;
    try {
      output = await open(target, "wx", 0o600);
      if (identity(await input.stat({ bigint: true })) !== identity(before)) throw new Error("Snapshot file changed while opening");
      let length = 0;
      while (true) {
        checkpoint();
        const { bytesRead } = await input.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
        if ((length += bytesRead) > Number(before.size)) throw new Error("Snapshot file grew while reading");
        digest.update(buffer.subarray(0, bytesRead));
        let offset = 0; while (offset < bytesRead) offset += (await output.write(buffer, offset, bytesRead - offset, null)).bytesWritten;
      }
      await fileBroker.resolveReadAsync(source); const after = await lstat(source, { bigint: true });
      if (length !== Number(before.size) || identity(after) !== identity(before) || after.mtimeNs !== before.mtimeNs || after.size !== before.size) throw new Error("Snapshot source changed during copy");
      row[1] = digest.digest("hex");
    } finally { await input.close(); await output?.close(); }
  }
  async function schedule(task) {
    // At most 8 copies are in flight across directories; each owns one buffer. A copy
    // never rejects here: its first failure is kept and raised by the traversal.
    while (!free.length) await Promise.race(running);
    if (failure) throw failure;
    const buffer = free.pop();
    const job = copy(task, buffer).catch(error => { failure ??= error; }).finally(() => { running.delete(job); free.push(buffer); });
    running.add(job);
  }
  async function visit(directory, relative = "") {
    checkpoint();
    await fileBroker.resolveReadAsync(directory);
    const entries = (await readdir(directory)).sort();
    for (const name of entries) {
      checkpoint();
      if (failure) throw failure;
      const source = path.join(directory, name), rel = path.join(relative, name), target = path.join(destination, rel);
      if (omittedName(name) || fileBroker.permission(source) === "deny") { omittedCount++; if (omitted.length < 200) omitted.push(rel); continue; }
      await fileBroker.resolveReadAsync(source);
      const before = await lstat(source, { bigint: true });
      if (before.isDirectory()) { await mkdir(target, { recursive: true }); await visit(source, rel); continue; }
      if (!before.isFile() || before.size > 128n * 1024n * 1024n || ++count > 100000 || (bytes += Number(before.size)) > 2 * 1024 * 1024 * 1024) throw new Error("Snapshot size or file type unsupported");
      const row = [rel.split(path.sep).join("/"), null]; hashes.push(row);
      await schedule({ source, target, before, row });
    }
  }
  await mkdir(destination, { recursive: true });
  // Join every in-flight copy before propagating an error or deleting the owned destination.
  try { await visit(root); } finally { await Promise.all(running); }
  if (failure) throw failure;
  return { snapshotHash: hash(JSON.stringify(hashes)), files: count, bytes, omitted, omittedCount, omissionsTruncated: omittedCount > omitted.length };
}
```

- 지켜야 할 것: 같은 원본에서 같은 `snapshotHash`가 나옵니다. 행 순서가 발견 순서(정렬된 깊이 우선)이기 때문입니다.
  - 파일마다 IO 전후 경로·identity·mtime·size 검사와 상한·마감·취소는 Before와 같습니다.
  - 오류를 전파하거나 삭제하기 전에 진행 중인 복사를 모두 기다리는 것도 같습니다(`protocol.md:502-503`).
- 달라지는 점
  - 복사가 디렉터리 경계를 넘어 최대 8개까지 계속 돕니다.
  - 상위 디렉터리 파일이 다 끝나기 전에 하위 디렉터리 파일 복사가 시작될 수 있습니다(해시 순서와는 무관).
- 채택 게이트: 성공 기준의 Phase 2 게이트(같은 날 번갈아 잰 5회씩의 중앙값에서 `snapshotMs` 20% 이상 단축)를 넘어야 병합합니다. 못 미치면 이 Phase는 닫습니다.
  - 로컬 예비 검증에서는 오히려 느려질 수 있다는 신호가 있었습니다(Current State).
  - 게이트를 통과하지 못하면 Phase 0·1만으로 마무리합니다.

### Phase 3 (선택) — 스냅숏 삭제를 결과 뒤로

`execute`의 `finally`는 `rm`을 기다리지 않고, 정리 작업을 브로커 단위 집합에 넣습니다. `close()`는 그 정리가 모두 끝나기를 기다리고, 정리 실패가 있으면 그때 던집니다.

After (`createRoleCommands` 안. `execute`의 `finally`와 `close`만):

```js
  let closed = false, pending = null, cleanupFailure = null; const controller = new AbortController(), cleanups = new Set();
```

```js
    } finally {
      // Failed acknowledgements preserve the owned directory for explicit recovery. A verified
      // owned root is deleted after the result returns; close() joins the deletion.
      if (!unacknowledged && realpathSync(directory) === directory && JSON.parse(readFileSync(path.join(directory, "owner.json"), "utf8")).own === own) {
        const task = rm(directory, { recursive: true }).catch(error => { cleanupFailure ??= error; }).finally(() => cleanups.delete(task));
        cleanups.add(task);
      }
    }
```

```js
    async close() { closed = true; controller.abort(); try { await pending; await Promise.all(cleanups); if (cleanupFailure) throw cleanupFailure; } finally { fileBroker.close(); } },
```

- 지켜야 할 것: 삭제 대상과 소유 확인은 Before와 같습니다.
- 달라지는 점
  - 삭제 실패가 명령 결과 대신 `close()`에서 드러납니다.
  - 역할 실행이 끝날 때 `close()`는 `codex-thread.mjs:400`의 `bridge.close()` → `:148` → `role-git.mjs:305`를 거쳐 불립니다. 그래서 삭제 실패는 **이미 성공한 역할 실행을 오류로 끝나게** 합니다. 지금은 해당 명령 하나가 실패합니다.
  - 다음 명령의 복사와 이전 명령의 삭제가 겹칠 수 있습니다.
- 이 세 가지를 받아들일지가 Open Question입니다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `plugin/runtime/windows/RoleProcess.cs` | update | `Result` 필드, `DeriveAppContainerSidFromAppContainerName`, `RootRights`·`SnapshotRoots`·`ProfileName`·`RequireGrant`·`Prepare`, `Run` 시그니처와 부여 확인(채워진 트리에 ACL 쓰기 없음) | high: 신뢰된 launcher. 실패 분기를 새로 추가 |
| `plugin/runtime/windows/role-process.ps1` | update | `mode` 분기 | medium: helper 진입점 |
| `plugin/runtime/role-commands.mjs` | update | `prepareNativeRoot`(새 export), `copyRuntime` 디렉터리, `verifyNativeRuntime`·`execute` 순서와 `timings`, (Phase 2) `snapshotRepository`, (Phase 3) 정리 | medium |
| `plugin/runtime/role-files.mjs` | update | 검사 생성기와 동기·비동기 실행기, `resolveReadAsync` | medium: 보안 검사 코드. 단일 구현으로 차이를 막음 |
| `plugin/bin/harness-role-commands.test.mjs` | update | `nativeFixture`(`:68-73`)가 `prepareNativeRoot` 뒤 파일 작성, 직접 `runNativeCommand` 호출(`:81`~`:165`)에 `...prepared` 전달, 새 시험 | low |
| `plugin/bin/harness-role-files.test.mjs` | update | 비동기 동치 시험 | low |
| `scripts/windows-role-readlink.test.mjs` | update | `:17`의 세 하위 디렉터리 `mkdirSync`를 `mkdirSync(directory, { recursive: true }); const prepared = await prepareNativeRoot(directory);`로 바꿈(`prepareNativeRoot`는 루트가 있어야 하고 하위 디렉터리를 직접 만듦), `:53` 호출에 `...prepared` | low |
| `scripts/windows-role-spawn-diagnostics.test.mjs` | update | `:17`, `:55` 같은 변경 | low |
| `docs/architecture/protocol.md` | update | `:503-504`, `:544-546`, `:554` 보강 | low |
| `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | update | 런타임 변경이 설치본에 전달되도록 Phase마다 버전 상승 | low |
| `plugin/runtime/codex-thread.mjs` | keep | `createRoleCommands`·`verifyNativeRuntime` 호출(`:324-325`)의 시그니처가 그대로 | none |
| `plugin/runtime/role-git.mjs` | keep | 동기 `resolveRead`(`:212`, `:261`, `:263`, `:286-287`) 그대로 | none |

소비처 영향: `runNativeCommand`·`verifyNativeRuntime`·`resolveRead`·`permission`의 사용처는 `rg`로 찾은 위 목록이 전부입니다(2026-10-07 `dev` `1dce256`). 문자열로 경로를 다루는 패키징 스크립트 같은 동적 참조는 따로 전수하지 않았습니다(Open Questions).

## Safety Analysis

Phase 1의 선부여가 계약을 유지하는 이유:

- **부여 범위가 같습니다.** 대상은 소유 루트의 `repo`·`scratch`·`runtime`과 root의 Traverse 계열 권한뿐이고, 원본 저장소 ACL은 건드리지 않습니다(`protocol.md:545-546`).
- **전파가 사라집니다.**
  - 상속 규칙은 비어 있는 세 루트에만 붙입니다(`prepare-empty`로 강제).
  - 상속되지 않는 root 규칙도 복사 전에 붙입니다. 그 시점 root 아래에는 `owner.json`, helper 파일, 빈 세 루트뿐입니다.
  - `Run`은 채워진 트리에서 읽기만 합니다(`RequireGrant`). 쓰기는 새로 만든 빈 `boundary`와 canary 파일에만 있습니다(`RoleProcess.cs:155-163`).
  - "명령이 끝난 트리에 ACL 변경을 전파하지 않는다"(`protocol.md:560-561`)보다 강한 성질입니다.
- **명령별 새 profile은 그대로입니다.** profile 생성·삭제는 여전히 `Run`이 하고(`RoleProcess.cs:147-149`, `:258-259`), `prepare`는 SID만 파생합니다. profile, 토큰, 프로세스는 만들지 않습니다.
- **SID가 다르면 실행하지 않습니다.** 준비한 SID와 `Run`이 만든 profile의 SID가 다르거나 규칙이 없으면 자식 프로세스를 만들기 전에 실패합니다.
- **복사 중 그 SID를 가진 프로세스가 없습니다.** 규칙이 붙은 뒤 복사가 끝날 때까지 그 SID로 실행되는 프로세스는 없습니다. profile 이름은 무작위 128비트이고, 그 이름을 담은 `request.json`은 소유 루트에 있습니다. LPAC는 root에 Traverse만 있어 이 파일을 읽을 수 없습니다(`RoleProcess.cs:151`). 같은 사용자 권한의 프로세스는 이미 원본에 접근할 수 있으므로 새 위협이 아닙니다.
- **등록과 활성화를 똑같이 거칩니다.** `prepare`도 `runNativeCommand`를 통하므로 소유권 등록(`onSpawn`), 활성 확인(`beforeActivate`), 정리(`onSettled`)를 실행 때와 똑같이 거칩니다(`role-commands.mjs:139-163`, `protocol.md:554`).

Phase 2의 비동기 검사가 계약을 유지하는 이유:

- 검사 로직은 생성기 하나뿐입니다. 동기·비동기 실행기는 같은 순서로 같은 시스템 호출을 하고 같은 오류를 던집니다.
- 경로·권한 결과를 캐시하지 않습니다. 파일마다 IO 전후 검사가 그대로 있습니다(`protocol.md:503-504`).
- 동시에 도는 것은 서로 다른 파일의 검사와 복사입니다. 한 파일 안의 "검사 → IO → 재검사" 순서는 그대로입니다.

확인한 항목:

- [x] 테스트와 스크립트 참조 — `runNativeCommand` 직접 호출 시험 3개 파일, `verifyNativeRuntime`·`createRoleCommands` 런타임 호출(`rg`).
- [x] 런타임 side effect 또는 초기화 코드 — helper 실행 모드, ACL 부여 순서, 브로커 `close()`(Phase 3).
- [ ] 동적 참조 — 문자열 경로·패키징 스크립트는 전수하지 않음(Open Questions).

## Approval

승인 메모:

- 2026-10-07 Phase 0만 승인했습니다. Phase 1 이후는 Phase 0 기준선과 수치 목표를 이 문서에 기록한 뒤 따로 승인합니다.
- 2026-10-07 Phase 0 구현(#130)이 머지됐고 기준선과 수치 목표를 기록했습니다.
- 2026-10-07 Phase 1을 승인했습니다. Phase 2·3은 승인 전입니다.

## Execution Plan

1. **Phase 0 — 기록**
   - 작업: `execute`의 `timings`, `RoleProcess.cs` `Result.aclMs`, `Run`의 `snapshot-acl` 측정. 플러그인 버전 상승.
   - 검증: `npm test`, 새 시간 필드 시험, `windows-role-runtime` CI 리허설 출력.
   - 기준선: 완료(#130, Current State "Phase 0 기준선").
2. **Phase 1 — 선부여**
   - 작업: `prepare` 모드, `Run` 확인, `prepareNativeRoot`, 호출부 3곳과 시험 fixture, `protocol.md`. 플러그인 버전 상승.
   - 검증: 기존 native 시험 전체, 새 선부여 시험, CI 리허설에서 `aclMs`(Run)와 `grantMs`를 Phase 0과 비교.
3. **Phase 2 — 비동기 검사 (게이트)**
   - 작업: `role-files.mjs` 생성기, `resolveReadAsync`, `snapshotRepository` 전역 대기열.
   - 검증: 동치 시험, 결정성 시험(`harness-role-commands.test.mjs:51-59`), 리허설 `snapshotMs` 비교. 게이트 미달이면 이 Phase만 닫습니다.
4. **Phase 3 — 정리 지연 (선택)**
   - Open Question이 결정된 뒤에만 진행합니다.
   - 검증: 정리 합류 시험, `close()` 실패 노출.

각 Phase는 따로 PR로 만들고 `dev`에서 `windows-role-runtime`이 녹색인지 확인한 뒤 다음으로 넘어갑니다.

## Verification Plan

실행할 검증:

```bash
npm run check
npm test
```

```powershell
$env:STAGEKEEPER_TEST_WINDOWS_RUNTIME = "<verified runtime>"
node --test plugin/bin/harness-role-commands.test.mjs plugin/bin/harness-role-files.test.mjs plugin/bin/harness-role-git.test.mjs
node --test scripts/windows-role-readlink.test.mjs
node --test scripts/windows-role-spawn-diagnostics.test.mjs
node scripts/rehearse-windows-project-build.mjs --root . --runtime "<verified runtime>"
```

- `npm test`는 `package.json`의 `node --test "packages/core/*.test.mjs" "plugin/bin/*.test.mjs"`라 실패하면 종료 코드가 0이 아닙니다.
- Windows native 시험은 `windows-role-runtime` 워크플로가 위와 같은 명령으로 돌리고, 실패하면 `throw`합니다.

기존 시험이 지키는 것:

- 별칭·하드링크·native 표기 바꿔 끼우기 거부: `harness-role-files.test.mjs:49-78`.
- 스냅숏 내용·별칭·취소·결정성: `harness-role-commands.test.mjs:32-59`.
- LPAC 읽기 허용/외부 거부/scratch 쓰기: `:78-89`. 선부여 상속이 실제로 동작하는지 이 시험이 확인합니다.
- 정션과 원본 ACL 불변: `:102-120`.
- 정지·소유권: `:122-173`.
- 사전 점검과 실제 npm test/build: `:183-198`.

새 시험 1 — 비동기 검사 동치(Phase 2). `plugin/bin/harness-role-files.test.mjs`에 넣고 `:49-78`과 같은 fixture를 씁니다. 문서 적용본에서 `promises.realpath`를 바꿔 끼우면 `resolveReadAsync`가 그 함수를 호출하는 것을 확인했습니다(호출 1회). 허용된 경로의 반환값은 `path.resolve(입력)`과 같아야 하는데, 이는 `role-files.mjs:58`(`const target = path.resolve(name)`)과 `:88`(`return target`)로 정해진 항등 관계입니다(계산 없음).

```js
// import에 promises 추가: import { linkSync, mkdirSync, mkdtempSync, promises, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
it("resolves asynchronously with exactly the synchronous path policy", async () => {
  const f = fixture(), hard = path.join(f.root, "src/hard.txt"), alias = path.join(f.root, "src/alias");
  linkSync(path.join(f.base, "outside.txt"), hard);
  symlinkSync(f.base, alias, process.platform === "win32" ? "junction" : "dir");
  const refused = [hard, path.join(alias, "outside.txt"), path.join(f.root, "other/hidden.txt"), path.join(f.base, "outside.txt")];
  if (process.platform === "win32") for (const name of ["code.ts:secret", "CON.txt", "trailing.", "space "]) refused.push(f.root + "\\src\\" + name);
  for (const target of refused) {
    assert.throws(() => f.files.resolveRead(target));
    await assert.rejects(f.files.resolveReadAsync(target));
  }
  for (const target of [path.join(f.root, "src/code.ts"), path.join(f.root, "src")]) {
    assert.equal(f.files.resolveRead(target), path.resolve(target));
    assert.equal(await f.files.resolveReadAsync(target), path.resolve(target));
  }
  const aliasedPolicy = createRoleFiles({ ":root": "deny", [alias]: "write" }, "web-dev"), nativeResolver = promises.realpath;
  try {
    // Mirrors the synchronous case: a preserved OS spelling must not skip ancestor metadata.
    promises.realpath = async target => target;
    await assert.rejects(aliasedPolicy.resolveReadAsync(path.join(alias, "outside.txt")));
  } finally { promises.realpath = nativeResolver; }
  f.files.close(); await assert.rejects(f.files.resolveReadAsync(path.join(f.root, "src/code.ts")));
});
```

새 시험 2 — 선부여 SID·권한 불일치 시 실패(Phase 1). `plugin/bin/harness-role-commands.test.mjs`에 넣습니다. `native` 조건(`:76`)과 `fixture`(`:15-30`)를 씁니다. 기대값은 이 설계가 정한 고정 단계 이름입니다(계산 없음).

```js
// import에 prepareNativeRoot 추가: import { snapshotRepository, runNativeCommand, prepareNativeRoot, createRoleCommands, installedWindowsRuntime, verifyNativeRuntime } from "../runtime/role-commands.mjs";
it("grants the role SID only on empty roots and refuses a launch whose prepared SID, grants or profile differ", native, async t => {
  const f = fixture(t), named = name => path.join(f.base, name);
  const [mismatched, accepted, populated, unprepared, invalid] = ["mismatched", "accepted", "populated", "unprepared", "invalid"].map(named);
  for (const directory of [mismatched, accepted]) await mkdir(directory);
  const first = await prepareNativeRoot(mismatched), second = await prepareNativeRoot(accepted);
  assert.match(first.sid, /^S-1-15-2(?:-\d+){7}$/); assert.notEqual(first.sid, second.sid);
  for (const directory of [mismatched, accepted]) writeFileSync(path.join(directory, "repo/read.txt"), "READ_CANARY");
  await assert.rejects(runNativeCommand({ root: mismatched, ...first, sid: second.sid, command: "type read.txt", cwd: "", timeoutMs: 2000 }), /profile-sid/);
  const result = await runNativeCommand({ root: accepted, ...second, command: "type read.txt", cwd: "", timeoutMs: 2000 });
  assert.equal(result.stdout, "READ_CANARY");
  // Each helper launch writes its sources into its root with "wx", so every refusal uses its own root.
  for (const directory of [populated, unprepared, invalid]) for (const name of ["repo", "scratch", "runtime"]) await mkdir(path.join(directory, name), { recursive: true });
  writeFileSync(path.join(populated, "repo/early.txt"), "EARLY");
  await assert.rejects(runNativeCommand({ mode: "prepare", root: populated, profile: first.profile, command: "prepare", cwd: "", timeoutMs: 10000 }), /prepare-empty/);
  await assert.rejects(runNativeCommand({ root: unprepared, ...first, command: "type read.txt", cwd: "", timeoutMs: 2000 }), /snapshot-acl/);
  await assert.rejects(runNativeCommand({ root: invalid, profile: "stagekeeper.role.invalid", sid: first.sid, command: "type read.txt", cwd: "", timeoutMs: 2000 }), /validation-profile/);
});
```

새 시험 2-1 — 전역 복사 대기열의 실패 전파(Phase 2). `harness-role-commands.test.mjs`의 `:51-59`와 같은 비-native 시험입니다. 복사 뒤 재검사(두 번째 `resolveReadAsync`)를 실패시키고, 그 오류가 그대로 올라오는지 봅니다. 기대값은 시험이 넣은 오류 문자열입니다(계산 없음).

```js
it("raises a copy failure from the global queue after joining in-flight copies", async t => {
  const f = fixture(t), failing = path.join(f.root, "src/data-7.bin"); let checks = 0;
  for (let index = 0; index < 20; index++) writeFileSync(path.join(f.root, `src/data-${index}.bin`), Buffer.alloc(65536, index));
  const broker = { ...f.files, async resolveReadAsync(name) {
    if (name === failing && ++checks === 2) throw new Error("FAILING_AFTER_COPY");
    return f.files.resolveReadAsync(name);
  } };
  await assert.rejects(snapshotRepository(f.root, f.destination, broker), /FAILING_AFTER_COPY/);
});
```

새 시험 3 — 단계별 시간 필드(Phase 0). `harness-role-commands.test.mjs:183-198` 시험의 `first` 결과에 단언을 더합니다. Phase 0에서는 목록에서 `grantMs`를 빼고, Phase 1에서 넣습니다. 값은 실행 환경에 따라 달라지므로 계약에서 나오는 성질만 확인합니다. `performance.now()`는 단조 증가해 차이가 음수일 수 없고, `Stopwatch.ElapsedMilliseconds`는 0 이상의 `long`입니다.

```js
    for (const name of ["grantMs", "snapshotMs", "scratchMs", "runtimeMs", "commandMs"]) assert.ok(Number.isInteger(first.timings[name]) && first.timings[name] >= 0, name);
    assert.ok(Number.isInteger(first.aclMs) && first.aclMs >= 0);
```

새 시험 4 — 정리 지연 합류(Phase 3). 진행 여부가 미정이라 자리만 둡니다.

```js
it.todo("returns before deleting the owned snapshot and joins the deletion in close()");
```

검증 기준:

- 위 명령이 모두 통과합니다. Windows native 시험은 `windows-role-runtime` CI에서 통과합니다.
- Phase마다 CI 리허설 출력의 `timings`·`aclMs`를 기록하고 Phase 0 기준선과 비교합니다.
- 기존 실패와 새 실패는 `dev` 기준 실행(같은 러너 이미지)과 비교해 구분합니다. 러너 이미지 버전은 Set up job 로그에서 확인합니다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | Pass (Phase 0) | 로컬 worktree |
| `npm test` | Pass (Phase 0) | 333 pass, 2 skip(런타임 필요 시험, 아래 native 실행에서 통과) |
| Phase 0 native 시험 (로컬, CI 런타임 `033f9ac…`) | Pass | `harness-role-commands`·`harness-role-files`·`harness-role-git` 30/30, readlink·spawn 2/2. `timings`를 빼면 새 단언이 실패하고, `aclMs` 대입만 빼면 기본값 0으로 통과합니다(값 확인은 CI 리허설 출력으로) |
| `npm run check` | Pass (Phase 1) | 로컬 worktree |
| `npm test` | Pass (Phase 1) | 334 pass, 2 skip(런타임 필요 시험, 아래 native 실행에서 통과) |
| Phase 1 native 시험 (로컬, CI 런타임 `033f9ac…`) | Pass | `harness-role-commands`·`harness-role-files`·`harness-role-git`·readlink·spawn 37/37(새 시험 2 포함) |
| Phase 1 변형 확인 (로컬) | Pass | `RequireGrant` 무력화, `profile-sid` 검사 제거, `prepare-empty` 검사 제거는 새 시험 2가 "거부 누락"으로 실패합니다. repo 권한을 상속 안 되게 바꾸면 `Run`이 `snapshot-acl`에서 실행을 거부합니다 |
| `windows-role-runtime` (CI) | Pass (Phase 0) | PR #130 1회, `dev` `c8e81c1` 3회. 값은 Current State "Phase 0 기준선" |
| 문서 적용본 로컬 검증 (설계 검증용, 구현 아님) | Pass | `harness-role-files` 10/10, `harness-role-commands` 14/14(런타임 포함), readlink 1/1, spawn 1/1, 리허설 exit 0. 세부는 Current State |

## Risks and Rollback

잔여 리스크:

- **Phase 1**
  - SID 파생, 상속, `RequireGrant` 판정이 예상과 다르면 모든 역할 명령이 실패합니다(안전한 쪽으로 실패하지만 기능은 막힘). native 시험과 CI 리허설에서 먼저 드러납니다.
  - 도우미가 명령마다 한 번 더 떠서 수백 ms가 늘어납니다.
- **Phase 2**
  - 비동기 I/O 경합(libuv 스레드풀) 때문에 이득이 없을 수 있습니다. 게이트로 거릅니다.
  - 생성기 기반 실행기의 오류 전달이 Before와 다르면 보안 검사가 달라집니다. 동치 시험과 기존 시험으로 확인합니다.
- **Phase 3**
  - 정리 실패가 늦게 드러납니다.
  - 프로세스가 비정상 종료하면 TEMP에 스냅숏이 남을 수 있습니다.
  - 복사와 삭제가 겹쳐 디스크 사용량이 일시적으로 커집니다.
- CI 측정 편차가 큽니다(같은 조건에서 스냅숏 67.6초 vs 89.0초). 표본을 3회 이상 씁니다.

롤백 방법:

- Phase별 PR을 되돌리고 플러그인 버전을 **다시 올립니다**. 설치본은 버전 비교로 갱신되므로 롤백도 버전 상승이 필요합니다.
- Phase 1을 되돌리면 `Run`이 다시 profile 이름을 만들고 복사 뒤 상속 규칙을 붙입니다. 시험 fixture도 함께 되돌립니다.

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

- [ ] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [ ] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [ ] 문서 위치와 `status`가 일치한다. `active/`는 `pending`, `completed/`는 `completed` 또는 `closed`다.
- [ ] `stage`는 pending 문서에서만 사용했고, `completed` 또는 `closed` 문서에서는 `stage: null`로 갱신했다.
- [ ] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [ ] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [ ] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [ ] 변경 범위와 제외 범위가 명확하다.
- [ ] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [ ] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다.
- [ ] 검증 명령과 성공 기준이 적혀 있다.
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다.
- [ ] 잔여 리스크를 명시했다. 없으면 "없음"이라고 적었다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.

---

<!-- doc-validation-skip -->
## Open Questions

- **[Phase 3]** 진행 여부를 정해야 합니다. 받아들일지 정할 것은 세 가지입니다.
  - 정리 실패가 명령 결과가 아니라 `close()`에서 드러나는 것.
  - 그 결과 이미 성공한 역할 실행이 오류로 끝날 수 있는 것.
  - 다음 명령의 복사와 이전 명령의 삭제가 겹치는 것.
- **[Phase 1 실패 분기]** `validation-profile`·`profile-sid`·`RequireGrant`·`prepare-empty`·`prepare-sid`는 이 설계에서 새로 생기는 실패 분기입니다.
  - 정상 경로가 막히지 않는 것은 문서 적용본의 기존·새 native 시험 통과로 확인했습니다.
  - 남은 것은 신뢰된 launcher 변경에 대한 사람의 보안 검토입니다.
- **[소비처 영향]** 문자열 경로를 쓰는 패키징·배포 스크립트 같은 동적 참조는 전수하지 않았습니다. `scripts/package-windows-plugin.mjs`는 두 helper 파일명의 존재만 확인하며, 파일명은 바뀌지 않습니다.

<!-- doc-validation-restore -->
