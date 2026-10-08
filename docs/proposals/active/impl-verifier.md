---
# Metadata. status value는 proposals/README.md의 세 상태만 사용합니다.
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-10-06"
approved-by: "HamSangEok"
approved-at: "2026-10-07"
approval-scope: "Phase 1–5·7, Claude 전용(Codex 실행은 별도 제안서) — 대화 승인. Phase 4·7은 Execution Plan의 선행 조건을 채운 뒤 시작"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: ["user:Sangeok"]
related:
  - "docs/architecture/qa-verifier.md"
  - "docs/architecture/protocol.md"
  - "docs/architecture/rationale.md"
  - "docs/proposals/completed/2026-10-04-pipeline-agent-slots.md"
  - "docs/proposals/completed/2026-10-07-role-command-snapshot-performance.md"
---

# 구현 독립 검증 에이전트 (impl-verifier)

## Summary

구현이 끝난 항목을 새 컨텍스트에서 다시 읽는 고정 검증 에이전트 `impl-verifier`와, 이 에이전트를 부르는 opt-in 노드
`impl-verify`(implement와 accept 사이, Pro/Max)를 추가한다. 이 에이전트는 승인된 계획과 구현 커밋을 대조하고, 계획이 약속한
시험이 그 변경을 실제로 잡는지를 **변경을 되돌린 사본에서 시험이 실패하는지**로 확인한다. 결함은 "동작 깨짐"(노드를 멈춤)과
"위생"(보고만)으로 나눈다. 완료 판정과 실패 대기는 QA 노드와 같은 방식(현재 entry에 묶인 run과 보고)을 쓰되, DB 마이그레이션 없이
run이 끝난 단계로 판정한다. 검증 에이전트의 쓰기를 훅으로 강제하는 일은 별도 제안서로 다룬다.

이번 범위는 Claude다(2026-10-07 사용자 결정). Codex에는 번들 검사가 요구하는 역할 등록만 하고, Codex 도우미가 이 디스패치를 역할 run을
열기 전에 분명한 오류로 거부한다. Codex에서 검증을 실행하는 일은 별도 제안서로 다룬다. 구현 전에 계약만 옮긴 임시 에이전트로 가치를 먼저
확인했다(*Current State*의 「가치 검증 스파이크」).

## Goal

### 목표

- 구현 뒤에 **새 컨텍스트로 읽는 검사**를 하나 둔다. 지금은 plan-verifier가 계획만 다시 읽고, 구현은 dev 자신의 검증과
  메인 루프의 인수 확인("기록과 맞나")만 거친다.
- 계획이 약속한 시험이 **그 변경을 실제로 잡는지** 확인한다. 녹색 시험이 아무것도 검사하지 않는 경우를 잡는 것이 핵심이다.
- 브라우저로 닿지 않는 작업 영역(CLI, 백엔드, 라이브러리)에도 구현 뒤 독립 검사를 제공한다. QA는 브라우저 흐름만 본다.
- 실패와 차단은 QA처럼 멈추고 소유자가 결정한다(reopen 또는 명시적 재시도).

### 비목표

- **검증 에이전트 쓰기 강제(훅)**: 별도 제안서. 그때까지는 런북의 *Verifier tree check*(정정 PR, harness-templates)가 탐지를 맡는다.
- **기본 그래프 편입**: 이번에는 opt-in이다. 실사용 뒤 다시 판단한다.
- **Free 플랜 제공**: 다른 검증 에이전트와 같이 Pro/Max만.
- **자동 reopen**: 결함이 나와도 서버가 구현을 다시 열지 않는다. 기존 소유자 Reopen 동작을 쓴다.
- **메인 루프 인수 다섯 확인의 대체**: 인수는 그대로 메인 루프만 한다.
- **범용 역할 카탈로그**: 2026-10-04에 삭제된 Phase 2 역할 카탈로그(삭제 기록 `docs/proposals/completed/2026-10-04-pipeline-agent-slots.md:30`,
  `code-reviewer` 예시 `:433`)를 되살리지 않는다. 고정 역할 하나다.
- **보안·성능 전문 검토**: 별도 에이전트로 두지 않는다. 필요해지면 이 에이전트의 검사 항목으로 넣는 후속 제안을 쓴다.
- **모델 고정**: 다른 검증 에이전트처럼 메인 루프 모델을 상속한다. 첫 실사용의 비용을 본 뒤 정한다.
- **Codex 실행**: Codex에서 검증 환경·브리핑·Windows Git 증거·명시적 재시도·Codex 런북 절을 갖추는 일은 별도 제안서다(대안 분석 「범위」).
  이번에는 Codex 역할 등록만 하고, 도우미가 디스패치를 거부한다(6절).

### 성공 기준

1. `validateGraph`가 Pro/Max에서 `implement < impl-verify < accept`, QA가 같이 있으면 `impl-verify < qa`만 받는다. Free는 거부한다.
   `defaultGraph`는 바뀌지 않는다(시험 코드: *Verification Plan*).
2. 현재 entry의 impl-verifier run이 `verify/ok`와 `report/ok`로 닫히고 그 run에 묶인 보고가 있을 때만 `impl-verify`가 끝난다.
   `failed-report`·`blocked-report`로 끝나면 `wait on impl-verify`로 멈추고 같은 에이전트를 반복 디스패치하지 않는다.
   그 전에는 메인 루프의 인수 기록이 거부되고, 구현을 다시 열면 옛 보고는 거부된다(PostgreSQL 통합 시험).
3. Codex에서 impl-verifier 역할이 정확한 도구 허용 목록으로 렌더된다(템플릿 시험). Codex 도우미는 impl-verifier 디스패치를 역할 run을 열기 전에
   `codex-role-unsupported`로 거부하고, Claude Code에서 이어 가라고 알린다(도우미 시험, 6절).
4. 실제 모델 리허설(harness-smoke 저장소):
   - (a) 아무것도 단언하지 않는 시험을 심은 `fix` 항목에서(계획의 Tests 절은 그 시험 파일을 적는다) verify가 `failed`로 끝나고, 결함 종류가
     "동작 깨짐(시험이 변경을 못 잡음)"이다.
   - (b) 올바른 구현에서는 `report/ok`로 끝나 노드가 완료된다.
   - (c) 새 파일만 더하는 `feat` 항목에서는 변이 확인을 돌리지 않고 "해당 없음(새 파일뿐)"으로 기록한다. 시험이 동작을 단언하는지는 검사 3으로 본다
     (1절 검사 4).
   - (d) 기존 파일에 새 함수를 더하는 `feat` 항목에서 되돌리기가 시험을 단언 전에(가져오기·컴파일·타입 오류로) 깨뜨리면, 보고서가 이를
     "시험이 변경을 잡음"으로 세지 않고 로드 단계 실패로 기록한다(1절 검사 4).
   - 계약 자체는 구현 전의 가치 검증 스파이크(*Current State*)가 작은 저장소에서 먼저 확인했다. 서버·플러그인·감시기를 거친 전체 경로의
     실측은 이것뿐이다. QA 출시 때는 실제 모델을 통한 전체 작업 주기가 범위 밖이었다
     (`docs/test-reports/completed/2026-10-05-qa-verifier.md:28`).

## Proposal Size

`proposal-size`: standard

선택 근거:

- 55개 파일을 바꾼다(코어·서버·웹·플러그인·Codex·private 템플릿·문서·시험. 공개 저장소 49개, private 템플릿 6개). 목록은 *Affected Files*.
  Claude 전용으로 줄이며 `plugin/runtime/codex-thread.mjs`, `plugin/bin/harness-role-files.test.mjs`, `en/CODEX.runbook.md`가 빠졌다.
- API 계약이 늘어난다: `pipeline_next`의 새 대기 형태, `report_submit`의 새 행위자 규칙.
- 롤아웃 순서 제약이 있다(*Risks and Rollback*). 단순 revert로 끝나지 않는다.

## Current State

**파이프라인의 노드와 검증 에이전트.** 노드는 `NODE_KINDS`(`packages/core/pipeline.mjs:7`)에 있고, 노드가 부르는 에이전트는
`NODE_AGENT`(`packages/core/pipeline.mjs:11`)가 정한다. 계획 단계에는 `verify` 노드의 plan-verifier가 있다. 구현 뒤에는 opt-in
`qa` 노드의 qa-verifier뿐이고, 이 에이전트는 브라우저로 사용자 흐름만 본다(`docs/architecture/qa-verifier.md`).

**구현이 받는 검사.**

- dev 자신의 verify 단계: 같은 컨텍스트가 쓰고 검증한다.
- 메인 루프의 인수 다섯 확인: 2번이 "Diff ↔ Implementation sketch"다. 계획과 모양이 맞는지를 보는 것이지, 코드가 맞는지를
  보는 것이 아니다. 또 그 메인 루프는 검증 라운드에서 계획을 직접 고친 쪽이다(plan-verifier 템플릿의 "the main loop applies fixes").
- 런북도 같은 세션의 요약을 "that session grading itself"라 부른다(private `en/CLAUDE.runbook.md`의 cycle 절, gate 대기 항목).

**독립 재독이 값을 한다는 근거.** 첫 스모크에서 결함 3건 중 1건은 독립 컨텍스트만 잡았다
(`docs/architecture/rationale.md:93`, 「재독 ≠ 회상」). 이전 작업에서는 소스 변형 시험이 줄바꿈(CRLF) 때문에 아무것도 바꾸지 않고
녹색으로 통과한 사례도 있었다(저장소 문서 기록 없음, 작업 세션에서 겪은 사례). 이 종류는 dev의 자기 검증으로도, 인수 3번
(검증 명령 재실행)으로도 원리상 잡히지 않는다.

**가치 검증 스파이크(2026-10-07).** 이 문서를 리뷰한 뒤 구현에 들어가기 전에, 1절 계약을 그대로 옮긴 임시 서브에이전트를 파일 몇 개짜리
Node 저장소 셋에서 돌렸다. 서버 대신 보드 기록을 JSON 파일로 주었고(보고 커밋은 짧은 SHA로 줘서 `start` 1의 `rev-parse` 비교도 거쳤다),
메인 루프의 사본 준비(clone, 구현 보고 커밋으로 detached checkout, `origin` 제거)는 스크립트로 했다. 기대 판정은 미리 직접 확인했다.

- (a) 단언 없는 시험을 심은 `fix`: `failed`. 검사 3(단언 없음)과 변이 확인(되돌려도 통과) 둘 다로 잡았다.
- (b) 단언하는 시험을 둔 같은 `fix`: `ok`. 되돌리자 시험이 단언(`190 !== 180`)에서 실패했다.
- (c) 새 파일만 더한 `feat`: `ok`. 되돌리자 `MODULE_NOT_FOUND`가 났고, 로드 단계 실패로 기록해 증거로 세지 않았다. 에이전트도 제품 변경이
  모두 새 파일이면 이 절차로는 이 결과만 나온다고 적었다. 그래서 1절 검사 4는 이 경우 변이 확인을 돌리지 않는다.
- 세 번 모두 원본 저장소와 ref는 바뀌지 않았다. 모델은 메인 루프와 같았고(`claude-opus-5-5`), 항목당 약 9.5만 토큰·80~104초였다.
- 한계: 의존성·링크·느린 시험이 없는 저장소였고, 서버·플러그인·감시기를 거치지 않았다. 그래서 성공 기준 4의 실측(Phase 7)을 대신하지 않는다.
  스크립트와 보고서는 저장소에 싣지 않았다(작업 세션의 임시 디렉터리).

**QA 노드가 이미 깔아 둔 길.** 구현 뒤 검증 노드에 필요한 구조는 QA(`f0dd023`)가 만들었다.

- 노드 진입 시 구현 완료(`done`) 기록: `advance`, `packages/core/pipeline.mjs:122`
- 현재 entry에 묶인 run·보고로 완료 판정: `src/server/pipeline/qa-query.ts`
- 실패 시 `wait` 응답과 재개 묶음: `src/server/pipeline/run-rules.ts:68`
- 인수 차단: `src/server/pipeline/board-query.ts:529`
- 감시기의 대기 형식 검사: `packages/core/watch.mjs:97`
- Codex 역할 표: `plugin/runtime/codex-agent.mjs:9`

이 제안은 그 길을 그대로 따른다.

## Scope

포함 범위:

- 코어 규칙: `impl-verify` 노드, `impl-verifier` 에이전트, 순서·완료·진입 전이
- 서버: 완료 판정 질의, `pipeline_next` 대기, `report_submit` 규칙, 인수 차단
- 감시기(watch), Codex 역할 등록과 impl-verifier 디스패치 거부(6절)
- 웹: 파이프라인 편집기 레일, 라벨·게이트 문구, 브리핑·배너의 노드 목록
- private 템플릿: 새 에이전트 정의, 런북 절과 런북의 *Verifier tree check*·인수 1번·`wait` 목록 두 곳, `docs/agents/README.md` 행위자 표, 계획 템플릿 Tests 절(시험 파일 이름), QA 템플릿·런북 QA 절의
  한 문장(두 노드 그래프의 HEAD), 템플릿 시험. Codex 런북은 바꾸지 않는다
- 문서: 새 아키텍처 문서와 `docs/architecture/README.md` 색인, protocol 단락과 대기 종류 목록·도구 호출자 칸, invariants의 행위자 수, product-copy §5·§6·§7·§12·§13·§14·§18(9절), 플러그인 스킬 문서 두 곳(6절)
- QA 경로의 최소 조정: Codex QA 디스패치의 허용 목록에 impl-verifier 보고 경로를 더한다(6절. Claude로 impl-verify를 거친 항목을
  Codex로 QA하는 경우). 같은 목록·표를 고치는 김에 QA의 기존
  불일치(게이트 버튼 문구, `plugin/README.md`, 플러그인 스킬 문서, protocol의 대기 종류와 도구 호출자 칸, product-copy의 목록·`report_submit` 행·§12의 QA 거부 사유,
  런북의 `wait` 목록)도 맞춘다(6·7·8·9절)

제외 범위:

- 검증 에이전트 쓰기 강제 훅(별도 제안서)
- Codex 실행(별도 제안서): 검증 환경(사본 또는 스냅숏), 브리핑, Windows의 Git 증거, `--retry-impl-verify`, Codex 런북 절과 그 QA 절의
  빌드 증거 문장. 그때까지는 도우미가 디스패치를 거부한다(6절)
- 기본 그래프 변경, Free 플랜, 모델 고정, 자동 reopen
- DB 스키마 변경(마이그레이션 없음)
- QA의 와이어 계약(`on: "qa"`) 변경
- 웹에서 검증 실패를 소유자 차례로 보이게 하는 일(QA와 같은 기존 한계, *Risks and Rollback*의 「웹 표시」)

## 대안 분석

### 범위

| 안 | 내용 | 판단 |
| --- | --- | --- |
| 가 | Claude와 Codex를 함께 낸다(2026-10-06 원안) | 기각. Codex 검증 환경이 미결이라 기능 PR 전체가 그 결정에 묶인다. Codex Windows는 역할 명령 1회에 CI에서 약 76~90초가 들어 한 턴 15분에 걸릴 수 있다(*Open Questions*) |
| **나** | **Claude 먼저. Codex는 역할 등록과 디스패치 거부만** | **선택(2026-10-07 사용자 결정).** 가치 검증 스파이크(*Current State*)가 계약을 먼저 확인했다 |
| 다 | Codex 역할 등록도 뺀다 | 기각. Codex 번들 검사가 플랜의 모든 역할 템플릿을 요구하고(`packages/core/client-runtime.mjs:32`), 역할 표에 없는 역할은 dev 목록과 비교돼 `Role MCP allowlist differs`로 init이 멈춘다(6절) |

원안의 Codex 코드와 시험(재시도·옵션 파싱·보고 경로 쓰기 권한·브리핑 분기·`turn/start` 입력)은 이 문서의 이전 판(#134 `0a0d238`)에 남아 있다.
별도 제안서가 그것을 출발점으로 쓴다.

### 구조

| 안 | 내용 | 판단 |
| --- | --- | --- |
| A | 메인 루프 인수에 정확성 검사를 더한다 | 기각. 인수자는 계획을 고친 쪽이라 자기 채점이 된다 |
| B | dev의 verify 단계에 변이 확인을 넣는다 | 기각. 같은 컨텍스트라 「재독 ≠ 회상」이 성립하지 않는다 |
| **C** | **고정 검증 에이전트 + opt-in 노드(QA 패턴)** | **선택.** 검증된 구조를 재사용하고 기존 그래프를 건드리지 않는다 |
| D | 범용 review 역할(Phase 2 카탈로그) | 기각. 2026-10-04 사용자 결정으로 삭제됐다 |

### 완료 판정

| 안 | 내용 | 판단 |
| --- | --- | --- |
| i | `Report`에 구조화 값(QA의 `Report.qa`처럼)을 두고 마이그레이션한다 | 기각 |
| **ii** | **run이 끝난 단계(`report`/`failed-report`/`blocked-report`) + 현재 entry 결합** | **선택** |

i를 고르지 않은 이유: QA가 구조화 값을 둔 까닭은 시나리오 증거와 baseUrl, 그리고 targetCommit 주장을 서버가 검사하기 위해서다.
impl-verify에서는 판정이 이미 run의 단계 경로에 있다. 구현을 다시 열면 새 entry가 생기므로(`tests/server/integration/qa-verifier.test.ts`의
reopen 단언) run의 신선도는 entry 결합이 보장한다. 검증한 커밋이 구현 보고 커밋인지는 서버가 아니라 1절 `start`의 확인이 맡는다.
마이그레이션이 없으면 롤아웃 순서 제약이 하나 줄어든다.

### 변이 확인 환경

| 안 | 내용 | 판단 |
| --- | --- | --- |
| i | 에이전트가 저장소 안에서 변경을 되돌렸다가 복원한다 | 기각. 저장소 쓰기 금지에 어긋나고 작업을 잃을 위험이 있다 |
| ii | 에이전트가 `git archive`로 임시 사본을 만든다 | 기각. 의존성이 없어 대부분의 검증 명령이 돌지 않는다 |
| **iii** | **메인 루프가 구현 커밋의 검증 사본을 준비하고 그 경로만 브리핑한다** | **선택(Claude)** |

iii은 QA에서 메인 루프가 테스트 빌드를 준비하는 것과 같은 책임 분담이다. 사본은 `git clone`으로 만든다. `git worktree add`는
본 저장소의 `.git/worktrees`를 공유하므로, 에이전트가 사본에서 Git을 쓰면 본 저장소 메타데이터가 바뀐다.
Codex는 이번 범위가 아니다(「범위」). Codex Windows는 역할 명령이 이미 명령마다 일회용 저장소 스냅숏에서 돌아(`plugin/runtime/role-commands.mjs:18`)
다른 방식이 맞을 수 있으므로 별도 제안서가 정한다(*Open Questions*).

### 노드 순서와 와이어 계약

- **`impl-verify`는 `qa`보다 앞에 고정한다.** 검증 사본은 필요하지만 실행 중인 테스트 서버와 브라우저는 필요 없어 QA보다 싸다.
  코드 결함이 먼저 나오면 브라우저 QA 비용을 아낀다. QA의 대상 커밋은 그대로다(dev의 구현 보고 커밋). 다만 Codex QA 디스패치는
  대상 커밋 뒤에 바뀐 파일을 허용 목록으로 검사하므로(`plugin/bin/harness-codex.mjs:121`–`:123`), 그 사이에 커밋되는 impl-verifier 보고
  경로를 목록에 더한다(6절. Codex는 impl-verify를 거부하므로, Claude로 impl-verify를 거친 뒤 Codex로 QA하는 경우다). Claude QA도 시험 빌드가 targetCommit을 돈다는 증거를 요구하므로 QA 템플릿과 런북에 한 문장을 더한다(8절).
- **QA의 `on: "qa"`는 일반화하지 않고 `on: "impl-verify"`를 따로 둔다.** 배포된 감시기와 Codex 도우미가 `on === "qa"`를
  정확히 비교한다(`packages/core/watch.mjs:97`, `plugin/bin/harness-codex.mjs:84`). 일반화하면 배포된 클라이언트가 깨진다.
  서버 내부의 "구현 보고 찾기"는 공유한다(`implementationReport`).

## Proposal

### 1. 역할 계약 — `impl-verifier`

private 템플릿 본문은 이 공개 저장소에 싣지 않는다(`docs/architecture/qa-verifier.md:108`). 아래는 템플릿이 지켜야 할 계약이다.

| 항목 | 계약 |
| --- | --- |
| 도구 | `Read, Write, Glob, Grep, Bash, mcp__harness__agent_next, mcp__harness__board_get, mcp__harness__backlog_get, mcp__harness__report_submit` |
| 단계와 연결 | QA와 같다: `start → verify → report`, start 실패·차단 → `blocked-report`, verify 실패 → `failed-report`, verify 차단 → `blocked-report`. 모든 단계 `requires: done`, report는 `done, verify-ok` |
| 입력(브리핑) | project, key, 현재 entry, targetCommit, 검증 사본 경로. targetCommit은 `start`에서 서버 기록과 다시 맞춘다(아래). **dev의 결론은 주지 않는다.** 들어 있으면 보고 첫 줄에 "브리핑에 이전 판단이 있었다"를 적는다(plan-verifier와 같은 규칙) |
| 쓰기 | `docs/agents/impl-verifier/<KEY>.md`(덧붙이기)와 검증 사본 안. 저장소 checkout에서는 아무것도 실행해 쓰지 않는다. 검증 명령은 사본에서만 돈다 |
| 금지 | 저장소 checkout의 제품 코드·시험·계획·다른 보고·설정·Git 메타데이터 수정. 승인·인수·전이·백로그·디스패치·커밋·push. 설계가 좋은지에 대한 판단(그것은 게이트의 몫). 검증 사본 안에서는 파일을 `planCommit`·targetCommit 상태로 되돌리고, 그 사이에 새로 생긴 파일을 지우고, Git을 쓸 수 있다(검사 4). QA 템플릿의 금지 문장은 범위를 가리지 않으므로(#8 `efd7d42`의 `en/agents/qa-verifier.md:18`–`:20`. harness-templates 정정 PR 뒤에는 `## Never` 목록) 그대로 옮기지 않는다 |
| 판정 | `ok` = "동작 깨짐" 결함 없음(위생 결함은 보고만). `failed` = 동작 깨짐 결함 1개 이상. `blocked` = 필수 검사를 돌릴 수 없음 |
| 보고 | 메인 루프 커밋 핸드오프 → `report_submit({ project, key, actor: "impl-verifier", path, commit, runId: agentRunId })` → `ok`. 템플릿의 호출 예시는 `project`로 시작해야 한다(QA 브랜치 `templates.test.mjs:323`–`:329`) |

**`start`에서 먼저 확인할 것.** 셋 중 하나라도 맞지 않으면 `blocked`다.

1. **targetCommit**: 브리핑 값을 그대로 믿지 않고 직접 정한다. `board_get`이 돌려주는 보고 중 담당 dev(`board_get`의 agent)의 보고로서 실제
   agentRunId가 있는 마지막 것을 고르고, 그 커밋이 targetCommit이다. 이것은 QA 템플릿 start 단계와 같은 규칙이다
   (harness-templates `harness/qa-verifier`의 `en/agents/qa-verifier.md:51`–`:52`). 그런 보고가 없으면 `blocked`다.
   세 값을 비교한다: 보고 커밋, 브리핑의 targetCommit, 사본의 HEAD.
   - 비교는 문자열이 아니라 각 값을 `git -C <사본> rev-parse --verify <값>^{commit}`으로 푼 40자 SHA로 한다.
   - 보고 커밋은 아무 문자열이나 기록될 수 있다(`src/server/mcp/tools.ts:207`의 `commit: z.string()`, dev 보고에는 SHA 검사가 없다). 그래서 짧은 SHA와
     `rev-parse HEAD`의 40자를 그대로 비교하면 늘 어긋난다.
   - 셋이 같지 않거나 풀리지 않으면 `blocked`다. 보고서 첫머리에 푼 targetCommit을 적는다.
   서버는 impl-verifier 보고에 구조화 값을 두지 않으므로(대안 분석 「완료 판정」), 검증한 커밋과 구현 보고를 잇는 것은 이 확인뿐이다.
2. **검증 명령**: harness.json에서 `agent`가 `board_get`의 agent와 같은 workspace의 `verify` 목록을 쓴다. 보고 에이전트의 단계 본문에는 검증
   명령이 렌더되지 않는다. 워크스페이스 dev에게만 `buildWorkspaceVars`로 들어간다(`src/server/agents/vars.ts:18`–`:19`, `packages/core/vars.mjs:46`·`:60`).
3. **기준 실행**: 사본에서 그 명령을 한 번 실행해 전부 통과해야 한다. 통과하지 않으면 환경 문제이므로 `blocked`로 보고한다.
   기준 실행을 메인 루프가 아니라 이 에이전트가 하는 이유는 8절 런북 절차의 2단계에 있다.

**검사 항목.** `start`에서 목록을 정하고 `verify`에서 전부 실행한다. 못 돌린 항목은 `blocked`다.

1. **범위**: 먼저 `planCommit`이 `targetCommit`의 조상인지 확인한다(`git merge-base --is-ancestor`). 계획 커밋은 브랜치와 무관하게
   SHA로 기록되므로 조상이 아닐 수 있고, 그러면 비교 기준이 없어 `blocked`다. 조상이면 `planCommit..targetCommit`의 변경 파일과
   계획의 "Files to change"를 대조한다. 계획 밖 변경은 기록만 한다. 판정은 인수 1번의 몫이다.
2. **동작**: 바뀐 코드를 계획의 "Current behavior"·"Implementation sketch" 주장과 대조한다. dev 템플릿이 소유자 판단 대상으로
   지목한 네 가지(분기 순서, 조건, 리터럴 값, 사용자에게 보이는 문구)를 우선 본다.
3. **시험 존재**: 계획의 "Tests"가 약속한 시험이 있고, 그 동작을 단언하는지 본다(실행만 하고 단언이 없는 시험은 결함).
4. **변이 확인**(항목 종류가 `feat`·`fix`이고 시험이 있을 때). 종류는 `backlog_get`이 돌려주는 백로그 항목의 `type`이다.
   plan_submit이 계획의 분류로 이 값을 정하되, 소유자가 정한 값은 그대로 둔다(`src/server/pipeline/board-query.ts:483`–`:494`).
   그래서 계획의 "Plan classification" 줄과 다를 수 있다. `type`이 비어 있을 때만 계획의 분류 줄을 쓰고, 둘이 다르면 보고서에 적는다.
   되돌릴 제품 파일(아래 1의 조건)이 모두 `planCommit` 뒤에 새로 생긴 파일이면 변이 확인을 돌리지 않고 "해당 없음(새 파일뿐)"으로 기록한다.
   지우면 시험이 늘 가져오기 단계에서 깨져 3의 증거가 나오지 않고, 검증 명령 두 번의 비용만 든다(*Current State*의 가치 검증 스파이크 (c)).
   이때 시험이 동작을 단언하는지는 검사 3만 본다.
   1. 검증 사본에서 제품 변경을 `planCommit` 상태로 되돌린다. 되돌리는 대상은 아래 조건을 모두 맞는 파일뿐이다.
      - 계획의 "Files to change" 행에 있다.
      - 계획의 "Tests" 절이 시험 파일로 적지 않았다.
      - `planCommit..targetCommit`에서 바뀌었다.

      되돌리는 방법은 파일마다 다르다. `planCommit`에 있던 파일은 그 내용으로 되돌리고, 그 사이에 새로 생긴 파일(계획의 `(new)` 행)은 지운다.
      새 파일은 `planCommit`에 경로가 없어서 `git checkout <planCommit> -- <파일>`로는 되돌릴 수 없기 때문이다.
      계획 템플릿은 Covered 항목마다 그 동작을 단언하는 시험 파일을 적게 한다(8절). 시험 파일이 적혀 있지 않으면 변이 확인은 `blocked`다.
      "Files to change" 밖의 변경은 되돌리지 않는다. 미결 항목은 둘까지 열릴 수 있고(`packages/core/transitions.mjs:39`), 같은 작업 브랜치에
      커밋할 수 있어서, 범위 전체를 되돌리면 다른 항목의 변경까지 지운다. 되돌리는 파일마다 그 범위의 커밋 목록
      (`git log --oneline planCommit..targetCommit -- <파일>`)을 보고서에 적는다. 구현과 무관해 보이는 커밋이 섞여 있으면, 되돌리기가
      그 변경까지 지웠다는 사실을 결과와 함께 적는다. 같은 파일 안의 계획 밖 변경은 기계적으로 가려낼 수 없기 때문이다.
   2. **사본이 실제로 바뀌었는지 먼저 단언한다**(되돌리기 전후 트리 해시가 달라야 한다). CRLF 사례 같은 빈 변이를 막는다.
   3. 작업 영역 검증 명령을 실행한다. 계획의 "Tests"가 약속한 시험이 **단언에서 실패해야** "시험이 변경을 잡음"이다.
      통과하면 "시험이 변경을 못 잡음"으로, 동작 깨짐 결함이다. 시험이 단언 전에(가져오기·컴파일·타입 오류로) 실패하면 이 확인은
      증거가 되지 않는다. 기존 파일에 새 기호를 더하는 `feat`에서 흔하다. "로드 단계 실패"로 기록하고 판정에 쓰지 않으며, 시험이 동작을
      단언하는지는 검사 3이 맡는다.
   4. 사본을 targetCommit으로 되돌리고 같은 명령을 다시 실행한다. 통과해야 한다. 기준 실행은 `start`에서 이미 통과했으므로,
      여기서 실패하면 환경이 흔들린 것이다. `failed`가 아니라 `blocked`로 보고한다.
   - `refactor`·`docs`는 해당 없음으로 기록한다. 동작 보존 변경은 되돌려도 시험이 통과하는 것이 정상이다.

**실행하는 클라이언트는 Claude뿐이다.** `start`·검사의 Git 증거와 사본에서의 실행을 모두 직접 한다. 사본의 Git은 `cd` 없이
`git -C <사본>`으로 부른다. 그래야 모든 Git 명령이 대상 사본을 이름으로 갖는다. 같은 명령에서 `cd`로 다른 디렉터리에 들어가 `git`을 돌리면
읽기 전용이라도 Claude Code가 확인을 묻는다. `git -C`도 확인을 피하지는 못한다. 기본 권한 모드에서는 읽기 전용 `git -C`도 매번 확인을 묻는다
(2026-10-08 실측, *Open Questions*의 [Claude 서브에이전트의 추가 디렉터리 상속]). Codex에서는 도우미가 디스패치를 역할 run 전에 거부하므로(6절) 이 계약이 실행되지 않는다. Codex 역할이 이 계약을
실행하려면 무엇이 모자란지는 *Open Questions*의 [Codex 실행 — 별도 제안서로 넘김]에 남긴다.

**결함 분류.** plan-verifier의 "breaks implementation | doc hygiene" 구분을 그대로 따른다.

- 동작 깨짐: 계획 주장과 다른 코드, 약속한 시험의 부재, 변경을 못 잡는 시험
- 위생: 낡은 주석, 이름, 문서 줄

### 2. 코어 — `packages/core/pipeline.mjs`

`plugin/lib/pipeline.mjs`는 `scripts/plugin-lib.mjs`가 미러한다(`npm run check`의 첫 단계가 일치를 검사한다).
`packages/core/pipeline.d.mts`의 `NodeFacts`에도 `implVerifyComplete?: boolean`을 더한다.

Before (`packages/core/pipeline.mjs:6`–`:7`, `:11`, `:27`, `:46`):

```js
// 비게이트 노드 8종, 골격 순서. 게이트는 노드가 아니라 간선(before-<kind>)이다.
export const NODE_KINDS = ["propose", "plan", "verify", "implement", "qa", "accept", "doc-audit", "scout"];
export const NODE_AGENT = { propose: "pm", verify: "plan-verifier", qa: "qa-verifier", "doc-audit": "doc-auditor", scout: "feature-scout" };
export const isItemNode = (node) => ["plan", "implement", "verify", "qa"].includes(node);
export const OPT_IN_NODES = ["scout", "qa"];
```

After:

```js
// 비게이트 노드 9종, 골격 순서. 게이트는 노드가 아니라 간선(before-<kind>)이다.
export const NODE_KINDS = ["propose", "plan", "verify", "implement", "impl-verify", "qa", "accept", "doc-audit", "scout"];
export const NODE_AGENT = { propose: "pm", verify: "plan-verifier", "impl-verify": "impl-verifier", qa: "qa-verifier", "doc-audit": "doc-auditor", scout: "feature-scout" };
export const isItemNode = (node) => ["plan", "implement", "verify", "impl-verify", "qa"].includes(node);
export const OPT_IN_NODES = ["scout", "impl-verify", "qa"];
```

`OPT_IN_NODES` 위 주석(`:45`)은 선택 노드인 이유로 서버가 harness.json 설정을 모른다는 점을 든다. impl-verify는 설정이 아니라 비용 때문에 선택 노드이므로
주석을 `// 선택 노드 — 기본 그래프에 넣지 않는다(Pipeline 탭에서 넣는다). scout·qa는 서버가 모르는 harness.json 설정에 달렸고, impl-verify는 항목마다 검증 비용을 더한다.`로 바꾼다.

`validateGraph` — After (전체 함수. 바뀐 것은 `impl-verify` 두 줄):

```js
export function validateGraph(graph, plan) {
  const { nodes, gates } = graph ?? {};
  if (!Array.isArray(nodes) || !Array.isArray(gates)) return { ok: false, reason: "graph must have nodes and gates" };
  if (![...nodes, ...gates].every((id) => typeof id === "string")) return { ok: false, reason: "slot and gate ids must be strings" };
  if (new Set(nodes).size !== nodes.length) return { ok: false, reason: "a node appears twice" };
  for (const k of nodes) if (!NODE_KINDS.includes(k) && !PROJECT_AGENTS.includes(slotAgent(k))) return { ok: false, reason: `unknown node: ${k}` };
  for (const k of REQUIRED_NODES) if (!nodes.includes(k)) return { ok: false, reason: `${k} can't be removed` };
  for (const k of nodes) if (!nodeAllowed(plan, k)) return { ok: false, reason: `${k} is not on the ${plan} plan` };
  const planAt = nodes.indexOf("plan"), implementAt = nodes.indexOf("implement"), acceptAt = nodes.indexOf("accept");
  if (!(planAt < implementAt && implementAt < acceptAt)) return { ok: false, reason: "anchors must keep the order plan · implement · accept" };
  if (nodes.includes("propose") && nodes[0] !== "propose") return { ok: false, reason: "propose must be first" };
  if (nodes.includes("verify") && !(planAt < nodes.indexOf("verify") && nodes.indexOf("verify") < implementAt)) return { ok: false, reason: "verify must be between plan and implement" };
  if (nodes.includes("impl-verify") && !(implementAt < nodes.indexOf("impl-verify") && nodes.indexOf("impl-verify") < acceptAt)) return { ok: false, reason: "impl-verify must be between implement and accept" };
  if (nodes.includes("qa") && !(implementAt < nodes.indexOf("qa") && nodes.indexOf("qa") < acceptAt)) return { ok: false, reason: "qa must be between implement and accept" };
  if (nodes.includes("impl-verify") && nodes.includes("qa") && nodes.indexOf("impl-verify") > nodes.indexOf("qa")) return { ok: false, reason: "impl-verify must come before qa" };
  for (const [alias, agent] of [["doc-audit", "doc-auditor"], ["scout", "feature-scout"]]) {
    const slots = nodes.filter((id) => slotAgent(id) === agent);
    if (slots.includes(alias) && slots.length > 1) return { ok: false, reason: `don't mix ${alias} with ${agent} slots` };
  }
  if (new Set(gates).size !== gates.length) return { ok: false, reason: "a gate appears twice" };
  for (const g of gates) {
    const k = gateKind(g);
    if (k === null || k === "propose" || !nodes.includes(k)) return { ok: false, reason: `gate ${g} has no node after it` };
  }
  return { ok: true };
}
```

`cursorForStatus` — After(전체. `done` 줄만 바뀐다). 지키는 불변식: QA만 있는 그래프에서는 지금처럼 `qa`(또는 그 게이트)에 선다.

```js
export function cursorForStatus(graph, status) {
  const at = (kind) => (graph.gates.includes(gateId(kind)) ? gateId(kind) : kind);
  switch (status) {
    case "proposed": return at("plan");
    case "planning": return "plan";
    case "in_review": return graph.nodes.includes("verify") ? "verify" : at("implement");
    case "implementing": return "implement";
    case "done": return graph.nodes.includes("impl-verify") ? at("impl-verify") : graph.nodes.includes("qa") ? at("qa") : "accept";
    default: return null;
  }
}
```

`nodeDone` — After(전체. `impl-verify` 한 줄 추가):

```js
export function nodeDone(kind, facts) {
  if (facts.format === SLOT_FORMAT) {
    if (kind === "implement") return facts.implementationComplete === true;
    if (PROJECT_AGENTS.includes(slotAgent(kind))) return facts.slotComplete === true;
  }
  switch (kind) {
    case "impl-verify": return facts.implVerifyComplete === true;
    case "qa": return facts.qaComplete === true;
    case "propose": return true;
    case "plan": return ["in_review", "implementing", "done"].includes(facts.status);
    case "verify": return facts.validation !== null;
    case "implement": return facts.status === "done" || facts.implementationComplete === true;
    case "accept": return facts.accepted;
    default: return facts.closedAgents.includes(slotAgent(kind));
  }
}
```

함수 위 주석(`:100`–`:102`)은 노드별 완료 증거를 나열하는데, QA 추가 때 `qa`가 빠졌다. `qa·impl-verify: 현재 entry에서 통과로 닫힌 검증 run과 그 보고`를 더한다.

`advance` — 바뀌는 것은 slot 경로의 진입 전이 한 줄이다(`packages/core/pipeline.mjs:141`). 나머지 본문은 그대로다.
지키는 불변식: implementing 상태에서 구현 뒤 첫 노드(impl-verify, qa, accept 중 그래프에 있는 첫 것, 또는 그 게이트)에 들어설 때
`implementing → done`이 정확히 한 번 일어난다.

```js
      if (["impl-verify", gateId("impl-verify"), "accept", gateId("accept"), "qa", gateId("qa")].includes(next) && status === "implementing") {
        transitions.push({ from: "implementing", to: "done" });
      }
```

옛 형식(`format: null`)의 전이 줄(`packages/core/pipeline.mjs:146`)은 바꾸지 않는다. impl-verify는 옛 형식 버전에 들어갈 수 없다.

- 그래프 저장은 언제나 `slots-v1`로 버전을 만든다(`src/server/pipeline/version-save-query.ts:16`).
- 저장된 버전이 없을 때 run이 묶이는 기본 버전도 `slots-v1`로 만든다(`ensureCurrentVersion`, `src/server/pipeline/run-query.ts:29`–`:31`).
- `readFacts`는 entry 없는 impl-verify를 거부한다(4절).

### 3. 플랜 — `packages/core/entitlement.mjs:9`

```js
// Before
export const REPORT_AGENTS = ["pm", "plan-verifier", "doc-auditor", "feature-scout", "qa-verifier"];
// After — Free의 agents(["pm", "feature-scout"])는 그대로라 Free 그래프에는 들어갈 수 없다(nodeAllowed)
export const REPORT_AGENTS = ["pm", "plan-verifier", "doc-auditor", "feature-scout", "qa-verifier", "impl-verifier"];
```

바로 위 주석(`:8`)의 "고정 4역"은 QA 추가 때 이미 낡았다. 수를 없앤 말(예: "고정 보고 에이전트")로 고친다. `plugin/lib/entitlement.mjs`는 미러로 따라온다.

### 4. 서버

**신규 `src/server/pipeline/impl-verify-query.ts`** — `qa-query.ts`의 형제다. 지키는 불변식: 현재 entry 밖의 run과 보고는 완료 근거가 되지 않는다.

```ts
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { implementationReport } from "./qa-query";

type Db = PrismaClient | Prisma.TransactionClient;
export const IMPL_VERIFIER = "impl-verifier";
export const IMPL_VERIFY_PENDING = "Implementation verification has not completed; acceptance is only available at accept";
export const implVerifierReportPath = (key: string) => `docs/agents/${IMPL_VERIFIER}/${key}.md`;

// impl-verify 노드의 증거. 현재 entry에서 마지막으로 닫힌 impl-verifier run과 그 run에 묶인 보고로 판정한다.
// 판정은 run이 끝난 단계가 정한다 — report(verify/ok 뒤)·failed-report·blocked-report. 구현이 다시 열리면 새 entry가 생겨
// 옛 run은 여기서 보이지 않는다(qa-query.ts와 같은 entry 결합). 구조화 값이 없으므로 마이그레이션도 없다.
export async function implVerifyEntryResult(db: Db, projectId: string, boardItemId: string, agent: string, pipelineRunId: string, entryId: string): Promise<{ complete: boolean; failure: { note: string; path: string; commit: string } | null }> {
  const run = await db.agentRun.findFirst({ where: { projectId, agent: IMPL_VERIFIER, pipelineRunId, pipelineEntryId: entryId, closedAt: { not: null } }, orderBy: { openedAt: "desc" }, include: { reports: { where: { boardItemId }, orderBy: { at: "desc" }, take: 1 }, steps: { where: { accepted: true } } } });
  const report = run?.reports[0];
  if (!run || !report) return { complete: false, failure: null };
  const target = await implementationReport(db, boardItemId, agent, pipelineRunId);
  const passed = target !== null && run.stepId === "report"
    && run.steps.some(step => step.stepId === "verify" && step.outcome === "ok")
    && run.steps.some(step => step.stepId === "report" && step.outcome === "ok");
  if (passed) return { complete: true, failure: null };
  const what = run.stepId === "failed-report" ? "found defects that break the implementation" : run.stepId === "blocked-report" ? "could not run a required check" : "did not complete its report";
  return { complete: false, failure: { note: `impl-verifier ${what}. Read the report, then reopen implementation or explicitly retry.`, path: report.path, commit: report.commit } };
}
```

**`src/server/pipeline/run-query.ts`**

- `:4`의 `import { qaEntryResult } from "./qa-query";` 아래에 `import { implVerifyEntryResult } from "./impl-verify-query";`를 둔다.
- `PipelineFacts`(`:16`)에 `implVerifyComplete?: boolean`을 더한다.
- `readFacts`(`:60`)의 `qa` 분기 바로 앞에 같은 모양의 분기를 둔다.

```ts
  if (run.node === "impl-verify") {
    if (!bound || !run.entryId) throw new Error("impl-verify requires a bound pipeline entry");
    const item = await db.boardItem.findUniqueOrThrow({ where: { id: row.id }, select: { agent: true } });
    const result = await implVerifyEntryResult(db, projectId, row.id, item.agent, run.id, run.entryId);
    return { status: row.status, validation: row.validation, accepted: row.acceptedAt !== null, format: run.version.format, approvedGates: [], closedAgents: [], implementationComplete: false, slotComplete: false, implVerifyComplete: result.complete };
  }
```

- `nextFor`(`:112`)에서는 `qaFailure`(`:130`) 옆에 실패를 읽어 `decideNext`로 넘긴다.

```ts
  const implVerifyFailure = node === "impl-verify" && run.entryId && !open ? (await implVerifyEntryResult(db, projectId, row.id, row.agent, run.id, run.entryId)).failure : null;
  return decideNext({
    key, version: run.version.version, node, status: row.status, planCommit: row.planCommit, agent: row.agent, handoff, hasResumableRun: open !== null,
    format: run.version.format, entry: run.entryId ? { runId: run.id, entryId: run.entryId, slotId: run.node } : undefined,
    cap, acceptanceFailure, qaFailure, implVerifyFailure,
  });
```

**`src/server/pipeline/run-rules.ts`**

- `PipelineNext` 합집합(`:14` 옆)에 대기 형태 하나를 더한다.
  ```ts
    | { key: string; node: string; version: number; action: "wait"; on: "impl-verify"; note: string; path: string; commit: string; resume: { agent: "impl-verifier"; key: string; format: string | null; entry?: PipelineEntry; agentRunId?: string } }
  ```
- `PipelineNextInput`(`:26` 옆)에 `implVerifyFailure?: { note: string; path: string; commit: string } | null;`를 더한다.
- `HINT`에 한 줄을 더한다. product-copy §13 표에도 같은 문장의 행을 넣는다. stagekeeper 정정 PR #121(2026-10-06 머지)로 `run-rules.test.mjs:81`이 이 일치를 강제한다.
  ```ts
    "impl-verify": "Dispatch impl-verifier with the item key and current entry. First prepare the verification environment for the implementation report commit as the runbook says, then brief only that commit and where to verify it. Failed, blocked or stale verification cannot complete this node; final acceptance remains with the main loop.",
  ```
  문장은 클라이언트를 가리지 않게 쓴다. HINT는 Codex에도 가지만 Codex 도우미가 이 디스패치를 거부한다(6절). "검증 환경"은 Claude에서는
  검증 사본이고, Codex 방식은 별도 제안서가 정한다.
- `decideNext`에서는 `qa` 대기 줄(`:68`) 바로 앞에 같은 판정 순서로 한 줄을 넣는다. 함수 위 주석(`:57`)의 판정 순서
  "런 닫힘 → 게이트 → accept → handoff → cap → dispatch"에는 QA 추가 때 실패 대기가 빠졌다. handoff 뒤에 "impl-verify·qa 실패 대기"를 넣는다.
  ```ts
    if (node === "impl-verify" && i.implVerifyFailure) return { key, node, version, action: "wait", on: "impl-verify", ...i.implVerifyFailure, resume: { agent: "impl-verifier", key, format: i.format ?? null, ...(i.entry ? { entry: i.entry } : {}) } };
  ```

**`src/server/pipeline/board-query.ts` `submitReport`** — After(전체 함수). 바뀐 것은 인수 차단 두 줄과 `impl-verifier` 검사 블록이다.
지키는 불변식은 넷이다.

- QA 경로의 검사와 문구(`QA has not completed…`)는 그대로다.
- 두 노드가 다 있는 그래프에서 커서가 impl-verify(또는 그 게이트)에 있으면, 인수 거부 문구는 impl-verify의 것이다. QA 줄이 먼저
  걸려 "QA has not completed"가 나오지 않도록 그 앞에 한 줄을 둔다. impl-verify만 있는 그래프는 QA 뒤의 줄이 막는다.
- impl-verifier 보고는 현재 `impl-verify` entry, `done` 상태, 결합된 run에서만 받는다. 커밋은 SHA 형식이어야 한다. 이 커밋이
  `wait on impl-verify`의 `commit`이 되는데, 감시기는 그 값이 SHA가 아니면 overview 전체를 거부하기 때문이다(5절). 반면
  `report_submit`의 입력은 아무 문자열이나 받는다(`src/server/mcp/tools.ts:207`의 `commit: z.string()`). QA 보고에도 같은 틈이
  있지만, QA 경로는 바꾸지 않는다.
- 인수 기록은 그래프에 있는 검증 노드가 모두 끝나 커서가 `accept`에 선 뒤에만 받는다. accept 앞에 게이트(`before-accept`)가 있으면
  그 게이트에서 기다리는 동안의 인수도 이 줄들에서 거부되고, 문구는 검증이 끝나지 않았다고 말한다. QA 줄(`board-query.ts:529`)과 같은
  기존 한계다. 거부 자체는 맞으므로 문구는 바꾸지 않는다.

```ts
async function submitReport(projectId: string, input: { key: string; actor: string; path: string; commit: string; runId?: string; qa?: unknown }, actorRef: string) {
  return inProjectTransaction(projectId, async (tx) => {
    const row = await latestRow(tx, projectId, input.key);
    if (!row) return fail(`no such board item: ${input.key}`);
    // 벽에 필요한 사실 둘. roster는 이름 검사에, verify 원장은 implementing의 선행 검사에 쓴다.
    // verify 조회는 status가 implementing일 때만 한다 — 나머지 상태에선 결과를 쓰지 않으므로 왕복을 아낀다.
    const roster = (await tx.workspace.findMany({ where: { projectId }, select: { agent: true } })).map((w) => w.agent);
    const hasVerifyStep =
      row.status === "implementing" &&
      (await tx.agentRunStep.findFirst({
        where: { OR: [{ accepted: true }, { accepted: null }], stepId: "verify", run: { projectId, agent: input.actor, key: input.key } },
        select: { id: true },
      })) !== null;
    const acceptanceFailed = row.status === "done" && input.actor === MAIN_LOOP
      && await tx.acceptanceFailure.findFirst({ where: { boardItemId: row.id, clearedAt: null }, select: { id: true } }) !== null;
    const d = decideReportSubmit({ status: row.status, actor: input.actor, roster, hasVerifyStep, acceptanceFailed });
    if (!d.ok) throw new BoardRejection(d.reason);
    const pipeline = await ensureRun(tx, projectId, row.id, row.status, false);
    if (d.value.accepts && !pipeline.closedAt && ["impl-verify", gateId("impl-verify")].includes(pipeline.node)) throw new BoardRejection(IMPL_VERIFY_PENDING);
    if (d.value.accepts && pipeline.version.nodes.includes("qa") && (pipeline.node !== "accept" || pipeline.closedAt)) throw new BoardRejection("QA has not completed; acceptance is only available at accept");
    if (d.value.accepts && pipeline.version.nodes.includes("impl-verify") && (pipeline.node !== "accept" || pipeline.closedAt)) throw new BoardRejection(IMPL_VERIFY_PENDING);
    if (input.actor !== "qa-verifier" && input.qa !== undefined) throw new BoardRejection("QA evidence belongs to qa-verifier");
    let qa: ReturnType<typeof parseQaReport> | undefined;
    if (input.actor === "qa-verifier") {
      try { qa = parseQaReport(input.qa); } catch (error) { throw new BoardRejection(error instanceof Error ? error.message : "Invalid QA report"); }
      if (!input.runId || input.path !== `docs/agents/qa-verifier/${input.key}.md`) throw new BoardRejection("QA report requires its bound AgentRun and report path");
      if (pipeline.version.format !== SLOT_FORMAT || pipeline.node !== "qa" || pipeline.closedAt || row.status !== "done") throw new BoardRejection("QA report requires the current qa entry");
      const target = await implementationReport(tx, row.id, row.agent, pipeline.id);
      if (!target || target.commit !== qa.targetCommit) throw new BoardRejection("QA target does not match the implementation report commit");
      const qaRun = await tx.agentRun.findFirst({ where: { id: input.runId, projectId, agent: "qa-verifier", key: input.key, pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId, closedAt: null }, include: { steps: { where: { accepted: true } } } });
      if (!qaRun || !(qa.verdict === "pass" ? qaRun.stepId === "report" && qaRun.steps.some(step => step.stepId === "verify" && step.outcome === "ok") : qaRun.stepId === `${qa.verdict === "fail" ? "failed" : "blocked"}-report`)) throw new BoardRejection("QA verdict does not match the current run's verification outcome");
    }
    if (input.actor === IMPL_VERIFIER) {
      if (!input.runId || input.path !== implVerifierReportPath(input.key)) throw new BoardRejection("Implementation verification report requires its bound AgentRun and report path");
      if (!/^[0-9a-f]{7,40}$/.test(input.commit)) throw new BoardRejection("Implementation verification report requires a commit SHA");
      if (pipeline.version.format !== SLOT_FORMAT || pipeline.node !== "impl-verify" || pipeline.closedAt || row.status !== "done") throw new BoardRejection("Implementation verification report requires the current impl-verify entry");
      if (!await implementationReport(tx, row.id, row.agent, pipeline.id)) throw new BoardRejection("Implementation verification needs a completed implementation report");
      const verifierRun = await tx.agentRun.findFirst({ where: { id: input.runId, projectId, agent: IMPL_VERIFIER, key: input.key, pipelineRunId: pipeline.id, pipelineEntryId: pipeline.entryId, closedAt: null }, include: { steps: { where: { accepted: true } } } });
      if (!verifierRun || !(verifierRun.stepId === "report" ? verifierRun.steps.some(step => step.stepId === "verify" && step.outcome === "ok") : ["failed-report", "blocked-report"].includes(verifierRun.stepId))) throw new BoardRejection("Implementation verification report does not match the current run's outcome");
    }
    if (input.runId) {
      const agentRun = await tx.agentRun.findUnique({ where: { id: input.runId }, include: { pipelineRun: true } });
      if (!agentRun || agentRun.projectId !== projectId || agentRun.agent !== input.actor || agentRun.key !== input.key || agentRun.closedAt || (agentRun.pipelineRun && (agentRun.pipelineRun.boardItemId !== row.id || agentRun.pipelineRun.closedAt || agentRun.pipelineRun.entryId !== agentRun.pipelineEntryId))) throw new BoardRejection("stale report run");
    }
    await claim(tx, row, {});
    const report = await tx.report.create({ data: { boardItemId: row.id, actor: input.actor, path: input.path, commit: input.commit, agentRunId: input.runId, isAcceptance: d.value.accepts, ...(qa ? { qa } : {}) } });
    await tx.transitionEvent.create({ data: { boardItemId: row.id, from: row.status, to: row.status, actor: "agent", actorId: actorRef, note: "report" } });
    // 인수 기록이면 항목에 표시한다 — 배너·항목 상세·journey가 이 열 하나로 "인수됐나"를 읽는다.
    if (d.value.accepts) {
      const claimed = await tx.boardItem.findUniqueOrThrow({ where: { id: row.id } });
      await claim(tx, claimed, { acceptedAt: report.at });
    }
    await advanceRun(tx, projectId, input.key);
    return { ok: true as const, item: report };
  });
}
```

import(바뀐 줄만. 첫 줄은 기존 `pipeline.mjs` import에 `gateId`를 더한 것이다):

```ts
import { advance, cursorForStatus, gateId, SLOT_FORMAT, AUTO_SCOUT_DISABLED_REASON } from "@harness/core/pipeline.mjs";
import { IMPL_VERIFIER, IMPL_VERIFY_PENDING, implVerifierReportPath } from "./impl-verify-query";
```

`decideReportSubmit`(`src/server/pipeline/board-rules.ts:123`)는 바꾸지 않는다. `knownReporter`가 `REPORT_AGENTS`를 읽으므로
(`board-rules.ts:99`) 3절의 한 줄로 impl-verifier가 알려진 보고자가 된다. impl-verifier는 `done`에서 보고하므로 implementing의
verify 벽(`board-rules.ts:131`)은 걸리지 않는다.

**`src/server/mcp/tools.ts:207`** — `report_submit` 설명의 "QA additionally requires runId and qa {…}." 뒤에
"impl-verifier additionally requires runId."를 더한다. 지금은 이 설명을 product-copy와 글자 그대로 맞추는 시험이 없다(`src/server/mcp/tools.test.mjs`는
`board_transition`·`plan_submit`·`agent_next`·`backlog_add`·`acceptance_fail`만 고정한다). product-copy §13의 행은 9절에서 맞추고, 그 뒤 Phase 5에서
`tools.test.mjs:90`의 목록에 `"report_submit"`을 더해 일치를 고정한다(*Verification Plan*).

### 5. 감시기 — `packages/core/watch.mjs`(+ `plugin/lib/watch.mjs` 미러)

`validateItem`의 `qa` 경우(`:97`) 옆에 같은 모양의 경우를 둔다. 감시기는 모르는 대기를 거부한다(`default: requireValue(false)`).
그래서 **노드를 그래프에 넣기 전에 그 소유자의 플러그인이 갱신돼 있어야 한다.** 서버와 플러그인은 같은 main 승격으로 나가므로,
배포 순서로는 이것을 보장할 수 없다. 소유자 순서로 보장한다(*Risks and Rollback*).

```js
        case "impl-verify":
          requireValue(item.node === "impl-verify" && text(item.note) && text(item.path) && /^[0-9a-f]{7,40}$/.test(item.commit)
            && object(item.resume) && item.resume.agent === "impl-verifier" && item.resume.key === item.key && item.resume.format === "slots-v1");
          validateEntry(item.resume.entry, "impl-verify");
          break;
```

### 6. Codex — 역할 등록, 디스패치 거부, QA 허용 목록

이번 범위에서 Codex는 impl-verifier를 실행하지 않는다(대안 분석 「범위」). 그래도 아래는 필요하다.

- **`codex-agent.mjs:9` `ROLE_TOOLS`·`ROLE_FILE_TOOLS`에 역할을 등록한다.** 빠뜨리면 init이 dev 목록과 비교하다
  `Role MCP allowlist differs`로 멈춘다(`codex-agent.mjs:39`·`:43`). 권한이 새지는 않지만 설치가 깨진다.
  ```js
    "impl-verifier": ["agent_next", "board_get", "backlog_get", "report_submit"],
  ```
  ```js
    "impl-verifier": ["Read", "Glob", "Grep", "Bash", "Write"],
  ```
- 쓰기 역할 집합(`codex-agent.mjs:48`의 `write`, `:68`의 sandbox 검사)에 `"impl-verifier"`를 더한다. 템플릿이 `Write`를 선언하므로,
  빠뜨리면 렌더가 `Read-only role declares write tools`로 멈춘다(`:49`).
- **디스패치를 거부한다(`harness-codex.mjs`).** `main()`의 역할 디스패치는 `dispatchBinding`(`:99`)을 지나 `dispatchFreshRole`(`:126`)로 가는
  한 길뿐이다. 거부를 `dispatchBinding` 맨 앞에 두면 `board_get`도, 서버의 역할 run도 생기지 않는다.
  - 오류는 자기 코드와 문구를 낸다. `codexFailure`(`:22`–`:27`)는 지금 `RoleExecutionUnavailable`만 그대로 내고, 나머지는
    "resolve with $harness-init"이라는 일반 문구로 바꾼다. 그대로 두면 소유자가 init을 되풀이하게 된다.
  - 서버에서는 거부하지 않는다. 한 프로젝트를 Claude와 Codex가 함께 쓸 수 있고, 서버의 그래프 검사는 어느 클라이언트가 항목을 돌릴지 모른다.
  - 거부한 뒤에도 `pipeline_next`는 같은 디스패치를 낸다. 그 항목은 Claude Code에서 이어 가거나 *Risks and Rollback*의 「막힌 항목의 출구」를
    따른다. 노드를 그래프에서 빼도 이미 그 버전에 묶인 항목은 그대로다.

  After(새 클래스와 바뀐 두 함수 전체. `dispatchBinding`은 거부 한 줄, `codexFailure`는 조건 하나가 늘었다):

  ```js
  // Codex does not run impl-verifier yet (its verification environment is a separate proposal), so the dispatch stops before any run opens.
  export class CodexRoleUnsupported extends Error {
    constructor() {
      super("Implementation verification (impl-verify) is not available on Codex yet; no role run started. Continue this item from Claude Code, or remove impl-verify from the Pipeline tab so items that have not started skip it.");
      this.name = "CodexRoleUnsupported";
      this.code = "codex-role-unsupported";
    }
  }

  export function dispatchBinding(next, workspaces) {
    if (next.action !== "dispatch") throw new Error("Current pipeline is not dispatchable");
    if (next.agent === "impl-verifier") throw new CodexRoleUnsupported();
    const item = next.key !== undefined;
    if (item && next.format !== null && next.format !== "slots-v1") throw new Error("Unsupported item pipeline format");
    if (next.format === "slots-v1" && (!next.entry?.runId || !next.entry?.entryId || !next.entry?.slotId)) throw new Error("Bound dispatch missing entry");
    const keyed = workspaces.some(ws => ws.agent === next.agent) || ["plan-verifier", "qa-verifier"].includes(next.agent);
    if (keyed && !next.key) throw new Error("Workspace/verifier requires an item key");
    return { agent: next.agent, key: next.key, agentKey: keyed ? next.key : undefined, entry: next.entry, ...(next.agentRunId ? { agentRunId: next.agentRunId } : {}) };
  }

  export function codexFailure(error, session = null) {
    if (error instanceof RoleExecutionUnavailable || error instanceof CodexRoleUnsupported) {
      return { event: "error", session, code: error.code, reason: error.message };
    }
    return { event: "error", session, code: "codex-refused", reason: "Codex configuration, runtime, binding, permission or server check failed. Keep ownership until owned work is quiescent; resolve with $harness-init. No completion is claimed." };
  }
  ```
- **QA 디스패치의 허용 목록(`harness-codex.mjs:122`)에 impl-verifier 보고 경로를 더한다.** QA 디스패치는 대상 커밋(dev의 구현 보고
  커밋) 뒤에 바뀐 파일이 이 목록 밖에 있으면 `Product files changed since the QA implementation target`으로 거부한다(`:121`–`:123`).
  Claude로 impl-verify를 거친 항목을 Codex로 QA하면 그 사이에 `docs/agents/impl-verifier/<KEY>.md`가 커밋돼 있다. 빠뜨리면 그 Codex QA가
  매번 거부된다. 이 목록을 단언하는 시험은 지금 없다(`rg -n "Product files changed" -g '*.test.*'` 결과 없음). 그래서 판정 함수를
  `dispatchBinding`처럼 export해 `plugin/bin/harness-session.test.mjs`에서 시험한다(*Verification Plan*).
  ```js
  // Workflow files that may change after the QA target. impl-verify runs before qa, so its report lands here too.
  export const qaWorkflowFile = (name, key) => ["harness.json", "harness.lock.json", "CLAUDE.md", ".mcp.json", `docs/agents/qa-verifier/${key}.md`, `docs/agents/impl-verifier/${key}.md`, `docs/agents/main-loop/${key}.md`].includes(name) || [".codex/", ".claude/", "docs/harness/"].some(prefix => name.startsWith(prefix));
  ```
  `main`의 `:122` 줄은 지우고, `:123`은 `if (changed.some(name => !qaWorkflowFile(name, dispatch.key))) throw new Error("Product files changed since the QA implementation target");`로 바꾼다.
- `plugin/README.md`에 "impl-verifier는 아직 Codex에서 돌지 않는다. 도우미가 `codex-role-unsupported`로 거부한다"를 더한다. 같은 문단의
  `:54`(독립 verifier의 `--briefing`은 `requiredVerificationPaths`만 담는다)와 `:68`(verifier는 저장소 read-only)은 QA를 반영하지 않는다
  (QA 추가 때 생긴 기존 불일치). 같은 문단을 고치므로 QA도 함께 맞춘다.
- 플러그인 스킬 문서 두 곳이 대기 종류를 나열한다. 둘 다 QA도 반영하지 않았다(기존 불일치).
  - `plugin/skills/watch/SKILL.md:136`의 "A gate, handoff, cap or failed acceptance waits that item only"에 실패한 QA와 구현 검증을 더한다(Phase 3).
  - `plugin/codex/skills/harness-run/SKILL.md:50`의 "Wait at gate/cap/handoff"에 QA·impl-verify 대기를 더한다(Phase 3). 같은 절에
    "도우미가 impl-verifier를 `codex-role-unsupported`로 거부하면 다시 디스패치하지 말고, 소유자에게 Claude Code에서 이어 가라고 알린다"를 더한다.
- **이번에 하지 않는 것(별도 제안서)**: 원안의 아래 변경은 Codex가 impl-verifier를 실행할 때만 필요하다. 거부가 그 앞에 있으므로 넣지 않는다.
  - `codex-thread.mjs`의 `rolePermissions`(`:38`)에서 보고 경로 쓰기 열기와 검증 사본 경로 권한
  - `harness-codex.mjs:17`의 `keyed` 목록
  - `--retry-impl-verify`와, `--retry-qa`를 함께 다루는 `explicitRetry`로 옮기기(`optionsFor` export 포함)
  - impl-verifier 브리핑 분기와 `codex-thread.mjs:375`의 `turn/start` 입력 필드
  - `harness-role-files.test.mjs:98`의 역할 목록, Codex 런북 절, `harness-run` 스킬의 브리핑 문장
- **플러그인 판**: Phase 1·3이 모두 플러그인 파일을 바꾼다(`plugin/lib` 미러 포함). 판은 Phase마다 올리지 않고 한 번만 올린다.
  `plugin/.claude-plugin/plugin.json`과 `plugin/.codex-plugin/plugin.json`을 같은 값으로 올린다
  (`src/fsd/entities/project-token/ui/token-reveal.test.ts:22`가 두 값이 같은지 단언한다).
  - 값은 기능 PR을 dev에 넣을 때의 dev 판보다 하나 높게 정한다. 2026-10-07 기준 main·dev 모두 0.5.11이므로 0.5.12다.
    0.5.11은 역할 명령 스냅숏 제안서(`docs/proposals/completed/2026-10-07-role-command-snapshot-performance.md`)의 Phase 0(#130)과 Phase 1(#132)이 하나씩 올린 값이다.
    다른 PR이 먼저 판을 올리면 그 판의 다음 값이다. 그래서 머지 직전에 dev 판을 다시 확인한다. 기능 브랜치를 딴 뒤
    다른 PR이 같은 값으로 올려 두었으면 충돌 없이 합쳐져 판이 그 PR의 값에 머물고, `:22`의 단언은 두 값이 같은지만 보므로 이것을 잡지 못한다.
  - 판 상승은 기능 PR(`harness/impl-verifier`)의 마지막 커밋으로 넣는다. main 승격은 fast-forward라 커밋을 더할 수 없고, dev·main에는 직접
    커밋하지 않는다(`AGENTS.md`).
  - dev는 운영에 배포되지 않고 플러그인도 main에서 받으므로(*Risks and Rollback*의 배포 순서), 판이 오른 플러그인은 main 승격 뒤에야 사용자에게 간다.
  판 상승 여부와 상관없이, 이 작업이 든 dev를 main으로 승격하면 서버가 운영에 배포된다. 그래서 순서 제약은 판이 아니라 승격에 건다
  (*Execution Plan*, *Risks and Rollback*).

### 7. 웹

| 파일 | 변경 |
| --- | --- |
| `src/fsd/entities/pipeline/model/labels.ts:3` | `LABEL`에 `"impl-verify": "Implementation check"` |
| `src/fsd/entities/pipeline/model/gate-copy.ts` | `"before-impl-verify": { label: "Continue to implementation check", hint: "impl-verifier re-reads the change in a fresh context and checks that the tests catch it." }` |
| `src/fsd/features/review-gate/model/gate-text.ts:23` | `GATE_FEEDBACK`에 `"before-impl-verify": { pending: "Continuing…", lock: "Continued", toast: "Continued to implementation check" }`. 없으면 기본값 "Moving…"·"Done"·"Moved"가 나온다. `before-qa`도 빠져 있어(기존 불일치) `{ pending: "Continuing…", lock: "Continued", toast: "Continued to QA" }`를 함께 넣는다 |
| `src/fsd/features/edit-pipeline/model/rail-state.ts:63` | `addNode`의 삽입 위치: `kind === "impl-verify" ? (nodes.includes("qa") ? nodes.indexOf("qa") : nodes.indexOf("accept"))`. qa는 지금처럼 accept 앞이라 impl-verify 뒤에 자연히 선다 |
| `src/fsd/pages/project-board/model/briefing.ts:49`, `:120` | `slot === "qa-verifier"` / `agent === "qa-verifier"` → `["qa-verifier", "impl-verifier"].includes(…)` |
| `src/fsd/widgets/turn-banner/model/turn.ts:188` | 노드 목록에 `i.node === "impl-verify"` |

`rail-state.ts`의 `addNode` — After(전체 함수):

```ts
export const addNode = (g: Graph, kind: string, plan: string): Step => {
  // 앞머리 노드는 골격 순서의 자리에 끼운다 — propose는 맨 앞, verify는 implement 바로 앞, impl-verify는 qa(없으면 accept) 앞,
  // qa는 accept 앞. 나머지 노드를 다시 세우지는 않는다: 슬롯이 놓인 자리와 꼬리 순서를 그대로 둔다.
  if (!TAIL_NODES.includes(kind)) {
    const nodes = [...g.nodes];
    const at = kind === "propose" ? 0
      : kind === "verify" ? nodes.indexOf("implement")
      : kind === "impl-verify" ? (nodes.includes("qa") ? nodes.indexOf("qa") : nodes.indexOf("accept"))
      : kind === "qa" ? nodes.indexOf("accept")
      : nodes.length;
    nodes.splice(at, 0, kind);
    return check({ ...g, nodes }, plan);
  }
  // 꼬리 노드(accept 뒤)는 끝에 붙인다. 꼬리는 사용자가 바꿔 둔 순서를 그대로 둔다 — 다시 세우면 swapTail이 조용히 풀린다.
  return check({ ...g, nodes: [...g.nodes, kind] }, plan);
};
```

### 8. private 템플릿 (harness-templates)

| 파일 | 변경 |
| --- | --- |
| `en/agents/impl-verifier.md`(신규) | 1절의 계약. 스텁에 runtime 표시가 정확히 하나 있어야 한다(`packages/core/client-runtime.mjs:37`). 렌더한 단계 본문에 `{{`, `/harness:init`, `` `CLAUDE.md` ``가 남으면 안 된다. dual-client 묶음의 Codex 렌더 시험이 모든 역할의 렌더 결과에서 이것들을 금지한다(작업본 `templates.test.mjs:452`–`:453`). 변수는 이 역할이 받는 것만 쓴다. dev 전용 `ws.*` 같은 변수는 렌더에서 `template var missing`으로 실패한다(`packages/core/render.mjs:5`) |
| `en/CLAUDE.runbook.md` | "Optional implementation verification" 절(아래). *Verifier tree check*에 `impl-verify`와 `snap ':(exclude)docs/agents/impl-verifier/<KEY>.md'`. 인수 1번에 impl-verifier 보고를 예상 증거로 추가. "Where things stand"의 `wait` 목록(#7 `55f2d7d`의 `:54`, "a gate, a commit handoff, the cap, failed acceptance")과 사이클의 `wait` 처리 목록(`:93`–`:106`)에 실패한 QA와 구현 검증을 더하고, 처리는 각 절의 대기 단계로 보낸다. QA도 두 목록에서 빠져 있다(QA 대기 처리는 QA 절에만 있다, #8 `efd7d42`의 `:10`) |
| `en/CODEX.runbook.md` | 바꾸지 않는다(6절의 「이번에 하지 않는 것」). 이 행의 본문이 그대로면 Codex 번들 판(런북 해시)도 그대로라, 이번 롤아웃으로 Codex 프로젝트가 멈추지 않는다(*Risks and Rollback*). 이 파일이 harness-templates의 어느 브랜치에도 커밋돼 있지 않은 사정은 *Execution Plan*의 dual-client 묶음 선행 조건에 있다 |
| `en/docs/agents/README.md` | Actors 표에 `impl-verifier` 행 |
| `en/docs/plans/template.md` | Tests 절의 Covered 항목마다 그 동작을 단언하는 시험 파일을 적게 한다(예: `- **Covered**: <behavior> — <test file>`). 지금은 동작만 적고(`:82`–`:87`) 시험 본문은 스케치에서 뺀다(`:75`–`:76`). 그래서 1절 검사 4.1의 시험·제품 파일 구분이 근거를 잃는다. 이 템플릿은 init이 프로젝트에 내려보내므로(`plugin/bin/harness-init.mjs:291`–`:292`), `/harness:init` 뒤에 쓰는 새 계획부터 적용된다 |
| `en/agents/qa-verifier.md`, `en/CLAUDE.runbook.md`의 QA 절 | 두 노드를 함께 쓰는 그래프에서는 impl-verifier 보고 커밋 때문에 HEAD가 늘 targetCommit보다 앞선다. 그런데 QA 템플릿은 시험 빌드가 targetCommit을 돈다는 증거를 요구하고 모호하면 `blocked`로 보며(#8 `efd7d42`의 `en/agents/qa-verifier.md:58`–`:60`. harness-templates 정정 PR이 줄을 옮긴다), 런북은 구현 보고 커밋의 빌드 식별을 준비하라고 한다(`en/CLAUDE.runbook.md:7`). 그래서 한 문장을 더한다. "HEAD와 targetCommit의 차이가 워크플로·보고 파일뿐이면(6절 `qaWorkflowFile`과 같은 목록) 기대한 상태다. 증거는 `git diff --name-only <targetCommit>`이다." 이 증거는 메인 루프가 빌드 증거와 함께 준다. QA에는 셸·Git 도구가 없기 때문이다(`en/agents/qa-verifier.md:4`, `docs/architecture/protocol.md:515`). Codex는 6절의 허용 목록이 디스패치 전에 같은 판정을 한다. 하지만 그 결과는 역할에 넘어가지 않고, QA 브리핑은 `targetCommit`과 `testBuildIdentity`만 받는다(`plugin/bin/harness-codex.mjs:116`, `:124`). Codex 런북의 QA 절("Supply observed build identity evidence", 작업본 `en/CODEX.runbook.md:8`)에 이 증거를 `testBuildIdentity`에 담으라는 문장을 더하는 일은 별도 제안서로 미룬다. Codex에서는 impl-verify가 거부되므로, 이 증거가 필요한 것은 Claude로 impl-verify를 거친 뒤 Codex로 QA하는 혼합 사용뿐이다. 그때 Codex QA는 증거가 모호하다고 보고 `blocked`로 끝날 수 있다 |
| `templates.test.mjs` | `EXPECTED` 도구, `STEPS`, `AGENTS`, Codex 렌더 시험. 연결 고정 시험도 바꾼다. QA 브랜치의 `templates.test.mjs:370`은 실패·차단 보고 단계에 `requires: done`을 `agents/qa-verifier.md`에만 허용하므로, 같은 연결을 쓰는 `agents/impl-verifier.md`도 허용 목록에 넣는다. 실제 서버 엔진으로 단계 경로를 시험하는 QA의 "QA verdict routing with the actual role and server engine"(`:152`–`:175`)과 같은 시험을 impl-verifier에도 둔다(start→verify→report, start 차단, verify 실패·차단). 도우미 `devSession`은 이미 `role`을 받지만(`:50`), 행위자를 `role === "qa-verifier" ? role : cfg.workspaces[0].agent`로 정한다(`:51`). 그대로 두면 impl-verifier 세션이 dev 행위자로 돌아 역할을 시험하지 못하므로 `role === "dev" ? cfg.workspaces[0].agent : role`로 바꾼다. 보고 에이전트 목록 `REPORT`(`:179`, `:211`의 보고 표 시험이 쓴다)에 `agents/impl-verifier.md`를 더하고, 에이전트 수를 적은 두 곳(머리 주석 `:2`의 "6종", `:405`의 시험 이름 "all six private role templates")도 맞춘다. harness-templates 정정 PR의 시험 "the runbook fingerprints the tree around both verifiers, QA's own report excluded"는 *Verifier tree check* 문장을 `verify`·`qa` 두 노드로 고정하므로(``run `snap` at `verify`, or …``와 ``At the `verify` and `qa` nodes…`` 단언), 그 문장에 `impl-verify`를 넣으면서 이 단언도 바꾼다. dual-client 묶음이 들여오는 두 시험도 고려한다(작업본 기준, 묶음 커밋 뒤 줄 번호는 달라질 수 있다). 이주 시험 "preserves all existing graph edges and requirements across the dual-client migration"(`:431`–`:437`)은 `AGENTS`의 역할마다 #6 `95ace9d`의 이전 판을 `git show`로 읽는다. 새 역할은 이전 판이 없으므로 `agents/qa-verifier.md`처럼 `agents/impl-verifier.md`도 걸러 낸다. 그대로 두면 `fatal: path … does not exist`로 실패한다. 렌더 시험 "renders each entitled Codex role and every server step…"(`:439`–`:457`)은 `AGENTS`의 역할을 모두 렌더하므로 impl-verifier도 자동으로 돈다. 그래서 *Verification Plan*의 Codex 렌더 시험은 그 시험이 있으면 겹친다(남겨도 무해하다). 계약 두 가지는 따로 고정한다. 하나는 impl-verifier 단계 id와 `requires`다. `start`·`verify`·`failed-report`·`blocked-report`는 `["done"]`, `report`는 `["done", "verify-ok"]`(형제: QA 브랜치 `:352`–`:354`의 dev 단계 단언). 다른 하나는 QA 템플릿에 더한 두 노드 그래프 문장이다(`render("agents/qa-verifier.md")`에 `diff --name-only`, 형제 `:203`–`:207`). 두 노드 그래프는 실제 모델 리허설(성공 기준 4)이 돌지 않으므로 이 단언이 그 문장의 유일한 검사다 |

런북 절의 내용(문장은 템플릿에서 정한다). 아래 번호는 이 문서 안의 참조용이다. 런북 문장에는 단계·게이트 번호를 쓰지 않는다
(QA 브랜치 `templates.test.mjs:229`의 `/step:? [0-9]|[Gg]ate [0-9]/`).

1. `impl-verify`에서 디스패치하기 전에, 저장소 밖에 구현 보고 커밋의 사본을 만든다. `git clone` 뒤 그 커밋으로 detached checkout을 하고,
   `git -C <사본> remote remove origin`으로 원격을 지운다.
   - 원격을 지우는 이유: 로컬 경로에서 clone한 사본의 `origin`은 본 저장소를 가리킨다. 사본에서 push하면 본 저장소의 ref가 바뀌는데,
     *Verifier tree check*의 `snap`은 작업 트리만 보므로 이것을 잡지 못한다.
   - 위치는 런북이 정한다: `~/.harness/impl-verify/<저장소 디렉터리 이름>-<해시>/<KEY>`. 해시는 `git rev-parse --show-toplevel` 출력의
     sha256 앞 8자이고, 계산 명령(Node 한 줄)은 런북이 준다.
     - 메인 루프와 소유자 없는 감시 실행이 따로 읽을 설정 없이 같은 경로를 얻는다. 위치를 harness.json에 두면 설정 형식이 바뀌므로 그렇게 하지 않는다.
     - 해시는 디렉터리 이름이 같은 두 checkout(같은 저장소의 다른 clone 등)이 같은 `<KEY>` 사본을 서로 지우지 않게 한다.
     - 저장소 옆(`<저장소>.impl-verify`)에 두지 않는다. 저장소가 OneDrive 같은 동기화 폴더 아래면(이 저장소를 개발하는 PC가 그렇다) 항목마다
       전체 clone과 의존성이 동기화 대상이 된다. 이 저장소는 의존성을 포함한 작업 트리가 33,900개 파일·764.6MB였다
       (`docs/proposals/completed/2026-10-07-role-command-snapshot-performance.md:102`, 역할 명령 스냅숏 기준).
     - 홈 바로 아래 점 디렉터리는 OneDrive 폴더 백업과 iCloud가 동기화하는 Desktop·Documents 밖이다. 홈 전체를 동기화하는 환경이면
       소유자가 이 디렉터리를 동기화에서 뺀다(9절의 롤아웃 절).
     - OS 임시 폴더에도 두지 않는다. 소유자가 한 번 등록하는 경로(아래)가 늘 같아야 하는데, 임시 폴더 위치는 환경 변수(`TMPDIR`·`TEMP`)를 따라 바뀐다.
   - 소유자는 `~/.harness/impl-verify`의 절대 경로를 Claude Code 설정의 `permissions.additionalDirectories`에 한 번 등록해 둔다.
     저장소마다가 아니라 한 번이다.
     Claude Code 문서(permissions의 Working directories, sandboxing)에 따르면 등록이 주는 것은 셋이다.
     - 확인 없는 읽기
     - 그 디렉터리로의 `cd`를 읽기 전용 명령으로 보는 것
     - 샌드박스(macOS·Linux·WSL2)에서 그 디렉터리에 쓰는 것
   - 등록 뒤 사본 안의 검증 명령과 Git 명령이 확인을 거치는지는, dev가 저장소에서 검증 명령을 돌릴 때처럼 소유자의 권한 모드·허용 규칙·
     샌드박스 자동 허용이 정한다. 파일 수정도 권한 모드를 따른다. 네이티브 Windows에서는 샌드박스가 돌지 않는다(sandboxing 문서).
     같은 명령에서 `cd`로 사본에 들어가 `git`을 돌리면, 그 디렉터리의 Git 훅이 돌 수 있어 읽기 전용이라도 확인을 묻는다
     (permissions의 Read-only commands). impl-verifier는 사본의 Git을 `git -C <사본>`으로 부른다(1절). 하지만 기본 권한 모드에서는 이것도
     매번 확인을 묻는다(2026-10-08 실측). 런북은 그때 소유자에게 알리라고 하고, `Bash(git -C <경로>/*)` 같은 와일드카드 허용 규칙은 권하지 말라고
     한다. 실측에서 그런 규칙이 `..`로 빠져나간 다른 저장소의 `git`까지 허용했다(*Open Questions*).
   - 같은 `<KEY>` 사본이 남아 있으면(대기 뒤 명시적 재시도) 6단계처럼 링크를 먼저 끊고 지운 뒤 새로 만든다. `git clone`은 비어 있지 않은
     대상 디렉터리를 거부한다.
   - 서브에이전트는 정의에 `permissionMode`가 없으면 메인 대화의 권한 모드로 돌고(역할 스텁은 이 값을 두지 않는다), 확인 요청은 메인 세션에 뜬다
     (Claude Code 문서 sub-agents). 셸 명령의 샌드박스도 부모 세션과 같은 설정을 쓴다(sandboxing). 파일 도구가 추가 디렉터리를 확인 없이 읽는지는
     문서에 없어서 Phase 4 전에 확인했다. 서브에이전트의 파일 도구도 메인과 똑같이 등록을 따른다(2026-10-08, *Open Questions*).
2. 작업 영역 검증 명령이 그 사본에서 돌도록 의존성을 준비한다(설치나 연결은 프로젝트가 정한다). 기준 실행은 하지 않는다.
   **준비가 실패해도 디스패치한다.** 기준 실행과 환경 판정은 impl-verifier의 `start`가 하고(1절), 실패하면 `blocked` 보고가 서버에 남는다.
   그러면 그 항목만 `wait on impl-verify`로 멈춘다. 메인 루프가 디스패치를 건너뛰면 서버에는 아무것도 기록되지 않는다.
   `pipeline_next`는 같은 디스패치를 계속 내고(`src/server/pipeline/run-rules.ts:72`), 감시는 같은 일을 세 번 보면 감시 전체를 `stuck`으로 멈춘다
   (`packages/core/watch.mjs:1`, `:153`–`:156`, `plugin/skills/watch/SKILL.md:116`–`:117`).
   의존성을 링크로 연결할 때, 같은 저장소 안의 워크스페이스 패키지로 가는 링크가 본 checkout을 가리키면 안 된다.
   - 그러면 시험이 사본이 아니라 본 checkout의 파일을 가져온다. 사본에서 되돌린 파일을 시험이 보지 못해 "시험이 변경을 못 잡음"이 거짓으로 나온다.
   - 1절 검사 4.2의 트리 해시는 사본 파일이 바뀐 것만 확인하므로 이 경우를 잡지 못한다.
   - 그래서 그런 패키지는 사본 안에서 다시 연결하거나 설치한다.
3. 브리핑에는 project, key, entry, targetCommit, 사본 경로만 넣는다(런북은 모든 에이전트 브리핑에 같은 `project`를 요구한다. `templates.test.mjs`의
   "Every agent briefing must supply this same `project`" 단언).
4. 디스패치 전후로 *Verifier tree check*를 한다.
5. 대기(`wait on impl-verify`)면 보고를 읽고 소유자에게 알린 뒤 멈춘다. 재시도는 명시적 결정 뒤에만 현재 entry로 한다.
6. 끝나면 사본을 지운다. 대기 중이던 항목이 버려지거나 보류로 빠져 그 사본을 더 쓰지 않게 됐을 때도 지운다. 의존성을 링크(junction·symlink)로 연결했다면 링크를 먼저 끊고 지운다. Windows에서 링크째 재귀 삭제하면 원본의
   내용까지 지워질 수 있다.

Free 런북 시험(`templates.test.mjs`의 "a free runbook names no agent it did not get")은 `/doc-auditor|plan-verifier/`만 검사한다.
QA 절은 본문에서 `qa-verifier`를 이름으로 부른다(harness-templates `harness/qa-verifier`의 `en/CLAUDE.runbook.md:5`). impl-verify 절도
QA 절과 같은 방식으로 써도 이 시험에 걸리지 않는다. 이 시험을 검증 에이전트 전체로 넓히는 일은 이 제안의 범위 밖이다.

### 9. 문서

| 파일 | 변경 |
| --- | --- |
| `docs/architecture/impl-verifier.md`(신규) | 역할·입력·권한·판정·롤아웃. `qa-verifier.md`와 같은 구성. 롤아웃 절에 배포 순서와 소유자 순서(플러그인 갱신 → `/harness:init` → Claude는 검증 사본 디렉터리 등록(8절) → Pipeline 탭에서 노드 추가)를 적고, 막힌 항목의 출구(*Risks and Rollback*)도 적는다. Codex로 돌리는 프로젝트에는 아직 넣지 않는다는 것(6절의 거부)과, 홈 전체를 동기화하는 환경이면 사본 디렉터리를 동기화에서 빼라는 것(8절 1단계)도 적는다 |
| `docs/architecture/README.md:106` 옆 | 색인 한 줄 |
| `docs/architecture/protocol.md:271` 단락 옆 | impl-verify 단락(QA 단락과 같은 모양). 순서(implement와 accept 사이, qa가 있으면 그 앞), 진입 시 `done` 기록, 완료 증거(현재 entry의 run이 verify/ok·report/ok로 닫히고 결합 보고가 있음), 보고 조건(결합 runId·보고 경로·SHA 커밋), wait-on-impl-verify, 최종 인수는 메인 루프 |
| `docs/architecture/protocol.md:156`, `:180` | `pipeline_next` 답의 대기 종류 목록 `wait`(`gate`·`handoff`·`cap`·`acceptance`)과 감시 절의 같은 목록("gate/handoff/cap/acceptance가 다른 ready 항목을 가리지 않는다")에 `impl-verify`를 더한다. `qa`도 빠져 있어 함께 넣는다 |
| `docs/architecture/protocol.md:146`, `:148`, `:152` | 도구 표의 호출자 칸. `backlog_get`("dev")과 `board_get`("dev·plan-verifier·main-loop")에 impl-verifier를, `report_submit`("dev·main-loop")에 impl-verifier를 더한다. qa-verifier도 세 칸 모두에서 빠져 있어 함께 넣는다 |
| `docs/architecture/invariants.md:73` | "고정 4종"은 QA 추가 때 이미 낡았다. 수 대신 "고정 보고 에이전트(`REPORT_AGENTS`)"로 쓴다. 같은 문구가 `src/server/pipeline/board-rules.ts:112`의 주석에도 있어 함께 고친다(주석만, Phase 2). `packages/core/entitlement.mjs:8`의 "고정 4역"은 3절에서 고친다 |
| `docs/conventions/product-copy.md` | 아래 목록 |

`product-copy.md`에서 바꿀 곳:

| 절 | 바꿀 것 |
| --- | --- |
| §5 배너 터미널 줄(`product-copy.md:208`–`:213`) | 노드별 줄 목록에 `impl-verify → Continue the pipeline for ITEM-01: impl-verify — impl-verifier runs impl-verify.`를 넣는다. 코드는 바꾸지 않는다. `NODE_LINE`에 없는 노드는 이 기본 줄이 나간다(`src/fsd/widgets/turn-banner/model/turn.ts:153`). `qa`도 같은 기본 줄로 나가는데 목록에서 빠져 있어 함께 넣는다. 이 줄은 실패·차단으로 대기 중일 때도 나온다(*Risks and Rollback*의 「웹 표시」) |
| §6 Board — Team row(`product-copy.md:318`) | "plan-verifier with Verify …" 목록에 impl-verifier(Implementation check)를 넣는다. 역할 용어 목록(`:328`)에 impl-verifier 용어를 넣는다 |
| §7 Inbox(`:340`) | 상태 경계가 없는 게이트 목록에 `before-impl-verify`를 넣는다 |
| §12 거부 문구 표(`:730`–`:741`) | `validateGraph`의 새 사유 두 줄(`impl-verify must be between implement and accept`, `impl-verify must come before qa`)을 넣는다. §18이 레일 버튼은 §12의 문구를 그대로 보인다고 적으므로(`:1219`–`:1220`) 필요하다. QA의 `qa must be between implement and accept`도 빠져 있어 함께 넣는다. 보드 거부 목록(`:692`–`:716`)에는 4절 `submitReport`의 impl-verifier 사유 여섯 줄(`IMPL_VERIFY_PENDING`과 "Implementation verification …"으로 시작하는 다섯 줄)을 웹 문구 없음(—)으로 넣는다. QA의 고정 사유 여섯 줄(`QA has not completed…`, `QA evidence belongs to qa-verifier`, "QA report requires …" 두 줄, `QA target does not match…`, `QA verdict does not match…`)도 빠져 있어 함께 넣는다. `parseQaReport`의 입력 검사 문구는 넣지 않는다 |
| §13 `dispatch` hint 표 | `impl-verify` 행. **Phase 2에서** HINT와 함께 넣는다(*Execution Plan*의 선행 조건) |
| §13 `pipeline_next` 행(`:772`) | 대기 종류 "`wait` on a `gate` · `handoff` · `cap` · `acceptance`"에 `impl-verify`를 더한다. `qa`도 빠져 있어 함께 넣는다(protocol `:156`과 같은 목록) |
| §13 `report_submit` 행(`:769`) | 4절에서 바꾼 도구 설명과 같은 문장으로 맞춘다. 지금 이 행에는 QA 문장도 없다(기존 불일치) |
| §13 `gate_approve` 행(`:779`) | **바꾸지 않는다.** gate id는 예시 목록이고, 이 행은 owner 도구 설명과 글자 그대로 고정돼 있다(`src/server/mcp/owner-tools.test.mjs`). `before-qa`도 들어 있지 않다 |
| §14 Generated templates | `agents/impl-verifier.md` 요약 항목을 추가한다. 런북 Sections 목록에 "Optional implementation verification"을, Verifier tree check 항목에 `impl-verify`를 넣는다. 계획 템플릿 규칙 목록(`:959`–`:973`)에 Tests 규칙("each Covered behavior names the test file that asserts it")을 더한다(8절). 런북 요약의 "Where things stand" 대기 목록(`:907`, "gate, handoff, cap or failed acceptance")과 Cycle 요약의 대기 처리(`:913`–`:917`)에 실패한 QA·구현 검증을, 인수 확인 요약 1번(`:924`–`:929`)에 impl-verifier 보고를 더한다. 8절의 런북 변경과 같은 내용이다 |
| §18 Pipeline tab | 노드 카드 이름 목록, auto 라벨 목록("auto → implementation check"), **+** 패널의 opt-in 노드 설명에 Implementation check를 넣는다 |

QA도 §5·§6·§7·§12·§13(`pipeline_next` 행)·§14(대기 목록)·§18과 protocol의 같은 목록·칸에서 빠져 있다(QA 추가 때 생긴 기존 불일치). 같은 목록을 고치는 편집이므로 QA 항목도 함께 맞춘다.
다음 두 빈자리는 맞추지 않는다.
- §14에 `agents/qa-verifier.md` 요약 항목이 없다. impl-verifier 항목은 넣지만, QA 요약은 QA 템플릿 내용을 정리하는 별도 문서 작업이다.
- §6 Activity 표가 슬롯 노드의 줄(`briefing.ts:49`의 "working: … · …")을 설명하지 않는다. doc-audit·scout·qa에 공통인 기존 빈자리이고,
  impl-verify 줄도 같은 형식으로 나간다.

화면 문구 자체는 *Open Questions*의 [화면 문구]에서 확정한다.

### 10. 노드·에이전트 이름 비교 지점 전수 목록

QA를 문자열로 다루는 시험 밖의 모든 지점을 아래 명령으로 열거했다. 각 지점에서 impl-verify에 무엇이 필요한지 판정했다.

```bash
rg -n 'qa-verifier|"qa"|\bqa[A-Z]\w*|before-qa|retry-qa|\bqa:' src packages plugin/bin plugin/runtime plugin/lib plugin/skills plugin/codex scripts tests -g '!*.test.*' -g '!**/generated/**'
```

2026-10-07(origin/dev `c8799f6`) 기준 22개 파일 86줄이다(`plugin/lib` 미러 포함, `c78b8d0`·`42fc424`·`1dce256`·`4264126`·`ab538b5`·`c8e81c1`·`1ad8672`·`aba7629`·`8a12137`에서도 같았다). 따옴표 없는 이름(`docs/agents/qa-verifier/…` 같은 경로 조각)과
`qaBriefing` 같은 파생 이름, `labels.ts:3`의 `qa: "QA"` 같은 키까지 이 패턴에 걸린다. `plugin/skills`·`plugin/codex`·`scripts`·`tests`에는
결과가 없다. 이름을 쓰지 않고 대기 종류나 브리핑을 나열하는 문서는 이 검색에 걸리지 않으므로 6절과 9절에서 따로 다룬다.

| 지점 | 내용 | impl-verify 처리 |
| --- | --- | --- |
| `packages/core/pipeline.mjs:7`, `:11`, `:27`, `:46`, `:66`, `:96`, `:109`, `:141` | 노드 규칙 | 2절 |
| `packages/core/pipeline.d.mts:20` | `qaComplete` 타입 | `implVerifyComplete` 추가(2절) |
| `packages/core/entitlement.mjs:9` | `REPORT_AGENTS` | 3절 |
| `packages/core/watch.mjs:97`–`:100` | qa 대기 검사 | 5절 |
| `plugin/lib/{pipeline,entitlement,watch}.mjs` | 코어의 미러 | `scripts/plugin-lib.mjs`가 동기화 |
| `src/server/pipeline/run-rules.ts:14`, `:26`, `:44`, `:68` | 대기 형태·입력·HINT·판정 | 4절 |
| `src/server/pipeline/run-query.ts:4`, `:16`, `:64`–`:68`, `:130`, `:134` | import·사실·실패 읽기 | 4절 |
| `src/server/pipeline/qa-query.ts:8`–`:9` | QA 전용 질의 | 바꾸지 않는다. 형제 모듈을 새로 둔다 |
| `src/server/pipeline/board-query.ts:529` | QA 인수 차단 | 앞뒤에 impl-verify 줄을 하나씩 둔다(4절) |
| `src/server/pipeline/board-query.ts:530`–`:539` | QA 증거 검사 | 바꾸지 않는다(QA 전용). impl-verifier 블록을 따로 둔다 |
| `src/server/mcp/tools.ts:207` | `report_submit` 설명 | impl-verifier의 runId 요구를 더한다(4절) |
| `src/fsd/widgets/turn-banner/model/turn.ts:188` | 노드 목록 | 7절 |
| `src/fsd/features/edit-pipeline/model/rail-state.ts:63` | 삽입 위치 | 7절 |
| `src/fsd/entities/pipeline/model/gate-copy.ts:11` | `before-qa` 문구 | 7절 |
| `src/fsd/entities/pipeline/model/labels.ts:3` | 노드 라벨 | 7절 |
| `src/fsd/pages/project-board/model/briefing.ts:49`, `:120` | 보고 에이전트 상태 | 7절 |
| `plugin/bin/harness-codex.mjs:17`, `:33`, `:83`–`:84`, `:111`, `:124` | key 필수·옵션·재시도·브리핑 | 바꾸지 않는다. impl-verifier는 그 앞의 `dispatchBinding`에서 거부된다(6절). Codex 실행은 별도 제안서 |
| `plugin/bin/harness-codex.mjs:122` | QA 대상 커밋 뒤 허용 파일 | impl-verifier 보고 경로를 더한다(6절) |
| `plugin/bin/harness-init.mjs:356`–`:382` | QA 브라우저 MCP 등록 | 해당 없음(QA 브라우저 전용) |
| `plugin/runtime/qa-browser.mjs:99` | QA 브라우저 관찰 | 해당 없음 |
| `plugin/runtime/codex-agent.mjs:14`, `:19`, `:48`, `:68` | 역할 표·쓰기 역할 | 6절 |
| `plugin/runtime/codex-agent.mjs:46` | 브라우저 도구 수 | 바꾸지 않는다. QA가 아닌 역할은 브라우저 도구가 0개여야 한다는 기존 분기가 impl-verifier에 그대로 맞다 |
| `plugin/runtime/codex-thread.mjs:44`–`:46` | 보고 경로 쓰기 | 바꾸지 않는다(디스패치 전에 거부, 6절). 별도 제안서 |
| `plugin/runtime/codex-thread.mjs:375` | 역할 스레드 입력(`qaBriefing`) | 바꾸지 않는다. 별도 제안서 |
| `plugin/runtime/codex-thread.mjs:121`, `:227`, `:234`, `:329` | QA 브라우저 관찰·도구 | 해당 없음(QA 브라우저 전용) |
| `plugin/runtime/codex-thread.mjs:233`, `:315`, `:319`, `:326`, `:334` | pm·qa 예외 | 바꾸지 않는다. Codex가 impl-verifier를 실행하게 되면 plan-verifier처럼 비Windows에서 셸을, Windows에서 네이티브 명령과 Git을 받아야 한다(Bash가 필요하다). 별도 제안서가 확인한다 |

QA 이름을 쓰지 않고 목록·표로 따라오는 지점은 아래 두 검색으로 따로 열거했다. 보고 에이전트 목록의 소비자와, 게이트별·행위자별 표다.

```bash
rg -n 'REPORT_AGENTS|limitsFor\([^)]*\)\.agents|entitlement\.agents' src packages plugin/bin plugin/runtime scripts -g '!*.test.*' -g '!**/generated/**'
rg -n '"before-scout"|"before-doc-audit"|"feature-scout"|"doc-auditor"' src packages plugin/bin plugin/runtime scripts -g '!*.test.*' -g '!**/generated/**'
```

두 번째 검색의 나머지 결과는 프로젝트 슬롯(doc-audit·scout)과 head 디스패치(pm·feature-scout) 전용이라 항목 노드인 impl-verify와 무관하다.

| 지점 | 근거 |
| --- | --- |
| `src/fsd/features/edit-pipeline/ui/pipeline-rail.tsx:52`, `:59` | 추가 가능한 노드를 `NODE_KINDS`에서 만들고, 버튼 문구는 `nodeLabel`이다 |
| `src/server/agents/next.ts:61` | key 필요 여부는 템플릿의 `requires`에서 정한다(`requires: done`이면 key 필수) |
| `src/server/agents/next.ts:85`–`:86` | 알려진 에이전트와 플랜 허용 여부는 `REPORT_AGENTS`와 `allowsAgent`가 정한다 |
| `src/server/pipeline/board-rules.ts:99` | 알려진 보고자는 `REPORT_AGENTS`다 |
| `packages/core/pipeline.mjs:43` | `nodeAllowed`가 플랜의 agents로 판정한다 |
| `packages/core/deliver.mjs:33`, `packages/core/client-runtime.mjs:29`, `src/server/client-bundle-query.ts:20` | 템플릿 배포와 Codex 번들 검사가 플랜의 agents를 따른다. 새 에이전트의 템플릿 행이 필수가 된다(*Risks and Rollback*의 배포 순서) |
| `plugin/bin/harness-init.mjs:277` | 설치할 에이전트 목록은 설치된 플러그인의 `REPORT_AGENTS`다(*Risks and Rollback*) |
| `packages/core/workspaces.mjs:14` | `REPORT_AGENTS`의 이름은 워크스페이스 이름으로 예약된다. 워크스페이스를 `impl-verifier`로 둔 기존 프로젝트는 새 판에서 init과 `project_sync`가 거부된다(*Execution Plan* Phase 7의 사전 확인) |
| `src/fsd/shared/lib/entitlement-copy.ts:36` | 요금 화면의 "Report agents" 행이 `limitsFor(p).agents`를 그대로 나열한다. Pro·Max 칸에 `impl-verifier`가 붙는다. 이 문구를 고정한 시험은 없다 |
| `src/fsd/entities/board-item/model/doc-link.ts:24`–`:40` | 보고 문서 라벨은 행위자별 표에 없으면 "Implementation report"다. impl-verifier 보고도 지금의 plan-verifier·qa-verifier 보고처럼 이 라벨로 보인다(product-copy §11의 "other"). 따로 라벨을 두려면 표에 든 행위자를 순서에서 빼는 `orderReportActors`(`:43`)도 함께 바꿔야 하므로, 이 제안은 바꾸지 않는다(*Open Questions*의 [화면 문구]) |

### 11. 동시성·재실행·부분 실패·권한

- **같은 보고의 중복 제출**: run이 열려 있는 동안 `report_submit`이 두 번 오면 Report 행이 둘 생긴다. 완료 판정은 마지막으로 닫힌
  run의 가장 최근 보고 하나만 읽으므로(`implVerifyEntryResult`의 `orderBy: { at: "desc" }, take: 1`) 판정은 바뀌지 않는다. QA와 같다.
  run이 닫힌 뒤의 재제출은 4절의 impl-verifier 검사 블록에서 거부된다. 결합 run을 `closedAt: null`로 찾으므로
  "…does not match the current run's outcome"이 되고, 커서가 이미 `accept`로 넘어갔으면 그보다 앞에서 "…requires the current impl-verify entry"가 된다.
  뒤의 `stale report run` 검사(`board-query.ts:543`)까지는 가지 않는다. 이 거부는 통합 시험이 두 경우 모두에서 확인한다(*Verification Plan*).
- **부분 실패**: 보고 행 생성, 이벤트 기록, 커서 전진(`advanceRun`)이 한 트랜잭션 안에서 일어난다(4절의 `submitReport`).
  - 응답이 유실되면 에이전트는 outcome 없이 `agent_next`를 다시 불러 같은 단계를 받는다(기존 규약).
  - 보고 커밋 전(핸드오프)에 멈추면 run이 열린 채 남고 `wait on handoff`로 드러난다.
- **보고 없이 닫힌 run**: `failure`가 `null`이므로 다음 `pipeline_next`가 impl-verifier를 다시 디스패치한다. QA와 같은
  동작이다(`qa-query.ts`). 성공 기준 2의 "반복 디스패치하지 않는다"는 보고가 있는 실패·차단에만 해당한다.
- **서로 다른 호출자의 경쟁**:
  - 메인 루프의 인수 기록과 impl-verifier의 보고는 둘 다 `submitReport`를 지난다. 이 함수는 소유자와 프로젝트 행을
    `FOR UPDATE`로 잠근 뒤 커서를 읽으므로 둘이 직렬화된다(`board-query.ts:53`–`:54`).
  - run 종료로 커서가 아직 `accept`로 옮겨지기 전에 인수가 오면 거부될 뿐이다(실패 쪽이 안전하다).
  - 새로 생기는 공유 집계값은 없다.
- **권한**:
  - `report_submit`은 기존 MCP 도구라 프로젝트 범위 검사를 지난다. 역할 이름은 인증 주체가 아니고(프로젝트 토큰이 모든 역할을
    대신한다), 이는 QA와 같은 기존 태세다. 새 인증 경계는 없다.
  - 대신 목적지에서 검사한다. impl-verifier 보고는 현재 impl-verify entry, `done` 상태, 열린 결합 run이 있을 때만 받는다(4절).
  - Free 프로젝트에서는 impl-verifier run이 생기지 않는다. `agent_next`가 플랜 밖 에이전트를 거부하기 때문이다
    (`src/server/agents/next.ts:86`, run을 만드는 쪽은 `src/server/agents/run-query.ts:32`). 그래서 결합 run을 요구하는 보고도 늘 거부된다.
  - Free는 그래프를 저장할 수 없다. 저장은 플랜 검사(`allowsPipelineEdit`, `src/fsd/features/edit-pipeline/api/edit-pipeline.server.ts:16`)에서
    먼저 막히고, 그다음 `validateGraph`의 `nodeAllowed`가 막는다. 하지만 두 검사 모두 그래프를 저장할 때만 돈다.
    - Pro·Max에서 Free로 내려간 프로젝트는 저장된 그래프에 노드가 남는다. 서비스 코드(`src`)에서 그래프 버전을 쓰는 곳은 저장(`src/server/pipeline/version-save-query.ts:16`)과
      첫 버전 생성(`src/server/pipeline/run-query.ts:29`)뿐이고, 플랜 하향은 프로젝트의 사용 가능 여부를 바꾼다(`src/server/project-availability-service.ts:136`).
    - 그러면 `pipeline_next`는 계속 impl-verifier를 디스패치하고, 서버에 아무것도 남지 않아 같은 디스패치가 되풀이된다(8절 2단계의 감시 `stuck`과 같은 경로).
    - 소유자는 노드 없는 그래프를 저장할 수도 없다. 그래서 그 버전의 항목은 impl-verify를 끝내지 못하고 인수도 거부된다(4절의 인수 차단).
      Reopen해도 같은 자리로 돌아온다. 플랜을 다시 올리지 않으면, 출구는 *Risks and Rollback*의 「막힌 항목의 출구」에 적은 계획부터 다시 여는 길뿐이다.
    - QA도 지금 같다. 이 제안은 바꾸지 않는다.

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `packages/core/pipeline.mjs`, `pipeline.d.mts`, `pipeline.test.mjs` | update | 노드·순서·완료·전이의 단일 출처 | medium. 모든 커서 판정이 지난다. `pipeline.test.mjs:5`의 `full` 그래프와 `:44`의 기본 그래프 기대값에서 `impl-verify`를 빼야 기존 시험이 그대로다 |
| `packages/core/entitlement.mjs`, `entitlement.test.mjs:40` | update | 보고 에이전트 목록 | low |
| `packages/core/watch.mjs`, `watch.test.mjs`(형제 사례 `:27`–`:35`를 본뜬 새 사례, *Verification Plan*) | update | 새 대기 형식 | medium. 소유자가 노드를 넣기 전에 그 소유자의 플러그인이 갱신돼 있어야 한다(5절) |
| `plugin/lib/{pipeline,entitlement,watch}.mjs` | update(미러) | `scripts/plugin-lib.mjs` | low. `npm run check`가 일치를 검사한다 |
| `src/server/pipeline/impl-verify-query.ts`(신규), `run-query.ts`, `run-rules.ts`, `run-rules.test.mjs`, `board-query.ts`, `board-rules.ts`(주석만) | create/update | 완료 판정·대기·보고 규칙 | medium |
| `tests/server/integration/impl-verifier.test.ts`(신규) | create | 성공 기준 2, 닫힌 run 보고의 재제출 거부(11절), 두 노드 그래프의 인수 거부 문구(4절) | low |
| `src/server/templates-query.test.ts:14`·`:53`·`:149`·`:154`, `src/server/client-bundle-query.test.ts:8`, `src/server/harness-init.test.ts:21`, `tests/server/integration/client-runtime.test.ts:16`, `packages/core/client-runtime.test.mjs:11` | update | 에이전트 목록을 열거하는 시험 고정값. Codex 번들은 플랜의 모든 역할 템플릿을 요구한다(`client-runtime.mjs:32`) | low |
| `src/fsd/pages/project-board/model/briefing.test.mjs:135`·`:213`, `src/fsd/pages/project-board/ui/project-board-page.test.mjs:57` | update | `NODE_KINDS`로 만든 Team 목록을 고정해 둔 시험. impl-verifier가 그래프 순서대로 plan-verifier와 qa-verifier 사이에 들어간다 | low |
| `src/server/pipeline/run-rules.test.mjs:73` | update | `HINT`의 키 목록 고정값에 `impl-verify`를 넣는다 | low |
| `plugin/bin/harness-init.test.mjs:27` | update | init 시험의 템플릿 픽스처. Pro/Max 플랜이면 init이 `agents/impl-verifier.md`를 요구하므로(`harness-init.mjs:270`) 픽스처 행을 더한다 | low |
| `plugin/runtime/codex-agent.mjs`, `plugin/bin/harness-codex.mjs`, `plugin/README.md`, `plugin/skills/watch/SKILL.md`, `plugin/codex/skills/harness-run/SKILL.md` | update | Codex 역할 등록·impl-verifier 디스패치 거부·QA 허용 목록, 설명 문서와 스킬의 대기·거부 문장 | medium |
| `plugin/.claude-plugin/plugin.json`, `plugin/.codex-plugin/plugin.json` | update | 플러그인 판(Phase 7에서 한 번, 두 값을 같게) | medium. 판이 사용자 배포 시점을 정하므로 *Risks and Rollback*의 순서를 따른다 |
| `plugin/bin/harness-session.test.mjs`(`dispatchBinding`·`codexFailure`·`qaWorkflowFile`) | update | impl-verifier 디스패치 거부(역할 run 전, 자기 코드와 문구)와 QA 허용 목록의 impl-verifier 보고 경로를 더한다(Phase 3, *Verification Plan*). `plugin/bin/harness-init-dual.test.mjs`는 `ROLE_TOOLS`에서 역할을 만들므로(`:17`) 자동으로 따라온다. `harness-role-files.test.mjs:98`의 역할 목록은 이번에 바꾸지 않는다(Codex 권한 분기를 두지 않으므로, 6절) | low |
| `src/server/mcp/tools.ts`, `src/server/mcp/tools.test.mjs:90` | update | `report_submit` 설명(4절). product-copy §13 행과 같은 문장으로 맞춘 뒤, `:90`의 고정 목록에 `"report_submit"`을 더해 일치를 시험으로 고정한다(Phase 5) | low |
| `src/fsd/entities/pipeline/model/{labels,gate-copy}.ts`, `src/fsd/features/review-gate/model/gate-text.ts`, `src/fsd/features/edit-pipeline/model/rail-state.ts`, `src/fsd/pages/project-board/model/briefing.ts`(+test), `src/fsd/widgets/turn-banner/model/turn.ts`, `rail-state.test.ts`·`gate-copy.test.ts`(새 사례, *Verification Plan*) | update | 편집기·게이트 버튼·배너·브리핑 | low |
| `src/fsd/entities/pipeline/model/labels.test.ts:19`, `:26` | update | `NODE_KINDS` 전체를 매핑한 리터럴 배열을 고정해 둔 시험. 새 노드 자리에 `"auto → implementation check"`와 `"Implementation check"`가 들어간다 | low |
| `docs/architecture/{impl-verifier.md,README.md,protocol.md,invariants.md}`, `docs/conventions/product-copy.md` | create/update | 계약 문서 | low |
| harness-templates: `en/agents/impl-verifier.md`(신규), `en/agents/qa-verifier.md`, `en/CLAUDE.runbook.md`, `en/docs/agents/README.md`, `en/docs/plans/template.md`, `templates.test.mjs`(`:370`과 단계 경로 시험 포함) | create/update | 역할 정의·런북 | medium. 이 작업이 든 main 승격 전에 시드해야 한다(*Risks and Rollback*). dual-client 묶음 커밋이 선행 조건이다(*Execution Plan*) |

소비자 영향: 위 목록의 근거는 네 가지다.

- qa-verifier 추가 커밋(`f0dd023`, 59개 파일)의 변경 경로
- 10절의 이름 비교 지점 전수 검색(시험 밖 코드)
- QA를 언급하는 모든 시험 줄의 전수 판정:
  ```bash
  rg -n '"qa-verifier"|"qa"|qa-verifier|\bqa:' -g '*.test.*' src packages plugin/bin tests scripts
  ```
  전체 목록을 고정한 줄은 위 표에 넣었다. 나머지는 QA 전용이라 바꾸지 않는다.
  - QA 전용 시험: `qa.test.mjs`, `qa-query.test.ts`, `qa-verifier.test.ts`, `watch.test.mjs:28`, `harness-session.test.mjs:112`–`:160`.
    `harness-role-files.test.mjs:98`은 QA 전용이 아니지만(doc-auditor도 돈다) 이번에는 바꾸지 않는다(위 표)
  - 플러그인 모듈 이름 목록: `harness-watch.test.mjs:456`
  - `harness-session.test.mjs`·`watch.test.mjs`에는 impl-verifier 형제 사례를 더한다. 고정값을 바꾸는 것이 아니라 새 사례이고,
    무엇을 더하는지는 위 표와 *Verification Plan*에 있다.
- `NODE_KINDS`·`REPORT_AGENTS`를 import하는 시험 검색:
  ```bash
  rg -n 'NODE_KINDS|REPORT_AGENTS' -g '*.test.*' src packages plugin tests
  ```
  `labels.test.ts:19`·`:26`은 이 검색으로만 잡힌다. 그 줄의 값이 `"auto → qa"`·`"QA"`라서 앞 검색의 `"qa"` 패턴에 걸리지 않는다.

`plugin/templates`는 private 저장소라 8절에서 따로 다룬다.

DB에 저장되는 노드 이름은 `PipelineVersion.nodes`(문자열 배열, `prisma/schema.prisma:312`)와 `PipelineRun.node`(문자열, `:328`)라
새 노드 이름을 넣어도 스키마 변경이 없다.

## Safety Analysis

- **기존 그래프와 비용**: opt-in이다. `defaultGraph`는 `OPT_IN_NODES`를 빼므로(`pipeline.mjs:48`) 새 프로젝트의 기본 그래프도,
  저장된 그래프 버전도 바뀌지 않는다. 소유자가 Pipeline 탭에서 넣기 전에는 디스패치가 하나도 늘지 않는다.
- **Free**: 그래프 저장 자체가 막히고(`allowsPipelineEdit`), 그다음 `nodeAllowed`가 플랜의 agents로 막는다. Free agents는 그대로다. Free로 내려간 프로젝트의 저장된 그래프는 11절.
- **API 계약**: `pipeline_next`의 대기 형태 추가, `report_submit`의 새 행위자 규칙 추가. 기존 형태와 QA 문구는 바뀌지 않는다.
- **DB**: 스키마 변경 없음. `Report`·`AgentRun`·`AgentRunStep`의 기존 열만 쓴다.
- **기존 설정**: `impl-verifier`가 워크스페이스 예약 이름이 된다(10절의 `workspaces.mjs:14`). Phase 7에서 운영 DB를 먼저 확인한다.
- **권한**: impl-verifier 정의에는 게이트·전이·백로그 쓰기 도구가 없다. Claude에서는 Bash·Write가 경로 제한 없이 열리므로,
  쓰기 탐지는 *Verifier tree check*에 맡긴다. 강제는 별도 훅 제안서다.
- **런타임 부작용**: 메인 루프가 만드는 검증 사본은 저장소 밖이다. 사본 정리는 런북 절차에 있다.
- **동시성·재실행·권한**: 11절.
- **Codex**: impl-verifier 디스패치는 도우미가 `board_get`·역할 run 전에 거부한다(6절). 서버 상태는 바뀌지 않고, 그 항목은 Claude Code에서 이어 간다.
- 확인한 항목:
  - [x] 정적 import: 새 모듈 하나(`impl-verify-query.ts`)를 `run-query.ts`·`board-query.ts`가 쓴다
  - [x] 시험과 스크립트 참조: 노드·에이전트 목록을 고정한 시험(*Affected Files*의 검색 명령과 표)
  - [x] 타입 선언: `pipeline.d.mts`
  - [x] 노드·에이전트 이름 비교 지점 전수 열거(10절)

## Approval

승인 메모:

- 조건: Phase 1–3은 바로 시작한다. Phase 4는 *Execution Plan*의 템플릿 선행 조건(harness-templates #6·#7·#8과 정정 PR 머지, dual-client 묶음 커밋,
  서브에이전트의 추가 디렉터리 상속 확인)을 채운 뒤 시작한다. Phase 7은 그에 더해 dev의 미출시 작업을 다시 확인한 뒤 시작한다.
- 2026-10-07 리뷰 뒤 사용자가 "가치 검증 → Claude 전용"을 정했다. 가치 검증 스파이크(*Current State*)의 판정이 기대와 3/3 맞아, 범위를 Claude로
  줄였다(대안 분석 「범위」). Codex 실행은 별도 제안서다.
- 함께 받을 결정: 없다. 원안의 [Codex 변이 확인 환경]은 별도 제안서로 넘겼다(*Open Questions*).

## Execution Plan

선행 조건:

- **stagekeeper PR #121 머지 — 충족(2026-10-06, `450176a`).**
  - 이 PR이 product-copy §13 hint 표를 코드와 맞추고, 표와 `HINT`의 일치를 `run-rules.test.mjs:81`로 고정했다.
  - 그래서 Phase 2에서 `HINT`에 `impl-verify`를 더할 때 §13 행도 같은 Phase에서 넣어야 `npm run test:web`이 통과한다.
- **harness-templates 정정 PR 머지 — 충족(2026-10-08, harness-templates #9 `832f7d6`).** *Verifier tree check* 절을 런북에 넣는 PR이다.
  Phase 4가 그 절을 확장한다.
- **Claude 서브에이전트의 추가 디렉터리 상속 확인(Phase 4 전) — 충족(2026-10-08).** 결과와 그에 따른 런북 안내는 *Open Questions*의
  [Claude 서브에이전트의 추가 디렉터리 상속]에 있다. 사본 위치는 그대로 두고, 기본 권한 모드에서 `git -C`가 늘 확인을 묻는다는 것을 런북과
  `docs/architecture/impl-verifier.md`에 적었다.
  - 로컬 저장소 하나에서 시험용 서브에이전트로 확인한다. `permissions.additionalDirectories`에 등록한 저장소 밖 디렉터리를 서브에이전트가
    확인 요청 없이 읽는지, 그 안에서 검증 명령이 메인 대화와 같은 규칙(권한 모드·허용 규칙·샌드박스 자동 허용)으로 도는지 본다(8절).
    사본의 Git 조회(`git -C <사본> rev-parse HEAD` 같은 읽기 전용 명령)가 확인 없이 도는지도 본다(1절).
  - 결과에 따라 런북 절(8절)의 사본 위치 안내가 정해지므로 Phase 4보다 먼저 한다(*Open Questions*).
- **dual-client 템플릿 묶음 커밋(Phase 4 전) — 충족(2026-10-08, harness-templates #10 `2314539`, main `528b823`).**
  harness-templates main에 Codex를 받치는 묶음 전체가 들어가 있어야 Phase 4가 그 위에서 시작한다(8절).
  - 커밋 방법: 작업본의 추적 파일을 3-way 병합으로 옮겼다(기준 `95ace9d`, 우리 쪽 #9 위 브랜치, 상대 쪽 작업본). #8과 겹친 QA 내용은 #8의 머지된 문장을 따랐고,
    `qa-verifier-codex-runbook.patch`는 지우고 `QA-VERIFIER-ROLLOUT.md`에 그 이유를 적었다. 결과는 "작업본 + #7 + #9"와 같다.
    #7·#9가 건드리지 않은 파일(`CODEX.runbook.md`, pm·doc-auditor·feature-scout)은 LF 정규화 뒤 작업본과 바이트가 같다.
  - 커밋 전에 기록한 작업본 해시(LF 정규화 sha256, 본 checkout `plugin/templates`, HEAD `95ace9d`, 2026-10-07T23:59:35Z). Phase 7의 행별 출처 확인에 쓴다.
    ```text
    851dde2b97e0e482ac47b5a15b95a0ad8b4e2bfa9f697aa76d2a5f37902c4d4a en/CLAUDE.runbook.md
    ef5cb547c8c2030119bb91336b04ddb139293440f6ed38b35ce8bf923ca10b22 en/CODEX.runbook.md
    ca0f39b3e489ab236ed4eb1113601ff1798812bdfa0c5ac69a6e5de7e1535ec5 en/agents/dev.md
    4cc599dca790560b7e2252068c485e59e6a137df0b2647cf4a3939f27eb03ddb en/agents/doc-auditor.md
    c4059e06aea80ccdae95995b63519d485fcc98b5ae104c29bdb59cd30c03db4b en/agents/feature-scout.md
    300c498e7e88406fda42b74a39a2878f865e370b46d4dcef37914f916d0eb771 en/agents/plan-verifier.md
    b0727c3177b5a1e9f91f5d68de81ef39af04f3763c88002cd26dcbd288606280 en/agents/pm.md
    b310fae4a26121a9b2837537938c5770669750428aa253cd67ff7cf516f15b48 en/agents/qa-verifier.md
    240bde3cd21be10d8428d492a33f061a4da8c3e742c16143ea630f3e0ec8eadb en/docs/agents/README.md
    ea530b7c24e79d31a4c2880d54686b4851cf30bc4b948605b2cd9f2966db4e3d en/docs/plans/README.md
    bead97a06d48ddeb287ad5bb664c7ce99beb7152020ac07dd303dad7072d7187 en/docs/plans/template.md
    d31f317447a558a932dc94097f956d238a0071651024b128e2c139dd6dc97ad4 en/docs/plans/verification-paths.md
    ```
    정정 PR의 작업본은 그대로 #9로 커밋했으므로(적용한 diff가 작업본의 `git diff`와 바이트가 같다) 그 판은 커밋 `832f7d6`으로 대조한다.

  아래는 커밋 전(2026-10-07)에 적은 사정이다.
  - 묶음은 둘이다. `en/CODEX.runbook.md`와, 모든 역할 스텁의 runtime 표시를 포함한 그 밖의 "dual-client edits"(harness-templates #8의 `QA-VERIFIER-ROLLOUT.md:5`)다.
    2026-10-07에도 본 checkout의 작업본에만 있다: `en/CLAUDE.runbook.md`, 역할 스텁 다섯, `en/docs/agents/README.md`, `templates.test.mjs`의 수정과
    추적되지 않은 `en/CODEX.runbook.md`(`git -C plugin/templates status --short`. 같이 나오는 추적되지 않은 `en/agents/qa-verifier.md`는 #8 `efd7d42`의 파일과 같다).
  - 묶음을 커밋하기 전에 작업본 템플릿 파일마다 LF 정규화 sha256을 기록해 둔다(DB 불필요). 커밋 과정에서 #7·#8 위로 옮기며 내용이 바뀌므로,
    2026-10-06 출시가 작업본에서 시드했다면 Phase 7의 행별 출처 확인은 이 기록으로만 대조할 수 있다.
  - QA의 Codex 삽입은 작업본 Codex 런북에 이미 들어 있다(`en/CODEX.runbook.md:3`–`:17`의 "Optional browser QA"). 그래서 `qa-verifier-codex-runbook.patch`를
    따로 적용하지 않는다. 패치가 기대하는 앞뒤 줄과도 맞지 않는다.
  - Phase 4 전이어야 하는 이유: 이 묶음도 `en/CLAUDE.runbook.md`와 `en/docs/agents/README.md`를 바꾼다. Phase 4 브랜치를 묶음 없이 따면 같은 파일이
    두 갈래로 바뀐다.
  - Codex 런북만 커밋하면 시드가 거부된다. Codex 런북이 든 번들은 모든 역할 스텁에 runtime 표시가 정확히 하나씩 있어야 하는데
    (`packages/core/client-runtime.mjs:34`–`:37`), 커밋된 어느 ref에도 dev·pm·plan-verifier·doc-auditor·feature-scout 스텁의 표시가 없다
    (origin/main·#6·#7·#8 모두 0개, qa-verifier만 1개). 표시는 본 checkout의 커밋되지 않은 작업본에만 있다.
  - 실측(2026-10-06, DB 없이): #8 `efd7d42`의 `en`에 작업본의 Codex 런북만 더한 디렉터리는 `readTemplateSources`에서
    `Codex bundle protocol mismatch: agents/dev.md`로 거부됐다. 아래 Phase 7의 사전 검증 명령과 같은 방법이다.
- **dev의 미출시 작업이 먼저 출시돼 있어야 한다(Phase 7 전) — 코드는 충족, 템플릿은 미충족.**
  - 코드: 2026-10-06에 main이 `03876dd`에서 `450176a`로 fast-forward 승격됐다(107커밋). QA·인수 실패·사용량 작업, 마이그레이션 6개
    (`20261002000000_token_usage_tracking`부터 `20261005000000_qa_verifier`까지), 플러그인 0.5.8이 함께 나갔다. 2026-10-07에는 #124·#125·#126이
    `7bd40e1`로(플러그인 0.5.9), 이어 #127~#132가 `c8799f6`으로 승격됐다(플러그인 0.5.11). 세 커밋 모두 Production 배포가 있다(`gh api repos/Sangeok/stagekeeper/deployments`).
    운영 DB의 마이그레이션 적용은 그 출시의 기록에 따른 것이고, 이 문서는 DB를 조회하지 않았다.
  - 2026-10-07에 dev(`8a12137`)가 main보다 앞선 것은 문서 변경 둘뿐이다. #133(형제 제안서를 `completed/`로 옮김)과 #134(이 제안서)다.
    앱 소스를 바꾸지 않으므로 이 작업의 승격에 함께 실려도 운영 동작은 바뀌지 않는다. Phase 7 전에 다시 `git log origin/main..origin/dev`로 확인한다.
  - 템플릿: 그 작업들의 템플릿(harness-templates PR #6·#7·#8과 정정 PR)은 2026-10-07에도 머지 전이었고, 2026-10-08에 머지됐다(위). 그래도 2026-10-06 출시 때
    운영 DB에 시드됐는지, 됐다면 어느 원본(열린 브랜치나 작업본)에서였는지 이 문서는 모른다.
  - 서버가 이미 나갔으므로 #7(`acceptance_fail` 지시)을 서버보다 먼저 시드할 수 없다는 제약은 사라졌다. 운영 `HINT.accept`가 그 지시에 기대므로
    (`src/server/pipeline/run-rules.ts:40`) 이 작업과 상관없이 먼저 시드하는 편이 낫다. 다만 #7만 시드하면 안 된다. `en/CLAUDE.runbook.md`는 #7에만
    `acceptance_fail`이, #8과 작업본에만 QA 절이 있어서, 운영 행이 #8이나 작업본에서 왔다면 #7만 올릴 때 운영 QA 노드가 기대는 QA 절이 사라진다.
    #7·#8을 함께 머지한 뒤, Phase 7과 같은 행별 출처 확인을 거쳐 시드한다.
- **harness-templates PR #6·#7·#8과 정정 PR이 main에 머지돼 있어야 한다(Phase 4 전) — 충족(2026-10-08).** 소유자가 #8·#6·#7 순서로 머지했고(main `809c64c`),
  이어 #10·#9가 머지됐다(main `528b823`). 머지된 main은 stagekeeper dev(`cc7fe08`) 위에서 `npm run test:templates` 36/36이었다. 운영 DB 시드는 하지 않았다.
  - 템플릿은 경로마다 행이 하나다. #7(`acceptance-failure-path`)은 #8(`qa-verifier`)의 조상이 아닌데, 둘 다 `en/CLAUDE.runbook.md`와
    `en/docs/agents/README.md`를 바꾼다. 그래서 #8에서 갈라진 브랜치로 런북을 시드하면 #7의 `acceptance_fail` 지시가 사라진다.
  - 운영(`c8799f6`)과 dev의 `HINT.accept`는 그 지시에 기댄다(`src/server/pipeline/run-rules.ts:40`).
  - Phase 4의 템플릿 브랜치는 이 머지와 dual-client 묶음 커밋 뒤의 harness-templates main에서 딴다.

Phase는 구현 순서다. 각 Phase가 끝나면 전체 시험이 녹색이어야 한다.
**Phase 1–5는 stagekeeper 기능 브랜치 하나(`harness/impl-verifier`)에 쌓고, dev에는 PR 하나로 넣는다.** 운영 서버는 Vercel Git 연동으로
배포되므로, dev에 들어간 뒤 첫 main 승격이 곧 운영 배포다(*Risks and Rollback*). Phase 1만 든 서버는 이런 상태가 된다.
- 소유자가 노드를 넣을 수 있다(`NODE_KINDS`).
- 완료 판정은 없다(Phase 2).
- Codex 번들은 아직 시드되지 않은 템플릿을 요구한다.

그래서 Phase를 하나씩 dev에 넣지 않는다. Phase 4의 템플릿 변경은 harness-templates에 따로 PR로 낸다.

1. **Phase 1 — 이름 등록과 그것을 고정한 시험(한 번에)**:
   - 코드: `pipeline.mjs`(2절 전부)·`pipeline.d.mts`·`entitlement.mjs`(3절, `:8` 주석 포함), `plugin/lib` 미러, Codex 역할 표(`codex-agent.mjs`의 `ROLE_TOOLS`·`ROLE_FILE_TOOLS`·쓰기 역할 집합), `labels.ts`의 `LABEL`.
   - 시험 고정값: `pipeline.test.mjs:5`·`:44`, `entitlement.test.mjs:40`, `packages/core/client-runtime.test.mjs:11`, `labels.test.ts:19`·`:26`,
     `briefing.test.mjs:135`·`:213`, `project-board-page.test.mjs:57`, `plugin/bin/harness-init.test.mjs:27`,
     `src/server/templates-query.test.ts:14`·`:53`·`:149`·`:154`, `src/server/client-bundle-query.test.ts:8`, `src/server/harness-init.test.ts:21`,
     `tests/server/integration/client-runtime.test.ts:16`. 그리고 새 코어 시험.
   - 이유: `NODE_KINDS`·`REPORT_AGENTS`가 바뀌는 순간 위 시험이 깨진다. Codex 번들 검사는 플랜의 모든 역할 템플릿을 요구하고
     (`client-runtime.mjs:32`), `harness-init-dual.test.mjs`는 `ROLE_TOOLS`에서 역할 템플릿을 만든다. 그래서 역할 표 등록도 같은 Phase여야 한다.
   - 검증: `npm run check`, `npm test`, `npm run test:web`, `npm run test:server:integration`(위 목록의 통합 시험 픽스처 때문)
2. **Phase 2 — 서버**: `impl-verify-query.ts`, `run-query.ts`, `run-rules.ts`(HINT 포함)와 `run-rules.test.mjs:73`, product-copy §13 hint 행, `board-query.ts`, `board-rules.ts:112`의 주석, 통합 시험.
   - 검증: `npm run check`(`tsc`는 여기서만 돈다), `npm run test:web`, `npm run test:server:integration`(격리 DB `stagekeeper_test_*`만 허용, `scripts/test-server-integration.mjs:14`)
3. **Phase 3 — 감시기와 Codex 거부**: `watch.mjs`(+ `watch.test.mjs`의 새 사례), `harness-codex.mjs`의 디스패치 거부(`CodexRoleUnsupported`)와
   QA 허용 목록(`qaWorkflowFile`)(+ `harness-session.test.mjs`), `plugin/README.md`, 두 스킬 문서의 대기·거부 문장(6절).
   플러그인 판은 여기서 올리지 않는다(6절).
   - 검증: `npm run check`(`plugin/lib` 미러 일치), `npm test`(plugin/bin 포함), *Verification Plan*의 `main()` 연결 확인
4. **Phase 4 — private 템플릿**: 새 에이전트 정의, Claude 런북 변경(새 절, *Verifier tree check*, 인수 1번, `wait` 목록 두 곳), README 행,
   계획 템플릿의 Tests 절, QA 템플릿·런북 QA 절의 한 문장, 템플릿 시험(8절 표의 `templates.test.mjs` 행 전부). Codex 런북은 바꾸지 않는다(6절).
   - 검증: `npm run test:templates`. 이 시험은 `../../packages/core`와 `@harness/core/*` 경로 별칭을 쓰므로 stagekeeper 체크아웃 안의
     `plugin/templates` 자리에서 돈다.
   - 본 checkout의 `plugin/templates`에서 브랜치를 바꾸지 않는다. 그곳에는 다른 작업의 커밋되지 않은 변경이 있을 수 있다(2026-10-06에는
     dual-client 묶음의 유일한 사본).
   - 대신 stagekeeper의 버리는 worktree를 만든다(`node_modules`·`src/generated`는 junction). 그 안의 `plugin/templates` 자리에
     harness-templates 작업 브랜치의 worktree를 두고 거기서 돌린다.
   - 버리는 worktree는 Phase 1–3이 든 기능 브랜치(`harness/impl-verifier`) head에서 만든다. Codex 렌더 시험이 그 checkout의
     `plugin/runtime/codex-agent.mjs`를 import하므로, `ROLE_TOOLS`에 impl-verifier가 없으면 `Role MCP allowlist differs`로 실패한다(`codex-agent.mjs:39`·`:43`).
5. **Phase 5 — 웹과 문서**: 게이트 문구(`gate-copy.ts`·`gate-text.ts`), 편집기 삽입 위치, 배너, 브리핑, `report_submit` 설명,
   아키텍처 문서(새 `impl-verifier.md`와 `README.md` 색인, protocol의 단락·대기 종류·호출자 칸, invariants), product-copy(§13 hint 행 제외).
   시험: `rail-state.test.ts`·`gate-copy.test.ts`의 새 사례, `tools.test.mjs:90` 목록의 `"report_submit"`(*Verification Plan*).
   - 검증: `npm run test:web`, `npm run check`, `npm run build`(CI)
6. **Phase 6 — 별도 제안서로 옮겼다.** Codex 검증 환경과 브리핑(대안 분석 「범위」, 6절의 「이번에 하지 않는 것」). 다른 절이 Phase 7을
   가리키므로 번호는 비워 둔다.
7. **Phase 7 — 롤아웃과 실제 모델 리허설**:
   - 사전 확인: 운영 DB의 워크스페이스 이름(`Workspace.agent`)에 `impl-verifier`가 없는지 읽기 전용 질의로 본다(10절의 `workspaces.mjs:14`).
     있으면 그 소유자와 이름을 먼저 정리한다.
   - 순서는 다음과 같다. 아래 항목들이 각 단계를 설명한다.
     1. 첫 시드
     2. 기능 PR을 dev에 넣는다.
     3. 그 dev push에서 `check`와 `windows-role-runtime`이 모두 녹색인지 본다.
     4. 그 dev head에서 운영 DB의 `prisma migrate status`를 본다.
     5. 둘째 시드
     6. main fast-forward 승격(운영 서버 배포)
     7. harness-smoke에서 소유자 순서대로 노드를 넣고 성공 기준 4를 실측한다.
     8. 실측이 기대대로면 다른 소유자에게 소유자 순서를 안내한다.

     CI가 실패하면 둘째 시드 전에 멈추므로, 런북만 바뀐 채 서버가 따라오지 않는 상태가 생기지 않는다.
   - 템플릿 시드는 두 번에 나눈다. 원본은 harness-templates의 머지 커밋을 detached로 둔 별도 worktree다(본 checkout의 `plugin/templates` 작업본이 아니다).
     시드 스크립트가 `git -C <dir> rev-parse HEAD`로 원본 판을 기록하므로(`scripts/seed-templates.ts:22`), `--dir`은 Git 작업 트리 안에 있어야 한다.
     - 첫 시드: 새 `agents/impl-verifier.md` 행만 시드한다. 스크립트는 `--dir` 아래의 모든 `.md`를 읽으므로(`scripts/lib/template-seed-query.ts:29`–`:47`)
       `--dir`은 그 worktree 안의 점으로 시작하는 하위 디렉터리(예: `.seed-impl-verifier`)로 하고, 그 안에 `en/agents/impl-verifier.md` 하나만 둔다.
       스크립트는 점으로 시작하는 이름을 건너뛰므로(`:33`, `:40`) 이 디렉터리가 남아도 둘째 시드를 깨지 않는다. 점 없는 이름이면 둘째 시드가 그것을
       언어 디렉터리로 읽어 `Invalid or duplicate template`으로 거부한다. Codex 런북이 없으므로 `--snapshot`은 필요 없다(`scripts/seed-templates.ts:16`).
     - 둘째 시드: `--dir`은 worktree 루트다(점 없는 하위 디렉터리는 `en` 하나다). 런북·README·계획 템플릿·QA 템플릿을 CI 녹색과 `migrate status` 확인 뒤, 승격 바로 전에 시드한다. 이번 롤아웃은 Codex 런북을 바꾸지 않는다.
       그래도 운영 Codex 런북 행이 원본과 다르면(아래 행별 출처 확인) 이 시드가 그 행을 바꿔 모든 Codex 프로젝트가 `$harness-init`까지
       멈추므로(*Risks and Rollback*), 그때는 사용자 안내를 함께 낸다. Codex 런북이 들어가면 시드 검사가 그 언어의 번들 전체를 요구하므로 번들 전체를 싣는다
       (`scripts/lib/template-seed-query.ts:25`, Codex 런북이 있으면 `--snapshot` 필수 `scripts/seed-templates.ts:16`). 이때 `--snapshot`으로 복원용 스냅숏을 남긴다.
       스냅숏 경로는 공개 저장소 밖이어야 한다(`scripts/seed-templates.ts:18`–`:20`).
     - 이유: `restoreTemplates`는 새로 생긴 행이 든 스냅숏을 복원하지 않는다(Codex 런북 행만 예외, `scripts/lib/template-seed-query.ts:71`).
       새 에이전트 행을 첫 시드에서 먼저 만들어 두면, 둘째 시드의 스냅숏에서는 그 행도 이전 본문이 있어 전체를 복원할 수 있다.
     - 시드마다 먼저 DB 없이 원본을 검증한다(stagekeeper 루트에서). 시드와 같은 검사(`readTemplateSources` → `validateTemplateSources`)만 하고
       DB에는 닿지 않는다. 거부되면 오류 문구와 함께 0이 아닌 코드로 끝난다(2026-10-06 실측).
       ```bash
       node --import tsx -e "import('./scripts/lib/template-seed-query.ts').then(m => console.log('valid rows:', (m.readTemplateSources ?? m.default.readTemplateSources)(process.argv[1]).length))" <dir>
       ```
     - 둘째 시드 전에 운영 `Template` 행마다 지금 본문의 출처를 정한다(읽기 전용). 2026-10-06 출시가 무엇을 시드했는지 기록이 없기 때문이다.
       행의 LF 정규화 sha256을 harness-templates main(선행 조건의 머지 뒤)과 대조하고, 맞지 않으면 PR head 커밋(#6 `95ace9d`, #7 `55f2d7d`, #8 `efd7d42`)과
       선행 조건에서 남긴 작업본 해시 기록과 대조한다. harness-templates는 머지 때 브랜치를 지우므로(`delete_branch_on_merge`) 브랜치 이름이 아니라 커밋으로 대조한다.
       어느 원본과도 맞지 않는 행은 이번 시드가 덮어 버리므로, 시드 전에 소유자와 확인한다.
   - 승격 전에, 승격할 dev head의 checkout에서 운영 DB에 `prisma migrate status`를 돌려 미적용 마이그레이션이 없는지 본다(읽기 전용).
     `npm run build`는 `prisma generate`와 Next 빌드만 하고 마이그레이션을 돌리지 않는다(`scripts/build.mjs:7`–`:10`). Vercel의 빌드 설정은 보지 않았다.
     이 작업에는 마이그레이션이 없지만, 그 사이 dev에 들어온 것이 있으면 같은 승격에 실린다. 미적용이 있으면 그 마이그레이션의 배포 절차(리허설 → `migrate deploy`)를
     승격 전에 마치거나 승격을 멈춘다.
   - 기능 PR(마지막 커밋이 두 매니페스트의 판 상승, 6절)을 dev에 넣고, 그 dev push에서 `check`와 `windows-role-runtime`이 모두 녹색인 것을 본다.
     둘째 시드 뒤 main에 fast-forward 승격한다(운영 서버 배포). main은 dev에서 통과한 커밋만 받는다(`AGENTS.md`).
   - 소유자 순서는 플러그인 갱신 → `/harness:init` → Claude는 검증 사본 디렉터리 등록(8절 런북 1단계) → Pipeline 탭에서 노드 추가다. harness-smoke에서 먼저 이 순서를
     따르고, 실측 뒤 다른 소유자에게 안내한다. *Risks and Rollback*의 배포 순서를 따른다.
   - 성공 기준 4를 harness-smoke 저장소에서 실측한다. 노드는 opt-in이라 이 실측 전에는 다른 소유자에게 노드 추가를 안내하지 않는다.
     같은 실측에서 항목마다 사본 준비(clone과 의존성)의 시간·디스크, impl-verifier의 토큰과 시간, `wait on impl-verify`의 빈도를 함께 적는다
     (*Risks and Rollback*의 「비용」).
     (a)~(d) 중 하나라도 기대와 다르면, 원인을 고친 판이 나갈 때까지 안내를 미루고 실측 보고서에 결과를 남긴다.
     원인이 서버나 템플릿 쪽이고 이미 노드를 쓰는 그래프가 있으면 *Risks and Rollback*의 롤백 방법을 따른다.

## Verification Plan

실행할 검증:

```bash
npm run check
npm test
npm run test:web
npm run test:server:integration
npm run build
# 버리는 stagekeeper worktree 안, plugin/templates 자리에 둔 템플릿 작업 브랜치 worktree에서(Phase 4 참고)
npm run test:templates
```

CI에서 도는 것(기능 PR과 그 뒤의 dev push):
- `check`(`.github/workflows/check.yml`)는 `npm run check`·`npm test`·`npm run test:web`·`npm run build`만 돌린다.
  `npm run test:templates`는 템플릿이 이 저장소에 없어 로컬에만 있고(`check.yml`의 주석), `npm run test:server:integration`도 CI에 없다.
  그래서 성공 기준 2(통합 시험)와 3(템플릿 시험)은 CI 녹색으로 증명되지 않는다. 두 명령의 결과와 그때의 커밋을 *Verification Results*에 적은 뒤 PR을 머지한다.
- `windows-role-runtime`(`.github/workflows/windows-role-runtime.yml`)도 이 PR에서 돈다. 경로 필터에 이 작업이 바꾸는 두 매니페스트가 들어 있다
  (Claude 전용으로 줄이며 같은 필터의 `codex-thread.mjs`·`harness-role-files.test.mjs`는 바꾸지 않게 됐다). 이 job은 역할 시험 셋을 실제 Windows 역할 런타임(`STAGEKEEPER_TEST_WINDOWS_RUNTIME`)으로 돌린다.
  역할 런타임은 `pm`만 따로 거부하므로(`role-commands.mjs:214`, `role-git.mjs:200`, `role-files.mjs:20`) impl-verifier 전용 Windows 사례는 따로 두지 않는다.

추가 시험 — 코어(`packages/core/pipeline.test.mjs`, 기존 `facts` 도우미를 쓴다. `:3`의 import에 `isItemNode`를 더한다). 형제는 `packages/core/qa.test.mjs:9`–`:23`이다.
모든 기대값은 계산이 필요 없는 불리언·노드 이름·전이 쌍·사유 문구다. 사유 문구는 product-copy §12와 레일 버튼이 그대로 보이는 값이라 글자로 고정한다.

```js
describe("impl-verify node", () => {
  const graph = { nodes: ["plan", "implement", "impl-verify", "qa", "accept"], gates: [] };
  it("is opt-in, item-bound, sits between implement and qa, and stays off Free", () => {
    assert.ok(!defaultGraph("pro").nodes.includes("impl-verify"));
    assert.deepEqual(validateGraph(graph, "pro"), { ok: true });
    assert.deepEqual(validateGraph({ ...graph, nodes: ["plan", "implement", "qa", "impl-verify", "accept"] }, "pro"), { ok: false, reason: "impl-verify must come before qa" });
    for (const nodes of [["plan", "impl-verify", "implement", "accept"], ["plan", "implement", "accept", "impl-verify"]]) {
      assert.deepEqual(validateGraph({ nodes, gates: [] }, "pro"), { ok: false, reason: "impl-verify must be between implement and accept" });
    }
    assert.equal(validateGraph({ nodes: ["plan", "implement", "impl-verify", "accept"], gates: [] }, "free").ok, false);
    assert.equal(dispatcherFor("impl-verify", "dev"), "impl-verifier");
    assert.equal(isItemNode("impl-verify"), true);
  });
  it("a done item stands at impl-verify and only its own evidence completes it", () => {
    assert.equal(cursorForStatus(graph, "done"), "impl-verify");
    assert.equal(nodeDone("impl-verify", facts({ status: "done" })), false);
    assert.equal(nodeDone("impl-verify", facts({ status: "done", qaComplete: true })), false);
    assert.equal(nodeDone("impl-verify", facts({ status: "done", implVerifyComplete: true })), true);
  });
  it("entering impl-verify or its gate from implementing records implementation done once, and leaving records nothing", () => {
    const entering = facts({ status: "implementing", format: "slots-v1", implementationComplete: true });
    const r = advance(graph, "implement", entering);
    assert.equal(r.cursor, "impl-verify");
    assert.deepEqual(r.transitions, [{ from: "implementing", to: "done" }]);
    const gated = advance({ ...graph, gates: ["before-impl-verify"] }, "implement", entering);
    assert.equal(gated.cursor, "before-impl-verify");
    assert.deepEqual(gated.transitions, [{ from: "implementing", to: "done" }]);
    assert.deepEqual(advance(graph, "impl-verify", facts({ status: "done", format: "slots-v1", implVerifyComplete: true })).transitions, []);
  });
});
```

추가 시험 — 감시기(`packages/core/watch.test.mjs`, 형제 "failed QA waits only that item…" `:27`–`:35`). 감시기는 형식이 틀린 대기 하나로 overview 전체를 거부하므로,
새 대기 형식은 이 시험으로 고정한다.

```js
it("failed implementation verification waits only that item and preserves ready work with a valid current resume binding", () => {
  const resume = { agent: "impl-verifier", key: "FAILED-IV", format: "slots-v1", entry: { runId: "pipeline", entryId: "entry", slotId: "impl-verify" } };
  const failure = { key: "FAILED-IV", node: "impl-verify", version: 2, action: "wait", on: "impl-verify", note: "impl-verifier found defects", path: "docs/agents/impl-verifier/FAILED-IV.md", commit: "a".repeat(40), resume };
  assert.equal(hasWork(actionableWork(overview([failure]), policy)), false);
  assert.deepEqual(actionableWork(overview([failure, dispatch()]), policy), actionableWork(overview([dispatch()]), policy));
  for (const patch of [{ node: "qa" }, { note: "" }, { path: null }, { commit: "uncommitted" }, { resume: { ...resume, agent: "qa-verifier" } }, { resume: { ...resume, key: "OTHER" } }, { resume: { ...resume, format: null } }, { resume: { ...resume, entry: { ...resume.entry, slotId: "qa" } } }, { resume: { ...resume, entry: undefined } }]) {
    assert.throws(() => actionableWork(overview([{ ...failure, ...patch }]), policy), /Invalid pipeline overview/);
  }
});
```

추가 시험 — 서버 통합(`tests/server/integration/impl-verifier.test.ts`, 형제 `qa-verifier.test.ts`의 픽스처와 단언 모양을 따른다). 형제보다 넷을 더 본다.
- 실패 대기의 재개 묶음이 배포된 감시기를 통과하는지(`actionableWork`)
- 노드에 처음 들어왔을 때 impl-verifier가 디스패치되는지
- 닫힌 run의 보고를 다시 내면 거부되는지(11절의 중복 제출)
- 다시 열고 다시 구현해 들어왔을 때 옛 entry의 run이 통과든 실패든 완료 근거가 되지 않는지(`implVerifyEntryResult`의 entry 결합)

```ts
import assert from "node:assert/strict";
import { it } from "node:test";
import { actionableWork } from "@harness/core/watch.mjs";
import { createBoardService } from "../../../src/server/pipeline/board";
import { nextFor } from "../../../src/server/pipeline/run-query";
import { cleanup, connections, fixture } from "./support";

for (const verdict of ["pass", "fail", "blocked"] as const) it(`impl-verifier ${verdict} binds its run, controls acceptance and never outlives its entry in PostgreSQL`, async () => {
  const { all: [db], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(db, { status: "implementing", plan: "max" }); userId = f.userId;
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, nodes: ["plan", "implement", "impl-verify", "accept"], gates: [], format: "slots-v1", createdBy: "test" } });
    const pipeline = await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "implement", entryId: "implementation-entry" } });
    const board = createBoardService(db);
    const acceptance = { key: f.key, actor: "main-loop", path: `docs/agents/main-loop/${f.key}.md`, commit: "b".repeat(40) };
    const stepId = verdict === "pass" ? "report" : verdict === "fail" ? "failed-report" : "blocked-report";
    // dev가 그 entry에서 구현을 끝내고 보고한 상태로 커서를 옮긴다. 다시 열린 뒤에도 같은 길로 다시 들어온다.
    const implement = async (entryId: string | null) => {
      const dev = await db.agentRun.create({ data: { projectId: f.projectId, agent: "dev", key: f.key, tokenId: "test", stepId: "report", closedAt: new Date(), pipelineRunId: pipeline.id, pipelineEntryId: entryId, steps: { create: [{ stepId: "verify", outcome: "ok", accepted: true }, { stepId: "report", outcome: "ok", accepted: true }] } } });
      await db.report.create({ data: { boardItemId: f.boardItemId, actor: "dev", agentRunId: dev.id, path: `docs/agents/dev/${f.key}.md`, commit: "a".repeat(40) } });
      await board.advancePipeline(f.projectId, f.key);
      return db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } });
    };
    // 그 entry에 결합된 impl-verifier run을 verdict로 끝내고 보고한 뒤 다음 일을 묻는다.
    const verify = async (entryId: string | null) => {
      const run = await db.agentRun.create({ data: { projectId: f.projectId, agent: "impl-verifier", key: f.key, tokenId: "test", stepId, pipelineRunId: pipeline.id, pipelineEntryId: entryId, steps: { create: { stepId: "verify", outcome: verdict === "pass" ? "ok" : verdict === "fail" ? "failed" : "blocked", accepted: true } } } });
      const submission = { key: f.key, actor: "impl-verifier", path: `docs/agents/impl-verifier/${f.key}.md`, commit: "c".repeat(40), runId: run.id };
      assert.equal((await board.submitReport(f.projectId, { ...submission, runId: undefined }, "test")).ok, false);
      assert.equal((await board.submitReport(f.projectId, { ...submission, path: `docs/agents/qa-verifier/${f.key}.md` }, "test")).ok, false);
      assert.equal((await board.submitReport(f.projectId, { ...submission, commit: "HEAD" }, "test")).ok, false);
      assert.ok((await board.submitReport(f.projectId, submission, "test")).ok);
      await db.agentRun.update({ where: { id: run.id }, data: { closedAt: new Date(), steps: { create: { stepId, outcome: "ok", accepted: true } } } });
      await board.advancePipeline(f.projectId, f.key);
      return { submission, next: await nextFor(db, f.projectId, f.key) };
    };

    const entered = await implement(pipeline.entryId);
    assert.equal(entered.node, "impl-verify"); assert.notEqual(entered.entryId, pipeline.entryId);
    assert.equal((await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).status, "done");
    const first = await nextFor(db, f.projectId, f.key);
    assert.ok(first.action === "dispatch" && first.agent === "impl-verifier", JSON.stringify(first));
    assert.equal((await board.submitReport(f.projectId, acceptance, "test")).ok, false);
    const { submission, next } = await verify(entered.entryId);
    // 닫힌 run의 보고를 다시 내면 거부된다(11절). 대기면 결합 run이 닫혀서, 통과면 커서가 accept로 넘어가서다.
    assert.equal((await board.submitReport(f.projectId, submission, "test")).ok, false);
    if (verdict === "pass") {
      assert.equal(next.action, "accept");
    } else {
      if (next.action !== "wait" || next.on !== "impl-verify") throw new Error(`expected wait on impl-verify: ${JSON.stringify(next)}`);
      assert.equal(next.resume.agent, "impl-verifier"); assert.equal(next.resume.entry?.entryId, entered.entryId); assert.equal(next.commit, "c".repeat(40));
      // 서버가 내는 대기는 배포된 감시기가 받는 모양이어야 한다. 하나라도 틀리면 감시가 overview 전체를 거부한다.
      assert.doesNotThrow(() => actionableWork({ head: { action: "none", reason: "No candidates." }, items: [next] }, { commit: false, propose: false }));
      assert.equal((await board.submitReport(f.projectId, acceptance, "test")).ok, false);
    }
    // 다시 열고 다시 구현해 들어오면, 옛 entry의 run은 통과든 실패든 완료 근거가 되지 않고 새 검증이 디스패치된다.
    const before = await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } });
    assert.ok((await board.transition(f.projectId, { key: f.key, to: "implementing", result: "Fix verification finding" }, { actor: "human", actorRef: f.userId, channel: "web", expectedUpdatedAt: before.updatedAt })).ok);
    const reset = await db.pipelineRun.findUniqueOrThrow({ where: { id: pipeline.id } }); assert.equal(reset.node, "implement"); assert.notEqual(reset.entryId, entered.entryId);
    assert.equal((await board.submitReport(f.projectId, submission, "test")).ok, false);
    const reentered = await implement(reset.entryId);
    assert.equal(reentered.node, "impl-verify"); assert.notEqual(reentered.entryId, entered.entryId);
    const fresh = await nextFor(db, f.projectId, f.key);
    assert.ok(fresh.action === "dispatch" && fresh.agent === "impl-verifier", JSON.stringify(fresh));
    if (verdict === "pass") {
      assert.equal((await verify(reentered.entryId)).next.action, "accept");
      assert.ok((await board.submitReport(f.projectId, acceptance, "test")).ok);
      assert.ok((await db.boardItem.findUniqueOrThrow({ where: { id: f.boardItemId } })).acceptedAt);
    }
  } finally { await cleanup(db, userId); await disconnect(); }
});

it("acceptance at impl-verify names the implementation check even when qa follows", async () => {
  const { all: [db], disconnect } = connections(1);
  let userId: string | undefined;
  try {
    const f = await fixture(db, { status: "done", plan: "max" }); userId = f.userId;
    const version = await db.pipelineVersion.create({ data: { projectId: f.projectId, version: 1, nodes: ["plan", "implement", "impl-verify", "qa", "accept"], gates: [], format: "slots-v1", createdBy: "test" } });
    await db.pipelineRun.create({ data: { boardItemId: f.boardItemId, versionId: version.id, node: "impl-verify", entryId: "verification-entry" } });
    const result = await createBoardService(db).submitReport(f.projectId, { key: f.key, actor: "main-loop", path: `docs/agents/main-loop/${f.key}.md`, commit: "b".repeat(40) }, "test");
    assert.ok(!result.ok && /^Implementation verification has not completed/.test(result.reason));
  } finally { await cleanup(db, userId); await disconnect(); }
});
```

추가 시험 — Codex 도우미(`plugin/bin/harness-session.test.mjs`, 기존 `import { dispatchBinding, codexFailure } from "./harness-codex.mjs"`에
`qaWorkflowFile`을 더한다). QA 허용 목록과 impl-verifier 거부를 본다. 거부 사례의 형제는 같은 파일의 `:77`–`:90`(디스패치 결합)과
`:220`(`RoleExecutionUnavailable`)이다. 기대값은 계산이 필요 없는 불리언·문구·객체다.

```js
it("QA accepts this item's impl-verifier report as a workflow file after its target, and nothing else new", () => {
  assert.equal(qaWorkflowFile("docs/agents/impl-verifier/A.md", "A"), true);
  assert.equal(qaWorkflowFile("docs/agents/impl-verifier/B.md", "A"), false);
  assert.equal(qaWorkflowFile("docs/agents/qa-verifier/A.md", "A"), true);
  assert.equal(qaWorkflowFile("src/app.ts", "A"), false);
});

it("Codex refuses impl-verifier before any role run opens and says where to continue", () => {
  const entry = { runId: "pipeline", entryId: "entry", slotId: "impl-verify" };
  let refused;
  assert.throws(() => dispatchBinding({ action: "dispatch", agent: "impl-verifier", key: "A", format: "slots-v1", entry }, []), (error) => { refused = error; return true; });
  assert.deepEqual(codexFailure(refused, "s"), { event: "error", session: "s", code: "codex-role-unsupported", reason: refused.message });
  assert.match(refused.message, /not available on Codex yet.*Claude Code/);
});
```

`main()`은 시험에서 부를 수 없으므로, 뽑아낸 판정을 `main()`이 실제로 쓰는지는 정적으로 확인한다(Phase 3).
옛 인라인 판정(`harness-codex.mjs:122`–`:123`의 `workflowFile`)이 남으면 위 시험은 녹색이어도 impl-verifier 보고가 커밋된 뒤의 Codex QA를 거부한다.
거부는 `main()`이 이미 부르는 `dispatchBinding`(`:99`)과 `codexFailure`(`:128`) 안에 있으므로 따로 확인할 연결이 없다.

```bash
rg -n '\bworkflowFile\b' plugin/bin/harness-codex.mjs                      # 결과 없음(지금은 2줄)
rg -c 'qaWorkflowFile\(name, dispatch\.key\)' plugin/bin/harness-codex.mjs # 1(지금은 0)
```

추가 시험 — 웹. 편집기 삽입 위치(`src/fsd/features/edit-pipeline/model/rail-state.test.ts`, 형제 "adds an opt-in node back in skeleton order" `:81`–`:85`)와
게이트 툴팁(`src/fsd/entities/pipeline/model/gate-copy.test.ts`, 형제 `:16`–`:24`). 삽입 위치가 틀리면 두 노드 그래프에서 **+** 버튼이
"impl-verify must come before qa"로 막히고, 툴팁 문구가 빠지면 "Move past before-…"가 보인다. 기대값은 7절 표의 문자열 그대로다.

```ts
it("adds impl-verify right before qa, or before accept when qa is absent", () => {
  const withQa = addNode(pro(), "qa", "pro");
  assert.ok(withQa.ok);
  if (!withQa.ok) return;
  const both = addNode(withQa.graph, "impl-verify", "pro");
  assert.ok(both.ok);
  if (both.ok) assert.deepEqual(both.graph.nodes.slice(both.graph.nodes.indexOf("implement"), both.graph.nodes.indexOf("accept") + 1), ["implement", "impl-verify", "qa", "accept"]);
  const alone = addNode(pro(), "impl-verify", "pro");
  assert.ok(alone.ok);
  if (alone.ok) assert.equal(alone.graph.nodes[alone.graph.nodes.indexOf("accept") - 1], "impl-verify");
});
```

```ts
it("names the implementation check and QA gates by their Inbox buttons", () => {
  assert.equal(gateTooltip("before-impl-verify"), "The item waits here until you press Continue to implementation check in the Inbox. impl-verifier re-reads the change in a fresh context and checks that the tests catch it.");
  assert.equal(gateTooltip("before-qa"), "The item waits here until you press Continue to QA in the Inbox. qa-verifier tests the implemented user flows in the configured test environment.");
});
```

`report_submit` 설명과 product-copy §13 행이 같은지는 `src/server/mcp/tools.test.mjs:90`의 목록에 `"report_submit"`을 더해 고정한다(Phase 5, 두 곳을 같은 문장으로 맞춘 뒤).

추가 시험 — Codex 렌더(harness-templates `templates.test.mjs`, 형제는 "the QA stub and every QA step render for Codex without copying a preexisting runbook"):

```js
it("the impl-verifier stub and every step render for Codex with its exact role tools", () => {
  const vars = buildVars(cfg, "codex");
  const { stub, steps } = splitTemplate(tpl("agents/impl-verifier.md"));
  const toml = renderCodexRole(renderTemplate(stub, vars), "impl-verifier");
  readCodexRole(toml, "impl-verifier", "impl-verifier");
  assert.doesNotMatch(toml, /## step:/);
  for (const step of steps) assert.doesNotMatch(renderTemplate(step.body, vars), /\{\{|\/harness:init/);
});
```

검증 기준:

- 위 시험과 기존 시험이 모두 통과한다.
- 기존 시험에서 고정값을 바꾸는 곳은 *Affected Files*에 나열한 것이다. 그 표 아래의 두 검색 명령(QA를 언급하는 시험 줄,
  `NODE_KINDS`·`REPORT_AGENTS`를 import하는 시험)으로 찾았고, 아래 사전 확인에서 실제 실패 파일과 맞췄다(통합 시험 제외).
  그 밖의 기존 시험이 실패하면 먼저 두 검색을 다시 돌려 누락인지 확인하고, 누락이 아니면 신규 회귀로 본다.
- 기존 실패와 신규 실패 구분: Phase마다 바꾸기 전 dev에서 같은 명령을 먼저 돌려 기준을 남긴다.
- 성공 기준 4는 Phase 7의 실측 보고서(`docs/test-reports/`)로 판정한다.

제안 단계 사전 확인(버리는 worktree에서 문서의 코드를 글자 그대로 옮겨 돌렸다):

- Claude 전용 판(2026-10-07, origin/dev `8a12137`): 6절의 거부 코드와 `qaWorkflowFile`, 위 Codex 도우미 시험 2건만 버리는 worktree에 옮겨
  `node --test plugin/bin/harness-session.test.mjs`를 돌렸다. 18건 중 17건 통과·실패 0이었다(적용 전 16건. 나머지 1건은 적용 전에도 건너뛰는 POSIX 사례다).
  - 거부 줄이나 `codexFailure`의 통과 조건을 하나씩 빼면 거부 시험이 실패했다.
  - `main()` 연결 확인(위 `rg` 두 줄)은 적용 뒤 옛 줄 0·새 줄 1이었다.
  - 그 밖의 코드는 아래 판들과 같아서 다시 돌리지 않았다. 아래 결과에는 이번에 뺀 Codex 코드와 시험(`explicitRetry`·`optionsFor`·`keyed`·
    `rolePermissions` 분기와 그 시험 3건)이 들어 있었다. 뺀 코드는 Codex 도우미 안에서만 쓰였다.
- 아래는 줄이기 전 판(Codex 실행 포함)의 기록이다.
- 적용: 2·3·4·5·6·7절의 코드 조각, 표와 본문이 글자로 적은 변경(`OPT_IN_NODES` 주석, `main()`의 재시도 한 줄, `accepted`·`keyed` 목록, `optionsFor` export 포함),
  *Verification Plan*의 새 시험(코어·감시기·Codex 도우미·웹), 통합 시험 파일이다. 바꾸는 곳은 각각 원본과 정확히 한 번 일치했다.
  `plugin/lib`은 `scripts/plugin-lib.mjs`로 맞췄다. `harness-role-files.test.mjs:98` 목록 변경과 `tools.test.mjs:90` 변경은 넣지 않았다
  (뒤의 것은 product-copy §13 행을 고친 뒤에만 통과한다).
- 최신 실측(2026-10-07, origin/dev `c8799f6`): 53곳이 모두 원본과 정확히 한 번씩 일치했다(2절 Before 다섯 줄을 줄마다 대조).
  직전 기준 `c8e81c1`에서도 아래와 결과가 같았다(시험 수만 343건).
  - `main()` 연결 확인(위 `rg` 두 줄): 적용 전에는 옛 줄 4·새 줄 0, 적용 뒤에는 옛 줄 0·새 줄 2였다.
  - `npm run check` 통과(lint·FSD·`tsc`·`test:architecture` 44건과 런타임이 필요해 건너뛴 2건·`test:project-availability` 18건).
    새 TS 시험(통합·레일·툴팁)도 `tsc`로 타입 검사됐다. 통합 시험의 중복 제출 단언도 여기에 든다.
  - `npm test`(메모리 때문에 같은 파일을 `--test-concurrency=1`로 차례로 돌렸다): 344건 중 36건 실패(늘어난 1건은 #132의 시험). 실패는 고정값 시험뿐이고 *Affected Files*에 적은
    파일이다(`client-runtime.test.mjs`, `entitlement.test.mjs`, `pipeline.test.mjs`의 `:5`·`:44`를 쓰는 두 묶음, `harness-init.test.mjs`).
    이 문서의 새 JS 시험 8건(코어 3, 감시기 1, Codex 도우미 4)은 모두 통과했다. Codex 도우미 시험의 key 거부 단언은, 적용본의 impl-verifier key 검사를
    빈 값 검사로 줄이면 실패했다(`c8e81c1`에서 확인).
  - `npm run test:web`은 이 판에서 돌리지 않았다.
- 그 전 실측(53곳, origin/dev `1dce256`. 위 두 단언(통합 시험의 중복 제출, Codex 도우미 시험의 key 거부)을 더하기 전 판): `npm run check` 통과,
  `npm test`는 343건 중 36건 실패(위와 같은 파일). `npm run test:web`은 시스템 메모리 부족으로 도중에 중단돼 전체 결과가 없고, 중단 전에 새 웹 시험
  2건(레일 삽입, 게이트 툴팁)은 통과했다. `ab538b5`에서 다시 적용했을 때는 53곳이 일치했지만, `npm run check`·`npm test`가 같은 이유로 lint 단계에서 중단됐다.
- 이전 실측(48곳. 코어 3·QA 허용 목록·재시도 시험은 들어 있었고, 감시기·옵션 파싱·key 결합과 쓰기 권한·웹 시험은 아직 없던 판): `c78b8d0`·`42fc424`·`1dce256`
  세 기준에서 `npm run check` 통과. `npm test`는 339·339·340건 중 36건 실패(`1dce256`에서 늘어난 1건은 #126의 시험). `npm run test:web`은 셋 모두 579건 중 13건 실패였다. 실패 파일은 `labels.test.ts`, `briefing.test.mjs`,
  `project-board-page.test.mjs`, `client-bundle-query.test.ts`, `harness-init.test.ts`, `run-rules.test.mjs`, `templates-query.test.ts`였다.
  `run-rules.test.mjs`는 §13 hint 행을 넣지 않은 상태라서도 실패한다(Phase 2에서 함께 넣는다).
- 돌리지 않은 것: 새 시험을 넣은 판의 `npm run test:web` 전체, 통합 시험(격리 DB 필요. 중복 제출 단언은 타입 검사만 거쳤다),
  `npm run test:templates`, 8절 템플릿과 9절 문서 변경, 6절의 README·스킬 문장.
  - 글자로 정하지 않은 코드 주석 변경도 넣지 않았다: 2절 `pipeline.mjs:100`–`:102`, 3절 `entitlement.mjs:8`, 4절 `run-rules.ts:57`,
    9절 `board-rules.ts:112`. 주석만 바꾸므로 시험 결과는 바뀌지 않는다.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run check` | Not run yet | |
| `npm test` | Not run yet | |
| `npm run test:web` | Not run yet | |
| `npm run test:server:integration` | Not run yet | 격리 DB 필요 |
| `npm run test:templates` | 53/53 통과(2026-10-08) | harness-templates `harness/impl-verifier` `d996315`(PR #11)을 이 기능 브랜치 `c9d8b5c`의 `plugin/templates` 자리에 두고 돌렸다. 기준(main `528b823`)은 42건 중 1건 실패(`Codex bundle missing: agents/impl-verifier.md`). 템플릿 문장 변이 27건 모두 시험이 잡음. stagekeeper dev `cc7fe08` 위에서는 51/53(Codex 렌더 두 건은 Phase 1의 역할 등록이 필요). DB 없는 시드 검사 유효 행 13 |
| 실제 모델 리허설 | Not run yet | 성공 기준 4 |

## Risks and Rollback

잔여 리스크:

- **배포 순서 (high if wrong)**:
  - **서버와 플러그인은 같은 main에서 나간다.**
    - 운영 서버는 Vercel Git 연동으로 배포된다. 브랜치 push마다 vercel[bot]의 Preview 배포가 생기고, 이전 main `03876dd`에는 Production 배포가 있다
      (`gh api repos/Sangeok/stagekeeper/deployments`). 2026-10-06·07의 승격 뒤에는 `450176a`·`7bd40e1`·`c8799f6`에도 Production 배포가 생겼다. Vercel 프로젝트 설정은 보지 않았으므로, main push가 곧 운영 배포라는 것은 Git 연동의 기본값과 이 배포 기록들에 기댄 판단이다.
    - 플러그인은 같은 저장소의 `./plugin`이고(`.claude-plugin/marketplace.json:5`), 판을 올린 main을 사용자가 직접 갱신해야 받는다.
    - 그래서 승격 한 번에 서버는 바로 바뀌고 플러그인은 사용자가 갱신할 때 바뀐다. "플러그인을 서버보다 먼저"는 배포 순서로 만들 수 없다.
  - **새 서버는 템플릿 행을 요구한다.** `REPORT_AGENTS`에 impl-verifier가 들어간 서버는 이 행이 없으면 다음처럼 된다.
    - Codex Pro·Max(운영 DB에 Codex 번들이 시드돼 있을 때. 없으면 Codex는 이미 쓸 수 없다): `/api/templates`뿐 아니라 모든 역할의 `agent_next`가
      실패한다. Codex 번들 검사가 플랜의 모든 역할 템플릿을 요구하기 때문이다
      (`src/server/agents/runs.ts:22`–`:24` → `src/server/runbook.ts:19` → `src/server/client-bundle-query.ts:19` → `packages/core/client-runtime.mjs:29`–`:32`,
      `src/server/templates-query.ts:47`).
    - Claude: 새 플러그인으로 init하는 사용자는 `Template missing on server`로 멈춘다. 설치 대상이 플러그인과 서버가 모두 아는 에이전트이기 때문이다
      (`plugin/bin/harness-init.mjs:270`, `:277`–`:278`).
  - **새 플러그인도 템플릿 행을 요구한다.** 플러그인은 자기 `plugin/lib` 사본으로 Codex 세션 시작·init마다 같은 번들 검사를 한다
    (`plugin/runtime/mcp-client.mjs:84`의 `verifyCodexSupport`, `harness-codex.mjs:58`·`:69`·`:74`, `harness-session.mjs:40`, `harness-init.mjs:244`·`:255`).
  - **그래서 순서는 다음과 같다.**
    1. 템플릿 시드(Phase 7의 두 번 시드)
    2. 이 작업이 든 main fast-forward 승격(서버 배포와 두 매니페스트의 판 상승. 함께 실리는 dev 작업은 *Execution Plan*의 선행 조건에서 정한다)
    3. 소유자 플러그인 갱신
    4. `/harness:init`
    5. Claude는 검증 사본 디렉터리 등록(8절 런북 1단계)
    6. 노드 추가
  - 시드를 먼저 해도 옛 서버와 옛 플러그인은 괜찮다.
    - 옛 서버는 이 행을 내려보낸다(`packages/core/deliver.mjs:33`은 `REPORT_AGENTS`에 없는 에이전트를 거르지 않는다).
    - 옛 플러그인은 이 행을 설치하지 않는다(`harness-init.mjs:277`이 플러그인의 `REPORT_AGENTS`로 고른다).
    - 옛 Codex 번들 검사도 남는 행을 문제 삼지 않는다.
  - 감시기는 모르는 대기를 거부한다. 그래서 플러그인이 갱신되기 전에 노드가 그래프에 들어가면 그 소유자의 감시가 멈춘다. 노드는 opt-in이고 소유자가
    직접 넣으므로 소유자 순서로 막는다(아래 항목).
  - **Codex 런북 행이 바뀌면 모든 Codex 프로젝트가 멈춘다.**
    - 이번 롤아웃은 Codex 런북을 바꾸지 않는다(6절). 그래도 둘째 시드는 번들 전체를 싣으므로, 운영 Codex 런북 행이 원본과 다르면
      (Phase 7의 행별 출처 확인) 그 시드와 스냅숏 복원이 행을 바꾼다. 노드를 쓰는지와 상관없이 모든 Codex 프로젝트다.
    - 이유: Codex 번들 판은 `CODEX.runbook.md`의 해시다(`src/server/client-bundle-query.ts:24`). 판이 다르면 서버가 Codex의 `pipeline_next`를
      거부하고(`src/server/mcp/deps.ts:61`–`:65`), 플러그인도 세션 준비·시작을 거부한다
      (`plugin/runtime/mcp-client.mjs:85`의 "Codex runbook is stale; run $harness-init"). 그래서 사용자가 `$harness-init`을 다시 돌릴 때까지 멈춘다.
    - Claude는 안내만 붙는다(`deps.ts:88`, Codex는 `false`).
    - 플러그인 갱신 전에 init한 Codex 소유자는 갱신 뒤 한 번 더 init해야 impl-verifier 역할을 받는다(실행은 6절대로 거부된다).
    - 그래서 둘째 시드는 승격 바로 전에 하고, Codex 런북 행이 바뀌는 경우 Codex 사용자에게 "플러그인 갱신 뒤 `$harness-init`"을 함께 알린다.
  - Phase 1이 든 체크아웃에서 템플릿을 시드하면, 번들에 Codex 런북이 있을 때 impl-verifier 템플릿이 없으면 시드가 거부된다
    (`scripts/lib/template-seed-query.ts:25`가 `"max"`로 번들을 검사한다). 기능 브랜치의 다른 템플릿 재시드는 Phase 1이 없는 체크아웃에서 하거나
    impl-verifier 템플릿을 함께 싣는다.
- **플러그인 갱신·init 전에 노드를 넣는 경우**:
  - 단계 본문은 서버가 내려주므로 재시드 즉시 바뀐다(`packages/core/deliver.mjs:2`: "본문(단계)은 서버에만 남고 파일로는 스텁만 나간다").
  - 반면 스텁(`.claude/agents/impl-verifier.md`, `.codex/agents/impl-verifier.toml`)과 런북은 사용자가 `/harness:init`을 다시 돌려야 생긴다.
  - 이번 롤아웃은 런북을 바꾸므로, init 전 세션은 `pipeline_next`에서 런북 불일치 안내(`run-rules.ts:83`의 `RUNBOOK_STALE_NOTE`)를 받는다.
  - 그런데 init은 **설치된 플러그인**의 `REPORT_AGENTS`로 설치할 에이전트를 고른다(`harness-init.mjs:277`). 옛 플러그인으로 init하면
    런북은 새것이 되어도 impl-verifier 정의 파일은 생기지 않는다. 그 상태에서 노드를 넣으면 메인 루프가 디스패치할 에이전트가 없다.
  - 그래서 소유자 순서는 **플러그인 갱신 → `/harness:init` → (Claude) 검증 사본 디렉터리 등록 → Pipeline 탭에서 노드 추가**다. 이 순서를 `docs/architecture/impl-verifier.md`의
    롤아웃 절에 적는다(9절).
- **검증 사본의 권한 확인**:
  - Claude Code는 작업 디렉터리 밖 읽기마다 권한을 확인하고, `permissions.additionalDirectories`에 등록한 디렉터리는 확인 없이 읽는다.
    등록 뒤 검증·Git 명령이 확인을 거치는지는 소유자의 권한 모드·허용 규칙·샌드박스 자동 허용이 정한다. dev가 저장소에서 검증 명령을 돌릴 때와 같다(8절 런북 1단계).
  - 서브에이전트는 메인 대화의 권한 모드(정의에 따로 두지 않을 때)와 샌드박스 설정을 그대로 쓴다. 파일 도구도 추가 디렉터리 등록을 메인과
    똑같이 따른다(2026-10-08 실측, *Open Questions*).
  - 확인이 필요하면 요청이 메인 세션에 뜬다(Claude Code 문서 sub-agents). 소유자가 없는 감시 실행에서는 멈추거나, 거부되면 impl-verifier가 `blocked`로 보고한다.
    기본 권한 모드에서는 사본의 `git -C`가 매번 확인을 물으므로, 그 모드의 감시 실행은 impl-verify마다 이렇게 멈춘다.
  - 판정이 틀리는 쪽이 아니라 멈추는 쪽이다. 와일드카드 허용 규칙으로 이 멈춤을 없애면 다른 저장소의 `git`까지 열린다(실측). 그래서 런북은 그런 규칙을 권하지 않는다.
- **검증 사본 준비 실패**:
  - 의존성 준비는 프로젝트마다 다르고 메인 루프 모델이 한다.
  - 준비가 실패해도 디스패치하고, impl-verifier가 `start`의 기준 실행에서 `blocked`로 보고한다(8절 2단계). 그래서 잘못된 판정 대신 그 항목의
    `wait on impl-verify`로 드러나고, 감시 전체가 멈추지 않는다. 다만 대기가 잦으면 사용성이 떨어진다. 리허설에서 빈도를 기록한다.
- **막힌 항목의 출구(QA와 같다)**: 환경 문제로 impl-verifier가 계속 `blocked`이면 그 항목이 빠져나갈 길이 좁다.
  - 항목의 run은 처음 묶인 그래프 버전을 계속 쓴다. 있는 run은 그대로 돌려주고(`src/server/pipeline/run-query.ts:43`–`:45`), Reopen도 버전을 바꾸지 않는다
    (`src/server/pipeline/board-query.ts:633`–`:640`). 그래서 노드를 그래프에서 빼도, 이미 그 버전에 묶인 열린 항목은 impl-verify를 다시 지난다.
  - `done`에서 사람이 할 수 있는 전이는 Reopen뿐이고(`packages/core/transitions.mjs:23`–`:24`), 보류와 버리기는 `proposed`·`in_review`에서만 된다
    (`:17`–`:18`, `:36`, `docs/conventions/product-copy.md:304`).
  - 그래서 출구는 둘이다. 환경을 고친 뒤 명시적으로 재시도하거나, 계획부터 다시 열어 dev가 계획을 내 `in_review`가 된 뒤 보류하거나 버린다.
    뒤의 길로 빠지면 검증이 끝나지 않으므로, 남은 Claude 검증 사본은 8절 6단계대로 링크를 먼저 끊고 지운다.
  - Codex로 돌리는 프로젝트에 노드를 넣으면, Codex에서 그 노드에 닿는 항목은 모두 이렇게 된다(6절의 거부). 그런 항목에는 셋째 출구가 있다.
    Claude Code에서 이어 가는 것이다. 그래서 `docs/architecture/impl-verifier.md`의 롤아웃 절에 "Codex로 돌리는 프로젝트에는 아직 넣지 않는다"와
    이 출구들을 적는다(9절).
- **변이 확인의 오판**:
  - 적용 여부는 백로그 항목의 `type`으로 정한다(1절 검사 4). 계획의 분류 줄로 정하면, 소유자가 `refactor`로 정한 항목에서 되돌려도
    통과하는 정상 결과를 결함으로 내거나, 소유자가 `fix`로 정한 항목의 확인을 건너뛸 수 있다. plan_submit은 소유자가 정한 종류를 덮지 않는다.
  - 새 파일만 더하는 `feat`는 되돌리면 시험이 늘 가져오기 단계에서 깨지므로 변이 확인을 돌리지 않는다(1절 검사 4, 가치 검증 스파이크 (c)).
    기존 파일에 새 기호를 더하는 `feat`도 되돌리면 시험이 단언 전에 깨질 수 있다. 이것을 "시험이 변경을 잡음"으로 세면 거짓 안심이 된다.
    그래서 단언 실패만 증거로 세고, 로드 단계 실패는 기록만 한다. 두 경우 모두 단언이 있는지는 정적 검사(검사 3)만 본다.
    성공 기준 4(c)·(d)가 두 경로를 실측한다.
  - 시험 파일과 제품 파일은 계획의 Tests 절이 적은 시험 파일로 가른다(1절 검사 4.1, 8절의 계획 템플릿 변경).
    - 템플릿 변경 전에 쓴 계획에는 그 목록이 없으므로 변이 확인은 `blocked`가 된다.
    - 계획이 시험 파일을 빠뜨리면 시험까지 되돌려 잘못된 결함을 낼 수 있다. 그래서 되돌리는 파일 목록을 보고서에 남긴다.
  - 사본의 의존성 링크가 본 checkout의 워크스페이스 패키지를 가리키면, 되돌린 파일을 시험이 보지 못해 거짓 결함이 나온다.
    트리 해시 확인으로는 잡히지 않으므로 런북 절차(8절 2단계)가 막는다.
  - 되돌리는 대상은 계획의 "Files to change"에 든 파일로 한정한다. 그래서 동시에 열린 다른 항목의 파일은 건드리지 않는다.
    다만 같은 파일 안에 계획 밖 변경이 섞여 있으면 되돌리기가 그 변경까지 지운다. 에이전트는 되돌린 범위의 커밋 목록을 보고서에 남긴다
    (1절 검사 4). 소유자는 그 목록으로 결과를 판단한다. 리허설에서 빈도를 기록한다.
- **웹 표시(QA와 같은 기존 한계)**: 실패·차단으로 `wait on impl-verify`인 항목이 웹에서는 소유자 차례로 보이지 않는다.
  - 원인: 배너가 소유자 차례로 치는 것은 게이트, 실패한 인수, 커밋 대기뿐이다(`src/fsd/widgets/turn-banner/model/turn.ts:179`, `docs/conventions/product-copy.md:184`).
    검증 실패를 알리는 입력은 없다.
  - 그래서 7절의 `turn.ts:188` 변경 뒤 이 항목은 "working" 목록에 들어간다. 배너는 "KEY is waiting for impl-verifier"(`:126`)와 §5의
    "impl-verifier runs impl-verify" 줄을 보이고, Team 행은 "Ready for KEY"(`src/fsd/pages/project-board/model/briefing.ts:120`–`:122`)가 된다.
  - QA 실패도 지금 똑같이 보인다.
  - 이 제안은 웹 표시를 바꾸지 않는다. 소유자는 런북 절차의 대기 처리(8절 5단계: 보고를 읽고 소유자에게 알린 뒤 멈춘다)로 알게 된다.
    검증 실패를 소유자 차례로 보이게 하는 일은 QA와 함께 다룰 후속 제안이다.
- **비용**: opt-in 노드 하나가 항목마다 아래를 더한다. Phase 7 리허설에서 함께 잰다.
  - 디스패치 1회. 모델은 상속이다. 가치 검증 스파이크에서는 항목당 약 9.5만 토큰·80~104초였다. 파일 몇 개짜리 저장소였으므로, 읽을 코드와
    시험 출력이 많은 실제 저장소에서는 더 든다.
  - 작업 영역 검증 명령 최대 3회(impl-verifier의 기준 실행, 변이 실행, 복원 실행). 변이 확인을 하지 않는 항목(`refactor`·`docs`, 새 파일만 더한
    `feat`)은 기준 실행 1회다.
  - 메인 루프의 사본 준비: 항목마다 `git clone` 한 번과 의존성 준비(설치나 연결). 시간과 디스크는 프로젝트의 의존성을 따른다. 이 저장소라면
    의존성을 포함한 작업 트리가 약 765MB다(8절 1단계). 사본은 항목이 끝나면 지운다(8절 6단계).
- **이름 비교 지점의 변화**: 10절 목록은 이 문서를 쓸 때의 코드 기준이다. 구현 직전에 10절의 검색 명령을 다시 돌려, 그 사이 생긴 지점이 없는지 확인한다.

롤백 방법:

- 서버를 되돌리는 방법은 둘이다. Vercel에서 이전 Production 배포로 되돌리거나, main에 revert 커밋을 넣는다. revert 커밋은 같은 저장소의
  플러그인 파일도 되돌리지만, 이미 갱신한 사용자는 판을 다시 올리기 전까지 새 플러그인을 계속 쓴다.
- **노드를 쓰는 프로젝트가 없을 때**: 서버를 되돌린다. 서버의 Codex 필수 목록에서는 템플릿 행이 빠진다.
  템플릿·플러그인은 남겨도 무해하다(감시기의 추가 경우와 역할 표 항목은 쓰이지 않는다). 단 새 플러그인이 설치돼 있는 동안 템플릿 행은
  지우지 않는다. 새 플러그인의 Codex 번들 검사가 그 행을 계속 요구한다(*배포 순서*). 플러그인까지 되돌리려면 판을 다시 올려 옛 내용을 낸다.
- **노드를 쓰는 그래프 버전이 있을 때**: QA와 같다. 그 버전은 호환 서버가 필요하므로, 소유자가 노드 없는 새 그래프 버전을 저장한 뒤
  revert한다. 열린 항목은 원래 버전으로 남는다(`docs/architecture/qa-verifier.md`의 Rollout).
- **템플릿**: 둘째 시드의 행(런북·README·계획 템플릿·QA 템플릿과 번들째 실린 나머지 행)은 그 스냅숏으로 되돌린다(`restoreTemplates`). 스냅숏 뒤에 행이 바뀌었으면 복원이
  거부되므로(`scripts/lib/template-seed-query.ts:73`), 그 사이 다른 시드가 있었다면 그 시드부터 되돌린다. 첫 시드의 `agents/impl-verifier.md` 행은
  지우지 않는다. `restoreTemplates`가 새 행 삭제를 거부하고(`:71`), 옛 서버·플러그인에는 무해하며, 새 플러그인은 이 행을 요구한다.
  복원이 Codex 런북 행을 바꾸면 모든 Codex 프로젝트가 `$harness-init`까지 다시 멈춘다(*배포 순서*). 복원할 때도 사용자에게 알린다.
- DB 스키마 변경이 없으므로 데이터 되돌리기는 템플릿 행뿐이다.

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성합니다.

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
- [x] 문서 위치와 `status`가 일치한다.
- [x] `stage`는 pending 문서에서만 사용했다.
- [x] `stage: "approved"`라면 승인 기록이 모두 채워져 있다.
- [x] `proposal-size`는 standard 강제 조건에 맞게 standard다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용한다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 import, 타입, 시험, 런타임 부작용, 이름 비교 지점(10절), 동시성·권한(11절)을 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다(실행 전).
- [x] 잔여 리스크를 명시했다.

<!-- doc-validation-skip -->
## Open Questions

- **[Codex 실행 — 별도 제안서로 넘김]** 이번 제안에서는 정하지 않는다(대안 분석 「범위」). 아래는 그 제안서의 입력으로 남긴다.
  - Codex Windows의 역할 명령은 명령마다 저장소 스냅숏을 새로 만들고, 쓰기는 버린다(`plugin/runtime/role-commands.mjs:18`).
    - 의존성도 스냅숏에 실린다. 역할이 읽을 수 있는 파일을 `.git`·`.codex`·`.claude`·`.next`와 `.env`류(`.env.example` 제외)만 빼고 모두 복사하고
      (`role-commands.mjs:13`, `:75`), pm을 뺀 워크스페이스 밖 역할은 저장소 전체를 읽는다(`codex-thread.mjs:40`, `:43`). impl-verifier도 그렇다.
      다른 워크스페이스를 막는 것은 워크스페이스 역할뿐이다(`:53`–`:56`).
    - 다만 링크·하드링크가 있거나, 파일 10만 개·합계 2GiB·파일당 128MiB·준비 300초를 넘으면 명령이 실패한다
      (`docs/architecture/protocol.md:499`–`:502`, `plugin/runtime/role-files.mjs:79`–`:80`, `role-commands.mjs:39`, `:79`).
      그래서 의존성을 링크로 잇는 프로젝트는 이 경로를 쓸 수 없다. dev 역할의 검증 명령에도 있는 기존 한계다.
    - 테스트가 명령 하나의 제한 시간(최대 120000ms, `role-commands.mjs:19`) 안에 끝나는지는 확인하지 않았다.
  - 그 스냅숏에는 `.git`이 빠진다(`role-commands.mjs:13`의 `omittedName`). 그래서 "스냅숏 안에서 되돌리기"는 스냅숏의 Git을 쓸 수 없고,
    되돌릴 내용을 파일로 넘겨야 한다.
  - Windows 역할의 Git 조회는 `role_git_read`(head·show·diff·status, ref는 HEAD·planCommit, 파일 50개)뿐이라 `start` 1과 검사 1·4.1의 Git 증거를
    만들 수 없다(1절). 그래서 그 증거도 넘겨 줘야 한다. 예를 들어 도우미가 조상 확인·변경 파일 목록·파일별 커밋 목록을 계산해 브리핑에 담거나,
    `role_git_read`를 넓힌다.
  - 역할 한 턴은 15분 안에 끝나야 한다(`codex-thread.mjs:378`). 그 안에 작업 영역 검증 명령을 기준·변이·복원 실행으로 세 번 돌려야 한다(1절).
    - 스냅숏 준비와 정리는 명령마다 따로 붙는다(`role-commands.mjs:231`–`:245`). 이 저장소(약 3.4만 개 파일)의 CI 실측은
      `docs/proposals/completed/2026-10-07-role-command-snapshot-performance.md`의 *Current State*에 세 벌 있다.
      - 닫은 PR #120의 두 실행: 명령마다 스냅숏·런타임 복사·ACL·삭제에 약 103~129초.
      - 「Phase 0 기준선」(#130 뒤 dev 리허설 3회): 스냅숏 44~82초, 런타임 복사 약 3초, ACL 11~18초.
      - 「Phase 1 결과」(#132 리허설 3회, 지금 main·dev의 코드): 스냅숏 약 62~69초, 런타임 복사 약 3~4초, 권한 부여(`grantMs + aclMs`) 1초 미만.
      - 삭제는 단계별 시간에 잡히지 않는다. 그 제안서는 리허설 전체와 단계별 시간 합의 차이를 삭제와 스크립트 기동 등으로 본다(Phase 0 절은 약 9~17초,
        Phase 1 표로 계산하면 약 11~16초). 그 차이까지 더하면 지금 코드에서 명령마다 약 76~90초다.
      - 그래서 세 번이면 이 비용만 약 4~4.5분이다.
      - 단계별 시간은 명령 결과의 `timings`(`grantMs`·`snapshotMs`·`scratchMs`·`runtimeMs`·`commandMs`)와 도우미 ACL 단계 `aclMs`다
        (`docs/architecture/protocol.md:509`–`:510`, `role-commands.mjs:228`–`:240`).
    - CI 러너는 Defender 실시간 검사가 꺼져 있었다. 켜진 로컬 Windows 11에서는 같은 절의 실측이 더 길다.
      - 원본 스냅숏만 99~102초였고, 번갈아 재던 비교에서는 원본 한 번이 237초였다(메모리 부족으로 비교는 중단됐다).
      - 원본 코드로 돌린 로컬 빌드 리허설 한 번은 전체 369초였다.
      - 그래서 소유자 PC에서는 세 번이 15분 턴을 넘기거나, 스냅숏 하나가 준비 상한 300초에 가까워질 수 있다.
    - 그 제안서는 2026-10-07에 완료됐다. Phase 0(시간 기록)과 Phase 1(복사 전 권한 부여)로 ACL 단계는 1초 미만이 됐다. 스냅숏 복사를 줄이는
      Phase 2는 진행하지 않기로 했고, Phase 3(삭제를 결과 반환 뒤로)는 보류됐다. 그래서 아래 선택은 지금 수치를 기준으로 한다.
  - 비Windows Codex: 저장소 쪽 Git 증거(조상 확인, 변경 파일 목록, 파일별 커밋 목록)는 읽기 전용 저장소와 `.git`으로 만들 수 있다. 하지만 역할은
    저장소 읽기와 스크래치 쓰기만 열려 있다(`codex-thread.mjs:40`–`:42`, `:root`는 거부). 그래서 저장소 밖 사본의 HEAD 확인과 사본에서의 검증 명령
    실행에는 권한 결정이 필요하다.
  - Windows의 역할 명령은 언제나 저장소 루트(`input.binding.root`)의 스냅숏에서 돌고, `cwd`도 저장소 기준 상대 경로만 받는다
    (`codex-thread.mjs:325`, `role-commands.mjs:220`). 그래서 Windows에서 아래의 "메인 루프 사본 경로를 쓰기로 연다"를 고르면 권한만으로는
    모자라고, 명령이 사본에서 돌도록 명령 실행 쪽도 바꿔야 한다.
  - 그 제안서는 harness-smoke에서 두 경로를 실측하고, "메인 루프 사본 경로를 쓰기로 연다"와 "스냅숏 안에서 되돌리기와 시험을
    명령 하나로 실행한다" 중 하나를 정한다. Windows 실측은 명령 결과의 단계별 시간으로 스냅숏 준비와 명령 실행을 나눠 적는다.
    Windows의 Git 증거 전달 방식과, 이 경로를 쓸 수 없는 프로젝트(의존성을 링크로 잇거나 15분 안에 끝나지 않는 프로젝트)를 어떻게 다룰지도
    함께 정한다. 그런 프로젝트에서는 노드를 넣은 뒤의 항목이 빠져나갈 길이 좁다(*Risks and Rollback*의 「막힌 항목의 출구」).
- **[Claude 서브에이전트의 추가 디렉터리 상속]** `permissions.additionalDirectories`가 서브에이전트의 파일 도구에도 적용되는지 문서에 없다
  (Claude Code 문서 permissions·sub-agents·sandboxing, 2026-10-07 다시 확인). 문서가 말하는 것은 셋이다.
  - 서브에이전트는 정의에 `permissionMode`가 없으면 메인 대화의 권한 모드로 돈다. 역할 스텁은 이 값을 두지 않는다.
  - 백그라운드 서브에이전트의 확인 요청은 메인 세션에 뜬다.
  - 서브에이전트의 셸 명령은 부모 세션과 같은 샌드박스 설정을 쓰고, 그 설정은 추가 디렉터리에 쓰기를 허용한다. 그래서 샌드박스가 켜진
    macOS·Linux·WSL2에서는 사본 안 셸 명령의 쓰기가 막히지 않는다. 남은 것은 파일 도구의 확인 없는 읽기와, 샌드박스 밖(네이티브 Windows 등) 명령의 확인이다.

  **해결(2026-10-08 실측).** 사본 위치는 그대로 둔다.
  - 방법: Claude Code 2.1.292, 네이티브 Windows, 비대화형 `claude -p`. 시험용 저장소에 `.claude/agents/probe.md`(Read·Glob·Grep·Bash, sonnet)를 두고
    메인 루프와 서브에이전트가 같은 네 동작을 했다. 저장소 밖 `~/.harness/impl-verify/<probe>`의 Read와 Glob, `git -C <사본> rev-parse HEAD`,
    허용 규칙 `Bash(node:*)`가 덮는 `node <사본>/t.mjs`다. 설정은 `--settings` 파일로 주고 `--setting-sources project --strict-mcp-config`로
    사용자 설정과 MCP를 뺐다. 신뢰하지 않은 작업 공간의 `.claude/settings.json` permissions는 무시되기 때문이다. 아홉 번 돌렸고 비용은 약 0.45달러였다.
  - 결과 1: 모든 설정에서 서브에이전트의 판정이 메인과 같았다. 등록이 없으면 Read·Glob이 둘 다 거부되고, `additionalDirectories`에 등록하면
    둘 다 확인 없이 읽었다. 허용 규칙이 덮는 node 명령은 등록과 상관없이 둘 다 돌았다.
  - 결과 2: 기본 권한 모드(manual)에서 `git -C <경로> …`는 등록해도, 경로가 작업 디렉터리 자신이어도 매번 확인을 물었다. `-C` 없는
    `git rev-parse HEAD`(작업 디렉터리 안)는 확인 없이 돌았다. auto 모드에서는 등록 여부와 상관없이 위 동작이 모두 확인 없이 돌았다(분류기 판정).
  - 결과 3: 허용 규칙 `Bash(git -C C:/Users/<u>/.harness/impl-verify/*)`를 더하면 메인과 서브에이전트의 `git -C <사본>`이 돌았다. 그런데 같은 규칙이
    `git -C …/impl-verify/../../<다른 저장소> rev-parse HEAD`도 확인 없이 돌렸다. `*`가 `..`를 막지 않으므로 이 규칙은 사실상 모든 저장소의 Git을 연다.
    `&&`로 이은 둘째 명령은 따로 판정돼 확인을 물었고, 따옴표로 감싼 경로는 규칙과 맞지 않았다. 확인한 명령은 모두 읽기 전용이었다.
  - 반영: 런북 impl-verify 절은 등록을 안내하고, 기본 모드에서 `git -C`가 확인을 묻는다는 것과 와일드카드 규칙을 권하지 말라는 것을 적는다(8절).
    `docs/architecture/impl-verifier.md`의 권한 문단도 같은 내용으로 고쳤다. 1절의 `git -C` 근거는 "확인을 피한다"가 아니라 "명령이 사본을 이름으로 가진다"로 바꿨다.
  - 한계: 비대화형에서는 서브에이전트의 확인 요청이 거부로 끝난다. 대화형에서 메인 세션에 뜨는지는 문서에 따른 것이고 재지 않았다.
    샌드박스가 도는 macOS·Linux·WSL2와 그 자동 허용은 재지 않았다.

  아래는 확인 전(2026-10-07)에 적은 대안이다.
  - 안 되면 사본 위치를 다시 정한다. 예를 들어 작업 디렉터리 안에서 Git이 무시하는 하위 디렉터리다. 그 경우 두 가지를 확인해야 한다.
    - 저장소의 시험·린트·타입 검사가 사본 파일을 함께 읽지 않는지.
    - 사본의 `CLAUDE.md`(런북)가 검증 에이전트에 실리지 않는지. 작업 디렉터리 아래 하위 디렉터리의 `CLAUDE.md`는 그 안의 파일을 Read·Write·Edit할 때
      함께 실린다(memory 문서). 설정 키로 등록한 저장소 밖 사본에서는 실리지 않는다.
  - `--add-dir`도 대안이 아니다. 파일 접근 규칙은 설정 키와 같지만, `--add-dir`로 더한 디렉터리에서는 `.claude/agents/`·skills·commands와
    설정의 일부 키(`enabledPlugins` 등)까지 읽어 들인다(permissions 문서의 "Additional directories grant file access, not configuration"). 사본은 같은
    저장소의 clone이므로, 저장소가 `.claude/agents/`를 커밋해 두었다면 같은 이름의 역할 정의가 한 번 더 실린다. 설정 키로 등록한 디렉터리는 파일 접근만 준다.
- **[화면 문구]** 라벨 "Implementation check", 게이트 문구(`gate-copy.ts`·`gate-text.ts`), product-copy §6의 역할 용어, Codex 도우미의 거부 문구(6절)는
  제안값이다.
  product-copy 검토에서 확정한다. 검증 에이전트 보고의 문서 라벨(지금은 plan-verifier·qa-verifier처럼 "Implementation report", 10절)을
  따로 둘지도 그때 함께 정한다.

<!-- doc-validation-restore -->
