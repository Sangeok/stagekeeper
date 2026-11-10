# macOS Codex runtime

macOS Codex는 기존 HTTP MCP·승인·AgentRun·receipt를 사용한다. 실행 도구와 설치물만
native macOS 경계에 맞춘다. 서버의 단계 본문, 인수 다섯 조건, 사용자 승인 권한은
이 어댑터가 재정의하지 않는다. 실제 모델·설치·OS별 검증 결과는 해당 시험 보고서의
범위로 판단하며, 모델 없는 계약 시험을 전체 A→Z 완료로 해석하지 않는다.

## 설치와 진입점

- `scripts/macos/build-runtime.mjs`는 고정된 Node 22.23.3의 공식 arm64/x64 archive
  SHA-256을 검증하고 Node/npm·라이선스·native scanner를 묶는다. 빌드는 대상
  아키텍처의 macOS에서 수행한다. Clang은 패키지 제작에만 필요하다.
- `scripts/macos/package-plugin.mjs`는 Git에 등록된 배포 파일과 runtime, Claude/Codex의
  동일한 완전 검증 스킬을 복사하고 파일별 hash·mode inventory를 기록한다.
  생성 runtime은 Git과 ESLint의 대상이 아니며 원본 npm 코드를 수정하지 않는다.
- 설치한 `bin/harness <task> <arguments>`는 포함된 Node의 checksum을 먼저 검사하고
  `harness-platform.mjs`가 runtime provenance와 전체 inventory를 검사한 뒤 고정된
  task 진입점을 실행한다. source-only Codex 설치에서 global Node로 우회하지 않는다.
- package는 template guard와 role commit guard를 모두 native launcher로 연결한다.
  원래 matcher·조건·timeout·실패 정책을 유지하고, 알 수 없거나 빠진 hook은 패키징을 거부한다.
- Codex의 허용 OS는 Windows와 macOS다. 다른 OS는 초기화·실행·dispatch 전에
  `codex-platform`으로 거부한다. stop/release는 남은 소유권 정리를 위해 유지한다.
- macOS에서 역할이나 runner를 시작하는 신뢰된 설치 launcher는 부모 Codex 명령
  sandbox 밖에서 실행할 수 있는 일반 사용자 승인이 필요하다. 중첩 Seatbelt 생성은
  거부되므로 이 승인은 launcher에 한정하며 역할의 권한이나 전역 sandbox 설정을
  완화하지 않는다.

공개 marketplace source와 생성 설치 bundle은 별도 배포물이다. bundle을 생성하거나
로컬 marketplace에 설치한 결과는 공개 배포 완료를 뜻하지 않는다.

## 실행과 파일 경계

`role-command-backend.mjs`가 Windows LPAC와 macOS Seatbelt를 선택한다. Codex 역할과
resident main loop는 같은 선택기를 사용한다. macOS 역할은 shell tool을 끄고 기존
`role_file_*`·`role_git_read`와 snapshot 명령 도구를 사용한다. 원본 Git metadata는
역할의 직접 파일 접근에서 거부하고 Git 근거는 기존 scoped reader를 거친다.

`macos-commands.mjs`는 매 명령마다 canonical OS 임시 디렉터리에 허용된 원본·scratch의
복사본을 만든다. 원본 Git·클라이언트 설정·환경 파일은 제외하고, 파일 broker는 `.env`
(`.env.example` 제외), `.npmrc`, `.netrc`, `.git-credentials`, `.ssh`, `.aws`, `.azure`를
읽기·쓰기·목록·검색에서 거부한다. 명령 환경은 명시한 시스템 값과 runtime 경로만
포함하며 owner/API credential, `NODE_OPTIONS`, `CODEX_HOME`을 상속하지 않는다.

명령은 `/bin/sh -c`로 실행된다. 포함된 Node/npm, 필요한 읽기 전용 시스템 경로와
명령 복사본만 보이고 network는 거부한다. npm은 복사본의 독립 cache와 빈 사용자·전역
설정을 사용한다. 원본 수정은 hash를 확인하는 파일 도구만 수행한다. 명령 안의 모든
쓰기는 폐기하며 결과에 원본/scratch hash와 제외한 경로를 함께 남긴다. 검증에 필요한
파일·Git·환경·network가 제외되었다면 exit 0만으로 해당 검증을 통과 처리하지 않는다.

macOS의 npm 실행 파일 링크는 복사 원본 안에서 끝나는 상대 symlink만 보존한다.
target의 권한과 canonical 경로를 확인하며 외부·절대 링크는 거부한다. 실행 비트를
보존하고 링크 대상은 snapshot hash에 포함한다. snapshot hash는 파일 내용·링크 대상의
근거이며 원본의 모든 metadata가 동일하다는 증명은 아니다.

esbuild처럼 정상 의존성 설치가 만든 hardlink는 모든 연결 이름이 같은 허용 snapshot
원본 안에 있고 관찰한 이름 수가 inode의 nlink와 같을 때만 독립 파일로 복사한다.
누락·deny·외부 연결이나 복사 전후 identity·nlink 변화는 거부한다. symlink가 이 파일을
가리킬 때도 같은 증거를 확인한다. 역할의 직접 파일 읽기·쓰기 도구는 hardlink를 계속 거부한다.
이 저장소의 `npm run build`는 native 역할 안에서 Webpack을 선택해 Turbopack의 내부
포트 bind를 피한다. network deny와 원본 쓰기 금지는 유지한다.

## 종료와 복구

`macos/role-process.mjs`는 activation 전 부모가 session에 등록한 supervisor다.
stdin의 start 뒤에만 payload를 실행한다. 정상 종료, stop, timeout, 출력 상한,
부모의 EOF 모두 같은 native 종료 확인을 거친다. stdout/stderr EOF나 부모 PID의
소멸만으로 종료를 인정하지 않는다.

매 실행은 허용/거부 경로 쌍을 가진 고유 Seatbelt profile을 사용한다.
`macos/sandbox-identity.c`는 그 서명을 가진 프로세스를 식별하고 시작 시각과 서명을
다시 확인한 뒤 정지·종료한다. 연속 세 번의 빈 검사와 오류·overflow·신원 누락이
없음을 요구한다. 다른 profile의 프로세스는 종료하지 않는다. `sandbox_check`의
비공개 심볼과 deprecated `sandbox-exec`에 의존하므로 필요한 기능이나 검사 결과가
없으면 시작/반납을 거부한다. 이 관찰 기준을 임의의 OS와 스케줄링에 대한 형식적
종료 증명으로 확대하지 않는다.

첫 native command를 등록하면 lock만 `schemaVersion:2`가 된다. 정책 파일과 stop
request는 v1을 유지한다. v2 child는 PID·nonce와 `sandbox:{kind,root}`를 보관한다.
이전 reader가 새 종료 의미를 모르면서 dead PID만 보고 반납하지 못하도록 schema를
올린 것이다. 현재 reader는 v1과 v2를 읽고, 더 높은 판은 stop 요청 외에는 쓰지 않는다.

supervisor가 죽어도 살아 있는 부모가 같은 서명으로 남은 프로세스를 정리한다.
둘 다 죽으면 등록된 identity와 request 파일을 보존한다. 명시적 stop/release에서
`macos-recovery.mjs`가 같은 stopping session과 canonical 임시 경로·nonce를 검사하고,
기록된 supervisor PID가 살아 있으면 손대지 않는다. 종료 확인 뒤에만 child를 정산하고
그 복사본을 지운다. 실패나 불명확한 결과는 잠금을 보존한다. `--abandoned yes`도
해결되지 않은 sandbox child를 무시하지 못한다.

## 선택 검증 역할

macOS `impl-verifier`는 `implementation-copy.mjs`의 별도 복사본을 사용한다. target은
서버의 최신 dev 실행 보고에서 얻고 승인 plan commit을 함께 고정한다. 현재 원본의
제품 파일이 target 이후 바뀌었으면 dispatch를 거부한다. Git 객체만 별도로 복사하고
원본 config·hooks·remote를 실행하거나 복사하지 않는다.

역할은 원본에서 자기 보고서만 쓸 수 있다. `implementation_git`는 identity·changes·
show·history·status와 plan/target의 명시한 파일 복원만 제공한다. 검증 명령은 검증
사본의 새 snapshot에서 실행하고, mutation은 검증 사본에만 적용한다. 정상 baseline,
되돌렸을 때의 assertion 실패, 복원 후 재통과와 예외 분류는 기존 서버 절차를 따른다.
보호된 클라이언트 metadata의 최초 제외 목록은 target 대비 복원 차이와 구분한다.
status는 허용된 target 파일만 비교하며 필요한 제품 파일·의존성이 빠졌으면 blocked다.
report handoff는 같은 AgentRun의 report/failed-report/blocked-report만 이어받는다.
resident가 현재 commit 권한과 canonical 보고서 hash를 확인해 커밋한 후 한 번 재개한다.
이어받은 역할은 확인된 보고서만 읽고 기존 판정을 제출하며 명령·브라우저·mutation 복사본을
받지 않는다. 실패·차단을 기록하기 위한 재개가 검증 재실행이나 통과 전환을 뜻하지 않는다.
Windows의 기존 impl-verifier 거부는 이 변경으로 해제하지 않는다.

resident QA는 `resident_qa_environment`로 설정된 테스트 페이지를 먼저 관찰한다.
unattended dispatch에는 snapshot에 노출된 전체 구현 commit이 필요하다. 이 도구는
임의 URL·입력을 받지 않으며 snapshot 관찰 hash를 최소 briefing으로 전달한다.
독립 QA 역할은 실제 브라우저 시나리오·console·network 관찰을 다시 수행한다.
불일치/실패 시 자동 재시도하지 않는다. 브라우저·테스트 서버 준비 조건은
[qa-verifier.md](./qa-verifier.md)를 따른다. 로그인 시 자동 시작은 여전히 Windows 전용이다.

완료된 doc-auditor와 feature-scout의 최종 보고는 현재 commit 권한으로 각 고정 log에
추가·커밋한다. thread별 marker로 중복을 막고 기존 기록이 바뀌었으면 보존하고 거부한다.
보고서 기록 성공과 서버의 구현 인수는 서로 다른 결과다.

MCP SDK의 입력 검증 거부는 JSON-RPC `-32602`와 SDK의 정확한 plaintext 형식을 구분해
안전한 schema 오류로 전달한다. 원문 입력·거부 문구는 반사하지 않는다. `agent_next` note의
상한은 실제 tools/list에서 읽고 receipt 불일치는 현재 단계를 다시 읽어 정정하게 한다.
인증·소유권·실행 결합 거부는 이 복구 경로로 바꾸지 않는다. native 명령의 MCP 제한 시간은
900초이며 Codex의 실제 effective config에서도 확인한다. 보고서 전용 역할은 2분으로 제한한다.

## 검증 실행

macOS runtime 계약 CI는 두 아키텍처의 bundle을 만든 뒤 실제 native 테스트를 실행한다.
`STAGEKEEPER_MACOS_RUNTIME_REQUIRED=1`에서는 누락되거나 손상된 runtime을 skip하지 않는다.
기본 소스 검사, 실제 설치, 인증된 모델 실행과 장시간 유휴는 각각 별도 증거다.

`scripts/macos/probe-codex-host.mjs`는 모델 없이 실제 CLI의 정책·스킬·thread 생성과
정리를 확인한다. `scripts/rehearsals/rehearse-codex-macos.mjs`는 명시한 `--run-models`,
loopback `stagekeeper_test_*` DB, 새 외부 증거 디렉터리와 설치 package를 요구한다.
시험용 사용자·저장소에서 native init, 모든 역할, owner gate, 최종 인수와 선택한 유휴
시간을 관찰한다. global Node가 없는 helper PATH를 사용하고 실제 로그인은 복사하지 않는다.
시험 MCP 등록만 별도 `CODEX_HOME`에 두고 역할은 기존 native 로그인을 사용한다.
private template·명령·모델 기록은 공개 저장소 밖에 두며 공개 보고서에는 정제한 결과만 남긴다.
