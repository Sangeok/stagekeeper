---
status: "completed"
stage: null
result: "pass"
report-kind: "exploratory"
report-size: "standard"
test-levels: ["contract", "integration"]
test-tools: ["Node.js", "Clang", "Seatbelt", "libproc", "GitHub Actions"]
created-at: "2026-10-28"
completed-at: "2026-10-28"
last-executed-at: "2026-10-27T23:58:54Z"
tested-revision: "ddb18a4dad6e301cf27db35dc63370ae84e96e26"
owners: ["user:Sangeok"]
related: ["docs/proposals/active/codex-resident-runner-plan.md", "docs/proposals/active/codex-dual-client-runtime-follow-ups.md", "docs/test-reports/completed/2026-10-25-macos-descendant-ownership.md", "docs/test-reports/completed/2026-10-25-macos-launchd-ownership.md", "docs/test-reports/completed/2026-10-25-macos-coalition-access.md", "docs/test-reports/completed/2026-10-24-codex-runtime-portability.md"]
primary-area: "harness/macos-sandbox-identity"
observed-environments: ["CI | macOS 15.7.9 (24G830) arm64 and x64 hosted runners | Darwin 24.6.0; Node 22.23.2 | ordinary user; no client credentials", "local | Windows repository validation | Node 22.13.1 | native macOS probe refuses execution"]
test-summary: "pass: a per-run Seatbelt profile signature found every survivor without false matches, both kill strategies ended a live 2 ms fork-and-exit hopper by heartbeat, and survivors stayed confined; no product backend was built"
follow-up: ["docs/proposals/active/codex-resident-runner-plan.md", "docs/proposals/active/codex-dual-client-runtime-follow-ups.md"]
---

# macOS 실행별 샌드박스 식별과 후손 종료 확인

## Summary and Decision

2026-10-25 시험은 일반 사용자 권한으로 쓸 수 있는 소유권 primitive를 찾지 못했다. 시험한 후보는 NOTE_TRACK,
프로세스 그룹 종료, launchd 종료, coalition이었다. 이번 시험은 다른 경계를 확인했다. 명령을 실행할 때마다
고유한 Seatbelt profile을 쓰고, 그 profile의 서명으로 프로세스를 찾는다. 서명은 무작위 경로 하나의 읽기 허용과
다른 무작위 경로 하나의 읽기 거부다. Seatbelt는 fork·exec·setsid를 거쳐도 상속되고 스스로 벗을 수 없으므로,
분리된 후손도 서명을 그대로 지닌다.

macOS 15.7.9 hosted runner(arm64·x64)에서 4회 실행, 모두 20번 수행했다.

- 식별: 20번 모두 알려진 프로세스의 누락, 미지의 일치, 대조군 일치, `sandbox_check` 오류가 0이었다.
- 종료: 마지막 회차 6번 모두 heartbeat로 살아 있음을 확인한 2 ms fork-후-종료 hopper를 두 방식이 각각 끝냈다.
  두 방식은 "첫 빈 검사까지 종료"와 "발견 즉시 정지 + 빈 검사 3회"다. 대조군은 끝까지 살아 있었다.
- 가두기: leader 그룹을 죽인 뒤 살아남은 후손은 checkout 쓰기, 비밀 읽기, LaunchAgent 쓰기, 다른 프로세스 신호,
  loopback 연결이 모두 EPERM이었다. launchd 제출, 중첩 sandbox-exec, crontab, LaunchServices 실행도 실패했다.

**판정:** 2026-10-25 보고서가 다음 구현의 선행 조건으로 적은 두 항목, 원자적 소유권 상속과 재사용 안전한
신원·전체 종료 관찰의 후보를 hosted runner에서 확인했다. 이 PASS는 제품 지원 PASS가 아니다. 제품 backend,
실제 Mac, Codex 인증 인수는 하지 않았다. macOS의 Codex resident는 계속 `codex-windows`로 거부한다.

## Scope and Criteria

| 기준 ID | 기준 문서 또는 요구사항 | 적용 범위 | 확인 기준 |
| --- | --- | --- | --- |
| R1 | [프로토콜](../../architecture/protocol.md)의 실제 종료·ownership 계약 | 종료 근거 후보 | 실행이 만든 프로세스를 모두 찾고, 0을 확인한 뒤에만 반납할 수 있는지 |
| R2 | [resident 계획](../../proposals/active/codex-resident-runner-plan.md)의 macOS 경계 | fork/exec/setsid 이탈과 fork 경쟁 | 분리·고아·exec·연속 생성·hopper 후손을 실제로 만들고 oracle과 heartbeat로 대조 |
| R3 | [최소 설치 계약](../../architecture/README.md) | 권한 | root, entitlement, 추가 설치 없이 일반 사용자로 동작 |
| R4 | 놓친 후손에 대한 두 번째 방어선 | 살아남은 후손 | 원본 checkout, 비밀, 네트워크, 다른 프로세스, 외부 실행 경로를 막는지 |

## Test Target

기준 dev는 `1fb8a8a4e3155d2cbe3b2e31baa0c9b8607c2a90`, 시험 source는 `ddb18a4dad6e301cf27db35dc63370ae84e96e26`이다.
다음 파일을 사용했다.

- [scanner](../../../scripts/macos/probe-sandbox-identity.c)
- [hopper](../../../scripts/macos/probe-sandbox-identity-hopper.c)
- [실행기](../../../scripts/macos/probe-sandbox-identity.mjs)
- [sandbox 안 자식](../../../scripts/macos/probe-sandbox-identity-child.mjs)

시험 당시에는 그 브랜치에서만 도는 임시 workflow가 러너마다 실행기를 돌렸다. 기록 commit에서 임시 workflow를
지우고, 같은 실행기를 [macOS workflow](../../../.github/workflows/macos-runtime-contracts.yml)의 상시 단계로 옮겼다.

## Preconditions and Test Data

- 실행 사용자: root가 아닌 hosted runner 사용자. 모델, client 인증, private source, 실제 프로젝트 명령은 쓰지 않았다.
- profile: `(deny default)`에 다음을 허용한다.
  - process-exec·fork, 같은 sandbox 안의 신호와 process-info
  - 시스템 경로의 읽기와 실행 매핑
  - runtime·snapshot·scratch 읽기, snapshot·scratch 쓰기
  - 무작위 경로 A 읽기 허용, 무작위 경로 B 읽기 거부
- 대조군 profile: 같은 규칙에 다른 무작위 경로를 쓴다.
- scanner의 판정: `proc_listallpids`의 각 PID를 검사한다.
  - `sandbox_check(pid, NULL)`로 sandbox 여부를 본다.
  - `file-read-data`와 `SANDBOX_CHECK_NO_REPORT`로 A 허용·B 거부를 본다. 두 심볼은 비공개이며 `dlsym`으로 찾는다.
  - zombie는 건너뛴다.
  - 종료 직전에 시작 시각과 서명을 다시 확인한다.
- leader가 만드는 후손:
  - `detached`: setsid로 분리
  - `orphan`: 중간 부모가 바로 종료
  - `exec`: `/bin/sleep`으로 exec
  - `spawner`: 100 ms마다 분리된 sleep을 만든다
  - `attacker`: 가두기 시험을 수행한다
- hopper: 2 ms마다 fork하고 부모는 바로 종료하며, 자식은 setsid한다. hop 20번마다 heartbeat 파일을 갱신한다.
- 대조군: sandbox 밖 `/bin/sleep`, 다른 서명 profile의 survivor.
- 생존 판정: oracle PID와 hopper heartbeat로만 판정한다. `pgrep`은 쓰지 않는다(T8).

## Test Cases and Results

| ID | 기준 | 시험 | 실제 결과 | 판정 |
| --- | --- | --- | --- | --- |
| T1 | R3 | 비공개 심볼 해석과 자기 검사 | 20번 모두 해석 성공, scanner 자신은 비sandbox, `sandbox_check` 오류 0 | PASS |
| T2 | R1/R2 | leader 생존 중 식별 | 20번 모두 누락 0, 미지 일치 0, 대조군 일치 0. 일치 11~40개 | PASS |
| T3 | R1/R2 | leader 프로세스 그룹 SIGKILL 뒤 식별 | 다섯 종류 후손 모두 생존(반례 재현). 누락 0, 미지 0, 대조군 0. 일치 13~46개 | PASS |
| T4 | R4 | 살아남은 후손의 직접 접근 | checkout 쓰기, 비밀 읽기, LaunchAgent 쓰기, 대조군 신호, loopback 연결 모두 EPERM | PASS |
| T5 | R4 | 외부 실행 경로 | launchctl submit 실패·작업 없음, 중첩 sandbox-exec는 `sandbox_apply` EPERM, crontab 실행 EPERM·항목 없음, `open`은 이름·경로 모두 실패·Calculator 없음, 외부 marker 0 | PASS |
| T6 | R1/R2 | 첫 빈 검사까지 종료(마지막 회차 6번) | spawner와 살아 있는 hopper를 4~13 라운드 동안 쫓아 모두 종료. 알려진 PID 잔존 0, 직후 검사 0, hopper heartbeat 정지, 대조군 생존 | PASS |
| T7 | R1/R2 | 발견 즉시 SIGSTOP + 빈 검사 3회(새 hopper, 6번) | 일치한 라운드 1~3번 만에 정지·종료한 뒤 빈 검사 3회. heartbeat 정지, 대조군 생존 | PASS |
| T8 | R2 | `pgrep -x hopper`의 생존 판정 | 셋째 회차 6번 중 5번 살아 있는 hopper를 없다고 판정. 같은 실행의 종료 반복 기록에는 hopper가 계속 잡혔다 | 관찰: 제품 판정 수단으로 부적합 |
| T9 | R3 | Windows에서 실행 시도 | 실제 macOS kernel 요구 오류, 증거 파일 미생성 | PASS |

전체 검사 177번은 한 번에 프로세스 425~605개를 확인했다. 그중 274~443개는 다른 시스템 profile의 sandbox
프로세스였다. 검사 시간은 최소 3.3 ms, 중앙값 10.9 ms, 90번째 백분위 29.4 ms, 최대 282.4 ms였다. 셋째 회차의
hopper 결과는 T8 때문에 T6·T7의 근거에서 뺐다.

## Commands and Static Checks

- macOS: `node scripts/macos/probe-sandbox-identity.mjs "$RUNNER_TEMP/sandbox-identity.json"`. 시험 회차에서는 러너마다 같은 명령을 세 번 반복했다.
- 실행기는 scanner와 hopper를 `xcrun clang -std=c11 -Wall -Wextra -Werror`로 빌드하며 새 증거 경로만 허용한다.
- 실행 기록:
  - [40604192931](https://github.com/Sangeok/stagekeeper/actions/runs/40604192931)
  - [40604496338](https://github.com/Sangeok/stagekeeper/actions/runs/40604496338)
  - [40605102401](https://github.com/Sangeok/stagekeeper/actions/runs/40605102401)
  - [40605571354](https://github.com/Sangeok/stagekeeper/actions/runs/40605571354)
  - 모두 두 러너 PASS다. 각 실행의 변경과 commit은 [source-basis](../assets/2026-10-28-macos-sandbox-identity/source-basis.json)에 있다.
- Windows: 두 `.mjs` 구문 검사와 ESLint를 통과했다. 기록 commit의 저장소 검사는 아래 Review Checklist에 적었다.

## Evidence Registry

| ID | 증거 | 보존 위치 |
| --- | --- | --- |
| E1 | arm64 마지막 회차 3번의 판정과 측정 | [macos-arm64.json](../assets/2026-10-28-macos-sandbox-identity/macos-arm64.json) |
| E2 | x64 마지막 회차 3번의 판정과 측정 | [macos-x64.json](../assets/2026-10-28-macos-sandbox-identity/macos-x64.json) |
| E3 | 기준 commit, 4회 실행, 실행별 변경 | [source-basis.json](../assets/2026-10-28-macos-sandbox-identity/source-basis.json) |

증거 JSON에는 사용자 경로, 토큰, private source, 모델 대화를 넣지 않았다. runner 임시 경로와 PID 목록도 남기지 않았다.

## Findings and Follow-up

| 항목 | 근거와 한계 | 현재 판단 |
| --- | --- | --- |
| 실행별 Seatbelt 서명 식별 | T1~T3이 근거다. 비공개 `sandbox_check`·`SANDBOX_CHECK_NO_REPORT`와 deprecated `sandbox-exec`에 의존한다. Apple이 바꾸면 깨질 수 있다. | 후보로 채택. 심볼이 없거나 오류가 나면 시작을 거부하고, macOS CI 상시 단계로 감시 |
| 종료 확인 | T6·T7이 근거다. PID 목록을 찍은 순간과 각 PID를 검사하는 순간 사이에 fork 후 바로 종료하면 한 라운드가 비어 보일 수 있다. 빈 검사 3회와 발견 즉시 정지는 그 확률을 낮출 뿐 형식적 증명이 아니다. | 제품 기본값 후보는 T7 방식. 놓친 후손은 T4·T5의 가두기가 막는다 |
| 가두기 | T4·T5는 최소 profile에서만 확인했다. LaunchServices는 실행 파일을 읽지 못해 먼저 실패했고, launchctl은 오류 메시지 없이 실패했다. 실제 git·npm·컴파일러를 허용하는 넓은 profile과 mach-lookup 허용 범위에서는 다시 확인해야 한다. | 설계 단계에서 재시험 |
| `pgrep` | T8 | 제품 판정에 사용하지 않음 |
| runner 비정상 종료 뒤 복구 | 시험하지 않았다. 서명 경로를 잠금에 저장해 두고, 다음 시작이 같은 서명으로 검사·종료해야 한다. | 설계 항목 |
| 범위 | hosted runner의 macOS 15.7.9에서만 시험했다. 실제 Mac, 다른 macOS 버전, Codex 인증, 장시간·취소 인수, scanner 네이티브 바이너리의 패키징·서명은 없다. | 남음 |

다음 단계는 macOS resident backend 설계 제안이며 승인이 필요하다. 제안에는 실제 도구를 허용하는 profile,
scanner 패키징, 잠금에 남길 서명, command/Git backend 연결, 실제 Mac 인수 계획이 들어가야 한다.

## Conclusion

2026-10-25 보고서들의 "적합한 소유권 primitive 미확보"를 이 경계에서 다시 검토할 근거를 얻었다.
그 보고서들의 반례(NOTE_TRACK, 프로세스 그룹, launchd, coalition)는 그대로 유효하다. 제품 backend, 실제 macOS
client 인수, 출시 판단은 남아 있으며 Codex resident는 계속 Windows에서만 시작한다.

## Review Checklist

- [x] arm64/x64 실제 실행과 oracle·heartbeat 판정을 분리했다.
- [x] 공허했던 셋째 회차의 hopper 결과(T8)를 PASS 근거에서 뺐다.
- [x] 후보 PASS를 제품 지원 PASS로 확대하지 않았다.
- [x] 임시 workflow를 지우고 실행기를 상시 macOS 단계로 옮겼다.
- [x] 기록 commit에서 `npm run check`, `verify:fsd`, `verify:server`, `test:architecture`를 통과했다.
- [ ] macOS backend 설계와 실제 Mac 인수를 완료한다.
