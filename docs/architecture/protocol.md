# 프로토콜 — 도구 계약과 보드 규약

에이전트가 서비스에 말을 거는 방법(MCP 도구)과 보드 항목이 지켜야 하는 기록 규약을
한곳에 둔다. 왜 이래야 하는지는 [invariants.md](./invariants.md), 어디서 왔는지는
[sources.md](./sources.md)에 있다.

## 템플릿 다운로드 — `GET /api/templates`

`/harness:init`은 `Authorization: Bearer <토큰>`과 `lang` 쿼리(생략 시 `en`)로 템플릿을 요청한다.
서버는 토큰 인증 → **프로젝트 확정** → 프로젝트 접근 확인 → 언어별 템플릿 조회 순으로 처리한다.
인증이나 접근 확인에 실패하면 템플릿을 조회하지 않는다.

**토큰 두 종류를 받는다.** 에이전트 토큰(`hs_`)은 프로젝트를 스스로 알고 있어 쿼리 인자가 필요 없다 —
보내도 무시된다. 사용자 토큰(`hu_`)은 사람에게만 묶이므로 `?project=<slug>`가 **필수**이고, 서버는
호출마다 그 슬러그가 호출자 소유인지 확인한다(`ownerUserId` 일치). 소유자 토큰(`ho_`)은 여기서도 거부한다.

| 상태 | 의미 |
| --- | --- |
| `200` | `{ templates, entitlement: { plan, agents } }`. 에이전트는 스텁, 보고 에이전트·런북은 플랜에 맞춰 제공 |
| `401` | 토큰 누락·형식 오류·미등록·폐기. 소유자 토큰도 허용하지 않음. **`hu_`인데 `?project=`가 없으면 여기다** — `project required: add project.slug to harness.json (rerun /harness:init once to write it)` |
| `403` | 인증은 성공했지만 프로젝트가 선택되지 않았거나 소유권이 불완전함. 응답의 `error`에 사유 보존. **`hu_`가 남의 슬러그를 가리키면 `not the owner of this project`** — 없는 슬러그도 같은 문장이다 |
| `404` | 요청한 언어의 템플릿이 없음 |

위 4xx 응답은 `{ error: string }`이다. MCP 도구의 `isError` 응답과 별개의 HTTP 계약이다.

## 프로젝트 정체 — `GET /api/project`

`/harness:init`이 `harness.json` 초안의 `project` 블록을 채울 때 `Authorization: Bearer <에이전트 토큰>`으로
요청한다. 서버는 토큰 인증 → 프로젝트 접근 확인 → 정체 조회 순으로 처리한다. 인증이나 접근 확인에
실패하면 프로젝트를 조회하지 않는다.

**토큰 종류에 따라 이 경로의 뜻이 뒤집힌다.** `hs_`는 쿼리 인자 없이 "이 토큰은 어느 프로젝트냐"를 묻고,
`hu_`는 `?project=<slug>`로 "이 프로젝트를 확인해 달라"를 묻는다. 첫 연결에는 `harness.json`이 없어
슬러그도 없다 — 그 경로는 `git remote` 기반 조회·등록이 채운다.

**예전에 여기 있던 보안 속성은 의도적으로 제거됐다.** `projectId`가 토큰에서만 나오던 동안에는
다른 프로젝트를 가리킬 **입력 자체가 없었다**. 이제 입력이 있고, 그 자리를 호출마다의 `ownerUserId`
일치 검사가 대신한다 — 구조적 불가능에서 검사로 내려온 것이다(`gate_approve`가 이미 쓰는 판정과 같다).

| 상태 | 의미 |
| --- | --- |
| `200` | `{ project: { owner, repo, branch, name, slug } }`. `slug`는 `harness.json`의 `project.slug`가 되어 이후 `hu_` 호출이 프로젝트를 지목하는 데 쓴다. **`language`는 담지 않는다** — 그 값을 `harness.json`으로 옮기면 템플릿 요청이 없는 언어를 물어 404가 된다 |
| `401` | 토큰 누락·형식 오류·미등록·폐기. 소유자 토큰도 허용하지 않음. **`hu_`인데 `?project=`가 없으면 여기다**(`project required: …`) |
| `403` | 인증은 성공했지만 프로젝트가 선택되지 않았거나 소유권이 불완전함. 응답의 `error`에 사유 보존 |

언어에 매이지 않으므로 `404`가 없다. 구버전 서버에는 이 경로 자체가 없어 플러그인이 404를 받고,
그때는 사용자에게 `owner`·`repo`·`branch`를 물어 진행한다. 위 4xx 응답은 `{ error: string }`이다.

## 프로젝트 사용 상태

`project_get`은 기존 repository owner 키를 보존하고 `available: true` 또는 `available: false, reason`을
추가한다. ownerUserId/repoOwner/선택·sync 시각은 공개 body에 노출하지 않는다. 소유권 무결성 오류라면
프로젝트 상세 없이 error만 응답한다. selected-out에서 나머지 12개 agent 도구는 domain query 전에 거부한다.

공통 사유: `This project is not selected for use. Open Stagekeeper → Projects and choose “Use this project”.`
토큰 인증은 유지하며 다른 도구나 templates/runbook 접근으로 우회할 수 없다.
`project_sync` 성공은 Workspace/language/lastSyncedAt을 같은 transaction에 저장한다. 거부·실패는 모두 불변이다.
`POST /api/runbook`은 같은 access 이후 12자리 소문자 hex version을 검사한다. 실패 상태는 401/403/400,
성공 body는 `{ ok: true }`다. 이 요청은 lastSyncedAt을 변경하지 않는다. 이 경로에는 쿼리 문자열이 없으므로
`hu_`는 프로젝트를 **본문**으로 준다(`{ version, project }`) — 없으면 401(`project required: …`)이다.

## MCP 도구 계약 — 에이전트 토큰 스코프

서버 이름 `harness`. Claude Code에서 보이는 이름은 `mcp__harness__<tool>`. 도구명은 밑줄(점 금지 — 클라이언트 정규화 회피).

**프로젝트는 토큰이 아니라 인자에서 온다.** 아래 13개 도구 전부가 선택 입력 `project`(슬러그)를 받는다.
`hs_`는 토큰이 프로젝트를 알고 있어 이 값을 보지 않으므로 **기존 호출이 그대로 통한다**. `hu_`는 이 값이
**필수**다 — 없으면 `project required: add project.slug to harness.json (rerun /harness:init once to write it)`,
호출자 소유가 아니면 `not the owner of this project`로 거부한다(없는 슬러그도 같은 문장이다).
판정은 `src/server/mcp/tools.ts`의 `scope()` 한 곳이고, 소유자 서버는 `hu_`를 받지 않는다.

`agent_next`의 호출 한도(`RATE_LIMIT`)는 `hs_`면 토큰당, `hu_`면 **토큰×프로젝트당**이다 —
`hu_` 하나가 여러 프로젝트에 쓰이므로 분모에 프로젝트를 걸지 않으면 오늘의 "프로젝트당 60회/10분"이
사람당으로 조용히 쪼개진다.

| 도구 | 입력 | 효과 | 누가 | Phase |
| --- | --- | --- | --- | --- |
| `project_get` | `{project?}` | 프로젝트·roster·워크스페이스 | 전부 | 1 |
| `project_sync` | `{workspaces[], language?, project?}` (= `harness.json`의 `workspaces`·`language`) | 워크스페이스 upsert(roster 갱신) · `Project.language` 갱신(`agent_next`가 단계를 찾는 언어) | init 스킬 | 1 · 4 |
| `backlog_list` | `{includeRemoved?, project?}` | 백로그 항목 + 최신 보드 status | pm·dev·doc-auditor | 1 |
| `backlog_get` | `{key, project?}` | 항목 1건(`source` 전문) | dev | 1 |
| `board_list` | `{open?, project?}` | 항목별 **최신** 보드 행 | pm·dev·main-loop·plan-verifier | 1 |
| `board_get` | `{key, project?}` | 최신 보드 행 + 전이 이벤트 + 보고. 이벤트에 `channel` 포함(사람 행: web \| session, 나머지 null) | dev·plan-verifier·main-loop | 1 |
| `board_propose` | `{key, agent, reason, project?}` | `proposed` 행 생성. **거부**: 미결 ≥ 2, agent가 roster 밖, reason > 150자, 이미 미결인 key | pm | 1 |
| `board_transition` | `{key, to, result?, project?}` | 에이전트는 planning·implementing에서 on_hold만 요청한다(§ `transitions.mjs`). `result` ≤ 150, 누적. `in_review`는 `plan_submit`으로 전이하며 `done`은 구현 구간 완료 증거를 확인한 pipeline이 기록한다 | dev | 1 |
| `plan_submit` | `{key, path, commit, project?}` | 계획서 위치 기록 — **`planning`·`in_review`에서만**. 검증 라운드가 계획서를 고치면 재호출해 승인 대상 커밋을 갱신한다. **게이트②가 승인하는 것은 이 커밋이다** — 소유자 편집도 커밋·재제출로 기록에 올린다 | dev·main-loop | 1 |
| `report_submit` | `{key, actor, path, commit, runId?, project?}` | 행위자 기록 위치 — **`in_review`·`implementing`·`done`에서만**(검증 라운드·구현 보고·인수 기록). `done`에서 `main-loop`의 보고가 **인수 기록**이다 — 서버가 그 시각을 `BoardItem.acceptedAt`에 적는다 | dev·main-loop | 1 |
| `validation_record` | `{key, text, project?}` | `validation` — **`in_review`일 때만**. 되돌리기 시 서버가 지움. **마지막 `plan_submit` 뒤에 `plan-verifier`의 `verify` ok 원장이 없으면 거부**(`no plan-verifier pass recorded after the last plan_submit — …`) | main-loop | 1 |
| `agent_next` | `{agent, key?, outcome?, note?, entry?, agentRunId?, stepId?, receipt?, project?}` | 에이전트 템플릿의 **다음 단계 하나**(`{step, instruction, receipt:{runId,revision,stepId}, done:false}` / `{done:true}`). 단계 본문은 이 도구로만 나간다 — 파일(`.claude/agents/*.md`)은 스텁이다. **새 run은 `requires`가 맞는 첫 단계로 열린다**(실패 분기 전용 단계는 진입 후보가 아니다) — 그래서 보드 상태로 갈리는 에이전트도 스스로 분기하는 단계를 둘 필요가 없다. 열리는 단계가 하나도 없으면 run을 만들지 않고 거부한다. 보드 상태가 단계의 `requires`와 다르면 **거부**하며 그 단계를 여는 상태를 말한다(``not open: step `implement` opens when the item is `implementing` (now `proposed`)``). `key`가 있으면 그 항목에 배정된 에이전트만 부를 수 있다(``item FEAT-1 belongs to `api-dev`, not `web-dev```). 플랜 밖 에이전트·선택되지 않은 프로젝트도 거부. **`outcome: "handoff"`는 커밋 핸드오프다** — 원장(`AgentRunStep`)에 남기고 같은 단계를 돌려준다(전진·분기·거부 카운트 없음). 재개는 outcome 없는 호출 | 전부 | 4 |
| `pipeline_next` | `{key?, runbook?, project?}` | `key` 있음: 그 항목의 다음 일 하나(`PipelineNext`). 없음: `{head, items}` — `head`는 pm 디스패치 차례인지(`{action:"dispatch", agent:"pm", hint}` 또는 `{action:"none", reason}`), `items`는 열린 항목 각각의 답. 답은 `dispatch` · `wait`(`gate`·`handoff`·`cap`) · `accept` · `done` 여섯 가지다. 읽기 도구이지만 `doc-audit`·`scout` 완료는 보드 쓰기를 지나지 않으므로 이 호출이 지연 전진을 한다. `runbook`(12자리 소문자 hex)이 있으면 key 없는 개요의 `runbook` 필드는 그 판이 현재 템플릿과 다를 때만 실린다. 없거나 모양이 틀리면 마지막 init이 보고한 판(`Project.runbookVersion`)으로 판정한다. 넘겨받은 판은 저장하지 않는다 | main-loop | 2 |
| `command_next` / `command_ack` / `command_done` | — / `{id}` / `{id, summary}` | 명령 원장 멱등 소비 | routine (Phase 3) | 3 |
| `release_list` / `release_close` | — / `{id, outcome, evidence}` | 배포 확인 원장 | release-verify (Phase 3) | 3 |

**에이전트 서버에 등록되지 않은 것:** 게이트 승인(그래프의 어느 게이트든 — 소유자 서버 `harness_owner`의 `gate_approve`에만 있다), 그래프 편집(웹 전용), 되돌리기, 보류(사람), 폐기, 재개, 재열기(`done→…`), 백로그 편집·삭제, 명령 생성, 토큰 발급. 게이트 승인을 뺀 나머지는 소유자 서버에도 없다 — 웹 전용이다.

증거 제출 3종(`plan_submit`·`report_submit`·`validation_record`)은 모두 same-status
`TransitionEvent`(note `plan`·`report`·`validation`, actorId = 호출 토큰)를 남긴다 —
원장 = 감사 로그(불변식 8). `TransitionEvent.channel`은 사람 행에만 `web` | `session`이 실린다(에이전트 행은
null). 클린 사이클의 원장은 정확히 9건이다(제안 · 게이트① · `plan` · `in_review` · `validation` · 게이트② · `report` · `done` · 인수 `report`). `agent_next`의 원장은 따로다 —
`AgentRun`(에이전트·항목별 커서)과 `AgentRunStep`(범위가 확인된 outcome의 수락·거절 감사 기록)이며
`TransitionEvent`에는 남기지 않는다.

## MCP 도구 계약 — 소유자 토큰 스코프

서버 이름 `harness_owner`, 엔드포인트 `/api/mcp/owner` — 에이전트 서버(`/api/mcp`)와 **다른 엔드포인트, 다른
검증기**다. Claude Code에서 보이는 이름은 `mcp__harness_owner__<tool>`. 소유자 토큰(`ho_`)은 프로젝트가 아니라
**사용자**에 묶이고(`OwnerToken.userId`) 이 엔드포인트에서만 받는다 — 에이전트 토큰은 여기서 401, 소유자 토큰은
에이전트 서버에서 401. 에이전트 서버의 등록 집합은 그대로다(`src/server/mcp/tools.test.mjs`의 WEB_ONLY 가드).

| 도구 | 입력 | 효과 | 누가 | Phase |
| --- | --- | --- | --- | --- |
| `gate_approve` | `{key, gate, planCommit?}` | 사람 게이트 전이(actor human, channel session). `→ implementing`은 validation 필수 + `planCommit` 일치. 응답 `{item, next: {action: "dispatch", agent, key, step: 3\|6}}` — 세션은 그 턴에 dev를 디스패치한다 | 소유자 토큰 | 5 |

호출마다 도구 층에서 직접 소유권(ownerUserId) → 사용 가능 여부 → 플랜(`sessionApprovals` — Free는 웹 전용) 순으로 검사한다.
거부 사유(`isError`; `product-copy.md` §12에 같은 문장):
`not the owner of this project` ·
`session approvals are not on the free plan — approve in the Inbox, or upgrade the plan` ·
`not a gate: <id>` · `not waiting at <id> — the item is at <cursor>` ·
`no validation record — a session approves implementation only after plan-verifier's pass is recorded; approve in the Inbox to override` ·
`planCommit required — state the commit you are approving (board_get shows it)` ·
`planCommit mismatch: the board records 3f2a9c1`.
판정은 `src/server/pipeline/board-rules.ts`의 `decideGate` 하나이고 — 웹 Inbox와 세션이 같이 쓴다 — 쓰기는
`board.gate`다: 경계 게이트(`before-plan`·`before-implement`)는 사람 전이(`transitionIn`)가 원장이고, 그 밖의 게이트는
같은 상태의 이벤트(note `gate:<id>`)가 원장이다. actor `human`, actorRef = 사용자, `channel: "session"` — 원장 행은
웹 게이트와 같은 모양에 `channel`만 다르다. 세션 채널은 웹보다 전제가 하나 더 붙는다(`before-implement`의 검증
기록·`planCommit` 일치); 웹 Inbox는 그 전제 없이 승인할 수 있다. 게이트는 런의 커서가 그 자리에 서 있어야 열린다 —
그래프가 그 게이트를 뺐으면 열 게이트 자체가 없다.

## 상태 기계

`packages/core/transitions.mjs`의 `RULES`가 유일한 출처다. 이 표에 없는 전이는 존재하지 않는다.

| from | to | actor | kind | 전제 |
| --- | --- | --- | --- | --- |
| `proposed` | `planning` | human | gate | — |
| `in_review` | `implementing` | human | gate | — |
| `proposed` | `planning` | pipeline | auto | 그래프에 `before-plan` 게이트가 **없을 때만**. 판정은 `pipeline.mjs`의 `advance` |
| `in_review` | `implementing` | pipeline | auto | 그래프에 `before-implement` 게이트가 **없을 때만** |
| `in_review` | `planning` | human | bounce | 검증 기록을 지운다. 선택 `result`(되돌리기 노트 `Sent back: …`) |
| `proposed` | `on_hold` | human | hold | `result` 필수 |
| `in_review` | `on_hold` | human | hold | `result` 필수 |
| `on_hold` | `planning` | human | resume | 검증 기록을 지운다 |
| `on_hold` | `implementing` | human | resume | — |
| `done` | `implementing` | human | reopen | `result` 필수. `acceptedAt`을 지우고 백로그 `removedAt`을 복원한다(상한은 세지 않는다 — 복원이지 추가가 아니다) |
| `done` | `planning` | human | reopen | `result` 필수. 검증 기록도 지운다. 복원은 위와 같다 |
| `planning` | `in_review` | agent | plan | `plan_submit` 선행 |
| `planning` | `on_hold` | agent | hold | `result` 필수 |
| `implementing` | `done` | pipeline | auto | 현재 실행의 구현 구간 완료 · 결합 보고서 · 고정 result 필수 |
| `implementing` | `on_hold` | agent | hold | `result` 필수 |

부수 규칙: 폐기는 `proposed`·`in_review`에서만(행은 남고 `discardedAt`이 찍힌다) ·
미결(`done`·`on_hold`가 아닌 것)이 2건이면 새로 올리지 않는다 · `validation` 기록은
`in_review`에서만, 그리고 마지막 `plan_submit` 뒤 plan-verifier의 `verify` ok 원장이 있어야 · `plan_submit`은 `planning`·`in_review`에서만 · `report_submit`은
`in_review`·`implementing`·`done`에서만 · `reason`·`result`·`validation`은 각 150자(선택 `result`도 같다).

식별자·라벨의 대응은 `CONTEXT.md` 「States」. 한국어 상태명(승인대기 등)은 v1/ApcH 시절
이름이며 이 저장소의 DB·MCP·템플릿에는 없다.

## 파이프라인 그래프

순서의 단일 출처는 `packages/core/pipeline.mjs`와 그 프로젝트의 `PipelineVersion` 행이다. 런북에는 순서가 없다.

- **앵커와 슬롯.** plan·implement·accept는 각각 한 번이며 순서가 고정된다. propose는 선택이며 맨 앞, verify는 선택이며 plan과 implement 사이다. doc-auditor·feature-scout는 앵커 사이에 반복 배치할 수 있다. 첫 생성은 접미가 없고 이후 #2, #3 등을 배정한다. 이동·다른 슬롯 삭제로 기존 ID를 바꾸지 않는다. doc-audit·scout는 기존 별칭이며 편집 정규화는 연결 게이트도 함께 옮긴다. 기본 그래프와 scout opt-in은 보존한다.
- **게이트.** before-<slotId>는 해당 슬롯 앞 간선이다. before-propose는 없다. before-plan과 before-implement만 승인이 상태 전이를 함께 수행한다. 나머지는 same-status 감사 이벤트다. 새 형식의 승인은 읽어 둔 gateEntry(runId, entryId)를 그대로 제출해야 하며 잠긴 현재 회차에서 한 번만 소비된다. 과거 이벤트나 같은 timestamp는 재승인 근거가 아니다.
- **버전과 회차.** 새 PipelineVersion.format은 slots-v1, 기존 행은 null이다. 항목은 시작한 버전에 고정된다. PipelineRun.entryId는 진입·reset마다 새로 생성한다. 기존 행의 nodes/gates를 backfill하지 않는다. 알 수 없는 형식은 거부한다. GET은 버전을 생성하지 않는다.
- **실행 결합.** 새 dispatch 응답의 entry={runId,entryId,slotId}는 PipelineRun을 식별한다. agent_next는 이 entry에 결합하고 응답에 실제 agentRunId와 receipt={runId,revision,stepId}를 준다. 모든 outcome은 응답 receipt를 그대로 제출하며, 결합 실행은 entry도 함께 제출한다. agentRunId·stepId는 선택적 호환 필드이며 제출하면 receipt와 일치해야 한다. 현재 회차·단계·revision이 다르면 쓰기 전에 거부한다. 프로젝트 에이전트는 entry가 있어도 key를 생략한다. 항목 생성 전 PM은 결합 없는 실행이다.
- **완료 증거.** plan_submit은 planning→in_review를 같은 transaction에서 처리한다. verify는 validation_record로 완료한다. implement는 같은 AgentRun의 verify/ok, 결합 Report, 정상 report/ok 종료가 모두 필요하다. hold 보고는 완료가 아니다. 프로젝트 슬롯은 정확한 entry의 닫힌 AgentRun으로 완료한다. 다음 슬롯 진입에서는 이전 슬롯의 사실을 재사용하지 않는다.
- **구간 종료와 인수.** 구현 구간의 마지막 슬롯을 지난 뒤, before-accept를 기다리기 전에 서버가 pipeline:<versionId>로 done을 기록하고 result에 "Implementation span completed."를 추가한다. agent의 done 전이는 없다. accept는 acceptedAt이라는 별도 증거이며 생략할 수 없다. 인수 뒤 슬롯도 계속 진행한다.
- **저장과 상한.** 실제 run 개설은 소유자 User→PipelineRun→AgentRun 순서의 잠금 아래 fresh access·plan·소유자 전체 rolling 30일 수를 확인하고 생성한다. 열린 실행 재개는 계수하지 않는다. 단계 기록과 커서 CAS는 같은 짧은 transaction이고 템플릿·변수 렌더는 밖에서 한다. 실패 CAS는 원장까지 rollback한다. 계획 제출/hold로 닫힌 정확한 실행의 마지막 terminal outcome만 한 번 보충할 수 있다.
- **보고 식별자.** report_submit.runId는 AgentRun ID다. entry.runId와 혼동하지 않는다. 결합 없는 기존 보고도 감사 행으로 남지만 새 형식의 성공 증거는 아니다. 삭제 관계는 PipelineRun→AgentRun cascade, AgentRun→Report 참조 set-null이다.

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

보고서의 제출 당시 인수 여부는 `Report.isAcceptance`에 저장한다. 재개나 이후 인수가 과거 보고서의 종류를 바꾸지 않는다.
기존 main-loop 보고서는 같은 트랜잭션의 report 감사 이벤트로 목적을 복원하며, 복원하지 못한 행은 null이다.

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

에이전트가 커밋 권한이 없어 멈추면 `agent_next({ outcome: "handoff", receipt, note: <준비된 파일 경로> })`를
보내고 멈춘다. 서버는 수락한 `AgentRunStep`과 revision 증가를 함께 저장하고, requires가 여전히 맞으면 같은 단계를 돌려준다 — 전진·분기·refused 증가는 없다. 배너는
열린 run의 **마지막 수락/이전** 원장 행이 handoff면 소유자 차례로 세고, 그 경로를 터미널 줄에 보여 준다. 소유자가
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

## Execution receipts and board writes

Every outcome (ok, blocked, failed, handoff) requires the unchanged receipt from a prior step response. Calls without outcome remain read/resume calls. The server checks project, agent and key before auditing; unknown or foreign run IDs share one error and produce no ledger row.

A successful compare-and-swap on run ID, revision, step and closed state rotates revision and atomically records the accepted outcome and cursor/refusal changes. Standalone/legacy in-scope stale attempts record accepted:false; stale bound slot entries return without a ledger write; they never satisfy verification or drive handoff UI. Legacy accepted:null rows remain evidence. Rate limits use callerTokenId, falling back to the run opener only for legacy rows. All returned step bodies recheck requires.

A board-closed run may accept one final terminal outcome for its matching receipt and existing template step, unless an accepted/legacy terminal outcome already exists there. It changes revision but preserves closedAt. Closed-run responses are done:true with guidance for the next query; handoff and template-removed steps cannot be final terminal evidence.

Board mutations claim id, updatedAt, observed status and discardedAt:null before evidence/event writes. Human callers retain their supplied updatedAt token; agent/pipeline callers use the transaction read. Every write uses max(now, prior updatedAt + 1ms). Any later failure rolls back all earlier writes.

project_sync shares normalized workspace validation with the config parser. It reads the stored roster and validates the union inside a Serializable transaction before upserts. Omitted workspaces remain stored; P2034 returns a retry instruction without partial writes.
