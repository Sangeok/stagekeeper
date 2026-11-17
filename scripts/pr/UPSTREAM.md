# Process usage qualification sources

이 디렉터리는 Phase QUALIFY의 읽기 전용 후보 구현이다. worktree/branch 삭제, PR 병합, 제품 런타임 연결은 하지 않는다. OpenClaw 설치·Bash·sh·외부 binary 다운로드가 필요하지 않다.

## Gate A: 관측 profile

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
