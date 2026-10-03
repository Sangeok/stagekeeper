---
status: "pending"
stage: "blocked"
proposal-size: "standard"
created-at: "2026-10-03"
approved-by: "requesting-user"
approved-at: "2026-10-03"
approval-scope: "후속 '구현해 그러면' 지시에 따라 C0–C3의 로컬 제품 소스·private template·문서·검증 코드를 구현한다. C0 미해제는 실제 지원 인증과 배포를 차단하며 소스 구현을 중단하는 조건으로 적용하지 않는다. 운영 DB seed·배포·전역 보안 설정 변경·C4 자동 watch는 별도 범위다."
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "docs/architecture/README.md"
  - "docs/architecture/system-overview.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/invariants.md"
  - "docs/architecture/verification.md"
  - "docs/conventions/product-copy.md"
  - "docs/proposals/completed/2026-10-03-local-watch-executor.md"
  - "plugin/skills/init/references/reconciliation-contract.md"
  - "docs/test-reports/README.md"
  - "docs/test-reports/template.md"
  - "docs/test-reports/active/dual-client-runtime-report.md"
---

# Claude Code 지원을 유지하는 Codex 실행 및 교차 클라이언트 재개

## Summary

Stagekeeper의 서버와 실행 원장은 공통으로 유지하고, 현재 Claude Code 실행 어댑터에 Codex 어댑터를 추가한다. Claude Code의 설치·초기화·역할 실행·watch 기본 동작을 유지하면서 Codex에서도 계획, 독립 검증, 구현, 승인 이후 재개, acceptance까지 같은 파이프라인을 실행하는 것이 목표다.

핵심 인수 시나리오는 **Claude Code가 승인 대기에서 멈춘 뒤, 웹에서 승인하고, 같은 작업 디렉터리를 Codex로 열어 승인 다음 단계부터 이어가는 것**이다. 반대 방향도 지원한다. 서버 상태와 저장된 산출물로 작업을 복구하며, 기존 대화나 로컬 도구 권한을 옮기는 방식은 사용하지 않는다.

기본 실행·명시적 재개를 먼저 구현하고, Codex 자동 watch는 별도 조건부 단계로 둔다. C0 후보 실패 이후 사용자의 후속 구현 지시에 따라 C1–C3의 로컬 제품 소스와 private template 변경을 구현했다. 실제 Codex에서 역할별 도구 제한과 독립 검증이 성립하는지 확인해야 하므로, 이 문서는 완성된 제품 지원이나 배포 준비 완료를 선언하지 않는다. C0의 실패·blocked 이력은 보존하며 DB seed·배포·실제 모델 인수는 미실행이다.

## Goal

### US-DUAL-01: 도구를 바꾸어도 같은 승인된 작업을 계속한다

사용자로서 Claude Code와 Codex 중 원하는 도구로 Stagekeeper를 사용하고, 승인 대기 지점에서 도구를 바꿔도 이미 제출한 계획·승인·실행 기록을 다시 만들지 않고 이어가고 싶다.

성공 기준:

- 기존 Claude 설치·init·실행·watch가 계속 동작한다.
- Codex가 같은 MCP 서버와 private template을 이용해 전체 기본 실행 주기를 완료한다.
- 양방향 승인 지점 재개가 같은 BoardItem·PipelineRun과 승인된 commit을 유지한다. 같은 entry의 열린 AgentRun은 재사용하고, 기존 AgentRun 기록은 보존한다.
- 미승인, 변경된 산출물, 잘못된 토큰, 역할 격리 실패 시 실행을 중단하고 필요한 조치를 안내한다.

## Proposal Size

`standard`. 클라이언트 배포, REST/MCP 계약, private template 렌더링, 자격 증명, 역할 격리, 로컬 동시 실행, 생성 파일 공존 및 제품 안내에 걸친 변경이다. 보안 경계와 실행 원장에 영향을 주므로 설계 검토 강도는 HIGH-RISK로 적용한다.

## Current State

### 조사 기준과 권위

2026-10-03 읽기 전용 조사 기준:

| 구분 | 관찰한 기준 | 해석 |
| --- | --- | --- |
| Public 저장소 | HEAD `133bcff3b2d6a3eda3068a9506ed70b2e9871ca8`, `harness/account-usage-token-management` | 현재 작업 트리의 관련 소스도 읽었다. 구현 시작 시 최신 승인된 `dev`에서 재확인한다. |
| Private template 저장소 | `plugin/templates`, HEAD `95ace9d70b63cc8598ab229e2fe1138467f11728` | 별도 Git 저장소이며 public 저장소에서 gitignore된다. public PR만으로 template 배포가 완료되지 않는다. |
| 로컬 도구 | Codex CLI `0.160.0`, Claude plugin manifest `0.4.1` | 조사 환경의 버전이다. 호환 범위는 실제 실행 검증 후 정한다. |
| 기존 watch 제안 | `completed/2026-10-03-local-watch-executor.md` | 코드 완료 기록이다. 장시간 실제 실행·호스팅 캐시 검증은 별도 보고서에 남은 항목을 확인한다. |

기준 권위는 `AGENTS.md`, `docs/architecture/`, 현재 프로토콜과 도메인 불변식이다. 이 제안서의 신규 경로와 계약은 승인 전까지 미래 설계다. 조사 당시 다른 작업의 proposal 이동·삭제, 완료 문서 및 watch 보고서 수정이 있었으며 이를 이번 제안의 변경으로 취급하지 않는다.

### 관찰한 구현과 재사용할 기반

| 영역 | 관찰한 구현 | 설계에 주는 의미 |
| --- | --- | --- |
| 서버 및 인증 | Next.js/Prisma 기반. MCP agent endpoint와 owner endpoint가 분리되고 프로젝트·사용자 범위 토큰을 검증한다. | Claude 모델 API에 종속되지 않는다. Codex는 기존 인증 경계를 재사용한다. |
| 실행 원장 | `AgentRun` 조회는 project/agent/key 및 pipeline 위치 기준이며 client 식별자가 없다. receipt와 cursor CAS로 원장 갱신을 보호한다. | 다른 유효 토큰으로 같은 열린 실행을 찾을 수 있다. 후속 호출자는 step 원장에 기록한다. |
| 승인 및 파이프라인 | owner의 gate 결정, BoardItem, PipelineRun, plan commit, handoff가 서버에 저장된다. | 웹 승인 후 다른 클라이언트가 `pipeline_next`로 현재 위치를 다시 조회할 수 있다. |
| 절차 공급 | 초기화는 agent stub을 생성하고 `agent_next`가 private template의 한 step씩 반환한다. | 전체 실행 절차를 로컬 역할 파일에 복제할 필요가 없다. |
| Claude 어댑터 | `plugin/skills/`, `.claude/agents/`, `CLAUDE.md` managed block, `CLAUDE.runbook.md`에 의존한다. | 현재 형태 그대로 Codex 호환이라고 주장할 수 없다. |
| 로컬 watch | `harness-watch.mjs`는 모델 없는 poller다. Claude skill이 background task 완료 신호를 받아 main-loop를 깨운다. | poller 자체와 호스트의 깨우기 기능을 분리해야 한다. |
| 로컬 잠금 | common Git 디렉터리의 watch state/lock/guard, session과 policy 및 ownership 확인을 사용한다. | Codex에 별도 잠금을 만들면 기존 Claude watch와 충돌할 수 있다. |
| 생성 파일 보호 | `manifest.mjs`가 hash로 사용자 수정을 보호한다. `buildLock(targets)`는 현재 target 중심으로 lock을 만든다. | 두 클라이언트의 생성 파일 항목을 함께 보존하도록 확장해야 한다. |
| 런북 hash | `runbookVersion(body)`는 입력 원문을 그대로 해시한다. Claude init과 seed가 각 호출·저장 경계에서 CRLF를 정규화하며 `runbookStale`은 DB body를 기존 함수로 비교한다. | Codex의 정규화 hash를 추가하면서 기존 Claude 함수·호출 경계·stale 판정을 변경하지 않는다. |
| 제품 안내 | 연결 명령과 다음 단계 일부가 Claude Code를 전제로 한다. | 실행 옵션별 연결·재개 안내를 추가해야 한다. |

주요 근거 파일: `src/server/mcp/{auth,tools}.ts`, `src/server/agents/{next,runs,run-query,vars}.ts`, `src/server/pipeline/{run-query,board-query,run-rules}.ts`, `src/server/runbook.ts`, `packages/core/{deliver,manifest,render,runbook}.mjs`, `plugin/bin/{harness-init,harness-watch}.mjs`, `plugin/skills/{init,watch}/`.

### 후속 구현 결정과 현재 작업 트리

public 기준은 `origin/dev` `9675a3efdaf12bb7c419d11c4164beaa55c89821`, branch는
`harness/codex-dual-client-support`다. private HEAD는 조사 기준과 같고 source/test 변경은 별도
미커밋 작업 트리다. 아래 결정은 후속 사용자 지시에 따라 구현한 소스 계약이며 C0 통과 주장이 아니다.

- client 선택·Codex echo/hash·전량 bundle 검증·단계 pre-render·공통 원장 재개를 서버/core에 연결했다.
- `.codex-plugin`의 init/run/resume과 fresh App Server helper를 추가했다. 모델 없는 config/read에서
  상속된 MCP/plugin 이름과 shell 설정 key만 가져와 차단하고, 두 번째 host의 effective policy를 대조한다.
  기존 설정 map이 병합되는 것을 실제 0.160.0 config/read로 확인했으므로 빈 map만으로 제거되었다고 가정하지 않는다.
- 새 role에는 실제 parent credential 대신 localhost 일회성 capability만 준다. PM 파일 도구 차단,
  scout web search, read-only review/scratch, dev workspace/readOnly와 공통 메타데이터 보호를 named policy로 구성한다.
  permission profile의 access는 공식 enum `read/write/deny`다. 실제 model/kernel 시험은 아직 필요하다.
- Codex child의 Git metadata는 **read-only**다. commit 정책이 yes여도 child 자체는 commit하지 않고
  현재 receipt로 handoff한다. main loop/owner가 실제 권한에서 commit한 후 명시적으로 계속한다.
  Codex-only handoff `resume` projection과 `dispatch --handoff-commit`가 같은 열린 run·role/key·준비 파일·commit을 확인한다.
- verifier briefing에는 `requiredVerificationPaths`만 허용하며 board의 plan/commit과 완전한 owner package를
  별도로 얻는다. final role report를 parent에 반환하고 main loop가 계획 파일에 추가한 뒤 자신의 검증·acceptance를 수행한다.
- 공통 session helper를 구현하고 업데이트된 Claude watch는 `--start --managed`로 lifecycle metadata를 쓴다.
  새 stop은 stopping만 기록하며 실제 종료 뒤 release한다. legacy 기본 start/stop shape는 보존한다.
- 양쪽 init·lock 공존·private graph 불변·소스 렌더와 제한 seed/restore 코드를 구현했다.
  init의 `files-written`, MCP 연결의 `connected`, 실제 runtime 준비 완료를 구분한다.

실제 host·DB·브라우저·설치·양방향 승인 재개 증거와 C0 미해제 blocker는 아래 완료 조건 및 report에 남긴다.
소스 구현을 허용한 이번 지시가 운영 등록·seed·배포나 실패 후보의 자동 승인 우회를 허용한 것은 아니다.

### Codex 기능 근거와 미확인 경계

아래 공식 문서를 조사했다. 문서상 지원과 Stagekeeper 조합에서 실제 검증된 지원을 구분한다.

- HTTP MCP의 URL 및 환경 변수 bearer token: [MCP 문서](https://learn.chatgpt.com/docs/extend/mcp#streamable-http-servers). 로컬 CLI의 `mcp add --help`에도 `--url`, `--bearer-token-env-var`가 있다.
- 프로젝트 역할 정의 `.codex/agents/*.toml`, 역할별 지침과 설정: [custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents). 생략한 도구·sandbox 설정은 부모로부터 상속될 수 있으므로 실효 권한을 검증해야 한다.
- MCP 도구 allowlist와 하위 agent 설정: [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference). 파일 작성만으로 owner tool 차단이나 중첩 agent 차단을 증명하지 않는다.
- `.agents/skills/` 검색 및 이름 중복 처리: [skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills). 같은 이름의 패키지를 자동 병합한다고 가정하지 않는다.
- `.codex-plugin/plugin.json`과 skill 경로 선언: [plugin 구조](https://developers.openai.com/plugins/build/plugins#plugin-creator-output). 한 배포물의 Claude/Codex manifest 공존과 helper 경로는 아직 실제 설치로 확인하지 않았다.
- thread/turn 제어 및 interrupt: [App Server API](https://learn.chatgpt.com/docs/app-server#api-overview). 별도 runner의 후보이며, 이미 열린 임의의 Codex 앱 대화를 자동으로 깨우는 기능의 증거는 아니다.

독립 검증 역할의 새 문맥, 부모의 실효 권한 override, 실제 패키지 발견 경로, background 완료 후 main-loop 재진입은 선행 검증 대상으로 남긴다.

## Scope

포함:

- 기존 Claude 지원 보존, Codex 배포·초기화·MCP 연결·역할 실행·명시적 재개.
- 동일 서버 원장을 이용한 양방향 승인 지점 재개와 필요한 산출물 검증.
- client별 runbook, 공통 private step, 역할 격리, 생성 파일 공존, 로컬 실행 소유권.
- 연결·재개 안내, 기본 실행의 인수 시험, 호환 배포 및 롤백.
- 조건부 후속 Phase C4의 Codex 자동 watch 설계와 실제 기능 검증.

제외:

- Claude/Codex 대화 기록·내부 추론·진행 중 tool call 이전.
- 한 도구의 로컬 실행 권한을 다른 도구에서 자동 승인하는 기능.
- cloud에서 사용자 저장소의 모델 작업을 실행하는 서비스.
- 새로운 Project 전용 client 필드, 실행 클라이언트를 의미하는 `executor.kind` 변경, 파이프라인 graph 재설계.
- 별도 clone 사이의 분산 파일 잠금, 변경된 worktree 자동 정리, 자동 gate 승인·push.

## Requirements

### REQ-DUAL-001: 기존 Claude 기본 동작 보존

WHEN 기존 클라이언트가 client를 생략하거나 `claude`를 지정하면, 시스템 SHALL 기존 Claude 연결·생성 경로·역할·runbook·watch 동작을 유지한다. 기존 raw runbook hash 함수와 호출자의 정규화·stale 판정도 보존한다.

### REQ-DUAL-002: Codex 설치 및 연결

WHEN 사용자가 Codex 초기화를 선택하면, 시스템 SHALL 검증된 Codex 패키지·역할·runbook을 준비하고 기존 HTTP MCP에 연결하는 정확한 명령을 제공한다. 토큰 값은 프로젝트 생성 파일이나 helper/MCP 등록 명령 인수에 넣지 않는다. 기존 사용자 token 공개·저장 흐름은 CON-DUAL-005를 따른다.

### REQ-DUAL-003: Codex 전체 기본 주기

WHEN 준비된 Codex 세션에서 파이프라인 실행을 요청하면, 시스템 SHALL 기존 정책에 따라 계획, 독립 검증, 구현, 보고와 acceptance를 완료할 수 있게 한다.

### REQ-DUAL-004: 양방향 승인 지점 재개

WHEN 한 클라이언트가 승인 대기에서 멈추고 owner가 웹에서 승인한 뒤 다른 클라이언트에서 재개를 요청하면, 시스템 SHALL 현재 원장을 조회하여 같은 작업과 승인된 계획의 다음 단계부터 진행한다. 기존 proposal·승인·실행을 중복 생성하지 않는다.

### REQ-DUAL-005: 미승인 대기 보존

WHILE 필요한 gate가 승인되지 않았으면, 시스템 SHALL 대기 상태와 승인 위치를 안내하고 gate 뒤의 작업을 실행하지 않는다.

### REQ-DUAL-006: 재개 산출물 검증

WHEN 재개에 필요한 계획·보고·commit 또는 작업 파일이 누락되거나 현재 상태와 불일치하면, 시스템 SHALL 원인과 복구 조건을 알리고 해당 작업 실행을 중단한다. 사용자 변경을 자동 reset·stash·commit하지 않는다.

### REQ-DUAL-007: 인증과 로컬 권한 경계

WHEN 같은 프로젝트에 접근 가능한 다른 유효 토큰으로 재개하면, 시스템 SHALL 기존 열린 실행을 유지하면서 실제 호출자를 기록한다. IF 토큰이 만료·폐기되거나 범위가 다르면, 시스템 SHALL 거부한다. 로컬 도구 권한은 현재 호스트에서 확인한다.

### REQ-DUAL-008: 독립 검증의 실효성

WHEN plan-verifier를 실행하면, 시스템 SHALL 필요한 자료만 전달한 독립 문맥과 저장소 쓰기가 차단된 실효 권한으로 검증한다. IF 호스트가 이를 보장하지 못하면, 시스템 SHALL 성공한 독립 검증으로 처리하지 않는다.

### REQ-DUAL-009: 역할별 최소 도구

WHEN 역할을 실행하면, 시스템 SHALL 기존 역할 allowlist에 해당하는 도구만 제공하고 owner tool 및 중첩 agent 실행을 차단한다.

### REQ-DUAL-010: 새 조회와 receipt 기반 복구

WHEN 클라이언트가 재진입하면, 시스템 SHALL `pipeline_next`와 outcome 없는 `agent_next`로 현재 entry·step·receipt를 얻는다. IF 제출 receipt가 오래되었으면, 시스템 SHALL 재조회하며 다른 위치에 이전 결과를 재제출하지 않는다.

### REQ-DUAL-011: 같은 로컬 저장소의 실행 소유권

WHEN 지원되는 foreground 또는 watch 실행이 common Git 디렉터리를 점유하고 있으면, 시스템 SHALL 다른 클라이언트의 새 실행을 거부하고 현재 소유 세션을 안내한다. ownership을 잃은 세션은 새 작업을 시작하지 않는다.

### REQ-DUAL-012: 양쪽 초기화 공존

WHEN 지원되는 공통 생성기로 Claude와 Codex를 어느 순서로 초기화하든, 시스템 SHALL 다른 클라이언트의 생성 파일·lock 항목·설정을 보존한다. 사용자가 수정한 파일은 기존 보호 규칙으로 skip 또는 명시적 충돌 처리한다. dual 저장소 재초기화에는 양쪽 생성기를 호환 버전으로 업데이트해야 한다.

### REQ-DUAL-013: 초기화 실패와 재시도

IF 초기화가 일부 파일 쓰기 또는 후속 동기화 이후 실패하면, 시스템 SHALL 완료된 부분과 실패한 부분을 구분하여 알린다. 재시도는 생성 파일 보호를 유지하고 거짓 완료 상태를 만들지 않는다.

### REQ-DUAL-014: 명시적 runtime 호환성

WHEN Codex가 서버와 실행 절차를 교환하면, 시스템 SHALL client·protocol 호환 응답과 Codex runbook hash를 확인한다. IF 서버·template이 지원하지 않거나 hash가 없거나 잘못되었으면, 시스템 SHALL Claude 절차로 묵시적으로 대체하지 않고 중단한다.

### REQ-DUAL-015: 두 클라이언트의 제품 안내

WHEN 연결 또는 다음 단계 안내를 표시하면, 시스템 SHALL Claude 기본 안내를 유지하며 Codex 연결·명시적 재개 안내를 제공한다. 안내 선택은 인증 범위나 서버의 파이프라인 상태를 바꾸지 않는다.

### REQ-DUAL-016: 대기·한도·오류의 종료 조건

WHEN gate, handoff, 사용량 한도, 인증 실패 또는 반복 통신 오류로 진행할 수 없으면, 시스템 SHALL 정책에 맞게 대기하거나 종료하고 즉시 무한 재시도·자동 토큰 발급으로 우회하지 않는다.

### REQ-DUAL-017: 설치된 패키지와 template 확인

WHEN 초기화 또는 독립 검증을 시작하면, 시스템 SHALL 실제 로드한 helper·역할·필수 검증 skill의 경로와 버전을 확인한다. 불완전하거나 다른 동명 패키지는 준비 완료로 인정하지 않는다.

### REQ-DUAL-018: 조건부 Codex 자동 watch

WHERE Codex 자동 watch를 제공하는 경우, WHEN poller가 진행 가능한 작업을 발견하면, 시스템 SHALL 검증된 완료 신호 또는 로컬 runner로 실행을 재개한다. 기능 검증 전에는 명시적 재개만 안내하고 자동 재진입을 약속하지 않는다.

### REQ-DUAL-019: 취소 및 늦은 이벤트

WHEN 사용자가 stop하거나 ownership 확인에서 상실을 발견하면, 시스템 SHALL 이후 새 dispatch·결과 제출 요청·watch 재설정을 중단한다. 늦은 완료 신호로 새 작업을 시작하지 않으며 이미 실행 중인 agent의 중단 여부는 따로 확인한다. 지원되는 공통 어댑터의 중단 요청은 잠금을 유지하며, 자식 종료 확인 후 별도 반납 동작을 수행한다.

### REQ-DUAL-020: 사용량 및 실행 기록 보존

WHEN 기존 열린 실행을 다른 클라이언트로 재개하면, 시스템 SHALL 기존 실행을 재사용하고 재개만으로 신규 AgentRun 사용량을 중복 부과하지 않는다. 새 entry의 정상 실행과 usage cap 판정은 기존 서버 규칙을 따른다.

## Invariants and Constraints

### INV-DUAL-001: 하나의 영속 실행 정체성

BoardItem·PipelineRun·AgentRun과 논리적 역할 이름은 공유한다. client는 실행 위치나 agent 이름에 추가하지 않는다.

### INV-DUAL-002: 승인 및 검증 정책 유지

owner gate, 독립 검증, 결함 반복에 따른 hold, acceptance의 기존 다섯 확인 항목은 유지한다. main-loop가 사용자 승인이나 독립 reviewer를 대신하지 않는다.

### INV-DUAL-003: 서버가 절차를 공급한다

양쪽 client는 같은 step graph·step ID·전이·`requires`를 사용한다. 로컬 역할 파일에는 진입 지침과 권한만 넣고 전체 private step 본문을 내려 쓰지 않는다.

### INV-DUAL-004: 승인된 산출물 근거 보존

승인된 plan commit과 보고 근거를 임의로 다른 commit으로 대체하지 않는다. 새 commit이 필요하면 기존 handoff와 사용자 승인 규칙을 따른다.

### INV-DUAL-005: 원장 동시성의 범위

receipt/cursor CAS와 서버 transaction은 원장 갱신을 보호한다. 파일 편집의 상호 배제나 이미 발생한 tool 부작용의 취소까지 보장하지 않는다.

### CON-DUAL-001: 승인 범위와 작업 트리 보호

현재 요청은 이 문서에 따른 실제 코드 구현이다. 구현 범위의 기준은 front matter이며 각 Phase의 선행 조건과 stop point를 유지한다. 원격 `dev` 존재와 기준을 확인한 뒤 `harness/<topic>`에서 작업하고 PR은 `--base dev`로 연다. 기존 사용자 변경을 보존한다.

### CON-DUAL-002: 저장소 구조와 원본 소유권

backend는 `src/server`, 순수 정책은 `packages/core`, product frontend는 `src/fsd`, route는 `src/app`에 둔다. core 변경은 plugin lib 동기화로 반영한다. private template은 별도 원본 저장소와 seed 절차를 거친다. application 구현 전 관련 architecture와 설치된 Next.js 가이드를 읽는다.

### CON-DUAL-003: client와 권한의 분리

client는 고정 enum `claude | codex`이며 표현과 실행 어댑터 선택에만 사용한다. 토큰 범위, owner 권한, Project 상태, pipeline 위치, `executor.kind = local | routine`의 의미를 바꾸지 않는다.

### CON-DUAL-004: 호스트 기능의 실제 증거

CLI help, TOML 또는 manifest 존재만으로 지원을 선언하지 않는다. 실제 로드·실효 도구·쓰기 차단·문맥 독립성·완료 신호를 검증한다. 확인되지 않은 환경 변수나 API를 설계의 확정 기반으로 사용하지 않는다.

### CON-DUAL-005: 자격 증명과 설정 보호

plugin/helper가 소비하는 자격 증명은 환경 변수로 전달하며 로그·제안서·배포물·프로젝트 생성 파일·MCP 등록 명령 인수에 토큰 값을 넣지 않는다. 기존 토큰 공개 화면의 일회성 값 표시·셸 설정 명령과 사용자가 선택하는 hu 토큰 영구 저장은 현재 정책대로 유지한다. 이 예외는 `connectCommands`/`saveCommands`/`profileLine`의 사용자 전달 흐름에만 적용하며 agent briefing이나 진단 출력으로 확장하지 않는다. 프로젝트 및 사용자 범위를 그대로 검증한다. `.codex/config.toml`, `AGENTS.md`, 사용자의 MCP 설정을 통째로 덮어쓰지 않는다.

프로젝트 trust와 `.codex` 등 보호 경로 쓰기에 호스트의 승인이 필요한 환경은 정식 권한 요청 흐름을 따른다. 다른 경로·API로 우회하지 않으며, 승인 거부 또는 미완료를 초기화 성공으로 처리하지 않는다.

### CON-DUAL-006: 로컬 잠금의 한계

같은 common Git 디렉터리에서 새 어댑터를 통하는 실행만 공통 잠금으로 제어한다. 옛 수동 세션·별도 clone·이미 dispatch된 agent는 사용자가 중단 여부를 확인해야 한다. `--force`는 그 agent들을 자동 취소하지 않는다.

### CON-DUAL-007: 실행 정책과 모델 선택

새로운 commit·proposal 실행 허용은 현재 세션의 명시적 정책으로 기록한다. 서버에 저장된 owner 승인은 계속 유효하되 로컬 도구 허가는 상속하지 않는다. Claude의 `sonnet`을 특정 Codex 모델로 강제 치환하지 않는다.

### CON-DUAL-008: 검증·배포 증거 구분

unit·integration·실제 CLI·브라우저·장시간 watch 결과를 구분해 기록한다. 테스트 성공을 실제 배포 승인으로 취급하지 않는다. private revision, 서버, plugin의 호환 조합과 캐시 상태를 기록한다.

## Proposal

### 1. 공통 서버 + 두 실행 어댑터

서버는 작업·승인·다음 step을 결정하고, 로컬 어댑터는 연결, 파일 생성, 역할 실행, 현재 세션의 권한 및 재개를 담당한다. 두 클라이언트는 같은 MCP URL, 프로젝트, 논리적 agent 이름과 파이프라인 key를 사용한다.

```text
Claude Code skills/agents ─┐
                          ├─ HTTP MCP ─ shared pipeline/approval/AgentRun ─ DB
Codex skills/agents ───────┘                    │
                                      shared private step templates
             │
     same checkout / generated docs / approved commits / local ownership
```

서버에 클라이언트별 BoardItem 또는 AgentRun을 새로 만들지 않는다. 클라이언트를 바꿀 때 기존 `executor.kind`도 변경하지 않는다. MCP agent/owner endpoint, 14개 agent tool과 entitlement·rate limit·usage cap 규칙을 재사용한다.

### 2. 고정 client 계약과 지원 확인

신규 순수 모듈 `packages/core/client-runtime.mjs`에 client enum, 기본값, runbook source/output path, 고정 runtime descriptor를 정의한다. 서버와 plugin은 이 원본을 공유하고 `sync:plugin-lib`로 복사본을 동기화한다. client 문자열을 template 경로·명령·권한 설정에 직접 삽입하지 않는다.

| 접점 | 추가 계약 | 호환성 |
| --- | --- | --- |
| `/api/templates` | 선택 query `client`; Codex 지원 응답에 runtime 정보 포함 | 생략 시 Claude 집합. 필수 Codex bundle이 없는 요청 언어는 Codex만 명시적 오류. |
| `pipeline_next` | 선택 input `client`; 기존 `runbook`에 해당 client의 hash | Codex는 client와 유효 hash 필수. 호환 검사 후 기존 상태 처리. |
| `agent_next` | 선택 input `client`; 실행 응답의 client/protocol 확인 | client는 렌더링에만 영향. run 조회·receipt 검증·outcome 기록 규칙 유지. |
| `deliverable` 및 template 변수 | client별 runbook 필터와 allowlisted `runtime.*` | agent entitlement와 한 step 공급 방식 유지. |

Codex의 정상 응답에 최소 `runtime: { client: "codex", protocol: "harness-runtime-v1" }`를 넣는다. 이는 이번 제안의 신규 계약이다. REST에서는 `TemplateResult`에서 route의 명시적 `Response.json`까지 전달하고, MCP에서는 `ServerResult.item` 안에 넣어 `unwrap`이 만드는 `content[0].text`의 JSON 안에 남긴다. MCP envelope 바깥이나 service 반환값에만 붙여 직렬화에서 사라지게 하지 않는다. `done:false`는 기존 `step/receipt` 및 binding을 보존하고 `done:true`도 runtime과 기존 terminal binding을 보존한다. terminal 응답에 원래 없는 step/receipt를 새로 요구하지 않는다. client 생략/Claude의 응답 구조와 오류 계약은 유지한다.

Codex는 처음부터 client를 명시한다. 구 서버가 새 field를 무시하거나 MCP schema가 제거하여 응답 확인에 실패하면 **파일 생성 및 역할 dispatch 전에 중단**한다. 첫 호환 확인은 `/api/templates?client=codex`로 하며 `pipeline_next`/`agent_next`로 구 서버를 시험하지 않는다. 여기서 read-only는 파일·실행 원장 비변경을 뜻한다. 기존 인증 사용 시각과 request budget 기록은 유지한다.

호환 판정은 Codex runbook 한 행의 존재만으로 하지 않는다. 신규 고정 marker `<!-- harness-runtime:harness-runtime-v1 -->`를 Codex runbook과 공통 agent source의 stub 영역에 넣는다. 요청 언어에서 `CODEX.runbook.md`, `agents/dev.md`, 해당 entitlement의 모든 보고 agent source, 네 공통 docs가 완비되고 해당 runbook/agent marker가 일치해야 Codex 지원을 응답한다. step source는 `splitTemplate`으로 검증한다. source에 marker가 없거나 다른 protocol이 섞였으면 미지원이며 Claude fallback을 하지 않는다. marker는 새 설계이며 현재 private source에 이미 있다고 주장하지 않는다. 기존 Claude runbook에는 marker나 구 생성기가 모르는 변수를 추가할 필요가 없다.

기존 transport 인증과 schema validation을 유지한다. schema를 통과한 요청의 서버 순서는 프로젝트 scope·접근 가능성·rate 제한 → 필요한 client bundle/hash 검사 → 기존 pipeline/cursor 처리 → 응답 직렬화다. client가 auth 결과나 owner 범위 판정에 사용되지 않는다. `src/server/mcp/deps.ts`의 **key 지정 branch와 overview branch 모두** Codex hash를 `advancePipeline`·`nextFor`·`headFor` 전에 검사한다. 현재 key branch는 stale 검사를 건너뛰므로 overview 끝에 검사 하나를 추가하는 방식으로 구현하지 않는다. Codex `agent_next`는 cursor 변경 전에 client/bundle을 확인하고 아래 렌더 선검증을 적용한다. REST의 잘못된 enum은 400, 미지원 bundle은 404다. MCP invalid enum은 기존 schema validation 오류이며, 미지원 bundle 및 runbook 누락/형식 오류/불일치는 `isError:true`의 기존 JSON text 오류로 반환한다. 오류에 정상 runtime/dispatch를 넣지 않는다. 기존 인증·접근·429 결과와 Claude advisory stale 계약은 보존한다.

`HARNESS_TEMPLATES_DIR`도 같은 client 필터·bundle 검증을 적용한다. 로컬 source 검증만으로 실제 MCP 서버의 Codex 지원을 증명하지 않으며 Codex 초기화 완료 전에 서버 preflight도 필요하다. REST는 요청 `lang`(기본 en)을 그대로 쓰고 다른 언어로 fallback하지 않는다. MCP의 Codex bundle은 Project.language의 완전한 집합을 우선 선택한다. 그 언어의 Codex runbook 자체가 없을 때만 완전한 en bundle로 fallback하며, runbook이 있는데 역할/marker가 누락된 부분 bundle은 fallback 없이 거부한다. hash와 모든 step은 **같은 선택 언어**를 사용한다. 현재 Claude의 template별 en fallback, stale의 전체 언어 비교 및 Project fallback은 유지한다.

서버의 공통 Codex 해석 소유자는 `src/server/runbook.ts`의 신규 `resolveCodexBundle`이다. `mcp/deps.ts`와 `agents/runs.ts`는 이 결과의 언어/source map을 사용해 hash와 본문을 같은 집합에서 얻는다. `NextDeps.template`의 선택 client 인수도 연결하며 Codex 본문에 기존 template별 fallback을 다시 적용하지 않는다. REST와 로컬 생성기는 core의 같은 필수 집합/marker 판정을 쓰되 위 요청 언어 규칙을 유지한다. config 언어와 서버 선택 언어가 다르면 언어 동기화/재조회 및 필요한 runbook 재생성을 끝낸 뒤 dispatch한다.

### 3. private step은 하나, 호스트 지침만 분리

현재 private `en/agents/{pm,plan-verifier,feature-scout,doc-auditor,dev}.md`를 논리적 역할과 step graph의 단일 원본으로 유지한다. Claude 전용 실행 표현은 공통 표현 또는 고정 `runtime.*` 변수로 바꾼다. 예를 들어 역할 호출 방법·현재 runbook 읽기 방법은 runtime descriptor에서 제공하고, plan 작성·검증·보고의 판단 기준은 공통 본문에 남긴다.

`buildVars`/`buildWorkspaceVars`, 서버의 `serverVars`와 로컬 생성기가 같은 descriptor를 쓰도록 연결한다. `NextInput.client` → `createNextDeps`의 vars 인수 → `serverVars`까지 전달하며 run 조회 키에는 넣지 않는다. 임의 사용자 문자열을 executable TOML·shell 표현으로 변환하지 않는다. Codex TOML은 알려진 frontmatter 필드와 stub을 제한적으로 파싱·직렬화한다. 지원하지 않는 필드나 잘못된 도구 이름은 오류로 표시한다.

현재 `agentNext`는 `withCursor` transaction이 끝난 **뒤** `renderTemplate`을 호출한다. 이를 그대로 두고 `runtime.*`만 추가하면 렌더 오류 전에 run/usage/outcome이 commit될 수 있다. 공통 구현에서 template·vars를 얻은 뒤 파싱된 모든 step 본문을 동일 vars로 선검증·렌더하고, 성공한 본문으로 cursor 처리를 수행한다. 이 과정은 서버 내부에만 머물며 응답에는 현재 step 하나만 보낸다. 미정의 변수/렌더 오류는 `withCursor` 진입 전에 실패해야 한다. transaction 안에서 변하는 `requires`는 여전히 기존 cursor 로직이 판단한다. 기존 유효 template의 전이·receipt/CAS·caller 기록을 보존하고 신규 run 생성·기존 outcome·usage가 렌더 실패 때문에 부분 commit되지 않음을 검증한다.

구 Claude 생성기와의 호환을 위해 공통 agent stub·docs 및 기존 Claude runbook에는 구 생성기가 모르는 필수 변수를 추가하지 않는다. 호스트별 변수는 서버가 렌더하는 step과 신규 Codex runbook에 우선 적용하고, 공통 stub은 중립 표현을 사용한다. Codex 전용 진입 지침은 Codex 생성 어댑터에서 추가한다.

회귀 기준은 step ID·edge·requires의 동일성, role allowlist의 동등성, entitlement별 공급 집합, stub에 step 본문이 포함되지 않는 것이다. Free에서 생략되는 verifier를 모든 플랜에 강제 추가하지 않고, 독립 검증 인수 시험은 해당 역할이 허용되는 플랜에서도 수행한다.

### 4. runbook은 client별로 분리하고 승인 원장은 공유

| 항목 | Claude | Codex 신규 |
| --- | --- | --- |
| Private source | `en/CLAUDE.runbook.md` | `en/CODEX.runbook.md` |
| 사용자 저장소의 출력 | `CLAUDE.md`의 기존 managed block | `docs/harness/codex-runbook.md` |
| 로컬 로드 | 기존 방식 유지 | Codex run/resume skill이 명시적으로 읽음 |
| 세션 보고 | 기존 hash 및 Project fallback | 현재 Codex source의 CRLF 정규화 hash를 매 `pipeline_next`에 명시 |
| `/api/runbook` 기록 | 현재 legacy 흐름 유지 | Claude fallback을 덮어쓰는 POST를 하지 않음 |

client별 source/output 선택은 고정 client descriptor를 사용한다. `packages/core/runbook.mjs`의 기존 `RUNBOOK_TEMPLATE`, `runbookVersion(body)`, `isRunbookVersion(value)`, `runbookIsStale(stored, bodies)` export·호출 형식·결과는 그대로 유지한다. 특히 `runbookVersion` 내부에 정규화를 추가하지 않는다. 현재 Claude init의 호출 전 CRLF→LF 변환, seed의 저장 전 변환 및 서버의 raw DB body 비교를 각각 보존한다.

Codex에는 같은 core 모듈의 신규 named export `codexRunbookVersion(body)`를 사용한다. 해당 실효 언어 raw source를 CRLF→LF로 정규화한 SHA-256 앞 12자리 hex를 반환하며 렌더된 출력은 해시하지 않는다. 서버의 `resolveCodexBundle`은 `@harness/core/runbook.mjs`에서, Codex init 분기는 동기화된 `plugin/lib/runbook.mjs`에서 이 함수를 가져와 같은 판을 계산한다. Claude source·기존 저장 판을 Codex 방식으로 재해시하거나 `runbookIsStale`을 Codex 비교에 재사용하지 않는다. Codex는 누락·형식 오류·stale 판을 fail closed 처리하고 언어/다른 client hash의 교차 승인을 허용하지 않는다. `Project.runbookVersion`은 Claude의 기존 fallback 의미로 남긴다. 이 설계에는 Prisma schema 변경이나 기존 판의 backfill이 필요하지 않다.

client가 다른 raw runbook을 갖는 것은 호스트 실행 지침 차이를 위한 것이다. 서버 승인·절차 상태를 이원화하지 않는다. deliver 단계에서 다른 client runbook과 옛 Free runbook을 제외하여 기존 Claude 생성 집합에 Codex 파일이 섞이지 않게 한다.

이 저장소의 `CLAUDE.md`가 `AGENTS.md`를 참조하므로 Codex 전용 orchestrator 지침을 공통 `AGENTS.md`에 삽입하지 않는다. target 저장소의 기존 AGENTS도 보존한다.

### 5. 배포 및 Codex 초기화

우선안은 같은 `plugin/` 원본에 manifest와 client 전용 skill 경로를 추가하는 것이다. 다음은 **신규 예정 경로**다.

```text
plugin/
  .claude-plugin/plugin.json         # 기존 유지
  .codex-plugin/plugin.json          # 신규: skills = ./codex/skills/
  skills/                           # 기존 Claude skills 유지
  codex/skills/
    harness-init/SKILL.md
    harness-run/SKILL.md
    harness-resume/SKILL.md
  bin/harness-init.mjs               # 공통 생성기 + --client
  lib/                              # 공통 core 복사본
  runtime/                          # 로컬 호스트 어댑터
```

Codex 호출 이름의 예정 값은 `$harness-init`, `$harness-run`, `$harness-resume`다. Claude의 `/harness:init` 등은 유지한다. dual manifest의 실제 discovery와 배포 파일 포함 여부는 Phase C0에서 검증한다. 실패하면 공통 bin/lib를 포함한 두 배포 artifact로 분리하고 경로 inventory를 갱신한 뒤 구현한다. Claude plugin이 자동으로 Codex plugin으로 해석된다고 가정하지 않는다.

이 경로안은 `.codex-plugin/plugin.json`을 사용하는 compatibility package이며 portable root `plugin/plugin.json`·`plugin/mcp.json`을 추가하지 않는다. 공식 [plugin 구조](https://developers.openai.com/plugins/build/plugins#plugin-structure)의 portable package는 root `skills/`를 정규 컴포넌트로 읽으므로 overlay의 `skills:"./codex/skills/"`로 대체할 수 있다고 가정하지 않는다. portable 전환이 필요하면 Claude 전용 skills가 Codex에 노출되지 않도록 배포 분리·정확한 경로 inventory를 먼저 갱신하고 C0를 다시 검증한다. E6은 실제 winning manifest와 로드된 skill body가 Codex 경로인지 확인한다.

`harness-init.mjs`에 `--client claude|codex`를 추가하고 생략값은 Claude로 둔다. 알 수 없는 값은 쓰기 전에 거부한다. Codex 출력은 `.codex/agents/<logical-agent>.toml`, `docs/harness/codex-runbook.md`, 기존 공통 계획·agent 문서다. workspace agent 이름은 현재 roster를 그대로 사용한다. 파일 경로 탈출, 이름 충돌, TOML escaping을 검증한다.

생성 전 모든 설정·source·지원 여부를 읽고 render와 merge 계획을 만든다. 기존 hash 기반 skipModified/refuse/명시적 adopt를 유지한다. lock v1의 `template`/`hash` 구조를 보존하며 소유권은 고정 출력 경로와 template source 표로 판정한다. 반대 client 항목과 미분류 비대상 항목은 보존하고 이번 실제 write만 새 hash로 기록한다. skipModified 항목은 기존 hash를 유지한다. **이번 client가 관리하던 역할이 entitlement에서 제외된 경우에는 기존처럼 lock 항목만 제거하고 파일은 삭제하지 않는다.** 공통 docs는 하나의 shared owner로 취급한다. 모호한 소유권을 추측하여 다른 client의 항목을 삭제하지 않는다.

두 init이 동시에 `harness.lock.json`을 읽고 쓰면 합집합도 유실될 수 있다. 갱신된 양쪽 생성기는 target root의 신규 `harness.init.guard/owner.json`에서 pid/nonce 기반 mkdir guard를 공유한다. 서버 fetch·전체 렌더는 guard 밖에서 하고, guard 안에서 현재 파일/lock을 다시 읽어 계획을 검증하고 파일·lock을 기록한다. 대기는 기존 watch guard와 같은 최대 5초로 제한하고 자기 nonce만 finally에서 정리한다. 버려진 guard는 자동 인수하지 않으며 관련 init이 모두 멈춘 뒤 명시적으로 복구한다. 이는 생성 파일 갱신의 직렬화이며 실행 session lock과 별개다. init 중 진행 중인 agent 작업의 중단도 확인한다.

현재 Claude 0.4.1 생성기는 비대상 lock을 버리므로 옛 init과 새 Codex init의 공존을 보장하지 않는다. **dual 저장소의 초기화는 양쪽 모두 C0에서 검증된 새 공통 생성기 이상 버전을 사용해야 한다.** 구 Claude의 단일 client 사용·기본 실행과 새 서버 호환은 유지하되, Codex 생성물이 있는 저장소에서 구 init을 다시 실행하도록 안내하지 않는다. 패키지 업데이트 후 양쪽 init 순서를 시험한다.

Codex init은 `.claude/`, `CLAUDE.md`, Claude의 `.mcp.json` 정리를 수행하지 않는다. Claude init도 `.codex/`와 Codex runbook을 변경하지 않는다. 공통 출력은 동일 본문으로 렌더한다. 충돌은 덮어쓰기 대신 안내한다. `--dry-run`은 파일・guard・MCP 설정・Project/실행 원장을 변경하지 않는다. 인증 사용 시각/request budget 기록을 파일 생성이나 project sync로 오인하지 않는다. Codex에서는 `--dry-run`과 `--register`의 병용을 요청 전에 거부한다. 현재 register branch는 dry-run이어도 POST하므로 그대로 재사용하지 않는다. `--print-project`/`--register`는 각각 독립 mode이고 생성 옵션과의 충돌을 검사한다. 기존 Claude의 유효 단독 mode는 보존한다.

초기화 상태는 `preflight → planned → files-written → mcp-registered → project-synced → ready`로 관리한다. config/source/완전한 외부 skill/서버 runtime preflight 실패는 쓰기 전 종료다. 생성 이후 MCP 등록 실패는 `files-written`, sync 또는 마지막 project/runtime 재확인 실패는 그 이전 완료 단계까지만 보고한다. CLI의 exit 0만으로 skill이 ready를 선언하지 않는다. 현재 legacy `/api/runbook` 401/403/409 처리와 Codex의 POST 생략을 구분한다. 권한 거부·429·네트워크 오류는 원인과 재시도할 단계만 알리고 자동 토큰 재발급·무한 재시도를 하지 않는다.

파일과 lock을 합친 다중 파일 transaction은 없다. 쓰기 중단으로 파일만 생기고 lock 갱신이 없으면 다음 init의 unlocked refuse가 정상 보호다. 실패 보고는 완료/미완료 경로를 표시하고 snapshot과 실제 차이를 확인한 뒤 필요한 파일에만 사용자가 승인한 adopt를 적용한다. 실패했다는 이유로 자동 adopt·삭제·이전 hash 갱신을 하지 않는다. lock은 마지막에 같은 디렉터리 임시 파일의 atomic rename으로 기록하고 자기 임시 파일만 정리한다. dry-run에는 이 쓰기도 없다.

MCP 등록은 기존 설정을 조회하고 Stagekeeper의 해당 서버 항목만 관리한다. 아래는 검증된 정규화 base URL이 `HARNESS_SERVER`에 설정된 뒤 Windows PowerShell에서 사용하는 등록 형태다. 값 누락·잘못된 URL은 skill/helper preflight에서 중단하며 예시를 실행해 현재 사용자 설정을 변경하는 것은 이번 문서 검증 범위가 아니다.

```powershell
codex.cmd mcp add harness --url "${env:HARNESS_SERVER}/api/mcp" --bearer-token-env-var HARNESS_TOKEN
```

MCP 등록에는 환경 변수 **이름**만 저장한다. 토큰을 shell에 넣는 기존 사용자 공개/영구 저장 흐름은 CON-DUAL-005대로 유지한다. `HARNESS_SERVER` 또는 명시적 `--server`는 지원하고 Codex가 Claude `.mcp.json`에서 URL을 추측하지 않는다. user token이면 기존 project 식별 전달 규칙을 따른다. owner endpoint는 필요할 때 main-loop에만 별도로 등록하며 역할 세션에서는 비활성화한다. 기존 `harness` entry가 다른 URL·인증 방식이면 변경 내용을 보여 주고 사용자 승인 범위에 따라 처리한다. 다른 MCP entry나 user config 전체를 재작성하지 않는다.

owner `gate_approve`는 기존 계약을 그대로 사용한다. `client/runbook`을 새로 받거나 Codex runtime echo를 반환한다고 가정하지 않는다. Codex main-loop는 사용자의 명시적 gate 승인, 현재 `gateEntry`, 필요한 `planCommit`을 기존 규칙대로 전달한 뒤 **응답의 `next`로 직접 dispatch하지 않고**, 같은 turn에서 agent endpoint의 `pipeline_next({ project, key, client:"codex", runbook })`를 다시 호출한다. 현재 runtime/hash/binding 확인에 성공한 답만 실행한다. `APPROVED_ADVICE_FAILURE`는 승인 저장 후 advice 실패이므로 같은 재조회로 복구하며 `gate_approve`를 재시도하지 않는다. 승인 요청의 transport 결과가 불명확할 때도 현재 gate/원장을 조회하고 자동 재승인하지 않는다. 재조회 실패는 역할 실행을 멈추지만 이미 저장된 승인을 되돌리지 않는다. Claude의 기존 owner 응답·same-turn 처리와 owner 인증/스키마는 유지한다.

Codex skill에서 helper root를 구하는 방법은 설치된 패키지 metadata와 실제 파일 위치로 확인한다. 검증되지 않은 `CODEX_PLUGIN_ROOT`를 가정하지 않는다. 설치 후 helper·skill·role·runbook 경로와 버전을 확인하고 안전한 진단 정보만 남긴다.

### 6. Codex 역할과 독립 검증

역할 이름과 MCP allowlist는 기존 template의 의미를 유지한다.

| 역할 | 허용되는 Stagekeeper MCP 도구 | 파일·호스트 권한 |
| --- | --- | --- |
| pm | agent_next, backlog_list, board_list, board_propose | 기존 도구 수준 유지. 임의 구현 작업 없음. |
| feature-scout | agent_next, backlog_list, backlog_add | 자료 읽기·검색. 저장소 수정 없음. |
| doc-auditor | agent_next, backlog_list | 문서 읽기. 저장소 수정 없음. |
| plan-verifier | agent_next, board_get | 저장소 read-only; 허용 scratch에서 검증. 필수 검증 skill 실행. |
| workspace dev | agent_next, backlog_get, board_get, board_transition, plan_submit, report_submit | 해당 workspace 구현·검증. 기존 readOnly 경로 정책 유지. |

`name`, `description`, `developer_instructions`와 검증된 역할 설정을 TOML에 생성한다. 각 자식에서 MCP `enabled_tools`를 제한하고 `harness_owner` 및 불필요한 inherited MCP를 차단한다. `[agents] enabled = false`로 자식의 재위임을 차단하는 방식을 실제 호스트에서 검증한다. 파일·shell·web 등 비MCP 도구도 기존 역할 수준으로 제한한다. 주석이나 자연어 금지문만으로 권한 경계를 충족했다고 보지 않는다.

owner 자격 증명은 자식의 shell 환경이나 읽을 수 있는 생성 파일에 전달하지 않는다. 도구 목록에서 owner server를 숨기는 것과 실제 credential 격리는 따로 시험한다. 호스트 설정 상속 때문에 이 경계를 보장할 수 없으면 해당 역할 구성을 출시하지 않는다.

plan-verifier에는 board key, plan 위치, 승인 대상 commit과 검증 절차만 전달한다. 부모의 전체 대화, 이전 reviewer 결론·결함 목록을 복사하지 않는다. 새 문맥에서 자료를 직접 읽는다. 필수 `reconciling-proposals-with-codebase`는 init reconciliation contract가 요구하는 **완전한 owner 제공 패키지**를 Codex가 실제 로드하는 위치에 준비하고 상대 참조 파일·revision/checksum까지 확인한다. 동명 skill 충돌을 제거하거나 실제 선택 경로를 명시한다. 축약한 지침으로 대체하지 않는다.

실효 sandbox·MCP 제한·쓰기 차단·문맥 독립성이 native subagent에서 성립하지 않으면 Phase C2를 중단한다. 대안은 App Server의 별도 fresh thread에서 같은 역할·권한으로 실행하는 방식이며, 실제 지원 계약과 경로를 검증한 뒤 설계를 갱신한다. 부모 history를 물려받은 agent를 독립 검증으로 간주하는 fallback은 없다.

Codex role/run/resume 지침은 보존된 서버 오류의 legacy `/harness:init` 복구 안내를 현재 client의 `$harness-init`으로 해석하도록 명시한다. 인증·gate·검증 실패 자체를 성공으로 바꾸거나 다른 client 초기화를 실행하지 않는다. 이 호스트별 복구 안내는 생성 TOML과 실제 실패 응답에서도 검증한다.

### 7. 승인 이후 재개 프로토콜

기본 재개는 이전 클라이언트의 저장소를 그대로 열어 수행한다. 다른 clone은 필요한 commit과 파일이 모두 전달된 경우에만 가능하며 로컬 파일 복원은 별도 책임이다.

1. 명시적 교차 클라이언트 전환이면 기존 main-loop, watch 및 이미 실행 중인 자식 agent의 중단 여부를 확인하고 새 세션의 commit·proposal 실행 정책을 명시한다. 같은 watch의 완료 신호로 재진입할 때는 기존 watch session과 저장된 정책을 재사용하며 새 foreground 세션을 시작하지 않는다.
2. 프로젝트·remote·현재 branch·토큰 범위·지원 runtime·runbook·필수 package를 확인한다. 새 foreground만 공통 로컬 소유권을 획득하고, watch 재진입은 같은 checkout/client/session의 현재 `owned`와 `lifecycle:"active"`, 실제 저장된 정책 및 호스트 출처를 확인한다. `owned`여도 `stopping`이면 역할 실행·결과 제출·watch 재예약을 멈춘다. 다른 세션이나 client의 session ID를 받아 잠금을 우회하지 않는다.
3. `pipeline_next({ project, key, client, runbook })`로 현재 서버 위치를 조회한다. `board_get`으로 관련 계획·승인·보고를 확인한다. 이전 client가 기억한 node를 사용하지 않는다.
4. 미승인이면 대기한다. 승인되었으면 현재 client의 pipeline 답을 따르며 Codex는 client/hash 검사를 통과한 dispatch, acceptance 또는 handoff 지시만 실행한다. Codex owner 승인의 `next`나 watch event 자체는 실행 근거로 쓰지 않고 §5의 재조회를 거친다. Claude에 Codex runtime echo를 요구하지 않는다.
5. dispatch할 역할은 새 역할 문맥에서 시작하되 서버가 준 현재 binding을 그대로 사용해 outcome 없는 `agent_next`를 호출한다. 임의의 새 entry ID를 만들지 않는다. 같은 열린 AgentRun이 있으면 현재 step과 유효 receipt를 받고, 없을 때만 기존 서버 규칙으로 연다.
6. 승인된 commit, plan/report 파일, workspace 상태와 기존 실행 결과를 검증한다. dirty tree는 실제 차이를 확인하여 필요한 파일이 그대로 남아 있는지 판단한다. 불명확하면 복구·확인을 요구하고 해당 step을 멈춘다.
7. 현재 step의 실제 작업과 검증을 수행하고 그 receipt로 결과를 제출한다. CAS 충돌이면 재조회하며 이전 결과를 다른 step의 성공으로 제출하지 않는다.
8. acceptance는 main-loop가 직접 기존 다섯 항목을 확인한다. handoff는 실제 필요한 commit이 존재하고 사용자의 계속 요청이 있을 때 기존 규칙으로 처리한다.

승인 지점 재개는 첫 출시 필수다. step 도중 전환은 현재 step의 파일이 남아 있거나 사용자가 산출물을 명시적으로 넘긴 경우에 한해 지원한다. 저장된 cursor는 모델의 수행 내역 전체를 증명하지 않으므로 검증·보고 step은 실제 자료와 명령 결과로 다시 확인한다.

승인으로 pipeline entry가 전진하여 새 역할 실행이 필요한 경우는 정상적인 신규 AgentRun이다. 재개만을 이유로 기존 entry의 열린 run을 복제하지 않는 것과, 새 entry의 실행을 만드는 것을 구분한다.

| 응답/호출 | binding 및 처리 규칙 |
| --- | --- |
| item `format:null` | legacy dispatch. 기존 key 규칙과 receipt를 유지하고 entry를 만들지 않는다. |
| item `format:"slots-v1"` | `dispatch.entry`의 `runId/entryId/slotId`를 첫 호출과 모든 후속 호출에 그대로 보낸다. `done:false` 응답의 `entry/agentRunId/step/receipt`를 검사하고 후속 outcome에 서버가 준 `agentRunId/stepId/receipt`를 echo한다. terminal 응답은 기존 terminal shape와 runtime을 확인하고 종료한다. |
| item의 format 누락/unknown 또는 bound metadata 누락 | 중단 후 호환 bundle 업데이트. legacy로 임의 downgrade하지 않는다. overview/head를 item format 대상으로 오판하지 않는다. |
| plan/implement slot | 서버가 지정한 workspace agent와 해당 BoardItem key를 사용한다. |
| verify slot | 서버가 지정한 plan-verifier와 해당 BoardItem key를 사용한다. dev로 치환하지 않는다. |
| 프로젝트 범위 report slot | entry는 전달하되 key는 생략한다. standalone PM/feature-scout head dispatch에는 entry도 없다. |
| `done:true` | 자식 역할 종료 후 main-loop가 `pipeline_next`를 다시 읽는다. 같은 역할에 outcome 없는 호출을 반복해 새 run을 열지 않는다. AgentRun 완료를 item 완료로 판단하지 않는다. |
| stale receipt/entry 또는 동시 CAS 실패 | 현재 pipeline/binding과 outcome 없는 현재 step을 재조회한다. 옛 결과에 새 ID/receipt를 붙여 제출하지 않는다. |

`agent_next`의 outcome 없는 호출은 항상 순수 조회가 아니다. 열린 run이 없으면 run 생성과 usage 증가가 발생한다. 현재 `usageRunCount`는 계획만이 아니라 **모든 신규 AgentRun**을 센다. 동일 열린 run 재개에서는 증가가 없어야 하고 새 entry의 합법적인 run은 기존 cap에 따라 센다. 새 UI/API 요금 정책을 만들거나 전체 pipeline의 usage가 0이라고 요구하지 않는다.

### 8. foreground와 watch의 공통 로컬 실행 소유권

기존 watch의 guard·nonce·session·policy·common Git 위치 규칙을 `plugin/runtime/local-session.mjs`로 추출하고 신규 `plugin/bin/harness-session.mjs`가 start/check/stop/release를 제공하게 한다. Claude run/watch와 Codex run/resume 모두 이를 통과한다. CLI 이름과 경로는 신규 설계이며 기존 watch CLI 인수와 기본값은 유지한다.

별도의 Codex 실행 lock은 만들지 않는다. 같은 `watch.json`, `watch.lock.json`, `watch.guard`에서 공통 실행 소유권을 판정한다. legacy v1 record를 읽는 동작과 활성 legacy 세션 점유 판정을 먼저 fixture로 검증한다. 기존 binding은 정확히 `root/server/project/configHash/tokenHash`를 유지한다. `matchesBinding`이 key 개수까지 비교하므로 client/mode를 binding에 추가하지 않는다. 신규 `client/mode/lifecycle`은 lock의 별도 top-level metadata로 두고, metadata 없는 v1은 `claude/watch`로 판정한다. 활성 legacy state를 자동 변환하거나 guard를 훔치지 않는다. v1 확장이 실제로 호환되지 않으면 version migration 설계를 추가하고 이 단계를 차단한다.

새 공통 진입부는 호출 출처를 구분한다. **watch가 깨운 main-loop는 watch의 소유권 안에서 실행한다.** 현재 `startWatch`는 state가 있으면 `locked`를 반환하므로 매 재진입에서 foreground `--start`를 호출하는 구현은 자기 watch와 충돌한다. 같은 watcher가 저장한 root/server/client/session 및 현재 task/thread 식별을 확인한 뒤 `--check`가 `owned`와 `lifecycle:"active"`를 반환할 때만 실제 정책으로 작업한다. `stopping`, 다른 client 또는 불명확한 식별이면 reuse하지 않고 중단한다. watch policy를 foreground 인수나 새 기본값으로 덮어쓰지 않는다. `propose:no`는 overview head의 PM/feature-scout만 막고 기존 item slot은 계속한다. 자식 역할은 부모 소유권에 속하며 별도 session을 획득하거나 release하지 않는다.

| 진입 | 소유권·종료 규칙 |
| --- | --- |
| 새 지원 foreground | 새 session을 start하고 실제 정책을 저장한다. quiescent 종료에서 그 session만 release한다. |
| 같은 watch의 work/idle 완료 | 기존 watch session을 check/reuse한다. foreground start/stop, policy 변경, work 종료 후 watch release를 하지 않는다. idle/work 이후 기존 rearm 규칙을 따른다. |
| watch 실행 중 별도 수동 run/resume 또는 다른 client | 현재 lock을 거부 사유로 표시한다. session 문자열만 전달해 기존 watcher인 것처럼 실행하지 않는다. |
| watch/foreground를 중단한 뒤 교차 client 전환 | 자식 종료와 기존 release를 확인한 후 새 client session과 정책을 만든다. 기존 session을 client만 바꾸어 재사용하지 않는다. |

Claude 새 runbook의 공통 helper 진입은 **구 플러그인에도 무조건 존재하는 명령으로 쓰지 않는다.** 실제 로드한 plugin metadata/skill 경로로 검증된 helper와 버전을 해석한다. helper가 전혀 없는 구 Claude 단일 client checkout에서는 기존 수동 실행 또는 해당 구 watch 절차를 유지하고 공통 foreground 보호가 없는 legacy 경로임을 알린다. Codex 생성 role/runbook 또는 Codex 소유 lock이 있는 dual checkout에서는 이 fallback을 허용하지 않고 공통 helper 업데이트를 안내한다. helper가 존재하지만 실행/버전 확인이 실패한 경우도 legacy로 fallback하지 않는다. 새 기능의 ownership 보호 범위를 구 수동 실행까지 확장했다고 주장하지 않는다. 기존 구 runbook+구 plugin+새 서버와, 구 생성기가 새 runbook을 내려받는 경우를 각각 검증한다. `CLAUDE_PLUGIN_ROOT`를 일반 shell 환경 변수로 추정하지 않는다.

foreground는 자식 실행까지 소유권을 유지한다. **로컬 permission 요청이 pending이거나 agent/turn이 살아 있으면 잠금을 반납하지 않는다.** gate/handoff/종료에서도 관련 자식이 모두 끝났거나 cancel 완료가 확인된 뒤에만 반납한다. stop 의도를 먼저 기록해 새 dispatch/outcome/rearm을 막고 `lifecycle:stopping`에서 자식 종료를 확인한 후 release한다. 호스트 응답을 잃어 종료를 확인할 수 없으면 stopping 잠금을 유지하고 명시적 복구를 안내한다. watch는 idle/work 응답 후에도 소유한다.

현재 110분 deadline은 **한 poll 호출의 시한**이며 watch lock 자체의 자동 만료 시간이 아니다. 12시간 된 `seenAt`도 인수 권한을 주지 않으며 기존 start는 해당 state를 locked로 처리한다. foreground는 자동 lease expiry를 신설하지 않고 명시적 release를 쓴다. 단조 시계 deadline/request timeout·ownership check·watch terminal cleanup은 기존 코드에서 추출한다. 오래된 lock·죽은 guard를 시간만으로 자동 점유하지 않는다. 모든 dispatch, outcome 제출, 재설정 직전에 ownership을 확인한다.

stop은 파일 상태를 바꾸어 새 작업을 막는 것과 실제 agent/turn을 중단하는 것을 구분한다. `--force` 인수로 기존 agent 취소를 추정하지 않는다. 늦은 이벤트는 session/poller nonce/현재 thread·turn과 대조하여 무시한다. 이전 manual 세션이나 별도 clone의 이미 시작된 파일 편집을 이 잠금이 보호한다고 주장하지 않는다.

공통 session CLI의 신규 계약은 `--start --client claude|codex --mode foreground --commit yes|no --propose yes|no`, `--check --session <id>`, `--stop --session <id>`, `--release --session <id>`와 기존 root/server 규칙이다. 네 operation은 상호 배타적이며 start만 정책을 받는다. 누락/unknown/충돌 옵션은 상태 쓰기 전에 거부한다. stop과 release는 root/session만으로 가능하고 token/config 유실로 막지 않는다. 아래 event는 **신규 session CLI**의 JSON 계약이며 기존 watch CLI stdout을 바꾸는 지시가 아니다.

| 공통 session operation | guard 안의 현재 상태 처리 | 성공 응답·호출자 의무 |
| --- | --- | --- |
| `--start` | 새 foreground session과 `lifecycle:"active"`를 기록 | `event:"started"`, session/client/mode/lifecycle와 실제 policy 반환 |
| `--check` | id/binding과 현재 소유권을 검사; stopping을 active로 바꾸거나 policy를 확대하지 않음 | `event:"owned"`여도 lifecycle은 active 또는 stopping. 새 dispatch/outcome/rearm은 **owned + active + 올바른 host 출처**일 때만 허용 |
| `--stop` | 현재 id가 일치할 때만 `lifecycle:"stopping"`을 기록하고 lock/policy를 유지; 반복 stop도 stopping 유지. 다른 id 또는 없는 상태는 `event:"replaced"`로 무변경 종료 | `event:"stopping"`과 session/lifecycle 반환. orchestrator는 저장된 task/agent/turn 및 pending permission을 정식 호스트 흐름으로 중단하고 종료 여부를 확인 |
| `--release` | 현재 id가 일치할 때만 자신의 lock/policy를 제거; 다른 id 또는 없는 상태는 `event:"replaced"`로 무변경 종료 | `event:"released"`. orchestrator가 모든 관련 자식·poller/turn의 quiescent 상태를 확인한 뒤 호출; 정상 foreground 종료와 확인된 stopping 종료에서만 사용 |

`requestStop`과 `releaseSession`을 공통 helper의 별도 신규 함수로 구현한다. helper는 파일의 lifecycle 또는 CLI exit 0을 호스트 자식 종료의 증거로 취급하지 않는다. `--release` 호출의 전제는 orchestrator가 확인한 종료 근거이며, 단순 플래그나 session ID가 그 근거를 대신하지 않는다. 확인을 잃으면 stop 상태와 잠금을 유지한다. stop→호스트 중단/종료 확인→release 순서를 건너뛰거나 매 work/idle 응답 뒤 release하지 않는다. release는 guard 안에서 최신 id를 다시 검사하여 늦은 이전 세션의 호출이 successor 파일을 삭제하지 않게 한다.

stop 저장 실패와 release의 부분 파일 제거 실패는 `event:"error"`로 보고하며 stopping/released 성공을 만들지 않는다. lock/policy 두 파일 제거는 다중 파일 atomic transaction이 아니다. 불완전한 쌍은 기존 corrupt-state 판정으로 새 start를 차단하고, 확인된 자기 세션의 잔여 파일만 명시적으로 복구한다. 실패를 이유로 다른 session 파일을 자동 정리하지 않는다.

현재 legacy `harness-watch.mjs --stop`은 `clearState`로 lock/policy를 즉시 지운다. 기존 단독 호출의 인수·stdout event·기본 제한은 보존하되, **업데이트된 양쪽 어댑터의 중단 경로는 common session의 stop/release를 사용하고 legacy stop을 대신 호출하지 않는다.** 업데이트된 poller/진입부도 stopping metadata를 존중하여 새 요청/dispatch/rearm을 만들지 않고, 공통 어댑터가 소유한 stopping 잠금을 terminal cleanup에서 먼저 지우지 않는다. 옛 poller의 metadata 무시는 혼합 버전의 자동 취소 증거가 아니므로 기존 task 종료를 확인한 뒤 release한다. legacy stop/force로 상태를 지운 경우에도 새 실행 전 기존 자식 중단 확인은 필수다.

ownership 확인과 RPC 전송 사이의 경쟁, 이미 전송된 MCP 요청은 로컬 stop으로 원자적으로 취소되지 않는다. 유효 receipt의 in-flight 결과가 서버에 기록될 수 있으며 stop은 이를 되돌리지 않는다. 다음 세션은 현재 원장을 재조회한다. 종료 확인 후 새 요청을 만들지 않는 것과 서버의 in-flight 기록 취소를 혼동하지 않는다.

### 9. 제품 안내와 Codex watch

토큰 공개·연결 명령 및 다음 단계 안내에 Claude/Codex 선택을 추가한다. 기본값은 Claude다. 선택은 표시할 명령과 설명만 바꾸며 Project 상태·token scope에 기록하지 않는다. 기존 `nextStepLine`의 중립적인 pipeline/handoff 문장은 재사용하고 Codex에는 명시적 resume 경로를 연결한다.

선택 state는 각 token reveal 및 TurnBanner 내부에 둔다. TurnBanner의 setup detail과 NextStepBox는 같은 현재 선택을 사용한다. `deriveTurn`의 서버 상태 판정을 바꾸지 않고 표시 detail/명령만 client descriptor로 선택한다. 단순 refresh가 state를 초기화한다고 가정하지 않는다. 새 token/mcpUrl 또는 프로젝트 slug로 입력 identity가 바뀌면 Claude 기본으로 reset하며, 같은 프로젝트의 tab 이동은 일관된 표시를 유지한다. client 변경 이벤트에 DB action, token 발급/revoke, MCP 등록을 연결하지 않는다. generic gate/landing/backlog/연결 해제 문구는 두 client를 안내하되 Claude 전용 설치 명령은 그대로 남긴다.

Codex 선택 시 복사 payload는 `$harness-resume`과 해당 key/재개 요청을 포함하고 Claude는 기존 `nextStepLine`을 사용한다. `DetailText`는 `/harness:init`과 `$harness-init`을 모두 렌더한다. MCP/설치 명령 quoting은 화면 문자열과 실제 실행 payload를 같이 검사한다. C0에서 설치 방식이 확정되기 전에는 임의 Codex install 명령을 UI에 넣지 않는다. token 평문을 허용하는 기존 공개 영역과 token-free MCP 등록/다음 단계 payload를 별도로 검증한다.

Codex watch의 광고는 Phase C4 완료까지 보류한다. 후보는 다음 순서로 확인한다.

| 방법 | 검증 조건 | 사용 범위 |
| --- | --- | --- |
| Native background 완료 신호 | 모델 없이 poller가 돌고 실제 완료 이벤트가 같은 main-loop를 재진입시킴 | 해당 CLI/앱 버전에서 검증한 세션만 |
| 별도 로컬 App Server runner | runner가 thread/turn lifecycle과 승인 요청을 소유하고 poller 신호로 `turn/start` | runner가 만든 대상 thread. 임의로 열린 앱 대화의 재개가 아님. |

대체 runner의 신규 후보 경로는 `plugin/runtime/codex-session.mjs`, `plugin/bin/harness-codex-watch.mjs`다. 로컬 로그인과 permission 정책을 이용하고 직접 API key 모델 호출을 새로 만들지 않는다. `thread/start/resume`, `turn/start/interrupt` 등 실제 지원 요청·응답을 검증한다. 활성 turn에 중복 start를 보내지 않고 permission request는 현재 사용자에게 전달한다. sandbox 밖 실행이 기본인 별도 shellCommand API를 편의상 사용하지 않는다.

두 방법 모두 실패하면 기본 수동 재개만 출시한다. 모델이 반복 질문·조회하는 `/loop` 방식으로 watch를 흉내 내지 않는다. poll interval·deadline·request timeout·body limit·반복 실패 종료는 기존 안전 기준을 유지하고 110분 idle, 승인 후 재진입, stop/늦은 이벤트를 실제로 검증한다.

Codex poll transport는 key 없는 `pipeline_next`에도 `client:"codex"`와 현재 Codex raw runbook hash를 보내고 실제 JSON text의 runtime echo를 검사한다. 현재 `harness-watch.mjs`의 Claude 전용 `localInput`/`callTool`을 그대로 호출하여 기본 Claude 응답을 받는 방식은 허용하지 않는다. native signal/runner listener와 요청 reader·abort/timer는 자기 session/thread/turn에 묶고 stop·error·interrupt에 정리한다.

### 10. template 배포의 일관성과 복구

현재 `seed-templates.ts`는 파일별 parse/upsert를 순차 수행하며 뒤 파일의 오류 이전에 앞 행이 commit된다. source에서 사라진 DB 행도 삭제하지 않는다. C1에서는 전체 source inventory를 먼저 읽어 CRLF 정규화, `(lang,path)` 중복, step graph, runtime marker 및 언어별 Codex 필수 집합을 검증한 뒤 단일 DB transaction으로 bundle을 upsert한다. `CODEX.runbook.md`가 없는 언어는 legacy-only로 남길 수 있고 Codex 지원을 응답하지 않는다. source 검증 실패나 transaction 실패는 기존 bundle 전체를 보존한다. 신규 query helper는 IO/DB orchestration과 분리하여 단위 시험하고 실제 rollback은 테스트 DB에서 확인한다.

롤백은 seed source checkout만 되돌리는 것으로 완료되지 않는다. 도입 시 수정한 공통 agent 행의 이전 body snapshot과 새로 추가한 `(lang,CODEX.runbook.md)` 행 inventory를 기록한다. 복구 transaction은 이전 body를 복원하고 해당 **도입된 Codex 전용 행만** 명시적으로 제거한다. 다른 언어·기존 docs·AgentRun/PipelineRun을 포괄 삭제하지 않는다. 복구 후 Codex preflight의 미지원 응답과 Claude 기존 렌더/열린 run을 검증한 다음 구 서버로 되돌린다. DB seed 및 복구 실행은 별도 승인된 환경에서만 한다.

## Concrete Examples

### EX-DUAL-004A: Claude 승인 대기에서 Codex 구현으로

Given Claude가 plan 제출 후 implementing gate에서 멈췄고 plan commit이 같은 checkout에 존재한다. When owner가 웹에서 승인하고 기존 agent를 중단한 뒤 Codex에서 동일 key를 재개한다. Then 현재 승인과 pipeline 위치를 재조회하여 같은 계획의 구현 단계로 진행한다. 새 BoardItem·승인·중복 plan run을 생성하지 않는다. 열린 run 재사용과 새 pipeline entry의 정상 run/usage를 구분한다. 부모 대화 없이 실행되며 Codex의 로컬 권한 승인은 별도다.

### EX-DUAL-005A: 도구를 바꿔도 미승인은 미승인

Given 동일 상황에서 웹 gate가 아직 미승인이다. When Codex에서 재개한다. Then 서버의 wait와 승인 위치를 안내하고 구현을 시작하지 않는다.

### EX-DUAL-010A: 열린 verify step과 다른 유효 토큰

Given Codex dev의 verify step이 열린 상태이고 작업 파일·commit이 남아 있다. When 같은 프로젝트에 접근 가능한 다른 토큰으로 Claude가 재개한다. Then 기존 열린 run의 현재 receipt를 다시 얻고 실제 검증을 수행한다. 같은 열린 run의 재개로 usage를 증가시키지 않으며 후속 caller는 실제 토큰으로 기록된다.

### EX-DUAL-011A: 실행 중인 Claude watch와 Codex 충돌

Given 같은 common Git 디렉터리를 Claude watch가 소유한다. When Codex foreground start가 요청된다. Then 새 실행은 거부되고 기존 session이 안내된다. stop/force로 잠금을 넘겨받더라도 기존 자식의 중단은 따로 확인하며, 이전 세션의 늦은 완료 이벤트는 새 Codex 세션을 깨우지 않는다.

## Blockers and Readiness

### BLK-DUAL-01: Codex 역할의 실효 권한과 독립 문맥

근거: 공식 역할 설정은 존재하지만 부모의 live permission override와 문맥 전달이 이 프로젝트의 독립 검증 계약을 충족해야 한다. 2026-10-03 Codex CLI 0.160.0 실제 시험에서 native 역할 선택은 해당 tool surface에 제공되지 않았고, 별도 fresh CLI의 자동 승인 후보는 disposable 저장소 쓰기에 성공했다. 명시적인 read-only 기반 named profile은 저장소 읽기와 허용 scratch 쓰기까지 실행 전에 거부했다. OS 환경 변수 allowlist를 적용한 재시험도 같은 결과다. 전체 명령 거부를 정상적인 파일 격리의 PASS로 처리하지 않는다.

영향: Phase C2의 역할 실행 및 최종 Codex 전체 주기 출시를 차단한다. Phase C0의 bounded prototype은 이 증거를 만들기 위한 작업이다.

관련 요구사항: REQ-DUAL-003, REQ-DUAL-008, REQ-DUAL-009, REQ-DUAL-017.

해제 조건: fresh 문맥에 부모의 심어 둔 판단이 전달되지 않음, 저장소 쓰기 차단 및 허용 scratch, 실제 MCP/비MCP 도구 제한, owner credential 부재, nested agent 차단을 실제 CLI에서 확인한다. 실패 시 검증된 별도 fresh-thread 설계로 문서를 갱신한다. 실패한 native 구성을 그대로 제품에 넣지 않는다.

### BLK-DUAL-02: private source와 검증 패키지의 승인된 배포

근거: 실제 template은 별도 저장소/DB에 있고 필수 verifier skill은 owner 제공 완전한 패키지를 요구한다.

영향: Phase C1의 private 변경, Phase C2의 설치 완결성, Phase C3 배포를 차단한다. public 소스 작업만으로 해제되지 않는다.

관련 요구사항: REQ-DUAL-001, REQ-DUAL-003, REQ-DUAL-008, REQ-DUAL-014, REQ-DUAL-017.

해제 조건: 승인된 private revision과 대상 언어 inventory, step graph 회귀 결과, 완전한 skill의 실제 로드 경로·revision/checksum, 전체 bundle 검증·atomic seed·실제 이전 body 복원 및 도입 Codex 행 제거 시험을 기록한다. 권한 없는 private 원본 수정·실제 DB seed로 이 제안서의 빈칸을 채우지 않는다.

### BLK-DUAL-03: dual manifest와 helper 패키징

근거: disposable compatibility package의 두 manifest, 실제 Codex winning skill body/helper 및 Claude validator는 2026-10-03 C0에서 확인했다. portable root manifest를 추가하지 않는 경로안은 fixture에서 성립한다. 실제 제품 package, 두 CLI의 제품 실행 및 업데이트 공존은 아직 미검증이므로 fixture 성공만으로 이 blocker를 해제하지 않는다.

영향: Phase C2 패키징을 차단한다.

관련 요구사항: REQ-DUAL-002, REQ-DUAL-017.

해제 조건: disposable 설치에서 실제 읽은 manifest, skill, helper 경로와 버전을 확인하고 Claude 설치를 회귀 시험한다. 실패하면 두 배포 artifact의 공유 원본·출력 inventory를 확정한 후 구현한다.

### BLK-DUAL-04: Codex watch의 재진입과 취소

근거: Claude background task 완료 흐름을 Codex로 그대로 옮길 수 있다는 증거가 없다.

영향: Phase C4와 Codex 자동 watch 광고만 차단한다. Phase C3의 기본 명시적 재개는 차단하지 않는다.

관련 요구사항: REQ-DUAL-018, REQ-DUAL-019.

해제 조건: native 완료 신호 또는 별도 runner의 실제 thread/turn/permission/cancel 시험 및 장시간 idle 시험을 통과한다. 두 방법이 실패하면 별도 후속 제안으로 이 범위와 blocker를 이관한 뒤 기본 지원 완료 범위를 명시한다.

### BLK-DUAL-05: legacy watch state와 공통 소유권 호환

근거: 현재 v1 state는 watch 전용이다. foreground용 metadata와 CLI 추출이 기존 session·guard 판정과 양립하는지 미검증이다.

영향: Phase C2 공통 세션과 양방향 재개 출시를 차단한다.

관련 요구사항: REQ-DUAL-004, REQ-DUAL-011, REQ-DUAL-016, REQ-DUAL-019.

해제 조건: legacy active/오래된 seenAt/dead-guard fixture, 정확한 binding shape, linked worktree 및 혼합 버전 시험으로 점유를 잘못 넘겨주지 않음을 확인한다. permission pending과 stopping에서 소유권 보존·자식 종료 후 별도 release, legacy stop을 우회 호출하지 않는 새 어댑터와 이전 session의 늦은 release 무변경도 검증한다. 단순 optional field 추가가 호환되지 않으면 version migration 및 롤백 설계를 승인 문서에 반영한다.

현재 readiness: **C1–C3 로컬 소스 구현, 필수 과거 권한 후보 FAIL, 실제 지원 인수·출시 BLOCKED**다. 실제 정상 사용자 CLI는 로그인되어 있다. 외부 sandbox 계정에서의 인증 저장소 접근 실패를 사용자 미로그인으로 해석하지 않는다. 보고서는 active/result:null로 유지하며 필수 FAIL과 미실행 항목을 보존한다.

제품 지원 인증 전에는 저장소 읽기·허용 scratch 쓰기가 실제로 실행되면서 저장소 쓰기·owner/nested 도구가 차단되는 호스트/실행 방식과 fresh 문맥 canary를 검증해야 한다. 현재 실패한 자동 승인 후보를 채택하거나 모든 명령이 거부된 named profile을 검증 성공으로 취급하지 않는다. 후속 지시에 따른 소스 구현 승인은 유지되며 필요한 것은 같은 승인의 반복 요청이 아니라 실제 호스트 증거와 나머지 blocker 해제다. [실행 보고서](../../test-reports/active/dual-client-runtime-report.md)가 실제 결과와 재현 절차를 기록한다.

## Affected Files

아래는 2026-10-03 저장된 소스에서 확인한 변경·보존 대상과 신규 예정 경로의 닫힌 inventory다. 표의 파일 목록 전체가 검증 대상이며 디렉터리 이름을 대표 표본으로 사용하지 않는다. 현재 private 언어는 en 하나다. 신규 언어·배포 분리·fallback이 필요하면 정확한 경로, import, Task, E 검증을 함께 갱신하고 미확정 상태로 구현을 진행하지 않는다.

| 대상 | 현재 소유 파일 또는 신규 예정 파일 | 최종 검증 위치 |
| --- | --- | --- |
| 순수 client/bundle 계약 | 신규 `packages/core/client-runtime.mjs`, `packages/core/client-runtime.test.mjs` | E2. enum/default/path/marker/필수 집합; 모듈은 Node·DB·호스트 상태를 import하지 않음 |
| 전달·hash·vars·lock | 기존 `packages/core/deliver.mjs`, `deliver.test.mjs`, `runbook.mjs`, `runbook.test.mjs`, `vars.mjs`, `vars.test.mjs`, `manifest.mjs`, `manifest.test.mjs`(각각 같은 core 폴더) | E2. 반대 runbook 제외, Claude raw hash/export 보존과 Codex 정규화 hash 분리, 기존 modified/adopt, retired 역할과 반대 client 항목 구분 |
| core 복사본 | 기존 `scripts/plugin-lib.mjs`; 출력 `plugin/lib/deliver.mjs`, `runbook.mjs`, `vars.mjs`, `manifest.mjs`, 신규 `client-runtime.mjs`(각각 같은 lib 폴더) | E2/E11. sync 후 원본/복사본 byte 동일·orphan 부재; runtime 폴더는 자동 복사 대상이 아니므로 package 검사 별도 |
| REST template 응답 | 기존 `src/app/api/templates/route.ts`, `src/server/templates.ts`, `src/server/templates-query.ts`, `src/server/templates-query.test.ts` | E4. 최종 REST body의 runtime/필터 및 auth/rate/language |
| client runbook/bundle 검사 | 기존 `src/server/runbook.ts`, `tests/server/runbook-stale.test.ts` | E4. resolveCodexBundle의 단일 실효 언어/부분 bundle 거부/hash 및 Claude fallback 비교 |
| MCP schema/직렬화/deps | 기존 `src/server/mcp/tools.ts`, `tools.test.mjs`, `deps.ts`; 신규 `client-bundle-query{,.test}.ts`, `codex-handoff-query{,.test}.ts`(src/server) 및 `tests/server/integration/client-runtime.test.ts` | E4. 실제 JSON text echo, key/overview 검사 순서, 입력 client의 전달; DB adapter 시험은 보호된 integration runner |
| step 렌더/cursor 연결 | 기존 `src/server/agents/next.ts`, `next.test.ts`, `runs.ts`, `vars.ts`, `vars.test.ts`, `run-query.ts`, `run-query.test.ts`, `steps.ts`, `steps.test.ts`(각각 같은 agents 폴더) | E4. vars/render 전에 cursor 금지, bound key/entry/receipt/caller/usage; run-query의 identity/lock 순서는 보존 |
| seed | 기존 `scripts/seed-templates.ts`; 신규 `scripts/lib/template-seed-query.ts`, `scripts/template-seed-query.test.ts`, `scripts/restore-dual-client-templates.ts` | E3/E4/E11. architecture의 운영 script 경계에 배치. 전체 parse/marker 검증 후 atomic upsert; 제한된 복구 행만 삭제 |
| 실제 REST/CLI 및 DB 교차 검증 | 기존 `src/server/harness-init.test.ts`, `tests/server/integration/templates.test.ts`, `tests/server/integration/agent-runs.test.ts`; 신규 `tests/server/integration/client-runtime.test.ts`; 기존 `scripts/test-server-integration.mjs`의 DB 보호 유지 | E4/E5. 실제 CLI/인증 scope와 최종 body; DB 실행 ID/caller/cap/CAS/seed fault rollback |
| 생성기/TOML | 기존 `plugin/bin/harness-init.mjs`, `plugin/bin/harness-init.test.mjs`; 신규 `plugin/runtime/codex-agent.mjs` | E5/E6. 실제 TOML 구조·safe quoting·guard·부분 실패·양쪽 공존 |
| Codex package | 신규 `plugin/.codex-plugin/plugin.json`, `plugin/codex/skills/harness-init/SKILL.md`, `plugin/codex/skills/harness-run/SKILL.md`, `plugin/codex/skills/harness-resume/SKILL.md` | E6. 실제 manifest discovery, skill/helper/reference 포함 및 루트 계산 |
| Claude package/진입부 | 기존 `plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `plugin/skills/init/SKILL.md`, `plugin/skills/init/references/reconciliation-contract.md`, `plugin/skills/watch/SKILL.md`; private Claude runbook의 main-loop | E3/E6/E7/E11. repo root marketplace의 plugin source `./plugin` 유지; 버전/공통 session 진입과 양쪽 외부 skill preflight |
| 공유 소유권 추출 | 기존 `plugin/bin/harness-watch.mjs`, `plugin/bin/harness-watch.test.mjs`; 신규 `plugin/runtime/local-session.mjs`, `plugin/bin/harness-session.mjs`, `plugin/bin/harness-session.test.mjs` | E7. 기존 watch stdout/인수/limits, v1 정확한 구조, stopping/pending 보존·별도 release 및 successor 보호; bin tests가 runtime helper도 검증 |
| C4 조건부 watch | 신규 후보 `plugin/runtime/codex-session.mjs`, `plugin/bin/harness-codex-watch.mjs`, `plugin/bin/harness-codex-watch.test.mjs`, `plugin/codex/skills/harness-watch/SKILL.md` | E12. native 또는 runner 중 검증된 방식만 구현, thread/turn/listener cleanup |
| private 공통 agent | 기존 `plugin/templates/en/agents/pm.md`, `plan-verifier.md`, `feature-scout.md`, `doc-auditor.md`, `dev.md`(각각 같은 agents 폴더), `plugin/templates/templates.test.mjs` | E3. source marker, graph/allowlist, legacy stub, 단일 step 본문 |
| private runbook/docs | 기존 `plugin/templates/en/CLAUDE.runbook.md`, `plugin/templates/en/docs/plans/README.md`, `template.md`, `verification-paths.md`(같은 plans 폴더), `plugin/templates/en/docs/agents/README.md`, `plugin/templates/README.md`; 신규 `plugin/templates/en/CODEX.runbook.md` | E3/E11. Codex 필수 집합, 공통 docs의 동일 렌더, snapshot/복구 inventory |
| 토큰 공개/명령 UI | 기존 `src/fsd/entities/project-token/model/connect-command.ts`, `connect-command.test.ts`(같은 model 폴더), `src/fsd/entities/project-token/ui/token-reveal.tsx`, `owner-token-reveal.tsx`, `token-reveal.test.ts`(같은 ui 폴더), `src/fsd/entities/project-token/index.ts` | E10. 기본/선택/identity reset, 일회성 secret 공개 예외와 token-free 등록을 구분 |
| turn 표시 UI | 기존 `src/fsd/widgets/turn-banner/model/turn.ts`, `turn.test.ts`(같은 model 폴더), `src/fsd/widgets/turn-banner/ui/turn-banner.tsx`, `next-step.tsx`, `next-step.test.mjs`(같은 ui 폴더); 신규 `src/fsd/widgets/turn-banner/ui/turn-banner.test.ts` | E10. setup·next 동일 선택/명령 렌더 및 slug reset; 서버 turn 정책 유지 |
| gate 공용 copy | 기존 `src/fsd/entities/pipeline/model/gate-copy.ts`, `gate-copy.test.ts`(같은 model 폴더), `src/fsd/entities/pipeline/index.ts`, `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx`, `pipeline-rail.test.mjs`(같은 ui 폴더), `src/fsd/features/review-gate/model/gate-text.ts`, `src/fsd/features/review-gate/ui/inbox-card.tsx`, `inbox-card.test.mjs`(같은 ui 폴더) | E10. public API·gate tooltip/hint·승인 후 session 안내의 양쪽 지원; gate mutation 그대로 |
| generic 제품 copy | 기존 `src/fsd/pages/landing/ui/landing-page.tsx`, `landing-page.test.ts`(같은 ui 폴더), `src/fsd/features/edit-backlog/ui/backlog-table.tsx`, `backlog-table.test.mjs`(같은 ui 폴더), `src/fsd/features/manage-project-connection/ui/project-connection-control.tsx`, `project-connection-control.test.ts`(같은 ui 폴더), `src/fsd/pages/user-tokens/ui/user-tokens-page.tsx`, `user-tokens-page.test.ts`(같은 ui 폴더), `src/fsd/pages/project-tokens/ui/project-tokens-page.tsx`, `project-tokens-page.test.ts`(같은 ui 폴더) | E10. 모든 현재 Claude 독점 generic copy 수정; 연결 해제/owner token/expiry 정책 유지 |
| copy 계약/검사 | 기존 `docs/conventions/product-copy.md` §5/6/7/8/9/10/13/14/15/16/18, `scripts/retired-copy.test.mjs`, `src/fsd/shared/lib/copy-lock.ts`, `src/fsd/shared/lib/copy-lock.test.ts` | E3/E4/E10/E11. 문구 source와 소비 test를 함께 갱신; parser helper 보존; Claude 전용 문자열 전체 금지 금물 |
| probe/rehearsal 보고 | 신규 `scripts/rehearse-dual-client-runtime.ts`, `scripts/rehearse-dual-client-runtime.test.ts`, `docs/test-reports/active/dual-client-runtime-report.md` | E1/E6/E7/E8/E9/E11/E12. 아래 phase/인수 및 무부작용 report validation 계약과 sanitized 실제 증거 |
| 수용 구조·사용법 | 기존 `docs/architecture/README.md`, `system-overview.md`, `protocol.md`, `invariants.md`, `verification.md`(같은 architecture 폴더), 루트 `./README.md`, `./CONTEXT.md` | E11. 실제 수용된 계약/지원 버전만 갱신; architecture README의 단일 Claude runbook/plugin 설명도 실제 dual 지원과 일치 |

표의 같은 폴더 표기는 파일명의 base directory를 고정하는 축약이며 wildcard가 아니다. 새 경로는 현재 존재하지 않음을 확인했다. 구현 시 `.codex-plugin`·`codex/skills`·`runtime` 등 부모를 생성하고 같은 이름의 사용자 파일·symlink·경로 탈출이 있으면 중단한다. 최종 target 파일 inventory와 보호 대상은 아래 artifact 표를 따른다.

### Symbol/import provenance 및 보존 경계

| symbol/behavior | 현재 소유 → 변경 후 소비 | export/검증 |
| --- | --- | --- |
| `deliverable`, `buildVars`, `buildWorkspaceVars`, `buildLock`, runbook hash | core 원본 → 서버의 `@harness/core/...mjs`, plugin의 `../lib/...mjs` | 기존 named export 보존; 신규 client descriptor는 고정 named export; E2 및 TypeScript 검사 |
| `RUNBOOK_TEMPLATE`, `runbookVersion`, `isRunbookVersion`, `runbookIsStale`; 신규 `codexRunbookVersion` | 기존 `packages/core/runbook.mjs` → 동기화된 `plugin/lib/runbook.mjs`; 신규 함수는 서버 `resolveCodexBundle`과 Codex init 분기가 소비 | 기존 export/signature/raw 결과와 Claude 호출 경계는 불변; Codex만 정규화 helper 사용. E2/E4/E5/E11에서 실제 import와 hash 값 검사 |
| `NextInput`, `NextOutput`, `NextDeps.vars`, `NextDeps.template`, `agentNext`, `createNextDeps` | `agents/next.ts` → `agents/runs.ts`·`mcp/deps.ts`·`mcp/tools.ts` → 최종 MCP JSON | optional client/type/vars/template 인수와 runtime 전달을 같은 변경으로 적용; E4 |
| `resolveCodexBundle` | 신규 named export를 기존 `src/server/runbook.ts`에 정의 → `mcp/deps.ts`, `agents/runs.ts`의 Codex branch | 단일 언어의 완전한 source map/hash 판정; legacy per-template fallback은 그대로; E4 |
| `splitTemplate`, seed 준비/commit | 기존 `agents/steps.ts` → 신규 `template-seed-query.ts` → `scripts/seed-templates.ts` | pure parser를 단일 소유자로 유지; script 내부 per-file parse/upsert loop 제거; E3/E4 |
| `gitRoot`, `stateFiles`, `readState`, `atomicWrite`, `isAlive`, `withGuard`, `matchesBinding`, `requireOwnership`, `clearState`, `replaced` | 현재 `harness-watch.mjs`의 로컬 함수 → `runtime/local-session.mjs`의 named export → watch/session 및 init guard 소비 | 이동 후 watch에 동일 함수/별도 guard 구현이 남지 않음; `localInput/callTool/pollWatch`는 transport/loop 소유자로 watch에 남음; E5/E7 |
| `requestStop`, `releaseSession` | 신규 named export를 `plugin/runtime/local-session.mjs`에 정의 → `plugin/bin/harness-session.mjs`와 업데이트된 watch/양쪽 orchestrator 진입 | stopping 기록과 자신의 state 제거를 분리; CLI/실제 어댑터가 §8 순서와 event/lifecycle을 검사; E7/E12 |
| TOML 생성 | `harness-init.mjs`의 client 분기 → 신규 `runtime/codex-agent.mjs` → generated TOML | allowlisted 입력과 직렬화만 담당; helper는 model dispatch나 글로벌 config 쓰기를 하지 않음; E5/E6 |
| `TokenReveal`, `OwnerTokenReveal` | 기존 `entities/project-token/index.ts` → `features/manage-token/ui/new-token-form.tsx`, `new-owner-token-form.tsx`(같은 ui 폴더), `features/create-project/ui/new-project-form.tsx`, `features/manage-user-token/ui/new-user-token-form.tsx`(모두 `src/fsd` 아래) | public API와 기존 props 유지, choice는 reveal 내부. consumer가 model 내부를 우회 import하지 않음; E10 |
| `TurnBanner`, `NextStepBox`, `DetailText`, `deriveTurn` | 기존 widget 내부 소유 → `widgets/turn-banner/index.ts` → `src/app/(app)/p/[slug]/layout.tsx` | UI 선택만 변화; server-only `index.server.ts`·`api/turn-data.server.ts`의 DB 정책 보존; E10 |
| `gateActionHint`, `gateActionLabel`, `gateTooltip`, `gateCopyId` | 기존 `entities/pipeline/model/gate-copy.ts` → `entities/pipeline/index.ts` → pipeline-rail 및 review-gate의 `model/gate-text.ts` | 같은 layer의 다른 slice 내부를 직접 import하지 않음, 버튼/tooltip public API 보존; E10 |
| 보고서 생성·검증 | 신규 `scripts/rehearse-dual-client-runtime.ts`의 report emitter/parser/validator → phase 기록 및 `--validate-report-only` → 같은 파일의 exported 검증 함수와 신규 `.test.ts` | 기존 report README/template의 구조를 보존; import 시 CLI/model/network/file write 실행 없음; E11의 명시적 Node test 및 최종 파일 read-back |

보존 검사 대상은 `src/server/mcp/auth.ts`, `auth.test.mjs`, `owner-tools.ts`, `owner-tools.test.mjs`, `owner-deps.ts`, `owner-gate.ts`, `views.ts`, `views.test.ts`(같은 mcp 폴더), `src/server/pipeline/run-query.ts`, `board-query.ts`, `run-rules.ts`, `board-rules.ts`(같은 pipeline 폴더), `packages/core/watch.mjs`, `packages/core/watch.test.mjs`, `packages/core/render.mjs`, `packages/core/render.test.mjs`, `prisma/schema.prisma`, 루트 `./tsconfig.json`, `./package.json`, `.github/workflows/check.yml`다. client를 DB 조회 identity·Prisma column·owner auth·executor kind·pipeline graph에 넣지 않는 부정 검사를 E4/E11에서 수행한다. 기존 REST `/api/runbook` route/service와 생성기 토큰 prefix/저장 정책도 보존한다.

이 보존 경계의 추가 정확한 파일은 `src/app/api/runbook/route.ts`, `src/server/runbook-query.ts`, `src/server/runbook-query.test.ts`, `src/server/rest-scope.ts`, `src/server/rest-scope.test.ts`, `src/fsd/widgets/turn-banner/index.ts`, `src/fsd/widgets/turn-banner/index.server.ts`, `src/fsd/widgets/turn-banner/api/turn-data.server.ts`, `src/fsd/features/manage-token/ui/new-token-form.tsx`, `src/fsd/features/manage-token/ui/new-owner-token-form.tsx`, `src/fsd/features/create-project/ui/new-project-form.tsx`, `src/fsd/features/manage-user-token/ui/new-user-token-form.tsx`, `src/app/(app)/settings/tokens/page.tsx`, `src/app/(app)/p/[slug]/tokens/page.tsx`, `src/app/(app)/p/[slug]/layout.tsx`다. E4/E10/E11은 이 consumer·public API·route의 기존 스코프/props/composition을 검사한다. 보고서 양식 입력인 `docs/test-reports/README.md`, `docs/test-reports/template.md`도 읽기 전용 보존 대상으로 포함한다.

UI 타입/descriptor는 browser-safe 값만 사용한다. Node crypto를 끌어오는 token/manifest/runbook 모듈이나 `src/server`를 client bundle에 import하지 않는다. `src/app/(app)/settings/tokens/page.tsx`, `src/app/(app)/p/[slug]/tokens/page.tsx`, 프로젝트 layout의 composition 및 feature의 token 발급 props는 client 선택 때문에 서버 설정 저장을 추가하지 않는다. 이 보존 경계의 변경이 필요하면 scope 변화로 보고 문서를 다시 조정한다.

### 최종 artifact 해석과 검증

| 최종 노출 artifact | 최종 body/config를 결정하는 원본·우선순위 | post-change 검사 |
| --- | --- | --- |
| REST templates body | 인증 scope → 요청 lang → 고정 client/bundle → `deliverable`의 stub 집합 → route의 명시적 JSON | E4에서 실제 body parse. 반대 runbook/비허용 report role/step 본문 없음; runtime 소실 없음 |
| MCP step/pipeline body | 인증 scope → client/hash/marker → 현재 server entry/CAS → 선렌더된 현재 본문 → `tools.ts`의 JSON text; owner 승인 응답은 기존 별도 계약 | E4/E8에서 `content[0].text` parse. receipt/binding/runtime와 단일 step, 무승인/오류 시 dispatch 없음. Codex는 owner `next` 대신 보호된 pipeline 재조회 후 실행 |
| Claude role/runbook | 선택된 private stub → 기존 vars → `.claude/agents/pm.md`, `plan-verifier.md`, `feature-scout.md`, `doc-auditor.md`(플랜별) 및 roster dev 파일; raw Claude runbook → 기존 `CLAUDE.md` managed merge | E3/E5/E7. 고정 role 목록과 실제 roster 전체를 대조; unmanaged CLAUDE 부분 보존; 구 helper 부재의 단일 client 경로·dual 거부; Codex 지침의 AGENTS 삽입 없음 |
| Codex role/runbook | 같은 private stub → Codex 허용 frontmatter/tool mapping → `.codex/agents/pm.toml`, `plan-verifier.toml`, `feature-scout.toml`, `doc-auditor.toml`(플랜별) 및 roster dev TOML; raw Codex runbook의 `codexRunbookVersion`+vars → `docs/harness/codex-runbook.md` | E2/E4/E5에서 생성 판과 실효 source hash 일치·CRLF 정규화 및 Claude hash 경계 불변; E5 TOML parse/name/description/developer_instructions; E6 실제 loader·실효 sandbox/MCP/owner/nested/skill. 본문만으로 권한 강제 주장 금지 |
| 공통 문서/생성 lock | private `docs/plans/README.md`, `template.md`, `verification-paths.md`, `docs/agents/README.md` → 같은 target 상대 경로; 현재 파일/lock을 guard 안에서 재확인 → `harness.lock.json` | E2/E5. 공통 문서 양쪽 동일, modified hash 보존, foreign 항목 보존, retired own 역할만 lock 제외; partial writes/refuse |
| 임시 생성 guard | 생성기 공통 helper → target `harness.init.guard/owner.json`와 lock atomic tmp | E5. 성공/오류 finally 자기 nonce만 정리, concurrent loser 무쓰기, dead guard 자동 인수 없음 |
| MCP 및 verifier package | host의 실제 MCP 설정 precedence/role override + owner 제공 전체 skill의 실제 선택 경로 | E1/E6. user config의 다른 entry byte 보존, credential 부재, 상대 supporting file 완결성, shadow된 다른 버전을 성공 처리하지 않음 |
| package 설치 body | portable root manifest 없는 compatibility source → 실제 Claude/Codex manifest와 포함 파일 → host가 로드한 skill/root/bin/lib/runtime | E6. Codex는 codex/skills body를 로드하며 Claude skills 혼입 없음; private 전체 step은 배포물에 포함하지 않음; 신규 helper 포함. portable 전환은 별도 inventory/재검증 |
| local execution state/events | common Git `harness/watch.json`, `watch.lock.json`, `watch.guard/owner.json` → 현재 id/binding/policy/nonce/lifecycle 및 검증된 host task/thread 소유자 | E7/E12. 같은 watch session/정책 reuse, 별도 진입 거부, stop 시 stopping 소유·owned 단독으로 작업 금지, 종료 확인 뒤 별도 release 및 successor 보존; 늦은 이벤트·in-flight 한계 |
| 제품 화면/복사 payload | 고정 문구 계약 → 각 slice model → 현재 로컬 client state/입력 identity → render/copy | E10. 모든 inventory consumer, 선택과 payload 일치, default/reset, unavailable/readonly/empty 상태, secret 공개 예외·등록 분리 |
| DB template bundle | 승인된 source revision의 전체 정규화/검증 → 단일 seed transaction; rollback snapshot+도입 행 whitelist | E3/E4/E11. rollback 후 최종 row body/hash/marker와 Codex 미지원·Claude 열린 run 검증 |
| rehearsal report | 아래 CLI의 승인된 실제 실행 + 기존 report README/template 계약 → `docs/test-reports/active/dual-client-runtime-report.md`; 저장 때만 같은 디렉터리의 `<report-file>.tmp` | E1–E12의 required/informational 및 허용 판정·Evidence ID를 기록; phase별 이전 실행 증거 보존, probe/mock와 actual CLI/DB/browser/110분 구분. E11에서 최종 파일을 validation-only mode로 다시 parse하고 자기 tmp 정리/기존 report 보존 확인 |
| 현재 구조·사용법 문서 | E8/E11의 수용된 실제 결과 → architecture README/세부 문서와 루트 README/CONTEXT의 현재 계약 | E11. server/core/plugin 경로·두 runbook 출력·지원 surface/version·수동 재개와 조건부 watch가 문서 사이에서 일치; 실패/미실행 C0 가정을 현재 구조로 승격하지 않음 |

`AGENTS.md`, 사용자 `.codex/config.toml`, 다른 MCP entry, 다른 client 생성물은 입력/보호 대상이며 새 최종 body의 소유권을 획득하지 않는다. 설정 precedence의 실제 effective 결과는 C0/E6 blocker 해제 증거가 필요하다.

## Approval

승인 기록은 front matter의 `approved-by`, `approved-at`, `approval-scope`만을 기준으로 한다. C0 이후의 후속 구현 지시를 반영했다. 아래 phase의 blocker/stop point는 실제 지원 인증·배포 readiness에 적용하며 로컬 소스 구현을 보류하는 조건으로 적용하지 않는다. 필수 호스트 시험이 통과했다는 의미는 아니며 별도 배포 경계를 계속 적용한다.

권장 승인 단위는 C0 검증 → C1 공통 계약 → C2 어댑터 → C3 기본 지원 인수/배포 → C4 자동 watch다. 각 단계의 검증 보고서와 blocker 해제 근거를 남기고 다음 단계로 진행한다. 승인된 범위에 이미 포함된 반복 작업·수정에 대해서는 매번 승인을 다시 받지 않는다.

## Execution Plan

### Phase C0: 호스트 기능과 배포·잠금 계약 검증

satisfies: REQ-DUAL-008, REQ-DUAL-009, REQ-DUAL-011, REQ-DUAL-014, REQ-DUAL-017, REQ-DUAL-018
preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-003, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-004, CON-DUAL-005, CON-DUAL-006, CON-DUAL-008

진입: 이 단계의 실행 승인이 있어야 한다. disposable repository, loopback/mock MCP, 승인된 test 자격 증명을 사용한다. 제품 source·실제 프로젝트 상태·global 설정을 변경하지 않고 실제 모델 시험에 필요한 범위도 승인된 검증에 한정한다.

종료: E1, E6의 capability 부분, E7의 legacy state 부분과 패키징 실험 결과를 보고서에 기록한다. watch 조사는 가능성 결정이며 E12 완료로 취급하지 않는다. C1 착수에 필요한 설계 대안을 확정한다.

#### TASK-C0-01: 역할·문맥·필수 skill을 실제 로드해 검증

satisfies: REQ-DUAL-008, REQ-DUAL-009, REQ-DUAL-017
preserves: INV-DUAL-002, INV-DUAL-003
governed-by: CON-DUAL-001, CON-DUAL-004, CON-DUAL-005, CON-DUAL-008

구현/산출 위치: 제품 적용 전 disposable role TOML·fixture와 신규 `docs/test-reports/active/dual-client-runtime-report.md`. 같은 rehearsal script/test의 capability·report validation 부분을 먼저 준비하고 실제 모델 실행과 분리하여 시험한다. verifier에 부모의 판단을 심어 전달 여부를 확인하고 읽기·쓰기·scratch·tool/credential·nested 경계를 시험한다. 실제 필수 패키지의 상대 참조까지 확인한다.

검증: E1, E6. 중단 조건: BLK-DUAL-01 또는 BLK-DUAL-02가 해제되지 않으면 C2를 준비 완료로 표시하지 않는다.

#### TASK-C0-02: 배포 경로·runtime·legacy lock·watch 방식 확정

satisfies: REQ-DUAL-011, REQ-DUAL-014, REQ-DUAL-017, REQ-DUAL-018
preserves: INV-DUAL-001, INV-DUAL-003, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-004, CON-DUAL-006, CON-DUAL-008

구현/산출 위치: disposable plugin 설치와 state fixture, 같은 보고서. 양쪽 manifest discovery, helper 포함, CLI 인수, client 응답, foreground metadata·stop/release 분리 호환과 native/App Server watch 후보를 확인한다. 지원 surface·버전·재현 명령 및 fallback 결정으로 이 문서의 예정 경로를 확정한다.

검증: E1, E6, E7의 선행 부분 및 E12 설계 실험. 중단 조건: BLK-DUAL-03·BLK-DUAL-05 미해제 시 관련 C2를 차단한다. BLK-DUAL-04만 남으면 기본 지원은 계속 설계할 수 있다.

### Phase C1: 공통 runtime 계약과 private 절차

satisfies: REQ-DUAL-001, REQ-DUAL-007, REQ-DUAL-010, REQ-DUAL-012, REQ-DUAL-014, REQ-DUAL-017, REQ-DUAL-020
preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-003, INV-DUAL-004, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-003, CON-DUAL-005, CON-DUAL-008

진입: C0의 계약 결정, private 변경 권한·revision 및 이 단계 승인이 있어야 한다. 구현 PR은 최신 검증된 dev에서 시작한다. private source 작업과 server 작업을 별도 변경으로 추적한다.

#### TASK-C1-01: client 선택·runbook·생성 lock 확장

satisfies: REQ-DUAL-001, REQ-DUAL-012, REQ-DUAL-014
preserves: INV-DUAL-001, INV-DUAL-003
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-003, CON-DUAL-005

구현 위치: inventory의 신규 client-runtime, 기존 deliver/runbook/vars/manifest와 정확한 tests, 동기화된 plugin lib. 고정 marker/필수 bundle 규칙, 기존 함수 default 및 lock v1 읽기, client runbook 선택, 반대 client 항목 보존과 현재 client retired 역할 처리를 구현한다. §4의 기존 runbook export/raw hash/Claude 정규화 호출 경계를 유지하고 신규 `codexRunbookVersion`만 추가하여 서버 Codex resolver와 init 분기에 연결한다. 신규 client-runtime 모듈은 browser-safe 순수 값/판정만 export한다.

검증 위치: E2의 core tests와 plugin-lib check. 중단 조건: Claude의 기본 전달 집합 또는 사용자 파일 보호 회귀.

#### TASK-C1-02: private 공통 step과 Codex runbook 추가

satisfies: REQ-DUAL-001, REQ-DUAL-014, REQ-DUAL-017
preserves: INV-DUAL-002, INV-DUAL-003, INV-DUAL-004
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-003, CON-DUAL-008

구현 위치: inventory의 승인된 private agent 5개, 신규 Codex runbook, 기존 Claude runbook/docs/template tests, seed script와 신규 template-seed-query/test. marker와 전체 source 검증, 단일 seed transaction, 이전 body snapshot 및 도입 Codex 행 whitelist 복구를 구현한다. 전체 agent 본문을 client별로 복사하지 않는다. 구 Claude 생성기가 받는 stub·docs·runbook의 미지원 변수를 금지한다. Claude runbook에는 §8의 helper 유무/호환성·단일/dual checkout 분기와 watch session reuse를 적용하며 기존 단일 client 경로를 보존한다.

검증 위치: E3, private revision 보고서. 중단 조건: graph/role 권한 변경, 필수 파일 누락, BLK-DUAL-02 미해제.

#### TASK-C1-03: REST/MCP client 전달과 호환 응답

satisfies: REQ-DUAL-001, REQ-DUAL-007, REQ-DUAL-010, REQ-DUAL-014, REQ-DUAL-020
preserves: INV-DUAL-001, INV-DUAL-003, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-003, CON-DUAL-005

구현 위치: inventory의 REST/MCP/agents/runbook 파일과 tests. 인증과 기존 원장 lookup/CAS는 재사용한다. key/overview 모두 변경 전 Codex hash 검사, 실효 언어/전체 bundle 확인, `withCursor` 전 전체 step 선렌더, REST 최종 body와 MCP JSON text runtime echo를 같은 변경으로 적용한다. render 오류 때 신규 run/usage/outcome commit이 없음을 확인한다.

검증 위치: E4의 기존 server tests와 신규 integration client-runtime test. 중단 조건: client가 권한·원장 identity·cap 판정에 영향을 주거나 구 서버/누락 hash를 정상 Codex 지원으로 오인함.

### Phase C2: Codex 실행 어댑터와 공통 로컬 세션

satisfies: REQ-DUAL-002, REQ-DUAL-003, REQ-DUAL-006, REQ-DUAL-008, REQ-DUAL-009, REQ-DUAL-010, REQ-DUAL-011, REQ-DUAL-012, REQ-DUAL-013, REQ-DUAL-014, REQ-DUAL-016, REQ-DUAL-017, REQ-DUAL-019
preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-003, INV-DUAL-004, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-004, CON-DUAL-005, CON-DUAL-006, CON-DUAL-007

진입: C1 계약과 tests가 통과하고 BLK-DUAL-01·02·03·05의 이 단계 관련 부분이 해제되어야 한다. C0의 실제 호스트 결과를 적용하며 새로운 미검증 adapter 대안으로 건너뛰지 않는다.

#### TASK-C2-01: Codex 패키지·초기화·MCP 연결

satisfies: REQ-DUAL-002, REQ-DUAL-012, REQ-DUAL-013, REQ-DUAL-014, REQ-DUAL-017
preserves: INV-DUAL-001, INV-DUAL-003
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-004, CON-DUAL-005

구현 위치: inventory의 Codex manifest/skills, harness-init 및 codex-agent adapter와 bin tests. 공통 init guard/현재 파일 재확인/lock 마지막 atomic write, mode 충돌과 dry-run 무쓰기, 단계별 partial failure/refuse/adopt를 구현한다. 양쪽 공존에는 업데이트된 공통 생성기를 요구하고 MCP 등록은 해당 entry만 관리한다. 외부 skill 사전검사는 파일 생성보다 앞서며 전 단계 성공 후에만 ready를 선언한다.

검증 위치: E5, E6. 중단 조건: 반대 client 파일·config 수정, token 노출, 구 서버에서 초기화 완료 처리, package 경로 불일치.

#### TASK-C2-02: 역할 dispatch 및 명시적 run/resume

satisfies: REQ-DUAL-003, REQ-DUAL-006, REQ-DUAL-008, REQ-DUAL-009, REQ-DUAL-010, REQ-DUAL-016, REQ-DUAL-017
preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-003, INV-DUAL-004, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-004, CON-DUAL-005, CON-DUAL-007

구현 위치: Codex run/resume skills와 생성 role 지침. §7의 format/key/entry/agentRunId/receipt/done matrix를 구현하고 runtime echo·artifact 검증·main-loop acceptance·handoff 종료를 따른다. Codex owner 승인/저장된 advice 실패 뒤에는 §5의 client/hash가 있는 pipeline을 재조회하고 owner next를 직접 실행하지 않는다. done 후 역할의 조회 반복으로 run을 새로 만들지 않는다. 독립 reviewer에는 최소 briefing과 실제 완전한 검증 skill을 제공한다.

검증 위치: E1, E6, E8의 실제 CLI 역할 실행. 중단 조건: 역할 권한·독립성 실패, 산출물 불명확 상태에서 성공 처리 또는 승인 우회.

#### TASK-C2-03: foreground/watch 공통 소유권과 취소

satisfies: REQ-DUAL-011, REQ-DUAL-016, REQ-DUAL-019
preserves: INV-DUAL-001, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-004, CON-DUAL-006, CON-DUAL-007

구현 위치: inventory의 local-session helper/harness-session CLI, harness-watch와 양쪽 진입부, bin tests. symbol 표의 함수를 추출하고 기존 watch에 중복 소유권 구현을 남기지 않는다. §8의 진입 표에 따라 watch→main-loop는 같은 session/실제 정책을 reuse하며 foreground를 중첩 start하거나 watcher의 소유권을 반납하지 않는다. v1 binding은 그대로 두고 top-level metadata, permission pending 소유·stopping, `requestStop`/`releaseSession`과 네 CLI operation을 구현한다. 새 어댑터는 stop→호스트 자식 종료 확인→release 순서와 owned+active 판정을 사용하고 legacy stop으로 잠금을 먼저 지우지 않는다. token/config-free stop/release와 늦은 이벤트 차단, stopping을 존중하는 poller cleanup도 구현한다. poll deadline과 잠금 수명을 구분한다.

검증 위치: E7, 기존 harness-watch tests. 중단 조건: 활성 legacy session의 잠금을 넘겨주거나 force를 자식 취소로 간주함, BLK-DUAL-05 미해제.

### Phase C3: 양방향 재개 인수 시험과 기본 지원 출시

satisfies: REQ-DUAL-001, REQ-DUAL-003, REQ-DUAL-004, REQ-DUAL-005, REQ-DUAL-006, REQ-DUAL-007, REQ-DUAL-010, REQ-DUAL-014, REQ-DUAL-015, REQ-DUAL-017, REQ-DUAL-018, REQ-DUAL-020
preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-003, INV-DUAL-004, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-003, CON-DUAL-005, CON-DUAL-006, CON-DUAL-008

진입: C2의 실제 호스트 시험과 관련 필수 blocker가 모두 해제되어야 한다. staging 인수 시험·private seed·배포는 승인된 환경/범위에서 수행한다.

#### TASK-C3-01: 실제 전체 주기 및 교차 재개 검증

satisfies: REQ-DUAL-003, REQ-DUAL-004, REQ-DUAL-005, REQ-DUAL-006, REQ-DUAL-007, REQ-DUAL-010, REQ-DUAL-020
preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-004, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-004, CON-DUAL-005, CON-DUAL-006, CON-DUAL-008

구현/증거 위치: 신규 `tests/server/integration/client-runtime.test.ts`의 실제 DB 시험 6개와 rehearsal의 `--phase acceptance`. 두 client 순서×legacy/slots-v1 승인·동일 원장/receipt/usage 및 전량 preflight·seed rollback/제한 복구를 별도 TEST_DATABASE_URL에서 검증한다. acceptance 자동 phase는 준비된 별도 checkout과 보호된 test DB 계약만 실행하고 모델을 호출하지 않는다. 실제 두 CLI의 EX-DUAL-004A, EX-DUAL-005A, EX-DUAL-010A 전체 주기는 별도로 수행해 파일·독립 검증·승인·commit 증거를 추가한다. phase는 그 실제 host/browser gate를 NOT RUN으로 남겨 DB PASS만으로 전체 완료를 선언하지 않는다.

검증 위치: E4, E8, E9. 중단 조건: 동일 열린 run의 중복 생성/usage 증가, 다른 commit acceptance, 필요한 파일 누락 무시. 새 entry의 정상 run은 기존 cap/usage에 따라 별도로 검증한다.

#### TASK-C3-02: 연결·다음 단계 안내와 사용성

satisfies: REQ-DUAL-001, REQ-DUAL-015, REQ-DUAL-018
preserves: INV-DUAL-001, INV-DUAL-002
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-003, CON-DUAL-008

구현 위치: inventory에 열거한 token·turn·gate·landing·backlog·project connection·user/project tokens의 모든 copy consumer와 product-copy/retired-copy tests. FSD public API를 유지하며 로컬 표시 state/identity reset을 연결한다. 기본 Claude와 Codex 명시적 재개를 표시하고 미완료 watch 옵션은 제공하지 않는다. 기존 일회성 secret 공개/hu 저장과 token-free MCP 등록을 구분한다.

검증 위치: E10, frontend model/render tests와 실제 브라우저. 중단 조건: 복사 명령 불일치, 허용된 공개 영역 외 token 값 노출, 안내 선택으로 서버 상태 변경, 검증 전 자동 watch 약속.

#### TASK-C3-03: 호환 배포와 현재 구조 문서 갱신

satisfies: REQ-DUAL-001, REQ-DUAL-014, REQ-DUAL-017
preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-003, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-002, CON-DUAL-005, CON-DUAL-008

구현/증거 위치: 승인된 server/private/plugin release와 inventory의 구조/문구 문서. 서버 선배포 → atomic staging private seed → 양쪽 실제 인수 시험 → 호환 plugin/안내 공개 순서로 진행한다. 기존 단일 client Claude와 업데이트된 양쪽 init 조합을 구분하고 source revision/cache, 이전 body snapshot, 도입 행 whitelist 및 실제 복구 근거를 기록한다. `docs/architecture/README.md`의 현재 상태·런북 공급·plugin 경계와 연결된 세부 문서를 실제 수용된 지원 범위로 함께 갱신한다. 그 전에는 이 제안서가 현재 architecture를 대체하지 않는다.

검증 위치: E11와 배포 후 양쪽 연결·재개 smoke. 중단 조건: Claude 구 생성기 회귀, Codex 지원 응답과 실제 template 불일치, 필수 패키지 누락 또는 롤백 재현 실패.

### Phase C4: 조건부 Codex 자동 watch

satisfies: REQ-DUAL-018, REQ-DUAL-019
preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-004, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-004, CON-DUAL-005, CON-DUAL-006, CON-DUAL-007, CON-DUAL-008

진입: 별도 실행 승인과 BLK-DUAL-04의 호스트 기능 증거가 있어야 한다. C3 기본 지원의 완료를 위해 미확인 watch를 추가하지 않는다.

#### TASK-C4-01: 검증된 재진입 어댑터 구현

satisfies: REQ-DUAL-018, REQ-DUAL-019
preserves: INV-DUAL-001, INV-DUAL-002, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-004, CON-DUAL-005, CON-DUAL-006, CON-DUAL-007

구현 위치: inventory의 C4 native skill 또는 Codex App Server runner와 bin tests. Codex client/hash/echo가 있는 poll transport, target thread/turn/session 고정, 같은 watch session/정책의 main-loop reuse, idle no-model polling, permission relay, active-turn 중복 방지, interrupt 및 reader/timer/listener cleanup을 구현한다. pending permission 때 소유권을 반납하지 않고 §8의 stop→실제 종료 확인→release를 사용한다. stopping의 owned 응답으로 재진입하지 않는다.

검증 위치: E12. 중단 조건: 임의 앱 대화 재진입 가정, sandbox 밖 명령 우회, permission 자동 승인 또는 모델 idle polling.

#### TASK-C4-02: 장시간·취소 시험 후 watch 안내 공개

satisfies: REQ-DUAL-018, REQ-DUAL-019
preserves: INV-DUAL-002, INV-DUAL-004, INV-DUAL-005
governed-by: CON-DUAL-001, CON-DUAL-004, CON-DUAL-006, CON-DUAL-007, CON-DUAL-008

구현/증거 위치: 실제 watch 보고서, 확정된 Codex watch skill 및 제품 안내. 110분 idle, 작업 발견, gate 대기/승인, handoff, auth/cap, stop 및 늦은 이벤트를 시험한다. 지원하는 호스트·버전·재진입 방식만 안내한다.

검증 위치: E12 및 E10의 watch 안내 추가 부분. 중단 조건: 실제 장시간 증거 없음, stop 후 dispatch/재설정 또는 실행 중 자식 취소 상태 불명확.

## Verification Plan

아래 E1–E12는 **예정 검증**이다. 구현과 승인된 환경이 준비된 뒤 실행하며 결과는 실제 버전·명령·환경과 함께 보고서에 기록한다. 이 제안서의 구조 검증은 제품 검증과 별개다.

### E1: Codex 호스트 capability 및 권한

verifies: REQ-DUAL-008, REQ-DUAL-009, REQ-DUAL-014, REQ-DUAL-017

실제 CLI, disposable Git repository, loopback MCP를 사용한다. 부모에만 둔 canary 판단이 verifier에 전달되는지, repo write가 차단되고 scratch만 가능한지, role별 도구 목록·nested tools·owner server/credential이 실제로 격리되는지 시험한다. 문구만 준수한 결과와 permission 경계가 강제된 결과를 구분한다. 부모 live override, 프로젝트 trust, protected path, 실제 역할 로더도 확인한다.

### E2: 순수 공통 계약과 lock

verifies: REQ-DUAL-001, REQ-DUAL-010, REQ-DUAL-012, REQ-DUAL-014

inventory의 core tests에 legacy default/invalid enum, client별 deliver 집합과 실효 언어 hash, CRLF 정규화, marker/필수 bundle, runtime 변수 allowlist를 추가한다. lock 양쪽 init 순서, 반대 client/미분류 항목 보존, 현재 client entitlement 제외 역할의 lock 제거/파일 보존, modified skip의 기존 hash 유지, unlocked refuse/adopt를 검증한다. 기존 유지 fixture의 byte 결과와 새 neutral source의 허용된 문구 변경을 구분한다. plugin lib check로 모든 대응 복사본의 동일성을 확인한다.

runbook tests에서는 동일 내용의 LF/CRLF 원문을 기존 `runbookVersion`에 직접 주면 서로 다른 hash이고, Claude init처럼 호출 전에 정규화하면 기존 LF 판과 같음을 확인한다. 기존 네 export·raw hash·전체 언어 stale/fallback 결과는 변경 전 fixture와 일치해야 한다. 신규 `codexRunbookVersion`은 LF/CRLF hash가 같고 다른 source 편집에는 달라야 한다. 서버/생성기 Codex 분기의 실제 helper import도 확인하며, 이 회귀를 공통 hash 함수에 정규화를 넣어 통과시키지 않는다.

### E3: private template과 구 Claude 생성기

verifies: REQ-DUAL-001, REQ-DUAL-008, REQ-DUAL-009, REQ-DUAL-014, REQ-DUAL-017

승인된 private revision의 templates.test.mjs에서 두 client 렌더, 미정의 변수 없음, step ID/전이/requires 동일성, role allowlist, entitlement 집합 및 stub 본문 비노출을 확인한다. 구 Claude 생성기의 단일 client fixture로 공통 stub/docs/Claude runbook을 렌더하고, dual 저장소에는 업데이트된 생성기를 사용해 양쪽 init을 검증한다. Codex runbook/marker/필수 role이 하나라도 누락되거나 다른 protocol이면 미지원인지 확인한다. template-seed-query.test.ts는 모든 parse가 쓰기보다 앞서는지와 중복/누락/잘못된 source의 전체 무쓰기를 검사한다. 실제 transaction fault 및 rollback row 삭제 범위는 E4/E11에서 검증한다.

구 plugin에 신규 session helper가 없는 상태에서 새 Claude runbook을 생성해 실행 경로까지 확인한다. 단일 client의 helper 부재는 기존 경로를 유지하되 dual checkout은 업데이트 안내로 중단하고, 존재하는 helper의 실패/미지원 버전은 legacy 우회가 없어야 한다. 렌더 성공만으로 구 plugin이 신규 helper를 실행할 수 있다고 판정하지 않는다.

### E4: 서버 계약 및 실제 원장 integration

verifies: REQ-DUAL-001, REQ-DUAL-004, REQ-DUAL-005, REQ-DUAL-007, REQ-DUAL-010, REQ-DUAL-014, REQ-DUAL-020

inventory의 route/query/tools/deps/next/vars/runbook tests에서 client 전달/invalid enum, **최종 REST JSON과 MCP JSON text**의 runtime, 언어·인증·접근·429, Codex missing/malformed/stale hash와 Claude fallback을 확인한다. REST의 요청 언어 무fallback, MCP의 완전한 단일 언어 선택/부분 bundle 거부, 다른 언어 hash 거부를 확인한다. key/overview 각각에서 지원/hash 검사 실패 시 advance/head/open run 호출 0회인지 spy로 확인한다. agent의 미정의 runtime 변수/marker 누락은 outcome 유무와 관계없이 `withCursor` 전 실패하고 run/usage/step 기록이 불변이어야 한다. done:false와 done:true의 기존 서로 다른 shape도 검사한다.

Claude stale 검사에는 LF/CRLF DB body, 명시 reported 판 및 `Project.runbookVersion` fallback fixture를 넣어 기존 raw 비교 결과를 보존한다. Codex resolver의 선택 source에는 별도 정규화 helper를 적용하고 init이 기록한 판과 일치해야 한다. 어느 Codex 요청도 Claude fallback 판을 수정하거나 기존 raw 함수의 의미를 바꾸지 않아야 한다.

실제 테스트 PostgreSQL에서는 같은 열린 run 재개, 다른 유효 token의 step caller, 만료/폐기/다른 scope 거부, slots-v1 entry/agentRunId/key 규칙, verify의 plan-verifier dispatch, CAS 충돌·transaction rollback·승인 전후 current entry를 확인한다. 같은 열린 run의 usage 불변과 done 후 합법적인 새 run의 usage 증가를 각각 검사한다. seed 중간 fault에서 기존 bundle 전체가 보존되고 복구 transaction이 whitelist Codex 행만 제거하는지도 실제 최종 row body로 검증한다. fake transaction spy를 PostgreSQL rollback 증거로 사용하지 않는다.

`scripts/test-server-integration.mjs`의 보호 장치를 유지한다. `TEST_DATABASE_URL`은 별도 `stagekeeper_test_*` database이고 제품 `DATABASE_URL`과 대상이 달라야 한다. 실제 프로젝트 DB를 이 시험에 사용하지 않는다.

### E5: 초기화의 child-process 시험

verifies: REQ-DUAL-002, REQ-DUAL-012, REQ-DUAL-013, REQ-DUAL-014, REQ-DUAL-017

업데이트된 공통 생성기로 Claude→Codex/Codex→Claude/반복 init, modified/retired/foreign lock, 사용자 파일 충돌, dry-run 및 dry-run+register 거부를 child-process로 시험한다. 동일 root concurrent init은 guard 승자 하나와 loser 무쓰기이며 현재 lock 재확인 후 다른 client 항목이 남아야 한다. dead guard는 자동 정리하지 않는다. 부분 파일 write/마지막 lock rename/MCP 등록/project sync 각각의 fault에서 완료 단계, tmp/nonce cleanup, 재실행 unlocked refuse와 명시적 adopt를 확인한다.

반대 client 파일/사용자 config/unmanaged CLAUDE/AGENTS는 byte 비교한다. 구 서버·local source만 있는 상태에서 서버 echo가 없는 경우 files-ready/dispatch를 선언하지 않는다. 실제 생성 TOML을 parser로 검사하고 공백/한글 경로 및 PowerShell/Git Bash quoting을 시험한다. helper/MCP 등록 argv·로그·배포 파일에는 token 값이 없으며 사용자 일회성 token 공개 명령을 이 부정 검사와 혼동하지 않는다. 구 생성기를 dual 저장소 재초기화 지원 버전으로 표시하지 않는다.

LF/CRLF source로 실제 init을 실행해 Codex 생성 runbook의 판이 `codexRunbookVersion` 및 서버의 실효 source 판과 일치하는지 확인한다. 프로젝트 변수로 렌더된 출력의 hash를 source 판으로 쓰지 않아야 한다. Claude의 생성·POST 판은 기존 호출 전 정규화 fixture와 같고 Codex init은 그 저장 판을 변경하지 않아야 한다.

### E6: 실제 설치·역할·skill 로드

verifies: REQ-DUAL-002, REQ-DUAL-006, REQ-DUAL-008, REQ-DUAL-009, REQ-DUAL-017

실제 설치물에서 manifest, skill root, helper, generated role 및 mandatory skill의 경로·revision/checksum을 확인한다. 동명 skill, 누락 상대 참조, protected path 승인 실패, 부모 설정 override, malformed TOML, 잘못된 runtime를 준비 완료로 인정하지 않는지 시험한다. Codex 실패 응답의 legacy init 안내는 `$harness-init`으로 복구하며 Claude 초기화를 호출하지 않아야 한다. fresh native 또는 승인된 fresh-thread 방식에서 E1의 경계를 다시 확인한다. private source checkout 존재를 실제 배포 package의 완결성으로 대신하지 않는다.

compatibility 배포물에는 portable root `plugin.json`/`mcp.json`이 없고 Codex manifest의 skills 경로가 정확히 `./codex/skills/`인지 JSON parse와 실제 skill 로드로 확인한다. portable fixture에서는 overlay 경로가 root skills를 대체하지 않는 우선순위도 확인해 이 형식을 섞은 배포물을 성공으로 처리하지 않는다. 실패 시 BLK-DUAL-03을 유지하고 경로·Task·artifact·검증을 갱신한다.

### E7: 혼합 클라이언트의 로컬 소유권

verifies: REQ-DUAL-011, REQ-DUAL-016, REQ-DUAL-019

기존 watch/bin 및 신규 session tests에서 양쪽 client의 foreground/watch 모든 충돌 조합, linked worktree common Git 공유, v1 active/오래된 seenAt, top-level metadata와 정확한 binding shape, dead guard, concurrent start/stop/force, token/config 변화와 config-free stop을 시험한다. poll 110분 종료 후 idle lock은 남고 permission pending/자식 실행/stopping에서도 잠금은 남아야 한다. quiescent gate/handoff/종료에서만 foreground 반납하며 종료 확인 유실은 새 dispatch를 막고 명시 복구로 끝난다.

신규 session CLI의 네 operation·JSON event/lifecycle을 child-process로 확인한다. stop·반복 stop 후 lock/policy는 남고 check는 owned+stopping이며 dispatch/outcome/rearm 호출은 0회여야 한다. 실제 어댑터 spy/호스트 시험에서는 종료 확인 전 release 호출 0회, 확인 후 release 1회와 해당 파일 부재를 검사한다. check/stop/release의 foreign id 및 늦은 이전 id는 successor byte를 보존한다. token/config 없는 stop/release, 옵션 충돌 무쓰기, 새 helper의 export/import와 legacy stop 호출 0회도 검사한다. stop atomic write와 release의 각 unlink fault는 성공 event가 없고 불완전한 state에서 새 start가 차단되어야 한다. updated poller가 stopping을 보아 새 요청을 만들지 않고 terminal cleanup이 잠금을 먼저 제거하지 않는지 확인하며, legacy 단독 CLI의 기존 stopped 응답과 cleanup은 별도 회귀 fixture로 보존한다.

현재 watch의 work 완료 → 같은 main-loop cycle → rearm 연결은 기존 watch ID/정책/lock을 유지하며 추가 foreground start/stop 호출 0회여야 한다. `propose:no`가 head만 제외하고 기존 item slot은 허용하는지, child 종료나 한 item의 gate가 watch 전체를 release하지 않는지 검사한다. 별도 수동 진입·다른 client·틀린 task/thread에서 session ID를 전달해도 reuse가 거부되어야 한다. 이 호스트 출처 확인은 mock fixture와 실제 Claude/Codex 실행을 구분하여 기록한다.

ownership 상실 후 새 dispatch/outcome/rearm 없음, legacy force/stop 이후 이전 자식 중단 확인, stale nonce cleanup의 successor byte 보존, listener/timer/reader/임시 파일 정리 및 늦은 완료 이벤트 무시를 확인한다. in-flight 기록 가능성과 별도 clone/옛 수동 작업의 한계도 명시한다. 함수 이동은 기존 watch에 중복 소유권 구현 부재와 신규 helper의 실제 import를 함께 검사한다.

### E8: 두 CLI의 전체 주기와 승인 지점 전환

verifies: REQ-DUAL-001, REQ-DUAL-003, REQ-DUAL-004, REQ-DUAL-005, REQ-DUAL-006, REQ-DUAL-008, REQ-DUAL-010, REQ-DUAL-020

실제 Claude와 Codex로 각각 전체 주기를 완료하고 Claude→Codex 및 Codex→Claude 승인 경계 전환을 수행한다. 미승인 대기, 승인된 plan commit, reviewer의 독립성, 반복 결함/hold, workspace 역할 및 acceptance 다섯 항목을 확인한다. 기존 Free 정책과 verifier가 있는 플랜을 구분하여 시험한다. 각 전환의 BoardItem/PipelineRun/AgentRun ID, caller, usage 및 plan/report commit을 비교한다.

Codex main-loop의 명시적 owner 승인 성공, 승인 저장 뒤 advice 실패, 승인 요청 응답 유실을 각각 시험한다. owner 응답에 runtime이 없어도 승인 결과와 Codex 실행 호환 판정을 구분하며, dispatch 전에 반드시 client/hash를 갖는 fresh pipeline을 조회해야 한다. 그 사이 bundle/hash가 바뀌거나 재조회가 실패하면 gate 재승인·역전이 없이 dispatch 0회다. 기존 owner endpoint의 schema/응답/인가와 Claude 처리도 E4/E11에서 보존한다.

### E9: 중간 step·산출물·권한·오류

verifies: REQ-DUAL-004, REQ-DUAL-006, REQ-DUAL-007, REQ-DUAL-010, REQ-DUAL-016, REQ-DUAL-020

열린 implement/verify/report step의 전환, 다른 유효 token, 필요한 commit이 없는 다른 checkout, unpushed commit, dirty tree, 누락 plan/report, 이전 receipt, handoff와 새 commit 허가를 시험한다. token expiry/revoke, 429·cap·단절·반복 실패에서 무한 재시도나 자동 승인이 없는지 확인한다. 서버에서 이미 받은 승인과 새 호스트의 tool permission을 분리해 검증한다.

### E10: UI·복사 명령·브라우저

verifies: REQ-DUAL-001, REQ-DUAL-015, REQ-DUAL-018

inventory에 명시한 모든 UI/copy model/render tests와 실제 browser를 검사한다. 선택 handler가 실제 display/copy payload를 바꾸고 setup와 next 표시가 일치하는지, token/mcpUrl/slug identity 변경 시 기본값 reset, 같은 프로젝트 tab 이동의 일관성, 빈 next와 readonly/unavailable 조건을 확인한다. 긴 key/좁은 화면, 실제 복사한 Claude/Codex 명령도 시험한다. 안내 변경에 token/DB action 호출은 0회여야 한다.

token 평문이 허용되는 기존 일회성 공개 영역과 hu 저장 명령의 기존 계약은 유지하고, MCP 등록/다음 단계 payload/로그에는 secret을 넣지 않는다. product-copy의 해당 잠금 블록과 모든 소비 tests를 함께 갱신하며 default Claude 전용 명령을 제거하지 않는다. C3에는 Codex 자동 watch 안내가 없어야 하고 C4 후 검증된 환경에만 표시한다.

### E11: 전체 회귀 및 호환 배포

verifies: REQ-DUAL-001, REQ-DUAL-002, REQ-DUAL-012, REQ-DUAL-013, REQ-DUAL-014, REQ-DUAL-017

repository의 필수 check/test/build 및 별도 server/templates/DB 검증을 실행한다. 구 Claude 단일 client+새 서버, 업데이트된 양쪽 init+dual 저장소, 신규 Codex+완비 bundle, 누락/혼합 marker bundle, 구 서버+신규 Codex fail-closed를 각각 확인한다. package에 helper/runtime이 포함되고 private 전체 step이 노출되지 않아야 한다. 승인된 staging/release에서 source revision/server/plugin/template/cache와 DB snapshot/도입 행 inventory를 확인하고 양쪽 smoke 및 실제 롤백을 검증한다. 역seed만으로 새 Codex 행이 삭제되었다고 가정하지 않는다.

구 Claude는 구 runbook 실행과 새 runbook 재생성 후 실행을 분리하여 검사한다. helper 부재의 legacy-only 경로, dual checkout의 업데이트 요구, helper 오류의 중단과 기존 watch ID reuse를 최종 설치물에서 확인한다. read-only 보존 inventory의 REST/스코프/public API/props/route composition과 보고서 형식 입력을 함께 확인한다.

최종 core/plugin lib의 기존 runbook export·raw hash 및 Claude init/seed/stale 호출 경계가 동일하고, Codex hash helper가 양쪽 소비자에 연결되었는지 확인한다. 기존 `Project.runbookVersion`의 재해시/backfill은 없어야 한다.

architecture README와 세부 문서/루트 사용법의 현재 runtime·runbook·출력 경로·지원 범위가 실제 artifact와 일치해야 한다. 신규 rehearsal tests는 report의 잘못된 metadata/enum/배열/중복 ID/끊긴 기준·Evidence 참조/날짜·경로 불일치/잘못된 전체 판정 및 이전 phase 증거 소실을 거부하는지 확인한다. concurrent writer·중간 write/rename 실패에서 기존 보고서 byte 보존과 자기 tmp만 정리하는지도 확인한다. validation-only의 `--phase`/`--root` 병용, 누락/unknown 옵션은 read 외의 효과 전에 거부한다. 해당 mode와 test import는 모델·MCP·DB·설정·파일 write를 시작하지 않아야 한다. structure-valid active/blocked/fail report가 제품 PASS를 뜻하지 않는 것도 확인한다. 각 phase 기록 후와 lifecycle 이동 후에는 최종 report 파일을 아래 명령으로 다시 읽어 검사하며, 내용의 증거 신뢰성·민감정보·cleanup은 별도 수동 검토한다.

### E12: 조건부 watch 실제 실행

verifies: REQ-DUAL-018, REQ-DUAL-019

확정된 native 또는 runner 방식의 실제 thread/turn/session으로 110분 idle 시험을 수행한다. 모델 호출 없는 poll, 작업 발견 후 재진입, gate 대기·웹 승인·동일 entry 재개, handoff, token/cap/permission 대기, stop/interrupt, active turn 중복, 늦은 이벤트, ownership 상실 후 rearm 없음과 Claude watch 동작을 확인한다. 관찰한 latency·poll 수·모델 호출 수·종료 이유를 기록한다. 장시간 idle 없이 짧은 fixture만 통과한 것은 watch 출시 증거가 아니다.

wake-up → 역할 실행 → idle rearm 동안 같은 watch session/client/정책을 유지하는지 확인한다. runner/native의 task/thread 출처 확인 없이 외부 수동 resume가 watch lock을 재사용하거나 work 완료마다 foreground 잠금을 새로 획득하는 경로는 없어야 한다.

실제 permission pending/active turn에서 stop을 요청하면 먼저 stopping을 기록하고 host cancel/interrupt와 종료 확인이 끝날 때까지 lock을 유지해야 한다. 이 사이 owned 응답·늦은 완료 신호로 turn/start나 release를 호출하지 않는다. 종료 확인 뒤에만 release하고 새 client start를 허용하며, 확인 실패는 잠금 보존과 명시적 복구로 끝난다.

### 예정 구현 검증 명령

새 framework를 추가하지 않고 Node runner를 사용한다. 구현된 rehearsal은 `--phase capability|acceptance --root <absolute-root> --report <report-path>` 또는 상호 배타적인 `--validate-report-only --report <report-path>`다. capability는 새 disposable root를 사용한다. acceptance는 별도 준비된 dual checkout과 제품 URL과 다른 `stagekeeper_test_*` TEST_DATABASE_URL을 먼저 확인한 뒤 그 DB에만 migration deploy·신규 DB 계약 6개를 실행한다. child에 제품 HARNESS/owner/API credential을 전달하지 않으며 raw 출력 대신 TAP 합계만 기록한다. 실제 CLI 모델·브라우저·설치/배포·혼합 host는 NOT RUN을 유지한다. C4 watch phase는 미지원으로 외부 효과 전에 거부하고 후속 구현 시 추가한다. 실제 두 CLI 모델 주기는 승인된 staging/test 범위에서 별도로 수행한다.

report는 `docs/test-reports/README.md`와 `template.md`를 입력으로 하는 **standard 보고서**다. 평면 front matter의 lifecycle/revision/실행 시각을 단일 기준으로 두고 Scope/Test Matrix/Commands/Evidence Registry를 연결한다. E1–E12의 각 적용 부분에 required/informational을 표시하고 README의 전체 판정 `fail > blocked > pass`를 적용한다. active 중 `result:null`을 유지하며 미실행 required를 PASS 또는 완료로 바꾸지 않는다. 반복 phase 실행은 새 실행 Evidence ID와 명령을 추가해 이전 C0/C1/인수/watch 증거를 보존하고 변경된 revision의 과거 PASS를 최신 증거로 재사용하지 않는다. 기존 보고서가 다른 캠페인/예상치 않은 형식이면 쓰기 전에 중단하며 같은 경로를 무조건 덮어쓰지 않는다. 보고서 lifecycle 이동은 기존 문서 규약대로 처리한다.

보고서 README의 `npm run docs:check`는 현재 `package.json`에 없고 대응 validator도 없다. 그 명령이 이미 구현되어 있거나 기존 check/CI에 포함되어 있다고 보고하지 않는다. 이 제안은 전역 문서 validator를 신설하지 않고, 자체 rehearsal report의 emit/parse/validation을 같은 script에서 제공한다. 새 보고서 이름은 README의 active kebab-case report 규약을 따라 `dual-client-runtime-report.md`로 한다. metadata 값은 JSON-compatible scalar/문자열 배열만 사용하는 평면 YAML subset으로 직렬화하고 Node의 JSON parser로 필드 값을 다시 읽는다. 중복/미지원 키·중첩 객체·불완전 metadata·예상하지 않은 형식은 거부하며 임의 YAML을 범용 파싱한다고 주장하지 않는다.

validation-only는 repo의 active/completed report 경로와 completed-at/파일명, metadata enum·revision·timezone, standard 섹션, 기준/실행 gate/판정/Evidence 참조, local document/증거 링크를 검사한다. 외부 링크를 fetch하거나 report를 수정하지 않는다. 구 report의 schema/phase Evidence를 파싱·검증하고 다음 기록을 append할 때 이전 증거를 보존해야 한다. 각 write 전에는 메모리의 최종 문서를 검사하고, write 후에는 디스크 파일을 다시 parse한다. 실패하면 완료·readiness로 승격하지 않고 수정 후 재검증한다. 정상 exit 0은 **report 구조의 정합성**만 뜻하며 active의 result는 null이고 required NOT RUN/FAIL은 그대로 남는다. 전체 제품 판정·직접 관찰·secret 검토를 자동으로 PASS로 바꾸지 않는다. 원문 token이나 환경 값을 diagnostic에 출력하지 않는다. 이 제한된 검증이 README의 전역 docs:check를 대체했다고 선언하지 않으며, 구현 시 실제 저장소 gate가 생겼다면 별도로 실행하고 결과를 기록한다.

실행 mode의 report 저장은 같은 디렉터리의 `<report-file>.tmp`를 exclusive create하여 writer 하나만 허용하고 그 이후 최신 기존 report를 다시 읽어 append한다. 최종 tmp의 parse/validation을 통과한 뒤 atomic rename으로 교체하며, 실패하면 기존 report를 보존한다. 성공한 rename 뒤에는 tmp 소유권을 버리고, 실패 cleanup도 exclusive create 때 확보한 file identity가 일치하는 자기 tmp에만 적용하여 successor의 새 tmp를 지우지 않는다. 이미 있는 tmp는 자동 인수·삭제하지 않고 해당 writer 종료를 확인한 뒤 명시적으로 복구한다. validation-only는 tmp/guard도 만들지 않는다. report symlink·경로 탈출·서로 다른 campaign·이전 증거 불일치는 쓰기 전에 거부한다. metadata 검증은 planned 단계에 규약이 허용하는 null/빈 배열을 존중하며 필수 키 누락과 혼동하지 않는다.

아래는 **script 구현 및 해당 실행 승인 후** Windows PowerShell에서 사용할 capability 명령이다. 현재 script가 이미 있다고 가정하거나 이번 문서 검증에서 실행하지 않는다.

```powershell
node --import tsx scripts/rehearse-dual-client-runtime.ts --phase capability --root "$env:TEMP/stagekeeper-dual-client-c0-20261003" --report docs/test-reports/active/dual-client-runtime-report.md
```

다음 두 명령도 **script/test 구현 후** 실행한다. 두 번째 명령은 실제 report read-back이며 lifecycle 이동 후에는 `--report`에 이동한 completed 경로를 지정한다. 현재 script가 없으므로 이번 MD 검토에서 실행할 수 없고 E11에서 실행 결과를 남긴다.

```powershell
node --import tsx --test scripts/rehearse-dual-client-runtime.test.ts
node --import tsx scripts/rehearse-dual-client-runtime.ts --validate-report-only --report docs/test-reports/active/dual-client-runtime-report.md
```

제품 구현 단계의 기존 Windows 검증 명령은 다음과 같다. bash에서는 `npm.cmd` 대신 `npm`을 쓴다.

```powershell
npm.cmd run sync:plugin-lib
node scripts/plugin-lib.mjs --check
npm.cmd run verify:fsd
npm.cmd run test:architecture
npm.cmd run check
npm.cmd test
npm.cmd run test:web
npm.cmd run test:server
npm.cmd run test:templates
npm.cmd run test:server:integration
npm.cmd run build
```

`check`에 lint·Next type generation·TypeScript 및 architecture 검사가 포함된다. 현재 GitHub `check` workflow는 check/test/test:web/build를 실행하고 test:server/test:templates/DB integration은 자동 실행하지 않는다. 이 별도 증거는 보고서에 직접 남긴다. `test:templates`는 실제 private source가 필요하다. sync:plugin-lib/build/DB 시험/model probe/seed는 각각 생성·DB·외부 효과가 있으므로 이번 MD 검토의 read-only 명령으로 취급하지 않는다. required check 실패는 baseline과 구분하고 architecture 오류를 승인 없이 suppress하지 않는다.

신규 rehearsal `.test.ts`는 현재 test:architecture의 `scripts/*.test.mjs` 및 test:web의 `src/` 집합에 포함되지 않는다. 따라서 위 명시적 Node test와 report validation-only 결과를 required 증거로 직접 남긴다. 기존 package scripts/CI를 바꾸거나 이 테스트가 자동으로 실행된다고 가정하지 않는다.

## Safety Analysis

| 경계 | 유지·보호 방식 | 남은 확인 |
| --- | --- | --- |
| 인증·gate | 기존 endpoint/token/owner 정책, client와 권한 분리 | E1/E4/E6/E8에서 tool·credential·실제 승인 확인 |
| 데이터·API | client는 additive 입력, run key와 graph 동일, schema migration 없음 | unsupported/missing template의 호출 전 거부, 모든 consumer와 직렬화 시험 |
| 로컬 파일 | hash 기반 ownership, 다른 client target/lock 보존, protected path 정식 승인 | 양쪽 init 순서·partial write·legacy state 실제 시험 |
| 동시 실행·취소 | common Git guard와 session, dispatch/outcome 전 check | old manual/별도 clone/in-flight 부작용은 자동 보호 대상이 아님 |
| import/패키지 | 순수 core와 plugin lib 복사본, FSD public API, 새 동적 로더 없음 | architecture/lint/type/build와 설치 artifact inventory |
| private source/seed | 별도 revision·권한·staging 검증·이전 source 복구 | 공통 stub의 구 생성기 렌더와 롤백 순서 |
| 제품 flow·상태 | 안내 선택만 추가, 현재 Project/client 저장 상태 신설 없음 | 실제 browser/render 및 복사 명령 |

public 자산 URL 삭제, ambient type 또는 analytics 계약 변경은 현재 설계 범위에 없다. implementation에서 새 runtime side effect나 설정 저장이 필요해지면 관련 inventory·contract·verifier를 추가한다.

## Risks and Rollback

주요 위험은 Codex의 실제 permission 상속, 독립 문맥 보장, template/plugin 배포 버전 차이, legacy 잠금 형식, 사용자 파일 보호다. C0와 각 blocker가 이 위험을 먼저 확인한다. 서버 receipt 보호만으로 파일 중복 편집을 막는다고 오해하지 않도록 실행 소유권과 이전 agent 중단 확인을 함께 둔다.

기본 배포 순서:

1. additive 서버를 구 Claude template/plugin 조합으로 선배포하고 legacy smoke를 통과한다.
2. 승인된 private revision을 staging에 seed하고 두 client의 렌더 및 전체 주기를 검증한다. production seed는 승인된 범위에서 진행한다.
3. Codex package를 공개하고 실제 설치·생성 파일·MCP·재개를 확인한 뒤 제품 안내를 활성화한다.
4. Codex watch는 E12가 완료된 뒤 별도로 공개한다.

롤백 순서:

1. Codex 신규 실행/watch 안내를 비활성화하고 해당 세션 및 이미 dispatch된 agent/turn의 중단 여부를 확인한다. 잠금 파일만 삭제하여 실행을 계속시키지 않는다.
2. 서버를 되돌릴 필요가 있으면 **먼저 호환되는 이전 private template 데이터를 복원**한다. §10의 snapshot/복구 transaction으로 수정된 공통 body를 되돌리고 도입된 Codex 전용 행만 제거한다. 이전 checkout 역seed는 새 행을 삭제하지 않으므로 단독 복구로 쓰지 않는다. 신규 step의 `runtime.*`를 모르는 구 서버로 먼저 되돌리면 Claude도 렌더 실패할 수 있다. 최종 DB body/hash와 Codex 미지원·Claude 렌더를 확인한다.
3. 이전 서버/plugin 조합을 복원하고 Claude 연결·init·열린 run 재개를 검증한다. 파이프라인 graph/ID가 유지되므로 기존 원장은 삭제하지 않는다.
4. 생성 파일 복원은 snapshot 및 lock으로 소유권이 확인되고 사용자가 수정하지 않은 파일에 한정한다. 양쪽 사용자 설정 전체를 지우거나 다른 client 파일을 삭제하지 않는다.
5. state 형식 변경이 필요했던 경우 승인된 migration/rollback 절차를 따른다. 활성 legacy state를 덮어쓰지 않는다.

schema migration이 없더라도 template·package·실행 session 상태 때문에 단순 코드 revert만으로 롤백 완료라고 할 수 없다. 실제 조합과 rollback rehearsal 결과를 E11에 남긴다.

## Verification Results

| 검증 | 결과 | 의미 |
| --- | --- | --- |
| 요구사항 추적 validator `--strict` | PASS: 20/20 | 2026-10-03 개선본에서 실행. REQ 20개, US 1, INV 5, CON 8, EX 4, TASK 13, BLK 5의 ID와 추적 구조 유지. 최종 저장본도 다시 실행하며 실패 시 이 기록을 갱신 |
| 최초 reconciliation | 개선점 확인, 문서에 반영 | 직렬화/검사 순서, 렌더 후 commit, bundle/seed/rollback, binding/usage, pending permission, init 공존/guard/부분 실패, token 정책, consumer/import/artifact/검증 inventory를 수정 |
| 반복 요청의 전체 reconciliation | 추가 개선점 확인, 문서에 반영 | watch→main-loop의 기존 session/정책 reuse, 구 helper 부재와 dual checkout 구분, Codex owner 승인 후 보호된 재조회, 보존 consumer 정확한 경로 및 보고서 lifecycle/증거 보존을 보완 |
| 후속 전체 reconciliation | 추가 개선점 확인, 문서에 반영 | architecture README 갱신 대상 누락, 보고서 규약의 미구현 docs:check를 발견. 실제 수용 문서와 rehearsal 전용 무쓰기 report validation/test/명령을 연결하고 report 예정 파일명을 규약에 맞춤 |
| session 계약의 전체 재검토 | 추가 개선점 확인, 문서에 반영 | 중단 의도와 잠금 반납을 분리할 CLI operation 누락을 발견. 신규 stop/release의 event·lifecycle·guard·호스트 종료 전제 및 legacy stop 보존/새 어댑터 비사용을 구현·artifact·검증에 연결 |
| hash 계약의 전체 재검토 | 추가 개선점 확인, 문서에 반영 | 공통 해시 설명이 기존 Claude raw 함수까지 정규화하도록 해석될 수 있음을 확인. 기존 함수·호출 경계·stale 판정은 보존하고 Codex 전용 named helper 및 import/fixture/완료 조건을 명시 |
| 기존 기능 baseline unit | PASS: 129 tests, 0 failures | 2026-10-03 실행. core runbook/manifest/watch 57개 + next/run-query/templates-query/runbook-stale 72개. 신규 Codex 구현이나 native 권한 증거가 아님 |
| 반복 검토의 추가 baseline | PASS: 9 tests, 0 failures | 기존 owner-tools 7개와 watch CLI의 start/check/poll/stop 및 concurrent start 2개를 실행. 로컬 mock/fixture 증거이며 신규 Codex 재조회·session 어댑터 구현의 PASS가 아님 |
| 최신 bundle의 readiness | `clean pass not completed` | BLK-DUAL-01/02/03/05의 실제 호스트·배포·혼합 버전 증거가 없어 제품 구현 readiness를 선언하지 않음. BLK-DUAL-04는 C4만 차단. 저장 후 전체 무편집 재검토 결과는 이번 응답에 기록 |
| C0 rehearsal 코드와 report validator | 구현, PASS: 24 tests / 1 skip / 0 failures | `scripts/rehearse-dual-client-runtime.ts`·동일 이름 test. capability/무쓰기 validation 분리, 미지원 phase 조기 거부, 표준 metadata·증거·required 판정, atomic writer/경합·기존 보고서 보존. Windows 파일 symlink 권한 시험 1개는 skip이며 directory junction/경로 이탈 시험은 통과 |
| 실제 Codex 역할·fresh CLI 모델 시험 | 필수 후보 FAIL / 다른 후보 BLOCKED | native 역할 선택 미제공, 자동 승인 fresh 후보의 저장소 쓰기 성공, strict named profile 및 OS-only 환경 재시험의 읽기·scratch 실행 전 거부. 보호된 원본 대신 disposable checkout에서 수행. 실제 결과·usage·재현 인수는 C0 보고서에 기록 |
| C0 package / legacy watch | 선행 fixture PASS, 제품 호환 미완료 | Codex 0.160.0 / Claude 2.1.288. 실제 compatibility package loader·Codex body/helper·Claude validator, 완전한 verifier 8개 파일/checksum, 기존 watch second start/stop 확인. 전체 제품 package/혼합 버전·quiescence는 미실행 |
| C1–C3 로컬 제품 소스 | 구현 | client/hash/echo와 전량 bundle·pre-render, 양쪽 init/lock, fresh role/MCP bridge·session, Codex handoff projection, seed/restore, 연결·재개 UI/skill, architecture·사용법 반영. public/private는 별도 미커밋 source이며 운영 seed·등록·배포하지 않음 |
| E1–E12 제품 검증 | 미완료 | source/contract 일부 통과. 실제 양방향 승인 재개, DB/atomic seed·브라우저·제품 설치·model/kernel 권한/독립 검증·혼합 호스트 quiescence는 미실행. C4 자동 watch는 별도 범위 |
| application check/전체 test/build | PASS | 최종 `npm run check`(lint·FSD·type·architecture 26·project availability 18), `npm test` 286/286, `test:web` 554/554, `test:templates` 32/32, 직접 `npm run build` exit 0. 기존 `_success` warning 1개. 별도 script tests 29 PASS/1 Windows file-symlink 권한 skip/0 failures. 최신 dev 통합 source 7d8dd35와 report E67–E69 및 source hash로 범위 식별 |
| dev PR 통합 | public 소스 커밋·최신 dev 통합 | 771fd41 구현 commit 뒤 origin/dev a6ea199를 7d8dd35에 통합. client schema·plugin 0.5.0과 최신 acceptance_fail/owner retry 동작을 함께 보존. private 저장소 local 변경·실제 지원 인증/배포·기존 별도 문서 정리는 public PR에 포함하지 않음 |
| C3 실제 DB 인수 시험/runner | 구현·type compile, 실제 DB 미실행 | 양방향 client×legacy/slots 승인 원장/receipt/usage·전량 preflight·seed rollback/제한 복구의 PostgreSQL 시험 6개. acceptance phase는 별도 prepared checkout와 보호된 TEST_DATABASE_URL을 선검사하고 test DB migration·시험만 실행. 현재 환경에 TEST_DATABASE_URL이 없으며 unit의 injected runner 결과를 DB PASS로 기록하지 않음. 최초 acceptance report와 양쪽 phase 순서의 history 보존도 검증 |
| 실제 모델 없는 Codex effective config | PASS, 실행 격리 증거 아님 | 0.160.0 config/read에서 상속 MCP 4개·plugin 차단과 shell-set 값 제거 및 좁힌 profile/tool 설정 대조. thread/turn 0회. 이전 C0 모델 실패를 해제하지 않음 |
| 최신 report/추적 검증 | PASS | report의 standard metadata·증거·required fail 판정 유지와 최종 read-back/validate-only exit 0. proposal strict traceability phase/task 20/20·verifier 20/20 |

## Completion or Closure Notes

현재 완료한 범위는 제안서 검토·개선, C0 검사/CLI 시험과 후속 C1–C3의 로컬 제품 소스·private template·검증 코드다. 최초 문서에 개선점이 없었던 것으로 기록하지 않는다. 실제 제품 Codex 지원 인증은 미완료이며 실패한 자동 승인 후보를 제품 코드로 승격하지 않았다. 전체 완료 조건은 C0–C3의 required evidence와 필수 blocker 해제, 양방향 승인 재개/동일 열린 run usage 불변, 기존 Claude 회귀/업데이트된 양쪽 init 공존, 최종 응답 body·실제 role 권한/패키지·pending ownership·atomic seed/제한 복구 및 배포 근거다. 각 artifact의 실제 검증이 필요하며 단위 테스트만으로 완료를 선언하지 않는다.

반복 검토에서도 추가 개선점이 있었다. 완료 증거는 같은 watch가 foreground를 중첩 획득하지 않고 저장된 정책을 유지하는 실행, 구 plugin의 새 runbook 처리와 dual checkout의 구 helper 차단, Codex owner 승인 뒤 runtime/hash가 확인된 재조회, 정확한 보존 consumer 및 phase별 보고서 증거 보존까지 포함한다. 문서의 보완만으로 이 신규 실행 경로가 이미 동작한다고 기록하지 않는다.

현재 architecture README와 세부 문서/사용법의 실제 dual 지원 일치, rehearsal report의 parser 기반 최종 파일 검증과 명시적 unit test도 완료 조건이다. 미구현 `docs:check` 또는 기존 test glob을 근거로 이 증거를 생략하지 않는다. report validation의 exit 0과 실제 runtime/제품 PASS를 구분한다.

Claude의 기존 runbook export·raw hash와 init/seed/stale 호출 경계를 보존하고 Codex 정규화 helper를 실제 서버/생성기에 연결한 증거도 필요하다. E2/E4/E5/E11의 LF/CRLF 및 저장 판 불변 회귀를 통과해야 하며 기존 hash 재계산이나 backfill로 호환성 문제를 숨기지 않는다.

신규 session CLI의 stop과 release도 별도로 구현·검증되어야 한다. stopping 잠금 보존, owned+active 판정, 실제 자식 종료 확인 전 release/legacy stop 호출 없음, 종료 확인 후 자신의 state 반납 및 successor 보존을 E7/E12의 증거로 확인한다. 문서의 operation 정의나 helper exit 0만으로 실제 호스트 취소를 증명하지 않는다.

C4를 함께 수행하면 E12와 watch 안내까지 통과해야 전체 범위를 완료로 옮긴다. C4를 후속 작업으로 미루면 REQ-DUAL-018·REQ-DUAL-019의 watch 부분과 BLK-DUAL-04, 관련 Task/검증을 별도 active proposal로 명시적으로 이관하고 이 문서의 승인 범위·완료 요약을 기본 지원으로 조정한다. 미검증 watch를 완료로 표시하지 않는다.

다음 작업은 **구현된 fresh App Server 어댑터의 실제 모델 격리와 양방향 승인 재개 인수, 별도 승인된 private seed/rollback·패키지 배포 검증**이다. config/read PASS는 model/tool/kernel 격리 PASS가 아니다. public/private 미커밋 source의 hash와 최종 테스트는 runtime report에 기록하고 기존 사용자 변경은 보존한다. 운영 seed·배포·C4 완료로 해석하지 않는다.

## Review Checklist

- [x] 현재 소스와 공식 호스트 문서의 근거를 기록하고 관찰·신규 설계·미확인을 구분했다.
- [x] 사용자 목표와 양방향 승인 재개를 중심으로 scope 및 인수 시나리오를 정의했다.
- [x] Claude 기본 계약, 서버 승인·원장·비용·step graph의 유지 조건을 정의했다.
- [x] 역할·credential·fresh 문맥·package·local ownership의 blocker와 중단 조건을 정의했다.
- [x] 성공·미승인·누락 산출물·stale receipt·retry·취소·부분 초기화·expiry·동시 실행·재진입을 다뤘다.
- [x] 실제 변경 위치, private 별도 revision, 생성 출력, 기존 test runner와 배포/롤백을 연결했다.
- [x] 실행 승인과 제안서 작성을 구분하고 C0 이후의 readiness를 과장하지 않았다.
- [x] 최초 검토에서 발견한 개선을 contract·inventory·Task·artifact·검증·완료 조건에 반영했다. 실제 native 기능과 배포 미확인은 blocker로 유지한다.
- [x] 반복 전체 검토의 watch session reuse·구 helper 호환·owner 승인 재조회·보존 경로·보고서 규약 보완도 해당 실행 절차와 최종 검증에 반영했다.
- [x] architecture README의 수용된 구조 갱신과 미구현 docs:check의 정합성 문제를 inventory·Task·artifact·검증·완료 조건에 반영했다. 전용 report validation/test는 신규 예정 기능이며 현재 PASS로 기록하지 않았다.
- [x] stop 의도 기록과 자식 종료 뒤 release의 별도 CLI·함수·event 계약을 정의하고 stopping의 owned 응답, legacy stop 오사용 및 successor 보호 검증을 연결했다. 실제 session/호스트 시험은 미실행이다.
- [x] Claude의 raw runbook hash와 호출자 정규화 경계를 Codex의 신규 정규화 helper와 구분하고 export/import·LF/CRLF·stale/fallback·완료 조건에 연결했다. 현재 함수의 차이는 읽기 전용 실행으로 확인했으며 신규 helper의 구현 PASS는 아니다.
- [x] strict 요구사항 추적 20/20과 기존 기능 baseline 129개를 검증했다. 최종 저장본의 무편집 재검토 및 최신 validator 결과는 응답의 증거를 기준으로 하며 제품 readiness와 구분한다.
