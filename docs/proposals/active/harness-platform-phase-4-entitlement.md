---
# Metadata. status value는 proposals/README.md의 세 상태만 사용합니다.
status: "pending"
stage: "approved"
proposal-size: "standard"
created-at: "2026-09-03"
approved-by: "Sangeok"
approved-at: "2026-09-03"
approval-scope: "Batch A·B(T4.1~T4.5) + G1 — 대화 승인, front matter는 사후 기록. C·D는 G1 결과를 본 뒤 따로 승인"
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: ["Sangeok"]
related:
  - "docs/investigations/active/harness-platform.md"
  - "docs/proposals/completed/2026-09-01-harness-platform-phase-0-1.md"
---

# 하니스 플랫폼 Phase 4(전반) — 플랜·권한 게이트와 에이전트 본문 보호

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`로 태스크 단위 실행. 단계는 체크박스(`- [ ]`)로 추적한다. 스펙은 `docs/investigations/active/harness-platform.md`(이하 **스펙**)이며 이 문서와 **함께** 읽는다. 이 문서는 2026-09-03 설계 대화의 결론을 옮긴 것이다 — 대화에서 기각된 선택지(`agent_brief` 단독, `delivery: full`, 무상태 `after` 커서)는 §"기각한 선택지"에 이유와 함께 남긴다. 되살리지 않는다.

## Summary

사용자가 돈을 낼 이유를 만드는 첫 단계로 **플랜(Free/Pro/Max)과 서버가 강제하는 상한**을 넣고, 동시에 서비스의 실체인 **에이전트 템플릿 본문을 사용자에게 파일로 주지 않는 전달 방식**(스텁 + `agent_next`)으로 바꾼다. 결제(Polar)는 이번에 넣지 않는다 — `Subscription` 행은 수동으로 넣고, 화면은 "Pro에서 열립니다" 문구와 `/billing`의 플랜 표까지만 만든다. 이 제안서의 핵심 제약은 셋이다: **운영자 비용 0**, **서브에이전트 성능 저하 0**, **본문 노출은 에이전트를 쓸 수 있는 한도에서 최소**.

## Goal

- 플랜 상한(프로젝트·워크스페이스·백로그·이력·에이전트 종류)이 **서버 상태**에서 강제된다 — 프롬프트나 화면이 아니라(스펙 §2.1 "서버가 강제하는 규칙").
- 상한을 넘는 프로젝트는 **잠긴다**(웹 읽기 전용, MCP 거부, 결재함 잠금). 데이터는 보존.
- 에이전트 5종의 본문이 어떤 제품 경로로도 **파일로 내려가지 않는다**. `.claude/agents/*.md`에는 역할 한 문장 + 규칙 + "`agent_next`를 불러라"만 남는다.
- 스텁 방식이 파일 방식과 **같은 품질**로 한 사이클을 완주한다는 것을 실측 게이트(G1)로 확인한 뒤에만 실사용에 켠다.
- 작업 유형: 신규 구현(권한 코어·MCP 도구·마이그레이션) + 계약 변경(`/api/templates`·생성기·템플릿 형식) + 문서(스펙·아키텍처).

## Proposal Size

`proposal-size`: standard

선택 근거:

- 인증·권한(프로젝트 잠금·MCP 401)·API 계약(MCP 도구 추가, `/api/templates` 응답 형태)·데이터 구조(`Subscription`·`AgentRun` 마이그레이션)·라우팅(`/billing`)에 전부 닿는다.
- 파일 20개 이상. 롤백은 배치별 revert에 마이그레이션 되돌리기가 따른다(§Risks and Rollback).

## Current State

| 항목 | 상태(2026-09-03 실측) |
| --- | --- |
| 저장소 | `dev` = `c1e5a36`(PR #7 머지). Phase 0·1 완료, Phase 2·3 미착수(Phase 2 보류 중). 이 저장소 `Sangeok/stagekeeper`는 **public** |
| 플랜·구독 | 없음. `prisma/schema.prisma`에 `Subscription`·plan 필드 없음. `src/server/templates.ts:21`에 "구독 검사 자리" 주석 하나 |
| 상한 | 없음. `createProject`·`addBacklogItem`·`project_sync` 모두 무제한. 미결 보드 항목 ≤ 2만 서버 강제 |
| 에이전트 템플릿 | 원문은 private 저장소(`Sangeok/harness-templates`)와 로컬 `plugin/templates/en/`(`.gitignore` 50–51행, `git log --all`로 이력에 없음 확인). DB `Template{lang,path,body}`에 시드(`scripts/seed-templates.ts`). **`/api/templates`가 본문 전체를 그대로 내려주고** `plugin/bin/harness-init.mjs`가 `.claude/agents/<x>.md`로 쓴다 — 즉 지금은 토큰 하나면 5종 본문(dev 238행·doc-auditor 174·feature-scout 184·plan-verifier 115·pm 143)을 전부 가져간다 |
| 렌더 | `packages/core/render.mjs` = `{{a.b}}` 치환뿐. 조건·반복 없음 → 플랜별 분기는 템플릿 안에서 못 한다 |
| MCP 도구 | `AGENT_TOOL_NAMES` 11종(`src/server/mcp/tools.ts:7`). `tools.test.mjs`가 등록 목록 == 상수를 단언 |
| `report_submit` | `src/server/pipeline/board.ts:164` — `Report` + `TransitionEvent{note:"report"}` 생성. **actor 검증 없음, 검증 선행 조건 없음** |
| 이미 배포된 것 | 본인 계정 프로젝트와 외부 사용자 1명(스펙 4.6)이 현재 버전 5종 본문을 파일로 받아 갔다. 회수 불가 — 이 제안서의 보호는 **앞으로의 버전부터** |

## Scope

포함 범위:

- 플랜 정의와 상한 판정(`packages/core/entitlement.mjs`), `Subscription` 모델, 프로젝트 소유자 기준 플랜 해석, 수동 부여 스크립트.
- 에이전트 전달 방식 전환: 템플릿 단계 형식, `agent_next` 도구, 서버 커서·상태 게이트·호출 제한, 스텁 생성, `/harness:init` 갱신.
- 서버 벽: 프로젝트 생성·백로그 추가·워크스페이스 상한, 프로젝트 잠금(웹·MCP·결재함), 이력 창, `report_submit` 검증 선행·actor 검증.
- 접점: `/billing`(플랜 + 매트릭스), 상한·잠금 문구, 헤더 플랜 배지.
- Free 파이프라인 변형(runbook Free 판).
- 스펙·아키텍처 문서 갱신(§"스펙 대비 변경점").

제외 범위:

- **Polar 결제·웹훅·가격**(스펙 4.1 후반) — Polar 상품이 생긴 뒤 별도 제안서. 이번엔 결제로 가는 버튼·링크가 없다.
- 팀 멤버·역할(4.3), GitHub App(4.4), marketplace·온보딩 문서(4.5), 랜딩 가격표.
- 파이프라인 빌더(사용자가 단계를 편집하는 UI). 단계는 private 템플릿에서만 편집한다.
- Phase 2(ApcH 테넌트)·Phase 3(명령·배포 원장). ApcH 저장소 변경 일체(스펙 D3).
- 이미 내려간 현재 버전 본문의 회수.

## 결정 사항 (2026-09-03 확정)

### 플랜 매트릭스

| | Free(영구) | Pro | Max |
| --- | --- | --- | --- |
| 프로젝트 | 1 | 5 | 무제한 |
| 워크스페이스(dev) / 프로젝트 | 1 | 10 | 무제한 |
| 백로그 항목 / 프로젝트 | 10 | 무제한 | 무제한 |
| 이력 창(전이 이벤트·보고 조회) | 최근 30일 | 전체 | 전체 |
| 에이전트 | `pm` + dev×1 + `feature-scout` (고정) | 5종 전부 | 5종 전부 |
| 가격 | 0 | Polar 상품 생성 시 결정 | 〃 |

- 플랜은 **사용자**에 붙고, 프로젝트는 **소유자(`ProjectMember.role = owner`)의 플랜**을 따른다. `Subscription` 행이 없으면 Free.
- **상한 초과 프로젝트는 잠긴다.** 활성 = `createdAt` 오름차순 앞에서 N개, 나머지는 잠김. 잠긴 프로젝트: 웹은 읽기 전용(게이트·백로그 편집·토큰 발급 불가), MCP는 토큰 검증 단계에서 거부, 결재함은 잠금 칩. 행은 하나도 지우지 않는다.
- 이력 창은 **조회 창**이다. 저장은 전부 하고, Free는 30일보다 오래된 전이 이벤트·보고를 화면과 `board_get`에서 뺀다(플랜을 올리면 그대로 보인다).
- **결제 경로 없음.** `Subscription`은 스크립트로 넣는다(본인 계정 Max, 스펙 4.6의 외부 사용자 Pro). 화면의 "Pro에서 열립니다"는 문구만 — 버튼 없음.

### 에이전트 전달 — 스텁 + `agent_next`

원칙: **본문은 서버에만 있고, 서브에이전트는 지금 할 한 단계만 받는다.**

**스텁**(`.claude/agents/<x>.md`, 생성기가 쓰는 파일): frontmatter(`name`, `description`, `tools:` 화이트리스트 — `mcp__harness__agent_next` 포함) + 역할 한 문장 + 굳은 규칙(readOnly 경로, 편집 범위, 보고 없이 done 금지) + 구동 규칙 한 문단: "`agent_next`를 불러 받은 단계를 수행하고, 결과(`outcome`)와 함께 다시 불러라. `done`이 올 때까지 반복. **현재 단계 밖의 일은 하지 않는다.**" 스텁이 서브에이전트의 시스템 프롬프트가 되므로 컴팩션을 견딘다.

**`agent_next` 계약**

| 입력 | 의미 |
| --- | --- |
| `agent` | roster의 에이전트 이름. 플랜이 허용하지 않는 에이전트면 거부(사유 포함) |
| `key?` | 항목에 묶인 에이전트(dev·plan-verifier)는 필수 |
| `outcome?` | `ok` \| `blocked` \| `failed`. **없으면 현재 단계를 다시 준다**(전진 없음 — 컴팩션 뒤 복구용) |
| `note?` | 이 단계에서 한 일·결과 한두 줄. 서버가 기록한다 |

| 출력 | 의미 |
| --- | --- |
| `step` | 단계 id |
| `instruction` | 이 단계의 본문(서버 렌더 완료) |
| `done` | `true`면 끝. 더 부르지 않는다 |

**커서는 서버가 든다.** `AgentRun{projectId, agent, key?, tokenId, stepId}` 한 행이 "지금 어느 단계인가"다. 호출마다: 토큰·프로젝트 잠금·플랜 검사 → 열린 run이 없으면 오리엔테이션 단계를 주며 run 생성 → 있으면 (현재 단계, `outcome`)으로 다음 단계를 고르고 **그 단계의 전제 상태를 보드에서 확인**한 뒤에만 준다. 전제가 안 맞으면 고정 문구("이 단계는 항목이 `implementing`일 때 열린다")를 돌려주고 전진하지 않는다.

- dev `plan` 단계: 항목이 `planning`. dev `implement`·`verify`·`report`: `implementing`. plan-verifier: `in_review`. pm: 미결 < 2. 보고 단계: 같은 항목에 `verify` 단계 `ok` 기록이 있을 때.
- `note`는 `AgentRunStep{runId, stepId, outcome, note, at}`로 남는다. 이것이 **검증 원장**이다 — `report_submit`은 같은 (프로젝트, key, actor)에 `verify`/`ok` 기록이 없으면 거부한다(§벽).
- run의 수명: (프로젝트, agent, key)당 열린 run은 하나. `done` 단계를 받으면 닫힌다. 항목이 `done`·`on_hold`·폐기로 바뀌면 그 항목의 열린 run은 서버가 닫는다. **닫힌 뒤의 호출은 `outcome` 없는 호출만 새 run을 연다.** `outcome`을 실은 호출에 열린 run이 없으면 `{done: true}`를 돌려준다 — dev의 `report`·`hold`(와 `plan`의 on_hold 경로)는 항목을 옮긴 `board_transition` 뒤에 `ok`를 보내므로, 그 호출이 run을 열면 `start`로 되돌아가 버린다(T4.3에서 발견, T4.4에서 구현). 항목에 묶이지 않은 에이전트(pm·feature-scout·doc-auditor)의 run은 `done`으로만 닫힌다.
- 호출 제한: 토큰당 10분에 60회(정상 사이클 ~25회의 두 배 남짓, 상수 하나로 조정). 한 run 안에서 `requires` 검사에 10회 이상 막히면 `console.warn` 한 줄(열거 시도 흔적).
- 첫 단계는 **오리엔테이션**: 목표와 산출물의 형태(무엇을, 어떤 모양으로)만. 방법은 그 뒤 단계에. 이유: 단계별 전달로 잃는 "앞을 내다보는 힘"을 여기서 돌려준다.

**템플릿 형식**(private 저장소, 마크다운 그대로):

```
---
name: {{ws.agent}}
description: …
tools: Read, Edit, …, mcp__harness__agent_next, …
---
(첫 `## step:` 앞까지 = 스텁. 이 부분만 파일로 내려간다)

## step:start
(오리엔테이션 — 보드 상태로 갈라지는 자리)
next: implement | plan
on blocked: done

## step:plan   requires: planning
…
next: done
on blocked: done

## step:implement   requires: implementing
…
next: verify
on blocked: hold

## step:verify   requires: implementing
…
next: report
on failed: hold
on blocked: hold

## step:report   requires: implementing, verify-ok
…
next: done

## step:hold
(보고서 + report_submit + on_hold 전이)
next: done
```

분기 어휘는 `next:`·`on failed:`·`on blocked:` 셋뿐. `next:`는 `a | b`처럼 후보를 나열할 수 있고, 서버는 `requires`가 성립하는 첫 후보를 준다(지금은 dev `start` 한 곳만 쓴다). `requires:`는 보드 상태 이름 또는 파생 조건 `verify-ok`·`can-propose`(pm `propose`: 미결 < 2). **`on failed:`·`on blocked:`의 목적지에는 `requires:`를 붙이지 않는다** — 막힘 경로가 보드 상태에 잠기면 막혔을 때 갈 곳이 없다(T4.3 검토에서 plan-verifier `report requires: in_review`가 그 함정이었다; `templates.test.mjs`가 지킨다). 파서는 서버 전용(`src/server/agents/steps.ts`). 시드 스크립트는 본문 전체를 `Template.body`에 넣되, `agents/*.md`는 저장 전에 파싱을 한 번 돌려 형식 오류를 시드 시점에 잡는다.

**조절 다이얼은 단계 입도 하나.** 시작값: pm·plan-verifier·feature-scout는 3–5단계, dev·doc-auditor는 `start`/`plan`(또는 `audit`)/`implement`/`verify`/`report`의 굵은 단계. G1이 떨어지면 단계를 더 굵게 합치거나 빠진 분기를 쓰고 다시 잰다. 본문을 파일로 주는 방향의 다이얼은 **없다**.

**Free 파이프라인.** Free는 plan-verifier·doc-auditor가 없으므로 runbook의 4단계(독립 검증)·8단계(문서 감사)가 빠진 판이 필요하다. `render.mjs`에 조건이 없으므로 private 템플릿에 `CLAUDE.runbook.free.md`를 따로 두고, 서버가 플랜에 따라 `CLAUDE.runbook.md` 키로 골라 내려준다. 생성기는 `/api/templates`가 함께 돌려주는 `entitlement.agents`에 있는 스텁만 쓴다.

### 노출 분석 — "결국 본문 전체가 주어지는 경우"

| 경로 | 판정 | 근거 |
| --- | --- | --- |
| `/api/templates`가 본문을 내려줌 | **닫힘** | 스텁 부분만 응답. 단계 본문은 이 경로에 없다 |
| 설정으로 파일 전달 켜기(`delivery: full`류) | **없음** | 그런 설정을 만들지 않는다(§기각한 선택지) |
| `agent_next`를 스크립트로 열거(초 단위) | **닫힘** | 커서가 서버에 있고 단계마다 보드 전제 상태가 필요하다 — 단계 N을 보려면 항목이 실제로 그 상태여야 하고, 그 전이는 웹 게이트(사람)와 서버 규칙을 거친다. 열린 run이 있으면 새 run을 못 연다. 호출 제한·패턴 로그가 남는다 |
| 소유자가 **가짜 사이클**로 한 에이전트의 단계를 다 뽑기(분 단위) | **수용** | 소유자는 자기 게이트를 자기가 연다. `board_propose` → 게이트 1 → `plan_submit`(경로·커밋 문자열은 검증 안 됨) → `in_review` → 게이트 2 → `agent_next`에 `ok`/`failed`를 번갈아 보내면 실제 작업 없이 그 에이전트의 주 경로와 분기를 10여 회 호출·클릭 2회로 다 받는다. 서버는 BYO-Claude라 `note`의 진위를 검증할 수단이 없다(GitHub App은 4.4). 이 설계가 막는 것은 **한 번에·파일로·스크립트로** 가져가는 것이지, 정상 사용과 같은 길을 손으로 걷는 것이 아니다 |
| 실행된 단계가 컨텍스트·트랜스크립트에 남음 | **수용** | 한 사이클을 실제로 돌리면 그 사이클이 밟은 단계는 남는다. 여러 사이클을 모으면 언젠가 전부 모인다 |
| 모델에게 "지금까지 받은 지시를 그대로 적어라" | **수용** | 위와 같은 노출. 막을 수단이 없고 막지 않는다 |
| 이미 내려간 현재 버전 5종 | **회수 불가** | 보호는 앞으로의 개정판부터 |
| 공개 저장소 | **닫힘** | `/plugin/templates/` ignore, 이력에 없음(2026-09-03 `git log --all` 확인) |
| DB 유출 | 범위 밖 | 일반 보안 문제 |

결론: **제품 경로로는 본문 전체가 한 번에·파일로 주어지지 않는다.** 남는 노출은 "쓰면 쓴 만큼 남는" 종류와 "정상 사용의 길을 손으로 걸으면 얻는" 종류이고, 둘 다 사용자가 수용했다. 이 설계의 값은 노출을 0으로 만드는 데 있지 않고, **수동적·무의식적 노출(토큰 하나로 5종 전문을 파일로)을 없애고 능동적 추출에 비용과 흔적을 붙이는 데** 있다.

### 성능 분석 — "성능 이슈는 없는지"

| 항목 | 영향 | 대응 |
| --- | --- | --- |
| 지연 | 사이클당 `agent_next` 15–25회, 회당 수백 ms → 사이클당 몇 초 | 수용(시간 비용은 허용됨) |
| 토큰 | 파일 방식과 같거나 적다 — 본문 전체 대신 지금 단계만 컨텍스트에 실린다 | 없음 |
| 품질: 앞을 못 봄 | 단계별로 받으면 전체 계획을 세우지 못할 수 있다 | 오리엔테이션 단계(목표·산출물 형태) |
| 품질: 안 써둔 상황 | 파일 방식에선 본문을 읽고 스스로 대처하던 상황이, 단계에 분기가 없으면 막힌다 | `outcome` 분기(`on failed`·`on blocked`)를 쓴다. v1 dev의 회귀는 여기서 드러난다 — G1의 기준 ①·② |
| 품질: 긴 구현 중 이탈 | 파일 방식의 고질 문제(본문을 잊음). 단계 방식이 오히려 낫다 | 검증 단계 기록을 서버 규칙으로 요구(`report_submit` 벽) |
| 컴팩션 도중 단계 유실 | 현재 지시를 잃는다 | 스텁(시스템 프롬프트)이 남으므로 `outcome` 없이 `agent_next`를 다시 불러 현재 단계를 받는다 |
| 서버 다운 = 파이프라인 정지 | 파일 방식에선 오프라인에서도 에이전트가 돌았다 | 가동 알림 추가(무료 티어 uptime 체크). 로컬 개발은 `HARNESS_TEMPLATES_DIR` 우회 유지 |

설계 안에 품질을 깎는 장치는 없다. 남는 것은 **분기를 얼마나 잘 써두느냐**이며 그것을 G1이 잰다.

### 운영자 비용

- 돈: ≈ 0. 사이클당 MCP 호출 ~25회 추가와 작은 DB 읽기. Vercel·Neon 무료 티어 안.
- 노동: 초기 ~1주(권한 코어 2일, `agent_next`·형식·생성기 3일, 벽·접점 2일). 이후 템플릿 개정은 "단계와 분기를 쓰는 일"이 된다 — 파일 한 덩어리를 고치는 것보다 손이 더 간다.
- 운영: 서버 가동 = 파이프라인 가동. 가동 알림 하나가 필요하다.

### 벽 — 서버가 강제하는 지점

| 벽 | 지점 | 규칙 |
| --- | --- | --- |
| 프로젝트 수 | `createProject`(`src/fsd/features/create-project/api/create-project.server.ts:12`) | 소유 프로젝트 수 ≥ 상한이면 폼 오류 + 문구 |
| 백로그 수 | `addBacklogItem`(`src/fsd/features/edit-backlog/api/edit-backlog.server.ts:13`) | 미제거 항목 수 ≥ 상한이면 폼 오류 |
| 워크스페이스 수 | `prismaToolDeps.projectSync`(`src/server/mcp/deps.ts:8`) | `workspaces.length` > 상한이면 거부(사유) → `/harness:init`이 그 사유를 그대로 보여준다 |
| 프로젝트 잠금(웹) | `src/server/auth/guard.ts` — 새 `requireProjectWrite(slug)` | 잠긴 프로젝트의 쓰기 서버 액션(백로그 편집·게이트·토큰 발급) 거부. 읽기 화면은 `requireMember` 그대로 |
| 프로젝트 잠금(MCP) | `makeVerifyToken`(`src/server/mcp/auth.ts`)·`templatesFor`(`src/server/templates.ts:11`) | 토큰이 유효해도 프로젝트가 잠겼으면 401 + 사유 |
| 이력 창 | `getWithHistory`·`latestBoardWithEvents`(`src/server/pipeline/board.ts:34,63`) | 플랜 창 밖의 이벤트·보고는 응답에서 제외 |
| 에이전트 종류 | `agent_next`·`templatesFor` | 플랜 밖 에이전트는 단계도, 스텁도 안 준다 |
| 보고 선행 | `submitReport`(`board.ts:164`) | `actor ∈ roster` 이고 `AgentRunStep{verify, ok}`가 있을 때만 |

## 스펙 대비 변경점 — 스펙의 어느 항목을 어떻게 바꾸나

이 제안서가 승인되면 T4.12에서 스펙 본문을 아래대로 고친다.

| # | 스펙 | 이 제안서 | 이유 |
| --- | --- | --- | --- |
| C1 | Q7·§2.1: "Free 1 · Pro 5 · Team 무제한+멤버" | **Free / Pro / Max**, 멤버는 플랜 축이 아니라 4.3의 별도 기능. 상한 축을 프로젝트 하나에서 5축(프로젝트·워크스페이스·백로그·이력·에이전트)으로 | "Team"은 멤버 기능 없이는 팔 게 없다. 개인 사용자에게 Pro 위 단계가 필요하고, 그 차이는 무제한 |
| C2 | §2.1 "무료로 두는 것: 플러그인 저장소(템플릿·생성기·스킬)" · Q8 "플러그인 저장소 공개" | 생성기·스킬·**스텁**은 공개, **에이전트 본문은 비공개이며 파일로 내려가지 않는다**. 템플릿 원문은 private 저장소 + DB | 본문이 서비스의 실체다. "스킬을 베껴도 서비스는 못 베낀다"는 논리가 본문에는 안 맞는다(본문을 베끼면 로컬 파일 파이프라인이 그대로 선다) |
| C3 | 4.1 Polar 상품 + 웹훅 → `Subscription` | `Subscription` 모델만 먼저(수동 부여). Polar·웹훅·가격은 **이후 제안서** | 결제 없이도 상한과 본문 보호는 완성된다. 가격은 Polar 상품과 함께 정한다 |
| C4 | 4.2 "미구독·만료 → 401" | **"상한 초과로 잠긴 프로젝트 → 401 + 사유"**. Free가 영구라 미구독 상태는 없다 | 플랜 정의가 바뀐 결과 |
| C5 | §5 MCP 도구 표 | `agent_next` 추가(에이전트 전부, Phase 4) | 새 전달 방식 |
| C6 | §4 "사용자 저장소에 물질화되는 것" — `.claude/agents/*.md` = 정의 본문 | = **스텁**(역할·규칙·구동 규칙). 절차는 서버 | 〃 |

## 기각한 선택지 (되살리지 않는다)

| 선택지 | 기각 이유 |
| --- | --- |
| `agent_brief` — 첫 호출에 절차 전체를 한 번에 내려주기 | 한 번 부르면 본문 전체가 컨텍스트에 실린다. 노출이 파일 방식과 같고, 긴 구현 중 이탈 문제도 그대로 |
| 무상태 커서(`agent_next({after, outcome})`) | 스크립트가 `after × outcome`을 몇 초 만에 열거한다. "모든 분기를 밟아야 한다"는 처음 판단이 틀렸다 — 커서를 서버로 옮기고 단계에 보드 전제를 걸어야 열거가 막힌다 |
| `delivery: full` — 설정으로 본문을 파일로 주는 대안 경로 | 본문 전체를 준다는 뜻이다. 그 경로가 존재하는 순간 보호가 무의미해진다. 비교 실측(G1)은 테스트 프로젝트에 손으로 놓은 파일로 한다 |
| 템플릿 안 조건 분기(`render.mjs` 확장) | 렌더러를 키우기보다 플랜별 파일을 서버가 고르는 편이 단순하다 |

## Proposal — 태스크 분해

배치 순서는 **A(권한 코어) → B(전달 방식) → G1(실측 게이트) → C(벽) → D(접점·문서)**. B와 C는 코드로는 독립이지만 G1이 벽보다 먼저여야 한다: G1은 파일 방식과 스텁 방식을 같은 규칙 아래서 비교하는데, `report_submit`의 verify 선행 벽(T4.6)이 켜져 있으면 파일 방식 dev는 verify 기록을 남길 수 없어 보고 자체가 막힌다. 그래서 벽은 전부 G1 뒤에 세운다.

### Batch A — 권한 코어

#### T4.1 `packages/core/entitlement.mjs` — 플랜 정의와 판정 (스펙 4.2 · 선행: 없음)

순수 모듈. 의존성 0. `plugin/lib`로 동기화된다(`sync:plugin-lib`가 `packages/core/*.mjs` 전부를 복사) — 매트릭스는 공개돼도 되는 정보다.

- [x] `PLANS = ["free","pro","max"]`, `LIMITS[plan] = {projects, workspaces, backlog, historyDays, agents}` (무제한 = `Infinity`). `agents`는 고정 4역 중 허용 집합만 담는다 — Free `["pm","feature-scout"]`, Pro·Max `REPORT_AGENTS` 4종. dev는 `agents`에 넣지 않는다: 어느 dev가 허용되는지는 roster와 `workspaces` 축이 정한다(아래 `allowsAgent`).
- [x] `activeProjectIds(projects: {id, createdAt}[], plan) → Set<id>` — `createdAt` 오름차순 앞 N개, 동률은 id.
- [x] `allowsAgent(plan, agent, roster)` — `agents`에 있거나 roster(wsId 순 `Workspace.agent[]`)의 앞 `workspaces`개 안에 있으면 허용. 플랜을 내려 roster가 상한을 넘으면 뒤쪽 dev부터 닫힌다.
- [x] `withinLimit(plan, axis, count)` — `count <= LIMITS[plan][axis]`. 추가 전 검사는 `현재 수 + 1`, `project_sync`처럼 "N개로 맞춘다"는 N.
- [x] `historyCutoff(plan, now) → Date | null`.
- [x] `entitlement.test.mjs` — 경계값(0·N·N+1), Free 에이전트 집합, `Infinity`, 동일 `createdAt` 타이브레이크(id), 입력 불변, 미지의 plan·axis는 throw. 16건.
- [x] `npm run sync:plugin-lib`, `npm run check`(check-plugin-lib 포함).

#### T4.2 `Subscription` 모델·플랜 해석·수동 부여 (스펙 4.1 전반 · 선행: T4.1)

- [x] `prisma/schema.prisma`: `model Subscription { id, userId @unique, plan String, source String @default("manual"), note String?, createdAt, updatedAt; user User }`, `User.subscription Subscription?`. **`enum Plan` 대신 `String`** — `BoardItem.status`가 `String // transitions.mjs STATUSES`인 것과 같은 규칙으로, 값의 출처를 `packages/core`(`PLANS`) 하나로 둔다. 서버는 `isPlan`으로 읽고 미지의 값은 free로 본다. Polar 필드(`status`·`currentPeriodEnd`·외부 id)는 넣지 않는다 — 이후 제안서에서 추가 마이그레이션.
- [x] `npm run db:migrate -- --name subscription` → `20260903040038_subscription` (Neon 개발 브랜치, 2026-09-03). `migrate dev`가 클라이언트를 재생성하지 않아 `prisma generate`를 따로 돌렸다.
- [x] `src/server/entitlement.ts`(server-only): `planForUser(userId)`(행 없음 → `free`), `planForProject(projectId)`(owner 멤버의 플랜), `projectAccess(projectId) → {plan, locked: boolean, reason?: string}`(T4.1 `activeProjectIds`로 판정), `limitsForProject(projectId)`.
- [x] `scripts/grant-plan.ts <login> <plan> [note]` — upsert. `package.json`에 `plan:grant`. login이 unique가 아니라(githubId만 unique) 0명·2명 이상이면 실패한다.
- [x] 로컬 DB에 본인 계정 `max` 부여 (2026-09-03). (외부 사용자 `pro`는 배포 DB에서, 실측 뒤.)
- [x] 이 파일은 쿼리 배선뿐이라 단위 테스트를 두지 않는다 — 판정은 전부 T4.1에서 테스트하고, 배선은 G1과 Free 벽 실측(§Verification Plan)이 확인한다. owner 해석은 `ProjectMember.role = "owner"` 한 명을 전제로 한다(멤버는 4.3).

### Batch B — 에이전트 전달 방식

#### T4.3 템플릿 단계 형식과 파서 (스펙 §9 · 선행: 없음)

- [x] `src/server/agents/steps.ts`: `splitTemplate(body) → {stub, steps: Step[]}`. **`Map`이 아니라 순서 있는 배열** — 첫 원소가 진입 단계, 조회는 `findStep(parsed, id)`. `Step = {id, requires, body, next: string[], onFailed?, onBlocked?}`. 첫 `## step:` 앞 = stub. `requires:`·`next:`·`on failed:`·`on blocked:`만 인식, `next:`는 `a | b` 후보 목록, 펜스 안은 무시. 알 수 없는 지시어·`next` 누락·중복 id·없는 id 참조·`requires`에 모르는 이름(허용 집합 `REQUIREMENTS` = `STATUSES` ∪ {`verify-ok`, `can-propose`})은 `TemplateFormatError`. `seed-templates.ts`가 `agents/*.md`는 저장 전에 파싱을 돌린다(시드 시 실패, 서빙 시 500 아님).
- [x] `steps.test.ts` 15개(`npm run test:web`): 단계 0개 본문(`stub === body`), 분기 해석(후보 목록·`on failed`·`on blocked`·`requires` 둘), 오류 5종(알 수 없는 지시어·중복 id·없는 id·모르는 `requires`·`next` 누락), 펜스 무시. 구현을 테스트보다 먼저 썼다(T4.1과 같은 순서 위반).
- [x] private 저장소 5종 개정. 실제 입도: `pm` start/pick/propose/report(4), `plan-verifier` start/read/verify/report(4), `feature-scout` start/research/report(3), `doc-auditor` start/audit/report(3), **`dev` start/plan/implement/verify/report/hold(6)** — 제안의 5에 `hold`를 더했다. implement/verify가 막히거나 실패했을 때 "보고서 + `report_submit` + `on_hold` 전이"를 한 단계로 묶어야 홀드가 보드에 남는다. dev `start`는 `next: implement | plan`으로 보드 상태에 따라 갈라진다. 모든 스텁의 `tools:`에 `agent_next`, 스텁마다 "How you work" 절(첫 호출 규칙·outcome 세 값의 뜻·`done: true`까지 반복·자리를 잃으면 outcome 없이 호출). 스텁 상한 110줄(dev 102줄 — 편집 범위·readOnly·Never·증거 없는 상태 금지는 스텁에 남겼다).
- [x] `CLAUDE.runbook.free.md` — 본문 전체를 복사하고 에이전트 표(`pm`·`feature-scout`만)·4단계(메인 루프가 카탈로그 경로로 직접 검토, 검증 기록 없음)·8단계(scouting-log는 메인 루프가 적는다 — scout에 쓰기 도구가 없다)만 바꿨다.
- [x] `plugin/templates/templates.test.mjs` 9개 — `npm run test:templates`를 `node --import tsx --test`로 바꿨다(파서가 `.ts`). 단계 그래프(진입 `start`, `done` 도달)·`requires ⊂ REQUIREMENTS`·dev 분기 5개·스텁 규칙(단계 없음·`agent_next`·첫 호출 문구·110줄)·비에이전트 템플릿은 단계 0·free runbook 내용·**outcome 어휘와 지시어 1:1 + 막힘 목적지 무조건**(검토에서 추가).
- [x] 자체 검토(사용자 위임, 2026-09-03). 고친 것: ① plan-verifier `report requires: in_review` 제거 + `start`에 `on blocked: report` — 항목이 없거나 `in_review`가 아니면 보고 단계에 못 가던 함정. ② doc-auditor `start`·feature-scout `start`/`research`에 `on blocked: report`와 막힘 조건 문장 — 스텁은 `blocked`를 정의하는데 갈 곳이 없었다. ③ dev `start`의 막힘 출력 한 줄(`Nothing to do: [KEY] — …`), `plan`의 도구 오류 뒤 출력, `hold`의 "verify 출력(돌렸다면)", `start`의 중복 읽기 정리(backlog·template·knowledge는 plan/implement가 읽는다), `hold`의 `requires: implementing` 제거(위 규칙). ④ pm `report`가 pick 단계의 막힘 사유(날짜 없음·배정 불가)도 다루도록. ⑤ runbook 둘의 3·6단계 "**with the item key**" — dev 스텁이 디스패치에서 키를 받는다고 하는데 runbook이 키를 안 줬다. ⑥ free runbook 4단계에 `reconciling-proposals-with-codebase` 스킬 복원. ⑦ `seed-templates.ts`가 CRLF를 LF로 정규화(autocrlf 작업본). 남긴 것(알려진 한계): 공유 문서 `docs/plans/verification-paths.md`·`docs/agents/README.md`가 plan-verifier·doc-auditor를 언급한다 — Free 사용자에게도 내려간다. T4.5의 생성기 필터가 스텁만 거르므로 문서 쪽은 Free판을 따로 두거나 문구를 조건 없이 읽히게 고쳐야 한다(T4.5에서 결정).
- [x] private 저장소 커밋(`d27e614`, 푸시 안 함) + `npm run seed:templates`(11개, 2026-09-03). 시드가 `plugin/templates/.git/`을 언어로 걷는 버그가 드러나 고침(점 디렉터리 제외, `.md`만) — 먼저 들어간 `.git` 행 18개는 지웠다. **T4.5 전까지의 노출:** `/api/templates`는 아직 본문 전체(단계 포함)를 준다. 공개 저장소 변경은 파서·테스트·시드 스크립트·`package.json`.

#### T4.4 `agent_next` 도구 (스펙 §5 · 선행: T4.2, T4.3)

- [x] `prisma/schema.prisma`: `model AgentRun { id, projectId, agent, key String?, tokenId, stepId, openedAt, closedAt?; steps AgentRunStep[]; @@index([projectId, agent, key, closedAt]) }`, `model AgentRunStep { id, runId, stepId, outcome, note String?, at }`. 마이그레이션 `agent-run`.
- [x] `src/server/agents/next.ts`: `agentNext(projectId, tokenId, input) → ServerResult<{step, instruction, done}>`. 순서: 플랜·에이전트 허용 → 열린 run 조회 → (없음) start 단계 + run 생성 / (`outcome` 없음) 현재 단계 재전송 / (있음) 다음 단계 계산 → `requires` 검사(보드 최신 상태 = `latestBoard`, `verify-ok` = 같은 run 또는 같은 (project,key,agent)의 `verify`/`ok` 스텝 존재) → 통과 시 `AgentRunStep` 기록 + `stepId` 갱신 + 렌더(`renderTemplate` + `buildVars`/`buildWorkspaceVars`를 서버에서) → `done` 단계면 `closedAt`.
- [x] 호출 제한: 최근 10분 `AgentRunStep` 수(tokenId 기준) ≥ 60이면 거부(사유). 한 run에서 `requires` 실패가 10회 이상이면 `console.warn` 한 줄. run 닫힘 규칙(§결정 사항)은 `transition`이 `done`·`on_hold`·폐기로 갈 때 같은 트랜잭션에서 처리.
- [x] `src/server/mcp/tools.ts`: `AGENT_TOOL_NAMES`에 `agent_next`, 입력 스키마(zod), `ToolDeps.agentNext`. `deps.ts` 배선. `tools.test.mjs`는 상수를 따라가므로 통과해야 한다(등록 누락이면 실패).
- [x] `src/server/agents/next.test.ts` — deps를 가짜로 두고 전이표를 검사: start→plan(planning 아니면 고정 문구), start의 후보 목록(`implementing`이면 implement, `planning`이면 plan), `outcome` 없음 = 재전송, `on failed`·`on blocked` 분기, verify 없이 report 요청 시 거부, **닫힌 뒤: outcome 없는 호출 → 새 run, outcome 있는 호출 → `{done: true}`**(§결정 사항).
- [x] 렌더 순서: DB의 본문을 먼저 `splitTemplate`으로 나누고(미치환 상태로 파싱), 고른 단계의 `body`만 `renderTemplate`한다 — 스텁이 받은 것과 같은 vars(`buildVars`/`buildWorkspaceVars`).
- [x] 서버 렌더에 필요한 vars(`project`, `ws`, `roster_table`, `board_branch`)는 `buildVars`가 이미 만든다 — `harness.json`이 아니라 DB의 `Project`·`Workspace`에서 같은 형태를 조립하는 어댑터 하나(`src/server/agents/vars.ts`).
- [x] 구현 기록(2026-09-03, 자체 검토 뒤 확정). 체크리스트와 다른 점: ① `agentNext(deps, scope, input)` — DB를 모르는 규칙 함수에 `NextDeps` 13개를 주입한다(`runs.ts`가 Prisma 구현). `ToolDeps.agentNext(projectId, tokenId, input)`은 체크리스트대로. ② 원장(`AgentRunStep`)은 outcome이 실린 호출을 거부·제자리 포함 **전부** 기록한다 — 거부 호출도 호출 제한에 세어져야 상태를 바꿔가며 본문을 캐는 값이 비싸진다. 열기·재전송은 새 본문을 드러내지 않으므로 세지 않는다. ③ `AgentRun.refused Int` 열 — 10회 경고 카운터. ④ key 규칙은 에이전트 이름이 아니라 템플릿에서 파생: 보드 상태·`verify-ok` `requires`가 하나라도 있으면 key 필수, 없으면 key 거부(그래서 plan-verifier도 key를 받는다 — 스텁이 이미 그렇게 부른다). ⑤ `verify-ok`는 "지금 ok로 보고하는 verify"도 인정한다 — 그 호출에서 report가 열린다. ⑥ 전진은 `stepId` CAS(`updateMany where stepId=from and closedAt is null`); 어긋나면 `stale:` 거부. ⑦ 템플릿 언어는 `Project.language`, 없으면 `en`. 거부 문구 고정: ``not open: step `implement` opens when the item is `implementing` (now `proposed`); …``.
- [x] 알려진 한계(잡지 않기로 함): **항목 소유 검사 없음** — 다른 dev의 key로 run을 열어도 서버가 막지 않는다. 노출은 아니다(같은 `dev.md` 단계가 나올 뿐)라 T4.6 벽에서 `board_transition`·`report_submit`과 함께 행위자 검사를 넣는다. **열린 run 유일성**은 인덱스로 강제하지 않는다(Prisma가 부분 유니크를 못 쓴다) — 동시에 두 번 열면 최신 run이 커서다. **언어 이중 조회**(`ko` 실패 → `en`)는 T4.5에서 `project_sync`가 language를 실어 닫혔다 — 폴백은 `project_sync` 전의 프로젝트를 위한 안전망으로 남는다.

#### T4.5 `/api/templates`·생성기·스킬 (스펙 Task 1.10 개정 · 선행: T4.3, T4.4)

- [x] `templatesFor`: 토큰 `select`에 `projectId` 추가 → `projectAccess`로 잠금 검사(잠김 → 401 + 사유) → `Template` 전부 읽되 `agents/*.md`는 `splitTemplate().stub`만, 플랜 밖 에이전트는 제외, `CLAUDE.runbook.md`는 플랜이 Free면 `CLAUDE.runbook.free.md`의 본문으로 대체(키는 그대로, `CLAUDE.runbook.free.md` 키 자체는 응답에서 뺀다). 응답 `{ templates, entitlement: { plan, agents } }`.
- [x] `src/app/api/templates/route.ts` — 응답 형태 변경 반영.
- [x] `plugin/bin/harness-init.mjs`: 응답에 `templates` 키가 없으면 "플러그인을 갱신하라"로 실패(옛/새 형태 혼동 방지). `.claude/agents/`는 `entitlement.agents ∩ (고정 3종 + config.scout + workspaces[].agent)`만 쓴다. Free에서 워크스페이스가 2개 이상이면 `project_sync`가 거부한 사유를 그대로 출력하고 중단.
- [x] `plugin/bin/harness-init.test.mjs` 갱신(응답 형태, Free/Pro 스텁 집합, 옛 형태 거부).
- [x] `plugin/skills/init/SKILL.md`: 재초기화 안내 한 단락 — 기존 프로젝트는 `/harness:init`을 다시 돌려야 스텁으로 바뀐다. 옛 본문 파일은 생성기가 덮어쓴다(`harness.lock.json`이 관리하는 파일이므로).
- [x] `plugin/README.md`·`docs/architecture/protocol.md`(도구 표 `agent_next` 행, "증거 제출 3종" 문단에 verify 기록 언급)·`docs/architecture/README.md`(템플릿 비공개 주석 갱신).
- [x] 구현 기록(2026-09-03). 체크리스트와 다른 점: ① 잘라 내는 규칙은 `packages/core/deliver.mjs`(`STEP_HEADING`·`stubOf`·`deliverable(rows, plan)`) 하나다 — 서버 `templatesFor`와 생성기의 로컬 우회로(`HARNESS_TEMPLATES_DIR` + `HARNESS_PLAN`, 기본 `max`)가 같은 함수를 쓰고, `steps.ts`의 파서도 같은 정규식을 가져다 쓴다(경계의 정의는 한 곳). 체크리스트의 `splitTemplate().stub`은 그래서 `stubOf`다. ② `entitlement.agents`는 플랜이 허용하는 **보고 에이전트**(`limitsFor(plan).agents`)이지 `∩ workspaces[].agent`가 아니다 — roster는 첫 init 때 서버에 없다(`project_sync`가 뒤에 온다). dev 스텁은 `harness.json`이 정하고, 워크스페이스 수는 생성기가 `withinLimit`으로 **파일을 쓰기 전에** 막는다(Free에 워크스페이스 3개 → `workspace cap reached on the free plan (1): harness.json has 3 workspaces. project_sync would refuse — …`, exit 1, 아무것도 안 씀). 서버 쪽 벽은 T4.7. ③ 상한 문구는 core의 `capReason(plan, axis)` 하나에서 나온다 — 잠금 사유(`projectAccess`)와 생성기 중단이 같은 문장으로 시작하고 T4.6·T4.7 벽도 이걸 쓴다. ④ `project_sync`가 `language?`를 받아 `Project.language`를 갱신한다(스킬 5단계가 `{ workspaces, language }`를 넘긴다) — T4.4의 언어 이중 조회 한계는 이걸로 닫혔다. ⑤ Free의 공유 문서는 그대로 내려간다 — 런북만 free 판이 있다. plan-verifier·doc-auditor를 언급하는 `docs/plans/verification-paths.md`·`docs/agents/README.md`는 Free 사용자에게도 간다(T4.3 자체 검토에서 미룬 결정): 문서를 플랜별로 갈라 두는 것보다 문구를 조건 없이 읽히게 고치는 쪽이 맞고 그건 private 저장소의 일이라 여기서 하지 않는다 — **알려진 한계**. ⑥ 다운그레이드 뒤 옛 스텁 파일은 디스크에 남고 lock에서만 빠진다(`skip(plan):` 한 줄). 뒤에 업그레이드하면 그 파일은 lock 밖이라 `refuse:` — `--adopt`로 받는다. ⑦ `plugin/README.md`는 없다 — 건너뛰고 `docs/conventions/product-copy.md` §15에 새 문구(`plan:`·`skip(plan):`·상한 중단·out-of-step)를 등록했다. ⑧ 호환: 새 플러그인이 옛 서버(평면 맵)를 만나면 "plugin and server are out of step — update the harness plugin."으로 멈춘다. 옛 플러그인이 새 서버를 만나면 첫 템플릿에서 "Template missing on server: en/agents/pm.md"로 멈춘다 — 서버 쪽에서 더 낫게 할 수 없다. ⑨ 테스트: `deliver.test.mjs`, `harness-init.test.mjs` 12개(가짜 `node:http` 서버로 `/api/templates` 경로를 실제로 탄다 — `execFileSync`가 부모 이벤트 루프를 막아 교착하므로 그 둘만 비동기 `execFile`), `tools.test.mjs`의 language 전달.

### G1 — 실측 게이트 (Batch C 착수 조건)

테스트 프로젝트 하나, **같은 백로그 항목**으로 두 번:

1. **파일 방식** — private 템플릿의 현재 판을 손으로 `.claude/agents/`에 놓고 한 사이클(pm → 게이트 1 → dev plan → 검증 → 게이트 2 → dev implement → 인수).
2. **스텁 방식** — `/harness:init`이 쓴 스텁만으로 같은 사이클.

| # | 기준 | 통과 조건 |
| --- | --- | --- |
| ① | 첫 행동 | 서브에이전트의 첫 도구 호출이 `agent_next`(스텁이 구동 규칙을 지키게 한다) |
| ② | 검증 선행 | 스텁: `report_submit` 전에 `AgentRunStep{verify, ok}`가 있다(원장). 파일: 트랜스크립트에서 verify 명령 실행이 보고보다 앞선다. 벽(T4.6)은 아직 꺼져 있으므로 둘 다 **자발적** 순서를 잰다 |
| ③ | readOnly | readOnly 경로에 쓰기 없음(`git status` + 트랜스크립트) |
| ④ | 보고 형식 | `docs/agents/<actor>/<KEY>.md`가 파일 방식과 같은 절 구성 |
| ⑤ | 토큰 | 트랜스크립트 토큰 사용량이 파일 방식 이하 |

전부 통과하면 Batch C. 하나라도 실패하면: 실패한 단계의 분기를 쓰거나 단계를 합친 뒤 **같은 항목으로 재실측**. **실측 결과(2026-09-04): ①②③ 통과, ④⑤ 실패 → 소유자가 ④⑤를 관찰 항목으로 낮추고 재실측 없이 Batch C 착수를 승인**(보고서 참조; F1 토큰 왕복·F2 제목 형식은 후속). 그동안 파일 방식으로 되돌리는 스위치는 만들지 않는다 — 배포 DB에 옛 본문을 시드하지 않으면 사용자는 어차피 스텁을 받는다. 결과는 `docs/test-reports/`에 남긴다.

### Batch C — 벽

#### T4.6 `report_submit` 벽 (스펙 불변식 8 · 선행: T4.4, G1)

- [x] `submitReport`: `actor`가 roster(고정 4종 + `workspaces[].agent`)에 없으면 거부. 항목이 `implementing`일 때 (project, key, actor)에 `AgentRunStep{stepId:"verify", outcome:"ok"}`가 없으면 거부(사유: "verify step not recorded"). `in_review`(main-loop 검증 라운드 보고)·`done`(인수 기록)에서는 verify 선행을 요구하지 않는다 — 예외는 actor 이름이 아니라 **상태**로 건다(이름 위장으로 못 지나간다). **T4.3에서 생긴 주의:** dev `hold` 단계는 verify가 `failed`/`blocked`로 끝난 뒤(또는 implement에서 verify 없이 막힌 뒤) `implementing` 상태에서 `report_submit`을 부른다. 벽을 "`verify`/`ok`"로 걸면 홀드 보고가 막힌다. 후보: (a) 벽을 "같은 run에 `verify` 기록이 있다(outcome 불문)"로 두고 implement에서 막힌 경우는 `on_hold` 전이 직전이므로 예외, (b) `AgentRun.stepId === "hold"`면 통과. **(a)를 고른다** — G1의 클린 사이클에서는 hold·거부가 0건이라(원장 4개 run 전부 `refused=0`, 모든 outcome `ok`) 실측이 어느 쪽도 밀어주지 않았다. 그래서 설계 근거로 고른다: (a)는 "이 run에서 verify를 시도했다"는 불변식을 커서 위치와 무관하게 표현하고, 단계 이름이 바뀌어도 깨지지 않으며, 이름 기반 예외를 만들지 않는다. (b)는 `AgentRun.stepId`(커서)에 결합해 단계 기계가 바뀌면 같이 흔들린다.
- [x] `src/server/pipeline/board-rules.ts`(순수)에 판정 추가 + 테스트.

#### T4.7 생성·추가·동기화 상한 (스펙 4.2 · 선행: T4.2)

- [x] `createProject`: `requireUser` 뒤 소유 프로젝트 수 ≥ `LIMITS[plan].projects`면 `{error: "<플랜>은 프로젝트 N개까지 — Pro에서 열립니다"}`. 상한 검사와 생성은 한 트랜잭션(미결 상한과 같은 이유, `board.ts:71` 주석).
- [x] `addBacklogItem`: 미제거 항목 수로 같은 검사.
- [x] `prismaToolDeps.projectSync`: `workspaces.length > limits.workspaces`면 `{ok:false, reason}` — 도구 응답에 사유.
- [x] 각 서버 액션 테스트(`src/fsd/features/*/api/*.test.ts`가 있으면 거기, 없으면 board-rules 식 순수 판정 함수로 뽑아 테스트).

#### T4.8 프로젝트 잠금 (스펙 4.2 · 선행: T4.2)

- [x] `guard.ts`: `requireProjectWrite(slug)` = `requireMember` + `projectAccess(...).locked`면 오류 반환(리다이렉트가 아니라 폼 오류 — 화면은 읽기 상태로 남는다). 쓰기 서버 액션(`edit-backlog`·`review-gate`·`manage-token`)이 이걸 쓴다.
- [x] `makeVerifyToken`: 토큰 조회 뒤 `projectAccess` — 잠김이면 `undefined`(mcp-handler가 401). **사유 전달 가능 여부는 실측**: mcp-handler 2.1.1이 `verifyToken`의 거부 사유를 응답에 싣는 방법이 없으면, 401은 그대로 두고 `project_get`을 잠긴 프로젝트에서도 허용해 `{locked: true, reason}`을 돌려주는 것으로 사유를 전달한다. 어느 쪽이었는지 Verification Results에 적는다.
- [x] 결재함(`src/fsd/pages/project-inbox`): 잠긴 프로젝트면 승인 버튼 대신 잠금 칩 + 사유.
- [x] 프로젝트 목록(`project-list`)·프로젝트 레이아웃: 잠긴 프로젝트 표시(배지) + 상단 배너 한 줄.

- [x] 구현 기록(2026-09-04). 체크리스트와 다른 점: ① **`report_submit`의 행위자 집합에 `main-loop`을 더했다.** 체크리스트는 "고정 4종 + `workspaces[].agent`"였지만 `main-loop`은 `.claude/agents` 정의가 없으면서도 **보고 행위자다** — 검증 라운드 기록과 인수 기록을 낸다(`protocol.md`의 `report_submit` 행, 템플릿 `docs/agents/README.md`의 행위자 표, G1 Run B 원장의 `main-loop` 보고). 빼면 런북 7단계가 막힌다. ② **T4.8의 잠금을 인증이 아니라 도구 층에 걸었다.** 체크리스트 첫 줄은 `makeVerifyToken`에서 `undefined`를 돌려 401을 내는 것이었으나, 같은 항목이 요구한 실측 결과 mcp-handler 2.1.1은 **401에 사유를 실을 수 없다**. 인증에서 막으면 에이전트는 이유도 모르고 `project_get`으로 물어볼 수도 없어, 체크리스트가 예비로 적어 둔 대체 경로(=`project_get`이 `{locked, reason}`을 답한다)조차 성립하지 않는다. 그래서 인증은 통과시키고 상태를 바꾸는 도구 5종 + `project_sync`를 `guardLocked`로 막았다(읽기는 열어 둔다). ③ **`latestBoardWithEvents`에는 `since` 인자를 두지 않았다.** 체크리스트는 두 함수에 다 넣으라 했으나 결재함은 창 없이 읽어야 하고, 넘기지 않는 규율보다 **넘길 수 없는 형**이 세다 — 창을 받는 건 `getWithHistory` 하나다. ④ 상한 문구는 새 `capError(plan, axis, currentCount)`가 `capReason`을 감싸 한 곳에서 나온다. 상한 검사와 생성은 한 트랜잭션이다(동시 요청이 둘 다 "여유 있음"을 읽는 것을 막는다). ⑤ 잘린 이력 한 줄은 `hasHistoryBefore`가 **실제로 밀려난 행이 있을 때만** 띄운다. ⑥ `revokeToken`은 잠겨도 막지 않는다 — 잠금은 "더 만들지 못한다"이지 "샌 토큰을 못 막는다"가 아니다. ⑦ 테스트: `board-rules.test.mjs` 벽 6건(행위자·verify 선행·상태 우선순위), `entitlement.test.mjs` `capError` 4건, `tools.test.mjs` 잠금 3건.

#### T4.9 이력 창 (선행: T4.2)

- [x] `getWithHistory`·`latestBoardWithEvents`에 `since?: Date` 인자. 호출 지점 중 **항목 화면(`board-item`)과 `board_get`만** `historyCutoff(plan)`을 넘긴다. 결재함은 창 없이 읽는다 — 게이트 판단(검증 기록 유무)이 창에 가려지면 안 된다. `report_submit` 벽의 verify 조회는 `AgentRunStep`을 보므로 창의 영향을 받지 않는다.
- [x] 항목 화면에 "30일보다 오래된 이력은 Pro에서 열립니다" 한 줄(잘린 경우에만).

### Batch D — 접점·문서

#### T4.10 `/billing` (선행: T4.2)

- [ ] `src/app/(app)/billing/page.tsx` → `src/fsd/pages/billing`(FSD: pages 슬라이스, 공개 API `index.server.ts`). 내용: 현재 플랜, 매트릭스 표(T4.1 `LIMITS`에서 렌더 — 표와 코드가 어긋나지 않게), "가격·결제는 준비 중" 한 줄. 버튼 없음.
- [ ] `src/fsd/shared/routes`에 `billing` 경로 추가.

#### T4.11 문구·배지 (선행: T4.7, T4.8, T4.10)

- [ ] 상한 오류 문구는 한 곳(`src/fsd/shared/lib/entitlement-copy.ts`)에서 — 프로젝트 생성·백로그 추가·`project_sync` 사유·잠금 배너가 같은 문장을 쓴다.
- [ ] `app-header`: `loadHeaderUser`에 플랜 추가, 배지(`Free`/`Pro`/`Max`) → `/billing` 링크.
- [ ] `npm run verify:fsd`·`npm run test:architecture` 통과.

#### T4.12 스펙·아키텍처 문서 (선행: 전부)

- [ ] 스펙 §2.1·Q7·Q8·Phase 4 표·§4·§5를 §"스펙 대비 변경점" C1~C6대로 고친다. Phase 4 표는 4.1을 "4.1a `Subscription`·수동 부여(이 제안서)" / "4.1b Polar(이후)"로 나눈다.
- [ ] `docs/architecture/system-overview.md`: 에이전트 본문의 위치(DB·서버 렌더), `AgentRun` 원장. `docs/architecture/invariants.md`: "보고는 verify 기록 뒤" 한 줄.
- [ ] 이 문서를 `completed/`로 옮기며 `2026-MM-DD-` 접두를 붙인다(README 규약).

## Affected Files

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `packages/core/entitlement.mjs` (+test) | add | 순수 판정. `plugin/lib`로 복사됨 | low — 매트릭스는 공개 정보 |
| `prisma/schema.prisma`, `prisma/migrations/*` | update/add | `Subscription`·`AgentRun`·`AgentRunStep` | medium — 마이그레이션 2개, 전부 추가만(열 삭제 없음) |
| `src/server/entitlement.ts` | add | 플랜 해석·잠금 판정의 단일 지점 | low |
| `scripts/grant-plan.ts`, `package.json` | add/update | 수동 부여 | none |
| `src/server/agents/{steps,next,vars}.ts` (+tests) | add | 파서·커서·렌더 어댑터 | medium — 새 계약 |
| `src/server/mcp/{tools,deps}.ts`, `tools.test.mjs` | update | `agent_next` 등록·배선 | low — 테스트가 누락을 잡는다 |
| `src/server/mcp/auth.ts` | update | 잠금 시 거부 | medium — 사유 전달은 실측 |
| `src/server/templates.ts`, `src/app/api/templates/route.ts` | update | 스텁만·플랜 runbook·`entitlement` 응답 | medium — 계약 변경, 생성기와 같은 커밋 |
| `src/server/pipeline/board.ts`, `board-rules.ts` (+test) | update | `submitReport` 벽, 이력 창 인자 | medium — 파이프라인 규칙 변경 |
| `src/server/auth/guard.ts` | update | `requireProjectWrite` | low |
| `src/fsd/features/{create-project,edit-backlog,review-gate,manage-token}/api/*` | update | 상한·잠금 검사 | low |
| `src/fsd/pages/{project-inbox,project-list,board-item}` | update | 잠금 칩·배지·이력 문구 | low |
| `src/fsd/pages/billing`, `src/app/(app)/billing/page.tsx`, `src/fsd/shared/routes` | add | 새 화면·경로 | low — 라우팅 추가만 |
| `src/fsd/shared/lib/entitlement-copy.ts` | add | 문구 단일화 | none |
| `src/fsd/widgets/app-header/*` | update | 플랜 배지 | low |
| `plugin/bin/harness-init.mjs` (+test), `plugin/skills/init/SKILL.md`, `plugin/README.md` | update | 새 응답 형태·스텁 집합·재초기화 안내 | medium — 옛 생성기 호환 없음(명시적 실패) |
| `scripts/seed-templates.ts` | update | 에이전트 템플릿 파싱 검증 후 저장 | low |
| private `Sangeok/harness-templates` | update | 5종 단계화 + runbook Free 판 | 이 저장소 밖 — 커밋·시드로 반영 |
| `docs/investigations/active/harness-platform.md`, `docs/architecture/{README,protocol,system-overview,invariants}.md` | update | C1~C6 반영 | none |

## Safety Analysis

이 제안서는 삭제가 없다. 위험은 **거부가 새로 생기는 지점**(상한·잠금·보고 벽)이 정상 경로를 막는 것과, 계약 변경이 옛 클라이언트를 조용히 깨는 것이다.

- 정상 경로 보호: 본인 계정은 Max로 부여하므로 상한에 걸리지 않는다. 외부 사용자는 Pro. Free는 아직 아무도 없다 — 벽은 Free 계정을 하나 만들어 G1 뒤에 별도로 밟는다(§Verification Plan).
- 보고 벽은 `implementing`에서만 verify 선행을 요구한다(`in_review`의 검증 라운드 보고, `done`의 인수 기록은 main-loop 몫이라 run이 없다). 예외를 actor 이름이 아니라 상태로 걸어 이름 위장으로 우회할 수 없고, 기존 클린 사이클의 `TransitionEvent` 8건은 그대로다.
- `/api/templates` 계약: 옛 생성기는 새 응답 형태를 받으면 명시적으로 실패한다(조용한 오동작 없음). 플러그인은 이 저장소에서 배포되므로 같은 커밋에 갱신.
- 마이그레이션은 추가만(새 테이블·`User`에 optional 관계). 기존 행에 기본값이 필요한 열이 없다.

확인한 항목:

- [ ] 앱 진입점과 라우팅 경계 — `(app)/billing` 추가, 기존 경로 변경 없음 (T4.10에서. A·B는 라우트를 더하지 않았다)
- [x] 정적 `import` / `export from` — FSD 공개 API(`index.server.ts`)로만 참조, `verify:fsd`로 확인 (A·B: 통과, 2026-09-03. `billing`은 T4.10에서 다시)
- [ ] barrel export(`index.ts`) 경유 참조 — `app-header`·`billing` 슬라이스 공개 API 갱신 (T4.10·T4.11에서)
- [x] 테스트와 스크립트 참조 — `tools.test.mjs`(등록 목록), `harness-init.test.mjs`(응답 형태), `check-plugin-lib`(entitlement 동기화), `seed-templates.ts` (전부 갱신됨. `check-plugin-lib`는 `deliver.mjs`도 본다)
- [x] 타입 선언 영향 — `ToolDeps`·`ProjectView`에 필드 추가(좁은 계약이 넓은 Prisma 행을 받는 방향은 유지) (`ToolDeps`에 `agentNext`·`projectSync(…, language?)`. `ProjectView`는 바뀌지 않았다 — language는 `agent_next`가 서버에서 읽는다)
- [x] 런타임 side effect — `agent_next`가 쓰는 `AgentRunStep`이 원장에 추가된다. `TransitionEvent`에는 손대지 않으므로 불변식 8의 "클린 사이클 8건"은 유지 (T4.4: `runs.ts`는 `AgentRun`·`AgentRunStep`만 쓴다. 기존 전이 테스트 그대로 통과)
- [x] API·외부 SDK 영향 — MCP 도구 1종 추가, `/api/templates` 응답 형태 변경(위), mcp-handler 401 사유 전달은 실측 (도구·응답 형태는 T4.4·T4.5에서. 401 사유가 클라이언트에 보이는지는 G1에서 잰다)
- [x] dynamic `import()`·`public/` 자산·localStorage — 해당 없음

## Approval

승인 메모:

- 2026-09-03 A·B·G1 승인(대화). 실행 결과: A·B 완료 → PR #8(`harness/phase-4-entitlement-core` → `dev`). C·D는 G1 뒤에 승인한다.
- 승인은 A·B·G1까지와 C·D를 나눠 줄 수 있다. G1 결과를 본 뒤 C·D를 승인하는 편이 안전하다(스텁 방식이 실패하면 벽·접점의 문구도 달라진다).
- 이 문서의 파일명은 README 규약대로 날짜 접두 없이 `active/harness-platform-phase-4-entitlement.md`다(대화에서 언급한 `2026-09-03-…`은 `completed/`로 옮길 때 붙는다).

## Execution Plan

1. Batch A(T4.1 → T4.2): 순수 모듈 → 스키마·마이그레이션 → 플랜 해석 → 본인 계정 Max 부여.
2. Batch B(T4.3 → T4.4 → T4.5): 파서 → private 템플릿 단계화·시드 → `agent_next` → `/api/templates`·생성기·스킬.
3. G1 실측: 파일 방식 1회, 스텁 방식 1회, 5기준. 결과를 `docs/test-reports/`에.
4. Batch C(T4.6 → T4.7 → T4.8 → T4.9): 보고 벽 → 상한 → 잠금 → 이력 창. Free 계정으로 벽 실측.
5. Batch D(T4.10 → T4.11 → T4.12), 스펙·아키텍처 갱신.
6. 각 배치는 `harness/phase-4-<batch>` 브랜치, `dev`로 PR. 커밋은 요청 시에만.

## Verification Plan

실행할 검증:

```bash
npm test                    # packages/core (entitlement 포함) + plugin/bin (생성기)
npm run test:web            # src/**/*.test — steps, next, board-rules, tools 등록
npm run check               # lint + typegen + tsc + test:architecture + check-plugin-lib
npm run verify:fsd
npm run test:architecture
npx prisma migrate status   # 두 마이그레이션 적용 확인
npm run test:templates      # private 템플릿 5종 파싱·상태명 일치 (로컬 plugin/templates 있을 때)
npm run build               # dev 서버를 내린 뒤 (.next 공유)
```

검증 기준:

- 위 명령 전부 통과. 기존 실패는 없다(2026-09-03 `dev` 기준 전부 녹색) — 실패가 나면 전부 신규 실패다.
- G1 5기준 전부 통과(§G1). 실패 시 재실측 기록까지 남긴다.
- Free 계정 벽 실측: 프로젝트 2번째 생성 거부 문구, 백로그 11번째 거부, 워크스페이스 2개 `project_sync` 거부 사유가 `/harness:init` 출력에 나옴, Pro 부여 → 즉시 해제, Free로 되돌림 → 두 번째 프로젝트 잠김(읽기 가능, 게이트 불가, MCP 401), 31일 전 이벤트가 화면·`board_get`에서 빠짐(테스트 행의 `at`을 직접 과거로 돌려 확인).
- `report_submit`: verify 기록 없이 호출 → 거부. `in_review`의 main-loop 보고 → 통과. 클린 사이클 원장 `TransitionEvent` 8건 유지.
- `agent_next` 열거 시도: 항목이 `planning`인 상태에서 `outcome: ok`를 반복 호출 → `plan` 단계 뒤로 전진하지 않음(고정 문구), 61회째 거부.
- 노출 실측: `curl /api/templates`의 `agents/*.md` 값에 `## step:`이 없고 각 200행 미만(스텁 길이).

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm test` | Batch A: 66/66 pass (2026-09-03) | entitlement 16건 포함 |
| `npm run test:web` | Batch A: 95/95 pass (2026-09-03) | |
| `npm run check` | Batch A: pass (2026-09-03) | lint · typegen · tsc · architecture 13/13 · plugin/lib in sync |
| `npm run verify:fsd` | Batch A: pass (2026-09-03) | |
| `npm run test:architecture` | Batch A: 13/13 pass (2026-09-03) | `check`에 포함 |
| `npx prisma migrate status` | Batch A: "Database schema is up to date" (2026-09-03) | `20260903040038_subscription` 적용 |
| `npm run test:templates` | Not run yet | |
| Batch C: `npm test` | 86/86 pass (2026-09-04) | core `capError` 4건 포함 |
| Batch C: `npm run test:web` | 146/146 pass (2026-09-04) | board-rules 벽 6건 · MCP 잠금 3건 포함 |
| Batch C: `npm run check` | pass (2026-09-04) | lint · tsc · architecture 13/13 · plugin/lib in sync |
| `npm run build` | Not run yet | |
| G1 비교 실측 | **FAIL**, 소유자 수용 후 착수 (2026-09-04) | `docs/test-reports/completed/2026-09-04-phase-4-g1-stub-vs-file-acceptance.md`. ①②③ PASS(스텁 서브 4종 전부 첫 호출 `agent_next`, 두 방식 다 verify가 보고보다 앞, readOnly 무변경) · ④⑤ FAIL(보고서 제목 계층·문구 상이; 스텁 합계 토큰 10.24M vs 파일 9.35M, **+9.5%** — 원인은 `agent_next` 왕복, 생성 토큰만은 스텁이 근소히 적음). 소유자가 ④⑤를 차단 기준에서 관찰 항목으로 낮추고 F1·F2 추적을 조건으로 Batch C 착수를 승인 |
| Free 벽 실측 | Not run yet | |
| mcp-handler 401 사유 전달 | **불가** (2026-09-04 실측) | `withMcpAuth`가 `verifyToken`의 예외를 삼키고 `"Invalid token"`으로, `undefined`는 `"No authorization provided"`로 고정한다(`node_modules/mcp-handler/dist/index.js:155-163`). 사유 채널이 없다 → **대체 경로 채택**: 인증은 통과시키고 도구 층에서 사유와 함께 거부하며, `project_get`이 잠긴 프로젝트에서도 `{locked, reason}`을 답한다 |

## Risks and Rollback

잔여 리스크:

- **G1 실패** — 단계 방식이 파일 방식보다 못할 수 있다(특히 dev의 안 써둔 상황). 대응은 분기 추가·단계 합치기·재실측이고, 파일로 돌아가는 다이얼은 없다. 반복 실패 시 이 제안서를 `closed`로 닫고 원인을 적는다.
- **누적 노출** — 실제 사용이 쌓이면 단계 본문은 결국 사용자 컨텍스트에 다 남는다. 수용한 리스크. 개정판을 낼 때마다 보호가 다시 앞으로 간다.
- **서버 가동 = 파이프라인 가동** — 무료 uptime 체크 하나로 알림. 로컬 개발은 `HARNESS_TEMPLATES_DIR`.
- **mcp-handler 401 사유** — 전달 불가면 `project_get` 경유로 대체(T4.8에 명시).
- **템플릿 저작 비용 증가** — 단계·분기 형식은 파일 한 덩어리보다 손이 간다. 사용자가 감내하기로 함.
- **이력 창과 결재함** — 30일 창이 결재함의 판단(검증 기록 유무)을 가리면 안 된다. 결재함은 `TransitionEvent{note:"validation"}`을 창 없이 읽는다(T4.9에서 확인).

롤백 방법:

- 배치별 PR revert. 마이그레이션은 `prisma migrate` down 대신 되돌림 마이그레이션(테이블 drop)을 별도 커밋으로 — 추가만 한 스키마라 데이터 손실 없이 가능.
- `/api/templates` 옛 형태로 되돌리면 옛 생성기가 다시 동작한다. 단, 배포 DB의 `Template.body`가 단계 형식이면 옛 생성기는 단계 본문까지 파일로 쓴다 — **되돌릴 때는 시드도 옛 판으로 함께** 되돌린다(private 저장소 태그로 고정).
- `Subscription`·`AgentRun` 테이블을 남긴 채 코드만 되돌려도 동작한다(참조가 없어질 뿐).

## Completion or Closure Notes

완료 또는 닫힘 처리 후 `completed/`로 이동할 때 작성합니다.

완료 기록(`status: "completed"`일 때 작성):

- completed-at: TBD
- verification-summary: TBD
- implementation PR/commit: TBD
- changed files summary: TBD
- remaining follow-up: TBD (Polar·가격·랜딩 가격표 → 후속 제안서)

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
- [x] `stage: "approved"`라면 `approved-by`, `approved-at`, `approval-scope`가 모두 채워져 있다.
- [x] `proposal-size`는 `small` 또는 `standard`만 사용했고, standard 강제 조건에 해당하는 작업을 small로 낮추지 않았다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용하고, 본문 `Approval` 섹션에는 승인 조건과 참고 메모만 적었다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [ ] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 필요한 만큼 확인했다. (A·B 범위는 확인, 2026-09-03. 라우팅·barrel은 D 착수 시)
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [ ] 검증 실패가 있다면 기존 실패와 신규 실패를 구분했다. (실행 전)
- [x] 잔여 리스크를 명시했다.
- [ ] 완료 문서라면 `completed-at`, `verification-summary`, Completion or Closure Notes가 실제 수행 결과로 갱신되어 있다.
- [ ] 닫힌 문서라면 `closed-at`, `closed-by`, `closed-reason`, Completion or Closure Notes가 닫힘 결정과 일치한다.
