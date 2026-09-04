# 하니스 플랫폼 — 새 프로젝트 설계·구축 계획 (v2)

> **For agentic workers:** 이 문서는 스펙(§1~§9)과 구축 계획(§10)을 한 파일에 담는다. 계획은 `superpowers:executing-plans` 또는 `superpowers:subagent-driven-development`로 태스크 단위 실행한다. 단계는 체크박스(`- [ ]`)로 추적한다.

**Goal:** ApcH 안에서 돌고 있는 개발 하니스(보드 상태 기계·에이전트·검증 카탈로그·배포 원장·루틴·대시보드)를 **독립 서비스**로 만든다. 사용자는 웹에서 프로젝트를 관리하고 게이트를 열며, 실행은 **사용자 자신의 Claude**가 한다. ApcH는 첫 테넌트가 된다.

**Architecture:** 웹이 제품이다. 보드·백로그·게이트·명령 원장의 진실은 서비스 DB에 있고, 사용자의 Claude Code는 플러그인이 꽂아 주는 **MCP 서버**를 통해 그 상태를 읽고 쓴다. 코드에 붙는 산출물(계획서·행위자 기록)만 사용자 저장소에 남는다. 게이트는 웹 로그인 사용자만 열 수 있고, 그 규칙은 프롬프트가 아니라 **서버가 강제**한다.

**Tech Stack:** Next.js(App Router) + Prisma + Postgres(Neon) — ApcH `apps/admin`과 같은 스택이라 코드 이식이 직접적이다. MCP 서버는 `mcp-handler`(Vercel)로 Next.js 라우트에 호스팅(Streamable HTTP). 순수 모듈은 의존성 0의 ESM `.mjs` + `node:test`. 플러그인은 Claude Code 플러그인(`.claude-plugin/plugin.json` + `skills/` + `bin/` + `templates/`).

**Spec:** 이 문서 §1~§9. **원천:** ApcH 저장소 커밋 `de25a1c`(2026-08-29). 원재료 경로는 §8.

**작성:** 2026-08-29 메인 루프. v1(md가 진실, 대시보드 선택)은 같은 날 폐기 — 웹의 정체가 흐려진다는 사용자 지적에 따라 v2로 재작성. v1은 커밋된 적 없다. 사용자 결정 대기는 §12.

## v1 → v2 변경 요약

| 항목 | v1 | v2 |
| --- | --- | --- |
| 진실이 있는 곳 | 사용자 저장소 md | **서비스 DB** (계획서·기록만 저장소) |
| 웹 | 선택, 투영·도장 | **제품 본체**, 필수 |
| 사용자의 Claude ↔ 상태 | 파일 읽기·쓰기 | **MCP 도구 호출** |
| 게이트 강제 | 프롬프트 문구(이중 방어) | **서버 코드** — 에이전트 토큰엔 게이트 도구가 없음 |
| 물질화되는 것 | 보드·백로그·에이전트·규약·스크립트 | 에이전트·규약·`.mcp.json` (보드·백로그 없음) |
| 제 쪽 책임 | GitHub 토큰만 | 사용자 보드·백로그·이력 보관, 서비스 가용성 |

## Global Constraints

- 실행은 사용자 Claude(자기 Claude Code 구독·계정)가 한다. 서비스는 Claude를 돌리지 않는다 — 토큰·샌드박스·코드 실행은 전부 사용자 몫.
- **상태(보드·백로그·게이트·명령·실행 이력)는 서비스 DB가 유일한 진실이다.** 사용자 저장소에 보드·백로그 md를 두지 않는다.
- **코드에 붙는 산출물은 저장소에 둔다** — `docs/plans/<ID>.md`, `docs/agents/<행위자>/<ID>.md`. 계획서 검증이 `파일:줄` 대조라 코드와 같은 트리여야 한다.
- 게이트①(`계획지시`)·게이트②(`구현승인`)·반려·재개는 **웹 로그인 사용자만**. MCP 토큰으로는 그 전이가 **존재하지 않는다**(도구 미등록). 어떤 에이전트·루틴도 대신 전이할 수 없다.
- 에이전트 권한은 도구 구성으로 강제한다 — 생성되는 에이전트 정의의 `tools:`에 그 역할이 부를 수 있는 MCP 도구만 적는다(pm은 파일 도구가 하나도 없다).
- 플러그인 `bin/`·`lib/`는 의존성 0. 서비스 쪽 순수 모듈(`packages/core`)도 의존성 0 — 규칙은 DB·프레임워크 없이 테스트된다.
- ApcH 불변식 8개(§3.2)는 구현 수단이 바뀌어도 보존한다.
- 새 상수를 코드에 박지 않는다 — 저장소 좌표·roster·검증 명령은 `harness.json`(저장소, 코드 인접 설정)과 프로젝트 등록(DB)에서 온다.
- 언어: 1차 한국어. 템플릿은 언어별 디렉터리.

---

# Part A — 스펙

## 1. 결정 사항 (2026-08-29 확정)

| # | 결정 | 이유 |
| --- | --- | --- |
| D1 | **BYO-Claude.** 사용자는 자기 Claude로 실행. 서비스는 상태·화면·규칙 강제를 맡는다 | 토큰 비용·샌드박스·구독 재판매 문제가 서비스에 없다. 지금 이 세션의 `superpowers`·Notion MCP가 같은 배포·연결 경로의 실증 |
| D2 | **하니스의 집을 새 저장소로 옮긴다.** ApcH에서는 하니스 자체를 고치는 항목을 더 만들지 않는다. FEAT-27은 새 프로젝트의 일 | 두 벌이 갈라지는 것을 막는다 |
| D3 | **ApcH는 건드리지 않고 첫 테넌트로 붙인다.** ApcH 정의는 *읽어서* 추출한다 | 사용자 지시 |
| D4 | **진실은 서비스 DB.** 보드·백로그·게이트·명령 원장·실행 이력 | 웹이 제품이려면 웹이 진실을 가져야 한다(v1 폐기 사유) |
| D5 | **코드 인접 산출물만 저장소에**: 계획서·행위자 기록·에이전트 정의·`harness.json`·`.mcp.json` | `파일:줄` 검증, 클라우드 루틴이 저장소만 clone |
| D6 | **웹이 제품이고 필수.** 대시보드가 아니라 본체 | 사용자 지적: md를 봐야 하면 웹의 의미가 없다 |
| D7 | **사용자의 Claude는 MCP로 접속.** 플러그인이 `.mcp.json`을 놓고, 에이전트는 파일 대신 MCP 도구로 상태를 읽고 쓴다 | Claude Code의 표준 외부 연결. 설치 없이 원격 HTTP로 붙고 도구가 Claude에 직접 보인다 |
| D8 | **게이트는 서버가 강제.** 에이전트 토큰용 MCP 서버에 게이트·반려 도구를 등록하지 않는다 | 불변식 4를 문서에서 코드로 |
| D9 | **에이전트는 템플릿 + `harness.json` 파라미터로 저장소에 생성.** 플러그인은 에이전트를 직접 싣지 않는다 | 보드 `agent`가 bare name, 플러그인 에이전트는 네임스페이스·최하위 우선순위, 클라우드 자동 설치 미확인 |
| D10 | **실행기 분리**: `local`(사용자 Claude Code) 먼저, `routine`(사용자 계정 claude.ai 루틴)은 Phase 3, `hosted`는 범위 밖 | 되돌리기 쉬운 결정 |
| D11 | **`harness.json`은 저장소에 남긴다** — 워크스페이스 경로·검증 명령은 코드와 함께 바뀌므로 | 이중 진실이 아니다: 저장소=코드 인접 설정, DB=상태. `project_sync`로 서비스가 roster를 받는다 |
| D12 | **프로토콜 버전** `harness.json.version` + `harness.lock.json` | 템플릿·도구 계약 변경 시 업그레이드 경로 |
| D13 | **구독 SaaS.** 사용자는 구독하고 서비스를 쓴다. 파는 것은 스킬이 아니라 **서비스**(§2.1) | 사용자 확정(2026-08-29). gstack 같은 로컬 스킬 팩(무료·웹 없음)은 우리가 팔지 않는 쪽이다 — 스킬은 따라 할 수 있지만 세션 밖 결재·공유 상태·관제는 서비스여야 한다 |

## 2. 제품 정의

**한 줄:** 사람이 게이트를 쥐고 에이전트가 계획→검증→구현→인수를 증거로 돌리는 개발 파이프라인을, 웹에서 관리하고 자기 Claude로 실행하게 하는 서비스.

| 제공물 | 형태 | 사용자가 하는 것 |
| --- | --- | --- |
| P1 **웹** | 프로젝트 등록·토큰 발급, 백로그 편집, 보드·결재함(게이트)·여정·진행, 계획서·기록 뷰어, (Phase 3) 실행 지시 | GitHub 로그인, 항목 작성, 도장 |
| P2 **MCP 서버** | `/api/mcp` — 에이전트용 도구 세트(§5). 프로젝트 토큰으로 인증 | 없음(플러그인이 연결) |
| P3 **플러그인** | `/harness:init`(에이전트·규약·`.mcp.json` 생성), `/harness:upgrade`, (Phase 3) `verify-plan`·`setup-routines` | `claude plugin install` + `/harness:init` |

**제공하지 않는 것:** 토큰, 실행 인프라, 코드 실행, 호스팅 러너.

**main-loop(검증·인수·디스패치)는 사용자의 Claude Code 세션이 맡는다** — 런북이 지시한다. 러너가 없다.

### 2.1 무엇에 돈을 받나 — 구독의 실체

실행은 사용자 Claude이므로 토큰을 팔지 않는다. 구독이 사는 것은 **서비스 계정과 그 안의 상태·권한**이다.

| 구독이 여는 것 | 왜 스킬 팩(gstack류)으로는 안 되나 |
| --- | --- |
| 프로젝트 등록·MCP 토큰 — 연결 자체 | 토큰이 곧 접근권. 미구독 = 도구 없음 |
| 세션 밖 결재함(게이트·반려·재개), 여러 기기·루틴에서 같은 보드 | 로컬 파일은 그 머신·그 세션에만 있다 |
| 여러 프로젝트 한 화면 관제, 이력·감사 로그, 검증 칩 | 공유 상태가 있어야 한다 |
| 서버가 강제하는 규칙(게이트·pm 상한·150자·완료 조건) | 프롬프트로는 부탁만 할 수 있다 |
| (P3) 명령 원장·루틴 협조, 배포 확인 원장 자동 마감 | 사용자 세션 없이 깨어나는 것은 원장이 서비스에 있어야 |
| (P4) 팀 멤버·역할 | 로컬 파일엔 사람이 하나뿐이다 |

**무료로 두는 것:** 생성기·스킬·**에이전트 스텁**과 프로토콜 문서. 공개해도 서비스 없이는 보드가 없다.

**공개하지 않는 것(2026-09-03 정정):** **에이전트 템플릿의 단계 본문**. 이것은 파일로 내려가지 않는다 —
원문은 private 저장소에 있고 배포는 DB(`Template`) 경유이며, 서브에이전트는 `agent_next`로
**지금 할 한 단계만** 받는다. "스킬을 베껴도 서비스는 못 베낀다"는 논리가 본문에는 맞지 않는다 —
본문을 베끼면 로컬 파일 파이프라인이 그대로 서기 때문이다. 본문이 서비스의 실체다.

**과금 단위(Phase 4에서 확정, 2026-09-03):** 사용자당 월 구독. 플랜은 **Free(영구) / Pro / Max**이고,
상한은 프로젝트 하나가 아니라 **5축**이다 — 프로젝트 · 워크스페이스(dev)/프로젝트 · 백로그 항목/프로젝트 ·
이력 창 · 에이전트 종류. 표는 `packages/core/entitlement.mjs`의 `LIMITS` 하나에서 나오고
`/billing` 화면이 그것을 렌더한다(표와 코드가 어긋날 수 없게).

| | Free(영구) | Pro | Max |
| --- | --- | --- | --- |
| 프로젝트 | 1 | 5 | 무제한 |
| 워크스페이스(dev) / 프로젝트 | 1 | 10 | 무제한 |
| 백로그 항목 / 프로젝트 | 10 | 무제한 | 무제한 |
| 이력 창(전이·보고 **조회**) | 최근 30일 | 전체 | 전체 |
| 에이전트 | `pm` + dev×1 + `feature-scout` | 5종 전부 | 5종 전부 |

**멤버는 플랜 축이 아니다** — 팀 멤버·역할은 4.3의 별도 기능이다(v2가 적었던 "Team" 플랜은 팔 것이
멤버뿐이라 성립하지 않았다. 개인 사용자에게 Pro 위가 필요하고 그 차이는 무제한이다).
실행 횟수로 계량하지 않는다 — 실행은 우리 비용이 아니고, 계량하면 사용자가 파이프라인을 덜 돌린다.
플랜은 **사용자**에 붙고 프로젝트는 **소유자의 플랜**을 따른다(`Subscription` 행이 없으면 Free).
결제는 아직 없다 — `Subscription`은 스크립트로 넣고, 화면에 결제 버튼·링크가 없다(C3).

## 3. 아키텍처

### 3.1 세 주체

```
[하니스 서비스]  웹 UI · DB(프로젝트·백로그·보드·게이트 이벤트·명령·보고) · MCP 서버(/api/mcp)
       ▲ MCP 도구 호출 (Bearer 프로젝트 토큰)                ▲ 웹 로그인(GitHub OAuth) — 게이트·반려·백로그 편집
[사용자의 Claude Code / (Phase 3) 사용자 루틴]                [사용자(사람)]
       ▲ clone · commit · push
[사용자 저장소]  코드 · docs/plans/ · docs/agents/ · .claude/agents/(생성) · harness.json · .mcp.json
```

서비스와 사용자의 Claude는 MCP로만 만난다. 서비스는 저장소를 쓰지 않는다(Phase 4 GitHub App은 **읽기** 전용 — 계획서 본문 표시).

### 3.2 계승하는 불변식 8개 (ApcH 제안서 「불변식」) — 수단만 바뀐다

| # | 불변식 | ApcH 구현 | v2 구현 |
| --- | --- | --- | --- |
| 1 | 내구성 있는 인증된 명령 원장 | GitHub 이슈 #87 | `Command` 테이블 |
| 2 | 멱등 소비 — 미답변 최신 1건 | 루틴 지침 | `command_next`/`command_ack`/`command_done` 도구 |
| 3 | 명령 본문은 서버 화이트리스트 | `commands.ts` | roster에서 생성, 서버가 본문 소유 |
| 4 | 게이트는 사용자만 | 프롬프트 문구 ×2 | **에이전트 토큰에 도구 없음** |
| 5 | 루프 방지 접두 | `[claude]` | 이슈를 안 쓰므로 불필요(루틴 트리거가 이슈면 유지) |
| 6 | 명령 본문은 데이터 | 지침 | 지침 + 서버 본문 소유 |
| 7 | 에이전트 상호 호출 금지 | Task 도구 미부여 | 동일 |
| 8 | 원장 = 감사 로그 | 이슈 스레드·git | `TransitionEvent`·`Command`·`Report` 테이블 + 저장소 git |

보드 규칙 셋도 계승한다: **증거 없는 상태 주장 금지**(`완료`는 `result`·보고 경로 필수, 인수는 메인 루프가 재현), **재독 ≠ 회상**(plan-verifier 독립 컨텍스트), **정지 규칙**(무편집 독립 패스 1회, 3사이클 결함 → 보류). 그리고 pm 규칙 "미결 2건이면 새로 올리지 않는다"는 **서버가 강제**한다(`board_propose`가 거부).

### 3.3 무엇이 어디에 사는가

| 것 | 사는 곳 | 이유 |
| --- | --- | --- |
| 프로젝트 등록·토큰·멤버 | DB | 서비스 소유 |
| 백로그 항목(ID·제목·area·source) | DB | 웹에서 편집, 에이전트가 읽음 |
| 보드 행(status·근거·결과·검증·계획서 경로) | DB | 진실. 날짜 섹션은 `proposedOn`으로 파생 |
| 게이트·전이 이벤트, 명령, 보고 경로 | DB | 감사 로그 |
| 계획서 `docs/plans/<ID>.md` | 저장소 | `파일:줄` 인용 → 코드와 같은 트리 |
| 행위자 기록 `docs/agents/<행위자>/<ID>.md` | 저장소 | 코드 인접·append-only |
| 에이전트 정의 `.claude/agents/*.md` | 저장소(생성물) | D9 |
| `harness.json`(워크스페이스·검증 명령) | 저장소 | D11 — 코드와 함께 바뀜 |
| `.mcp.json` | 저장소(생성물) | 연결 설정 |
| 검증 카탈로그·계획서 템플릿·기록 규약 | 저장소(생성물) | 에이전트가 읽는 규약 |
| 배포 확인 원장 | DB (Phase 3) | 자동 마감 루틴이 REST/MCP로 닫음 |

### 3.4 실행기 계약

| kind | 트리거 | 실행 주체 | 상태 접근 | Phase |
| --- | --- | --- | --- | --- |
| `local` | 사용자가 Claude Code에서 런북대로 디스패치 | 사용자 세션 | MCP(`.mcp.json` + `HARNESS_TOKEN`) | 1 |
| `routine` | 명령 원장 폴링(cron) 또는 GitHub 이벤트 | 사용자 계정 claude.ai 루틴 | MCP(환경변수 토큰) + 허용 도메인에 서비스 호스트 | 3 |
| `hosted` | — | — | — | 범위 밖 |

## 4. 사용자 저장소에 물질화되는 것

| 경로 | 종류 | 출처 | 비고 |
| --- | --- | --- | --- |
| `harness.json` | 코드 인접 설정(사용자 소유) | init 인터뷰 | §6. lock 대상 아님 |
| `harness.lock.json` | 잠금 | 생성기 | 생성 파일별 `{template, hash}` |
| `.mcp.json` | 연결 | 생성기 | `mcpServers.harness`만 **병합**(다른 서버 보존). lock 대상 아님 |
| `CLAUDE.md` | 런북 | `templates/ko/CLAUDE.runbook.md` | 마커 절만 삽입·교체 |
| `docs/plans/README.md`, `template.md`, `verification-paths.md` | 규약 | `templates/ko/docs/plans/*` | |
| `docs/agents/README.md` | 규약 | `templates/ko/docs/agents/README.md` | 행위자 표는 roster에서 |
| `.claude/agents/pm.md`, `plan-verifier.md`, `doc-auditor.md` | 에이전트 **스텁** | `templates/<lang>/agents/*`의 첫 `## step:` 앞부분 | 역할·굳은 규칙·구동 규칙만. `tools:`에 `mcp__harness__agent_next` 포함. **절차 본문은 서버에 남는다**(Phase 4) |
| `.claude/agents/feature-scout.md` | 에이전트 | 〃 | `scout.question` 있을 때만 |
| `.claude/agents/<ws.agent>.md` × N | 에이전트 | `templates/ko/agents/dev.md` | workspace마다 |

**에이전트 파일은 스텁이다(Phase 4).** 위 `.claude/agents/*.md`는 역할·굳은 규칙·구동 규칙까지만 담고,
절차의 단계 본문은 저장소에 내려오지 않는다. 서브에이전트는 `mcp__harness__agent_next`로 지금 할
한 단계를 받아 수행하고 `outcome`과 함께 다시 부른다. 플랜이 허용하지 않는 보고 에이전트의 파일은
애초에 쓰이지 않는다(`skip(plan):`).

**없어진 것(v1 대비):** `PROJECT_BOARD.md`, `TASK_BACKLOG.md`, `docs/release-checks.md`, `scripts/release-verify/`, `.claude/skills/release-verify/`.

## 5. MCP 도구 계약 — 에이전트 토큰 스코프

서버 이름 `harness`. Claude Code에서 보이는 이름은 `mcp__harness__<tool>`. 도구명은 밑줄(점 금지 — 클라이언트 정규화 회피).

| 도구 | 입력 | 효과 | 누가 |
| --- | --- | --- | --- |
| `project_get` | — | 프로젝트·roster·워크스페이스 | 전부 |
| `project_sync` | `{workspaces[]}` (= `harness.json.workspaces`) | 워크스페이스 upsert(roster 갱신) | init 스킬 |
| `backlog_list` | `{includeRemoved?}` | 백로그 항목 + 최신 보드 status | pm·dev·doc-auditor |
| `backlog_get` | `{key}` | 항목 1건(`source` 전문) | dev |
| `board_list` | `{open?}` | 항목별 **최신** 보드 행 | pm·dev·main-loop·plan-verifier |
| `board_get` | `{key}` | 최신 보드 행 + 전이 이벤트 + 보고 | dev·plan-verifier·main-loop |
| `board_propose` | `{key, agent, reason}` | `승인대기` 행 생성. **거부**: 미결 ≥ 2, agent가 roster 밖, reason > 150자, 이미 미결인 key | pm |
| `board_transition` | `{key, to, result?}` | 에이전트 허용 전이만(§ `transitions.mjs`). `result` ≤ 150, 누적. `검토대기`는 `plan_submit` 선행 필수. `완료`는 백로그 항목 자동 제거 | dev |
| `plan_submit` | `{key, path, commit}` | 계획서 위치 기록 | dev |
| `report_submit` | `{key, actor, path, commit}` | 행위자 기록 위치 | dev·main-loop |
| `validation_record` | `{key, text}` | `검증:` — **`검토대기`일 때만**. 되돌리기 시 서버가 지움 | main-loop |
| `agent_next` | `{agent, key?, outcome?, note?}` | 에이전트 템플릿의 **다음 단계 하나**. 단계 본문은 이 도구로만 나간다 — 파일은 스텁이다. 보드 상태가 단계의 `requires`와 다르면 거부하고 자리에 머문다. 플랜 밖 에이전트·잠긴 프로젝트도 거부 | 전부 (Phase 4) |
| `command_next` / `command_ack` / `command_done` | — / `{id}` / `{id, summary}` | 명령 원장 멱등 소비 | routine (Phase 3) |
| `release_list` / `release_close` | — / `{id, outcome, evidence}` | 배포 확인 원장 | release-verify (Phase 3) |

**등록되지 않은 것(웹 전용):** 게이트 승인(`승인대기→계획지시`, `검토대기→구현승인`), 되돌리기, 보류(사람), 폐기, 재개, 백로그 편집·삭제, 명령 생성, 토큰 발급.

## 6. `harness.json` (저장소, v1과 동일 스키마)

```json
{
  "version": 1,
  "project": { "owner": "Sangeok", "repo": "ApcH", "branch": "dev", "name": "ApcH" },
  "language": "ko",
  "workspaces": [
    {
      "id": "web",
      "path": "apps/web",
      "agent": "web-dev",
      "verify": ["npm run check -w apps/web", "npm test -w apps/web"],
      "knowledge": "apps/web/CLAUDE.md",
      "readOnly": ["packages/db/**"]
    },
    {
      "id": "admin",
      "path": "apps/admin",
      "agent": "admin-dev",
      "verify": ["npm run check -w apps/admin", "npm test -w apps/admin", "npm run verify:fsd:final -w apps/admin"],
      "knowledge": "apps/admin/CLAUDE.md",
      "readOnly": ["packages/db/**"]
    },
    {
      "id": "backend",
      "path": "apps/backend",
      "agent": "backend-dev",
      "verify": ["python -m unittest discover -s apps/backend -p \"test_*.py\"", "python -m py_compile apps/backend/main.py"],
      "knowledge": "apps/backend/CLAUDE.md",
      "readOnly": ["apps/backend/asd/**", "apps/backend/requirements.txt"]
    }
  ],
  "executor": { "kind": "local" },
  "release": { "baseUrl": "https://admin.a-pch.com", "auth": "verifier" },
  "scout": { "question": "유저가 ApcH로 자기만의 영상을 만들어, 유튜브에 올려서, 가치로 연결하려면 무엇이 더 필요한가." }
}
```

값은 전부 ApcH 실측(`.claude/agents/web-dev.md` B-5, `admin-dev.md:147-149`, `backend-dev.md:162-163`, 각 「읽기만 가능」, `run.mjs:11`). `executor.commandIssue`는 `routine`일 때만(Phase 3). 서버 URL은 `harness.json`이 아니라 `.mcp.json`에 있다.

## 7. 저장소 레이아웃 (새 프로젝트)

```
harness/
├── package.json                  workspaces: apps/*, packages/*  ·  scripts: test(node --test 순수 모듈)·check
├── packages/core/                순수 모듈, 의존성 0 — 서비스와 플러그인이 공유
│   ├── transitions.mjs (+test)   상태 기계: 누가 어떤 전이를 할 수 있나 (ApcH transitions.ts 이식·확장)
│   ├── config.mjs      (+test)   harness.json 파서 (v1 검증 완료)
│   ├── render.mjs · manifest.mjs · vars.mjs (+test)   템플릿·잠금·변수 (v1 검증 완료)
│   ├── token.mjs       (+test)   프로젝트 토큰 생성·해시·Bearer 파싱
│   ├── board-md.mjs    (+test)   ApcH PROJECT_BOARD.md 파서 (임포트 전용, v1 검증 완료)
│   └── backlog-md.mjs  (+test)   ApcH TASK_BACKLOG.md 파서 (임포트 전용)
├── apps/web/                     Next.js — 웹 UI + /api/mcp + REST + Prisma
│   ├── prisma/schema.prisma
│   ├── src/app/api/mcp/[transport]/route.ts   mcp-handler
│   ├── src/app/(app)/p/[slug]/  board · backlog · inbox(결재함) · plans/[id]
│   ├── src/server/auth/         GitHub OAuth(Auth.js) · 토큰 검증
│   ├── src/server/pipeline/     전이 서비스(= transitions.mjs + DB) · 명령 · 보고
│   └── src/fsd/                 ApcH admin에서 이식: journey · briefing · stepper · office
├── plugin/                       Claude Code 플러그인 루트
│   ├── .claude-plugin/plugin.json
│   ├── lib/ → packages/core 복사본(빌드 스크립트 `npm run sync:plugin-lib`가 복사. 자족성 때문)
│   ├── bin/harness-init.mjs (+test) · harness-upgrade.mjs
│   ├── skills/harness-init/ · harness-upgrade/ · (P3) harness-verify-plan/ · harness-setup-routines/
│   └── templates/ko/  CLAUDE.runbook.md · agents/{pm,dev,plan-verifier,doc-auditor,feature-scout}.md · docs/{plans/*,agents/README.md}
├── scripts/import-apch.mjs       ApcH md → DB (Phase 2)
├── docs/  invariants.md · rationale.md · protocol.md(도구 계약·상태 기계) · SOURCES.md · adr/
└── examples/apch/harness.json
```

## 8. 원재료 매핑 — ApcH(`de25a1c`) → v2

| ApcH 경로 | 새 위치 | 변환 |
| --- | --- | --- |
| `apps/admin/src/fsd/features/transition-pipeline-gate/model/transitions.ts` | `packages/core/transitions.mjs` | 승인·반려 화이트리스트를 **행위자(human/agent) 차원**으로 확장. md 편집 로직은 버림 |
| `apps/admin/src/fsd/entities/pipeline/model/board.ts` + test | `packages/core/board-md.mjs` | 임포트 전용 |
| `apps/admin/src/fsd/features/run-pipeline-command/model/{commands,run-plan,progress}.ts` | `apps/web/src/server/pipeline/commands.ts` (P3) | 명령 본문을 roster에서 생성, 원장은 DB |
| `apps/admin/src/fsd/pages/pipeline/model/{journey,briefing,desk-commands,sprites}.ts` + `ui/**` | `apps/web/src/fsd/pages/pipeline/` | `BoardItem` 입력을 DB 행으로. 거의 무변경 |
| `apps/admin/src/fsd/features/transition-pipeline-gate/{ui,api}/**` | `apps/web/src/fsd/features/gate/` | contents API 커밋 → DB 트랜잭션. sha 낙관적 잠금 → `updatedAt` 비교 |
| `apps/admin/src/fsd/entities/{repo-doc,agent-report}/**` | `apps/web/src/fsd/entities/repo-doc/` (P4) | 계획서 본문은 GitHub raw/GitHub App으로 읽기 |
| `apps/admin/src/server/auth/{config,guard,...}` | `apps/web/src/server/auth/` | Google+`ADMIN_EMAILS` → GitHub OAuth + 프로젝트 멤버십 |
| `.claude/agents/pm.md` | `templates/ko/agents/pm.md` | 파일 읽기 → `backlog_list`·`board_list`; 보드 편집 → `board_propose`; `tools:` = MCP 3개뿐 |
| `.claude/agents/{web,admin,backend}-dev.md` | `templates/ko/agents/dev.md` | §9 매핑표. 골격/파라미터 분리(v1 §7 규칙 유지) |
| `.claude/agents/plan-verifier.md` | `templates/ko/agents/plan-verifier.md` | 브리핑에 `board_get` 허용. 무편집 규칙 그대로 |
| `.claude/agents/doc-auditor.md` | `templates/ko/agents/doc-auditor.md` | 백로그 읽기 → `backlog_list`. 보드는 여전히 보지 않음 |
| `.claude/agents/feature-scout.md` | `templates/ko/agents/feature-scout.md` | 보고만. `backlog_add`는 주지 않는다(제안은 사람이 등록) |
| `CLAUDE.md` 런북 | `templates/ko/CLAUDE.runbook.md` | 9단계 절차의 "보드 갱신·커밋"을 MCP 호출로. 문서 지도 갱신 |
| `PROJECT_BOARD.md` 안내 블록 | `docs/protocol.md` + 웹 화면 도움말 | **템플릿 아님** — 규칙은 서버 코드와 도움말로 |
| `TASK_BACKLOG.md` 머리말(관측/진단 분리 등) | 웹 백로그 편집 폼의 도움말 + `docs/protocol.md` | |
| `docs/plans/{README,template}.md`, `verification-paths.md`, `docs/agents/README.md` | `templates/ko/docs/` | 실증 산문 → `docs/rationale.md` |
| `docs/release-checks.md` + `scripts/release-verify/*` + `.claude/skills/release-verify` | P3 — `ReleaseCheck` 테이블 + `scripts/release-verify` REST 버전 | `ledger.mjs` 판정 로직은 그대로, 입출력만 REST |
| `docs/proposals/active/remote-agent-pipeline-generalization.md` | `docs/invariants.md`·`docs/rationale.md` | §3.2 표 |

## 9. 에이전트 템플릿 — 파일 동작 → MCP 도구

골격/파라미터 분리 규칙은 v1 §7과 같다(골격: 역할·두 단계·「절대 하지 않는 일」·출력 형식; 파라미터: `{{project.name}}`·`{{ws.*}}`·`{{roster_table}}`…). 여기에 **수단 치환**이 더해진다.

| ApcH 정의의 동작 | v2 도구 | 비고 |
| --- | --- | --- |
| pm: `TASK_BACKLOG.md` 읽기 | `backlog_list` | |
| pm: `PROJECT_BOARD.md` 읽어 미결 세기 | `board_list({open:true})` | 서버도 세서 거부하므로 이중 |
| pm: 보드에 `승인대기` 행 쓰기 | `board_propose` | 근거 150자 서버 검증 |
| dev A-2: 백로그 `source` 읽기 | `backlog_get` | |
| dev A-4: `검토대기`로 바꾸기 | `plan_submit` → `board_transition({to:"검토대기"})` | 순서 강제(서버) |
| dev A-4/B-6: `보류` + `결과:` | `board_transition({to:"보류", result})` | |
| dev B-6: `완료` + `결과:` | `report_submit` → `board_transition({to:"완료", result})` | 보고 경로 없으면 서버 거부 |
| dev B-7: 백로그에서 제거 | (서버 자동) | `완료` 전이 시 `removedAt` |
| main-loop: `검증:` 줄 | `validation_record` | `검토대기`에서만 |
| main-loop: 게이트 결정 기록 | 웹 결재함이 이벤트로 남김 | 문서 기록은 여전히 `docs/agents/main-loop/` |
| 커밋·푸시(보드) | 없음 | 계획서·기록·코드만 커밋 |

생성되는 `tools:` 예시 — `pm.md`: `mcp__harness__backlog_list, mcp__harness__board_list, mcp__harness__board_propose` (파일 도구 없음). `dev.md`: `Read, Write, Edit, Glob, Grep, Bash, mcp__harness__backlog_get, mcp__harness__board_get, mcp__harness__board_transition, mcp__harness__plan_submit, mcp__harness__report_submit`. `plan-verifier.md`: `Read, Glob, Grep, Bash, mcp__harness__board_get`. `doc-auditor.md`: `Read, Glob, Grep, mcp__harness__backlog_list`.

---

# Part B — 구축 계획

## 10. Phase

| Phase | 산출 | 완료 기준 |
| --- | --- | --- |
| 0 부트스트랩 | 모노레포·Next.js·Prisma·러너 | `npm test`·`npm run check` 통과, 로컬 DB 마이그레이션 |
| 1 핵심 | 상태 기계 + DB + MCP 서버 + 토큰 + 웹(로그인·프로젝트·백로그·보드·결재함) + 플러그인(init·에이전트) | **빈 저장소** 연결 → 항목 1건이 웹 게이트 2회를 거쳐 `완료` |
| 2 ApcH 첫 테넌트 | md → DB 임포트 · adopt · FEAT-28 완주 · ApcH admin `/pipeline` 은퇴 | ApcH 파이프라인이 서비스 위에서 1사이클 |
| 3 원격·자동화 | 명령 원장·루틴 실행기·배포 확인 원장(DB)·`verify-plan` | 사용자 계정 루틴이 명령을 소비, 원장 자동 마감 |
| 4 공개 | GitHub App(계획서 읽기)·멀티 테넌트 정리·과금·marketplace·문서 | 외부 사용자 1명 온보딩 완주 |

Phase 0·1은 태스크 단위로 적는다. 2~4는 목록과 완료 기준만 — 착수 시 별도 계획서.

### Phase 0 — 부트스트랩

#### Task 0.1: 모노레포·순수 모듈 러너

**Files:** `package.json`, `.gitignore`, `packages/core/.gitkeep`, `plugin/.claude-plugin/plugin.json`

- [ ] **Step 1: 저장소** — `mkdir harness && cd harness && git init -b main`
- [ ] **Step 2: 루트 `package.json`**

```json
{
  "name": "harness",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test \"packages/core/*.test.mjs\" \"plugin/bin/*.test.mjs\"",
    "check": "node --check plugin/bin/harness-init.mjs && npm run check --workspaces --if-present",
    "sync:plugin-lib": "node scripts/sync-plugin-lib.mjs"
  }
}
```

- [ ] **Step 3: `plugin/.claude-plugin/plugin.json`**

```json
{
  "name": "harness",
  "description": "사람이 게이트를 쥐는 에이전트 개발 파이프라인 — 하니스 서비스에 저장소를 연결한다",
  "version": "0.1.0",
  "author": { "name": "Sangeok" }
}
```

- [ ] **Step 4: `scripts/sync-plugin-lib.mjs`** — `packages/core/*.mjs`(테스트 제외)를 `plugin/lib/`로 복사. 플러그인은 marketplace 설치 시 `plugin/`만 복사되므로 자족적이어야 한다.

```js
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
mkdirSync("plugin/lib", { recursive: true });
for (const f of readdirSync("packages/core")) if (f.endsWith(".mjs") && !f.endsWith(".test.mjs")) copyFileSync(`packages/core/${f}`, `plugin/lib/${f}`);
console.log("plugin/lib synced");
```

- [ ] **Step 5: `.gitignore`** — `node_modules/`, `.env*`, `.next/`, `nul`
- [ ] **Step 6: 커밋** `chore: bootstrap monorepo — core runner, plugin skeleton`

#### Task 0.2: `apps/web` 부트스트랩

- [ ] **Step 1:** `npx create-next-app@latest apps/web --ts --app --src-dir --eslint --no-tailwind`(Tailwind는 ApcH admin 이식 시 같이 들여온다) 후 `apps/web/package.json`에 `check: "next lint && tsc --noEmit"`, `test: "node --import tsx --test \"src/**/*.test.mjs\""`.
- [ ] **Step 2:** Prisma — `npm i -w apps/web prisma @prisma/client`, `npx prisma init`. `DATABASE_URL`은 Neon(ApcH와 같은 공급자).
- [ ] **Step 3:** `mcp-handler`·`zod` 설치 — `npm i -w apps/web mcp-handler zod`. **버전 확인:** context7로 `mcp-handler` 최신 API(`createMcpHandler`·`withMcpAuth` 시그니처)를 확인해 Task 1.6 코드의 임포트·시그니처를 맞춘다.
- [ ] **Step 4:** Auth.js(GitHub provider) — `npm i -w apps/web next-auth@beta`. ApcH admin `src/server/auth/config.ts`의 구조를 따르되 provider만 GitHub.
- [ ] **Step 5:** 커밋 `chore(web): next + prisma + mcp-handler + auth.js`

#### Task 0.3: 문서 골격

- [ ] `docs/SOURCES.md`(§8 표 + `원천: Sangeok/ApcH @ de25a1c`), `docs/invariants.md`(ApcH 제안서 불변식 전문 + §3.2 표), `docs/protocol.md`(§5 도구 계약 + 상태 기계 표 + 계획서 절 8개), `docs/rationale.md`(제목만). 커밋 `docs: sources, invariants, protocol`.

### Phase 1 — 핵심

#### Task 1.1: `packages/core/transitions.mjs` — 상태 기계 (누가 어떤 전이를 할 수 있나)

**Files:** `packages/core/transitions.mjs`, `packages/core/transitions.test.mjs`
**원천:** ApcH `transitions.ts` `GATE_TRANSITIONS`(승인대기→계획지시, 검토대기→구현승인)·`REJECT_TRANSITIONS`(bounce·hold·discard), 에이전트 정의의 A-4·B-6, 보드 안내 블록의 재개 규칙.

**Interfaces (Produces):**
- `STATUSES`, `isOpen(status)`, `findRule(actor, from, to) → rule | null` (`actor`: `"human" | "agent"`), `canDiscard(status)`, `canPropose(openCount)`, `canRecordValidation(status)`, `checkText(field, text)` (150자)
- rule: `{from, to, actor, kind, requiresResult?, requiresPlan?, requiresReport?, clearsValidation?}`

- [ ] **Step 1: 테스트**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDiscard, canPropose, canRecordValidation, checkText, findRule, isOpen, STATUSES } from "./transitions.mjs";

describe("transitions", () => {
  it("gates are human-only", () => {
    assert.equal(findRule("human", "승인대기", "계획지시").kind, "gate");
    assert.equal(findRule("human", "검토대기", "구현승인").kind, "gate");
    assert.equal(findRule("agent", "승인대기", "계획지시"), null);
    assert.equal(findRule("agent", "검토대기", "구현승인"), null);
  });
  it("agent transitions and their prerequisites", () => {
    const plan = findRule("agent", "계획지시", "검토대기");
    assert.equal(plan.kind, "plan"); assert.equal(plan.requiresPlan, true);
    const done = findRule("agent", "구현승인", "완료");
    assert.equal(done.kind, "done"); assert.equal(done.requiresResult, true); assert.equal(done.requiresReport, true);
    assert.equal(findRule("agent", "계획지시", "보류").requiresResult, true);
    assert.equal(findRule("agent", "구현승인", "보류").requiresResult, true);
    assert.equal(findRule("human", "구현승인", "완료"), null); // 완료는 검증을 거친 에이전트만
  });
  it("human rejects: bounce clears validation, hold needs result, resume", () => {
    const bounce = findRule("human", "검토대기", "계획지시");
    assert.equal(bounce.kind, "bounce"); assert.equal(bounce.clearsValidation, true);
    assert.equal(findRule("human", "승인대기", "보류").requiresResult, true);
    assert.equal(findRule("human", "검토대기", "보류").requiresResult, true);
    assert.equal(findRule("human", "보류", "계획지시").clearsValidation, true);
    assert.equal(findRule("human", "보류", "구현승인").kind, "resume");
    assert.equal(findRule("human", "승인대기", "계획지시").clearsValidation, undefined);
  });
  it("nothing leaves 완료; unknown statuses rejected", () => {
    for (const s of STATUSES) assert.equal(findRule("human", "완료", s), null);
    assert.equal(findRule("human", "__proto__", "계획지시"), null);
    assert.equal(findRule("agent", "계획지시", "toString"), null);
  });
  it("discard only from 승인대기/검토대기", () => {
    assert.equal(canDiscard("승인대기"), true); assert.equal(canDiscard("검토대기"), true);
    assert.equal(canDiscard("구현승인"), false); assert.equal(canDiscard("보류"), false);
  });
  it("open = not 완료/보류; propose cap 2; validation only in 검토대기", () => {
    assert.equal(isOpen("승인대기"), true); assert.equal(isOpen("완료"), false); assert.equal(isOpen("보류"), false);
    assert.equal(canPropose(0), true); assert.equal(canPropose(1), true); assert.equal(canPropose(2), false);
    assert.equal(canRecordValidation("검토대기"), true); assert.equal(canRecordValidation("구현승인"), false);
  });
  it("150-char fields", () => {
    assert.equal(checkText("reason", "x".repeat(150)), null);
    assert.match(checkText("reason", "x".repeat(151)), /150/);
    assert.match(checkText("result", ""), /비어/);
  });
});
```

- [ ] **Step 2: 실패 확인** — `node --test packages/core/transitions.test.mjs` → FAIL
- [ ] **Step 3: 구현**

```js
// 순수. import 없음. 보드 상태 기계 — "누가 어떤 전이를 할 수 있나"의 단일 출처.
// 서버(MCP·웹 액션)가 이 표로 판정한다. 여기 없는 전이는 존재하지 않는다.
export const STATUSES = ["승인대기", "계획지시", "검토대기", "구현승인", "완료", "보류"];
const STATUS_SET = new Set(STATUSES);
export const TEXT_LIMIT = 150;

const RULES = [
  // 사람(웹 로그인)만 — 게이트
  { from: "승인대기", to: "계획지시", actor: "human", kind: "gate" },
  { from: "검토대기", to: "구현승인", actor: "human", kind: "gate" },
  // 사람 — 반려·재개 (ApcH REJECT_TRANSITIONS + 보드 안내 블록 재개 규칙)
  { from: "검토대기", to: "계획지시", actor: "human", kind: "bounce", clearsValidation: true },
  { from: "승인대기", to: "보류", actor: "human", kind: "hold", requiresResult: true },
  { from: "검토대기", to: "보류", actor: "human", kind: "hold", requiresResult: true },
  { from: "보류", to: "계획지시", actor: "human", kind: "resume", clearsValidation: true },
  { from: "보류", to: "구현승인", actor: "human", kind: "resume" },
  // 에이전트(MCP 토큰) — dev A-4·B-6
  { from: "계획지시", to: "검토대기", actor: "agent", kind: "plan", requiresPlan: true },
  { from: "계획지시", to: "보류", actor: "agent", kind: "hold", requiresResult: true },
  { from: "구현승인", to: "완료", actor: "agent", kind: "done", requiresResult: true, requiresReport: true },
  { from: "구현승인", to: "보류", actor: "agent", kind: "hold", requiresResult: true },
];

export function findRule(actor, from, to) {
  if (!STATUS_SET.has(from) || !STATUS_SET.has(to)) return null;
  return RULES.find((r) => r.actor === actor && r.from === from && r.to === to) ?? null;
}
const DISCARD_FROM = new Set(["승인대기", "검토대기"]);
export function canDiscard(status) { return DISCARD_FROM.has(status); }
export function isOpen(status) { return STATUS_SET.has(status) && status !== "완료" && status !== "보류"; }
export function canPropose(openCount) { return openCount < 2; } // pm 규칙: 미결 2건이면 새로 올리지 않는다
export function canRecordValidation(status) { return status === "검토대기"; }
export function checkText(field, text) {
  if (typeof text !== "string" || text.trim() === "") return `${field}: 비어 있을 수 없다`;
  if (text.length > TEXT_LIMIT) return `${field}: ${TEXT_LIMIT}자 이내여야 한다 (${text.length})`;
  return null;
}
```

- [ ] **Step 4: 통과** → PASS 7. **Step 5: 커밋** `feat(core): board state machine with actor-scoped transitions`

#### Task 1.2: `packages/core/backlog-md.mjs` — ApcH 백로그 파서(임포트 전용)

- [ ] **Step 1: 테스트**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBacklog } from "./backlog-md.mjs";

const MD = [
  "# TASK_BACKLOG", "", "> 머리말", "", "## Credit / Billing", "",
  "- [ ] **FEAT-01**: Credit System 마무리 (현재 개발 중 상태)",
  "  - area: apps/web/src/fsd/features/billing + apps/web/src/inngest",
  "  - source: README \"Currently in Development\"",
  "", "## Pipeline", "",
  "- [ ] **FEAT-28**: 부분 성공 클립의 메타데이터를 사용자에게 전달",
  "  - area: apps/web/src/inngest",
  "  - source: BUG-08 계획서 「범위 밖 의존」. **관측**: … **진단(코드 확정)**: …",
  "", "## 비고", "- 위 항목의 우선순위는 …",
].join("\n");

describe("parseBacklog", () => {
  it("extracts key/title/area/source per item", () => {
    const items = parseBacklog(MD);
    assert.deepEqual(items.map((i) => i.key), ["FEAT-01", "FEAT-28"]);
    assert.equal(items[0].title, "Credit System 마무리 (현재 개발 중 상태)");
    assert.equal(items[0].area, "apps/web/src/fsd/features/billing + apps/web/src/inngest");
    assert.equal(items[0].source, "README \"Currently in Development\"");
    assert.equal(items[1].source, "BUG-08 계획서 「범위 밖 의존」. **관측**: … **진단(코드 확정)**: …");
  });
  it("ignores prose bullets and missing fields become empty strings", () => {
    const items = parseBacklog("## X\n- [ ] **BUG-09**: 제목만\n- 그냥 불릿\n");
    assert.equal(items.length, 1); assert.equal(items[0].area, ""); assert.equal(items[0].source, "");
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**

```js
// 순수. ApcH TASK_BACKLOG.md 형식: "- [ ] **ID**: 제목" + "  - area: …" + "  - source: …". 임포트 전용.
const ITEM_RE = /^- \[[ xX]\] \*\*([A-Z]+-\d+)\*\*: (.+)$/;
const FIELD_RE = /^\s+- (area|source): (.+)$/;

export function parseBacklog(markdown) {
  const items = [];
  let cur = null;
  for (const line of markdown.split(/\r?\n/)) {
    const m = ITEM_RE.exec(line);
    if (m) { cur = { key: m[1], title: m[2].trim(), area: "", source: "" }; items.push(cur); continue; }
    const f = FIELD_RE.exec(line);
    if (f && cur) { cur[f[1]] = f[2].trim(); continue; }
    if (!/^\s/.test(line)) cur = null; // 들여쓰기 없는 다른 줄이 오면 항목 종료
  }
  return items;
}
```

- [ ] **Step 4: 통과** → PASS 2. **Step 5: 커밋** `feat(core): ApcH backlog markdown parser (import only)`

#### Task 1.3: `packages/core/board-md.mjs` — ApcH 보드 파서(임포트 전용)

v1 문서에서 검증된 이식본(ApcH `board.test.mjs` 원본으로 통과). 코드는 아래, 테스트는 ApcH `apps/admin/src/fsd/entities/pipeline/model/board.test.mjs`를 복사해 import만 `./board-md.mjs`로.

```js
// 순수. import 없음. ApcH apps/admin/src/fsd/entities/pipeline/model/board.ts(de25a1c) 이식. Phase 2 임포트 전용.
const HEADING_RE = /^##\s+(.+)$/;
const ITEM_RE = /^- \[([ xX])\] ([A-Z]+-\d+): (.+)$/;
const FIELD_RE = /^\s+(agent|area|status|근거|결과|검증):\s*(.+)$/;

export function parseBoard(markdown) {
  const sections = [];
  let section = null;
  let item = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith(">")) continue;
    const h = HEADING_RE.exec(line);
    if (h) { section = { heading: h[1].trim(), items: [] }; sections.push(section); item = null; continue; }
    const it = ITEM_RE.exec(line);
    if (it) {
      if (!section) continue;
      item = { checked: it[1].toLowerCase() === "x", id: it[2], title: it[3].trim(),
               agent: null, area: null, status: null, reason: null, result: null, validation: null };
      section.items.push(item);
      continue;
    }
    const f = FIELD_RE.exec(line);
    if (f && item) {
      const value = f[2].trim();
      switch (f[1]) {
        case "agent": item.agent = value; break;
        case "area": item.area = value; break;
        case "status": item.status = value; break;
        case "근거": item.reason = value; break;
        case "결과": item.result = item.result === null ? value : item.result + " " + value; break;
        case "검증": item.validation = value; break;
      }
    }
  }
  return sections.filter((s) => s.items.length > 0);
}

export function latestItemById(sections, id) {
  for (const s of sections) for (const it of s.items) if (it.id === id) return it;
  return null;
}
```

- [ ] 테스트 복사 → `node --test packages/core/board-md.test.mjs` PASS → 커밋 `feat(core): ApcH board markdown parser (import only)`

#### Task 1.4: `config.mjs`·`render.mjs`·`manifest.mjs`·`vars.mjs` — v1에서 검증된 모듈 그대로

네 모듈과 테스트는 v1 문서 Task 1.2~1.5의 코드와 **바이트 동일**하다(2026-08-29 32/32 통과). 여기 다시 싣지 않고, v1 백업(`scratchpad/harness-platform.v1.md`)이나 아래 요약 인터페이스로 옮긴다. **한 곳만 다르다:** `config.test.mjs` 첫 케이스의 executor 단언 두 줄은 v2 예시(§6, Phase 1은 `local`)에 맞춰 `assert.equal(c.executor.kind, "local"); assert.equal(c.executor.commandIssue, null);`로 바꾼다. 옮긴 뒤 `node --test packages/core/*.test.mjs`로 재확인한다.

- `parseHarnessConfig(jsonOrObject)` → `{version, project, language, workspaces[], executor, release|null, scout|null}` (실패: `Error("harness.json <경로>: <사유>")`)
- `renderTemplate(text, vars)` — `{{a.b}}` 치환, 미정의 throw
- `hashOf(text)`, `planWrites({targets, existing, lock, adopt})`, `buildLock(targets)`
- `buildVars(config)`, `buildWorkspaceVars(config, ws)` — `roster_table`·`roster_names`·`board_branch`·`ws.verify_block`·`ws.verify_result_line`·`ws.read_only_list`·`ws.out_of_scope_list`·`ws.knowledge`

- [ ] 복사·테스트·커밋 `feat(core): config, render, manifest, vars (from v1, verified)`

#### Task 1.5: `packages/core/token.mjs` — 프로젝트 토큰

**Interfaces:** `newToken() → {plain, hash}` (`plain`은 `hs_` + 43자 base64url, 한 번만 보여줌), `hashToken(plain) → sha256 hex`, `parseBearer(header) → plain | null`

- [ ] **Step 1: 테스트**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashToken, newToken, parseBearer } from "./token.mjs";

describe("token", () => {
  it("new tokens are prefixed, unique, and hash deterministically", () => {
    const a = newToken(), b = newToken();
    assert.match(a.plain, /^hs_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a.plain, b.plain);
    assert.equal(a.hash, hashToken(a.plain));
    assert.equal(a.hash.length, 64);
  });
  it("parseBearer accepts only well-formed harness tokens", () => {
    const { plain } = newToken();
    assert.equal(parseBearer(`Bearer ${plain}`), plain);
    assert.equal(parseBearer(`bearer ${plain}`), plain);
    assert.equal(parseBearer("Bearer nope"), null);
    assert.equal(parseBearer(null), null);
    assert.equal(parseBearer(`Token ${plain}`), null);
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**

```js
import { createHash, randomBytes } from "node:crypto";
const TOKEN_RE = /^hs_[A-Za-z0-9_-]{43}$/;

export function hashToken(plain) { return createHash("sha256").update(plain).digest("hex"); }
export function newToken() {
  const plain = "hs_" + randomBytes(32).toString("base64url"); // 32B → 43자
  return { plain, hash: hashToken(plain) };
}
export function parseBearer(header) {
  if (typeof header !== "string") return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m || !TOKEN_RE.test(m[1])) return null;
  return m[1];
}
```

- [ ] **Step 4: 통과** → PASS 2. **Step 5: 커밋** `feat(core): project token generation and bearer parsing`

#### Task 1.6: Prisma 스키마

**Files:** `apps/web/prisma/schema.prisma`

- [ ] **Step 1: 스키마**

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id        String          @id @default(cuid())
  githubId  Int             @unique
  login     String
  createdAt DateTime        @default(now())
  members   ProjectMember[]
}

model Project {
  id           String          @id @default(cuid())
  slug         String          @unique   // URL: /p/apch
  name         String
  owner        String                    // GitHub owner
  repo         String
  branch       String
  language     String          @default("ko")
  executorKind String          @default("local")   // local | routine
  commandIssue Int?
  createdAt    DateTime        @default(now())
  members      ProjectMember[]
  tokens       ProjectToken[]
  workspaces   Workspace[]
  backlog      BacklogItem[]
  board        BoardItem[]
  commands     Command[]
}

model ProjectMember {
  projectId String
  userId    String
  role      String   @default("owner")
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([projectId, userId])
}

model ProjectToken {
  id        String    @id @default(cuid())
  projectId String
  hash      String    @unique   // sha256(plain). 평문은 저장하지 않는다
  label     String
  createdAt DateTime  @default(now())
  revokedAt DateTime?
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model Workspace {                      // harness.json.workspaces 의 사본 (project_sync)
  id        String   @id @default(cuid())
  projectId String
  wsId      String
  path      String
  agent     String
  verify    String[]
  knowledge String?
  readOnly  String[]
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([projectId, agent])
}

model BacklogItem {
  id        String      @id @default(cuid())
  projectId String
  key       String                       // FEAT-28
  title     String
  area      String
  source    String                       // 관측/진단 분리 규칙은 화면 도움말
  createdAt DateTime    @default(now())
  removedAt DateTime?                    // 완료 시 서버가 채움
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  board     BoardItem[]
  @@unique([projectId, key])
}

model BoardItem {                        // 같은 backlog 항목이 여러 번 올라올 수 있다(보류 후 재선정). 최신 = proposedOn 최대
  id            String            @id @default(cuid())
  projectId     String
  backlogItemId String
  agent         String
  status        String                    // transitions.mjs STATUSES
  reason        String                    // 근거 ≤150
  results       String[]                  // 결과 ≤150, 누적(ApcH 결과: 두 줄 누적 규칙)
  validation    String?                   // 검증: — 검토대기에서만, 되돌리기 시 null
  planPath      String?
  planCommit    String?
  proposedOn    DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
  project       Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  backlogItem   BacklogItem       @relation(fields: [backlogItemId], references: [id], onDelete: Cascade)
  events        TransitionEvent[]
  reports       Report[]
  @@index([projectId, status])
}

model TransitionEvent {                  // 감사 로그 (불변식 8)
  id          String    @id @default(cuid())
  boardItemId String
  from        String?
  to          String?                    // null = 폐기
  actor       String                     // human | agent
  actorId     String?                    // userId 또는 tokenId
  note        String?
  at          DateTime  @default(now())
  boardItem   BoardItem @relation(fields: [boardItemId], references: [id], onDelete: Cascade)
}

model Report {
  id          String    @id @default(cuid())
  boardItemId String
  actor       String                     // web-dev | main-loop | …
  path        String                     // docs/agents/<actor>/<ID>.md
  commit      String
  at          DateTime  @default(now())
  boardItem   BoardItem @relation(fields: [boardItemId], references: [id], onDelete: Cascade)
}

model Command {                          // 명령 원장 (Phase 3에서 소비)
  id        String    @id @default(cuid())
  projectId String
  kind      String                       // pipeline-run | pm-select | audit-run | scout-run | <agent>-work
  body      String                       // 서버가 roster에서 생성 (불변식 3)
  status    String    @default("queued") // queued | acked | done
  createdAt DateTime  @default(now())
  ackedAt   DateTime?
  doneAt    DateTime?
  summary   String?
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2:** `npx prisma migrate dev -n init` → 마이그레이션 생성·적용. **Step 3:** 커밋 `feat(db): initial schema`

#### Task 1.7: 전이 서비스 — `apps/web/src/server/pipeline/board.ts`

MCP 도구와 웹 액션이 **둘 다** 이 함수들을 부른다. 규칙은 `transitions.mjs`, 저장은 Prisma.

**Interfaces (Produces):**
- `latestBoard(projectId) → BoardRow[]` (backlog 항목별 최신 행)
- `propose(projectId, {key, agent, reason}, actorRef)` — `canPropose(openCount)`·roster·`checkText`·중복 미결 검사 → `BoardItem` 생성 + 이벤트
- `transition(projectId, {key, to, result?}, actor, actorRef)` — `findRule(actor, from, to)` → null이면 거부; `requiresResult`→`checkText`; `requiresPlan`→`planPath` 있어야; `requiresReport`→`Report` 1건 이상; `clearsValidation`→`validation=null`; `to==="완료"`→`BacklogItem.removedAt`; 트랜잭션 + 이벤트
- `discard(projectId, key, userId)` — `canDiscard` → 행 삭제 + 이벤트(`to: null`)
- `recordValidation(projectId, key, text)` — `canRecordValidation`
- `submitPlan`, `submitReport`

- [ ] **Step 1: 테스트** (`board.test.mjs`, Prisma는 module mock — ApcH admin `test-runtime-contract: module-mocked DB` 관례) — 케이스: propose가 미결 2건에서 거부 / roster 밖 agent 거부 / 152자 근거 거부 / agent가 게이트 시도 시 거부 / 검토대기 전이에 planPath 없으면 거부 / 완료에 Report 없으면 거부, 있으면 removedAt 채움 / bounce가 validation을 지움 / 이벤트가 매 전이마다 1건.
- [ ] **Step 2: 구현** — 각 함수는 `prisma.$transaction`으로 최신 행 조회 → 규칙 판정 → 갱신 → `TransitionEvent` 생성. 낙관적 잠금: 호출자가 읽은 `updatedAt`을 받아 `where: { id, updatedAt }`로 갱신, 0건이면 `stale` 거부(ApcH sha 잠금의 대응물).
- [ ] **Step 3:** `npm test -w apps/web` PASS → 커밋 `feat(web): board service — propose/transition/discard/validation over transitions.mjs`

#### Task 1.8: MCP 서버 — `apps/web/src/app/api/mcp/[transport]/route.ts`

- [ ] **Step 1: 인증** — `withMcpAuth`로 `Authorization` 헤더를 `parseBearer` → `hashToken` → `ProjectToken`(미폐기) 조회 → `{ projectId, tokenId }`를 컨텍스트로. 실패는 401.
- [ ] **Step 2: 도구 등록** — §5 표의 **에이전트 스코프 도구만**. 게이트·반려·백로그 편집 도구는 여기 없다(D8).

```ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { hashToken, parseBearer } from "@harness/core/token.mjs";
import { prisma } from "~/server/db";
import * as board from "~/server/pipeline/board";

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true });

const handler = createMcpHandler((server) => {
  const ctx = (extra: { authInfo?: { extra?: { projectId?: string; tokenId?: string } } }) => {
    const p = extra.authInfo?.extra?.projectId, t = extra.authInfo?.extra?.tokenId;
    if (!p || !t) throw new Error("unauthenticated");
    return { projectId: p, actorRef: `token:${t}` };
  };
  server.registerTool("project_get", { description: "프로젝트·roster·워크스페이스" }, async (_a, extra) => {
    const { projectId } = ctx(extra);
    return text(await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { workspaces: true } }));
  });
  server.registerTool("project_sync", { description: "harness.json.workspaces를 서비스에 반영", inputSchema: { workspaces: z.array(z.object({ id: z.string(), path: z.string(), agent: z.string(), verify: z.array(z.string()), knowledge: z.string().nullable(), readOnly: z.array(z.string()) })) } }, async ({ workspaces }, extra) => {
    const { projectId } = ctx(extra);
    await prisma.$transaction(workspaces.map((w) => prisma.workspace.upsert({ where: { projectId_agent: { projectId, agent: w.agent } }, create: { projectId, wsId: w.id, path: w.path, agent: w.agent, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly }, update: { wsId: w.id, path: w.path, verify: w.verify, knowledge: w.knowledge, readOnly: w.readOnly } })));
    return text({ synced: workspaces.length });
  });
  server.registerTool("backlog_list", { description: "백로그 항목 + 최신 보드 status", inputSchema: { includeRemoved: z.boolean().optional() } }, async ({ includeRemoved }, extra) => {
    const { projectId } = ctx(extra);
    return text(await board.backlogWithStatus(projectId, includeRemoved === true));
  });
  server.registerTool("backlog_get", { description: "항목 1건(source 전문)", inputSchema: { key: z.string() } }, async ({ key }, extra) => {
    const { projectId } = ctx(extra);
    const item = await prisma.backlogItem.findUnique({ where: { projectId_key: { projectId, key } } });
    return item ? text(item) : fail(`no such item: ${key}`);
  });
  server.registerTool("board_list", { description: "항목별 최신 보드 행", inputSchema: { open: z.boolean().optional() } }, async ({ open }, extra) => {
    const { projectId } = ctx(extra);
    return text(await board.latestBoard(projectId, open === true));
  });
  server.registerTool("board_get", { description: "최신 보드 행 + 이벤트 + 보고", inputSchema: { key: z.string() } }, async ({ key }, extra) => {
    const { projectId } = ctx(extra);
    const row = await board.getWithHistory(projectId, key);
    return row ? text(row) : fail(`no such board item: ${key}`);
  });
  server.registerTool("board_propose", { description: "pm: 승인대기 행 생성(미결 2건이면 거부)", inputSchema: { key: z.string(), agent: z.string(), reason: z.string() } }, async (args, extra) => {
    const { projectId, actorRef } = ctx(extra);
    const r = await board.propose(projectId, args, actorRef);
    return r.ok ? text(r.item) : fail(r.reason);
  });
  server.registerTool("board_transition", { description: "에이전트 전이: 계획지시→검토대기(plan_submit 선행) · 구현승인→완료(report_submit 선행) · →보류(result 필수)", inputSchema: { key: z.string(), to: z.string(), result: z.string().optional() } }, async (args, extra) => {
    const { projectId, actorRef } = ctx(extra);
    const r = await board.transition(projectId, args, "agent", actorRef);
    return r.ok ? text(r.item) : fail(r.reason);
  });
  server.registerTool("plan_submit", { description: "계획서 위치 기록", inputSchema: { key: z.string(), path: z.string(), commit: z.string() } }, async (args, extra) => {
    const { projectId } = ctx(extra);
    const r = await board.submitPlan(projectId, args);
    return r.ok ? text(r.item) : fail(r.reason);
  });
  server.registerTool("report_submit", { description: "행위자 기록 위치", inputSchema: { key: z.string(), actor: z.string(), path: z.string(), commit: z.string() } }, async (args, extra) => {
    const { projectId } = ctx(extra);
    const r = await board.submitReport(projectId, args);
    return r.ok ? text(r.report) : fail(r.reason);
  });
  server.registerTool("validation_record", { description: "main-loop: 검증 클린 패스 기록(검토대기에서만)", inputSchema: { key: z.string(), text: z.string() } }, async (args, extra) => {
    const { projectId } = ctx(extra);
    const r = await board.recordValidation(projectId, args);
    return r.ok ? text(r.item) : fail(r.reason);
  });
}, {}, { basePath: "/api/mcp" });

const authed = withMcpAuth(handler, async (_req, bearer) => {
  const plain = parseBearer(bearer ? `Bearer ${bearer}` : null);
  if (!plain) return undefined;
  const row = await prisma.projectToken.findUnique({ where: { hash: hashToken(plain) } });
  if (!row || row.revokedAt) return undefined;
  return { token: plain, scopes: ["agent"], clientId: row.projectId, extra: { projectId: row.projectId, tokenId: row.id } };
}, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
```

`mcp-handler`의 `withMcpAuth` 콜백·`authInfo` 전달 형태는 버전에 따라 다르다 — Task 0.2 Step 3에서 확인한 시그니처로 맞춘다. 도구 목록·입력·효과는 §5가 계약이고 위 코드는 그 구현이다.

- [ ] **Step 3: 계약 테스트** — `route.test.mjs`: 등록된 도구 이름 집합이 §5 에이전트 스코프와 **정확히** 같다(게이트 도구 부재 단언 — 불변식 4의 회귀 가드), 토큰 없음 401, 폐기 토큰 401.
- [ ] **Step 4:** 로컬에서 Claude Code로 실측 — 임시 저장소에 `.mcp.json`을 놓고 `claude`를 열어 `/mcp`로 `harness` 연결·도구 목록 확인, `project_get` 호출. 커밋 `feat(web): MCP server with agent-scoped tools`

#### Task 1.9: 웹 — 로그인·프로젝트·백로그·보드·결재함

ApcH admin의 화면을 이식한다. 데이터 입력만 md 파서에서 DB 조회로 바뀐다.

| 화면 | 기능 | ApcH 원천 |
| --- | --- | --- |
| `/login` | GitHub OAuth | `apps/admin/src/app/login`, `server/auth/*` |
| `/p/new` | 프로젝트 등록(owner/repo/branch/slug) → **토큰 1회 표시** | 신규 |
| `/p/[slug]` | 보드(날짜 섹션 = `proposedOn` 일자), 여정 스테퍼, 행위자 책상, 미결 현황 | `pages/pipeline/**` |
| `/p/[slug]/inbox` | 결재함: `승인대기`·`검토대기` 카드 + 도장/되돌리기/보류/폐기, `보류` 카드 + 재개 | `features/transition-pipeline-gate/**` |
| `/p/[slug]/backlog` | 항목 추가·편집(key·title·area·source, 관측/진단 분리 도움말), 제거된 항목 보기 | 신규(`TASK_BACKLOG.md` 머리말이 도움말) |
| `/p/[slug]/items/[key]` | 행 상세: 이벤트 타임라인, 계획서·보고 링크(GitHub blob URL), `검증:` | `pipeline/docs/**`의 링크 부분 |

- [ ] **Step 1: 게이트 서버 액션** — `features/gate/api/transition.ts`: `requireMember(projectId)` → `board.transition(projectId, {key, to}, "human", userId)` / `board.discard`. 화면이 읽은 `updatedAt`을 함께 보내 stale 거부(ApcH `commit-gate-transition.ts`의 sha 대조 대응).
- [ ] **Step 2: 화면 이식** — `journey.ts`·`briefing.ts`·`journey-stepper.tsx`·`pixel-office.tsx`·`agent-avatar.tsx`를 복사하고 `BoardItem` 타입을 DB 행 형태(`{key, agent, status, reason, results, validation}`)로 어댑트. 테스트(`journey.test.mjs`·`briefing.test.mjs`)도 가져와 통과시킨다.
- [ ] **Step 3: 백로그 폼** — `checkText`로 150자는 강제하지 않는다(백로그는 자유 길이). key 형식 `^[A-Z]+-\d+$`, 프로젝트 내 유일.
- [ ] **Step 4:** `npm run check -w apps/web`·`npm test -w apps/web` PASS → 커밋 `feat(web): login, project registration, board, inbox, backlog`

#### Task 1.10: 플러그인 — 템플릿·생성기·init 스킬

**템플릿(Task 1.6 v1 절차 그대로 + §9 수단 치환):** ApcH `de25a1c` 원본 복사 → 파라미터화 → 실증 산문은 `docs/rationale.md`로 → 파일 동작을 §9 표대로 MCP 도구로 치환 → `tools:` 줄을 역할별 허용 도구로. 골든 diff(ApcH 세 workspace 렌더 vs 원본)의 잔차는 (i) 유래 이동 (ii) knowledge 이동 (iii) 변수 형식 (iv) **수단 치환** 넷뿐이어야 한다.

**생성기 `plugin/bin/harness-init.mjs`** — v1과의 차이: 보드·백로그·원장·스크립트를 만들지 않고, `.mcp.json`을 **병합**한다.

- [ ] **Step 1: 테스트**

```js
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const BIN = fileURLToPath(new URL("./harness-init.mjs", import.meta.url));
const APCH = readFileSync(new URL("../../examples/apch/harness.json", import.meta.url), "utf8");
const run = (root, ...args) => {
  try { return { code: 0, out: execFileSync("node", [BIN, "--root", root, "--server", "https://h.example", ...args], { encoding: "utf8" }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; }
};
const fresh = (cfg = APCH) => { const root = mkdtempSync(join(tmpdir(), "harness-")); writeFileSync(join(root, "harness.json"), cfg); return root; };

describe("harness-init (v2)", () => {
  it("materializes agents, docs, runbook, .mcp.json, lock — and no state files", () => {
    const root = fresh();
    const r = run(root);
    assert.equal(r.code, 0, r.out);
    for (const p of ["CLAUDE.md", ".mcp.json", "harness.lock.json", "docs/plans/README.md", "docs/plans/template.md", "docs/plans/verification-paths.md",
      "docs/agents/README.md", ".claude/agents/pm.md", ".claude/agents/plan-verifier.md", ".claude/agents/doc-auditor.md", ".claude/agents/feature-scout.md",
      ".claude/agents/web-dev.md", ".claude/agents/admin-dev.md", ".claude/agents/backend-dev.md"]) assert.ok(existsSync(join(root, p)), `missing ${p}`);
    for (const p of ["PROJECT_BOARD.md", "TASK_BACKLOG.md", "docs/release-checks.md", "scripts"]) assert.ok(!existsSync(join(root, p)), `unexpected ${p}`);
    const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers.harness.url, "https://h.example/api/mcp");
    assert.equal(mcp.mcpServers.harness.headers.Authorization, "Bearer ${HARNESS_TOKEN}");
    assert.doesNotMatch(readFileSync(join(root, ".claude/agents/backend-dev.md"), "utf8"), /\{\{/);
    const lock = JSON.parse(readFileSync(join(root, "harness.lock.json"), "utf8"));
    assert.equal(lock.version, 1);
    assert.ok(!(".mcp.json" in lock.files) && !("CLAUDE.md" in lock.files)); // 병합 파일은 잠그지 않는다
  });
  it("merges .mcp.json, preserving other servers", () => {
    const root = fresh();
    writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { notion: { url: "https://mcp.notion.com/mcp" } } }));
    assert.equal(run(root).code, 0);
    const mcp = JSON.parse(readFileSync(join(root, ".mcp.json"), "utf8"));
    assert.equal(mcp.mcpServers.notion.url, "https://mcp.notion.com/mcp");
    assert.equal(mcp.mcpServers.harness.url, "https://h.example/api/mcp");
  });
  it("second run: unchanged files rewritten, user-edited file skipped", () => {
    const root = fresh();
    assert.equal(run(root).code, 0);
    writeFileSync(join(root, ".claude/agents/pm.md"), "edited by user\n");
    const r = run(root);
    assert.equal(r.code, 0);
    assert.match(r.out, /skip\(modified\): \.claude\/agents\/pm\.md/);
    assert.equal(readFileSync(join(root, ".claude/agents/pm.md"), "utf8"), "edited by user\n");
  });
  it("refuses unknown existing generated-path files without --adopt; adopt replaces", () => {
    const root = fresh();
    mkdirSync(join(root, "docs/agents"), { recursive: true });
    writeFileSync(join(root, "docs/agents/README.md"), "theirs\n");
    const r = run(root);
    assert.equal(r.code, 3);
    assert.match(r.out, /refuse: docs\/agents\/README\.md/);
    assert.ok(!existsSync(join(root, "harness.lock.json")));
    assert.equal(run(root, "--adopt").code, 0);
    assert.notEqual(readFileSync(join(root, "docs/agents/README.md"), "utf8"), "theirs\n");
  });
  it("omits feature-scout when config has no scout", () => {
    const root = fresh(JSON.stringify({ version: 1, project: { owner: "o", repo: "r", branch: "main" }, workspaces: [{ id: "app", path: ".", agent: "dev", verify: ["npm test"] }] }));
    assert.equal(run(root).code, 0);
    assert.ok(!existsSync(join(root, ".claude/agents/feature-scout.md")));
    assert.ok(existsSync(join(root, ".claude/agents/dev.md")));
  });
  it("exit 1 with the field path on bad config", () => {
    const root = fresh(JSON.stringify({ version: 2 }));
    const r = run(root); assert.equal(r.code, 1); assert.match(r.out, /version/);
  });
});
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현**

```js
#!/usr/bin/env node
// harness.json을 읽어 에이전트 정의·규약 문서·런북 절·.mcp.json을 사용자 저장소에 물질화한다. 보드·백로그는 서비스 DB에 있으므로 만들지 않는다.
// 사용: node harness-init.mjs [--config harness.json] [--root .] [--server <url>] [--adopt] [--dry-run]
// 종료코드: 0 완료 · 1 설정 오류 · 3 refuse(기존 파일과 충돌, 아무것도 쓰지 않음)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHarnessConfig } from "../lib/config.mjs";
import { buildLock, planWrites } from "../lib/manifest.mjs";
import { renderTemplate } from "../lib/render.mjs";
import { buildVars, buildWorkspaceVars } from "../lib/vars.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = opt("--root", ".");
const CONFIG = join(ROOT, opt("--config", "harness.json"));
const SERVER = (opt("--server", process.env.HARNESS_SERVER) ?? "https://harness.a-pch.com").replace(/\/$/, "");
const ADOPT = args.includes("--adopt");
const DRY = args.includes("--dry-run");
const TPL = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
const RUNBOOK_START = "<!-- harness:runbook:start -->", RUNBOOK_END = "<!-- harness:runbook:end -->";

let config;
try { config = parseHarnessConfig(readFileSync(CONFIG, "utf8")); }
catch (e) { console.log(`설정 오류: ${e.message}`); process.exit(1); }

const lang = config.language;
const tpl = (rel) => readFileSync(join(TPL, rel), "utf8");
const vars = buildVars(config);
const targets = {};
const add = (path, template, content) => { targets[path] = { template, content }; };

for (const d of ["plans/README.md", "plans/template.md", "plans/verification-paths.md", "agents/README.md"])
  add(`docs/${d}`, `${lang}/docs/${d}`, renderTemplate(tpl(`${lang}/docs/${d}`), vars));
for (const a of ["pm", "plan-verifier", "doc-auditor"])
  add(`.claude/agents/${a}.md`, `${lang}/agents/${a}.md`, renderTemplate(tpl(`${lang}/agents/${a}.md`), vars));
if (config.scout) add(".claude/agents/feature-scout.md", `${lang}/agents/feature-scout.md`, renderTemplate(tpl(`${lang}/agents/feature-scout.md`), vars));
for (const ws of config.workspaces)
  add(`.claude/agents/${ws.agent}.md`, `${lang}/agents/dev.md`, renderTemplate(tpl(`${lang}/agents/dev.md`), buildWorkspaceVars(config, ws)));

const existing = {};
for (const p of Object.keys(targets)) existing[p] = existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null;
const lockPath = join(ROOT, "harness.lock.json");
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, "utf8")) : null;
const plan = planWrites({ targets, existing, lock, adopt: ADOPT });

for (const p of plan.refuse) console.log(`refuse: ${p}`);
for (const p of plan.skipModified) console.log(`skip(modified): ${p}`);
if (plan.refuse.length) { console.log("기존 파일과 충돌 — --adopt로 받아들이거나 파일을 치운 뒤 다시 실행"); process.exit(3); }

const write = (p, content) => { if (DRY) return; mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), content); };
for (const p of plan.write) { console.log(`write: ${p}`); write(p, targets[p].content); }

// 런북: 마커 사이 절만 우리 것. 병합 파일이라 lock에 넣지 않는다.
const runbookBlock = `${RUNBOOK_START}\n${renderTemplate(tpl(`${lang}/CLAUDE.runbook.md`), vars)}\n${RUNBOOK_END}`;
const runbookPath = join(ROOT, "CLAUDE.md");
let runbook = existsSync(runbookPath) ? readFileSync(runbookPath, "utf8") : "";
const s = runbook.indexOf(RUNBOOK_START), e = runbook.indexOf(RUNBOOK_END);
runbook = s >= 0 && e > s ? runbook.slice(0, s) + runbookBlock + runbook.slice(e + RUNBOOK_END.length)
                          : (runbook ? runbook.replace(/\s*$/, "\n\n") : "") + runbookBlock + "\n";
console.log(`write: CLAUDE.md (runbook ${s >= 0 ? "replaced" : "inserted"})`);
write("CLAUDE.md", runbook);

// .mcp.json: harness 서버 항목만 병합 — 사용자의 다른 MCP 서버를 보존한다. 토큰은 환경변수 참조로만.
const mcpPath = join(ROOT, ".mcp.json");
const mcp = existsSync(mcpPath) ? JSON.parse(readFileSync(mcpPath, "utf8")) : {};
mcp.mcpServers = { ...(mcp.mcpServers ?? {}), harness: { type: "http", url: `${SERVER}/api/mcp`, headers: { Authorization: "Bearer ${HARNESS_TOKEN}" } } };
console.log(`write: .mcp.json (harness ${existsSync(mcpPath) ? "merged" : "created"})`);
write(".mcp.json", JSON.stringify(mcp, null, 2) + "\n");

const nextLock = buildLock(Object.fromEntries(plan.write.map((p) => [p, targets[p]])));
for (const p of plan.skipModified) nextLock.files[p] = lock.files[p];
write("harness.lock.json", JSON.stringify(nextLock, null, 2) + "\n");
console.log(`done: write ${plan.write.length} · skip ${plan.skipModified.length}`);
```

- [ ] **Step 4: 통과** — `npm run sync:plugin-lib && node --test plugin/bin/harness-init.test.mjs` → PASS 6. 미정의 변수 오류면 템플릿으로.
- [ ] **Step 5: `plugin/skills/harness-init/SKILL.md`**

```markdown
---
name: harness-init
description: 이 저장소를 하니스 서비스에 연결한다 — harness.json 인터뷰, 에이전트·규약·.mcp.json 생성, project_sync. 사용자가 "하니스 연결", "/harness:init"라고 할 때.
---

# harness-init

전제: 사용자가 웹에서 프로젝트를 등록하고 토큰을 받았다. 토큰은 `HARNESS_TOKEN` 환경변수에 있어야 한다(`test -n "$HARNESS_TOKEN"` — 없으면 웹 `/p/<slug>/tokens`에서 발급하라고 안내하고 멈춘다).

1. `harness.json`이 없으면 **하나씩** 묻고 쓴다: 저장소 `owner/repo`·브랜치(`git remote -v`·`git branch --show-current`로 추정해 확인만), 워크스페이스(경로·`<이름>-dev`·검증 명령 — `package.json` scripts·러너를 읽어 후보 제시), 지식 문서 경로, `scout.question`(선택).
2. `node "$CLAUDE_PLUGIN_ROOT/bin/harness-init.mjs" --dry-run`으로 쓸 파일을 보여주고 확인받는다. `refuse:`가 있으면 `--adopt` 여부를 묻는다.
3. 실제 실행. 출력의 `write:`·`skip(modified):`를 그대로 보고한다.
4. `.mcp.json`이 생겼으니 사용자에게 **Claude Code를 재시작**하라고 안내하고, 재시작 후 `mcp__harness__project_get`이 되는지 확인한다.
5. `mcp__harness__project_sync`에 `harness.json.workspaces`를 그대로 넘긴다 — 웹 보드의 roster가 이걸로 생긴다.
6. 생성된 `.claude/agents/<ws>-dev.md`의 지식 문서가 실재하는지 확인. 없으면 초안(구조·명령·함정)을 사용자와 만든다.
7. `git status`를 보여주고 커밋은 사용자에게 맡긴다. 권장: `chore: connect to harness`.

하지 않는 것: 백로그 항목 만들기(웹에서), 게이트 전이, 커밋, 토큰 값 출력.
```

- [ ] **Step 6: 커밋** `feat(plugin): templates (MCP-based agents), harness-init, /harness:init`

#### Task 1.11: 빈 저장소 실측 — Phase 1 완료 기준

- [ ] **Step 1:** 서비스를 로컬(`npm run dev -w apps/web`) 또는 Vercel preview에 띄운다. 웹에서 GitHub 로그인 → `harness-smoke` 프로젝트 등록 → 토큰 발급.
- [ ] **Step 2:** 빈 저장소 `harness-smoke`에 로컬 marketplace로 플러그인 설치 → `HARNESS_TOKEN` 설정 → `/harness:init`(워크스페이스 1개 `.`, 검증 `node --test`) → 재시작 → `project_get` 확인.
- [ ] **Step 3:** 웹 백로그에 `FEAT-01: README에 설치 방법 한 절 추가` 등록.
- [ ] **Step 4: 사이클 1회** — 런북대로: `pm` 디스패치(`board_propose` → 웹에 `승인대기`) → **웹 결재함 도장 `계획지시`** → `dev` 디스패치(계획서 작성·커밋 → `plan_submit` → `검토대기`) → 카탈로그 경로 1·3 수동 → `plan-verifier` 무편집 무소득 → `validation_record` → **웹 도장 `구현승인`** → `dev` 구현·검증·`report_submit`·`완료` → 인수 다섯 조건 재현 → `doc-auditor`.
- [ ] **Step 5: 완료 기준** — 웹에 `완료`·`검증:`·이벤트 타임라인 8건 이상; 저장소에 `docs/plans/FEAT-01.md`·`docs/agents/dev/FEAT-01.md`·`docs/agents/main-loop/FEAT-01.md`; 백로그에서 FEAT-01이 제거됨(`removedAt`); **에이전트가 게이트를 시도하면 도구가 없어 실패**하는 것을 한 번 일부러 확인; `git status` 청결.
- [ ] **Step 6:** 실측 로그를 `docs/rationale.md` 「첫 스모크」에 기록·커밋.

### Phase 2 — ApcH 첫 테넌트 (착수 시 별도 계획서)

| # | 태스크 | 완료 기준 |
| --- | --- | --- |
| 2.1 | `scripts/import-apch.mjs` — `board-md.mjs`·`backlog-md.mjs`로 ApcH `PROJECT_BOARD.md`·`TASK_BACKLOG.md`를 읽어 `BacklogItem`·`BoardItem`(날짜 섹션→`proposedOn`, `결과:` 누적→`results[]`, `검증:`→`validation`)·`TransitionEvent`(status당 1건, `note: "imported"`)로 적재. 완료 항목은 `removedAt` | 임포트 후 웹 보드가 ApcH 대시보드와 **항목·status·검증 칩이 1:1** |
| 2.2 | ApcH 브랜치 `harness-connect`에서 `harness.json`(§6) 배치 → `harness-init --adopt` → `project_sync` | `write:`가 `.claude/agents/*`·`docs/*` 규약·런북 절·`.mcp.json`뿐 |
| 2.3 | 생성 dev 정의 vs 원본 diff — 잔차 넷(유래·knowledge·형식·수단)뿐 | `docs/rationale.md`에 diff |
| 2.4 | FEAT-28을 서비스 위에서 전 구간 완주(게이트는 웹에서) | 인수 다섯 조건 |
| 2.5 | ApcH에서 `PROJECT_BOARD.md`·`TASK_BACKLOG.md` **동결** — 파일은 남기되 머리말에 "2026-xx-xx부터 진실은 harness 서비스"라고 적고 이후 편집 금지. `apps/admin` `/pipeline`·게이트·명령 코드 제거 PR. `pipeline-command` 루틴 비활성화 | doc-auditor 어긋남 0, ApcH admin에 analytics·observability만 |
| 2.6 | `release-verify` 루틴은 Phase 3까지 **그대로 둔다**(원장 md·스크립트 경로 불변) | 루틴 정상 |

### Phase 3 — 원격·자동화 (착수 시 별도 계획서)

| # | 태스크 |
| --- | --- |
| 3.1 | 명령 원장: 웹 실행 버튼 → `Command` 생성(본문은 roster에서 — ApcH `commands.ts` 이식). MCP `command_next`/`ack`/`done` |
| 3.2 | 루틴 실행기: `/harness:setup-routines` — 사용자 계정에 `pipeline-command` 루틴 생성(지침: "`command_next`로 명령을 받아 런북대로 처리하고 `command_done`"). 트리거는 둘 중 실측으로 택일: (a) cron 1h 폴링(최소 간격) (b) 웹이 사용자 저장소 이슈에 코멘트 → webhook(GitHub App 쓰기 필요). 클라우드 환경 허용 도메인에 서비스 호스트 추가는 사용자 몫 |
| 3.3 | 배포 확인 원장 → `ReleaseCheck` 테이블(항목·줄·`autoTag`·상태·증거). 완료 인수 시 웹에서 등재. `scripts/release-verify/run.mjs`를 REST(`release_list`/`release_close`) 버전으로 — `ledger.mjs`의 `parseTag`·`evaluateCheck`는 그대로, `parseLedger`/`applyResults`만 REST로 대체. ApcH `docs/release-checks.md`의 열린 줄 임포트 |
| 3.4 | `/harness:verify-plan` + `bin/verify-plan.mjs` — ApcH FEAT-27 요구 그대로(deterministic 경로만 스크립트, 증거 출력, negative fixture) |
| 3.5 | 왕복 검증 ①②③ — 읽기 명령 → 보드 쓰기 명령 → 웹 버튼 경유. ②를 보기 전엔 "된다"고 적지 않는다 |

### Phase 4 — 구독·공개 (착수 시 별도 계획서)

| # | 태스크 |
| --- | --- |
| 4.1a | **구독 모델만**(이 단계에서 완료): `Subscription` 테이블 + **수동 부여**(스크립트). 결제 경로 없음 — 화면에 결제 버튼·링크가 없다. 상한과 본문 보호는 결제 없이도 완성된다 |
| 4.1b | **Polar 결제**(이후 별도 제안서): Polar 상품 + 웹훅 → `Subscription` 갱신. ApcH `apps/web` 웹훅 핸들러·서명 검증 이식. 가격은 상품과 함께 정한다 |
| 4.2 | **권한 게이트**: 프로젝트 생성·백로그 추가·`project_sync`에 상한 검사, **상한 초과 프로젝트 잠금**, 결재함 잠금 칩·목록 배지·레이아웃 배너. 데이터는 하나도 지우지 않는다(플랜을 올리면 그대로 열린다). Free가 영구라 "미구독" 상태는 없다 — 잠김의 사유는 상한 초과다. **잠금은 MCP 인증이 아니라 도구 층에서 건다**: `mcp-handler 2.1.1`의 `withMcpAuth`는 `verifyToken`의 거부 사유를 응답에 실을 수 없어(2026-09-04 실측) 인증에서 막으면 에이전트가 이유를 알 길이 없다. 그래서 인증은 통과시키고 상태를 바꾸는 도구를 사유와 함께 거부하며, `project_get`은 잠긴 프로젝트에서도 `{locked, reason}`을 답한다 |
| 4.3 | 팀: 멤버 초대·역할(owner/member) — 게이트는 owner만(불변식 4의 "누가") |
| 4.4 | GitHub App(비공개 저장소의 계획서·기록 본문 읽기), 토큰 폐기·재발급 UI |
| 4.5 | 플러그인 marketplace 저장소(공개), README·온보딩 문서(가입 → 프로젝트 등록 → `/harness:init` → 첫 사이클) |
| 4.6 | 외부 사용자 1명 유료 온보딩 관측 — 결제부터 첫 `완료`까지 |

## 11. 검증 계획

- **순수 모듈:** `npm test` — `transitions`(7)·`backlog-md`(2)·`board-md`(ApcH 원본 케이스)·`config`(11)·`render`(4)·`manifest`(5)·`vars`(3)·`token`(2)·`harness-init`(6).
- **서비스:** `npm test -w apps/web` — `board.test.mjs`(전이 서비스, DB 모듈 mock), `route.test.mjs`(**등록 도구 집합 = §5 에이전트 스코프, 게이트 도구 부재**), 이식한 `journey`·`briefing` 테스트. `npm run check -w apps/web`.
- **템플릿:** 미치환 검사 + 골든 diff(잔차 넷) — 스냅샷 테스트로 `npm test`에 편입.
- **통합:** Phase 1 = 빈 저장소 사이클(Task 1.11), Phase 2 = ApcH 임포트 1:1 + FEAT-28, Phase 3 = 왕복 ①②③.
- **사전 검증(2026-08-29, 이 문서 작성 시):** v1에서 검증한 `config`·`render`·`manifest`·`vars`·`board-md` 32/32는 v2에서도 바이트 동일. v2에서 새로 쓴 `transitions`·`backlog-md`·`token`·`harness-init(v2)`는 아래 「사전 검증 결과」 참조.

## 12. 사용자 결정 대기

| # | 질문 | 기본값 |
| --- | --- | --- |
| Q1 | 저장소 이름·공개 여부·서비스 도메인 | `Sangeok/harness`, 비공개, `harness.a-pch.com` |
| Q2 | DB 공급자 | Neon(ApcH와 동일) |
| Q3 | Phase 2에서 ApcH 보드·백로그 md를 동결할지, 삭제할지 | 동결(머리말에 이관 문구) |
| Q4 | ApcH 백로그 FEAT-27 이관 표기(백로그 편집은 승인 필요) | `source`에 "→ harness Phase 3.4" 한 줄 |
| Q5 | 언어 ko만 | 예 |
| Q6 | 루틴 트리거(Phase 3) — cron 폴링 vs 이슈 코멘트 webhook | Phase 3 계획서에서 실측 후 |
| Q7 | 과금 단위·플랜(§2.1) — 사용자당 월 구독 | **확정(2026-09-03)**: Free / Pro / Max, 상한 5축(§2.1 표). "Team"은 폐기 — 멤버는 4.3의 기능이지 플랜 축이 아니다. 가격·결제는 Polar 상품과 함께 이후 제안서 |
| Q8 | 플러그인 저장소 공개 여부 | **부분 공개(2026-09-03 정정)**: 생성기·스킬·스텁은 공개, **에이전트 단계 본문은 비공개**(private 저장소 + DB 배포). 본문까지 공개하면 로컬 파일 파이프라인이 그대로 선다 |

## 13. 리스크·미확인·롤백

| 항목 | 상태 | 대응 |
| --- | --- | --- |
| `mcp-handler` API(`withMcpAuth`·`authInfo` 전달) | 미확인 | Task 0.2 Step 3에서 context7로 확인 후 Task 1.8 코드 조정 |
| 서브에이전트 `tools:`에 MCP 도구명(`mcp__harness__*`) 지정이 기대대로 제한하는가 | 미확인 | Task 1.11 Step 5에서 "게이트 시도 실패"를 일부러 확인 |
| 클라우드 루틴에서 원격 MCP + 토큰 | 미확인 | Phase 3. `local`이 먼저 |
| 에이전트를 MCP 호출로 재작성해도 파이프라인 품질 유지 | 미검증 | Phase 1 스모크 + Phase 2 FEAT-28 완주가 답 |
| 서비스 가용성이 파이프라인의 의존점 | 설계상 수용 | SaaS의 책임. 장애 시 에이전트는 실패를 보고하고 멈춘다(상태를 지어내지 않는다) |
| 사용자 데이터 보관 | 설계상 수용 | 토큰은 해시만, 프로젝트별 격리, 삭제 = cascade |
| 템플릿에서 규칙 유실·완화 | 품질 리스크 | 골든 diff + 스냅샷 |
| Windows 경로·CRLF | 반복 실측 | 생성기는 LF |

**롤백:** Phase 0~1은 새 저장소 안. Phase 2는 ApcH 브랜치 — PR 전 `git checkout`, 임포트는 프로젝트 삭제(cascade)로 되돌림. ApcH admin 제거 PR은 revert.

## 14. ApcH 쪽에서 할 일 (전부 사용자 승인 후)

1. Q3·Q4 결정을 `TASK_BACKLOG.md`(FEAT-27)·`CLAUDE.md` 운영 규칙에 한 줄씩.
2. Phase 2: `harness-connect` 브랜치 — `harness.json` 배치, adopt, FEAT-28 완주, md 동결, admin `/pipeline` 제거, `pipeline-command` 루틴 비활성화.
3. Phase 3: `release-verify` 루틴을 REST 버전으로 교체, `docs/release-checks.md` 임포트·동결.

그 전까지 ApcH는 지금 하니스로 FEAT-28·FEAT-01을 계속 처리한다.

## 사전 검증 결과 (2026-08-29)

이 문서의 `js`·`json` 블록(v2 10+1개)과 v1 백업의 `config`·`render`·`manifest`·`vars` 블록을 스크래치패드로 기계 추출해 그대로 실행했다(메인 루프, Node 22.13.1).

| 대상 | 결과 |
| --- | --- |
| `packages/core` — `transitions`(7)·`backlog-md`(2)·`board-md`(ApcH `board.test.mjs` 원본, import만 교체)·`config`(11, Task 1.4의 executor 단언 수정 적용)·`render`(4)·`manifest`(5)·`vars`(3)·`token`(2) | **43/43** |
| `scripts/sync-plugin-lib.mjs` | `plugin/lib/`에 8모듈 복사 |
| `plugin/bin/harness-init.mjs` — `node --check` + Task 1.10 테스트(변수만 넣은 스텁 템플릿) | **6/6** — 에이전트·규약·런북·`.mcp.json` 병합(기존 `notion` 서버 보존 확인)·lock; 보드·백로그·원장 미생성 |
| 합계 | **49/49, 실패 0** |

미검증: 실제 템플릿(Task 1.10 템플릿 작업), Prisma 스키마 마이그레이션, 전이 서비스(Task 1.7), MCP 라우트(Task 1.8 — `mcp-handler` 시그니처 확인 선행), 웹 화면. Task 1.4의 config 테스트 첫 케이스는 v1 그대로 돌리면 예시의 `executor.kind`가 `local`이라 1건 실패한다 — 그래서 그 단언 수정을 태스크 본문에 명시했다.
