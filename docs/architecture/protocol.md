# 프로토콜 — 도구 계약과 보드 규약

에이전트가 서비스에 말을 거는 방법(MCP 도구)과 보드 항목이 지켜야 하는 기록 규약을
한곳에 둔다. 왜 이래야 하는지는 [invariants.md](./invariants.md), 어디서 왔는지는
[sources.md](./sources.md)에 있다.

## MCP 도구 계약 — 에이전트 토큰 스코프

서버 이름 `harness`. Claude Code에서 보이는 이름은 `mcp__harness__<tool>`. 도구명은 밑줄(점 금지 — 클라이언트 정규화 회피).

| 도구 | 입력 | 효과 | 누가 | Phase |
| --- | --- | --- | --- | --- |
| `project_get` | — | 프로젝트·roster·워크스페이스 | 전부 | 1 |
| `project_sync` | `{workspaces[], language?}` (= `harness.json`의 `workspaces`·`language`) | 워크스페이스 upsert(roster 갱신) · `Project.language` 갱신(`agent_next`가 단계를 찾는 언어) | init 스킬 | 1 · 4 |
| `backlog_list` | `{includeRemoved?}` | 백로그 항목 + 최신 보드 status | pm·dev·doc-auditor | 1 |
| `backlog_get` | `{key}` | 항목 1건(`source` 전문) | dev | 1 |
| `board_list` | `{open?}` | 항목별 **최신** 보드 행 | pm·dev·main-loop·plan-verifier | 1 |
| `board_get` | `{key}` | 최신 보드 행 + 전이 이벤트 + 보고. 이벤트에 `channel` 포함(사람 행: web \| session, 나머지 null) | dev·plan-verifier·main-loop | 1 |
| `board_propose` | `{key, agent, reason}` | `proposed` 행 생성. **거부**: 미결 ≥ 2, agent가 roster 밖, reason > 150자, 이미 미결인 key | pm | 1 |
| `board_transition` | `{key, to, result?}` | 에이전트 허용 전이만(§ `transitions.mjs`). `result` ≤ 150, 누적. `in_review`는 `plan_submit` 선행 필수. `done`은 백로그 항목 자동 제거 | dev | 1 |
| `plan_submit` | `{key, path, commit}` | 계획서 위치 기록 — **`planning`·`in_review`에서만**. 검증 라운드가 계획서를 고치면 재호출해 승인 대상 커밋을 갱신한다. **게이트②가 승인하는 것은 이 커밋이다** — 소유자 편집도 커밋·재제출로 기록에 올린다 | dev·main-loop | 1 |
| `report_submit` | `{key, actor, path, commit}` | 행위자 기록 위치 — **`in_review`·`implementing`·`done`에서만**(검증 라운드·구현 보고·인수 기록). `done`에서 `main-loop`의 보고가 **인수 기록**이다 — 서버가 그 시각을 `BoardItem.acceptedAt`에 적는다 | dev·main-loop | 1 |
| `validation_record` | `{key, text}` | `validation` — **`in_review`일 때만**. 되돌리기 시 서버가 지움. **마지막 `plan_submit` 뒤에 `plan-verifier`의 `verify` ok 원장이 없으면 거부**(`no plan-verifier pass recorded after the last plan_submit — …`) | main-loop | 1 |
| `agent_next` | `{agent, key?, outcome?, note?}` | 에이전트 템플릿의 **다음 단계 하나**(`{step, instruction, done:false}` / `{done:true}`). 단계 본문은 이 도구로만 나간다 — 파일(`.claude/agents/*.md`)은 스텁이다. **새 run은 `requires`가 맞는 첫 단계로 열린다**(실패 분기 전용 단계는 진입 후보가 아니다) — 그래서 보드 상태로 갈리는 에이전트도 스스로 분기하는 단계를 둘 필요가 없다. 열리는 단계가 하나도 없으면 run을 만들지 않고 거부한다. 보드 상태가 단계의 `requires`와 다르면 **거부**하며 그 단계를 여는 상태를 말한다(``not open: step `implement` opens when the item is `implementing` (now `proposed`)``). `key`가 있으면 그 항목에 배정된 에이전트만 부를 수 있다(``item FEAT-1 belongs to `api-dev`, not `web-dev```). 플랜 밖 에이전트·잠긴 프로젝트도 거부. **`outcome: "handoff"`는 커밋 핸드오프다** — 원장(`AgentRunStep`)에 남기고 같은 단계를 돌려준다(전진·분기·거부 카운트 없음). 재개는 outcome 없는 호출 | 전부 | 4 |
| `command_next` / `command_ack` / `command_done` | — / `{id}` / `{id, summary}` | 명령 원장 멱등 소비 | routine (Phase 3) | 3 |
| `release_list` / `release_close` | — / `{id, outcome, evidence}` | 배포 확인 원장 | release-verify (Phase 3) | 3 |

**에이전트 서버에 등록되지 않은 것:** 게이트 승인(`proposed→planning`, `in_review→implementing` — 소유자 서버 `harness_owner`의 `gate_approve`에만 있다), 되돌리기, 보류(사람), 폐기, 재개, 재열기(`done→…`), 백로그 편집·삭제, 명령 생성, 토큰 발급. 게이트 승인을 뺀 나머지는 소유자 서버에도 없다 — 웹 전용이다.

증거 제출 3종(`plan_submit`·`report_submit`·`validation_record`)은 모두 same-status
`TransitionEvent`(note `plan`·`report`·`validation`, actorId = 호출 토큰)를 남긴다 —
원장 = 감사 로그(불변식 8). `TransitionEvent.channel`은 사람 행에만 `web` | `session`이 실린다(에이전트 행은
null). 클린 사이클의 원장은 정확히 8건이다. `agent_next`의 원장은 따로다 —
`AgentRun`(에이전트·항목별 커서)과 `AgentRunStep`(outcome이 실린 호출 전부, 거부 포함)이며
`TransitionEvent`에는 남기지 않는다.

## MCP 도구 계약 — 소유자 토큰 스코프

서버 이름 `harness_owner`, 엔드포인트 `/api/mcp/owner` — 에이전트 서버(`/api/mcp`)와 **다른 엔드포인트, 다른
검증기**다. Claude Code에서 보이는 이름은 `mcp__harness_owner__<tool>`. 소유자 토큰(`ho_`)은 프로젝트가 아니라
**사용자**에 묶이고(`OwnerToken.userId`) 이 엔드포인트에서만 받는다 — 에이전트 토큰은 여기서 401, 소유자 토큰은
에이전트 서버에서 401. 에이전트 서버의 등록 집합은 그대로다(`src/server/mcp/tools.test.mjs`의 WEB_ONLY 가드).

| 도구 | 입력 | 효과 | 누가 | Phase |
| --- | --- | --- | --- | --- |
| `gate_approve` | `{key, to: planning\|implementing, planCommit?}` | 사람 게이트 전이(actor human, channel session). `→ implementing`은 validation 필수 + `planCommit` 일치. 응답 `{item, next: {action: "dispatch", agent, key, step: 3\|6}}` — 세션은 그 턴에 dev를 디스패치한다 | 소유자 토큰 | 5 |

호출마다 도구 층에서 멤버십(`ProjectMember`) → 잠금 → 플랜(`sessionApprovals` — Free는 웹 전용) 순으로 검사한다.
거부 사유(`isError`; `product-copy.md` §12에 같은 문장):
`not a member of this project — the owner token no longer opens gates here; revoke it on the Tokens tab` ·
`session approvals are not on the free plan — approve in the Inbox, or upgrade the plan` ·
`not a gate: in_review → planning — a session opens gates only; send back, hold, reopen, and discard are web only` ·
`no validation record — a session approves implementation only after plan-verifier's pass is recorded; approve in the Inbox to override` ·
`planCommit required — state the commit you are approving (board_get shows it)` ·
`planCommit mismatch: the board records 3f2a9c1`.
판정은 `src/server/pipeline/board-rules.ts`의 `decideSessionGate` 하나이고, 쓰기는 웹 게이트와 같은
`board.transition`(actor `human`, actorRef = 사용자, `channel: "session"`)이다 — 원장 행은 웹 게이트와 같은 모양에
`channel`만 다르다. 세션 채널은 웹보다 전제가 하나 더 붙는다(게이트②의 검증 기록·`planCommit` 일치); 웹 Inbox는
그 전제 없이 승인할 수 있다.

## 상태 기계

`packages/core/transitions.mjs`의 `RULES`가 유일한 출처다. 이 표에 없는 전이는 존재하지 않는다.

| from | to | actor | kind | 전제 |
| --- | --- | --- | --- | --- |
| `proposed` | `planning` | human | gate | — |
| `in_review` | `implementing` | human | gate | — |
| `in_review` | `planning` | human | bounce | 검증 기록을 지운다. 선택 `result`(되돌리기 노트 `Sent back: …`) |
| `proposed` | `on_hold` | human | hold | `result` 필수 |
| `in_review` | `on_hold` | human | hold | `result` 필수 |
| `on_hold` | `planning` | human | resume | 검증 기록을 지운다 |
| `on_hold` | `implementing` | human | resume | — |
| `done` | `implementing` | human | reopen | `result` 필수. `acceptedAt`을 지우고 백로그 `removedAt`을 복원한다(상한은 세지 않는다 — 복원이지 추가가 아니다) |
| `done` | `planning` | human | reopen | `result` 필수. 검증 기록도 지운다. 복원은 위와 같다 |
| `planning` | `in_review` | agent | plan | `plan_submit` 선행 |
| `planning` | `on_hold` | agent | hold | `result` 필수 |
| `implementing` | `done` | agent | done | `report_submit` 선행 · `result` 필수 |
| `implementing` | `on_hold` | agent | hold | `result` 필수 |

부수 규칙: 폐기는 `proposed`·`in_review`에서만(행은 남고 `discardedAt`이 찍힌다) ·
미결(`done`·`on_hold`가 아닌 것)이 2건이면 새로 올리지 않는다 · `validation` 기록은
`in_review`에서만, 그리고 마지막 `plan_submit` 뒤 plan-verifier의 `verify` ok 원장이 있어야 · `plan_submit`은 `planning`·`in_review`에서만 · `report_submit`은
`in_review`·`implementing`·`done`에서만 · `reason`·`result`·`validation`은 각 150자(선택 `result`도 같다).

식별자·라벨의 대응은 `CONTEXT.md` 「States」. 한국어 상태명(승인대기 등)은 v1/ApcH 시절
이름이며 이 저장소의 DB·MCP·템플릿에는 없다.

## 보드 기록 규약

출처: ApcH `PROJECT_BOARD.md` 안내 블록(`de25a1c`). 그 블록은 v2에서 서버 규칙과
웹 도움말로 나뉘었고, 아래는 **사람이 읽어야 하는 규약** 쪽이다.

### 인수 다섯 조건

`done` 기록은 재현 검증 후에 받아들인다. 다섯 다 에이전트의 보고가 아니라 **직접 본 것**이어야 한다.

1. 변경 파일 목록 ↔ 계획서 「고칠 파일」 — 행위자 기록(`docs/agents/<행위자>/<항목ID>.md`)은
   규약상 같은 커밋에 함께 들어가므로 대조에서 제외한다
2. diff ↔ 계획서 「구현 스케치」
3. 검증 명령 직접 재실행
4. 백로그에서 그 항목이 제거됐는지 확인 — v2에서는 서버가 `removedAt`을 채우므로
   웹 백로그 화면이나 `backlog_list`로 확인한다
5. `결과`가 가리키는 상세 기록(`docs/agents/<행위자>/<항목ID>.md`)의 실재 확인

인수 기록은 `report_submit({ actor: "main-loop" })`으로 서버에 남긴다(`done`에서). 서버는 그 시각을
`BoardItem.acceptedAt`에 적고, 그때까지 항목은 배너에서 소유자 차례로 센다. 다섯 조건은 여전히 사람이
직접 재현하며, 기록은 그 결과를 적은 `docs/agents/main-loop/<항목ID>.md`다. 조건이 하나라도 깨지면
항목 상세에서 되돌린다(reopen, 사유 필수) — 계획이 유효하면 `implementing`, 아니면 `planning`.
`done`은 "dev가 끝났다고 보고했다"이지 인수가 아니다.

### 게이트②가 승인하는 것

기록된 `planCommit`이다. 카드의 **Read the plan ↗**은 그 커밋을 연다. 검증 뒤 소유자가 계획서를
고쳤으면 커밋하고 세션이 `plan_submit`을 재호출해야 승인 대상이 된다 — 기록에 없는 편집은 승인된 것이
아니다. dev는 구현 전에 디스크의 계획서를 `planCommit`과 대조하고(`git diff --quiet <planCommit> --
docs/plans/<항목ID>.md`), 다르면 `blocked`로 멈춘다.

### 커밋 핸드오프

에이전트가 커밋 권한이 없어 멈추면 `agent_next({ outcome: "handoff", note: <준비된 파일 경로> })`를
보내고 멈춘다. 서버는 `AgentRunStep` 한 행만 남기고 같은 단계를 돌려준다 — 전진도 분기도 없다. 배너는
열린 run의 **마지막** 원장 행이 handoff면 소유자 차례로 세고, 그 경로를 터미널 줄에 보여 준다. 소유자가
커밋한 뒤 세션이 outcome 없이 다시 부르면 그 단계가 이어진다. 옛 스텁(outcome 없이 멈추는 것)도 그대로
동작한다 — 서버가 침묵할 뿐 거부하지 않는다.

### `검증:` 줄 형식

```text
검증: 클린 패스 (YYYY-MM-DD, 무편집 N라운드)
```

메인 루프가 **무편집 클린 패스가 나왔을 때만** 쓴다. 결재함이 이 줄의 **존재만으로**
판정하므로(있으면 통과 칩, 없으면 「검증 전」) 클린 패스가 아닌데 쓰면 거짓 통과가 된다.
v2에서는 `validation_record`가 `in_review`에서만 받고, 되돌리기·재개 시 서버가 지운다. 그리고 마지막
`plan_submit` 뒤에 plan-verifier의 `verify` ok 원장이 있어야 받는다 — 검증 뒤 계획서를 고쳐 재제출했으면
그 검증은 옛 문서의 것이다(`report_submit`의 verify 벽과 대칭, `invariants.md`).

### `근거`·`결과`

각 150자 이내 요약이다. 상세는 `docs/agents/<행위자>/<항목ID>.md`에 쓴다.
`근거`는 **행을 만든 주체가 쓰고 이후 바꾸지 않는다** — pm 선정이면 pm, 소유자
직접 발주면 메인 루프. 게이트 결정과 검증 라운드 상세는 보드에 쌓지 않는다.

### `on_hold` 재개

계획부터 다시 쓸 것이면 `planning`으로, 기존 계획으로 이어갈 것이면 `implementing`으로 되돌린다.
화면의 주 버튼은 멈춘 자리(보류 이벤트의 `from`)로 돌아가는 쪽이다.

### 백로그 작성 규칙

출처: ApcH `TASK_BACKLOG.md` 머리말. 웹 백로그 폼 도움말도 같은 규칙을 말한다.

- `area`는 **실제 코드 경로**여야 한다. pm은 코드를 읽지 않고 이 값을 그대로 보드로
  옮기므로, 여기가 틀리면 보드도 틀린다.
- 증거(`source`)에는 **관측**(무엇이 보였나)과 **진단(코드 확정)**(어디가 원인인가)을
  나눠 적는다. 아직 확정하지 못한 것은 「추정」이라고 밝힌다.
- 보드에 올라가는 것만으로는 제거하지 않는다. `done` 전이 시점에 서버가 제거한다.

## 계획서 절 일곱

`docs/plans/<항목ID>.md`. `# <항목ID>: <제목>`은 문서 제목이지 절이 아니다.

1. 현재 동작
2. 문제
3. 고칠 파일
4. 구현 스케치
5. 테스트
6. 범위 밖 의존
7. 대안
