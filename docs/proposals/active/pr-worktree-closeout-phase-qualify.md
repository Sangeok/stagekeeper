---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-17"
approved-by: "user"
approved-at: "2026-11-17"
approval-scope: "채택된 조건부 방향에 따른 QUALIFY 재정합, 관측 API/미지원 경계·fixture·시험·CI·증거 보완. Windows 자동 삭제, 실제 자료 정리, PR 병합, REPLACE/ADOPT 제외. 사용자 명령 통합은 확정하지 않음."
completed-at: null
verification-summary: "조건부 QUALIFY 구현 검증 통과: 등록한 로컬 macOS profile과 runtime 대조, Windows 미지원/반례, 전체 CI 44091585161. 실제 삭제·REPLACE 제외."
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/pr-worktree-closeout.md"
  - "docs/test-reports/active/pr-worktree-qualify.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/test-organization.md"
  - "docs/ADR/0004-organize-repository-scripts.md"
---

# PR worktree 완료 흐름 — Phase QUALIFY 상세 계획

## Summary

사용자가 채택한 조건부 자동 정리 방향으로 QUALIFY를 재정합한다. [상위 SDD](./pr-worktree-closeout.md)가 canonical 계약을 소유한다. 이번 Phase는 **운영용 사용 확인 결과와 후보의 실제 native 자격 검증을 분리**한다. 검증되지 않은 환경은 관측 미실행/unknown을 명시하고 자동 삭제 자격을 주지 않는다.

Windows의 PEB 접근 거부와 directory 후보의 cwd 누락은 해결되지 않았다. 그 실패는 보존한다. macOS도 일부 native 통과를 모든 필수 사례의 완료로 확대하지 않는다. 최소 한 macOS profile의 자격 증거를 마감해야 QUALIFY exit와 REPLACE 진입이 가능하다.

- 모드: `PHASE_PLAN`. 위험도: `HIGH-RISK`.
- 시작 source: `32d4734d19e149dfce38da1b7008c474b6802293`, 동일 미병합 branch와 Draft PR #364, working tree clean.
- parent snapshot SHA-256: `6ae3e7932d3474aa52237499bc7d98c08404026b64ec9c8351816f3a93963dad`.
- 이번 문서 정합은 parent의 방향 승인 기록과 이 child를 대상으로 한다. 구현·CI·보고서 보완은 아래 승인된 QUALIFY 경계로 이어진다.
- 현재 실행 결과: 조건부 QUALIFY 구현 검증 통과. 등록한 로컬 macOS profile로 한정하며 다른 profile 승격은 새 증거가 필요하다. REPLACE 실행은 이번 범위 밖이다.
- OpenClaw 설치·Bash·sh·새 dependency·권한 상승은 없다. 공통 코드는 Node ESM이다.

## 계약 소유와 범위

| 항목 | canonical 위치 | 이 계획의 기여 |
| --- | --- | --- |
| Phase / Task | [QUALIFY](./pr-worktree-closeout.md#phase-qualify-플랫폼과-이식-경계-확정), [TASK-PWCQ-01](./pr-worktree-closeout.md#task-pwcq-01-사용-확인과-native-이식-증거) | 기존 기록을 이동·복제하지 않고 구체화 |
| 요구사항 | [REQ-PWC-014](./pr-worktree-closeout.md#req-pwc-014-양-os-사용-확인) | profile·관측 실행 여부·결과·완전성 |
| 검증 | [VFY-PWC-09](./pr-worktree-closeout.md#vfy-pwc-09-실제-os-관측과-capability) | runtime 계약과 실제 후보 자격 증거 구분 |
| 불변식 | INV-PWC-001, INV-PWC-002, INV-PWC-005, INV-PWC-006 | 보호 대상·선언/관측 분리 |
| 제약 | CON-PWC-001, CON-PWC-003, CON-PWC-004, CON-PWC-005, CON-PWC-006, CON-PWC-008 | 모듈 경계·우회 금지·양 OS 검증 |
| blocker | [BLK-PWC-01](./pr-worktree-closeout.md#blk-pwc-01-windows-자동-정리-자격-미확보), BLK-PWC-04, BLK-PWC-05 | Windows 자격은 미해소, 방향 선택 해소, macOS 증거 마감 필요 |

REQ-PWC-003/005/015/016의 실제 병합·삭제·수동 인수는 REPLACE가 소유한다. 이번에는 그 소비자가 사용할 결과 계약만 준비한다. native clear는 자료 삭제 권한이 아니다.

제외: 구 관리기·alias 퇴역, complete/cleanup/recover/수동 인수 CLI, 제품 src/packages/plugin 변경, 실제 사용자 worktree/원장 변경, PR 병합, 외부 worker 종료. 사용자 명령 수는 이 Phase에서 결정하지 않는다.

## 재정합 시점의 코드와 계획된 차이

아래 표와 Q1~Q5는 source 32d4734에서 정한 변경 계획이다. 실제 결과는 문서 끝의 최종 검증과 인계 기록을 따른다.

| 대상 | Observed | 처리 |
| --- | --- | --- |
| `process-usage.mjs:inspectWorktreeUsage` | 입력·target 확인, 실제 OS probe, population·완전성·target 재검사, bounded child | 실제 후보 구현을 보존하고 runtime 진입점과 분리 |
| `process-usage-protocol.mjs` | lsof NUL/NL·escape·독립 inventory, Windows schema/진단 검증 | 재사용. candidate의 실제 결함 수정이 있을 때만 변경 |
| `process-usage.test.mjs` | 공통 parser/오류와 양 OS 정상 native 기대를 한 파일에 포함 | 공통·probe·qualification·runtime 검증 책임 분리 |
| `platform/windows-process-usage.*` | build 20348/x64 PEB 후보, 실제 cwd-open-5 | 수정·권한 확대 없이 실패 후보로 보존 |
| `windows-directory-usage.test.mjs` | 실제 cwd 누락과 chdir 간섭을 재현 | Windows native 반례 시험 유지 |
| `check/task-worktrees` | Windows/macOS에서 후보 clear 기대 gate. Windows 실패 | 제공하는 runtime 계약과 후보 자격 gate를 명시적으로 분리 |
| `manage-task-worktrees.mjs:finishTask/finalize` | owner·HEAD·자료 검사 후 기존 정리 | 이번 Phase 호출·수정·연결 금지 |

제품 runtime은 이 모듈을 아직 소비하지 않는다. 현행 관리기는 계속 원래 경로를 사용한다. 후보 helper와 fixture는 제품 모듈을 import하지 않는다.

## Phase QUALIFY: 실행 범위

- predecessor artifacts: 채택된 parent, 기존 QUALIFY 실행 보고서·native evidence, 현행 source.
- satisfies: REQ-PWC-014
- preserves: INV-PWC-001, INV-PWC-002, INV-PWC-005, INV-PWC-006
- governed-by: CON-PWC-001, CON-PWC-003, CON-PWC-004, CON-PWC-005, CON-PWC-006, CON-PWC-008
- verified-by: VFY-PWC-09
- entry: 방향 승인과 parent/child 재정합. 동일 미병합 작업 상태·실행 지침 재확인.
- intermediate validity: 모든 운영 profile은 자격 증거 마감 전 unqualified다. 후보는 fixture에서 계속 실행할 수 있다. 구 관리기는 불변.
- exit: 실제 Windows 미지원 runtime·반례 검증, 최소 한 macOS profile의 필수 증거 마감, 지원 한계·비용·오류/settle·소스 지문과 계약 확정.
- stop: unqualified를 qualified로 위장, 자동 관측 미실행을 native 성공으로 계산, 기존 실패 삭제, caller bypass, REPLACE 선행 실행은 금지한다.

## Change detail for TASK-PWCQ-01

### Q1. runtime 경계와 후보 분리

제안 파일과 역할:

| 경로 | 변경 |
| --- | --- |
| `scripts/pr/process-usage/process-usage.mjs` | 운영용 `inspectWorktreeUsage(options)`. 입력 검증 후 검증된 profile만 관측. 미지원은 무관측 unknown |
| `scripts/pr/process-usage/process-usage-probe.mjs` | 기존 실제 관측 구현을 이동한 `probeWorktreeUsage(options)`. qualification용 결과이며 자동 정리 권한이 없음 |
| `scripts/pr/process-usage/process-usage-contract.mjs` | 공통 입력 검증·초기 결과 구성만 공유. I/O·상태·권한 없음 |
| `scripts/pr/process-usage/process-usage.test.mjs` | runtime 입력·미지원·우회 거부·무변경 계약 |
| `scripts/pr/process-usage/process-usage-probe.test.mjs` | 기존 parser/오류·timeout·cancel·target drift 경계 검증 |
| `scripts/pr/process-usage/process-usage-qualification.test.mjs` | 기존 실제 cwd fixture와 macOS 증거 보완. 명시적 native 평가 모드 |

새 입력 flag로 mode/profile/allow-unknown/강제 실행을 받지 않는다. qualification을 원하면 별도의 후보 entry를 사용하며, 후속 controller는 운영용 entry만 소비해야 한다. runtime이나 제품에서 시험 fixture를 import하지 않는다.

입력은 기존 `worktreePath`·선택 `signal`·선택 `observationTimeoutMs`다. 절대 경로·NUL·객체 key·AbortSignal·1~20,000ms 정수 검증을 공유하고 상대 경로/잘못된 입력/시작 전 취소에서는 spawn이 없어야 한다.

반환 계약:

| 필드 | 의미 |
| --- | --- |
| `status` | clear / busy / unknown |
| `capability` | qualified / unqualified, profile과 그 근거. caller가 지정할 수 없음 |
| `observationPerformed` | native observer가 실제로 시작됐는지. 성공·완전성과 별개 |
| `target` | 실제 확인한 canonical identity 또는 null. 미지원 무관측은 null |
| `observation` | 실제 시점/host/profile/scope·count·missing·coverage·진단·비용 |
| `holders` | 관측한 관련 PID/start identity/target 관계만 |
| `observer` | not-started / settled / unsettled, 자기 child metadata |
| `reasons` | 고정 reason code. raw stderr·env·command line 없음 |

판정 순서는 입력 오류 → 시작 전 취소 → 미지원 profile → 실제 관측 오류/coverage/target/settle → busy/clear다.
미지원은 `status=unknown`, `capability.status=unqualified`,
`observationPerformed=false`, `coverageComplete=false`, `target=null`,
`holders=[]`, `observer.state=not-started`이며 파일을 읽거나 helper를 실행할 필요가 없다.
유효한 절대 경로라도 미지원이면 경로 존재를 검증했다고 주장하지 않는다.

후속 profile 승격은 source 변경과 evidence 검토로만 수행한다. 처음 분리하는 단계는
Mac/Windows 모두 unqualified로 유지할 수 있으나 이것은 QUALIFY 전체 완료가 아니다.
후보에서 얻은 clear도 runtime의 qualified 증명으로 자동 승계하지 않는다.

### Q2. macOS 자격 마감

기존 lsof 4.91/libproc와 현재 UID의 non-zombie process population 전후 대조를 보존한다.
NUL field와 NL set, UTF-8/escape, caret 모호성의 unknown 처리를 유지한다.
UID 일치·exit 0·빈 holder만으로 완전성을 인정하지 않는다.

기존 긍정적 환경은 local Darwin 25.2.0/arm64/Node 26.4.0 및 CI Darwin
24.6.0/arm64/Node 22.23.4다. 이 사실을 모든 Darwin/Node/CPU 버전의 자격으로 확대하지 않는다.
lsof version/build와 host·권한·대상 경로 지원 범위를 증거와 결부한다.

남은 실제 증거는 아래 N 표를 기준으로 닫는다. 실제 observer 취소/timeout,
권한 거부, 독립 session, 이름/alias, 반복/병렬·무쓰기를 시험한다.
경계 대역은 native 증거와 구분한다. 기존 저장소의 `sandbox-exec` 시험 패턴을
참고하여 자기 observer에만 임시 제한을 적용하는 권한 거부 fixture는 허용한다.
제품 sandbox 구현을 import하거나 사용자 process 정책을 바꾸지 않는다.
도구 부재/제한 적용 실패를 권한 거부 검증 성공으로 세지 않는다.

clear가 의미하는 것은 한 관측 구간의 제한된 population 결과다. 외부 raw writer 차단,
다른 계정/특권/원격 사용자나 cwd 밖 파일 사용을 보장하지 않는다.
ps start identity의 초 단위 한계를 기록하며 극단적 PID 재사용 방지를 입증했다고 쓰지 않는다.

### Q3. Windows 미지원 동작과 실패 증거 보존

운영용 Windows entry는 unqualified/무관측 unknown으로 반환한다. 이 경로에
PowerShell 설치·C# compile·process memory 조회를 수행하지 않는다.
PEB 후보와 directory 실험은 별도 qualification 자료로 유지한다.

- PEB 후보의 기존 필수 정상 대조군 실패를 삭제하거나 기대값만 unknown으로 바꾸지 않는다.
- 별도 명시적 전체 native 평가 모드에서는 Windows 정상 대조군을 계속 실행하며
  현재 실패가 그대로 드러나야 한다.
- required gate는 Windows runtime의 무관측·coverage false·caller override 거부와
  실제 directory 누락 반례를 검증한다. 이것은 Windows 자동 삭제 지원 인증이 아니다.
- Windows 결과만 보고 macOS의 native 자격을 승격하지 않는다.

### Q4. 공통 lifecycle 보존

기존 관측 budget 20초, 합산 output 16 MiB, 별도 settle 4초를 보존한다.
취소/timeout은 자기 observer만 종료하며 사용자 worker를 종료하지 않는다.
미종료·권한 실패·malformed·불완전 coverage는 unknown이다.
예상 I/O 오류와 프로그래밍 오류를 구분한다.

기존 importer의 무부수효과, shell:false와 argv 실행, caller 밖 observer cwd,
target identity 전후 대조, raw 데이터 비노출을 보존한다.
미지원 runtime은 observer 없이 종료하며 이 사실을 결과에 표시한다.
실제 native helper의 시작과 API 완전 성공은 서로 다른 필드로 표현한다.

### Q5. 증거와 profile 승격

기존 보고서와 source/run/job 증거를 보존하고 조건부 runtime 결과를 추가 기록한다.
후보 증거와 runtime 계약 PASS를 구분한다. macOS의 N01~N19를 항목별 대조하여
native/boundary/미지원/미검증을 적는다. 필요한 항목이 남으면 BLK-PWC-05를 유지한다.

profile 승격에는 최소한 고정 source, host/build/architecture·도구 구성, population
가시성 근거, native 사례, 입력 이름 지원 범위, 권한/오류/취소/settle 증거와
실행 비용이 필요하다. runtime과 qualification의 profile 식별이 달라지면 unknown이다.
사용자 flag·환경 변수로 qualification을 생략하는 분기는 두지 않는다.

## Verification detail for VFY-PWC-09

N 번호는 기존 시나리오 label이며 canonical 정의를 복제하지 않는다.

| 사례 | 기존 증거와 남은 검증 | 개정 판정 |
| --- | --- | --- |
| N01 | macOS clear native 있음 | 지원 profile 자격에는 필수, Windows runtime의 기대는 무관측 unknown |
| N02/N03 | macOS target/descendant holder native 있음 | PID 대조 유지 |
| N04 | sibling prefix 분리 native 있음 | 정상 clear 대조 유지 |
| N05/N06 | 부모 cwd와 caller cwd native 있음 | 자식 cwd 변경으로 부모를 제외하지 않음 |
| N07 | 두 holder 단계적 종료 native 있음 | 마지막 종료 후 fresh clear 유지 |
| N08 | detached process group native 있음 | 실제 session 분리 근거를 확인. group만으로 session 인증하지 않음 |
| N09 | Windows 실제 권한 거부, macOS boundary fault | macOS 실제 observer 권한 거부 및 부분 coverage 보존 보완 |
| N10/N11 | timeout/cancel/output/unsettled 대역 있음 | 실제 observer 시작 handshake 후 중지·settle·holder 생존 보완 |
| N12 | NUL/NL/escape/schema parser 시험 있음 | 재사용, native 이름 대조와 연결 |
| N13 | process population 변경 실제 관측, start drift 대역 | PID 재사용 대역과 실제 종료 구분. 한계 기록 |
| N14 | UTF-8/공백 native, 일부 escape parser 시험 | backslash/control/alias/case 실제 대조. 모호한 caret는 unknown |
| N15 | boundary target 교체, native symlink 거부 | 실제 관측 중 target 교체·alias 보완 |
| N16 | 도구 없음/미지원 boundary | runtime unqualified의 무관측과 추가 key 거부를 양 OS에서 검증 |
| N17 | canary/관련 cwd 비노출 native | 새 출력 필드에도 적용 |
| N18 | 기존 개별 native 실행 | import 무효과·반복/병렬·target/sibling/ref/metadata 불변 보완 |
| N19 | inventory/schema 대역과 Windows coverage 실패 | macOS 실제 권한/누락 사례와 연결. runtime no-observation을 complete coverage로 오인하지 않음 |

권한 거부를 실제로 재현하지 못하거나 지원 이름·visibility·settle 증거가 없으면
그 항목은 미검증으로 남긴다. 범위를 숨겨 축소하거나 skip을 PASS로 계산하지 않는다.
수명·경합 시험은 ready handshake와 유한 deadline을 사용하고 자기 fixture만 정리한다.

### CI와 실행

기존 `check/task-worktrees` matrix와 두 legacy 시험을 유지한다.
같은 workflow 안에서 다음 책임을 분리하며 coverage 표를 함께 갱신한다.

- Windows/macOS required: runtime 입력/미지원 계약 + probe 공통 경계.
- macOS required: 실제 native 후보 qualification. native 사례를 skip해 통과시키지 않음.
- Windows required: 실제 directory 누락 반례. runtime은 자동 삭제 미지원임을 별도로 검증.
- 별도 명시적 전체 후보 평가: 기존 Windows clear/busy 기대도 실행. 현재 FAIL을 보존.
- Linux test:scripts: 공통 parser/계약과 미지원 결과. OS 전용 native 성공으로 세지 않음.

관측 평가 모드 선택은 test 파일의 실행 범위에만 영향을 주며 운영 API의 capability를
변경하지 않는다. 환경 변수로 controller의 자동 삭제를 켜는 기능이 아니다.

사용할 기존 명령은 `node --test`, `npm run docs:check`, `verify:ci-coverage`,
`verify:fsd`, `verify:server`, `verify:shared`, `test:architecture`, `check`,
관련 build다. 새 runtime·fixture 파일은 기존 test:scripts 재귀 발견 범위에 둔다.

## 쓰기 경계와 중간 상태

허용: scripts/pr의 runtime/probe/contract/시험/fixture/UPSTREAM, check workflow의
해당 step, verification coverage, QUALIFY 실행 보고서/evidence, 선택한 parent/child 문서.
기존 native 실패를 기록한 artifact는 덮어쓰지 않는다.

금지: 구 관리기의 운영 변경·퇴역, package 명령 교체, 제품/DB/plugin,
사용자 파일·원장·다른 worktree, 보호 branch, PR 병합과 main 승격.
코드가 분리돼도 기존 관리기의 동작은 그대로다. 모듈 분리 실패 시 기존 후보 파일로
되돌릴 수 있으며 사용자 자료 rollback이 필요한 mutation은 수행하지 않는다.

## 준비도와 구현 인계

- 현재 bounded 결과: runtime/probe 분리, 미지원 계약과 등록 profile 검증을 완료했다.
- 조건부 QUALIFY exit: 등록한 로컬 profile과 Windows 보존 경로에 한해 충족. BLK-PWC-05의 한정 범위를 마감했다.
- BLK-PWC-04의 목표 결정은 해소됐고 Windows 자동 자격 BLK-PWC-01은 유지한다.
- source bundle: parent + 이 child. 일반 추적성 및 docs 검증 후 의미적 차이를 확인한다.
  future REPLACE/ADOPT와 blocked 자격을 포함하므로 strict를 Phase filter로 사용하지 않는다.

구현 인계: 현재 branch/PR·지침·source와 parent hash를 재확인한다. Q1의 경계를
먼저 구현하고 기존 parser/observer 동작을 보존한 채 common/native/runtime 시험을
분리한다. Q2의 macOS gap을 실제 fixture로 검증하고 Q3의 Windows 미지원 결과를
CI에 연결한다. 증거가 부족하면 unqualified를 유지하고 정확한 미충족 항목을
보고한다. 새 명령 통합·REPLACE·실제 cleanup은 진행하지 않는다.

## 과거 계획·리뷰·실행 기록

아래 기록은 최초 parent snapshot과 기존 후보에 대한 역사다. 과거의 양 OS 자동
자격 gate와 BLOCKED 판정을 보존하며, 현재 실행 기준은 위 재정합 계획이다.

## Engineering Review Record

### 최초 판정과 수정 범위

2026-11-17 plan-eng-review로 수정 전 child snapshot을 검토했다. **처음부터 개선점이 없었던 문서는 아니다.** 아래 네 건은 문서의 명시적 충돌·정의 부족을 source와 대조해 찾은 사항이며 실행 중인 구현의 재현 bug라고 주장하지 않는다. 상위 SDD와 구현 코드는 수정하지 않는다.

| ID | 분야·초기 중요도·확신 | 수정 전 근거와 영향 | 반영한 개선 |
| --- | --- | --- | --- |
| F1 | architecture / CRITICAL(후속 삭제 판단 전 해소 필요), 8/10 | Q1·Gate A가 coverageComplete의 생성 근거를 정의하지 않아 backend가 일부 결과를 전체라고 표시할 여지 | profile/population/누락·제외 근거와 wrapper 판정 소유를 정의, 미확정이면 unknown; N19 |
| F2 | code quality / INFORMATIONAL, 10/10 | Q1은 holder 우선 busy와 모든 권한/timeout 오류 unknown을 동시에 규정. invalid-input의 반환 방식도 모호 | unknown 우선 결정표, Promise/입력 오류·취소 계약, 부분 holder+오류 대조; N09/N11 |
| F3 | lifecycle/performance / INFORMATIONAL, 10/10 | Q4의 전체 20초·close 대기와 N10 deadline 조건에 settle 상한·후손 처리가 없음 | 관측 20초+settle 4초, 자기 process identity·unsettled·scratch 보존, 합산 output 상한; N10/N11 |
| F4 | side effects/tests / INFORMATIONAL, 10/10 | Q4는 compile scratch를 허용하지만 N18은 모든 파일 쓰기 0을 요구 | target/repo/config 무변경과 제한된 scratch를 분리, backend cache 확인, compile/취소/반복 사례 보강; N18 |

lsof의 set terminator·name escaping·build visibility는 설치 manual과 Apple source를 근거로 Q2에 보강했다. 이는 확인한 4.91/libproc metadata와 일반 문서 대조이며 대상 process scan은 수행하지 않았다.

### 네 영역의 검토 결과

- Architecture: 공통 판정 소유자와 OS 사실 관측을 분리했다. 최대 9개 예정 파일 및 보고서의 작은 대안을 비교했다. 새로운 영구 상태나 제품 의존성은 추가하지 않는다.
- Code quality: 예상 실패와 프로그래밍 오류, unknown/busy/clear의 우선순위, target/observer identity, bounded lifetime을 구체화했다.
- Tests: 상위 canonical VFY를 유지하고 N09~N18을 실제 실패 경계에 맞게 수정, N19를 추가했다. 기존 파일의 native 시험은 아직 없어 현재 구현 coverage를 PASS로 세지 않는다.
- Performance: process 수 P·output B, cold compile·관측·settle을 별도 기록하고 합산 byte·시간 상한을 둔다. 이번에는 benchmark를 수행하지 않았고 개선 수치를 주장하지 않는다.

### 검증 가치와 counterargument

| 개선 검증 | 보호할 성질 / 실패를 만드는 결함 | 기존 계획의 빈틈 / 한계 |
| --- | --- | --- |
| N19 scope 음성 대조 | 일부 결과·exit 0을 전체로 오판하면 실패 | 이전 N01은 완전 관측을 전제로만 둠. 대역 사례가 native 전체 가시성을 입증하지는 않음 |
| N09/N11 판정 대조 | holder+권한 오류를 busy로 만들거나 취소 뒤 spawn하면 실패 | 충돌한 기대값을 하나로 고정. 실제 권한 재현이 없으면 native 증거로 세지 않음 |
| N10/N11 lifetime | settle이 끝없이 대기하거나 compiler 후손을 놓치면 실패 | 기존 직접 observer 종료 확인만으로는 부족. 외부 worker 종료는 금지 |
| N18 effect 범위 | target/config 쓰기 또는 호출 간 scratch 오염·미종료 scratch 회수가 있으면 실패 | 합법적인 compiler scratch를 무쓰기 실패로 오판하지 않음 |

반론도 확인했다. busy와 unknown은 모두 후속 정리를 막지만, 상위 계약과 반환 schema의 일관성을 위해 F2를 수정했다. source의 timeout만으로 자식 close/후손 종료의 유한성이 보장되지는 않아 F3는 유효한 최초 지적이었고, 이번 문서에서 별도 settle 상한과 미종료 결과로 보완했다. scratch를 허용해도 target 자료 보존이 약화되지 않도록 F4의 허용 위치와 소유권을 제한했다.

### 결정과 남은 검증

문서 수정 권한은 사용자의 이번 “검증하고 개선” 요청이다. F1~F4는 상위 의미를 유지하는 계획 보완으로 반영했다. 새로운 설치·권한 확대·운영 backend 선택·실제 자료 정리는 승인된 것으로 기록하지 않는다.

| 결정 | 상태 |
| --- | --- |
| 공통 wrapper의 coverage·결과 판정, unknown 우선 | 문서에 반영 |
| 유한 관측/settle·자기 자식과 scratch 효과 구분 | 문서에 반영 |
| Windows의 실제 native backend/profile 채택 | qualification 증거 대기 |
| 상위 요구 변경·REPLACE/ADOPT 실행 | 이번 검토 범위 밖 |

검토 후 판정은 **조건부 qualification 계획으로 검토 가능**이다. 문서의 네 결함은 보완했지만, 실제 Windows 가시성·권한·layout과 양 OS의 비용/자식 종료를 실행 검증한 것은 아니다. 독립 sub-agent 검토는 요청되지 않아 수행하지 않았고 이번 검토는 self-review다. 현재 확인한 문서 결함과 예상된 qualification 불확실성을 구분한다.

## Verification Results

| 문서 작업 | 상태 | 근거·한계 |
| --- | --- | --- |
| parent·현재 관리 코드·시험·CI·native helper 전례 대조 | 읽기 검토 수행 | 실제 probe 실행과 구분 |
| Microsoft primary 문서 확인 | 수행 | API 범위·권한·opaque 구조의 한계 확인 |
| 문서 source bundle 추적성 | PASS | parent + 이 문서, 일반 모드. 기존 canonical 정의 재사용, 중복/끊어진 참조 없음 |
| 상대 링크·front matter | PASS | 두 미추적 문서 포함, Markdown 231개·상대 링크 1,211개·문제 0건 |
| 공백·fence·placeholder·parent 불변 | PASS | EOF/공백 검사, 상위 SHA-256 일치 |
| 선택 Phase 의미 검토 | 수행 | 독립 oracle·후보의 미검증 상태·상위 계약 범위·native/double 증거 구분 |
| native N01~N19 | 계획 검토 당시 Not run yet | 후속 구현의 실제 통과·실패·미검증은 실행 보고서 참조 |

source bundle은 `pr-worktree-closeout.md`와 이 파일이다. 상위에 REPLACE/ADOPT의 미래 요구사항과 blocker가 있으므로 strict를 Phase filter처럼 사용하지 않는다. 일반 bundle 검증 뒤 선택 Phase의 의미적 coverage를 별도로 검토한다.

## Approval and Completion Notes

승인 기록은 front matter가 단일 기준이다. 계획 작성 당시에는 구현 실행 승인이 없었다. 후속 사용자 요청에 따른 QUALIFY 구현 승인은 front matter에 기록했다. 상위 SDD에 정의된 정상 운영 교체·자료 이관과 구분한다.

계획 작성·리뷰 당시 산출물은 이 파일 한 개였으며 native 실행과 코드 변경을 수행하지 않았다. 이후 승인된 구현·검증은 아래 Implementation record로 구분한다. 상위 문서는 보존한다.

## Implementation record

실행 기준을 최신 dev `8e0f880c13c2a0dce02c9246c983dffff898bc77`로 fast-forward했다. 기존 미추적 두 문서는 보존했다. 공통 도구는 Node ESM이며 `.sh`·Bash·OpenClaw runtime을 추가하지 않는다.

Gate A 후보의 scope는 호출한 계정의 모든 세션에 속한 non-zombie process cwd다. 같은 계정이라는 사실만으로 coverage를 인정하지 않고 독립 전후 inventory·start identity·필수 cwd·진단을 대조한다. 이 범위 밖의 계정·특권·원격 사용은 인증하지 않으며, 자동 삭제 연결은 없다. 지원 범위가 맞지 않는 REPLACE 적용은 별도 보류한다.

Windows 후보는 설치된 PowerShell Core 7의 메모리 내 Add-Type과 고정 phnt prefix 근거를 사용한다. 외부 binary 설치·SeDebugPrivilege 활성화는 없다. Windows Server 2022 x64/build 20348로 qualification을 제한하며 다른 profile은 unknown이다. source·profile·라이선스는 `scripts/pr/UPSTREAM.md`를 따른다. Windows 실제 통과 여부는 CI 결과로 기록하며 코드 작성만으로 성공을 선언하지 않는다.

macOS 첫 확장 실행에서는 외부 process population 변경으로 정상 대조군 3건이 unknown이었다. 조건을 완화하거나 재시도 횟수만 늘리지 않고, 하나의 관측 budget 안에서 fresh inventory를 재확인하도록 구현했다. snapshotAttempts/populationChanges를 결과에 남긴다. 변경 후 native gate는 21 PASS, 1 SKIP(다른 OS 전용 common 사례), 0 FAIL이었다. 후속 Windows·프로젝트 검증 결과는 아래와 실행 보고서에 기록한다.

Windows 2022 x64/Node 22.23.4의 실제 CI에서 같은 계정 process 1건이 cwd-open-5로 거부됐다. 최소 조회 권한으로 바꾼 후에도 동일했다. native gate의 필수 clear/busy 사례가 unknown이므로 전체 QUALIFY는 통과하지 못했다. 실패 process를 제외하거나 권한을 올려 PASS를 만들지 않았으며 REPLACE/ADOPT는 진행하지 않는다. [실행 보고서](../../test-reports/active/pr-worktree-qualify.md)에 source/run/job과 실패·보류의 구분을 기록했다.

후속 “다음 단계 진행” 요청으로 Q3의 directory 기반 대안 두 가지를 실제 Windows
CI에서 비교했다. 시험 전용 helper는 CreateFileW의 sharing 검사와
NtQueryInformationFile의 directory PID 조회이며 production adapter에 연결하지
않았다. DELETE handle 아래 시작된 process는 target cwd를 유지했으나 handle 해제
후에도 두 검사에서 누락됐다. 또한 관측용 DELETE handle은 일반 chdir를 EBUSY로
막았다. 따라서 두 후보 모두 clear의 근거로 탈락시켰다. 탐색 시험 4건의 통과는
이 반례의 재현이며 전체 QUALIFY 완료가 아니다.

상위 계약과 이 문서의 cwd/PID·coverage 의미는 유지한다. 다음 단계는 자동 정리
범위와 소유 worker의 종료 인계 계약에 대한 상위 설계 결정이다. 확인 불가를
clear로 바꾸거나 root만 검사하는 우회는 채택하지 않는다. 원본 SDD의 hash와
기존 관리기는 보존하며, 새 후보가 입증되거나 명시적인 계약 결정이 이루어지기
전에는 BLK-PWC-01과 REPLACE 보류를 유지한다.

## 조건부 방향 적용 기록

방향 승인과 재정합 뒤 runtime/probe/contract 및 시험을 분리했다. Windows 미지원
runtime과 실패 후보를 구분하며 required gate의 책임을 변경했다. macOS native
17건을 보완·검증한 후 Darwin 25.2.0/arm64/Node v26.4.0 한 profile을 runtime에
등록했다. backend 구성을 매번 확인하며 다른 profile은 무관측 unknown이다.
집중 실행은 runtime 대조를 포함해 36 PASS / 1 SKIP / 0 FAIL이다. 새 CI 전체
완료와 최종 source를 확인한 뒤 QUALIFY exit 판정을 마감한다. Windows 자동 자격이나
실제 worktree 삭제는 활성화하지 않았다.

### 최종 검증과 인계

검증 source는 ae0a6af4ee80b0b55ec37a86dc64d7569583e16f다. 전체 CI
[44091585161](https://github.com/Sangeok/stagekeeper/actions/runs/44091585161)의
8개 job이 통과했다. macOS native 17건과 Windows runtime/반례를 실제 환경에서
실행했으며, CI Mac의 Node v22.23.5 환경은 runtime 등록 범위 밖이라 R01은 해당
host에서 skip이다. 등록 profile의 R01은 local Darwin 25.2.0/Node v26.4.0에서 통과했다.
root/실효 UID 변경은 runtime 자격을 주지 않는다.

BLK-PWC-05는 이 한 profile에 한해 해소했다. 조건부 QUALIFY의 구현·검증은
통과했고 source는 아직 미병합 PR에 보존한다. Windows 자동 자격·다른 macOS/Node
조합으로 확대하지 않는다. 다음 산출물은 이 결과를 반영한 REPLACE 상세 계획이다.
