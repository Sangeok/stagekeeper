---
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-11-17"
updated-at: "2026-11-18"
approved-by: "user"
approved-at: "2026-11-18"
approval-scope: "본 CVO1 계획의 실제 구현·검증과 필요한 상위 SDD 기준·링크 정합. CVO2·CVO3, 수동 모델·설치 게이트, 병합·운영 배포 제외."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/proposals/active/ci-verification-code-organization.md"
  - "docs/proposals/active/dual-client-ci-parity.md"
  - "docs/architecture/test-organization.md"
  - "docs/architecture/test-writing.md"
  - "docs/architecture/verification.md"
  - "docs/architecture/shared-modules.md"
---

# CI 검증 코드 정리 — CVO1 상세 실행 계획

## Summary

CVO1은 설치 리허설에 모여 있는 공통 준비·Claude 연결 코드를 실제 소유 모듈로
추출하고, 현재 checkout을 소비하는 pipeline·Codex·배포 인수·DB 시험이 CLI 파일의
내부 구현을 가져다 쓰지 않게 한다. 고정된 이전 판 checkout을 실행하는 호환성
검증의 옛 import는 별도 계약으로 유지한다.
기존 CLI·export와 각 실행의 lifecycle은 보존한다. 새 경로의 CI·승격 선택은 이
단계에서 함께 연결한다.

작성 모드는 PHASE_PLAN, 위험도는 STANDARD다. 이 문서는 상위 SDD의
[Phase CVO1](./ci-verification-code-organization.md#phase-cvo1-공통-준비와-설치-연결의-소유권-분리)을 상세화한다.
CVO2의 기존 파일 이동·기록 Action 전환과 CVO3의 실제 설치·모델 인수는 실행하지 않는다.

## Source and Authority

- 상위 원본: [CI 검증 코드 SDD](./ci-verification-code-organization.md).
- 작성 시작 시 상위 문서 SHA-256:
  a61ea48ce9f59239a35cdde972f8dfbd0afb0308efe8ee09911fd3fba16ae9dd.
- 코드 기준: 7097582260e1a70324fb690795815cbc9fbaffff.
- 최초 작성 때의 origin/dev는 8e0f880c13c2a0dce02c9246c983dffff898bc77였다.
  당시에는 watch 시험 한 파일만 달랐지만 현재의 판단 근거로 사용하지 않는다.
- 2026-11-18 재검토 기준은 fetch 후 origin/dev의
  bce2bef8b5ff61962eb6e3b16419bb4aaaffb217이다. git show/diff/grep으로 이 tree를
  읽었으며 문서 worktree의 코드 HEAD는 변경하지 않았다.
- 기존 init·pipeline·Codex·DB fixture·Prisma helper의 소스는 재검토 기준에서도 같다.
  다만 새 shared-distribution 호출자·workflow, 작업 관리 명령, 문서 위치가 추가·변경됐다.
  구현은 이 변경을 포함하는 최신 dev에 문서를 보존해 정합시킨 뒤 시작해야 한다.
- 작업 브랜치: harness/ci-verification-code-organization-sdd.
- 작업 경로: /private/tmp/stagekeeper-ci-verification-sdd-20261117.
- 관리 task: 07d8bcf2-c3ef-4e43-a336-e4a6696a9c4b.
- 시작 시 상위 문서는 미추적 파일로 보존되어 있었고 열린 PR은 0건이었다.
- 계획 검토 당시 write set은 이 상세 계획 한 파일이었고 상위 SDD와 구현은 수정하지
  않았다. 이후 실제 구현 요청으로 CVO1과 필요한 C1/C2 정합이 승인됐다. 현재 실행 결과는
  Implementation Results를 따른다. 최초 검토 대상의 SHA-256은
  dab7d2a160a0fc2eb43f387204fd281d618a0f8b7b6c27a536a9c1dd66a8e4a2다.

상위 REQ·INV·CON·Phase·TASK·VFY가 canonical 정의를 계속 소유한다.
이 문서의 Change detail 및 Verification detail은 그 정의에 대한 보충 설명이며
같은 ID를 재정의하지 않는다. 추적성 검증은 상위 문서와 이 파일을 명시적으로 함께 입력한다.

## Selected Scope

| 구분 | CVO1의 책임 |
| --- | --- |
| 이번 단계에서 충족 | REQ-CVO-002의 기존 fixture/lifecycle 보존, REQ-CVO-008의 사전 거부·import 경계 |
| 이번 단계 경로에 대해 충족 | REQ-CVO-004. 이 단계에 새로 생기는 support·client-init 경로의 게이트 선택 |
| 보존·기여 | REQ-CVO-001의 기존 CLI/export. 전체 이동 이후의 호환성 완료는 CVO2가 소유 |
| 후속 단계 소유 | 기존 steps/eval/server 파일과 runtime 시험의 이동, .github record 배치·시험 탐색, 실제 native/model 인수 |
| 유지할 불변식 | INV-CVO-001~003 전체 |
| 적용 제약 | CON-CVO-001~006 전체 |

상위 SDD의 REQ-CVO-003/005/006/007까지 이 단계에서 완료했다고 보고하지 않는다.
다만 신규 시험 탐색과 제품 산출물 불변은 CVO1 변경의 회귀 조건으로도 확인한다.

### 허용 파일

승인된 추출 대상은 다음 7개다. 최초 설계 당시 제안 경로였으며 현재 구현 결과는
이 문서의 Implementation Results에 기록한다.

1. scripts/rehearsals/support/command-run.ts
2. scripts/rehearsals/support/smoke-database.ts
3. scripts/rehearsals/support/template-fixture.ts
4. scripts/rehearsals/support/repository-fixture.ts
5. scripts/rehearsals/support/repository-root.mjs
6. scripts/rehearsals/client-init/options.ts
7. scripts/rehearsals/client-init/claude-connection.ts

기존 수정 대상은 세 root 리허설과 최신 dev의 rehearse-shared-distribution.mjs,
이들과 직접 연결되는 아래 검증 파일,
tests/server/integration/script-database.test.ts, 기존 pipeline-smoke-steps.test.mjs,
관련 workflow의 paths, AGENTS.md의 promotion pathspec, verification.md의
해당 스크립트·실행 설명이다. 신규 시험은 뒤의 검증 계획에 지정한 네 파일로 제한한다.

### 금지·후속 범위

- 기존 client-init-smoke-steps, pipeline-smoke-steps, codex-init-eval, agent-eval-summary,
  gate-environment, smoke-server/listener의 파일 이동은 CVO2다. CVO1에서는 기존 위치의
  구현을 계속 사용한다.
- .github/actions/gate-record, plugin runtime 시험 세 개, plugin/evals, 제품 runtime,
  src·packages의 생산 코드, manifest·plugin/lib·DB migration은 변경하지 않는다.
- 새 모델·retry/timeout·시나리오·인증 경로·runner·OS 조합을 추가하지 않는다.
- 다른 active 제안의 행동 요구사항, private 저장소·SHA pin, 개인 설치는 수정하지 않는다.
- 수동·정기 workflow를 PR 자동 실행으로 바꾸거나 job/leg·권한·비용 정책을 바꾸지 않는다.
- 테스트를 위해 제품 public API를 추가하거나 새 전역 상태·DI framework를 도입하지 않는다.

### 변경 규모와 더 작은 대안

현재 계획의 기본 구현 변경은 최소 24개 파일이다. 신규 구현 7개와 신규 시험 4개,
기존 수정 13개(리허설 4개, init 시험·DB 시험·trigger 시험 3개, workflow 4개,
AGENTS·verification 2개)로 계산했다. 기존 pipeline/Codex 시험을 추가로 수정하거나
실행 결과 문서를 갱신하면 늘어난다. 새 제품 클래스·서비스는 0개이며 Run과 Smoke는
기존 두 클래스의 이동이다. 읽기만 한 파일은 이 수에 포함하지 않았다.

| 구조 대안 | 비용과 책임 | 결정 |
| --- | --- | --- |
| support 준비를 smoke-fixture.ts 하나로 합침 | 모듈 수는 줄지만 명령 실행·DB·template·Git fixture의 소비 이유와 IO 경계가 같은 모듈에 모임 | 실행 계약은 보존 가능하나 상위가 선택한 책임 분리보다 수정 범위를 명확하게 드러내기 어려워 채택하지 않음 |
| 상위의 support 5개 + options/connection 2개 | 파일은 늘지만 재사용 호출자와 변경 이유를 구분하고 CLI 역참조를 제거함 | 유지. 함수마다 파일을 더 만들거나 새 manager/registry를 추가하지 않음 |

더 작은 대안도 기술적으로 가능하다는 사실을 남긴다. 현재 선택의 근거는 코드 줄 수
감소나 실행 성능이 아니라 변경 소유권이다. repository-root는 단일 경로 값만 제공하고,
options 분리는 connection의 타입 → CLI 역참조를 막는 데 필요한 범위로 제한한다.
범용 barrel·flag 기반 만능 helper·두 곳의 상태 writer·시험 전용 제품 export는 금지한다.

## Current Code Reconciliation

| 작업 또는 계약 | 실제 코드 근거 | 상태 | 필요한 변경 |
| --- | --- | --- | --- |
| 공통 Run·DB·template 준비 | [init 진입점](../../../scripts/rehearsals/rehearse-client-init-smoke.ts)에 구현되어 있음 | 동작은 존재, 배치만 미충족 | 기존 구현을 추출하고 직접 소비자로 연결 |
| pipeline의 준비 소비 | [pipeline](../../../scripts/rehearsals/rehearse-pipeline-smoke.ts)이 init CLI에서 runtime 값 10개·타입 1개를 import | 미충족 | support와 client-init 소유 모듈로 import 분리 |
| Codex의 준비 소비 | [Codex](../../../scripts/rehearsals/rehearse-codex-macos.mjs)의 main 안에서 init CLI를 dynamic import | 미충족 | 기존 preflight 뒤에 support 모듈을 dynamic import |
| 최신 shared-distribution 소비 | [현재 checkout의 dynamic import와 이전 판 seed](https://github.com/Sangeok/stagekeeper/blob/bce2bef8b5ff61962eb6e3b16419bb4aaaffb217/scripts/rehearsals/rehearse-shared-distribution.mjs#L135) | 기존 계획에서 누락 | 현재 createFixtureUser/createRepository 소비만 새 모듈로 전환. 이전 판 cwd에서 실행하는 inline seed는 옛 import 유지 |
| DB fixture 검증 | [script-database.test.ts](../../../tests/server/integration/script-database.test.ts)가 실제 DB와 parent env 보존을 확인 | 검증은 존재 | import 목적지만 새 DB fixture로 연결 |
| root caller 정리 | 세 리허설의 finally와 각 짝 시험이 실패·취소를 다룸 | 보존 대상 | lifecycle을 root에 유지하고 기존 assertion 유지 |
| CLI 도움말·거부 | init/pipeline 시험에 main·parser 검사가 있음 | 일부 충족 | fresh child import/다른 cwd·export 호환 확인 보완 |
| rehearsal-cli.test.mjs | 주로 web/backlog 리허설의 별도 실행 계약을 검사 | CVO1의 직접 증거 아님 | 그 사례를 CVO1 통과로 세지 않고 전용 compatibility 시험 추가 |
| DB 연결 | [withPrisma](../../../scripts/lib/prisma.ts)가 호출마다 client를 열고 finally에서 닫음 | 재사용 | helper의 명시적 databaseUrl과 dynamic import 시점 유지 |
| 경로 선택 | [기존 trigger 시험](../../../scripts/rehearsals/pipeline-smoke-steps.test.mjs)이 실제 Git pathspec과 파일별 변경을 확인 | 확장 필요 | 새 디렉터리·파일을 같은 방식으로 검사 |
| private 소비 경로 | 상위·dual-client 문서에 기존 CLI 소비가 기록됨 | 최신 목록 미확인 | 기존 export·경로를 유지하며 확인 없이 삭제하지 않음 |
| 최신 CI·관리 계약 | 최신 dev의 workflow 8개·job 정의 14개·coverage 행 16개, npm run pr 진입점 | 과거 관측치와 다름 | 기존 명령·새 gate를 제거하거나 상위의 과거 개수로 되돌리지 않음 |

검토한 사실은 소스 관찰이다. 아래 구현 후 시험을 실제 실행했다는 뜻은 아니다.
환경 보존도 호출자별로 판단한다. Claude 리허설은 childEnv에 명시적 DB를 전달하고,
Codex main은 preflight 뒤 process.env.DATABASE_URL을 설정하는 현행 동작이 있다.
그 차이를 새 공통 helper가 없애거나 다른 실행에 전파해서는 안 된다.

## Design and Dependency Flow

~~~text
현재
init CLI  ── Run / DB / template / repository / Claude 연결
pipeline  ── import init CLI
Codex     ── dynamic import init CLI
배포 인수 ── 현재 checkout의 init CLI + 별도 이전 판 checkout의 init CLI
DB 시험   ── import init CLI

CVO1 이후
init CLI  ─┬─ support/{command-run,smoke-database,template-fixture,repository-fixture}
           └─ client-init/{options,claude-connection}
pipeline  ─── 같은 소유 모듈 직접 import
Codex     ─── 기존 preflight 이후 필요한 support만 dynamic import
배포 인수 ─── 현재 checkout의 DB/repository support만 dynamic import
DB 시험   ─── support/smoke-database 직접 import

기존 외부 import ── init CLI의 명시적 재수출 ── 동일 구현
이전 판 seed      ── 이전 판 checkout의 기존 init CLI ── 그 판의 구현
각 root main       ── 기존 실행 순서·signal·정리·summary 소유
~~~

CVO1이 끝났을 때 새로운 support/connection 모듈이 root CLI를 역참조하지 않는다.
타입도 예외가 아니다. 현재 checkout의 일반 구현은 직접 소비한다. 기존 경로의
호환 시험과 고정 이전 판 checkout을 실행하는 seed만 의도적으로 old export를 사용한다.
이전 판 코드에 아직 없는 신규 support 경로를 요구하지 않는다.

support는 단일 env·자원 관리자를 만드는 영역이 아니다. 각 모듈은 현재 함수의
입력·출력과 책임을 소유한다. 세 main의 userId·server·runnerStopped·summary 상태를
이 영역으로 끌어올리지 않는다.

## Change detail for TASK-CVO1-01

Canonical Task:
[TASK-CVO1-01](./ci-verification-code-organization.md#task-cvo1-01-재사용-준비-모듈-추출).

### 1. Run과 실행 결과

신규 command-run.ts로 Run, Command, Step, markerLine을 옮긴다.
외부 재사용 값은 Run이며 Command/Step은 필요한 모듈의 타입 참조용이다.
markerLine은 비공개 구현으로 유지한다.

보존할 인터페이스와 상태:

| 요소 | 보존할 계약 |
| --- | --- |
| Run(log, signal?) | log 경로와 선택 AbortSignal을 인스턴스가 소유 |
| steps, outputs, failure | 실행별 배열과 실패 단계. static/global로 공유하지 않음 |
| step(name, action) | callback 전에 signal 확인, 성공 pass 또는 실패 fail 기록, 기존 오류 재throw |
| command(file,args,cwd,env,timeout,outputFile?) | 기본 120000 ms, maxBuffer 16 MiB, windowsHide·stdio·출력 파일 처리·로그 형식 유지 |
| Command | code/stdout/stderr. spawn error 또는 status 부재는 기존 -1 처리 |
| succeed(...) | nonzero 결과를 markerLine과 함께 기존 오류로 전달 |

Run의 120000 ms 기본 명령 제한과 제품 role_command_exec의 최대 300000 ms는
서로 다른 계약이다. 이름을 통일하려고 제품 한도 상수를 가져오거나 값을 바꾸지 않는다.
template seed의 기존 300000 ms 명시 인자도 그대로 둔다.

init 진입점은 새 Run을 import하고 동일 symbol을 재수출한다. pipeline은 support를
직접 import하며 Codex는 현재 main의 동적 로딩 위치에서 가져온다.
기존 두 Run.command 사례는 support/command-run.test.ts로 옮기고 중복 실행하지 않는다.
root caller의 lifecycle 사례는 기존 파일에 남긴다.

### 2. DB 사용자 fixture

신규 smoke-database.ts가 아래 두 함수를 소유한다.

- createFixtureUser(login, tokenHash, databaseUrl): Promise<string>
- deleteFixtureUser(userId, databaseUrl): Promise<void>

두 함수는 기존처럼 함수 실행 안에서 ../../lib/prisma를 import한다.
withPrisma에 databaseUrl을 명시적으로 전달하고 환경 변수의 기본값으로 대체하지 않는다.
createFixtureUser의 user 생성 → userToken 생성과 반환 순서를 유지한다.
이번 추출에서 transaction·재시도·rollback을 새로 추가하지 않는다.
deleteFixtureUser의 기존 catch 및 cleanup 경고 의미도 그대로 둔다.

DB 안전 검사는 root main의 validateTestDatabase가 계속 소유한다.
helper로 옮긴다는 이유로 검사를 삭제하거나 main보다 뒤로 미루지 않는다.
실제 DB integration 시험은 새 helper를 직접 import해 같은 DB·행·env assertion을 유지한다.

### 3. Template 준비

신규 template-fixture.ts가 seedTemplates와 bootstrapSmokeTemplates를 소유한다.

| 함수 | 입력·출력과 보존할 실행 |
| --- | --- |
| seedTemplates | Run, templates, snapshot, childEnv → 기존 CLI stdout에서 full SHA 추출. 같은 seed 명령·300000 ms·repository cwd |
| bootstrapSmokeTemplates | databaseUrl/run/work/codeSha/requestId/workflowRun → template-cutover step, snapshot 파일, 같은 audit/evidence로 bootstrap |

상대 dynamic import는 ../../lib/prisma와 ../../../src/server/templates/api로 바뀐다.
DB 연결과 template API 호출은 실행할 때만 수행한다. snapshot의 파일명,
배타적 생성, 0600 모드, audit의 actor/environment/target 식별과 refusal 판정을 보존한다.
운영 template source를 읽거나 새로운 template API를 만들지 않는다.

### 4. Repository fixture와 root 계산

신규 repository-fixture.ts는 createRepository, osLabel 및 기존 git helper를 소유한다.
git helper는 Claude 연결 구현도 사용하는 scripts 내부 함수로 git 이름을 명시적으로 export한다.
이 함수의 trim·stdio·windowsHide·오류 전파를 바꾸지 않는다.

createRepository의 repo 경로·초기 main·autocrlf=false·테스트 작성자·origin·원격 HEAD,
package.json과 초기 commit 의미를 유지한다. commit SHA·시각 자체를 고정하지 않는다.
osLabel은 기존 platform-architecture 표시를 유지한다.

신규 repository-root.mjs는 repositoryRoot를 명시적으로 export한다.
파일 위치에서 ../../../를 해석한 checkout root를 기존 REPO와 같은 실제 경로로
정규화한다. 이 단계에서 새로 추출된 모듈과 init의 REPO만 이를 사용한다.
CVO2 대상인 smoke-server/listener와 Codex의 기존 root 계산을 일괄 바꾸지 않는다.

root 계산은 모듈 import의 파일 경로 읽기까지 허용한다. cwd 변경·env 쓰기·DB 초기화·
프로세스 실행을 수행하지 않는다. 다른 cwd에서 실행해도 grant-plan·seed CLI·archive가
호출자의 임의 디렉터리가 아니라 검증 대상 checkout을 사용해야 한다.
여기서 다른 cwd 시험은 검증 대상 checkout의 tsconfig.json을 명시한 실행 조건이다.
기존 CLI에 없는 자동 tsconfig 탐색이나 임의 cwd 지원을 새 기능으로 추가하지 않는다.

### 5. Options와 호출부 연결

client-init/options.ts로 Options, USAGE, parseArguments와 해당 정규식·옵션 목록을 옮긴다.
옵션의 범위, help 처리, 미구현 Codex/bundle 거부는 현재대로다.
CLI 파일은 명시적 import/re-export만 추가하고 main의 guard·오류 출력은 유지한다.

| 소비자 | CVO1 이후 직접 참조 |
| --- | --- |
| init CLI | options, command-run, smoke-database, template-fixture, repository-fixture, repository-root와 아래 Claude 연결 |
| pipeline CLI | Run, DB·template·repository 준비, Claude 연결. init CLI import 제거 |
| Codex main | command-run.ts, smoke-database.ts, template-fixture.ts를 현재 preflight 이후 dynamic import |
| shared-distribution main | 현재 checkout의 createFixtureUser는 support/smoke-database.ts, createRepository는 support/repository-fixture.ts에서 기존 위치의 dynamic import로 취득 |
| shared-distribution의 inline seed | command("previous-seed", ...)가 cwd: options.previous에서 실행하므로 이전 판의 기존 init CLI import를 유지 |
| script-database.test.ts | support/smoke-database |
| CLI 호환 시험 | 의도적으로 기존 root export와 새 모듈 export 모두 사용 |

Codex의 OS·loopback DB·새 evidence 디렉터리·fresh build 확인보다 앞에 동적 의존성을
올리지 않는다. 이 작업에서 static TS import로 바꾸거나 기존 env 설정 순서를 바꾸지 않는다.

shared-distribution의 CI·DB·checkout 검증과 log/save·users/fixtures/sessions/profiles
정리는 그대로 둔다. 변경은 현재 checkout의 두 symbol import뿐이다. 동일 파일의
inline seed 문자열을 일괄 치환하면 고정 이전 판에 없는 모듈을 요구하게 되므로 금지한다.
경계 시험은 실제 current import와 previous-seed 명령의 cwd를 구분한다.
해당 파일 전체를 import 검사에서 제외하거나 모든 문자열 import를 무조건 허용하지 않는다.

## Change detail for TASK-CVO1-02

Canonical Task:
[TASK-CVO1-02](./ci-verification-code-organization.md#task-cvo1-02-claude-연결-책임과-호환-export-분리).

### 1. Claude 연결의 범위

client-init/claude-connection.ts가 다음을 소유한다.

- Smoke 클래스 전체와 Plugin 타입.
- installPlugin, newUser.
- update, exportPlugin: root main이 계속 조립에 사용하는 scripts 내부
  export로 이동하되 기존 root 모듈의 공개 export 목록에는 새로 추가하지 않는다.
- SYNC, Connection, countLines, persistServer, projectState, pluginVersion 등 해당 구현만 쓰는
  helper는 새 파일의 비공개 요소로 유지한다.

Smoke 생성자의 run/repo/helperEnv/userId/databaseUrl/origin 필드와 모든 메서드의
시그니처·결과·오류를 보존한다. CVO1에서는 기존 위치의 client-init-smoke-steps.mjs와
gate-environment.mjs를 소비할 수 있다. 그 파일은 아직 호환 facade가 아닌 실제 구현이다.

Options는 같은 client-init의 options.ts에서 type-only import한다.
Run/Command는 support/command-run, git/osLabel은 support/repository-fixture,
repositoryRoot는 support/repository-root에서 가져온다. root CLI 타입을 역참조하지 않는다.

### 2. 시나리오의 관찰 가능한 순서

| 경로 | 보존할 순서와 조건 |
| --- | --- |
| github-branch 설치 | marketplace 등록 → plugin 설치 → 실제 checkout commit 검증 → cache generator 존재 확인 |
| export 설치 | 지정 commit의 Git archive → archive 해제 → 로컬 marketplace 등록 → plugin 설치 → 기존 exported plugin root 반환 |
| 최초 연결 | register → harness.json → dry-run → generate → 서버 설정 저장 → MCP 등록·연결 → token literal 비저장 확인 → project sync → commit |
| 신규 사용자의 재실행 | 관리 파일 불변 확인 → sync 시각 증가 → Pro 부여 → Pro dry-run/generate/sync |
| release 프로토콜 이전 판 업데이트 | 이전 연결 → cutover → 새 설치 → 기존 MCP 연결 확인 → dry-run/generate/sync |
| release 프로토콜 사용 판 업데이트 | cutover → 이전 연결 → 새 설치 → 기존 MCP 연결 확인 → dry-run/generate/sync |
| sync | 기존 child MCP 호출 → DB project/owner 조회·검증 → lock 버전별 설치 계약 확인 → sync 시각·roster 검증 |

이 표는 새 순서를 도입하지 않는다. 허용된 지원 helper의 추출로 현재 조건과 순서가
달라지는지 확인하기 위한 기준이다. 실제 사용자의 MCP 설정이나 shell profile을
이 문서 작성 또는 무모델 단위 검증에서 변경하지 않는다.

### 3. Root 조립과 공개 export 보존

init 파일에는 main, runSmoke, 실행 guard, 해당 실행의 signal·server·userId·record
생명주기를 남긴다. 설치 연결을 호출하는 이름은 같은 import binding으로 유지한다.
pipeline의 runPipelineSmoke와 Codex main/finally도 이동하지 않는다.

기존 init runtime export 13개는 다음과 같다.

~~~text
USAGE, parseArguments, Run, Smoke, osLabel, installPlugin, createRepository,
newUser, seedTemplates, bootstrapSmokeTemplates, createFixtureUser,
deleteFixtureUser, main
~~~

Options와 Plugin은 기존 type export 두 개다. runtime namespace 검사로 타입 보존까지
검증했다고 주장하지 않는다. 기존 type 소비자가 tsc를 통과하는 것도 확인한다.
wildcard export를 쓰지 않고 새 내부 helper를 기존 public namespace에 섞지 않는다.

이 단계 이후 현재 checkout의 일반 제품·리허설 구현은 init CLI를 라이브러리로 import하지 않는다.
CLI 호환 시험과 위에서 명시한 이전 판 seed는 예외다. 기존 공개 경로는 삭제하지 않으며
private 호출자를 바꿔야만 구현할 수 있으면 중단한다.

## CI Selection and Documentation

새 하위 경로가 생기는 커밋에 다음 선택을 함께 반영한다. 부모의 CVO2 완료까지
선택 갱신을 미루지 않는다.

CVO1의 추가 선택 집합은 두 디렉터리와 그 밖에 놓이는 새 시험 두 개다.

~~~text
scripts/rehearsals/support/**
scripts/rehearsals/client-init/**
scripts/rehearsals/rehearsal-compatibility.test.mjs
scripts/checks/rehearsal-boundaries.test.mjs
~~~

| 위치 | CVO1의 정확한 변경 |
| --- | --- |
| .github/workflows/client-init-smoke.yml | 기존 paths를 유지하고 위 선택 집합 네 항목을 추가 |
| .github/workflows/windows-role-runtime.yml | 위 네 항목 추가. OS·native 명령·required 설정은 변경 없음 |
| .github/workflows/macos-runtime-contracts.yml | 위 네 항목 추가. ARM/Intel·수동 probe 선택은 변경 없음 |
| .github/workflows/shared-distribution-acceptance.yml | pull_request.paths에 support/**와 디렉터리 밖 두 신규 시험 경로 추가. 현재 소비하지 않는 client-init/**는 추가하지 않음. 기존 push.paths·workflow_dispatch·trust/secret 조건은 유지 |
| AGENTS.md promotion pathspec | support·client-init은 디렉터리 경로로, 나머지 두 시험은 정확한 파일 경로로 추가 |
| pipeline-smoke-steps.test.mjs | 신규 파일 각각의 단독 변경이 promotion pathspec에 잡히는지 기존 임시 Git 방식으로 검사 |
| 제안 rehearsal-boundaries.test.mjs | 앞의 세 workflow는 PR의 네 항목, shared-distribution은 PR의 support와 두 시험을 검사. push.paths와 혼동하지 않고 이벤트별 기존 정책도 확인 |
| verification.md | 새 지원/연결 책임과 CVO1 소비 관계·실행 조건 설명. job/leg의 의미·coverage row 수는 유지 |

check에는 원래 paths 필터가 없고 agent-eval/pipeline-smoke에는 PR trigger가 없다.
이 사실을 유지한다. pipeline 선택은 promotion 규칙에서 다루며 수동 모델 게이트를
새 PR 자동 실행으로 만들지 않는다. private source pin은 CVO3/기존 소유 작업의 범위다.

shared-distribution의 PR는 기존 init 파일 변경을 선택하지만 dev push의 paths에는
그 파일이 없다. 신규 support를 PR에 연결하는 것이 기존 소비 책임의 보존이며,
같은 이유로 push 범위까지 늘리지는 않는다. 기존 trusted PR의 무모델 native 인수와
그 secret 미준비 시 BLOCKED 표시를 유지한다. 해당 인수의 존재를 새 모델 실행 승인으로
해석하거나 기존 workflow를 제거하지 않는다.

기존 scripts 재귀 glob이 새 .test.ts/.test.mjs를 발견하므로 CVO1에서 package.json에
새 runner를 추가할 필요는 없다. .github로 record 시험을 옮기는 일과 그 명령 변경은
CVO2다. 단, 실제 탐색 결과가 가정과 다르면 검증을 통과로 보고하지 않는다.

## Verification Detail

아래는 상위 VFY의 CVO1 적용 상세다. VFY ID와 관계는 상위 문서에만 정의한다.
이 절은 구현 전의 검증 명세이며 실제 수행 범위·결과는 Implementation Results를 따른다.

### Verification detail for VFY-CVO-01

Canonical:
[VFY-CVO-01](./ci-verification-code-organization.md#vfy-cvo-01-cli모듈-호환과-사전-거부).

- 기존 init/pipeline main·parser 시험을 유지한다. 기존 export를 통한 도움말·거부와
  options 모듈의 parser가 같은 구현인지 확인한다.
- 새 scripts/rehearsals/rehearsal-compatibility.test.mjs에서 fresh child process로
  기존 init·pipeline·Codex·shared-distribution과 신규 모듈을 import한다.
  invalid DB/인자와 다른 cwd를 사용하고 아래 관찰 절차로 side effect 부재를 확인한다.
- import가 filesystem 메타데이터를 읽는 것까지 금지하지 않는다. DB 연결·사용자
  설정 변경·설치·서버·모델 시작이 없음을 확인한다. 테스트 canary는 임시 디렉터리에 둔다.
- 기존 init runtime export 13개와 type 소비, Run/Smoke의 class identity, main의
  직접 실행 1회와 nonzero 거부 결과를 확인한다.
- 신규 support/repository-root의 결과와 fixture/seed/grant 호출 cwd가 같은 checkout인지
  확인한다. node/tsx loader는 해당 검증 checkout에서 설치된 경로로 해석한다.
  다른 cwd의 child에는 TSX_TSCONFIG_PATH를 같은 checkout의 tsconfig.json 절대 경로로
  지정한다. loader는 후보의 package 해석으로 선택하고 script·tsconfig는 후보의
  파일을 사용한다. 의존성 저장 경로의 물리적 prefix까지 같아야 한다는 새 제약은 두지 않는다.
- import 성공만으로 seed/bootstrap 보존을 판정하지 않는다. 같은 compatibility 파일의
  아래 무모델 호출 경계 시험을 수행한다. 실제 client template cutover는 부모 CVO3에 남긴다.
- 보호하는 결함: root를 cwd로 계산하거나 facade guard가 import에서도 실행되는 회귀.
  통과의 한계: 실제 Claude/Codex 설치·인증·모델 행동까지 증명하지 않는다.

관찰 절차는 기존 rehearsal-cli.test.mjs의 fresh child/preload 방식과 TypeScript/VM
도구를 재사용한다. child loader 전에 시험 전용 관찰기를 설치하고 지원되는
child_process·파일 변경·연결 시도를 기록하거나 거부한다. ESM named binding도
관찰되도록 기존 Node 내장 모듈 binding 동기화 방식을 사용한다. tsx cache 쓰기는
TSX_DISABLE_CACHE=1로 끄고, TSX loader는 cwd가 아닌 설치된 절대 경로로 해석한다.
테스트 자식의 TSX_TSCONFIG_PATH는 외부에서 상속된 값을 그대로 쓰지 않고 검증 대상
checkout의 tsconfig.json으로 명시한다. loader 경로만 고정하면 tsconfig의 경로 별칭까지
고정되는 것이 아니다. 관찰기 양성 대조군과 검증 대상 child는 이 실행 조건을 공유한다.
시험의 자식 프로세스를 띄우는 부모 launcher와 검증 대상이 시작한 자식을 구별한다.
관찰기가 주입된 canary 쓰기·spawn·connection 시도를 실제 검출하는 양성 대조군을
먼저 확인하고, import/help/거부 입력에서는 같은 event가 0임을 확인한다.
fixture child의 정리와 timeout은 시험이 소유한다. 외부 DB·설치 명령으로 관찰기를
시험하지 않는다.

무모델 adapter 검증은 신규 파일을 더 만들지 않고 compatibility 시험에 둔다.

| 실행 대상 | 입력·관찰 | 실패를 검출할 결함과 증거 한계 |
| --- | --- | --- |
| 실제 seedTemplates export | Run.succeed의 경계만 대체해 executable/args/cwd/env/300000 ms를 기록. 유효한 full SHA 출력·SHA 없는 출력·명령 실패를 입력 | cwd·인자·timeout·SHA 해석/오류 전파가 바뀌면 실패. seed CLI 자체의 DB 동작은 증명하지 않음 |
| 실제 bootstrapSmokeTemplates 함수 본문 | 설치된 TypeScript로 해당 source 함수만 CommonJS로 변환해 기존 VM 방식으로 실행. whitelist require로 withPrisma와 template API 경계만 대체하고 실제 임시 파일을 사용 | 명시 URL·snapshot 전달·audit/evidence·refusal·배타적 파일 쓰기의 변화 검출. 실제 transaction·SQL 성공을 주장하지 않음 |
| 현재/이전 판 소비 구분 | current dynamic import가 support를 가리키는지, previous-seed 문자열은 legacy 경로와 options.previous cwd의 조합을 유지하는지 확인 | 현재 소비 누락과 이전 판에 새 모듈을 요구하는 치환을 검출. 이전 판 실제 설치 성공은 CVO3 인수로 확인 |

bootstrap 사례는 성공, 이미 존재하는 snapshot 파일, API ok:false, API throw를 포함한다.
경로와 내용을 확인하고, snapshot이 이미 있으면 bootstrap 호출이 0임을 확인한다.
실패가 template-cutover step과 호출자에게 전달되는지도 확인한다. 함수 본문을 시험에
복사하거나 제품 API에 시험 전용 주입 인자를 추가하지 않는다. VM은 실제 source에서
추출하며 CommonJS 변환이 내놓은 require 경로를 whitelist로 검증한다.
모듈 전체의 실제 import 검증과 이 함수 호출 검증을 결합해 경로 해석과 행동을 구분한다.

별칭 준비 오류와 CLI 거부를 구분한다. 준비된 다른 cwd에서 --help는 0,
기존 unknown option은 각 CLI의 기존 거부 결과여야 한다. MODULE_NOT_FOUND로
main에 도달하지 못한 실행을 사전 거부 성공으로 세지 않는다. 실행 전 module
resolution이 실패하면 테스트 환경 준비 실패로 보고하며 제품의 옵션/guard를 바꾸지 않는다.

### Verification detail for VFY-CVO-02

Canonical:
[VFY-CVO-02](./ci-verification-code-organization.md#vfy-cvo-02-취소실패정리-보존).

- support/command-run.test.ts로 기존 timeout·출력 파일 사례를 옮긴다.
  추가할 최소 사례는 abort된 signal에서 step callback이 실행되지 않고 기존 fail 상태와
  오류가 유지되는지다. 실제 fixture 자식은 시험이 소유하고 종료한다.
  새 시험의 임시 경로는 저장소 규칙에 따라 realpathSync.native(tmpdir()) 아래에 만든다.
- init caller의 pass, stop-failure, scenario-and-stop-failure, start-failure,
  start-cleanup-failure, abort 사례를 유지한다.
- pipeline caller의 stopped, stop-failure, start-cleanup-failure 사례를 유지한다.
- Codex caller의 stopped, runner-live, stop-failure, start-cleanup-failure 사례를 유지한다.
- 각 실제 root 함수/finally를 읽는 기존 AST/VM 시험이 실제 실행 코드에 연결되어
  있는지 확인한다. 더미 함수나 복사한 테스트 전용 finally를 만들지 않는다.
- stop 실패 시 delete가 호출되지 않음, 원래 failure 보존, signal listener 해제,
  pipeline 봉인·Codex summary 저장의 기존 순서를 관찰한다.
- 기존 smoke-server.test.mjs의 실제 child/IPC/listener 사례도 회귀 실행한다.
- 보호하는 결함: 추출 과정에서 실패를 성공으로 덮거나 살아 있는 자원의 fixture를 지우는 회귀.
  VM의 관찰 결과를 native OS 전체 정리의 증거로 확대하지 않는다.

### Verification detail for VFY-CVO-03

Canonical:
[VFY-CVO-03](./ci-verification-code-organization.md#vfy-cvo-03-명시적-test-db-fixture).

- tests/server/integration/script-database.test.ts의 import를 새 helper로 바꾼다.
  기존 invalid parent DATABASE_URL, 실제 current_database(), user/token 생성,
  동일 DB의 사용자 삭제, parent env 불변 assertion을 그대로 유지한다.
- 실제 TEST_DATABASE_URL은 저장소 안전 검사를 통과한 별도 시험 DB여야 한다.
  DB가 없으면 통과로 처리하지 않고 이 검증을 미실행으로 남긴다.
- template-bootstrap.test.ts는 기존 제품 API의 인수를 보존하지만 이 helper의
  실제 호출 증거와 동일하지 않다. withReleaseDatabase가 만든 schema를
  connectionString만 전달하는 smoke helper에 임의로 연결하지 않는다.
  Prisma adapter schema와 raw SQL search_path를 함께 지정하는 계약이 다르기 때문이다.
- 이 단계에서 그 차이를 해결하려고 withPrisma나 production template API를 수정하지 않는다.
  helper의 실제 cutover 인수는 기존 전용 disposable smoke DB를 사용하는 CVO3가 소유한다.
- 보호하는 결함: 새 helper가 명시적 URL을 놓치고 parent DB에 쓰는 회귀.
  API·DB 경계 대체 시험은 VFY-CVO-01의 adapter 관찰이며 이 실제 DB 증거를 대체하지 않는다.

### Verification detail for VFY-CVO-05

Canonical:
[VFY-CVO-05](./ci-verification-code-organization.md#vfy-cvo-05-변경-경로와-os-선택).

- pipeline-smoke-steps.test.mjs의 기존 임시 Git fixture를 재사용해 신규 구현 7개와
  이번 단계의 신규·이동 시험 파일을 하나씩 수정한다. 실제 promotion pathspec의
  git diff 결과가 해당 파일을 포함하는지 확인한다.
- 공통 prefix나 old CLI가 목록에 있다는 assertion만으로 완료하지 않는다.
- rehearsal-boundaries.test.mjs에서 각 workflow의 pull_request.paths 블록을 읽는다.
  기존 세 workflow에는 신규 구현 7개·시험 4개가 선택되어야 한다. shared-distribution은
  support 구현/시험과 두 별도 시험을 선택하고 client-init만의 변경은 새로 선택하지 않는다.
  이 workflow의 push.paths에 support를 추가하지 않았다는 이벤트별 음성 대조도 유지한다.
  임의 YAML 전체 parser나 GitHub Actions 대체 실행기를 구현하지 않는다. 해석할 수 없는
  paths 모양은 통과시키지 않는다. 이 정적 대응 검사를 실제 Actions 실행으로 기록하지 않는다.
- 관련 없는 문서 파일은 현재와 같은 방식으로 pathspec의 음성 대조군으로 사용한다.
- verify:ci-coverage로 기존 OS·job·record legs의 의미가 유지되는지 함께 확인한다.
  재검토 기준은 workflow 8개·job 정의 14개·coverage 행 16개다. 상위의 작성 당시 개수를
  맞추려고 새 job/행을 제거하지 않는다. 후속 변경이 있으면 현재 정의와 다시 대조한다.
- 보호하는 결함: support 파일만 바뀌었을 때 필요한 CI가 실행되지 않는 회귀.

### 시나리오 연결 시험과 탐색

제안 client-init/claude-connection.test.ts는 실제 update 함수와 임시 plugin manifest,
제어 가능한 Smoke 협력 객체로 release 이전/이후 두 cutover 순서를 확인한다.
fake가 실제 설치 성공을 증명하지 않는다는 한계를 남긴다. 현행 parser·결과 판정의
시험을 새 파일마다 기계적으로 복제하지 않는다.

신규 시험 목적지는 다음 네 개다.

~~~text
scripts/rehearsals/support/command-run.test.ts
scripts/rehearsals/client-init/claude-connection.test.ts
scripts/rehearsals/rehearsal-compatibility.test.mjs
scripts/checks/rehearsal-boundaries.test.mjs
~~~

기존 root 시험은 CLI·caller 계약을 계속 검사한다. Run 사례를 새 위치로 옮겼다면
old 파일에서 제거해 이중 등록을 막는다. node:test reporter의 실제 실행 결과를
파일·사례 대응표와 비교하며 단순 총 개수만으로 보존을 판정하지 않는다.

### 선택 Phase의 요구–작업–검증 대응

| 요구사항 | canonical Task | CVO1 관찰 | canonical VFY |
| --- | --- | --- | --- |
| REQ-CVO-002 | TASK-CVO1-01, TASK-CVO1-02 | 기존 Run 실패·fixture DB·root 정리·update 순서 보존 | VFY-CVO-01, VFY-CVO-02, VFY-CVO-03 |
| REQ-CVO-004 | TASK-CVO1-01, TASK-CVO1-02 | 이번 단계의 신규 경로별 CI/promotion 선택 | VFY-CVO-05 |
| REQ-CVO-008 | TASK-CVO1-01, TASK-CVO1-02 | lazy DB import·사전 거부·import 무쓰기·root 해석 | VFY-CVO-01, VFY-CVO-02, VFY-CVO-03 |
| REQ-CVO-001 보존·기여 | 두 Task의 호환 경계 | 기존 CLI/export 유지. 전체 CVO2 완료와 구분 | VFY-CVO-01 |

새로운 canonical REQ/Task/VFY는 만들지 않았다. 관계를 바꿔야 하는 발견이 있으면
이 표에서 의미를 재정의하지 말고 상위 수정 제안과 readiness 영향을 기록한다.

## Commands and Execution Order

아래는 구현 승인 후 사용할 명령이다. 현재 문서 작성에서 실행한 명령이 아니다.

1. 아래 진입 조건 C1/C2를 확인하고 최신 source·상위 snapshot·겹치는 PR를 재대조한다.
   준비된 checkout에서 기존 관련 시험 결과를 먼저 기록하고, 실패가 있으면
   해당 baseline 원인을 구분한다. 오래된 문서 worktree만 기준으로 구현하지 않는다.
2. TASK-CVO1-01의 support·options를 추출하며 재수출·직접 import·경로 선택을
   같은 작업에 반영한다. 현재 root lifecycle을 그대로 둔다.
3. TASK-CVO1-02의 Claude 연결을 추출하고 old export surface를 보존한다.
4. 아래 focused 시험과 실제 DB integration을 실행한다. 과거 결과로 대체하지 않는다.
5. 저장소의 공통 quality gate·실제 변경 파일 목록·문서·payload 불변을 대조한다.

~~~bash
npm run db:generate
node --import tsx --test scripts/rehearsals/rehearse-client-init-smoke.test.ts scripts/rehearsals/rehearse-pipeline-smoke.test.ts scripts/rehearsals/rehearse-codex-macos.test.mjs scripts/rehearsals/smoke-server.test.mjs scripts/rehearsals/pipeline-smoke-steps.test.mjs scripts/rehearsals/support/command-run.test.ts scripts/rehearsals/client-init/claude-connection.test.ts scripts/rehearsals/rehearsal-compatibility.test.mjs scripts/checks/rehearsal-boundaries.test.mjs
npm run test:server:integration
npm run verify:fsd
npm run verify:server
npm run verify:shared
npm run test:architecture
npm run check
npm test
npm run test:web
npm run test:server
npm run build
npm run verify:ci-coverage
~~~

의존성이 준비되지 않은 checkout은 기존 lockfile로 npm ci를 먼저 수행한다.
generated client가 필요한 baseline 시험도 db:generate 뒤에 실행한다.
위 명령 묶음은 검증 checkout의 repository root에서 실행한다. 다른 cwd를 검사하는
하위 프로세스만 절대 loader/script 경로와 해당 checkout의 TSX_TSCONFIG_PATH를
명시한다. 로컬 주 checkout의 tsconfig를 후보 worktree에 대신 적용해서는 안 된다.
integration 명령에는 승인된 안전한 TEST_DATABASE_URL이 필요하며 자동으로
운영 URL을 찾거나 사용자 env 파일의 비밀값을 출력하지 않는다.

이 단계에 model/설치/full smoke dispatch 명령을 추가하지 않는다.
일반 PR가 자동 실행하는 기존 CI는 현재 정책을 유지한다. 실제 플랫폼·모델 검증과
동일 후보 인수의 완료 판정은 상위 CVO3가 소유한다.
해당 CVO1 검증에 필요한 Node/DB 준비가 없으면 완료를 주장하지 않는다.
CVO3에만 필요한 실제 모델/private runner 부재를 CVO1의 새 차단 조건으로 끌어오지 않는다.

상위의 출하 불변 제약도 추정으로 끝내지 않는다. 구현 시작 SHA와 후보의 tracked 파일을
기존 scripts/lib/plugin-payload.mjs의 동일 predicate로 분류하고, 출하 대상 경로와
각 Git blob ID가 같은지 비교한 결과를 기록한다. 새 모듈이 scripts에 있다는
사실만으로 검사를 생략하지 않는다. 현행의 이 검증은 파일 집합·바이트 비교이며
실제 두 OS bundle 인수까지 완료했다는 뜻이 아니다.

## Documentation and Approval Boundary

구현 단계에서는 새 모듈의 책임과 소비 관계를 verification.md의 기존 scripts 설명에
반영한다. 현행 architecture가 이미 허용하는 책임별 추출을 위해 새 전역 layer나
예외 import를 도입하지 않는다. public API를 쓰는 신규 template helper를
server 내부 참조 예외 목록에 추가하지 않는다.

parent SDD의 CVO1 부분과 이 계획의 실행 결과가 달라지면 변경 의미를 먼저 기록한다.
이 상세 계획 작성 요청으로 parent 파일 수정까지 승인되었다고 해석하지 않는다.
이 문서의 승인 metadata는 구현 승인에만 사용하며 작성 완료와 구분한다.

상위의 2026-11-17 파일 목록·CI 개수는 당시 관찰값이다. 이번 계획은 그 이후 추가된
직접 소비자와 이벤트별 선택을 반영하지만 canonical 요구사항을 바꾸지 않는다.
상위 SDD의 공유 모듈 제안 링크는 최신 dev에서
[completed 문서로 이동](https://github.com/Sangeok/stagekeeper/blob/bce2bef8b5ff61962eb6e3b16419bb4aaaffb217/docs/proposals/completed/2026-11-17-shared-modules-and-plugin-distribution.md)했다.
현재 worktree의 링크 검사 통과를 최신 dev에서도 유효한 것으로 보고해서는 안 된다.
이 링크와 상위 관찰 기준은 후속 구현 요청의 C1/C2 정합 범위에서 갱신했다.
아래 검토 이력의 링크 누락 관찰은 당시 결과이며 현재 실행 결과와 구분한다.

작업 관리도 최신 dev의 npm run pr 계약을 따른다. branches:cleanup/worktrees 명령과
옛 writer 소스는 현재 dev에서 제거됐다. 오래된 checkout의 writer를 재실행하거나
관리 상태를 수동 변경하지 않는다. 이 문서 task는 현재 control의 읽기 전용 status에서
working으로 확인됐으며 새 task를 만들거나 branch를 바꾸지 않았다.

## Readiness and Stop Conditions

**판정: READY — 2026-11-18 후속 구현 요청으로 승인됐으며 C1/C2를 아래와 같이 해소했다.**

| 조건 | 충족 증거와 중단 지점 |
| --- | --- |
| C1 최신 source·caller 정합 | 문서와 기존 작업을 보존하며 bce2bef의 dev로 같은 작업 브랜치를 fast-forward했다. 현재 caller 4개·관련 workflow 4개를 구현 기준으로 사용한다 |
| C2 상위 문서 기준·링크 정합 | 후속 구현 승인 범위에서 상위의 이동된 제안 링크·현재 관찰값을 갱신했다. 상위+자식을 포함한 최신 tree 문서 검사를 수행하고 결과를 실행 기록에 남긴다 |

새 증거는 canonical 행동 요구사항의 변경을 요구하지 않는다. 이전의 조건부 판정과
검토 이력은 아래에 보존하며, 이번 실행의 승인·조건 해소와 구분한다.
private 환경의 BLK-CVO-01은 상위 CVO3의 완료 증거를 제한하며 이 단계의 보존 가능한
추출을 막지는 않는다. 실제 DB 검증은 CVO1 완료에 필요하므로 실행 환경이 없으면
완료 판정을 보류한다.

중단 조건:

- latest source가 지원 조합·인자·return/exit·DB/정리 정책을 바꿔 상위와 달라진 경우.
- 이전 export를 제거하거나 제품 public API·runtime·private caller 수정이 필요한 경우.
- production DB·개인 설치·모델 실행 없이는 로컬 추출 회귀를 검증할 수 없는 경우.
- 새 내부 모듈이 root CLI를 역참조하거나 순환·전역 state가 생기는 경우.
- 신규 파일만 바뀌었을 때 기존 필수 게이트가 선택되지 않는 경우.
- 기존 행동 실패를 파일 이동으로 숨기거나 skip을 늘려 통과시키려는 경우.

rollback은 CVO1의 helper·연결·import·재수출·필터·문서 변경을 함께 되돌린다.
schema 변경이나 운영 data rewrite는 없으므로 DB 복원·사용자 설치 변경은 하지 않는다.
실행 중인 자기 fixture가 있다면 현재 소유 정리 절차를 먼저 따르고 다른 실행의 자원은 보존한다.

## Completion Criteria

- 현재 checkout의 네 리허설과 DB integration이 init CLI의 내부 준비 함수를 소비하지 않는다.
  shared-distribution의 이전 판 seed는 old path + previous cwd 계약을 유지한다.
- 기존 runtime export 13개·type export 2개·CLI 경로·guard·에러/summary가 유지된다.
- helper의 상태는 실행별이며 DB import와 실제 연결 시점이 앞당겨지지 않는다.
- Run·root caller·실제 test DB·update 순서·새 경로 선택의 계획된 시험이 실행됐다.
- 기존 steps/server/eval 파일·record Action·runtime 시험은 CVO2의 원래 위치에 남아 있다.
- 새 모듈이 shipped payload에 들어가지 않고 제품 생산 파일 변경이 없다.
- 코드·Task·REQ·VFY별 실행 결과, baseline 실패, skip/미실행, source SHA와 정리 상태를 보고한다.
- CVO1 완료 뒤 CVO2를 자동으로 시작하지 않는다.

## Validation Results

문서 검증과 구현 후 시험을 분리한다. 아래 첫 표는 최초 작성 시의 결과이며
2026-11-18 최신 tree에서 제품 시험을 실행했다는 뜻이 아니다.

| 항목 | 상태 | 결과 |
| --- | --- | --- |
| 소스·호출자·기존 assertion 재대조 | Executed | Run·Smoke·실제 DB·caller finally·기존 pathspec 검증과 소유권 확인 |
| 최초 작성 당시 dev와 checkout 차이 | Executed, 2026-11-17 | 당시 watch 시험 한 파일. 현재 차이로 사용하지 않음 |
| 상위 문서 보존 | Executed / PASS | 저장 후 SHA-256이 시작 값과 동일. 상위 정의·내용 변경 없음 |
| 상위+상세 계획 표준 추적성 검사 | Executed / PASS | 2개 파일, 상위 REQ 8/8 연결 유지, 중복·dangling·관계 오류 0, 경고 0. CVO1의 의미 범위는 위 대응표로 별도 확인 |
| 신규 두 문서를 포함한 링크·metadata·공백 검사 | Executed / PASS | Markdown 231개·상대 링크 1,226개·보고서 59개, 문제 0. metadata 확인, diff --no-index --check의 공백 진단 0; 신규 파일 차이의 exit 1은 구분 |
| 의미 검토 | Executed | Task별 함수·상태·직접 소비자·old export·lazy import·root lifecycle 대조. 설치 채널별 처리와 sync 순서, 하위 디렉터리 밖 신규 시험 두 개의 게이트 선택을 보완. DB fixture 증거와 실제 template/model 인수의 한계를 구분 |
| 코드 수정·제품/DB/native/model 시험 | Not executed | 문서 작성 범위 밖. 계획한 검증을 PASS로 기록하지 않음 |

상위에는 CVO2/3의 미래 요구사항과 downstream blocker가 포함되어 있으므로 strict를
이 두 파일 전체에 적용하지 않는다. 표준 bundle validation과 위 CVO1 전용 대응표의
의미 검토를 사용한다. 자식만 검증하려고 상위 canonical ID를 복제하지 않는다.

## Engineering Review — 2026-11-18

최초 검토에서 개선점이 있었다. 아래 네 항목을 찾은 뒤 이 파일에 반영했다.
사용자의 개선 요청은 이 계획의 보완 권한이며 구현·상위 문서 변경 승인과 구분한다.

| ID | 분류·확신 | 최초 근거와 영향 | 결정·현재 상태 |
| --- | --- | --- | --- |
| F1 | INFORMATIONAL, 10/10 | 작성 당시 caller 목록에 최신 shared-distribution의 current import와 previous-seed가 없음. 전자를 놓치거나 후자를 일괄 치환할 수 있음 | 최신 pinned source와 네 번째 현재 caller 반영. 이전 판 seed 예외를 실행 cwd까지 한정해 보존. 계획 수정 완료 |
| F2 | INFORMATIONAL, 10/10 | 신규 workflow의 PR는 기존 init 경로만 선택하며 새로운 support 경로가 없음. 기존 계획의 세 workflow 검사로는 이 누락을 못 잡음 | 네 번째 workflow의 PR 선택과 별도 push 정책을 명시. current 소비가 없는 client-init을 이 gate에 추가하지 않음. 계획 수정 완료 |
| F3 | INFORMATIONAL, 9/10 | import 성공과 caller VM에서 대체한 준비 함수만으로 seed/bootstrap adapter의 URL·args·snapshot·오류 전달을 증명하지 못함 | 기존 도구로 실제 export/source 함수 경계 시험과 side-effect 관찰 양성 대조군을 구체화. 새 제품 주입 API·실제 모델 없이 검증. 계획 수정 완료 |
| F4 | INFORMATIONAL, 10/10 | 최소 24개 파일의 변경 규모·더 작은 대안 비교가 없고, 과거 source/링크를 근거로 READY 선언 | 변경 집합·축소 대안·CI 비용/성능 한계와 C1/C2를 명시. 상위 문서는 보존하며 실행 준비를 조건부로 수정 |

### 네 영역의 검토

- Architecture: 각 새 모듈의 실제 소비자, current/previous checkout 방향, lazy import,
  CLI 재수출을 대조했다. 새 runtime layer나 전역 manager는 필요하지 않다.
- Code quality: 기존 구현의 분리만 수행하고 Run/Smoke 상태·private helper·타입 소유자를
  명시했다. 단순 문법 유사성 때문에 Claude와 Codex의 env/lifecycle을 통합하지 않는다.
- Tests: 아래 증거 범위와 adapter·import guard·trigger의 누락을 보완했다.
  기존 테스트를 삭제하거나 VM을 실제 DB/native 증거로 재분류하지 않는다.
- Performance: 함수 추출로 명령 수·DB 연결 수·timeout·model 호출 수를 바꾸지 않는다.
  새 PR 경로는 기존 consumer의 검증을 다시 선택하므로 CI 실행 횟수에 영향이 있을 수 있다.
  4번째 gate의 불필요한 client-init/push 확장을 피했다. 시간·비용 절감은 측정하지 않았으며
  이 계획의 효과로 주장하지 않는다.

### 증거 범위와 반대 가설 검토

~~~text
현재 caller + 추출 모듈 [제안]
  ├─ import/help/거부       → 호환 시험 + 관찰기 양성 대조 [계획]
  ├─ seed/bootstrap adapter → 실제 export/실제 source 함수, IO 경계 대체 [계획]
  ├─ DB user/token         → 기존 실제 DB integration 유지 [미실행]
  ├─ root cleanup          → 기존 VM assertion + smoke-server 자식 시험 [미실행]
  └─ 실제 설치·cutover·AI   → CVO3의 candidate 인수 [이 단계에서 미실행]
~~~

기존 DB integration은 지정 DB와 env 보존을 직접 확인하는 강한 근거지만 새 helper
연결로 재실행해야 한다. root VM 시험은 해당 finally 분기의 관찰 근거이며 실제
native 프로세스 종료 전체를 증명하지 않는다. 새 adapter 시험도 SQL transaction을
증명하지 않는다. 이 구분을 유지한 상태에서 미검증 실제 인수를 CVO3에 둔다.

반대 가설도 확인했다. 기존 facade를 그대로 두면 네 번째 caller는 당장 실행될 수
있지만 CVO1의 직접 소비 목표를 충족하지 못하고 새 support만 바뀐 PR의 gate도
선택되지 않는다. 모든 옛 import를 없애면 이전 판 검증이 깨진다. 모든 gate의
push 경로까지 넓히면 기존 실행 정책을 바꾸므로 선택하지 않았다.
대신 현재 consumer만 옮기고 이전 판 예외·이벤트별 선택을 한정했다.

### 재검토 검증 결과

| 검사 | 상태 | 범위 |
| --- | --- | --- |
| 최신 source 및 실제 소비자 조사 | Executed | bce2bef 기준 git show/grep/diff. 기존 추출 대상과 신규 shared-distribution의 두 실행 문맥 확인 |
| CI 정의 집계 | Executed | 기존 readWorkflow/readCoverageTable로 최신 Git 객체를 읽음: workflow 8, job 14, coverage 행 16. 원격 job 실행 결과가 아님 |
| VM 시험 방식의 전제 확인 | Executed | 설치된 TypeScript 5.9.3으로 실제 bootstrap 함수의 CommonJS 변환만 메모리에서 수행. 진단 0, dynamic import가 whitelist 가능한 require로 변환됨. 함수·DB·모델은 실행하지 않음 |
| 상위+자식 표준 추적성 | Executed / PASS | 2개 파일, REQ 8/8 연결 유지, 오류·경고 0. 전체 parent의 미래 단계까지 실행 가능하다는 판정이 아님 |
| 현 worktree 링크·metadata·공백 | Executed / PASS | 신규 두 문서 포함 Markdown 231개·링크 1,226개·보고서 59개, 문제 0. 공백 진단 0; 신규 파일 차이의 exit 1은 구분 |
| 최신 tree 위의 상위+자식 상대 링크 | Executed / 1 missing | 상위 SDD의 active/shared-modules-and-plugin-distribution.md 링크 1개가 최신 tree에 없음. C2에 반영했으며 자식에는 누락 없음 |
| 상위 SHA-256·허용 write set | Executed / PASS | 상위 해시가 시작 값과 동일. 변경한 파일은 이 상세 계획 하나이며 두 문서는 계속 미커밋 상태 |
| 관리 상태 조회 | Executed, read-only | 최신 관리 도구가 있는 retained control에서 npm run pr -- status 조회. 이 task는 working이며 파일·branch 정리나 activation을 수행하지 않음 |
| 이전 정리 명령 | Unavailable | 최신 control의 branches:cleanup은 Missing script. 폐기된 writer로 되돌아가지 않았으며 미커밋 문서와 기존 task/worktree/branch를 보존 |
| 독립 리뷰·제품 실행 | Not executed | 별도 리뷰어는 요청되지 않아 자체 반대 가설 재검토만 수행. 제품·DB·native·모델 검증을 수행하지 않음 |

현 범위의 계획 개선은 반영됐으며 C1/C2는 실행 전에 해소할 외부 선행 조건이다.
그 조건을 숨기고 무조건 READY 또는 구현 검증 완료로 보고하지 않는다.

## Engineering Review — 2026-11-18 재검토

이번 재검토의 입력 문서 SHA-256은
bb11f5278058a280452edad1a6d945ac4801101a24108a7d141abdbaff7b7110이다.
기존 F1~F4를 새 발견으로 다시 세지 않았다. 원격 dev를 다시 fetch한 결과 검토 기준
bce2bef 이후 변경은 없었다. 이번에도 처음부터 개선점이 없었던 것은 아니며 아래
검증 환경의 누락 1건을 재현해 수정했다.

| ID | 분류·확신 | 관찰과 영향 | 수정 |
| --- | --- | --- | --- |
| F5 | INFORMATIONAL, 10/10 | 다른 cwd에서 절대 tsx loader와 기존 init CLI를 실행하면 @/server/projects/api를 찾지 못해 help 전에 exit 1. 기존 계획대로면 환경 오류를 CLI 거부/호환 실패로 오인할 수 있음 | 테스트 child에 후보 checkout의 TSX_TSCONFIG_PATH를 명시하고 후보 기준의 loader 해석·script/tsconfig 일치와 main 도달 여부를 판정 조건에 추가 |

기존 읽기 전용 --help를 두 실행 조건으로 비교했다. baseline 코드와 추출 대상은
현재 검토 기준에서도 같은 파일이다. 로컬 Node v26.4.0·tsx 4.23.12·cwd /private/tmp에서
절대 loader/script만 지정한 실행은 MODULE_NOT_FOUND / exit 1, 같은 checkout의
tsconfig.json까지 지정한 실행은 usage 출력 / exit 0이었다. TEST_DATABASE_URL은
비우고 DATABASE_URL은 유효하지 않은 fixture 문자열을 전달했다. 설치·DB·모델
시나리오는 실행하지 않았으며 이 관찰을 CI Node 22에서의 실행 결과로 확대하지 않는다.

수정은 시험 환경과 판정의 명확화다. production CLI의 옵션·root 계산·지원 cwd
계약을 확장하거나 상위 REQ를 변경하지 않는다. code/architecture 경계·현재/이전 판
호출·이벤트별 CI 선택·검증 비용 범위에서는 새 변경 사유를 찾지 못했다.
C1/C2는 이전과 같은 선행 조건이며 이번 수정으로 해소됐다고 주장하지 않는다.

| 검사 | 상태 | 결과 |
| --- | --- | --- |
| 추가 발견 재현 | Executed | 절대 loader만 지정 / 같은 checkout tsconfig도 지정한 --help의 exit 1 / 0 차이 확인 |
| 상위+자식 표준 추적성 | Executed / PASS | 2개 파일, REQ 8/8 연결 유지, 오류·경고 0 |
| 현 worktree 링크·공백 | Executed / PASS | Markdown 231개·링크 1,226개·보고서 59개, 문제 0·공백 진단 0. 최신 dev 기준 상위 링크 누락 1개는 기존 C2로 유지 |
| 상위 원본 보존·write set | Executed / PASS | 상위 SHA-256이 기존 값과 동일. 이 상세 계획만 수정했고 제품 소스는 변경하지 않음 |
| 구현·DB·native·모델 검증 | Not executed | 읽기 전용 help 실행 외에는 수행하지 않음 |

## Implementation Results — 2026-11-18

후속 사용자 요청으로 CVO1의 실제 구현·검증을 수행했다. 문서 전용이었던 앞의
작성·검토 이력과 구분한다. 같은 작업 브랜치를 bce2bef으로 fast-forward해 C1을
해소하고, 승인 범위에서 상위 SDD 링크·현재 관찰 기준을 갱신해 C2를 해소했다.
최신 tree와 신규 두 문서를 포함한 링크 검사도 통과했다.

| Task | 실제 변경 | 결과 |
| --- | --- | --- |
| TASK-CVO1-01 | support 5개와 options를 추출하고 현재 pipeline·Codex·shared-distribution·DB 시험을 직접 연결 | 구현·로컬 검증 완료 |
| TASK-CVO1-02 | Claude 연결을 추출하고 기존 root CLI·runtime export 13개·type export 2개를 보존 | 구현·로컬 검증 완료 |
| 공통 연결 | 새 경로의 PR 선택 4개 workflow와 promotion pathspec·정적 경계 시험·architecture 설명 갱신 | 기존 job/leg·push·secret 정책 유지 |

기존 구현의 함수·클래스·타입 24개를 baseline과 AST로 대조했다. 명시적 export와
필요한 상대 import 경로 조정 외에 본문 차이는 없었다. 이 대조는 동작 시험을 대신하지 않는다.
shared-distribution의 이전 checkout seed는 기존 import와 cwd를 그대로 유지한다.
pluginVersion은 실제 root 소비가 없어 연결 모듈 내부 함수로 유지했다.

검증 환경은 macOS arm64, Node 22.23.3, 잠금 파일로 설치한 의존성과 별도
PostgreSQL 18.4다. CI와 같은 node:test·tsx·Prisma 명령을 사용했다.
아래 개수는 각 runner의 최종 summary이며 서로 중복되는 suite를 합산하지 않는다.

| 검증 | 결과 | 범위·근거 |
| --- | --- | --- |
| 변경 전 관련 시험 | 68 pass, 0 fail | 추출 전 baseline |
| 추출 직후 기존 시험 | 68 pass, 0 fail | 함수 배치 변경 후 기존 assertion 보존 |
| CVO1 집중 시험 | 87 pass, 0 fail, 0 skip | 호환·명령·update·caller 정리·CI 경로 선택 |
| npm run test:server:integration | 185 pass, 0 fail, 0 skip | 전용 stagekeeper_test_cvo1 DB migration과 실제 fixture 검증 |
| verify:fsd / verify:server / verify:shared | PASS | 아키텍처 경계 예외 추가 없음 |
| npm run check 최종 재실행 | 521 pass, 0 fail, 5 skip | lint·타입·문서·CI coverage·script 시험. 원래 플랫폼/qualified runtime 조건의 skip |
| npm run test:architecture 최종 재실행 | 406 pass, 0 fail, 4 skip | 일반 Node에서도 새 mjs 호환 시험 실행 |
| npm test | 613 pass, 0 fail, 42 skip | STAGEKEEPER_RELEASED_READERS=required. Windows/packaged native runtime 등의 기존 조건부 skip |
| npm run test:web | 839 pass, 0 fail, 0 skip | 기존 웹·src 시험 |
| npm run test:server | 190 pass, 0 fail, 2 skip | fresh-build 전용 2건은 다음 별도 실행에서 확인 |
| npm run build 재실행 | PASS | production build·Prisma 생성·타입 검사 완료 |
| fresh build manifest 검사 | PASS | 기존 workflow와 같은 세 env flag·fresh 필터. 실제 fresh 사례 11개 통과; runner summary 31에는 파일 수준 항목도 포함 |
| CI coverage | PASS | 14 job 정의·16 행, 기존 OS/leg 의미 유지 |
| 출하 payload | PASS | baseline 대비 출하 대상 87개 파일의 경로·Git blob 동일, 제품 src/plugin/packages/prisma 변경 없음 |

처음 새 시험을 연결할 때 observer가 tsx의 parent IPC를 제품 연결로 오인했고,
test:architecture의 일반 Node가 TS parameter property를 strip-only로 읽어 실패했다.
설치된 esbuild service만 식별하고 정확한 loader pipe에는 연결 없이 ENOENT를
반환하도록 구분했다. 실제 API는 tsx/cjs/api로 읽어 두 시험 명령 모두에서 실행했다.
양성 대조군으로 실제 파일·프로세스·연결 효과가 여전히 검출되는지 확인했다.
Next 타입에서 필요한 NODE_ENV도 시험 fixture에 명시했다. 실패를 skip으로 바꾸지 않았다.

첫 build는 컴파일·타입·정적 페이지 생성 뒤 기존 Next 16.4.2의 SecurityFatalError
업데이트 알림으로 exit 1이었다. 같은 명령의 재실행은 exit 0이었다. package와 lockfile은
변경하지 않았으며 이 기존 의존성 보안 알림을 CVO1 수정으로 해결했다고 보고하지 않는다.

관련 VFY-CVO-01/02/03/05의 CVO1 범위를 검증했다. CVO2의 전체 배치 전환,
VFY-CVO-08/09/10의 모든 실제 OS·설치·모델 인수나 운영 배포는 수행하지 않았다.
위 skip을 해당 환경의 인수 통과로 세지 않는다. 검증에 사용한 임시 PostgreSQL은
정상 종료했고 status에서 실행 중인 서버가 없음을 확인했다.
로컬 로그는 /private/tmp/stagekeeper-cvo1-db.49JCcV에 보존했다.

## Completion or Closure Notes

CVO1 소스 변경과 로컬 검증은 완료됐으며 검토·통합을 위해 pending / approved를
유지한다. PR 정보와 보존 commit은 작업 결과에서 보고한다. 병합·배포는 수행하지
않으며 작업 worktree와 branch는 후속 검토를 위해 유지한다. CVO2를 자동 시작하지 않는다.
