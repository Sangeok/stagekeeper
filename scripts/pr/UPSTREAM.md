# Process usage qualification sources

이 디렉터리는 Phase QUALIFY의 읽기 전용 후보 구현이다. worktree/branch 삭제, PR 병합, 제품 런타임 연결은 하지 않는다. OpenClaw 설치·Bash·sh·외부 binary 다운로드가 필요하지 않다.

## Runtime과 후보 평가 경계

조건부 방향 채택 이후 `process-usage.mjs:inspectWorktreeUsage`는 운영용 결과 경계,
`process-usage-probe.mjs:probeWorktreeUsage`는 실제 native 후보 평가다.
입력과 초기 결과는 `process-usage-contract.mjs`가 공유한다.
등록된 runtime profile은 Darwin 25.2.0 / arm64 / Node v26.4.0, real/effective UID가 같은 non-root 사용자 하나의 profile이다.
7a6b804의 실제 후보 시험 17건과 conditional-macos-final.json에 근거한다.
backend의 lsof 4.91/libproc/current-UID 결과도 호출 때 재검증한다. runtime 진입점
busy 대조는 conditional-runtime-local.json에 기록한다. 다른 OS/build/CPU/Node와
Windows는 unqualified/unknown/관측 미실행이다. caller flag로 범위를 넓힐 수 없다.
이는 삭제 실행 활성화가 아니며 controller는 아직 없다.

profile은 현재 UID·non-zombie cwd·한 관측 구간으로 제한한다. 다른 계정·특권·원격
host·cwd 밖의 파일 사용과 외부 writer 차단은 미인증이다. caret 이름은 unknown이다.
실제 권한 거부는 fixture observer에만 임시 sandbox 제한을 적용해 확인했으며
모든 권한 조합의 가시성 인증으로 확대하지 않는다.

공통/실제 native/Windows 반례 시험을 분리했다. `STAGEKEEPER_USAGE_QUALIFICATION=all`
로 `node --test scripts/pr/process-usage-qualification.test.mjs`를 실행하면 기존
Windows 정상 대조군도 계속 평가한다. 현재 Windows 실패가 사라진 것은 아니다.
`macos` 모드는 macOS 후보 자격 시험의 선택이며 runtime capability를 켜지 않는다.

## Gate A: 실제 후보 관측 profile

- 공통 의미: 호출한 계정에 속한 모든 세션의 non-zombie 프로세스 cwd 관측. target 및 하위 cwd holder를 판정한다.
- 다른 계정·특권 세션·원격 host·cwd 밖의 파일 handle 사용은 인증하지 않는다. 이 결과는 자료 삭제 권한이 아니며 후속 controller는 소유자 종료 선언과 사용 범위가 이 profile에 맞는지 별도로 확인해야 한다.
- 같은 사용자라는 이유만으로 완전하다고 하지 않는다. 독립적인 전후 inventory, PID/start identity, 각 필수 cwd record 및 진단을 대조한다. 누락·변경·권한 불가·모호한 encoding은 unknown이다.
- 이 profile을 전체 host 사용 종료 보장으로 확대하지 않는다. 적용 대상이 다른 계정을 포함하면 후속 운영 채택은 보류한다.

## macOS

OpenClaw c7ccc5e8bc96d9ba1dc2463145ebd33338813d02의 scripts/pr-lib/common.sh에 있는 lsof 사용 구조를 참고했다. source를 복사·실행하지 않았다.

- /bin/ps의 uid/pid/state/start identity inventory와 /usr/sbin/lsof의 p/f/n NUL protocol을 대조한다.
- lsof -v에 표시된 version/libproc configuration을 기록한다. 사용자 cache 기능을 도입하지 않는다.
- fixture 프로토콜 확인: 4.91에서 UTF-8, backslash 및 C escape를 관측했다. caret 표기는 literal과 control 표현이 모호하므로 해당 record는 unknown으로 처리한다.
- macOS cwd는 Apple libproc dproc.c의 PROC_PIDVNODEPATHINFO/pvi_cdir.vip_path에서 나온 vnode 경로다. 이미 소멸한 무관한 cwd의 pathname을 다시 stat하지 않는다. target identity는 관측 전후 실제 filesystem identity로 검사한다.
- OS/도구 실패를 빈 목록으로 해석하지 않는다.

## Windows 후보

- PowerShell Core 7 이상이 이미 존재하는 환경만 후보로 사용한다. Windows PowerShell 5의 out-of-process CodeDOM compilation을 사용하지 않는다. Core Add-Type은 Roslyn을 사용해 메모리 내 assembly를 만든다.
- 추가 설치·권한 상승·SeDebugPrivilege 활성화 없음. Core 또는 x64 layout 조건이 없으면 unknown.
- process token SID로 같은 계정을 식별한다. 소유자를 읽지 못한 process는 전체 관측을 불완전하게 만든다.
- Microsoft의 PROCESS_BASIC_INFORMATION/PEB와 제한된 RTL_USER_PROCESS_PARAMETERS prefix를 읽는다. command line·env·memory dump를 수집하지 않는다.
- prefix의 구조 근거: winsiderss/phnt revision 53fbbdc5b5d2b08761db1c7b26bfa8c820924356, ntrtl.h의 RTL_USER_PROCESS_PARAMETERS. MIT 고지를 platform/PHNT-LICENSE에 보존한다.
- Kernel PID 0/4는 user-mode process parameter가 없는 OS kernel 항목으로 제외한다. 그 밖의 process를 이름이나 테스트 PID 목록으로 제외하지 않는다.
- same-account 32-bit/WOW64, 미검증 layout, 접근 실패, 전후 process identity 변경은 unknown이다. 양 OS native 시험 전 Windows 자격 통과를 주장하지 않는다.

References:
- https://github.com/openclaw/openclaw/blob/c7ccc5e8bc96d9ba1dc2463145ebd33338813d02/scripts/pr-lib/common.sh
- https://github.com/apple-oss-distributions/lsof/blob/main/lsof/lsof.man
- https://github.com/apple-oss-distributions/lsof/blob/main/lsof/dialects/darwin/libproc/dproc.c
- https://learn.microsoft.com/en-us/windows/win32/api/winternl/ns-winternl-peb
- https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntqueryinformationprocess
- https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-readprocessmemory
- https://github.com/winsiderss/phnt/blob/53fbbdc5b5d2b08761db1c7b26bfa8c820924356/ntrtl.h
- https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/add-type

## Qualification decision

### Windows Q3 대안 실험

`testing/windows-directory-probe.cs`와 `windows-directory-usage.test.mjs`는 운영 adapter에
연결하지 않은 Windows 20348/x64 전용 실험이다. 기존 PEB 후보의 실패를 성공으로
바꾸거나 대체 관측으로 합성하지 않는다.

- `CreateFileW`의 DELETE access, share read/write/delete, OPEN_EXISTING,
  BACKUP_SEMANTICS 및 OPEN_REPARSE_POINT로 시험 소유 directory를 열고 바로 닫는다.
  삭제·rename·disposition 변경 API는 호출하지 않는다. 접근 거부와 sharing violation을
  구분한다. 하위 경로의 사용을 root 한 번의 open으로 알 수 있다고 가정하지 않는다.
- DELETE access를 가진 열린 handle은 새 사용자의 open과 충돌할 수 있다.
  해당 handle을 handshake 동안 유지하는 실험은 시험이 만든 directory에만 수행하며
  15초 자체 deadline을 둔다. 새 cwd 프로세스 시작의 실패·해제 후 성공을 따로 기록한다.
- `NtQueryInformationFile(FileProcessIdsUsingFileInformation=47)` 후보도 비교한다.
  Microsoft는 이 class를 system use로 예약한다. 공개 안정 ABI로 표현하지 않는다.
  구조는 기존 PHNT-LICENSE와 같은 고정 revision의 `ntioapi.h`에 근거한다.
  성공 반환 자체나 fixture PID 포함 여부는 전체 coverage의 증명이 아니다.
- 관측 대상은 fixture directory다. oracle PID를 native helper에 넘기지 않으며,
  외부 process 메모리·command line·env를 읽지 않는다. raw PID 목록은 시험 메모리에서
  대조하고 공개 evidence에는 건수·oracle 포함 여부·고정 오류 코드만 남긴다.
- 일반 directory handle과 cwd를 구별하지 못하거나 새 cwd 시작을 막는 경우,
  현재 cwd/PID 계약과 동일한 backend로 채택하지 않는다. 현재 production schema와
  상위 SDD를 이 실험만으로 변경하지 않는다.

Primary references:
- [SetCurrentDirectory의 cwd 잠금](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-setcurrentdirectory)
- [CreateFileW의 access/share 계약](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)
- [FILE_INFORMATION_CLASS의 system-use 예약](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/ne-wdm-_file_information_class)
- [고정 phnt ntioapi.h](https://github.com/winsiderss/phnt/blob/53fbbdc5b5d2b08761db1c7b26bfa8c820924356/ntioapi.h)

### 기존 후보 결과

후속 Windows directory 실험은 두 대안의 clear 근거 채택을 거부했다.
871cffedb2a2d1475e925840eb19c4717d02cdbd / CI 44062492846에서 DELETE access
handle 아래 시작된 process의 cwd를 독립 oracle로 확인했으나, handle을 해제한
뒤에도 DELETE access는 성공하고 class 47은 성공 코드와 PID 0건을 반환했다.
동시에 일반 chdir는 DELETE handle 유지 중 EBUSY로 실패했다. 이 두 후보의
성공 반환을 cwd 부재로 해석하지 않는다. production adapter로의 승격은 없으며
자세한 source/run/job과 반례는 docs/test-reports/active/pr-worktree-qualify.md에 남긴다.

macOS local 및 GitHub macos-15의 native 경로는 통과했다. Windows 2022 x64의 PEB 후보는 285de226d8815c0604af21be826ada5b7febbcfb에서 cwd-open-5 1건으로 불완전 관측이었다. QUERY_LIMITED_INFORMATION | VM_READ에서도 동일했으므로 현재 Windows 후보는 운영 채택 보류다. unknown을 clear로 바꾸거나 실패 process를 제외하지 않는다.

프로세스 변경은 한 관측 시간 예산 안에서 fresh inventory로 재검사하고 snapshotAttempts/populationChanges를 반환한다. 관측 결과를 다음 호출에 캐시하지 않는다. macOS의 ps start identity는 초 단위라 외부의 극단적인 동일 초 PID 재사용을 원자적으로 인증하지 않으며, 어떤 결과도 삭제 권한으로 사용하지 않는다.
